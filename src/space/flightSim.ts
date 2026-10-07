// The Saturn V flight simulation: real-scale rigid-body flight over a rotating
// Earth. The vehicle is a stack of parts that drop away one by one; each stage
// carries its real propellant and engines (F-1s and J-2s) whose thrust follows
// the outside air pressure. Steering is by engine gimbal (and the S-IVB's
// auxiliary propulsion when coasting), limited by the vehicle's real mass,
// moment of inertia and lever arms, so the full stack turns slowly and an upper
// stage nimbly. Aerodynamic loads are tracked against the structure's q·alpha
// limit. The Instrument Unit can fly the ascent itself, as it did on every
// Apollo flight: roll program, pitch over into a gravity turn, then closed-loop
// guidance to a 185 km parking orbit. The command module can separate and come
// home under its heat shield and parachutes, or be pulled off the rocket by the
// launch escape tower.

import {
  EARTH, G0, V3, add, addScaled, air, airVelocity, cross, dot, ecefDir, enu, len, norm, orbitOf, rotY, scale, sub, toEcef, earthAngle,
  PAD, descendingAnomaly, timeBetween, continent, Orbit, padScene, MOON, MOON_ORBIT, Body, moonState, moonPos, moonSpinVel, gravityAt,
  toMoonFixed, fromMoonFixed, moonAxes, moonHeight,
} from './universe';

// ------------------------------------------------------------ quaternions [w, x, y, z]
export type Q = [number, number, number, number];
export const qmul = (a: Q, b: Q): Q => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
export const qconj = (a: Q): Q => [a[0], -a[1], -a[2], -a[3]];
export function qrot(q: Q, v: V3): V3 {
  const t = qmul(qmul(q, [0, v[0], v[1], v[2]]), qconj(q));
  return [t[1], t[2], t[3]];
}
export function qnorm(q: Q): Q {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
/** the rotation whose columns are the given body axes (orthonormal) */
export function qFromAxes(x: V3, y: V3, z: V3): Q {
  const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  let w, qx, qy, qz;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  return qnorm([w, qx, qy, qz]);
}
function qAxisAngle(axis: V3, ang: number): Q {
  const s = Math.sin(ang / 2);
  return [Math.cos(ang / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

// ------------------------------------------------------------ the vehicle's parts
export type PartId = 'sic' | 'siiInter' | 'sii' | 'sivb' | 'sla' | 'lm' | 'sm' | 'cm' | 'les';
export const PART_ORDER: PartId[] = ['sic', 'siiInter', 'sii', 'sivb', 'sla', 'lm', 'sm', 'cm', 'les'];
/**
 * How the parts sit: the launch stack; the command and service module docked
 * nose to nose with the lunar module (after transposition and docking, with the
 * LM turned round above the CM); or the lunar module flying alone.
 */
export type Layout = 'stack' | 'docked' | 'lm';
/** docked, the LM is turned end for end about this height: its hatch meets the CM's nose */
export const DOCK_C = 192.5;

export interface PartDef {
  name: string;
  dry: number;
  prop: number;
  /** span along the body (model y, metres above the base of the S-IC) */
  y0: number;
  y1: number;
  /** centres of mass: structure and propellant */
  yDry: number;
  yProp: number;
  radius: number;
  /** drag area and coefficient when falling free */
  area: number;
}
export const PARTS: Record<PartId, PartDef> = {
  sic: { name: 'S-IC', dry: 135_000, prop: 2_082_285, y0: -5.8, y1: 42, yDry: 16, yProp: 24, radius: 5.03, area: 80 },
  siiInter: { name: 'S-II interstage', dry: 4_800, prop: 0, y0: 42, y1: 47.6, yDry: 44.8, yProp: 44.8, radius: 5.03, area: 80 },
  sii: { name: 'S-II', dry: 36_200, prop: 439_000, y0: 44.2, y1: 72, yDry: 57, yProp: 57, radius: 5.03, area: 80 },
  sivb: { name: 'S-IVB + IU', dry: 13_300, prop: 108_000, y0: 68.6, y1: 85.6, yDry: 77, yProp: 78, radius: 3.3, area: 34 },
  sla: { name: 'Lunar module adapter', dry: 1_800, prop: 0, y0: 85.6, y1: 94.1, yDry: 89, yProp: 89, radius: 3.3, area: 34 },
  lm: { name: 'Lunar module', dry: 6_800, prop: 8_200, y0: 84.4, y1: 91.0, yDry: 88.6, yProp: 86.8, radius: 2.1, area: 20 },
  sm: { name: 'Service module', dry: 6_100, prop: 18_400, y0: 91.4, y1: 98.3, yDry: 96, yProp: 96, radius: 1.96, area: 12 },
  cm: { name: 'Command module', dry: 5_560, prop: 0, y0: 98.3, y1: 101.5, yDry: 99.4, yProp: 99.4, radius: 1.96, area: 12 },
  les: { name: 'Launch escape tower', dry: 4_170, prop: 0, y0: 101.5, y1: 110.6, yDry: 105.5, yProp: 105.5, radius: 0.5, area: 1 },
};

export type EngineKind = 'F-1' | 'J-2' | 'SPS' | 'DPS';
export type StageId = 'sic' | 'sii' | 'sivb' | 'sm' | 'lm';
export interface EngineSet {
  part: PartId;
  kind: EngineKind;
  /** positions round the axis: [x, z] in the body frame */
  at: [number, number][];
  /** which of them gimbal (the centre engines are fixed) */
  gimbals: boolean[];
  yGimbal: number;
  /** nozzle exit plane height, for the plume */
  yExit: number;
  thrustVac: number;
  thrustSL: number;
  mdot: number;
  gimbalMax: number;
  spoolUp: number;
}
const diag = (r: number): [number, number][] => [0, 1, 2, 3].map((k) => [r * Math.sin(Math.PI / 4 + (k * Math.PI) / 2), r * Math.cos(Math.PI / 4 + (k * Math.PI) / 2)] as [number, number]);
export const ENGINES: Record<StageId, EngineSet> = {
  sic: { part: 'sic', kind: 'F-1', at: [[0, 0], ...diag(3.9)], gimbals: [false, true, true, true, true], yGimbal: -1.0, yExit: -5.8, thrustVac: 38_257_000 / 5, thrustSL: 34_500_000 / 5, mdot: 2578, gimbalMax: (5.17 * Math.PI) / 180, spoolUp: 1.4 },
  sii: { part: 'sii', kind: 'J-2', at: [[0, 0], ...diag(2.7)], gimbals: [false, true, true, true, true], yGimbal: 46.9, yExit: 44.2, thrustVac: 5_165_000 / 5, thrustSL: 486_000, mdot: 250.2, gimbalMax: (7 * Math.PI) / 180, spoolUp: 2.4 },
  sivb: { part: 'sivb', kind: 'J-2', at: [[0, 0]], gimbals: [true], yGimbal: 71.4, yExit: 68.6, thrustVac: 1_033_000, thrustSL: 486_000, mdot: 250.2, gimbalMax: (7 * Math.PI) / 180, spoolUp: 2.4 },
  // the service module's Service Propulsion System and the lunar module's throttleable descent engine
  sm: { part: 'sm', kind: 'SPS', at: [[0, 0]], gimbals: [true], yGimbal: 94.0, yExit: 91.4, thrustVac: 91_190, thrustSL: 45_000, mdot: 29.6, gimbalMax: (6 * Math.PI) / 180, spoolUp: 0.4 },
  lm: { part: 'lm', kind: 'DPS', at: [[0, 0]], gimbals: [true], yGimbal: 87.2, yExit: 86.0, thrustVac: 45_040, thrustSL: 30_000, mdot: 14.77, gimbalMax: (6 * Math.PI) / 180, spoolUp: 0.6 },
};

export type SasMode = 'off' | 'stab' | 'hold' | 'pro' | 'retro' | 'normal' | 'anti' | 'radOut' | 'radIn' | 'aim';
export type Status = 'pad' | 'ascent' | 'suborbital' | 'falling' | 'orbit' | 'transit' | 'safe' | 'landed' | 'lost';
export type Chute = 'none' | 'drogue' | 'main';

export interface FlightEvent {
  t: number;
  text: string;
  kind: 'info' | 'stage' | 'warn' | 'good' | 'bad';
}

export interface Debris {
  parts: PartId[];
  r: V3;
  v: V3;
  q: Q;
  w: V3;
  /** CoM height in the model frame (to place its meshes) */
  ycg: number;
  t: number;
  /** retro / jettison motor burning (seconds left) and its push */
  burn: number;
  push: number;
  gone: boolean;
  /** left standing on the pad (Earth-fixed position of its centre of mass) */
  fixed?: V3;
}

export interface Engine {
  on: boolean;
  level: number;
}

export interface Controls {
  pitch: number;
  yaw: number;
  roll: number;
}

const R_E = EARTH.R;
const ROCKET_BASE = 24.5; // the base of the S-IC sits this high on the mount
const QA_LIMIT = 170_000; // Pa·deg the structure takes
const TARGET_ALT = 185_000;
const AZIMUTH = (72 * Math.PI) / 180; // launch azimuth, from north toward east

export type SpawnMode = 'pad' | 'orbit' | 'lunar';
export interface SpawnOpts {
  mode: SpawnMode;
}
const RX_PI: Q = [0, 1, 0, 0];

export class FlightSim {
  // ---- state: centre of mass position and velocity (ECI), attitude body->ECI, body rates
  r: V3 = [0, 0, 0];
  v: V3 = [0, 0, 0];
  q: Q = [1, 0, 0, 0];
  w: V3 = [0, 0, 0];
  /** mission elapsed time (negative during the count) and sim time for Earth's spin */
  met = -20;
  time = 0;
  attached = new Set<PartId>();
  prop: Record<PartId, number> = { sic: 0, siiInter: 0, sii: 0, sivb: 0, sla: 0, lm: 0, sm: 0, cm: 0, les: 0 };
  layout: Layout = 'stack';
  /** the active stage's engines */
  stage: StageId | null = 'sic';
  /** the descent engine's throttle (10 to 100%) */
  throttle = 1;
  /** the direction the 'aim' attitude mode points the vehicle's nose (thrust axis) */
  aim: V3 | null = null;
  /** the lunar module's landing legs are out */
  legsOut = false;
  /** where the lander rests on the Moon (Moon-fixed), once down */
  private moonRest: { p: V3; q: Q } | null = null;
  /** where the lander rests on the Moon (Moon-fixed position of its centre of mass), once down */
  get restFixed(): V3 | null {
    return this.moonRest ? this.moonRest.p : null;
  }
  engines: Engine[] = [];
  sivbStarts = 0;
  held = true;
  counting = false;
  guidance = true;
  sas: SasMode = 'stab';
  autoStage = true;
  /** easy flying: the S-IVB's J-2 can be restarted as often as you like */
  unlimitedRestarts = false;
  /** the closest pass to the Moon the trajectory planner predicts (the Moon-only conic is wrong while Earth still pulls) */
  passPlan: { alt: number; t: number } | null = null;
  private ignitionLogged = false;
  /** called after every physics substep, so an autopilot can cut an engine at the exact moment */
  stepHook: ((h: number) => void) | null = null;
  input: Controls = { pitch: 0, yaw: 0, roll: 0 };
  chute: Chute = 'none';
  chuteLevel = 0;
  lesBurn = 0;
  aborted = false;
  private abortDir: V3 | null = null;
  events: FlightEvent[] = [];
  debris: Debris[] = [];
  outcome: { status: Status; title: string; text: string } | null = null;
  // ---- derived each step
  mass = 0;
  ycg = 0;
  Itr = 1;
  Iroll = 1;
  thrust = 0;
  accel: V3 = [0, 0, 0];
  gLoad = 1;
  qDyn = 0;
  mach = 0;
  alpha = 0;
  qAlpha = 0;
  heat = 0;
  gimbal: [number, number] = [0, 0];
  stats = { maxQ: 0, maxG: 0, maxAlt: 0, maxV: 0, maxQAt: 0 };
  /** timed events still to come */
  private timeline: { t: number; fn: () => void }[] = [];
  private holdQ: Q | null = null;
  private maxQPassed = false;
  private machPassed = false;
  private towerCleared = false;
  private orbitAnnounced = false;
  private stagingBusy = false;
  private padQ: Q = [1, 0, 0, 0];
  private cutoffCommanded = false;
  private lastAccel: V3 = [0, 0, 0];

  constructor(opts: SpawnOpts) {
    if (opts.mode === 'pad') this.spawnPad();
    else if (opts.mode === 'orbit') this.spawnOrbit();
    else this.spawnLunar();
  }

  // ------------------------------------------------------------ spawning
  private spawnPad(): void {
    for (const p of PART_ORDER) this.attached.add(p);
    for (const p of PART_ORDER) this.prop[p] = PARTS[p].prop;
    this.stage = 'sic';
    this.engines = ENGINES.sic.at.map(() => ({ on: false, level: 0 }));
    this.sivbStarts = 3;
    this.held = true;
    this.met = -20;
    this.guidance = true;
    this.sas = 'stab';
    // body axes as the rocket stands in the launch-site scene: +X south, +Y up, +Z west
    const ps = padScene();
    this.padQ = qFromAxes(ps.x, ps.y, ps.z);
    this.massProps();
    this.placeOnPad();
    this.log('Saturn V on Pad 1. Count holding at T-20 s. Press SPACE to resume the count.', 'info');
  }

  private spawnOrbit(): void {
    for (const p of ['sivb', 'sla', 'lm', 'sm', 'cm'] as PartId[]) this.attached.add(p);
    for (const p of ['lm', 'sm'] as PartId[]) this.prop[p] = PARTS[p].prop;
    this.prop.sivb = 74_000;
    this.stage = 'sivb';
    this.engines = [{ on: false, level: 0 }];
    this.sivbStarts = 2;
    this.held = false;
    this.met = 11 * 60 + 49;
    this.guidance = false;
    this.sas = 'pro';
    // a 185 km circular parking orbit in the Moon's plane (as the launch puts it), over the day side
    const rr = R_E + TARGET_ALT;
    const N = MOON_ORBIT.N;
    const sd = sunDirection();
    const sunIn = norm(sub(sd, scale(N, dot(sd, N))));
    const pos = norm(add(scale(sunIn, Math.cos(-0.55)), scale(cross(N, sunIn), Math.sin(-0.55))));
    const vdir = norm(cross(N, pos));
    const vc = Math.sqrt(EARTH.GM / rr);
    this.massProps();
    this.r = scale(pos, rr);
    this.v = scale(vdir, vc);
    // heads down, nose along the flight path
    const up = norm(this.r);
    const x = norm(cross(vdir, up));
    this.q = qFromAxes(x, vdir, norm(cross(x, vdir)));
    this.time = 0;
    this.log('In a 185 km parking orbit. The S-IVB has propellant for about 300 s of burning and two restarts.', 'good');
    this.orbitAnnounced = true;
    this.towerCleared = this.machPassed = this.maxQPassed = true;
  }

  /** the command and service module docked to the lunar module, in a 110 km orbit round the Moon */
  private spawnLunar(): void {
    for (const p of ['lm', 'sm', 'cm'] as PartId[]) this.attached.add(p);
    this.prop.lm = PARTS.lm.prop;
    this.prop.sm = 9_000;
    this.layout = 'docked';
    this.stage = 'sm';
    this.engines = [{ on: false, level: 0 }];
    this.held = false;
    this.guidance = false;
    this.sas = 'pro';
    this.legsOut = true;
    this.time = 3.3 * 86400;
    this.met = this.time;
    this.massProps();
    const m = moonState(this.time);
    const N = MOON_ORBIT.N;
    const rr = MOON.R + 110_000;
    // start on the day side
    const sd = sunDirection();
    const sunIn = norm(sub(sd, scale(N, dot(sd, N))));
    const pos = norm(add(scale(sunIn, Math.cos(-1.2)), scale(cross(N, sunIn), Math.sin(-1.2))));
    const vdir = norm(cross(N, pos));
    this.r = add(m.r, scale(pos, rr));
    this.v = add(m.v, scale(vdir, Math.sqrt(MOON.GM / rr)));
    const x = norm(cross(vdir, pos));
    this.q = qFromAxes(x, vdir, norm(cross(x, vdir)));
    this.towerCleared = this.machPassed = this.maxQPassed = true;
    this.orbitAnnounced = true;
    this.log('In lunar orbit, 110 km up: the command and service module docked to the lunar module.', 'good');
  }

  private placeOnPad(): void {
    const P = ecefDir(PAD.lat, PAD.lon);
    const baseEcef = scale(P, R_E + ROCKET_BASE);
    const ang = earthAngle(this.time);
    const qe: Q = qAxisAngle([0, 1, 0], ang);
    this.q = qnorm(qmul(qe, this.padQ));
    const base = rotY(baseEcef, ang);
    this.r = add(base, qrot(this.q, [0, this.ycg, 0]));
    this.v = airVelocity(this.r);
    this.w = [0, 0, 0];
  }

  // ------------------------------------------------------------ queries
  /** height above Earth's mean radius (the air, the pad, re-entry) */
  get alt(): number {
    return len(this.r) - R_E;
  }
  /** a part's span and centres of mass as the parts sit now */
  py(p: PartId): PartDef {
    const d = PARTS[p];
    if (p !== 'lm' || this.layout !== 'docked') return d;
    return { ...d, y0: DOCK_C - d.y1, y1: DOCK_C - d.y0, yDry: DOCK_C - d.yDry, yProp: DOCK_C - d.yProp };
  }
  /** inside the Moon's sphere of influence: its gravity rules, and positions are measured from it */
  get nearMoon(): boolean {
    return len(sub(this.r, moonPos(this.time))) < MOON.soi;
  }
  get body(): Body {
    return this.nearMoon ? MOON : EARTH;
  }
  /** position and velocity relative to the body we are near */
  get rel(): V3 {
    return this.nearMoon ? sub(this.r, moonPos(this.time)) : this.r;
  }
  get vRel(): V3 {
    return this.nearMoon ? sub(this.v, moonState(this.time).v) : this.v;
  }
  /** height above the body's mean radius */
  get altB(): number {
    return len(this.rel) - this.body.R;
  }
  /** height of the lunar ground (above the mean radius) under a Moon-relative position */
  groundAt(rel: V3): number {
    return moonHeight(toMoonFixed(norm(rel), this.time));
  }
  /** height of the lowest point of the vehicle above the ground (or the sea) */
  get lowAlt(): number {
    let y0 = Infinity;
    for (const p of this.attached) y0 = Math.min(y0, this.py(p).y0);
    const low = add(this.r, qrot(this.q, [0, y0 - this.ycg, 0]));
    if (!this.nearMoon) return len(low) - R_E;
    const rel = sub(low, moonPos(this.time));
    const rl = len(rel);
    return rl - MOON.R - (rl - MOON.R < 30_000 ? this.groundAt(rel) : 0);
  }
  get up(): V3 {
    return norm(this.rel);
  }
  get forward(): V3 {
    return qrot(this.q, [0, 1, 0]);
  }
  /** velocity over the ground (the air near Earth, the turning surface near the Moon) */
  get vSurf(): V3 {
    if (!this.nearMoon) return sub(this.v, airVelocity(this.r));
    return sub(this.vRel, moonSpinVel(this.rel));
  }
  get vVert(): number {
    return dot(this.vRel, this.up);
  }
  /** the orbit round Earth */
  get orbit(): Orbit {
    return orbitOf(this.r, this.v);
  }
  /** the orbit round whichever body we are near (positions relative to it) */
  get orb(): Orbit {
    return this.nearMoon ? orbitOf(this.rel, this.vRel, MOON.GM) : this.orbit;
  }
  /** model-frame position of the vehicle's origin (base of S-IC) in ECI */
  get origin(): V3 {
    return sub(this.r, qrot(this.q, [0, this.ycg, 0]));
  }
  get isCm(): boolean {
    return this.attached.has('cm') && !this.attached.has('sm');
  }
  get isLm(): boolean {
    return this.layout === 'lm';
  }
  get canAbort(): boolean {
    return this.attached.has('les') && !this.isCm && !this.outcome;
  }
  get canCmSep(): boolean {
    return !this.attached.has('les') && this.attached.has('sm') && this.attached.has('cm') && this.layout === 'stack' && !this.nearMoon && !this.held && !this.outcome;
  }

  status(): Status {
    if (this.outcome) return this.outcome.status;
    if (this.held) return 'pad';
    if (this.nearMoon) {
      const om = this.orb;
      if (om.energy >= 0) return this.thrust > 0 ? 'ascent' : 'transit';
      if (om.rp > MOON.R + 4_000) return 'orbit';
      if (this.thrust > 0) return 'ascent';
      return this.vVert > 0 ? 'suborbital' : 'falling';
    }
    const o = this.orbit;
    // on the way out toward the Moon's distance
    if (o.e < 1 && o.ra > 250_000_000 && o.ra < EARTH.soi && o.rp > R_E + EARTH.atmosphereTop) return 'transit';
    // free of Earth: on an escape path, or on an orbit that reaches past Earth's sphere of influence
    if (o.energy >= 0 || o.ra > EARTH.soi || len(this.r) > EARTH.soi) return 'safe';
    if (o.rp > R_E + EARTH.atmosphereTop) return 'orbit';
    if (this.thrust > 0) return 'ascent';
    if (this.vVert > 0) return 'suborbital';
    return 'falling';
  }

  /** seconds until the trajectory meets the ground (vacuum estimate), or NaN */
  timeToImpact(): number {
    if (this.nearMoon) {
      const om = this.orb;
      if (om.energy >= 0 || om.rp > MOON.R) return NaN;
      if (this.lowAlt < 20_000) {
        const vv = this.vVert, g = MOON.GM / len(this.rel) ** 2;
        return (vv + Math.sqrt(vv * vv + 2 * g * Math.max(0, this.lowAlt))) / g;
      }
      return timeBetween(om, om.nu, descendingAnomaly(om, MOON.R), MOON.GM);
    }
    const o = this.orbit;
    if (o.energy >= 0 || o.rp > R_E) return NaN;
    if (this.alt < 40_000) {
      const vv = this.vVert;
      const g = EARTH.GM / (len(this.r) ** 2);
      return (vv + Math.sqrt(vv * vv + 2 * g * Math.max(0, this.lowAlt))) / g;
    }
    const nuI = descendingAnomaly(o, R_E);
    return timeBetween(o, o.nu, nuI);
  }
  timeToEntry(): number {
    const o = this.orbit;
    if (this.nearMoon || this.alt < 122_000 || o.energy >= 0 || o.rp > R_E + 122_000) return NaN;
    return timeBetween(o, o.nu, descendingAnomaly(o, R_E + 122_000));
  }

  /** remaining delta-v of the active stage and of the whole vehicle (vacuum) */
  deltaV(): { stage: number; total: number; burn: number } {
    let m = this.mass;
    let total = 0, stageDv = 0, burn = 0;
    if (this.stage === 'sm' || this.stage === 'lm') {
      // the spacecraft: the service module's engine with the lander aboard, then the lander's own
      const st = this.stage;
      const E = ENGINES[st];
      const isp = E.thrustVac / E.mdot;
      stageDv = isp * Math.log(m / Math.max(1, m - this.prop[st]));
      burn = this.prop[st] / E.mdot;
      total = stageDv;
      if (st === 'sm' && this.attached.has('lm')) {
        const ml = PARTS.lm.dry + this.prop.lm;
        total += (ENGINES.lm.thrustVac / ENGINES.lm.mdot) * Math.log(ml / PARTS.lm.dry);
      }
      return { stage: stageDv, total, burn };
    }
    for (const s of ['sic', 'sii', 'sivb'] as const) {
      if (!this.attached.has(s)) continue;
      const E = ENGINES[s];
      const isp = E.thrustVac / E.mdot;
      const mp = this.prop[s];
      const dv = isp * Math.log(m / Math.max(1, m - mp));
      total += dv;
      if (s === this.stage) {
        stageDv = dv;
        const on = this.engines.filter((e) => e.on).length || E.at.length;
        burn = mp / (E.mdot * on);
      }
      m -= mp + PARTS[s].dry + (s === 'sii' && this.attached.has('siiInter') ? PARTS.siiInter.dry : 0);
    }
    return { stage: stageDv, total, burn };
  }

  log(text: string, kind: FlightEvent['kind'] = 'info'): void {
    this.events.push({ t: this.met, text, kind });
    if (this.events.length > 80) this.events.shift();
  }
  private at(dt: number, fn: () => void): void {
    this.timeline.push({ t: this.met + dt, fn });
  }

  // ------------------------------------------------------------ mass properties
  massProps(): void {
    let m = 0, my = 0;
    for (const p of this.attached) {
      const d = this.py(p);
      m += d.dry + this.prop[p];
      my += d.dry * d.yDry + this.prop[p] * d.yProp;
    }
    this.mass = Math.max(1, m);
    this.ycg = my / this.mass;
    let I = 0, Ir = 0;
    for (const p of this.attached) {
      const d = this.py(p);
      const mm = d.dry + this.prop[p];
      const yc = (d.dry * d.yDry + this.prop[p] * d.yProp) / Math.max(1, mm);
      const L = d.y1 - d.y0;
      I += mm * ((yc - this.ycg) ** 2 + (L * L) / 12 + (d.radius * d.radius) / 4);
      Ir += (mm * d.radius * d.radius) / 2;
    }
    this.Itr = Math.max(1, I);
    this.Iroll = Math.max(1, Ir);
  }

  /** move the reference so the vehicle's parts stay put when the centre of mass shifts */
  private recentre(oldY: number): void {
    this.r = add(this.r, qrot(this.q, [0, this.ycg - oldY, 0]));
  }

  // ------------------------------------------------------------ commands
  /** SPACE: resume the count on the pad, or stage in flight */
  stageNext(): void {
    if (this.outcome) return;
    if (this.held) {
      if (!this.counting) {
        this.counting = true;
        this.cutoffCommanded = false;
        if (this.met < -10) this.met = -10;
        this.log('Count resumed. Ignition sequence starts at T-8.9 s.', 'info');
      }
      return;
    }
    if (this.stagingBusy) return;
    if (this.stage === 'sic' && this.attached.has('sic')) this.separateSic();
    else if (this.stage === 'sii' && this.attached.has('sii')) this.separateSii();
    else if (this.canCmSep) this.cmSep();
  }

  ignite(): void {
    if (this.held) return this.stageNext();
    if (this.outcome || !this.stage) return;
    if (this.stage === 'sm' || this.stage === 'lm') {
      if (this.engines[0].on) return;
      if (this.prop[this.stage] <= 0) return this.log(`${ENGINES[this.stage].kind} is out of propellant.`, 'warn');
      this.cutoffCommanded = false;
      this.engines[0].on = true;
      this.log(this.stage === 'sm' ? 'Service propulsion system ignition.' : 'Descent engine ignition.', 'stage');
      return;
    }
    if (this.stage === 'sivb') {
      if (this.engines[0].on) return;
      if (this.prop.sivb <= 0) return this.log('S-IVB is out of propellant.', 'warn');
      if (this.sivbStarts <= 0 && !this.unlimitedRestarts) return this.log('No J-2 restarts left: the helium for the restart is used up.', 'warn');
      if (!this.unlimitedRestarts) this.sivbStarts--;
      this.cutoffCommanded = false;
      this.log('S-IVB APS ullage burn: settling the propellant.', 'info');
      this.at(3, () => {
        if (this.stage !== 'sivb' || !this.attached.has('sivb')) return;
        this.engines[0].on = true;
        this.log('S-IVB J-2 ignition.', 'stage');
      });
      return;
    }
    this.log(`The ${ENGINES[this.stage].kind}s cannot be restarted in flight. Only the S-IVB's J-2 can.`, 'warn');
  }

  cutoff(): void {
    if (this.outcome || !this.stage) return;
    const any = this.engines.some((e) => e.on);
    for (const e of this.engines) e.on = false;
    this.cutoffCommanded = true;
    if (this.held && this.met < 0) {
      this.counting = false;
      this.ignitionLogged = false;
      this.timeline = [];
      this.met = Math.min(this.met, -20);
      if (any) this.log('Pad shutdown: engines cut on the hold-down arms. Count recycled to T-20 s.', 'warn');
      return;
    }
    if (any) this.log(`${ENGINES[this.stage].kind} cutoff.`, 'info');
  }

  setGuidance(on: boolean): void {
    this.guidance = on;
    this.holdQ = null;
    this.log(on ? 'IU guidance engaged.' : 'IU guidance off: manual control.', 'info');
    if (!on && this.sas === 'off') this.sas = 'stab';
  }

  setSas(m: SasMode): void {
    this.sas = m;
    this.holdQ = m === 'hold' ? this.q : null;
    if (this.guidance && m !== 'stab') {
      this.guidance = false;
      this.log('IU guidance off: manual attitude mode.', 'info');
    }
  }

  abort(): void {
    if (!this.canAbort) return;
    if (this.held && !this.engines.some((e) => e.on) && this.met < -9) return;
    this.aborted = true;
    this.log('ABORT. Launch escape motor firing: the command module pulls clear.', 'bad');
    const rest = [...this.attached].filter((p) => p !== 'cm' && p !== 'les');
    for (const e of this.engines) e.on = false;
    const onPad = this.held;
    this.splitOff(rest, -2, 0, 0);
    if (onPad) {
      const d = this.debris[this.debris.length - 1];
      d.fixed = toEcef(d.r, this.time);
      d.w = [0, 0, 0];
    }
    this.stage = null;
    this.engines = [];
    this.held = false;
    this.lesBurn = 3.2;
    // the pitch-control motor and canards steer the command module out over the sea
    const up = this.up;
    const east = norm(rotY(enu(PAD.lat, PAD.lon).E, earthAngle(this.time)));
    const sea = norm(sub(east, scale(up, dot(east, up))));
    const fwd = this.forward;
    this.abortDir = norm(add(fwd, scale(norm(sub(sea, scale(fwd, dot(sea, fwd)))), Math.tan((this.alt < 1500 ? 30 : this.alt < 6000 ? 14 : 4) * (Math.PI / 180)))));
    // the pitch-control motor's kick: the capsule tilts over at once
    const axis = cross(fwd, this.abortDir);
    const sa = len(axis);
    if (sa > 1e-6) this.q = qnorm(qmul(qAxisAngle(scale(axis, 1 / sa), Math.asin(Math.min(1, sa))), this.q));
    this.w = [0, 0, 0];
    this.guidance = false;
    this.sas = 'stab';
    this.at(14, () => {
      if (this.attached.has('les')) this.jettisonLes();
    });
  }

  cmSep(): void {
    if (!this.canCmSep) return;
    const rest = [...this.attached].filter((p) => p !== 'cm');
    for (const e of this.engines) e.on = false;
    this.splitOff(rest, -1.5, 0, 0);
    this.stage = null;
    this.engines = [];
    this.guidance = false;
    this.sas = 'retro';
    this.log('CM separation: the command module is on its own, heat shield first for entry.', 'stage');
  }

  /** turn the vehicle frame end for end about height c: the part that was flipped becomes the reference */
  private reframe(c: number, layout: Layout): void {
    const o = this.origin;
    const q0 = this.q;
    this.q = qnorm(qmul(q0, RX_PI));
    this.w = [this.w[0], -this.w[1], -this.w[2]];
    const no = add(o, qrot(q0, [0, c, 0]));
    this.layout = layout;
    this.massProps();
    this.r = add(no, qrot(this.q, [0, this.ycg, 0]));
  }

  /**
   * Transposition, docking and extraction are done (the screen animates them):
   * the S-IVB drifts away with the adapter's panels gone, and the command and
   * service module flies on with the lunar module on its nose. `pulled` is how
   * far the docked pair backed away from the S-IVB along the old axis.
   */
  dock(pulled: number): void {
    if (this.layout !== 'stack' || !this.attached.has('lm')) return;
    for (const e of this.engines) e.on = false;
    this.attached.delete('sla');
    this.massProps();
    this.splitOff(['sivb'], 0, 0, 0);
    // the S-IVB is left behind where it was; the pair moves on
    this.reframe(DOCK_C + pulled, 'docked');
    this.stage = 'sm';
    this.engines = [{ on: false, level: 0 }];
    this.guidance = false;
    this.sas = 'stab';
    this.holdQ = null;
    this.log('Docked: the command module has the lunar module on its nose. The S-IVB is cast off.', 'stage');
  }

  /** the lunar module undocks and flies on its own; the command module stays up in orbit */
  undock(): void {
    if (this.layout !== 'docked') return;
    for (const e of this.engines) e.on = false;
    this.splitOff(['sm', 'cm'], -0.4, 0, 0);
    this.reframe(DOCK_C, 'lm');
    this.stage = 'lm';
    this.engines = [{ on: false, level: 0 }];
    this.legsOut = true;
    this.throttle = 1;
    this.sas = 'stab';
    this.holdQ = null;
    this.log('Undocked: the lunar module is flying on its own. The command module stays in orbit.', 'stage');
  }

  // ------------------------------------------------------------ staging
  private splitOff(parts: PartId[], dv: number, burn: number, push: number): void {
    const oldY = this.ycg;
    const moved = parts.filter((p) => this.attached.has(p));
    if (!moved.length) return;
    // the debris' own centre of mass
    let m = 0, my = 0;
    for (const p of moved) {
      const d = this.py(p);
      m += d.dry + this.prop[p];
      my += d.dry * d.yDry + this.prop[p] * d.yProp;
    }
    const ycgD = my / Math.max(1, m);
    const rD = add(this.r, qrot(this.q, [0, ycgD - this.ycg, 0]));
    const fwd = this.forward;
    const tumble: V3 = [(Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.04];
    this.debris.push({ parts: moved, r: rD, v: addScaled(this.v, fwd, dv), q: [...this.q] as Q, w: tumble, ycg: ycgD, t: 0, burn, push, gone: false });
    for (const p of moved) this.attached.delete(p);
    this.massProps();
    this.recentre(oldY);
  }

  private separateSic(): void {
    this.stagingBusy = true;
    for (const e of this.engines) e.on = false;
    this.log('S-IC outboard engine cutoff.', 'stage');
    this.at(0.7, () => {
      this.splitOff(['sic'], -0.5, 0.7, -9);
      this.log('S-IC separation: retro-rockets fire, S-II ullage motors settle the propellant.', 'stage');
      this.stage = 'sii';
      this.engines = ENGINES.sii.at.map(() => ({ on: false, level: 0 }));
      this.cutoffCommanded = false;
      this.at(1.4, () => {
        if (this.stage !== 'sii') return;
        for (const e of this.engines) e.on = true;
        this.log('S-II ignition: five J-2s.', 'stage');
        this.stagingBusy = false;
        this.at(30, () => {
          if (this.attached.has('siiInter')) {
            this.splitOff(['siiInter'], -1.0, 0, 0);
            this.log('S-II aft interstage jettisoned.', 'stage');
          }
        });
        this.at(35, () => {
          if (this.attached.has('les') && !this.aborted) this.jettisonLes();
        });
        this.at(300, () => {
          if (this.stage === 'sii' && this.engines[0]?.on) {
            this.engines[0].on = false;
            this.log('S-II centre engine cutoff, early, to stop POGO vibration.', 'info');
          }
        });
      });
    });
  }

  private jettisonLes(): void {
    if (!this.attached.has('les')) return;
    this.splitOff(['les'], 0, 1.0, 22);
    this.log('Launch escape tower jettisoned.', 'stage');
  }

  private separateSii(): void {
    this.stagingBusy = true;
    for (const e of this.engines) e.on = false;
    this.log('S-II cutoff.', 'stage');
    this.at(0.8, () => {
      this.splitOff(['sii', 'siiInter'], -0.5, 0.8, -6);
      this.log('S-II separation. S-IVB ullage motors fire.', 'stage');
      this.stage = 'sivb';
      this.engines = [{ on: false, level: 0 }];
      this.cutoffCommanded = false;
      this.at(3.0, () => {
        this.stagingBusy = false;
        if (this.stage !== 'sivb') return;
        this.sivbStarts--;
        this.engines[0].on = true;
        this.log('S-IVB ignition.', 'stage');
      });
    });
  }

  // ------------------------------------------------------------ the step
  /** advance by dt seconds of sim time (already warped), in substeps */
  advance(dt: number): void {
    if (this.outcome) {
      this.time += dt;
      if (this.moonRest) {
        const m = moonState(this.time);
        const rel = fromMoonFixed(this.moonRest.p, this.time);
        this.r = add(m.r, rel);
        this.v = add(m.v, moonSpinVel(rel));
        const A = moonAxes(this.time);
        this.q = qnorm(qmul(qFromAxes(A.X, A.Y, A.Z), this.moonRest.q));
      }
      for (const d of this.debris) if (!d.gone) this.stepDebris(d, dt);
      this.debris = this.debris.filter((d) => !d.gone);
      return;
    }
    const powered = this.thrust > 0 || this.lesBurn > 0 || this.engines.some((e) => e.on || e.level > 0);
    const inAir = this.alt < EARTH.atmosphereTop;
    const dMoon = len(sub(this.r, moonPos(this.time)));
    const maxSub = powered || inAir || this.held ? 0.02 : dMoon < MOON.R + 300_000 ? 1 : dMoon < 20_000_000 ? 2 : this.alt < 2_000_000 ? 2 : 10;
    const n = Math.min(4000, Math.max(1, Math.ceil(dt / maxSub)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.step(h);
      if (this.outcome) break;
      this.stepHook?.(h);
    }
    // stages and other cast-off parts fall on their own
    for (const d of this.debris) if (!d.gone) this.stepDebris(d, dt);
    this.debris = this.debris.filter((d) => !d.gone);
  }

  private step(dt: number): void {
    this.met += dt;
    // the universe waits while the count holds on the pad: liftoff always comes at the same
    // moment, so the parking orbit always lies in the Moon's plane (a launch window that never closes)
    if (!(this.held && !this.counting)) this.time += dt;
    // count and timeline
    if (this.held) {
      if (this.counting) this.countdown();
      else this.met -= dt;
    }
    if (this.timeline.length) {
      const due = this.timeline.filter((e) => e.t <= this.met);
      if (due.length) {
        this.timeline = this.timeline.filter((e) => e.t > this.met);
        due.forEach((e) => e.fn());
      }
    }
    // engines spool toward their commands; propellant runs out
    const E = this.stage ? ENGINES[this.stage] : null;
    let thrust = 0, flow = 0;
    const p = air(this.alt).p;
    if (E) {
      for (const e of this.engines) {
        const target = e.on ? (this.stage === 'lm' ? Math.max(0.1, Math.min(1, this.throttle)) : 1) : 0;
        e.level += Math.sign(target - e.level) * Math.min(Math.abs(target - e.level), (target > e.level ? 1 / E.spoolUp : 2.5) * dt);
        thrust += e.level * Math.max(0, E.thrustVac - (E.thrustVac - E.thrustSL) * (p / 101325));
        flow += e.level * E.mdot;
      }
      if (this.stage && flow > 0 && this.prop[this.stage] > 0) {
        const use = flow * dt;
        if (this.prop[this.stage] <= use) {
          this.prop[this.stage] = 0;
          this.depleted();
        } else this.prop[this.stage] -= use;
      }
      if (this.stage && this.prop[this.stage] <= 0) {
        // no propellant, no thrust
        for (const e of this.engines) e.level = Math.min(e.level, 0.02);
        thrust = 0;
        flow = 0;
      }
    }
    if (this.lesBurn > 0) {
      thrust += 654_000;
      this.lesBurn -= dt;
    }
    this.thrust = thrust;
    const oldY = this.ycg;
    this.massProps();
    if (Math.abs(this.ycg - oldY) > 1e-6 && !this.held) this.recentre(oldY);

    // the pad: thrust builds on the hold-down arms until release at T-0
    if (this.held) {
      this.placeOnPad();
      if (this.met >= 0 && this.counting) {
        const ready = this.engines.every((e) => e.level > 0.95);
        if (ready && this.thrust > this.mass * G0) {
          this.held = false;
          this.log('LIFTOFF. The clock is running.', 'good');
        } else if (this.met > 1.5) {
          for (const e of this.engines) e.on = false;
          this.counting = false;
          this.ignitionLogged = false;
          this.met = -20;
          this.log('Hold-down release inhibited: engines not at full thrust. Count recycled.', 'warn');
        }
      }
      this.updateDerived(p, [0, 0, 0]);
      return;
    }

    // forces
    const fwd = this.forward;
    let F: V3 = scale(fwd, thrust);
    const at = air(this.alt);
    const vrel = this.vSurf;
    const vr = len(vrel);
    this.qDyn = 0.5 * at.rho * vr * vr;
    this.mach = vr / at.a;
    let alpha = 0;
    if (vr > 1) {
      const vhat = scale(vrel, 1 / vr);
      const ca = Math.max(-1, Math.min(1, dot(vhat, fwd)));
      alpha = Math.acos(ca);
      const cm = this.isCm;
      const area = cm ? PARTS.cm.area : this.attached.has('sic') || this.attached.has('sii') ? 80 : this.attached.has('sivb') ? 34 : 12;
      const cd = cm ? 1.3 : 0.32 + 0.45 * Math.exp(-(((this.mach - 1.1) / 0.45) ** 2)) + 0.1 * Math.min(1, alpha);
      F = addScaled(F, vhat, -this.qDyn * area * cd);
      if (!cm) {
        // normal force from the angle of attack, at the centre of pressure
        const perp = sub(vhat, scale(fwd, ca));
        const pl = len(perp);
        if (pl > 1e-6) {
          const nDir = scale(perp, -1 / pl);
          const Cn = 2.2 * Math.sin(Math.min(alpha, Math.PI / 2));
          F = addScaled(F, nDir, this.qDyn * area * Cn);
        }
      }
      // parachutes
      if (this.chuteLevel > 0) {
        const cdA = this.chute === 'main' ? 1290 : 30;
        F = addScaled(F, vhat, -this.qDyn * cdA * this.chuteLevel);
      }
    }
    this.alpha = alpha;
    this.qAlpha = this.qDyn * ((alpha * 180) / Math.PI);
    const acc = scale(F, 1 / this.mass);
    this.lastAccel = scale(F, 1 / this.mass);

    // torques: steering (engine gimbal, APS / RCS) against aerodynamic moments, in short
    // steps so the attitude control stays steady through long time-warped substeps
    const na = Math.min(50, Math.ceil(dt / 0.1));
    for (let i = 0; i < na; i++) this.attitude(dt / na, thrust, vrel, alpha);

    // integrate translation (RK4 for gravity; the other forces held over the substep)
    const aOther = scale(F, 1 / this.mass);
    const t0 = this.time - dt;
    const gAt = (r: V3, h = 0): V3 => gravityAt(r, t0 + h);
    const k1v = add(gAt(this.r), aOther), k1r = this.v;
    const k2v = add(gAt(addScaled(this.r, k1r, dt / 2), dt / 2), aOther), k2r = addScaled(this.v, k1v, dt / 2);
    const k3v = add(gAt(addScaled(this.r, k2r, dt / 2), dt / 2), aOther), k3r = addScaled(this.v, k2v, dt / 2);
    const k4v = add(gAt(addScaled(this.r, k3r, dt), dt), aOther), k4r = addScaled(this.v, k3v, dt);
    this.r = add(this.r, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), dt / 6));
    this.v = add(this.v, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), dt / 6));
    void acc;

    this.updateDerived(at.p, this.lastAccel);
    this.events_(dt);
  }

  private updateDerived(_p: number, aNonGrav: V3): void {
    this.accel = aNonGrav;
    this.gLoad = this.held ? 1 : len(aNonGrav) / G0;
    const s = this.stats;
    if (!this.held) {
      s.maxG = Math.max(s.maxG, this.gLoad);
      s.maxAlt = Math.max(s.maxAlt, this.alt);
      s.maxV = Math.max(s.maxV, len(this.v));
      if (this.qDyn > s.maxQ) {
        s.maxQ = this.qDyn;
        s.maxQAt = this.met;
      }
    }
  }

  private depleted(): void {
    const s = this.stage;
    if (!s) return;
    for (const e of this.engines) e.on = false;
    if (s === 'sic') {
      if (this.autoStage) this.separateSic();
      else this.log('S-IC propellant depleted. Press SPACE to stage.', 'warn');
    } else if (s === 'sii') {
      if (this.autoStage) this.separateSii();
      else this.log('S-II propellant depleted. Press SPACE to stage.', 'warn');
    } else this.log(`${s === 'sivb' ? 'S-IVB' : ENGINES[s].kind} propellant depleted.`, 'warn');
  }

  private countdown(): void {
    const t = this.met;
    // ignition sequence: centre engine first, then the outboard pairs
    const ign = [-8.9, -8.6, -8.6, -8.3, -8.3];
    this.engines.forEach((e, i) => {
      if (!e.on && t >= ign[i] && t < 0 && !this.cutoffCommanded) e.on = true;
    });
    if (t >= -8.9 && !this.ignitionLogged) {
      this.ignitionLogged = true;
      this.log('Ignition sequence start.', 'stage');
    }
  }

  // timed and threshold events during flight
  private events_(dt: number): void {
    const t = this.met;
    if (this.stage === 'sic' && this.engines[0]?.on && t >= 135.5 && t - dt < 135.5) {
      this.engines[0].on = false;
      this.log('S-IC centre engine cutoff, to hold the acceleration under 4 g.', 'info');
    }
    if (!this.towerCleared && this.alt > 180) {
      this.towerCleared = true;
      this.log('Tower cleared.', 'good');
    }
    if (!this.machPassed && this.mach >= 1 && this.alt < 30000 && this.vVert > 0) {
      this.machPassed = true;
      this.log('Mach 1: supersonic.', 'info');
    }
    if (!this.maxQPassed && this.vVert > 0 && this.stats.maxQ > 15_000 && this.qDyn < this.stats.maxQ * 0.97) {
      this.maxQPassed = true;
      this.log(`Max Q: ${(this.stats.maxQ / 1000).toFixed(1)} kPa at T+${this.stats.maxQAt.toFixed(0)} s.`, 'warn');
    }
    // the parachutes
    if (this.isCm && this.vVert < 0) {
      if (this.chute === 'none' && this.alt < 7300 && len(this.vSurf) < 300) {
        this.chute = 'drogue';
        this.chuteLevel = 0;
        this.log('Drogue parachutes deployed.', 'info');
      } else if (this.chute === 'drogue' && this.alt < 3200) {
        this.chute = 'main';
        this.chuteLevel = 0.2;
        this.log('Main parachutes: three good chutes.', 'good');
      }
    }
    if (this.chute !== 'none') this.chuteLevel = Math.min(1, this.chuteLevel + dt / (this.chute === 'main' ? 4 : 1.5));
    // the structure
    const thinWalled = this.attached.has('sic') || this.attached.has('sii');
    if (thinWalled && this.qAlpha > QA_LIMIT) return this.lose('Structural failure', `The aerodynamic load reached ${(this.qAlpha / 1000).toFixed(0)} kPa·deg (limit ${QA_LIMIT / 1000}). Turning that hard in thick air broke the stack apart.`);
    if (!this.isCm && this.qDyn > 95_000) return this.lose('Vehicle broke up', 'The dynamic pressure tore the vehicle apart.');
    const vr = len(this.vSurf);
    this.heat = air(this.alt).rho * vr * vr * vr;
    if (!this.isCm && this.vVert < 0 && this.heat > 1.0e8 && vr > 2000) return this.lose('Burned up on re-entry', 'Without a heat shield the vehicle broke up and burned in the upper atmosphere. Separate the command module before entry to bring the crew home.');
    // the Moon's surface: a lander standing on its legs, or a crash
    if (this.nearMoon) {
      if (this.lowAlt <= 0) this.touchMoon();
      return;
    }
    // the ground
    if (this.lowAlt <= 0) {
      const v = len(this.vSurf);
      if (this.isCm && v < 15) {
        const sea = this.overSea();
        this.outcome = { status: 'landed', title: sea ? 'Splashdown' : 'Touchdown', text: sea ? `The command module is in the water at ${v.toFixed(1)} m/s. Crew safe.` : `The command module came down on land at ${v.toFixed(1)} m/s: a hard landing, but the crew is safe.` };
        this.log(this.outcome.title + '. Crew safe.', 'good');
        this.v = airVelocity(this.r);
        this.w = [0, 0, 0];
      } else this.lose('Impact', `The vehicle hit the ${this.overSea() ? 'sea' : 'ground'} at ${v.toFixed(0)} m/s.`);
      return;
    }
    // orbit insertion and escape
    const st = this.status();
    if (st === 'orbit' && !this.orbitAnnounced && !this.engines.some((e) => e.on)) {
      this.orbitAnnounced = true;
      const o = this.orbit;
      this.log(`Orbit insertion: ${((o.rp - R_E) / 1000).toFixed(0)} by ${((o.ra - R_E) / 1000).toFixed(0)} km.`, 'good');
    }
    if (st !== 'orbit' && this.orbitAnnounced && st === 'falling' && this.orbit.rp < R_E + 100_000) {
      this.orbitAnnounced = false;
      this.log('Orbit decaying: periapsis is inside the atmosphere.', 'warn');
    }
  }

  private touchMoon(): void {
    const vs = this.vSurf;
    const up = this.up;
    const vz = dot(vs, up);
    const vh = len(sub(vs, scale(up, vz)));
    const tilt = (Math.acos(Math.max(-1, Math.min(1, dot(this.forward, up)))) * 180) / Math.PI;
    for (const e of this.engines) e.on = false;
    if (this.isLm && this.legsOut && -vz < 3.5 && vh < 2.5 && tilt < 15) {
      const rel = this.rel;
      const A = moonAxes(this.time);
      const qa = qFromAxes(A.X, A.Y, A.Z);
      // settle on the surface, upright on the four footpads
      const lowNow = this.lowAlt;
      const relSet = sub(rel, scale(up, lowNow));
      this.moonRest = { p: toMoonFixed(relSet, this.time), q: qnorm(qmul(qconj(qa), this.q)) };
      const f = toMoonFixed(norm(rel), this.time);
      const lat = (Math.asin(Math.max(-1, Math.min(1, f[2]))) * 180) / Math.PI, lon = (Math.atan2(f[1], f[0]) * 180) / Math.PI;
      this.outcome = {
        status: 'landed',
        title: 'Landed on the Moon',
        text: `Contact light, engine stop. The lunar module is down at ${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}, touching down at ${(-vz).toFixed(1)} m/s with ${(this.prop.lm / 1000).toFixed(2)} t of fuel to spare.`,
      };
      this.thrust = 0;
      this.log('Engine stop. The lunar module has landed on the Moon.', 'good');
      this.w = [0, 0, 0];
      this.advance(0);
      return;
    }
    const v = len(vs);
    this.lose('Crashed on the Moon', this.isLm ? `The lunar module hit the surface at ${v.toFixed(1)} m/s${tilt > 15 ? `, tilted ${tilt.toFixed(0)}°` : ''}. A safe landing needs under 3.5 m/s down, under 2.5 m/s sideways and the lander upright.` : `The spacecraft hit the Moon at ${v.toFixed(0)} m/s.`);
  }

  private lose(title: string, text: string): void {
    this.outcome = { status: 'lost', title, text };
    for (const e of this.engines) e.on = false;
    this.log(title + '.', 'bad');
  }

  /** is the vehicle over water? Near the pad the launch-site scene's own shoreline decides */
  overSea(): boolean {
    const e = toEcef(this.r, this.time);
    const pad = scale(ecefDir(PAD.lat, PAD.lon), R_E);
    const d = sub(e, pad);
    const ps = padScene();
    const lx = dot(d, ps.x), lz = dot(d, ps.z);
    if (Math.abs(lx) < 3000 && Math.abs(lz) < 3000) return lz < -380;
    return continent(norm(e)) <= 0;
  }

  // ------------------------------------------------------------ attitude
  /** the direction the guidance or SAS wants the nose, and the roll reference */
  private target(vrel: V3): { f: V3; x?: V3 } | null {
    const up = this.up;
    if (this.lesBurn > 0 && this.abortDir) return { f: this.abortDir };
    if (this.isCm && !this.attached.has('les')) {
      // the command module flies heat shield first; under chutes it hangs base down
      if (this.qDyn > 30 || this.chute !== 'none') return { f: len(vrel) > 1 ? scale(norm(vrel), -1) : up };
    }
    if (this.guidance) return this.guide(vrel);
    if (this.sas === 'aim' && this.aim) return { f: this.aim };
    const vref = this.nearMoon ? (this.altB < 15_000 ? vrel : this.vRel) : this.alt < 70_000 ? vrel : this.v;
    const o = cross(this.rel, this.vRel);
    switch (this.sas) {
      case 'pro':
        return { f: norm(vref) };
      case 'retro':
        return { f: scale(norm(vref), -1) };
      case 'normal':
        return { f: norm(o) };
      case 'anti':
        return { f: scale(norm(o), -1) };
      case 'radOut':
        return { f: up };
      case 'radIn':
        return { f: scale(up, -1) };
      case 'hold':
        if (!this.holdQ) this.holdQ = this.q;
        return { f: qrot(this.holdQ, [0, 1, 0]), x: qrot(this.holdQ, [1, 0, 0]) };
      default:
        return null;
    }
  }

  /** the Instrument Unit's ascent guidance */
  private guide(vrel: V3): { f: V3; x?: V3 } | null {
    const up = this.up;
    const ang = earthAngle(this.time);
    const { E, N } = enu(PAD.lat, PAD.lon);
    const downrange = norm(rotY(add(scale(N, Math.cos(AZIMUTH)), scale(E, Math.sin(AZIMUTH))), ang));
    const flat = norm(sub(downrange, scale(up, dot(downrange, up))));
    const right = norm(cross(flat, up));
    const t = this.met;
    if (this.held) return null;
    if (this.stage === 'sic' || (this.stage === 'sii' && this.met < 175)) {
      if (t < 12) {
        // straight up, holding the pad orientation until the tower is cleared
        return { f: up, x: qrot(this.q, [1, 0, 0]) };
      }
      // roll to the flight azimuth and pitch over, then a zero-lift gravity turn
      const kick = (10 * Math.PI) / 180;
      const pk = Math.min(1, (t - 12) / 22);
      const tiltKick = kick * (pk * pk * (3 - 2 * pk));
      let f = norm(add(scale(up, Math.cos(tiltKick)), scale(flat, Math.sin(tiltKick))));
      if (t > 40 && len(vrel) > 50) {
        // follow the air-relative velocity: no angle of attack through max Q
        const vv = norm(vrel);
        const vTilt = Math.acos(Math.max(-1, Math.min(1, dot(vv, up))));
        const fTilt = Math.acos(Math.max(-1, Math.min(1, dot(f, up))));
        if (vTilt > fTilt) f = norm(add(scale(up, Math.cos(vTilt)), scale(flat, Math.sin(vTilt))));
      }
      return { f, x: right };
    }
    // closed loop to a circular parking orbit (stages two and three)
    if (this.status() === 'orbit' && !this.engines.some((e) => e.on)) {
      const hz = norm(sub(this.v, scale(up, dot(this.v, up))));
      return { f: hz, x: norm(cross(hz, up)) };
    }
    const rr = len(this.r);
    const vh = Math.sqrt(Math.max(0, dot(this.v, this.v) - this.vVert ** 2));
    const hz = vh > 10 ? norm(sub(this.v, scale(up, this.vVert))) : flat;
    const aT = Math.max(0.5, this.thrust / this.mass);
    const vCirc = Math.sqrt(EARTH.GM / (R_E + TARGET_ALT));
    const tgo = Math.max(20, (vCirc - vh) / aT);
    const hErr = R_E + TARGET_ALT - rr;
    const vDes = Math.max(-150, Math.min(400, (hErr / Math.max(tgo, 40)) * Math.min(1, tgo / 60)));
    const gEff = EARTH.GM / (rr * rr) - (vh * vh) / rr;
    const aReq = (vDes - this.vVert) / 8 + gEff;
    const s = Math.max(-0.35, Math.min(0.9, aReq / aT));
    const f = norm(add(scale(hz, Math.sqrt(1 - s * s)), scale(up, s)));
    // engine cutoff when the orbit's energy reaches the target circle
    const eps = dot(this.v, this.v) / 2 - EARTH.GM / rr;
    if (this.stage === 'sivb' && this.engines[0]?.on && eps >= -EARTH.GM / (2 * (R_E + TARGET_ALT)) && rr > R_E + TARGET_ALT - 15_000) {
      this.engines[0].on = false;
      this.cutoffCommanded = true;
      this.log('S-IVB cutoff: guidance reached the parking orbit.', 'stage');
    }
    return { f, x: norm(cross(hz, up)) };
  }

  private attitude(dt: number, thrust: number, vrel: V3, alpha: number): void {
    // control authority: engine gimbal while burning, the APS / RCS jets otherwise
    const E = this.stage ? ENGINES[this.stage] : null;
    let tauG = 0, tauRollG = 0;
    if (E && thrust > 0) {
      const per = thrust / Math.max(1, this.engines.reduce((s, e) => s + e.level, 0));
      this.engines.forEach((e, i) => {
        if (!E.gimbals[i] || e.level <= 0) return;
        const arm = this.ycg - E.yGimbal;
        tauG += per * e.level * Math.sin(E.gimbalMax) * arm * (E.at.length > 1 ? 0.7 : 1);
        tauRollG += per * e.level * Math.sin(E.gimbalMax) * Math.hypot(E.at[i][0], E.at[i][1]) * 0.7;
      });
    }
    const cm = this.isCm;
    const aps = this.attached.has('sivb') ? 4.0e5 : 0;
    const lm = this.isLm;
    const rcs = cm ? 1.2e4 : lm ? 9.0e3 : this.attached.has('sm') ? 6.0e4 : 0;
    const tauP = Math.max(tauG, aps, rcs, 2000);
    const tauR = Math.max(tauRollG, aps * 0.6, rcs, 1000);
    const aMax = tauP / this.Itr;
    const nimble = cm || lm || this.layout === 'docked';
    const maxRate = Math.max(0.004, Math.min((nimble ? 7 : 2.5) * (Math.PI / 180), aMax * 6));
    const maxRateRoll = Math.max(0.004, Math.min((nimble ? 7 : 3) * (Math.PI / 180), (tauR / this.Iroll) * 6));

    // desired body rates
    const inp = this.input;
    const manual = Math.abs(inp.pitch) + Math.abs(inp.yaw) + Math.abs(inp.roll) > 0.01;
    let wDes: V3 | null = null;
    if (manual) {
      wDes = [inp.pitch * maxRate, -inp.roll * maxRateRoll, -inp.yaw * maxRate];
      if (this.sas === 'hold') this.holdQ = null;
      if (this.guidance && !this.held) this.setGuidance(false);
    } else if (this.sas !== 'off' || this.guidance || cm) {
      const tg = this.target(vrel);
      if (tg) {
        const fwd = this.forward;
        const axis = cross(fwd, tg.f);
        const s = len(axis);
        const c = dot(fwd, tg.f);
        const ang = Math.atan2(s, c);
        let wEci: V3 = s > 1e-9 ? scale(axis, (ang / s) * 0.6) : [0, 0, 0];
        if (tg.x) {
          const bx = qrot(this.q, [1, 0, 0]);
          const xr = norm(sub(tg.x, scale(fwd, dot(tg.x, fwd))));
          const rollErr = Math.atan2(dot(cross(bx, xr), fwd), dot(bx, xr));
          wEci = addScaled(wEci, fwd, rollErr * 0.4);
        }
        const wb = qrot(qconj(this.q), wEci);
        const cl = (v: number, m: number) => Math.max(-m, Math.min(m, v));
        wDes = [cl(wb[0], maxRate), cl(wb[1], maxRateRoll), cl(wb[2], maxRate)];
      } else wDes = [0, 0, 0];
    }
    // torque toward the desired rates, clamped to what the hardware can do
    const tau: V3 = [0, 0, 0];
    if (wDes) {
      const k = 1.6;
      tau[0] = Math.max(-tauP, Math.min(tauP, this.Itr * k * (wDes[0] - this.w[0])));
      tau[1] = Math.max(-tauR, Math.min(tauR, this.Iroll * k * (wDes[1] - this.w[1])));
      tau[2] = Math.max(-tauP, Math.min(tauP, this.Itr * k * (wDes[2] - this.w[2])));
    }
    this.gimbal = tauG > 0 ? [(tau[0] / tauG) * E!.gimbalMax, (tau[2] / tauG) * E!.gimbalMax] : [0, 0];
    // aerodynamic moment: the centre of pressure sits ahead of the centre of mass
    if (!cm && this.qDyn > 1 && alpha > 1e-4) {
      const yCp = this.attached.has('sic') ? 40 : this.attached.has('sii') ? 62 : 82;
      const fwd = this.forward;
      const vhat = norm(vrel);
      const perp = sub(vhat, scale(fwd, dot(vhat, fwd)));
      const pl = len(perp);
      if (pl > 1e-6) {
        const nDir = scale(perp, -1 / pl);
        const area = this.attached.has('sic') || this.attached.has('sii') ? 80 : 34;
        const Fn = this.qDyn * area * 2.2 * Math.sin(Math.min(alpha, Math.PI / 2));
        const mEci = scale(cross(fwd, nDir), Fn * (yCp - this.ycg));
        const mb = qrot(qconj(this.q), mEci);
        tau[0] += mb[0];
        tau[1] += mb[1];
        tau[2] += mb[2];
      }
    }
    if (cm && this.qDyn > 30) {
      // the capsule's shape trims it heat shield first: strong aerodynamic damping
      const d = Math.min(1, this.qDyn / 2000);
      this.w = scale(this.w, 1 - d * Math.min(1, dt * 3));
    }
    this.w = [this.w[0] + (tau[0] / this.Itr) * dt, this.w[1] + (tau[1] / this.Iroll) * dt, this.w[2] + (tau[2] / this.Itr) * dt];
    // integrate attitude
    const wl = len(this.w);
    if (wl > 1e-12) {
      const dq = qAxisAngle(scale(this.w, 1 / wl), wl * dt);
      this.q = qnorm(qmul(this.q, dq));
    }
  }

  // ------------------------------------------------------------ debris
  private stepDebris(d: Debris, dt: number): void {
    d.t += dt;
    if (d.fixed) {
      d.r = rotY(d.fixed, earthAngle(this.time));
      d.q = qnorm(qmul(qAxisAngle([0, 1, 0], earthAngle(this.time)), this.padQ));
      return;
    }
    const n = Math.min(400, Math.max(1, Math.ceil(dt / (d.t < 60 || len(d.r) - R_E < EARTH.atmosphereTop ? 0.05 : 5))));
    const h = dt / n;
    let m = 0, area = 0;
    for (const p of d.parts) {
      m += PARTS[p].dry;
      area = Math.max(area, PARTS[p].area);
    }
    for (let i = 0; i < n; i++) {
      const rm = len(d.r);
      const alt = rm - R_E;
      let a = gravityAt(d.r, this.time + i * h);
      const dm = len(sub(d.r, moonPos(this.time + i * h)));
      if (dm < MOON.R) {
        d.gone = true;
        break;
      }
      if (alt < 200_000) {
        const vrel = sub(d.v, airVelocity(d.r));
        const vr = len(vrel);
        const rho = air(alt).rho;
        if (vr > 0.1) a = addScaled(a, vrel, (-0.5 * rho * vr * 1.1 * area) / m);
      }
      if (d.burn > 0) {
        const fwd = qrot(d.q, [0, 1, 0]);
        a = addScaled(a, fwd, d.push);
        d.burn -= h;
      }
      d.v = addScaled(d.v, a, h);
      d.r = addScaled(d.r, d.v, h);
      const wl = len(d.w);
      if (wl > 1e-9) d.q = qnorm(qmul(d.q, qAxisAngle(scale(d.w, 1 / wl), wl * h)));
      if (alt < 0) {
        d.gone = true;
        break;
      }
    }
    if (len(sub(d.r, this.r)) > 8_000_000) d.gone = true;
  }
}

/** direction to the Sun (ECI), fixed for the flight: just rising behind Pad 1 at T-0 */
export function sunDirection(): V3 {
  // the launch-site scene's sun (0.22, 0.0045, -1) in its axes: rising out of the sea in the east
  const s = padScene();
  return norm(add(add(scale(s.x, 0.22), scale(s.y, 0.012)), scale(s.z, -1)));
}
