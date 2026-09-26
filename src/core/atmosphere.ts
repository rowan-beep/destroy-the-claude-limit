// International Standard Atmosphere up to 32 km. Everything the flight
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
  const h = Math.max(-500, Math.min(altitudeM, 32000));
  let T: number, p: number;
  if (h <= 11000) {
    T = T0 - 0.0065 * h;
    p = P0 * Math.pow(T / T0, G / (0.0065 * R));
  } else if (h <= 20000) {
    T = 216.65;
    const p11 = 22632.06;
    p = p11 * Math.exp((-G * (h - 11000)) / (R * T));
  } else {
    const p20 = 5474.889;
    T = 216.65 + 0.001 * (h - 20000);
    p = p20 * Math.pow(T / 216.65, -G / (0.001 * R));
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
