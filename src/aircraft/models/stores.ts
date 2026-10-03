// Store meshes: AIM-120D AMRAAM, AIM-9X Sidewinder, R-77M, R-74M, Meteor, MICA IR, external fuel tank,
// plus pylons, LAU-128/LAU-127 style rail launchers and conformal / semi-
// recessed ejector mounts. Vertex-coloured, built along z (nose to -z).

import * as THREE from 'three';
import { lathe, wing, join, colorize, roundBox, rod, P2, loftProfile, stations, curve } from './kit';
import type { StoreType, StationDef } from '../specs';
import { isBomb } from '../../weapons/weaponSpecs';

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

/**
 * R-37M: a 4.2 m, 380 mm round. Long ogive radome, a plain cylindrical body
 * with a cable conduit along the top, and four clipped-delta tail fins (the
 * R-37M has no mid-body wings), the long-range motor filling most of it.
 */
function r37m(): THREE.BufferGeometry {
  const L = 4.2, r = 0.19;
  const z0 = -L / 2;
  const prof: P2[] = [[0.004, z0]];
  for (let k = 1; k <= 16; k++) {
    const u = k / 16;
    prof.push([r * Math.pow(1 - (1 - u) * (1 - u), 0.8), z0 + u * 0.95]);
  }
  prof.push([r, L / 2 - 0.16], [r * 0.93, L / 2 - 0.05], [r * 0.78, L / 2]);
  const body = paintBands(lathe(prof, 32, 0, 0, false, true), RU_BODY, [[z0 + 1.1, z0 + 1.18, RU_BAND], [0.35, 0.42, RU_BAND2], [z0 + 0.95, z0 + 1.0, RU_GREY]], [z0 + 0.95, RU_DOME]);
  const parts: THREE.BufferGeometry[] = [body];
  // clipped-delta tail control fins
  for (const f of cruciform(L / 2 - 0.62, 0.56, 0.24, 0.3, 0.26, r, 0.05)) parts.push(paintBands(f, RU_GREY, []));
  const conduit = roundBox(0.05, 0.03, 2.6, 0.01);
  conduit.translate(0, r + 0.01, -0.1);
  parts.push(paintBands(conduit, RU_GREY, []));
  for (const z of [-0.8, 0.75]) {
    const h = roundBox(0.04, 0.045, 0.09, 0.01);
    h.translate(0, r + 0.028, z);
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

const EU_BODY = new THREE.Color('#dcdcd6');
const EU_GREY = new THREE.Color('#a7abab');
const EU_BAND = new THREE.Color('#c9a43a');
const EU_BAND2 = new THREE.Color('#7a5b2d');

/**
 * Meteor: ogive radome, a smooth body with no mid wings, and the ducted
 * rocket's two box air intakes low on its flanks, feeding the ramjet in the
 * tail. Four small tail control fins.
 */
function meteor(): THREE.BufferGeometry {
  const L = 3.65, r = 0.089;
  const z0 = -L / 2;
  const prof: P2[] = [[0.003, z0]];
  for (let k = 1; k <= 14; k++) {
    const u = k / 14;
    prof.push([r * Math.sqrt(1 - (1 - u) * (1 - u)), z0 + u * 0.66]);
  }
  prof.push([r, L / 2 - 0.08], [r * 0.9, L / 2 - 0.01], [r * 0.74, L / 2]);
  const body = paintBands(lathe(prof, 30, 0, 0, false, true), EU_BODY, [[z0 + 0.84, z0 + 0.9, EU_BAND], [-0.4, -0.35, EU_BAND2], [z0 + 0.66, z0 + 0.7, EU_GREY]], [z0 + 0.66, RADOME]);
  const parts: THREE.BufferGeometry[] = [body];
  // the two ramjet air intakes: boxes on the lower flanks with ramped fronts
  for (const s of [-1, 1]) {
    const a = s * (Math.PI * 0.5 + 0.62); // about 4 and 8 o'clock
    const cx = Math.cos(a) * (r + 0.02), cy = Math.sin(a) * (r + 0.02);
    const duct = loftProfile({
      stations: stations(-0.1, 1.25, 12),
      profile: (z) => {
        const u = Math.min(1, (z + 0.1) / 0.3);
        const w = 0.048, h = 0.05 * (0.35 + 0.65 * u);
        return [[-w, -h], [w, -h], [w, h], [-w, h]] as P2[];
      },
      sub: 1,
      full: true,
      capStart: true,
      capEnd: true,
    });
    duct.rotateZ(a + Math.PI / 2);
    duct.translate(cx, cy, 0);
    parts.push(paintBands(duct, EU_GREY, []));
  }
  // tail control fins, in the gaps between the intakes
  for (const f of cruciform(L / 2 - 0.4, 0.36, 0.2, 0.17, 0.16, r, 0.045)) parts.push(paintBands(f, EU_BODY, []));
  const conduit = roundBox(0.03, 0.022, 2.0, 0.008);
  conduit.translate(0, r + 0.008, -0.2);
  parts.push(paintBands(conduit, EU_GREY, []));
  for (const z of [-0.6, 0.45]) {
    const h = roundBox(0.03, 0.03, 0.06, 0.008);
    h.translate(0, r + 0.02, z);
    parts.push(paintBands(h, EU_GREY, []));
  }
  return join(parts);
}

/** MICA IR: glass imaging-IR dome, long low strakes along the body, four tail fins. */
function micaIr(): THREE.BufferGeometry {
  const L = 3.1, r = 0.08;
  const z0 = -L / 2;
  const prof: P2[] = [];
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * (Math.PI / 2);
    prof.push([Math.max(0.003, Math.sin(a) * r * 0.82), z0 + (1 - Math.cos(a)) * r * 0.82]);
  }
  prof.push([r * 0.88, z0 + 0.14], [r, z0 + 0.34], [r, L / 2 - 0.05], [r * 0.88, L / 2]);
  const body = paintBands(lathe(prof, 26, 0, 0, false, true), EU_BODY, [[z0 + 0.46, z0 + 0.52, EU_BAND], [0.2, 0.25, EU_BAND2], [z0 + 0.34, z0 + 0.38, EU_GREY]], [z0 + r * 0.75, GLASS]);
  const parts: THREE.BufferGeometry[] = [body];
  // long, very low strakes from the seeker section to the tail fins
  for (const f of cruciform(z0 + 0.55, 1.75, 1.35, 0.06, 0.35, r, 0.03)) parts.push(paintBands(f, EU_BODY, []));
  // tail control fins
  for (const f of cruciform(L / 2 - 0.36, 0.33, 0.18, 0.17, 0.15, r, 0.045)) parts.push(paintBands(f, EU_BODY, []));
  const conduit = roundBox(0.026, 0.02, 1.7, 0.006);
  conduit.translate(0, r + 0.006, 0.05);
  parts.push(paintBands(conduit, EU_GREY, []));
  return join(parts);
}

function tank(): THREE.BufferGeometry {
  const L = 5.0, r = 0.38;
  const R = curve([[-2.5, 0.01], [-2.1, 0.2], [-1.4, 0.34], [-0.6, r], [1.0, r], [1.9, 0.27], [2.4, 0.1], [2.5, 0.02]]);
  const prof: P2[] = stations(-L / 2, L / 2, 40, 0.2, 0.2).map((z) => [Math.max(0.004, R(z)), z] as P2);
  return paintBands(lathe(prof, 36, 0, 0, true, true), TANK, [[-0.62, -0.6, new THREE.Color('#5a6166')], [1.2, 1.22, new THREE.Color('#5a6166')]]);
}

/** X-15 drop tank: a long, slim propellant tank in the jet's own black, a bare-metal nose cap and a thin NASA-yellow band. */
function x15Tank(): THREE.BufferGeometry {
  const L = 6.9, r = 0.42;
  const R = curve([[-3.45, 0.01], [-3.1, 0.15], [-2.5, 0.31], [-1.7, r], [2.4, r], [3.0, 0.34], [3.38, 0.2], [3.45, 0.06]]);
  const prof: P2[] = stations(-L / 2, L / 2, 50, 0.2, 0.2).map((z) => [Math.max(0.004, R(z)), z] as P2);
  const black = new THREE.Color('#1b1c1f');
  return paintBands(lathe(prof, 40, 0, 0, true, true), black, [
    [-3.5, -3.05, new THREE.Color('#a9adb1')],
    [-1.25, -1.1, new THREE.Color('#e8bb18')],
    [3.3, 3.5, new THREE.Color('#2c2e31')],
  ]);
}

// ---------------------------------------------------------------------------
// Guided bombs
// ---------------------------------------------------------------------------

const OLIVE = new THREE.Color('#596047');
const KIT = new THREE.Color('#8b9092');
const KIT_DARK = new THREE.Color('#5e6366');
const LIVE = new THREE.Color('#d9ae1a');
const SAND = new THREE.Color('#b5ad93');

/** Low-drag general purpose bomb body (Mk 80 series): ogive nose, parallel body, boat-tail cone. */
function gpBody(L: number, r: number, noseLen: number, tailLen: number, col: THREE.Color, bands: [number, number, THREE.Color][]): THREE.BufferGeometry {
  const z0 = -L / 2;
  const prof: P2[] = [[0.004, z0]];
  for (let k = 1; k <= 12; k++) {
    const u = k / 12;
    prof.push([r * Math.pow(1 - (1 - u) * (1 - u), 0.9), z0 + u * noseLen]);
  }
  prof.push([r, L / 2 - tailLen], [r * 0.82, L / 2 - tailLen * 0.45], [r * 0.6, L / 2]);
  return paintBands(lathe(prof, 30, 0, 0, false, true), col, bands);
}

/** Tail fin set (x-configuration) on a short tail cone. */
function tailKit(L: number, r: number, root: number, span: number, col: THREE.Color): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const cone = lathe([[r * 0.62, L / 2 - 0.02], [r * 0.66, L / 2 + 0.28], [r * 0.5, L / 2 + 0.36]], 20, 0, 0, false, true);
  parts.push(paintBands(cone, col, []));
  for (const f of cruciform(L / 2 - root * 0.4, root, root * 0.7, span, root * 0.28, r * 0.6, 0.035)) parts.push(paintBands(f, col, []));
  return parts;
}

/** Suspension lugs on top (14 in / 30 in apart). */
function lugs(r: number, gap: number): THREE.BufferGeometry[] {
  return [-gap / 2, gap / 2].map((z) => {
    const g = roundBox(0.05, 0.05, 0.06, 0.01);
    g.translate(0, r + 0.02, z);
    return paintBands(g, KIT_DARK, []);
  });
}

/** GBU-31 / GBU-32 JDAM: Mk 84 / Mk 83 body, strake kit, JDAM tail. */
function jdam(big: boolean): THREE.BufferGeometry {
  const L = big ? 3.3 : 2.62, r = big ? 0.23 : 0.18;
  const parts: THREE.BufferGeometry[] = [gpBody(L, r, L * 0.36, L * 0.16, OLIVE, [[-L / 2 + L * 0.22, -L / 2 + L * 0.25, LIVE], [L * 0.1, L * 0.13, LIVE]])];
  // the JDAM tail section and fins
  parts.push(...tailKit(L, r, big ? 0.46 : 0.38, big ? 0.27 : 0.21, KIT));
  // strakes: long flat plates either side of the body
  for (const sx of [-1, 1]) {
    const st = roundBox(0.14, 0.012, L * 0.34, 0.005);
    st.rotateZ(sx * 0.35);
    st.translate(sx * (r + 0.05), r * 0.35, -0.1);
    parts.push(paintBands(st, KIT, []));
  }
  parts.push(...lugs(r, big ? 0.76 : 0.36));
  return join(parts);
}

/** GBU-39 SDB: slim body, folded diamond-back wings on top, small tail fins. */
function sdb(): THREE.BufferGeometry {
  const L = 1.8, r = 0.095;
  const z0 = -L / 2;
  const prof: P2[] = [[0.004, z0], [r * 0.55, z0 + 0.06], [r * 0.9, z0 + 0.2], [r, z0 + 0.4], [r, L / 2 - 0.1], [r * 0.8, L / 2]];
  const parts: THREE.BufferGeometry[] = [paintBands(lathe(prof, 24, 0, 0, false, true), KIT, [[z0 + 0.45, z0 + 0.48, LIVE]])];
  const wings = roundBox(0.16, 0.02, 1.2, 0.006);
  wings.translate(0, r + 0.012, 0.05);
  parts.push(paintBands(wings, KIT_DARK, []));
  for (const f of cruciform(L / 2 - 0.24, 0.22, 0.14, 0.09, 0.06, r, 0.02)) parts.push(paintBands(f, KIT, []));
  return join(parts);
}

/** Paveway IV: Mk 82 body, nose guidance section with canards, pop-out tail wings. */
function paveway4(): THREE.BufferGeometry {
  const L = 2.6, r = 0.137;
  const parts: THREE.BufferGeometry[] = [gpBody(L, r, 0.7, 0.35, OLIVE, [[-0.5, -0.46, LIVE]])];
  // seeker nose: a short glass dome on a grey section
  const nose = lathe([[0.004, -L / 2 - 0.42], [0.07, -L / 2 - 0.36], [0.11, -L / 2 - 0.18], [r * 0.95, -L / 2 + 0.05]], 20, 0, 0, false, true);
  parts.push(paintBands(nose, KIT, [], [-L / 2 - 0.34, GLASS]));
  for (const f of cruciform(-L / 2 - 0.2, 0.16, 0.1, 0.1, 0.05, 0.1, 0.02)) parts.push(paintBands(f, KIT, []));
  parts.push(...tailKit(L, r, 0.34, 0.2, KIT));
  parts.push(...lugs(r, 0.36));
  return join(parts);
}

/** AASM Hammer: guidance nose, bomb body with folded wing kit, rocket tail with fins. */
function aasm(): THREE.BufferGeometry {
  const L = 3.1, r = 0.15;
  const z0 = -L / 2;
  const prof: P2[] = [[0.004, z0], [0.07, z0 + 0.06], [0.12, z0 + 0.2], [r, z0 + 0.42], [r, L / 2 - 0.2], [r * 0.9, L / 2]];
  const parts: THREE.BufferGeometry[] = [paintBands(lathe(prof, 26, 0, 0, false, true), SAND, [[z0 + 0.42, z0 + 0.46, KIT_DARK], [0.25, 0.3, KIT_DARK]], [z0 + 0.1, GLASS])];
  const wing = roundBox(0.2, 0.025, 1.0, 0.008);
  wing.translate(0, r + 0.015, -0.2);
  parts.push(paintBands(wing, KIT_DARK, []));
  for (const f of cruciform(L / 2 - 0.36, 0.34, 0.2, 0.17, 0.12, r, 0.03)) parts.push(paintBands(f, SAND, []));
  const noz = lathe([[r * 0.6, L / 2], [r * 0.55, L / 2 + 0.06]], 16, 0, 0, false, false);
  parts.push(paintBands(noz, KIT_DARK, []));
  return join(parts);
}

/** KAB-500S: long ogive, cruciform mid wings and tail fins. */
function kab500(): THREE.BufferGeometry {
  const L = 3.0, r = 0.2;
  const parts: THREE.BufferGeometry[] = [gpBody(L, r, 1.0, 0.45, RU_GREY, [[-0.45, -0.4, RU_BAND2]])];
  for (const f of cruciform(-0.35, 0.7, 0.55, 0.1, 0.12, r, 0.03)) parts.push(paintBands(f, RU_GREY, []));
  for (const f of cruciform(L / 2 - 0.42, 0.42, 0.3, 0.22, 0.12, r * 0.62, 0.035)) parts.push(paintBands(f, RU_GREY, []));
  parts.push(...lugs(r, 0.5));
  return join(parts);
}

export function storeGeometry(t: StoreType, jet?: string): THREE.BufferGeometry {
  if (t === 'TANK' && jet === 'X15') return (cache['X15TANK'] ??= x15Tank());
  const key = t;
  if (cache[key]) return cache[key]!;
  const g =
    t === 'AIM120D' ? aim120() : t === 'AIM9X' ? aim9x() : t === 'R77M' ? r77m() : t === 'R74M' ? r74m() : t === 'METEOR' ? meteor() : t === 'MICAIR' ? micaIr() : t === 'R37M' ? r37m()
    : t === 'GBU31' ? jdam(true) : t === 'GBU32' ? jdam(false) : t === 'GBU39' ? sdb() : t === 'PAVEWAY4' ? paveway4() : t === 'AASM' ? aasm() : t === 'KAB500' ? kab500() : tank();
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
  if (store === 'GBU31') return 0.23;
  if (store === 'GBU32' || store === 'KAB500') return 0.19;
  if (store === 'PAVEWAY4') return 0.14;
  if (store === 'AASM') return 0.16;
  if (store === 'GBU39') return 0.1;
  if (store === 'R37M') return 0.19;
  return store === 'TANK' ? 0.38 : store === 'AIM120D' ? 0.089 : store === 'R77M' ? 0.1 : store === 'R74M' ? 0.085 : store === 'METEOR' ? 0.089 : store === 'MICAIR' ? 0.08 : 0.064;
}

/** Pylon height below the wing for a hung store. */
export const PYLON_DROP = 0.3;
/** Twin-rack shoulder missiles: centre line this far below the wing underside. */
export const SHOULDER_DROP = 0.25;

/** A missile riding a shoulder rail of a twin rack (not a tank). */
export function onShoulder(def: StationDef, store: StoreType): boolean {
  return def.rack !== undefined && def.hang !== undefined && !hungOnRack(store);
}

/** Stores that hang from a pylon's bomb rack (ejector and sway braces), not a missile rail. */
export function hungOnRack(store: StoreType): boolean {
  return store === 'TANK' || isBomb(store);
}

/** Sideways position of the store: a tank on a twin rack hangs from the pylon centre. */
export function storeCenterX(def: StationDef, store: StoreType): number {
  return def.rack !== undefined && hungOnRack(store) ? def.rack : def.pos[0];
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
  const ir = store === 'AIM9X' || store === 'R74M' || store === 'MICAIR';
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
    const ru = store === 'R77M' || store === 'R74M' || store === 'R37M';
    if (!hungOnRack(store)) parts.push(launcher(ru ? (ir ? 2.3 : 3.0) : ir ? 2.0 : 2.4, r, ru));
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
  const ir = store === 'AIM9X' || store === 'R74M' || store === 'MICAIR';
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
