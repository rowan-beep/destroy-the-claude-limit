// Store meshes: AIM-120D AMRAAM, AIM-9X Sidewinder, R-77M, R-74M, external fuel tank,
// plus pylons, LAU-128/LAU-127 style rail launchers and conformal / semi-
// recessed ejector mounts. Vertex-coloured, built along z (nose to -z).

import * as THREE from 'three';
import { lathe, wing, join, colorize, roundBox, rod, P2, loftProfile, stations, curve } from './kit';
import type { StoreType, StationDef } from '../specs';

let cache: Partial<Record<string, THREE.BufferGeometry>> = {};

const WHITE = new THREE.Color('#e4e5e0');
const GREY = new THREE.Color('#b9bdbf');
const RADOME = new THREE.Color('#d7d6cf');
const BAND_Y = new THREE.Color('#d9ae1a');
const BAND_BR = new THREE.Color('#7c5427');
const DOME = new THREE.Color('#2c3036');
const TANK = new THREE.Color('#7c8388');
const PYLON = new THREE.Color('#6f767b');

function paintBands(g: THREE.BufferGeometry, base: THREE.Color, bands: [number, number, THREE.Color][], noseTo?: [number, THREE.Color]): THREE.BufferGeometry {
  return colorize(g, (p, c) => {
    c.copy(base);
    if (noseTo && p.z < noseTo[0]) c.copy(noseTo[1]);
    for (const [z0, z1, col] of bands) if (p.z >= z0 && p.z <= z1) c.copy(col);
  });
}

/** Four cruciform fins around the body axis (x-configuration). */
function cruciform(zLe: number, root: number, tip: number, span: number, sweepZ: number, r: number, t: number, rot = Math.PI / 4): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const f = wing({
      sections: [
        { x: r * 0.92, le: zLe, te: zLe + root, t },
        { x: r + span, le: zLe + sweepZ, te: zLe + sweepZ + tip, t: t * 0.8 },
      ],
      chordPts: 10,
      spanSub: 2,
      tip: 'flat',
      root: 'flat',
      thickPos: 0.5,
    });
    f.rotateZ(rot + (k * Math.PI) / 2);
    out.push(f);
  }
  return out;
}

function aim120(): THREE.BufferGeometry {
  const L = 3.66, r = 0.089;
  const z0 = -L / 2;
  const prof: P2[] = [[0.003, z0]];
  // tangent ogive radome
  for (let k = 1; k <= 12; k++) {
    const u = k / 12;
    prof.push([r * Math.sqrt(1 - (1 - u) * (1 - u)), z0 + u * 0.62]);
  }
  prof.push([r, L / 2 - 0.06], [r * 0.93, L / 2 - 0.01], [r * 0.78, L / 2]);
  const body = paintBands(lathe(prof, 28, 0, 0, false, true), WHITE, [[z0 + 0.8, z0 + 0.86, BAND_Y], [-0.95, -0.89, BAND_BR], [z0 + 0.66, z0 + 0.7, GREY]], [z0 + 0.62, RADOME]);
  const parts: THREE.BufferGeometry[] = [body];
  for (const f of cruciform(-0.55, 0.46, 0.14, 0.2, 0.3, r, 0.05)) parts.push(paintBands(f, WHITE, []));
  for (const f of cruciform(L / 2 - 0.38, 0.33, 0.2, 0.2, 0.12, r, 0.05)) parts.push(paintBands(f, WHITE, []));
  // wiring conduit and hangers
  const conduit = roundBox(0.03, 0.022, 2.1, 0.008);
  conduit.translate(0, r + 0.008, -0.1);
  parts.push(paintBands(conduit, WHITE, []));
  for (const z of [-0.55, 0.45]) {
    const h = roundBox(0.03, 0.03, 0.06, 0.008);
    h.translate(0, r + 0.02, z);
    parts.push(paintBands(h, GREY, []));
  }
  return join(parts);
}

function aim9x(): THREE.BufferGeometry {
  const L = 3.02, r = 0.0635;
  const z0 = -L / 2;
  const prof: P2[] = [];
  // seeker dome (hemisphere) and a short tapered forward section
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * (Math.PI / 2);
    prof.push([Math.max(0.003, Math.sin(a) * r * 0.78), z0 + (1 - Math.cos(a)) * r * 0.78]);
  }
  prof.push([r * 0.86, z0 + 0.12], [r, z0 + 0.3], [r, L / 2 - 0.05], [r * 0.9, L / 2]);
  const body = paintBands(lathe(prof, 24, 0, 0, false, true), GREY, [[z0 + 0.42, z0 + 0.47, BAND_Y], [-0.2, -0.15, BAND_BR], [z0 + 0.3, z0 + 0.36, WHITE]], [z0 + r * 0.7, DOME]);
  const parts: THREE.BufferGeometry[] = [body];
  // small fixed strakes forward, clipped-tip control fins aft (no rollerons on the 9X)
  for (const f of cruciform(z0 + 0.5, 0.36, 0.3, 0.035, 0.04, r, 0.06)) parts.push(paintBands(f, GREY, []));
  for (const f of cruciform(L / 2 - 0.32, 0.28, 0.12, 0.13, 0.14, r, 0.06)) parts.push(paintBands(f, GREY, []));
  const conduit = roundBox(0.024, 0.018, 1.6, 0.006);
  conduit.translate(0, r + 0.006, 0.1);
  parts.push(paintBands(conduit, GREY, []));
  return join(parts);
}

const RU_BODY = new THREE.Color('#c9cfcf');
const RU_GREY = new THREE.Color('#8e9899');
const RU_DOME = new THREE.Color('#e7e5dc');
const RU_BAND = new THREE.Color('#3f6f4a');
const RU_BAND2 = new THREE.Color('#9b2a22');
const GLASS = new THREE.Color('#1c2126');

/** R-77M: ogive radome, long low strakes along the body, four tail control fins. */
function r77m(): THREE.BufferGeometry {
  const L = 3.71, r = 0.1;
  const z0 = -L / 2;
  const prof: P2[] = [[0.003, z0]];
  for (let k = 1; k <= 14; k++) {
    const u = k / 14;
    prof.push([r * Math.pow(1 - (1 - u) * (1 - u), 0.85), z0 + u * 0.7]);
  }
  prof.push([r, L / 2 - 0.1], [r * 0.9, L / 2 - 0.02], [r * 0.72, L / 2]);
  const body = paintBands(lathe(prof, 30, 0, 0, false, true), RU_BODY, [[z0 + 0.86, z0 + 0.93, RU_BAND], [-0.3, -0.24, RU_BAND2], [z0 + 0.7, z0 + 0.75, RU_GREY]], [z0 + 0.7, RU_DOME]);
  const parts: THREE.BufferGeometry[] = [body];
  // long, very low aspect-ratio mid-body wings
  for (const f of cruciform(-0.95, 1.25, 0.9, 0.09, 0.3, r, 0.035)) parts.push(paintBands(f, RU_BODY, []));
  // tail control fins
  for (const f of cruciform(L / 2 - 0.46, 0.4, 0.2, 0.24, 0.2, r, 0.045)) parts.push(paintBands(f, RU_GREY, []));
  const conduit = roundBox(0.034, 0.024, 2.2, 0.008);
  conduit.translate(0, r + 0.008, 0);
  parts.push(paintBands(conduit, RU_GREY, []));
  for (const z of [-0.6, 0.55]) {
    const h = roundBox(0.03, 0.035, 0.07, 0.008);
    h.translate(0, r + 0.022, z);
    parts.push(paintBands(h, RU_GREY, []));
  }
  return join(parts);
}

/** R-74M: glass seeker dome, destabilisers and canards up front, tail fins with rollerons. */
function r74m(): THREE.BufferGeometry {
  const L = 2.92, r = 0.085;
  const z0 = -L / 2;
  const prof: P2[] = [];
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * (Math.PI / 2);
    prof.push([Math.max(0.003, Math.sin(a) * r * 0.8), z0 + (1 - Math.cos(a)) * r * 0.8]);
  }
  prof.push([r * 0.86, z0 + 0.13], [r, z0 + 0.34], [r, L / 2 - 0.05], [r * 0.88, L / 2]);
  const body = paintBands(lathe(prof, 26, 0, 0, false, true), RU_BODY, [[z0 + 0.5, z0 + 0.56, RU_BAND], [0.1, 0.16, RU_BAND2], [z0 + 0.34, z0 + 0.38, RU_GREY]], [z0 + r * 0.75, GLASS]);
  const parts: THREE.BufferGeometry[] = [body];
  // small triangular destabilisers ahead of the canards
  for (const f of cruciform(z0 + 0.14, 0.12, 0.02, 0.07, 0.1, r * 0.9, 0.03, 0)) parts.push(paintBands(f, RU_GREY, []));
  // canards
  for (const f of cruciform(z0 + 0.36, 0.26, 0.1, 0.15, 0.14, r, 0.04, 0)) parts.push(paintBands(f, RU_BODY, []));
  // tail fins with rollerons
  for (const f of cruciform(L / 2 - 0.42, 0.38, 0.2, 0.2, 0.18, r, 0.045, 0)) parts.push(paintBands(f, RU_BODY, []));
  for (let k = 0; k < 4; k++) {
    const rr = lathe([[0.003, -0.03], [0.03, -0.02], [0.032, 0.02], [0.003, 0.03]], 12);
    rr.rotateY(Math.PI / 2);
    const a = (k * Math.PI) / 2;
    rr.translate(Math.cos(a) * (r + 0.19), Math.sin(a) * (r + 0.19), L / 2 - 0.12);
    parts.push(paintBands(rr, RU_GREY, []));
  }
  const conduit = roundBox(0.026, 0.02, 1.6, 0.006);
  conduit.translate(0, r + 0.006, 0.1);
  parts.push(paintBands(conduit, RU_GREY, []));
  return join(parts);
}

function tank(): THREE.BufferGeometry {
  const L = 5.0, r = 0.38;
  const R = curve([[-2.5, 0.01], [-2.1, 0.2], [-1.4, 0.34], [-0.6, r], [1.0, r], [1.9, 0.27], [2.4, 0.1], [2.5, 0.02]]);
  const prof: P2[] = stations(-L / 2, L / 2, 40, 0.2, 0.2).map((z) => [Math.max(0.004, R(z)), z] as P2);
  const parts: THREE.BufferGeometry[] = [paintBands(lathe(prof, 36, 0, 0, true, true), TANK, [[-0.62, -0.6, new THREE.Color('#5a6166')], [1.2, 1.22, new THREE.Color('#5a6166')]])];
  for (let k = 0; k < 3; k++) {
    const f = wing({ sections: [{ x: r * 0.5, le: 1.4, te: 2.2, t: 0.06 }, { x: r + 0.26, le: 1.85, te: 2.25, t: 0.05 }], chordPts: 10, spanSub: 2, tip: 'round', root: 'flat' });
    f.rotateZ(-Math.PI / 2 + (k - 1) * ((2 * Math.PI) / 3));
    parts.push(paintBands(f, TANK, []));
  }
  return join(parts);
}

export function storeGeometry(t: StoreType): THREE.BufferGeometry {
  const key = t;
  if (cache[key]) return cache[key]!;
  const g = t === 'AIM120D' ? aim120() : t === 'AIM9X' ? aim9x() : t === 'R77M' ? r77m() : t === 'R74M' ? r74m() : tank();
  cache[key] = g;
  return g;
}

/** Streamlined pylon: airfoil-section blade from the wing down to the store. */
function pylonBlade(h: number, len: number, thick: number): THREE.BufferGeometry {
  const half = len / 2;
  const W = curve([[-half, 0.2], [-half * 0.6, 0.85], [half * 0.4, 1], [half, 0.35]]);
  return loftProfile({
    stations: stations(-half, half, 20, 0.2, 0.2),
    profile: (z) => {
      const w = (thick / 2) * W(z);
      return [[0, 0], [w * 0.8, 0.01], [w, h * 0.5], [w * 0.9, h], [0, h]] as P2[];
    },
    sub: 3,
    capStart: true,
    capEnd: true,
  });
}

/** Missile rail launcher (LAU-127/128 style, or a chunkier Russian APU-170 / P-72) above the store. */
function launcher(len: number, r: number, russian = false): THREE.BufferGeometry {
  const body = russian ? roundBox(0.15, 0.14, len, 0.04) : roundBox(0.1, 0.1, len, 0.03);
  body.translate(0, r + 0.08, 0.05);
  const nose = lathe([[0.002, -len / 2 - 0.12], [0.045, -len / 2 - 0.02], [0.05, -len / 2 + 0.05]], 12);
  nose.translate(0, r + 0.08, 0.05);
  const rail = roundBox(0.05, 0.02, len * 0.95, 0.006);
  rail.translate(0, r + 0.03, 0.05);
  return join([body, nose, rail]);
}

/** Store radius (m). */
export function storeRadius(store: StoreType): number {
  return store === 'TANK' ? 0.38 : store === 'AIM120D' ? 0.089 : store === 'R77M' ? 0.1 : store === 'R74M' ? 0.085 : 0.064;
}

/** Pylon height below the wing for a hung store. */
export const PYLON_DROP = 0.3;
/** Twin-rack shoulder missiles: centre line this far below the wing underside. */
export const SHOULDER_DROP = 0.25;

/** A missile riding a shoulder rail of a twin rack (not a tank). */
export function onShoulder(def: StationDef, store: StoreType): boolean {
  return def.rack !== undefined && def.hang !== undefined && store !== 'TANK';
}

/** Sideways position of the store: a tank on a twin rack hangs from the pylon centre. */
export function storeCenterX(def: StationDef, store: StoreType): number {
  return def.rack !== undefined && store === 'TANK' ? def.rack : def.pos[0];
}

/**
 * Height of the store's centre line at a station: hung below the wing
 * underside by the pylon (or rail) and its own radius, or the fixed pos[1].
 */
export function storeCenterY(def: StationDef, store: StoreType): number {
  if (def.hang === undefined) return def.pos[1];
  if (onShoulder(def, store)) return def.hang - SHOULDER_DROP;
  const r = storeRadius(store);
  if (def.mount === 'rail') return def.hang - (r + 0.13);
  if (def.mount === 'pylon') return def.hang - (r + 0.02 + PYLON_DROP);
  return def.hang - (r + 0.06);
}

/** Pylon / launcher between the airframe and the store. */
export function pylonGeometry(mount: string, store: StoreType, drop: number): THREE.BufferGeometry {
  const key = `pylon-${mount}-${store}-${drop.toFixed(2)}`;
  if (cache[key]) return cache[key]!;
  const r = storeRadius(store);
  const ir = store === 'AIM9X' || store === 'R74M';
  const col = (g: THREE.BufferGeometry) => colorize(g, (_p, c) => c.copy(PYLON));
  let g: THREE.BufferGeometry;
  if (mount === 'rail') {
    g = col(launcher(ir ? 2.1 : 2.5, r));
  } else if (mount === 'conformal' || mount === 'semi-recessed') {
    // ejector: a shallow fairing with two sway-brace pads
    const f = roundBox(0.14, 0.06, 1.8, 0.02);
    f.translate(0, r + 0.03, 0);
    const pads = [-0.4, 0.4].flatMap((z) => [-1, 1].map((s) => rod(new THREE.Vector3(s * 0.05, r + 0.03, z), new THREE.Vector3(s * 0.07, r * 0.75, z), 0.012, 0.012, 6)));
    g = col(join([f, ...pads]));
  } else {
    const h = Math.max(0.14, drop);
    const blade = pylonBlade(h, store === 'TANK' ? 2.4 : 2.1, 0.12);
    blade.translate(0, r + 0.02, -0.1);
    const parts = [blade];
    const ru = store === 'R77M' || store === 'R74M';
    if (store !== 'TANK') parts.push(launcher(ru ? (ir ? 2.3 : 3.0) : ir ? 2.0 : 2.4, r, ru));
    else for (const z of [-0.6, 0.5]) for (const s of [-1, 1]) parts.push(rod(new THREE.Vector3(s * 0.05, r + 0.05, z), new THREE.Vector3(s * 0.16, r * 0.8, z), 0.015, 0.015, 6));
    g = col(join(parts));
  }
  cache[key] = g;
  return g;
}

/**
 * Twin-rack shoulder mount, in the missile's frame: the shared pylon blade
 * `dx` to one side (from the wing, `top` above, down past the missile) and a
 * LAU-128 style launcher bridging from the pylon's flank to the missile.
 */
export function shoulderGeometry(store: StoreType, dx: number, top: number): THREE.BufferGeometry {
  const key = `shoulder-${store}-${dx.toFixed(2)}-${top.toFixed(2)}`;
  if (cache[key]) return cache[key]!;
  const r = storeRadius(store);
  const ir = store === 'AIM9X' || store === 'R74M';
  const s = Math.sign(dx) || 1;
  const bottom = r + 0.12;
  const blade = pylonBlade(top + bottom, 2.3, 0.13);
  blade.translate(dx, -bottom, -0.1);
  const len = ir ? 2.0 : 2.4;
  const reach = Math.abs(dx) - 0.06 - r * 0.35;
  const body = roundBox(reach, 0.085, len, 0.025);
  body.translate(s * (r * 0.35 + reach / 2), r * 0.55, 0.05);
  const nose = lathe([[0.002, -len / 2 - 0.12], [0.04, -len / 2 - 0.02], [0.045, -len / 2 + 0.05]], 12);
  nose.translate(s * (r * 0.35 + reach * 0.55), r * 0.55, 0.05);
  const rail = roundBox(0.04, 0.02, len * 0.92, 0.006);
  rail.translate(s * r * 0.55, r * 0.78, 0.05);
  const g = colorize(join([blade, body, nose, rail]), (_p, c) => c.copy(PYLON));
  cache[key] = g;
  return g;
}

export function clearStoreCache(): void {
  cache = {};
}
