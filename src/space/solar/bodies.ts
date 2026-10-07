// The solar system: the Sun, the eight planets, Pluto and the moons worth
// visiting, with their real sizes, masses, spins, axial tilts and orbits.
//
// Planet positions come from the JPL "Keplerian elements for approximate
// positions of the major planets" (E. M. Standish, valid 1800 - 2050), with
// their inclinations and nodes, so the planets sit where they really are on
// any date, above and below the ecliptic. Moons ride circular orbits in their
// planet's equator, phased from their J2000 positions; good enough to find
// Europa or Titan where you'd expect it on a flyby.
//
// Frame: heliocentric ecliptic J2000, metres, Z toward the north ecliptic pole.

import { AU, J2000, Vec, vadd } from '../mars/marsPhysics';

export type BodyId =
  | 'sun' | 'mercury' | 'venus' | 'earth' | 'moon' | 'mars' | 'phobos' | 'deimos'
  | 'jupiter' | 'io' | 'europa' | 'ganymede' | 'callisto'
  | 'saturn' | 'enceladus' | 'titan' | 'uranus' | 'neptune' | 'triton' | 'pluto' | 'charon';

interface Elements {
  a: number; da: number; // AU, per century
  e: number; de: number;
  I: number; dI: number; // deg
  L: number; dL: number; // mean longitude
  w: number; dw: number; // longitude of perihelion
  O: number; dO: number; // longitude of the ascending node
}

export interface MoonOrbit {
  /** semi-major axis, m */
  a: number;
  /** sidereal period, days (negative: retrograde) */
  period: number;
  /** mean longitude at J2000, deg */
  L0: number;
}

export interface SolarBody {
  id: BodyId;
  name: string;
  /** what it orbits */
  parent: BodyId | null;
  /** mean radius, m */
  R: number;
  /** equatorial flattening (for the gas giants) */
  flat?: number;
  /** GM, m^3/s^2 */
  mu: number;
  /** sidereal rotation, hours (negative: retrograde) */
  rot: number;
  /** north pole, equatorial J2000 right ascension and declination, deg */
  poleRA: number;
  poleDec: number;
  el?: Elements;
  moon?: MoonOrbit;
  /** texture: a NASA map from assets, or drawn here */
  tex: string;
  /** the colour it shows as a point of light, and its atmosphere's glow */
  color: [number, number, number];
  atmo?: [number, number, number];
  atmoK?: number;
  rings?: { inner: number; outer: number };
  /** a line or two for the info card */
  facts: string[];
}

const KM = 1000;
const G = 6.6743e-11;

export const BODIES: Record<BodyId, SolarBody> = {
  sun: {
    id: 'sun', name: 'The Sun', parent: null, R: 695_700 * KM, mu: 1.32712440018e20, rot: 609.12, poleRA: 286.13, poleDec: 63.87, tex: 'sun',
    color: [1, 0.95, 0.85],
    facts: ['A G2 dwarf star holding 99.86% of the solar system\'s mass.', 'Surface 5,500 °C; core 15 million °C. Light takes 8 min 20 s to reach Earth.'],
  },
  mercury: {
    id: 'mercury', name: 'Mercury', parent: 'sun', R: 2439.7 * KM, mu: 2.20318e13, rot: 1407.6, poleRA: 281.01, poleDec: 61.41, tex: 'mercury',
    el: { a: 0.38709927, da: 0.00000037, e: 0.20563593, de: 0.00001906, I: 7.00497902, dI: -0.00594749, L: 252.2503235, dL: 149472.67411175, w: 77.45779628, dw: 0.16047689, O: 48.33076593, dO: -0.12534081 },
    color: [0.62, 0.6, 0.58],
    facts: ['The smallest planet and the closest to the Sun: a year of 88 days.', 'No air to hold heat: 430 °C by day, −180 °C at night.'],
  },
  venus: {
    id: 'venus', name: 'Venus', parent: 'sun', R: 6051.8 * KM, mu: 3.24859e14, rot: -5832.5, poleRA: 272.76, poleDec: 67.16, tex: 'venus',
    el: { a: 0.72333566, da: 0.0000039, e: 0.00677672, de: -0.00004107, I: 3.39467605, dI: -0.0007889, L: 181.9790995, dL: 58517.81538729, w: 131.60246718, dw: 0.00268329, O: 76.67984255, dO: -0.27769418 },
    color: [0.95, 0.88, 0.7], atmo: [1.0, 0.86, 0.6], atmoK: 1.4,
    facts: ['Wrapped in sulphuric-acid cloud over a crushing CO₂ atmosphere: 92 bar at the ground.', 'The hottest planet, 465 °C, and it spins backwards: a day longer than its year.'],
  },
  earth: {
    id: 'earth', name: 'Earth', parent: 'sun', R: 6371 * KM, mu: 3.986004418e14, rot: 23.9345, poleRA: 0, poleDec: 90, tex: 'earth',
    el: { a: 1.00000261, da: 0.00000562, e: 0.01671123, de: -0.00004392, I: -0.00001531, dI: -0.01294668, L: 100.46457166, dL: 35999.37244981, w: 102.93768193, dw: 0.32327364, O: 0, dO: 0 },
    color: [0.55, 0.7, 1.0], atmo: [0.35, 0.6, 1.0], atmoK: 1.1,
    facts: ['Home. The only world known to have liquid water on its surface and life.'],
  },
  moon: {
    id: 'moon', name: 'The Moon', parent: 'earth', R: 1737.4 * KM, mu: 4.9048695e12, rot: 655.72, poleRA: 270, poleDec: 66.54, tex: 'moon',
    moon: { a: 384_400 * KM, period: 27.321661, L0: 218.316 },
    color: [0.75, 0.74, 0.72],
    facts: ['Twelve people have walked on it, between 1969 and 1972.'],
  },
  mars: {
    id: 'mars', name: 'Mars', parent: 'sun', R: 3389.5 * KM, mu: 4.282837e13, rot: 24.6229, poleRA: 317.68, poleDec: 52.89, tex: 'mars',
    el: { a: 1.52371034, da: 0.00001847, e: 0.0933941, de: 0.00007882, I: 1.84969142, dI: -0.00813131, L: -4.55343205, dL: 19140.30268499, w: -23.94362959, dw: 0.44441088, O: 49.55953891, dO: -0.29257343 },
    color: [1.0, 0.6, 0.4], atmo: [0.9, 0.6, 0.4], atmoK: 0.6,
    facts: ['Olympus Mons, 22 km high, and Valles Marineris, 4,000 km long.', 'Air at 0.6% of Earth\'s pressure; dust storms can cover the planet.'],
  },
  phobos: {
    id: 'phobos', name: 'Phobos', parent: 'mars', R: 11.27 * KM, mu: 7.087e5, rot: 7.66, poleRA: 317.68, poleDec: 52.9, tex: 'phobos',
    moon: { a: 9376 * KM, period: 0.31891, L0: 35 },
    color: [0.5, 0.46, 0.42],
    facts: ['Spirals in 1.8 m a century; in 50 million years it will break into a ring.'],
  },
  deimos: {
    id: 'deimos', name: 'Deimos', parent: 'mars', R: 6.2 * KM, mu: 9.6e4, rot: 30.3, poleRA: 316.65, poleDec: 53.52, tex: 'phobos',
    moon: { a: 23_463 * KM, period: 1.26244, L0: 79 },
    color: [0.55, 0.5, 0.45],
    facts: ['Mars\'s smaller moon: from the surface it looks like a bright star.'],
  },
  jupiter: {
    id: 'jupiter', name: 'Jupiter', parent: 'sun', R: 69_911 * KM, flat: 0.06487, mu: 1.26686534e17, rot: 9.925, poleRA: 268.06, poleDec: 64.5, tex: 'jupiter',
    el: { a: 5.202887, da: -0.00011607, e: 0.04838624, de: -0.00013253, I: 1.30439695, dI: -0.00183714, L: 34.39644051, dL: 3034.74612775, w: 14.72847983, dw: 0.21252668, O: 100.47390909, dO: 0.20469106 },
    color: [1.0, 0.92, 0.8], atmo: [0.95, 0.85, 0.7], atmoK: 0.35,
    facts: ['More than twice the mass of all the other planets together.', 'The Great Red Spot is a storm wider than Earth, raging for at least 190 years.'],
  },
  io: {
    id: 'io', name: 'Io', parent: 'jupiter', R: 1821.6 * KM, mu: 5.959916e12, rot: 42.46, poleRA: 268.05, poleDec: 64.5, tex: 'io',
    moon: { a: 421_700 * KM, period: 1.769138, L0: 106.08 },
    color: [1.0, 0.92, 0.55],
    facts: ['The most volcanic world known: over 400 active volcanoes, squeezed by Jupiter\'s tides.'],
  },
  europa: {
    id: 'europa', name: 'Europa', parent: 'jupiter', R: 1560.8 * KM, mu: 3.202739e12, rot: 85.23, poleRA: 268.08, poleDec: 64.51, tex: 'europa',
    moon: { a: 671_034 * KM, period: 3.551181, L0: 176.0 },
    color: [0.95, 0.92, 0.85],
    facts: ['An ocean of salt water, twice Earth\'s, under 15-25 km of ice: a place life could exist.', 'Europa Clipper flies past it 49 times to find out.'],
  },
  ganymede: {
    id: 'ganymede', name: 'Ganymede', parent: 'jupiter', R: 2634.1 * KM, mu: 9.887834e12, rot: 171.7, poleRA: 268.2, poleDec: 64.57, tex: 'ganymede',
    moon: { a: 1_070_412 * KM, period: 7.154553, L0: 121.0 },
    color: [0.8, 0.76, 0.7],
    facts: ['The largest moon in the solar system, bigger than Mercury, with its own magnetic field.'],
  },
  callisto: {
    id: 'callisto', name: 'Callisto', parent: 'jupiter', R: 2410.3 * KM, mu: 7.179289e12, rot: 400.5, poleRA: 268.72, poleDec: 64.83, tex: 'callisto',
    moon: { a: 1_882_709 * KM, period: 16.689018, L0: 85.0 },
    color: [0.55, 0.52, 0.48],
    facts: ['The most heavily cratered surface in the solar system, unchanged for four billion years.'],
  },
  saturn: {
    id: 'saturn', name: 'Saturn', parent: 'sun', R: 58_232 * KM, flat: 0.09796, mu: 3.7931187e16, rot: 10.656, poleRA: 40.59, poleDec: 83.54, tex: 'saturn',
    el: { a: 9.53667594, da: -0.0012506, e: 0.05386179, de: -0.00050991, I: 2.48599187, dI: 0.00193609, L: 49.95424423, dL: 1222.49362201, w: 92.59887831, dw: -0.41897216, O: 113.66242448, dO: -0.28867794 },
    color: [1.0, 0.92, 0.72], atmo: [0.95, 0.85, 0.65], atmoK: 0.3,
    rings: { inner: 66_900 * KM, outer: 140_220 * KM },
    facts: ['Light enough to float: its density is less than water\'s.', 'The rings are 280,000 km across but mostly only about ten metres thick.'],
  },
  enceladus: {
    id: 'enceladus', name: 'Enceladus', parent: 'saturn', R: 252.1 * KM, mu: 7.211e9, rot: 32.9, poleRA: 40.66, poleDec: 83.52, tex: 'enceladus',
    moon: { a: 238_042 * KM, period: 1.370218, L0: 200 },
    color: [1, 1, 1],
    facts: ['The brightest object in the solar system: geysers at its south pole spray its hidden ocean into space.'],
  },
  titan: {
    id: 'titan', name: 'Titan', parent: 'saturn', R: 2574.7 * KM, mu: 8.978138e12, rot: 382.7, poleRA: 39.48, poleDec: 83.43, tex: 'titan',
    moon: { a: 1_221_870 * KM, period: 15.945421, L0: 15.15 },
    color: [1.0, 0.75, 0.4], atmo: [1.0, 0.7, 0.35], atmoK: 1.6,
    facts: ['The only moon with a thick atmosphere, and lakes and seas of liquid methane.', 'The Huygens probe landed there in 2005; Dragonfly flies there next.'],
  },
  uranus: {
    id: 'uranus', name: 'Uranus', parent: 'sun', R: 25_362 * KM, flat: 0.02293, mu: 5.793939e15, rot: -17.24, poleRA: 257.31, poleDec: -15.18, tex: 'uranus',
    el: { a: 19.18916464, da: -0.00196176, e: 0.04725744, de: -0.00004397, I: 0.77263783, dI: -0.00242939, L: 313.23810451, dL: 428.48202785, w: 170.9542763, dw: 0.40805281, O: 74.01692503, dO: 0.04240589 },
    color: [0.7, 0.9, 0.95], atmo: [0.6, 0.9, 1.0], atmoK: 0.6,
    rings: { inner: 41_837 * KM, outer: 51_149 * KM },
    facts: ['Knocked on its side: it rolls round the Sun with its poles in turn facing it for 42 years.'],
  },
  neptune: {
    id: 'neptune', name: 'Neptune', parent: 'sun', R: 24_622 * KM, flat: 0.01708, mu: 6.836529e15, rot: 16.11, poleRA: 299.36, poleDec: 43.46, tex: 'neptune',
    el: { a: 30.06992276, da: 0.00026291, e: 0.00859048, de: 0.00005105, I: 1.77004347, dI: 0.00035372, L: -55.12002969, dL: 218.45945325, w: 44.96476227, dw: -0.32241464, O: 131.78422574, dO: -0.00508664 },
    color: [0.45, 0.6, 1.0], atmo: [0.35, 0.55, 1.0], atmoK: 0.6,
    facts: ['The windiest planet: gusts of 2,100 km/h.', 'Found by mathematics before anyone saw it, in 1846.'],
  },
  triton: {
    id: 'triton', name: 'Triton', parent: 'neptune', R: 1353.4 * KM, mu: 1.4276e12, rot: -141.0, poleRA: 299.36, poleDec: 41.17, tex: 'triton',
    moon: { a: 354_759 * KM, period: -5.876854, L0: 260 },
    color: [0.85, 0.82, 0.78],
    facts: ['Orbits backwards: probably a captured Kuiper belt world. It has nitrogen geysers.'],
  },
  pluto: {
    id: 'pluto', name: 'Pluto', parent: 'sun', R: 1188.3 * KM, mu: 8.696e11, rot: -153.29, poleRA: 132.99, poleDec: -6.16, tex: 'pluto',
    el: { a: 39.48211675, da: -0.00031596, e: 0.2488273, de: 0.0000517, I: 17.14001206, dI: 0.00004818, L: 238.92903833, dL: 145.20780515, w: 224.06891629, dw: -0.04062942, O: 110.30393684, dO: -0.01183482 },
    color: [0.9, 0.8, 0.7],
    facts: ['A dwarf planet with a heart: Tombaugh Regio, a glacier of nitrogen ice.', 'New Horizons flew past in 2015, after nine and a half years.'],
  },
  charon: {
    id: 'charon', name: 'Charon', parent: 'pluto', R: 606 * KM, mu: 1.058e11, rot: -153.29, poleRA: 132.99, poleDec: -6.16, tex: 'charon',
    moon: { a: 19_591 * KM, period: -6.387221, L0: 120 },
    color: [0.7, 0.68, 0.66],
    facts: ['Half Pluto\'s size: the two orbit a point in the space between them.'],
  },
};

export const PLANETS: BodyId[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
export const ALL_BODIES = Object.keys(BODIES) as BodyId[];

void G;
const D2R = Math.PI / 180;
const OBL = 23.43928 * D2R;

function keplerE(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 40; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

const SUN_MU = BODIES.sun.mu;

/** heliocentric position and velocity of a planet (ecliptic J2000, m and m/s) */
export function planetState(id: BodyId, jd: number): { r: Vec; v: Vec } {
  const b = BODIES[id];
  const el = b.el;
  if (!el) return { r: [0, 0, 0], v: [0, 0, 0] };
  const T = (jd - J2000) / 36525;
  const a = (el.a + el.da * T) * AU;
  const e = el.e + el.de * T;
  const I = (el.I + el.dI * T) * D2R;
  const L = (el.L + el.dL * T) * D2R;
  const wb = (el.w + el.dw * T) * D2R;
  const O = (el.O + el.dO * T) * D2R;
  const w = wb - O;
  let M = (L - wb) % (2 * Math.PI);
  if (M < 0) M += 2 * Math.PI;
  const E = keplerE(M, e);
  const b2 = a * Math.sqrt(1 - e * e);
  const xp = a * (Math.cos(E) - e), yp = b2 * Math.sin(E);
  const n = Math.sqrt(SUN_MU / (a * a * a));
  const Ed = n / (1 - e * Math.cos(E));
  const vxp = -a * Math.sin(E) * Ed, vyp = b2 * Math.cos(E) * Ed;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  const rot = (x: number, y: number): Vec => [
    (cw * cO - sw * sO * cI) * x + (-sw * cO - cw * sO * cI) * y,
    (cw * sO + sw * cO * cI) * x + (-sw * sO + cw * cO * cI) * y,
    sw * sI * x + cw * sI * y,
  ];
  return { r: rot(xp, yp), v: rot(vxp, vyp) };
}

/** a direction given in equatorial J2000 RA / Dec, in the ecliptic frame */
export function eqToEcl(raDeg: number, decDeg: number): Vec {
  const ra = raDeg * D2R, dec = decDeg * D2R;
  const x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
  return [x, y * Math.cos(OBL) + z * Math.sin(OBL), -y * Math.sin(OBL) + z * Math.cos(OBL)];
}

/** a body's north pole (ecliptic frame, unit) */
export function poleOf(id: BodyId): Vec {
  const b = BODIES[id];
  return eqToEcl(b.poleRA, b.poleDec);
}

/** two unit vectors spanning a body's equator, from its pole */
export function equatorOf(id: BodyId): { x: Vec; y: Vec; z: Vec } {
  const z = poleOf(id);
  // the ascending node of the equator on the ecliptic: Z_ecl x pole
  let x: Vec = [-z[1], z[0], 0];
  const l = Math.hypot(x[0], x[1]);
  x = l < 1e-6 ? [1, 0, 0] : [x[0] / l, x[1] / l, 0];
  const y: Vec = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return { x, y, z };
}

/** a moon's position and velocity relative to its planet */
export function moonRel(id: BodyId, jd: number): { r: Vec; v: Vec } {
  const b = BODIES[id];
  const m = b.moon!;
  const parent = b.parent!;
  const n = (2 * Math.PI) / (m.period * 86400);
  const ang = m.L0 * D2R + n * (jd - J2000) * 86400;
  const { x, y } = equatorOf(parent === 'earth' ? 'moon' : parent);
  const c = Math.cos(ang), s = Math.sin(ang);
  const sp = m.a * Math.abs(n) * Math.sign(n);
  return {
    r: [m.a * (c * x[0] + s * y[0]), m.a * (c * x[1] + s * y[1]), m.a * (c * x[2] + s * y[2])],
    v: [sp * (-s * x[0] + c * y[0]), sp * (-s * x[1] + c * y[1]), sp * (-s * x[2] + c * y[2])],
  };
}

/** where any body is, heliocentric */
export function bodyState(id: BodyId, jd: number): { r: Vec; v: Vec } {
  const b = BODIES[id];
  if (!b.parent) return { r: [0, 0, 0], v: [0, 0, 0] };
  if (b.el) return planetState(id, jd);
  const p = bodyState(b.parent, jd);
  const m = moonRel(id, jd);
  return { r: vadd(p.r, m.r), v: vadd(p.v, m.v) };
}

export const bodyPos = (id: BodyId, jd: number): Vec => bodyState(id, jd).r;

/** the sphere of influence of a body (m) */
export function soiOf(id: BodyId): number {
  const b = BODIES[id];
  if (!b.parent) return Infinity;
  const pm = BODIES[b.parent].mu;
  const a = b.el ? b.el.a * AU : b.moon!.a;
  return a * Math.pow(b.mu / pm, 0.4);
}

/** the body's spin angle (rad) at a date: the prime meridian's turn about the pole */
export function spinAngle(id: BodyId, jd: number): number {
  const b = BODIES[id];
  return (((jd - J2000) * 24) / b.rot) * 2 * Math.PI;
}

export function orbitPeriodDays(id: BodyId): number {
  const b = BODIES[id];
  if (b.el) return 365.25 * Math.pow(b.el.a, 1.5);
  return Math.abs(b.moon?.period ?? 0);
}
