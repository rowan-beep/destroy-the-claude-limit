// The sea bed's tile geometry as plain arrays: heights from the region's
// height function, normals across tile edges, the ground's colour (what it is,
// from height, slope and place), and skirts that hide the cracks between levels
// of detail. No three.js here, so a Web Worker can build tiles off the main
// thread with exactly the same result.

import { seabedHeight, SITES, HARBOR } from '../world/geo';

export const CHUNK = 160;
const SKIRT = 6;

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
    // the basin floor: pale grey silt and the shells of plankton (reflects about a quarter of the light)
    r = 0.6 + 0.03 * n; g = 0.58 + 0.03 * n; b = 0.53;
  } else if (ny < 0.86) {
    r = 0.38 + 0.04 * n; g = 0.36 + 0.04 * n; b = 0.33;
  } else {
    r = 0.76 + 0.06 * n; g = 0.7 + 0.06 * n; b = 0.54 + 0.04 * n;
  }
  out[o] = srgb(r);
  out[o + 1] = srgb(g);
  out[o + 2] = srgb(b);
}

/** one tile's vertex and index arrays, exactly sized (they can be handed to another thread) */
export interface ChunkArrays {
  pos: Float32Array;
  nor: Float32Array;
  col: Float32Array;
  idx: Uint32Array;
}

/** build one tile (one height sample per vertex), with skirts round its edges */
export function buildChunkArrays(x0: number, z0: number, segs: number, size = CHUNK): ChunkArrays {
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
  return { pos: pos.slice(0, v * 3), nor: nor.slice(0, v * 3), col: col.slice(0, v * 3), idx: Uint32Array.from(idx) };
}

