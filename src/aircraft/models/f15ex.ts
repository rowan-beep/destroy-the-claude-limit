// F-15EX Eagle II: 19.43 m long, 13.05 m span, 5.63 m tall.
// Two-seat cockpit under a big bubble canopy, raked rectangular intakes with
// the fuselage sides behind them carrying conformal fuel tanks, 45-degree
// cropped delta wing, twin fins on tail booms, dog-toothed stabilators and
// two F110 nozzles.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { Section } from './builder';
import {
  P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect,
  Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, deform, sstep, curve,
} from './kit';
import { nozzle, intake, partMaterials, seatAndPilot, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

/** 12 points on a circle (bottom centre -> top centre, right half). */
function circ(R: number, yc: number, sx = 1): P2[] {
  const ang = [-90, -72, -52, -34, -16, -4, 4, 16, 34, 52, 72, 90];
  return ang.map((a) => [R * sx * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}

// Main body: nose, cockpit well, dorsal hump, centre box between the trunks,
// twin nacelles. Right half, 12 control points, bottom centre to top centre.
const BODY = keyedProfile([
  { z: -9.86, pts: circ(0.012, -0.13) },
  { z: -9.55, pts: circ(0.19, -0.12) },
  { z: -9.0, pts: circ(0.35, -0.1) },
  { z: -8.3, pts: circ(0.48, -0.08) },
  { z: -7.4, pts: circ(0.6, -0.05) },
  {
    z: -6.75,
    pts: [[0, -0.7], [0.36, -0.68], [0.59, -0.54], [0.69, -0.32], [0.715, -0.14], [0.725, -0.1], [0.715, -0.05], [0.68, 0.18], [0.62, 0.42], [0.5, 0.55], [0.26, 0.58], [0, 0.59]],
  },
  {
    z: -6.35,
    pts: [[0, -0.74], [0.38, -0.73], [0.62, -0.58], [0.73, -0.34], [0.76, -0.14], [0.775, -0.1], [0.765, -0.05], [0.72, 0.2], [0.64, 0.46], [0.58, 0.58], [0.42, 0.44], [0, 0.34]],
  },
  {
    z: -5.5,
    pts: [[0, -0.79], [0.41, -0.78], [0.67, -0.63], [0.78, -0.36], [0.8, -0.15], [0.815, -0.1], [0.805, -0.05], [0.76, 0.22], [0.66, 0.5], [0.6, 0.6], [0.5, 0.3], [0, 0.14]],
  },
  {
    z: -4.4,
    pts: [[0, -0.8], [0.43, -0.8], [0.7, -0.67], [0.83, -0.4], [0.87, -0.18], [0.88, -0.11], [0.875, -0.03], [0.83, 0.24], [0.7, 0.52], [0.6, 0.6], [0.5, 0.3], [0, 0.12]],
  },
  {
    z: -3.45,
    pts: [[0, -0.8], [0.47, -0.8], [0.76, -0.69], [0.9, -0.43], [0.94, -0.2], [0.95, -0.1], [0.945, 0.0], [0.9, 0.26], [0.76, 0.52], [0.58, 0.63], [0.44, 0.45], [0, 0.4]],
  },
  {
    z: -2.75,
    pts: [[0, -0.8], [0.5, -0.8], [0.8, -0.7], [0.95, -0.45], [0.99, -0.2], [1.0, -0.1], [0.995, 0.02], [0.95, 0.28], [0.8, 0.5], [0.6, 0.64], [0.3, 0.73], [0, 0.75]],
  },
  {
    z: -1.4,
    pts: [[0, -0.8], [0.62, -0.82], [1.02, -0.8], [1.3, -0.62], [1.4, -0.34], [1.43, -0.1], [1.43, 0.06], [1.4, 0.26], [1.26, 0.44], [0.92, 0.56], [0.42, 0.66], [0, 0.7]],
  },
  {
    z: 0.4,
    pts: [[0, -0.64], [0.46, -0.66], [0.95, -0.84], [1.5, -0.87], [1.86, -0.74], [1.95, -0.44], [1.965, -0.1], [1.955, 0.1], [1.88, 0.3], [1.55, 0.44], [0.8, 0.56], [0, 0.63]],
  },
  {
    z: 3.3,
    pts: [[0, -0.6], [0.45, -0.62], [0.95, -0.78], [1.48, -0.8], [1.83, -0.68], [1.92, -0.42], [1.94, -0.12], [1.93, 0.08], [1.86, 0.26], [1.52, 0.4], [0.8, 0.52], [0, 0.57]],
  },
  {
    z: 5.4,
    pts: [[0, -0.46], [0.3, -0.56], [0.66, -0.7], [1.06, -0.63], [1.42, -0.42], [1.55, -0.14], [1.56, 0.0], [1.52, 0.18], [1.34, 0.38], [0.98, 0.5], [0.46, 0.53], [0, 0.5]],
  },
  {
    z: 7.4,
    pts: [[0, -0.38], [0.24, -0.57], [0.64, -0.68], [1.0, -0.57], [1.23, -0.31], [1.28, -0.07], [1.28, 0.02], [1.23, 0.22], [1.0, 0.46], [0.64, 0.56], [0.3, 0.48], [0, 0.38]],
  },
  {
    z: 8.75,
    pts: [[0, -0.28], [0.2, -0.5], [0.64, -0.655], [1.0, -0.54], [1.2, -0.3], [1.245, -0.07], [1.245, 0.0], [1.2, 0.2], [1.0, 0.44], [0.64, 0.555], [0.28, 0.44], [0, 0.26]],
  },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

const CANOPY: Section[] = [
  { z: -7.15, w: 0.03, top: 0.02, bot: 0.02, y: 0.56, n: 2 },
  { z: -6.6, w: 0.4, top: 0.36, bot: 0.03, y: 0.58, n: 2.2 },
  { z: -6.0, w: 0.52, top: 0.56, bot: 0.03, y: 0.58, n: 2.2 },
  { z: -5.3, w: 0.56, top: 0.62, bot: 0.03, y: 0.6, n: 2.2 },
  { z: -4.2, w: 0.54, top: 0.6, bot: 0.03, y: 0.6, n: 2.2 },
  { z: -3.1, w: 0.44, top: 0.38, bot: 0.03, y: 0.62, n: 2.2 },
  { z: -2.5, w: 0.22, top: 0.1, bot: 0.03, y: 0.66, n: 2 },
];

// Planforms (body frame x, z)
const WING: WingStation[] = [
  { x: 1.7, le: -2.75, te: 4.36, y: 0.24, t: 0.066 },
  { x: 2.0, le: -2.45, te: 4.36, y: 0.235, t: 0.064 },
  { x: 4.15, le: -0.3, te: 4.36, y: 0.2, t: 0.05 },
  { x: 6.2, le: 1.75, te: 4.34, y: 0.165, t: 0.034 },
  { x: 6.525, le: 2.08, te: 2.62, y: 0.16, t: 0.03 },
];
const FLAP = { x0: 2.02, x1: 4.12, hinge: (x: number) => 3.42 + (x - 2.02) * 0.01 };
const AIL = { x0: 4.2, x1: 6.1, hinge: (x: number) => 3.6 + (x - 4.2) * 0.07 };
const STAB: WingStation[] = [
  { x: 1.7, le: 6.2, te: 9.3, y: -0.02, t: 0.045 },
  { x: 2.36, le: 6.86, te: 9.33, y: -0.02, t: 0.044 },
  { x: 2.37, le: 6.62, te: 9.33, y: -0.02, t: 0.044 },
  { x: 4.3, le: 8.56, te: 9.62, y: -0.02, t: 0.032 },
];
const STAB_PIVOT_Z = 7.75;
// fin in its own frame: x = height above the boom, (le, te) in body z
const FIN: WingStation[] = [
  { x: 0, le: 4.75, te: 8.4, t: 0.05 },
  { x: 3.18, le: 7.1, te: 8.3, t: 0.034 },
];
const FIN_ROOT = { x: 1.62, y: 0.38, cant: 0 };
const RUDDER = { h0: 0.12, h1: 1.95, hinge: (h: number) => 7.62 + h * 0.02 };

function livery(team: string, withCamo = true): Livery {
  const L = new Livery({ half: 10.5, z0: -10.6, len: 21, y0: -2.4, height: 6.4 });
  const { gt, gb, gs } = L;
  const rnd = prng(15);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt;
  const ps = L.ps;
  const camo = 'rgba(74,80,87,0.7)';
  // --- Mod Eagle two-tone camouflage on top -------------------------------
  const blob = (g: CanvasRenderingContext2D, pts: P2[], col: string) => {
    g.fillStyle = col;
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
    g.closePath();
    g.fill();
  };
  for (const sx of [-1, 1]) {
    if (withCamo) blob(gt, [T(2.1 * sx, -0.4), T(4.4 * sx, 1.6), T(5.1 * sx, 3.7), T(3.2 * sx, 4.0), T(2.2 * sx, 2.4)], camo);
    if (withCamo) blob(gt, [T(0.9 * sx, 3.2), T(1.9 * sx, 4.6), T(2.6 * sx, 8.4), T(1.1 * sx, 8.9), T(0.3 * sx, 6.0)], camo);
    if (withCamo) blob(gt, [T(1.2 * sx, -3.8), T(1.95 * sx, -1.2), T(1.5 * sx, 0.4), T(0.95 * sx, -1.4)], camo);
  }
  if (withCamo) blob(gs, [S(-3.2, -0.9), S(-0.4, -0.9), S(1.8, 0.55), S(-1.6, 0.6)], camo);
  if (withCamo) blob(gs, [S(3.4, -0.7), S(6.8, -0.6), S(7.6, 0.5), S(4.4, 0.6)], camo);
  if (withCamo) blob(gs, [S(5.0, 1.0), S(7.6, 1.2), S(8.2, 3.4), S(6.4, 3.5)], camo);
  // radome and anti-glare panel
  gt.fillStyle = 'rgba(112,118,122,0.85)';
  gt.beginPath();
  gt.ellipse(...T(0, -8.6), 0.62 * pt, 1.3 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gs.fillStyle = 'rgba(112,118,122,0.85)';
  gs.beginPath();
  gs.moveTo(...S(-9.9, -0.12));
  gs.lineTo(...S(-7.36, 0.6));
  gs.lineTo(...S(-7.36, -0.7));
  gs.closePath();
  gs.fill();
  gt.fillStyle = 'rgba(38,41,45,0.8)';
  gt.beginPath();
  gt.moveTo(...T(-0.42, -6.7));
  gt.lineTo(...T(0.42, -6.7));
  gt.lineTo(...T(0.2, -7.6));
  gt.lineTo(...T(-0.2, -7.6));
  gt.closePath();
  gt.fill();
  // cockpit well (seen through the canopy)
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.fillRect(...T(-0.52, -6.45), 1.04 * pt, 3.3 * pt);
  // --- panel lines ----------------------------------------------------------
  const frames = [-7.36, -6.4, -3.3, -1.9, -0.2, 1.4, 2.9, 4.4, 5.9, 7.3, 8.3];
  for (const z of frames) {
    line(gt, [T(-1.9, z), T(1.9, z)], 1.4, LINE_LIGHT);
    line(gs, [S(z, -0.9), S(z, 0.75)], 1.6, LINE);
    line(gb, [B(-1.9, z), B(1.9, z)], 1.2, LINE_LIGHT);
  }
  // chine and longerons
  line(gs, [S(-7.36, -0.1), S(-4.6, -0.1)], 1.6, LINE);
  line(gs, [S(-4.9, 0.36), S(1.5, 0.3), S(5.6, 0.2), S(8.6, 0.2)], 1.4, LINE);
  line(gs, [S(-4.4, -0.95), S(3.8, -0.86), S(7.8, -0.6)], 1.4, LINE);
  for (const sx of [-1, 1]) {
    line(gt, [T(0.62 * sx, -2.4), T(0.62 * sx, 0.3)], 1.4, LINE); // speedbrake
    line(gt, [T(0.45 * sx, 0.6), T(0.4 * sx, 6.2)], 1.2, LINE_LIGHT);
    line(gt, [T(1.3 * sx, -4.6), T(1.4 * sx, 5.2)], 1.2, LINE_LIGHT);
    line(gt, [T(0.64 * sx, 5.8), T(0.64 * sx, 8.7)], 1.2, LINE_LIGHT);
  }
  line(gt, [T(-0.62, -2.4), T(0.62, -2.4)], 1.4, LINE);
  line(gt, [T(-0.62, 0.3), T(0.62, 0.3)], 1.4, LINE);
  // access panels (fuselage sides and top)
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-6.1, -0.55), S(-5.3, -0.2));
  rect(gs, S(-3.0, 0.1), S(-2.2, 0.45));
  rect(gs, S(1.8, -0.5), S(2.6, -0.1));
  rect(gs, S(4.9, -0.2), S(5.6, 0.15));
  rect(gs, S(6.6, -0.45), S(7.1, -0.05));
  rect(gt, T(-0.3, 2.2), T(0.3, 3.0));
  rect(gt, T(-0.3, 4.2), T(0.3, 4.9));
  // --- wings -----------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    const le = (x: number) => curve([[2.0, -2.45], [6.2, 1.75]])(x);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      // spars
      line(g, [M(2.0, le(2.0) + 0.9), M(6.1, le(6.1) + 0.3)], 1.3, LINE);
      line(g, [M(2.0, 2.6), M(6.1, 3.4)], 1.3, LINE);
      // leading edge panel and ribs
      line(g, [M(2.0, le(2.0) + 0.25), M(6.2, le(6.2) + 0.1)], 1.1, LINE_LIGHT);
      for (const x of [2.8, 3.5, 4.15, 4.9, 5.6]) line(g, [M(x, le(x) + 0.25), M(x, x < 4.15 ? FLAP.hinge(x) : AIL.hinge(x))], 1.0, LINE_LIGHT);
      // flap and aileron outlines
      line(g, [M(FLAP.x0, FLAP.hinge(FLAP.x0)), M(FLAP.x1, FLAP.hinge(FLAP.x1))], 1.6, LINE);
      line(g, [M(AIL.x0, AIL.hinge(AIL.x0)), M(AIL.x1, AIL.hinge(AIL.x1))], 1.6, LINE);
      rivets(g, M(2.0, le(2.0) + 0.9), M(6.1, le(6.1) + 0.3), 7, 0.9);
      rivets(g, M(2.0, 2.6), M(6.1, 3.4), 7, 0.9);
    }
    // walkway and NO STEP
    line(gt, [W(1.95, 0.2), W(2.9, 1.2), W(2.9, 3.1), W(1.95, 3.1)], 1.2, 'rgba(25,27,30,0.45)');
    const [nx, ny] = W(4.4, 2.3);
    gt.save();
    gt.translate(nx, ny);
    gt.fillStyle = 'rgba(28,30,33,0.55)';
    gt.font = `bold ${0.16 * pt}px Arial`;
    gt.textAlign = 'center';
    gt.fillText('NO STEP', 0, 0);
    gt.restore();
    // insignia on the left upper / right lower wing (USAF practice)
    if (sx < 0) roundel(gt, team, ...W(4.6, 2.2), 0.6 * pt);
    else roundel(gb, team, ...Wb(4.6, 2.2), 0.6 * L.pb);
    // stabilators
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(2.37, 6.9), M(4.2, 8.75)], 1.1, LINE_LIGHT);
      line(g, [M(2.0, 8.6), M(4.2, 9.35)], 1.1, LINE_LIGHT);
    }
  }
  // weathering everywhere
  weather(gt, L.top.width, L.top.height, rnd, 1.1, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.8, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 1.0, [1, 0.1]);
  // exhaust soot on the nacelles and booms
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(0.64 * sx, 8.6);
      const grd = g.createLinearGradient(x, y - 2.2 * s, x, y);
      grd.addColorStop(0, 'rgba(40,36,30,0)');
      grd.addColorStop(1, 'rgba(40,36,30,0.35)');
      g.fillStyle = grd;
      g.fillRect(x - 0.62 * s, y - 2.2 * s, 1.24 * s, 2.2 * s);
    }
  }
  // --- markings on the sides (both canvases) ---------------------------------
  L.copySides();
  const teamCol = team === 'blue' ? '#2d4d8e' : '#9a2521';
  // fin: tip band, tail code, serial
  for (const g of [L.gs, L.gr]) {
    g.fillStyle = teamCol;
    g.beginPath();
    g.moveTo(...S(6.98, 3.55));
    g.lineTo(...S(8.35, 3.55));
    g.lineTo(...S(8.36, 3.2));
    g.lineTo(...S(6.72, 3.2));
    g.closePath();
    g.fill();
  }
  L.sideText(team === 'blue' ? 'SK' : 'CP', 7.1, 2.35, 0.62 * ps, 'rgba(34,37,41,0.85)');
  L.sideText(team === 'blue' ? 'AF 20-0015' : 'AF 21-0302', 7.35, 1.55, 0.13 * ps, 'rgba(34,37,41,0.8)');
  L.sideText(team === 'blue' ? 'SKYE WING' : 'CAPRI WING', 7.25, 1.3, 0.1 * ps, 'rgba(34,37,41,0.7)');
  L.sideDraw(-2.6, -0.1, (g, x, y) => roundel(g, team, x, y, 0.36 * ps));
  L.sideText('EX', -2.6, -0.62, 0.12 * ps, 'rgba(34,37,41,0.7)');
  // canopy rescue and ejection-seat warnings
  L.sideDraw(-6.25, 0.28, (g, x, y) => {
    g.fillStyle = '#c9402c';
    g.beginPath();
    g.moveTo(x, y - 0.12 * ps);
    g.lineTo(x + 0.12 * ps, y + 0.1 * ps);
    g.lineTo(x - 0.12 * ps, y + 0.1 * ps);
    g.closePath();
    g.fill();
  });
  L.sideText('RESCUE', -5.4, 0.36, 0.07 * ps, '#c9402c');
  // intake danger band
  for (const g of [L.gs, L.gr]) {
    g.fillStyle = 'rgba(190,48,40,0.8)';
    g.fillRect(...S(-4.45, 0.3), 0.06 * ps, 1.1 * ps);
  }
  L.sideText('DANGER', -3.95, -0.55, 0.08 * ps, 'rgba(190,48,40,0.8)');
  return L;
}

const liveries = new Map<string, Livery>();
const plain = new Map<string, Livery>();

/** Markings without the factory two-tone camouflage (under a custom paint job). */
export function f15PlainLivery(team: string): Livery {
  let L = plain.get(team);
  if (!L) {
    L = livery(team, false);
    plain.set(team, L);
  }
  return L;
}

export function buildF15EX(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#61686f'), bottom: new THREE.Color('#7f868c'), livery: L, roughness: 0.55, metalness: 0.2 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  // --- fuselage ---------------------------------------------------------------
  const zs = mergeStations(stations(-9.86, -7.4, 34, 0.55, 0), stations(-7.4, -2.5, 60), stations(-2.5, 8.75, 90));
  const body = loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true });
  skin(body);
  v.fuselageSections = sectionsFromProfile(BODY, -9.5, 8.5, 40);

  // intake trunks: raked mouths, splitter gap to the fuselage, duct to the fan
  const TRUNK_W = curve([[-4.8, 0.5], [-2.0, 0.52], [1.6, 0.5]]);
  const TRUNK_H = curve([[-4.8, 0.66], [-2.0, 0.63], [1.6, 0.56]]);
  const TRUNK_Y = curve([[-4.8, -0.3], [-2.0, -0.27], [1.6, -0.25]]);
  const trunkLoop = (z: number) => rrect(1.43, TRUNK_Y(z), TRUNK_W(z), TRUNK_H(z), 0.16, 3);
  const MOUTH = -4.72;
  const rake = (_x: number, y: number) => -0.42 * (y + 0.3);
  const trunk = intake({
    loop: trunkLoop,
    outer: stations(MOUTH, 1.6, 50, 0.3, 0),
    lip: 0.055,
    depth: 2.2,
    n: 72,
    rake,
    fan: { cx: 1.25, cy: -0.22, r: 0.44 },
  });
  skin(both(trunk.skin));
  v.addMesh(both(trunk.duct), pm.duct);

  // conformal fuel tanks on the outside of each trunk
  const CFT_W = curve([[-2.9, 0.04], [-2.2, 0.22], [-1.2, 0.3], [3.2, 0.3], [4.3, 0.2], [4.9, 0.03]]);
  const CFT_H = curve([[-2.9, 0.05], [-2.2, 0.28], [-1.2, 0.36], [3.2, 0.35], [4.3, 0.24], [4.9, 0.04]]);
  const cft = loftProfile({
    stations: stations(-2.9, 4.9, 60, 0.2, 0.2),
    profile: (z) => rrect(1.93, -0.44, CFT_W(z), CFT_H(z), Math.min(CFT_W(z), CFT_H(z)) * 0.7, 3),
    sub: 2,
    full: true,
    capStart: true,
    capEnd: true,
  });
  skin(both(cft));

  // tail booms outboard of the nacelles (fins and stabilators hang off them)
  const BOOM_W = curve([[3.6, 0.3], [5.0, 0.16], [8.8, 0.13], [9.6, 0.02]]);
  const BOOM_T = curve([[3.6, 0.44], [5.0, 0.44], [8.6, 0.38], [9.6, 0.12]]);
  const BOOM_B = curve([[3.6, -0.5], [5.0, -0.34], [8.6, -0.26], [9.6, -0.04]]);
  const boom = loftProfile({
    stations: stations(3.6, 9.6, 50, 0, 0.3),
    profile: (z) => {
      const w = BOOM_W(z), t = BOOM_T(z), b = BOOM_B(z);
      return [[1.62, b], [1.62 + w * 0.8, b + 0.02], [1.62 + w, (t + b) * 0.5], [1.62 + w * 0.8, t - 0.02], [1.62, t], [1.62 - w * 0.8, t - 0.02], [1.62 - w, (t + b) * 0.5], [1.62 - w * 0.8, b + 0.02]] as P2[];
    },
    sub: 3,
    full: true,
    capStart: true,
    capEnd: true,
  });
  skin(both(boom));

  // dorsal hump / speedbrake: the hump is part of the body; the speedbrake is a shell on it
  const SB = keyedProfile([
    { z: -2.35, pts: [[0, 0.745], [0.3, 0.73], [0.55, 0.66], [0.6, 0.64], [0.56, 0.68], [0.3, 0.765], [0, 0.78]] },
    { z: -1.0, pts: [[0, 0.715], [0.35, 0.69], [0.6, 0.6], [0.64, 0.58], [0.6, 0.62], [0.35, 0.73], [0, 0.745]] },
    { z: 0.3, pts: [[0, 0.64], [0.35, 0.615], [0.6, 0.545], [0.64, 0.53], [0.6, 0.565], [0.35, 0.65], [0, 0.668]] },
  ]);
  const sbGeo = stamp(loftProfile({ stations: stations(-2.35, 0.3, 24), profile: SB, sub: 4, capStart: true, capEnd: true }));
  const sb = v.addSurface(sbGeo, paint, new THREE.Vector3(0, 0.74, -2.35), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(sb), 1);
  v.speedbrake = { pivot: sb.pivot, axis: new THREE.Vector3(-1, 0, 0), maxDeg: 45 };

  // --- canopy, seats, pilots -------------------------------------------------------
  v.cockpitEye.set(0, 0.95, -5.55);
  buildCanopy(v, CANOPY, -6.05, [-4.75], paint);
  for (const eye of [new THREE.Vector3(0, 0.95, -5.55), new THREE.Vector3(0, 1.0, -4.1)]) {
    const sp = seatAndPilot(eye, 0.2, false);
    const meshes = [v.addMesh(sp.seat, pm.seat), v.addMesh(sp.flight, pm.flight), v.addMesh(sp.helmet, pm.helmet), v.addMesh(sp.visor, pm.visor)];
    v.hideInCockpit.push(...meshes);
  }
  // instrument panel shroud / glareshield at the front of the well
  const shroud = loftProfile({
    stations: stations(-6.55, -6.1, 6),
    profile: (z) => {
      const u = sstep(-6.55, -6.1, z);
      return [[0, 0.18], [0.44, 0.2], [0.5, 0.52], [0.36, 0.62 - u * 0.06], [0, 0.64 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  const sh = v.addMesh(shroud, pm.seat);
  v.hideInCockpit.push(sh);

  // --- wings --------------------------------------------------------------------------
  const panels = wingPanels(WING, [
    { x0: FLAP.x0, x1: FLAP.x1, hinge: FLAP.hinge, kind: 'flap', maxDeg: 30 },
    { x0: AIL.x0, x1: AIL.x1, hinge: AIL.hinge, kind: 'aileron', maxDeg: 20 },
  ], { chordPts: 34, thickPos: 0.4 });
  skin(both(panels.fixed));
  for (const cs of panels.moving) {
    for (const side of [1, -1] as const) {
      const g = stamp(side > 0 ? cs.geo.clone() : mirror(cs.geo));
      const a = cs.axis.clone();
      if (side < 0) a.x = -a.x;
      v.addSurface(g, paint, new THREE.Vector3(cs.hinge.x * side, cs.hinge.y, cs.hinge.z), side > 0 ? a : a.negate(), cs.kind, side, cs.maxDeg);
    }
  }

  // stabilators (all-moving, pivot on the booms)
  const stab = wing({ sections: STAB, chordPts: 26, spanSub: 7, tip: 'round', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    v.addSurface(g, paint, new THREE.Vector3(1.9 * side, -0.02, STAB_PIVOT_Z), new THREE.Vector3(1, 0, 0), 'stab', side, 22);
  }

  // fins with rudders
  for (const side of [1, -1] as const) {
    const m = finMatrix(FIN_ROOT.x * side, FIN_ROOT.y, FIN_ROOT.cant, side);
    const f = finPanels(FIN, RUDDER, m, { chordPts: 28 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 25);
    // antenna fairings on the fin tips
    const tipBase = new THREE.Vector3(0, 0, 0).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0));
    void tipBase;
    const top = new THREE.Vector3(3.17, 0, 0).applyMatrix4(m);
    const pod = lathe(
      [
        [0.005, 7.35],
        [0.06, 7.55],
        [0.075, 8.0],
        [0.07, 8.55],
        [0.04, 8.85],
        [0.005, 8.95],
      ],
      14,
      top.x,
      top.y,
    );
    skin(pod);
    v.addNavLight(new THREE.Vector3(top.x, top.y + 0.02, 8.6), 'formation');
  }

  // --- engines -----------------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const nz = nozzle({ cx: 0.64 * sx, cy: -0.05, z0: 8.62, z1: 9.5, r0: 0.6, r1: 0.5, petals: 14, saw: 0.08, floor: 8.77 });
    v.addMesh(nz.outer, pm.nozzle);
    v.addMesh(nz.inner, pm.nozzleIn).userData.detail = true;
    v.nozzles.push({ pos: new THREE.Vector3(0.64 * sx, -0.05, 9.4), radius: 0.46, depth: 0.62 });
  }
  v.buildFlames(6.2);

  // --- gun, probes, antennas, lights ----------------------------------------------------
  // M61 port on the right wing root
  const gunFair = deform(lathe([[0.005, -1.35], [0.06, -1.22], [0.07, -0.9], [0.05, -0.5], [0.005, -0.3]], 14, 1.98, 0.3), (p) => {
    p.y = Math.max(p.y, 0.27);
  });
  skin(gunFair);
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), pm.darkMetal);
  muzzle.position.set(1.98, 0.31, -1.3);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);
  const probes = join([
    probe(new THREE.Vector3(0.45, 0.12, -8.2), 0.5, 0.012, new THREE.Vector3(0.1, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.45, 0.12, -8.2), 0.5, 0.012, new THREE.Vector3(-0.1, 0, -1).normalize()),
    probe(new THREE.Vector3(0.55, -0.2, -7.5), 0.18, 0.01, new THREE.Vector3(1, 0, -0.8).normalize()),
    probe(new THREE.Vector3(-0.55, -0.2, -7.5), 0.18, 0.01, new THREE.Vector3(-1, 0, -0.8).normalize()),
  ]);
  v.addMesh(probes, pm.antenna);
  const ant = join([
    blade(new THREE.Vector3(0, 0.66, 1.2), 0.22, 0.32),
    blade(new THREE.Vector3(0, 0.6, 3.6), 0.16, 0.26),
    blade(new THREE.Vector3(0, -0.62, 1.8), 0.22, 0.3, new THREE.Vector3(0, -1, 0)),
    blade(new THREE.Vector3(0, -0.78, -3.2), 0.16, 0.24, new THREE.Vector3(0, -1, 0)),
  ]);
  v.addMesh(ant, pm.antenna);
  const fl = join([
    formationStrip(new THREE.Vector3(0.768, 0.2, -5.6), new THREE.Vector3(1, 0.2, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-0.768, 0.2, -5.6), new THREE.Vector3(-1, 0.2, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(2.23, -0.44, 3.0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
    formationStrip(new THREE.Vector3(-2.23, -0.44, 3.0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
  ]);
  v.addMesh(fl, pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-6.5, 0.17, 3.45), 'red');
  v.addNavLight(new THREE.Vector3(6.5, 0.17, 3.45), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.66, 4.8), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -0.66, 1.0), 'strobe');

  // --- landing gear ----------------------------------------------------------------------
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.66, -5.2), axle: new THREE.Vector3(0, -2.05 + 0.33, -5.55), r: 0.33, w: 0.19, twin: false, retract: 'forward' },
    mains: { top: new THREE.Vector3(1.3, -0.78, 0.8), axle: new THREE.Vector3(1.42, -2.05 + 0.43, 1.2), r: 0.43, w: 0.27, retract: 'forward', outboard: 0.12 },
    doorColor: '#6c7379',
  });
}
