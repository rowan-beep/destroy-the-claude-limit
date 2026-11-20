// Each jet's own missile racks: the pylons, launchers and ejectors of the real aircraft, drawn from
// photographs of each one and fitted to the airframe's skin (the pylon's top follows the wing or
// fuselage underside it hangs from, measured from the models; see SKIN at the end).
//
// A jet with an entry in RACKS has every loaded external station drawn here; anything else (a new
// jet, a station with no skin data) falls back to the generic pylons in stores.ts.

import * as THREE from 'three';
import { join, colorize, roundBox, rod, P2, loftProfile, stations } from './kit';
import type { AircraftSpec, StationDef, StoreType } from '../specs';
import { storeCenterX, storeCenterY, storeRadius, hungOnRack, onShoulder } from './stores';

type V3 = THREE.Vector3;
const v3 = (x: number, y: number, z: number): V3 => new THREE.Vector3(x, y, z);
// (rounded boxes with one bevel step: the small fittings need no more, and the racks stay as light as the old pylons)
const rb = (w: number, h: number, d: number, r: number, seg = 1) => roundBox(w, h, d, r, seg);

// ---------------------------------------------------------------------------
// The skin above a station
// ---------------------------------------------------------------------------

/** skin height (body y) above a station: 9 samples 0.35 m apart, centred on z (null: no skin there) */
export interface Skin {
  x: number;
  z: number;
  y: (number | null)[];
}
const SKIN_STEP = 0.35;

/** The skin under the jet at a station's x, as a function of z (held flat past the measured ends). */
function skinFn(s: Skin): (z: number) => number {
  const n = s.y.length;
  const ys = s.y.slice();
  // fill gaps from the nearest measured sample (ahead of a leading edge the pylon keeps the edge's height)
  for (let i = 0; i < n; i++)
    if (ys[i] === null) {
      let best: number | null = null;
      for (let d = 1; d < n && best === null; d++) best = ys[i + d] ?? ys[i - d] ?? null;
      ys[i] = best ?? 0;
    }
  const z0 = s.z - ((n - 1) / 2) * SKIN_STEP;
  return (z: number) => {
    const u = Math.min(n - 1, Math.max(0, (z - z0) / SKIN_STEP));
    const i = Math.min(n - 2, Math.floor(u));
    const f = u - i;
    return (ys[i] as number) * (1 - f) + (ys[i + 1] as number) * f;
  };
}

/** The first and last z with skin above (for a pylon that must stay under the wing; open-ended where the skin runs past the samples). */
function skinSpan(s: Skin): [number, number] {
  const n = s.y.length;
  const z0 = s.z - ((n - 1) / 2) * SKIN_STEP;
  let a = -1, b = -1;
  for (let i = 0; i < n; i++) if (s.y[i] !== null) { if (a < 0) a = i; b = i; }
  return [a <= 0 ? -Infinity : z0 + a * SKIN_STEP, b < 0 || b === n - 1 ? Infinity : z0 + b * SKIN_STEP];
}

function skinFor(type: string, x: number, z: number): Skin | null {
  const t = SKIN[type];
  if (!t) return null;
  let best: Skin | null = null, bd = 0.08;
  for (const s of Object.values(t)) {
    const d = Math.abs(s.x - x) + Math.abs(s.z - z);
    if (d < bd) (bd = d), (best = s);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

const C = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const paint = (g: THREE.BufferGeometry, c: THREE.Color) => colorize(g, (_p, o) => o.copy(c));

/**
 * A pylon: a slab between the skin and its keel, from z0 (front) to z1 (rear). Its top follows the
 * skin (sunk a little into it), its nose is rounded down from the top to the keel over `nose`, its
 * tail tapers over `tail`. `noseCut` sweeps the nose's lower edge back (0 a blunt round nose, 1 a
 * long raked edge from the top at z0 to the keel at z0 + nose).
 */
interface SlabOpts {
  x: number;
  z0: number;
  z1: number;
  top: (z: number) => number;
  bot: (z: number) => number;
  half: number;
  nose: number;
  tail: number;
  noseCut?: number;
  /** tail: how far up its lower edge rises at the very end (0..1 of the depth) */
  tailRise?: number;
  /** narrow the slab's lower part (an airfoil-like section): keel half-width as a fraction */
  keel?: number;
  /** roll the whole section about the pylon's top line (radians; + leans the keel to +x) */
  cant?: number;
  /** the keel's corner radius as a fraction of the depth (0.25 a rounded keel; small for a boxy pylon) */
  round?: number;
}

function slab(o: SlabOpts): THREE.BufferGeometry {
  const zs = stations(o.z0, o.z1, 18, 0.35, 0.2);
  const cut = o.noseCut ?? 0;
  const rise = o.tailRise ?? 0.55;
  const keel = o.keel ?? 0.85;
  const g = loftProfile({
    stations: zs,
    profile: (z) => {
      const yt = o.top(z);
      const yb0 = Math.min(o.bot(z), yt - 0.02);
      const h = yt - yb0;
      let w = o.half;
      let yb = yb0;
      const u0 = Math.min(1, Math.max(0, (z - o.z0) / Math.max(1e-3, o.nose)));
      const u1 = Math.min(1, Math.max(0, (o.z1 - z) / Math.max(1e-3, o.tail)));
      if (u0 < 1) {
        const e = Math.sqrt(1 - (1 - u0) * (1 - u0));
        const k = e * (1 - cut) + u0 * cut;
        yb = yt - h * Math.max(0.06, k);
        w *= 0.3 + 0.7 * e;
      }
      if (u1 < 1) {
        const e = Math.sqrt(1 - (1 - u1) * (1 - u1));
        yb = Math.max(yb, yb0 + h * rise * (1 - e));
        w *= 0.25 + 0.75 * e;
      }
      const hh = yt - yb;
      const r = Math.min(w * 0.9, hh * (o.round ?? 0.25));
      const pts: P2[] = [
        [0, yb],
        [w * keel - r * 0.3, yb],
        [w * keel, yb + r],
        [w, yb + Math.max(r, hh * 0.4)],
        [w, yt - 0.006],
        [w * 0.5, yt],
        [0, yt],
      ];
      return pts;
    },
    sub: [2, 2, 2, 2, 2, 2],
    capStart: true,
    capEnd: true,
  });
  if (o.cant) {
    const yt = o.top((o.z0 + o.z1) / 2);
    g.translate(0, -yt, 0).rotateZ(o.cant).translate(0, yt, 0);
  }
  return g.translate(o.x, 0, 0);
}

/**
 * A US rail launcher on a missile's back (LAU-127 / LAU-128 / LAU-129 family), in the missile's frame
 * (its centre at the origin, nose to -z): a long box with a raked nose fairing, the T-rail and its
 * hooks under it, the umbilical hump and the aft cap. Returns its top height.
 */
function lauUS(parts: THREE.BufferGeometry[], r: number, len: number, zc: number, w = 0.11, h = 0.1): number {
  const yb = r + 0.014;
  const yc = yb + h / 2;
  const body = rb(w, h, len, 0.02, 2);
  body.translate(0, yc, zc);
  parts.push(body);
  // the raked nose fairing (the forward end is cut down at an angle toward the missile)
  const nose = loftProfile({
    stations: stations(0, 0.32, 5),
    profile: (z) => {
      const u = z / 0.32;
      const hw = (w / 2) * (0.55 + 0.45 * Math.sqrt(u));
      const top = yb + h * (0.25 + 0.75 * Math.sqrt(u));
      return [[0, yb], [hw, yb], [hw, top - 0.01], [0, top]] as P2[];
    },
    sub: 2,
    capStart: true,
  });
  nose.translate(0, 0, zc - len / 2 - 0.32 + 0.01);
  parts.push(nose);
  // the T-rail under it, and its three hooks' shoes
  const rail = rb(0.045, 0.016, len * 0.94, 0.005);
  rail.translate(0, r + 0.006, zc + 0.02);
  parts.push(rail);
  for (const f of [-0.36, 0.05, 0.42]) {
    const shoe = rb(0.06, 0.012, 0.09, 0.004);
    shoe.translate(0, r + 0.004, zc + f * len);
    parts.push(shoe);
  }
  // the umbilical / nitrogen hump and the aft end cap
  const hump = rb(w * 0.7, 0.03, len * 0.22, 0.012);
  hump.translate(0, yb + h + 0.012, zc - len * 0.18);
  parts.push(hump);
  const cap = rb(w * 0.85, h * 0.8, 0.06, 0.015);
  cap.translate(0, yc - 0.005, zc + len / 2 + 0.02);
  parts.push(cap);
  return yb + h;
}

/** A Russian rail launcher (APU-170 for the R-77, P-72-1 for the R-73 / R-74): a deeper beam with a long pointed front fairing. */
function lauRU(parts: THREE.BufferGeometry[], r: number, len: number, zc: number, ir: boolean, size = 1): number {
  // (the APU-170 is a big beam, about as deep as the R-77 is wide; the P-72 a little smaller)
  const w = (ir ? 0.13 : 0.15) * size, h = (ir ? 0.14 : 0.16) * size;
  const yb = r + 0.012;
  const body = rb(w, h, len, 0.03, 2);
  body.translate(0, yb + h / 2, zc);
  parts.push(body);
  const fl = ir ? 0.42 : 0.55;
  const nose = loftProfile({
    stations: stations(0, fl, 6),
    profile: (z) => {
      const u = z / fl;
      const e = Math.sqrt(u);
      return [[0, yb + h * 0.45 * (1 - e)], [w * 0.5 * (0.25 + 0.75 * e), yb + h * 0.45 * (1 - e)], [w * 0.5 * (0.25 + 0.75 * e), yb + h * (0.55 + 0.45 * e) - 0.01], [0, yb + h * (0.55 + 0.45 * e)]] as P2[];
    },
    sub: 2,
    capStart: true,
  });
  nose.translate(0, 0, zc - len / 2 - fl + 0.01);
  parts.push(nose);
  const rail = rb(0.05, 0.016, len * 0.95, 0.005);
  rail.translate(0, r + 0.005, zc);
  parts.push(rail);
  // the P-72's nitrogen bottle / the APU-170's cable duct along its side
  const duct = rod(v3(w / 2, yb + h * 0.55, zc - len * 0.42), v3(w / 2, yb + h * 0.55, zc + len * 0.4), 0.018, 0.018, 8);
  parts.push(duct);
  return yb + h;
}

/** A European rail launcher (Typhoon / Rafale / Gripen missile rails): slim, with a short rounded nose. */
function lauEU(parts: THREE.BufferGeometry[], r: number, len: number, zc: number, w = 0.11, h = 0.1): number {
  const yb = r + 0.012;
  const body = rb(w, h, len, 0.025, 2);
  body.translate(0, yb + h / 2, zc);
  parts.push(body);
  // the rounded nose, swelling out of the body's own section (no step where they meet)
  const nl = 0.26;
  const yc = yb + h / 2;
  const nose = loftProfile({
    stations: stations(0, nl, 5),
    profile: (z) => {
      // (at its back the section is the body's own rounded box, a hair bigger, so the body's front face hides inside)
      const e = Math.max(0.08, Math.sqrt(z / nl));
      const hw = (w / 2 + 0.003) * e, hh = (h / 2 + 0.003) * e, c = 0.022 * e;
      return [[0, yc - hh], [hw - c, yc - hh], [hw, yc - hh + c], [hw, yc + hh - c], [hw - c, yc + hh], [0, yc + hh]] as P2[];
    },
    sub: 2,
    capStart: true,
  });
  nose.translate(0, 0, zc - len / 2 - nl + 0.02);
  parts.push(nose);
  const rail = rb(0.045, 0.014, len * 0.95, 0.005);
  rail.translate(0, r + 0.005, zc);
  parts.push(rail);
  return yb + h;
}

/**
 * An ejector launcher hugging the airframe (LAU-106 / LAU-116 for the AMRAAM, the AKU-170 / AKU-410 /
 * the Eurofighter's and Rafale's ejectors): a shallow fairing from the skin down to the missile, two
 * ejector pistons and four sway-brace pads gripping its back. `top(z)` is the skin above.
 */
function ejector(parts: THREE.BufferGeometry[], x: number, y: number, z: number, r: number, len: number, top: (z: number) => number, half = 0.09): void {
  const yb = y + r + 0.03;
  parts.push(
    slab({ x, z0: z - len / 2, z1: z + len / 2, top: (zz) => top(zz) + 0.02, bot: () => yb, half, nose: Math.min(0.3, len * 0.3), tail: Math.min(0.25, len * 0.25), tailRise: 0.4 }),
  );
  for (const dz of [-len * 0.28, len * 0.28]) {
    parts.push(rod(v3(x, yb + 0.01, z + dz), v3(x, y + r + 0.005, z + dz), 0.03, 0.03, 10));
    for (const s of [-1, 1]) parts.push(rod(v3(x + s * 0.05, yb, z + dz + 0.14), v3(x + s * r * 0.7, y + r * 0.7, z + dz + 0.14), 0.011, 0.011, 6));
  }
}

/** A bomb rack's (BRU / MER) ejector feet and four sway-brace arms on a hung store, below a pylon keel at `yk`. */
function swayBraces(parts: THREE.BufferGeometry[], x: number, yk: number, y: number, z: number, r: number, span: number): void {
  const yt = y + r;
  for (const dz of [-span / 2, span / 2]) {
    parts.push(rod(v3(x, yk + 0.01, z + dz), v3(x, yt + 0.004, z + dz), 0.022, 0.022, 6));
    for (const s of [-1, 1]) {
      const a = v3(x + s * 0.06, yk + 0.005, z + dz + 0.1);
      const b = v3(x + s * r * 0.62, y + r * 0.8, z + dz + 0.1);
      parts.push(rod(a, b, 0.014, 0.014, 6));
      const pad = rb(0.05, 0.016, 0.06, 0.005);
      pad.translate(b.x, b.y, b.z);
      parts.push(pad);
    }
  }
}

// ---------------------------------------------------------------------------
// Each jet
// ---------------------------------------------------------------------------

type LauKind = 'us' | 'ru' | 'eu';
interface RackStyle {
  /** pylon length (m) for a missile, and how far its front sits ahead of the store's centre */
  len: number;
  front: number;
  /** the keel's corner radius, a fraction of the depth (default 0.25) */
  round?: number;
  /** how far a pylon may reach past the leading / trailing edge (m; not for a raked pylon) */
  over?: number;
  /** a tank's / bomb's pylon */
  heavyLen?: number;
  heavyFront?: number;
  half: number;
  nose: number;
  tail: number;
  noseCut?: number;
  keel?: number;
  /** pylon keel below the launcher's top (m): the pylon carries on down past the rail */
  below?: number;
  launcher: LauKind;
  /** launcher length for a radar / an IR missile */
  lauLen: [number, number];
  /** launcher centre aft of the store centre (m) */
  lauAft: number;
  /** launcher cross-section (m), measured against the missile in the photographs */
  lauW?: number;
  lauH?: number;
  /**
   * A pylon reaching ahead of the leading edge with its front edge raked forward and down (the Super
   * Hornet's): the top line drops from the wing at the leading edge to this fraction of the depth at the nose.
   */
  rake?: number;
  pylon: string;
  rail: string;
}

const IR = new Set<StoreType>(['AIM9X', 'R74M', 'MICAIR', 'IRIST']);
const isIr = (s: StoreType) => IR.has(s) || (s as string) === 'PL10';
const RU_STORE = new Set<StoreType>(['R77M', 'R74M', 'R37M']);

/** what each jet's pylons and launchers look like (from the photographs; see each entry) */
const RACKS: Partial<Record<string, RackStyle>> = {
  // F-15E / EX (photos: the station 2 pylon with its LAU-128s from the front, a bare pylon on a cart from the
  // side, the EX with twelve): a long, deep, flat-sided slab, square-ended aft, a rounded blunt nose, the
  // BRU-47's hooks along its keel; the LAU-128s on its flanks; all in the jet's grey.
  F15EX: { len: 3.5, front: 1.25, half: 0.075, nose: 0.55, tail: 0.25, noseCut: 0.15, keel: 0.92, below: 0.27, launcher: 'us', lauLen: [2.9, 2.9], lauAft: 0.05, lauW: 0.11, lauH: 0.1, pylon: '#6e757b', rail: '#646b71' },
  // F/A-18E/F (photos: a RAAF Rhino from below, a VX-9 jet's pylon and LAU-127 from the side): the SUU-79
  // pylons, deep, reaching well ahead of the leading edge with the front edge raked forward and down to a
  // low nose; the LAU-127 along the keel with its pointed fairing; the AIM-9X under the wingtip's own rail;
  // the AMRAAMs on the nacelles' LAU-116s; light grey.
  FA18EF: { len: 3.4, front: 1.3, heavyLen: 3.6, heavyFront: 1.6, half: 0.11, nose: 0.3, tail: 0.3, noseCut: 0.5, keel: 0.9, below: 0.2, launcher: 'us', lauLen: [2.95, 2.7], lauAft: 0.1, lauW: 0.13, lauH: 0.14, rake: 0.3, pylon: '#9aa0a4', rail: '#8d9498' },
  // F-16C (photos: a Ukrainian jet's wing from the front, AIM-120 on the tip, AIM-9X at station 2 on its short
  // adapter, an empty LAU-129 under station 3's pylon, a 370 gal tank at 4): slim pylons kept under the wing,
  // a rounded nose, the LAU-129 under them; station 2's launcher almost straight under the wing.
  F16C: { len: 2.2, front: 0.85, heavyLen: 2.7, heavyFront: 1.25, half: 0.06, nose: 0.45, tail: 0.3, noseCut: 0.35, keel: 0.9, launcher: 'us', lauLen: [2.75, 2.55], lauAft: 0.05, lauW: 0.11, lauH: 0.12, over: 0.25, pylon: '#8a9095', rail: '#82898e' },
  // Typhoon (photo: an RAF FGR4 from the side with ASRAAMs, AMRAAMs and tanks): the outboard missile
  // launchers are long slim rails nearly flush under the wing; the wing pylons long, with a long tapering
  // nose; the AMRAAMs semi-recessed in the belly on their ejectors; the jet's light grey.
  TYPHOON: { len: 2.7, front: 1.15, heavyLen: 3.2, heavyFront: 1.55, half: 0.075, nose: 0.8, tail: 0.3, noseCut: 0.75, keel: 0.88, launcher: 'eu', lauLen: [3.0, 2.85], lauAft: 0.1, lauW: 0.11, lauH: 0.1, over: 0.35, pylon: '#8f979c', rail: '#878f94' },
  // Su-35S (photos: a fully armed jet from below with each store named, an R-77M close-up under the wing):
  // short, thick wing pylons with rounded noses; long APU-170 rails for the R-77s (a long pointed front
  // fairing reaching forward), shorter P-72s for the R-73 / R-74; the R-77s under the intakes on their
  // launchers right against the duct; R-74s under the wingtips' own rails; the underside's pale blue.
  SU35: { len: 2.0, front: 0.75, heavyLen: 2.7, heavyFront: 1.2, half: 0.075, nose: 0.45, tail: 0.3, noseCut: 0.4, keel: 0.9, launcher: 'ru', lauLen: [3.35, 2.55], lauAft: 0.2, lauH: 0.16, over: 0.3, pylon: '#a9bcc8', rail: '#c2c8cb' },
  // MiG-31BM (photos: the wing pylons from behind at an air show, R-37Ms under the belly on the ramp): short,
  // shallow, boxy pylons with flat keels and blunt ends; P-72s for the R-73 / R-74 under them; the R-37Ms
  // on AKU-410 ejectors right against the flat belly; grey.
  MIG31: { len: 2.2, front: 0.85, heavyLen: 2.8, heavyFront: 1.3, half: 0.1, nose: 0.28, tail: 0.15, noseCut: 0.1, keel: 0.97, round: 0.07, launcher: 'ru', lauLen: [3.4, 2.55], lauAft: 0.15, lauH: 0.15, over: 0.3, pylon: '#aeb5ba', rail: '#bfc5c9' },
  // Rafale (photos: a Rafale M's Meteor wing pylon and its MICA fuselage stations at a show): flat-sided
  // pylons, not deep, with a long launcher beam along the bottom and a tapered front; light grey MICA rails
  // tight against the fuselage; the MICAs under the wingtips' own rails; the jet's grey.
  RAFALE: { len: 2.8, front: 1.15, heavyLen: 3.1, heavyFront: 1.45, half: 0.075, nose: 0.5, tail: 0.25, noseCut: 0.55, keel: 0.92, round: 0.12, launcher: 'eu', lauLen: [3.05, 2.75], lauAft: 0.15, lauW: 0.1, lauH: 0.1, over: 0.3, pylon: '#8b9398', rail: '#a7adb1' },
  // Gripen E (photo: a Meteor under the wing beside the main gear, on the ramp): short, compact pylons with
  // rounded noses, a bulky launcher right under them and the missile tucked close; IRIS-Ts under the
  // wingtips' own rails; the jet's grey.
  GRIPEN: { len: 2.0, front: 0.75, heavyLen: 2.5, heavyFront: 1.05, half: 0.09, nose: 0.4, tail: 0.25, noseCut: 0.3, keel: 0.95, round: 0.12, launcher: 'eu', lauLen: [2.7, 2.5], lauAft: 0.1, lauW: 0.13, lauH: 0.13, over: 0.3, pylon: '#90979c', rail: '#868d92' },
  // Su-57 (photos: the jet showing its loaded bays with the R-74Ms out on their side-bay rails, its clean
  // underside): short, slim, sharp-nosed pylons on the wings with APU-170 / P-72 rails under them; the bays'
  // ejectors and swing-out rails (bayLauncher); the underside's blue-grey.
  SU57: { len: 2.0, front: 0.8, heavyLen: 2.7, heavyFront: 1.2, half: 0.07, nose: 0.6, tail: 0.35, noseCut: 0.6, keel: 0.8, launcher: 'ru', lauLen: [3.3, 2.5], lauAft: 0.2, lauH: 0.15, over: 0.3, pylon: '#919ea8', rail: '#b4bcc2' },
  // X-15A-2 (photo: the jet under the B-52's wing with its tanks fitted, Air Force museum archive): the two
  // drop tanks right under the side fairings, almost touching them, on short attachments; black like the jet.
  X15: { len: 2.2, front: 1.0, heavyLen: 2.4, heavyFront: 1.2, half: 0.06, nose: 0.4, tail: 0.3, noseCut: 0.3, keel: 0.9, launcher: 'us', lauLen: [2.6, 2.4], lauAft: 0, over: 0.3, pylon: '#1d1e21', rail: '#2a2c30' },
};

/**
 * The launcher a weapons-bay store rides down on, in the store's own frame (it moves with it): the F-22's
 * LAU-142 AVEL and the Su-57's UVKU ejectors in the main bays (a beam on the missile's back and two arms
 * straight up into the bay), the LAU-141 trapeze and the Su-57's swing-out rails in the side bays (a rail
 * on its back and two arms swinging back in and up to the bay's hinge). The arms reach back to where the
 * store sits stowed, so they always meet the bay roof; shut, the whole thing is hidden with the store.
 */
export function bayLauncher(spec: AircraftSpec, def: StationDef, store: StoreType): THREE.BufferGeometry | null {
  const o = def.bayOut;
  if (!o || !def.bay) return null;
  const r = storeRadius(store);
  const parts: THREE.BufferGeometry[] = [];
  const side = def.bay !== 'main';
  const ru = RU_STORE.has(store) || spec.type === 'SU57';
  let ytop: number;
  if (side) ytop = ru ? lauRU(parts, r, 2.2, 0.1, true) : lauUS(parts, r, 2.3, 0.05, 0.09, 0.075);
  else {
    // the ejector beam with its two hooks
    const beam = rb(0.085, 0.05, 1.55, 0.015);
    beam.translate(0, r + 0.04, 0.05);
    parts.push(beam);
    for (const dz of [-0.45, 0.45]) {
      const hk = rb(0.06, 0.026, 0.09, 0.006);
      hk.translate(0, r + 0.008, 0.05 + dz);
      parts.push(hk);
    }
    ytop = r + 0.065;
  }
  const d = v3(def.pos[0] - o[0], def.pos[1] - o[1], def.pos[2] - o[2]);
  const L = d.length() + 0.25;
  d.normalize();
  // (the main bay's AVEL lowers it on two slanted parallel arms from a beam at the bay roof, like the
  // YF-22's launcher picture; the side bays' trapeze swings it out on two straight ones)
  const lean = side ? 0 : L * 0.4;
  for (const dz of [-0.45, 0.45]) {
    const a = v3(0, ytop - 0.012, 0.05 + dz);
    const b = a.clone().addScaledVector(d, L).add(v3(0, 0, lean));
    parts.push(rod(a, b, side ? 0.024 : 0.026, 0.024, 6));
  }
  if (!side) {
    const beam = rb(0.1, 0.055, 1.35, 0.02);
    beam.translate(d.x * L, ytop - 0.012 + d.y * L + 0.02, 0.05 + lean);
    parts.push(beam);
  }
  const c = C(spec.type === 'SU57' ? '#9aa3a8' : '#8a8f93');
  for (const g of parts) paint(g, c);
  return join(parts);
}

export interface JetRacks {
  /** stations drawn here (the generic pylon is not built for them) */
  handled: Set<number>;
  geo: THREE.BufferGeometry | null;
}

interface Loaded {
  def: StationDef;
  store: StoreType;
}

/** The jet's racks for its loaded stations, in the body frame (one geometry, vertex-coloured). */
export function jetRacks(spec: AircraftSpec, loaded: Loaded[]): JetRacks {
  const handled = new Set<number>();
  const st = RACKS[spec.type];
  if (!st) return { handled, geo: null };
  const parts: THREE.BufferGeometry[] = [];
  const pylonC = C(st.pylon), railC = C(st.rail), metal = C('#3b3f42');
  const tint = (from: number, c: THREE.Color) => {
    for (let i = from; i < parts.length; i++) paint(parts[i], c);
  };

  // the pylon's top line: the skin (sunk a little into it), or, for a raked pylon reaching ahead of the
  // leading edge, dropping from the edge forward and down to its nose
  const pylonTop = (sk: Skin, z0: number, keel: number): ((z: number) => number) => {
    const top = skinFn(sk);
    const rake = st.rake;
    if (rake === undefined) return (z) => top(z) + 0.03;
    const zr = Math.max(skinSpan(sk)[0] + 0.05, z0 + 0.6);
    const yr = top(zr) + 0.03;
    return (z) => (z >= zr ? top(z) + 0.03 : keel + (yr - keel) * (rake + (1 - rake) * Math.pow(Math.max(0, (z - z0) / (zr - z0)), 0.85)));
  };
  const pylon = (x: number, z0: number, len: number, sk: Skin, keel: number) => {
    let z1 = z0 + len;
    if (st.rake === undefined) {
      // kept under the wing: no pylon hanging in the air ahead of the leading edge
      const [a, b] = skinSpan(sk);
      const over = st.over ?? 0.15;
      z0 = Math.max(z0, a - over);
      z1 = Math.min(z1, b + over);
      if (z1 - z0 < 0.7) {
        const m = (z0 + z1) / 2;
        (z0 = m - 0.35), (z1 = m + 0.35);
      }
    }
    return slab({ x, z0, z1, top: pylonTop(sk, z0, keel), bot: () => keel, half: st.half, nose: Math.min(st.nose, (z1 - z0) * 0.35), tail: Math.min(st.tail, (z1 - z0) * 0.3), noseCut: st.noseCut, keel: st.keel, round: st.round });
  };

  // twin racks: one pylon per rack line, every loaded missile on its own shoulder launcher
  const racks = new Map<number, Loaded[]>();
  for (const l of loaded) {
    if (l.def.mount === 'internal') continue;
    if (l.def.rack !== undefined && l.def.hang !== undefined) {
      const k = Math.round(l.def.rack * 100);
      racks.set(k, [...(racks.get(k) ?? []), l]);
    }
  }
  for (const [, group] of racks) {
    const d0 = group[0].def;
    const x = d0.rack as number;
    const zc = d0.pos[2];
    const sk = skinFor(spec.type, x, zc);
    if (!sk) continue;
    const shoulders = group.filter((l) => onShoulder(l.def, l.store));
    const hung = group.filter((l) => !onShoulder(l.def, l.store));
    // the keel: below the lowest shoulder launcher, or down to a hung store's back
    let keel = Infinity;
    for (const l of shoulders) keel = Math.min(keel, storeCenterY(l.def, l.store) - (st.below ?? 0.15) + 0.05);
    const side = hung.length > 1 || hung.some((l) => storeCenterX(l.def, l.store) !== x);
    for (const l of hung) keel = Math.min(keel, storeCenterY(l.def, l.store) + storeRadius(l.store) + (side ? 0.16 : 0.1));
    const heavy = hung.length > 0;
    const len = heavy ? st.heavyLen ?? st.len : st.len;
    const z0 = zc - (heavy ? st.heavyFront ?? st.front : st.front);
    let p0 = parts.length;
    parts.push(pylon(x, z0, len, sk, keel));
    // the bomb rack's hooks along the keel
    for (const dz of [-0.36, 0.36]) {
      const hk = rb(0.07, 0.05, 0.12, 0.01);
      hk.translate(x, keel - 0.02, zc + 0.05 + dz);
      parts.push(hk);
    }
    tint(p0, pylonC);
    p0 = parts.length;
    if (side) {
      // a dual rack (the BRU-55) under the keel: a beam out to both bombs
      const xs = hung.map((l) => storeCenterX(l.def, l.store));
      const lo = Math.min(x, ...xs), hi = Math.max(x, ...xs);
      const beam = rb(hi - lo + 0.22, 0.07, 1.05, 0.025);
      beam.translate((lo + hi) / 2, keel - 0.04, zc + 0.05);
      parts.push(beam);
    }
    for (const l of hung) {
      const y = storeCenterY(l.def, l.store), r = storeRadius(l.store);
      swayBraces(parts, storeCenterX(l.def, l.store), side ? keel - 0.07 : keel, y, zc, r, 0.76);
    }
    tint(p0, metal);
    for (const l of shoulders) {
      const cx = storeCenterX(l.def, l.store), cy = storeCenterY(l.def, l.store), r = storeRadius(l.store);
      const lp: THREE.BufferGeometry[] = [];
      const L = st.lauLen[isIr(l.store) ? 1 : 0];
      const ytop = lauUS(lp, r, L, st.lauAft, st.lauW, st.lauH);
      // the adapter from the pylon's flank out to the launcher
      const s = Math.sign(x - cx);
      const reach = Math.abs(x - cx) - st.half + 0.02 - 0.05;
      if (reach > 0.01) {
        const ad = rb(reach, 0.075, 0.95, 0.02);
        ad.translate(s * (0.05 + reach / 2 - 0.01), ytop - 0.045, st.lauAft - 0.1);
        lp.push(ad);
      }
      for (const g of lp) g.translate(cx, cy, l.def.pos[2]);
      p0 = parts.length;
      parts.push(...lp);
      tint(p0, railC);
      handled.add(l.def.id);
    }
    for (const l of hung) handled.add(l.def.id);
  }

  // single stations
  for (const l of loaded) {
    const d = l.def;
    if (d.mount === 'internal' || handled.has(d.id) || (d.rack !== undefined && d.hang !== undefined)) continue;
    const cx = storeCenterX(d, l.store), cy = storeCenterY(d, l.store), r = storeRadius(l.store);
    const z = d.pos[2];
    const sk = skinFor(spec.type, d.pos[0], z);
    if (!sk) continue;
    const top = skinFn(sk);
    const lp: THREE.BufferGeometry[] = [];
    const heavy = hungOnRack(l.store);
    const p0 = parts.length;
    const gap0 = top(z) - (cy + r);
    if (d.mount === 'rail' && gap0 < 0.08) {
      // under the airframe's own wingtip rail: only the hooks' shoes between the rail and the missile
      for (const f of [-0.42, 0, 0.42]) {
        const sh = rb(0.05, Math.max(0.008, gap0 + 0.012), 0.1, 0.004);
        sh.translate(cx, cy + r + gap0 / 2, z + 0.1 + f);
        parts.push(sh);
      }
      tint(p0, railC);
    } else if (d.mount === 'conformal' || d.mount === 'semi-recessed') {
      ejector(parts, cx, cy, z, r, 1.3, top);
      tint(p0, pylonC);
    } else if (heavy) {
      // (a store hung close under the skin gets a shallow rack, not a pylon reaching up inside the airframe)
      const keel = cy + r + Math.min(0.1, Math.max(0.012, gap0 * 0.55));
      const z0 = z - (st.heavyFront ?? st.front);
      parts.push(pylon(cx, z0, st.heavyLen ?? st.len, sk, keel));
      tint(p0, pylonC);
      const p1 = parts.length;
      swayBraces(parts, cx, keel, cy, z, r, 0.76);
      tint(p1, metal);
    } else {
      const L = st.lauLen[isIr(l.store) ? 1 : 0];
      const ru = st.launcher === 'ru' || RU_STORE.has(l.store);
      const ytop = ru ? lauRU(lp, r, L, st.lauAft, isIr(l.store), (st.lauH ?? 0.16) / 0.16) : st.launcher === 'eu' ? lauEU(lp, r, L, st.lauAft, st.lauW, st.lauH) : lauUS(lp, r, L, st.lauAft, st.lauW, st.lauH);
      for (const g of lp) g.translate(cx, cy, z);
      const keel = cy + ytop - 0.02;
      if (top(z) - keel > 0.04) {
        parts.push(pylon(cx, z - st.front, st.len, sk, keel));
        tint(p0, pylonC);
      }
      const p1 = parts.length;
      parts.push(...lp);
      tint(p1, railC);
    }
    handled.add(d.id);
  }
  return { handled, geo: parts.length ? join(parts) : null };
}

// ---------------------------------------------------------------------------
// Measured skin
// ---------------------------------------------------------------------------

// The skin's height straight above each station (body frame), measured once by casting rays up from
// below the station through the hero airframe with the gear up: 9 samples 0.35 m apart, centred on
// the station's z. null: nothing above there (ahead of a leading edge, past a trailing edge).
const SKIN: Partial<Record<string, Record<number, Skin>>> = {
  FA18EF: {
    1: { x: -6.46, z: 2.4, y: [null, -0.008, -0.008, -0.008, -0.008, -0.008, -0.008, -0.008, -0.008] },
    2: { x: -5.3, z: 1.7, y: [null, null, null, null, null, 0.138, 0.133, 0.131, 0.134] },
    3: { x: -3.9, z: 1.3, y: [null, null, null, null, 0.221, 0.208, 0.202, 0.2, 0.201] },
    5: { x: -1.04, z: 0.7, y: [null, null, null, -0.584, -0.609, -0.672, -0.721, -0.754, -0.752] },
    6: { x: 0, z: 0.6, y: [-0.45, -0.45, -0.45, -0.453, -0.463, -0.475, -0.492, -0.543, -0.6] },
    7: { x: 1.04, z: 0.7, y: [null, null, null, -0.584, -0.609, -0.672, -0.721, -0.754, -0.752] },
    8: { x: 3.9, z: 1.3, y: [null, null, null, null, 0.221, 0.208, 0.202, 0.2, 0.201] },
    10: { x: 5.3, z: 1.7, y: [null, null, null, null, null, 0.138, 0.133, 0.131, 0.134] },
    11: { x: 6.46, z: 2.4, y: [null, -0.008, -0.008, -0.008, -0.008, -0.008, -0.008, -0.008, -0.008] },
  },
  F15EX: {
    1: { x: -4.55, z: 3.45, y: [null, 0.135, 0.127, 0.121, 0.119, 0.122, 0.131, 0.144, 0.161] },
    3: { x: -3, z: 2.45, y: [0.133, 0.111, 0.097, 0.089, 0.086, 0.089, 0.097, 0.109, 0.125] },
    5: { x: -1.98, z: -1.4, y: [null, null, null, null, -0.507, -0.554, -0.567, -0.578, -0.588] },
    6: { x: -1.98, z: 1.9, y: [-0.602, -0.608, -0.61, -0.61, -0.607, -0.602, -0.59, -0.566, -0.527] },
    7: { x: 0, z: 0.4, y: [-0.629, -0.632, -0.635, -0.638, -0.64, -0.637, -0.632, -0.626, -0.621] },
    8: { x: 1.98, z: 1.9, y: [-0.602, -0.608, -0.61, -0.61, -0.607, -0.602, -0.59, -0.566, -0.527] },
    9: { x: 1.98, z: -1.4, y: [null, null, null, null, -0.507, -0.554, -0.567, -0.578, -0.588] },
    10: { x: 3, z: 2.45, y: [0.133, 0.111, 0.097, 0.089, 0.086, 0.089, 0.097, 0.109, 0.125] },
    12: { x: 4.55, z: 3.45, y: [null, 0.135, 0.127, 0.121, 0.119, 0.122, 0.131, 0.144, 0.161] },
  },
  F16C: {
    1: { x: -4.69, z: 1.75, y: [null, -0.088, -0.088, -0.088, -0.088, -0.088, -0.088, -0.088, null] },
    2: { x: -3.95, z: 1.3, y: [null, null, null, null, -0.002, -0.006, -0.004, 0.002, null] },
    3: { x: -3, z: 0.6, y: [null, null, null, null, 0.008, 0.002, 0.001, 0.003, 0.008] },
    4: { x: -2.05, z: 0.25, y: [null, null, 0.033, 0.018, 0.011, 0.008, 0.008, 0.01, 0.015] },
    5: { x: 0, z: 0.2, y: [-0.997, -0.919, -1.044, -0.906, -0.902, -0.9, -0.9, -0.9, -0.9] },
    6: { x: 2.05, z: 0.25, y: [null, null, 0.033, 0.018, 0.011, 0.008, 0.008, 0.01, 0.015] },
    7: { x: 3, z: 0.6, y: [null, null, null, null, 0.008, 0.002, 0.001, 0.003, 0.008] },
    8: { x: 3.95, z: 1.3, y: [null, null, null, null, -0.002, -0.006, -0.004, 0.002, null] },
    9: { x: 4.69, z: 1.75, y: [null, -0.088, -0.088, -0.088, -0.088, -0.088, -0.088, -0.088, null] },
  },
  TYPHOON: {
    1: { x: -4.85, z: 3.95, y: [null, null, -0.42, -0.426, -0.426, -0.422, -0.416, null, null] },
    2: { x: -3.9, z: 2.95, y: [null, -0.392, -0.404, -0.411, -0.413, -0.413, -0.41, -0.405, -0.398] },
    3: { x: -2.8, z: 2.35, y: [-0.384, -0.392, -0.398, -0.401, -0.401, -0.4, -0.396, -0.392, -0.385] },
    4: { x: -0.86, z: -1, y: [-0.923, -0.957, -0.98, -0.995, -1.001, -1, -1, -1, -1] },
    5: { x: -0.86, z: 2, y: [-1, -1, -0.999, -0.994, -0.984, -0.968, -0.936, -0.824, -0.797] },
    6: { x: 0, z: 0.4, y: [-1.043, -1.04, -1.04, -1.04, -1.04, -1.04, -1.04, -1.037, -1.03] },
    7: { x: 0.86, z: 2, y: [-1, -1, -0.999, -0.994, -0.984, -0.968, -0.936, -0.824, -0.797] },
    8: { x: 0.86, z: -1, y: [-0.923, -0.957, -0.98, -0.995, -1.001, -1, -1, -1, -1] },
    9: { x: 2.8, z: 2.35, y: [-0.384, -0.392, -0.398, -0.401, -0.401, -0.4, -0.396, -0.392, -0.385] },
    10: { x: 3.9, z: 2.95, y: [null, -0.392, -0.404, -0.411, -0.413, -0.413, -0.41, -0.405, -0.398] },
    11: { x: 4.85, z: 3.95, y: [null, null, -0.42, -0.426, -0.426, -0.422, -0.416, null, null] },
  },
  SU35: {
    1: { x: -7.24, z: 3.2, y: [-0.04, -0.052, -0.052, -0.051, -0.05, -0.054, -0.057, -0.058, -0.048] },
    2: { x: -5.7, z: 2.7, y: [null, 0.039, 0.03, 0.027, 0.026, 0.029, 0.033, 0.04, 0.048] },
    3: { x: -4.4, z: 2, y: [0.06, 0.051, 0.046, 0.044, 0.044, 0.047, 0.052, 0.059, 0.066] },
    4: { x: -3.1, z: 1.3, y: [0.071, 0.064, 0.061, 0.06, 0.061, 0.065, 0.07, 0.076, 0.084] },
    5: { x: -1.55, z: 0.4, y: [-1.22, -1.222, -1.222, -1.22, -1.216, -1.209, -1.201, -1.187, -1.17] },
    6: { x: 0, z: -1.6, y: [-0.654, -0.606, -0.557, -0.496, -0.439, -0.396, -0.378, -0.371, -0.367] },
    7: { x: 0, z: 2.4, y: [-0.361, -0.36, -0.36, -0.359, -0.359, -0.357, -0.355, -0.352, -0.348] },
    8: { x: 1.55, z: 0.4, y: [-1.22, -1.222, -1.222, -1.22, -1.216, -1.209, -1.201, -1.187, -1.17] },
    9: { x: 3.1, z: 1.3, y: [0.071, 0.064, 0.061, 0.06, 0.061, 0.065, 0.07, 0.076, 0.084] },
    10: { x: 4.4, z: 2, y: [0.06, 0.051, 0.046, 0.044, 0.044, 0.047, 0.052, 0.059, 0.066] },
    11: { x: 5.7, z: 2.7, y: [null, 0.039, 0.03, 0.027, 0.026, 0.029, 0.033, 0.04, 0.048] },
    12: { x: 7.24, z: 3.2, y: [-0.04, -0.052, -0.052, -0.051, -0.05, -0.054, -0.057, -0.058, -0.048] },
  },
  RAFALE: {
    1: { x: -5.36, z: 3.45, y: [null, -0.417, -0.417, -0.417, -0.417, -0.417, -0.417, -0.417, null] },
    2: { x: -4.25, z: 3, y: [null, null, -0.335, -0.344, -0.347, -0.347, -0.344, -0.339, -0.331] },
    3: { x: -3.15, z: 2.55, y: [-0.317, -0.33, -0.338, -0.343, -0.344, -0.343, -0.34, -0.335, -0.328] },
    4: { x: -2.1, z: 2.05, y: [-0.324, -0.333, -0.339, -0.342, -0.343, -0.342, -0.339, -0.334, -0.328] },
    5: { x: -0.72, z: -0.9, y: [-0.753, -0.754, -0.754, -0.753, -0.753, -0.753, -0.744, -0.74, -0.735] },
    6: { x: -0.72, z: 2.6, y: [-0.727, -0.717, -0.7, -0.677, -0.655, -0.633, -0.61, -0.586, -0.56] },
    7: { x: 0, z: 0.9, y: [-0.762, -0.746, -0.736, -0.732, -0.73, -0.726, -0.717, -0.703, -0.687] },
    8: { x: 0.72, z: 2.6, y: [-0.727, -0.717, -0.7, -0.677, -0.655, -0.633, -0.61, -0.586, -0.56] },
    9: { x: 0.72, z: -0.9, y: [-0.753, -0.754, -0.754, -0.753, -0.753, -0.753, -0.744, -0.74, -0.735] },
    10: { x: 2.1, z: 2.05, y: [-0.324, -0.333, -0.339, -0.342, -0.343, -0.342, -0.339, -0.334, -0.328] },
    11: { x: 3.15, z: 2.55, y: [-0.317, -0.33, -0.338, -0.343, -0.344, -0.343, -0.34, -0.335, -0.328] },
    12: { x: 4.25, z: 3, y: [null, null, -0.335, -0.344, -0.347, -0.347, -0.344, -0.339, -0.331] },
    13: { x: 5.36, z: 3.45, y: [null, -0.417, -0.417, -0.417, -0.417, -0.417, -0.417, -0.417, null] },
  },
  MIG31: {
    1: { x: -5.05, z: 2.85, y: [null, null, null, null, null, 0.025, 0.009, 0.001, -0.002] },
    2: { x: -3.35, z: 2.1, y: [null, null, null, 0.167, 0.15, 0.14, 0.134, 0.131, 0.13] },
    3: { x: -0.54, z: -0.95, y: [-1.024, -1.024, -1.024, -1.024, -1.024, -1.023, -1.023, -1.022, -1.021] },
    4: { x: -0.54, z: 3.55, y: [-1.01, -1.006, -1.002, -0.999, -0.996, -0.993, -0.987, -0.977, -0.96] },
    5: { x: 0.54, z: 3.55, y: [-1.01, -1.006, -1.002, -0.999, -0.996, -0.993, -0.987, -0.977, -0.96] },
    6: { x: 0.54, z: -0.95, y: [-1.024, -1.024, -1.024, -1.024, -1.024, -1.023, -1.023, -1.022, -1.021] },
    7: { x: 3.35, z: 2.1, y: [null, null, null, 0.167, 0.15, 0.14, 0.134, 0.131, 0.13] },
    8: { x: 5.05, z: 2.85, y: [null, null, null, null, null, 0.025, 0.009, 0.001, -0.002] },
  },
  X15: {
    1: { x: -0.95, z: 0.6, y: [-0.439, -0.439, -0.44, -0.44, -0.44, -0.44, -0.44, -0.44, -0.44] },
    2: { x: 0.95, z: 0.6, y: [-0.439, -0.439, -0.44, -0.44, -0.44, -0.44, -0.44, -0.44, -0.44] },
  },
  SU57: {
    1: { x: -5.1, z: 3.1, y: [null, -0.004, -0.018, -0.026, -0.031, -0.033, -0.033, -0.032, -0.028] },
    2: { x: -3.9, z: 2.55, y: [0.002, -0.008, -0.016, -0.021, -0.024, -0.025, -0.025, -0.023, -0.019] },
    3: { x: -2.7, z: 2, y: [-0.092, -0.083, -0.077, -0.076, -0.07, -0.059, -0.043, -0.013, 0.009] },
    10: { x: 2.7, z: 2, y: [-0.093, -0.083, -0.078, -0.076, -0.071, -0.061, -0.043, -0.013, 0.009] },
    11: { x: 3.9, z: 2.55, y: [0.002, -0.008, -0.016, -0.021, -0.024, -0.025, -0.025, -0.023, -0.019] },
    12: { x: 5.1, z: 3.1, y: [null, -0.004, -0.018, -0.026, -0.031, -0.033, -0.033, -0.032, -0.028] },
  },
  GRIPEN: {
    1: { x: -4.3, z: 3.5, y: [null, -0.492, -0.492, -0.492, -0.492, -0.492, -0.492, -0.492, -0.492] },
    2: { x: -3.4, z: 3.85, y: [null, -0.397, -0.407, -0.412, -0.412, -0.408, -0.402, -0.394, null] },
    3: { x: -2.55, z: 2.95, y: [null, -0.382, -0.397, -0.405, -0.409, -0.41, -0.408, -0.403, -0.397] },
    4: { x: -1.65, z: 2.1, y: [null, -0.383, -0.395, -0.403, -0.408, -0.411, -0.41, -0.408, -0.403] },
    5: { x: 0, z: 0.4, y: [-0.737, -0.75, -0.75, -0.75, -0.75, -0.75, -0.75, -0.75, -0.742] },
    6: { x: 0.8, z: -1, y: [-0.464, -0.473, -0.481, -0.488, -0.494, -0.642, -0.68, -0.7, -0.711] },
    7: { x: 1.65, z: 2.1, y: [null, -0.383, -0.395, -0.403, -0.408, -0.411, -0.41, -0.408, -0.403] },
    8: { x: 2.55, z: 2.95, y: [null, -0.382, -0.397, -0.405, -0.409, -0.41, -0.408, -0.403, -0.397] },
    9: { x: 3.4, z: 3.85, y: [null, -0.397, -0.407, -0.412, -0.412, -0.408, -0.402, -0.394, null] },
    10: { x: 4.3, z: 3.5, y: [null, -0.492, -0.492, -0.492, -0.492, -0.492, -0.492, -0.492, -0.492] },
  },
};
