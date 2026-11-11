// Vortex ropes: the thin white threads of cloud that a wing pulling hard spins off its
// tips, its leading-edge extensions and its tailplane tips. Unlike the vapour that
// lies on the metal, a rope is part of the AIR: it is born at the jet and then stays
// where it was born, so in a turn it is left behind as a curve along the flight path,
// widening, meandering (the vortex pair wanders and the cores kink) and breaking into
// segments as it ages, until it has gone. Each rope can also have an "attached head":
// the stretch of vortex that still lies on the airframe (a strake vortex running back
// over the wing) before it lifts off and joins the trail.
//
// Drawn as one camera-facing ribbon per rope, lit as the tube it really is (the sun on
// a cylinder, and the glow when it is between the eye and the sun).

import * as THREE from 'three';
import type { VaporLight } from './vaporLight';
import { vaporNoiseTexture, vaporNoiseReady } from './vaporNoise';

const VERT = /* glsl */ `
attribute float side;
attribute float along;
attribute float age;
attribute float strength;
attribute float halfW;
attribute vec3 right;
varying float vSide;
varying float vAlong;
varying float vAge;
varying float vStr;
varying vec3 vRight;
varying vec3 vToEye;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vSide = side;
  vAlong = along;
  vAge = age;
  vStr = strength;
  vec4 mvPosition = curveView( modelViewMatrix * vec4( position, 1.0 ) );
  vRight = mat3( viewMatrix ) * right;
  vToEye = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler3D noiseMap;
uniform float noiseOn;
uniform float time;
uniform vec3 sunV;
uniform vec3 sunCol;
uniform vec3 ambCol;
varying float vSide;
varying float vAlong;
varying float vAge;
varying float vStr;
varying vec3 vRight;
varying vec3 vToEye;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float s = vSide;
  float r2 = s * s;
  // young: a thin hard core. old: a wide, soft, ragged smear
  float core = exp( -r2 * mix( 7.5, 2.4, vAge ) );
  float halo = exp( -r2 * 1.6 ) * 0.28 * smoothstep( 0.0, 0.5, vAge );
  // the rope breaks into lumps and gaps as it ages; the noise rolls along it
  vec4 nz = noiseOn > 0.5 ? texture( noiseMap, vec3( vAlong * 0.045, s * 0.35 + vAge * 0.9, vAge * 0.8 + time * 0.03 ) ) : vec4( 0.5 );
  float breakK = 0.35 + 0.65 * smoothstep( 0.05, 0.8, vAge );
  float seg = mix( 1.0, smoothstep( 0.22, 0.62, nz.g * 0.6 + nz.r * 0.4 ), breakK );
  // fine strands wound round the core, only seen while it is young and tight
  float ph = vAlong * 2.6 + s * 2.2;
  float strand = 1.0 - 0.3 * ( 1.0 - vAge ) * ( 0.5 + 0.5 * sin( ph * 3.1415 ) ) - 0.25 * ( 1.0 - nz.b );
  float a = ( core + halo ) * seg * strand * vStr;
  // lit as a cylinder: its normal swings from the ribbon's edge to the eye
  vec3 toEye = normalize( vToEye );
  vec3 n = normalize( vRight * s + toEye * sqrt( max( 0.0, 1.0 - r2 ) ) );
  float diff = dot( n, sunV ) * 0.5 + 0.5;
  // droplets throw the sun forward: it glows when the sun is behind the rope
  float fwd = pow( max( dot( -toEye, sunV ), 0.0 ), 5.0 );
  vec3 col = ambCol * 0.8 + sunCol * ( 0.26 + 0.38 * diff + 0.42 * fwd );
  // the dense heart of a young rope is the brightest, the thin sheath a touch greyer
  col *= 0.84 + 0.2 * core;
  vec3 over = max( col - 0.72, vec3( 0.0 ) );
  col = min( col, vec3( 0.72 ) ) + 0.28 * ( vec3( 1.0 ) - exp( -over / 0.28 ) );
  a = clamp( a, 0.0, 0.95 );
  if ( a < 0.002 ) discard;
  // the game's own aerial-perspective fog works on plain colour: take the colour out of the alpha and put it back
  gl_FragColor = vec4( col, a );
  #include <fog_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
  #ifdef BENCH
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  #endif
}
`;

export interface RopeStyle {
  /** width of the core when it forms (m) and when it has spread at the end of its life */
  w0: number;
  w1: number;
  /** seconds it lasts */
  life: number;
  /** most opaque it gets */
  alpha: number;
  /** how far (m) it has meandered sideways by the end of its life */
  wander: number;
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const wob = (x: number, ph: number) => (Math.sin(x * 0.19 + ph) + 0.6 * Math.sin(x * 0.47 + ph * 2.3) + 0.35 * Math.sin(x * 1.13 + ph * 4.1)) / 1.95;

export class Rope {
  xs: number[] = [];
  ys: number[] = [];
  zs: number[] = [];
  ts: number[] = [];
  ss: number[] = [];
  /** the stretch still on the airframe, from where the rope leaves it toward its apex (world) */
  head: THREE.Vector3[] = [];
  headStrength = 0;
  emitting = true;
  dead = false;
  readonly seed = Math.random() * 100;
  constructor(readonly style: RopeStyle) {}

  /** add the emitter's position; while it is within `spacing` of the last fixed point the newest point just rides with it */
  add(p: THREE.Vector3, t: number, strength: number, spacing: number): void {
    const n = this.xs.length;
    if (n >= 2) {
      const dx = p.x - this.xs[n - 2], dy = p.y - this.ys[n - 2], dz = p.z - this.zs[n - 2];
      if (dx * dx + dy * dy + dz * dz < spacing * spacing) {
        this.xs[n - 1] = p.x;
        this.ys[n - 1] = p.y;
        this.zs[n - 1] = p.z;
        this.ts[n - 1] = t;
        this.ss[n - 1] = strength;
        return;
      }
    }
    this.xs.push(p.x);
    this.ys.push(p.y);
    this.zs.push(p.z);
    this.ts.push(t);
    this.ss.push(strength);
  }

  prune(now: number): void {
    let k = 0;
    while (k < this.ts.length && now - this.ts[k] > this.style.life) k++;
    if (k > 0) {
      this.xs.splice(0, k);
      this.ys.splice(0, k);
      this.zs.splice(0, k);
      this.ts.splice(0, k);
      this.ss.splice(0, k);
    }
    if (!this.emitting && this.xs.length < 2) this.dead = true;
  }
}

export class VortexRopes {
  readonly mesh: THREE.Mesh;
  ropes: Rope[] = [];
  private geo = new THREE.BufferGeometry();
  private readonly maxVerts: number;
  private pos: Float32Array;
  private sideA: Float32Array;
  private alongA: Float32Array;
  private ageA: Float32Array;
  private strA: Float32Array;
  private halfA: Float32Array;
  private rightA: Float32Array;
  private idx: Uint32Array;
  private origin = new THREE.Vector3();
  private mat: THREE.ShaderMaterial;
  private uSunV = new THREE.Vector3();

  constructor(maxPoints = 14000, bench = false) {
    this.maxVerts = maxPoints * 2;
    this.pos = new Float32Array(this.maxVerts * 3);
    this.sideA = new Float32Array(this.maxVerts);
    this.alongA = new Float32Array(this.maxVerts);
    this.ageA = new Float32Array(this.maxVerts);
    this.strA = new Float32Array(this.maxVerts);
    this.halfA = new Float32Array(this.maxVerts);
    this.rightA = new Float32Array(this.maxVerts * 3);
    this.idx = new Uint32Array(maxPoints * 6);
    const attrs: [string, Float32Array, number][] = [
      ['position', this.pos, 3],
      ['side', this.sideA, 1],
      ['along', this.alongA, 1],
      ['age', this.ageA, 1],
      ['strength', this.strA, 1],
      ['halfW', this.halfA, 1],
      ['right', this.rightA, 3],
    ];
    for (const [name, arr, size] of attrs) this.geo.setAttribute(name, new THREE.BufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          noiseMap: { value: null as THREE.Data3DTexture | null },
          noiseOn: { value: 0 },
          time: { value: 0 },
          sunV: { value: new THREE.Vector3(0, 1, 0) },
          sunCol: { value: new THREE.Color(1, 1, 1) },
          ambCol: { value: new THREE.Color(0.5, 0.55, 0.6) },
        },
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
      fog: true,
      defines: bench ? { BENCH: '' } : {},
    });
    this.mat.uniforms.noiseMap.value = vaporNoiseTexture();
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 16;
    this.mesh.name = 'vortex-ropes';
  }

  create(style: RopeStyle): Rope {
    const r = new Rope(style);
    this.ropes.push(r);
    return r;
  }

  clear(): void {
    this.ropes.length = 0;
    this.geo.setDrawRange(0, 0);
  }

  /** `viewH` is the picture's height in pixels (a rope is never drawn thinner than about a pixel) */
  update(now: number, cam: THREE.PerspectiveCamera, light: VaporLight, viewH: number): void {
    const u = this.mat.uniforms;
    u.time.value = now;
    u.noiseOn.value = vaporNoiseReady() ? 1 : 0;
    u.sunCol.value.copy(light.sunCol);
    u.ambCol.value.copy(light.ambCol);
    this.uSunV.copy(light.sunDir).transformDirection(cam.matrixWorldInverse);
    (u.sunV.value as THREE.Vector3).copy(this.uSunV);
    const cp = cam.position;
    this.origin.set(Math.round(cp.x / 500) * 500, Math.round(cp.y / 500) * 500, Math.round(cp.z / 500) * 500);
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360) / Math.max(0.01, cam.zoom);
    const mPerPxPerM = (2 * tanHalf) / Math.max(200, viewH);
    let v = 0, ii = 0;
    const tan = new THREE.Vector3(), view = new THREE.Vector3(), rt = new THREE.Vector3(), b1 = new THREE.Vector3(), b2 = new THREE.Vector3();
    const P: THREE.Vector3[] = [];
    for (let k = this.ropes.length - 1; k >= 0; k--) {
      const r = this.ropes[k];
      r.prune(now);
      if (r.dead) {
        this.ropes.splice(k, 1);
        continue;
      }
      const nh = r.xs.length;
      const nHead = r.head.length;
      if (nh + nHead < 2) continue;
      const st = r.style;
      // the whole polyline: oldest first, ending at the apex of the head (age 0)
      P.length = 0;
      const ages: number[] = [], strs: number[] = [];
      for (let i = 0; i < nh; i++) {
        P.push(new THREE.Vector3(r.xs[i], r.ys[i], r.zs[i]));
        ages.push(Math.min(1, (now - r.ts[i]) / st.life));
        strs.push(r.ss[i]);
      }
      for (let i = 0; i < nHead; i++) {
        P.push(r.head[i].clone());
        ages.push(0);
        strs.push(r.headStrength);
      }
      // smooth it: a Catmull-Rom curve through the points, so a turn is a curve and not a polygon
      const m = P.length;
      const Pd: THREE.Vector3[] = [], agesD: number[] = [], strsD: number[] = [];
      for (let i = 0; i < m - 1; i++) {
        const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(m - 1, i + 2)];
        const S = Math.min(5, Math.max(1, Math.round(p1.distanceTo(p2) / 2.5)));
        for (let k = 0; k < S; k++) {
          const t = k / S, t2 = t * t, t3 = t2 * t;
          const cr = (a0: number, a1: number, a2: number, a3: number) => 0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 + (-a0 + 3 * a1 - 3 * a2 + a3) * t3);
          Pd.push(new THREE.Vector3(cr(p0.x, p1.x, p2.x, p3.x), cr(p0.y, p1.y, p2.y, p3.y), cr(p0.z, p1.z, p2.z, p3.z)));
          agesD.push(ages[i] + (ages[i + 1] - ages[i]) * t);
          strsD.push(strs[i] + (strs[i + 1] - strs[i]) * t);
        }
      }
      Pd.push(P[m - 1].clone());
      agesD.push(ages[m - 1]);
      strsD.push(strs[m - 1]);
      const n = Pd.length;
      if (v + n * 2 > this.maxVerts) break;
      // distance from the apex end, for the noise along the rope
      const along = new Array<number>(n).fill(0);
      for (let i = n - 2; i >= 0; i--) along[i] = along[i + 1] + Pd[i].distanceTo(Pd[i + 1]);
      const base = v;
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        tan.subVectors(Pd[i1], Pd[i0]);
        if (tan.lengthSq() < 1e-10) tan.set(0, 0, 1);
        tan.normalize();
        const age = agesD[i];
        // the meander: the cores kink and the pair drifts, more with age
        const amp = st.wander * Math.pow(age, 1.35);
        let px = Pd[i].x, py = Pd[i].y, pz = Pd[i].z;
        if (amp > 1e-4) {
          b1.set(0, 1, 0).cross(tan);
          if (b1.lengthSq() < 1e-6) b1.set(1, 0, 0);
          b1.normalize();
          b2.crossVectors(tan, b1);
          const o1 = wob(along[i], r.seed) * amp, o2 = wob(along[i], r.seed + 7.7) * amp * 0.8;
          px += b1.x * o1 + b2.x * o2;
          py += b1.y * o1 + b2.y * o2;
          pz += b1.z * o1 + b2.z * o2;
        }
        view.set(px - cp.x, py - cp.y, pz - cp.z);
        const dist = view.length();
        rt.crossVectors(tan, view);
        const rl = rt.length();
        // looking straight down a rope a flat ribbon would collapse to a line: fade it there
        const sideOn = rl / Math.max(1e-6, dist);
        if (rl > 1e-6) rt.multiplyScalar(1 / rl);
        else rt.set(1, 0, 0);
        let w = (st.w0 + (st.w1 - st.w0) * Math.sqrt(age)) * 0.5;
        // never drawn thinner than about a pixel (it dims instead, so it does not shimmer)
        const minW = mPerPxPerM * dist * 0.75;
        let dim = 1;
        if (w < minW) {
          dim = w / minW;
          w = minW;
        }
        const sv = Math.min(1, Math.max(0, (sideOn - 0.04) / 0.25));
        // it forms out of nothing at the airframe and is gone before its oldest point
        const fadeIn = sstep(0, 2.5, along[i]);
        const oldest = i === 0 ? 0.3 : 1;
        const a = st.alpha * strsD[i] * Math.pow(1 - age, 1.7) * sv * sv * (3 - 2 * sv) * dim * fadeIn * oldest;
        const ox = px - this.origin.x, oy = py - this.origin.y, oz = pz - this.origin.z;
        for (let s = 0; s < 2; s++) {
          const sgn = s === 0 ? -1 : 1;
          this.pos[v * 3] = ox + rt.x * w * sgn;
          this.pos[v * 3 + 1] = oy + rt.y * w * sgn;
          this.pos[v * 3 + 2] = oz + rt.z * w * sgn;
          this.sideA[v] = sgn;
          this.alongA[v] = along[i] + r.seed;
          this.ageA[v] = age;
          this.strA[v] = a;
          this.halfA[v] = w;
          this.rightA[v * 3] = rt.x;
          this.rightA[v * 3 + 1] = rt.y;
          this.rightA[v * 3 + 2] = rt.z;
          v++;
        }
        if (i < n - 1) {
          const a0 = base + i * 2;
          this.idx[ii++] = a0;
          this.idx[ii++] = a0 + 1;
          this.idx[ii++] = a0 + 2;
          this.idx[ii++] = a0 + 1;
          this.idx[ii++] = a0 + 3;
          this.idx[ii++] = a0 + 2;
        }
      }
    }
    this.geo.setDrawRange(0, ii);
    this.mesh.position.copy(this.origin);
    for (const name of ['position', 'side', 'along', 'age', 'strength', 'halfW', 'right']) (this.geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
    this.geo.index!.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
