// F/A-18F Super Hornet: 18.31 m long, 13.62 m span (with tip rails), 4.88 m tall.
// Two-seat F model: long LEX blades blended into the forward fuselage, caret
// intakes beneath them, trapezoidal wing with a dog-tooth at the fold,
// full-span leading-edge flaps, 20-degree canted twin fins, twin F414 nozzles.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect, Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, curve, sstep, roundBox } from './kit';
import { nozzle, intake, partMaterials, seatAndPilot, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

function circ(R: number, yc: number): P2[] {
  const ang = [-90, -72, -52, -34, -10, -3, 3, 10, 34, 52, 72, 90];
  return ang.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}

// right half, bottom centre -> top centre; points 4-7 form the LEX blade
const BODY = keyedProfile([
  { z: -9.3, pts: circ(0.012, -0.07) },
  { z: -9.0, pts: circ(0.17, -0.065) },
  { z: -8.4, pts: circ(0.33, -0.05) },
  { z: -7.6, pts: circ(0.46, -0.03) },
  { z: -6.9, pts: [[0, -0.56], [0.3, -0.54], [0.47, -0.4], [0.54, -0.18], [0.555, 0.0], [0.56, 0.03], [0.56, 0.05], [0.55, 0.09], [0.51, 0.3], [0.4, 0.46], [0.2, 0.52], [0, 0.53]] },
  { z: -6.3, pts: [[0, -0.63], [0.34, -0.62], [0.55, -0.5], [0.62, -0.24], [0.62, 0.02], [0.74, 0.05], [0.74, 0.07], [0.62, 0.12], [0.58, 0.34], [0.5, 0.49], [0.26, 0.52], [0, 0.53]] },
  { z: -5.9, pts: [[0, -0.66], [0.35, -0.65], [0.58, -0.53], [0.66, -0.26], [0.66, 0.02], [0.83, 0.05], [0.83, 0.07], [0.66, 0.13], [0.61, 0.36], [0.53, 0.54], [0.44, 0.36], [0, 0.3]] },
  { z: -5.2, pts: [[0, -0.69], [0.36, -0.68], [0.6, -0.56], [0.68, -0.28], [0.68, 0.02], [0.98, 0.05], [0.98, 0.07], [0.68, 0.13], [0.62, 0.37], [0.54, 0.56], [0.45, 0.3], [0, 0.12]] },
  { z: -4.0, pts: [[0, -0.7], [0.34, -0.7], [0.54, -0.58], [0.59, -0.3], [0.66, 0.0], [1.25, 0.04], [1.25, 0.06], [0.7, 0.14], [0.63, 0.38], [0.54, 0.56], [0.44, 0.3], [0, 0.12]] },
  { z: -3.2, pts: [[0, -0.71], [0.35, -0.71], [0.56, -0.6], [0.61, -0.31], [0.69, 0.0], [1.42, 0.035], [1.42, 0.055], [0.73, 0.15], [0.65, 0.38], [0.52, 0.56], [0.42, 0.42], [0, 0.4]] },
  { z: -2.6, pts: [[0, -0.72], [0.36, -0.72], [0.6, -0.62], [0.66, -0.32], [0.73, 0.0], [1.5, 0.035], [1.5, 0.055], [0.77, 0.15], [0.67, 0.38], [0.52, 0.55], [0.28, 0.63], [0, 0.66]] },
  { z: -1.4, pts: [[0, -0.74], [0.42, -0.75], [0.74, -0.75], [0.9, -0.4], [0.95, 0.0], [1.52, 0.03], [1.52, 0.05], [0.95, 0.15], [0.74, 0.38], [0.55, 0.52], [0.28, 0.58], [0, 0.6]] },
  { z: -0.5, pts: [[0, -0.73], [0.46, -0.76], [0.9, -0.78], [1.12, -0.5], [1.1, -0.06], [1.2, 0.03], [1.2, 0.06], [1.08, 0.18], [0.82, 0.4], [0.58, 0.5], [0.29, 0.55], [0, 0.57]] },
  { z: 0.8, pts: [[0, -0.7], [0.5, -0.76], [1.0, -0.78], [1.22, -0.55], [1.2, -0.12], [1.14, 0.03], [1.14, 0.07], [1.1, 0.2], [0.85, 0.42], [0.6, 0.5], [0.3, 0.53], [0, 0.55]] },
  { z: 3.5, pts: [[0, -0.62], [0.45, -0.68], [0.95, -0.7], [1.18, -0.5], [1.18, -0.12], [1.12, 0.02], [1.12, 0.06], [1.06, 0.2], [0.85, 0.4], [0.6, 0.47], [0.3, 0.49], [0, 0.5]] },
  { z: 6.0, pts: [[0, -0.5], [0.3, -0.6], [0.62, -0.66], [0.98, -0.54], [1.12, -0.28], [1.12, -0.1], [1.12, -0.05], [1.08, 0.12], [0.9, 0.34], [0.6, 0.45], [0.3, 0.44], [0, 0.4]] },
  { z: 7.6, pts: [[0, -0.42], [0.22, -0.56], [0.56, -0.62], [0.86, -0.52], [1.06, -0.3], [1.1, -0.1], [1.1, -0.05], [1.05, 0.14], [0.86, 0.36], [0.56, 0.46], [0.28, 0.38], [0, 0.3]] },
  { z: 8.4, pts: [[0, -0.3], [0.18, -0.5], [0.56, -0.61], [0.86, -0.5], [1.04, -0.3], [1.09, -0.1], [1.09, -0.06], [1.04, 0.12], [0.86, 0.33], [0.56, 0.44], [0.26, 0.33], [0, 0.18]] },
]);
const BODY_SUB = [4, 3, 3, 3, 3, 1, 3, 3, 3, 3, 4];

const CANOPY: Section[] = [
  { z: -6.95, w: 0.03, top: 0.02, bot: 0.02, y: 0.5, n: 2 },
  { z: -6.45, w: 0.37, top: 0.34, bot: 0.03, y: 0.52, n: 2.2 },
  { z: -5.9, w: 0.48, top: 0.52, bot: 0.03, y: 0.54, n: 2.2 },
  { z: -5.1, w: 0.52, top: 0.6, bot: 0.03, y: 0.55, n: 2.2 },
  { z: -3.9, w: 0.5, top: 0.56, bot: 0.03, y: 0.55, n: 2.2 },
  { z: -2.9, w: 0.38, top: 0.32, bot: 0.03, y: 0.55, n: 2.2 },
  { z: -2.3, w: 0.18, top: 0.08, bot: 0.03, y: 0.56, n: 2 },
];

const WING: WingStation[] = [
  { x: 0.9, le: -1.2, te: 3.5, y: 0.05, t: 0.05 },
  { x: 1.12, le: -1.0, te: 3.5, y: 0.05, t: 0.05 },
  { x: 4.1, le: 0.585, te: 3.47, y: 0.02, t: 0.042 },
  { x: 4.115, le: 0.47, te: 3.47, y: 0.02, t: 0.042 },
  { x: 6.5, le: 1.74, te: 3.44, y: 0.0, t: 0.034 },
];
const wle = (x: number) => (x < 4.11 ? -1.0 + (x - 1.12) * 0.5317 : 0.47 + (x - 4.115) * 0.5325);
const wte = (x: number) => 3.5 - (x - 1.12) * 0.0178;
const STAB: WingStation[] = [
  { x: 1.05, le: 6.4, te: 9.2, y: -0.08, t: 0.045 },
  { x: 3.5, le: 8.62, te: 9.62, y: -0.16, t: 0.032 },
];
const STAB_PIVOT_Z = 7.9;
const FIN: WingStation[] = [
  { x: 0, le: 3.55, te: 7.0, t: 0.052 },
  { x: 2.78, le: 5.55, te: 6.78, t: 0.034 },
];
const FIN_ROOT = { x: 0.95, y: 0.34, cant: 20 };
const RUDDER = { h0: 0.15, h1: 1.95, hinge: (h: number) => 6.2 - h * 0.08 };

function livery(team: string): Livery {
  const L = new Livery({ half: 10.0, z0: -10.0, len: 20, y0: -2.2, height: 5.6 });
  const { gt, gb, gs } = L;
  const rnd = prng(18);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // radome slightly different grey, anti-glare
  gt.fillStyle = 'rgba(150,156,160,0.6)';
  gt.beginPath();
  gt.ellipse(...T(0, -8.1), 0.52 * pt, 1.2 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gs.fillStyle = 'rgba(150,156,160,0.6)';
  gs.beginPath();
  gs.moveTo(...S(-9.35, -0.07));
  gs.lineTo(...S(-6.95, 0.55));
  gs.lineTo(...S(-6.95, -0.58));
  gs.closePath();
  gs.fill();
  gt.fillStyle = 'rgba(52,56,60,0.75)';
  gt.beginPath();
  gt.moveTo(...T(-0.4, -6.5));
  gt.lineTo(...T(0.4, -6.5));
  gt.lineTo(...T(0.16, -7.5));
  gt.lineTo(...T(-0.16, -7.5));
  gt.closePath();
  gt.fill();
  gt.fillStyle = 'rgba(42,45,48,1)';
  gt.fillRect(...T(-0.47, -6.2), 0.94 * pt, 3.2 * pt);
  // gun muzzle soot on the nose
  const [gx, gy] = T(0, -7.3);
  const grd = gt.createRadialGradient(gx, gy + 0.3 * pt, 0, gx, gy + 0.3 * pt, 0.5 * pt);
  grd.addColorStop(0, 'rgba(30,30,30,0.55)');
  grd.addColorStop(1, 'rgba(30,30,30,0)');
  gt.fillStyle = grd;
  gt.fillRect(gx - 0.5 * pt, gy - 0.3 * pt, pt, 1.2 * pt);
  // panel lines
  for (const z of [-6.95, -6.1, -3.2, -2.0, -0.4, 1.2, 2.8, 4.4, 5.9, 7.2, 8.1]) {
    line(gt, [T(-1.3, z), T(1.3, z)], 1.3, LINE_LIGHT);
    line(gs, [S(z, -0.78), S(z, 0.6)], 1.5, LINE);
    line(gb, [B(-1.3, z), B(1.3, z)], 1.2, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    // LEX: edge line, spoiler panels, vortex-fence-free upper panels
    line(gt, [T(0.64 * sx, -6.3), T(0.98 * sx, -5.2), T(1.28 * sx, -3.8), T(1.5 * sx, -2.4), T(1.4 * sx, -1.0)], 2.2, 'rgba(30,34,38,0.6)');
    line(gt, [T(0.72 * sx, -5.6), T(1.0 * sx, -4.2), T(1.25 * sx, -2.6)], 1.0, LINE_LIGHT);
    line(gt, [T(0.85 * sx, -2.1), T(1.28 * sx, -2.1), T(1.3 * sx, -1.2), T(0.9 * sx, -1.2)], 1.5, LINE, true);
    line(gt, [T(0.5 * sx, -0.5), T(0.5 * sx, 6.0)], 1.2, LINE_LIGHT);
    line(gt, [T(0.95 * sx, 0.5), T(0.95 * sx, 7.6)], 1.2, LINE_LIGHT);
    // wing: spars, fold line, flaps, ailerons, LEFs
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(1.12, wle(1.12) + 0.7), M(6.4, wle(6.4) + 0.25)], 1.2, LINE_LIGHT);
      line(g, [M(1.12, 2.4), M(6.4, 2.9)], 1.2, LINE_LIGHT);
      line(g, [M(4.1, wle(4.1)), M(4.1, wte(4.1))], 1.8, LINE);
      rivets(g, M(1.12, wle(1.12) + 0.7), M(6.4, wle(6.4) + 0.25), 7, 0.9);
      rivets(g, M(1.12, 2.4), M(6.4, 2.9), 7, 0.9);
      for (const x of [2.0, 2.9, 3.6, 4.8, 5.6]) line(g, [M(x, wle(x) + 0.35), M(x, wte(x) - 0.6)], 1.0, LINE_LIGHT);
    }
    // walkway and markings
    line(gt, [W(1.2, 0.2), W(2.2, 0.7), W(2.2, 2.4), W(1.2, 2.4)], 1.1, 'rgba(25,27,30,0.4)');
    gt.save();
    gt.translate(...W(3.4, 1.8));
    gt.fillStyle = 'rgba(40,42,46,0.55)';
    gt.font = `bold ${0.15 * pt}px Arial`;
    gt.textAlign = 'center';
    gt.fillText('NO STEP', 0, 0);
    gt.restore();
    if (sx < 0) roundel(gt, team, ...W(5.0, 2.1), 0.5 * pt);
    else roundel(gb, team, ...Wb(5.0, 2.1), 0.5 * L.pb);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) line(g, [M(1.4, 7.4), M(3.4, 9.2)], 1.0, LINE_LIGHT);
  }
  // side details
  line(gs, [S(-6.9, 0.04), S(-1.0, 0.04)], 1.4, LINE);
  line(gs, [S(-3.5, -0.7), S(6.5, -0.7)], 1.4, LINE);
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-6.0, -0.45), S(-5.2, -0.15));
  rect(gs, S(1.4, -0.45), S(2.4, -0.1));
  rect(gs, S(4.6, -0.35), S(5.4, 0.05));
  weather(gt, L.top.width, L.top.height, rnd, 1.0, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.8, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.9, [1, 0.1]);
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(0.56 * sx, 8.3);
      const gr = g.createLinearGradient(x, y - 1.8 * s, x, y);
      gr.addColorStop(0, 'rgba(40,36,30,0)');
      gr.addColorStop(1, 'rgba(40,36,30,0.32)');
      g.fillStyle = gr;
      g.fillRect(x - 0.5 * s, y - 1.8 * s, s, 1.8 * s);
    }
  }
  L.copySides();
  const teamCol = team === 'blue' ? '#2d4d8e' : '#9a2521';
  // canted fins: tip band, codes (the side projection handles the cant well enough)
  for (const g of [L.gs, L.gr]) {
    g.fillStyle = teamCol;
    g.beginPath();
    g.moveTo(...S(5.45, 2.92));
    g.lineTo(...S(6.75, 2.92));
    g.lineTo(...S(6.8, 2.62));
    g.lineTo(...S(5.25, 2.62));
    g.closePath();
    g.fill();
  }
  L.sideText(team === 'blue' ? 'SK' : 'CP', 5.75, 1.75, 0.5 * ps, 'rgba(46,50,55,0.8)');
  L.sideText(team === 'blue' ? '201' : '312', 5.9, 1.25, 0.2 * ps, 'rgba(46,50,55,0.75)');
  L.sideDraw(-0.2, -0.35, (g, x, y) => roundel(g, team, x, y, 0.28 * ps));
  L.sideText(team === 'blue' ? 'SKYE STRIKE' : 'CAPRI STRIKE', -3.4, -0.34, 0.1 * ps, 'rgba(46,50,55,0.7)');
  L.sideText(team === 'blue' ? '201' : '312', -7.6, -0.05, 0.2 * ps, 'rgba(46,50,55,0.7)');
  L.sideDraw(-6.3, 0.3, (g, x, y) => {
    g.fillStyle = '#c9402c';
    g.beginPath();
    g.moveTo(x, y - 0.1 * ps);
    g.lineTo(x + 0.1 * ps, y + 0.08 * ps);
    g.lineTo(x - 0.1 * ps, y + 0.08 * ps);
    g.closePath();
    g.fill();
  });
  for (const g of [L.gs, L.gr]) {
    g.fillStyle = 'rgba(190,48,40,0.8)';
    g.fillRect(...S(-3.4, -0.08), 0.05 * ps, 0.75 * ps);
  }
  return L;
}

const liveries = new Map<string, Livery>();

export function buildFA18(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#858c92'), bottom: new THREE.Color('#a9afb3'), livery: L, roughness: 0.6, metalness: 0.15 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-9.3, -6.9, 32, 0.55, 0), stations(-6.9, -2.3, 60), stations(-2.3, 8.4, 90));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -9.0, 8.2, 40);

  // caret intakes under the LEX: sheared (the outer wall leans out), swept mouth
  const TW = curve([[-3.8, 0.34], [-1.5, 0.35], [1.4, 0.32]]);
  const TH = curve([[-3.8, 0.4], [-1.5, 0.39], [1.4, 0.34]]);
  const TY = curve([[-3.8, -0.45], [-1.5, -0.44], [1.4, -0.4]]);
  const trunkLoop = (z: number) => rrect(0.98, TY(z), TW(z), TH(z), 0.1, 3).map(([x, y]) => [x + 0.22 * (y - TY(z)), y] as P2);
  const trunk = intake({
    loop: trunkLoop,
    outer: stations(-3.75, 1.4, 44, 0.3, 0),
    lip: 0.045,
    depth: 2.0,
    n: 64,
    rake: (x, y) => -0.45 * (y + 0.45) + 0.55 * (x - 0.98),
    fan: { cx: 0.72, cy: -0.32, r: 0.36 },
  });
  skin(both(trunk.skin));
  v.addMesh(both(trunk.duct), pm.duct);

  // --- canopy, seats, pilots
  v.cockpitEye.set(0, 0.9, -5.4);
  buildCanopy(v, CANOPY, -5.92, [-4.6]);
  for (const eye of [new THREE.Vector3(0, 0.9, -5.4), new THREE.Vector3(0, 0.95, -3.95)]) {
    const sp = seatAndPilot(eye, 0.22, true);
    v.hideInCockpit.push(v.addMesh(sp.seat, pm.seat), v.addMesh(sp.flight, pm.flight), v.addMesh(sp.helmet, pm.helmet), v.addMesh(sp.visor, pm.visor));
  }
  const shroud = loftProfile({
    stations: stations(-6.3, -5.9, 6),
    profile: (z) => {
      const u = sstep(-6.3, -5.9, z);
      return [[0, 0.16], [0.42, 0.18], [0.48, 0.48], [0.34, 0.57 - u * 0.06], [0, 0.59 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));

  // --- wing: LEFs, flaps, ailerons, dog-tooth at the fold
  const panels = wingPanels(
    WING,
    [
      { x0: 1.2, x1: 4.1, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.08, kind: 'lef', maxDeg: 25, leading: true },
      { x0: 4.115, x1: 6.4, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.08, kind: 'lef', maxDeg: 25, leading: true },
      { x0: 1.2, x1: 4.0, hinge: (x) => wte(x) - 0.95, kind: 'flap', maxDeg: 40 },
      { x0: 4.2, x1: 6.3, hinge: (x) => wte(x) - 0.62, kind: 'aileron', maxDeg: 25 },
    ],
    { chordPts: 32, thickPos: 0.4 },
  );
  skin(both(panels.fixed));
  for (const cs of panels.moving) {
    for (const side of [1, -1] as const) {
      const g = stamp(side > 0 ? cs.geo.clone() : mirror(cs.geo));
      const a = cs.axis.clone();
      if (side < 0) a.x = -a.x;
      v.addSurface(g, paint, new THREE.Vector3(cs.hinge.x * side, cs.hinge.y, cs.hinge.z), side > 0 ? a : a.negate(), cs.kind, side, cs.maxDeg);
    }
  }
  // wingtip launch rails (always fitted)
  const tipRail = join([roundBox(0.1, 0.12, 2.6, 0.03)]);
  tipRail.translate(6.56, 0.0, 1.9);
  skin(both(tipRail));

  // --- stabilators
  const stab = wing({ sections: STAB, chordPts: 26, spanSub: 7, tip: 'round', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    v.addSurface(g, paint, new THREE.Vector3(1.2 * side, -0.08, STAB_PIVOT_Z), new THREE.Vector3(1, 0, 0), 'stab', side, 24);
  }

  // --- canted fins
  for (const side of [1, -1] as const) {
    const m = finMatrix(FIN_ROOT.x * side, FIN_ROOT.y, FIN_ROOT.cant, side);
    const f = finPanels(FIN, RUDDER, m, { chordPts: 28 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 28);
    const top = new THREE.Vector3(2.76, 0, 0).applyMatrix4(m);
    v.addNavLight(new THREE.Vector3(top.x, top.y, 6.6), 'formation');
  }

  // --- engines, tail hook
  for (const sx of [-1, 1]) {
    const nz = nozzle({ cx: 0.56 * sx, cy: -0.08, z0: 8.35, z1: 9.08, r0: 0.53, r1: 0.45, petals: 12, saw: 0.07, floor: 8.42 });
    v.addMesh(nz.outer, pm.nozzle);
    v.addMesh(nz.inner, pm.nozzleIn).userData.detail = true;
    v.nozzles.push({ pos: new THREE.Vector3(0.56 * sx, -0.08, 9.0), radius: 0.42 });
  }
  v.buildFlames(5.4);
  const hook = join([lathe([[0.04, 6.4], [0.05, 6.6], [0.05, 8.6], [0.03, 8.9]], 10, 0, -0.42)]);
  v.addMesh(hook, pm.darkMetal);

  // --- LEX spoilers (the Super Hornet's speedbrakes)
  const spoilers: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const g = roundBox(0.42, 0.025, 0.85, 0.008);
    g.translate(1.08 * sx, 0.075, -1.65);
    spoilers.push(stamp(g));
  }
  const sp = v.addSurface(join(spoilers), paint, new THREE.Vector3(0, 0.07, -2.08), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(sp), 1);
  v.speedbrake = { pivot: sp.pivot, axis: new THREE.Vector3(-1, 0, 0), maxDeg: 60 };

  // --- gun, probes, antennas, lights
  // the retractable refuelling probe lives under a hump on the right of the nose
  skin(lathe([[0.004, -7.65], [0.05, -7.45], [0.065, -7.0], [0.06, -6.55], [0.004, -6.35]], 14, 0.3, 0.38));
  const gun = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), pm.darkMetal);
  gun.position.set(0, 0.44, -7.32);
  gun.rotation.x = -1.2;
  v.body.add(gun);
  v.addMesh(join([
    probe(new THREE.Vector3(0.42, 0.1, -7.9), 0.3, 0.011, new THREE.Vector3(0.15, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.42, 0.1, -7.9), 0.3, 0.011, new THREE.Vector3(-0.15, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.6, -1.6), 0.22, 0.3),
    blade(new THREE.Vector3(0, 0.5, 2.2), 0.16, 0.24),
    blade(new THREE.Vector3(0, -0.72, 0.5), 0.2, 0.3, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.66, 0.22, -5.8), new THREE.Vector3(1, 0.2, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(-0.66, 0.22, -5.8), new THREE.Vector3(-1, 0.2, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(1.19, -0.3, 4.2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-1.19, -0.3, 4.2), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-6.62, 0.08, 0.8), 'red');
  v.addNavLight(new THREE.Vector3(6.62, 0.08, 0.8), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.52, 3.2), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -0.72, 1.2), 'strobe');

  // --- landing gear: twin-wheel nose leg with launch bar, trailing-arm mains
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.6, -5.3), axle: new THREE.Vector3(0, -1.95 + 0.28, -5.62), r: 0.28, w: 0.17, twin: true, retract: 'forward', launchBar: true },
    mains: { top: new THREE.Vector3(1.15, -0.62, 0.3), axle: new THREE.Vector3(1.58, -1.95 + 0.44, 0.9), r: 0.44, w: 0.27, retract: 'aft', outboard: 0, trailing: true },
    doorColor: '#a9afb3',
  });
}
