// AI fighter pilot.
//
// Behaviour loop (finite state machine):
//   PATROL     no known enemy: fly a search pattern between the islands with
//              the radar sweeping. Stays here until something is actually
//              seen -- every sensor respects terrain masking.
//   INTERCEPT  enemy known but far: lead-collision course computed from the
//              target's speed and heading (easy AIs just pure-pursue).
//   ENGAGE     inside weapons range: fights for the six o'clock, manages
//              energy around corner speed, employs AIM-120D / AIM-9X / gun.
//   DEFENSIVE  missile warning or enemy on the six: beam / break, chaff and
//              flares, throttle cut vs IR, dives for the notch.
//   MASKING    (hard+) runs low behind a ridge to break the radar lock.
// Difficulty (AISkill) scales how often it thinks, how hard it pulls and
// which tactics it knows.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Sim } from '../game/sim';
import type { TeamPicture } from '../game/teamPicture';
import { AISkill } from './skill';
import { steerToward, holdSpeed, noseAngleTo } from './steering';
import { G0, DEG, KT, NM, FT, MAP_HALF } from '../core/constants';
import { clamp, lerp } from '../core/math';
import { rand, chance, randGauss } from '../core/rng';
import { terrainHeight } from '../world/terrain';
import { MISSILES } from '../weapons/weaponSpecs';
import { gunSolution, gunLine } from '../weapons/gunnery';

export type AIState = 'TAKEOFF' | 'PATROL' | 'FORMATION' | 'INTERCEPT' | 'ENGAGE' | 'DEFENSIVE' | 'MASKING' | 'RTB';

type Maneuver = 'pursuit' | 'lead' | 'lag' | 'highYoyo' | 'lowYoyo' | 'scissors' | 'vertical' | 'extend' | 'crank' | 'gentle' | 'break' | 'beam' | 'jink';

const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _aim = new THREE.Vector3();

export class AIPilot {
  state: AIState = 'PATROL';
  maneuver: Maneuver = 'gentle';
  target: Aircraft | null = null;
  readonly knownPos = new THREE.Vector3();
  readonly knownVel = new THREE.Vector3();
  knownTime = -1e9;
  knownSource: 'own' | 'team' | 'none' = 'none';
  route: THREE.Vector3[] = [];
  routeIdx = 0;
  leader: AIPilot | null = null;
  formationOffset = new THREE.Vector3(600, 0, 400);
  bracketSide = 1;
  private thinkTimer = rand(0, 0.5);
  private perceiveTimer = 0;
  private maneuverTimer = 0;
  private lockTime = 0;
  private lastShot = -1e9;
  private lastShotAt: Aircraft | null = null;
  private threatSeenAt = -1;
  private defenseTimer = 0;
  private cmTimer = 0;
  private jinkTimer = 0;
  private jinkDir = new THREE.Vector3();
  private maskPoint: THREE.Vector3 | null = null;
  private maskThreat: Aircraft | null = null;
  private maskTime = 0;
  private terrainRecovery = 0;
  private scissorSign = 1;
  private desired = new THREE.Vector3(0, 0, -1);
  private desiredCas = 250;
  private gCap = 4;
  private useAb = false;
  private tau = 1.2;
  private maxBank: number | undefined;
  private rudder = 0;
  private triggerWanted = false;
  private patrolAlt = 7000;
  private cruiseMach = 0.85;
  private weaveT = rand(0, 40);
  private readonly visualSeen = new Map<number, number>();
  private aimNoise = new THREE.Vector3();
  private aimNoiseTimer = 0;
  debugText = '';

  constructor(
    readonly ac: Aircraft,
    public skill: AISkill,
    private picture: TeamPicture,
  ) {
    this.patrolAlt = rand(5500, 8500);
    this.bracketSide = chance(0.5) ? 1 : -1;
  }

  setRoute(points: THREE.Vector3[], alt?: number): void {
    this.route = points;
    this.routeIdx = 0;
    if (alt !== undefined) this.patrolAlt = alt;
  }

  // -------------------------------------------------------------------------
  // Main update
  // -------------------------------------------------------------------------

  update(dt: number, sim: Sim): void {
    const ac = this.ac;
    if (!ac.alive) return;
    this.weaveT += dt;

    this.perceiveTimer -= dt;
    if (this.perceiveTimer <= 0) {
      this.perceiveTimer = Math.max(0.05, this.skill.thinkInterval * 0.5);
      this.perceive(sim);
    }
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = this.skill.thinkInterval * rand(0.85, 1.15);
      this.think(sim);
    }
    this.fly(dt, sim);
  }

  // -------------------------------------------------------------------------
  // Perception
  // -------------------------------------------------------------------------

  private perceive(sim: Sim): void {
    const ac = this.ac;
    const now = sim.time;
    // pick up / refresh the target from own sensors first
    let best: Aircraft | null = null;
    let bestScore = Infinity;
    for (const e of sim.aircraft) {
      if (!e.alive || e.team === ac.team) continue;
      const seen = this.sees(e, sim);
      if (!seen) continue;
      const d = ac.distanceTo(e);
      // prefer threats pointing at us, closer targets, and (teamwork) targets not already engaged
      let score = d;
      if (e.isPlayer) score *= 0.8;
      if (this.skill.teamwork > 0.5) {
        const engaged = sim.aircraft.filter((o) => o !== ac && o.team === ac.team && o.alive && o.ai?.target === e).length;
        score *= 1 + engaged * 0.15;
      }
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) {
      if (this.target !== best && (!this.target || !this.sees(this.target, sim))) this.target = best;
      if (this.target === best || !this.target) {
        this.target = best;
        this.knownPos.copy(best.fm.pos);
        this.knownVel.copy(best.fm.vel);
        this.knownTime = now;
        this.knownSource = 'own';
      }
    }
    if (this.target && this.sees(this.target, sim)) {
      this.knownPos.copy(this.target.fm.pos);
      this.knownVel.copy(this.target.fm.vel);
      this.knownTime = now;
      this.knownSource = 'own';
      return;
    }
    // team picture (GCI / wingmen datalink)
    let pt = null as null | { target: Aircraft; pos: THREE.Vector3; vel: THREE.Vector3; time: number };
    for (const t of this.picture.tracksFor(ac.team)) {
      if (!t.target.alive) continue;
      if (!pt || t.pos.distanceTo(ac.fm.pos) < pt.pos.distanceTo(ac.fm.pos)) pt = t;
    }
    if (pt && now - pt.time < 30) {
      if (!this.target || this.knownSource !== 'own' || now - this.knownTime > 12) {
        this.target = pt.target;
        this.knownPos.copy(pt.pos).addScaledVector(pt.vel, now - pt.time);
        this.knownVel.copy(pt.vel);
        this.knownTime = pt.time;
        this.knownSource = 'team';
      }
    } else if (this.target && now - this.knownTime > 40) {
      this.target = null;
      this.knownSource = 'none';
    }
    if (this.target && !this.target.alive) {
      this.target = null;
      this.knownSource = 'none';
    }
  }

  /** Can this pilot currently perceive `e` with own sensors or eyes? */
  sees(e: Aircraft, sim: Sim): boolean {
    const ac = this.ac;
    if (!e.alive) return false;
    const c = ac.radar.contacts.get(e.id);
    if (c && sim.time - c.lastSeen < 3) return true;
    if (ac.irst) {
      const ic = ac.irst.contacts.get(e.id);
      if (ic && sim.time - ic.lastSeen < 3) return true;
    }
    if (ac.radar.lock === e) return true;
    // eyeballs: range and a look-angle limit (can't see straight behind well)
    const d = ac.distanceTo(e);
    const vr = this.skill.visualRangeNm * NM * (e.fm.afterburner > 0.2 ? 1.3 : 1);
    if (d > vr) return false;
    _tmp.subVectors(e.fm.pos, ac.fm.pos).divideScalar(d);
    const behind = -_tmp.dot(ac.fm.fwd);
    if (behind > 0.85 && d > 1.2 * NM) return false;
    const last = this.visualSeen.get(e.id) ?? -1e9;
    if (sim.time - last < 1.5) return true;
    if (sim.lineOfSight(ac.fm.pos, e.fm.pos)) {
      this.visualSeen.set(e.id, sim.time);
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Decisions
  // -------------------------------------------------------------------------

  private think(sim: Sim): void {
    const ac = this.ac;
    const sk = this.skill;
    const fm = ac.fm;

    if (this.state === 'TAKEOFF') {
      if (!fm.onGround && fm.agl > 250) {
        this.state = 'PATROL';
        ac.controls.gearDown = false;
      }
      return;
    }

    // --- threat assessment -----------------------------------------------
    const mw = ac.rwr.primaryMissile;
    if (mw) {
      if (this.threatSeenAt < 0) this.threatSeenAt = sim.time;
    } else this.threatSeenAt = -1;
    const reacted = mw && sim.time - this.threatSeenAt >= sk.reaction;
    const gunThreat = this.gunThreat(sim);

    if ((reacted && chance(sk.defense + 0.1)) || (reacted && this.state === 'DEFENSIVE')) {
      this.enterDefensive(sim, mw!.kind === 'ir' ? 'ir' : 'radar');
      return;
    }
    if (gunThreat && chance(sk.defense)) {
      this.state = 'DEFENSIVE';
      this.maneuver = 'break';
      this.defenseTimer = rand(2, 4);
      if (sk.cmUse > 0.3) ac.dispense('flare', 2);
      return;
    }
    if (this.state === 'DEFENSIVE') {
      this.defenseTimer -= sk.thinkInterval || 0.016;
      if (this.defenseTimer > 0 && (mw || gunThreat)) return;
      // missile defeated or gone: consider masking before re-engaging
      if (sk.terrainMasking && ac.rwr.level === 'lock' && this.findMaskPoint(sim)) {
        this.state = 'MASKING';
        return;
      }
      this.state = this.target ? 'ENGAGE' : 'PATROL';
    }
    if (this.state === 'MASKING') {
      this.maskTime += sk.thinkInterval || 1 / 60;
      const arrived = !!this.maskPoint && fm.pos.distanceTo(this.maskPoint) < 2500;
      if (!this.maskPoint || ac.rwr.level !== 'lock' || this.maskTime > 35 || (arrived && !this.findMaskPoint(sim))) {
        this.maskPoint = null;
        this.maskTime = 0;
        this.state = this.target ? 'ENGAGE' : 'PATROL';
      } else {
        if (this.maskTime % 8 < (sk.thinkInterval || 1 / 60)) this.findMaskPoint(sim);
        return;
      }
    }

    // --- fuel -----------------------------------------------------------
    const fuelFrac = fm.fuelTotal / ac.spec.internalFuel;
    if (fuelFrac < 0.06 && this.state !== 'RTB') this.state = 'RTB';

    // --- target / state ---------------------------------------------------
    if (this.state === 'FORMATION' && this.leader) {
      const leadAc = this.leader.ac;
      if (!leadAc.alive || this.leader.state === 'ENGAGE' || this.leader.state === 'INTERCEPT' || this.target) {
        this.state = this.target ? 'INTERCEPT' : 'PATROL';
      } else return;
    }
    if (this.state === 'RTB') return;

    if (!this.target) {
      this.state = this.leader && this.leader.ac.alive && this.leader.state !== 'DEFENSIVE' ? 'FORMATION' : 'PATROL';
      this.manageRadar(sim, null);
      return;
    }
    const d = fm.pos.distanceTo(this.knownPos);
    const engageRange = this.knownSource === 'own' ? Math.max(12 * NM, this.bvrRange()) : 0;
    this.state = d < engageRange ? 'ENGAGE' : 'INTERCEPT';
    this.manageRadar(sim, this.target);
    if (this.state === 'ENGAGE') this.chooseManeuver(sim);
    this.employWeapons(sim);

    // hard+: after a defensive, if outgunned, use the terrain
    if (sk.terrainMasking && ac.rwr.level === 'lock' && this.target && this.target.radar.lock === ac) {
      const disadvantaged = this.targetAspect() > 120 * DEG || fuelFrac < 0.2 || ac.damage.integrity < 0.6;
      if (disadvantaged && chance(0.35) && this.findMaskPoint(sim)) this.state = 'MASKING';
    }
  }

  private bvrRange(): number {
    const ac = this.ac;
    if (this.skill.weapons.aim120 && ac.countOf('AIM120D') > 0) return 30 * NM;
    return 10 * NM;
  }

  private manageRadar(sim: Sim, t: Aircraft | null): void {
    const r = this.ac.radar;
    if (this.state === 'MASKING') {
      r.mode = 'OFF';
      return;
    }
    if (r.mode === 'OFF') r.mode = 'TWS';
    if (!t) {
      if (r.lock) r.setLock(null, sim);
      return;
    }
    const d = this.ac.distanceTo(t);
    const lockRange = this.skill.level < 0.2 ? 15 * NM : 40 * NM;
    if (r.lock !== t && d < lockRange && this.knownSource === 'own') r.setLock(t, sim);
    if (this.ac.irst && !this.ac.irst.lock && d < 30 * NM) this.ac.irst.setLock(t, sim);
  }

  private gunThreat(sim: Sim): Aircraft | null {
    const ac = this.ac;
    for (const e of sim.aircraft) {
      if (!e.alive || e.team === ac.team) continue;
      const d = ac.distanceTo(e);
      if (d > 1600) continue;
      if (!this.sees(e, sim) && d > 700) continue;
      // enemy nose on us?
      _tmp.subVectors(ac.fm.pos, e.fm.pos).divideScalar(d);
      if (_tmp.dot(e.fm.fwd) < Math.cos(12 * DEG)) continue;
      // and it's in our rear hemisphere (enemy position ahead of us => not a gun threat)
      if (-_tmp.dot(ac.fm.fwd) > 0.2) continue;
      return e;
    }
    return null;
  }

  private targetAspect(): number {
    // angle between the target's tail and the line from target to us (0 = we're on its six)
    const t = this.target;
    if (!t) return 0;
    _tmp.subVectors(this.ac.fm.pos, t.fm.pos).normalize();
    return Math.acos(clamp(-t.fm.fwd.dot(_tmp), -1, 1));
  }

  private enterDefensive(sim: Sim, kind: 'ir' | 'radar'): void {
    const sk = this.skill;
    const ac = this.ac;
    if (this.state !== 'DEFENSIVE') {
      this.state = 'DEFENSIVE';
      this.defenseTimer = 4;
      // first reaction countermeasures
      if (chance(sk.cmUse)) ac.dispense(kind === 'ir' ? 'flare' : 'chaff', sk.level > 0.5 ? 3 : 2);
    }
    const mw = ac.rwr.primaryMissile;
    this.maneuver = mw && mw.tti < 3.5 ? 'break' : kind === 'radar' ? 'beam' : 'break';
    this.defenseTimer = Math.max(this.defenseTimer, 2.5);
    // terrain masking against radar missiles
    if (kind === 'radar' && sk.terrainMasking && mw && mw.tti > 10 && this.findMaskPoint(sim)) {
      this.state = 'MASKING';
    }
  }

  private chooseManeuver(sim: Sim): void {
    const ac = this.ac;
    const t = this.target!;
    const sk = this.skill;
    const fm = ac.fm;
    const R = ac.distanceTo(t);
    const ata = noseAngleTo(ac, t.fm.pos);
    const aa = this.targetAspect();
    _tmp.subVectors(t.fm.vel, fm.vel);
    _tmp2.subVectors(t.fm.pos, fm.pos).normalize();
    const closure = -_tmp.dot(_tmp2);
    const corner = ac.spec.cornerKts * KT;
    this.maneuverTimer -= sk.thinkInterval || 0.016;

    // own missile in flight on this target that still needs radar support?
    const supporting = sim.missiles.some((m) => m.shooter === ac && m.target === t && m.mode === 'MIDCOURSE' && m.spec.type === 'AIM120D');

    if (sk.level < 0.2) {
      this.maneuver = R < 3000 ? 'pursuit' : 'gentle';
      return;
    }
    if (supporting && R > 8000) {
      this.maneuver = 'crank';
      return;
    }
    if (this.maneuverTimer > 0 && (this.maneuver === 'highYoyo' || this.maneuver === 'lowYoyo' || this.maneuver === 'scissors' || this.maneuver === 'vertical' || this.maneuver === 'extend')) return;

    if (R > 6000) {
      this.maneuver = sk.leadIntercept ? 'lead' : 'pursuit';
      return;
    }
    // too close with no shot: separate, rebuild energy, come back with a missile
    if (R < 700 && ata > 60 * DEG && sk.level >= 0.3 && fm.cas < corner * 0.7 && aa > 90 * DEG) {
      this.maneuver = 'extend';
      this.maneuverTimer = rand(4, 7);
      return;
    }
    if (sk.advancedBfm) {
      // overshoot danger: fast closure at close range with the target turning
      if (R < 1400 && closure > 90 && aa < 70 * DEG) {
        this.maneuver = chance(0.5) ? 'highYoyo' : 'lag';
        this.maneuverTimer = 2.5;
        return;
      }
      // slow, close, canopy-to-canopy: scissors
      if (R < 900 && fm.cas < corner * 0.75 && aa > 60 * DEG && aa < 140 * DEG) {
        this.maneuver = 'scissors';
        this.maneuverTimer = rand(4, 7);
        this.scissorSign = -this.scissorSign;
        return;
      }
      // target turning inside us and we're too slow: low yo-yo to cut across
      if (ata > 45 * DEG && fm.cas < corner * 0.85 && fm.agl > 2500) {
        this.maneuver = 'lowYoyo';
        this.maneuverTimer = 3;
        return;
      }
      // excess energy: take it vertical
      if (sk.vertical && fm.cas > corner * 1.25 && ata > 70 * DEG && fm.agl > 1500) {
        this.maneuver = 'vertical';
        this.maneuverTimer = 4;
        return;
      }
    }
    if (R < 2500 && ata < 30 * DEG) this.maneuver = 'lead';
    else this.maneuver = 'pursuit';
  }

  private employWeapons(sim: Sim): void {
    const ac = this.ac;
    const t = this.target;
    const sk = this.skill;
    this.triggerWanted = false;
    if (!t || !t.alive || this.knownSource !== 'own') {
      this.lockTime = 0;
      return;
    }
    const R = ac.distanceTo(t);
    const ata = noseAngleTo(ac, t.fm.pos);
    const now = sim.time;
    const exploiting = sk.exploit && (t.pilot.unconscious || t.fm.fuelTotal < t.spec.internalFuel * 0.12);

    // weapon selection by range
    const n120 = sk.weapons.aim120 ? ac.countOf('AIM120D') : 0;
    const n9 = sk.weapons.aim9x ? ac.countOf('AIM9X') : 0;
    const lz9 = ac.launchZoneFor('AIM9X', t);
    const lz120 = ac.launchZoneFor('AIM120D', t);
    let want: 'GUN' | 'AIM9X' | 'AIM120D' = 'AIM120D';
    if (R < 1300 && sk.weapons.gun && ac.gunAmmo > 0) want = 'GUN';
    else if (n9 > 0 && R < lz9.rmax * 1.1) want = 'AIM9X';
    else if (n120 > 0) want = 'AIM120D';
    else if (n9 > 0) want = 'AIM9X';
    else want = 'GUN';
    if (exploiting && R < 1500) want = 'GUN';
    if (ac.selectedWeapon !== want && (sk.weaponAgility || chance(0.5))) ac.selectWeapon(want);

    // --- AIM-120D ---
    if (n120 > 0 && sk.weapons.aim120 && ac.selectedWeapon === 'AIM120D') {
      const tracked = ac.radar.isTracking(t, now);
      const sinceShot = now - this.lastShot;
      const alreadyInFlight = sim.missiles.some((m) => m.shooter === ac && m.target === t && m.alive && m.mode !== 'LOST' && m.mode !== 'DECOY');
      const teamStagger = sk.teamwork > 0.5 ? this.teamShotsInFlight(sim, t) < 2 : true;
      if (
        tracked &&
        R > lz120.rmin * 1.4 &&
        R < lz120.rmax * sk.missileRangeFrac &&
        ata < 40 * DEG &&
        sinceShot > 6 &&
        (!alreadyInFlight || R < lz120.rne) &&
        teamStagger
      ) {
        if (ac.fireMissile(sim, 'AIM120D', t)) {
          this.lastShot = now;
          this.lastShotAt = t;
        }
      }
    }

    // --- AIM-9X ---
    if (n9 > 0 && ac.selectedWeapon === 'AIM9X') {
      if (ac.seekerTarget === t) this.lockTime += sk.thinkInterval || 1 / 60;
      else this.lockTime = 0;
      const cone = sk.shotConeDeg * DEG;
      if (
        ac.seekerTarget === t &&
        this.lockTime >= sk.lockHold &&
        R > lz9.rmin &&
        R < lz9.rmax * sk.missileRangeFrac &&
        ata < cone &&
        now - this.lastShot > (sk.level < 0.2 ? 10 : 3)
      ) {
        if (ac.fireMissile(sim, 'AIM9X', t)) {
          this.lastShot = now;
          this.lastShotAt = t;
          this.lockTime = 0;
        }
      }
    }
  }

  private teamShotsInFlight(sim: Sim, t: Aircraft): number {
    return sim.missiles.filter((m) => m.alive && m.target === t && m.shooter.team === this.ac.team && m.mode !== 'LOST').length;
  }

  /** Find a nearby low point hidden from the threat by terrain. */
  private findMaskPoint(sim: Sim): boolean {
    const ac = this.ac;
    let threat: Aircraft | null = ac.rwr.primaryMissile?.missile.shooter ?? null;
    if (!threat) {
      for (const th of ac.rwr.threats.values()) {
        if (th.level !== 'search') {
          threat = th.source;
          break;
        }
      }
    }
    threat ??= this.target;
    if (!threat) return false;
    const fm = ac.fm;
    let best: THREE.Vector3 | null = null;
    let bestD = Infinity;
    const hdg0 = Math.atan2(fm.fwd.x, -fm.fwd.z);
    for (const dist of [5000, 9000, 14000, 20000]) {
      for (let k = 0; k < 16; k++) {
        const a = hdg0 + (k / 16) * Math.PI * 2;
        const x = fm.pos.x + Math.sin(a) * dist;
        const z = fm.pos.z - Math.cos(a) * dist;
        const h = Math.max(0, sim.grid.height(x, z));
        if (h < 60) continue; // need terrain nearby, not open sea
        const p = new THREE.Vector3(x, h + Math.max(this.skill.minAgl, 180), z);
        if (sim.grid.lineOfSight(threat.fm.pos.x, threat.fm.pos.y, threat.fm.pos.z, p.x, p.y, p.z, 20)) continue;
        // prefer points away from the threat
        const away = p.distanceTo(threat.fm.pos) > fm.pos.distanceTo(threat.fm.pos) ? 0.8 : 1.25;
        const score = dist * away;
        if (score < bestD) {
          bestD = score;
          best = p;
        }
      }
      if (best) break;
    }
    if (!best) return false;
    this.maskPoint = best;
    this.maskThreat = threat;
    return true;
  }

  // -------------------------------------------------------------------------
  // Flying
  // -------------------------------------------------------------------------

  private fly(dt: number, sim: Sim): void {
    const ac = this.ac;
    const fm = ac.fm;
    const sk = this.skill;
    const c = ac.controls;
    c.wheelBrake = 0;
    this.rudder = 0;
    this.maxBank = undefined;
    this.tau = lerp(2.2, 0.6, sk.level);
    const aggressiveG = Math.min(sk.maxG, ac.spec.gOverride);
    this.gCap = aggressiveG;
    this.useAb = sk.abUse > 0.5;
    const corner = ac.spec.cornerKts * KT;
    this.desiredCas = corner;
    ac.trigger = false;

    if (this.state === 'TAKEOFF') {
      this.flyTakeoff(dt);
      return;
    }
    if (fm.onGround) {
      this.state = 'TAKEOFF';
      return;
    }
    c.gearDown = false;

    switch (this.state) {
      case 'PATROL':
        this.flyPatrol(sim);
        break;
      case 'FORMATION':
        this.flyFormation();
        break;
      case 'INTERCEPT':
        this.flyIntercept(sim);
        break;
      case 'ENGAGE':
        this.flyEngage(dt, sim);
        break;
      case 'DEFENSIVE':
        this.flyDefensive(dt, sim);
        break;
      case 'MASKING':
        this.flyMasking();
        break;
      case 'RTB':
        this.flyRtb(sim);
        break;
    }

    // --- safety overrides ---------------------------------------------------
    this.separation(sim);
    this.terrainSafety(dt, sim);
    this.boundarySafety();
    // G-LOC awareness: ease off before blacking out
    const gl = ac.pilot.gSmooth;
    if (gl > 9.4) this.gCap = Math.min(this.gCap, gl > 10.1 ? 8 : 9.2);
    // fuel awareness: stop burning afterburner when fuel is low
    if (fm.fuelTotal < ac.spec.internalFuel * 0.2 && this.state !== 'DEFENSIVE') this.useAb = false;
    if (sk.abUse <= 0) this.useAb = false;

    const res = steerToward(ac, this.desired, {
      gCap: this.gCap,
      tau: this.tau,
      maxBank: this.maxBank,
      override: sk.useOverride && this.gCap > ac.spec.gLimit,
      rudder: this.rudder,
    });
    void res;
    holdSpeed(ac, this.desiredCas, this.useAb, dt);
    if (this.triggerWanted && ac.selectedWeapon === 'GUN') ac.trigger = true;
    this.debugText = `${this.state}/${this.maneuver}`;
  }

  private flyTakeoff(dt: number): void {
    const ac = this.ac;
    const fm = ac.fm;
    const c = ac.controls;
    c.gearDown = true;
    c.speedbrake = false;
    c.throttle = this.skill.abUse > 0.5 ? 1.1 : 1.0;
    c.wheelBrake = 0;
    if (fm.onGround) {
      const vr = ac.spec.rotateKts * KT;
      c.pitch = fm.tas > vr ? 0.55 : 0;
      c.roll = 0;
      // hold runway heading
      const f = fm.surfaceField;
      if (f) {
        let err = f.heading - fm.heading;
        if (Math.abs(err) > 90) err = (f.heading + 180) - fm.heading;
        err = ((err + 540) % 360) - 180;
        c.yaw = clamp(err * 0.08, -1, 1);
      }
    } else {
      c.yaw = 0;
      this.desired.copy(fm.fwd).setY(0).normalize();
      this.desired.y = Math.tan(12 * DEG);
      this.desired.normalize();
      steerToward(ac, this.desired, { gCap: 3, tau: 1.5, maxBank: 10 });
      if (fm.agl > 30) c.gearDown = false;
      c.throttle = this.skill.abUse > 0.5 ? 1.1 : 1.0;
    }
    void dt;
  }

  private altitudeDir(targetAlt: number, horiz: THREE.Vector3, maxClimbDeg = 25): THREE.Vector3 {
    const fm = this.ac.fm;
    const err = targetAlt - fm.pos.y;
    const climb = clamp(err / 2500, -1, 1) * maxClimbDeg * DEG;
    _dir.copy(horiz).setY(0);
    if (_dir.lengthSq() < 1e-6) _dir.set(fm.fwd.x, 0, fm.fwd.z);
    _dir.normalize();
    _dir.y = Math.tan(climb);
    return _dir.normalize();
  }

  private flyPatrol(sim: Sim): void {
    const ac = this.ac;
    const fm = ac.fm;
    this.maxBank = Math.min(45, this.skill.gentleBank);
    this.gCap = Math.min(this.gCap, 3);
    this.useAb = false;
    if (this.route.length === 0) {
      _tmp.set(fm.fwd.x, 0, fm.fwd.z);
    } else {
      const wp = this.route[this.routeIdx % this.route.length];
      _tmp.subVectors(wp, fm.pos);
      if (Math.hypot(_tmp.x, _tmp.z) < 8000) this.routeIdx = (this.routeIdx + 1) % this.route.length;
      // radar weave to widen the search volume
      const weave = Math.sin(this.weaveT / 18) * 25 * DEG;
      const a = Math.atan2(_tmp.x, -_tmp.z) + weave;
      _tmp.set(Math.sin(a), 0, -Math.cos(a));
    }
    this.desired.copy(this.altitudeDir(this.patrolAlt, _tmp, 12));
    const machCas = this.cruiseMach * fm.soundSpeed * Math.sqrt(fm.rho / 1.225);
    this.desiredCas = machCas;
    void sim;
  }

  private flyFormation(): void {
    const ac = this.ac;
    const lead = this.leader!.ac;
    const lf = lead.fm;
    // slot: offset in the leader's horizontal frame
    const h = Math.atan2(lf.fwd.x, -lf.fwd.z);
    const ox = this.formationOffset.x, oz = this.formationOffset.z;
    const slot = _tmp2.set(lf.pos.x + Math.cos(h) * ox - Math.sin(h) * oz, lf.pos.y + this.formationOffset.y, lf.pos.z + Math.sin(h) * ox + Math.cos(h) * oz);
    // aim at a point ahead of the slot
    _aim.copy(slot).addScaledVector(lf.vel, 3);
    this.desired.subVectors(_aim, ac.fm.pos).normalize();
    const dist = slot.distanceTo(ac.fm.pos);
    _tmp.subVectors(slot, ac.fm.pos);
    const ahead = _tmp.dot(lf.fwd);
    this.desiredCas = lf.cas + clamp(ahead * 0.08, -60, 80);
    this.gCap = Math.min(this.gCap, 4);
    this.maxBank = 60;
    this.useAb = ahead > 1500 && this.skill.abUse > 0;
    void dist;
  }

  private interceptPoint(out: THREE.Vector3): THREE.Vector3 {
    const fm = this.ac.fm;
    const p = this.knownPos;
    const v = this.knownVel;
    if (!this.skill.leadIntercept) return out.copy(p);
    // solve |p + v t - me| = s t
    const s = Math.max(fm.vel.length(), 200);
    const rx = p.x - fm.pos.x, ry = p.y - fm.pos.y, rz = p.z - fm.pos.z;
    const a = v.lengthSq() - s * s;
    const b = 2 * (rx * v.x + ry * v.y + rz * v.z);
    const c = rx * rx + ry * ry + rz * rz;
    let t = 0;
    const disc = b * b - 4 * a * c;
    if (Math.abs(a) < 1e-6) t = -c / Math.max(b, 1e-6);
    else if (disc >= 0) {
      const t1 = (-b - Math.sqrt(disc)) / (2 * a);
      const t2 = (-b + Math.sqrt(disc)) / (2 * a);
      t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
      if (!isFinite(t)) t = 0;
    }
    t = clamp(t, 0, 120);
    return out.set(p.x + v.x * t, p.y + v.y * t, p.z + v.z * t);
  }

  private flyIntercept(sim: Sim): void {
    const ac = this.ac;
    const fm = ac.fm;
    const sk = this.skill;
    const age = sim.time - this.knownTime;
    _aim.copy(this.knownPos).addScaledVector(this.knownVel, Math.min(age, 20));
    const tmpKnown = this.knownPos.clone();
    this.knownPos.copy(_aim);
    this.interceptPoint(_aim);
    this.knownPos.copy(tmpKnown);
    // teamwork: pincer / bracket -- offset the approach to each side
    if (sk.teamwork > 0.3) {
      _tmp.subVectors(_aim, fm.pos);
      const d = _tmp.length();
      if (d > 15000) {
        _tmp2.set(-_tmp.z, 0, _tmp.x).normalize();
        _aim.addScaledVector(_tmp2, this.bracketSide * Math.min(d * 0.35, 25000) * sk.teamwork);
      }
    }
    _tmp.subVectors(_aim, fm.pos);
    // altitude: hard+ climbs for an energy advantage, easy stays put
    const tgtAlt = sk.level > 0.5 ? Math.max(this.knownPos.y + 1500, 6000) : Math.max(this.knownPos.y, 3000);
    this.desired.copy(this.altitudeDir(tgtAlt, _tmp, 18));
    // final approach: point at target when close enough
    if (_tmp.length() < 25000) this.desired.copy(_tmp).normalize();
    const cruise = sk.abUse >= 0.7 ? 1.3 : 0.9;
    this.desiredCas = cruise * fm.soundSpeed * Math.sqrt(fm.rho / 1.225);
    this.useAb = sk.abUse >= 0.7 || (sk.abUse > 0 && fm.vs > 20);
    this.gCap = Math.min(this.gCap, 5);
    this.maxBank = sk.level < 0.2 ? this.skill.gentleBank : undefined;
    // exploit: target's nose pointing away -> full afterburner to close
    if (sk.exploit && this.target) {
      _tmp2.subVectors(fm.pos, this.target.fm.pos).normalize();
      if (this.target.fm.fwd.dot(_tmp2) < -0.3) {
        this.useAb = true;
        this.desiredCas = 2 * fm.soundSpeed;
      }
    }
  }

  private flyEngage(dt: number, sim: Sim): void {
    const ac = this.ac;
    const fm = ac.fm;
    const sk = this.skill;
    const t = this.target;
    if (!t) {
      this.flyPatrol(sim);
      return;
    }
    const tp = t.fm.pos;
    const tv = t.fm.vel;
    const R = fm.pos.distanceTo(tp);
    const corner = ac.spec.cornerKts * KT;
    this.desiredCas = corner * lerp(1.15, 1.0, sk.energy);
    this.useAb = sk.abUse >= 0.7 || (sk.abUse > 0 && fm.cas < corner * 0.8);
    this.gCap = Math.min(sk.maxG, ac.spec.gOverride);
    this.tau = lerp(1.6, 0.35, sk.level);

    const muzzle = ac.spec.gun.muzzleVelocity;
    // beyond the merge: fly the intercept, closing fast (running targets get full burner)
    if (R > 5500 && this.maneuver !== 'crank' && this.maneuver !== 'extend' && this.maneuver !== 'gentle') {
      const keepKnown = this.knownPos.clone();
      const keepVel = this.knownVel.clone();
      this.knownPos.copy(tp);
      this.knownVel.copy(tv);
      this.interceptPoint(_aim);
      this.knownPos.copy(keepKnown);
      this.knownVel.copy(keepVel);
      this.desired.subVectors(_aim, fm.pos).normalize();
      _tmp.subVectors(fm.pos, tp).normalize();
      const running = t.fm.fwd.dot(_tmp) < 0.2;
      const closeMach = running ? lerp(1.0, 1.6, sk.level) : lerp(0.85, 1.05, sk.level);
      this.desiredCas = closeMach * fm.soundSpeed * Math.sqrt(fm.rho / 1.225);
      this.useAb = sk.abUse > 0 && (running || sk.abUse >= 0.7);
      this.gCap = Math.min(this.gCap, 6);
      this.tau = 1.0;
      return;
    }
    switch (this.maneuver) {
      case 'gentle': {
        // easy AI: predictable constant-bank arcs toward the target
        this.maxBank = sk.gentleBank;
        this.gCap = Math.min(this.gCap, 4);
        this.desired.subVectors(tp, fm.pos).normalize();
        this.useAb = false;
        this.desiredCas = corner * 1.1;
        break;
      }
      case 'crank': {
        // keep the target at ~50 deg off the nose (inside radar gimbal) while the AMRAAM flies
        _tmp.subVectors(tp, fm.pos).setY(0).normalize();
        const side = this.bracketSide;
        const a = Math.atan2(_tmp.x, -_tmp.z) + side * 48 * DEG;
        _tmp.set(Math.sin(a), 0, -Math.cos(a));
        this.desired.copy(this.altitudeDir(Math.max(tp.y, fm.pos.y), _tmp, 8));
        this.gCap = Math.min(this.gCap, 4);
        this.desiredCas = 0.9 * fm.soundSpeed * Math.sqrt(fm.rho / 1.225);
        break;
      }
      case 'lead': {
        // lead pursuit: aim where the target will be when the bullets arrive
        gunSolution(ac, t, _aim);
        this.desired.subVectors(_aim, fm.pos).normalize();
        break;
      }
      case 'lag': {
        // aim behind the target to avoid overshooting
        _aim.copy(tp).addScaledVector(tv, -1.2);
        this.desired.subVectors(_aim, fm.pos).normalize();
        this.desiredCas = corner * 0.9;
        break;
      }
      case 'highYoyo': {
        _aim.copy(tp).addScaledVector(tv, 0.5);
        _aim.y += Math.min(1200, R * 0.6);
        this.desired.subVectors(_aim, fm.pos).normalize();
        this.useAb = false;
        break;
      }
      case 'lowYoyo': {
        _aim.copy(tp).addScaledVector(tv, 1.5);
        _aim.y -= Math.min(1500, R * 0.5);
        this.desired.subVectors(_aim, fm.pos).normalize();
        this.useAb = true;
        break;
      }
      case 'vertical': {
        // zoom into the vertical, then roll back down onto the target
        _aim.copy(tp);
        _aim.y += 2500;
        this.desired.subVectors(_aim, fm.pos).normalize();
        if (fm.cas < corner * 0.75) this.maneuver = 'pursuit';
        break;
      }
      case 'scissors': {
        // rolling reversals, throttle back to force the overshoot
        this.jinkTimer -= dt;
        if (this.jinkTimer <= 0) {
          this.jinkTimer = rand(1.8, 2.8);
          this.scissorSign = -this.scissorSign;
        }
        _tmp.subVectors(tp, fm.pos).normalize();
        _tmp2.crossVectors(fm.fwd, new THREE.Vector3(0, 1, 0)).normalize();
        this.desired.copy(_tmp).addScaledVector(_tmp2, this.scissorSign * 0.9).normalize();
        this.desiredCas = corner * 0.55;
        this.useAb = false;
        this.rudder = this.scissorSign * 0.3;
        break;
      }
      case 'extend': {
        // unload and run 40 deg off the bandit's nose, full afterburner
        _tmp.subVectors(fm.pos, tp).setY(0).normalize();
        const a = Math.atan2(_tmp.x, -_tmp.z) + this.bracketSide * 40 * DEG;
        _tmp.set(Math.sin(a), 0, -Math.cos(a));
        this.desired.copy(this.altitudeDir(Math.max(fm.pos.y, 2500), _tmp, 6));
        this.gCap = Math.min(this.gCap, 4);
        this.useAb = sk.abUse > 0;
        this.desiredCas = corner * 1.4;
        if (R > 3500) this.maneuverTimer = 0;
        break;
      }
      default: {
        // pure pursuit
        this.desired.subVectors(tp, fm.pos).normalize();
      }
    }

    // energy discipline: below corner speed, don't bleed more with max-G pulls
    const aimOff = noseAngleTo(ac, tp);
    if (sk.energy > 0.3 && fm.cas < corner * 0.82 && aimOff > 12 * DEG && this.maneuver !== 'scissors') {
      this.gCap = Math.min(this.gCap, lerp(6, 4.2, sk.energy));
      this.useAb = sk.abUse > 0;
    }

    // gun solution: track and fire (per-frame, even for slow thinkers -- but
    // aim error scales with skill)
    if (ac.selectedWeapon === 'GUN' && R < sk.gunRange && ac.gunAmmo > 0) {
      gunSolution(ac, t, _aim);
      const err = sk.aimError / 1000;
      this.aimNoiseTimer -= dt;
      if (this.aimNoiseTimer <= 0) {
        this.aimNoiseTimer = rand(0.4, 0.9);
        this.aimNoise.set(randGauss(), randGauss(), randGauss()).multiplyScalar(err);
      }
      _aim.addScaledVector(this.aimNoise, R);
      const gl = gunLine(ac, _tmp2);
      _tmp.subVectors(_aim, fm.pos).normalize();
      const aimAngle = Math.acos(clamp(_tmp.dot(gl), -1, 1));
      if (aimAngle < 20 * DEG) {
        // steer so the gun line -- not the velocity vector -- sits on the aim
        // point: offset the velocity goal by the current gun-line-to-velocity angle
        this.desired.copy(_tmp);
        _tmp.copy(fm.vel).normalize();
        _tmp2.sub(_tmp);
        this.desired.sub(_tmp2).normalize();
        this.tau = lerp(0.8, 0.22, sk.level);
        // commit the G needed for the snapshot (Extreme pulls to the limit here)
        this.gCap = Math.min(sk.maxG, ac.spec.gOverride);
      }
      // fire when the predicted miss distance is inside the target's size
      const tol = Math.atan2(ac.spec.span * 0.6 * lerp(0.8, 1.2, sk.level), Math.max(R, 50));
      this.triggerWanted = aimAngle < tol;
    }

    // easy AI never pulls hard
    if (sk.level < 0.2) this.gCap = Math.min(this.gCap, sk.maxG);
  }

  private flyDefensive(dt: number, sim: Sim): void {
    const ac = this.ac;
    const fm = ac.fm;
    const sk = this.skill;
    const mw = ac.rwr.primaryMissile;
    this.gCap = Math.min(sk.maxG, ac.spec.gOverride);
    this.tau = lerp(1.2, 0.3, sk.level);
    this.useAb = sk.abUse > 0.3;
    this.desiredCas = ac.spec.cornerKts * KT * 1.1;
    this.cmTimer -= dt;

    if (mw) {
      const m = mw.missile;
      _tmp.subVectors(m.pos, fm.pos).setY(0).normalize(); // toward missile (horizontal)
      // beam: put the missile on the 3 or 9 o'clock
      const right = _tmp2.set(-_tmp.z, 0, _tmp.x);
      const side = right.dot(fm.fwd) >= 0 ? 1 : -1;
      _dir.copy(right).multiplyScalar(side);
      if (this.maneuver === 'break' || mw.tti < 3) {
        // last-ditch: hard turn across the missile's path
        _dir.addScaledVector(_tmp, 0.35).normalize();
        this.gCap = Math.min(sk.maxG, ac.spec.gOverride);
        this.tau = 0.25;
      } else {
        this.gCap = Math.min(this.gCap, 7);
      }
      // dive into the clutter for the notch (radar) / keep energy (IR)
      let targetAlt = fm.pos.y;
      if (mw.kind === 'radar' && sk.level > 0.25) targetAlt = Math.max(terrainHeight(fm.pos.x, fm.pos.z), 0) + Math.max(sk.minAgl, 500);
      this.desired.copy(this.altitudeDir(targetAlt, _dir, 30));
      // countermeasures, rhythmically
      if (this.cmTimer <= 0) {
        this.cmTimer = lerp(1.6, 0.5, sk.cmUse);
        if (chance(sk.cmUse)) ac.dispense(mw.kind === 'ir' ? 'flare' : 'chaff', mw.tti < 4 ? 3 : 1);
      }
      if (mw.kind === 'ir' && sk.throttleCut) {
        this.useAb = false;
        this.desiredCas = 0; // idle
      }
      return;
    }
    // guns defense: break into the attacker, then jink out of plane
    const threat = this.gunThreat(sim);
    if (threat) {
      _tmp.subVectors(threat.fm.pos, fm.pos).normalize();
      _tmp2.crossVectors(fm.fwd, _tmp).normalize();
      _dir.crossVectors(_tmp2, fm.fwd).normalize(); // lift toward the attacker's side
      this.jinkTimer -= dt;
      if (sk.advancedBfm && this.jinkTimer <= 0) {
        this.jinkTimer = rand(0.8, 1.6);
        this.jinkDir.set(randGauss(), randGauss() * 0.5, randGauss()).normalize();
      }
      this.desired.copy(fm.fwd).addScaledVector(_dir, 1.4);
      if (sk.advancedBfm) this.desired.addScaledVector(this.jinkDir, 0.5);
      this.desired.normalize();
      this.tau = 0.3;
      if (this.cmTimer <= 0) {
        this.cmTimer = 1.2;
        if (chance(sk.cmUse * 0.6)) ac.dispense('flare', 2);
      }
      return;
    }
    // nothing obvious: keep turning
    this.desired.copy(fm.fwd).addScaledVector(fm.right, 0.6).normalize();
  }

  private flyMasking(): void {
    const ac = this.ac;
    const fm = ac.fm;
    const p = this.maskPoint;
    if (!p) {
      this.state = 'PATROL';
      return;
    }
    _tmp.subVectors(p, fm.pos);
    // terrain-follow toward the hide point at low level
    const ground = Math.max(0, terrainHeight(fm.pos.x, fm.pos.z));
    const ahead = Math.max(0, terrainHeight(fm.pos.x + fm.vel.x * 4, fm.pos.z + fm.vel.z * 4));
    const alt = Math.max(ground, ahead) + Math.max(this.skill.minAgl, 200);
    this.desired.copy(this.altitudeDir(alt, _tmp, 25));
    this.desiredCas = ac.spec.cornerKts * KT * 1.2;
    this.useAb = true;
    this.gCap = Math.min(this.skill.maxG, 7);
    this.tau = 0.8;
  }

  private flyRtb(sim: Sim): void {
    const ac = this.ac;
    const fm = ac.fm;
    // head home at best-range speed
    let best: THREE.Vector3 | null = null;
    for (const s of this.route) if (!best || s.distanceTo(fm.pos) < best.distanceTo(fm.pos)) best = s;
    _tmp.set(-fm.pos.x, 0, -fm.pos.z);
    if (best) _tmp.subVectors(best, fm.pos);
    this.desired.copy(this.altitudeDir(9000, _tmp, 8));
    this.desiredCas = 0.8 * fm.soundSpeed * Math.sqrt(fm.rho / 1.225);
    this.useAb = false;
    this.gCap = 3;
    void sim;
  }

  /** Avoid mid-air collisions with anyone (friend or foe): closest-point-of-approach check. */
  private separation(sim: Sim): void {
    const fm = this.ac.fm;
    for (const o of sim.aircraft) {
      if (o === this.ac || (!o.alive && o.fm.crashed)) continue;
      _tmp.subVectors(o.fm.pos, fm.pos); // relative position
      const d = _tmp.length();
      if (d > 3500) continue;
      _tmp2.subVectors(o.fm.vel, fm.vel); // relative velocity
      const vv = _tmp2.lengthSq();
      const tca = vv > 1 ? -_tmp.dot(_tmp2) / vv : 0;
      if (tca < 0 || tca > 3.2) {
        if (d > 90) continue;
      }
      const t = Math.max(0, Math.min(tca, 3.2));
      const mx = _tmp.x + _tmp2.x * t, my = _tmp.y + _tmp2.y * t, mz = _tmp.z + _tmp2.z * t;
      const miss = Math.sqrt(mx * mx + my * my + mz * mz);
      if (miss > 75 && d > 90) continue;
      // escape perpendicular to the relative motion, preferring vertical separation
      _dir.set(-mx, -my, -mz);
      if (_dir.lengthSq() < 1) _dir.set(0, o.fm.pos.y > fm.pos.y ? -1 : 1, 0);
      _dir.normalize();
      _dir.y += o.fm.pos.y > fm.pos.y ? -0.6 : 0.6;
      _dir.addScaledVector(fm.vel, -_dir.dot(fm.vel) / Math.max(fm.vel.lengthSq(), 1));
      if (_dir.lengthSq() < 1e-4) _dir.copy(fm.up);
      this.desired.copy(fm.fwd).addScaledVector(_dir.normalize(), 1.5).normalize();
      this.gCap = Math.max(this.gCap, Math.min(7, this.ac.spec.gLimit));
      this.tau = 0.2;
      this.triggerWanted = false;
      return;
    }
  }

  /** Predictive ground-collision avoidance (every AI, every frame). */
  private terrainSafety(dt: number, sim: Sim): void {
    const ac = this.ac;
    const fm = ac.fm;
    const sk = this.skill;
    const V = fm.vel.length();
    if (V < 30) return;
    const vhat = _tmp.copy(fm.vel).divideScalar(V);
    const look = V * sk.terrainLookahead;
    const clearance = Math.max(60, sk.minAgl * 0.45);
    let hit = sim.grid.raycast(fm.pos.x, fm.pos.y, fm.pos.z, vhat.x, vhat.y, vhat.z, look, clearance);
    // also probe along the desired direction
    if (!isFinite(hit)) {
      const d = this.desired;
      const hitD = sim.grid.raycast(fm.pos.x, fm.pos.y, fm.pos.z, d.x, d.y, d.z, look * 0.7, clearance);
      if (isFinite(hitD)) hit = hitD * 1.3;
    }
    const low = fm.agl < clearance && vhat.y < 0.05;
    const sea = fm.pos.y < 80 && vhat.y < 0;
    if (isFinite(hit) || low || sea) this.terrainRecovery = Math.max(this.terrainRecovery, 1.2);
    if (this.terrainRecovery > 0) {
      this.terrainRecovery -= dt;
      // wings level-ish and pull toward the sky
      _dir.set(fm.fwd.x, 0, fm.fwd.z).normalize();
      const urgency = isFinite(hit) ? clamp(1 - hit / look, 0.2, 1) : 0.8;
      _dir.y = lerp(0.35, 1.2, urgency);
      this.desired.copy(_dir.normalize());
      this.gCap = Math.max(this.gCap, Math.min(ac.spec.gLimit, 5 + urgency * 4));
      this.tau = 0.3;
      this.useAb = true;
      this.desiredCas = Math.max(this.desiredCas, ac.spec.cornerKts * KT);
      this.triggerWanted = false;
    }
  }

  private boundarySafety(): void {
    const fm = this.ac.fm;
    const lim = MAP_HALF - 25000;
    if (Math.abs(fm.pos.x) > lim || Math.abs(fm.pos.z) > lim) {
      _tmp.set(-fm.pos.x, 0, -fm.pos.z).normalize();
      this.desired.lerp(_tmp, 0.7).normalize();
    }
    // service ceiling: don't try to climb past it
    if (fm.pos.y > this.ac.spec.ceilingFt * FT - 1500 && this.desired.y > 0) this.desired.y = -0.05;
  }
}

/** Build a patrol route through a list of world points at an altitude. */
export function makeRoute(points: { x: number; z: number }[], alt: number): THREE.Vector3[] {
  return points.map((p) => new THREE.Vector3(p.x, alt, p.z));
}

export const AI_MISSILE_INFO = MISSILES;
