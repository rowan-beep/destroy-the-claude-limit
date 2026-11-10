// Eurofighter Typhoon: 15.96 m long, 10.95 m span, 5.28 m tall. Measured from a scale three-view.
// Single seat, close-coupled all-moving canards beside the windscreen, the "smiling" chin intake
// 4.6 m behind the nose with its splitter and variable lower lip, a 52-degree delta wing with slats
// and two flaperons a side, DASS wingtip pods, one big fin carrying a pod near its tip and overhanging
// the nozzles, dorsal airbrake, brake-chute fairing between the EJ200 nozzles.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section, sectionArch, sectionAt } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, mirror, join, stamp, lathe, ring, mirrorHalf, Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, curve, sstep, roundBox, strip } from './kit';
import { nozzle, intake, partMaterials, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

function circ(R: number, yc: number): P2[] {
  const ang = [-90, -72, -52, -34, -14, -4, 4, 14, 34, 52, 72, 90];
  return ang.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}

const BODY = keyedProfile([
  { z: -8.06, pts: circ(0.012, -0.04) },
  { z: -7.75, pts: circ(0.12, -0.03) },
  { z: -7.2, pts: circ(0.28, 0.01) },
  { z: -6.5, pts: circ(0.42, 0.065) },
  { z: -5.9, pts: circ(0.5, 0.115) },
  // the forward fuselage sits above the intake: its keel is only a third of a metre below the nose line
  { z: -5.4, pts: [[0, -0.37], [0.3, -0.36], [0.5, -0.27], [0.57, -0.1], [0.585, 0.03], [0.59, 0.08], [0.59, 0.13], [0.575, 0.26], [0.53, 0.44], [0.46, 0.55], [0.24, 0.58], [0, 0.59]] },
  { z: -5.0, pts: [[0, -0.36], [0.35, -0.36], [0.56, -0.3], [0.625, -0.14], [0.64, 0.0], [0.64, 0.08], [0.63, 0.15], [0.6, 0.29], [0.55, 0.47], [0.5, 0.57], [0.4, 0.36], [0, 0.3]] },
  { z: -4.4, pts: [[0, -0.35], [0.38, -0.35], [0.62, -0.31], [0.69, -0.15], [0.7, 0.0], [0.7, 0.08], [0.69, 0.15], [0.63, 0.3], [0.56, 0.5], [0.5, 0.58], [0.42, 0.3], [0, 0.14]] },
  { z: -3.55, pts: [[0, -0.35], [0.42, -0.35], [0.68, -0.33], [0.75, -0.18], [0.76, -0.02], [0.755, 0.08], [0.74, 0.15], [0.67, 0.3], [0.58, 0.5], [0.49, 0.6], [0.4, 0.4], [0, 0.36]] },
  // behind the canopy the spine stands high (the canopy's aft glazing fairs into it) and
  // slopes down to the fin; below, the body stays above the intake duct's roof
  { z: -2.6, pts: [[0, -0.45], [0.45, -0.45], [0.84, -0.5], [0.89, -0.3], [0.905, -0.08], [0.91, 0.04], [0.91, 0.12], [0.86, 0.32], [0.7, 0.54], [0.5, 0.68], [0.28, 0.82], [0, 0.88]] },
  { z: -1.6, pts: [[0, -0.46], [0.45, -0.46], [0.89, -0.5], [0.94, -0.3], [0.95, -0.125], [0.95, -0.04], [0.95, 0.045], [0.9, 0.3], [0.72, 0.56], [0.5, 0.84], [0.28, 0.99], [0, 1.03]] },
  { z: -1.0, pts: [[0, -0.47], [0.45, -0.47], [0.91, -0.52], [0.955, -0.32], [0.965, -0.2], [0.97, -0.1], [0.97, 0.0], [0.92, 0.25], [0.76, 0.52], [0.54, 0.8], [0.3, 0.94], [0, 0.98]] },
  { z: 0.2, pts: [[0, -0.7], [0.48, -0.7], [0.9, -0.66], [0.95, -0.42], [0.98, -0.25], [0.98, -0.15], [0.98, -0.05], [0.94, 0.22], [0.78, 0.5], [0.55, 0.72], [0.3, 0.82], [0, 0.85]] },
  { z: 1.5, pts: [[0, -1.0], [0.5, -1.0], [0.84, -0.92], [0.97, -0.6], [0.99, -0.3], [0.99, -0.2], [0.99, -0.1], [0.95, 0.2], [0.8, 0.46], [0.56, 0.63], [0.3, 0.72], [0, 0.745]] },
  { z: 4.0, pts: [[0, -0.9], [0.45, -0.9], [0.82, -0.8], [0.96, -0.5], [0.98, -0.25], [0.98, -0.18], [0.98, -0.1], [0.94, 0.15], [0.78, 0.4], [0.52, 0.53], [0.26, 0.58], [0, 0.61]] },
  { z: 5.2, pts: [[0, -0.6], [0.25, -0.72], [0.5, -0.76], [0.8, -0.62], [0.96, -0.32], [0.98, -0.15], [0.98, -0.08], [0.95, 0.12], [0.78, 0.36], [0.5, 0.48], [0.25, 0.52], [0, 0.55]] },
  { z: 5.95, pts: [[0, -0.36], [0.2, -0.58], [0.5, -0.64], [0.8, -0.52], [0.94, -0.28], [0.96, -0.12], [0.96, -0.08], [0.93, 0.1], [0.8, 0.32], [0.5, 0.42], [0.24, 0.42], [0, 0.42]] },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

const CANOPY: Section[] = [
  // a long, fairly low bubble on the spine (not a tall round one)
  { z: -5.75, w: 0.03, top: 0.02, bot: 0.02, y: 0.54, n: 2 },
  { z: -5.25, w: 0.38, top: 0.37, bot: 0.03, y: 0.56, n: 2.2 },
  { z: -4.7, w: 0.48, top: 0.58, bot: 0.03, y: 0.57, n: 2.2 },
  { z: -4.0, w: 0.5, top: 0.72, bot: 0.03, y: 0.58, n: 2.25 },
  { z: -3.3, w: 0.49, top: 0.72, bot: 0.03, y: 0.6, n: 2.25 },
  { z: -2.75, w: 0.45, top: 0.6, bot: 0.03, y: 0.64, n: 2.2 },
  { z: -2.32, w: 0.37, top: 0.45, bot: 0.03, y: 0.69, n: 2.2 },
  { z: -2.02, w: 0.24, top: 0.27, bot: 0.03, y: 0.76, n: 2.1 },
  { z: -1.8, w: 0.08, top: 0.09, bot: 0.03, y: 0.86, n: 2 },
];

// the delta: leading edge swept 52 degrees from 6 m behind the nose, trailing edge 13.1 m back
const wle = (x: number) => -0.79 + (x - 1.95) * 1.3138;
const wte = (x: number) => 5.04 - (x - 1.365) * 0.0482;
const WING: WingStation[] = [
  { x: 0.7, le: wle(0.7), te: 5.07, y: -0.28, t: 0.05 },
  { x: 0.95, le: wle(0.95), te: 5.06, y: -0.3, t: 0.048 },
  { x: 5.22, le: wle(5.22), te: wte(5.22), y: -0.42, t: 0.035 },
];
const CANARD: WingStation[] = [
  // set low on the forward fuselage's chine, with a little anhedral
  { x: 0.5, le: -5.66, te: -4.17, y: 0.07, t: 0.06 },
  { x: 1.96, le: -4.2, te: -3.74, y: -0.12, t: 0.04 },
];
const CANARD_PIVOT = -4.75;
// the fin: its tip carries a pod and overhangs the nozzles; a cap rises above the pod toward the rear
const FIN: WingStation[] = [
  { x: 0, le: 2.98, te: 6.54, t: 0.05 },
  { x: 2.28, le: 6.19, te: 7.64, t: 0.036 },
  { x: 2.6, le: 6.75, te: 7.79, t: 0.034 },
  { x: 2.86, le: 7.25, te: 7.92, t: 0.03 },
];
const RUDDER = { h0: 0.25, h1: 2.15, hinge: (h: number) => 5.68 + h * 0.61 };

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
  gs.lineTo(...S(-5.9, 0.61));
  gs.lineTo(...S(-5.9, -0.38));
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
  for (const z of [-5.9, -5.1, -3.2, -1.9, -0.6, 1.0, 2.6, 4.1, 5.2, 5.9]) {
    line(gt, [T(-1.0, z), T(1.0, z)], 1.3, LINE_LIGHT);
    line(gs, [S(z, -1.05), S(z, 0.62)], 1.5, LINE);
    line(gb, [B(-1.0, z), B(1.0, z)], 1.2, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    line(gt, [T(0.35 * sx, -1.35), T(0.35 * sx, 0.05)], 1.5, LINE); // airbrake
    line(gt, [T(0.55 * sx, -0.4), T(0.55 * sx, 5.6)], 1.2, LINE_LIGHT);
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(1.0, wle(1.0) + 0.9), M(5.1, wle(5.1) + 0.25)], 1.2, LINE_LIGHT);
      line(g, [M(1.0, 3.4), M(5.1, 4.1)], 1.2, LINE_LIGHT);
      line(g, [M(2.6, wle(2.6) + 0.35), M(5.1, wle(5.1) + 0.2)], 1.3, LINE); // slats
      rivets(g, M(1.0, wle(1.0) + 0.9), M(5.1, wle(5.1) + 0.25), 7, 0.9);
      rivets(g, M(1.0, 3.4), M(5.1, 4.1), 7, 0.9);
      for (const x of [1.8, 2.6, 3.4, 4.2]) line(g, [M(x, wle(x) + 0.3), M(x, wte(x) - 0.75)], 1.0, LINE_LIGHT);
    }
    line(gt, [W(1.0, 0.3), W(1.8, 1.2), W(1.8, 3.4), W(1.0, 3.4)], 1.1, 'rgba(25,27,30,0.4)');
    if (sx < 0) roundel(gt, team, ...W(3.5, 3.0), 0.46 * pt);
    else roundel(gb, team, ...Wb(3.5, 3.0), 0.46 * L.pb);
    // canard panel lines
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) line(g, [M(0.7, -4.75), M(1.8, -3.95)], 1.0, LINE_LIGHT);
  }
  line(gs, [S(-5.9, -0.2), S(-2.8, -0.2)], 1.3, LINE_LIGHT);
  line(gs, [S(-3.5, -0.47), S(3.0, -0.5)], 1.4, LINE);
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-5.3, -0.28), S(-4.6, -0.05));
  rect(gs, S(-1.6, 0.05), S(-0.9, 0.35));
  rect(gs, S(3.0, -0.4), S(3.8, 0.0));
  weather(gt, L.top.width, L.top.height, rnd, 0.9, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.7, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.8, [1, 0.1]);
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(0.5 * sx, 6.0);
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
    const [x0, y0] = S(6.5, 2.45);
    const w = 0.45 * ps, h = 0.55 * ps;
    g.fillStyle = teamCol;
    g.fillRect(x0, y0, w / 3, h);
    g.fillStyle = 'rgba(232,233,228,0.9)';
    g.fillRect(x0 + w / 3, y0, w / 3, h);
    g.fillStyle = teamCol;
    g.fillRect(x0 + (2 * w) / 3, y0, w / 3, h);
  }
  L.sideDraw(5.3, 1.5, (g, x, y) => {
    g.fillStyle = 'rgba(232,233,228,0.85)';
    g.beginPath();
    g.arc(x, y, 0.26 * ps, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = teamCol;
    g.beginPath();
    g.arc(x, y, 0.2 * ps, 0, Math.PI * 2);
    g.fill();
  });
  L.sideText(team === 'blue' ? 'SK' : 'CP', 5.3, 1.5, 0.2 * ps, 'rgba(232,233,228,0.95)');
  L.sideText(team === 'blue' ? 'ZK 355' : 'MM 7340', 5.0, 0.2, 0.14 * ps, 'rgba(40,44,48,0.8)');
  L.sideDraw(-1.4, -0.75, (g, x, y) => roundel(g, team, x, y, 0.22 * ps));
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

  const zs = mergeStations(stations(-8.06, -5.9, 30, 0.55, 0), stations(-5.9, -2.1, 50), stations(-2.1, 5.95, 80));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -7.8, 5.85, 40);

  // chin intake with a diverter gap, splitter and variable lip
  // the mouth is nearly as wide as the forward fuselage and tucked right under it (only the
  // splitter slot between); behind it the trunk and the fuselage sides are one deep body
  const IW = curve([[-3.95, 0.78], [-3.5, 0.8], [-2.6, 0.85], [-1.0, 0.9], [2.5, 0.9], [4.0, 0.5]]);
  const IT = curve([[-3.95, -0.39], [-3.5, -0.41], [-2.6, -0.46], [-1.0, -0.48], [2.5, -0.5], [4.0, -0.5]]);
  const IB = curve([[-3.95, -0.95], [-3.5, -0.97], [-2.6, -1.0], [-1.0, -1.04], [1.0, -1.04], [2.5, -1.0], [4.0, -0.86]]);
  const IS = curve([[-3.95, 0.12], [-3.5, 0.11], [-2.6, 0.06], [-1.0, 0.0]]);
  const loop = (z: number) => ring(mirrorHalf(IHALF(IW(z), IT(z), IB(z), IS(z))), [3, 3, 2, 2, 2, 3, 3, 3, 3, 3, 2, 2, 2, 3]);
  const ci = intake({
    loop,
    outer: stations(-3.95, 4.0, 54, 0.3, 0),
    lip: 0.05,
    depth: 2.2,
    n: 96,
    // the upper lip (splitter side) leads; the variable lower lip sits well back, so from the
    // side the mouth is a steep slant, not a box front
    rake: (_x, y) => -0.85 * (y + 0.39),
    rakeFade: 1.0,
    fan: { cx: 0, cy: -0.76, r: 0.27 },
    // a dark mouth: the duct falls into shadow right behind the lip
    ductShade: { k0: 0.1, fall: 1.0, floor: 0.015 },
    ductShadeRaked: true,
    ductRings: 24,
  });
  skin(ci.skin);
  v.addMesh(ci.duct, pm.duct);
  const splitter = roundBox(0.03, 0.6, 1.8, 0.01);
  // the splitter's top edge meets the intake roof
  splitter.translate(0, -0.7, -2.5);
  // (inside the mouth it is in shadow, not lit like the skin)
  v.addMesh(stamp(splitter), new THREE.MeshStandardMaterial({ color: 0x3e4246, roughness: 0.8, metalness: 0.1 }));
  // diverter pillars between the fuselage and the intake roof
  v.addMesh(stamp(join([-0.4, 0.4].map((x) => { const g = roundBox(0.04, 0.08, 0.6, 0.015); g.translate(x, -0.37, -3.6); return g; }))), paint);

  // --- canopy, seat, pilot
  v.cockpitEye.set(0, 0.95, -3.95);
  buildCanopy(v, CANOPY, -4.56, []);
  // the windscreen's heavy frame: a broad band of arches over the thin one buildCanopy draws
  v.hideInCockpit.push(v.addMesh(join([-4.64, -4.6, -4.52, -4.48].map((z) => strip(sectionArch(sectionAt(CANOPY, z), 0.03, -0.012, 0.02, Math.PI - 0.02, 36)))), pm.frame));
  addPilot(v, new THREE.Vector3(0, 0.95, -3.95), 0.24, { style: 'eu', stick: 'center', martinBaker: true });
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
      { x0: 2.6, x1: 5.15, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.06, kind: 'lef', maxDeg: 18, leading: true },
      { x0: 1.1, x1: 3.0, hinge: (x) => wte(x) - 0.92, kind: 'flap', maxDeg: 25 },
      { x0: 3.08, x1: 5.15, hinge: (x) => wte(x) - 0.68, kind: 'aileron', maxDeg: 25 },
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
  const pod = lathe([[0.004, 2.72], [0.06, 2.95], [0.11, 3.3], [0.13, 3.8], [0.13, 4.7], [0.1, 5.05], [0.004, 5.25]], 18, 5.345, -0.43);
  skin(pod);
  skin(mirror(pod));

  // --- canards (all-moving)
  const canard = wing({ sections: CANARD, chordPts: 22, spanSub: 6, tip: 'round', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? canard.clone() : mirror(canard));
    v.addSurface(g, paint, new THREE.Vector3(0.62 * side, 0.05, CANARD_PIVOT), new THREE.Vector3(1, 0, 0), 'canard', side, 22);
  }

  // --- fin with rudder, fin-tip radome
  const m = finMatrix(0, 0.5, 0, 1);
  const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
  skin(f.fixed);
  v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', 0, 25);
  const tip = lathe([[0.004, 6.12], [0.07, 6.3], [0.12, 6.7], [0.12, 7.5], [0.09, 7.8], [0.004, 7.94]], 14, 0, 2.94);
  skin(tip);
  v.addNavLight(new THREE.Vector3(0, 3.4, 7.3), 'strobe');
  // dorsal fin fillet
  const fillet = loftProfile({
    stations: stations(2.6, 5.9, 14),
    profile: (z) => {
      const top = 0.7 + sstep(3.0, 3.25, z) * 0.26 - sstep(5.0, 5.9, z) * 0.1;
      const w = 0.15 - sstep(2.6, 5.9, z) * 0.05;
      return [[0, 0.45], [w, 0.5], [w * 0.4, top - 0.01], [0, top]] as P2[];
    },
    sub: 3,
    capStart: true,
    capEnd: true,
  });
  skin(fillet);

  // --- engines, brake-chute fairing
  for (const sx of [-1, 1]) {
    const nz = nozzle({ cx: 0.5 * sx, cy: -0.1, z0: 5.9, z1: 6.87, r0: 0.47, r1: 0.39, petals: 12, saw: 0.06, floor: 5.97 });
    const nzOut = v.addMesh(nz.outer, pm.nozzle);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.nozzles.push({ pos: new THREE.Vector3(0.5 * sx, -0.1, 6.8), radius: 0.37, depth: 0.62, area: nz.area });
  }
  v.buildFlames(5.0);
  const chute = lathe([[0.2, 4.8], [0.21, 5.5], [0.18, 6.1], [0.1, 6.5], [0.004, 6.62]], 20, 0, 0.3);
  skin(chute);

  // --- dorsal airbrake
  const AB = keyedProfile([
    { z: -1.35, pts: [[0, 1.005], [0.2, 0.975], [0.34, 0.9], [0.36, 0.885], [0.34, 0.92], [0.2, 1.0], [0, 1.03]] },
    { z: 0.05, pts: [[0, 0.845], [0.2, 0.815], [0.34, 0.74], [0.36, 0.725], [0.34, 0.76], [0.2, 0.84], [0, 0.87]] },
  ]);
  const ab = v.addSurface(stamp(loftProfile({ stations: stations(-1.35, 0.05, 10), profile: AB, sub: 4, capStart: true, capEnd: true })), paint, new THREE.Vector3(0, 1.01, -1.35), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
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
    probe(new THREE.Vector3(0, -0.27, -7.1), 0.16, 0.009, new THREE.Vector3(0, -0.4, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.8, 0.6), 0.2, 0.3),
    blade(new THREE.Vector3(0, -1.04, 0.2), 0.18, 0.26, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.63, 0.25, -4.9), new THREE.Vector3(1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(-0.63, 0.25, -4.9), new THREE.Vector3(-1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(0.985, -0.05, 3.4), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-0.985, -0.05, 3.4), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-5.47, -0.43, 3.5), 'red');
  v.addNavLight(new THREE.Vector3(5.47, -0.43, 3.5), 'green');
  v.addNavLight(new THREE.Vector3(0, -1.02, 1.8), 'strobe');

  // --- landing gear (mains retract inward into the fuselage)
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.34, -4.15), axle: new THREE.Vector3(0, -1.9 + 0.28, -4.4), r: 0.28, w: 0.18, twin: false, retract: 'forward' },
    mains: { top: new THREE.Vector3(1.45, -0.46, 1.15), axle: new THREE.Vector3(1.75, -1.9 + 0.39, 1.4), r: 0.39, w: 0.24, retract: 'inward', outboard: 0.1, doorLen: 0.32 },
    doorColor: '#939b9f',
  });
}
