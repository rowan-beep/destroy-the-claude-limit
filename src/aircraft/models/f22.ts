// Lockheed Martin F-22A Raptor: 18.92 m long, 13.56 m span, 5.08 m tall.
// Single seat: a diamond-section nose with sharp chines that run the whole
// length of the jet, a frameless gold-tinted bubble canopy, caret intakes
// raked in two planes beside the cockpit, a diamond wing (42 deg leading
// edge, forward-swept trailing edge), big all-moving tailplanes, two fins
// canted out 28 deg, and two flat two-dimensional thrust-vectoring nozzles
// set close together in a flat "beaver tail".

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect, Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, curve, sstep, roundBox, colorize, resample } from './kit';
import { intake, partMaterials, blade, probe, formationStrip, withMorph, glassify } from './parts';
import { DEG } from '../../core/constants';
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
// starts behind the intakes; nozzle roots at z 7. Sized off the three-view:
// a blunt, deep radome (1.7 m deep by the windscreen), the belly flat at
// -0.84 from the cockpit to the wing, the raised turtle deck behind the
// canopy sloping down to the flat deck by the wing's leading edge
const BODY = keyedProfile([
  { z: -9.46, pts: S(-0.03, 0.004, 0.008, -0.03, 0.012, -0.03, 0.008, -0.02, 0.004, -0.015, 0.002) },
  { z: -8.9, pts: S(-0.27, 0.07, 0.17, -0.2, 0.23, -0.07, 0.17, 0.05, 0.09, 0.14, 0.03) },
  { z: -8.0, pts: S(-0.52, 0.16, 0.42, -0.35, 0.55, -0.06, 0.42, 0.17, 0.2, 0.36, 0.04) },
  { z: -7.0, pts: S(-0.61, 0.24, 0.57, -0.4, 0.72, -0.05, 0.55, 0.3, 0.26, 0.53, 0.05) },
  { z: -6.2, pts: S(-0.74, 0.3, 0.68, -0.46, 0.8, -0.04, 0.62, 0.35, 0.36, 0.58, 0.03) },
  { z: -5.0, pts: S(-0.84, 0.36, 0.72, -0.48, 0.86, -0.02, 0.8, 0.4, 0.48, 0.62, 0.03) },
  { z: -4.0, pts: S(-0.84, 0.4, 0.76, -0.5, 0.93, 0.08, 0.93, 0.4, 0.52, 0.66, 0.04) },
  // behind the intake mouths the body stays inboard of the ducts (the
  // intakes' own skin is the outside here), then fills out under the deck
  { z: -2.9, pts: S(-0.84, 0.44, 0.85, -0.6, 0.94, 0.34, 0.97, 0.42, 0.56, 0.68, 0.1) },
  { z: -2.3, pts: S(-0.84, 0.48, 0.88, -0.62, 0.94, 0.34, 0.97, 0.42, 0.58, 0.62, 0.24) },
  // from here aft the underside carries on the intakes' shape: a flat belly
  // out to a sharp edge, then a straight wall leaning out to the chine
  { z: -1.8, pts: S(-0.83, 1.75, 1.88, -0.4, 2.05, 0.06, 1.38, 0.36, 0.58, 0.5, 0.29) },
  { z: 0.5, pts: S(-0.86, 1.85, 1.98, -0.45, 2.15, 0.02, 1.44, 0.34, 0.56, 0.42, 0.3) },
  { z: 3.0, pts: S(-0.82, 1.8, 1.92, -0.45, 2.08, -0.02, 1.42, 0.32, 0.5, 0.38, 0.2) },
  { z: 5.3, pts: S(-0.58, 1.62, 1.72, -0.38, 1.82, -0.06, 1.34, 0.26, 0.45, 0.3, 0.08) },
  { z: 6.4, pts: S(-0.42, 1.14, 1.24, -0.3, 1.36, -0.1, 1.16, 0.18, 0.42, 0.22, 0.03) },
  // the aft end wraps the two nozzle boxes: a flat bottom and deck and near-vertical
  // walls round them, ending in a flat face the nozzle flaps grow out of
  { z: 7.0, pts: S(-0.35, 1.02, 1.1, -0.3, 1.19, -0.1, 1.08, 0.165, 0.42, 0.19, 0.02) },
  { z: 7.45, pts: S(-0.35, 1.0, 1.09, -0.31, 1.11, -0.1, 1.09, 0.17, 0.5, 0.19, 0.0) },
]);
/** where the fuselage ends and the nozzle flaps begin */
const NOZZLE_END = 7.45;
/** the nozzle boxes: centre, half-width and half-height (the body's end face has these cut out) */
const NOZZLE_X = 0.6, NOZZLE_Y = -0.07, NOZZLE_HW = 0.44, NOZZLE_HH = 0.24, NOZZLE_Z = 6.95;
// the body's cross-section where the intake skins end (outer part, from the
// intake's inner wall round the belly edge, up the wall and over the deck)
const INTAKE_END_Z = -1.78;
const INTAKE_END: P2[] = (() => {
  const q = BODY(INTAKE_END_Z);
  const xi = 0.96;
  const yb = q[0][1];
  const t = (q[7][0] - xi) / Math.max(1e-6, q[7][0] - q[8][0]);
  const top: P2 = [xi, q[7][1] + (q[8][1] - q[7][1]) * t];
  return resample([[xi, yb], q[2], q[3], q[4], q[5], q[6], q[7], top], 144);
})();

// sharp creases: the belly edge and the straight lower wall up to the chine
const BODY_SUB = [3, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3];

// one-piece bubble set well forward: the windscreen climbs 0.6 m in the
// metre behind its base, the crown is 1.3 m over the datum at the pilot's
// head, and the glass runs 4.4 m back to the turtle deck
const CANOPY: Section[] = [
  { z: -7.1, w: 0.03, top: 0.02, bot: 0.02, y: 0.58, n: 2 },
  { z: -6.55, w: 0.38, top: 0.32, bot: 0.03, y: 0.6, n: 2.3 },
  { z: -5.95, w: 0.48, top: 0.58, bot: 0.03, y: 0.62, n: 2.3 },
  { z: -5.35, w: 0.5, top: 0.67, bot: 0.03, y: 0.64, n: 2.3 },
  { z: -4.75, w: 0.49, top: 0.61, bot: 0.03, y: 0.66, n: 2.3 },
  { z: -4.1, w: 0.45, top: 0.5, bot: 0.03, y: 0.69, n: 2.3 },
  { z: -3.5, w: 0.37, top: 0.37, bot: 0.03, y: 0.73, n: 2.3 },
  { z: -3.0, w: 0.25, top: 0.2, bot: 0.03, y: 0.77, n: 2.2 },
  { z: -2.65, w: 0.1, top: 0.06, bot: 0.03, y: 0.8, n: 2 },
];

// diamond wing off the three-view: 42 deg of leading-edge sweep from the
// intake shoulders, a short streamwise tip, and the trailing edge swept
// forward 19 deg so its root meets the boom beside the tailplane
const WING: WingStation[] = [
  { x: 1.4, le: -1.64, te: 6.6, y: 0.02, t: 0.05 },
  { x: 1.9, le: -1.19, te: 6.44, y: 0.0, t: 0.046 },
  { x: 6.03, le: 2.56, te: 5.04, y: -0.25, t: 0.034 },
  { x: 6.78, le: 3.25, te: 4.15, y: -0.28, t: 0.03 },
];
const wle = (x: number) => -1.19 + (x - 1.9) * 0.909;
const wte = (x: number) => (x <= 6.03 ? 5.04 + (6.03 - x) * 0.338 : 5.04 - (x - 6.03) * 1.19);
// all-moving tailplanes on the tail booms: a 42 deg leading edge whose root
// tucks under the wing's trailing edge, a streamwise tip, the outer trailing
// edge swept forward and the inner part notched back beside the nozzle
const STAB: WingStation[] = [
  { x: 1.8, le: 5.6, te: 8.3, y: -0.12, t: 0.042 },
  { x: 3.03, le: 6.33, te: 9.19, y: -0.13, t: 0.036 },
  { x: 4.47, le: 7.6, te: 8.95, y: -0.14, t: 0.028 },
];
const STAB_PIVOT = 7.25;
// broad trapezoidal fins, 3.15 m up the cant: a 23 deg leading edge, the
// trailing edge swept forward about as much, a 1.3 m streamwise tip
const FIN: WingStation[] = [
  { x: 0, le: 3.13, te: 7.15, t: 0.046 },
  { x: 3.15, le: 4.47, te: 5.81, t: 0.03 },
];
const RUDDER = { h0: 0.2, h1: 2.3, hinge: (h: number) => 6.5 - 0.425 * h };
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
    grad.addColorStop(0, 'rgba(78,76,72,0.55)');
    grad.addColorStop(0.7, 'rgba(78,76,72,0.42)');
    grad.addColorStop(1, 'rgba(78,76,72,0)');
    g.fillStyle = grad;
    g.scale(1, rz / rx);
    g.beginPath();
    g.arc(0, 0, rx * k, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  for (const sx of [-1, 1]) {
    for (const [g, M, k] of [[gt, T, pt]] as const) {
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
  gt.moveTo(...T(-0.4, -7.1));
  gt.lineTo(...T(0.4, -7.1));
  gt.lineTo(...T(0.14, -7.8));
  gt.lineTo(...T(-0.14, -7.8));
  gt.closePath();
  gt.fill();
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.fillRect(...T(-0.46, -5.6), 0.92 * pt, 2.9 * pt);
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
      // the pale edge strips framing the wing and tailplane (the coating's edge treatment)
      const edge = 'rgba(170,165,155,0.38)';
      const wk = (g === gt ? pt : L.pb) * 0.2;
      line(g, [M(1.9, wle(1.9) + 0.1), M(6.7, 3.3), M(6.7, 4.2), M(6.03, 5.04), M(2.0, 6.4)], wk, edge);
      line(g, [M(1.85, 5.7), M(3.0, 6.3), M(4.4, 7.6), M(4.4, 8.9), M(3.05, 9.1), M(2.0, 8.3)], wk, edge);
    }
    if (sx < 0) roundel(gt, team, ...W(4.6, 2.9), 0.42 * pt);
    else roundel(gb, team, ...Wb(4.6, 2.9), 0.42 * L.pb);
    // main weapons-bay doors and side bays underneath
    const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
    rect(gb, Wb(0.03, MAIN_BAY[0]), Wb(0.9, MAIN_BAY[1]));
    rect(gs, S(SIDE_BAY[0], -0.36), S(SIDE_BAY[1], -0.66));
  }
  // --- the underside, after photos of the real jet ---------------------------------------
  {
    const pb = L.pb;
    const poly = (pts: [number, number][], fill: string) => {
      gb.fillStyle = fill;
      gb.beginPath();
      pts.forEach((p, i) => (i ? gb.lineTo(p[0], p[1]) : gb.moveTo(p[0], p[1])));
      gb.closePath();
      gb.fill();
    };
    // radar-absorbent panels in slightly different greys (the patchwork you see from below)
    const tones = ['rgba(150,152,150,0.22)', 'rgba(60,62,64,0.18)', 'rgba(190,190,186,0.16)', 'rgba(95,97,99,0.2)'];
    for (const sx of [-1, 1]) {
      const Wb = (x: number, z: number) => B(x * sx, z);
      // the intake ducts: long boxy panels either side of the belly, edged by a crease
      poly([Wb(0.95, -4.3), Wb(1.75, -4.3), Wb(1.85, -1.8), Wb(1.8, 3.6), Wb(1.25, 5.2), Wb(0.95, 4.6)], 'rgba(170,171,168,0.16)');
      line(gb, [Wb(0.95, -4.3), Wb(0.95, 4.6), Wb(1.25, 5.2), Wb(1.8, 3.6)], 2.2, LINE);
      line(gb, [Wb(1.75, -4.3), Wb(1.85, -1.8), Wb(1.8, 3.6)], 1.6, LINE_LIGHT);
      // big access panels along the ducts, each its own tone
      const panels: [number, number, number, number][] = [[1.0, 1.7, -3.9, -2.6], [1.0, 1.75, -2.4, -0.6], [1.0, 1.78, -0.4, 1.4], [1.0, 1.72, 1.6, 3.2], [0.98, 1.4, 3.4, 4.5]];
      panels.forEach(([x0, x1, z0, z1], i) => {
        poly([Wb(x0, z0), Wb(x1, z0), Wb(x1, z1), Wb(x0, z1)], tones[(i + (sx > 0 ? 1 : 0)) % tones.length]);
        line(gb, [Wb(x0, z0), Wb(x1, z0), Wb(x1, z1), Wb(x0, z1)], 1.1, LINE, true);
      });
      // engine bays aft: lighter, more metallic heat-resistant panels with staggered edges
      poly([Wb(0.15, 3.2), Wb(1.1, 3.6), Wb(1.25, 6.9), Wb(0.25, 6.9)], 'rgba(205,203,196,0.2)');
      for (const z of [3.9, 4.7, 5.5, 6.3]) {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 6; i++) pts.push(Wb(0.2 + i * 0.17, z + (i % 2 ? 0.12 : 0)));
        line(gb, pts, 1.2, LINE);
      }
      // the little diamond-shaped vents and drains near the engines
      for (const [x, z, r] of [[0.55, 2.9, 0.07], [0.75, 3.15, 0.06], [0.42, 3.5, 0.06], [0.7, 3.75, 0.07], [0.95, 2.6, 0.05], [0.5, 4.3, 0.05]] as [number, number, number][]) {
        const [cx, cy] = Wb(x, z);
        poly([[cx, cy - r * pb], [cx + r * 0.8 * pb, cy], [cx, cy + r * pb], [cx - r * 0.8 * pb, cy]], 'rgba(14,15,16,0.92)');
      }
      // sawtooth ends on the weapons-bay doors (a radar-signature trick)
      const sawB = (x0: number, x1: number, z: number) => {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 8; i++) pts.push(Wb(x0 + ((x1 - x0) * i) / 8, z + (i % 2 ? 0.16 : 0)));
        line(gb, pts, 1.6, LINE);
      };
      sawB(0.03, 0.9, MAIN_BAY[0]);
      sawB(0.03, 0.9, MAIN_BAY[1] - 0.16);
      // wing undersides: flaperon and leading-edge flap breaks, sawtooth access doors
      line(gb, [Wb(2.1, wte(2.1) - 0.7), Wb(4.3, wte(4.3) - 0.7)], 1.4, LINE);
      line(gb, [Wb(4.4, wte(4.4) - 0.5), Wb(5.95, wte(5.95) - 0.5)], 1.4, LINE);
      line(gb, [Wb(4.35, wte(4.35) - 0.75), Wb(4.35, wte(4.35))], 1.4, LINE);
      for (const [x, z] of [[3.0, 2.2], [4.3, 3.2], [2.6, 0.9]] as [number, number][]) {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 4; i++) pts.push(Wb(x + i * 0.18, z + (i % 2 ? 0.12 : 0)));
        line(gb, pts, 1.2, LINE_LIGHT);
      }
      // a soft sheen down each duct (the coating catches the light like dull metal)
      const [hx, hy] = Wb(1.35, -4.0);
      const [hx2, hy2] = Wb(1.35, 4.0);
      const gr = gb.createLinearGradient(hx - 0.4 * pb, hy, hx + 0.4 * pb, hy);
      gr.addColorStop(0, 'rgba(230,230,226,0)');
      gr.addColorStop(0.5, 'rgba(230,230,226,0.12)');
      gr.addColorStop(1, 'rgba(230,230,226,0)');
      gb.fillStyle = gr;
      gb.fillRect(Math.min(hx, hx2) - 0.4 * pb, Math.min(hy, hy2), 0.8 * pb, Math.abs(hy2 - hy));
    }
    // the centre keel line and the stinger between the nozzles
    line(gb, [B(0, -4.4), B(0, 7.4)], 1.4, LINE_LIGHT);
    // fluid and exhaust streaks running aft from the engine bays
    gb.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = (rnd() - 0.5) * 3.2, z = 1 + rnd() * 5.5;
      const [px, py] = B(x, z);
      gb.strokeStyle = `rgba(32,30,28,${0.04 + rnd() * 0.06})`;
      gb.lineWidth = 1 + rnd() * 4;
      gb.beginPath();
      gb.moveTo(px, py);
      gb.lineTo(px, py + (0.4 + rnd() * 1.6) * pb);
      gb.stroke();
    }
  }
  line(gs, [S(-6.5, -0.02), S(7.3, -0.1)], 1.3, LINE_LIGHT); // chine
  weather(gt, L.top.width, L.top.height, rnd, 0.7, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.9, [0, 1]);
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
  L.sideText(team === 'blue' ? 'FF' : 'TY', 5.4, 2.4, 0.34 * ps, 'rgba(62,68,74,0.85)');
  L.sideText(team === 'blue' ? 'AF 09-4191' : 'AF 07-4146', 5.6, 1.55, 0.1 * ps, 'rgba(62,68,74,0.8)');
  L.sideDraw(5.1, 2.75, (g, x, y) => {
    g.fillStyle = teamCol;
    g.globalAlpha = 0.55;
    g.fillRect(x - 0.55 * ps, y - 0.06 * ps, 1.1 * ps, 0.12 * ps);
    g.globalAlpha = 1;
  });
  L.sideDraw(-0.4, -0.35, (g, x, y) => roundel(g, team, x, y, 0.22 * ps));
  return L;
}

// --- weapons bays -----------------------------------------------------------
// Main bay under the belly (six AIM-120s or GBU-39s), z range; the side bays in
// the lower walls beside the intakes (one AIM-9X each on its trapeze launcher)
const MAIN_BAY: P2 = [-1.3, 2.5];
const SIDE_BAY: P2 = [-1.65, 0.75];
/** the side bay's span up the lower side wall (0 = belly edge, 1 = chine) */
const SIDE_T: P2 = [0.1, 0.6];

let _bayMat: THREE.MeshStandardMaterial | null = null;
export { bayInteriorMaterial, skinPanel, swingSign };
/** the bay interior: dark primer, launch rails and ribs in shadow */
function bayInteriorMaterial(): THREE.MeshStandardMaterial {
  if (!_bayMat) _bayMat = new THREE.MeshStandardMaterial({ color: '#34393e', roughness: 0.85, metalness: 0.1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return _bayMat;
}

/**
 * A panel lying on the skin between two points of each cross-section:
 * `edge(z)` gives its two edges in (x, y); it sits `out` outside the skin and
 * is `thick` deep (0 = a single outward-facing surface).
 */
function skinPanel(z0: number, z1: number, edge: (z: number) => [P2, P2], out: number, thick: number, nz = 18, shade?: (u: number, v: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const ring: { o: THREE.Vector3[]; i: THREE.Vector3[]; c: THREE.Vector3 }[] = [];
  const NU = shade ? 12 : 1;
  for (let k = 0; k <= nz; k++) {
    const z = z0 + ((z1 - z0) * k) / nz;
    const [a, b] = edge(z);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    let nx = dy / L, ny = -dx / L;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    if (nx * mx + ny * (my + 0.05) < 0) (nx = -nx), (ny = -ny);
    const o: THREE.Vector3[] = [], i: THREE.Vector3[] = [];
    for (let u = 0; u <= NU; u++) {
      const x = a[0] + (dx * u) / NU, y = a[1] + (dy * u) / NU;
      o.push(new THREE.Vector3(x + nx * out, y + ny * out, z));
      i.push(new THREE.Vector3(x + nx * (out - thick), y + ny * (out - thick), z));
    }
    // a point inside the panel: every face is wound to point away from it
    const c = new THREE.Vector3(mx + nx * (out - Math.max(thick, 0.02) / 2), my + ny * (out - Math.max(thick, 0.02) / 2), z);
    ring.push({ o, i, c });
  }
  const centre = ring[nz >> 1].c;
  const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _f = new THREE.Vector3();
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, c: number, ref: THREE.Vector3) => {
    _f.crossVectors(_e1.subVectors(q, p), _e2.subVectors(r, p));
    const cen = _e1.copy(p).add(q).add(r).multiplyScalar(1 / 3).sub(ref);
    if (_f.dot(cen) < 0) [q, r] = [r, q];
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    for (let n = 0; n < 3; n++) col.push(c, c, c);
  };
  let ref = centre;
  const quad = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, t: THREE.Vector3, c = 1) => {
    tri(p, q, r, c, ref);
    tri(p, r, t, c, ref);
  };
  for (let k = 0; k < nz; k++) {
    const A = ring[k], B = ring[k + 1];
    ref = _f.clone().addVectors(A.c, B.c).multiplyScalar(0.5);
    for (let u = 0; u < NU; u++) {
      const c = shade ? shade((u + 0.5) / NU, (k + 0.5) / nz) : 1;
      quad(A.o[u], B.o[u], B.o[u + 1], A.o[u + 1], c);
      if (thick > 0) quad(A.i[u], A.i[u + 1], B.i[u + 1], B.i[u], c * 0.85);
    }
    if (thick > 0) {
      quad(A.o[0], A.i[0], B.i[0], B.o[0], 0.8);
      quad(A.o[NU], B.o[NU], B.i[NU], A.i[NU], 0.8);
    }
  }
  ref = centre;
  if (thick > 0) for (const R of [ring[0], ring[nz]]) for (let u = 0; u < NU; u++) quad(R.o[u], R.i[u], R.i[u + 1], R.o[u + 1], 0.8);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Rotation sign about `axis` (through `hinge`) that swings `p` outward along `n`. */
function swingSign(p: THREE.Vector3, hinge: THREE.Vector3, axis: THREE.Vector3, n: THREE.Vector3, deg: number): number {
  const r = p.clone().sub(hinge).applyAxisAngle(axis, deg * DEG).add(hinge);
  return r.clone().sub(p).dot(n) >= 0 ? 1 : -1;
}

function buildBays(v: AirframeVisual, paint: THREE.Material): void {
  const belly = (z: number) => BODY(z);
  const cavity = bayInteriorMaterial();
  // bay interior shading: dark along the edges (the walls in shadow), launch
  // rail stripes along the length, lighter ribs across
  const ribs = (rails: number) => (u: number, w: number) => {
    const edge = Math.min(u, 1 - u, w * 3, (1 - w) * 3);
    let c = 0.55 + 0.45 * Math.min(1, edge * 6);
    if (Math.abs(((u * rails) % 1) - 0.5) < 0.08) c *= 0.55;
    if (Math.abs(((w * 7) % 1) - 0.5) < 0.05) c *= 1.25;
    return c;
  };
  for (const sx of [-1, 1] as const) {
    // main-bay door: from the centre line out to its hinge at the outboard edge;
    // it swings down to hang straight below the jet
    const mainEdge = (z: number): [P2, P2] => {
      const y = belly(z)[0][1];
      return [[0.03 * sx, y], [0.9 * sx, y]];
    };
    const door = stamp(skinPanel(MAIN_BAY[0], MAIN_BAY[1], mainEdge, 0.006, 0.025));
    const zm = (MAIN_BAY[0] + MAIN_BAY[1]) / 2;
    const hinge = new THREE.Vector3(0.9 * sx, belly(zm)[0][1] + 0.0, zm);
    const axis = new THREE.Vector3(0, 0, 1);
    const inner = new THREE.Vector3(0.03 * sx, hinge.y, zm);
    const down = new THREE.Vector3(0, -1, 0);
    v.addBayDoor(door, paint, hinge, axis.clone().multiplyScalar(swingSign(inner, hinge, axis, down, 30)), 'main', 92);
    v.addBayCavity(skinPanel(MAIN_BAY[0], MAIN_BAY[1], mainEdge, 0.002, 0, 18, ribs(3)), cavity, 'main');

    // side bay: a door in the lower side wall, hinged along its top edge; it
    // swings out and up clear of the AIM-9X on its trapeze
    const bay = sx < 0 ? 'left' : 'right';
    const sideEdge = (z: number): [P2, P2] => {
      const q = belly(z);
      const p2 = q[2], p3 = q[4];
      const at = (t: number): P2 => [(p2[0] + (p3[0] - p2[0]) * t) * sx, p2[1] + (p3[1] - p2[1]) * t];
      return [at(SIDE_T[0]), at(SIDE_T[1])];
    };
    const sd = stamp(skinPanel(SIDE_BAY[0], SIDE_BAY[1], sideEdge, 0.006, 0.02));
    const e0 = sideEdge(SIDE_BAY[0]), e1 = sideEdge(SIDE_BAY[1]);
    const h0 = new THREE.Vector3(e0[1][0], e0[1][1], SIDE_BAY[0]);
    const h1 = new THREE.Vector3(e1[1][0], e1[1][1], SIDE_BAY[1]);
    const sAxis = h1.clone().sub(h0).normalize();
    const em = sideEdge((SIDE_BAY[0] + SIDE_BAY[1]) / 2);
    const low = new THREE.Vector3(em[0][0], em[0][1], (SIDE_BAY[0] + SIDE_BAY[1]) / 2);
    const outward = new THREE.Vector3(sx, 0, 0);
    v.addBayDoor(sd, paint, h0, sAxis.clone().multiplyScalar(swingSign(low, h0, sAxis, outward, 30)), bay, 105);
    v.addBayCavity(skinPanel(SIDE_BAY[0], SIDE_BAY[1], sideEdge, 0.002, 0, 18, ribs(1)), cavity, bay);
  }
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
  // the two-tone medium greys (FS 36170 / 36176) with the coating's faint sheen
  const paint = skinMaterial({ top: new THREE.Color('#74726d'), bottom: new THREE.Color('#8e9296'), livery: L, roughness: 0.34, metalness: 0.3 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  const zs = mergeStations(stations(-9.46, -6.2, 36, 0.6, 0), stations(-6.2, -1.8, 56), stations(-1.8, NOZZLE_END, 88));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB }));
  v.fuselageSections = sectionsFromProfile(BODY, -9.2, 6.9, 40);
  // the flat end face the body stops at, with the two nozzle exits cut out of it
  {
    const half = BODY(NOZZLE_END);
    const outline: P2[] = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as P2)];
    const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const sx of [-1, 1]) {
      const hole = new THREE.Path();
      const x0 = sx * NOZZLE_X - NOZZLE_HW, x1 = sx * NOZZLE_X + NOZZLE_HW;
      hole.moveTo(x0, NOZZLE_Y - NOZZLE_HH);
      hole.lineTo(x1, NOZZLE_Y - NOZZLE_HH);
      hole.lineTo(x1, NOZZLE_Y + NOZZLE_HH);
      hole.lineTo(x0, NOZZLE_Y + NOZZLE_HH);
      hole.closePath();
      sh.holes.push(hole);
    }
    const face = new THREE.ShapeGeometry(sh, 1);
    face.translate(0, 0, NOZZLE_END);
    skin(face);
  }

  // --- caret intakes: parallelogram mouths raked in two planes (the upper
  // inboard corner leads: the lip is swept back 42 deg in plan like the wing
  // and leans back from top to bottom), built into the sides of the fuselage
  const para = (z: number): P2[] => {
    const u = sstep(-4.55, -2.2, z);
    const ib: P2 = [0.96, -0.82 - 0.02 * u];
    const ob: P2 = [1.62 + 0.1 * u, -0.82 - 0.02 * u];
    const ot: P2 = [1.88 + 0.17 * u, 0.1 - 0.03 * u];
    const it: P2 = [0.96, 0.4];
    const pts: P2[] = [];
    const edge = (a: P2, b: P2, n: number) => {
      for (let i = 0; i < n; i++) pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
    };
    edge(ib, ob, 8);
    edge(ob, ot, 10);
    edge(ot, it, 10);
    edge(it, ib, 12);
    // over its last metre the intake skin turns into the body's own cross-
    // section where it ends, so its top, wall and belly run flush into the
    // fuselage (the mouth itself is untouched)
    const w = sstep(-3.1, -1.95, z);
    if (w <= 0) return pts;
    const a = resample(pts, 144);
    return a.map((p, i) => [p[0] + (INTAKE_END[i][0] - p[0]) * w, p[1] + (INTAKE_END[i][1] - p[1]) * w] as P2);
  };
  const ci = intake({
    loop: para,
    outer: stations(-4.55, -1.7, 36, 0.3, 0),
    lip: 0.04,
    depth: 2.0,
    n: 72,
    rake: (x, y) => -0.45 * (y - 0.4) + 1.1 * (x - 0.96),
    rakeFade: 2.2,
    fan: { cx: 1.26, cy: -0.2, r: 0.36 },
  });
  skin(both(ci.skin));
  // the serpentine ducts are dark inside (the engine faces are hidden)
  const duct = (pm.duct as THREE.MeshStandardMaterial).clone();
  duct.color.set('#3a3e42');
  v.addMesh(both(ci.duct), duct);
  // the duct turns out of sight: a black face where it bends away
  const blind = new THREE.MeshBasicMaterial({ color: '#08090a' });
  for (const sx of [-1, 1]) {
    const d = new THREE.CircleGeometry(0.42, 28);
    d.rotateY(Math.PI);
    d.translate(1.26 * sx, -0.2, -4.55 + 2.0 - 0.02);
    v.addMesh(d, blind);
  }

  // --- canopy: one-piece, frameless, gold tinted; seat and pilot
  v.cockpitEye.set(0, 0.98, -5.3);
  // the only hoop is the one at the back of the canopy
  buildCanopy(v, CANOPY, -2.9, []);
  addPilot(v, new THREE.Vector3(0, 0.98, -5.3), 0.26, { style: 'us', stick: 'side', martinBaker: false });
  const shroud = loftProfile({
    stations: stations(-6.4, -6.0, 6),
    profile: (z) => {
      const u = sstep(-6.4, -6.0, z);
      return [[0, 0.22], [0.42, 0.24], [0.46, 0.56], [0.33, 0.64 - u * 0.06], [0, 0.66 - u * 0.06]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));
  if (v.canopy) {
    const gm = (v.canopy.material as THREE.MeshStandardMaterial).clone();
    // the indium-tin-oxide coating: a mirror-like gold from outside
    gm.color.set('#5a4620');
    gm.opacity = 0.94;
    gm.metalness = 1;
    gm.roughness = 0.06;
    gm.envMapIntensity = 1.0;
    // (the copy needs the edge reflections put back: clones lose them)
    glassify(gm, 0.97);
    v.canopy.material = gm;
  }
  // canopy sill: the raised rail the canopy seals onto
  const sill = loftProfile({
    stations: stations(-6.95, -2.75, 30),
    profile: (z) => {
      const c = CANOPY;
      let w = 0.03, y = 0.58;
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
      { x0: 4.4, x1: 5.95, hinge: (x) => wte(x) - 0.5, kind: 'aileron', maxDeg: 25 },
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

  // --- tail booms outboard of the engines carry the tailplanes: flat slabs
  // flush with the belly, growing out of the body beside the wing's trailing
  // edge and tapering to a wedge past the nozzles
  const boom = loftProfile({
    stations: stations(4.4, 9.1, 28),
    profile: (z) => {
      const u = sstep(4.4, 5.6, z);
      const e = sstep(7.6, 9.1, z);
      const hw = 0.42 * u * (1 - 0.55 * e) + 0.02;
      const hh = 0.125 * (1 - 0.7 * e) + 0.015;
      return rrect(1.56, -0.17, hw, hh, Math.min(hw, hh) * 0.4, 3);
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
    const top = new THREE.Vector3(3.15, 0, 0).applyMatrix4(m);
    v.addNavLight(new THREE.Vector3(top.x, top.y, 5.1), 'formation');
  }

  // --- flat "beaver tail" between the nozzles, growing out of the end face
  const tail = loftProfile({
    stations: stations(7.2, 8.2, 10),
    profile: (z) => {
      const u = sstep(7.3, 8.2, z);
      const w = 0.15 - u * 0.08;
      return [[0, -0.16 + 0.07 * u], [w, -0.15 + 0.07 * u], [w + 0.02, -0.07], [w, 0.01 - 0.05 * u], [0, 0.02 - 0.05 * u]] as P2[];
    },
    sub: 2,
    capStart: true,
    capEnd: true,
  });
  skin(tail);

  // --- 2D thrust-vectoring nozzles. The boxes are buried in the aft body and
  // only their business end shows past the end face: fixed sidewalls in the
  // airframe's paint, and the flat upper and lower flaps, dark heat-stained
  // metal with sawtooth trailing edges, hinged on the end face and swinging
  // together up and down. The flaps carry on the deck and the belly: no step.
  const FLAP_Z = NOZZLE_END - NOZZLE_Z;
  const FLAP_L = 0.56;
  const flap = (): THREE.BufferGeometry => {
    const sh = new THREE.Shape();
    const w = NOZZLE_HW - 0.012, l0 = FLAP_L - 0.13;
    sh.moveTo(-w, 0);
    sh.lineTo(w, 0);
    sh.lineTo(w, l0);
    sh.lineTo(w * 0.667, FLAP_L);
    sh.lineTo(w * 0.333, l0);
    sh.lineTo(0, FLAP_L);
    sh.lineTo(-w * 0.333, l0);
    sh.lineTo(-w * 0.667, FLAP_L);
    sh.lineTo(-w, l0);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.028, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 });
    // shape y -> aft (+z); the plate's thickness hangs below y 0
    g.rotateX(Math.PI / 2);
    return g;
  };
  const wall = (): THREE.BufferGeometry => {
    // shape x -> aft (+z), shape y -> up; the plate is extruded toward -x
    const sh = new THREE.Shape();
    sh.moveTo(FLAP_Z - 0.03, -NOZZLE_HH - 0.012);
    sh.lineTo(FLAP_Z + FLAP_L - 0.03, -NOZZLE_HH + 0.05);
    sh.lineTo(FLAP_Z + FLAP_L - 0.03, NOZZLE_HH - 0.05);
    sh.lineTo(FLAP_Z - 0.03, NOZZLE_HH + 0.012);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    return g;
  };
  const flapMetal = new THREE.MeshStandardMaterial({ color: '#4e5357', roughness: 0.45, metalness: 0.6 });
  for (const sx of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(NOZZLE_X * sx, NOZZLE_Y, NOZZLE_Z);
    v.body.add(pivot);
    // the fixed sidewalls, just inside the exit's rim
    const outer = wall();
    outer.translate(NOZZLE_HW, 0, 0);
    const inner = wall();
    inner.translate(-NOZZLE_HW + 0.03, 0, 0);
    const walls = join([outer, inner]);
    // (the paint is projected by body position: give the walls their place on the body, not the pivot's)
    const wp = walls.attributes.position as THREE.BufferAttribute;
    const wskin = wp.clone();
    for (let i = 0; i < wskin.count; i++) wskin.setXYZ(i, wp.getX(i) + NOZZLE_X * sx, wp.getY(i) + NOZZLE_Y, wp.getZ(i) + NOZZLE_Z);
    walls.setAttribute('skin', wskin);
    v.addMesh(walls, paint, pivot);
    // the flaps hinge on the end face: converged at military power,
    // swung apart at idle and in the burner (the nozzle's area)
    const flaps: THREE.Mesh[] = [];
    for (const up of [1, -1]) {
      const at = (deg: number) => {
        const f = flap();
        f.rotateX(-up * deg * DEG);
        f.translate(0, up > 0 ? NOZZLE_HH : -NOZZLE_HH + 0.028, FLAP_Z);
        return f;
      };
      flaps.push(v.addMesh(withMorph(at(-4), at(6)), flapMetal, pivot));
    }
    const throat = loftProfile({
      stations: stations(0.26, FLAP_Z + FLAP_L - 0.05, 8),
      profile: (z) => {
        const u = sstep(FLAP_Z, FLAP_Z + FLAP_L, z);
        return rrect(0, 0, NOZZLE_HW - 0.03, NOZZLE_HH - 0.02 - u * 0.05, 0.04, 3).reverse();
      },
      sub: 1,
      full: true,
    });
    // sooty liner, heat-stained toward the exit (linear values, as the round nozzles)
    colorize(throat, (p, c) => {
      const k = 0.012 + 0.07 * Math.exp(-((FLAP_Z + FLAP_L - p.z) / 0.7) * 4);
      c.setRGB(k, k * 0.94, k * 0.86);
    });
    const throatMesh = v.addMesh(throat, pm.nozzleIn, pivot);
    throatMesh.userData.detail = true;
    v.morphNozzle(...flaps);
    const faceGeo = colorize(new THREE.PlaneGeometry(0.8, 0.42), (_p, c) => c.setRGB(0.01, 0.01, 0.01));
    const face = new THREE.Mesh(faceGeo, pm.nozzleIn);
    face.position.set(0, 0, 0.36);
    // (a plane faces +z: aft, out of the nozzle)
    pivot.add(face);
    v.nozzles.push({ pos: new THREE.Vector3(0, 0, FLAP_Z + FLAP_L - 0.02), radius: 0.26, parent: pivot, depth: 0.7, aspect: 1.6, area: [0.9, 1.12] });
    v.vectoring.push({ pivot, side: sx });
  }
  v.buildFlames(6.0);

  // (the M61A2 fires through a door in the right wing root that stays flush
  // with the skin until it fires: no muzzle shows on the outside)
  // --- probes, antennas, lights
  v.addMesh(join([
    probe(new THREE.Vector3(0.3, -0.06, -8.2), 0.2, 0.009, new THREE.Vector3(0.1, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.3, -0.06, -8.2), 0.2, 0.009, new THREE.Vector3(-0.1, 0, -1).normalize()),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.72, 0.6), 0.12, 0.24),
    blade(new THREE.Vector3(0, -0.85, 2.6), 0.12, 0.22, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(0.84, 0.16, -5.0), new THREE.Vector3(1, 0.5, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-0.84, 0.16, -5.0), new THREE.Vector3(-1, 0.5, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(2.14, 0.02, 1.2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
    formationStrip(new THREE.Vector3(-2.14, 0.02, 1.2), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
  ]), pm.formation, v.body, false);
  buildBays(v, paint);

  v.addNavLight(new THREE.Vector3(-6.72, -0.28, 3.7), 'red');
  v.addNavLight(new THREE.Vector3(6.72, -0.28, 3.7), 'green');
  v.addNavLight(new THREE.Vector3(0, -0.87, 0.4), 'strobe');

  // --- landing gear: nose leg behind the radome, mains fold into the fuselage sides
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.8, -5.8), axle: new THREE.Vector3(0, -2.05 + 0.33, -6.1), r: 0.33, w: 0.2, twin: false, retract: 'forward' },
    mains: { top: new THREE.Vector3(1.1, -0.84, 0.8), axle: new THREE.Vector3(1.55, -2.05 + 0.45, 0.95), r: 0.45, w: 0.28, retract: 'inward', outboard: 0.08 },
    doorColor: '#9da3a8',
  });
}
