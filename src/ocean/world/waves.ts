// The sea surface: a few long waves for the big shape, the same sum on the CPU
// (the hull floats on it, the camera knows which side of the water it is on)
// and in the water shader (the vertices), so both always agree. Fine ripples
// are shading only. Three authored weathers scale the same waves.

import { HARBOR } from './geo';

export type Weather = 'calm' | 'dawn' | 'overcast';

export interface WeatherDef {
  id: Weather;
  label: string;
  /** wave height scale */
  amp: number;
  /** ripple strength in the shading */
  chop: number;
  /** sun elevation (degrees) and azimuth (degrees, clockwise from north) */
  sunEl: number;
  sunAz: number;
  /** sky colours (linear-ish sRGB triplets 0..1): zenith, horizon */
  zenith: [number, number, number];
  horizon: [number, number, number];
  /** sunlight colour and strength */
  sun: [number, number, number];
  sunI: number;
  /** above-water haze distance (m) */
  haze: number;
  /** wind ambience level 0..1 */
  wind: number;
}

export const WEATHERS: Record<Weather, WeatherDef> = {
  calm: { id: 'calm', label: 'CALM DAYLIGHT', amp: 0.55, chop: 0.6, sunEl: 52, sunAz: 160, zenith: [0.2, 0.42, 0.78], horizon: [0.72, 0.84, 0.94], sun: [1, 0.96, 0.9], sunI: 3.0, haze: 5200, wind: 0.25 },
  dawn: { id: 'dawn', label: 'DAWN SWELL', amp: 1.0, chop: 0.8, sunEl: 7, sunAz: 100, zenith: [0.16, 0.22, 0.46], horizon: [0.98, 0.66, 0.46], sun: [1, 0.72, 0.48], sunI: 2.2, haze: 3800, wind: 0.4 },
  overcast: { id: 'overcast', label: 'OVERCAST, ROUGH', amp: 1.9, chop: 1.4, sunEl: 34, sunAz: 210, zenith: [0.62, 0.65, 0.7], horizon: [0.86, 0.88, 0.9], sun: [0.86, 0.88, 0.9], sunI: 1.3, haze: 2400, wind: 0.85 },
};

/** direction (deg, clockwise from north, the way the wave travels), wavelength (m), amplitude (m), phase */
const BASE: [number, number, number, number][] = [
  [200, 64, 0.5, 0.0],
  [225, 37, 0.26, 1.9],
  [170, 21, 0.14, 4.3],
  [250, 12, 0.07, 2.2],
];

const G = 9.81;
const DEG = Math.PI / 180;

export const WAVE_TABLE = BASE.map(([dir, len, amp, ph]) => {
  const k = (2 * Math.PI) / len;
  return { kx: Math.sin(dir * DEG) * k, kz: -Math.cos(dir * DEG) * k, w: Math.sqrt(G * k), amp, ph, len };
});

const SHELTER = 0.2;
const SHELTER_EDGE = 45;
/** the breakwater's shelter: inside the basin the swell is a fifth of the open sea's, easing in over 45 m */
export function shelterAt(x: number, z: number): number {
  const b = HARBOR.basin;
  const inside = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
  if (inside <= 0) return 1;
  const k = Math.min(1, inside / SHELTER_EDGE);
  return 1 - (1 - SHELTER) * k * k * (3 - 2 * k);
}

/** sea surface height (m) at x, z and time t, for weather amplitude scale `amp` */
export function surfaceHeight(x: number, z: number, t: number, amp: number): number {
  let h = 0;
  const a = amp * shelterAt(x, z);
  for (const s of WAVE_TABLE) h += s.amp * a * Math.sin(s.kx * x + s.kz * z - s.w * t + s.ph);
  return h;
}

/** surface slope (dh/dx, dh/dz) for floating attitude */
export function surfaceSlope(x: number, z: number, t: number, amp: number): [number, number] {
  let dx = 0, dz = 0;
  const a = amp * shelterAt(x, z);
  for (const s of WAVE_TABLE) {
    const c = s.amp * a * Math.cos(s.kx * x + s.kz * z - s.w * t + s.ph);
    dx += c * s.kx;
    dz += c * s.kz;
  }
  return [dx, dz];
}

/** the same waves in GLSL: vec3(height, dh/dx, dh/dz); uniforms `time`, `waveAmp`; far waves fade by `dist` */
export function wavesGlsl(): string {
  const lines = WAVE_TABLE.map(
    (s) =>
      `  { float f = 1.0 - smoothstep( ${(s.len * 6).toFixed(1)}, ${(s.len * 30).toFixed(1)}, dist ); float a = ${s.amp.toFixed(3)} * waveAmp * f;` +
      ` float q = ${s.kx.toFixed(6)} * p.x + ${s.kz.toFixed(6)} * p.y - ${s.w.toFixed(6)} * t + ${s.ph.toFixed(3)};` +
      ` h += a * sin( q ); d += a * cos( q ) * vec2( ${s.kx.toFixed(6)}, ${s.kz.toFixed(6)} ); }`,
  );
  const b = HARBOR.basin;
  return `
float oceanShelter( vec2 p ) {
  float inside = min( min( p.x - ${b.minX.toFixed(1)}, ${b.maxX.toFixed(1)} - p.x ), min( p.y - ${b.minZ.toFixed(1)}, ${b.maxZ.toFixed(1)} - p.y ) );
  if ( inside <= 0.0 ) return 1.0;
  return 1.0 - ${(1 - SHELTER).toFixed(3)} * smoothstep( 0.0, ${SHELTER_EDGE.toFixed(1)}, inside );
}
vec3 oceanWaves( vec2 p, float t, float dist ) {
  float h = 0.0; vec2 d = vec2( 0.0 );
  float waveAmpS = waveAmp * oceanShelter( p );
${lines.join('\n').replace(/waveAmp \* f/g, 'waveAmpS * f')}
  return vec3( h, d );
}
`;
}
