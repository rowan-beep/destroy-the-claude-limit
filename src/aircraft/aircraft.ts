// An aircraft in the simulation: one of the three allowed fighters, flown
// by the player or an AI pilot. Owns its flight model, weapons, sensors,
// countermeasures, damage state and pilot physiology.

import * as THREE from 'three';
import { AircraftSpec, AircraftType, getSpec, StationDef, StoreType, TANK_FUEL, LoadoutPreset } from './specs';
import { FlightModel, FlightControls, neutralControls } from './flightModel';
import { PilotPhysiology } from './pilot';
import { DamageModel } from './damage';
import { Team, DEG, NM } from '../core/constants';
import { Radar } from '../sensors/radar';
import { Irst } from '../sensors/irst';
import { Rwr } from '../sensors/rwr';
import { WeaponSelect, MissileType, MISSILES, launchZone } from '../weapons/weaponSpecs';
import { Missile } from '../weapons/missile';
import { irIntensity } from '../sensors/signatures';
import type { Sim } from '../game/sim';
import type { AIPilot } from '../ai/pilot';

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
  selectedWeapon: WeaponSelect = 'AIM120D';
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
  /** AIM-9X seeker state before launch */
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
  /** user-facing name */
  callsign: string;

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

  applyLoadout(l: LoadoutPreset): void {
    this.loadout = l;
    this.stations = this.spec.stations.map((def) => ({ def, store: l.stores[def.id] ?? null }));
    this.refreshStores();
    this.fm.fuelExternal = this.fm.fuelExternalCap;
    if (this.countOf('AIM120D') > 0) this.selectedWeapon = 'AIM120D';
    else if (this.countOf('AIM9X') > 0) this.selectedWeapon = 'AIM9X';
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
    const order: WeaponSelect[] = ['AIM120D', 'AIM9X', 'GUN'];
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
    this.onRunwayStopped = fm.onGround && fm.tas < 2 && !!fm.surfaceField && fm.surfaceField.team === this.team;
  }
  crashHandled = false;

  destroy(sim: Sim, cause: string, killer: Aircraft | null): void {
    if (!this.alive) return;
    this.alive = false;
    this.destroyedAt = sim.time;
    this.deaths++;
    this.trigger = false;
    this.gunFiring = false;
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
  // Gun
  // -------------------------------------------------------------------------

  private updateGun(dt: number, sim: Sim): void {
    const firing = this.trigger && this.selectedWeapon === 'GUN' && this.gunAmmo > 0 && !this.fm.onGround;
    if (firing !== this.gunFiring) {
      this.gunFiring = firing;
      sim.events.emit('gunfire', { shooter: this, firing });
    }
    if (!firing) {
      this.gunAccum = 0;
      return;
    }
    const rate = (this.spec.gun.rpm * (this.gunRateLow ? 0.66 : 1)) / 60;
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
    if (this.selectedWeapon !== 'AIM9X' || this.countOf('AIM9X') === 0) {
      this.seekerTarget = null;
      this.seekerTone = 'off';
      return;
    }
    this.seekerTimer -= dt;
    if (this.seekerTimer > 0) return;
    this.seekerTimer = 0.1;
    const spec = MISSILES.AIM9X;
    const fm = this.fm;
    const canLock = (t: Aircraft, cone: number): boolean => {
      if (!t.alive || t.team === this.team) return false;
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
    // boresight search
    let best: Aircraft | null = null;
    let bestScore = 0;
    for (const t of sim.aircraft) {
      if (!canLock(t, 13 * DEG)) continue;
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
    if (type === 'AIM9X') return this.seekerTarget;
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
    if (!this.alive || this.fm.onGround || this.missileCooldown > 0) return null;
    const st = this.pickStation(type);
    if (!st) return null;
    const target = forcedTarget !== undefined ? forcedTarget : this.missileTarget(type, sim);
    if (type === 'AIM9X' && !target) return null;
    st.store = null;
    this.refreshStores();
    const p = st.def.pos;
    const launchPos = _tmp.set(p[0], p[1], p[2]).applyQuaternion(this.fm.quat).add(this.fm.pos).clone();
    const stt = !!target && this.radar.lock === target;
    const m = new Missile(type, this, target, launchPos, st.def.id, stt);
    sim.addMissile(m);
    this.shotsFired++;
    this.lastLaunched = m;
    this.missileCooldown = type === 'AIM120D' ? 0.9 : 0.6;
    sim.events.emit('launch', { missile: m, shooter: this, target, station: st.def.id });
    if (type === 'AIM9X') this.seekerTarget = null;
    if (this.countOf(type) === 0) {
      // auto-step to the next weapon
      if (type === 'AIM120D' && this.countOf('AIM9X') > 0) this.selectedWeapon = 'AIM9X';
      else if (this.countOf('AIM120D') === 0 && this.countOf('AIM9X') === 0) this.selectedWeapon = 'GUN';
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
