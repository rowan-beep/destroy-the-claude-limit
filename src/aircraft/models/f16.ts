// F-16C Fighting Falcon (Block 50): 15.0 m long with the pitot, 9.96 m span
// over the wingtip launchers, 4.88 m tall.
// Single seat under a frameless one-piece bubble canopy, the ventral "smile"
// intake with its splitter and the nose gear just behind the lip, curved
// strakes running forward from the 40-degree cropped-delta wing into the
// cockpit sides, full-span leading-edge flaps and inboard flaperons, all-moving
// stabilators with 10 degrees of anhedral on flat flanges either side of the
// engine, one tall fin, two ventral fins, the split speedbrake petals beside
// the F110 nozzle and permanent wingtip missile rails.

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
  // the radome droops: its underside runs nearly straight back to the intake
  // while the top climbs to the windscreen
  { z: -7.1, pts: round(0.012, -0.2) },
  { z: -6.85, pts: sec(0.15, -0.17, 0.15, 0.15, 2) },
  { z: -6.45, pts: sec(0.26, -0.13, 0.26, 0.26, 2) },
  { z: -5.95, pts: sec(0.35, -0.09, 0.36, 0.35, 2.05) },
  { z: -5.4, pts: sec(0.43, -0.06, 0.45, 0.42, 2.15) },
  { z: -5.0, pts: fwd(0.47, -0.5, 0.4, 0.0) },
  { z: -4.5, pts: fwd(0.51, -0.54, 0.43, 0.07) },
  { z: -3.9, pts: fwd(0.55, -0.56, 0.44, 0.11) },
  { z: -3.3, pts: fwd(0.57, -0.56, 0.45, 0.13) },
  // inside the intake's outer skin: the belly drops to the trunk here
  { z: -2.6, pts: trunk(-0.98, 0.42, 0.6, 0.5, 0.42) },
  { z: -2.0, pts: trunk(-1.2, 0.5, 0.64, 0.6, 0.45) },
  { z: -1.0, pts: trunk(-1.25, 0.57, 0.7, 0.65, 0.48) },
  { z: 0.5, pts: trunk(-1.24, 0.6, 0.78, 0.67, 0.52) },
  { z: 2.0, pts: trunk(-1.1, 0.58, 0.8, 0.65, 0.53) },
  { z: 3.4, pts: trunk(-0.8, 0.56, 0.76, 0.61, 0.52) },
  { z: 4.4, pts: sec(0.7, 0.0, 0.6, 0.58, 2.5, { cw: 0.84, cy: -0.08 }) },
  { z: 5.8, pts: sec(0.64, 0.0, 0.56, 0.56, 2.3, { cw: 0.88, cy: -0.08 }) },
  { z: 6.6, pts: sec(0.59, 0.0, 0.55, 0.55, 2.1, { cw: 0.72, cy: -0.08 }) },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

const CANOPY: Section[] = [
  { z: -4.78, w: 0.03, top: 0.02, bot: 0.02, y: 0.44, n: 2 },
  { z: -4.55, w: 0.3, top: 0.22, bot: 0.03, y: 0.44, n: 2.2 },
  { z: -4.2, w: 0.42, top: 0.45, bot: 0.03, y: 0.44, n: 2.2 },
  { z: -3.8, w: 0.48, top: 0.6, bot: 0.03, y: 0.44, n: 2.2 },
  { z: -3.3, w: 0.5, top: 0.64, bot: 0.03, y: 0.44, n: 2.2 },
  { z: -2.8, w: 0.47, top: 0.56, bot: 0.03, y: 0.44, n: 2.2 },
  { z: -2.45, w: 0.38, top: 0.38, bot: 0.03, y: 0.46, n: 2.2 },
  { z: -2.2, w: 0.22, top: 0.18, bot: 0.03, y: 0.5, n: 2.1 },
  { z: -2.05, w: 0.05, top: 0.04, bot: 0.02, y: 0.56, n: 2 },
];

// wing: the strake runs forward from the root, curving into the cockpit side
const WING: WingStation[] = [
  { x: 0.45, le: -4.6, te: 3.5, y: 0.07, t: 0.01 },
  { x: 0.62, le: -3.6, te: 3.48, y: 0.12, t: 0.014 },
  { x: 0.78, le: -2.45, te: 3.47, y: 0.11, t: 0.022 },
  { x: 0.92, le: -1.45, te: 3.46, y: 0.07, t: 0.032 },
  { x: 1.02, le: -0.95, te: 3.45, y: 0.05, t: 0.04 },
  { x: 4.72, le: 2.17, te: 3.25, y: 0.0, t: 0.04 },
];
const wle = (x: number) => -0.95 + (x - 1.02) * 0.843;
const wte = (x: number) => 3.45 - (x - 1.02) * 0.054;
const STAB: WingStation[] = [
  { x: 0.8, le: 4.58, te: 6.95, y: -0.11, t: 0.04 },
  { x: 2.79, le: 6.2, te: 6.95, y: -0.47, t: 0.03 },
];
const STAB_PIVOT = 5.75;
const FIN: WingStation[] = [
  { x: 0, le: 2.45, te: 6.55, t: 0.045 },
  { x: 2.25, le: 4.88, te: 6.0, t: 0.035 },
];
const RUDDER = { h0: 0.22, h1: 2.0, hinge: (h: number) => 5.95 - h * 0.244 };
const VENTRAL: WingStation[] = [
  { x: 0, le: 3.3, te: 4.85, t: 0.05 },
  { x: 0.58, le: 4.05, te: 4.78, t: 0.04 },
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
  gt.ellipse(...T(0, -6.25), 0.42 * pt, 0.95 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gs.fillStyle = 'rgba(112,118,123,0.55)';
  gs.beginPath();
  gs.moveTo(...S(-7.1, -0.03));
  gs.lineTo(...S(-5.35, 0.42));
  gs.lineTo(...S(-5.35, -0.44));
  gs.closePath();
  gs.fill();
  // the aerial refuelling door on the spine behind the canopy, with its guide lines
  gt.fillStyle = 'rgba(48,52,56,0.85)';
  gt.fillRect(...T(-0.17, -1.85), 0.34 * pt, 0.62 * pt);
  for (const sx of [-1, 1]) line(gt, [T(0.05 * sx, -1.2), T(0.05 * sx, 0.4)], 1.6, 'rgba(235,236,232,0.55)');
  // panel lines round the frames
  for (const z of [-5.35, -4.8, -2.4, -1.2, 0.2, 1.6, 3.0, 4.4, 5.6, 6.5]) {
    line(gt, [T(-0.85, z), T(0.85, z)], 1.3, LINE_LIGHT);
    line(gs, [S(z, -0.55), S(z, 0.62)], 1.5, LINE);
    line(gb, [B(-0.85, z), B(0.85, z)], 1.2, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    // spine panels and the long access doors along the body
    line(gt, [T(0.32 * sx, -2.0), T(0.32 * sx, 4.4)], 1.2, LINE_LIGHT);
    line(gt, [T(0.62 * sx, -0.6), T(0.62 * sx, 5.8)], 1.1, LINE_LIGHT);
    rivets(gt, T(0.32 * sx, -2.0), T(0.32 * sx, 4.4), 6, 0.9);
    // strake edge
    line(gt, [T(0.5 * sx, -4.4), T(0.68 * sx, -3.2), T(0.86 * sx, -2.0), T(1.02 * sx, -0.95)], 1.8, 'rgba(30,34,38,0.45)');
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      // front and rear spars, LEF hinge, flaperon, rib lines
      line(g, [M(1.05, wle(1.05) + 0.75), M(4.6, wle(4.6) + 0.2)], 1.2, LINE_LIGHT);
      line(g, [M(1.05, 2.75), M(4.6, 2.62)], 1.2, LINE_LIGHT);
      rivets(g, M(1.05, wle(1.05) + 0.75), M(4.6, wle(4.6) + 0.2), 7, 0.9);
      rivets(g, M(1.05, 2.75), M(4.6, 2.62), 7, 0.9);
      for (const x of [1.8, 2.5, 3.2, 3.9]) line(g, [M(x, wle(x) + 0.35), M(x, wte(x) - 0.7)], 1.0, LINE_LIGHT);
      line(g, [M(1.1, wte(1.1) - 0.62), M(3.55, wte(3.55) - 0.62)], 1.3, LINE);
      line(g, [M(1.05, wle(1.05) + 0.6), M(4.7, wle(4.7) + 0.18)], 1.3, LINE);
      // stabilator spar
      line(g, [M(0.9, 5.4), M(2.7, 6.45)], 1.0, LINE_LIGHT);
    }
    gt.save();
    gt.translate(...W(2.6, 1.9));
    gt.rotate(sx * 0.0);
    gt.fillStyle = 'rgba(42,45,48,0.5)';
    gt.font = `bold ${0.13 * pt}px Arial`;
    gt.textAlign = 'center';
    gt.fillText('NO STEP', 0, 0);
    gt.restore();
    if (sx < 0) roundel(gt, team, ...W(3.4, 2.5), 0.32 * pt);
    else roundel(gb, team, ...Wb(3.4, 2.5), 0.32 * L.pb);
  }
  // belly: the intake trunk's panels and the chaff / flare dispensers
  line(gb, [B(-0.5, -3.3), B(-0.55, 2.6)], 1.2, LINE_LIGHT);
  line(gb, [B(0.5, -3.3), B(0.55, 2.6)], 1.2, LINE_LIGHT);
  for (const sx of [-1, 1]) {
    gb.fillStyle = 'rgba(40,43,46,0.75)';
    gb.fillRect(...B(0.42 * sx - 0.09, 5.0), 0.18 * L.pb, 0.42 * L.pb);
  }
  // side: canopy rail, gun panel, intake trunk seams and access doors
  line(gs, [S(-4.8, 0.36), S(-2.3, 0.4)], 1.3, LINE_LIGHT);
  line(gs, [S(-3.3, -0.62), S(3.0, -0.6)], 1.4, LINE);
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-4.1, -0.3), S(-3.4, 0.05));
  rect(gs, S(-1.0, -0.35), S(-0.1, 0.1));
  rect(gs, S(1.6, -0.3), S(2.6, 0.1));
  rect(gs, S(3.8, -0.4), S(4.6, 0.0));
  weather(gt, L.top.width, L.top.height, rnd, 0.95, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.8, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.85, [1, 0.1]);
  // exhaust staining aft
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    const [x, y] = M(0, 6.6);
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
    const [x0, y0] = S(4.85, 2.78);
    g.fillRect(x0, y0, 1.15 * ps, 0.16 * ps);
  }
  L.sideText(team === 'blue' ? 'SK' : 'CP', 5.15, 1.75, 0.32 * ps, 'rgba(40,44,48,0.85)');
  L.sideText(team === 'blue' ? 'AF 91 416' : 'RF 47 216', 5.3, 1.12, 0.1 * ps, 'rgba(40,44,48,0.8)');
  L.sideDraw(5.4, 2.35, (g, x, y) => {
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
  L.sideDraw(0.4, -0.85, (g, x, y) => roundel(g, team, x, y, 0.26 * ps));
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
  L.sideDraw(-3.05, -0.95, (g, x, y) => {
    g.fillStyle = '#b8352a';
    g.fillRect(x - 0.012 * ps, y - 0.3 * ps, 0.024 * ps, 0.6 * ps);
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

// the ventral intake mouth: a wide, softly rounded "smile", flat across the top
const IHALF = (w: number, top: number, bot: number): P2[] => [
  [0, bot],
  [w * 0.55, bot + 0.015],
  [w * 0.88, bot + 0.1],
  [w, (top + bot) * 0.5 - 0.04],
  [w * 0.97, top - 0.09],
  [w * 0.72, top],
  [0, top],
];

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

  const zs = mergeStations(stations(-7.1, -5.35, 30, 0.55, 0), stations(-5.35, -2.0, 50), stations(-2.0, 6.6, 80));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -6.9, 6.5, 40);

  // --- the ventral intake: splitter gap ahead, merging into the belly aft
  const IW = curve([[-3.35, 0.52], [-2.4, 0.57], [-1.5, 0.6]]);
  const IT = curve([[-3.35, -0.62], [-2.5, -0.55], [-1.5, -0.5]]);
  const IB = curve([[-3.35, -1.28], [-2.4, -1.29], [-1.5, -1.26]]);
  const loop = (z: number) => ring(mirrorHalf(IHALF(IW(z), IT(z), IB(z))), [3, 3, 2, 2, 3, 3, 3, 3, 2, 2, 3, 3]);
  const ci = intake({
    loop,
    outer: stations(-3.35, -1.5, 24, 0.3, 0),
    lip: 0.045,
    depth: 2.4,
    n: 96,
    // the upper lip leads, the lower lip sits back
    rake: (_x, y) => -0.3 * (y + 0.6),
    fan: { cx: 0, cy: -0.6, r: 0.45 },
  });
  skin(ci.skin);
  v.addMesh(ci.duct, pm.duct);
  // splitter plate across the diverter gap, on two pillars
  const splitter = roundBox(0.7, 0.022, 0.55, 0.01);
  splitter.translate(0, -0.575, -3.12);
  skin(splitter);
  v.addMesh(stamp(join([-0.3, 0.3].map((x) => { const g = roundBox(0.035, 0.08, 0.8, 0.012); g.translate(x, -0.56, -2.9); return g; }))), paint);

  // --- canopy (frameless, gold tinted), seat and pilot
  v.cockpitEye.set(0, 0.86, -3.6);
  buildCanopy(v, CANOPY, -2.45, []);
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
    stations: stations(-4.55, -4.2, 6),
    profile: (z) => {
      const u = sstep(-4.55, -4.2, z);
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
      { x0: 1.05, x1: 4.72, hinge: (x) => wle(x) + 0.17 * (wte(x) - wle(x)), kind: 'lef', maxDeg: 25, leading: true },
      { x0: 1.1, x1: 3.55, hinge: (x) => wte(x) - 0.62, kind: 'flaperon', maxDeg: 20 },
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
  const rail = roundBox(0.075, 0.1, 1.95, 0.02);
  rail.translate(4.84, -0.02, 2.5);
  skin(rail);
  skin(mirror(rail));
  // --- all-moving stabilators (anhedral) on the flanges beside the engine
  const stab = wing({ sections: STAB, chordPts: 24, spanSub: 6, tip: 'round', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    const axis = new THREE.Vector3(1, -0.176 * side, 0).normalize();
    v.addSurface(g, paint, new THREE.Vector3(0.86 * side, -0.12, STAB_PIVOT), axis, 'stab', side, 25);
  }

  // --- fin with rudder; ventral fins canted out
  const f = finPanels(FIN, RUDDER, finMatrix(0, 0.6, 0, 1), { chordPts: 30 });
  skin(f.fixed);
  v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', 0, 30);
  // the fin-tip fairing (antennas and the anti-collision light)
  skin(lathe([[0.004, 4.85], [0.04, 5.0], [0.05, 5.6], [0.045, 6.05], [0.004, 6.2]], 14, 0, 2.86));
  v.addNavLight(new THREE.Vector3(0, 2.86, 6.15), 'strobe');
  // the fin root fairing and heat-exchanger scoop ahead of it
  const fillet = loftProfile({
    stations: stations(1.4, 3.0, 12),
    profile: (z) => {
      const h = sstep(1.4, 2.9, z) * 0.2;
      const w = 0.14 - sstep(1.4, 3.0, z) * 0.08;
      return [[0, 0.58], [w, 0.62], [w * 0.4, 0.67 + h], [0, 0.68 + h]] as P2[];
    },
    sub: 3,
    capStart: true,
    capEnd: true,
  });
  skin(fillet);
  skin(lathe([[0.004, 1.6], [0.05, 1.68], [0.06, 1.85], [0.05, 2.1], [0.004, 2.2]], 12, 0, 0.7));
  const vm = new THREE.Matrix4().makeRotationZ(-(Math.PI / 2 - (15 * Math.PI) / 180));
  vm.premultiply(new THREE.Matrix4().makeTranslation(0.5, -0.5, 0));
  const ventral = wing({ sections: VENTRAL, chordPts: 18, spanSub: 4, tip: 'round', thickPos: 0.45, matrix: vm });
  skin(ventral);
  skin(mirror(ventral));

  // --- the F110 and its nozzle
  const nz = nozzle({ cx: 0, cy: -0.01, z0: 6.55, z1: 7.15, r0: 0.55, r1: 0.47, petals: 15, saw: 0.05, floor: 6.62 });
  const nzOut = v.addMesh(nz.outer, pm.nozzle);
  const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
  nzIn.userData.detail = true;
  v.morphNozzle(nzOut, nzIn);
  v.nozzles.push({ pos: new THREE.Vector3(0, -0.01, 7.1), radius: 0.44, depth: 0.6, area: nz.area });
  v.buildFlames(6.0);

  // --- the speedbrake housings either side of the nozzle (the aft ends of the
  // flanges the stabilators sit on), each with a petal above and below that
  // split open like a clamshell
  for (const sx of [-1, 1]) {
    const hz = loftProfile({
      stations: stations(5.7, 7.2, 14),
      profile: (z) => {
        const t = sstep(6.9, 7.2, z);
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
    u.translate(sx * 0.65, 0.008, 6.72);
    up.push(u);
    const d = roundBox(0.32, 0.022, 1.0, 0.009);
    d.translate(sx * 0.65, -0.168, 6.72);
    dn.push(d);
  }
  const sbU = v.addSurface(stamp(join(up)), paint, new THREE.Vector3(0, 0.008, 6.22), new THREE.Vector3(-1, 0, 0), 'rudder', 0, 0);
  const sbD = v.addSurface(stamp(join(dn)), paint, new THREE.Vector3(0, -0.168, 6.22), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(sbU), 1);
  v.surfaces.splice(v.surfaces.indexOf(sbD), 1);
  v.speedbrake = { pivot: sbU.pivot, axis: sbU.axis, maxDeg: 60, more: [{ pivot: sbD.pivot, axis: sbD.axis }] };
  // the "beaver tail": the fin-root fairing carried on aft over the nozzle
  skin(loftProfile({
    stations: stations(5.6, 7.25, 16),
    profile: (z) => {
      const t = sstep(6.3, 7.25, z);
      const yb = 0.4 + sstep(6.4, 6.8, z) * 0.12;
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
    probe(new THREE.Vector3(0, -0.2, -7.08), 0.68, 0.013),
    probe(new THREE.Vector3(0.3, -0.12, -6.15), 0.17, 0.009, new THREE.Vector3(0.45, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.3, -0.12, -6.15), 0.17, 0.009, new THREE.Vector3(-0.45, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    // the IFF interrogator's "bird slicer" blades ahead of the windscreen
    ...[-5.6, -5.35, -5.1].map((z) => blade(new THREE.Vector3(0, 0.39, z), 0.07, 0.1)),
    blade(new THREE.Vector3(0, 0.66, 0.6), 0.16, 0.24),
    blade(new THREE.Vector3(0, -1.27, -0.6), 0.14, 0.22, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.53, 0.18, -4.0), new THREE.Vector3(1, 0.2, 0), new THREE.Vector3(0, 0, 1), 0.4, 0.035),
    formationStrip(new THREE.Vector3(-0.53, 0.18, -4.0), new THREE.Vector3(-1, 0.2, 0), new THREE.Vector3(0, 0, 1), 0.4, 0.035),
    formationStrip(new THREE.Vector3(0.75, -0.05, 2.8), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(-0.75, -0.05, 2.8), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-0.56, -0.85, -2.9), 'red');
  v.addNavLight(new THREE.Vector3(0.56, -0.85, -2.9), 'green');
  v.addNavLight(new THREE.Vector3(0, -1.3, 0.8), 'strobe');
  const hook = roundBox(0.06, 0.06, 1.0, 0.02);
  hook.translate(0, -0.56, 5.6);
  v.addMesh(hook, pm.darkMetal);

  // --- landing gear: the nose leg just behind the intake lip folds aft, the
  // mains fold forward into the fuselage under the wing roots
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -1.2, -2.75), axle: new THREE.Vector3(0, -2.0 + 0.23, -2.9), r: 0.23, w: 0.15, twin: false, retract: 'aft', doors: false },
    mains: { top: new THREE.Vector3(0.6, -0.95, 0.85), axle: new THREE.Vector3(1.18, -2.0 + 0.36, 1.0), r: 0.36, w: 0.22, retract: 'forward', outboard: 0.08 },
    doorColor: '#8e9499',
  });
}
