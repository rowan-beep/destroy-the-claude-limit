// Coarse whole-theater height grid (400 m spacing). Built once in the
// terrain workers, then used for everything that needs *lots* of height
// lookups quickly: radar / IRST / missile-seeker line of sight with earth
// curvature, AI terrain awareness, the theater map and terrain LOD culling.

import { MAP_HALF, MAP_SIZE, MAX_TERRAIN_HEIGHT, EARTH_RADIUS, RADAR_K_FACTOR } from '../core/constants';

export const GRID_SPACING = 400;
export const GRID_N = Math.round(MAP_SIZE / GRID_SPACING) + 1; // 1853

export class HeightGrid {
  readonly n = GRID_N;
  readonly spacing = GRID_SPACING;
  readonly data: Float32Array;
  /** Max-height pyramid: level k has cells of 2^k grid spacings. */
  private maxLevels: { n: number; data: Float32Array }[] = [];

  constructor(data: Float32Array) {
    this.data = data;
    this.buildPyramid();
  }

  private buildPyramid(): void {
    // level 0: cell (i,j) covers samples i..i+1, j..j+1
    let n = this.n - 1;
    let lvl = new Float32Array(n * n);
    const d = this.data;
    const N = this.n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * N + i;
        lvl[j * n + i] = Math.max(d[k], d[k + 1], d[k + N], d[k + N + 1]);
      }
    }
    this.maxLevels.push({ n, data: lvl });
    while (n > 1) {
      const m = Math.ceil(n / 2);
      const next = new Float32Array(m * m);
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < m; i++) {
          let mx = -1e9;
          for (let b = 0; b < 2; b++) {
            const jj = j * 2 + b;
            if (jj >= n) continue;
            for (let a = 0; a < 2; a++) {
              const ii = i * 2 + a;
              if (ii >= n) continue;
              const v = lvl[jj * n + ii];
              if (v > mx) mx = v;
            }
          }
          next[j * m + i] = mx;
        }
      }
      this.maxLevels.push({ n: m, data: next });
      lvl = next;
      n = m;
    }
  }

  /** Bilinear height at world x,z. */
  height(x: number, z: number): number {
    const fx = (x + MAP_HALF) / GRID_SPACING;
    const fz = (z + MAP_HALF) / GRID_SPACING;
    if (fx < 0 || fz < 0 || fx >= this.n - 1 || fz >= this.n - 1) return -460;
    const i = fx | 0;
    const j = fz | 0;
    const tx = fx - i;
    const tz = fz - j;
    const N = this.n;
    const k = j * N + i;
    const d = this.data;
    const a = d[k] + (d[k + 1] - d[k]) * tx;
    const b = d[k + N] + (d[k + N + 1] - d[k + N]) * tx;
    return a + (b - a) * tz;
  }

  /** Maximum terrain height inside the axis-aligned rectangle (conservative). */
  maxInRect(x0: number, z0: number, x1: number, z1: number): number {
    const i0 = Math.max(0, Math.floor((x0 + MAP_HALF) / GRID_SPACING));
    const j0 = Math.max(0, Math.floor((z0 + MAP_HALF) / GRID_SPACING));
    const i1 = Math.min(this.n - 2, Math.floor((x1 + MAP_HALF) / GRID_SPACING));
    const j1 = Math.min(this.n - 2, Math.floor((z1 + MAP_HALF) / GRID_SPACING));
    if (i1 < i0 || j1 < j0) return -460;
    // choose a pyramid level so that we scan at most ~8x8 cells
    const span = Math.max(i1 - i0 + 1, j1 - j0 + 1);
    let lvl = 0;
    while ((span >> lvl) > 8 && lvl < this.maxLevels.length - 1) lvl++;
    const L = this.maxLevels[lvl];
    const a0 = i0 >> lvl, a1 = i1 >> lvl, b0 = j0 >> lvl, b1 = j1 >> lvl;
    let mx = -1e9;
    for (let j = b0; j <= b1; j++) {
      for (let i = a0; i <= a1; i++) {
        const v = L.data[j * L.n + i];
        if (v > mx) mx = v;
      }
    }
    return mx;
  }

  /**
   * Line of sight between two points, accounting for terrain and earth
   * curvature (4/3 effective earth radius for radar refraction). Returns
   * true when the path is clear.
   */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number, margin = 0): boolean {
    const dx = bx - ax, dz = bz - az;
    const D = Math.sqrt(dx * dx + dz * dz);
    if (D < 1) return true;
    const Re = EARTH_RADIUS * RADAR_K_FACTOR;
    // Earth bulge at the midpoint relative to the chord.
    const bulgeMid = (D * D) / (8 * Re);
    const minY = Math.min(ay, by);
    // Fast accept: the whole ray above the tallest mountain + bulge.
    if (minY > MAX_TERRAIN_HEIGHT + bulgeMid + margin) return true;
    // Fast reject: sea-level radar horizon exceeded (smooth earth).
    const ha = Math.max(ay, 1), hb = Math.max(by, 1);
    const horizon = Math.sqrt(2 * Re * ha) + Math.sqrt(2 * Re * hb);
    if (D > horizon) return false;

    const steps = Math.max(4, Math.ceil(D / (GRID_SPACING * 0.9)));
    const inv = 1 / steps;
    for (let s = 1; s < steps; s++) {
      const t = s * inv;
      const rayY = ay + (by - ay) * t;
      const dist = t * D;
      const bulge = (dist * (D - dist)) / (2 * Re);
      if (rayY - bulge > MAX_TERRAIN_HEIGHT + margin) continue;
      const h = this.height(ax + dx * t, az + dz * t);
      const ground = (h > 0 ? h : 0) + bulge + margin;
      if (rayY < ground) return false;
    }
    return true;
  }

  /**
   * First terrain intersection along a ray (for AI ground avoidance).
   * Returns the distance to impact or Infinity.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, clearance = 0): number {
    const step = GRID_SPACING * 0.5;
    const n = Math.ceil(maxDist / step);
    for (let s = 1; s <= n; s++) {
      const d = Math.min(maxDist, s * step);
      const y = oy + dy * d;
      if (y > MAX_TERRAIN_HEIGHT + clearance) {
        if (dy >= 0) return Infinity;
        continue;
      }
      const h = this.height(ox + dx * d, oz + dz * d);
      if (y < Math.max(h, 0) + clearance) return d;
    }
    return Infinity;
  }
}

/** Compute rows [r0, r1) of the grid with the given height function. */
export function computeGridRows(heightFn: (x: number, z: number) => number, r0: number, r1: number): Float32Array {
  const N = GRID_N;
  const out = new Float32Array((r1 - r0) * N);
  for (let j = r0; j < r1; j++) {
    const z = -MAP_HALF + j * GRID_SPACING;
    const row = (j - r0) * N;
    for (let i = 0; i < N; i++) {
      out[row + i] = heightFn(-MAP_HALF + i * GRID_SPACING, z);
    }
  }
  return out;
}
