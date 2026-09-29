// Guided bomb flight (JDAM, SDB, Paveway IV, Hammer, KAB-500S).
//
// A bomb is a point mass with drag and a limited amount of lift from its tail
// fins or wings. After release it falls clear for a moment, then the guidance
// kit takes over in two phases:
//
//  - GLIDE: while the target is further away than the bomb can reach in a
//    straight line, it flies its best glide angle (the lift-to-drag sweet
//    spot) toward the target, stretching the range.
//  - TERMINAL: once the target is below that glide line it has energy to
//    spare and dives onto the coordinates with proportional navigation,
//    steepening at the end so it comes down almost vertically.
//
// The same step function runs the real bomb and the fast-time prediction the
// HUD uses for the release cue (in range? how long until it is? time of fall).

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Sim } from '../game/sim';
import type { GroundUnit } from '../game/ground';
import { BombSpec, BombType, BOMBS } from './weaponSpecs';
import { atmosphere, AtmoState } from '../core/atmosphere';
import { G0, DEG } from '../core/constants';
import { smoothstep } from '../core/math';
import { terrainHeight } from '../world/terrain';

const _atm: AtmoState = { T: 0, p: 0, rho: 0, a: 0, sigma: 0, delta: 0 };
const _to = new THREE.Vector3();
const _vh = new THREE.Vector3();
const _des = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _perp = new THREE.Vector3();

/** Seconds after release before the fins unlock and guidance starts. */
const SEPARATION = 0.7;

export interface BombState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  terminal: boolean;
}

/** Best glide angle below the horizon (rad) for this bomb. */
function bestGlide(s: BombSpec): number {
  // lift at 1/sqrt(2) of the maximum, drag doubled by induced drag: max L/D
  const ld = (s.liftArea * Math.SQRT1_2) / (s.dragArea * 2);
  return Math.atan(1 / Math.max(0.5, ld));
}

/**
 * Advance one bomb by dt. Returns true when it reaches the ground (the state
 * is left at the impact point).
 */
export function stepBomb(s: BombSpec, st: BombState, target: THREE.Vector3, dt: number): boolean {
  st.age += dt;
  const pos = st.pos;
  const vel = st.vel;
  atmosphere(Math.max(0, pos.y), _atm);
  const V = Math.max(1, vel.length());
  const q = 0.5 * _atm.rho * V * V;
  const M = V / _atm.a;
  _vh.copy(vel).divideScalar(V);
  _acc.set(0, -G0, 0);

  // --- guidance: the lift the fins are asked for -------------------------
  let liftFrac = 0;
  if (st.age > SEPARATION) {
    _to.subVectors(target, pos);
    const R = _to.length();
    const Rh = Math.hypot(_to.x, _to.z);
    const below = Math.atan2(-_to.y, Math.max(1, Rh));
    const glide = bestGlide(s);
    if (!st.terminal && below > glide + 4 * DEG) st.terminal = true;
    if (st.terminal) {
      // pursuit with lead on a fixed target: turn the velocity onto the line of sight
      _des.copy(_to).divideScalar(Math.max(1, R));
    } else {
      // stretch the glide: fly the best L/D angle straight at the target
      _des.set(_to.x, 0, _to.z).normalize();
      const g = glide * 0.95;
      _des.multiplyScalar(Math.cos(g)).setY(-Math.sin(g));
    }
    // lateral acceleration toward the desired direction, plus cancelling gravity across the flight path
    _perp.copy(_des).addScaledVector(_vh, -_des.dot(_vh));
    const k = st.terminal ? 3.2 : 1.6;
    const cmd = _perp.multiplyScalar(k * V);
    // gravity compensation (lift holds the flight path against gravity)
    cmd.x += -G0 * _vh.y * _vh.x;
    cmd.y += G0 * (1 - _vh.y * _vh.y);
    cmd.z += -G0 * _vh.y * _vh.z;
    // what the fins can deliver: aerodynamics or the structural limit
    const aMax = Math.min(s.maxG * G0, (q * s.liftArea) / s.mass);
    const a = cmd.length();
    if (a > aMax) cmd.multiplyScalar(aMax / a);
    liftFrac = aMax > 0 ? Math.min(1, (Math.min(a, aMax) * s.mass) / Math.max(1, q * s.liftArea)) : 0;
    _acc.add(cmd);
  }

  // --- drag (induced drag grows with the lift), transonic rise -------------
  const wave = 1 + 1.4 * smoothstep(0.82, 1.08, M) - 0.35 * smoothstep(1.2, 2, M);
  const D = q * s.dragArea * (1 + 2 * liftFrac * liftFrac) * wave;
  _acc.addScaledVector(_vh, -D / s.mass);

  // --- rocket (AASM) ---------------------------------------------------------
  if (s.motor && st.age > 1 && st.age < 1 + s.motor.time) _acc.addScaledVector(_vh, s.motor.thrust / s.mass);

  vel.addScaledVector(_acc, dt);
  pos.addScaledVector(vel, dt);
  const ground = terrainHeight(pos.x, pos.z);
  if (pos.y <= ground) {
    pos.y = Math.max(ground, 0);
    return true;
  }
  return false;
}

let nextBombId = 1;

export class Bomb {
  readonly id = nextBombId++;
  readonly spec: BombSpec;
  readonly st: BombState;
  readonly prevPos = new THREE.Vector3();
  alive = true;
  /** predicted time of fall from release (s), for the HUD's impact countdown */
  tof = 0;

  constructor(
    type: BombType,
    readonly shooter: Aircraft,
    readonly target: THREE.Vector3,
    readonly targetUnit: GroundUnit | null,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    readonly station: number,
  ) {
    this.spec = BOMBS[type];
    this.st = { pos: pos.clone(), vel: vel.clone(), age: 0, terminal: false };
    this.prevPos.copy(pos);
  }

  get pos(): THREE.Vector3 {
    return this.st.pos;
  }

  get vel(): THREE.Vector3 {
    return this.st.vel;
  }

  get age(): number {
    return this.st.age;
  }

  step(dt: number, sim: Sim): void {
    if (!this.alive) return;
    this.prevPos.copy(this.st.pos);
    if (stepBomb(this.spec, this.st, this.target, dt) || this.st.age > 400) {
      this.alive = false;
      sim.detonateBomb(this, this.st.pos.clone());
    }
  }
}

export interface BombPrediction {
  /** lands within the lethal radius of the aim point */
  hit: boolean;
  /** horizontal miss distance (m) */
  miss: number;
  /** falls short of the target by this much (m; 0 when it reaches) */
  short: number;
  /** time of fall (s) */
  tof: number;
  impact: THREE.Vector3;
}

const _ps: BombState = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, terminal: false };

/** Fly a bomb in fast time from a release state and report where it lands. */
export function predictBomb(type: BombType, pos: THREE.Vector3, vel: THREE.Vector3, target: THREE.Vector3, out?: BombPrediction): BombPrediction {
  const s = BOMBS[type];
  _ps.pos.copy(pos);
  _ps.vel.copy(vel);
  _ps.age = 0;
  _ps.terminal = false;
  let t = 0;
  const r = out ?? { hit: false, miss: 0, short: 0, tof: 0, impact: new THREE.Vector3() };
  while (t < 300) {
    const dt = _ps.age < SEPARATION + 0.2 ? 0.1 : _ps.terminal ? 0.12 : 0.35;
    t += dt;
    if (stepBomb(s, _ps, target, dt)) break;
  }
  r.tof = t;
  r.impact.copy(_ps.pos);
  const dx = target.x - _ps.pos.x, dz = target.z - _ps.pos.z;
  r.miss = Math.hypot(dx, dz);
  // short when the impact is on the near side of the target (seen from the release point)
  const ax = target.x - pos.x, az = target.z - pos.z;
  const along = (dx * ax + dz * az) / Math.max(1, Math.hypot(ax, az));
  r.short = along > 0 ? along : 0;
  r.hit = r.miss < Math.max(6, s.blastRadius * 0.45);
  return r;
}

/** Point on the airframe a bomb leaves from (a little below the station, moving with the jet). */
export function releaseVelocity(ac: Aircraft, out: THREE.Vector3): THREE.Vector3 {
  // ejector rack kick: about 1.5 m/s straight down out of the rack or the bay
  return out.copy(ac.fm.vel).addScaledVector(ac.fm.up, -1.6);
}

