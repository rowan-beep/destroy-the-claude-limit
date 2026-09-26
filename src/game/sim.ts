// The combat simulation: every aircraft, missile, bullet and decoy in the
// theater, stepped at a fixed 120 Hz. Rendering, audio and the HUD listen
// to its events; the simulation itself never touches the scene graph.

import * as THREE from 'three';
import { Aircraft } from '../aircraft/aircraft';
import type { Component } from '../aircraft/damage';
import { Missile } from '../weapons/missile';
import { BulletSystem } from '../weapons/gun';
import { CountermeasureSystem, Decoy } from '../weapons/countermeasures';
import { HeightGrid } from '../world/heightGrid';
import { EventBus } from '../core/events';
import type { LandingGrade } from '../avionics/nav';

export interface SimEvents extends Record<string, unknown> {
  launch: { missile: Missile; shooter: Aircraft; target: Aircraft | null; station: number };
  pitbull: Missile;
  missileLost: { missile: Missile; reason: string };
  detonate: { missile: Missile; pos: THREE.Vector3; kind: string; hit: Aircraft | null; dist: number };
  hit: { victim: Aircraft; shooter: Aircraft | null; weapon: string; damage: number; pos: THREE.Vector3; component: Component | null };
  destroyed: { victim: Aircraft; killer: Aircraft | null; weapon: string; cause: string };
  crash: { aircraft: Aircraft; pos: THREE.Vector3; water: boolean };
  decoy: Decoy;
  gunfire: { shooter: Aircraft; firing: boolean };
  bulletImpact: { pos: THREE.Vector3; water: boolean };
  lock: { owner: Aircraft; target: Aircraft; irst?: boolean };
  lockLost: { owner: Aircraft; target: Aircraft; reason: string };
  newContact: { owner: Aircraft; target: Aircraft };
  missileWarning: { owner: Aircraft };
  gloc: { aircraft: Aircraft };
  eject: { aircraft: Aircraft };
  storeDropped: { aircraft: Aircraft; station: number };
  aircraftAdded: Aircraft;
  aircraftRemoved: Aircraft;
  landing: { aircraft: Aircraft; grade: LandingGrade };
}

export class Sim {
  readonly aircraft: Aircraft[] = [];
  readonly missiles: Missile[] = [];
  readonly bullets: BulletSystem;
  readonly cms: CountermeasureSystem;
  readonly events = new EventBus<SimEvents>();
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  time = 0;
  /** player preference: EPAWSS auto-dispense */
  autoCm = true;
  paused = false;

  constructor(readonly grid: HeightGrid) {
    this.bullets = new BulletSystem(this);
    this.cms = new CountermeasureSystem(this);
  }

  add(a: Aircraft): Aircraft {
    this.aircraft.push(a);
    this.events.emit('aircraftAdded', a);
    return a;
  }

  remove(a: Aircraft): void {
    const i = this.aircraft.indexOf(a);
    if (i >= 0) {
      this.aircraft.splice(i, 1);
      this.events.emit('aircraftRemoved', a);
    }
    // missiles guiding on a removed aircraft lose their target
    for (const m of this.missiles) if (m.target === a) m.target = null;
  }

  addMissile(m: Missile): void {
    this.missiles.push(m);
  }

  lineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    return this.grid.lineOfSight(a.x, a.y, a.z, b.x, b.y, b.z, 25);
  }

  step(dt: number): void {
    if (this.paused) return;
    this.time += dt;
    for (let i = 0; i < this.aircraft.length; i++) this.aircraft[i].step(dt, this);
    this.checkCollisions();
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.step(dt, this);
      if (!m.alive) this.missiles.splice(i, 1);
    }
    this.bullets.step(dt);
    this.cms.step(dt);
  }

  /** Mid-air collisions between airframes. */
  private checkCollisions(): void {
    const list = this.aircraft;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.fm.crashed || a.fm.onGround) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.fm.crashed || b.fm.onGround) continue;
        if (!a.alive && !b.alive) continue;
        const r = (a.spec.length + b.spec.length) * 0.22;
        if (a.fm.pos.distanceToSquared(b.fm.pos) < r * r) {
          a.damage.apply('fuselage', 400);
          b.damage.apply('fuselage', 400);
          a.destroy(this, 'MID-AIR COLLISION', null);
          b.destroy(this, 'MID-AIR COLLISION', null);
        }
      }
    }
  }

  applyBulletHit(t: Aircraft, shooter: Aircraft | null, comp: Component, dmg: number, pos: THREE.Vector3): void {
    if (!t.alive) {
      t.damage.apply(comp, dmg);
      return;
    }
    const weapon = shooter ? (shooter.spec.gun.caliberMm > 25 ? 'BK-27' : 'M61') : 'GUN';
    t.lastHitBy = { shooter, weapon, time: this.time };
    t.damage.apply(comp, dmg);
    this.events.emit('hit', { victim: t, shooter, weapon, damage: dmg, pos: pos.clone(), component: comp });
  }

  detonateMissile(m: Missile, point: THREE.Vector3, kind: string, direct: Aircraft | null = null, directDist = 0): void {
    if (!m.alive) return;
    m.alive = false;
    m.detonated = true;
    m.pos.copy(point);
    const s = m.spec;
    let hitAc: Aircraft | null = direct;
    if (kind === 'proximity' || kind === 'selfdestruct') {
      for (const a of this.aircraft) {
        if (!a.alive && a.fm.crashed) continue;
        const d = a.fm.pos.distanceTo(point);
        const reach = s.lethalRadius * 2.5;
        if (d > reach) continue;
        const local = a.toLocal(point);
        const wasAlive = a.alive;
        if (a.alive) a.lastHitBy = { shooter: m.shooter, weapon: s.short, time: this.time };
        if (d < s.lethalRadius * 0.4 && Math.random() < 0.85) {
          a.damage.applyBlast(local, 1000, a.spec.span, a.spec.length);
        } else {
          const f = Math.pow(Math.max(0, 1 - d / reach), 1.6);
          a.damage.applyBlast(local, s.damage * f * (0.8 + 0.4 * Math.random()), a.spec.span, a.spec.length);
        }
        if (wasAlive) this.events.emit('hit', { victim: a, shooter: m.shooter, weapon: s.short, damage: s.damage, pos: point.clone(), component: null });
        if (!hitAc) hitAc = a;
      }
    }
    this.events.emit('detonate', { missile: m, pos: point.clone(), kind, hit: hitAc, dist: directDist });
  }

  clear(): void {
    for (const a of [...this.aircraft]) this.remove(a);
    this.missiles.length = 0;
    this.bullets.clear();
    this.cms.clear();
    this.time = 0;
  }

  enemiesOf(a: Aircraft): Aircraft[] {
    return this.aircraft.filter((o) => o.alive && o.team !== a.team);
  }
}
