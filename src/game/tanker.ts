// Air-to-air refuelling: a Boeing KC-46A Pegasus flying a racetrack near the
// base, and the business of taking fuel from it.
//
// Jets with a boom receptacle (F-15EX, F-16, F-22, SR-71, F-35A) are served by
// the flying boom under the tail; probe-and-drogue jets (Super Hornet, Typhoon,
// Su-35S, Rafale, MiG-31, Su-57, Gripen) take the basket trailing from the
// centreline hose. Either way the hard part is done for you: fly to the
// pre-contact position behind and below the tanker (the HUD cue counts you in,
// and AUTO-FLY → KC-46 TANKER flies the whole join), and once you are inside
// the capture envelope the jet flies itself the last metres onto the boom or
// into the basket: the boom operator flies the boom down, the nozzle slides
// out and latches, and the jet is held on the boom while the fuel flows. Hands
// off. A firm stick input or the refuel key disconnects; so does a full tank,
// after which the jet slides down and back off the boom and is yours again.
//
// The tanker's frame: +X right wing, +Y up, nose toward -Z (like the jets').

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { AircraftType } from '../aircraft/specs';
import { FT, KT, NM, DEG } from '../core/constants';
import { audio } from '../audio/audio';
import { P2, loftProfile, stations, wing, WingStation, lathe, rrect, Livery, skinMaterial, join, both, stamp, sstep, finMatrix, line, rivets, roundel, LINE, prng, weather, colorize } from '../aircraft/models/kit';
import { partMaterials } from '../aircraft/models/parts';

const G = 9.81;
/** jets that take fuel from the boom (the rest carry a probe; the X-15 neither) */
const BOOM_JETS: AircraftType[] = ['F15EX', 'F16C', 'F22', 'SR71', 'F35A'];
const NO_AAR: AircraftType[] = ['X15'];

export type AarKind = 'boom' | 'probe' | 'none';
export function aarKind(t: AircraftType): AarKind {
  return NO_AAR.includes(t) ? 'none' : BOOM_JETS.includes(t) ? 'boom' : 'probe';
}

/** the receptacle (boom jets) or the probe's tip (probe jets) in the jet's own frame */
export function receiverPoint(p: Aircraft, kind: AarKind): THREE.Vector3 {
  const s = p.spec;
  if (kind === 'boom') {
    // on the spine a third of the way back (the F-15's is in the left wing root)
    const x = s.type === 'F15EX' ? -1.3 : 0;
    return new THREE.Vector3(x, s.height * 0.32, -s.length / 2 + s.length * 0.3);
  }
  // the probe: by the right side of the windscreen, its tip ahead of the nose's base
  return new THREE.Vector3(0.62, s.height * 0.26, -s.length / 2 + 1.2);
}

// ---------------------------------------------------------------- the KC-46 model

interface TankerModel {
  group: THREE.Group;
  /** the boom: pivots at its hinge; `tube` slides out of it */
  boom: THREE.Group;
  tube: THREE.Mesh;
  /** the ruddevators (the V-tail on the boom), for a little life */
  ruddevators: THREE.Mesh[];
  /** the centreline hose and its basket */
  hose: THREE.Mesh;
  basket: THREE.Group;
  lights: THREE.Mesh[];
  /** pilot director lights on the belly: two columns, 5 lamps each (index 2 = on position) */
  pdl: { updown: THREE.Mesh[]; foreaft: THREE.Mesh[] };
}

const BOOM_HINGE = new THREE.Vector3(0, -2.3, 20.5);
const BOOM_LEN = 16.8;
const HOSE_ROOT = new THREE.Vector3(0, -2.6, 17.2);
/** where the basket trails, untouched */
const BASKET_REST = new THREE.Vector3(0, -9.5, 43);
/** the boom's rest angle below the tanker's axis when it is flying it, radians */
const BOOM_DOWN = 0.52;

const L_FUS = 50.5;
const Z_NOSE = -L_FUS / 2;
const Z_TAIL = L_FUS / 2;
const R_FUS = 2.52;

/** the 767's body: round, a blunt ogival nose that droops a little, a long tail cone that lifts */
function fuselageRadius(z: number): number {
  const u = (z - Z_NOSE) / L_FUS;
  let r = R_FUS;
  if (u < 0.135) {
    const t = u / 0.135;
    r = R_FUS * Math.pow(1 - Math.pow(1 - t, 2.3), 0.52);
  } else if (u > 0.66) {
    const t = (u - 0.66) / 0.34;
    r = R_FUS * (1 - Math.pow(t, 1.45) * 0.9);
  }
  return Math.max(0.09, r);
}
function fuselageLift(z: number): number {
  const u = (z - Z_NOSE) / L_FUS;
  if (u > 0.66) return Math.pow((u - 0.66) / 0.34, 1.9) * 2.0;
  if (u < 0.135) return -0.3 * Math.pow(1 - u / 0.135, 2);
  return 0;
}

// the wing: a 35 degree leading edge from the side of the body, 6 degrees of
// dihedral, a straight inboard trailing edge (the yehudi) out to the engine
const WING: WingStation[] = [
  { x: 0, le: -7.0, te: 4.5, y: -1.75, t: 0.13 },
  { x: 2.55, le: -6.6, te: 3.9, y: -1.72, t: 0.13 },
  { x: 8.6, le: -2.35, te: 3.25, y: -1.08, t: 0.115 },
  { x: 23.8, le: 8.3, te: 10.6, y: 0.55, t: 0.09 },
];
const STAB: WingStation[] = [
  { x: 0, le: 15.9, te: 22.3, y: 1.15, t: 0.1 },
  { x: 9.3, le: 21.3, te: 23.7, y: 1.95, t: 0.08 },
];
const FIN: WingStation[] = [
  { x: -1.2, le: 12.2, te: 22.7, t: 0.1 },
  { x: 0, le: 12.2, te: 22.7, t: 0.1 },
  { x: 9.0, le: 19.7, te: 23.7, t: 0.08 },
];
const FIN_ROOT_Y = 2.15;

function wingAt(x: number): { y: number; le: number; te: number } {
  const ax = Math.abs(x);
  for (let i = 0; i < WING.length - 1; i++) {
    const a = WING[i], b = WING[i + 1];
    if (ax <= b.x) {
      const t = (ax - a.x) / (b.x - a.x);
      return { y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, le: a.le + (b.le - a.le) * t, te: a.te + (b.te - a.te) * t };
    }
  }
  const e = WING[WING.length - 1];
  return { y: e.y ?? 0, le: e.le, te: e.te };
}

let tankerLivery: Livery | null = null;
function livery(): Livery {
  if (tankerLivery) return tankerLivery;
  const L = new Livery({ half: 26, z0: -26.5, len: 53, y0: -6.5, height: 18 }, 2048, 1024, 2048);
  const { gt, gb, gs } = L;
  const T = (x: number, z: number) => L.T(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const rnd = prng(46);
  const pt = L.pt, ps = L.ps;
  // the body's own subtle weathering
  weather(gt, L.top.width, L.top.height, rnd, 0.6, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.4, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.5, [1, 0]);
  // --- the sides: frames and stringers, doors, windows, the title, the roundel
  const dark = 'rgba(16,20,24,0.55)';
  // skin frames every 1.2 m along the fuselage, from the nose to the tail cone
  for (let z = -22; z < 23; z += 1.27) {
    const r = fuselageRadius(z);
    const lift = fuselageLift(z);
    line(gs, [S(z, lift - r * 0.98), S(z, lift + r * 0.98)], 1.2, 'rgba(18,22,26,0.22)');
  }
  // stringers: a few long lines
  for (const y of [-1.6, -0.6, 0.5, 1.4]) line(gs, [S(-20, y), S(16, y)], 1.0, 'rgba(18,22,26,0.18)');
  // cockpit windows: six panes wrapping the nose, the two front ones raked
  gs.fillStyle = '#131920';
  const wz = Z_NOSE + 3.3, wy = 1.25;
  for (const [dz, w, h] of [
    [0, 1.1, 0.75],
    [1.25, 0.85, 0.72],
    [2.15, 0.8, 0.66],
  ] as const) {
    const [x, y] = S(wz + dz, wy + h / 2);
    gs.beginPath();
    gs.moveTo(x, y);
    gs.lineTo(x + w * ps, y - 0.12 * ps);
    gs.lineTo(x + w * ps, y + h * ps);
    gs.lineTo(x, y + h * ps);
    gs.closePath();
    gs.fill();
  }
  // the eyebrow window and its frame line
  line(gs, [S(wz - 0.4, wy - 0.15), S(wz + 3.2, wy - 0.15)], 1.2, dark);
  // doors: the crew door forward, the big cargo door, the aft door
  const door = (z0: number, z1: number, y0: number, y1: number) => {
    line(gs, [S(z0, y0), S(z1, y0), S(z1, y1), S(z0, y1)], 1.4, dark, true);
  };
  door(Z_NOSE + 5.4, Z_NOSE + 6.5, -0.9, 1.0);
  door(Z_NOSE + 8.4, Z_NOSE + 11.9, -0.5, 2.0);
  door(Z_TAIL - 8.6, Z_TAIL - 7.5, -0.6, 1.0);
  // a few cabin windows behind the cockpit (the KC-46 has very few)
  gs.fillStyle = '#1a2129';
  for (const z of [Z_NOSE + 7.2, Z_NOSE + 13.5, Z_NOSE + 14.4, Z_TAIL - 10.5, Z_TAIL - 9.6]) {
    const [x, y] = S(z, 0.95);
    gs.fillRect(x - 0.17 * ps, y - 0.22 * ps, 0.34 * ps, 0.44 * ps);
  }
  // the tail flash: a dark blue band across the fin's top with a thin yellow line under it
  gs.fillStyle = '#1e2a4a';
  {
    const [x0, y0] = S(Z_TAIL - 5.2, 10.6);
    const [x1, y1] = S(Z_TAIL - 1.6, 9.6);
    gs.fillRect(x0, y0, x1 - x0, y1 - y0);
    gs.fillStyle = '#e3b52c';
    gs.fillRect(x0, y1, x1 - x0, 0.1 * ps);
  }
  // the roundel aft of the wing, both sides
  roundel(gs, 'blue', ...S(11.0, 0.2), 1.0 * ps);
  // the boom operator's hatch line under the tail
  line(gs, [S(Z_TAIL - 6.0, -1.4), S(Z_TAIL - 4.0, -1.4)], 1.2, dark);
  // (everything so far is the same both sides; the lettering reads correctly on each)
  L.copySides();
  // the title along the forward fuselage, the command and the serial on the fin
  L.sideText('U.S. AIR FORCE', Z_NOSE + 13.2, 0.55, 1.15 * ps, '#1e2a4a', 'bold');
  L.sideText('AMC', Z_TAIL - 3.6, 6.4, 1.3 * ps, '#1e2a4a', 'bold');
  L.sideText('80046', Z_TAIL - 2.0, 4.7, 0.6 * ps, '#1e2a4a', 'bold');
  // --- the top: the spine, the wing walk, the fuel panels, the roundel on the right wing
  for (let z = -22; z < 15; z += 1.27) line(gt, [T(-R_FUS * 0.95, z), T(R_FUS * 0.95, z)], 1.0, 'rgba(18,22,26,0.16)');
  line(gt, [T(0, -21), T(0, 22)], 1.1, 'rgba(18,22,26,0.2)');
  // wing panel lines: ribs every 1.6 m and the spars
  for (const sx of [-1, 1]) {
    for (let x = 3; x < 23.5; x += 1.55) {
      const w = wingAt(x);
      line(gt, [T(sx * x, w.le + 0.3), T(sx * x, w.te - 0.2)], 1.0, 'rgba(18,22,26,0.2)');
    }
    const f = (c: number) => [3, 23.5].map((x) => {
      const w = wingAt(x);
      return T(sx * x, w.le + (w.te - w.le) * c);
    });
    line(gt, f(0.18), 1.3, 'rgba(18,22,26,0.3)');
    line(gt, f(0.62), 1.3, 'rgba(18,22,26,0.3)');
    // flaps, spoilers and ailerons: the hinge lines
    line(gt, f(0.72), 1.0, 'rgba(18,22,26,0.3)');
    // the wing walk
    gt.fillStyle = 'rgba(40,44,48,0.35)';
    const a = wingAt(3.2), b = wingAt(8.0);
    gt.beginPath();
    gt.moveTo(...T(sx * 3.2, a.le + 0.4));
    gt.lineTo(...T(sx * 8.0, b.le + 0.4));
    gt.lineTo(...T(sx * 8.0, b.le + 2.2));
    gt.lineTo(...T(sx * 3.2, a.le + 2.6));
    gt.closePath();
    gt.fill();
    rivets(gt, T(sx * 3, wingAt(3).le + 0.6), T(sx * 23, wingAt(23).le + 0.5), 0.35 * pt, 1.2);
  }
  roundel(gt, 'blue', ...T(-15.5, wingAt(15.5).le + 1.6), 1.2 * pt);
  // --- the bottom: the belly panels, the roundel on the left wing, the boom's dark bay
  for (let z = -20; z < 18; z += 1.27) line(gb, [L.B(-R_FUS * 0.9, z), L.B(R_FUS * 0.9, z)], 1.0, 'rgba(18,22,26,0.16)');
  roundel(gb, 'blue', ...L.B(15.5, wingAt(15.5).le + 1.6), 1.2 * L.pb);
  gb.fillStyle = 'rgba(30,32,34,0.5)';
  gb.fillRect(...L.B(1.1, 17.5), 2.2 * L.pb, 4.5 * L.pb);
  tankerLivery = L;
  return L;
}

export function buildKC46(): TankerModel {
  const pm = partMaterials();
  const L = livery();
  const paint = skinMaterial({ top: new THREE.Color('#a3a9ae'), bottom: new THREE.Color('#b2b8bd'), livery: L, roughness: 0.48, metalness: 0.18 });
  const g = new THREE.Group();
  const skinParts: THREE.BufferGeometry[] = [];
  const skin = (geo: THREE.BufferGeometry) => skinParts.push(stamp(geo));
  const dark = pm.darkMetal;
  const metal = new THREE.MeshStandardMaterial({ color: '#b9bdc0', roughness: 0.3, metalness: 0.85 });
  const darkParts: THREE.BufferGeometry[] = [];

  // --- the fuselage: a round body, nose to tail, with the tail cone lifting
  const circle = (z: number): P2[] => {
    const r = fuselageRadius(z);
    const cy = fuselageLift(z);
    const pts: P2[] = [];
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      // the lower lobe a touch wider than the upper (the 767's double-bubble hint)
      const rr = r * (1 + 0.03 * Math.max(0, -Math.sin(a)));
      pts.push([Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return pts;
  };
  skin(loftProfile({ stations: [...stations(Z_NOSE, Z_NOSE + 7, 26, 0.5, 0), ...stations(Z_NOSE + 7.3, Z_TAIL - 17, 20), ...stations(Z_TAIL - 16.7, Z_TAIL, 30, 0, 0.4)], profile: circle, sub: 1, full: true, capStart: true, capEnd: true }));
  // the cockpit brow: the windscreen frame stands a little proud of the nose
  // the wing-to-body fairing: a long belly bulge under the wing root
  skin(loftProfile({
    stations: stations(-9.0, 9.0, 30),
    profile: (z) => {
      const u = sstep(-9.0, -4.5, z) * (1 - sstep(4.0, 9.0, z));
      const hw = 0.5 + 2.45 * u;
      const hh = 0.4 + 0.7 * u;
      return rrect(0, -1.95, hw, hh, Math.min(hw, hh) * 0.85, 6);
    },
    sub: 1,
    full: true,
    capStart: true,
    capEnd: true,
  }));
  // --- the wing, both sides, and its flap-track fairings
  skin(both(wing({ sections: WING, chordPts: 34, spanSub: 10, tip: 'round', root: 'flat', thickPos: 0.38, camber: 0.012 })));
  for (const sx of [-1, 1]) {
    for (const x of [4.6, 8.3, 12.4, 16.9]) {
      const w = wingAt(x);
      const c = w.te - w.le;
      skin(lathe([[0.03, -c * 0.45], [0.3, -c * 0.2], [0.34, 0.2], [0.26, 1.6], [0.03, 2.3]], 14, sx * x, w.y - 0.3).translate(0, 0, w.te - 0.5));
    }
    // the refuelling pods out near the tips, on short pylons
    const px = sx * 16.4;
    const w = wingAt(px);
    skin(lathe([[0.04, -2.4], [0.36, -1.7], [0.42, -0.3], [0.4, 1.2], [0.3, 1.9], [0.12, 2.5], [0.04, 2.7]], 18, px, w.y - 0.95).translate(0, 0, w.le + 2.7));
    skin(new THREE.BoxGeometry(0.22, 0.75, 2.4).translate(px, w.y - 0.5, w.le + 2.1));
  }
  // --- the engines: PW4062s in long nacelles under the wings, on pylons
  for (const sx of [-1, 1]) {
    const ex = sx * 7.9, ey = -3.55, ez = -6.6;
    skin(lathe([[1.32, -3.2], [1.44, -2.9], [1.47, -2.0], [1.45, -0.4], [1.38, 1.0], [1.22, 1.9], [1.0, 2.5]], 36, ex, ey).translate(0, 0, ez));
    // the core cowl and the exhaust cone
    const core = lathe([[0.98, 2.5], [0.82, 3.3], [0.7, 4.0], [0.5, 4.7], [0.2, 5.4]], 28, ex, ey).translate(0, 0, ez);
    darkParts.push(core);
    // the inlet: a dark duct with the fan face and the spinner
    const duct = lathe([[1.3, -3.2], [1.25, -2.4], [1.18, -1.7]], 36, ex, ey).translate(0, 0, ez);
    darkParts.push(duct);
    const fan = new THREE.CircleGeometry(1.2, 36).rotateY(Math.PI).translate(ex, ey, ez - 1.7);
    darkParts.push(colorize(fan, (_p, c) => c.setRGB(0.1, 0.1, 0.11)));
    darkParts.push(lathe([[0.02, -2.5], [0.2, -2.1], [0.32, -1.7]], 16, ex, ey).translate(0, 0, ez));
    // the pylon up to the wing
    const w = wingAt(ex);
    const pyl = new THREE.Shape();
    pyl.moveTo(ez - 2.4, ey + 1.2);
    pyl.lineTo(ez + 2.3, ey + 1.0);
    pyl.lineTo(w.le + 3.6, w.y - 0.05);
    pyl.lineTo(w.le + 0.3, w.y - 0.05);
    pyl.closePath();
    const pg = new THREE.ExtrudeGeometry(pyl, { depth: 0.7, bevelEnabled: false });
    pg.rotateY(-Math.PI / 2);
    pg.translate(ex + 0.35, 0, 0);
    skin(pg);
  }
  // --- the tail: tailplane with dihedral, the fin and its dorsal fillet
  skin(both(wing({ sections: STAB, chordPts: 26, spanSub: 7, tip: 'round', root: 'flat', thickPos: 0.4 })));
  const fm = finMatrix(0, FIN_ROOT_Y, 0, 1);
  skin(wing({ sections: FIN, chordPts: 28, spanSub: 8, tip: 'round', root: 'flat', thickPos: 0.4, matrix: fm }));
  skin(wing({ sections: [{ x: -0.8, le: 9.6, te: 13.2, t: 0.07 }, { x: 1.0, le: 12.3, te: 13.6, t: 0.06 }], chordPts: 14, spanSub: 3, tip: 'flat', root: 'flat', matrix: fm }));
  // the APU exhaust at the very tail
  darkParts.push(lathe([[0.22, -0.3], [0.2, 0.6]], 12, 0, fuselageLift(Z_TAIL) + 0.1).translate(0, 0, Z_TAIL - 0.2));
  // --- antennas and the boom operator's camera fairing under the tail
  skin(new THREE.BoxGeometry(0.1, 0.4, 0.5).translate(0, R_FUS + 0.15, -14));
  skin(new THREE.BoxGeometry(0.1, 0.35, 0.45).translate(0, R_FUS + 0.12, 2.0));
  darkParts.push(new THREE.BoxGeometry(1.0, 0.5, 1.4).translate(0, -2.45, 15.3));
  g.add(new THREE.Mesh(join(skinParts), paint));
  g.add(new THREE.Mesh(join(darkParts), dark));

  // --- the boom: a tapered tube hinged under the tail, the V ruddevators near
  // its end, the nozzle on the telescoping tube
  const boom = new THREE.Group();
  boom.position.copy(BOOM_HINGE);
  const boomTube = lathe([[0.44, 0], [0.4, 3], [0.33, 11], [0.3, BOOM_LEN - 0.3], [0.2, BOOM_LEN]], 20);
  const boomMetal = new THREE.MeshStandardMaterial({ color: '#8d9398', roughness: 0.45, metalness: 0.5 });
  boom.add(new THREE.Mesh(boomTube, boomMetal));
  // the hinge fairing
  boom.add(new THREE.Mesh(lathe([[0.55, -0.4], [0.5, 0.6], [0.44, 1.2]], 20), boomMetal));
  const ruddevators: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const rv = wing({ sections: [{ x: 0, le: -0.75, te: 1.05, t: 0.1 }, { x: 2.3, le: -0.1, te: 1.0, t: 0.08 }], chordPts: 14, spanSub: 3, tip: 'round', root: 'flat' });
    // a V: both fins up, 40 degrees either side of vertical
    rv.rotateZ(s > 0 ? Math.PI / 2 - 0.7 : Math.PI / 2 + 0.7);
    // (the mesh sits at its own root on the boom, so its flex turns about the root, not the hinge)
    const m = new THREE.Mesh(rv, boomMetal);
    m.position.z = BOOM_LEN - 5.2;
    boom.add(m);
    ruddevators.push(m);
  }
  const tube = new THREE.Mesh(join([lathe([[0.19, 0], [0.19, 6.4], [0.24, 6.6], [0.24, 7.0], [0.13, 7.2]], 16)]), metal);
  tube.position.z = BOOM_LEN - 7.0;
  boom.add(tube);
  g.add(boom);
  // --- the centreline drogue: its fairing under the tail, the hose and the basket
  g.add(new THREE.Mesh(lathe([[0.1, -2.6], [0.55, -1.6], [0.6, 0.6], [0.4, 1.6], [0.12, 2.1]], 18, HOSE_ROOT.x, HOSE_ROOT.y + 0.45).translate(0, 0, HOSE_ROOT.z - 0.4), dark));
  const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 8, 1, true).translate(0, 0.5, 0), dark);
  g.add(hose);
  const basket = new THREE.Group();
  const cone = new THREE.CylinderGeometry(0.62, 0.18, 1.1, 24, 1, true).rotateX(-Math.PI / 2);
  basket.add(new THREE.Mesh(cone, new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.7, side: THREE.DoubleSide })));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), dark);
  ring.position.z = 0.55;
  basket.add(ring);
  // the coupling at the basket's throat
  basket.add(new THREE.Mesh(lathe([[0.16, -0.9], [0.2, -0.3], [0.18, 0.0]], 12), metal));
  g.add(basket);
  // --- the lights: navigation lights on the tips and tail, beacons, the pilot director lights
  const lights: THREE.Mesh[] = [];
  const lm = (c: string) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  const tipL = wingAt(23.8), tipR = wingAt(23.8);
  for (const [x, y, z, c] of [
    [-23.7, tipL.y + 0.05, tipL.le + 0.6, '#ff2a2a'],
    [23.7, tipR.y + 0.05, tipR.le + 0.6, '#2aff5a'],
    [0, fuselageLift(Z_TAIL) + 0.3, Z_TAIL - 0.1, '#ffffff'],
    [0, R_FUS + 0.1, -3, '#ff2a2a'],
    [0, -2.9, 5, '#ff2a2a'],
  ] as [number, number, number, string][]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lm(c));
    b.position.set(x, y, z);
    g.add(b);
    lights.push(b);
  }
  // the pilot director lights under the belly ahead of the boom: the left column
  // tells the receiver up / down, the right one forward / aft (green in the middle)
  const pdl = { updown: [] as THREE.Mesh[], foreaft: [] as THREE.Mesh[] };
  const lampGeo = new THREE.BoxGeometry(0.28, 0.08, 0.5);
  for (let i = 0; i < 5; i++) {
    for (const [col, x] of [
      [pdl.updown, -0.95],
      [pdl.foreaft, 0.95],
    ] as [THREE.Mesh[], number][]) {
      const m = new THREE.Mesh(lampGeo, lm(i === 2 ? '#2aff5a' : '#ffb13a'));
      m.position.set(x, -2.58, 9.2 + i * 0.75);
      m.visible = false;
      g.add(m);
      col.push(m);
    }
  }
  return { group: g, boom, tube, ruddevators, hose, basket, lights, pdl };
}

/** where the receiver's point goes for contact, in the tanker's frame */
export function contactTarget(kind: AarKind): THREE.Vector3 {
  return kind === 'boom' ? BOOM_HINGE.clone().add(new THREE.Vector3(0, -Math.sin(BOOM_DOWN), Math.cos(BOOM_DOWN)).multiplyScalar(BOOM_LEN + 3)) : BASKET_REST.clone();
}

// ---------------------------------------------------------------- the tanker in flight
export type AarState = 'off' | 'join' | 'precontact' | 'capture' | 'contact' | 'full';

/** inside this of the contact point (m), with the jet roughly matched, the auto-connect takes over */
const CAPTURE_RADIUS = 45;
const CAPTURE_REL_SPEED = 28;

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Tanker {
  readonly model = buildKC46();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** the racetrack: its middle, the direction of the first leg, leg length and turn radius */
  private centre: THREE.Vector3;
  private u: THREE.Vector3;
  private w: THREE.Vector3;
  private legL = 40_000;
  private turnR: number;
  readonly speed: number;
  readonly alt: number;
  private s = 0;
  private bank = 0;
  private quat = new THREE.Quaternion();
  private inv = new THREE.Matrix4();
  // the receiver
  state: AarState = 'off';
  kind: AarKind = 'none';
  private steady = 0;
  private lastSay = '';
  /** fuel passed this sortie, kg */
  given = 0;
  /** what to tell the receiver pilot, every frame */
  cue = '';
  private t = 0;
  private basketPos = BASKET_REST.clone();
  /** the auto-connect: time in the capture, the held pitch attitude, the pilot's break-away input timer */
  private captureT = 0;
  private holdPitch = 3 * DEG;
  private breakT = 0;
  /** after a disconnect the auto-connect stays off for a few seconds (so you can fly away) */
  private captureLock = 0;
  /** the boom's plug-in: 0 flying free, 1 latched on the receptacle */
  private latch = 0;
  /** the slide off the boom after a top-off (s), -1 when not sliding */
  private slideT = -1;
  /** how the last disconnect came about */
  lastRelease = '';

  constructor(centre: THREE.Vector3, headingDeg: number, altFt = 22_000, kts = 320) {
    this.alt = altFt * FT;
    this.speed = kts * KT;
    this.centre = centre.clone().setY(this.alt);
    const h = (headingDeg * Math.PI) / 180;
    this.u = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
    this.w = new THREE.Vector3(-this.u.z, 0, this.u.x);
    // turns at about 20 degrees of bank, as real tankers fly the track
    this.turnR = (this.speed * this.speed) / (G * Math.tan((20 * Math.PI) / 180));
    this.place(0);
  }

  get length(): number {
    return 2 * this.legL + 2 * Math.PI * this.turnR;
  }

  /** the game is flying the jet for the pilot: on its way onto the boom, or hooked up */
  get held(): boolean {
    return this.state === 'capture' || this.state === 'contact' || this.slideT >= 0;
  }

  /** the tanker's attitude (world) */
  get orientation(): THREE.Quaternion {
    return this.quat;
  }

  /** a point in the tanker's frame, in the world */
  toWorld(local: THREE.Vector3): THREE.Vector3 {
    return local.clone().applyMatrix4(this.model.group.matrixWorld);
  }

  /** the track position at path distance s (and the bank there) */
  private at(s: number, out: THREE.Vector3): number {
    const L = this.legL, R = this.turnR;
    s = ((s % this.length) + this.length) % this.length;
    let a: number, b: number, bank = 0;
    if (s < L) {
      a = -L / 2 + s;
      b = -R;
    } else if (s < L + Math.PI * R) {
      const th = -Math.PI / 2 + (s - L) / R;
      a = L / 2 + Math.cos(th) * R;
      b = Math.sin(th) * R;
      bank = 1;
    } else if (s < 2 * L + Math.PI * R) {
      a = L / 2 - (s - L - Math.PI * R);
      b = R;
    } else {
      const th = Math.PI / 2 + (s - 2 * L - Math.PI * R) / R;
      a = -L / 2 + Math.cos(th) * R;
      b = Math.sin(th) * R;
      bank = 1;
    }
    out.copy(this.centre).addScaledVector(this.u, a).addScaledVector(this.w, b);
    return bank;
  }

  private place(dt: number): void {
    this.s += this.speed * dt;
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    const turning = this.at(this.s, p);
    this.at(this.s + 2, q);
    this.vel.copy(q).sub(p).multiplyScalar(this.speed / 2);
    this.pos.copy(p);
    // which way the turn goes, for the bank
    const d = q.clone().sub(p).normalize();
    // (the track turns right at both ends: a right bank is a negative roll about the tail-pointing Z)
    const bankTarget = turning ? -Math.atan((this.speed * this.speed) / (G * this.turnR)) : 0;
    this.bank += (bankTarget - this.bank) * Math.min(1, dt * 0.6);
    const yaw = Math.atan2(-d.x, -d.z);
    this.quat.setFromEuler(new THREE.Euler(0.035, yaw, this.bank, 'YXZ'));
    const g = this.model.group;
    g.position.copy(this.pos);
    g.quaternion.copy(this.quat);
    g.updateMatrixWorld(true);
    this.inv.copy(g.matrixWorld).invert();
  }

  /** a world point in the tanker's frame */
  private toLocal(v: THREE.Vector3): THREE.Vector3 {
    return v.clone().applyMatrix4(this.inv);
  }

  /** the pilot moving the stick while the jet is held: a firm, sustained input breaks away */
  pilotInput(firm: boolean, dt: number): void {
    if (!this.held) return;
    this.breakT = firm ? this.breakT + dt : Math.max(0, this.breakT - dt * 2);
    if (this.breakT > 0.45) this.release('pilot');
  }

  /** let go of the jet: the boom retracts, the basket is left, the pilot has control */
  release(reason: 'pilot' | 'full' | 'gone'): void {
    if (!this.held && this.state !== 'contact') return;
    this.lastRelease = reason;
    this.breakT = 0;
    this.steady = 0;
    this.slideT = -1;
    this.latch = 0;
    this.captureLock = reason === 'pilot' ? 8 : reason === 'full' ? 15 : 4;
    this.state = reason === 'full' ? 'full' : 'precontact';
    audio.mechanical();
  }

  update(dt: number, p: Aircraft | null, say: (t: string, kind?: 'info' | 'good' | 'warn') => void): void {
    this.t += dt;
    this.place(dt);
    const m = this.model;
    // beacons blink, the ruddevators work a little
    m.lights[3].visible = m.lights[4].visible = Math.sin(this.t * 6.3) > 0.6;
    this.cue = '';
    this.captureLock = Math.max(0, this.captureLock - dt);
    if (!p || !p.alive) {
      if (this.held) this.release('gone');
      this.state = 'off';
      this.stow(dt);
      this.pdl(null);
      return;
    }
    this.kind = aarKind(p.spec.type);
    // the boom comes down for boom jets, the hose trails for probe jets
    const boomOut = this.kind === 'boom';
    const hoseOut = this.kind === 'probe';
    const rp = receiverPoint(p, this.kind).applyQuaternion(p.fm.quat).add(p.fm.pos);
    const local = this.toLocal(rp);
    const rel = p.fm.vel.clone().sub(this.vel);
    const relLocal = rel.clone().applyQuaternion(this.quat.clone().invert());
    const dist = p.fm.pos.distanceTo(this.pos);
    const full = p.fm.fuelInternal >= p.spec.internalFuel - 1 && p.fm.fuelExternal >= p.fm.fuelExternalCap - 1;
    const tell = (text: string, kind: 'info' | 'good' | 'warn' = 'info') => {
      if (text === this.lastSay) return;
      this.lastSay = text;
      say(text, kind);
    };
    if (this.kind === 'none') {
      this.state = 'off';
      if (dist < 2000) this.cue = 'THE X-15 CANNOT REFUEL IN THE AIR';
      this.stow(dt);
      this.pdl(null);
      return;
    }
    const lb = (kg: number) => Math.round(kg / 0.4536).toLocaleString('en-US');
    // the slide down and back off the boom after a top-off runs on its own clock,
    // whatever else happens; then the pilot has the jet again
    if (this.slideT >= 0) {
      this.slideT += dt;
      const k = Math.min(1, this.slideT / 3.5);
      const goal = (boomOut ? contactTarget('boom') : BASKET_REST.clone()).add(new THREE.Vector3(0, -7 * k * k, 9 * k));
      this.hold(p, dt, goal, 0.9, 7, false);
      this.cue = 'TOPPED OFF · SLIDING OFF THE TANKER · STAND BY';
      if (this.slideT > 3.5) {
        this.slideT = -1;
        this.zeroRates(p);
        tell('You have control. Clear to the right of the tanker.', 'info');
      }
      this.stow(dt);
      this.pdl(null);
      m.hose.visible = m.basket.visible = hoseOut;
      return;
    }
    // the place to fly to: the boom's nozzle or the basket
    const target = boomOut ? contactTarget('boom') : this.basketPos.clone();
    const d = target.clone().sub(local);
    const fmt = (v: number, pos: string, neg: string) => (Math.abs(v) < 0.6 ? '' : `${v > 0 ? pos : neg} ${Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))} M`);

    if (this.state === 'contact') {
      // hooked up and held: take fuel
      const rate = (boomOut ? 55 : 25) * dt;
      const before = p.fm.fuelTotal;
      const toInt = Math.min(Math.max(0, p.spec.internalFuel - p.fm.fuelInternal), rate);
      p.fm.fuelInternal += toInt;
      if (rate > toInt) p.fm.fuelExternal = Math.min(p.fm.fuelExternalCap, p.fm.fuelExternal + rate - toInt);
      this.given += p.fm.fuelTotal - before;
      this.hold(p, dt, boomOut ? contactTarget('boom') : BASKET_REST.clone().add(new THREE.Vector3(0, 0, -1.6)), 0.7, 3, true);
      if (boomOut) this.aimBoom(local.clone().sub(BOOM_HINGE), dt);
      else this.basketPos.copy(local);
      this.latch = Math.min(1, this.latch + dt * 2);
      this.cue = `CONNECTED · TAKING FUEL · ${lb(p.fm.fuelTotal)} LB · THE JET IS HELD ${boomOut ? 'ON THE BOOM' : 'IN THE BASKET'}, RELAX · [H] OR A FIRM STICK TO DISCONNECT`;
      if (full) {
        this.release('full');
        this.slideT = 0;
        tell(`Topped off: ${lb(this.given)} lb passed. Disconnecting: sliding you down and back off the ${boomOut ? 'boom' : 'basket'}. Thanks for the business!`, 'good');
      }
    } else if (this.state === 'capture') {
      // the auto-connect: the jet is flown the last metres onto the boom / into the basket
      this.captureT += dt;
      const goal = boomOut ? contactTarget('boom') : BASKET_REST.clone().add(new THREE.Vector3(0, 0, -1.6));
      // a short pause at pre-contact, 3 m short, so the plug-in reads as two steps
      const stage = this.captureT < 4.5 ? goal.clone().add(new THREE.Vector3(0, -0.4, 3.2)) : goal;
      const settled = this.hold(p, dt, stage, this.captureT < 4.5 ? 1.5 : 1.1, 9, false);
      if (boomOut) {
        // the boom operator flies the boom down onto the receptacle as the jet comes in
        const v = local.clone().sub(BOOM_HINGE);
        const reach = this.captureT > 4.5 ? Math.min(1, (this.captureT - 4.5) / 2.5) : 0;
        if (reach > 0) this.aimBoom(v, dt, reach);
        else this.boomTo(new THREE.Vector3(0, -Math.sin(BOOM_DOWN), Math.cos(BOOM_DOWN)), 3, dt);
      } else this.basketPos.lerp(this.captureT > 4.5 ? local.clone().add(new THREE.Vector3(0, 0, 0.6)) : BASKET_REST, Math.min(1, dt * 3));
      const dGoal = goal.clone().sub(local).length();
      this.cue = this.captureT < 4.5 ? `AUTO-CONNECT · STABILISING AT PRE-CONTACT · HANDS OFF` : boomOut ? `AUTO-CONNECT · THE BOOM IS COMING DOWN · ${dGoal.toFixed(1)} M` : `AUTO-CONNECT · PUSHING INTO THE BASKET · ${dGoal.toFixed(1)} M`;
      if (this.captureT > 6 && dGoal < 0.35 && settled) {
        this.state = 'contact';
        this.latch = 0;
        audio.mechanical();
        tell(boomOut ? 'Contact! The boom is latched in your receptacle: fuel is flowing. The jet holds itself on the boom.' : 'Contact! Probe in the basket, hose taking up: fuel is flowing. The jet holds itself in position.', 'good');
      }
    } else if (this.state === 'full') {
      // topped off and off the boom: nothing more to give until some has been burned
      this.cue = 'TOPPED OFF · CLEAR THE TANKER';
      this.stow(dt);
      const cap = p.spec.internalFuel + p.fm.fuelExternalCap;
      if (p.fm.fuelTotal < cap - 80 || dist > 1500) this.state = dist > 1500 ? 'off' : 'join';
    } else {
      // joining up and the pre-contact position
      this.state = dist < 3000 ? 'precontact' : dist < 40 * NM ? 'join' : 'off';
      if (boomOut) this.boomTo(new THREE.Vector3(0, -Math.sin(BOOM_DOWN), Math.cos(BOOM_DOWN)), 3, dt);
      else this.basketPos.lerp(BASKET_REST.clone().add(new THREE.Vector3(Math.sin(this.t * 0.9) * 0.25, Math.sin(this.t * 1.3) * 0.18, 0)), Math.min(1, dt * 2));
      if (this.state === 'precontact') {
        const closing = -relLocal.z;
        const behind = local.z > BOOM_HINGE.z - 4 && local.y < 1.5;
        if (full) this.cue = 'TANKS FULL · NO FUEL NEEDED';
        else if (this.captureLock <= 0 && d.length() < CAPTURE_RADIUS && rel.length() < CAPTURE_REL_SPEED && behind) {
          // close enough and slow enough: the auto-connect takes the jet
          this.state = 'capture';
          this.captureT = 0;
          this.breakT = 0;
          this.holdPitch = Math.max(1.5 * DEG, Math.min(7 * DEG, p.fm.alpha));
          this.steady = 0;
          tell(`AUTO-CONNECT. Hands off: the jet flies itself ${boomOut ? 'onto the boom' : 'into the basket'} from here.`, 'good');
        } else {
          const parts = [fmt(d.z, 'BACK', 'FORWARD'), fmt(d.y, 'UP', 'DOWN'), fmt(d.x, 'RIGHT', 'LEFT')].filter(Boolean);
          const speedCue = d.length() < 60 && closing > 3 ? ' · THROTTLE BACK' : d.length() < 60 && closing < -2 ? ' · MORE POWER' : '';
          const lockCue = this.captureLock > 0 ? ` · AUTO-CONNECT IN ${Math.ceil(this.captureLock)} S` : d.length() < CAPTURE_RADIUS ? ' · SLOW DOWN FOR AUTO-CONNECT' : ` · AUTO-CONNECT INSIDE ${CAPTURE_RADIUS} M`;
          this.cue = `${boomOut ? 'BOOM' : 'DROGUE'} · ${parts.length ? parts.join(' · ') : 'HOLD'} · CLOSURE ${(-relLocal.z).toFixed(1)} M/S${speedCue}${lockCue}`;
        }
      }
    }
    // station-keeping assist short of the capture: close to the contact point and
    // nearly matched, the jet is eased toward it (big stick or throttle inputs still fly it out)
    if (this.state === 'precontact' && !full && this.captureLock <= 0) {
      const dl = target.clone().sub(local);
      if (dl.length() < 120 && rel.length() < 20) {
        const acc = dl.applyQuaternion(this.quat).multiplyScalar(0.12).addScaledVector(rel, -0.5);
        if (acc.length() > 1.2) acc.setLength(1.2);
        p.fm.vel.addScaledVector(acc, dt);
        this.cue = `${this.cue} · ASSIST`;
      }
    }
    // the director lights for boom jets near the boom
    this.pdl(boomOut && dist < 400 && this.state !== 'off' && this.state !== 'join' ? d : null);
    // draw the boom and the hose
    m.boom.visible = true;
    m.hose.visible = m.basket.visible = hoseOut || this.state === 'off';
    if (!boomOut) this.boomTo(new THREE.Vector3(0, -0.12, 1).normalize(), 0, dt);
    this.drawHose();
  }

  /**
   * Fly the jet for the pilot: the receiver point is eased onto `goalLocal`
   * (tanker frame) with the jet's attitude matched to the tanker's. The velocity
   * is commanded (the flight model carries on under it, so the jet still flies);
   * `settle` is the time constant, `vmax` the most it will close at. With `sway`
   * on, a little natural drift is added (a jet is never held dead still).
   * Returns true once the jet is settled on the goal.
   */
  private hold(p: Aircraft, dt: number, goalLocal: THREE.Vector3, settle: number, vmax: number, sway: boolean): boolean {
    const fm = p.fm;
    // the attitude: the tanker's, pitched up to the jet's own trim
    _e.set(this.holdPitch, 0, 0, 'YXZ');
    _q.copy(this.quat).multiply(new THREE.Quaternion().setFromEuler(_e));
    fm.quat.slerp(_q, 1 - Math.exp(-dt / Math.max(0.4, settle)));
    this.zeroRates(p);
    // where the jet's reference point must sit for the receiver point to be on the goal
    const goal = goalLocal.clone();
    if (sway) goal.add(new THREE.Vector3(Math.sin(this.t * 0.7) * 0.1, Math.sin(this.t * 0.9 + 1) * 0.08, Math.sin(this.t * 0.5) * 0.12));
    const goalW = this.toWorld(goal);
    const rpW = receiverPoint(p, this.kind).applyQuaternion(fm.quat);
    const posWant = goalW.sub(rpW);
    _v.copy(posWant).sub(fm.pos);
    const err = _v.length();
    // the velocity: the tanker's plus a closing term, limited. It is eased in over
    // the first moments of the capture (no jolt as the jet is taken), then
    // commanded outright, so the flight model's own forces leave no standing error
    _w.copy(_v).multiplyScalar(1 / settle);
    if (_w.length() > vmax) _w.setLength(vmax);
    _w.add(this.vel);
    const ease = this.captureT < 1.5 ? 1 - Math.exp(-dt * (3 + 8 * this.captureT)) : 1;
    fm.vel.lerp(_w, ease);
    // the last metre is pulled straight in (nothing wobbles on the latch)
    if (err < 1.0) fm.pos.lerp(posWant, 1 - Math.exp(-dt * 2.5));
    return err < 0.35 && fm.vel.distanceTo(this.vel) < 0.8;
  }

  private zeroRates(p: Aircraft): void {
    const fm = p.fm;
    fm.pRate = fm.qRate = fm.rRate = 0;
    fm.rollRate = fm.pitchRate = fm.yawRate = 0;
  }

  /** the director lights: which lamp of each column is lit for the receiver's offset */
  private pdl(d: THREE.Vector3 | null): void {
    const m = this.model.pdl;
    for (let i = 0; i < 5; i++) m.updown[i].visible = m.foreaft[i].visible = false;
    if (!d) return;
    // d: where the receiver must go (tanker frame): +y up, +z aft
    const ud = 2 + Math.max(-2, Math.min(2, Math.round(d.y / 0.8)));
    const fa = 2 + Math.max(-2, Math.min(2, Math.round(d.z / 1.2)));
    m.updown[ud].visible = true;
    m.foreaft[fa].visible = true;
  }

  /** the boom stowed up under the tail, the basket trailing */
  private stow(dt: number): void {
    this.boomTo(new THREE.Vector3(0, -0.12, 1).normalize(), 0, dt);
    this.basketPos.lerp(BASKET_REST, Math.min(1, dt * 2));
    this.drawHose();
  }

  private boomDir = new THREE.Vector3(0, -0.12, 1).normalize();
  private boomExt = 0;
  private boomTo(dir: THREE.Vector3, ext: number, dt: number): void {
    this.boomDir.lerp(dir, Math.min(1, dt * 1.5)).normalize();
    this.boomExt += (ext - this.boomExt) * Math.min(1, dt * 2);
    this.setBoom();
  }
  /** the nozzle flown onto (or riding on) the receptacle: `reach` 0..1 is how far along the plug-in it is */
  private aimBoom(v: THREE.Vector3, dt: number, reach = 1): void {
    this.boomDir.lerp(v.clone().normalize(), Math.min(1, dt * (4 + 6 * reach))).normalize();
    const want = Math.max(0, Math.min(6.6, v.length() - BOOM_LEN));
    this.boomExt += (want * reach + 3 * (1 - reach) - this.boomExt) * Math.min(1, dt * (1.5 + 4 * reach));
    this.setBoom();
  }
  private setBoom(): void {
    const b = this.model.boom;
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.boomDir);
    this.model.tube.position.z = BOOM_LEN - 7.0 + this.boomExt;
    // the ruddevators flex with the boom's angle
    const k = (Math.asin(-this.boomDir.y) - 0.12) * 0.6;
    this.model.ruddevators.forEach((r, i) => (r.rotation.x = k * (i === 0 ? 1 : -1) * 0.5));
  }
  private drawHose(): void {
    const m = this.model;
    const a = HOSE_ROOT, b = this.basketPos;
    const v = b.clone().sub(a);
    m.hose.position.copy(a);
    m.hose.scale.set(1, v.length(), 1);
    m.hose.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    m.basket.position.copy(b);
    m.basket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().normalize());
  }
}
