// Dune Sea: the analytic sand of the desert theater. Every point of the map is
// sand -- no rock, no gravel, no water -- built the way wind builds a real erg:
//
// - draa: big parallel dune ridges a few kilometres apart, running roughly
//   north-south across a west-north-west wind. Each has a long gentle windward
//   (stoss) slope, a sharp crest and a steep lee slip face, with flat sand
//   floors between them. The ridges wander, fork and break into passes.
// - small transverse dunes riding on the floors and the windward flanks.
// - star dunes: pyramids of sand with three to five sharp arms, where the wind
//   turns with the seasons.
// - four sand mountains: giant star-shaped massifs, the highest crests on the map.
// - a flat basin round the ruined city in the middle, and an old airstrip beside it.
//
// The heights are pure functions of x and z (the terrain workers build render
// chunks and the height grid from them; the main thread uses them for collision).
// Colours: pale gold on the windward slopes and crests, deeper orange to rust on
// the slip faces, pale flat sand on the floors, old roads as faint darker tracks.

import { NM, WORLD_SEED } from '../core/constants';
import { hash2f } from '../core/rng';
import { Simplex2 } from '../core/noise';
import { smoothstep, clamp01, lerp } from '../core/math';

const N = new Simplex2(WORLD_SEED * 3 + 101);
const N2 = new Simplex2(WORLD_SEED * 5 + 202);
const N3 = new Simplex2(WORLD_SEED * 11 + 303);

/** The prevailing wind blows toward the east-south-east: this is its downwind unit vector (x east, z south). */
export const WIND_X = 0.985;
export const WIND_Z = 0.174;

const at = (xNm: number, yNm: number) => ({ x: xNm * NM, z: -yNm * NM });

/** The ruined city of Al-Qasr: centre and the radius of its flat basin (m). */
export const CITY = { ...at(0, 0), r: 2800 };
/** The old airstrip beside the city: centre, heading (deg), length and width (m). */
export const OLD_STRIP = { ...at(9, -5), heading: 68, length: 2400, width: 70 };
const STRIP_AX = Math.sin((OLD_STRIP.heading * Math.PI) / 180);
const STRIP_AZ = -Math.cos((OLD_STRIP.heading * Math.PI) / 180);

/** Old roads (world metres): the east-west road between the two bases through the city, and the caravan track north-south. */
export const ROADS: { x: number; z: number }[][] = [
  [at(-46, -6), at(-38, -7), at(-30, -9), at(-21, -6), at(-12, -3), at(-5, -1), at(0, 0), at(6, 1), at(14, 3), at(23, 6), at(31, 7), at(39, 6), at(46, 6)],
  [at(-2, -58), at(-5, -44), at(-3, -30), at(-6, -18), at(-2, -8), at(0, 0), at(3, 9), at(1, 20), at(5, 32), at(3, 45), at(6, 58)],
];

/** The four sand mountains: centre, radius (m), height above the floor (m), arms and their turn. */
const MOUNTAINS = [
  { ...at(-24, 31), R: 11500, H: 1560, k: 5, ph: 0.3 },
  { ...at(23, -29), R: 12500, H: 1640, k: 4, ph: 1.1 },
  { ...at(34, 31), R: 9500, H: 1300, k: 5, ph: 2.0 },
  { ...at(-29, -33), R: 9800, H: 1240, k: 3, ph: 0.7 },
];

/** A hill in a city's frame (u across, v along its main street; m): a smooth dome, h above the floor, optionally cut in terraces. */
export interface AncientHill { u: number; v: number; ru: number; rv: number; rot: number; h: number; terrace?: number }
/** A raised (or, with a negative h, sunken) flat platform: half-sizes hu, hv, its sides sloping over edge metres. */
export interface AncientPlat { u: number; v: number; hu: number; hv: number; h: number; edge: number }
/** Where a theatre is cut into a hill: the hills are taken down to the floor within r, rising again over edge. */
export interface AncientCut { u: number; v: number; r: number; edge: number }
/** A tongue of dune running in over the city: from its tail (upwind, out in the erg) to its nose, w wide, h high. */
export interface AncientTongue { u0: number; v0: number; u1: number; v1: number; w: number; h: number }

export interface AncientSite {
  x: number;
  z: number;
  /** the street grid's turn (rad) */
  yaw: number;
  /** the walls' half-width (m) */
  H: number;
  name: string;
  /** which plan (ancientCities.ts) */
  plan: 'palmyra' | 'ephesus' | 'paestum' | 'jerash';
  hills: AncientHill[];
  plats: AncientPlat[];
  cuts: AncientCut[];
  tongues: AncientTongue[];
  /** the levelled floor (m; found once below) */
  floor: number;
}

/**
 * The four ancient cities: Greco-Roman towns the sand took (ancientCities.ts holds their plans). Centre,
 * the grid's turn (rad), the walls' half-width (m), a name, and the ground they stand on: the hills, the
 * raised terraces, the hollows and the tongues of dune that have run in over them, in the city's frame.
 */
export const ANCIENT: AncientSite[] = [
  // a Palmyra: the great colonnade, the temenos of Bel, the valley of the tower tombs between two ridges to the south-west
  {
    ...at(-20, 8), yaw: 0.12, H: 1250, name: 'TADMOR', plan: 'palmyra',
    hills: [
      { u: -2090, v: 1450, ru: 1300, rv: 420, rot: -0.75, h: 70 },
      { u: -1140, v: 1950, ru: 1250, rv: 380, rot: -0.75, h: 60 },
      { u: -1600, v: -1500, ru: 420, rv: 340, rot: 0.4, h: 85 },
    ],
    plats: [{ u: 840, v: -100, hu: 150, hv: 150, h: 3, edge: 40 }],
    cuts: [],
    tongues: [
      { u0: -3275, v0: -1540, u1: -500, v1: -700, w: 330, h: 30 },
      { u0: -3625, v0: -140, u1: -850, v1: 700, w: 220, h: 18 },
      { u0: -2575, v0: -1990, u1: 200, v1: -1150, w: 200, h: 16 },
    ],
    floor: 0,
  },
  // an Ephesus: the theatre cut into the west flank of a hill, the terraced houses on a second hill to the south, the harbour basin to the west
  {
    ...at(22, 16), yaw: -0.22, H: 1300, name: 'EPHESOS', plan: 'ephesus',
    hills: [
      { u: 820, v: -260, ru: 640, rv: 760, rot: 0.15, h: 75 },
      { u: 520, v: 1080, ru: 1150, rv: 470, rot: -0.12, h: 110, terrace: 9 },
    ],
    plats: [{ u: -1650, v: -120, hu: 330, hv: 260, h: -7, edge: 70 }],
    cuts: [{ u: 300, v: -230, r: 128, edge: 55 }],
    tongues: [
      { u0: -3800, v0: 930, u1: -900, v1: 800, w: 300, h: 26 },
      { u0: -3600, v0: -870, u1: -700, v1: -1000, w: 260, h: 22 },
    ],
    floor: 0,
  },
  // a Paestum: three Doric temples in a row, the forum between them, a long circuit of walls on the flat
  {
    ...at(-8, -36), yaw: 0.05, H: 1250, name: 'POSEIDONIA', plan: 'paestum',
    hills: [],
    plats: [],
    cuts: [],
    tongues: [
      { u0: -2325, v0: -1500, u1: 500, v1: -850, w: 340, h: 28 },
      { u0: -3475, v0: 55, u1: -650, v1: 700, w: 240, h: 20 },
      { u0: -2125, v0: 505, u1: 700, v1: 1150, w: 200, h: 16 },
    ],
    floor: 0,
  },
  // a Jerash: the oval plaza, the cardo, temples on raised terraces, the hippodrome outside the south gate
  {
    ...at(30, -8), yaw: 0.3, H: 1150, name: 'GERASA', plan: 'jerash',
    hills: [{ u: -1050, v: 450, ru: 520, rv: 950, rot: 0.05, h: 35 }],
    plats: [
      { u: -330, v: -80, hu: 175, hv: 130, h: 13, edge: 45 },
      { u: -330, v: 820, hu: 120, hv: 95, h: 11, edge: 40 },
    ],
    cuts: [],
    tongues: [
      { u0: 950, v0: -3600, u1: 750, v1: 200, w: 420, h: 34 },
      { u0: -3190, v0: -2030, u1: -700, v1: -750, w: 260, h: 22 },
    ],
    floor: 0,
  },
];
/** how far beyond its walls a city's ground is levelled (its tombs, hippodrome and aqueduct stand out there) */
export const ANCIENT_APRON = 1100;

/** places the big dunes stand back from: the two runways and the city */
const CLEAR = [{ ...at(-46, -6), r: 7000 }, { ...at(46, 6), r: 7000 }, { x: CITY.x, z: CITY.z, r: 6000 }];

function fract(v: number): number {
  return v - Math.floor(v);
}

/** Draa ridge across one wavelength (0..1 of it): flat floor, long windward rise, sharp crest, steep slip face. */
function draa(p: number): number {
  if (p < 0.14) return 0;
  if (p < 0.68) return Math.pow((p - 0.14) / 0.54, 1.45);
  if (p < 0.85) return Math.pow(1 - (p - 0.68) / 0.17, 1.2);
  return 0;
}

/** A small transverse dune: windward rise, crest, slip face, a short flat. */
function ripple(p: number): number {
  if (p < 0.6) return Math.pow(p / 0.6, 1.3);
  if (p < 0.84) return Math.pow(1 - (p - 0.6) / 0.24, 1.3);
  return 0;
}

/** How far from the runways and the city the big sand may rise (0 there .. 1 well away). */
function clearance(x: number, z: number): number {
  let c = 1;
  for (const q of CLEAR) {
    const d = Math.hypot(x - q.x, z - q.z);
    c = Math.min(c, smoothstep(q.r * 0.55, q.r * 1.35, d));
  }
  return c;
}

/** Height of the floor sand the dunes stand on (m): broad, slow swells. */
export function duneBase(x: number, z: number): number {
  return 240 + 80 * N3.noise(x / 70000, z / 70000) + 35 * N.noise(x / 15000 - 3, z / 15000 + 9);
}

/** Star-shaped sand: a sharp central peak with k arms, r / R in [0, 1]. */
function starShape(dx: number, dz: number, R: number, k: number, ph: number, sharp: number): number {
  const r = Math.hypot(dx, dz);
  if (r >= R) return 0;
  const ang = Math.atan2(dz, dx);
  const arm = 0.4 + 0.6 * Math.pow(Math.abs(Math.cos(0.5 * k * (ang + ph))), 2.6);
  const rn = r / (R * arm);
  return rn >= 1 ? 0 : Math.pow(1 - rn, sharp);
}

const STAR_CELL = 9000;
/** Star dunes on a jittered grid of cells, about four in ten cells holding one. */
function starDunes(x: number, z: number): number {
  const ci = Math.floor(x / STAR_CELL), cj = Math.floor(z / STAR_CELL);
  let h = 0;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      if (hash2f(i, j, 71) > 0.42) continue;
      const cx = (i + 0.2 + 0.6 * hash2f(i, j, 72)) * STAR_CELL;
      const cz = (j + 0.2 + 0.6 * hash2f(i, j, 73)) * STAR_CELL;
      const R = 1500 + 1500 * hash2f(i, j, 74);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz > R * R) continue;
      const H = 130 + 260 * hash2f(i, j, 75);
      const k = 3 + Math.floor(hash2f(i, j, 76) * 3);
      h = Math.max(h, H * starShape(dx, dz, R, k, hash2f(i, j, 77) * 6.28, 1.5));
    }
  }
  return h;
}

/** The sand mountains (their height above the floor), and how much of the ridge pattern they bury. */
function mountains(x: number, z: number): number {
  let h = 0;
  for (const m of MOUNTAINS) {
    const dx = x - m.x, dz = z - m.z;
    if (dx * dx + dz * dz > m.R * m.R) continue;
    // the arms wander a little, and lesser crests run down between them
    const wob = 0.25 * N2.noise(dx / 5000 + m.ph, dz / 5000);
    const main = starShape(dx, dz, m.R, m.k, m.ph + wob, 1.35);
    const minor = 0.22 * starShape(dx, dz, m.R * 0.75, m.k * 2, m.ph + 0.4 + wob, 1.6);
    h = Math.max(h, m.H * Math.max(main, minor));
  }
  return h;
}

/** Old airstrip: 1 on the strip and its graded margin, 0 well away. */
export function stripWeight(x: number, z: number, margin = 160, blend = 700): number {
  const dx = x - OLD_STRIP.x, dz = z - OLD_STRIP.z;
  const along = dx * STRIP_AX + dz * STRIP_AZ;
  const across = dx * -STRIP_AZ + dz * STRIP_AX;
  const oa = Math.max(0, Math.abs(along) - OLD_STRIP.length / 2 - margin);
  const oc = Math.max(0, Math.abs(across) - OLD_STRIP.width / 2 - margin);
  return 1 - smoothstep(0, blend, Math.hypot(oa, oc));
}

/** The sand without the oases (the oases are found on it). */
function rawHeight(x: number, z: number, out?: { small: number; base: number }): number {
  const base = duneBase(x, z);
  // downwind (s) and crestwise (t) coordinates, the crests bent into long sinuous lines
  const s0 = x * WIND_X + z * WIND_Z;
  const t = -x * WIND_Z + z * WIND_X;
  const s = s0 + 2600 * N.noise(t / 21000 + 4.2, s0 / 36000 - 1.3) + 700 * N2.noise(t / 6500, s0 / 9000 + 7.7);
  const clear = clearance(x, z);
  // the draa: about 4.6 km apart, 220 to 740 m high, breaking into passes here and there
  const phase = s / 4600 + 0.9 * N3.noise(t / 40000 + 2.2, s0 / 50000);
  const ridge = draa(fract(phase));
  let A = 220 + 520 * clamp01(0.55 + 0.7 * N.noise(t / 24000 + 9.1, s0 / 45000 - 3.3));
  A *= 0.3 + 0.7 * smoothstep(-0.4, 0.1, N2.noise(t / 11000 - 5.5, s0 / 30000 + 2.1));
  A *= 0.12 + 0.88 * clear;
  // small dunes on the floors and windward flanks (fewer on the big slip faces)
  const s2 = s + 140 * N3.noise(t / 1500, s / 1500);
  const p2 = fract(s2 / 620 + 0.37 * N.noise(t / 2400 + 1, s2 / 5000));
  const small = ripple(p2) * (14 + 30 * clamp01(0.5 + 0.8 * N2.noise(x / 7000 + 3, z / 7000)));
  const mtn = mountains(x, z);
  const bury = 1 - smoothstep(150, 700, mtn);
  let h = base + A * ridge * bury + small * (1 - 0.6 * smoothstep(0.75, 1, ridge)) * (0.4 + 0.6 * bury);
  h += starDunes(x, z) * (1 - 0.5 * ridge) * clear * bury;
  h += mtn * clear;
  // the city basin: drifted sand over flat ground, the small dunes half there
  const dc = Math.hypot(x - CITY.x, z - CITY.z);
  const wc = 1 - smoothstep(CITY.r, CITY.r * 1.6, dc);
  if (wc > 0) h = lerp(h, base + 4 + small * 0.25, wc);
  // the old airstrip, graded flat and since drifted over at the edges
  const ws = stripWeight(x, z);
  if (ws > 0) h = lerp(h, duneBase(OLD_STRIP.x, OLD_STRIP.z) + 3, ws);
  // the highest crests round off just over 1,800 m
  if (h > 1700) h = 1700 + 120 * Math.tanh((h - 1700) / 120);
  if (out) {
    out.small = small;
    out.base = base;
  }
  return h;
}

// the ancient cities' floors: the sand round each, levelled (once, now the functions they need exist)
for (const c of ANCIENT) c.floor = duneBase(c.x, c.z) + 2;

/** A point in an ancient city's own frame (u across, v along its main street), or null when well outside them all. */
export function ancientLocal(x: number, z: number): { c: AncientSite; u: number; v: number } | null {
  for (const c of ANCIENT) {
    const dx = x - c.x, dz = z - c.z;
    const reach = c.H + ANCIENT_APRON + 2900;
    if (dx * dx + dz * dz > reach * reach * 2) continue;
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    // (the inverse of placing a local point at x = cx + u cos + v sin, z = cz - u sin + v cos)
    return { c, u: dx * co - dz * si, v: dx * si + dz * co };
  }
  return null;
}

/**
 * The shape of a city's ground above its floor at a point of its frame (m), without the dunes lying
 * over it: its hills (terraced where they are, taken down where a theatre is cut into them), its
 * raised terraces and its sunken basins.
 */
export function ancientGround(c: AncientSite, u: number, v: number): number {
  let hill = 0;
  for (const k of c.hills) {
    const du = u - k.u, dv = v - k.v;
    const co = Math.cos(k.rot), si = Math.sin(k.rot);
    const a = (du * co + dv * si) / k.ru, b = (dv * co - du * si) / k.rv;
    const q2 = a * a + b * b;
    if (q2 >= 1) continue;
    let y = k.h * (1 - q2) * (1 - q2);
    if (k.terrace) {
      const t = y / k.terrace, f = Math.floor(t);
      y = k.terrace * (f + smoothstep(0.68, 1, t - f));
    }
    hill += y;
  }
  for (const k of c.cuts) {
    const d = Math.hypot(u - k.u, v - k.v);
    if (d < k.r + k.edge) hill *= smoothstep(k.r, k.r + k.edge, d);
  }
  let r = hill;
  for (const p of c.plats) {
    const ou = Math.abs(u - p.u) - p.hu, ov = Math.abs(v - p.v) - p.hv;
    if (ou > p.edge || ov > p.edge) continue;
    r += p.h * (1 - smoothstep(0, p.edge, Math.hypot(Math.max(ou, 0), Math.max(ov, 0))));
  }
  return r;
}

/** The depth of the tongues of dune lying over a city at a point of its frame (m; small: the little dunes riding on them). */
export function ancientDrift(c: AncientSite, u: number, v: number, small = 0): number {
  let r = 0;
  for (const t of c.tongues) {
    const eu = t.u1 - t.u0, ev = t.v1 - t.v0, L2 = eu * eu + ev * ev;
    const pr = ((u - t.u0) * eu + (v - t.v0) * ev) / L2;
    const pc = pr < 0 ? 0 : pr > 1 ? 1 : pr;
    const d = Math.hypot(u - t.u0 - eu * pc, v - t.v0 - ev * pc);
    // (the nose, downwind, rounder and steeper: a slip face)
    const w = t.w * (1 - 0.45 * smoothstep(0, 1, ((pr - 1) * Math.sqrt(L2)) / t.w));
    if (d >= w) continue;
    r += (t.h + small * 0.5) * (1 - smoothstep(0.22, 1, d / w));
  }
  return r;
}

// ---------------------------------------------------------------------------
// Oases: here and there on a valley floor the ground dips to the water table: a
// pond in a hollow, palms round it, green ground. Found once (the same on every
// machine) on the sand without them.
// ---------------------------------------------------------------------------

export interface Oasis {
  x: number;
  z: number;
  /** radius of the hollow the dunes stand back from (m) */
  R: number;
  /** the pond's mean radius (m) and the wobble of its shore */
  pond: number;
  wob: [number, number, number, number];
  /** the hollow's flat floor and the water surface (m) */
  floor: number;
  level: number;
}

const POND_DIP = 9;
const POND_REACH = 1.3;

function findOases(): Oasis[] {
  const found: Oasis[] = [];
  const half = 54 * NM;
  const cell = 15000;
  const n = Math.ceil((2 * half) / cell);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // about one cell in four holds an oasis, if a valley floor there is flat enough
      if (hash2f(i, j, 911) > 0.24) continue;
      for (let k = 0; k < 6; k++) {
        const x = -half + (i + 0.15 + 0.7 * hash2f(i * 7 + k, j, 912)) * cell;
        const z = -half + (j + 0.15 + 0.7 * hash2f(i, j * 7 + k, 913)) * cell;
        if (CLEAR.some((q) => Math.hypot(x - q.x, z - q.z) < q.r * 1.6 + 5000) || stripWeight(x, z) > 0) continue;
        if (ANCIENT.some((c) => Math.hypot(x - c.x, z - c.z) < c.H + ANCIENT_APRON + 6000)) continue;
        if (found.some((o) => Math.hypot(x - o.x, z - o.z) < 16000)) continue;
        const base = duneBase(x, z);
        const h0 = rawHeight(x, z);
        if (h0 - base > 25) continue;
        let lo = h0, hi = h0;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const h = rawHeight(x + Math.cos(ang) * 450, z + Math.sin(ang) * 450);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
        if (hi - lo > 40) continue;
        // (big enough to read from a jet: a lake 0.7-1.4 km across in a hollow 4-6 km wide)
        const R = 2000 + 900 * hash2f(i, j, 914);
        const pond = 350 + 350 * hash2f(i, j, 915);
        const floor = base - 10;
        found.push({
          x, z, R, pond,
          wob: [hash2f(i, j, 916) * 6.28, hash2f(i, j, 917) * 6.28, 0.1 + 0.08 * hash2f(i, j, 918), 0.06 + 0.06 * hash2f(i, j, 919)],
          floor,
          // the dip reaches the shore 1.3 x the pond radius out: the water stands where it meets the floor's level
          level: floor - POND_DIP * (1 - 1 / (POND_REACH * POND_REACH)),
        });
        break;
      }
    }
  }
  return found;
}

export const OASES: Oasis[] = findOases();

/** The pond's shore radius at an angle round the oasis (m). */
export function pondRadius(o: Oasis, ang: number): number {
  return o.pond * (1 + o.wob[2] * Math.sin(3 * ang + o.wob[0]) + o.wob[3] * Math.sin(5 * ang + o.wob[1]));
}

/** The nearest oasis within reach of a point, and the distance to it, or null. */
export function oasisNear(x: number, z: number, reach = 2): { o: Oasis; d: number } | null {
  for (const o of OASES) {
    const dx = x - o.x, dz = z - o.z;
    const r = o.R * reach;
    if (dx * dx + dz * dz < r * r) return { o, d: Math.sqrt(dx * dx + dz * dz) };
  }
  return null;
}

const _raw = { small: 0, base: 0 };

/** Ground height of the Dune Sea (m above sea level, always well above it). */
export function duneHeight(x: number, z: number): number {
  let h = rawHeight(x, z, _raw);
  // an ancient city: its ground levelled inside and round its walls (its hills, terraces and tongues of dune
  // on it), blending out into the erg over two kilometres along a wandering edge
  const al = ancientLocal(x, z);
  if (al) {
    const flat = al.c.H + ANCIENT_APRON;
    const d = Math.max(Math.abs(al.u), Math.abs(al.v)) + 450 * N2.noise(x / 2600 + 11, z / 2600 - 4);
    const w = 1 - smoothstep(flat, flat + 2000, d);
    if (w > 0) h = lerp(h, al.c.floor + 1.2 * N.noise(x / 300, z / 300) + _raw.small * 0.12 + ancientGround(al.c, al.u, al.v) + ancientDrift(al.c, al.u, al.v, _raw.small), w);
  }
  const near = oasisNear(x, z);
  if (!near) return h;
  const { o, d } = near;
  // the dunes stand back from the hollow; its floor is flat and a few metres down
  const w = 1 - smoothstep(o.R * 0.9, o.R * 1.9, d);
  const target = o.floor + 10 * smoothstep(o.R * 0.5, o.R * 1.1, d) + _raw.small * 0.2 * smoothstep(o.R * 0.6, o.R * 1.2, d);
  h = lerp(h, target, w);
  // the pond: a shallow bowl, its shore wobbling round
  const rp = pondRadius(o, Math.atan2(z - o.z, x - o.x)) * POND_REACH;
  if (d < rp) {
    const u = d / rp;
    h -= POND_DIP * (1 - u * u);
  }
  return h;
}

/** Distance (m) to the nearest old road. */
export function roadDistance(x: number, z: number): number {
  let best = 1e9;
  for (const r of ROADS) {
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i], b = r[i + 1];
      const ex = b.x - a.x, ez = b.z - a.z;
      const L2 = ex * ex + ez * ez;
      let u = ((x - a.x) * ex + (z - a.z) * ez) / L2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = Math.hypot(x - (a.x + ex * u), z - (a.z + ez * u));
      if (d < best) best = d;
    }
  }
  return best;
}

export interface SandColor {
  r: number;
  g: number;
  b: number;
}

function mixc(o: SandColor, r: number, g: number, b: number, t: number): void {
  o.r += (r - o.r) * t;
  o.g += (g - o.g) * t;
  o.b += (b - o.b) * t;
}

/**
 * Sand colour at a vertex (sRGB-ish, as the other maps' vertex colours): pale gold on
 * the windward slopes and crests, deeper orange to rust on the slip faces (fresh,
 * coarser sand that has avalanched down the lee), pale flat sand on the floors, the
 * old roads and airstrip darker where wheels packed them, the airfields packed dark.
 */
export function sandColor(x: number, z: number, h: number, slope: number, field: number, out: SandColor): SandColor {
  const e = 12;
  const dhs = (duneHeight(x + WIND_X * e, z + WIND_Z * e) - duneHeight(x - WIND_X * e, z - WIND_Z * e)) / (2 * e);
  const lee = smoothstep(0.04, 0.4, -dhs);
  const n1 = N3.noise(x / 380, z / 380);
  const n2 = N.noise(x / 2600, z / 2600);
  const n3 = N2.noise(x / 9000 + 4, z / 9000 - 2);
  // golden sand
  out.r = 0.86 + 0.03 * n1;
  out.g = 0.7 + 0.03 * n1;
  out.b = 0.47 + 0.025 * n1;
  // whole fields of the erg run redder or paler
  mixc(out, 0.83, 0.58, 0.36, 0.35 * clamp01(0.5 + n3));
  // flat floors between the ridges: pale, fine, wind-packed sand
  const rel = h - duneBase(x, z);
  const flat = (1 - smoothstep(0.03, 0.12, slope)) * (1 - smoothstep(20, 90, rel));
  mixc(out, 0.9, 0.8, 0.62, flat * (0.55 + 0.15 * n2));
  // the slip faces: deeper orange, rust where they are steepest
  mixc(out, 0.8, 0.52, 0.3, lee * 0.75);
  mixc(out, 0.66, 0.37, 0.21, lee * smoothstep(0.32, 0.6, slope) * 0.7);
  // wind-scoured crests a little paler
  mixc(out, 0.92, 0.79, 0.57, smoothstep(250, 900, rel) * (1 - lee) * 0.3);
  // old roads: faint darker wheel tracks, drifted over in stretches
  const rd = roadDistance(x, z);
  if (rd < 30) {
    const tracks = (1 - smoothstep(6, 30, rd)) * smoothstep(-0.2, 0.25, N.noise(x / 1800 + 7, z / 1800 - 3));
    mixc(out, 0.74, 0.6, 0.43, tracks * 0.45);
  }
  // the old airstrip and the city's trodden ground
  const sw = stripWeight(x, z, 0, 40);
  if (sw > 0) mixc(out, 0.6, 0.5, 0.37, sw * 0.8);
  const dc = Math.hypot(x - CITY.x, z - CITY.z);
  mixc(out, 0.78, 0.67, 0.5, (1 - smoothstep(CITY.r * 0.6, CITY.r * 1.1, dc)) * 0.45);
  // the ancient cities: warmer, trodden ground inside the walls (the pale stone stands out on it), the drifts on it paler
  const al = ancientLocal(x, z);
  if (al) {
    const d = Math.max(Math.abs(al.u), Math.abs(al.v));
    const inner = (1 - smoothstep(al.c.H - 150, al.c.H + 450, d)) * (1 - smoothstep(5, 15, h - al.c.floor)) * (1 - lee);
    mixc(out, 0.79 + 0.03 * n1, 0.63 + 0.03 * n1, 0.43, inner * (0.4 + 0.15 * n2));
  }
  // the airfields: packed, dark sand
  if (field > 0.3) mixc(out, 0.56, 0.46, 0.34, smoothstep(0.3, 0.9, field) * 0.85);
  // oases: green ground round the pond in patches, wet dark sand at the shore, the pond bed dark
  const near = oasisNear(x, z, 1.2);
  if (near) {
    const { o, d } = near;
    const rp = pondRadius(o, Math.atan2(z - o.z, x - o.x));
    const patch = clamp01(0.55 + 0.9 * N.noise(x / 60, z / 60) + 0.4 * N2.noise(x / 17, z / 17));
    const edge = rp * (2.15 + 0.7 * N.noise(x / 900 + 3.3, z / 900 - 1.7));
    const green = (1 - smoothstep(edge * 0.8, edge * 1.15, d)) * smoothstep(rp * 1.0, rp * 1.15, d);
    mixc(out, 0.4 + 0.08 * n1, 0.45 + 0.06 * n1, 0.22, green * (0.35 + 0.55 * patch));
    // a darker, lusher ring close to the water (reeds and grass)
    mixc(out, 0.3, 0.38, 0.17, (1 - smoothstep(rp * 1.05, rp * 1.5, d)) * smoothstep(rp * 0.98, rp * 1.08, d) * 0.7);
    mixc(out, 0.5, 0.42, 0.3, (1 - smoothstep(rp * 0.95, rp * 1.05, d)) * 0.85);
    // dry, trodden sand on the hollow's floor further out
    mixc(out, 0.8, 0.68, 0.5, smoothstep(rp * 2.6, rp * 3.4, d) * (1 - smoothstep(o.R * 0.7, o.R * 1.1, d)) * 0.4);
  }
  return out;
}
