// The cockpit is drawn in a second pass on top of the world: its own scene
// and camera (at the origin, with a 2 cm near plane so the stick and
// throttle never clip), its own sun with a tight shadow map for crisp
// canopy-bow shadows, and the world's image-based lighting.

import * as THREE from 'three';
import type { Environment } from './environment';
import type { Cockpit } from '../aircraft/models/cockpit';
import type { Aircraft } from '../aircraft/aircraft';

export class CockpitView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.02, 40);
  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private anchor = new THREE.Group();
  private cockpit: Cockpit | null = null;
  private raycaster = new THREE.Raycaster();

  constructor() {
    this.scene.add(this.anchor);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
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
    if (c) this.anchor.add(c.root);
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
    this.hemi.intensity = env.hemi.intensity * 0.8;
    this.scene.environment = worldScene.environment;
    this.scene.environmentIntensity = worldScene.environmentIntensity * 0.8;
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
