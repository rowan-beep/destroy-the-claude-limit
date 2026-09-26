// Radar warning receiver + missile approach warning (EPAWSS / DASS).

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Missile } from '../weapons/missile';
import type { Sim } from '../game/sim';
import { DEG } from '../core/constants';

export type ThreatLevel = 'search' | 'lock' | 'launch' | 'missile';

export interface RwrThreat {
  source: Aircraft;
  level: ThreatLevel;
  lastUpdate: number;
  /** relative bearing in radians (0 = nose, + = right) */
  bearing: number;
  newThreat: boolean;
}

export interface MissileWarning {
  missile: Missile;
  bearing: number;
  range: number;
  tti: number;
  kind: 'radar' | 'ir';
}

const _rel = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Rwr {
  readonly threats = new Map<number, RwrThreat>();
  readonly missiles: MissileWarning[] = [];
  /** most severe state this frame */
  level: ThreatLevel | null = null;
  private lastLaunchAlert = 0;

  constructor(readonly owner: Aircraft) {}

  paint(source: Aircraft, level: 'search' | 'lock', now: number): void {
    if (!this.owner.alive) return;
    let t = this.threats.get(source.id);
    if (!t) {
      t = { source, level, lastUpdate: now, bearing: 0, newThreat: true };
      this.threats.set(source.id, t);
    }
    if (level === 'lock' || t.level === 'search' || now - t.lastUpdate > 1.5) t.level = level;
    t.lastUpdate = now;
  }

  bearingTo(p: THREE.Vector3): number {
    const fm = this.owner.fm;
    _rel.subVectors(p, fm.pos);
    _q.copy(fm.quat).invert();
    _rel.applyQuaternion(_q);
    return Math.atan2(_rel.x, -_rel.z);
  }

  update(dt: number, sim: Sim): void {
    const now = sim.time;
    for (const [id, t] of this.threats) {
      const ttl = t.level === 'search' ? 4 : 1.2;
      if (now - t.lastUpdate > ttl || !t.source.alive) {
        this.threats.delete(id);
        continue;
      }
      t.bearing = this.bearingTo(t.source.fm.pos);
      if (t.level === 'lock' && now - t.lastUpdate > 0.4) t.level = 'search';
    }
    // missiles guiding on us
    this.missiles.length = 0;
    const fm = this.owner.fm;
    for (const m of sim.missiles) {
      if (!m.alive || m.target !== this.owner) continue;
      const range = m.pos.distanceTo(fm.pos);
      let detected = false;
      let kind: 'radar' | 'ir' = 'radar';
      if (m.spec.seeker === 'ARH') {
        if (m.mode === 'ACTIVE') detected = true;
        // STT-supported shots light up the launch cue through the datalink
        else if (m.mode === 'MIDCOURSE' && m.sttLaunch && m.shooter.radar.lock === this.owner) detected = true;
      } else {
        kind = 'ir';
        // missile approach warners see the rocket motor plume / missile body
        if (this.owner.spec.ew.maws && range < 9000 && (m.motorOn || range < 4000) && m.mode !== 'LOST') detected = sim.lineOfSight(m.pos, fm.pos);
        // otherwise only a visual spot of the smoke trail at close range
        else if (range < 2500 && m.mode === 'IR' && Math.random() < 0.5) detected = true;
      }
      if (m.mode === 'LOST' || m.mode === 'DECOY') detected = false;
      if (detected) {
        _rel.subVectors(fm.pos, m.pos).divideScalar(Math.max(range, 1));
        const closing = Math.max(50, (m.vel.x - fm.vel.x) * _rel.x + (m.vel.y - fm.vel.y) * _rel.y + (m.vel.z - fm.vel.z) * _rel.z);
        this.missiles.push({ missile: m, bearing: this.bearingTo(m.pos), range, tti: range / closing, kind });
        const t = this.threats.get(m.shooter.id);
        if (t) t.level = 'missile';
        else this.threats.set(m.shooter.id, { source: m.shooter, level: 'missile', lastUpdate: now, bearing: this.bearingTo(m.shooter.fm.pos), newThreat: true });
      }
    }
    // overall level
    let lvl: ThreatLevel | null = null;
    for (const t of this.threats.values()) {
      if (t.level === 'missile' || t.level === 'launch') lvl = 'missile';
      else if (t.level === 'lock' && lvl !== 'missile') lvl = 'lock';
      else if (!lvl) lvl = 'search';
    }
    if (this.missiles.length > 0) lvl = 'missile';
    if (lvl === 'missile' && this.level !== 'missile' && now - this.lastLaunchAlert > 2) {
      this.lastLaunchAlert = now;
      sim.events.emit('missileWarning', { owner: this.owner });
    }
    this.level = lvl;
  }

  /** Most dangerous incoming missile (shortest time to impact). */
  get primaryMissile(): MissileWarning | null {
    let best: MissileWarning | null = null;
    for (const m of this.missiles) if (!best || m.tti < best.tti) best = m;
    return best;
  }

  clear(): void {
    this.threats.clear();
    this.missiles.length = 0;
    this.level = null;
  }
}

export const RWR_SYMBOL: Record<string, string> = {
  F15EX: '15',
  FA18EF: '18',
  TYPHOON: 'EF',
  SU35: '35',
};

export function bearingDeg(rad: number): number {
  return rad / DEG;
}
