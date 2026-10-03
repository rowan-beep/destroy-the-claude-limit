// North American X-15: 15.3 m long, 6.8 m span, 4.0 m tall.
// A long round fuselage with the propellant tanks inside it, and a deep
// fairing (the "side tunnels") along each side carrying the plumbing and
// wiring; a small canopy faired into the top; short trapezoid wings; wedge-
// shaped upper and lower fins (thick, blunt trailing edges that work at
// Mach 6); all-moving tailplanes with strong anhedral; the "ball nose" air-
// data sensor at the tip; and the XLR99 rocket's bell nozzle in the blunt
// base. Black Inconel X skin, a NASA yellow band on the fin, U.S. AIR FORCE
// along the side.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section } from './builder';
import { P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, Livery, skinMaterial, line, rivets, weather, prng, LINE, LINE_LIGHT } from './kit';
import { nozzle, partMaterials, blade, probe } from './parts';
import { buildCanopy, buildGearSet, wingPanels, sectionsFromProfile } from './common';

/**
 * Fuselage cross-section, right half, 12 points bottom centre -> top centre:
 * a round body of radius R with the side tunnel (half-width R + w) bulging
 * out a little below the middle.
 */
function tunnelled(R: number, w: number): P2[] {
  return [
    [0, -R],
    [0.45 * R, -0.89 * R],
    [0.78 * R + 0.2 * w, -0.62 * R],
    [0.92 * R + 0.75 * w, -0.4 * R],
    [R + w, -0.2 * R],
    [R + w, 0.08 * R],
    [0.93 * R + 0.7 * w, 0.3 * R],
    [0.8 * R + 0.15 * w, 0.6 * R],
    [0.58 * R, 0.81 * R],
    [0.3 * R, 0.95 * R],
    [0.12 * R, 0.99 * R],
    [0, R],
  ];
}

// z, body radius, side tunnel width
const BODY_KEYS: [number, number, number][] = [
  [-7.55, 0.05, 0],
  [-7.3, 0.17, 0],
  [-6.9, 0.29, 0],
  [-6.3, 0.41, 0],
  [-5.6, 0.5, 0.01],
  [-4.8, 0.56, 0.06],
  [-4.0, 0.6, 0.2],
  [-3.0, 0.62, 0.3],
  [0.0, 0.63, 0.32],
  [4.0, 0.63, 0.32],
  [5.6, 0.62, 0.3],
  [6.6, 0.6, 0.22],
  [7.66, 0.58, 0.14],
];
const BODY = keyedProfile(BODY_KEYS.map(([z, R, w]) => ({ z, pts: tunnelled(R, w) })));
const BODY_SUB = [2, 2, 2, 1, 1, 1, 2, 2, 3, 3, 3];
const TAIL_Z = 7.66;

// the small canopy faired into the top, with its flat side windows
const CANOPY: Section[] = [
  { z: -5.95, w: 0.03, top: 0.02, bot: 0.02, y: 0.36, n: 2 },
  { z: -5.65, w: 0.22, top: 0.1, bot: 0.03, y: 0.4, n: 2.6 },
  { z: -5.3, w: 0.27, top: 0.17, bot: 0.03, y: 0.43, n: 3 },
  { z: -4.8, w: 0.29, top: 0.19, bot: 0.03, y: 0.46, n: 3.2 },
  { z: -4.3, w: 0.28, top: 0.17, bot: 0.03, y: 0.48, n: 3.1 },
  { z: -3.8, w: 0.23, top: 0.11, bot: 0.03, y: 0.5, n: 2.8 },
  { z: -3.3, w: 0.05, top: 0.03, bot: 0.03, y: 0.52, n: 2 },
];
const PILOT_EYE = new THREE.Vector3(0, 0.6, -4.95);

// short, thin trapezoid wing at mid fuselage
const WING: WingStation[] = [
  { x: 0.55, le: -0.95, te: 2.35, y: -0.12, t: 0.05 },
  { x: 1.0, le: -0.78, te: 2.35, y: -0.12, t: 0.05 },
  { x: 3.4, le: 1.5, te: 2.15, y: -0.12, t: 0.045 },
];
const wingTe = (x: number): number => {
  for (let i = 0; i < WING.length - 1; i++) {
    const a = WING[i], b = WING[i + 1];
    if (x <= b.x) return a.te + ((b.te - a.te) * (x - a.x)) / (b.x - a.x);
  }
  return WING[WING.length - 1].te;
};

// all-moving tailplanes, 15 degrees of anhedral; in their own frame x = span from the root
const STAB: WingStation[] = [
  { x: 0, le: 4.65, te: 7.3, t: 0.05 },
  { x: 0.3, le: 4.85, te: 7.32, t: 0.048 },
  { x: 2.15, le: 6.7, te: 7.42, t: 0.04 },
];
const STAB_ROOT = new THREE.Vector3(0.62, -0.18, 0);
const STAB_PIVOT_Z = 6.1;

// wedge fins: thick at the trailing edge (in their own frame x = height)
const UPPER_FIN: WingStation[] = [
  { x: 0, le: 3.3, te: TAIL_Z, t: 0.11 },
  { x: 0.5, le: 4.4, te: TAIL_Z, t: 0.1 },
  { x: 1.75, le: 6.1, te: TAIL_Z - 0.05, t: 0.075 },
];
const LOWER_FIN: WingStation[] = [
  { x: 0, le: 4.1, te: TAIL_Z, t: 0.1 },
  { x: 0.4, le: 4.8, te: TAIL_Z, t: 0.09 },
  { x: 1.05, le: 5.9, te: TAIL_Z - 0.05, t: 0.07 },
];

const YELLOW = 'rgba(240,196,25,0.97)';
const WHITE = 'rgba(232,232,228,0.92)';

function livery(): Livery {
  const L = new Livery({ half: 3.6, z0: -7.8, len: 15.8, y0: -2.0, height: 4.4 });
  const { gt, gb, gs } = L;
  const rnd = prng(15);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // Inconel X: dark, slightly blotchy from the heat of every flight
  for (let i = 0; i < 60; i++) {
    const x = (rnd() - 0.5) * 6, z = -7 + rnd() * 14.5;
    gt.fillStyle = `rgba(${48 + rnd() * 22},${46 + rnd() * 18},${44 + rnd() * 16},${0.08 + rnd() * 0.1})`;
    gt.fillRect(...T(x, z), (0.3 + rnd() * 0.8) * pt, (0.3 + rnd() * 0.9) * pt);
  }
  // --- panel lines -----------------------------------------------------------------------
  for (const z of [-6.4, -5.9, -3.2, -1.5, 0.6, 2.6, 4.4, 6.0, 7.0]) {
    line(gt, [T(-0.9, z), T(0.9, z)], 1.1, LINE_LIGHT);
    line(gb, [B(-0.9, z), B(0.9, z)], 1.0, LINE_LIGHT);
    line(gs, [S(z, -0.62), S(z, 0.62)], 1.2, LINE);
  }
  // the side tunnel's edges
  line(gs, [S(-4.0, 0.2), S(7.4, 0.2)], 1.2, LINE);
  line(gs, [S(-4.0, -0.3), S(7.4, -0.3)], 1.2, LINE);
  line(gt, [T(0, -5.9), T(0, 7.5)], 0.9, LINE_LIGHT);
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      line(g, [M(1.0, 1.65), M(2.2, 1.65)], 1.2, LINE); // flap hinge
      rivets(g, M(1.2, -0.3), M(3.0, 1.6), 7, 0.6);
    }
  }
  weather(gt, L.top.width, L.top.height, rnd, 0.5, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.45, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.45, [1, 0.1]);
  // heat: the nose and leading edges come back burnished
  {
    const [x, y] = S(-7.2, 0);
    const grd = gs.createLinearGradient(x, y, x + 2.2 * ps, y);
    grd.addColorStop(0, 'rgba(120,100,80,0.35)');
    grd.addColorStop(1, 'rgba(120,100,80,0)');
    gs.fillStyle = grd;
    gs.fillRect(x, y - 0.6 * ps, 2.2 * ps, 1.2 * ps);
  }
  L.copySides();
  // --- markings ----------------------------------------------------------------------------
  // USAF on the upper left wing, star on the upper right; U.S. AIR FORCE down the side
  {
    gt.save();
    gt.translate(...T(-2.1, 1.0));
    gt.rotate(Math.PI);
    gt.fillStyle = WHITE;
    gt.font = `bold ${Math.round(0.42 * pt)}px "Arial Narrow", Arial, sans-serif`;
    gt.textAlign = 'center';
    gt.textBaseline = 'middle';
    gt.fillText('USAF', 0, 0);
    gt.restore();
    usInsignia(gt, ...T(2.15, 1.05), 0.34 * pt);
    usInsignia(gb, ...B(-2.15, 1.05), 0.34 * L.pb);
    gb.save();
    gb.translate(...B(2.1, 1.0));
    gb.fillStyle = WHITE;
    gb.font = `bold ${Math.round(0.42 * L.pb)}px "Arial Narrow", Arial, sans-serif`;
    gb.textAlign = 'center';
    gb.textBaseline = 'middle';
    gb.fillText('USAF', 0, 0);
    gb.restore();
  }
  L.sideText('U.S. AIR FORCE', -1.2, 0.12, 0.3 * ps, WHITE);
  L.sideDraw(3.6, 0.0, (g, x, y) => usInsignia(g, x, y, 0.2 * ps));
  // the NASA band across the upper fin, the tail number under it
  L.sideDraw(6.55, 1.85, (g, x, y) => {
    g.fillStyle = YELLOW;
    g.fillRect(x - 1.25 * ps, y - 0.24 * ps, 2.5 * ps, 0.48 * ps);
    g.fillStyle = 'rgba(20,20,22,0.95)';
    g.font = `bold ${Math.round(0.34 * ps)}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('NASA', x + 0.15 * ps, y + 0.02 * ps);
  });
  L.sideText('66671', 6.6, 1.3, 0.22 * ps, WHITE);
  L.sideText('X-15', -6.0, -0.05, 0.12 * ps, 'rgba(232,232,228,0.6)');
  // the cockpit: rescue and the pilot's name block
  L.sideText('RESCUE', -5.4, 0.42, 0.07 * ps, 'rgba(230,180,40,0.85)');
  return L;
}

/** US star and bars (white star in a blue disc, white bars with a red stripe). */
function usInsignia(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  g.fillStyle = 'rgba(226,226,222,0.92)';
  g.fillRect(x - r * 2.0, y - r * 0.32, r * 4.0, r * 0.64);
  g.fillStyle = 'rgba(190,40,34,0.92)';
  g.fillRect(x - r * 1.95, y - r * 0.1, r * 3.9, r * 0.2);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(32,46,96,0.95)';
  g.fill();
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r * 0.92 : r * 0.36;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = 'rgba(240,240,236,0.97)';
  g.fill();
  g.restore();
}

let liveryCache: Livery | null = null;

export function buildX15(v: AirframeVisual): void {
  const pm = partMaterials();
  liveryCache ??= livery();
  // Inconel X: near-black nickel steel with a dull metallic sheen
  const paint = skinMaterial({ top: new THREE.Color('#1a1b1e'), bottom: new THREE.Color('#1d1e21'), livery: liveryCache, roughness: 0.5, metalness: 0.35 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  // --- fuselage with its side tunnels ----------------------------------------------------------
  const zs = mergeStations(stations(-7.55, -4.0, 36, 0.6, 0), stations(-4.0, 5.6, 50), stations(5.6, TAIL_Z, 14, 0, 0));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB }));
  v.fuselageSections = sectionsFromProfile(BODY, -7.4, TAIL_Z - 0.05, 30);
  // the blunt base around the rocket: a flat ring closing the fuselage
  {
    const base = new THREE.RingGeometry(0.5, 0.62, 40, 1);
    base.translate(0, 0, TAIL_Z);
    v.addMesh(base, pm.darkMetal);
  }
  // the ball nose: the air-data sphere that read angle of attack and sideslip at Mach 6
  {
    const ball = new THREE.SphereGeometry(0.075, 18, 12);
    ball.translate(0, 0, -7.6);
    v.addMesh(ball, pm.darkMetal);
  }

  // --- wings, with a landing flap inboard ------------------------------------------------------
  const panels = wingPanels(
    WING,
    [{ x0: 1.0, x1: 2.2, hinge: (x) => wingTe(x) - 0.55, kind: 'flap', maxDeg: 40 }],
    { chordPts: 36, thickPos: 0.45, spanSub: 6 },
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

  // --- all-moving tailplanes, drooping 15 degrees ------------------------------------------------
  for (const side of [1, -1] as const) {
    const m = new THREE.Matrix4().makeRotationZ(-15 * (Math.PI / 180));
    m.premultiply(new THREE.Matrix4().makeTranslation(STAB_ROOT.x, STAB_ROOT.y, 0));
    if (side < 0) m.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    const g = wing({ sections: STAB, chordPts: 28, spanSub: 5, tip: 'flat', root: 'flat', thickPos: 0.4, matrix: m });
    const hinge = new THREE.Vector3(STAB_ROOT.x * side, STAB_ROOT.y, STAB_PIVOT_Z);
    v.addSurface(stamp(g), paint, hinge, new THREE.Vector3(side, 0, 0), 'stab', side, 25);
  }

  // --- the wedge fins: a big one on top, a smaller one underneath --------------------------------
  {
    const m = finMatrix(0, 0.55, 0, 1);
    skin(wing({ sections: UPPER_FIN, chordPts: 28, spanSub: 5, tip: 'flat', root: 'flat', thickPos: 0.88, matrix: m }));
    const top = new THREE.Vector3(1.75, 0, 6.9).applyMatrix4(m);
    v.addNavLight(new THREE.Vector3(top.x, top.y + 0.03, top.z), 'strobe');
    const mb = finMatrix(0, -0.55, 180, 1);
    skin(wing({ sections: LOWER_FIN, chordPts: 24, spanSub: 4, tip: 'flat', root: 'flat', thickPos: 0.88, matrix: mb }));
  }

  // --- canopy ---------------------------------------------------------------------------------------
  v.cockpitEye.copy(PILOT_EYE);
  buildCanopy(v, CANOPY, -5.6, [-5.2, -4.25], paint);
  addPilot(v, PILOT_EYE, 0.2, { style: 'us', stick: 'center', martinBaker: false });
  const shroud = loftProfile({
    stations: stations(-5.55, -5.2, 6),
    profile: (z) => {
      const u = (z + 5.55) / 0.35;
      return [[0, 0.22], [0.28, 0.24], [0.3, 0.46], [0.22, 0.56 - u * 0.04], [0, 0.58 - u * 0.04]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));

  // --- the XLR99 rocket: one bell nozzle in the base ------------------------------------------------
  {
    const nz = nozzle({ cx: 0, cy: 0, z0: TAIL_Z - 0.05, z1: TAIL_Z + 0.45, r0: 0.4, r1: 0.47, petals: 56, saw: 0, floor: TAIL_Z + 0.1 });
    const nzOut = v.addMesh(nz.outer, pm.nozzle);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.nozzles.push({ pos: new THREE.Vector3(0, 0, TAIL_Z + 0.4), radius: 0.44, depth: 0.5, area: nz.area });
  }
  // a long, bright rocket plume
  v.buildFlames(16);

  // --- reaction-control thruster ports in the nose and wingtips, antennas, lights ---------------------
  for (const sx of [-1, 1]) {
    const port = new THREE.CircleGeometry(0.035, 10);
    port.rotateY((sx * Math.PI) / 2);
    port.translate(sx * 0.37, 0.05, -6.5);
    v.addMesh(port, pm.duct);
  }
  v.addMesh(join([
    probe(new THREE.Vector3(0, 0.3, -6.9), 0.4, 0.012, new THREE.Vector3(0, 0.15, -1).normalize()),
    blade(new THREE.Vector3(0, 0.63, -1.0), 0.12, 0.2),
    blade(new THREE.Vector3(0, -0.63, 1.5), 0.12, 0.2, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addNavLight(new THREE.Vector3(-3.41, -0.12, 1.85), 'red');
  v.addNavLight(new THREE.Vector3(3.41, -0.12, 1.85), 'green');

  // --- landing gear: twin nose wheels, and two steel skids under the tail ----------------------------
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.45, -5.0), axle: new THREE.Vector3(0, -1.25 + 0.22, -5.3), r: 0.22, w: 0.12, twin: true, retract: 'forward' },
    mains: { top: new THREE.Vector3(0.6, -0.5, 4.3), axle: new THREE.Vector3(0.75, -1.25 + 0.1, 4.6), r: 0.1, w: 0.08, retract: 'inward', outboard: 0.05 },
    doorColor: '#1b1c1f',
  });
}

