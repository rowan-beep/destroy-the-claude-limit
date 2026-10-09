// Saab JAS 39E Gripen E: 15.2 m long, 8.6 m span (with tip rails), 4.5 m tall.
// Single seat: a slim, slightly drooped radome, the Skyward-G IRST ahead of a
// one-piece canopy that only just bulges above the wide flat spine, D-shaped
// intakes standing off the waisted fuselage sides with the big close-coupled
// canards on top of them, a low delta wing (about 51 deg of sweep) whose
// elevons run right back to the nozzle, wingtip missile rails, one fin with a
// narrow tip and the EW pod on it, and one F414G nozzle set low in the tail.

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

// right half, bottom centre -> top centre; points 4-6 are the wing-root line.
// The radome axis sits about 0.3 m below the engine axis (the nose droops), the
// belly is nearly flat at -0.8, and the spine behind the canopy stays high.
const BODY = keyedProfile([
  { z: -7.6, pts: circ(0.012, -0.4) },
  { z: -7.25, pts: circ(0.15, -0.37) },
  { z: -6.7, pts: circ(0.3, -0.31) },
  { z: -6.0, pts: circ(0.43, -0.24) },
  { z: -5.4, pts: [[0, -0.68], [0.28, -0.66], [0.46, -0.52], [0.53, -0.3], [0.55, -0.12], [0.55, -0.06], [0.55, 0.0], [0.52, 0.1], [0.42, 0.16], [0.3, 0.19], [0.16, 0.2], [0, 0.2]] },
  { z: -4.9, pts: [[0, -0.72], [0.3, -0.7], [0.48, -0.56], [0.56, -0.32], [0.58, -0.14], [0.58, -0.08], [0.58, -0.02], [0.56, 0.1], [0.48, 0.18], [0.4, 0.22], [0.27, 0.22], [0, 0.22]] },
  { z: -4.0, pts: [[0, -0.76], [0.31, -0.75], [0.5, -0.6], [0.57, -0.36], [0.59, -0.16], [0.59, -0.1], [0.59, -0.04], [0.57, 0.12], [0.5, 0.24], [0.45, 0.3], [0.34, 0.1], [0, 0.06]] },
  { z: -3.2, pts: [[0, -0.78], [0.28, -0.77], [0.4, -0.66], [0.43, -0.4], [0.43, -0.2], [0.43, -0.12], [0.43, -0.04], [0.44, 0.12], [0.46, 0.26], [0.45, 0.34], [0.34, 0.14], [0, 0.1]] },
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
  { z: -4.1, w: 0.45, top: 0.4, bot: 0.03, y: 0.3, n: 2.2 },
  { z: -3.6, w: 0.47, top: 0.44, bot: 0.03, y: 0.34, n: 2.2 },
  { z: -3.2, w: 0.47, top: 0.42, bot: 0.03, y: 0.36, n: 2.2 },
  { z: -2.8, w: 0.42, top: 0.33, bot: 0.03, y: 0.4, n: 2.2 },
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
  { x: 1.0, le: -2.55, te: -0.42, y: 0.38, t: 0.05 },
  { x: 2.5, le: -0.42, te: 0.16, y: 0.28, t: 0.035 },
];
const CANARD_PIVOT = -1.6;
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
  // anti-glare and cockpit well
  gt.fillStyle = 'rgba(52,56,60,0.7)';
  gt.beginPath();
  gt.moveTo(...T(-0.36, -4.95));
  gt.lineTo(...T(0.36, -4.95));
  gt.lineTo(...T(0.14, -5.6));
  gt.lineTo(...T(-0.14, -5.6));
  gt.closePath();
  gt.fill();
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
  line(gs, [S(-4.95, -0.45), S(-3.1, -0.42)], 1.3, LINE_LIGHT);
  line(gs, [S(-3.1, -0.76), S(5.6, -0.8)], 1.3, LINE);
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
  L.sideText(team === 'blue' ? '61' : '27', -3.7, -0.4, 0.3 * ps, team === 'blue' ? '#233f86' : '#9a2521');
  L.sideText(team === 'blue' ? '39 8061' : '39 8027', 5.5, 0.85, 0.11 * ps, mark);
  L.sideDraw(5.25, 1.7, (g, x, y) => roundel(g, team, x, y, 0.2 * ps));
  L.sideDraw(-0.6, -0.55, (g, x, y) => roundel(g, team, x, y, 0.18 * ps));
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

  // --- D-shaped side intakes: lip at -3.1, 0.52 m wide and 0.8 m tall, standing
  // off the waisted fuselage with a splitter gap, fairing into the wing root
  const TX = curve([[-3.1, 0.74], [-1.4, 0.76], [0.8, 0.8]]);
  const TW = curve([[-3.1, 0.26], [-1.4, 0.25], [0.8, 0.18]]);
  const TY = curve([[-3.1, -0.08], [-1.4, -0.1], [0.8, -0.18]]);
  const TH = curve([[-3.1, 0.4], [-1.4, 0.4], [0.8, 0.32]]);
  const loop = (z: number) => dLoop(TX(z), TY(z), 2 * TW(z), TH(z));
  const inl = intake({
    loop,
    outer: stations(-3.1, 0.8, 40, 0.3, 0),
    lip: 0.035,
    depth: 1.7,
    n: 60,
    rake: (_x, y) => -0.45 * (y - (TY(-3.1) + TH(-3.1))),
    fan: { cx: 0.76, cy: -0.1, r: 0.3 },
  });
  skin(both(inl.skin));
  v.addMesh(both(inl.duct), pm.duct);
  // the splitter plate between each intake and the fuselage
  for (const sx of [-1, 1]) {
    const sp = roundBox(0.02, 0.7, 0.7, 0.008);
    sp.translate(0.45 * sx, -0.08, -2.75);
    skin(sp);
  }

  // --- canopy, seat, pilot, IRST
  v.cockpitEye.set(0, 0.5, -3.9);
  buildCanopy(v, CANOPY, -4.06, []);
  addPilot(v, new THREE.Vector3(0, 0.5, -3.9), 0.28, { style: 'eu', stick: 'center', martinBaker: true });
  const shroud = loftProfile({
    stations: stations(-5.1, -4.7, 6),
    profile: (z) => {
      const u = sstep(-5.1, -4.7, z);
      return [[0, -0.1], [0.4, -0.08], [0.45, 0.18], [0.3, 0.26 - u * 0.06], [0, 0.28 - u * 0.06]] as P2[];
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
    v.addSurface(g, paint, new THREE.Vector3(1.0 * side, 0.38, CANARD_PIVOT), new THREE.Vector3(1, 0, 0), 'canard', side, 25);
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
    probe(new THREE.Vector3(0, -0.4, -7.58), 0.55, 0.012, new THREE.Vector3(0, 0, -1)),
    probe(new THREE.Vector3(0.28, -0.3, -6.3), 0.22, 0.009, new THREE.Vector3(0.12, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.28, -0.3, -6.3), 0.22, 0.009, new THREE.Vector3(-0.12, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.66, -1.6), 0.14, 0.24),
    blade(new THREE.Vector3(0, -0.84, 0.8), 0.13, 0.22, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.58, 0.0, -4.2), new THREE.Vector3(1, 0.2, 0), new THREE.Vector3(0, 0, 1), 0.42, 0.032),
    formationStrip(new THREE.Vector3(-0.58, 0.0, -4.2), new THREE.Vector3(-1, 0.2, 0), new THREE.Vector3(0, 0, 1), 0.42, 0.032),
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
