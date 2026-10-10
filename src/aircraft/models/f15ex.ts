// F-15EX Eagle II: 19.43 m long, 13.05 m span, 5.63 m tall.
// Two-seat cockpit under a big bubble canopy, raked rectangular intakes with
// the fuselage sides behind them carrying conformal fuel tanks, 45-degree
// cropped delta wing, twin fins on tail booms, dog-toothed stabilators and
// two F110 nozzles.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import {
  P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect,
  Livery, skinMaterial, line, rivets, weather, prng, roundel, LINE, LINE_LIGHT, deform, sstep, curve, crSeg,
} from './kit';
import { nozzle, intake, partMaterials, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, finPanels, sectionsFromProfile } from './common';

/** 12 points on a circle (bottom centre -> top centre, right half). */
function circ(R: number, yc: number, sx = 1): P2[] {
  const ang = [-90, -72, -52, -34, -16, -4, 4, 16, 34, 52, 72, 90];
  return ang.map((a) => [R * sx * Math.cos((a * Math.PI) / 180), yc + R * Math.sin((a * Math.PI) / 180)] as P2);
}

/**
 * Radome section: a superellipse, `hw` across, `up` above and `dn` below its
 * centre `yc`, flattening (n > 2) toward the base. Same 12 angles as circ().
 */
function oval(hw: number, yc: number, up: number, dn: number, nUp = 2, nDn = 2): P2[] {
  const ang = [-90, -72, -52, -34, -16, -4, 4, 16, 34, 52, 72, 90];
  return ang.map((a) => {
    const t = (a * Math.PI) / 180;
    const c = Math.cos(t), s = Math.sin(t);
    const n = s < 0 ? nDn : nUp;
    return [hw * Math.pow(c, 2 / n), yc + Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * (s < 0 ? dn : up)] as P2;
  });
}

/** `pts` with points added on its section curve between control points i and i + 1, at the fractions `ts` */
function split(pts: P2[], i: number, ts: number[]): P2[] {
  const at = (k: number) => pts[Math.max(0, Math.min(pts.length - 1, k))];
  return [...pts.slice(0, i + 1), ...ts.map((t) => crSeg(at(i - 1), at(i), at(i + 1), at(i + 2), t, [0, 0])), ...pts.slice(i + 1)];
}

// intake trunk walls (body frame): inner and outer x, top and bottom y, corner radius
const T_IN = curve([[-4.1, 0.6], [-3.4, 0.585], [-2.75, 0.56], [-1.9, 0.56], [-0.9, 0.58], [0.4, 0.62], [1.6, 0.66]]);
const T_OUT = curve([[-4.1, 1.52], [-3.4, 1.565], [-2.75, 1.66], [-1.9, 1.76], [-0.9, 1.84], [0.4, 1.91], [1.6, 1.91]]);
const T_TOP = curve([[-4.1, 0.62], [-3.4, 0.64], [-2.75, 0.65], [-1.9, 0.64], [-0.9, 0.58], [0.4, 0.47], [1.6, 0.39]]);
const T_BOT = curve([[-4.1, -0.6], [-3.4, -0.605], [-2.75, -0.615], [-1.9, -0.64], [-0.9, -0.7], [0.4, -0.81], [1.6, -0.79]]);
const T_R = curve([[-4.1, 0.12], [-2.75, 0.15], [-0.9, 0.2], [1.6, 0.22]]);

/**
 * The deck behind the intake ramps: one surface right across the trunk tops,
 * as on the real jet (seen from above, the fuselage is the full width of the
 * intakes from the end of the ramps back). Points 7-11 of a body section: two
 * just under the trunk top at its outer corner (the shoulder ledge ahead of
 * the deck runs out level into them: dropping them deeper curled the ledge's
 * end down into a knob), the deck's outer edge flush on the trunk top, a point
 * halfway in that keeps the deck flat (without it the deck sagged between the
 * spine and its edge, and the edge stood up as a ridge along the trunk), and
 * the foot of the spine at `xFoot`, the deck rising a little to it.
 */
function deck(z: number, xFoot: number): P2[] {
  const xo = T_OUT(z) - T_R(z), top = T_TOP(z);
  const edge: P2 = [xo - 0.09, top + 0.008], foot: P2 = [xFoot, top + 0.03];
  return [[xo - 0.03, top - 0.02], [xo - 0.06, top - 0.006], edge, [edge[0] + (foot[0] - edge[0]) * 0.7, edge[1] + (foot[1] - edge[1]) * 0.7 + -0.002], foot];
}

/**
 * Where the body takes over the intake trunks (from the wing root back): points
 * 7-10 of a body section round the trunk's top outer corner and along its top,
 * just outside it (a bigger shell, 5 cm out, rose out of the trunk's corner as
 * a ridge with a bump where it met the deck), then on towards the spine's `foot`.
 */
function wrap(z: number, foot: P2): P2[] {
  const r = T_R(z), cx = T_OUT(z) - r, cy = T_TOP(z) - r, o = r + 0.012;
  const at = (deg: number): P2 => [cx + o * Math.cos((deg * Math.PI) / 180), cy + o * Math.sin((deg * Math.PI) / 180)];
  const edge: P2 = [cx - 0.08, T_TOP(z) + 0.012];
  return [at(15), at(60), edge, [(edge[0] + foot[0]) / 2, (edge[1] + foot[1]) / 2 + 0.004]];
}

// Main body, laid over the published three-view (side profile, plan width,
// front view) in true scale: nose tip at z -9.86. Right half, 15 control
// points from the belly centre round to the top centre:
//   0-2 the flat belly and its corner, 3 the lower crease (the panel break
//   along the lower side), 4-6 the lower side wall, 7 the shoulder (ahead of
//   the intakes just a point on the side's curve up into the rail; over them
//   the widest point, at rail height, the intakes tucked in under it),
//   8 the ledge on top of the shoulder, 9-11 just behind the ledge (where the
//   deck and the spine's foot will spread from), 12 the canopy rail, 13-14
//   the cockpit well floor under the glass (the
//   closed top ahead of the windscreen and on the spine behind the canopy).
// From the end of the intake ramps back the same points run along the deck
// over the trunks (deck() above) and up the dorsal spine: 7-8 the trunk's top
// corner, 9 the deck's outer edge, 10 the middle of the deck, 11 the foot of
// the spine, 12 its side, 13-14 its top; from the wing root back the body
// wraps the trunks whole (wrap() above: 7-8 the side and the top corner).
// The radome is long and drooped: round at its base, flatter and wider than
// tall toward the tip, the tip below the centre line of the base.
const fwd = (pts: P2[]) => split(pts, 8, [0.06, 0.16, 0.3]);
const aft = (pts: P2[]) => split(split(pts, 10, [0.5]), 9, [1 / 3, 2 / 3]);
const BODY = keyedProfile([
  { z: -9.86, pts: fwd(circ(0.012, -0.13)) },
  { z: -9.66, pts: fwd(oval(0.115, -0.112, 0.07, 0.07)) },
  { z: -9.36, pts: fwd(oval(0.26, -0.075, 0.18, 0.18)) },
  { z: -8.86, pts: fwd(oval(0.395, -0.04, 0.325, 0.325)) },
  { z: -8.36, pts: fwd(oval(0.48, -0.01, 0.445, 0.445, 2, 2.1)) },
  { z: -7.86, pts: fwd(oval(0.545, 0.0275, 0.5375, 0.5375, 2.05, 2.2)) },
  // radome joint: round
  { z: -7.24, pts: fwd(oval(0.6, 0.075, 0.615, 0.615, 2.1, 2.35)) },
  // forebody, from the radome joint to the glareshield: round all the way. The upper half of each
  // section lies on a superellipse close to an ellipse (exponent 2.1 at the joint, 2.6 at the
  // coaming), its centre rising from the radome's (0.075) to 0.4 and its half-width from 0.6 to
  // 0.64; behind the coaming the sides run up the same curve straight into the canopy rail, so
  // head-on body and canopy make one outline. (A squarer section, exponent 4, widest up at a
  // 0.73 m shoulder ledge beside the canopy, read head-on as a box with rounded corners.)
  { z: -7.1, pts: fwd([[0, -0.543], [0.242, -0.526], [0.413, -0.457], [0.523, -0.334], [0.585, -0.146], [0.604, 0.043], [0.607, 0.142], [0.587, 0.278], [0.51, 0.456], [0.386, 0.595], [0.202, 0.692], [0, 0.721]]) },
  { z: -6.95, pts: fwd([[0, -0.544], [0.268, -0.538], [0.431, -0.498], [0.534, -0.386], [0.588, -0.173], [0.608, 0.084], [0.617, 0.191], [0.596, 0.328], [0.521, 0.501], [0.397, 0.634], [0.212, 0.727], [0, 0.755]]) },
  { z: -6.8, pts: fwd([[0, -0.546], [0.285, -0.545], [0.443, -0.512], [0.543, -0.4], [0.592, -0.179], [0.612, 0.105], [0.625, 0.257], [0.605, 0.389], [0.532, 0.551], [0.41, 0.673], [0.225, 0.757], [0, 0.782]]) },
  { z: -6.65, pts: fwd([[0, -0.547], [0.289, -0.545], [0.448, -0.513], [0.548, -0.4], [0.597, -0.173], [0.617, 0.109], [0.631, 0.328], [0.612, 0.451], [0.541, 0.596], [0.422, 0.704], [0.238, 0.778], [0, 0.8]]) },
  { z: -6.5, pts: fwd([[0, -0.548], [0.292, -0.546], [0.452, -0.513], [0.552, -0.4], [0.602, -0.169], [0.623, 0.111], [0.635, 0.391], [0.617, 0.504], [0.548, 0.633], [0.432, 0.727], [0.249, 0.791], [0, 0.81]]) },
  { z: -6.35, pts: fwd([[0, -0.549], [0.297, -0.547], [0.457, -0.514], [0.557, -0.4], [0.607, -0.167], [0.631, 0.116], [0.637, 0.436], [0.619, 0.539], [0.552, 0.654], [0.438, 0.738], [0.256, 0.794], [0, 0.81]]) },
  // the coaming under the windscreen (closed: the glareshield sits on it),
  // then the front cockpit's well opens under the glass
  { z: -6.2, pts: fwd([[0, -0.55], [0.3, -0.548], [0.46, -0.515], [0.56, -0.4], [0.61, -0.165], [0.635, 0.12], [0.639, 0.453], [0.621, 0.552], [0.554, 0.662], [0.5, 0.708], [0.259, 0.794], [0, 0.81]]) },
  // the sides run straight up into the canopy rail, which follows the glass edge as it widens
  { z: -5.75, pts: fwd([[0, -0.552], [0.3, -0.55], [0.46, -0.517], [0.558, -0.4], [0.607, -0.159], [0.63, 0.132], [0.639, 0.463], [0.626, 0.565], [0.599, 0.647], [0.562, 0.711], [0.329, 0.72], [0, 0.68]]) },
  { z: -5.0, pts: fwd([[0, -0.556], [0.3, -0.553], [0.46, -0.52], [0.55, -0.4], [0.595, -0.15], [0.61, 0.15], [0.639, 0.462], [0.633, 0.562], [0.619, 0.643], [0.6, 0.71], [0.48, 0.56], [0, 0.4]]) },
  { z: -4.35, pts: fwd([[0, -0.56], [0.3, -0.557], [0.45, -0.525], [0.54, -0.405], [0.575, -0.14], [0.585, 0.16], [0.639, 0.465], [0.634, 0.57], [0.622, 0.656], [0.605, 0.727], [0.5, 0.58], [0, 0.42]]) },
  // between the intakes the lower fuselage tucks in (the boundary-layer gap),
  // the shoulder overhangs the intake tops and the rear cockpit's walls rise
  { z: -3.9, pts: fwd([[0, -0.565], [0.28, -0.562], [0.42, -0.53], [0.49, -0.41], [0.5, -0.12], [0.5, 0.2], [0.515, 0.5], [0.74, 0.645], [0.705, 0.69], [0.61, 0.8], [0.5, 0.66], [0, 0.52]]) },
  { z: -3.0, pts: fwd([[0, -0.58], [0.28, -0.577], [0.42, -0.545], [0.49, -0.42], [0.5, -0.12], [0.5, 0.2], [0.515, 0.5], [0.765, 0.652], [0.735, 0.69], [0.585, 0.95], [0.48, 0.8], [0, 0.6]]) },
  // the shoulder ledge comes down level with the trunk tops first, gently from
  // the rear cockpit on, so the deck spreads out of it flush (a ledge still 5 cm
  // up here dropped onto the deck in an S: a bump behind the canopy)
  { z: -2.6, pts: [[0, -0.593], [0.28, -0.59], [0.42, -0.558], [0.49, -0.433], [0.5, -0.12], [0.5, 0.2], [0.519, 0.5], [0.79, 0.635], [0.78, 0.672], [0.765, 0.678], [0.75, 0.69], [0.735, 0.705], [0.538, 1.012], [0.443, 0.859], [0, 0.704]] },
  // the end of the ramps: the deck spreads across the trunk tops in a few
  // centimetres, beside the rear cockpit's raised walls
  { z: -2.15, pts: [[0, -0.607], [0.283, -0.604], [0.427, -0.573], [0.5, -0.446], [0.513, -0.12], [0.513, 0.2], [0.542, 0.5], ...deck(-2.15, 0.74), [0.528, 1.02], [0.384, 0.992], [0, 0.932]] },
  // the canopy's tail closes onto the dorsal spine, which narrows going aft
  // with the speedbrake lying on its top
  { z: -1.6, pts: [[0, -0.62], [0.3, -0.62], [0.46, -0.59], [0.54, -0.46], [0.56, -0.12], [0.56, 0.2], [0.58, 0.5], ...deck(-1.6, 0.73), [0.55, 1.0], [0.32, 1.17], [0, 1.22]] },
  { z: -0.9, pts: [[0, -0.63], [0.32, -0.64], [0.5, -0.62], [0.58, -0.5], [0.6, -0.12], [0.6, 0.2], [0.62, 0.46], ...deck(-0.9, 0.69), [0.6, 0.95], [0.36, 1.14], [0, 1.19]] },
  // the body takes over the intake trunks (wrapping their top corner clear of
  // it); the deck runs on to the engine bays and the spine falls away to the tail
  { z: 0.4, pts: [[0, -0.64], [0.46, -0.66], [0.95, -0.84], [1.5, -0.87], [1.86, -0.74], [1.95, -0.44], [1.93, -0.1], ...wrap(0.4, [0.68, 0.56]), [0.68, 0.56], [0.53, 0.86], [0.36, 0.96], [0, 1.0]] },
  { z: 1.5, pts: [[0, -0.625], [0.456, -0.645], [0.95, -0.817], [1.49, -0.843], [1.849, -0.717], [1.939, -0.432], [1.93, -0.108], ...wrap(1.5, [0.72, 0.5]), [0.72, 0.5], [0.5, 0.72], [0.3, 0.815], [0, 0.84]] },
  { z: 2.4, pts: [[0, -0.612], [0.453, -0.632], [0.95, -0.799], [1.486, -0.821], [1.84, -0.697], [1.929, -0.428], [1.948, -0.114], [1.938, 0.086], [1.865, 0.272], [1.53, 0.42], [1.19, 0.464], [0.85, 0.5], [0.55, 0.62], [0.3, 0.67], [0, 0.68]] },
  { z: 3.3, pts: aft([[0, -0.6], [0.45, -0.62], [0.95, -0.78], [1.48, -0.8], [1.83, -0.68], [1.92, -0.42], [1.94, -0.12], [1.93, 0.08], [1.86, 0.26], [1.52, 0.4], [0.8, 0.55], [0, 0.6]]) },
  { z: 5.4, pts: aft([[0, -0.46], [0.3, -0.56], [0.66, -0.7], [1.06, -0.63], [1.42, -0.42], [1.55, -0.14], [1.56, 0.0], [1.52, 0.18], [1.34, 0.38], [0.98, 0.5], [0.46, 0.53], [0, 0.5]]) },
  { z: 7.4, pts: aft([[0, -0.38], [0.24, -0.57], [0.64, -0.68], [1.0, -0.57], [1.23, -0.31], [1.28, -0.07], [1.28, 0.02], [1.23, 0.22], [1.0, 0.46], [0.64, 0.56], [0.3, 0.48], [0, 0.38]]) },
  { z: 8.75, pts: aft([[0, -0.28], [0.2, -0.5], [0.64, -0.655], [1.0, -0.54], [1.2, -0.3], [1.245, -0.07], [1.245, 0.0], [1.2, 0.2], [1.0, 0.44], [0.64, 0.555], [0.28, 0.44], [0, 0.26]]) },
]);
// (smooth all round: a single-sample crease on the shoulder ledge also ran a
// straight facet down the round radome, where the same two points sit)
const BODY_SUB = [4, 3, 3, 3, 2, 3, 2, 3, 2, 2, 2, 2, 2, 4];

// The two-seat bubble off the three-view: the windscreen rises from the
// coaming 3.3 m behind the nose tip, the crown is 1.8 m above the tip over
// the bow between the cockpits, and the glass runs 5 m back to the spine.
// The rail sits on the shoulder ledge beside the front seat and climbs the
// raised side walls of the rear cockpit.
const CROWN = curve([[-6.56, 0.81], [-6.36, 0.995], [-5.86, 1.275], [-5.36, 1.455], [-4.86, 1.585], [-4.36, 1.645], [-3.86, 1.665], [-3.36, 1.625], [-2.86, 1.555], [-2.36, 1.425], [-1.86, 1.275], [-1.6, 1.225]]);
const RAIL = curve([[-6.56, 0.77], [-6.2, 0.715], [-5.0, 0.71], [-4.35, 0.727], [-3.9, 0.8], [-3.4, 0.88], [-2.9, 0.95], [-2.4, 1.02], [-1.9, 1.12], [-1.6, 1.2]]);
// (the windscreen rounded in plan at the front, as on the jet: a blunt 0.9 m front edge forced the
// forebody's upper corners to flare out into a hood right behind the radome)
const CANOPY_W = curve([[-6.56, 0.22], [-6.42, 0.37], [-6.2, 0.48], [-5.85, 0.545], [-5.5, 0.575], [-4.5, 0.6], [-3.8, 0.6], [-3.0, 0.56], [-2.4, 0.48], [-1.9, 0.3], [-1.6, 0.04]]);
const CANOPY: Section[] = [-6.56, -6.45, -6.3, -6.05, -5.75, -5.4, -5.0, -4.6, -4.2, -3.8, -3.4, -3.0, -2.6, -2.25, -1.95, -1.75, -1.6].map((z, i, all) => {
  const y = RAIL(z) + 0.03;
  const last = i === all.length - 1;
  return { z, w: CANOPY_W(z), top: Math.max(0.01, CROWN(z) - y), bot: last ? 0.01 : 0.03, y, n: i === 0 ? 2.6 : 2.2 };
});
/** the windscreen's rear frame and the bow between the cockpits */
const ARCH_Z = -5.05;
const BOW_Z = -3.65;
const EYE_FRONT = new THREE.Vector3(0, 1.18, -4.7);
const EYE_REAR = new THREE.Vector3(0, 1.32, -3.25);

// Planforms (body frame x, z)
const WING: WingStation[] = [
  // (the root carries on inside the intake trunk: no gap where the leading edge meets it)
  { x: 1.45, le: -3.0, te: 4.36, y: 0.245, t: 0.066 },
  { x: 1.7, le: -2.75, te: 4.36, y: 0.24, t: 0.066 },
  { x: 2.0, le: -2.45, te: 4.36, y: 0.235, t: 0.064 },
  { x: 4.15, le: -0.3, te: 4.36, y: 0.2, t: 0.05 },
  { x: 6.2, le: 1.75, te: 4.34, y: 0.165, t: 0.034 },
  { x: 6.525, le: 2.08, te: 2.62, y: 0.16, t: 0.03 },
];
const FLAP = { x0: 2.02, x1: 4.12, hinge: (x: number) => 3.42 + (x - 2.02) * 0.01 };
const AIL = { x0: 4.2, x1: 6.1, hinge: (x: number) => 3.6 + (x - 4.2) * 0.07 };
const STAB: WingStation[] = [
  { x: 1.7, le: 6.2, te: 9.3, y: -0.02, t: 0.045 },
  { x: 2.36, le: 6.86, te: 9.33, y: -0.02, t: 0.044 },
  { x: 2.37, le: 6.62, te: 9.33, y: -0.02, t: 0.044 },
  { x: 4.3, le: 8.56, te: 9.62, y: -0.02, t: 0.032 },
];
const STAB_PIVOT_Z = 7.75;
// fin in its own frame: x = height above the boom, (le, te) in body z
const FIN: WingStation[] = [
  { x: 0, le: 4.75, te: 8.4, t: 0.05 },
  { x: 3.18, le: 7.1, te: 8.3, t: 0.034 },
];
const FIN_ROOT = { x: 1.62, y: 0.38, cant: 0 };
// intake mouth: the lower lip's station and the rake that brings the top lip forward
const INTAKE_MOUTH = -3.75;
const INTAKE_RAKE = (y: number) => -0.3 * (y + 0.6);
const RUDDER = { h0: 0.12, h1: 1.95, hinge: (h: number) => 7.62 + h * 0.02 };

function livery(team: string, withCamo = true): Livery {
  const L = new Livery({ half: 10.5, z0: -10.6, len: 21, y0: -2.4, height: 6.4 });
  const { gt, gb, gs } = L;
  const rnd = prng(15);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt;
  const ps = L.ps;
  const camo = 'rgba(74,80,87,0.7)';
  // --- Mod Eagle two-tone camouflage on top -------------------------------
  const blob = (g: CanvasRenderingContext2D, pts: P2[], col: string) => {
    g.fillStyle = col;
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
    g.closePath();
    g.fill();
  };
  for (const sx of [-1, 1]) {
    if (withCamo) blob(gt, [T(2.1 * sx, -0.4), T(4.4 * sx, 1.6), T(5.1 * sx, 3.7), T(3.2 * sx, 4.0), T(2.2 * sx, 2.4)], camo);
    if (withCamo) blob(gt, [T(0.9 * sx, 3.2), T(1.9 * sx, 4.6), T(2.6 * sx, 8.4), T(1.1 * sx, 8.9), T(0.3 * sx, 6.0)], camo);
    if (withCamo) blob(gt, [T(1.2 * sx, -3.8), T(1.95 * sx, -1.2), T(1.5 * sx, 0.4), T(0.95 * sx, -1.4)], camo);
  }
  if (withCamo) blob(gs, [S(-3.2, -0.9), S(-0.4, -0.9), S(1.8, 0.55), S(-1.6, 0.6)], camo);
  if (withCamo) blob(gs, [S(3.4, -0.7), S(6.8, -0.6), S(7.6, 0.5), S(4.4, 0.6)], camo);
  if (withCamo) blob(gs, [S(5.0, 1.0), S(7.6, 1.2), S(8.2, 3.4), S(6.4, 3.5)], camo);
  // radome: the whole shell ahead of the joint at z -7.24, from every side (one
  // clean ring at the joint; an ellipse on top and a triangle on the sides left
  // diagonal edges and patches across it)
  const radome = 'rgba(112,118,122,0.85)';
  gt.fillStyle = gs.fillStyle = gb.fillStyle = radome;
  gt.fillRect(...T(-0.75, -10.0), 1.5 * pt, 2.76 * pt);
  gs.fillRect(...S(-10.0, 0.85), 2.76 * ps, 1.7 * ps);
  gb.fillRect(...B(0.75, -10.0), 1.5 * L.pb, 2.76 * L.pb);
  // anti-glare panel from the joint to the windscreen: kept on the flat top of
  // the forebody (on its curved shoulders the top and side paint blend, and a
  // hard edge there broke into steps), with a soft edge
  gt.save();
  gt.filter = `blur(${Math.max(1, 0.025 * pt).toFixed(1)}px)`;
  gt.fillStyle = 'rgba(44,47,51,0.6)';
  gt.beginPath();
  gt.moveTo(...T(-0.4, -6.5));
  gt.lineTo(...T(0.4, -6.5));
  gt.lineTo(...T(0.32, -6.9));
  gt.lineTo(...T(0.2, -7.2));
  gt.lineTo(...T(-0.2, -7.2));
  gt.lineTo(...T(-0.32, -6.9));
  gt.closePath();
  gt.fill();
  gt.restore();
  // cockpit well (seen through the canopy), following the glass in plan
  gt.fillStyle = 'rgba(40,43,46,1)';
  gt.beginPath();
  const wellZ = [-6.0, -5.5, -5.0, -4.5, -4.0, -3.5, -3.0, -2.6, -2.2, -1.9];
  wellZ.forEach((z, i) => (i === 0 ? gt.moveTo(...T(CANOPY_W(z) - 0.07, z)) : gt.lineTo(...T(CANOPY_W(z) - 0.07, z))));
  for (const z of [...wellZ].reverse()) gt.lineTo(...T(-(CANOPY_W(z) - 0.07), z));
  gt.closePath();
  gt.fill();
  // --- panel lines ----------------------------------------------------------
  const frames = [-7.24, -6.56, -3.3, -1.6, -0.2, 1.4, 2.9, 4.4, 5.9, 7.3, 8.3];
  for (const z of frames) {
    // (no frame lines across the open cockpit under the glass)
    if (z > -6.3 && z < -1.7) for (const sx of [-1, 1]) line(gt, [T(0.62 * sx, z), T(1.9 * sx, z)], 1.4, LINE_LIGHT);
    else line(gt, [T(-1.9, z), T(1.9, z)], 1.4, LINE_LIGHT);
    line(gs, [S(z, -0.9), S(z, 0.75)], 1.6, LINE);
    line(gb, [B(-1.9, z), B(1.9, z)], 1.2, LINE_LIGHT);
  }
  // chine and longerons
  // the lower crease and the shoulder ledge along the forebody, then the
  // longerons down the trunks and the booms
  line(gs, [S(-7.24, -0.26), S(-6.86, -0.38), S(-4.1, -0.4)], 1.6, LINE);
  line(gs, [S(-6.86, 0.56), S(-6.2, 0.61), S(-4.2, 0.645)], 1.4, LINE);
  line(gs, [S(-2.0, 0.5), S(1.5, 0.3), S(5.6, 0.2), S(8.6, 0.2)], 1.4, LINE);
  line(gs, [S(-2.0, -0.62), S(3.8, -0.84), S(7.8, -0.6)], 1.4, LINE);
  for (const sx of [-1, 1]) {
    line(gt, [T(0.49 * sx, -1.45), T(0.49 * sx, 1.0)], 1.4, LINE); // speedbrake
    line(gt, [T(0.45 * sx, 0.6), T(0.4 * sx, 6.2)], 1.2, LINE_LIGHT);
    line(gt, [T(1.3 * sx, -4.6), T(1.4 * sx, 5.2)], 1.2, LINE_LIGHT);
    line(gt, [T(0.64 * sx, 5.8), T(0.64 * sx, 8.7)], 1.2, LINE_LIGHT);
  }
  line(gt, [T(-0.49, -1.45), T(0.49, -1.45)], 1.4, LINE);
  line(gt, [T(-0.49, 1.0), T(0.49, 1.0)], 1.4, LINE);
  // access panels (fuselage sides and top)
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], 1.3, LINE, true);
  rect(gs, S(-6.2, -0.33), S(-5.4, 0.02));
  rect(gs, S(-2.4, 0.12), S(-1.7, 0.45));
  rect(gs, S(1.8, -0.5), S(2.6, -0.1));
  rect(gs, S(4.9, -0.2), S(5.6, 0.15));
  rect(gs, S(6.6, -0.45), S(7.1, -0.05));
  rect(gt, T(-0.3, 2.2), T(0.3, 3.0));
  rect(gt, T(-0.3, 4.2), T(0.3, 4.9));
  // --- wings -----------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    const le = (x: number) => curve([[2.0, -2.45], [6.2, 1.75]])(x);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      // spars
      line(g, [M(2.0, le(2.0) + 0.9), M(6.1, le(6.1) + 0.3)], 1.3, LINE);
      line(g, [M(2.0, 2.6), M(6.1, 3.4)], 1.3, LINE);
      // leading edge panel and ribs
      line(g, [M(2.0, le(2.0) + 0.25), M(6.2, le(6.2) + 0.1)], 1.1, LINE_LIGHT);
      for (const x of [2.8, 3.5, 4.15, 4.9, 5.6]) line(g, [M(x, le(x) + 0.25), M(x, x < 4.15 ? FLAP.hinge(x) : AIL.hinge(x))], 1.0, LINE_LIGHT);
      // flap and aileron outlines
      line(g, [M(FLAP.x0, FLAP.hinge(FLAP.x0)), M(FLAP.x1, FLAP.hinge(FLAP.x1))], 1.6, LINE);
      line(g, [M(AIL.x0, AIL.hinge(AIL.x0)), M(AIL.x1, AIL.hinge(AIL.x1))], 1.6, LINE);
      rivets(g, M(2.0, le(2.0) + 0.9), M(6.1, le(6.1) + 0.3), 7, 0.9);
      rivets(g, M(2.0, 2.6), M(6.1, 3.4), 7, 0.9);
    }
    // walkway and NO STEP
    line(gt, [W(1.95, 0.2), W(2.9, 1.2), W(2.9, 3.1), W(1.95, 3.1)], 1.2, 'rgba(25,27,30,0.45)');
    const [nx, ny] = W(4.4, 2.3);
    gt.save();
    gt.translate(nx, ny);
    gt.fillStyle = 'rgba(28,30,33,0.55)';
    gt.font = `bold ${0.16 * pt}px Arial`;
    gt.textAlign = 'center';
    gt.fillText('NO STEP', 0, 0);
    gt.restore();
    // insignia on the left upper / right lower wing (USAF practice)
    if (sx < 0) roundel(gt, team, ...W(4.6, 2.2), 0.6 * pt);
    else roundel(gb, team, ...Wb(4.6, 2.2), 0.6 * L.pb);
    // stabilators
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(2.37, 6.9), M(4.2, 8.75)], 1.1, LINE_LIGHT);
      line(g, [M(2.0, 8.6), M(4.2, 9.35)], 1.1, LINE_LIGHT);
    }
  }
  // weathering everywhere
  weather(gt, L.top.width, L.top.height, rnd, 1.1, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.8, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 1.0, [1, 0.1]);
  // exhaust soot on the nacelles and booms
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(0.64 * sx, 8.6);
      const grd = g.createLinearGradient(x, y - 2.2 * s, x, y);
      grd.addColorStop(0, 'rgba(40,36,30,0)');
      grd.addColorStop(1, 'rgba(40,36,30,0.35)');
      g.fillStyle = grd;
      g.fillRect(x - 0.62 * s, y - 2.2 * s, 1.24 * s, 2.2 * s);
    }
  }
  // --- markings on the sides (both canvases) ---------------------------------
  L.copySides();
  const teamCol = team === 'blue' ? '#2d4d8e' : '#9a2521';
  // fin: tip band, tail code, serial
  for (const g of [L.gs, L.gr]) {
    g.fillStyle = teamCol;
    g.beginPath();
    g.moveTo(...S(6.98, 3.55));
    g.lineTo(...S(8.35, 3.55));
    g.lineTo(...S(8.36, 3.2));
    g.lineTo(...S(6.72, 3.2));
    g.closePath();
    g.fill();
  }
  L.sideText(team === 'blue' ? 'SK' : 'CP', 7.1, 2.35, 0.62 * ps, 'rgba(34,37,41,0.85)');
  L.sideText(team === 'blue' ? 'AF 20-0015' : 'AF 21-0302', 7.35, 1.55, 0.13 * ps, 'rgba(34,37,41,0.8)');
  L.sideText(team === 'blue' ? 'SKYE WING' : 'CAPRI WING', 7.25, 1.3, 0.1 * ps, 'rgba(34,37,41,0.7)');
  // insignia on the trunk's flat outer wall, clear of the CFT's nose
  L.sideDraw(-3.0, 0.06, (g, x, y) => roundel(g, team, x, y, 0.32 * ps));
  L.sideText('EX', -3.0, -0.43, 0.11 * ps, 'rgba(34,37,41,0.7)');
  // canopy rescue and ejection-seat warnings
  L.sideDraw(-5.3, 0.47, (g, x, y) => {
    g.fillStyle = '#c9402c';
    g.beginPath();
    g.moveTo(x, y - 0.12 * ps);
    g.lineTo(x + 0.12 * ps, y + 0.1 * ps);
    g.lineTo(x - 0.12 * ps, y + 0.1 * ps);
    g.closePath();
    g.fill();
  });
  L.sideText('RESCUE', -4.75, 0.5, 0.07 * ps, '#c9402c');
  // intake danger band: a raked stripe behind the trunk's lip (aft of where
  // the painted skin rolls into the duct, so it only lands on the outer wall)
  for (const g of [L.gs, L.gr]) {
    const lip = (y: number) => INTAKE_MOUTH + INTAKE_RAKE(y);
    g.fillStyle = 'rgba(190,48,40,0.8)';
    g.beginPath();
    g.moveTo(...S(lip(0.52) + 0.42, 0.52));
    g.lineTo(...S(lip(0.52) + 0.48, 0.52));
    g.lineTo(...S(lip(-0.48) + 0.48, -0.48));
    g.lineTo(...S(lip(-0.48) + 0.42, -0.48));
    g.closePath();
    g.fill();
  }
  L.sideText('DANGER', -3.3, 0.5, 0.07 * ps, 'rgba(190,48,40,0.85)');
  return L;
}

const liveries = new Map<string, Livery>();
const plain = new Map<string, Livery>();

/** Markings without the factory two-tone camouflage (under a custom paint job). */
export function f15PlainLivery(team: string): Livery {
  let L = plain.get(team);
  if (!L) {
    L = livery(team, false);
    plain.set(team, L);
  }
  return L;
}

export function buildF15EX(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  const paint = skinMaterial({ top: new THREE.Color('#61686f'), bottom: new THREE.Color('#7f868c'), livery: L, roughness: 0.55, metalness: 0.05, radomeZ: -7.24 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  // --- fuselage ---------------------------------------------------------------
  // (dense where the deck spreads across the trunk tops)
  const zs = mergeStations(stations(-9.86, -7.4, 34, 0.55, 0), stations(-7.4, -2.5, 60), stations(-2.6, -1.9, 14), stations(-2.5, 8.75, 90));
  // (the tip closed: an open 2 cm ring there showed as a hole)
  const body = loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capStart: true, capEnd: true });
  skin(body);
  v.fuselageSections = sectionsFromProfile(BODY, -9.5, 8.5, 40);

  // intake trunks: big rectangular mouths beside the rear cockpit, tucked in
  // under the shoulders with a boundary-layer gap to the fuselage. The mouth
  // is raked, its top (the first compression ramp) forward of the lower lip;
  // the lips are thick and rounded; the outer wall flares out going aft into
  // the wing glove. Off the front view: openings 0.83 m wide and 1.1 m tall.
  // (the walls: T_IN, T_OUT, T_TOP, T_BOT, T_R above)
  const trunkLoop = (z: number) => {
    const x0 = T_IN(z), x1 = T_OUT(z), y0 = T_BOT(z), y1 = T_TOP(z);
    return rrect((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, T_R(z), 4);
  };
  const MOUTH = INTAKE_MOUTH;
  const rake = (_x: number, y: number) => INTAKE_RAKE(y);
  const LIP = 0.075;
  const trunk = intake({
    loop: trunkLoop,
    outer: stations(MOUTH, 1.6, 56, 0.35, 0),
    lip: LIP,
    depth: 2.7,
    n: 84,
    rake,
    rakeFade: 1.1,
    fan: { cx: 1.0, cy: 0.0, r: 0.45 },
  });
  skin(both(trunk.skin));
  v.addMesh(both(trunk.duct), pm.duct);
  // the compression ramp: a plate hanging from the top lip, angling down into
  // the duct (it reads as the inlet's thick upper lip from the front)
  {
    const zt = MOUTH + rake(0, T_TOP(MOUTH) - LIP);
    const x0 = T_IN(MOUTH) + LIP + 0.01, x1 = T_OUT(MOUTH) - LIP - 0.01;
    const yTop = T_TOP(MOUTH) - LIP - 0.005;
    const ramp: number[] = [];
    const cols: number[] = [];
    const idx: number[] = [];
    const N = 6;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      // first ramp shallow, second steeper, then the throat
      const z = zt + 0.05 + u * 1.5;
      const y = yTop - 0.03 - (u < 0.5 ? u * 0.12 : 0.06 + (u - 0.5) * 0.42);
      const k = 0.55 * Math.pow(1 - u, 1.4) + 0.05;
      for (const x of [x0, x1]) {
        ramp.push(x, y, z);
        cols.push(k, k, k * 1.02);
      }
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(ramp, 3));
    rg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    rg.setIndex(idx);
    rg.computeVertexNormals();
    v.addMesh(both(rg), pm.duct);
  }

  // the boundary-layer gap between the trunk and the fuselage reads dark from
  // ahead: a back wall a little way down the slot
  {
    const gapMat = new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const gz = MOUTH + 0.45;
    const g = new THREE.PlaneGeometry(0.14, T_TOP(gz) - T_BOT(gz) - 0.04);
    g.rotateY(Math.PI);
    g.translate(0.53, (T_TOP(gz) + T_BOT(gz)) / 2, gz);
    v.addMesh(both(g), gapMat);
  }

  // conformal fuel tanks on the outside of each trunk (their noses fair into the trunk side)
  const CFT_W = curve([[-2.9, 0.04], [-2.2, 0.22], [-1.2, 0.3], [3.2, 0.3], [4.3, 0.2], [4.9, 0.03]]);
  const CFT_H = curve([[-2.9, 0.05], [-2.2, 0.28], [-1.2, 0.36], [3.2, 0.35], [4.3, 0.24], [4.9, 0.04]]);
  const CFT_X = curve([[-2.9, 1.66], [-2.2, 1.84], [-1.2, 1.93], [4.9, 1.93]]);
  const cft = loftProfile({
    stations: stations(-2.9, 4.9, 60, 0.2, 0.2),
    profile: (z) => rrect(CFT_X(z), -0.44, CFT_W(z), CFT_H(z), Math.min(CFT_W(z), CFT_H(z)) * 0.7, 3),
    sub: 2,
    full: true,
    capStart: true,
    capEnd: true,
  });
  skin(both(cft));

  // tail booms outboard of the nacelles (fins and stabilators hang off them)
  const BOOM_W = curve([[3.6, 0.3], [5.0, 0.16], [8.8, 0.13], [9.6, 0.02]]);
  const BOOM_T = curve([[3.6, 0.44], [5.0, 0.44], [8.6, 0.38], [9.6, 0.12]]);
  const BOOM_B = curve([[3.6, -0.5], [5.0, -0.34], [8.6, -0.26], [9.6, -0.04]]);
  const boom = loftProfile({
    stations: stations(3.6, 9.6, 50, 0, 0.3),
    profile: (z) => {
      const w = BOOM_W(z), t = BOOM_T(z), b = BOOM_B(z);
      return [[1.62, b], [1.62 + w * 0.8, b + 0.02], [1.62 + w, (t + b) * 0.5], [1.62 + w * 0.8, t - 0.02], [1.62, t], [1.62 - w * 0.8, t - 0.02], [1.62 - w, (t + b) * 0.5], [1.62 - w * 0.8, b + 0.02]] as P2[];
    },
    sub: 3,
    full: true,
    capStart: true,
    capEnd: true,
  });
  skin(both(boom));

  // dorsal spine / speedbrake: the spine is part of the body; the big
  // speedbrake is a shell lying on it just behind the canopy
  const SB = keyedProfile([
    { z: -1.45, pts: [[0, 1.236], [0.25, 1.205], [0.42, 1.14], [0.45, 1.12], [0.42, 1.16], [0.25, 1.225], [0, 1.256]] },
    { z: -0.5, pts: [[0, 1.152], [0.28, 1.12], [0.46, 1.05], [0.49, 1.03], [0.46, 1.07], [0.28, 1.14], [0, 1.172]] },
    { z: 1.0, pts: [[0, 0.93], [0.28, 0.905], [0.46, 0.86], [0.49, 0.845], [0.46, 0.875], [0.28, 0.925], [0, 0.95]] },
  ]);
  const sbGeo = stamp(loftProfile({ stations: stations(-1.45, 1.0, 24), profile: SB, sub: 4, capStart: true, capEnd: true }));
  const sb = v.addSurface(sbGeo, paint, new THREE.Vector3(0, 1.236, -1.45), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(sb), 1);
  v.speedbrake = { pivot: sb.pivot, axis: new THREE.Vector3(-1, 0, 0), maxDeg: 45 };

  // --- canopy, seats, pilots -------------------------------------------------------
  v.cockpitEye.copy(EYE_FRONT);
  buildCanopy(v, CANOPY, ARCH_Z, [BOW_Z], paint);
  for (const eye of [EYE_FRONT, EYE_REAR]) {
    addPilot(v, eye.clone(), 0.2, { style: 'us', stick: 'center', martinBaker: false });
  }
  // instrument panel shroud / glareshield at the front of the well, under the windscreen
  // (it runs forward to the windscreen's base on the closed coaming)
  const SH0 = EYE_FRONT.z - 1.42, SH1 = EYE_FRONT.z - 0.62;
  const shroud = loftProfile({
    stations: stations(SH0, SH1, 10),
    profile: (z) => {
      const u = sstep(SH0, SH1, z);
      const top = EYE_FRONT.y - 0.2 - (1 - u) * 0.14;
      const w = 0.4 + 0.12 * u;
      return [[0, 0.42], [w - 0.06, 0.44], [w, top - 0.12], [w - 0.14, top], [0, top + 0.02]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  const sh = v.addMesh(shroud, pm.seat);
  v.hideInCockpit.push(sh);
  // the HUD on top of the glareshield: its body and the tilted combiner glass
  {
    const hy = EYE_FRONT.y - 0.2;
    const hz = SH1 - 0.12;
    const body = new THREE.BoxGeometry(0.2, 0.07, 0.22);
    body.translate(0, hy + 0.035, hz - 0.05);
    const posts = join([
      ...[0.085, -0.085].map((x) => {
        const p = new THREE.BoxGeometry(0.014, 0.17, 0.014);
        p.rotateX(-0.3);
        p.translate(x, hy + 0.15, hz + 0.02);
        return p;
      }),
      (() => {
        const t = new THREE.BoxGeometry(0.184, 0.012, 0.014);
        t.translate(0, 0.08, 0);
        t.rotateX(-0.3);
        t.translate(0, hy + 0.15, hz + 0.02);
        return t;
      })(),
    ]);
    const hb = v.addMesh(join([body, posts]), pm.frame);
    const glassGeo = new THREE.PlaneGeometry(0.17, 0.15);
    glassGeo.rotateX(-0.3);
    glassGeo.translate(0, hy + 0.15, hz + 0.02);
    const hg = v.addMesh(glassGeo, pm.glass);
    v.hideInCockpit.push(hb, hg);
  }

  // --- wings --------------------------------------------------------------------------
  const panels = wingPanels(WING, [
    { x0: FLAP.x0, x1: FLAP.x1, hinge: FLAP.hinge, kind: 'flap', maxDeg: 30 },
    { x0: AIL.x0, x1: AIL.x1, hinge: AIL.hinge, kind: 'aileron', maxDeg: 20 },
  ], { chordPts: 34, thickPos: 0.4 });
  skin(both(panels.fixed));
  for (const cs of panels.moving) {
    for (const side of [1, -1] as const) {
      const g = stamp(side > 0 ? cs.geo.clone() : mirror(cs.geo));
      const a = cs.axis.clone();
      if (side < 0) a.x = -a.x;
      v.addSurface(g, paint, new THREE.Vector3(cs.hinge.x * side, cs.hinge.y, cs.hinge.z), side > 0 ? a : a.negate(), cs.kind, side, cs.maxDeg);
    }
  }

  // stabilators (all-moving, pivot on the booms)
  const stab = wing({ sections: STAB, chordPts: 26, spanSub: 7, tip: 'round', thickPos: 0.42 });
  for (const side of [1, -1] as const) {
    const g = stamp(side > 0 ? stab.clone() : mirror(stab));
    v.addSurface(g, paint, new THREE.Vector3(1.9 * side, -0.02, STAB_PIVOT_Z), new THREE.Vector3(1, 0, 0), 'stab', side, 22);
  }

  // fins with rudders
  for (const side of [1, -1] as const) {
    const m = finMatrix(FIN_ROOT.x * side, FIN_ROOT.y, FIN_ROOT.cant, side);
    const f = finPanels(FIN, RUDDER, m, { chordPts: 28 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 25);
    // antenna fairings on the fin tips
    const tipBase = new THREE.Vector3(0, 0, 0).applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0));
    void tipBase;
    const top = new THREE.Vector3(3.17, 0, 0).applyMatrix4(m);
    const pod = lathe(
      [
        [0.005, 7.35],
        [0.06, 7.55],
        [0.075, 8.0],
        [0.07, 8.55],
        [0.04, 8.85],
        [0.005, 8.95],
      ],
      14,
      top.x,
      top.y,
    );
    skin(pod);
    v.addNavLight(new THREE.Vector3(top.x, top.y + 0.02, 8.6), 'formation');
  }

  // --- engines -----------------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const nz = nozzle({ cx: 0.64 * sx, cy: -0.05, z0: 8.62, z1: 9.5, r0: 0.6, r1: 0.5, petals: 14, saw: 0.08, floor: 8.77 });
    const nzOut = v.addMesh(nz.outer, pm.nozzle);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.nozzles.push({ pos: new THREE.Vector3(0.64 * sx, -0.05, 9.4), radius: 0.46, depth: 0.62, area: nz.area });
  }
  v.buildFlames(6.2);

  // --- gun, probes, antennas, lights ----------------------------------------------------
  // M61 port on the right wing root
  const gunFair = deform(lathe([[0.005, -1.35], [0.06, -1.22], [0.07, -0.9], [0.05, -0.5], [0.005, -0.3]], 14, 1.98, 0.3), (p) => {
    p.y = Math.max(p.y, 0.27);
  });
  skin(gunFair);
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), pm.darkMetal);
  muzzle.position.set(1.98, 0.31, -1.3);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);
  // pitot tubes on the fuselage sides just behind the radome joint, AoA vanes below them
  const probes = join([
    probe(new THREE.Vector3(0.6, 0.26, -6.95), 0.46, 0.012, new THREE.Vector3(0.06, 0, -1).normalize()),
    probe(new THREE.Vector3(-0.6, 0.26, -6.95), 0.46, 0.012, new THREE.Vector3(-0.06, 0, -1).normalize()),
    probe(new THREE.Vector3(0.6, -0.12, -6.45), 0.16, 0.01, new THREE.Vector3(1, 0, -0.8).normalize()),
    probe(new THREE.Vector3(-0.6, -0.12, -6.45), 0.16, 0.01, new THREE.Vector3(-1, 0, -0.8).normalize()),
  ]);
  v.addMesh(probes, pm.antenna);
  const ant = join([
    blade(new THREE.Vector3(0, 0.95, 1.0), 0.22, 0.32),
    blade(new THREE.Vector3(0, 0.6, 3.6), 0.16, 0.26),
    blade(new THREE.Vector3(0, -0.62, 1.8), 0.22, 0.3, new THREE.Vector3(0, -1, 0)),
    blade(new THREE.Vector3(0, -0.575, -3.2), 0.16, 0.24, new THREE.Vector3(0, -1, 0)),
  ]);
  v.addMesh(ant, pm.antenna);
  const fl = join([
    formationStrip(new THREE.Vector3(0.648, 0.25, -5.6), new THREE.Vector3(1, 0.15, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-0.648, 0.25, -5.6), new THREE.Vector3(-1, 0.15, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(2.23, -0.44, 3.0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
    formationStrip(new THREE.Vector3(-2.23, -0.44, 3.0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.035),
  ]);
  v.addMesh(fl, pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-6.5, 0.17, 3.45), 'red');
  v.addNavLight(new THREE.Vector3(6.5, 0.17, 3.45), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.66, 4.8), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -0.66, 1.0), 'strobe');

  // --- landing gear ----------------------------------------------------------------------
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.56, -3.92), axle: new THREE.Vector3(0, -2.05 + 0.33, -4.25), r: 0.33, w: 0.19, twin: false, retract: 'forward' },
    mains: { top: new THREE.Vector3(1.3, -0.78, 0.8), axle: new THREE.Vector3(1.42, -2.05 + 0.43, 1.2), r: 0.43, w: 0.27, retract: 'forward', outboard: 0.12 },
    doorColor: '#6c7379',
  });
}
