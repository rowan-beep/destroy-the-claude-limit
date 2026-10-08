// The seabed and coast as streamed tiles in a three-level quadtree round the
// camera: 160 m tiles near (at two densities), 320 m tiles in the middle
// distance and 640 m tiles far out, all of 24-48 cells, so the far sea bed
// costs a few dozen draws instead of hundreds. Tiles are built nearest-first
// (and ahead of the direction of travel) within a time budget per frame; a tile
// that is no longer wanted stays until everything that replaces it is built, so
// no holes open; tiles out of range are disposed of. The material is shared.

import * as THREE from 'three';
import { seabedHeight, WORLD, SITES, HARBOR } from '../world/geo';
import { patchOceanMaterial } from './oceanMaterial';

export const CHUNK = 160;
const SKIRT = 6;
/** tile sizes of the three levels (m) and their cells across */
const SIZE = [160, 320, 640];

interface Tile {
  key: string;
  x0: number;
  z0: number;
  size: number;
  segs: number;
  mesh: THREE.Mesh;
}

interface Want {
  key: string;
  x0: number;
  z0: number;
  size: number;
  segs: number;
  pri: number;
}

export interface StreamStats {
  loaded: number;
  /** chunk meshes built in total, and disposed of */
  built: number;
  disposed: number;
  /** slowest single chunk build (ms) */
  maxBuildMs: number;
  /** build work in the last frame (ms) */
  frameBuildMs: number;
  /** frames whose streaming work went over 8 ms */
  stalls: number;
  /** chunks waiting */
  queued: number;
  triangles: number;
}

const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** colour of the ground: what it is, from height, slope and place */
function groundColor(x: number, z: number, h: number, ny: number, out: number[], o: number): void {
  let r: number, g: number, b: number;
  const n = Math.sin(x * 0.11 + z * 0.07) * 0.5 + Math.sin(x * 0.031 - z * 0.043) * 0.5;
  const hb = HARBOR.basin;
  const reefD = Math.hypot(x - SITES.reef.x, z - SITES.reef.z);
  if (h > 0.5) {
    // land: dry grass and scrub, grey rock on the steep
    r = 0.38 + 0.05 * n; g = 0.4 + 0.05 * n; b = 0.24;
    if (ny < 0.8) { r = 0.44; g = 0.42; b = 0.38; }
    if (h < 2.2) { r = 0.78; g = 0.72; b = 0.56; }
  } else if (x > hb.minX && x < hb.maxX && z > hb.minZ - 10 && z < hb.maxZ) {
    r = 0.55 + 0.04 * n; g = 0.52 + 0.04 * n; b = 0.44;
  } else if (reefD < SITES.reef.r && h > -34) {
    // the reef: warm, varied colours
    const k = 0.5 + 0.5 * Math.sin(x * 0.09) * Math.cos(z * 0.08);
    r = 0.62 + 0.25 * k; g = 0.4 + 0.12 * n; b = 0.42 + 0.25 * (1 - k);
    if (ny > 0.95) { r = 0.8; g = 0.74; b = 0.58; }
  } else if (h < -150) {
    r = 0.33; g = 0.33; b = 0.32;
  } else if (ny < 0.86) {
    r = 0.38 + 0.04 * n; g = 0.36 + 0.04 * n; b = 0.33;
  } else {
    r = 0.76 + 0.06 * n; g = 0.7 + 0.06 * n; b = 0.54 + 0.04 * n;
  }
  out[o] = srgb(r);
  out[o + 1] = srgb(g);
  out[o + 2] = srgb(b);
}

/** build one tile's geometry (one height sample per vertex) */
export function buildChunkGeometry(x0: number, z0: number, segs: number, size = CHUNK): THREE.BufferGeometry {
  const step = size / segs;
  const n = segs + 1;
  // heights with a one-sample border, for normals across chunk edges
  const W = n + 2;
  const hs = new Float32Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) hs[j * W + i] = seabedHeight(x0 + (i - 1) * step, z0 + (j - 1) * step);
  const skirtN = segs * 4;
  const vcount = n * n + skirtN * 2;
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const col = new Float32Array(vcount * 3);
  let v = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = hs[(j + 1) * W + (i + 1)];
      const hx = hs[(j + 1) * W + (i + 2)] - hs[(j + 1) * W + i];
      const hz = hs[(j + 2) * W + (i + 1)] - hs[j * W + (i + 1)];
      let nx = -hx, ny = 2 * step, nz = -hz;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      pos[v * 3] = i * step;
      pos[v * 3 + 1] = h;
      pos[v * 3 + 2] = j * step;
      nor[v * 3] = nx;
      nor[v * 3 + 1] = ny;
      nor[v * 3 + 2] = nz;
      groundColor(x0 + i * step, z0 + j * step, h, ny, col as unknown as number[], v * 3);
      v++;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // skirts: a curtain hanging from every edge hides the cracks between levels of detail
  const edge: number[] = [];
  for (let i = 0; i < segs; i++) edge.push(i);
  for (let j = 0; j < segs; j++) edge.push(j * n + segs);
  for (let i = segs; i > 0; i--) edge.push(segs * n + i);
  for (let j = segs; j > 0; j--) edge.push(j * n);
  const base = v;
  for (let k = 0; k < edge.length; k++) {
    const src = edge[k];
    pos[v * 3] = pos[src * 3];
    pos[v * 3 + 1] = pos[src * 3 + 1] - SKIRT;
    pos[v * 3 + 2] = pos[src * 3 + 2];
    for (let c = 0; c < 3; c++) {
      nor[v * 3 + c] = nor[src * 3 + c];
      col[v * 3 + c] = col[src * 3 + c];
    }
    v++;
  }
  for (let k = 0; k < edge.length; k++) {
    const a = edge[k], b = edge[(k + 1) % edge.length];
    const sa = base + k, sb = base + ((k + 1) % edge.length);
    idx.push(a, b, sa, b, sb, sa);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class SeabedStreamer {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshLambertMaterial;
  private tiles = new Map<string, Tile>();
  stats: StreamStats = { loaded: 0, built: 0, disposed: 0, maxBuildMs: 0, frameBuildMs: 0, stalls: 0, queued: 0, triangles: 0 };
  /** distances (m): the finest 160 m tiles within lod[0], 160 m tiles within lod[1], 320 m within lod[2], 640 m within lod[3] */
  lod: [number, number, number, number] = [220, 520, 1100, 2400];
  budgetMs = 3;
  /** the tile grid's origin: 640 m tiles covering the area with a margin */
  private readonly ox = WORLD.minX - 320;
  private readonly oz = WORLD.minZ - 320;
  private readonly nx = Math.ceil((WORLD.maxX - WORLD.minX + 640) / 640);
  private readonly nz = Math.ceil((WORLD.maxZ - WORLD.minZ + 640) / 640);

  constructor() {
    this.material = patchOceanMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), 'seabed');
    this.group.name = 'seabed';
  }

  /** the tiles wanted round (x, z): the quadtree cut by distance */
  private wanted(x: number, z: number, ax: number, az: number): Map<string, Want> {
    const out = new Map<string, Want>();
    const near = (x0: number, z0: number, size: number) => {
      const dx = Math.max(0, Math.abs(x - (x0 + size / 2)) - size / 2), dz = Math.max(0, Math.abs(z - (z0 + size / 2)) - size / 2);
      return Math.hypot(dx, dz);
    };
    const add = (x0: number, z0: number, size: number, segs: number, d: number) => {
      const key = `${size}:${x0}:${z0}:${segs}`;
      const da = Math.hypot(ax - (x0 + size / 2), az - (z0 + size / 2)) - size / 2;
      out.set(key, { key, x0, z0, size, segs, pri: Math.min(d, Math.max(0, da) * 0.8) });
    };
    const [l0, l1, l2, l3] = this.lod;
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x2 = this.ox + i * 640, z2 = this.oz + j * 640;
        const d2 = near(x2, z2, 640);
        if (d2 >= l3) continue;
        if (d2 >= l2) {
          add(x2, z2, 640, 24, d2);
          continue;
        }
        for (let b = 0; b < 2; b++) {
          for (let a = 0; a < 2; a++) {
            const x1 = x2 + a * 320, z1 = z2 + b * 320;
            const d1 = near(x1, z1, 320);
            if (d1 >= l1) {
              add(x1, z1, 320, 24, d1);
              continue;
            }
            for (let q = 0; q < 2; q++) {
              for (let p = 0; p < 2; p++) {
                const x0 = x1 + p * 160, z0 = z1 + q * 160;
                const d0 = near(x0, z0, 160);
                add(x0, z0, 160, d0 < l0 ? 48 : 24, d0);
              }
            }
          }
        }
      }
    }
    return out;
  }

  /**
   * Bring the tiles round (x, z) to the right detail. `ahead` is where the
   * vehicle will be in a few seconds: tiles near it come first.
   */
  update(x: number, z: number, aheadX: number, aheadZ: number): void {
    const t0 = performance.now();
    const want = this.wanted(x, z, aheadX, aheadZ);
    // build what is missing, nearest first, within the budget
    const todo = [...want.values()].filter((w) => !this.tiles.has(w.key)).sort((a, b) => a.pri - b.pri);
    let spent = 0, built = 0;
    for (const w of todo) {
      if (spent > this.budgetMs) break;
      const b0 = performance.now();
      const g = buildChunkGeometry(w.x0, w.z0, w.segs, w.size);
      const mesh = new THREE.Mesh(g, this.material);
      mesh.position.set(w.x0, 0, w.z0);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.receiveShadow = true;
      this.tiles.set(w.key, { key: w.key, x0: w.x0, z0: w.z0, size: w.size, segs: w.segs, mesh });
      this.group.add(mesh);
      this.stats.built++;
      built++;
      const ms = performance.now() - b0;
      spent += ms;
      this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, ms);
    }
    // release what is no longer wanted, once whatever covers its ground is in
    if (built || todo.length === 0 || this.tiles.size > want.size) {
      const missing = todo.slice(built);
      for (const [k, t] of this.tiles) {
        if (want.has(k)) continue;
        const covered = !missing.some((m) => m.x0 < t.x0 + t.size && m.x0 + m.size > t.x0 && m.z0 < t.z0 + t.size && m.z0 + m.size > t.z0);
        if (!covered) continue;
        this.group.remove(t.mesh);
        t.mesh.geometry.dispose();
        this.tiles.delete(k);
        this.stats.disposed++;
      }
    }
    let tris = 0;
    for (const t of this.tiles.values()) tris += (t.mesh.geometry.index?.count ?? 0) / 3;
    this.stats.loaded = this.tiles.size;
    this.stats.triangles = tris;
    this.stats.queued = Math.max(0, todo.length - built);
    const total = performance.now() - t0;
    this.stats.frameBuildMs = total;
    if (total > 8) this.stats.stalls++;
  }

  /** build everything in range right now (a loading screen moment, not during play) */
  fill(x: number, z: number): void {
    const b = this.budgetMs;
    this.budgetMs = 1e9;
    this.update(x, z, x, z);
    this.budgetMs = b;
  }

  /** tiles not yet at their wanted detail */
  pending(): number {
    return this.stats.queued;
  }

  dispose(): void {
    for (const t of this.tiles.values()) {
      t.mesh.geometry.dispose();
      this.group.remove(t.mesh);
    }
    this.tiles.clear();
    this.material.dispose();
  }
}
