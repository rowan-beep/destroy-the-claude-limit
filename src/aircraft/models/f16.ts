// F-16C Fighting Falcon (Block 50/52): 15.03 m long with the pitot, 9.45 m span
// over the wingtip launchers, 5.09 m tall. Measured from a scale three-view.
// Single seat under a frameless one-piece bubble canopy, the ventral "smile"
// intake 4.6 m behind the pitot tip with the nose gear just behind the lip, the
// forebody's underside rising to the splitter, curved strakes running forward
// from the 40-degree cropped-delta wing into the cockpit sides, full-span
// leading-edge flaps and inboard flaperons, all-moving stabilators with 10
// degrees of anhedral on flat flanges either side of the engine, one tall fin
// with a swept trailing edge, two ventral fins, the split speedbrake petals
// beside the F110 nozzle and permanent wingtip missile rails.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, mirror, join, stamp, lathe, ring, mirrorHalf, Livery, skinMaterial, line, rivets, weather, prng, roundel, stencil, LINE, LINE_LIGHT, curve, sstep, roundBox } from './kit';
import { nozzle, intake, partMaterials, blade, probe, formationStrip, glassify } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';
import { finMatrix } from './kit';

const ANG = [-90, -72, -52, -34, -14, -4, 4, 14, 34, 52, 72, 90];

/**
 * One half cross-section, bottom centre round to top centre: half width w,
 * centre yc, depth below hb and height above ht (superellipse, exponent n).
 * A chine (`cw` at height `cy`) pulls the two near-horizontal points out into
 * the flat flanges the stabilators sit on.
 */
function sec(w: number, yc: number, hb: number, ht: number, n = 2.3, chine?: { cw: number; cy: number }): P2[] {
  return ANG.map((a, i) => {
    const r = (a * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    const x = w * Math.pow(Math.abs(c), 2 / n);
    const y = yc + (s < 0 ? -hb : ht) * Math.pow(Math.abs(s), 2 / n);
    if (chine && (i === 5 || i === 6)) return [chine.cw, chine.cy + (i === 5 ? -0.025 : 0.025)] as P2;
    return [x, y] as P2;
  });
}
const round = (r: number, yc = 0) => sec(r, yc, r, r, 2);

/**
 * The fuselage behind the intake lip is one piece with the intake trunk: a
 * rounded spine on top, flat sides out to the strakes, then the trunk's
 * slab sides tucking in under the wing roots down to its flat bottom.
 * bot / wl: trunk bottom and its half width; ws: side half width at the
 * strake line; top / wt: spine height and its shoulder half width.
 */
function trunk(bot: number, wl: number, ws: number, top: number, wt: number): P2[] {
  return [
    [0, bot],
    [wl * 0.68, bot + 0.005],
    [wl * 0.93, bot + 0.07],
    [wl, bot + 0.28],
    [wl + 0.03, Math.min(-0.42, bot + 0.6)],
    [ws, -0.14],
    [ws, 0.08],
    [ws * 0.93, 0.3],
    [wt, top - 0.12],
    [wt * 0.58, top - 0.03],
    [wt * 0.27, top],
    [0, top],
  ];
}

/** Cockpit stations: slab sides straight up to the canopy rails (the tub fits inside). */
function pit(w: number, bot: number, sill: number): P2[] {
  return [
    [0, bot],
    [w * 0.55, bot + 0.02],
    [w * 0.85, bot + 0.12],
    [w * 0.98, bot * 0.55],
    [w, -0.12],
    [w, 0.0],
    [w, 0.12],
    [w, 0.26],
    [w * 0.98, sill - 0.06],
    [w * 0.9, sill],
    [w * 0.45, sill + 0.02],
    [0, sill + 0.02],
  ];
}

/**
 * The forward fuselage between the radome and the intake: widest at the
 * forebody chine (the line the strakes grow out of), rounded above it up to
 * the canopy rails, and narrowing below it into a keel over the intake.
 * cy: chine height.
 */
function fwd(w: number, bot: number, top: number, cy: number): P2[] {
  return [
    [0, bot],
    [w * 0.3, bot + 0.02],
    [w * 0.58, bot + 0.12],
    [w * 0.8, bot + (cy - bot) * 0.5],
    [w * 0.95, cy - 0.1],
    [w, cy - 0.012],
    [w, cy + 0.012],
    [w * 0.965, cy + 0.1],
    [w * 0.91, top - 0.12],
    [w * 0.84, top - 0.03],
    [w * 0.42, top + 0.01],
    [0, top + 0.01],
  ];
}

const BODY = keyedProfile([
  // the radome droops: its underside runs nearly straight back while the top climbs to the windscreen
  { z: -7.37, pts: round(0.012, -0.25) },
  { z: -7.1, pts: sec(0.13, -0.21, 0.1, 0.1, 2) },
  { z: -6.84, pts: sec(0.25, -0.18, 0.18, 0.18, 2) },
  { z: -6.34, pts: sec(0.37, -0.11, 0.29, 0.29, 2) },
  { z: -5.84, pts: sec(0.46, -0.03, 0.37, 0.37, 2.05) },
  { z: -5.34, pts: sec(0.5, 0.04, 0.42, 0.42, 2.15) },
  // the forebody: its keel rises toward the intake splitter
  { z: -4.9, pts: fwd(0.5, -0.34, 0.4, 0.0) },
  { z: -4.4, pts: fwd(0.53, -0.31, 0.43, 0.07) },
  { z: -3.9, pts: fwd(0.56, -0.29, 0.44, 0.11) },
  { z: -3.3, pts: fwd(0.58, -0.26, 0.45, 0.13) },
  // inside the intake's outer skin: the belly drops to the trunk here
  { z: -2.85, pts: trunk(-0.9, 0.42, 0.62, 0.5, 0.42) },
  { z: -2.0, pts: trunk(-0.92, 0.5, 0.66, 0.58, 0.45) },
  { z: -1.5, pts: trunk(-0.92, 0.55, 0.7, 0.68, 0.47) },
  { z: -1.0, pts: trunk(-0.92, 0.57, 0.72, 0.8, 0.48) },
  { z: -0.4, pts: trunk(-0.91, 0.59, 0.76, 0.77, 0.5) },
  { z: 0.5, pts: trunk(-0.9, 0.6, 0.8, 0.75, 0.52) },
  { z: 1.66, pts: trunk(-0.9, 0.6, 0.84, 0.75, 0.53) },
  { z: 2.4, pts: trunk(-0.82, 0.58, 0.88, 0.75, 0.53) },
  { z: 3.2, pts: trunk(-0.72, 0.56, 0.95, 0.75, 0.52) },
  { z: 4.0, pts: sec(0.68, 0.0, 0.72, 0.74, 2.5, { cw: 1.1, cy: -0.08 }) },
  { z: 5.0, pts: sec(0.62, 0.0, 0.66, 0.66, 2.3, { cw: 1.1, cy: -0.08 }) },
  { z: 5.8, pts: sec(0.56, 0.0, 0.52, 0.55, 2.1, { cw: 1.08, cy: -0.08 }) },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

// the bubble: tallest over the pilot's head 4.5 m from the pitot tip, running well aft of the seat
const CANOPY: Section[] = [
  { z: -4.95, w: 0.03, top: 0.02, bot: 0.02, y: 0.42, n: 2 },
  { z: -4.7, w: 0.3, top: 0.338, bot: 0.03, y: 0.412, n: 2.2 },
  { z: -4.34, w: 0.42, top: 0.568, bot: 0.03, y: 0.412, n: 2.2 },
  { z: -3.84, w: 0.48, top: 0.734, bot: 0.03, y: 0.406, n: 2.2 },
  { z: -3.34, w: 0.5, top: 0.776, bot: 0.03, y: 0.404, n: 2.2 },
  { z: -2.84, w: 0.48, top: 0.792, bot: 0.03, y: 0.358, n: 2.2 },
  { z: -2.34, w: 0.45, top: 0.631, bot: 0.03, y: 0.429, n: 2.2 },
  { z: -1.84, w: 0.36, top: 0.416, bot: 0.03, y: 0.544, n: 2.1 },
  { z: -1.4, w: 0.2, top: 0.175, bot: 0.03, y: 0.695, n: 2 },
  { z: -1.1, w: 0.04, top: 0.02, bot: 0.02, y: 0.8, n: 2 },
];

// wing: the strake runs forward from the root, curving into the cockpit side; the leading edge
// swept 39 degrees from 6.8 m behind the pitot tip, the trailing edge all but straight
const wle = (x: number) => -1.04 + (x - 1.4) * 0.8125;
const wte = (x: number) => 2.75 - (x - 1.4) * 0.034;
const WING: WingStation[] = [
  { x: 0.52, le: -5.2, te: 2.76, y: 0.07, t: 0.008 },
  { x: 0.58, le: -5.09, te: 2.76, y: 0.09, t: 0.009 },
  { x: 0.64, le: -4.84, te: 2.76, y: 0.11, t: 0.011 },
  { x: 0.71, le: -4.34, te: 2.76, y: 0.12, t: 0.014 },
  { x: 0.77, le: -3.84, te: 2.76, y: 0.12, t: 0.018 },
  { x: 0.84, le: -3.34, te: 2.76, y: 0.11, t: 0.022 },
  { x: 0.95, le: -2.84, te: 2.76, y: 0.1, t: 0.026 },
  { x: 1.1, le: -2.34, te: 2.76, y: 0.08, t: 0.03 },
  { x: 1.25, le: -1.84, te: 2.755, y: 0.06, t: 0.036 },
  { x: 1.35, le: -1.34, te: 2.75, y: 0.05, t: 0.04 },
  { x: 1.4, le: wle(1.4), te: wte(1.4), y: 0.05, t: 0.04 },
  { x: 4.65, le: wle(4.65), te: wte(4.65), y: 0.0, t: 0.04 },
];
const STAB: WingStation[] = [
  { x: 1.05, le: 3.89, te: 6.37, y: -0.11, t: 0.04 },
  { x: 2.79, le: 5.45, te: 6.37, y: -0.41, t: 0.03 },
];
const STAB_PIVOT = 5.3;
// the fin: 2.55 m above the spine, its trailing edge swept so the tip overhangs the nozzle
const FIN: WingStation[] = [
  { x: 0, le: 3.02, te: 5.98, t: 0.045 },
  { x: 2.55, le: 5.6, te: 6.95, t: 0.035 },
];
const RUDDER = { h0: 0.22, h1: 2.25, hinge: (h: number) => 5.25 + h * 0.5 };
const VENTRAL: WingStation[] = [
  { x: -0.25, le: 2.6, te: 4.1, t: 0.05 },
  { x: 0, le: 2.6, te: 4.1, t: 0.05 },
  { x: 0.8, le: 3.05, te: 3.5, t: 0.04 },
];

function livery(team: string): Livery {
  const L = new Livery({ half: 8.0, z0: -8.0, len: 16, y0: -2.2, height: 5.4 });
  const { gt, gb, gs } = L;
  const rnd = prng(16);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // radome: a slightly different grey, with its joint ring
  gt.fillStyle = 'rgba(112,118,123,0.55)';
  gt.beginPath();
  gt.ellipse(...T(0, -6.35), 0.5 * pt, 1.02 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gs.fillStyle = 'rgba(112,118,123,0.55)';
  gs.beginPath();
  gs.moveTo(...S(-7.37, -0.25));
  gs.lineTo(...S(-5.34, 0.46));
  gs.lineTo(...S(-5.34, -0.38));
  gs.closePath();
  gs.fill();
  // the aerial refuelling door on the spine behind the canopy, with its guide lines
  gt.fillStyle = 'rgba(48,52,56,0.85)';
  gt.fillRect(...T(-0.17, -0.95), 0.34 * pt, 0.62 * pt);
  for (const sx of [-1, 1]) line(gt, [T(0.05 * sx, -0.3), T(0.05 * sx, 1.1)], 1.2, 'rgba(235,236,232,0.4)');
  // panel lines round the frames
  for (const z of [-5.34, -4.8, -2.4, -1.2, 0.2, 1.6, 2.9, 4.0, 4.9, 5.7]) {
    line(gt, [T(-0.85, z), T(0.85, z)], 1.3, LINE_LIGHT);
    line(gs, [S(z, -0.55), S(z, 0.62)], 1.5, LINE);
    line(gb, [B(-0.85, z), B(0.85, z)], 1.2, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    // spine panels and the long access doors along the body
    line(gt, [T(0.32 * sx, -2.0), T(0.32 * sx, 4.4)], 1.2, LINE_LIGHT);
    line(gt, [T(0.62 * sx, -0.6), T(0.62 * sx, 5.2)], 1.1, LINE_LIGHT);
    rivets(gt, T(0.32 * sx, -2.0), T(0.32 * sx, 4.4), 6, 0.9);
    // strake edge
    line(gt, [T(0.52 * sx, -5.2), T(0.64 * sx, -4.84), T(0.77 * sx, -3.84), T(0.95 * sx, -2.84), T(1.25 * sx, -1.84), T(1.4 * sx, -1.04)], 1.8, 'rgba(30,34,38,0.45)');
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      // front and rear spars, LEF hinge, flaperon, rib lines
      line(g, [M(1.4, wle(1.4) + 0.75), M(4.6, wle(4.6) + 0.2)], 1.2, LINE_LIGHT);
      line(g, [M(1.4, 1.95), M(4.6, 2.3)], 1.2, LINE_LIGHT);
      rivets(g, M(1.4, wle(1.4) + 0.75), M(4.6, wle(4.6) + 0.2), 7, 0.9);
      rivets(g, M(1.4, 1.95), M(4.6, 2.3), 7, 0.9);
      for (const x of [1.8, 2.5, 3.2, 3.9]) line(g, [M(x, wle(x) + 0.3), M(x, wte(x) - 0.66)], 1.0, LINE_LIGHT);
      line(g, [M(1.4, wte(1.4) - 0.62), M(3.6, wte(3.6) - 0.62)], 1.3, LINE);
      line(g, [M(1.4, wle(1.4) + 0.6), M(4.62, wle(4.62) + 0.18)], 1.3, LINE);
      // stabilator spar
      line(g, [M(1.1, 4.9), M(2.7, 5.95)], 1.0, LINE_LIGHT);
    }
    gt.save();
    gt.translate(...W(2.3, 1.25));
    gt.rotate(sx * 0.0);
    gt.fillStyle = 'rgba(42,45,48,0.5)';
    gt.font = `bold ${0.13 * pt}px Arial`;
    gt.textAlign = 'center';
    gt.fillText('NO STEP', 0, 0);
    gt.restore();
    if (sx < 0) roundel(gt, team, ...W(3.3, 1.75), 0.32 * pt);
    else roundel(gb, team, ...Wb(3.3, 1.75), 0.32 * L.pb);
  }
  // belly: the intake trunk's panels and the chaff / flare dispensers
  line(gb, [B(-0.5, -3.3), B(-0.55, 2.6)], 1.2, LINE_LIGHT);
  line(gb, [B(0.5, -3.3), B(0.55, 2.6)], 1.2, LINE_LIGHT);
  for (const sx of [-1, 1]) {
    gb.fillStyle = 'rgba(40,43,46,0.75)';
    gb.fillRect(...B(0.42 * sx - 0.09, 4.4), 0.18 * L.pb, 0.42 * L.pb);
  }
  // side: canopy rail, gun panel, intake trunk seams and access doors
  line(gs, [S(-4.8, 0.36), S(-1.2, 0.62)], 1.3, LINE_LIGHT);
  line(gs, [S(-3.3, -0.62), S(3.0, -0.6)], 1.4, LINE);
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-4.1, -0.3), S(-3.4, 0.05));
  rect(gs, S(-1.0, -0.35), S(-0.1, 0.1));
  rect(gs, S(1.6, -0.3), S(2.6, 0.1));
  rect(gs, S(3.4, -0.4), S(4.2, 0.0));
  weather(gt, L.top.width, L.top.height, rnd, 0.95, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.8, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.85, [1, 0.1]);
  // exhaust staining aft
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    const [x, y] = M(0, 5.9);
    const gr = g.createLinearGradient(x, y - 1.8 * s, x, y);
    gr.addColorStop(0, 'rgba(40,36,30,0)');
    gr.addColorStop(1, 'rgba(40,36,30,0.35)');
    g.fillStyle = gr;
    g.fillRect(x - 0.6 * s, y - 1.8 * s, 1.2 * s, 1.8 * s);
  }
  L.copySides();
  const teamCol = team === 'blue' ? '#2d4d8e' : '#9a2521';
  // fin-tip stripe, tail code, serial (both sides read the right way round)
  for (const g of [L.gs, L.gr]) {
    g.fillStyle = teamCol;
    const [x0, y0] = S(5.42, 3.06);
    g.fillRect(x0, y0, 1.5 * ps, 0.16 * ps);
  }
  L.sideText(team === 'blue' ? 'SK' : 'CP', 5.2, 1.85, 0.32 * ps, 'rgba(40,44,48,0.85)');
  L.sideText(team === 'blue' ? 'AF 91 416' : 'RF 47 216', 5.3, 1.25, 0.1 * ps, 'rgba(40,44,48,0.8)');
  L.sideDraw(5.8, 2.5, (g, x, y) => {
    g.fillStyle = 'rgba(232,233,228,0.85)';
    g.beginPath();
    g.arc(x, y, 0.14 * ps, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = teamCol;
    g.beginPath();
    g.arc(x, y, 0.1 * ps, 0, Math.PI * 2);
    g.fill();
  });
  // national insignia on the intake trunk under the wing
  L.sideDraw(0.4, -0.6, (g, x, y) => roundel(g, team, x, y, 0.2 * ps));
  // the RESCUE arrow under the canopy, intake warning, nose number
  L.sideDraw(-4.2, -0.05, (g, x, y) => {
    g.strokeStyle = 'rgba(40,44,48,0.75)';
    g.lineWidth = 0.012 * ps;
    g.strokeRect(x - 0.32 * ps, y - 0.06 * ps, 0.5 * ps, 0.12 * ps);
    g.beginPath();
    g.moveTo(x + 0.18 * ps, y - 0.09 * ps);
    g.lineTo(x + 0.3 * ps, y);
    g.lineTo(x + 0.18 * ps, y + 0.09 * ps);
    g.closePath();
    g.stroke();
    stencil(g, 'RESCUE', x - 0.07 * ps, y + 0.03 * ps, 0.065 * ps, 'rgba(40,44,48,0.8)');
  });
  L.sideText(team === 'blue' ? '0416' : '216', -5.0, -0.3, 0.12 * ps, 'rgba(40,44,48,0.8)');
  L.sideDraw(-2.35, -0.7, (g, x, y) => {
    g.fillStyle = '#b8352a';
    g.fillRect(x - 0.012 * ps, y - 0.18 * ps, 0.024 * ps, 0.36 * ps);
  });
  L.sideDraw(-4.6, 0.25, (g, x, y) => {
    g.fillStyle = '#c9402c';
    g.beginPath();
    g.moveTo(x, y - 0.07 * ps);
    g.lineTo(x + 0.07 * ps, y + 0.05 * ps);
    g.lineTo(x - 0.07 * ps, y + 0.05 * ps);
    g.closePath();
    g.fill();
  });
  return L;
}

const liveries = new Map<string, Livery>();

// the ventral intake mouth, seen head on: a wide crescent "smile" -- the lower
// lip curves down deepest in the middle and the upper lip sags with it, the
// two meeting in tight rounded corners that sit highest, at the sides
const IHALF = (w: number, top: number, bot: number): P2[] => {
  const h = top - bot;
  return [
    [0, bot],
    [w * 0.45, bot + h * 0.03],
    [w * 0.76, bot + h * 0.13],
    [w * 0.95, bot + h * 0.36],
    [w, bot + h * 0.66],
    [w * 0.94, top - h * 0.03],
    [w * 0.64, top - h * 0.05],
    [0, top - h * 0.07],
  ];
};

export function buildF16(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#7a8187'), bottom: new THREE.Color('#8e9499'), livery: L, roughness: 0.55, metalness: 0.05 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-7.37, -5.34, 34, 0.55, 0), stations(-5.34, -2.0, 50), stations(-2.0, 5.8, 80));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -7.2, 5.7, 40);

  // --- the ventral intake: splitter gap ahead, merging into the belly aft
  const IW = curve([[-3.2, 0.5], [-2.4, 0.55], [-1.7, 0.58]]);
  const IT = curve([[-3.2, -0.5], [-2.5, -0.46], [-1.7, -0.44]]);
  const IB = curve([[-3.2, -0.935], [-2.4, -0.94], [-1.7, -0.93]]);
  const loop = (z: number) => ring(mirrorHalf(IHALF(IW(z), IT(z), IB(z))), [3, 3, 3, 2, 2, 3, 3, 3, 3, 2, 2, 3, 3, 3]);
  const ci = intake({
    loop,
    outer: stations(-3.2, -1.7, 24, 0.3, 0),
    lip: 0.045,
    depth: 2.4,
    n: 96,
    // the mouth is steeply raked: the upper lip juts forward like a hood and
    // the sides sweep back to a lower lip half a metre further aft
    rake: (_x, y) => -0.8 * (y + 0.5),
    fan: { cx: 0, cy: -0.52, r: 0.4 },
  });
  skin(ci.skin);
  v.addMesh(ci.duct, pm.duct);
  // --- canopy (frameless, gold tinted), seat and pilot
  v.cockpitEye.set(0, 0.86, -3.6);
  buildCanopy(v, CANOPY, -1.85, []);
  if (v.canopy) {
    const gm = (v.canopy.material as THREE.MeshStandardMaterial).clone();
    // the gold of the canopy's radar-reflective coating, lighter than the F-22's
    gm.color.set('#8a7a4e');
    gm.opacity = 0.42;
    gm.metalness = 0.55;
    gm.roughness = 0.04;
    gm.envMapIntensity = 1.8;
    glassify(gm, 0.95);
    v.canopy.material = gm;
  }
  // ACES II tilted back 30 degrees, side-stick on the right console
  addPilot(v, new THREE.Vector3(0, 0.86, -3.6), 0.45, { style: 'us', stick: 'side', martinBaker: false });
  const shroud = loftProfile({
    stations: stations(-4.72, -4.37, 6),
    profile: (z) => {
      const u = sstep(-4.72, -4.37, z);
      return [[0, 0.16], [0.38, 0.18], [0.42, 0.44], [0.3, 0.52 - u * 0.05], [0, 0.54 - u * 0.05]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));

  // --- wing: full-span leading-edge flaps, inboard flaperons
  const panels = wingPanels(
    WING,
    [
      { x0: 1.42, x1: 4.65, hinge: (x) => wle(x) + 0.17 * (wte(x) - wle(x)), kind: 'lef', maxDeg: 25, leading: true },
      { x0: 1.42, x1: 3.6, hinge: (x) => wte(x) - 0.62, kind: 'flaperon', maxDeg: 20 },
    ],
    { chordPts: 34, thickPos: 0.4 },
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
  // LAU-129 launch rails on the wingtips, always fitted
  const rail = roundBox(0.075, 0.1, 2.6, 0.02);
  rail.translate(4.69, -0.02, 1.65);
  skin(rail);
  skin(mirror(rail));
  // --- all-moving stabilators (anhedral) on the flanges beside the engine
  const stab = wing({ sections: STAB, chordPts: 24, spanSub: 6, tip: 'round', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    const axis = new THREE.Vector3(1, -0.176 * side, 0).normalize();
    v.addSurface(g, paint, new THREE.Vector3(1.1 * side, -0.12, STAB_PIVOT), axis, 'stab', side, 25);
  }

  // --- fin with rudder; ventral fins canted out
  const f = finPanels(FIN, RUDDER, finMatrix(0, 0.6, 0, 1), { chordPts: 30 });
  skin(f.fixed);
  v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', 0, 30);
  // the fin-tip fairing (antennas and the anti-collision light)
  skin(lathe([[0.004, 5.45], [0.04, 5.62], [0.052, 6.3], [0.046, 6.95], [0.004, 7.19]], 14, 0, 3.2));
  v.addNavLight(new THREE.Vector3(0, 3.2, 7.15), 'strobe');
  // the fin root fairing and heat-exchanger scoop ahead of it
  const fillet = loftProfile({
    stations: stations(1.4, 3.6, 14),
    profile: (z) => {
      const h = sstep(1.4, 3.6, z) * 0.36;
      const w = 0.14 - sstep(1.4, 3.6, z) * 0.08;
      return [[0, 0.64], [w, 0.69], [w * 0.4, 0.75 + h], [0, 0.76 + h]] as P2[];
    },
    sub: 3,
    capStart: true,
    capEnd: true,
  });
  skin(fillet);
  skin(lathe([[0.004, 0.7], [0.05, 0.78], [0.06, 0.95], [0.05, 1.2], [0.004, 1.3]], 12, 0, 0.73));
  const vm = new THREE.Matrix4().makeRotationZ(-(Math.PI / 2 - (15 * Math.PI) / 180));
  vm.premultiply(new THREE.Matrix4().makeTranslation(0.5, -0.55, 0));
  const ventral = wing({ sections: VENTRAL, chordPts: 18, spanSub: 4, tip: 'round', thickPos: 0.45, matrix: vm });
  skin(ventral);
  skin(mirror(ventral));

  // --- the F110 and its nozzle
  const nz = nozzle({ cx: 0, cy: 0.0, z0: 5.75, z1: 6.76, r0: 0.54, r1: 0.43, petals: 15, saw: 0.05, floor: 5.84 });
  const nzOut = v.addMesh(nz.outer, pm.nozzle);
  const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
  nzIn.userData.detail = true;
  v.morphNozzle(nzOut, nzIn);
  v.nozzles.push({ pos: new THREE.Vector3(0, 0.0, 6.7), radius: 0.41, depth: 0.6, area: nz.area });
  v.buildFlames(6.0);

  // --- the speedbrake housings either side of the nozzle (the aft ends of the
  // flanges the stabilators sit on), each with a petal above and below that
  // split open like a clamshell
  for (const sx of [-1, 1]) {
    const hz = loftProfile({
      stations: stations(4.9, 6.42, 14),
      profile: (z) => {
        const t = sstep(6.12, 6.42, z);
        const w = 0.15 - t * 0.04, h = 0.075 - t * 0.03;
        return [[-w, -0.08 - h], [w, -0.08 - h], [w + 0.02, -0.08], [w, -0.08 + h], [-w, -0.08 + h], [-w - 0.01, -0.08]] as P2[];
      },
      sub: 2,
      full: true,
      capStart: true,
      capEnd: true,
    });
    hz.translate(sx * 0.65, 0, 0);
    skin(hz);
  }
  const up: THREE.BufferGeometry[] = [], dn: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const u = roundBox(0.32, 0.022, 1.0, 0.009);
    u.translate(sx * 0.65, 0.008, 5.92);
    up.push(u);
    const d = roundBox(0.32, 0.022, 1.0, 0.009);
    d.translate(sx * 0.65, -0.168, 5.92);
    dn.push(d);
  }
  const sbU = v.addSurface(stamp(join(up)), paint, new THREE.Vector3(0, 0.008, 5.42), new THREE.Vector3(-1, 0, 0), 'rudder', 0, 0);
  const sbD = v.addSurface(stamp(join(dn)), paint, new THREE.Vector3(0, -0.168, 5.42), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(sbU), 1);
  v.surfaces.splice(v.surfaces.indexOf(sbD), 1);
  v.speedbrake = { pivot: sbU.pivot, axis: sbU.axis, maxDeg: 60, more: [{ pivot: sbD.pivot, axis: sbD.axis }] };
  // the "beaver tail": the fin-root fairing carried on aft over the nozzle
  skin(loftProfile({
    stations: stations(4.9, 6.5, 16),
    profile: (z) => {
      const t = sstep(5.6, 6.5, z);
      const yb = 0.4 + sstep(5.7, 6.1, z) * 0.12;
      const w = 0.16 - t * 0.07, h = 0.2 - t * 0.12;
      return [[0, yb], [w, yb + 0.02], [w * 0.9, yb + h * 0.6], [w * 0.55, yb + h], [0, yb + h + 0.015]] as P2[];
    },
    sub: 3,
    capEnd: true,
  }));

  // --- the M61A1 in the left strake: the gun port and its blast fairing
  skin(lathe([[0.004, -3.75], [0.05, -3.62], [0.06, -3.3], [0.05, -2.9], [0.004, -2.7]], 14, -0.58, 0.3));
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.038, 12), pm.darkMetal);
  muzzle.position.set(-0.58, 0.3, -3.63);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);

  // --- probes, antennas, lights, hook
  v.addMesh(join([
    probe(new THREE.Vector3(0, -0.25, -7.36), 0.42, 0.013),
    probe(new THREE.Vector3(0.39, -0.09, -6.15), 0.17, 0.009, new THREE.Vector3(0.45, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.39, -0.09, -6.15), 0.17, 0.009, new THREE.Vector3(-0.45, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    // the IFF interrogator's "bird slicer" blades ahead of the windscreen
    ...[-5.6, -5.35, -5.1].map((z) => blade(new THREE.Vector3(0, 0.42, z), 0.07, 0.1)),
    blade(new THREE.Vector3(0, 0.74, 0.2), 0.16, 0.24),
    blade(new THREE.Vector3(0, -0.92, -0.6), 0.14, 0.22, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.53, 0.18, -4.0), new THREE.Vector3(1, 0.2, 0), new THREE.Vector3(0, 0, 1), 0.4, 0.035),
    formationStrip(new THREE.Vector3(-0.53, 0.18, -4.0), new THREE.Vector3(-1, 0.2, 0), new THREE.Vector3(0, 0, 1), 0.4, 0.035),
    formationStrip(new THREE.Vector3(0.75, -0.05, 2.8), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(-0.75, -0.05, 2.8), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-0.58, -0.7, -2.2), 'red');
  v.addNavLight(new THREE.Vector3(0.58, -0.7, -2.2), 'green');
  v.addNavLight(new THREE.Vector3(0, -0.92, 0.8), 'strobe');
  const hook = roundBox(0.06, 0.06, 1.0, 0.02);
  hook.translate(0, -0.52, 4.9);
  v.addMesh(hook, pm.darkMetal);

  // --- landing gear: the nose leg just behind the intake lip folds aft, the
  // mains fold forward into the fuselage under the wing roots
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.9, -2.1), axle: new THREE.Vector3(0, -2.0 + 0.23, -2.25), r: 0.23, w: 0.15, twin: false, retract: 'aft', doors: false },
    mains: { top: new THREE.Vector3(0.6, -0.85, 0.95), axle: new THREE.Vector3(1.18, -2.0 + 0.36, 1.1), r: 0.36, w: 0.22, retract: 'forward', outboard: 0.08, well: { dx: 0.25, w: 0.6, dy: -0.06 } },
    doorColor: '#8e9499',
  });
}
