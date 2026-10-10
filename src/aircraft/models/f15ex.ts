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
  P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe, rrect, ring, mirrorHalf,
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

// intake trunk walls (body frame, at the true station z): inner and outer x, top and bottom y,
// corner radius. The intake's movable capsule, from the top lip back to its hinge over the cowl lip
// (z -1.95), is a straight box: its side plates parallel, 0.8 m apart, its top corners crisp. Behind
// it the fixed trunk's outer wall steps out toward the wing glove (the three-view's top view has it
// ~1.8 m out by z -1.5, where the conformal tank covers it), the inner wall closes onto the fuselage
// side (the boundary-layer gap ends just behind the cowl lip) and the bottom starts at the cowl lip.
const T_IN = curve([[-4.2, 0.69], [-1.95, 0.69], [-1.5, 0.535], [-0.9, 0.58], [0.4, 0.62], [1.6, 0.66]]);
const T_OUT = curve([[-4.2, 1.49], [-1.95, 1.49], [-1.5, 1.755], [-1.2, 1.819], [-0.9, 1.84], [0.4, 1.91], [1.6, 1.91]]);
const T_TOP = curve([[-4.2, 0.71], [-4.0, 0.7], [-3.6, 0.672], [-3.2, 0.656], [-2.75, 0.65], [-1.9, 0.64], [-0.9, 0.58], [0.4, 0.47], [1.6, 0.39]]);
const T_BOT = curve([[-1.9, -0.65], [-1.4, -0.665], [-0.9, -0.7], [0.4, -0.81], [1.6, -0.79]]);
const T_R = curve([[-4.1, 0.12], [-2.75, 0.15], [-0.9, 0.2], [1.6, 0.22]]);
// the trunk's own corner radii: the top corner a crisp chine from the capsule's top all the way back to
// the wing root (the glove's edge; it only rounds off under the wing, where the body wraps it), the
// mouth's rounded lower corners at the cowl lip growing into the trunk's rounded corners behind
const T_RT = curve([[-4.2, 0.03], [-2.7, 0.035], [-1.9, 0.045], [-0.9, 0.06], [-0.3, 0.09], [0.4, 0.2], [1.6, 0.22]]);
const T_RB = curve([[-1.9, 0.11], [-1.2, 0.17], [-0.9, 0.2], [1.6, 0.22]]);

/** A rounded rectangle with its own corner radius on top and underneath (from the bottom-right corner, CCW). */
function rrect2(cx: number, cy: number, hw: number, hh: number, rTop: number, rBot: number, sub = 4): P2[] {
  const pts: P2[] = [];
  const corners: [number, number, number, number][] = [
    [cx + hw - rBot, cy - hh + rBot, -Math.PI / 2, rBot],
    [cx + hw - rTop, cy + hh - rTop, 0, rTop],
    [cx - hw + rTop, cy + hh - rTop, Math.PI / 2, rTop],
    [cx - hw + rBot, cy - hh + rBot, Math.PI, rBot],
  ];
  for (const [x, y, a0, r] of corners) {
    for (let k = 0; k <= sub; k++) {
      const a = a0 + (k / sub) * (Math.PI / 2);
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
  }
  return pts;
}

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
  // the body's shoulder shelf ends at the fuselage-to-trunk joint (x 0.8), dipping under the trunk's top
  // there: outboard of it the trunk's own flat top is the surface, right out to its chine. (A shelf that
  // spread across the trunk top behind the canopy drew a soft diagonal fold on the deck.)
  const top = T_TOP(z);
  const edge: P2 = [0.8, top + 0.004], foot: P2 = [xFoot, top + 0.03];
  return [[0.87, top - 0.03], [0.83, top - 0.012], edge, [edge[0] + (foot[0] - edge[0]) * 0.7, edge[1] + (foot[1] - edge[1]) * 0.7 - 0.002], foot];
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

/**
 * The trunk's outer loop for station `z` of the intake build (CCW from the outer end of the bottom
 * edge). The build shears each point forward by INTAKE_RAKE(y), fading out over INTAKE_FADE behind
 * the cowl lip, so a point at height y lies at the true station z + INTAKE_RAKE(y) * fade(z): each
 * part of the loop is taken from the walls there (at the mouth the top edge comes from the capsule's
 * front, the bottom from the cowl lip 2.2 m further aft). The points sit at fixed places round the
 * loop (so many per corner, wall and edge), so they keep their heights from station to station: the
 * shear turned the sliding of arc-length resampling into ripples along the walls.
 */
function trunkLoop(z: number): P2[] {
  const f = Math.max(0, 1 - (z - INTAKE_MOUTH) / INTAKE_FADE);
  const at = (y: number) => z + INTAKE_RAKE(y) * f;
  let yb = T_BOT(z), yt = T_TOP(z);
  for (let k = 0; k < 6; k++) {
    yb = T_BOT(at(yb));
    yt = T_TOP(at(yt));
  }
  const rb = T_RB(at(yb)), rt = T_RT(at(yt));
  const xo = (y: number) => T_OUT(at(y)), xi = (y: number) => T_IN(at(y));
  // point counts follow the model's mesh density (stations() scales its count by it)
  const cnt = (n: number) => stations(0, 1, n).length - 1;
  const C = cnt(8), WN = cnt(16), E = cnt(8);
  const pts: P2[] = [];
  // a quarter round (cx, cy) from angle a0 (its end left to the next part), x off the wall at each point's own height
  const corner = (outer: boolean, cy: number, r: number, a0: number) => {
    for (let k = 0; k < C; k++) {
      const a = a0 + (k / C) * (Math.PI / 2);
      const y = cy + Math.sin(a) * r;
      pts.push([(outer ? xo(y) - r : xi(y) + r) + Math.cos(a) * r, y]);
    }
  };
  const wall = (outer: boolean, y0: number, y1: number) => {
    for (let k = 0; k < WN; k++) {
      const y = y0 + ((y1 - y0) * k) / WN;
      pts.push([outer ? xo(y) : xi(y), y]);
    }
  };
  const edge = (y: number, x0: number, x1: number) => {
    for (let k = 0; k < E; k++) pts.push([x0 + ((x1 - x0) * k) / E, y]);
  };
  corner(true, yb + rb, rb, -Math.PI / 2);
  wall(true, yb + rb, yt - rt);
  corner(true, yt - rt, rt, 0);
  edge(yt, xo(yt) - rt, xi(yt) + rt);
  corner(false, yt - rt, rt, Math.PI / 2);
  wall(false, yt - rt, yb + rb);
  corner(false, yb + rb, rb, Math.PI);
  edge(yb, xi(yb) + rb, xo(yb) - rb);
  return pts;
}

/** the intake lips' thickness, and how much further in the duct draws from the trunk wall per metre going back */
const INTAKE_LIP = 0.022;
const DUCT_INSET = 0.12;
/** a trunk's skin (outer walls, lips) and its duct, right side */
function trunkGeometry(): { skin: THREE.BufferGeometry; duct: THREE.BufferGeometry } {
  return intake({
    loop: trunkLoop,
    outer: stations(INTAKE_MOUTH, 1.6, 64, 0.3, 0),
    lip: INTAKE_LIP,
    depth: 3.4,
    n: 168,
    rake: (_x, y) => INTAKE_RAKE(y),
    rakeFade: INTAKE_FADE,
    exactLoop: true,
    ductRings: 40,
    fan: { cx: 0.95, cy: 0.0, r: 0.43 },
    ductShade: { k0: 0.11, fall: 1.5, floor: 0.01, fan: 0.45 },
    ductShadeRaked: true,
    ductStraight: 0.4,
    ductFollow: true,
    ductInset: DUCT_INSET,
  });
}

/**
 * The compression ramp: a plate under the top lip angling down into the duct, the first ramp shallow,
 * the second steeper, down to the throat behind the cowl lip (it reads as the inlet's thick upper lip
 * from the front). Its edges follow the duct's side walls, which draw in going back.
 */
function rampGeometry(): THREE.BufferGeometry {
  // the build station whose ring passes the true station Z at height y (inverse of trunkLoop's shear)
  const stationAt = (Z: number, y: number) => {
    const R = INTAKE_RAKE(y);
    return Math.min(Z, (Z - R * (1 + INTAKE_MOUTH / INTAKE_FADE)) / (1 - R / INTAKE_FADE));
  };
  const z0 = INTAKE_MOUTH + INTAKE_RAKE(MW.y1 - INTAKE_LIP) + 0.04;
  const ramp: number[] = [];
  const cols: number[] = [];
  const idx: number[] = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const Z = z0 + u * 2.7;
    const y = MW.y1 - INTAKE_LIP - 0.012 - (u < 0.4 ? u * 0.16 : 0.064 + (u - 0.4) * 0.53);
    const d = INTAKE_LIP + DUCT_INSET * Math.max(0, stationAt(Z, y) - INTAKE_MOUTH) + 0.006;
    const k = 0.13 * Math.pow(1 - u, 1.3) + 0.015;
    for (const x of [T_IN(Z) + d, T_OUT(Z) - d]) {
      ramp.push(x, y, Z);
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
  return rg;
}

/**
 * The inner side plate ahead of the raked mouth: the boundary-layer splitter runs full height from the
 * top lip down, its leading edge nearly upright (the outer side plate alone is swept back), so from the
 * side and the front quarter the scoop under the ramp shows the plate's dark inside face (F-15 photos).
 * A thin slab just inside the trunk's inner wall line, and the duct lining on its inner face.
 */
function splitterGeometry(): { plate: THREE.BufferGeometry; lining: THREE.BufferGeometry } {
  const yTop = MW.y1 - 0.025, yBot = MW.y0 + 0.06;
  const zLip = (y: number) => INTAKE_MOUTH + INTAKE_RAKE(y);
  const zFront = (y: number) => zLip(yTop) + 0.11 * (yTop - y) / (yTop - yBot);
  const sh = new THREE.Shape();
  sh.moveTo(zFront(yTop), yTop);
  sh.lineTo(zFront(yBot), yBot);
  sh.lineTo(zLip(yBot) + 0.012, yBot);
  sh.lineTo(zLip(yTop) + 0.012, yTop);
  sh.closePath();
  const x0 = T_IN(-3) + 0.002, t = INTAKE_LIP - 0.004;
  const plate = new THREE.ExtrudeGeometry(sh, { depth: t - 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
  // shape (z, y) extruded along local +z: turn it so the slab lies across x from x0 to x0 + t
  plate.rotateY(-Math.PI / 2);
  plate.translate(x0 + t - 0.004, 0, 0);
  // (the lining's material is double-sided)
  const lining = new THREE.ShapeGeometry(sh);
  lining.rotateY(-Math.PI / 2);
  lining.translate(x0 + t + 0.003, 0, 0);
  // (deep in the mouth's shadow: dark, as the photos show it)
  const k = 0.035;
  const n = lining.attributes.position.count;
  lining.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(0).map((_v, i) => (i % 3 === 2 ? k * 1.02 : k)), 3));
  return { plate: join([plate]), lining: join([lining]) };
}

// Conformal fuel tanks: a long fairing over each trunk's outer side, from the glove line under the trunk's
// top corner down to the trunk's bottom (side photos: the tank's top edge runs level ~0.5 m up, its bottom
// ~0.55 m down), bulging ~0.2-0.6 m out of the trunk wall (from below and head-on its outer side is ~2.1 m
// out). The nose is a soft wedge faired into the trunk side behind the intake capsule: its tip at the top
// (z -2.85), its front edge raked back and down to the bottom ~0.9 m further aft, its plan rounded. Under
// the wing the top runs inside the wing (on the wing's chord plane, read off WING so it follows the wing)
// and ahead of the wing's root it rises to the glove line. The tail tapers up and in along the nacelle to
// the boom, ending ahead of the stabilator.
const CFT_TIP = -2.85;
const CFT_END = 5.5;
/** the wing's leading edge z and chord-plane y at span x (linear between the WING stations) */
function wingAt(x: number): { le: number; y: number } {
  const w = WING;
  let i = 0;
  while (i < w.length - 2 && w[i + 1].x < x) i++;
  const t = Math.min(1, Math.max(0, (x - w[i].x) / (w[i + 1].x - w[i].x)));
  return { le: w[i].le + (w[i + 1].le - w[i].le) * t, y: (w[i].y ?? 0) + ((w[i + 1].y ?? 0) - (w[i].y ?? 0)) * t };
}
const CFT_BOT = curve([[-1.9, -0.52], [-0.6, -0.57], [1.2, -0.61], [2.6, -0.59], [3.5, -0.5], [4.4, -0.33], [5.1, -0.12]]);
/** the tank's outer side */
const CFT_X = curve([[-2.0, 2.05], [-1.0, 2.1], [2.8, 2.12], [3.6, 2.06], [4.4, 1.94], [5.0, 1.84], [5.5, 1.76]]);
/** the trunk (and, aft, the nacelle) side the tank lies on, a little inside it */
const CFT_WALL = (z: number) => (z < 0.4 ? T_OUT(z) : curve([[0.4, 1.9], [2.4, 1.92], [3.3, 1.92], [4.4, 1.77], [5.5, 1.6]])(z)) - 0.035;
/** a quarter superellipse closing toward an end: 0 at the end, 1 a length `len` away */
const closeEnd = (d: number, len: number, p: number) => (d <= 0 ? 0 : d >= len ? 1 : Math.pow(1 - Math.pow(1 - d / len, p), 1 / p));
/**
 * The tank's top at z: `wall`, where it tucks under the trunk's rounded top corner (at `xTop`, inside it),
 * and `shoulder`, the crease along its upper outer edge (the tank's top line seen from the side). Ahead of
 * the wing the top runs just under the trunk's top and the crease ~0.5 m up (the side photos), the top
 * sloping down outboard as the glove does; toward the wing the crease comes down onto the wing's leading
 * edge where it meets the tank's side, and the top at the trunk sinks into the wing behind the root, so the
 * tank fairs into the wing (its top inside the wing from there back: on its chord plane, read off WING).
 */
function cftTop(z: number): { wall: number; shoulder: number; xTop: number } {
  const xw = CFT_WALL(z);
  const root = wingAt(xw + 0.035), tip = wingAt(CFT_X(z));
  const yUnder = Math.min(root.y, tip.y) - 0.012;
  const top = T_TOP(z), rt = z < 0.4 ? T_RT(z) : T_R(z);
  const yGl = top - 0.03 - 0.09 * (1 - sstep(CFT_TIP, CFT_TIP + 0.8, z));
  const wall = yGl + (yUnder + 0.03 - yGl) * sstep(root.le - 0.15, root.le + 2.2, z);
  const crease = Math.max(0.46, top - 0.14);
  const shoulder = Math.min(wall - 0.03, crease + (yUnder - crease) * sstep(tip.le - 0.9, tip.le + 0.05, z));
  // (inside the trunk's corner: its centre is rt in from the wall and down from the top)
  const xTop = Math.min(xw, (z < 0.4 ? T_OUT(z) : xw + 0.035) - 0.75 * rt);
  return { wall, shoulder, xTop };
}
/** the tank's top line seen from the side (its upper outer crease) */
const CFT_TOP = (z: number) => cftTop(z).shoulder;
/** the tank's section at z: a closed loop (CCW), from its foot on the wall round the bottom, up the outer side, over the top back to the wall, then down inside the wall */
function cftSection(z: number): P2[] {
  const xw = CFT_WALL(z);
  const { wall: yt, shoulder: ytOut, xTop } = cftTop(z);
  // nose and tail: the depth closes up toward the top (the nose's front edge raked back from the tip at the
  // top) and the bulge in toward the wall, about as fast as the depth near the tip (sections there as wide
  // as deep: a rounded wedge, no blade and no overhanging brow), the tail long and tapering
  // (the nose a wedge with straight edges: its depth and its width both close linearly toward the tip,
  // so its front and sides are flat raked faces, not a rounded blob)
  const kn = closeEnd(z - CFT_TIP, 0.9, 1.0);
  const kh = kn * closeEnd(CFT_END - z, 1.6, 1.5);
  const kw = closeEnd(z - CFT_TIP, 1.3, 1.0) * closeEnd(CFT_END - z, 0.7, 1.8);
  const yb = yt - (yt - CFT_BOT(z)) * Math.max(kh, 0.004);
  const w = (CFT_X(z) - xw) * Math.max(kw, 0.004);
  const h = yt - yb;
  const yo = Math.min(ytOut, yt - 0.03 * kh);
  const X = (f: number) => xw + w * f;
  // a slab: a flat bottom, one tight rounded corner, a straight (barely leaning) outer face, a crisp
  // crease along the upper outer edge (the tank's top line in the side photos) and a flat top running
  // in to the trunk wall
  const pts: P2[] = [
    [X(0), yb + h * 0.02],
    [X(0.12), yb],
    [X(0.8), yb],
    [X(0.96), yb + h * 0.04],
    [X(1.0), yb + h * 0.14],
    [X(1.012), yb + (yo - yb) * 0.55],
    [X(1.0), yo - h * 0.03],
    [X(0.975), yo],
    [X(0.5), yo + (yt - yo) * 0.5],
    [xTop, yt],
    // down inside the trunk wall
    [Math.min(xTop, xw - 0.03), yt - h * 0.35],
    [xw - 0.03, yb + h * 0.3],
  ];
  return pts;
}
/** samples per segment of cftSection's loop: everything a plain straight run except the two short arcs
 * of the lower outer corner */
const CFT_SUB = [1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1];

/**
 * A pod under an intake (hero detail): body of revolution along z from z0 (nose) to z0 + len, radius r,
 * centred at (cx, cy); `nose` shapes the front (a rounded sensor head or a radome), a dark window over it.
 */
function podGeometry(cx: number, cy: number, z0: number, len: number, r: number, kind: 'sniper' | 'nav'): { body: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const prof: P2[] =
    kind === 'sniper'
      ? [[0.001, z0], [r * 0.45, z0 + 0.02], [r * 0.78, z0 + 0.07], [r * 0.95, z0 + 0.15], [r, z0 + 0.27], [r, z0 + 0.45], [r * 1.03, z0 + 0.5], [r * 1.03, z0 + len - 0.5], [r, z0 + len - 0.45], [r * 0.82, z0 + len - 0.2], [r * 0.45, z0 + len - 0.05], [0.001, z0 + len]]
      : [[0.001, z0], [r * 0.5, z0 + 0.03], [r * 0.82, z0 + 0.11], [r * 0.97, z0 + 0.24], [r, z0 + 0.4], [r, z0 + len - 0.4], [r * 0.85, z0 + len - 0.18], [r * 0.5, z0 + len - 0.04], [0.001, z0 + len]];
  const body = lathe(prof, 20, cx, cy);
  let glass: THREE.BufferGeometry;
  if (kind === 'sniper') {
    // the faceted window over the sensor head
    glass = lathe([[0.001, z0 - 0.003], [r * 0.455, z0 + 0.017], [r * 0.785, z0 + 0.067], [r * 0.955, z0 + 0.15], [r * 1.006, z0 + 0.26]], 20, cx, cy);
  } else {
    // the navigation FLIR's square window high on the nose, above the terrain-following radar
    glass = new THREE.BoxGeometry(r * 1.1, r * 0.75, 0.05);
    glass.rotateX(0.35);
    glass.translate(cx, cy + r * 0.55, z0 + 0.2);
  }
  return { body, glass };
}

/**
 * The intake ducts' lining: a deep tunnel the sun hardly reaches (most direct light cut, as in the
 * nozzles), so the mouth reads dark beyond its light-grey lips. One per page, its own shader key.
 */
let DUCT_MAT: THREE.MeshStandardMaterial | null = null;
function intakeDuctMaterial(): THREE.MeshStandardMaterial {
  if (DUCT_MAT) return DUCT_MAT;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.08, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>\n  reflectedLight.directDiffuse *= 0.35;\n  reflectedLight.directSpecular *= 0.2;',
    );
  };
  m.customProgramCacheKey = () => 'f15-intake-duct-v1';
  DUCT_MAT = m;
  return m;
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
// tall toward the tip (in plan it is a full ogive, 0.6 m across 0.5 m behind the
// tip where it is only 0.36 m deep, as on the three-view and the photos from
// above), the tip below the centre line of the base.
const fwd = (pts: P2[]) => split(pts, 8, [0.06, 0.16, 0.3]);
const aft = (pts: P2[]) => split(split(pts, 10, [0.5]), 9, [1 / 3, 2 / 3]);
const BODY = keyedProfile([
  { z: -9.86, pts: fwd(circ(0.012, -0.13)) },
  { z: -9.66, pts: fwd(oval(0.17, -0.112, 0.07, 0.07)) },
  { z: -9.36, pts: fwd(oval(0.3, -0.075, 0.18, 0.18)) },
  { z: -8.86, pts: fwd(oval(0.425, -0.04, 0.325, 0.325)) },
  { z: -8.36, pts: fwd(oval(0.5, 0.02, 0.415, 0.475, 2.05, 2.0)) },
  { z: -7.86, pts: fwd(oval(0.556, 0.07, 0.495, 0.58, 2.1, 2.0)) },
  // radome joint: widest a little above its centre, the lower half an ellipse (head-on the real one
  // narrows below as the forebody does)
  { z: -7.24, pts: fwd(oval(0.6, 0.14, 0.55, 0.68, 2.15, 2.0)) },
  // forebody, from the radome joint to the intakes, off a head-on photo of the jet (the camera fitted on
  // its fins, wing and stabilator tips and wheels): an egg, widest high up beside the cockpit (0.635 at
  // y ~0.35) and tucked in below so that head-on its lower half hides behind the radome, the upper half
  // a fuller superellipse (exponent 2.2 at the joint, 3.4 at the cockpit) whose broad rounded top the
  // canopy sits on, inset from the shoulders. (Ours used to be widest low down, 0.68 at y 0.1, and
  // showed 7-10 cm beyond the radome each side head-on; from below the real nose stops widening at the joint.)
  { z: -7.1, pts: fwd([[0, -0.543], [0.187, -0.508], [0.373, -0.392], [0.502, -0.229], [0.583, -0.027], [0.605, 0.12], [0.605, 0.224], [0.586, 0.35], [0.515, 0.502], [0.397, 0.618], [0.218, 0.697], [0, 0.721]]) },
  { z: -6.95, pts: fwd([[0, -0.544], [0.189, -0.507], [0.377, -0.384], [0.508, -0.212], [0.589, 0.002], [0.612, 0.157], [0.612, 0.275], [0.594, 0.404], [0.528, 0.552], [0.416, 0.66], [0.24, 0.734], [0, 0.755]]) },
  { z: -6.8, pts: fwd([[0, -0.545], [0.192, -0.506], [0.382, -0.376], [0.514, -0.195], [0.596, 0.031], [0.618, 0.195], [0.619, 0.324], [0.602, 0.455], [0.54, 0.596], [0.433, 0.696], [0.26, 0.763], [0, 0.782]]) },
  { z: -6.65, pts: fwd([[0, -0.546], [0.193, -0.506], [0.385, -0.371], [0.519, -0.182], [0.602, 0.052], [0.624, 0.222], [0.625, 0.363], [0.609, 0.494], [0.55, 0.628], [0.448, 0.721], [0.279, 0.782], [0, 0.8]]) },
  { z: -6.5, pts: fwd([[0, -0.548], [0.195, -0.506], [0.388, -0.368], [0.522, -0.174], [0.606, 0.066], [0.628, 0.241], [0.629, 0.398], [0.615, 0.531], [0.56, 0.66], [0.465, 0.746], [0.302, 0.802], [0, 0.818]]) },
  { z: -6.35, pts: fwd([[0, -0.549], [0.195, -0.506], [0.389, -0.365], [0.524, -0.166], [0.608, 0.08], [0.63, 0.259], [0.631, 0.438], [0.618, 0.573], [0.569, 0.695], [0.483, 0.774], [0.329, 0.824], [0, 0.838]]) },
  // the coaming under the windscreen (closed: the glareshield sits on it),
  // then the front cockpit's well opens under the glass
  { z: -6.2, pts: fwd([[0, -0.55], [0.196, -0.507], [0.39, -0.363], [0.525, -0.162], [0.608, 0.087], [0.631, 0.269], [0.632, 0.469], [0.621, 0.607], [0.576, 0.725], [0.497, 0.799], [0.352, 0.845], [0, 0.858]]) },
  // the canopy rail on the shoulder's curve, following the glass edge as it widens
  { z: -5.75, pts: fwd([[0, -0.552], [0.196, -0.508], [0.39, -0.363], [0.526, -0.159], [0.609, 0.094], [0.632, 0.278], [0.633, 0.497], [0.622, 0.637], [0.581, 0.753], [0.444, 0.851], [0.349, 0.785], [0, 0.7]]) },
  { z: -5.0, pts: fwd([[0, -0.556], [0.196, -0.512], [0.391, -0.364], [0.526, -0.157], [0.61, 0.1], [0.633, 0.287], [0.634, 0.523], [0.624, 0.669], [0.584, 0.786], [0.477, 0.876], [0.382, 0.54], [0, 0.4]]) },
  { z: -4.35, pts: fwd([[0, -0.562], [0.196, -0.517], [0.391, -0.367], [0.526, -0.156], [0.61, 0.106], [0.633, 0.296], [0.634, 0.539], [0.624, 0.689], [0.584, 0.811], [0.492, 0.896], [0.397, 0.56], [0, 0.42]]) },
  // at the intakes' top lip the side starts to tuck in under the shoulder
  { z: -4.12, pts: fwd([[0, -0.564], [0.24, -0.54], [0.39, -0.46], [0.47, -0.34], [0.53, -0.12], [0.57, 0.119], [0.605, 0.4], [0.632, 0.62], [0.6, 0.78], [0.499, 0.913], [0.404, 0.66], [0, 0.47]]) },
  // between the intakes the lower fuselage tucks in (the boundary-layer gap),
  // the shoulder overhangs the intake tops and the rear cockpit's walls rise
  { z: -3.9, pts: fwd([[0, -0.565], [0.28, -0.562], [0.42, -0.53], [0.49, -0.41], [0.5, -0.12], [0.5, 0.2], [0.515, 0.5], [0.7, 0.713], [0.63, 0.79], [0.513, 0.929], [0.411, 0.7], [0, 0.52]]) },
  { z: -3.0, pts: fwd([[0, -0.58], [0.28, -0.577], [0.42, -0.545], [0.49, -0.42], [0.5, -0.12], [0.5, 0.2], [0.515, 0.5], [0.77, 0.652], [0.66, 0.72], [0.532, 0.989], [0.45, 0.8], [0, 0.6]]) },
  // the rear cockpit's side comes down smoothly onto the trunk tops, meeting them in a soft valley at
  // x ~0.75, y ~0.68 (user3), the deck then spreading out of it flush (a ledge still 5 cm up here dropped
  // onto the deck in an S: a bump behind the canopy; a ledge pushed out to 0.78 here, from 0.66 at z -3,
  // read as an S-shaped ridge behind the rear cockpit)
  { z: -2.6, pts: [[0, -0.593], [0.28, -0.59], [0.42, -0.558], [0.49, -0.433], [0.5, -0.12], [0.5, 0.2], [0.519, 0.5], [0.79, 0.635], [0.715, 0.683], [0.69, 0.703], [0.668, 0.73], [0.635, 0.775], [0.538, 1.012], [0.443, 0.859], [0, 0.704]] },
  // the end of the ramps: the deck spreads across the trunk tops in a few
  // centimetres, beside the rear cockpit's raised walls
  { z: -2.15, pts: [[0, -0.607], [0.283, -0.604], [0.427, -0.573], [0.5, -0.446], [0.513, -0.12], [0.513, 0.2], [0.542, 0.5], ...deck(-2.15, 0.74), [0.528, 1.02], [0.384, 0.992], [0, 0.932]] },
  // the canopy's tail closes onto the dorsal spine, which narrows going aft
  // with the speedbrake lying on its top
  { z: -1.6, pts: [[0, -0.62], [0.3, -0.62], [0.46, -0.59], [0.54, -0.46], [0.56, -0.12], [0.56, 0.2], [0.58, 0.5], ...deck(-1.6, 0.73), [0.55, 1.0], [0.32, 1.17], [0, 1.22]] },
  { z: -0.9, pts: [[0, -0.63], [0.32, -0.64], [0.5, -0.62], [0.58, -0.5], [0.6, -0.12], [0.6, 0.2], [0.62, 0.46], ...deck(-0.9, 0.69), [0.6, 0.95], [0.36, 1.14], [0, 1.19]] },
  // (the deck stays flat beside the trunk's chine right up to the wing root; the lower points are inside
  // the trunk, on their way out to the nacelle)
  { z: -0.3, pts: [[0, -0.635], [0.384, -0.649], [0.707, -0.721], [1.003, -0.67], [1.18, -0.405], [1.221, -0.094], [1.223, 0.202], ...deck(-0.3, 0.675), [0.63, 0.78], [0.36, 1.06], [0, 1.11]] },
  // the body takes over the intake trunks (wrapping their top corner clear of
  // it); the deck runs on to the engine bays and the spine falls away to the tail
  { z: 0.4, pts: [[0, -0.64], [0.46, -0.66], [0.95, -0.84], [1.5, -0.87], [1.86, -0.74], [1.95, -0.44], [1.93, -0.1], ...wrap(0.4, [0.68, 0.56]), [0.68, 0.56], [0.53, 0.86], [0.36, 0.96], [0, 1.0]] },
  { z: 1.5, pts: [[0, -0.625], [0.456, -0.645], [0.95, -0.817], [1.49, -0.843], [1.849, -0.717], [1.939, -0.432], [1.93, -0.108], ...wrap(1.5, [0.72, 0.5]), [0.72, 0.5], [0.5, 0.72], [0.3, 0.815], [0, 0.84]] },
  { z: 2.4, pts: [[0, -0.612], [0.453, -0.632], [0.95, -0.799], [1.486, -0.821], [1.84, -0.697], [1.929, -0.428], [1.948, -0.114], [1.938, 0.086], [1.865, 0.272], [1.53, 0.42], [1.19, 0.464], [0.85, 0.5], [0.55, 0.62], [0.3, 0.67], [0, 0.68]] },
  { z: 3.3, pts: aft([[0, -0.6], [0.45, -0.62], [0.95, -0.78], [1.48, -0.8], [1.83, -0.68], [1.92, -0.42], [1.94, -0.12], [1.93, 0.08], [1.86, 0.26], [1.52, 0.4], [0.8, 0.55], [0, 0.6]]) },
  // the engine bays: two nacelles (round, on the nozzle axes), their outer sides inside the tail booms,
  // the conformal tanks' tails on them till 4.9, a shallow valley between them on top and a keel
  // between them underneath; they end round the nozzles' roots
  { z: 4.4, pts: [[0, -0.56], [0.36, -0.63], [0.8, -0.77], [1.3, -0.73], [1.64, -0.58], [1.78, -0.39], [1.8, -0.14], [1.78, 0.1], [1.6, 0.4], [1.2, 0.565], [0.94, 0.625], [0.62, 0.6], [0.43, 0.572], [0.22, 0.556], [0, 0.553]] },
  { z: 5.3, pts: [[0, -0.52], [0.26, -0.62], [0.72, -0.74], [1.224, -0.634], [1.544, -0.39], [1.663, -0.137], [1.658, 0.082], [1.527, 0.331], [1.252, 0.54], [0.95, 0.639], [0.696, 0.66], [0.42, 0.6], [0.25, 0.555], [0.12, 0.54], [0, 0.535]] },
  { z: 6.3, pts: [[0, -0.48], [0.22, -0.6], [0.72, -0.73], [1.152, -0.627], [1.427, -0.39], [1.528, -0.145], [1.524, 0.068], [1.412, 0.31], [1.176, 0.514], [0.917, 0.61], [0.696, 0.63], [0.42, 0.57], [0.25, 0.51], [0.12, 0.49], [0, 0.485]] },
  { z: 6.9, pts: [[0, -0.45], [0.17, -0.565], [0.72, -0.7], [1.08, -0.6], [1.31, -0.375], [1.4, -0.14], [1.396, 0.062], [1.3, 0.294], [1.1, 0.488], [0.884, 0.58], [0.697, 0.6], [0.43, 0.535], [0.26, 0.455], [0.12, 0.425], [0, 0.42]] },
  // (z = AFT_END)
  { z: 7.3, pts: [[0, -0.42], [0.11, -0.51], [0.72, -0.678], [1.055, -0.584], [1.275, -0.364], [1.37, -0.137], [1.366, 0.059], [1.264, 0.283], [1.072, 0.47], [0.873, 0.559], [0.698, 0.578], [0.43, 0.51], [0.27, 0.415], [0.12, 0.375], [0, 0.365]] },
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
const RAIL = curve([[-6.56, 0.775], [-6.2, 0.795], [-5.75, 0.815], [-5, 0.84], [-4.35, 0.86], [-3.9, 0.895], [-3.4, 0.93], [-3, 0.955], [-2.6, 0.963], [-2.4, 0.969], [-2.2, 0.978], [-2, 1.013], [-1.8, 1.104], [-1.7, 1.159], [-1.6, 1.19]]);
// (the windscreen rounded in plan at the front, as on the jet: a blunt 0.9 m front edge forced the
// forebody's upper corners to flare out into a hood right behind the radome)
const CANOPY_W = curve([[-6.56, 0.2], [-6.42, 0.31], [-6.2, 0.39], [-5.85, 0.44], [-5.5, 0.465], [-5.15, 0.478], [-4.6, 0.49], [-4.1, 0.505], [-3.6, 0.52], [-3.1, 0.53], [-2.6, 0.528], [-2.3, 0.5], [-2, 0.42], [-1.8, 0.3], [-1.6, 0.04]]);
// the glass's section: boxy at the windscreen (head-on its sides stand near vertical and its top is
// broad), rounder toward the tail
const CANOPY_N = curve([[-6.56, 2.6], [-6.2, 3.4], [-5.15, 4], [-4.2, 3.6], [-3, 3.2], [-2.2, 2.8], [-1.6, 2.4]]);
/**
 * The windscreen's rear frame and the bow between the cockpits, where the three-view has them (the
 * photos agree to within the accuracy of cameras fitted to them, about 0.3 m along the canopy).
 */
const ARCH_Z = -5.2;
const BOW_Z = -3.8;
const CANOPY: Section[] = [-6.56, -6.45, -6.3, -6.05, -5.75, -5.4, ARCH_Z, -5.0, -4.6, -4.2, BOW_Z, -3.6, -3.3, -3.0, -2.6, -2.25, -1.95, -1.75, -1.6].map((z, i, all) => {
  const y = RAIL(z) + 0.03;
  const last = i === all.length - 1;
  return { z, w: CANOPY_W(z), top: Math.max(0.01, CROWN(z) - y), bot: last ? 0.01 : 0.03, y, n: CANOPY_N(z) };
});
const EYE_FRONT = new THREE.Vector3(0, 1.18, -4.7);
const EYE_REAR = new THREE.Vector3(0, 1.32, -3.25);

// Planforms (body frame x, z)
// The wing, laid over the published three-view in true scale (right wing): a
// 45-degree leading edge that meets the trunk's outer wall half a metre behind
// the canopy and fairs forward into it, the flaps' trailing edge straight
// across, the ailerons' sweeping back 15.6 degrees from the kink, and the
// clipped tip cap, raked 30 degrees. 57 m2 to the centre line (the jet's
// reference area is 56.5), 13.04 m span. The root runs on inside the trunk,
// the body and the boom (from z -1.15 to 5.17 at x 1.45, at the same height as
// before), so the junction never opens.
const WING_LE0 = -2.4; // the leading edge: z = x + WING_LE0
const WING_TE = 5.17; // the flaps' trailing edge
const WING_KINK = 4.05; // the trailing-edge kink between flap and aileron
const WING_TE_SWEEP = 0.279; // the ailerons' trailing edge: dz per metre of span
const WING_CAP = 5.78; // the tip cap's joint
// the tip: its short streamwise edge at x from le to rake, then the raked edge in to the trailing corner at cornerX
const WING_TIP = { x: 6.52, le: 4.12, rake: 4.5, cornerX: 5.84 };
/** the trailing edge's z at span x (on the tip cap, the line the raked edge cuts off) */
const wingTE = (x: number) => WING_TE + Math.max(0, x - WING_KINK) * WING_TE_SWEEP;
/**
 * thickness / chord as the section builder takes it: NACA 64A006.6 at the root thinning to 64A203 at the
 * tip (the builder makes a section half as thick as its t, so these are twice the real ratios)
 */
const wingT = (x: number) => 2 * (0.066 - 0.036 * Math.min(1, Math.max(0, (x - 1.9) / (WING_TIP.x - 1.9))));
/**
 * Inboard of x 2.06 the wing keeps its crest level with the deck behind the trunks instead of thickening
 * on with its chord, and sinks just under the deck at x 1.6: wing and deck make one surface there, as on
 * the jet (a root thinned to meet the trunk's side wall read far too thin head-on; at full thickness the
 * root rose through the deck as a plate).
 */
const WING_CREST = (x: number) => 0.4126 - (2.06 - x) * 0.012;
/** the chord plane: the root at its old height in the trunk, then 1 degree of anhedral */
const wingY = (x: number) => (x < 2 ? 0.245 - (x - 1.45) * 0.0182 : 0.235 - (x - 2) * 0.0175);
const wingSt = (x: number, le = x + WING_LE0, te = wingTE(x)): WingStation => ({ x, le, te, y: wingY(x), t: x < 2.06 ? (4 * (WING_CREST(x) - wingY(x))) / (te - le) : wingT(x) });
/**
 * The tip cap's raked edge in plan, [x, z] from its outer end (the aft end of the tip's short streamwise
 * edge) to the trailing corner: a straight cut, its edge rounded over the wing's half thickness there
 * (1-2 cm, so a marking drawn along this line sits on the rounded edge's top).
 */
const WING_RAKE: [P2, P2] = [[WING_TIP.x, WING_TIP.rake], [WING_TIP.cornerX, wingTE(WING_TIP.cornerX)]];
/** the raked edge of the tip cap (z of the cut at span x; behind the trailing edge inboard of the corner) */
const wingRake = (x: number) => {
  const [[x1, z1], [x0, z0]] = WING_RAKE;
  return x <= x0 ? wingTE(x) + 0.05 : z0 + ((x - x0) / (x1 - x0)) * (z1 - z0);
};
/** conical camber: the leading edge droops more and more toward the tip */
const wingDroop = (x: number) => 0.02 * (wingTE(x) - x - WING_LE0) * Math.min(1, Math.max(0, (x - 2.1) / (WING_TIP.x - 2.1)));
const WING_OPT = { chordPts: 34, thickPos: 0.4, droop: wingDroop };
// the leading edge's fillet into the trunk's outer wall: a quadratic from inside the trunk round the corner
// where the straight edge would meet the wall, out onto the straight edge; it crosses the wall at z -0.59
// at 33 degrees instead of 45 (a fillet tangent to the wall ran forward along it as a thin blade)
const WING_FILLET: WingStation[] = [0, 0.3, 0.42, 0.5, 0.58, 0.7, 0.85, 1].map((u) => {
  const p0: P2 = [1.7, -0.9], c: P2 = [1.86, 1.86 + WING_LE0], p2: P2 = [2.06, 2.06 + WING_LE0];
  const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), d = u * u;
  return wingSt(a * p0[0] + b * c[0] + d * p2[0], a * p0[1] + b * c[1] + d * p2[1]);
});
const WING: WingStation[] = [
  // (inside the trunk and the body)
  wingSt(1.45, -1.15),
  ...WING_FILLET,
  wingSt(WING_KINK),
  wingSt(WING_TIP.cornerX),
  wingSt(WING_TIP.x, WING_TIP.le, WING_TIP.rake),
];
// (the flap starts at the boom's outer wall, x 2.05, which runs straight from z 3.4 to the stab)
const FLAP = { x0: 2.05, x1: WING_KINK - 0.01, hinge: (_x: number) => 4.555 };
const AIL = { x0: WING_KINK + 0.01, x1: WING_CAP, hinge: (x: number) => 4.555 + (x - WING_KINK) * 0.38 };
const STAB: WingStation[] = [
  // off the three-view's planform (its top view): the inboard leading edge at 49 deg from the boom to
  // the dogtooth 2.8 m out, where a notch steps forward 0.26 m to the outboard leading edge (52 deg)
  // running out to the tip's corner 4.36 m out; the tip raked back inboard to the trailing edge, which
  // sweeps back 15 deg from the boom to it. Root inside the boom's side wall. No dihedral.
  { x: 1.74, le: 5.91, te: 8.84, y: -0.02, t: 0.045 },
  { x: 2.81, le: 7.14, te: 9.12, y: -0.02, t: 0.042 },
  { x: 2.95, le: 6.88, te: 9.16, y: -0.02, t: 0.041 },
  { x: 3.78, le: 7.94, te: 9.38, y: -0.02, t: 0.034 },
  { x: 3.95, le: 8.16, te: 9.385, y: -0.02, t: 0.033 },
  { x: 4.05, le: 8.29, te: 9.33, y: -0.02, t: 0.033 },
  { x: 4.2, le: 8.48, te: 9.02, y: -0.02, t: 0.032 },
  { x: 4.3, le: 8.62, te: 8.82, y: -0.02, t: 0.032 },
  { x: 4.35, le: 8.7, te: 8.74, y: -0.02, t: 0.032 },
];
const STAB_PIVOT_Z = 7.62;
// fin in its own frame: x = height above FIN_ROOT.y, (le, te) in body z. Off the three-view's side view
// (checked against camera solves on the photos): the leading edge sweeps back at 40 deg from the boom
// top, behind the wing's trailing edge, to the tip pod; the trailing edge leans back 3.5 deg.
const FIN: WingStation[] = [
  { x: 0, le: 5.57, te: 8.755, t: 0.07 },
  { x: 3.1, le: 8.14, te: 8.955, t: 0.036 },
];
const FIN_ROOT = { x: 1.62, y: 0.38, cant: 0 };
// The intake mouth, outside: 0.8 m wide and 1.36 m tall (off a head-on photo, perspective taken out),
// its inner wall in line with the radome's edge, its top level with the shoulder beside the cockpit,
// the top corners nearly square, the bottom ones rounded. The top lip (the first ramp's leading edge)
// is the front of the mouth; the side plates' leading edges sweep back from it ~59 degrees (three-view,
// user1/user2 and side photos) to the cowl lip 2.2 m further aft, so from the side and the front
// quarter the mouth is a deep raked scoop under the ramp. The mouth at height y lies at
// z = INTAKE_MOUTH + INTAKE_RAKE(y) (INTAKE_MOUTH: the cowl lip, at the mouth's bottom MW.y0).
const MW = { x0: 0.69, x1: 1.49, y0: -0.65, y1: 0.71 };
const INTAKE_SWEEP = 1.65;
const INTAKE_MOUTH = -1.9;
const INTAKE_RAKE = (y: number) => -INTAKE_SWEEP * (y - MW.y0);
/** how far behind the cowl lip the rake has faded out of the trunk's skin and duct (longer than the rake itself) */
const INTAKE_FADE = 3.4;
const RUDDER = { h0: 0.12, h1: 1.95, hinge: (h: number) => 7.62 + h * 0.02 };
// The fins stand 1.66 m out (the three-view's front view puts their root faces at 1.61 and 1.73), the
// rudder over the lower half of their trailing edge, its hinge leaning back with the edge: set here with
// the rest of the tail (the lines above sit among the intake's constants)
Object.assign(FIN_ROOT, { x: 1.66 });
Object.assign(RUDDER, { h0: 0.34, h1: 1.72, hinge: (h: number) => 8.06 + (h - 0.34) * 0.232 });
// the engines: the nozzle axes and the bare nozzles (from the sync ring to the exit); the body ends
// round the nozzle roots, just inside them
const NOZ = { x: 0.72, y: -0.05, z0: 7.18, z1: 8.08, r0: 0.6, r1: 0.52 };
const AFT_END = 7.3; // (the BODY's last key)
// Tail booms outboard of the engines (right side), off the three-view's top and side views. They start
// inside the body at the trunk's end (z 2.4) and their top rises out of the trunk top tangentially and
// gently to the fin root (0.78 m up); ahead of the flaps' trailing edge their outer wall stands just
// at the flap's root end (x 2.05), behind it it fairs out to 4.16 m across (x 2.08) back to the
// stabilator's leading edge, where the wall steps in to 1.77 for the stabilator's root; the fin stands
// on their top, the stabilator comes out of the outer wall, and behind the fin's trailing edge they
// close into a short stinger at the stabilator's height. Inner and outer wall x, top and bottom y, and
// how round the corners are (0 square .. 1 a full radius).
const BOOM_XI = curve([[2.4, 1.6], [3.0, 1.52], [3.6, 1.48], [4.4, 1.46], [5.2, 1.45], [5.9, 1.44], [6.6, 1.42], [7.0, 1.39], [7.45, 1.37], [8.0, 1.38], [8.15, 1.42], [8.45, 1.52], [8.75, 1.58], [9.0, 1.6], [9.3, 1.635], [9.52, 1.68]]);
const BOOM_XO = curve([[2.4, 1.8], [3.0, 1.86], [3.4, 2.05], [5.12, 2.05], [5.35, 1.96], [5.6, 2.05], [5.85, 2.08], [6.2, 2.07], [6.55, 2.04], [6.75, 1.99], [6.86, 1.9], [6.95, 1.8], [7.05, 1.77], [8.75, 1.77], [9.0, 1.765], [9.3, 1.745], [9.52, 1.71]]);
const BOOM_T = curve([[2.4, 0.3], [2.9, 0.345], [3.4, 0.4], [3.9, 0.47], [4.4, 0.55], [4.9, 0.625], [5.4, 0.7], [5.9, 0.76], [6.4, 0.78], [6.8, 0.77], [7.4, 0.71], [8.1, 0.65], [8.7, 0.6], [8.8, 0.52], [8.9, 0.3], [9.0, 0.17], [9.2, 0.125], [9.4, 0.07], [9.52, 0.02]]);
const BOOM_B = curve([[2.4, 0.0], [3.0, -0.1], [3.6, -0.25], [4.4, -0.4], [5.0, -0.46], [5.9, -0.42], [6.6, -0.36], [7.4, -0.3], [8.1, -0.22], [8.7, -0.165], [9.0, -0.13], [9.2, -0.1], [9.4, -0.06], [9.52, -0.02]]);
const BOOM_R = curve([[2.4, 0.9], [3.2, 0.6], [4.0, 0.4], [7.4, 0.36], [8.6, 0.45], [8.85, 0.7], [9.0, 0.92]]);
const BOOM_Z0 = 2.4, BOOM_Z1 = 9.52;
/** the boom's section at z: a rounded rectangle, CCW from the middle of its underside (seen from behind) */
function boomSection(z: number): P2[] {
  const xi = BOOM_XI(z), xo = BOOM_XO(z), yt = BOOM_T(z), yb = BOOM_B(z);
  const xm = (xi + xo) / 2, r = Math.min(xo - xi, yt - yb) * 0.5 * Math.min(0.92, BOOM_R(z)), d = r * 0.293;
  return [
    [xm, yb], [xo - r, yb], [xo - d, yb + d], [xo, yb + r], [xo, yt - r], [xo - d, yt - d], [xo - r, yt],
    [xm, yt], [xi + r, yt], [xi + d, yt - d], [xi, yt - r], [xi, yb + r], [xi + d, yb + d], [xi + r, yb],
  ];
}

/** the radome's joint (z) and tip: the skin shader's radome finish and the markings both use it */
const RADOME_Z = -7.24;

/** A WingStation list interpolated at span (a fin: height) x, as wing() does. */
function stationAt(st: WingStation[], x: number): { le: number; te: number; y: number } {
  const at = (s: WingStation) => ({ le: s.le, te: s.te, y: s.y ?? 0 });
  if (x <= st[0].x) return at(st[0]);
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1];
    if (x <= b.x) {
      const f = (x - a.x) / Math.max(1e-9, b.x - a.x);
      return { le: a.le + (b.le - a.le) * f, te: a.te + (b.te - a.te) * f, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * f };
    }
  }
  return at(st[st.length - 1]);
}

/**
 * The factory finish's markings, projected onto the airframe from above, below and
 * the sides. The paint itself (near-black gunship grey, a dark metallic finish) is the
 * material's colour: the canvases carry the seams (dark strokes the shader engraves),
 * the stencils (light grey), the codes (flat black) and the weathering. Everything on
 * the wings, fins, stabilators, intakes and canopy is placed from those parts'
 * geometry constants, so it stays on them when their shapes change.
 * `withCamo`: the factory scheme's barely visible patchwork of touched-up panels
 * (off under a custom paint job, which keeps only the markings).
 */
function livery(team: string, withCamo = true): Livery {
  const L = new Livery({ half: 10.5, z0: -10.6, len: 21, y0: -2.4, height: 6.4 });
  const { gt, gb, gs } = L;
  const rnd = prng(15);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, pb = L.pb, ps = L.ps;
  // seams: darker than the paint (the shader engraves them and they catch the light)
  const SEAM = 'rgba(6,7,9,0.6)';
  const SEAM_L = 'rgba(6,7,9,0.38)';
  // stencils: light grey on the dark paint; codes: flat black
  const STEN = 'rgba(170,175,178,0.9)';
  const BLACK = 'rgba(12,13,15,0.97)';
  const red = 'rgba(176,44,36,0.92)';
  const fill = (g: CanvasRenderingContext2D, pts: P2[], col: string | CanvasGradient) => {
    g.fillStyle = col;
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
    g.closePath();
    g.fill();
  };
  const rect = (g: CanvasRenderingContext2D, a: P2, b: P2, w = 1.2, col = SEAM) => line(g, [a, [b[0], a[1]], b, [a[0], b[1]]], w, col, true);
  /** a row of screw heads round a door (canvas points) */
  const screws = (g: CanvasRenderingContext2D, a: P2, b: P2, step: number) => {
    for (const [p, q] of [[a, [b[0], a[1]]], [[b[0], a[1]], b], [b, [a[0], b[1]]], [[a[0], b[1]], a]] as [P2, P2][]) rivets(g, p, q, step, 0.75, 'rgba(4,5,6,0.45)');
  };
  /** small stencil text: a few lines of light grey "writing" (legible only up close, as on the jet) */
  const stencilBlock = (g: CanvasRenderingContext2D, x: number, y: number, w: number, lines: number, px: number, col = STEN) => {
    g.fillStyle = col;
    for (let i = 0; i < lines; i++) {
      const lw = w * (i === 0 ? 0.55 : 0.75 + rnd() * 0.25);
      g.fillRect(x - w / 2, y + i * px * 1.6, lw, Math.max(1, px * 0.55));
    }
  };

  // geometry (body frame) of the parts the markings sit on
  const wingAt = (x: number) => stationAt(WING, x);
  const stabAt = (x: number) => stationAt(STAB, x);
  const finAt = (h: number) => stationAt(FIN, h);
  const cant = (FIN_ROOT.cant * Math.PI) / 180;
  const finY = (h: number) => FIN_ROOT.y + h * Math.cos(cant);
  const FIN_H = FIN[FIN.length - 1].x;
  // the wing from where it leaves the trunk (its first stations lie inside it) to the tip
  const WROOT = Math.max(WING[0].x, T_OUT(1.6) + 0.06), WTIP = WING[WING.length - 1].x;
  /** where the wing's leading edge meets the trunk's outer wall */
  const junction = (() => {
    for (let x = WING[0].x; x < WING[0].x + 1.5; x += 0.01) {
      const le = wingAt(x).le;
      if (x >= T_OUT(le)) return { x, z: le };
    }
    return { x: WING[0].x, z: WING[0].le };
  })();
  const SROOT = STAB[0].x, STIP = STAB[STAB.length - 1].x;
  const windscreen = CANOPY[0].z, canopyTail = CANOPY[CANOPY.length - 1].z;
  const lip = (y: number) => INTAKE_MOUTH + INTAKE_RAKE(y);
  /** the intake's top lip (the front of the trunk tops) */
  const topLip = lip(T_TOP(INTAKE_MOUTH));

  // --- the factory finish: a patchwork of touched-up panels, a shade or two off ---
  if (withCamo) {
    const patch = (g: CanvasRenderingContext2D, pts: P2[], lighter: boolean, a: number) => fill(g, pts, lighter ? `rgba(120,126,132,${a})` : `rgba(10,11,13,${a})`);
    for (const sx of [-1, 1]) {
      // wing: the panels between the spars, inboard and outboard, and the flap
      const w0 = wingAt(WROOT + 0.6), w1 = wingAt(WROOT + 1.9), w2 = wingAt(WTIP - 0.9);
      patch(gt, [T(sx * (WROOT + 0.6), w0.le + 0.22 * (w0.te - w0.le)), T(sx * (WROOT + 1.9), w1.le + 0.22 * (w1.te - w1.le)), T(sx * (WROOT + 1.9), w1.le + 0.6 * (w1.te - w1.le)), T(sx * (WROOT + 0.6), w0.le + 0.6 * (w0.te - w0.le))], sx > 0, 0.07);
      patch(gt, [T(sx * (WROOT + 2.4), wingAt(WROOT + 2.4).le + 0.3), T(sx * (WTIP - 0.9), w2.le + 0.25), T(sx * (WTIP - 0.9), w2.le + 0.55 * (w2.te - w2.le)), T(sx * (WROOT + 2.4), wingAt(WROOT + 2.4).le + 0.5 * (wingAt(WROOT + 2.4).te - wingAt(WROOT + 2.4).le))], sx < 0, 0.06);
      patch(gt, [T(sx * FLAP.x0, FLAP.hinge(FLAP.x0) + 0.04), T(sx * FLAP.x1, FLAP.hinge(FLAP.x1) + 0.04), T(sx * FLAP.x1, wingAt(FLAP.x1).te), T(sx * FLAP.x0, wingAt(FLAP.x0).te)], sx > 0, 0.08);
      // spine and engine-bay doors
      patch(gt, [T(sx * 0.12, 3.0), T(sx * 1.05, 3.0), T(sx * 1.05, 5.5), T(sx * 0.12, 5.5)], sx < 0, 0.07);
      patch(gt, [T(sx * 0.2, 5.6), T(sx * 0.95, 5.6), T(sx * 0.95, 7.8), T(sx * 0.2, 7.8)], sx > 0, 0.06);
      // stabilator
      const s0 = stabAt(SROOT + 0.8), s1 = stabAt(STIP - 0.4);
      patch(gt, [T(sx * (SROOT + 0.8), s0.le + 0.3), T(sx * (STIP - 0.4), s1.le + 0.15), T(sx * (STIP - 0.4), s1.te - 0.15), T(sx * (SROOT + 0.8), s0.te - 0.2)], sx < 0, 0.06);
    }
    // the intake ramps' top panels: lighter, weathered (user3)
    for (const sx of [-1, 1]) {
      const z0 = topLip + 0.12, z1 = z0 + 1.25;
      fill(gt, [T(sx * (T_IN(z0) + 0.05), z0), T(sx * (T_OUT(z0) - 0.06), z0), T(sx * (T_OUT(z1) - 0.08), z1), T(sx * (T_IN(z1) + 0.05), z1)], 'rgba(150,154,158,0.26)');
      // (the marker aft of the lower lip and the duct's painted first metre: projected from
      // above, anything over the mouth also lands on the lip's floor)
      const zc = z0 + 0.35 < INTAKE_MOUTH - 0.05 ? z0 + 0.35 : INTAKE_MOUTH + 0.45;
      const [cx, cy] = T(sx * (T_IN(z0) + 0.22), zc);
      const q = 0.05 * pt;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        gt.fillStyle = (i + j) % 2 ? 'rgba(20,21,23,0.85)' : 'rgba(205,208,206,0.85)';
        gt.fillRect(cx - 2 * q + i * q, cy - 2 * q + j * q, q, q);
      }
    }
    // the sides: an avionics door and the trunk panels resprayed
    patch(gs, [S(windscreen + 0.2, -0.32), S(windscreen + 0.95, -0.32), S(windscreen + 0.95, 0.02), S(windscreen + 0.2, 0.02)], true, 0.07);
    patch(gs, [S(lip(0) + 1.2, -0.45), S(lip(0) + 2.6, -0.45), S(lip(0) + 2.6, 0.32), S(lip(0) + 1.2, 0.32)], false, 0.08);
    patch(gs, [S(3.1, -0.5), S(5.5, -0.5), S(5.5, 0.2), S(3.1, 0.2)], true, 0.05);
    // the fins: the tip caps and a panel low on the fin
    for (const g of [gs]) {
      const a = finAt(FIN_H - 0.3), b = finAt(FIN_H);
      fill(g, [S(a.le, finY(FIN_H - 0.3)), S(a.te, finY(FIN_H - 0.3)), S(b.te, finY(FIN_H)), S(b.le, finY(FIN_H))], 'rgba(10,11,13,0.1)');
    }
  }

  // --- the nose: anti-glare panel, cockpit well --------------------------------
  // a flat panel a shade darker than the paint from the radome joint to the windscreen, on
  // the top of the forebody (opaque, so the shader paints it as flat paint, not the metallic finish)
  {
    const z0 = RADOME_Z + 0.03, z1 = windscreen + 0.02;
    gt.save();
    gt.filter = `blur(${Math.max(1, 0.015 * pt).toFixed(1)}px)`;
    fill(gt, [T(-0.27, z1), T(0.27, z1), T(0.32, (z0 + z1) / 2), T(0.27, z0), T(-0.27, z0), T(-0.32, (z0 + z1) / 2)], 'rgb(40,43,46)');
    gt.restore();
  }
  // cockpit well (seen through the canopy), following the glass in plan
  {
    const wellZ: number[] = [];
    for (let z = windscreen + 0.56; z < canopyTail - 0.25; z += 0.25) wellZ.push(z);
    const pts: P2[] = [...wellZ.map((z) => T(CANOPY_W(z) - 0.07, z)), ...[...wellZ].reverse().map((z) => T(-(CANOPY_W(z) - 0.07), z))];
    fill(gt, pts, 'rgba(26,28,31,1)');
  }

  // --- panel lines: fuselage ------------------------------------------------------
  // frames across the top (not across the open cockpit, nor out onto the wings)
  const topHalf = (z: number) => (z < topLip ? 0.62 : Math.min(T_OUT(Math.min(z, 1.6)) - 0.05, 1.9));
  const rootTE = wingAt(WROOT).te;
  for (const z of [RADOME_Z + 0.32, windscreen - 0.12, canopyTail + 0.02, -0.2, 1.4, 2.4, 3.0, 4.4, 5.6, 6.8, 7.8]) {
    const h = z > rootTE + 0.1 ? 1.85 : z > 2.4 ? 1.15 : topHalf(z);
    line(gt, [T(-h, z), T(h, z)], 1.2, z === canopyTail + 0.02 || z === RADOME_Z + 0.32 ? SEAM : SEAM_L);
    line(gb, [B(-h, z), B(h, z)], 1.1, SEAM_L);
  }
  // the deck over the trunks: its edges, the spine's foot, the engine bays
  for (const sx of [-1, 1]) {
    line(gt, [T(sx * 0.62, canopyTail + 0.1), T(sx * 0.6, 2.4), T(sx * 0.45, 8.5)], 1.1, SEAM_L);
    line(gt, [T(sx * (T_OUT(-1.9) - T_R(-1.9) - 0.1), -1.9), T(sx * (T_OUT(0.4) - T_R(0.4) - 0.1), 0.4), T(sx * 1.25, 2.4), T(sx * 1.12, 5.6), T(sx * 1.0, 8.4)], 1.1, SEAM_L);
    line(gt, [T(sx * 0.12, 2.4), T(sx * 0.12, 8.5)], 1.0, SEAM_L);
    // engine-bay doors on top
    rect(gt, T(sx * 0.18, 3.05), T(sx * 1.05, 5.5), 1.2, SEAM);
    rect(gt, T(sx * 0.22, 5.65), T(sx * 0.95, 7.75), 1.2, SEAM);
    screws(gt, T(sx * 0.2, 3.08), T(sx * 1.03, 5.47), 0.06 * pt);
    screws(gt, T(sx * 0.24, 5.68), T(sx * 0.93, 7.72), 0.06 * pt);
  }
  line(gt, [T(0, canopyTail + 0.1), T(0, 2.4)], 0.9, SEAM_L);
  // the sides: the forebody's lower crease and the shoulder, the trunks, the aft body
  line(gs, [S(RADOME_Z, -0.27), S(windscreen, -0.29), S(topLip + 0.2, -0.31)], 1.3, SEAM);
  line(gs, [S(RADOME_Z + 0.32, 0.6), S(windscreen, 0.66), S(topLip + 0.1, 0.68)], 1.1, SEAM_L);
  line(gs, [S(windscreen, RAIL(windscreen) - 0.06), ...[ARCH_Z, BOW_Z, canopyTail + 0.3].map((z) => S(z, RAIL(z) - 0.06))], 1.1, SEAM_L);
  for (const z of [RADOME_Z + 0.32, windscreen - 0.12, ARCH_Z, BOW_Z - 0.25]) line(gs, [S(z, -0.42), S(z, Math.min(RAIL(Math.max(z, windscreen)) - 0.08, 0.62))], 1.2, SEAM);
  // the trunks: the intake cowl's seam a little behind the lip, the ramp hinge, the bottom
  {
    const yl = (z: number) => T_BOT(z) + 0.06, yh = (z: number) => T_TOP(z) - 0.04;
    const raked = (dz: number, y0 = yl(INTAKE_MOUTH)) => [S(lip(y0) + dz, y0), S(lip(yh(INTAKE_MOUTH)) + dz, yh(INTAKE_MOUTH))];
    line(gs, raked(0.3), 1.2, SEAM);
    // (the second one only above the tank's top, which fairs into the trunk's side behind the mouth)
    line(gs, raked(1.25, 0.2), 1.3, SEAM);
    line(gs, [S(lip(0) + 1.25, 0.08), S(0.4, 0.06), S(2.4, 0.0)], 1.1, SEAM_L);
    line(gs, [S(lip(-0.5) + 0.3, T_BOT(INTAKE_MOUTH + 0.3) + 0.1), S(-0.9, T_BOT(-0.9) + 0.12), S(0.4, T_BOT(0.4) + 0.14)], 1.1, SEAM_L);
    for (const z of [-1.6, -0.2, 1.4]) line(gs, [S(z, T_BOT(Math.min(z, 1.6)) + 0.12), S(z, T_TOP(Math.min(z, 1.6)) - 0.06)], 1.1, SEAM_L);
  }
  // the conformal tanks (their panel breaks and the joint along the middle)
  line(gs, [S(-2.2, -0.44), S(4.3, -0.44)], 1.1, SEAM_L);
  for (const z of [-1.3, 0.2, 1.7, 3.2]) line(gs, [S(z, -0.72), S(z, 0.16)], 1.1, SEAM_L);
  // aft body: the engine-bay doors and the booms
  rect(gs, S(3.1, -0.5), S(5.5, 0.2), 1.2, SEAM);
  rect(gs, S(5.6, -0.45), S(7.8, 0.18), 1.2, SEAM);
  screws(gs, S(3.13, -0.47), S(5.47, 0.17), 0.06 * ps);
  screws(gs, S(5.63, -0.42), S(7.77, 0.15), 0.06 * ps);
  line(gs, [S(2.4, 0.3), S(8.6, 0.32)], 1.0, SEAM_L);
  // underneath: the gear bays' doors, the centre line, the engine-bay doors
  rect(gb, B(-0.19, -4.75), B(0.19, -3.45), 1.0, SEAM);
  line(gb, [B(0, -4.75), B(0, -3.45)], 0.8, SEAM_L);
  for (const sx of [-1, 1]) {
    rect(gb, B(sx * 0.95, -0.3), B(sx * 1.6, 1.75), 1.0, SEAM);
    rect(gb, B(sx * 0.2, 2.6), B(sx * 1.05, 5.4), 1.0, SEAM);
    rect(gb, B(sx * 0.22, 5.5), B(sx * 1.0, 8.2), 1.0, SEAM);
  }
  line(gb, [B(0, -6.9), B(0, 2.5)], 0.8, SEAM_L);

  // --- panel lines: wings ----------------------------------------------------------
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    const xs: number[] = [];
    for (let x = WROOT + 0.25; x <= WTIP - 0.1; x += 0.25) xs.push(x);
    const along = (f: number, x0 = WROOT + 0.25, x1 = WTIP - 0.15) => xs.filter((x) => x >= x0 && x <= x1).map((x) => [x, (() => { const w = wingAt(x); return w.le + f * (w.te - w.le); })()] as P2);
    const hinge = (x: number) => (x <= FLAP.x1 ? FLAP.hinge(Math.max(x, FLAP.x0)) : AIL.hinge(Math.min(Math.max(x, AIL.x0), AIL.x1)));
    /** the rear spar: just ahead of the flap and aileron hinges, on the tip cap at 70% of the chord */
    const rearSpar = (x: number) => {
      const w = wingAt(x);
      return x <= AIL.x1 ? Math.min(hinge(x) - 0.1, w.te - 0.15) : w.le + 0.7 * (w.te - w.le);
    };
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      // leading-edge skin, front and rear spars
      line(g, along(0.07).map(([x, z]) => M(x, z)), 1.1, SEAM_L);
      line(g, along(0.2).map(([x, z]) => M(x, z)), 1.2, SEAM);
      line(g, xs.map((x) => M(x, rearSpar(x))), 1.2, SEAM);
      // ribs between the spars
      for (const f of [0.18, 0.36, 0.54, 0.72, 0.88]) {
        const x = WROOT + 0.3 + f * (WTIP - WROOT - 0.5);
        const w = wingAt(x);
        line(g, [M(x, w.le + 0.2 * (w.te - w.le)), M(x, rearSpar(x))], 1.0, SEAM_L);
      }
      // the tip cap's joint, at the aileron's outboard end
      const tc = wingAt(AIL.x1);
      line(g, [M(AIL.x1, tc.le + 0.02), M(AIL.x1, tc.te - 0.02)], 1.1, SEAM);
      // flap and aileron hinge lines
      line(g, [M(FLAP.x0, FLAP.hinge(FLAP.x0)), M(FLAP.x1, FLAP.hinge(FLAP.x1))], 1.4, SEAM);
      line(g, [M(AIL.x0, AIL.hinge(AIL.x0)), M(AIL.x1, AIL.hinge(AIL.x1))], 1.4, SEAM);
      const sp = along(0.2);
      if (sp.length > 1) rivets(g, M(...sp[0]), M(...sp[sp.length - 1]), 0.07 * pt, 0.7, 'rgba(4,5,6,0.4)');
      for (const f of [0.38, 0.56]) {
        const r = along(f, WROOT + 0.25, WTIP - 0.6).filter(([x, z]) => z < rearSpar(x) - 0.05);
        if (r.length > 1) rivets(g, M(...r[0]), M(...r[r.length - 1]), 0.08 * pt, 0.65, 'rgba(4,5,6,0.32)');
      }
    }
    // access panels on top: fuel and hydraulic doors between the spars
    for (const [x0, x1, f0, f1] of [[WROOT + 0.35, WROOT + 0.9, 0.3, 0.42], [WROOT + 1.3, WROOT + 1.8, 0.45, 0.6], [WROOT + 2.3, WROOT + 2.7, 0.28, 0.38]] as [number, number, number, number][]) {
      const a = wingAt(x0), b = wingAt(x1);
      const pts: P2[] = [W(x0, a.le + f0 * (a.te - a.le)), W(x1, b.le + f0 * (b.te - b.le)), W(x1, b.le + f1 * (b.te - b.le)), W(x0, a.le + f1 * (a.te - a.le))];
      line(gt, pts, 1.0, SEAM, true);
    }
    // underneath: more doors (the jet's underside is covered in them)
    for (let k = 0; k < 6; k++) {
      const x0 = WROOT + 0.3 + k * 0.6, x1 = x0 + 0.38;
      if (x1 > WTIP - 0.3) break;
      const a = wingAt(x0), b = wingAt(x1);
      const f0 = 0.25 + (k % 2) * 0.2, f1 = f0 + 0.13;
      line(gb, [Wb(x0, a.le + f0 * (a.te - a.le)), Wb(x1, b.le + f0 * (b.te - b.le)), Wb(x1, b.le + f1 * (b.te - b.le)), Wb(x0, a.le + f1 * (a.te - a.le))], 0.9, SEAM, true);
    }
    // walkway on the wing root (a black outline) and NO STEP outboard of it
    {
      const r0 = wingAt(WROOT + 0.05), r1 = wingAt(WROOT + 0.75);
      line(gt, [W(WROOT + 0.05, r0.le + 0.28 * (r0.te - r0.le)), W(WROOT + 0.75, r1.le + 0.28 * (r1.te - r1.le)), W(WROOT + 0.75, r1.le + 0.52 * (r1.te - r1.le)), W(WROOT + 0.05, r0.le + 0.52 * (r0.te - r0.le))], 1.6, 'rgba(10,11,12,0.75)', true);
      const ns = (x: number, f: number) => {
        const w = wingAt(x);
        const [nx, ny] = W(x, w.le + f * (w.te - w.le));
        gt.save();
        gt.translate(nx, ny);
        gt.rotate(sx * -0.06);
        gt.fillStyle = 'rgba(160,165,168,0.85)';
        gt.font = `bold ${Math.max(5, 0.07 * pt)}px Arial`;
        gt.textAlign = 'center';
        gt.fillText('NO STEP', 0, 0);
        gt.restore();
      };
      ns(WROOT + 1.2, 0.4);
      ns(WROOT + 2.6, 0.12);
      ns(WROOT + 2.6, 0.62);
      ns(WTIP - 1.0, 0.3);
    }
    // a light outlined box along the leading edge on the outer wing (user3)
    {
      const x0 = WROOT + 0.55 * (WTIP - WROOT), x1 = x0 + 0.7;
      const a = wingAt(x0), b = wingAt(x1);
      line(gt, [W(x0, a.le + 0.1 * (a.te - a.le)), W(x1, b.le + 0.1 * (b.te - b.le)), W(x1, b.le + 0.16 * (b.te - b.le)), W(x0, a.le + 0.16 * (a.te - a.le))], 0.015 * pt, 'rgba(176,180,182,0.75)', true);
    }
  }

  // --- panel lines: stabilators and fins ---------------------------------------
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      const xs: number[] = [];
      for (let x = SROOT + 0.1; x <= STIP - 0.1; x += 0.2) xs.push(x);
      line(g, xs.map((x) => { const s = stabAt(x); return M(x, s.le + 0.09 * (s.te - s.le)); }), 1.0, SEAM_L);
      line(g, xs.map((x) => { const s = stabAt(x); return M(x, s.le + 0.42 * (s.te - s.le)); }), 1.1, SEAM);
      const tc = stabAt(STIP - 0.2);
      line(g, [M(STIP - 0.2, tc.le + 0.02), M(STIP - 0.2, tc.te - 0.02)], 1.0, SEAM_L);
    }
  }
  // fins (their sides take the side canvases): the leading-edge strip, the spars, the
  // tip cap with its fastener rows, a panel low down
  {
    const P = (h: number, f: number) => { const s = finAt(h); return S(s.le + f * (s.te - s.le), finY(h)); };
    const hs: number[] = [];
    for (let h = 0.06; h <= FIN_H - 0.06; h += 0.2) hs.push(h);
    line(gs, hs.map((h) => P(h, 0.08)), 1.0, SEAM_L);
    line(gs, hs.map((h) => P(h, 0.3 - 0.12 * (h / FIN_H))), 1.2, SEAM);
    // the rear spar: a little ahead of the rudder's hinge at the root, near the trailing edge at the tip
    const f0 = (RUDDER.hinge(0) - 0.25 - finAt(0).le) / (finAt(0).te - finAt(0).le);
    line(gs, hs.map((h) => P(h, f0 + (0.8 - f0) * (h / FIN_H))), 1.2, SEAM);
    const tc = FIN_H - 0.28;
    line(gs, [P(tc, 0.0), P(tc, 1.0)], 1.2, SEAM);
    const a = finAt(tc);
    rivets(gs, S(a.le + 0.05, finY(tc) - 0.04), S(a.te - 0.05, finY(tc) - 0.04), 0.05 * ps, 0.75, 'rgba(4,5,6,0.5)');
    rivets(gs, P(0.3, 0.3 - 0.012), P(FIN_H - 0.3, 0.18), 0.07 * ps, 0.7, 'rgba(4,5,6,0.42)');
    line(gs, [P(0.45, 0.12), P(0.45, 0.42), P(0.85, 0.42 - 0.02), P(0.85, 0.12)], 1.0, SEAM_L, true);
  }

  // --- the nose, close up: doors, probes' plates, static ports, latches -------------
  {
    const door = (z0: number, y0: number, z1: number, y1: number) => {
      rect(gs, S(z0, y0), S(z1, y1), 1.2, SEAM);
      screws(gs, S(z0 + 0.02, y0 + 0.02), S(z1 - 0.02, y1 - 0.02), 0.06 * ps);
    };
    door(RADOME_Z + 0.42, -0.34, windscreen - 0.2, 0.14);
    door(windscreen + 0.2, -0.33, ARCH_Z - 0.2, 0.02);
    door(ARCH_Z + 0.1, -0.42, BOW_Z - 0.4, -0.12);
    const plate = (z: number, y: number, r: number, fillCol: string) => {
      gs.fillStyle = fillCol;
      gs.beginPath();
      gs.arc(...S(z, y), r * ps, 0, Math.PI * 2);
      gs.fill();
      gs.strokeStyle = 'rgba(6,7,9,0.6)';
      gs.lineWidth = 1;
      gs.stroke();
    };
    plate(-6.95, 0.26, 0.04, 'rgba(96,100,104,0.55)'); // pitot base
    plate(-6.45, -0.12, 0.05, 'rgba(58,62,66,0.5)'); // AoA transmitter plate
    plate(-6.62, 0.14, 0.016, 'rgba(150,155,158,0.8)'); // static ports
    plate(-6.62, 0.07, 0.016, 'rgba(150,155,158,0.8)');
    // a hatch and drains under the forebody
    line(gb, [B(-0.22, RADOME_Z + 0.4), B(0.22, RADOME_Z + 0.4), B(0.22, RADOME_Z + 1.1), B(-0.22, RADOME_Z + 1.1)], 1.0, SEAM, true);
    // an antenna window on top of the nose, ahead of the windscreen
    const zc = (RADOME_Z + windscreen) / 2 + 0.06;
    rect(gt, T(-0.19, zc - 0.2), T(0.19, zc + 0.2), 1.1, SEAM);
    fill(gt, [T(-0.11, zc - 0.11), T(0.11, zc - 0.11), T(0.11, zc + 0.1), T(-0.11, zc + 0.1)], 'rgb(84,92,102)');
  }

  // --- weathering --------------------------------------------------------------------
  // (on a near-black paint the light patches -- dust, faded paint, dried fluid -- are what
  // shows, so they are kept faint; the dark grime is stronger)
  const grime = (g: CanvasRenderingContext2D, w: number, h: number, amount: number, dir: P2) => {
    for (let i = 0; i < 600 * amount; i++) {
      const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 70;
      const light = rnd() < 0.42;
      const a = light ? 0.008 + rnd() * 0.018 : 0.02 + rnd() * 0.045;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, light ? `rgba(150,152,150,${a.toFixed(3)})` : `rgba(6,6,6,${a.toFixed(3)})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineCap = 'round';
    for (let i = 0; i < 150 * amount; i++) {
      const x = rnd() * w, y = rnd() * h, len = 20 + rnd() * 160;
      g.strokeStyle = rnd() < 0.3 ? `rgba(140,138,132,${(0.008 + rnd() * 0.016).toFixed(3)})` : `rgba(8,7,6,${(0.03 + rnd() * 0.05).toFixed(3)})`;
      g.lineWidth = 1 + rnd() * 5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dir[0] * len, y + dir[1] * len);
      g.stroke();
    }
  };
  grime(gt, L.top.width, L.top.height, 1, [0, 1]);
  grime(gb, L.bot.width, L.bot.height, 0.9, [0, 1]);
  grime(gs, L.side.width, L.side.height, 1, [1, 0.1]);
  // fluid and grime streaks blown aft from the radome joint and the doors under the nose
  {
    const rs = prng(77);
    for (let i = 0; i < 9; i++) {
      const y = -0.42 + rs() * 0.4, z = RADOME_Z + 0.04 + rs() * 0.5, len = 0.4 + rs() * 0.9;
      const [x0, y0] = S(z, y), [x1] = S(z + len, y);
      const grd = gs.createLinearGradient(x0, y0, x1, y0);
      grd.addColorStop(0, `rgba(30,28,25,${(0.12 + rs() * 0.12).toFixed(2)})`);
      grd.addColorStop(1, 'rgba(30,28,25,0)');
      gs.fillStyle = grd;
      gs.fillRect(x0, y0 - 0.006 * ps, x1 - x0, (0.012 + rs() * 0.02) * ps);
    }
    for (let i = 0; i < 14; i++) {
      const x = -0.9 + rs() * 1.8, z = RADOME_Z + 0.1 + rs() * 7.5, len = 0.5 + rs() * 1.4;
      const [x0, y0] = B(x, z), [, y1] = B(x, z + len);
      const grd = gb.createLinearGradient(x0, y0, x0, y1);
      grd.addColorStop(0, `rgba(28,26,23,${(0.14 + rs() * 0.14).toFixed(2)})`);
      grd.addColorStop(1, 'rgba(28,26,23,0)');
      gb.fillStyle = grd;
      gb.fillRect(x0 - 0.008 * pb, y0, (0.016 + rs() * 0.025) * pb, y1 - y0);
    }
  }
  // heat: under the nacelles, from the engine bays' front frame to the nozzles, the doors
  // are bare heat-faded titanium, much lighter than the paint and browner aft (underside
  // and approach photos); soot round the nozzles
  for (const sx of [-1, 1]) {
    const z0 = 4.4, z1 = 8.58;
    const [xa, ya] = B(sx * 0.62, z0), [, yb] = B(sx * 0.62, z1);
    const grd = gb.createLinearGradient(xa, ya, xa, yb);
    grd.addColorStop(0, 'rgba(122,123,120,0.5)');
    grd.addColorStop(0.6, 'rgba(124,121,113,0.56)');
    grd.addColorStop(1, 'rgba(116,104,88,0.62)');
    fill(gb, [B(sx * 0.12, z0), B(sx * 1.12, z0), B(sx * 1.08, z1), B(sx * 0.16, z1)], grd);
    for (const z of [5.6, 6.9]) line(gb, [B(sx * 0.14, z), B(sx * 1.1, z)], 1.0, SEAM);
    line(gb, [B(sx * 0.62, z0), B(sx * 0.62, z1)], 0.9, SEAM_L);
    const rs = prng(sx > 0 ? 31 : 37);
    for (let i = 0; i < 18; i++) {
      const x = sx * (0.2 + rs() * 0.85), z = z0 + rs() * (z1 - z0 - 0.4), len = 0.3 + rs() * 0.9;
      const [x0, y0] = B(x, z), [, y1] = B(x, Math.min(z1, z + len));
      const sg = gb.createLinearGradient(x0, y0, x0, y1);
      sg.addColorStop(0, `rgba(40,34,26,${(0.15 + rs() * 0.2).toFixed(2)})`);
      sg.addColorStop(1, 'rgba(40,34,26,0)');
      gb.fillStyle = sg;
      gb.fillRect(x0 - 0.02 * pb, y0, (0.03 + rs() * 0.05) * pb, y1 - y0);
    }
    for (const [g, M, s] of [[gt, T, pt], [gb, B, pb]] as const) {
      const [x, y] = M(NOZ.x * sx, AFT_END); // soot on the aft body ahead of each nozzle root
      const sg = g.createLinearGradient(x, y - 1.6 * s, x, y);
      sg.addColorStop(0, 'rgba(24,20,16,0)');
      sg.addColorStop(1, 'rgba(24,20,16,0.45)');
      g.fillStyle = sg;
      g.fillRect(x - 0.62 * s, y - 1.6 * s, 1.24 * s, 1.6 * s);
    }
  }
  // fuel and hydraulic staining on the inboard wing tops between the spars (user3: a big brownish
  // smudge on the left wing's root), soft-edged and blotchy, heavier on the left wing
  for (const sx of [-1, 1]) {
    const rs = prng(sx < 0 ? 91 : 97);
    const n = sx < 0 ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const x = WROOT + 0.15 + rs() * 1.6, w = wingAt(x);
      const z = w.le + (0.3 + rs() * 0.4) * (w.te - w.le);
      const r = (0.18 + rs() * 0.35) * pt;
      const [cx, cy] = T(sx * x, z);
      const grd = gt.createRadialGradient(cx, cy, 0, cx, cy, r);
      const a = (sx < 0 ? 0.07 : 0.045) + rs() * 0.05;
      grd.addColorStop(0, `rgba(44,38,26,${a.toFixed(3)})`);
      grd.addColorStop(1, 'rgba(44,38,26,0)');
      gt.fillStyle = grd;
      gt.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
  }
  // gun gas: soot streaked back from the M61's port, which opens on the right trunk's wall
  // just above the wing's leading-edge root, over the root's top
  const zGun = junction.z - 0.22;
  {
    const xg = junction.x + 0.1;
    const [x0, y0] = T(xg, zGun), [, y1] = T(xg, zGun + 1.8);
    const grd = gt.createLinearGradient(x0, y0, x0, y1);
    grd.addColorStop(0, 'rgba(18,16,13,0.55)');
    grd.addColorStop(1, 'rgba(18,16,13,0)');
    gt.fillStyle = grd;
    fill(gt, [T(xg - 0.06, zGun), T(xg + 0.06, zGun), T(xg + 0.2, zGun + 1.8), T(xg - 0.1, zGun + 1.8)], grd);
  }

  // --- markings on the sides (both canvases) ---------------------------------
  L.copySides();
  {
    const [x0, y0] = S(zGun, 0.32), [x1] = S(zGun + 1.4, 0.32);
    const grd = L.gr.createLinearGradient(x0, y0, x1, y0);
    grd.addColorStop(0, 'rgba(18,16,13,0.5)');
    grd.addColorStop(1, 'rgba(18,16,13,0)');
    fill(L.gr, [S(zGun, 0.26), S(zGun, 0.4), S(zGun + 1.4, 0.48), S(zGun + 1.4, 0.2)], grd);
  }
  const blue = team === 'blue';
  // fin: the tip band (ET: white with maroon diamonds; LN: red), tail code, serial,
  // a small unit badge above the code
  {
    const hb0 = FIN_H - 0.5, hb1 = FIN_H - 0.3;
    const a = finAt(hb0), b = finAt(hb1);
    const band: P2[] = [S(a.le, finY(hb0)), S(a.te, finY(hb0)), S(b.te, finY(hb1)), S(b.le, finY(hb1))];
    for (const g of [L.gs, L.gr]) {
      fill(g, band, blue ? 'rgba(222,224,222,0.95)' : 'rgba(150,34,30,0.95)');
      if (blue) {
        for (let k = 0; k < 5; k++) {
          const f = 0.2 + k * 0.15, h = (hb0 + hb1) / 2, s = finAt(h);
          const [cx, cy] = S(s.le + f * (s.te - s.le), finY(h));
          const r = 0.075 * ps;
          fill(g, [[cx, cy - r], [cx + r * 0.7, cy], [cx, cy + r], [cx - r * 0.7, cy]], 'rgba(96,24,30,0.95)');
        }
      } else {
        line(g, [S(a.le, finY(hb0)), S(a.te, finY(hb0))], 0.02 * ps, 'rgba(12,13,15,0.9)');
        line(g, [S(b.le, finY(hb1)), S(b.te, finY(hb1))], 0.02 * ps, 'rgba(12,13,15,0.9)');
      }
    }
    const code = finAt(FIN_H * 0.62);
    L.sideText(blue ? 'ET' : 'LN', code.le + 0.56 * (code.te - code.le), finY(FIN_H * 0.62), 0.72 * ps, BLACK);
    // the serial: "AF" over the year beside the last three digits, as one block so it reads
    // the same way round on both sides
    const ser = finAt(FIN_H * 0.27);
    L.sideDraw(ser.le + 0.5 * (ser.te - ser.le), finY(FIN_H * 0.27), (g, x, y) => {
      g.fillStyle = BLACK;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${(0.46 * ps).toFixed(1)}px "Arial Narrow", Arial, sans-serif`;
      g.fillText(blue ? '256' : '315', x + 0.24 * ps, y);
      g.font = `bold ${(0.15 * ps).toFixed(1)}px "Arial Narrow", Arial, sans-serif`;
      g.fillText('AF', x - 0.42 * ps, y - 0.1 * ps);
      g.fillText(blue ? '90' : '91', x - 0.42 * ps, y + 0.09 * ps);
    });
    // the unit badge: a small shield outlined in black
    const ub = finAt(FIN_H * 0.77);
    L.sideDraw(ub.le + 0.5 * (ub.te - ub.le), finY(FIN_H * 0.77), (g, x, y) => {
      const r = 0.11 * ps;
      g.strokeStyle = 'rgba(12,13,15,0.75)';
      g.lineWidth = Math.max(1, 0.012 * ps);
      g.beginPath();
      g.moveTo(x - r * 0.8, y - r);
      g.lineTo(x + r * 0.8, y - r);
      g.lineTo(x + r * 0.8, y + r * 0.1);
      g.quadraticCurveTo(x + r * 0.7, y + r * 0.8, x, y + r * 1.1);
      g.quadraticCurveTo(x - r * 0.7, y + r * 0.8, x - r * 0.8, y + r * 0.1);
      g.closePath();
      g.stroke();
    });
  }
  // the coalition insignia, low-visibility: on the intake trunk, and on the left wing
  // on top and the right one underneath (USAF practice)
  const lowVis = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    g.save();
    g.translate(x, y);
    g.strokeStyle = 'rgba(170,175,178,0.9)';
    g.lineWidth = Math.max(1, r * 0.07);
    g.beginPath();
    g.arc(0, 0, r * 0.94, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    if (blue) {
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r * 0.78 : r * 0.27;
        if (i === 0) g.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
        else g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
      }
    } else {
      g.moveTo(0, -r * 0.7);
      g.lineTo(r * 0.64, r * 0.45);
      g.lineTo(-r * 0.64, r * 0.45);
    }
    g.closePath();
    g.fillStyle = blue ? 'rgba(58,86,140,0.95)' : 'rgba(140,46,40,0.95)';
    g.fill();
    g.lineWidth = Math.max(1, r * 0.05);
    g.stroke();
    g.restore();
  };
  {
    const yi = T_TOP(INTAKE_MOUTH) - 0.27, zi = lip(yi) + 0.95;
    L.sideDraw(zi, yi, (g, x, y) => lowVis(g, x, y, 0.21 * ps));
    const xw = WROOT + 0.62 * (WTIP - WROOT), w = wingAt(xw);
    lowVis(gt, ...T(-xw, w.le + 0.5 * (w.te - w.le)), 0.42 * pt);
    lowVis(gb, ...B(xw, w.le + 0.5 * (w.te - w.le)), 0.42 * pb);
  }
  // intake: CAUTION / WARNING blocks behind the lip; the canopy sill's stencils; the
  // ejection-seat warning triangles under each cockpit; the rescue arrow
  for (const g of [L.gs, L.gr]) {
    // (ahead of the insignia, clear of the swept side plate's edge and of the tank below)
    const ys = T_TOP(INTAKE_MOUTH) - 0.32;
    stencilBlock(g, ...S(lip(ys) + 0.42, ys), 0.22 * ps, 4, 0.02 * ps);
    stencilBlock(g, ...S(lip(0.12) + 0.4, 0.12), 0.2 * ps, 3, 0.02 * ps);
    stencilBlock(g, ...S(windscreen + 0.55, RAIL(windscreen + 0.55) - 0.14), 0.36 * ps, 3, 0.016 * ps, 'rgba(150,155,158,0.75)');
    for (const eye of [EYE_FRONT, EYE_REAR]) {
      const [x, y] = S(eye.z + 0.25, RAIL(eye.z + 0.25) - 0.13);
      const r = 0.06 * ps;
      fill(g, [[x, y - r], [x + r, y + r * 0.75], [x - r, y + r * 0.75]], 'rgba(200,204,206,0.95)');
      fill(g, [[x, y - r * 0.45], [x + r * 0.5, y + r * 0.5], [x - r * 0.5, y + r * 0.5]], 'rgba(150,30,28,0.95)');
    }
  }
  L.sideText('RESCUE', windscreen + 1.25, RAIL(windscreen + 1.25) - 0.15, 0.045 * ps, red);
  L.sideText('DANGER', lip(T_TOP(INTAKE_MOUTH) - 0.12) + 0.42, T_TOP(INTAKE_MOUTH) - 0.12, 0.04 * ps, red);
  // probe stencils, legible only up close (as on the jet)
  L.sideText('PITOT HEAT', -6.86, 0.37, 0.04 * ps, STEN);
  L.sideText('AOA', -6.45, -0.24, 0.04 * ps, STEN);
  // the AAR receptacle in the left glove, just ahead of the wing root: a white outline
  // round its door, a lead-in line and bar forward of it, the boom operator's numbers on
  // both intake tops, a strip of light bars; two orange squares on the deck inboard of it
  // (user3)
  {
    const WHITE = 'rgba(226,228,226,0.95)';
    const zr = junction.z - 0.3, xr = -(T_OUT(zr) - 0.36);
    const hw = 0.16, hl = 0.21, rc = 0.05;
    const door: P2[] = [];
    const corner = (cx: number, cz: number, a0: number) => {
      for (let k = 0; k <= 4; k++) {
        const an = a0 + (k / 4) * (Math.PI / 2);
        door.push(T(cx + Math.cos(an) * rc, cz + Math.sin(an) * rc));
      }
    };
    // (a little narrower at the front)
    corner(xr + hw - 0.02 - rc, zr - hl + rc, -Math.PI / 2);
    corner(xr + hw - rc, zr + hl - rc, 0);
    corner(xr - hw + rc, zr + hl - rc, Math.PI / 2);
    corner(xr - hw + 0.02 + rc, zr - hl + rc, Math.PI);
    fill(gt, door, 'rgba(16,17,19,0.9)');
    line(gt, door, 0.032 * pt, WHITE, true);
    line(gt, [T(xr + 0.04, zr - hl), T(xr + 0.04, zr - hl - 0.38)], 0.03 * pt, WHITE);
    line(gt, [T(xr - 0.22, zr - hl - 0.38), T(xr + 0.16, zr - hl - 0.38)], 0.03 * pt, WHITE);
    for (const sx of [-1, 1]) {
      const zn = zr - 0.95, xn = sx * ((T_IN(zn) + T_OUT(zn)) / 2 + 0.05);
      gt.save();
      gt.translate(...T(xn, zn));
      gt.rotate((-Math.PI / 2) * sx);
      gt.fillStyle = 'rgba(214,216,214,0.92)';
      gt.font = `bold ${Math.max(5, 0.1 * pt)}px Arial`;
      gt.textAlign = 'center';
      gt.textBaseline = 'middle';
      gt.fillText(blue ? '90256' : '91315', 0, 0);
      gt.restore();
      for (let k = 0; k < 6; k++) fill(gt, [T(xn - sx * 0.2, zn + 0.3 + k * 0.07), T(xn - sx * 0.27, zn + 0.3 + k * 0.07), T(xn - sx * 0.27, zn + 0.34 + k * 0.07), T(xn - sx * 0.2, zn + 0.34 + k * 0.07)], 'rgba(150,154,156,0.8)');
    }
    // (the orange squares on the deck left of the spine, a little behind the canopy)
    const sq = (x: number, z: number, h: number) => fill(gt, [T(x - h, z - h), T(x + h, z - h), T(x + h, z + h), T(x - h, z + h)], 'rgba(226,92,34,0.95)');
    sq(-0.95, canopyTail + 0.85, 0.07);
    sq(-1.12, canopyTail + 1.2, 0.11);
  }
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
  // the factory finish: near-black gunship grey, a dark metallic paint (the radome, a
  // composite shell, is plain satin paint a shade darker: see the skin shader)
  const paint = skinMaterial({
    top: new THREE.Color('#434548'), bottom: new THREE.Color('#434548'), livery: L, roughness: 0.44, metalness: 0.58, paintLift: 2.0,
    radomeZ: RADOME_Z, radomeTip: -9.86, radomeAxis: [-0.13, 0.075], radomeTint: [0.54, 0.55, 0.57],
    seamRel: 1.1, markPaint: 1,
  });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  // --- fuselage ---------------------------------------------------------------
  // (dense where the deck spreads across the trunk tops)
  const zs = mergeStations(stations(-9.86, -7.4, 34, 0.55, 0), stations(-7.4, -2.5, 60), stations(-2.6, -1.9, 14), stations(-2.5, AFT_END, 80));
  // (the tip closed: an open 2 cm ring there showed as a hole)
  const body = loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capStart: true, capEnd: true });
  skin(body);
  v.fuselageSections = sectionsFromProfile(BODY, -9.5, 8.5, 40);

  // intake trunks: big rectangular mouths beside the rear cockpit, tucked in under the shoulders with a
  // boundary-layer gap to the fuselage. The mouth is raked hard (see MW and trunkLoop): the top lip, the
  // first ramp's sharp leading edge, juts out ahead and the thin side plates sweep back from it to the
  // cowl lip. The duct is long and goes dark toward the fan, which is only just made out.
  const trunk = trunkGeometry();
  skin(both(trunk.skin));
  const ductMat = intakeDuctMaterial();
  v.addMesh(both(trunk.duct), ductMat).userData.detail = true;
  v.addMesh(both(rampGeometry()), ductMat).userData.detail = true;
  const splitter = splitterGeometry();
  skin(both(splitter.plate));
  v.addMesh(both(splitter.lining), ductMat).userData.detail = true;

  // conformal fuel tanks on the outside of each trunk (see cftSection)
  const cft = loftProfile({ stations: stations(CFT_TIP, CFT_END, 110, 0.3, 0.2), profile: cftSection, sub: CFT_SUB, full: true, capStart: true, capEnd: true });
  skin(both(cft));

  // pods under the intakes (hero detail): a Sniper targeting pod on the left trunk and a navigation pod
  // on the right, each on a short adapter pylon from the trunk's flat bottom
  {
    const podGlass = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.12, metalness: 0.65 });
    for (const [sx, kind, z0, len, r] of [[-1, 'sniper', -1.62, 2.39, 0.15], [1, 'nav', -1.5, 1.99, 0.155]] as const) {
      const cx = 1.2, top = (z: number) => T_BOT(z);
      const cy = T_BOT(z0 + 0.6) - 0.17 - r;
      const p = podGeometry(cx, cy, z0, len, r, kind);
      // the adapter: a blade with rounded edges, lens-shaped in plan, from inside the trunk to the pod
      const pz0 = z0 + 0.42, pz1 = z0 + len - 0.55, pm0 = (pz0 + pz1) / 2, ph = (pz1 - pz0) / 2;
      const yTop = Math.max(top(pz0), top(pz1)) + 0.05, yBot = cy + r - 0.03;
      const pyl = loftProfile({
        stations: stations(pz0, pz1, 12),
        profile: (z) => rrect(cx, (yTop + yBot) / 2, 0.05 * Math.pow(Math.max(0, 1 - Math.pow((z - pm0) / ph, 4)), 0.5) + 0.004, (yTop - yBot) / 2, 0.02, 2),
        sub: 1,
        full: true,
        capStart: true,
        capEnd: true,
      });
      for (const [g, m] of [[join([p.body, pyl]), paint], [p.glass, podGlass]] as const) {
        const geo = sx < 0 ? mirror(stamp(g)) : stamp(g);
        v.addMesh(geo, m).userData.detail = true;
      }
    }
  }

  // tail booms outboard of the nacelles (fins and stabilators hang off them)
  const boom = loftProfile({
    // (see boomSection; denser where the wall fairs out behind the flap, steps in at the stabilator and closes behind the fin)
    stations: mergeStations(stations(BOOM_Z0, BOOM_Z1, 64, 0.1, 0.2), stations(5.0, 5.45, 5), stations(6.6, 7.1, 6), stations(8.6, 9.1, 10)),
    profile: boomSection,
    sub: 3,
    full: true,
    capStart: true,
    capEnd: true,
  });
  skin(both(boom));

  // dorsal spine / speedbrake: the spine is part of the body; the big speedbrake behind the canopy
  // lies flush on it (a shell 6 mm proud, its edges sunk into the skin so it reads as a panel line,
  // not a raised lid), built on the body's own lofted surface so it follows the spine wherever it goes
  const bodySub: number[] = [];
  for (let i = 0; i < 14; i++) bodySub.push(BODY_SUB[i] ?? 2);
  const bodyRingSub = [...bodySub, ...[...bodySub].reverse()];
  /** the body's top surface height at x (as lofted) at station z */
  const skinTop = (z: number, x: number): number => {
    const pts = ring(mirrorHalf(BODY(z)), bodyRingSub);
    let best = -9;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((x0 - x) * (x1 - x) <= 0 && x0 !== x1) best = Math.max(best, y0 + ((x - x0) / (x1 - x0)) * (y1 - y0));
    }
    return best;
  };
  /** the body's half-width at height y (as lofted) at station z */
  const skinSide = (z: number, y: number): number => {
    const pts = ring(mirrorHalf(BODY(z)), bodyRingSub);
    let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) best = Math.max(best, x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
    return best;
  };
  const SB_Z0 = -1.45, SB_Z1 = 1.0, SB_W = 0.49;
  const sbXs = [0, 0.08, 0.16, 0.24, 0.31, 0.37, 0.42, 0.455, 0.475];
  const sbProfile = (z: number): P2[] => {
    // (the ends sink into the skin like the sides)
    const endK = Math.min(1, (z - SB_Z0) / 0.04, (SB_Z1 - z) / 0.04);
    const w = SB_W;
    const lift = (x: number) => -0.002 + 0.008 * endK * Math.min(1, (w - x) / 0.035);
    const under = sbXs.map((x) => [x, skinTop(z, x) - 0.014] as P2);
    const over = sbXs.map((x) => [x, skinTop(z, x) + lift(x)] as P2).reverse();
    return [...under, [w, skinTop(z, w) - 0.006], ...over];
  };
  const sbGeo = stamp(loftProfile({ stations: stations(SB_Z0, SB_Z1, 30), profile: sbProfile, sub: 1, capStart: true, capEnd: true }));
  const sb = v.addSurface(sbGeo, paint, new THREE.Vector3(0, skinTop(SB_Z0, 0) + 0.004, SB_Z0), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(sb), 1);
  v.speedbrake = { pivot: sb.pivot, axis: new THREE.Vector3(-1, 0, 0), maxDeg: 45 };

  // --- canopy, seats, pilots -------------------------------------------------------
  v.cockpitEye.copy(EYE_FRONT);
  // (the frames in the dark frame grey, as on the jet: in the photos they read darker than the paint)
  buildCanopy(v, CANOPY, ARCH_Z, [BOW_Z], pm.frame);
  // the windscreen's thick rear frame and the thin bow between the cockpits, as bands hugging the
  // glass (the canopy builder's round tubes alone read as wire hoops beside the photos' frames)
  const glassSec = (z: number) => {
    const y = RAIL(z) + 0.03;
    return { w: CANOPY_W(z), y, top: Math.max(0.01, CROWN(z) - y), n: CANOPY_N(z) };
  };
  const frameBand = (zc: number, width: number, proud: number): THREE.BufferGeometry => {
    const N = 48;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const th = 0.015 + ((Math.PI - 0.03) * i) / N;
      const c = Math.cos(th), sn = Math.sin(th);
      for (const dz of [-width / 2, width / 2]) {
        const g = glassSec(zc + dz);
        const ex = 2 / g.n;
        const x = g.w * Math.sign(c) * Math.pow(Math.abs(c), ex);
        const y = g.y + g.top * Math.pow(sn, ex);
        // the superellipse's outward normal
        const nx = (Math.sign(x) * Math.pow(Math.abs(x / g.w), g.n - 1)) / g.w;
        const ny = Math.pow(Math.max(0, (y - g.y) / g.top), g.n - 1) / g.top;
        const l = Math.hypot(nx, ny) || 1;
        pos.push(x - (nx / l) * 0.004, y - (ny / l) * 0.004, zc + dz, x + (nx / l) * proud, y + (ny / l) * proud, zc + dz);
      }
    }
    // four vertices a sample: front inner, front outer, back inner, back outer
    const q = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
    for (let i = 0; i < N; i++) {
      const a = i * 4, b = a + 4;
      q(a + 1, b + 1, b + 3, a + 3); // outside
      q(a, b, b + 1, a + 1); // front
      q(a + 2, a + 3, b + 3, b + 2); // back
      q(a, a + 2, b + 2, b); // inside
    }
    q(0, 1, 3, 2);
    q(N * 4, N * 4 + 2, N * 4 + 3, N * 4 + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const bands = v.addMesh(join([frameBand(ARCH_Z, 0.09, 0.022), frameBand(BOW_Z, 0.032, 0.016)]), pm.frame);
  v.hideInCockpit.push(bands);
  // the cockpits seen through the glass: a dark lining just inside the body's well under the canopy
  // (the well's walls otherwise take the fuselage's side paint and read light grey)
  {
    const zs = stations(-5.9, -2.3, 30);
    const rings: P2[][] = [];
    for (const z of zs) {
      const p = BODY(z);
      const half: P2[] = [];
      const mir: P2 = [-p[13][0], p[13][1]];
      for (let k = 0; k < 8; k++) half.push(crSeg(p[11], p[12], p[13], p[14], k / 8, [0, 0]));
      for (let k = 0; k < 8; k++) half.push(crSeg(p[12], p[13], p[14], mir, k / 8, [0, 0]));
      half.push([0, p[14][1]]);
      // 8 mm in from the skin, along the inward normal
      const ins = half.map((pt, k) => {
        const a = half[Math.max(0, k - 1)], b = half[Math.min(half.length - 1, k + 1)];
        const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
        return [pt[0] + (ty / l) * 0.008, pt[1] - (tx / l) * 0.008] as P2;
      });
      rings.push([...ins, ...ins.slice(0, -1).reverse().map(([x, y]) => [-x, y] as P2)]);
    }
    const pos: number[] = [];
    const idx: number[] = [];
    const n = rings[0].length;
    rings.forEach((r, i) => r.forEach(([x, y]) => pos.push(x, y, zs[i])));
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j, b = a + n;
        idx.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const lining = v.addMesh(g, new THREE.MeshStandardMaterial({ color: 0x26292c, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide }));
    v.hideInCockpit.push(lining);
  }
  for (const eye of [EYE_FRONT, EYE_REAR]) {
    addPilot(v, eye.clone(), 0.2, { style: 'us', stick: 'center', martinBaker: false });
  }
  // instrument panel shroud / glareshield at the front of the well, under the windscreen
  // (it runs forward to the windscreen's base on the closed coaming, and stays inside the glass)
  const SH0 = EYE_FRONT.z - 1.42, SH1 = EYE_FRONT.z - 0.62;
  const shroud = loftProfile({
    stations: stations(SH0, SH1, 10),
    profile: (z) => {
      const u = sstep(SH0, SH1, z);
      const top = EYE_FRONT.y - 0.2 - (1 - u) * 0.14;
      const w = CANOPY_W(z) - 0.07;
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
  // the wing with its flaps and ailerons out to the tip cap's joint, then the cap: the wing carried on
  // to the tip and cut off by the raked edge, which is rounded
  const panels = wingPanels([...WING.filter((s) => s.x < WING_CAP), wingSt(WING_CAP)], [
    { x0: FLAP.x0, x1: FLAP.x1, hinge: FLAP.hinge, kind: 'flap', maxDeg: 30 },
    { x0: AIL.x0, x1: AIL.x1, hinge: AIL.hinge, kind: 'aileron', maxDeg: 20 },
  ], { ...WING_OPT, tip: 'flat' });
  skin(both(panels.fixed));
  const tipCap = wing({ ...WING_OPT, sections: [wingSt(WING_CAP), wingSt(WING_TIP.cornerX), wingSt(WING_TIP.x)], back: wingRake, backRound: true, tip: 'round', root: 'flat', spanSub: 10 });
  skin(both(tipCap));
  // on the tip's leading corner a small white antenna fairing pointing forward, and the position light's
  // lens just behind it on the tip's outer edge (red on the left, green on the right: the game's
  // position light itself, so it glows at night, shaped to the lens)
  {
    const yLe = wingY(WING_TIP.x) - wingDroop(WING_TIP.x);
    const z0 = WING_TIP.le;
    const ant = lathe([[0.003, z0 - 0.13], [0.022, z0 - 0.115], [0.035, z0 - 0.075], [0.04, z0 - 0.01], [0.039, z0 + 0.1], [0.03, z0 + 0.17], [0.003, z0 + 0.2]], 16, WING_TIP.x - 0.012, yLe - 0.012);
    v.addMesh(both(ant), new THREE.MeshStandardMaterial({ color: 0xd9d8d0, roughness: 0.5, metalness: 0 }));
    for (const side of [1, -1]) {
      v.addNavLight(new THREE.Vector3(side * (WING_TIP.x + 0.012), yLe + 0.004, z0 + 0.25), side > 0 ? 'green' : 'red');
      // (the light's mesh is a 0.08 m sphere: down to a 3 cm lens, long fore and aft)
      v.body.children[v.body.children.length - 1].scale.set(0.17, 0.22, 0.56);
      // the small red lens set in each leading edge just outboard of the root
      const rl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0x8a2420, roughness: 0.15, metalness: 0, emissive: 0x3c0806 }));
      rl.scale.set(1.6, 0.55, 0.9);
      rl.rotation.y = side * Math.PI / 4;
      rl.position.set(side * 2.22, wingY(2.22), 2.22 + WING_LE0 + 0.012);
      v.body.add(rl);
    }
  }
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
    v.addSurface(g, paint, new THREE.Vector3(1.8 * side, -0.02, STAB_PIVOT_Z), new THREE.Vector3(1, 0, 0), 'stab', side, 22);
  }

  // fins with rudders. The root thickens into the boom (the fins' thick root fairings, 0.4 m up where
  // the boom's top is): stations on the fin's own leading and trailing edges.
  const finAt = (h: number, t: number): WingStation => {
    const [a, b] = FIN, u = (h - a.x) / (b.x - a.x);
    return { x: h, le: a.le + (b.le - a.le) * u, te: a.te + (b.te - a.te) * u, t };
  };
  const finSecs = [finAt(-0.1, 0.08), finAt(0.4, 0.074), finAt(1.0, 0.05), FIN[1]];
  const tipH = FIN[1].x, tipLE = FIN[1].le, tipTE = FIN[1].te;
  for (const side of [1, -1] as const) {
    const m = finMatrix(FIN_ROOT.x * side, FIN_ROOT.y, FIN_ROOT.cant, side);
    const f = finPanels(finSecs, RUDDER, m, { chordPts: 28, sink: 0.2 });
    skin(f.fixed);
    v.addSurface(stamp(f.rudder.geo), paint, f.rudder.hinge, f.rudder.axis, 'rudder', side, 25);
    // tip fairings (F-15EX): a long antenna pod along the tip, its round nose well ahead of the
    // leading edge and its end just past the trailing edge, with two aft-facing antenna stubs under
    // it on the trailing edge. The left pod is the longer, fatter one (as on the F-15E).
    const top = new THREE.Vector3(tipH, 0, 0).applyMatrix4(m);
    const R = side < 0 ? 0.072 : 0.064;
    const zN = tipLE - (side < 0 ? 0.42 : 0.34), zA = tipTE + 0.05;
    const py = top.y + 0.03;
    const pod = lathe(
      [
        [0.004, zN],
        [R * 0.34, zN + 0.025],
        [R * 0.64, zN + 0.08],
        [R * 0.87, zN + 0.17],
        [R * 0.98, zN + 0.3],
        [R, zN + 0.45],
        [R, zA - 0.12],
        [R * 0.92, zA - 0.05],
        [R * 0.62, zA - 0.012],
        [0.004, zA],
      ],
      16,
      top.x,
      py,
    );
    skin(pod);
    // the stubs: short cylinders out of the trailing edge, dark antenna caps on their ends
    const caps: THREE.BufferGeometry[] = [];
    for (const dh of [0.15, 0.31]) {
      const h = tipH - dh, y = FIN_ROOT.y + h;
      const zt = FIN[0].te + (tipTE - FIN[0].te) * (h / tipH);
      const r = 0.031, z0 = zt - 0.2, z1 = zt + 0.11;
      skin(lathe([[0.004, z0], [r, z0 + 0.03], [r, z1 - 0.025], [r * 0.9, z1 - 0.012]], 12, top.x, y));
      caps.push(lathe([[r * 0.9, z1 - 0.014], [r * 0.7, z1 - 0.002], [0.004, z1 + 0.004]], 12, top.x, y));
    }
    v.addMesh(join(caps), pm.antenna);
    v.addNavLight(new THREE.Vector3(top.x, py, zA - 0.025), 'formation');
  }

  // --- engines -----------------------------------------------------------------------
  // Two bare F110 nozzles (no turkey feathers, as on the photos) between the booms, 0.75 m ahead of
  // the boom tails and the stabilators' roots: the stabilators reach a good metre past the exits.
  // (their own material: the bare shroud and flaps are dull, sooty metal in the photos, not the bright
  // polished finish of the other jets' feathered nozzles)
  const bareNozzleMat = pm.nozzle.clone();
  bareNozzleMat.roughness = 0.8;
  bareNozzleMat.metalness = 0.38;
  for (const sx of [-1, 1]) {
    const nz = nozzle({ cx: NOZ.x * sx, cy: NOZ.y, z0: NOZ.z0, z1: NOZ.z1, r0: NOZ.r0, r1: NOZ.r1, petals: 16, saw: 0.05, floor: AFT_END, bare: { shroud: 0.52 } });
    const nzOut = v.addMesh(nz.outer, bareNozzleMat);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.nozzles.push({ pos: new THREE.Vector3(NOZ.x * sx, NOZ.y, NOZ.z1 - 0.1), radius: 0.44, depth: NOZ.z1 - 0.1 - AFT_END, area: nz.area });
  }
  v.buildFlames(6.2);

  // --- gun, probes, antennas, lights ----------------------------------------------------
  // M61 port on the right wing root: the muzzle opens in the front of a blister on the trunk's wall just above
  // the leading edge's root, the blister running back into the wing's upper surface
  const GUN = { x: 1.81, y: 0.31, z: -0.84 };
  const gunFair = lathe([[0.06, GUN.z], [0.071, GUN.z + 0.035], [0.078, GUN.z + 0.11], [0.073, GUN.z + 0.28], [0.052, GUN.z + 0.45], [0.024, GUN.z + 0.6], [0.004, GUN.z + 0.68]], 16, GUN.x, GUN.y);
  skin(gunFair);
  const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), pm.darkMetal);
  muzzle.position.set(GUN.x, GUN.y, GUN.z + 0.03);
  muzzle.rotation.y = Math.PI;
  v.body.add(muzzle);
  // probes on the forebody sides, off the photos: low down an L-shaped pitot-static boom (a short stem
  // out of the skin, then the tube forward), and higher up and further aft the conical angle-of-attack
  // probe sticking straight out; both seated on the skin as lofted
  const probeSet: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const pz = -6.45, py = -0.16;
    const base = new THREE.Vector3(sx * (skinSide(pz, py) - 0.006), py, pz);
    const out = new THREE.Vector3(sx, -0.3, 0).normalize();
    const elbow = base.clone().addScaledVector(out, 0.075);
    probeSet.push(probe(base, 0.075, 0.011, out), probe(elbow, 0.27, 0.009, new THREE.Vector3(sx * 0.03, 0, -1).normalize()));
    const az = -6.2, ay = 0.25;
    probeSet.push(probe(new THREE.Vector3(sx * (skinSide(az, ay) - 0.006), ay, az), 0.12, 0.012, new THREE.Vector3(sx, 0.05, -0.35).normalize()));
  }
  const probes = join(probeSet);
  v.addMesh(probes, pm.antenna);
  // blade antennas (painted like the jet), standing on the body's top and belly centre lines
  const topY = (z: number) => { const p = BODY(z); return p[p.length - 1][1]; };
  const belly = (z: number) => BODY(z)[0][1];
  const ant = join([
    blade(new THREE.Vector3(0, topY(1.3) - 0.01, 1.3), 0.22, 0.32),
    blade(new THREE.Vector3(0, topY(3.6) - 0.01, 3.6), 0.16, 0.26),
    blade(new THREE.Vector3(0, belly(1.8) + 0.01, 1.8), 0.22, 0.3, new THREE.Vector3(0, -1, 0)),
    blade(new THREE.Vector3(0, belly(-3.2) + 0.01, -3.2), 0.16, 0.24, new THREE.Vector3(0, -1, 0)),
  ]);
  skin(ant);
  // formation ("slime") lights: 0.6 m strips on the forebody's sides under the front cockpit,
  // halfway down the side (lit in user2), and on the conformal tanks' outer sides
  const sideX = (z: number, y: number) => {
    const p = BODY(z);
    for (let i = 0; i < p.length - 1; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[i + 1];
      if ((y0 - y) * (y1 - y) <= 0 && y1 !== y0) return x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
    }
    return p[Math.floor(p.length / 2)][0];
  };
  const fz = CANOPY[0].z + 1.0, fy = 0.1;
  const fx = Math.max(sideX(fz - 0.3, fy), sideX(fz, fy), sideX(fz + 0.3, fy));
  // (on the tank's widest line, read off the tank itself, clear of it over the strip's length)
  const cp = cft.attributes.position;
  const cz = 2.2;
  let cx = 0, cy = 0;
  for (let i = 0; i < cp.count; i++) {
    if (Math.abs(cp.getZ(i) - cz) > 0.34) continue;
    if (cp.getX(i) > cx) {
      cx = cp.getX(i);
      cy = cp.getY(i);
    }
  }
  const fl = join([
    formationStrip(new THREE.Vector3(fx, fy, fz), new THREE.Vector3(1, 0.02, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.07),
    formationStrip(new THREE.Vector3(-fx, fy, fz), new THREE.Vector3(-1, 0.02, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.07),
    formationStrip(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.07),
    formationStrip(new THREE.Vector3(-cx, cy, cz), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), 0.6, 0.07),
  ]);
  // (lit, as in user2: the electroluminescent strips glow lime green; hidden with the other detail far off)
  const flMat = new THREE.MeshBasicMaterial({ color: 0x8cd431, transparent: true, opacity: 0.85 });
  v.addMesh(fl, flMat, v.body, false).userData.detail = true;
  // (the wingtip position lights are the tip lenses, added with the wing); the strobes, small
  // (the light's mesh is scaled down after it is added)
  const navLight = (p: THREE.Vector3, kind: 'red' | 'green' | 'strobe', scale: number) => {
    v.addNavLight(p, kind);
    v.body.children[v.body.children.length - 1].scale.setScalar(scale);
  };
  navLight(new THREE.Vector3(0, topY(4.8) + 0.04, 4.8), 'strobe', 0.6);
  navLight(new THREE.Vector3(0, belly(1.0) - 0.04, 1.0), 'strobe', 0.6);

  // --- landing gear ----------------------------------------------------------------------
  const noseTop = new THREE.Vector3(0, -0.56, -3.92);
  const legs0 = v.gear.length;
  buildGearSet(v, {
    nose: { top: noseTop, axle: new THREE.Vector3(0, -2.05 + 0.33, -4.25), r: 0.33, w: 0.19, twin: false, retract: 'forward' },
    mains: { top: new THREE.Vector3(1.3, -0.78, 0.8), axle: new THREE.Vector3(1.42, -2.05 + 0.43, 1.2), r: 0.43, w: 0.27, retract: 'forward', outboard: 0.12 },
    doorColor: '#41464b',
  });
  // the nose gear doors' inner faces are white, with the jet's last four digits in black (the
  // ground photos); thin panels on the inside of buildGearSet's two doors (0.34 x 0.9 m, 1.4 cm
  // thick, 0.19 m either side of the strut), on the nose leg so they fold away with it
  {
    const leg = v.gear[legs0];
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e4e5e2';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#17181b';
    g.font = 'bold 96px "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(team === 'blue' ? '0256' : '1315', c.width / 2, c.height / 2 + 6);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.05 });
    /** a panel (body frame: centre, size along z and y, facing +x or -x) on a gear leg's pivot */
    const face = (pivot: THREE.Object3D, c: THREE.Vector3, lz: number, ly: number, facing: number, mat: THREE.Material) => {
      const pl = new THREE.PlaneGeometry(lz, ly);
      pl.rotateY((facing * Math.PI) / 2);
      pl.translate(c.x, c.y, c.z);
      const m = new THREE.Mesh(pl, mat);
      // (placed as addGearLeg places its parts: geometry in the body frame, the mesh offset by the hinge)
      m.position.sub(pivot.position);
      pivot.add(m);
    };
    for (const sx of [-1, 1]) face(leg.pivot, new THREE.Vector3(sx * (0.19 - 0.0085), noseTop.y - 0.16, noseTop.z - 0.15), 0.86, 0.3, -sx, faceMat);
    // the main gear: the door on each leg (outboard of the strut, its inside facing it) and the bay
    // door beside the bay (its inside facing outboard while open), white inside as well
    const white = new THREE.MeshStandardMaterial({ color: 0xdfe0dd, roughness: 0.6, metalness: 0.05 });
    for (const [k, sx] of [[1, -1], [3, 1]] as const) {
      const mainLeg = v.gear[legs0 + k], bayDoor = v.gear[legs0 + k + 1];
      if (mainLeg) face(mainLeg.pivot, new THREE.Vector3(sx * (1.46 - 0.0095), -1.14, 0.95), 0.76, 0.58, -sx, white);
      if (bayDoor) face(bayDoor.pivot, new THREE.Vector3(sx * (0.9 + 0.0095), -0.99, 0.9), 1.06, 0.38, sx, white);
    }
  }
}
