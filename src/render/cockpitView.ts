// The cockpit is drawn in a second pass on top of the world: its own scene
// and camera (at the origin, with a 2 cm near plane so the stick and
// throttle never clip), its own sun with a tight shadow map for crisp
// canopy-bow shadows, and the world's image-based lighting.

import * as THREE from 'three';
import type { Environment } from './environment';
import type { Cockpit } from '../aircraft/models/cockpit';
import type { Aircraft } from '../aircraft/aircraft';
import { loadSettings } from '../core/settings';

/**
 * Sun glare as seen through the canopy: a hot core, a soft veiling bloom and
 * faint six-point diffraction streaks. It lives in the cockpit pass so the
 * canopy bows and frames block it as the jet turns.
 */
function sunGlare(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: { col: { value: new THREE.Color(1, 0.95, 0.85) }, amount: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 col;
      uniform float amount;
      varying vec2 vUv;
      void main() {
        float r = length( vUv );
        float a = atan( vUv.y, vUv.x );
        float core = exp( -r * r * 900.0 ) * 6.0;
        float bloom = exp( -r * r * 60.0 ) * 0.9 + exp( -r * 5.0 ) * 0.12;
        float rays = pow( abs( cos( a * 3.0 ) ), 80.0 ) * exp( -r * 6.0 ) * 0.5 + pow( abs( cos( a * 3.0 + 0.52 ) ), 160.0 ) * exp( -r * 9.0 ) * 0.25;
        float v = ( core + bloom + rays ) * amount * smoothstep( 1.0, 0.7, r );
        gl_FragColor = vec4( col * v, 1.0 );
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.renderOrder = 50;
  m.frustumCulled = false;
  return m;
}

export class CockpitView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.02, 40);
  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private anchor = new THREE.Group();
  private cockpit: Cockpit | null = null;
  private raycaster = new THREE.Raycaster();
  private glare = sunGlare();
  /** 0..1: the sun is in clear view (not below the horizon or behind a mountain) */
  sunVisible = 1;
  private glareAmt = 0;
  /** panel floodlights, warm, for dawn, dusk and night */
  private flood = new THREE.PointLight(0xffd9b0, 0, 1.6, 2);

  constructor() {
    this.scene.add(this.anchor);
    this.scene.add(this.glare);
    this.anchor.add(this.flood);
    this.sun.castShadow = true;
    let q = 'high';
    try {
      q = loadSettings().graphics.quality;
    } catch {
      /* defaults */
    }
    // crisp canopy-bow shadows across the panel (a bigger map on HIGH and ULTRA)
    const sm = q === 'high' || q === 'ultra' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -1.6;
    sc.right = 1.6;
    sc.top = 1.6;
    sc.bottom = -1.6;
    sc.near = 0.1;
    sc.far = 12;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.004;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.camera.rotation.order = 'YXZ';
  }

  get active(): Cockpit | null {
    return this.cockpit;
  }

  attach(c: Cockpit | null): void {
    if (this.cockpit === c) return;
    if (this.cockpit) this.anchor.remove(this.cockpit.root);
    this.cockpit = c;
    if (c) {
      this.anchor.add(c.root);
      // floodlight above the glare shield, in front of the pilot's eyes
      this.flood.position.set(c.eye.x, c.eye.y + 0.22, c.eye.z - 0.3);
    }
  }

  /** Match the world camera, place the cockpit relative to it, copy the lighting. */
  sync(mainCam: THREE.PerspectiveCamera, ac: Aircraft, env: Environment, worldScene: THREE.Scene): void {
    const cam = this.camera;
    cam.position.set(0, 0, 0);
    cam.quaternion.copy(mainCam.quaternion);
    cam.fov = mainCam.fov;
    cam.aspect = mainCam.aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // aircraft body frame relative to the camera (small numbers: no jitter)
    this.anchor.position.set(ac.fm.pos.x - mainCam.position.x, ac.fm.pos.y - mainCam.position.y, ac.fm.pos.z - mainCam.position.z);
    this.anchor.quaternion.copy(ac.fm.quat);
    this.anchor.updateMatrixWorld(true);
    // lighting
    this.sun.color.copy(env.sun.color);
    this.sun.intensity = env.sun.intensity;
    this.sun.target.position.set(0, -0.3, 0);
    this.sun.position.copy(env.sunDir).multiplyScalar(5).add(this.sun.target.position);
    this.sun.target.updateMatrixWorld();
    this.hemi.color.copy(env.hemi.color);
    this.hemi.groundColor.copy(env.hemi.groundColor);
    // a bubble canopy floods the cockpit with skylight
    this.hemi.intensity = env.hemi.intensity * 1.05;
    this.scene.environment = worldScene.environment;
    this.scene.environmentIntensity = worldScene.environmentIntensity * 0.8;
    // low sun: the panel floodlights come on
    const dark = Math.min(1, Math.max(0, (0.22 - env.sunDir.y) / 0.3));
    this.flood.intensity = dark * 0.5;
    // sun glare, blocked by the frames (and fading out below the horizon / behind terrain)
    const up = Math.min(1, Math.max(0, (env.sunDir.y + 0.02) / 0.08));
    const target = up * this.sunVisible;
    this.glareAmt += (target - this.glareAmt) * 0.15;
    const g = this.glare;
    g.visible = this.glareAmt > 0.01;
    if (g.visible) {
      g.position.copy(env.sunDir).multiplyScalar(30);
      g.lookAt(0, 0, 0);
      g.scale.setScalar(22);
      const u = (g.material as THREE.ShaderMaterial).uniforms;
      u.amount.value = this.glareAmt * Math.min(1.4, env.sun.intensity / 3);
      (u.col.value as THREE.Color).copy(env.sun.color).lerp(new THREE.Color(1, 1, 1), 0.35);
    }
  }

  /** Raycast the cockpit's clickable surfaces from normalised device coordinates. */
  pick(ndcX: number, ndcY: number): THREE.Intersection | null {
    const c = this.cockpit;
    if (!c) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects(c.clickables, false);
    return hits[0] ?? null;
  }
}
