// The sea surface: a few long waves for the big shape, the same sum on the CPU
// (the hull floats on it, the camera knows which side of the water it is on)
// and in the water shader (the vertices), so both always agree. Fine ripples
// are shading only. The weather the player picks (time of day, sky, sea) and
// the benchmark's three fixed ones scale the same waves.

import { HARBOR } from './geo';

/** the benchmark's fixed weathers (its route always runs through the same three) */
export type Weather = 'calm' | 'dawn' | 'overcast';

export interface WeatherDef {
  /** a named weather, or the player's pick as `time/sky/sea` */
  id: string;
  label: string;
  /** wave height scale */
  amp: number;
  /** ripple strength in the shading */
  chop: number;
  /** sun elevation (degrees) and azimuth (degrees, clockwise from north) */
  sunEl: number;
  sunAz: number;
  /** sky colours (linear-ish sRGB triplets 0..1): zenith, horizon (the light the sky throws down) */
  zenith: [number, number, number];
  horizon: [number, number, number];
  /** the air the sky is drawn through: turbidity (haze), Rayleigh scale, Mie coefficient */
  air: [number, number, number];
  /** clouds: cumulus cover 0..1, and 1 for an overcast deck instead */
  clouds: [number, number];
  /** sunlight colour and strength */
  sun: [number, number, number];
  sunI: number;
  /** above-water haze distance (m) */
  haze: number;
  /** wind ambience level 0..1 */
  wind: number;
}

export const WEATHERS: Record<Weather, WeatherDef> = {
  calm: { id: 'calm', label: 'CALM DAYLIGHT', amp: 0.55, chop: 0.6, sunEl: 52, sunAz: 160, zenith: [0.2, 0.42, 0.78], horizon: [0.72, 0.84, 0.94], air: [2.2, 1.5, 0.003], clouds: [0.32, 0], sun: [1, 0.96, 0.9], sunI: 3.0, haze: 5200, wind: 0.25 },
  dawn: { id: 'dawn', label: 'DAWN SWELL', amp: 1.0, chop: 0.8, sunEl: 7, sunAz: 100, zenith: [0.16, 0.22, 0.46], horizon: [0.98, 0.66, 0.46], air: [3.2, 2.0, 0.005], clouds: [0.42, 0], sun: [1, 0.72, 0.48], sunI: 2.2, haze: 3800, wind: 0.4 },
  overcast: { id: 'overcast', label: 'OVERCAST, ROUGH', amp: 1.9, chop: 1.4, sunEl: 34, sunAz: 210, zenith: [0.62, 0.65, 0.7], horizon: [0.86, 0.88, 0.9], air: [8, 1.0, 0.01], clouds: [1, 1], sun: [0.86, 0.88, 0.9], sunI: 1.3, haze: 2400, wind: 0.85 },
};

// ---------------------------------------------------------------- the player's weather
export type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'sunset';
export type SkyKind = 'clear' | 'fair' | 'cloudy' | 'overcast';
export type SeaState = 'calm' | 'moderate' | 'rough';
export interface WeatherPick {
  time: TimeOfDay;
  sky: SkyKind;
  sea: SeaState;
}

/** bright midday, a few clouds, a calm sea */
export const DEFAULT_WEATHER: WeatherPick = { time: 'noon', sky: 'fair', sea: 'calm' };

export const TIMES: [TimeOfDay, string][] = [['dawn', 'Dawn'], ['morning', 'Morning'], ['noon', 'Noon'], ['afternoon', 'Afternoon'], ['sunset', 'Sunset']];
export const SKIES: [SkyKind, string][] = [['clear', 'Clear'], ['fair', 'Fair'], ['cloudy', 'Cloudy'], ['overcast', 'Overcast']];
export const SEAS: [SeaState, string][] = [['calm', 'Calm'], ['moderate', 'Moderate'], ['rough', 'Rough']];

type RGB = [number, number, number];
/** the sun through the day: elevation, azimuth, colour, strength, the sky's zenith and horizon, the air (turbidity, Rayleigh, Mie) */
const TIME_DEF: Record<TimeOfDay, { el: number; az: number; sun: RGB; sunI: number; zenith: RGB; horizon: RGB; air: RGB; haze: number }> = {
  dawn: { el: 7, az: 100, sun: [1, 0.72, 0.48], sunI: 2.2, zenith: [0.16, 0.22, 0.46], horizon: [0.98, 0.66, 0.46], air: [3.2, 2.0, 0.005], haze: 0.75 },
  morning: { el: 27, az: 122, sun: [1, 0.9, 0.78], sunI: 2.8, zenith: [0.17, 0.38, 0.76], horizon: [0.78, 0.84, 0.92], air: [2.5, 1.6, 0.004], haze: 0.95 },
  noon: { el: 60, az: 172, sun: [1, 0.97, 0.92], sunI: 3.2, zenith: [0.17, 0.42, 0.84], horizon: [0.7, 0.83, 0.96], air: [2.0, 1.5, 0.003], haze: 1 },
  afternoon: { el: 33, az: 232, sun: [1, 0.92, 0.8], sunI: 2.9, zenith: [0.19, 0.4, 0.8], horizon: [0.78, 0.84, 0.92], air: [2.3, 1.6, 0.0035], haze: 0.95 },
  sunset: { el: 5, az: 262, sun: [1, 0.6, 0.36], sunI: 2.1, zenith: [0.14, 0.18, 0.42], horizon: [1, 0.58, 0.38], air: [3.6, 2.2, 0.006], haze: 0.7 },
};
const SKY_DEF: Record<SkyKind, { clouds: [number, number]; haze: number }> = {
  clear: { clouds: [0.06, 0], haze: 1.15 },
  fair: { clouds: [0.32, 0], haze: 1 },
  cloudy: { clouds: [0.68, 0], haze: 0.8 },
  overcast: { clouds: [1, 1], haze: 0.5 },
};
const SEA_DEF: Record<SeaState, { amp: number; chop: number; wind: number }> = {
  calm: { amp: 0.5, chop: 0.6, wind: 0.22 },
  moderate: { amp: 1.0, chop: 0.85, wind: 0.45 },
  rough: { amp: 1.9, chop: 1.4, wind: 0.85 },
};

const isKey = <T extends string>(v: unknown, list: [T, string][]): v is T => list.some(([k]) => k === v);

/** a stored weather, as it is now or as it was (one of the three names) */
export function readWeather(v: unknown): WeatherPick {
  if (v && typeof v === 'object') {
    const o = v as Partial<WeatherPick>;
    return {
      time: isKey(o.time, TIMES) ? o.time : DEFAULT_WEATHER.time,
      sky: isKey(o.sky, SKIES) ? o.sky : DEFAULT_WEATHER.sky,
      sea: isKey(o.sea, SEAS) ? o.sea : DEFAULT_WEATHER.sea,
    };
  }
  // (before 6.4.1 there were three: 'calm' and 'overcast' carry over; 'dawn' was everyone's default, so it gives way to the bright midday)
  if (v === 'calm') return { time: 'noon', sky: 'fair', sea: 'calm' };
  if (v === 'overcast') return { time: 'afternoon', sky: 'overcast', sea: 'rough' };
  return { ...DEFAULT_WEATHER };
}

export const weatherId = (p: WeatherPick): string => `${p.time}/${p.sky}/${p.sea}`;

const labelOf = <T extends string>(v: T, list: [T, string][]) => list.find(([k]) => k === v)?.[1] ?? v;

/** the weather the player picked, worked out in full */
export function weatherOf(p: WeatherPick): WeatherDef {
  const t = TIME_DEF[p.time], k = SKY_DEF[p.sky], m = SEA_DEF[p.sea];
  const over = p.sky === 'overcast';
  // under a cloud deck the light is grey and soft, the sky a flat pale grey
  const grey = (c: RGB, g: number): RGB => [c[0] * 0.25 + g * 0.75, c[1] * 0.25 + g * 0.75, c[2] * 0.25 + g * 0.75];
  const dim = p.sky === 'cloudy' ? 0.85 : 1;
  return {
    id: weatherId(p),
    label: `${labelOf(p.time, TIMES)} · ${labelOf(p.sky, SKIES)} · ${labelOf(p.sea, SEAS)} sea`,
    amp: m.amp,
    chop: m.chop,
    sunEl: t.el,
    sunAz: t.az,
    zenith: over ? grey(t.zenith, 0.64) : t.zenith,
    horizon: over ? grey(t.horizon, 0.86) : t.horizon,
    air: over ? [8, 1.0, 0.01] : t.air,
    clouds: k.clouds,
    sun: over ? grey(t.sun, 0.88) : t.sun,
    sunI: t.sunI * (over ? 0.42 : dim),
    haze: Math.round(5200 * t.haze * k.haze),
    wind: m.wind,
  };
}

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
