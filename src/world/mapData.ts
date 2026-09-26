// Digital map data for the cockpit moving map (TSD / SA / PA pages):
// coastline and contour vectors extracted from the theater height grid with
// marching squares, bucketed into tiles for fast culling, plus a dark,
// hill-shaded raster underlay.

import type { HeightGrid } from './heightGrid';
import { MAP_HALF, MAP_SIZE } from '../core/constants';
import { clamp } from '../core/math';

export interface ContourSet {
  level: number;
  /** tile index -> flat list of segments [x1, z1, x2, z2, ...] in world metres */
  tiles: Map<number, Float32Array>;
}

export const MAP_TILE = 20000;
const TILES_PER_SIDE = Math.ceil(MAP_SIZE / MAP_TILE);

export function tileIndex(x: number, z: number): number {
  const i = clamp(Math.floor((x + MAP_HALF) / MAP_TILE), 0, TILES_PER_SIDE - 1);
  const j = clamp(Math.floor((z + MAP_HALF) / MAP_TILE), 0, TILES_PER_SIDE - 1);
  return j * TILES_PER_SIDE + i;
}

/** Tiles overlapping a world-space box. */
export function tilesInBox(x0: number, z0: number, x1: number, z1: number): number[] {
  const i0 = clamp(Math.floor((x0 + MAP_HALF) / MAP_TILE), 0, TILES_PER_SIDE - 1);
  const i1 = clamp(Math.floor((x1 + MAP_HALF) / MAP_TILE), 0, TILES_PER_SIDE - 1);
  const j0 = clamp(Math.floor((z0 + MAP_HALF) / MAP_TILE), 0, TILES_PER_SIDE - 1);
  const j1 = clamp(Math.floor((z1 + MAP_HALF) / MAP_TILE), 0, TILES_PER_SIDE - 1);
  const out: number[] = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(j * TILES_PER_SIDE + i);
  return out;
}

/** Marching squares over the whole grid for one height level. */
export function extractContour(grid: HeightGrid, level: number): ContourSet {
  const N = grid.n;
  const d = grid.data;
  const sp = grid.spacing;
  const buckets = new Map<number, number[]>();
  const push = (x1: number, z1: number, x2: number, z2: number) => {
    const t = tileIndex((x1 + x2) * 0.5, (z1 + z2) * 0.5);
    let b = buckets.get(t);
    if (!b) buckets.set(t, (b = []));
    b.push(x1, z1, x2, z2);
  };
  for (let j = 0; j < N - 1; j++) {
    const row = j * N;
    for (let i = 0; i < N - 1; i++) {
      const a = d[row + i];
      const b = d[row + i + 1];
      const c = d[row + N + i + 1];
      const e = d[row + N + i];
      // quick reject: all on one side
      const mn = Math.min(a, b, c, e);
      const mx = Math.max(a, b, c, e);
      if (mn > level || mx <= level) continue;
      const x0 = -MAP_HALF + i * sp;
      const z0 = -MAP_HALF + j * sp;
      // edge crossing points: top (a-b), right (b-c), bottom (e-c), left (a-e)
      const pts: number[] = [];
      const cross = (h1: number, h2: number, xa: number, za: number, xb: number, zb: number) => {
        if ((h1 > level) === (h2 > level)) return;
        const t = (level - h1) / (h2 - h1);
        pts.push(xa + (xb - xa) * t, za + (zb - za) * t);
      };
      cross(a, b, x0, z0, x0 + sp, z0);
      cross(b, c, x0 + sp, z0, x0 + sp, z0 + sp);
      cross(c, e, x0 + sp, z0 + sp, x0, z0 + sp);
      cross(e, a, x0, z0 + sp, x0, z0);
      if (pts.length === 4) push(pts[0], pts[1], pts[2], pts[3]);
      else if (pts.length === 8) {
        // saddle: resolve with the centre value
        const ctr = (a + b + c + e) * 0.25;
        if (ctr > level === a > level) {
          push(pts[0], pts[1], pts[6], pts[7]);
          push(pts[2], pts[3], pts[4], pts[5]);
        } else {
          push(pts[0], pts[1], pts[2], pts[3]);
          push(pts[4], pts[5], pts[6], pts[7]);
        }
      }
    }
  }
  const tiles = new Map<number, Float32Array>();
  for (const [k, v] of buckets) tiles.set(k, new Float32Array(v));
  return { level, tiles };
}

/** Colour of one map pixel: dark sea, hill-shaded land lit from the north-west. */
function shade(h: number, hx: number, hz: number, step: number, out: Uint8ClampedArray, k: number): void {
  let r: number, gg: number, b: number;
  if (h <= 0) {
    const deep = clamp(-h / 250, 0, 1);
    r = 6 + 8 * (1 - deep);
    gg = 18 + 22 * (1 - deep);
    b = 34 + 30 * (1 - deep);
  } else {
    // slopes rising to the east face the light, slopes rising to the north face away
    const sx = (hx - h) / step;
    const sz = (hz - h) / step;
    const sh = clamp(0.95 + sx * 2.2 - sz * 2.2, 0.35, 1.5);
    const t = clamp(h / 3800, 0, 1);
    r = (40 + 50 * t) * sh;
    gg = (46 + 38 * t) * sh;
    b = (30 + 34 * t) * sh;
  }
  out[k] = r;
  out[k + 1] = gg;
  out[k + 2] = b;
  out[k + 3] = 255;
}

/** Dark hill-shaded raster of the whole theater for the moving map. */
export function renderTsdRaster(grid: HeightGrid, size: number): HTMLCanvasElement {
  return renderRegion(grid, -MAP_HALF, -MAP_HALF, MAP_SIZE, size, size);
}

/** Hill-shaded raster of a region (x0, z0 = north-west corner, span across). */
export function renderRegion(grid: HeightGrid, x0: number, z0: number, span: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const step = span / w;
  const lightStep = Math.max(step, grid.spacing * 0.5);
  for (let j = 0; j < h; j++) {
    const z = z0 + (j + 0.5) * step;
    for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * step;
      const hh = grid.height(x, z);
      shade(hh, hh > 0 ? grid.height(x + lightStep, z) : 0, hh > 0 ? grid.height(x, z - lightStep) : 0, lightStep, img.data, (j * w + i) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export class MapData {
  coast: ContourSet | null = null;
  contours: ContourSet[] = [];
  raster: HTMLCanvasElement | null = null;

  constructor(readonly grid: HeightGrid) {}

  /** A crisp local relief map (debrief, zoomed views). */
  region(x0: number, z0: number, span: number, w: number, h: number): HTMLCanvasElement {
    return renderRegion(this.grid, x0, z0, span, w, h);
  }

  get ready(): boolean {
    return !!this.coast;
  }

  /** Build everything, yielding between steps so the loading screen can update. */
  async build(onProgress?: (f: number) => void): Promise<void> {
    const grid = this.grid;
    const steps: (() => void)[] = [
      () => (this.coast = extractContour(grid, 0)),
      () => this.contours.push(extractContour(grid, 1000)),
      () => this.contours.push(extractContour(grid, 2000)),
      () => this.contours.push(extractContour(grid, 3000)),
      () => (this.raster = renderTsdRaster(grid, 1536)),
    ];
    for (let i = 0; i < steps.length; i++) {
      steps[i]();
      onProgress?.((i + 1) / steps.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}
