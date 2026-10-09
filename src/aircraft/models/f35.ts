// Lockheed Martin F-35A Lightning II: 15.67 m long, 10.7 m span, 4.38 m tall.
// Single seat: a chined nose with the faceted EOTS window under the chin, a
// tall one-piece canopy that runs into the deep dorsal hump, diverterless
// supersonic intakes (a bump on the fuselage inside each raked mouth), a
// trapezoidal wing (34 deg leading edge, forward-swept trailing edge), all-
// moving tailplanes, two fins canted out 20 deg, two weapons bays side by side
// under the belly, the GAU-22/A in a blister over the left intake, and one big
// F135 nozzle with serrated edges.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, sstep, resample, roundBox } from './kit';
import { nozzle, intake, partMaterials, blade, probe, formationStrip, glassify } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';
import { bayInteriorMaterial, skinPanel, swingSign } from './f22';

interface Sec {
  yb: number;
  xb: number;
  xs: number;
  ys: number;
  xc: number;
  yc: number;
  xsh: number;
  ysh: number;
  xsp: number;
  ysp: number;
  hump: number;
}
/** chined cross-section (right half, bottom centre to top centre), as the F-22's */
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

// nose tip at z -7.85; the deep body carries the intakes' width (3.5 m over
// the wing root) all the way aft; the fat spine behind the canopy stays a
// metre over the datum back to the fins; the belly is deepest under the
// bays (1.1 m) and sweeps up to a nozzle set high in the tail
const BODY = keyedProfile([
  { z: -7.85, pts: S(-0.03, 0.004, 0.008, -0.03, 0.012, -0.03, 0.008, -0.02, 0.004, -0.015, 0.002) },
  { z: -7.3, pts: S(-0.14, 0.05, 0.15, -0.08, 0.2, -0.04, 0.15, 0.05, 0.08, 0.1, 0.02) },
  { z: -6.5, pts: S(-0.4, 0.14, 0.38, -0.2, 0.48, -0.05, 0.38, 0.17, 0.18, 0.28, 0.04) },
  { z: -5.5, pts: S(-0.6, 0.22, 0.56, -0.3, 0.68, -0.04, 0.56, 0.27, 0.3, 0.38, 0.03) },
  { z: -4.5, pts: S(-0.75, 0.3, 0.68, -0.4, 0.8, -0.02, 0.76, 0.36, 0.44, 0.44, 0.02) },
  { z: -3.4, pts: S(-0.78, 0.34, 0.76, -0.42, 0.84, 0.12, 0.86, 0.42, 0.5, 0.5, 0.04) },
  { z: -2.3, pts: S(-0.85, 0.42, 0.8, -0.5, 0.84, 0.3, 0.88, 0.44, 0.52, 0.6, 0.45) },
  // behind the intakes the body takes their width: a flat belly out to a sharp
  // edge, a wall leaning out to the chine, a broad deck and the big spine
  { z: -1.25, pts: S(-0.9, 1.28, 1.52, -0.55, 1.72, 0.02, 1.05, 0.4, 0.52, 0.6, 0.48) },
  { z: 0.8, pts: S(-0.97, 1.3, 1.55, -0.6, 1.76, 0.0, 1.1, 0.4, 0.52, 0.58, 0.46) },
  { z: 3.0, pts: S(-1.0, 1.15, 1.4, -0.6, 1.58, -0.02, 1.05, 0.36, 0.5, 0.52, 0.42) },
  { z: 4.0, pts: S(-1.08, 1.1, 1.3, -0.6, 1.45, -0.03, 1.02, 0.34, 0.48, 0.5, 0.4) },
  { z: 5.0, pts: S(-0.86, 0.9, 1.1, -0.5, 1.25, -0.05, 0.95, 0.3, 0.46, 0.46, 0.4) },
  { z: 6.3, pts: S(-0.45, 0.55, 0.8, -0.25, 0.9, 0.1, 0.78, 0.4, 0.42, 0.5, 0.36) },
  { z: 6.95, pts: S(-0.22, 0.4, 0.62, -0.1, 0.72, 0.2, 0.62, 0.45, 0.4, 0.5, 0.38) },
]);
const BODY_SUB = [3, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3];

// where the intake skins end: the body's own section from their inner wall round
const INTAKE_XI = 0.8;
const INTAKE_END: P2[] = (() => {
  const q = BODY(-1.25);
  const yb = q[0][1];
  const t = (q[7][0] - INTAKE_XI) / Math.max(1e-6, q[7][0] - q[8][0]);
  const top: P2 = [INTAKE_XI, q[7][1] + (q[8][1] - q[7][1]) * t];
  return resample([[INTAKE_XI, yb], q[2], q[3], q[4], q[5], q[6], q[7], top], 144);
})();

// a tall one-piece canopy (its crown 1.27 m over the datum) that runs into the spine
const CANOPY: Section[] = [
  { z: -6.0, w: 0.03, top: 0.02, bot: 0.02, y: 0.36, n: 2 },
  { z: -5.5, w: 0.34, top: 0.36, bot: 0.03, y: 0.38, n: 2.3 },
  { z: -4.9, w: 0.46, top: 0.7, bot: 0.03, y: 0.42, n: 2.3 },
  { z: -4.2, w: 0.48, top: 0.82, bot: 0.03, y: 0.44, n: 2.3 },
  { z: -3.5, w: 0.46, top: 0.74, bot: 0.03, y: 0.5, n: 2.3 },
  { z: -2.95, w: 0.4, top: 0.62, bot: 0.03, y: 0.58, n: 2.3 },
  { z: -2.5, w: 0.3, top: 0.42, bot: 0.03, y: 0.7, n: 2.2 },
  { z: -2.2, w: 0.12, top: 0.1, bot: 0.03, y: 0.95, n: 2 },
];

// trapezoidal wing: 34 deg leading edge, trailing edge swept forward 16 deg,
// the root chord 5.2 m, a 1.4 m streamwise tip
const wle = (x: number) => -1.1 + (x - 1.45) * 0.73;
const wte = (x: number) => 4.33 - (x - 1.45) * 0.25;
const WING: WingStation[] = [
  { x: 1.2, le: -1.3, te: 4.4, y: -0.04, t: 0.052 },
  { x: 1.45, le: wle(1.45), te: wte(1.45), y: -0.05, t: 0.05 },
  { x: 5.35, le: wle(5.35), te: wte(5.35), y: -0.16, t: 0.034 },
];
// the tailplanes' 42 deg leading edge tucks under the wing's trailing edge
const STAB: WingStation[] = [
  { x: 1.0, le: 3.8, te: 7.45, y: -0.14, t: 0.042 },
  { x: 3.65, le: 6.0, te: 6.8, y: -0.18, t: 0.03 },
];
const STAB_PIVOT = 6.4;
const FIN: WingStation[] = [
  { x: 0, le: 4.1, te: 7.0, t: 0.046 },
  { x: 2.35, le: 5.85, te: 7.3, t: 0.03 },
];
const RUDDER = { h0: 0.2, h1: 2.15, hinge: (h: number) => 6.42 + h * 0.15 };
const FIN_ROOT = { x: 0.98, y: 0.28, cant: 20 };
// the two weapons bays side by side under the belly
const BAY: P2 = [-1.3, 2.9];
const BAY_X: P2 = [0.12, 1.25];

function livery(team: string): Livery {
  const L = new Livery({ half: 7.0, z0: -8.0, len: 16, y0: -2.0, height: 5.0 });
  const { gt, gb, gs } = L;
  const rnd = prng(35);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S2 = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // the radar-absorbent coating: slightly darker panels where it is renewed,
  // and lighter patches of fresh RAM tape and sealant along the seams
  const patch = (g: CanvasRenderingContext2D, M: (x: number, z: number) => [number, number], x0: number, z0: number, x1: number, z1: number, a: number) => {
    const [px0, py0] = M(x0, z0), [px1, py1] = M(x1, z1);
    g.fillStyle = `rgba(80,84,88,${a})`;
    g.fillRect(Math.min(px0, px1), Math.min(py0, py1), Math.abs(px1 - px0), Math.abs(py1 - py0));
  };
  for (let i = 0; i < 26; i++) {
    const x = (rnd() - 0.5) * 6, z = -6 + rnd() * 13;
    patch(gt, T, x, z, x + 0.3 + rnd() * 0.8, z + 0.3 + rnd() * 1.2, 0.12 + rnd() * 0.18);
    const xb = (rnd() - 0.5) * 6, zb = -6 + rnd() * 13;
    patch(gb, B, xb, zb, xb + 0.3 + rnd() * 0.8, zb + 0.3 + rnd() * 1.2, 0.1 + rnd() * 0.15);
  }
  // the radome and the edge strips: a slightly different grey
  gt.fillStyle = 'rgba(92,96,100,0.55)';
  gt.beginPath();
  gt.ellipse(...T(0, -6.9), 0.38 * pt, 0.9 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  // cockpit well
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.fillRect(...T(-0.44, -5.0), 0.88 * pt, 2.6 * pt);
  // sawtooth access panels and seams
  const saw = (g: CanvasRenderingContext2D, M: (x: number, z: number) => [number, number], x0: number, x1: number, z: number) => {
    const pts: [number, number][] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) pts.push(M(x0 + ((x1 - x0) * i) / n, z + (i % 2 ? 0.12 : 0)));
    line(g, pts, 1.3, LINE);
  };
  for (const z of [-6.2, -4.9, -2.4, -0.6, 1.4, 3.3, 5.2, 6.6]) {
    line(gt, [T(-0.9, z), T(0.9, z)], 1.1, LINE_LIGHT);
    line(gb, [B(-0.9, z), B(0.9, z)], 1.0, LINE_LIGHT);
    line(gs, [S2(z, -0.7), S2(z, 0.5)], 1.2, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    saw(gt, W, 0.25, 0.95, -1.6);
    saw(gt, W, 0.25, 0.95, 2.6);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(1.6, wle(1.6) + 0.25), M(5.25, wle(5.25) + 0.18)], 1.3, LINE); // leading-edge flaps
      line(g, [M(1.6, wte(1.6) - 0.7), M(5.1, wte(5.1) - 0.5)], 1.2, LINE_LIGHT);
      rivets(g, M(1.6, wle(1.6) + 0.5), M(5.25, wle(5.25) + 0.32), 8, 0.8);
      for (const x of [2.4, 3.3, 4.2]) line(g, [M(x, wle(x) + 0.3), M(x, wte(x) - 0.55)], 1.0, LINE_LIGHT);
      const edge = 'rgba(96,100,104,0.5)';
      const wk = (g === gt ? pt : L.pb) * 0.16;
      line(g, [M(1.45, wle(1.45) + 0.08), M(5.35, wle(5.35) + 0.08)], wk, edge);
      line(g, [M(1.0, 3.85), M(3.6, 6.15)], wk, edge);
    }
    // the bay doors underneath: sawtooth front and back edges
    saw(gb, Wb, BAY_X[0], BAY_X[1], BAY[0]);
    saw(gb, Wb, BAY_X[0], BAY_X[1], BAY[1]);
    line(gb, [Wb(BAY_X[1], BAY[0]), Wb(BAY_X[1], BAY[1])], 1.3, LINE);
    line(gb, [Wb(0.58, BAY[0]), Wb(0.58, BAY[1])], 1.1, LINE_LIGHT);
    if (sx < 0) roundel(gt, team, ...W(3.9, 2.3), 0.36 * pt);
    else roundel(gb, team, ...Wb(3.9, 2.3), 0.36 * L.pb);
  }
  weather(gt, L.top.width, L.top.height, rnd, 0.5, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.4, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.5, [1, 0.1]);
  L.copySides();
  const mark = 'rgba(46,49,52,0.85)';
  // tail code and serial, low-visibility
  L.sideText(team === 'blue' ? 'HL' : 'LF', 5.75, 1.25, 0.32 * ps, mark);
  L.sideText(team === 'blue' ? 'AF 14-5097' : 'AF 18-5341', 6.0, 0.8, 0.09 * ps, mark);
  L.sideDraw(-1.5, -0.2, (g, x, y) => roundel(g, team, x, y, 0.2 * ps));
  L.sideText('USAF', 1.4, -0.35, 0.13 * ps, mark);
  return L;
}

const liveries = new Map<string, Livery>();

function buildBays(v: AirframeVisual, paint: THREE.Material): void {
  const cavity = bayInteriorMaterial();
  const ribs = (u: number, w: number) => {
    const edge = Math.min(u, 1 - u, w * 3, (1 - w) * 3);
    let c = 0.55 + 0.45 * Math.min(1, edge * 6);
    if (Math.abs(((u * 2) % 1) - 0.5) < 0.08) c *= 0.55;
    if (Math.abs(((w * 6) % 1) - 0.5) < 0.05) c *= 1.25;
    return c;
  };
  for (const sx of [-1, 1] as const) {
    const bay = sx < 0 ? 'left' : 'right';
    const y = (z: number) => BODY(z)[0][1];
    const zm = (BAY[0] + BAY[1]) / 2;
    // two doors a bay: the inner one hinged at the keel, the outer one at the bay's outer edge
    for (const [a, b, hingeX] of [[BAY_X[0], 0.58, BAY_X[0]], [0.58, BAY_X[1], BAY_X[1]]] as [number, number, number][]) {
      const edge = (z: number): [P2, P2] => [[a * sx, y(z)], [b * sx, y(z)]];
      const door = stamp(skinPanel(BAY[0], BAY[1], edge, 0.006, 0.022));
      const hinge = new THREE.Vector3(hingeX * sx, y(zm), zm);
      const axis = new THREE.Vector3(0, 0, 1);
      const far = new THREE.Vector3(((a + b) / 2) * sx, hinge.y, zm);
      v.addBayDoor(door, paint, hinge, axis.clone().multiplyScalar(swingSign(far, hinge, axis, new THREE.Vector3(0, -1, 0), 30)), bay, 95);
    }
    const all = (z: number): [P2, P2] => [[BAY_X[0] * sx, y(z)], [BAY_X[1] * sx, y(z)]];
    v.addBayCavity(skinPanel(BAY[0], BAY[1], all, 0.002, 0, 16, ribs), cavity, bay);
  }
}

export function buildF35(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  // FS 36170-ish dark grey, the coating's slight sheen
  const paint = skinMaterial({ top: new THREE.Color('#6b7075'), bottom: new THREE.Color('#73787d'), livery: L, roughness: 0.42, metalness: 0.18 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-7.85, -5.5, 34, 0.6, 0), stations(-5.5, -1.25, 54), stations(-1.25, 6.95, 76));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -7.6, 6.9, 40);

  // --- diverterless intakes: a trapezoidal mouth whose upper inboard corner
  // leads, raked back toward the bottom and the outside, the fuselage bump
  // inside it doing the diverter's job
  const para = (z: number): P2[] => {
    const u = sstep(-4.0, -2.4, z);
    const ib: P2 = [INTAKE_XI, -0.7 - 0.1 * u];
    const ob: P2 = [1.4 + 0.2 * u, -0.7 - 0.1 * u];
    const ot: P2 = [1.52 + 0.22 * u, 0.2 - 0.04 * u];
    const it: P2 = [INTAKE_XI, 0.46];
    const pts: P2[] = [];
    const edge = (a: P2, b: P2, n: number) => {
      for (let i = 0; i < n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
    };
    edge(ib, ob, 8);
    edge(ob, ot, 10);
    edge(ot, it, 10);
    edge(it, ib, 12);
    const w = sstep(-2.3, -1.3, z);
    if (w <= 0) return pts;
    const a = resample(pts, 144);
    return a.map((p, i) => [p[0] + (INTAKE_END[i][0] - p[0]) * w, p[1] + (INTAKE_END[i][1] - p[1]) * w] as P2);
  };
  const ci = intake({
    loop: para,
    outer: stations(-4.0, -1.25, 32, 0.3, 0),
    lip: 0.035,
    depth: 1.8,
    n: 72,
    rake: (x, y) => -0.45 * (y - 0.46) + 0.1 * (x - INTAKE_XI),
    rakeFade: 1.0,
    fan: { cx: 1.15, cy: -0.15, r: 0.32 },
  });
  skin(both(ci.skin));
  const duct = (pm.duct as THREE.MeshStandardMaterial).clone();
  duct.color.set('#3a3e42');
  v.addMesh(both(ci.duct), duct);
  const blind = new THREE.MeshBasicMaterial({ color: '#08090a' });
  for (const sx of [-1, 1]) {
    const d = new THREE.CircleGeometry(0.36, 28);
    d.rotateY(Math.PI);
    d.translate(1.15 * sx, -0.15, -4.0 + 1.8 - 0.02);
    v.addMesh(d, blind);
  }
  // the DSI bump: a smooth swelling of the fuselage side inside each mouth
  for (const sx of [-1, 1]) {
    const b = new THREE.SphereGeometry(1, 28, 18);
    b.scale(0.12, 0.4, 1.0);
    b.translate(INTAKE_XI * sx, -0.1, -3.3);
    skin(b);
  }

  // --- canopy, seat, pilot ---------------------------------------------------------
  v.cockpitEye.set(0, 0.95, -4.5);
  buildCanopy(v, CANOPY, -5.5, []);
  addPilot(v, new THREE.Vector3(0, 0.95, -4.5), 0.26, { style: 'us', stick: 'side', martinBaker: true });
  const shroud = loftProfile({
    stations: stations(-5.42, -5.05, 6),
    profile: (z) => {
      const u = sstep(-5.42, -5.05, z);
      return [[0, 0.1], [0.4, 0.12], [0.44, 0.42], [0.32, 0.5 - u * 0.06], [0, 0.52 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  if (v.canopy) {
    // the canopy's coating: a faint gold-bronze tint from outside
    const gm = (v.canopy.material as THREE.MeshStandardMaterial).clone();
    gm.color.set('#4a4232');
    gm.opacity = 0.9;
    gm.metalness = 0.85;
    gm.roughness = 0.08;
    glassify(gm, 0.95);
    v.canopy.material = gm;
  }

  // --- EOTS under the chin: a faceted sapphire window in a sharp-edged fairing
  const eots = roundBox(0.26, 0.18, 0.6, 0.04);
  eots.translate(0, -0.58, -6.0);
  skin(eots);
  for (const [dx, dz] of [[-0.06, -6.22], [0.06, -6.22], [0, -6.3]]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.05, 6), pm.glass);
    w.position.set(dx, -0.64, dz);
    w.rotation.set(-0.9, Math.PI, 0);
    v.body.add(w);
  }
  // DAS apertures: small dark windows round the airframe
  for (const [x, y, z, rx, ry] of [[0.42, 0.18, -6.0, 0, 0.9], [-0.42, 0.18, -6.0, 0, -0.9], [0, 1.07, -1.9, -1.57, 0], [0, -0.86, -3.8, 1.57, 0], [1.1, 0.36, 2.6, 0, 1.2], [-1.1, 0.36, 2.6, 0, -1.2]]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.045, 6), pm.lens);
    w.position.set(x, y, z);
    w.rotation.set(rx, ry, 0);
    v.body.add(w);
  }

  // --- wing: leading-edge flaps, flaperons -----------------------------------------
  const panels = wingPanels(
    WING,
    [
      { x0: 1.6, x1: 5.25, hinge: (x) => wle(x) + 0.12 * (wte(x) - wle(x)) + 0.05, kind: 'lef', maxDeg: 25, leading: true },
      { x0: 1.62, x1: 3.3, hinge: (x) => wte(x) - 0.62, kind: 'flap', maxDeg: 30 },
      { x0: 3.35, x1: 5.15, hinge: (x) => wte(x) - 0.5, kind: 'aileron', maxDeg: 25 },
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

  // --- all-moving tailplanes ------------------------------------------------------------
  const stab = wing({ sections: STAB, chordPts: 28, spanSub: 8, tip: 'flat', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    v.addSurface(g, paint, new THREE.Vector3(1.0 * side, -0.14, STAB_PIVOT), new THREE.Vector3(1, 0, 0), 'stab', side, 25);
  }

  // --- twin fins canted out 20 deg -------------------------------------------------------
  for (const side of [1, -1] as const) {
    const m = finMatrix(FIN_ROOT.x * side, FIN_ROOT.y, FIN_ROOT.cant, side);
    const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 30);
    const top = new THREE.Vector3(2.35, 0, 0).applyMatrix4(m);
    v.addNavLight(new THREE.Vector3(top.x, top.y, 6.3), 'formation');
  }

  // --- the F135's nozzle, set high in the upswept tail: low-observable, with serrated petal edges
  const nz = nozzle({ cx: 0, cy: 0.36, z0: 6.85, z1: 7.82, r0: 0.54, r1: 0.46, petals: 15, saw: 0.09, floor: 6.98 });
  const nzOut = v.addMesh(nz.outer, pm.nozzle);
  const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
  nzIn.userData.detail = true;
  v.morphNozzle(nzOut, nzIn);
  v.nozzles.push({ pos: new THREE.Vector3(0, 0.36, 7.76), radius: 0.44, depth: 0.82, area: nz.area });
  v.buildFlames(5.6);

  // --- GAU-22/A blister over the left intake, its muzzle door at the front --------------
  skin(lathe([[0.004, -2.35], [0.07, -2.15], [0.095, -1.7], [0.09, -0.9], [0.05, -0.4], [0.004, -0.25]], 14, -0.95, 0.42));
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), pm.darkMetal);
  muzzle.position.set(-0.95, 0.42, -2.3);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);

  // --- probes, antennas, lights -----------------------------------------------------------
  v.addMesh(join([
    probe(new THREE.Vector3(0.24, -0.1, -6.9), 0.16, 0.008, new THREE.Vector3(0.1, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.24, -0.1, -6.9), 0.16, 0.008, new THREE.Vector3(-0.1, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 1.05, 0.4), 0.1, 0.2),
    blade(new THREE.Vector3(0, -1.02, 3.2), 0.1, 0.2, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.72, 0.12, -4.6), new THREE.Vector3(1, 0.5, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.032),
    formationStrip(new THREE.Vector3(-0.72, 0.12, -4.6), new THREE.Vector3(-1, 0.5, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.032),
    formationStrip(new THREE.Vector3(1.76, 0.0, 1.6), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.55, 0.032),
    formationStrip(new THREE.Vector3(-1.76, 0.0, 1.6), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.55, 0.032),
  ]), pm.formation, v.body, false);
  buildBays(v, paint);
  v.addNavLight(new THREE.Vector3(-5.3, -0.17, 2.5), 'red');
  v.addNavLight(new THREE.Vector3(5.3, -0.17, 2.5), 'green');
  v.addNavLight(new THREE.Vector3(0, -1.08, 4.2), 'strobe');

  // --- landing gear: single nose wheel, mains folding forward into the fuselage sides
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.8, -4.9), axle: new THREE.Vector3(0, -1.95 + 0.3, -5.1), r: 0.3, w: 0.18, twin: false, retract: 'forward' },
    mains: { top: new THREE.Vector3(1.3, -0.95, 0.6), axle: new THREE.Vector3(1.55, -1.95 + 0.4, 0.9), r: 0.4, w: 0.26, retract: 'forward', outboard: 0.06 },
    doorColor: '#73787d',
  });
}
