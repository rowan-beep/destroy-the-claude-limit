// Global units and world constants. The simulation runs in SI units
// (metres, kilograms, seconds, newtons). Display code converts to the
// aviation units pilots expect (knots, feet, nautical miles, pounds).

export const NM = 1852; // metres per nautical mile
export const FT = 0.3048; // metres per foot
export const KT = 0.514444; // metres/second per knot
export const LB = 0.45359237; // kilograms per pound (mass)
export const LBF = 4.44822162; // newtons per pound-force
export const G0 = 9.80665; // standard gravity m/s^2
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Earth radius used for radar-horizon / line-of-sight maths. */
export const EARTH_RADIUS = 6371000;
/** Standard 4/3 effective-earth factor for radar refraction. */
export const RADAR_K_FACTOR = 4 / 3;

/** The theater is a 400 x 400 nautical mile square centred on the origin. */
export const MAP_SIZE_NM = 400;
export const MAP_SIZE = MAP_SIZE_NM * NM; // 740,800 m
export const MAP_HALF = MAP_SIZE / 2;

/** Terrain seed. Deterministic so every worker and every run agrees. */
export const WORLD_SEED = 1337;

/** Fixed physics step. */
export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;

export const SEA_LEVEL = 0;

/** Highest terrain point anywhere, used for fast LOS rejection. */
export const MAX_TERRAIN_HEIGHT = 5600;

export type Team = 'blue' | 'red';

export function otherTeam(t: Team): Team {
  return t === 'blue' ? 'red' : 'blue';
}

/** Convert map coordinates (nautical miles, x east / y north) into world metres. */
export function nmToWorld(xNm: number, yNm: number): { x: number; z: number } {
  return { x: xNm * NM, z: -yNm * NM };
}
