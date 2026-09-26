// Wind and turbulence.
//
// A steady wind that strengthens and veers with height (power-law boundary
// layer), plus turbulence from smooth noise: light chop at altitude, rougher
// mechanical turbulence low over land, and rotor downwind of high terrain.
// Flight models fly through the air mass, so wind drifts you, gusts bump
// the nose and wings, and a crosswind has to be flown on approach.

import * as THREE from 'three';
import { Simplex2 } from './noise';
import { KT, DEG } from './constants';
import { clamp } from './math';

const N1 = new Simplex2(911);
const N2 = new Simplex2(4127);
const N3 = new Simplex2(7703);

export interface WindState {
  /** direction the wind blows FROM (deg true) and speed at the surface */
  fromDeg: number;
  surfaceKts: number;
  /** 0 = calm air, 1 = normal, 2 = rough */
  turbulence: number;
}

export const wind: WindState = { fromDeg: 250, surfaceKts: 10, turbulence: 1 };

/** Pick a fresh wind for a mission. */
export function randomizeWind(rnd: () => number = Math.random): void {
  wind.fromDeg = Math.round(rnd() * 360);
  wind.surfaceKts = Math.round(4 + rnd() * rnd() * 22);
  wind.turbulence = 0.6 + rnd() * 0.8;
}

/**
 * Air-mass velocity (m/s, world frame) at a point. `agl` is height above the
 * ground below, `ground` the terrain height there (for mountain rotor).
 */
export function windAt(x: number, y: number, z: number, t: number, agl: number, ground: number, out: THREE.Vector3): THREE.Vector3 {
  const h = Math.max(0, y);
  // boundary-layer growth and veer with height
  const speed = wind.surfaceKts * KT * clamp(Math.pow(1 + h / 600, 0.28), 1, 2.6);
  const dir = (wind.fromDeg + 25 * clamp(h / 6000, 0, 1)) * DEG;
  // "from" direction -> the air moves the opposite way
  out.set(-Math.sin(dir) * speed, 0, Math.cos(dir) * speed);
  if (wind.turbulence <= 0) return out;
  // turbulence intensity (m/s): chop aloft, mechanical near the ground, rotor over peaks
  const low = 1 - clamp(agl / 1200, 0, 1);
  const land = ground > 5 ? 1 : 0.45;
  const rotor = clamp((ground - 350) / 900, 0, 1) * (1 - clamp(agl / 1500, 0, 1));
  const sigma = wind.turbulence * (0.35 + low * land * (0.9 + wind.surfaceKts * 0.07) + rotor * 2.2);
  // advect the eddies with the wind, scale ~ 150-400 m
  const L = 180 + clamp(agl, 0, 3000) * 0.07;
  const ax = (x - out.x * t) / L;
  const az = (z - out.z * t) / L;
  const ay = y / (L * 0.6);
  out.x += sigma * (N1.noise(ax + t * 0.05, ay) + 0.5 * N1.noise(ax * 2.3, az * 2.3 + ay));
  out.z += sigma * (N2.noise(az - t * 0.05, ay + 3.1) + 0.5 * N2.noise(az * 2.3, ax * 2.3 - ay));
  out.y += sigma * 0.75 * (N3.noise(ax + ay, az) + 0.5 * N3.noise(ax * 2.1 - t * 0.1, az * 2.1));
  return out;
}

/** Headwind / crosswind components (kt) for a runway heading at the surface. */
export function runwayWind(runwayHeadingDeg: number): { head: number; cross: number } {
  const rel = (wind.fromDeg - runwayHeadingDeg) * DEG;
  return { head: wind.surfaceKts * Math.cos(rel), cross: wind.surfaceKts * Math.sin(rel) };
}
