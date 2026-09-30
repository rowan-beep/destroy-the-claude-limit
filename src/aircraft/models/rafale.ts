// Dassault Rafale C: 15.30 m long, 10.90 m span (with tip missiles), 5.34 m tall.
// Single seat: long pointed radome, OSF optronics ahead of the windscreen,
// the fixed refuelling probe curving forward on the starboard side, a bubble
// canopy, big close-coupled canards above the D-shaped side intakes, a cropped
// delta wing with slats and two elevons a side, wingtip missile rails, one
// swept fin with a squared SPECTRA fairing on top, two close-set M88 nozzles.

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
  { z: -7.95, pts: circ(0.012, -0.06) },
  { z: -7.6, pts: circ(0.15, -0.05) },
  { z: -7.0, pts: circ(0.29, -0.03) },
  { z: -6.3, pts: circ(0.41, -0.01) },
  { z: -5.8, pts: [[0, -0.55], [0.28, -0.54], [0.46, -0.42], [0.53, -0.2], [0.55, 0.0], [0.55, 0.05], [0.55, 0.1], [0.53, 0.25], [0.47, 0.4], [0.36, 0.5], [0.18, 0.54], [0, 0.55]] },
  { z: -5.3, pts: [[0, -0.6], [0.3, -0.59], [0.5, -0.47], [0.57, -0.23], [0.59, 0.0], [0.59, 0.05], [0.59, 0.1], [0.57, 0.26], [0.52, 0.42], [0.47, 0.53], [0.3, 0.52], [0, 0.5]] },
  { z: -4.8, pts: [[0, -0.62], [0.32, -0.61], [0.52, -0.5], [0.59, -0.25], [0.61, 0.0], [0.61, 0.05], [0.61, 0.1], [0.59, 0.28], [0.53, 0.45], [0.48, 0.56], [0.38, 0.34], [0, 0.28]] },
  { z: -3.8, pts: [[0, -0.64], [0.33, -0.64], [0.53, -0.52], [0.6, -0.27], [0.62, 0.0], [0.62, 0.05], [0.62, 0.1], [0.6, 0.28], [0.54, 0.46], [0.49, 0.58], [0.38, 0.38], [0, 0.34]] },
  { z: -3.0, pts: [[0, -0.66], [0.35, -0.66], [0.56, -0.55], [0.63, -0.28], [0.65, 0.0], [0.66, 0.05], [0.66, 0.1], [0.64, 0.3], [0.56, 0.5], [0.44, 0.62], [0.24, 0.68], [0, 0.7]] },
  { z: -1.2, pts: [[0, -0.72], [0.42, -0.74], [0.72, -0.74], [0.86, -0.5], [0.9, -0.3], [0.9, -0.24], [0.9, -0.16], [0.86, 0.14], [0.7, 0.44], [0.5, 0.62], [0.27, 0.73], [0, 0.76]] },
  { z: 1.5, pts: [[0, -0.88], [0.5, -0.88], [0.86, -0.82], [0.97, -0.55], [0.98, -0.34], [0.98, -0.28], [0.98, -0.2], [0.94, 0.1], [0.78, 0.38], [0.54, 0.56], [0.28, 0.65], [0, 0.68]] },
  { z: 4.0, pts: [[0, -0.78], [0.45, -0.8], [0.84, -0.72], [0.96, -0.48], [0.97, -0.34], [0.97, -0.28], [0.97, -0.2], [0.94, 0.08], [0.78, 0.33], [0.52, 0.5], [0.26, 0.56], [0, 0.6]] },
  { z: 5.8, pts: [[0, -0.56], [0.25, -0.63], [0.52, -0.65], [0.8, -0.55], [0.95, -0.36], [0.97, -0.26], [0.97, -0.2], [0.94, 0.0], [0.8, 0.22], [0.5, 0.34], [0.25, 0.38], [0, 0.42]] },
  { z: 6.65, pts: [[0, -0.36], [0.2, -0.55], [0.48, -0.63], [0.78, -0.53], [0.92, -0.34], [0.94, -0.24], [0.94, -0.18], [0.92, -0.02], [0.78, 0.16], [0.48, 0.26], [0.22, 0.3], [0, 0.32]] },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

const CANOPY: Section[] = [
  { z: -5.95, w: 0.03, top: 0.02, bot: 0.02, y: 0.5, n: 2 },
  { z: -5.45, w: 0.37, top: 0.3, bot: 0.03, y: 0.52, n: 2.2 },
  { z: -4.95, w: 0.46, top: 0.5, bot: 0.03, y: 0.54, n: 2.2 },
  { z: -4.3, w: 0.48, top: 0.57, bot: 0.03, y: 0.55, n: 2.2 },
  { z: -3.6, w: 0.44, top: 0.47, bot: 0.03, y: 0.57, n: 2.2 },
  { z: -2.95, w: 0.3, top: 0.24, bot: 0.03, y: 0.62, n: 2.2 },
  { z: -2.4, w: 0.14, top: 0.06, bot: 0.03, y: 0.66, n: 2 },
];

// cropped delta: 48 degrees of leading-edge sweep
const WING: WingStation[] = [
  { x: 0.7, le: -1.25, te: 5.42, y: -0.26, t: 0.05 },
  { x: 0.95, le: -1.0, te: 5.4, y: -0.27, t: 0.048 },
  { x: 5.3, le: 3.83, te: 4.92, y: -0.34, t: 0.035 },
];
const wle = (x: number) => -1.0 + (x - 0.95) * 1.11;
const wte = (x: number) => 5.4 - (x - 0.95) * 0.11;
const CANARD: WingStation[] = [
  { x: 0.55, le: -3.55, te: -2.0, y: 0.02, t: 0.05 },
  { x: 1.98, le: -2.3, te: -1.84, y: 0.1, t: 0.04 },
];
const CANARD_PIVOT = -2.7;
const FIN: WingStation[] = [
  { x: 0, le: 2.85, te: 6.75, t: 0.05 },
  { x: 2.85, le: 5.72, te: 6.92, t: 0.036 },
];
const RUDDER = { h0: 0.3, h1: 2.25, hinge: (h: number) => 6.12 + h * 0.06 };

function livery(team: string): Livery {
  const L = new Livery({ half: 9.0, z0: -9.0, len: 18, y0: -2.0, height: 5.8 });
  const { gt, gb, gs } = L;
  const rnd = prng(41);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // radome: a darker grey cone to the first bulkhead
  gt.fillStyle = 'rgba(88,94,99,0.75)';
  gt.beginPath();
  gt.ellipse(...T(0, -7.0), 0.44 * pt, 1.05 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gs.fillStyle = 'rgba(88,94,99,0.75)';
  gs.beginPath();
  gs.moveTo(...S(-8.0, -0.06));
  gs.lineTo(...S(-5.95, 0.52));
  gs.lineTo(...S(-5.95, -0.56));
  gs.closePath();
  gs.fill();
  gb.fillStyle = 'rgba(88,94,99,0.6)';
  gb.beginPath();
  gb.ellipse(...B(0, -7.0), 0.44 * L.pb, 1.05 * L.pb, 0, 0, Math.PI * 2);
  gb.fill();
  // anti-glare ahead of the windscreen, cockpit well
  gt.fillStyle = 'rgba(52,56,60,0.7)';
  gt.beginPath();
  gt.moveTo(...T(-0.38, -5.6));
  gt.lineTo(...T(0.38, -5.6));
  gt.lineTo(...T(0.14, -6.3));
  gt.lineTo(...T(-0.14, -6.3));
  gt.closePath();
  gt.fill();
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.fillRect(...T(-0.46, -5.2), 0.92 * pt, 2.0 * pt);
  for (const z of [-5.95, -5.2, -3.0, -1.8, -0.4, 1.1, 2.7, 4.2, 5.6, 6.5]) {
    line(gt, [T(-1.0, z), T(1.0, z)], 1.3, LINE_LIGHT);
    line(gs, [S(z, -0.95), S(z, 0.68)], 1.5, LINE);
    line(gb, [B(-1.0, z), B(1.0, z)], 1.2, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    line(gt, [T(0.5 * sx, -1.2), T(0.5 * sx, 6.3)], 1.2, LINE_LIGHT);
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(1.0, wle(1.0) + 0.7), M(5.2, wle(5.2) + 0.2)], 1.2, LINE_LIGHT);
      line(g, [M(1.0, 3.9), M(5.2, 4.4)], 1.2, LINE_LIGHT);
      line(g, [M(1.6, wle(1.6) + 0.32), M(5.2, wle(5.2) + 0.18)], 1.3, LINE); // slats
      rivets(g, M(1.0, wle(1.0) + 0.7), M(5.2, wle(5.2) + 0.2), 7, 0.9);
      rivets(g, M(1.0, 3.9), M(5.2, 4.4), 7, 0.9);
      for (const x of [1.8, 2.7, 3.6, 4.4]) line(g, [M(x, wle(x) + 0.3), M(x, wte(x) - 0.7)], 1.0, LINE_LIGHT);
      line(g, [M(0.75, -3.2), M(1.85, -2.2)], 1.0, LINE_LIGHT); // canard
    }
    line(gt, [W(1.0, 0.8), W(1.9, 1.6), W(1.9, 3.7), W(1.0, 3.7)], 1.1, 'rgba(25,27,30,0.4)');
    if (sx < 0) roundel(gt, team, ...W(3.4, 3.4), 0.44 * pt);
    else roundel(gb, team, ...Wb(3.4, 3.4), 0.44 * L.pb);
  }
  line(gs, [S(-5.9, -0.2), S(-3.4, -0.2)], 1.3, LINE_LIGHT);
  line(gs, [S(-3.4, -0.72), S(3.0, -0.78)], 1.4, LINE);
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-5.3, -0.4), S(-4.6, -0.1));
  rect(gs, S(-0.8, 0.1), S(-0.1, 0.4));
  rect(gs, S(3.2, -0.4), S(4.0, 0.0));
  weather(gt, L.top.width, L.top.height, rnd, 0.8, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.6, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.7, [1, 0.1]);
  // soot around the nozzles
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(0.47 * sx, 6.6);
      const gr = g.createLinearGradient(x, y - 1.4 * s, x, y);
      gr.addColorStop(0, 'rgba(40,36,30,0)');
      gr.addColorStop(1, 'rgba(40,36,30,0.32)');
      g.fillStyle = gr;
      g.fillRect(x - 0.42 * s, y - 1.4 * s, 0.84 * s, 1.4 * s);
    }
  }
  L.copySides();
  const teamCol = team === 'blue' ? '#233f86' : '#9a2521';
  // fin: squadron badge and code, low-visibility style
  L.sideDraw(5.3, 1.9, (g, x, y) => {
    g.strokeStyle = 'rgba(40,44,50,0.75)';
    g.lineWidth = 0.035 * ps;
    g.beginPath();
    g.arc(x, y, 0.28 * ps, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = teamCol;
    g.beginPath();
    g.moveTo(x, y - 0.2 * ps);
    g.lineTo(x + 0.17 * ps, y + 0.12 * ps);
    g.lineTo(x - 0.17 * ps, y + 0.12 * ps);
    g.closePath();
    g.fill();
  });
  L.sideText(team === 'blue' ? '4-GE' : '30-GF', 5.9, 1.05, 0.2 * ps, 'rgba(40,44,50,0.85)');
  L.sideText(team === 'blue' ? '142' : '118', 6.1, 0.2, 0.13 * ps, 'rgba(40,44,50,0.8)');
  L.sideDraw(-2.0, -0.45, (g, x, y) => roundel(g, team, x, y, 0.24 * ps));
  L.sideDraw(-5.1, 0.3, (g, x, y) => {
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

// D-shaped side intake: flat against the fuselage and under the canard shelf,
// rounded outboard and underneath
function dLoop(x0: number, cy: number, w: number, hh: number): P2[] {
  const out: P2[] = [];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    // rounder underneath, squarer under the shelf
    const e = s < 0 ? 0.85 : 0.45;
    out.push([x0 + w * Math.pow(c, e), cy + hh * Math.sign(s) * Math.pow(Math.abs(s), e)]);
  }
  for (let i = 1; i < 6; i++) out.push([x0, cy + hh - (2 * hh * i) / 6]);
  return out;
}

export function buildRafale(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#7b8388'), bottom: new THREE.Color('#949ca1'), livery: L, roughness: 0.55, metalness: 0.05 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-7.95, -5.8, 30, 0.55, 0), stations(-5.8, -2.4, 50), stations(-2.4, 6.65, 80));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -7.7, 6.5, 40);

  // --- side intakes under the canards, the upper lip leading
  const TX = curve([[-3.45, 0.54], [-1.5, 0.56], [1.4, 0.6]]);
  const TW = curve([[-3.45, 0.31], [-1.5, 0.3], [1.4, 0.22]]);
  const TY = curve([[-3.45, -0.38], [-1.5, -0.4], [1.4, -0.46]]);
  const TH = curve([[-3.45, 0.36], [-1.5, 0.35], [1.4, 0.27]]);
  const loop = (z: number) => dLoop(TX(z), TY(z), 2 * TW(z), TH(z));
  const inl = intake({
    loop,
    outer: stations(-3.45, 1.4, 44, 0.3, 0),
    lip: 0.04,
    depth: 1.9,
    n: 64,
    rake: (_x, y) => -0.55 * (y - (TY(-3.45) + TH(-3.45))),
    fan: { cx: 0.84, cy: -0.4, r: 0.27 },
  });
  skin(both(inl.skin));
  v.addMesh(both(inl.duct), pm.duct);
  // half-cone shock body in the upper inner corner of each mouth, and the
  // canard shelf over the intake
  for (const sx of [-1, 1]) {
    const cone = lathe([[0.004, -3.68], [0.05, -3.5], [0.085, -3.2], [0.09, -2.8]], 14, 0.57 * sx, -0.14);
    skin(cone);
  }
  const shelf = loftProfile({
    stations: stations(-3.7, -1.3, 14),
    profile: (z) => {
      const u = sstep(-3.7, -2.9, z);
      const w = 0.6 + u * 0.5 - sstep(-2.2, -1.3, z) * 0.18;
      return [[0.5, -0.1], [w, -0.08 + u * 0.02], [w, -0.04 + u * 0.02], [0.5, 0.02 + u * 0.06]] as P2[];
    },
    sub: 2,
    capStart: true,
    capEnd: true,
  });
  skin(both(shelf));

  // --- canopy, seat, pilot
  v.cockpitEye.set(0, 0.95, -4.5);
  buildCanopy(v, CANOPY, -4.97, []);
  addPilot(v, new THREE.Vector3(0, 0.95, -4.5), 0.29, { style: 'eu', stick: 'side', martinBaker: true });
  const shroud = loftProfile({
    stations: stations(-5.35, -4.95, 6),
    profile: (z) => {
      const u = sstep(-5.35, -4.95, z);
      return [[0, 0.16], [0.42, 0.18], [0.47, 0.5], [0.33, 0.58 - u * 0.06], [0, 0.6 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));

  // --- wing: slats, two elevons a side
  const panels = wingPanels(
    WING,
    [
      { x0: 1.6, x1: 5.15, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.05, kind: 'lef', maxDeg: 20, leading: true },
      { x0: 1.05, x1: 3.05, hinge: (x) => wte(x) - 0.82, kind: 'flap', maxDeg: 25 },
      { x0: 3.12, x1: 5.05, hinge: (x) => wte(x) - 0.7, kind: 'aileron', maxDeg: 25 },
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
  // wingtip missile rails (always fitted)
  const rail = roundBox(0.1, 0.1, 1.9, 0.03);
  rail.translate(5.36, -0.34, 4.2);
  skin(both(rail));

  // --- canards (all-moving)
  const canard = wing({ sections: CANARD, chordPts: 22, spanSub: 6, tip: 'round', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? canard.clone() : mirror(canard));
    v.addSurface(g, paint, new THREE.Vector3(0.62 * side, 0.03, CANARD_PIVOT), new THREE.Vector3(1, 0, 0), 'canard', side, 20);
  }

  // --- fin with rudder, squared SPECTRA fairing on top, antenna at the root
  const m = finMatrix(0, 0.5, 0, 1);
  const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
  skin(f.fixed);
  v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', 0, 25);
  const tipBox = roundBox(0.15, 0.24, 1.55, 0.05);
  tipBox.translate(0, 3.43, 6.3);
  skin(tipBox);
  skin(lathe([[0.004, 5.3], [0.05, 5.4], [0.075, 5.6], [0.075, 5.6]], 12, 0, 3.43));
  skin(lathe([[0.075, 7.0], [0.07, 7.12], [0.004, 7.2]], 12, 0, 3.43));
  const rootPod = lathe([[0.004, 6.1], [0.1, 6.35], [0.13, 6.8], [0.12, 7.25], [0.004, 7.35]], 16, 0, 0.62);
  skin(rootPod);
  v.addNavLight(new THREE.Vector3(0, 3.56, 7.05), 'strobe');
  // dorsal spine fillet into the fin
  const fillet = loftProfile({
    stations: stations(0.9, 3.3, 12),
    profile: (z) => {
      const h = sstep(0.9, 3.2, z) * 0.3;
      const w = 0.2 - sstep(0.9, 3.3, z) * 0.12;
      return [[0, 0.45], [w, 0.5], [w * 0.4, 0.56 + h], [0, 0.58 + h]] as P2[];
    },
    sub: 3,
    capStart: true,
    capEnd: true,
  });
  skin(fillet);

  // --- two close-set M88 nozzles
  for (const sx of [-1, 1]) {
    const nz = nozzle({ cx: 0.47 * sx, cy: -0.18, z0: 6.55, z1: 7.35, r0: 0.44, r1: 0.39, petals: 12, saw: 0.05, floor: 6.66 });
    const nzOut = v.addMesh(nz.outer, pm.nozzle);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.nozzles.push({ pos: new THREE.Vector3(0.47 * sx, -0.18, 7.3), radius: 0.36, depth: 0.63, area: nz.area });
  }
  v.buildFlames(4.8);
  // fairing between the nozzles
  skin(lathe([[0.14, 5.9], [0.15, 6.5], [0.12, 6.95], [0.05, 7.2], [0.004, 7.25]], 16, 0, -0.1));

  // --- OSF front-sector optronics ahead of the windscreen
  const osf = roundBox(0.17, 0.12, 0.5, 0.055);
  osf.translate(0, 0.49, -6.1);
  v.hideInCockpit.push(skin(osf));
  for (const dx of [-0.05, 0.05]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), pm.glass);
    w.position.set(dx, 0.5, -6.36);
    w.rotation.y = Math.PI;
    v.body.add(w);
    v.hideInCockpit.push(w);
  }

  // --- fixed in-flight refuelling probe: rises off the starboard side ahead
  // of the canopy and curves forward past the windscreen
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.43, 0.36, -4.75),
    new THREE.Vector3(0.41, 0.46, -5.3),
    new THREE.Vector3(0.35, 0.57, -5.9),
    new THREE.Vector3(0.3, 0.62, -6.35),
    new THREE.Vector3(0.28, 0.63, -6.55),
  ]);
  const tube = new THREE.TubeGeometry(path, 30, 0.036, 12, false);
  skin(tube);
  const nozzleTip = lathe([[0.036, -6.53], [0.05, -6.6], [0.046, -6.7], [0.025, -6.75], [0.004, -6.77]], 14, 0.28, 0.63);
  v.addMesh(nozzleTip, pm.darkMetal);
  skin(lathe([[0.004, -5.05], [0.06, -4.9], [0.075, -4.5], [0.05, -4.1], [0.004, -3.95]], 14, 0.45, 0.33));

  // --- 30M791 cannon port in the starboard wing root
  skin(lathe([[0.004, -1.9], [0.06, -1.75], [0.075, -1.4], [0.07, -0.9], [0.004, -0.6]], 14, 0.86, -0.36));
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.038, 12), pm.darkMetal);
  muzzle.position.set(0.86, -0.36, -1.78);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);

  // --- probes, antennas, lights
  v.addMesh(join([
    probe(new THREE.Vector3(0.3, 0.05, -6.7), 0.3, 0.011, new THREE.Vector3(0.12, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.3, 0.05, -6.7), 0.3, 0.011, new THREE.Vector3(-0.12, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.66, -1.4), 0.18, 0.28),
    blade(new THREE.Vector3(0, -0.88, 0.6), 0.16, 0.24, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.6, 0.25, -4.2), new THREE.Vector3(1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(-0.6, 0.25, -4.2), new THREE.Vector3(-1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(0.975, -0.12, 3.4), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-0.975, -0.12, 3.4), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-5.36, -0.28, 3.4), 'red');
  v.addNavLight(new THREE.Vector3(5.36, -0.28, 3.4), 'green');
  v.addNavLight(new THREE.Vector3(0, -0.9, 1.8), 'strobe');

  // --- landing gear: twin nose wheels, mains fold forward into the fuselage
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.55, -4.45), axle: new THREE.Vector3(0, -1.75 + 0.25, -4.7), r: 0.25, w: 0.15, twin: true, retract: 'aft' },
    mains: { top: new THREE.Vector3(0.9, -0.72, 0.8), axle: new THREE.Vector3(1.35, -1.75 + 0.38, 1.1), r: 0.38, w: 0.23, retract: 'forward', outboard: 0.05 },
    doorColor: '#949ca1',
  });
}
