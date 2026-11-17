// Dune Sea: half-buried stone ruins and crashed jets (models built in code).
//
// Everything is merged into one non-indexed BufferGeometry with position, normal and
// colour (linear RGB). Local y = 0 is the sand surface; stone below it is buried and
// mostly left out. Stone is faceted (flat normals); sand drifts are smooth, meet y = 0
// with zero slope and carry exactly the terrain sand colour. Wind blows toward +x, so
// drifts bank up on the -x side of things. Deterministic: only the given rnd is used.

import * as THREE from 'three';

type V = [number, number, number];
type RGB = [number, number, number];
type Rnd = () => number;

// ---------------------------------------------------------------- colour + maths
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const srgb = (r: number, g: number, b: number): RGB => [lin(r), lin(g), lin(b)];
const SAND: RGB = srgb(0.86, 0.71, 0.48);
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mixC = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulC = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const rr = (rnd: Rnd, a: number, b: number) => a + (b - a) * rnd();
const pick = <T,>(rnd: Rnd, a: T[]): T => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(Math.floor(x * 64) | 0, 374761393) ^ Math.imul(Math.floor(y * 64) | 0, 668265263) ^ Math.imul(Math.floor(z * 64) | 0, 2147483647 - 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function lh(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(lh(xi, yi, zi), lh(xi + 1, yi, zi), fx), l(lh(xi, yi + 1, zi), lh(xi + 1, yi + 1, zi), fx), fy),
    l(l(lh(xi, yi, zi + 1), lh(xi + 1, yi, zi + 1), fx), l(lh(xi, yi + 1, zi + 1), lh(xi + 1, yi + 1, zi + 1), fx), fy),
    fz,
  );
}

/** Two stones: honey-gold limestone (temples, walls) and pale cream marble (streets, facades, theatre, forum). Block to block only +-4%. */
let TONE: 'honey' | 'marble' = 'honey';
function stoneCol(rnd: Rnd): RGB {
  const k = 0.96 + 0.08 * rnd();
  const [r, g, b] = TONE === 'honey' ? [0.84, 0.79, 0.68] : [0.91, 0.88, 0.82];
  return srgb(clamp(r * k), clamp(g * k * (0.99 + 0.02 * rnd())), clamp(b * k * (0.99 + 0.02 * rnd())));
}

// ---------------------------------------------------------------- mesh builder
const KIND_STONE = 0, KIND_SAND = 1, KIND_METAL = 2, KIND_RAW = 3;

class Mesh {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  kind: number[] = [];
  m = new THREE.Matrix4();
  private st: THREE.Matrix4[] = [];
  /** 0..1: how much dust lies on upward-facing metal */
  dust = 0.4;
  /** 1 / the scale the model will be built at (so weathering gradients keep their proportions) */
  unit = 1;
  /** tileable sections: keep everything inside |z| <= zLim */
  zLim = 0;

  push(mx: THREE.Matrix4) { this.st.push(this.m); this.m = this.m.clone().multiply(mx); }
  pop() { this.m = this.st.pop()!; }

  /** Add a triangle (local coordinates). Without n the normal is flat and faces away from `out` (if given). */
  tri(a: V, b: V, c: V, col: RGB | RGB[], kind = KIND_STONE, n?: V[], out?: V) {
    const e = this.m.elements;
    const e0 = e[0], e1 = e[1], e2 = e[2], e4 = e[4], e5 = e[5], e6 = e[6], e8 = e[8], e9 = e[9], e10 = e[10], e12 = e[12], e13 = e[13], e14 = e[14];
    const ax = e0 * a[0] + e4 * a[1] + e8 * a[2] + e12, ay = e1 * a[0] + e5 * a[1] + e9 * a[2] + e13, az = e2 * a[0] + e6 * a[1] + e10 * a[2] + e14;
    let bx = e0 * b[0] + e4 * b[1] + e8 * b[2] + e12, by = e1 * b[0] + e5 * b[1] + e9 * b[2] + e13, bz = e2 * b[0] + e6 * b[1] + e10 * b[2] + e14;
    let cx = e0 * c[0] + e4 * c[1] + e8 * c[2] + e12, cy = e1 * c[0] + e5 * c[1] + e9 * c[2] + e13, cz = e2 * c[0] + e6 * c[1] + e10 * c[2] + e14;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-9) return;
    nx /= len; ny /= len; nz /= len;
    const multi = typeof col[0] !== 'number';
    let c0 = (multi ? (col as RGB[])[0] : col) as RGB, c1 = (multi ? (col as RGB[])[1] : col) as RGB, c2 = (multi ? (col as RGB[])[2] : col) as RGB;
    let flip = false;
    let n0x = nx, n0y = ny, n0z = nz, n1x = nx, n1y = ny, n1z = nz, n2x = nx, n2y = ny, n2z = nz;
    if (n) {
      const r = (p: V, k: number) => (k === 0 ? e0 * p[0] + e4 * p[1] + e8 * p[2] : k === 1 ? e1 * p[0] + e5 * p[1] + e9 * p[2] : e2 * p[0] + e6 * p[1] + e10 * p[2]);
      n0x = r(n[0], 0); n0y = r(n[0], 1); n0z = r(n[0], 2);
      n1x = r(n[1], 0); n1y = r(n[1], 1); n1z = r(n[1], 2);
      n2x = r(n[2], 0); n2y = r(n[2], 1); n2z = r(n[2], 2);
      flip = nx * (n0x + n1x + n2x) + ny * (n0y + n1y + n2y) + nz * (n0z + n1z + n2z) < 0;
      if (flip) { let t = n1x; n1x = n2x; n2x = t; t = n1y; n1y = n2y; n2y = t; t = n1z; n1z = n2z; n2z = t; }
    } else {
      if (out) {
        const ox = e0 * out[0] + e4 * out[1] + e8 * out[2] + e12, oy = e1 * out[0] + e5 * out[1] + e9 * out[2] + e13, oz = e2 * out[0] + e6 * out[1] + e10 * out[2] + e14;
        flip = nx * ((ax + bx + cx) / 3 - ox) + ny * ((ay + by + cy) / 3 - oy) + nz * ((az + bz + cz) / 3 - oz) < 0;
        if (flip) { nx = -nx; ny = -ny; nz = -nz; n0x = n1x = n2x = nx; n0y = n1y = n2y = ny; n0z = n1z = n2z = nz; }
      }
    }
    if (flip) {
      let t = bx; bx = cx; cx = t; t = by; by = cy; cy = t; t = bz; bz = cz; cz = t;
      const tc = c1; c1 = c2; c2 = tc;
    }
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.nor.push(n0x, n0y, n0z, n1x, n1y, n1z, n2x, n2y, n2z);
    this.col.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
    this.kind.push(kind, kind, kind);
  }

  geometry(): THREE.BufferGeometry {
    const n = this.kind.length;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      const c: RGB = [this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]];
      let o: RGB = c;
      const k = this.kind[i];
      if (k === KIND_STONE) { const u = this.unit; shadeStone(c, x * u, y * u, z * u, this.nor[i * 3], this.nor[i * 3 + 1], col, i * 3); continue; }
      else if (k === KIND_SAND) o = mulC(SAND, 1 + (vnoise(x * 0.23, 0.5, z * 0.23) - 0.5) * 0.06);
      else if (k === KIND_METAL) { shadeMetal(c, x, y, z, this.nor[i * 3 + 1], this.dust, col, i * 3); continue; }
      col[i * 3] = o[0]; col[i * 3 + 1] = o[1]; col[i * 3 + 2] = o[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }
}

const ST_R = lin(0.5) * 0.7, ST_G = lin(0.43) * 0.7, ST_B = lin(0.36) * 0.7;
const SR = SAND[0] * 0.98, SG2 = SAND[1] * 0.98, SB = SAND[2] * 0.98;
function shadeStone(c: RGB, x: number, y: number, z: number, nx: number, ny: number, out: Float32Array, o: number) {
  const patch = vnoise(x * 0.6, y * 0.8, z * 0.6);
  const band = 0.5 + 0.5 * Math.sin(y * 2.9 + patch * 7 + x * 0.3);
  const grain = lh((x * 9) | 0, (y * 9) | 0, (z * 9) | 0);
  let k = (0.94 + 0.12 * patch) * (0.95 + 0.08 * band) * (0.97 + 0.06 * grain);
  k *= (0.55 + 0.45 * sstep(-0.4, 3.2, y)) * (1 + 0.05 * sstep(2, 9, y));
  if (ny < -0.2) k *= 0.78;
  let r = c[0] * k, g = c[1] * k, b = c[2] * k;
  const st = 0.3 * (1 - sstep(0, 2.2, y));
  if (st > 0) { r += (ST_R - r) * st; g += (ST_G - g) * st; b += (ST_B - b) * st; }
  const wind = -nx * 1.1;
  if (wind > 0) {
    const w = Math.min(1, wind) * 0.3;
    r += (c[0] * 1.25 - r * 1.08) * w + r * 0.08; g += (c[1] * 1.25 - g * 1.08) * w + g * 0.08; b += (c[2] * 1.25 - b * 1.08) * w + b * 0.08;
  }
  if (ny > 0) {
    const u = Math.min(1, ny) * (0.3 + 0.3 * patch);
    r += (SR - r) * u; g += (SG2 - g) * u; b += (SB - b) * u;
  }
  out[o] = r; out[o + 1] = g; out[o + 2] = b;
}

function shadeMetal(c: RGB, x: number, y: number, z: number, ny: number, dust: number, out: Float32Array, o: number) {
  const k = (0.96 + 0.08 * lh((x * 9) | 0, (y * 9) | 0, (z * 9) | 0)) * (0.9 + 0.1 * sstep(-0.3, 0.8, y)) * 1.06;
  let r = c[0] * k, g = c[1] * k, b = c[2] * k;
  if (ny > 0) {
    const u = Math.min(1, ny) * dust * (0.5 + 0.5 * vnoise(x * 0.5, y * 0.5, z * 0.5));
    r += (SAND[0] * 0.9 - r) * u; g += (SAND[1] * 0.9 - g) * u; b += (SAND[2] * 0.9 - b) * u;
  }
  out[o] = r; out[o + 1] = g; out[o + 2] = b;
}

// ---------------------------------------------------------------- primitives
const SG: [number, number][] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];

interface LoftOpt { kind?: number; capTop?: boolean; capBot?: boolean; skip?: number[]; topLift?: number; botLift?: number; capCol?: RGB }

/** Skin a stack of equal-length rings (faces oriented away from the loft's centre). */
function loft(m: Mesh, rings: V[][], col: RGB | ((i: number, j: number) => RGB), o: LoftOpt = {}) {
  const n = rings[0].length;
  const kind = o.kind ?? KIND_STONE;
  const ctr: V = [0, 0, 0];
  let cnt = 0;
  for (const r of rings) for (const p of r) { ctr[0] += p[0]; ctr[1] += p[1]; ctr[2] += p[2]; cnt++; }
  ctr[0] /= cnt; ctr[1] /= cnt; ctr[2] /= cnt;
  const cf = typeof col === 'function' ? col : () => col;
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    for (let j = 0; j < n; j++) {
      if (o.skip && o.skip.includes(j)) continue;
      const j2 = (j + 1) % n;
      m.tri(A[j], B[j], A[j2], [cf(i, j), cf(i + 1, j), cf(i, j2)], kind, undefined, ctr);
      m.tri(A[j2], B[j], B[j2], [cf(i, j2), cf(i + 1, j), cf(i + 1, j2)], kind, undefined, ctr);
    }
  }
  const cap = (r: V[], idx: number, lift: number) => {
    const c: V = [0, 0, 0];
    for (const p of r) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    c[0] /= n; c[1] /= n; c[2] /= n; c[1] += lift;
    const cc = o.capCol ?? cf(idx, 0);
    if (n === 4 && !lift) {
      m.tri(r[0], r[1], r[2], cc, kind, undefined, ctr);
      m.tri(r[0], r[2], r[3], cc, kind, undefined, ctr);
    } else {
      for (let j = 0; j < n; j++) m.tri(c, r[j], r[(j + 1) % n], cc, kind, undefined, ctr);
    }
  };
  if (o.capTop) cap(rings[rings.length - 1], rings.length - 1, o.topLift ?? 0);
  if (o.capBot) cap(rings[0], 0, o.botLift ?? 0);
}

function placed(m: Mesh, x: number, y: number, z: number, rx: number, ry: number, rz: number, fn: () => void) {
  const mx = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  mx.setPosition(x, y, z);
  m.push(mx);
  fn();
  m.pop();
}

interface BlockOpt { col?: RGB; bev?: number; jit?: number; skip?: number[]; capTop?: boolean; chip?: number }

/** A jittered ashlar block, base at y0, centred on (cx, cz), turned ry about y. */
function block(m: Mesh, rnd: Rnd, cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, ry: number, o: BlockOpt = {}) {
  const col = o.col ?? stoneCol(rnd);
  const j = o.jit ?? 0.02;
  const bev = Math.min(o.bev ?? 0, sy * 0.45, sx * 0.3, sz * 0.3);
  const hx = sx / 2, hz = sz / 2, c = Math.cos(ry), s = Math.sin(ry);
  const pt = (px: number, py: number, pz: number): V => {
    const x = px + (rnd() - 0.5) * 2 * j, z = pz + (rnd() - 0.5) * 2 * j, y = py + (rnd() - 0.5) * j;
    return [cx + x * c + z * s, y, cz - x * s + z * c];
  };
  const rings: V[][] = [SG.map(([a, b]) => pt(a * hx, y0, b * hz))];
  if (bev > 0) {
    rings.push(SG.map(([a, b]) => pt(a * hx, y0 + sy - bev, b * hz)));
    rings.push(SG.map(([a, b]) => pt(a * (hx - bev), y0 + sy - (o.chip ? rnd() * o.chip : 0), b * (hz - bev))));
  } else {
    rings.push(SG.map(([a, b]) => pt(a * hx, y0 + sy - (o.chip ? rnd() * o.chip : 0), b * hz)));
  }
  loft(m, rings, col, { capTop: o.capTop !== false, skip: o.skip });
}

/** Rock-like rubble chunk: strongly jittered block, tumbled, half sunk. */
function chunk(m: Mesh, rnd: Rnd, x: number, z: number, s: number, col?: RGB, sink = 0.5) {
  if (m.zLim) z = clamp(z, -m.zLim + s * 1.6, m.zLim - s * 1.6);
  const c = col ?? stoneCol(rnd);
  const sx = s * rr(rnd, 0.6, 1.5), sy = s * rr(rnd, 0.3, 1), sz = s * rr(rnd, 0.6, 1.4);
  placed(m, x, sy * (0.45 - rr(rnd, 0.35, 0.65)), z, rr(rnd, -0.5, 0.5), rnd() * 6.28, rr(rnd, -0.5, 0.5), () => {
    if (rnd() < 0.22) block(m, rnd, 0, -sy / 2, 0, sx, sy, sz, 0, { col: c, jit: s * 0.14, bev: s > 1.2 ? s * 0.08 : 0, chip: s * 0.15 });
    else {
      const n = 4 + Math.floor(rnd() * 3);
      const mk = (k: number, y: number): V[] => Array.from({ length: n }, (_, j) => {
        const a = (j / n) * 6.283 + (rnd() - 0.5) * 0.6, r = (0.55 + 0.45 * rnd()) * k;
        return [Math.cos(a) * r * sx * 0.7, y, Math.sin(a) * r * sz * 0.7] as V;
      });
      loft(m, [mk(1, -sy / 2), mk(rr(rnd, 0.5, 0.9), sy / 2)], c, { capTop: true, capBot: true });
    }
  });
}

function rubble(m: Mesh, rnd: Rnd, cx: number, cz: number, rad: number, n: number, smin: number, smax: number, col?: RGB) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, d = rad * Math.sqrt(rnd());
    const s = smin + (smax - smin) * Math.pow(rnd(), 1.7);
    chunk(m, rnd, cx + Math.cos(a) * d, cz + Math.sin(a) * d, s, col);
  }
}

// ---------------------------------------------------------------- sand
interface DriftOpt { x: number; z: number; a: number; b: number; h: number; rot?: number; tail?: number; seg?: number; lee?: boolean }

/**
 * A wind-shaped sand drift. Local +x is downwind. Default (windward bank): a steep short face on the +x side against the
 * obstacle and a long thin tail feathering out upwind (-x). With lee: the steep face is on -x and the tail runs downwind (+x).
 * The rim is at y = -0.015 with zero slope, so it merges with the ground with no step.
 */
function drift(m: Mesh, d: DriftOpt) {
  if (m.zLim && !d.rot) { const lim = Math.max(0, m.zLim - d.b - 0.3); d = { ...d, z: clamp(d.z, -lim, lim) }; }
  const rot = d.rot ?? 0, cs = Math.cos(rot), sn = Math.sin(rot), tail = Math.min(d.tail ?? 1.25, Math.max(1, (6 * d.h) / d.a));
  const sgn = d.lee ? 1 : -1;
  const RIM = -0.015;
  const H = (px: number, pz: number) => {
    const dx = px - d.x, dz = pz - d.z;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const t = lx * sgn;
    const aa = t > 0 ? d.a * tail : d.a * 0.45;
    const u = Math.abs(t) / aa;
    const bb = d.b * (t > 0 ? 1 - 0.55 * Math.min(1, u) : 1);
    const q = Math.hypot(u, lz / bb);
    if (q >= 1) return RIM;
    const f = 1 - q * q * (3 - 2 * q);
    return d.h * f * (t > 0 ? 1 - 0.4 * u : 1) + RIM * (1 - f);
  };
  const S = d.seg ?? (Math.max(d.a, d.b) > 6 ? 18 : 12);
  const Q = Math.max(d.a, d.b) > 6 ? [0.3, 0.58, 0.8, 0.93, 1] : [0.38, 0.68, 0.9, 1];
  const at = (q: number, j: number): V => {
    const th = (j / S) * Math.PI * 2;
    const ct = Math.cos(th), st = Math.sin(th);
    const u = q * Math.abs(ct), side = ct >= 0 ? 1 : -1;
    const t = side * u * (side > 0 ? d.a * tail : d.a * 0.45);
    const bb = d.b * (t > 0 ? 1 - 0.55 * Math.min(1, u) : 1);
    const lx = t * sgn, lz = q * st * bb;
    const px = d.x + lx * cs + lz * sn, pz = d.z - lx * sn + lz * cs;
    return [px, H(px, pz), pz];
  };
  const N = (p: V): V => {
    const e = 0.1;
    const hx = (H(p[0] + e, p[2]) - H(p[0] - e, p[2])) / (2 * e), hz = (H(p[0], p[2] + e) - H(p[0], p[2] - e)) / (2 * e);
    const l = Math.hypot(hx, 1, hz);
    return [-hx / l, 1 / l, -hz / l];
  };
  const centre: V = [d.x, H(d.x, d.z), d.z];
  const grid: V[][] = [[centre]], nrm: V[][] = [[N(centre)]];
  for (const q of Q) {
    const row: V[] = [], nr: V[] = [];
    for (let j = 0; j < S; j++) { const p = at(q, j); row.push(p); nr.push(N(p)); }
    grid.push(row); nrm.push(nr);
  }
  for (let j = 0; j < S; j++) {
    const j2 = (j + 1) % S;
    m.tri(centre, grid[1][j], grid[1][j2], SAND, KIND_SAND, [nrm[0][0], nrm[1][j], nrm[1][j2]]);
  }
  for (let i = 1; i < grid.length - 1; i++) {
    for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S;
      m.tri(grid[i][j], grid[i + 1][j], grid[i][j2], SAND, KIND_SAND, [nrm[i][j], nrm[i + 1][j], nrm[i][j2]]);
      m.tri(grid[i][j2], grid[i + 1][j], grid[i + 1][j2], SAND, KIND_SAND, [nrm[i][j2], nrm[i + 1][j], nrm[i + 1][j2]]);
    }
  }
}

/** Sand banked on all sides of a rectangular footprint (deepest on the windward -x side, a feathering tail downwind). */
function apron(m: Mesh, cx: number, cz: number, w: number, d: number, h: number) {
  drift(m, { x: cx - w / 2, z: cz, a: Math.min(w * 0.2, 7), b: d * 0.55, h: h * 1.25 });
  drift(m, { x: cx + w / 2, z: cz, a: Math.min(w * 0.25, 8), b: d * 0.4, h: h * 0.7, lee: true });
  drift(m, { x: cx, z: cz - d / 2, a: Math.min(d * 0.3, 9), b: w * 0.4, h: h * 0.8, rot: -Math.PI / 2 });
  drift(m, { x: cx, z: cz + d / 2, a: Math.min(d * 0.3, 9), b: w * 0.4, h: h * 0.6, rot: Math.PI / 2 });
}

/** A pier / base built from stacked ashlar courses between y0 and y1 (courses fully buried are skipped). */
function stack(m: Mesh, rnd: Rnd, cx: number, cz: number, sx: number, sz: number, y0: number, y1: number, ry = 0, ch = 1.8) {
  let y = y0;
  while (y < y1 - 0.05) {
    const h = Math.min(rr(rnd, ch * 0.7, ch * 1.2), y1 - y);
    if (y + h > -0.2) {
      const last = y + h >= y1 - 0.05;
      block(m, rnd, cx + (rnd() - 0.5) * 0.08, y, cz + (rnd() - 0.5) * 0.08, sx, h, sz, ry, { bev: last ? Math.min(0.14, h * 0.3) : 0, jit: 0.03, chip: last ? 0.12 : 0, capTop: last });
    }
    y += h;
  }
}

/** Smooth-shaded skin of rings (carved stone, not rubble). */
function smoothLoft(m: Mesh, rings: V[][], col: RGB, capEnd = true) {
  const n = rings[0].length, R = rings.length;
  const c: V = [0, 0, 0];
  let cnt = 0;
  for (const r of rings) for (const p of r) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; cnt++; }
  c[0] /= cnt; c[1] /= cnt; c[2] /= cnt;
  const nr: V[][] = rings.map((r, i) => r.map((p, j): V => {
    const a = rings[Math.min(R - 1, i + 1)][j], b = rings[Math.max(0, i - 1)][j];
    const pp = r[(j + 1) % n], qq = r[(j - 1 + n) % n];
    const ux = a[0] - b[0], uy = a[1] - b[1], uz = a[2] - b[2], vx = pp[0] - qq[0], vy = pp[1] - qq[1], vz = pp[2] - qq[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (nx * (p[0] - c[0]) + ny * (p[1] - c[1]) + nz * (p[2] - c[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return [nx, ny, nz];
  }));
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < n; j++) {
    const j2 = (j + 1) % n;
    m.tri(rings[i][j], rings[i + 1][j], rings[i][j2], col, KIND_STONE, [nr[i][j], nr[i + 1][j], nr[i][j2]]);
    m.tri(rings[i][j2], rings[i + 1][j], rings[i + 1][j2], col, KIND_STONE, [nr[i][j2], nr[i + 1][j], nr[i + 1][j2]]);
  }
  if (capEnd) loft(m, [rings[R - 1]], col, { capTop: true, topLift: -0.1 });
}

// ---------------------------------------------------------------- walls
interface WallOpt {
  L: number; t: number;
  top: (u: number) => number;
  hole?: (u: number, y: number) => boolean;
  inset?: (y: number) => number;
  depth?: number;
  ch?: [number, number];
  bl?: [number, number];
  tint?: RGB;
  ends?: boolean;
  miss?: number;
  /** a low plinth / stylobate: allowed to show only a few cm above the sand */
  low?: boolean;
}
interface Blk { xa: number; xb: number; y0: number; y1: number; yc: number; present: boolean; col: RGB; ins: number }

/** A wall of individual ashlar blocks in local x (0..L), outer face +z, centred on z = 0. */
function wall(m: Mesh, rnd: Rnd, o: WallOpt) {
  const ch = (o.ch ?? [0.55, 0.8]).map((v) => v * 1.25) as [number, number], bl = (o.bl ?? [1.2, 2.2]).map((v) => v * 1.25) as [number, number], t = o.t;
  let y = o.depth ?? -3;
  let maxTop = -1e9;
  for (let i = 0; i <= 24; i++) maxTop = Math.max(maxTop, o.top((o.L * i) / 24));
  const courses: Blk[][] = [];
  while (y < maxTop) {
    const y1 = y + rr(rnd, ch[0], ch[1]);
    const row: Blk[] = [];
    if (y1 > -0.15) {
      const ins = o.inset ? o.inset((y + y1) / 2) : 0;
      let x = -rnd() * bl[1];
      while (x < o.L) {
        const lb = rr(rnd, bl[0], bl[1]);
        const xa = Math.max(x, ins), xb = Math.min(x + lb, o.L - ins);
        x += lb;
        if (xb - xa < 0.3) continue;
        const xc = (xa + xb) / 2, T = o.top(xc), ym = (y + y1) / 2;
        let top = y1, present = y < T - 0.1 && !(o.hole && o.hole(xc, ym)) && (o.low || T > 0.9);
        if (present && y1 > T) {
          top = Math.max(y + 0.15, T - rnd() * 0.15);
          if (rnd() < 0.25) present = false;
        }
        if (present && y > 0.2 && rnd() < (o.miss ?? 0.035)) present = false;
        row.push({ xa, xb, y0: y, y1: top, yc: y1, present, col: o.tint ?? stoneCol(rnd), ins });
      }
    }
    courses.push(row);
    y = y1;
  }
  // structural sanity: a block needs one under it (the first course rests on the ground / whatever is below); lintels bridge supported neighbours
  for (let ci = 1; ci < courses.length; ci++) {
    const row = courses[ci], below = courses[ci - 1];
    if (!below.length) continue;
    const sup = row.map((b) => b.present && below.some((q) => q.present && q.xb > b.xa + 0.3 && q.xa < b.xb - 0.3 && q.y1 > b.y0 - 0.3));
    for (let bi = 0; bi < row.length; bi++) {
      if (!row[bi].present || sup[bi]) continue;
      let l = bi - 1, r = bi + 1;
      while (l >= 0 && row[l].present && !sup[l] && Math.abs(row[l].xb - row[l + 1].xa) < 0.25) l--;
      while (r < row.length && row[r].present && !sup[r] && Math.abs(row[r].xa - row[r - 1].xb) < 0.25) r++;
      const okL = l >= 0 && sup[l] && Math.abs(row[l].xb - row[l + 1].xa) < 0.25;
      const okR = r < row.length && sup[r] && Math.abs(row[r].xa - row[r - 1].xb) < 0.25;
      if (!(okL && okR)) row[bi].present = false;
    }
  }
  for (let ci = 0; ci < courses.length; ci++) {
    const row = courses[ci], above = courses[ci + 1];
    for (let bi = 0; bi < row.length; bi++) {
      const b = row[bi];
      if (!b.present) continue;
      const L = row[bi - 1], R = row[bi + 1];
      const left = L && L.present && Math.abs(L.xb - b.xa) < 0.25;
      const right = R && R.present && Math.abs(R.xa - b.xb) < 0.25;
      const skip: number[] = [];
      if (right || (o.ends === false && b.xb >= o.L - b.ins - 0.01)) skip.push(0);
      if (left || (o.ends === false && b.xa <= b.ins + 0.01)) skip.push(2);
      const covered = b.y1 >= b.yc - 0.005 && above && above.some((q) => q.present && q.xb > b.xa + 0.15 && q.xa < b.xb - 0.15);
      const hh = b.y1 - b.y0;
      block(m, rnd, (b.xa + b.xb) / 2, b.y0, -b.ins + (rnd() - 0.5) * 0.07, b.xb - b.xa + 0.03, hh, t + (rnd() - 0.5) * 0.1, 0, {
        col: b.col, bev: covered ? 0 : Math.min(0.15, hh * 0.3), jit: 0.026, skip, capTop: !covered, chip: covered ? 0 : 0.13,
      });
    }
  }
}

interface TowerOpt extends Omit<WallOpt, 'L' | 'top' | 'hole'> {
  cx: number; cz: number; rot: number; w: number; d: number;
  top: (k: number, u: number) => number;
  hole?: (k: number, u: number, y: number) => boolean;
}
/** A rectangular ring of walls: side k faces (sin, cos)(k*90deg): 0 = +z, 1 = +x, 2 = -z, 3 = -x. */
function tower(m: Mesh, rnd: Rnd, o: TowerOpt) {
  for (let k = 0; k < 4; k++) {
    const even = k % 2 === 0;
    const L = even ? o.w : o.d - 2 * o.t;
    const E = (even ? o.d : o.w) / 2 - o.t / 2;
    const mx = new THREE.Matrix4().makeTranslation(o.cx, 0, o.cz)
      .multiply(new THREE.Matrix4().makeRotationY(o.rot + (k * Math.PI) / 2))
      .multiply(new THREE.Matrix4().makeTranslation(-L / 2, 0, E));
    m.push(mx);
    wall(m, rnd, { ...o, L, top: (u) => o.top(k, u), hole: o.hole ? (u, y) => o.hole!(k, u, y) : undefined, ends: even });
    m.pop();
  }
}

// ---------------------------------------------------------------- columns
interface DrumOpt { r0: number; r1: number; y0: number; y1: number; col: RGB; flute?: number; segs?: number; broken?: number; cap?: boolean; ox?: number; oz?: number }
function drum(m: Mesh, rnd: Rnd, o: DrumOpt) {
  const segs = o.segs ?? 12, fl = o.flute ?? 0.06;
  const mk = (r: number, y: number, jag: number, ph: number, ox: number, oz: number): V[] => {
    const p: V[] = [];
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const rad = r * (j % 2 ? 1 - fl : 1) * (1 + (rnd() - 0.5) * 0.02);
      const yy = y + (jag ? jag * (Math.cos(th - ph) * 0.55 + (rnd() - 0.5) * 0.9 - (j % 5 === 0 ? rnd() * 0.5 : 0)) : 0);
      p.push([ox + Math.cos(th) * rad, yy, oz + Math.sin(th) * rad]);
    }
    return p;
  };
  const ox = o.ox ?? 0, oz = o.oz ?? 0;
  const rings = [mk(o.r0, o.y0, 0, 0, ox, oz), mk(o.r1, o.y1, o.broken ?? 0, rnd() * 6.28, ox, oz)];
  const c = o.col;
  loft(m, rings, (i, j) => mulC(c, (i === 0 ? 0.9 : 1) * (j % 2 ? 0.8 : 1)), { capTop: !!o.cap || !!o.broken, topLift: o.broken ? -0.05 * o.r1 : 0 });
}

function capital(m: Mesh, rnd: Rnd, x: number, y: number, z: number, r: number, col: RGB, rot = 0, segs = 12, lite = false): number {
  const spec: [number, number, boolean][] = lite ? [[1.0, 0, false], [1.25, 0.95, true], [1.5, 1.66, false]] : [[1.0, 0, false], [1.12, 0.14, false], [0.94, 0.3, false], [1.0, 0.55, true], [1.35, 1.2, true], [1.5, 1.66, false]];
  const rings = spec.map(([rad, hy, leaf]) => {
    const p: V[] = [];
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2 + rot;
      const k = leaf ? (j % 2 ? 1 : 1.2) * (1 + (rnd() - 0.5) * 0.05) : 1;
      p.push([x + Math.cos(th) * r * rad * k, y + hy * r, z + Math.sin(th) * r * rad * k]);
    }
    return p;
  });
  loft(m, rings, (i) => (i < 2 ? mulC(col, 0.95) : col), {});
  block(m, rnd, x, y + 1.68 * r, z, r * 3.3, r * 0.42, r * 3.3, rot, { col, bev: r * 0.06, jit: r * 0.02, chip: 0.04 });
  return y + 2.1 * r;
}

/** Plain Doric cushion capital with a square abacus. */
function doricCap(m: Mesh, rnd: Rnd, x: number, y: number, z: number, r: number, col: RGB, segs = 16): number {
  const rings = ([[0.9, 0], [0.88, 0.2], [1.12, 0.45], [1.3, 0.62]] as [number, number][]).map(([rad, hy]) => {
    const p: V[] = [];
    for (let j = 0; j < segs; j++) { const th = (j / segs) * 6.283; p.push([x + Math.cos(th) * r * rad, y + hy * r, z + Math.sin(th) * r * rad]); }
    return p;
  });
  loft(m, rings, (i) => mulC(col, i < 2 ? 0.95 : 1), {});
  block(m, rnd, x, y + 0.62 * r, z, r * 2.75, r * 0.5, r * 2.75, 0, { col, bev: r * 0.05, jit: r * 0.02, chip: 0.05 });
  return y + 1.12 * r;
}

interface ColOpt {
  x: number; z: number; y0: number; r: number; h: number;
  cap?: boolean; brk?: number; base?: boolean; tint?: RGB; lean?: number; leanDir?: number; segs?: number; dh?: number; lite?: boolean; doric?: boolean; flute?: number;
}
/** A standing column: base, entasis shaft of fluted drums (offset slightly), capital or a jagged break. Returns the top y. */
function column(m: Mesh, rnd: Rnd, o: ColOpt): number {
  const col = o.tint ?? stoneCol(rnd), r = o.r;
  let y = o.y0;
  const lean = o.lean ?? 0, ld = o.leanDir ?? 0;
  const cx = () => 0;
  void cx;
  if (o.base !== false) {
    if (y + 0.9 * r > -0.15) {
      block(m, rnd, o.x, y, o.z, r * 2.7, r * 0.5, r * 2.7, rnd() * 0.2, { col, bev: r * 0.06, jit: r * 0.02, chip: 0.05 });
      const rings: V[][] = o.lite ? [] : [[1.28, 0.5], [1.32, 0.62], [1.2, 0.76], [1.02, 0.9]].map(([rad, hy]) => {
        const p: V[] = [];
        for (let j = 0; j < (o.segs ?? 12); j++) { const th = (j / (o.segs ?? 12)) * 6.283; p.push([o.x + Math.cos(th) * r * rad, y + hy * r, o.z + Math.sin(th) * r * rad]); }
        return p;
      });
      if (rings.length) loft(m, rings, mulC(col, 0.95), {});
    }
    y += 0.9 * r;
  }
  const total = o.brk ?? o.h;
  const nd = Math.max(2, Math.round(o.h / (o.dh ?? 1.45)));
  let yy = y, ox = 0, oz = 0;
  const yEnd = y + total;
  for (let i = 0; i < nd; i++) {
    const t0 = i / nd, t1 = (i + 1) / nd;
    const y0 = y + o.h * t0, y1 = Math.min(y + o.h * t1, yEnd);
    if (y0 >= yEnd) break;
    ox += (rnd() - 0.5) * 0.04 * r + Math.cos(ld) * lean * (y1 - y0) / o.h;
    oz += (rnd() - 0.5) * 0.04 * r + Math.sin(ld) * lean * (y1 - y0) / o.h;
    yy = y1;
    if (y1 < -0.12) continue;
    const rad = (t: number) => r * (1 - 0.17 * t + 0.045 * Math.sin(Math.PI * t));
    const last = y1 >= yEnd - 1e-6;
    drum(m, rnd, {
      r0: rad(t0), r1: rad(Math.min(1, t1)), y0, y1, col: mixC(col, stoneCol(rnd), 0.35),
      ox: o.x + ox, oz: o.z + oz, broken: last && o.brk !== undefined ? r * 0.8 : 0, cap: last && !o.cap, segs: o.segs, flute: o.flute,
    });
  }
  if (o.cap && o.brk === undefined) return o.doric ? doricCap(m, rnd, o.x + ox, yy, o.z + oz, r, col, o.segs ?? 16) : capital(m, rnd, o.x + ox, yy, o.z + oz, r, col, 0, o.segs ?? 12, o.lite);
  return yy;
}

/** A column drum / capital fallen on its side, half sunk. */
function fallenDrum(m: Mesh, rnd: Rnd, x: number, z: number, r: number, len: number, ry: number, col?: RGB, sink = 0.4, broken = false) {
  const c = col ?? stoneCol(rnd);
  placed(m, x, r * (1 - sink * 1.3), z, 0, ry, Math.PI / 2 + rr(rnd, -0.1, 0.1), () => {
    drum(m, rnd, { r0: r * 0.95, r1: r, y0: -len / 2, y1: len / 2, col: c, cap: true, broken: broken ? r * 0.7 : 0 });
  });
}

/** Voussoir arch in the local x-y plane, centred on x = 0 at z = 0. */
interface ArchOpt { span: number; spring: number; t: number; depth: number; n: number; missing?: (i: number, n: number) => boolean; col?: RGB }
function arch(m: Mesh, rnd: Rnd, o: ArchOpt) {
  const ri = o.span / 2, ro = ri + o.t, hz = o.depth / 2;
  for (let i = 0; i < o.n; i++) {
    if (o.missing && o.missing(i, o.n)) continue;
    const a0 = Math.PI - (i / o.n) * Math.PI, a1 = Math.PI - ((i + 1) / o.n) * Math.PI;
    const g = 0.012 * (rnd() - 0.2);
    const ring = (a: number): V[] => {
      const ca = Math.cos(a), sa = Math.sin(a);
      const grow = (rnd() - 0.5) * 0.04;
      return [
        [ca * ri, o.spring + sa * ri, -hz + g], [ca * ri, o.spring + sa * ri, hz + g],
        [ca * (ro + grow), o.spring + sa * (ro + grow), hz + g], [ca * (ro + grow), o.spring + sa * (ro + grow), -hz + g],
      ];
    };
    const key = i === Math.floor(o.n / 2);
    const cc = o.col ?? stoneCol(rnd);
    loft(m, [ring(a0 - 0.006), ring(a1 + 0.006)], cc, { capTop: true, capBot: true });
    void key;
  }
}

/** One curved band for an arch (cheap: n segments, no per-stone wedges), from angle a0 (0 = +x side) over the crown (PI/2). */
function archBand(m: Mesh, rnd: Rnd, o: { span: number; spring: number; t: number; depth: number; n: number; a0?: number; a1?: number; col?: RGB }) {
  const ri = o.span / 2, ro = ri + o.t, hz = o.depth / 2, a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI;
  const rings: V[][] = [];
  for (let i = 0; i <= o.n; i++) {
    const a = a0 + ((a1 - a0) * i) / o.n, ca = Math.cos(a), sa = Math.sin(a), g = (rnd() - 0.5) * 0.06;
    rings.push([[ca * ri, o.spring + sa * ri, -hz + g], [ca * ri, o.spring + sa * ri, hz + g], [ca * (ro + g), o.spring + sa * (ro + g), hz], [ca * (ro + g), o.spring + sa * (ro + g), -hz]]);
  }
  const c = o.col ?? stoneCol(rnd);
  loft(m, rings, (i) => mulC(c, i % 2 ? 0.97 : 1.02), { capTop: true, capBot: true });
}

// ---------------------------------------------------------------- the ruins
export type RuinKind = 'colonnade' | 'temple' | 'arch' | 'wall' | 'tomb' | 'column' | 'statue' | 'gate' | 'houses' | 'well' | 'obelisk' | 'theatre' | 'street' | 'wallrun' | 'aqueduct' | 'amphitheatre' | 'forum' | 'basilica' | 'facade';
export const RUIN_KINDS: RuinKind[] = ['colonnade', 'temple', 'arch', 'wall', 'tomb', 'column', 'statue', 'gate', 'houses', 'well', 'obelisk', 'theatre', 'street', 'wallrun', 'aqueduct', 'amphitheatre', 'forum', 'basilica', 'facade'];

const RADII: Record<RuinKind, number> = {
  colonnade: 42, temple: 46, arch: 32, wall: 76, tomb: 25, column: 19, statue: 18, gate: 46, houses: 32, well: 17, obelisk: 18, theatre: 98,
  street: 33, wallrun: 33, aqueduct: 33, amphitheatre: 92, forum: 60, basilica: 52, facade: 26,
};
/** design-unit scale each kind is built at (monumental size) */
const SCALE: Partial<Record<RuinKind, number>> = { colonnade: 1.9, arch: 1.7, wall: 1.8, tomb: 1.6, column: 2.0, gate: 1.7, well: 1.4, obelisk: 1.2 };


function colonnade(m: Mesh, rnd: Rnd) {
  const N = 6, S = 3.9, rows = [-5.3, 5.3];
  const x0 = -((N - 1) * S) / 2;
  const seed = rnd() * 50;
  for (const row of rows) {
    m.push(new THREE.Matrix4().makeTranslation(x0 - 2, 0, row));
    wall(m, rnd, { low: true, L: (N - 1) * S + 4, t: 2.3, depth: -1.4, ch: [0.4, 0.55], bl: [1.2, 2], top: (u) => -0.3 + 0.9 * vnoise(u * 0.3, row, seed) });
    m.pop();
  }
  type St = 'full' | 'nocap' | 'tall' | 'mid' | 'low' | 'gone';
  const st: St[][] = [[], []];
  for (let ri = 0; ri < 2; ri++) for (let i = 0; i < N; i++) {
    const v = rnd();
    st[ri].push(v < 0.2 ? 'full' : v < 0.32 ? 'nocap' : v < 0.5 ? 'tall' : v < 0.7 ? 'mid' : v < 0.87 ? 'low' : 'gone');
  }
  const pr = Math.floor(rnd() * (N - 1)), prow = Math.floor(rnd() * 2);
  st[prow][pr] = st[prow][pr + 1] = 'full';
  const pairY0 = -rr(rnd, 0.6, 2.4);
  const tops: (number | null)[][] = [[], []];
  rows.forEach((row, ri) => {
    for (let i = 0; i < N; i++) {
      const sTate = st[ri][i];
      const r = rr(rnd, 0.42, 0.5), h = rr(rnd, 5.2, 6.6), lite = true;
      const x = x0 + i * S + rr(rnd, -0.1, 0.1), z = row + rr(rnd, -0.08, 0.08);
      const isPair = ri === prow && (i === pr || i === pr + 1);
      let y0 = isPair ? pairY0 : -rr(rnd, 0.3, 3.4);
      if (sTate === 'low') y0 = -rr(rnd, 2.4, 3.8);
      const base = y0 + 0.9 * r;
      const dir = Math.PI / 2 * (ri === 0 ? 1 : -1) + rr(rnd, -0.9, 0.9) + (rnd() < 0.3 ? Math.PI : 0);
      const lean = rr(rnd, -0.05, 0.05), ld = rnd() * 6.28;
      const brk = (lo: number, hi: number) => Math.min(h, Math.max(0.4, rr(rnd, lo, hi) - base));
      let top: number | null = null, nD = 0;
      if (sTate === 'full') top = column(m, rnd, { x, z, y0, r, h: isPair ? 6 : h, cap: true, lean, leanDir: ld, lite });
      else if (sTate === 'nocap') { column(m, rnd, { x, z, y0, r, h, brk: h * rr(rnd, 0.94, 1), lean, leanDir: ld }); nD = 1; }
      else if (sTate === 'tall') { column(m, rnd, { x, z, y0, r, h, brk: brk(3.4, 5.4), lean, leanDir: ld }); nD = 1; }
      else if (sTate === 'mid') { column(m, rnd, { x, z, y0, r, h, brk: brk(1.8, 3.2), lean, leanDir: ld }); nD = 2; }
      else if (sTate === 'low') { column(m, rnd, { x, z, y0, r, h, brk: brk(0.2, 1.1) }); nD = 1; }
      else { block(m, rnd, x, -0.45, z, r * 2.7, 0.55, r * 2.7, rnd(), { jit: 0.03 }); nD = 4; }
      tops[ri].push(top);
      for (let k = 0; k < nD; k++) {
        const dd = 1.6 + k * rr(rnd, 1.2, 1.5);
        fallenDrum(m, rnd, x + Math.cos(dir) * dd, z + Math.sin(dir) * dd, r * 0.92, rr(rnd, 1.0, 1.5), dir + Math.PI / 2 + rr(rnd, -0.25, 0.25), undefined, rr(rnd, 0.2, 0.6), rnd() < 0.3);
      }
      if (sTate !== 'full' && sTate !== 'low' && rnd() < 0.6) {
        const dd = 1.5 + nD * 1.4;
        placed(m, x + Math.cos(dir) * dd, 0.45, z + Math.sin(dir) * dd, 0, dir, Math.PI / 2 + rr(rnd, -0.2, 0.2), () => { capital(m, rnd, 0, -0.6, 0, r, stoneCol(rnd)); });
      }
      if (sTate !== 'gone') {
        drift(m, { x: x - 0.3, z, a: rr(rnd, 1.4, 2.2), b: rr(rnd, 1.2, 1.8), h: rr(rnd, 0.7, 1.7) });
        if (rnd() < 0.3) drift(m, { x: x + 0.3, z, a: rr(rnd, 1.6, 2.6), b: rr(rnd, 1, 1.5), h: rr(rnd, 0.5, 1.2), lee: true });
      }
    }
    for (let i = 0; i < N - 1; i++) {
      const a = tops[ri][i], b = tops[ri][i + 1];
      if (a !== null && b !== null && Math.abs(a - b) < 0.05) {
        const x = x0 + (i + 0.5) * S;
        block(m, rnd, x, a, rows[ri], S - 0.1, 0.9, 1.4, 0, { bev: 0.08, jit: 0.03, chip: 0.12 });
        if (rnd() < 0.5) block(m, rnd, x + rr(rnd, -0.1, 0.1), a + 0.9, rows[ri], S - 0.4, 0.7, 1.1, 0, { bev: 0.08, jit: 0.03, chip: 0.2 });
      }
    }
  });
  placed(m, x0 + 2 * S + 3, 0.2, 0.5, 0.1, 0.5, 0.12, () => block(m, rnd, 0, -0.5, 0, 4.2, 0.9, 1.3, 0, { bev: 0.06, jit: 0.03, chip: 0.12 }));
  for (let i = 0; i < 9; i++) {
    const x = x0 + rr(rnd, 0, (N - 1) * S), z = rr(rnd, -3, 3);
    block(m, rnd, x, -0.45, z, rr(rnd, 1.4, 2.4), rr(rnd, 0.45, 0.55), rr(rnd, 1.2, 1.8), rr(rnd, -0.3, 0.3), { bev: 0.04, jit: 0.03, chip: 0.06 });
  }
  rubble(m, rnd, 0, 0, 14, 18, 0.2, 1.4);
  apron(m, 0, 0, (N - 1) * S + 6, 12, 1.1);
  drift(m, { x: 0, z: 0, a: 5, b: 2.6, h: 0.9, lee: true });
}

function colunmPair(m: Mesh, rnd: Rnd) {
  const r = rr(rnd, 0.62, 0.75);
  const t1 = column(m, rnd, { x: -2.6, z: 0, y0: -rr(rnd, 1.2, 2.2), r, h: 6.4, cap: true, lean: 0.03, leanDir: 1 });
  const broken = rnd() < 0.6;
  let t2: number | null = null;
  if (broken) column(m, rnd, { x: 2.6, z: rr(rnd, -0.3, 0.3), y0: -rr(rnd, 1.6, 2.6), r, h: 6.2, brk: rr(rnd, 2.2, 3.8) });
  else t2 = column(m, rnd, { x: 2.6, z: 0, y0: -rr(rnd, 2.4, 3.4), r, h: 6.4, cap: true });
  if (t2 !== null && rnd() < 0.9) block(m, rnd, 0, Math.min(t1, t2), 0, 7.4, 1.0, 1.5, 0, { bev: 0.06, jit: 0.03, chip: 0.15 });
  else placed(m, -0.5, 0.35, 3.2, 0.05, 0.3, 0.08, () => block(m, rnd, 0, -0.5, 0, 4.6, 1, 1.4, 0, { bev: 0.06, jit: 0.03, chip: 0.2 }));
  fallenDrum(m, rnd, 2.8, 4.2, r * 0.93, 1.5, 0.3);
  fallenDrum(m, rnd, 4.6, 5.4, r * 0.93, 1.3, 0.9, undefined, 0.5);
  fallenDrum(m, rnd, -4.8, -3.6, r * 0.93, 1.4, 2.2, undefined, 0.35, true);
  rubble(m, rnd, 0, 0, 6, 8, 0.25, 0.7);
  drift(m, { x: -3.2, z: 0.2, a: 3.2, b: 2.6, h: 1.7 });
  drift(m, { x: 2.2, z: 0.2, a: 2.6, b: 2.2, h: 1.5 });
  drift(m, { x: 0, z: -1, a: 5, b: 3, h: 0.6 });
}

function temple(m: Mesh, rnd: Rnd) {
  const seed = rnd() * 40;
  const S = 3.7, NX = 13, NZ = 6;
  const W = (NX - 1) * S, D = (NZ - 1) * S;
  const yS = rr(rnd, 0.9, 1.5), r = 0.95, hS = 8.6;
  // three big steps, the lower ones mostly buried
  for (let i = 0; i < 3; i++) {
    const g = 2.2 + (2 - i) * 1.1;
    tower(m, rnd, { low: true, cx: 0, cz: 0, rot: 0, w: W + 2 * g, d: D + 2 * g, t: 2.2, depth: -3, ch: [0.8, 1.1], bl: [2.6, 4.4], top: (k, u) => yS - (2 - i) * 0.7 + 0.14 * vnoise(u * 0.4, k + i, seed) });
  }
  for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) {
    if (rnd() < 0.12) continue;
    block(m, rnd, -W / 2 + (i + 0.5) * (W / 7), -1.5, -D / 2 + (j + 0.5) * (D / 3), W / 7 - 0.06, yS + 1.4, D / 3 - 0.06, 0, { bev: 0.06, jit: 0.04, chip: 0.1 });
  }
  // the peristyle: every column on the line, the front (-x) end intact
  type St = 'full' | 'broken' | 'stump' | 'gone';
  const cols: { x: number; z: number; st: St; front: boolean; out: number }[] = [];
  for (let i = 0; i < NX; i++) for (const sd of [-1, 1]) {
    const x = -W / 2 + i * S, z = sd * D / 2;
    const v = rnd();
    let st: St = v < 0.38 ? 'full' : v < 0.7 ? 'broken' : v < 0.86 ? 'stump' : 'gone';
    if (sd > 0 && i >= 6 && i <= 9) st = 'gone';
    cols.push({ x, z, st, front: false, out: sd > 0 ? Math.PI / 2 : -Math.PI / 2 });
  }
  for (let j = 0; j < NZ; j++) {
    const z = -D / 2 + j * S;
    cols.push({ x: -W / 2, z, st: 'full', front: true, out: Math.PI });
    if (j > 0 && j < NZ - 1) continue;
  }
  for (let j = 1; j < NZ - 1; j++) {
    const v = rnd();
    cols.push({ x: W / 2, z: -D / 2 + j * S, st: v < 0.3 ? 'full' : v < 0.7 ? 'broken' : 'stump', front: false, out: 0 });
  }
  const topAt = new Map<string, number>();
  for (const c of cols) {
    if (!c.front && c.x === -W / 2 && (c.z === -D / 2 || c.z === D / 2)) continue; // corners are in the front row
    const o: ColOpt = { x: c.x, z: c.z, y0: yS, r, h: hS, segs: 16, dh: 3.2, base: false, doric: true, flute: 0.09, lean: rr(rnd, -0.02, 0.02), leanDir: rnd() * 6.28 };
    let nD = 0;
    if (c.st === 'full') topAt.set(c.x.toFixed(2) + ':' + c.z.toFixed(2), column(m, rnd, { ...o, cap: true }));
    else if (c.st === 'broken') { column(m, rnd, { ...o, brk: rr(rnd, 2.5, 7) }); nD = 1; }
    else if (c.st === 'stump') { column(m, rnd, { ...o, brk: rr(rnd, 0.7, 2) }); nD = 1; }
    else nD = 3;
    for (let k = 0; k < nD; k++) {
      const dir = c.out + rr(rnd, -0.5, 0.5), dd = 2.2 + k * 2.3;
      fallenDrum(m, rnd, c.x + Math.cos(dir) * dd, c.z + Math.sin(dir) * dd, r * 0.95, rr(rnd, 2.0, 2.4), dir + Math.PI / 2 + rr(rnd, -0.2, 0.2), undefined, rr(rnd, 0.3, 0.55), rnd() < 0.3);
    }
  }
  // front-end corner columns
  for (const z of [-D / 2, D / 2]) {
    const t = column(m, rnd, { x: -W / 2, z, y0: yS, r, h: hS, segs: 16, dh: 3.2, base: false, doric: true, flute: 0.09, cap: true });
    topAt.set((-W / 2).toFixed(2) + ':' + z.toFixed(2), t);
  }
  // architrave and frieze still bridging the standing runs
  const bridge = (xa: number, za: number, xb: number, zb: number) => {
    const ta = topAt.get(xa.toFixed(2) + ':' + za.toFixed(2)), tb = topAt.get(xb.toFixed(2) + ':' + zb.toFixed(2));
    if (ta === undefined || tb === undefined || Math.abs(ta - tb) > 0.3) return false;
    const mx = (xa + xb) / 2, mz = (za + zb) / 2, alongX = Math.abs(xb - xa) > 0.1;
    const len = S - 0.1;
    block(m, rnd, mx, Math.min(ta, tb), mz, alongX ? len : 1.7, 1.1, alongX ? 1.7 : len, 0, { bev: 0.08, jit: 0.04, chip: 0.1 });
    block(m, rnd, mx, Math.min(ta, tb) + 1.1, mz, alongX ? len : 1.5, 1.15, alongX ? 1.5 : len, 0, { bev: 0.06, jit: 0.04, chip: 0.2, col: mulC(stoneCol(rnd), 0.96) });
    return true;
  };
  let frontOk = true;
  for (let j = 0; j < NZ - 1; j++) frontOk = bridge(-W / 2, -D / 2 + j * S, -W / 2, -D / 2 + (j + 1) * S) && frontOk;
  for (const sd of [-1, 1]) for (let i = 0; i < NX - 1; i++) bridge(-W / 2 + i * S, sd * D / 2, -W / 2 + (i + 1) * S, sd * D / 2);
  if (frontOk) {
    // a triangular gable still stands over the front
    const yb = [...topAt.values()][0] + 2.25, hw = D / 2 + 1.1;
    const tri: V[] = [[0, 0, -hw], [0, 0, hw], [0, 2.7, 0]];
    loft(m, [tri.map((p): V => [-W / 2 - 0.5, yb + p[1], p[2]]), tri.map((p): V => [-W / 2 + 0.5, yb + p[1], p[2]])], stoneCol(rnd), { capTop: true, capBot: true });
    block(m, rnd, -W / 2, yb, 0, 2.4, 0.5, 2 * hw + 0.6, 0, { bev: 0.06, jit: 0.03, chip: 0.1 });
  }
  // the cella inside
  tower(m, rnd, {
    cx: 1, cz: 0, rot: 0, w: 30, d: 8.5, t: 1.3, depth: yS - 0.1, ch: [0.7, 0.95], bl: [1.6, 2.8],
    top: (k, u) => yS + 1.5 + 6.5 * vnoise(u * 0.18, k + 2, seed) * (k === 1 ? 0.4 : 1) * (0.25 + 0.75 * sstep(0, 5, Math.abs(u - (k % 2 ? 3 : 20)))),
    hole: (k, u, y) => k === 3 && Math.abs(u - (8.5 - 2.6) / 2) < 1.6 && y < yS + 5.2,
  });
  // fields of blocks: cornice pieces, an upside-down capital, drums in rows
  for (let i = 0; i < 9; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    placed(m, rr(rnd, -W / 2 - 3, W / 2 + 3), 0.1, side * (D / 2 + rr(rnd, 5, 12)), rr(rnd, -0.15, 0.15), rnd() * 3, rr(rnd, -0.2, 0.2), () => {
      const c = stoneCol(rnd);
      block(m, rnd, 0, -0.9, 0, rr(rnd, 2.2, 3.6), 1.1, 1.7, 0, { col: c, bev: 0.1, jit: 0.05, chip: 0.2 });
      block(m, rnd, 0, 0.1, -0.2, rr(rnd, 2, 3.2), 0.4, 1.3, 0, { col: c, bev: 0.05, jit: 0.04 });
    });
  }
  placed(m, W / 2 + 5, 0.1, D / 2 + 6, 0, 0.4, Math.PI, () => { doricCap(m, rnd, 0, -1, 0, r, stoneCol(rnd)); });
  rubble(m, rnd, 0, 0, 38, 14, 0.4, 2.2);
  apron(m, 0, 0, W + 9, D + 9, 2.6);
  drift(m, { x: -W / 2 - 4, z: 0, a: 6, b: 9, h: 2.4 });
  drift(m, { x: 1, z: 0, a: 8, b: 3.2, h: 3.6 });
  drift(m, { x: W / 2 + 2, z: -6, a: 7, b: 5, h: 2.2, lee: true });
  drift(m, { x: -8, z: D / 2 + 1, a: 7, b: 4, h: 1.8, rot: Math.PI / 2 });
}

function archKind(m: Mesh, rnd: Rnd) {
  const span = 6.4, pw = 3.8, pd = 4.6, spring = 5.6;
  const seed = rnd() * 30;
  const eroded = rnd() < 0.5 ? 1 : -1; // which pier is worn down
  for (const sgn of [-1, 1]) {
    const worn = sgn === eroded;
    const cx = sgn * (span / 2 + pw / 2);
    const hp = (k: number, u: number) => {
      const base = worn ? 4.6 : 10.4;
      return base * (0.8 + 0.4 * vnoise(u * 0.4, k + 2 * sgn, seed)) - (worn ? sstep(0, 3, u) * 0.0 : 0);
    };
    tower(m, rnd, { cx, cz: 0, rot: 0, w: pw, d: pd, t: 1.25, depth: -3.2, ch: [0.5, 0.7], bl: [0.9, 1.5], top: hp });
    // solid core so the broken tops are not hollow
    const topY = (worn ? 3.4 : 9.4);
    block(m, rnd, cx, -0.8, 0, pw - 2.0, topY + 0.8, pd - 2.0, 0, { col: srgb(0.66, 0.52, 0.38), bev: 0.2, jit: 0.15, chip: 0.5 });
    // engaged half-columns on the front corners
    for (const zz of [-1, 1]) {
      if (!worn || rnd() < 0.3) column(m, rnd, { x: cx - sgn * 0.0, z: zz * (pd / 2 + 0.55), y0: -rr(rnd, 2.2, 3.4), r: 0.5, h: 5.2, cap: !worn, brk: worn ? rr(rnd, 1.6, 3) : undefined });
    }
  }
  // vault of voussoirs, one side eroded
  arch(m, rnd, {
    span, spring, t: 1.0, depth: pd - 0.3, n: 13,
    missing: (i, n) => (eroded === -1 ? i < n * 0.45 : i > n * 0.55) || (i > 2 && i < n - 3 && rnd() < 0.07),
  });
  // attic above the vault
  const aLen = span + 2 * pw;
  const aL = aLen * 0.56, ax = eroded === -1 ? aLen / 2 - aL / 2 : -aLen / 2 + aL / 2;
  block(m, rnd, ax, 9.2, 0, aL, 1.3, pd - 0.6, 0, { bev: 0.12, jit: 0.04, chip: 0.15 });
  block(m, rnd, ax + rr(rnd, -0.3, 0.3), 10.5, 0, aL - 0.8, 1.1, pd - 1.0, 0, { bev: 0.12, jit: 0.04, chip: 0.25 });
  if (rnd() < 0.6) block(m, rnd, ax + (eroded === -1 ? 1 : -1) * aL * 0.2, 11.6, 0, aL * 0.4, 0.9, pd - 1.4, 0, { bev: 0.14, jit: 0.05, chip: 0.4 });
  // fallen voussoirs, blocks, drums
  for (let i = 0; i < 5; i++) {
    const side = rnd() < 0.7 ? eroded : -eroded;
    placed(m, side * rr(rnd, 5, 12) + rr(rnd, -2, 2), 0.15, rr(rnd, -6, 6), rr(rnd, -0.3, 0.3), rnd() * 3, rr(rnd, -0.4, 0.4), () => block(m, rnd, 0, -0.5, 0, rr(rnd, 1.2, 2.6), rr(rnd, 0.8, 1.2), 1.2, 0, { bev: 0.07, jit: 0.05, chip: 0.2 }));
  }
  rubble(m, rnd, eroded * 8, 0, 8, 20, 0.35, 1.3);
  rubble(m, rnd, 0, 0, 13, 10, 0.3, 0.7);
  apron(m, 0, 0, span + 2 * pw + 2, pd + 2, 1.6);
  // sand fills the passage and banks on the windward piers
  drift(m, { x: 0, z: 0, a: 3.2, b: 6.5, h: 3.4 });
  drift(m, { x: -span / 2 - pw + 0.5, z: 0, a: 5.5, b: 6.5, h: 3.0 });
  drift(m, { x: span / 2 + pw, z: 2, a: 3.5, b: 5, h: 1.3 });
  drift(m, { x: -4, z: 9, a: 8, b: 3.5, h: 1.1 });
}

/** Irregular broken tops for a tower: noisy heights with a bite out of each corner. */
function mkTop(rnd: Rnd, h: number, L: number, seed: number) {
  const b = [rr(rnd, 0, 3.5), rr(rnd, 0, 3.5), rr(rnd, 0, 3.5), rr(rnd, 0, 3.5)];
  return (k: number, u: number) => Math.max(-0.5, h * (0.55 + 0.6 * vnoise(u * 0.45, k, seed)) - b[k] * (1 - sstep(0, 2.4, u)) - b[(k + 1) % 4] * (1 - sstep(0, 2.4, L - u)));
}

function wallKind(m: Mesh, rnd: Rnd) {
  const L = 70, seed = rnd() * 60, t = 2.6;
  const cs = [rr(rnd, 8, 18), rr(rnd, 30, 40), rr(rnd, 52, 64)];
  const rad = [rr(rnd, 4, 7), rr(rnd, 5, 9), rr(rnd, 3, 6)];
  m.push(new THREE.Matrix4().makeTranslation(0, 0, -L / 2).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)));
  wall(m, rnd, {
    L, t, depth: -2.6, ch: [0.85, 1.25], bl: [1.6, 3.0],
    top: (u) => {
      let f = 1;
      for (let i = 0; i < 3; i++) f = Math.min(f, 0.1 + 0.9 * sstep(0, rad[i], Math.abs(u - cs[i])));
      const base = 4.8 * (0.5 + 0.8 * vnoise(u * 0.11, 1, seed)) + (vnoise(u * 0.9, 3, seed) - 0.5) * 1.6;
      return Math.max(-0.4, base * f);
    },
    hole: (u, y) => Math.abs(u - 24) < 1.1 && y < 3.2 && y > 0.8,
  });
  m.pop();
  const tw = (uz: number, ww: number, h: number, bust: boolean) => {
    const tp = mkTop(rnd, h, ww, seed + uz);
    tower(m, rnd, {
      cx: -t / 2 - ww / 2 + 1.2, cz: uz, rot: 0, w: ww, d: ww + 1, t: 1.4, depth: -3, ch: [0.6, 0.9], bl: [1, 1.9],
      inset: (y) => (y < 0 ? 0 : y * 0.03),
      top: (k, u) => tp(k, u) * (bust && k === 3 ? 0.5 : 1),
      hole: (k, u, y) => k === 3 && Math.abs(u - (ww + 1 - 2.8) / 2) < 0.35 && y > 2.2 && y < 3.8 && !bust,
    });
    block(m, rnd, -t / 2 - ww / 2 + 1.2, -0.8, uz, ww - 2.2, h * 0.5, ww - 1.6, 0, { col: srgb(0.66, 0.52, 0.38), bev: 0.2, jit: 0.2, chip: 0.5 });
  };
  tw(-20, 8, 8, false);
  tw(24, 6.5, 5.5, true);
  rubble(m, rnd, -8, -20 + 0, 7, 8, 0.4, 1.8);
  rubble(m, rnd, -8, 24, 6, 6, 0.4, 1.6);
  for (let i = 0; i < 3; i++) {
    const z = cs[i] - 35;
    rubble(m, rnd, -4.5, z, rad[i] + 2, 22, 0.3, 2.2);
    rubble(m, rnd, 3.5, z, rad[i], 10, 0.3, 1.4);
    drift(m, { x: -1.4, z, a: 5, b: rad[i] + 3, h: 1.9 });
  }
  for (let i = 0; i < 6; i++) placed(m, rr(rnd, -8, 6), 0.15, rr(rnd, -33, 33), rr(rnd, -0.3, 0.3), rnd() * 3, rr(rnd, -0.3, 0.3), () => block(m, rnd, 0, -0.5, 0, rr(rnd, 1.4, 2.6), 0.8, 1.2, 0, { bev: 0.06, jit: 0.05, chip: 0.2 }));
  for (let z = -28; z <= 30; z += 19) {
    drift(m, { x: -2.6, z: z + rr(rnd, -2, 2), a: rr(rnd, 3.5, 5.5), b: rr(rnd, 6, 9), h: rr(rnd, 1.2, 2.4) });
    drift(m, { x: 2.6, z: z + rr(rnd, -2, 2), a: rr(rnd, 3, 4.5), b: rr(rnd, 4, 7), h: rr(rnd, 0.8, 1.6), lee: true });
  }
  drift(m, { x: -9, z: -20, a: 5, b: 6, h: 2.0 });
}

function tomb(m: Mesh, rnd: Rnd) {
  const seed = rnd() * 30;
  const w0 = 7.4;
  for (let i = 0; i < 3; i++) {
    const wd = w0 + 5 - i * 1.7;
    tower(m, rnd, { low: true, cx: 0, cz: 0, rot: 0, w: wd, d: wd, t: 1.2, depth: -3.5, ch: [0.45, 0.55], bl: [1.2, 1.8], top: (k, u) => 0.7 - i * 0.55 + 0.35 * vnoise(u * 0.5, k + i, seed) });
  }
  const breakAt = rr(rnd, 9, 12);
  const bite = [rr(rnd, 0, 4.5), rr(rnd, 0, 4.5), rr(rnd, 0, 4.5), rr(rnd, 0, 4.5)];
  const L = w0 - 0, near = (k: number, u: number) => bite[k] * (1 - sstep(0, 2.6, u)) + bite[(k + 1) % 4] * (1 - sstep(0, 2.6, L - u));
  const topF = (k: number, u: number) =>
    Math.max(-0.5, breakAt * (0.5 + 0.7 * vnoise(u * 0.45, k + 1, seed)) * (k === 1 ? 0.8 : 1) - near(k, u) - (k === 3 ? 1.2 : 0));
  tower(m, rnd, {
    cx: 0, cz: 0, rot: 0, w: w0, d: w0, t: 1.15, depth: -3.2, ch: [0.55, 0.75], bl: [1.0, 1.9],
    inset: (y) => (y < 0 ? 0 : y * 0.022),
    top: topF,
    hole: (k, u, y) => (k === 3 && Math.abs(u - w0 / 2) < 0.9 && y > 0.1 && y < 3.0) || (k !== 3 && Math.abs(u - w0 / 2) < 0.4 && y > 4.4 && y < 6.0),
  });
  tower(m, rnd, { cx: 0, cz: 0, rot: 0, w: w0 + 0.6, d: w0 + 0.6, t: 1.6, depth: 5.6, ch: [0.4, 0.45], bl: [1.2, 1.8], top: (k, u) => (vnoise(u * 0.7, k, seed + 9) < 0.45 ? -9 : Math.min(6.4, topF(k, u))) });
  rubble(m, rnd, 0, 0, 12, 24, 0.3, 2.4);
  rubble(m, rnd, 3, 3, 6, 10, 0.8, 2.2);
  for (let i = 0; i < 4; i++) placed(m, rr(rnd, -8, 8), 0.2, rr(rnd, -8, 8), rr(rnd, -0.3, 0.3), rnd() * 3, rr(rnd, -0.3, 0.3), () => block(m, rnd, 0, -0.6, 0, rr(rnd, 1.6, 2.8), rr(rnd, 0.8, 1.2), rr(rnd, 1, 1.8), 0, { bev: 0.07, jit: 0.05, chip: 0.2 }));
  apron(m, 0, 0, 12.4, 12.4, 2.4);
  drift(m, { x: 0, z: 0, a: 3, b: 3, h: 3.2 });
  drift(m, { x: -4.5, z: 0, a: 5.5, b: 7, h: 3.0 });
}

function statue(m: Mesh, rnd: Rnd) {
  const col = stoneCol(rnd);
  const U = 36, Vn = 26;
  const noseBroken = rnd() < 0.6, earBroken = rnd() < 0.5;
  const gauss = (x: number, s: number) => Math.exp(-(x * x) / (2 * s * s));
  const head = (ang: number, lat: number): V => {
    const sv = Math.sin(lat), cvv = Math.cos(lat);
    const ux = sv * Math.sin(ang), uz = sv * Math.cos(ang), uy = cvv;
    let rad = 1;
    const front = sstep(-0.05, 0.5, uz);
    const g2 = (cx: number, cy: number, sx: number, sy: number) => gauss(ux - cx, sx) * gauss(uy - cy, sy);
    const hair = clamp(sstep(0.34, 0.5, uy) + sstep(0.15, -0.35, uz) * sstep(-0.75, -0.1, uy)) * (1 - front * 0.7);
    rad += 0.62 * (noseBroken ? 0.35 : 1) * g2(0, -0.1, 0.12, 0.25) * front;
    rad += 0.24 * g2(0, 0.26, 0.55, 0.09) * front;
    rad -= 0.28 * (g2(0.34, 0.12, 0.13, 0.09) + g2(-0.34, 0.12, 0.13, 0.09)) * front;
    rad += 0.17 * g2(0, -0.5, 0.28, 0.07) * front;
    rad -= 0.12 * g2(0, -0.6, 0.24, 0.035) * front;
    rad += 0.16 * g2(0, -0.82, 0.2, 0.13) * front;
    rad += 0.1 * (g2(0.55, -0.2, 0.2, 0.22) + g2(-0.55, -0.2, 0.2, 0.22)) * front;
    if (!(earBroken && ux > 0)) rad += 0.3 * (g2(0.98, 0, 0.18, 0.24) + g2(-0.98, 0, 0.18, 0.24)) * gauss(uz, 0.4);
    rad *= 1 + 0.1 * hair;
    rad += hair * 0.06 * (0.5 + 0.5 * Math.sin(ux * 21 + uz * 9 + uy * 5) * Math.sin(uy * 17 - ux * 7 + uz * 11)); // curls
    rad += 0.02 * (vnoise(ux * 3, uy * 3, uz * 3) - 0.5) * 2;
    let y = uy * 2.2 * rad;
    if (uy < -0.9) y = -2.0 + (rnd() - 0.5) * 0.15;
    return [ux * 1.45 * rad, y, uz * 1.7 * rad];
  };
  const rings: V[][] = [];
  for (let i = 0; i <= Vn; i++) {
    const lat = 0.02 + (i / Vn) * (Math.PI * 0.86 - 0.02);
    const r: V[] = [];
    for (let j = 0; j < U; j++) r.push(head((j / U) * Math.PI * 2, lat));
    rings.push(r);
  }
  // the head lies on its side, half buried, the face turned up toward the viewer
  placed(m, -3.5, 0.15, 0.5, -0.3, 2.55, Math.PI / 2, () => smoothLoft(m, rings, col));
  // broken torso with drapery folds, on its back
  const tcol = mixC(col, stoneCol(rnd), 0.3);
  placed(m, 8, 0.7, -1, -1.3, 0.9, 0.2, () => {
    const rg: V[][] = [];
    const prof: [number, number, number][] = [[0, 2.0, 1.2], [1.4, 2.3, 1.4], [2.8, 2.9, 1.5], [4.0, 3.5, 1.3], [4.7, 3.0, 1.0]];
    prof.forEach(([y, hw, hd], i) => {
      const r: V[] = [];
      for (let j = 0; j < 22; j++) {
        const th = (j / 22) * 6.283;
        const ex = Math.sign(Math.cos(th)) * Math.pow(Math.abs(Math.cos(th)), 0.6), ez = Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), 0.6);
        const fold = 1 + 0.07 * Math.sin(th * 7 + y * 1.6) * (i < 3 ? 1 : 0.5);
        r.push([ex * hw * fold, y + (i === prof.length - 1 ? (rnd() - 0.3) * 0.5 : 0) + (i === 0 ? (rnd() - 0.5) * 0.4 : 0), ez * hd * fold]);
      }
      rg.push(r);
    });
    smoothLoft(m, rg, tcol);
  });
  // a column drum, a worn foot on a half-sunk pedestal
  fallenDrum(m, rnd, 12, 5.5, 1.1, 2.4, 2.2, tcol, 0.45);
  block(m, rnd, -8, -2.0, -6.5, 6.0, 2.5, 3.2, 0.5, { col, bev: 0.14, jit: 0.1, chip: 0.25 });
  block(m, rnd, -7.4, 0.3, -6.3, 2.8, 0.8, 1.2, 0.5, { col, bev: 0.15, jit: 0.09, chip: 0.2 });
  rubble(m, rnd, 3, 0, 12, 18, 0.2, 1.3, col);
  drift(m, { x: -6.6, z: 1.5, a: 4, b: 4.8, h: 1.6 });
  drift(m, { x: 5.2, z: -0.5, a: 3.6, b: 4, h: 1.7 });
  drift(m, { x: 12, z: 2, a: 4.5, b: 3.4, h: 1.0 });
  drift(m, { x: -9, z: -6.5, a: 3, b: 3.4, h: 1.0 });
  drift(m, { x: -1, z: 6, a: 6, b: 3, h: 0.9 });
}

function gate(m: Mesh, rnd: Rnd) {
  const seed = rnd() * 30, span = 5.8;
  for (const sgn of [-1, 1]) {
    const worn = rnd() < 0.5;
    const cx = sgn * (span / 2 + 3.6);
    const gtp = mkTop(rnd, worn ? 7.4 : 9.4, 7.2, seed + sgn);
    tower(m, rnd, {
      cx, cz: 0, rot: 0, w: 7.2, d: 9.5, t: 1.4, depth: -3.2, ch: [0.5, 0.7], bl: [1, 1.7],
      inset: (y) => (y < 0 ? 0 : y * 0.03),
      top: gtp,
      hole: (k, u, y) => (k === 1 || k === 3) && Math.abs(u - (k % 2 === 0 ? 3.6 : 3.35)) < 0.3 && y > 3.4 && y < 5.2,
    });
    block(m, rnd, cx, -0.8, 0, 4.2, worn ? 4.6 : 6.4, 6.6, 0, { col: srgb(0.66, 0.52, 0.38), bev: 0.2, jit: 0.2, chip: 0.5 });
    // curtain walls running off to the sides
    m.push(new THREE.Matrix4().makeTranslation(cx + sgn * 3.6, 0, 0).multiply(new THREE.Matrix4().makeRotationY(sgn > 0 ? 0 : Math.PI)));
    wall(m, rnd, { L: 20, t: 2.2, depth: -2.4, ch: [0.5, 0.7], bl: [1.2, 2], top: (u) => 3.4 * (1 - sstep(2, 17, u)) * (0.6 + 0.6 * vnoise(u * 0.4, sgn, seed)) + 0.2 });
    m.pop();
  }
  arch(m, rnd, { span, spring: 4.4, t: 0.9, depth: 8.6, n: 11, missing: (i, n) => (i > n * 0.6 && rnd() < 0.6) || (i === 1 && rnd() < 0.4) });
  apron(m, 0, 0, 2 * (span / 2 + 7.2), 9.5, 1.8);
  // the passage is choked by a dune, the gate-ward flank banked high
  drift(m, { x: 0, z: 0, a: 3.4, b: 10, h: 3.8 });
  drift(m, { x: -11, z: 0, a: 8, b: 9, h: 2.4 });
  drift(m, { x: -4, z: 12, a: 10, b: 4, h: 1.5 });
  drift(m, { x: 9, z: -9, a: 6, b: 4, h: 1.3 });
  drift(m, { x: -16, z: -3, a: 8, b: 4, h: 1.0 });
  rubble(m, rnd, 0, 0, 14, 28, 0.4, 1.5);
  for (let i = 0; i < 5; i++) placed(m, rr(rnd, -14, 14), 0.15, rr(rnd, -9, 9), rr(rnd, -0.3, 0.3), rnd() * 3, rr(rnd, -0.3, 0.3), () => block(m, rnd, 0, -0.5, 0, rr(rnd, 1.4, 2.6), 0.9, 1.2, 0, { bev: 0.07, jit: 0.05, chip: 0.2 }));
}

function houses(m: Mesh, rnd: Rnd) {
  const seed = rnd() * 50, CELL = 12.5, N = 3;
  const x0 = -(N * CELL) / 2, z0 = -(N * CELL) / 2;
  m.push(new THREE.Matrix4().makeRotationY(rr(rnd, -0.08, 0.08)));
  const wood = srgb(0.3, 0.22, 0.15);
  const seg = (x: number, z: number, vertical: boolean, outer: boolean) => {
    if (rnd() < (outer ? 0.15 : 0.32)) return;
    const hseg = rnd() < 0.12 ? rr(rnd, 3.6, 5.6) : rr(rnd, 0.7, 2.0);
    const L = CELL + 0.9, door = rnd() < 0.7 ? rr(rnd, 2.5, CELL - 2.5) : -9, sd = rnd() * 40;
    m.push(vertical ? new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)) : new THREE.Matrix4().makeTranslation(x - 0.45, 0, z));
    wall(m, rnd, {
      low: true, L, t: 0.9, depth: -2, ch: [0.5, 0.8], bl: [2.2, 3.8], miss: 0.06,
      top: (u) => hseg * (0.45 + 0.8 * vnoise(u * 0.3 + sd, 2, seed)) - (u < 1 || u > L - 1 ? 0.5 : 0),
      hole: (u, y) => Math.abs(u - door) < 0.95 && y < 3.2,
    });
    m.pop();
  };
  for (let r = 0; r <= N; r++) for (let c = 0; c < N; c++) seg(x0 + c * CELL, z0 + r * CELL, false, r === 0 || r === N);
  for (let c = 0; c <= N; c++) for (let r = 0; r < N; r++) seg(x0 + c * CELL, z0 + r * CELL, true, c === 0 || c === N);
  // the courtyard in the middle cell: a column or two and a paved corner
  column(m, rnd, { x: -2.5, z: 1, y0: -1.2, r: 0.4, h: 4.0, cap: true, segs: 12, dh: 1.8 });
  column(m, rnd, { x: 2.8, z: -1.5, y0: -1.2, r: 0.4, h: 4.0, brk: rr(rnd, 1.6, 3), segs: 12, dh: 1.8 });
  for (let i = 0; i < 4; i++) block(m, rnd, rr(rnd, -3, 3), -0.8, rr(rnd, -3, 3), 3, 0.9, 3, 0, { jit: 0.03, bev: 0.02 });
  // broken roof beams in the sand
  for (let i = 0; i < 4; i++) placed(m, rr(rnd, -16, 16), 0.1, rr(rnd, -16, 16), 0, rnd() * 6, rr(rnd, -0.3, 0.3), () => block(m, rnd, 0, -0.14, 0, rr(rnd, 2.5, 4.5), 0.3, 0.3, 0, { col: wood, jit: 0.03 }));
  for (let i = 0; i < 6; i++) chunk(m, rnd, rr(rnd, -19, 19), rr(rnd, -19, 19), rr(rnd, 0.4, 1.6));
  for (let i = 0; i < 6; i++) drift(m, { x: rr(rnd, -17, 17), z: rr(rnd, -17, 17), a: rr(rnd, 2.5, 5), b: rr(rnd, 2.5, 5), h: rr(rnd, 0.6, 1.8), lee: rnd() < 0.5 });
  drift(m, { x: x0 - 1, z: 0, a: 6, b: 14, h: 1.6 });
  m.pop();
}

function well(m: Mesh, rnd: Rnd) {
  const seed = rnd() * 20;
  const col = stoneCol(rnd);
  const ring = (n: number, R: number, y0: number, h: number, t: number, nm: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.03;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      if (nm && rnd() < nm) continue;
      block(m, rnd, x, y0 + (rnd() - 0.5) * 0.04, z, t, h, (Math.PI * 2 * R) / n + 0.04, -a + Math.PI / 2, { bev: 0.04, jit: 0.02, chip: 0.06 });
    }
  };
  // stepped round platform (buried), well curb, and the dark shaft
  ring(16, 2.6, -0.5, 0.55, 1.1, 0.1);
  ring(14, 1.7, 0.0, 0.5, 0.9, 0);
  ring(12, 1.45, 0.5 + 0 * seed, 0.45, 0.85, 0.28);
  const sh: V[][] = [];
  for (const [y, rad] of [[0.2, 1.05], [-0.8, 1.0], [-2.0, 0.95]]) {
    const r: V[] = [];
    for (let j = 0; j < 12; j++) { const th = (j / 12) * 6.283; r.push([Math.cos(th) * rad, y, Math.sin(th) * rad]); }
    sh.push(r);
  }
  loft(m, sh, (i) => srgb(0.18 - i * 0.05, 0.14 - i * 0.04, 0.1 - i * 0.03), { kind: KIND_RAW });
  // two posts and a fallen lintel
  block(m, rnd, 0.0, -0.3, -2.4, 0.6, 3.0, 0.6, 0.2, { bev: 0.05, jit: 0.03, chip: 0.2 });
  placed(m, 3.8, 0.4, 3.0, 0.1, 0.6, 0.1, () => block(m, rnd, 0, -0.5, 0, 3.0, 0.7, 0.7, 0, { bev: 0.05, jit: 0.03, chip: 0.1 }));
  // trough: a hollowed block
  placed(m, -5, 0.0, 2.4, 0.03, 0.5, 0.08, () => {
    const c = stoneCol(rnd);
    block(m, rnd, 0, -0.5, -0.55, 3.2, 0.95, 0.3, 0, { col: c, bev: 0.04, jit: 0.02 });
    block(m, rnd, 0, -0.5, 0.55, 3.2, 0.95, 0.3, 0, { col: c, bev: 0.04, jit: 0.02 });
    block(m, rnd, -1.45, -0.5, 0, 0.3, 0.95, 0.9, 0, { col: c, bev: 0.04, jit: 0.02 });
    block(m, rnd, 1.45, -0.5, 0, 0.3, 0.95, 0.9, 0, { col: c, bev: 0.04, jit: 0.02 });
    block(m, rnd, 0, -0.5, 0, 3.0, 0.5, 0.9, 0, { col: mulC(c, 0.7), jit: 0.02 });
  });
  void col;
  rubble(m, rnd, 0, 0, 7, 12, 0.25, 0.7);
  drift(m, { x: -2.6, z: 0, a: 3.2, b: 3.4, h: 1.0 });
  drift(m, { x: -6.5, z: 2.4, a: 3, b: 3.2, h: 0.7 });
  drift(m, { x: 3, z: -2, a: 3, b: 3, h: 0.5 });
}

function obelisk(m: Mesh, rnd: Rnd) {
  const col = stoneCol(rnd);
  const shaft = (len: number, w0: number, w1: number, pyr: boolean, broken: boolean) => {
    const rg: V[][] = [];
    const sec = (y: number, w: number): V[] => {
      const c = w * 0.18, h = w / 2;
      return [[h - c, y, -h], [h, y, -h + c], [h, y, h - c], [h - c, y, h], [-h + c, y, h], [-h, y, h - c], [-h, y, -h + c], [-h + c, y, -h]].map(([a, b, d]): V => [a, b, d]);
    };
    rg.push(sec(0, w0));
    for (let i = 1; i <= 4; i++) rg.push(sec((len * i) / 4 - (i === 4 && broken ? 0 : 0), w0 + (w1 - w0) * (i / 4)));
    if (broken) rg[4] = rg[4].map(([x, y, z]): V => [x, y + (rnd() - 0.5) * w1 * 0.5, z]);
    loft(m, rg, col, { capTop: broken, capBot: true });
    if (pyr && !broken) {
      const top = rg[4];
      const apex: V = [0, len + w1 * 0.8, 0];
      for (let j = 0; j < 8; j++) m.tri(top[j], top[(j + 1) % 8], apex, mulC(col, 1.04), KIND_STONE, undefined, [0, len * 0.6, 0]);
    }
  };
  // the long fallen piece, one end buried; the broken stub still standing
  placed(m, 2, 1.0, 1, 0.0, 0.25, Math.PI / 2 - 0.12, () => { m.push(new THREE.Matrix4().makeTranslation(0, -9, 0)); shaft(10, 2.3, 1.5, false, true); m.pop(); });
  placed(m, 4, 0.6, 1.5, 0.05, 0.25, Math.PI / 2 - 0.1, () => { m.push(new THREE.Matrix4().makeTranslation(0, 1.5, 0)); shaft(6.2, 1.5, 1.0, true, false); m.pop(); });
  // base and the broken standing stub
  block(m, rnd, -8, -1.2, -1, 5.5, 2.0, 5.5, 0.1, { bev: 0.12, jit: 0.06, chip: 0.2 });
  placed(m, -8, 0.8, -1, 0.04, 0.1, 0.03, () => shaft(3.8, 2.2, 1.9, false, true));
  rubble(m, rnd, 0, 0, 12, 22, 0.3, 1.0);
  drift(m, { x: -8.5, z: -1, a: 3.5, b: 4.5, h: 1.6 });
  drift(m, { x: 0, z: 1, a: 7, b: 3.6, h: 1.4 });
  drift(m, { x: 9, z: 2, a: 4, b: 3.5, h: 0.9 });
}

function theatre(m: Mesh, rnd: Rnd) {
  const seed = rnd() * 30, R0 = 18, rowW = 1.7, rows = 28, hr = 0.5, cx = 8;
  // paved semicircular orchestra
  const mc = stoneCol(rnd);
  for (let i = 0; i < 16; i++) {
    const a0 = -Math.PI / 2 + (i / 16) * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / 16) * Math.PI;
    m.tri([cx, 0.1, 0], [cx + Math.cos(a0) * (R0 - 0.2), 0.1, Math.sin(a0) * (R0 - 0.2)], [cx + Math.cos(a1) * (R0 - 0.2), 0.1, Math.sin(a1) * (R0 - 0.2)], mc, KIND_STONE, undefined, [cx, -5, 0]);
  }
  // 28 sharp tiered rows, six sectors with stairway aisles between them
  const nS = 6;
  for (let k = 0; k < rows; k++) {
    const Rin = R0 + k * rowW, Rout = Rin + rowW, ytop = -3 + k * hr;
    if (ytop < -0.15) continue;
    const gap = 0.8 / ((Rin + Rout) / 2);
    for (let a = 0; a < nS; a++) {
      if (k > 3 && vnoise(a * 1.7 + 1.3, k * 0.45, seed) < 0.27) continue;
      const a0 = -Math.PI / 2 + (a * Math.PI) / nS + gap, a1 = -Math.PI / 2 + ((a + 1) * Math.PI) / nS - gap;
      const n = Rin > 40 ? 4 : 3, rings: V[][] = [];
      for (let i = 0; i <= n; i++) {
        const an = a0 + ((a1 - a0) * i) / n, c = Math.cos(an), sn = Math.sin(an);
        rings.push([[cx + c * Rin, ytop, sn * Rin], [cx + c * Rout, ytop, sn * Rout], [cx + c * Rout, -0.6, sn * Rout], [cx + c * Rin, -0.6, sn * Rin]]);
      }
      loft(m, rings, mulC(mc, 0.97 + 0.06 * rnd()), { skip: [1, 2], capTop: true, capBot: true });
    }
  }
  // stairways: sloped ramps between the sectors
  for (let a = 0; a <= nS; a++) {
    const an = -Math.PI / 2 + (a * Math.PI) / nS, c = Math.cos(an), sn = Math.sin(an);
    const r0 = R0 + 3.5, r1 = R0 + rows * rowW, w2 = 0.7;
    const pt = (r: number, dz: number, y: number): V => [cx + c * r - sn * dz, y, sn * r + c * dz];
    loft(m, [[pt(r0, -w2, -3 + 3.5 * hr / rowW * 1), pt(r0, w2, -3 + 3.5 * hr / rowW), pt(r0, w2, -0.6), pt(r0, -w2, -0.6)], [pt(r1, -w2, -3 + (r1 - R0) * hr / rowW), pt(r1, w2, -3 + (r1 - R0) * hr / rowW), pt(r1, w2, -0.6), pt(r1, -w2, -0.6)]], mulC(mc, 0.86), { skip: [1, 2], capTop: true });
  }
  // outer arcade: arched vomitoria between piers with pilasters, standing in stretches
  const Ro = R0 + rows * rowW + 1.5, nb = 22;
  const Pt = (i: number): [number, number] => { const th = -Math.PI / 2 + (i / nb) * Math.PI; return [cx + Ro * Math.cos(th), Ro * Math.sin(th)]; };
  const up: boolean[] = [];
  for (let i = 0; i < nb; i++) up.push(vnoise(i * 0.35 + 4, 0.5, seed) > 0.4);
  for (let i = 0; i <= nb; i++) {
    const [x0, z0] = Pt(i), [x1, z1] = Pt(Math.min(nb, i + 1)), ex = i === nb;
    const [xp, zp] = Pt(Math.max(0, i - 1));
    const dx = (ex ? x0 - xp : x1 - x0), dz = (ex ? z0 - zp : z1 - z0), w = Math.hypot(dx, dz);
    const nx = dz / w, nz = -dx / w, ry = Math.atan2(nx, nz);
    const stand = (i < nb && up[i]) || (i > 0 && up[i - 1]);
    placed(m, x0, 0, z0, 0, ry, 0, () => {
      if (!stand) { stack(m, rnd, 0, 0, 2.7, 3.6, -3, rr(rnd, 0.3, 3.2), 0, 2.6); return; }
      stack(m, rnd, 0, 0, 2.7, 3.6, -3, 11, 0, 3.2);
      stack(m, rnd, 0, 2.3, 1.1, 0.9, -3, 10, 0, 3.2);
      if (i < nb && up[i]) archBand(m, rnd, { span: w - 2.7, spring: 7.2, t: 0.9, depth: 3.6, n: 5, a0: 0, a1: Math.PI });
    });
  }
  // the broken stage building: wall with niches, column stubs and pilasters
  m.push(new THREE.Matrix4().makeTranslation(-13, 0, -26).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)));
  wall(m, rnd, { L: 52, t: 2.6, depth: -2.5, ch: [0.9, 1.3], bl: [2, 3.4], top: (u) => 2 + 10 * vnoise(u * 0.1, 4, seed) * (u > 44 ? 0.3 : 1), hole: (u, y) => y > 2.4 && y < 7.2 && Math.abs(((u + 3.25) % 6.5) - 3.25) < 1.1 });
  m.pop();
  block(m, rnd, -4, -1.5, 0, 14, 1.9, 44, 0, { bev: 0.1, jit: 0.06, chip: 0.2 });
  for (let i = 0; i < 7; i++) {
    const z = -19.5 + i * 6.5, v = rnd(), o: ColOpt = { x: -9.6, z, y0: 0.45, r: 0.6, h: 7, segs: 12, dh: 3.2 };
    if (v < 0.35) column(m, rnd, { ...o, cap: true });
    else column(m, rnd, { ...o, brk: rr(rnd, 1.5, 6) });
  }
  for (let i = 0; i < 5; i++) fallenDrum(m, rnd, rr(rnd, -8, 0), rr(rnd, -20, 20), 0.6, rr(rnd, 2, 3), rr(rnd, 0, 3), undefined, 0.4);
  rubble(m, rnd, cx + 20, 0, 45, 10, 0.5, 2.6);
  // half full of sand on the +z side, banks round the outside
  drift(m, { x: cx + 18, z: 20, a: 22, b: 24, h: 7 });
  drift(m, { x: cx + 6, z: 8, a: 10, b: 9, h: 2.4, lee: true });
  drift(m, { x: -18, z: 0, a: 12, b: 26, h: 3.0 });
  drift(m, { x: cx + 66, z: -20, a: 10, b: 16, h: 3 });
  drift(m, { x: cx + 66, z: 22, a: 10, b: 14, h: 3, lee: true });
  drift(m, { x: cx + 20, z: -66, a: 14, b: 10, h: 2.6, rot: -Math.PI / 2 });
  drift(m, { x: cx + 20, z: 66, a: 14, b: 10, h: 2.2, rot: Math.PI / 2 });
}

// ---- city pieces (built directly in metres) ------------------------------------------------

/** ONE tileable 60 m section of a colonnaded avenue along z (-30..30), columns at x = +-10 every 7.5 m. */
function street(m: Mesh, rnd: Rnd) {
  m.zLim = 30;
  const seed = 11;
  for (const sd of [-1, 1]) {
    m.push(new THREE.Matrix4().makeTranslation(sd * 10, 0, -30).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)));
    wall(m, rnd, { low: true, L: 60, t: 3.4, depth: -2, ch: [0.6, 0.9], bl: [3, 5], ends: false, top: (u) => 0.4 + 1.0 * vnoise(u * 0.25, sd, seed) });
    m.pop();
  }
  type St = 'full' | 'tall' | 'mid' | 'low' | 'gone';
  const cols: { x: number; z: number; st: St; y0: number }[] = [];
  const pairs = new Set<string>();
  for (const sd of [-1, 1]) {
    const p = Math.floor(rnd() * 7);
    if (rnd() < 0.7) { pairs.add(sd + ':' + p); pairs.add(sd + ':' + (p + 1)); }
  }
  for (const sd of [-1, 1]) for (let i = 0; i < 8; i++) {
    const v = rnd();
    const stt: St = pairs.has(sd + ':' + i) ? 'full' : v < 0.15 ? 'full' : v < 0.36 ? 'tall' : v < 0.6 ? 'mid' : v < 0.82 ? 'low' : 'gone';
    cols.push({ x: sd * 10 + rr(rnd, -0.2, 0.2), z: -26.25 + i * 7.5, st: stt, y0: pairs.has(sd + ':' + i) ? -2.2 : -rr(rnd, 0.5, 4) });
  }
  const topsAt = new Map<string, number>();
  for (const c of cols) {
    const r = 0.62, h = 11.5, base = c.y0 + 0.9 * r;
    const brk = (lo: number, hi: number) => Math.min(h, Math.max(0.5, rr(rnd, lo, hi) - base));
    const o: ColOpt = { x: c.x, z: c.z, y0: c.st === 'low' ? -rr(rnd, 3.5, 4.6) : c.y0, r, h, segs: 8, dh: 3.8, lite: true, lean: rr(rnd, -0.05, 0.05), leanDir: rnd() * 6.28 };
    let nD = 0;
    if (c.st === 'full') topsAt.set(c.x + ':' + c.z, column(m, rnd, { ...o, cap: true }));
    else if (c.st === 'tall') { column(m, rnd, { ...o, brk: brk(6, 9.5) }); nD = 2; }
    else if (c.st === 'mid') { column(m, rnd, { ...o, brk: brk(3, 6) }); nD = 2; }
    else if (c.st === 'low') { column(m, rnd, { ...o, brk: brk(0.3, 2) }); nD = 1; }
    else { block(m, rnd, c.x, -0.5, c.z, 1.8, 0.7, 1.8, rnd(), { jit: 0.04 }); nD = 3; }
    // shaft sections fallen across the paving
    const dir = Math.atan2(-c.x, 0.001) * 0 + (c.x < 0 ? 0 : Math.PI) + rr(rnd, -0.6, 0.6);
    for (let k = 0; k < nD; k++) {
      const dd = 2.5 + k * rr(rnd, 2.6, 3.4), fx = c.x + Math.cos(dir) * dd, fz = c.z + Math.sin(dir) * dd;
      if (Math.abs(fz) > 27.3) continue;
      fallenDrum(m, rnd, fx, fz, 0.58, rr(rnd, 2.2, 3.4), dir + Math.PI / 2 + rr(rnd, -0.3, 0.3), undefined, rr(rnd, 0.2, 0.55), rnd() < 0.3);
    }
  }
  for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) {
    const a = topsAt.get(sd * 10 + ':' + 0), q = cols.find((c) => c.x * sd > 0 && Math.abs(c.z - (-26.25 + i * 7.5)) < 0.01), q2 = cols.find((c) => c.x * sd > 0 && Math.abs(c.z - (-26.25 + (i + 1) * 7.5)) < 0.01);
    void a;
    if (!q || !q2 || q.st !== 'full' || q2.st !== 'full') continue;
    const ta = topsAt.get(q.x + ':' + q.z), tb = topsAt.get(q2.x + ':' + q2.z);
    if (ta === undefined || tb === undefined || Math.abs(ta - tb) > 0.3) continue;
    const y = Math.min(ta, tb);
    block(m, rnd, (q.x + q2.x) / 2, y, (q.z + q2.z) / 2, 1.8, 1.5, 7.2, 0, { bev: 0.1, jit: 0.04, chip: 0.14 });
    block(m, rnd, (q.x + q2.x) / 2, y + 1.5, (q.z + q2.z) / 2, 1.5, 1.2, 6.8, 0, { bev: 0.1, jit: 0.04, chip: 0.2 });
  }
  // paving slabs showing between the drifts
  for (let gx = 0; gx < 4; gx++) for (let gz = 0; gz < 12; gz++) {
    if (vnoise(gx * 0.8 + 3, gz * 0.5, seed) < 0.5) continue;
    block(m, rnd, -6.75 + gx * 4.5, -1.2, -27.5 + gz * 5, 4.42, 1.3, 4.92, 0, { jit: 0.02, bev: 0.02, chip: 0.04 });
  }
  for (let i = 0; i < 8; i++) chunk(m, rnd, rr(rnd, -14, 14), rr(rnd, -28, 28), rr(rnd, 0.3, 1.8));
  for (let k = 0; k < 5; k++) {
    const z = -24 + k * 12 + rr(rnd, -2, 2);
    drift(m, { x: -11.8, z, a: 2.6, b: 3.6, h: rr(rnd, 1, 2.2) });
    if (k % 2 === 0) drift(m, { x: 11.5, z: z + 3, a: 3, b: 3.2, h: rr(rnd, 0.8, 1.8), lee: true });
  }
}

/** ONE tileable 60 m section of city wall along z (-30..30), 8-12 m high, broken unevenly. */
function wallrun(m: Mesh, rnd: Rnd) {
  m.zLim = 30;
  const c1 = rr(rnd, 12, 28) , c2 = rr(rnd, 36, 50), r1 = rr(rnd, 4, 8), r2 = rr(rnd, 3, 6);
  const prof = (u: number) => 10.5 * (0.55 + 0.6 * vnoise(u * 0.09 + 3, 1, 17)) + (vnoise(u * 0.7, 5, 17) - 0.5) * 2.4;
  const top = (u: number) => {
    const t = u / 60, b = prof(u) * (1 - t) + prof(u - 60) * t;
    const f = Math.min(0.12 + 0.88 * sstep(0, r1, Math.abs(u - c1)), 0.2 + 0.8 * sstep(0, r2, Math.abs(u - c2)));
    return Math.max(-0.5, b * f);
  };
  m.push(new THREE.Matrix4().makeTranslation(0, 0, -30).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)));
  wall(m, rnd, { L: 60, t: 4.4, depth: -4, ch: [1.0, 1.5], bl: [2.4, 4.4], ends: false, miss: 0.03, top, hole: (u, y) => Math.abs(u - 46) < 1.3 && y > 3.2 && y < 6.5 });
  m.pop();
  if (rnd() < 0.5) {
    const tz = rr(rnd, -12, 12);
    const tpw = mkTop(rnd, 13, 11, 5 + tz);
    tower(m, rnd, { cx: -3.5, cz: tz, rot: 0, w: 11, d: 12, t: 2.4, depth: -4, ch: [1.0, 1.5], bl: [2.2, 4], inset: (y) => (y < 0 ? 0 : y * 0.035), top: tpw });
    rubble(m, rnd, -8, tz, 7, 6, 0.6, 2.4);
    block(m, rnd, -3.5, -1, tz, 6, 8, 7, 0, { col: srgb(0.66, 0.52, 0.38), bev: 0.3, jit: 0.3, chip: 0.5 });
  }
  rubble(m, rnd, -5, c1 - 30, r1 + 3, 10, 0.5, 2.6);
  rubble(m, rnd, 4, c1 - 30, r1 + 1, 4, 0.5, 1.8);
  rubble(m, rnd, -4.5, c2 - 30, r2 + 3, 8, 0.5, 2.4);
  for (let z = -22; z <= 22; z += 15) {
    drift(m, { x: -3.2, z: z + rr(rnd, -3, 3), a: rr(rnd, 3, 5), b: rr(rnd, 5, 7), h: rr(rnd, 1.6, 3) });
    drift(m, { x: 3.2, z: z + rr(rnd, -3, 3), a: rr(rnd, 3, 4.5), b: rr(rnd, 4, 6), h: rr(rnd, 1, 2), lee: true });
  }
}

/** ONE tileable 60 m section of a two-tier arched aqueduct along z (-30..30). */
function aqueduct(m: Mesh, rnd: Rnd) {
  m.zLim = 30;
  const B = 7.5, cz0 = -26.25;
  const coll = rr(rnd, -22, 22);
  const buried = (i: number) => rr(rnd, 2.5, 5.5) + (i % 3) * 0.4;
  // piers at the bay boundaries (half piers on the tile edges so tiles join)
  for (let k = 0; k <= 8; k++) {
    const z = -30 + k * B, edge = k === 0 || k === 8, pz = edge ? 1.0 : 2.0, zc = edge ? (k === 0 ? -29.5 : 29.5) : z;
    const near = Math.abs(z - coll) < 8;
    const d = buried(k);
    stack(m, rnd, 0, zc, 4.4, pz, -d, near && !edge ? rr(rnd, 2, 7) : 11.2, 0, 3.4);
    if (!near || edge) stack(m, rnd, 0, zc, 3.6, pz * 0.85, 11.2, near ? 14.5 : 17.4, 0, 3.2);
  }
  for (let i = 0; i < 8; i++) {
    const zc = cz0 + i * B, near = Math.abs(zc - coll) < 5;
    if (!(near && rnd() < 0.5)) placed(m, 0, 0, zc, 0, Math.PI / 2, 0, () => archBand(m, rnd, { span: 5.4, spring: 7.0, t: 1.0, depth: 4.4, n: 5 }));
    if (!near) {
      placed(m, 0, 0, zc, 0, Math.PI / 2, 0, () => archBand(m, rnd, { span: 5.6, spring: 14.8, t: 0.8, depth: 3.6, n: 5 }));
      block(m, rnd, 0, 10.6, zc, 4.4, 0.7, B - 1.2, 0, { jit: 0.03 });
      block(m, rnd, 0, 18.6, zc, 4.8, 1.2, B + 0.2, 0, { bev: 0.1, jit: 0.04, chip: 0.1 });
      block(m, rnd, -2.2, 19.8, zc, 0.5, 0.8, B, 0, { jit: 0.04, chip: 0.15 });
      block(m, rnd, 2.2, 19.8, zc, 0.5, 0.8, B, 0, { jit: 0.04, chip: 0.15 });
    }
  }
  rubble(m, rnd, 0, coll, 9, 12, 0.6, 3.0);
  for (let i = 0; i < 8; i++) placed(m, rr(rnd, -7, 7), 0.2, rr(rnd, -28, 28), rr(rnd, -0.3, 0.3), rnd() * 3, rr(rnd, -0.3, 0.3), () => block(m, rnd, 0, -0.9, 0, rr(rnd, 1.6, 3.6), rr(rnd, 1, 1.8), rr(rnd, 1.2, 2.4), 0, { bev: 0.1, jit: 0.07, chip: 0.25 }));
  for (let k = 0; k < 4; k++) {
    const z = -22 + k * 14 + rr(rnd, -2, 2);
    drift(m, { x: -3.2, z, a: rr(rnd, 3, 5), b: rr(rnd, 4, 6), h: rr(rnd, 2.5, 5) });
    if (k % 2) drift(m, { x: 3.2, z: z + 3, a: rr(rnd, 3, 5), b: rr(rnd, 3, 5), h: rr(rnd, 1.5, 3.5), lee: true });
  }
}

function amphitheatre(m: Mesh, rnd: Rnd) {
  const A = 75, Bz = 60, seed = rnd() * 40;
  const NB = 32;
  const frame = (th: number, sc: number) => {
    const x = A * sc * Math.cos(th), z = Bz * sc * Math.sin(th);
    const nx = Math.cos(th) / A, nz = Math.sin(th) / Bz, l = Math.hypot(nx, nz);
    return { x, z, ry: Math.atan2(nx / l, nz / l), arc: (2 * Math.PI / 128) * 0 };
  };
  // a continuous outer arcade: piers on the ellipse with arches between them, two or three storeys on the surviving stretches
  const Pt = (i: number): [number, number] => { const th = (i / NB) * Math.PI * 2; return [A * Math.cos(th), Bz * Math.sin(th)]; };
  const tiersArr: number[] = [];
  for (let i = 0; i < NB; i++) {
    const v = vnoise(((i + 0.5) / NB) * Math.PI * 2 * 0.9 + 2, 0.5, seed);
    tiersArr.push(rnd() < 0.1 ? 0 : v > 0.7 ? 3 : v > 0.54 ? 2 : v > 0.34 ? 1 : 0);
  }
  for (let i = 0; i < NB; i++) {
    const [x0, z0] = Pt(i), [x1, z1] = Pt(i + 1);
    const dx = x1 - x0, dz = z1 - z0, w = Math.hypot(dx, dz);
    const nx = dz / w, nz = -dx / w, ry = Math.atan2(nx, nz);
    const tiers = tiersArr[i], pierT = Math.max(tiers, tiersArr[(i + NB - 1) % NB]);
    placed(m, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0, ry, 0, () => {
      if (pierT === 0) stack(m, rnd, w / 2, 0, 2.8, 5.2, -3, rr(rnd, 0.3, 3.5), 0, 2.6);
      else stack(m, rnd, w / 2, 0, 2.8, 5.2, -3, pierT * 10 - 3, 0, 3);
      for (let j = 0; j < tiers; j++) archBand(m, rnd, { span: w - 2.8, spring: j * 10 + 2.5, t: 1.0, depth: 5, n: 5 });
    });
  }
  // seating rows inside, the lowest half drowned in sand
  const rows = 6;
  for (let k = 0; k < rows; k++) {
    const sc = 0.9 - k * 0.075, top = 9.5 - k * 1.6;
    const n = 24;
    for (let i = 0; i < n; i++) {
      const th = ((i + 0.5) / n) * Math.PI * 2;
      if (vnoise(th * 3, k, seed + 7) < 0.3 && rnd() < 0.8) continue;
      const f = frame(th, sc);
      placed(m, f.x, 0, f.z, 0, f.ry, 0, () => {
        block(m, rnd, 0, -0.5, 0, 16.5, top + 0.5, 3.4, 0, { bev: 0.08, jit: 0.05, chip: 0.15 });
      });
    }
  }
  rubble(m, rnd, 0, 0, 70, 26, 0.6, 3.2);
  // the arena half full of sand, deep drifts all round (deepest on the windward -x side)
  drift(m, { x: 0, z: 0, a: 30, b: 22, h: 6, tail: 1.3 });
  drift(m, { x: -10, z: 4, a: 14, b: 12, h: 5, lee: true });
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * Math.PI * 2 + rr(rnd, -0.1, 0.1), f = frame(th, 1.02);
    const wind = 1.25 - 0.5 * Math.cos(th);
    drift(m, { x: f.x, z: f.z, a: 8, b: 10, h: 3.2 * wind, rot: f.ry - Math.PI / 2 });
  }
}

function forum(m: Mesh, rnd: Rnd) {
  const W = 80, D = 60, seed = rnd() * 30;
  for (let gx = 0; gx < 16; gx++) for (let gz = 0; gz < 12; gz++) {
    if (vnoise(gx * 0.45, gz * 0.45, seed) < 0.54) continue;
    block(m, rnd, -37.5 + gx * 5, -1.0, -27.5 + gz * 5, 4.92, 1.1, 4.92, 0, { jit: 0.025, bev: 0.02, chip: 0.04 });
  }
  const per: [number, number][] = [];
  for (let i = 0; i <= 8; i++) { per.push([-36 + i * 9, -D / 2]); per.push([-36 + i * 9, D / 2]); }
  for (let i = 1; i < 7; i++) { per.push([-W / 2, -D / 2 + i * 7]); per.push([W / 2, -D / 2 + i * 7]); }
  const full: [number, number][] = [];
  for (const [x, z] of per) {
    const v = rnd();
    const y0 = -rr(rnd, 0.5, 4);
    const r = 0.7, h = 10;
    const o: ColOpt = { x, z, y0, r, h, segs: 14, dh: 3.4, lean: rr(rnd, -0.05, 0.05), leanDir: rnd() * 6.28 };
    const base = y0 + 0.63;
    if (v < 0.12) { column(m, rnd, { ...o, cap: true }); full.push([x, z]); }
    else if (v < 0.4) column(m, rnd, { ...o, brk: Math.min(h, Math.max(0.5, rr(rnd, 4.5, 8) - base)) });
    else if (v < 0.7) column(m, rnd, { ...o, brk: Math.min(h, Math.max(0.5, rr(rnd, 1.2, 4) - base)) });
    else if (v < 0.85) column(m, rnd, { ...o, y0: -rr(rnd, 3, 4), brk: 0.6 });
    else block(m, rnd, x, -0.5, z, 2, 0.8, 2, rnd(), { jit: 0.04 });
    if (v >= 0.12 && rnd() < 0.55) {
      const dir = rnd() * 6.28, dd = rr(rnd, 2.6, 4);
      fallenDrum(m, rnd, x + Math.cos(dir) * dd, z + Math.sin(dir) * dd, 0.64, rr(rnd, 2, 3.2), dir + Math.PI / 2, undefined, rr(rnd, 0.2, 0.55), rnd() < 0.3);
    }
  }
  // rostra: a stepped podium
  stack(m, rnd, 0, -D / 2 + 8, 16, 6, -3, 2.4, 0, 1.6);
  stack(m, rnd, 0, -D / 2 + 8, 12, 4, 2.4, rr(rnd, 3.4, 5), 0, 1.4);
  for (let i = 0; i < 6; i++) {
    const x = -24 + i * 9.5 + rr(rnd, -1, 1), z = rr(rnd, -10, 10);
    stack(m, rnd, x, z, 2.8, 2.8, -2.5, rr(rnd, 1.5, 3.2), rnd() * 0.3, 1.4);
    if (rnd() < 0.6) {
      placed(m, x + rr(rnd, 3, 5), 1.0, z + rr(rnd, -2, 2), -1.3, rnd() * 6, 0.2, () => {
        const rg: V[][] = [];
        for (let a = 0; a <= 6; a++) {
          const la = 0.1 + (a / 6) * 2.5, r: V[] = [];
          for (let j = 0; j < 10; j++) { const t = (j / 10) * 6.283; r.push([Math.sin(la) * Math.sin(t) * 0.9, Math.cos(la) * 1.3, Math.sin(la) * Math.cos(t) * 1.0]); }
          rg.push(r);
        }
        smoothLoft(m, rg, stoneCol(rnd), false);
      });
    }
  }
  rubble(m, rnd, 0, 0, 40, 30, 0.4, 2.6);
  apron(m, 0, 0, W + 6, D + 6, 2.2);
  for (let i = 0; i < 7; i++) drift(m, { x: rr(rnd, -30, 30), z: rr(rnd, -20, 20), a: rr(rnd, 4, 9), b: rr(rnd, 4, 8), h: rr(rnd, 0.8, 2.2), lee: rnd() < 0.5 });
}

function basilica(m: Mesh, rnd: Rnd) {
  const seed = rnd() * 40, LX = 60, LZ = 30, t = 3.0;
  const c1 = rr(rnd, 14, 24), c2 = rr(rnd, 38, 50);
  const topLong = (side: number) => (u: number) => {
    const f = Math.min(0.14 + 0.86 * sstep(0, 8, Math.abs(u - (side > 0 ? c1 : c2))), 1);
    return Math.max(-0.5, 20 * (0.78 + 0.3 * vnoise(u * 0.05 + side * 7, 2, seed)) * f);
  };
  const WP = 9, wc = (k: number) => 4.5 + k * WP;
  const win = (u: number, y: number) => {
    const du = Math.abs(((u + 4.5) % WP) - 4.5);
    return du < 4.5 - 0 && Math.abs(du) < 2.3 && y > 7.8 && (y < 13 || du * du + (y - 13) * (y - 13) < 2.3 * 2.3);
  };
  // long walls: a clerestory of arched windows between pilasters
  for (const sd of [-1, 1]) {
    const mx = sd > 0
      ? new THREE.Matrix4().makeTranslation(-LX / 2, 0, LZ / 2 - t / 2)
      : new THREE.Matrix4().makeTranslation(LX / 2, 0, -(LZ / 2 - t / 2)).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    m.push(mx);
    const tf = topLong(sd);
    wall(m, rnd, { L: LX, t, depth: -4, ch: [1.0, 1.6], bl: [2.4, 4.4], top: tf, hole: win });
    for (let k = 0; k < 7; k++) {
      const u = wc(k);
      void tf;
    }
    for (let k = 0; k <= 7; k++) {
      const u = k * WP, top = tf(u) - 1.2;
      if (top > 5) stack(m, rnd, u, t / 2 + 0.35, 1.5, 0.8, -3, top, 0, 3);
    }
    m.pop();
  }
  // entrance wall (-x) with a great arched doorway
  m.push(new THREE.Matrix4().makeTranslation(-LX / 2 + t / 2, 0, -LZ / 2).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)));
  wall(m, rnd, { L: LZ, t, depth: -4, ch: [1.0, 1.6], bl: [2.4, 4.4], top: (u) => 17 * (0.65 + 0.35 * vnoise(u * 0.12, 3, seed)), hole: (u, y) => Math.abs(u - LZ / 2) < 2.9 && y > -3 && (y < 8 || (u - LZ / 2) * (u - LZ / 2) + (y - 8) * (y - 8) < 2.9 * 2.9) });
  placed(m, LZ / 2, 0, 0, 0, 0, 0, () => archBand(m, rnd, { span: 5.2, spring: 8, t: 1.1, depth: t + 0.1, n: 7 }));
  m.pop();
  // the semicircular apse at the +x end, with niches
  const nA = 7, RA = 14;
  for (let i = 0; i < nA; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) / nA) * Math.PI, seg = (Math.PI * RA) / nA + 0.8;
    placed(m, LX / 2 - 3 + Math.cos(a) * RA, 0, Math.sin(a) * RA, 0, a + Math.PI, 0, () => {
      m.push(new THREE.Matrix4().makeTranslation(-seg / 2, 0, 0));
      wall(m, rnd, { L: seg, t, depth: -4, ch: [1.0, 1.6], bl: [2.4, 4], top: () => 17 * (0.6 + 0.4 * vnoise(i * 3.1, 1, seed)), ends: false, hole: (u, y) => Math.abs(u - seg / 2) < 1.1 && y > 3.5 && y < 8.5 });
      m.pop();
    });
  }
  // rows of column stubs for the nave
  for (const zz of [-6.5, 6.5]) for (let i = 0; i < 7; i++) {
    const x = -22 + i * 7.5, v = rnd(), y0 = -rr(rnd, 0.3, 2.5), o: ColOpt = { x, z: zz, y0, r: 0.85, h: 11, segs: 12, dh: 3.6 };
    if (v < 0.2) column(m, rnd, { ...o, cap: true });
    else column(m, rnd, { ...o, brk: Math.max(0.6, rr(rnd, 1.5, 8) - (y0 + 0.77)) });
    if (v >= 0.2 && rnd() < 0.5) fallenDrum(m, rnd, x + rr(rnd, -2, 2), zz + (zz > 0 ? 1 : -1) * rr(rnd, 3, 5), 0.8, 2.6, rnd() * 3, undefined, 0.4);
  }
  rubble(m, rnd, 0, 0, 38, 24, 0.5, 3.2);
  apron(m, 0, 0, LX + 6, LZ + 6, 2.6);
  drift(m, { x: -10, z: 0, a: 12, b: 9, h: 4.5, lee: true });
  drift(m, { x: 12, z: 2, a: 10, b: 7, h: 3.5, lee: true });
}

/** A free-standing two-storey columned facade (Library of Celsus type), front toward +z. */
function facade(m: Mesh, rnd: Rnd) {
  const Wd = 21, seed = rnd() * 30;
  block(m, rnd, 0, -2, 6.3, Wd + 4, 2.6, 3.4, 0, { bev: 0.1, jit: 0.04, chip: 0.1 });
  block(m, rnd, 0, -2, 4.3, Wd + 2, 3.6, 2.6, 0, { bev: 0.1, jit: 0.04, chip: 0.1 });
  m.push(new THREE.Matrix4().makeTranslation(-Wd / 2, 0, 0));
  wall(m, rnd, {
    L: Wd, t: 1.5, depth: -3, ch: [0.8, 1.2], bl: [2.0, 3.4], ends: true,
    top: (u) => 16.4 * (0.92 + 0.08 * vnoise(u * 0.3, 1, seed)) * (1 - 0.6 * sstep(0.62, 1, u / Wd) * (0.5 + vnoise(u * 0.5, 4, seed))),
    hole: (u, y) => ([4.5, 10.5, 16.5].some((d) => Math.abs(u - d) < 1.25 && y < 4.6)) || ([2.2, 7.5, 13.5, 18.8].some((d) => Math.abs(u - d) < 0.7 && y > 9 && y < 12.2)),
  });
  m.pop();
  const xs = [-7.4, -2.6, 2.6, 7.4];
  const lowOk = [0.95, 0.9, 0.78, 0.5].map((p) => rnd() < p);
  const upOk = [0.9, 0.75, 0.5, 0.0].map((p, i) => lowOk[i] && rnd() < p);
  xs.forEach((cx, j) => {
    for (const sd of [-1, 1]) {
      const x = cx + sd * 1.0, z = 3.6;
      block(m, rnd, x, 1.2, z, 1.5, 1.5, 1.5, 0, { bev: 0.08, jit: 0.03, chip: 0.1 });
      const o: ColOpt = { x, z, y0: 2.7, r: 0.42, h: 5.0, segs: 12, dh: 2.6 };
      if (lowOk[j]) column(m, rnd, { ...o, cap: true });
      else column(m, rnd, { ...o, brk: rr(rnd, 0.6, 3.4) });
    }
    if (lowOk[j]) {
      block(m, rnd, cx, 9.05, 2.4, 3.9, 1.0, 3.6, 0, { bev: 0.08, jit: 0.03, chip: 0.1 });
      if (upOk[j]) {
        block(m, rnd, cx, 10.05, 2.7, 3.7, 0.5, 2.6, 0, { bev: 0.06, jit: 0.02, chip: 0.1 });
        for (const sd of [-1, 1]) column(m, rnd, { x: cx + sd * 1.0, z: 3.2, y0: 10.55, r: 0.34, h: 3.4, cap: true, segs: 12, dh: 1.8 });
        block(m, rnd, cx, 14.85, 2.6, 3.8, 0.8, 2.8, 0, { bev: 0.06, jit: 0.03, chip: 0.1 });
        if (j % 2 === 0) {
          const tri: V[] = [[-1.9, 0, 0], [1.9, 0, 0], [0, 1.3, 0]];
          loft(m, [tri.map((p): V => [cx + p[0], 15.65 + p[1], 1.2]), tri.map((p): V => [cx + p[0], 15.65 + p[1], 3.8])], stoneCol(rnd), { capTop: true, capBot: true });
        } else {
          placed(m, cx, 0, 2.5, 0, 0, 0, () => archBand(m, rnd, { span: 3.4, spring: 15.65, t: 0.4, depth: 2.6, n: 6, a0: 0, a1: Math.PI }));
        }
      }
    } else {
      chunk(m, rnd, cx + rr(rnd, -2, 2), 6 + rr(rnd, 0, 4), rr(rnd, 1, 2.2));
    }
  });
  for (let i = 0; i < 6; i++) fallenDrum(m, rnd, rr(rnd, -12, 12), rr(rnd, 8, 15), 0.42, rr(rnd, 1.6, 2.6), rr(rnd, 0, 3), undefined, rr(rnd, 0.3, 0.5));
  for (let i = 0; i < 5; i++) placed(m, rr(rnd, -14, 14), 0.1, rr(rnd, 8, 17), rr(rnd, -0.2, 0.2), rnd() * 3, rr(rnd, -0.2, 0.2), () => block(m, rnd, 0, -0.8, 0, rr(rnd, 1.6, 3), 1.0, 1.3, 0, { bev: 0.08, jit: 0.04, chip: 0.2 }));
  rubble(m, rnd, 0, 8, 14, 10, 0.3, 1.8);
  apron(m, 0, 4, Wd + 4, 10, 2.4);
  drift(m, { x: 0, z: 0.5, a: 6, b: 9, h: 3.2, lee: true });
}

/** A ruin, merged and vertex-coloured (linear RGB), y = 0 the sand surface; parts below it are buried. */
export function buildRuin(kind: RuinKind, rnd: Rnd): THREE.BufferGeometry {
  const m = new Mesh();
  const sc = SCALE[kind] ?? 1;
  m.m = new THREE.Matrix4().makeScale(sc, sc, sc);
  m.unit = 1 / sc;
  TONE = kind === 'facade' || kind === 'street' || kind === 'forum' || kind === 'theatre' || kind === 'colonnade' || kind === 'column' ? 'marble' : 'honey';
  switch (kind) {
    case 'colonnade': colonnade(m, rnd); break;
    case 'temple': temple(m, rnd); break;
    case 'arch': archKind(m, rnd); break;
    case 'wall': wallKind(m, rnd); break;
    case 'tomb': tomb(m, rnd); break;
    case 'column': colunmPair(m, rnd); break;
    case 'statue': statue(m, rnd); break;
    case 'gate': gate(m, rnd); break;
    case 'houses': houses(m, rnd); break;
    case 'well': well(m, rnd); break;
    case 'obelisk': obelisk(m, rnd); break;
    case 'theatre': theatre(m, rnd); break;
    case 'street': street(m, rnd); break;
    case 'wallrun': wallrun(m, rnd); break;
    case 'aqueduct': aqueduct(m, rnd); break;
    case 'amphitheatre': amphitheatre(m, rnd); break;
    case 'forum': forum(m, rnd); break;
    case 'basilica': basilica(m, rnd); break;
    case 'facade': facade(m, rnd); break;
  }
  return m.geometry();
}

/** Footprint radius of a ruin (m), for spacing and the flat ground it needs. */
export function ruinRadius(kind: RuinKind): number {
  return RADII[kind];
}

// ---------------------------------------------------------------- crashed jets
const PAINT = srgb(0.62, 0.6, 0.56);
const SOOT = srgb(0.11, 0.1, 0.09);
const INTERIOR = srgb(0.24, 0.215, 0.19);
const HEAT = srgb(0.3, 0.24, 0.19);
const BRONZE = srgb(0.4, 0.31, 0.22);
const RUST = srgb(0.42, 0.25, 0.15);
const DARKI = srgb(0.03, 0.03, 0.035);
const BARE = srgb(0.62, 0.63, 0.65);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function skin(base: RGB, soot: number, rust: number, x: number, y: number, z: number): RGB {
  const st = vnoise(x * 0.9, y * 2.2, z * 0.9);
  let c = mulC(base, (0.93 + 0.14 * hash3(x * 4.1, y * 3.7, z * 4.3)) * (0.92 + 0.14 * st));
  if (rust > 0) c = mixC(c, RUST, clamp((st - (1 - rust)) * 3) * 0.75);
  if (soot > 0) {
    const s = clamp(soot * (0.7 + 0.6 * vnoise(x * 2, y * 2, z * 2)));
    c = mixC(c, HEAT, clamp(s * 2) * 0.6);
    c = mixC(c, SOOT, clamp(s * 1.3 - 0.35));
  }
  return c;
}

function dish(m: Mesh, ring: V[], apex: V, col: RGB, kind = KIND_RAW) {
  for (let j = 0; j < ring.length; j++) m.tri(apex, ring[j], ring[(j + 1) % ring.length], col, kind);
}

function tube(m: Mesh, pts: V[], rad: number, col: RGB, sides = 5) {
  const rings: V[][] = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
    const ref: V = Math.abs(ty) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let ux = ty * ref[2] - tz * ref[1], uy = tz * ref[0] - tx * ref[2], uz = tx * ref[1] - ty * ref[0];
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    const r: V[] = [];
    for (let k = 0; k < sides; k++) {
      const th = (k / sides) * 6.283, c = Math.cos(th) * rad, s = Math.sin(th) * rad;
      r.push([p[0] + ux * c + vx * s, p[1] + uy * c + vy * s, p[2] + uz * c + vz * s]);
    }
    return r;
  });
  loft(m, rings, col, { kind: KIND_METAL, capTop: true, capBot: true });
}

function mblock(m: Mesh, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: RGB, rnd: Rnd, j = 0.02) {
  const pt = (a: number, b: number, c: number): V => [cx + a * sx / 2 + (rnd() - 0.5) * j, cy + b * sy / 2 + (rnd() - 0.5) * j, cz + c * sz / 2 + (rnd() - 0.5) * j];
  const ring = (b: number): V[] => SG.map(([a, c]) => pt(a, b, c));
  loft(m, [ring(-1), ring(1)], col, { kind: KIND_METAL, capTop: true, capBot: true });
}

// fuselage stations: x from the exhaust (0) to the nose tip, half width, top, bottom, squareness
const FUS: number[][] = [
  [0, 0.8, 0.8, 0.6, 2.6], [3, 0.95, 0.92, 0.66, 2.6], [6, 1.05, 1.0, 0.72, 2.8], [9, 1.15, 1.05, 0.8, 2.8],
  [11, 0.98, 1.0, 0.82, 2.4], [12.6, 0.86, 0.95, 0.78, 2.2], [14.4, 0.68, 0.72, 0.62, 2.2], [16, 0.42, 0.45, 0.4, 2], [17.3, 0.1, 0.12, 0.1, 2],
];
function fusAt(x: number): number[] {
  for (let i = 0; i < FUS.length - 1; i++) {
    const a = FUS[i], b = FUS[i + 1];
    if (x <= b[0]) { const t = clamp((x - a[0]) / (b[0] - a[0])); return a.map((v, k) => lerp(v, b[k], t)); }
  }
  return FUS[FUS.length - 1];
}
function fusRing(x: number, np: number, twin: boolean): V[] {
  const [, hw0, top, bot, n] = fusAt(x);
  const hw = hw0 * (twin ? 1 + 0.14 * clamp(1 - x / 9) : 1);
  const r: V[] = [];
  for (let j = 0; j < np; j++) {
    const a = (j / np) * 6.283, s = Math.sin(a), c = Math.cos(a);
    r.push([x, (s > 0 ? top : bot) * Math.sign(s) * Math.pow(Math.abs(s), 2 / n), hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n)]);
  }
  return r;
}

interface PieceO { brkA: boolean; brkB: boolean; base: RGB; rust: number; burn: number; twin: boolean; cockpit?: boolean; crush?: number; buckle?: number; fires?: V[] }
/** A length of fuselage x0..x1 (local x from 0), ragged and burnt at its broken ends, cockpit open if asked. */
function fusePiece(m: Mesh, rnd: Rnd, x0: number, x1: number, o: PieceO) {
  const np = 16;
  const nSt = Math.max(2, Math.ceil((x1 - x0) / 0.9));
  const rings: V[][] = [], tint: number[][] = [];
  for (let i = 0; i <= nSt; i++) {
    const x = lerp(x0, x1, i / nSt);
    const r = fusRing(x, np, o.twin);
    const t = o.cockpit ? sstep(11.5, 12.2, x) * (1 - sstep(13.9, 14.5, x)) : 0;
    const tt: number[] = [];
    r.forEach((p, j) => {
      let y = p[1], z = p[2], xx = x;
      const up = Math.sin((j / np) * 6.283);
      let k = 0;
      if (t > 0 && up > 0.2) { k = t * sstep(0.2, 0.5, up); y = lerp(y, 0.12, k * 0.85); z *= lerp(1, 0.8, k); }
      // crushed, buckled skin: waves in the shell, the section squashed to an oval
      const bk = (o.buckle ?? 0.05) * (vnoise(x * 1.1, j * 0.9, 3.1) - 0.5) * 2 + (o.buckle ?? 0.05) * 0.5 * Math.sin(x * 3.1 + j * 1.7);
      y *= 1 + bk; z *= 1 + bk * 0.8;
      if (o.crush) { const mid = Math.sin((i / nSt) * Math.PI); y *= 1 - o.crush * (0.4 + 0.6 * mid); z *= 1 + o.crush * 0.35 * mid; if (up > 0.5) y -= o.crush * 0.25 * mid; }
      const jag = (i === 0 && o.brkA) || (i === nSt && o.brkB);
      if (jag) { xx += (rnd() - 0.5) * 1.1; y *= 0.95 + rnd() * 0.05; z *= 0.95 + rnd() * 0.05; y += (rnd() - 0.5) * 0.12; }
      else if ((i === 1 && o.brkA) || (i === nSt - 1 && o.brkB)) { y += (rnd() - 0.5) * 0.06; z += (rnd() - 0.5) * 0.06; }
      r[j] = [xx - x0, y, z];
      tt.push(k);
    });
    rings.push(r); tint.push(tt);
  }
  const cf = (i: number, j: number): RGB => {
    const p = rings[i][j], x = p[0] + x0;
    const dA = o.brkA ? x - x0 : 99, dB = o.brkB ? x1 - x : 99;
    const sootT = o.burn * Math.max(Math.exp(-dA / 1.6), Math.exp(-dB / 1.6));
    let st2 = sootT;
    if (o.fires) for (const f of o.fires) st2 = Math.max(st2, 0.95 * Math.exp(-Math.hypot(p[0] - f[0], p[1] - f[1], p[2] - f[2]) / 1.7));
    let c = skin(o.base, st2, o.rust, p[0], p[1], p[2]);
    // panel lines: a thin darker band at every third frame
    if (i % 3 === 0) c = mulC(c, 0.9);
    return tint[i][j] > 0 ? mixC(c, DARKI, clamp(tint[i][j] * 1.3)) : c;
  };
  loft(m, rings, cf, { kind: KIND_METAL });
  const ends: [boolean, V[], number][] = [[o.brkA, rings[0], 1], [o.brkB, rings[nSt], -1]];
  for (const [b, ring, dir] of ends) {
    if (!b) continue;
    const ax = ring.reduce((a, p) => a + p[0], 0) / np;
    dish(m, ring, [ax + dir * (1.1 + rnd() * 0.8), 0, 0], INTERIOR, KIND_METAL);
    // two bulkhead frames just inside the break
    for (let f = 1; f <= 2; f++) {
      const sc = 0.93;
      const fx = ax + dir * (0.35 + f * 0.7);
      const r0: V[] = ring.map((p) => [fx, p[1] * sc, p[2] * sc]);
      const r1: V[] = ring.map((p) => [fx + dir * 0.1, p[1] * sc, p[2] * sc]);
      loft(m, [r0, r1], mulC(o.base, 0.6), { kind: KIND_METAL });
    }
  }
}

interface WingO { rootC: number; tipC: number; span: number; sweep: number; t0: number; base: RGB; rust: number; sootRoot: number; sootTip: number; tornRoot?: boolean }
/** A tapered, swept aerofoil panel; span along +z, chord along -x from the leading edge. */
function wing(m: Mesh, rnd: Rnd, o: WingO) {
  const NS = 4;
  const rings: V[][] = [];
  for (let i = 0; i < NS; i++) {
    const s = i / (NS - 1), c = lerp(o.rootC, o.tipC, s), xle = o.rootC / 2 - o.sweep * s, t = o.t0 * (1 - 0.55 * s), z = o.span * s;
    const pts: [number, number][] = [[xle, 0], [xle - 0.25 * c, t], [xle - 0.6 * c, 0.8 * t], [xle - c, 0.03], [xle - c, -0.03], [xle - 0.6 * c, -0.7 * t], [xle - 0.25 * c, -0.9 * t]];
    const torn = (i === 0 && o.tornRoot) || (i === NS - 1 && o.sootTip > 0.3);
    rings.push(pts.map(([x, y]): V => [x + (torn ? (rnd() - 0.5) * 0.5 : 0), y + (torn ? (rnd() - 0.5) * 0.12 : 0), z + (torn ? (rnd() - 0.5) * 0.5 : 0)]));
  }
  loft(m, rings, (i, j) => {
    const s = i / (NS - 1), p = rings[i][j];
    return skin(o.base, Math.max(o.sootRoot * Math.exp(-s * 4), o.sootTip * Math.exp(-(1 - s) * 5)), o.rust, p[0], p[1], p[2]);
  }, { kind: KIND_METAL });
  const nm = (r: V[]) => r.reduce((a, p) => a + p[0], 0) / r.length;
  if (o.tornRoot) dish(m, rings[0], [nm(rings[0]), 0, o.span * 0.2 + 0.3], INTERIOR, KIND_METAL);
  else loft(m, [rings[0]], o.base, { kind: KIND_METAL, capTop: true });
  if (o.sootTip > 0.3) dish(m, rings[NS - 1], [nm(rings[NS - 1]), 0, o.span - 0.5], INTERIOR, KIND_METAL);
  else loft(m, [rings[NS - 1]], o.base, { kind: KIND_METAL, capTop: true });
}

function nozzle(m: Mesh, rnd: Rnd, z: number, r: number, burn: number) {
  const np = 16;
  const ring = (x: number, rad: number, petals: boolean): V[] => Array.from({ length: np }, (_, j) => {
    const th = (j / np) * 6.283, k = petals ? (j % 2 ? 0.93 : 1) : 1;
    return [x, Math.sin(th) * rad * k, z + Math.cos(th) * rad * k] as V;
  });
  const rings = [ring(0.6, r, false), ring(-0.3, r * 0.97, true), ring(-0.95, r * 0.86, true)];
  loft(m, rings, (_i, j) => skin(BRONZE, 0.25 + 0.5 * burn, 0.2, 0, j, z), { kind: KIND_METAL });
  const inner = ring(-0.93, r * 0.78, false);
  loft(m, [rings[2], inner], mulC(DARKI, 3), { kind: KIND_RAW });
  dish(m, inner, [0.0, 0, z], DARKI);
}

function jetPanel(m: Mesh, rnd: Rnd, x: number, z: number, s: number, base: RGB, burn: number, rust: number, asp = 1.3) {
  const n = 5 + Math.floor(rnd() * 3);
  const bend = rr(rnd, -0.35, 0.35), bendAx = rnd() * 6.28;
  const pts: V[] = [];
  const ang0 = rnd() * 6.28;
  for (let j = 0; j < n; j++) {
    const a = ang0 + (j / n) * 6.283 + (rnd() - 0.5) * 0.5, r = s * rr(rnd, 0.4, 1) * (j % 2 ? 0.75 : 1);
    const px = Math.cos(a) * r * asp, pz = Math.sin(a) * r;
    pts.push([px, bend * (px * Math.cos(bendAx) + pz * Math.sin(bendAx)) * 0.5 + (rnd() - 0.5) * 0.05, pz]);
  }
  const alt = rnd() < 0.3 ? BARE : base;
  const pc = (p: V, edge: boolean): RGB => {
    let c = skin(alt, edge ? burn * rnd() : burn * 0.3, rust, p[0] + x, p[1], p[2] + z);
    if (edge && rnd() < 0.4) c = mulC(c, 0.6);
    return c;
  };
  placed(m, x, -s * rr(rnd, 0.12, 0.4), z, rr(rnd, -0.5, 0.5), rnd() * 6.28, rr(rnd, -0.5, 0.5), () => {
    const c: V = [0, 0, 0];
    const cc = pc(c, false), pcs = pts.map((p) => pc(p, true));
    for (let j = 0; j < n; j++) m.tri(c, pts[j], pts[(j + 1) % n], [cc, pcs[j], pcs[(j + 1) % n]], KIND_METAL);
  });
}

function wheel(m: Mesh, x: number, y: number, z: number, R: number, r: number) {
  const NR = 12, NC = 6, rings: V[][] = [];
  for (let i = 0; i < NR; i++) {
    const a = (i / NR) * 6.283, ca = Math.cos(a), sa = Math.sin(a), ring: V[] = [];
    for (let j = 0; j < NC; j++) {
      const b = (j / NC) * 6.283, rad = R + r * Math.cos(b);
      ring.push([x + ca * rad, y + sa * rad, z + r * Math.sin(b) * 1.1]);
    }
    rings.push(ring);
  }
  rings.push(rings[0]);
  loft(m, rings, srgb(0.07, 0.07, 0.075), { kind: KIND_METAL });
}

function paramSheet(m: Mesh, nu: number, nv: number, P: (u: number, v: number) => V) {
  const e = 1e-3;
  const N = (u: number, v: number): V => {
    const a = P(u + e, v), b = P(u - e, v), c = P(u, v + e), d = P(u, v - e);
    const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    let nx = du[1] * dv[2] - du[2] * dv[1], ny = du[2] * dv[0] - du[0] * dv[2], nz = du[0] * dv[1] - du[1] * dv[0];
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const pos: V[][] = [], nrm: V[][] = [];
  for (let i = 0; i <= nu; i++) {
    const pr: V[] = [], nr: V[] = [];
    for (let j = 0; j <= nv; j++) { pr.push(P(i / nu, j / nv)); nr.push(N(i / nu, j / nv)); }
    pos.push(pr); nrm.push(nr);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    m.tri(pos[i][j], pos[i + 1][j], pos[i][j + 1], SAND, KIND_SAND, [nrm[i][j], nrm[i + 1][j], nrm[i][j + 1]]);
    m.tri(pos[i][j + 1], pos[i + 1][j], pos[i + 1][j + 1], SAND, KIND_SAND, [nrm[i][j + 1], nrm[i + 1][j], nrm[i + 1][j + 1]]);
  }
}

interface Pose { x: number; y: number; z: number; rx: number; ry: number; rz: number }
const poseM = (P: Pose) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(P.rx, P.ry, P.rz, 'YXZ')).setPosition(P.x, P.y, P.z);
const poseAt = (P: Pose, l: V): V => { const v = new THREE.Vector3(l[0], l[1], l[2]).applyMatrix4(poseM(P)); return [v.x, v.y, v.z]; };
const placeP = (m: Mesh, P: Pose, fn: () => void) => placed(m, P.x, P.y, P.z, P.rx, P.ry, P.rz, fn);

function engineBarrel(m: Mesh, rnd: Rnd, base: RGB, burn: number, rust: number) {
  const np = 16;
  const ring = (x: number, r: number): V[] => Array.from({ length: np }, (_, j) => [x, Math.sin((j / np) * 6.283) * r, Math.cos((j / np) * 6.283) * r] as V);
  const rings = [ring(0.6, 0.5), ring(1.4, 0.6), ring(2.8, 0.62), ring(3.8, 0.5)];
  loft(m, rings, (i, j) => skin(mixC(base, BRONZE, 0.35), i === 0 ? 0.6 * burn : 0.1, rust, i, j, 0), { kind: KIND_METAL });
  nozzle(m, rnd, 0, 0.5, burn);
  // the compressor face: lit rim, grey fan, dark hub
  const inner = ring(3.7, 0.44);
  dish(m, inner, [3.55, 0, 0], srgb(0.34, 0.33, 0.32), KIND_METAL);
  const hub = ring(3.6, 0.12);
  dish(m, hub, [3.5, 0, 0], srgb(0.1, 0.1, 0.11), KIND_METAL);
}

function seat(m: Mesh, rnd: Rnd) {
  const c = srgb(0.3, 0.29, 0.26);
  mblock(m, 0, 0.55, 0, 0.14, 0.95, 0.55, c, rnd, 0.03);
  mblock(m, 0.3, 0.12, 0, 0.55, 0.12, 0.5, mulC(c, 0.8), rnd, 0.03);
  mblock(m, -0.02, 1.15, 0, 0.2, 0.3, 0.32, mulC(c, 1.2), rnd, 0.03);
  for (const sd of [-1, 1]) tube(m, [[-0.1, 0.1, sd * 0.28], [-0.1, 1.0, sd * 0.28]], 0.035, mulC(c, 0.7), 5);
}

function canopyFrame(m: Mesh, base: RGB) {
  const c = mulC(base, 0.8);
  for (const bx of [0, 1.7]) {
    const pts: V[] = [];
    for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI; pts.push([bx, Math.sin(a) * 0.75, Math.cos(a) * 0.62]); }
    tube(m, pts, 0.07, c, 6);
  }
  for (const sd of [-1, 1]) tube(m, [[0, 0, sd * 0.62], [0.9, 0.03, sd * 0.62], [1.7, 0, sd * 0.62]], 0.07, c, 6);
  tube(m, [[0, 0.75, 0], [0.85, 0.8, 0], [1.7, 0.75, 0]], 0.06, c, 6);
}

/** A crash site: a jet broken up along a debris trail, merged and vertex-coloured, y = 0 the sand. */
export function buildCrashedJet(rnd: Rnd): THREE.BufferGeometry {
  const m = new Mesh();
  const twin = rnd() < 0.5;
  const age = rnd(), broke = rnd();
  const sg = rnd() < 0.5 ? 1 : -1;
  const phase = rnd() * 6.28;
  const burn = 0.3 + 0.55 * rnd() * (1 - age * 0.4);
  const rust = clamp(age * 1.0 - 0.2);
  const base = mixC(PAINT, SAND, age * 0.14);
  const bleached = mixC(mixC(base, BARE, 0.3), SAND, 0.18);
  m.dust = 0.45 + 0.4 * age;
  const zc = (x: number) => 1.8 * Math.sin(x * 0.05 + phase) + 0.6 * Math.sin(x * 0.13 + phase * 2);
  const po: PieceO = { brkA: true, brkB: true, base, rust, burn, twin, buckle: 0.06 };
  const noseOff = broke > 0.85;
  const fires: number[][] = [];
  const addFire = (P: Pose, l: V, heat: number) => { const w = poseAt(P, l); fires.push([+w[0].toFixed(2), +clamp(w[1], 0.3, 3).toFixed(2), +w[2].toFixed(2), heat]); };
  const hugs = (P: Pose, len: number, h: number) => {
    const c = poseAt(P, [len * 0.5, 0, 0]);
    drift(m, { x: c[0], z: c[2], a: len * 0.3, b: 1.8, h, rot: P.ry });
    const f = poseAt(P, [len + 0.5, 0, 0]);
    drift(m, { x: f[0], z: f[2], a: 2.4, b: 2.6, h: h * 1.3 });
  };
  const wreck: [number, number][] = [];

  // ---- the main piece: a long fuselage with pointed nose, open cockpit, intakes and a wing root
  const mx = 8 + rr(rnd, -2, 2);
  const pitch = rr(rnd, 0.14, 0.24);
  const PM: Pose = { x: mx, y: 0.25 + 6 * Math.sin(pitch) - age * 0.15, z: zc(mx), rx: rr(rnd, 0.15, 0.35) * sg, ry: rr(rnd, -0.2, 0.2), rz: -pitch };
  const hwx = fusAt(9)[1] * (twin ? 1.1 : 1);
  const fireM: V = [0.7, -0.35, 0];
  const fireW: V = [3.2, 0.12, sg * (hwx * 0.55 + 0.9)];
  placeP(m, PM, () => {
    fusePiece(m, rnd, 5.4, noseOff ? 15.3 : 17.3, { ...po, brkA: true, brkB: noseOff, cockpit: true, crush: 0.04, fires: [fireM, fireW] });
    const x0 = 5.4;
    const bow = (bx: number, frac: number) => {
      const pts: V[] = [];
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * (0.5 - frac * 0.5) + (k / 8) * Math.PI * frac, w = fusAt(bx)[1] * 0.78;
        pts.push([bx - x0 + (rnd() - 0.5) * 0.05, 0.12 + Math.sin(a) * 0.7 + (k > 5 ? -0.1 * (k - 5) : 0), Math.cos(a) * w]);
      }
      tube(m, pts, 0.05, mulC(base, 0.7), 5);
    };
    bow(12.4, rnd() < 0.5 ? 1 : 0.6);
    bow(13.5, rnd() < 0.6 ? 0.5 : 0.9);
    bow(14.1, 0.8);
    for (const sd of [-1, 1]) {
      const w = (x: number) => fusAt(x)[1] * 0.78 * sd;
      tube(m, [[11.9 - x0, 0.3, w(11.9)], [12.9 - x0, 0.3, w(12.9)], [13.9 - x0, 0.28, w(13.9) * 0.95], [14.3 - x0, 0.25, w(14.3) * 0.8]], 0.045, mulC(base, 0.65), 5);
    }
    mblock(m, 12.0 - x0, 0.15, 0, 0.8, 0.7, 0.45, srgb(0.16, 0.16, 0.17), rnd, 0.04);
    mblock(m, 12.0 - x0, 0.6, 0, 0.3, 0.45, 0.35, srgb(0.22, 0.22, 0.23), rnd, 0.04);
    mblock(m, 14.3 - x0, 0.33, 0, 0.6, 0.2, 1.1, srgb(0.2, 0.2, 0.21), rnd, 0.03);
    for (const s of [-1, 1]) {
      const dz = s * (hwx * 0.8);
      const rect = (x: number, k: number): V[] => {
        const pts: [number, number][] = [[1, 0.6], [1, -0.6], [0.55, -1], [-0.55, -1], [-1, -0.6], [-1, 0.6], [-0.55, 1], [0.55, 1]];
        return pts.map(([a, b]): V => [x - x0, -0.05 + b * 0.52 * k, dz + a * 0.42 * k]);
      };
      const duct = [rect(8.2, 0.3), rect(9, 0.85), rect(10.5, 1.0)];
      loft(m, duct, (_i, j) => skin(base, burn * 0.25, rust, 0, j, s), { kind: KIND_METAL });
      const throat = [rect(10.5, 1.0), rect(10.2, 0.92), rect(9.6, 0.78), rect(8.9, 0.55)];
      const tc = [mulC(base, 0.95), srgb(0.34, 0.33, 0.31), srgb(0.18, 0.17, 0.165), srgb(0.07, 0.07, 0.075)];
      loft(m, throat, (i) => tc[i], { kind: KIND_METAL });
      dish(m, throat[3], [8.4 - x0, -0.05, dz], DARKI);
      if (s === sg || rnd() < 0.5) {
        placed(m, 8.6 - x0, -0.15, s * (hwx * 0.55), 0, 0, 0, () => {
          m.push(new THREE.Matrix4().makeScale(1, 1, s));
          wing(m, rnd, { rootC: 5.4, tipC: 4.6, span: rr(rnd, 1.8, 2.8), sweep: 0.6, t0: 0.42, base, rust, sootRoot: 0, sootTip: 0.9, tornRoot: false });
          m.pop();
        });
      }
    }
  });
  addFire(PM, fireM, 1.0);
  addFire(PM, fireW, 0.7);
  hugs(PM, 11, 0.6);
  wreck.push([mx + 3, PM.z], [mx + 9, PM.z]);
  if (noseOff) {
    const PN: Pose = { x: mx + 16, y: 0.3, z: zc(mx) + 3.5 * sg, rx: rr(rnd, -0.5, 0.5), ry: rr(rnd, 0, 6), rz: rr(rnd, -0.3, 0.3) };
    placeP(m, PN, () => fusePiece(m, rnd, 15.3, 17.3, { ...po, brkA: true, brkB: false }));
  }

  // ---- rear fuselage with the tail fin(s) standing, stabilisers and engine nozzle(s)
  const rx = -9 + rr(rnd, -3, 3);
  const PR: Pose = { x: rx, y: 0.4, z: zc(rx) + 2.4 * sg, rx: rr(rnd, 0.1, 0.45) * sg, ry: 0.5 * sg + rr(rnd, -0.3, 0.3), rz: rr(rnd, -0.1, 0.1) };
  const fireR: V = [-0.2, 0.55, twin ? 0.6 : 0];
  placeP(m, PR, () => {
    fusePiece(m, rnd, 0, 5.4, { ...po, brkA: false, brkB: true, fires: [[-0.3, 0.2, twin ? 0.6 : 0]] });
    if (twin) { nozzle(m, rnd, -0.6, 0.48, burn); nozzle(m, rnd, 0.6, 0.48, burn); } else nozzle(m, rnd, 0, 0.58, burn);
    const finO: WingO = { rootC: 3.9, tipC: 1.4, span: 2.9, sweep: 2.0, t0: 0.2, base, rust, sootRoot: 0, sootTip: 0 };
    for (const f of twin ? [-1, 1] : [0]) {
      const short = rnd() < broke * 0.45;
      placed(m, 3.0, 0.45, f * 0.62, -Math.PI / 2 + f * 0.26, 0, 0, () => {
        wing(m, rnd, { ...finO, span: short ? rr(rnd, 1.5, 2.1) : finO.span, sootTip: short ? 0.8 : 0 });
      });
    }
    for (const s of [-1, 1]) {
      if (rnd() < 0.2) continue;
      placed(m, 1.4, -0.05, s * (fusAt(1.4)[1] * (twin ? 1.1 : 1) * 0.6), 0, 0, 0, () => {
        m.push(new THREE.Matrix4().makeScale(1, 1, s));
        const lost = rnd() < broke * 0.6;
        wing(m, rnd, { rootC: 2.9, tipC: 1.2, span: lost ? rr(rnd, 1.2, 1.7) : 2.6, sweep: 1.6, t0: 0.13, base, rust, sootRoot: 0, sootTip: lost ? 0.8 : 0.1 });
        m.pop();
      });
    }
  });
  addFire(PR, fireR, 0.8);
  hugs(PR, 5.4, 0.5);
  wreck.push([rx + 2, PR.z]);

  // ---- the wing that tore off, thick, upside down further back
  const wx = -19 + rr(rnd, -4, 3);
  const PW: Pose = { x: wx, y: 0.05 - age * 0.1, z: zc(wx) - 7.5 * sg, rx: 2.8 * sg + rr(rnd, -0.15, 0.15), ry: 0.4 + rr(rnd, -0.4, 0.4), rz: 0.08 };
  placeP(m, PW, () => {
    m.push(new THREE.Matrix4().makeScale(1, 1, -sg));
    wing(m, rnd, { rootC: 5.6, tipC: 1.8, span: 5.2, sweep: 3.6, t0: 0.46, base, rust, sootRoot: 1, sootTip: 0.12, tornRoot: true });
    mblock(m, 0.8, -0.4, 2.4, 1.3, 0.55, 0.2, mulC(base, 0.8), rnd);
    m.pop();
  });
  if (rnd() < 0.5) addFire(PW, [-0.6, 0.45, -sg * 0.7], 0.3);
  hugs({ ...PW, rx: 0 }, 4.2, 0.45 + age * 0.4);
  wreck.push([wx, PW.z]);

  // ---- a few big, legible pieces: the engine, a landing gear leg with its wheels, the canopy frame, the ejection seat
  const ex = rr(rnd, -3, 2) - 20, PE: Pose = { x: ex, y: 0.3, z: zc(ex) + rr(rnd, 3.5, 5.5) * sg, rx: rr(rnd, -0.3, 0.3), ry: rr(rnd, 0, 6), rz: rr(rnd, -0.15, 0.15) };
  placeP(m, PE, () => engineBarrel(m, rnd, base, burn, rust));
  drift(m, { x: PE.x, z: PE.z, a: 2.2, b: 1.8, h: 0.4 });
  const gx = rr(rnd, -14, -4), gz = zc(gx) - rr(rnd, 4, 6) * sg;
  placed(m, gx, 0.15, gz, rr(rnd, -0.2, 0.2), rnd() * 6, rr(rnd, 0.9, 1.25), () => {
    tube(m, [[0, 0, 0], [0.05, 1.0, 0.0], [0.12, 2.0, 0.08]], 0.11, mulC(bleached, 0.85), 6);
    tube(m, [[0.05, 0.6, 0], [0.7, 1.4, 0.2]], 0.06, mulC(bleached, 0.75), 5);
    wheel(m, 0, -0.1, 0.22, 0.42, 0.16);
    wheel(m, 0, -0.1, -0.22, 0.42, 0.16);
  });
  drift(m, { x: gx, z: gz, a: 1.6, b: 1.6, h: 0.45 });
  const cxp = mx + 14 + rr(rnd, -1, 3);
  placed(m, cxp, 0.1, zc(cxp) + 3.2 * sg, rr(rnd, 0.6, 1.1) * sg, rr(rnd, 0, 6), 0, () => canopyFrame(m, base));
  placed(m, mx + 3 + rr(rnd, -1, 1), 0.25, zc(mx) - 3.4 * sg, rr(rnd, -0.5, 0.5), rnd() * 6, rr(rnd, 0.5, 1.2), () => seat(m, rnd));
  if (rnd() < 0.6) {
    const tx = rr(rnd, -26, -4), tz = zc(tx) + rr(rnd, 5, 8) * sg;
    placed(m, tx, 0.1, tz, rr(rnd, -0.3, 0.3), rnd() * 6, rr(rnd, -0.2, 0.2), () => {
      const prof: [number, number][] = [[-1.8, 0], [-1.4, 0.22], [-0.8, 0.33], [0.8, 0.33], [1.4, 0.22], [1.8, 0]];
      const rings = prof.map(([x, r]) => Array.from({ length: 10 }, (_, j) => [x, Math.sin((j / 10) * 6.283) * Math.max(0.01, r), Math.cos((j / 10) * 6.283) * Math.max(0.01, r)] as V));
      loft(m, rings, (i, j) => skin(mixC(bleached, BARE, 0.2), i === 0 ? burn * 0.5 : 0.05, rust, i, j, 0), { kind: KIND_METAL });
    });
  }

  // ---- debris along the trail: large panels, half sunk, sun-bleached, sand-dusted, burnt near the wrecks
  const burnAt = (x: number, z: number) => burn * wreck.reduce((a, [wx2, wz]) => Math.max(a, Math.exp(-((x - wx2) ** 2 + (z - wz) ** 2) / 70)), 0);
  const nP = 7 + Math.floor(9 * broke);
  for (let i = 0; i < nP; i++) {
    const x = rr(rnd, -36, 22), z = zc(x) + (rnd() < 0.85 ? rr(rnd, -4, 4) : rr(rnd, -8, 8));
    const sz2 = rr(rnd, 0.8, 2.2);
    jetPanel(m, rnd, x, z, sz2, bleached, burnAt(x, z), rust);
    drift(m, { x: x - 0.3, z, a: sz2 * 0.8, b: sz2 * 0.8, h: sz2 * 0.25 });
  }
  for (let i = 0; i < 3; i++) {
    const x = rr(rnd, -30, 14);
    placed(m, x, 0, zc(x) + rr(rnd, -5, 5), rr(rnd, -0.5, 0.5), rnd() * 6, rr(rnd, -0.5, 0.5), () => mblock(m, 0, 0, 0, rr(rnd, 0.6, 1.2), rr(rnd, 0.4, 0.7), rr(rnd, 0.5, 1.0), pick(rnd, [srgb(0.2, 0.2, 0.21), mulC(bleached, 0.7), srgb(0.36, 0.32, 0.24)]), rnd, 0.1));
  }

  // ---- the furrow: two berms of thrown-up sand along the track, piles where pieces dug in
  const s0 = -36, s1 = mx + 15;
  for (const off of [-2.3, 2.3]) {
    const amp = rr(rnd, 0.28, 0.5);
    paramSheet(m, Math.round((s1 - s0) / 2.2), 6, (u, v) => {
      const sx = lerp(s0, s1, u), lat = lerp(-1, 1, v);
      const env = sstep(0, 8, sx - s0) * (1 - sstep(0, 6, sx - (s1 - 6)));
      const hs = amp * (0.35 + 0.9 * vnoise(sx * 0.3, off, phase)) * env;
      const f = 1 - lat * lat;
      return [sx, hs * f * f - 0.02, zc(sx) + off + lat * 1.6];
    });
  }
  drift(m, { x: -34, z: zc(-34), a: 3.2, b: 4, h: 0.7, lee: true });
  drift(m, { x: mx + 17, z: zc(mx + 16) + 0.3, a: 4, b: 4, h: 1.2 });
  const geo = m.geometry();
  geo.userData.fires = fires;
  return geo;
}

/** Footprint radius of a crash site (m). */
export const CRASH_RADIUS = 44;
