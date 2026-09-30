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
import { hostile } from './rules';
import type { Bomb } from '../weapons/bomb';
import type { GroundUnit, AirDefense } from './ground';

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
  bombRelease: { bomb: Bomb; shooter: Aircraft; station: number };
  bombImpact: { bomb: Bomb; pos: THREE.Vector3; hits: GroundUnit[] };
  groundHit: { unit: GroundUnit; by: Aircraft | null; weapon: string; amount: number };
  groundDestroyed: { unit: GroundUnit; by: Aircraft | null; weapon: string };
}

/** Multiplayer: hits on another player's jet are sent to them, not applied here. */
export interface SimNet {
  hit(victim: Aircraft, h: Record<string, unknown>): void;
}

export class Sim {
  readonly aircraft: Aircraft[] = [];
  readonly missiles: Missile[] = [];
  readonly bombs: Bomb[] = [];
  /** ground targets and the air defences on them (airstrike mode) */
  readonly ground: GroundUnit[] = [];
  readonly defenses: AirDefense[] = [];
  /** bumped whenever the ground forces are rebuilt (the renderer starts over) */
  groundGen = 0;
  /** cleared compounds under ground sites (centre and radius, m) */
  readonly groundSites: { x: number; z: number; r: number }[] = [];
  readonly bullets: BulletSystem;
  readonly cms: CountermeasureSystem;
  readonly events = new EventBus<SimEvents>();
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  time = 0;
  /** player preference: EPAWSS auto-dispense */
  autoCm = true;
  paused = false;
  /** multiplayer link (null offline) */
  net: SimNet | null = null;

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

  addBomb(b: Bomb): void {
    this.bombs.push(b);
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
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.step(dt, this);
      if (!b.alive) this.bombs.splice(i, 1);
    }
    for (let i = 0; i < this.defenses.length; i++) this.defenses[i].step(dt, this);
    this.bullets.step(dt);
    this.cms.step(dt);
  }

  /**
   * A bomb goes off: blast damage to every structure and vehicle in reach
   * (full inside the lethal radius, falling away to nothing at three times
   * it; hardened concrete shrugs off more unless the bomb is a penetrator
   * that hit it squarely), and to any aircraft low and close enough.
   */
  detonateBomb(b: Bomb, pos: THREE.Vector3): void {
    const s = b.spec;
    const R = s.blastRadius;
    const hits: GroundUnit[] = [];
    for (const u of this.ground) {
      if (!u.alive) continue;
      const d = u.distXZ(pos.x, pos.z);
      if (d > R * 2.5) continue;
      const k = d <= R * 0.4 ? 1 : Math.pow(Math.max(0, 1 - (d - R * 0.4) / (R * 2.1)), 2.6);
      const hard = s.penetrator && d < 2 ? 1.3 : u.def.hard;
      const amt = s.damage * k * hard * (0.9 + 0.2 * Math.random());
      if (amt < 1) continue;
      hits.push(u);
      u.damage(amt, this, b.shooter, s.short);
    }
    for (const a of this.aircraft) {
      if (!a.alive || a.remote) continue;
      const d = a.fm.pos.distanceTo(pos);
      const reach = R * 2.5 + 40;
      if (d > reach) continue;
      a.lastHitBy = { shooter: b.shooter, weapon: s.short, time: this.time };
      a.damage.applyBlast(a.toLocal(pos), s.damage * 0.25 * Math.pow(1 - d / reach, 1.5), a.spec.span, a.spec.length);
      this.events.emit('hit', { victim: a, shooter: b.shooter, weapon: s.short, damage: 0, pos: pos.clone(), component: null });
    }
    this.events.emit('bombImpact', { bomb: b, pos: pos.clone(), hits });
  }

  /** A cannon round hit the ground here: vehicles and light structures on that spot take it. */
  bulletOnGround(pos: THREE.Vector3, damage: number, owner: Aircraft): void {
    for (const u of this.ground) {
      if (!u.alive || u.def.gun <= 0) continue;
      if (Math.abs(u.pos.x - pos.x) > 60 || Math.abs(u.pos.z - pos.z) > 60) continue;
      if (u.distXZ(pos.x, pos.z) < 1.5) {
        u.damage(damage * u.def.gun, this, owner, 'GUN');
        return;
      }
    }
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
        if (a.remote && b.remote) continue;
        const r = (a.spec.length + b.spec.length) * 0.22;
        if (a.fm.pos.distanceToSquared(b.fm.pos) < r * r) {
          // (a remote jet is wrecked by its own client, which sees the same collision)
          for (const c of [a, b]) {
            if (c.remote) continue;
            c.damage.apply('fuselage', 400);
            c.destroy(this, 'MID-AIR COLLISION', null);
          }
        }
      }
    }
  }

  applyBulletHit(t: Aircraft, shooter: Aircraft | null, comp: Component, dmg: number, pos: THREE.Vector3): void {
    if (t.remote) {
      // another player's jet: our view decides the hit, their client takes the damage
      if (t.alive && shooter && !shooter.remote) {
        const weapon = shooter.type === 'SU35' ? 'GSh-30' : shooter.type === 'MIG31' ? 'GSh-6-23' : shooter.type === 'RAFALE' ? '30M791' : shooter.spec.gun.caliberMm > 25 ? 'BK-27' : 'M61';
        this.net?.hit(t, { k: 'g', c: comp, d: dmg, w: weapon });
        this.events.emit('hit', { victim: t, shooter, weapon, damage: dmg, pos: pos.clone(), component: comp });
      }
      return;
    }
    if (!t.alive) {
      t.damage.apply(comp, dmg);
      return;
    }
    const weapon = shooter ? (shooter.type === 'SU35' ? 'GSh-30' : shooter.type === 'MIG31' ? 'GSh-6-23' : shooter.type === 'RAFALE' ? '30M791' : shooter.spec.gun.caliberMm > 25 ? 'BK-27' : 'M61') : 'GUN';
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
    // another player's missile: the explosion is only for show here
    if (m.remote) {
      this.events.emit('detonate', { missile: m, pos: point.clone(), kind, hit: null, dist: directDist });
      return;
    }
    if (kind === 'proximity' || kind === 'selfdestruct') {
      for (const a of this.aircraft) {
        if (!a.alive && a.fm.crashed) continue;
        const d = a.fm.pos.distanceTo(point);
        const reach = s.lethalRadius * 2.5;
        if (d > reach) continue;
        const local = a.toLocal(point);
        if (a.remote) {
          // their client works out the damage from where the blast was
          if (a.alive) {
            const close = d < s.lethalRadius * 0.4 && Math.random() < 0.85;
            const amt = close ? 1000 : s.damage * Math.pow(Math.max(0, 1 - d / reach), 1.6) * (0.8 + 0.4 * Math.random());
            this.net?.hit(a, { k: 'b', x: +local.x.toFixed(2), y: +local.y.toFixed(2), z: +local.z.toFixed(2), a: Math.round(amt), w: s.short });
            this.events.emit('hit', { victim: a, shooter: m.shooter, weapon: s.short, damage: s.damage, pos: point.clone(), component: null });
            if (!hitAc) hitAc = a;
          }
          continue;
        }
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
    this.bombs.length = 0;
    this.ground.length = 0;
    this.defenses.length = 0;
    this.groundSites.length = 0;
    this.groundGen++;
    this.bullets.clear();
    this.cms.clear();
    this.time = 0;
  }

  enemiesOf(a: Aircraft): Aircraft[] {
    return this.aircraft.filter((o) => o.alive && hostile(o, a));
  }
}
