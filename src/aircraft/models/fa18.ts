// F/A-18F Super Hornet: 18.31 m long, 13.62 m span (with tip missiles), 4.88 m tall.
// Two-seat F model, measured from a scale three-view and photographs: a slim forward fuselage (0.9 m wide,
// its belly well above the nacelles) with the LEX growing from beside the windscreen; caret intakes under
// the LEX at the wing root, 8.8 m from the nose, their lower lips raked aft; a shoulder wing with three
// degrees of anhedral and a dog-tooth at the fold; stabilators 7.1 m across with raked tips; fins canted
// out 22 degrees, their tips 3.8 m apart; twin F414 nozzles.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect, Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, curve, sstep, roundBox } from './kit';
import { nozzle, intake, partMaterials, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

function circ(R: number, yc: number): P2[] {
  const ang = [-90, -72, -52, -34, -10, -3, 3, 10, 34, 52, 72, 90];
  return ang.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}

// a slightly squared oval for the forward fuselage: half-width, centre height, half-height
function oval(hw: number, yc: number, hh: number): P2[] {
  const ang = [-90, -72, -52, -34, -10, -3, 3, 10, 34, 52, 72, 90];
  return ang.map((a) => {
    const c = Math.cos((a * Math.PI) / 180);
    const sn = Math.sin((a * Math.PI) / 180);
    return [hw * Math.sign(c) * Math.pow(Math.abs(c), 0.8), yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), 0.8)] as P2;
  });
}

// right half, bottom centre -> top centre; points 5-6 form the LEX blade
const BODY = keyedProfile([
  { z: -9.3, pts: circ(0.012, -0.165) },
  { z: -9.0, pts: circ(0.16, -0.135) },
  { z: -8.8, pts: circ(0.23, -0.11) },
  { z: -8.3, pts: circ(0.35, -0.06) },
  { z: -7.8, pts: circ(0.43, 0.0) },
  { z: -7.3, pts: oval(0.445, 0.06, 0.49) },
  { z: -6.8, pts: oval(0.45, 0.1, 0.55) },
  { z: -6.2, pts: oval(0.455, 0.155, 0.605) },
  // the cockpit tub; the LEX blade starts beside the windscreen, at shoulder height
  { z: -5.6, pts: [[0, -0.45], [0.2, -0.44], [0.37, -0.35], [0.44, -0.13], [0.455, 0.15], [0.455, 0.385], [0.455, 0.415], [0.455, 0.5], [0.45, 0.62], [0.43, 0.74], [0.36, 0.56], [0, 0.5]] },
  { z: -4.8, pts: [[0, -0.45], [0.2, -0.44], [0.37, -0.35], [0.44, -0.13], [0.455, 0.2], [0.51, 0.385], [0.51, 0.415], [0.46, 0.5], [0.455, 0.63], [0.44, 0.78], [0.37, 0.5], [0, 0.32]] },
  { z: -4.3, pts: [[0, -0.45], [0.2, -0.44], [0.37, -0.35], [0.44, -0.13], [0.455, 0.2], [0.77, 0.385], [0.77, 0.415], [0.465, 0.5], [0.455, 0.635], [0.44, 0.8], [0.37, 0.5], [0, 0.32]] },
  { z: -3.8, pts: [[0, -0.45], [0.2, -0.44], [0.37, -0.35], [0.44, -0.13], [0.455, 0.2], [1.01, 0.385], [1.01, 0.415], [0.47, 0.5], [0.46, 0.64], [0.44, 0.82], [0.37, 0.5], [0, 0.32]] },
  { z: -3.0, pts: [[0, -0.45], [0.2, -0.44], [0.37, -0.35], [0.44, -0.13], [0.455, 0.2], [1.31, 0.385], [1.31, 0.415], [0.5, 0.5], [0.47, 0.64], [0.44, 0.84], [0.36, 0.62], [0, 0.6]] },
  { z: -2.3, pts: [[0, -0.45], [0.2, -0.44], [0.37, -0.35], [0.44, -0.13], [0.455, 0.2], [1.56, 0.385], [1.56, 0.415], [0.56, 0.5], [0.5, 0.66], [0.44, 0.86], [0.27, 0.9], [0, 0.97]] },
  { z: -1.5, pts: [[0, -0.45], [0.2, -0.44], [0.37, -0.35], [0.44, -0.13], [0.455, 0.22], [1.76, 0.385], [1.76, 0.415], [0.8, 0.5], [0.62, 0.66], [0.48, 0.82], [0.28, 1.0], [0, 1.1]] },
  // beside the intakes the fuselage stays slim; the nacelles (the intake trunks, below) carry the width
  { z: -0.7, pts: [[0, -0.45], [0.2, -0.44], [0.36, -0.36], [0.42, -0.13], [0.44, 0.26], [1.93, 0.385], [1.93, 0.415], [1.08, 0.5], [0.8, 0.63], [0.55, 0.83], [0.3, 1.08], [0, 1.17]] },
  { z: 0.0, pts: [[0, -0.45], [0.2, -0.44], [0.36, -0.36], [0.42, -0.13], [0.44, 0.26], [2.0, 0.385], [2.0, 0.415], [1.12, 0.5], [0.82, 0.64], [0.56, 0.82], [0.3, 1.05], [0, 1.13]] },
  { z: 0.8, pts: [[0, -0.47], [0.2, -0.46], [0.36, -0.38], [0.42, -0.15], [0.44, 0.26], [1.9, 0.33], [1.9, 0.36], [1.1, 0.535], [0.84, 0.65], [0.58, 0.8], [0.31, 1.01], [0, 1.09]] },
  { z: 1.4, pts: [[0, -0.5], [0.2, -0.5], [0.36, -0.42], [0.42, -0.18], [0.44, 0.1], [0.46, 0.33], [0.5, 0.37], [1.1, 0.535], [0.85, 0.65], [0.6, 0.78], [0.31, 0.975], [0, 1.045]] },
  { z: 2.0, pts: [[0, -0.6], [0.45, -0.7], [1.0, -0.77], [1.15, -0.52], [1.21, 0.1], [1.15, 0.33], [1.15, 0.37], [1.08, 0.535], [0.85, 0.65], [0.6, 0.765], [0.31, 0.935], [0, 1.0]] },
  { z: 2.5, pts: [[0, -0.61], [0.45, -0.71], [0.98, -0.78], [1.16, -0.5], [1.21, 0.1], [1.14, 0.33], [1.14, 0.37], [1.07, 0.535], [0.85, 0.645], [0.6, 0.755], [0.3, 0.905], [0, 0.96]] },
  { z: 3.5, pts: [[0, -0.62], [0.45, -0.72], [0.95, -0.77], [1.18, -0.45], [1.19, 0.1], [1.12, 0.32], [1.12, 0.36], [1.06, 0.51], [0.85, 0.64], [0.6, 0.74], [0.3, 0.86], [0, 0.89]] },
  { z: 5.7, pts: [[0, -0.5], [0.3, -0.6], [0.62, -0.66], [0.98, -0.42], [1.12, -0.06], [1.12, 0.2], [1.12, 0.25], [1.08, 0.4], [0.9, 0.58], [0.6, 0.68], [0.3, 0.72], [0, 0.6]] },
  { z: 7.1, pts: [[0, -0.36], [0.22, -0.48], [0.56, -0.53], [0.86, -0.36], [1.04, -0.06], [1.08, 0.2], [1.08, 0.25], [1.03, 0.4], [0.86, 0.52], [0.56, 0.56], [0.28, 0.5], [0, 0.3]] },
  { z: 7.9, pts: [[0, -0.22], [0.18, -0.36], [0.56, -0.45], [0.84, -0.3], [1.0, -0.04], [1.05, 0.14], [1.05, 0.18], [1.0, 0.34], [0.84, 0.46], [0.56, 0.51], [0.26, 0.42], [0, 0.2]] },
]);
const BODY_SUB = [4, 3, 3, 3, 3, 1, 3, 3, 3, 3, 4];

const CANOPY: Section[] = [
  { z: -6.03, w: 0.03, top: 0.02, bot: 0.02, y: 0.7, n: 2 },
  { z: -5.6, w: 0.299, top: 0.33, bot: 0.03, y: 0.74, n: 2.2 },
  { z: -5.0, w: 0.39, top: 0.5, bot: 0.03, y: 0.77, n: 2.2 },
  { z: -4.4, w: 0.423, top: 0.55, bot: 0.03, y: 0.79, n: 2.2 },
  { z: -3.4, w: 0.423, top: 0.52, bot: 0.03, y: 0.82, n: 2.2 },
  { z: -2.4, w: 0.382, top: 0.44, bot: 0.03, y: 0.86, n: 2.2 },
  { z: -1.6, w: 0.299, top: 0.3, bot: 0.03, y: 0.92, n: 2.1 },
  { z: -1.0, w: 0.166, top: 0.14, bot: 0.03, y: 0.98, n: 2.1 },
  { z: -0.72, w: 0.04, top: 0.03, bot: 0.02, y: 1.0, n: 2 },
];

// the wing, from the plan view: the leading edge leaves the LEX 9.5 m from the nose, swept 27 degrees, with
// a dog-tooth at the fold; an almost straight trailing edge; at the shoulder with three degrees of anhedral
const WING_Y = (x: number) => 0.4 - (x - 1.0) * 0.057;
const FOLD = 4.65;
const wle = (x: number) => (x < FOLD + 0.007 ? 0.18 + (x - 2.0) * 0.5 : 1.39 + (x - FOLD - 0.015) * 0.5015);
const wte = (x: number) => (x < FOLD + 0.007 ? 4.46 - (x - 1.0) * 0.0712 : 4.16 - (x - FOLD - 0.015) * 0.064);
const WING: WingStation[] = [
  { x: 0.5, le: wle(0.5), te: wte(0.5), y: WING_Y(0.5), t: 0.05 },
  { x: 2.0, le: wle(2.0), te: wte(2.0), y: WING_Y(2.0), t: 0.05 },
  { x: FOLD, le: wle(FOLD), te: wte(FOLD), y: WING_Y(FOLD), t: 0.042 },
  { x: FOLD + 0.015, le: wle(FOLD + 0.015), te: wte(FOLD + 0.015), y: WING_Y(FOLD + 0.015), t: 0.042 },
  { x: 6.38, le: wle(6.38), te: wte(6.38), y: WING_Y(6.38), t: 0.034 },
];
// the stabilators: 7.1 m across, swept 50 degrees, the tips raked
const STAB: WingStation[] = [
  { x: 1.05, le: 5.07, te: 8.1, y: -0.05, t: 0.045 },
  { x: 3.01, le: 7.4, te: 9.33, y: -0.12, t: 0.034 },
  { x: 3.55, le: 8.03, te: 9.03, y: -0.14, t: 0.03 },
];
const STAB_PIVOT_Z = 7.3;
// the fins: canted out 22 degrees, the tips 3.1 m above the nose line and 3.8 m apart
const FIN: WingStation[] = [
  { x: 0, le: 3.74, te: 6.85, t: 0.052 },
  { x: 2.78, le: 6.09, te: 7.0, t: 0.034 },
];
const FIN_ROOT = { x: 0.88, y: 0.55, cant: 22 };
const RUDDER = { h0: 0.15, h1: 2.0, hinge: (h: number) => 6.25 + h * 0.04 };

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
  gt.ellipse(...T(0, -8.5), 0.47 * pt, 0.87 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gs.fillStyle = 'rgba(150,156,160,0.6)';
  gs.beginPath();
  gs.moveTo(...S(-9.35, -0.165));
  gs.lineTo(...S(-7.63, 0.5));
  gs.lineTo(...S(-7.63, -0.5));
  gs.closePath();
  gs.fill();
  gt.fillStyle = 'rgba(52,56,60,0.75)';
  gt.beginPath();
  gt.moveTo(...T(-0.4, -5.6));
  gt.lineTo(...T(0.4, -5.6));
  gt.lineTo(...T(0.16, -6.6));
  gt.lineTo(...T(-0.16, -6.6));
  gt.closePath();
  gt.fill();
  gt.fillStyle = 'rgba(42,45,48,1)';
  gt.fillRect(...T(-0.4, -5.4), 0.8 * pt, 3.5 * pt);
  // gun muzzle soot on the nose
  const [gx, gy] = T(0, -6.3);
  const grd = gt.createRadialGradient(gx, gy + 0.3 * pt, 0, gx, gy + 0.3 * pt, 0.5 * pt);
  grd.addColorStop(0, 'rgba(30,30,30,0.55)');
  grd.addColorStop(1, 'rgba(30,30,30,0)');
  gt.fillStyle = grd;
  gt.fillRect(gx - 0.5 * pt, gy - 0.3 * pt, pt, 1.2 * pt);
  // panel lines
  for (const z of [-7.63, -6.7, -5.9, -3.2, -2.0, -0.6, 1.2, 2.8, 4.4, 5.6, 6.8, 7.6]) {
    line(gt, [T(-1.3, z), T(1.3, z)], 1.3, LINE_LIGHT);
    line(gs, [S(z, -0.78), S(z, 0.6)], 1.5, LINE);
    line(gb, [B(-1.3, z), B(1.3, z)], 1.2, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    // LEX: edge line, spoiler panels, vortex-fence-free upper panels
    line(gt, [T(0.46 * sx, -5.3), T(0.51 * sx, -4.8), T(0.77 * sx, -4.3), T(1.01 * sx, -3.8), T(1.31 * sx, -3.0), T(1.56 * sx, -2.3), T(1.76 * sx, -1.5), T(1.93 * sx, -0.7), T(2.0 * sx, 0.1)], 2.2, 'rgba(30,34,38,0.6)');
    line(gt, [T(0.5 * sx, -4.4), T(0.8 * sx, -3.3), T(1.3 * sx, -1.8)], 1.0, LINE_LIGHT);
    line(gt, [T(1.0 * sx, -2.1), T(1.45 * sx, -2.1), T(1.5 * sx, -1.2), T(1.05 * sx, -1.2)], 1.5, LINE, true);
    line(gt, [T(0.5 * sx, -0.5), T(0.5 * sx, 5.6)], 1.2, LINE_LIGHT);
    line(gt, [T(0.95 * sx, 0.5), T(0.95 * sx, 7.1)], 1.2, LINE_LIGHT);
    // wing: spars, fold line, flaps, ailerons, LEFs
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(1.12, wle(1.12) + 0.7), M(6.4, wle(6.4) + 0.25)], 1.2, LINE_LIGHT);
      line(g, [M(1.12, 3.8), M(6.4, 3.6)], 1.2, LINE_LIGHT);
      line(g, [M(FOLD, wle(FOLD)), M(FOLD, wte(FOLD))], 1.8, LINE);
      rivets(g, M(1.12, wle(1.12) + 0.7), M(6.4, wle(6.4) + 0.25), 7, 0.9);
      rivets(g, M(1.12, 3.8), M(6.4, 3.6), 7, 0.9);
      for (const x of [2.4, 3.1, 3.8, 5.2, 5.9]) line(g, [M(x, wle(x) + 0.35), M(x, wte(x) - 0.6)], 1.0, LINE_LIGHT);
    }
    // walkway and markings
    line(gt, [W(1.2, 1.6), W(2.2, 2.1), W(2.2, 3.8), W(1.2, 3.8)], 1.1, 'rgba(25,27,30,0.4)');
    gt.save();
    gt.translate(...W(3.4, 3.4));
    gt.fillStyle = 'rgba(40,42,46,0.55)';
    gt.font = `bold ${0.15 * pt}px Arial`;
    gt.textAlign = 'center';
    gt.fillText('NO STEP', 0, 0);
    gt.restore();
    if (sx < 0) roundel(gt, team, ...W(5.3, 2.95), 0.5 * pt);
    else roundel(gb, team, ...Wb(5.3, 2.95), 0.5 * L.pb);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) line(g, [M(1.4, 7.6), M(3.2, 9.05)], 1.0, LINE_LIGHT);
  }
  // side details
  line(gs, [S(-6.2, 0.04), S(-0.4, 0.04)], 1.4, LINE);
  line(gs, [S(0.4, -0.5), S(6.2, -0.5)], 1.4, LINE);
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-5.3, -0.38), S(-4.5, -0.12));
  rect(gs, S(1.4, -0.45), S(2.4, -0.1));
  rect(gs, S(4.3, -0.35), S(5.1, 0.05));
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
    g.moveTo(...S(5.86, 2.92));
    g.lineTo(...S(7.02, 2.92));
    g.lineTo(...S(7.0, 2.62));
    g.lineTo(...S(5.58, 2.62));
    g.closePath();
    g.fill();
  }
  L.sideText(team === 'blue' ? 'SK' : 'CP', 5.95, 1.75, 0.48 * ps, 'rgba(46,50,55,0.8)');
  L.sideText(team === 'blue' ? '201' : '312', 6.05, 1.28, 0.2 * ps, 'rgba(46,50,55,0.75)');
  L.sideDraw(-2.6, -0.12, (g, x, y) => roundel(g, team, x, y, 0.22 * ps));
  L.sideText(team === 'blue' ? 'SKYE STRIKE' : 'CAPRI STRIKE', 3.1, -0.22, 0.1 * ps, 'rgba(46,50,55,0.7)');
  L.sideText(team === 'blue' ? '201' : '312', -7.3, -0.05, 0.2 * ps, 'rgba(46,50,55,0.7)');
  L.sideDraw(-5.3, 0.3, (g, x, y) => {
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
    g.fillRect(...S(-0.8, 0.16), 0.05 * ps, 0.56 * ps);
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
  const paint = skinMaterial({ top: new THREE.Color('#858c92'), bottom: new THREE.Color('#a9afb3'), livery: L, roughness: 0.6, metalness: 0.04 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-9.3, -6.9, 32, 0.55, 0), stations(-6.9, -1.9, 60), stations(-1.9, 7.9, 90));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -9.0, 7.7, 40);

  // caret intakes under the LEX at the wing root: the top lip 8.8 m from the nose, the bottom lip raked
  // 0.65 m aft; the outer wall leans out; the trunk is the front of the nacelle and tucks into the body aft
  const IN_X = 0.42;
  const TB = curve([[-0.5, -0.58], [0.15, -0.6], [0.7, -0.64], [1.7, -0.75], [2.4, -0.78]]);
  const trunkLoop = (z: number) => {
    const yb = TB(z);
    const cy = (0.27 + yb) / 2;
    const hh = (0.27 - yb) / 2;
    const tuck = 0.05 * sstep(1.9, 2.4, z);
    return rrect(IN_X + 0.3825, cy, 0.3825 - tuck, hh - tuck, 0.07, 3).map(([x, y]) => [x + ((x - IN_X) / 0.765) * 0.065 * ((y - cy) / hh), y] as P2);
  };
  const trunk = intake({
    loop: trunkLoop,
    outer: stations(-0.5, 2.4, 40, 0.3, 0),
    lip: 0.04,
    depth: 1.9,
    n: 64,
    rake: (x, y) => 0.76 * (0.27 - y) + 0.2 * (x - IN_X),
    rakeFade: 1.6,
    fan: { cx: 0.74, cy: -0.14, r: 0.36 },
  });
  skin(both(trunk.skin));
  v.addMesh(both(trunk.duct), pm.duct);

  // --- canopy, seats, pilots
  v.cockpitEye.set(0, 1.1, -4.85);
  buildCanopy(v, CANOPY, -5.3, [-3.9]);
  for (const eye of [new THREE.Vector3(0, 1.1, -4.85), new THREE.Vector3(0, 1.15, -3.35)]) {
    addPilot(v, eye, 0.22, { style: 'us', stick: 'center', martinBaker: true });
  }
  const shroud = loftProfile({
    stations: stations(-5.85, -5.45, 6),
    profile: (z) => {
      const u = sstep(-5.85, -5.45, z);
      return [[0, 0.36], [0.35, 0.38], [0.4, 0.68], [0.29, 0.77 - u * 0.06], [0, 0.79 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));

  // --- wing: LEFs, flaps, ailerons, dog-tooth at the fold
  const panels = wingPanels(
    WING,
    [
      { x0: 2.05, x1: FOLD - 0.01, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.08, kind: 'lef', maxDeg: 25, leading: true },
      { x0: FOLD + 0.02, x1: 6.33, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.08, kind: 'lef', maxDeg: 25, leading: true },
      { x0: 1.5, x1: FOLD - 0.1, hinge: (x) => wte(x) - 0.95, kind: 'flap', maxDeg: 40 },
      { x0: FOLD + 0.08, x1: 6.3, hinge: (x) => wte(x) - 0.62, kind: 'aileron', maxDeg: 25 },
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
  const tipRail = join([roundBox(0.16, 0.13, 2.9, 0.035)]);
  tipRail.translate(6.46, WING_Y(6.46), 2.6);
  skin(both(tipRail));

  // --- stabilators
  const stab = wing({ sections: STAB, chordPts: 26, spanSub: 7, tip: 'round', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    v.addSurface(g, paint, new THREE.Vector3(1.2 * side, -0.06, STAB_PIVOT_Z), new THREE.Vector3(1, 0, 0), 'stab', side, 24);
  }

  // --- canted fins
  for (const side of [1, -1] as const) {
    const m = finMatrix(FIN_ROOT.x * side, FIN_ROOT.y, FIN_ROOT.cant, side);
    const f = finPanels(FIN, RUDDER, m, { chordPts: 28 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 28);
    const top = new THREE.Vector3(2.76, 0, 0).applyMatrix4(m);
    v.addNavLight(new THREE.Vector3(top.x, top.y, 6.6), 'formation');
    // the antenna and fuel-dump fairings on the trailing edge of each fin tip
    for (const [h, len] of [[2.7, 0.5], [2.52, 0.42], [2.36, 0.36]] as const) {
      const pod = lathe([[0.004, -len * 0.55], [0.04, -len * 0.3], [0.045, len * 0.25], [0.03, len * 0.5], [0.012, len * 0.55]], 10, 0, 0);
      const at = new THREE.Vector3(h, 0, 0).applyMatrix4(m);
      pod.translate(at.x, at.y, 6.98 + (h - 2.7) * 0.04);
      skin(pod);
    }
  }

  // --- engines, tail hook
  for (const sx of [-1, 1]) {
    const nz = nozzle({ cx: 0.56 * sx, cy: 0.03, z0: 7.85, z1: 8.5, r0: 0.49, r1: 0.38, petals: 12, saw: 0.07, floor: 7.92 });
    const nzOut = v.addMesh(nz.outer, pm.nozzle);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.nozzles.push({ pos: new THREE.Vector3(0.56 * sx, 0.03, 8.42), radius: 0.36, depth: 0.5, area: nz.area });
  }
  v.buildFlames(5.4);
  const hook = join([lathe([[0.04, 5.9], [0.05, 6.1], [0.05, 8.1], [0.03, 8.4]], 10, 0, -0.33)]);
  v.addMesh(hook, pm.darkMetal);

  // --- LEX spoilers (the Super Hornet's speedbrakes)
  const spoilers: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const g = roundBox(0.42, 0.025, 0.85, 0.008);
    g.translate(1.25 * sx, 0.445, -1.65);
    spoilers.push(stamp(g));
  }
  const sp = v.addSurface(join(spoilers), paint, new THREE.Vector3(0, 0.44, -2.08), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(sp), 1);
  v.speedbrake = { pivot: sp.pivot, axis: new THREE.Vector3(-1, 0, 0), maxDeg: 60 };

  // --- gun, probes, antennas, lights
  // the retractable refuelling probe lives under a hump on the right of the nose
  skin(lathe([[0.004, -6.75], [0.05, -6.55], [0.065, -6.15], [0.06, -5.8], [0.004, -5.6]], 14, 0.27, 0.6));
  const gun = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), pm.darkMetal);
  gun.position.set(0, 0.7, -6.45);
  gun.rotation.x = -1.2;
  v.body.add(gun);
  v.addMesh(join([
    probe(new THREE.Vector3(0.42, 0.1, -7.9), 0.3, 0.011, new THREE.Vector3(0.15, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.42, 0.1, -7.9), 0.3, 0.011, new THREE.Vector3(-0.15, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 1.1, 0.3), 0.22, 0.3),
    blade(new THREE.Vector3(0, 0.95, 2.4), 0.16, 0.24),
    blade(new THREE.Vector3(0, -0.46, -1.2), 0.2, 0.3, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.458, 0.12, -5.0), new THREE.Vector3(1, 0.1, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(-0.458, 0.12, -5.0), new THREE.Vector3(-1, 0.1, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(1.185, -0.2, 4.2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-1.185, -0.2, 4.2), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-6.5, 0.17, 1.4), 'red');
  v.addNavLight(new THREE.Vector3(6.5, 0.17, 1.4), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.92, 3.2), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -0.5, 1.2), 'strobe');

  // --- landing gear: twin-wheel nose leg with launch bar, trailing-arm mains
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.4, -3.6), axle: new THREE.Vector3(0, -1.95 + 0.28, -3.9), r: 0.28, w: 0.17, twin: true, retract: 'forward', launchBar: true },
    mains: { top: new THREE.Vector3(0.75, -0.7, 2.9), axle: new THREE.Vector3(1.58, -1.95 + 0.44, 2.4), r: 0.44, w: 0.27, retract: 'aft', outboard: 0, trailing: true },
    doorColor: '#a9afb3',
  });
}
