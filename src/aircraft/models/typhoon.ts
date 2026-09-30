// Eurofighter Typhoon: 15.96 m long, 10.95 m span, 5.28 m tall.
// Single seat, close-coupled all-moving canards, the "smiling" chin intake
// with its splitter and variable lower lip, 53-degree delta wing with slats
// and two flaperons a side, DASS wingtip pods, one big fin, dorsal airbrake,
// brake-chute fairing between the EJ200 nozzles.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, mirror, join, stamp, lathe, ring, mirrorHalf, Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, curve, sstep, roundBox } from './kit';
import { nozzle, intake, partMaterials, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

function circ(R: number, yc: number): P2[] {
  const ang = [-90, -72, -52, -34, -14, -4, 4, 14, 34, 52, 72, 90];
  return ang.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}

const BODY = keyedProfile([
  { z: -8.06, pts: circ(0.012, -0.04) },
  { z: -7.75, pts: circ(0.16, -0.03) },
  { z: -7.2, pts: circ(0.3, -0.015) },
  { z: -6.5, pts: circ(0.42, 0.005) },
  { z: -5.9, pts: circ(0.5, 0.03) },
  { z: -5.4, pts: [[0, -0.58], [0.3, -0.57], [0.5, -0.45], [0.57, -0.22], [0.585, 0.0], [0.59, 0.06], [0.59, 0.12], [0.575, 0.25], [0.53, 0.42], [0.46, 0.53], [0.24, 0.55], [0, 0.56]] },
  { z: -5.0, pts: [[0, -0.62], [0.32, -0.61], [0.53, -0.49], [0.6, -0.24], [0.62, 0.0], [0.625, 0.06], [0.625, 0.12], [0.6, 0.28], [0.55, 0.46], [0.5, 0.56], [0.4, 0.36], [0, 0.3]] },
  { z: -4.4, pts: [[0, -0.66], [0.33, -0.66], [0.55, -0.53], [0.63, -0.26], [0.65, 0.0], [0.66, 0.06], [0.66, 0.12], [0.63, 0.3], [0.56, 0.5], [0.5, 0.58], [0.42, 0.3], [0, 0.14]] },
  { z: -3.55, pts: [[0, -0.68], [0.34, -0.68], [0.56, -0.56], [0.66, -0.28], [0.69, 0.0], [0.7, 0.06], [0.7, 0.12], [0.67, 0.3], [0.58, 0.5], [0.49, 0.6], [0.4, 0.4], [0, 0.36]] },
  { z: -2.6, pts: [[0, -0.68], [0.36, -0.68], [0.6, -0.58], [0.72, -0.3], [0.76, 0.0], [0.77, 0.06], [0.77, 0.12], [0.74, 0.32], [0.64, 0.5], [0.48, 0.6], [0.25, 0.65], [0, 0.67]] },
  { z: -1.0, pts: [[0, -0.7], [0.45, -0.72], [0.78, -0.72], [0.88, -0.45], [0.9, -0.2], [0.9, -0.1], [0.9, 0.0], [0.86, 0.25], [0.72, 0.46], [0.5, 0.58], [0.26, 0.63], [0, 0.65]] },
  { z: 1.5, pts: [[0, -1.0], [0.5, -1.0], [0.84, -0.92], [0.95, -0.6], [0.96, -0.3], [0.96, -0.2], [0.96, -0.1], [0.93, 0.2], [0.78, 0.44], [0.52, 0.56], [0.26, 0.61], [0, 0.63]] },
  { z: 4.0, pts: [[0, -0.8], [0.45, -0.82], [0.82, -0.72], [0.94, -0.45], [0.95, -0.25], [0.95, -0.18], [0.95, -0.1], [0.92, 0.15], [0.76, 0.38], [0.52, 0.5], [0.26, 0.55], [0, 0.58]] },
  { z: 6.0, pts: [[0, -0.5], [0.25, -0.6], [0.5, -0.62], [0.78, -0.52], [0.95, -0.3], [0.98, -0.15], [0.98, -0.08], [0.95, 0.12], [0.78, 0.32], [0.5, 0.42], [0.25, 0.46], [0, 0.5]] },
  { z: 7.35, pts: [[0, -0.3], [0.2, -0.52], [0.5, -0.57], [0.8, -0.46], [0.95, -0.26], [0.97, -0.12], [0.97, -0.08], [0.94, 0.08], [0.8, 0.28], [0.5, 0.37], [0.24, 0.36], [0, 0.36]] },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

const CANOPY: Section[] = [
  { z: -5.95, w: 0.03, top: 0.02, bot: 0.02, y: 0.52, n: 2 },
  { z: -5.45, w: 0.37, top: 0.34, bot: 0.03, y: 0.54, n: 2.2 },
  { z: -4.95, w: 0.47, top: 0.52, bot: 0.03, y: 0.56, n: 2.2 },
  { z: -4.2, w: 0.49, top: 0.58, bot: 0.03, y: 0.56, n: 2.2 },
  { z: -3.3, w: 0.45, top: 0.46, bot: 0.03, y: 0.58, n: 2.2 },
  { z: -2.6, w: 0.3, top: 0.2, bot: 0.03, y: 0.6, n: 2.2 },
  { z: -2.1, w: 0.14, top: 0.05, bot: 0.03, y: 0.63, n: 2 },
];

const WING: WingStation[] = [
  { x: 0.7, le: -2.35, te: 5.25, y: -0.28, t: 0.05 },
  { x: 0.95, le: -2.0, te: 5.25, y: -0.3, t: 0.048 },
  { x: 5.45, le: 3.97, te: 5.0, y: -0.42, t: 0.035 },
];
const wle = (x: number) => -2.0 + (x - 0.95) * 1.3267;
const wte = (x: number) => 5.25 - (x - 0.95) * 0.0556;
const CANARD: WingStation[] = [
  { x: 0.5, le: -5.4, te: -3.62, y: 0.1, t: 0.05 },
  { x: 2.12, le: -3.47, te: -2.98, y: 0.18, t: 0.04 },
];
const CANARD_PIVOT = -4.25;
const FIN: WingStation[] = [
  { x: 0, le: 2.75, te: 6.7, t: 0.05 },
  { x: 2.9, le: 6.0, te: 7.15, t: 0.034 },
];
const RUDDER = { h0: 0.25, h1: 2.3, hinge: (h: number) => 6.02 + h * 0.13 };

function livery(team: string): Livery {
  const L = new Livery({ half: 9.0, z0: -9.0, len: 18, y0: -2.2, height: 5.8 });
  const { gt, gb, gs } = L;
  const rnd = prng(27);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // radome (darker grey), anti-glare, cockpit well
  gt.fillStyle = 'rgba(92,98,103,0.7)';
  gt.beginPath();
  gt.ellipse(...T(0, -7.0), 0.48 * pt, 1.1 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gs.fillStyle = 'rgba(92,98,103,0.7)';
  gs.beginPath();
  gs.moveTo(...S(-8.1, -0.04));
  gs.lineTo(...S(-5.9, 0.53));
  gs.lineTo(...S(-5.9, -0.47));
  gs.closePath();
  gs.fill();
  gt.fillStyle = 'rgba(52,56,60,0.7)';
  gt.beginPath();
  gt.moveTo(...T(-0.4, -5.6));
  gt.lineTo(...T(0.4, -5.6));
  gt.lineTo(...T(0.16, -6.4));
  gt.lineTo(...T(-0.16, -6.4));
  gt.closePath();
  gt.fill();
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.fillRect(...T(-0.47, -5.2), 0.94 * pt, 1.9 * pt);
  for (const z of [-5.9, -5.1, -3.2, -1.9, -0.6, 1.0, 2.6, 4.1, 5.6, 6.8]) {
    line(gt, [T(-1.0, z), T(1.0, z)], 1.3, LINE_LIGHT);
    line(gs, [S(z, -1.05), S(z, 0.62)], 1.5, LINE);
    line(gb, [B(-1.0, z), B(1.0, z)], 1.2, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    line(gt, [T(0.35 * sx, -1.9), T(0.35 * sx, -0.5)], 1.5, LINE); // airbrake
    line(gt, [T(0.55 * sx, -0.4), T(0.55 * sx, 6.4)], 1.2, LINE_LIGHT);
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(1.0, wle(1.0) + 0.9), M(5.3, wle(5.3) + 0.25)], 1.2, LINE_LIGHT);
      line(g, [M(1.0, 3.6), M(5.3, 4.3)], 1.2, LINE_LIGHT);
      line(g, [M(2.8, wle(2.8) + 0.35), M(5.3, wle(5.3) + 0.2)], 1.3, LINE); // slats
      rivets(g, M(1.0, wle(1.0) + 0.9), M(5.3, wle(5.3) + 0.25), 7, 0.9);
      rivets(g, M(1.0, 3.6), M(5.3, 4.3), 7, 0.9);
      for (const x of [1.8, 2.6, 3.4, 4.2]) line(g, [M(x, wle(x) + 0.3), M(x, wte(x) - 0.75)], 1.0, LINE_LIGHT);
    }
    line(gt, [W(1.0, 0.5), W(1.8, 1.4), W(1.8, 3.6), W(1.0, 3.6)], 1.1, 'rgba(25,27,30,0.4)');
    if (sx < 0) roundel(gt, team, ...W(3.6, 3.2), 0.46 * pt);
    else roundel(gb, team, ...Wb(3.6, 3.2), 0.46 * L.pb);
    // canard panel lines
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) line(g, [M(0.7, -4.6), M(1.9, -3.4)], 1.0, LINE_LIGHT);
  }
  line(gs, [S(-5.9, -0.2), S(-2.8, -0.2)], 1.3, LINE_LIGHT);
  line(gs, [S(-3.9, -0.74), S(3.0, -0.76)], 1.4, LINE);
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-5.3, -0.4), S(-4.6, -0.1));
  rect(gs, S(-1.6, 0.05), S(-0.9, 0.35));
  rect(gs, S(3.0, -0.4), S(3.8, 0.0));
  weather(gt, L.top.width, L.top.height, rnd, 0.9, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.7, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.8, [1, 0.1]);
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(0.5 * sx, 7.3);
      const gr = g.createLinearGradient(x, y - 1.6 * s, x, y);
      gr.addColorStop(0, 'rgba(40,36,30,0)');
      gr.addColorStop(1, 'rgba(40,36,30,0.3)');
      g.fillStyle = gr;
      g.fillRect(x - 0.45 * s, y - 1.6 * s, 0.9 * s, 1.6 * s);
    }
  }
  L.copySides();
  const teamCol = team === 'blue' ? '#2d4d8e' : '#9a2521';
  // fin flash, squadron badge, serial
  for (const g of [L.gs, L.gr]) {
    const [x0, y0] = S(5.6, 2.55);
    const w = 0.45 * ps, h = 0.55 * ps;
    g.fillStyle = teamCol;
    g.fillRect(x0, y0, w / 3, h);
    g.fillStyle = 'rgba(232,233,228,0.9)';
    g.fillRect(x0 + w / 3, y0, w / 3, h);
    g.fillStyle = teamCol;
    g.fillRect(x0 + (2 * w) / 3, y0, w / 3, h);
  }
  L.sideDraw(5.0, 1.4, (g, x, y) => {
    g.fillStyle = 'rgba(232,233,228,0.85)';
    g.beginPath();
    g.arc(x, y, 0.26 * ps, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = teamCol;
    g.beginPath();
    g.arc(x, y, 0.2 * ps, 0, Math.PI * 2);
    g.fill();
  });
  L.sideText(team === 'blue' ? 'SK' : 'CP', 5.0, 1.4, 0.2 * ps, 'rgba(232,233,228,0.95)');
  L.sideText(team === 'blue' ? 'ZK 355' : 'MM 7340', 6.6, 0.25, 0.14 * ps, 'rgba(40,44,48,0.8)');
  L.sideDraw(-1.4, -0.45, (g, x, y) => roundel(g, team, x, y, 0.27 * ps));
  L.sideDraw(-5.2, 0.33, (g, x, y) => {
    g.fillStyle = '#c9402c';
    g.beginPath();
    g.moveTo(x, y - 0.09 * ps);
    g.lineTo(x + 0.09 * ps, y + 0.07 * ps);
    g.lineTo(x - 0.09 * ps, y + 0.07 * ps);
    g.closePath();
    g.fill();
  });
  return L;
}

const liveries = new Map<string, Livery>();

// chin intake: a wide "smile" -- the lower lip droops in the middle
const IHALF = (w: number, top: number, bot: number, smile: number): P2[] => [
  [0, bot - smile],
  [w * 0.45, bot - smile * 0.75],
  [w * 0.85, bot - smile * 0.1],
  [w, bot + 0.08],
  [w * 1.01, (top + bot) * 0.5],
  [w * 0.94, top - 0.02],
  [w * 0.5, top],
  [0, top],
];

export function buildTyphoon(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#7a8288'), bottom: new THREE.Color('#939b9f'), livery: L, roughness: 0.56, metalness: 0.05 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-8.06, -5.9, 30, 0.55, 0), stations(-5.9, -2.1, 50), stations(-2.1, 7.35, 80));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -7.8, 7.2, 40);

  // chin intake with a diverter gap, splitter and variable lip
  const IW = curve([[-3.9, 0.72], [-1.0, 0.8], [2.5, 0.8], [4.0, 0.5]]);
  const IT = curve([[-3.9, -0.74], [-1.0, -0.74], [2.5, -0.72], [4.0, -0.6]]);
  const IB = curve([[-3.9, -1.27], [-1.0, -1.26], [2.5, -1.08], [4.0, -0.8]]);
  const IS = curve([[-3.9, 0.07], [-2.0, 0.04], [0.5, 0.0]]);
  const loop = (z: number) => ring(mirrorHalf(IHALF(IW(z), IT(z), IB(z), IS(z))), [3, 3, 2, 2, 2, 3, 3, 3, 3, 3, 2, 2, 2, 3]);
  const ci = intake({
    loop,
    outer: stations(-3.9, 4.0, 50, 0.3, 0),
    lip: 0.05,
    depth: 2.2,
    n: 96,
    // the upper lip (splitter side) leads; the variable lower lip sits back
    rake: (_x, y) => -0.4 * (y + 0.74),
    fan: { cx: 0, cy: -0.95, r: 0.42 },
  });
  skin(ci.skin);
  v.addMesh(ci.duct, pm.duct);
  const splitter = roundBox(0.03, 0.44, 1.8, 0.01);
  splitter.translate(0, -0.97, -2.9);
  skin(splitter);
  // diverter pillars between the fuselage and the intake roof
  v.addMesh(stamp(join([-0.4, 0.4].map((x) => { const g = roundBox(0.04, 0.1, 1.2, 0.015); g.translate(x, -0.68, -3.1); return g; }))), paint);

  // --- canopy, seat, pilot
  v.cockpitEye.set(0, 0.92, -4.45);
  buildCanopy(v, CANOPY, -4.97, []);
  addPilot(v, new THREE.Vector3(0, 0.92, -4.45), 0.24, { style: 'eu', stick: 'center', martinBaker: true });
  const shroud = loftProfile({
    stations: stations(-5.35, -4.95, 6),
    profile: (z) => {
      const u = sstep(-5.35, -4.95, z);
      return [[0, 0.16], [0.42, 0.18], [0.48, 0.5], [0.34, 0.58 - u * 0.06], [0, 0.6 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));

  // --- wing: slats outboard, two flaperons a side
  const panels = wingPanels(
    WING,
    [
      { x0: 2.8, x1: 5.3, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.06, kind: 'lef', maxDeg: 18, leading: true },
      { x0: 1.1, x1: 3.0, hinge: (x) => wte(x) - 0.78, kind: 'flap', maxDeg: 25 },
      { x0: 3.08, x1: 5.05, hinge: (x) => wte(x) - 0.7, kind: 'aileron', maxDeg: 25 },
    ],
    { chordPts: 34, thickPos: 0.42 },
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
  // DASS wingtip pods
  const pod = lathe([[0.004, 2.55], [0.06, 2.8], [0.1, 3.2], [0.12, 3.8], [0.12, 5.5], [0.09, 6.05], [0.004, 6.35]], 18, 5.52, -0.44);
  skin(pod);
  skin(mirror(pod));

  // --- canards (all-moving)
  const canard = wing({ sections: CANARD, chordPts: 22, spanSub: 6, tip: 'round', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? canard.clone() : mirror(canard));
    v.addSurface(g, paint, new THREE.Vector3(0.62 * side, 0.1, CANARD_PIVOT), new THREE.Vector3(1, 0, 0), 'canard', side, 22);
  }

  // --- fin with rudder, fin-tip radome
  const m = finMatrix(0, 0.5, 0, 1);
  const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
  skin(f.fixed);
  v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', 0, 25);
  const tip = lathe([[0.004, 5.85], [0.05, 6.05], [0.075, 6.5], [0.07, 7.1], [0.004, 7.35]], 14, 0, 3.4);
  skin(tip);
  v.addNavLight(new THREE.Vector3(0, 3.42, 7.3), 'strobe');
  // dorsal fin fillet
  const fillet = loftProfile({
    stations: stations(1.2, 3.2, 12),
    profile: (z) => {
      const h = sstep(1.2, 3.1, z) * 0.35;
      const w = 0.16 - sstep(1.2, 3.2, z) * 0.1;
      return [[0, 0.45], [w, 0.5], [w * 0.4, 0.55 + h], [0, 0.56 + h]] as P2[];
    },
    sub: 3,
    capStart: true,
    capEnd: true,
  });
  skin(fillet);

  // --- engines, brake-chute fairing
  for (const sx of [-1, 1]) {
    const nz = nozzle({ cx: 0.5 * sx, cy: -0.1, z0: 7.3, z1: 8.05, r0: 0.47, r1: 0.4, petals: 12, saw: 0.06, floor: 7.37 });
    const nzOut = v.addMesh(nz.outer, pm.nozzle);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.nozzles.push({ pos: new THREE.Vector3(0.5 * sx, -0.1, 8.0), radius: 0.38, depth: 0.62, area: nz.area });
  }
  v.buildFlames(5.0);
  const chute = lathe([[0.2, 6.2], [0.21, 6.9], [0.18, 7.5], [0.1, 7.9], [0.004, 8.0]], 20, 0, 0.3);
  skin(chute);

  // --- dorsal airbrake
  const AB = keyedProfile([
    { z: -1.9, pts: [[0, 0.655], [0.2, 0.645], [0.34, 0.615], [0.36, 0.605], [0.34, 0.63], [0.2, 0.672], [0, 0.683]] },
    { z: -0.5, pts: [[0, 0.65], [0.2, 0.642], [0.34, 0.614], [0.36, 0.604], [0.34, 0.628], [0.2, 0.668], [0, 0.678]] },
  ]);
  const ab = v.addSurface(stamp(loftProfile({ stations: stations(-1.9, -0.5, 10), profile: AB, sub: 4, capStart: true, capEnd: true })), paint, new THREE.Vector3(0, 0.66, -1.9), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(ab), 1);
  v.speedbrake = { pivot: ab.pivot, axis: new THREE.Vector3(-1, 0, 0), maxDeg: 55 };

  // --- PIRATE infra-red search and track: a glazed turret ahead of the
  // windscreen on the port side
  const pirateFair = lathe([[0.004, -6.62], [0.07, -6.5], [0.095, -6.3], [0.09, -6.1], [0.05, -5.98], [0.004, -5.92]], 16, -0.24, 0.33);
  v.hideInCockpit.push(skin(pirateFair));
  const pirate = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), pm.glass);
  pirate.position.set(-0.24, 0.39, -6.36);
  pirate.rotation.x = -0.35;
  v.body.add(pirate);
  v.hideInCockpit.push(pirate);
  // BK-27 cannon blister in the starboard wing root, muzzle facing forward
  skin(lathe([[0.004, -2.55], [0.06, -2.42], [0.075, -2.1], [0.07, -1.6], [0.004, -1.3]], 14, 0.93, -0.3));
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), pm.darkMetal);
  muzzle.position.set(0.93, -0.3, -2.44);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);
  // the retractable refuelling probe's fairing on the starboard side of the cockpit
  skin(lathe([[0.004, -6.45], [0.045, -6.25], [0.05, -5.4], [0.035, -4.95], [0.004, -4.8]], 12, 0.49, 0.22));

  // --- probes, antennas, lights
  v.addMesh(join([
    probe(new THREE.Vector3(0.36, 0.1, -6.9), 0.32, 0.011, new THREE.Vector3(0.12, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.36, 0.1, -6.9), 0.32, 0.011, new THREE.Vector3(-0.12, 0, -1).normalize()),
    probe(new THREE.Vector3(0, -0.4, -7.1), 0.16, 0.009, new THREE.Vector3(0, -0.4, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.66, 0.4), 0.2, 0.3),
    blade(new THREE.Vector3(0, -1.2, 0.2), 0.18, 0.26, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.63, 0.25, -4.9), new THREE.Vector3(1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(-0.63, 0.25, -4.9), new THREE.Vector3(-1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(0.955, -0.1, 3.4), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-0.955, -0.1, 3.4), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-5.52, -0.44, 2.6), 'red');
  v.addNavLight(new THREE.Vector3(5.52, -0.44, 2.6), 'green');
  v.addNavLight(new THREE.Vector3(0, -1.08, 1.8), 'strobe');

  // --- landing gear (mains retract inward into the fuselage)
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.6, -4.15), axle: new THREE.Vector3(0, -1.9 + 0.28, -4.4), r: 0.28, w: 0.18, twin: false, retract: 'forward' },
    mains: { top: new THREE.Vector3(0.95, -0.72, 1.15), axle: new THREE.Vector3(1.32, -1.9 + 0.39, 1.4), r: 0.39, w: 0.24, retract: 'inward', outboard: 0.1 },
    doorColor: '#939b9f',
  });
}
