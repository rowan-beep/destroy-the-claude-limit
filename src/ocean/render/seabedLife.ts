// The small life and litter of the sea floor, round the camera: seagrass
// meadows in the shallow sand that lean with the surge, shells and starfish on
// the sand, urchins and loose stones on rock, and deeper down sea pens, brittle
// stars and sea cucumbers on the mud, with glass sponges in the deep basin.
// Everything is placed by a hash of 16 m cells (the same in every dive),
// built a few cells per frame as the camera moves, drawn instanced (one draw per
// kind), and shrinks away with distance in the vertex shader. Density follows
// the preset's decor level; nothing here affects the dive.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seabedHeight, groundAt, HARBOR } from '../world/geo';
import { patchOceanMaterial } from './oceanMaterial';

const CELL = 16;
/** the farthest anything is kept (m) */
const RANGE = 72;

const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** a geometry with its colour (linear) and the per-vertex sway and fade distance the shader reads */
function finish(g: THREE.BufferGeometry, col: (x: number, y: number, z: number) => [number, number, number], sway: (y: number) => number, far: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (!ng.attributes.normal) ng.computeVertexNormals();
  const p = ng.attributes.position;
  const c = new Float32Array(p.count * 3), sw = new Float32Array(p.count), fa = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = col(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = srgb(r);
    c[i * 3 + 1] = srgb(gg);
    c[i * 3 + 2] = srgb(b);
    sw[i] = sway(p.getY(i));
    fa[i] = far;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  ng.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  ng.setAttribute('aFar', new THREE.BufferAttribute(fa, 1));
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'color', 'aSway', 'aFar'].includes(k)) ng.deleteAttribute(k);
  return ng;
}

/**
 * A small deterministic random from a seed. The seed is hashed first: a bare
 * Lehmer generator's first draws are a linear function of the seed, so
 * neighbouring cells would get related numbers (rows of cells alike).
 */
export function rng(seed: number): () => number {
  let h = Math.floor(seed) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  let s = ((h >>> 0) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const none = () => 0;

// ---------------------------------------------------------------- shapes (sizes about 1: instances scale them)
function stone(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.attributes.position;
  const r = rng(77);
  // knock it about: no two faces alike, flatter underneath
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) seen.set(key, (k = 0.78 + r() * 0.4));
    p.setXYZ(i, p.getX(i) * k, Math.max(-0.18, p.getY(i) * k * 0.7), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return finish(g, (x, y) => (y > 0.15 ? [0.5, 0.48, 0.44] : [0.4, 0.38, 0.35]), none, RANGE);
}

function shell(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.5, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.28, 0.9);
  return finish(g, (x, y, z) => {
    const rib = 0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 9);
    return [0.82 - 0.2 * rib, 0.72 - 0.18 * rib, 0.6 - 0.12 * rib];
  }, none, 34);
}

function starfish(): THREE.BufferGeometry {
  // five arms: a domed fan out to a star-shaped rim
  const N = 40;
  const pos: number[] = [];
  const rim = (i: number) => {
    const a = (i / N) * Math.PI * 2;
    const r = 0.16 + 0.34 * Math.pow(0.5 + 0.5 * Math.cos(5 * a), 1.6);
    return [Math.cos(a) * r, 0.015 + 0.05 * (1 - r / 0.5), Math.sin(a) * r];
  };
  for (let i = 0; i < N; i++) {
    const a = rim(i), b = rim((i + 1) % N);
    pos.push(0, 0.09, 0, b[0], b[1], b[2], a[0], a[1], a[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return finish(g, (x, y, z) => {
    const r = Math.hypot(x, z);
    return [0.95 - r * 0.3, 0.42 - r * 0.2, 0.18];
  }, none, 48);
}

function urchin(): THREE.BufferGeometry {
  // (polyhedra come without an index already; the body is mostly hidden by the spines, so a plain one does)
  const body = new THREE.IcosahedronGeometry(0.28, 0);
  const parts: THREE.BufferGeometry[] = [body];
  const dirs = new THREE.IcosahedronGeometry(1, 1).attributes.position;
  const seen = new Set<string>();
  const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion();
  for (let i = 0; i < dirs.count; i++) {
    d.set(dirs.getX(i), dirs.getY(i), dirs.getZ(i)).normalize();
    const key = `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.z.toFixed(2)}`;
    if (seen.has(key) || d.y < -0.4) continue;
    seen.add(key);
    // (open at the base: it is inside the body)
    const sp = new THREE.ConeGeometry(0.025, 0.42, 3, 1, true);
    sp.translate(0, 0.21 + 0.24, 0);
    q.setFromUnitVectors(up, d);
    sp.applyQuaternion(q);
    parts.push(sp.toNonIndexed());
  }
  const g = mergeGeometries(parts)!;
  g.translate(0, 0.18, 0);
  return finish(g, () => [0.22, 0.1, 0.2], none, 34);
}

function seagrass(): THREE.BufferGeometry {
  // a clump of blades a metre or so tall, bending as they rise
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(11);
  for (let i = 0; i < 13; i++) {
    const h = 0.5 + r() * 0.6;
    const b = new THREE.PlaneGeometry(0.03, h, 1, 5);
    b.translate(0, h / 2, 0);
    const p = b.attributes.position;
    const lean = (r() - 0.5) * 0.5;
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k) / h;
      p.setZ(k, p.getZ(k) + t * t * lean * h);
    }
    b.rotateY(r() * Math.PI);
    b.translate((r() - 0.5) * 0.45, 0, (r() - 0.5) * 0.45);
    parts.push(b);
  }
  const g = mergeGeometries(parts)!;
  return finish(g, (x, y) => {
    const t = Math.min(1, y / 1.1);
    return [0.24 + 0.22 * t, 0.36 + 0.24 * t, 0.12 + 0.06 * t];
  }, (y) => Math.pow(Math.min(1, y / 1.1), 2) * 0.35, 40);
}

function seaPen(): THREE.BufferGeometry {
  // a stalk in the mud and a feather of polyps above it
  const stalk = new THREE.CylinderGeometry(0.012, 0.016, 0.22, 5);
  stalk.translate(0, 0.11, 0);
  const parts: THREE.BufferGeometry[] = [stalk.toNonIndexed()];
  for (let k = 0; k < 2; k++) {
    const f = new THREE.PlaneGeometry(0.11, 0.34, 1, 6);
    const p = f.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + 0.17) / 0.34;
      // narrows to the tip
      p.setX(i, p.getX(i) * (1 - t * 0.6));
    }
    f.translate(0, 0.22 + 0.17, 0);
    f.rotateY(k * Math.PI / 2);
    parts.push(f.toNonIndexed());
  }
  const g = mergeGeometries(parts)!;
  return finish(g, (x, y) => (y < 0.22 ? [0.75, 0.55, 0.4] : [0.95, 0.68 + 0.1 * Math.sin(y * 90), 0.45]), (y) => Math.pow(Math.min(1, y / 0.56), 2) * 0.06, 48);
}

function brittleStar(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const disc = new THREE.CylinderGeometry(0.035, 0.04, 0.015, 7, 1, false);
  disc.translate(0, 0.008, 0);
  parts.push(disc.toNonIndexed());
  for (let i = 0; i < 5; i++) {
    // (a flat strip: from a little way off, an arm is all top)
    const arm = new THREE.PlaneGeometry(0.24, 0.012, 4, 1);
    arm.rotateX(-Math.PI / 2);
    const p = arm.attributes.position;
    const curl = i % 2 ? 1 : -1;
    for (let k = 0; k < p.count; k++) {
      const t = (p.getX(k) + 0.12) / 0.24;
      p.setZ(k, p.getZ(k) + curl * t * t * 0.05);
    }
    arm.translate(0.03 + 0.12, 0.009, 0);
    arm.rotateY((i / 5) * Math.PI * 2);
    parts.push(arm.toNonIndexed());
  }
  return finish(mergeGeometries(parts)!, () => [0.62, 0.55, 0.5], none, 40);
}

function seaCucumber(): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(0.04, 0.2, 3, 7);
  g.rotateZ(Math.PI / 2);
  g.scale(1, 0.75, 1);
  g.translate(0, 0.03, 0);
  return finish(g, (x, y) => (y > 0.04 ? [0.42, 0.22, 0.16] : [0.55, 0.38, 0.3]), none, 44);
}

function glassSponge(): THREE.BufferGeometry {
  // a vase of silica lattice, pale and open at the top
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push(new THREE.Vector2(0.06 + 0.16 * Math.sin(t * Math.PI * 0.85) + 0.05 * t, t * 0.9));
  }
  const g = new THREE.LatheGeometry(prof, 12);
  return finish(g, (x, y, z) => {
    const lattice = 0.5 + 0.5 * Math.sin(y * 40) * Math.sin(Math.atan2(z, x) * 12);
    return [0.86 - 0.12 * lattice, 0.84 - 0.12 * lattice, 0.74 - 0.1 * lattice];
  }, (y) => y * 0.01, RANGE);
}

// ---------------------------------------------------------------- where things live
type GroundKind = 'sand' | 'rock' | 'reef' | 'silt';

interface Kind {
  name: string;
  geo: THREE.BufferGeometry;
  /** how many in a 16 m cell at this depth on this ground (at full density) */
  per: (depth: number, g: GroundKind, meadow: number) => number;
  size: [number, number];
  /** squash the height (and widen) a little, per instance */
  flat?: number;
  /** lie along the slope of the ground */
  align: boolean;
  /** sink a little into the sediment (m, at size 1) */
  sink: number;
  colours: [number, number, number][];
  cap: number;
}

const KINDS: Kind[] = [
  {
    name: 'stone',
    geo: stone(),
    per: (d, g) => (g === 'rock' ? 16 : g === 'reef' ? 8 : g === 'sand' ? (d > 4 ? 5 : 0) : 1.2),
    size: [0.15, 0.85],
    flat: 0.35,
    align: true,
    sink: 0.08,
    colours: [[1, 1, 1], [1.05, 0.97, 0.88], [0.85, 0.85, 0.85], [0.95, 0.9, 0.95]],
    cap: 1100,
  },
  {
    name: 'shell',
    geo: shell(),
    per: (d, g) => (g === 'sand' && d > 2 && d < 80 ? 22 : g === 'reef' ? 6 : 0),
    size: [0.06, 0.13],
    align: true,
    sink: 0.01,
    colours: [[1, 1, 1], [1.1, 0.95, 0.85], [0.9, 0.85, 0.8], [1.1, 1.0, 0.75]],
    cap: 1300,
  },
  {
    name: 'starfish',
    geo: starfish(),
    per: (d, g) => (d < 4 || d > 130 ? 0 : g === 'rock' || g === 'reef' ? 3 : g === 'sand' ? 2 : 0),
    size: [0.32, 0.55],
    align: true,
    sink: 0,
    colours: [[1, 1, 1], [1.0, 0.7, 0.5], [0.75, 0.45, 0.9], [1.05, 1.2, 0.6]],
    cap: 350,
  },
  {
    name: 'urchin',
    geo: urchin(),
    per: (d, g) => (d > 2 && d < 45 && (g === 'rock' || g === 'reef') ? 14 : 0),
    size: [0.12, 0.2],
    align: false,
    sink: 0.02,
    colours: [[1, 1, 1], [0.6, 0.6, 0.65], [1.2, 0.8, 1.0]],
    cap: 1000,
  },
  {
    name: 'seagrass',
    geo: seagrass(),
    per: (d, g, meadow) => (g === 'sand' && d > 2.5 && d < 18 ? 150 * meadow : 0),
    size: [0.75, 1.15],
    align: false,
    sink: 0,
    colours: [[1, 1, 1], [0.9, 1.05, 0.85], [1.1, 1.0, 0.8]],
    cap: 4200,
  },
  {
    name: 'seapen',
    geo: seaPen(),
    per: (d, g) => (d > 60 && (g === 'silt' || g === 'sand') ? 5 : 0),
    size: [0.8, 1.4],
    align: false,
    sink: 0.02,
    colours: [[1, 1, 1], [1.05, 0.9, 0.8], [0.95, 1.0, 1.05]],
    cap: 600,
  },
  {
    name: 'brittle',
    geo: brittleStar(),
    per: (d, g) => (g === 'silt' ? 16 : g === 'sand' && d > 80 ? 3 : 0),
    size: [0.8, 1.3],
    align: true,
    sink: 0,
    colours: [[1, 1, 1], [1.1, 0.9, 0.8], [0.85, 0.85, 0.9]],
    cap: 1300,
  },
  {
    name: 'cucumber',
    geo: seaCucumber(),
    per: (d, g) => (d > 40 && (g === 'silt' || g === 'sand') ? 1.6 : 0),
    size: [0.8, 1.5],
    align: true,
    sink: 0.01,
    colours: [[1, 1, 1], [1.2, 0.8, 0.7], [0.8, 0.75, 0.7]],
    cap: 300,
  },
  {
    name: 'sponge',
    geo: glassSponge(),
    per: (d, g) => (d > 150 ? (g === 'rock' ? 2.2 : 0.5) : 0),
    size: [0.6, 1.3],
    align: false,
    sink: 0.05,
    colours: [[1, 1, 1], [1.0, 0.97, 0.9], [0.95, 0.95, 1.0]],
    cap: 220,
  },
];

const VERT_PARS = /* glsl */ `
attribute float aSway;
attribute float aFar;
uniform float uLifeT;
uniform vec3 uLifeCam;
uniform vec2 uSurgeDir;
`;
const VERT_MOVE = /* glsl */ `
{
  vec3 lc = ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xyz;
  // the surge: water swinging back and forth with the swell above (stronger shallower), and a slow drift
  float ph = lc.x * 0.21 + lc.z * 0.17;
  float surge = sin( uLifeT * 0.9 + ph ) * ( 0.6 + 0.4 * sin( uLifeT * 0.37 + ph * 1.7 ) );
  float shallow = 1.0 - smoothstep( 6.0, 30.0, -lc.y );
  float sc = length( instanceMatrix[ 0 ].xyz );
  vec2 off = uSurgeDir * surge * aSway * ( 0.35 + 0.65 * shallow ) / max( sc, 1e-3 );
  transformed.x += off.x;
  transformed.z += off.y;
  // far away: shrink to nothing
  transformed *= 1.0 - smoothstep( aFar * 0.7, aFar, length( lc - uLifeCam ) );
}
`;

/** what the arm can pick up, and the largest of each it can hold (instance scale) */
const PICKABLE: Record<string, number> = { shell: 1, stone: 0.35, starfish: 1, urchin: 1, cucumber: 1.2 };

/** a sample the arm has lifted off the floor */
export interface Sample {
  name: string;
  mesh: THREE.Mesh;
  /** how deep it lay (m) */
  depth: number;
}

export class SeabedLife {
  readonly group = new THREE.Group();
  private material: THREE.MeshLambertMaterial;
  private meshes: THREE.InstancedMesh[] = [];
  /** per cell: for each kind, the instances' matrices and colours */
  private cells = new Map<string, { cx: number; cz: number; items: { m: Float32Array; c: Float32Array; n: number }[] }>();
  private dirty = true;
  private density = 1;
  private camCell = '';
  private time = { value: 0 };
  private cam = { value: new THREE.Vector3() };
  budgetMs = 2.5;
  /** for the benchmark: cells built, the slowest (ms) */
  readonly stats = { cells: 0, maxCellMs: 0, instances: 0 };
  /** what the arm has taken, by cell ("i:j") then "kind:index" (gone for the rest of the dive) */
  private taken = new Map<string, Set<string>>();
  private heldMats: THREE.Material[] = [];

  constructor(density: number) {
    this.group.name = 'seabed-life';
    this.material = patchOceanMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'life');
    const base = this.material.onBeforeCompile;
    this.material.onBeforeCompile = (sh, r) => {
      base(sh, r);
      sh.uniforms.uLifeT = this.time;
      sh.uniforms.uLifeCam = this.cam;
      // (the swell runs toward 200°: the surge swings along that line)
      sh.uniforms.uSurgeDir = { value: new THREE.Vector2(Math.sin((200 * Math.PI) / 180), -Math.cos((200 * Math.PI) / 180)) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MOVE);
    };
    this.material.customProgramCacheKey = () => 'ocean-life-1';
    for (const k of KINDS) {
      const m = new THREE.InstancedMesh(k.geo, this.material, k.cap);
      m.count = 0;
      m.frustumCulled = false;
      m.name = 'life-' + k.name;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes.push(m);
      this.group.add(m);
    }
    this.setDensity(density);
  }

  setDensity(d: number): void {
    if (d === this.density && this.cells.size) return;
    this.density = d;
    this.cells.clear();
    // (a new density places different things: what was taken no longer matches)
    this.taken.clear();
    this.dirty = true;
  }

  /**
   * The nearest thing the arm can pick up within r of a world point: it leaves
   * the floor (for the rest of the dive) and comes back as a mesh to hold.
   */
  takeNear(p: THREE.Vector3, r: number): Sample | null {
    const best = this.findNear(p, r);
    if (!best) return null;
    const { key, ki, a } = best;
    const it = this.cells.get(key)!.items[ki];
    const m4 = new THREE.Matrix4().fromArray(it.m, a * 16);
    const col = new THREE.Color(it.c[a * 3], it.c[a * 3 + 1], it.c[a * 3 + 2]);
    it.m.fill(0, a * 16, a * 16 + 16);
    if (!this.taken.has(key)) this.taken.set(key, new Set());
    this.taken.get(key)!.add(`${ki}:${a}`);
    this.dirty = true;
    const mat = patchOceanMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, color: col }), 'life-held');
    this.heldMats.push(mat);
    const mesh = new THREE.Mesh(KINDS[ki].geo, mat);
    m4.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.name = 'sample-' + KINDS[ki].name;
    return { name: KINDS[ki].name, mesh, depth: -mesh.position.y };
  }

  /** what the arm could pick up within r of a world point (nothing is taken) */
  peekNear(p: THREE.Vector3, r: number): string | null {
    const b = this.findNear(p, r);
    return b ? KINDS[b.ki].name : null;
  }

  private findNear(p: THREE.Vector3, r: number): { key: string; ki: number; a: number } | null {
    const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL);
    let best: { key: string; ki: number; a: number } | null = null;
    let bd = r;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const key = `${ci + di}:${cj + dj}`;
      const c = this.cells.get(key);
      if (!c) continue;
      KINDS.forEach((k, ki) => {
        const max = PICKABLE[k.name];
        if (!max) return;
        const it = c.items[ki];
        for (let a = 0; a < it.n; a++) {
          const o = a * 16;
          if (it.m[o + 15] === 0) continue;
          // (its size: the length of the first column of its matrix)
          if (Math.hypot(it.m[o], it.m[o + 1], it.m[o + 2]) > max) continue;
          const d = Math.hypot(it.m[o + 12] - p.x, it.m[o + 13] - p.y, it.m[o + 14] - p.z);
          if (d < bd) {
            bd = d;
            best = { key, ki, a };
          }
        }
      });
    }
    return best;
  }

  /** a fresh dive: everything back where it grew */
  resetTaken(): void {
    if (!this.taken.size) return;
    this.taken.clear();
    this.cells.clear();
    this.dirty = true;
  }

  /** everything in range now (a loading moment) */
  fill(x: number, z: number): void {
    const b = this.budgetMs;
    this.budgetMs = 1e9;
    this.update(x, -10, z, 0);
    this.budgetMs = b;
  }

  update(x: number, y: number, z: number, t: number): void {
    this.time.value = t;
    this.cam.value.set(x, y, z);
    this.group.visible = y < 1;
    if (this.density <= 0) {
      for (const m of this.meshes) m.count = 0;
      return;
    }
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    const key = `${ci}:${cj}`;
    const n = Math.ceil(RANGE / CELL);
    const t0 = performance.now();
    // build the cells in range that are missing, nearest first, within the budget
    const want: [number, number, number][] = [];
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const d = Math.hypot(i, j) * CELL;
      if (d > RANGE + CELL) continue;
      const k = `${ci + i}:${cj + j}`;
      if (!this.cells.has(k)) want.push([ci + i, cj + j, d]);
    }
    want.sort((a, b) => a[2] - b[2]);
    for (const [i, j] of want) {
      if (performance.now() - t0 > this.budgetMs) break;
      const c0 = performance.now();
      this.cells.set(`${i}:${j}`, this.buildCell(i, j));
      this.stats.cells++;
      this.stats.maxCellMs = Math.max(this.stats.maxCellMs, performance.now() - c0);
      this.dirty = true;
    }
    // and forget the ones left behind
    for (const [k, c] of this.cells) {
      if (Math.hypot(c.cx - ci, c.cz - cj) * CELL > RANGE + CELL * 2.5) {
        this.cells.delete(k);
        this.dirty = true;
      }
    }
    if (key !== this.camCell) {
      this.camCell = key;
      this.dirty = true;
    }
    if (this.dirty) this.rebuild(ci, cj);
  }

  private buildCell(i: number, j: number): { cx: number; cz: number; items: { m: Float32Array; c: Float32Array; n: number }[] } {
    const r = rng(i * 73856093 + j * 19349663 + 7);
    const x0 = i * CELL, z0 = j * CELL;
    // the cell's ground in four quarters (cheaper than asking at every item)
    const quarter: { g: GroundKind | null; d: number }[] = [];
    for (const [qx, qz] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const x = x0 + qx * CELL, z = z0 + qz * CELL;
      const h = seabedHeight(x, z);
      const g = groundAt(x, z, h);
      const inHarbor = x > HARBOR.basin.minX && x < HARBOR.basin.maxX && z > HARBOR.basin.minZ && z < HARBOR.basin.maxZ;
      quarter.push({ g: g === 'land' || g === 'quay' || h > -1.5 || inHarbor ? null : (g as GroundKind), d: -h });
    }
    // seagrass grows in meadows: patches tens of metres across
    const meadow = (x: number, z: number) => Math.max(0, Math.min(1, (Math.sin(x * 0.031 + 1.3) * Math.sin(z * 0.027 - 0.4) + Math.sin(x * 0.011 - z * 0.013) * 0.6 - 0.15) * 2.2));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), q2 = new THREE.Quaternion();
    const centres: [number, number][] = [0, 1, 2].map(() => [x0 + (0.15 + r() * 0.7) * CELL, z0 + (0.15 + r() * 0.7) * CELL]);
    const items = KINDS.map((k) => {
      let count = 0;
      for (const qd of quarter) if (qd.g) count += k.per(qd.d, qd.g, meadow(x0 + CELL / 2, z0 + CELL / 2)) / 4;
      count *= this.density;
      const n = Math.floor(count) + (r() < count - Math.floor(count) ? 1 : 0);
      const m = new Float32Array(n * 16), c = new Float32Array(n * 3);
      let w = 0;
      for (let a = 0; a < n; a++) {
        // urchins and shells gather round a few places in the cell; the rest scatter
        let x: number, z: number;
        if (k.name === 'urchin' || k.name === 'shell') {
          const c = centres[a % centres.length];
          x = c[0] + (r() - 0.5) * (1.5 + r() * 4);
          z = c[1] + (r() - 0.5) * (1.5 + r() * 4);
        } else {
          x = x0 + r() * CELL;
          z = z0 + r() * CELL;
        }
        const qd = quarter[(x - x0 > CELL / 2 ? 1 : 0) + (z - z0 > CELL / 2 ? 2 : 0)];
        if (!qd.g || k.per(qd.d, qd.g, 1) <= 0) {
          r();
          r();
          continue;
        }
        if (k.name === 'seagrass' && r() > meadow(x, z) + 0.15) continue;
        const h = seabedHeight(x, z);
        const sz = k.size[0] + r() * (k.size[1] - k.size[0]);
        const fl = k.flat ? 1 - r() * k.flat : 1;
        e.set(0, r() * Math.PI * 2, 0);
        q.setFromEuler(e);
        if (k.align) {
          const hx = seabedHeight(x + 0.6, z) - h, hz = seabedHeight(x, z + 0.6) - h;
          nrm.set(-hx, 0.6, -hz).normalize();
          q2.setFromUnitVectors(up, nrm);
          q.premultiply(q2);
        }
        p.set(x, h - k.sink * sz, z);
        s.set(sz, sz * fl, sz * (k.flat ? 0.8 + r() * 0.4 : 1));
        m4.compose(p, q, s);
        m4.toArray(m, w * 16);
        const col = k.colours[Math.floor(r() * k.colours.length)];
        const v = 0.85 + r() * 0.3;
        c[w * 3] = col[0] * v;
        c[w * 3 + 1] = col[1] * v;
        c[w * 3 + 2] = col[2] * v;
        w++;
      }
      return { m, c, n: w };
    });
    // what the arm took from this cell stays gone
    const gone = this.taken.get(`${i}:${j}`);
    if (gone) {
      for (const g of gone) {
        const [ki, a] = g.split(':').map(Number);
        if (a < items[ki].n) items[ki].m.fill(0, a * 16, a * 16 + 16);
      }
    }
    return { cx: i, cz: j, items };
  }

  /** copy the cells' instances into the meshes (the nearest first, up to each kind's cap) */
  private rebuild(ci: number, cj: number): void {
    this.dirty = false;
    const cells = [...this.cells.values()].sort((a, b) => Math.hypot(a.cx - ci, a.cz - cj) - Math.hypot(b.cx - ci, b.cz - cj));
    let total = 0;
    KINDS.forEach((k, ki) => {
      const mesh = this.meshes[ki];
      const mats = mesh.instanceMatrix.array as Float32Array;
      const cols = mesh.instanceColor!.array as Float32Array;
      const cap = Math.floor(k.cap * Math.max(0.3, this.density));
      // (nothing past the distance where the shader has shrunk it away, with a cell's diagonal to spare:
      // the list is only made again when the camera crosses into another cell)
      const reach = ((k.geo.attributes.aFar as THREE.BufferAttribute).getX(0) + CELL * 1.42) / CELL;
      let n = 0;
      for (const c of cells) {
        if (n >= cap || Math.hypot(c.cx - ci, c.cz - cj) > reach) break;
        const it = c.items[ki];
        // (a cell with none of this kind is skipped, not the end of the list)
        const take = Math.min(it.n, cap - n);
        if (take <= 0) continue;
        mats.set(it.m.subarray(0, take * 16), n * 16);
        cols.set(it.c.subarray(0, take * 3), n * 3);
        n += take;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      total += n;
    });
    this.stats.instances = total;
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
    for (const m of this.heldMats) m.dispose();
    this.cells.clear();
  }
}
