// Building blocks for the procedural hangar and its surroundings: geometry
// batching (one merged mesh per material), transform and primitive helpers,
// world-space UVs, canvas textures and a seeded random generator.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// geometry batching
// ---------------------------------------------------------------------------

export class Batch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, geo: THREE.BufferGeometry, m?: THREE.Matrix4): void {
    if (m) geo.applyMatrix4(m);
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g = g as THREE.BufferGeometry;
    let list = this.groups.get(mat);
    if (!list) this.groups.set(mat, (list = []));
    list.push(g);
  }
  build(parent: THREE.Object3D, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.groups) {
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!geo) continue;
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      const lit = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && !mat.transparent;
      m.castShadow = shadows && lit;
      m.receiveShadow = lit;
      parent.add(m);
      out.push(m);
    }
    this.groups.clear();
    return out;
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
export function at(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.Matrix4 {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return _m.clone().compose(new THREE.Vector3(x, y, z), _q, _s);
}
/** box centred at x, y, z */
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}
export function cyl(r0: number, r1: number, h: number, seg = 16): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r0, r1, h, seg);
}
/** a round bar from a to b */
export function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
/** a square steel member from a to b */
export function beam(a: THREE.Vector3, b: THREE.Vector3, s: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(s, len, s);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** World-space UVs (metres * scale) projected along the dominant normal axis. */
export function worldUV(g: THREE.BufferGeometry, scale = 1): THREE.BufferGeometry {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ax >= ay && ax >= az) (u = p.getZ(i)), (v = p.getY(i));
    else if (az >= ay) (u = p.getX(i)), (v = p.getY(i));
    else (u = p.getX(i)), (v = p.getZ(i));
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------------------------------------------------------------------------
// procedural textures
// ---------------------------------------------------------------------------

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
export function tex(c: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
