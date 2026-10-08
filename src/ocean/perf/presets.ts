// Quality presets for the ocean. They change only what is cosmetic: render
// scale, water and seabed detail, how far decorative scenery streams, particles,
// foam, light shafts, caustics, shadows and the reef's density. Mission objects,
// collision, sonar returns and the acoustic model are identical on all three:
// every clue survives the cheapest preset.

export type OceanPreset = 'performance' | 'balanced' | 'cinematic';

export interface PresetDef {
  id: OceanPreset;
  label: string;
  blurb: string;
  /** the scene's render scale (the HUD and menus stay at full resolution) */
  renderScale: number;
  /** water surface grid: rings and radial segments */
  waterRings: number;
  waterSegs: number;
  /** seabed LOD distances (m): the finest mesh, then each coarser step */
  lod: [number, number, number, number];
  /** chunks built per frame at most (milliseconds of work) */
  buildBudgetMs: number;
  /** suspended particles round the camera */
  snow: number;
  /** silt puffs the thrusters can stir up at once */
  silt: number;
  /** bubble pool */
  bubbles: number;
  /** foam on crests, the shore and the wake */
  foam: boolean;
  /** light shafts near the surface */
  shafts: boolean;
  /** caustic light on the shallow seabed */
  caustics: boolean;
  /** the sea bed close up: 1 colour detail, 2 colour and relief (ripples, rock, burrows) */
  seabedDetail: number;
  /** the lamps cast shadows (size of the map, 0 = none) */
  shadowMap: number;
  /** decorative reef and kelp density (0..1) */
  decor: number;
  /** fish in each school */
  fish: number;
}

export const PRESETS: Record<OceanPreset, PresetDef> = {
  performance: {
    id: 'performance',
    label: 'PERFORMANCE',
    blurb: 'Lower render scale, simpler water and seabed at a distance, no shafts or shadows. Every clue stays.',
    renderScale: 0.75,
    waterRings: 34,
    waterSegs: 48,
    lod: [140, 360, 800, 2000],
    buildBudgetMs: 2,
    snow: 0,
    silt: 160,
    bubbles: 40,
    foam: false,
    shafts: false,
    caustics: false,
    seabedDetail: 1,
    shadowMap: 0,
    decor: 0.45,
    fish: 10,
  },
  balanced: {
    id: 'balanced',
    label: 'BALANCED',
    blurb: 'Finer near water and seabed, foam and wake, caustics in the shallows, particles in the water.',
    renderScale: 1,
    waterRings: 52,
    waterSegs: 72,
    lod: [220, 520, 1100, 2400],
    buildBudgetMs: 3,
    snow: 700,
    silt: 360,
    bubbles: 120,
    foam: true,
    shafts: true,
    caustics: true,
    seabedDetail: 2,
    shadowMap: 0,
    decor: 0.8,
    fish: 22,
  },
  cinematic: {
    id: 'cinematic',
    label: 'CINEMATIC',
    blurb: 'Everything on: densest reef, lamp shadows, the most particles and the longest detail range.',
    renderScale: 1,
    waterRings: 72,
    waterSegs: 104,
    lod: [300, 700, 1400, 2800],
    buildBudgetMs: 4,
    snow: 1600,
    silt: 600,
    bubbles: 240,
    foam: true,
    shafts: true,
    caustics: true,
    seabedDetail: 2,
    shadowMap: 1024,
    decor: 1,
    fish: 36,
  },
};

export interface OceanSettings {
  preset: OceanPreset;
  weather: 'calm' | 'dawn' | 'overcast';
  /** navigation help: route markers, bearing and range only, or instruments only */
  guidance: 'markers' | 'bearing' | 'instruments';
  /** no battery drain */
  relaxed: boolean;
  /** no camera bob, sway or shake */
  reduceMotion: boolean;
  /** larger HUD text and solid instrument backgrounds */
  largeHud: boolean;
  /** stronger outlines on nearby objects and less haze underwater */
  visibilityAid: boolean;
  /** turn sensitivity of the mouse-look (0.5..1.5) */
  lookSpeed: number;
}

export const OCEAN_SETTINGS_KEY = 'triad.ocean.settings.v1';

export const DEFAULT_OCEAN_SETTINGS: OceanSettings = {
  preset: 'balanced',
  weather: 'dawn',
  guidance: 'markers',
  relaxed: false,
  reduceMotion: false,
  largeHud: false,
  visibilityAid: false,
  lookSpeed: 1,
};

export function loadOceanSettings(): OceanSettings {
  try {
    const raw = localStorage.getItem(OCEAN_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_OCEAN_SETTINGS, ...(JSON.parse(raw) as Partial<OceanSettings>) };
  } catch {
    /* defaults */
  }
  return { ...DEFAULT_OCEAN_SETTINGS };
}

export function saveOceanSettings(s: OceanSettings): void {
  try {
    localStorage.setItem(OCEAN_SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* this session only */
  }
}
