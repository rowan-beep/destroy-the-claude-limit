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

/** Station list from z0 to z1: `n` intervals, optionally clustered toward either end. */
export function stations(z0: number, z1: number, n: number, clusterStart = 0, clusterEnd = 0): number[] {
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

function crSeg(p0: P2, p1: P2, p2: P2, p3: P2, t: number, out: P2): P2 {
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
    const s = Math.max(1, sub[i] ?? 1);
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
  const N = spec.chordPts ?? 30;
  const sub = spec.spanSub ?? 6;
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
  const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2 - side * cantDeg * (Math.PI / 180));
  if (side < 0) m.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  m.premultiply(new THREE.Matrix4().makeTranslation(x, y, 0));
  return m;
}

// ---------------------------------------------------------------------------
// Revolved / swept primitives
// ---------------------------------------------------------------------------

/** Surface of revolution about an axis parallel to z through (cx, cy). profile: [radius, z]. */
export function lathe(profile: P2[], segs = 32, cx = 0, cy = 0, closeStart = false, closeEnd = false): THREE.BufferGeometry {
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
  // normals mirror exactly: flip x instead of recomputing (keeps seams identical)
  const n = m.attributes.normal as THREE.BufferAttribute | undefined;
  if (n) for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i));
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
}

const SKIN_VERT_PARS = /* glsl */ `
attribute vec3 skin;
varying vec3 vSkin;
varying vec3 vSkinN;
`;
const SKIN_FRAG_PARS = /* glsl */ `
uniform sampler2D skinTop;
uniform sampler2D skinBot;
uniform sampler2D skinSide;
uniform sampler2D skinSideR;
uniform vec4 skinBox;   // half, z0, len, y0
uniform float skinH;    // side height
uniform vec3 paintTop;
uniform vec3 paintBot;
varying vec3 vSkin;
varying vec3 vSkinN;
`;
const SKIN_FRAG = /* glsl */ `
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
    if ( wT > 0.01 ) { vec4 t = texture2D( skinTop, uT ); m += vec4( t.rgb * t.a, t.a ) * wT; }
    if ( wB > 0.01 ) { vec4 t = texture2D( skinBot, uB ); m += vec4( t.rgb * t.a, t.a ) * wB; }
    if ( wS > 0.01 ) { vec4 t = sn.x > 0.0 ? texture2D( skinSideR, uS ) : texture2D( skinSide, uS ); m += vec4( t.rgb * t.a, t.a ) * wS; }
    float up = smoothstep( -0.45, 0.35, sn.y );
    vec3 base = mix( paintBot, paintTop, up );
    diffuseColor.rgb *= base * ( 1.0 - m.a ) + m.rgb;
  }
`;

let skinId = 0;

/** Standard PBR paint with the projected livery. */
export function skinMaterial(p: SkinParams): THREE.MeshStandardMaterial {
  const tex = p.livery.textures();
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
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: p.roughness ?? 0.58, metalness: p.metalness ?? 0.22 });
  applySkin(mat, uniforms);
  return mat;
}

function applySkin(mat: THREE.MeshStandardMaterial, uniforms: Record<string, THREE.IUniform>): void {
  const id = ++skinId;
  mat.userData.skinUniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + SKIN_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = skin;\nvSkinN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SKIN_FRAG_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + SKIN_FRAG);
  };
  mat.customProgramCacheKey = () => 'skin-v1';
  void id;
}

/** Clone a material, keeping the livery shader if it has one. */
export function cloneMaterial<T extends THREE.Material>(m: T): T {
  const c = m.clone() as T;
  const u = (m as THREE.Material).userData?.skinUniforms as Record<string, THREE.IUniform> | undefined;
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
