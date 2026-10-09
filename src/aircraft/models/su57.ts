// Sukhoi Su-57: 20.1 m long, 14.1 m span, 4.6 m tall.
// A flattened, blended lifting body with a sharp chine round the faceted nose,
// a long one-piece canopy, the 101KS-V IRST ball ahead of it, movable
// leading-edge root extensions (LEVCONs) in front of a 48 deg wing, two
// widely spaced nacelles under the body with trapezoidal raked intakes, two
// tandem weapons bays in the tunnel between them and a small bay under each
// wing root, small all-moving fins canted out 26 deg, all-moving stabilators,
// a long tail sting, and two AL-41F1 nozzles on gimbals (3D thrust vectoring).

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect, Livery, skinMaterial, line, rivets, weather, prng, LINE, LINE_LIGHT, curve, sstep } from './kit';
import { nozzle, intake, partMaterials, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';
import { bayInteriorMaterial, skinPanel, swingSign } from './f22';

function circ(R: number, yc: number, sq = 1): P2[] {
  const ang = [-90, -72, -52, -34, -16, -4, 4, 16, 34, 52, 72, 90];
  return ang.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * sq * Math.sin((a * Math.PI) / 180)] as P2);
}

// Right half, 12 control points, bottom centre -> top centre. Points 4-6 are the
// chine that runs from the nose into the LEVCON and wing-root edge.
// (sized off the three-view: a deep, wide radome; the canopy crown 1.36 m
// over the datum at z -5.4; the chine running out to 3 m under the LEVCONs;
// the spine sloping down from the canopy to the nozzles)
const BODY = keyedProfile([
  { z: -10.0, pts: circ(0.012, -0.2) },
  { z: -9.6, pts: circ(0.3, -0.16, 0.8) },
  // the nose is a flattened, faceted shape with a hard chine at its widest
  { z: -8.8, pts: [[0, -0.55], [0.25, -0.54], [0.44, -0.43], [0.56, -0.26], [0.62, -0.12], [0.65, -0.09], [0.62, -0.05], [0.55, 0.1], [0.44, 0.26], [0.28, 0.36], [0.13, 0.4], [0, 0.41]] },
  { z: -7.8, pts: [[0, -0.68], [0.32, -0.67], [0.58, -0.54], [0.72, -0.33], [0.8, -0.14], [0.84, -0.1], [0.8, -0.06], [0.7, 0.14], [0.56, 0.32], [0.38, 0.44], [0.18, 0.49], [0, 0.5]] },
  { z: -6.6, pts: [[0, -0.76], [0.38, -0.75], [0.64, -0.62], [0.8, -0.38], [0.88, -0.16], [0.95, -0.1], [0.9, -0.05], [0.8, 0.12], [0.64, 0.32], [0.54, 0.42], [0.4, 0.26], [0, 0.14]] },
  { z: -5.4, pts: [[0, -0.78], [0.42, -0.78], [0.68, -0.66], [0.84, -0.42], [0.95, -0.17], [1.07, -0.1], [1.03, -0.04], [0.88, 0.14], [0.7, 0.36], [0.56, 0.46], [0.42, 0.3], [0, 0.2]] },
  // the LEVCONs start: the chine sweeps outboard into a sharp root extension
  // (its edge sits just under the LEVCON's own, which reaches 3.3 m out)
  { z: -4.2, pts: [[0, -0.66], [0.44, -0.66], [0.74, -0.56], [0.92, -0.38], [1.1, -0.2], [1.3, -0.1], [1.25, -0.02], [1.05, 0.16], [0.78, 0.4], [0.58, 0.62], [0.32, 0.74], [0, 0.76]] },
  { z: -2.6, pts: [[0, -0.46], [0.6, -0.46], [1.0, -0.44], [1.45, -0.32], [1.78, -0.18], [2.0, -0.1], [1.95, -0.02], [1.55, 0.2], [1.1, 0.44], [0.7, 0.7], [0.36, 0.94], [0, 1.02]] },
  { z: -1.0, pts: [[0, -0.4], [0.7, -0.4], [1.4, -0.38], [2.0, -0.3], [2.5, -0.14], [2.85, -0.1], [2.8, -0.02], [2.2, 0.22], [1.5, 0.46], [0.85, 0.72], [0.42, 0.86], [0, 0.9]] },
  { z: 1.5, pts: [[0, -0.36], [0.7, -0.36], [1.4, -0.36], [2.1, -0.28], [2.6, -0.1], [3.0, 0.02], [2.95, 0.1], [2.3, 0.28], [1.5, 0.48], [0.82, 0.64], [0.4, 0.72], [0, 0.74]] },
  { z: 4.5, pts: [[0, -0.34], [0.7, -0.34], [1.4, -0.36], [1.9, -0.28], [2.2, -0.1], [2.35, 0.02], [2.3, 0.1], [1.95, 0.26], [1.4, 0.42], [0.85, 0.52], [0.4, 0.58], [0, 0.6]] },
  { z: 7.0, pts: [[0, -0.24], [0.45, -0.3], [0.9, -0.36], [1.3, -0.32], [1.65, -0.16], [1.85, -0.02], [1.82, 0.06], [1.62, 0.22], [1.2, 0.34], [0.78, 0.36], [0.35, 0.4], [0, 0.42]] },
  { z: 8.6, pts: [[0, -0.18], [0.2, -0.22], [0.35, -0.2], [0.45, -0.12], [0.5, -0.02], [0.5, 0.02], [0.49, 0.07], [0.45, 0.16], [0.35, 0.24], [0.25, 0.28], [0.12, 0.3], [0, 0.3]] },
  // the long sting: radar warning and the brake parachute
  { z: 9.6, pts: circ(0.19, 0.06) },
  { z: 10.1, pts: circ(0.04, 0.06) },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

// a long one-piece bubble, set low into the flattened forebody: the
// windscreen base 2.3 m behind the tip, the crown 1.36 m up at z -5.6
const CANOPY: Section[] = [
  { z: -7.7, w: 0.03, top: 0.02, bot: 0.02, y: 0.42, n: 2 },
  { z: -7.1, w: 0.4, top: 0.4, bot: 0.03, y: 0.42, n: 2.3 },
  { z: -6.4, w: 0.5, top: 0.7, bot: 0.03, y: 0.42, n: 2.3 },
  { z: -5.6, w: 0.53, top: 0.9, bot: 0.03, y: 0.44, n: 2.3 },
  { z: -4.8, w: 0.5, top: 0.86, bot: 0.03, y: 0.48, n: 2.3 },
  { z: -4.1, w: 0.42, top: 0.7, bot: 0.03, y: 0.55, n: 2.3 },
  { z: -3.5, w: 0.3, top: 0.48, bot: 0.03, y: 0.7, n: 2.2 },
  { z: -3.0, w: 0.12, top: 0.12, bot: 0.03, y: 0.88, n: 2 },
];

// wing: 48 deg leading edge from the LEVCON hinge, trailing edge almost straight
const wle = (x: number) => -1.2 + (x - 2.3) * 1.116;
const wte = (x: number) => 5.4 - (x - 2.3) * 0.042;
const WING: WingStation[] = [
  { x: 1.9, le: -1.6, te: 5.42, y: 0.08, t: 0.048 },
  { x: 2.3, le: wle(2.3), te: wte(2.3), y: 0.07, t: 0.046 },
  { x: 7.05, le: wle(7.05), te: wte(7.05), y: -0.04, t: 0.032 },
];
// the LEVCON: the sharp root extension out to the wing's kink at 3.3 m,
// hinged along the wing's leading-edge line
const LEVCON: WingStation[] = [
  { x: 1.6, le: -3.7, te: -2.2, y: 0.06, t: 0.025 },
  { x: 2.5, le: -2.35, te: -1.0, y: 0.07, t: 0.025 },
  { x: 3.3, le: -0.6, te: 0.1, y: 0.08, t: 0.025 },
];
// the stabilators: a 46 deg leading edge whose root tucks under the wing's
// trailing edge, the tips 5 m out, the trailing edge ending at the sting
const STAB: WingStation[] = [
  { x: 2.3, le: 4.9, te: 9.3, y: -0.02, t: 0.042 },
  { x: 5.2, le: 7.85, te: 8.6, y: -0.06, t: 0.03 },
];
const STAB_PIVOT_Z = 7.6;
// small, all-moving fins over the wing's trailing edge: x = height above the boom
const FIN: WingStation[] = [
  { x: 0, le: 4.4, te: 8.4, t: 0.042 },
  { x: 2.45, le: 6.55, te: 7.35, t: 0.03 },
];
const RUDDER = { h0: 0.05, h1: 2.4, hinge: (h: number) => 6.3 + h * 0.35 };
const BOOM_X = 2.05;
const NAC_X = 1.32;
const NOZZLE_Z = 7.6;
// weapons bays: the two tandem main bays in the tunnel, and one under each wing root
const BAY_F: P2 = [-1.3, 2.6];
const BAY_A: P2 = [2.8, 6.7];
const LEX_BAY: P2 = [-2.7, 0.2];

// the Su-57's camouflage: blocky fields in three blue-greys
const CAMO = ['rgb(98,114,128)', 'rgb(132,148,160)', 'rgb(168,182,192)'];

function livery(team: string): Livery {
  const L = new Livery({ half: 9.5, z0: -10.4, len: 21, y0: -2.4, height: 6.0 });
  const { gt, gb, gs } = L;
  const rnd = prng(57);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // blocky camouflage: rectangles of three tones, stepping along the airframe
  const cam = prng(571);
  const block = (g: CanvasRenderingContext2D, M: (a: number, b: number) => [number, number], a0: number, a1: number, b0: number, b1: number, cell: number) => {
    for (let a = a0; a < a1; a += cell) {
      for (let b = b0; b < b1; b += cell * 0.55) {
        const r = cam();
        if (r < 0.34) continue;
        g.fillStyle = CAMO[r < 0.62 ? 0 : r < 0.86 ? 1 : 2];
        const [x0, y0] = M(a, b);
        const [x1, y1] = M(a + cell * (0.7 + cam() * 0.6), b + cell * 0.55 * (0.8 + cam() * 0.5));
        g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      }
    }
  };
  block(gt, (x, z) => T(x, z), -7.5, 7.5, -10, 10, 0.9);
  block(gs, (z, y) => S(z, y), -10.3, 10, -2.3, 3.5, 0.7);
  // radome: a darker grey
  gt.fillStyle = 'rgba(80,92,104,0.9)';
  gt.beginPath();
  gt.ellipse(...T(0, -9.2), 0.42 * pt, 0.85 * pt, 0, 0, Math.PI * 2);
  gt.fill();
  gb.fillStyle = 'rgba(80,92,104,0.85)';
  gb.beginPath();
  gb.ellipse(...B(0, -9.2), 0.42 * L.pb, 0.85 * L.pb, 0, 0, Math.PI * 2);
  gb.fill();
  // cockpit well
  gt.fillStyle = 'rgba(40,48,54,1)';
  gt.fillRect(...T(-0.45, -7.4), 0.9 * pt, 4.2 * pt);
  // panel lines: frames and the radar-absorbent edge strips
  for (const z of [-8.4, -7.1, -3.4, -1.8, 0.2, 2.2, 4.2, 6.2, 7.9]) {
    line(gt, [T(-1.4, z), T(1.4, z)], 1.3, LINE_LIGHT);
    line(gs, [S(z, -1.0), S(z, 0.6)], 1.4, LINE);
    line(gb, [B(-1.6, z), B(1.6, z)], 1.1, LINE_LIGHT);
  }
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    line(gt, [W(0.42, -3.2), W(0.36, 8.2)], 1.2, LINE_LIGHT);
    line(gt, [W(1.25, -2.6), W(1.4, 7.0)], 1.2, LINE_LIGHT);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(2.4, wle(2.4) + 0.5), M(6.9, wle(6.9) + 0.25)], 1.3, LINE);
      line(g, [M(2.4, wte(2.4) - 0.85), M(6.4, wte(6.4) - 0.7)], 1.4, LINE);
      for (const x of [3.2, 4.1, 5.0, 5.9]) line(g, [M(x, wle(x) + 0.45), M(x, wte(x) - 0.8)], 1.0, LINE_LIGHT);
      rivets(g, M(2.4, 2.4), M(6.6, 4.4), 7, 0.9);
      // the darker edge treatment on the leading edges
      line(g, [M(2.3, wle(2.3) + 0.05), M(7.0, wle(7.0) + 0.05)], (g === gt ? pt : L.pb) * 0.12, 'rgba(70,80,90,0.55)');
    }
    // the bays' doors underneath
    line(gb, [Wb(0.03, BAY_F[0]), Wb(0.62, BAY_F[0]), Wb(0.62, BAY_F[1]), Wb(0.03, BAY_F[1])], 1.3, LINE, true);
    line(gb, [Wb(0.03, BAY_A[0]), Wb(0.62, BAY_A[0]), Wb(0.62, BAY_A[1]), Wb(0.03, BAY_A[1])], 1.3, LINE, true);
    star(gt, ...W(5.4, 3.0), 0.48 * pt);
    star(gb, ...Wb(5.4, 3.0), 0.48 * L.pb);
  }
  weather(gt, L.top.width, L.top.height, rnd, 0.7, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.55, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.6, [1, 0.1]);
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(NAC_X * sx, 7.7);
      const grd = g.createLinearGradient(x, y - 2.2 * s, x, y);
      grd.addColorStop(0, 'rgba(40,36,30,0)');
      grd.addColorStop(1, 'rgba(50,40,30,0.38)');
      g.fillStyle = grd;
      g.fillRect(x - 0.55 * s, y - 2.2 * s, 1.1 * s, 2.2 * s);
    }
  }
  L.copySides();
  const teamCol = team === 'blue' ? '#1f4f9e' : '#b0241e';
  L.sideText(team === 'blue' ? '52' : '01', -5.9, -0.22, 0.42 * ps, teamCol);
  L.sideDraw(-1.9, 0.22, (g, x, y) => star(g, x, y, 0.28 * ps));
  L.sideText('ВКС РОССИИ', 6.9, 0.2, 0.12 * ps, 'rgba(34,40,48,0.85)');
  L.sideDraw(-6.6, 0.18, (g, x, y) => {
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

function buildBays(v: AirframeVisual, paint: THREE.Material): void {
  const cavity = bayInteriorMaterial();
  const ribs = (rails: number) => (u: number, w: number) => {
    const edge = Math.min(u, 1 - u, w * 3, (1 - w) * 3);
    let c = 0.55 + 0.45 * Math.min(1, edge * 6);
    if (Math.abs(((u * rails) % 1) - 0.5) < 0.08) c *= 0.55;
    if (Math.abs(((w * 6) % 1) - 0.5) < 0.05) c *= 1.25;
    return c;
  };
  for (const sx of [-1, 1] as const) {
    // the tandem main bays: two doors each, hinged at the nacelles' inner walls
    for (const [z0, z1] of [BAY_F, BAY_A]) {
      const edge = (z: number): [P2, P2] => {
        const y = BODY(z)[0][1];
        return [[0.03 * sx, y], [0.64 * sx, y]];
      };
      const zm = (z0 + z1) / 2;
      const door = stamp(skinPanel(z0, z1, edge, 0.006, 0.025));
      const hinge = new THREE.Vector3(0.64 * sx, BODY(zm)[0][1], zm);
      const axis = new THREE.Vector3(0, 0, 1);
      const inner = new THREE.Vector3(0.03 * sx, hinge.y, zm);
      v.addBayDoor(door, paint, hinge, axis.clone().multiplyScalar(swingSign(inner, hinge, axis, new THREE.Vector3(0, -1, 0), 30)), 'main', 95);
      v.addBayCavity(skinPanel(z0, z1, edge, 0.002, 0, 16, ribs(2)), cavity, 'main');
    }
    // the wing-root bays: a door under the root extension, hinged along its outer edge
    const bay = sx < 0 ? 'left' : 'right';
    const sideEdge = (z: number): [P2, P2] => {
      const q = BODY(z);
      const a = q[3], b = q[4];
      const at = (t: number): P2 => [(a[0] + (b[0] - a[0]) * t) * sx, a[1] + (b[1] - a[1]) * t];
      return [at(0.12), at(0.88)];
    };
    const sd = stamp(skinPanel(LEX_BAY[0], LEX_BAY[1], sideEdge, 0.006, 0.02));
    const e0 = sideEdge(LEX_BAY[0]), e1 = sideEdge(LEX_BAY[1]);
    const h0 = new THREE.Vector3(e0[1][0], e0[1][1], LEX_BAY[0]);
    const h1 = new THREE.Vector3(e1[1][0], e1[1][1], LEX_BAY[1]);
    const sAxis = h1.clone().sub(h0).normalize();
    const em = sideEdge((LEX_BAY[0] + LEX_BAY[1]) / 2);
    const low = new THREE.Vector3(em[0][0], em[0][1], (LEX_BAY[0] + LEX_BAY[1]) / 2);
    v.addBayDoor(sd, paint, h0, sAxis.clone().multiplyScalar(swingSign(low, h0, sAxis, new THREE.Vector3(0, -1, 0), 30)), bay, 100);
    v.addBayCavity(skinPanel(LEX_BAY[0], LEX_BAY[1], sideEdge, 0.002, 0, 12, ribs(1)), cavity, bay);
  }
}

export function buildSu57(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#7d8a96'), bottom: new THREE.Color('#9aa7b2'), livery: L, roughness: 0.5, metalness: 0.08 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  // --- fuselage / lifting body ---------------------------------------------------
  const zs = mergeStations(stations(-10.0, -7.8, 32, 0.55, 0), stations(-7.8, -4.2, 46), stations(-4.2, 8.6, 110), stations(8.6, 10.1, 20, 0, 0.4));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -9.6, 9.6, 44);

  // --- nacelles: trapezoidal raked intakes under the root extensions, round at the nozzles
  const NW = curve([[-3.0, 0.42], [-1.0, 0.45], [4.0, 0.48], [6.8, 0.52], [NOZZLE_Z, 0.53]]);
  const NH = curve([[-3.0, 0.32], [-1.0, 0.44], [4.0, 0.5], [6.8, 0.53], [NOZZLE_Z, 0.53]]);
  // (the mouths sit high under the root extensions; the nacelles deepen aft and lift to the nozzles)
  const NY = curve([[-3.0, -0.42], [-1.0, -0.6], [1.0, -0.72], [3.0, -0.72], [5.5, -0.44], [NOZZLE_Z, -0.2]]);
  // (the mouth's corners well rounded, as on the real intakes: no sharp box edges)
  const NR = curve([[-3.0, 0.13], [0.0, 0.17], [4.0, 0.3], [6.8, 0.48], [NOZZLE_Z, 0.53]]);
  const nacLoop = (z: number): P2[] => {
    // the mouth is a trapezium: the outer wall leans in toward the top
    const w = NW(z), h = NH(z), r = Math.min(NR(z), w - 0.001, h - 0.001);
    const lean = 0.16 * (1 - sstep(-3.0, 0.5, z));
    return rrect(NAC_X, NY(z), w, h, r, 3).map(([x, y]) => [x - (x > NAC_X ? lean * ((y - NY(z)) / h) : 0), y] as P2);
  };
  const nac = intake({
    loop: nacLoop,
    outer: stations(-3.0, NOZZLE_Z, 90, 0.3, 0),
    // a thick, rounded lip (a thin sheet edge made the mouths look like hollow boxes)
    lip: 0.075,
    depth: 2.6,
    n: 80,
    // raked steeply: the upper lip leads under the root extension, the lower
    // lip trails it by 0.7 m, the outer corner swept back a little
    rake: (x, y) => -0.95 * (y + 0.1) + 0.2 * (x - NAC_X),
    rakeFade: 1.2,
    fan: { cx: NAC_X, cy: -0.6, r: 0.38 },
  });
  skin(both(nac.skin));
  const duct = (pm.duct as THREE.MeshStandardMaterial).clone();
  // dark inside, the way an intake looks in daylight: a pale duct read as an empty box
  duct.color.set('#25282b');
  v.addMesh(both(nac.duct), duct);

  // --- tail booms outboard of the nacelles (fins and stabilators) ----------------
  const BW = curve([[3.2, 0.06], [4.4, 0.2], [8.6, 0.18], [9.0, 0.12], [9.4, 0.02]]);
  const BT = curve([[3.2, 0.08], [4.4, 0.16], [8.8, 0.14], [9.4, 0.04]]);
  const BB = curve([[3.2, -0.08], [4.4, -0.22], [8.8, -0.2], [9.4, -0.04]]);
  const boom = loftProfile({
    stations: stations(3.2, 9.4, 46, 0.2, 0.3),
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
  v.rudderBrake = 0.75;

  // --- canopy, seat, pilot, IRST -------------------------------------------------
  v.cockpitEye.set(0, 1.0, -5.7);
  buildCanopy(v, CANOPY, -7.1, []);
  addPilot(v, new THREE.Vector3(0, 1.0, -5.7), 0.26, { style: 'ru', stick: 'center', martinBaker: true });
  const shroud = loftProfile({
    stations: stations(-7.5, -7.1, 6),
    profile: (z) => {
      const u = sstep(-7.5, -7.1, z);
      return [[0, 0.1], [0.44, 0.12], [0.5, 0.44], [0.34, 0.54 - u * 0.06], [0, 0.56 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  // 101KS-V IRST ball ahead of the windscreen, offset right
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), pm.glass);
  ball.position.set(0.2, 0.4, -8.1);
  v.body.add(ball);
  v.hideInCockpit.push(ball, skin(lathe([[0.15, -8.35], [0.16, -8.1], [0.14, -7.9], [0.004, -7.75]], 18, 0.2, 0.36)));

  // --- wing: leading-edge flaps, flaperons, ailerons -------------------------------
  const panels = wingPanels(
    WING,
    [
      { x0: 2.45, x1: 6.9, hinge: (x) => wle(x) + 0.14 * (wte(x) - wle(x)) + 0.05, kind: 'lef', maxDeg: 30, leading: true },
      { x0: 2.45, x1: 4.6, hinge: (x) => wte(x) - 0.85, kind: 'flap', maxDeg: 35 },
      { x0: 4.7, x1: 6.7, hinge: (x) => wte(x) - 0.7, kind: 'aileron', maxDeg: 22 },
    ],
    { chordPts: 36, thickPos: 0.42 },
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
  // --- LEVCONs: the root extensions pivot on their trailing edge (they droop like leading-edge flaps)
  const levcon = wing({ sections: LEVCON, chordPts: 22, spanSub: 5, tip: 'flat', root: 'flat', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? levcon.clone() : mirror(levcon));
    const h0 = new THREE.Vector3(1.6 * side, 0.06, -2.2), h1 = new THREE.Vector3(3.3 * side, 0.08, 0.1);
    const ax = h1.clone().sub(h0).normalize();
    v.addSurface(g, paint, h0, side > 0 ? ax : ax.negate(), 'lef', side, 20);
  }

  // --- all-moving stabilators ---------------------------------------------------------
  const stab = wing({ sections: STAB, chordPts: 28, spanSub: 8, tip: 'flat', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    v.addSurface(g, paint, new THREE.Vector3(2.3 * side, -0.02, STAB_PIVOT_Z), new THREE.Vector3(1, 0, 0), 'stab', side, 22);
  }

  // --- small all-moving fins canted out 26 deg ------------------------------------------
  for (const side of [1, -1] as const) {
    const m = finMatrix(BOOM_X * side, 0.12, 26, side);
    const f = finPanels(FIN, RUDDER, m, { chordPts: 30 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 25);
    const top = new THREE.Vector3(2.45, 0, 0).applyMatrix4(m);
    v.addNavLight(new THREE.Vector3(top.x, top.y, 7.1), 'formation');
  }

  // --- engines: AL-41F1 nozzles on gimbals (3D vectoring) -----------------------------------
  for (const sx of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(NAC_X * sx, -0.2, NOZZLE_Z);
    v.body.add(pivot);
    const nz = nozzle({ cx: 0, cy: 0, z0: 0, z1: 1.25, r0: 0.53, r1: 0.45, petals: 16, saw: 0.05, floor: 0.15 });
    const nzOut = v.addMesh(nz.outer, pm.nozzle, pivot);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn, pivot);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.addMesh(lathe([[0.545, -0.12], [0.565, -0.05], [0.565, 0.08], [0.54, 0.14]], 32), pm.darkMetal, pivot);
    v.nozzles.push({ pos: new THREE.Vector3(0, 0, 1.2), radius: 0.42, parent: pivot, depth: 1.05, area: nz.area });
    v.vectoring.push({ pivot, side: sx });
  }
  v.buildFlames(6.6, 'blue');

  // --- gun, probes, antennas, lights ------------------------------------------------------
  // GSh-30-1 in the right wing root, under a shutter ahead of the LEVCON
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), pm.darkMetal);
  muzzle.position.set(0.98, 0.12, -3.42);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);
  skin(lathe([[0.004, -3.75], [0.065, -3.55], [0.075, -3.1], [0.05, -2.7], [0.004, -2.5]], 12, 0.98, 0.1));
  v.addMesh(join([
    probe(new THREE.Vector3(0.36, -0.1, -9.0), 0.28, 0.01, new THREE.Vector3(0.15, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.36, -0.1, -9.0), 0.28, 0.01, new THREE.Vector3(-0.15, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.7, 1.2), 0.12, 0.26),
    blade(new THREE.Vector3(0, -0.36, 2.2), 0.12, 0.24, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.66, 0.14, -6.0), new THREE.Vector3(1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(-0.66, 0.14, -6.0), new THREE.Vector3(-1, 0.3, 0), new THREE.Vector3(0, 0, 1), 0.45, 0.035),
    formationStrip(new THREE.Vector3(NAC_X + 0.5, -0.5, 5.0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
    formationStrip(new THREE.Vector3(-NAC_X - 0.5, -0.5, 5.0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
  ]), pm.formation, v.body, false);
  buildBays(v, paint);
  v.addNavLight(new THREE.Vector3(-7.02, -0.03, wle(7.0) + 0.3), 'red');
  v.addNavLight(new THREE.Vector3(7.02, -0.03, wle(7.0) + 0.3), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.25, 10.0), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -0.36, 0.6), 'strobe');

  // --- landing gear: twin nose wheels, single mains retracting forward into the nacelles
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.6, -6.25), axle: new THREE.Vector3(0, -2.15 + 0.3, -6.6), r: 0.3, w: 0.18, twin: true, retract: 'forward' },
    mains: { top: new THREE.Vector3(1.95, -0.32, 1.0), axle: new THREE.Vector3(2.0, -2.15 + 0.48, 1.45), r: 0.48, w: 0.3, retract: 'forward', outboard: 0.1 },
    doorColor: '#9aa7b2',
  });
}
