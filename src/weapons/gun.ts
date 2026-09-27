// Internal cannons (M61A1 / M61A2 20 mm, Mauser BK-27 27 mm): every round
// is a ballistic projectile with drag and gravity, hit-tested against the
// airframes of every aircraft it passes.

import * as THREE from 'three';
import type { Sim } from '../game/sim';
import type { Aircraft } from '../aircraft/aircraft';
import { atmosphere, AtmoState } from '../core/atmosphere';
import { G0 } from '../core/constants';
import { DamageModel } from '../aircraft/damage';
import { terrainHeight } from '../world/terrain';
import { randGauss } from '../core/rng';

const MAX = 4000;
const _atm: AtmoState = { T: 0, p: 0, rho: 0, a: 0, sigma: 0, delta: 0 };
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hit = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _port = new THREE.Vector3();

export class BulletSystem {
  readonly px = new Float64Array(MAX);
  readonly py = new Float64Array(MAX);
  readonly pz = new Float64Array(MAX);
  readonly vx = new Float32Array(MAX);
  readonly vy = new Float32Array(MAX);
  readonly vz = new Float32Array(MAX);
  readonly life = new Float32Array(MAX);
  readonly damage = new Float32Array(MAX);
  readonly tracer = new Uint8Array(MAX);
  readonly caliber = new Uint8Array(MAX);
  readonly owner: (Aircraft | null)[] = new Array(MAX).fill(null);
  count = 0;

  constructor(private sim: Sim) {}

  /** Fire a single round from the aircraft's gun port. */
  spawn(a: Aircraft, tracer: boolean): void {
    if (this.count >= MAX) return;
    const g = a.spec.gun;
    const fm = a.fm;
    _port.set(g.port[0], g.port[1], g.port[2]).applyQuaternion(fm.quat).add(fm.pos);
    // guns are harmonised slightly up (2 deg) as on the real jets
    _dir.set(0, Math.tan(2 * (Math.PI / 180)), -1).normalize();
    const disp = (g.dispersionMil / 1000) * 0.5;
    _dir.x += randGauss() * disp;
    _dir.y += randGauss() * disp;
    _dir.normalize().applyQuaternion(fm.quat);
    const i = this.count++;
    this.px[i] = _port.x;
    this.py[i] = _port.y;
    this.pz[i] = _port.z;
    this.vx[i] = fm.vel.x + _dir.x * g.muzzleVelocity;
    this.vy[i] = fm.vel.y + _dir.y * g.muzzleVelocity;
    this.vz[i] = fm.vel.z + _dir.z * g.muzzleVelocity;
    this.life[i] = 3.2;
    this.damage[i] = g.damage;
    this.tracer[i] = tracer ? 1 : 0;
    this.caliber[i] = g.caliberMm;
    this.owner[i] = a;
  }

  private remove(i: number): void {
    const j = --this.count;
    if (i !== j) {
      this.px[i] = this.px[j];
      this.py[i] = this.py[j];
      this.pz[i] = this.pz[j];
      this.vx[i] = this.vx[j];
      this.vy[i] = this.vy[j];
      this.vz[i] = this.vz[j];
      this.life[i] = this.life[j];
      this.damage[i] = this.damage[j];
      this.tracer[i] = this.tracer[j];
      this.caliber[i] = this.caliber[j];
      this.owner[i] = this.owner[j];
    }
    this.owner[j] = null;
  }

  step(dt: number): void {
    const sim = this.sim;
    const aircraft = sim.aircraft;
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.remove(i);
        continue;
      }
      atmosphere(this.py[i], _atm);
      const v = Math.sqrt(this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i] + this.vz[i] * this.vz[i]);
      const k = (this.caliber[i] > 25 ? 0.00031 : 0.00038) * (_atm.rho / 1.225);
      const decel = Math.exp(-k * v * dt);
      this.vx[i] *= decel;
      this.vy[i] = this.vy[i] * decel - G0 * dt;
      this.vz[i] *= decel;
      _p0.set(this.px[i], this.py[i], this.pz[i]);
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      _p1.set(this.px[i], this.py[i], this.pz[i]);

      // hit test against airframes
      let hitSomething = false;
      for (let a = 0; a < aircraft.length; a++) {
        const t = aircraft[a];
        if (t === this.owner[i] || (!t.alive && t.fm.crashed)) continue;
        const fm = t.fm;
        const dx = fm.pos.x - _p1.x, dy = fm.pos.y - _p1.y, dz = fm.pos.z - _p1.z;
        const reach = t.spec.hitRadius + v * dt + 40;
        if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
        if (this.segmentHitsAirframe(t, dt, _hit)) {
          const comp = DamageModel.componentAt(_hit, t.spec.span, t.spec.length);
          sim.applyBulletHit(t, this.owner[i], comp, this.damage[i], _p1);
          hitSomething = true;
          break;
        }
      }
      if (hitSomething) {
        this.remove(i);
        continue;
      }
      // ground / sea impact
      if (this.py[i] < 6000) {
        const h = terrainHeight(this.px[i], this.pz[i]);
        if (this.py[i] < Math.max(0, h)) {
          sim.events.emit('bulletImpact', { pos: _p1.clone(), water: h <= 0 });
          this.remove(i);
        }
      }
    }
  }

  /**
   * Segment (in the target's moving frame) vs. a simple airframe: a
   * fuselage capsule plus a thin wing slab. Returns the local hit point.
   */
  private segmentHitsAirframe(t: Aircraft, dt: number, outLocal: THREE.Vector3): boolean {
    const fm = t.fm;
    const s = t.spec;
    // relative motion: move the segment start by the target's displacement
    const a0 = new THREE.Vector3(_p0.x - (fm.pos.x - fm.vel.x * dt), _p0.y - (fm.pos.y - fm.vel.y * dt), _p0.z - (fm.pos.z - fm.vel.z * dt));
    const a1 = new THREE.Vector3(_p1.x - fm.pos.x, _p1.y - fm.pos.y, _p1.z - fm.pos.z);
    _q.copy(fm.quat).invert();
    a0.applyQuaternion(_q);
    a1.applyQuaternion(_q);
    const halfL = s.length / 2;
    const fusR = 1.25;
    // fuselage capsule along z; sample finely enough (every 0.3 m of relative
    // travel) that a round can't skip through the thin wing between samples
    const seg = Math.hypot(a1.x - a0.x, a1.y - a0.y, a1.z - a0.z);
    const N = Math.min(96, Math.max(8, Math.ceil(seg / 0.3)));
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      const x = a0.x + (a1.x - a0.x) * u;
      const y = a0.y + (a1.y - a0.y) * u;
      const z = a0.z + (a1.z - a0.z) * u;
      const zc = Math.max(-halfL, Math.min(halfL, z));
      const r = fusR * (1 - 0.6 * Math.max(0, (-zc - halfL * 0.5) / (halfL * 0.5)));
      if (x * x + y * y < r * r && Math.abs(z) < halfL) {
        outLocal.set(x, y, z);
        return true;
      }
      // wing slab: thin, tapered planform
      const halfSpan = s.span / 2;
      const ax = Math.abs(x);
      if (ax < halfSpan && Math.abs(y + 0.2) < 0.45) {
        const chordFront = -1.5 + ax * 0.45;
        const chordBack = 3.4 - ax * 0.1;
        if (z > chordFront && z < chordBack) {
          outLocal.set(x, y, z);
          return true;
        }
      }
      // vertical tails
      if (y > 0 && y < s.height - 1.6 && z > halfL * 0.45 && z < halfL && ax < 2.2) {
        outLocal.set(x, y, z);
        return true;
      }
    }
    return false;
  }

  clear(): void {
    for (let i = 0; i < this.count; i++) this.owner[i] = null;
    this.count = 0;
  }
}
