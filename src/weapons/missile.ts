// Missile flight and guidance.
//
// AIM-120D: rail/eject launch, 8 s boost to ~Mach 4, lofted midcourse
// flying on datalink updates from the launching jet's radar track (or on
// inertial memory if the track is lost), then goes active at ~10 NM. The
// active seeker can be broken by terrain masking, the Doppler notch
// (beaming a look-down missile) and chaff.
//
// AIM-9X: imaging IR, locked before launch, 90 degree gimbal, thrust
// vectoring. Can be decoyed by flares (strong IRCCM), throttling back,
// the sun, or terrain.

import * as THREE from 'three';
import type { Sim } from '../game/sim';
import type { Aircraft } from '../aircraft/aircraft';
import type { Decoy } from './countermeasures';
import { MissileSpec, MissileType, MISSILES, missileCd } from './weaponSpecs';
import { atmosphere, AtmoState } from '../core/atmosphere';
import { G0, DEG } from '../core/constants';
import { clamp, closestApproach } from '../core/math';
import { irIntensity, radialVelocity } from '../sensors/signatures';
import { terrainHeight } from '../world/terrain';
import { randGauss } from '../core/rng';

export type MissileMode = 'EJECT' | 'MIDCOURSE' | 'ACTIVE' | 'IR' | 'DECOY' | 'LOST';

const _atm: AtmoState = { T: 0, p: 0, rho: 0, a: 0, sigma: 0, delta: 0 };
const _los = new THREE.Vector3();
const _rv = new THREE.Vector3();
const _w = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _vhat = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _aimVel = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _prevT = new THREE.Vector3();

let nextMissileId = 1;

export class Missile {
  readonly id = nextMissileId++;
  readonly spec: MissileSpec;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly estPos = new THREE.Vector3();
  readonly estVel = new THREE.Vector3();
  mass: number;
  age = 0;
  alive = true;
  mode: MissileMode = 'EJECT';
  decoy: Decoy | null = null;
  notchTimer = 0;
  memoryTimer = 0;
  losCheckTimer = 0;
  losClear = true;
  datalink = true;
  motorOn = false;
  launchRange: number;
  lofting = false;
  timeToImpact = 0;
  detonated = false;
  /** was it launched while the shooter held an STT lock (RWR launch cue) */
  sttLaunch: boolean;
  /** station it came from (for the model) */
  station: number;
  closestMiss = Infinity;
  warnedTarget = false;
  gLoad = 0;
  mach = 0;

  constructor(
    type: MissileType,
    readonly shooter: Aircraft,
    public target: Aircraft | null,
    launchPos: THREE.Vector3,
    station: number,
    sttLaunch: boolean,
  ) {
    this.spec = MISSILES[type];
    this.mass = this.spec.mass0;
    this.station = station;
    this.sttLaunch = sttLaunch;
    const fm = shooter.fm;
    this.pos.copy(launchPos);
    this.prevPos.copy(launchPos);
    this.vel.copy(fm.vel);
    if (this.spec.type === 'AIM120D') {
      // ejected / dropped clear before motor ignition
      this.vel.addScaledVector(fm.up, -6).addScaledVector(fm.fwd, 2);
      this.mode = 'EJECT';
    } else {
      this.vel.addScaledVector(fm.fwd, 8);
      this.mode = target ? 'IR' : 'LOST';
      this.motorOn = true;
    }
    if (target) {
      this.estPos.copy(target.fm.pos);
      this.estVel.copy(target.fm.vel);
      this.launchRange = target.fm.pos.distanceTo(launchPos);
    } else {
      this.estPos.copy(launchPos).addScaledVector(fm.fwd, 20000);
      this.estVel.set(0, 0, 0);
      this.launchRange = 20000;
    }
    this.lofting = this.spec.loft && this.launchRange > 22000;
  }

  get speed(): number {
    return this.vel.length();
  }

  step(dt: number, sim: Sim): void {
    if (!this.alive) return;
    const s = this.spec;
    this.age += dt;
    this.prevPos.copy(this.pos);
    atmosphere(this.pos.y, _atm);
    const V = this.vel.length();
    const M = V / _atm.a;
    this.mach = M;
    const q = 0.5 * _atm.rho * V * V;

    // --- motor ---
    const ignite = s.type === 'AIM120D' ? 0.45 : 0;
    this.motorOn = this.age >= ignite && this.age < ignite + s.burnTime;
    let thrust = 0;
    if (this.motorOn) {
      thrust = s.thrust;
      this.mass -= ((s.mass0 - s.massBurnout) / s.burnTime) * dt;
    }
    if (this.mode === 'EJECT' && this.age >= ignite) this.mode = this.target ? 'MIDCOURSE' : 'LOST';

    // --- seeker / guidance ---
    const hasAim = this.updateSeeker(dt, sim);

    _vhat.copy(this.vel).divideScalar(Math.max(V, 1));
    _acc.set(0, 0, 0);
    let latG = 0;
    if (hasAim && this.mode !== 'EJECT' && this.age > ignite + 0.15) {
      // proportional navigation on the aim point
      _los.subVectors(_aim, this.pos);
      const R = Math.max(_los.length(), 1);
      _rv.subVectors(_aimVel, this.vel);
      _w.crossVectors(_los, _rv).divideScalar(R * R); // LOS rotation rate
      const N = s.navConstant;
      _acc.crossVectors(_w, this.vel).multiplyScalar(N);
      // gravity compensation
      _acc.y += G0;
      // remove any component along the velocity (can't be commanded)
      _acc.addScaledVector(_vhat, -_acc.dot(_vhat));
      // G available: aerodynamic authority + thrust vectoring while burning
      let gAvail = s.maxG * clamp(q / s.qFullG, 0.05, 1);
      if (this.motorOn && s.type === 'AIM9X') gAvail = Math.max(gAvail, 32);
      const aMax = gAvail * G0;
      const aL = _acc.length();
      if (aL > aMax) _acc.multiplyScalar(aMax / aL);
      latG = _acc.length() / G0;
      this.timeToImpact = R / Math.max(50, -_rv.dot(_los) / R);
    }
    this.gLoad = latG;

    // --- forces ---
    const cd = missileCd(M, this.motorOn);
    const drag = q * s.refArea * cd + this.mass * latG * G0 * 0.11;
    const axial = (thrust - drag) / this.mass;
    _acc.addScaledVector(_vhat, axial);
    _acc.y -= G0;
    this.vel.addScaledVector(_acc, dt);
    this.pos.addScaledVector(this.vel, dt);

    // --- fuse & impacts ---
    this.checkFuse(sim);
    if (!this.alive) return;
    const ground = terrainHeight(this.pos.x, this.pos.z);
    if (this.pos.y < Math.max(0, ground)) {
      this.pos.y = Math.max(0, ground) + 0.5;
      sim.detonateMissile(this, this.pos, ground <= 0 ? 'water' : 'ground');
      return;
    }
    if (this.age > s.maxTime || (!this.motorOn && this.age > s.burnTime + 3 && V < 140)) {
      sim.detonateMissile(this, this.pos, 'selfdestruct');
    }
  }

  /** Updates the aim point; returns true if the missile is guiding. */
  private updateSeeker(dt: number, sim: Sim): boolean {
    const s = this.spec;
    const t = this.target;
    if (this.mode === 'LOST' || !t) {
      return false;
    }
    if (this.mode === 'DECOY') {
      const d = this.decoy;
      if (!d || d.age >= d.life) {
        this.mode = 'LOST';
        return false;
      }
      _aim.copy(d.pos);
      _aimVel.copy(d.vel);
      return true;
    }

    // target state (true) with sensor noise
    const tPos = t.fm.pos;
    const range = tPos.distanceTo(this.pos);
    if (!t.alive && t.fm.crashed) {
      // wreck on the ground: stop guiding
      this.mode = 'LOST';
      return false;
    }

    // terrain line-of-sight check a few times per second
    this.losCheckTimer -= dt;
    if (this.losCheckTimer <= 0) {
      this.losCheckTimer = 0.15;
      this.losClear = sim.lineOfSight(this.pos, tPos);
    }

    if (this.mode === 'MIDCOURSE') {
      // datalink updates while the shooter's radar keeps a track on the target
      const sh = this.shooter;
      if (sh.alive && sh.sensorTrack(t)) {
        const err = Math.min(80, range * 0.002);
        this.estPos.set(tPos.x + randGauss() * err, tPos.y + randGauss() * err, tPos.z + randGauss() * err);
        this.estVel.copy(t.fm.vel);
        this.datalink = true;
      } else {
        this.datalink = false;
        this.estPos.addScaledVector(this.estVel, dt);
      }
      const estRange = this.estPos.distanceTo(this.pos);
      const pitbull = s.seekerRange * (1 - 0.25 * t.spec.ew.jamming);
      if (estRange < pitbull) {
        if (this.inGimbal(tPos) && this.losClear && range < pitbull * 1.4 && !this.inNotch(t)) {
          this.mode = 'ACTIVE';
          sim.events.emit('pitbull', this);
        } else if (estRange < 1500) {
          this.mode = 'LOST';
          return false;
        }
      }
      _aim.copy(this.estPos);
      _aimVel.copy(this.estVel);
      if (this.lofting) {
        const rem = estRange;
        const loftH = clamp((rem - 14000) * 0.28, 0, 9000);
        if (loftH <= 0) this.lofting = false;
        _aim.y += loftH;
      }
      return true;
    }

    if (this.mode === 'ACTIVE') {
      if (!this.inGimbal(tPos) || !this.losClear) {
        return this.memory(dt);
      }
      if (this.inNotch(t)) {
        this.notchTimer += dt;
        if (this.notchTimer > 0.9) {
          this.mode = 'LOST';
          sim.events.emit('missileLost', { missile: this, reason: 'NOTCH' });
          return false;
        }
        return this.memory(dt);
      }
      this.notchTimer = Math.max(0, this.notchTimer - dt * 0.5);
      // chaff
      for (const d of sim.cms.decoys) {
        if (d.kind !== 'chaff' || d.judged.has(this.id) || d.owner !== t) continue;
        if (d.age > 2.5) continue;
        const angle = this.angleBetweenFromHere(d.pos, tPos);
        const dr = Math.abs(d.pos.distanceTo(this.pos) - range);
        if (angle < 7 * DEG && dr < 450) {
          d.judged.add(this.id);
          const beaming = Math.abs(radialVelocity(t, this.pos)) < 90;
          const p = (beaming ? 0.5 : 0.1) * d.strength * (1 - s.ccm) * (1 + t.spec.ew.jamming);
          if (Math.random() < p) {
            this.mode = 'DECOY';
            this.decoy = d;
            sim.events.emit('missileLost', { missile: this, reason: 'CHAFF' });
            _aim.copy(d.pos);
            _aimVel.copy(d.vel);
            return true;
          }
        }
      }
      this.memoryTimer = 0;
      _aim.copy(tPos);
      _aimVel.copy(t.fm.vel);
      this.estPos.copy(tPos);
      this.estVel.copy(t.fm.vel);
      if (!this.warnedTarget) {
        this.warnedTarget = true;
      }
      return true;
    }

    if (this.mode === 'IR') {
      if (!this.inGimbal(tPos) || !this.losClear) return this.memory(dt);
      const intensity = irIntensity(t, this.pos);
      const maxRange = s.seekerRange * intensity * 1.6;
      if (range > maxRange) return this.memory(dt);
      // flares
      for (const d of sim.cms.decoys) {
        if (d.kind !== 'flare' || d.judged.has(this.id) || d.owner !== t) continue;
        if (d.age > 1.8) continue;
        const angle = this.angleBetweenFromHere(d.pos, tPos);
        if (angle < 5 * DEG) {
          d.judged.add(this.id);
          const rel = d.strength / Math.max(0.3, intensity);
          const p = clamp(0.32 * rel * (1 - s.ccm), 0.03, 0.6);
          if (Math.random() < p) {
            this.mode = 'DECOY';
            this.decoy = d;
            sim.events.emit('missileLost', { missile: this, reason: 'FLARE' });
            _aim.copy(d.pos);
            _aimVel.copy(d.vel);
            return true;
          }
        }
      }
      // the sun can steal an IR seeker
      _tmp.subVectors(tPos, this.pos).normalize();
      if (sim.sunDir.y > 0 && _tmp.dot(sim.sunDir) > Math.cos(4 * DEG) && Math.random() < 0.6 * dt) {
        this.mode = 'LOST';
        sim.events.emit('missileLost', { missile: this, reason: 'SUN' });
        return false;
      }
      this.memoryTimer = 0;
      _aim.copy(tPos);
      _aimVel.copy(t.fm.vel);
      this.estPos.copy(tPos);
      this.estVel.copy(t.fm.vel);
      return true;
    }
    return false;
  }

  /** Brief track memory: coast on the last estimate, then give up. */
  private memory(dt: number): boolean {
    this.memoryTimer += dt;
    if (this.memoryTimer > 2.0) {
      this.mode = 'LOST';
      return false;
    }
    this.estPos.addScaledVector(this.estVel, dt);
    _aim.copy(this.estPos);
    _aimVel.copy(this.estVel);
    return true;
  }

  private inGimbal(p: THREE.Vector3): boolean {
    const V = this.vel.length();
    if (V < 1) return true;
    _tmp.subVectors(p, this.pos);
    const d = _tmp.length();
    if (d < 1) return true;
    const cos = _tmp.dot(this.vel) / (d * V);
    return cos > Math.cos(this.spec.gimbalDeg * DEG);
  }

  private angleBetweenFromHere(a: THREE.Vector3, b: THREE.Vector3): number {
    _tmp.subVectors(a, this.pos).normalize();
    _prevT.subVectors(b, this.pos).normalize();
    return Math.acos(clamp(_tmp.dot(_prevT), -1, 1));
  }

  /** Pulse-Doppler notch: target beaming while the seeker looks down into clutter. */
  private inNotch(t: Aircraft): boolean {
    const vr = radialVelocity(t, this.pos);
    const beam = Math.abs(vr) < 32;
    if (!beam) return false;
    _tmp.subVectors(t.fm.pos, this.pos).normalize();
    const lookDown = _tmp.y < -0.03 || t.fm.agl < 1800;
    return lookDown;
  }

  private checkFuse(sim: Sim): void {
    const s = this.spec;
    if (this.age < 0.6) return;
    for (const a of sim.aircraft) {
      if (!a.alive && a.fm.crashed) continue;
      if (a === this.shooter && this.age < 3) continue;
      const fm = a.fm;
      _prevT.copy(fm.pos).addScaledVector(fm.vel, -1 / 120);
      const ca = closestApproach(this.prevPos, this.pos, _prevT, fm.pos);
      if (a === this.target && ca.dist < this.closestMiss) this.closestMiss = ca.dist;
      const r = s.fuseRadius + (a === this.target ? 0 : -3);
      if (ca.dist < r) {
        _tmp.lerpVectors(this.prevPos, this.pos, ca.t);
        sim.detonateMissile(this, _tmp, 'proximity', a, ca.dist);
        return;
      }
    }
  }
}
