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

const ANG = [-90, -72, -52, -34, -14, -4, 4, 14, 34, 52, 72, 90];
function circ(R: number, yc: number): P2[] {
  return ANG.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}
/** an oval of half-width hw between yb and yt; e < 1 squares the corners */
function oval(hw: number, yb: number, yt: number, e = 1): P2[] {
  const yc = (yb + yt) / 2, hh = (yt - yb) / 2;
  const p = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  return ANG.map((a) => [hw * p(Math.cos((a * Math.PI) / 180)), yc + hh * p(Math.sin((a * Math.PI) / 180))] as P2);
}

// right half, bottom centre -> top centre; points 4-6 are the wing-root line.
// Sized off the three-view: the radome droops 0.3 m to its tip, the
// windscreen base is 3 m behind the tip, the cockpit sills are high (0.75),
// the spine behind the canopy runs down to the fin, and the belly steps
// down under the engine bays before the close-set nozzles at z 5.9
const BODY = keyedProfile([
  { z: -7.95, pts: circ(0.012, -0.3) },
  { z: -7.45, pts: oval(0.16, -0.4, -0.18) },
  { z: -6.95, pts: oval(0.33, -0.45, 0.02) },
  { z: -6.45, pts: oval(0.45, -0.52, 0.2) },
  { z: -5.95, pts: oval(0.56, -0.55, 0.42, 0.95) },
  { z: -5.45, pts: oval(0.64, -0.6, 0.66, 0.9) },
  { z: -4.95, pts: [[0, -0.6], [0.32, -0.59], [0.52, -0.47], [0.62, -0.22], [0.66, 0.0], [0.66, 0.05], [0.66, 0.1], [0.65, 0.3], [0.6, 0.52], [0.5, 0.68], [0.28, 0.74], [0, 0.76]] },
  // the cockpit well between the sills
  { z: -4.4, pts: [[0, -0.62], [0.33, -0.61], [0.54, -0.49], [0.64, -0.24], [0.7, 0.0], [0.7, 0.05], [0.7, 0.1], [0.69, 0.3], [0.64, 0.55], [0.52, 0.74], [0.4, 0.42], [0, 0.36]] },
  { z: -3.6, pts: [[0, -0.64], [0.35, -0.63], [0.57, -0.51], [0.68, -0.26], [0.76, 0.0], [0.76, 0.05], [0.76, 0.1], [0.75, 0.32], [0.7, 0.58], [0.52, 0.76], [0.4, 0.44], [0, 0.38]] },
  { z: -2.8, pts: [[0, -0.66], [0.38, -0.66], [0.62, -0.55], [0.74, -0.28], [0.84, 0.0], [0.84, 0.05], [0.84, 0.1], [0.82, 0.33], [0.74, 0.6], [0.52, 0.78], [0.4, 0.46], [0, 0.4]] },
  { z: -2.0, pts: [[0, -0.72], [0.42, -0.73], [0.7, -0.68], [0.84, -0.42], [0.9, -0.2], [0.9, -0.15], [0.9, -0.1], [0.88, 0.2], [0.78, 0.58], [0.52, 0.8], [0.4, 0.5], [0, 0.44]] },
  { z: -1.3, pts: [[0, -0.77], [0.45, -0.78], [0.76, -0.74], [0.9, -0.48], [0.96, -0.26], [0.96, -0.2], [0.96, -0.14], [0.92, 0.16], [0.8, 0.56], [0.58, 0.82], [0.3, 0.88], [0, 0.9]] },
  // the spine behind the canopy
  { z: -0.8, pts: [[0, -0.77], [0.46, -0.78], [0.78, -0.74], [0.92, -0.48], [0.97, -0.26], [0.97, -0.2], [0.97, -0.14], [0.93, 0.16], [0.8, 0.58], [0.56, 0.84], [0.3, 0.95], [0, 0.97]] },
  { z: 0.0, pts: [[0, -0.78], [0.48, -0.79], [0.82, -0.74], [0.94, -0.5], [0.98, -0.3], [0.98, -0.24], [0.98, -0.18], [0.94, 0.14], [0.78, 0.5], [0.54, 0.74], [0.28, 0.84], [0, 0.87]] },
  { z: 1.5, pts: [[0, -0.8], [0.5, -0.82], [0.86, -0.76], [1.0, -0.52], [1.04, -0.32], [1.04, -0.26], [1.04, -0.2], [1.0, 0.1], [0.84, 0.42], [0.56, 0.62], [0.28, 0.72], [0, 0.77]] },
  { z: 2.6, pts: [[0, -0.95], [0.55, -0.95], [0.95, -0.86], [1.12, -0.58], [1.18, -0.34], [1.18, -0.28], [1.18, -0.2], [1.14, 0.08], [0.94, 0.38], [0.6, 0.56], [0.3, 0.64], [0, 0.68]] },
  { z: 4.0, pts: [[0, -0.95], [0.6, -0.95], [1.0, -0.86], [1.18, -0.58], [1.24, -0.34], [1.24, -0.28], [1.24, -0.2], [1.2, 0.06], [1.0, 0.34], [0.62, 0.5], [0.3, 0.58], [0, 0.62]] },
  { z: 5.2, pts: [[0, -0.88], [0.6, -0.88], [1.0, -0.8], [1.18, -0.55], [1.24, -0.34], [1.24, -0.28], [1.24, -0.2], [1.2, 0.02], [1.0, 0.28], [0.62, 0.42], [0.3, 0.5], [0, 0.54]] },
  { z: 5.75, pts: [[0, -0.4], [0.4, -0.48], [0.85, -0.5], [1.08, -0.4], [1.18, -0.28], [1.2, -0.22], [1.2, -0.16], [1.16, -0.02], [0.98, 0.2], [0.6, 0.34], [0.3, 0.4], [0, 0.44]] },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

// the windscreen base 3 m behind the tip, the crown 1.3 m over the datum
// above the pilot, the glass running back to the spine at z -1
const CANOPY: Section[] = [
  { z: -4.9, w: 0.03, top: 0.02, bot: 0.02, y: 0.74, n: 2 },
  { z: -4.4, w: 0.42, top: 0.3, bot: 0.03, y: 0.74, n: 2.2 },
  { z: -3.9, w: 0.49, top: 0.45, bot: 0.03, y: 0.75, n: 2.2 },
  { z: -3.4, w: 0.51, top: 0.52, bot: 0.03, y: 0.76, n: 2.2 },
  { z: -2.9, w: 0.51, top: 0.52, bot: 0.03, y: 0.77, n: 2.2 },
  { z: -2.4, w: 0.49, top: 0.47, bot: 0.03, y: 0.78, n: 2.2 },
  { z: -1.9, w: 0.45, top: 0.41, bot: 0.03, y: 0.8, n: 2.2 },
  { z: -1.4, w: 0.37, top: 0.3, bot: 0.03, y: 0.82, n: 2.1 },
  { z: -1.0, w: 0.2, top: 0.12, bot: 0.03, y: 0.86, n: 2 },
];

// cropped delta: 46 degrees of leading-edge sweep, the trailing edge swept
// forward 3 degrees
const WING: WingStation[] = [
  { x: 0.7, le: -1.26, te: 5.42, y: -0.26, t: 0.05 },
  { x: 0.95, le: -1.0, te: 5.4, y: -0.27, t: 0.048 },
  { x: 5.3, le: 3.52, te: 5.15, y: -0.34, t: 0.035 },
];
const wle = (x: number) => -1.0 + (x - 0.95) * 1.04;
const wte = (x: number) => 5.4 - (x - 0.95) * 0.057;
// big close-coupled canards: 2.75 m out from the centre line, the leading
// edge swept 48 deg at the root easing to 42 deg, a squared trailing edge
const CANARD: WingStation[] = [
  { x: 0.55, le: -3.25, te: -0.75, y: 0.02, t: 0.05 },
  { x: 1.9, le: -2.05, te: -0.55, y: 0.08, t: 0.045 },
  { x: 2.75, le: -1.1, te: -0.8, y: 0.1, t: 0.04 },
];
const CANARD_PIVOT = -2.1;
// the fin: a 53 deg leading edge off the spine, the rudder's trailing edge
// a metre ahead of the SPECTRA pod's aft end (the pod overhangs the tip)
const FIN: WingStation[] = [
  { x: 0, le: 2.55, te: 6.4, t: 0.05 },
  { x: 2.7, le: 6.15, te: 6.7, t: 0.036 },
];
const RUDDER = { h0: 0.3, h1: 2.1, hinge: (h: number) => 5.8 + h * 0.07 };

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
  gs.moveTo(...S(-8.0, -0.3));
  gs.lineTo(...S(-5.7, 0.55));
  gs.lineTo(...S(-5.7, -0.6));
  gs.closePath();
  gs.fill();
  gb.fillStyle = 'rgba(88,94,99,0.6)';
  gb.beginPath();
  gb.ellipse(...B(0, -7.0), 0.44 * L.pb, 1.05 * L.pb, 0, 0, Math.PI * 2);
  gb.fill();
  // anti-glare ahead of the windscreen, cockpit well
  gt.fillStyle = 'rgba(52,56,60,0.7)';
  gt.beginPath();
  gt.moveTo(...T(-0.4, -4.95));
  gt.lineTo(...T(0.4, -4.95));
  gt.lineTo(...T(0.14, -5.65));
  gt.lineTo(...T(-0.14, -5.65));
  gt.closePath();
  gt.fill();
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.fillRect(...T(-0.46, -4.4), 0.92 * pt, 3.2 * pt);
  for (const z of [-5.7, -4.95, -3.0, -1.8, -0.4, 1.1, 2.7, 4.2, 5.4]) {
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
      line(g, [M(0.9, -2.95), M(2.6, -1.4)], 1.0, LINE_LIGHT); // canard
    }
    line(gt, [W(1.0, 0.8), W(1.9, 1.6), W(1.9, 3.7), W(1.0, 3.7)], 1.1, 'rgba(25,27,30,0.4)');
    if (sx < 0) roundel(gt, team, ...W(3.4, 3.4), 0.44 * pt);
    else roundel(gb, team, ...Wb(3.4, 3.4), 0.44 * L.pb);
  }
  line(gs, [S(-5.6, -0.2), S(-3.4, -0.2)], 1.3, LINE_LIGHT);
  line(gs, [S(-3.2, -0.72), S(3.0, -0.78)], 1.4, LINE);
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-5.5, -0.4), S(-4.8, -0.1));
  rect(gs, S(-0.8, 0.1), S(-0.1, 0.4));
  rect(gs, S(3.2, -0.5), S(4.0, -0.1));
  weather(gt, L.top.width, L.top.height, rnd, 0.8, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.6, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.7, [1, 0.1]);
  // soot around the nozzles
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(0.72 * sx, 5.8);
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
  L.sideDraw(5.1, 1.9, (g, x, y) => {
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
  L.sideText(team === 'blue' ? '4-GE' : '30-GF', 5.6, 1.05, 0.2 * ps, 'rgba(40,44,50,0.85)');
  L.sideText(team === 'blue' ? '142' : '118', 5.8, 0.2, 0.13 * ps, 'rgba(40,44,50,0.8)');
  L.sideDraw(-2.0, -0.45, (g, x, y) => roundel(g, team, x, y, 0.24 * ps));
  L.sideDraw(-4.6, 0.3, (g, x, y) => {
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

  const zs = mergeStations(stations(-7.95, -5.45, 30, 0.55, 0), stations(-5.45, -1.0, 50), stations(-1.0, 5.75, 80));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -7.7, 5.65, 40);

  // --- side intakes under the canards: the upper inboard corner leads, the
  // outer lip sweeps 1.2 m back in plan and the lower lip trails it
  const TX = curve([[-4.5, 0.54], [-1.5, 0.56], [1.4, 0.6]]);
  const TW = curve([[-4.5, 0.33], [-1.5, 0.36], [1.4, 0.25]]);
  const TY = curve([[-4.5, -0.37], [-1.5, -0.4], [1.4, -0.46]]);
  const TH = curve([[-4.5, 0.36], [-1.5, 0.35], [1.4, 0.27]]);
  const loop = (z: number) => dLoop(TX(z), TY(z), 2 * TW(z), TH(z));
  const inl = intake({
    loop,
    outer: stations(-4.5, 1.4, 44, 0.3, 0),
    lip: 0.04,
    depth: 1.9,
    n: 64,
    rake: (x, y) => -0.55 * (y - (TY(-4.5) + TH(-4.5))) + 1.6 * (x - 0.54),
    rakeFade: 2.4,
    fan: { cx: 0.9, cy: -0.4, r: 0.3 },
  });
  skin(both(inl.skin));
  v.addMesh(both(inl.duct), pm.duct);
  // half-cone shock body in the upper inner corner of each mouth, and the
  // canard shelf over the intake
  for (const sx of [-1, 1]) {
    const cone = lathe([[0.004, -4.72], [0.05, -4.55], [0.085, -4.25], [0.09, -3.85]], 14, 0.57 * sx, -0.14);
    skin(cone);
  }
  const shelf = loftProfile({
    stations: stations(-4.4, -1.3, 16),
    profile: (z) => {
      const u = sstep(-4.4, -3.0, z);
      const w = 0.6 + u * 0.6 - sstep(-2.2, -1.3, z) * 0.2;
      return [[0.5, -0.1], [w, -0.08 + u * 0.02], [w, -0.04 + u * 0.02], [0.5, 0.02 + u * 0.06]] as P2[];
    },
    sub: 2,
    capStart: true,
    capEnd: true,
  });
  skin(both(shelf));

  // --- canopy, seat, pilot (the seat reclined 29 deg, the eye 0.35 under the crown)
  v.cockpitEye.set(0, 0.93, -3.3);
  buildCanopy(v, CANOPY, -4.35, []);
  // 30M791 in the right fuselage side at the wing root: the muzzle matches the gun port in the jet's spec
  {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), pm.darkMetal);
    m.position.set(1.0, -0.2, -1.15);
    m.rotation.y = Math.PI;
    v.body.add(m);
  }
  addPilot(v, new THREE.Vector3(0, 0.93, -3.3), 0.29, { style: 'eu', stick: 'side', martinBaker: true });
  const shroud = loftProfile({
    stations: stations(-4.75, -4.35, 6),
    profile: (z) => {
      const u = sstep(-4.75, -4.35, z);
      return [[0, 0.3], [0.42, 0.32], [0.47, 0.64], [0.33, 0.72 - u * 0.06], [0, 0.74 - u * 0.06]] as P2[];
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
      { x0: 1.3, x1: 3.05, hinge: (x) => wte(x) - 0.82, kind: 'flap', maxDeg: 25 },
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
  const rail = roundBox(0.1, 0.1, 2.3, 0.03);
  rail.translate(5.36, -0.34, 4.1);
  skin(both(rail));
  // the inboard elevons' actuator fairings on the trailing-edge root
  for (const sx of [-1, 1]) skin(lathe([[0.004, 4.2], [0.15, 4.5], [0.17, 5.3], [0.15, 5.75], [0.004, 5.95]], 14, 1.38 * sx, -0.2));

  // --- canards (all-moving)
  const canard = wing({ sections: CANARD, chordPts: 22, spanSub: 6, tip: 'round', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? canard.clone() : mirror(canard));
    v.addSurface(g, paint, new THREE.Vector3(0.62 * side, 0.05, CANARD_PIVOT), new THREE.Vector3(1, 0, 0), 'canard', side, 20);
  }

  // --- fin with rudder, squared SPECTRA fairing on top, antenna at the root
  const m = finMatrix(0, 0.62, 0, 1);
  const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
  skin(f.fixed);
  v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', 0, 25);
  const tipBox = roundBox(0.15, 0.24, 1.55, 0.05);
  tipBox.translate(0, 3.28, 6.45);
  skin(tipBox);
  skin(lathe([[0.004, 5.4], [0.05, 5.5], [0.075, 5.7], [0.075, 5.7]], 12, 0, 3.28));
  skin(lathe([[0.075, 7.2], [0.07, 7.3], [0.004, 7.38]], 12, 0, 3.28));
  const rootPod = lathe([[0.004, 5.6], [0.1, 5.8], [0.13, 6.2], [0.12, 6.6], [0.004, 6.7]], 16, 0, 0.42);
  skin(rootPod);
  v.addNavLight(new THREE.Vector3(0, 3.41, 7.15), 'strobe');
  // dorsal spine fillet into the fin
  const fillet = loftProfile({
    stations: stations(0.9, 3.3, 12),
    profile: (z) => {
      const h = sstep(0.9, 3.2, z) * 0.3;
      const w = 0.2 - sstep(0.9, 3.3, z) * 0.12;
      const b = 0.74 - sstep(0.9, 3.3, z) * 0.12;
      return [[0, b - 0.03], [w, b], [w * 0.4, b + 0.04 + h], [0, b + 0.05 + h]] as P2[];
    },
    sub: 3,
    capStart: true,
    capEnd: true,
  });
  skin(fillet);

  // --- two close-set M88 nozzles, ending 0.9 m short of the SPECTRA pod
  for (const sx of [-1, 1]) {
    const nz = nozzle({ cx: 0.72 * sx, cy: 0.03, z0: 5.75, z1: 6.5, r0: 0.44, r1: 0.39, petals: 12, saw: 0.05, floor: 5.85 });
    const nzOut = v.addMesh(nz.outer, pm.nozzle);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.nozzles.push({ pos: new THREE.Vector3(0.72 * sx, 0.03, 6.45), radius: 0.36, depth: 0.63, area: nz.area });
  }
  v.buildFlames(4.8);
  // fairing between the nozzles
  skin(lathe([[0.14, 5.5], [0.15, 5.9], [0.12, 6.3], [0.05, 6.6], [0.004, 6.7]], 16, 0, 0.0));

  // --- OSF front-sector optronics ahead of the windscreen
  const osf = roundBox(0.17, 0.12, 0.5, 0.055);
  osf.translate(0, 0.74, -5.2);
  v.hideInCockpit.push(skin(osf));
  for (const dx of [-0.05, 0.05]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), pm.glass);
    w.position.set(dx, 0.75, -5.46);
    w.rotation.y = Math.PI;
    v.body.add(w);
    v.hideInCockpit.push(w);
  }

  // --- fixed in-flight refuelling probe: rises off the starboard side ahead
  // of the canopy and curves forward past the windscreen
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.5, 0.45, -4.3),
    new THREE.Vector3(0.48, 0.62, -4.8),
    new THREE.Vector3(0.42, 0.8, -5.4),
    new THREE.Vector3(0.36, 0.92, -5.9),
    new THREE.Vector3(0.33, 0.95, -6.15),
  ]);
  const tube = new THREE.TubeGeometry(path, 30, 0.036, 12, false);
  skin(tube);
  const nozzleTip = lathe([[0.036, -6.13], [0.05, -6.2], [0.046, -6.3], [0.025, -6.35], [0.004, -6.37]], 14, 0.33, 0.95);
  v.addMesh(nozzleTip, pm.darkMetal);
  skin(lathe([[0.004, -4.6], [0.06, -4.45], [0.075, -4.05], [0.05, -3.65], [0.004, -3.5]], 14, 0.55, 0.42));

  // --- 30M791 cannon port in the starboard wing root
  skin(lathe([[0.004, -1.9], [0.06, -1.75], [0.075, -1.4], [0.07, -0.9], [0.004, -0.6]], 14, 0.98, -0.3));
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.038, 12), pm.darkMetal);
  muzzle.position.set(0.98, -0.3, -1.78);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);

  // --- probes, antennas, lights
  v.addMesh(join([
    probe(new THREE.Vector3(0.3, -0.1, -6.6), 0.3, 0.011, new THREE.Vector3(0.12, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.3, -0.1, -6.6), 0.3, 0.011, new THREE.Vector3(-0.12, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.9, -0.2), 0.14, 0.2),
    blade(new THREE.Vector3(0, -0.8, 0.6), 0.16, 0.24, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.7, 0.3, -4.0), new THREE.Vector3(1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(-0.7, 0.3, -4.0), new THREE.Vector3(-1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(1.24, -0.1, 3.4), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-1.24, -0.1, 3.4), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-5.36, -0.28, 3.45), 'red');
  v.addNavLight(new THREE.Vector3(5.36, -0.28, 3.45), 'green');
  v.addNavLight(new THREE.Vector3(0, -0.84, 1.8), 'strobe');

  // --- landing gear: twin nose wheels under the intakes, mains fold forward into the fuselage
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.6, -3.8), axle: new THREE.Vector3(0, -1.75 + 0.25, -4.05), r: 0.25, w: 0.15, twin: true, retract: 'aft' },
    mains: { top: new THREE.Vector3(0.9, -0.8, 0.8), axle: new THREE.Vector3(1.35, -1.75 + 0.38, 1.1), r: 0.38, w: 0.23, retract: 'forward', outboard: 0.05 },
    doorColor: '#949ca1',
  });
}
