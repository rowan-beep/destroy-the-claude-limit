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

/** Chined, faceted cross-section: flat underside, sharp chine at yc, sloped top (right half). */
function facet(w: number, hb: number, ht: number, yc: number, flat = 0.55): P2[] {
  return [
    [0, yc - hb],
    [w * flat * 0.6, yc - hb],
    [w * (flat + 0.2), yc - hb * 0.88],
    [w * 0.94, yc - hb * 0.35],
    [w, yc - 0.03],
    [w, yc],
    [w, yc + 0.03],
    [w * 0.9, yc + ht * 0.3],
    [w * 0.72, yc + ht * 0.62],
    [w * 0.48, yc + ht * 0.86],
    [w * 0.22, yc + ht * 0.97],
    [0, yc + ht],
  ];
}

// the chine line runs at y ~ 0 from the nose to the tail
const BODY = keyedProfile([
  { z: -9.2, pts: facet(0.015, 0.012, 0.012, -0.06) },
  { z: -8.6, pts: facet(0.22, 0.16, 0.18, -0.06) },
  { z: -7.6, pts: facet(0.45, 0.33, 0.36, -0.05) },
  { z: -6.4, pts: facet(0.64, 0.46, 0.46, -0.03) },
  { z: -5.5, pts: facet(0.74, 0.54, 0.5, -0.02) },
  { z: -4.4, pts: facet(0.8, 0.62, 0.56, 0.0) },
  { z: -3.2, pts: facet(0.86, 0.7, 0.6, 0.0) },
  { z: -2.2, pts: facet(1.1, 0.78, 0.62, 0.0, 0.5) },
  { z: -1.0, pts: facet(1.9, 0.84, 0.6, -0.02, 0.62) },
  { z: 1.5, pts: facet(1.98, 0.84, 0.58, -0.04, 0.66) },
  { z: 4.2, pts: facet(1.85, 0.76, 0.52, -0.06, 0.66) },
  { z: 6.2, pts: facet(1.55, 0.62, 0.44, -0.08, 0.7) },
  { z: 7.3, pts: facet(1.3, 0.5, 0.36, -0.1, 0.75) },
]);
const BODY_SUB = [3, 3, 3, 3, 1, 1, 3, 3, 3, 3, 3];

const CANOPY: Section[] = [
  { z: -6.25, w: 0.03, top: 0.02, bot: 0.02, y: 0.42, n: 2 },
  { z: -5.7, w: 0.36, top: 0.32, bot: 0.03, y: 0.45, n: 2.2 },
  { z: -5.0, w: 0.47, top: 0.54, bot: 0.03, y: 0.5, n: 2.2 },
  { z: -4.2, w: 0.49, top: 0.6, bot: 0.03, y: 0.53, n: 2.2 },
  { z: -3.4, w: 0.44, top: 0.5, bot: 0.03, y: 0.56, n: 2.2 },
  { z: -2.7, w: 0.3, top: 0.26, bot: 0.03, y: 0.58, n: 2.2 },
  { z: -2.1, w: 0.14, top: 0.06, bot: 0.03, y: 0.6, n: 2 },
];

// diamond wing: 42 deg leading edge, 17 deg forward-swept trailing edge
const WING: WingStation[] = [
  { x: 1.2, le: -2.25, te: 5.6, y: -0.06, t: 0.05 },
  { x: 1.7, le: -1.8, te: 5.5, y: -0.07, t: 0.048 },
  { x: 6.8, le: 2.79, te: 3.94, y: -0.36, t: 0.034 },
];
const wle = (x: number) => -1.8 + (x - 1.7) * 0.9;
const wte = (x: number) => 3.94 + (6.8 - x) * 0.306;
const STAB: WingStation[] = [
  { x: 1.25, le: 5.1, te: 8.45, y: -0.12, t: 0.045 },
  { x: 4.45, le: 7.65, te: 8.8, y: -0.14, t: 0.032 },
];
const STAB_PIVOT = 7.0;
const FIN: WingStation[] = [
  { x: 0, le: 4.0, te: 7.45, t: 0.05 },
  { x: 3.05, le: 5.45, te: 6.75, t: 0.034 },
];
const RUDDER = { h0: 0.25, h1: 2.8, hinge: (h: number) => 6.82 - h * 0.21 };
const FIN_ROOT = { x: 1.25, y: 0.42, cant: 28 };

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
  const paint = skinMaterial({ top: new THREE.Color('#8b9196'), bottom: new THREE.Color('#9ba1a5'), livery: L, roughness: 0.5, metalness: 0.22 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-9.2, -6.4, 32, 0.55, 0), stations(-6.4, -2.2, 50), stations(-2.2, 7.3, 80));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -9.0, 7.2, 40);

  // --- caret intakes: a parallelogram mouth raked in both planes, the upper
  // and outer edges leading, with a diverterless gap to the fuselage
  const TX = curve([[-4.4, 1.2], [-2.6, 1.25], [-0.9, 1.3]]);
  const TY = curve([[-4.4, -0.26], [-2.6, -0.28], [-0.9, -0.3]]);
  const TW = curve([[-4.4, 0.42], [-2.6, 0.42], [-0.9, 0.38]]);
  const TH = curve([[-4.4, 0.5], [-2.6, 0.5], [-0.9, 0.44]]);
  const loop = (z: number) => rrect(TX(z), TY(z), TW(z), TH(z), 0.05, 3).map(([x, y]) => [x - 0.28 * (y - TY(z)), y] as P2);
  const ci = intake({
    loop,
    outer: stations(-4.4, -0.9, 36, 0.3, 0),
    lip: 0.035,
    depth: 2.0,
    n: 64,
    rake: (x, y) => -0.55 * (y - 0.25) - 0.45 * (x - 0.8),
    fan: { cx: 1.15, cy: -0.28, r: 0.36 },
  });
  skin(both(ci.skin));
  v.addMesh(both(ci.duct), pm.duct);

  // --- canopy (gold-tinted, one piece, no frame bows), seat, pilot
  v.cockpitEye.set(0, 0.88, -4.7);
  // frameless: the only hoop is the one at the back of the canopy
  buildCanopy(v, CANOPY, -2.45, []);
  const sp = seatAndPilot(new THREE.Vector3(0, 0.88, -4.7), 0.26, false);
  v.hideInCockpit.push(v.addMesh(sp.seat, pm.seat), v.addMesh(sp.flight, pm.flight), v.addMesh(sp.helmet, pm.helmet), v.addMesh(sp.visor, pm.visor));
  const shroud = loftProfile({
    stations: stations(-5.6, -5.2, 6),
    profile: (z) => {
      const u = sstep(-5.6, -5.2, z);
      return [[0, 0.1], [0.42, 0.12], [0.47, 0.44], [0.33, 0.52 - u * 0.06], [0, 0.54 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  // the Raptor's gold canopy coating
  if (v.canopy) {
    const gm = (v.canopy.material as THREE.MeshStandardMaterial).clone();
    gm.color.set('#e8c673');
    gm.opacity = 0.34;
    v.canopy.material = gm;
  }

  // --- wing: leading-edge flaps, flaperons, ailerons
  const panels = wingPanels(
    WING,
    [
      { x0: 2.0, x1: 6.6, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.05, kind: 'lef', maxDeg: 25, leading: true },
      { x0: 2.0, x1: 4.2, hinge: (x) => wte(x) - 0.75, kind: 'flap', maxDeg: 30 },
      { x0: 4.3, x1: 6.5, hinge: (x) => wte(x) - 0.55, kind: 'aileron', maxDeg: 25 },
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

  // --- all-moving tailplanes
  const stab = wing({ sections: STAB, chordPts: 26, spanSub: 7, tip: 'flat', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    v.addSurface(g, paint, new THREE.Vector3(1.3 * side, -0.12, STAB_PIVOT), new THREE.Vector3(1, 0, 0), 'stab', side, 25);
  }

  // --- twin fins canted out 28 deg
  for (const side of [1, -1] as const) {
    const m = finMatrix(FIN_ROOT.x * side, FIN_ROOT.y, FIN_ROOT.cant, side);
    const f = finPanels(FIN, RUDDER, m, { chordPts: 28 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 30);
    const top = new THREE.Vector3(3.0, 0, 0).applyMatrix4(m);
    v.addNavLight(new THREE.Vector3(top.x, top.y, 6.4), 'formation');
  }

  // --- flat "beaver tail" between the engines
  const tail = loftProfile({
    stations: stations(6.4, 8.35, 10),
    profile: (z) => {
      const u = sstep(6.4, 8.35, z);
      const w = 0.32 - u * 0.12;
      return [[0, -0.34], [w, -0.33], [w + 0.03, -0.26], [w, -0.2], [0, -0.19]] as P2[];
    },
    sub: 2,
    capStart: true,
    capEnd: true,
  });
  skin(tail);

  // --- two 2D thrust-vectoring nozzles: square-ish, flat upper and lower
  // flaps that swing together up and down
  for (const sx of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(0.66 * sx, -0.15, 7.15);
    v.body.add(pivot);
    const shell = loftProfile({
      stations: stations(-0.05, 0.95, 10),
      profile: (z) => {
        const u = sstep(-0.05, 0.95, z);
        return rrect(0, 0, 0.52 - u * 0.06, 0.4 - u * 0.12, 0.12 - u * 0.08, 3);
      },
      sub: 1,
      full: true,
    });
    v.addMesh(shell, pm.nozzle, pivot);
    // dark throat and the hot face inside
    const throat = loftProfile({
      stations: stations(0.15, 0.94, 6),
      profile: (z) => {
        const u = sstep(0.15, 0.94, z);
        return rrect(0, 0, 0.46 - u * 0.05, 0.33 - u * 0.1, 0.08, 3).reverse();
      },
      sub: 1,
      full: true,
    });
    v.addMesh(throat, pm.nozzleIn, pivot).userData.detail = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.5), pm.nozzleIn);
    face.position.set(0, 0, 0.2);
    face.rotation.y = Math.PI;
    pivot.add(face);
    v.nozzles.push({ pos: new THREE.Vector3(0, 0, 0.9), radius: 0.3, parent: pivot });
    v.vectoring.push({ pivot, side: sx });
  }
  v.buildFlames(6.0);

  // --- probes, antennas, lights; gun port above the right wing root
  const muzzle = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), pm.darkMetal);
  muzzle.position.set(1.36, 0.21, -2.2);
  muzzle.rotation.x = -Math.PI / 2 + 0.3;
  v.body.add(muzzle);
  v.addMesh(join([
    probe(new THREE.Vector3(0.28, -0.05, -7.6), 0.22, 0.01, new THREE.Vector3(0.1, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.28, -0.05, -7.6), 0.22, 0.01, new THREE.Vector3(-0.1, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.6, 0.8), 0.14, 0.26),
    blade(new THREE.Vector3(0, -0.86, 1.8), 0.14, 0.24, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.79, 0.12, -4.9), new THREE.Vector3(1, 0.4, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(-0.79, 0.12, -4.9), new THREE.Vector3(-1, 0.4, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(1.97, -0.05, 2.4), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-1.97, -0.05, 2.4), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-6.75, -0.36, 3.4), 'red');
  v.addNavLight(new THREE.Vector3(6.75, -0.36, 3.4), 'green');
  v.addNavLight(new THREE.Vector3(0, -0.9, 1.0), 'strobe');
  skin(roundBox(0.12, 0.05, 0.6, 0.02).translate(0, 0.6, 3.0));

  // --- landing gear: nose leg forward of the intakes, mains fold into the fuselage
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.55, -5.3), axle: new THREE.Vector3(0, -1.85 + 0.3, -5.6), r: 0.3, w: 0.18, twin: false, retract: 'forward' },
    mains: { top: new THREE.Vector3(1.05, -0.8, 1.0), axle: new THREE.Vector3(1.6, -1.85 + 0.42, 1.0), r: 0.42, w: 0.26, retract: 'inward', outboard: 0.08 },
    doorColor: '#9ba1a5',
  });
}
