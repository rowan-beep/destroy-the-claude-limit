// PIRATE passive infrared search and track (Typhoon only). Detects hot
// targets without emitting anything -- the target's RWR stays silent.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Sim } from '../game/sim';
import { NM, DEG } from '../core/constants';
import { irIntensity } from './signatures';
import type { Contact } from './radar';

const _rel = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Irst {
  enabled = true;
  lock: Aircraft | null = null;
  readonly contacts = new Map<number, Contact>();
  private timer = 0;

  constructor(readonly owner: Aircraft) {}

  rangeFor(t: Aircraft): number {
    const spec = this.owner.spec.irst!;
    const i = irIntensity(t, this.owner.fm.pos);
    return spec.rangeNm * NM * Math.sqrt(i / 2.4);
  }

  canSee(sim: Sim, t: Aircraft): boolean {
    if (!t.alive) return false;
    const fm = this.owner.fm;
    _rel.subVectors(t.fm.pos, fm.pos);
    const range = _rel.length();
    _q.copy(fm.quat).invert();
    _rel.applyQuaternion(_q);
    const az = Math.atan2(_rel.x, -_rel.z);
    const el = Math.atan2(_rel.y, Math.hypot(_rel.x, _rel.z));
    if (Math.abs(az) > 65 * DEG || Math.abs(el) > 45 * DEG) return false;
    if (range > this.rangeFor(t)) return false;
    // IR is blocked by terrain and heavily attenuated looking down into clutter
    if (el < -10 * DEG && range > 25000) return false;
    return sim.lineOfSight(fm.pos, t.fm.pos);
  }

  update(dt: number, sim: Sim): void {
    if (!this.enabled || !this.owner.alive) {
      this.lock = null;
      this.contacts.clear();
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    for (const [id, c] of this.contacts) if (sim.time - c.lastSeen > 5 || !c.target.alive) this.contacts.delete(id);
    for (const t of sim.aircraft) {
      if (t === this.owner || !t.alive) continue;
      if (!this.canSee(sim, t)) continue;
      let c = this.contacts.get(t.id);
      if (!c) {
        c = {
          target: t,
          pos: new THREE.Vector3(),
          vel: new THREE.Vector3(),
          lastSeen: 0,
          firstSeen: sim.time,
          hostile: t.team !== this.owner.team,
          source: 'irst',
          az: 0,
          el: 0,
          range: 0,
        };
        this.contacts.set(t.id, c);
      }
      c.pos.copy(t.fm.pos);
      c.vel.copy(t.fm.vel);
      c.lastSeen = sim.time;
      c.range = t.fm.pos.distanceTo(this.owner.fm.pos);
    }
    if (this.lock && !this.canSee(sim, this.lock)) {
      sim.events.emit('lockLost', { owner: this.owner, target: this.lock, reason: 'irst' });
      this.lock = null;
    }
  }

  setLock(t: Aircraft | null, sim: Sim): boolean {
    if (!t) {
      this.lock = null;
      return false;
    }
    if (!this.canSee(sim, t)) return false;
    this.lock = t;
    sim.events.emit('lock', { owner: this.owner, target: t, irst: true });
    return true;
  }

  isTracking(t: Aircraft): boolean {
    return this.enabled && this.lock === t;
  }
}
