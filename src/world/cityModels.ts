// Dune Sea: the ancient cities' one-off models (ancientCities.ts places them): the great Doric temples of
// a Paestum, a temenos with its porticoes, a triple arch, a hippodrome / stadium, an oval plaza ringed by
// columns, and whole districts of house foundations (low walls forming room grids).
//
// Built like the ruins in desertRuins.ts: one merged non-indexed BufferGeometry (position, normal,
// colour in linear RGB), y = 0 the sand, flat-shaded stone with normals facing out, half buried, no
// textures, a few sand drifts. Deterministic: only the given rnd. Each stays under 12k triangles.

import * as THREE from 'three';

type V = [number, number, number];
type RGB = [number, number, number];
type Rnd = () => number;

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const srgb = (r: number, g: number, b: number): RGB => [lin(r), lin(g), lin(b)];
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const rr = (rnd: Rnd, a: number, b: number) => a + (b - a) * rnd();

const SAND = srgb(0.86, 0.71, 0.48);
const DUST = srgb(0.85, 0.72, 0.52);
/** honey limestone and pale cream marble, block to block a few per cent apart */
const HONEY: RGB = [0.84, 0.78, 0.66];
const MARBLE: RGB = [0.92, 0.89, 0.83];

/** A stone colour of the given tone, a little different each block. */
function stone(rnd: Rnd, tone: RGB, dark = 1): RGB {
  const k = (0.95 + 0.1 * rnd()) * dark;
  return srgb(clamp(tone[0] * k), clamp(tone[1] * k * (0.99 + 0.02 * rnd())), clamp(tone[2] * k * (0.98 + 0.03 * rnd())));
}

/** The geometry being built: flat-shaded triangles in a local frame turned about y and moved. */
class Geo {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  /** the frame: offset and turn about y */
  ox = 0;
  oy = 0;
  oz = 0;
  c = 1;
  s = 0;
  private stack: number[][] = [];

  push(x: number, y: number, z: number, ry: number): void {
    this.stack.push([this.ox, this.oy, this.oz, this.c, this.s]);
    // (the new frame inside the current one)
    const nx = this.ox + x * this.c + z * this.s, nz = this.oz - x * this.s + z * this.c;
    const a = Math.atan2(this.s, this.c) + ry;
    this.ox = nx;
    this.oy += y;
    this.oz = nz;
    this.c = Math.cos(a);
    this.s = Math.sin(a);
  }
  pop(): void {
    [this.ox, this.oy, this.oz, this.c, this.s] = this.stack.pop()!;
  }
  private w(p: V): V {
    return [this.ox + p[0] * this.c + p[2] * this.s, this.oy + p[1], this.oz - p[0] * this.s + p[2] * this.c];
  }

  /** A triangle (local points); its face turned away from `out` when given. Stone is shaded by height and facing. */
  tri(a: V, b: V, c: V, col: RGB, out?: V, raw = false): void {
    let A = this.w(a), B = this.w(b), C = this.w(c);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    if (out) {
      const O = this.w(out);
      if (nx * ((A[0] + B[0] + C[0]) / 3 - O[0]) + ny * ((A[1] + B[1] + C[1]) / 3 - O[1]) + nz * ((A[2] + B[2] + C[2]) / 3 - O[2]) < 0) {
        nx = -nx; ny = -ny; nz = -nz;
        const t = B; B = C; C = t;
      }
    }
    let r = col[0], g = col[1], bl = col[2];
    if (!raw) {
      // darker low down (the sand-stained foot), darker faces turned down, dust on the faces turned up
      const y = (A[1] + B[1] + C[1]) / 3;
      let k = 0.72 + 0.28 * sstep(-1, 1.8, y);
      if (ny < -0.3) k *= 0.75;
      r *= k; g *= k; bl *= k;
      if (ny > 0.5) {
        const u = 0.12 * ny;
        r += (DUST[0] - r) * u; g += (DUST[1] - g) * u; bl += (DUST[2] - bl) * u;
      }
    }
    this.pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    for (let i = 0; i < 3; i++) {
      this.nor.push(nx, ny, nz);
      this.col.push(r, g, bl);
    }
  }
  quad(a: V, b: V, c: V, d: V, col: RGB, out?: V, raw = false): void {
    this.tri(a, b, c, col, out, raw);
    this.tri(a, c, d, col, out, raw);
  }

  /** A block centred on (x, z), from y0 up sy, turned ry; the bottom face left out. */
  box(x: number, y0: number, z: number, sx: number, sy: number, sz: number, ry: number, col: RGB, top = true): void {
    const hx = sx / 2, hz = sz / 2, c = Math.cos(ry), s = Math.sin(ry);
    const P = (px: number, py: number, pz: number): V => [x + px * c + pz * s, py, z - px * s + pz * c];
    const y1 = y0 + sy;
    const b = [P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz)];
    const t = [P(-hx, y1, -hz), P(hx, y1, -hz), P(hx, y1, hz), P(-hx, y1, hz)];
    const o: V = [x, y0 + sy / 2, z];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(b[i], b[j], t[j], t[i], col, o);
    }
    if (top) this.quad(t[0], t[1], t[2], t[3], col, o);
  }

  /** An n-sided frustum (a column drum): radius r0 at y0 to r1 at y1, a fluted look with alternate faces set back. */
  drum(x: number, z: number, y0: number, y1: number, r0: number, r1: number, n: number, col: RGB, cap = true, flute = 0): void {
    const o: V = [x, (y0 + y1) / 2, z];
    const ring = (r: number, y: number): V[] => Array.from({ length: n }, (_, j) => {
      const a = (j / n) * Math.PI * 2, k = j % 2 ? 1 - flute : 1;
      return [x + Math.cos(a) * r * k, y, z + Math.sin(a) * r * k] as V;
    });
    const A = ring(r0, y0), B = ring(r1, y1);
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      this.quad(A[j], A[k], B[k], B[j], col, o);
    }
    if (cap) for (let j = 1; j < n - 1; j++) this.tri(B[0], B[j], B[j + 1], col, [x, y0 - 1, z]);
  }

  /** A drum lying on its side, half sunk (a fallen column piece). */
  fallen(x: number, z: number, r: number, len: number, ry: number, col: RGB, sink = 0.35): void {
    this.push(x, r * (1 - 2 * sink), z, ry);
    const n = 8, o: V = [0, 0, 0];
    const ring = (zz: number): V[] => Array.from({ length: n }, (_, j) => {
      const a = (j / n) * Math.PI * 2;
      return [Math.cos(a) * r, Math.sin(a) * r, zz] as V;
    });
    const A = ring(-len / 2), B = ring(len / 2);
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      if (A[j][1] < -r * 0.75 && A[k][1] < -r * 0.75) continue;
      this.quad(A[j], A[k], B[k], B[j], col, o);
    }
    for (let j = 1; j < n - 1; j++) {
      this.tri(A[0], A[j], A[j + 1], col, o);
      this.tri(B[0], B[j], B[j + 1], col, o);
    }
    this.pop();
  }

  /** A curved band of an arch in the local x-y plane (spanning x = -span/2..span/2), depth along z. */
  archBand(x: number, z: number, span: number, spring: number, t: number, depth: number, n: number, col: RGB): void {
    const ri = span / 2, ro = ri + t, hz = depth / 2;
    const at = (a: number): V[] => {
      const ca = Math.cos(a), sa = Math.sin(a);
      return [[x + ca * ri, spring + sa * ri, z - hz], [x + ca * ri, spring + sa * ri, z + hz], [x + ca * ro, spring + sa * ro, z + hz], [x + ca * ro, spring + sa * ro, z - hz]];
    };
    let prev = at(0);
    for (let i = 1; i <= n; i++) {
      const cur = at((i / n) * Math.PI);
      // (each face of the band turned away from the arch's own curve)
      const mid = (i - 0.5) / n * Math.PI;
      const ctr: V = [x + Math.cos(mid) * (ri + t / 2), spring + Math.sin(mid) * (ri + t / 2), z];
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        this.quad(prev[k], prev[k2], cur[k2], cur[k], col, ctr);
      }
      prev = cur;
    }
  }

  /** A low mound of drifted sand: an elliptical dome a x b, h high, its rim at the sand. */
  drift(x: number, z: number, a: number, b: number, h: number, ry = 0): void {
    const S = 10, R = [0, 0.45, 0.75, 1];
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (q: number, j: number): V => {
      const t = (j / S) * Math.PI * 2, px = Math.cos(t) * a * q, pz = Math.sin(t) * b * q;
      const f = 1 - q * q;
      return [x + px * c + pz * s, h * f * f - 0.03, z - px * s + pz * c];
    };
    for (let i = 0; i < R.length - 1; i++) for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S;
      const below: V = [x, -h * 4, z];
      if (i === 0) this.tri(P(0, 0), P(R[1], j), P(R[1], j2), SAND, below, true);
      else this.quad(P(R[i], j), P(R[i + 1], j), P(R[i + 1], j2), P(R[i], j2), SAND, below, true);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** A column at (x, z) standing on y0: shaft of h with entasis (fluted), a Doric cushion capital or an Ionic/Corinthian block; returns its top. */
function column(g: Geo, rnd: Rnd, x: number, z: number, y0: number, r: number, h: number, tone: RGB, o: { n?: number; doric?: boolean; brk?: number; base?: boolean } = {}): number {
  const n = o.n ?? 12, col = stone(rnd, tone);
  let y = y0;
  if (o.base) {
    g.box(x, y, z, r * 2.6, r * 0.45, r * 2.6, 0, col);
    y += r * 0.45;
  }
  const top = o.brk !== undefined ? Math.min(h, o.brk) : h;
  const rt = o.doric ? 0.76 : 0.86;
  const rad = (t: number) => r * (1 - (1 - rt) * t + 0.03 * Math.sin(Math.PI * t));
  const mid = Math.min(top, h * 0.5);
  const fl = o.doric ? 0.07 : 0.05;
  g.drum(x, z, y, y + mid, rad(0), rad(mid / h), n, col, false, fl);
  if (top > mid + 0.01) g.drum(x, z, y + mid, y + top, rad(mid / h), rad(top / h), n, col, o.brk !== undefined, fl);
  else g.drum(x, z, y + mid, y + mid + 0.01, rad(mid / h), rad(mid / h), n, col, true, fl);
  y += top;
  if (o.brk !== undefined) return y;
  if (o.doric) {
    // the echinus flaring out under a square abacus
    g.drum(x, z, y, y + r * 0.42, r * rt, r * 1.22, n, col, false);
    g.box(x, y + r * 0.42, z, r * 2.6, r * 0.38, r * 2.6, 0, col);
    return y + r * 0.8;
  }
  g.drum(x, z, y, y + r * 1.1, r * rt, r * 1.15, 8, col, false);
  g.box(x, y + r * 1.1, z, r * 2.5, r * 0.35, r * 2.5, 0, col);
  return y + r * 1.45;
}

// ----------------------------------------------------------------------------------------------
// A Doric peristyle temple (Paestum): stylobate on three steps, the peristyle all round, the full
// entablature (architrave, triglyph frieze, cornice) where it still bridges the columns, a pediment
// at either end, the cella walls inside, drums and blocks fallen round it. Long axis along x.
// ----------------------------------------------------------------------------------------------

export interface DoricOpt {
  /** columns across the ends and along the sides */
  nf: number;
  ns: number;
  /** column spacing, lower radius, shaft height (m) */
  S: number;
  r: number;
  h: number;
  /** pediments standing: 0, 1 (east, +x) or 2 */
  ped: number;
  /** 0..1: how much of the frieze and cornice has fallen (the architrave holds longer) */
  fallen: number;
  /** columns gone (fraction) */
  gone: number;
  /** a two-storey colonnade inside the cella */
  inner: boolean;
}

export function buildDoricTemple(rnd: Rnd, o: DoricOpt): THREE.BufferGeometry {
  const g = new Geo();
  const W = (o.ns - 1) * o.S, D = (o.nf - 1) * o.S;
  const tone = HONEY;
  // three steps, the lowest mostly in the sand
  const yS = 1.1;
  for (let i = 0; i < 3; i++) {
    const e = o.r * 1.4 + (2 - i) * 0.9;
    g.box(0, -1.2, 0, W + 2 * e, yS - (2 - i) * 0.45 + 1.2, D + 2 * e, 0, stone(rnd, tone));
  }
  // the peristyle
  const cols: { x: number; z: number; top: number | null }[] = [];
  const gone = new Set<number>();
  for (let i = 0; i < o.ns; i++) for (let j = 0; j < o.nf; j++) {
    if (i > 0 && i < o.ns - 1 && j > 0 && j < o.nf - 1) continue;
    const x = -W / 2 + i * o.S, z = -D / 2 + j * o.S;
    const k = cols.length;
    // (the corners always stand; the gaps come in runs along one flank)
    const corner = (i === 0 || i === o.ns - 1) && (j === 0 || j === o.nf - 1);
    const flank = j === o.nf - 1 && i > o.ns * 0.3 && i < o.ns * 0.75;
    if (!corner && rnd() < o.gone * (flank ? 3 : 0.4)) gone.add(k);
    cols.push({ x, z, top: null });
  }
  cols.forEach((c, k) => {
    if (gone.has(k)) {
      // its drums lie where it fell, outward
      const out = Math.atan2(c.z, c.x * 0.4);
      for (let d = 0; d < 3; d++) g.fallen(c.x + Math.cos(out) * (2.5 + d * 2.6) * 1.0, c.z + Math.sin(out) * (2.5 + d * 2.6), o.r * 0.9, rr(rnd, 1.6, 2.4), out + Math.PI / 2 + rr(rnd, -0.3, 0.3), stone(rnd, tone));
      if (rnd() < 0.6) column(g, rnd, c.x, c.z, yS, o.r, o.h, tone, { doric: true, n: 12, brk: rr(rnd, 0.6, 2.2) });
      return;
    }
    c.top = column(g, rnd, c.x, c.z, yS, o.r, o.h, tone, { doric: true, n: 14 });
  });
  const topY = yS + o.h + o.r * 0.8;
  // the entablature, span by span: architrave, frieze with its triglyphs, cornice
  const hA = o.r * 1.45, hF = o.r * 1.4, hC = o.r * 0.55;
  const at = (x: number, z: number) => cols.find((c) => Math.abs(c.x - x) < 0.01 && Math.abs(c.z - z) < 0.01);
  const sideOk: boolean[] = [];
  const span = (xa: number, za: number, xb: number, zb: number, end: boolean): boolean => {
    const a = at(xa, za), b = at(xb, zb);
    if (!a || !b || a.top === null || b.top === null) return false;
    const mx = (xa + xb) / 2, mz = (za + zb) / 2, alongX = Math.abs(xb - xa) > 0.1;
    const L = o.S + 0.02, T = o.r * 2.3;
    g.box(mx, topY, mz, alongX ? L : T, hA, alongX ? T : L, 0, stone(rnd, tone));
    // (the gable ends keep their frieze; the flanks lose theirs first)
    if (!end && rnd() < o.fallen) {
      if (rnd() < 0.5) g.box(mx + rr(rnd, -1, 1), -0.6, mz + Math.sign(mz) * rr(rnd, 4, 9), o.S * 0.8, hF * 0.8, T * 0.8, rr(rnd, -0.4, 0.4), stone(rnd, tone));
      return false;
    }
    const fc = stone(rnd, tone, 0.97);
    g.box(mx, topY + hA, mz, alongX ? L : T * 0.92, hF, alongX ? T * 0.92 : L, 0, fc);
    // triglyphs: two per span, standing proud of the frieze, darker
    const tc = stone(rnd, tone, 0.86);
    for (const f of [-0.25, 0.25]) {
      const tx = alongX ? mx + f * o.S : mx + Math.sign(mx) * T * 0.47;
      const tz = alongX ? mz + Math.sign(mz) * T * 0.47 : mz + f * o.S;
      g.box(tx, topY + hA, tz, alongX ? o.S * 0.16 : 0.2, hF, alongX ? 0.2 : o.S * 0.16, 0, tc);
    }
    if (rnd() < 1 - o.fallen * 0.7) g.box(mx, topY + hA + hF, mz, alongX ? L : T * 1.15, hC, alongX ? T * 1.15 : L, 0, stone(rnd, tone, 1.03));
    return true;
  };
  for (const sd of [-1, 1]) for (let i = 0; i < o.ns - 1; i++) sideOk.push(span(-W / 2 + i * o.S, sd * D / 2, -W / 2 + (i + 1) * o.S, sd * D / 2, false));
  const endOk = [true, true];
  for (const [e, x] of [[0, W / 2], [1, -W / 2]] as [number, number][]) {
    for (let j = 0; j < o.nf - 1; j++) endOk[e] = span(x, -D / 2 + j * o.S, x, -D / 2 + (j + 1) * o.S, true) && endOk[e];
  }
  // the pediments: a low triangle over each end, its raking cornices
  const yP = topY + hA + hF + hC;
  const hw = D / 2 + o.r * 1.15, rise = hw * 0.24;
  for (let e = 0; e < o.ped; e++) {
    if (!endOk[e]) continue;
    const x = e === 0 ? W / 2 : -W / 2, dx = e === 0 ? 1 : -1;
    const c = stone(rnd, tone);
    const t0: V[] = [[x - dx * 0.2, yP, -hw], [x - dx * 0.2, yP, hw], [x - dx * 0.2, yP + rise, 0]];
    const t1: V[] = t0.map((p): V => [x - dx * (o.r * 2.2), p[1], p[2]]);
    const ctr: V = [x - dx * o.r * 1.1, yP + rise * 0.3, 0];
    g.tri(t0[0], t0[1], t0[2], c, ctr);
    g.tri(t1[0], t1[1], t1[2], c, ctr);
    g.quad(t0[0], t1[0], t1[2], t0[2], c, ctr);
    g.quad(t0[1], t1[1], t1[2], t0[2], c, ctr);
    // raking cornices
    for (const sd of [-1, 1]) {
      const L = Math.hypot(hw, rise) + 0.6, a = Math.atan2(rise, hw);
      g.push(x - dx * o.r * 1.0, yP + rise / 2 - 0.05, sd * hw / 2, 0);
      const cc = stone(rnd, tone, 1.03);
      const ca = Math.cos(a), sa = Math.sin(a);
      // a slanted slab: built by hand (box() only turns about y)
      const hx = o.r * 1.35, hh = hC * 0.9;
      const P = (px: number, py: number, pz: number): V => [px, pz * sa * -sd + py, pz * ca];
      const q = [P(-hx, 0, -L / 2), P(hx, 0, -L / 2), P(hx, 0, L / 2), P(-hx, 0, L / 2)];
      const t = q.map((p): V => [p[0], p[1] + hh, p[2]]);
      const oo: V = [0, hh / 2, 0];
      for (let i = 0; i < 4; i++) g.quad(q[i], q[(i + 1) % 4], t[(i + 1) % 4], t[i], cc, oo);
      g.quad(t[0], t[1], t[2], t[3], cc, oo);
      g.quad(q[0], q[1], q[2], q[3], cc, oo);
      g.pop();
    }
    // a roof ridge stub behind it
    if (e === 0 && o.ped === 2 && rnd() < 0.5) g.box(x - dx * o.S * 1.2, yP, 0, o.S * 1.6, rise * 0.6, hw * 0.5, 0, stone(rnd, tone, 0.95));
  }
  // the cella: long walls with the pronaos and opisthodomos open, broken down unevenly
  const cw = D - o.S * 1.6, cl = W - o.S * 2.4, t = o.r * 1.1;
  const wallRun = (x0: number, x1: number, z: number, hTop: number) => {
    const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 5));
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n;
      const hh = hTop * (0.35 + 0.65 * rnd()) * (rnd() < 0.15 ? 0.2 : 1);
      g.box((xa + xb) / 2, yS - 0.3, z, Math.abs(xb - xa) + 0.05, hh, t, 0, stone(rnd, tone, 0.97));
    }
  };
  wallRun(-cl / 2, cl / 2, -cw / 2, o.h * 0.75);
  wallRun(-cl / 2, cl / 2, cw / 2, o.h * 0.6);
  g.push(cl / 2 - o.S * 0.8, 0, 0, Math.PI / 2);
  wallRun(-cw / 2 + 0.5, -2.2, 0, o.h * 0.5);
  wallRun(2.2, cw / 2 - 0.5, 0, o.h * 0.5);
  g.pop();
  if (o.inner) {
    // two rows of smaller columns inside, a second storey standing on their architrave
    for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) {
      const x = -cl / 2 + o.S * 1.2 + i * ((cl - o.S * 2.4) / 6), z = sd * cw * 0.27;
      if (rnd() < 0.2) continue;
      const tp = column(g, rnd, x, z, yS, o.r * 0.6, o.h * 0.55, tone, { doric: true, n: 10 });
      if (i < 6 && rnd() < 0.75) {
        g.box(x + (cl - o.S * 2.4) / 12, tp, z, (cl - o.S * 2.4) / 6 + 0.1, o.r * 0.7, o.r * 1.2, 0, stone(rnd, tone));
        if (rnd() < 0.6) column(g, rnd, x, z, tp + o.r * 0.7, o.r * 0.4, o.h * 0.35, tone, { doric: true, n: 8 });
      }
    }
  }
  // the altar in front of the east end
  g.box(W / 2 + o.S * 4, -0.6, 0, o.S * 1.1, 1.8, D * 0.7, 0, stone(rnd, tone, 0.95));
  // blocks and drums lying round it, a capital upside down
  for (let i = 0; i < 16; i++) {
    const sd = rnd() < 0.5 ? -1 : 1;
    const x = rr(rnd, -W / 2 - 6, W / 2 + 6), z = sd * (D / 2 + rr(rnd, 4, 14));
    if (rnd() < 0.55) g.fallen(x, z, o.r * 0.9, rr(rnd, 1.4, 2.4), rnd() * 3, stone(rnd, tone), rr(rnd, 0.3, 0.5));
    else g.box(x, -0.5, z, rr(rnd, 1.6, 3.2), rr(rnd, 0.9, 1.6), rr(rnd, 1.2, 1.8), rnd() * 3, stone(rnd, tone));
  }
  // sand drifted against the steps (the west flank and the back) and into the cella
  g.drift(-W / 2 - 2, 0, 9, D * 0.55, 2.0);
  g.drift(rr(rnd, -W / 4, W / 4), D / 2 + 3, W * 0.25, 6, 1.8);
  g.drift(-W * 0.15, 0, cl * 0.25, cw * 0.35, yS + 1.6);
  g.drift(W / 2 + 4, -D / 2 - 2, 8, 6, 1.2);
  void sideOk;
  return g.geometry();
}

// ----------------------------------------------------------------------------------------------
// A temenos (the sanctuary of Bel at Palmyra): a square precinct wall with pilasters, a double portico
// inside on three sides and a single one on the fourth, a monumental propylaeum in the middle of the
// west side (-x). The temple itself is placed separately (a ruin piece) in the middle. Side s (m).
// ----------------------------------------------------------------------------------------------

export function buildTemenos(rnd: Rnd, s: number): THREE.BufferGeometry {
  const g = new Geo();
  const h = s / ARCH_K, t = 2.4, half = s / 2;
  // the walls: courses in long stretches, broken down here and there; the west side opens for the propylaeum
  for (let side = 0; side < 4; side++) {
    g.push(0, 0, 0, (side * Math.PI) / 2);
    // (this side runs along x at z = +half; side 2 is the west, -x after the turn... laid out below)
    const n = 18, seg = s / n;
    for (let i = 0; i < n; i++) {
      const x = -half + (i + 0.5) * seg;
      const prop = side === 3 && Math.abs(x) < 22;
      if (prop) continue;
      const broken = Math.sin(i * 1.7 + side * 2.3) > 0.55 || rnd() < 0.12;
      const hh = broken ? rr(rnd, 1, h * 0.45) : h * rr(rnd, 0.85, 1);
      g.box(x, -1.5, half, seg + 0.05, hh + 1.5, t, 0, stone(rnd, HONEY));
      // pilasters on the outer face, a cornice where it is whole
      if (!broken) {
        g.box(x - seg / 2 + 0.6, -1.5, half + t / 2 + 0.3, 1.2, hh + 1.5, 0.6, 0, stone(rnd, HONEY, 1.02));
        g.box(x, hh - 0.3, half + 0.3, seg + 0.05, 1.0, t + 1.2, 0, stone(rnd, HONEY, 1.04));
      }
    }
    g.pop();
  }
  // the porticoes inside: tall Corinthian columns with their entablature in runs
  const colH = h * 0.95, r = 0.7, S = 7.6;
  const row = (z: number, x0: number, x1: number, side: number) => {
    const n = Math.floor((x1 - x0) / S);
    let prev: number | null = null, prevX = 0;
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * S;
      const v = rnd();
      g.push(0, 0, 0, (side * Math.PI) / 2);
      let top: number | null = null;
      if (v < 0.42) top = column(g, rnd, x, z, -0.3, r, colH, MARBLE, { n: 8, base: true });
      else if (v < 0.75) column(g, rnd, x, z, -0.3, r, colH, MARBLE, { n: 8, base: true, brk: rr(rnd, 1, colH * 0.7) });
      else if (v < 0.9) g.fallen(x + rr(rnd, -2, 2), z + rr(rnd, -5, -2), r, rr(rnd, 2, 3.2), rnd() * 3, stone(rnd, MARBLE));
      if (top !== null && prev !== null && Math.abs(top - prev) < 0.2) g.box((x + prevX) / 2, top, z, S + 0.1, 1.3, 1.6, 0, stone(rnd, MARBLE));
      g.pop();
      prev = top;
      prevX = x;
    }
  };
  for (let side = 0; side < 4; side++) {
    const z1 = half - 12, z2 = half - 22;
    row(z1, -half + 14, half - 14, side);
    if (side !== 3) row(z2, -half + 24, half - 24, side);
  }
  // the propylaeum: a broad stair up to a deep porch of eight columns between two tall towers (west side, -x)
  g.push(-half, 0, 0, 0);
  g.box(-9, -1, 0, 14, 2.2, 44, 0, stone(rnd, HONEY));
  g.box(-14, -1, 0, 6, 1.2, 40, 0, stone(rnd, HONEY));
  for (const sd of [-1, 1]) {
    g.box(-2, -1.5, sd * 26, 10, h * 1.15 + 1.5, 9, 0, stone(rnd, HONEY));
    g.box(-2, h * 1.15 - 0.4, sd * 26, 11, 1.2, 10, 0, stone(rnd, HONEY, 1.04));
  }
  for (let j = 0; j < 8; j++) {
    const z = -17.5 + j * 5;
    if (j === 2 || j === 6) column(g, rnd, -6, z, 1.2, 0.85, colH, MARBLE, { n: 10, base: true, brk: rr(rnd, 2, 6) });
    else {
      const tp = column(g, rnd, -6, z, 1.2, 0.85, colH, MARBLE, { n: 10, base: true });
      if (j < 7 && j !== 1 && j !== 5) g.box(-6, tp, z + 2.5, 2, 1.4, 5.1, 0, stone(rnd, MARBLE));
    }
  }
  g.pop();
  // the court: drifts across it, blocks and drums lying about
  g.drift(-half * 0.55, half * 0.3, s * 0.18, s * 0.12, 2.6, 0.4);
  g.drift(half * 0.6, -half * 0.5, s * 0.1, s * 0.14, 2.0);
  g.drift(-half - 3, -half * 0.5, 10, s * 0.2, 3.0);
  for (let i = 0; i < 26; i++) {
    const x = rr(rnd, -half + 8, half - 8), z = rr(rnd, -half + 8, half - 8);
    if (Math.abs(x) < 40 && Math.abs(z) < 25) continue;
    if (rnd() < 0.5) g.fallen(x, z, 0.7, rr(rnd, 1.8, 3), rnd() * 3, stone(rnd, MARBLE));
    else g.box(x, -0.6, z, rr(rnd, 1.6, 3), rr(rnd, 1, 1.5), rr(rnd, 1.2, 2), rnd() * 3, stone(rnd, HONEY));
  }
  return g.geometry();
}
/** the precinct wall's height is its side over this */
const ARCH_K = 15;

// ----------------------------------------------------------------------------------------------
// A triple arch (Palmyra's at the bend of the great colonnade, Hadrian's at Jerash): a tall central
// arch between two lesser ones, engaged columns on both faces, the attic broken. Passage along z.
// ----------------------------------------------------------------------------------------------

export function buildTripleArch(rnd: Rnd): THREE.BufferGeometry {
  const g = new Geo();
  const tone = HONEY;
  const sc = 7, ss = 3.6, pw = 3.2, pd = 6.0, hC = 9.6, hS = 5.6;
  // piers: from the middle outward
  const xs = [sc / 2 + pw / 2, sc / 2 + pw + ss + pw / 2];
  const top = hC + sc / 2 + 1.6;
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const x = sd * xs[k];
      const hh = k === 1 && sd > 0 ? top * 0.72 : top;
      g.box(x, -1.5, 0, pw, hh + 1.5, pd, 0, stone(rnd, tone));
      // engaged columns on both faces, niches above the side arches
      for (const fz of [-1, 1]) {
        if (k === 0 || rnd() < 0.8) column(g, rnd, x - sd * (pw / 2 - 0.2) * (k === 0 ? -1 : 1) * 0.0, fz * (pd / 2 + 0.45), 0.6, 0.45, hS + 2.2, tone, { n: 8, base: true });
      }
    }
    // the lesser arch
    const xm = sd * (sc / 2 + pw + ss / 2);
    g.archBand(xm, 0, ss, hS, 0.8, pd, 5, stone(rnd, tone));
    g.box(xm, hS + ss / 2 + 0.8, 0, ss + 0.1, top - (hS + ss / 2 + 0.8) - (sd > 0 ? top * 0.28 : 0), pd, 0, stone(rnd, tone, 0.98));
  }
  // the central arch and the spandrels over it
  g.archBand(0, 0, sc, hC, 1.1, pd + 0.3, 7, stone(rnd, tone, 1.02));
  g.box(0, hC + sc / 2 + 1.1, 0, sc + 0.1, top - (hC + sc / 2 + 1.1), pd, 0, stone(rnd, tone));
  // a cornice and the broken attic
  const W = 2 * (xs[1] + pw / 2);
  g.box(-W * 0.12, top, 0, W * 0.76, 1.0, pd + 1.0, 0, stone(rnd, tone, 1.04));
  g.box(-W * 0.18, top + 1.0, 0, W * 0.5, 2.2, pd - 0.4, 0, stone(rnd, tone));
  g.box(-W * 0.3, top + 3.2, 0, W * 0.22, 1.2, pd - 1.0, 0, stone(rnd, tone));
  // what fell from the broken east end
  for (let i = 0; i < 9; i++) {
    const x = rr(rnd, W * 0.3, W * 0.7), z = rr(rnd, -9, 9);
    if (rnd() < 0.4) g.fallen(x, z, 0.45, rr(rnd, 1.5, 2.5), rnd() * 3, stone(rnd, tone));
    else g.box(x, -0.5, z, rr(rnd, 1.4, 2.6), rr(rnd, 0.8, 1.4), rr(rnd, 1, 1.8), rnd() * 3, stone(rnd, tone));
  }
  g.drift(0, 0, 3.4, 9, 2.2);
  g.drift(-W / 2 - 2, 0, 6, 8, 2.4);
  g.drift(W / 2 + 1, 2, 4, 6, 1.2);
  return g.geometry();
}

// ----------------------------------------------------------------------------------------------
// A hippodrome or stadium: a long track (along x) between two banks of seats, a rounded end (one or
// both), the starting gates across the square end of a hippodrome, a spina down its middle. The banks
// stand in stretches, slumped and drifted over between.
// ----------------------------------------------------------------------------------------------

export interface TrackOpt {
  /** the track's length and width inside the banks (m) */
  L: number;
  W: number;
  /** rows of seats */
  rows: number;
  /** a rounded end at both ends (a stadium) or one, with gates across the other (a hippodrome) */
  rounded: 1 | 2;
  spina: boolean;
}

export function buildTrack(rnd: Rnd, o: TrackOpt): THREE.BufferGeometry {
  const g = new Geo();
  const tone = HONEY;
  const rw = 0.85, rh = 0.5, pod = 1.6, hw = o.W / 2;
  const straight = o.L - (o.rounded === 2 ? 2 * hw : hw);
  const x0 = -o.L / 2 + (o.rounded === 2 ? hw : 0), x1 = x0 + straight;
  const depth = o.rows * rw;
  // a bank: a run of rows along a path (a straight side or the curved end), each stretch standing to its own height
  const bank = (pts: [number, number, number, number][]) => {
    // pts: x, z (inner edge), and the outward normal
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az, anx, anz] = pts[i], [bx, bz, bnx, bnz] = pts[i + 1];
      const keep = Math.sin(i * 0.9 + ax * 0.013) > -0.45 ? o.rows : Math.floor(o.rows * rr(rnd, 0.15, 0.5));
      const c = stone(rnd, tone);
      const out: V = [(ax + bx) / 2 + (anx + bnx) * (depth + 10), 0, (az + bz) / 2 + (anz + bnz) * (depth + 10)];
      // the podium wall along the track
      g.quad([ax, -0.6, az], [bx, -0.6, bz], [bx, pod, bz], [ax, pod, az], c, out);
      for (let k = 0; k < keep; k++) {
        const ya = pod + k * rh, d0 = k * rw, d1 = (k + 1) * rw;
        const A0: V = [ax + anx * d0, ya + rh, az + anz * d0], B0: V = [bx + bnx * d0, ya + rh, bz + bnz * d0];
        const A1: V = [ax + anx * d1, ya + rh, az + anz * d1], B1: V = [bx + bnx * d1, ya + rh, bz + bnz * d1];
        const Ar: V = [ax + anx * d0, ya, az + anz * d0], Br: V = [bx + bnx * d0, ya, bz + bnz * d0];
        const cc = k % 2 ? c : [c[0] * 0.95, c[1] * 0.95, c[2] * 0.95] as RGB;
        g.quad(Ar, Br, B0, A0, cc, [out[0], ya + rh / 2, out[2]]);
        g.quad(A0, B0, B1, A1, cc, [out[0], -40, out[2]]);
      }
      // the back wall down to the sand
      const yt = pod + keep * rh, D = keep * rw;
      g.quad([ax + anx * D, yt, az + anz * D], [bx + bnx * D, yt, bz + bnz * D], [bx + bnx * D, -0.6, bz + bnz * D], [ax + anx * D, -0.6, az + anz * D], c, [(ax + bx) / 2, yt * 0.5, (az + bz) / 2]);
      if (keep < o.rows) for (let q = 0; q < 2; q++) g.box((ax + bx) / 2 + anx * rr(rnd, D, depth + 6), -0.4, (az + bz) / 2 + anz * rr(rnd, D, depth + 6), rr(rnd, 1.2, 2.4), rr(rnd, 0.6, 1.2), rr(rnd, 1, 1.6), rnd() * 3, stone(rnd, tone));
    }
  };
  const nS = Math.max(6, Math.round(straight / 14));
  for (const sd of [-1, 1]) {
    const pts: [number, number, number, number][] = [];
    for (let i = 0; i <= nS; i++) pts.push([x0 + (straight * i) / nS, sd * hw, 0, sd]);
    bank(pts);
  }
  // the rounded end(s)
  const ends = o.rounded === 2 ? [-1, 1] : [1];
  for (const e of ends) {
    const cx = e > 0 ? x1 : x0, pts: [number, number, number, number][] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      const nx = Math.cos(a) * e, nz = Math.sin(a);
      pts.push([cx + nx * hw, nz * hw, nx, nz]);
    }
    bank(pts);
  }
  if (o.rounded === 1) {
    // the starting gates: a curved line of arched stalls with towers at either end
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const z = -hw + (2 * hw * i) / n, x = x0 - 2 + 0.002 * z * z;
      if (rnd() < 0.2) continue;
      g.box(x, -0.8, z, 2.4, i % 3 === 0 ? 7.5 : rr(rnd, 2.5, 6.2), 1.4, 0, stone(rnd, tone));
    }
    for (const sd of [-1, 1]) g.box(x0 - 3, -1, sd * (hw + 3), 7, 9.5, 7, 0, stone(rnd, tone));
  }
  if (o.spina) {
    // the spina: a long low wall with its turning posts and a broken monument or two
    const L = straight * 0.75, cx = (x0 + x1) / 2 - (o.rounded === 1 ? 0 : 0);
    g.box(cx, -0.5, 0, L, 1.6, 3.2, 0, stone(rnd, tone, 0.97));
    for (const e of [-1, 1]) column(g, rnd, cx + e * L / 2, 0, 1.0, 1.2, 4.5, tone, { n: 8 });
    g.box(cx - L * 0.2, 1.0, 0, 2.6, 6, 2.6, 0, stone(rnd, tone));
    g.fallen(cx + L * 0.15, 4, 1.1, 9, 0.2, stone(rnd, tone));
  }
  // sand across the track and banked on the windward side
  g.drift(x0 + straight * 0.3, 0, straight * 0.2, hw * 0.8, 1.8);
  g.drift(x1 - straight * 0.15, hw * 0.4, straight * 0.12, hw * 0.7, 2.6);
  g.drift(x0 + straight * 0.6, -hw - depth - 4, straight * 0.18, 9, 2.4);
  return g.geometry();
}

// ----------------------------------------------------------------------------------------------
// An oval plaza (Jerash): paving in rings round a central altar, ringed by columns with their
// entablature standing in long runs; two openings, along x (to the cardo, +x) and back (-x).
// ----------------------------------------------------------------------------------------------

export function buildOvalPlaza(rnd: Rnd, A: number, B: number): THREE.BufferGeometry {
  const g = new Geo();
  const n = 64, r = 0.55, h = 7.6;
  // paving: rings of slabs, light and dark, the sand over the windward half
  const rings = [0.18, 0.4, 0.62, 0.84, 1.0];
  for (let k = 0; k < rings.length; k++) {
    const q0 = k === 0 ? 0 : rings[k - 1], q1 = rings[k];
    const c = k % 2 ? stone(rnd, MARBLE, 0.9) : stone(rnd, MARBLE, 0.98);
    const m = 32;
    for (let i = 0; i < m; i++) {
      const a0 = (i / m) * Math.PI * 2, a1 = ((i + 1) / m) * Math.PI * 2;
      if (Math.cos((a0 + a1) / 2) < -0.4 && k > 1 && rnd() < 0.7) continue;
      const P = (q: number, a: number): V => [Math.cos(a) * A * q, 0.12, Math.sin(a) * B * q];
      if (q0 === 0) g.tri(P(0, 0), P(q1, a0), P(q1, a1), c, [0, -5, 0], true);
      else g.quad(P(q0, a0), P(q1, a0), P(q1, a1), P(q0, a1), c, [0, -5, 0], true);
    }
  }
  g.box(0, -0.4, 0, 6, 2.0, 6, 0.3, stone(rnd, HONEY));
  // the ring of columns
  const tops: (number | null)[] = [];
  const pos: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * (A + 2), z = Math.sin(a) * (B + 2);
    pos.push([x, z]);
    // (the openings)
    if (Math.abs(Math.sin(a)) < 0.14) { tops.push(null); continue; }
    const v = rnd(), run = Math.sin(a * 3 + 0.7) > -0.3;
    if (run && v < 0.85) tops.push(column(g, rnd, x, z, -0.4, r, h, MARBLE, { n: 8, base: true }));
    else {
      tops.push(null);
      if (v < 0.6) column(g, rnd, x, z, -0.4, r, h, MARBLE, { n: 8, base: true, brk: rr(rnd, 0.5, 4) });
      g.fallen(x * 1.08 + rr(rnd, -1, 1), z * 1.08 + rr(rnd, -1, 1), r, rr(rnd, 1.6, 2.6), rnd() * 3, stone(rnd, MARBLE));
    }
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = tops[i], b = tops[j];
    if (a === null || b === null) continue;
    const [xa, za] = pos[i], [xb, zb] = pos[j];
    const L = Math.hypot(xb - xa, zb - za) + 0.1, ry = Math.atan2(-(zb - za), xb - xa);
    g.box((xa + xb) / 2, Math.min(a, b), (za + zb) / 2, L, 1.1, 1.3, ry, stone(rnd, MARBLE));
  }
  g.drift(-A * 0.75, B * 0.1, A * 0.35, B * 0.6, 2.2);
  g.drift(-A * 0.2, -B * 0.55, A * 0.3, B * 0.2, 1.2);
  return g.geometry();
}

// ----------------------------------------------------------------------------------------------
// A district of house foundations: insulae on a grid with streets between, each split into rooms by
// low walls (doorways in them, a taller stretch here and there), whole blocks and corners gone under
// the sand. ground(x, z) gives the sand's height at a point of the model (m, relative to its origin)
// so every wall stands on the sand where it is.
// ----------------------------------------------------------------------------------------------

export interface DistrictOpt {
  /** insulae across (x) and along (z), each cell x cellZ (m), streets between */
  nx: number;
  nz: number;
  cell: number;
  cellZ?: number;
  street: number;
  /** the fraction of insulae under the sand */
  buried: number;
  tone?: 'honey' | 'marble';
  /** skip the insula at (i, j) (a monument stands there) */
  skip?: (i: number, j: number) => boolean;
}

export function buildDistrict(rnd: Rnd, o: DistrictOpt, ground: (x: number, z: number) => number = () => 0): THREE.BufferGeometry {
  const g = new Geo();
  const tone = o.tone === 'marble' ? MARBLE : HONEY;
  const cz = o.cellZ ?? o.cell, PX = o.cell + o.street, PZ = cz + o.street;
  const X0 = -(o.nx * PX) / 2 + o.street / 2, Z0 = -(o.nz * PZ) / 2 + o.street / 2;
  const t = 0.9;
  const wallSeg = (xa: number, za: number, xb: number, zb: number, hBase: number) => {
    const L = Math.hypot(xb - xa, zb - za);
    if (L < 1.2) return;
    // doorways split it
    const parts: [number, number][] = [];
    if (L > 5 && rnd() < 0.65) {
      const d = rr(rnd, 1.5, L - 3);
      parts.push([0, d], [d + 1.6, L]);
    } else parts.push([0, L]);
    const ux = (xb - xa) / L, uz = (zb - za) / L, ry = Math.atan2(-uz, ux);
    for (const [p0, p1] of parts) {
      if (rnd() < 0.12) continue;
      const mx = xa + ux * (p0 + p1) / 2, mz = za + uz * (p0 + p1) / 2;
      const gy = ground(mx, mz);
      if (!(gy > -1e6)) continue;
      const hh = rnd() < 0.08 ? rr(rnd, 2.6, 4.2) : hBase * rr(rnd, 0.5, 1.3);
      g.box(mx, gy - 1.6, mz, p1 - p0 + t * 0.9, hh + 1.6, t, ry, stone(rnd, tone, 0.97));
    }
  };
  /** split a rectangle into rooms (walls along the cuts) */
  const split = (x0: number, z0: number, x1: number, z1: number, hBase: number, depth: number) => {
    const w = x1 - x0, d = z1 - z0;
    if ((w < 11 && d < 11) || depth > 4) return;
    if (w > d) {
      const x = x0 + w * rr(rnd, 0.35, 0.65);
      wallSeg(x, z0, x, z1, hBase);
      split(x0, z0, x, z1, hBase, depth + 1);
      split(x, z0, x1, z1, hBase, depth + 1);
    } else {
      const z = z0 + d * rr(rnd, 0.35, 0.65);
      wallSeg(x0, z, x1, z, hBase);
      split(x0, z0, x1, z, hBase, depth + 1);
      split(x0, z, x1, z1, hBase, depth + 1);
    }
  };
  for (let i = 0; i < o.nx; i++) for (let j = 0; j < o.nz; j++) {
    if (o.skip?.(i, j)) continue;
    if (rnd() < o.buried) continue;
    const x0 = X0 + i * PX, z0 = Z0 + j * PZ, x1 = x0 + o.cell, z1 = z0 + cz;
    const hBase = rr(rnd, 0.6, 1.5);
    // part of the block may lie under a drift: keep a corner of it
    let ax = x0, az = z0, bx = x1, bz = z1;
    if (rnd() < 0.3) {
      if (rnd() < 0.5) ax = x0 + o.cell * rr(rnd, 0.3, 0.6);
      else bz = z1 - cz * rr(rnd, 0.3, 0.6);
    }
    // the outer walls, then the rooms (a courtyard house: a peristyle of stubs in the biggest room sometimes)
    wallSeg(ax, az, bx, az, hBase * 1.2);
    wallSeg(bx, az, bx, bz, hBase * 1.2);
    wallSeg(bx, bz, ax, bz, hBase * 1.2);
    wallSeg(ax, bz, ax, az, hBase * 1.2);
    split(ax, az, bx, bz, hBase, 0);
    if (rnd() < 0.25) {
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        if (rnd() < 0.3) continue;
        const x = mx + dx * 3.2, z = mz + dz * 3.2, gy = ground(x, z);
        if (gy > -1e6) column(g, rnd, x, z, gy - 0.5, 0.35, 3.6, MARBLE, { n: 6, brk: rr(rnd, 0.6, 3) });
      }
    }
    if (rnd() < 0.35) {
      const x = rr(rnd, ax, bx), z = rr(rnd, az, bz), gy = ground(x, z);
      g.push(0, gy > -1e6 ? gy : 0, 0, 0);
      g.drift(x, z, rr(rnd, 5, 12), rr(rnd, 4, 9), rr(rnd, 0.8, 1.8));
      g.pop();
    }
  }
  return g.geometry();
}

/** The cities' one-off models by name, as the cities use them (the preview page and tests build them this way). */
export const CITY_MODELS: Record<string, (rnd: Rnd) => THREE.BufferGeometry> = {
  // Paestum: the Temple of Neptune (6 x 14, both pediments, the inner colonnade), of Hera (9 x 18, the frieze mostly gone), of Athena (6 x 13)
  neptune: (rnd) => buildDoricTemple(rnd, { nf: 6, ns: 14, S: 4.5, r: 1.05, h: 8.9, ped: 2, fallen: 0.15, gone: 0.04, inner: true }),
  hera: (rnd) => buildDoricTemple(rnd, { nf: 9, ns: 18, S: 3.05, r: 0.8, h: 6.4, ped: 0, fallen: 0.85, gone: 0.05, inner: false }),
  athena: (rnd) => buildDoricTemple(rnd, { nf: 6, ns: 13, S: 2.75, r: 0.63, h: 6.1, ped: 1, fallen: 0.45, gone: 0.12, inner: false }),
  temenos: (rnd) => buildTemenos(rnd, 205),
  arch3: (rnd) => buildTripleArch(rnd),
  hippodrome: (rnd) => buildTrack(rnd, { L: 245, W: 52, rows: 14, rounded: 1, spina: true }),
  stadium: (rnd) => buildTrack(rnd, { L: 230, W: 30, rows: 16, rounded: 2, spina: false }),
  oval: (rnd) => buildOvalPlaza(rnd, 45, 40),
  district: (rnd) => buildDistrict(rnd, { nx: 6, nz: 6, cell: 38, street: 7, buried: 0.25 }),
};
