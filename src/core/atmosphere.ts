// Standard atmosphere from sea level to the edge of space (200 km). Everything the flight
// model, engines and missiles need: density, pressure, temperature and the
// local speed of sound.

export interface AtmoState {
  /** Temperature, K */
  T: number;
  /** Pressure, Pa */
  p: number;
  /** Density, kg/m^3 */
  rho: number;
  /** Speed of sound, m/s */
  a: number;
  /** Density ratio rho / rho0 */
  sigma: number;
  /** Pressure ratio p / p0 */
  delta: number;
}

export const RHO0 = 1.225;
export const P0 = 101325;
export const T0 = 288.15;
export const A0 = 340.294;
const R = 287.05287;
const GAMMA = 1.4;
const G = 9.80665;

export function atmosphere(altitudeM: number, out: AtmoState = { T: 0, p: 0, rho: 0, a: 0, sigma: 0, delta: 0 }): AtmoState {
  const h = Math.max(-500, Math.min(altitudeM, 200000));
  let T: number, p: number;
  if (h <= 11000) {
    T = T0 - 0.0065 * h;
    p = P0 * Math.pow(T / T0, G / (0.0065 * R));
  } else if (h <= 20000) {
    T = 216.65;
    p = P11 * Math.exp((-G * (h - 11000)) / (R * T));
  } else if (h <= 32000) {
    T = 216.65 + 0.001 * (h - 20000);
    p = P20 * Math.pow(T / 216.65, -G / (0.001 * R));
  } else if (h <= 47000) {
    // the upper stratosphere and mesosphere (1976 standard atmosphere), for the X-15
    T = 228.65 + 0.0028 * (h - 32000);
    p = P32 * Math.pow(T / 228.65, -G / (0.0028 * R));
  } else if (h <= 51000) {
    T = 270.65;
    p = P47 * Math.exp((-G * (h - 47000)) / (R * T));
  } else if (h <= 71000) {
    T = 270.65 - 0.0028 * (h - 51000);
    p = P51 * Math.pow(T / 270.65, G / (0.0028 * R));
  } else if (h <= 86000) {
    T = 214.65 - 0.002 * (h - 71000);
    p = P71 * Math.pow(T / 214.65, G / (0.002 * R));
  } else {
    // above 86 km: next to nothing, thinning by a factor of e every 5.6 km
    T = 186.87;
    p = P86 * Math.exp(-(h - 86000) / 5600);
  }
  const rho = p / (R * T);
  out.T = T;
  out.p = p;
  out.rho = rho;
  out.a = Math.sqrt(GAMMA * R * T);
  out.sigma = rho / RHO0;
  out.delta = p / P0;
  return out;
}

// pressure at each layer boundary, carried up from sea level so the layers join exactly
const P11 = P0 * Math.pow(216.65 / T0, G / (0.0065 * R));
const P20 = P11 * Math.exp((-G * 9000) / (R * 216.65));
const P32 = P20 * Math.pow(228.65 / 216.65, -G / (0.001 * R));
const P47 = P32 * Math.pow(270.65 / 228.65, -G / (0.0028 * R));
const P51 = P47 * Math.exp((-G * 4000) / (R * 270.65));
const P71 = P51 * Math.pow(214.65 / 270.65, G / (0.0028 * R));
const P86 = P71 * Math.pow(184.65 / 214.65, G / (0.002 * R));

/** Calibrated airspeed (m/s) from true airspeed at altitude (compressible). */
export function casFromTas(tas: number, alt: number): number {
  const at = atmosphere(alt, scratch);
  const M = tas / at.a;
  // impact pressure from isentropic (subsonic) / Rayleigh pitot (supersonic)
  let qc: number;
  if (M < 1) {
    qc = at.p * (Math.pow(1 + 0.2 * M * M, 3.5) - 1);
  } else {
    qc = at.p * ((166.92158 * Math.pow(M, 7)) / Math.pow(7 * M * M - 1, 2.5) - 1);
  }
  // invert at sea level (subsonic formula; fine up to ~Mach 1 CAS)
  const cas = A0 * Math.sqrt(5 * (Math.pow(qc / P0 + 1, 2 / 7) - 1));
  return cas;
}

const scratch: AtmoState = { T: 0, p: 0, rho: 0, a: 0, sigma: 0, delta: 0 };
