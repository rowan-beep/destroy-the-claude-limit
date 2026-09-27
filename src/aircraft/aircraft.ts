// An aircraft in the simulation: one of the three allowed fighters, flown
// by the player or an AI pilot. Owns its flight model, weapons, sensors,
// countermeasures, damage state and pilot physiology.

import * as THREE from 'three';
import { AircraftSpec, AircraftType, getSpec, StationDef, StoreType, TANK_FUEL, LoadoutPreset, STORES } from './specs';
import { FlightModel, FlightControls, neutralControls } from './flightModel';
import { PilotPhysiology } from './pilot';
import { DamageModel } from './damage';
import { Team, DEG, NM, G0 } from '../core/constants';
import { Radar } from '../sensors/radar';
import { Irst } from '../sensors/irst';
import { Rwr } from '../sensors/rwr';
import { WeaponSelect, MissileType, MISSILES, launchZone, isIrMissile } from '../weapons/weaponSpecs';
import { Missile } from '../weapons/missile';
import { irIntensity } from '../sensors/signatures';
import type { Sim } from '../game/sim';
import type { AIPilot } from '../ai/pilot';
import type { PaintConfig } from './models/paint';
import { storeCenterY, storeCenterX } from './models/stores';
import { hostile, RULES } from '../game/rules';
import { clamp } from '../core/math';

export interface StationState {
  def: StationDef;
  store: StoreType | null;
}

let nextAircraftId = 1;

const _tmp = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Aircraft {
  readonly id = nextAircraftId++;
  readonly spec: AircraftSpec;
  readonly fm: FlightModel;
  readonly controls: FlightControls = neutralControls();
  readonly pilot = new PilotPhysiology();
  readonly damage = new DamageModel();
  readonly radar: Radar;
  readonly irst: Irst | null;
  readonly rwr: Rwr;
  stations: StationState[] = [];
  loadout: LoadoutPreset;
  gunAmmo: number;
  chaff: number;
  flares: number;
  selectedWeapon: WeaponSelect = 'GUN';
  alive = true;
  ejected = false;
  destroyedAt = 0;
  killCredited = false;
  ai: AIPilot | null = null;
  isPlayer = false;
  trigger = false;
  gunFiring = false;
  private gunAccum = 0;
  private roundCounter = 0;
  private cmQueue: { kind: 'flare' | 'chaff'; t: number }[] = [];
  private cmTimer = 0;
  private autoCmTimer = 0;
  lastHitBy: { shooter: Aircraft | null; weapon: string; time: number } | null = null;
  /** IR missile (AIM-9X / R-74M) seeker state before launch */
  seekerTarget: Aircraft | null = null;
  seekerTone: 'off' | 'search' | 'lock' = 'off';
  private seekerTimer = 0;
  missileCooldown = 0;
  kills = 0;
  deaths = 0;
  shotsFired = 0;
  onRunwayStopped = false;
  lastLaunched: Missile | null = null;
  /** gun rate selector (SMS page): low rate saves rounds */
  gunRateLow = false;
  /** self-protection jammer (EW page); AI jets always run theirs */
  jammerOn = true;
  /** countermeasure program: expendables per press */
  cmBurst = 2;
  /**
   * Helmet-mounted cueing: the pilot's line of sight (world direction) while
   * looking off-boresight. The AIM-9X seeker searches around it instead of
   * the nose.
   */
  headLos: THREE.Vector3 | null = null;
  /** user-facing name */
  callsign: string;
  /** AI paint job (waves / 5v5); the player's own comes from the customize screen */
  paint: PaintConfig | null = null;
  /**
   * Multiplayer: flown by another player on another computer. Its state comes
   * over the network; locally it is only dead-reckoned between updates, and
   * nothing done to it here (damage, crashes) counts -- its own client decides.
   */
  remote = false;
  /** multiplayer player id (0 = not networked) */
  netId = 0;
  private remoteGunAcc = 0;

  constructor(
    type: AircraftType,
    readonly team: Team,
    callsign: string,
    loadoutId?: string,
  ) {
    this.spec = getSpec(type);
    this.fm = new FlightModel(this.spec);
    this.radar = new Radar(this);
    this.irst = this.spec.irst ? new Irst(this) : null;
    this.rwr = new Rwr(this);
    this.callsign = callsign;
    this.loadout = this.spec.loadouts.find((l) => l.id === loadoutId) ?? this.spec.loadouts[0];
    this.gunAmmo = this.spec.gun.rounds;
    this.chaff = this.spec.chaff;
    this.flares = this.spec.flares;
    this.applyLoadout(this.loadout);
  }

  get type(): AircraftType {
    return this.spec.type;
  }

  /** This jet's radar-guided missile (AIM-120D, or R-77M on the Su-35S). */
  get radarMissile(): MissileType {
    return this.spec.missiles.radar;
  }

  /** This jet's infrared missile (AIM-9X, or R-74M on the Su-35S). */
  get irMissile(): MissileType {
    return this.spec.missiles.ir;
  }

  applyLoadout(l: LoadoutPreset): void {
    this.loadout = l;
    this.stations = this.spec.stations.map((def) => ({ def, store: l.stores[def.id] ?? null }));
    this.refreshStores();
    this.fm.fuelExternal = this.fm.fuelExternalCap;
    if (this.countOf(this.radarMissile) > 0) this.selectedWeapon = this.radarMissile;
    else if (this.countOf(this.irMissile) > 0) this.selectedWeapon = this.irMissile;
    else this.selectedWeapon = 'GUN';
  }

  /** Override stores (AI waves use restricted weapons). */
  setStores(stores: Record<number, StoreType>): void {
    this.applyLoadout({ id: 'custom', name: 'CUSTOM', stores });
  }

  refreshStores(): void {
    const list: StoreType[] = [];
    let tanks = 0;
    for (const s of this.stations) {
      if (s.store) list.push(s.store);
      if (s.store === 'TANK') tanks++;
    }
    this.fm.setStores(list, tanks * TANK_FUEL);
    // stores far out on the wings make the jet slower to start and stop a roll
    let inertia = 0;
    for (const s of this.stations) if (s.store) inertia += STORES[s.store].mass * s.def.pos[0] * s.def.pos[0] * (s.store === 'TANK' ? 1.6 : 1);
    this.fm.storeRollInertia = inertia;
    this.fm.ammoMass = this.gunAmmo * (this.spec.gun.caliberMm > 25 ? 0.5 : 0.26);
  }

  storeCount(): number {
    let n = 0;
    for (const s of this.stations) if (s.store) n++;
    return n;
  }

  countOf(t: StoreType): number {
    let n = 0;
    for (const s of this.stations) if (s.store === t) n++;
    return n;
  }

  /** Jettison external fuel tanks. */
  dropTanks(sim: Sim): boolean {
    let any = false;
    for (const s of this.stations) {
      if (s.store === 'TANK') {
        s.store = null;
        any = true;
        sim.events.emit('storeDropped', { aircraft: this, station: s.def.id });
      }
    }
    if (any) {
      const ext = this.fm.fuelExternal;
      this.refreshStores();
      this.fm.fuelExternal = 0;
      void ext;
    }
    return any;
  }

  rearm(fullFuel = true): void {
    this.applyLoadout(this.loadout);
    this.gunAmmo = this.spec.gun.rounds;
    this.chaff = this.spec.chaff;
    this.flares = this.spec.flares;
    if (fullFuel) {
      this.fm.fuelInternal = this.spec.internalFuel;
      this.fm.fuelExternal = this.fm.fuelExternalCap;
    }
    this.damage.reset();
    this.fm.engineOut.fill(false);
    this.fm.overG = 0;
    this.refreshStores();
  }

  /**
   * Helmet "look and lock": the hostile nearest the pilot's line of sight
   * within 10 deg, visible (terrain) and inside 12 NM.
   */
  helmetTarget(sim: Sim, los: THREE.Vector3): Aircraft | null {
    let best: Aircraft | null = null;
    let bestAng = 10 * DEG;
    for (const t of sim.aircraft) {
      if (!t.alive || !hostile(t, this)) continue;
      _tmp.subVectors(t.fm.pos, this.fm.pos);
      const d = _tmp.length();
      if (d > 12 * NM || d < 50) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, _tmp.dot(los) / d)));
      if (ang < bestAng && sim.lineOfSight(this.fm.pos, t.fm.pos)) {
        bestAng = ang;
        best = t;
      }
    }
    return best;
  }

  /** Primary target from sensors (radar STT, IRST lock). */
  get lockedTarget(): Aircraft | null {
    if (this.radar.lock && this.radar.lock.alive) return this.radar.lock;
    if (this.irst?.lock && this.irst.lock.alive) return this.irst.lock;
    return null;
  }

  /** Does any own sensor hold a track good enough to guide a missile? */
  sensorTrack(t: Aircraft): boolean {
    if (!this.alive) return false;
    const now = this.simTime;
    if (this.radar.isTracking(t, now)) return true;
    if (this.irst?.isTracking(t)) return true;
    return false;
  }
  simTime = 0;

  cycleWeapon(): WeaponSelect {
    const order: WeaponSelect[] = [this.radarMissile, this.irMissile, 'GUN'];
    let i = order.indexOf(this.selectedWeapon);
    for (let k = 0; k < 3; k++) {
      i = (i + 1) % 3;
      const w = order[i];
      if (w === 'GUN' || this.countOf(w) > 0) {
        this.selectedWeapon = w;
        break;
      }
    }
    return this.selectedWeapon;
  }

  selectWeapon(w: WeaponSelect): boolean {
    if (w !== 'GUN' && w !== this.radarMissile && w !== this.irMissile) return false;
    if (w !== 'GUN' && this.countOf(w) === 0) return false;
    this.selectedWeapon = w;
    return true;
  }

  // -------------------------------------------------------------------------
  // Simulation step
  // -------------------------------------------------------------------------

  step(dt: number, sim: Sim): void {
    this.simTime = sim.time;
    const fm = this.fm;
    if (this.remote) {
      this.stepRemote(dt, sim);
      return;
    }
    if (this.missileCooldown > 0) this.missileCooldown -= dt;

    if (this.alive) {
      if (this.ai) this.ai.update(dt, sim);
      // G-LOC: pilot is out, hands off the controls (stick goes neutral)
      if (this.pilot.unconscious) {
        const c = this.controls;
        c.pitch = 0;
        c.roll = 0;
        c.yaw = 0;
        this.trigger = false;
      }
    } else {
      // uncontrolled wreck
      const c = this.controls;
      c.throttle = 0;
      c.pitch = 0.3;
      c.roll = this.damage.wingLost === 'L' ? -1 : 1;
      c.yaw = 0;
      this.trigger = false;
      fm.damage.lift = Math.min(fm.damage.lift, 0.35);
    }

    this.updateWake(sim);
    fm.step(dt, this.controls);
    this.pilot.update(dt, this.alive ? fm.nz : 1);
    if (this.pilot.justBlackedOut) sim.events.emit('gloc', { aircraft: this });
    this.damage.update(dt, fm);

    if (this.alive) {
      if (fm.structuralFailure) this.destroy(sim, 'STRUCTURAL FAILURE (OVER-G)', null);
      else if (fm.overG > 2.5 && Math.random() < dt * 0.3) {
        this.damage.apply(Math.random() < 0.5 ? 'wingL' : 'wingR', 12);
      }
      if (this.damage.destroyed) this.destroy(sim, this.damage.destroyCause, this.lastHitBy?.shooter ?? null);
      if (fm.crashed) this.destroy(sim, fm.crashCause, this.lastHitBy && sim.time - this.lastHitBy.time < 25 ? this.lastHitBy.shooter : null);
    }
    if (fm.crashed && !this.crashHandled) {
      this.crashHandled = true;
      sim.events.emit('crash', { aircraft: this, pos: fm.pos.clone(), water: fm.surfaceKind === 'water' });
    }

    // systems
    this.radar.update(dt, sim);
    this.irst?.update(dt, sim);
    this.rwr.update(dt, sim);
    if (this.alive) {
      this.updateSeeker(dt, sim);
      this.updateGun(dt, sim);
      this.updateCountermeasures(dt, sim);
    }
    this.onRunwayStopped = fm.onGround && fm.gs < 2 && !!fm.surfaceField && fm.surfaceField.team === this.team;
  }
  crashHandled = false;

  /** Remote jet: dead-reckon between network updates, show its gunfire. */
  private stepRemote(dt: number, sim: Sim): void {
    const fm = this.fm;
    if (!fm.crashed) fm.pos.addScaledVector(fm.vel, dt);
    if (this.gunFiring && this.alive) {
      // tracers only: its own client decides what they hit
      this.remoteGunAcc += (this.spec.gun.rpm / 60) * dt;
      while (this.remoteGunAcc >= 1) {
        this.remoteGunAcc -= 1;
        this.roundCounter++;
        sim.bullets.spawn(this, this.roundCounter % 4 === 0);
      }
    } else this.remoteGunAcc = 0;
    if (fm.crashed && !this.crashHandled) {
      this.crashHandled = true;
      sim.events.emit('crash', { aircraft: this, pos: fm.pos.clone(), water: fm.surfaceKind === 'water' });
    }
  }

  destroy(sim: Sim, cause: string, killer: Aircraft | null): void {
    if (!this.alive) return;
    this.alive = false;
    this.destroyedAt = sim.time;
    this.deaths++;
    this.trigger = false;
    this.gunFiring = false;
    this.fm.gunRecoil = 0;
    this.radar.lock = null;
    if (this.irst) this.irst.lock = null;
    const weapon = this.lastHitBy && killer === this.lastHitBy.shooter ? this.lastHitBy.weapon : 'CRASH';
    if (killer && killer !== this) killer.kills++;
    sim.events.emit('destroyed', { victim: this, killer, weapon, cause });
  }

  eject(sim: Sim): void {
    if (!this.alive || this.ejected) return;
    this.ejected = true;
    sim.events.emit('eject', { aircraft: this });
    const killer = this.lastHitBy && sim.time - this.lastHitBy.time < 30 ? this.lastHitBy.shooter : null;
    this.destroy(sim, 'PILOT EJECTED', killer);
  }

  // -------------------------------------------------------------------------
  // Wake turbulence
  // -------------------------------------------------------------------------

  /**
   * Flying through another jet's wake: its two trailing vortices sink slowly
   * and spread behind it. Between them the air flows down, outside them up,
   * and a wing near one core is rolled hard. Strongest close behind a heavy,
   * slow, hard-pulling jet; gone about a kilometre back.
   */
  private updateWake(sim: Sim): void {
    const fm = this.fm;
    let gust = 0, roll = 0;
    if (!fm.onGround) {
      for (const o of sim.aircraft) {
        if (o === this || o.fm.crashed || o.fm.onGround) continue;
        const ov = o.fm.vel;
        const V = ov.length();
        if (V < 60) continue;
        _tmp.subVectors(fm.pos, o.fm.pos);
        if (_tmp.lengthSq() > 1200 * 1200) continue;
        const behind = -_tmp.dot(ov) / V;
        if (behind < 12 || behind > 1100) continue;
        // offset from the wake axis, which sinks about 1.5 m/s behind the jet
        const age = behind / V;
        _tmp.addScaledVector(ov, age);
        _tmp.y += Math.min(age, 20) * 1.5;
        const R = o.spec.span * 0.55 + behind * 0.02;
        const r2 = _tmp.lengthSq();
        if (r2 > 9 * R * R) continue;
        // vortex strength follows the lift the other jet is making: load factor x weight / (rho V span)
        const lift = Math.max(0.5, Math.abs(o.fm.nz)) * o.fm.mass * G0;
        const circ = lift / (Math.max(0.3, o.fm.rho) * V * o.spec.span);
        const I = (circ / 75) * Math.exp(-behind / 700) * Math.exp(-r2 / (R * R));
        const side = clamp(_tmp.dot(o.fm.right) / R, -1.4, 1.4);
        gust += -I * 3.2 * Math.cos((side * Math.PI) / 1.4);
        roll += -I * 1.5 * Math.sin((side * Math.PI) / 1.4);
      }
    }
    // it is choppy, not a steady push
    const t = sim.time;
    const chop = 0.65 + 0.35 * Math.sin(t * 11.3 + this.id * 1.7) * Math.sin(t * 4.1 + this.id);
    fm.wakeGust = clamp(gust * chop, -8, 8);
    fm.wakeRoll = clamp(roll * chop, -3, 3);
  }

  // -------------------------------------------------------------------------
  // Gun
  // -------------------------------------------------------------------------

  private updateGun(dt: number, sim: Sim): void {
    const firing = this.trigger && this.selectedWeapon === 'GUN' && this.gunAmmo > 0 && !this.fm.onGround && !RULES.holdFire;
    if (firing !== this.gunFiring) {
      this.gunFiring = firing;
      sim.events.emit('gunfire', { shooter: this, firing });
    }
    const rate = (this.spec.gun.rpm * (this.gunRateLow ? 0.66 : 1)) / 60;
    // recoil: the momentum of the rounds (plus the propellant gas) shoved
    // back through the airframe, a few percent of the engines' thrust
    const cal = this.spec.gun.caliberMm;
    const shell = cal > 28 ? 0.39 : cal > 25 ? 0.26 : 0.1;
    this.fm.gunRecoil = firing ? rate * shell * this.spec.gun.muzzleVelocity * 1.5 : 0;
    if (!firing) {
      this.gunAccum = 0;
      return;
    }
    this.gunAccum += rate * dt;
    while (this.gunAccum >= 1 && this.gunAmmo > 0) {
      this.gunAccum -= 1;
      this.gunAmmo--;
      this.roundCounter++;
      sim.bullets.spawn(this, this.roundCounter % 4 === 0);
    }
    this.fm.ammoMass = this.gunAmmo * (this.spec.gun.caliberMm > 25 ? 0.5 : 0.26);
  }

  // -------------------------------------------------------------------------
  // AIM-9X seeker (pre-launch)
  // -------------------------------------------------------------------------

  private updateSeeker(dt: number, sim: Sim): void {
    if (this.selectedWeapon !== this.irMissile || this.countOf(this.irMissile) === 0) {
      this.seekerTarget = null;
      this.seekerTone = 'off';
      return;
    }
    this.seekerTimer -= dt;
    if (this.seekerTimer > 0) return;
    this.seekerTimer = 0.1;
    const spec = MISSILES[this.irMissile];
    const fm = this.fm;
    const canLock = (t: Aircraft, cone: number): boolean => {
      if (!t.alive || !hostile(t, this)) return false;
      _tmp.subVectors(t.fm.pos, fm.pos);
      const d = _tmp.length();
      if (d < spec.minRange * 0.6) return false;
      const ang = Math.acos(Math.max(-1, Math.min(1, _tmp.dot(fm.fwd) / d)));
      if (ang > cone) return false;
      const range = spec.seekerRange * irIntensity(t, fm.pos);
      if (d > range) return false;
      return sim.lineOfSight(fm.pos, t.fm.pos);
    };
    // keep an existing lock
    if (this.seekerTarget && canLock(this.seekerTarget, spec.gimbalDeg * DEG)) {
      this.seekerTone = 'lock';
      return;
    }
    this.seekerTarget = null;
    // slave to the radar / IRST target (high off-boresight)
    const lt = this.lockedTarget;
    if (lt && canLock(lt, spec.gimbalDeg * DEG)) {
      this.seekerTarget = lt;
      this.seekerTone = 'lock';
      return;
    }
    // boresight search, or around the helmet line of sight when cueing
    const los = this.headLos;
    const cosCone = Math.cos((los ? 9 : 13) * DEG);
    let best: Aircraft | null = null;
    let bestScore = 0;
    for (const t of sim.aircraft) {
      if (!canLock(t, los ? spec.gimbalDeg * DEG : 13 * DEG)) continue;
      if (los) {
        _tmp.subVectors(t.fm.pos, fm.pos).normalize();
        if (_tmp.dot(los) < cosCone) continue;
      }
      const score = irIntensity(t, fm.pos) / Math.max(500, t.fm.pos.distanceTo(fm.pos));
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    this.seekerTarget = best;
    this.seekerTone = best ? 'lock' : 'search';
  }

  // -------------------------------------------------------------------------
  // Missiles
  // -------------------------------------------------------------------------

  /** Target the selected missile would be launched at, if any. */
  missileTarget(type: MissileType, sim: Sim): Aircraft | null {
    if (isIrMissile(type)) return this.seekerTarget;
    const lt = this.lockedTarget;
    if (lt) return lt;
    // TWS: nearest hostile track inside 30 deg of the nose
    let best: Aircraft | null = null;
    let bestD = Infinity;
    for (const c of this.radar.contacts.values()) {
      if (!c.hostile || !c.target.alive || sim.time - c.lastSeen > 4) continue;
      if (Math.hypot(c.az, c.el) > 30 * DEG) continue;
      if (c.range < bestD) {
        bestD = c.range;
        best = c.target;
      }
    }
    return best;
  }

  launchZoneFor(type: MissileType, t: Aircraft): { rmin: number; rmax: number; rne: number } {
    const fm = this.fm;
    _tmp.subVectors(fm.pos, t.fm.pos).normalize();
    const tv = t.fm.vel.length();
    const aspectCos = tv > 1 ? t.fm.vel.dot(_tmp) / tv : 0;
    return launchZone(type, fm.pos.y, fm.mach, t.fm.pos.y, aspectCos, tv);
  }

  /** Station the next round of this store type will come off (keeps the jet balanced). */
  pickStation(type: StoreType): StationState | null {
    const cands = this.stations.filter((s) => s.store === type);
    if (cands.length === 0) return null;
    // keep the jet balanced: release from the heavier side first
    let left = 0, right = 0;
    for (const s of this.stations) {
      if (!s.store) continue;
      if (s.def.pos[0] < 0) left++;
      else if (s.def.pos[0] > 0) right++;
    }
    cands.sort((a, b) => {
      const sa = a.def.pos[0] < 0 ? left : right;
      const sb = b.def.pos[0] < 0 ? left : right;
      if (sa !== sb) return sb - sa;
      return Math.abs(b.def.pos[0]) - Math.abs(a.def.pos[0]);
    });
    return cands[0];
  }

  fireMissile(sim: Sim, type: MissileType, forcedTarget?: Aircraft | null): Missile | null {
    if (type !== this.radarMissile && type !== this.irMissile) return null;
    if (!this.alive || this.fm.onGround || this.missileCooldown > 0 || RULES.holdFire) return null;
    const st = this.pickStation(type);
    if (!st) return null;
    const target = forcedTarget !== undefined ? forcedTarget : this.missileTarget(type, sim);
    if (isIrMissile(type) && !target) return null;
    st.store = null;
    this.refreshStores();
    const p = st.def.pos;
    const launchPos = _tmp.set(storeCenterX(st.def, type), storeCenterY(st.def, type), p[2]).applyQuaternion(this.fm.quat).add(this.fm.pos).clone();
    const stt = !!target && this.radar.lock === target;
    const m = new Missile(type, this, target, launchPos, st.def.id, stt);
    sim.addMissile(m);
    this.shotsFired++;
    this.lastLaunched = m;
    this.missileCooldown = isIrMissile(type) ? 0.6 : 0.9;
    sim.events.emit('launch', { missile: m, shooter: this, target, station: st.def.id });
    if (isIrMissile(type)) this.seekerTarget = null;
    if (this.countOf(type) === 0) {
      // auto-step to the next weapon
      if (type === this.radarMissile && this.countOf(this.irMissile) > 0) this.selectedWeapon = this.irMissile;
      else if (this.countOf(this.radarMissile) === 0 && this.countOf(this.irMissile) === 0) this.selectedWeapon = 'GUN';
    }
    return m;
  }

  // -------------------------------------------------------------------------
  // Countermeasures
  // -------------------------------------------------------------------------

  dispense(kind: 'flare' | 'chaff', count = 2): void {
    for (let i = 0; i < count; i++) this.cmQueue.push({ kind, t: i * 0.12 });
  }

  private updateCountermeasures(dt: number, sim: Sim): void {
    // auto program (EPAWSS) when a missile is about to hit
    if (this.spec.ew.autoDispense && (this.isPlayer ? sim.autoCm : true)) {
      this.autoCmTimer -= dt;
      const pm = this.rwr.primaryMissile;
      if (pm && pm.tti < 5 && this.autoCmTimer <= 0) {
        this.autoCmTimer = 0.7;
        this.dispense(pm.kind === 'ir' ? 'flare' : 'chaff', 1);
      }
    }
    if (this.cmQueue.length === 0) return;
    this.cmTimer += dt;
    while (this.cmQueue.length > 0 && this.cmQueue[0].t <= this.cmTimer) {
      const c = this.cmQueue.shift()!;
      if (c.kind === 'flare' && this.flares > 0) {
        this.flares--;
        sim.cms.deploy(this, 'flare');
      } else if (c.kind === 'chaff' && this.chaff > 0) {
        this.chaff--;
        sim.cms.deploy(this, 'chaff');
      }
    }
    if (this.cmQueue.length === 0) this.cmTimer = 0;
  }

  /** World position of a body-frame point. */
  toWorld(local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(local).applyQuaternion(this.fm.quat).add(this.fm.pos);
  }

  toLocal(world: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    _q.copy(this.fm.quat).invert();
    return out.subVectors(world, this.fm.pos).applyQuaternion(_q);
  }

  distanceTo(o: Aircraft): number {
    return this.fm.pos.distanceTo(o.fm.pos);
  }

  get rangeNmTo(): (o: Aircraft) => number {
    return (o) => this.distanceTo(o) / NM;
  }
}
