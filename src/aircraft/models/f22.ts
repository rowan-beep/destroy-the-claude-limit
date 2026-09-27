// Lockheed Martin F-22A Raptor: 18.92 m long, 13.56 m span, 5.08 m tall.
// Single seat: a diamond-section nose with sharp chines that run the whole
// length of the jet, a frameless gold-tinted bubble canopy, caret intakes
// raked in two planes beside the cockpit, a diamond wing (42 deg leading
// edge, forward-swept trailing edge), big all-moving tailplanes, two fins
// canted out 28 deg, and two flat two-dimensional thrust-vectoring nozzles
// set close together in a flat "beaver tail".

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect, Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, curve, sstep, roundBox } from './kit';
import { intake, partMaterials, seatAndPilot, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

interface Sec {
  /** flat underside: height, half-width */
  yb: number;
  xb: number;
  /** lower side wall start */
  xs: number;
  ys: number;
  /** the chine: the sharp edge that runs nose to tail */
  xc: number;
  yc: number;
  /** shoulder: the flat upper deck over the intakes and wing roots */
  xsh: number;
  ysh: number;
  /** spine base and hump above it */
  xsp: number;
  ysp: number;
  hump: number;
}

/** Faceted Raptor cross-section (right half, bottom centre to top centre). */
function sec(k: Sec): P2[] {
  return [
    [0, k.yb],
    [k.xb * 0.55, k.yb],
    [k.xb, k.yb + 0.004],
    [k.xs, k.ys],
    [k.xc - 0.004, k.yc - 0.012],
    [k.xc, k.yc],
    [k.xc - 0.012, k.yc + 0.01],
    [k.xsh, k.ysh],
    [k.xsp, k.ysp],
    [k.xsp * 0.62, k.ysp + k.hump * 0.72],
    [k.xsp * 0.3, k.ysp + k.hump * 0.95],
    [0, k.ysp + k.hump],
  ];
}

const S = (yb: number, xb: number, xs: number, ys: number, xc: number, yc: number, xsh: number, ysh: number, xsp: number, ysp: number, hump: number): P2[] =>
  sec({ yb, xb, xs, ys, xc, yc, xsh, ysh, xsp, ysp, hump });

// nose tip at z -9.46; the chine runs the whole length; the wide flat deck
// starts behind the intakes; nozzle roots at z 7
const BODY = keyedProfile([
  { z: -9.46, pts: S(-0.03, 0.004, 0.008, -0.03, 0.012, -0.03, 0.008, -0.02, 0.004, -0.015, 0.002) },
  { z: -8.9, pts: S(-0.13, 0.05, 0.15, -0.08, 0.21, -0.04, 0.16, 0.05, 0.08, 0.1, 0.02) },
  { z: -8.0, pts: S(-0.3, 0.12, 0.33, -0.17, 0.43, -0.04, 0.34, 0.15, 0.16, 0.25, 0.04) },
  { z: -7.0, pts: S(-0.46, 0.2, 0.49, -0.25, 0.61, -0.04, 0.48, 0.23, 0.22, 0.36, 0.04) },
  { z: -6.2, pts: S(-0.56, 0.26, 0.59, -0.31, 0.73, -0.03, 0.62, 0.3, 0.34, 0.42, 0.02) },
  { z: -5.0, pts: S(-0.64, 0.3, 0.67, -0.35, 0.83, -0.01, 0.8, 0.36, 0.46, 0.44, 0.01) },
  { z: -4.0, pts: S(-0.7, 0.34, 0.74, -0.37, 0.93, 0.08, 0.93, 0.36, 0.5, 0.46, 0.02) },
  { z: -2.9, pts: S(-0.76, 0.66, 1.4, -0.52, 1.66, 0.1, 1.18, 0.36, 0.52, 0.5, 0.12) },
  { z: -1.8, pts: S(-0.8, 0.9, 1.62, -0.55, 1.9, 0.06, 1.3, 0.34, 0.55, 0.45, 0.26) },
  { z: 0.5, pts: S(-0.82, 1.0, 1.72, -0.55, 2.0, 0.02, 1.36, 0.33, 0.55, 0.42, 0.3) },
  { z: 3.0, pts: S(-0.78, 1.0, 1.68, -0.5, 1.95, -0.02, 1.36, 0.32, 0.5, 0.38, 0.2) },
  { z: 5.3, pts: S(-0.66, 0.96, 1.5, -0.42, 1.76, -0.06, 1.3, 0.26, 0.45, 0.3, 0.08) },
  { z: 6.4, pts: S(-0.52, 0.96, 1.24, -0.36, 1.34, -0.1, 1.14, 0.18, 0.42, 0.22, 0.03) },
  { z: 7.0, pts: S(-0.46, 0.94, 1.14, -0.33, 1.2, -0.11, 1.06, 0.14, 0.4, 0.18, 0.02) },
]);
// creases at the bottom corner and the chine
const BODY_SUB = [3, 2, 2, 3, 1, 1, 3, 3, 3, 3, 3];

const CANOPY: Section[] = [
  { z: -6.55, w: 0.03, top: 0.02, bot: 0.02, y: 0.4, n: 2 },
  { z: -5.95, w: 0.36, top: 0.3, bot: 0.03, y: 0.42, n: 2.3 },
  { z: -5.2, w: 0.47, top: 0.54, bot: 0.03, y: 0.44, n: 2.3 },
  { z: -4.3, w: 0.5, top: 0.64, bot: 0.03, y: 0.45, n: 2.3 },
  { z: -3.4, w: 0.46, top: 0.56, bot: 0.03, y: 0.47, n: 2.3 },
  { z: -2.8, w: 0.33, top: 0.34, bot: 0.03, y: 0.5, n: 2.3 },
  { z: -2.3, w: 0.16, top: 0.1, bot: 0.03, y: 0.55, n: 2 },
];

// diamond wing: 42 deg leading edge, forward-swept trailing edge, 3 deg anhedral
const WING: WingStation[] = [
  { x: 1.4, le: -2.35, te: 5.2, y: 0.02, t: 0.05 },
  { x: 1.9, le: -1.9, te: 5.09, y: 0.0, t: 0.046 },
  { x: 6.78, le: 2.49, te: 3.6, y: -0.28, t: 0.032 },
];
const wle = (x: number) => -1.9 + (x - 1.9) * 0.9;
const wte = (x: number) => 3.6 + (6.78 - x) * 0.306;
// all-moving tailplanes on the tail booms
const STAB: WingStation[] = [
  { x: 1.8, le: 5.85, te: 8.9, y: -0.12, t: 0.04 },
  { x: 4.45, le: 8.25, te: 9.42, y: -0.14, t: 0.03 },
];
const STAB_PIVOT = 7.25;
// broad trapezoidal fins, swept leading edge, slightly forward-swept trailing edge
const FIN: WingStation[] = [
  { x: 0, le: 2.75, te: 7.15, t: 0.046 },
  { x: 3.05, le: 5.0, te: 6.6, t: 0.03 },
];
const RUDDER = { h0: 0.2, h1: 2.1, hinge: (h: number) => 7.15 - 0.18 * h - 0.7 };
const FIN_ROOT = { x: 1.45, y: 0.28, cant: 28 };

function livery(team: string): Livery {
  const L = new Livery({ half: 9.0, z0: -9.5, len: 19, y0: -2.0, height: 6.0 });
  const { gt, gb, gs } = L;
  const rnd = prng(22);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // the darker grey patches of the Raptor's two-tone scheme
  const blob = (g: CanvasRenderingContext2D, M: (x: number, z: number) => [number, number], x: number, z: number, rx: number, rz: number, a: number, k: number) => {
    const [px, py] = M(x, z);
    g.save();
    g.translate(px, py);
    g.rotate(a);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx * k);
    grad.addColorStop(0, 'rgba(82,88,94,0.55)');
    grad.addColorStop(0.7, 'rgba(82,88,94,0.42)');
    grad.addColorStop(1, 'rgba(82,88,94,0)');
    g.fillStyle = grad;
    g.scale(1, rz / rx);
    g.beginPath();
    g.arc(0, 0, rx * k, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  for (const sx of [-1, 1]) {
    for (const [g, M, k] of [[gt, T, pt], [gb, B, L.pb]] as const) {
      blob(g, M, 4.2 * sx, 2.4, 1.9, 1.1, 0.5 * sx, k);
      blob(g, M, 2.6 * sx, 0.6, 1.3, 0.8, -0.3 * sx, k);
      blob(g, M, 1.2 * sx, -3.8, 0.7, 1.4, 0.1 * sx, k);
      blob(g, M, 3.2 * sx, 7.9, 0.9, 0.5, 0.4 * sx, k);
      blob(g, M, 0.9 * sx, 4.6, 0.8, 1.2, 0.0, k);
    }
  }
  blob(gt, T, 0, -7.4, 0.45, 1.0, 0, pt);
  // anti-glare, cockpit well
  gt.fillStyle = 'rgba(52,56,60,0.55)';
  gt.beginPath();
  gt.moveTo(...T(-0.36, -6.0));
  gt.lineTo(...T(0.36, -6.0));
  gt.lineTo(...T(0.12, -6.8));
  gt.lineTo(...T(-0.12, -6.8));
  gt.closePath();
  gt.fill();
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.fillRect(...T(-0.46, -5.5), 0.92 * pt, 2.6 * pt);
  // sawtooth-edged access panels (radar-signature treatment) and panel lines
  for (const z of [-6.3, -4.6, -2.6, -0.8, 1.2, 3.1, 5.0, 6.7]) {
    line(gt, [T(-1.0, z), T(1.0, z)], 1.2, LINE_LIGHT);
    line(gb, [B(-1.0, z), B(1.0, z)], 1.1, LINE_LIGHT);
    line(gs, [S(z, -0.8), S(z, 0.6)], 1.3, LINE_LIGHT);
  }
  const saw = (g: CanvasRenderingContext2D, M: (x: number, z: number) => [number, number], x0: number, x1: number, z: number) => {
    const pts: [number, number][] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) pts.push(M(x0 + ((x1 - x0) * i) / n, z + (i % 2 ? 0.14 : 0)));
    line(g, pts, 1.3, LINE);
  };
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    saw(gt, W, 0.3, 1.1, -2.9);
    saw(gt, W, 0.3, 1.1, 2.2);
    saw(gb, Wb, 0.25, 1.05, -0.4);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(2.0, wle(2.0) + 0.3), M(6.6, wle(6.6) + 0.2)], 1.3, LINE); // leading-edge flap
      line(g, [M(2.0, wte(2.0) - 0.8), M(6.5, wte(6.5) - 0.55)], 1.2, LINE_LIGHT);
      rivets(g, M(2.0, wle(2.0) + 0.6), M(6.6, wle(6.6) + 0.35), 9, 0.8);
      for (const x of [2.8, 3.9, 5.0, 6.0]) line(g, [M(x, wle(x) + 0.35), M(x, wte(x) - 0.6)], 1.0, LINE_LIGHT);
      line(g, [M(1.6, 6.2), M(4.2, 8.0)], 1.0, LINE_LIGHT); // tailplane
    }
    if (sx < 0) roundel(gt, team, ...W(4.6, 2.9), 0.42 * pt);
    else roundel(gb, team, ...Wb(4.6, 2.9), 0.42 * L.pb);
    // main weapons-bay doors and side bays underneath
    const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
    rect(gb, Wb(0.05, -0.8), Wb(0.95, 2.3));
    rect(gb, Wb(1.05, -2.2), Wb(1.45, -0.3));
  }
  line(gs, [S(-6.5, -0.02), S(7.3, -0.1)], 1.3, LINE_LIGHT); // chine
  weather(gt, L.top.width, L.top.height, rnd, 0.7, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.6, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.6, [1, 0.1]);
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(0.62 * sx, 7.6);
      const gr = g.createLinearGradient(x, y - 1.4 * s, x, y);
      gr.addColorStop(0, 'rgba(40,36,30,0)');
      gr.addColorStop(1, 'rgba(40,36,30,0.3)');
      g.fillStyle = gr;
      g.fillRect(x - 0.5 * s, y - 1.4 * s, 1.0 * s, 1.4 * s);
    }
  }
  L.copySides();
  const teamCol = team === 'blue' ? '#3d5a8a' : '#8a3a33';
  // fin: two-letter base code and a low-visibility band
  L.sideText(team === 'blue' ? 'FF' : 'TY', 5.9, 2.35, 0.34 * ps, 'rgba(62,68,74,0.85)');
  L.sideText(team === 'blue' ? 'AF 09-4191' : 'AF 07-4146', 6.0, 1.55, 0.1 * ps, 'rgba(62,68,74,0.8)');
  L.sideDraw(6.2, 3.1, (g, x, y) => {
    g.fillStyle = teamCol;
    g.globalAlpha = 0.55;
    g.fillRect(x - 0.55 * ps, y - 0.06 * ps, 1.1 * ps, 0.12 * ps);
    g.globalAlpha = 1;
  });
  L.sideDraw(-0.4, -0.35, (g, x, y) => roundel(g, team, x, y, 0.22 * ps));
  return L;
}

const liveries = new Map<string, Livery>();

export function buildF22(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  // the Raptor's coating has a slight metallic sheen
  const paint = skinMaterial({ top: new THREE.Color('#8e959a'), bottom: new THREE.Color('#9da3a8'), livery: L, roughness: 0.44, metalness: 0.3 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-9.46, -6.2, 36, 0.6, 0), stations(-6.2, -1.8, 56), stations(-1.8, 7.0, 84));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -9.2, 6.9, 40);

  // --- caret intakes: parallelogram mouths raked in two planes (the upper
  // outboard corner leads), built into the sides of the fuselage
  const para = (z: number): P2[] => {
    const u = sstep(-4.3, -2.2, z);
    const ib: P2 = [0.96, -0.66 - 0.06 * u];
    const ob: P2 = [1.52 + 0.1 * u, -0.66 - 0.06 * u];
    const ot: P2 = [1.72 + 0.16 * u, 0.1 - 0.03 * u];
    const it: P2 = [0.96, 0.36];
    const pts: P2[] = [];
    const edge = (a: P2, b: P2, n: number) => {
      for (let i = 0; i < n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
    };
    edge(ib, ob, 8);
    edge(ob, ot, 10);
    edge(ot, it, 10);
    edge(it, ib, 12);
    return pts;
  };
  const ci = intake({
    loop: para,
    outer: stations(-4.3, -2.2, 30, 0.3, 0),
    lip: 0.03,
    depth: 2.1,
    n: 72,
    rake: (x, y) => -0.45 * (y - 0.36) - 0.16 * (x - 0.96),
    fan: { cx: 1.24, cy: -0.16, r: 0.34 },
  });
  skin(both(ci.skin));
  // the serpentine ducts are dark inside (the engine faces are hidden)
  const duct = (pm.duct as THREE.MeshStandardMaterial).clone();
  duct.color.set('#3a3e42');
  v.addMesh(both(ci.duct), duct);

  // --- canopy: one-piece, frameless, gold tinted; seat and pilot
  v.cockpitEye.set(0, 0.86, -4.8);
  // the only hoop is the one at the back of the canopy
  buildCanopy(v, CANOPY, -2.55, []);
  const sp = seatAndPilot(new THREE.Vector3(0, 0.86, -4.8), 0.26, false);
  v.hideInCockpit.push(v.addMesh(sp.seat, pm.seat), v.addMesh(sp.flight, pm.flight), v.addMesh(sp.helmet, pm.helmet), v.addMesh(sp.visor, pm.visor));
  const shroud = loftProfile({
    stations: stations(-5.75, -5.35, 6),
    profile: (z) => {
      const u = sstep(-5.75, -5.35, z);
      return [[0, 0.1], [0.42, 0.12], [0.46, 0.44], [0.33, 0.52 - u * 0.06], [0, 0.54 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  if (v.canopy) {
    const gm = (v.canopy.material as THREE.MeshStandardMaterial).clone();
    gm.color.set('#e8c26a');
    gm.opacity = 0.36;
    gm.metalness = 0.95;
    v.canopy.material = gm;
  }
  // canopy sill: the raised rail the canopy seals onto
  const sill = loftProfile({
    stations: stations(-6.4, -2.4, 30),
    profile: (z) => {
      const c = CANOPY;
      let w = 0.03, y = 0.42;
      for (let i = 0; i < c.length - 1; i++) {
        if (z >= c[i].z && z <= c[i + 1].z) {
          const t = (z - c[i].z) / (c[i + 1].z - c[i].z);
          w = c[i].w + (c[i + 1].w - c[i].w) * t;
          y = (c[i].y ?? 0) + ((c[i + 1].y ?? 0) - (c[i].y ?? 0)) * t;
        }
      }
      return [[w + 0.035, y - 0.05], [w + 0.045, y + 0.02], [w - 0.01, y + 0.03], [w - 0.02, y - 0.03]] as P2[];
    },
    sub: 1,
    full: true,
    capStart: true,
    capEnd: true,
  });
  v.addMesh(stamp(both(sill)), pm.frame);

  // --- wing: leading-edge flaps, flaperons, ailerons
  const panels = wingPanels(
    WING,
    [
      { x0: 2.05, x1: 6.6, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.05, kind: 'lef', maxDeg: 25, leading: true },
      { x0: 2.1, x1: 4.3, hinge: (x) => wte(x) - 0.7, kind: 'flap', maxDeg: 30 },
      { x0: 4.4, x1: 6.5, hinge: (x) => wte(x) - 0.5, kind: 'aileron', maxDeg: 25 },
    ],
    { chordPts: 36, thickPos: 0.42 },
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

  // --- tail booms outboard of the engines carry the tailplanes
  const boom = loftProfile({
    stations: stations(4.6, 9.0, 24),
    profile: (z) => {
      const u = sstep(4.6, 5.4, z);
      const e = sstep(8.4, 9.0, z);
      const hw = 0.3 * u * (1 - 0.6 * e) + 0.02;
      const hh = 0.13 * (1 - 0.5 * e) + 0.02;
      return rrect(1.52, -0.12, hw, hh, Math.min(hw, hh) * 0.6, 3);
    },
    sub: 1,
    full: true,
    capStart: true,
    capEnd: true,
  });
  skin(both(boom));

  // --- all-moving tailplanes
  const stab = wing({ sections: STAB, chordPts: 28, spanSub: 8, tip: 'flat', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    v.addSurface(g, paint, new THREE.Vector3(1.8 * side, -0.12, STAB_PIVOT), new THREE.Vector3(1, 0, 0), 'stab', side, 25);
  }

  // --- twin fins canted out 28 deg, rudders on the lower part
  for (const side of [1, -1] as const) {
    const m = finMatrix(FIN_ROOT.x * side, FIN_ROOT.y, FIN_ROOT.cant, side);
    const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 30);
    const top = new THREE.Vector3(3.0, 0, 0).applyMatrix4(m);
    v.addNavLight(new THREE.Vector3(top.x, top.y, 6.0), 'formation');
  }

  // --- flat "beaver tail" between the engines
  const tail = loftProfile({
    stations: stations(6.6, 8.1, 10),
    profile: (z) => {
      const u = sstep(6.6, 8.1, z);
      const w = 0.2 - u * 0.1;
      return [[0, -0.14], [w, -0.13], [w + 0.03, -0.07], [w, -0.01], [0, 0.0]] as P2[];
    },
    sub: 2,
    capStart: true,
    capEnd: true,
  });
  skin(tail);

  // --- 2D thrust-vectoring nozzles: square convergent section, flat upper
  // and lower flaps with sawtooth edges that swing together up and down
  const flap = (): THREE.BufferGeometry => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.44, 0.45);
    sh.lineTo(0.44, 0.45);
    sh.lineTo(0.44, 0.92);
    sh.lineTo(0.22, 1.06);
    sh.lineTo(0, 0.92);
    sh.lineTo(-0.22, 1.06);
    sh.lineTo(-0.44, 0.92);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 });
    g.rotateX(Math.PI / 2);
    return g;
  };
  const nozzleGrey = new THREE.MeshStandardMaterial({ color: '#80868b', roughness: 0.5, metalness: 0.35 });
  const flapMetal = new THREE.MeshStandardMaterial({ color: '#555a5f', roughness: 0.42, metalness: 0.6 });
  for (const sx of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(0.6 * sx, -0.07, 6.95);
    v.body.add(pivot);
    const shell = loftProfile({
      stations: stations(-0.05, 0.9, 12),
      profile: (z) => {
        const u = sstep(-0.05, 0.9, z);
        return rrect(0, 0, 0.46 - u * 0.03, 0.3 - u * 0.08, 0.1 - u * 0.06, 4);
      },
      sub: 1,
      full: true,
    });
    // the nozzle boxes are painted Raptor grey; the flaps are darker, heat-stained metal
    v.addMesh(shell, nozzleGrey, pivot);
    for (const up of [1, -1]) {
      const f = flap();
      f.translate(0, up > 0 ? 0.24 : -0.21, 0);
      v.addMesh(f, flapMetal, pivot);
    }
    const throat = loftProfile({
      stations: stations(0.2, 0.88, 6),
      profile: (z) => {
        const u = sstep(0.2, 0.88, z);
        return rrect(0, 0, 0.41 - u * 0.02, 0.24 - u * 0.06, 0.05, 3).reverse();
      },
      sub: 1,
      full: true,
    });
    v.addMesh(throat, pm.nozzleIn, pivot).userData.detail = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.46), pm.nozzleIn);
    face.position.set(0, 0, 0.25);
    face.rotation.y = Math.PI;
    pivot.add(face);
    v.nozzles.push({ pos: new THREE.Vector3(0, 0, 0.95), radius: 0.28, parent: pivot });
    v.vectoring.push({ pivot, side: sx });
  }
  v.buildFlames(6.0);

  // --- gun port door above the right wing root, probes, antennas, lights
  v.addMesh(join([
    probe(new THREE.Vector3(0.3, -0.06, -8.2), 0.2, 0.009, new THREE.Vector3(0.1, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.3, -0.06, -8.2), 0.2, 0.009, new THREE.Vector3(-0.1, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.72, 0.6), 0.12, 0.24),
    blade(new THREE.Vector3(0, -0.82, 2.6), 0.12, 0.22, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.8, 0.14, -5.0), new THREE.Vector3(1, 0.5, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-0.8, 0.14, -5.0), new THREE.Vector3(-1, 0.5, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(1.99, 0.02, 1.2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
    formationStrip(new THREE.Vector3(-1.99, 0.02, 1.2), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-6.72, -0.28, 3.0), 'red');
  v.addNavLight(new THREE.Vector3(6.72, -0.28, 3.0), 'green');
  v.addNavLight(new THREE.Vector3(0, -0.84, 0.4), 'strobe');

  // --- landing gear: nose leg behind the radome, mains fold into the fuselage sides
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.6, -5.8), axle: new THREE.Vector3(0, -2.05 + 0.33, -6.1), r: 0.33, w: 0.2, twin: false, retract: 'forward' },
    mains: { top: new THREE.Vector3(1.1, -0.8, 0.8), axle: new THREE.Vector3(1.55, -2.05 + 0.45, 0.95), r: 0.45, w: 0.28, retract: 'inward', outboard: 0.08 },
    doorColor: '#9da3a8',
  });
}
