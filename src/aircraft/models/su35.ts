// Sukhoi Su-35S: 21.9 m long, 14.9 m span, 5.9 m tall.
// The Flanker layout: a long drooped nose with the OLS-35 ball ahead of a big
// one-piece bubble canopy, a wide blended lifting body with sharp leading-edge
// root extensions, two widely spaced engine nacelles underneath with raked
// rectangular intakes, a tunnel between them, tail booms outboard carrying
// the vertical fins, ventral fins and all-moving stabilators, a central
// "sting" tail cone, and two AL-41F1S nozzles that swivel (3D thrust vectoring).
// Unlike the earlier Flankers there is no dorsal airbrake: the rudders splay
// outward to brake.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { Section } from './builder';
import {
  P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect,
  Livery, skinMaterial, line, rivets, weather, prng, LINE, LINE_LIGHT, curve, sstep,
} from './kit';
import { nozzle, intake, partMaterials, seatAndPilot, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

function circ(R: number, yc: number): P2[] {
  const ang = [-90, -72, -52, -34, -16, -4, 4, 16, 34, 52, 72, 90];
  return ang.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}

// Right half, 12 control points, bottom centre -> top centre. Points 5-7 are
// the chine / LERX edge / wing-root line.
const BODY = keyedProfile([
  // the long radome droops a little below the cockpit line
  { z: -11.2, pts: circ(0.012, -0.2) },
  { z: -10.8, pts: circ(0.17, -0.18) },
  { z: -10.0, pts: circ(0.37, -0.12) },
  { z: -9.0, pts: circ(0.53, -0.06) },
  { z: -8.0, pts: [[0, -0.66], [0.34, -0.64], [0.54, -0.5], [0.63, -0.3], [0.66, -0.1], [0.665, -0.03], [0.66, 0.04], [0.63, 0.22], [0.55, 0.4], [0.42, 0.5], [0.22, 0.54], [0, 0.55]] },
  { z: -7.3, pts: [[0, -0.72], [0.38, -0.71], [0.6, -0.56], [0.7, -0.33], [0.73, -0.1], [0.74, -0.03], [0.735, 0.05], [0.7, 0.24], [0.62, 0.42], [0.52, 0.48], [0.4, 0.3], [0, 0.16]] },
  { z: -6.0, pts: [[0, -0.76], [0.42, -0.75], [0.66, -0.6], [0.78, -0.36], [0.83, -0.1], [0.88, -0.02], [0.85, 0.07], [0.78, 0.28], [0.66, 0.45], [0.55, 0.5], [0.42, 0.3], [0, 0.14]] },
  { z: -5.0, pts: [[0, -0.76], [0.45, -0.76], [0.72, -0.63], [0.86, -0.38], [0.95, -0.12], [1.22, 0.0], [1.18, 0.08], [0.9, 0.26], [0.72, 0.44], [0.58, 0.52], [0.44, 0.34], [0, 0.2]] },
  { z: -4.1, pts: [[0, -0.74], [0.5, -0.74], [0.8, -0.64], [0.95, -0.4], [1.08, -0.12], [1.52, 0.02], [1.46, 0.1], [1.05, 0.3], [0.82, 0.56], [0.62, 0.8], [0.34, 0.94], [0, 0.97]] },
  { z: -2.6, pts: [[0, -0.6], [0.6, -0.58], [0.95, -0.52], [1.2, -0.36], [1.5, -0.1], [1.95, 0.04], [1.9, 0.12], [1.4, 0.36], [1.02, 0.6], [0.66, 0.82], [0.34, 0.92], [0, 0.94]] },
  { z: -1.0, pts: [[0, -0.38], [0.7, -0.38], [1.3, -0.38], [1.8, -0.3], [2.1, -0.08], [2.4, 0.08], [2.35, 0.17], [1.9, 0.34], [1.35, 0.54], [0.8, 0.74], [0.4, 0.85], [0, 0.87]] },
  { z: 1.5, pts: [[0, -0.36], [0.7, -0.36], [1.4, -0.36], [2.0, -0.3], [2.25, -0.1], [2.35, 0.06], [2.32, 0.16], [1.95, 0.34], [1.45, 0.5], [0.8, 0.64], [0.4, 0.72], [0, 0.74]] },
  { z: 4.5, pts: [[0, -0.34], [0.7, -0.34], [1.4, -0.36], [1.85, -0.3], [2.05, -0.12], [2.15, 0.04], [2.12, 0.14], [1.85, 0.34], [1.35, 0.46], [0.85, 0.44], [0.4, 0.52], [0, 0.54]] },
  { z: 7.0, pts: [[0, -0.25], [0.45, -0.3], [0.9, -0.36], [1.3, -0.34], [1.65, -0.18], [1.85, 0.0], [1.83, 0.1], [1.65, 0.28], [1.25, 0.38], [0.8, 0.3], [0.35, 0.36], [0, 0.38]] },
  { z: 8.6, pts: [[0, -0.2], [0.2, -0.24], [0.35, -0.22], [0.45, -0.12], [0.5, 0.0], [0.5, 0.05], [0.49, 0.1], [0.45, 0.2], [0.35, 0.3], [0.25, 0.34], [0.12, 0.36], [0, 0.36]] },
  { z: 10.1, pts: circ(0.2, 0.08) },
  { z: 10.8, pts: circ(0.05, 0.08) },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

const CANOPY: Section[] = [
  { z: -8.15, w: 0.03, top: 0.02, bot: 0.02, y: 0.5, n: 2 },
  { z: -7.6, w: 0.42, top: 0.36, bot: 0.03, y: 0.52, n: 2.2 },
  { z: -7.0, w: 0.53, top: 0.62, bot: 0.03, y: 0.5, n: 2.2 },
  { z: -6.2, w: 0.56, top: 0.72, bot: 0.03, y: 0.5, n: 2.2 },
  { z: -5.3, w: 0.54, top: 0.7, bot: 0.03, y: 0.52, n: 2.2 },
  { z: -4.6, w: 0.44, top: 0.56, bot: 0.03, y: 0.56, n: 2.2 },
  { z: -4.0, w: 0.26, top: 0.3, bot: 0.03, y: 0.7, n: 2 },
];

// wing: 42 deg leading edge from the LERX kink, nearly straight trailing edge
const wle = (x: number) => -1.0 + (x - 2.3) * 0.9;
const wte = (x: number) => 4.9 - (x - 2.3) * 0.075;
const WING: WingStation[] = [
  { x: 1.8, le: -1.6, te: 4.95, y: 0.14, t: 0.05 },
  { x: 2.3, le: wle(2.3), te: wte(2.3), y: 0.13, t: 0.048 },
  { x: 7.0, le: wle(7.0), te: wte(7.0), y: 0.03, t: 0.034 },
];
const STAB: WingStation[] = [
  { x: 2.15, le: 7.4, te: 10.05, y: 0.02, t: 0.045 },
  { x: 5.0, le: 9.35, te: 10.35, y: -0.04, t: 0.032 },
];
const STAB_PIVOT_Z = 8.8;
// fins in their own frame: x = height above the boom
const FIN: WingStation[] = [
  { x: 0, le: 4.9, te: 9.05, t: 0.045 },
  { x: 0.6, le: 6.05, te: 9.1, t: 0.043 },
  { x: 3.35, le: 8.0, te: 9.4, t: 0.032 },
];
const RUDDER = { h0: 0.55, h1: 3.1, hinge: (h: number) => 8.45 + h * 0.06 };
const VENTRAL: WingStation[] = [
  { x: 0, le: 6.5, te: 8.5, t: 0.05 },
  { x: 0.62, le: 7.15, te: 8.5, t: 0.04 },
];
const BOOM_X = 2.0;
const NAC_X = 1.25;
const NOZZLE_Z = 8.6;

// Su-35S splinter scheme: hard-edged, angular fields of a pale and a dark
// blue-grey over the mid-tone base, stretched along the airframe
const CAMO_DARK = 'rgb(96,118,136)';
const CAMO_LIGHT = 'rgb(182,199,210)';

/** Clip a convex polygon to the half-plane (p - m) . n <= 0. */
function clipHalf(poly: P2[], mx: number, my: number, nx: number, ny: number): P2[] {
  const out: P2[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const da = (a[0] - mx) * nx + (a[1] - my) * ny;
    const db = (b[0] - mx) * nx + (b[1] - my) * ny;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Splinter camouflage cells: a jittered Voronoi tiling of the (a, b) box in a
 * sheared, stretched space, so every shard is straight-edged, the shards
 * interlock with no gaps or overlaps, and they run long and diagonal.
 */
function splinterCells(
  rnd: () => number, a0: number, a1: number, b0: number, b1: number, cell: number, shear: number, stretch: number,
): { pts: P2[]; tone: number }[] {
  // space: u = a * stretch, v = b + a * shear  (both straight-line preserving)
  const U = (a: number, b: number): P2 => [a * stretch, b + a * shear];
  const A = (u: number, v: number): P2 => [u / stretch, v - (u / stretch) * shear];
  const corners = [U(a0, b0), U(a1, b0), U(a0, b1), U(a1, b1)];
  const u0 = Math.min(...corners.map((c) => c[0])) - cell, u1 = Math.max(...corners.map((c) => c[0])) + cell;
  const v0 = Math.min(...corners.map((c) => c[1])) - cell, v1 = Math.max(...corners.map((c) => c[1])) + cell;
  const seeds: P2[] = [];
  for (let u = u0; u < u1; u += cell) for (let v = v0; v < v1; v += cell) seeds.push([u + rnd() * cell * 0.9, v + rnd() * cell * 0.9]);
  const cells: { pts: P2[]; tone: number }[] = [];
  seeds.forEach((s, i) => {
    let poly: P2[] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let j = 0; j < seeds.length && poly.length > 2; j++) {
      if (j === i) continue;
      const o = seeds[j];
      if (Math.abs(o[0] - s[0]) > cell * 3 || Math.abs(o[1] - s[1]) > cell * 3) continue;
      poly = clipHalf(poly, (s[0] + o[0]) / 2, (s[1] + o[1]) / 2, o[0] - s[0], o[1] - s[1]);
    }
    if (poly.length < 3) return;
    const r = rnd();
    cells.push({ pts: poly.map(([u, v]) => A(u, v)), tone: r < 0.36 ? 0 : r < 0.7 ? 2 : 1 });
  });
  return cells;
}

function livery(team: string, withCamo = true): Livery {
  const L = new Livery({ half: 11.5, z0: -11.6, len: 23, y0: -2.6, height: 7.0 });
  const { gt, gb, gs } = L;
  const rnd = prng(35);
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
  // --- splinter camouflage: interlocking angular fields over the top and sides --
  if (withCamo) {
    const cr = prng(351);
    const paintCells = (g: CanvasRenderingContext2D, M: (a: number, b: number) => P2, cells: { pts: P2[]; tone: number }[]) => {
      for (const c of cells) {
        if (c.tone === 1) continue; // the base tone shows through
        poly(g, c.pts.map(([a, b]) => M(a, b)), c.tone === 0 ? CAMO_DARK : CAMO_LIGHT);
      }
    };
    // plan view: shards swept back and outboard like the real scheme
    paintCells(gt, (x, z) => T(x, z), splinterCells(cr, -8, 8, -11.6, 11.4, 1.7, 0.42, 0.62));
    // sides: long shards sloping down and aft
    paintCells(gs, (z, y) => S(z, y), splinterCells(cr, -11.6, 11.4, -2.6, 4.4, 1.1, -0.18, 0.5));
  }
  // radome: grey-blue
  gt.fillStyle = 'rgba(96,112,124,0.9)';
  gt.beginPath();
  gt.ellipse(...T(0, -10.1), 0.55 * pt, 1.2 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gb.fillStyle = 'rgba(96,112,124,0.9)';
  gb.beginPath();
  gb.ellipse(...B(0, -10.1), 0.55 * L.pb, 1.2 * L.pb, 0, 0, Math.PI * 2);
  gb.fill();
  poly(gs, [S(-11.25, -0.2), S(-8.95, 0.47), S(-8.95, -0.59)], 'rgba(96,112,124,0.9)');
  // cockpit well
  gt.fillStyle = 'rgba(40,52,56,1)';
  gt.fillRect(...T(-0.5, -7.4), 1.0 * pt, 3.0 * pt);
  // --- panel lines ------------------------------------------------------------
  const frames = [-8.95, -7.9, -4.3, -3.1, -1.6, 0.2, 1.9, 3.4, 5.0, 6.6, 8.2, 9.6];
  for (const z of frames) {
    line(gt, [T(-1.6, z), T(1.6, z)], 1.4, LINE_LIGHT);
    line(gs, [S(z, -1.3), S(z, 0.78)], 1.5, LINE);
    line(gb, [B(-1.9, z), B(1.9, z)], 1.2, LINE_LIGHT);
  }
  line(gs, [S(-8.95, -0.05), S(-4.4, 0.0), S(-1.2, 0.08)], 1.5, LINE);
  line(gs, [S(-4.0, 0.42), S(2.0, 0.4), S(8.4, 0.3)], 1.3, LINE);
  line(gs, [S(-3.3, -1.36), S(8.5, -1.3)], 1.3, LINE);
  for (const sx of [-1, 1]) {
    line(gt, [T(0.4 * sx, -1.4), T(0.35 * sx, 8.4)], 1.2, LINE_LIGHT);
    line(gt, [T(1.2 * sx, -3.0), T(1.35 * sx, 7.2)], 1.2, LINE_LIGHT);
    line(gt, [T(0.88 * sx, -6.0), T(2.3 * sx, -1.0)], 1.2, LINE_LIGHT); // LERX
  }
  // spine access panels (the Su-35S has no dorsal airbrake)
  const spine = (z0: number, z1: number, w: number) => line(gt, [T(-w, z0), T(w, z0), T(w, z1), T(-w, z1)], 1.2, LINE, true);
  spine(-3.6, -2.5, 0.32);
  spine(-1.2, 0.0, 0.26);
  spine(3.8, 4.9, 0.22);
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-7.0, -0.5), S(-6.2, -0.15));
  rect(gs, S(-2.8, 0.1), S(-2.0, 0.4));
  rect(gs, S(2.4, -0.3), S(3.2, 0.05));
  rect(gs, S(5.6, -0.25), S(6.3, 0.1));
  // --- wings -------------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(2.4, wle(2.4) + 0.5), M(6.9, wle(6.9) + 0.25)], 1.3, LINE); // LE flap hinge
      line(g, [M(2.4, 2.0), M(6.6, 3.9)], 1.2, LINE_LIGHT);
      line(g, [M(2.4, wte(2.4) - 0.8), M(6.3, wte(6.3) - 0.65)], 1.5, LINE); // flaperon hinge
      for (const x of [3.1, 3.9, 4.7, 5.5, 6.2]) line(g, [M(x, wle(x) + 0.5), M(x, wte(x) - 0.75)], 1.0, LINE_LIGHT);
      rivets(g, M(2.4, 2.0), M(6.6, 3.9), 7, 0.9);
      line(g, [M(2.4, 7.5), M(4.8, 9.4)], 1.1, LINE_LIGHT); // stabilators
      line(g, [M(2.3, 9.4), M(4.9, 9.9)], 1.1, LINE_LIGHT);
    }
    // red stars top and bottom
    star(gt, ...W(5.3, 3.1), 0.55 * pt);
    star(gb, ...Wb(5.3, 3.1), 0.55 * L.pb);
  }
  weather(gt, L.top.width, L.top.height, rnd, 0.8, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.6, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.7, [1, 0.1]);
  // exhaust staining on the booms, sting and nacelle ends
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(NAC_X * sx, 8.6);
      const grd = g.createLinearGradient(x, y - 2.4 * s, x, y);
      grd.addColorStop(0, 'rgba(40,36,30,0)');
      grd.addColorStop(1, 'rgba(50,40,30,0.4)');
      g.fillStyle = grd;
      g.fillRect(x - 0.6 * s, y - 2.4 * s, 1.2 * s, 2.4 * s);
    }
  }
  L.copySides();
  // --- markings on both sides ------------------------------------------------------
  const teamCol = team === 'blue' ? '#1f4f9e' : '#b0241e';
  L.sideDraw(8.0, 2.05, (g, x, y) => star(g, x, y, 0.42 * ps));
  L.sideText(team === 'blue' ? '06' : '27', -6.4, -0.28, 0.5 * ps, teamCol);
  L.sideText('ВКС РОССИИ', 7.9, 1.25, 0.14 * ps, 'rgba(34,40,48,0.85)');
  L.sideText(team === 'blue' ? 'RF-81706' : 'RF-81727', 8.1, 0.95, 0.1 * ps, 'rgba(34,40,48,0.75)');
  // rescue arrow, intake warning
  L.sideDraw(-7.0, 0.3, (g, x, y) => {
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
    g.fillRect(...S(-2.9, -0.35), 0.06 * ps, 0.95 * ps);
  }
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
const plain = new Map<string, Livery>();

/** Markings without the splinter camouflage (under a custom paint job). */
export function su35PlainLivery(team: string): Livery {
  let L = plain.get(team);
  if (!L) {
    L = livery(team, false);
    plain.set(team, L);
  }
  return L;
}

export function buildSu35(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#8ea5b4'), bottom: new THREE.Color('#b4c6d1'), livery: L, roughness: 0.55, metalness: 0.16 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  // --- fuselage / lifting body ---------------------------------------------------
  const zs = mergeStations(stations(-11.2, -8.0, 36, 0.55, 0), stations(-8.0, -4.0, 50), stations(-4.0, 8.6, 110), stations(8.6, 10.8, 24, 0, 0.4));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -10.8, 10.2, 44);

  // --- engine nacelles with raked intakes: rectangular up front, round at the nozzles
  const NW = curve([[-3.4, 0.45], [-1.0, 0.47], [4.0, 0.5], [7.4, 0.55], [8.6, 0.56]]);
  const NH = curve([[-3.4, 0.56], [-1.0, 0.56], [4.0, 0.55], [7.4, 0.56], [8.6, 0.56]]);
  const NY = curve([[-3.4, -0.86], [-1.0, -0.86], [3.0, -0.72], [6.0, -0.42], [8.6, -0.22]]);
  const NR = curve([[-3.4, 0.1], [0.0, 0.14], [4.0, 0.3], [7.4, 0.5], [8.6, 0.56]]);
  const nacLoop = (z: number) => rrect(NAC_X, NY(z), NW(z), NH(z), Math.min(NR(z), NW(z) - 0.001, NH(z) - 0.001), 3);
  const nac = intake({
    loop: nacLoop,
    outer: stations(-3.4, NOZZLE_Z, 90, 0.3, 0),
    lip: 0.05,
    depth: 2.4,
    n: 80,
    // the lower lip leads: the mouth faces forward and a little down
    rake: (_x, y) => 0.5 * (y + 0.86),
    fan: { cx: NAC_X, cy: -0.84, r: 0.42 },
  });
  skin(both(nac.skin));
  v.addMesh(both(nac.duct), pm.duct);
  // boundary-layer splitter plates between the LERX and the intake roofs
  const split = join([-1, 1].map((sx) => {
    const g = loftProfile({
      stations: stations(-3.2, -1.2, 8),
      profile: (z) => {
        const u = sstep(-3.2, -1.2, z);
        return [[0, 0], [0.012, 0], [0.012, 0.1 + 0.05 * u], [0, 0.1 + 0.05 * u]] as P2[];
      },
      sub: 1,
      capStart: true,
      capEnd: true,
    });
    g.translate(sx * (NAC_X - 0.02), -0.37, 0);
    return g;
  }));
  skin(split);

  // --- tail booms (fins, ventral fins and stabilators hang off them) ------------
  const BW = curve([[3.0, 0.08], [4.2, 0.22], [8.6, 0.2], [10.0, 0.14], [10.5, 0.02]]);
  const BT = curve([[3.0, 0.1], [4.2, 0.2], [9.8, 0.18], [10.5, 0.05]]);
  const BB = curve([[3.0, -0.1], [4.2, -0.28], [9.8, -0.24], [10.5, -0.05]]);
  const boom = loftProfile({
    stations: stations(3.0, 10.5, 50, 0.2, 0.3),
    profile: (z) => {
      const w = BW(z), t = BT(z), b = BB(z);
      return [[BOOM_X, b], [BOOM_X + w * 0.85, b + 0.03], [BOOM_X + w, (t + b) * 0.5], [BOOM_X + w * 0.85, t - 0.02], [BOOM_X, t], [BOOM_X - w * 0.85, t - 0.02], [BOOM_X - w, (t + b) * 0.5], [BOOM_X - w * 0.85, b + 0.03]] as P2[];
    },
    sub: 3,
    full: true,
    capStart: true,
    capEnd: true,
  });
  skin(both(boom));

  // --- no dorsal airbrake on the Su-35S: the rudders splay outward instead ---------
  v.rudderBrake = 0.75;

  // --- canopy, seat, pilot ----------------------------------------------------------
  v.cockpitEye.set(0, 1.0, -6.4);
  buildCanopy(v, CANOPY, -7.6, []);
  const sp = seatAndPilot(new THREE.Vector3(0, 1.0, -6.4), 0.26, true);
  v.hideInCockpit.push(v.addMesh(sp.seat, pm.seat), v.addMesh(sp.flight, pm.flight), v.addMesh(sp.helmet, pm.helmet), v.addMesh(sp.visor, pm.visor));
  const shroud = loftProfile({
    stations: stations(-7.35, -6.95, 6),
    profile: (z) => {
      const u = sstep(-7.35, -6.95, z);
      return [[0, 0.18], [0.46, 0.2], [0.52, 0.5], [0.36, 0.6 - u * 0.06], [0, 0.62 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  // OLS-35 IRST ball ahead of the windscreen, offset right
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), pm.glass);
  ball.position.set(0.24, 0.5, -8.35);
  v.body.add(ball);
  // (below the glareshield line for the pilot: hidden in the cockpit view)
  v.hideInCockpit.push(ball, skin(lathe([[0.17, -8.6], [0.18, -8.35], [0.16, -8.1], [0.004, -7.95]], 18, 0.24, 0.47)));

  // --- wing: full-span leading-edge flaps, flaperons -----------------------------------
  const panels = wingPanels(
    WING,
    [
      { x0: 2.45, x1: 6.85, hinge: (x) => wle(x) + 0.14 * (wte(x) - wle(x)) + 0.05, kind: 'lef', maxDeg: 30, leading: true },
      { x0: 2.45, x1: 4.3, hinge: (x) => wte(x) - 0.8, kind: 'flap', maxDeg: 35 },
      { x0: 4.38, x1: 6.3, hinge: (x) => wte(x) - 0.68, kind: 'aileron', maxDeg: 20 },
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
  // wingtip launch rails (always there, like the real jet)
  const tipRail = lathe([[0.004, wle(7.0) - 0.35], [0.05, wle(7.0) - 0.1], [0.06, wle(7.0) + 0.4], [0.06, wte(7.0) - 0.1], [0.03, wte(7.0) + 0.1], [0.004, wte(7.0) + 0.15]], 14, 7.04, 0.02);
  skin(both(tipRail));

  // --- stabilators --------------------------------------------------------------------------
  const stab = wing({ sections: STAB, chordPts: 28, spanSub: 8, tip: 'round', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    v.addSurface(g, paint, new THREE.Vector3(2.2 * side, 0.0, STAB_PIVOT_Z), new THREE.Vector3(1, 0, 0), 'stab', side, 20);
  }

  // --- vertical fins (straight up) with rudders, ventral fins ------------------------------
  for (const side of [1, -1] as const) {
    const m = finMatrix(BOOM_X * side, 0.16, 0, side);
    const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 25);
    // square dielectric fin-tip cap
    const top = new THREE.Vector3(3.35, 0, 0).applyMatrix4(m);
    skin(lathe([[0.004, 7.95], [0.05, 8.1], [0.06, 8.6], [0.055, 9.3], [0.004, 9.45]], 12, top.x, top.y));
    v.addNavLight(new THREE.Vector3(top.x, top.y + 0.03, 9.3), 'formation');
    const vm = finMatrix(BOOM_X * side, -0.2, 160, side);
    skin(wing({ sections: VENTRAL, chordPts: 20, spanSub: 3, tip: 'flat', root: 'flat', matrix: vm }));
  }

  // --- engines: thrust-vectoring nozzles on gimbals ------------------------------------------
  for (const sx of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(NAC_X * sx, -0.22, NOZZLE_Z);
    v.body.add(pivot);
    const nz = nozzle({ cx: 0, cy: 0, z0: 0, z1: 1.35, r0: 0.55, r1: 0.47, petals: 16, saw: 0.05 });
    v.addMesh(nz.outer, pm.nozzle, pivot);
    v.addMesh(nz.inner, pm.nozzleIn, pivot).userData.detail = true;
    // the actuator ring around the gimbal
    v.addMesh(lathe([[0.565, -0.12], [0.585, -0.05], [0.585, 0.08], [0.56, 0.14]], 32), pm.darkMetal, pivot);
    v.nozzles.push({ pos: new THREE.Vector3(0, 0, 1.3), radius: 0.44, parent: pivot });
    v.vectoring.push({ pivot, side: sx });
  }
  v.buildFlames(7.0, 'blue');

  // --- gun, probes, antennas, lights ------------------------------------------------------
  // GSh-30-1 in the right LERX root
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), pm.darkMetal);
  muzzle.position.set(1.05, 0.1, -3.9);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);
  skin(lathe([[0.004, -4.3], [0.07, -4.1], [0.08, -3.6], [0.05, -3.2], [0.004, -3.0]], 12, 1.05, 0.08));
  v.addMesh(join([
    probe(new THREE.Vector3(0, -0.2, -11.15), 1.1, 0.018, new THREE.Vector3(0, 0, -1)),
    probe(new THREE.Vector3(0.42, 0.1, -9.6), 0.3, 0.01, new THREE.Vector3(0.15, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.42, 0.1, -9.6), 0.3, 0.01, new THREE.Vector3(-0.15, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.66, 1.4), 0.22, 0.3),
    blade(new THREE.Vector3(0, 0.55, 4.8), 0.16, 0.26),
    blade(new THREE.Vector3(0, -0.76, -5.2), 0.18, 0.26, new THREE.Vector3(0, -1, 0)),
    blade(new THREE.Vector3(0, -0.36, 2.5), 0.18, 0.28, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.74, 0.22, -6.5), new THREE.Vector3(1, 0.25, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-0.74, 0.22, -6.5), new THREE.Vector3(-1, 0.25, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(NAC_X + 0.48, -0.56, 5.0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
    formationStrip(new THREE.Vector3(-NAC_X - 0.48, -0.56, 5.0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-7.02, 0.02, wle(7.0) - 0.3), 'red');
  v.addNavLight(new THREE.Vector3(7.02, 0.02, wle(7.0) - 0.3), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.3, 10.7), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -0.36, 1.0), 'strobe');

  // --- landing gear: single nose wheel, big mains retracting forward into the centre section
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.72, -6.55), axle: new THREE.Vector3(0, -2.3 + 0.33, -6.9), r: 0.33, w: 0.22, twin: false, retract: 'forward' },
    mains: { top: new THREE.Vector3(2.12, -0.34, 1.0), axle: new THREE.Vector3(2.2, -2.3 + 0.5, 1.5), r: 0.5, w: 0.3, retract: 'forward', outboard: 0.1 },
    doorColor: '#9fb3c0',
  });
}
