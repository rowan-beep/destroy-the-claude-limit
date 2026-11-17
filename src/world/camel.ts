// Dune Sea: dromedary camels, walking (model built in code, legs animated in the vertex shader).
//
// One BufferGeometry per level of detail. Everything is a lofted tube (rings of vertices along a
// path, with smooth normals) or a squashed sphere, merged into one indexed mesh with the attributes
//   position, normal, color (linear), and for the walk shader:
//   aLeg   0 body, 1 front-left, 2 front-right, 3 hind-left, 4 hind-right, 5 neck + head, 6 tail
//   aJoint 0..1 how far the vertex follows the knee/hock fold (legs), the neck bob (neck), the tail swing
//   aFoot  0..1 how far the vertex follows the ankle (the foot stays flat on the sand)
// The camel faces -z, left legs are at x < 0, y = 0 is the ground.

import * as THREE from 'three';

// ---------------------------------------------------------------- gait constants (shared with GLSL)
const CYCLE = 1.85; // seconds for one full stride cycle
const SWING = 0.4; // fraction of the cycle a foot is in the air (pace: stance lasts 60%)
const HTAN = 0.44; // tan of the leg swing angle at the extremes (about 24 degrees)
const HIP_Y = 1.62; // hip / shoulder pivot height
const FRONT_Z = -0.68; // front leg pivot z
const HIND_Z = 0.8; // hind leg pivot z
const FRONT_KNEE = [0.62, -0.7]; // (y, z) carpus
const HIND_KNEE = [0.6, 1.0]; // (y, z) hock
const FRONT_ANKLE = [0.15, -0.7];
const HIND_ANKLE = [0.14, 0.915];
const NECK_BASE = [1.6, -0.6]; // (y, z) the neck bob pivots here
const TAIL_ROOT = [1.6, 0.95]; // (y, z)

/** Walking speed (m/s) that matches the leg swing at aWalk = 1 (feet do not slide): a stance foot
 *  travels 2 * HIP_Y * HTAN metres while it is on the ground for (1 - SWING) of the cycle. */
export const CAMEL_WALK_SPEED = Math.round(((2 * HIP_Y * HTAN) / ((1 - SWING) * CYCLE)) * 100) / 100;

// ---------------------------------------------------------------- colours
const col = (r: number, g: number, b: number): number[] => {
  const c = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
};
const TAN = col(0.77, 0.6, 0.41); // fawn body
const TAN_LIGHT = col(0.8, 0.64, 0.44);
const MANE = col(0.38, 0.26, 0.16); // neck crest
const HUMP = col(0.45, 0.32, 0.2);
const THIGH = col(0.52, 0.38, 0.24);
const CREAM = col(0.92, 0.84, 0.7);
const KNEE = col(0.3, 0.21, 0.14);
const PAD = col(0.46, 0.4, 0.35); // pale grey-brown pads
const NAIL = col(0.12, 0.09, 0.07);
const MUZZLE = col(0.3, 0.24, 0.2);
const TUFT = col(0.18, 0.12, 0.08);
const EYE = col(0.03, 0.025, 0.025);
const EAR = col(0.5, 0.37, 0.25);

const mix3 = (a: number[], b: number[], t: number): number[] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ss = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- geometry builder
type Row = number[]; // x, y, z, rx, ryUp, ryDown, r, g, b

class Builder {
  pos: number[] = [];
  colr: number[] = [];
  leg: number[] = [];
  jnt: number[] = [];
  fot: number[] = [];
  idx: number[] = [];
}

interface TubeOpts {
  seg: number;
  leg: number;
  cfn?: (row: Row, th: number, p: number[], f: number) => number[];
  wfn?: (row: Row, f: number) => [number, number];
  warp?: (p: number[], th: number) => void;
  caps?: boolean;
  mat?: THREE.Matrix4;
}

/** Catmull-Rom resample of a station table to n rows (n = rows.length keeps them as they are). */
function resample(rows: Row[], n: number): Row[] {
  const L = rows.length;
  if (n === L) return rows.map((r) => r.slice());
  const out: Row[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k * (L - 1)) / (n - 1);
    const i = Math.min(L - 2, Math.floor(t));
    const f = t - i;
    const p0 = rows[Math.max(i - 1, 0)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(i + 2, L - 1)];
    out.push(
      p1.map((_, c) => {
        const v = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * f + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * f * f + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * f * f * f);
        return c >= 3 ? Math.max(v, 0.003) : v;
      }),
    );
  }
  return out;
}

function tube(b: Builder, rowsIn: Row[], o: TubeOpts): void {
  const rows = rowsIn;
  const n = rows.length;
  const seg = o.seg;
  const base = b.pos.length / 3;
  const verts: number[][] = [];
  const nv = n * seg + (o.caps === false ? 0 : 2);
  void nv;
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const a = rows[Math.max(i - 1, 0)], c = rows[Math.min(i + 1, n - 1)];
    const T = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize();
    const S0 = new THREE.Vector3(1, 0, 0);
    const U = new THREE.Vector3().crossVectors(S0, T).normalize();
    const S = new THREE.Vector3().crossVectors(T, U).normalize();
    const f = n > 1 ? i / (n - 1) : 0;
    const [jw, fw] = o.wfn ? o.wfn(r, f) : [0, 0];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      const ry = sn > 0 ? r[4] : r[5];
      const p = [r[0] + S.x * r[3] * cs + U.x * ry * sn, r[1] + S.y * r[3] * cs + U.y * ry * sn, r[2] + S.z * r[3] * cs + U.z * ry * sn];
      if (o.warp) o.warp(p, th);
      const cc = o.cfn ? o.cfn(r, th, p, f) : [r[6], r[7], r[8]];
      if (o.mat) {
        const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(o.mat);
        p[0] = v.x; p[1] = v.y; p[2] = v.z;
      }
      verts.push([p[0], p[1], p[2], cc[0], cc[1], cc[2], jw, fw]);
    }
  }
  if (o.caps !== false) {
    for (const i of [0, n - 1]) {
      const r = rows[i];
      const f = n > 1 ? i / (n - 1) : 0;
      const [jw, fw] = o.wfn ? o.wfn(r, f) : [0, 0];
      const p = [r[0], r[1], r[2]];
      if (o.mat) {
        const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(o.mat);
        p[0] = v.x; p[1] = v.y; p[2] = v.z;
      }
      verts.push([p[0], p[1], p[2], r[6], r[7], r[8], jw, fw]);
    }
  }
  const tri: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, bb = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
      tri.push(a, c, bb, bb, c, d);
    }
  }
  if (o.caps !== false) {
    const c0 = n * seg, c1 = n * seg + 1;
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      tri.push(c0, j, j1); // start cap
      tri.push(c1, (n - 1) * seg + j1, (n - 1) * seg + j); // end cap
    }
  }
  // signed volume: flip the winding if this part came out inside-out
  let vol = 0;
  for (let k = 0; k < tri.length; k += 3) {
    const p0 = verts[tri[k]], p1 = verts[tri[k + 1]], p2 = verts[tri[k + 2]];
    vol += p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0]);
  }
  if (vol < 0) for (let k = 0; k < tri.length; k += 3) { const t = tri[k + 1]; tri[k + 1] = tri[k + 2]; tri[k + 2] = t; }
  for (const v of verts) {
    b.pos.push(v[0], v[1], v[2]);
    b.colr.push(v[3], v[4], v[5]);
    b.leg.push(o.leg);
    b.jnt.push(v[6]);
    b.fot.push(v[7]);
  }
  for (const t of tri) b.idx.push(base + t);
}

/** A squashed sphere (axis along z, or tilted by q), centred at c. Rows run from the front (-z) to the back. */
function blob(b: Builder, c: number[], rad: number[], color: number[], leg: number, jw: number, seg: number, m: number, q?: THREE.Quaternion, fw = 0, cfn?: (th: number, f: number) => number[]): void {
  const rows: Row[] = [];
  for (let k = 0; k <= m; k++) {
    const ph = (Math.PI * k) / m;
    const sn = Math.max(Math.sin(ph), 0.004);
    rows.push([0, 0, -rad[2] * Math.cos(ph), rad[0] * sn, rad[1] * sn, rad[1] * sn, color[0], color[1], color[2]]);
  }
  const mat = new THREE.Matrix4().compose(new THREE.Vector3(c[0], c[1], c[2]), q ?? new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
  tube(b, rows, { seg, leg, mat, wfn: () => [jw, fw], cfn: cfn ? (_r, th, _p, f) => cfn(th, f) : undefined });
}

// ---------------------------------------------------------------- the camel
interface Detail {
  barrelRows: number; barrelSeg: number;
  neckRows: number; neckSeg: number;
  headRows: number; headSeg: number;
  legSeg: number; legPick: number[] | null; // which of the leg's station rows to keep (null: all)
  tailRows: number; tailSeg: number;
  extras: boolean;
}
const PICK_FRONT = [0, 3, 6, 10, 13], PICK_HIND = [0, 3, 7, 11, 14];
const NEAR: Detail = { barrelRows: 24, barrelSeg: 16, neckRows: 16, neckSeg: 10, headRows: 12, headSeg: 12, legSeg: 8, legPick: null, tailRows: 6, tailSeg: 6, extras: true };
const FAR: Detail = { barrelRows: 8, barrelSeg: 8, neckRows: 5, neckSeg: 6, headRows: 4, headSeg: 5, legSeg: 5, legPick: null, tailRows: 0, tailSeg: 0, extras: false };

const HEAD_P0 = [0, 2.45, -1.86];
const HS = 1.22; // head cross-section scale
const HEAD_ANGLE = (32 * Math.PI) / 180; // the head points this far below horizontal

const BARREL_REAR = 1.05, BARREL_FRONT = -1.12;

function barrelRows(n: number): Row[] {
  // core profile (rump to chest): z, top, bottom, half width. The ends are closed by an elliptical cap.
  const t: number[][] = [
    [1.05, 1.76, 1.4, 0.19], [0.8, 1.8, 1.36, 0.22], [0.5, 1.85, 1.27, 0.26], [0.1, 1.87, 1.15, 0.29],
    [-0.3, 1.89, 1.06, 0.3], [-0.7, 1.9, 0.98, 0.31], [-1.12, 1.84, 0.98, 0.29],
  ];
  const rows: Row[] = [];
  for (let k = 0; k < n; k++) {
    const u0 = k / (n - 1);
    const u = 0.5 * u0 + 0.5 * (0.5 - 0.5 * Math.cos(Math.PI * u0)); // denser at both ends
    const z = BARREL_REAR + (BARREL_FRONT - BARREL_REAR) * u;
    let i = 0;
    while (i < t.length - 2 && z < t[i + 1][0]) i++;
    const f = ss(0, 1, (t[i][0] - z) / (t[i][0] - t[i + 1][0]));
    const top = t[i][1] + (t[i + 1][1] - t[i][1]) * f, bot = t[i][2] + (t[i + 1][2] - t[i][2]) * f, w = t[i][3] + (t[i + 1][3] - t[i][3]) * f;
    let sc = 1;
    if (z > 0.8) sc = Math.sqrt(Math.max(0, 1 - ((z - 0.8) / 0.25) ** 2));
    else if (z < -0.88) sc = Math.sqrt(Math.max(0, 1 - ((-0.88 - z) / 0.24) ** 2));
    sc = Math.max(sc, 0.04);
    const cy = bot + 0.5 * (top - bot);
    const ry = 0.5 * (top - bot) * sc;
    rows.push([0, cy, z, w * sc, ry, ry, TAN[0], TAN[1], TAN[2]]);
  }
  return rows;
}

function neckRows(): Row[] {
  // y, z, half width, half depth: a thick base out of the chest, a low dip, then up to the head
  const t: number[][] = [
    [1.6, -0.5, 0.24, 0.29], [1.52, -0.9, 0.225, 0.29], [1.48, -1.2, 0.2, 0.26], [1.52, -1.45, 0.175, 0.225], [1.66, -1.65, 0.15, 0.19],
    [1.88, -1.78, 0.13, 0.165], [2.13, -1.84, 0.114, 0.14], [2.34, -1.86, 0.102, 0.122], [2.46, -1.87, 0.095, 0.108],
  ];
  return t.map(([y, z, rx, ry]) => [0, y, z, rx, ry, ry, TAN[0], TAN[1], TAN[2]]);
}

function headRows(): Row[] {
  const ca = Math.cos(HEAD_ANGLE), sa = Math.sin(HEAD_ANGLE);
  // t (metres from the poll), half width, half height up, half height down
  const t: number[][] = [
    [-0.07, 0.07, 0.085, 0.085], [0, 0.11, 0.125, 0.12], [0.08, 0.125, 0.135, 0.13], [0.16, 0.12, 0.125, 0.125], [0.24, 0.1, 0.1, 0.115],
    [0.32, 0.088, 0.09, 0.115], [0.4, 0.086, 0.09, 0.125], [0.48, 0.09, 0.092, 0.14], [0.55, 0.086, 0.084, 0.135], [0.6, 0.07, 0.062, 0.095],
    [0.635, 0.045, 0.035, 0.05],
  ];
  return t.map(([d, rx, u, dn]) => [HEAD_P0[0], HEAD_P0[1] - sa * d, HEAD_P0[2] - ca * d, rx * HS, u * HS, dn * HS, TAN[0], TAN[1], TAN[2]]);
}

function legRows(front: boolean, sx: number): Row[] {
  // y, z, half width, half depth, x
  const t: number[][] = front
    ? [
      [1.72, -0.68, 0.11, 0.16, 0.13], [1.5, -0.68, 0.125, 0.17, 0.17], [1.25, -0.68, 0.115, 0.155, 0.185], [1.05, -0.69, 0.095, 0.125, 0.185],
      [0.88, -0.7, 0.078, 0.1, 0.185], [0.72, -0.7, 0.064, 0.085, 0.185], [0.62, -0.7, 0.082, 0.1, 0.185], [0.53, -0.7, 0.056, 0.07, 0.185],
      [0.4, -0.7, 0.046, 0.056, 0.185], [0.25, -0.7, 0.043, 0.052, 0.185], [0.15, -0.7, 0.054, 0.064, 0.185], [0.09, -0.705, 0.05, 0.06, 0.185],
      [0.06, -0.72, 0.075, 0.09, 0.185], [0.035, -0.725, 0.075, 0.085, 0.185],
    ]
    : [
      [1.62, 0.78, 0.07, 0.12, 0.09], [1.46, 0.8, 0.12, 0.18, 0.14], [1.3, 0.82, 0.13, 0.2, 0.17], [1.1, 0.82, 0.11, 0.17, 0.17],
      [0.95, 0.85, 0.085, 0.13, 0.17], [0.8, 0.92, 0.07, 0.105, 0.17], [0.68, 0.98, 0.07, 0.1, 0.17], [0.6, 1.0, 0.085, 0.11, 0.17],
      [0.5, 0.97, 0.056, 0.07, 0.17], [0.36, 0.94, 0.046, 0.056, 0.17], [0.22, 0.92, 0.043, 0.052, 0.17], [0.14, 0.915, 0.054, 0.064, 0.17],
      [0.09, 0.92, 0.05, 0.06, 0.17], [0.06, 0.93, 0.075, 0.09, 0.17], [0.035, 0.935, 0.075, 0.085, 0.17],
    ];
  const n = t.length;
  const kneeI = front ? 6 : 7;
  return t.map(([y, z, rx, rz, x], i) => {
    let c = mix3(TAN, TAN_LIGHT, 0.5);
    if (i >= 4) c = mix3(c, TAN_LIGHT, ss(4, 8, i));
    if (!front && i >= 1 && i <= 4) c = mix3(c, THIGH, 0.85 * (1 - ss(2.5, 4.5, i)));
    if (front && i <= 3) c = mix3(c, THIGH, 0.5 * (1 - ss(1.5, 3.5, i)));
    c = mix3(c, KNEE, Math.max(0, 1 - Math.abs(i - kneeI) / 1.5) * 0.9);
    c = mix3(c, MUZZLE, ss(n - 6, n - 4, i) * 0.8);
    c = mix3(c, PAD, ss(n - 4, n - 2, i));
    return [sx * x, y, z, rx, rz, rz, c[0], c[1], c[2]];
  });
}

export function buildCamel(far: boolean): THREE.BufferGeometry {
  const D = far ? FAR : NEAR;
  const b = new Builder();

  // ---- barrel, with the hump worked into the back line: a dome, gentler in front, highest a little behind mid-back
  tube(b, barrelRows(D.barrelRows), {
    seg: D.barrelSeg, leg: 0,
    warp: (p, th) => {
      const s = Math.sin(th);
      if (s <= 0) return;
      const d = p[2] - 0.14;
      const u = Math.abs(d) / (d < 0 ? 0.74 : 0.5);
      if (u >= 1) return;
      const g = Math.pow(1 - u * u, 1.6) * Math.pow(s, 1.7);
      p[1] += 0.4 * g;
      p[2] += 0.04 * g;
      p[0] *= 1 - 0.3 * g;
    },
    cfn: (row, th, p) => {
      const s = Math.sin(th);
      let c = mix3(TAN, CREAM, ss(0.05, -0.55, s));
      c = mix3(c, THIGH, ss(0.35, 0.95, p[2]) * 0.55 * ss(-0.5, 0.4, s));
      c = mix3(c, MANE, ss(0.6, 1, s) * 0.3);
      c = mix3(c, HUMP, ss(1.95, 2.2, p[1]));
      return c;
    },
  });

  // ---- neck
  tube(b, resample(neckRows(), D.neckRows), {
    seg: D.neckSeg, leg: 5, wfn: (_r, f) => [ss(0.0, 0.8, f), 0],
    cfn: (row, th, p, f) => {
      const s = Math.sin(th);
      let c = mix3(TAN, CREAM, ss(-0.2, -0.9, s) * 0.6);
      c = mix3(c, MANE, ss(0.3, 0.95, s) * ss(0.1, 0.4, f));
      return c;
    },
  });

  // ---- head
  tube(b, resample(headRows(), D.headRows), {
    seg: D.headSeg, leg: 5, wfn: () => [1, 0],
    cfn: (row, th, p, f) => {
      const s = Math.sin(th);
      let c = mix3(TAN, TAN_LIGHT, 0.5);
      c = mix3(c, CREAM, ss(-0.2, -0.8, s) * 0.85 * (1 - ss(0.45, 0.6, f)));
      c = mix3(c, MANE, ss(0.7, 1, s) * (1 - ss(0.3, 0.6, f)) * 0.7);
      c = mix3(c, MUZZLE, ss(0.5, 0.7, f));
      return c;
    },
  });

  // ---- legs
  const legDefs: [boolean, number, number][] = [[true, -1, 1], [true, 1, 2], [false, -1, 3], [false, 1, 4]];
  for (const [front, sx, id] of legDefs) {
    let rows = legRows(front, sx);
    const all = rows;
    if (far) rows = (front ? PICK_FRONT : PICK_HIND).map((i) => rows[i].slice());
    const kw = front ? [0.76, 0.5] : [0.82, 0.54];
    tube(b, rows, {
      seg: D.legSeg, leg: id,
      wfn: (r) => [ss(kw[0], kw[1], r[1]), ss(0.3, 0.1, r[1])],
      cfn: (r, th) => {
        const inner = Math.cos(th) * -sx; // toward the body's middle
        const c = [r[6], r[7], r[8]];
        return r[1] > 0.3 ? mix3(c, CREAM, ss(0.3, 0.9, inner) * 0.7) : c;
      },
    });
    if (D.extras) {
      // two splayed toes (a cleft between them at the front), pale underneath, dark nails
      const last = all[all.length - 1];
      for (const tx of [-1, 1]) {
        blob(b, [last[0] + tx * 0.047, 0.04, last[2] - 0.035], [0.05, 0.04, 0.095], PAD, id, 1, 7, 4, undefined, 1, (th, f) => {
          const s = Math.sin(th); // +: underneath (rows run front to back)
          let c = mix3(TAN_LIGHT, PAD, 0.6);
          c = mix3(c, PAD, ss(0.0, 0.6, s));
          c = mix3(c, NAIL, ss(0.3, 0.1, f) * ss(-0.9, -0.1, s));
          return c;
        });
      }
    }
  }

  // ---- tail: hangs down close against the rump and the hind legs to about the hocks
  if (D.tailRows) {
    const t: [number, number, number, number[]][] = [
      [TAIL_ROOT[0], TAIL_ROOT[1], 0.045, TAN], [1.5, 1.05, 0.036, TAN], [1.28, 1.1, 0.028, THIGH], [1.0, 1.12, 0.024, THIGH],
      [0.76, 1.12, 0.022, MANE], [0.68, 1.12, 0.04, TUFT], [0.52, 1.12, 0.05, TUFT], [0.4, 1.12, 0.036, TUFT], [0.33, 1.12, 0.004, TUFT],
    ];
    const rows = t.map(([y, z, r, c]) => [0, y, z, r, r, r, c[0], c[1], c[2]]);
    tube(b, rows, { seg: D.tailSeg, leg: 6, wfn: (_r, f) => [ss(0, 0.6, f), 0] });
  }

  // ---- chest pad, eyes, brows, ears
  if (D.extras) {
    blob(b, [0, 0.99, -0.8], [0.12, 0.05, 0.19], MUZZLE, 0, 0, 8, 4);
    const ca = Math.cos(HEAD_ANGLE), sa = Math.sin(HEAD_ANGLE);
    const P = (d: number): number[] => [HEAD_P0[0], HEAD_P0[1] - sa * d, HEAD_P0[2] - ca * d];
    const up = [0, ca, -sa];
    const qHead = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -HEAD_ANGLE);
    for (const sx of [-1, 1]) {
      const pe = P(0.13);
      blob(b, [pe[0] + sx * 0.135, pe[1] + up[1] * 0.062, pe[2] + up[2] * 0.062], [0.026, 0.03, 0.03], EYE, 5, 1, 6, 4, qHead);
      const pb = P(0.11);
      blob(b, [pb[0] + sx * 0.1, pb[1] + up[1] * 0.115, pb[2] + up[2] * 0.115], [0.058, 0.036, 0.08], MANE, 5, 1, 7, 4, qHead);
      const pr = P(-0.04);
      const qEar = qHead.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sx * 1.0));
      blob(b, [pr[0] + sx * 0.14, pr[1] + up[1] * 0.05, pr[2] + up[2] * 0.05], [0.024, 0.055, 0.036], EAR, 5, 1, 6, 4, qEar);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.colr, 3));
  g.setAttribute('aLeg', new THREE.Float32BufferAttribute(b.leg, 1));
  g.setAttribute('aJoint', new THREE.Float32BufferAttribute(b.jnt, 1));
  g.setAttribute('aFoot', new THREE.Float32BufferAttribute(b.fot, 1));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  // the walk moves vertices: pad the bounds a little
  if (g.boundingSphere) g.boundingSphere.radius += 0.3;
  return g;
}

// ---------------------------------------------------------------- the material (walk in the vertex shader)
const f = (n: number): string => n.toFixed(5);

const DECL = /* glsl */ `
attribute float aPhase;
attribute float aWalk;
attribute float aLeg;
attribute float aJoint;
attribute float aFoot;
uniform float uTime;
const float C_PI = 3.14159265;
const float C_TWO_PI = 6.2831853;
const float C_CYCLE = ${f(CYCLE)};
const float C_SWING = ${f(SWING)};
const float C_HTAN = ${f(HTAN)};
const float C_HIP_Y = ${f(HIP_Y)};
vec3 camelRotX(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}
vec3 camelPivX(vec3 p, vec2 pv, float a) {
  float c = cos(a), s = sin(a);
  float dy = p.y - pv.x, dz = p.z - pv.y;
  return vec3(p.x, pv.x + dy * c - dz * s, pv.y + dy * s + dz * c);
}
vec3 camelRotZ(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}
void camelDeform(inout vec3 p, inout vec3 n) {
  float walk = clamp(aWalk, 0.0, 1.0);
  float cyc = fract(uTime / C_CYCLE + aPhase / C_TWO_PI);
  int leg = int(aLeg + 0.5);
  if (leg >= 1 && leg <= 4) {
    bool front = leg <= 2;
    bool right = (leg == 2 || leg == 4);
    float c = fract(cyc + (right ? 0.5 : 0.0) + 0.0);
    float h, lift;
    if (c < C_SWING) {
      float u = c / C_SWING;
      h = -C_HTAN * cos(C_PI * u);
      lift = sin(C_PI * u);
    } else {
      float v = (c - C_SWING) / (1.0 - C_SWING);
      h = C_HTAN * (1.0 - 2.0 * v);
      lift = 0.0;
    }
    h *= walk;
    lift *= walk;
    float a = atan(h);
    float kneeAng = lift * (front ? -0.95 : 0.95);
    float ankAng = -(a + kneeAng);
    vec2 hip = vec2(C_HIP_Y, front ? ${f(FRONT_Z)} : ${f(HIND_Z)});
    vec2 knee = front ? vec2(${f(FRONT_KNEE[0])}, ${f(FRONT_KNEE[1])}) : vec2(${f(HIND_KNEE[0])}, ${f(HIND_KNEE[1])});
    vec2 ankle = front ? vec2(${f(FRONT_ANKLE[0])}, ${f(FRONT_ANKLE[1])}) : vec2(${f(HIND_ANKLE[0])}, ${f(HIND_ANKLE[1])});
    float wa = ankAng * aFoot, wk = kneeAng * aJoint;
    p = camelPivX(p, ankle, wa); n = camelRotX(n, wa);
    p = camelPivX(p, knee, wk); n = camelRotX(n, wk);
    // the stance leg lengthens a little so the foot stays on the ground as it swings
    p.y += (p.y - C_HIP_Y) * (1.0 / cos(a) - 1.0) * (1.0 - lift);
    p = camelPivX(p, hip, a); n = camelRotX(n, a);
  } else if (leg == 5) {
    float nb = 0.08 * sin(C_TWO_PI * cyc + 0.6) * walk + 0.014 * sin(uTime * 0.8 + aPhase) * (1.0 - walk);
    nb *= aJoint;
    p = camelPivX(p, vec2(${f(NECK_BASE[0])}, ${f(NECK_BASE[1])}), nb); n = camelRotX(n, nb);
  } else if (leg == 6) {
    float ta = (0.1 * sin(C_TWO_PI * cyc + 1.0) * walk + 0.04 * sin(uTime * 0.9 + aPhase * 2.0) * (1.0 - walk)) * aJoint;
    vec3 root = vec3(0.0, ${f(TAIL_ROOT[0])}, ${f(TAIL_ROOT[1])});
    p = root + camelRotZ(p - root, ta); n = camelRotZ(n, ta);
  }
  // body sway toward the stance side (about the ground, so the feet stay put) and a small bob
  float roll = -0.045 * sin(C_TWO_PI * cyc) * walk;
  p.y += 0.02 * cos(2.0 * C_TWO_PI * cyc) * walk * smoothstep(0.0, 1.2, p.y);
  p = camelRotZ(p, roll);
  n = camelRotZ(n, roll);
}
`;

export function camelMaterial(): THREE.MeshLambertMaterial & { setTime(t: number): void } {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true }) as THREE.MeshLambertMaterial & { setTime(t: number): void };
  const uTime = { value: 0 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', DECL + '\nvoid main() {')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vec3 camelP = position;\n  camelDeform(camelP, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = camelP;');
  };
  m.customProgramCacheKey = () => 'camel-walk-v2';
  m.setTime = (t: number) => { uTime.value = t; };
  return m;
}
