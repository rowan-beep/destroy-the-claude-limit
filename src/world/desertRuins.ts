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

/** Sandstone: warm ochre / honey / pinkish cream, block to block +-8%, a few darker or redder. */
function stoneCol(rnd: Rnd): RGB {
  const v = rnd();
  let r = 0.8, g = 0.64, b = 0.45;
  if (v < 0.07) { r *= 0.9; g *= 0.8; b *= 0.74; }
  else if (v < 0.2) { r = 0.88; g = 0.74; b = 0.58; }
  const k = 0.94 + 0.12 * rnd();
  return srgb(clamp(r * k * (0.985 + 0.03 * rnd())), clamp(g * k), clamp(b * k * (0.97 + 0.06 * rnd())));
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
    (globalThis as any).__tb = performance.now();
    const n = this.kind.length;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      const c: RGB = [this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]];
      let o: RGB = c;
      const k = this.kind[i];
      if (k === KIND_STONE) o = shadeStone(c, x, y, z, this.nor[i * 3], this.nor[i * 3 + 1]);
      else if (k === KIND_SAND) o = mulC(SAND, 1 + (vnoise(x * 0.23, 0.5, z * 0.23) - 0.5) * 0.06);
      else if (k === KIND_METAL) o = shadeMetal(c, x, y, z, this.nor[i * 3 + 1], this.dust);
      col[i * 3] = o[0]; col[i * 3 + 1] = o[1]; col[i * 3 + 2] = o[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (globalThis as any).__ts = ((globalThis as any).__ts || 0) + performance.now() - (globalThis as any).__tb;
    return g;
  }
}

function shadeStone(c: RGB, x: number, y: number, z: number, nx: number, ny: number): RGB {
  const patch = vnoise(x * 0.6, y * 0.8, z * 0.6);
  const band = vnoise(x * 0.25, y * 2.6, z * 0.25);
  const grain = hash3(x * 7.3, y * 5.1, z * 6.7);
  let k = (0.9 + 0.2 * patch) * (0.92 + 0.12 * band) * (0.965 + 0.07 * grain);
  k *= 0.56 + 0.44 * sstep(-0.4, 2.6, y); // ambient occlusion / staining toward the sand
  if (ny < -0.2) k *= 0.78;
  let o = mulC(c, k);
  // weathered, reddish-brown stain low down
  o = mixC(o, mulC(srgb(0.5, 0.32, 0.22), 0.8), 0.22 * (1 - sstep(0, 1.6, y)));
  // sand-blasted, paler windward (-x) faces
  const wind = clamp(-nx * 1.1);
  if (wind > 0) o = mixC(mulC(o, 1.08), mulC(c, 1.25), wind * 0.3);
  // dust settled on upward faces
  const up = clamp(ny);
  if (up > 0) o = mixC(o, mulC(SAND, 0.98), up * (0.3 + 0.3 * patch));
  return o;
}

function shadeMetal(c: RGB, x: number, y: number, z: number, ny: number, dust: number): RGB {
  const grain = hash3(x * 5.3, y * 4.1, z * 5.7);
  let o = mulC(c, 0.96 + 0.08 * grain);
  const up = clamp(ny);
  if (up > 0) o = mixC(o, mulC(SAND, 0.9), up * dust * (0.5 + 0.5 * vnoise(x * 0.5, y * 0.5, z * 0.5)));
  o = mulC(o, 0.78 + 0.22 * sstep(-0.3, 0.8, y));
  return o;
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
function chunk(m: Mesh, rnd: Rnd, x: number, z: number, s: number, col?: RGB, sink = 0.45) {
  const sx = s * rr(rnd, 0.7, 1.5), sy = s * rr(rnd, 0.4, 1), sz = s * rr(rnd, 0.7, 1.4);
  placed(m, x, sy * (0.5 - sink * rnd() - 0.2), z, rr(rnd, -0.5, 0.5), rnd() * 6.28, rr(rnd, -0.5, 0.5), () => {
    block(m, rnd, 0, -sy / 2, 0, sx, sy, sz, 0, { col: col ?? stoneCol(rnd), jit: s * 0.14, bev: s * 0.1, chip: s * 0.15 });
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
interface DriftOpt { x: number; z: number; a: number; b: number; h: number; rot?: number; tail?: number; seg?: number }

/** A smooth sand mound: zero slope at its rim, rim at y = -0.04, long gentle windward (-x) tail. */
function drift(m: Mesh, d: DriftOpt) {
  const rot = d.rot ?? 0, cs = Math.cos(rot), sn = Math.sin(rot), tail = d.tail ?? 1.6;
  const H = (px: number, pz: number) => {
    const dx = px - d.x, dz = pz - d.z;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const aa = lx < 0 ? d.a * tail : d.a;
    const q = Math.hypot(lx / aa, lz / d.b);
    if (q >= 1) return -0.04;
    const f = 1 - q * q;
    return d.h * f * f - 0.04;
  };
  const S = d.seg ?? (Math.max(d.a, d.b) > 6 ? 16 : 10);
  const Q = [0.4, 0.74, 1];
  const grid: V[][] = [];
  const nrm: V[][] = [];
  const at = (q: number, j: number): V => {
    const th = (j / S) * Math.PI * 2;
    const ct = Math.cos(th), st = Math.sin(th);
    const lx = q * (ct < 0 ? d.a * tail : d.a) * ct, lz = q * d.b * st;
    const px = d.x + lx * cs + lz * sn, pz = d.z - lx * sn + lz * cs;
    return [px, H(px, pz), pz];
  };
  const N = (p: V): V => {
    const e = 0.08;
    const hx = (H(p[0] + e, p[2]) - H(p[0] - e, p[2])) / (2 * e), hz = (H(p[0], p[2] + e) - H(p[0], p[2] - e)) / (2 * e);
    const l = Math.hypot(hx, 1, hz);
    return [-hx / l, 1 / l, -hz / l];
  };
  const centre: V = [d.x, H(d.x, d.z), d.z];
  grid.push([centre]);
  nrm.push([N(centre)]);
  for (const q of Q) {
    const row: V[] = [], nr: V[] = [];
    for (let j = 0; j < S; j++) { const p = at(q, j); row.push(p); nr.push(N(p)); }
    grid.push(row); nrm.push(nr);
  }
  const white: RGB = SAND;
  for (let j = 0; j < S; j++) {
    const j2 = (j + 1) % S;
    m.tri(centre, grid[1][j], grid[1][j2], white, KIND_SAND, [nrm[0][0], nrm[1][j], nrm[1][j2]]);
  }
  for (let i = 1; i < grid.length - 1; i++) {
    for (let j = 0; j < S; j++) {
      const j2 = (j + 1) % S;
      m.tri(grid[i][j], grid[i + 1][j], grid[i][j2], white, KIND_SAND, [nrm[i][j], nrm[i + 1][j], nrm[i][j2]]);
      m.tri(grid[i][j2], grid[i + 1][j], grid[i + 1][j2], white, KIND_SAND, [nrm[i][j2], nrm[i + 1][j], nrm[i + 1][j2]]);
    }
  }
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
        let top = y1, present = y < T - 0.1 && !(o.hole && o.hole(xc, ym));
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
        col: b.col, bev: covered ? 0 : Math.min(0.1, hh * 0.3), jit: 0.024, skip, capTop: !covered, chip: covered ? 0 : 0.09,
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
  loft(m, rings, (i) => (i === 0 ? mulC(c, 0.9) : c), { capTop: !!o.cap || !!o.broken, topLift: o.broken ? -0.05 * o.r1 : 0 });
}

function capital(m: Mesh, rnd: Rnd, x: number, y: number, z: number, r: number, col: RGB, rot = 0): number {
  const segs = 12;
  const spec: [number, number, boolean][] = [[1.0, 0, false], [1.12, 0.12, false], [1.12, 0.2, false], [0.94, 0.3, false], [1.0, 0.55, true], [1.28, 1.1, true], [1.5, 1.55, true], [1.5, 1.68, false]];
  const rings = spec.map(([rad, hy, leaf]) => {
    const p: V[] = [];
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2 + rot;
      const k = leaf ? (j % 2 ? 1 : 1.2) * (1 + (rnd() - 0.5) * 0.05) : 1;
      p.push([x + Math.cos(th) * r * rad * k, y + hy * r, z + Math.sin(th) * r * rad * k]);
    }
    return p;
  });
  loft(m, rings, (i) => (i < 3 ? mulC(col, 0.95) : col), {});
  block(m, rnd, x, y + 1.68 * r, z, r * 3.3, r * 0.42, r * 3.3, rot, { col, bev: r * 0.06, jit: r * 0.02, chip: 0.04 });
  return y + 2.1 * r;
}

interface ColOpt {
  x: number; z: number; y0: number; r: number; h: number;
  cap?: boolean; brk?: number; base?: boolean; tint?: RGB; lean?: number; leanDir?: number;
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
      const rings: V[][] = [[1.28, 0.5], [1.32, 0.62], [1.2, 0.76], [1.02, 0.9]].map(([rad, hy]) => {
        const p: V[] = [];
        for (let j = 0; j < 12; j++) { const th = (j / 12) * 6.283; p.push([o.x + Math.cos(th) * r * rad, y + hy * r, o.z + Math.sin(th) * r * rad]); }
        return p;
      });
      loft(m, rings, mulC(col, 0.95), {});
    }
    y += 0.9 * r;
  }
  const total = o.brk ?? o.h;
  const nd = Math.max(2, Math.round(o.h / 1.45));
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
      ox: o.x + ox, oz: o.z + oz, broken: last && o.brk !== undefined ? r * 0.8 : 0, cap: last && !o.cap,
    });
  }
  if (o.cap && o.brk === undefined) return capital(m, rnd, o.x + ox, yy, o.z + oz, r, col);
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

// ---------------------------------------------------------------- the ruins
export type RuinKind = 'colonnade' | 'temple' | 'arch' | 'wall' | 'tomb' | 'column' | 'statue' | 'gate' | 'houses' | 'well' | 'obelisk' | 'theatre';
export const RUIN_KINDS: RuinKind[] = ['colonnade', 'temple', 'arch', 'wall', 'tomb', 'column', 'statue', 'gate', 'houses', 'well', 'obelisk', 'theatre'];

const RADII: Record<RuinKind, number> = {
  colonnade: 24, temple: 27, arch: 15, wall: 40, tomb: 13, column: 8, statue: 13, gate: 27, houses: 28, well: 9, obelisk: 15, theatre: 30,
};

function colonnade(m: Mesh, rnd: Rnd) {
  const N = 7, S = 4.4, rows = [-5.2, 5.2], r = 0.62;
  const x0 = -((N - 1) * S) / 2;
  const seed = rnd() * 50;
  for (const row of rows) {
    // low stylobate, mostly buried
    m.push(new THREE.Matrix4().makeTranslation(x0 - 2, 0, row));
    wall(m, rnd, { L: (N - 1) * S + 4, t: 2.3, depth: -1.4, ch: [0.4, 0.55], bl: [1.2, 2], top: (u) => -0.1 + 0.95 * vnoise(u * 0.3, row, seed) });
    m.pop();
  }
  type St = 'full' | 'broken' | 'stump' | 'gone';
  const state: St[][] = [[], []];
  const tops: (number | null)[][] = [[], []];
  rows.forEach((row, ri) => {
    for (let i = 0; i < N; i++) {
      const v = rnd();
      const st: St = v < 0.42 ? 'full' : v < 0.77 ? 'broken' : v < 0.9 ? 'stump' : 'gone';
      state[ri].push(st);
      const x = x0 + i * S + rr(rnd, -0.1, 0.1);
      const y0 = -rr(rnd, 0.8, 3.2);
      const o: ColOpt = { x, z: row + rr(rnd, -0.05, 0.05), y0, r, h: 6.2, cap: false };
      let top: number | null = null;
      const lean = rr(rnd, -0.04, 0.04);
      if (st === 'full') top = column(m, rnd, { ...o, cap: true, lean, leanDir: rnd() * 6.28 });
      else if (st === 'broken') column(m, rnd, { ...o, brk: rr(rnd, 3, 5.2), lean, leanDir: rnd() * 6.28 });
      else if (st === 'stump') column(m, rnd, { ...o, y0: -rr(rnd, 3, 4.4), brk: rr(rnd, 1.6, 2.6) });
      tops[ri].push(top);
      if (st !== 'full') {
        // the fallen shaft: drums strewn in a line
        const dir = rnd() * 6.28, nD = st === 'gone' ? 3 : 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < nD; k++) {
          const dd = 1.9 + k * rr(rnd, 1.5, 1.9);
          fallenDrum(m, rnd, x + Math.cos(dir) * dd, row + Math.sin(dir) * dd, r * 0.92, rr(rnd, 1.1, 1.6), dir + rr(rnd, -0.25, 0.25), undefined, rr(rnd, 0.3, 0.6), rnd() < 0.3);
        }
        if (rnd() < 0.35) {
          placed(m, x + Math.cos(dir) * 8, 0.1, row + Math.sin(dir) * 8, 0, dir, Math.PI / 2, () => { capital(m, rnd, 0, -0.5, 0, r, stoneCol(rnd)); });
        }
      }
      if (st !== 'gone') drift(m, { x: x - 0.4, z: row + rr(rnd, -0.2, 0.2), a: rr(rnd, 2.2, 3.2), b: rr(rnd, 1.4, 2), h: rr(rnd, 0.9, 1.9) });
    }
    for (let i = 0; i < N - 1; i++) {
      const a = tops[ri][i], b = tops[ri][i + 1];
      if (a !== null && b !== null) {
        const ya = Math.min(a, b);
        const x = x0 + (i + 0.5) * S;
        block(m, rnd, x, ya, rows[ri], S - 0.15, 1.0, 1.5, 0, { bev: 0.06, jit: 0.02, chip: 0.1 });
        if (rnd() < 0.55) block(m, rnd, x + rr(rnd, -0.1, 0.1), ya + 1.0, rows[ri], S - 0.4, 0.8, 1.2, 0, { bev: 0.06, jit: 0.02, chip: 0.2 });
      }
    }
  });
  // a toppled architrave and a few street slabs
  placed(m, x0 + 2 * S + 3, 0.2, 0.5, 0.1, 0.5, 0.12, () => block(m, rnd, 0, -0.5, 0, 4.2, 1.0, 1.4, 0, { bev: 0.06, jit: 0.03, chip: 0.12 }));
  for (let i = 0; i < 9; i++) {
    const x = x0 + rr(rnd, 0, (N - 1) * S), z = rr(rnd, -2.8, 2.8);
    block(m, rnd, x, -0.4, z, rr(rnd, 1.4, 2.4), rr(rnd, 0.45, 0.55), rr(rnd, 1.2, 1.8), rr(rnd, -0.3, 0.3), { bev: 0.04, jit: 0.03, chip: 0.06 });
  }
  rubble(m, rnd, 0, 0, 20, 20, 0.3, 0.9);
  // sand: a long ramp at the windward end, drifts filling the street
  drift(m, { x: x0 - 3, z: 0, a: 6, b: 8, h: 1.7 });
  drift(m, { x: x0 + 2.5 * S, z: 0.5, a: 7, b: 3.2, h: 1.1, rot: 0.1 });
  drift(m, { x: x0 + 5.5 * S, z: -0.5, a: 6, b: 3.6, h: 1.6 });
  drift(m, { x: 0, z: 11, a: 9, b: 4, h: 1.3 });
  drift(m, { x: 3, z: -11, a: 10, b: 4, h: 1.2 });
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
  const podH = rr(rnd, 0.8, 1.3);
  const seed = rnd() * 40;
  const corner = (k: number, u: number, L: number) => (k === 0 ? L - u : k === 1 ? u : 99); // distance to the collapsed (+x,+z) corner
  // podium ring
  tower(m, rnd, {
    cx: 0, cz: 0, rot: 0, w: 32, d: 19, t: 1.6, depth: -2.2, ch: [0.5, 0.7], bl: [1.2, 2],
    top: (k, u) => {
      const L = k % 2 === 0 ? 32 : 19 - 3.2;
      const c = corner(k, u, L);
      return podH * (0.55 + 0.5 * vnoise(u * 0.3, k, seed)) * (0.15 + 0.85 * sstep(1, 8, c));
    },
  });
  // floor slabs
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    const x = -13.3 + i * 5.3, z = -6.1 + j * 6.1;
    if ((x > 7 && z > 1) || rnd() < 0.12) continue;
    block(m, rnd, x, podH - 0.45, z, 5.2, 0.45, 6, 0, { bev: 0.05, jit: 0.04, chip: 0.1 });
  }
  // cella: 18 x 10, front (-x) wall with a doorway
  const hf = (k: number, u: number) => {
    const L = k % 2 === 0 ? 18 : 10 - 2.2;
    const c = corner(k, u, L) * 0.0 + (k === 0 ? L - u : k === 1 ? u : 99);
    const base = 4.6 + 2.2 * vnoise(u * 0.4, k + 2, seed) - (k === 3 ? 0.5 : 0);
    return podH + base * (0.1 + 0.9 * sstep(1.5, 7, c));
  };
  tower(m, rnd, {
    cx: 3, cz: 0, rot: 0, w: 18, d: 10, t: 1.1, depth: podH - 0.2, ch: [0.5, 0.7], bl: [1, 1.8], top: hf,
    hole: (k, u, y) => k === 3 && Math.abs(u - (10 - 2.2) / 2) < 1.5 && y < podH + 4.3,
  });
  // portico columns
  const state = (): 'full' | 'broken' | 'stump' => { const v = rnd(); return v < 0.35 ? 'full' : v < 0.75 ? 'broken' : 'stump'; };
  const rowsX = [-13.2, -9.6];
  const tops: (number | null)[][] = [[], []];
  rowsX.forEach((x, ri) => {
    for (let j = 0; j < 4; j++) {
      const z = -6.3 + j * 4.2, st = state();
      const o: ColOpt = { x, z, y0: podH - rr(rnd, 0, 0.2), r: 0.72, h: 6.4 };
      if (st === 'full') tops[ri].push(column(m, rnd, { ...o, cap: true }));
      else {
        tops[ri].push(null);
        column(m, rnd, { ...o, brk: st === 'broken' ? rr(rnd, 2.5, 5) : rr(rnd, 0.6, 1.4) });
        const dir = Math.PI + rr(rnd, -0.9, 0.9);
        for (let k = 0; k < 2; k++) fallenDrum(m, rnd, x + Math.cos(dir) * (2 + k * 1.8) - 3, z + Math.sin(dir) * (2 + k * 1.8), 0.66, 1.5, dir, undefined, 0.35);
      }
    }
    for (let j = 0; j < 3; j++) {
      const a = tops[ri][j], b = tops[ri][j + 1];
      if (a !== null && b !== null) block(m, rnd, x, Math.min(a, b), -6.3 + (j + 0.5) * 4.2, 1.5, 1.0, 4.0, 0, { bev: 0.06, jit: 0.02, chip: 0.1 });
    }
  });
  // pediment pieces and cornice blocks in the sand
  for (let i = 0; i < 3; i++) {
    placed(m, -20 + i * 3, 0.1, -9 + i * 7, 0.15, rnd() * 3, rr(rnd, -0.2, 0.2), () => {
      const hw = rr(rnd, 1.6, 2.4), hh = rr(rnd, 0.8, 1.2), c = stoneCol(rnd);
      const A: V[] = [[-hw, -0.4, -0.6], [hw, -0.4, -0.6], [0, hh - 0.4, -0.6]];
      loft(m, [A, A.map((p): V => [p[0], p[1], 0.6])], c, { capTop: true, capBot: true });
    });
  }
  for (let i = 0; i < 6; i++) placed(m, rr(rnd, -22, 22), 0.1, rr(rnd, -12, 12), rr(rnd, -0.2, 0.2), rnd() * 3, rr(rnd, -0.2, 0.2), () => block(m, rnd, 0, -0.6, 0, rr(rnd, 1.6, 3), 0.9, 1.2, 0, { bev: 0.06, jit: 0.04, chip: 0.1 }));
  rubble(m, rnd, 11, 7, 7, 26, 0.4, 1.5);
  rubble(m, rnd, 0, 0, 25, 14, 0.3, 0.8);
  // sand: banked into the portico, filling the cella
  drift(m, { x: -19, z: 0, a: 11, b: 10, h: 2.3 });
  drift(m, { x: -12.5, z: 5, a: 4, b: 4, h: 2.2 });
  drift(m, { x: 3, z: 0, a: 6.5, b: 3.4, h: 3.8 });
  drift(m, { x: 12, z: 6, a: 7, b: 5, h: 2.6 });
  drift(m, { x: -4, z: -13, a: 12, b: 4, h: 1.5 });
  drift(m, { x: 7, z: -12, a: 9, b: 4, h: 1.2 });
  drift(m, { x: -1, z: 13, a: 11, b: 4, h: 1.3 });
}

function archKind(m: Mesh, rnd: Rnd) {
  const span = 6.4, pw = 3.8, pd = 4.6, spring = 5.6;
  const seed = rnd() * 30;
  const eroded = rnd() < 0.5 ? 1 : -1; // which pier is worn down
  for (const sgn of [-1, 1]) {
    const worn = sgn === eroded;
    const cx = sgn * (span / 2 + pw / 2);
    const hp = (k: number, u: number) => {
      const base = worn ? 4.6 : 7.0;
      return base * (0.8 + 0.4 * vnoise(u * 0.4, k + 2 * sgn, seed)) - (worn ? sstep(0, 3, u) * 0.0 : 0);
    };
    tower(m, rnd, { cx, cz: 0, rot: 0, w: pw, d: pd, t: 1.25, depth: -3.2, ch: [0.5, 0.7], bl: [0.9, 1.5], top: hp });
    // solid core so the broken tops are not hollow
    const topY = (worn ? 3.4 : 6.0);
    block(m, rnd, cx, -0.8, 0, pw - 2.0, topY + 0.8, pd - 2.0, 0, { col: srgb(0.66, 0.52, 0.38), bev: 0.2, jit: 0.15, chip: 0.5 });
    // engaged half-columns on the front corners
    for (const zz of [-1, 1]) {
      if (!worn || rnd() < 0.3) column(m, rnd, { x: cx - sgn * 0.0, z: zz * (pd / 2 + 0.55), y0: -rr(rnd, 2.2, 3.4), r: 0.5, h: 5.2, cap: !worn, brk: worn ? rr(rnd, 1.6, 3) : undefined });
    }
  }
  // vault of voussoirs, one side eroded
  arch(m, rnd, {
    span, spring, t: 1.0, depth: pd - 0.3, n: 13,
    missing: (i, n) => (eroded === -1 ? i < n * 0.45 && i !== 0 && rnd() < 0.8 : i > n * 0.55 && i !== n - 1 && rnd() < 0.8) || (i > 2 && i < n - 3 && rnd() < 0.07),
  });
  // attic above the vault
  const aLen = span + 2 * pw;
  m.push(new THREE.Matrix4().makeTranslation(-aLen / 2, spring + span / 2 + 0.8, 0));
  wall(m, rnd, { L: aLen, t: pd - 0.6, depth: 0, ch: [0.5, 0.7], bl: [1, 1.6], top: (u) => 2.6 * (eroded === -1 ? 1 - sstep(0.3, 0.9, u / aLen) * 0.85 : sstep(0.1, 0.7, u / aLen) * 0.85 + 0.15) + 0.4 * Math.sin(u) * 0 });
  m.pop();
  // fallen voussoirs, blocks, drums
  for (let i = 0; i < 5; i++) {
    const side = rnd() < 0.7 ? eroded : -eroded;
    placed(m, side * rr(rnd, 5, 12) + rr(rnd, -2, 2), 0.15, rr(rnd, -6, 6), rr(rnd, -0.3, 0.3), rnd() * 3, rr(rnd, -0.4, 0.4), () => block(m, rnd, 0, -0.5, 0, rr(rnd, 1.2, 2.6), rr(rnd, 0.8, 1.2), 1.2, 0, { bev: 0.07, jit: 0.05, chip: 0.2 }));
  }
  rubble(m, rnd, eroded * 8, 0, 8, 20, 0.35, 1.3);
  rubble(m, rnd, 0, 0, 13, 10, 0.3, 0.7);
  // sand fills the passage and banks on the windward piers
  drift(m, { x: 0, z: 0, a: 3.2, b: 6.5, h: 3.4 });
  drift(m, { x: -span / 2 - pw + 0.5, z: 0, a: 5.5, b: 6.5, h: 3.0 });
  drift(m, { x: span / 2 + pw, z: 2, a: 3.5, b: 5, h: 1.3 });
  drift(m, { x: -4, z: 9, a: 8, b: 3.5, h: 1.1 });
}

function wallKind(m: Mesh, rnd: Rnd) {
  const L = 70, seed = rnd() * 60, breachU = rr(rnd, 34, 44), t = 2.6;
  // the curtain wall runs along z; its outer (windward) face looks to -x
  m.push(new THREE.Matrix4().makeTranslation(0, 0, -L / 2).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0)));
  wall(m, rnd, {
    L, t, depth: -2.6, ch: [0.55, 0.8], bl: [1.2, 2.2],
    top: (u) => {
      const breach = sstep(0, 5.5, Math.abs(u - breachU));
      const base = 4.6 * (0.7 + 0.5 * vnoise(u * 0.18, 1, seed)) - 1.4 * sstep(0.55, 0.9, vnoise(u * 0.09, 7, seed));
      return Math.max(-0.5, base * (0.08 + 0.92 * breach));
    },
    hole: (u, y) => Math.abs(u - 18) < 1.1 && y < 3.2 && y > 0.8, // a postern gap
  });
  m.pop();
  // tower stumps projecting to the windward side
  const tw = (uz: number, ww: number, h: number, bust: boolean) => {
    tower(m, rnd, {
      cx: -t / 2 - ww / 2 + 1.2, cz: uz, rot: 0, w: ww, d: ww + 1, t: 1.4, depth: -3, ch: [0.55, 0.8], bl: [1, 1.7],
      top: (k, u) => h * (0.7 + 0.4 * vnoise(u * 0.5, k + uz, seed)) * (bust && k === 3 ? 0.55 : 1),
      hole: (k, u, y) => k === 3 && Math.abs(u - (ww + 1 - 2.8) / 2) < 0.35 && y > 2.2 && y < 3.8 && !bust,
    });
    block(m, rnd, -t / 2 - ww / 2 + 1.2, -0.8, uz, ww - 2.2, h * 0.6, ww - 1.6, 0, { col: srgb(0.66, 0.52, 0.38), bev: 0.2, jit: 0.2, chip: 0.5 });
  };
  tw(-20, 8, 8, false);
  tw(24, 6.5, 5.5, true);
  rubble(m, rnd, -3, breachU - 35, 9, 40, 0.4, 1.6);
  rubble(m, rnd, 4, breachU - 35, 7, 16, 0.4, 1.2);
  for (let i = 0; i < 6; i++) placed(m, rr(rnd, -8, 6), 0.15, rr(rnd, -33, 33), rr(rnd, -0.3, 0.3), rnd() * 3, rr(rnd, -0.3, 0.3), () => block(m, rnd, 0, -0.5, 0, rr(rnd, 1.4, 2.6), 0.8, 1.2, 0, { bev: 0.06, jit: 0.05, chip: 0.2 }));
  // windward ramp drifts along the base, a bank in the breach, shorter lee drifts
  for (let z = -30; z <= 30; z += 12) drift(m, { x: -2.6, z: z + rr(rnd, -2, 2), a: 4.5, b: 8, h: rr(rnd, 1.4, 2.4) });
  drift(m, { x: 0, z: breachU - 35, a: 7, b: 6, h: 1.8 });
  drift(m, { x: 2.4, z: -12, a: 4, b: 9, h: 1.1 });
  drift(m, { x: 2.4, z: 20, a: 3.5, b: 8, h: 1.4 });
  drift(m, { x: -9, z: -20, a: 5, b: 6, h: 2.0 });
}

function tomb(m: Mesh, rnd: Rnd) {
  const seed = rnd() * 30;
  const w0 = 7.4;
  // stepped base (mostly buried)
  for (let i = 0; i < 3; i++) {
    const wd = w0 + 5 - i * 1.7;
    tower(m, rnd, { cx: 0, cz: 0, rot: 0, w: wd, d: wd, t: 1.2, depth: -3.5, ch: [0.45, 0.55], bl: [1.2, 1.8], top: () => 0.7 - i * 0.55 + 0.0 });
  }
  const breakAt = rr(rnd, 8.5, 11);
  tower(m, rnd, {
    cx: 0, cz: 0, rot: 0, w: w0, d: w0, t: 1.15, depth: -3.2, ch: [0.5, 0.65], bl: [0.9, 1.5],
    inset: (y) => (y < 0 ? 0 : y * 0.028) - (Math.abs(((y + 100) % 6.2) - 3.1) > 3.0 ? 0.28 : 0) - (Math.abs(((y + 100) % 6.2) - 0.0) < 0.5 ? 0.0 : 0),
    top: (k, u) => breakAt * (0.78 + 0.35 * vnoise(u * 0.45, k + 1, seed)) * (k === 1 ? 0.8 : 1) - (k === 3 ? 1.0 : 0),
    hole: (k, u, y) => (k === 3 && Math.abs(u - w0 / 2) < 0.9 && y > 0.1 && y < 3.0) || (k !== 3 && Math.abs(u - w0 / 2) < 0.4 && y > 4.4 && y < 6.0),
  });
  // cornice at storey height
  tower(m, rnd, { cx: 0, cz: 0, rot: 0, w: w0 - 0.3, d: w0 - 0.3, t: 1.6, depth: 5.55, ch: [0.4, 0.45], bl: [1.2, 1.6], top: (k, u) => (k === 2 ? 6.3 + 0 * u : 6.3) });
  rubble(m, rnd, 0, 0, 11, 30, 0.35, 1.5);
  rubble(m, rnd, 3, 3, 6, 14, 0.8, 1.8);
  for (let i = 0; i < 4; i++) placed(m, rr(rnd, -8, 8), 0.2, rr(rnd, -8, 8), rr(rnd, -0.3, 0.3), rnd() * 3, rr(rnd, -0.3, 0.3), () => block(m, rnd, 0, -0.6, 0, rr(rnd, 1.6, 2.4), 1, 1.4, 0, { bev: 0.07, jit: 0.05, chip: 0.2 }));
  drift(m, { x: -4.5, z: 0, a: 5.5, b: 7, h: 3.0 });
  drift(m, { x: 0, z: 0, a: 3, b: 3, h: 3.4 });
  drift(m, { x: 4, z: -3, a: 5, b: 3.5, h: 1.2 });
  drift(m, { x: 2, z: 6.5, a: 6, b: 3, h: 1.4 });
}

function statue(m: Mesh, rnd: Rnd) {
  const col = stoneCol(rnd);
  // colossal head, lying on its side (face toward -x/-z, one cheek buried)
  const U = 32, Vn = 24;
  const noseBroken = rnd() < 0.7, earBroken = rnd() < 0.5;
  const gauss = (x: number, s: number) => Math.exp(-(x * x) / (2 * s * s));
  const head = (ang: number, lat: number): V => {
    const sv = Math.sin(lat), cvv = Math.cos(lat);
    const ux = sv * Math.sin(ang), uz = sv * Math.cos(ang), uy = cvv;
    let rad = 1;
    const front = sstep(-0.1, 0.55, uz);
    const g2 = (cx: number, cy: number, sx: number, sy: number) => gauss(ux - cx, sx) * gauss(uy - cy, sy);
    rad += 0.5 * (noseBroken ? 0.3 : 1) * g2(0, -0.12, 0.14, 0.24) * front; // nose
    rad += 0.16 * g2(0, 0.27, 0.6, 0.1) * front; // brow
    rad -= 0.17 * (g2(0.36, 0.14, 0.14, 0.1) + g2(-0.36, 0.14, 0.14, 0.1)) * front; // eye sockets
    rad += 0.13 * g2(0, -0.5, 0.3, 0.08) * front; // lips
    rad -= 0.08 * g2(0, -0.6, 0.25, 0.04) * front;
    rad += 0.13 * g2(0, -0.82, 0.2, 0.14) * front; // chin
    rad += 0.08 * (g2(0.55, -0.2, 0.2, 0.22) + g2(-0.55, -0.2, 0.2, 0.22)) * front; // cheeks
    if (!(earBroken && ux > 0)) rad += 0.3 * (g2(0.98, 0, 0.18, 0.24) + g2(-0.98, 0, 0.18, 0.24)) * gauss(uz, 0.4);
    if (uy > 0.45) rad *= 1.06; // headcloth
    rad += 0.03 * (vnoise(ux * 3, uy * 3, uz * 3) - 0.5) * 2;
    let y = uy * 2.2 * rad;
    if (uy < -0.9) y = -2.0 + (rnd() - 0.5) * 0.15; // broken at the neck
    return [ux * 1.45 * rad, y, uz * 1.7 * rad];
  };
  const rings: V[][] = [];
  for (let i = 0; i <= Vn; i++) {
    const lat = 0.02 + (i / Vn) * (Math.PI * 0.86 - 0.02);
    const r: V[] = [];
    for (let j = 0; j < U; j++) r.push(head((j / U) * Math.PI * 2, lat));
    rings.push(r);
  }
  const hc = col;
  const DBG = typeof location !== 'undefined' && location.search.includes('dbg=head');
  placed(m, DBG ? 0 : -3.5, DBG ? 3.5 : 1.7, DBG ? 0 : 0.5, DBG ? 0 : -1.2, DBG ? 0 : 2.4, DBG ? 0 : 0.15, () => {
    m.push(new THREE.Matrix4().makeScale(1.7, 1.7, 1.7));
    loft(m, rings, hc, { capTop: false });
    loft(m, [rings[rings.length - 1]], hc, { capTop: true, topLift: -0.1 });
    m.pop();
  });
  // torso: tapered, jagged, lying on its back, buried
  const tcol = mixC(col, stoneCol(rnd), 0.3);
  placed(m, 8, 0.5, -1, 0.2, 0.9, Math.PI / 2 - 0.2, () => {
    const rg: V[][] = [];
    const prof: [number, number, number][] = [[0, 2.2, 1.3], [1.5, 2.5, 1.45], [3.0, 2.9, 1.5], [4.4, 3.3, 1.3], [5.0, 2.9, 1.0]];
    prof.forEach(([y, hw, hd], i) => {
      const r: V[] = [];
      for (let j = 0; j < 12; j++) {
        const th = (j / 12) * 6.283;
        const ex = Math.sign(Math.cos(th)) * Math.pow(Math.abs(Math.cos(th)), 0.6), ez = Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), 0.6);
        r.push([ex * hw, y + (i === prof.length - 1 ? (rnd() - 0.3) * 0.5 : 0) + (i === 0 ? (rnd() - 0.5) * 0.4 : 0), ez * hd]);
      }
      rg.push(r);
    });
    loft(m, rg, tcol, { capTop: true, capBot: true });
  });
  // broken arm and a fist
  placed(m, 13.5, 0.5, 3.8, 0.1, 2.2, Math.PI / 2 + 0.05, () => {
    drum(m, rnd, { r0: 0.8, r1: 0.7, y0: -3, y1: 2.4, col: tcol, segs: 9, cap: true, flute: 0.0 });
    block(m, rnd, 0, 2.4, 0, 1.5, 1.3, 1.4, 0.3, { col: tcol, bev: 0.15, jit: 0.1 });
  });
  // sandalled foot on a slab
  block(m, rnd, -8, -0.4, -6.5, 4.5, 0.9, 2.2, 0.5, { col, bev: 0.12, jit: 0.1, chip: 0.2 });
  block(m, rnd, -7.4, 0.3, -6.3, 2.8, 0.8, 1.2, 0.5, { col, bev: 0.15, jit: 0.09, chip: 0.2 });
  rubble(m, rnd, 3, 0, 12, 22, 0.3, 1.1, col);
  drift(m, { x: -6.6, z: 1.5, a: 4, b: 4.8, h: 2.0 });
  drift(m, { x: 5.2, z: -0.5, a: 3.6, b: 4, h: 1.9 });
  drift(m, { x: 12, z: 2, a: 4.5, b: 3.4, h: 1.0 });
  drift(m, { x: -1, z: 6, a: 6, b: 3, h: 0.9 });
}

function gate(m: Mesh, rnd: Rnd) {
  const seed = rnd() * 30, span = 5.8;
  for (const sgn of [-1, 1]) {
    const worn = rnd() < 0.5;
    const cx = sgn * (span / 2 + 3.6);
    tower(m, rnd, {
      cx, cz: 0, rot: 0, w: 7.2, d: 9.5, t: 1.4, depth: -3.2, ch: [0.5, 0.7], bl: [1, 1.7],
      top: (k, u) => (worn ? 6.2 : 8.4) * (0.7 + 0.5 * vnoise(u * 0.4, k + sgn, seed)) * (k === 0 && sgn < 0 ? 0.7 : 1),
      hole: (k, u, y) => (k === 1 || k === 3) && Math.abs(u - (k % 2 === 0 ? 3.6 : 3.35)) < 0.3 && y > 3.4 && y < 5.2,
    });
    block(m, rnd, cx, -0.8, 0, 4.2, worn ? 4.6 : 6.4, 6.6, 0, { col: srgb(0.66, 0.52, 0.38), bev: 0.2, jit: 0.2, chip: 0.5 });
    // curtain walls running off to the sides
    m.push(new THREE.Matrix4().makeTranslation(cx + sgn * 3.6, 0, 0).multiply(new THREE.Matrix4().makeRotationY(sgn > 0 ? 0 : Math.PI)));
    wall(m, rnd, { L: 20, t: 2.2, depth: -2.4, ch: [0.5, 0.7], bl: [1.2, 2], top: (u) => 3.4 * (1 - sstep(2, 17, u)) * (0.6 + 0.6 * vnoise(u * 0.4, sgn, seed)) + 0.2 });
    m.pop();
  }
  arch(m, rnd, { span, spring: 4.4, t: 0.9, depth: 8.6, n: 11, missing: (i, n) => (i > n * 0.6 && rnd() < 0.6) || (i === 1 && rnd() < 0.4) });
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
  const seed = rnd() * 50;
  let id = 0;
  const rooms: [number, number, number, number, number][] = [];
  for (let gx = 0; gx < 3; gx++) for (let gz = 0; gz < 2; gz++) {
    if (rnd() < 0.12) continue;
    const w = rr(rnd, 5.5, 8), d = rr(rnd, 4.5, 7);
    rooms.push([(gx - 1) * 15 + rr(rnd, -2, 2), (gz - 0.5) * 13 + rr(rnd, -1.5, 1.5), w, d, rr(rnd, -0.2, 0.2)]);
  }
  for (const [cx, cz, w, d, rot] of rooms) {
    id++;
    const doorSide = Math.floor(rnd() * 4), doorU = rr(rnd, 1.5, 3.5);
    const sink = rr(rnd, 0, 1.2);
    tower(m, rnd, {
      cx, cz, rot, w, d, t: 0.6, depth: -2.0, ch: [0.32, 0.46], bl: [0.55, 1.1], miss: 0.05,
      top: (k, u) => 0.3 + (2.6 - sink) * Math.pow(vnoise(u * 0.5, k + id * 3, seed), 1.2) * (k === 3 ? 0.7 : 1),
      hole: (k, u, y) => (k === doorSide && Math.abs(u - doorU - 0.3) < 0.55 && y < 1.9) || (k !== doorSide && k % 2 === 1 && Math.abs(u - 2.4) < 0.4 && y > 1.0 && y < 1.7),
    });
    drift(m, { x: cx, z: cz, a: w * 0.42, b: d * 0.42, h: rr(rnd, 0.8, 1.9), rot });
    drift(m, { x: cx - w / 2, z: cz + rr(rnd, -1, 1), a: 3.2, b: d * 0.65, h: rr(rnd, 0.9, 1.5) });
    rubble(m, rnd, cx, cz, Math.max(w, d) * 0.8, 5, 0.25, 0.7);
  }
  // an alley wall, a lone pillar and some sill stones
  m.push(new THREE.Matrix4().makeTranslation(-20, 0, 0));
  wall(m, rnd, { L: 10, t: 0.7, depth: -1.5, ch: [0.32, 0.46], bl: [0.6, 1.1], top: (u) => 0.2 + 1.4 * vnoise(u * 0.4, 3, seed) });
  m.pop();
  column(m, rnd, { x: 4, z: 0.5, y0: -0.8, r: 0.35, h: 2.8, brk: rr(rnd, 1.3, 2), base: true });
  for (let i = 0; i < 8; i++) placed(m, rr(rnd, -22, 22), 0.1, rr(rnd, -13, 13), rr(rnd, -0.3, 0.3), rnd() * 3, rr(rnd, -0.3, 0.3), () => block(m, rnd, 0, -0.35, 0, rr(rnd, 0.8, 1.6), 0.5, 0.7, 0, { bev: 0.05, jit: 0.04, chip: 0.1 }));
  drift(m, { x: -22, z: 4, a: 8, b: 8, h: 1.4 });
  drift(m, { x: 0, z: 0, a: 7, b: 3, h: 0.8 });
  drift(m, { x: 12, z: -9, a: 6, b: 4, h: 1.1 });
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
  const seed = rnd() * 30;
  // cavea: stepped tiers of seats on a half-circle, the lower ones sunk, the open side toward -x
  const tiers = 7, R0 = 7;
  for (let t = 0; t < tiers; t++) {
    const R = R0 + t * 1.15, y0 = -2.2 + t * 0.62;
    const n = Math.round(R * 2.2);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.5 + ((i + 0.5) / n) * Math.PI * 1.0 - Math.PI * 0.0;
      const ax = a + Math.PI * 0.0;
      const th = ax - Math.PI / 2 + Math.PI; // spans +x half circle
      void th;
      const ang = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI + 0; // -90..90 deg, faces -x
      const x = Math.cos(ang) * R + 4, z = Math.sin(ang) * R;
      const hole = vnoise(ang * 4, t, seed);
      if (y0 + 0.7 < -0.15) continue;
      if (hole < 0.32 && t > 1 && rnd() < 0.8) continue;
      if (Math.abs(((i + 0.5) / n * 8) % 1 - 0.5) < 0.06 && t > 0) continue; // a gap: the stairway
      const arc = (Math.PI * R) / n;
      block(m, rnd, x, y0, z, 1.0, 0.62 + (rnd() < 0.3 ? 0.0 : 0), arc * 1.02 + 0.03, -ang + Math.PI / 2 + Math.PI / 2, { bev: 0.04, jit: 0.02, chip: 0.1, capTop: true });
    }
  }
  // stage wall fragment with niches and two standing columns
  m.push(new THREE.Matrix4().makeTranslation(-6, 0, -9));
  m.push(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
  wall(m, rnd, { L: 18, t: 1.4, depth: -1.5, ch: [0.5, 0.7], bl: [1, 1.8], top: (u) => 0.4 + 3.6 * vnoise(u * 0.25, 4, seed) * (u > 14 ? 0.3 : 1), hole: (u, y) => y > 1.0 && y < 3.2 && Math.abs(((u + 1.5) % 4.5) - 2.2) < 0.8 });
  m.pop(); m.pop();
  column(m, rnd, { x: -9, z: -7, y0: -1.4, r: 0.55, h: 5.2, cap: true });
  column(m, rnd, { x: -9, z: 2.5, y0: -1.8, r: 0.55, h: 5.2, brk: 3.1 });
  fallenDrum(m, rnd, -12, 6, 0.5, 1.3, 0.4);
  fallenDrum(m, rnd, -13.5, -3, 0.5, 1.3, 1.9);
  rubble(m, rnd, 0, 0, 22, 34, 0.3, 1.1);
  drift(m, { x: 0, z: 0, a: 7, b: 7, h: 2.2 });
  drift(m, { x: -14, z: 0, a: 8, b: 9, h: 1.7 });
  drift(m, { x: 12, z: -8, a: 7, b: 5, h: 1.8 });
  drift(m, { x: 14, z: 10, a: 6, b: 5, h: 1.6 });
}

/** A ruin, merged and vertex-coloured (linear RGB), y = 0 the sand surface; parts below it are buried. */
export function buildRuin(kind: RuinKind, rnd: Rnd): THREE.BufferGeometry {
  const m = new Mesh();
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
  }
  return m.geometry();
}

/** Footprint radius of a ruin (m), for spacing and the flat ground it needs. */
export function ruinRadius(kind: RuinKind): number {
  return RADII[kind];
}

// ---------------------------------------------------------------- crashed jets
const PAINT = srgb(0.55, 0.57, 0.58);
const SOOT = srgb(0.035, 0.032, 0.03);
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
    c = mixC(c, SOOT, clamp(s * 1.6 - 0.35));
  }
  return c;
}

function dish(m: Mesh, ring: V[], apex: V, col: RGB) {
  for (let j = 0; j < ring.length; j++) m.tri(apex, ring[j], ring[(j + 1) % ring.length], col, KIND_RAW);
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

interface PieceO { brkA: boolean; brkB: boolean; base: RGB; rust: number; burn: number; twin: boolean; cockpit?: boolean }
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
    let c = skin(o.base, sootT, o.rust, p[0], p[1], p[2]);
    c = mulC(c, Math.floor(x * 0.8) % 2 ? 0.97 : 1.03);
    return tint[i][j] > 0 ? mixC(c, DARKI, clamp(tint[i][j] * 1.3)) : c;
  };
  loft(m, rings, cf, { kind: KIND_METAL });
  const ends: [boolean, V[], number][] = [[o.brkA, rings[0], 1], [o.brkB, rings[nSt], -1]];
  for (const [b, ring, dir] of ends) {
    if (!b) continue;
    const ax = ring.reduce((a, p) => a + p[0], 0) / np;
    dish(m, ring, [ax + dir * (1.1 + rnd() * 0.8), 0, 0], DARKI);
    // two bulkhead frames just inside the break
    for (let f = 1; f <= 2; f++) {
      const sc = 0.93;
      const fx = ax + dir * (0.35 + f * 0.7);
      const r0: V[] = ring.map((p) => [fx, p[1] * sc, p[2] * sc]);
      const r1: V[] = ring.map((p) => [fx + dir * 0.1, p[1] * sc, p[2] * sc]);
      loft(m, [r0, r1], mulC(o.base, 0.35), { kind: KIND_METAL });
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
  if (o.tornRoot) dish(m, rings[0], [nm(rings[0]), 0, o.span * 0.2 + 0.3], DARKI);
  else loft(m, [rings[0]], o.base, { kind: KIND_METAL, capTop: true });
  if (o.sootTip > 0.3) dish(m, rings[NS - 1], [nm(rings[NS - 1]), 0, o.span - 0.5], DARKI);
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

function jetPanel(m: Mesh, rnd: Rnd, x: number, z: number, s: number, base: RGB, burn: number, rust: number) {
  const n = 5 + Math.floor(rnd() * 3);
  const bend = rr(rnd, -0.25, 0.25), bendAx = rnd() * 6.28;
  const pts: V[] = [];
  const ang0 = rnd() * 6.28;
  for (let j = 0; j < n; j++) {
    const a = ang0 + (j / n) * 6.283 + (rnd() - 0.5) * 0.5, r = s * rr(rnd, 0.45, 1) * (j % 2 ? 0.8 : 1);
    const px = Math.cos(a) * r * 1.3, pz = Math.sin(a) * r;
    pts.push([px, bend * (px * Math.cos(bendAx) + pz * Math.sin(bendAx)) * 0.5 + (rnd() - 0.5) * 0.04, pz]);
  }
  const big = rnd() < 0.5;
  const pc = (p: V, edge: boolean): RGB => {
    const k = edge ? rnd() * burn : 0;
    let c = skin(big ? base : rnd() < 0.3 ? BARE : base, k, rust, p[0] + x, p[1], p[2] + z);
    if (edge && rnd() < 0.4) c = mulC(c, 0.55);
    return c;
  };
  placed(m, x, rr(rnd, 0.0, 0.25), z, rr(rnd, -0.4, 0.4), rnd() * 6.28, rr(rnd, -0.4, 0.4), () => {
    const c: V = [0, 0, 0];
    for (let j = 0; j < n; j++) m.tri(c, pts[j], pts[(j + 1) % n], [pc(c, false), pc(pts[j], true), pc(pts[(j + 1) % n], true)], KIND_METAL);
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

/** A crash site: a jet broken up along a debris trail, merged and vertex-coloured, y = 0 the sand. */
export function buildCrashedJet(rnd: Rnd): THREE.BufferGeometry {
  const m = new Mesh();
  const twin = rnd() < 0.5;
  const age = rnd(), broke = rnd();
  const sg = rnd() < 0.5 ? 1 : -1;
  const phase = rnd() * 6.28;
  const burn = 0.3 + 0.6 * rnd() * (1 - age * 0.4);
  const rust = clamp(age * 1.1 - 0.15);
  const base = mixC(PAINT, SAND, age * 0.16);
  m.dust = 0.25 + 0.55 * age;
  const zc = (x: number) => 1.8 * Math.sin(x * 0.05 + phase) + 0.6 * Math.sin(x * 0.13 + phase * 2);
  const po: PieceO = { brkA: true, brkB: true, base, rust, burn, twin };
  const noseOn = rnd() < 0.5;

  // ---- forward fuselage with the cockpit, nosed into the sand
  const fx = 22 + rr(rnd, -3, 3);
  placed(m, fx, 2.3 - age * 0.3, zc(fx) + 0.3, 0.6 * sg + rr(rnd, -0.2, 0.2), 0.12 + rr(rnd, -0.2, 0.2), -rr(rnd, 0.28, 0.4), () => {
    fusePiece(m, rnd, 11.2, noseOn ? 17.3 : 15.4, { ...po, brkA: true, brkB: !noseOn, cockpit: true });
    const x0 = 11.2;
    // canopy bows (one snapped), seat and coaming
    const bow = (bx: number, frac: number) => {
      const pts: V[] = [];
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * (0.5 - frac * 0.5) + (k / 8) * Math.PI * frac, w = fusAt(bx)[1] * 0.78;
        pts.push([bx - x0 + (rnd() - 0.5) * 0.05, 0.12 + Math.sin(a) * 0.7 + (k > 5 ? -0.1 * (k - 5) : 0), Math.cos(a) * w]);
      }
      tube(m, pts, 0.035, mulC(base, 0.6), 4);
    };
    bow(12.4, rnd() < 0.5 ? 1 : 0.55);
    bow(13.5, rnd() < 0.6 ? 0.45 : 0.9);
    mblock(m, 12.0 - x0, 0.15, 0, 0.8, 0.7, 0.45, srgb(0.06, 0.06, 0.065), rnd, 0.04);
    mblock(m, 12.0 - x0, 0.6, 0, 0.3, 0.45, 0.35, srgb(0.1, 0.1, 0.11), rnd, 0.04);
    mblock(m, 14.3 - x0, 0.33, 0, 0.6, 0.2, 1.1, srgb(0.08, 0.08, 0.09), rnd, 0.03);
  });
  if (!noseOn) {
    // the radome lies ahead, cracked
    const nx = fx + 8.5;
    placed(m, nx, 0.5, zc(nx) + 3.5 * sg, rr(rnd, -0.5, 0.5), rr(rnd, 0, 6), rr(rnd, -0.3, 0.3), () => {
      fusePiece(m, rnd, 15.3, 17.3, { ...po, brkA: true, brkB: false });
    });
  }

  // ---- centre section: intakes and a wing root, one stub of wing left on it
  const cx = 6 + rr(rnd, -2, 2);
  placed(m, cx, 0.9 - age * 0.3, zc(cx) - 0.4 * sg, -0.5 * sg + rr(rnd, -0.2, 0.2), -0.3 + rr(rnd, -0.2, 0.2), rr(rnd, -0.12, 0.08), () => {
    fusePiece(m, rnd, 5.4, 11.2, po);
    const x0 = 5.4;
    for (const s of [-1, 1]) {
      const hwx = fusAt(9)[1] * (twin ? 1 : 1);
      const dz = s * (hwx * 0.78);
      const rect = (x: number, k: number, extra = 0): V[] => {
        const pts: [number, number][] = [[1, 0.6], [1, -0.6], [0.55, -1], [-0.55, -1], [-1, -0.6], [-1, 0.6], [-0.55, 1], [0.55, 1]];
        return pts.map(([a, b]): V => [x - x0, -0.05 + b * 0.52 * k + extra, dz + a * 0.42 * k]);
      };
      const ductRings = [rect(8.2, 0.3), rect(9, 0.85), rect(10.5, 1.0)];
      loft(m, ductRings, (_i, j) => skin(base, burn * 0.25, rust, 0, j, s), { kind: KIND_METAL });
      const inner = rect(10.45, 0.86);
      loft(m, [ductRings[2], inner], mulC(base, 0.5), { kind: KIND_METAL });
      dish(m, inner, [9.6 - x0, -0.05, dz], DARKI);
      // wing root stub, torn off 1.2 m out
      if (s === sg || rnd() < 0.5) {
        placed(m, 8.6 - x0, -0.15, s * (hwx * 0.9), 0, 0, 0, () => {
          m.push(new THREE.Matrix4().makeScale(1, 1, s));
          wing(m, rnd, { rootC: 5.4, tipC: 4.9, span: rr(rnd, 0.9, 1.8), sweep: 0.5, t0: 0.28, base, rust, sootRoot: 0, sootTip: 0.9, tornRoot: false });
          m.pop();
        });
      }
    }
  });

  // ---- rear fuselage: fin(s), stabilisers and the engine nozzle(s)
  const rx = -7 + rr(rnd, -3, 3);
  placed(m, rx, 0.7, zc(rx) + 2.2 * sg, 1.25 * sg + rr(rnd, -0.25, 0.25), 0.5 * sg + rr(rnd, -0.3, 0.3), rr(rnd, -0.1, 0.1), () => {
    fusePiece(m, rnd, 0, 5.4, { ...po, brkA: false, brkB: true });
    if (twin) { nozzle(m, rnd, -0.6, 0.48, burn); nozzle(m, rnd, 0.6, 0.48, burn); } else nozzle(m, rnd, 0, 0.58, burn);
    const finO: WingO = { rootC: 3.7, tipC: 1.3, span: 2.7, sweep: 2.0, t0: 0.15, base, rust, sootRoot: 0, sootTip: 0 };
    const fins = twin ? [-1, 1] : [0];
    for (const f of fins) {
      const cant = f * 0.28;
      const short = rnd() < broke * 0.7;
      placed(m, 3.0, fusAt(2.5)[2] * 0.8, f * 0.62, -Math.PI / 2 + cant, 0, 0, () => {
        wing(m, rnd, { ...finO, span: short ? rr(rnd, 1.0, 1.8) : finO.span, sootTip: short ? 0.8 : 0 });
      });
    }
    for (const s of [-1, 1]) {
      if (rnd() < 0.2) continue;
      placed(m, 1.4, -0.05, s * (fusAt(1.4)[1] * (twin ? 1.1 : 1) * 0.9), 0, 0, 0, () => {
        m.push(new THREE.Matrix4().makeScale(1, 1, s));
        const lost = rnd() < broke * 0.6;
        wing(m, rnd, { rootC: 2.8, tipC: 1.1, span: lost ? rr(rnd, 0.6, 1.0) : 2.1, sweep: 1.6, t0: 0.09, base, rust, sootRoot: 0, sootTip: lost ? 0.8 : 0.1 });
        m.pop();
      });
    }
  });

  // ---- the wing that tore off, upside down further back
  const wx = -17 + rr(rnd, -4, 4);
  placed(m, wx, 0.15 - age * 0.15, zc(wx) - 7.5 * sg, 2.65 * sg + rr(rnd, -0.2, 0.2), 0.4 + rr(rnd, -0.4, 0.4), 0.1, () => {
    m.push(new THREE.Matrix4().makeScale(1, 1, -sg));
    wing(m, rnd, { rootC: 5.6, tipC: 1.7, span: 5.0, sweep: 3.6, t0: 0.3, base, rust, sootRoot: 1, sootTip: 0.12, tornRoot: true });
    // a pylon and a hanging store
    mblock(m, 0.8, -0.35, 2.4, 1.2, 0.5, 0.15, mulC(base, 0.7), rnd);
    m.pop();
  });

  // ---- scattered panels, equipment and wreckage along the trail
  const nP = 22 + Math.floor(26 * broke);
  for (let i = 0; i < nP; i++) {
    const x = rr(rnd, -35, 20) + (rnd() < 0.2 ? rr(rnd, 0, 12) : 0);
    jetPanel(m, rnd, x, zc(x) + rr(rnd, -7, 7), rnd() < 0.15 ? rr(rnd, 1.3, 2.2) : rr(rnd, 0.35, 1.1), base, burn, rust);
  }
  for (let i = 0; i < 5; i++) {
    const x = rr(rnd, -30, 18);
    placed(m, x, 0.1, zc(x) + rr(rnd, -6, 6), rr(rnd, -0.5, 0.5), rnd() * 6, rr(rnd, -0.5, 0.5), () => mblock(m, 0, 0, 0, rr(rnd, 0.3, 0.8), rr(rnd, 0.2, 0.5), rr(rnd, 0.3, 0.7), pick(rnd, [srgb(0.12, 0.12, 0.13), mulC(base, 0.6), srgb(0.3, 0.28, 0.2)]), rnd, 0.06));
  }
  for (let i = 0; i < 4; i++) {
    const x = rr(rnd, -30, 12), z = zc(x) + rr(rnd, -5, 5), dir = rnd() * 6.28;
    const pts: V[] = [];
    for (let k = 0; k < 7; k++) pts.push([x + Math.cos(dir) * k * 0.7 + Math.sin(k * 1.7) * 0.25, 0.06 + (k % 3 === 1 ? 0.07 : 0), z + Math.sin(dir) * k * 0.7 + Math.cos(k * 1.3) * 0.25]);
    tube(m, pts, 0.03, srgb(0.05, 0.05, 0.05), 4);
  }
  // landing gear leg with its wheel
  {
    const gx = rr(rnd, -26, -12), gz = zc(gx) + rr(rnd, 3, 7) * -sg;
    placed(m, gx, 0.35, gz, rr(rnd, -0.3, 0.3), rnd() * 6, rr(rnd, 0.8, 1.3), () => {
      tube(m, [[0, 0, 0], [0.05, 0.9, 0.0], [0.1, 1.7, 0.08]], 0.07, mulC(base, 0.8), 5);
      tube(m, [[0.05, 0.5, 0], [0.6, 1.2, 0.2]], 0.035, mulC(base, 0.7), 4);
      wheel(m, 0, -0.1, 0.18, 0.38, 0.14);
      wheel(m, 0, -0.1, -0.18, 0.38, 0.14);
    });
  }
  // a drop tank
  if (rnd() < 0.6) {
    const tx = rr(rnd, -24, -2), tz = zc(tx) + rr(rnd, 4, 8) * sg;
    placed(m, tx, 0.2, tz, rr(rnd, -0.3, 0.3), rnd() * 6, rr(rnd, -0.2, 0.2), () => {
      const prof: [number, number][] = [[-1.8, 0], [-1.4, 0.22], [-0.8, 0.33], [0.8, 0.33], [1.4, 0.22], [1.8, 0]];
      const rings = prof.map(([x, r]) => Array.from({ length: 10 }, (_, j) => [x, Math.sin((j / 10) * 6.283) * Math.max(0.01, r), Math.cos((j / 10) * 6.283) * Math.max(0.01, r)] as V));
      loft(m, rings, (i, j) => skin(mixC(base, BARE, 0.3), i === 0 ? burn * 0.5 : 0.05, rust, i, j, 0), { kind: KIND_METAL });
    });
  }

  // ---- the furrow: two berms of thrown-up sand along the track, piles where pieces dug in
  const s0 = -36, s1 = fx + 8;
  for (const off of [-2.3, 2.3]) {
    const amp = rr(rnd, 0.28, 0.55);
    paramSheet(m, Math.round((s1 - s0) / 2.2), 6, (u, v) => {
      const sx = lerp(s0, s1, u), lat = lerp(-1, 1, v);
      const env = sstep(0, 8, sx - s0) * (1 - sstep(0, 6, sx - (s1 - 6)));
      const hs = amp * (0.35 + 0.9 * vnoise(sx * 0.3, off, phase)) * env;
      const f = 1 - lat * lat;
      return [sx, hs * f * f - 0.04, zc(sx) + off + lat * 1.6];
    });
  }
  drift(m, { x: -34, z: zc(-34), a: 3.2, b: 4, h: 0.7 });
  drift(m, { x: fx + 6.5, z: zc(fx + 6) + 0.5, a: 4.5, b: 4.5, h: 1.4 });
  drift(m, { x: fx - 3, z: zc(fx) + 3 * sg, a: 4.5, b: 3.2, h: 0.9 });
  drift(m, { x: cx - 1, z: zc(cx) - 3 * sg, a: 4.5, b: 3.2, h: 0.8 + age * 0.8 });
  drift(m, { x: rx - 2.5, z: zc(rx) + 2.2 * sg, a: 3.5, b: 3.2, h: 0.8 + age * 0.8 });
  drift(m, { x: wx - 1, z: zc(wx) - 7.5 * sg, a: 3.5, b: 3.5, h: 0.5 + age * 0.9 });
  return m.geometry();
}

/** Footprint radius of a crash site (m). */
export const CRASH_RADIUS = 44;
