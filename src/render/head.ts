// The pilot's head in the cockpit view. Instead of a camera bolted to the
// airframe, the eyes sit on a sprung, damped neck that reacts to what the body
// feels:
//
//  - G pushes the head down into the seat, lateral G sways it, afterburner and
//    speedbrake push it back and forward; the neck overshoots a little and
//    settles, so G onset and snap rolls are felt rather than just seen
//  - the head lags the airframe's angular accelerations (a snap roll leaves it
//    behind for a moment)
//  - hands off the look controls, the pilot keeps the horizon a little more
//    level than the jet (the optokinetic neck reflex real pilots have), glances
//    up into a hard turn, and leads a roll with the eyes
//  - engine rumble, afterburner, the runway, stall and transonic buffet and
//    the gun all shake the view, each with its own texture
//
// Everything is computed in the airframe's body axes and returned as an eye
// offset plus a small extra head rotation.

import * as THREE from 'three';
import type { FlightModel } from '../aircraft/flightModel';
import { DEG, G0 } from '../core/constants';
import { clamp, smoothstep } from '../core/math';

const _f = new THREE.Vector3();

/** smooth pseudo-random signal in [-1, 1] (sum of incommensurate sines) */
function rumble(t: number, f: number, seed: number): number {
  return (Math.sin(t * f + seed) * 0.5 + Math.sin(t * f * 1.73 + seed * 2.1) * 0.3 + Math.sin(t * f * 2.91 + seed * 3.7) * 0.2);
}

class Spring {
  x = 0;
  v = 0;
  constructor(
    private w: number,
    private zeta: number,
  ) {}
  step(target: number, dt: number): number {
    // semi-implicit Euler, sub-stepped for stiffness at low frame rates
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.w * this.w * (target - this.x) - 2 * this.zeta * this.w * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  reset(): void {
    this.x = this.v = 0;
  }
}

export interface HeadPose {
  /** eye offset in body axes (m): x right, y up, z forward */
  right: number;
  up: number;
  fwd: number;
  /** extra head rotation (rad), applied after the look angles */
  pitch: number;
  yaw: number;
  roll: number;
}

export class HeadModel {
  private sx = new Spring(9, 0.38);
  private sy = new Spring(8, 0.42);
  private sz = new Spring(7, 0.45);
  private sPitch = new Spring(6, 0.6);
  private sYaw = new Spring(6, 0.6);
  private sRoll = new Spring(5, 0.55);
  private t = 0;
  private lastP = 0;
  private lastQ = 0;
  private pose: HeadPose = { right: 0, up: 0, fwd: 0, pitch: 0, yaw: 0, roll: 0 };
  /** 0..1: how strongly the head motion is applied (a setting) */
  strength = 1;

  reset(): void {
    for (const s of [this.sx, this.sy, this.sz, this.sPitch, this.sYaw, this.sRoll]) s.reset();
    this.lastP = this.lastQ = 0;
  }

  update(dt: number, fm: FlightModel, freeLook: boolean, gunFiring: boolean): HeadPose {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const k = this.strength;
    // what the body feels (specific force), in body axes, in G
    _f.copy(fm.accel);
    _f.y += G0;
    const gx = _f.dot(fm.right) / G0;
    const gy = fm.onGround ? 1 : _f.dot(fm.up) / G0;
    const gz = _f.dot(fm.fwd) / G0;
    // translation: G sinks the head into the seat, lateral G sways it, surges push it fore and aft
    const tUp = -clamp((gy - 1) * 0.011, -0.05, 0.085);
    const tRight = -clamp(gx * 0.035, -0.06, 0.06);
    const tFwd = -clamp(gz * 0.022, -0.035, 0.035);
    // rotational inertia: the head lags the airframe's angular accelerations
    const pDot = dt > 0 ? (fm.pRate - this.lastP) / dt : 0;
    const qDot = dt > 0 ? (fm.qRate - this.lastQ) / dt : 0;
    this.lastP = fm.pRate;
    this.lastQ = fm.qRate;
    let tRoll = -clamp(pDot * 0.012, -0.09, 0.09);
    let tPitch = -clamp(qDot * 0.01, -0.05, 0.05);
    let tYaw = 0;
    if (!freeLook && !fm.onGround) {
      // keep the horizon a little more level than the jet (up to ~9 degrees)
      tRoll += clamp(Math.sin(fm.bank * DEG) * 0.16, -9 * DEG, 9 * DEG) * smoothstep(0, 20, Math.abs(fm.bank));
      // glance up into a hard turn, and lead a roll with the eyes
      tPitch += clamp((gy - 2.2) * 1.6 * DEG, 0, 7 * DEG);
      tYaw -= clamp(fm.pRate * 0.05, -6 * DEG, 6 * DEG);
    }
    // vibration: engine, afterburner, runway, buffet near the AoA limit, transonic, the gun
    const t = this.t;
    const thr = clamp(fm.rpm.reduce((a, b) => a + b, 0) / Math.max(1, fm.rpm.length), 0, 1.1);
    const buffet = smoothstep(14 * DEG, 24 * DEG, Math.abs(fm.alpha)) + smoothstep(0.9, 0.98, fm.mach) * (1 - smoothstep(1.02, 1.12, fm.mach)) * 0.5;
    const runway = fm.onGround ? clamp(fm.gs / 70, 0, 1) : 0;
    const vib =
      0.00022 * thr * rumble(t, 95, 1) +
      0.0009 * fm.afterburner * rumble(t, 41, 2) +
      0.0035 * runway * rumble(t, 23, 3) +
      0.0045 * buffet * rumble(t, 17, 4) +
      (gunFiring ? 0.0028 * rumble(t, 110, 5) : 0);
    const vib2 = 0.8 * (0.0035 * runway * rumble(t, 19, 7) + 0.004 * buffet * rumble(t, 13, 8) + (gunFiring ? 0.002 * rumble(t, 97, 9) : 0));

    const p = this.pose;
    p.right = this.sx.step(tRight * k, dt) + vib2 * 3 * k;
    p.up = this.sy.step(tUp * k, dt) + vib * 4 * k;
    p.fwd = this.sz.step(tFwd * k, dt);
    p.pitch = this.sPitch.step(tPitch * k, dt) + vib * k;
    p.yaw = this.sYaw.step(tYaw * k, dt) + vib2 * k;
    p.roll = this.sRoll.step(tRoll * k, dt) + vib2 * 0.6 * k;
    return p;
  }
}
