// Low-level autopilot used by AI pilots (and the mouse-aim instructor):
// turns a desired flight direction into stick, rudder and throttle using
// the same fly-by-wire flight model the player flies.
//
// It works on the lift vector: work out the acceleration needed to rotate
// the velocity toward the goal, add gravity compensation, roll the lift
// vector onto it and pull the required G (capped).

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import { G0, DEG, KT } from '../core/constants';
import { clamp } from '../core/math';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _aTurn = new THREE.Vector3();
const _gPerp = new THREE.Vector3();
const _L = new THREE.Vector3();
const _upPerp = new THREE.Vector3();
const _cross = new THREE.Vector3();

export interface SteerOptions {
  /** max G to pull */
  gCap: number;
  /** time constant for closing the angle (s): smaller = more aggressive */
  tau?: number;
  /** max bank (deg) for gentle flight; undefined = unlimited */
  maxBank?: number;
  /** allow negative G pushes instead of rolling inverted */
  allowPush?: boolean;
  /** roll aggressiveness 0..1 */
  rollGain?: number;
  /** use the G-limiter override */
  override?: boolean;
  /** rudder input to add (scissors, jinks) */
  rudder?: number;
}

export interface SteerResult {
  angleOff: number;
  bankError: number;
  gReq: number;
}

/** Fly the velocity vector toward a world direction. */
export function steerToward(ac: Aircraft, dirWorld: THREE.Vector3, opt: SteerOptions): SteerResult {
  const fm = ac.fm;
  const c = ac.controls;
  const V = Math.max(fm.vel.length(), 30);
  _v.copy(fm.vel).divideScalar(V);
  _d.copy(dirWorld).normalize();
  const cosA = clamp(_v.dot(_d), -1, 1);
  const angle = Math.acos(cosA);

  // desired turn acceleration
  _aTurn.copy(_d).addScaledVector(_v, -cosA);
  const pl = _aTurn.length();
  if (pl > 1e-6) _aTurn.divideScalar(pl);
  else if (cosA < 0) _aTurn.copy(fm.up); // straight behind: pull through the lift vector
  else _aTurn.set(0, 0, 0);
  // slow jets roll lazily (little airflow over the surfaces): ask for gentler
  // corrections so the lift vector never has to swing faster than it can
  const tau = (opt.tau ?? 1.2) * clamp(128 / Math.max(fm.cas, 1), 1, 2.2);
  const maxTurnRate = (opt.gCap * G0) / V;
  const turnRate = Math.min(angle / tau, maxTurnRate);
  _aTurn.multiplyScalar(turnRate * V);

  // Fine aim: for the last few degrees don't bank the lift vector sideways
  // (as the nose sweeps through the target the required bank would flip from
  // one side to the other, and a real roll response can't follow -- the jet
  // would rock wing over wing). Fade the lateral demand out and let the
  // rudder make small heading corrections with the wings steady.
  _upPerp.copy(fm.up).addScaledVector(_v, -fm.up.dot(_v)).normalize();
  _cross.crossVectors(_v, _upPerp).normalize(); // lateral (right) direction
  const w = smoothstepAbs(0.05, 0.2, angle);
  const lat = _aTurn.dot(_cross);
  _aTurn.addScaledVector(_cross, -lat * (1 - w));
  const latAngle = Math.asin(clamp(_d.dot(_cross), -1, 1));
  const autoRudder = clamp(latAngle / (2.5 * DEG), -1, 1) * (1 - w) * 0.7;

  // gravity component perpendicular to velocity
  _gPerp.set(0, -G0, 0);
  _gPerp.addScaledVector(_v, -_gPerp.dot(_v));
  _L.copy(_aTurn).sub(_gPerp); // required lift acceleration
  let gReq = _L.length() / G0;

  // current lift direction (body up projected perpendicular to velocity)
  _upPerp.copy(fm.up).addScaledVector(_v, -fm.up.dot(_v)).normalize();
  const Ldir = _L.clone().normalize();
  // signed bank error about the velocity vector (+ = need to roll right;
  // a right roll is a positive rotation about the direction of flight)
  _cross.crossVectors(_upPerp, Ldir);
  const bankErr = Math.atan2(_cross.dot(_v), clamp(_upPerp.dot(Ldir), -1, 1));

  const liftAlongUp = _L.dot(_upPerp) / G0;
  let nCmd: number;
  let rollCmd: number;
  // small correction below the nose: push with the wings level instead of rolling inverted
  const pushSmall = liftAlongUp < 0 && angle < 25 * DEG && Math.abs(fm.bank) < 100;
  if ((opt.allowPush ?? true) && ((Math.abs(bankErr) > 110 * DEG && gReq < 1.6) || pushSmall)) {
    // small push instead of rolling inverted
    nCmd = clamp(liftAlongUp, -2, opt.gCap);
    rollCmd = 0;
    // keep current bank but gently level the wings
    rollCmd = clamp(-fm.bank * DEG * 0.8, -0.4, 0.4);
  } else {
    let desiredBankErr = bankErr;
    let bankLimited = false;
    if (opt.maxBank !== undefined) {
      const newBank = fm.bank * DEG + bankErr;
      const lim = opt.maxBank * DEG;
      const clamped = clamp(newBank, -lim, lim);
      desiredBankErr = clamped - fm.bank * DEG;
      bankLimited = Math.abs(clamped - newBank) > 1e-3;
    }
    // Ask the flight controls for a roll rate proportional to the bank error
    // (first-order roll-in / roll-out). The stick maps linearly to commanded
    // roll rate, so size it by the FBW's rate limit; the jet's own roll lag
    // then settles without rocking back and forth.
    const pMax = ac.spec.rollRate * DEG * (1 - 0.55 * smoothstepAbs(15 * DEG, 38 * DEG, fm.alpha));
    const tauBank = (0.32 * clamp(128 / Math.max(fm.cas, 1), 1, 1.6)) / (opt.rollGain ?? 1);
    const pDes = clamp(desiredBankErr / tauBank, -pMax, pMax);
    rollCmd = clamp(pDes / pMax, -1, 1);
    // unload to roll: with the lift vector far from where it's needed, ease
    // the G off so the AoA drops and the jet can roll quickly, then pull
    const align = 1 - smoothstepAbs(12 * DEG, 45 * DEG, bankErr);
    nCmd = gReq * align + (1 - align) * Math.min(gReq, 1.5);
    if (align < 0) nCmd = Math.min(nCmd, 1.2);
    if (bankLimited) {
      // bank is capped short of the lift direction: only pull what holds the
      // wanted vertical path at this bank, or the extra lift just climbs
      const vert = _L.y / G0; // required lift along world up (per G)
      const cb = Math.max(0.3, Math.cos(fm.bank * DEG));
      nCmd = Math.min(nCmd, Math.max(0.3, vert / cb));
    }
  }
  gReq = Math.min(gReq, opt.gCap);
  nCmd = clamp(nCmd, -2.5, opt.gCap);

  // convert commanded G into stick position through the FBW law
  const s = ac.spec;
  const gMaxFbw = opt.override ? s.gOverride : s.gLimit;
  const gamma = Math.asin(clamp(_v.y, -1, 1));
  const nNeutral = Math.cos(gamma) * Math.cos(fm.bank * DEG);
  let pitch: number;
  if (nCmd >= nNeutral) pitch = (nCmd - nNeutral) / Math.max(0.2, gMaxFbw - nNeutral);
  else pitch = -(nNeutral - nCmd) / Math.max(0.2, nNeutral - s.gNeg);
  c.pitch = clamp(pitch, -1, 1);
  c.roll = rollCmd;
  c.yaw = clamp((opt.rudder ?? 0) + autoRudder, -1, 1);
  c.gOverride = !!opt.override;
  return { angleOff: angle, bankError: bankErr, gReq };
}

function smoothstepAbs(a: number, b: number, x: number): number {
  const t = clamp((Math.abs(x) - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Throttle / afterburner / speedbrake to hold a calibrated airspeed. */
export function holdSpeed(ac: Aircraft, casTarget: number, abAllowed: boolean, dt: number): void {
  const fm = ac.fm;
  const err = casTarget - fm.cas;
  const c = ac.controls;
  let thr = 0.8 + err * 0.018 - fm.vs * 0.002;
  if (abAllowed && err > 30) thr = 1.1;
  else if (abAllowed && err > 12 && fm.throttleLever > 1) thr = 1.05;
  else thr = clamp(thr, 0.05, 1.0);
  c.throttle += clamp(thr - c.throttle, -dt * 1.5, dt * 1.5);
  c.speedbrake = err < -60;
}

/** Aim the nose (not the velocity) at a point: used for gun tracking. */
export function noseAngleTo(ac: Aircraft, p: THREE.Vector3): number {
  _d.subVectors(p, ac.fm.pos).normalize();
  return Math.acos(clamp(_d.dot(ac.fm.fwd), -1, 1));
}

export const KTS = KT;
