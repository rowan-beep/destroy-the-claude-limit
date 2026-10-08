// Player settings, persisted per browser (best effort: storage may be blocked).

import { detectTier } from './gpuTier';
import { defaultInputSettings, InputSettings, DEFAULT_BINDINGS, Action } from './input';
import type { TimeOfDay } from '../render/environment';

export interface GameSettings {
  graphics: GraphicsOptions;
  audio: { master: number; engine: number; effects: number; warnings: number; voice: boolean };
  gameplay: {
    labels: 'off' | 'dots' | 'full';
    units: 'imperial' | 'metric';
    autoCountermeasures: boolean;
    timeOfDay: TimeOfDay;
    showHelp: boolean;
    realisticFuel: boolean;
    cameraRoll: boolean;
    touchControls: 'auto' | 'on' | 'off';
    /** show the 2D info panels in the cockpit view (off: the 3D HUD and displays only) */
    cockpitPanels: boolean;
    /** how much G, turbulence and the engines move the pilot's head, 0..1 */
    headMotion: number;
  };
  input: InputSettings;
  lastAircraft: string;
  lastLoadout: Record<string, string>;
}

export type Tier = 'low' | 'medium' | 'high' | 'ultra';
export type GraphicsPreset = Tier | 'ultra4k' | 'custom';

export interface GraphicsOptions {
  /** overall preset; becomes 'custom' as soon as a preset-driven option is changed */
  preset: GraphicsPreset;
  /** world detail: terrain LOD, tree distance */
  quality: Tier;
  /** render resolution target: native screen pixels or a fixed height (2160 = 4K) */
  resolution: 'native' | '1080' | '1440' | '2160';
  /** extra scale on top of the resolution (0.5 - 1) */
  resolutionScale: number;
  /** MSAA samples */
  antialias: 0 | 2 | 4 | 8;
  shadows: 'off' | Tier;
  /** mountains cast sun shadows and darken the sky light in valleys */
  terrainLighting: boolean;
  /** bloom strength, 0 = off */
  bloom: number;
  /** sun glow through the haze, silver-lined clouds */
  lightScattering: boolean;
  toneMapping: 'neutral' | 'aces' | 'agx';
  /** brightness (tone-mapping exposure) */
  exposure: number;
  contrast: number;
  saturation: number;
  vignette: boolean;
  fov: number;
  clouds: 'clear' | 'scattered' | 'broken' | 'overcast';
  cloudQuality: Tier;
  cloudShadows: boolean;
  /** the starting preset has been chosen for this device */
  autoTier?: boolean;
}

/** What each overall preset sets (personal picture options are left alone). */
export const GRAPHICS_PRESETS: Record<Exclude<GraphicsPreset, 'custom'>, Partial<GraphicsOptions>> = {
  low: { quality: 'low', resolution: 'native', resolutionScale: 0.75, antialias: 0, shadows: 'off', terrainLighting: false, bloom: 0, lightScattering: false, cloudQuality: 'low', cloudShadows: false },
  medium: { quality: 'medium', resolution: 'native', resolutionScale: 1, antialias: 2, shadows: 'medium', terrainLighting: true, bloom: 0.35, lightScattering: true, cloudQuality: 'medium', cloudShadows: false },
  high: { quality: 'high', resolution: 'native', resolutionScale: 1, antialias: 4, shadows: 'high', terrainLighting: true, bloom: 0.55, lightScattering: true, cloudQuality: 'high', cloudShadows: true },
  ultra: { quality: 'ultra', resolution: 'native', resolutionScale: 1, antialias: 8, shadows: 'ultra', terrainLighting: true, bloom: 0.65, lightScattering: true, cloudQuality: 'ultra', cloudShadows: true },
  ultra4k: { quality: 'ultra', resolution: '2160', resolutionScale: 1, antialias: 4, shadows: 'ultra', terrainLighting: true, bloom: 0.65, lightScattering: true, cloudQuality: 'ultra', cloudShadows: true },
};

export function defaultGraphics(): GraphicsOptions {
  return {
    preset: 'high',
    quality: 'high',
    resolution: 'native',
    resolutionScale: 1,
    antialias: 4,
    shadows: 'high',
    terrainLighting: true,
    bloom: 0.55,
    lightScattering: true,
    toneMapping: 'neutral',
    exposure: 1,
    contrast: 1,
    saturation: 1,
    vignette: true,
    fov: 70,
    clouds: 'scattered',
    cloudQuality: 'high',
    cloudShadows: true,
    autoTier: false,
  };
}

const KEY = 'triad-air-combat-settings-v1';

export function defaultSettings(): GameSettings {
  return {
    graphics: defaultGraphics(),
    audio: { master: 0.8, engine: 0.8, effects: 0.9, warnings: 0.9, voice: true },
    gameplay: {
      labels: 'dots',
      units: 'imperial',
      autoCountermeasures: true,
      timeOfDay: 'morning',
      showHelp: true,
      realisticFuel: true,
      cameraRoll: false,
      touchControls: 'auto',
      cockpitPanels: false,
      headMotion: 1,
    },
    input: defaultInputSettings(),
    lastAircraft: 'F15EX',
    lastLoadout: {},
  };
}

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object') return base;
  const out: Record<string, unknown> = Array.isArray(base) ? ([...(base as unknown[])] as never) : { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object') out[k] = merge(b, v);
    else if (v !== undefined && typeof v === typeof b) out[k] = v;
  }
  return out as T;
}

/** Pick the starting preset for this device (once). */
function fitToDevice(s: GameSettings, firstRun: boolean): void {
  const g = s.graphics;
  if (g.autoTier) return;
  g.autoTier = true;
  const tier = detectTier();
  // a new player, or one still on the untouched default: start on what this device can run
  if ((firstRun || g.preset === 'high') && (tier === 'low' || tier === 'medium')) {
    Object.assign(g, GRAPHICS_PRESETS[tier]);
    g.preset = tier;
  }
}

export function loadSettings(): GameSettings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      fitToDevice(d, true);
      return d;
    }
    const s = merge(d, JSON.parse(raw));
    fitToDevice(s, false);
    // make sure every action has a binding list (new actions after updates)
    for (const a of Object.keys(DEFAULT_BINDINGS) as Action[]) {
      if (!Array.isArray(s.input.bindings[a])) s.input.bindings[a] = [...DEFAULT_BINDINGS[a]];
    }
    return s;
  } catch {
    return d;
  }
}

export function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings live for this session only */
  }
}
