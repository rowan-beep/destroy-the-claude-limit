// Ground forces for the airstrike mode: structures and vehicles that can be
// bombed and strafed, and the air defences that shoot back.
//
// Sizes are the real ones (metres), so everything sits in proportion to the
// jets: an F-15EX is 19.4 m long and 13 m across the wings; a hardened
// aircraft shelter is 36 m deep, a ZSU-23-4 is 6.5 m long.
//
// Air defences:
//  - AAA (ZSU-23-4 Shilka): radar-directed quad 23 mm cannon. Leads its
//    target, fires bursts out to about 2.5 km slant range.
//  - IR SAM (9K35 Strela-10 / SA-13): heat-seeking missiles out to 5 km,
//    fooled by flares like the air-to-air heat-seekers.
//  - Radar SAM (9K330 Tor / SA-15, or a Buk / SA-11 battery): its radar
//    shows on your RWR, locks, then guides active-radar missiles. Kill the
//    fire-control radar and the launchers of that battery go blind.
//
// Each defence fires through a "ghost" shooter: an Aircraft object that is
// never added to the simulation, standing on the site, so rounds, missiles,
// RWR warnings and kill messages all work exactly as for a jet.

import * as THREE from 'three';
import { Aircraft } from '../aircraft/aircraft';
import type { AircraftType } from '../aircraft/specs';
import type { Sim } from './sim';
import { Missile } from '../weapons/missile';
import { hostile } from './rules';
import { G0, DEG } from '../core/constants';
import { clamp } from '../core/math';
import { randGauss } from '../core/rng';
import { terrainHeight } from '../world/terrain';

export type GroundKind =
  | 'ammo'
  | 'fuel'
  | 'bunker'
  | 'hq'
  | 'barracks'
  | 'hangar'
  | 'has'
  | 'ewr'
  | 'samRadar'
  | 'sam'
  | 'aaa'
  | 'truck'
  | 'tank'
  | 'apc'
  | 'tent'
  | 'mast'
  | 'jet';

export interface UnitDef {
  name: string;
  /** width (across), length (along the heading), height (m) */
  w: number;
  l: number;
  h: number;
  hp: number;
  /** blast damage multiplier (hardened concrete takes less) */
  hard: number;
  /** cannon damage multiplier (0 = shrugs off 20-30 mm rounds) */
  gun: number;
  /** a building (collapses) rather than a vehicle (burns out) */
  structure: boolean;
}

export const UNIT_DEFS: Record<GroundKind, UnitDef> = {
  ammo: { name: 'AMMO BUNKER', w: 10, l: 26, h: 5.5, hp: 900, hard: 0.75, gun: 0, structure: true },
  fuel: { name: 'FUEL TANK', w: 16, l: 16, h: 11, hp: 380, hard: 1, gun: 0.35, structure: true },
  bunker: { name: 'COMMAND BUNKER', w: 18, l: 24, h: 4.5, hp: 1400, hard: 0.6, gun: 0, structure: true },
  hq: { name: 'HEADQUARTERS', w: 16, l: 34, h: 9, hp: 800, hard: 0.9, gun: 0.03, structure: true },
  barracks: { name: 'BARRACKS', w: 12, l: 42, h: 6, hp: 520, hard: 1, gun: 0.06, structure: true },
  hangar: { name: 'HANGAR', w: 42, l: 50, h: 15, hp: 1300, hard: 0.9, gun: 0, structure: true },
  has: { name: 'AIRCRAFT SHELTER', w: 24, l: 36, h: 9.5, hp: 1700, hard: 0.55, gun: 0, structure: true },
  ewr: { name: 'EARLY WARNING RADAR', w: 9, l: 11, h: 14, hp: 260, hard: 1, gun: 1, structure: false },
  samRadar: { name: 'FIRE CONTROL RADAR', w: 3.3, l: 9.5, h: 7, hp: 230, hard: 1, gun: 1, structure: false },
  sam: { name: 'SAM LAUNCHER', w: 3.3, l: 9.3, h: 3.9, hp: 220, hard: 1, gun: 0.9, structure: false },
  aaa: { name: 'AAA GUN', w: 3.1, l: 6.5, h: 3.8, hp: 170, hard: 1, gun: 0.8, structure: false },
  truck: { name: 'TRUCK', w: 2.5, l: 7.4, h: 2.9, hp: 90, hard: 1, gun: 1.2, structure: false },
  tank: { name: 'MAIN BATTLE TANK', w: 3.6, l: 9.5, h: 2.3, hp: 320, hard: 0.8, gun: 0.2, structure: false },
  apc: { name: 'ARMOURED CARRIER', w: 2.9, l: 7.6, h: 2.4, hp: 170, hard: 0.9, gun: 0.6, structure: false },
  tent: { name: 'TENT', w: 6, l: 10, h: 3.2, hp: 60, hard: 1, gun: 1.5, structure: true },
  mast: { name: 'COMMS MAST', w: 5, l: 5, h: 45, hp: 200, hard: 1, gun: 0.4, structure: true },
  jet: { name: 'PARKED JET', w: 14, l: 20, h: 5.5, hp: 200, hard: 1, gun: 1, structure: false },
};

let nextUnitId = 1;
const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();

export class GroundUnit {
  readonly id = nextUnitId++;
  readonly def: UnitDef;
  hp: number;
  alive = true;
  destroyedAt = 0;
  /** turret / launcher pointing (rad, relative to the hull), for the renderer */
  aimYaw = 0;
  aimPitch = 0.2;
  firing = false;
  /** the air defence this unit carries, if any */
  defense: AirDefense | null = null;
  /** the jet type parked here ('jet' units) */
  jetType: AircraftType | null = null;
  /** already the aim point of a bomb in flight (so ripple releases spread) */
  claimed = 0;

  constructor(
    readonly kind: GroundKind,
    readonly pos: THREE.Vector3,
    /** clockwise from north (rad) */
    readonly heading: number,
    public primary: boolean,
    public label: string,
  ) {
    this.def = UNIT_DEFS[kind];
    this.hp = this.def.hp;
  }

  /** Aim point for a bomb: the middle of the roof. */
  aimPoint(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + Math.min(2, this.def.h * 0.3), this.pos.z);
  }

  /** Horizontal distance from (x, z) to the unit's footprint (0 inside it). */
  distXZ(x: number, z: number): number {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    // right = (c, s), forward = (s, -c)
    const lx = Math.abs(dx * c + dz * s) - this.def.w / 2;
    const lz = Math.abs(dx * s - dz * c) - this.def.l / 2;
    return Math.hypot(Math.max(0, lx), Math.max(0, lz));
  }

  damage(amount: number, sim: Sim, by: Aircraft | null, weapon: string): void {
    if (!this.alive || amount <= 0) return;
    this.hp -= amount;
    sim.events.emit('groundHit', { unit: this, by, weapon, amount });
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.firing = false;
      this.destroyedAt = sim.time;
      if (this.defense) this.defense.ghost.alive = false;
      sim.events.emit('groundDestroyed', { unit: this, by, weapon });
    }
  }
}

export type DefenseKind = 'AAA' | 'SAM_IR' | 'SAM_RADAR';

export interface DefenseSpec {
  kind: DefenseKind;
  /** NATO name shown in kill messages and the briefing */
  name: string;
  short: string;
  /** engagement envelope: slant range (m) and height above the site (m) */
  range: number;
  ceiling: number;
  /** missiles in the launcher (SAMs) */
  rounds: number;
  /** seconds between shots (SAM) or bursts (AAA) */
  reload: number;
}

export const DEFENSES: Record<string, DefenseSpec> = {
  ZSU: { kind: 'AAA', name: 'ZSU-23-4 SHILKA', short: 'ZSU-23-4', range: 2600, ceiling: 1600, rounds: 0, reload: 1.4 },
  TUNGUSKA: { kind: 'AAA', name: '2S6 TUNGUSKA', short: '2S6', range: 3200, ceiling: 2400, rounds: 0, reload: 1.2 },
  SA13: { kind: 'SAM_IR', name: 'SA-13 GOPHER', short: 'SA-13', range: 5000, ceiling: 3500, rounds: 4, reload: 7 },
  SA15: { kind: 'SAM_RADAR', name: 'SA-15 GAUNTLET', short: 'SA-15', range: 12000, ceiling: 6000, rounds: 8, reload: 9 },
  SA11: { kind: 'SAM_RADAR', name: 'SA-11 GADFLY', short: 'SA-11', range: 28000, ceiling: 14000, rounds: 4, reload: 12 },
};

/**
 * An air-defence weapon on a ground unit. `skill` (0..1) is the crew's
 * accuracy and reaction time.
 */
export class AirDefense {
  readonly ghost: Aircraft;
  target: Aircraft | null = null;
  private trackTime = 0;
  private cooldown: number;
  private burstLeft = 0;
  private burstBias = new THREE.Vector2();
  private scanTimer = Math.random();
  private shotAccum = 0;
  rounds: number;
  /** the battery's fire-control radar (radar SAMs are blind without it) */
  radar: GroundUnit | null = null;

  constructor(
    readonly spec: DefenseSpec,
    readonly unit: GroundUnit,
    readonly skill: number,
  ) {
    // any airframe type works for the ghost: it only carries the team, the
    // position and a name for kill messages
    this.ghost = new Aircraft('SU35', 'red', spec.name);
    this.ghost.groundLabel = spec.short;
    this.ghost.fm.pos.copy(unit.pos).setY(unit.pos.y + unit.def.h);
    this.ghost.fm.vel.set(0, 0, 0);
    this.ghost.fm.onGround = true;
    this.ghost.groundTrack = (t) => this.tracking(t);
    this.rounds = spec.rounds;
    this.cooldown = 3 + Math.random() * 4;
    unit.defense = this;
  }

  /** Can this site's radar (or optics) currently see and hold `t`? */
  private tracking(t: Aircraft): boolean {
    if (!this.unit.alive || !t.alive) return false;
    if (this.radar && !this.radar.alive) return false;
    return this.target === t && this.trackTime > 0.5;
  }

  private canEngage(t: Aircraft, sim: Sim): boolean {
    if (!t.alive || t.fm.onGround || !hostile(t, this.ghost)) return false;
    const d = t.fm.pos.distanceTo(this.ghost.fm.pos);
    if (d > this.spec.range) return false;
    if (t.fm.pos.y - this.unit.pos.y > this.spec.ceiling) return false;
    return sim.lineOfSight(this.ghost.fm.pos, t.fm.pos);
  }

  step(dt: number, sim: Sim): void {
    const u = this.unit;
    if (!u.alive) {
      this.target = null;
      return;
    }
    const blind = this.spec.kind === 'SAM_RADAR' && this.radar !== null && !this.radar.alive;
    this.cooldown -= dt;
    // --- pick a target (a few times a second) ---------------------------------
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.4;
      if (!this.target || !this.canEngage(this.target, sim)) {
        this.target = null;
        this.trackTime = 0;
        let best = Infinity;
        for (const a of sim.aircraft) {
          if (!this.canEngage(a, sim)) continue;
          const d = a.fm.pos.distanceTo(this.ghost.fm.pos);
          if (d < best) {
            best = d;
            this.target = a;
          }
        }
      }
      // radar SAMs light up the RWR of anything inside their search volume
      if (this.spec.kind === 'SAM_RADAR' && !blind) {
        for (const a of sim.aircraft) {
          if (!a.alive || !hostile(a, this.ghost)) continue;
          const d = a.fm.pos.distanceTo(this.ghost.fm.pos);
          if (d < this.spec.range * 1.6 && sim.lineOfSight(this.ghost.fm.pos, a.fm.pos)) a.rwr.paint(this.ghost, a === this.target && this.trackTime > 1 ? 'lock' : 'search', sim.time);
        }
      }
    }
    const t = this.target;
    u.firing = false;
    if (!t || blind) {
      this.trackTime = 0;
      return;
    }
    this.trackTime += dt;
    // point the turret / launcher at the target (the renderer reads this)
    _v.subVectors(t.fm.pos, this.ghost.fm.pos);
    const wantYaw = Math.atan2(_v.x, -_v.z) - u.heading;
    const wantPitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    const slew = (this.spec.kind === 'AAA' ? 80 : 50) * DEG * dt;
    let dy = ((wantYaw - u.aimYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    u.aimYaw += clamp(dy, -slew, slew);
    u.aimPitch += clamp(wantPitch - u.aimPitch, -slew, slew);
    dy = ((wantYaw - u.aimYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const onTarget = Math.abs(dy) < 3 * DEG && Math.abs(wantPitch - u.aimPitch) < 3 * DEG;

    if (this.spec.kind === 'AAA') this.stepGun(dt, sim, t, onTarget);
    else this.stepSam(sim, t, onTarget);
  }

  /** Radar-directed cannon: lead the target, fire bursts with a burst-to-burst aim error. */
  private stepGun(dt: number, sim: Sim, t: Aircraft, onTarget: boolean): void {
    const reaction = 1.8 - this.skill;
    if (this.burstLeft <= 0) {
      if (this.cooldown > 0 || !onTarget || this.trackTime < reaction) return;
      this.burstLeft = 1.0 + Math.random() * 1.2;
      this.cooldown = this.spec.reload * (0.8 + Math.random() * 0.6);
      // each burst has its own aiming error (the crew walks it onto the target)
      const err = (0.004 + (1 - this.skill) * 0.012) * (this.spec.short === '2S6' ? 0.7 : 1);
      this.burstBias.set(randGauss() * err, randGauss() * err);
    }
    this.burstLeft -= dt;
    this.unit.firing = true;
    // lead: time of flight at ~900 m/s average, gravity drop added back
    const muzzle = 970;
    const r = t.fm.pos.distanceTo(this.ghost.fm.pos);
    const tof = r / (muzzle * 0.82);
    _aim.copy(t.fm.pos).addScaledVector(t.fm.vel, tof);
    _aim.y += 0.5 * G0 * tof * tof;
    _v.subVectors(_aim, this.ghost.fm.pos).normalize();
    // burst bias: perpendicular offsets
    const side = new THREE.Vector3(-_v.z, 0, _v.x).normalize();
    const up = new THREE.Vector3().crossVectors(side, _v);
    _v.addScaledVector(side, this.burstBias.x).addScaledVector(up, this.burstBias.y).normalize();
    // quad 23 mm: two barrels firing at a time in this model (about 1,700 rounds a minute)
    this.shotAccum += dt * 28;
    while (this.shotAccum >= 1) {
      this.shotAccum -= 1;
      sim.bullets.spawnFrom(this.ghost, this.ghost.fm.pos, _v, muzzle, 6, 23, Math.random() < 0.3, 0.003);
    }
  }

  private stepSam(sim: Sim, t: Aircraft, onTarget: boolean): void {
    if (this.rounds <= 0 || this.cooldown > 0 || !onTarget) return;
    const needTrack = this.spec.kind === 'SAM_RADAR' ? 3.5 - this.skill * 1.5 : 1.5 - this.skill * 0.6;
    if (this.trackTime < needTrack) return;
    // IR: only with the target's hot tail or a close aspect; the seeker needs a lock
    const type = this.spec.kind === 'SAM_IR' ? 'R74M' : 'R77M';
    const g = this.ghost;
    _v.subVectors(t.fm.pos, g.fm.pos);
    const horiz = Math.hypot(_v.x, _v.z);
    // launch tube elevation: at least 35 degrees up, toward the target
    const elev = Math.max(35 * DEG, Math.atan2(_v.y, horiz));
    const dir = new THREE.Vector3(_v.x / Math.max(1, horiz), 0, _v.z / Math.max(1, horiz)).multiplyScalar(Math.cos(elev)).setY(Math.sin(elev));
    g.fm.quat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    const launchPos = g.fm.pos.clone().addScaledVector(dir, 3);
    const m = new Missile(type, g, t, launchPos, 0, this.spec.kind === 'SAM_RADAR');
    m.vel.copy(dir).multiplyScalar(this.spec.kind === 'SAM_IR' ? 70 : 45);
    m.lofting = false;
    sim.addMissile(m);
    sim.events.emit('launch', { missile: m, shooter: g, target: t, station: 0 });
    this.rounds--;
    this.cooldown = this.spec.reload * (0.8 + Math.random() * 0.4);
  }
}

/** Put a position on the ground (terrain height). */
export function onGround(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, Math.max(0, terrainHeight(x, z)), z);
}

