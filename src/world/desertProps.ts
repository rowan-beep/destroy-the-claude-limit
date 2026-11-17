// Dune Sea scenery: the ruins and the wrecks. Everything is built in code from
// boxes, cylinders and wedges, coloured per vertex, merged into one mesh per
// site and shown only within a few kilometres of the camera.
//
// - Al-Qasr, the ruined city in the middle: roofless mud-brick and concrete
//   houses with their walls broken to jagged stumps, courtyards and floors full
//   of drifted sand, broken towers, tall stumps still standing, a citadel wall.
// - Villages, walled compounds and watch posts in the valleys, lone pillars on
//   the high crests: all abandoned, all half buried.
// - Wrecks: burnt-out jets (a fuselage half sunk in a dune, a tail section, a
//   wing, a canopy lying in the sand) and armour (hulls with the turret blown
//   off, tracks pulled loose, a barrel sticking out of a drift), strewn along
//   the old roads, round the old airstrip and at the city's edges. Older ones
//   are sun-faded and deeper in the sand; newer ones are darker, still burnt.
//
// The sites are placed deterministically (the same on every machine) on the
// analytic sand height (desert.ts), so they sit where the terrain does.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import { NM } from '../core/constants';
import { duneHeight, duneBase, CITY, OLD_STRIP, ROADS, WIND_X, WIND_Z, OASES, pondRadius, ANCIENT, ANCIENT_APRON } from './desert';
import { AIRFIELDS } from './islands';
import { buildRuin, ruinRadius, RUIN_KINDS, RuinKind, buildCrashedJet, CRASH_RADIUS } from './desertRuins';
import { CrashFires } from './crashSmoke';

type Geo = THREE.BufferGeometry;
type RGB = [number, number, number];

// sRGB colours (converted to linear when painted)
// (all of it dusted with sand: warm, never the cold grey of clean concrete under a blue sky)
const MUD: RGB = [0.76, 0.6, 0.43];
const MUD_DARK: RGB = [0.66, 0.5, 0.36];
const CONCRETE: RGB = [0.78, 0.72, 0.62];
const SAND: RGB = [0.86, 0.71, 0.48];
const BURNT: RGB = [0.13, 0.12, 0.11];
const RUST: RGB = [0.4, 0.22, 0.12];
const JET_GREY: RGB = [0.42, 0.44, 0.45];
const JET_FADED: RGB = [0.62, 0.6, 0.55];
const ARMOUR: RGB = [0.5, 0.45, 0.31];
const GLASS: RGB = [0.1, 0.12, 0.13];

const _lin = new THREE.Color();
function paint(g: Geo, c: RGB, rnd: () => number, vary = 0.06): Geo {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng.attributes.uv) ng.deleteAttribute('uv');
  const n = ng.attributes.position.count;
  const arr = new Float32Array(n * 3);
  // one shade per piece, a little different from the next
  const k = 1 - vary + rnd() * vary * 2;
  _lin.setRGB(c[0] * k, c[1] * k, c[2] * k, THREE.SRGBColorSpace);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _lin.r;
    arr[i * 3 + 1] = _lin.g;
    arr[i * 3 + 2] = _lin.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): Geo {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

/** A drift of sand: a wedge leaning against something, its high edge `h` up along x = 0, running out `run` toward +x. */
function drift(len: number, h: number, run: number): Geo {
  const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(run, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  return g;
}

/** A piece placed: yaw it, move it, keep it. */
class Site {
  readonly parts: Geo[] = [];
  constructor(
    readonly x: number,
    readonly z: number,
    readonly range: number,
    readonly rnd: () => number,
  ) {}
  add(g: Geo, c: RGB, at: { x: number; y: number; z: number; yaw?: number; pitch?: number; roll?: number }, vary = 0.06): void {
    if (at.roll) g.rotateZ(at.roll);
    if (at.pitch) g.rotateX(at.pitch);
    if (at.yaw) g.rotateY(at.yaw);
    g.translate(at.x - this.x, at.y, at.z - this.z);
    this.parts.push(paint(g, c, this.rnd, vary));
  }
}

/** Lowest sand under a footprint (so nothing hangs over a slope), less a burial depth. */
function ground(x: number, z: number, r: number, bury: number): number {
  let h = duneHeight(x, z);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    h = Math.min(h, duneHeight(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return h - bury;
}

/** Is the ground here near flat over radius r (a ruin needs a floor, not a slip face)? */
function flatEnough(x: number, z: number, r: number, tol: number): boolean {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const h = duneHeight(x + Math.cos(a) * r, z + Math.sin(a) * r);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return hi - lo < tol;
}

function nearRunway(x: number, z: number, r: number): boolean {
  return AIRFIELDS.some((f) => Math.hypot(x - f.x, z - f.z) < r + f.length / 2);
}

// ---------------------------------------------------------------------------
// Ruins
// ---------------------------------------------------------------------------

/**
 * A wall from (0,0) to (len,0) in local x, broken: short runs of brickwork at
 * random heights, some missing altogether, tops jagged.
 */
function brokenWall(site: Site, len: number, h: number, t: number, c: RGB, at: { x: number; y: number; z: number; yaw: number }, loss: number): void {
  const rnd = site.rnd;
  let u = 0;
  const cos = Math.cos(at.yaw), sin = Math.sin(at.yaw);
  while (u < len - 0.3) {
    const seg = Math.min(len - u, 2.4 + rnd() * 3.2);
    if (rnd() > loss) {
      const hh = h * (0.25 + 0.75 * Math.pow(rnd(), 0.6));
      const mid = u + seg / 2;
      // local x along the wall, rotated by yaw about y (three's rotateY: x' = x cos + z sin, z' = -x sin + z cos)
      site.add(box(seg, hh, t, 0, 0, 0), c, { x: at.x + mid * cos, y: at.y, z: at.z - mid * sin, yaw: at.yaw });
      // a jagged cap: a smaller block on top, offset
      if (rnd() < 0.3) site.add(box(seg * (0.3 + 0.4 * rnd()), h * 0.15 * rnd() + 0.3, t, 0, 0, 0), c, { x: at.x + (u + seg * rnd()) * cos, y: at.y + hh, z: at.z - (u + seg * rnd()) * sin, yaw: at.yaw });
    }
    u += seg;
  }
}

/** A roofless house: four broken walls round a floor of drifted sand, drifts banked on the windward wall. */
function house(site: Site, x: number, z: number, w: number, d: number, h: number, yaw: number, c: RGB, loss: number): void {
  const rnd = site.rnd;
  const y = ground(x, z, Math.max(w, d) * 0.6, 0.6);
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const P = (lx: number, lz: number) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
  const t = 0.55 + rnd() * 0.25;
  const corners: [number, number, number][] = [
    [-w / 2, -d / 2, 0],
    [w / 2, -d / 2, -Math.PI / 2],
    [w / 2, d / 2, Math.PI],
    [-w / 2, d / 2, Math.PI / 2],
  ];
  const lens = [w, d, w, d];
  corners.forEach(([lx, lz, a], i) => {
    const p = P(lx, lz);
    brokenWall(site, lens[i], h, t, c, { x: p.x, y, z: p.z, yaw: yaw + a }, loss);
  });
  // the floor filled with sand, and a drift banked high against one wall
  site.add(box(w - t, 0.5 + rnd() * 0.9, d - t, 0, 0, 0), SAND, { x, y, z, yaw }, 0.04);
  const dr = drift(d * 0.9, h * (0.35 + 0.4 * rnd()), w * (0.3 + 0.3 * rnd()));
  const p = P(-w / 2 + t, 0);
  site.add(dr, SAND, { x: p.x, y, z: p.z, yaw }, 0.04);
  // outside, the wind piles sand against the windward wall (of every other house)
  const q = P(-w / 2 - 0.2, 0);
  if (rnd() < 0.5) site.add(drift(d * 1.05, h * 0.5, h * 1.6), SAND, { x: q.x, y, z: q.z, yaw: yaw + Math.PI }, 0.04);
}

/** A broken tower: square or round, its top ragged, a heap of fallen masonry at its foot. */
function tower(site: Site, x: number, z: number, r: number, h: number, round: boolean, c: RGB): void {
  const rnd = site.rnd;
  const y = ground(x, z, r * 1.2, 1.2);
  const g = round ? new THREE.CylinderGeometry(r * 0.9, r, h, 12, 1, true) : new THREE.BoxGeometry(r * 2, h, r * 2);
  g.translate(0, h / 2, 0);
  site.add(g, c, { x, y, z, yaw: rnd() * 3 });
  // ragged crown: a few blocks of the broken top
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    site.add(box(r * 0.7, h * 0.08 + rnd() * h * 0.12, r * 0.45, 0, 0, 0), c, { x: x + Math.cos(a) * r * 0.6, y: y + h - 0.2, z: z + Math.sin(a) * r * 0.6, yaw: a });
  }
  // fallen masonry and the sand banked round the base
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2, d = r * (1.4 + rnd() * 2);
    site.add(box(1 + rnd() * 2, 0.6 + rnd(), 1 + rnd() * 1.5, 0, 0, 0), c, { x: x + Math.cos(a) * d, y: y + 0.2, z: z + Math.sin(a) * d, yaw: rnd() * 3, roll: (rnd() - 0.5) * 0.6 });
  }
  const cone = new THREE.ConeGeometry(r * 2.4, h * 0.18, 10, 1, true);
  cone.translate(0, h * 0.09, 0);
  site.add(cone, SAND, { x, y: y + 0.3, z }, 0.04);
}

/** A lone column, broken off, standing out of the sand. */
function pillar(site: Site, x: number, z: number, h: number, c: RGB): void {
  const y = ground(x, z, 1.5, 2.5);
  const g = new THREE.CylinderGeometry(0.75, 0.85, h, 10);
  g.translate(0, h / 2, 0);
  site.add(g, c, { x, y, z, roll: (site.rnd() - 0.5) * 0.12 });
  site.add(box(2.2, 0.6, 2.2, 0, 0, 0), c, { x, y: y + 1.6, z, yaw: site.rnd() });
}

function village(site: Site, n: number, spread: number): void {
  const rnd = site.rnd;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = spread * Math.sqrt(rnd());
    const x = site.x + Math.cos(a) * d, z = site.z + Math.sin(a) * d;
    house(site, x, z, 6 + rnd() * 9, 6 + rnd() * 8, 2.6 + rnd() * 2.4, rnd() * 0.5 - 0.25 + (rnd() < 0.5 ? 0 : Math.PI / 2), rnd() < 0.8 ? MUD : MUD_DARK, 0.3);
  }
  if (rnd() < 0.6) tower(site, site.x + (rnd() - 0.5) * spread, site.z + (rnd() - 0.5) * spread, 2.2, 9 + rnd() * 6, rnd() < 0.5, MUD);
}

function compound(site: Site): void {
  const rnd = site.rnd;
  const s = 34 + rnd() * 30, yaw = rnd() * 0.6;
  const y = ground(site.x, site.z, s * 0.7, 0.5);
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const P = (lx: number, lz: number) => ({ x: site.x + lx * cos + lz * sin, z: site.z - lx * sin + lz * cos });
  const sides: [number, number, number][] = [[-s / 2, -s / 2, 0], [s / 2, -s / 2, -Math.PI / 2], [s / 2, s / 2, Math.PI], [-s / 2, s / 2, Math.PI / 2]];
  for (const [lx, lz, a] of sides) {
    const p = P(lx, lz);
    brokenWall(site, s, 4.2, 0.9, MUD, { x: p.x, y, z: p.z, yaw: yaw + a }, 0.2);
    tower(site, p.x, p.z, 2, 6.5 + rnd() * 3, false, MUD_DARK);
  }
  for (let i = 0; i < 3; i++) {
    const p = P((rnd() - 0.5) * s * 0.5, (rnd() - 0.5) * s * 0.5);
    house(site, p.x, p.z, 7 + rnd() * 6, 6 + rnd() * 5, 3 + rnd() * 2, yaw, rnd() < 0.5 ? MUD : CONCRETE, 0.35);
  }
}

function watchPost(site: Site): void {
  const rnd = site.rnd;
  tower(site, site.x, site.z, 2.4, 10 + rnd() * 6, rnd() < 0.5, rnd() < 0.5 ? CONCRETE : MUD);
  const y = ground(site.x, site.z, 12, 0.5);
  for (let i = 0; i < 7; i++) {
    if (rnd() < 0.3) continue;
    const a0 = (i / 7) * Math.PI * 2;
    const p = { x: site.x + Math.cos(a0) * 11, z: site.z + Math.sin(a0) * 11 };
    site.add(box(8.5, 1.2 + rnd() * 1.4, 0.7, 0, 0, 0), MUD, { x: p.x, y, z: p.z, yaw: -a0 + Math.PI / 2 });
  }
}

/** Al-Qasr: streets of broken houses, a citadel, towers and the tall stumps still standing. */
function city(site: Site): void {
  const rnd = site.rnd;
  // the old town packed inside a kilometre of the middle, thinner outskirts out to 2.2 km
  const R = 950, ROUT = 2200;
  // streets on a slightly skewed grid, houses on the blocks
  const yaw0 = 0.18;
  const cos = Math.cos(yaw0), sin = Math.sin(yaw0);
  // (a fixed count keeps the city to a few hundred thousand vertices: phone-class GPUs too)
  const taken = new Set<string>();
  for (let i = 0, placed = 0; placed < 380 && i < 4000; i++) {
    // the first 330 in the old town, snapped to its street grid; the rest scattered in the outskirts
    const old = placed < 330;
    const a = rnd() * Math.PI * 2, d = old ? R * Math.pow(rnd(), 0.85) : R + (ROUT - R) * rnd();
    const ix = Math.round((Math.cos(a) * d) / 34), iz = Math.round((Math.sin(a) * d) / 30);
    const key = ix + ',' + iz;
    const lx = ix * 34 + (rnd() - 0.5) * 6, lz = iz * 30 + (rnd() - 0.5) * 5;
    const r = Math.hypot(lx, lz);
    // (the citadel stands 150 m north of the middle: its square is left clear)
    if (taken.has(key) || r > (old ? R : ROUT) || Math.hypot(lx, lz + 150) < 140) continue;
    taken.add(key);
    placed++;
    const x = CITY.x + lx * cos + lz * sin, z = CITY.z - lx * sin + lz * cos;
    const concrete = rnd() < 0.3;
    house(site, x, z, 10 + rnd() * 14, 9 + rnd() * 12, concrete ? 4 + rnd() * 6 : 3 + rnd() * 3.5, yaw0 + (rnd() < 0.85 ? 0 : (rnd() - 0.5) * 0.4), concrete ? CONCRETE : rnd() < 0.8 ? MUD : MUD_DARK, 0.2 + 0.3 * Math.min(1, r / ROUT));
  }
  // the citadel: a big square of broken wall with towers, north of the middle
  const cx = CITY.x - 150 * sin, cz = CITY.z - 150 * cos;
  const s = 190, y = ground(cx, cz, 30, 0.6);
  for (const [lx, lz, a] of [[-s / 2, -s / 2, 0], [s / 2, -s / 2, -Math.PI / 2], [s / 2, s / 2, Math.PI], [-s / 2, s / 2, Math.PI / 2]] as [number, number, number][]) {
    const px = cx + lx * cos + lz * sin, pz = cz - lx * sin + lz * cos;
    brokenWall(site, s, 9, 2.2, MUD_DARK, { x: px, y, z: pz, yaw: yaw0 + a }, 0.18);
    tower(site, px, pz, 5, 14 + rnd() * 10, true, MUD_DARK);
  }
  // broken towers and the tall stumps still standing
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = R * (0.15 + 0.8 * rnd());
    tower(site, CITY.x + Math.cos(a) * d, CITY.z + Math.sin(a) * d, 2.5 + rnd() * 2.5, 15 + rnd() * 20, rnd() < 0.6, rnd() < 0.5 ? CONCRETE : MUD);
  }
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, d = R * 0.6 * rnd();
    tower(site, CITY.x + Math.cos(a) * d, CITY.z + Math.sin(a) * d, 1.8 + rnd(), 28 + rnd() * 18, true, i % 2 ? CONCRETE : MUD);
  }
}

// ---------------------------------------------------------------------------
// Wrecks
// ---------------------------------------------------------------------------

/** Old wrecks are faded by the sun and deeper in the sand; new ones are darker and still burnt. */
function age(rnd: () => number): { hull: RGB; bury: number } {
  const a = rnd();
  const mix = (p: RGB, q: RGB, t: number): RGB => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  return { hull: mix(BURNT, RUST, a * 0.7), bury: 0.3 + a * 1.4 };
}

/** A jet's fuselage, half sunk nose-first into a dune, one wing stuck up out of the sand. */
function jetFuselage(site: Site, x: number, z: number): void {
  const rnd = site.rnd;
  const { hull, bury } = age(rnd);
  const yaw = rnd() * Math.PI * 2;
  const y = ground(x, z, 7, bury + 0.6);
  const body = new THREE.CylinderGeometry(0.9, 1.05, 12, 12);
  body.rotateX(Math.PI / 2);
  site.add(body, rnd() < 0.5 ? JET_GREY : JET_FADED, { x, y: y + 0.3, z, yaw, pitch: 0.12 + rnd() * 0.15, roll: rnd() * 0.4 });
  // burnt scorching round the break, the rear half missing
  site.add(new THREE.CylinderGeometry(1.08, 1.08, 1.4, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 6), hull, { x, y: y + 0.3, z, yaw, pitch: 0.12 });
  // a wing standing up out of the sand
  const wing = new THREE.BoxGeometry(5.5, 0.18, 3.2);
  wing.translate(2.75, 0, 0);
  site.add(wing, JET_FADED, { x, y: y + 0.6, z, yaw: yaw + 0.3, roll: 0.9 + rnd() * 0.5 });
  site.add(drift(5, 1.6, 4), SAND, { x: x + Math.sin(yaw) * 5, y, z: z + Math.cos(yaw) * 5, yaw: yaw + Math.PI / 2 }, 0.04);
}

/** A tail section: the fins and a short stub of the rear fuselage. */
function jetTail(site: Site, x: number, z: number): void {
  const rnd = site.rnd;
  const { hull, bury } = age(rnd);
  const yaw = rnd() * Math.PI * 2;
  const y = ground(x, z, 4, bury);
  const stub = new THREE.CylinderGeometry(0.8, 0.95, 4.5, 12);
  stub.rotateX(Math.PI / 2);
  site.add(stub, hull, { x, y: y + 0.6, z, yaw, roll: 0.2 });
  const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(3.6, 0), new THREE.Vector2(2.6, 3.2), new THREE.Vector2(1.6, 3.2)]);
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.16, bevelEnabled: false });
  fg.rotateY(Math.PI / 2);
  fg.translate(0, 0.9, 1.8);
  site.add(fg, rnd() < 0.5 ? JET_GREY : JET_FADED, { x, y: y + 0.6, z, yaw, roll: 0.2 + (rnd() - 0.5) * 0.4 });
  const stab = new THREE.BoxGeometry(5, 0.14, 1.8);
  site.add(stab, JET_FADED, { x, y: y + 0.6, z, yaw, roll: 0.35 });
}

function jetWing(site: Site, x: number, z: number): void {
  const rnd = site.rnd;
  const y = ground(x, z, 4, 0.4);
  const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(6.5, 2.4), new THREE.Vector2(6.5, 3.6), new THREE.Vector2(0, 4.6)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  site.add(g, rnd() < 0.5 ? JET_GREY : JET_FADED, { x, y: y + 0.4, z, yaw: rnd() * 6.3, roll: 0.25 + rnd() * 0.25 });
}

/** A canopy lying alone in a dune, half buried. */
function jetCanopy(site: Site, x: number, z: number): void {
  const y = ground(x, z, 1.5, 0.35);
  const g = new THREE.SphereGeometry(0.75, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.8, 2.2);
  site.add(g, GLASS, { x, y, z, yaw: site.rnd() * 6.3, roll: 0.3 }, 0.02);
  const frame = new THREE.TorusGeometry(0.75, 0.06, 6, 16, Math.PI);
  site.add(frame, BURNT, { x, y, z, yaw: site.rnd() * 6.3 });
}

/** A tank: the hull and tracks burnt out, the turret blown off and lying upside down beside it. */
function tank(site: Site, x: number, z: number, turretOn = false): void {
  const rnd = site.rnd;
  const { hull, bury } = age(rnd);
  const yaw = rnd() * Math.PI * 2;
  const y = ground(x, z, 4.5, bury);
  const base = rnd() < 0.5 ? ARMOUR : hull;
  site.add(box(3.4, 1.4, 7, 0, 0.5, 0), base, { x, y, z, yaw, roll: (rnd() - 0.5) * 0.15 });
  // the sloped glacis
  const gl = new THREE.BoxGeometry(3.4, 0.5, 1.6);
  gl.rotateX(0.5);
  gl.translate(0, 1.55, -3.6);
  site.add(gl, base, { x, y, z, yaw });
  // tracks either side, one pulled loose and trailing
  for (const sd of [-1, 1]) site.add(box(0.6, 1.1, 7.2, sd * 1.95, 0.05, 0), BURNT, { x, y, z, yaw });
  const loose = box(0.6, 0.12, 6, 0, 0, 0);
  site.add(loose, BURNT, { x: x + Math.cos(yaw) * 3.2 - Math.sin(yaw) * 5, y: y + 0.4, z: z - Math.sin(yaw) * 3.2 - Math.cos(yaw) * 5, yaw: yaw + 0.4 });
  // the turret
  const tur = new THREE.CylinderGeometry(1.4, 1.6, 0.9, 10);
  tur.translate(0, 0.45, 0);
  const gun = new THREE.CylinderGeometry(0.1, 0.12, 5, 8);
  gun.rotateX(Math.PI / 2);
  gun.translate(0, 0.5, -3);
  if (turretOn) {
    site.add(tur, hull, { x, y: y + 2, z, yaw: yaw + rnd() });
    site.add(gun, hull, { x, y: y + 2, z, yaw: yaw + 0.3 });
  } else {
    const a = rnd() * 6.3, d = 6 + rnd() * 6;
    const tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d;
    const ty = ground(tx, tz, 2, 0.3);
    site.add(tur, hull, { x: tx, y: ty + 0.9, z: tz, yaw: rnd() * 6, roll: Math.PI - 0.25 });
    site.add(gun, hull, { x: tx, y: ty + 0.4, z: tz, yaw: rnd() * 6, pitch: 0.15 });
  }
  site.add(drift(7, 1.1, 3), SAND, { x: x - WIND_X * 2.5, y, z: z - WIND_Z * 2.5, yaw: Math.atan2(WIND_Z, -WIND_X) }, 0.04);
}

/** Just the barrel of a buried tank, sticking up out of a drift. */
function barrel(site: Site, x: number, z: number): void {
  const y = ground(x, z, 2, 0.2);
  const g = new THREE.CylinderGeometry(0.1, 0.13, 4.5, 8);
  g.translate(0, 2.25, 0);
  site.add(g, BURNT, { x, y: y - 0.8, z, roll: 0.5 + site.rnd() * 0.3, yaw: site.rnd() * 6.3 });
  const mound = new THREE.ConeGeometry(3.2, 1.3, 10, 1, true);
  mound.translate(0, 0.65, 0);
  site.add(mound, SAND, { x, y: y + 0.1, z }, 0.04);
}

function wreckField(site: Site, n: number, spread: number, kinds: ((s: Site, x: number, z: number) => void)[]): void {
  const rnd = site.rnd;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = spread * Math.sqrt(rnd());
    kinds[Math.floor(rnd() * kinds.length)](site, site.x + Math.cos(a) * d, site.z + Math.sin(a) * d);
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function buildSites(): Site[] {
  const rnd = mulberry32(0xd0e5ea);
  const sites: Site[] = [];
  const mk = (x: number, z: number, range: number) => {
    const s = new Site(x, z, range, mulberry32(Math.floor(rnd() * 2 ** 31)));
    sites.push(s);
    return s;
  };
  // the city, and a column of burnt armour at each of its gates on the east-west road
  city(mk(CITY.x, CITY.z, 42000));
  for (const sd of [-1, 1]) {
    const s = mk(CITY.x + sd * CITY.r * 1.25, CITY.z + sd * 220, 16000);
    for (let i = 0; i < 6; i++) tank(s, s.x + sd * i * 26 + (s.rnd() - 0.5) * 14, s.z + (s.rnd() - 0.5) * 30, i === 2);
    barrel(s, s.x + sd * 180, s.z + 40);
  }
  // the old airstrip: jets that never left, wrecked where they stood
  {
    const s = mk(OLD_STRIP.x, OLD_STRIP.z, 18000);
    const ax = Math.sin((OLD_STRIP.heading * Math.PI) / 180), az = -Math.cos((OLD_STRIP.heading * Math.PI) / 180);
    for (let i = 0; i < 7; i++) {
      const along = (s.rnd() - 0.5) * OLD_STRIP.length * 0.9;
      const across = (s.rnd() < 0.5 ? -1 : 1) * (OLD_STRIP.width / 2 + 20 + s.rnd() * 60);
      const x = OLD_STRIP.x + ax * along - az * across, z = OLD_STRIP.z + az * along + ax * across;
      [jetFuselage, jetTail, jetWing, jetCanopy][i % 4](s, x, z);
    }
    house(s, OLD_STRIP.x - az * 160, OLD_STRIP.z + ax * 160, 40, 26, 7, Math.atan2(az, ax), CONCRETE, 0.35);
    tower(s, OLD_STRIP.x - az * 200 + ax * 90, OLD_STRIP.z + ax * 200 + az * 90, 3, 16, false, CONCRETE);
  }
  // wrecks along the old roads, now and then in a cluster
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i], b = road[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      for (let u = 2500 + rnd() * 3000; u < L; u += 4500 + rnd() * 5500) {
        const t = u / L;
        let x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        x += (rnd() - 0.5) * 220;
        z += (rnd() - 0.5) * 220;
        if (nearRunway(x, z, 2500) || Math.hypot(x - CITY.x, z - CITY.z) < CITY.r * 1.6) continue;
        const s = mk(x, z, 12000);
        const pick = rnd();
        if (pick < 0.35) wreckField(s, 2 + Math.floor(s.rnd() * 3), 90, [tank, tank, barrel]);
        else if (pick < 0.65) wreckField(s, 2 + Math.floor(s.rnd() * 2), 140, [jetFuselage, jetTail, jetWing, jetCanopy]);
        else if (pick < 0.85) tank(s, x, z);
        else jetFuselage(s, x, z);
      }
    }
  }
  // a hamlet of mud-brick houses beside some of the oases, on the hollow's dry floor
  for (const o of OASES) {
    if (rnd() > 0.55) continue;
    const a = rnd() * Math.PI * 2, d = o.pond * 3.2 + 60;
    const x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d;
    village(mk(x, z, 14000), 4 + Math.floor(rnd() * 6), 70);
  }
  // villages, compounds and watch posts on flat sand in the valleys; lone pillars on the high crests
  const half = 56 * NM;
  const want = { village: 9, compound: 6, post: 12, pillar: 18 };
  for (let tries = 0; tries < 4000 && (want.village + want.compound + want.post + want.pillar) > 0; tries++) {
    const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
    if (nearRunway(x, z, 4000) || Math.hypot(x - CITY.x, z - CITY.z) < CITY.r * 2.2) continue;
    if (ANCIENT.some((c) => Math.hypot(x - c.x, z - c.z) < (c.H + ANCIENT_APRON) * 1.5)) continue;
    const rel = duneHeight(x, z) - duneBase(x, z);
    if (want.pillar > 0 && rel > 380 && flatEnough(x, z, 12, 6)) {
      want.pillar--;
      const s = mk(x, z, 9000);
      pillar(s, x, z, 6 + s.rnd() * 7, s.rnd() < 0.5 ? MUD : CONCRETE);
      if (s.rnd() < 0.5) pillar(s, x + 9, z + 3, 3 + s.rnd() * 4, MUD);
      continue;
    }
    if (rel > 40) continue;
    if (want.village > 0 && flatEnough(x, z, 160, 9)) {
      want.village--;
      village(mk(x, z, 16000), 5 + Math.floor(rnd() * 8), 140);
    } else if (want.compound > 0 && flatEnough(x, z, 60, 5)) {
      want.compound--;
      compound(mk(x, z, 14000));
    } else if (want.post > 0 && flatEnough(x, z, 20, 4)) {
      want.post--;
      watchPost(mk(x, z, 12000));
    }
  }
  return sites;
}

// ---------------------------------------------------------------------------
// Stone ruins and crash sites everywhere: each kind built in a few versions
// (desertRuins.ts), and every placed one drawn as a copy of one of them, so
// hundreds of them cost little memory. Only the ones near the camera are drawn.
// ---------------------------------------------------------------------------

const VERSIONS = 3;
const CRASH_VERSIONS = 5;

interface Placed {
  x: number;
  y: number;
  z: number;
  yaw: number;
  range: number;
}

/** how far off each kind is drawn (m): the great monuments from far away, the many small pieces only nearer */
const RANGE: Record<string, number> = {
  temple: 20000, facade: 16000, theatre: 20000, amphitheatre: 22000, forum: 16000, basilica: 16000, gate: 16000, arch: 16000, aqueduct: 14000,
  colonnade: 14000, tomb: 12000, obelisk: 12000, wall: 12000, wallrun: 9000, street: 9000, houses: 7000,
};
const has = (k: string): k is RuinKind => (RUIN_KINDS as string[]).includes(k);

/**
 * One of the ancient cities: walls round a square town with a gate on each side, the two colonnaded
 * main streets crossing at the forum, temples, a basilica and baths round it, a theatre, house blocks
 * filling the grid (most of them long since gone under the sand), outside the walls an amphitheatre,
 * tower tombs lining the road out of one gate, and an aqueduct striding in across the dunes.
 */
function planCity(c: (typeof ANCIENT)[number], rnd: () => number, put: (kind: string, u: number, v: number, yaw: number) => void): void {
  const H = c.H;
  const SEC = 60;
  const half = Math.PI / 2;
  // the walls: sections along each side, some stretches fallen and gone; the gates where the main streets leave
  for (let side = 0; side < 4; side++) {
    for (let t = -H + SEC / 2; t < H; t += SEC) {
      if (Math.abs(t) < 30) continue;
      if (rnd() < 0.42) continue;
      const [u, v, yaw] = side === 0 ? [-H, t, 0] : side === 1 ? [H, t, 0] : side === 2 ? [t, -H, half] : [t, H, half];
      put('wallrun', u, v, yaw);
    }
    const [gu, gv, gy] = side === 0 ? [-H, 0, half] : side === 1 ? [H, 0, half] : side === 2 ? [0, -H, 0] : [0, H, 0];
    put('gate', gu, gv, gy);
  }
  // the cardo (along v) and the decumanus (along u), colonnaded, crossing at the forum
  const forum = { u: 0, v: 0 };
  for (let t = -H + 40; t < H - 40; t += SEC) {
    if (Math.abs(t) < 70) continue;
    if (rnd() < 0.85) put('street', 0, t + SEC / 2 - 30, 0);
    if (rnd() < 0.85) put('street', t + SEC / 2 - 30, 0, half);
  }
  // round the crossing: the forum, an arch over the decumanus, temples, the basilica and the baths
  put('forum', forum.u + 110, forum.v - 100, 0);
  put('arch', -150, 0, half);
  put('temple', 120, 230, 0);
  put('temple', -230, -170, half);
  if (rnd() < 0.6) put('temple', 330, -330, 0);
  put('basilica', -130, 180, half);
  put('basilica', 380, 200, 0);
  put('theatre', -H * 0.55, H * 0.5, Math.PI + 0.3);
  put('colonnade', 250, -90, half);
  // a library's two-storey columned façade facing the cardo, the hall behind it long gone
  put('facade', 45, 330, -half);
  put('obelisk', 40, -60, 0);
  put('statue', 160, -40, rnd() * 6);
  put('column', -60, 60, 0);
  put('column', 70, 90, 0);
  put('well', -90, -80, 0);
  // the house blocks on the grid, most of them buried
  const pitch = 100;
  for (let bu = -H + pitch; bu < H - pitch / 2; bu += pitch) {
    for (let bv = -H + pitch; bv < H - pitch / 2; bv += pitch) {
      if (Math.abs(bu) < 60 || Math.abs(bv) < 60) continue;
      // (the monuments' ground round the crossing, and the theatre's quarter)
      if (Math.abs(bu) < 480 && Math.abs(bv) < 420) continue;
      if (Math.hypot(bu + H * 0.55, bv - H * 0.5) < 160) continue;
      if (rnd() < 0.3) put('houses', bu + (rnd() - 0.5) * 12, bv + (rnd() - 0.5) * 12, (rnd() < 0.5 ? 0 : half) + (rnd() - 0.5) * 0.06);
    }
  }
  // outside: the amphitheatre beyond the east wall, tower tombs along the road from the south gate
  put('amphitheatre', H + 420, -H * 0.35, half);
  for (let i = 0; i < 9; i++) {
    const v = -H - 120 - i * 70 - rnd() * 20;
    put('tomb', (i % 2 ? 1 : -1) * (35 + rnd() * 25), v, rnd() * 0.3);
  }
  // the aqueduct: in from the north-west, 3-5 km of it, stretches fallen
  const len = 3000 + rnd() * 2000;
  const ang = -2.3 + (rnd() - 0.5) * 0.5;
  const du = Math.cos(ang), dv = Math.sin(ang);
  const yaw = Math.atan2(du, dv);
  for (let s = H + 80; s < H + len; s += SEC) {
    if (rnd() < 0.18) continue;
    put('aqueduct', du * s, dv * s, yaw);
  }
}

/** the big kinds are seen from further away */
const BIG: Set<string> = new Set(['colonnade', 'temple', 'arch', 'wall', 'tomb', 'gate', 'houses', 'theatre']);

function placeStone(): { ruins: Placed[][]; crashes: Placed[][] } {
  const rnd = mulberry32(0x5a7d01);
  const ruins: Placed[][] = RUIN_KINDS.flatMap(() => Array.from({ length: VERSIONS }, () => [] as Placed[]));
  const crashes: Placed[][] = Array.from({ length: CRASH_VERSIONS }, () => [] as Placed[]);
  const taken: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, r: number) => !taken.some((t) => Math.hypot(x - t.x, z - t.z) < r + t.r + 60);
  // the wind blows toward +x in the models (their drifts are on the -x side): turn them to the real wind
  const windYaw = -Math.atan2(WIND_Z, WIND_X);
  const ruinAt = (kind: RuinKind, x: number, z: number): boolean => {
    const r = ruinRadius(kind);
    if (!free(x, z, r) || nearRunway(x, z, 3000 + r) || !flatEnough(x, z, r, Math.max(4, r * 0.35))) return false;
    const k = RUIN_KINDS.indexOf(kind) * VERSIONS + Math.floor(rnd() * VERSIONS);
    // sunk to the lowest sand under it, a little more on a slope
    ruins[k].push({ x, y: ground(x, z, Math.min(r, 40) * 0.6, 0.4), z, yaw: windYaw + (rnd() - 0.5) * 0.7, range: RANGE[kind] ?? (BIG.has(kind) ? 16000 : 10000) });
    taken.push({ x, z, r });
    return true;
  };
  // the ancient cities first: every piece placed by the plan, on the levelled ground
  for (const c of ANCIENT) {
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    planCity(c, rnd, (kind, u, v, yaw) => {
      if (!has(kind)) return;
      const r = ruinRadius(kind);
      const x = c.x + u * co + v * si, z = c.z - u * si + v * co;
      const k = RUIN_KINDS.indexOf(kind) * VERSIONS + Math.floor(rnd() * VERSIONS);
      ruins[k].push({ x, y: ground(x, z, Math.min(r, 40) * 0.6, 0.4), z, yaw: c.yaw + yaw, range: RANGE[kind] ?? (BIG.has(kind) ? 16000 : 10000) });
    });
    // nothing else is placed inside them
    taken.push({ x: c.x, z: c.z, r: (c.H + ANCIENT_APRON) * 1.45 });
  }
  // (the scattered ruins: the kinds that stand alone, not the city's tiles and great halls)
  const LONE = RUIN_KINDS.filter((k) => !['street', 'wallrun', 'aqueduct', 'forum', 'amphitheatre', 'basilica', 'facade'].includes(k));
  const pick = (): RuinKind => LONE[Math.floor(rnd() * LONE.length)];
  const half = 56 * NM;
  // lost towns: a few ruins together, some beside the oases (the old towns grew round the water)
  for (const o of OASES) {
    if (rnd() < 0.35) continue;
    const n = 2 + Math.floor(rnd() * 4);
    for (let i = 0, tries = 0; i < n && tries < 40; tries++) {
      const a = rnd() * Math.PI * 2, d = o.pond * 2.4 + rnd() * o.R * 0.9;
      if (ruinAt(pick(), o.x + Math.cos(a) * d, o.z + Math.sin(a) * d)) i++;
    }
  }
  for (let t = 0, towns = 0; t < 600 && towns < 22; t++) {
    const cx = (rnd() * 2 - 1) * half, cz = (rnd() * 2 - 1) * half;
    if (Math.hypot(cx - CITY.x, cz - CITY.z) < CITY.r * 2 || duneHeight(cx, cz) - duneBase(cx, cz) > 40) continue;
    towns++;
    const n = 3 + Math.floor(rnd() * 5);
    for (let i = 0, tries = 0; i < n && tries < 50; tries++) {
      const a = rnd() * Math.PI * 2, d = 40 + rnd() * 420;
      if (ruinAt(pick(), cx + Math.cos(a) * d, cz + Math.sin(a) * d)) i++;
    }
  }
  // and lone ruins all over the sand
  for (let t = 0, n = 0; t < 5000 && n < 170; t++) {
    const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
    if (Math.hypot(x - CITY.x, z - CITY.z) < CITY.r * 1.6) continue;
    if (ruinAt(pick(), x, z)) n++;
  }
  // crashed jets: anywhere, on any ground (they came down where they came down)
  for (let t = 0, n = 0; t < 3000 && n < 46; t++) {
    const x = (rnd() * 2 - 1) * half, z = (rnd() * 2 - 1) * half;
    if (!free(x, z, CRASH_RADIUS) || nearRunway(x, z, 3000) || !flatEnough(x, z, CRASH_RADIUS, 14)) continue;
    crashes[Math.floor(rnd() * CRASH_VERSIONS)].push({ x, y: ground(x, z, CRASH_RADIUS * 0.5, 0.3), z, yaw: rnd() * Math.PI * 2, range: 12000 });
    taken.push({ x, z, r: CRASH_RADIUS });
    n++;
  }
  return { ruins, crashes };
}

/**
 * One kind-version's copies: an instanced mesh refilled with the ones near the camera. Its model is
 * built after loading, when first wanted (one model a frame, so the loading screen does not wait).
 */
class Copies {
  mesh: THREE.InstancedMesh | null = null;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  constructor(
    private readonly build: () => Geo,
    private readonly mat: THREE.Material,
    readonly list: Placed[],
    private readonly scene: THREE.Scene,
    private readonly onMake?: (geo: Geo, list: Placed[]) => void,
  ) {}
  /** is a copy within its range of the camera? */
  wanted(cam: THREE.Vector3): boolean {
    return this.list.some((s) => (cam.x - s.x) ** 2 + (cam.z - s.z) ** 2 < s.range * s.range);
  }
  make(): void {
    const geo = this.build();
    this.onMake?.(geo, this.list);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, Math.max(1, this.list.length));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.scene.add(this.mesh);
  }
  update(cam: THREE.Vector3): void {
    if (!this.mesh) return;
    let n = 0;
    for (const s of this.list) {
      const dx = cam.x - s.x, dz = cam.z - s.z;
      if (dx * dx + dz * dz > s.range * s.range) continue;
      this.q.setFromAxisAngle(this.up, s.yaw);
      this.m.compose(this.p.set(s.x, s.y, s.z), this.q, this.one);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** The oases' ponds: one flat sheet of water each at the water level, reaching a little under the shore. */
function buildPonds(): THREE.Mesh {
  const parts: Geo[] = [];
  const SEG = 64;
  for (const o of OASES) {
    const pos: number[] = [0, o.level, 0];
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const r = pondRadius(o, a) * 1.12;
      pos.push(Math.cos(a) * r, o.level, Math.sin(a) * r);
    }
    const idx: number[] = [];
    for (let i = 1; i <= SEG; i++) idx.push(0, i + 1, i);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.translate(o.x, 0, o.z);
    g.computeVertexNormals();
    parts.push(g);
  }
  const geo = parts.length ? mergeGeometries(parts, false)! : new THREE.BufferGeometry();
  // still, deep green-blue water: glossy, so it mirrors the sky at a low angle (the scene's sky map) and
  // shows its own colour looking down into it
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.06, 0.2, 0.21, THREE.SRGBColorSpace), roughness: 0.06, metalness: 0, envMapIntensity: 1.3 });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'oasis-ponds';
  m.matrixAutoUpdate = false;
  m.frustumCulled = false;
  return m;
}

/** The Dune Sea's ruins and wrecks in the scene, each site shown within its own range of the camera. */
export class DesertProps {
  private groups: { g: THREE.Mesh; x: number; z: number; range: number }[] = [];
  readonly mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  /** how many sites were placed (for the test pages) */
  readonly count: number;
  readonly stoneCount: number;
  readonly crashCount: number;

  private copies: Copies[] = [];
  private frame = 0;
  private fires: CrashFires;

  /** The crash sites smoulder: the model names its burning spots (local x, y, z, heat); set them alight at every copy. */
  private lightFires(geo: Geo, placed: Placed[]): void {
    const local = (geo.userData.fires as [number, number, number, number][] | undefined) ?? [[0, 0.5, 0, 1]];
    for (const s of placed) {
      const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
      this.fires.add(local.map(([x, y, z, heat]) => ({ x: s.x + x * c + z * sn, y: s.y + y, z: s.z - x * sn + z * c, heat })));
    }
  }

  constructor(scene: THREE.Scene) {
    scene.add(buildPonds());
    this.fires = new CrashFires(scene);
    const { ruins, crashes } = placeStone();
    let k = 0;
    for (const kind of RUIN_KINDS) {
      for (let v = 0; v < VERSIONS; v++, k++) {
        if (!ruins[k].length) continue;
        const seed = 0x400 + k * 17;
        this.copies.push(new Copies(() => buildRuin(kind, mulberry32(seed)), this.mat, ruins[k], scene));
      }
    }
    crashes.forEach((list, v) => {
      if (list.length) this.copies.push(new Copies(() => buildCrashedJet(mulberry32(0x900 + v * 31)), this.mat, list, scene, (geo, placed) => this.lightFires(geo, placed)));
    });
    this.stoneCount = ruins.reduce((n, l) => n + l.length, 0);
    this.crashCount = crashes.reduce((n, l) => n + l.length, 0);
    const sites = buildSites();
    this.count = sites.length;
    for (const s of sites) {
      if (!s.parts.length) continue;
      const geo = mergeGeometries(s.parts, false);
      for (const p of s.parts) p.dispose();
      if (!geo) continue;
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, this.mat);
      m.position.set(s.x, 0, s.z);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.visible = false;
      scene.add(m);
      this.groups.push({ g: m, x: s.x, z: s.z, range: s.range });
    }
  }

  /** Build every model now (the test pages, which take one picture straight away). */
  buildAll(cam: THREE.Vector3): void {
    for (const c of this.copies) {
      if (!c.mesh) c.make();
      c.update(cam);
    }
  }

  update(cam: THREE.Vector3, dt = 1 / 60): void {
    this.fires.update(dt, cam);
    // one model built a frame till all are: the ones wanted near the camera first
    const unbuilt = this.copies.filter((c) => !c.mesh);
    if (unbuilt.length) {
      const c = unbuilt.find((u) => u.wanted(cam)) ?? unbuilt[0];
      c.make();
      c.update(cam);
    }
    // (the copies near the camera, refilled a few times a second)
    if (this.frame++ % 15 === 0) for (const c of this.copies) c.update(cam);
    for (const s of this.groups) {
      const dx = cam.x - s.x, dz = cam.z - s.z;
      s.g.visible = dx * dx + dz * dz < s.range * s.range;
    }
  }
}
