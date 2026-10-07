// Saab JAS 39E Gripen E: 15.2 m long, 8.6 m span (with tip missiles), 4.5 m tall.
// Single seat: a slim pointed radome, the Skyward-G IRST ahead of a one-piece
// canopy, D-shaped intakes on the fuselage sides with the all-moving canards
// mounted right on top of them, a low-set delta wing with leading-edge flaps
// and two elevons a side, wingtip missile rails, one swept fin with the
// dorsal spine running into it, and one F414G nozzle.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, curve, sstep, roundBox } from './kit';
import { nozzle, intake, partMaterials, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

function circ(R: number, yc: number): P2[] {
  const ang = [-90, -72, -52, -34, -14, -4, 4, 14, 34, 52, 72, 90];
  return ang.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}

// right half, bottom centre -> top centre; points 4-6 are the wing-root line
const BODY = keyedProfile([
  { z: -7.6, pts: circ(0.012, -0.05) },
  { z: -7.25, pts: circ(0.14, -0.04) },
  { z: -6.7, pts: circ(0.27, -0.02) },
  { z: -6.0, pts: circ(0.38, 0.0) },
  { z: -5.4, pts: [[0, -0.5], [0.26, -0.49], [0.42, -0.38], [0.48, -0.18], [0.5, 0.0], [0.5, 0.05], [0.5, 0.1], [0.48, 0.24], [0.43, 0.38], [0.33, 0.47], [0.17, 0.5], [0, 0.51]] },
  { z: -4.9, pts: [[0, -0.55], [0.28, -0.54], [0.45, -0.42], [0.52, -0.21], [0.54, 0.0], [0.54, 0.05], [0.54, 0.1], [0.52, 0.25], [0.47, 0.4], [0.42, 0.5], [0.27, 0.48], [0, 0.46]] },
  { z: -4.0, pts: [[0, -0.57], [0.3, -0.57], [0.47, -0.45], [0.54, -0.23], [0.56, 0.0], [0.56, 0.05], [0.56, 0.1], [0.54, 0.26], [0.48, 0.42], [0.43, 0.52], [0.33, 0.32], [0, 0.28]] },
  { z: -3.2, pts: [[0, -0.58], [0.31, -0.58], [0.49, -0.47], [0.55, -0.24], [0.57, 0.0], [0.57, 0.05], [0.57, 0.1], [0.55, 0.27], [0.49, 0.43], [0.44, 0.53], [0.34, 0.36], [0, 0.32]] },
  { z: -2.6, pts: [[0, -0.6], [0.33, -0.6], [0.5, -0.5], [0.57, -0.25], [0.59, 0.0], [0.6, 0.05], [0.6, 0.1], [0.58, 0.28], [0.5, 0.46], [0.38, 0.58], [0.2, 0.63], [0, 0.65]] },
  { z: -1.0, pts: [[0, -0.66], [0.38, -0.68], [0.66, -0.66], [0.8, -0.44], [0.84, -0.28], [0.84, -0.22], [0.84, -0.14], [0.8, 0.12], [0.66, 0.38], [0.46, 0.54], [0.24, 0.62], [0, 0.64]] },
  { z: 1.5, pts: [[0, -0.74], [0.42, -0.74], [0.76, -0.68], [0.86, -0.46], [0.87, -0.3], [0.87, -0.24], [0.87, -0.16], [0.84, 0.1], [0.7, 0.34], [0.48, 0.5], [0.25, 0.57], [0, 0.6]] },
  { z: 4.0, pts: [[0, -0.66], [0.4, -0.68], [0.72, -0.62], [0.84, -0.42], [0.85, -0.3], [0.85, -0.24], [0.85, -0.16], [0.82, 0.06], [0.68, 0.28], [0.46, 0.42], [0.24, 0.48], [0, 0.5]] },
  { z: 5.8, pts: [[0, -0.58], [0.32, -0.6], [0.56, -0.55], [0.68, -0.4], [0.7, -0.28], [0.7, -0.22], [0.7, -0.16], [0.68, 0.02], [0.58, 0.2], [0.4, 0.3], [0.2, 0.35], [0, 0.37]] },
  { z: 6.7, pts: circ(0.53, -0.1) },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

const CANOPY: Section[] = [
  { z: -5.7, w: 0.03, top: 0.02, bot: 0.02, y: 0.47, n: 2 },
  { z: -5.2, w: 0.34, top: 0.28, bot: 0.03, y: 0.49, n: 2.2 },
  { z: -4.7, w: 0.42, top: 0.47, bot: 0.03, y: 0.5, n: 2.2 },
  { z: -4.05, w: 0.44, top: 0.53, bot: 0.03, y: 0.52, n: 2.2 },
  { z: -3.4, w: 0.4, top: 0.43, bot: 0.03, y: 0.54, n: 2.2 },
  { z: -2.85, w: 0.28, top: 0.22, bot: 0.03, y: 0.6, n: 2.2 },
  { z: -2.35, w: 0.12, top: 0.06, bot: 0.03, y: 0.64, n: 2 },
];

// delta wing: about 47 deg of leading-edge sweep, a short tip chord
const wle = (x: number) => -1.0 + (x - 0.95) * 1.075;
const wte = (x: number) => 4.6 - (x - 0.95) * 0.3;
const WING: WingStation[] = [
  { x: 0.7, le: -1.25, te: 4.66, y: -0.26, t: 0.05 },
  { x: 0.95, le: wle(0.95), te: wte(0.95), y: -0.27, t: 0.048 },
  { x: 4.2, le: wle(4.2), te: wte(4.2), y: -0.34, t: 0.035 },
];
// canards on the intake tops, pivoting at about mid chord
const CANARD: WingStation[] = [
  { x: 0.6, le: -3.4, te: -1.95, y: 0.08, t: 0.05 },
  { x: 1.95, le: -2.2, te: -1.62, y: 0.16, t: 0.04 },
];
const CANARD_PIVOT = -2.55;
const FIN: WingStation[] = [
  { x: 0, le: 3.0, te: 6.45, t: 0.05 },
  { x: 2.4, le: 5.3, te: 6.6, t: 0.034 },
];
const RUDDER = { h0: 0.25, h1: 2.2, hinge: (h: number) => 5.95 + h * 0.05 };

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
  // anti-glare and cockpit well
  gt.fillStyle = 'rgba(52,56,60,0.7)';
  gt.beginPath();
  gt.moveTo(...T(-0.34, -5.4));
  gt.lineTo(...T(0.34, -5.4));
  gt.lineTo(...T(0.12, -6.0));
  gt.lineTo(...T(-0.12, -6.0));
  gt.closePath();
  gt.fill();
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.fillRect(...T(-0.42, -5.0), 0.84 * pt, 2.0 * pt);
  for (const z of [-5.75, -5.0, -2.8, -1.6, -0.3, 1.1, 2.6, 4.0, 5.4, 6.4]) {
    line(gt, [T(-0.9, z), T(0.9, z)], 1.2, LINE_LIGHT);
    line(gs, [S(z, -0.85), S(z, 0.62)], 1.4, LINE);
    line(gb, [B(-0.9, z), B(0.9, z)], 1.1, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    line(gt, [T(0.45 * sx, -1.0), T(0.42 * sx, 6.0)], 1.1, LINE_LIGHT);
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(1.0, wle(1.0) + 0.6), M(4.1, wle(4.1) + 0.2)], 1.2, LINE_LIGHT);
      line(g, [M(1.4, wle(1.4) + 0.28), M(4.1, wle(4.1) + 0.16)], 1.3, LINE); // leading-edge flaps
      line(g, [M(1.0, 3.9), M(4.1, 3.0)], 1.2, LINE_LIGHT);
      rivets(g, M(1.0, wle(1.0) + 0.6), M(4.1, wle(4.1) + 0.2), 6, 0.9);
      rivets(g, M(1.0, 3.9), M(4.1, 3.0), 6, 0.9);
      for (const x of [1.7, 2.5, 3.3]) line(g, [M(x, wle(x) + 0.3), M(x, wte(x) - 0.6)], 1.0, LINE_LIGHT);
      line(g, [M(0.7, -3.2), M(1.85, -2.2)], 1.0, LINE_LIGHT); // canard
    }
    if (sx < 0) roundel(gt, team, ...W(3.0, 2.4), 0.36 * pt);
    else roundel(gb, team, ...Wb(3.0, 2.4), 0.36 * L.pb);
  }
  line(gs, [S(-5.7, -0.2), S(-3.4, -0.2)], 1.3, LINE_LIGHT);
  line(gs, [S(-3.4, -0.68), S(4.6, -0.74)], 1.3, LINE);
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
  L.sideText(team === 'blue' ? '61' : '27', -3.9, -0.32, 0.32 * ps, team === 'blue' ? '#233f86' : '#9a2521');
  L.sideText(team === 'blue' ? '39 8061' : '39 8027', 5.9, 0.9, 0.11 * ps, mark);
  L.sideDraw(5.3, 1.75, (g, x, y) => roundel(g, team, x, y, 0.2 * ps));
  L.sideDraw(-1.2, -0.48, (g, x, y) => roundel(g, team, x, y, 0.18 * ps));
  return L;
}

const liveries = new Map<string, Livery>();

// D-shaped side intake: flat against the fuselage, rounded outboard
function dLoop(x0: number, cy: number, w: number, hh: number): P2[] {
  const out: P2[] = [];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    const e = s < 0 ? 0.8 : 0.55;
    out.push([x0 + w * Math.pow(c, e), cy + hh * Math.sign(s) * Math.pow(Math.abs(s), e)]);
  }
  for (let i = 1; i < 6; i++) out.push([x0, cy + hh - (2 * hh * i) / 6]);
  return out;
}

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

  // --- D-shaped side intakes, the canards right on top of them
  const TX = curve([[-3.4, 0.5], [-1.4, 0.54], [1.0, 0.6]]);
  const TW = curve([[-3.4, 0.28], [-1.4, 0.27], [1.0, 0.2]]);
  const TY = curve([[-3.4, -0.3], [-1.4, -0.32], [1.0, -0.38]]);
  const TH = curve([[-3.4, 0.33], [-1.4, 0.32], [1.0, 0.24]]);
  const loop = (z: number) => dLoop(TX(z), TY(z), 2 * TW(z), TH(z));
  const inl = intake({
    loop,
    outer: stations(-3.4, 1.0, 40, 0.3, 0),
    lip: 0.035,
    depth: 1.7,
    n: 60,
    rake: (_x, y) => -0.45 * (y - (TY(-3.4) + TH(-3.4))),
    fan: { cx: 0.74, cy: -0.32, r: 0.24 },
  });
  skin(both(inl.skin));
  v.addMesh(both(inl.duct), pm.duct);
  // the splitter plate between each intake and the fuselage
  for (const sx of [-1, 1]) {
    const sp = roundBox(0.02, 0.62, 0.7, 0.008);
    sp.translate(0.47 * sx, -0.3, -3.05);
    skin(sp);
  }

  // --- canopy, seat, pilot, IRST
  v.cockpitEye.set(0, 0.9, -4.25);
  buildCanopy(v, CANOPY, -4.95, []);
  addPilot(v, new THREE.Vector3(0, 0.9, -4.25), 0.28, { style: 'eu', stick: 'center', martinBaker: true });
  const shroud = loftProfile({
    stations: stations(-5.15, -4.75, 6),
    profile: (z) => {
      const u = sstep(-5.15, -4.75, z);
      return [[0, 0.14], [0.38, 0.16], [0.43, 0.46], [0.3, 0.54 - u * 0.06], [0, 0.56 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  // Skyward-G IRST: a small glass dome ahead of the windscreen, offset right
  const irst = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), pm.glass);
  irst.position.set(0.16, 0.42, -6.05);
  v.body.add(irst);
  v.hideInCockpit.push(irst, skin(lathe([[0.11, -6.25], [0.115, -6.05], [0.1, -5.85], [0.004, -5.72]], 16, 0.16, 0.38)));

  // --- wing: leading-edge flaps, two elevons a side
  const panels = wingPanels(
    WING,
    [
      { x0: 1.4, x1: 4.05, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.05, kind: 'lef', maxDeg: 20, leading: true },
      { x0: 1.0, x1: 2.55, hinge: (x) => wte(x) - 0.75, kind: 'flap', maxDeg: 25 },
      { x0: 2.62, x1: 4.0, hinge: (x) => wte(x) - 0.62, kind: 'aileron', maxDeg: 25 },
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
  // wingtip missile rails (always fitted)
  const rail = roundBox(0.09, 0.09, 1.7, 0.03);
  rail.translate(4.3, -0.34, 2.9);
  skin(both(rail));

  // --- canards (all-moving), on the intake tops
  const canard = wing({ sections: CANARD, chordPts: 22, spanSub: 6, tip: 'round', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? canard.clone() : mirror(canard));
    v.addSurface(g, paint, new THREE.Vector3(0.62 * side, 0.1, CANARD_PIVOT), new THREE.Vector3(1, 0, 0), 'canard', side, 25);
  }

  // --- the fin, with the dorsal spine running into it
  const m = finMatrix(0, 0.46, 0, 1);
  const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
  skin(f.fixed);
  v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', 0, 25);
  // the tip: a dielectric cap with the EW antennas
  skin(lathe([[0.004, 5.2], [0.045, 5.35], [0.055, 5.8], [0.05, 6.5], [0.004, 6.68]], 12, 0, 2.86));
  v.addNavLight(new THREE.Vector3(0, 2.9, 6.5), 'strobe');
  const fillet = loftProfile({
    stations: stations(-2.4, 3.2, 20),
    profile: (z) => {
      const h = sstep(-2.4, 3.1, z) * 0.18;
      const w = 0.16 - sstep(1.0, 3.2, z) * 0.1;
      return [[0, 0.5], [w, 0.56], [w * 0.4, 0.62 + h], [0, 0.64 + h]] as P2[];
    },
    sub: 3,
    capStart: true,
    capEnd: true,
  });
  skin(fillet);

  // --- the F414G nozzle
  const nz = nozzle({ cx: 0, cy: -0.1, z0: 6.6, z1: 7.55, r0: 0.48, r1: 0.42, petals: 14, saw: 0.05, floor: 6.72 });
  const nzOut = v.addMesh(nz.outer, pm.nozzle);
  const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
  nzIn.userData.detail = true;
  v.morphNozzle(nzOut, nzIn);
  v.nozzles.push({ pos: new THREE.Vector3(0, -0.1, 7.5), radius: 0.38, depth: 0.7, area: nz.area });
  v.buildFlames(4.6);
  // the two airbrakes on the rear fuselage sides, shut
  for (const sx of [-1, 1]) {
    const ab = roundBox(0.03, 0.42, 0.9, 0.01);
    ab.translate(0.7 * sx, -0.1, 5.6);
    skin(ab);
  }

  // --- BK-27 in the lower left fuselage
  skin(lathe([[0.004, -2.0], [0.055, -1.85], [0.065, -1.5], [0.06, -1.0], [0.004, -0.7]], 12, -0.55, -0.42));
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.034, 12), pm.darkMetal);
  muzzle.position.set(-0.55, -0.42, -1.96);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);

  // --- probes, antennas, lights
  v.addMesh(join([
    probe(new THREE.Vector3(0, -0.05, -7.58), 0.55, 0.012, new THREE.Vector3(0, 0, -1)),
    probe(new THREE.Vector3(0.26, 0.04, -6.4), 0.22, 0.009, new THREE.Vector3(0.12, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.26, 0.04, -6.4), 0.22, 0.009, new THREE.Vector3(-0.12, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.66, -1.6), 0.14, 0.24),
    blade(new THREE.Vector3(0, -0.74, 0.8), 0.13, 0.22, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.56, 0.24, -4.0), new THREE.Vector3(1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.42, 0.032),
    formationStrip(new THREE.Vector3(-0.56, 0.24, -4.0), new THREE.Vector3(-1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.42, 0.032),
    formationStrip(new THREE.Vector3(0.86, -0.1, 2.8), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.032),
    formationStrip(new THREE.Vector3(-0.86, -0.1, 2.8), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.032),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-4.3, -0.28, 2.3), 'red');
  v.addNavLight(new THREE.Vector3(4.3, -0.28, 2.3), 'green');
  v.addNavLight(new THREE.Vector3(0, -0.76, 1.6), 'strobe');

  // --- landing gear: twin nose wheels, mains folding forward into the fuselage
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.5, -4.4), axle: new THREE.Vector3(0, -1.6 + 0.22, -4.55), r: 0.22, w: 0.13, twin: true, retract: 'aft' },
    mains: { top: new THREE.Vector3(0.75, -0.66, 0.7), axle: new THREE.Vector3(1.2, -1.6 + 0.3, 0.9), r: 0.3, w: 0.2, retract: 'forward', outboard: 0.05 },
    doorColor: '#9aa1a6',
  });
}
