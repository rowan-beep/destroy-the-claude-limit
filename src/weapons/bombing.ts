// The jet's bombing computer: target designation and the release cue.
//
// Designation: the next primary target nobody has aimed a bomb at yet, the
// one nearest the nose; [R] steps through the others.
//
// Release cue (a guided bomb's launch acceptable region): the bomb's flight
// is simulated in fast time from the jet's current position and velocity.
// If it reaches the target: IN RANGE, release now. If it falls short, the
// shortfall divided by the closing speed is the time to release, counting
// down as you fly in. After release: time until impact.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Sim } from '../game/sim';
import type { GroundUnit } from '../game/ground';
import type { Bomb } from './bomb';
import { predictBomb, BombPrediction } from './bomb';
import { isBomb } from './weaponSpecs';
import { NM, DEG } from '../core/constants';

export type CueState = 'none' | 'noTarget' | 'turn' | 'wait' | 'inRange' | 'tooClose';

export interface BombCue {
  state: CueState;
  target: GroundUnit | null;
  /** seconds until the release point (state 'wait') */
  trel: number;
  /** the full time to release when this run began (for the progress bar) */
  trelStart: number;
  /** time of fall if released now / at the release point (s) */
  tof: number;
  /** horizontal range to the target (NM) */
  rangeNm: number;
  /** heading change needed to point at the target (deg, + = right) */
  steer: number;
  /** own bombs still falling, soonest impact first: seconds to impact */
  falling: { bomb: Bomb; t: number }[];
}

const _pred: BombPrediction = { hit: false, miss: 0, short: 0, tof: 0, impact: new THREE.Vector3() };
const _aim = new THREE.Vector3();
const _rel = new THREE.Vector3();

export class BombComputer {
  readonly cue: BombCue = { state: 'none', target: null, trel: 0, trelStart: 0, tof: 0, rangeNm: 0, steer: 0, falling: [] };
  private timer = 0;
  private lastTarget: GroundUnit | null = null;

  /** Candidates in designation order: unclaimed primaries first, then by angle off the nose. */
  static candidates(p: Aircraft, sim: Sim): GroundUnit[] {
    const list = sim.ground.filter((u) => u.alive && p.fm.pos.distanceTo(u.pos) < 120 * NM);
    const f = p.fm.fwd;
    const off = (u: GroundUnit) => {
      _rel.subVectors(u.pos, p.fm.pos).setY(0).normalize();
      return Math.acos(Math.max(-1, Math.min(1, _rel.x * f.x + _rel.z * f.z)));
    };
    return list.sort((a, b) => {
      const pa = (a.primary ? 0 : 2) + (a.claimed > 0 ? 1 : 0);
      const pb = (b.primary ? 0 : 2) + (b.claimed > 0 ? 1 : 0);
      if (pa !== pb) return pa - pb;
      return off(a) - off(b);
    });
  }

  /** Pick a target if none (or the current one is gone). */
  static autoDesignate(p: Aircraft, sim: Sim): GroundUnit | null {
    if (p.groundTarget && p.groundTarget.alive) return p.groundTarget;
    const c = BombComputer.candidates(p, sim);
    p.groundTarget = c[0] ?? null;
    return p.groundTarget;
  }

  /** [R] with a bomb selected: step to the next target. */
  static cycle(p: Aircraft, sim: Sim): GroundUnit | null {
    const c = sim.ground.filter((u) => u.alive && p.fm.pos.distanceTo(u.pos) < 120 * NM);
    if (!c.length) {
      p.groundTarget = null;
      return null;
    }
    // stable order: primaries first, then by distance
    c.sort((a, b) => (a.primary === b.primary ? a.pos.distanceTo(p.fm.pos) - b.pos.distanceTo(p.fm.pos) : a.primary ? -1 : 1));
    const i = p.groundTarget ? c.indexOf(p.groundTarget) : -1;
    p.groundTarget = c[(i + 1) % c.length];
    return p.groundTarget;
  }

  update(p: Aircraft, sim: Sim, dt: number): BombCue {
    const cue = this.cue;
    // bombs of ours still falling
    cue.falling.length = 0;
    for (const b of sim.bombs) if (b.shooter === p && b.alive) cue.falling.push({ bomb: b, t: Math.max(0, b.tof - b.age) });
    cue.falling.sort((a, b) => a.t - b.t);

    const type = p.bombType;
    const armed = !!type && isBomb(p.selectedWeapon);
    if (!armed || !p.alive) {
      cue.state = 'none';
      cue.target = null;
      return cue;
    }
    const t = BombComputer.autoDesignate(p, sim);
    cue.target = t;
    if (!t) {
      cue.state = 'noTarget';
      return cue;
    }
    if (t !== this.lastTarget) {
      this.lastTarget = t;
      this.timer = 0;
      cue.trelStart = 0;
    }
    const fm = p.fm;
    t.aimPoint(_aim);
    const dx = _aim.x - fm.pos.x, dz = _aim.z - fm.pos.z;
    const rh = Math.hypot(dx, dz);
    cue.rangeNm = rh / NM;
    const brg = Math.atan2(dx, -dz);
    const hdg = Math.atan2(fm.fwd.x, -fm.fwd.z);
    cue.steer = ((((brg - hdg) / DEG) % 360) + 540) % 360 - 180;
    // count the release timer down between fresh predictions
    if (cue.state === 'wait') cue.trel = Math.max(0, cue.trel - dt);
    this.timer -= dt;
    if (this.timer > 0) return cue;
    this.timer = 0.25;
    if (fm.onGround) {
      cue.state = 'turn';
      return cue;
    }
    _rel.copy(fm.pos).addScaledVector(fm.up, -1.5);
    predictBomb(type!, _rel, fm.vel, _aim, _pred);
    cue.tof = _pred.tof;
    if (_pred.hit) {
      cue.state = 'inRange';
      cue.trel = 0;
      return cue;
    }
    // closing speed toward the target
    const vc = rh > 1 ? (fm.vel.x * dx + fm.vel.z * dz) / rh : 0;
    if (Math.abs(cue.steer) > 70 || vc < 40) {
      cue.state = 'turn';
      cue.trelStart = 0;
      return cue;
    }
    if (_pred.short > 0 && _pred.miss > 0) {
      cue.state = 'wait';
      cue.trel = _pred.short / vc;
      if (cue.trelStart < cue.trel) cue.trelStart = cue.trel;
      return cue;
    }
    // it would sail past or can't turn down steeply enough: too close
    cue.state = 'tooClose';
    return cue;
  }
}
