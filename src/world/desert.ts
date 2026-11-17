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

/** Ground height of the Dune Sea (m above sea level, always well above it). */
export function duneHeight(x: number, z: number): number {
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
  // the airfields: packed, dark sand
  if (field > 0.3) mixc(out, 0.56, 0.46, 0.34, smoothstep(0.3, 0.9, field) * 0.85);
  return out;
}
