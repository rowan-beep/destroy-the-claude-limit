// The physics of the Starship mission to Mars, kept free of any rendering so
// it can be checked on its own. Real figures throughout: the Sun, Earth and
// Mars with their real masses, sizes and orbits (J2000 elements, in the plane
// of the ecliptic), a Lambert solver for the transfer, two-body propagation
// for the cruise, Mars's thin CO2 atmosphere for entry, and Super Heavy and
// Starship with their propellant, Raptor thrust and specific impulse.

export type Vec = [number, number, number];
export const vadd = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vscale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a: Vec): Vec => {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const vaxpy = (a: Vec, b: Vec, s: number): Vec => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

export const G0 = 9.80665;
export const AU = 1.495978707e11;
export const SUN_MU = 1.32712440018e20;
export const DAY = 86400;

export const EARTH_P = { mu: 3.986004418e14, R: 6_371_000, soi: 924_000_000 };
export const MARS = {
  mu: 4.282837e13,
  R: 3_389_500,
  /** sidereal day 24 h 37 min 22.7 s */
  spin: (2 * Math.PI) / 88642.66,
  soi: 577_000_000,
  /** CO2 atmosphere: 610 Pa and 0.020 kg/m^3 at the datum, 11.1 km scale height */
  p0: 610,
  rho0: 0.02,
  H: 11_100,
  top: 125_000,
  g: 3.721,
};

export function marsDensity(h: number): number {
  return h > MARS.top ? 0 : MARS.rho0 * Math.exp(-Math.max(-8000, h) / MARS.H);
}
export function marsPressure(h: number): number {
  return h > MARS.top ? 0 : MARS.p0 * Math.exp(-Math.max(-8000, h) / MARS.H);
}

// ---------------------------------------------------------------- calendar
/** Julian date of a UTC calendar date */
export function julian(y: number, m: number, d: number, hour = 0): number {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5 + hour / 24;
}
export function calendar(jd: number): { y: number; m: number; d: number; h: number; mi: number } {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  const a = Math.floor((z - 1867216.25) / 36524.25);
  const A = z + 1 + a - Math.floor(a / 4);
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + f;
  const m = E < 14 ? E - 1 : E - 13;
  const y = m > 2 ? C - 4716 : C - 4715;
  const d = Math.floor(day);
  const hr = (day - d) * 24;
  return { y, m, d, h: Math.floor(hr), mi: Math.floor((hr % 1) * 60) };
}
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function dateText(jd: number, time = false): string {
  const c = calendar(jd);
  const s = `${String(c.d).padStart(2, '0')} ${MONTHS[c.m - 1]} ${c.y}`;
  return time ? `${s} ${String(c.h).padStart(2, '0')}:${String(c.mi).padStart(2, '0')} UTC` : s;
}
export const J2000 = 2451545.0;

// ---------------------------------------------------------------- ephemerides
interface Elements {
  a: number; // AU
  e: number;
  /** longitude of perihelion, deg */
  w: number;
  /** mean longitude at J2000 and its rate, deg / Julian century */
  L0: number;
  Ldot: number;
}
// JPL approximate Keplerian elements (1800-2050), projected onto the ecliptic
const EARTH_EL: Elements = { a: 1.00000261, e: 0.01671123, w: 102.93768193, L0: 100.46457166, Ldot: 35999.37244981 };
const MARS_EL: Elements = { a: 1.52371034, e: 0.0933941, w: -23.94362959, L0: -4.55343205, Ldot: 19140.30268499 };

function keplerE(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}
function planetState(el: Elements, jd: number): { r: Vec; v: Vec } {
  const T = (jd - J2000) / 36525;
  const a = el.a * AU;
  const L = ((el.L0 + el.Ldot * T) * Math.PI) / 180;
  const w = (el.w * Math.PI) / 180;
  const M = L - w;
  const E = keplerE(((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), el.e);
  const b = a * Math.sqrt(1 - el.e * el.e);
  const x = a * (Math.cos(E) - el.e), y = b * Math.sin(E);
  const n = Math.sqrt(SUN_MU / (a * a * a));
  const Ed = n / (1 - el.e * Math.cos(E));
  const vx = -a * Math.sin(E) * Ed, vy = b * Math.cos(E) * Ed;
  const c = Math.cos(w), s = Math.sin(w);
  return { r: [x * c - y * s, x * s + y * c, 0], v: [vx * c - vy * s, vx * s + vy * c, 0] };
}
export const earthState = (jd: number) => planetState(EARTH_EL, jd);
export const marsState = (jd: number) => planetState(MARS_EL, jd);

// ---------------------------------------------------------------- two-body
function stumpC(z: number): number {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5 - z / 24;
}
function stumpS(z: number): number {
  if (z > 1e-8) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-8) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120;
}

/** Lambert's problem (universal variables): the velocities that carry r1 to r2 in tof seconds, prograde (about +z) */
export function lambert(r1: Vec, r2: Vec, tof: number, mu: number): { v1: Vec; v2: Vec } | null {
  const R1 = vlen(r1), R2 = vlen(r2);
  let th = Math.acos(Math.max(-1, Math.min(1, vdot(r1, r2) / (R1 * R2))));
  if (vcross(r1, r2)[2] < 0) th = 2 * Math.PI - th;
  const A = Math.sin(th) * Math.sqrt((R1 * R2) / (1 - Math.cos(th)));
  if (Math.abs(A) < 1e-9) return null;
  const y = (z: number) => R1 + R2 + (A * (z * stumpS(z) - 1)) / Math.sqrt(stumpC(z));
  const F = (z: number) => {
    const yz = y(z);
    if (yz < 0) return NaN;
    return Math.pow(yz / stumpC(z), 1.5) * stumpS(z) + A * Math.sqrt(yz) - Math.sqrt(mu) * tof;
  };
  // bracket the root: the lowest z with y > 0, up to the first revolution
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI * 0.999;
  while (!(y(lo) > 0) && lo < hi) lo += 0.1;
  let flo = F(lo), fhi = F(hi);
  if (!(flo < 0 && fhi > 0)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = F(mid);
    if (!Number.isFinite(fm)) {
      lo = mid;
      continue;
    }
    if (fm > 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
    if (hi - lo < 1e-12) break;
  }
  void flo;
  void fhi;
  const z = 0.5 * (lo + hi);
  const yz = y(z);
  const f = 1 - yz / R1, g = A * Math.sqrt(yz / mu), gd = 1 - yz / R2;
  return { v1: vscale(vsub(r2, vscale(r1, f)), 1 / g), v2: vscale(vsub(vscale(r2, gd), r1), 1 / g) };
}

/** two-body propagation (universal variables) of r, v by dt */
export function propagate(r0: Vec, v0: Vec, dt: number, mu: number): { r: Vec; v: Vec } {
  const R0 = vlen(r0), V0 = vlen(v0);
  const vr0 = vdot(r0, v0) / R0;
  const alpha = 2 / R0 - (V0 * V0) / mu;
  const sm = Math.sqrt(mu);
  let x = sm * Math.abs(alpha) * dt;
  if (alpha < 0) x = Math.sign(dt) * Math.sqrt(-1 / alpha) * Math.log(Math.max(1e-12, (-2 * mu * alpha * dt) / (vdot(r0, v0) + Math.sign(dt) * Math.sqrt(-mu / alpha) * (1 - R0 * alpha))));
  if (!Number.isFinite(x) || x === 0) x = (sm * dt) / R0;
  for (let i = 0; i < 80; i++) {
    const z = alpha * x * x;
    const C = stumpC(z), S = stumpS(z);
    const Fx = ((R0 * vr0) / sm) * x * x * C + (1 - alpha * R0) * x * x * x * S + R0 * x - sm * dt;
    const dF = ((R0 * vr0) / sm) * x * (1 - alpha * x * x * S) + (1 - alpha * R0) * x * x * C + R0;
    const d = Fx / dF;
    x -= d;
    if (Math.abs(d) < 1e-9) break;
  }
  const z = alpha * x * x;
  const C = stumpC(z), S = stumpS(z);
  const f = 1 - ((x * x) / R0) * C;
  const g = dt - (1 / sm) * x * x * x * S;
  const r = vadd(vscale(r0, f), vscale(v0, g));
  const R = vlen(r);
  const fd = (sm / (R * R0)) * (alpha * x * x * x * S - x);
  const gd = 1 - ((x * x) / R) * C;
  return { r, v: vadd(vscale(r0, fd), vscale(v0, gd)) };
}

/** periapsis / apoapsis radii of an orbit (apoapsis Infinity when unbound) */
export function apsides(r: Vec, v: Vec, mu: number): { rp: number; ra: number; e: number; a: number } {
  const R = vlen(r), V = vlen(v);
  const E = (V * V) / 2 - mu / R;
  const h = vlen(vcross(r, v));
  const a = -mu / (2 * E);
  const e = Math.sqrt(Math.max(0, 1 + (2 * E * h * h) / (mu * mu)));
  const rp = (h * h) / mu / (1 + e);
  const ra = e < 1 ? a * (1 + e) : Infinity;
  return { rp, ra, e, a };
}

// ---------------------------------------------------------------- the launch window
export interface Window {
  /** Julian dates of departure (leaving Earth's sphere of influence) and arrival at Mars */
  dep: number;
  arr: number;
  /** hyperbolic excess speeds, m/s */
  vInfDep: number;
  vInfArr: number;
}

/** the cheapest transfer leaving after `from` (scanning departure dates and flight times) */
export function findWindow(from: number): Window {
  let best: Window | null = null;
  let bestCost = Infinity;
  for (let dep = from; dep < from + 800; dep += 2) {
    const e = earthState(dep);
    for (let tof = 140; tof <= 300; tof += 4) {
      const m = marsState(dep + tof);
      const l = lambert(e.r, m.r, tof * DAY, SUN_MU);
      if (!l) continue;
      const vd = vlen(vsub(l.v1, e.v)), va = vlen(vsub(l.v2, m.v));
      // departure from low Earth orbit costs more than the arrival (which the atmosphere pays for)
      const cost = vd + 0.35 * va;
      if (cost < bestCost) {
        bestCost = cost;
        best = { dep, arr: dep + tof, vInfDep: vd, vInfArr: va };
      }
    }
  }
  // refine round the best
  const b = best!;
  for (let dep = b.dep - 2; dep <= b.dep + 2; dep += 0.25) {
    const e = earthState(dep);
    for (let tof = b.arr - b.dep - 4; tof <= b.arr - b.dep + 4; tof += 0.5) {
      const m = marsState(dep + tof);
      const l = lambert(e.r, m.r, tof * DAY, SUN_MU);
      if (!l) continue;
      const vd = vlen(vsub(l.v1, e.v)), va = vlen(vsub(l.v2, m.v));
      const cost = vd + 0.35 * va;
      if (cost < bestCost) {
        bestCost = cost;
        best = { dep, arr: dep + tof, vInfDep: vd, vInfArr: va };
      }
    }
  }
  return best!;
}

// ---------------------------------------------------------------- the vehicle
/** Super Heavy and Starship, next-generation figures (Raptor 3) */
export const STARSHIP = {
  booster: {
    height: 72.3,
    dry: 275_000,
    prop: 3_650_000,
    engines: 33,
    /** per engine: sea-level thrust (8,240 tf total) and in vacuum */
    thrustSL: 2_449_000,
    thrustVac: 2_640_000,
    ispSL: 350,
    ispVac: 378,
    /** propellant kept for the boostback and the catch */
    reserve: 0.08,
  },
  ship: {
    height: 52.1,
    dry: 120_000,
    cargo: 150_000,
    prop: 1_550_000,
    /** three sea-level Raptors and three vacuum Raptors (1,600 tf in vacuum) */
    sl: { count: 3, thrustSL: 2_449_000, thrustVac: 2_600_000, ispSL: 350, ispVac: 363 },
    vac: { count: 3, thrustVac: 2_650_000, ispVac: 380 },
    /** belly-first reference area and coefficients (9 m x 50 m) */
    area: 450,
    cdBelly: 1.3,
    /** lift-to-drag ratio in the hypersonic entry attitude */
    ld: 0.32,
    /** what the landing is allowed to bring down */
    landingProp: 110_000,
  },
  diameter: 9,
  minThrottle: 0.4,
};

export interface Engine {
  thrust: number;
  /** mass flow at full throttle, kg/s */
  mdot: number;
}

/** thrust and flow of the ship's engines at a pressure; `n` sea-level and `nv` vacuum engines lit */
export function shipEngines(pressure: number, n: number, nv: number): Engine {
  const s = STARSHIP.ship;
  const pr = Math.min(1, pressure / 101325);
  const tSL = s.sl.thrustVac - (s.sl.thrustVac - s.sl.thrustSL) * pr;
  // a vacuum bell would separate at sea level: it gives far less there
  const tV = s.vac.thrustVac * (1 - 0.6 * pr);
  return {
    thrust: n * tSL + nv * tV,
    mdot: n * (s.sl.thrustVac / (s.sl.ispVac * G0)) + nv * (s.vac.thrustVac / (s.vac.ispVac * G0)),
  };
}
export function boosterEngines(pressure: number, n: number): Engine {
  const b = STARSHIP.booster;
  const pr = Math.min(1, pressure / 101325);
  const t = b.thrustVac - (b.thrustVac - b.thrustSL) * pr;
  return { thrust: n * t, mdot: n * (b.thrustVac / (b.ispVac * G0)) };
}

/** Earth's standard atmosphere, roughly: density and pressure */
export function earthAir(h: number): { rho: number; p: number } {
  if (h > 140_000) return { rho: 0, p: 0 };
  const H = h < 11_000 ? 8_500 : 7_000;
  return { rho: 1.225 * Math.exp(-h / H), p: 101325 * Math.exp(-h / 7_400) };
}

/** the next transfer window after `from`: the best departure in the coming months */
export function findWindowNear(from: number): Window {
  let best: Window | null = null;
  let bestCost = Infinity;
  const scan = (d0: number, d1: number, dd: number, t0: number, t1: number, dt: number) => {
    for (let dep = d0; dep <= d1; dep += dd) {
      const e = earthState(dep);
      for (let tof = t0; tof <= t1; tof += dt) {
        const m = marsState(dep + tof);
        const l = lambert(e.r, m.r, tof * DAY, SUN_MU);
        if (!l) continue;
        const vd = vlen(vsub(l.v1, e.v)), va = vlen(vsub(l.v2, m.v));
        const cost = vd + 0.35 * va;
        if (cost < bestCost) {
          bestCost = cost;
          best = { dep, arr: dep + tof, vInfDep: vd, vInfArr: va };
        }
      }
    }
  };
  // the departure has to leave room for the three-week tanker campaign
  scan(from + 30, from + 230, 2, 140, 330, 4);
  if (!best) return findWindow(from);
  const b = best as Window;
  scan(b.dep - 2, b.dep + 2, 0.25, b.arr - b.dep - 4, b.arr - b.dep + 4, 0.5);
  return best as Window;
}
