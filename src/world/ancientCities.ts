// Dune Sea: the four ancient cities. Greco-Roman towns the sand took, each with its own character:
//
// - TADMOR, a Palmyra: the great colonnade, more than a kilometre and a half of it, bending at a triple
//   arch, from the temenos of Bel (a walled precinct with porticoes round a temple) out to the west
//   gate; the theatre, the agora, a tetrapylon, a castle on a hill, and the valley of the tower tombs
//   between two ridges.
// - EPHESOS, an Ephesus: the great theatre cut into a hill, the marble street running down to a library
//   facade, the harbour road with its columns out to a silted harbour, terraced houses on a second hill,
//   the stadium, the upper agora, the Artemision outside the walls.
// - POSEIDONIA, a Paestum: three great Doric temples in a row, the forum between them, the long circuit
//   of walls with towers and four gates, and house foundations on the grid all over the town.
// - GERASA, a Jerash: the oval plaza ringed by columns, the long colonnaded cardo with its tetrapylons,
//   temples on raised terraces, two theatres, the hippodrome and Hadrian's arch outside the south gate,
//   the eastern half of the town under a dune.
//
// Every city: low house foundations forming room grids on most of its blocks, tongues of dune run in over
// streets and quarters (their shape is in desert.ts, ANCIENT), fields of fallen columns and blocks,
// roads out of the gates lined with tombs, an aqueduct striding in over the sand.
//
// A city is a plan: a list of pieces, each a copy of one of the ruin kinds (desertRuins.ts, drawn
// instanced: cheap however many there are), placed in the city's own frame (u across, v along its main
// street, metres, from its centre), plus one-off models of its own (extras, cityModels.ts). desertProps.ts
// turns the plan into the world: it sinks every piece to the lowest sand under it (and piece.sink more)
// and draws it only within its range of the camera.

import * as THREE from 'three';
import { ANCIENT, AncientSite, ancientGround, ancientDrift, duneHeight } from './desert';
import { CITY_MODELS, buildDistrict, DistrictOpt } from './cityModels';

export type AncientCity = (typeof ANCIENT)[number];

/** One piece of a city: a copy of a ruin kind. */
export interface CityPiece {
  /** a RuinKind (desertRuins.ts); kinds the ruins module does not have are skipped */
  kind: string;
  /** position in the city's frame (m from its centre: u across, v along the main street) */
  u: number;
  v: number;
  /** turn about the vertical, relative to the city's grid (rad; a ruin's local +z runs along +v at 0) */
  yaw: number;
  /** drawn this many times life size */
  scale: number;
  /** which of the kind's versions (0-2; random when left out) */
  version?: number;
  /** extra depth to sink it below the lowest sand under it (m; default 0.4) */
  sink?: number;
  /** drawn within this distance of the camera (m; a default per kind when left out) */
  range?: number;
}

/** A one-off model of a city's own, built after loading. */
export interface CityExtra {
  build: () => THREE.BufferGeometry;
  u: number;
  v: number;
  yaw: number;
  /** the radius of ground it stands on (m: it is sunk to the lowest sand within 0.6 of it) */
  footprint: number;
  range: number;
  scale?: number;
  sink?: number;
}

export interface CityPlan {
  pieces: CityPiece[];
  extras?: CityExtra[];
}

type P2 = [number, number];
type Rnd = () => number;

/** how high each kind stands at life size (m; a piece drifted over deeper than most of that is left out) */
const TALL: Record<string, number> = {
  colonnade: 14, temple: 16, arch: 21, wall: 14, tomb: 16, column: 14, statue: 3, gate: 16, houses: 3, well: 3, obelisk: 5, theatre: 11,
  street: 13, wallrun: 11, aqueduct: 21, amphitheatre: 19, forum: 8, basilica: 20, facade: 17,
};
/** half the length of the tileable kinds (60 m sections) */
const TILE = 60;
/** how far the pieces are drawn (m): landmarks from far off, the repeated small ones only near */
const RANGE = { landmark: 24000, big: 18000, mid: 13000, tile: 9000, small: 7000, fabric: 6500 };

/** a city's plan being laid out: pieces placed on its ground, buried where the dunes lie over it */
class Planner {
  pieces: CityPiece[] = [];
  extras: CityExtra[] = [];
  /** ground the monuments stand on, which the houses keep off (circles) */
  private occ: { u: number; v: number; r: number }[] = [];
  /** the streets' corridors (segments with a half-width), kept clear of houses */
  private lanes: { a: P2; b: P2; w: number }[] = [];
  /** the circuit of the walls (houses are only inside it) */
  wall: P2[] = [];
  private readonly co: number;
  private readonly si: number;

  constructor(readonly c: AncientSite, readonly rnd: Rnd) {
    this.co = Math.cos(c.yaw);
    this.si = Math.sin(c.yaw);
  }

  sup(u: number, v: number): number {
    return ancientGround(this.c, u, v);
  }
  drift(u: number, v: number): number {
    return ancientDrift(this.c, u, v);
  }
  occupy(u: number, v: number, r: number): void {
    this.occ.push({ u, v, r });
  }
  lane(a: P2, b: P2, w: number): void {
    this.lanes.push({ a, b, w });
  }
  /** is this ground free of monuments and streets (r: the radius needed)? */
  free(u: number, v: number, r: number): boolean {
    for (const o of this.occ) if ((u - o.u) ** 2 + (v - o.v) ** 2 < (r + o.r) ** 2) return false;
    for (const l of this.lanes) if (segDist(u, v, l.a, l.b) < r + l.w) return false;
    return true;
  }
  inside(u: number, v: number): boolean {
    return this.wall.length < 3 || inPoly(u, v, this.wall);
  }

  /**
   * Place a piece. It is set into the ground so its foot is at the lowest of the ground under its middle
   * (and its ends, for the long ones: never left hanging over a slope), and buried where a dune lies over it;
   * one drifted over too deep to show is left out.
   */
  put(kind: string, u: number, v: number, yaw: number, scale: number, o: { range?: number; sink?: number; len?: number; version?: number; force?: boolean } = {}): boolean {
    const tall = (TALL[kind] ?? 10) * scale;
    const dr = this.drift(u, v);
    if (!o.force && dr > tall * 0.7) return false;
    // where desertProps will set it: the lowest sand in a ring round it
    const R = 24;
    let pred = this.sup(u, v) + dr;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, pu = u + Math.cos(a) * R, pv = v + Math.sin(a) * R;
      pred = Math.min(pred, this.sup(pu, pv) + this.drift(pu, pv));
    }
    // where it should stand: the ground under its middle (and its ends), the dunes over it not counted
    let want = this.sup(u, v);
    if (o.len) {
      const du = Math.sin(yaw) * o.len, dv = Math.cos(yaw) * o.len;
      want = Math.min(want, this.sup(u + du, v + dv), this.sup(u - du, v - dv));
    }
    const sink = (o.sink ?? 0.4) + Math.max(0, pred - want);
    this.pieces.push({ kind, u, v, yaw, scale, sink, range: o.range ?? defaultRange(kind), version: o.version });
    return true;
  }

  /** A row of tileable sections (street, wallrun, aqueduct) from a to b; gaps where it has fallen or gone under. Returns the tile centres. */
  run(kind: string, a: P2, b: P2, scale: number, o: { gap?: number; range?: number; sink?: number; lane?: number } = {}): P2[] {
    const du = b[0] - a[0], dv = b[1] - a[1], L = Math.hypot(du, dv);
    const step = TILE * scale, n = Math.max(1, Math.round(L / step));
    const yaw = Math.atan2(du, dv), ux = du / L, vx = dv / L;
    const start = L / 2 - (n * step) / 2 + step / 2;
    const out: P2[] = [];
    for (let i = 0; i < n; i++) {
      const s = start + i * step, u = a[0] + ux * s, v = a[1] + vx * s;
      out.push([u, v]);
      if (o.gap && this.rnd() < o.gap) continue;
      this.put(kind, u, v, yaw, scale, { range: o.range, sink: o.sink, len: step * 0.48 });
    }
    if (o.lane) this.lane(a, b, o.lane);
    return out;
  }

  /** A colonnaded street from a to b (its corridor kept clear). */
  street(a: P2, b: P2, scale: number, gap = 0.08): P2[] {
    return this.run('street', a, b, scale, { gap, lane: 11 * scale, range: RANGE.tile });
  }

  /** The circuit of walls: sections along each side (stretches fallen), a gate at each of `gates`, towers at the corners. */
  walls(poly: P2[], scale: number, gates: P2[], o: { gap?: number; tower?: string } = {}): void {
    this.wall = poly;
    const n = poly.length;
    let cu = 0, cv = 0;
    for (const p of poly) { cu += p[0] / n; cv += p[1] / n; }
    const step = TILE * scale;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const du = b[0] - a[0], dv = b[1] - a[1], L = Math.hypot(du, dv);
      const ux = du / L, vx = dv / L;
      // (a wall section's towers and drifts are on its local -x side: turned to face out of the town)
      let yaw = Math.atan2(du, dv);
      const mu = (a[0] + b[0]) / 2 - cu, mv = (a[1] + b[1]) / 2 - cv;
      if (-vx * mu + ux * mv < 0) yaw += Math.PI;
      const m = Math.max(1, Math.round(L / step));
      for (let k = 0; k < m; k++) {
        const s = (k + 0.5) * (L / m), u = a[0] + ux * s, v = a[1] + vx * s;
        if (gates.some((g) => Math.hypot(g[0] - u, g[1] - v) < step * 0.9)) continue;
        if (this.rnd() < (o.gap ?? 0.22)) continue;
        this.put('wallrun', u, v, yaw, scale * (L / m / step), { len: step * 0.48, range: RANGE.tile, sink: 0.2 });
      }
      // a corner tower
      if (this.rnd() < 0.85) this.put(o.tower ?? 'tomb', a[0], a[1], yaw, scale * 0.9, { range: RANGE.mid });
    }
    for (const g of gates) {
      // the gate's curtain walls run along its local x: along the wall where it stands
      let best = 0, bd = 1e9;
      for (let i = 0; i < n; i++) {
        const d = segDist(g[0], g[1], poly[i], poly[(i + 1) % n]);
        if (d < bd) { bd = d; best = i; }
      }
      const a = poly[best], b = poly[(best + 1) % n];
      this.put('gate', g[0], g[1], Math.atan2(-(b[1] - a[1]), b[0] - a[0]), scale * 1.05, { range: RANGE.big, force: true });
      this.occupy(g[0], g[1], 60);
    }
  }

  /** A road out from a, heading along dir for len metres, lined with tombs on both sides (a few statues and columns among them). */
  tombRoad(a: P2, dir: number, len: number, o: { every?: number; off?: [number, number]; scale?: number; first?: number } = {}): void {
    const du = Math.sin(dir), dv = Math.cos(dir);
    const every = o.every ?? 70, [o0, o1] = o.off ?? [45, 90];
    for (let s = o.first ?? 120; s < len; s += every * (0.75 + 0.5 * this.rnd())) {
      const side = this.rnd() < 0.5 ? -1 : 1, off = side * (o0 + (o1 - o0) * this.rnd());
      const u = a[0] + du * s + dv * off, v = a[1] + dv * s - du * off;
      const r = this.rnd();
      const kind = r < 0.78 ? 'tomb' : r < 0.88 ? 'column' : r < 0.95 ? 'statue' : 'obelisk';
      this.put(kind, u, v, dir + (this.rnd() - 0.5) * 0.3 + (this.rnd() < 0.5 ? 0 : Math.PI / 2), (o.scale ?? 1.5) * (0.85 + 0.3 * this.rnd()), { range: kind === 'tomb' ? RANGE.mid : RANGE.small });
    }
  }

  /** An aqueduct striding in from far out: from `a` out along dir for len, stretches fallen; the sections follow the dunes' floors where they can. */
  aqueduct(a: P2, dir: number, len: number, scale: number): void {
    const step = TILE * scale;
    let u = a[0], v = a[1], d = dir;
    for (let s = 0; s < len; s += step) {
      // (a slight wander: it kept to the contour)
      d += (this.rnd() - 0.5) * 0.05;
      const yaw = Math.atan2(Math.sin(d), Math.cos(d));
      if (this.rnd() > 0.16) this.put('aqueduct', u + Math.sin(d) * step / 2, v + Math.cos(d) * step / 2, yaw, scale, { len: step * 0.48, range: RANGE.tile + 2000 });
      u += Math.sin(d) * step;
      v += Math.cos(d) * step;
    }
  }

  /**
   * A district of house foundations: insulae on the city grid (nx by nz, each `cell` with streets between
   * at this scale), centred on (u, v); the insulae on monuments, streets, outside the walls or under the
   * dunes are left out; every wall stands on the sand where it is.
   */
  district(u: number, v: number, nx: number, nz: number, scale: number, o: Partial<DistrictOpt> & { yaw?: number; outside?: boolean } = {}): void {
    const cell = o.cell ?? 38, street = o.street ?? 7, cellZ = o.cellZ ?? cell;
    const yaw = o.yaw ?? 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const PX = (cell + street) * scale, PZ = (cellZ + street) * scale;
    const keep: boolean[] = [];
    let any = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lx = (i - (nx - 1) / 2) * PX, lz = (j - (nz - 1) / 2) * PZ;
      const iu = u + lx * cy + lz * sy, iv = v - lx * sy + lz * cy;
      const ok = this.free(iu, iv, Math.max(PX, PZ) * 0.42) && (o.outside || this.inside(iu, iv)) && this.drift(iu, iv) < 2.5;
      keep.push(ok);
      if (ok) any++;
    }
    if (!any) return;
    const rnd = mulberryFrom(this.rnd);
    const c = this.c, co = this.co, si = this.si;
    const self = this;
    const opt: DistrictOpt = { nx, nz, cell, cellZ, street, buried: o.buried ?? 0.2, tone: o.tone, skip: (i, j) => !keep[i * nz + j] };
    // (where desertProps sets the model: the lowest sand round its middle; footprint 1 m)
    const fp = 1;
    this.extras.push({
      u, v, yaw, footprint: fp, range: RANGE.fabric, scale, sink: 0,
      build: () => {
        const wx = c.x + u * co + v * si, wz = c.z - u * si + v * co;
        let base = duneHeight(wx, wz);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          base = Math.min(base, duneHeight(wx + Math.cos(a) * fp * 0.6, wz + Math.sin(a) * fp * 0.6));
        }
        // a point of the model: its place in the city, the sand there without the dunes lying over it (walls under a deep drift are left out)
        const ground = (x: number, z: number) => {
          const pu = u + (x * cy + z * sy) * scale, pv = v + (-x * sy + z * cy) * scale;
          const dr = self.drift(pu, pv);
          if (dr > 2.2) return NaN;
          const h = duneHeight(c.x + pu * co + pv * si, c.z - pu * si + pv * co) - dr;
          return (h - base) / scale;
        };
        return buildDistrict(rnd(), opt, ground);
      },
    });
  }

  /** Fill a rectangle of the city (u0..u1, v0..v1) with districts of foundations, on the grid. */
  fill(u0: number, v0: number, u1: number, v1: number, scale: number, o: Partial<DistrictOpt> & { max?: number } = {}): void {
    const cell = o.cell ?? 38, street = o.street ?? 7, cellZ = o.cellZ ?? cell;
    const PX = (cell + street) * scale, PZ = (cellZ + street) * scale;
    const max = o.max ?? 7;
    const NX = Math.max(1, Math.floor((u1 - u0) / PX)), NZ = Math.max(1, Math.floor((v1 - v0) / PZ));
    for (let i = 0; i < NX; i += max) for (let j = 0; j < NZ; j += max) {
      const nx = Math.min(max, NX - i), nz = Math.min(max, NZ - j);
      const cu = u0 + (i + nx / 2) * PX, cv = v0 + (j + nz / 2) * PZ;
      this.district(cu, cv, nx, nz, scale, o);
    }
  }

  /** Better-kept houses (the ruin kind: walls a little higher, a courtyard column or two) here and there on free ground. */
  houses(u0: number, v0: number, u1: number, v1: number, n: number, scale: number): void {
    for (let t = 0, k = 0; t < n * 8 && k < n; t++) {
      const u = u0 + (u1 - u0) * this.rnd(), v = v0 + (v1 - v0) * this.rnd();
      if (!this.inside(u, v) || !this.free(u, v, 30 * scale)) continue;
      if (this.put('houses', u, v, (this.rnd() < 0.5 ? 0 : Math.PI / 2) + (this.rnd() - 0.5) * 0.05, scale, { range: RANGE.fabric })) {
        this.occupy(u, v, 24 * scale);
        k++;
      }
    }
  }

  /** A field of fallen columns and blocks: column pairs, broken colonnades, a statue, round (u, v). */
  field(u: number, v: number, r: number, n: number, scale = 1.4): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2, d = r * Math.sqrt(this.rnd());
      const pu = u + Math.cos(a) * d, pv = v + Math.sin(a) * d;
      const k = this.rnd();
      this.put(k < 0.6 ? 'column' : k < 0.85 ? 'colonnade' : k < 0.93 ? 'statue' : 'obelisk', pu, pv, this.rnd() * 6.28, scale * (0.85 + 0.3 * this.rnd()), { range: RANGE.small });
    }
  }

  /** A tetrapylon: four column groups round a street crossing. */
  tetrapylon(u: number, v: number, yaw: number, scale: number): void {
    for (let k = 0; k < 4; k++) {
      const a = yaw + Math.PI / 4 + (k * Math.PI) / 2;
      this.put('column', u + Math.sin(a) * 26 * scale, v + Math.cos(a) * 26 * scale, a + Math.PI / 4, scale * 1.05, { range: RANGE.mid, force: true });
    }
  }

  /** One of the cities' own models (cityModels.ts). */
  extra(name: string, u: number, v: number, yaw: number, scale: number, footprint: number, range = RANGE.landmark, sink = 0.5): void {
    const seed = Math.floor(this.rnd() * 2 ** 31);
    this.extras.push({ build: () => CITY_MODELS[name](mulberry(seed)), u, v, yaw, scale, footprint, range, sink });
  }
}

function defaultRange(kind: string): number {
  switch (kind) {
    case 'temple': case 'theatre': case 'amphitheatre': case 'facade': return RANGE.landmark;
    case 'gate': case 'arch': case 'basilica': case 'forum': return RANGE.big;
    case 'colonnade': case 'tomb': case 'wall': return RANGE.mid;
    case 'street': case 'wallrun': case 'aqueduct': return RANGE.tile;
    case 'houses': return RANGE.fabric;
    default: return RANGE.small;
  }
}

function segDist(u: number, v: number, a: P2, b: P2): number {
  const eu = b[0] - a[0], ev = b[1] - a[1], L2 = eu * eu + ev * ev || 1;
  const t = Math.max(0, Math.min(1, ((u - a[0]) * eu + (v - a[1]) * ev) / L2));
  return Math.hypot(u - a[0] - eu * t, v - a[1] - ev * t);
}

function inPoly(u: number, v: number, p: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > v) !== (p[j][1] > v) && u < ((p[j][0] - p[i][0]) * (v - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
  }
  return inside;
}

/** a small seeded generator (the extras are built later, each from its own seed) */
function mulberry(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** a seed taken now, the generator made when the model is built */
function mulberryFrom(rnd: Rnd): () => Rnd {
  const seed = Math.floor(rnd() * 2 ** 31);
  return () => mulberry(seed);
}

const along = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dirOf = (a: P2, b: P2) => Math.atan2(b[0] - a[0], b[1] - a[1]);
const HALF = Math.PI / 2;

// ================================================================================================
// TADMOR (a Palmyra)
// ================================================================================================
function palmyra(p: Planner): void {
  const S = 1.6;
  // the walls of Diocletian round the town; gates at the colonnade's west end, the north, the east and toward the tombs
  const wall: P2[] = [[-1200, -950], [-350, -1180], [650, -1080], [1180, -560], [1200, 380], [560, 760], [-380, 920], [-1180, 520]];
  // the temenos of Bel on its low platform, its propylaeum facing west down the colonnade
  const bel: P2 = [840, -100];
  p.extra('temenos', bel[0], bel[1], 0, 1.25, 60, RANGE.landmark, 0.6);
  p.put('temple', bel[0] + 15, bel[1], HALF, 1.75, { range: RANGE.landmark, force: true });
  p.occupy(bel[0], bel[1], 150);
  // the great colonnade: from the propylaeum to the arch, the bend, and on west through the tetrapylon to the west gate
  const A0: P2 = [690, -100], arch: P2 = [380, -310], B1: P2 = [-1170, -470];
  p.street(A0, along(A0, arch, 0.9), S, 0.05);
  p.street(along(arch, B1, 0.035), B1, S, 0.1);
  const da = Math.atan2(A0[0] - arch[0], A0[1] - arch[1]), db = Math.atan2(arch[0] - B1[0], arch[1] - B1[1]);
  p.extra('arch3', arch[0], arch[1], Math.atan2(Math.sin(da) + Math.sin(db), Math.cos(da) + Math.cos(db)), 1.7, 14);
  p.occupy(arch[0], arch[1], 40);
  const tetra = along(arch, B1, 0.55);
  p.tetrapylon(tetra[0], tetra[1], dirOf(arch, B1), 1.3);
  p.occupy(tetra[0], tetra[1], 50);
  // a cross street north from the tetrapylon to the temple of Baalshamin, and south to the agora
  p.street([tetra[0], tetra[1] - 50], [tetra[0] + 20, -720], S, 0.15);
  p.street([tetra[0], tetra[1] + 50], [tetra[0] - 5, -160], S, 0.2);
  p.put('temple', -290, -800, 0, 1.3);
  p.put('colonnade', -290, -885, 0, 1.3);
  p.put('colonnade', -400, -800, HALF, 1.3);
  p.occupy(-310, -800, 110);
  // the theatre south of the colonnade, its stage facing it; the agora and the senate beyond; the temple of Nabu
  p.put('theatre', 20, -210, -HALF, 1.5, { force: true });
  p.occupy(20, -160, 120);
  p.put('forum', -330, -120, 0, 1.6);
  p.occupy(-330, -120, 90);
  p.put('basilica', -190, 40, 0, 1.4);
  p.occupy(-190, 40, 50);
  p.put('temple', 250, -165, HALF, 1.3);
  p.occupy(250, -165, 55);
  // the baths north of the colonnade
  p.put('basilica', 120, -470, 0, 1.5);
  p.occupy(120, -470, 60);
  // Diocletian's camp at the west end: the temple of the standards, its via principalis, broken porticoes
  p.street([-950, -430], [-950, -150], S, 0.2);
  p.put('basilica', -950, -90, HALF, 1.3);
  p.put('colonnade', -870, -250, HALF, 1.3);
  p.put('colonnade', -1040, -260, HALF, 1.3);
  p.occupy(-950, -200, 140);
  // fields of fallen columns either side of the colonnade's west end; wells, a statue or two
  p.field(-700, -560, 90, 7);
  p.field(-250, -230, 60, 4);
  p.field(520, -330, 70, 5);
  p.put('well', -560, -320, 0, 1.4);
  p.put('statue', 300, -390, 1.2, 1.5);
  p.put('obelisk', -80, -400, 0.4, 1.4);
  p.walls(wall, 1.5, [[-1185, -475], [-60, -1132], [1190, -110], [-660, 783]]);
  // house foundations over the town: districts on the grid, and a few better-kept houses
  p.fill(-1150, -1120, 1180, 900, 1.5, { buried: 0.22 });
  p.houses(-1100, -1000, 1100, 850, 26, 1.5);
  // the castle on its hill to the north-west
  p.put('wall', -1600, -1500, 0.4, 1.0, { range: RANGE.big, force: true });
  p.put('tomb', -1560, -1540, 0.4, 1.5, { range: RANGE.big, force: true });
  p.put('gate', -1650, -1440, 0.4 + HALF, 1.2, { range: RANGE.big, force: true });
  // the valley of the tombs: a road out of the south-west gate down between the two ridges, tower tombs on the floor and up the slopes
  const vd = Math.atan2(-0.732, 0.682);
  p.tombRoad([-660, 783], vd, 2500, { every: 55, off: [45, 230], scale: 1.6, first: 150 });
  p.tombRoad([-660, 783], vd, 2000, { every: 90, off: [40, 120], scale: 1.4, first: 260 });
  // roads out of the west and north gates with tombs, and an aqueduct from the springs to the north
  p.tombRoad([-1185, -475], -HALF - 0.1, 1700, { every: 110 });
  p.tombRoad([-60, -1132], Math.PI + 0.15, 1500, { every: 120 });
  p.aqueduct([350, -1090], Math.PI - 0.35, 3200, 1.4);
}

// ================================================================================================
// EPHESOS (an Ephesus)
// ================================================================================================
function ephesus(p: Planner): void {
  const S = 1.6;
  const wall: P2[] = [[-1250, -850], [-250, -1250], [850, -1200], [1350, -600], [1400, 300], [1250, 1250], [250, 1400], [-600, 1050], [-1250, 450]];
  // the great theatre cut into the west flank of the hill (the cut is in desert.ts), its stage toward the harbour road
  p.put('theatre', 286, -230, 0, 1.8, { force: true });
  p.occupy(300, -230, 140);
  // the harbour road (the Arcadiane) west from the theatre to the harbour gate and the silted harbour
  p.street([150, -230], [-1180, -230], S, 0.08);
  // the marble street south from the theatre to the library
  p.street([170, -350], [170, 440], S, 0.06);
  // the library facade at the street's foot, facing up it; the gate beside it into the agora
  p.put('facade', 170, 500, Math.PI, 1.9, { force: true, range: RANGE.landmark });
  p.occupy(170, 505, 45);
  p.extra('arch3', 85, 470, HALF, 1.25, 12, RANGE.big);
  p.occupy(85, 470, 25);
  // the lower agora west of the marble street, its porticoes
  p.put('forum', -30, 330, 0, 1.9);
  p.put('colonnade', -30, 225, 0, 1.4);
  p.put('colonnade', -30, 435, 0, 1.4);
  p.put('colonnade', -135, 330, HALF, 1.4);
  p.occupy(-30, 330, 125);
  // Curetes street climbing east between the hills to the upper agora; the temple of Hadrian, fountains, monuments along it
  const c0: P2 = [235, 470], c1: P2 = [950, 390];
  p.street(c0, c1, S, 0.05);
  p.put('facade', 480, 392, 0, 1.0, { range: RANGE.big });
  p.put('well', 700, 478, 0, 1.4);
  p.put('statue', 820, 448, 2.2, 1.5);
  p.put('column', 600, 405, dirOf(c0, c1), 1.4);
  p.put('column', 880, 452, dirOf(c0, c1), 1.4);
  p.occupy(480, 392, 30);
  // the upper agora, its stoa, the odeon
  p.put('forum', 1060, 330, 0, 1.5);
  p.put('basilica', 1060, 445, 0, 1.4);
  p.put('theatre', 1200, 325, HALF, 0.8);
  p.occupy(1080, 360, 140);
  // the stadium north of the hill
  p.extra('stadium', 250, -1000, 0, 1.5, 70);
  p.occupy(250, -1000, 190);
  // the harbour: quays round the silted basin (the walls sunk to show only their tops), columns and statues on them
  for (let v = -330; v <= 90; v += 84) p.put('wallrun', -1345, v, 0, 1.4, { sink: 6.5, range: RANGE.tile, force: true });
  for (let u = -1900; u <= -1420; u += 84) {
    p.put('wallrun', u, -410, HALF, 1.4, { sink: 6.5, range: RANGE.tile, force: true });
    p.put('wallrun', u, 170, HALF, 1.4, { sink: 6.5, range: RANGE.tile, force: true });
  }
  p.put('column', -1300, -300, 0, 1.4);
  p.put('column', -1300, -160, 0, 1.4);
  p.put('statue', -1310, -40, 0.7, 1.5);
  p.put('obelisk', -1320, 60, 0.2, 1.4);
  p.walls(wall, 1.5, [[-1250, -230], [-160, -1240], [1378, 0], [-220, 1215]]);
  // houses: districts on the flat north and south-west, the terraced houses up the hill south of Curetes street
  p.fill(-1200, -1150, 80, -300, 1.5, { buried: 0.2 });
  p.fill(-1200, -160, -140, 520, 1.5, { buried: 0.25 });
  p.district(390, 760, 5, 4, 1.4, { buried: 0.08 });
  p.district(780, 730, 5, 4, 1.4, { buried: 0.12 });
  p.district(1180, 780, 3, 4, 1.4, { buried: 0.2 });
  p.fill(-560, 560, 120, 1050, 1.5, { buried: 0.3 });
  p.houses(-1100, -1000, 0, 500, 22, 1.5);
  p.houses(450, 0, 1300, 250, 6, 1.5);
  // fields of fallen columns along the harbour road and at the theatre's foot
  p.field(-500, -300, 80, 6);
  p.field(60, -120, 50, 4);
  // the Artemision out on the plain to the north-east: its platform under the sand, one column standing, drums all round
  p.put('temple', 1850, -1450, HALF, 2.0, { sink: 6, range: RANGE.big, force: true });
  p.put('column', 1780, -1460, 0, 1.6, { force: true, range: RANGE.mid });
  p.field(1850, -1450, 130, 8, 1.5);
  // roads out: the Magnesian gate east, the Koressian gate north, with their tombs; the aqueduct in from the east
  p.tombRoad([1378, 0], HALF + 0.08, 1400, { every: 85 });
  p.tombRoad([-160, -1240], Math.PI, 1200, { every: 100 });
  p.tombRoad([-220, 1215], 0.3, 900, { every: 110 });
  p.aqueduct([1360, -420], HALF - 0.2, 2800, 1.4);
}

// ================================================================================================
// POSEIDONIA (a Paestum)
// ================================================================================================
function paestum(p: Planner): void {
  const wall: P2[] = [[-1150, -1100], [-200, -1250], [900, -1180], [1230, -500], [1220, 500], [1000, 1180], [-150, 1250], [-1120, 1050], [-1250, 150], [-1245, -200]];
  // the three Doric temples in a row west of the via Sacra, all facing east: Athena to the north, Neptune and Hera side by side to the south
  p.extra('athena', -180, -650, 0, 1.75, 45);
  p.occupy(-180, -650, 75);
  p.extra('neptune', -230, 380, 0, 1.6, 55);
  p.occupy(-220, 380, 85);
  p.extra('hera', -230, 575, 0, 1.6, 50);
  p.occupy(-225, 575, 80);
  // the via Sacra (colonnaded by the forum) and the street east-west from the sea gate to the Siren gate
  p.street([0, -420], [0, 260], 1.5, 0.1);
  p.lane([0, -1240], [0, 1240], 14);
  p.street([-420, 60], [700, 60], 1.5, 0.15);
  p.lane([-1248, 60], [1226, 60], 14);
  // the forum east of the via Sacra: porticoes round it, the capitolium on its north side, the comitium, a basilica
  p.put('forum', 190, -60, 0, 1.8);
  p.put('colonnade', 130, -150, 0, 1.3);
  p.put('colonnade', 260, -150, 0, 1.3);
  p.put('colonnade', 335, -60, HALF, 1.3);
  p.occupy(190, -60, 110);
  p.put('temple', 190, -230, HALF, 1.15);
  p.occupy(190, -230, 50);
  p.put('theatre', 330, -300, HALF, 0.6);
  p.put('basilica', 380, 170, 0, 1.2);
  p.occupy(350, -280, 60);
  p.occupy(380, 170, 50);
  // the amphitheatre across the street east of the forum
  p.put('amphitheatre', 520, -60, 0, 1.0, { force: true });
  p.occupy(520, -60, 95);
  // a sanctuary south of the temples: a small temple, altars, a field of drums
  p.put('temple', -60, 820, HALF, 1.0);
  p.occupy(-60, 820, 45);
  p.field(-240, 140, 80, 6);
  p.field(-260, -400, 70, 5);
  p.put('well', 60, 160, 0, 1.4);
  p.put('statue', -60, -470, 2.6, 1.5);
  p.walls(wall, 1.55, [[0, -1237], [1226, 60], [0, 1241], [-1248, 60]], { gap: 0.12 });
  // the town's grid: long narrow insulae all over, as at Paestum (most of what shows from the air), and a few better-kept houses
  p.fill(-1220, -1220, 1220, 1220, 1.5, { cell: 30, cellZ: 80, street: 6, buried: 0.18, max: 8 });
  p.houses(-1000, -1000, 1000, 1000, 18, 1.5);
  // the necropoleis along the roads out of all four gates
  p.tombRoad([0, -1237], Math.PI, 1500, { every: 80 });
  p.tombRoad([0, 1241], 0, 1400, { every: 85 });
  p.tombRoad([-1248, 60], -HALF, 1300, { every: 95 });
  p.tombRoad([1226, 60], HALF, 1000, { every: 110 });
  // the aqueduct from the hills to the east
  p.aqueduct([1210, -350], HALF - 0.45, 2900, 1.4);
}

// ================================================================================================
// GERASA (a Jerash)
// ================================================================================================
function jerash(p: Planner): void {
  const S = 1.6;
  const wall: P2[] = [[-900, -1150], [300, -1180], [950, -800], [1150, 100], [950, 950], [300, 1170], [-500, 1150], [-950, 700], [-1050, -300]];
  // the oval plaza at the south end of the cardo
  p.extra('oval', 0, 760, -HALF, 1.6, 50, RANGE.landmark);
  p.occupy(0, 760, 95);
  // the cardo north from the plaza, the two tetrapylons where the decumani cross it
  const t1: P2 = [0, 300], t2: P2 = [0, -560];
  p.street([0, 680], [0, t1[1] + 45], S, 0.05);
  p.street([0, t1[1] - 45], [0, t2[1] + 45], S, 0.06);
  p.street([0, t2[1] - 45], [0, -1080], S, 0.12);
  p.tetrapylon(t1[0], t1[1], 0, 1.3);
  p.tetrapylon(t2[0], t2[1], 0, 1.2);
  p.occupy(t1[0], t1[1], 50);
  p.occupy(t2[0], t2[1], 45);
  // the decumani: the southern one runs east into the dune that has buried that half of the town
  p.street([-45, 300], [-620, 300], S, 0.12);
  p.street([45, 300], [1000, 300], S, 0.08);
  p.street([-45, -560], [-700, -560], S, 0.15);
  p.street([45, -560], [700, -560], S, 0.1);
  // the sanctuary of Artemis on its high terrace west of the cardo: the temple, porticoes round the court, the propylaeum at the foot
  p.put('temple', -360, -80, Math.PI, 1.9, { force: true });
  for (const u of [-450, -350, -250]) {
    p.put('colonnade', u, -190, 0, 1.25);
    p.put('colonnade', u, 30, 0, 1.25);
  }
  p.put('gate', -110, -80, HALF, 1.4, { force: true });
  p.occupy(-330, -80, 200);
  // the nymphaeum on the cardo
  p.put('facade', -38, -250, HALF, 1.6, { force: true });
  p.occupy(-50, -250, 30);
  // the temple of Zeus on its terrace beside the oval plaza, the south theatre behind it
  p.put('temple', -330, 820, Math.PI, 1.5, { force: true });
  p.put('colonnade', -330, 735, 0, 1.2);
  p.occupy(-330, 820, 140);
  p.put('theatre', -610, 900, -HALF, 1.5, { force: true });
  p.occupy(-600, 910, 115);
  // the north theatre, the churches, the east baths half under the dune
  p.put('theatre', -330, -470, HALF, 1.1);
  p.occupy(-330, -490, 80);
  p.put('basilica', -200, 400, 0, 1.3);
  p.occupy(-200, 400, 50);
  p.put('basilica', -260, -360, HALF, 1.2);
  p.occupy(-260, -360, 45);
  p.put('basilica', 450, -150, 0, 1.5, { force: true });
  p.occupy(450, -150, 60);
  // fields of fallen columns along the cardo
  p.field(-90, 100, 60, 5);
  p.field(90, -380, 60, 5);
  p.field(-120, -760, 70, 5);
  p.put('well', 70, 520, 0, 1.4);
  p.put('statue', -60, 600, 1.8, 1.5);
  // the south gate, the street from the plaza to it
  p.street([0, 845], [0, 1120], S, 0.1);
  p.walls(wall, 1.5, [[0, -1165], [0, 1162], [-1000, 200], [1105, -100]]);
  // houses: districts all over, up the slope of the west hill; the east half lies under the dune (the districts leave it out)
  p.fill(-1050, -1150, 1150, 1150, 1.5, { buried: 0.2 });
  p.houses(-900, -1000, 900, 1000, 22, 1.5);
  // outside the south gate: the hippodrome beside the road, Hadrian's arch, tombs on down the road
  p.extra('hippodrome', -230, 1455, -HALF, 1.5, 80);
  p.extra('arch3', 0, 1720, 0, 1.75, 14);
  p.tombRoad([0, 1162], 0, 1600, { every: 85, first: 650 });
  p.tombRoad([0, -1165], Math.PI - 0.08, 1500, { every: 90 });
  p.tombRoad([-1000, 200], -HALF, 1200, { every: 100 });
  // the aqueduct in from the north-west
  p.aqueduct([-880, -1180], Math.PI + 0.55, 3000, 1.4);
}

const PLANS: Record<AncientSite['plan'], (p: Planner) => void> = { palmyra, ephesus, paestum, jerash };

/** One of the ancient cities: its plan, from the ground it stands on (desert.ts ANCIENT) and its own layout above. */
export function buildCity(c: AncientCity, rnd: () => number): CityPlan {
  const p = new Planner(c, rnd);
  PLANS[c.plan](p);
  return { pieces: p.pieces, extras: p.extras };
}
