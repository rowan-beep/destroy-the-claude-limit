// The land round Kestrel Harbor: woods of pine and broadleaf on the hills
// (dense stands with clearings, scattered trees between, scrub at the edges),
// moving in the wind, and the harbor town's houses along the slopes either side
// of the yard, each facing the sea. Placed by a hash of their place, so they
// stand in the same spots every time; on the ground (its height function),
// never on the yard, the beach or a cliff. Shown only from above the water.

import * as THREE from 'three';
import { seabedHeight, seabedNormal, coastZ, HARBOR } from '../world/geo';
import { patchOceanMaterial } from './oceanMaterial';
import type { HarborTextures } from './harborTex';

const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function hash(x: number, z: number, s: number): number {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((z | 0) + s * 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, s: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** paint a part of a model (linear colour) */
function tint(g: THREE.BufferGeometry, c: [number, number, number]): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = srgb(c[0]);
    col[i * 3 + 1] = srgb(c[1]);
    col[i * 3 + 2] = srgb(c[2]);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // (all non-indexed, position / normal / color)
  const ps = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let n = 0;
  for (const p of ps) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of ps) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    col.set(p.attributes.color.array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** a pine: a trunk and four tiers of foliage, 1 m tall (scaled per tree) */
function pine(): THREE.BufferGeometry {
  const parts = [tint(new THREE.CylinderGeometry(0.018, 0.03, 0.35, 5, 1, true).translate(0, 0.175, 0), [0.28, 0.2, 0.14])];
  const tiers: [number, number, number][] = [[0.24, 0.42, 0.28], [0.2, 0.34, 0.44], [0.15, 0.27, 0.6], [0.09, 0.22, 0.76]];
  for (const [r, h, y] of tiers) {
    const c = new THREE.ConeGeometry(r, h, 8, 1, true);
    c.translate(0, y + h / 2 - 0.05, 0);
    parts.push(tint(c, [0.11, 0.2, 0.12]));
  }
  return merge(parts);
}
/** a broadleaf tree: trunk, two limbs and three clumps of leaves, 1 m tall */
function broadleaf(): THREE.BufferGeometry {
  const parts = [tint(new THREE.CylinderGeometry(0.025, 0.04, 0.45, 5, 1, true).translate(0, 0.225, 0), [0.3, 0.24, 0.18])];
  const clump = (r: number, x: number, y: number, z: number, c: [number, number, number]) => {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + 0.18 * Math.sin(p.getX(i) * 31 + p.getY(i) * 17) * Math.sin(p.getZ(i) * 23);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    g.translate(x, y, z);
    parts.push(tint(g, c));
  };
  clump(0.3, 0, 0.66, 0, [0.2, 0.3, 0.12]);
  clump(0.22, 0.17, 0.55, 0.08, [0.22, 0.32, 0.13]);
  clump(0.21, -0.15, 0.6, -0.1, [0.18, 0.28, 0.11]);
  return merge(parts);
}
/** a bush, 1 m across */
function shrub(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.2 * Math.sin(p.getX(i) * 13 + p.getZ(i) * 9) * Math.sin(p.getY(i) * 11);
    p.setXYZ(i, p.getX(i) * k, Math.max(-0.05, p.getY(i) * k * 0.6), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  g.translate(0, 0.25, 0);
  return tint(g, [0.2, 0.26, 0.12]);
}

/** a two-storey house, 8 wide, 10 deep, with a pitched roof; facing +z */
function house(): { walls: THREE.BufferGeometry; roof: THREE.BufferGeometry } {
  const walls = new THREE.BoxGeometry(8, 5.6, 10);
  walls.translate(0, 2.8 - 0.6, 0);
  // the window bays: 2 across a gable end, 3 along a side; storeys of 2.8 m
  const p = walls.attributes.position, n = walls.attributes.normal, uv = walls.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), az = Math.abs(n.getZ(i));
    const y = p.getY(i) + 0.6;
    if (az > 0.5) uv.setXY(i, (p.getX(i) + 4) / 4, y / 2.8);
    else if (ax > 0.5) uv.setXY(i, (p.getZ(i) + 5) / 3.33, y / 2.8);
    else uv.setXY(i, 0.05, 0.05);
  }
  const roof = new THREE.BufferGeometry();
  const rise = 2.6, ov = 0.45, y0 = 5.0, hw = 4 + ov, hd = 5 + ov;
  // two slopes (along z) and two gable triangles
  const v = [
    -hw, y0, -hd, 0, y0 + rise, -hd, 0, y0 + rise, hd, -hw, y0, -hd, 0, y0 + rise, hd, -hw, y0, hd,
    hw, y0, -hd, hw, y0, hd, 0, y0 + rise, hd, hw, y0, -hd, 0, y0 + rise, hd, 0, y0 + rise, -hd,
    -4, y0, hd - ov, 4, y0, hd - ov, 0, y0 + rise * 0.9, hd - ov,
    4, y0, -hd + ov, -4, y0, -hd + ov, 0, y0 + rise * 0.9, -hd + ov,
  ];
  roof.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  roof.computeVertexNormals();
  return { walls, roof };
}

export interface Landscape {
  group: THREE.Group;
  /** each frame: hide it under water, sway the trees */
  update(camY: number, t: number): void;
  dispose(): void;
  count: number;
}

/** the land within `radius` of the harbor, at a density 0..1 */
export function buildLandscape(tex: HarborTextures, density: number, radius = 1000): Landscape {
  const group = new THREE.Group();
  group.name = 'landscape';
  const wind = { value: 0 };
  // trees: wind bends them more toward the top
  const treeMat = patchOceanMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), 'land-tree');
  {
    const base = treeMat.onBeforeCompile;
    treeMat.onBeforeCompile = (sh, r) => {
      base.call(treeMat, sh, r);
      sh.uniforms.uWind = wind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  vec3 ip = instanceMatrix[ 3 ].xyz;
  float bend = transformed.y * transformed.y;
  float ph = ip.x * 0.071 + ip.z * 0.053;
  transformed.x += bend * ( 0.035 * sin( uWind * 1.1 + ph ) + 0.012 * sin( uWind * 3.7 + ph * 3.0 ) );
  transformed.z += bend * 0.02 * sin( uWind * 0.9 + ph * 1.7 );
}
#endif`,
        );
      // leaf clumps: light and shade broken up across the foliage
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float lf = fract( sin( dot( floor( vOcWorld * 2.3 ), vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
  diffuseColor.rgb *= 0.78 + 0.4 * lf * step( diffuseColor.r, diffuseColor.g );
}`,
      );
    };
    const k = treeMat.customProgramCacheKey();
    treeMat.customProgramCacheKey = () => k + '-wind';
  }
  const kinds = [pine(), broadleaf(), shrub()];
  const lists: THREE.Matrix4[][] = [[], [], []];
  const tints: THREE.Color[][] = [[], [], []];
  const hb = HARBOR.basin, yard = HARBOR.yard;
  const cx = 0, cz = -260;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const CELL = 11.5;
  const r2 = radius * radius;
  for (let gx = Math.floor((cx - radius) / CELL); gx <= Math.ceil((cx + radius) / CELL); gx++) {
    for (let gz = Math.floor((cz - radius) / CELL); gz <= Math.ceil((cz + 200) / CELL); gz++) {
      const h0 = hash(gx, gz, 1);
      const x = (gx + hash(gx, gz, 2)) * CELL, z = (gz + hash(gx, gz, 3)) * CELL;
      const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      if (d2 > r2) continue;
      // on land, off the beach and the shore road, not on the yard or round the harbor's sheds
      if (z > coastZ(x) - 26) continue;
      if (x > yard.minX - 30 && x < yard.maxX + 30 && z > yard.minZ - 30) continue;
      if (x > hb.minX - 40 && x < hb.maxX + 40 && z > hb.minZ - 10) continue;
      const y = seabedHeight(x, z);
      if (y < 3.2) continue;
      const nr = seabedNormal(x, z, 3);
      if (nr[1] < 0.8) continue;
      // woods in broad stands, open grass between, a few trees and bushes scattered
      const wood = vnoise(x / 170, z / 170, 5) * 0.7 + vnoise(x / 60, z / 60, 9) * 0.3;
      const p = wood > 0.56 ? 0.85 : wood > 0.48 ? 0.35 : 0.06;
      if (h0 > p * density) continue;
      const kind = wood > 0.5 ? (hash(gx, gz, 4) < 0.62 ? 0 : 1) : hash(gx, gz, 4) < 0.45 ? 2 : 1;
      const hgt = kind === 0 ? 11 + 9 * hash(gx, gz, 5) : kind === 1 ? 8 + 6 * hash(gx, gz, 5) : 1.2 + 1.4 * hash(gx, gz, 5);
      const wid = kind === 2 ? hgt * (1.2 + hash(gx, gz, 6) * 0.6) : hgt * (0.8 + 0.3 * hash(gx, gz, 6));
      pos.set(x, y - 0.2, z);
      q.setFromAxisAngle(up, hash(gx, gz, 7) * Math.PI * 2);
      sc.set(wid, hgt, wid);
      m.compose(pos, q, sc);
      lists[kind].push(m.clone());
      const k = 0.82 + 0.36 * hash(gx, gz, 8);
      tints[kind].push(new THREE.Color(k * (0.95 + 0.1 * hash(gx, gz, 9)), k, k * (0.9 + 0.1 * hash(gx, gz, 10))));
    }
  }
  const meshes: THREE.InstancedMesh[] = [];
  kinds.forEach((g, i) => {
    const im = new THREE.InstancedMesh(g, treeMat, Math.max(1, lists[i].length));
    lists[i].forEach((mm, j) => {
      im.setMatrixAt(j, mm);
      im.setColorAt(j, tints[i][j]);
    });
    im.count = lists[i].length;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    im.castShadow = true;
    im.receiveShadow = true;
    im.name = ['pines', 'broadleaves', 'shrubs'][i];
    group.add(im);
    meshes.push(im);
  });
  // the town: rows of houses along the slopes either side of the yard, facing the sea
  const houseMat = patchOceanMaterial(new THREE.MeshStandardMaterial({ map: tex.facade.map, normalMap: tex.facade.normal, roughness: 0.7, metalness: 0 }), 'land-house');
  const roofMat = patchOceanMaterial(new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide }), 'land-roof');
  const hs = house();
  const homes: { m: THREE.Matrix4; wall: THREE.Color; roof: THREE.Color }[] = [];
  const WALLS = [[0.94, 0.92, 0.86], [0.9, 0.84, 0.72], [0.82, 0.86, 0.88], [0.92, 0.8, 0.74], [0.86, 0.88, 0.8], [0.98, 0.97, 0.94]];
  const ROOFS = [[0.22, 0.22, 0.24], [0.42, 0.18, 0.12], [0.3, 0.3, 0.33], [0.35, 0.22, 0.16]];
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 9; i++) {
        const x = side * (300 + i * 22 + row * 7 + (hash(i, row, side + 20) - 0.5) * 8);
        const z = coastZ(x) - 40 - row * 26 - hash(i, row, side + 30) * 8;
        if (hash(i, row, side + 40) > 0.82 * Math.min(1, density + 0.3)) continue;
        // the ground under its four corners: stand on the lowest, the foundation shows on the downhill side
        const ys = [[-4, -5], [4, -5], [-4, 5], [4, 5]].map(([dx, dz]) => seabedHeight(x + dx, z + dz));
        const y = Math.min(...ys);
        if (y < 3) continue;
        const yaw = Math.atan2(0, 1) + (hash(i, row, side + 50) - 0.5) * 0.3;
        pos.set(x, y, z);
        q.setFromAxisAngle(up, yaw);
        sc.set(1, 1, 1);
        const mm = new THREE.Matrix4().compose(pos, q, sc);
        const w = WALLS[Math.floor(hash(i, row, side + 60) * WALLS.length)];
        const rf = ROOFS[Math.floor(hash(i, row, side + 70) * ROOFS.length)];
        homes.push({ m: mm, wall: new THREE.Color(srgb(w[0]), srgb(w[1]), srgb(w[2])), roof: new THREE.Color(srgb(rf[0]), srgb(rf[1]), srgb(rf[2])) });
      }
    }
  }
  const wallsIM = new THREE.InstancedMesh(hs.walls, houseMat, Math.max(1, homes.length));
  const roofIM = new THREE.InstancedMesh(hs.roof, roofMat, Math.max(1, homes.length));
  homes.forEach((h, i) => {
    wallsIM.setMatrixAt(i, h.m);
    wallsIM.setColorAt(i, h.wall);
    roofIM.setMatrixAt(i, h.m);
    roofIM.setColorAt(i, h.roof);
  });
  for (const im of [wallsIM, roofIM]) {
    im.count = homes.length;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  }
  wallsIM.name = 'houses';
  roofIM.name = 'roofs';
  const count = lists.reduce((s, l) => s + l.length, 0) + homes.length;
  return {
    group,
    count,
    update(camY: number, t: number) {
      // (nothing of the land shows through the water from below)
      group.visible = camY > -4;
      wind.value = t;
    },
    dispose() {
      for (const g of kinds) g.dispose();
      hs.walls.dispose();
      hs.roof.dispose();
      treeMat.dispose();
      houseMat.dispose();
      roofMat.dispose();
      for (const im of meshes) im.dispose();
      wallsIM.dispose();
      roofIM.dispose();
    },
  };
}
