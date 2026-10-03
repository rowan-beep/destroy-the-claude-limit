// Track recording and replay.
//
// ReplayRecorder samples every aircraft (position, attitude, velocity,
// gear, afterburner, control deflections, damage / fire, gun firing) and
// every missile at 10 Hz, plus the discrete events (launches, detonations,
// kills, crashes, ejections, flares and chaff, tank jettisons).
//
// ReplayPlayer rebuilds the fight with puppet aircraft and missiles inside
// a private Sim, so the ordinary CombatRenderer draws it: smoke trails,
// flares, explosions, debris, parachutes, tracers and all. Playback can be
// paused, scrubbed and run from quarter to eight times speed.

import * as THREE from 'three';
import { updateCarriers } from '../world/carriers';
import { Sim } from './sim';
import { Aircraft } from '../aircraft/aircraft';
import type { AircraftType, StoreType } from '../aircraft/specs';
import { Missile } from '../weapons/missile';
import type { MissileType } from '../weapons/weaponSpecs';
import type { Decoy } from '../weapons/countermeasures';
import { CombatRenderer } from '../render/combatRenderer';
import type { HeightGrid } from '../world/heightGrid';
import { COMPONENT_HP } from '../aircraft/damage';
import type { Team } from '../core/constants';

export const REPLAY_HZ = 10;
const MAX_SECONDS = 40 * 60;

// aircraft sample layout
const A_T = 0, A_X = 1, A_Y = 2, A_Z = 3, A_QX = 4, A_QY = 5, A_QZ = 6, A_QW = 7, A_VX = 8, A_VY = 9, A_VZ = 10;
const A_GEAR = 11, A_AB = 12, A_RPM = 13, A_PITCH = 14, A_ROLL = 15, A_YAW = 16, A_FLAGS = 17, A_NZ = 18, A_MACH = 19, A_ALPHA = 20, A_SB = 21;
const A_STRIDE = 22;
// missile sample layout
const M_T = 0, M_X = 1, M_Y = 2, M_Z = 3, M_VX = 4, M_VY = 5, M_VZ = 6, M_MOTOR = 7;
const M_STRIDE = 8;

const F_ALIVE = 1, F_CRASHED = 2, F_EJECTED = 4, F_GUN = 8, F_FIRE = 16, F_HURT = 32;

export interface AircraftTrack {
  id: number;
  type: AircraftType;
  team: Team;
  callsign: string;
  loadoutId: string;
  isPlayer: boolean;
  /** stores on board when first seen (AI jets carry restricted loadouts) */
  stores: Record<number, StoreType>;
  data: number[];
}

export interface MissileTrack {
  id: number;
  type: MissileType;
  shooterId: number;
  targetId: number | null;
  station: number;
  data: number[];
  endT: number;
}

export type ReplayEvent =
  | { t: number; kind: 'launch'; missileId: number }
  | { t: number; kind: 'detonate'; x: number; y: number; z: number; where: string; hit: boolean }
  | { t: number; kind: 'destroyed'; id: number; pilotKilled: boolean; ejected: boolean }
  | { t: number; kind: 'crash'; id: number; x: number; y: number; z: number; water: boolean }
  | { t: number; kind: 'eject'; id: number }
  | { t: number; kind: 'decoy'; ownerId: number; decoy: 'flare' | 'chaff'; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }
  | { t: number; kind: 'store'; id: number; station: number };

export interface ReplayData {
  start: number;
  end: number;
  aircraft: AircraftTrack[];
  missiles: MissileTrack[];
  events: ReplayEvent[];
  title: string;
}

// ---------------------------------------------------------------------------
// Recorder
// ---------------------------------------------------------------------------

export class ReplayRecorder {
  readonly data: ReplayData;
  private acById = new Map<number, AircraftTrack>();
  private mById = new Map<Missile, MissileTrack>();
  private nextSample = 0;
  private offs: (() => void)[] = [];
  private stopped = false;

  constructor(
    private sim: Sim,
    title: string,
  ) {
    this.data = { start: sim.time, end: sim.time, aircraft: [], missiles: [], events: [], title };
    this.nextSample = sim.time;
    const ev = sim.events;
    const E = this.data.events;
    this.offs.push(
      ev.on('launch', (e) => {
        const tr: MissileTrack = {
          id: this.data.missiles.length + 1,
          type: e.missile.spec.type,
          shooterId: e.shooter.id,
          targetId: e.target ? e.target.id : null,
          station: e.station,
          data: [],
          endT: Infinity,
        };
        this.data.missiles.push(tr);
        this.mById.set(e.missile, tr);
        this.sampleMissile(e.missile, tr);
        E.push({ t: this.sim.time, kind: 'launch', missileId: tr.id });
      }),
      ev.on('detonate', (e) => {
        const tr = this.mById.get(e.missile);
        if (tr) {
          this.sampleMissile(e.missile, tr);
          tr.endT = this.sim.time;
        }
        E.push({ t: this.sim.time, kind: 'detonate', x: e.pos.x, y: e.pos.y, z: e.pos.z, where: e.kind, hit: !!e.hit });
      }),
      ev.on('destroyed', (e) => {
        this.sampleAircraft(e.victim);
        E.push({ t: this.sim.time, kind: 'destroyed', id: e.victim.id, pilotKilled: e.victim.damage.pilotKilled, ejected: e.victim.ejected });
      }),
      ev.on('crash', (e) => E.push({ t: this.sim.time, kind: 'crash', id: e.aircraft.id, x: e.pos.x, y: e.pos.y, z: e.pos.z, water: e.water })),
      ev.on('eject', (e) => E.push({ t: this.sim.time, kind: 'eject', id: e.aircraft.id })),
      ev.on('decoy', (d: Decoy) =>
        E.push({ t: this.sim.time, kind: 'decoy', ownerId: d.owner.id, decoy: d.kind, x: d.pos.x, y: d.pos.y, z: d.pos.z, vx: d.vel.x, vy: d.vel.y, vz: d.vel.z, life: d.life }),
      ),
      ev.on('storeDropped', (e) => E.push({ t: this.sim.time, kind: 'store', id: e.aircraft.id, station: e.station })),
    );
  }

  get duration(): number {
    return this.data.end - this.data.start;
  }

  /** Call after every physics step. */
  update(): void {
    if (this.stopped) return;
    const sim = this.sim;
    if (sim.time - this.data.start > MAX_SECONDS) {
      this.stop();
      return;
    }
    if (sim.time < this.nextSample) return;
    this.nextSample = sim.time + 1 / REPLAY_HZ;
    for (const a of sim.aircraft) this.sampleAircraft(a);
    for (const m of sim.missiles) {
      const tr = this.mById.get(m);
      if (tr && m.alive) this.sampleMissile(m, tr);
      else if (tr && !m.alive && tr.endT === Infinity) tr.endT = sim.time;
    }
    this.data.end = sim.time;
  }

  private sampleAircraft(a: Aircraft): void {
    let tr = this.acById.get(a.id);
    if (!tr) {
      const stores: Record<number, StoreType> = {};
      for (const st of a.stations) if (st.store) stores[st.def.id] = st.store;
      tr = { id: a.id, type: a.type, team: a.team, callsign: a.callsign, loadoutId: a.loadout.id, isPlayer: a.isPlayer, stores, data: [] };
      this.acById.set(a.id, tr);
      this.data.aircraft.push(tr);
    }
    const fm = a.fm;
    // stop sampling wrecks once they are on the ground
    const n = tr.data.length;
    if (n >= A_STRIDE && tr.data[n - A_STRIDE + A_FLAGS] & F_CRASHED) return;
    let rpm = 0;
    for (const r of fm.rpm) rpm += r;
    rpm /= fm.rpm.length;
    let flags = 0;
    if (a.alive) flags |= F_ALIVE;
    if (fm.crashed) flags |= F_CRASHED;
    if (a.ejected) flags |= F_EJECTED;
    if (a.gunFiring) flags |= F_GUN;
    if (a.damage.fire > 0 || (!a.alive && !fm.crashed)) flags |= F_FIRE;
    if (a.damage.integrity < 0.55 || a.damage.frac('engineL') < 0.6 || a.damage.frac('engineR') < 0.6) flags |= F_HURT;
    tr.data.push(
      this.sim.time,
      fm.pos.x,
      fm.pos.y,
      fm.pos.z,
      fm.quat.x,
      fm.quat.y,
      fm.quat.z,
      fm.quat.w,
      fm.vel.x,
      fm.vel.y,
      fm.vel.z,
      fm.gearPos,
      fm.afterburner,
      rpm,
      a.controls.pitch,
      a.controls.roll,
      a.controls.yaw,
      flags,
      fm.nz,
      fm.mach,
      fm.alpha,
      fm.speedbrakePos,
    );
  }

  private sampleMissile(m: Missile, tr: MissileTrack): void {
    tr.data.push(this.sim.time, m.pos.x, m.pos.y, m.pos.z, m.vel.x, m.vel.y, m.vel.z, m.motorOn ? 1 : 0);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.data.end = this.sim.time;
    for (const o of this.offs) o();
    this.offs = [];
  }
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

interface Puppet {
  track: AircraftTrack;
  ac: Aircraft;
  hint: number;
  crashed: boolean;
}

interface MissilePuppet {
  track: MissileTrack;
  m: Missile | null;
  hint: number;
}

const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();

/** Index of the last sample with time <= t (binary search on a strided array). */
function sampleIndex(data: number[], stride: number, t: number, hint: number): number {
  const n = data.length / stride;
  if (n === 0) return -1;
  // fast path: close to the previous frame
  if (hint >= 0 && hint < n && data[hint * stride] <= t && (hint + 1 >= n || data[(hint + 1) * stride] > t)) return hint;
  if (hint + 1 < n && data[(hint + 1) * stride] <= t && (hint + 2 >= n || data[(hint + 2) * stride] > t)) return hint + 1;
  let lo = 0, hi = n - 1;
  if (data[0] > t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (data[mid * stride] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export class ReplayPlayer {
  readonly sim: Sim;
  readonly combat: CombatRenderer;
  readonly puppets: Puppet[] = [];
  private missiles: MissilePuppet[] = [];
  private decoys: { d: Decoy; t0: number }[] = [];
  /** playback time relative to the recording start */
  t = 0;
  speed = 1;
  playing = true;
  private evIndex = 0;
  private gunAccum = new Map<number, number>();

  constructor(
    readonly data: ReplayData,
    scene: THREE.Scene,
    grid: HeightGrid,
  ) {
    this.sim = new Sim(grid);
    this.combat = new CombatRenderer(scene, this.sim);
    for (const tr of data.aircraft) {
      const ac = new Aircraft(tr.type, tr.team, tr.callsign, tr.loadoutId);
      ac.setStores(tr.stores);
      ac.isPlayer = tr.isPlayer;
      this.puppets.push({ track: tr, ac, hint: 0, crashed: false });
    }
    for (const tr of data.missiles) this.missiles.push({ track: tr, m: null, hint: 0 });
    this.seek(0);
  }

  get duration(): number {
    return this.data.end - this.data.start;
  }

  /** The puppet flown by the player (or the first aircraft). */
  get playerPuppet(): Aircraft | null {
    return (this.puppets.find((p) => p.track.isPlayer) ?? this.puppets[0])?.ac ?? null;
  }

  /** Puppets that exist at the current time. */
  get present(): Aircraft[] {
    return this.puppets.filter((p) => this.sim.aircraft.includes(p.ac)).map((p) => p.ac);
  }

  /** Jump to a time: rebuild visuals so nothing from the future (or past) leaks. */
  seek(t: number): void {
    this.t = Math.max(0, Math.min(this.duration, t));
    const abs = this.data.start + this.t;
    // fresh visuals for every puppet present at the new time
    for (const p of this.puppets) this.sim.remove(p.ac);
    for (const mp of this.missiles) {
      if (mp.m) {
        mp.m.alive = false;
        mp.m = null;
      }
    }
    this.sim.missiles.length = 0;
    this.sim.cms.decoys.length = 0;
    this.decoys.length = 0;
    this.sim.bullets.count = 0;
    this.combat.clearEffects();
    for (const p of this.puppets) {
      const d = p.track.data;
      if (d.length === 0 || d[0] > abs) continue;
      const i = sampleIndex(d, A_STRIDE, abs, 0);
      const flags = d[i * A_STRIDE + A_FLAGS];
      if (flags & F_CRASHED && d[i * A_STRIDE] < abs - 2) continue;
      p.ac.alive = !!(flags & F_ALIVE);
      p.ac.ejected = !!(flags & F_EJECTED);
      p.ac.fm.crashed = false;
      p.crashed = false;
      p.ac.setStores(p.track.stores);
      // stores already fired / dropped before this moment
      this.sim.add(p.ac);
      p.hint = i;
    }
    for (const mp of this.missiles) {
      const tr = mp.track;
      if (tr.data.length === 0) continue;
      if (tr.data[0] <= abs) {
        const sh = this.puppets.find((p) => p.track.id === tr.shooterId);
        sh && this.combat.aircraftVis.get(sh.ac)?.removeStation(tr.station);
      }
    }
    for (const e of this.data.events) {
      if (e.t > abs) break;
      if (e.kind === 'store') {
        const p = this.puppets.find((x) => x.track.id === e.id);
        if (p) this.combat.aircraftVis.get(p.ac)?.removeStation(e.station);
      }
    }
    this.evIndex = this.data.events.findIndex((e) => e.t > abs);
    if (this.evIndex < 0) this.evIndex = this.data.events.length;
    // the carriers are where they were then (their loops run off the mission clock)
    updateCarriers(abs);
    this.applyPose(abs);
  }

  update(dt: number, camera: THREE.Camera): void {
    const step = this.playing ? dt * this.speed : 0;
    if (step > 0) {
      const t1 = Math.min(this.duration, this.t + step);
      const abs0 = this.data.start + this.t;
      const abs1 = this.data.start + t1;
      this.t = t1;
      this.fireEvents(abs1);
      updateCarriers(abs1);
      this.applyPose(abs1);
      this.guns(step, abs1);
      this.stepDecoys(step);
      if (this.t >= this.duration) this.playing = false;
      void abs0;
    }
    this.combat.update(step, camera);
  }

  private fireEvents(abs: number): void {
    const ev = this.sim.events;
    const E = this.data.events;
    while (this.evIndex < E.length && E[this.evIndex].t <= abs) {
      const e = E[this.evIndex++];
      const puppet = (id: number) => this.puppets.find((p) => p.track.id === id);
      switch (e.kind) {
        case 'launch': {
          const mp = this.missiles.find((m) => m.track.id === e.missileId);
          const sh = mp ? puppet(mp.track.shooterId) : null;
          if (mp && sh) {
            const d = mp.track.data;
            const m = new Missile(mp.track.type, sh.ac, null, new THREE.Vector3(d[M_X], d[M_Y], d[M_Z]), mp.track.station, false);
            m.motorOn = !!d[M_MOTOR];
            mp.m = m;
            mp.hint = 0;
            this.sim.addMissile(m);
            ev.emit('launch', { missile: m, shooter: sh.ac, target: null, station: mp.track.station });
          }
          break;
        }
        case 'detonate': {
          const pos = new THREE.Vector3(e.x, e.y, e.z);
          // the missile object is only used for identity by listeners; pick the nearest live puppet missile
          let best: Missile | null = null;
          let bd = Infinity;
          for (const mp of this.missiles) {
            if (!mp.m || !mp.m.alive) continue;
            const d = mp.m.pos.distanceTo(pos);
            if (d < bd) {
              bd = d;
              best = mp.m;
            }
          }
          if (best && bd < 400) best.alive = false;
          if (best) ev.emit('detonate', { missile: best, pos, kind: e.where, hit: null, dist: 0 });
          else this.combat.explode(pos, e.hit ? 1 : 0.6, e.where === 'water' ? 'water' : e.where === 'ground' ? 'ground' : 'air');
          break;
        }
        case 'destroyed': {
          const p = puppet(e.id);
          if (p) {
            p.ac.alive = false;
            p.ac.ejected = e.ejected;
            p.ac.damage.pilotKilled = e.pilotKilled;
            ev.emit('destroyed', { victim: p.ac, killer: null, weapon: '', cause: '' });
          }
          break;
        }
        case 'crash': {
          const p = puppet(e.id);
          if (p) {
            p.ac.fm.crashed = true;
            p.crashed = true;
            ev.emit('crash', { aircraft: p.ac, pos: new THREE.Vector3(e.x, e.y, e.z), water: e.water });
          }
          break;
        }
        case 'eject': {
          const p = puppet(e.id);
          if (p) {
            p.ac.ejected = true;
            ev.emit('eject', { aircraft: p.ac });
          }
          break;
        }
        case 'decoy': {
          const p = puppet(e.ownerId);
          if (!p) break;
          const d: Decoy = {
            id: 900000 + this.decoys.length,
            kind: e.decoy,
            pos: new THREE.Vector3(e.x, e.y, e.z),
            vel: new THREE.Vector3(e.vx, e.vy, e.vz),
            age: 0,
            life: e.life,
            owner: p.ac,
            strength: 1,
            judged: new Set(),
          };
          this.sim.cms.decoys.push(d);
          this.decoys.push({ d, t0: e.t });
          ev.emit('decoy', d);
          break;
        }
        case 'store': {
          const p = puppet(e.id);
          if (p) ev.emit('storeDropped', { aircraft: p.ac, station: e.station });
          break;
        }
      }
    }
  }

  /** Interpolate every puppet and missile to absolute time `abs`. */
  private applyPose(abs: number): void {
    for (const p of this.puppets) {
      const d = p.track.data;
      if (d.length === 0) continue;
      const inSim = this.sim.aircraft.includes(p.ac);
      if (!inSim) {
        // appears later in the recording (a new wave)
        if (d[0] <= abs && !(d[A_FLAGS] & F_CRASHED)) {
          p.ac.alive = !!(d[A_FLAGS] & F_ALIVE);
          this.sim.add(p.ac);
        } else continue;
      }
      if (p.crashed) continue;
      const i = sampleIndex(d, A_STRIDE, abs, p.hint);
      if (i < 0) continue;
      p.hint = i;
      const a = i * A_STRIDE;
      const n = d.length / A_STRIDE;
      const b = i + 1 < n ? a + A_STRIDE : a;
      const span = d[b] - d[a];
      const f = span > 1e-6 ? Math.min(1, Math.max(0, (abs - d[a]) / span)) : 0;
      const L = (k: number) => d[a + k] + (d[b + k] - d[a + k]) * f;
      const fm = p.ac.fm;
      fm.pos.set(L(A_X), L(A_Y), L(A_Z));
      _q0.set(d[a + A_QX], d[a + A_QY], d[a + A_QZ], d[a + A_QW]);
      _q1.set(d[b + A_QX], d[b + A_QY], d[b + A_QZ], d[b + A_QW]);
      fm.quat.copy(_q0).slerp(_q1, f);
      fm.updateAxes();
      fm.vel.set(L(A_VX), L(A_VY), L(A_VZ));
      fm.tas = fm.vel.length();
      fm.gs = Math.hypot(fm.vel.x, fm.vel.z);
      fm.gearPos = L(A_GEAR);
      fm.speedbrakePos = L(A_SB);
      const ab = L(A_AB);
      for (let k = 0; k < fm.ab.length; k++) fm.ab[k] = ab;
      const rpm = L(A_RPM);
      for (let k = 0; k < fm.rpm.length; k++) fm.rpm[k] = rpm;
      fm.nz = L(A_NZ);
      fm.mach = L(A_MACH);
      fm.alpha = L(A_ALPHA);
      fm.agl = fm.pos.y;
      fm.onGround = fm.gearPos > 0.99 && fm.tas < 110 && d[a + A_Y] < 900 && Math.abs(d[a + A_VY]) < 0.5;
      const c = p.ac.controls;
      c.pitch = L(A_PITCH);
      c.roll = L(A_ROLL);
      c.yaw = L(A_YAW);
      const flags = d[a + A_FLAGS];
      p.ac.gunFiring = !!(flags & F_GUN);
      // damage appearance
      const dm = p.ac.damage;
      dm.fire = flags & F_FIRE ? 5 : 0;
      dm.fireComponent = flags & F_FIRE ? 'engineL' : null;
      const hurt = !!(flags & F_HURT);
      dm.hp.engineL = hurt ? COMPONENT_HP.engineL * 0.3 : COMPONENT_HP.engineL;
    }
    for (const mp of this.missiles) {
      const m = mp.m;
      if (!m || !m.alive) continue;
      const d = mp.track.data;
      if (abs >= mp.track.endT + 0.05) {
        m.alive = false;
        continue;
      }
      const i = sampleIndex(d, M_STRIDE, abs, mp.hint);
      if (i < 0) continue;
      mp.hint = i;
      const a = i * M_STRIDE;
      const n = d.length / M_STRIDE;
      const b = i + 1 < n ? a + M_STRIDE : a;
      const span = d[b] - d[a];
      const f = span > 1e-6 ? Math.min(1, Math.max(0, (abs - d[a]) / span)) : 0;
      m.pos.set(d[a + M_X] + (d[b + M_X] - d[a + M_X]) * f, d[a + M_Y] + (d[b + M_Y] - d[a + M_Y]) * f, d[a + M_Z] + (d[b + M_Z] - d[a + M_Z]) * f);
      m.vel.set(d[a + M_VX], d[a + M_VY], d[a + M_VZ]);
      m.motorOn = !!d[a + M_MOTOR];
      if (i === n - 1 && abs > d[a] + 0.3 && isFinite(mp.track.endT) === false) m.alive = false;
    }
  }

  /** Tracers for puppets that were firing their guns. */
  private guns(dt: number, abs: number): void {
    for (const p of this.puppets) {
      const a = p.ac;
      if (!a.gunFiring || !this.sim.aircraft.includes(a)) continue;
      let acc = (this.gunAccum.get(a.id) ?? 0) + (a.spec.gun.rpm / 60) * dt;
      let k = 0;
      while (acc >= 1) {
        acc -= 1;
        this.sim.bullets.spawn(a, (k++ & 3) === 0);
      }
      this.gunAccum.set(a.id, acc);
    }
    // move rounds; hits against puppets only produce sparks
    this.sim.bullets.step(dt);
    void abs;
  }

  private stepDecoys(dt: number): void {
    const list = this.sim.cms.decoys;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      d.age += dt;
      d.vel.multiplyScalar(Math.exp(-dt * 0.6));
      d.vel.y -= 9.81 * dt * 0.6;
      d.pos.addScaledVector(d.vel, dt);
      if (d.age >= d.life) list.splice(i, 1);
    }
  }

  dispose(): void {
    this.combat.dispose();
  }
}
