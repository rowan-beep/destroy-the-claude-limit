// Chengdu J-20B: 20.9 m long, 13.0 m span, 4.45 m tall. Shaped against photographs from
// the front, the rear quarter, below and the side, and a top / front / side render.
// A long, slim forebody with a sharp chine round the faceted radome, a one-piece canopy
// with a gold-tinted glass, caret intakes on the fuselage sides with a diverterless bump
// on the inner wall, big all-moving canards on the intake tops, a leading-edge root
// extension running from the canards into a cropped delta wing, two all-moving fins
// canted out over the engines, two ventral fins canted out under them, and two WS-10C
// nozzles with saw-toothed edges set close together (3D thrust vectoring on the B).
// Weapons ride inside: four PL-15s in the main bay between the intake trunks and a PL-10
// in a side bay on each trunk; four more stations under the wings.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect, Livery, skinMaterial, line, rivets, weather, prng, LINE, LINE_LIGHT, curve, sstep } from './kit';
import { intake, partMaterials, blade, probe, formationStrip, tintedCanopyGlass } from './parts';
import { nozzleJ20B } from './nozzles';
import { buildCanopy, buildGearSet, wingPanels, sectionsFromProfile } from './common';
import { bayInteriorMaterial, skinPanel, swingSign } from './f22';

function circ(R: number, yc: number, sq = 1): P2[] {
  const ang = [-90, -72, -52, -34, -16, -4, 4, 16, 34, 52, 72, 90];
  return ang.map((a) => [R * Math.cos((a * Math.PI) / 180), yc + R * sq * Math.sin((a * Math.PI) / 180)] as P2);
}

// Right half, 12 control points, bottom centre -> top centre. Points 4-6 are the chine that
// runs from the radome back over the intakes into the canard shelf and the root extension.
const BODY = keyedProfile([
  { z: -10.45, pts: circ(0.012, -0.16) },
  // a slim, faceted cone: flat lower sides, a hard chine low on the flanks
  { z: -10.0, pts: [[0, -0.32], [0.07, -0.315], [0.12, -0.295], [0.15, -0.26], [0.165, -0.21], [0.172, -0.195], [0.165, -0.18], [0.145, -0.125], [0.11, -0.075], [0.075, -0.045], [0, -0.03], [0, -0.025]] },
  { z: -9.4, pts: [[0, -0.43], [0.13, -0.425], [0.22, -0.39], [0.27, -0.32], [0.3, -0.24], [0.31, -0.22], [0.3, -0.2], [0.27, -0.12], [0.21, -0.04], [0.14, 0.01], [0.07, 0.035], [0, 0.04]] },
  { z: -8.5, pts: [[0, -0.55], [0.19, -0.545], [0.33, -0.49], [0.41, -0.38], [0.46, -0.22], [0.48, -0.19], [0.465, -0.16], [0.43, -0.06], [0.35, 0.06], [0.24, 0.14], [0.12, 0.18], [0, 0.19]] },
  // the windscreen's base: the upper sides fold in steeply to a narrow deck
  { z: -7.4, pts: [[0, -0.66], [0.24, -0.655], [0.43, -0.58], [0.54, -0.42], [0.6, -0.2], [0.63, -0.15], [0.61, -0.11], [0.56, 0.04], [0.47, 0.22], [0.34, 0.33], [0.2, 0.36], [0, 0.37]] },
  // the cockpit: steep upper sides rise to a high sill; points 10-11 are the tub under the glass
  { z: -6.3, pts: [[0, -0.74], [0.3, -0.735], [0.52, -0.64], [0.66, -0.44], [0.72, -0.2], [0.75, -0.14], [0.73, -0.09], [0.68, 0.1], [0.6, 0.34], [0.46, 0.5], [0.36, 0.28], [0, 0.14]] },
  { z: -5.2, pts: [[0, -0.76], [0.33, -0.76], [0.56, -0.67], [0.7, -0.47], [0.78, -0.2], [0.82, -0.13], [0.8, -0.08], [0.75, 0.12], [0.66, 0.4], [0.5, 0.6], [0.4, 0.34], [0, 0.18]] },
  // the intakes begin under the chine: the forebody's lower sides stand inboard of them, the
  // chine sweeps out over their tops toward the canard shelf, the spine rises behind the pilot
  { z: -4.2, pts: [[0, -0.74], [0.42, -0.74], [0.6, -0.62], [0.66, -0.36], [0.82, -0.04], [1.02, 0.02], [0.98, 0.07], [0.88, 0.24], [0.72, 0.52], [0.48, 0.8], [0.25, 0.98], [0, 1.02]] },
  { z: -3.2, pts: [[0, -0.72], [0.45, -0.72], [0.6, -0.6], [0.64, -0.32], [1.0, 0.02], [1.74, 0.07], [1.7, 0.13], [1.42, 0.32], [1.02, 0.56], [0.66, 0.78], [0.33, 0.92], [0, 0.95]] },
  // the canard shelf runs back into the root extension
  { z: -1.6, pts: [[0, -0.7], [0.5, -0.7], [0.62, -0.58], [0.66, -0.3], [1.2, 0.0], [2.05, 0.04], [2.0, 0.1], [1.66, 0.3], [1.2, 0.54], [0.8, 0.7], [0.4, 0.78], [0, 0.8]] },
  { z: 0.4, pts: [[0, -0.68], [0.55, -0.68], [0.66, -0.56], [0.72, -0.3], [1.5, -0.05], [2.12, 0.02], [2.08, 0.08], [1.72, 0.28], [1.3, 0.48], [0.86, 0.6], [0.43, 0.66], [0, 0.68]] },
  { z: 2.8, pts: [[0, -0.66], [0.6, -0.66], [0.85, -0.6], [1.2, -0.4], [1.75, -0.08], [2.02, 0.0], [1.98, 0.06], [1.66, 0.26], [1.26, 0.46], [0.84, 0.56], [0.42, 0.6], [0, 0.61]] },
  { z: 5.4, pts: [[0, -0.6], [0.55, -0.62], [0.95, -0.6], [1.3, -0.42], [1.62, -0.1], [1.74, -0.02], [1.7, 0.04], [1.48, 0.24], [1.14, 0.42], [0.76, 0.5], [0.38, 0.52], [0, 0.52]] },
  // aft the body narrows onto the two engines (their round shrouds carry it to the nozzles)
  { z: 7.6, pts: [[0, -0.5], [0.4, -0.56], [0.8, -0.6], [1.1, -0.46], [1.3, -0.24], [1.34, -0.18], [1.32, -0.12], [1.2, 0.08], [0.98, 0.26], [0.66, 0.32], [0.33, 0.3], [0, 0.26]] },
  { z: 8.9, pts: [[0, -0.42], [0.36, -0.5], [0.72, -0.56], [1.0, -0.42], [1.15, -0.24], [1.18, -0.2], [1.16, -0.15], [1.06, 0.02], [0.86, 0.16], [0.58, 0.2], [0.29, 0.18], [0, 0.14]] },
]);
const BODY_SUB = [4, 3, 3, 3, 2, 1, 2, 3, 3, 3, 4];

// a long one-piece bubble set into the forebody: the windscreen base 3 m behind the tip,
// the crown 1.24 m up over the pilot's head
const CANOPY: Section[] = [
  { z: -7.35, w: 0.03, top: 0.02, bot: 0.02, y: 0.34, n: 2 },
  { z: -6.85, w: 0.34, top: 0.28, bot: 0.03, y: 0.44, n: 2.3 },
  { z: -6.3, w: 0.44, top: 0.48, bot: 0.03, y: 0.52, n: 2.3 },
  { z: -5.6, w: 0.48, top: 0.6, bot: 0.03, y: 0.62, n: 2.3 },
  { z: -4.9, w: 0.46, top: 0.5, bot: 0.03, y: 0.72, n: 2.3 },
  { z: -4.3, w: 0.4, top: 0.34, bot: 0.03, y: 0.84, n: 2.3 },
  { z: -3.8, w: 0.3, top: 0.16, bot: 0.03, y: 0.94, n: 2.2 },
  { z: -3.4, w: 0.12, top: 0.04, bot: 0.03, y: 0.98, n: 2 },
];

// the canards: all-moving, rooted on the shelf over the intakes, 50 deg leading edge, clipped tips
const CANARD: WingStation[] = [
  { x: 0.95, le: -3.85, te: -1.55, y: 0.12, t: 0.035 },
  { x: 3.85, le: -1.6, te: -0.7, y: 0.02, t: 0.028 },
];
const CANARD_PIVOT: [number, number, number] = [1.2, 0.12, -2.2];
// wing: a 48 deg leading edge from the root extension to cropped tips 6.5 m out, the trailing
// edge nearly square to the body
const wle = (x: number) => -0.6 + (x - 2.0) * 1.11;
const wte = (x: number) => 6.55 - (x - 2.0) * 0.12;
const WING: WingStation[] = [
  { x: 1.7, le: -0.9, te: 6.6, y: 0.04, t: 0.04 },
  { x: 2.0, le: wle(2.0), te: wte(2.0), y: 0.03, t: 0.038 },
  { x: 4.2, le: wle(4.2), te: wte(4.2), y: -0.05, t: 0.034 },
  { x: 6.5, le: wle(6.5), te: wte(6.5), y: -0.17, t: 0.03 },
];
// the fins: all-moving, canted out 28 deg, a 50 deg leading edge and a clipped tip; x = height
// along the fin (2.1 m: the tips stand 4.45 m off the ground, as on the real jet)
// (the root carried 0.5 m on down into the body: the top line falls away toward the nozzles, and
// a fin rooted at a single height left daylight under its rear end)
const FIN: WingStation[] = [
  { x: -0.5, le: 4.6, te: 8.7, t: 0.035 },
  { x: 0, le: 5.0, te: 8.7, t: 0.035 },
  { x: 2.1, le: 7.5, te: 8.5, t: 0.028 },
];
const FIN_X = 1.15;
const FIN_Y = 0.2;
// the ventral fins: canted out 40 deg below the engines
const VENTRAL: WingStation[] = [
  { x: -0.15, le: 6.3, te: 8.45, t: 0.03 },
  { x: 0.95, le: 7.45, te: 8.4, t: 0.024 },
];
const NAC_X = 0.74;
const ENG_Y = -0.2;
const NOZZLE_Z = 8.85;
// weapons bays: the main bay between the intake trunks, a side bay low on each trunk
const BAY_MAIN: P2 = [-2.6, 2.0];
const SIDE_BAY: P2 = [-2.5, -0.5];

// intake trunk: a caret mouth on each side of the forebody (centre x / y, half width / height)
// (big mouths: from just under the chine to below the belly, the outer wall well outboard)
const IX = curve([[-4.4, 1.24], [-2.0, 1.2], [1.0, 1.02], [3.4, 0.86]]);
const IY = curve([[-4.4, -0.44], [-2.0, -0.43], [1.0, -0.4], [3.4, -0.34]]);
const IW = curve([[-4.4, 0.58], [-2.0, 0.56], [1.0, 0.44], [3.4, 0.3]]);
const IH = curve([[-4.4, 0.5], [-2.0, 0.46], [1.0, 0.36], [3.4, 0.24]]);

// (the camouflage itself is drawn by the skin shader in 3D, so its soft patches run on unbroken
// across the wings, canards and canted fins: see `camo` in buildJ20)

/** A saw-toothed edge between two points (the J-20's door and panel edges zigzag to scatter radar). */
function saw(g: CanvasRenderingContext2D, a: P2, b: P2, tooth: number, width: number, color: string): void {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const n = Math.max(2, Math.round(len / tooth));
  const nx = -dy / len, ny = dx / len;
  const pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const off = i % 2 ? tooth * 0.45 : 0;
    pts.push([a[0] + dx * u + nx * off, a[1] + dy * u + ny * off]);
  }
  line(g, pts, width, color);
}

function livery(team: string): Livery {
  const L = new Livery({ half: 9.0, z0: -10.7, len: 21.4, y0: -2.4, height: 6.0 });
  const { gt, gb, gs } = L;
  const rnd = prng(20);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps, pb = L.pb;
  // the pale edge treatment round the wing, canards and fins (a lighter radar-absorbent coating)
  const EDGE = 'rgba(170,176,182,0.85)';
  const DARK = 'rgba(62,68,74,0.9)';
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M, s] of [[gt, W, pt], [gb, Wb, pb]] as const) {
      line(g, [M(2.0, wle(2.0) + 0.06), M(6.5, wle(6.5) + 0.06)], s * 0.16, EDGE);
      line(g, [M(2.0, wte(2.0) - 0.05), M(6.5, wte(6.5) - 0.05)], s * 0.12, EDGE);
      line(g, [M(6.47, wle(6.5) + 0.1), M(6.47, wte(6.5) - 0.1)], s * 0.1, EDGE);
      // the canards' leading edges
      line(g, [M(1.6, -3.4), M(3.8, -1.58)], s * 0.12, EDGE);
      // the control surfaces' hinge lines and the spar lines
      line(g, [M(2.3, wle(2.3) + 0.45), M(6.3, wle(6.3) + 0.3)], 1.2, LINE);
      line(g, [M(2.15, wte(2.15) - 0.95), M(4.3, wte(4.3) - 0.95)], 1.4, LINE);
      line(g, [M(4.35, wte(4.35) - 0.7), M(6.25, wte(6.25) - 0.7)], 1.4, LINE);
      for (const x of [3.0, 4.0, 5.0, 5.9]) line(g, [M(x, wle(x) + 0.4), M(x, wte(x) - 0.75)], 1.0, LINE_LIGHT);
      // the access panels on the wing: saw-toothed fore and aft edges
      for (const [x0, x1, z0, z1] of [[2.6, 3.4, 2.4, 3.6], [3.8, 4.6, 3.3, 4.3]]) {
        saw(g, M(x0, z0), M(x1, z0), s * 0.09, 1.0, LINE_LIGHT);
        saw(g, M(x0, z1), M(x1, z1), s * 0.09, 1.0, LINE_LIGHT);
        line(g, [M(x0, z0), M(x0, z1)], 1.0, LINE_LIGHT);
        line(g, [M(x1, z0), M(x1, z1)], 1.0, LINE_LIGHT);
      }
      rivets(g, M(2.4, 3.0), M(6.0, 5.6), 7, 0.9);
    }
    line(gt, [W(0.4, -3.6), W(0.36, 8.4)], 1.2, LINE_LIGHT);
    line(gt, [W(1.2, -2.8), W(1.3, 7.6)], 1.2, LINE_LIGHT);
    // the main bay's doors: straight inner and outer edges, saw-toothed ends
    line(gb, [Wb(0.03, BAY_MAIN[0]), Wb(0.03, BAY_MAIN[1])], 1.3, LINE);
    line(gb, [Wb(0.6, BAY_MAIN[0]), Wb(0.6, BAY_MAIN[1])], 1.3, LINE);
    saw(gb, Wb(0.03, BAY_MAIN[0]), Wb(0.6, BAY_MAIN[0]), pb * 0.14, 1.3, LINE);
    saw(gb, Wb(0.03, BAY_MAIN[1]), Wb(0.6, BAY_MAIN[1]), pb * 0.14, 1.3, LINE);
    // the nose and main gear doors underneath, saw-toothed at the ends too
    saw(gb, Wb(0.0, -6.4), Wb(0.3, -6.4), pb * 0.1, 1.2, LINE);
    saw(gb, Wb(0.0, -4.6), Wb(0.3, -4.6), pb * 0.1, 1.2, LINE);
    line(gb, [Wb(0.3, -6.4), Wb(0.3, -4.6)], 1.2, LINE);
    star(gt, ...W(4.6, 3.6), 0.45 * pt);
    star(gb, ...Wb(4.6, 3.6), 0.45 * pb);
    // distributed-aperture sensor windows: either side of the spine behind the canopy
    sensorWindow(gt, ...W(0.42, -3.0), 0.09 * pt);
  }
  // under the nose: a sensor window ahead of the nose gear
  sensorWindow(gb, ...B(0, -7.1), 0.09 * pb);
  // the radome's joint and the fuselage frames
  for (const z of [-8.3, -7.5, -3.6, -1.8, 0.4, 2.6, 4.8, 6.8, 8.4]) {
    line(gt, [T(-1.4, z), T(1.4, z)], 1.3, LINE_LIGHT);
    line(gs, [S(z, -0.9), S(z, 0.6)], 1.4, LINE);
    line(gb, [B(-1.4, z), B(1.4, z)], 1.1, LINE_LIGHT);
  }
  // the side bay's door on the trunk, saw-toothed at both ends
  saw(gs, S(SIDE_BAY[0], -0.88), S(SIDE_BAY[0], -0.5), ps * 0.1, 1.3, LINE);
  saw(gs, S(SIDE_BAY[1], -0.84), S(SIDE_BAY[1], -0.48), ps * 0.1, 1.3, LINE);
  line(gs, [S(SIDE_BAY[0], -0.5), S(SIDE_BAY[1], -0.48)], 1.2, LINE);
  // the intake lips: a dark radar-absorbent band along the raked lip
  line(gs, [S(-4.86, 0.04), S(-3.92, -0.92)], ps * 0.09, DARK);
  // the fins' edges (their side view: the shader lays the side canvas on the canted fins)
  line(gs, [S(5.0, 0.25), S(7.5, 2.04)], ps * 0.1, EDGE);
  line(gs, [S(8.68, 0.25), S(8.5, 2.04)], ps * 0.08, EDGE);
  // sensor windows: one each side of the nose below the chine, one ahead of the canopy
  sensorWindow(gs, ...S(-6.9, -0.42), 0.08 * ps);
  sensorWindow(gs, ...S(-3.6, 0.55), 0.07 * ps);
  gt.fillStyle = 'rgba(40,46,52,1)';
  gt.fillRect(...T(-0.42, -7.3), 0.84 * pt, 4.0 * pt);
  weather(gt, L.top.width, L.top.height, rnd, 0.6, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.45, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.5, [1, 0.1]);
  for (const [g, M, s] of [[gt, T, pt], [gb, B, pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(NAC_X * sx, 8.9);
      const grd = g.createLinearGradient(x, y - 2.0 * s, x, y);
      grd.addColorStop(0, 'rgba(40,36,30,0)');
      grd.addColorStop(1, 'rgba(50,40,30,0.36)');
      g.fillStyle = grd;
      g.fillRect(x - 0.5 * s, y - 2.0 * s, 1.0 * s, 2.0 * s);
    }
  }
  L.copySides();
  const teamCol = team === 'blue' ? '#1f4f9e' : '#b0241e';
  L.sideText(team === 'blue' ? '78271' : '62001', -7.9, -0.28, 0.28 * ps, teamCol);
  L.sideDraw(5.2, 0.05, (g, x, y) => star(g, x, y, 0.3 * ps));
  return L;
}

/** A sensor window: a small dark faceted pane with a faint bright rim. */
function sensorWindow(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r * 0.9, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r * 0.9, y);
  g.closePath();
  g.fillStyle = 'rgba(26,30,34,0.95)';
  g.fill();
  g.lineWidth = Math.max(1, r * 0.12);
  g.strokeStyle = 'rgba(150,158,164,0.7)';
  g.stroke();
  g.restore();
}

/** PLAAF insignia: a red star with the yellow characters 八一, red bars either side, all edged in yellow. */
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
  // the bars either side
  for (const sd of [-1, 1]) {
    g.fillStyle = '#f2c230';
    g.fillRect(x + sd * r * 0.55 - (sd < 0 ? r * 1.25 : 0), y - r * 0.22, r * 1.25, r * 0.44);
    g.fillStyle = '#c8261f';
    g.fillRect(x + sd * r * 0.62 - (sd < 0 ? r * 1.1 : 0), y - r * 0.14, r * 1.1, r * 0.28);
  }
  path(r);
  g.fillStyle = '#f2c230';
  g.fill();
  path(r * 0.84);
  g.fillStyle = '#c8261f';
  g.fill();
  g.fillStyle = '#f2c230';
  g.font = `bold ${Math.max(4, r * 0.42)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('八一', x, y + r * 0.05);
  g.restore();
}

const liveries = new Map<string, Livery>();

/** The intake trunk's cross-section: a caret mouth (the outer wall leans in toward the bottom). */
function trunkLoop(z: number): P2[] {
  const w = IW(z), h = IH(z), cx = IX(z), cy = IY(z);
  const lean = 0.18 * (1 - sstep(-4.4, -1.0, z));
  return rrect(cx, cy, w, h, Math.min(0.12, w - 0.001, h - 0.001), 3).map(([x, y]) => [x - (x > cx ? lean * ((cy + h - y) / (2 * h)) : 0), y] as P2);
}

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
    // the main bay: a door each side, hinged at the intake trunk's inner wall
    const edge = (z: number): [P2, P2] => {
      const y = BODY(z)[0][1];
      return [[0.03 * sx, y], [0.6 * sx, y]];
    };
    const zm = (BAY_MAIN[0] + BAY_MAIN[1]) / 2;
    const door = stamp(skinPanel(BAY_MAIN[0], BAY_MAIN[1], edge, 0.006, 0.025));
    const hinge = new THREE.Vector3(0.6 * sx, BODY(zm)[0][1], zm);
    const axis = new THREE.Vector3(0, 0, 1);
    const inner = new THREE.Vector3(0.03 * sx, hinge.y, zm);
    v.addBayDoor(door, paint, hinge, axis.clone().multiplyScalar(swingSign(inner, hinge, axis, new THREE.Vector3(0, -1, 0), 30)), 'main', 95);
    v.addBayCavity(skinPanel(BAY_MAIN[0], BAY_MAIN[1], edge, 0.002, 0, 16, ribs(4)), cavity, 'main');
    // the side bays: a door low on the trunk's outer wall, hinged along its top edge
    const bay = sx < 0 ? 'left' : 'right';
    const sideEdge = (z: number): [P2, P2] => {
      const cx = IX(z), cy = IY(z), w = IW(z), h = IH(z);
      return [[(cx + w * 0.55) * sx, cy - h - 0.004], [(cx + w + 0.004) * sx, cy - h * 0.15]];
    };
    const sd = stamp(skinPanel(SIDE_BAY[0], SIDE_BAY[1], sideEdge, 0.006, 0.02));
    const e0 = sideEdge(SIDE_BAY[0]), e1 = sideEdge(SIDE_BAY[1]);
    const h0 = new THREE.Vector3(e0[1][0], e0[1][1], SIDE_BAY[0]);
    const h1 = new THREE.Vector3(e1[1][0], e1[1][1], SIDE_BAY[1]);
    const sAxis = h1.clone().sub(h0).normalize();
    const em = sideEdge((SIDE_BAY[0] + SIDE_BAY[1]) / 2);
    const low = new THREE.Vector3(em[0][0], em[0][1], (SIDE_BAY[0] + SIDE_BAY[1]) / 2);
    v.addBayDoor(sd, paint, h0, sAxis.clone().multiplyScalar(swingSign(low, h0, sAxis, new THREE.Vector3(0, -1, 0), 30)), bay, 100);
    v.addBayCavity(skinPanel(SIDE_BAY[0], SIDE_BAY[1], sideEdge, 0.002, 0, 12, ribs(1)), cavity, bay);
  }
}

export function buildJ20(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  // a silvery mid grey with a faint metallic sheen (the radar-absorbent coating catches the light
  // in the photos from below), soft darker grey patches over it, and the radome a separately
  // painted composite shell a shade lighter
  const paint = skinMaterial({
    top: new THREE.Color('#737a80'),
    bottom: new THREE.Color('#7d8489'),
    livery: L,
    roughness: 0.44,
    metalness: 0.22,
    paintLift: 1.2,
    markPaint: 1,
    camo: { color: new THREE.Color('#646b71'), amount: 0.45 },
    radomeZ: -8.3,
    radomeTip: -10.45,
    radomeAxis: [-0.16, -0.18],
    radomeTint: [1.04, 1.05, 1.06],
  });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  // --- fuselage ------------------------------------------------------------------
  const zs = mergeStations(stations(-10.45, -7.4, 34, 0.55, 0), stations(-7.4, -4.2, 40), stations(-4.2, 8.9, 110));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -10.0, 8.8, 44);

  // --- intake trunks: caret mouths on the forebody's sides, under the canard shelf ---
  const nac = intake({
    loop: trunkLoop,
    outer: stations(-4.4, 3.4, 70, 0.3, 0),
    lip: 0.05,
    depth: 2.4,
    n: 72,
    // the upper lip leads the lower one by 0.75 m, the outer corner swept back (the caret)
    rake: (x, y) => -0.95 * (y - IY(-4.4)) + 0.42 * (x - (IX(-4.4) - IW(-4.4))),
    rakeFade: 1.4,
    fan: { cx: 1.0, cy: -0.36, r: 0.4 },
  });
  skin(both(nac.skin));
  const duct = (pm.duct as THREE.MeshStandardMaterial).clone();
  duct.color.set('#25282b');
  v.addMesh(both(nac.duct), duct);
  // the diverterless bump on the forebody's side, inside each mouth
  const bump = new THREE.SphereGeometry(1, 20, 12);
  bump.scale(0.14, 0.3, 0.9);
  bump.translate(0.62, -0.36, -3.75);
  skin(both(bump));

  // --- engines: round shrouds from the body to the nozzles ---------------------------
  for (const sx of [-1, 1] as const) {
    skin(lathe([[0.42, 6.4], [0.55, 7.4], [0.57, 8.3], [0.56, NOZZLE_Z + 0.02]], 32, NAC_X * sx, ENG_Y));
  }

  // --- canopy, seat, pilot, sensor windows ----------------------------------------
  v.cockpitEye.set(0, 0.92, -5.7);
  buildCanopy(v, CANOPY, -6.85, []);
  // the canopy's gold coating (a metallised film against radar): swap the shared glass for it
  const [gold, goldBack] = tintedCanopyGlass(0xb39a52);
  v.body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.material === pm.glass) m.material = gold;
    else if (m.material === pm.glassBack) m.material = goldBack;
  });
  addPilot(v, new THREE.Vector3(0, 0.92, -5.7), 0.26, { style: 'ru', stick: 'center', martinBaker: false });
  const shroud = loftProfile({
    stations: stations(-7.2, -6.85, 6),
    profile: (z) => {
      const u = sstep(-7.2, -6.85, z);
      return [[0, 0.1], [0.3, 0.12], [0.34, 0.36], [0.24, 0.44 - u * 0.05], [0, 0.46 - u * 0.05]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  // EOTS under the chin: a faceted window in a shallow fairing
  const eots = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), pm.glass);
  eots.scale.set(1.4, 0.7, 1.8);
  eots.position.set(0, -0.6, -8.0);
  v.body.add(eots);

  // --- canards (all-moving) -------------------------------------------------------
  const canard = wing({ sections: CANARD, chordPts: 24, spanSub: 6, tip: 'flat', root: 'flat', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? canard.clone() : mirror(canard));
    v.addSurface(g, paint, new THREE.Vector3(CANARD_PIVOT[0] * side, CANARD_PIVOT[1], CANARD_PIVOT[2]), new THREE.Vector3(1, 0, 0), 'canard', side, 25);
  }

  // --- wing: leading-edge flaps, flaperons, ailerons (the body's chine is the root extension) ---
  const panels = wingPanels(
    WING,
    [
      { x0: 2.2, x1: 6.4, hinge: (x) => wle(x) + 0.14 * (wte(x) - wle(x)) + 0.04, kind: 'lef', maxDeg: 25, leading: true },
      { x0: 2.15, x1: 4.3, hinge: (x) => wte(x) - 0.95, kind: 'flaperon', maxDeg: 25 },
      { x0: 4.35, x1: 6.25, hinge: (x) => wte(x) - 0.7, kind: 'aileron', maxDeg: 22 },
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

  // the actuator fairings under the wing: three slim teardrops a side (two on the flaperon, one on
  // the aileron), hung under the rear spar and running a little past the trailing edge
  const wingY = (x: number) => (x <= 4.2 ? 0.03 - ((x - 2.0) * 0.08) / 2.2 : -0.05 - ((x - 4.2) * 0.12) / 2.3);
  const pods: THREE.BufferGeometry[] = [];
  for (const x of [2.9, 3.9, 5.3]) {
    const z1 = wte(x) + 0.16, z0 = wte(x) - 1.35;
    const pod = lathe([[0.004, z0], [0.05, z0 + 0.25], [0.08, z0 + 0.7], [0.08, z1 - 0.45], [0.04, z1 - 0.08], [0.004, z1]], 16);
    pod.scale(1, 0.72, 1);
    pod.translate(x, wingY(x) - 0.056, 0);
    pods.push(pod);
  }
  skin(both(join(pods)));

  // --- the fins: all-moving, canted out 28 deg, pivoting on a post near the root -------------
  const fin = wing({ sections: FIN, chordPts: 30, spanSub: 8, tip: 'flat', root: 'flat', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const m = finMatrix(FIN_X * side, FIN_Y, 28, side);
    const g = fin.clone().applyMatrix4(m);
    if (side < 0) mirrorWinding(g);
    const pivot = new THREE.Vector3(0, 0, 6.9).applyMatrix4(m);
    const up = new THREE.Vector3(1, 0, 6.9).applyMatrix4(m).sub(pivot).normalize();
    v.addSurface(stamp(g), paint, pivot, up, 'rudder', side, 20);
    const top = new THREE.Vector3(2.1, 0, 0).applyMatrix4(m);
    v.addNavLight(new THREE.Vector3(top.x, top.y, 8.2), 'formation');
  }
  // --- the ventral fins, canted out under the engines --------------------------------
  const ventral = wing({ sections: VENTRAL, chordPts: 20, spanSub: 4, tip: 'flat', root: 'flat', thickPos: 0.45 });
  for (const side of [1, -1] as const) {
    const m = finMatrix(1.02 * side, -0.52, 140, side);
    const g = ventral.clone().applyMatrix4(m);
    if (side < 0) mirrorWinding(g);
    skin(g);
  }
  v.rudderBrake = 0.6;

  // --- engines: WS-10C nozzles with saw-toothed edges, on gimbals ----------------------
  for (const sx of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(NAC_X * sx, ENG_Y, NOZZLE_Z);
    v.body.add(pivot);
    const nz = nozzleJ20B({ cx: 0, cy: 0, z0: 0, z1: 1.2, r0: 0.53, r1: 0.45, floor: 0.15, shroud: 0.566 });
    const nzOut = v.addMesh(nz.outer, nz.mat, pivot);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn, pivot);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.addMesh(lathe([[0.545, -0.1], [0.565, -0.04], [0.565, 0.06], [0.54, 0.12]], 32), pm.darkMetal, pivot);
    v.nozzles.push({ pos: new THREE.Vector3(0, 0, 1.15), radius: 0.42, parent: pivot, depth: 1.0, area: nz.area });
    v.vectoring.push({ pivot, side: sx });
  }
  v.buildFlames(6.4, 'blue');

  // --- probes, antennas, lights -------------------------------------------------------
  v.addMesh(join([
    probe(new THREE.Vector3(0.32, -0.12, -9.2), 0.26, 0.01, new THREE.Vector3(0.12, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.32, -0.12, -9.2), 0.26, 0.01, new THREE.Vector3(-0.12, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.68, 0.6), 0.12, 0.24),
    blade(new THREE.Vector3(0, -0.66, 3.0), 0.12, 0.22, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.7, 0.2, -6.2), new THREE.Vector3(1, 0.4, 0), new THREE.Vector3(0, 0, 1), 0.42, 0.035),
    formationStrip(new THREE.Vector3(-0.7, 0.2, -6.2), new THREE.Vector3(-1, 0.4, 0), new THREE.Vector3(0, 0, 1), 0.42, 0.035),
    formationStrip(new THREE.Vector3(1.7, -0.1, 5.4), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
    formationStrip(new THREE.Vector3(-1.7, -0.1, 5.4), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
  ]), pm.formation, v.body, false);
  buildBays(v, paint);
  v.addNavLight(new THREE.Vector3(-6.5, -0.17, wle(6.5) + 0.3), 'red');
  v.addNavLight(new THREE.Vector3(6.5, -0.17, wle(6.5) + 0.3), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.3, 8.6), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -0.68, 2.6), 'strobe');

  // --- landing gear: single nose wheel retracting forward, mains forward into the trunks ----
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.66, -5.6), axle: new THREE.Vector3(0, -2.3 + 0.33, -5.9), r: 0.33, w: 0.2, twin: false, retract: 'forward', well: { w: 0.6 } },
    mains: { top: new THREE.Vector3(1.4, -0.66, 1.4), axle: new THREE.Vector3(1.95, -2.3 + 0.5, 1.85), r: 0.5, w: 0.3, retract: 'forward', outboard: 0.1, well: { w: 0.55, dx: 0.1 } },
    doorColor: '#8e959c',
  });
}

/** A mirrored copy's triangles wind the wrong way round: flip them back so the faces point out. */
function mirrorWinding(g: THREE.BufferGeometry): void {
  const idx = g.index;
  if (!idx) return;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  idx.needsUpdate = true;
}
