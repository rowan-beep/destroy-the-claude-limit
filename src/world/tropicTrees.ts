// The Jade Archipelago's trees: five tropical species, each with a full-detail
// shape (the nearest few hundred metres) and a simple far one, built from a
// few hundred triangles at most so the forest costs what the old one did.
//
//   4 coconut palm   beaches, cays, palm groves on the coastal plain
//   5 emergent       a giant (kapok, dipterocarp) standing over the canopy
//   6 canopy tree    the closed rainforest roof: most of the forest
//   7 tree fern      the cloud forest and the wet valley floors
//   8 pandanus       the screw pine of the beach strand and the limestone tops
//
// Foliage is coloured green-dominant and wood brown-dominant: the tree shader
// tints only the foliage by each tree's own colour (tropicTint), so crowns
// differ in shade and a few are in flower without the trunks changing.

import * as THREE from 'three';
import { srgbToLinear } from '../core/math';

type V3 = [number, number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const UP: V3 = [0, 1, 0];

/** a small deterministic hash 0..1 */
function hash(a: number, b = 0, c = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Triangles with their own normals and colours (non-indexed, ready to instance). */
class Shape {
  private p: number[] = [];
  private n: number[] = [];
  private c: number[] = [];

  /** One triangle, wound so its front faces `facing`; normals and colours per corner (colours sRGB). */
  tri(a: V3, b: V3, c: V3, facing: V3, na: V3, nb: V3, nc: V3, ca: V3, cb: V3 = ca, cc: V3 = ca): void {
    if (dot(cross(sub(b, a), sub(c, a)), facing) < 0) {
      [b, c] = [c, b];
      [nb, nc] = [nc, nb];
      [cb, cc] = [cc, cb];
    }
    for (const [v, nn, col] of [
      [a, na, ca],
      [b, nb, cb],
      [c, nc, cc],
    ] as [V3, V3, V3][]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(nn[0], nn[1], nn[2]);
      this.c.push(srgbToLinear(col[0]), srgbToLinear(col[1]), srgbToLinear(col[2]));
    }
  }

  /** A quad a-b-c-d (in order round its edge) facing `facing`. */
  quad(a: V3, b: V3, c: V3, d: V3, facing: V3, n: [V3, V3, V3, V3], col: [V3, V3, V3, V3]): void {
    this.tri(a, b, c, facing, n[0], n[1], n[2], col[0], col[1], col[2]);
    this.tri(a, c, d, facing, n[0], n[2], n[3], col[0], col[2], col[3]);
  }

  /**
   * A tube through `pts` (radius per point), `sides` round. Colour per ring from `col`
   * (ring index, 0..1 up the tube). No caps: the ends are hidden in the ground and the crown.
   */
  tube(pts: V3[], radii: number[], sides: number, col: (i: number, t: number) => V3): void {
    const rings: { v: V3[]; n: V3[] }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const t = norm(i === pts.length - 1 ? sub(pts[i], pts[i - 1]) : sub(pts[i + 1], pts[i]));
      const ref: V3 = Math.abs(t[1]) < 0.9 ? UP : [1, 0, 0];
      const u = norm(cross(ref, t));
      const w = cross(t, u);
      const v: V3[] = [];
      const n: V3[] = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const d = add(mul(u, Math.cos(a)), mul(w, Math.sin(a)));
        v.push(add(pts[i], mul(d, radii[i])));
        n.push(d);
      }
      rings.push({ v, n });
    }
    for (let i = 0; i + 1 < rings.length; i++) {
      const A = rings[i], B = rings[i + 1];
      const ca = col(i, i / (rings.length - 1)), cb = col(i + 1, (i + 1) / (rings.length - 1));
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        const facing = add(A.n[k], A.n[k1]);
        this.quad(A.v[k], A.v[k1], B.v[k1], B.v[k], facing, [A.n[k], A.n[k1], B.n[k1], B.n[k]], [ca, ca, cb, cb]);
      }
    }
  }

  /**
   * A clump of foliage: a lumpy, squashed icosahedron (20 triangles). Its normals point
   * out from `centre` (the whole crown's middle), so the clumps of one crown shade as one
   * soft mass; underneath is darker (the crown's own shade), the top a little yellower.
   */
  clump(at: V3, r: [number, number, number], centre: V3, base: V3, seed: number, lump = 0.22, detail = 0): void {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const pos = g.attributes.position;
    const vs: V3[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // the same corner gets the same bump on every face that shares it
      const k = 1 + lump * (hash(Math.round(x * 100), Math.round(y * 100) + seed, Math.round(z * 100)) * 2 - 1);
      vs.push([at[0] + x * r[0] * k, at[1] + y * r[1] * k, at[2] + z * r[2] * k]);
    }
    g.dispose();
    let lo = Infinity, hi = -Infinity;
    for (const v of vs) {
      lo = Math.min(lo, v[1]);
      hi = Math.max(hi, v[1]);
    }
    const nOf = (v: V3): V3 => norm(add(norm(sub(v, centre)), [0, 0.55, 0]));
    const cOf = (v: V3): V3 => {
      const t = (v[1] - lo) / Math.max(1e-3, hi - lo);
      const ao = 0.5 + 0.5 * t;
      const j = 0.92 + 0.16 * hash(v[0], v[1], v[2] + seed);
      return [base[0] * ao * j * (1 + 0.25 * t), base[1] * ao * j * (1 + 0.1 * t), base[2] * ao * j];
    };
    for (let i = 0; i < vs.length; i += 3) {
      const a = vs[i], b = vs[i + 1], c = vs[i + 2];
      const mid = mul(add(add(a, b), c), 1 / 3);
      this.tri(a, b, c, sub(mid, at), nOf(a), nOf(b), nOf(c), cOf(a), cOf(b), cOf(c));
    }
  }

  /**
   * A frond or a strap leaf: from `base`, out along azimuth `az` at elevation `el`, arching
   * down under its own weight (`droop` of its length at the tip), `segs` long. Its cross-section
   * is a shallow inverted V (leaflets hanging either side of the midrib) `w` wide at most.
   * Lit from above whichever way it is seen from.
   */
  frond(base: V3, az: number, el: number, L: number, droop: number, w: number, segs: number, col: V3, opts: { hang?: number; taper?: number; both?: boolean; v?: boolean } = {}): void {
    const hang = opts.hang ?? 0.32;
    const both = opts.both ?? true;
    const h: V3 = [Math.cos(az), 0, Math.sin(az)];
    const at = (t: number): V3 => add(base, add(mul(h, L * t * Math.cos(el)), [0, L * t * Math.sin(el) - droop * L * t * t, 0]));
    const secs: { c: V3; l: V3; r: V3; n: V3; cc: V3; ce: V3 }[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const c = at(t);
      const T = norm(sub(at(Math.min(1, t + 0.02)), at(Math.max(0, t - 0.02))));
      const S = norm(cross(T, UP));
      const wt = w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + 0.9 * t)), opts.taper ?? 0.7) * 0.5;
      const drop: V3 = opts.v === false ? [0, 0, 0] : [0, -wt * hang * 2, 0];
      const n = norm(add(cross(S, T), [0, 0.8, 0]));
      const shade = 0.82 + 0.18 * t;
      secs.push({
        c,
        l: add(add(c, mul(S, wt)), drop),
        r: add(add(c, mul(S, -wt)), drop),
        n: n[1] < 0 ? mul(n, -1) : n,
        cc: [col[0] * shade * 1.12, col[1] * shade * 1.08, col[2] * shade],
        ce: [col[0] * shade * 0.9, col[1] * shade * 0.92, col[2] * shade * 0.9],
      });
    }
    for (let i = 0; i < segs; i++) {
      const A = secs[i], B = secs[i + 1];
      for (const side of both ? [1, -1] : [1]) {
        const f: V3 = [0, side, 0];
        const k = side > 0 ? 1 : 0.78;
        const cc: V3 = mul(A.cc, k), ce: V3 = mul(A.ce, k), cc2: V3 = mul(B.cc, k), ce2: V3 = mul(B.ce, k);
        if (opts.v === false) {
          // flat: one quad edge to edge
          this.quad(A.l, A.r, B.r, B.l, f, [A.n, A.n, B.n, B.n], [cc, ce, ce2, cc2]);
          continue;
        }
        this.quad(A.c, A.l, B.l, B.c, f, [A.n, A.n, B.n, B.n], [cc, ce, ce2, cc2]);
        this.quad(A.r, A.c, B.c, B.r, f, [A.n, A.n, B.n, B.n], [ce, cc, cc2, ce2]);
      }
    }
  }

  /** A thin vertical fin (a buttress root), seen from both sides. */
  fin(a: V3, b: V3, c: V3, col: V3): void {
    const n = norm(cross(sub(b, a), sub(c, a)));
    const m = mul(n, -1);
    this.tri(a, b, c, n, n, n, n, col, col, mul(col, 0.8));
    this.tri(a, b, c, m, m, m, m, col, col, mul(col, 0.8));
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Points along a gently bending trunk: `lean` (rad) at the foot easing to `top` at the crown. */
function bentTrunk(H: number, lean: number, top: number, segs: number, dir = 0): V3[] {
  const pts: V3[] = [[0, 0, 0]];
  let x = 0, y = 0;
  const step = H / segs;
  for (let i = 0; i < segs; i++) {
    const a = lean + (top - lean) * ((i + 0.5) / segs);
    x += Math.sin(a) * step;
    y += Math.cos(a) * step;
    pts.push([x * Math.cos(dir), y, x * Math.sin(dir)]);
  }
  return pts;
}

const BARK_PALM: V3 = [0.5, 0.44, 0.36];
const BARK_GREY: V3 = [0.44, 0.42, 0.37];
const BARK_DARK: V3 = [0.3, 0.24, 0.18];
const FERN_TRUNK: V3 = [0.2, 0.15, 0.11];

function coconutPalm(s: Shape, far: boolean): void {
  // a slender ringed trunk leaning out from a swollen foot, curving up toward the crown
  const pts = bentTrunk(14, 0.3, 0.06, far ? 2 : 4);
  s.tube(pts, pts.map((_, i) => (i === 0 ? 0.32 : 0.22 - 0.05 * (i / (pts.length - 1)))), far ? 4 : 6, (i) => (i % 2 ? BARK_PALM : mul(BARK_PALM, 0.86)));
  const top = pts[pts.length - 1];
  const n = far ? 6 : 9;
  for (let i = 0; i < n; i++) {
    const az = i * 2.39996 + 0.3;
    // young fronds stand up, old ones droop; the oldest hang yellowing
    const age = i / (n - 1);
    const el = 0.75 - 1.05 * age;
    const old = !far && i === n - 1;
    const col: V3 = old ? [0.46, 0.42, 0.2] : age > 0.6 ? [0.31, 0.43, 0.14] : [0.26, 0.41, 0.13];
    s.frond(top, az, el, 5.4 + 0.6 * hash(i, 3), 0.42 + 0.12 * age, far ? 1.9 : 1.7, far ? 2 : 3, col, { v: !far });
  }
  // a bunch of coconuts under the crown
  if (!far) s.clump(add(top, [0, -0.7, 0]), [0.55, 0.45, 0.55], add(top, [0, -0.7, 0]), [0.42, 0.4, 0.16], 7, 0.3);
}

function emergent(s: Shape, far: boolean): void {
  // a giant: a tall column on buttress roots, an umbrella crown of big clumps over the canopy
  const H = 27;
  s.tube([[0, 0, 0], [0, H * 0.5, 0], [0, H, 0]], [0.85, 0.65, 0.48], far ? 4 : 6, (i) => mul(BARK_GREY, 0.9 + 0.08 * i));
  const C: V3 = [0, H + 3, 0];
  if (far) {
    s.clump([0, H + 3, 0], [14, 4.4, 14], C, [0.21, 0.33, 0.12], 1, 0.15);
    s.clump([2.6, H + 6.2, -1.8], [8, 3.2, 8], C, [0.24, 0.36, 0.13], 2, 0.15);
    return;
  }
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + 0.4;
    const d: V3 = [Math.cos(a), 0, Math.sin(a)];
    s.fin([0, 0, 0], add(mul(d, 2.8), [0, -0.1, 0]), [0, 6, 0], mul(BARK_GREY, 0.85));
  }
  // limbs fanning out to the crown clumps
  for (let i = 0; i < 5; i++) {
    const a = i * 1.2566 + 0.5;
    const r = 7.6 + 1.4 * hash(i, 9);
    const tip: V3 = [Math.cos(a) * r, H + 2.5 + 1.6 * hash(i, 2), Math.sin(a) * r];
    s.tube([[0, H - 3, 0], add(tip, [0, -1.5, 0])], [0.36, 0.15], 4, () => mul(BARK_GREY, 0.8));
    const cr = 5.6 + 1.2 * hash(i, 5);
    s.clump(tip, [cr, cr * 0.5, cr], C, [0.2, 0.32, 0.12], 10 + i);
  }
  s.clump([0.4, H + 5, 0.3], [8, 3.6, 8], C, [0.24, 0.36, 0.13], 16, 0.2, 1);
  const U: V3 = [0, 0, 0];
  s.clump([3.8, 1.2, 1.6], [4.8, 3.8, 4.8], U, [0.12, 0.24, 0.08], 17, 0.3);
  s.clump([-3.4, 1.6, -2.8], [4.2, 4.2, 4.2], U, [0.14, 0.27, 0.09], 18, 0.3);
}

function canopyTree(s: Shape, far: boolean): void {
  // the rainforest roof: a short straight trunk under a broad, lumpy, cauliflower crown wide
  // enough to meet its neighbours'
  const H = 8.5;
  s.tube([[0, 0, 0], [0.3, H, 0.1]], [0.6, 0.42], far ? 3 : 5, () => BARK_DARK);
  const C: V3 = [0, H + 5.5, 0];
  const green: V3 = [0.17, 0.31, 0.11];
  if (far) {
    s.clump([0, H + 5.2, 0], [13, 6.4, 13], C, green, 3, 0.18);
    return;
  }
  s.tube([[0.3, H - 1.5, 0.1], [4.2, H + 3.4, 1.9]], [0.3, 0.14], 4, () => BARK_DARK);
  s.tube([[0.3, H - 1, 0.1], [-3.6, H + 3.6, -2.4]], [0.28, 0.13], 4, () => BARK_DARK);
  // one rounded dome and three lumps bulging from its sides
  s.clump([0, H + 5.8, 0], [10.6, 6.0, 10.6], C, [0.19, 0.33, 0.12], 20, 0.16, 1);
  s.clump([7.2, H + 4.0, 3.1], [5.8, 4.0, 5.8], C, green, 21);
  s.clump([-6.2, H + 4.4, -4.1], [5.6, 3.9, 5.6], C, green, 22);
  s.clump([-2.1, H + 3.8, 7.0], [5.3, 3.7, 5.3], C, green, 23);
  // the understory: shrubs, saplings and palms filling the space under the crowns
  const U: V3 = [0, 0, 0];
  s.clump([2.6, 1.0, -1.4], [4.4, 3.6, 4.4], U, [0.12, 0.24, 0.08], 25, 0.3);
  s.clump([-3.2, 1.4, 2.4], [3.8, 3.8, 3.8], U, [0.14, 0.27, 0.09], 26, 0.3);
  // a sapling and a thicket out between this tree and the next
  const sap: V3 = [-10.5, 0, -6.5];
  s.tube([sap, add(sap, [0.2, 6.5, 0])], [0.22, 0.16], 3, () => BARK_DARK);
  s.clump(add(sap, [0.2, 8, 0]), [4.2, 3.2, 4.2], add(sap, [0, 7, 0]), [0.16, 0.3, 0.1], 27, 0.25);
  s.clump([9.5, 1.2, -7.5], [4.6, 3.4, 4.6], [9.5, -1, -7.5], [0.13, 0.25, 0.085], 28, 0.3);
}

function treeFern(s: Shape, far: boolean): void {
  // a dark fibrous stem crowned by a parasol of lacy fronds
  const pts = bentTrunk(5, 0.12, 0.02, far ? 1 : 2, 1.1);
  s.tube(pts, pts.map((_, i) => 0.2 - 0.03 * i), far ? 3 : 5, () => FERN_TRUNK);
  const top = pts[pts.length - 1];
  const n = far ? 6 : 8;
  for (let i = 0; i < n; i++) {
    const az = i * 2.39996;
    const el = 0.55 - 0.7 * (i / (n - 1));
    s.frond(top, az, el, 2.9 + 0.4 * hash(i, 7), 0.38, far ? 1.5 : 1.25, far ? 2 : 3, i % 3 === 0 ? [0.34, 0.5, 0.16] : [0.28, 0.46, 0.14], { taper: 0.5, hang: 0.18, v: !far });
  }
  // the coiled young fronds in the middle
  if (!far) s.clump(add(top, [0, 0.25, 0]), [0.45, 0.3, 0.45], top, [0.36, 0.42, 0.2], 31, 0.3);
}

function pandanus(s: Shape, far: boolean): void {
  // the screw pine: a leaning stem on stilt roots, forking into arms that end in spiky tufts
  const H = 4.5;
  const lean = 0.2;
  const fork: V3 = [Math.sin(lean) * H, Math.cos(lean) * H, 0];
  s.tube([[0, 1.2, 0], fork], [0.2, 0.16], far ? 3 : 5, () => mul(BARK_PALM, 0.75));
  if (!far) {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.3;
      s.tube([[Math.cos(a) * 1.3, -0.3, Math.sin(a) * 1.3], [0.05, 1.6, 0]], [0.06, 0.08], 3, () => mul(BARK_PALM, 0.7));
    }
  }
  const arms: V3[] = [
    [fork[0] + 1.6, fork[1] + 2.4, 0.6],
    [fork[0] - 0.6, fork[1] + 2.9, -1.4],
    [fork[0] - 1.2, fork[1] + 2.0, 1.3],
  ];
  const leaf: V3 = [0.3, 0.42, 0.17];
  if (far) {
    // the arms and their tufts as one spiky mass
    s.clump([fork[0] + 0.1, fork[1] + 2.9, -0.1], [2.9, 1.5, 2.9], [fork[0], fork[1] + 1.5, 0], leaf, 40, 0.45);
    return;
  }
  for (const [j, tip] of arms.entries()) {
    s.tube([fork, tip], [0.12, 0.08], 4, () => mul(BARK_PALM, 0.75));
    // a spiral tuft of long sword-shaped leaves, the outer ones bending down
    for (let i = 0; i < 7; i++) {
      const az = i * 2.39996 + j;
      const el = 1.1 - 1.3 * (i / 6);
      s.frond(tip, az, el, 1.9, 0.35, 0.22, 2, i > 4 ? [0.42, 0.44, 0.2] : leaf, { v: false, taper: 0.3 });
    }
  }
}

/** The shape of one of Jade's tree kinds (4..8). */
export function buildTropicTree(kind: number, far: boolean): THREE.BufferGeometry {
  const s = new Shape();
  if (kind === 4) coconutPalm(s, far);
  else if (kind === 5) emergent(s, far);
  else if (kind === 6) canopyTree(s, far);
  else if (kind === 7) treeFern(s, far);
  else pandanus(s, far);
  return s.geometry();
}

/**
 * A tree's own foliage colour (multiplies its leaves; the wood keeps its colour), from two
 * random numbers it carries. Most of the canopy is shades of green; a few crowns flush red
 * with new leaves and a few are in flower.
 */
export function tropicTint(kind: number, a: number, b: number, out: Float32Array, o: number): void {
  const r = hash(a * 91.7, b * 53.3, kind);
  let t: V3 = [1, 1, 1];
  if (kind === 6) {
    if (r < 0.3) t = [1, 1, 1];
    else if (r < 0.5) t = [1.2, 1.12, 0.78];
    else if (r < 0.68) t = [0.78, 0.9, 1.05];
    else if (r < 0.82) t = [1.16, 1.02, 0.76];
    else if (r < 0.92) t = [1.12, 1.16, 1.18];
    else if (r < 0.965) t = [1.85, 0.88, 0.75];
    else if (r < 0.98) t = [4.3, 0.62, 0.75];
    else if (r < 0.992) t = [4.2, 2.0, 0.9];
    else t = [3.6, 1.25, 2.8];
  } else if (kind === 5) t = r < 0.5 ? [1, 1, 1] : r < 0.8 ? [1.15, 1.1, 0.84] : [1.2, 1.22, 1.15];
  else if (kind === 4) t = r < 0.5 ? [1, 1, 1] : r < 0.85 ? [1.2, 1.14, 0.8] : [0.86, 0.94, 0.92];
  else if (kind === 7) t = r < 0.6 ? [1, 1, 1] : r < 0.85 ? [1.1, 1.05, 0.85] : [0.9, 1.0, 0.95];
  else t = r < 0.5 ? [1, 1, 1] : r < 0.8 ? [1.1, 1.12, 1.08] : [1.25, 1.12, 0.72];
  out[o] = t[0];
  out[o + 1] = t[1];
  out[o + 2] = t[2];
}
