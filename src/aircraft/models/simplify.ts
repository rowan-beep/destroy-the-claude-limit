// Vertex-clustering simplification for geometry only ever seen from a distance (the far
// LOD, the few-pixel speck, the shadow stand-in). Every vertex snaps to a grid cell of
// `cell` metres; the vertices sharing a cell (and, for lit geometry, a similar normal)
// become one, which keeps its own position, normal, livery coordinates and colour; the
// triangles that collapse are dropped. Nothing moves by more than a cell's diagonal, so
// with the cell well under a pixel at the nearest distance the geometry is drawn from,
// the picture is the same, at a fraction of the triangles.

import * as THREE from 'three';

/** quantise a normal component (-1..1) into 5 levels, so creases (split normals) stay split */
const nq = (v: number): number => Math.max(0, Math.min(4, Math.round((v + 1) * 2)));

/** `byNormal` false: merge on position alone (for a jet a few pixels across, where shading detail cannot show) */
export function clusterSimplify(g: THREE.BufferGeometry, cell: number, byNormal = true): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute | undefined;
  // (morph targets and multi-material groups are left alone)
  if (!pos || Object.keys(g.morphAttributes).length || g.groups.length > 1) return g;
  const nor = byNormal ? (g.attributes.normal as THREE.BufferAttribute | undefined) : undefined;
  const n = pos.count;
  const OFF = 1 << 14;
  const W = 1 << 15;
  const remap = new Uint32Array(n);
  const keys = new Map<number, number>();
  const rep: number[] = [];
  for (let i = 0; i < n; i++) {
    const ix = Math.floor(pos.getX(i) / cell) + OFF;
    const iy = Math.floor(pos.getY(i) / cell) + OFF;
    const iz = Math.floor(pos.getZ(i) / cell) + OFF;
    let key = (ix * W + iy) * W + iz;
    if (nor) key = key * 128 + nq(nor.getX(i)) * 25 + nq(nor.getY(i)) * 5 + nq(nor.getZ(i));
    let k = keys.get(key);
    if (k === undefined) {
      k = rep.length;
      keys.set(key, k);
      rep.push(i);
    }
    remap[i] = k;
  }
  const src = g.index ? (g.index.array as ArrayLike<number>) : null;
  const triCount = src ? src.length / 3 : n / 3;
  const out: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const a = remap[src ? src[t * 3] : t * 3];
    const b = remap[src ? src[t * 3 + 1] : t * 3 + 1];
    const c = remap[src ? src[t * 3 + 2] : t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    out.push(a, b, c);
  }
  // nothing gained: keep the original
  if (out.length >= triCount * 3 * 0.97) return g;
  const r = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const at = g.attributes[name] as THREE.BufferAttribute;
    const size = at.itemSize;
    const Arr = (at.array.constructor as unknown as new (len: number) => THREE.TypedArray) ?? Float32Array;
    const arr = new Arr(rep.length * size);
    for (let k = 0; k < rep.length; k++) for (let c = 0; c < size; c++) arr[k * size + c] = at.getComponent(rep[k], c);
    r.setAttribute(name, new THREE.BufferAttribute(arr, size, at.normalized));
  }
  r.setIndex(new THREE.BufferAttribute(rep.length > 65535 ? new Uint32Array(out) : new Uint16Array(out), 1));
  r.computeBoundingSphere();
  r.computeBoundingBox();
  return r;
}
