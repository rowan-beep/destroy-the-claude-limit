// Aircraft carriers: ships that sail, pitch and heave, with a flight deck
// you can land on and launch from.
//
// Each carrier sails its own small loop for ever (a circle at 30 knots, the
// speed that gives jets wind over the deck). Where it is, which way it points
// and how its deck moves are pure functions of the mission clock, so the
// same time always puts every ship in the same place (pause stops them,
// replays and every client agree).
//
// Ship-local coordinates: u metres toward the bow, v metres to starboard,
// y metres up from the waterline. The deck is a polygon in (u, v); the
// angled landing area, its arresting wires, the catapults and the island
// are laid out in the same frame (roughly a Nimitz-class plan view).
//
// The carrier's AirfieldDef ("runway" = the angled landing area) is moved
// every step, so the HUD, steerpoints, the theater map and the approach
// guidance all follow the ship.

import { AIRFIELDS, AirfieldDef, CarrierSpec, DECK_HEIGHT, LANDING_AREA } from './islands';

const DEG = Math.PI / 180;

/** A catapult: the shuttle's start (u, v), its heading offset from the bow (deg) and stroke (m). */
export interface Catapult {
  u: number;
  v: number;
  /** heading relative to the ship (deg, + = to starboard) */
  off: number;
  stroke: number;
}

export interface CarrierLayout {
  /** deck outline in (u, v), counter-clockwise */
  deck: [number, number][];
  cats: Catapult[];
  /** wires: distance along the landing axis from the ramp (m) */
  wires: number[];
  /** the ramp end of the landing centreline (u, v) */
  rampU: number;
  rampV: number;
  /** the island's footprint (u0..u1, v0..v1) and its height above the deck (m) */
  island: [number, number, number, number, number];
  /** close-in guns (RED ships only): (u, v, height above the waterline) */
  guns: [number, number, number][];
  /** deck-edge elevators (u0, u1, v0, v1) */
  elevators: [number, number, number, number][];
  /** jets parked on deck: (u, v, heading relative to the bow, deg) */
  parked: [number, number, number][];
}

// Deck plan (approximate Nimitz class): 332 m long, 76 m wide at the angled deck.
const DECK: [number, number][] = [
  [-160, -22],
  [40, -50],
  [78, -48],
  [100, -22],
  [150, -16],
  [172, -5],
  [172, 5],
  [150, 18],
  [120, 30],
  [95, 36],
  [-150, 36],
  [-160, 28],
];

const LAYOUTS: Record<CarrierSpec['cls'], CarrierLayout> = {
  nimitz: {
    deck: DECK,
    cats: [
      { u: 72, v: 7, off: 0, stroke: 92 },
      { u: 72, v: -6, off: 0, stroke: 92 },
      { u: -45, v: -24, off: -5, stroke: 92 },
      { u: -25, v: -34, off: -5, stroke: 92 },
    ],
    wires: [50, 62, 74, 86],
    rampU: -160,
    rampV: 2,
    island: [-38, 8, 24, 35, 38],
    guns: [],
    elevators: [
      [56, 76, 22, 36],
      [20, 40, 22, 36],
      [-76, -56, 22, 36],
      [-64, -46, -36, -25],
    ],
    parked: [
      [-62, 28, -62],
      [-80, 28, -62],
      [-98, 28, -62],
      [-116, 28, -62],
      [28, 28, -62],
    ],
  },
  ford: {
    deck: DECK,
    cats: [
      { u: 72, v: 7, off: 0, stroke: 92 },
      { u: 72, v: -6, off: 0, stroke: 92 },
      { u: -45, v: -24, off: -5, stroke: 92 },
      { u: -25, v: -34, off: -5, stroke: 92 },
    ],
    wires: [56, 68, 80],
    rampU: -160,
    rampV: 2,
    island: [-78, -52, 25, 35, 36],
    guns: [],
    elevators: [
      [8, 28, 22, 36],
      [-36, -16, 22, 36],
      [-64, -46, -36, -25],
    ],
    parked: [
      [-96, 28, -62],
      [-114, 28, -62],
      [-132, 28, -62],
      [-10, 28, -62],
      [40, 28, -62],
    ],
  },
  fujian: {
    deck: DECK,
    cats: [
      { u: 72, v: 7, off: 0, stroke: 92 },
      { u: 72, v: -6, off: 0, stroke: 92 },
      { u: -35, v: -28, off: -5, stroke: 92 },
    ],
    wires: [50, 62, 74, 86],
    rampU: -160,
    rampV: 2,
    island: [-70, -40, 24, 35, 34],
    // close-in guns on the sponsons: two at the bow, two at the stern
    guns: [
      [150, 20, 17],
      [140, -21, 17],
      [-152, 31, 16],
      [-150, -24, 16],
    ],
    elevators: [
      [-30, -10, 22, 36],
      [-96, -76, 22, 36],
    ],
    parked: [
      [-88, 28, -62],
      [-106, 28, -62],
      [-124, 28, -62],
      [0, 28, -62],
      [30, 28, -62],
    ],
  },
};

/** How the deck rides the sea (period s, amplitude): gentle open-ocean swell. */
const HEAVE = [
  [9.3, 0.85],
  [6.1, 0.35],
];
const PITCH = [
  [8.7, 0.55 * DEG],
  [5.3, 0.2 * DEG],
];
const ROLL = [
  [11.5, 0.9 * DEG],
  [7.4, 0.3 * DEG],
];

function wave(parts: number[][], t: number, seed: number): { v: number; rate: number } {
  let v = 0, rate = 0;
  for (let i = 0; i < parts.length; i++) {
    const w = (2 * Math.PI) / parts[i][0];
    const ph = seed * (1.7 + i * 2.3);
    v += parts[i][1] * Math.sin(w * t + ph);
    rate += parts[i][1] * w * Math.cos(w * t + ph);
  }
  return { v, rate };
}

let nextSeed = 1;
const _gl = { u: 0, v: 0 };

/** Something bolted to the ship at (u, v), y metres above the waterline. */
export interface Mount {
  u: number;
  v: number;
  y: number;
  /** world position and heading (rad clockwise from north) this step */
  place(x: number, y: number, z: number, heading: number): void;
}

export class Carrier {
  readonly layout: CarrierLayout;
  readonly seed = nextSeed++ * 0.731;
  /** position of the ship's centre (m), heading (deg true) and its unit axes */
  x = 0;
  z = 0;
  heading = 0;
  fx = 0;
  fz = -1;
  rx = 1;
  rz = 0;
  /** velocity (m/s) and turn rate (rad/s, + = turning to starboard) */
  vx = 0;
  vz = 0;
  yawRate = 0;
  /** heave (m), pitch (rad, bow up), roll (rad, starboard down) and their rates */
  heave = 0;
  pitch = 0;
  roll = 0;
  heaveRate = 0;
  pitchRate = 0;
  rollRate = 0;
  /** who sits on each catapult (an aircraft object, or null) */
  readonly catBusy: (object | null)[];
  /** the last time each catapult fired (mission clock) */
  readonly catFired: number[];
  /** guns riding this ship (ship-local spot, height above the waterline); moved every step */
  readonly mounts: Mount[] = [];

  constructor(readonly f: AirfieldDef) {
    this.layout = LAYOUTS[f.carrier!.cls];
    this.catBusy = this.layout.cats.map(() => null);
    this.catFired = this.layout.cats.map(() => -99);
  }

  get spec(): CarrierSpec {
    return this.f.carrier!;
  }

  get name(): string {
    return this.f.name;
  }

  /** the mission time of the last update */
  t = 0;

  /** Where the ship is, which way it points and how the deck moves at mission time t. */
  update(t: number): void {
    this.t = t;
    const s = this.spec;
    const w = (s.speed / s.radius) * s.dir;
    const th = s.phase + w * t;
    this.x = s.cx + s.radius * Math.sin(th);
    this.z = s.cz - s.radius * Math.cos(th);
    const h = th + (s.dir * Math.PI) / 2;
    this.heading = ((h / DEG) % 360 + 360) % 360;
    this.fx = Math.sin(h);
    this.fz = -Math.cos(h);
    this.rx = Math.cos(h);
    this.rz = Math.sin(h);
    this.vx = this.fx * s.speed;
    this.vz = this.fz * s.speed;
    this.yawRate = w;
    const hv = wave(HEAVE, t, this.seed);
    const pv = wave(PITCH, t, this.seed + 3.1);
    const rv = wave(ROLL, t, this.seed + 7.7);
    this.heave = hv.v;
    this.heaveRate = hv.rate;
    this.pitch = pv.v;
    this.pitchRate = pv.rate;
    // a ship in a turn heels outward a little
    this.roll = rv.v - s.dir * 1.1 * DEG;
    this.rollRate = rv.rate;
    this.placeField();
    for (const m of this.mounts) {
      const wx = this.x + this.fx * m.u + this.rx * m.v;
      const wz = this.z + this.fz * m.u + this.rz * m.v;
      m.place(wx, m.y + this.heave + m.u * Math.tan(this.pitch) - m.v * Math.tan(this.roll), wz, h);
    }
  }

  /** The airfield record follows the landing area. */
  private placeField(): void {
    const f = this.f;
    const L = this.layout;
    const a = -LANDING_AREA.angleDeg * DEG;
    const du = Math.cos(a), dv = Math.sin(a);
    const cu = L.rampU + du * (LANDING_AREA.length / 2);
    const cv = L.rampV + dv * (LANDING_AREA.length / 2);
    f.x = this.x + this.fx * cu + this.rx * cv;
    f.z = this.z + this.fz * cu + this.rz * cv;
    f.heading = (this.heading - LANDING_AREA.angleDeg + 360) % 360;
    const hr = f.heading * DEG;
    f.ax = Math.sin(hr);
    f.az = -Math.cos(hr);
    f.rxv = -f.az;
    f.rzv = f.ax;
    f.elev = this.deckY(cu, cv);
  }

  /** World (x, z) to ship-local (u toward the bow, v to starboard). */
  toLocal(x: number, z: number, out: { u: number; v: number }): { u: number; v: number } {
    const dx = x - this.x, dz = z - this.z;
    out.u = dx * this.fx + dz * this.fz;
    out.v = dx * this.rx + dz * this.rz;
    return out;
  }

  /** Ship-local (u, v) to world (x, z). */
  toWorld(u: number, v: number, out: { x: number; z: number }): { x: number; z: number } {
    out.x = this.x + this.fx * u + this.rx * v;
    out.z = this.z + this.fz * u + this.rz * v;
    return out;
  }

  /** Deck height at (u, v) at mission time t (the swell is predictable: it is a sum of waves). */
  deckYAt(u: number, v: number, t: number): number {
    const hv = wave(HEAVE, t, this.seed).v;
    const pv = wave(PITCH, t, this.seed + 3.1).v;
    const rv = wave(ROLL, t, this.seed + 7.7).v - this.spec.dir * 1.1 * DEG;
    return DECK_HEIGHT + hv + u * Math.tan(pv) - v * Math.tan(rv);
  }

  /** Deck height above the water at (u, v), riding the swell. */
  deckY(u: number, v: number): number {
    return DECK_HEIGHT + this.heave + u * Math.tan(this.pitch) - v * Math.tan(this.roll);
  }

  /** Velocity of the deck at (u, v): the ship's speed, its turn and the deck's heave, pitch and roll. */
  deckVel(u: number, v: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const w = this.yawRate;
    out.x = this.vx + w * (u * this.rx - v * this.fx);
    out.z = this.vz + w * (u * this.rz - v * this.fz);
    out.y = this.heaveRate + u * this.pitchRate - v * this.rollRate;
    return out;
  }

  /** Is (u, v) on the flight deck? */
  inDeck(u: number, v: number): boolean {
    const P = this.layout.deck;
    let inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const [ui, vi] = P[i];
      const [uj, vj] = P[j];
      if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
    }
    return inside;
  }

  /** Is (u, v) inside the island's footprint? */
  onIsland(u: number, v: number): boolean {
    const [u0, u1, v0, v1] = this.layout.island;
    return u > u0 && u < u1 && v > v0 && v < v1;
  }

  /** Landing-axis coordinates of a ship-local point: s along from the ramp, lateral to starboard. */
  landingAxis(u: number, v: number): { s: number; lat: number } {
    const a = -LANDING_AREA.angleDeg * DEG;
    const du = u - this.layout.rampU, dv = v - this.layout.rampV;
    return { s: du * Math.cos(a) + dv * Math.sin(a), lat: -du * Math.sin(a) + dv * Math.cos(a) };
  }

  /**
   * Glide path from an eye at (x, y, z): how far above (+) or below the
   * 3.5 deg path to the target wire it is (deg, for a hook ~4 m below the
   * eye), the range to the touchdown point (m), the lateral offset from the
   * landing centreline (m, + = right of it) and whether the eye is behind
   * the ship in the approach sector.
   */
  glidePath(x: number, y: number, z: number): { dev: number; range: number; lat: number; inSector: boolean } {
    const L = this.toLocal(x, z, _gl);
    const ax = this.landingAxis(L.u, L.v);
    const aim = this.f.aimPoint ?? 72;
    const back = aim - ax.s;
    const a = -LANDING_AREA.angleDeg * DEG;
    const au = this.layout.rampU + Math.cos(a) * aim, av = this.layout.rampV + Math.sin(a) * aim;
    const hgt = y - 4 - this.deckY(au, av);
    const ang = Math.atan2(hgt, Math.max(1, back)) / DEG;
    return { dev: ang - (this.f.gsDeg ?? 3.5), range: Math.hypot(back, ax.lat), lat: ax.lat, inSector: back > 0 && Math.abs(ax.lat) < back * 0.5 + 60 };
  }

  /** Where the ship's centre was (or will be) at mission time t, and its heading (rad). */
  pathAt(t: number, out: { x: number; z: number; h: number }): { x: number; z: number; h: number } {
    const s = this.spec;
    const th = s.phase + (s.speed / s.radius) * s.dir * t;
    out.x = s.cx + s.radius * Math.sin(th);
    out.z = s.cz - s.radius * Math.cos(th);
    out.h = th + (s.dir * Math.PI) / 2;
    return out;
  }

  /** A catapult's heading (deg true). */
  catHeading(i: number): number {
    return (this.heading + this.layout.cats[i].off + 360) % 360;
  }

  /** The first free catapult (bow catapults first), or -1. */
  freeCat(): number {
    for (let i = 0; i < this.catBusy.length; i++) if (!this.catBusy[i]) return i;
    return -1;
  }
}

/** The active map's carriers (none on the maps with land). */
export const CARRIERS: Carrier[] = [];
const BY_FIELD = new Map<AirfieldDef, Carrier>();

/** Rebuild the carriers for the active map (map change). */
export function refreshCarriers(): void {
  CARRIERS.length = 0;
  BY_FIELD.clear();
  nextSeed = 1;
  for (const f of AIRFIELDS) {
    if (!f.carrier) continue;
    const c = new Carrier(f);
    c.update(0);
    CARRIERS.push(c);
    BY_FIELD.set(f, c);
  }
}

export function carrierOf(f: AirfieldDef | null | undefined): Carrier | undefined {
  return f ? BY_FIELD.get(f) : undefined;
}

/** A new mission: every catapult is free again. */
export function clearCatapults(): void {
  for (const c of CARRIERS) {
    c.catBusy.fill(null);
    c.catFired.fill(-99);
  }
}

/** Move every carrier to mission time t. */
export function updateCarriers(t: number): void {
  for (let i = 0; i < CARRIERS.length; i++) CARRIERS[i].update(t);
}

const _loc = { u: 0, v: 0 };

/** The carrier whose deck is under (x, z), with the ship-local point; null over open water. */
export function deckAt(x: number, z: number): { c: Carrier; u: number; v: number } | null {
  for (let i = 0; i < CARRIERS.length; i++) {
    const c = CARRIERS[i];
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz > 190 * 190) continue;
    c.toLocal(x, z, _loc);
    if (c.inDeck(_loc.u, _loc.v)) return { c, u: _loc.u, v: _loc.v };
  }
  return null;
}

/** The nearest carrier to (x, z) and its distance (m). */
export function nearestCarrier(x: number, z: number): { c: Carrier; d: number } | null {
  let best: Carrier | null = null, bd = Infinity;
  for (const c of CARRIERS) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best ? { c: best, d: bd } : null;
}
