// Camera-facing ribbon trails: missile smoke, contrails and wingtip vortices.

import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec4 color4;
attribute float side;
varying vec4 vColor;
varying float vSide;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vColor = color4;
  vSide = side;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
varying vec4 vColor;
varying float vSide;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float edge = 1.0 - abs( vSide );
  float a = vColor.a * smoothstep( 0.0, 0.7, edge );
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( vColor.rgb, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export interface TrailStyle {
  width0: number;
  width1: number;
  life: number;
  color: THREE.Color;
  alpha: number;
  spacing: number;
}

export class Trail {
  xs: number[] = [];
  ys: number[] = [];
  zs: number[] = [];
  ts: number[] = [];
  emitting = true;
  dead = false;
  constructor(readonly style: TrailStyle) {}

  add(p: THREE.Vector3, t: number): void {
    const n = this.xs.length;
    if (n > 0) {
      const dx = p.x - this.xs[n - 1], dy = p.y - this.ys[n - 1], dz = p.z - this.zs[n - 1];
      if (dx * dx + dy * dy + dz * dz < this.style.spacing * this.style.spacing) {
        // move the head point so the ribbon stays attached to the emitter
        if (n > 1) {
          this.xs[n - 1] = p.x;
          this.ys[n - 1] = p.y;
          this.zs[n - 1] = p.z;
        }
        return;
      }
    }
    this.xs.push(p.x);
    this.ys.push(p.y);
    this.zs.push(p.z);
    this.ts.push(t);
  }

  prune(now: number): void {
    let k = 0;
    while (k < this.ts.length && now - this.ts[k] > this.style.life) k++;
    if (k > 0) {
      this.xs.splice(0, k);
      this.ys.splice(0, k);
      this.zs.splice(0, k);
      this.ts.splice(0, k);
    }
    if (!this.emitting && this.xs.length < 2) this.dead = true;
  }
}

export class TrailRenderer {
  readonly mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private posArr: Float32Array;
  private colArr: Float32Array;
  private sideArr: Float32Array;
  private idx: Uint32Array;
  trails: Trail[] = [];
  private origin = new THREE.Vector3();
  private readonly maxVerts: number;

  constructor(maxPoints = 24000) {
    this.maxVerts = maxPoints * 2;
    this.geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.maxVerts * 3);
    this.colArr = new Float32Array(this.maxVerts * 4);
    this.sideArr = new Float32Array(this.maxVerts);
    this.idx = new Uint32Array(maxPoints * 6);
    const pa = new THREE.BufferAttribute(this.posArr, 3);
    const ca = new THREE.BufferAttribute(this.colArr, 4);
    const sa = new THREE.BufferAttribute(this.sideArr, 1);
    const ia = new THREE.BufferAttribute(this.idx, 1);
    for (const a of [pa, ca, sa, ia]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', pa);
    this.geo.setAttribute('color4', ca);
    this.geo.setAttribute('side', sa);
    this.geo.setIndex(ia);
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
  }

  create(style: TrailStyle): Trail {
    const t = new Trail(style);
    this.trails.push(t);
    return t;
  }

  update(now: number, cam: THREE.Vector3): void {
    this.origin.set(Math.round(cam.x / 500) * 500, Math.round(cam.y / 500) * 500, Math.round(cam.z / 500) * 500);
    let v = 0, ii = 0;
    const P = this.posArr, C = this.colArr, S = this.sideArr, I = this.idx;
    const tmp = new THREE.Vector3();
    const view = new THREE.Vector3();
    const tan = new THREE.Vector3();
    for (let k = this.trails.length - 1; k >= 0; k--) {
      const tr = this.trails[k];
      tr.prune(now);
      if (tr.dead) {
        this.trails.splice(k, 1);
        continue;
      }
      const n = tr.xs.length;
      if (n < 2) continue;
      if (v + n * 2 > this.maxVerts) break;
      const st = tr.style;
      const base = v;
      for (let i = 0; i < n; i++) {
        const age = now - tr.ts[i];
        const f = Math.min(1, age / st.life);
        const w = (st.width0 + (st.width1 - st.width0) * Math.sqrt(f)) * 0.5;
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        tan.set(tr.xs[i1] - tr.xs[i0], tr.ys[i1] - tr.ys[i0], tr.zs[i1] - tr.zs[i0]);
        view.set(tr.xs[i] - cam.x, tr.ys[i] - cam.y, tr.zs[i] - cam.z);
        tmp.crossVectors(tan, view);
        const l = tmp.length();
        if (l > 1e-6) tmp.multiplyScalar(w / l);
        else tmp.set(w, 0, 0);
        const x = tr.xs[i] - this.origin.x, y = tr.ys[i] - this.origin.y, z = tr.zs[i] - this.origin.z;
        let a = st.alpha * (1 - f) * (1 - f);
        // soften the head so it grows out of the emitter
        if (i === n - 1) a *= 0.3;
        for (let s = 0; s < 2; s++) {
          const sgn = s === 0 ? -1 : 1;
          P[v * 3] = x + tmp.x * sgn;
          P[v * 3 + 1] = y + tmp.y * sgn;
          P[v * 3 + 2] = z + tmp.z * sgn;
          C[v * 4] = st.color.r;
          C[v * 4 + 1] = st.color.g;
          C[v * 4 + 2] = st.color.b;
          C[v * 4 + 3] = a;
          S[v] = sgn;
          v++;
        }
        if (i < n - 1) {
          const a0 = base + i * 2;
          I[ii++] = a0;
          I[ii++] = a0 + 1;
          I[ii++] = a0 + 2;
          I[ii++] = a0 + 1;
          I[ii++] = a0 + 3;
          I[ii++] = a0 + 2;
        }
      }
    }
    this.geo.setDrawRange(0, ii);
    this.mesh.position.copy(this.origin);
    const at = this.geo.attributes;
    (at.position as THREE.BufferAttribute).needsUpdate = true;
    (at.color4 as THREE.BufferAttribute).needsUpdate = true;
    (at.side as THREE.BufferAttribute).needsUpdate = true;
    this.geo.index!.needsUpdate = true;
  }

  clear(): void {
    this.trails.length = 0;
  }
}
