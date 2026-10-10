// High-detail procedural modelling kit for the airframes.
//
//  * loftProfile  -- a smooth body lofted through cross-sections defined by
//                    control points (centripetal Catmull-Rom around the ring,
//                    dense stations along the body), so chines, LEX blades,
//                    fillets and flat bellies can all live in one surface.
//  * wing         -- lifting surfaces with a real airfoil, polygonal
//                    planforms (cranks, raked tips, dog-teeth), rounded tips,
//                    and chord cuts for control surfaces (blunt hinge faces,
//                    rounded control-surface noses).
//  * lathe / tube -- nozzles, radomes, wheels, struts, probes.
//  * SkinMaterial -- paint shader that projects hand-drawn livery canvases
//                    (panel lines, rivets, markings, weathering) from above,
//                    below and the side, with counter-shaded base colours.
//
// Body frame everywhere: x right, y up, z aft (the nose points to -z).

import * as THREE from 'three';
import { AIR_LIGHT } from '../../render/airLight';
import { blankAo } from './ao';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type P2 = [number, number];

// ---------------------------------------------------------------------------
// 1-D shaping curves
// ---------------------------------------------------------------------------

/** Monotone cubic (Fritsch-Carlson) curve through [t, value] keys; clamped outside. */
export function curve(keys: P2[]): (t: number) => number {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  if (n === 1) return () => ys[0];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-9, xs[i + 1] - xs[i]));
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const h = xs[hi] - xs[lo];
    const t = (x - xs[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi];
  };
}

/** Smoothstep between a and b. */
export function sstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Mesh density for the model being built: 1 = the standard airframe used for
// every jet in the air; the "hero" build (your own jet, the hangar) raises it
// so every loft, airfoil and turned part gets proportionally more samples.
let density = 1;

/** Set the mesh density for the models built next (1 = standard). */
export function setModelDensity(d: number): void {
  density = Math.max(0.3, d);
}

export function modelDensity(): number {
  return density;
}

/** A sample count scaled by the current density. */
export function dense(n: number): number {
  if (density >= 1) return Math.max(n, Math.round(n * density));
  // below 1 (the distance LOD): fewer samples, keeping even counts even
  let m = Math.max(Math.min(n, 3), Math.round(n * density));
  if (n % 2 === 0 && m % 2) m++;
  return Math.min(n, m);
}

/** Station list from z0 to z1: `n` intervals, optionally clustered toward either end. */
export function stations(z0: number, z1: number, n: number, clusterStart = 0, clusterEnd = 0): number[] {
  n = dense(n);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    let u = i / n;
    // blend a cosine clustering into a uniform distribution
    const cs = 1 - Math.cos((u * Math.PI) / 2);
    const ce = Math.sin((u * Math.PI) / 2);
    u = u * (1 - clusterStart - clusterEnd) + cs * clusterStart + ce * clusterEnd;
    out.push(z0 + (z1 - z0) * u);
  }
  return out;
}

/** Merge several station lists (sorted, near-duplicates removed). */
export function mergeStations(...lists: number[][]): number[] {
  const all = lists.flat().sort((a, b) => a - b);
  const out: number[] = [];
  for (const z of all) if (out.length === 0 || z - out[out.length - 1] > 0.004) out.push(z);
  return out;
}

// ---------------------------------------------------------------------------
// Closed Catmull-Rom rings
// ---------------------------------------------------------------------------

export function crSeg(p0: P2, p1: P2, p2: P2, p3: P2, t: number, out: P2): P2 {
  // centripetal Catmull-Rom (Barry-Goldman)
  const d01 = Math.max(1e-5, Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 0.5));
  const d12 = Math.max(1e-5, Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), 0.5));
  const d23 = Math.max(1e-5, Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), 0.5));
  const t0 = 0;
  const t1 = t0 + d01;
  const t2 = t1 + d12;
  const t3 = t2 + d23;
  const tt = t1 + (t2 - t1) * t;
  const res: number[] = [0, 0];
  for (let k = 0; k < 2; k++) {
    const a1 = ((t1 - tt) / (t1 - t0)) * p0[k] + ((tt - t0) / (t1 - t0)) * p1[k];
    const a2 = ((t2 - tt) / (t2 - t1)) * p1[k] + ((tt - t1) / (t2 - t1)) * p2[k];
    const a3 = ((t3 - tt) / (t3 - t2)) * p2[k] + ((tt - t2) / (t3 - t2)) * p3[k];
    const b1 = ((t2 - tt) / (t2 - t0)) * a1 + ((tt - t0) / (t2 - t0)) * a2;
    const b2 = ((t3 - tt) / (t3 - t1)) * a2 + ((tt - t1) / (t3 - t1)) * a3;
    res[k] = ((t2 - tt) / (t2 - t1)) * b1 + ((tt - t1) / (t2 - t1)) * b2;
  }
  out[0] = res[0];
  out[1] = res[1];
  return out;
}

/** Sample a closed Catmull-Rom loop through `ctrl`; `sub[i]` samples on segment i. */
export function ring(ctrl: P2[], sub: number[]): P2[] {
  const n = ctrl.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    // (a single sample is a deliberate crease: keep it sharp)
    const s0 = Math.max(1, sub[i] ?? 1);
    const s = s0 === 1 ? 1 : dense(s0);
    for (let k = 0; k < s; k++) out.push(crSeg(p0, p1, p2, p3, k / s, [0, 0]));
  }
  return out;
}

/** Mirror a right-half profile (bottom centre -> top centre) into a closed loop. */
export function mirrorHalf(half: P2[]): P2[] {
  const loop = half.slice();
  for (let i = half.length - 2; i >= 1; i--) loop.push([-half[i][0], half[i][1]]);
  return loop;
}

function halfSub(nPts: number, sub: number | number[]): number[] {
  const segs = nPts - 1;
  const s: number[] = [];
  for (let i = 0; i < segs; i++) s.push(typeof sub === 'number' ? sub : sub[i] ?? 2);
  // the mirrored side walks the same segments in reverse
  const loop = s.slice();
  for (let i = segs - 1; i >= 0; i--) loop.push(s[i]);
  return loop;
}

// ---------------------------------------------------------------------------
// Lofts
// ---------------------------------------------------------------------------

export interface LoftSpec {
  /** z stations, increasing */
  stations: number[];
  /**
   * Control points of the cross-section at z. Right half from the bottom
   * centreline (x = 0) round to the top centreline (x = 0), unless `full`.
   * The same number of points must come back for every z.
   */
  profile: (z: number) => P2[];
  /** samples per control segment (one number, or one per half-profile segment) */
  sub: number | number[];
  /** the profile is a complete closed loop (not mirrored) */
  full?: boolean;
  capStart?: boolean;
  capEnd?: boolean;
}

/** Smooth closed body through profiled cross-sections. Outward-facing. */
export function loftProfile(spec: LoftSpec): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  let ringLen = -1;
  for (const z of spec.stations) {
    const pts = spec.profile(z);
    const loop = spec.full ? pts : mirrorHalf(pts);
    const sub = spec.full ? (typeof spec.sub === 'number' ? new Array(pts.length).fill(spec.sub) : spec.sub) : halfSub(pts.length, spec.sub);
    const r = ring(loop, sub);
    if (ringLen < 0) ringLen = r.length;
    for (const [x, y] of r) pos.push(x, y, z);
  }
  const rows = spec.stations.length;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < ringLen; j++) {
      const a = i * ringLen + j;
      const b = i * ringLen + ((j + 1) % ringLen);
      const c = a + ringLen;
      const d = b + ringLen;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (row: number, start: boolean) => {
    let cx = 0;
    let cy = 0;
    for (let j = 0; j < ringLen; j++) {
      cx += pos[(row * ringLen + j) * 3];
      cy += pos[(row * ringLen + j) * 3 + 1];
    }
    const ci = pos.length / 3;
    pos.push(cx / ringLen, cy / ringLen, spec.stations[row]);
    for (let j = 0; j < ringLen; j++) {
      const a = row * ringLen + j;
      const b = row * ringLen + ((j + 1) % ringLen);
      if (start) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  };
  if (spec.capStart) cap(0, true);
  if (spec.capEnd) cap(rows - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Lifting surfaces
// ---------------------------------------------------------------------------

export interface WingStation {
  /** span coordinate (m) */
  x: number;
  /** leading / trailing edge z of the full chord */
  le: number;
  te: number;
  /** vertical offset of the chord plane (dihedral, washout) */
  y?: number;
  /** thickness / chord */
  t: number;
}

export interface WingSpec {
  sections: WingStation[];
  /** chordwise samples per side */
  chordPts?: number;
  /** spanwise subdivisions between consecutive sections */
  spanSub?: number;
  /** cut the chord: z of the front / back cut line as a function of span x (control surfaces, coves) */
  front?: (x: number) => number;
  back?: (x: number) => number;
  /** rounded tip (thickness closes over a small spanwise distance), rounded root, or flat caps */
  tip?: 'round' | 'flat';
  root?: 'round' | 'flat';
  /** chord-plane camber as a fraction of chord (positive = arched up) */
  camber?: number;
  /** position of max thickness (0.3 NACA 4-digit, 0.4..0.5 for thin supersonic sections) */
  thickPos?: number;
  /** transform from the build frame (x span, y up, z aft) into the body */
  matrix?: THREE.Matrix4;
}

/** Symmetric airfoil half-thickness for unit thickness ratio at chord fraction c (NACA 00xx family, closed TE). */
function halfThick(c: number, thickPos: number): number {
  // warp the chord so the thickest point lands at thickPos
  const k = Math.log(0.3) / Math.log(thickPos);
  const u = Math.pow(Math.min(1, Math.max(0, c)), k);
  return 5 * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1036 * u * u * u * u);
}

/** A tapered, swept lifting surface with a real section. */
export function wing(spec: WingSpec): THREE.BufferGeometry {
  const N = dense(spec.chordPts ?? 30);
  const sub = dense(spec.spanSub ?? 6);
  const tp = spec.thickPos ?? 0.38;
  const camber = spec.camber ?? 0;
  const secs = spec.sections;
  const bluntF = !!spec.front;
  const bluntB = !!spec.back;
  const NOSE = 7;
  // spanwise sample list: [x, thicknessScale]
  const xs: { x: number; ts: number; tipOff: number }[] = [];
  const x0 = secs[0].x;
  const x1 = secs[secs.length - 1].x;
  const interp = (x: number): WingStation => {
    if (x <= secs[0].x) return secs[0];
    for (let i = 0; i < secs.length - 1; i++) {
      const a = secs[i];
      const b = secs[i + 1];
      if (x <= b.x) {
        const f = (x - a.x) / Math.max(1e-9, b.x - a.x);
        return { x, le: a.le + (b.le - a.le) * f, te: a.te + (b.te - a.te) * f, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * f, t: a.t + (b.t - a.t) * f };
      }
    }
    return secs[secs.length - 1];
  };
  const tipR = (() => {
    const s = secs[secs.length - 1];
    return Math.max(0.004, (s.t * (s.te - s.le)) / 2);
  })();
  const rootR = (() => {
    const s = secs[0];
    return Math.max(0.004, (s.t * (s.te - s.le)) / 2);
  })();
  if (spec.root === 'round') {
    for (let k = 4; k >= 1; k--) {
      const th = (k / 4) * (Math.PI / 2);
      xs.push({ x: x0, ts: Math.cos(th), tipOff: -rootR * Math.sin(th) });
    }
  }
  for (let i = 0; i < secs.length - 1; i++) {
    const a = secs[i].x;
    const b = secs[i + 1].x;
    const n = Math.max(1, Math.round(sub * Math.max(0.35, Math.min(2.5, (b - a) / 1.0))));
    for (let k = 0; k < n; k++) xs.push({ x: a + ((b - a) * k) / n, ts: 1, tipOff: 0 });
  }
  xs.push({ x: x1, ts: 1, tipOff: 0 });
  if (spec.tip === 'round') {
    for (let k = 1; k <= 5; k++) {
      const th = (k / 5) * (Math.PI / 2);
      xs.push({ x: x1, ts: Math.cos(th), tipOff: tipR * Math.sin(th) });
    }
  }
  const pos: number[] = [];
  const idx: number[] = [];
  let ringLen = 0;
  for (const s of xs) {
    const w = interp(s.x);
    const chord = w.te - w.le;
    const zf = bluntF ? spec.front!(s.x) : w.le;
    const zb = bluntB ? spec.back!(s.x) : w.te;
    const f0 = Math.min(0.98, Math.max(0, (zf - w.le) / chord));
    const f1 = Math.max(f0 + 0.01, Math.min(1, (zb - w.le) / chord));
    const ht = (c: number) => halfThick(c, tp) * w.t * chord * 0.5 * s.ts;
    const cam = (c: number) => camber * chord * 4 * c * (1 - c);
    const pts: P2[] = [];
    // upper surface front -> back (cosine spacing)
    const cs: number[] = [];
    for (let i = 0; i <= N; i++) cs.push(f0 + ((f1 - f0) * (1 - Math.cos((Math.PI * i) / N))) / 2);
    const start = bluntF ? 0 : 0;
    for (let i = start; i <= N; i++) pts.push([w.le + cs[i] * chord, (w.y ?? 0) + cam(cs[i]) + ht(cs[i])]);
    if (bluntB) {
      // flat hinge face
      const c = cs[N];
      const yt = ht(c);
      for (let k = 1; k < 3; k++) pts.push([w.le + c * chord, (w.y ?? 0) + cam(c) + yt * (1 - (2 * k) / 3)]);
    }
    // lower surface back -> front
    const lowStart = bluntB ? N : N - 1;
    const lowEnd = bluntF ? 0 : 1;
    for (let i = lowStart; i >= lowEnd; i--) pts.push([w.le + cs[i] * chord, (w.y ?? 0) + cam(cs[i]) - ht(cs[i])]);
    if (bluntF) {
      // rounded nose ahead of the cut (control-surface leading edge)
      const c = cs[0];
      const r = Math.max(ht(c), 0.002);
      const zc = w.le + c * chord;
      const yc = (w.y ?? 0) + cam(c);
      // from the bottom, forward round the nose, up to the top
      for (let k = 1; k < NOSE; k++) {
        const th = (Math.PI * k) / NOSE;
        pts.push([zc - r * Math.sin(th), yc - r * Math.cos(th)]);
      }
    }
    ringLen = pts.length;
    const xOut = s.x + s.tipOff;
    for (const [z, y] of pts) pos.push(xOut, y, z);
  }
  const rows = xs.length;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < ringLen; j++) {
      const a = i * ringLen + j;
      const b = i * ringLen + ((j + 1) % ringLen);
      const c = a + ringLen;
      const d = b + ringLen;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (row: number, end: boolean) => {
    let cy = 0;
    let cz = 0;
    for (let j = 0; j < ringLen; j++) {
      cy += pos[(row * ringLen + j) * 3 + 1];
      cz += pos[(row * ringLen + j) * 3 + 2];
    }
    const ci = pos.length / 3;
    pos.push(pos[row * ringLen * 3], cy / ringLen, cz / ringLen);
    for (let j = 0; j < ringLen; j++) {
      const a = row * ringLen + j;
      const b = row * ringLen + ((j + 1) % ringLen);
      if (end) idx.push(ci, a, b);
      else idx.push(ci, b, a);
    }
  };
  if (spec.root !== 'round') cap(0, false);
  if (spec.tip !== 'round') cap(rows - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (spec.matrix) {
    g.applyMatrix4(spec.matrix);
    if (spec.matrix.determinant() < 0) flip(g);
  }
  return g;
}

/** Matrix taking a horizontal build frame (span +x) to a fin standing at (x, y) canted outboard by `cantDeg`. */
export function finMatrix(x: number, y: number, cantDeg: number, side: 1 | -1 = 1): THREE.Matrix4 {
  // build the right-hand fin (leaning out toward +x), then mirror it for the left
  const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2 - cantDeg * (Math.PI / 180));
  if (side < 0) m.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  m.premultiply(new THREE.Matrix4().makeTranslation(x, y, 0));
  return m;
}

// ---------------------------------------------------------------------------
// Revolved / swept primitives
// ---------------------------------------------------------------------------

/** Surface of revolution about an axis parallel to z through (cx, cy). profile: [radius, z]. */
export function lathe(profile: P2[], segs = 32, cx = 0, cy = 0, closeStart = false, closeEnd = false): THREE.BufferGeometry {
  segs = dense(segs);
  // smooth the profile too: Catmull-Rom samples between the given points
  if (density > 1 && profile.length > 2) profile = smoothOpen(profile, Math.round(density));
  const pos: number[] = [];
  const idx: number[] = [];
  for (const [r, z] of profile) {
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z);
    }
  }
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + ((j + 1) % segs);
      const c = a + segs;
      const d = b + segs;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (row: number, start: boolean) => {
    const ci = pos.length / 3;
    pos.push(cx, cy, profile[row][1]);
    for (let j = 0; j < segs; j++) {
      const a = row * segs + j;
      const b = row * segs + ((j + 1) % segs);
      if (start) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  };
  if (closeStart) cap(0, true);
  if (closeEnd) cap(profile.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Cylinder between two points. */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, segs = 12, caps = true): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, segs, 1, !caps);
  g.translate(0, len / 2, 0);
  const dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(a.x, a.y, a.z);
  return strip(g);
}

/** Smooth tube through points. */
export function tube(points: THREE.Vector3[], r: number, segs = 10, samples = 24): THREE.BufferGeometry {
  const c = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  return strip(new THREE.TubeGeometry(c, samples, r, segs, false));
}

/** Rounded box (bevelled), centred. */
export function roundBox(w: number, h: number, d: number, r: number, seg = 3): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const x = w / 2 - r;
  const y = h / 2 - r;
  s.moveTo(-x, -h / 2);
  s.lineTo(x, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y);
  s.lineTo(w / 2, y);
  s.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  s.lineTo(-x, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  s.lineTo(-w / 2, -y);
  s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelSize: r * 0.9, bevelThickness: r, bevelSegments: seg, curveSegments: seg * 2 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return strip(g);
}

/** Keep only position + normal (indexed) so everything merges. */
export function strip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) {
    const n = g.attributes.position.count;
    const ix: number[] = [];
    for (let i = 0; i < n; i++) ix.push(i);
    g.setIndex(ix);
  }
  return g;
}

export function flip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = g.index;
  if (index) {
    const arr = index.array as Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
    index.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

/** Mirrored copy across x = 0 (winding fixed). */
export function mirror(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  m.scale(-1, 1, 1);
  const index = m.index;
  if (index) {
    const arr = index.array as Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
    index.needsUpdate = true;
  }
  // (scale() already mirrors the normals exactly, which keeps the seams identical:
  // flipping their x again here used to turn every mirrored part's normals inward,
  // so the left-hand intakes, booms, tanks and tails were lit as if from inside)
  const s = m.attributes.skin as THREE.BufferAttribute | undefined;
  if (s) for (let i = 0; i < s.count; i++) s.setX(i, -s.getX(i));
  return m;
}

/** Geometry plus its mirror. */
export function both(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return join([g, mirror(g)]);
}

/** Merge indexed geometries sharing position / normal (/ skin). */
export function join(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const keepColor = gs.every((g) => g.attributes.color);
  const list = gs.map((g) => {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'skin' && !(keepColor && k === 'color')) g.deleteAttribute(k);
    if (!g.index) strip(g);
    return g;
  });
  const hasSkin = list.some((g) => g.attributes.skin);
  if (hasSkin) for (const g of list) if (!g.attributes.skin) stamp(g);
  return mergeGeometries(list, false)!;
}

/** Record body-frame positions for the livery projection (call while the geometry is in body space). */
export function stamp(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.attributes.skin) g.setAttribute('skin', (g.attributes.position as THREE.BufferAttribute).clone());
  return g;
}

// ---------------------------------------------------------------------------
// Livery: canvases projected from above, below and the side
// ---------------------------------------------------------------------------

export interface SkinBox {
  /** top / bottom canvases cover x, z in [-half, half] x [z0, z0 + 2 half] */
  half: number;
  z0: number;
  /** side canvas covers z0..z0+len, y0..y0+height */
  len: number;
  y0: number;
  height: number;
}

export class Livery {
  readonly top: HTMLCanvasElement;
  readonly bot: HTMLCanvasElement;
  readonly side: HTMLCanvasElement;
  readonly sideR: HTMLCanvasElement;
  readonly gt: CanvasRenderingContext2D;
  readonly gb: CanvasRenderingContext2D;
  /** left-side canvas (common side detail is drawn here, then copied right with `copySides`) */
  readonly gs: CanvasRenderingContext2D;
  readonly gr: CanvasRenderingContext2D;
  /** pixels per metre */
  readonly pt: number;
  readonly pb: number;
  readonly ps: number;
  /** metres covered by the side canvases vertically */
  readonly sideH: number;

  constructor(
    readonly box: SkinBox,
    topPx = 2048,
    botPx = 1024,
    sidePx = 2048,
  ) {
    const mk = (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    };
    this.top = mk(topPx, topPx);
    this.bot = mk(botPx, botPx);
    const sh = Math.round((sidePx * box.height) / box.len / 64) * 64;
    this.side = mk(sidePx, Math.max(256, sh));
    this.sideR = mk(sidePx, Math.max(256, sh));
    this.gt = this.top.getContext('2d')!;
    this.gb = this.bot.getContext('2d')!;
    this.gs = this.side.getContext('2d')!;
    this.gr = this.sideR.getContext('2d')!;
    this.pt = topPx / (2 * box.half);
    this.pb = botPx / (2 * box.half);
    this.ps = sidePx / box.len;
    this.sideH = this.side.height / this.ps;
  }

  /** canvas pixel for a body point seen from above (nose up) */
  T(x: number, z: number): P2 {
    return [(x + this.box.half) * this.pt, (z - this.box.z0) * this.pt];
  }
  /** seen from below (nose up, so the right wing is on the left) */
  B(x: number, z: number): P2 {
    return [(this.box.half - x) * this.pb, (z - this.box.z0) * this.pb];
  }
  /** seen from the left side (nose to the left) */
  S(z: number, y: number): P2 {
    return [(z - this.box.z0) * this.ps, (this.box.y0 + this.sideH - y) * this.ps];
  }

  /** Copy everything drawn on the left side canvas to the right one. */
  copySides(): void {
    this.gr.drawImage(this.side, 0, 0);
  }

  /** Text on both sides, reading correctly on each (the right canvas is mirrored at the text). */
  sideText(text: string, z: number, y: number, px: number, color: string, font = 'bold', angle = 0): void {
    const [x, yy] = this.S(z, y);
    for (const [g, sx] of [[this.gs, 1], [this.gr, -1]] as [CanvasRenderingContext2D, number][]) {
      g.save();
      g.translate(x, yy);
      g.scale(sx, 1);
      g.rotate(angle * sx);
      g.fillStyle = color;
      g.font = `${font} ${Math.max(4, px)}px "Arial Narrow", Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 0, 0);
      g.restore();
    }
  }

  /** Arbitrary drawing on both side canvases, mirrored on the right about a point (for roundels, badges). */
  sideDraw(z: number, y: number, draw: (g: CanvasRenderingContext2D, x: number, y: number) => void): void {
    const [x, yy] = this.S(z, y);
    draw(this.gs, x, yy);
    this.gr.save();
    this.gr.translate(x, yy);
    this.gr.scale(-1, 1);
    draw(this.gr, 0, 0);
    this.gr.restore();
  }

  private _tex: ReturnType<Livery['textures']> | null = null;
  /** The texture set, created once. */
  cachedTextures(): ReturnType<Livery['textures']> {
    if (!this._tex) this._tex = this.textures();
    return this._tex;
  }

  /** Map a CanvasTexture set for the shader. */
  textures(): { top: THREE.CanvasTexture; bot: THREE.CanvasTexture; side: THREE.CanvasTexture; sideR: THREE.CanvasTexture } {
    const mk = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    };
    return { top: mk(this.top), bot: mk(this.bot), side: mk(this.side), sideR: mk(this.sideR) };
  }
}

// ---------------------------------------------------------------------------
// Skin material
// ---------------------------------------------------------------------------

export interface SkinParams {
  top: THREE.Color;
  bottom: THREE.Color;
  livery: Livery;
  roughness?: number;
  metalness?: number;
  /** body z of the radome's joint: no fasteners ahead of it (a radome is one composite shell) */
  radomeZ?: number;
  /** body z of the radome's tip (its rain-erosion cap and lightning diverter strips are drawn from here to the joint) */
  radomeTip?: number;
  /** the radome's axis height at the tip and at the joint (a drooped radome) */
  radomeAxis?: [number, number];
  /**
   * shade lift for a metallic factory finish (metal loses its diffuse colour: this
   * keeps the jet's normal shade); not applied to the radome, which is plain paint
   */
  paintLift?: number;
}

const SKIN_VERT_PARS = /* glsl */ `
attribute vec3 skin;
varying vec3 vSkin;
varying vec3 vSkinN;
`;
const SKIN_FRAG_PARS = /* glsl */ `
uniform vec3 airBounce;
uniform sampler2D skinTop;
uniform sampler2D skinBot;
uniform sampler2D skinSide;
uniform sampler2D skinSideR;
uniform vec4 skinBox;   // half, z0, len, y0
uniform float skinH;    // side height
uniform vec3 paintTop;
uniform vec3 paintBot;
uniform float customMode;   // 0 factory, 1 solid, 2 wrap
uniform vec3 customA;
uniform vec3 customB;
uniform sampler2D customTex;
uniform float customScale;  // metres per wrap tile
uniform float brightness;
uniform float paintLift;
uniform float radomeZ;
uniform float radomeTip;
uniform vec2 radomeAxis;
uniform sampler3D aoTex;
uniform vec3 aoMin;
uniform vec3 aoSize;
uniform float aoOn;
varying vec3 vSkin;
varying vec3 vSkinN;
// value noise for paint mottling (airframe coordinates, metres)
float skinHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float skinNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( skinHash( i ), skinHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( skinHash( i + vec3( 0, 1, 0 ) ), skinHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( skinHash( i + vec3( 0, 0, 1 ) ), skinHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( skinHash( i + vec3( 0, 1, 1 ) ), skinHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
`;
const SKIN_FRAG = /* glsl */ `
  vec3 skinGlow = vec3( 0.0 );
  // ambient occlusion from the airframe's own volume (1 = open sky)
  float skinAO = 1.0;
  if ( aoOn > 0.5 ) {
    vec3 an = normalize( vSkinN );
    float o = 0.0;
    o += texture( aoTex, ( vSkin + an * 0.22 - aoMin ) / aoSize ).r * 0.55;
    o += texture( aoTex, ( vSkin + an * 0.5 - aoMin ) / aoSize ).r * 0.8;
    o += texture( aoTex, ( vSkin + an * 0.95 - aoMin ) / aoSize ).r * 0.7;
    o += texture( aoTex, ( vSkin + an * 1.7 - aoMin ) / aoSize ).r * 0.5;
    o += texture( aoTex, ( vSkin + an * 2.8 - aoMin ) / aoSize ).r * 0.35;
    skinAO = clamp( 1.0 - o * 0.42, 0.3, 1.0 );
    skinAO = skinAO * skinAO * ( 3.0 - 2.0 * skinAO );
  }
  // engraved seam depth (m) and paint roughness offset, used by the lighting stages
  float skinDepth = 0.0;
  float skinRough = 0.0;
  // metalness override where the skin is not the painted metal (the radome); < 0 = the material's own
  float skinMetal = -1.0;
  {
    vec3 sn = normalize( vSkinN );
    vec3 aw = pow( abs( sn ), vec3( 5.0 ) );
    float wT = sn.y > 0.0 ? aw.y : 0.0;
    float wB = sn.y < 0.0 ? aw.y : 0.0;
    float wS = aw.x + aw.z * 0.8;
    float ws = wT + wB + wS + 1e-5;
    wT /= ws; wB /= ws; wS /= ws;
    float hs = skinBox.x;
    vec2 uT = vec2( ( vSkin.x + hs ) / ( 2.0 * hs ), 1.0 - ( vSkin.z - skinBox.y ) / ( 2.0 * hs ) );
    vec2 uB = vec2( ( hs - vSkin.x ) / ( 2.0 * hs ), uT.y );
    float us = ( vSkin.z - skinBox.y ) / skinBox.z;
    vec2 uS = vec2( us, ( vSkin.y - skinBox.w ) / skinH );
    vec4 m = vec4( 0.0 );
    // mb: the same overlay heavily blurred (a low mip) -- thin strokes stand out against it
    vec4 mb = vec4( 0.0 );
    if ( wT > 0.01 ) { vec4 t = texture2D( skinTop, uT ); m += vec4( t.rgb * t.a, t.a ) * wT; vec4 b = texture2D( skinTop, uT, 3.5 ); mb += vec4( b.rgb * b.a, b.a ) * wT; }
    if ( wB > 0.01 ) { vec4 t = texture2D( skinBot, uB ); m += vec4( t.rgb * t.a, t.a ) * wB; vec4 b = texture2D( skinBot, uB, 3.0 ); mb += vec4( b.rgb * b.a, b.a ) * wB; }
    if ( wS > 0.01 ) {
      vec4 t = sn.x > 0.0 ? texture2D( skinSideR, uS ) : texture2D( skinSide, uS );
      vec4 b = sn.x > 0.0 ? texture2D( skinSideR, uS, 3.5 ) : texture2D( skinSide, uS, 3.5 );
      m += vec4( t.rgb * t.a, t.a ) * wS;
      mb += vec4( b.rgb * b.a, b.a ) * wS;
    }
    float up = smoothstep( -0.45, 0.35, sn.y );
    vec3 base = mix( paintBot, paintTop, up );
    if ( customMode > 0.5 ) {
      float shade = mix( 0.86, 1.0, up );
      base = customA * shade;
      // wrap weights: the mask projected from above/below, the side and the front
      float wF = aw.z / ( aw.x + aw.y + aw.z + 1e-5 );
      float wY = aw.y / ( aw.x + aw.y + aw.z + 1e-5 );
      float wX = 1.0 - wF - wY;
      if ( customMode > 1.5 && customMode < 2.5 ) {
        float t = texture2D( customTex, vSkin.xz / customScale ).r * wY
                + texture2D( customTex, vSkin.zy / customScale ).r * wX
                + texture2D( customTex, vSkin.xy / customScale ).r * wF;
        base = mix( customA, customB, t ) * shade;
      }
      if ( customMode > 2.5 && customMode < 3.5 ) {
        // BLACK ICE: black to glacial teal to frosted white along the jet, with
        // crystal facets, smoky wisps and glowing cracks
        vec3 tx = texture2D( customTex, vSkin.xz / customScale ).rgb * wY
                + texture2D( customTex, vSkin.zy / customScale ).rgb * wX
                + texture2D( customTex, vSkin.xy / customScale ).rgb * wF;
        float u = ( vSkin.z - skinBox.y ) / skinBox.z;
        u = clamp( u + ( tx.g - 0.3 ) * 0.35, 0.0, 1.2 );
        float t = smoothstep( 0.2, 0.85, u );
        float w = smoothstep( 0.95, 1.2, u ) * 0.5;
        vec3 ice = mix( customA, customB, t );
        ice = mix( ice, mix( customB, vec3( 0.92, 0.98, 1.0 ), 0.75 ), w );
        ice *= mix( 1.0, 0.55 + 0.6 * tx.b, t );
        ice += customB * tx.g * 0.35 * t;
        vec3 crackCol = mix( customB, vec3( 0.85, 1.0, 1.0 ), 0.5 );
        ice += crackCol * tx.r * ( 0.2 + 0.4 * t );
        base = ice * shade * 0.6;
        skinGlow = crackCol * tx.r * ( 0.1 + 0.2 * t ) + customB * tx.g * 0.1 * t;
      }
      if ( customMode > 3.5 ) {
        vec3 tx = texture2D( customTex, vSkin.xz / customScale ).rgb * wY
                + texture2D( customTex, vSkin.zy / customScale ).rgb * wX
                + texture2D( customTex, vSkin.xy / customScale ).rgb * wF;
        float u = clamp( ( vSkin.z - skinBox.y ) / skinBox.z, 0.0, 1.0 );
        vec3 col;
        vec3 glow;
        if ( customMode < 4.5 ) {
          // INFERNO: charred black plates split by molten veins, hotter toward the tail
          float heat = smoothstep( 0.2, 1.0, u + ( tx.g - 0.3 ) * 0.5 );
          vec3 ember = mix( customB, vec3( 1.0, 0.86, 0.35 ), tx.r * 0.8 );
          col = customA * ( 0.7 + 0.6 * tx.b ) + ember * tx.r * ( 0.3 + 0.7 * heat ) + customB * tx.g * heat * 0.4;
          glow = ember * tx.r * ( 0.25 + 0.9 * heat ) + customB * tx.g * heat * 0.3;
        } else if ( customMode < 5.5 ) {
          // AURORA: night-sky navy with rippling green-to-violet light curtains and stars
          float band = pow( tx.r, 1.6 ) * ( 0.55 + 0.45 * sin( u * 14.0 + tx.g * 6.0 ) );
          vec3 ac = mix( customB, vec3( 0.66, 0.3, 1.0 ), smoothstep( 0.2, 0.9, tx.g + 0.4 * sin( u * 6.0 ) ) );
          float star = pow( tx.b, 7.0 );
          col = customA * ( 0.8 + 0.3 * tx.g ) + ac * band * 0.45 + vec3( star ) * 0.8;
          glow = ac * band * 0.18 + vec3( star ) * 0.5;
        } else {
          // GALAXY: deep space, nebula clouds cut by dark dust lanes, glowing stars
          vec3 nc = mix( vec3( 0.2, 0.45, 1.0 ), customB, smoothstep( 0.2, 0.8, tx.r ) );
          nc = mix( nc, vec3( 1.0, 0.35, 0.6 ), smoothstep( 0.65, 1.0, tx.r ) * 0.6 );
          float neb = smoothstep( 0.35, 1.0, tx.r ) * ( 1.0 - 0.9 * tx.g );
          float star = pow( tx.b, 6.0 );
          col = customA * 0.7 + nc * neb * 0.35 + vec3( star ) * 0.8;
          glow = nc * neb * 0.08 + vec3( star ) * 0.5;
        }
        base = col * shade * 0.8;
        skinGlow = glow;
      }
    }
    // --- realism: engraved panel lines, paint mottling, grime ---------------
    // dark livery strokes (panel lines, rivets, access doors) are recessed seams
    // (high-pass: only thin dark strokes -- not camouflage or roundels -- become seams)
    float lumA = dot( base * ( 1.0 - m.a ) + m.rgb, vec3( 0.3333 ) );
    float lumB = dot( base * ( 1.0 - mb.a ) + mb.rgb, vec3( 0.3333 ) );
    float dark = clamp( ( lumB - lumA ) * 3.0, 0.0, 1.0 );
    skinDepth = dark * 0.0065;
    // weathering is kept apart from the paint colour and applied over the finished
    // livery, so it shows on jets painted all over (camouflage) as well as plain ones
    vec3 wear = vec3( 1.0 );
    float chipAmt = 0.0;
    // paint that has been sprayed and touched up panel by panel: gentle tone and sheen variation
    float n1 = skinNoise( vSkin * 1.3 );
    float n2 = skinNoise( vSkin * 4.7 + 11.0 );
    float n3 = skinNoise( vSkin * 0.35 - 7.0 );
    wear *= 0.955 + 0.06 * n1 + 0.03 * n3;
    // panels resprayed at different times: a patchwork of slightly different greys,
    // in blocks about the size of the real access panels
    vec3 cell = floor( vSkin * vec3( 0.85, 1.1, 0.6 ) + vec3( 0.37, 0.71, 0.13 ) );
    float ph = fract( sin( dot( cell, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
    wear *= 0.965 + 0.07 * ph;
    skinRough = ( n2 - 0.5 ) * 0.12 + ( n1 - 0.5 ) * 0.08 + dark * 0.12 + ( ph - 0.5 ) * 0.1;
    // streaks of dirt and fluid drawn back along the airflow (long along the jet, thin across)
    float fl = skinNoise( vec3( vSkin.x * 7.0, vSkin.y * 7.0, vSkin.z * 0.45 ) + 3.0 );
    float fl2 = skinNoise( vec3( vSkin.x * 19.0, vSkin.y * 19.0, vSkin.z * 0.9 ) - 5.0 );
    // exhaust and hydraulic grime collects underneath and aft
    float under = smoothstep( 0.1, -0.7, sn.y );
    float t = ( vSkin.z - skinBox.y ) / skinBox.z;
    float aft = smoothstep( 0.45, 1.0, t );
    float streak = smoothstep( 0.45, 0.8, fl ) * 0.5 + smoothstep( 0.55, 0.85, fl2 ) * 0.5;
    wear *= 1.0 - ( under * 0.1 + aft * 0.12 ) * ( 0.6 + 0.4 * n2 ) - streak * ( 0.05 + 0.1 * under + 0.08 * aft );
    // soot and heat staining round the engine bays: brown-grey on the last metres of the fuselage
    float soot = smoothstep( 0.8, 0.98, t ) * ( 0.4 + 0.6 * under ) * ( 0.7 + 0.3 * n1 );
    wear *= mix( vec3( 1.0 ), vec3( 0.62, 0.58, 0.54 ), soot * 0.8 );
    skinRough += soot * 0.12 + streak * 0.05;
    // leading edges: rain and grit wear the paint smoother and a little lighter
    float lead = smoothstep( -0.55, -0.9, sn.z );
    wear *= 1.0 + lead * 0.05 * ( 0.5 + n2 );
    skinRough -= lead * 0.12;
    // --- close range: fasteners, paint texture and chips ----------------------
    // (skinPx: metres of skin covered by one pixel here. Each detail is drawn no
    // smaller than about a pixel, a little fainter as it grows, and fades out
    // before it could shimmer, so from a distance the jet looks just as before)
    float skinPx = length( fwidth( vSkin ) );
    float skinNear = 1.0 - smoothstep( 0.0018, 0.007, skinPx );
    float skinMid = 1.0 - smoothstep( 0.03, 0.07, skinPx );
    if ( skinMid > 0.001 ) {
      // the coordinate around the body: across the jet on top and bottom, up the side
      float sAcross = mix( vSkin.x, vSkin.y, wS );
      // fastener heads are about 4.5 mm across; further away they are drawn a pixel
      // wide and run together, so the rows still read as the faint stitched lines you
      // see in photos (the rows are tens of pixels apart by then, so they never shimmer)
      float rr = max( 0.0022, skinPx * 0.5 );
      float rk = pow( 0.0022 / rr, 0.2 ) * skinMid;
      // frame lines: a row of flush fasteners at every fuselage frame, 0.5 m apart,
      // panel by panel (broken up so they never read as a grid)
      float fz = vSkin.z / 0.5 + 0.5;
      float dz = ( fract( fz ) - 0.5 ) * 0.5;
      float rowOn = step( 0.38, skinHash( vec3( floor( fz ), floor( sAcross / 1.3 ), 3.0 ) ) );
      float ds = ( fract( sAcross / 0.045 + 0.5 ) - 0.5 ) * 0.045;
      float rivA = ( 1.0 - smoothstep( rr * 0.7, rr * 1.25, length( vec2( dz, ds ) ) ) ) * rowOn;
      // stringers: rows running along the jet, 0.42 m apart
      float fs = sAcross / 0.42 + 0.5;
      float ds2 = ( fract( fs ) - 0.5 ) * 0.42;
      float rowOn2 = step( 0.5, skinHash( vec3( floor( fs ), floor( vSkin.z / 1.6 ), 7.0 ) ) );
      float dz2 = ( fract( vSkin.z / 0.05 + 0.5 ) - 0.5 ) * 0.05;
      float rivB = ( 1.0 - smoothstep( rr * 0.7, rr * 1.25, length( vec2( dz2, ds2 ) ) ) ) * rowOn2;
      // screws round the access panels: along the drawn seams, every 6 cm
      float sr = max( 0.003, skinPx * 0.5 );
      float sc = ( 1.0 - smoothstep( sr * 0.8, sr * 1.2, length( vec2( ( fract( vSkin.z / 0.06 + 0.5 ) - 0.5 ) * 0.06, ( fract( sAcross / 0.06 + 0.5 ) - 0.5 ) * 0.06 ) ) ) ) * smoothstep( 0.15, 0.5, dark ) * pow( 0.003 / sr, 0.2 );
      float fast = max( max( rivA, rivB ) * 0.8 * rk, sc * skinMid ) * step( radomeZ, vSkin.z );
      // heads sit a hair proud of the paint, a little darker and duller where it is thin
      skinDepth -= fast * 0.00045 * skinNear;
      wear *= 1.0 - fast * 0.28;
      skinRough += fast * 0.15;
      // the paint itself: a fine "orange peel" texture that breaks up the reflections
      float peel = skinNoise( vSkin * 260.0 ) - 0.5;
      skinDepth += peel * 0.00003 * skinNear;
      // chipped and worn paint on the leading edges and round the panels: grey primer showing
      float chipN = skinNoise( vSkin * 9.0 + 17.0 ) * 0.75 + skinNoise( vSkin * 31.0 - 4.0 ) * 0.25;
      chipAmt = smoothstep( 0.74, 0.79, chipN ) * clamp( lead * 1.4 + dark * 0.6 + under * 0.15, 0.0, 1.0 ) * ( 1.0 - smoothstep( 0.03, 0.07, skinPx ) );
      skinRough += chipAmt * 0.18;
      // the radome's latches: a ring of bigger screw heads just behind the joint, 7 cm apart
      if ( radomeZ > -1000.0 ) {
        float jr = max( 0.0035, skinPx * 0.5 );
        float jd = length( vec2( vSkin.z - ( radomeZ + 0.035 ), ( fract( sAcross / 0.07 + 0.5 ) - 0.5 ) * 0.07 ) );
        float latch = ( 1.0 - smoothstep( jr * 0.8, jr * 1.25, jd ) ) * pow( 0.0035 / jr, 0.2 ) * skinMid;
        skinDepth -= latch * 0.0005 * skinNear;
        wear *= 1.0 - latch * 0.32;
        skinRough += latch * 0.1;
      }
    }
    // --- the radome: a composite shell, painted, not metal ----------------------
    // (only on a jet that has one: radomeZ is far ahead of the airframe otherwise)
    if ( vSkin.z < radomeZ ) {
      float len = max( 0.1, radomeZ - radomeTip );
      float along = clamp( ( vSkin.z - radomeTip ) / len, 0.0, 1.0 ); // 0 tip, 1 joint
      float ay = mix( radomeAxis.x, radomeAxis.y, along );
      vec2 rq = vec2( vSkin.x, vSkin.y - ay );
      float rr2 = length( rq );
      skinMetal = 0.02;
      // a plain satin paint over the composite (not the metallic finish of the
      // metal panels), with faint patchy touch-ups and grime toward the joint and underneath
      skinRough = skinRough * 0.5 + 0.16;
      float patchN = skinNoise( vSkin * vec3( 2.2, 2.2, 0.9 ) + 31.0 );
      wear *= 1.0 - 0.05 * smoothstep( 0.55, 0.8, patchN ) - 0.04 * smoothstep( 0.2, -0.6, sn.y ) * along;
      // rain-erosion cap at the tip: a darker, harder coat over the last 14 cm
      float cap = 1.0 - smoothstep( 0.12, 0.16, vSkin.z - radomeTip );
      wear *= mix( 1.0, 0.62, cap );
      skinRough -= cap * 0.12;
      // lightning diverter strips: eight rows of small metal buttons from the joint
      // most of the way to the tip (they fade out with distance before they could shimmer)
      float skinClose = 1.0 - smoothstep( 0.004, 0.012, skinPx );
      if ( skinClose > 0.001 ) {
        float ang = atan( rq.y, rq.x );
        float sector = 6.2831853 / 8.0;
        float da = abs( fract( ang / sector - 0.5 ) - 0.5 ) * sector * rr2;
        float sw = max( 0.0028, skinPx * 0.6 );
        float onRow = ( 1.0 - smoothstep( sw * 0.6, sw * 1.2, da ) ) * smoothstep( 0.2, 0.3, along ) * ( 1.0 - smoothstep( 0.97, 1.0, along ) );
        float btn = smoothstep( 0.15, 0.25, fract( vSkin.z / 0.022 ) ) * ( 1.0 - smoothstep( 0.65, 0.75, fract( vSkin.z / 0.022 ) ) );
        float strip = onRow * mix( 1.0, btn, skinNear ) * skinClose * pow( 0.0028 / sw, 0.3 );
        wear = mix( wear, wear * vec3( 1.18, 1.2, 1.22 ), strip * 0.7 );
        skinMetal = mix( skinMetal, 0.85, strip );
        skinRough -= strip * 0.15;
        skinDepth -= strip * 0.0004 * skinNear;
      }
    }
    float lift = vSkin.z < radomeZ ? 1.0 : paintLift;
    diffuseColor.rgb *= ( base * ( 1.0 - m.a ) + m.rgb ) * brightness * wear * lift;
    // (the primer is a colour of its own, so it shows on light and dark jets alike)
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.25, 0.26, 0.24 ), chipAmt * 0.75 );
  }
`;

/** Occlusion: sky light and reflections fade in the airframe's nooks; direct sun a little. */
const SKIN_AO = /* glsl */ `
  reflectedLight.indirectDiffuse *= skinAO;
  reflectedLight.indirectSpecular *= mix( skinAO, 1.0, 0.25 ) * skinAO;
  reflectedLight.directDiffuse *= mix( 1.0, skinAO, 0.3 );
  reflectedLight.directSpecular *= mix( 1.0, skinAO, 0.45 );
`;

/** Recessed seams: screen-space bump from the seam depth (in metres, so it fades with distance). */
const SKIN_NORMAL = /* glsl */ `
  {
    vec2 dh = vec2( dFdx( skinDepth ), dFdy( skinDepth ) );
    vec3 sx = dFdx( -vViewPosition );
    vec3 sy = dFdy( -vViewPosition );
    vec3 r1 = cross( sy, normal );
    vec3 r2 = cross( normal, sx );
    float det = dot( sx, r1 ) * faceDirection;
    vec3 grad = sign( det ) * ( dh.x * r1 + dh.y * r2 );
    vec3 bumped = normalize( abs( det ) * normal - grad );
    normal = normalize( mix( normal, bumped, step( 1e-12, abs( det ) ) ) );
  }
`;

/**
 * Sunlight bounced off the ground below: a surface facing straight down sees
 * only ground, a vertical one half ground and half sky (the view factor).
 */
const SKIN_BOUNCE = /* glsl */ `
  {
    vec3 wN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
    float toGround = 0.5 * ( 1.0 - wN.y );
    reflectedLight.indirectDiffuse += airBounce * toGround * material.diffuseColor * skinAO;
  }
`;

let skinId = 0;
let _blank: THREE.DataTexture | null = null;
function blankTex(): THREE.DataTexture {
  if (!_blank) {
    _blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    _blank.needsUpdate = true;
  }
  return _blank;
}

/**
 * A copy of a livery material with its own paint uniforms (the player's
 * custom paint job) -- same livery textures, unless `plain` markings (no
 * factory camouflage) are given.
 */
export function customSkinMaterial(base: THREE.MeshStandardMaterial, plain: Livery | null): THREE.MeshStandardMaterial {
  const src = base.userData.skinUniforms as Record<string, THREE.IUniform>;
  const u: Record<string, THREE.IUniform> = {};
  for (const [k, v] of Object.entries(src)) u[k] = { value: v.value && typeof v.value.clone === 'function' && !(v.value instanceof THREE.Texture) ? v.value.clone() : v.value };
  if (plain) {
    const t = plain.cachedTextures();
    u.skinTop.value = t.top;
    u.skinBot.value = t.bot;
    u.skinSide.value = t.side;
    u.skinSideR.value = t.sideR;
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: base.roughness, metalness: base.metalness });
  applySkin(mat, u);
  return mat;
}

/** Standard PBR paint with the projected livery. */
export function skinMaterial(p: SkinParams): THREE.MeshStandardMaterial {
  const tex = p.livery.cachedTextures();
  const b = p.livery.box;
  const uniforms = {
    skinTop: { value: tex.top },
    skinBot: { value: tex.bot },
    skinSide: { value: tex.side },
    skinSideR: { value: tex.sideR },
    skinBox: { value: new THREE.Vector4(b.half, b.z0, b.len, b.y0) },
    skinH: { value: p.livery.sideH },
    paintTop: { value: p.top.clone() },
    paintBot: { value: p.bottom.clone() },
    customMode: { value: 0 },
    customA: { value: new THREE.Color(0xffffff) },
    customB: { value: new THREE.Color(0x000000) },
    customTex: { value: blankTex() },
    customScale: { value: 4 },
    brightness: { value: 1 },
    paintLift: { value: p.paintLift ?? 1 },
    radomeZ: { value: p.radomeZ ?? -1e4 },
    radomeTip: { value: p.radomeTip ?? -1e4 - 1 },
    radomeAxis: { value: new THREE.Vector2(...(p.radomeAxis ?? [0, 0])) },
    aoTex: { value: blankAo() },
    aoMin: { value: new THREE.Vector3() },
    aoSize: { value: new THREE.Vector3(1, 1, 1) },
    aoOn: { value: 0 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: p.roughness ?? 0.58, metalness: p.metalness ?? 0.22 });
  applySkin(mat, uniforms);
  return mat;
}

function applySkin(mat: THREE.MeshStandardMaterial, uniforms: Record<string, THREE.IUniform>): void {
  const id = ++skinId;
  mat.userData.skinUniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, AIR_LIGHT);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = skin;\nvSkinN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_FRAG_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + SKIN_FRAG)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor + skinRough, 0.05, 1.0 );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif ( skinMetal >= 0.0 ) metalnessFactor = skinMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + SKIN_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += skinGlow;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + SKIN_AO)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + SKIN_BOUNCE);
  };
  mat.customProgramCacheKey = () => 'skin-v16';
  void id;
}

/** Clone a material, keeping the livery shader if it has one. */
export function cloneMaterial<T extends THREE.Material>(m: T): T {
  // Material.clone() deep-copies userData through JSON: with the livery's
  // uniforms (big texture arrays) in there that took seconds per material.
  // Detach it while cloning and share it by reference instead.
  const ud = m.userData;
  m.userData = {};
  let c: T;
  try {
    c = m.clone() as T;
  } finally {
    m.userData = ud;
  }
  c.userData = { ...ud };
  const u = ud?.skinUniforms as Record<string, THREE.IUniform> | undefined;
  if (u && c instanceof THREE.MeshStandardMaterial) applySkin(c, u);
  return c;
}

// ---------------------------------------------------------------------------
// Canvas drawing helpers for liveries
// ---------------------------------------------------------------------------

/** Deterministic PRNG so every jet of a type gets the same weathering. */
export function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Panel line polyline in canvas pixels. */
export function line(g: CanvasRenderingContext2D, pts: P2[], width: number, color = 'rgba(20,24,28,0.55)', close = false): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  pts.forEach((p, i) => (i === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
  if (close) g.closePath();
  g.stroke();
}

/** Row of rivets between two canvas points. */
export function rivets(g: CanvasRenderingContext2D, a: P2, b: P2, spacing: number, r: number, color = 'rgba(25,28,32,0.28)'): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.floor(len / spacing));
  g.fillStyle = color;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    g.beginPath();
    g.arc(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, r, 0, Math.PI * 2);
    g.fill();
  }
}

/** Soft weathering: blotches and streaks of darker / lighter paint. */
export function weather(g: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, amount = 1, streakDir: P2 = [0, 1]): void {
  for (let i = 0; i < 700 * amount; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 6 + rnd() * 60;
    const dark = rnd() < 0.62;
    const a = 0.018 + rnd() * 0.03;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, dark ? `rgba(30,32,34,${a})` : `rgba(235,238,240,${a * 0.8})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // exhaust / fluid streaks
  g.lineCap = 'round';
  for (let i = 0; i < 160 * amount; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const L = 20 + rnd() * 140;
    g.strokeStyle = `rgba(28,30,32,${0.02 + rnd() * 0.035})`;
    g.lineWidth = 1 + rnd() * 5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + streakDir[0] * L, y + streakDir[1] * L);
    g.stroke();
  }
}

/** Stencil text (small maintenance markings, "NO STEP", etc.). */
export function stencil(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color = 'rgba(30,32,36,0.7)', angle = 0, align: CanvasTextAlign = 'center'): void {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = color;
  g.font = `bold ${Math.max(4, px)}px "Arial Narrow", Arial, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  g.restore();
}

/** Coalition roundel (BLUE: star in a blue disc; RED: triangle in a red disc), low-visibility greys. */
export function roundel(g: CanvasRenderingContext2D, team: string, x: number, y: number, r: number, angle = 0): void {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.globalAlpha = 0.9;
  g.fillStyle = team === 'blue' ? '#2d4d8e' : '#9a2521';
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(230,232,228,0.9)';
  g.lineWidth = r * 0.07;
  g.beginPath();
  g.arc(0, 0, r * 0.93, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#e8e9e4';
  g.beginPath();
  if (team === 'blue') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r * 0.8 : r * 0.27;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  } else {
    g.moveTo(0, -r * 0.72);
    g.lineTo(r * 0.66, r * 0.46);
    g.lineTo(-r * 0.66, r * 0.46);
  }
  g.closePath();
  g.fill();
  g.restore();
}

/** Stroke a closed polygon given in body coordinates through a mapping. */
export function panel(g: CanvasRenderingContext2D, map: (a: number, b: number) => P2, pts: P2[], width: number, color?: string): void {
  line(g, pts.map(([a, b]) => map(a, b)), width, color, true);
}

export const LINE = 'rgba(18,22,26,0.5)';
export const LINE_LIGHT = 'rgba(18,22,26,0.3)';

// ---------------------------------------------------------------------------
// Free-form ring skinning
// ---------------------------------------------------------------------------

export type P3 = [number, number, number];

/**
 * Connect consecutive closed rings (same point count). Rings advancing toward
 * +z with counter-clockwise points (seen from +z) face outward; walking
 * backwards (an intake duct) faces inward, as a duct interior should.
 */
export function skinRings(rings: P3[][], closeRing = true, capStart = false, capEnd = false): THREE.BufferGeometry {
  const n = rings[0].length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
  const segs = closeRing ? n : n - 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = a + n;
      const d = b + n;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (row: number, start: boolean) => {
    const r = rings[row];
    let cx = 0, cy = 0, cz = 0;
    for (const p of r) {
      cx += p[0];
      cy += p[1];
      cz += p[2];
    }
    const ci = pos.length / 3;
    pos.push(cx / n, cy / n, cz / n);
    for (let j = 0; j < segs; j++) {
      const a = row * n + j;
      const b = row * n + ((j + 1) % n);
      if (start) idx.push(ci, b, a);
      else idx.push(ci, a, b);
    }
  };
  if (capStart) cap(0, true);
  if (capEnd) cap(rings.length - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Offset a closed CCW loop outward by d (negative = inward). */
export function offsetLoop(loop: P2[], d: number): P2[] {
  const n = loop.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n];
    const b = loop[(i + 1) % n];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    // outward normal of a CCW loop is the tangent rotated clockwise
    out.push([loop[i][0] + (ty / l) * d, loop[i][1] - (tx / l) * d]);
  }
  return out;
}

/** Rounded-rectangle control loop (CCW) centred on (cx, cy). */
export function rrect(cx: number, cy: number, hw: number, hh: number, r: number, sub = 4): P2[] {
  const pts: P2[] = [];
  const corners: [number, number, number][] = [
    [cx + hw - r, cy - hh + r, -Math.PI / 2],
    [cx + hw - r, cy + hh - r, 0],
    [cx - hw + r, cy + hh - r, Math.PI / 2],
    [cx - hw + r, cy - hh + r, Math.PI],
  ];
  for (const [x, y, a0] of corners) {
    for (let k = 0; k <= sub; k++) {
      const a = a0 + (k / sub) * (Math.PI / 2);
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** Resample a closed polyline to `n` points evenly by arc length. */
/** Catmull-Rom resample of an open polyline (ends kept), `k` samples per segment. */
function smoothOpen(pts: P2[], k: number): P2[] {
  const out: P2[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let j = 0; j < k; j++) out.push(crSeg(p0, p1, p2, p3, j / k, [0, 0]));
  }
  out.push(pts[n - 1]);
  return out;
}

export function resample(loop: P2[], n: number): P2[] {
  const m = loop.length;
  const acc: number[] = [0];
  for (let i = 0; i < m; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % m];
    acc.push(acc[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = acc[m];
  const out: P2[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * L;
    while (seg < m - 1 && acc[seg + 1] < s) seg++;
    const a = loop[seg];
    const b = loop[(seg + 1) % m];
    const t = (s - acc[seg]) / Math.max(1e-9, acc[seg + 1] - acc[seg]);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Move every vertex through fn (then recompute normals). */
export function deform(g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const pa = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i);
    fn(v);
    pa.setXYZ(i, v.x, v.y, v.z);
  }
  pa.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Per-vertex colour from a function of position. */
export function colorize(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, out: THREE.Color) => void): THREE.BufferGeometry {
  const pa = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pa.count * 3);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i);
    fn(v, c);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/** Interpolate a list of keyed control-point sections into a profile function. */
export function keyedProfile(keys: { z: number; pts: P2[] }[]): (z: number) => P2[] {
  const n = keys[0].pts.length;
  const cx: ((z: number) => number)[] = [];
  const cy: ((z: number) => number)[] = [];
  for (let i = 0; i < n; i++) {
    cx.push(curve(keys.map((k) => [k.z, k.pts[i][0]] as P2)));
    cy.push(curve(keys.map((k) => [k.z, k.pts[i][1]] as P2)));
  }
  return (z: number) => {
    const out: P2[] = [];
    for (let i = 0; i < n; i++) out.push([cx[i](z), cy[i](z)]);
    return out;
  };
}
