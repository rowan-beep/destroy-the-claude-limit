// Saab JAS 39E Gripen E: 15.2 m long, 8.6 m span (with tip rails), 4.5 m tall.
// Single seat: a slim, slightly drooped radome on a round forward fuselage,
// the Skyward-G IRST ahead of a one-piece bubble canopy, tall sharp-lipped
// rectangular intake boxes standing off the fuselage sides on a full-height
// splitter gap with the big close-coupled canards pivoting on their tops, a
// low delta wing (about 51 deg of sweep) whose
// elevons run right back to the nozzle, wingtip missile rails, one fin with a
// narrow tip and the EW pod on it, and one F414G nozzle set low in the tail.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect, Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, curve, sstep, roundBox } from './kit';
import { nozzle, intake, partMaterials, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

function circ(R: number, yc: number): P2[] {
  const ang = [-90, -72, -52, -34, -14, -4, 4, 14, 34, 52, 72, 90];
  return ang.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}

// right half, bottom centre -> top centre; points 4-6 are the wing-root line.
// The radome axis sits about 0.3 m below the engine axis (the nose droops); the
// forward fuselage is round, about 0.9 m across at the cockpit (the intake boxes
// hang beside it, not off a shoulder), the belly is nearly flat at -0.8 further
// back and the spine behind the canopy stays high.
const BODY = keyedProfile([
  { z: -7.6, pts: circ(0.012, -0.4) },
  { z: -7.25, pts: circ(0.15, -0.37) },
  { z: -6.7, pts: circ(0.3, -0.31) },
  { z: -6.0, pts: circ(0.42, -0.25) },
  { z: -5.4, pts: [[0, -0.68], [0.26, -0.655], [0.4, -0.49], [0.44, -0.3], [0.445, -0.14], [0.44, -0.04], [0.43, 0.04], [0.4, 0.12], [0.34, 0.17], [0.24, 0.195], [0.12, 0.2], [0, 0.2]] },
  { z: -4.9, pts: [[0, -0.72], [0.27, -0.7], [0.41, -0.52], [0.45, -0.32], [0.46, -0.15], [0.455, -0.04], [0.45, 0.05], [0.42, 0.14], [0.36, 0.19], [0.26, 0.215], [0.13, 0.22], [0, 0.22]] },
  // the cockpit: the well opens under the glass, the sill at 0.3
  { z: -4.0, pts: [[0, -0.76], [0.28, -0.75], [0.42, -0.58], [0.46, -0.36], [0.47, -0.16], [0.47, -0.06], [0.47, 0.04], [0.46, 0.16], [0.44, 0.26], [0.42, 0.3], [0.34, 0.1], [0, 0.06]] },
  { z: -3.2, pts: [[0, -0.78], [0.28, -0.77], [0.4, -0.64], [0.44, -0.4], [0.45, -0.2], [0.45, -0.12], [0.45, -0.04], [0.45, 0.12], [0.45, 0.26], [0.43, 0.34], [0.34, 0.14], [0, 0.1]] },
  { z: -2.6, pts: [[0, -0.8], [0.28, -0.79], [0.4, -0.68], [0.42, -0.42], [0.42, -0.2], [0.42, -0.12], [0.42, -0.04], [0.44, 0.14], [0.47, 0.32], [0.44, 0.46], [0.25, 0.56], [0, 0.6]] },
  { z: -1.0, pts: [[0, -0.82], [0.4, -0.84], [0.72, -0.8], [0.9, -0.55], [0.97, -0.32], [0.97, -0.26], [0.97, -0.18], [0.94, 0.12], [0.8, 0.4], [0.56, 0.54], [0.3, 0.63], [0, 0.66]] },
  { z: 1.5, pts: [[0, -0.84], [0.44, -0.84], [0.8, -0.78], [0.94, -0.52], [0.98, -0.34], [0.98, -0.28], [0.98, -0.2], [0.95, 0.1], [0.8, 0.38], [0.56, 0.53], [0.3, 0.62], [0, 0.65]] },
  { z: 4.0, pts: [[0, -0.8], [0.42, -0.8], [0.76, -0.74], [0.9, -0.5], [0.94, -0.34], [0.94, -0.28], [0.94, -0.2], [0.9, 0.06], [0.74, 0.3], [0.5, 0.46], [0.26, 0.55], [0, 0.58]] },
  { z: 5.8, pts: [[0, -0.7], [0.4, -0.7], [0.68, -0.64], [0.82, -0.46], [0.86, -0.32], [0.86, -0.26], [0.86, -0.18], [0.82, 0.02], [0.68, 0.22], [0.46, 0.34], [0.22, 0.42], [0, 0.44]] },
  { z: 6.7, pts: circ(0.56, -0.12) },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

// windscreen base at -4.95, crown at -3.4 barely above the high spine, aft end fairing flush into it at -2.2
const CANOPY: Section[] = [
  { z: -4.95, w: 0.04, top: 0.02, bot: 0.02, y: 0.2, n: 2 },
  { z: -4.55, w: 0.34, top: 0.22, bot: 0.03, y: 0.26, n: 2.2 },
  { z: -4.1, w: 0.44, top: 0.42, bot: 0.03, y: 0.3, n: 2.2 },
  { z: -3.6, w: 0.45, top: 0.48, bot: 0.03, y: 0.34, n: 2.2 },
  { z: -3.2, w: 0.45, top: 0.46, bot: 0.03, y: 0.36, n: 2.2 },
  { z: -2.8, w: 0.41, top: 0.35, bot: 0.03, y: 0.4, n: 2.2 },
  { z: -2.45, w: 0.3, top: 0.17, bot: 0.03, y: 0.46, n: 2.1 },
  { z: -2.2, w: 0.12, top: 0.05, bot: 0.03, y: 0.57, n: 2 },
];

// delta wing: about 51 deg of leading-edge sweep from the fuselage side at
// -0.5, the trailing edge slightly forward-swept and ending just short of the nozzle
const wle = (x: number) => -0.5 + (x - 1.06) * 1.23;
const wte = (x: number) => 6.3 - (x - 0.7) * 0.21;
const WING: WingStation[] = [
  { x: 0.7, le: -0.9, te: 6.3, y: -0.34, t: 0.05 },
  { x: 1.06, le: wle(1.06), te: wte(1.06), y: -0.35, t: 0.048 },
  { x: 4.2, le: wle(4.2), te: wte(4.2), y: -0.4, t: 0.035 },
];
// the canards: big, close-coupled, rooted on the intake tops from just behind
// the lip to above the wing root, with a narrow cropped tip and a little anhedral
const CANARD: WingStation[] = [
  { x: 0.72, le: -2.5, te: -0.4, y: 0.3, t: 0.05 },
  { x: 2.5, le: -0.42, te: 0.16, y: 0.24, t: 0.035 },
];
const CANARD_PIVOT = -1.55;
/** the intake box: the lip's top-outer corner (the leading point) and its reach aft */
const MOUTH = -3.3;
const BOX_X = curve([[MOUTH, 0.75], [-1.4, 0.76], [0.8, 0.8]]);
const BOX_HW = curve([[MOUTH, 0.25], [-1.4, 0.26], [0.8, 0.18]]);
const BOX_Y = curve([[MOUTH, -0.24], [-1.4, -0.2], [0.8, -0.18]]);
const BOX_HH = curve([[MOUTH, 0.46], [-1.4, 0.46], [0.8, 0.32]]);
const BOX_R = curve([[MOUTH, 0.035], [-1.4, 0.06], [0.8, 0.1]]);
const FIN_Y = 0.48;
const FIN: WingStation[] = [
  { x: 0, le: 2.5, te: 6.6, t: 0.05 },
  { x: 2.4, le: 5.5, te: 6.45, t: 0.034 },
];
const RUDDER = { h0: 0.3, h1: 2.2, hinge: (h: number) => 5.8 + h * 0.02 };

function livery(team: string): Livery {
  const L = new Livery({ half: 7.0, z0: -7.8, len: 15.6, y0: -1.8, height: 5.0 });
  const { gt, gb, gs } = L;
  const rnd = prng(39);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // radome
  gt.fillStyle = 'rgba(92,98,104,0.7)';
  gt.beginPath();
  gt.ellipse(...T(0, -6.7), 0.36 * pt, 0.85 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gb.fillStyle = 'rgba(92,98,104,0.6)';
  gb.beginPath();
  gb.ellipse(...B(0, -6.7), 0.36 * L.pb, 0.85 * L.pb, 0, 0, Math.PI * 2);
  gb.fill();
  // (no dark anti-glare panel: the nose ahead of the windscreen is plain grey)
  // cockpit well
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.fillRect(...T(-0.44, -4.6), 0.88 * pt, 2.4 * pt);
  for (const z of [-5.3, -4.4, -2.4, -1.4, -0.3, 1.1, 2.6, 4.0, 5.4, 6.4]) {
    line(gt, [T(-0.98, z), T(0.98, z)], 1.2, LINE_LIGHT);
    line(gs, [S(z, -0.85), S(z, 0.64)], 1.4, LINE);
    line(gb, [B(-0.98, z), B(0.98, z)], 1.1, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    line(gt, [T(0.5 * sx, -1.0), T(0.46 * sx, 6.2)], 1.1, LINE_LIGHT);
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(1.1, wle(1.1) + 0.7), M(4.1, wle(4.1) + 0.3)], 1.2, LINE_LIGHT);
      line(g, [M(1.4, wle(1.4) + 0.55), M(4.1, wle(4.1) + 0.42)], 1.3, LINE); // leading-edge flaps
      line(g, [M(1.1, wte(1.1) - 0.85), M(4.1, wte(4.1) - 0.7)], 1.2, LINE); // elevon hinges
      line(g, [M(2.53, wle(2.53) + 0.6), M(2.53, wte(2.53))], 1.0, LINE); // elevon split
      rivets(g, M(1.1, wle(1.1) + 0.7), M(4.1, wle(4.1) + 0.3), 7, 0.9);
      rivets(g, M(1.1, wte(1.1) - 0.85), M(4.1, wte(4.1) - 0.7), 7, 0.9);
      for (const x of [1.7, 2.5, 3.3]) line(g, [M(x, wle(x) + 0.8), M(x, wte(x) - 1.0)], 1.0, LINE_LIGHT);
      line(g, [M(1.05, -2.45), M(2.45, -0.45)], 1.0, LINE_LIGHT); // canard
    }
    if (sx < 0) roundel(gt, team, ...W(2.9, 3.9), 0.36 * pt);
    else roundel(gb, team, ...Wb(2.9, 3.9), 0.36 * L.pb);
  }
  line(gs, [S(-6.1, -0.3), S(-3.4, -0.3)], 1.3, LINE_LIGHT);
  line(gs, [S(-3.1, -0.76), S(5.6, -0.8)], 1.3, LINE);
  // the intake box's panels: the DANGER chevron on its outer wall, a few doors
  const chev = 'rgba(58,62,68,0.9)';
  // (everything sits behind the first 0.5 m of the box: its inboard wall shows through the gap, and
  // the skin rolls that far into the duct, where it would show from ahead)
  line(gs, [S(-2.38, -0.42), S(-2.05, -0.14), S(-2.38, 0.14)], 3.4, chev);
  line(gs, [S(-1.3, -0.48), S(-0.7, -0.48), S(-0.7, -0.2), S(-1.3, -0.2)], 1.2, LINE, true);
  line(gs, [S(0.0, -0.5), S(0.6, -0.5), S(0.6, -0.2), S(0.0, -0.2)], 1.2, LINE, true);
  weather(gt, L.top.width, L.top.height, rnd, 0.7, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.55, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.6, [1, 0.1]);
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    const [x, y] = M(0, 6.6);
    const gr = g.createLinearGradient(x, y - 1.4 * s, x, y);
    gr.addColorStop(0, 'rgba(40,36,30,0)');
    gr.addColorStop(1, 'rgba(40,36,30,0.32)');
    g.fillStyle = gr;
    g.fillRect(x - 0.5 * s, y - 1.4 * s, 1.0 * s, 1.4 * s);
  }
  L.copySides();
  const mark = 'rgba(40,44,50,0.85)';
  // (no two-digit code on the nose: the Gripen E carries the roundel there, ahead of the intake)
  L.sideText(team === 'blue' ? '39 8061' : '39 8027', 5.5, 0.85, 0.11 * ps, mark);
  L.sideText('DANGER', -2.6, -0.14, 0.085 * ps, chev);
  L.sideText(team === 'blue' ? '398061' : '398027', -1.0, 0.05, 0.07 * ps, mark);
  L.sideText('EMERGENCY OPENING', -3.45, 0.2, 0.035 * ps, mark);
  L.sideDraw(5.25, 1.7, (g, x, y) => roundel(g, team, x, y, 0.2 * ps));
  L.sideDraw(-4.05, -0.34, (g, x, y) => roundel(g, team, x, y, 0.26 * ps));
  return L;
}

const liveries = new Map<string, Livery>();

export function buildGripen(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#848c92'), bottom: new THREE.Color('#9aa1a6'), livery: L, roughness: 0.55, metalness: 0.05 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-7.6, -5.4, 30, 0.55, 0), stations(-5.4, -2.6, 44), stations(-2.6, 6.7, 74));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -7.4, 6.6, 40);

  // --- the intake boxes: tall sharp-lipped rectangles, 0.5 m wide and 0.92 m
  // tall at the mouth, standing 6 cm off the round fuselage on a full-height
  // splitter gap; the top-outer corner of the lip leads, the lip raking aft
  // toward the bottom and toward the fuselage; the box fairs into the wing root
  const loop = (z: number) => rrect(BOX_X(z), BOX_Y(z), BOX_HW(z), BOX_HH(z), BOX_R(z), 3);
  const yTop = BOX_Y(MOUTH) + BOX_HH(MOUTH), yBot = BOX_Y(MOUTH) - BOX_HH(MOUTH);
  const xOut = BOX_X(MOUTH) + BOX_HW(MOUTH), xIn = BOX_X(MOUTH) - BOX_HW(MOUTH);
  const inl = intake({
    loop,
    outer: stations(MOUTH, 0.8, 44, 0.3, 0),
    lip: 0.028,
    depth: 1.8,
    n: 72,
    rake: (x, y) => 0.34 * (1 - (y - yBot) / (yTop - yBot)) + 0.28 * ((xOut - x) / (xOut - xIn)),
    rakeFade: 1.4,
    fan: { cx: 0.74, cy: -0.18, r: 0.3 },
  });
  skin(both(inl.skin));
  v.addMesh(both(inl.duct), pm.duct);
  // the gap's back wall reads dark from ahead, and the box top closes onto the
  // fuselage behind the lip (the canard root deck)
  for (const sx of [-1, 1]) {
    const back = new THREE.PlaneGeometry(0.1, 0.84);
    if (sx > 0) back.rotateY(Math.PI);
    back.translate(0.47 * sx, -0.26, -2.5);
    v.addMesh(back, new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.9, side: THREE.DoubleSide }));
    const deck = loftProfile({
      stations: stations(-2.95, 0.8, 16),
      profile: (z) => {
        const h = sstep(-2.95, -2.35, z) * 0.075;
        return [[0.43, 0.17], [0.57, 0.17], [0.57, 0.17 + h], [0.5, 0.19 + h], [0.43, 0.2 + h]] as P2[];
      },
      sub: 2,
      full: true,
      capStart: true,
      capEnd: true,
    });
    skin(sx > 0 ? deck : mirror(deck));
    // the canard's pivot fairing on the box top
    skin(lathe([[0.004, -2.72], [0.09, -2.5], [0.135, -2.05], [0.13, -1.3], [0.08, -0.95], [0.004, -0.78]], 14, 0.76 * sx, 0.22));
  }

  // --- canopy, seat, pilot, IRST
  v.cockpitEye.set(0, 0.5, -3.9);
  buildCanopy(v, CANOPY, -4.06, []);
  addPilot(v, new THREE.Vector3(0, 0.5, -3.9), 0.28, { style: 'eu', stick: 'center', martinBaker: true });
  // (it starts at the windscreen's base, under the glass: ahead of it it would stand proud of the nose)
  const shroud = loftProfile({
    stations: stations(-4.93, -4.55, 6),
    profile: (z) => {
      const u = sstep(-4.93, -4.55, z);
      return [[0, -0.1], [0.34, -0.08], [0.38, 0.12], [0.27, 0.17 + u * 0.04], [0, 0.19 + u * 0.04]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  // Skyward-G IRST: a small glass dome ahead of the windscreen, offset right
  const irst = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), pm.glass);
  irst.position.set(0.17, 0.22, -5.75);
  v.body.add(irst);
  v.hideInCockpit.push(irst, skin(lathe([[0.11, -5.95], [0.115, -5.75], [0.1, -5.55], [0.004, -5.42]], 16, 0.17, 0.18)));

  // --- wing: leading-edge flaps, two elevons a side
  const panels = wingPanels(
    WING,
    [
      { x0: 1.4, x1: 4.05, hinge: (x) => wle(x) + 0.55 - (x - 1.4) * 0.05, kind: 'lef', maxDeg: 20, leading: true },
      { x0: 1.12, x1: 2.5, hinge: (x) => wte(x) - 0.85 + (x - 1.12) * 0.05, kind: 'flap', maxDeg: 25 },
      { x0: 2.57, x1: 4.1, hinge: (x) => wte(x) - 0.78 + (x - 2.57) * 0.05, kind: 'aileron', maxDeg: 25 },
    ],
    { chordPts: 32, thickPos: 0.42 },
  );
  skin(panels.fixed);
  skin(mirror(panels.fixed));
  for (const cs of panels.moving) {
    for (const side of [1, -1] as const) {
      const g = stamp(side > 0 ? cs.geo.clone() : mirror(cs.geo));
      const a = cs.axis.clone();
      if (side < 0) a.x = -a.x;
      v.addSurface(g, paint, new THREE.Vector3(cs.hinge.x * side, cs.hinge.y, cs.hinge.z), side > 0 ? a : a.negate(), cs.kind, side, cs.maxDeg);
    }
  }
  // wingtip missile rails (always fitted): a little longer than the tip chord
  const rail = roundBox(0.09, 0.09, 2.6, 0.03);
  rail.translate(4.3, -0.42, 4.3);
  skin(both(rail));

  // --- canards (all-moving), on the intake tops
  const canard = wing({ sections: CANARD, chordPts: 22, spanSub: 6, tip: 'round', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? canard.clone() : mirror(canard));
    v.addSurface(g, paint, new THREE.Vector3(0.72 * side, 0.3, CANARD_PIVOT), new THREE.Vector3(1, 0, 0), 'canard', side, 25);
  }

  // --- the fin, with the root fairing running forward along the spine
  const m = finMatrix(0, FIN_Y, 0, 1);
  const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
  skin(f.fixed);
  v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', 0, 25);
  // the tip: the dielectric EW pod, poking ahead of the leading edge
  skin(lathe([[0.004, 4.95], [0.045, 5.1], [0.055, 5.55], [0.05, 6.35], [0.004, 6.5]], 12, 0, FIN_Y + 2.36));
  v.addNavLight(new THREE.Vector3(0, FIN_Y + 2.4, 6.35), 'strobe');
  const fillet = loftProfile({
    stations: stations(0.5, 3.2, 20),
    profile: (z) => {
      const h = sstep(0.5, 3.1, z) * 0.14;
      const w = 0.2 - sstep(1.5, 3.2, z) * 0.12;
      return [[0, 0.5], [w, 0.54], [w * 0.4, 0.6 + h], [0, 0.62 + h]] as P2[];
    },
    sub: 3,
    capStart: true,
    capEnd: true,
  });
  skin(fillet);

  // --- the F414G nozzle, set low in the tail
  const nz = nozzle({ cx: 0, cy: -0.12, z0: 6.6, z1: 7.55, r0: 0.5, r1: 0.42, petals: 14, saw: 0.05, floor: 6.72 });
  const nzOut = v.addMesh(nz.outer, pm.nozzle);
  const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
  nzIn.userData.detail = true;
  v.morphNozzle(nzOut, nzIn);
  v.nozzles.push({ pos: new THREE.Vector3(0, -0.12, 7.5), radius: 0.39, depth: 0.7, area: nz.area });
  v.buildFlames(4.6);
  // the two airbrakes on the rear fuselage sides, shut
  for (const sx of [-1, 1]) {
    const ab = roundBox(0.03, 0.42, 0.9, 0.01);
    ab.translate(0.8 * sx, -0.08, 5.5);
    skin(ab);
  }

  // --- BK-27 in the lower left fuselage
  skin(lathe([[0.004, -1.9], [0.055, -1.75], [0.065, -1.4], [0.06, -0.9], [0.004, -0.5]], 12, -0.5, -0.6));
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.034, 12), pm.darkMetal);
  muzzle.position.set(-0.5, -0.6, -1.86);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);

  // --- probes, antennas, lights
  v.addMesh(join([
    probe(new THREE.Vector3(-0.3, -0.33, -6.45), 0.48, 0.012, new THREE.Vector3(-0.03, 0, -1).normalize()),
    probe(new THREE.Vector3(0.28, -0.3, -6.3), 0.22, 0.009, new THREE.Vector3(0.12, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.28, -0.3, -6.3), 0.22, 0.009, new THREE.Vector3(-0.12, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.66, -1.6), 0.14, 0.24),
    blade(new THREE.Vector3(0, -0.84, 0.8), 0.13, 0.22, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.466, 0.0, -4.3), new THREE.Vector3(1, 0.1, 0), new THREE.Vector3(0, 0, 1), 0.42, 0.032),
    formationStrip(new THREE.Vector3(-0.466, 0.0, -4.3), new THREE.Vector3(-1, 0.1, 0), new THREE.Vector3(0, 0, 1), 0.42, 0.032),
    formationStrip(new THREE.Vector3(0.97, -0.2, 2.8), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.032),
    formationStrip(new THREE.Vector3(-0.97, -0.2, 2.8), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.032),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-4.34, -0.38, 4.1), 'red');
  v.addNavLight(new THREE.Vector3(4.34, -0.38, 4.1), 'green');
  v.addNavLight(new THREE.Vector3(0, -0.86, 2.2), 'strobe');

  // --- landing gear: twin nose wheels, mains folding forward into the wing roots
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.72, -4.4), axle: new THREE.Vector3(0, -1.6 + 0.22, -4.55), r: 0.22, w: 0.13, twin: true, retract: 'aft' },
    mains: { top: new THREE.Vector3(0.95, -0.8, 1.8), axle: new THREE.Vector3(1.25, -1.6 + 0.3, 2.0), r: 0.3, w: 0.2, retract: 'forward', outboard: 0.05 },
    doorColor: '#9aa1a6',
  });
}
