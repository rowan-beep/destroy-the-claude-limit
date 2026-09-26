// Pure chunk / tree / grid builders. Runs inside the terrain workers, and on
// the main thread as a fallback when workers are unavailable.

import { terrainInfo, surfaceColor, treeDensity, treeKind, TerrainInfo, terrainHeight } from './terrain';
import { computeGridRows } from './heightGrid';
import { hash2f } from '../core/rng';

export interface ChunkRequest {
  type: 'chunk';
  id: number;
  cx: number;
  cz: number;
  size: number;
  res: number;
  skirt: number;
}

export interface TreeRequest {
  type: 'trees';
  id: number;
  cx: number;
  cz: number;
  size: number;
  spacing: number;
}

export interface GridRequest {
  type: 'grid';
  id: number;
  r0: number;
  r1: number;
}

export type GenRequest = ChunkRequest | TreeRequest | GridRequest;

export interface ChunkResult {
  type: 'chunk';
  id: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Uint8Array;
  minH: number;
  maxH: number;
}

export interface TreeResult {
  type: 'trees';
  id: number;
  /** stride TREE_STRIDE: x, y, z (relative to cell centre), scale, rotY, kind, lodRand */
  data: Float32Array;
  count: number;
}

export interface GridResult {
  type: 'grid';
  id: number;
  r0: number;
  r1: number;
  data: Float32Array;
}

export type GenResult = ChunkResult | TreeResult | GridResult;

export const TREE_STRIDE = 7;

const info: TerrainInfo = { h: 0, island: null, inland: 0, field: 0 };
const col = { r: 0, g: 0, b: 0 };

export function buildChunk(req: ChunkRequest): ChunkResult {
  const { cx, cz, size, res, skirt } = req;
  const step = size / res;
  const vN = res + 1;
  const sN = res + 3; // with a one-sample border for normals
  const x0 = cx - size / 2;
  const z0 = cz - size / 2;

  const hs = new Float32Array(sN * sN);
  for (let j = 0; j < sN; j++) {
    const z = z0 + (j - 1) * step;
    for (let i = 0; i < sN; i++) {
      hs[j * sN + i] = terrainHeight(x0 + (i - 1) * step, z);
    }
  }

  const skirtCount = 4 * vN;
  const total = vN * vN + skirtCount;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colors = new Uint8Array(total * 3);
  let minH = Infinity, maxH = -Infinity;

  for (let j = 0; j < vN; j++) {
    for (let i = 0; i < vN; i++) {
      const si = i + 1, sj = j + 1;
      const x = x0 + i * step;
      const z = z0 + j * step;
      terrainInfo(x, z, info);
      const h = info.h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
      const hl = hs[sj * sN + si - 1];
      const hr = hs[sj * sN + si + 1];
      const hd = hs[(sj - 1) * sN + si];
      const hu = hs[(sj + 1) * sN + si];
      let nx = hl - hr, ny = 2 * step, nz = hd - hu;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const grad = Math.sqrt(nx * nx + nz * nz) / Math.max(ny, 1e-3);
      const slope = Math.min(1, grad / 1.5);
      surfaceColor(x, z, info, slope, col);
      const k = (j * vN + i) * 3;
      positions[k] = x - cx;
      positions[k + 1] = h;
      positions[k + 2] = z - cz;
      normals[k] = nx;
      normals[k + 1] = ny;
      normals[k + 2] = nz;
      colors[k] = Math.min(255, col.r * 255);
      colors[k + 1] = Math.min(255, col.g * 255);
      colors[k + 2] = Math.min(255, col.b * 255);
    }
  }

  // Skirts: duplicate the border ring, dropped down to hide LOD cracks.
  let s = vN * vN;
  const edge = (i: number, j: number) => {
    const src = (j * vN + i) * 3;
    const dst = s * 3;
    positions[dst] = positions[src];
    positions[dst + 1] = positions[src + 1] - skirt;
    positions[dst + 2] = positions[src + 2];
    normals[dst] = normals[src];
    normals[dst + 1] = normals[src + 1];
    normals[dst + 2] = normals[src + 2];
    colors[dst] = colors[src];
    colors[dst + 1] = colors[src + 1];
    colors[dst + 2] = colors[src + 2];
    s++;
  };
  for (let i = 0; i < vN; i++) edge(i, 0); // north edge (z0)
  for (let i = 0; i < vN; i++) edge(i, vN - 1); // south edge
  for (let j = 0; j < vN; j++) edge(0, j); // west edge
  for (let j = 0; j < vN; j++) edge(vN - 1, j); // east edge

  return { type: 'chunk', id: req.id, positions, normals, colors, minH, maxH };
}

/** Triangle indices shared by every chunk of the same resolution (with skirts). */
export function buildChunkIndices(res: number): Uint32Array {
  const vN = res + 1;
  const quads = res * res;
  const skirtQuads = 4 * res;
  const idx = new Uint32Array((quads + skirtQuads) * 6);
  let p = 0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * vN + i;
      const b = a + 1;
      const c = a + vN;
      const d = c + 1;
      // alternate diagonal for a more even look
      if ((i + j) & 1) {
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      } else {
        idx[p++] = a; idx[p++] = c; idx[p++] = d;
        idx[p++] = a; idx[p++] = d; idx[p++] = b;
      }
    }
  }
  const base = vN * vN;
  const N0 = base, S0 = base + vN, W0 = base + 2 * vN, E0 = base + 3 * vN;
  for (let i = 0; i < res; i++) {
    // north edge: grid row 0 (i), skirt N0+i ; faces outward (-z)
    let a = i, b = i + 1, sa = N0 + i, sb = N0 + i + 1;
    idx[p++] = a; idx[p++] = b; idx[p++] = sa;
    idx[p++] = b; idx[p++] = sb; idx[p++] = sa;
    // south edge
    a = (vN - 1) * vN + i; b = a + 1; sa = S0 + i; sb = S0 + i + 1;
    idx[p++] = a; idx[p++] = sa; idx[p++] = b;
    idx[p++] = b; idx[p++] = sa; idx[p++] = sb;
    // west edge
    a = i * vN; b = (i + 1) * vN; sa = W0 + i; sb = W0 + i + 1;
    idx[p++] = a; idx[p++] = sa; idx[p++] = b;
    idx[p++] = b; idx[p++] = sa; idx[p++] = sb;
    // east edge
    a = i * vN + vN - 1; b = (i + 1) * vN + vN - 1; sa = E0 + i; sb = E0 + i + 1;
    idx[p++] = a; idx[p++] = b; idx[p++] = sa;
    idx[p++] = b; idx[p++] = sb; idx[p++] = sa;
  }
  return idx;
}

export function buildTrees(req: TreeRequest): TreeResult {
  const { cx, cz, size, spacing } = req;
  const n = Math.floor(size / spacing);
  const x0 = cx - size / 2;
  const z0 = cz - size / 2;
  const cellI = Math.round(cx / size);
  const cellJ = Math.round(cz / size);
  const tmp: number[] = [];
  const eps = 6;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gi = cellI * n + i;
      const gj = cellJ * n + j;
      const r1 = hash2f(gi, gj, 11);
      const r2 = hash2f(gi, gj, 23);
      const r3 = hash2f(gi, gj, 37);
      const r4 = hash2f(gi, gj, 41);
      const r5 = hash2f(gi, gj, 53);
      const x = x0 + (i + 0.1 + 0.8 * r1) * spacing;
      const z = z0 + (j + 0.1 + 0.8 * r2) * spacing;
      terrainInfo(x, z, info);
      const d0 = treeDensity(x, z, info, 0);
      if (r3 >= d0) continue;
      const h = info.h;
      const hx = terrainHeight(x + eps, z);
      const hz = terrainHeight(x, z + eps);
      const grad = Math.sqrt((hx - h) * (hx - h) + (hz - h) * (hz - h)) / eps;
      const slope = Math.min(1, grad / 1.5);
      const d = treeDensity(x, z, info, slope);
      if (r3 >= d) continue;
      const kind = treeKind(info, r4);
      const scale = 0.75 + 0.6 * r5 * r5 + (kind === 0 && info.island === 'samos' ? 0.15 : 0);
      tmp.push(x - cx, h - 1.2, z - cz, scale, r1 * Math.PI * 2, kind, r2);
    }
  }
  const data = new Float32Array(tmp);
  return { type: 'trees', id: req.id, data, count: tmp.length / TREE_STRIDE };
}

export function handleRequest(req: GenRequest): GenResult {
  if (req.type === 'chunk') return buildChunk(req);
  if (req.type === 'trees') return buildTrees(req);
  const data = computeGridRows(terrainHeight, req.r0, req.r1);
  return { type: 'grid', id: req.id, r0: req.r0, r1: req.r1, data };
}

export function transferables(res: GenResult): Transferable[] {
  if (res.type === 'chunk') return [res.positions.buffer, res.normals.buffer, res.colors.buffer];
  return [res.data.buffer];
}
