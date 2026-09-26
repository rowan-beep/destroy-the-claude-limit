// Flight dynamics for the three fighters.
//
// Translational motion is fully force based (lift, drag, thrust, side force,
// gravity) so energy management is real: pulling G bleeds speed, climbing
// trades speed for height, and top speed / ceiling emerge from thrust vs.
// drag at altitude. Rotation follows the fly-by-wire control laws of these
// jets: the stick commands load factor (limited by the G limiter and the AoA
// limiter), roll rate about the velocity vector, and sideslip via rudder.
// The FBW holds 1G-corrected flight path with the stick released.

import * as THREE from 'three';
import { AircraftSpec, STORES, StoreType } from './specs';
import { atmosphere, AtmoState, casFromTas } from '../core/atmosphere';
import { G0, DEG, FT } from '../core/constants';
import { clamp, smoothstep, lerp } from '../core/math';
import { groundSurface, Surface } from '../world/ground';

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
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

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
  // rates (deg/s)
  rollRate = 0;
  pitchRate = 0;
  yawRate = 0;
  private pRate = 0; // rad/s about stability axis

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

  // ground
  onGround = false;
  groundPitch = 0;
  surfaceKind: Surface['kind'] = 'terrain';
  surfaceField: Surface['field'] = null;
  groundHeight = 0;

  // status
  crashed = false;
  crashCause = '';
  hardLanding = 0;
  overG = 0;
  structuralFailure = false;
  stallWarning = false;
  readonly damage: FmDamage = { thrust: [1, 1], lift: 1, rollBias: 0, control: 1, drag: 0 };

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
    this.gearPos = 0;
    this.crashed = false;
    for (let i = 0; i < this.rpm.length; i++) this.rpm[i] = 0.85;
    this.throttleLever = 0.85;
    this.alpha = 0;
  }

  /** Park on the ground (runway start). */
  setOnGround(pos: THREE.Vector3, headingDeg: number): void {
    groundSurface(pos.x, pos.z, _surf);
    this.pos.set(pos.x, _surf.h + this.spec.gear.height, pos.z);
    this.heading = headingDeg;
    this.groundPitch = 0;
    this.buildGroundQuat();
    this.vel.set(0, 0, 0);
    this.onGround = true;
    this.gearPos = 1;
    this.crashed = false;
    for (let i = 0; i < this.rpm.length; i++) this.rpm[i] = 0.2;
    this.throttleLever = 0;
  }

  private buildGroundQuat(): void {
    _euler.set(this.groundPitch * DEG, -this.heading * DEG, 0, 'YXZ');
    this.quat.setFromEuler(_euler);
    this.updateAxes();
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
    // max-IAS (dynamic pressure) limit: keeps sea-level dashes realistic
    const casKts = this.cas / 0.514444;
    const iasOver = casKts - (s.maxIasKts - 25);
    if (iasOver > 0) cd0 += 0.00004 * iasOver * iasOver;
    cd0 += this.storeCd * (M > 1 ? 1.4 : 1);
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
    const abT = s.thrustAb * lapse * (1 + s.ramFactor * Math.min(M, s.maxMach)) * machCut;
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
      const k = target > this.rpm[i] ? s.spool * (0.55 + 0.45 * this.rpm[i]) : s.spool * 1.3;
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
    this.computeAttitude();
  }

  private stepAir(dt: number, c: FlightControls): void {
    const s = this.spec;
    const m = this.mass;
    const W = m * G0;
    const V = this.vel.length();
    this.tas = V;
    const M = V / this.soundSpeed;
    this.mach = M;
    this.qbar = 0.5 * this.rho * V * V;
    this.cas = casFromTas(V, this.pos.y);
    const qS = this.qbar * s.wingArea;

    // aero angles
    _qInv.copy(this.quat).invert();
    _vb.copy(this.vel).applyQuaternion(_qInv);
    this.alpha = Math.atan2(-_vb.y, -_vb.z);
    this.beta = V > 1 ? Math.asin(clamp(_vb.x / V, -1, 1)) : 0;
    if (V > 1) _vhat.copy(this.vel).divideScalar(V);
    else _vhat.copy(this.fwd);

    // lift & side directions (perpendicular to velocity)
    _lift.crossVectors(this.right, _vhat);
    if (_lift.lengthSq() < 1e-8) _lift.copy(this.up);
    _lift.normalize();
    _side.crossVectors(_tmp.copy(this.up).negate(), _vhat);
    if (_side.lengthSq() < 1e-8) _side.copy(this.right);
    _side.normalize();

    const cl = this.clOf(this.alpha, M);
    const cd = this.cdOf(cl, M) + 0.35 * Math.abs(Math.sin(this.alpha)) * smoothstep(0.35, 0.9, Math.abs(this.alpha));
    this.cl = cl;
    this.cd = cd;
    const L = qS * cl;
    const D = qS * cd;
    const Y = -qS * 0.9 * this.beta;

    _acc.set(0, 0, 0);
    _acc.addScaledVector(_lift, L);
    _acc.addScaledVector(_vhat, -D);
    _acc.addScaledVector(this.right, Y);
    _acc.addScaledVector(this.fwd, this.thrust);
    _acc.divideScalar(m);
    _acc.y -= G0;
    this.accel.copy(_acc);

    // pilot-felt load factor
    _tmp.copy(_acc);
    _tmp.y += G0;
    this.nz = _tmp.dot(this.up) / G0;
    this.ny = _tmp.dot(this.right) / G0;

    // --- fly-by-wire control laws ---
    const ctl = this.damage.control;
    const gMax = c.gOverride ? s.gOverride : s.gLimit;
    const gamma = Math.asin(clamp(_vhat.y, -1, 1));
    const bankC = Math.cos(this.bank * DEG);
    const nNeutral = Math.cos(gamma) * bankC;
    const p = clamp(c.pitch, -1, 1);
    let nCmd = p >= 0 ? lerp(nNeutral, gMax, p) : lerp(nNeutral, s.gNeg, -p);
    nCmd = clamp(nCmd, s.gNeg, gMax);
    const clReq = (nCmd * W) / Math.max(qS, 1);
    let alphaCmd = this.alphaForCl(clReq, M);
    const aMax = s.alphaMaxDeg * DEG;
    alphaCmd = clamp(alphaCmd, -12 * DEG, aMax);
    this.stallWarning = alphaCmd >= aMax * 0.98 && p > 0.3;

    const authority = clamp(this.qbar / 9000, 0.2, 1) * ctl;
    const alphaRateMax = s.pitchRate * DEG * 1.6 * authority;
    const alphaDot = clamp((alphaCmd - this.alpha) / 0.16, -alphaRateMax, alphaRateMax);

    const Veff = Math.max(V, 25);
    const wPath = _acc.dot(_lift) / Veff;
    const wSide = _acc.dot(_side) / Veff;
    let qRate = wPath + alphaDot;

    // rudder / sideslip
    const betaMax = 7 * DEG * clamp(14000 / Math.max(this.qbar, 1), 0.2, 1);
    const betaCmd = -clamp(c.yaw, -1, 1) * betaMax;
    const betaDot = clamp((betaCmd - this.beta) / 0.35, -0.6, 0.6);
    const rRate = wSide - betaDot;

    // roll about the velocity vector
    let pMax = s.rollRate * DEG * clamp(this.qbar / 11000, 0.12, 1) * ctl;
    pMax *= 1 - 0.55 * smoothstep(15 * DEG, 38 * DEG, Math.abs(this.alpha));
    if (M > 1.3) pMax *= 0.8;
    const pCmd = clamp(c.roll, -1, 1) * pMax + this.damage.rollBias;
    this.pRate += (pCmd - this.pRate) * Math.min(1, dt / 0.11);

    // integrate translation
    this.vel.addScaledVector(_acc, dt);
    this.pos.addScaledVector(this.vel, dt);

    // integrate rotation (world-frame angular velocity)
    const stab = _tmp2.copy(this.fwd).lerp(_vhat, clamp(V / 60, 0, 1)).normalize();
    const wx = this.right.x * qRate - this.up.x * rRate + stab.x * this.pRate;
    const wy = this.right.y * qRate - this.up.y * rRate + stab.y * this.pRate;
    const wz = this.right.z * qRate - this.up.z * rRate + stab.z * this.pRate;
    const wl = Math.sqrt(wx * wx + wy * wy + wz * wz);
    if (wl > 1e-9) {
      const ang = wl * dt;
      _tmp.set(wx / wl, wy / wl, wz / wl);
      _dq.setFromAxisAngle(_tmp, ang);
      this.quat.premultiply(_dq).normalize();
    }
    this.updateAxes();

    this.pitchRate = qRate / DEG;
    this.yawRate = rRate / DEG;
    this.rollRate = this.pRate / DEG;
    this.vs = this.vel.y;

    // --- structure ---
    const absN = this.nz;
    if (absN > s.gOverride + 0.4) this.overG += (absN - s.gOverride) * dt;
    if (absN > s.gStructural) this.structuralFailure = true;

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
    const sink = -this.vel.y;
    const solid = this.surfaceKind !== 'water';
    const gearDown = this.gearPos > 0.95;
    if (gearDown && solid && sink < 6 && bankDeg < 18 && pitchDeg > -6 && pitchDeg < 20 && tipClear > -0.5) {
      // touchdown
      this.onGround = true;
      if (sink > 3.5) this.hardLanding = sink;
      const hv = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
      this.heading = this.headingFromFwd();
      this.groundPitch = Math.max(0, pitchDeg);
      const hRad = this.heading * DEG;
      this.vel.set(Math.sin(hRad) * hv, 0, -Math.cos(hRad) * hv);
      this.pos.y = this.groundHeight + gh;
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
    groundSurface(this.pos.x, this.pos.z, _surf);
    this.groundHeight = _surf.h;
    this.surfaceKind = _surf.kind;
    this.surfaceField = _surf.field;

    const hRad = this.heading * DEG;
    const fx = Math.sin(hRad), fz = -Math.cos(hRad);
    let V = this.vel.x * fx + this.vel.z * fz; // along heading (can be slightly negative)
    this.tas = Math.abs(V);
    this.mach = this.tas / this.soundSpeed;
    this.qbar = 0.5 * this.rho * V * V;
    this.cas = this.tas;
    const qS = this.qbar * s.wingArea;
    this.alpha = this.groundPitch * DEG;
    this.beta = 0;
    const cl = this.clOf(this.alpha + 1.5 * DEG, this.mach);
    const L = qS * cl;
    const D = qS * this.cdOf(cl, this.mach);
    this.cl = cl;

    if (_surf.kind === 'water') {
      this.crashed = true;
      this.crashCause = 'RAN OFF INTO THE SEA';
      return;
    }

    const normal = Math.max(0, W - L);
    const rough = _surf.kind === 'terrain';
    const muRoll = rough ? 0.09 : 0.022;
    const brake = clamp(c.wheelBrake, 0, 1) * (rough ? 0.35 : 0.55);
    const fric = (muRoll + brake) * normal;
    const thrustH = this.thrust * Math.cos(this.alpha);
    let a = (thrustH - D) / m;
    const fdec = fric / m;
    if (Math.abs(V) < fdec * dt && Math.abs(a) < fdec) {
      V = 0;
      a = 0;
    } else {
      a -= Math.sign(V || a) * fdec;
    }
    V += a * dt;
    if (V < -3) V = -3;

    // nose-wheel steering (tiller at taxi speed, rudder-pedal authority at speed)
    const steerMax = lerp(55, 6, smoothstep(5, 45, Math.abs(V))) * DEG;
    const steer = -clamp(c.yaw, -1, 1) * steerMax * (this.groundPitch > 3 ? 0.1 : 1);
    const wheelbase = Math.abs(s.gear.main - s.gear.nose);
    const yawRate = (V * Math.tan(-steer)) / wheelbase; // rad/s, right positive
    // rudder aerodynamic yaw at speed
    const rudderYaw = clamp(c.yaw, -1, 1) * 0.08 * smoothstep(20, 60, Math.abs(V));
    this.heading = (this.heading + (yawRate + rudderYaw) * dt / DEG + 360) % 360;

    // rotation: elevator authority builds with speed
    const vr = s.rotateKts * 0.5144;
    const auth = smoothstep(0.62 * vr, 0.95 * vr, Math.abs(V));
    const pitchTarget = c.pitch > 0 ? c.pitch * 14 * auth : 0;
    this.groundPitch += clamp(pitchTarget - this.groundPitch, -5 * dt, 4.5 * dt);
    if (this.groundPitch < 0) this.groundPitch = 0;

    const h2 = this.heading * DEG;
    this.vel.set(Math.sin(h2) * V, 0, -Math.cos(h2) * V);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y = _surf.h + s.gear.height;
    this.buildGroundQuat();
    this.agl = s.gear.height;
    this.nz = 1;
    this.vs = 0;
    this.pRate = 0;
    this.rollRate = 0;
    this.pitchRate = 0;
    this.stallWarning = false;

    // lift-off
    if (L > W * 1.02 && this.groundPitch > 2) {
      this.onGround = false;
      const climb = 1.2;
      const f = this.fwd;
      this.vel.set(f.x * V, climb, f.z * V);
      this.pos.y += 0.05;
    }
    // collapsing the gear by retracting on the ground is prevented; rough terrain at speed damages
    if (rough && Math.abs(V) > 70) {
      this.crashed = true;
      this.crashCause = 'RAN OFF THE RUNWAY AT SPEED';
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
