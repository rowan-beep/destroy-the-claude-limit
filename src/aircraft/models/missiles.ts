// Detailed air-to-air missiles: the rounds on your own jet, in the hangar, on the jets near you and in
// flight (stores.ts keeps the light versions for distant jets). Each is put together like the real one:
//
// - the nose: a tangent-ogive radome with its dark rain-erosion tip, or an IR seeker's glass dome (the
//   optics glinting gold through it) held by a metal retaining ring on a short shoulder;
// - the airframe in its sections, each joint a thin metal ring sunk into the skin, the live-warhead
//   (yellow) and live-motor (brown) bands on the sections they mark, the black stencilling;
// - a boattail closing onto the base, and an open rocket nozzle, sooty, with the jet vanes of the
//   thrust-vectoring rounds standing in its exit;
// - airfoil fins on their real planforms; the T-hooks the launch rail holds, and the wiring raceway
//   with its umbilical connector between them.
//
// Vertex colours, plus a `shine` attribute the store materials read (0 paint, ~0.5 bare metal,
// 1 glass): the seeker domes gloss like glass, the joints and nozzles look like metal, the paint stays
// satin. Built along z (nose to -z), centred on the round's middle; dimensions from the published data.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lathe, wing, loftProfile, stations, modelDensity, setModelDensity, type P2 } from './kit';

type C = THREE.Color;
const hex = (h: string): C => new THREE.Color(h);

const METAL = 0.5;
const GLASS = 1;
/** sides round the body (24 keeps the outline round at any distance a round is seen from) */
const SIDES = 24;

/** a plain box: the small fittings are a few centimetres across, too small for rounded corners to show */
const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);

const JOINT = hex('#62676d');
const TIP = hex('#474b51');
const NOZZLE = hex('#232425');
const SOOT = hex('#34312d');
const DOME_EDGE = hex('#0e1319');
const DOME_CORE = hex('#7a6436');
const RING = hex('#8d9196');
const HOOK = hex('#7d8286');
const STENCIL = hex('#25272a');
const YELLOW = hex('#d4a61c');
const BROWN = hex('#6e4a24');

/** Colour (and shine) every vertex of a part from its position. */
function tint(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, c: C) => number | void): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const sh = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const s = fn(v, c);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
    sh[i] = typeof s === 'number' ? s : 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('shine', new THREE.BufferAttribute(sh, 1));
  return g;
}

const solid = (g: THREE.BufferGeometry, c: C, shine = 0): THREE.BufferGeometry => tint(g, (_p, o) => (o.copy(c), shine));

/** One geometry from the parts, keeping colour and shine. */
function assemble(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const g of parts) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color' && k !== 'shine') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.index) {
      const n = g.attributes.position.count;
      const ix = new Array<number>(n);
      for (let i = 0; i < n; i++) ix[i] = i;
      g.setIndex(ix);
    }
  }
  return mergeGeometries(parts, false)!;
}

// ---------------------------------------------------------------- the body
interface Body {
  /** length and body radius (m) */
  L: number;
  r: number;
  /** a tangent-ogive radome `len` long, or an IR glass dome of radius `dome` on a shoulder reaching full width at `len` */
  nose: { kind: 'radome'; len: number } | { kind: 'ir'; dome: number; len: number };
  /** the section joints, measured from the nose */
  joints: number[];
  /** painted regions [from, to] measured from the nose (bands, a darker seeker section...) */
  bands: [number, number, C][];
  paint: C;
  radome?: C;
  /** the boattail: it starts this far from the nose and closes to this radius at the base */
  boat: [number, number];
  /** the nozzle's exit radius */
  exit: number;
}

function body(b: Body): THREE.BufferGeometry[] {
  const { L, r } = b;
  const [bs, br] = b.boat;
  const z = (s: number) => -L / 2 + s;
  /** the body's radius at s (behind the nose) */
  const R = (s: number) => (s <= bs ? r : r + (br - r) * (0.5 - 0.5 * Math.cos(Math.min(1, (s - bs) / (L - 0.012 - bs)) * Math.PI)));
  const nose: P2[] = [];
  const noseLen = b.nose.len;
  if (b.nose.kind === 'radome') {
    const n = b.nose.len;
    const rho = (r * r + n * n) / (2 * r);
    for (let i = 0; i <= 16; i++) {
      const x = n * (1 - Math.cos(((i / 16) * Math.PI) / 2));
      nose.push([Math.max(0.0015, Math.sqrt(Math.max(0, rho * rho - (n - x) * (n - x))) + r - rho), x]);
    }
  } else {
    const d = b.nose.dome;
    for (let i = 0; i <= 10; i++) {
      const a = ((i / 10) * Math.PI) / 2;
      nose.push([Math.max(0.0015, d * Math.sin(a)), d * (1 - Math.cos(a))]);
    }
    // the retaining ring, standing a little proud of the glass, then the shoulder out to the body
    const rr = d * 1.05;
    nose.push([rr, d + 0.002], [rr, d + 0.016], [rr, d + 0.0175]);
    const s0 = d + 0.0175;
    for (let i = 1; i <= 9; i++) {
      const u = i / 9;
      const k = u * u * (3 - 2 * u);
      nose.push([rr + (r - rr) * k, s0 + (noseLen - s0) * u]);
    }
  }
  // behind the nose: crisp band edges, sunk joint rings, the boattail
  const pts: P2[] = [[r, noseLen + 0.003]];
  for (const [a, e] of b.bands)
    for (const s of [a, e]) if (s > noseLen + 0.004 && s < L - 0.02) pts.push([R(s), s - 0.0008], [R(s), s + 0.0008]);
  for (const s of b.joints) pts.push([R(s), s - 0.007], [R(s) * 0.986, s - 0.0028], [R(s) * 0.986, s + 0.0028], [R(s), s + 0.007]);
  for (let i = 0; i <= 8; i++) {
    const s = bs + ((L - 0.012 - bs) * i) / 8;
    pts.push([R(s), s]);
  }
  pts.sort((p, q) => p[1] - q[1]);
  const prof: P2[] = [...nose];
  for (const p of pts) if (p[1] > prof[prof.length - 1][1] + 0.0004) prof.push(p);
  // the base: a rounded edge, the flat base out to the nozzle lip, the lip turning in
  prof.push([br * 0.97, L - 0.004], [br * 0.9, L], [b.exit * 1.14, L], [b.exit * 1.03, L - 0.005]);
  const g = lathe(
    prof.map(([rr, s]) => [rr, z(s)] as P2),
    SIDES,
  );
  tint(g, (p, c) => {
    const s = p.z + L / 2;
    const rad = Math.hypot(p.x, p.y);
    if (b.nose.kind === 'radome') {
      if (s < b.nose.len * 0.035) return (c.copy(TIP), 0.15);
      if (s < b.nose.len - 0.002) return (c.copy(b.radome ?? b.paint), 0);
    } else {
      const d = b.nose.dome;
      if (s < d + 0.001) {
        // the glass: the seeker's optics glinting through the middle, deep blue-black at the rim
        const k = Math.min(1, rad / (d * 0.75));
        c.copy(DOME_CORE).lerp(DOME_EDGE, k * k);
        return GLASS;
      }
      if (s < d + 0.017) return (c.copy(RING), METAL);
    }
    for (const j of b.joints) if (Math.abs(s - j) < 0.0042) return (c.copy(JOINT), METAL);
    if (s > L - 0.0012 && rad < br * 0.93) return (c.copy(SOOT), 0.2);
    for (const [a, e, col] of b.bands) if (s >= a && s <= e) return (c.copy(col), 0);
    c.copy(b.paint);
    return 0;
  });
  // the nozzle: in from the lip, down the sooty expansion cone to the throat
  const ex = b.exit;
  const nz = lathe(
    ([[ex * 1.03, L - 0.005], [ex, L - 0.03], [ex * 0.8, L - 0.11], [ex * 0.56, L - 0.17], [ex * 0.5, L - 0.2], [0.002, L - 0.22]] as P2[]).map(([rr, s]) => [rr, z(s)] as P2),
    20,
  );
  tint(nz, (p, c) => {
    c.copy(NOZZLE).lerp(SOOT, p.z + L / 2 > L - 0.05 ? 0.7 : 0);
    return 0.35;
  });
  return [g, nz];
}

// ---------------------------------------------------------------- the parts
interface Fins {
  /** leading edge at the root, measured from the nose */
  s: number;
  root: number;
  tip: number;
  span: number;
  /** how far back the tip's leading edge sits from the root's */
  sweep: number;
  /** thickness / chord */
  t: number;
  /** rotation of the set (pi/4: the X the rail needs, hooks between two fins) */
  rot?: number;
}

/** Four airfoil fins round the body (thin supersonic sections, sharp edges). */
function fins(L: number, r: number, f: Fins, col: C): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const zLe = -L / 2 + f.s;
  for (let k = 0; k < 4; k++) {
    const g = wing({
      sections: [
        { x: r * 0.96, le: zLe, te: zLe + f.root, t: f.t },
        { x: r + f.span, le: zLe + f.sweep, te: zLe + f.sweep + f.tip, t: f.t * 0.85 },
      ],
      chordPts: 12,
      spanSub: 2,
      tip: 'flat',
      root: 'flat',
      thickPos: 0.5,
    });
    g.rotateZ((f.rot ?? Math.PI / 4) + (k * Math.PI) / 2);
    out.push(solid(g, col));
  }
  return out;
}

/** The T-hooks the launch rail holds: a saddle on the skin, a neck, the T-bar. */
function hooks(L: number, r: number, at: number[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const s of at) {
    const z = -L / 2 + s;
    const base = box(Math.max(0.03, r * 0.6), 0.012, 0.07);
    base.translate(0, r + 0.002, z);
    const neck = box(0.014, 0.024, 0.04);
    neck.translate(0, r + 0.018, z);
    const bar = box(0.042, 0.009, 0.05);
    bar.translate(0, r + 0.033, z);
    out.push(solid(base, HOOK, METAL), solid(neck, HOOK, METAL), solid(bar, HOOK, METAL));
  }
  return out;
}

/** The wiring raceway along the top, between the hooks, its ends faired down onto the skin. */
function raceway(L: number, r: number, s0: number, s1: number, w: number, h: number, col: C): THREE.BufferGeometry {
  const z0 = -L / 2 + s0;
  const z1 = -L / 2 + s1;
  const g = loftProfile({
    stations: stations(z0, z1, 22, 0.35, 0.35),
    profile: (zz) => {
      const u = Math.min(1, (zz - z0) / 0.08, (z1 - zz) / 0.08);
      const k = Math.max(0.06, Math.sin((Math.max(0, u) * Math.PI) / 2));
      const hw = (w / 2) * (0.7 + 0.3 * k);
      const hh = h * k;
      const yb = r - 0.004;
      // (CCW seen from behind, from the bottom right)
      const pts: P2[] = [[hw, yb]];
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI;
        pts.push([Math.cos(a) * hw, yb + 0.004 + Math.sin(a) * hh]);
      }
      pts.push([-hw, yb]);
      return pts;
    },
    sub: 1,
    full: true,
    capStart: true,
    capEnd: true,
  });
  return solid(g, col);
}

/** The umbilical connector's cover on the raceway. */
function umbilical(L: number, r: number, s: number, h: number, col: C): THREE.BufferGeometry {
  const g = box(0.036, 0.022, 0.05);
  g.translate(0, r + h + 0.006, -L / 2 + s);
  return solid(g, col);
}

/** Lines of black stencilling on a side of the body (angle from the top, lengths along it). */
function stencil(L: number, r: number, s: number, ang: number, lines: number[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  lines.forEach((len, i) => {
    const a = Math.PI / 2 - ang - i * (0.0105 / r);
    const g = box(0.0022, 0.0062, len);
    g.rotateZ(a);
    g.translate(Math.cos(a) * (r + 0.0004), Math.sin(a) * (r + 0.0004), -L / 2 + s + len / 2);
    out.push(solid(g, STENCIL));
  });
  return out;
}

/** Both sides' stencilling. */
const stencils = (L: number, r: number, s: number, lines: number[]) => [...stencil(L, r, s, 1.25, lines), ...stencil(L, r, s, -1.25 - lines.length * (0.0105 / r), lines)];

/** The jet vanes of a thrust-vectoring round, standing in the nozzle exit (in line with the fins). */
function vanes(L: number, exit: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const g = box(0.006, exit * 0.62, 0.075);
    g.translate(0, exit * 0.31 + 0.004, L / 2 - 0.03);
    g.rotateZ(Math.PI / 4 + (k * Math.PI) / 2);
    out.push(solid(g, NOZZLE, METAL));
  }
  return out;
}

/** The rollerons in the R-74M's tail-fin tips: little gyro wheels. */
function rollerons(L: number, r: number, f: Fins): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const w = lathe([[0.004, -0.004], [0.03, -0.004], [0.032, 0], [0.03, 0.004], [0.004, 0.004]], 18);
    w.rotateY(Math.PI / 2);
    const a = (f.rot ?? Math.PI / 4) + (k * Math.PI) / 2;
    const rad = r + f.span - 0.02;
    // (the wheel turns in the fin's plane: its axle across the fin)
    w.rotateZ(a + Math.PI / 2);
    w.translate(Math.cos(a) * rad, Math.sin(a) * rad, -L / 2 + f.s + f.sweep + f.tip - 0.035);
    out.push(solid(w, RING, METAL));
  }
  return out;
}

// ---------------------------------------------------------------- the rounds
const US_BODY = hex('#d6d8d4');
const US_RADOME = hex('#cbcbc3');
const US_GREY = hex('#b3b8bb');
const RU_BODY = hex('#c7cdcd');
const RU_DOME = hex('#e4e2d8');
const RU_GREEN = hex('#3e6a47');
const RU_RED = hex('#93281f');
const RU_DARK = hex('#7f898a');
const EU_BODY = hex('#d9d9d3');
const EU_RADOME = hex('#cdcdc5');
const EU_GREY = hex('#a3a7a7');

/** AIM-120D AMRAAM: 3.66 m x 178 mm. Clipped mid-body wings, tail control fins. */
function aim120d(): THREE.BufferGeometry {
  const L = 3.66, r = 0.089;
  const parts = body({
    L, r, nose: { kind: 'radome', len: 0.58 },
    // radome / guidance (WGU-41) / armament (WDU-41) / propulsion (WPU-16) / control (WCU-28)
    joints: [0.585, 1.14, 1.42, 3.27],
    bands: [[1.165, 1.19, YELLOW], [1.445, 1.47, BROWN]],
    paint: US_BODY, radome: US_RADOME, boat: [3.52, 0.079], exit: 0.05,
  });
  parts.push(...fins(L, r, { s: 1.5, root: 0.44, tip: 0.13, span: 0.17, sweep: 0.31, t: 0.045 }, US_BODY));
  parts.push(...fins(L, r, { s: L - 0.39, root: 0.33, tip: 0.18, span: 0.2, sweep: 0.15, t: 0.05 }, US_BODY));
  parts.push(...hooks(L, r, [1.28, 2.4]), raceway(L, r, 0.72, 3.2, 0.032, 0.018, US_BODY), umbilical(L, r, 1.55, 0.018, US_GREY));
  parts.push(...stencils(L, r, 0.66, [0.24, 0.18, 0.2]), ...stencils(L, r, 1.75, [0.3, 0.22]));
  return assemble(parts);
}

/** AIM-9X Sidewinder: 3.02 m x 127 mm. Glass dome, tiny fixed forward fins, clipped tail fins, jet vanes. */
function aim9x(): THREE.BufferGeometry {
  const L = 3.02, r = 0.0635;
  const parts = body({
    L, r, nose: { kind: 'ir', dome: r * 0.78, len: 0.26 },
    joints: [0.3, 0.86, 1.14, 2.66],
    bands: [[0.885, 0.91, YELLOW], [1.165, 1.19, BROWN]],
    paint: US_GREY, boat: [2.95, 0.058], exit: 0.044,
  });
  parts.push(...fins(L, r, { s: 0.48, root: 0.36, tip: 0.3, span: 0.035, sweep: 0.04, t: 0.06 }, US_GREY));
  parts.push(...fins(L, r, { s: L - 0.33, root: 0.28, tip: 0.12, span: 0.13, sweep: 0.15, t: 0.055 }, US_GREY));
  parts.push(...hooks(L, r, [0.88, 1.7, 2.5]), raceway(L, r, 0.55, 2.62, 0.026, 0.014, US_GREY), umbilical(L, r, 1.0, 0.014, US_BODY));
  parts.push(...stencils(L, r, 0.4, [0.2, 0.15]), ...stencils(L, r, 1.3, [0.26, 0.2]), ...vanes(L, 0.044));
  return assemble(parts);
}

/** R-77M: 3.71 m x 200 mm. Long low strakes along the body, four tail control fins. */
function r77m(): THREE.BufferGeometry {
  const L = 3.71, r = 0.1;
  const parts = body({
    L, r, nose: { kind: 'radome', len: 0.7 },
    joints: [0.705, 1.25, 1.6, 3.28],
    bands: [[1.275, 1.31, RU_GREEN], [1.625, 1.66, RU_RED]],
    paint: RU_BODY, radome: RU_DOME, boat: [3.56, 0.086], exit: 0.056,
  });
  parts.push(...fins(L, r, { s: 0.905, root: 1.25, tip: 0.9, span: 0.09, sweep: 0.3, t: 0.035 }, RU_BODY));
  parts.push(...fins(L, r, { s: L - 0.46, root: 0.4, tip: 0.2, span: 0.24, sweep: 0.2, t: 0.045 }, RU_DARK));
  parts.push(...hooks(L, r, [1.25, 2.4]), raceway(L, r, 0.78, 3.22, 0.036, 0.02, RU_DARK), umbilical(L, r, 1.6, 0.02, RU_DARK));
  parts.push(...stencils(L, r, 0.8, [0.22, 0.18, 0.14]), ...stencils(L, r, 1.9, [0.32]));
  return assemble(parts);
}

/** R-37M: 4.2 m x 380 mm. Long ogive radome, plain body, clipped-delta tail fins. */
function r37m(): THREE.BufferGeometry {
  const L = 4.2, r = 0.19;
  const parts = body({
    L, r, nose: { kind: 'radome', len: 0.95 },
    joints: [0.955, 1.6, 2.1, 3.85],
    bands: [[1.63, 1.7, RU_GREEN], [2.13, 2.2, RU_RED]],
    paint: RU_BODY, radome: RU_DOME, boat: [3.95, 0.16], exit: 0.11,
  });
  parts.push(...fins(L, r, { s: L - 0.62, root: 0.56, tip: 0.24, span: 0.3, sweep: 0.26, t: 0.05 }, RU_DARK));
  parts.push(...hooks(L, r, [1.3, 2.85]), raceway(L, r, 1.0, 3.62, 0.05, 0.03, RU_DARK), umbilical(L, r, 1.65, 0.03, RU_DARK));
  parts.push(...stencils(L, r, 1.05, [0.34, 0.26, 0.3]), ...stencils(L, r, 2.3, [0.42, 0.3]));
  return assemble(parts);
}

/** R-74M: 2.92 m x 170 mm. Glass dome, destabilisers and canards up front, tail fins with rollerons, gas vanes. */
function r74m(): THREE.BufferGeometry {
  const L = 2.92, r = 0.085;
  const tail: Fins = { s: L - 0.42, root: 0.38, tip: 0.2, span: 0.2, sweep: 0.18, t: 0.045 };
  const parts = body({
    L, r, nose: { kind: 'ir', dome: r * 0.8, len: 0.34 },
    joints: [0.352, 0.95, 1.5, 2.55],
    bands: [[0.05, 0.34, RU_DARK], [0.975, 1.01, RU_GREEN], [1.525, 1.56, RU_RED]],
    paint: RU_BODY, boat: [2.84, 0.072], exit: 0.05,
  });
  parts.push(...fins(L, r, { s: 0.14, root: 0.12, tip: 0.02, span: 0.07, sweep: 0.1, t: 0.03 }, RU_DARK));
  parts.push(...fins(L, r, { s: 0.36, root: 0.26, tip: 0.1, span: 0.15, sweep: 0.14, t: 0.04 }, RU_BODY));
  parts.push(...fins(L, r, tail, RU_BODY), ...rollerons(L, r, tail));
  parts.push(...hooks(L, r, [0.95, 2.0]), raceway(L, r, 0.62, 2.45, 0.03, 0.017, RU_DARK), umbilical(L, r, 1.1, 0.017, RU_DARK));
  parts.push(...stencils(L, r, 1.6, [0.24, 0.18]), ...vanes(L, 0.05));
  return assemble(parts);
}

/** Meteor: 3.65 m x 178 mm. No wings; the ramjet's two box intakes low on the flanks; four tail fins. */
function meteor(): THREE.BufferGeometry {
  const L = 3.65, r = 0.089;
  const parts = body({
    L, r, nose: { kind: 'radome', len: 0.66 },
    joints: [0.665, 1.2, 1.6, 3.12],
    bands: [[1.225, 1.25, YELLOW], [1.625, 1.65, BROWN]],
    paint: EU_BODY, radome: EU_RADOME, boat: [3.5, 0.082], exit: 0.064,
  });
  // the intakes: boxes faired onto the lower flanks (about 4 and 8 o'clock), a ramped front with the dark
  // mouth open under it, running back to the ramjet combustor
  for (const sd of [-1, 1]) {
    const a = sd * (Math.PI * 0.5 + 0.62);
    const s0 = 1.73, s1 = 3.08;
    const z0 = -L / 2 + s0, z1 = -L / 2 + s1;
    const duct = loftProfile({
      stations: stations(z0, z1, 16, 0.4, 0.3),
      profile: (zz) => {
        const u = Math.min(1, (zz - z0) / 0.28);
        const e = Math.min(1, (z1 - zz) / 0.25);
        const w = 0.05, h = 0.052 * (0.32 + 0.68 * u) * (0.25 + 0.75 * e);
        return [[w, -h * 0.2], [w, h], [-w, h], [-w, -h * 0.2]] as P2[];
      },
      sub: 1,
      full: true,
      capStart: true,
      capEnd: true,
    });
    tint(duct, (p, c) => (Math.abs(p.z - z0) < 0.004 ? c.copy(NOZZLE) : c.copy(EU_GREY), 0));
    duct.rotateZ(a + Math.PI / 2);
    duct.translate(Math.cos(a) * (r - 0.002), Math.sin(a) * (r - 0.002), 0);
    parts.push(duct);
  }
  parts.push(...fins(L, r, { s: L - 0.4, root: 0.36, tip: 0.2, span: 0.17, sweep: 0.16, t: 0.045 }, EU_BODY));
  parts.push(...hooks(L, r, [1.22, 2.28]), raceway(L, r, 0.75, 3.05, 0.032, 0.018, EU_GREY), umbilical(L, r, 1.5, 0.018, EU_GREY));
  parts.push(...stencils(L, r, 0.72, [0.22, 0.16]), ...stencils(L, r, 2.2, [0.26]));
  return assemble(parts);
}

/** MICA IR: 3.1 m x 160 mm. Glass dome, long low strakes, tail fins, thrust-vectoring vanes. */
function micaIr(): THREE.BufferGeometry {
  const L = 3.1, r = 0.08;
  const parts = body({
    L, r, nose: { kind: 'ir', dome: r * 0.82, len: 0.34 },
    joints: [0.352, 0.92, 1.3, 2.74],
    bands: [[0.945, 0.97, YELLOW], [1.325, 1.35, BROWN]],
    paint: EU_BODY, boat: [3.02, 0.068], exit: 0.05,
  });
  parts.push(...fins(L, r, { s: 0.55, root: 1.75, tip: 1.35, span: 0.06, sweep: 0.35, t: 0.03 }, EU_BODY));
  parts.push(...fins(L, r, { s: L - 0.36, root: 0.33, tip: 0.18, span: 0.17, sweep: 0.15, t: 0.045 }, EU_BODY));
  parts.push(...hooks(L, r, [0.95, 2.05]), raceway(L, r, 0.6, 2.7, 0.028, 0.016, EU_GREY), umbilical(L, r, 1.12, 0.016, EU_GREY));
  parts.push(...stencils(L, r, 1.45, [0.24, 0.18]), ...vanes(L, 0.05));
  return assemble(parts);
}

/** IRIS-T: 2.94 m x 127 mm. Glass dome on a slender seeker section, small fixed fins forward, tail fins, TVC vanes. */
function irisT(): THREE.BufferGeometry {
  const L = 2.94, r = 0.0635;
  const parts = body({
    L, r, nose: { kind: 'ir', dome: r * 0.8, len: 0.32 },
    joints: [0.332, 0.78, 1.05, 2.58],
    bands: [[0.805, 0.83, YELLOW], [1.075, 1.1, BROWN]],
    paint: EU_BODY, boat: [2.87, 0.056], exit: 0.043,
  });
  parts.push(...fins(L, r, { s: 0.5, root: 0.24, tip: 0.2, span: 0.05, sweep: 0.05, t: 0.05 }, EU_BODY));
  parts.push(...fins(L, r, { s: L - 0.36, root: 0.33, tip: 0.14, span: 0.12, sweep: 0.14, t: 0.05 }, EU_BODY));
  parts.push(...hooks(L, r, [0.82, 1.62, 2.42]), raceway(L, r, 0.5, 2.55, 0.024, 0.013, EU_GREY), umbilical(L, r, 0.95, 0.013, EU_GREY));
  parts.push(...stencils(L, r, 1.2, [0.22, 0.16]), ...vanes(L, 0.043));
  return assemble(parts);
}

const BUILD: Record<string, () => THREE.BufferGeometry> = {
  AIM120D: aim120d,
  AIM9X: aim9x,
  R77M: r77m,
  R37M: r37m,
  R74M: r74m,
  METEOR: meteor,
  MICAIR: micaIr,
  IRIST: irisT,
};

/** Is there a detailed model of this store? */
export function hasDetailedMissile(t: string): boolean {
  return t in BUILD;
}

/** The detailed model (always built at the standard mesh density, whatever model is being built). */
export function detailedMissile(t: string): THREE.BufferGeometry {
  const d = modelDensity();
  setModelDensity(1);
  try {
    return BUILD[t]();
  } finally {
    setModelDensity(d);
  }
}

/**
 * Teach a store material the `shine` attribute: glass glosses, bare metal turns metallic, paint is
 * unchanged (stores without the attribute read 0 and look as before).
 */
export function shinyStores<M extends THREE.MeshStandardMaterial>(m: M): M {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float shine;\nvarying float vShine;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShine = shine;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShine;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, clamp(vShine, 0.0, 1.0));')
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.65, clamp(vShine * 2.0, 0.0, 1.0) * (1.0 - step(0.9, vShine)));',
      );
  };
  m.customProgramCacheKey = () => 'store-shine-v1';
  return m;
}
