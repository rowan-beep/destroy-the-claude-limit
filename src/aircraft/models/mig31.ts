// Mikoyan MiG-31BM Foxhound: 22.7 m long, 13.5 m span, 6.15 m tall.
// A MiG-25 grown into a two-seat interceptor: a long, straight radome for
// the Zaslon-M, a tandem cockpit under two separate hinged canopies, huge
// box intakes on the fuselage sides (the top lip leads, the mouth rakes back
// underneath, with a splitter plate standing off the fuselage), trunks that
// run back into two round D-30F6 nacelles, a shoulder wing with small root
// extensions and 4 deg of anhedral, twin fins canted outward, two ventral
// fins, all-moving tailplanes, and two big heat-tinted nozzles. Four R-37M
// ride half-sunk under the flat belly between the intake trunks; the
// GSh-6-23M sits in a fairing low on the right, ahead of the main gear.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section, sectionAt, sectionPoint } from './builder';
import {
  P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect,
  Livery, skinMaterial, line, rivets, weather, prng, LINE, LINE_LIGHT, curve, sstep, roundBox,
} from './kit';
import { nozzle, intake, partMaterials, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

function circ(R: number, yc: number): P2[] {
  const ang = [-90, -72, -52, -34, -16, -4, 4, 16, 34, 52, 72, 90];
  return ang.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}

// Central fuselage, right half, 12 points bottom centre -> top centre. The
// intake trunks and nacelles are their own lofts either side of it.
// The forward fuselage behind the radome is the Foxhound's own: slab sides
// leaning in toward a rounded top, a flat belly and a sharp chine where they
// meet, running back into the intake boxes.
function chined(hw: number, yb: number, yt: number): P2[] {
  const ys = yt * 0.35;
  return [
    [0, yb], [0.6 * hw, yb], [0.94 * hw, yb + 0.02], [hw, yb + 0.06], [0.98 * hw, yb + 0.35 * (ys - yb)], [0.965 * hw, yb + 0.7 * (ys - yb)],
    [0.95 * hw, ys], [0.88 * hw, ys + 0.32 * (yt - ys)], [0.74 * hw, ys + 0.6 * (yt - ys)], [0.53 * hw, ys + 0.81 * (yt - ys)], [0.27 * hw, ys + 0.95 * (yt - ys)], [0, yt],
  ];
}
const BODY = keyedProfile([
  // long, slender radome for the Zaslon-M, drooped a touch
  { z: -11.1, pts: circ(0.012, -0.03) },
  { z: -10.7, pts: circ(0.15, -0.025) },
  { z: -10.0, pts: circ(0.31, -0.015) },
  { z: -9.2, pts: circ(0.45, 0.0) },
  { z: -8.4, pts: circ(0.555, 0.01) },
  { z: -7.95, pts: chined(0.62, -0.6, 0.6) },
  { z: -7.2, pts: chined(0.69, -0.66, 0.61) },
  { z: -6.4, pts: chined(0.77, -0.75, 0.63) },
  { z: -5.3, pts: [[0, -0.9], [0.42, -0.9], [0.7, -0.82], [0.8, -0.6], [0.83, -0.3], [0.84, 0.0], [0.83, 0.2], [0.78, 0.4], [0.67, 0.53], [0.5, 0.63], [0.28, 0.67], [0, 0.68]] },
  { z: -3.8, pts: [[0, -1.0], [0.45, -1.0], [0.8, -0.97], [0.88, -0.72], [0.9, -0.36], [0.9, 0.0], [0.9, 0.28], [0.9, 0.44], [0.74, 0.6], [0.5, 0.71], [0.26, 0.75], [0, 0.76]] },
  { z: -1.0, pts: [[0, -1.02], [0.45, -1.02], [0.8, -1.0], [0.9, -0.8], [0.9, -0.4], [0.9, 0.0], [0.9, 0.3], [0.9, 0.45], [0.72, 0.58], [0.48, 0.66], [0.25, 0.7], [0, 0.71]] },
  { z: 2.8, pts: [[0, -1.0], [0.45, -1.0], [0.78, -0.98], [0.88, -0.78], [0.9, -0.4], [0.9, 0.0], [0.9, 0.28], [0.9, 0.42], [0.72, 0.54], [0.48, 0.6], [0.25, 0.63], [0, 0.64]] },
  { z: 5.5, pts: [[0, -0.95], [0.3, -0.95], [0.55, -0.9], [0.62, -0.7], [0.64, -0.4], [0.64, -0.1], [0.64, 0.2], [0.64, 0.38], [0.5, 0.5], [0.34, 0.56], [0.18, 0.58], [0, 0.59]] },
  { z: 7.5, pts: [[0, -0.75], [0.15, -0.75], [0.3, -0.7], [0.36, -0.55], [0.38, -0.3], [0.38, -0.05], [0.38, 0.15], [0.38, 0.32], [0.3, 0.42], [0.2, 0.46], [0.1, 0.48], [0, 0.48]] },
  { z: 9.3, pts: [[0, -0.42], [0.08, -0.42], [0.15, -0.38], [0.18, -0.3], [0.2, -0.2], [0.2, -0.1], [0.2, 0.0], [0.2, 0.1], [0.16, 0.18], [0.1, 0.21], [0.05, 0.22], [0, 0.22]] },
  { z: 9.8, pts: circ(0.05, -0.1) },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 2, 2, 3, 3, 3, 4];

// two canopies in tandem, low and squared off: a framed windscreen, the
// pilot's hood, then the operator's hood, which is mostly metal with small
// side windows and runs straight into a raised dorsal spine
const CANOPY: Section[] = [
  { z: -8.1, w: 0.03, top: 0.02, bot: 0.02, y: 0.57, n: 2 },
  { z: -7.7, w: 0.4, top: 0.3, bot: 0.03, y: 0.58, n: 2.8 },
  { z: -7.2, w: 0.5, top: 0.52, bot: 0.03, y: 0.6, n: 3.2 },
  { z: -6.5, w: 0.52, top: 0.61, bot: 0.03, y: 0.6, n: 3.4 },
  { z: -5.8, w: 0.52, top: 0.62, bot: 0.03, y: 0.61, n: 3.4 },
  { z: -5.0, w: 0.52, top: 0.6, bot: 0.03, y: 0.62, n: 3.4 },
  { z: -4.3, w: 0.5, top: 0.55, bot: 0.03, y: 0.64, n: 3.2 },
  { z: -3.8, w: 0.44, top: 0.48, bot: 0.03, y: 0.66, n: 3 },
];
// the dorsal spine behind the canopies: height of its top, half-width
const SPINE_TOP = curve([[-4.0, 1.13], [-2.0, 1.0], [0.0, 0.85], [1.4, 0.74], [2.2, 0.68]]);
const SPINE_W = curve([[-4.0, 0.45], [-2.0, 0.42], [0.0, 0.36], [1.4, 0.3], [2.2, 0.26]]);

// shoulder wing: small root extension, 41 deg leading edge, anhedral
const wle = (x: number) => -1.0 + (x - 2.7) * 0.87;
const wte = (x: number) => 4.9 - (x - 2.0) * 0.08;
const DROOP = Math.tan(4 * (Math.PI / 180));
const wy = (x: number) => 0.3 - (x - 2.0) * DROOP;
const WING: WingStation[] = [
  { x: 1.9, le: -3.0, te: wte(1.9), y: wy(1.9), t: 0.05 },
  { x: 2.25, le: -1.9, te: wte(2.25), y: wy(2.25), t: 0.05 },
  { x: 2.7, le: wle(2.7), te: wte(2.7), y: wy(2.7), t: 0.048 },
  { x: 6.73, le: wle(6.73), te: wte(6.73), y: wy(6.73), t: 0.03 },
];
// all-moving tailplanes on the nacelle sides
const STAB: WingStation[] = [
  { x: 1.55, le: 7.3, te: 10.15, y: -0.15, t: 0.045 },
  { x: 4.4, le: 9.45, te: 10.6, y: -0.25, t: 0.03 },
];
const STAB_PIVOT_Z = 9.0;
// twin fins, canted 8 deg outboard; in their own frame x = height
const FIN: WingStation[] = [
  { x: 0, le: 4.9, te: 9.55, t: 0.05 },
  { x: 0.5, le: 6.3, te: 9.6, t: 0.047 },
  { x: 3.1, le: 8.55, te: 10.0, t: 0.032 },
];
const RUDDER = { h0: 0.45, h1: 2.75, hinge: (h: number) => 9.05 + h * 0.07 };
const FIN_X = 1.45;
const FIN_Y = 0.36;
const VENTRAL: WingStation[] = [
  { x: 0, le: 6.9, te: 9.6, t: 0.05 },
  { x: 0.85, le: 8.1, te: 9.55, t: 0.04 },
];
const NAC_X = 0.95;
const NOZZLE_Z = 9.3;

// intake trunk / nacelle loop: a tall box at the mouth, round at the nozzle
const TX = curve([[-5.3, 1.42], [0.0, 1.42], [3.5, 1.36], [6.5, 1.06], [9.3, NAC_X]]);
const TW = curve([[-5.3, 0.53], [0.0, 0.55], [3.5, 0.58], [6.5, 0.62], [9.3, 0.62]]);
const TY = curve([[-5.3, -0.35], [0.0, -0.35], [3.5, -0.35], [6.5, -0.3], [9.3, -0.25]]);
const TH = curve([[-5.3, 0.7], [0.0, 0.7], [3.5, 0.68], [6.5, 0.64], [9.3, 0.62]]);
const TR = curve([[-5.3, 0.06], [0.0, 0.1], [3.5, 0.26], [6.5, 0.55], [9.3, 0.615]]);
const trunkLoop = (z: number) => {
  const hw = TW(z), hh = TH(z);
  return rrect(TX(z), TY(z), hw, hh, Math.min(TR(z), hw - 0.001, hh - 0.001), 3);
};

// the Foxhound's two greys: light upper and lower surfaces, a darker grey
// for the radome, anti-glare panel, fin caps and some panels
const DARK = 'rgba(92,101,109,0.95)';
const MID = 'rgba(132,142,150,0.55)';

function livery(team: string): Livery {
  const L = new Livery({ half: 11.2, z0: -11.4, len: 22.8, y0: -2.8, height: 7.2 });
  const { gt, gb, gs } = L;
  const rnd = prng(31);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  const poly = (g: CanvasRenderingContext2D, pts: P2[], col: string) => {
    g.fillStyle = col;
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
    g.closePath();
    g.fill();
  };
  // radome: dark grey from the tip back to its seam
  gt.fillStyle = DARK;
  gt.beginPath();
  gt.ellipse(...T(0, -9.75), 0.58 * pt, 1.4 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gb.fillStyle = DARK;
  gb.beginPath();
  gb.ellipse(...B(0, -9.75), 0.58 * L.pb, 1.4 * L.pb, 0, 0, Math.PI * 2);
  gb.fill();
  poly(gs, [S(-11.1, -0.03), S(-8.4, 0.57), S(-8.4, -0.55)], DARK);
  // anti-glare panel ahead of the windscreen, dark band under the cockpit sill
  poly(gt, [T(-0.5, -8.3), T(0.5, -8.3), T(0.42, -7.7), T(-0.42, -7.7)], DARK);
  poly(gs, [S(-8.3, 0.42), S(-4.3, 0.55), S(-4.3, 0.3), S(-8.3, 0.2)], 'rgba(70,78,86,0.8)');
  // cockpit well
  gt.fillStyle = 'rgba(40,46,50,1)';
  gt.fillRect(...T(-0.46, -7.8), 0.92 * pt, 3.6 * pt);
  // darker upper panels over the intake trunks and spine (the two-tone scheme)
  for (const sx of [-1, 1]) {
    poly(gt, [T(0.95 * sx, -4.8), T(1.95 * sx, -4.8), T(1.95 * sx, 3.0), T(0.95 * sx, 4.0)], MID);
  }
  poly(gt, [T(-0.3, -3.8), T(0.3, -3.8), T(0.25, 7.0), T(-0.25, 7.0)], MID);
  // --- panel lines ------------------------------------------------------------
  const frames = [-8.3, -7.75, -4.35, -3.3, -1.9, -0.4, 1.2, 2.8, 4.4, 6.0, 7.5, 8.8];
  for (const z of frames) {
    line(gt, [T(-1.95, z), T(1.95, z)], 1.4, LINE_LIGHT);
    line(gs, [S(z, -1.05), S(z, 0.75)], 1.5, LINE);
    line(gb, [B(-1.95, z), B(1.95, z)], 1.2, LINE_LIGHT);
  }
  line(gs, [S(-8.3, 0.0), S(-5.4, 0.02)], 1.5, LINE);
  line(gs, [S(-5.3, 0.36), S(3.0, 0.36), S(8.5, 0.34)], 1.3, LINE); // trunk top
  line(gs, [S(-5.0, -1.02), S(6.0, -1.0), S(9.0, -0.85)], 1.3, LINE); // trunk bottom
  for (const sx of [-1, 1]) {
    line(gt, [T(0.9 * sx, -4.4), T(0.9 * sx, 5.5)], 1.2, LINE_LIGHT);
    line(gt, [T(1.95 * sx, -5.2), T(1.95 * sx, 3.2)], 1.2, LINE_LIGHT);
    line(gb, [T(0.9 * sx, -4.4), T(0.9 * sx, 5.5)].map((p) => p), 1.2, LINE_LIGHT);
  }
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-7.2, -0.5), S(-6.4, -0.15));
  rect(gs, S(-2.8, -0.7), S(-1.9, -0.2));
  rect(gs, S(0.6, -0.8), S(1.6, -0.3));
  rect(gs, S(4.8, -0.6), S(5.8, -0.1));
  rect(gs, S(6.6, 0.0), S(7.4, 0.3));
  // belly: the recesses for the four R-37M, gear bays
  for (const sx of [-1, 1]) {
    rect(gb, B(0.3 * sx, -3.1), B(0.78 * sx, 1.2));
    rect(gb, B(0.3 * sx, 1.5), B(0.78 * sx, 5.7));
  }
  // --- wings -------------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(2.8, wle(2.8) + 0.45), M(6.6, wle(6.6) + 0.22)], 1.3, LINE); // slat hinge
      line(g, [M(2.4, wte(2.4) - 0.9), M(6.2, wte(6.2) - 0.72)], 1.5, LINE); // flap / aileron hinge
      line(g, [M(4.4, wte(4.4) - 0.8), M(4.4, wte(4.4))], 1.2, LINE);
      for (const x of [3.2, 4.0, 4.8, 5.6]) line(g, [M(x, wle(x) + 0.45), M(x, wte(x) - 0.85)], 1.0, LINE_LIGHT);
      rivets(g, M(2.6, 1.6), M(6.4, 4.0), 7, 0.9);
      line(g, [M(1.8, 8.2), M(4.2, 9.9)], 1.1, LINE_LIGHT); // tailplanes
    }
    star(gt, ...W(4.9, 2.6), 0.55 * pt);
    star(gb, ...Wb(4.9, 2.6), 0.55 * L.pb);
  }
  weather(gt, L.top.width, L.top.height, rnd, 0.85, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.7, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.8, [1, 0.1]);
  // heat staining on the aft nacelles: titanium turns straw and brown
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(NAC_X * sx, 9.3);
      const grd = g.createLinearGradient(x, y - 2.6 * s, x, y);
      grd.addColorStop(0, 'rgba(70,58,40,0)');
      grd.addColorStop(1, 'rgba(92,72,46,0.45)');
      g.fillStyle = grd;
      g.fillRect(x - 0.62 * s, y - 2.6 * s, 1.24 * s, 2.6 * s);
    }
  }
  {
    const [x0, y0] = S(6.6, 0);
    const [x1] = S(9.3, 0);
    const grd = gs.createLinearGradient(x0, y0, x1, y0);
    grd.addColorStop(0, 'rgba(92,72,46,0)');
    grd.addColorStop(1, 'rgba(92,72,46,0.4)');
    gs.fillStyle = grd;
    gs.fillRect(x0, S(0, 0.3)[1], x1 - x0, S(0, -0.9)[1] - S(0, 0.3)[1]);
  }
  L.copySides();
  // --- markings on both sides ------------------------------------------------------
  const teamCol = team === 'blue' ? '#1f4f9e' : '#b0241e';
  L.sideDraw(8.4, 2.35, (g, x, y) => star(g, x, y, 0.46 * ps));
  L.sideText(team === 'blue' ? '12' : '23', -6.9, -0.28, 0.52 * ps, teamCol);
  L.sideText('ВКС РОССИИ', 8.6, 1.35, 0.14 * ps, 'rgba(34,40,48,0.85)');
  L.sideText(team === 'blue' ? 'RF-95453' : 'RF-95440', 8.5, 1.65, 0.11 * ps, 'rgba(34,40,48,0.75)');
  // intake warning chevrons and the rescue arrow
  for (const g of [L.gs, L.gr]) {
    g.fillStyle = 'rgba(190,48,40,0.8)';
    g.fillRect(...S(-4.9, -0.95), 0.06 * ps, 1.2 * ps);
  }
  L.sideDraw(-7.3, 0.3, (g, x, y) => {
    g.fillStyle = '#c9402c';
    g.beginPath();
    g.moveTo(x, y - 0.1 * ps);
    g.lineTo(x + 0.1 * ps, y + 0.08 * ps);
    g.lineTo(x - 0.1 * ps, y + 0.08 * ps);
    g.closePath();
    g.fill();
  });
  return L;
}

/** Red star with a white and red outline (Russian Aerospace Forces). */
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const path = (R: number) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? R : R * 0.42;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  };
  g.save();
  g.lineJoin = 'miter';
  path(r);
  g.fillStyle = '#b8221c';
  g.fill();
  path(r * 0.84);
  g.fillStyle = '#f2f2ee';
  g.fill();
  path(r * 0.72);
  g.fillStyle = '#c8261f';
  g.fill();
  g.restore();
}

const liveries = new Map<string, Livery>();

/** Tint a nozzle mesh's vertex colours toward heat-blued, straw-and-bronze titanium. */
function bronze(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const c = g.attributes.color as THREE.BufferAttribute | undefined;
  if (!c) return g;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, Math.min(1, c.getX(i) * 1.18 + 0.05), c.getY(i) * 0.92 + 0.02, c.getZ(i) * 0.66);
  return g;
}

export function buildMig31(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#aab3b9'), bottom: new THREE.Color('#bec5ca'), livery: L, roughness: 0.56, metalness: 0.05 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  // --- central fuselage ------------------------------------------------------------
  const zs = mergeStations(stations(-11.1, -8.4, 40, 0.6, 0), stations(-8.4, -3.8, 56), stations(-3.8, 9.3, 110), stations(9.3, 9.8, 8, 0, 0.4));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -10.95, 9.6, 44);

  // --- intake trunks into the engine nacelles: box mouths, raked back underneath ---
  const trunk = intake({
    loop: trunkLoop,
    outer: stations(-5.3, NOZZLE_Z, 110, 0.3, 0),
    lip: 0.045,
    depth: 2.8,
    n: 88,
    // the top lip leads well ahead; the mouth slants steeply back toward the bottom
    rake: (_x, y) => -0.9 * (y + 0.35),
    fan: { cx: 1.3, cy: -0.35, r: 0.5 },
  });
  skin(both(trunk.skin));
  v.addMesh(both(trunk.duct), pm.duct);
  // variable intake ramp: the hinged roof panel inside each mouth
  const ramp = join([-1, 1].map((sx) => {
    const g = roundBox(1.0, 0.05, 1.4, 0.01);
    g.rotateX(0.12);
    g.translate(sx * 1.42, 0.12, -4.35);
    return g;
  }));
  v.addMesh(ramp, pm.duct);
  // boundary-layer splitter plates standing off the fuselage
  const split = join([-1, 1].map((sx) => {
    const g = loftProfile({
      stations: stations(-6.1, -3.6, 12),
      profile: (z) => {
        const u = sstep(-6.1, -3.6, z);
        const h = 1.36 * (0.3 + 0.7 * u);
        return [[0, -0.34 - h / 2], [0.014, -0.34 - h / 2], [0.014, -0.34 + h / 2], [0, -0.34 + h / 2]] as P2[];
      },
      sub: 1,
      capStart: true,
      capEnd: true,
    });
    g.translate(sx * 0.87, 0, 0);
    return g;
  }));
  skin(split);
  // dorsal fillets running forward from the fin roots
  for (const sx of [-1, 1]) {
    const f = loftProfile({
      stations: stations(2.6, 5.4, 14),
      profile: (z) => {
        const h = 0.3 * sstep(2.6, 5.2, z);
        return [[-0.05, 0], [0.05, 0], [0.03, h], [-0.03, h]] as P2[];
      },
      sub: 1,
      capStart: true,
      capEnd: true,
    });
    f.translate(FIN_X * sx, FIN_Y - 0.02, 0);
    skin(f);
  }

  // --- canopy, seats, crew --------------------------------------------------------------
  v.cockpitEye.set(0, 1.0, -6.85);
  // frames: windscreen arch and its rear frame, the hood's back edge, the operator's hood
  buildCanopy(v, CANOPY, -7.66, [-7.1, -6.08, -5.96, -3.95], paint);
  // the operator's hood is metal above a pair of small side windows
  const hood = (z0: number, z1: number, th0: number) =>
    loftProfile({
      stations: stations(z0, z1, 24),
      profile: (z) => {
        const sec = sectionAt(CANOPY, z);
        const pts: P2[] = [];
        for (let i = 0; i <= 8; i++) {
          const [x, y] = sectionPoint(th0 + ((Math.PI / 2 - th0) * i) / 8, sec);
          pts.push([x * 1.012 + 0.004, y + 0.006]);
        }
        return [[0, pts[0][1] - 0.04], [pts[0][0] - 0.03, pts[0][1] - 0.04], ...pts];
      },
      sub: 1,
      capStart: true,
      capEnd: true,
    });
  skin(hood(-5.96, -3.8, 0.55));
  // ahead of and behind the windows the hood comes right down to the sill
  skin(hood(-4.5, -3.8, 0.05));
  // raised dorsal spine from the hood back over the wing
  skin(
    loftProfile({
      stations: stations(-4.0, 2.2, 40),
      profile: (z) => {
        const sec: Section = { z, w: SPINE_W(z), top: SPINE_TOP(z) - 0.42, bot: 0.03, y: 0.42, n: 3 };
        const pts: P2[] = [[0, 0.3], [sec.w * 0.97, 0.3]];
        for (let i = 0; i <= 8; i++) pts.push(sectionPoint((Math.PI / 2) * (i / 8), sec));
        return pts;
      },
      sub: 1,
      capStart: true,
      capEnd: true,
    }),
  );
  for (const eye of [new THREE.Vector3(0, 1.0, -6.85), new THREE.Vector3(0, 1.04, -5.3)]) {
    addPilot(v, eye, 0.24, { style: 'ru', stick: 'center', martinBaker: false });
  }
  const shroud = loftProfile({
    stations: stations(-7.75, -7.35, 6),
    profile: (z) => {
      const u = sstep(-7.75, -7.35, z);
      return [[0, 0.24], [0.44, 0.26], [0.5, 0.58], [0.34, 0.68 - u * 0.06], [0, 0.7 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  // the rear cockpit's instrument coaming between the seats
  const coaming = loftProfile({
    stations: stations(-6.15, -5.95, 4),
    profile: () => [[0, 0.3], [0.42, 0.32], [0.46, 0.72], [0, 0.78]] as P2[],
    sub: 2,
    capStart: true,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(coaming, pm.seat));
  // retractable refuelling probe fairing, left of the front cockpit
  v.hideInCockpit.push(skin(lathe([[0.004, -8.4], [0.06, -8.2], [0.075, -7.6], [0.07, -6.6], [0.004, -6.4]], 14, -0.5, 0.47)));
  // 8TK IRST, retracted into a shallow blister under the nose
  const irst = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), pm.glass);
  irst.position.set(0, -0.6, -8.05);
  v.body.add(irst);

  // --- wing: slats, flaps, ailerons --------------------------------------------------------
  const panels = wingPanels(
    WING,
    [
      { x0: 2.8, x1: 6.6, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.05, kind: 'lef', maxDeg: 18, leading: true },
      { x0: 2.3, x1: 4.35, hinge: (x) => wte(x) - 0.9, kind: 'flap', maxDeg: 30 },
      { x0: 4.45, x1: 6.2, hinge: (x) => wte(x) - 0.72, kind: 'aileron', maxDeg: 22 },
    ],
    { chordPts: 36, thickPos: 0.4 },
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
  // small wing fences on the upper surface
  for (const sx of [-1, 1]) {
    const x = 4.3 * sx;
    const fence = roundBox(0.012, 0.09, 2.3, 0.004);
    fence.translate(x, wy(4.3) + 0.07, (wle(4.3) + wte(4.3)) / 2 - 0.2);
    skin(fence);
  }

  // --- tailplanes ------------------------------------------------------------------------------
  const stab = wing({ sections: STAB, chordPts: 28, spanSub: 8, tip: 'round', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    v.addSurface(g, paint, new THREE.Vector3(1.6 * side, -0.18, STAB_PIVOT_Z), new THREE.Vector3(1, 0, 0), 'stab', side, 22);
  }

  // --- twin fins canted outboard, with rudders; two ventral fins --------------------------------
  for (const side of [1, -1] as const) {
    const m = finMatrix(FIN_X * side, FIN_Y, 8, side);
    const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 25);
    // dark dielectric fin-tip cap
    const top = new THREE.Vector3(3.1, 0, 0).applyMatrix4(m);
    const cap = lathe([[0.004, 8.4], [0.055, 8.6], [0.06, 9.2], [0.05, 9.95], [0.004, 10.1]], 12, top.x, top.y);
    v.addMesh(cap, pm.darkMetal);
    v.addNavLight(new THREE.Vector3(top.x, top.y + 0.04, 9.9), 'formation');
    const vm = finMatrix(1.2 * side, -0.82, 168, side);
    skin(wing({ sections: VENTRAL, chordPts: 20, spanSub: 3, tip: 'flat', root: 'flat', matrix: vm }));
  }

  // --- engines: two D-30F6 nozzles, heat-tinted titanium ----------------------------------------
  for (const sx of [-1, 1] as const) {
    const nz = nozzle({ cx: NAC_X * sx, cy: -0.25, z0: NOZZLE_Z, z1: 10.95, r0: 0.62, r1: 0.55, petals: 18, saw: 0.06, floor: NOZZLE_Z + 0.15 });
    const nzOut = v.addMesh(bronze(nz.outer), pm.nozzle);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.nozzles.push({ pos: new THREE.Vector3(NAC_X * sx, -0.25, 10.85), radius: 0.5, depth: 1.3, area: nz.area });
  }
  v.buildFlames(7.4);

  // --- gun, probes, antennas, lights ------------------------------------------------------
  // GSh-6-23M in a fairing low on the right intake trunk, just ahead of the main gear
  skin(lathe([[0.004, -1.0], [0.09, -0.75], [0.12, -0.3], [0.12, 0.8], [0.08, 1.4], [0.004, 1.6]], 14, 1.55, -1.05));
  {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), pm.darkMetal);
    m.position.set(1.55, -1.08, -0.62);
    m.rotation.y = Math.PI;
    v.body.add(m);
  }
  v.addMesh(join([
    probe(new THREE.Vector3(0, -0.03, -11.08), 0.62, 0.02, new THREE.Vector3(0, 0, -1)),
    probe(new THREE.Vector3(0.5, 0.2, -8.9), 0.28, 0.01, new THREE.Vector3(0.18, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.5, 0.2, -8.9), 0.28, 0.01, new THREE.Vector3(-0.18, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.74, -2.6), 0.2, 0.3),
    blade(new THREE.Vector3(0, 0.62, 3.6), 0.16, 0.26),
    blade(new THREE.Vector3(0, -1.02, -4.4), 0.18, 0.26, new THREE.Vector3(0, -1, 0)),
    blade(new THREE.Vector3(0, -0.98, 6.0), 0.16, 0.24, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.8, 0.3, -6.6), new THREE.Vector3(1, 0.25, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-0.8, 0.3, -6.6), new THREE.Vector3(-1, 0.25, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(1.96, -0.2, 4.4), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
    formationStrip(new THREE.Vector3(-1.96, -0.2, 4.4), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-6.74, wy(6.73), wle(6.73) + 0.25), 'red');
  v.addNavLight(new THREE.Vector3(6.74, wy(6.73), wle(6.73) + 0.25), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.62, 5.8), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -1.02, 0.2), 'strobe');

  // --- landing gear: twin-wheel nose leg, big mains folding forward into the trunks --------
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.8, -6.0), axle: new THREE.Vector3(0, -2.45 + 0.35, -6.35), r: 0.35, w: 0.2, twin: true, retract: 'forward' },
    mains: { top: new THREE.Vector3(1.55, -1.0, 1.35), axle: new THREE.Vector3(1.82, -2.45 + 0.5, 1.85), r: 0.5, w: 0.34, retract: 'forward', outboard: 0.12 },
    doorColor: '#b6bec3',
  });
}
