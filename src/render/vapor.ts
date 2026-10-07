// Condensation vapour on a jet, as shaped clouds rather than puffs:
//  - the transonic vapour cone: near Mach 1 in damp low air a shock stands on the
//    fuselage and the air behind it fogs into a bell-shaped shroud, sharp at the
//    front and frayed at the back, from about the canopy to past the wingtips;
//  - wing vapour: in a hard pull (and at high alpha) the low pressure over the
//    wings condenses into sheets of cloud hugging the upper surfaces, streaming aft.
// Both are soft translucent meshes riding with the jet, animated in the shader.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  vV = -mvPosition.xyz;
  vN = normalize( normalMatrix * normal );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const NOISE = /* glsl */ `
float hash3( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float vnoise( vec3 p ) {
  vec3 i = floor( p ); vec3 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( hash3( i ), hash3( i + vec3( 1, 0, 0 ) ), f.x ), mix( hash3( i + vec3( 0, 1, 0 ) ), hash3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( hash3( i + vec3( 0, 0, 1 ) ), hash3( i + vec3( 1, 0, 1 ) ), f.x ), mix( hash3( i + vec3( 0, 1, 1 ) ), hash3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float fbm( vec3 p ) { return 0.5 * vnoise( p ) + 0.3 * vnoise( p * 2.07 ) + 0.2 * vnoise( p * 4.3 ); }
`;

// the cone: uv.x round the body, uv.y from the shock (0) to the frayed back (1)
const CONE_FRAG = /* glsl */ `
uniform float intensity;
uniform float time;
uniform vec3 cLit;
uniform vec3 cShade;
uniform vec3 sunView;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  float ang = vUv.x * 6.2831853;
  vec2 cs = vec2( cos( ang ), sin( ang ) );
  float v = vUv.y;
  // fine streaks running aft, and a slow boil of the whole shroud
  float streak = fbm( vec3( cs * 9.0, v * 2.2 - time * 9.0 ) );
  float boil = fbm( vec3( cs * 2.2, v * 1.3 - time * 2.5 ) );
  // the shock front: a crisp edge that shivers a little
  float front = smoothstep( 0.0, 0.05 + 0.04 * boil, v );
  // the back frays out into ragged tongues
  float back = 1.0 - smoothstep( 0.18, 0.9, v + ( streak - 0.5 ) * 0.6 );
  vec3 n = normalize( vN );
  vec3 e = normalize( vV );
  // seen edge-on the shroud is thicker (it is a shell of cloud)
  float rim = pow( 1.0 - abs( dot( n, e ) ), 1.2 );
  // cloudy, not a clean shell: clumps that come and go
  float clump = smoothstep( 0.3, 0.75, fbm( vec3( cs * 4.0, v * 3.5 - time * 5.0 ) ) );
  float a = intensity * front * back * ( 0.4 + 0.22 * rim ) * ( 0.35 + 0.75 * streak ) * ( 0.45 + 0.8 * clump );
  float lit = 0.55 + 0.45 * max( 0.0, dot( n, sunView ) * sign( dot( n, e ) ) + 0.3 );
  vec3 col = mix( cShade, cLit, clamp( lit, 0.0, 1.0 ) );
  gl_FragColor = vec4( col, clamp( a, 0.0, 0.85 ) );
}
`;

// the wing sheets: uv.x spanwise (root 0 .. tip 1), uv.y chordwise (leading edge 0 .. aft 1)
const WING_FRAG = /* glsl */ `
uniform float intensity;
uniform float time;
uniform float layer;
uniform vec3 cLit;
uniform vec3 cShade;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  float s = vUv.x, c = vUv.y;
  float streak = fbm( vec3( s * 14.0 + layer * 3.1, c * 2.5 - time * 7.0, layer ) );
  float puff = fbm( vec3( s * 4.0 - layer, c * 3.0 - time * 3.0, 2.0 + layer ) );
  // thickest just behind the leading edge, thinning aft and out toward the tip
  float lead = smoothstep( 0.0, 0.12, c ) * ( 1.0 - smoothstep( 0.35, 1.0, c + ( streak - 0.5 ) * 0.5 ) );
  float span = smoothstep( 0.0, 0.08, s ) * ( 1.0 - smoothstep( 0.55, 1.0, s + ( puff - 0.5 ) * 0.35 ) );
  float a = intensity * lead * span * ( 0.35 + 0.8 * streak ) * ( 0.6 + 0.6 * puff ) * ( 1.0 - layer * 0.28 );
  vec3 col = mix( cShade, cLit, 0.55 + 0.45 * puff );
  gl_FragColor = vec4( col, clamp( a, 0.0, 0.8 ) );
}
`;

/** a rough wing planform from the spec: the vapour sheet sits over it */
function planform(ac: Aircraft): { root: number; tip: number; semi: number; inner: number; zLe: number; sweep: number; y: number } {
  const s = ac.spec;
  const delta = ac.type === 'TYPHOON' || ac.type === 'RAFALE' || ac.type === 'GRIPEN';
  const lam = delta ? 0.16 : ac.type === 'SR71' ? 0.1 : 0.3;
  const sweep = (delta ? 52 : ac.type === 'SR71' ? 60 : 40) * (Math.PI / 180);
  const b = s.span, A = s.wingArea;
  const semi = b / 2;
  const root = Math.min(s.length * 0.62, (2 * A) / (b * (1 + lam)));
  const tip = root * lam;
  // the mean chord's quarter point a little behind the centre of gravity
  const yMac = (b / 6) * ((1 + 2 * lam) / (1 + lam));
  const mac = (2 / 3) * root * ((1 + lam + lam * lam) / (1 + lam));
  const zLe = s.length * 0.03 - yMac * Math.tan(sweep) - mac * 0.25;
  return { root, tip, semi, inner: Math.max(0.6, b * 0.09), zLe, sweep, y: 0.05 };
}

export class VaporFx {
  readonly group = new THREE.Group();
  private coneMat: THREE.ShaderMaterial;
  private wingMats: THREE.ShaderMaterial[] = [];
  private cone: THREE.Mesh;
  private wings: THREE.Mesh[] = [];
  private t = Math.random() * 50;
  /** smoothed strengths 0..1 */
  coneK = 0;
  wingK = 0;
  private sunView = new THREE.Vector3();

  constructor(readonly ac: Aircraft) {
    const s = ac.spec;
    const L = s.length, b = s.span;
    // ---- the cone: a bell from about the canopy to past the wingtips
    const z0 = -L * 0.14, z1 = L * 0.3;
    const r0 = Math.max(1.15, b * 0.14), r1 = b * 0.42;
    const pts: THREE.Vector2[] = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(u, 0.5), z0 + (z1 - z0) * u));
    }
    const lathe = new THREE.LatheGeometry(pts, 48);
    // (lathe builds round +Y with y from the profile: turn it onto the body axis, nose at -Z)
    lathe.rotateX(Math.PI / 2);
    // uv.y runs 0..1 along the profile already
    this.coneMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: CONE_FRAG,
      uniforms: {
        intensity: { value: 0 },
        time: { value: 0 },
        cLit: { value: new THREE.Color(0xf4f7fb) },
        cShade: { value: new THREE.Color(0xaab4c2) },
        sunView: { value: new THREE.Vector3(0, 1, 0) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.cone = new THREE.Mesh(lathe, this.coneMat);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 15;
    this.group.add(this.cone);
    // ---- the wing sheets: three thin layers per wing, stacked for some depth
    const p = planform(ac);
    for (let layer = 0; layer < 3; layer++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: WING_FRAG,
        uniforms: {
          intensity: { value: 0 },
          time: { value: 0 },
          layer: { value: layer },
          cLit: { value: new THREE.Color(0xf6f8fb) },
          cShade: { value: new THREE.Color(0xb4bcc8) },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.wingMats.push(mat);
      for (const side of [-1, 1]) {
        const geo = this.wingSheet(p, side, layer);
        const m = new THREE.Mesh(geo, mat);
        m.frustumCulled = false;
        m.renderOrder = 15;
        this.wings.push(m);
        this.group.add(m);
      }
    }
    this.group.visible = false;
  }

  private wingSheet(p: ReturnType<typeof planform>, side: number, layer: number): THREE.BufferGeometry {
    const NS = 10, NC = 8;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const outer = p.semi * 0.86;
    const lift = 0.18 + layer * 0.32;
    for (let i = 0; i <= NS; i++) {
      const s = i / NS;
      const x = p.inner + (outer - p.inner) * s;
      const chord = p.root * (1 - (1 - p.tip / p.root) * (x / p.semi));
      const zle = p.zLe + x * Math.tan(p.sweep);
      for (let j = 0; j <= NC; j++) {
        const c = j / NC;
        // (the cloud streams a little way past the trailing edge, rising off the wing)
        const z = zle + c * chord * 1.25 - layer * 0.15;
        const y = p.y + lift + c * (0.25 + layer * 0.3);
        pos.push(side * x, y, z);
        uv.push(s, c);
      }
    }
    for (let i = 0; i < NS; i++)
      for (let j = 0; j < NC; j++) {
        const a = i * (NC + 1) + j, bb = a + NC + 1;
        idx.push(a, bb, a + 1, bb, bb + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** follow the jet; `sunDir` is the direction to the sun (world), `cam` the camera */
  update(dt: number, cam: THREE.Camera, sunDir: THREE.Vector3 | null): void {
    const fm = this.ac.fm;
    this.t += dt;
    const alt = fm.pos.y;
    // damp low air makes vapour; high up there is too little water in it
    const damp = 1 - smoothstep(3500, 7500, alt);
    const m = fm.mach;
    const coneWant = fm.onGround || !this.ac.alive ? 0 : smoothstep(0.93, 0.975, m) * (1 - smoothstep(1.02, 1.08, m)) * damp;
    const g = fm.nz;
    const alpha = fm.alpha * (180 / Math.PI);
    const pull = smoothstep(5.0, 7.2, g) * smoothstep(100, 150, fm.tas);
    const hiA = 0.45 * smoothstep(17, 26, alpha) * smoothstep(55, 85, fm.tas) * (1 - smoothstep(45, 60, alpha));
    const wingWant = fm.onGround || !this.ac.alive ? 0 : Math.max(pull, hiA) * damp;
    // vapour forms and clears quickly, with a flicker as conditions wander
    const k = 1 - Math.exp(-dt * 9);
    this.coneK += (coneWant - this.coneK) * k;
    this.wingK += (wingWant - this.wingK) * k;
    const on = this.coneK > 0.01 || this.wingK > 0.01;
    this.group.visible = on;
    if (!on) return;
    this.group.position.copy(fm.pos);
    this.group.quaternion.copy(fm.quat);
    const flick = 0.82 + 0.18 * Math.sin(this.t * 23.0) * Math.sin(this.t * 7.3 + 1.0);
    this.coneMat.uniforms.intensity.value = this.coneK * flick;
    this.coneMat.uniforms.time.value = this.t;
    this.cone.visible = this.coneK > 0.01;
    if (sunDir) this.sunView.copy(sunDir).transformDirection(cam.matrixWorldInverse);
    (this.coneMat.uniforms.sunView.value as THREE.Vector3).copy(this.sunView);
    for (const mat of this.wingMats) {
      mat.uniforms.intensity.value = this.wingK * (0.85 + 0.15 * Math.sin(this.t * 17 + mat.uniforms.layer.value));
      mat.uniforms.time.value = this.t;
    }
    for (const w of this.wings) w.visible = this.wingK > 0.01;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.cone.geometry.dispose();
    this.coneMat.dispose();
    for (const w of this.wings) w.geometry.dispose();
    for (const m of this.wingMats) m.dispose();
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
