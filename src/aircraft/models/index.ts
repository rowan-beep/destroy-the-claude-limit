import * as THREE from 'three';
import type { Aircraft } from '../aircraft';
import { AirframeVisual } from './visual';
import { buildF15EX } from './f15ex';
import { buildFA18 } from './fa18';
import { buildTyphoon } from './typhoon';
import { buildSu35, su35PlainLivery } from './su35';
import { buildRafale } from './rafale';
import { buildF22 } from './f22';
import { partMaterials } from './parts';
import { f15PlainLivery } from './f15ex';
import type { PaintConfig } from './paint';
import { setModelDensity } from './kit';
import { loadSettings, Tier } from '../../core/settings';

// One fully built airframe per type, coalition and detail level; every
// aircraft in the sim is a clone sharing its geometry, livery and materials.
// "Hero" airframes (your own jet, the hangar) are built at several times the
// mesh density of the jets around you, which stay light so a big furball
// still runs smoothly.
const templates = new Map<string, AirframeVisual>();

const HERO_DENSITY: Record<Tier, number> = { low: 1.6, medium: 2.6, high: 4, ultra: 4 };
let heroDensity = 4;
try {
  heroDensity = HERO_DENSITY[loadSettings().graphics.quality] ?? 4;
} catch {
  /* defaults */
}

/** Follow the graphics quality setting (applies to airframes built from now on). */
export function setHeroDetail(q: Tier): void {
  heroDensity = HERO_DENSITY[q] ?? 4;
}

function template(ac: Aircraft, hero: boolean): AirframeVisual {
  // the Raptor gets an extra-dense hero build: the showpiece jet
  const d = hero ? heroDensity * (ac.type === 'F22' ? 1.25 : 1) : 1;
  const key = `${ac.type}:${ac.team}:${d}`;
  let t = templates.get(key);
  if (!t) {
    t = new AirframeVisual(ac);
    setModelDensity(d);
    try {
      if (ac.type === 'F15EX') buildF15EX(t);
      else if (ac.type === 'FA18EF') buildFA18(t);
      else if (ac.type === 'SU35') buildSu35(t);
      else if (ac.type === 'RAFALE') buildRafale(t);
      else if (ac.type === 'F22') buildF22(t);
      else buildTyphoon(t);
    } finally {
      setModelDensity(1);
    }
    const pm = partMaterials();
    t.finishTemplate(new Set([pm.duct, pm.seat, pm.flight, pm.helmet, pm.visor, pm.antenna, pm.formation, pm.darkMetal, pm.lens, pm.frame]));
    templates.set(key, t);
  }
  return t;
}

/**
 * Build the full visual model for an aircraft (one of the six allowed types).
 * `hero` builds the high-density airframe (the player's jet, the hangar).
 */
export function createAirframe(ac: Aircraft, hero = false): AirframeVisual {
  const t = template(ac, hero);
  const v = t.cloneFor(ac);
  v.buildStores();
  const key = [...templates].find(([, x]) => x === t)![0];
  users.set(key, (users.get(key) ?? 0) + 1);
  keyOf.set(v, key);
  return v;
}

// Hero templates are several million triangles each: once nothing uses one it
// is freed, keeping only the most recently released one ready for reuse.
const users = new Map<string, number>();
const keyOf = new WeakMap<AirframeVisual, string>();
let spareHero: string | null = null;

function freeTemplate(key: string): void {
  const t = templates.get(key);
  if (!t) return;
  templates.delete(key);
  t.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  t.dispose();
}

/** Done with an aircraft's visual: dispose it and free its template if unused. */
export function releaseAirframe(v: AirframeVisual): void {
  v.dispose();
  const key = keyOf.get(v);
  if (!key) return;
  keyOf.delete(v);
  const n = Math.max(0, (users.get(key) ?? 1) - 1);
  users.set(key, n);
  if (n > 0 || key.endsWith(':1')) return;
  if (spareHero && spareHero !== key && (users.get(spareHero) ?? 0) === 0) freeTemplate(spareHero);
  spareHero = key;
}

/** Build templates ahead of time (so the first spawn of a type doesn't hitch). */
export function prewarmAirframes(list: Aircraft[]): void {
  for (const a of list) template(a, a.isPlayer);
}

/** Put a paint job on one aircraft's visual (the player's jet, the hangar jet). */
export function paintAirframe(v: AirframeVisual, cfg: PaintConfig | null): void {
  v.applyPaint(cfg, v.ac.type === 'F15EX' ? f15PlainLivery(v.ac.team) : v.ac.type === 'SU35' ? su35PlainLivery(v.ac.team) : null);
}

export { AirframeVisual };
