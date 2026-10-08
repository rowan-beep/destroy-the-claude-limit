// The seabed and coast as streamed chunks: four levels of detail in rings
// round the camera, built nearest-first (and ahead of the direction of travel)
// within a time budget per frame, swapped in without holes, and disposed of
// when they fall out of range. Only the chunk a mesh belongs to owns its
// geometry; the material is shared.

import * as THREE from 'three';
import { seabedHeight, WORLD, SITES, HARBOR } from '../world/geo';
import { patchOceanMaterial } from './oceanMaterial';

export const CHUNK = 160;
const SEGS = [48, 24, 12, 6];
const SKIRT = 6;

interface Chunk {
  key: string;
  i: number;
  j: number;
  x0: number;
  z0: number;
  mesh: THREE.Mesh | null;
  lod: number;
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

/** build one chunk's geometry at a level of detail (one height sample per vertex) */
export function buildChunkGeometry(x0: number, z0: number, segs: number): THREE.BufferGeometry {
  const step = CHUNK / segs;
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
  private chunks = new Map<string, Chunk>();
  stats: StreamStats = { loaded: 0, built: 0, disposed: 0, maxBuildMs: 0, frameBuildMs: 0, stalls: 0, queued: 0, triangles: 0 };
  /** LOD distances (m) for the finest .. coarsest level */
  lod: [number, number, number, number] = [220, 520, 1100, 2400];
  budgetMs = 3;
  private readonly cols: number;
  private readonly rows: number;

  constructor() {
    this.material = patchOceanMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), 'seabed');
    this.group.name = 'seabed';
    this.cols = Math.ceil((WORLD.maxX - WORLD.minX) / CHUNK) + 4;
    this.rows = Math.ceil((WORLD.maxZ - WORLD.minZ) / CHUNK) + 4;
  }

  private wantLod(d: number): number {
    for (let k = 0; k < 4; k++) if (d < this.lod[k]) return k;
    return -1;
  }

  /**
   * Bring the chunks round (x, z) to the right detail. `ahead` is where the
   * vehicle will be in a few seconds: chunks near it come first.
   */
  update(x: number, z: number, aheadX: number, aheadZ: number): void {
    const t0 = performance.now();
    const far = this.lod[3];
    const i0 = Math.max(0, Math.floor((x - far - WORLD.minX) / CHUNK) + 2), i1 = Math.min(this.cols - 1, Math.floor((x + far - WORLD.minX) / CHUNK) + 2);
    const j0 = Math.max(0, Math.floor((z - far - WORLD.minZ) / CHUNK) + 2), j1 = Math.min(this.rows - 1, Math.floor((z + far - WORLD.minZ) / CHUNK) + 2);
    const todo: { c: Chunk; lod: number; pri: number }[] = [];
    const seen = new Set<string>();
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x0 = WORLD.minX + (i - 2) * CHUNK, z0 = WORLD.minZ + (j - 2) * CHUNK;
        const cx = x0 + CHUNK / 2, cz = z0 + CHUNK / 2;
        // distance to the nearest point of the chunk
        const dx = Math.max(0, Math.abs(x - cx) - CHUNK / 2), dz = Math.max(0, Math.abs(z - cz) - CHUNK / 2);
        const d = Math.hypot(dx, dz);
        const lod = this.wantLod(d);
        if (lod < 0) continue;
        const key = `${i},${j}`;
        seen.add(key);
        let c = this.chunks.get(key);
        if (!c) {
          c = { key, i, j, x0, z0, mesh: null, lod: -1 };
          this.chunks.set(key, c);
        }
        if (c.lod !== lod) {
          const da = Math.hypot(aheadX - cx, aheadZ - cz);
          // missing chunks first, then by distance (now and ahead)
          todo.push({ c, lod, pri: (c.mesh ? 1000 : 0) + Math.min(d, da * 0.8) });
        }
      }
    }
    // out of range: dispose
    for (const [k, c] of this.chunks) {
      if (seen.has(k)) continue;
      if (c.mesh) {
        this.group.remove(c.mesh);
        c.mesh.geometry.dispose();
        this.stats.disposed++;
      }
      this.chunks.delete(k);
    }
    todo.sort((a, b) => a.pri - b.pri);
    let spent = 0;
    for (const t of todo) {
      if (spent > this.budgetMs) break;
      const b0 = performance.now();
      const g = buildChunkGeometry(t.c.x0, t.c.z0, SEGS[t.lod]);
      const mesh = new THREE.Mesh(g, this.material);
      mesh.position.set(t.c.x0, 0, t.c.z0);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.receiveShadow = true;
      // swap: the old level stays until the new one is ready
      if (t.c.mesh) {
        this.group.remove(t.c.mesh);
        t.c.mesh.geometry.dispose();
        this.stats.disposed++;
      }
      t.c.mesh = mesh;
      t.c.lod = t.lod;
      this.group.add(mesh);
      this.stats.built++;
      const ms = performance.now() - b0;
      spent += ms;
      this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, ms);
    }
    let loaded = 0, tris = 0;
    for (const c of this.chunks.values()) if (c.mesh) {
      loaded++;
      tris += (c.mesh.geometry.index?.count ?? 0) / 3;
    }
    this.stats.loaded = loaded;
    this.stats.triangles = tris;
    this.stats.queued = Math.max(0, todo.length - Math.round(spent > 0 ? 1 : 0));
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

  /** chunks not yet at their wanted detail */
  pending(): number {
    return this.stats.queued;
  }

  dispose(): void {
    for (const c of this.chunks.values()) if (c.mesh) {
      c.mesh.geometry.dispose();
      this.group.remove(c.mesh);
    }
    this.chunks.clear();
    this.material.dispose();
  }
}
