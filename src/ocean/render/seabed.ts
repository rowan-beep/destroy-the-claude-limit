// The seabed and coast as streamed tiles in a three-level quadtree round the
// camera: 160 m tiles near (at two densities), 320 m tiles in the middle
// distance and 640 m tiles far out, all of 24-48 cells, so the far sea bed
// costs a few dozen draws instead of hundreds. Tiles are built nearest-first
// (and ahead of the direction of travel) within a time budget per frame; a tile
// that is no longer wanted stays until everything that replaces it is built, so
// no holes open; tiles out of range are disposed of. The material is shared.

import * as THREE from 'three';
import { WORLD } from '../world/geo';
import { patchOceanMaterial } from './oceanMaterial';
import { addSeabedDetail } from './seabedDetail';
import { buildChunkArrays, CHUNK, type ChunkArrays } from './seabedArrays';
import type { TileRequest } from './seabedWorker';
import SeabedWorker from './seabedWorker?worker&inline';

export { CHUNK };
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
  /** slowest single chunk build during play (ms, on the main thread; fills not counted) */
  maxBuildMs: number;
  /** build work in the last frame (ms) */
  frameBuildMs: number;
  /** frames of play whose streaming work went over 8 ms (fills, which are loading moments, not counted) */
  stalls: number;
  /** chunks waiting */
  queued: number;
  triangles: number;
  /** tiles built on the worker thread, and the slowest of those (ms, off the main thread) */
  workerBuilt: number;
  workerMaxMs: number;
}

/** a tile's arrays as a three.js geometry */
export function chunkGeometry(a: ChunkArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
  g.setIndex(new THREE.BufferAttribute(a.idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** build one tile's geometry here, on this thread */
export function buildChunkGeometry(x0: number, z0: number, segs: number, size = CHUNK): THREE.BufferGeometry {
  return chunkGeometry(buildChunkArrays(x0, z0, segs, size));
}

export class SeabedStreamer {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshLambertMaterial;
  private tiles = new Map<string, Tile>();
  stats: StreamStats = { loaded: 0, built: 0, disposed: 0, maxBuildMs: 0, frameBuildMs: 0, stalls: 0, queued: 0, triangles: 0, workerBuilt: 0, workerMaxMs: 0 };
  /** the tile builder thread, when there is one; requests out and answers back */
  private worker: Worker | null = null;
  private inFlight = new Set<string>();
  private ready = new Map<string, ChunkArrays>();
  /** tiles asked of the worker at once (nearest first) */
  maxInFlight = 4;
  /** distances (m): the finest 160 m tiles within lod[0], 160 m tiles within lod[1], 320 m within lod[2], 640 m within lod[3] */
  lod: [number, number, number, number] = [220, 520, 1100, 2400];
  budgetMs = 3;
  /** the tile grid's origin: 640 m tiles covering the area with a margin */
  private readonly ox = WORLD.minX - 320;
  private readonly oz = WORLD.minZ - 320;
  private readonly nx = Math.ceil((WORLD.maxX - WORLD.minX + 640) / 640);
  private readonly nz = Math.ceil((WORLD.maxZ - WORLD.minZ + 640) / 640);

  constructor() {
    this.material = addSeabedDetail(patchOceanMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), 'seabed'));
    this.group.name = 'seabed';
  }

  /**
   * Build tiles on a worker thread from now on (in a browser). If the worker
   * cannot start or fails, tiles are built here as before.
   */
  useWorker(on = true): boolean {
    if (!on) {
      this.dropWorker();
      this.ready.clear();
      return false;
    }
    if (this.worker || typeof Worker === 'undefined') return !!this.worker;
    try {
      this.attachWorker(new SeabedWorker());
    } catch {
      this.worker = null;
    }
    return !!this.worker;
  }

  /** take tile answers from this worker (or anything that speaks like one) */
  attachWorker(w: Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>): void {
    w.onmessage = (e: MessageEvent<ChunkArrays & { key: string; ms: number }>) => {
      const d = e.data;
      this.inFlight.delete(d.key);
      this.ready.set(d.key, { pos: d.pos, nor: d.nor, col: d.col, idx: d.idx });
      this.stats.workerBuilt++;
      this.stats.workerMaxMs = Math.max(this.stats.workerMaxMs, d.ms);
    };
    w.onerror = () => this.dropWorker();
    this.worker = w as Worker;
  }

  /** back to building on this thread (the worker failed) */
  private dropWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight.clear();
  }

  get workerActive(): boolean {
    return !!this.worker;
  }

  private addTile(w: Want, g: THREE.BufferGeometry): void {
    const mesh = new THREE.Mesh(g, this.material);
    mesh.position.set(w.x0, 0, w.z0);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = true;
    this.tiles.set(w.key, { key: w.key, x0: w.x0, z0: w.z0, size: w.size, segs: w.segs, mesh });
    this.group.add(mesh);
    this.stats.built++;
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
  update(x: number, z: number, aheadX: number, aheadZ: number, sync = false): void {
    const t0 = performance.now();
    const want = this.wanted(x, z, aheadX, aheadZ);
    // build what is missing, nearest first, within the budget
    const todo = [...want.values()].filter((w) => !this.tiles.has(w.key)).sort((a, b) => a.pri - b.pri);
    let spent = 0;
    const done = new Set<string>();
    if (this.worker && !sync) {
      // answers from the worker: only the arrays are new, making the mesh is quick
      for (const w of todo) {
        if (spent > this.budgetMs) break;
        const a = this.ready.get(w.key);
        if (!a) continue;
        const b0 = performance.now();
        this.ready.delete(w.key);
        this.addTile(w, chunkGeometry(a));
        done.add(w.key);
        const ms = performance.now() - b0;
        spent += ms;
        if (!sync) this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, ms);
      }
      // (answers for tiles no longer wanted are dropped)
      for (const k of this.ready.keys()) if (!want.has(k)) this.ready.delete(k);
      // ask for the nearest that are still missing
      for (const w of todo) {
        if (this.inFlight.size >= this.maxInFlight) break;
        if (done.has(w.key) || this.inFlight.has(w.key) || this.ready.has(w.key)) continue;
        this.inFlight.add(w.key);
        const req: TileRequest = { key: w.key, x0: w.x0, z0: w.z0, size: w.size, segs: w.segs };
        this.worker.postMessage(req);
      }
    } else {
      for (const w of todo) {
        if (spent > this.budgetMs) break;
        const b0 = performance.now();
        this.addTile(w, buildChunkGeometry(w.x0, w.z0, w.segs, w.size));
        done.add(w.key);
        const ms = performance.now() - b0;
        spent += ms;
        if (!sync) this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, ms);
      }
    }
    const built = done.size;
    // release what is no longer wanted, once whatever covers its ground is in
    if (built || todo.length === 0 || this.tiles.size > want.size) {
      const missing = todo.filter((w) => !done.has(w.key));
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
    if (total > 8 && !sync) this.stats.stalls++;
  }

  /** build everything in range right now (a loading screen moment, not during play) */
  fill(x: number, z: number): void {
    const b = this.budgetMs;
    this.budgetMs = 1e9;
    this.update(x, z, x, z, true);
    this.budgetMs = b;
  }

  /** tiles not yet at their wanted detail */
  pending(): number {
    return this.stats.queued;
  }

  dispose(): void {
    this.dropWorker();
    this.ready.clear();
    for (const t of this.tiles.values()) {
      t.mesh.geometry.dispose();
      this.group.remove(t.mesh);
    }
    this.tiles.clear();
    this.material.dispose();
  }
}
