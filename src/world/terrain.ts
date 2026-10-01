// The analytic terrain of the active theater (Triad Isles or Frostfall Strait).
//
// terrainHeight(x, z) is a pure deterministic function: the terrain worker
// uses it to build render chunks and the height grid, the main thread uses it
// for collision and landing. Everything about the three islands lives here:
// Skye's razor ridges, sea lochs and cliffs; Capri's terraced limestone crags
// and grottoes; Samos' pine hills, pebble beaches and the dividing mountain.

import { NM, WORLD_SEED, MAP_HALF } from '../core/constants';
import { hash2f } from '../core/rng';
import { Simplex2 } from '../core/noise';
import { smoothstep, clamp01, lerp } from '../core/math';
import {
  ISLANDS,
  ISLAND_BY_ID,
  IslandDef,
  IslandId,
  AIRFIELDS,
  AirfieldDef,
  FIELD_FLAT,
  SKYE_LOCHS,
  CAPRI_GROTTOES,
  toIslandLocal,
  fromIslandLocal,
  activeMap,
} from './islands';

const N = new Simplex2(WORLD_SEED);
const N2 = new Simplex2(WORLD_SEED * 7 + 3);
const N3 = new Simplex2(WORLD_SEED * 13 + 11);

export const DEEP_SEA = -460;

// Domain warp: bends the coordinates the mountain noise is sampled at, so
// ridges wander, fork and meet like real ranges instead of lining up in
// regular rows or radiating from a centre.
let WX = 0, WZ = 0;
function warp(x: number, z: number, scale: number, amp: number, seed: number): void {
  WX = x + amp * N3.fbm(x / scale + seed * 1.7, z / scale - seed * 2.3, 2);
  WZ = z + amp * N3.fbm(x / scale - seed * 3.1, z / scale + seed * 0.9, 2);
}
/** island id reported for pack-ice floes */
export const ICE = '__ice';

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
let fieldPre: FieldPre[] = [];
let fieldsByIsland: Record<IslandId, AirfieldDef[]> = {};

/** Rebuild everything derived from the active map's layout (map change). */
export function refreshTerrainCaches(): void {
  fieldPre = AIRFIELDS.map((f) => ({
    f,
    bound: f.length / 2 + FIELD_FLAT.alongPad + FIELD_FLAT.blend + 1500,
  }));
  fieldsByIsland = {};
  for (const i of ISLANDS) fieldsByIsland[i.id] = [];
  for (const f of AIRFIELDS) (fieldsByIsland[f.island] ??= []).push(f);
  initCoves();
  initVolcanoes();
}

// ---------------------------------------------------------------------------
// Coastline
// ---------------------------------------------------------------------------

/** Normalised warped radius: < 1 means land. */
function warpedRadius(isl: IslandDef, u: number, v: number, x: number, z: number): number {
  const nu = u / isl.rx;
  const nv = v / isl.ry;
  const r = Math.sqrt(nu * nu + nv * nv);
  const w = isl.warp;
  if (isl.style === 'tropic') {
    // small islands: the coast wanders at the island's own scale (headlands,
    // bays and points), not at the scale of a 100 km landmass
    const s = isl.reff, o = isl.cx * 0.0003;
    const t1 = N.noise(x / (s * 1.6) + o, z / (s * 1.6) - o);
    const t2 = N.noise(x / (s * 0.55) - 2.7 + o, z / (s * 0.55) + 8.8);
    const t3 = N2.noise(x / (s * 0.18), z / (s * 0.18) + o);
    const t4 = N3.noise(x / 700, z / 700);
    return r * (1 + w * (0.22 * t1 + 0.12 * t2 + 0.05 * t3) + 0.015 * t4);
  }
  const n1 = N.noise(x / 95000 + 11.3, z / 95000 - 4.1);
  const n2 = N.noise(x / 31000 - 2.7, z / 31000 + 8.8);
  const n3 = N2.noise(x / 9000, z / 9000);
  const n4 = N3.noise(x / 2600, z / 2600);
  return r * (1 + w * (0.2 * n1 + 0.085 * n2 + 0.035 * n3) + 0.012 * n4);
}

// Place Capri's grotto coves exactly on the (warped) coastline.
function initCoves(): void {
  capriCoves.length = 0;
  const capri = ISLANDS.find((i) => i.id === 'capri');
  if (!capri) return;
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
}

export function getGrottoes(): { x: number; z: number; r: number; name: string }[] {
  const capri = ISLANDS.find((i) => i.id === 'capri');
  if (!capri) return [];
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
  if (!fs) return s;
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
  warp(x, z, 22000, 6500, 1);
  const crest = N.ridged(WX / 16000, WZ / 16000, 6, 2.05, 0.52, 1.6);
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
  const du = u - samosRidgeU(v) - 1800 * N2.noise(v / 9000 + 2.2, u / 30000);
  const wr = 11500 * (0.85 + 0.3 * (0.5 + 0.5 * N3.noise(v / 17000 - 1.1, 4.4)));
  const prof = Math.exp(-(du * du) / (wr * wr));
  const ridgeEnd = smoothstep(1200, 9500, d);
  // summits and saddles along the crest instead of an even wall
  const crest = 3100 + 1300 * N.ridged(v / 9500 + 4.2, du / 30000 + 1.3, 4, 2.0, 0.5, 1.6);
  warp(x, z, 14000, 4200, 2);
  const carve = N.ridged(WX / 9000 + 3.3, WZ / 9000 - 8.1, 3, 2.0, 0.5, 1.25);
  const ridge = crest * Math.pow(prof, 0.85) * ridgeEnd * (0.9 + 0.1 * carve) + 500 * carve * prof * ridgeEnd;
  const spurW = wr * 2.3;
  const spurs = Math.pow(N2.ridged(WX / 6800, WZ / 6800, 5, 2.1, 0.5, 1.8), 1.5) * 950 * Math.exp(-(du * du) / (spurW * spurW)) * ridgeEnd;
  return beach + hills + roll + detail + ridge + spurs;
}

// ---------------------------------------------------------------------------
// Frostfall Strait
// ---------------------------------------------------------------------------

/**
 * Arctic range: low ice cliffs at the shore, a rolling ice cap, then huge
 * ridged mountains (knife-edge crests, deep glacial valleys) reaching well
 * over 7,000 m. Airfields sit on flattened coastal plains.
 */
/**
 * Glacial approach valleys: 1 far from any runway of this island, falling to
 * 0 along the runway and its extended centreline for ~17 NM each way, so the
 * big ranges never stand in the way of a 3 degree approach.
 */
function approachValleys(islId: IslandId, x: number, z: number): number {
  const fs = fieldsByIsland[islId];
  if (!fs) return 1;
  let s = 1;
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    const dx = x - f.x, dz = z - f.z;
    const along = Math.abs(dx * f.ax + dz * f.az);
    if (along > 34000) continue;
    const across = Math.abs(dx * f.rxv + dz * f.rzv);
    const out = Math.max(0, along - f.length / 2);
    const inner = 2200 + out * 0.2;
    const outer = inner + 5500 + out * 0.3;
    const k = smoothstep(inner, outer, across);
    // the valley closes gradually far out
    s = Math.min(s, lerp(k, 1, smoothstep(26000, 34000, along)));
  }
  return s;
}

/**
 * Great snow cones (Fuji-style stratovolcanoes): broad concave flanks many
 * kilometres across rising to a small summit crater, scattered over every
 * Frostfall landmass but kept clear of the airfields and their approaches.
 */
interface Volcano {
  x: number;
  z: number;
  /** base radius (m) */
  r: number;
  /** summit height above the surrounding land (m) */
  h: number;
  /** flank curvature: higher = more concave (steeper top, longer skirts) */
  k: number;
}
let volcanoesByIsland: Record<IslandId, Volcano[]> = {};

/** Distance from (x,z) to a runway's centreline extended `reach` m each way. */
function corridorDist(f: AirfieldDef, x: number, z: number, reach: number): number {
  const dx = x - f.x, dz = z - f.z;
  const along = dx * f.ax + dz * f.az;
  const across = dx * f.rxv + dz * f.rzv;
  const oa = Math.max(0, Math.abs(along) - f.length / 2 - reach);
  return Math.sqrt(oa * oa + across * across);
}

function initVolcanoes(): void {
  volcanoesByIsland = {};
  for (const isl of ISLANDS) {
    if (isl.style !== 'frost') continue;
    const list: Volcano[] = [];
    const fs = fieldsByIsland[isl.id] ?? [];
    const small = isl.id === 'hvitoy';
    const step = small ? 15000 : 33000;
    const seed = isl.id.charCodeAt(0) * 31 + isl.id.charCodeAt(1) * 7 + isl.id.length;
    for (let gv = -isl.ry; gv <= isl.ry; gv += step) {
      for (let gu = -isl.rx; gu <= isl.rx; gu += step) {
        const gi = Math.round(gu / step), gj = Math.round(gv / step);
        const r1 = hash2f(gi + seed, gj - seed * 3);
        const r2 = hash2f(gj * 5 + seed, gi * 3 - 11);
        const r3 = hash2f(gi * 7 - seed, gj * 11 + 5);
        const u = gu + (r1 - 0.5) * step * 0.75;
        const v = gv + (r2 - 0.5) * step * 0.75;
        const w = fromIslandLocal(isl, u, v);
        const rr = warpedRadius(isl, u, v, w.x, w.z);
        if (rr > (small ? 0.62 : 0.72)) continue;
        const inland = (1 - rr) * isl.reff;
        // big cones inland, smaller ones nearer the coast
        let r = (small ? 7500 : 17000) + r3 * (small ? 4000 : 15000);
        r = Math.min(r, inland * 1.15);
        if (r < 6000) continue;
        let ok = true;
        for (const f of fs) {
          const fd = Math.hypot(w.x - f.x, w.z - f.z);
          if (fd < r * 0.8 + 11000 || corridorDist(f, w.x, w.z, 30000) < r * 0.7 + 6500) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const h = (small ? 5000 : 5200) + (r / (small ? 11500 : 32000)) * 2600 + r2 * 900;
        list.push({ x: w.x, z: w.z, r, h, k: 1.55 + 0.5 * r1 });
      }
    }
    volcanoesByIsland[isl.id] = list;
  }
}

function volcanoHeight(islId: IslandId, x: number, z: number): number {
  const list = volcanoesByIsland[islId];
  if (!list) return 0;
  let best = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const dx = x - c.x, dz = z - c.z;
    const d2 = dx * dx + dz * dz;
    const reach = c.r * 1.3;
    if (d2 >= reach * reach) continue;
    // an irregular footprint: the mountain's outline wanders, it is not a circle
    const wob = N3.fbm(x / (c.r * 0.8) + i * 3.1, z / (c.r * 0.8) - i * 1.7, 2);
    const t = (Math.sqrt(d2) / c.r) * (1 + 0.3 * wob);
    if (t >= 1) continue;
    // the mountain's mass: broad shoulders, a steeper summit pyramid
    const env = Math.pow(1 - t, c.k * 0.8);
    // arêtes and valleys wandering across the massif (domain-warped ridged
    // noise, not pleats radiating from the summit), several summits and cols
    warp(x, z, c.r * 0.9, c.r * 0.38, i + 5);
    // big shapes only in the multiplier (fine octaves of kilometres of height make needles)
    // smooth massing scales the mountain; the sharp arêtes are added on top at a bounded size
    const mass = N2.fbm(WX / (c.r * 0.5) + i * 11.3, WZ / (c.r * 0.5) - i * 6.1, 3);
    const rdg = N.ridged(WX / (c.r * 0.33) + i * 5.7, WZ / (c.r * 0.33) - i * 9.2, 3, 2.0, 0.5, 1.25);
    const fine = N2.ridged(WX / (c.r * 0.12) - i * 3.3, WZ / (c.r * 0.12) + i * 8.8, 4, 2.05, 0.5, 1.3);
    let h = c.h * env * (0.78 + 0.34 * mass) + (700 * rdg + 150 * fine) * Math.min(1, env * 2.5);
    // cirques: bowls scooped out of the upper flanks
    const cirque = smoothstep(0.25, 0.7, N2.noise(WX / (c.r * 0.3) - i * 2.2, WZ / (c.r * 0.3) + i * 4.4));
    h *= 1 - 0.18 * cirque * smoothstep(0.08, 0.35, t) * (1 - smoothstep(0.6, 0.9, t));
    if (h > best) best = h;
  }
  return best;
}

function frostLand(isl: IslandDef, x: number, z: number, u: number, v: number, d: number): number {
  const valley = approachValleys(isl.id, x, z);
  const coast = (22 + 38 * (0.5 + 0.5 * N.noise(x / 6000 + 2.2, z / 6000 - 5.1))) * smoothstep(0, 120, d);
  const cap = 480 * smoothstep(0, 15000, d) * (0.5 + 0.5 * N2.fbm(x / 30000 - 8, z / 30000 + 3, 3));
  const sup = fieldSuppression(isl.id, x, z, 6500, 21000) * valley;
  // broad, rounded massifs (wide shoulders instead of knife-edges)
  const massif = smoothstep(-0.38, 0.22, N2.fbm(x / 42000 + 13, z / 42000 - 4, 3)) * smoothstep(1200, 10000, d);
  warp(x, z, 26000, 7000, 3);
  const dome = 0.5 + 0.5 * N.fbm(WX / 26000 + 50, WZ / 26000 - 20, 4);
  // crests, arêtes and V-shaped glacial valleys over the mass
  const alp = N.ridged(WX / 13000 + 50, WZ / 13000 - 20, 3, 2.0, 0.5, 1.0);
  const alpFine = N2.ridged(WX / 4200 - 7, WZ / 4200 + 3, 3, 2.0, 0.5, 1.2);
  const peaks = massif * sup * (600 + 3300 * Math.pow(dome, 1.7) + 480 * alp + 180 * alpFine);
  const hills = N3.billow(x / 9000, z / 9000, 3) * 220 * smoothstep(0, 4000, d) * (0.4 + 0.6 * sup);
  // snow fills the small hollows: only gentle drifts at this scale
  const detail = N.fbm(x / 1800, z / 1800, 3) * 14 * smoothstep(0, 700, d);
  const ground = coast + cap * (0.35 + 0.65 * valley) + hills + detail;
  let h = ground + peaks;
  if (isl.id === 'hvitoy') {
    // a broad wall of mountains down the middle of the contested island, between its two airfields
    const du = u - 2600 * Math.sin(v / 9000) - 1500 * N2.noise(v / 7000 + 1.9, 3.3);
    const prof = Math.exp(-(du * du) / (8500 * 8500));
    warp(x, z, 12000, 3800, 4);
    const cut = N.ridged(WX / 9000 + 2.2, WZ / 9000 - 5.5, 3, 2.0, 0.5, 1.0);
    const wall = (3900 + 2000 * (0.5 + 0.5 * N.fbm(v / 12000 + 3.3, 7.7, 3))) * Math.pow(prof, 1.1) * smoothstep(1500, 9000, d) * (0.9 + 0.1 * cut) + 400 * cut * prof * smoothstep(1500, 9000, d);
    h = Math.max(h, ground + wall * fieldSuppression(isl.id, x, z, 5000, 14000) * valley);
  }
  // the great snow cones stand on the land (no stacking onto the massifs)
  const cone = volcanoHeight(isl.id, x, z);
  if (cone > 0) h = Math.max(h, ground + cone * sup * smoothstep(0, 3000, d));
  // the highest summits flatten off toward ~8,000 m
  if (h > 7000) h = 7000 + 1500 * Math.tanh((h - 7000) / 1500);
  return h;
}

/** Small rocky islets: ice cliffs and a single snow cone. */
function isletLand(x: number, z: number, d: number): number {
  const cliff = (40 + 50 * (0.5 + 0.5 * N.noise(x / 2500, z / 2500))) * smoothstep(0, 90, d);
  const t = 1 - smoothstep(0, 6000, d);
  const peak = 1500 * Math.pow(1 - t, 1.7) * (0.8 + 0.2 * N.fbm(x / 3800 - 9, z / 3800 + 4, 2)) * smoothstep(200, 2500, d);
  return cliff + peak + N3.fbm(x / 900, z / 900, 3) * 20;
}

/**
 * Pack ice: flat floes of all sizes with open water between them, thick near
 * the coasts and toward the edges of the map, none in the open strait.
 * Returns the floe surface height, or 0 for open water.
 */
function packIce(x: number, z: number, offshore: number): number {
  const edge = smoothstep(MAP_HALF * 0.55, MAP_HALF * 0.92, Math.max(Math.abs(x), Math.abs(z)));
  const coast = (1 - smoothstep(4000, 26000, offshore)) * smoothstep(0.1, 0.6, N2.noise(x / 55000 + 3, z / 55000 - 7) + 0.2) * 0.85;
  const mask = Math.max(edge * (0.55 + 0.45 * N3.noise(x / 40000, z / 40000)), coast);
  if (mask < 0.06) return 0;
  const C = 6200;
  const cx = Math.floor(x / C), cz = Math.floor(z / C);
  let f1 = 1e9, f2 = 1e9, bi = 0, bj = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gi = cx + i, gj = cz + j;
      const px = (gi + 0.15 + 0.7 * hash2f(gi, gj)) * C;
      const pz = (gj + 0.15 + 0.7 * hash2f(gj + 91, gi - 37)) * C;
      const dx = x - px, dz = z - pz;
      const dd = dx * dx + dz * dz;
      if (dd < f1) {
        f2 = f1;
        f1 = dd;
        bi = gi;
        bj = gj;
      } else if (dd < f2) f2 = dd;
    }
  }
  // this floe exists at all? (denser pack where the mask is strong)
  if (hash2f(bi * 7 + 3, bj * 13 - 5) > mask * 0.95) return 0;
  const d1 = Math.sqrt(f1), d2 = Math.sqrt(f2);
  // leads of open water between floes, wider in looser pack
  const gap = 110 + 520 * (1 - mask) + 120 * N3.noise(x / 1500, z / 1500);
  if (d2 - d1 < gap) return 0;
  // rounded, ragged floes: some shrink well inside their cell
  const r = C * (0.34 + 0.55 * hash2f(bj - 11, bi + 17));
  if (d1 > r * (1 + 0.14 * N.noise(x / 1400, z / 1400) + 0.05 * N2.noise(x / 300, z / 300))) return 0;
  return 1.3 + 0.4 * hash2f(bi, bj);
}


// ---------------------------------------------------------------------------
// Jade Archipelago: twenty tropical islands, each its own landform
// ---------------------------------------------------------------------------

/** Distance to the nearest of a jittered grid of points (cell size c), its cell hash and the 2nd nearest. */
function cells(x: number, z: number, c: number, seed: number): { d1: number; d2: number; h: number } {
  const ci = Math.floor(x / c), cj = Math.floor(z / c);
  let d1 = 1e9, d2 = 1e9, h = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gi = ci + i, gj = cj + j;
      const px = (gi + 0.15 + 0.7 * hash2f(gi + seed, gj - seed)) * c;
      const pz = (gj + 0.15 + 0.7 * hash2f(gj * 3 + seed, gi * 5 - seed)) * c;
      const dd = Math.hypot(x - px, z - pz);
      if (dd < d1) {
        d2 = d1;
        d1 = dd;
        h = hash2f(gi * 7 + seed * 3, gj * 13 - seed);
      } else if (dd < d2) d2 = dd;
    }
  }
  return { d1, d2, h };
}

/** A volcanic cone: concave flanks, radial gullies, a summit crater. r = 0 at the summit .. 1 at the base. */
function coneShape(r: number, H: number, x: number, z: number, seed: number, crater: number): number {
  if (r >= 1) return 0;
  let h = H * Math.pow(1 - r, 1.65);
  // gullies cut down the flanks by the rain
  warp(x, z, 3000, 900, seed);
  const g = N.ridged(WX / 1700 + seed, WZ / 1700 - seed, 3, 2.0, 0.5, 1.2);
  h += (g - 0.5) * 260 * Math.sin(Math.PI * Math.min(1, r * 1.15)) * Math.min(1, H / 1500);
  // the crater at the top
  if (crater > 0 && r < crater) h -= H * 0.09 * (1 - (r / crater) * (r / crater));
  return Math.max(0, h);
}

function tropicLand(isl: IslandDef, x: number, z: number, u: number, v: number, d: number): number {
  const H = isl.peak ?? 500;
  const seed = isl.id.charCodeAt(0) + isl.id.charCodeAt(1) * 3 + isl.id.length * 7;
  // radial distance in the island's frame, 0 at the centre .. ~1 at the coast
  const nu = u / isl.rx, nv = v / isl.ry;
  const r = Math.sqrt(nu * nu + nv * nv) * (1 + 0.08 * N2.noise(x / 6000 + seed, z / 6000 - seed));
  // wide, gently shelving sand beaches, then a low coastal plain
  const beach = Math.min(d * 0.012, 3.5);
  const plain = 18 * smoothstep(250, 2600, d) * (0.6 + 0.4 * N.fbm(x / 4200 + seed, z / 4200, 2));
  const sup = fieldSuppression(isl.id, x, z, 5200, 14500) * approachValleys(isl.id, x, z);
  const ground = beach + plain;
  const inl = smoothstep(200, 2200, d);
  let f = 0;
  switch (isl.kind) {
    case 'strato':
      f = coneShape(r, H, x, z, seed, 0.06) * inl;
      break;
    case 'shield': {
      // broad and low-angled, a summit plateau with a pit crater
      const t = Math.min(1, r);
      f = (H * Math.pow(1 - t, 1.15) - (t < 0.07 ? H * 0.05 * (1 - t / 0.07) : 0)) * inl;
      warp(x, z, 4000, 1200, seed);
      f += N.ridged(WX / 2200 + seed, WZ / 2200, 3, 2.0, 0.5, 1.2) * 180 * Math.sin(Math.PI * t) * inl;
      break;
    }
    case 'highland': {
      // a mountain range down the island's long axis, valleys falling to the plain
      warp(x, z, 9000, 2500, seed);
      const spine = Math.exp(-Math.pow(nv / 0.42, 2)) * (1 - smoothstep(0.55, 1.0, Math.abs(nu)));
      const peaks = 0.55 + 0.45 * N.fbm(WX / 9000 + seed, WZ / 9000, 3);
      const rdg = N.ridged(WX / 3800 + seed, WZ / 3800 - seed, 4, 2.0, 0.5, 1.2);
      f = (H * 0.75 * spine * peaks + 420 * rdg * spine + 160 * N2.fbm(x / 3000, z / 3000, 3) * inl) * inl;
      break;
    }
    case 'karst': {
      // sheer limestone towers: a tower in most cells, steep sides, round tops
      const c = cells(x, z, 650, seed);
      const tall = c.h < 0.72 ? (0.35 + 0.65 * hash2f(seed, Math.floor(c.h * 997))) : 0;
      const rad = 210 + 90 * c.h;
      const tower = tall * H * (1 - smoothstep(rad * 0.62, rad, c.d1)) * (0.85 + 0.15 * N3.noise(x / 120, z / 120));
      f = Math.max(tower, 45 * inl * (0.5 + 0.5 * N.fbm(x / 1500, z / 1500, 2)));
      // the towers stand right at the waterline too: sea cliffs
      f *= smoothstep(0, 60, d) * 0.6 + 0.4;
      break;
    }
    case 'atoll': {
      // a ring of sand and palms; inside it a shallow turquoise lagoon
      const ring = isl.reff * 0.2 * (0.8 + 0.4 * (0.5 + 0.5 * N2.noise(x / 2500, z / 2500)));
      if (d > ring) return -2.5 - 4 * smoothstep(ring, ring + 1500, d) + N3.noise(x / 300, z / 300) * 0.8;
      return Math.min(d * 0.02, 2.2) + 1.2 * Math.sin(Math.PI * Math.min(1, d / ring));
    }
    case 'caldera': {
      // the broken rim of a sunken volcano around a flooded crater
      const rim = Math.exp(-Math.pow((r - 0.72) / 0.16, 2));
      const breach = smoothstep(0.75, 0.95, Math.cos(Math.atan2(nv, nu) - 0.6));
      f = H * rim * (1 - 0.9 * breach) * (0.8 + 0.2 * N.fbm(x / 1800 + seed, z / 1800, 3)) * inl;
      if (r < 0.52) return -6 - 30 * smoothstep(0.5, 0.2, r);
      break;
    }
    case 'twin': {
      const a = Math.hypot(nu - 0.45, nv) / 0.62, b = Math.hypot(nu + 0.48, nv + 0.05) / 0.58;
      f = Math.max(coneShape(a, H, x, z, seed, 0.08), coneShape(b, H * 0.78, x, z, seed + 5, 0.08), 0.35 * H * Math.exp(-Math.pow(nv / 0.3, 2)) * (1 - smoothstep(0.4, 0.9, Math.abs(nu)))) * inl;
      break;
    }
    case 'ridge': {
      warp(x, z, 5000, 1300, seed);
      const along = 1 - Math.pow(Math.min(1, Math.abs(nu)), 2.2);
      const prof = Math.exp(-Math.pow(nv / 0.38, 2));
      f = (H * along * prof * (0.7 + 0.3 * N.fbm(WX / 4000 + seed, WZ / 4000, 3)) + 260 * N.ridged(WX / 1800, WZ / 1800 + seed, 3, 2.0, 0.5, 1.2) * prof * along) * inl;
      break;
    }
    case 'mesa': {
      // a flat-topped plateau walled by cliffs
      const top = smoothstep(isl.reff * 0.16, isl.reff * 0.24, d + 300 * N2.noise(x / 2000, z / 2000));
      f = H * top + 14 * N.fbm(x / 900, z / 900, 2) * top + 30 * inl * (1 - top);
      break;
    }
    case 'cone':
      f = coneShape(r * 1.05, H, x, z, seed, 0.1) * smoothstep(100, 900, d);
      break;
    case 'spires': {
      const c = cells(x, z, 1500, seed);
      const k = 0.4 + 0.6 * c.h;
      const spire = H * k * Math.pow(Math.max(0, 1 - c.d1 / (480 + 260 * c.h)), 1.6);
      f = Math.max(spire * smoothstep(0.95, 0.6, r), 160 * inl * (1 - r)) + 40 * inl;
      break;
    }
    case 'hills':
      f = H * inl * (0.35 + 0.65 * (0.5 + 0.5 * N.fbm(x / 3500 + seed, z / 3500, 4))) * (1 - smoothstep(0.5, 1.0, r));
      break;
    case 'crescent': {
      // a bay bitten out of one side: the sea fills the hollow of the crescent
      const bay = Math.hypot(nu - 0.55, nv) < 0.62;
      if (bay) return -4 - 18 * smoothstep(0.62, 0.2, Math.hypot(nu - 0.55, nv));
      f = H * Math.exp(-Math.pow((r - 0.45) / 0.3, 2)) * (0.75 + 0.25 * N.fbm(x / 2200 + seed, z / 2200, 3)) * inl;
      break;
    }
    default:
      // sand cay
      return Math.min(d * 0.01, 2.6) + 0.6 * N3.noise(x / 200, z / 200);
  }
  return ground + Math.max(0, f) * sup;
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
  const depth = activeMap.id === 'frost'
    ? 3 + 70 * smoothstep(0, 4500, dOut) + 450 * smoothstep(4500, 30000, dOut)
    : activeMap.id === 'jade'
      ? // reef flats and turquoise shallows a kilometre or two wide, then the blue drop-off
        1.5 + 9 * smoothstep(0, 1800, dOut) + 320 * smoothstep(1800, 9000, dOut)
      : 2 + 42 * smoothstep(0, 3200, dOut) + 400 * smoothstep(3200, 42000, dOut);
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
      if (isl.style === 'tropic') h = tropicLand(isl, x, z, _loc.u, _loc.v, d);
      else if (isl.style === 'frost') h = frostLand(isl, x, z, _loc.u, _loc.v, d);
      else if (isl.style === 'islet') h = isletLand(x, z, d);
      else if (isl.style === 'skye') h = skyeLand(x, z, _loc.u, _loc.v, d);
      else if (isl.style === 'capri') h = capriLand(x, z, _loc.u, _loc.v, d);
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
  // Frostfall: pack ice floating on the sea
  if (best < 0.5 && activeMap.id === 'frost') {
    const floe = packIce(x, z, -bestInland);
    if (floe > 0) {
      best = floe;
      bestIsland = ICE;
      bestInland = 0;
    }
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
const APPROACH_TAN = Math.tan((2.0 * Math.PI) / 180);

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
    // valley width grows with distance; ragged walls so it reads as a valley, not a trench
    const halfW = (800 + dd * 0.14) * (1 + 0.28 * N2.noise(along / 5200 + i * 7.1, across > 0 ? 1.7 : -1.7));
    const ac = Math.abs(across);
    if (ac > halfW) continue;
    const w = (1 - smoothstep(halfW * 0.35, halfW, ac)) * (1 - smoothstep(APPROACH_LEN * 0.78, APPROACH_LEN, dd));
    // keep a little of the relief above a 2 deg plane (well under the 3 deg glideslope)
    const cap = f.elev + APPROACH_TAN * dd - 15;
    if (h > cap) h -= w * (h - cap) * 0.88;
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

  if (activeMap.id === 'frost') return frostColor(x, z, info, slope, out, n1, n2, n3);
  if (activeMap.id === 'jade') return jadeColor(x, z, info, slope, out, n1, n2, n3);
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
    mix3(out, 0.7, 0.63, 0.53, smoothstep(0.1, 0.8, n2) * 0.45);
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
    // warm, weathered limestone (not snow-white)
    if (isl === 'capri') mix3(out, 0.74 + 0.05 * n2, 0.66 + 0.04 * n2, 0.55 + 0.03 * n2, rockT);
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

/** Frostfall: snow and ice everywhere, dark rock on the steep faces, pale floes. */
function frostColor(x: number, z: number, info: TerrainInfo, slope: number, out: SurfaceColor, n1: number, n2: number, n3: number): SurfaceColor {
  const h = info.h;
  if (info.island === ICE) {
    // sea ice: blue-white, a little grey where it is thin
    const v = 0.5 + 0.5 * n1;
    out.r = 0.82 + 0.08 * v;
    out.g = 0.88 + 0.06 * v;
    out.b = 0.93 + 0.04 * v;
    return out;
  }
  if (h < 0.5) {
    // sea bed: pale glacial silt in the shallows, fading to the deep
    const depth = -h;
    out.r = 0.55;
    out.g = 0.7;
    out.b = 0.76;
    mix3(out, 0.2, 0.42, 0.56, smoothstep(2, 25, depth));
    mix3(out, 0.04, 0.1, 0.2, smoothstep(25, 220, depth));
    return out;
  }
  // wind-packed snow with faint blue in the hollows
  const v = 0.5 + 0.5 * n1;
  out.r = 0.9 + 0.05 * v;
  out.g = 0.92 + 0.05 * v;
  out.b = 0.96 + 0.03 * v;
  mix3(out, 0.8, 0.86, 0.94, 0.3 * (0.5 + 0.5 * n2));
  // exposed rock only where it is too steep for snow to hold (beyond ~48 deg),
  // dark and crisp; everything gentler stays under snow
  const rockT = smoothstep(0.75, 0.92, slope + n3 * 0.02);
  if (rockT > 0) mix3(out, 0.2 + 0.03 * n2, 0.2 + 0.03 * n2, 0.22 + 0.025 * n2, rockT);
  // blue-grey ice cliffs at the shore
  const shore = (1 - smoothstep(40, 220, info.inland)) * (1 - smoothstep(10, 70, h));
  if (shore > 0) mix3(out, 0.62, 0.72, 0.8, shore * 0.7);
  // airfields: ploughed, compacted snow and gravel
  if (info.field > 0.3) mix3(out, 0.66, 0.68, 0.7, smoothstep(0.3, 0.9, info.field) * 0.8);
  return out;
}

const VOLCANIC = new Set(['strato', 'shield', 'cone', 'twin', 'caldera']);
const LIMESTONE = new Set(['karst', 'spires']);

/** Jade Archipelago: white and black sand, reef shallows, rainforest greens, basalt and limestone. */
function jadeColor(x: number, z: number, info: TerrainInfo, slope: number, out: SurfaceColor, n1: number, n2: number, n3: number): SurfaceColor {
  const h = info.h;
  const isl = info.island ? ISLAND_BY_ID[info.island] : undefined;
  const kind = isl?.kind;
  const volcanic = !!kind && VOLCANIC.has(kind);
  if (h < 0.5) {
    // the sea bed: bright coral sand in the shallows, reef patches, then the blue deep
    const depth = -h;
    out.r = 0.93;
    out.g = 0.89;
    out.b = 0.74;
    const reef = smoothstep(0.15, 0.55, N2.noise(x / 380, z / 380)) * (1 - smoothstep(6, 18, depth));
    mix3(out, 0.46, 0.42, 0.33, reef * 0.6);
    mix3(out, 0.62, 0.72, 0.66, smoothstep(3, 14, depth));
    mix3(out, 0.08, 0.2, 0.3, smoothstep(14, 60, depth));
    mix3(out, 0.02, 0.07, 0.13, smoothstep(60, 260, depth));
    return out;
  }
  const v = 0.5 + 0.5 * n1;
  // rainforest ground: deep, saturated greens
  out.r = 0.16 + 0.05 * v;
  out.g = 0.3 + 0.06 * v;
  out.b = 0.11 + 0.03 * v;
  mix3(out, 0.24, 0.36, 0.14, 0.4 * (0.5 + 0.5 * n2));
  const fd = treeDensity(x, z, info, slope);
  if (fd > 0) mix3(out, 0.08, 0.17, 0.06, fd * 0.7);
  // cloud forest and alpine scrub higher up, then bare rock and ash near the big summits
  const alp = smoothstep(1500, 2100, h + n2 * 150);
  if (alp > 0) mix3(out, 0.36, 0.38, 0.22, alp * 0.7);
  const bare = smoothstep(2200, 2700, h + n2 * 200);
  if (bare > 0) mix3(out, 0.3 + 0.04 * n3, 0.27 + 0.03 * n3, 0.26 + 0.03 * n3, bare);
  // rock on steep faces: dark basalt on the volcanoes, pale grey limestone on the towers, red cliffs on the mesa
  const rockT = smoothstep(0.55, 0.85, slope + n3 * 0.06);
  if (rockT > 0) {
    if (kind === 'mesa') mix3(out, 0.58 + 0.05 * n2, 0.36 + 0.04 * n2, 0.24 + 0.03 * n2, rockT);
    else if (kind && LIMESTONE.has(kind)) mix3(out, 0.66 + 0.06 * n2, 0.64 + 0.05 * n2, 0.58 + 0.05 * n2, rockT * 0.9);
    else mix3(out, 0.22 + 0.03 * n2, 0.21 + 0.03 * n2, 0.21 + 0.02 * n2, rockT);
  }
  // beaches: black sand below the volcanoes, white coral sand everywhere else
  const beachT = (1 - smoothstep(70, 240, info.inland)) * (1 - smoothstep(3, 9, h)) * (1 - rockT);
  if (beachT > 0) {
    if (volcanic && N2.noise(x / 5000, z / 5000) > -0.2) mix3(out, 0.2 + 0.03 * n3, 0.19 + 0.03 * n3, 0.19 + 0.03 * n3, beachT);
    else mix3(out, 0.95 + 0.02 * n3, 0.9 + 0.02 * n3, 0.76 + 0.03 * n3, beachT);
  }
  // sand cays and atoll rings are all sand under the palms
  if (kind === 'cay' || kind === 'atoll') mix3(out, 0.93, 0.88, 0.72, 0.75);
  // airfields: mown grass and red laterite
  if (info.field > 0.3) mix3(out, 0.4, 0.42, 0.24, smoothstep(0.3, 0.9, info.field) * 0.8);
  return out;
}

/** Tree density 0..1 at a point. Trees are scattered over every island. */
export function treeDensity(x: number, z: number, info: TerrainInfo, slope: number): number {
  if (activeMap.id === 'frost') return 0;
  const h = info.h;
  if (activeMap.id === 'jade') {
    if (h < 1.5 || info.inland < 35 || info.field > 0.25) return 0;
    const isl = info.island ? ISLAND_BY_ID[info.island] : undefined;
    const kind = isl?.kind;
    // palms on the sand, then rainforest as dense as it gets, thinning into cloud forest and none above the tree line
    if (kind === 'cay' || kind === 'atoll') return 0.55 * (0.6 + 0.4 * N.noise(x / 500, z / 500));
    const clump = 0.85 + 0.15 * N.noise(x / 900, z / 900);
    let dd = 0.95 * clump * (1 - smoothstep(1900, 2400, h));
    dd *= 1 - smoothstep(0.62, 0.9, slope);
    if (kind === 'mesa' && h > (isl?.peak ?? 0) * 0.85) dd *= 0.45;
    return dd < 0 ? 0 : dd;
  }
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

export type TreeKind = 0 | 1 | 2 | 3 | 4 | 5; // 0 conifer, 1 umbrella pine, 2 cypress, 3 broadleaf, 4 coconut palm, 5 rainforest giant

/** Which tree species grows here (deterministic from a per-tree random 0..1). */
export function treeKind(info: TerrainInfo, r: number): TreeKind {
  const isl = info.island;
  if (activeMap.id === 'jade') {
    const kind = isl ? ISLAND_BY_ID[isl]?.kind : undefined;
    if (kind === 'cay' || kind === 'atoll') return 4;
    // coconut palms along the shore; lowland rainforest of tall emergents over a broadleaf canopy;
    // above ~1,400 m the cloud forest is smaller, darker broadleaf and podocarps
    if (info.inland < 380 && info.h < 30) return r < 0.85 ? 4 : 3;
    if (info.h > 1400) return r < 0.6 ? 3 : 0;
    return r < 0.5 ? 5 : r < 0.92 ? 3 : 4;
  }
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

refreshTerrainCaches();
