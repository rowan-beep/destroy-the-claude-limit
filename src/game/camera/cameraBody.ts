// The airshow photographer's camera body: every setting a real one has, and what
// each does to the picture.
//
//  - exposure: aperture (f-stop), shutter speed and ISO, set by the mode (Auto, P, A,
//    S, M or a scene mode) against what the meter reads (matrix, centre-weighted or
//    spot), with exposure compensation on top. The meter reads the scene the game is
//    drawing: the sky's brightness for the time of day, weather and where you point,
//    and the jet (darker than the sky: a jet against the sky is the classic case for
//    spot metering or +1 EV).
//  - focus: AF-S (focus, then fire), AF-C (follows the jet continuously, the lens motor
//    taking its time on a long lens), AF-A (C for a moving jet, S for a parked one) or
//    manual; the focus area (one point, a zone, or the whole frame with aircraft
//    detection). A jet that is not at the focus distance comes out soft.
//  - drive: single, continuous low and high, self-timer, interval timer.
//  - colour: white balance (auto, presets or Kelvin), picture styles and film looks,
//    the colour space (sRGB or Adobe RGB, written with its profile).
//  - file: JPEG, RAW (lossless, unprocessed) or both.
//  - aids: image stabilisation (off, on, sport), lens corrections.

import type { TimeOfDay } from '../../render/environment';

export type Mode = 'auto' | 'P' | 'A' | 'S' | 'M' | 'sports' | 'portrait' | 'landscape' | 'night';
export type Metering = 'matrix' | 'centre' | 'spot';
export type AfMode = 'AF-S' | 'AF-C' | 'AF-A' | 'MF';
export type AfArea = 'point' | 'zone' | 'wide';
export type Drive = 'single' | 'low' | 'high' | 'timer2' | 'timer10' | 'interval';
export type WbPreset = 'auto' | 'daylight' | 'cloudy' | 'shade' | 'tungsten' | 'fluorescent' | 'kelvin';
export type Style = 'standard' | 'vivid' | 'portrait' | 'landscape' | 'neutral' | 'mono' | 'chrome' | 'velvia' | 'acros';
export type FileFormat = 'jpeg' | 'raw' | 'raw+jpeg';
export type ColourSpace = 'srgb' | 'adobe';
export type Stabiliser = 'off' | 'on' | 'sport';

export interface CameraSettings {
  mode: Mode;
  /** f-number */
  aperture: number;
  /** seconds */
  shutter: number;
  /** 0 = auto ISO */
  iso: number;
  ev: number;
  metering: Metering;
  af: AfMode;
  area: AfArea;
  /** manual focus distance (m) */
  mfDist: number;
  drive: Drive;
  /** seconds between frames on the interval timer */
  interval: number;
  wb: WbPreset;
  kelvin: number;
  style: Style;
  format: FileFormat;
  space: ColourSpace;
  is: Stabiliser;
  lensCorr: boolean;
}

export const APERTURES = [1.4, 1.8, 2, 2.8, 3.5, 4, 4.5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 16, 22];
/** shutter speeds (s): 1/8000 down to 1 s, in third stops */
export const SHUTTERS = [
  1 / 8000, 1 / 6400, 1 / 5000, 1 / 4000, 1 / 3200, 1 / 2500, 1 / 2000, 1 / 1600, 1 / 1250, 1 / 1000, 1 / 800, 1 / 640, 1 / 500, 1 / 400, 1 / 320, 1 / 250, 1 / 200, 1 / 160, 1 / 125, 1 / 100, 1 / 80, 1 / 60,
  1 / 50, 1 / 40, 1 / 30, 1 / 25, 1 / 20, 1 / 15, 1 / 13, 1 / 10, 1 / 8, 1 / 6, 1 / 5, 1 / 4, 0.3, 0.4, 0.5, 0.6, 0.8, 1,
];
export const ISOS = [100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 25600];
export const WB_K: Record<Exclude<WbPreset, 'auto' | 'kelvin'>, number> = { daylight: 5500, cloudy: 6500, shade: 7500, tungsten: 3200, fluorescent: 4000 };

export const MODE_NAMES: Record<Mode, string> = {
  auto: 'AUTO', P: 'P · PROGRAM', A: 'A · APERTURE PRIORITY', S: 'S · SHUTTER PRIORITY', M: 'M · MANUAL',
  sports: 'SCENE · SPORTS', portrait: 'SCENE · PORTRAIT', landscape: 'SCENE · LANDSCAPE', night: 'SCENE · NIGHT',
};
export const STYLE_NAMES: Record<Style, string> = {
  standard: 'STANDARD', vivid: 'VIVID', portrait: 'PORTRAIT', landscape: 'LANDSCAPE', neutral: 'NEUTRAL', mono: 'MONOCHROME',
  chrome: 'CLASSIC CHROME', velvia: 'VELVIA', acros: 'ACROS',
};

/** what each picture style does: contrast, saturation, black lift, warmth, mono, extra grain */
export const STYLE_LOOK: Record<Style, { con: number; sat: number; lift: number; warm: number; mono: number; grain: number }> = {
  standard: { con: 1.04, sat: 1.05, lift: 0, warm: 0, mono: 0, grain: 0 },
  vivid: { con: 1.12, sat: 1.32, lift: 0, warm: 0.01, mono: 0, grain: 0 },
  portrait: { con: 0.97, sat: 0.94, lift: 0.01, warm: 0.035, mono: 0, grain: 0 },
  landscape: { con: 1.1, sat: 1.22, lift: 0, warm: -0.01, mono: 0, grain: 0 },
  neutral: { con: 0.9, sat: 0.88, lift: 0.01, warm: 0, mono: 0, grain: 0 },
  mono: { con: 1.08, sat: 0, lift: 0, warm: 0, mono: 1, grain: 0 },
  chrome: { con: 1.07, sat: 0.78, lift: 0.035, warm: 0.01, mono: 0, grain: 0.004 },
  velvia: { con: 1.16, sat: 1.48, lift: 0, warm: 0.015, mono: 0, grain: 0 },
  acros: { con: 1.14, sat: 0, lift: 0.02, warm: 0, mono: 1, grain: 0.012 },
};

export function defaultSettings(): CameraSettings {
  return {
    mode: 'S', aperture: 5.6, shutter: 1 / 1000, iso: 0, ev: 0, metering: 'matrix', af: 'AF-C', area: 'zone', mfDist: 800, drive: 'single', interval: 2,
    wb: 'auto', kelvin: 5500, style: 'standard', format: 'jpeg', space: 'srgb', is: 'sport', lensCorr: true,
  };
}

const KEY = 'triad.camera.v1';
export function loadSettings(): CameraSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object') return { ...defaultSettings(), ...s };
  } catch {
    /* (defaults) */
  }
  return defaultSettings();
}
export function saveSettings(s: CameraSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* (this session only) */
  }
}

export const fmtShutter = (t: number) => (t >= 0.3 ? `${t % 1 ? t.toFixed(1) : t}"` : `1/${Math.round(1 / t)}`);
export const fmtAperture = (n: number) => `f/${n % 1 ? n.toFixed(1) : n}`;
export const fmtEv = (e: number) => `${e > 0 ? '+' : e < 0 ? '−' : '±'}${Math.abs(e).toFixed(1)}`;

/** the nearest value in a list */
export const nearest = (list: number[], v: number) => list.reduce((b, x) => (Math.abs(Math.log(x / v)) < Math.abs(Math.log(b / v)) ? x : b), list[0]);

/** the widest aperture of the zoom at a focal length (a 24-70 f/2.8, a 70-200 f/2.8, then f/4 and f/5.6 glass) */
export function maxAperture(focal: number): number {
  return focal <= 200 ? 2.8 : focal <= 600 ? 4 : 5.6;
}

/** EV100 of a setting: log2(N² / t) − log2(ISO / 100) */
export function evOf(n: number, t: number, iso: number): number {
  return Math.log2((n * n) / t) - Math.log2(iso / 100);
}

/**
 * The light, in EV100: what the game's own picture is exposed for (`ref`: an even
 * daylight scene at this time of day and weather), the sky where the camera points
 * (brighter toward the sun), and a jet against it (its shaded side to you when it
 * is between you and the sun). `backlit` is 0..1.
 */
export function sceneLight(tod: TimeOfDay, gloom: number, viewPitch: number, sunAngle: number, dark: boolean): { sky: number; subject: number; ref: number; backlit: number } {
  const base: Record<TimeOfDay, number> = { dawn: 11.5, morning: 14, noon: 15, afternoon: 14.5, dusk: 11.5 };
  let ref = base[tod] - gloom * 3;
  if (dark) ref = 3;
  const backlit = Math.pow(Math.max(0, Math.cos(sunAngle)), 8);
  const sky = ref + 0.3 - 0.4 * Math.max(0, Math.sin(viewPitch)) + 2.4 * backlit;
  return { sky, subject: ref - 0.2 - 1.4 * backlit, ref, backlit };
}

export interface Exposure {
  aperture: number;
  shutter: number;
  iso: number;
  /** what the meter wants (EV100 for a mid-grey) */
  metered: number;
  /** what the exposure meter shows: this setting against what the meter wants (stops, + is brighter) */
  bias: number;
  /** the brightness of the picture against the game's own frame (a multiplier) */
  gain: number;
}

/**
 * Settle the exposure: the mode chooses what the photographer left to the camera.
 * `subjectWeight` is how much of the metered area is the jet (0..1).
 */
export function solveExposure(s: CameraSettings, light: { sky: number; subject: number; ref: number }, subjectWeight: number, focal: number): Exposure {
  const w = s.metering === 'spot' ? subjectWeight : s.metering === 'centre' ? subjectWeight * 0.55 : subjectWeight * 0.18;
  const metered = light.sky * (1 - w) + light.subject * w;
  const target = metered - (s.mode === 'M' ? 0 : s.ev);
  const amax = maxAperture(focal);
  const clampA = (n: number) => nearest(APERTURES.filter((x) => x >= amax), Math.max(amax, n));
  const clampT = (t: number) => nearest(SHUTTERS, Math.min(1, Math.max(1 / 8000, t)));
  const isoFor = (n: number, t: number) => nearest(ISOS, Math.min(25600, Math.max(100, (100 * (n * n)) / t / Math.pow(2, target))));
  let n = clampA(s.aperture), t = clampT(s.shutter), iso = s.iso || 100;
  // (one over the focal length is the slowest a hand-held long lens stays sharp)
  const handheld = Math.min(1 / 60, 1 / Math.max(60, focal * (s.is === 'off' ? 1 : 0.25)));
  switch (s.mode) {
    case 'auto':
    case 'P':
    case 'sports':
    case 'landscape':
    case 'night':
    case 'portrait': {
      const pref = s.mode === 'sports' ? { n: amax, t: 1 / 2000 } : s.mode === 'landscape' ? { n: 8, t: handheld } : s.mode === 'portrait' ? { n: amax, t: handheld } : s.mode === 'night' ? { n: amax, t: 1 / 30 } : { n: Math.max(amax, 5.6), t: Math.max(1 / 1000, handheld) };
      n = clampA(pref.n);
      iso = s.iso && s.mode !== 'auto' && s.mode !== 'sports' && s.mode !== 'night' ? s.iso : 100;
      // the shutter from the light; if it is too slow at base ISO, the ISO comes up
      t = clampT((n * n) / Math.pow(2, target) / (iso / 100));
      if (t > pref.t && !(s.iso && s.mode === 'P')) {
        t = clampT(pref.t);
        iso = isoFor(n, t);
      }
      break;
    }
    case 'A':
      if (!s.iso) iso = 100;
      t = clampT((n * n) / Math.pow(2, target) / (iso / 100));
      if (!s.iso && t > handheld) {
        t = clampT(handheld);
        iso = isoFor(n, t);
      }
      break;
    case 'S': {
      if (!s.iso) iso = isoFor(amax, t);
      // the aperture from the light (wide open first, then the ISO comes up)
      const n2 = Math.sqrt(Math.pow(2, target) * t * (iso / 100));
      n = clampA(n2);
      if (!s.iso) iso = isoFor(n, t);
      break;
    }
    case 'M':
      if (!s.iso) iso = isoFor(n, t);
      break;
  }
  const actual = evOf(n, t, iso);
  // (the game's own picture is gain 1: a frame exposed for the reference light)
  return { aperture: n, shutter: t, iso, metered, bias: metered - actual, gain: Math.pow(2, light.ref - actual) };
}

/** the colour temperature of the light (K) */
export function sceneKelvin(tod: TimeOfDay, gloom: number): number {
  const k: Record<TimeOfDay, number> = { dawn: 3600, morning: 4900, noon: 5600, afternoon: 5200, dusk: 3400 };
  return k[tod] + gloom * 1200;
}

/** the colour of a black body at `k` kelvin (linear RGB, green = 1) */
export function kelvinRgb(k: number): [number, number, number] {
  const t = k / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const lin = (v: number) => Math.pow(Math.max(0, Math.min(255, v)) / 255, 2.2);
  const R = lin(r), G = lin(g), B = lin(b);
  return [R / G, 1, B / G];
}

/** white balance gains: the setting's white made neutral (relative to daylight, what the game draws) */
export function wbGains(s: CameraSettings, scene: number): [number, number, number] {
  const k = s.wb === 'auto' ? 5500 + (scene - 5500) * 0.55 : s.wb === 'kelvin' ? s.kelvin : WB_K[s.wb];
  const set = kelvinRgb(k), day = kelvinRgb(5500);
  const g: [number, number, number] = [day[0] / set[0], 1, day[2] / set[2]];
  // keep the brightness: the gains average to one
  const m = (g[0] + g[1] + g[2]) / 3;
  return [g[0] / m, g[1] / m, g[2] / m];
}
