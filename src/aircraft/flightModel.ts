// Flight dynamics for the three fighters.
//
// Translational motion is fully force based (lift, drag, thrust, side force,
// gravity) so energy management is real: pulling G bleeds speed, climbing
// trades speed for height, and top speed / ceiling emerge from thrust vs.
// drag at altitude. Rotation follows the fly-by-wire control laws of these
// jets: the stick commands load factor (limited by the G limiter and the AoA
// limiter), roll rate about the velocity vector, and sideslip via rudder.
// The FBW holds 1G-corrected flight path with the stick released.
// The aircraft flies through the air mass: wind and turbulence (and on the
// runway the headwind), plus the wake and jet wash of other aircraft.

import * as THREE from 'three';
import { AircraftSpec, STORES, StoreType } from './specs';
import { atmosphere, AtmoState, casFromTas } from '../core/atmosphere';
import { G0, DEG, FT } from '../core/constants';
import { clamp, smoothstep, lerp } from '../core/math';
import { groundSurface, Surface } from '../world/ground';
import { Carrier, CARRIERS } from '../world/carriers';
import { KT } from '../core/constants';
import { windAt } from '../core/weather';

export interface FlightControls {
  /** +1 = full aft stick (nose up) */
  pitch: number;
  /** +1 = full right */
  roll: number;
  /** +1 = right rudder */
  yaw: number;
  /** throttle lever 0..1 idle..MIL, 1..1.1 afterburner */
  throttle: number;
  speedbrake: boolean;
  gearDown: boolean;
  /** 0..1 wheel brakes */
  wheelBrake: number;
  /** G-limiter override (paddle switch) */
  gOverride: boolean;
}

export function neutralControls(): FlightControls {
  return { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, speedbrake: false, gearDown: false, wheelBrake: 0, gOverride: false };
}

export interface FmDamage {
  pitchBias?: number;
  thrust: [number, number];
  lift: number;
  rollBias: number;
  control: number;
  drag: number;
}

const _atm: AtmoState = { T: 0, p: 0, rho: 0, a: 0, sigma: 0, delta: 0 };
const _vb = new THREE.Vector3();
const _vhat = new THREE.Vector3();
const _lift = new THREE.Vector3();
const _side = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _surf: Surface = { h: 0, kind: 'terrain', field: null };
const _air = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _yUp = new THREE.Vector3(0, 1, 0);
const _nrm = new THREE.Vector3();
const _qTilt = new THREE.Quaternion();
const _cw = { x: 0, z: 0 };
const _cl = { u: 0, v: 0 };

/** half-width of the landing area in which the hook can take a wire (m) */
const LANDING_HALF_WIDTH = 14;
/** Catapult runout: rolling out after the trap (m), and how far behind the main gear the hook point trails (m). */
const TRAP_RUNOUT = 92;
const HOOK_AFT = 4.6;
/** salute: how long full power is held on the catapult before the shot (s) */
const CAT_SALUTE = 1.6;

/** A jet on a catapult: hooked up and holding, or being thrown down the stroke. */
export interface CatState {
  carrier: Carrier;
  idx: number;
  phase: 'hold' | 'stroke';
  /** full power held (s) */
  t: number;
  /** stroke: distance run (m), speed relative to the deck (m/s), the catapult's push (m/s²) */
  s: number;
  v: number;
  a: number;
}

/** A jet caught by an arresting wire. */
export interface TrapState {
  carrier: Carrier;
  wire: number;
  phase: 'arrest' | 'rollback';
  decel: number;
  t: number;
}

/**
 * Rotational data per airframe: moments of inertia (kg m^2) at a reference
 * mass, and non-dimensional stability / control derivatives (per radian;
 * control powers are the coefficient at full deflection).
 */
interface AeroData {
  refMass: number;
  ixx: number;
  iyy: number;
  izz: number;
  cyB: number;
  cm0: number;
  /** static pitch stability (negative = stable; the Typhoon is unstable) */
  cmA: number;
  cmQ: number;
  cmD: number;
  clP: number;
  clB: number;
  clR: number;
  clD: number;
  cnB: number;
  cnR: number;
  cnP: number;
  cnD: number;
  /** adverse yaw from the roll surfaces */
  cnDa: number;
  /** engine lateral offset (m) */
  engineArm: number;
  /** actuator rates (full travel per second) */
  rateE: number;
  rateA: number;
  rateR: number;
}

const AERO: Record<string, AeroData> = {
  F15EX: { refMass: 21000, ixx: 36000, iyy: 200000, izz: 225000, cyB: -1.0, cm0: 0, cmA: -0.22, cmQ: -5, cmD: 0.34, clP: -0.35, clB: -0.09, clR: 0.07, clD: 0.056, cnB: 0.13, cnR: -0.33, cnP: -0.03, cnD: 0.036, cnDa: -0.006, engineArm: 0.64, rateE: 2.6, rateA: 4, rateR: 3 },
  FA18EF: { refMass: 19000, ixx: 40000, iyy: 230000, izz: 260000, cyB: -1.0, cm0: 0, cmA: -0.12, cmQ: -5, cmD: 0.37, clP: -0.33, clB: -0.08, clR: 0.07, clD: 0.058, cnB: 0.12, cnR: -0.32, cnP: -0.03, cnD: 0.04, cnDa: -0.006, engineArm: 0.56, rateE: 2.6, rateA: 4, rateR: 3 },
  SU35: { refMass: 24000, ixx: 42000, iyy: 235000, izz: 265000, cyB: -1.0, cm0: 0, cmA: 0.03, cmQ: -5, cmD: 0.34, clP: -0.33, clB: -0.08, clR: 0.07, clD: 0.055, cnB: 0.12, cnR: -0.32, cnP: -0.03, cnD: 0.038, cnDa: -0.006, engineArm: 1.1, rateE: 2.8, rateA: 4, rateR: 3 },
  RAFALE: { refMass: 14000, ixx: 16000, iyy: 115000, izz: 128000, cyB: -0.95, cm0: 0, cmA: 0.09, cmQ: -4.6, cmD: 0.34, clP: -0.3, clB: -0.07, clR: 0.06, clD: 0.052, cnB: 0.11, cnR: -0.3, cnP: -0.03, cnD: 0.032, cnDa: -0.005, engineArm: 0.45, rateE: 3.1, rateA: 4.6, rateR: 3 },
  F22: { refMass: 27000, ixx: 42000, iyy: 250000, izz: 280000, cyB: -1.0, cm0: 0, cmA: -0.04, cmQ: -5, cmD: 0.34, clP: -0.33, clB: -0.08, clR: 0.07, clD: 0.055, cnB: 0.12, cnR: -0.32, cnP: -0.03, cnD: 0.036, cnDa: -0.006, engineArm: 0.5, rateE: 2.8, rateA: 4, rateR: 3 },
  MIG31: { refMass: 36000, ixx: 55000, iyy: 360000, izz: 400000, cyB: -1.05, cm0: 0, cmA: -0.3, cmQ: -6, cmD: 0.3, clP: -0.38, clB: -0.1, clR: 0.07, clD: 0.045, cnB: 0.15, cnR: -0.36, cnP: -0.03, cnD: 0.034, cnDa: -0.006, engineArm: 0.85, rateE: 2.2, rateA: 3.2, rateR: 2.6 },
  SR71: { refMass: 50000, ixx: 160000, iyy: 1500000, izz: 1650000, cyB: -0.9, cm0: 0, cmA: -0.18, cmQ: -7, cmD: 0.5, clP: -0.3, clB: -0.06, clR: 0.06, clD: 0.04, cnB: 0.12, cnR: -0.34, cnP: -0.02, cnD: 0.03, cnDa: -0.004, engineArm: 3.8, rateE: 1.8, rateA: 2.2, rateR: 2 },
  TYPHOON: { refMass: 15000, ixx: 18000, iyy: 130000, izz: 145000, cyB: -0.95, cm0: 0, cmA: 0.08, cmQ: -4.5, cmD: 0.33, clP: -0.3, clB: -0.07, clR: 0.06, clD: 0.05, cnB: 0.11, cnR: -0.3, cnP: -0.03, cnD: 0.032, cnDa: -0.005, engineArm: 0.5, rateE: 3.0, rateA: 4.5, rateR: 3 },
};

export class FlightModel {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  readonly fwd = new THREE.Vector3(0, 0, -1);
  readonly up = new THREE.Vector3(0, 1, 0);
  readonly right = new THREE.Vector3(1, 0, 0);
  readonly accel = new THREE.Vector3();

  // air data
  alpha = 0;
  beta = 0;
  mach = 0;
  tas = 0;
  cas = 0;
  qbar = 0;
  rho = 1.225;
  soundSpeed = 340;
  /** pilot-felt normal load factor */
  nz = 1;
  ny = 0;
  gamma = 0;
  bank = 0;
  pitchAngle = 0;
  heading = 0;
  vs = 0;
  agl = 1000;
  cl = 0;
  cd = 0;
  /** ground speed (m/s, horizontal) */
  gs = 0;
  // rates (deg/s)
  rollRate = 0;
  pitchRate = 0;
  yawRate = 0;
  /** body angular rates (rad/s): roll right, pitch up, yaw right */
  pRate = 0;
  qRate = 0;
  rRate = 0;
  /** control-surface deflections the FBW is using (-1..1): stabilator, roll, rudder */
  readonly defl = { e: 0, a: 0, r: 0 };
  private dCmd = { e: 0, a: 0, r: 0 };
  /**
   * Thrust-vectoring nozzle deflection (radians; Su-35S only): pitch (+ nose
   * up) and yaw (+ nose right), plus the differential that rolls the jet.
   */
  readonly nozzle = { p: 0, y: 0, roll: 0 };
  private nCmdF = 1;
  /** true when the jet is out of controlled flight (stalled / spinning) */
  departed = false;
  /** wind + turbulence at the aircraft (world m/s) */
  readonly windVel = new THREE.Vector3();
  private t = Math.random() * 100;
  private rockPhase = Math.random() * 6;
  private lastGustY = 0;
  /** per-engine thrust (N), for asymmetric-thrust yaw */
  readonly engThrust: number[] = [0, 0];
  /** extra roll/yaw inertia from stores far out on the wings */
  storeRollInertia = 0;
  /** gun recoil while firing (N, acts aft along the gun line) */
  gunRecoil = 0;
  /**
   * Another jet's wake / jet wash at this aircraft, set every step by the
   * simulation: vertical gust (m/s) and rolling acceleration (rad/s^2).
   */
  wakeGust = 0;
  wakeRoll = 0;

  // propulsion
  readonly rpm: number[];
  readonly ab: number[];
  private abDelay: number[];
  thrust = 0;
  fuelFlow = 0;
  fuelInternal: number;
  fuelExternal = 0;
  fuelExternalCap = 0;
  readonly engineOut: boolean[];
  throttleLever = 0.75;

  // configuration
  storeMass = 0;
  storeCd = 0;
  ammoMass = 0;
  gearPos = 0;
  speedbrakePos = 0;
  gOverrideActive = false;

  // carrier operations
  /** on a catapult (null when not) */
  cat: CatState | null = null;
  /** in the wire (null when not) */
  trap: TrapState | null = null;
  /** the tailhook is down */
  hookDown = false;
  /** where the hook point was last step along the landing axis of the nearest carrier */
  private hookPrev: { c: Carrier; s: number } | null = null;
  /** counters the game watches for calls: catapult shots, traps, bolters */
  catShots = 0;
  traps = 0;
  bolters = 0;
  /** the last trap: which wire (1-4), sink rate (m/s) at touchdown and a landing grade */
  lastTrap = { wire: 0, sink: 0, grade: '' };
  /** the hook touched down on the landing area and has not caught a wire yet */
  private boltering = false;
  /** the deck's surface normal while on a deck (for the jet's attitude) */
  private deckN: { x: number; z: number } | null = null;
  /** the kind of surface under the wheels on the previous ground step */
  private prevKind: Surface['kind'] = 'terrain';

  // ground
  onGround = false;
  /** 1 while the takeoff / landing law flies the jet, fading to 0 after it hands over */
  private gearLawFade = 0;
  groundPitch = 0;
  surfaceKind: Surface['kind'] = 'terrain';
  surfaceField: Surface['field'] = null;
  groundHeight = 0;

  // status
  crashed = false;
  crashCause = '';
  hardLanding = 0;
  /** incremented on every touchdown; details of the last one */
  touchdowns = 0;
  lastTouchdown = { sink: 0, tas: 0, bank: 0, pitch: 0, x: 0, z: 0, heading: 0 };
  overG = 0;
  structuralFailure = false;
  stallWarning = false;
  readonly damage: FmDamage = { thrust: [1, 1], lift: 1, rollBias: 0, control: 1, drag: 0, pitchBias: 0 };

  constructor(readonly spec: AircraftSpec) {
    this.fuelInternal = spec.internalFuel;
    this.rpm = new Array(spec.engines).fill(0.75);
    this.ab = new Array(spec.engines).fill(0);
    this.abDelay = new Array(spec.engines).fill(0);
    this.engineOut = new Array(spec.engines).fill(false);
  }

  get mass(): number {
    return this.spec.emptyMass + this.fuelInternal + this.fuelExternal + this.storeMass + this.ammoMass + 180 * this.spec.crew;
  }

  get fuelTotal(): number {
    return this.fuelInternal + this.fuelExternal;
  }

  get afterburner(): number {
    let s = 0;
    for (const a of this.ab) s += a;
    return s / this.ab.length;
  }

  get altitudeFt(): number {
    return this.pos.y / FT;
  }

  setStores(stores: StoreType[], externalFuel: number): void {
    let m = 0,
      cd = 0;
    for (const s of stores) {
      m += STORES[s].mass;
      cd += STORES[s].dragCd;
    }
    this.storeMass = m;
    this.storeCd = cd;
    this.fuelExternalCap = externalFuel;
  }

  /** Place the aircraft in flight. */
  setAirborne(pos: THREE.Vector3, headingDeg: number, speed: number, pitchDeg = 0): void {
    this.pos.copy(pos);
    _euler.set(pitchDeg * DEG, -headingDeg * DEG, 0, 'YXZ');
    this.quat.setFromEuler(_euler);
    this.updateAxes();
    this.vel.copy(this.fwd).multiplyScalar(speed);
    this.onGround = false;
    this.releaseCat();
    this.trap = null;
    this.hookDown = false;
    this.deckN = null;
    this.gearPos = 0;
    this.crashed = false;
    for (let i = 0; i < this.rpm.length; i++) this.rpm[i] = 0.85;
    this.throttleLever = 0.85;
    this.alpha = 0;
    this.resetRates(1);
  }

  /** Park on the ground (runway start). */
  setOnGround(pos: THREE.Vector3, headingDeg: number): void {
    groundSurface(pos.x, pos.z, _surf);
    this.pos.set(pos.x, _surf.h + this.spec.gear.height, pos.z);
    this.heading = headingDeg;
    this.groundPitch = 0;
    this.releaseCat();
    this.trap = null;
    this.hookDown = false;
    this.surfaceKind = this.prevKind = _surf.kind;
    this.surfaceField = _surf.field;
    this.deckN = _surf.kind === 'deck' ? { x: _surf.nx ?? 0, z: _surf.nz ?? 0 } : null;
    this.buildGroundQuat();
    this.vel.set(_surf.vx ?? 0, _surf.vy ?? 0, _surf.vz ?? 0);
    this.onGround = true;
    this.gearPos = 1;
    this.crashed = false;
    for (let i = 0; i < this.rpm.length; i++) this.rpm[i] = 0.2;
    this.throttleLever = 0;
  }

  private resetRates(n: number): void {
    this.pRate = 0;
    this.qRate = 0;
    this.rRate = 0;
    this.defl.e = this.defl.a = this.defl.r = 0;
    this.dCmd.e = this.dCmd.a = this.dCmd.r = 0;
    this.nCmdF = n;
    this.departed = false;
  }

  private buildGroundQuat(): void {
    _euler.set(this.groundPitch * DEG, -this.heading * DEG, 0, 'YXZ');
    this.quat.setFromEuler(_euler);
    // on a carrier the jet sits on the pitching, rolling deck
    if (this.deckN) {
      _nrm.set(this.deckN.x, 1, this.deckN.z).normalize();
      _qTilt.setFromUnitVectors(_yUp, _nrm);
      this.quat.premultiply(_qTilt);
    }
    this.updateAxes();
  }

  /** Hook up to catapult `idx` of a carrier: the jet sits on the shuttle, holding. */
  attachCat(c: Carrier, idx: number): void {
    this.releaseCat();
    this.cat = { carrier: c, idx, phase: 'hold', t: 0, s: 0, v: 0, a: 0 };
    c.catBusy[idx] = this;
    this.trap = null;
    this.hookDown = false;
    this.placeOnCat(0);
    this.onGround = true;
    this.gearPos = 1;
    this.crashed = false;
  }

  /** Let go of the catapult (launched, or moved off it). */
  releaseCat(): void {
    const k = this.cat;
    if (!k) return;
    if (k.carrier.catBusy[k.idx] === this) k.carrier.catBusy[k.idx] = null;
    this.cat = null;
  }

  /** Put the jet on its catapult, `s` metres down the stroke, nose wheel on the shuttle. */
  private placeOnCat(s: number): void {
    const k = this.cat!;
    const cv = k.carrier;
    const cat = cv.layout.cats[k.idx];
    const off = cat.off * DEG;
    const su = cat.u + Math.cos(off) * s, sv = cat.v + Math.sin(off) * s;
    this.heading = cv.catHeading(k.idx);
    const hr = this.heading * DEG;
    const nose = Math.abs(this.spec.gear.nose);
    cv.toWorld(su, sv, _cw);
    const x = _cw.x - Math.sin(hr) * nose, z = _cw.z + Math.cos(hr) * nose;
    groundSurface(x, z, _surf);
    const h = _surf.kind === 'deck' ? _surf.h : cv.deckY(su, sv);
    this.pos.set(x, h + this.spec.gear.height, z);
    this.surfaceKind = this.prevKind = 'deck';
    this.surfaceField = cv.f;
    this.groundHeight = h;
    this.deckN = { x: _surf.nx ?? 0, z: _surf.nz ?? 0 };
    this.buildGroundQuat();
  }

  updateAxes(): void {
    this.fwd.set(0, 0, -1).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
  }

  // -------------------------------------------------------------------------
  // Aerodynamic model
  // -------------------------------------------------------------------------

  private clAlphaAt(M: number): number {
    const s = this.spec;
    if (M < 1.05) return s.clAlpha * (1 + 0.25 * smoothstep(0.3, 0.95, M));
    const sup = Math.min(1, 1.2 / Math.sqrt(M * M - 1));
    return s.clAlpha * 1.25 * sup;
  }

  private clMaxEff(M: number): number {
    const s = this.spec;
    let c = s.clMax * this.damage.lift;
    c *= 1 + 0.12 * this.gearPos;
    c *= 1 - 0.28 * smoothstep(0.85, 1.35, M);
    return c;
  }

  clOf(alpha: number, M: number): number {
    const a = this.clAlphaAt(M);
    const cmax = this.clMaxEff(M);
    if (alpha >= 0) {
      const lin = cmax * Math.tanh((a * alpha) / cmax);
      // mild post-stall loss beyond the AoA limit
      const post = smoothstep(this.spec.alphaMaxDeg * DEG + 0.08, this.spec.alphaMaxDeg * DEG + 0.5, alpha);
      return lin * (1 - 0.45 * post);
    }
    const nmax = cmax * 0.75;
    return -nmax * Math.tanh((a * -alpha) / nmax);
  }

  alphaForCl(cl: number, M: number): number {
    const a = this.clAlphaAt(M);
    const cmax = this.clMaxEff(M);
    if (cl >= 0) {
      const r = Math.min(cl / cmax, 0.995);
      return (Math.atanh(r) * cmax) / a;
    }
    const nmax = cmax * 0.75;
    const r = Math.min(-cl / nmax, 0.995);
    return (-Math.atanh(r) * nmax) / a;
  }

  cdOf(cl: number, M: number): number {
    const s = this.spec;
    let wave = 1;
    if (M > 0.78) {
      if (M < 1.1) wave = 1 + (s.waveDragPeak - 1) * smoothstep(0.78, 1.1, M);
      else wave = s.waveDragPeak + (s.waveDragHigh - s.waveDragPeak) * smoothstep(1.1, s.maxMach, M);
    }
    let cd0 = s.cd0 * wave;
    // limit-Mach barrier (inlet / structural limit) so the jet tops out at its spec
    const over = M - (s.maxMach - 0.04);
    if (over > 0) cd0 += 0.9 * over * over + 0.05 * over;
    // past the rated top speed the inlets and structure say no, whatever the thrust
    const beyond = M - s.maxMach;
    if (beyond > 0) cd0 += 6 * beyond * beyond + 0.3 * beyond;
    // max-IAS (dynamic pressure) limit: keeps sea-level dashes realistic
    const casKts = this.cas / 0.514444;
    const iasOver = casKts - (s.maxIasKts - 25);
    if (iasOver > 0) cd0 += 0.00004 * iasOver * iasOver;
    // stores (pylons, fins, tanks) add their own drag rise through the transonic
    cd0 += this.storeCd * (1 + 0.4 * smoothstep(0.85, 1.15, M));
    cd0 += 0.028 * this.gearPos + s.speedbrakeCd * this.speedbrakePos + this.damage.drag;
    const k = s.kInduced * (M > 1 ? 1 + 0.9 * (M - 1) : 1);
    return cd0 + k * cl * cl;
  }

  // -------------------------------------------------------------------------
  // Propulsion
  // -------------------------------------------------------------------------

  private engineThrust(i: number, alt: number, M: number, atm: AtmoState): { t: number; ff: number } {
    const s = this.spec;
    if (this.engineOut[i]) return { t: 0, ff: 0 };
    const sig = atm.sigma;
    let lapse: number;
    if (alt <= 11000) lapse = Math.pow(sig, 0.75);
    else {
      const s11 = 0.2971;
      lapse = Math.pow(s11, 0.75) * Math.pow(sig / s11, 1.1);
    }
    const ceil = s.ceilingFt * FT;
    lapse *= 1 - 0.75 * smoothstep(ceil - 2500, ceil + 1500, alt);
    const machCut = 1 - smoothstep(s.maxMach + 0.05, s.maxMach + 0.4, M);
    const mil = s.thrustMil * lapse * Math.max(0.3, 1 + 0.18 * M - 0.12 * M * M) * machCut;
    const abT = s.thrustAb * lapse * (1 + s.ramFactor * Math.min(M, s.maxMach)) * (1 + (s.ramjetGain ?? 0) * smoothstep(1.0, 3.1, M)) * machCut;
    const idle = 0.05 * mil;
    const rpm = this.rpm[i];
    const dry = idle + (mil - idle) * Math.pow(rpm, 1.6);
    const ab = this.ab[i];
    const t = (dry + ab * Math.max(0, abT - dry)) * this.damage.thrust[i];
    const tsfc = lerp(s.tsfcMil * (1 + 0.25 * (1 - rpm)), s.tsfcAb, ab);
    const ff = t * tsfc * 2.8325e-5;
    return { t, ff };
  }

  // -------------------------------------------------------------------------
  // Step
  // -------------------------------------------------------------------------

  step(dt: number, c: FlightControls): void {
    if (this.crashed) return;
    const s = this.spec;
    const alt = this.pos.y;
    atmosphere(alt, _atm);
    this.rho = _atm.rho;
    this.soundSpeed = _atm.a;

    // --- engines ---
    const lever = clamp(c.throttle, 0, 1.1);
    this.throttleLever = lever;
    const fuelOk = this.fuelTotal > 0;
    let thrust = 0,
      ff = 0;
    const M0 = this.tas / _atm.a;
    for (let i = 0; i < this.rpm.length; i++) {
      const target = fuelOk && !this.engineOut[i] ? Math.min(lever, 1) : 0;
      // thin air: less mass flow through the core, so the engines spool more slowly up high
      const thin = 0.55 + 0.45 * Math.sqrt(_atm.sigma);
      const k = (target > this.rpm[i] ? s.spool * (0.55 + 0.45 * this.rpm[i]) : s.spool * 1.3) * thin;
      this.rpm[i] += (target - this.rpm[i]) * Math.min(1, k * dt);
      const abTarget = lever > 1.001 && fuelOk && !this.engineOut[i] && this.rpm[i] > 0.9 ? clamp((lever - 1) / 0.1, 0.2, 1) : 0;
      if (abTarget > 0 && this.ab[i] === 0) {
        this.abDelay[i] += dt;
        if (this.abDelay[i] > 0.35) this.ab[i] = 0.05;
      } else if (abTarget === 0) {
        this.abDelay[i] = 0;
        this.ab[i] = Math.max(0, this.ab[i] - dt * 3);
      } else {
        this.ab[i] += (abTarget - this.ab[i]) * Math.min(1, 3 * dt);
      }
      const e = this.engineThrust(i, alt, M0, _atm);
      this.engThrust[i] = e.t;
      thrust += e.t;
      ff += e.ff;
    }
    this.thrust = thrust;
    this.fuelFlow = ff;
    let burn = ff * dt;
    if (this.fuelExternal > 0) {
      const b = Math.min(this.fuelExternal, burn);
      this.fuelExternal -= b;
      burn -= b;
    }
    this.fuelInternal = Math.max(0, this.fuelInternal - burn);

    // --- config surfaces ---
    const gearTarget = c.gearDown || this.onGround ? 1 : 0;
    this.gearPos += clamp(gearTarget - this.gearPos, -dt / 5, dt / 5);
    const sbTarget = c.speedbrake ? 1 : 0;
    this.speedbrakePos += clamp(sbTarget - this.speedbrakePos, -dt / 1.5, dt / 1.5);
    this.gOverrideActive = c.gOverride;

    if (this.onGround) this.stepGround(dt, c);
    else this.stepAir(dt, c);
    this.carrierChecks();
    this.computeAttitude();
  }

  private stepAir(dt: number, c: FlightControls): void {
    const s = this.spec;
    const A = AERO[s.type];
    const m = this.mass;
    const W = m * G0;
    this.t += dt;

    // --- air mass: the aircraft flies through the wind, not the ground ---
    windAt(this.pos.x, this.pos.y, this.pos.z, this.t, this.agl, this.groundHeight, this.windVel);
    // another jet's wake: the downwash between its trailing vortices and its jet wash
    this.windVel.y += this.wakeGust;
    _air.copy(this.vel).sub(this.windVel);
    this.gs = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
    const V = _air.length();
    this.tas = V;
    const M = V / this.soundSpeed;
    this.mach = M;
    this.qbar = 0.5 * this.rho * V * V;
    this.cas = casFromTas(V, this.pos.y);
    const qS = this.qbar * s.wingArea;
    const b = s.span;
    const cbar = s.wingArea / s.span;

    // aero angles from the relative wind in body axes
    _qInv.copy(this.quat).invert();
    _vb.copy(_air).applyQuaternion(_qInv);
    this.alpha = Math.atan2(-_vb.y, -_vb.z);
    this.beta = V > 1 ? Math.asin(clamp(_vb.x / V, -1, 1)) : 0;
    const alpha = this.alpha;
    const beta = this.beta;
    if (V > 1) _vhat.copy(_air).divideScalar(V);
    else _vhat.copy(this.fwd);

    // lift & side directions (perpendicular to the relative wind)
    _lift.crossVectors(this.right, _vhat);
    if (_lift.lengthSq() < 1e-8) _lift.copy(this.up);
    _lift.normalize();
    _side.crossVectors(_tmp.copy(this.up).negate(), _vhat);
    if (_side.lengthSq() < 1e-8) _side.copy(this.right);
    _side.normalize();

    // ground effect: more lift, less induced drag within a span of the ground
    const ge = Math.pow(1 - clamp(this.agl / b, 0, 1), 2);
    const cl = this.clOf(alpha, M) * (1 + 0.14 * ge);
    const cdi = this.cdOf(cl, M) - this.cdOf(0, M);
    // flying sideways costs energy: sideslip drag grows with the square of beta
    const cd = this.cdOf(0, M) + cdi * (1 - 0.45 * ge) + 0.35 * Math.abs(Math.sin(alpha)) * smoothstep(0.35, 0.9, Math.abs(alpha)) + 0.55 * beta * beta;
    this.cl = cl;
    this.cd = cd;
    const L = qS * cl;
    const D = qS * cd;
    const Y = qS * A.cyB * beta;

    _acc.set(0, 0, 0);
    _acc.addScaledVector(_lift, L);
    _acc.addScaledVector(_vhat, -D);
    _acc.addScaledVector(this.right, Y);
    _acc.addScaledVector(this.fwd, this.thrust - this.gunRecoil);
    _acc.divideScalar(m);
    _acc.y -= G0;
    this.accel.copy(_acc);

    // pilot-felt load factor
    _tmp.copy(_acc);
    _tmp.y += G0;
    this.nz = _tmp.dot(this.up) / G0;
    this.ny = _tmp.dot(this.right) / G0;

    // --- moments of inertia: fuel and wing stores change them ---
    const mScale = m / A.refMass;
    const Ixx = A.ixx * mScale + this.storeRollInertia;
    const Iyy = A.iyy * mScale;
    const Izz = A.izz * mScale + this.storeRollInertia;

    // --- natural aerodynamic moments (coefficients) ---
    const Veff = Math.max(V, 30);
    const P = this.pRate, Q = this.qRate, R = this.rRate;
    const phat = (P * b) / (2 * Veff), qhat = (Q * cbar) / (2 * Veff), rhat = (R * b) / (2 * Veff);
    const sup = smoothstep(0.88, 1.3, M);
    const aMax = s.alphaMaxDeg * DEG;
    // pitch: static stability (aerodynamic centre moves aft when supersonic), damping, pitch-up past the stall
    const cmA = A.cmA - 0.85 * sup;
    const aPu = aMax + 6 * DEG;
    // the Flanker's lifting body pitches up far more gently past the stall
    const kPu = s.tvcDeg > 0 ? 0.45 : 1.6;
    const pitchUp = kPu * Math.max(0, alpha - aPu) * Math.max(0, alpha - aPu);
    const cmNat = A.cm0 + cmA * alpha + A.cmQ * qhat + pitchUp + (this.damage.pitchBias ?? 0);
    // roll: damping, dihedral effect (grows with AoA), yaw-rate roll, wing rock past the stall
    const over = smoothstep(aMax, aMax + 14 * DEG, alpha);
    const rock = over * 0.018 * Math.sin(this.t * 2.6 + this.rockPhase) * (0.6 + 0.4 * Math.sin(this.t * 0.7));
    const clNat = A.clP * phat + (A.clB - 0.25 * Math.max(0, alpha)) * beta + A.clR * rhat + rock + this.damage.rollBias * 0.02;
    // yaw: weathercock stability fades at high AoA and when supersonic (it can go unstable deep in the stall)
    const cnB = A.cnB * (1 - 0.45 * sup) * (1 - 1.45 * over);
    // asymmetric thrust (an engine out, or damage) yaws toward the dead engine
    let asym = 0;
    if (s.engines === 2) asym = (this.engThrust[0] - this.engThrust[1]) * A.engineArm;
    const cnNat = cnB * beta + A.cnR * rhat + A.cnP * phat + asym / Math.max(qS * b, 1);

    // --- control effectiveness (dynamic pressure is applied through qS) ---
    const ctl = this.damage.control;
    const eEff = A.cmD * (1 - 0.3 * smoothstep(0.85, 1.05, M) * (1 - smoothstep(1.05, 1.4, M))) * (1 - 0.35 * sup) * ctl;
    const aEff = A.clD * (1 - 0.35 * sup) * (1 - 0.5 * smoothstep(20 * DEG, 40 * DEG, Math.abs(alpha))) * ctl;
    const rEff = A.cnD * (1 - 0.3 * sup) * (1 - 0.6 * smoothstep(25 * DEG, 45 * DEG, Math.abs(alpha))) * ctl;
    const kPitch = qS * cbar, kRoll = qS * b, kYaw = qS * b;
    // thrust vectoring: the nozzles move with the tail surfaces, so their
    // moment adds straight to the control power, and it does not fade with
    // airspeed. That is what lets the Su-35S point its nose at 60-70 deg AoA
    // or turn at near-zero speed.
    const tvc = s.tvcDeg * DEG;
    const T = Math.max(0, this.thrust) * ctl;
    const tvcPitch = T * Math.sin(tvc) * 7.0;
    // 2D nozzles (F-22) cannot yaw, but they deflect differentially (one up,
    // one down) to roll the jet, which is what keeps it controllable post-stall
    const tvcYaw = s.tvcPitchOnly ? 0 : T * Math.sin(tvc) * 7.0 * 0.8;
    const tvcRoll = T * Math.sin(tvc) * A.engineArm * (s.tvcPitchOnly ? 0.8 : 0.5);
    const powE = eEff * kPitch + tvcPitch;
    const powA = aEff * kRoll + tvcRoll;
    const powR = rEff * kYaw + tvcYaw;

    // --- fly-by-wire: commands in, surface deflections out (dynamic inversion) ---
    const gMax = c.gOverride ? s.gOverride : s.gLimit;
    const gamma = Math.asin(clamp(_vhat.y, -1, 1));
    const nNeutral = Math.cos(gamma) * Math.cos(this.bank * DEG);
    const stick = clamp(c.pitch, -1, 1);
    let nCmd = stick >= 0 ? lerp(nNeutral, gMax, stick) : lerp(nNeutral, s.gNeg, -stick);
    nCmd = clamp(nCmd, s.gNeg, gMax);
    // G onset is rate-limited by the control laws (about 12 G/s pulling)
    const onset = nCmd > this.nCmdF ? 12 * (1 - 0.8 * this.gearLawFade) : 20;
    this.nCmdF += clamp(nCmd - this.nCmdF, -onset * dt, onset * dt);
    const clReq = (this.nCmdF * W) / Math.max(qS, 1);
    // TVC jets: the paddle switch opens the post-stall manoeuvring envelope
    const aLim = c.gOverride ? (tvc > 0 ? (s.tvcAlphaMaxDeg ?? 70) * DEG : aMax * 1.12) : aMax;
    const alphaCmd = clamp(this.alphaForCl(clReq, M), -12 * DEG, aLim);
    this.stallWarning = (alphaCmd >= aLim * 0.97 && stick > 0.3) || alpha > aLim;

    // pitch: rate needed to follow the flight path plus to close the AoA error
    const wPath = _acc.dot(_lift) / Veff;
    // the laws only know a nominal airframe (no damage, gusts, stall pitch-up
    // or engine asymmetry): those are corrected through feedback, with lag
    // (the Su-35S's KSU-35 does model the post-stall pitch-up: it flies there on purpose)
    const cmModel = A.cm0 + cmA * alpha + A.cmQ * qhat + (tvc > 0 ? pitchUp : 0);
    // gain schedule: loop bandwidth follows the pitch acceleration available
    const qAccMax = powE / Iyy;
    const wn = clamp(Math.sqrt(qAccMax / 0.35), 0.9, 5.5);
    const kQ = 1.6 * wn;
    const kA = wn / 1.6;
    const qMax = s.pitchRate * DEG * 1.6 * (tvc > 0 && c.gOverride ? 1.25 : 1);
    let qDes = wPath + clamp((alphaCmd - alpha) * kA, -qMax, qMax);
    // takeoff & landing law (gear down, slow): like the real jets' powered-approach
    // mode, the stick commands a gentle pitch rate and the jet holds its attitude
    // hands-off, with a soft AoA limit. Lifting off with the stick still held back
    // no longer snaps the nose up to the AoA limit.
    const casKts = this.cas / 0.5144;
    const wGear = this.gearPos > 0.5 ? 1 - smoothstep(280, 320, casKts) : 0;
    if (wGear > 0) {
      const aLimG = Math.min(aLim, 16 * DEG);
      let qG = stick * 7 * DEG;
      qG = Math.min(qG, wPath + (aLimG - alpha) * kA);
      qG = Math.max(qG, wPath + (-6 * DEG - alpha) * kA);
      // a climb-out attitude of about 20 degrees at most while the gear is down
      const pitchNow = Math.asin(clamp(this.fwd.y, -1, 1));
      qG = Math.min(qG, (20 * DEG - pitchNow) * 0.9);
      qDes = lerp(qDes, qG, wGear);
      // keep the G command in step so handing back to the normal law is seamless
      this.nCmdF = lerp(this.nCmdF, clamp(this.nz, s.gNeg, gMax), wGear);
      if (wGear > 0.5) this.stallWarning = alpha > aLimG + 3 * DEG;
    }
    // for a few seconds after the takeoff law hands over, G builds gently
    this.gearLawFade = wGear > 0.5 ? 1 : Math.max(0, this.gearLawFade - dt / 3);
    const qDotDes = (qDes - Q) * kQ;
    const cmReq = (qDotDes * Iyy - (Izz - Ixx) * P * R) / Math.max(kPitch, 1);
    this.dCmd.e = clamp(((cmReq - cmModel) * kPitch) / Math.max(powE, 1), -1, 1);

    // roll: stick commands roll rate about the velocity vector
    let pMax = s.rollRate * DEG * (1 - (tvc > 0 ? 0.3 : 0.55) * smoothstep(15 * DEG, 38 * DEG, Math.abs(alpha)));
    if (M > 1.3) pMax *= 0.8;
    const pStab = clamp(c.roll, -1, 1) * pMax;
    const pDes = pStab * Math.cos(alpha);
    const pAccMax = powA / Ixx;
    const pDotDes = (pDes - P) * clamp(pAccMax / 1.2, 1.5, 9);
    const clModel = A.clP * phat + (A.clB - 0.25 * Math.max(0, alpha)) * beta + A.clR * rhat;
    const clReqR = (pDotDes * Ixx - (Iyy - Izz) * Q * R) / Math.max(kRoll, 1);
    this.dCmd.a = clamp(((clReqR - clModel) * kRoll) / Math.max(powA, 1), -1, 1);

    // yaw: pedals command sideslip; otherwise the laws coordinate the turn (beta -> 0)
    const betaMax = 7 * DEG * clamp(14000 / Math.max(this.qbar, 1), 0.2, 1);
    // right pedal yaws the nose right: the relative wind then comes from the left (beta < 0)
    const betaCmd = -clamp(c.yaw, -1, 1) * betaMax;
    const aSide = _acc.dot(this.right);
    const rAccMax = powR / Izz;
    const kR = clamp(rAccMax / 0.5, 1, 6);
    const betaDotDes = (betaCmd - beta) * Math.min(2.4, kR * 0.4);
    const cosA = Math.max(0.2, Math.cos(alpha));
    const rDes = (P * Math.sin(alpha) + aSide / Veff - betaDotDes) / cosA;
    const rDotDes = (rDes - R) * kR;
    const cnReq = (rDotDes * Izz - (Ixx - Iyy) * P * Q) / Math.max(kYaw, 1);
    // aileron adverse yaw is modelled; asymmetric thrust is not (the pilot / feedback trims it)
    const cnModel = cnB * beta + A.cnR * rhat + A.cnP * phat + A.cnDa * this.defl.a;
    this.dCmd.r = clamp(((cnReq - cnModel) * kYaw) / Math.max(powR, 1), -1, 1);

    // actuators: rate limited
    this.defl.e += clamp(this.dCmd.e - this.defl.e, -A.rateE * dt, A.rateE * dt);
    this.defl.a += clamp(this.dCmd.a - this.defl.a, -A.rateA * dt, A.rateA * dt);
    this.defl.r += clamp(this.dCmd.r - this.defl.r, -A.rateR * dt, A.rateR * dt);

    // --- rigid-body rotation (Euler's equations, body axes) ---
    const Mp = (cmNat + eEff * this.defl.e) * kPitch + tvcPitch * this.defl.e;
    const Lr = (clNat + aEff * this.defl.a) * kRoll + tvcRoll * this.defl.a;
    const Ny = (cnNat + rEff * this.defl.r + A.cnDa * this.defl.a) * kYaw + tvcYaw * this.defl.r;
    this.nozzle.p = tvc * this.defl.e;
    this.nozzle.y = s.tvcPitchOnly ? 0 : tvc * this.defl.r;
    this.nozzle.roll = tvc * this.defl.a;
    // turbulence: a gust gradient across the span rolls the wings
    const gustRoll = clamp((this.windVel.y - this.lastGustY) / Math.max(dt, 1e-4), -40, 40) * 0.025;
    this.lastGustY = this.windVel.y;
    const Pdot = (Lr + (Iyy - Izz) * Q * R) / Ixx + gustRoll + this.wakeRoll;
    const Qdot = (Mp + (Izz - Ixx) * P * R) / Iyy;
    const Rdot = (Ny + (Ixx - Iyy) * P * Q) / Izz;
    this.pRate += Pdot * dt;
    this.qRate += Qdot * dt;
    this.rRate += Rdot * dt;
    // sanity clamp (departed tumbling still stays bounded)
    this.pRate = clamp(this.pRate, -8, 8);
    this.qRate = clamp(this.qRate, -3, 3);
    this.rRate = clamp(this.rRate, -3, 3);

    // integrate translation
    this.vel.addScaledVector(_acc, dt);
    this.pos.addScaledVector(this.vel, dt);

    // integrate rotation: world angular velocity = P fwd + Q right + R down
    const wx = this.fwd.x * this.pRate + this.right.x * this.qRate - this.up.x * this.rRate;
    const wy = this.fwd.y * this.pRate + this.right.y * this.qRate - this.up.y * this.rRate;
    const wz = this.fwd.z * this.pRate + this.right.z * this.qRate - this.up.z * this.rRate;
    const wl = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (wl > 1e-9) {
      _tmp.set(wx / wl, wy / wl, wz / wl);
      _dq.setFromAxisAngle(_tmp, wl * dt);
      this.quat.premultiply(_dq).normalize();
    }
    this.updateAxes();

    this.pitchRate = this.qRate / DEG;
    this.yawRate = this.rRate / DEG;
    this.rollRate = this.pRate / DEG;
    this.vs = this.vel.y;
    this.departed = alpha > (tvc > 0 && c.gOverride ? 75 * DEG : aMax + 12 * DEG) || Math.abs(beta) > 20 * DEG;

    // --- structure ---
    // over-stress both ways: past the override limit pulling, or well past the
    // negative limit pushing (the structure is much weaker in negative G)
    const nz = this.nz;
    if (nz > s.gOverride + 0.4) this.overG += (nz - s.gOverride) * dt;
    const negLim = s.gNeg - 1.5;
    if (nz < negLim) this.overG += (negLim - nz) * dt;
    if (nz > s.gStructural || nz < s.gNeg * 2) this.structuralFailure = true;

    // --- ground contact ---
    groundSurface(this.pos.x, this.pos.z, _surf);
    this.groundHeight = _surf.h;
    this.surfaceKind = _surf.kind;
    this.surfaceField = _surf.field;
    this.agl = this.pos.y - _surf.h;
    this.checkContact(c);
  }

  private checkContact(c: FlightControls): void {
    const s = this.spec;
    const gh = s.gear.height;
    // wingtips (banked low-level turns) and the fuselage belly
    const halfSpan = s.span / 2;
    const tipDrop = Math.abs(this.right.y) * halfSpan;
    const bellyClear = this.agl - gh * 0.55 * Math.max(0.2, this.up.y);
    const tipClear = this.agl - tipDrop - 0.4;
    const gearClear = this.agl - gh * Math.max(0.3, this.up.y);
    if (gearClear > 0 && tipClear > 0 && bellyClear > 0) return;

    const pitchDeg = this.pitchAngle;
    const bankDeg = Math.abs(this.bank);
    const deck = this.surfaceKind === 'deck';
    // on a deck the sink rate counts against the deck rising and falling
    const sink = -(this.vel.y - (deck ? _surf.vy ?? 0 : 0));
    const solid = this.surfaceKind !== 'water';
    const gearDown = this.gearPos > 0.95;
    // flying into the ship below deck level: the round-down at the stern, or the hull
    if (deck && this.agl < -1.6) {
      this.crashed = true;
      this.crashCause = 'RAMP STRIKE';
      return;
    }
    // carrier landing gear takes a firm, no-flare arrival (up to about 1,600 fpm)
    const maxSink = deck ? 8.5 : 6;
    if (gearDown && solid && sink < maxSink && bankDeg < 18 && pitchDeg > -6 && pitchDeg < 20 && tipClear > -0.5) {
      // touchdown
      this.onGround = true;
      if (sink > 3.5) this.hardLanding = sink;
      this.touchdowns++;
      const td = this.lastTouchdown;
      td.sink = sink;
      td.tas = this.tas; // airspeed over the threshold, not ground speed
      td.bank = bankDeg;
      td.pitch = pitchDeg;
      td.x = this.pos.x;
      td.z = this.pos.z;
      td.heading = this.headingFromFwd();
      this.heading = this.headingFromFwd();
      this.groundPitch = Math.max(0, pitchDeg);
      const hRad = this.heading * DEG;
      const fx = Math.sin(hRad), fz = -Math.cos(hRad);
      // keep the speed along the heading, relative to whatever we landed on
      const svx = deck ? _surf.vx ?? 0 : 0, svz = deck ? _surf.vz ?? 0 : 0;
      const V = (this.vel.x - svx) * fx + (this.vel.z - svz) * fz;
      this.vel.set(fx * V + svx, deck ? _surf.vy ?? 0 : 0, fz * V + svz);
      this.pos.y = this.groundHeight + gh;
      this.deckN = deck ? { x: _surf.nx ?? 0, z: _surf.nz ?? 0 } : null;
      this.prevKind = this.surfaceKind;
      // a hook down on the landing area: it is looking for a wire
      this.boltering = deck && this.hookDown;
      this.lastTrap.sink = sink;
      this.buildGroundQuat();
      return;
    }
    this.crashed = true;
    if (this.surfaceKind === 'water') this.crashCause = 'IMPACTED THE SEA';
    else if (!gearDown && sink < 6 && bankDeg < 20) this.crashCause = 'GEAR-UP LANDING';
    else if (tipClear <= 0 && bankDeg > 25) this.crashCause = 'WINGTIP STRIKE';
    else this.crashCause = 'CONTROLLED FLIGHT INTO TERRAIN';
  }

  private headingFromFwd(): number {
    const h = (Math.atan2(this.fwd.x, -this.fwd.z) * 180) / Math.PI;
    return h < 0 ? h + 360 : h;
  }

  private stepGround(dt: number, c: FlightControls): void {
    const s = this.spec;
    const m = this.mass;
    const W = m * G0;
    if (this.cat) {
      this.stepCatapult(dt, c);
      return;
    }
    groundSurface(this.pos.x, this.pos.z, _surf);
    const wasDeck = this.prevKind === 'deck';
    this.groundHeight = _surf.h;
    this.surfaceKind = _surf.kind;
    this.surfaceField = _surf.field;
    this.prevKind = _surf.kind;
    this.deckN = _surf.kind === 'deck' ? { x: _surf.nx ?? 0, z: _surf.nz ?? 0 } : null;
    // what we stand on may move (a carrier deck): work relative to it
    const svx = _surf.vx ?? 0, svz = _surf.vz ?? 0, svy = _surf.vy ?? 0;

    const hRad = this.heading * DEG;
    const fx = Math.sin(hRad), fz = -Math.cos(hRad);
    let V = (this.vel.x - svx) * fx + (this.vel.z - svz) * fz; // speed along heading over the surface (can be slightly negative)
    // the wings feel the air, not the runway: a headwind gives lift and drag
    // before the wheels roll, so into the wind you lift off and stop shorter
    // (on a carrier the ship's own 30 knots is wind over the deck too)
    this.t += dt;
    windAt(this.pos.x, this.pos.y, this.pos.z, this.t, s.gear.height, _surf.h, this.windVel);
    const head = -(this.windVel.x * fx + this.windVel.z * fz);
    const surfAlong = svx * fx + svz * fz;
    const Va = V + surfAlong + head;
    this.gs = Math.abs(V);
    this.tas = Math.abs(Va);
    this.mach = this.tas / this.soundSpeed;
    this.qbar = 0.5 * this.rho * Va * Va;
    this.cas = casFromTas(this.tas, this.pos.y);
    const qS = this.qbar * s.wingArea;
    this.alpha = this.groundPitch * DEG;
    this.beta = 0;
    const cl = this.clOf(this.alpha + 1.5 * DEG, this.mach);
    const L = qS * cl;
    const D = qS * this.cdOf(cl, this.mach);
    this.cl = cl;

    if (_surf.kind === 'water') {
      // off the edge of a flight deck: fast enough, and the jet flies away
      // (a catapult shot, a bolter, a touch-and-go); too slow, and it falls
      if (wasDeck && Va > s.rotateKts * KT * 0.72) {
        this.onGround = false;
        this.deckN = null;
        this.vel.set(fx * V + svx, Math.max(0, svy) + 0.6, fz * V + svz);
        this.groundPitch = Math.max(this.groundPitch, 4);
        this.buildGroundQuat();
        this.qRate = 4 * DEG;
        this.nCmdF = 1.2;
        this.trap = null;
        if (this.boltering) {
          this.boltering = false;
          this.bolters++;
        }
        return;
      }
      this.crashed = true;
      this.crashCause = wasDeck ? 'WENT OVER THE SIDE OF THE CARRIER' : 'RAN OFF INTO THE SEA';
      return;
    }

    const normal = Math.max(0, W - L);
    const rough = _surf.kind === 'terrain';
    const muRoll = rough ? 0.09 : 0.022;
    // on a carrier deck at idle the plane captain has you on the brakes (no rolling about a pitching deck)
    const deckHold = _surf.kind === 'deck' && !this.trap && this.throttleLever < 0.25 && Math.abs(V) < 12 ? 1 : 0;
    const brake = clamp(Math.max(c.wheelBrake, deckHold), 0, 1) * (rough ? 0.35 : 0.55);
    const fric = (muRoll + brake) * normal;
    const thrustH = this.thrust * Math.cos(this.alpha);
    // drag acts along the relative wind (a tailwind pushes, a headwind holds back)
    let a = (thrustH - Math.sign(Va) * D) / m;
    const fdec = fric / m;
    const tr = this.trap;
    if (tr) {
      // in the wire: the arresting engine stops the jet whatever the throttle
      if (tr.phase === 'arrest') {
        V = Math.max(0, V - tr.decel * dt);
        if (V <= 0) {
          tr.phase = 'rollback';
          tr.t = 0;
        }
      } else {
        // the wire pulls the jet back a little, then drops off the hook
        tr.t += dt;
        V = -1.4 * Math.max(0, 1 - tr.t / 0.8);
        if (tr.t > 0.8) {
          V = 0;
          this.trap = null;
          this.hookDown = false;
        }
      }
    } else {
      if (Math.abs(V) < fdec * dt && Math.abs(a) < fdec) {
        V = 0;
        a = 0;
      } else {
        a -= Math.sign(V || a) * fdec;
      }
      V += a * dt;
      if (V < -3) V = -3;
    }

    // nose-wheel steering (tiller at taxi speed, rudder-pedal authority at speed)
    const steerMax = lerp(55, 6, smoothstep(5, 45, Math.abs(V))) * DEG;
    const steer = -clamp(c.yaw, -1, 1) * steerMax * (this.groundPitch > 3 ? 0.1 : 1);
    const wheelbase = Math.abs(s.gear.main - s.gear.nose);
    const yawRate = tr ? 0 : (V * Math.tan(-steer)) / wheelbase; // rad/s, right positive
    // rudder aerodynamic yaw at speed
    const rudderYaw = tr ? 0 : clamp(c.yaw, -1, 1) * 0.08 * smoothstep(20, 60, Math.abs(Va));
    // a parked jet turns with the ship under it
    this.heading = (this.heading + (yawRate + rudderYaw + (_surf.yawRate ?? 0)) * dt / DEG + 360) % 360;

    // rotation: elevator authority builds with speed
    const vr = s.rotateKts * 0.5144;
    const auth = smoothstep(0.62 * vr, 0.95 * vr, Math.abs(Va));
    const pitchTarget = c.pitch > 0 && !tr ? c.pitch * 12 * auth : 0;
    const gp0 = this.groundPitch;
    // the nose comes up smoothly: the rotation eases in and out rather than stepping
    const rotRate = clamp((pitchTarget - this.groundPitch) * 1.6, -5, 3.5);
    this.groundPitch += rotRate * dt;
    if (this.groundPitch < 0) this.groundPitch = 0;
    const groundQ = ((this.groundPitch - gp0) / Math.max(dt, 1e-4)) * DEG;

    const h2 = this.heading * DEG;
    const nfx = Math.sin(h2), nfz = -Math.cos(h2);
    this.vel.set(nfx * V + svx, svy, nfz * V + svz);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = _surf.h + s.gear.height;
    this.buildGroundQuat();
    this.agl = s.gear.height;
    this.nz = 1;
    this.vs = 0;
    this.resetRates(1);
    this.rollRate = 0;
    this.pitchRate = 0;
    this.stallWarning = false;

    // lift-off
    if (L > W * 1.02 && this.groundPitch > 2 && !tr) {
      this.onGround = false;
      this.deckN = null;
      const climb = 1.2;
      const f = this.fwd;
      this.vel.set(f.x * V + svx, climb + Math.max(0, svy), f.z * V + svz);
      this.pos.y += 0.05;
      // carry the rotation into the air (no jump in pitch rate at the moment of lift-off)
      this.qRate = Math.max(0, groundQ);
      this.nCmdF = 1;
      if (this.boltering) {
        // touched down hook-down, missed every wire and flew off: a bolter
        this.boltering = false;
        this.bolters++;
      }
    }
    // collapsing the gear by retracting on the ground is prevented; rough terrain at speed damages
    if (rough && Math.abs(V) > 70) {
      this.crashed = true;
      this.crashCause = 'RAN OFF THE RUNWAY AT SPEED';
    }
  }

  /** On the catapult: hold at full power for the salute, then the shot down the stroke. */
  private stepCatapult(dt: number, c: FlightControls): void {
    const k = this.cat!;
    const cv = k.carrier;
    const cat = cv.layout.cats[k.idx];
    const s = this.spec;
    const m = this.mass;
    this.t += dt;
    if (k.phase === 'hold') {
      // run up to full power (MIL or burner), salute, and the shooter fires
      let rpm = 0;
      for (const r of this.rpm) rpm += r;
      rpm /= this.rpm.length;
      if (c.throttle >= 0.99 && rpm > 0.93) k.t += dt;
      else k.t = Math.max(0, k.t - dt * 2);
      if (k.t >= CAT_SALUTE) {
        k.phase = 'stroke';
        k.s = 0;
        k.v = 0;
        // the shooter sets the shot for the jet: end speed through the air of
        // about 15% over its rotation speed (wind over the deck helps)
        const hr = cv.catHeading(k.idx) * DEG;
        windAt(this.pos.x, this.pos.y, this.pos.z, this.t, s.gear.height, this.groundHeight, this.windVel);
        const wod = cv.vx * Math.sin(hr) - cv.vz * Math.cos(hr) - (this.windVel.x * Math.sin(hr) - this.windVel.z * Math.cos(hr));
        const endAir = Math.max(s.rotateKts * 1.22 + 15, 140) * KT;
        const endDeck = clamp(endAir - wod, 45, 88);
        k.a = (endDeck * endDeck) / (2 * cat.stroke);
        this.catShots++;
      }
      this.placeOnCat(0);
    } else {
      // down the stroke: the catapult plus the engines
      k.v += (k.a + (this.thrust - 0.022 * m * G0) / m) * dt;
      k.s += k.v * dt;
      // the jet's own trim brings the nose up over the last stretch
      this.groundPitch = smoothstep(cat.stroke * 0.6, cat.stroke, k.s) * 10;
      this.placeOnCat(Math.min(k.s, cat.stroke));
      if (k.s >= cat.stroke) {
        this.releaseCat();
        // off the bow: flying (the next step finds open water under the wheels)
        this.prevKind = 'deck';
      }
    }
    // speed: along the catapult relative to the deck, plus the deck's own motion
    groundSurface(this.pos.x, this.pos.z, _surf);
    const V = k.phase === 'stroke' ? k.v : 0;
    const hr = this.heading * DEG;
    this.vel.set(Math.sin(hr) * V + (_surf.vx ?? cv.vx), _surf.vy ?? 0, -Math.cos(hr) * V + (_surf.vz ?? cv.vz));
    windAt(this.pos.x, this.pos.y, this.pos.z, this.t, s.gear.height, this.groundHeight, this.windVel);
    _air.copy(this.vel).sub(this.windVel);
    this.tas = _air.length();
    this.gs = Math.abs(V);
    this.mach = this.tas / this.soundSpeed;
    this.qbar = 0.5 * this.rho * this.tas * this.tas;
    this.cas = casFromTas(this.tas, this.pos.y);
    this.alpha = this.groundPitch * DEG;
    this.agl = s.gear.height;
    this.nz = k.phase === 'stroke' ? 1 + k.a / G0 : 1;
    this.vs = 0;
    this.resetRates(1);
    this.rollRate = this.pitchRate = 0;
    this.stallWarning = false;
  }

  /**
   * Near a carrier: the tailhook (catches a wire as it crosses it on the
   * landing area) and the island (fly into it and that is that).
   */
  private carrierChecks(): void {
    if (!CARRIERS.length || this.crashed) return;
    let near: Carrier | null = null;
    for (const cv of CARRIERS) {
      const dx = this.pos.x - cv.x, dz = this.pos.z - cv.z;
      if (dx * dx + dz * dz < 420 * 420) {
        near = cv;
        break;
      }
    }
    if (!near) {
      this.hookPrev = null;
      return;
    }
    near.toLocal(this.pos.x, this.pos.z, _cl);
    // the island
    const isl = near.layout.island;
    if (near.onIsland(_cl.u, _cl.v) && this.pos.y < near.deckY(_cl.u, _cl.v) + isl[4]) {
      this.crashed = true;
      this.crashCause = 'FLEW INTO THE CARRIER\'S ISLAND';
      return;
    }
    // the hook point trails behind the main gear
    const back = this.spec.gear.main + HOOK_AFT;
    const hx = this.pos.x - this.fwd.x * back, hz = this.pos.z - this.fwd.z * back;
    near.toLocal(hx, hz, _cl);
    const ax = near.landingAxis(_cl.u, _cl.v);
    const prev = this.hookPrev && this.hookPrev.c === near ? this.hookPrev.s : null;
    this.hookPrev = { c: near, s: ax.s };
    if (!this.hookDown || this.trap || prev === null) return;
    // only with the wheels on the deck, or the hook all but touching it
    const hookAgl = this.pos.y - this.spec.gear.height - near.deckY(_cl.u, _cl.v);
    if (!this.onGround && hookAgl > 1.2) return;
    if (Math.abs(ax.lat) > LANDING_HALF_WIDTH) return;
    const wires = near.layout.wires;
    for (let i = 0; i < wires.length; i++) {
      if (prev < wires[i] && ax.s >= wires[i]) {
        // caught: the arresting engine runs the jet out in about 90 m
        if (!this.onGround) {
          this.onGround = true;
          groundSurface(this.pos.x, this.pos.z, _surf);
          this.pos.y = _surf.h + this.spec.gear.height;
          this.prevKind = 'deck';
        }
        const hr = this.heading * DEG;
        const V = (this.vel.x - (_surf.vx ?? near.vx)) * Math.sin(hr) - (this.vel.z - (_surf.vz ?? near.vz)) * Math.cos(hr);
        this.trap = { carrier: near, wire: i + 1, phase: 'arrest', decel: clamp((V * V) / (2 * TRAP_RUNOUT), 15, 45), t: 0 };
        this.boltering = false;
        this.traps++;
        const sink = this.lastTrap.sink;
        const target = wires.length >= 4 ? 3 : 2;
        this.lastTrap.wire = i + 1;
        this.lastTrap.grade = sink > 7 ? 'HARD' : i + 1 === target ? (sink < 5 ? 'OK' : 'FAIR') : Math.abs(i + 1 - target) === 1 ? 'FAIR' : 'NO GRADE';
        return;
      }
    }
  }

  private computeAttitude(): void {
    const f = this.fwd;
    this.pitchAngle = Math.asin(clamp(f.y, -1, 1)) / DEG;
    this.heading = this.headingFromFwd();
    // bank: angle of right wing below horizon around the forward axis
    const horizRight = _tmp.set(-f.z, 0, f.x);
    if (horizRight.lengthSq() < 1e-9) horizRight.set(1, 0, 0);
    horizRight.normalize();
    const upH = _tmp2.crossVectors(horizRight, f).normalize();
    this.bank = Math.atan2(-this.right.y, this.up.dot(upH)) / DEG;
    const V = this.vel.length();
    this.gamma = V > 1 ? Math.asin(clamp(this.vel.y / V, -1, 1)) / DEG : 0;
  }

  /** Current weight / thrust ratio etc. for the HUD. */
  get thrustToWeight(): number {
    return this.thrust / (this.mass * G0);
  }
}
