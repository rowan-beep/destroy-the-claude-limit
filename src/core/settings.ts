// Player settings, persisted per browser (best effort: storage may be blocked).

import { defaultInputSettings, InputSettings, DEFAULT_BINDINGS, Action } from './input';
import type { TimeOfDay } from '../render/environment';

export interface GameSettings {
  graphics: {
    quality: 'low' | 'medium' | 'high' | 'ultra';
    resolutionScale: number;
    shadows: boolean;
    fov: number;
    clouds: 'clear' | 'scattered' | 'broken';
  };
  audio: { master: number; engine: number; effects: number; warnings: number; voice: boolean };
  gameplay: {
    labels: 'off' | 'dots' | 'full';
    units: 'imperial' | 'metric';
    autoCountermeasures: boolean;
    timeOfDay: TimeOfDay;
    showHelp: boolean;
    realisticFuel: boolean;
    cameraRoll: boolean;
  };
  input: InputSettings;
  lastAircraft: string;
  lastLoadout: Record<string, string>;
}

const KEY = 'triad-air-combat-settings-v1';

export function defaultSettings(): GameSettings {
  return {
    graphics: { quality: 'high', resolutionScale: 1, shadows: true, fov: 70, clouds: 'scattered' },
    audio: { master: 0.8, engine: 0.8, effects: 0.9, warnings: 0.9, voice: true },
    gameplay: {
      labels: 'dots',
      units: 'imperial',
      autoCountermeasures: true,
      timeOfDay: 'morning',
      showHelp: true,
      realisticFuel: true,
      cameraRoll: false,
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

export function loadSettings(): GameSettings {
  const d = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = merge(d, JSON.parse(raw));
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
