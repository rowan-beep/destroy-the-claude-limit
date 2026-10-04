// Lockheed SR-71A Blackbird: 32.7 m long, 16.9 m span, 5.6 m tall.
// A long, slim fuselage with sharp chines that flare out along the nose and
// blend into a cranked delta wing; two huge J58 nacelles at mid-span, each
// with a moving inlet spike up front and a wide ejector nozzle behind; an
// all-moving fin on top of each nacelle, canted inward; elevons on the
// trailing edge (no tailplane); a tandem cockpit for the pilot and the
// Reconnaissance Systems Officer, whose canopy is mostly metal with small
// windows. Painted black (it sheds the heat of Mach 3), with red outlines
// on the wing tops marking where the crew may walk.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { addPilot } from './pilot';
import { Section, sectionAt, sectionPoint } from './builder';
import {
  P2, loftProfile, keyedProfile, stations, mergeStations, wing, WingStation, finMatrix, both, mirror, join, stamp, lathe,
  Livery, skinMaterial, line, rivets, weather, prng, LINE, LINE_LIGHT, sstep,
} from './kit';
import { nozzle, partMaterials, blade, probe, formationStrip } from './parts';
import { buildCanopy, buildGearSet, wingPanels, sectionsFromProfile } from './common';

/** the chine edge lies in the wing plane */
const CHINE_Y = -0.02;

/**
 * Fuselage cross-section, right half, 12 points bottom centre -> top centre:
 * a round body of radius R centred at height cy, and a thin chine flange out
 * to half-width xc (a sharp edge at the chine).
 */
function chined(R: number, xc: number, cy: number): P2[] {
  const w = Math.max(0, xc - R);
  return [
    [0, cy - 0.86 * R],
    [0.52 * R, cy - 0.79 * R],
    [0.86 * R, cy - 0.5 * R],
    [R + 0.12 * w, cy - 0.24 * R - 0.02 * w],
    [R + 0.62 * w, CHINE_Y - 0.035 * w - 0.01],
    [xc, CHINE_Y],
    [R + 0.62 * w, CHINE_Y + 0.05 * w + 0.012],
    [R + 0.12 * w, cy + 0.24 * R + 0.02 * w],
    [0.84 * R, cy + 0.56 * R],
    [0.58 * R, cy + 0.82 * R],
    [0.3 * R, cy + 0.96 * R],
    [0, cy + R],
  ];
}

// z, body radius, chine half-width, body centre height
const BODY_KEYS: [number, number, number, number][] = [
  // a long, slim forebody: the nose tapers over its first six metres, then the
  // body and its chines run parallel back to the wing (as in the three-view)
  [-18.6, 0.012, 0.016, 0.0],
  [-17.8, 0.14, 0.24, 0.0],
  [-16.5, 0.38, 0.72, 0.05],
  [-15.0, 0.56, 1.16, 0.1],
  [-13.5, 0.68, 1.48, 0.13],
  [-12.0, 0.74, 1.62, 0.15],
  [-9.0, 0.78, 1.65, 0.15],
  [-6.0, 0.78, 1.67, 0.15],
  [-4.0, 0.78, 1.72, 0.14],
  [-2.0, 0.78, 1.3, 0.14],
  [0.0, 0.78, 0.86, 0.13],
  [4.0, 0.74, 0.79, 0.11],
  [8.0, 0.62, 0.66, 0.08],
  [10.5, 0.44, 0.47, 0.06],
  [12.2, 0.2, 0.22, 0.04],
  [13.1, 0.025, 0.03, 0.03],
];
const BODY = keyedProfile(BODY_KEYS.map(([z, R, xc, cy]) => ({ z, pts: chined(R, xc, cy) })));
// the chine edge is a crease; the rest of the section is smooth
const BODY_SUB = [3, 3, 3, 2, 1, 1, 2, 3, 3, 3, 3];

/** chine half-width at z (for the livery and the wing root) */
const chineAt = (z: number): number => BODY(z)[5][0];

// tandem cockpits: the pilot's canopy, then the RSO's hump behind it
const CANOPY: Section[] = [
  { z: -13.1, w: 0.03, top: 0.02, bot: 0.02, y: 0.77, n: 2 },
  { z: -12.7, w: 0.34, top: 0.21, bot: 0.03, y: 0.79, n: 2.6 },
  { z: -12.2, w: 0.42, top: 0.35, bot: 0.03, y: 0.81, n: 3 },
  { z: -11.4, w: 0.45, top: 0.42, bot: 0.03, y: 0.82, n: 3.2 },
  { z: -10.5, w: 0.45, top: 0.42, bot: 0.03, y: 0.83, n: 3.2 },
  { z: -9.8, w: 0.45, top: 0.40, bot: 0.03, y: 0.84, n: 3.2 },
  { z: -9.0, w: 0.44, top: 0.38, bot: 0.03, y: 0.85, n: 3.1 },
  { z: -8.1, w: 0.4, top: 0.30, bot: 0.03, y: 0.86, n: 3 },
  { z: -7.3, w: 0.3, top: 0.16, bot: 0.03, y: 0.86, n: 2.6 },
  { z: -6.6, w: 0.06, top: 0.02, bot: 0.03, y: 0.86, n: 2 },
];
const PILOT_EYE = new THREE.Vector3(0, 1.09, -11.5);
const RSO_EYE = new THREE.Vector3(0, 1.11, -9.35);

// cranked delta wing: the chine is the leading edge inboard, then the outer
// panel past the nacelle; conical camber droops the outer leading edge
const NAC_X = 4.0;
const NAC_Y = -0.02;
const WING: WingStation[] = [
  { x: 0.7, le: -3.9, te: 10.7, y: -0.01, t: 0.024 },
  { x: 1.75, le: -3.4, te: 10.6, y: -0.01, t: 0.024 },
  { x: 3.25, le: -1.4, te: 10.3, y: -0.02, t: 0.026 },
  { x: 4.7, le: 1.2, te: 9.9, y: -0.05, t: 0.03 },
  { x: 5.6, le: 2.6, te: 9.6, y: -0.08, t: 0.032 },
  { x: 7.4, le: 6.1, te: 9.0, y: -0.12, t: 0.034 },
  { x: 8.47, le: 8.1, te: 8.6, y: -0.15, t: 0.04 },
];
const wingLe = (x: number): number => {
  for (let i = 0; i < WING.length - 1; i++) {
    const a = WING[i], b = WING[i + 1];
    if (x <= b.x) return a.le + ((b.le - a.le) * (x - a.x)) / (b.x - a.x);
  }
  return WING[WING.length - 1].le;
};
const wingTe = (x: number): number => {
  for (let i = 0; i < WING.length - 1; i++) {
    const a = WING[i], b = WING[i + 1];
    if (x <= b.x) return a.te + ((b.te - a.te) * (x - a.x)) / (b.x - a.x);
  }
  return WING[WING.length - 1].te;
};

// all-moving fins on the nacelles, canted 15 degrees inward; in their own frame x = height
const FIN: WingStation[] = [
  { x: 0, le: 7.2, te: 11.9, t: 0.04 },
  { x: 0.4, le: 7.9, te: 11.95, t: 0.038 },
  { x: 2.55, le: 10.25, te: 12.0, t: 0.032 },
];
const FIN_PIVOT_Z = 10.0;

// nacelle outer cowl, [radius, z]: lip, swelling over the J58, then the ejector
const COWL: P2[] = [
  [0.71, -5.0],
  [0.76, -4.75],
  [0.84, -4.2],
  [0.93, -3.0],
  [0.97, -1.2],
  [0.98, 3.0],
  [0.97, 8.0],
  [0.95, 11.0],
  [0.92, 12.45],
];
// the inlet spike: a long cone ahead of the lip (moves aft in flight on the real jet)
const SPIKE: P2[] = [
  [0.004, -7.45],
  [0.08, -7.2],
  [0.2, -6.7],
  [0.32, -6.0],
  [0.42, -5.2],
  [0.48, -4.5],
  [0.5, -3.6],
];
const NOZZLE_Z = 12.45;

const RED = 'rgba(205,34,28,1)';

function livery(team: string): Livery {
  const L = new Livery({ half: 16.8, z0: -18.9, len: 33.6, y0: -1.6, height: 4.4 });
  const { gt, gb, gs } = L;
  const rnd = prng(71);
  const T = (x: number, z: number) => L.T(x, z);
  const B = (x: number, z: number) => L.B(x, z);
  const S = (z: number, y: number) => L.S(z, y);
  const pt = L.pt, ps = L.ps;
  // the faint sheen of iron-ferrite paint over panels of slightly different age
  for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * 16, z = -16 + rnd() * 29;
    gt.fillStyle = `rgba(${40 + rnd() * 14},${42 + rnd() * 14},${46 + rnd() * 14},${0.1 + rnd() * 0.12})`;
    gt.fillRect(...T(x, z), (0.6 + rnd() * 1.6) * pt, (0.4 + rnd() * 1.4) * pt);
  }
  // --- panel lines -------------------------------------------------------------
  for (const z of [-15.5, -13.3, -8.0, -6.0, -3.8, -1.2, 1.6, 4.4, 7.2, 9.8, 11.6]) {
    const half = Math.max(0.3, chineAt(z) * 0.9);
    line(gt, [T(-half, z), T(half, z)], 1.2, LINE_LIGHT);
    line(gb, [B(-half, z), B(half, z)], 1.0, LINE_LIGHT);
    line(gs, [S(z, -0.6), S(z, 0.85)], 1.3, LINE);
  }
  line(gs, [S(-18, CHINE_Y), S(-4, CHINE_Y)], 1.2, LINE); // chine edge
  line(gt, [T(0, -16.5), T(0, 12.5)], 1.0, LINE_LIGHT);
  // the wing's corrugated skin (it expands with heat): chordwise ripple lines
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    const Wb = (x: number, z: number) => B(x * sx, z);
    for (let x = 1.0; x <= 8.2; x += 0.42) {
      if (Math.abs(x - NAC_X) < 1.05) continue;
      const z0 = Math.max(wingLe(x) + 0.5, -4.5), z1 = wingTe(x) - 1.6;
      if (z1 - z0 < 1) continue;
      line(gt, [W(x, z0), W(x, z1)], 0.9, 'rgba(20,22,25,0.35)');
      line(gb, [Wb(x, z0), Wb(x, z1)], 0.8, 'rgba(20,22,25,0.3)');
    }
    for (const [g, M] of [[gt, W], [gb, Wb]] as const) {
      // elevon hinge lines
      line(g, [M(1.2, wingTe(1.2) - 1.5), M(3.1, wingTe(3.1) - 1.5)], 1.3, LINE);
      line(g, [M(4.95, wingTe(4.95) - 1.45), M(8.2, wingTe(8.2) - 1.1)], 1.3, LINE);
      rivets(g, M(1.4, 1.0), M(3.0, 7.5), 8, 0.7);
      rivets(g, M(5.2, 5.0), M(7.6, 7.6), 6, 0.7);
    }
  }
  // --- the red walkway outlines on the upper fuselage and wings --------------------------
  for (const sx of [-1, 1]) {
    const W = (x: number, z: number) => T(x * sx, z);
    line(gt, [W(0.62, -6.6), W(0.62, 9.6), W(1.15, 10.0), W(3.0, 10.0), W(3.0, 9.0)], 3.6, RED);
    line(gt, [W(1.0, -3.3), W(2.7, -2.0), W(2.95, 8.4)], 3.6, RED);
    line(gt, [W(0.62, -6.6), W(1.0, -6.6), W(1.0, -3.3)], 3.6, RED);
    // the red no-step border along the chine up to the cockpit, as on the real jet
    line(gt, [W(0.75, -12.4), W(0.85, -9.0), W(0.75, -6.6)], 2.6, RED);
  }
  // the radome joint near the nose: a darker band all the way round
  for (const [g, M, k] of [[gt, T, L.pt], [gb, B, L.pb]] as const) line(g, [M(-0.7, -15.6), M(0.7, -15.6)], 0.14 * k, 'rgba(3,3,4,0.95)');
  line(gs, [S(-15.6, -0.6), S(-15.6, 0.6)], 0.14 * L.ps, 'rgba(3,3,4,0.95)');
  weather(gt, L.top.width, L.top.height, rnd, 0.45, [0, 1]);
  weather(gb, L.bot.width, L.bot.height, rnd, 0.4, [0, 1]);
  weather(gs, L.side.width, L.side.height, rnd, 0.4, [1, 0.1]);
  // heat: the aft nacelles and nozzles burn to a dull bronze
  for (const [g, M, s] of [[gt, T, pt], [gb, B, L.pb]] as const) {
    for (const sx of [-1, 1]) {
      const [x, y] = M(NAC_X * sx, NOZZLE_Z);
      const grd = g.createLinearGradient(x, y - 3.2 * s, x, y);
      grd.addColorStop(0, 'rgba(60,52,44,0)');
      grd.addColorStop(1, 'rgba(84,66,48,0.4)');
      g.fillStyle = grd;
      g.fillRect(x - 0.95 * s, y - 3.2 * s, 1.9 * s, 3.2 * s);
    }
  }
  L.copySides();
  // --- markings ------------------------------------------------------------------------
  const tail = team === 'blue' ? '17972' : '17980';
  // national insignia on the outer wings and the forward fuselage, low-visibility
  for (const sx of [-1, 1]) {
    usInsignia(gt, ...T(6.4 * sx, 6.3), 0.42 * pt);
    usInsignia(gb, ...B(6.4 * sx, 6.3), 0.42 * L.pb);
  }
  // U.S. AIR FORCE along the top of the fuselage, both sides of the centre line
  for (const sx of [-1, 1]) {
    gt.save();
    gt.translate(...T(0.32 * sx, -4.8));
    gt.rotate((sx * Math.PI) / 2);
    gt.fillStyle = 'rgba(214,214,210,0.82)';
    gt.font = `bold ${Math.round(0.34 * pt)}px "Arial Narrow", Arial, sans-serif`;
    gt.textAlign = 'center';
    gt.textBaseline = 'middle';
    gt.fillText('U.S. AIR FORCE', 0, 0);
    gt.restore();
  }
  L.sideText('U.S. AIR FORCE', -7.4, 0.42, 0.24 * ps, 'rgba(214,214,210,0.8)');
  L.sideText(tail, -5.0, 0.34, 0.2 * ps, 'rgba(196,46,38,0.85)');
  L.sideDraw(-6.0, 0.36, (g, x, y) => usInsignia(g, x, y, 0.22 * ps));
  // rescue arrow and "DANGER" by the canopy
  L.sideText('RESCUE', -12.6, 0.48, 0.07 * ps, 'rgba(196,46,38,0.9)');
  return L;
}

/** US star and bars, low-visibility on the black jet (white star, grey bars, red stripe). */
function usInsignia(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.save();
  // bars
  g.fillStyle = 'rgba(206,206,202,0.85)';
  g.fillRect(x - r * 2.0, y - r * 0.32, r * 4.0, r * 0.64);
  g.fillStyle = 'rgba(178,38,34,0.9)';
  g.fillRect(x - r * 1.95, y - r * 0.1, r * 3.9, r * 0.2);
  // disc
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(40,44,62,0.95)';
  g.fill();
  g.lineWidth = Math.max(1, r * 0.08);
  g.strokeStyle = 'rgba(206,206,202,0.85)';
  g.stroke();
  // star
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r * 0.92 : r * 0.36;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = 'rgba(232,232,228,0.95)';
  g.fill();
  g.restore();
}

const liveries = new Map<string, Livery>();

export function buildSr71(v: AirframeVisual): void {
  const pm = partMaterials();
  const team = v.ac.team;
  let L = liveries.get(team);
  if (!L) {
    L = livery(team);
    liveries.set(team, L);
  }
  // the iron-ferrite "Blackbird" paint: very dark, a soft satin sheen
  // iron-ball black, deeper than any grey
  const paint = skinMaterial({ top: new THREE.Color('#0d0e10'), bottom: new THREE.Color('#0f1012'), livery: L, roughness: 0.55, metalness: 0.1 });
  v.paintMat = paint;
  const skin = (g: THREE.BufferGeometry) => v.addMesh(stamp(g), paint);

  // --- fuselage with its chines --------------------------------------------------------------
  const zs = mergeStations(stations(-18.6, -15.0, 40, 0.6, 0), stations(-15.0, -4.0, 70), stations(-4.0, 13.1, 90, 0, 0.5));
  skin(loftProfile({ stations: zs, profile: BODY, sub: BODY_SUB, capEnd: true }));
  v.fuselageSections = sectionsFromProfile(BODY, -18.4, 13.0, 50);

  // --- wing: elevons inboard and outboard of the nacelles -------------------------------------
  const panels = wingPanels(
    WING,
    [
      { x0: 1.2, x1: 3.1, hinge: (x) => wingTe(x) - 1.5, kind: 'stab', maxDeg: 20 },
      { x0: 4.95, x1: 8.2, hinge: (x) => wingTe(x) - 1.3, kind: 'stab', maxDeg: 20 },
    ],
    { chordPts: 44, thickPos: 0.45, spanSub: 8 },
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

  // --- nacelles: cowl, inlet spike, the dark inlet duct, and the nacelle chines -----------------
  for (const sx of [-1, 1] as const) {
    const cx = NAC_X * sx;
    skin(lathe(COWL, 48, cx, NAC_Y));
    // inside the lip: the duct turns dark at once
    const duct = lathe([[0.62, -3.6], [0.66, -4.4], [0.7, -4.9], [0.71, -5.0]], 40, cx, NAC_Y);
    v.addMesh(duct, pm.duct);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.64, 32), pm.duct);
    face.position.set(cx, NAC_Y, -3.62);
    face.rotation.y = Math.PI;
    v.body.add(face);
    skin(lathe(SPIKE, 40, cx, NAC_Y));
    // the nacelle chine: a sharp lip along the outboard side, carrying the wing chine round
    const nch = loftProfile({
      stations: stations(-4.4, 9.5, 30),
      profile: (z) => {
        const u = sstep(-4.4, -2.0, z) * (1 - sstep(8.0, 9.5, z));
        const r = 0.93 + 0.05 * sstep(-4.4, -1.2, z);
        const w = 0.32 * u + 0.01;
        return [[r * 0.9, -0.2], [r + w * 0.6, -0.03], [r + w, 0], [r + w * 0.6, 0.04], [r * 0.9, 0.22]] as P2[];
      },
      sub: 1,
      capStart: true,
      capEnd: true,
    });
    nch.translate(0, NAC_Y, 0);
    if (sx < 0) {
      const m = mirror(nch);
      m.translate(cx + NAC_X, 0, 0);
      skin(m);
    } else {
      nch.translate(cx, 0, 0);
      skin(nch);
    }
    // bypass doors and louvres on the nacelle sides
    for (let i = 0; i < 3; i++) {
      const louvre = new THREE.BoxGeometry(0.02, 0.18, 0.5);
      louvre.translate(cx + sx * 0.975, NAC_Y + 0.25 - i * 0.24, -1.6);
      v.addMesh(louvre, pm.darkMetal);
    }
  }

  // --- all-moving fins on the nacelles, canted inward ----------------------------------------------
  for (const side of [1, -1] as const) {
    const m = finMatrix(NAC_X * side, NAC_Y + 0.9, -15, side);
    const fin = wing({ sections: FIN, chordPts: 30, spanSub: 6, tip: 'round', root: 'flat', thickPos: 0.45, matrix: m });
    const hinge = new THREE.Vector3(NAC_X * side, NAC_Y + 0.9, FIN_PIVOT_Z);
    const axis = new THREE.Vector3(1, 0, 0).transformDirection(m);
    v.addSurface(stamp(fin), paint, hinge, axis, 'rudder', side, 20);
    // fin root fairing on the nacelle
    skin(lathe([[0.004, 6.9], [0.1, 7.6], [0.13, 10.5], [0.08, 11.9], [0.004, 12.1]], 12, NAC_X * side, NAC_Y + 0.92));
    const top = new THREE.Vector3(2.55, 0, 11.1).applyMatrix4(m);
    v.addNavLight(new THREE.Vector3(top.x, top.y + 0.03, top.z), 'formation');
  }

  // --- canopies: the pilot's, then the RSO's hood with its small windows --------------------------
  v.cockpitEye.copy(PILOT_EYE);
  buildCanopy(v, CANOPY, -12.65, [-12.15, -10.1, -9.95], paint);
  if (v.canopy) {
    // small, heavily framed windows: from outside the canopy reads as dark smoked glass
    const gm = (v.canopy.material as THREE.MeshStandardMaterial).clone();
    gm.color.set('#1a2026');
    gm.opacity = 0.82;
    gm.roughness = 0.05;
    gm.envMapIntensity = 1.2;
    v.canopy.material = gm;
  }
  for (const eye of [PILOT_EYE, RSO_EYE]) {
    addPilot(v, eye, 0.22, { style: 'us', stick: 'center', martinBaker: false });
  }
  // the RSO sits under a metal hood with a small window each side
  const hood = (z0: number, z1: number, th0: number) =>
    loftProfile({
      stations: stations(z0, z1, 26),
      profile: (z) => {
        const sec = sectionAt(CANOPY, z);
        const pts: P2[] = [];
        for (let i = 0; i <= 8; i++) {
          const [x, y] = sectionPoint(th0 + ((Math.PI / 2 - th0) * i) / 8, sec);
          pts.push([x * 1.012 + 0.004, y + 0.006]);
        }
        return [[0, pts[0][1] - 0.04], [pts[0][0] - 0.03, pts[0][1] - 0.04], ...pts];
      },
      sub: 1,
      capStart: true,
      capEnd: true,
    });
  skin(hood(-9.95, -6.6, 0.62));
  skin(hood(-8.7, -6.6, 0.05));
  // the pilot's windscreen: flat panels with a heavy centre post
  {
    const post = new THREE.BoxGeometry(0.035, 0.36, 0.05);
    post.rotateX(-0.95);
    post.translate(0, 0.86, -12.45);
    v.hideInCockpit.push(v.addMesh(post, pm.frame));
  }
  // instrument shroud ahead of the pilot
  const shroud = loftProfile({
    stations: stations(-12.55, -12.15, 6),
    profile: (z) => {
      const u = sstep(-12.55, -12.15, z);
      return [[0, 0.32], [0.38, 0.34], [0.42, 0.62], [0.3, 0.72 - u * 0.05], [0, 0.74 - u * 0.05]] as P2[];
    },
    sub: 3,
    capEnd: true,
  });
  v.hideInCockpit.push(v.addMesh(shroud, pm.seat));

  // --- engines: two J58 ejector nozzles --------------------------------------------------------
  for (const sx of [-1, 1] as const) {
    const nz = nozzle({ cx: NAC_X * sx, cy: NAC_Y, z0: NOZZLE_Z, z1: 13.85, r0: 0.9, r1: 0.86, petals: 26, saw: 0.04, floor: NOZZLE_Z + 0.15 });
    const nzOut = v.addMesh(nz.outer, pm.nozzle);
    const nzIn = v.addMesh(nz.inner, pm.nozzleIn);
    nzIn.userData.detail = true;
    v.morphNozzle(nzOut, nzIn);
    v.nozzles.push({ pos: new THREE.Vector3(NAC_X * sx, NAC_Y, 13.7), radius: 0.8, depth: 1.0, area: nz.area });
  }
  v.buildFlames(10);

  // --- probes, antennas, lights ----------------------------------------------------------------
  v.addMesh(join([
    probe(new THREE.Vector3(0, 0.0, -18.55), 1.15, 0.02, new THREE.Vector3(0, 0, -1)),
  ]), pm.antenna);
  v.addMesh(join([
    blade(new THREE.Vector3(0, 0.88, -3.0), 0.16, 0.26),
    blade(new THREE.Vector3(0, 0.84, 3.4), 0.14, 0.24),
    blade(new THREE.Vector3(0, -0.6, -6.0), 0.16, 0.26, new THREE.Vector3(0, -1, 0)),
    blade(new THREE.Vector3(0, -0.56, 5.0), 0.14, 0.22, new THREE.Vector3(0, -1, 0)),
  ]), pm.antenna);
  v.addMesh(join([
    formationStrip(new THREE.Vector3(1.2, 0.25, -12.0), new THREE.Vector3(1, 0.5, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
    formationStrip(new THREE.Vector3(-1.2, 0.25, -12.0), new THREE.Vector3(-1, 0.5, 0), new THREE.Vector3(0, 0, 1), 0.5, 0.035),
  ]), pm.formation, v.body, false);
  v.addNavLight(new THREE.Vector3(-8.48, WING[5].y ?? 0, 7.4), 'red');
  v.addNavLight(new THREE.Vector3(8.48, WING[5].y ?? 0, 7.4), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.88, 1.0), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -0.56, 2.0), 'strobe');

  // --- landing gear: twin-wheel nose leg, three-wheel main bogies folding into the fuselage ----------
  buildGearSet(v, {
    nose: { top: new THREE.Vector3(0, -0.45, -10.2), axle: new THREE.Vector3(0, -2.15 + 0.33, -10.5), r: 0.33, w: 0.2, twin: true, retract: 'forward' },
    mains: { top: new THREE.Vector3(2.0, -0.5, 0.6), axle: new THREE.Vector3(2.55, -2.15 + 0.42, 1.0), r: 0.42, w: 0.36, retract: 'inward', outboard: 0.1 },
    doorColor: '#1e2023',
  });
}
