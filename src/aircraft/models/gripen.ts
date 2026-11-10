// Saab JAS 39E Gripen E: 15.2 m long with the nose probe, 8.6 m span (with tip rails), 4.5 m tall.
// Measured from a scale three-view. Single seat: a slim, drooped radome behind a metre-long probe on a
// round forward fuselage, the Skyward-G IRST ahead of a one-piece bubble canopy that fairs into a high,
// level spine, sharp-lipped rectangular intake boxes standing off the fuselage sides with the close-coupled
// canards pivoting on their tops, a low delta wing (51 deg of sweep, a dog-tooth at two-thirds span, the
// trailing edge 12.7 m behind the probe tip), wingtip missile rails, one fin with the EW pod below its tip,
// and one F414G nozzle on the engine axis, above the nose line.

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

// right half, bottom centre -> top centre; points 4-6 are the wing-root line.
// The radome axis sits about 0.3 m below the engine axis (the nose droops); the
// forward fuselage is round, about 0.9 m across at the cockpit (the intake boxes
// hang beside it, not off a shoulder), the belly is nearly flat at -0.8 further
// back and the spine behind the canopy stays high.
const BODY = keyedProfile([
  { z: -6.75, pts: circ(0.012, -0.33) },
  { z: -6.6, pts: circ(0.09, -0.31) },
  { z: -6.1, pts: circ(0.22, -0.26) },
  { z: -5.6, pts: circ(0.34, -0.215) },
  { z: -5.1, pts: circ(0.43, -0.16) },
  { z: -4.6, pts: circ(0.485, -0.12) },
  // the cockpit: the well opens under the glass, the sill climbing from 0.4 to 0.55
  { z: -4.1, pts: [[0, -0.59], [0.3, -0.57], [0.46, -0.42], [0.51, -0.24], [0.52, -0.08], [0.52, 0.0], [0.52, 0.08], [0.51, 0.2], [0.49, 0.32], [0.46, 0.4], [0.36, 0.2], [0, 0.14]] },
  { z: -3.2, pts: [[0, -0.58], [0.3, -0.56], [0.46, -0.42], [0.52, -0.24], [0.53, -0.08], [0.53, 0.0], [0.53, 0.08], [0.52, 0.22], [0.5, 0.38], [0.47, 0.47], [0.36, 0.22], [0, 0.16]] },
  { z: -2.4, pts: [[0, -0.6], [0.3, -0.59], [0.45, -0.46], [0.5, -0.26], [0.5, -0.1], [0.5, -0.02], [0.5, 0.06], [0.5, 0.24], [0.5, 0.42], [0.47, 0.55], [0.36, 0.3], [0, 0.24]] },
  { z: -1.5, pts: [[0, -0.7], [0.3, -0.69], [0.44, -0.56], [0.48, -0.3], [0.48, -0.1], [0.48, -0.02], [0.48, 0.06], [0.5, 0.3], [0.5, 0.56], [0.44, 0.76], [0.25, 0.88], [0, 0.91]] },
  // the level spine and the flat belly, the body taking the intake trunks' width
  { z: -0.6, pts: [[0, -0.75], [0.4, -0.76], [0.72, -0.72], [0.9, -0.5], [0.97, -0.3], [0.97, -0.24], [0.97, -0.16], [0.94, 0.14], [0.8, 0.46], [0.56, 0.66], [0.3, 0.78], [0, 0.82]] },
  { z: 1.5, pts: [[0, -0.75], [0.44, -0.76], [0.8, -0.71], [0.94, -0.48], [0.98, -0.32], [0.98, -0.26], [0.98, -0.18], [0.95, 0.12], [0.8, 0.44], [0.56, 0.65], [0.3, 0.77], [0, 0.81]] },
  { z: 3.2, pts: [[0, -0.62], [0.42, -0.63], [0.76, -0.58], [0.9, -0.42], [0.94, -0.3], [0.94, -0.24], [0.94, -0.16], [0.9, 0.1], [0.76, 0.42], [0.52, 0.63], [0.27, 0.76], [0, 0.8]] },
  { z: 5.0, pts: [[0, -0.5], [0.4, -0.51], [0.66, -0.46], [0.8, -0.32], [0.84, -0.2], [0.84, -0.14], [0.84, -0.06], [0.8, 0.14], [0.68, 0.4], [0.46, 0.58], [0.22, 0.68], [0, 0.72]] },
  { z: 6.0, pts: [[0, -0.36], [0.3, -0.37], [0.5, -0.3], [0.6, -0.14], [0.62, 0.0], [0.62, 0.06], [0.62, 0.12], [0.6, 0.3], [0.5, 0.48], [0.34, 0.6], [0.16, 0.66], [0, 0.68]] },
  { z: 6.6, pts: circ(0.5, 0.155) },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

// windscreen base 3.2 m behind the probe tip, the crown a metre over the nose line, the aft end fairing into the spine
const CANOPY: Section[] = [
  { z: -4.42, w: 0.04, top: 0.02, bot: 0.02, y: 0.36, n: 2 },
  { z: -4.1, w: 0.34, top: 0.2, bot: 0.03, y: 0.4, n: 2.2 },
  { z: -3.6, w: 0.44, top: 0.4, bot: 0.03, y: 0.43, n: 2.2 },
  { z: -3.1, w: 0.46, top: 0.57, bot: 0.03, y: 0.47, n: 2.2 },
  { z: -2.6, w: 0.46, top: 0.5, bot: 0.03, y: 0.51, n: 2.2 },
  { z: -2.1, w: 0.43, top: 0.4, bot: 0.03, y: 0.56, n: 2.2 },
  { z: -1.7, w: 0.34, top: 0.26, bot: 0.03, y: 0.66, n: 2.1 },
  { z: -1.45, w: 0.14, top: 0.06, bot: 0.03, y: 0.84, n: 2 },
];

// delta wing: 51 deg of leading-edge sweep with a dog-tooth at two-thirds span (the outer panel's
// edge starts 0.23 m further forward), the trailing edge all but straight
const DOG = 3.1;
const wle = (x: number) => (x < DOG + 0.007 ? 0.17 + (x - 1.2) * 1.23 : 2.28 + (x - DOG - 0.015) * 1.375);
const wte = (x: number) => 5.17 - (x - 1.4) * 0.058;
const WING: WingStation[] = [
  { x: 0.7, le: -0.7, te: 5.2, y: -0.34, t: 0.05 },
  { x: 1.06, le: wle(1.06), te: wte(1.06), y: -0.35, t: 0.048 },
  { x: DOG, le: wle(DOG), te: wte(DOG), y: -0.385, t: 0.04 },
  { x: DOG + 0.015, le: wle(DOG + 0.015), te: wte(DOG + 0.015), y: -0.385, t: 0.04 },
  { x: 4.2, le: wle(4.2), te: wte(4.2), y: -0.4, t: 0.035 },
];
// the canards: close-coupled, rooted on the intake tops from the lip's top edge, the leading edge
// swept 57 degrees, the trailing edge swept too, a narrow tip, 8 deg of dihedral (the tips ride
// up above the intake and the spine shoulder, as in the front view)
const CANARD: WingStation[] = [
  { x: 0.72, le: -2.48, te: -0.45, y: 0.31, t: 0.05 },
  { x: 1.0, le: -2.3, te: -0.4, y: 0.35, t: 0.048 },
  { x: 2.35, le: -0.23, te: 0.27, y: 0.54, t: 0.035 },
];
const CANARD_PIVOT = -1.3;
/** the intake: the lip's leading point (mid-height, outboard) and the D's reach aft */
const MOUTH = -2.85;
/** the D's flat inner wall (beside the splitter gap), its width outboard, centre height and half height */
const BOX_XI = curve([[MOUTH, 0.555], [-1.0, 0.545], [0.8, 0.64]]);
const BOX_W = curve([[MOUTH, 0.5], [-1.0, 0.52], [0.8, 0.36]]);
const BOX_Y = curve([[MOUTH, -0.08], [-1.0, -0.1], [0.8, -0.14]]);
const BOX_HH = curve([[MOUTH, 0.38], [-1.0, 0.4], [0.8, 0.32]]);
// D-shaped mouth: flat against the splitter, the top nearly flat under the canard, the outer
// side and the bottom rounded
function dLoop(x0: number, cy: number, w: number, hh: number): P2[] {
  const out: P2[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    const e = s < 0 ? 0.5 : 0.3;
    out.push([x0 + w * Math.pow(Math.max(0, c), e), cy + hh * Math.sign(s) * Math.pow(Math.abs(s), e)]);
  }
  for (let i = 1; i < 6; i++) out.push([x0, cy + hh - (2 * hh * i) / 6]);
  return out;
}
const FIN_Y = 0.48;
// the fin: a 51 deg leading edge, an upright trailing edge, a short tip above the EW pod
const FIN: WingStation[] = [
  { x: 0, le: 2.92, te: 6.65, t: 0.05 },
  { x: 2.4, le: 5.89, te: 6.5, t: 0.034 },
];
const RUDDER = { h0: 0.42, h1: 1.57, hinge: (h: number) => 5.94 + h * 0.08 };

function livery(team: string): Livery {
  const L = new Livery({ half: 7.0, z0: -7.8, len: 15.6, y0: -1.8, height: 5.0 });
  const { gt, gb, gs } = L;
  const rnd = prng(39);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // radome
  gt.fillStyle = 'rgba(92,98,104,0.7)';
  gt.beginPath();
  gt.ellipse(...T(0, -5.9), 0.36 * pt, 0.85 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gb.fillStyle = 'rgba(92,98,104,0.6)';
  gb.beginPath();
  gb.ellipse(...B(0, -5.9), 0.36 * L.pb, 0.85 * L.pb, 0, 0, Math.PI * 2);
  gb.fill();
  // (no dark anti-glare panel: the nose ahead of the windscreen is plain grey)
  // cockpit well
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.fillRect(...T(-0.44, -4.1), 0.88 * pt, 2.4 * pt);
  for (const z of [-5.05, -4.45, -1.4, -0.3, 1.1, 2.6, 4.0, 5.2, 6.3]) {
    line(gt, [T(-0.98, z), T(0.98, z)], 1.2, LINE_LIGHT);
    line(gs, [S(z, -0.85), S(z, 0.64)], 1.4, LINE);
    line(gb, [B(-0.98, z), B(0.98, z)], 1.1, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    line(gt, [T(0.5 * sx, -1.0), T(0.46 * sx, 6.2)], 1.1, LINE_LIGHT);
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(1.1, wle(1.1) + 0.7), M(4.1, wle(4.1) + 0.3)], 1.2, LINE_LIGHT);
      line(g, [M(1.4, wle(1.4) + 0.55), M(4.1, wle(4.1) + 0.42)], 1.3, LINE); // leading-edge flaps
      line(g, [M(1.1, wte(1.1) - 0.85), M(4.1, wte(4.1) - 0.7)], 1.2, LINE); // elevon hinges
      line(g, [M(2.53, wle(2.53) + 0.6), M(2.53, wte(2.53))], 1.0, LINE); // elevon split
      rivets(g, M(1.1, wle(1.1) + 0.7), M(4.1, wle(4.1) + 0.3), 7, 0.9);
      rivets(g, M(1.1, wte(1.1) - 0.85), M(4.1, wte(4.1) - 0.7), 7, 0.9);
      for (const x of [1.7, 2.5, 3.3]) line(g, [M(x, wle(x) + 0.8), M(x, wte(x) - 1.0)], 1.0, LINE_LIGHT);
      line(g, [M(1.05, -2.45), M(2.45, -0.45)], 1.0, LINE_LIGHT); // canard
    }
    if (sx < 0) roundel(gt, team, ...W(2.9, 3.55), 0.36 * pt);
    else roundel(gb, team, ...Wb(2.9, 3.55), 0.36 * L.pb);
  }
  line(gs, [S(-6.1, -0.3), S(-3.4, -0.3)], 1.3, LINE_LIGHT);
  line(gs, [S(-3.1, -0.76), S(5.6, -0.8)], 1.3, LINE);
  // the intake box's panels: the DANGER chevron on its outer wall, a few doors
  const chev = 'rgba(58,62,68,0.9)';
  // (everything sits behind the first 0.5 m of the box: its inboard wall shows through the gap, and
  // the skin rolls that far into the duct, where it would show from ahead)
  line(gs, [S(-2.38, -0.42), S(-2.05, -0.14), S(-2.38, 0.14)], 3.4, chev);
  line(gs, [S(-1.3, -0.48), S(-0.7, -0.48), S(-0.7, -0.2), S(-1.3, -0.2)], 1.2, LINE, true);
  line(gs, [S(0.0, -0.5), S(0.6, -0.5), S(0.6, -0.2), S(0.0, -0.2)], 1.2, LINE, true);
  weather(gt, L.top.width, L.top.height, rnd, 0.7, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.55, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.6, [1, 0.1]);
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    const [x, y] = M(0, 6.6);
    const gr = g.createLinearGradient(x, y - 1.4 * s, x, y);
    gr.addColorStop(0, 'rgba(40,36,30,0)');
    gr.addColorStop(1, 'rgba(40,36,30,0.32)');
    g.fillStyle = gr;
    g.fillRect(x - 0.5 * s, y - 1.4 * s, 1.0 * s, 1.4 * s);
  }
  L.copySides();
  const mark = 'rgba(40,44,50,0.85)';
  // (no two-digit code on the nose: the Gripen E carries the roundel there, ahead of the intake)
  L.sideText(team === 'blue' ? '39 8061' : '39 8027', 5.6, 1.05, 0.11 * ps, mark);
  L.sideText('DANGER', -2.1, -0.05, 0.085 * ps, chev);
  L.sideText(team === 'blue' ? '398061' : '398027', -1.0, 0.05, 0.07 * ps, mark);
  L.sideText('EMERGENCY OPENING', -3.0, 0.32, 0.035 * ps, mark);
  L.sideDraw(5.6, 1.6, (g, x, y) => roundel(g, team, x, y, 0.2 * ps));
  L.sideDraw(-4.4, -0.2, (g, x, y) => roundel(g, team, x, y, 0.2 * ps));
  return L;
}

const liveries = new Map<string, Livery>();

export function buildGripen(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#848c92'), bottom: new THREE.Color('#9aa1a6'), livery: L, roughness: 0.55, metalness: 0.05 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-6.75, -4.6, 30, 0.55, 0), stations(-4.6, -1.5, 44), stations(-1.5, 6.6, 74));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -6.6, 6.5, 40);

  // --- the intakes: rounded D mouths, 0.5 m wide and 0.76 m tall, standing 4 cm off the round
  // fuselage on a full-height splitter gap; the lip leads at mid-height and outboard, curving back
  // to the top and bottom (convex forward from the side) and toward the fuselage; the trunk fairs
  // into the wing root
  const loop = (z: number) => dLoop(BOX_XI(z), BOX_Y(z), BOX_W(z), BOX_HH(z));
  const yC = BOX_Y(MOUTH), hC = BOX_HH(MOUTH), xI = BOX_XI(MOUTH), wC = BOX_W(MOUTH);
  const inl = intake({
    loop,
    outer: stations(MOUTH, 0.8, 44, 0.3, 0),
    lip: 0.032,
    depth: 1.8,
    n: 72,
    rake: (x, y) => {
      const q = (y - yC) / hC;
      return 0.3 * q * q + 0.06 * (q + 1) + 0.12 * (1 - Math.min(1, (x - xI) / wC));
    },
    rakeFade: 1.4,
    fan: { cx: 0.76, cy: -0.11, r: 0.26 },
    // the S-duct hides most of the fan: the mouth reads dark from ahead, as in the photos
    ductShade: { k0: 0.42, fall: 1.8, floor: 0.04, fan: 0.35 },
  });
  skin(both(inl.skin));
  v.addMesh(both(inl.duct), pm.duct);
  // the gap's back wall reads dark from ahead, and the box top closes onto the
  // fuselage behind the lip (the canard root deck)
  for (const sx of [-1, 1]) {
    const back = new THREE.PlaneGeometry(0.06, 0.72);
    if (sx > 0) back.rotateY(Math.PI);
    back.translate(0.535 * sx, -0.08, -1.95);
    v.addMesh(back, new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.9, side: THREE.DoubleSide }));
    const deck = loftProfile({
      stations: stations(-2.4, 0.8, 16),
      profile: (z) => {
        const h = sstep(-2.4, -1.8, z) * 0.075;
        return [[0.46, 0.25], [0.6, 0.25], [0.6, 0.25 + h], [0.53, 0.27 + h], [0.46, 0.28 + h]] as P2[];
      },
      sub: 2,
      full: true,
      capStart: true,
      capEnd: true,
    });
    skin(sx > 0 ? deck : mirror(deck));
    // the canard's pivot fairing on the box top
    skin(lathe([[0.004, -2.3], [0.09, -2.1], [0.125, -1.7], [0.12, -1.0], [0.08, -0.7], [0.004, -0.55]], 14, 0.8 * sx, 0.25));
  }

  // --- canopy, seat, pilot, IRST
  v.cockpitEye.set(0, 0.74, -3.05);
  buildCanopy(v, CANOPY, -3.4, []);
  addPilot(v, new THREE.Vector3(0, 0.74, -3.05), 0.28, { style: 'eu', stick: 'center', martinBaker: true });
  // (it starts at the windscreen's base, under the glass: ahead of it it would stand proud of the nose)
  const shroud = loftProfile({
    stations: stations(-4.38, -4.0, 6),
    profile: (z) => {
      const u = sstep(-4.38, -4.0, z);
      return [[0, 0.08], [0.36, 0.1], [0.4, 0.3], [0.28, 0.36 + u * 0.04], [0, 0.38 + u * 0.04]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  // Skyward-G IRST: a small glass dome ahead of the windscreen, offset right
  const irst = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), pm.glass);
  irst.position.set(0.15, 0.3, -4.95);
  v.body.add(irst);
  v.hideInCockpit.push(irst, skin(lathe([[0.004, -5.25], [0.1, -5.12], [0.115, -4.95], [0.1, -4.75], [0.004, -4.62]], 16, 0.15, 0.25)));

  // --- wing: leading-edge flaps, two elevons a side
  const panels = wingPanels(
    WING,
    [
      { x0: 1.4, x1: DOG - 0.01, hinge: (x) => wle(x) + 0.5 - (x - 1.4) * 0.05, kind: 'lef', maxDeg: 20, leading: true },
      { x0: DOG + 0.02, x1: 4.15, hinge: (x) => wle(x) + 0.45 - (x - DOG) * 0.08, kind: 'lef', maxDeg: 20, leading: true },
      { x0: 1.12, x1: 2.5, hinge: (x) => wte(x) - 0.8 + (x - 1.12) * 0.08, kind: 'flap', maxDeg: 25 },
      { x0: 2.57, x1: 4.15, hinge: (x) => wte(x) - 0.68 + (x - 2.57) * 0.08, kind: 'aileron', maxDeg: 25 },
    ],
    { chordPts: 32, thickPos: 0.42 },
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
  // wingtip missile rails (always fitted): a little longer than the tip chord
  const rail = roundBox(0.09, 0.09, 2.9, 0.03);
  rail.translate(4.3, -0.42, 3.75);
  skin(both(rail));

  // --- canards (all-moving), on the intake tops
  const canard = wing({ sections: CANARD, chordPts: 22, spanSub: 6, tip: 'round', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? canard.clone() : mirror(canard));
    v.addSurface(g, paint, new THREE.Vector3(0.72 * side, 0.3, CANARD_PIVOT), new THREE.Vector3(1, 0, 0), 'canard', side, 25);
  }

  // --- the fin, with the root fairing running forward along the spine
  const m = finMatrix(0, FIN_Y, 0, 1);
  const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
  skin(f.fixed);
  v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', 0, 25);
  // the tip: the dielectric EW pod, poking ahead of the leading edge
  skin(lathe([[0.004, 4.67], [0.07, 4.85], [0.13, 5.3], [0.14, 6.2], [0.11, 6.5], [0.004, 6.62]], 14, 0, 2.25));
  v.addNavLight(new THREE.Vector3(0, FIN_Y + 2.4, 6.4), 'strobe');
  const fillet = loftProfile({
    stations: stations(2.2, 3.6, 12),
    profile: (z) => {
      const h = sstep(2.2, 3.5, z) * 0.14;
      const w = 0.2 - sstep(2.6, 3.6, z) * 0.12;
      return [[0, 0.66], [w, 0.7], [w * 0.4, 0.78 + h], [0, 0.8 + h]] as P2[];
    },
    sub: 3,
    capStart: true,
    capEnd: true,
  });
  skin(fillet);

  // --- the F414G nozzle, on the engine axis above the nose line
  const nz = nozzle({ cx: 0, cy: 0.155, z0: 6.5, z1: 7.58, r0: 0.5, r1: 0.4, petals: 14, saw: 0.05, floor: 6.62 });
  const nzOut = v.addMesh(nz.outer, pm.nozzle);
  const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
  nzIn.userData.detail = true;
  v.morphNozzle(nzOut, nzIn);
  v.nozzles.push({ pos: new THREE.Vector3(0, 0.155, 7.52), radius: 0.38, depth: 0.7, area: nz.area });
  v.buildFlames(4.6);
  // the two airbrakes on the rear fuselage sides, shut
  for (const sx of [-1, 1]) {
    const ab = roundBox(0.03, 0.42, 0.9, 0.01);
    ab.translate(0.74 * sx, 0.1, 5.5);
    skin(ab);
  }

  // --- BK-27 in the lower left fuselage
  skin(lathe([[0.004, -1.9], [0.055, -1.75], [0.065, -1.4], [0.06, -0.9], [0.004, -0.5]], 12, -0.5, -0.52));
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.034, 12), pm.darkMetal);
  muzzle.position.set(-0.5, -0.52, -1.86);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);

  // --- probes, antennas, lights
  // the pitot: short and straight on the radome's axis, a thicker sleeve stepping down to the tube
  skin(lathe([[0.004, -7.36], [0.012, -7.33], [0.019, -7.3], [0.022, -7.02], [0.033, -7.0], [0.036, -6.82], [0.05, -6.74], [0.075, -6.62], [0.004, -6.62]], 12, 0, -0.33));
  v.addMesh(join([
    probe(new THREE.Vector3(0.3, -0.2, -5.6), 0.22, 0.009, new THREE.Vector3(0.12, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.3, -0.2, -5.6), 0.22, 0.009, new THREE.Vector3(-0.12, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.82, 0.2), 0.3, 0.3),
    blade(new THREE.Vector3(0, -0.75, 0.8), 0.13, 0.22, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.466, 0.0, -4.3), new THREE.Vector3(1, 0.1, 0), new THREE.Vector3(0, 0, 1), 0.42, 0.032),
    formationStrip(new THREE.Vector3(-0.466, 0.0, -4.3), new THREE.Vector3(-1, 0.1, 0), new THREE.Vector3(0, 0, 1), 0.42, 0.032),
    formationStrip(new THREE.Vector3(0.97, -0.2, 2.8), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.032),
    formationStrip(new THREE.Vector3(-0.97, -0.2, 2.8), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.032),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-4.36, -0.42, 2.4), 'red');
  v.addNavLight(new THREE.Vector3(4.36, -0.42, 2.4), 'green');
  v.addNavLight(new THREE.Vector3(0, -0.74, 2.2), 'strobe');

  // --- landing gear: twin nose wheels, mains folding forward into the wing roots
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.5, -3.6), axle: new THREE.Vector3(0, -1.6 + 0.22, -3.75), r: 0.22, w: 0.13, twin: true, retract: 'aft', well: { w: 0.7 } },
    mains: { top: new THREE.Vector3(0.95, -0.7, 1.8), axle: new THREE.Vector3(1.25, -1.6 + 0.3, 2.0), r: 0.3, w: 0.2, retract: 'forward', outboard: 0.05, well: { dx: 0.3, w: 0.8, dy: -0.07 } },
    doorColor: '#9aa1a6',
  });
}
