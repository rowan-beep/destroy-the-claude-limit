// Fire-control radar model shared by the player and the AI.
//
// Modes:
//   RWS  range-while-search: raw contacts, refreshed once per scan frame
//   TWS  track-while-scan: contacts carry velocity, support AIM-120 shots
//        against several targets at once
//   STT  single target track: continuous lock (target's RWR sees LOCK)
//   ACM  air combat mode: auto-locks the first target in a 30 deg cone
//        inside 10 NM
//   OFF  silent (EMCON) -- nothing emitted, rely on IRST / eyeballs
//
// Detection requires: inside the scan volume, inside the RCS-scaled range,
// a clear line of sight over terrain *including earth curvature*, and not
// sitting in the Doppler notch while the radar looks down into clutter.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Sim } from '../game/sim';
import { NM, DEG } from '../core/constants';
import { rcsFrom, radialVelocity } from './signatures';
import { hostile } from '../game/rules';

export type RadarMode = 'RWS' | 'TWS' | 'STT' | 'ACM' | 'OFF';

export interface Contact {
  target: Aircraft;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  lastSeen: number;
  firstSeen: number;
  hostile: boolean;
  source: 'radar' | 'irst' | 'gci' | 'visual';
  /** bearing/elevation relative to own nose, radians (for scopes) */
  az: number;
  el: number;
  range: number;
}

const _rel = new THREE.Vector3();
const _q = new THREE.Quaternion();

export interface DetectResult {
  ok: boolean;
  reason: 'ok' | 'gimbal' | 'range' | 'terrain' | 'notch' | 'dead';
}

export class Radar {
  mode: RadarMode = 'TWS';
  lock: Aircraft | null = null;
  readonly contacts = new Map<number, Contact>();
  private frameTimer = 0;
  private sttTimer = 0;
  private losCache = new Map<number, { t: number; clear: boolean }>();
  private sttLostTimer = 0;
  /** radar range scale selected on the scope (NM) */
  scopeRange = 40;
  /** azimuth scan half-width (deg), limited by the antenna */
  scanAz: number;
  lastLockLoss: string | null = null;
  /**
   * Noise-jammer strobes: a jamming target the radar cannot burn through
   * still shows up as a bearing-only strobe (no range, cannot be locked).
   */
  readonly strobes = new Map<number, { target: Aircraft; az: number; time: number }>();

  constructor(readonly owner: Aircraft) {
    this.scanAz = owner.spec.radar.azLimitDeg;
  }

  get emitting(): boolean {
    return this.mode !== 'OFF' && this.owner.alive;
  }

  detectionRange(t: Aircraft): number {
    const spec = this.owner.spec.radar;
    const rcs = rcsFrom(t, this.owner.fm.pos);
    let r = spec.rangeNm * NM * Math.pow(rcs / 5, 0.25);
    r *= 1 - 0.5 * (t.jammerOn ? t.spec.ew.jamming : 0);
    // look-down into ground clutter costs range
    if (t.fm.pos.y < this.owner.fm.pos.y && t.fm.agl < 3000) r *= 0.8;
    return r;
  }

  /** Angles of a world point relative to own nose (radians). */
  anglesTo(p: THREE.Vector3): { az: number; el: number; range: number } {
    const fm = this.owner.fm;
    _rel.subVectors(p, fm.pos);
    const range = _rel.length();
    _q.copy(fm.quat).invert();
    _rel.applyQuaternion(_q);
    const az = Math.atan2(_rel.x, -_rel.z);
    const el = Math.atan2(_rel.y, Math.sqrt(_rel.x * _rel.x + _rel.z * _rel.z));
    return { az, el, range };
  }

  private los(sim: Sim, t: Aircraft): boolean {
    const c = this.losCache.get(t.id);
    if (c && sim.time - c.t < 0.4) return c.clear;
    const clear = sim.lineOfSight(this.owner.fm.pos, t.fm.pos);
    this.losCache.set(t.id, { t: sim.time, clear });
    return clear;
  }

  inNotch(t: Aircraft): boolean {
    const vr = radialVelocity(t, this.owner.fm.pos);
    if (Math.abs(vr) > 28) return false;
    const lookDown = t.fm.pos.y < this.owner.fm.pos.y - 200 || t.fm.agl < 1500;
    return lookDown;
  }

  canDetect(sim: Sim, t: Aircraft, forLock = false): DetectResult {
    if (!t.alive) return { ok: false, reason: 'dead' };
    const a = this.anglesTo(t.fm.pos);
    const spec = this.owner.spec.radar;
    const azLim = (forLock ? spec.azLimitDeg : this.scanAz) * DEG;
    if (Math.abs(a.az) > azLim || Math.abs(a.el) > spec.elLimitDeg * DEG) return { ok: false, reason: 'gimbal' };
    if (a.range > this.detectionRange(t) * (forLock ? 0.9 : 1)) return { ok: false, reason: 'range' };
    if (!this.los(sim, t)) return { ok: false, reason: 'terrain' };
    if (a.range > 6000 && this.inNotch(t)) return { ok: false, reason: 'notch' };
    return { ok: true, reason: 'ok' };
  }

  update(dt: number, sim: Sim): void {
    const own = this.owner;
    if (!own.alive) {
      this.lock = null;
      this.contacts.clear();
      return;
    }
    // expire stale contacts
    for (const [id, c] of this.contacts) {
      if (sim.time - c.lastSeen > (this.mode === 'RWS' ? 4 : 8) || !c.target.alive) this.contacts.delete(id);
    }
    if (this.mode === 'OFF') {
      this.lock = null;
      return;
    }

    // STT: continuous track
    if (this.lock) {
      this.sttTimer -= dt;
      if (this.sttTimer <= 0) {
        this.sttTimer = 0.1;
        const r = this.canDetect(sim, this.lock, true);
        if (r.ok) {
          this.sttLostTimer = 0;
          this.recordContact(sim, this.lock);
          this.lock.rwr.paint(own, 'lock', sim.time);
        } else {
          // coast briefly, then drop lock
          this.sttLostTimer += 0.1;
          const grace = r.reason === 'notch' ? 0.7 : r.reason === 'terrain' ? 0.5 : 1.2;
          if (this.sttLostTimer > grace) {
            this.lastLockLoss = r.reason;
            sim.events.emit('lockLost', { owner: own, target: this.lock, reason: r.reason });
            this.lock = null;
            this.sttLostTimer = 0;
            if (this.mode === 'STT') this.mode = 'TWS';
          }
        }
      }
    }

    // search frame
    this.frameTimer -= dt;
    const frame = own.spec.radar.frameTime * (this.mode === 'ACM' ? 0.4 : this.lock ? 1.6 : 1);
    if (this.frameTimer <= 0) {
      this.frameTimer = frame;
      for (const t of sim.aircraft) {
        if (t === own || !t.alive) continue;
        const r = this.canDetect(sim, t);
        // RWR on the target hears us if we sweep it, even when we cannot detect it
        const a = this.anglesTo(t.fm.pos);
        if (Math.abs(a.az) < this.scanAz * DEG && a.range < this.detectionRange(t) * 1.6 && (r.ok || r.reason === 'notch')) {
          t.rwr.paint(own, 'search', sim.time);
        }
        if (r.ok) this.recordContact(sim, t);
        else if (
          r.reason === 'range' &&
          t.jammerOn &&
          t.spec.ew.jamming > 0 &&
          hostile(t, own) &&
          Math.abs(a.az) < this.scanAz * DEG &&
          a.range < this.detectionRange(t) * 2.2 &&
          this.los(sim, t)
        ) {
          this.strobes.set(t.id, { target: t, az: a.az, time: sim.time });
        }
      }
      for (const [id, s] of this.strobes) if (sim.time - s.time > frame * 2.5 || !s.target.alive) this.strobes.delete(id);
    }

    // ACM auto-acquisition
    if (this.mode === 'ACM' && !this.lock) {
      let best: Aircraft | null = null;
      let bestAng = 15 * DEG;
      for (const t of sim.aircraft) {
        if (t === own || !t.alive || !hostile(t, own)) continue;
        const a = this.anglesTo(t.fm.pos);
        if (a.range > 10 * NM) continue;
        const ang = Math.hypot(a.az, a.el);
        if (ang < bestAng && this.canDetect(sim, t, true).ok) {
          best = t;
          bestAng = ang;
        }
      }
      if (best) this.setLock(best, sim);
    }
  }

  private recordContact(sim: Sim, t: Aircraft): void {
    const a = this.anglesTo(t.fm.pos);
    let c = this.contacts.get(t.id);
    if (!c) {
      c = {
        target: t,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        lastSeen: 0,
        firstSeen: sim.time,
        hostile: hostile(t, this.owner),
        source: 'radar',
        az: 0,
        el: 0,
        range: 0,
      };
      this.contacts.set(t.id, c);
      if (c.hostile) sim.events.emit('newContact', { owner: this.owner, target: t });
    }
    c.pos.copy(t.fm.pos);
    c.vel.copy(t.fm.vel);
    c.lastSeen = sim.time;
    c.az = a.az;
    c.el = a.el;
    c.range = a.range;
    c.source = 'radar';
  }

  setLock(t: Aircraft | null, sim: Sim): boolean {
    if (!t) {
      this.lock = null;
      if (this.mode === 'STT') this.mode = 'TWS';
      return false;
    }
    if (this.mode === 'OFF') return false;
    const r = this.canDetect(sim, t, true);
    if (!r.ok) return false;
    this.lock = t;
    this.sttLostTimer = 0;
    if (this.mode !== 'ACM') this.mode = 'STT';
    this.recordContact(sim, t);
    t.rwr.paint(this.owner, 'lock', sim.time);
    sim.events.emit('lock', { owner: this.owner, target: t });
    return true;
  }

  /** Lock the next hostile contact (sorted by angle off the nose). */
  cycleLock(sim: Sim): Aircraft | null {
    const list = [...this.contacts.values()]
      .filter((c) => c.target.alive && c.hostile && sim.time - c.lastSeen < 6)
      .sort((a, b) => Math.hypot(a.az, a.el) - Math.hypot(b.az, b.el));
    if (list.length === 0) return null;
    let idx = 0;
    if (this.lock) {
      const cur = list.findIndex((c) => c.target === this.lock);
      idx = (cur + 1) % list.length;
    }
    for (let k = 0; k < list.length; k++) {
      const c = list[(idx + k) % list.length];
      if (this.setLock(c.target, sim)) return c.target;
    }
    return null;
  }

  /** Radar can support a datalink shot / keeps a fresh track on the target. */
  isTracking(t: Aircraft, now: number): boolean {
    if (this.mode === 'OFF') return false;
    if (this.lock === t) return true;
    if (this.mode === 'TWS') {
      const c = this.contacts.get(t.id);
      return !!c && now - c.lastSeen < this.owner.spec.radar.frameTime * 2.2;
    }
    return false;
  }

  cycleMode(): RadarMode {
    const order: RadarMode[] = ['TWS', 'RWS', 'ACM', 'OFF'];
    const cur = this.mode === 'STT' ? 'TWS' : this.mode;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    this.mode = next;
    if (next === 'OFF') this.lock = null;
    if (next === 'ACM') this.lock = null;
    return next;
  }

  /** Direct mode selection (MFD buttons). */
  setMode(m: Exclude<RadarMode, 'STT'>): void {
    if (m === this.mode) return;
    // any new search mode drops a single-target track back to search
    this.mode = m;
    this.lock = null;
  }

  /** Antenna azimuth scan patterns available on this radar (half-width, deg). */
  get scanPatterns(): number[] {
    const lim = this.owner.spec.radar.azLimitDeg;
    return [lim, Math.min(lim, 40), 20].filter((v, i, a) => a.indexOf(v) === i);
  }

  reset(): void {
    this.mode = 'TWS';
    this.lock = null;
    this.contacts.clear();
    this.losCache.clear();
  }
}
