import * as THREE from 'three';
import type { Aircraft } from '../aircraft';
import { AirframeVisual, FarLod, setLodScale } from './visual';
import { buildAoVolume, AoVolume } from './ao';
import { buildF15EX } from './f15ex';
import { buildFA18 } from './fa18';
import { buildTyphoon } from './typhoon';
import { buildSu35, su35PlainLivery } from './su35';
import { buildRafale } from './rafale';
import { buildF22 } from './f22';
import { buildMig31 } from './mig31';
import { buildSr71 } from './sr71';
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

const HERO_DENSITY: Record<Tier, number> = { low: 1.2, medium: 2.0, high: 4, ultra: 5.5 };
// the jets around you drop to their light model sooner on lower settings
const LOD_SCALE: Record<Tier, number> = { low: 1.8, medium: 1.3, high: 1, ultra: 1 };
let heroDensity = 4;
try {
  const q = loadSettings().graphics.quality;
  heroDensity = HERO_DENSITY[q] ?? 4;
  setLodScale(LOD_SCALE[q] ?? 1);
} catch {
  /* defaults */
}

/** Follow the graphics quality setting (applies to airframes built from now on). */
export function setHeroDetail(q: Tier): void {
  heroDensity = HERO_DENSITY[q] ?? 4;
  setLodScale(LOD_SCALE[q] ?? 1);
}

/** Density of the distance LOD (and of the shadow silhouettes). */
const FAR_DENSITY = 0.45;
const farLods = new Map<string, FarLod>();

function farLod(ac: Aircraft): FarLod {
  const key = `${ac.type}:${ac.team}`;
  let L = farLods.get(key);
  if (!L) {
    const t = build(ac, FAR_DENSITY);
    L = t.buildFarLod();
    L.ao = buildAoVolume(L.shadow);
    // keep only the merged geometry: the low template itself is not used again
    const keep = new Set<THREE.BufferGeometry>(L.parts.map((p) => p.geo));
    keep.add(L.shadow);
    t.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !keep.has(m.geometry)) m.geometry.dispose();
    });
    t.dispose();
    farLods.set(key, L);
  }
  return L;
}

function applyAo(mat: THREE.Material | null, ao: AoVolume | undefined): void {
  const u = mat?.userData.skinUniforms as Record<string, THREE.IUniform> | undefined;
  if (!u || !ao || !u.aoTex) return;
  u.aoTex.value = ao.tex;
  (u.aoMin.value as THREE.Vector3).copy(ao.min);
  (u.aoSize.value as THREE.Vector3).copy(ao.size);
  u.aoOn.value = 1;
}

function build(ac: Aircraft, d: number): AirframeVisual {
  const t = new AirframeVisual(ac);
  setModelDensity(d);
  try {
    if (ac.type === 'F15EX') buildF15EX(t);
    else if (ac.type === 'FA18EF') buildFA18(t);
    else if (ac.type === 'SU35') buildSu35(t);
    else if (ac.type === 'RAFALE') buildRafale(t);
    else if (ac.type === 'F22') buildF22(t);
    else if (ac.type === 'MIG31') buildMig31(t);
    else if (ac.type === 'SR71') buildSr71(t);
    else buildTyphoon(t);
  } finally {
    setModelDensity(1);
  }
  const pm = partMaterials();
  t.finishTemplate(new Set([pm.duct, pm.seat, pm.flight, pm.helmet, pm.visor, pm.antenna, pm.formation, pm.darkMetal, pm.lens, pm.frame]));
  return t;
}

function template(ac: Aircraft, hero: boolean): AirframeVisual {
  const d = hero ? heroDensity : 1;
  const key = `${ac.type}:${ac.team}:${d}`;
  let t = templates.get(key);
  if (!t) {
    t = build(ac, d);
    t.mergeStatic();
    // far LOD + shadow silhouette: the detailed meshes stop casting shadows
    t.lodMeshes = t.lodSources();
    for (const m of t.lodMeshes) m.castShadow = false;
    t.farLod = farLod(ac);
    applyAo(t.paintMat, t.farLod.ao);
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
/** unused hero templates kept ready, least recently released first */
let spareHeroes: string[] = [];

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
  // flicking through jets in the hangar should not rebuild each one every
  // time: on the higher settings all of them stay built once seen
  spareHeroes = spareHeroes.filter((k) => k !== key && (users.get(k) ?? 0) === 0 && templates.has(k));
  spareHeroes.push(key);
  const keep = heroDensity >= 4 ? 8 : 1;
  while (spareHeroes.length > keep) freeTemplate(spareHeroes.shift()!);
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
