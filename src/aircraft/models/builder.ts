// Procedural modelling toolkit for the aircraft: lofted fuselages from
// cross-sections, airfoil-section lifting surfaces, and helpers to paint
// and merge geometry. Everything is in metres, nose toward -Z, up +Y.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dense } from './kit';

export interface Section {
  /** station along the body (m, -Z is forward) */
  z: number;
  /** half width */
  w: number;
  /** height of the top above yOff */
  top: number;
  /** depth of the bottom below yOff */
  bot: number;
  /** vertical centre */
  y?: number;
  /** superellipse exponent: 2 = ellipse, higher = boxier */
  n?: number;
  /** extra exponent for the lower half (flat bellies) */
  nBot?: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function interpSections(secs: Section[], perSpan: number): Section[] {
  const out: Section[] = [];
  const keys: (keyof Section)[] = ['z', 'w', 'top', 'bot', 'y', 'n', 'nBot'];
  const norm = secs.map((s) => ({ ...s, y: s.y ?? 0, n: s.n ?? 2.2, nBot: s.nBot ?? s.n ?? 2.2 }));
  for (let i = 0; i < norm.length - 1; i++) {
    const s0 = norm[Math.max(0, i - 1)], s1 = norm[i], s2 = norm[i + 1], s3 = norm[Math.min(norm.length - 1, i + 2)];
    for (let k = 0; k < perSpan; k++) {
      const t = k / perSpan;
      const r: Record<string, number> = {};
      for (const key of keys) {
        const v = catmull(s0[key] as number, s1[key] as number, s2[key] as number, s3[key] as number, t);
        r[key] = key === 'w' || key === 'top' || key === 'bot' ? Math.max(0.001, v) : v;
      }
      out.push(r as unknown as Section);
    }
  }
  out.push(norm[norm.length - 1] as Section);
  return out;
}

function sePoint(theta: number, s: Section): [number, number] {
  const c = Math.cos(theta), sn = Math.sin(theta);
  const top = sn >= 0;
  const n = top ? s.n ?? 2.2 : s.nBot ?? s.n ?? 2.2;
  const ex = 2 / n;
  const x = s.w * Math.sign(c) * Math.pow(Math.abs(c), ex);
  const y = (top ? s.top : s.bot) * Math.sign(sn) * Math.pow(Math.abs(sn), ex) + (s.y ?? 0);
  return [x, y];
}

/** The (spline-interpolated) cross-section of a loft at station z. */
export function sectionAt(sections: Section[], z: number): Section {
  const fine = interpSections(sections, 16);
  if (z <= fine[0].z) return { ...fine[0] };
  const last = fine[fine.length - 1];
  if (z >= last.z) return { ...last };
  for (let i = 0; i < fine.length - 1; i++) {
    const a = fine[i], b = fine[i + 1];
    if (z < a.z || z > b.z) continue;
    const t = (z - a.z) / Math.max(1e-6, b.z - a.z);
    const l = (u: number, v: number) => u + (v - u) * t;
    return {
      z,
      w: l(a.w, b.w),
      top: l(a.top, b.top),
      bot: l(a.bot, b.bot),
      y: l(a.y ?? 0, b.y ?? 0),
      n: l(a.n ?? 2.2, b.n ?? 2.2),
      nBot: l(a.nBot ?? a.n ?? 2.2, b.nBot ?? b.n ?? 2.2),
    };
  }
  return { ...last };
}

/** A point on a section's outline; theta 0 = right, PI/2 = top, PI = left. */
export function sectionPoint(theta: number, s: Section): [number, number] {
  return sePoint(theta, s);
}

/** Half-width of a section at height y (upper half), found by bisection. */
export function sectionHalfWidthAt(s: Section, y: number): number {
  let lo = 0, hi = Math.PI / 2;
  const [, y0] = sePoint(0, s);
  if (y <= y0) return s.w;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const [, ym] = sePoint(mid, s);
    if (ym < y) lo = mid;
    else hi = mid;
  }
  return sePoint((lo + hi) / 2, s)[0];
}

/** A thin tube following the upper half of a section (canopy bows / arches). */
export function sectionArch(s: Section, radius: number, inset: number, thetaFrom = 0.02, thetaTo = Math.PI - 0.02, samples = 24): THREE.BufferGeometry {
  samples = dense(samples);
  const pts: THREE.Vector3[] = [];
  const cx = 0, cy = s.y ?? 0;
  for (let i = 0; i <= samples; i++) {
    const th = thetaFrom + ((thetaTo - thetaFrom) * i) / samples;
    const [x, y] = sePoint(th, s);
    const dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    pts.push(new THREE.Vector3(x - (dx / len) * inset, y - (dy / len) * inset, s.z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, samples * 2, radius, 6, false);
}

/** Lofted body through cross-sections, closed at both ends. */
export function loft(sections: Section[], radial = 28, perSpan = 4, capEnds = true): THREE.BufferGeometry {
  radial = dense(radial);
  perSpan = dense(perSpan);
  const secs = interpSections(sections, perSpan);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rings = secs.length;
  for (let i = 0; i < rings; i++) {
    const s = secs[i];
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2 - Math.PI / 2;
      const [x, y] = sePoint(th, s);
      pos.push(x, y, s.z);
      uv.push(j / radial, i / (rings - 1));
    }
  }
  const rowLen = radial + 1;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * rowLen + j, b = a + 1, c = a + rowLen, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (capEnds) {
    for (const end of [0, rings - 1]) {
      const s = secs[end];
      const ci = pos.length / 3;
      pos.push(0, s.y ?? 0, s.z);
      uv.push(0.5, end === 0 ? 0 : 1);
      for (let j = 0; j < radial; j++) {
        const a = end * rowLen + j, b = a + 1;
        if (end === 0) idx.push(ci, b, a);
        else idx.push(ci, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface SurfaceDef {
  /** root leading edge position (x = spanwise start, y, z) */
  root: [number, number, number];
  rootChord: number;
  tipChord: number;
  /** semi-span (m) */
  span: number;
  /** leading edge sweep (deg) */
  sweep: number;
  /** thickness / chord */
  thickness: number;
  /** dihedral (deg); for vertical tails this is the cant from vertical */
  dihedral?: number;
  /** vertical surface (span goes up +Y) */
  vertical?: boolean;
  /** mirror to the left side */
  mirror?: boolean;
  /** chordwise / spanwise resolution */
  cn?: number;
  sn?: number;
  /** tip rounding / raked */
  tipOffset?: number;
}

/** NACA 4-digit symmetric half-thickness distribution. */
function naca(x: number, t: number): number {
  return 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
}

/** A tapered, swept lifting surface with an airfoil section. */
export function surface(def: SurfaceDef): THREE.BufferGeometry {
  const cn = def.cn ?? 10;
  const sn = def.sn ?? 4;
  const pos: number[] = [];
  const idx: number[] = [];
  const tanS = Math.tan((def.sweep * Math.PI) / 180);
  const dih = ((def.dihedral ?? 0) * Math.PI) / 180;
  // chordwise stations clustered at the leading edge
  const xs: number[] = [];
  for (let i = 0; i <= cn; i++) {
    const u = i / cn;
    xs.push(u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
  }
  const ring = xs.length * 2 - 2; // upper + lower, sharing LE & TE
  for (let j = 0; j <= sn; j++) {
    const f = j / sn;
    const chord = def.rootChord + (def.tipChord - def.rootChord) * f;
    const le = f * def.span * tanS + (def.tipOffset ?? 0) * f * f;
    const sp = f * def.span;
    // upper surface LE->TE, then lower TE->LE (excluding duplicates)
    const pts: [number, number][] = [];
    for (let i = 0; i < xs.length; i++) pts.push([xs[i], naca(xs[i], def.thickness)]);
    for (let i = xs.length - 2; i >= 1; i--) pts.push([xs[i], -naca(xs[i], def.thickness)]);
    for (const [cx, th] of pts) {
      const z = def.root[2] + le + cx * chord;
      const t = th * chord;
      let x: number, y: number;
      if (def.vertical) {
        // span along +Y, thickness along X, cant about Z
        const ly = sp;
        const lx = t;
        x = def.root[0] + lx * Math.cos(dih) + ly * Math.sin(dih);
        y = def.root[1] + ly * Math.cos(dih) - lx * Math.sin(dih);
      } else {
        x = def.root[0] + sp * Math.cos(dih);
        y = def.root[1] + sp * Math.sin(dih) + t;
      }
      pos.push(x, y, z);
    }
  }
  for (let j = 0; j < sn; j++) {
    for (let i = 0; i < ring; i++) {
      const a = j * ring + i;
      const b = j * ring + ((i + 1) % ring);
      const c = (j + 1) * ring + i;
      const d = (j + 1) * ring + ((i + 1) % ring);
      // span along +X (horizontal) vs +Y (vertical) mirrors handedness
      if (def.vertical) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  // tip cap and root cap
  const capRow = (row: number, flip: boolean) => {
    const base = row * ring;
    for (let i = 1; i < xs.length - 1; i++) {
      const up = base + i;
      const lo = base + (ring - i) % ring;
      const upN = base + i + 1;
      const loN = base + (ring - i - 1 + ring) % ring;
      if (flip) idx.push(up, upN, lo, upN, loN, lo);
      else idx.push(up, lo, upN, upN, lo, loN);
    }
  };
  capRow(sn, true);
  capRow(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // orientation fix for surfaces built toward -x (winding flips on mirror)
  if (def.mirror) {
    const m = g.clone();
    m.scale(-1, 1, 1);
    flipWinding(m);
    const merged = mergeGeometries([g, m])!;
    merged.computeVertexNormals();
    return merged;
  }
  return g;
}

export function flipWinding(g: THREE.BufferGeometry): void {
  const index = g.index;
  if (!index) return;
  const arr = index.array as Uint32Array | Uint16Array;
  for (let i = 0; i < arr.length; i += 3) {
    const t = arr[i + 1];
    arr[i + 1] = arr[i + 2];
    arr[i + 2] = t;
  }
  index.needsUpdate = true;
  g.computeVertexNormals();
}

export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  m.scale(-1, 1, 1);
  if (m.index) flipWinding(m);
  return m;
}

/** Counter-shaded paint: top colour on upward facing surfaces, belly colour below. */
export function paintByNormal(g: THREE.BufferGeometry, top: THREE.Color, bottom: THREE.Color, blend = 0.35): THREE.BufferGeometry {
  const n = g.attributes.normal;
  const count = g.attributes.position.count;
  const cols = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const ny = n ? n.getY(i) : 0;
    const t = THREE.MathUtils.smoothstep(ny, -blend, blend);
    c.copy(bottom).lerp(top, t);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

export function paintSolid(g: THREE.BufferGeometry, col: THREE.Color): THREE.BufferGeometry {
  const count = g.attributes.position.count;
  const cols = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    cols[i * 3] = col.r;
    cols[i * 3 + 1] = col.g;
    cols[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/** Strip attributes so geometries can be merged. */
export function normalizeGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g : g;
  for (const k of Object.keys(ng.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'color') ng.deleteAttribute(k);
  }
  if (!ng.attributes.normal) ng.computeVertexNormals();
  return ng;
}

export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = geos.map((g) => {
    const x = normalizeGeo(g.index ? g : g);
    return x.index ? x.toNonIndexed() : x;
  });
  return mergeGeometries(list, false)!;
}

export function cyl(rTop: number, rBot: number, len: number, seg = 16, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, open);
  g.rotateX(Math.PI / 2); // axis along Z (top toward -Z)
  return g;
}

export function sphere(r: number, sx = 1, sy = 1, sz = 1, seg = 16): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2));
  g.scale(sx, sy, sz);
  return g;
}

export function boxGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

/** Shared materials for all airframes (per colour scheme). */
export interface AirframeMaterials {
  paint: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  tire: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  navRed: THREE.MeshBasicMaterial;
  navGreen: THREE.MeshBasicMaterial;
  strobe: THREE.MeshBasicMaterial;
  formation: THREE.MeshBasicMaterial;
}

let shared: AirframeMaterials | null = null;

export function airframeMaterials(): AirframeMaterials {
  if (shared) return shared;
  shared = {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.64, metalness: 0.12 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.42, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.8, metalness: 0.1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x3a4c5a, roughness: 0.06, metalness: 0.65, transparent: true, opacity: 0.55 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95, metalness: 0 }),
    white: new THREE.MeshStandardMaterial({ color: 0xdcdcd6, roughness: 0.6, metalness: 0.2 }),
    navRed: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    navGreen: new THREE.MeshBasicMaterial({ color: 0x22ff55 }),
    strobe: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    formation: new THREE.MeshBasicMaterial({ color: 0xb8ff7a }),
  };
  return shared;
}

export function srgbColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

/** Point on a lifting surface's mid-plane (right-side definition), plus its outward normal. */
export function surfacePoint(def: SurfaceDef, spanFrac: number, chordFrac: number, outOffset = 0.05): { pos: THREE.Vector3; normal: THREE.Vector3 } {
  const tanS = Math.tan((def.sweep * Math.PI) / 180);
  const dih = ((def.dihedral ?? 0) * Math.PI) / 180;
  const sp = spanFrac * def.span;
  const chord = def.rootChord + (def.tipChord - def.rootChord) * spanFrac;
  const z = def.root[2] + sp * tanS + chord * chordFrac;
  if (def.vertical) {
    const x = def.root[0] + sp * Math.sin(dih);
    const y = def.root[1] + sp * Math.cos(dih);
    const n = new THREE.Vector3(Math.cos(dih), -Math.sin(dih), 0);
    return { pos: new THREE.Vector3(x, y, z).addScaledVector(n, outOffset), normal: n };
  }
  const x = def.root[0] + sp * Math.cos(dih);
  const y = def.root[1] + sp * Math.sin(dih);
  const n = new THREE.Vector3(-Math.sin(dih), Math.cos(dih), 0);
  return { pos: new THREE.Vector3(x, y, z).addScaledVector(n, outOffset), normal: n };
}

/** Recolour vertices whose (local) Y lies in a band, e.g. a coalition tail stripe. */
export function paintBandY(g: THREE.BufferGeometry, yMin: number, yMax: number, col: THREE.Color): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const c = g.attributes.color as THREE.BufferAttribute | undefined;
  if (!c) return g;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y >= yMin && y <= yMax) c.setXYZ(i, col.r, col.g, col.b);
  }
  c.needsUpdate = true;
  return g;
}
