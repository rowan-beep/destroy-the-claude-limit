// Condensation vapour on a jet, as shaped clouds rather than puffs:
//  - the transonic vapour cone: near Mach 1 in damp low air a shock stands on the
//    fuselage and the air behind it fogs into a bell-shaped shroud, sharp at the
//    front and frayed at the back, from about the canopy to past the wingtips;
//  - wing vapour: in a hard pull (and at high alpha) the low pressure over the
//    wings condenses into a sheet of cloud lying on the upper surface, thickest
//    just behind the leading edge and inboard, streaming off the trailing edge;
//  - vortex cores: the wingtip and strake vortices spin the damp air into thin
//    twisting ropes of cloud trailing behind the jet.
// The sheets are fitted to the real airframe: the wing's planform and height are
// read off the jet's own mesh, so the cloud lies on the metal, not above it.
// Everything is a soft translucent mesh riding with the jet, animated in the shader.

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

// the ribbons lean with the airflow: aft along +z, up with the angle of attack, across with sideslip
const RIBBON_VERT = /* glsl */ `
uniform float alpha;
uniform float beta;
uniform float len;
varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vec3 p = position;
  float t = uv.x;
  p.y += t * len * tan( alpha ) * 0.85;
  p.x += t * len * tan( beta );
  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
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
  gl_FragColor = vec4( col, clamp( a, 0.0, 0.8 ) );
}
`;

// the wing sheet: uv.x spanwise (root 0 .. tip 1), uv.y chordwise (leading edge 0 .. past the trailing edge 1)
const WING_FRAG = /* glsl */ `
uniform float intensity;
uniform float time;
uniform float layer;
uniform float seed;
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
  float s = vUv.x, c = vUv.y;
  // long streaks running chordwise, and slower clumps drifting aft
  float streak = fbm( vec3( s * 22.0 + seed, c * 2.0 - time * 5.0, layer + seed ) );
  float puff = fbm( vec3( s * 5.0 - layer + seed, c * 2.2 - time * 1.6, 2.0 + layer ) );
  // the sheet forms a little behind the leading edge, thins toward the trailing
  // edge and tears off past it; it is thickest inboard and dies out toward the tip
  float lead = smoothstep( 0.0, 0.1, c ) * ( 1.0 - smoothstep( 0.45, 1.0, c + ( streak - 0.5 ) * 0.45 ) );
  float span = smoothstep( 0.0, 0.1, s ) * ( 1.0 - smoothstep( 0.5, 1.0, s + ( puff - 0.5 ) * 0.4 ) );
  // clumpy, with holes: condensation never covers a wing evenly
  float body = smoothstep( 0.25, 0.8, 0.45 * streak + 0.55 * puff );
  float a = intensity * lead * span * body * ( 1.0 - layer * 0.45 );
  vec3 n = normalize( vN );
  float lit = 0.6 + 0.4 * clamp( dot( n, sunView ) * 0.5 + 0.5, 0.0, 1.0 );
  vec3 col = mix( cShade, cLit, lit * ( 0.6 + 0.4 * puff ) );
  gl_FragColor = vec4( col, clamp( a, 0.0, 0.62 ) );
}
`;

// a vortex core: uv.x along the trail (0 at the source), uv.y across it
const RIBBON_FRAG = /* glsl */ `
uniform float intensity;
uniform float time;
uniform float seed;
uniform vec3 cLit;
uniform vec3 cShade;
varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  float t = vUv.x, s = vUv.y - 0.5;
  // a tight core that frays into a wider, fainter rope downstream
  float core = exp( -s * s * ( 22.0 - 12.0 * t ) );
  float n = fbm( vec3( t * 14.0 - time * 24.0, s * 5.0 + seed, seed ) );
  // the spin: bright turns chasing each other down the rope
  float twist = 0.62 + 0.38 * sin( t * 75.0 - time * 70.0 + seed * 6.0 + s * 4.0 );
  float a = intensity * smoothstep( 0.0, 0.05, t ) * pow( 1.0 - t, 1.5 ) * core * ( 0.4 + 0.85 * n ) * twist;
  vec3 col = mix( cShade, cLit, 0.5 + 0.5 * n );
  gl_FragColor = vec4( col, clamp( a, 0.0, 0.55 ) );
}
`;

/** the height of the jet's upper surface at a point of its plan (jet frame), or null off the airframe */
export type SurfaceProbe = (x: number, z: number) => number | null;

/** A probe that drops rays through the given geometries (in the jet's frame). */
export function probeFromParts(parts: { geo: THREE.BufferGeometry }[]): SurfaceProbe {
  const meshes = parts.map((p) => {
    const m = new THREE.Mesh(p.geo, new THREE.MeshBasicMaterial());
    m.matrixAutoUpdate = false;
    m.matrixWorld.identity();
    return m;
  });
  const rc = new THREE.Raycaster();
  const o = new THREE.Vector3(), d = new THREE.Vector3(0, -1, 0);
  return (x, z) => {
    o.set(x, 8, z);
    rc.set(o, d);
    let best: number | null = null;
    for (const m of meshes) {
      const hits = rc.intersectObject(m, false);
      for (const h of hits) if (best === null || h.point.y > best) best = h.point.y;
    }
    return best;
  };
}

/** a rough wing planform from the spec (the probe refines it where it can) */
function planform(ac: Aircraft): { root: number; tip: number; semi: number; inner: number; zLe: number; sweep: number } {
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
  return { root, tip, semi, inner: Math.max(0.55, b * 0.08), zLe, sweep };
}

/** jets whose strakes and chines throw strong vortices over the wing roots */
const STRAKES = new Set(['F16C', 'FA18EF', 'SU35', 'SU57', 'MIG31', 'F22', 'F35A']);

interface Station {
  x: number;
  le: number;
  te: number;
  /** upper-surface height along the chord (5 samples, leading edge to trailing edge) */
  y: number[];
}

export class VaporFx {
  readonly group = new THREE.Group();
  private coneMat: THREE.ShaderMaterial;
  private cone: THREE.Mesh;
  private sheetMats: THREE.ShaderMaterial[] = [];
  private sheets: THREE.Mesh[] = [];
  private ribbonMats: THREE.ShaderMaterial[] = [];
  private ribbons: THREE.Mesh[] = [];
  private t = Math.random() * 50;
  /** smoothed strengths 0..1 */
  coneK = 0;
  wingK = 0;
  vortexK = 0;
  private sunView = new THREE.Vector3();

  constructor(
    readonly ac: Aircraft,
    probe: SurfaceProbe | null = null,
  ) {
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

    // ---- the wing: stations across the span, each with its true chord and surface height
    const p = planform(ac);
    const strakes = STRAKES.has(ac.type);
    for (const side of [-1, 1] as const) {
      const st = this.stations(p, side, probe);
      if (st.length < 2) continue;
      // two conforming layers: the sheet on the metal and a thinner one just above it
      for (let layer = 0; layer < 2; layer++) {
        const mat = new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: WING_FRAG,
          uniforms: {
            intensity: { value: 0 },
            time: { value: 0 },
            layer: { value: layer },
            seed: { value: side * 3.7 + layer * 11.3 },
            cLit: { value: new THREE.Color(0xf7f9fc) },
            cShade: { value: new THREE.Color(0xb9c1cc) },
            sunView: { value: new THREE.Vector3(0, 1, 0) },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        this.sheetMats.push(mat);
        const m = new THREE.Mesh(this.sheet(st, side, layer), mat);
        m.frustumCulled = false;
        m.renderOrder = 15;
        this.sheets.push(m);
        this.group.add(m);
      }
      // the vortex cores: off the wingtip, and off the strake over the wing root
      const tip = st[st.length - 1];
      const root = st[0];
      const tipSrc = new THREE.Vector3(tip.x, tip.y[1] + 0.1, tip.le + (tip.te - tip.le) * 0.3);
      const lexSrc = new THREE.Vector3(root.x + 0.25 * side, root.y[0] + 0.3, root.le - 0.4);
      this.ribbon(tipSrc, Math.max(14, L * 1.3), 0.28, 1.0, side * 2.1);
      this.ribbon(lexSrc, Math.max(9, L * 0.8), 0.22, strakes ? 0.9 : 0.4, side * 5.3);
    }
    this.group.visible = false;
  }

  /** The wing's span stations: where its leading and trailing edges and upper surface really are. */
  private stations(p: ReturnType<typeof planform>, side: number, probe: SurfaceProbe | null): Station[] {
    const out: Station[] = [];
    const NS = 9;
    const outer = p.semi * 0.985;
    const chordAt = (x: number) => p.root * (1 - (1 - p.tip / p.root) * (x / p.semi));
    for (let i = 0; i <= NS; i++) {
      const x = p.inner + (outer - p.inner) * (i / NS);
      const cEst = chordAt(x);
      const leEst = p.zLe + x * Math.tan(p.sweep);
      let le = leEst, te = leEst + cEst;
      let ys: number[] | null = null;
      if (probe) {
        // scan the chord line for the metal: the run of hits round the estimated mid-chord is the wing
        const step = 0.25;
        const zA = leEst - Math.max(1.5, cEst * 0.5), zB = leEst + cEst * 1.6 + 1;
        const zMid = leEst + cEst * 0.45;
        const runs: [number, number][] = [];
        let runStart: number | null = null;
        for (let z = zA; z <= zB + 1e-6; z += step) {
          const hit = probe(x * side, z) !== null;
          if (hit && runStart === null) runStart = z;
          if (!hit && runStart !== null) {
            runs.push([runStart, z - step]);
            runStart = null;
          }
        }
        if (runStart !== null) runs.push([runStart, zB]);
        if (runs.length) {
          let best = runs[0];
          let bestD = Infinity;
          for (const r of runs) {
            const d = zMid < r[0] ? r[0] - zMid : zMid > r[1] ? zMid - r[1] : 0;
            if (d < bestD) {
              bestD = d;
              best = r;
            }
          }
          if (bestD < cEst * 0.6) {
            // (over the fuselage the run is the whole body: keep a wing's worth of it)
            le = Math.max(best[0], zMid - cEst * 0.75);
            te = Math.min(best[1], zMid + cEst * 0.9);
            if (te - le < 0.6) {
              le = best[0];
              te = best[1];
            }
            ys = [];
            for (let k = 0; k < 5; k++) {
              const z = le + 0.08 + (te - le - 0.16) * (k / 4);
              ys.push(probe(x * side, z) ?? NaN);
            }
            // fill the odd miss from its neighbours
            for (let k = 0; k < 5; k++) {
              if (!Number.isNaN(ys[k])) continue;
              let v = NaN;
              for (let r = 1; r < 5 && Number.isNaN(v); r++) v = !Number.isNaN(ys[k - r] ?? NaN) ? ys[k - r] : !Number.isNaN(ys[k + r] ?? NaN) ? ys[k + r] : NaN;
              ys[k] = v;
            }
            if (ys.some((v) => Number.isNaN(v))) ys = null;
          }
        }
      }
      if (!ys) {
        // nothing under the ray here (past the real tip, or no mesh to probe): past the
        // tip the wing is over; otherwise carry the last station's height
        if (probe && out.length) break;
        const prev = out[out.length - 1];
        ys = prev ? prev.y.slice() : [0.05, 0.05, 0.05, 0.05, 0.05];
      }
      out.push({ x: x * side, le, te, y: ys });
    }
    return out;
  }

  /** a sheet lying on the wing's upper surface, streaming a little past the trailing edge */
  private sheet(st: Station[], side: number, layer: number): THREE.BufferGeometry {
    const NC = 9;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const lift = 0.07 + layer * 0.28;
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      const chord = s.te - s.le;
      for (let j = 0; j <= NC; j++) {
        const c = j / NC;
        // the cloud streams past the trailing edge, rising a little as it leaves the wing
        const z = s.le + c * chord * 1.3 - layer * 0.1;
        const cc = Math.min(1, c * 1.3);
        const k = cc * 4;
        const k0 = Math.min(3, Math.floor(k));
        const y = s.y[k0] + (s.y[k0 + 1] - s.y[k0]) * (k - k0);
        const over = Math.max(0, c * 1.3 - 1);
        pos.push(s.x, y + lift + over * (0.3 + layer * 0.3), z);
        uv.push(i / (st.length - 1), c);
      }
    }
    for (let i = 0; i < st.length - 1; i++)
      for (let j = 0; j < NC; j++) {
        const a = i * (NC + 1) + j, bb = a + NC + 1;
        if (side > 0) idx.push(a, bb, a + 1, bb, bb + 1, a + 1);
        else idx.push(a, a + 1, bb, bb, a + 1, bb + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /** a vortex core trailing aft from a point: two crossed strips, so it reads from any angle */
  private ribbon(src: THREE.Vector3, len: number, width: number, strength: number, seed: number): void {
    const mat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: {
        intensity: { value: 0 },
        time: { value: 0 },
        seed: { value: seed },
        alpha: { value: 0 },
        beta: { value: 0 },
        len: { value: len },
        cLit: { value: new THREE.Color(0xf6f8fb) },
        cShade: { value: new THREE.Color(0xc2cad4) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    mat.userData.strength = strength;
    this.ribbonMats.push(mat);
    const N = 26;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const plane of [0, 1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const w = width * (0.35 + 1.1 * t);
        const z = src.z + t * len;
        if (plane === 0) pos.push(src.x - w, src.y, z, src.x + w, src.y, z);
        else pos.push(src.x, src.y - w, z, src.x, src.y + w, z);
        uv.push(t, 0, t, 1);
      }
      for (let i = 0; i < N; i++) {
        const a = base + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = 16;
    this.ribbons.push(m);
    this.group.add(m);
  }

  /** follow the jet; `sunDir` is the direction to the sun (world), `cam` the camera */
  update(dt: number, cam: THREE.Camera, sunDir: THREE.Vector3 | null): void {
    const fm = this.ac.fm;
    this.t += dt;
    const alt = fm.pos.y;
    // damp low air makes vapour; high up there is too little water in it
    const damp = 1 - smoothstep(3500, 7500, alt);
    const m = fm.mach;
    const flying = !fm.onGround && this.ac.alive;
    const coneWant = !flying ? 0 : smoothstep(0.93, 0.975, m) * (1 - smoothstep(1.02, 1.08, m)) * damp;
    const g = fm.nz;
    const alpha = fm.alpha * (180 / Math.PI);
    const fast = smoothstep(95, 150, fm.tas);
    const pull = smoothstep(4.6, 7.0, g) * fast;
    const hiA = 0.55 * smoothstep(15, 24, alpha) * smoothstep(55, 85, fm.tas) * (1 - smoothstep(45, 60, alpha));
    const wingWant = !flying ? 0 : Math.max(pull, hiA) * damp;
    const vortexWant = !flying ? 0 : Math.max(smoothstep(3.8, 6.4, g) * fast, 0.85 * smoothstep(13, 22, alpha) * smoothstep(60, 110, fm.tas)) * damp;
    // vapour forms and clears quickly, with a flicker as conditions wander
    const k = 1 - Math.exp(-dt * 9);
    this.coneK += (coneWant - this.coneK) * k;
    this.wingK += (wingWant - this.wingK) * k;
    this.vortexK += (vortexWant - this.vortexK) * (1 - Math.exp(-dt * 6));
    const on = this.coneK > 0.01 || this.wingK > 0.01 || this.vortexK > 0.01;
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
    for (const mat of this.sheetMats) {
      mat.uniforms.intensity.value = this.wingK * (0.85 + 0.15 * Math.sin(this.t * 17 + mat.uniforms.layer.value));
      mat.uniforms.time.value = this.t;
      (mat.uniforms.sunView.value as THREE.Vector3).copy(this.sunView);
    }
    for (const s of this.sheets) s.visible = this.wingK > 0.01;
    for (const mat of this.ribbonMats) {
      mat.uniforms.intensity.value = this.vortexK * (mat.userData.strength as number) * (0.8 + 0.2 * Math.sin(this.t * 13 + mat.uniforms.seed.value));
      mat.uniforms.time.value = this.t;
      mat.uniforms.alpha.value = fm.alpha;
      mat.uniforms.beta.value = fm.beta;
    }
    for (const r of this.ribbons) r.visible = this.vortexK > 0.01;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.cone.geometry.dispose();
    this.coneMat.dispose();
    for (const w of this.sheets) w.geometry.dispose();
    for (const m of this.sheetMats) m.dispose();
    for (const r of this.ribbons) r.geometry.dispose();
    for (const m of this.ribbonMats) m.dispose();
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
