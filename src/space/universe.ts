// The universe the space program flies in. Everything is at real scale in an
// Earth-centred inertial frame (ECI): metres, seconds, +Y along Earth's
// rotation axis (north), and the X axis through the prime meridian at t = 0.
// Earth turns under that frame; the Sun is fixed in it for the length of a
// flight. The Moon circles Earth at its real distance, turning to keep one
// face toward us; the planets slot into BODIES later.

export interface Body {
  name: string;
  /** gravitational parameter, m³/s² */
  GM: number;
  /** mean radius, m */
  R: number;
  /** sidereal rotation rate, rad/s (about +Y) */
  spin: number;
  /** height of the top of the atmosphere (drag negligible above), m */
  atmosphereTop: number;
  /** sphere of influence radius, m */
  soi: number;
}

export const EARTH: Body = {
  name: 'Earth',
  GM: 3.986004418e14,
  R: 6_371_000,
  spin: 7.2921159e-5,
  atmosphereTop: 140_000,
  soi: 924_000_000,
};

export const MOON: Body = {
  name: 'Moon',
  GM: 4.9048695e12,
  R: 1_737_400,
  spin: (2 * Math.PI) / (27.321661 * 86400),
  atmosphereTop: 0,
  soi: 66_100_000,
};

export const BODIES: Body[] = [EARTH, MOON];

export const G0 = 9.80665;

// ---------------------------------------------------------------- vectors
export type V3 = [number, number, number];
export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const addScaled = (a: V3, b: V3, s: number): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** rotate about +Y (Earth's axis) by angle */
export function rotY(a: V3, ang: number): V3 {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [a[0] * c + a[2] * s, a[1], -a[0] * s + a[2] * c];
}

// ---------------------------------------------------------------- frames
/** Earth's rotation angle at sim time t */
export const earthAngle = (t: number) => EARTH.spin * t;

/** unit vector of a geodetic point in Earth-fixed coordinates */
export function ecefDir(latDeg: number, lonDeg: number): V3 {
  const φ = (latDeg * Math.PI) / 180, λ = (lonDeg * Math.PI) / 180;
  return [Math.cos(φ) * Math.cos(λ), Math.sin(φ), -Math.cos(φ) * Math.sin(λ)];
}
/** east, north, up at a point (Earth-fixed) */
export function enu(latDeg: number, lonDeg: number): { E: V3; N: V3; U: V3 } {
  const φ = (latDeg * Math.PI) / 180, λ = (lonDeg * Math.PI) / 180;
  const U = ecefDir(latDeg, lonDeg);
  const E: V3 = [-Math.sin(λ), 0, -Math.cos(λ)];
  const N: V3 = [-Math.sin(φ) * Math.cos(λ), Math.cos(φ), Math.sin(φ) * Math.sin(λ)];
  return { E, N, U };
}
export const toEcef = (r: V3, t: number) => rotY(r, -earthAngle(t));
export const toEci = (r: V3, t: number) => rotY(r, earthAngle(t));

export function latLon(rEcef: V3): { lat: number; lon: number } {
  const u = norm(rEcef);
  return { lat: (Math.asin(u[1]) * 180) / Math.PI, lon: (Math.atan2(-u[2], u[0]) * 180) / Math.PI };
}

/** Pad 1: on a coast at Cape-Canaveral-like latitude */
export const PAD = { lat: 28.6, lon: -80.6 };
/**
 * The launch-site scene's axes in Earth terms: +x south, +y up, +z west, so
 * its sea (-z) is the ocean east of the pad and its sunrise is in the east.
 */
export function padScene(): { x: V3; y: V3; z: V3 } {
  const { E, N, U } = enu(PAD.lat, PAD.lon);
  return { x: scale(N, -1), y: U, z: scale(E, -1) };
}

/** velocity of the air (co-rotating with Earth) at an ECI position */
export const airVelocity = (r: V3): V3 => cross([0, EARTH.spin, 0], r);

// ---------------------------------------------------------------- atmosphere
const LAYERS: [number, number, number][] = [
  [0, 288.15, -0.0065],
  [11000, 216.65, 0],
  [20000, 216.65, 0.001],
  [32000, 228.65, 0.0028],
  [47000, 270.65, 0],
  [51000, 270.65, -0.0028],
  [71000, 214.65, -0.002],
  [84852, 186.946, 0],
];
const LAYER_P: number[] = (() => {
  const p = [101325];
  for (let i = 1; i < LAYERS.length; i++) {
    const [h0, T0, L] = LAYERS[i - 1];
    const dh = LAYERS[i][0] - h0;
    p.push(L === 0 ? p[i - 1] * Math.exp((-G0 * 0.0289644 * dh) / (8.31446 * T0)) : p[i - 1] * Math.pow(T0 / (T0 + L * dh), (G0 * 0.0289644) / (8.31446 * L)));
  }
  return p;
})();

export interface Air {
  /** density, kg/m³ */
  rho: number;
  /** static pressure, Pa */
  p: number;
  /** temperature, K */
  T: number;
  /** speed of sound, m/s */
  a: number;
}
/** the 1976 standard atmosphere to 86 km, then exponential tails out to space */
export function air(h: number): Air {
  if (h < 0) h = 0;
  if (h < 86000) {
    let i = LAYERS.length - 1;
    while (i > 0 && h < LAYERS[i][0]) i--;
    const [h0, T0, L] = LAYERS[i];
    const T = T0 + L * (h - h0);
    const p = L === 0 ? LAYER_P[i] * Math.exp((-G0 * 0.0289644 * (h - h0)) / (8.31446 * T0)) : LAYER_P[i] * Math.pow(T0 / T, (G0 * 0.0289644) / (8.31446 * L));
    const rho = (p * 0.0289644) / (8.31446 * T);
    return { rho, p, T, a: Math.sqrt(1.4 * 287.05 * T) };
  }
  let rho: number;
  if (h < 120000) rho = 6.96e-6 * Math.exp(-(h - 86000) / 6000);
  else if (h < 200000) rho = 2.4e-8 * Math.exp(-(h - 120000) / 16000);
  else rho = 1.6e-10 * Math.exp(-(h - 200000) / 45000);
  const T = 186.9 + Math.min(800, (h - 86000) * 0.008);
  return { rho, p: rho * 287.05 * T, T, a: Math.sqrt(1.4 * 287.05 * T) };
}

// ---------------------------------------------------------------- orbits
export interface Orbit {
  /** semi-major axis (negative when hyperbolic) */
  a: number;
  e: number;
  /** inclination, rad */
  i: number;
  /** periapsis and apoapsis radius (apoapsis Infinity when open) */
  rp: number;
  ra: number;
  /** specific orbital energy */
  energy: number;
  /** period, s (Infinity when open) */
  period: number;
  /** true anomaly now, rad */
  nu: number;
  /** time to periapsis / apoapsis, s (NaN where they do not apply) */
  tPe: number;
  tAp: number;
  /** periapsis direction and orbit normal (unit, ECI) */
  P: V3;
  W: V3;
}

export function orbitOf(r: V3, v: V3, mu = EARTH.GM): Orbit {
  const rm = len(r), vm = len(v);
  const h = cross(r, v);
  const hm = len(h) || 1e-9;
  const W = scale(h, 1 / hm);
  const eVec = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rm));
  const e = len(eVec);
  const energy = (vm * vm) / 2 - mu / rm;
  const a = -mu / (2 * energy);
  const p = (hm * hm) / mu;
  const rp = p / (1 + e);
  const ra = e < 1 ? p / (1 - e) : Infinity;
  const P: V3 = e > 1e-7 ? scale(eVec, 1 / e) : norm(r);
  const cosNu = e > 1e-7 ? dot(eVec, r) / (e * rm) : 1;
  let nu = Math.acos(Math.max(-1, Math.min(1, cosNu)));
  if (dot(r, v) < 0) nu = 2 * Math.PI - nu;
  if (e <= 1e-7) {
    // circular: measure from the ascending direction of motion
    nu = 0;
  }
  let period = Infinity, tPe = NaN, tAp = NaN;
  if (e < 1 && a > 0) {
    const n = Math.sqrt(mu / (a * a * a));
    period = (2 * Math.PI) / n;
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    const M = E - e * Math.sin(E);
    const Mn = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    tPe = (2 * Math.PI - Mn) / n;
    tAp = Mn <= Math.PI ? (Math.PI - Mn) / n : (3 * Math.PI - Mn) / n;
  } else if (e > 1) {
    const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu > Math.PI ? (nu - 2 * Math.PI) / 2 : nu / 2));
    const M = e * Math.sinh(F) - F;
    const n = Math.sqrt(mu / -(a * a * a));
    tPe = M < 0 ? -M / n : NaN;
  }
  return { a, e, i: Math.acos(Math.max(-1, Math.min(1, W[1]))), rp, ra, energy, period, nu, tPe, tAp, P, W };
}

/** position on the orbit at true anomaly nu (ECI) */
export function orbitPoint(o: Orbit, nu: number): V3 {
  const p = o.a * (1 - o.e * o.e);
  const r = p / (1 + o.e * Math.cos(nu));
  const Q = cross(o.W, o.P);
  return add(scale(o.P, r * Math.cos(nu)), scale(Q, r * Math.sin(nu)));
}

/** true anomaly where the orbit descends through radius rr (NaN if it never does) */
export function descendingAnomaly(o: Orbit, rr: number): number {
  const p = o.a * (1 - o.e * o.e);
  if (o.e < 1e-9) return NaN;
  const c = (p / rr - 1) / o.e;
  if (c < -1 || c > 1) return NaN;
  return 2 * Math.PI - Math.acos(c);
}

/** time of flight from true anomaly nu0 to nu1 (moving forward) on an elliptic orbit */
export function timeBetween(o: Orbit, nu0: number, nu1: number, mu = EARTH.GM): number {
  if (!(o.e < 1 && o.a > 0)) return NaN;
  const n = Math.sqrt(mu / (o.a * o.a * o.a));
  const M = (nu: number) => {
    const E = 2 * Math.atan2(Math.sqrt(1 - o.e) * Math.sin(nu / 2), Math.sqrt(1 + o.e) * Math.cos(nu / 2));
    return E - o.e * Math.sin(E);
  };
  let dM = M(nu1) - M(nu0);
  while (dM < 0) dM += 2 * Math.PI;
  return dM / n;
}

// ---------------------------------------------------------------- the surface
/**
 * Earth's land and sea, as the same integer-hash value noise the globe shader
 * draws, so the simulation knows whether a splashdown is in water.
 */
function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
/** continent height in -1..1 at an Earth-fixed unit vector (land where > 0) */
export function continent(d: V3, octaves = 9): number {
  let s = 0, a = 0.5, f = 1.6;
  for (let k = 0; k < octaves; k++) {
    s += a * vnoise(d[0] * f + 11.3, d[1] * f + 4.1, d[2] * f - 7.7);
    f *= 2.07;
    a *= 0.5;
  }
  let h = (s - 0.535) * 2.4;
  // a coastline at the pad, as at Cape Canaveral: land to the west, the open Atlantic to the east
  const pad = ecefDir(PAD.lat, PAD.lon);
  const { E } = enu(PAD.lat, PAD.lon);
  const toward = (k: number) => len(sub(d, addScaled(pad, E, k)));
  h += 0.7 * Math.exp(-((toward(-0.022) / 0.024) ** 2)) - 1.3 * Math.exp(-((toward(0.075) / 0.07) ** 2)) - 0.6 * Math.exp(-((toward(0.012) / 0.011) ** 2));
  return h;
}
export const CONTINENT_GLSL = /* glsl */ `
float hash3(ivec3 p) {
  uint h = uint(p.x) * 0x8da6b343u ^ uint(p.y) * 0xd8163841u ^ uint(p.z) * 0xcb1ab31fu;
  h = (h ^ (h >> 13u)) * 0x5bd1e995u;
  h ^= h >> 15u;
  return float(h) / 4294967295.0;
}
float vnoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = x - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  ivec3 b = ivec3(i);
  float a000 = hash3(b), a100 = hash3(b + ivec3(1, 0, 0)), a010 = hash3(b + ivec3(0, 1, 0)), a110 = hash3(b + ivec3(1, 1, 0));
  float a001 = hash3(b + ivec3(0, 0, 1)), a101 = hash3(b + ivec3(1, 0, 1)), a011 = hash3(b + ivec3(0, 1, 1)), a111 = hash3(b + ivec3(1, 1, 1));
  return mix(mix(mix(a000, a100, u.x), mix(a010, a110, u.x), u.y), mix(mix(a001, a101, u.x), mix(a011, a111, u.x), u.y), u.z);
}
`;

// ---------------------------------------------------------------- the Moon
/**
 * The Moon's orbit: circular, 384,400 km, in the plane of the parking orbit the
 * Saturn V reaches from Pad 1 (the launch is timed for it, as real lunar
 * launches were), so the trip there needs no plane change.
 */
export const MOON_ORBIT = (() => {
  const N = norm([-0.341623, 0.846355, -0.408628]);
  const e1 = norm(cross([0, 1, 0], N));
  const e2 = cross(N, e1);
  return { D: 384_400_000, n: MOON.spin, N, e1, e2, phase0: 0.1 };
})();

/** the Moon's position and velocity (ECI) at sim time t */
export function moonState(t: number): { r: V3; v: V3 } {
  const { D, n, e1, e2, phase0 } = MOON_ORBIT;
  const th = phase0 + n * t;
  const c = Math.cos(th), s = Math.sin(th);
  return { r: add(scale(e1, D * c), scale(e2, D * s)), v: add(scale(e1, -D * n * s), scale(e2, D * n * c)) };
}
export const moonPos = (t: number): V3 => moonState(t).r;

/** the Moon-fixed axes in ECI: X toward Earth (the near side), Z along its spin axis */
export function moonAxes(t: number): { X: V3; Y: V3; Z: V3 } {
  const X = scale(norm(moonPos(t)), -1);
  const Z = MOON_ORBIT.N;
  return { X, Y: cross(Z, X), Z };
}
export function toMoonFixed(rel: V3, t: number): V3 {
  const { X, Y, Z } = moonAxes(t);
  return [dot(rel, X), dot(rel, Y), dot(rel, Z)];
}
export function fromMoonFixed(f: V3, t: number): V3 {
  const { X, Y, Z } = moonAxes(t);
  return add(add(scale(X, f[0]), scale(Y, f[1])), scale(Z, f[2]));
}
/** velocity of the Moon's surface (turning with it) at a Moon-relative position, ECI, relative to its centre */
export const moonSpinVel = (rel: V3): V3 => cross(scale(MOON_ORBIT.N, MOON.spin), rel);

/** gravity of Earth and the Moon at an ECI point, in Earth's (accelerating) frame */
export function gravityAt(r: V3, t: number): V3 {
  const rm = len(r);
  let a = scale(r, -EARTH.GM / (rm * rm * rm));
  const m = moonPos(t);
  const d = sub(r, m);
  const dm = len(d);
  const D = len(m);
  a = addScaled(a, d, -MOON.GM / (dm * dm * dm));
  // Earth itself falls toward the Moon: the frame's own acceleration
  a = addScaled(a, m, -MOON.GM / (D * D * D));
  return a;
}

// The lunar surface: craters on craters. Each octave scatters craters on a
// jittered grid over the sphere (most cells hold one), with bowl, raised rim
// and ejecta; big ones are shallow, small ones deep for their size. The GLSL
// twin draws the same craters on the globe; the CPU version shapes the ground
// near the lander and tells the simulation where the surface is.
const CRATER_OCT: [number, number, number][] = [
  // [cell size in km, depth / diameter, share of cells with a crater]
  [260, 0.012, 0.5],
  [90, 0.03, 0.6],
  [30, 0.06, 0.62],
  [10, 0.1, 0.66],
  [3.2, 0.14, 0.7],
  [1.0, 0.17, 0.72],
  [0.32, 0.19, 0.75],
  [0.1, 0.2, 0.75],
  [0.032, 0.2, 0.7],
  [0.011, 0.18, 0.6],
];
function hashI(x: number, y: number, z: number, k: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ Math.imul(k | 0, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}
/** height (m) of the lunar surface above the mean radius, at a Moon-fixed unit vector */
export function moonHeight(d: V3, octaves = CRATER_OCT.length): number {
  let h = 0;
  for (let o = 0; o < octaves; o++) {
    const [cellKm, dr, share] = CRATER_OCT[o];
    const s = (cellKm * 1000) / MOON.R;
    const px = d[0] / s, py = d[1] / s, pz = d[2] / s;
    const bx = Math.floor(px - 0.5), by = Math.floor(py - 0.5), bz = Math.floor(pz - 0.5);
    for (let i = 0; i < 8; i++) {
      const cx = bx + (i & 1), cy = by + ((i >> 1) & 1), cz = bz + ((i >> 2) & 1);
      if (hashI(cx, cy, cz, o * 7 + 1) > share) continue;
      const jx = cx + 0.25 + 0.5 * hashI(cx, cy, cz, o * 7 + 2);
      const jy = cy + 0.25 + 0.5 * hashI(cx, cy, cz, o * 7 + 3);
      const jz = cz + 0.25 + 0.5 * hashI(cx, cy, cz, o * 7 + 4);
      const rr = 0.12 + 0.33 * Math.pow(hashI(cx, cy, cz, o * 7 + 5), 2);
      const q = Math.hypot(px - jx, py - jy, pz - jz) / rr;
      if (q > 2.2) continue;
      const depth = dr * 2 * rr * cellKm * 1000;
      h += craterProfile(q) * depth;
    }
  }
  // gentle rolling ground between the craters
  h += (vnoise(d[0] * 900, d[1] * 900, d[2] * 900) - 0.5) * 900 + (vnoise(d[0] * 9000, d[1] * 9000, d[2] * 9000) - 0.5) * 120;
  return h;
}
/** crater cross-section: -1 at the floor, a rim at q = 1, ejecta fading by q = 2.2 */
function craterProfile(q: number): number {
  const bowl = q < 1 ? q * q * (1.25 - 0.25 * q * q) - 1 : 0;
  const rim = 0.32 * Math.exp(-(((q - 1) / (q < 1 ? 0.14 : 0.32)) ** 2));
  const ej = q > 1 ? 0.05 * Math.max(0, 1 - (q - 1) / 1.2) : 0;
  return bowl + rim + ej;
}
/** how dark the ground is: the maria are dark basalt, the highlands pale */
export function moonMare(d: V3): number {
  let s = 0, a = 0.5, f = 1.7;
  for (let k = 0; k < 5; k++) {
    s += a * vnoise(d[0] * f + 3.1, d[1] * f - 5.2, d[2] * f + 1.7);
    f *= 2.1;
    a *= 0.5;
  }
  return Math.max(0, Math.min(1, (s - 0.5) * 6 + 0.5));
}

export const MOON_GLSL = /* glsl */ `
float hashI(ivec3 p, int k) {
  uint h = uint(p.x) * 0x8da6b343u ^ uint(p.y) * 0xd8163841u ^ uint(p.z) * 0xcb1ab31fu ^ uint(k) * 0x2c1b3c6du;
  h = (h ^ (h >> 13u)) * 0x5bd1e995u;
  h ^= h >> 15u;
  return float(h) / 4294967295.0;
}
float craterProfile(float q) {
  float bowl = q < 1.0 ? q * q * (1.25 - 0.25 * q * q) - 1.0 : 0.0;
  float w = q < 1.0 ? 0.14 : 0.32;
  float rim = 0.32 * exp(-pow((q - 1.0) / w, 2.0));
  float ej = q > 1.0 ? 0.05 * max(0.0, 1.0 - (q - 1.0) / 1.2) : 0.0;
  return bowl + rim + ej;
}
// height (m) from the crater octaves cellKm[0..n), and how fresh (bright) the ground is
float moonCraters(vec3 d, int first, int last, out float fresh) {
  float cells[${CRATER_OCT.length}] = float[](${CRATER_OCT.map((c) => c[0].toFixed(4)).join(', ')});
  float drs[${CRATER_OCT.length}] = float[](${CRATER_OCT.map((c) => c[1].toFixed(4)).join(', ')});
  float shares[${CRATER_OCT.length}] = float[](${CRATER_OCT.map((c) => c[2].toFixed(4)).join(', ')});
  float h = 0.0;
  fresh = 0.0;
  for (int o = first; o < last; o++) {
    float s = cells[o] * 1000.0 / ${MOON.R.toFixed(1)};
    vec3 p = d / s;
    ivec3 b = ivec3(floor(p - 0.5));
    for (int i = 0; i < 8; i++) {
      ivec3 c = b + ivec3(i & 1, (i >> 1) & 1, (i >> 2) & 1);
      if (hashI(c, o * 7 + 1) > shares[o]) continue;
      vec3 j = vec3(c) + 0.25 + 0.5 * vec3(hashI(c, o * 7 + 2), hashI(c, o * 7 + 3), hashI(c, o * 7 + 4));
      float hr = hashI(c, o * 7 + 5);
      float rr = 0.12 + 0.33 * hr * hr;
      float q = length(p - j) / rr;
      if (q > 2.2) continue;
      h += craterProfile(q) * drs[o] * 2.0 * rr * cells[o] * 1000.0;
      // young craters keep bright rims and rays
      float young = step(0.82, hashI(c, o * 7 + 6));
      fresh += young * (smoothstep(2.2, 1.0, q) * 0.6 + 0.4 * smoothstep(1.3, 0.9, q));
    }
  }
  return h;
}
float moonMare(vec3 d) {
  float s = 0.0, a = 0.5, f = 1.7;
  for (int k = 0; k < 5; k++) {
    s += a * vnoise3(vec3(d.x * f + 3.1, d.y * f - 5.2, d.z * f + 1.7));
    f *= 2.1;
    a *= 0.5;
  }
  return clamp((s - 0.5) * 6.0 + 0.5, 0.0, 1.0);
}
`;
export const MOON_OCTAVES = CRATER_OCT.length;
