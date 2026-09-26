// The analytic terrain of the whole 400 x 400 NM theater.
//
// terrainHeight(x, z) is a pure deterministic function: the terrain worker
// uses it to build render chunks and the height grid, the main thread uses it
// for collision and landing. Everything about the three islands lives here:
// Skye's razor ridges, sea lochs and cliffs; Capri's terraced limestone crags
// and grottoes; Samos' pine hills, pebble beaches and the dividing mountain.

import { NM, WORLD_SEED, MAP_HALF } from '../core/constants';
import { Simplex2 } from '../core/noise';
import { smoothstep, clamp01, lerp } from '../core/math';
import {
  ISLANDS,
  IslandDef,
  IslandId,
  AIRFIELDS,
  AirfieldDef,
  FIELD_FLAT,
  SKYE_LOCHS,
  CAPRI_GROTTOES,
  toIslandLocal,
  fromIslandLocal,
} from './islands';

const N = new Simplex2(WORLD_SEED);
const N2 = new Simplex2(WORLD_SEED * 7 + 3);
const N3 = new Simplex2(WORLD_SEED * 13 + 11);

export const DEEP_SEA = -460;

// ---------------------------------------------------------------------------
// Precomputed features
// ---------------------------------------------------------------------------

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  width: number;
  /** 0 at mouth .. 1 at head, for depth taper */
  t0: number;
  t1: number;
}

const skyeLochSegs: Seg[] = [];
for (const loch of SKYE_LOCHS) {
  const pts = loch.pts.map(([u, v]) => [u * NM, v * NM] as [number, number]);
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    skyeLochSegs.push({
      ax: pts[i][0],
      ay: pts[i][1],
      bx: pts[i + 1][0],
      by: pts[i + 1][1],
      width: loch.width,
      t0: i / n,
      t1: (i + 1) / n,
    });
  }
}

interface Cove {
  u: number;
  v: number;
  r: number;
  name: string;
}
const capriCoves: Cove[] = [];

interface FieldPre {
  f: AirfieldDef;
  bound: number;
}
const fieldPre: FieldPre[] = AIRFIELDS.map((f) => ({
  f,
  bound: f.length / 2 + FIELD_FLAT.alongPad + FIELD_FLAT.blend + 1500,
}));

const fieldsByIsland: Record<IslandId, AirfieldDef[]> = { skye: [], capri: [], samos: [] };
for (const f of AIRFIELDS) fieldsByIsland[f.island].push(f);

// ---------------------------------------------------------------------------
// Coastline
// ---------------------------------------------------------------------------

/** Normalised warped radius: < 1 means land. */
function warpedRadius(isl: IslandDef, u: number, v: number, x: number, z: number): number {
  const nu = u / isl.rx;
  const nv = v / isl.ry;
  const r = Math.sqrt(nu * nu + nv * nv);
  const w = isl.warp;
  const n1 = N.noise(x / 95000 + 11.3, z / 95000 - 4.1);
  const n2 = N.noise(x / 31000 - 2.7, z / 31000 + 8.8);
  const n3 = N2.noise(x / 9000, z / 9000);
  const n4 = N3.noise(x / 2600, z / 2600);
  return r * (1 + w * (0.2 * n1 + 0.085 * n2 + 0.035 * n3) + 0.012 * n4);
}

// Place Capri's grotto coves exactly on the (warped) coastline.
(function initCoves() {
  const capri = ISLANDS.find((i) => i.id === 'capri')!;
  for (const g of CAPRI_GROTTOES) {
    const a = (g.angle * Math.PI) / 180;
    let lo = 0.3,
      hi = 1.8;
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      const u = Math.cos(a) * capri.rx * mid;
      const v = Math.sin(a) * capri.ry * mid;
      const w = fromIslandLocal(capri, u, v);
      const rr = warpedRadius(capri, u, v, w.x, w.z);
      if (rr < 1) lo = mid;
      else hi = mid;
    }
    const m = (lo + hi) / 2 - 0.004;
    capriCoves.push({ u: Math.cos(a) * capri.rx * m, v: Math.sin(a) * capri.ry * m, r: g.radius, name: g.name });
  }
})();

export function getGrottoes(): { x: number; z: number; r: number; name: string }[] {
  const capri = ISLANDS.find((i) => i.id === 'capri')!;
  return capriCoves.map((c) => {
    const w = fromIslandLocal(capri, c.u, c.v);
    return { x: w.x, z: w.z, r: c.r, name: c.name };
  });
}

// ---------------------------------------------------------------------------
// Island height models
// ---------------------------------------------------------------------------

function fieldSuppression(isl: IslandId, x: number, z: number, inner: number, outer: number): number {
  let s = 1;
  const fs = fieldsByIsland[isl];
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    const dx = x - f.x;
    const dz = z - f.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < outer) s = Math.min(s, smoothstep(inner, outer, d));
  }
  return s;
}

function skyeLand(x: number, z: number, u: number, v: number, d: number): number {
  const cliffMask = smoothstep(-0.15, 0.35, N.noise(x / 9000 + 3.1, z / 9000 - 1.7));
  const cliffH = (70 + 200 * (0.5 + 0.5 * N2.noise(x / 4200, z / 4200))) * cliffMask;
  const coast = cliffH * smoothstep(0, 160, d) + (1 - cliffMask) * Math.min(d * 0.045, 45);
  const moor = 300 * smoothstep(0, 17000, d) * (0.55 + 0.45 * N.fbm(x / 23000, z / 23000, 3));
  const sup = fieldSuppression('skye', x, z, 7000, 21000);
  // Massifs: broad highland blocks topped with razor-sharp ridged crests (Cuillin style).
  const massif = smoothstep(-0.18, 0.32, N2.fbm(x / 58000 + 5, z / 58000 - 9, 3)) * smoothstep(1500, 14000, d);
  const crest = N.ridged(x / 16000, z / 16000, 6, 2.05, 0.52, 1.6);
  const mount = massif * sup * (650 * (0.6 + 0.4 * N3.fbm(x / 12000, z / 12000, 2)) + 2100 * Math.pow(crest, 1.35));
  const hills = N3.billow(x / 8500, z / 8500, 4) * 240 * smoothstep(0, 4500, d) * (0.4 + 0.6 * sup);
  const detail = N.fbm(x / 1500, z / 1500, 3) * 30 * smoothstep(0, 700, d);
  let h = coast + moor + mount + hills + detail;

  // Sea lochs: long, steep-sided fjords cut from the sea deep into the island.
  let lochCarve = 1;
  let lochDepth = 0;
  for (let i = 0; i < skyeLochSegs.length; i++) {
    const s = skyeLochSegs[i];
    const abx = s.bx - s.ax, aby = s.by - s.ay;
    const ab2 = abx * abx + aby * aby;
    let t = ((u - s.ax) * abx + (v - s.ay) * aby) / ab2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = s.ax + abx * t - u;
    const py = s.ay + aby * t - v;
    const dist = Math.sqrt(px * px + py * py);
    const along = lerp(s.t0, s.t1, t);
    const w = s.width * (1 - 0.55 * along) * (1 + 0.25 * N3.noise(u / 6000, v / 6000));
    if (dist < w * 3.2) {
      const k = smoothstep(w * 0.55, w * 3.2, dist);
      if (k < lochCarve) {
        lochCarve = k;
        lochDepth = -70 * (1 - along * 0.7);
      }
    }
  }
  if (lochCarve < 1) {
    // steep walls: most of the height change happens near the water
    const k = Math.pow(lochCarve, 0.55);
    h = lerp(lochDepth, h, k);
  }
  return h;
}

function terrace(h: number, step: number, riser: number): number {
  const k = h / step;
  const f = Math.floor(k);
  const fr = k - f;
  return (f + smoothstep(1 - riser, 1, fr)) * step;
}

function capriLand(x: number, z: number, u: number, v: number, d: number): number {
  const cliff = (190 + 170 * (0.5 + 0.5 * N.noise(x / 5200, z / 5200))) * smoothstep(0, 130, d);
  const sup = fieldSuppression('capri', x, z, 6000, 17000);
  const pr = 0.5 + 0.5 * N2.fbm(x / 15000 - 3, z / 15000 + 7, 4);
  const plateau = 1350 * Math.pow(pr, 1.25) * smoothstep(400, 13000, d) * (0.35 + 0.65 * sup);
  const raw = cliff + plateau;
  const terraced = lerp(raw, terrace(raw, 88, 0.24), 0.82);
  const crags = Math.pow(N.ridged(x / 3400, z / 3400, 4, 2.2, 0.5, 2.5), 3) * 340 * smoothstep(700, 4800, d) * sup;
  const detail = N3.fbm(x / 850, z / 850, 3) * 16;
  let h = terraced + crags + detail;

  // Grotto coves: small round bites of shallow turquoise water in the cliffs.
  for (let i = 0; i < capriCoves.length; i++) {
    const c = capriCoves[i];
    const du = u - c.u, dv = v - c.v;
    const dist = Math.sqrt(du * du + dv * dv);
    if (dist < c.r * 1.25) {
      const k = smoothstep(c.r * 0.82, c.r * 1.2, dist);
      h = lerp(-5 - 5 * (1 - dist / c.r), h, Math.pow(k, 0.5));
    }
  }
  return h;
}

/** Local (u) position of the Samos dividing ridge crest line for a given v. */
export function samosRidgeU(v: number): number {
  return 3200 * Math.sin(v / 26000) + 2600 * N3.noise(v / 41000, 3.7);
}

function samosLand(x: number, z: number, u: number, v: number, d: number): number {
  const beach = Math.min(d * 0.03, 20);
  const sup = fieldSuppression('samos', x, z, 6000, 19000);
  const hp = 0.5 + 0.5 * N.fbm(x / 27000 + 1.1, z / 27000 - 6.6, 5);
  const hills = Math.pow(hp, 1.45) * 1300 * smoothstep(350, 12000, d) * (0.3 + 0.7 * sup);
  const roll = N2.billow(x / 6800, z / 6800, 3) * 170 * smoothstep(150, 2800, d);
  const detail = N3.fbm(x / 1200, z / 1200, 3) * 22 * smoothstep(0, 400, d);

  // The dividing mountain: a massive N-S wall through the middle of Samos.
  const du = u - samosRidgeU(v);
  const wr = 11500;
  const prof = Math.exp(-(du * du) / (wr * wr));
  const ridgeEnd = smoothstep(1200, 9500, d);
  const crest = 3550 + 650 * N.ridged(v / 11500 + 4.2, 1.3, 4, 2.0, 0.5, 2.0);
  const ridge = crest * Math.pow(prof, 0.85) * ridgeEnd;
  const spurW = wr * 2.3;
  const spurs =
    Math.pow(N2.ridged(x / 6800, z / 6800, 5, 2.1, 0.5, 2.0), 1.5) * 950 * Math.exp(-(du * du) / (spurW * spurW)) * ridgeEnd;
  return beach + hills + roll + detail + ridge + spurs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TerrainInfo {
  h: number;
  island: IslandId | null;
  /** metres inland from the coast (negative = offshore) */
  inland: number;
  /** 0..1 airfield levelling weight */
  field: number;
}

const _loc = { u: 0, v: 0 };

function seaFloor(dOut: number, x: number, z: number): number {
  const depth = 2 + 42 * smoothstep(0, 3200, dOut) + 400 * smoothstep(3200, 42000, dOut);
  return -depth + N3.noise(x / 7000, z / 7000) * 6 * smoothstep(0, 4000, dOut);
}

export function terrainInfo(x: number, z: number, out: TerrainInfo): TerrainInfo {
  let best = DEEP_SEA;
  let bestIsland: IslandId | null = null;
  let bestInland = -1e9;
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = ISLANDS[i];
    const dx = x - isl.cx, dz = z - isl.cz;
    if (dx * dx + dz * dz > isl.bound * isl.bound) continue;
    toIslandLocal(isl, x, z, _loc);
    const rr = warpedRadius(isl, _loc.u, _loc.v, x, z);
    const d = (1 - rr) * isl.reff;
    let h: number;
    if (d <= 0) {
      h = seaFloor(-d, x, z);
    } else {
      if (isl.id === 'skye') h = skyeLand(x, z, _loc.u, _loc.v, d);
      else if (isl.id === 'capri') h = capriLand(x, z, _loc.u, _loc.v, d);
      else h = samosLand(x, z, _loc.u, _loc.v, d);
      // meet the sea floor profile (-2 m at the waterline) continuously
      h -= 2 * (1 - smoothstep(0, 30, d));
    }
    if (h > best) best = h;
    if (d > bestInland) {
      bestInland = d;
      bestIsland = d > 0 ? isl.id : null;
    }
  }
  if (best === DEEP_SEA) {
    best = DEEP_SEA + N3.noise(x / 20000, z / 20000) * 30;
  }

  // Approach corridors: valleys along each runway's extended centreline keep
  // the terrain under a 2.3 deg plane so every 3 deg ILS glideslope is flyable.
  best = carveApproaches(x, z, best);

  // Airfields: level the terrain to field elevation with a smooth blend.
  let fieldW = 0;
  for (let i = 0; i < fieldPre.length; i++) {
    const fp = fieldPre[i];
    const f = fp.f;
    const dx = x - f.x, dz = z - f.z;
    if (Math.abs(dx) > fp.bound || Math.abs(dz) > fp.bound) continue;
    const along = dx * f.ax + dz * f.az;
    const across = dx * f.rxv + dz * f.rzv;
    const ha = f.length / 2 + FIELD_FLAT.alongPad;
    const oa = Math.max(0, Math.abs(along) - ha);
    const oc = Math.max(0, FIELD_FLAT.acrossMin - across, across - FIELD_FLAT.acrossMax);
    const dist = Math.sqrt(oa * oa + oc * oc);
    const w = 1 - smoothstep(0, FIELD_FLAT.blend, dist);
    if (w > 0) {
      best = lerp(best, f.elev, w);
      if (w > fieldW) fieldW = w;
      if (w > 0.5) {
        bestIsland = f.island;
        if (bestInland < 500) bestInland = 500;
      }
    }
  }
  out.h = best;
  out.island = bestIsland;
  out.inland = bestInland;
  out.field = fieldW;
  return out;
}

const APPROACH_LEN = 13 * NM;
const APPROACH_TAN = Math.tan((2.3 * Math.PI) / 180);

function carveApproaches(x: number, z: number, h: number): number {
  if (h <= 0) return h;
  for (let i = 0; i < fieldPre.length; i++) {
    const f = fieldPre[i].f;
    const dx = x - f.x, dz = z - f.z;
    const reach = APPROACH_LEN + f.length / 2;
    if (dx * dx + dz * dz > reach * reach) continue;
    const along = dx * f.ax + dz * f.az;
    const across = dx * f.rxv + dz * f.rzv;
    // distance before whichever threshold we are beyond
    const d = Math.abs(along) - f.length / 2;
    if (d <= -200 || d > APPROACH_LEN) continue;
    const dd = Math.max(0, d);
    const halfW = 700 + dd * 0.13;
    const ac = Math.abs(across);
    if (ac > halfW) continue;
    const w = (1 - smoothstep(halfW * 0.55, halfW, ac)) * (1 - smoothstep(APPROACH_LEN * 0.78, APPROACH_LEN, dd));
    const cap = f.elev + APPROACH_TAN * dd - 15;
    if (h > cap) h -= w * (h - cap);
  }
  return h;
}

const _info: TerrainInfo = { h: 0, island: null, inland: 0, field: 0 };

/** Terrain height (m above mean sea level) at a world position. Sea floor is negative. */
export function terrainHeight(x: number, z: number): number {
  if (x < -MAP_HALF - 50000 || x > MAP_HALF + 50000 || z < -MAP_HALF - 50000 || z > MAP_HALF + 50000) return DEEP_SEA;
  return terrainInfo(x, z, _info).h;
}

/** Height of the surface an aircraft can touch: terrain or water. */
export function surfaceHeight(x: number, z: number): number {
  const h = terrainHeight(x, z);
  return h > 0 ? h : 0;
}

/** Terrain normal by central differences. */
export function terrainNormal(x: number, z: number, eps = 8): { x: number; y: number; z: number } {
  const hL = terrainHeight(x - eps, z);
  const hR = terrainHeight(x + eps, z);
  const hD = terrainHeight(x, z - eps);
  const hU = terrainHeight(x, z + eps);
  const nx = hL - hR;
  const nz = hD - hU;
  const ny = 2 * eps;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return { x: nx / l, y: ny / l, z: nz / l };
}

// ---------------------------------------------------------------------------
// Surface appearance & vegetation (used by the chunk worker)
// ---------------------------------------------------------------------------

export interface SurfaceColor {
  r: number;
  g: number;
  b: number;
}

function mix3(out: SurfaceColor, r: number, g: number, b: number, t: number): void {
  out.r += (r - out.r) * t;
  out.g += (g - out.g) * t;
  out.b += (b - out.b) * t;
}

/**
 * Ground colour for a terrain vertex. No grass anywhere: bare earth, peat,
 * limestone, rock, pebble, sand and snow, with darker forest-floor tones where
 * trees are dense so distant forests read correctly.
 */
export function surfaceColor(x: number, z: number, info: TerrainInfo, slope: number, out: SurfaceColor): SurfaceColor {
  const h = info.h;
  const n1 = N3.noise(x / 420, z / 420);
  const n2 = N.noise(x / 2300, z / 2300);
  const n3 = N2.noise(x / 90, z / 90);
  const vary = 0.5 + 0.5 * n1;

  if (h < 0.5) {
    // sea bed: sand shallows fading to deep blue-black
    const depth = -h;
    out.r = 0.78;
    out.g = 0.72;
    out.b = 0.56;
    mix3(out, 0.5, 0.62, 0.6, smoothstep(0, 6, depth));
    mix3(out, 0.1, 0.22, 0.3, smoothstep(4, 40, depth));
    mix3(out, 0.03, 0.07, 0.12, smoothstep(40, 200, depth));
    return out;
  }

  const isl = info.island;
  if (isl === 'skye') {
    // peat and heather browns, dark basalt rock
    out.r = 0.36 + 0.06 * vary;
    out.g = 0.29 + 0.04 * vary;
    out.b = 0.22 + 0.03 * vary;
    mix3(out, 0.44, 0.33, 0.27, 0.35 * (0.5 + 0.5 * n2));
  } else if (isl === 'capri') {
    // terra rossa soil and pale limestone
    out.r = 0.58 + 0.06 * vary;
    out.g = 0.4 + 0.05 * vary;
    out.b = 0.3 + 0.04 * vary;
    mix3(out, 0.74, 0.7, 0.62, smoothstep(0.1, 0.8, n2) * 0.5);
  } else {
    // Samos: warm red-brown earth like the reference screenshots
    out.r = 0.62 + 0.06 * vary;
    out.g = 0.44 + 0.05 * vary;
    out.b = 0.38 + 0.04 * vary;
    mix3(out, 0.7, 0.52, 0.46, 0.4 * (0.5 + 0.5 * n2));
  }

  // forest floor darkening where trees are dense
  const fd = treeDensity(x, z, info, slope);
  if (fd > 0) {
    if (isl === 'samos') mix3(out, 0.22, 0.26, 0.16, fd * 0.75);
    else if (isl === 'capri') mix3(out, 0.3, 0.32, 0.2, fd * 0.6);
    else mix3(out, 0.25, 0.26, 0.18, fd * 0.6);
  }

  // rock on steep slopes
  const rockT = smoothstep(0.42, 0.72, slope + n3 * 0.06);
  if (rockT > 0) {
    if (isl === 'capri') mix3(out, 0.8, 0.78, 0.72, rockT);
    else if (isl === 'skye') mix3(out, 0.3, 0.3, 0.31, rockT);
    else mix3(out, 0.52, 0.47, 0.44, rockT);
  }

  // beaches: pebbles on Samos, pale sand elsewhere
  const beachT = (1 - smoothstep(60, 260, info.inland)) * (1 - smoothstep(4, 16, h)) * (1 - rockT);
  if (beachT > 0) {
    if (isl === 'samos') mix3(out, 0.62 + 0.08 * n3, 0.6 + 0.08 * n3, 0.56 + 0.08 * n3, beachT);
    else mix3(out, 0.82, 0.76, 0.6, beachT);
  }

  // high altitude: scree then snow
  const snowLine = isl === 'samos' ? 3500 : 2150;
  const scree = smoothstep(snowLine - 900, snowLine - 200, h + n2 * 150);
  if (scree > 0) mix3(out, 0.5, 0.49, 0.48, scree * 0.6);
  const snow = smoothstep(snowLine, snowLine + 350, h + n2 * 180) * (1 - smoothstep(0.75, 0.95, slope));
  if (snow > 0) mix3(out, 0.93, 0.94, 0.97, snow);

  // airfield grounds: dry compacted earth
  if (info.field > 0.3) mix3(out, 0.55, 0.49, 0.41, smoothstep(0.3, 0.9, info.field) * 0.85);
  return out;
}

/** Tree density 0..1 at a point. Trees are scattered over every island. */
export function treeDensity(x: number, z: number, info: TerrainInfo, slope: number): number {
  const h = info.h;
  if (h < 3 || info.inland < 120 || info.field > 0.25) return 0;
  const clump = N2.noise(x / 2600 + 7.7, z / 2600 - 3.3);
  const clump2 = N.noise(x / 700, z / 700);
  let d: number;
  const isl = info.island;
  if (isl === 'samos') {
    d = 0.78 * smoothstep(-0.55, 0.25, clump) * (1 - smoothstep(1700, 2700, h));
  } else if (isl === 'capri') {
    d = 0.38 * smoothstep(-0.35, 0.45, clump) * (1 - smoothstep(1000, 1400, h));
  } else {
    d = 0.3 * smoothstep(-0.25, 0.55, clump) * (1 - smoothstep(700, 1150, h));
  }
  d *= 0.75 + 0.25 * clump2;
  d *= 1 - smoothstep(0.5, 0.75, slope);
  return d < 0 ? 0 : d;
}

export type TreeKind = 0 | 1 | 2 | 3; // 0 conifer, 1 umbrella pine, 2 cypress, 3 broadleaf

/** Which tree species grows here (deterministic from a per-tree random 0..1). */
export function treeKind(info: TerrainInfo, r: number): TreeKind {
  const isl = info.island;
  if (isl === 'samos') return r < 0.82 ? 0 : r < 0.92 ? 3 : 2;
  if (isl === 'capri') return r < 0.5 ? 1 : r < 0.78 ? 2 : 3;
  return r < 0.55 ? 0 : 3;
}

/** Nearest island to a point with its inland distance (negative offshore). */
export function nearestIsland(x: number, z: number): { island: IslandDef; inland: number } {
  let best: IslandDef = ISLANDS[0];
  let bestD = -Infinity;
  for (const isl of ISLANDS) {
    toIslandLocal(isl, x, z, _loc);
    const rr = warpedRadius(isl, _loc.u, _loc.v, x, z);
    const d = (1 - rr) * isl.reff;
    if (d > bestD) {
      bestD = d;
      best = isl;
    }
  }
  return { island: best, inland: bestD };
}
