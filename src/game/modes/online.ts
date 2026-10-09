// ONLINE: LAST PILOT STANDING against real pilots on a TRIAD server.
//
// No AI anywhere. Every client flies its own jet and its own weapons; other
// players' jets are puppets driven by their network updates (buffered ~0.1 s
// and interpolated so they move smoothly). What a shooter sees decides a hit:
// our gun rounds and missiles hit their jet here, and the hit is sent to
// them; their client takes the damage and reports the kill.
//
// Between matches everyone flies around the arena with weapons on hold. The
// server starts a match once two or more pilots are in: everyone drops in on
// a ring around the arena, the zone shrinks, kills rearm you, and the last
// jet flying wins. Pilots who join mid-match spectate until the next one.

import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import type { AircraftType, StoreType } from '../../aircraft/specs';
import { AIRCRAFT_TYPES } from '../../aircraft/specs';
import { Missile, MissileMode } from '../../weapons/missile';
import type { MissileType } from '../../weapons/weaponSpecs';
import { MISSILES } from '../../weapons/weaponSpecs';
import type { Component } from '../../aircraft/damage';
import { ROLES, mapAlt } from '../../world/islands';
import { spawnInAir } from '../spawn';
import { NM } from '../../core/constants';
import { atmosphere, AtmoState } from '../../core/atmosphere';
import { RULES } from '../rules';
import { NetPlayer, ServerMsg, MatchMsg, ZoneMsg, MatchResult } from '../../net/client';
import type { NetLink } from '../../net/link';
import type { Game } from '../game';
import {
  loadRanked, saveRanked, beginMatch, settleMatch, cooldownLeft, untilText, placing, ONLINE_MIN_PILOTS, PLACEMENTS,
  type RankedState, type MatchOutcome,
} from '../ranked';
import { publishRank } from '../../net/rankBoard';

const SEND_HZ = 20;
const MISSILE_HZ = 10;
/** how far behind real time other jets are shown (smooths network jitter) */
const INTERP_DELAY = 0.12;
const MODES: MissileMode[] = ['EJECT', 'MIDCOURSE', 'ACTIVE', 'IR', 'DECOY', 'LOST'];
const COMPONENTS: Component[] = ['fuselage', 'cockpit', 'wingL', 'wingR', 'engineL', 'engineR', 'tail', 'fuel'];

// state flags
const F_ALIVE = 1, F_GUN = 2, F_CRASHED = 4, F_WATER = 8, F_RADAR = 16, F_FIRE = 32, F_HURT = 64;

interface Sample {
  t: number;
  d: number[];
}

interface Remote {
  p: NetPlayer;
  ac: Aircraft | null;
  buf: Sample[];
}

const _atm: AtmoState = { T: 0, p: 0, rho: 0, a: 0, sigma: 0, delta: 0 };
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _v = new THREE.Vector3();

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 10000) / 10000;

export class OnlineMode extends GameMode {
  private remotes = new Map<number, Remote>();
  private match: MatchMsg = { t: 'match', state: 'waiting', timer: 0, matchId: 0 };
  /** wall-clock (ms) when the server's current countdown ends (the server runs in real time) */
  private matchEnd = 0;
  private get matchClock(): number {
    return Math.max(0, (this.matchEnd - performance.now()) / 1000);
  }
  private zoneMsg: ZoneMsg | null = null;
  private inMatch = false;
  /** wall-clock (ms) when weapons go free */
  private dropinEnd = 0;
  private get dropin(): number {
    return (this.dropinEnd - performance.now()) / 1000;
  }
  private storm = 0;
  private stormWarnT = 0;
  private lastStormHit = 0;
  private respawnT = -1;
  private sendT = 0;
  private missileT = 0;
  private place = 0;
  private myKills = 0;
  private lastResults: MatchResult[] | null = null;
  /** this match counts for rank (4+ pilots started it): the state, and how many pilots */
  private ranked: { rs: RankedState; of: number; opp: number } | null = null;
  /** what the last ranked match did, for the end-of-match order */
  private rankNote = '';
  private unsub: (() => void)[] = [];
  private lost = false;
  /** the local missiles we are announcing */
  private ownMissiles = new Set<Missile>();
  /** other players' missiles, by "owner:id" */
  private theirMissiles = new Map<string, Missile>();
  /** set by the game shell: the connection dropped */
  onLost: ((reason: string) => void) | null = null;

  constructor(
    private game: Game,
    readonly net: NetLink,
  ) {
    super(game);
  }

  get roomName(): string {
    return this.net.room?.name ?? 'SERVER';
  }

  // ------------------------------------------------------------ lifecycle

  start(): void {
    const h = this.game;
    RULES.ffa = true;
    RULES.holdFire = true;
    RULES.bountyId = -1;
    RULES.revealAll = false;
    h.picture.gciEnabled.blue = false;
    h.picture.gciEnabled.red = false;
    h.sim.net = { hit: (v, hit) => this.sendHit(v, hit) };
    for (const p of this.net.players) if (p.id !== this.net.id) this.remotes.set(p.id, { p, ac: null, buf: [] });
    this.net.onMessage = (m) => this.onMessage(m);
    this.net.onClose = (reason) => this.connectionLost(reason);
    const ev = h.sim.events;
    this.unsub.push(
      ev.on('destroyed', (e) => this.onDestroyed(e.victim, e.killer, e.weapon, e.cause)),
      ev.on('launch', (e) => {
        if (e.shooter !== h.player || e.missile.remote) return;
        const m = e.missile;
        this.ownMissiles.add(m);
        this.net.send({
          t: 'ev',
          e: { k: 'm+', mid: m.id, type: m.spec.type, tgt: e.target ? this.netIdOf(e.target) : 0, st: e.station, stt: m.sttLaunch ? 1 : 0, p: vec(m.pos), v: vec(m.vel) },
        });
      }),
      ev.on('detonate', (e) => {
        const m = e.missile;
        if (!this.ownMissiles.has(m)) return;
        this.ownMissiles.delete(m);
        this.net.send({ t: 'ev', e: { k: 'm-', mid: m.id, p: vec(e.pos), kind: e.kind } });
      }),
      ev.on('decoy', (d) => {
        if (d.owner === h.player) this.net.send({ t: 'ev', e: { k: 'cm', kind: d.kind } });
      }),
    );
    this.spawnLobby();
    h.order(
      `ONLINE — ${this.roomName}`,
      `Real pilots only, no AI. Free-for-all: every jet is hostile, stay inside the shrinking zone, kills rearm you, last jet flying wins. Between matches everyone flies with weapons on hold. ${this.net.players.length} pilot${this.net.players.length === 1 ? '' : 's'} here.`,
      10,
    );
    this.applyMatch(this.match);
  }

  override dispose(): void {
    // leaving a ranked match you are still flying in counts as last place (and the leave cooldown)
    if (this.ranked) this.rankedSettle(this.ranked.of, true);
    for (const u of this.unsub) u();
    this.unsub = [];
    this.net.onMessage = null;
    this.net.onClose = null;
    this.net.close();
    if (this.game.sim) this.game.sim.net = null;
    RULES.ffa = false;
    RULES.zone.active = false;
    RULES.holdFire = false;
    RULES.revealAll = false;
  }

  private connectionLost(reason: string): void {
    if (this.lost) return;
    this.lost = true;
    // a dropped connection counts as being the next one out (no leave cooldown)
    if (this.ranked) this.rankedSettle(Math.max(1, this.aliveCount()), false);
    this.onLost?.(reason);
  }

  // ------------------------------------------------------------ ranked

  /** A match starts with us in it: does it count? (4+ pilots, not in a leave cooldown) Returns a line for the briefing. */
  private rankedStart(n: number): string {
    this.ranked = null;
    if (n < ONLINE_MIN_PILOTS) return ` Unranked: rank counts with ${ONLINE_MIN_PILOTS}+ pilots.`;
    const rs = loadRanked();
    const cd = cooldownLeft(rs);
    if (cd > 0) return ` Ranked cooldown (${untilText(cd)}): this one doesn't count.`;
    // other pilots' ratings aren't shared, so the lobby is scored as an even one
    const opp = rs.mmr;
    beginMatch(rs, 'online', 'ffa', n, opp);
    this.ranked = { rs, of: n, opp };
    return placing(rs) ? ` Ranked: placement match ${rs.placed + 1} of ${PLACEMENTS}.` : ` Ranked: ${rs.rp.toLocaleString()} RP on the line.`;
  }

  /** Our place is known (out, last one flying, or leaving): settle the ranked match once. */
  private rankedSettle(place: number, abandon: boolean): MatchOutcome | null {
    const r = this.ranked;
    if (!r) return null;
    this.ranked = null;
    const res = settleMatch(r.rs, {
      playlist: 'online',
      kind: 'ffa',
      place: abandon ? r.of : place,
      of: r.of,
      kills: this.myKills,
      deaths: place === 1 && !abandon ? 0 : 1,
      oppRating: r.opp,
      abandon,
      score: abandon ? 'LEFT THE MATCH' : `#${place} of ${r.of}`,
    });
    saveRanked(r.rs);
    void publishRank(r.rs);
    const m = res.record;
    if (!m) return res;
    const d = m.rpAfter - m.rpBefore;
    const sign = d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0';
    this.rankNote = res.revealed && res.after
      ? `RANK REVEALED: ${res.after.name} · ${m.rpAfter.toLocaleString()} RP`
      : m.placement
        ? `PLACEMENT ${m.placement}/${PLACEMENTS} DONE (${sign} RP, HIDDEN)`
        : `RANKED ${sign} RP · ${res.after ? res.after.name : ''} · ${m.rpAfter.toLocaleString()} RP${res.promoted ? ' · PROMOTED' : res.demoted ? ' · DEMOTED' : m.shield ? ' · SHIELD HELD' : ''}`;
    if (!abandon) this.game.message(this.rankNote, d >= 0 ? 'good' : 'bad', 8);
    return res;
  }

  private aliveCount(): number {
    let alive = 0;
    for (const r of this.remotes.values()) if (r.ac && r.ac.alive) alive++;
    const me = this.game.player;
    if (me && me.alive) alive++;
    return alive;
  }

  // ------------------------------------------------------------ spawning

  /** Replace our jet with a fresh one at `pos` (full load, full fuel). */
  private spawnAt(pos: THREE.Vector3, hdg: number): void {
    const h = this.game;
    if (h.player) h.sim.remove(h.player);
    this.ownMissiles.clear();
    const p = h.createPlayer();
    p.netId = this.net.id;
    p.callsign = this.net.name || p.callsign;
    spawnInAir(p, pos, hdg, 460);
    h.sim.add(p);
    h.onPlayerRespawn();
    this.storm = 0;
    this.respawnT = -1;
    this.net.send({ t: 'ev', e: { k: 'spawn', jet: p.type } });
    this.sendStores();
  }

  /** Between matches: anywhere on a loose ring around the arena, heading in. */
  private spawnLobby(): void {
    const arena = ROLES.arena;
    const a = Math.random() * Math.PI * 2;
    const r = 14 * NM + Math.random() * 6 * NM;
    const x = arena.cx + Math.sin(a) * r;
    const z = arena.cz - Math.cos(a) * r;
    this.spawnAt(new THREE.Vector3(x, mapAlt(6400) + (Math.random() - 0.5) * 1200, z), headingTo(x, z, arena.cx, arena.cz));
    this.inMatch = false;
  }

  /** Match start: our slot on the ring. */
  private spawnSlot(s: { angle: number; ring: number; tier: number }): void {
    const arena = ROLES.arena;
    const x = arena.cx + Math.sin(s.angle) * s.ring;
    const z = arena.cz - Math.cos(s.angle) * s.ring;
    this.spawnAt(new THREE.Vector3(x, mapAlt(6400) + s.tier * 650, z), (headingTo(x, z, arena.cx, arena.cz) + (Math.random() - 0.5) * 16 + 360) % 360);
    this.inMatch = true;
  }

  // ------------------------------------------------------------ messages

  private onMessage(m: ServerMsg): void {
    switch (m.t) {
      case 'join':
        if (m.p.id !== this.net.id) {
          this.remotes.set(m.p.id, { p: m.p, ac: null, buf: [] });
          this.game.message(`${m.p.name} JOINED (${this.remotes.size + 1} PILOTS)`, 'info', 3);
        }
        break;
      case 'leave': {
        const r = this.remotes.get(m.id);
        if (r) {
          if (r.ac) this.game.sim.remove(r.ac);
          this.remotes.delete(m.id);
          this.game.message(`${r.p.name} LEFT`, 'info', 3);
        }
        break;
      }
      case 's':
        this.onState(m.id, m.d);
        break;
      case 'ev':
        this.onEvent(m.id, m.e);
        break;
      case 'hit':
        this.onHit(m.from, m.h);
        break;
      case 'dead':
        this.onDead(m);
        break;
      case 'match':
        this.applyMatch(m);
        break;
      case 'zone':
        this.zoneMsg = m;
        break;
      case 'chat': {
        const r = this.remotes.get(m.id);
        this.game.hud.feed(`${r ? r.p.name : 'YOU'}: ${m.text}`, 'blue');
        break;
      }
      case 'error':
        this.game.message(m.reason, 'bad', 5);
        break;
      case 'sys': {
        // a message from the server's operator
        const text = String(m.text ?? '').slice(0, 120);
        this.game.message(`SERVER: ${text}`, 'warn', 9);
        this.game.hud.feed(`SERVER: ${text}`, 'blue');
        break;
      }
      case 'smite': {
        const p = this.game.player;
        if (p && p.alive) p.destroy(this.game.sim, String(m.text || 'STRUCK DOWN BY THE SERVER').slice(0, 60), null);
        break;
      }
    }
  }

  private applyMatch(m: MatchMsg): void {
    const prev = this.match;
    this.match = m;
    this.matchEnd = performance.now() + m.timer * 1000;
    const h = this.game;
    if (m.state === 'live') {
      if (prev.matchId === m.matchId && prev.state === 'live') return;
      this.place = 0;
      this.myKills = 0;
      this.lastResults = null;
      // everyone respawns: wrecks from the last match go, fresh jets appear with their next update
      for (const r of this.remotes.values()) {
        if (r.ac && !r.ac.alive) {
          h.sim.remove(r.ac);
          r.ac = null;
          r.buf = [];
        }
      }
      this.dropinEnd = performance.now() + (m.dropin ?? 8) * 1000;
      RULES.holdFire = this.dropin > 0;
      RULES.zone.active = true;
      RULES.zone.r = 0; // snap to the new circle on the first zone update
      const slot = m.slots?.[String(this.net.id)];
      if (slot) {
        this.spawnSlot(slot);
        const n = Object.keys(m.slots ?? {}).length;
        // (a match we were still in when the next one started: settle it at the last place it could be)
        if (this.ranked) this.rankedSettle(this.ranked.of, false);
        this.rankNote = '';
        const rankLine = this.rankedStart(n);
        h.order('LAST PILOT STANDING', `${n} pilots. Weapons free in ${Math.ceil(this.dropin)} s. Stay inside the zone — the storm outside takes you down. Kills rearm you. Last jet flying wins.${rankLine}`, 8);
        h.voice('Last pilot standing');
      } else {
        // joined mid-match: watch this one, fly the next
        this.inMatch = false;
        const p = h.player;
        if (p) {
          p.alive = false;
          h.sim.remove(p);
        }
        h.message('MATCH IN PROGRESS — SPECTATING UNTIL THE NEXT ONE', 'info', 6);
      }
      return;
    }
    RULES.holdFire = true;
    RULES.zone.active = false;
    if (m.state === 'ended' && prev.state !== 'ended') {
      this.lastResults = m.results ?? [];
      const me = this.lastResults.find((r) => r.id === this.net.id);
      const win = this.lastResults[0];
      // still flying at the end: our place comes with the results
      if (this.ranked) this.rankedSettle(me ? me.place : this.ranked.of, false);
      const board = this.lastResults.slice(0, 6).map((r) => `#${r.place} ${r.id === this.net.id ? 'YOU' : r.name} (${r.kills})`).join(' · ');
      h.order(
        win ? (win.id === this.net.id ? 'YOU ARE THE LAST PILOT STANDING' : `${win.name} WINS`) : 'MATCH OVER',
        `${me ? `You placed #${me.place} with ${me.kills} kill${me.kills === 1 ? '' : 's'}. ` : ''}${board}.${this.rankNote ? ` ${this.rankNote}.` : ''} Next match soon.`,
        12,
      );
      h.voice(win && win.id === this.net.id ? 'Victory' : 'Match over');
    }
    if (m.state === 'waiting' && prev.state !== 'waiting') h.message('WAITING FOR ANOTHER PILOT — WEAPONS HOLD', 'info', 5);
    if (m.state === 'countdown' && prev.state !== 'countdown') {
      h.message(`MATCH STARTS IN ${Math.ceil(m.timer)} S — EVERYONE DROPS IN ON THE RING`, 'good', 5);
    }
    // back into the air for the lobby if we were down or watching
    if ((m.state === 'waiting' || m.state === 'countdown') && (!h.player || !h.player.alive || this.inMatch)) {
      if (!h.player || !h.player.alive) this.spawnLobby();
      this.inMatch = false;
    }
  }

  // ------------------------------------------------------------ other jets

  private remoteAircraft(r: Remote, id: number): Aircraft {
    if (r.ac) return r.ac;
    const a = new Aircraft(r.p.jet, 'red', r.p.name);
    a.remote = true;
    a.netId = id;
    a.paint = r.p.paint;
    a.jammerOn = false;
    r.ac = a;
    this.game.sim.add(a);
    return a;
  }

  private onState(id: number, d: number[]): void {
    const r = this.remotes.get(id);
    if (!r || !Array.isArray(d) || d.length < 18) return;
    for (const x of d) if (typeof x !== 'number' || !Number.isFinite(x)) return;
    const a = this.remoteAircraft(r, id);
    const now = performance.now() / 1000;
    r.buf.push({ t: now, d });
    if (r.buf.length > 30) r.buf.shift();
    // first update: jump straight there
    if (r.buf.length === 1) this.applySample(a, d, d, 0);
  }

  private onEvent(id: number, e: Record<string, unknown>): void {
    const r = this.remotes.get(id);
    if (!r) return;
    const sim = this.game.sim;
    switch (e.k) {
      case 'spawn': {
        const jet = AIRCRAFT_TYPES.includes(e.jet as AircraftType) ? (e.jet as AircraftType) : r.p.jet;
        if (r.ac) sim.remove(r.ac);
        r.ac = null;
        r.buf = [];
        r.p.jet = jet;
        break;
      }
      case 'st': {
        const a = r.ac;
        const list = e.s as (StoreType | null)[];
        if (!a || !Array.isArray(list)) break;
        a.stations.forEach((s, i) => (s.store = (list[i] as StoreType | null) ?? null));
        a.refreshStores();
        this.game.refreshStores(a);
        break;
      }
      case 'm+': {
        const a = r.ac;
        const type = e.type as MissileType;
        if (!a || !MISSILES[type]) break;
        const tgtId = e.tgt as number;
        const target = tgtId === this.net.id ? this.game.player : tgtId ? (this.remotes.get(tgtId)?.ac ?? null) : null;
        const pos = toVec(e.p);
        const m = new Missile(type, a, target, pos, e.st as number, !!e.stt);
        m.remote = true;
        m.netMid = e.mid as number;
        m.vel.copy(toVec(e.v));
        // (an IR missile starts in 'IR' already; a radar one is ejected first)
        this.theirMissiles.set(`${id}:${m.netMid}`, m);
        const st = a.stations.find((s) => s.def.id === e.st);
        if (st) {
          st.store = null;
          a.refreshStores();
        }
        sim.addMissile(m);
        sim.events.emit('launch', { missile: m, shooter: a, target, station: e.st as number });
        break;
      }
      case 'ms': {
        const list = e.l as number[][];
        if (!Array.isArray(list)) break;
        for (const u of list) {
          const m = this.theirMissiles.get(`${id}:${u[0]}`);
          if (!m || !m.alive) continue;
          m.pos.set(u[1], u[2], u[3]);
          m.vel.set(u[4], u[5], u[6]);
          m.mode = MODES[u[7]] ?? m.mode;
        }
        break;
      }
      case 'm-': {
        const key = `${id}:${e.mid}`;
        const m = this.theirMissiles.get(key);
        this.theirMissiles.delete(key);
        if (m && m.alive) sim.detonateMissile(m, toVec(e.p), String(e.kind ?? 'proximity'));
        break;
      }
      case 'cm':
        if (r.ac && r.ac.alive && (e.kind === 'flare' || e.kind === 'chaff')) sim.cms.deploy(r.ac, e.kind);
        break;
    }
  }

  /** Put a remote jet where it was `delay` ago, between two updates. */
  private applySample(a: Aircraft, d0: number[], d1: number[], f: number): void {
    const fm = a.fm;
    const L = (i: number) => d0[i] + (d1[i] - d0[i]) * f;
    fm.pos.set(L(0), L(1), L(2));
    _q0.set(d0[3], d0[4], d0[5], d0[6]);
    _q1.set(d1[3], d1[4], d1[5], d1[6]);
    fm.quat.copy(_q0.slerp(_q1, f)).normalize();
    fm.updateAxes();
    fm.vel.set(L(7), L(8), L(9));
    const V = fm.vel.length();
    atmosphere(fm.pos.y, _atm);
    fm.tas = V;
    fm.gs = Math.hypot(fm.vel.x, fm.vel.z);
    fm.mach = V / _atm.a;
    fm.rho = _atm.rho;
    fm.qbar = 0.5 * _atm.rho * V * V;
    fm.cas = V * Math.sqrt(_atm.sigma);
    fm.rpm.fill(L(10));
    fm.ab.fill(L(11));
    fm.gearPos = L(12);
    fm.speedbrakePos = L(13);
    fm.alpha = L(14);
    fm.nz = L(15);
    fm.agl = fm.pos.y;
    const flags = d1[16];
    a.gunFiring = !!(flags & F_GUN) && a.alive;
    if (flags & F_CRASHED && !fm.crashed) {
      fm.crashed = true;
      fm.surfaceKind = flags & F_WATER ? 'water' : 'terrain';
    }
    const dm = a.damage;
    dm.fire = flags & F_FIRE ? 5 : 0;
    dm.fireComponent = flags & F_FIRE ? 'engineL' : null;
    dm.hp.engineL = flags & F_HURT ? 16 : 55;
    // its radar: on, and locked on whom (for our RWR)
    const lockId = d1[17];
    a.radar.mode = flags & F_RADAR ? 'TWS' : 'OFF';
    a.radar.lock = !lockId ? null : lockId === this.net.id ? this.game.player : (this.remotes.get(lockId)?.ac ?? null);
  }

  private updateRemotes(): void {
    const now = performance.now() / 1000;
    const rt = now - INTERP_DELAY;
    const me = this.game.player;
    const sim = this.game.sim;
    for (const r of this.remotes.values()) {
      const a = r.ac;
      if (!a || r.buf.length === 0) continue;
      const b = r.buf;
      while (b.length > 2 && b[1].t <= rt) b.shift();
      if (b.length >= 2 && b[0].t <= rt && rt <= b[1].t) {
        this.applySample(a, b[0].d, b[1].d, (rt - b[0].t) / Math.max(1e-3, b[1].t - b[0].t));
      } else {
        // no newer update yet: carry on from the newest one along its velocity (briefly)
        const last = b[b.length - 1];
        this.applySample(a, last.d, last.d, 0);
        const ahead = Math.min(0.5, Math.max(0, rt - last.t));
        if (!a.fm.crashed) a.fm.pos.addScaledVector(_v.set(last.d[7], last.d[8], last.d[9]), ahead);
      }
      // their radar paints our RWR
      if (me && me.alive && a.alive && a.radar.mode !== 'OFF') {
        const d = a.fm.pos.distanceTo(me.fm.pos);
        if (d < 80 * NM && (a.radar.lock === me || d < 60 * NM) && sim.lineOfSight(a.fm.pos, me.fm.pos)) {
          me.rwr.paint(a, a.radar.lock === me ? 'lock' : 'search', sim.time);
        }
      }
    }
  }

  private netIdOf(a: Aircraft): number {
    return a === this.game.player ? this.net.id : a.netId;
  }

  // ------------------------------------------------------------ hits & kills

  private sendHit(victim: Aircraft, h: Record<string, unknown>): void {
    if (RULES.holdFire || !victim.netId) return;
    this.net.send({ t: 'hit', to: victim.netId, h });
  }

  private onHit(from: number, h: Record<string, unknown>): void {
    const p = this.game.player;
    if (!p || !p.alive || !this.inMatch) return;
    const shooter = this.remotes.get(from)?.ac ?? null;
    const sim = this.game.sim;
    const weapon = String(h.w ?? 'GUN').slice(0, 12);
    p.lastHitBy = { shooter, weapon, time: sim.time };
    if (h.k === 'g') {
      const comp = COMPONENTS.includes(h.c as Component) ? (h.c as Component) : 'fuselage';
      const dmg = Math.min(60, Math.max(0, Number(h.d) || 0));
      p.damage.apply(comp, dmg);
      sim.events.emit('hit', { victim: p, shooter, weapon, damage: dmg, pos: p.fm.pos.clone(), component: comp });
    } else if (h.k === 'b') {
      const amt = Math.min(1000, Math.max(0, Number(h.a) || 0));
      _v.set(Number(h.x) || 0, Number(h.y) || 0, Number(h.z) || 0);
      p.damage.applyBlast(_v, amt, p.spec.span, p.spec.length);
      sim.events.emit('hit', { victim: p, shooter, weapon, damage: amt, pos: p.fm.pos.clone(), component: null });
    }
  }

  /** Something died in our simulation: if it is us, tell everyone. */
  private onDestroyed(victim: Aircraft, killer: Aircraft | null, weapon: string, cause: string): void {
    const h = this.game;
    if (victim !== h.player || victim.remote) return;
    if (this.match.state === 'live' && this.inMatch) {
      this.net.send({ t: 'dead', killer: killer && killer !== victim ? this.netIdOf(killer) : null, weapon, cause });
    } else {
      // lobby mishap: straight back in
      this.respawnT = 4;
    }
  }

  private onDead(m: { id: number; killer: number | null; weapon: string; cause: string; place: number; left: number }): void {
    const h = this.game;
    const sim = h.sim;
    if (m.id === this.net.id) {
      this.place = m.place;
      h.message(`ELIMINATED — #${m.place}. ${m.left} LEFT · SPECTATING UNTIL THE NEXT MATCH`, 'bad', 8);
      // our place is final: settle the rank now (leaving to the menu after this is fine)
      if (this.ranked) this.rankedSettle(m.place, false);
      return;
    }
    const r = this.remotes.get(m.id);
    const killerAc = m.killer === this.net.id ? h.player : m.killer ? (this.remotes.get(m.killer)?.ac ?? null) : null;
    if (r?.ac && r.ac.alive) {
      if (killerAc) r.ac.lastHitBy = { shooter: killerAc, weapon: m.weapon, time: sim.time };
      r.ac.destroy(sim, m.cause || 'SHOT DOWN', killerAc);
    }
    if (m.killer === this.net.id && h.player?.alive) {
      this.myKills++;
      this.scavenge();
      if (m.left > 1) h.message(`${m.left} LEFT — REARMED: +1 MISSILE EACH, GUN, FLARES, FUEL`, 'good', 4);
    } else if (h.player?.alive && m.left > 1) h.message(`${m.left} PILOTS LEFT`, 'info', 3);
  }

  /** Kill reward: a missile of each kind back on the rails, rounds, decoys, fuel. */
  private scavenge(): void {
    const a = this.game.player;
    if (!a) return;
    let rdr = 1, ir = 1;
    for (const s of a.stations) {
      if (s.store) continue;
      const want = a.loadout.stores[s.def.id];
      if (want === a.radarMissile && rdr > 0) {
        s.store = want;
        rdr--;
      } else if (want === a.irMissile && ir > 0) {
        s.store = want;
        ir--;
      }
    }
    a.gunAmmo = Math.min(a.spec.gun.rounds, a.gunAmmo + Math.round(a.spec.gun.rounds * 0.3));
    a.flares = Math.min(a.spec.flares, a.flares + 8);
    a.chaff = Math.min(a.spec.chaff, a.chaff + 8);
    a.fm.fuelInternal = Math.min(a.spec.internalFuel, a.fm.fuelInternal + a.spec.internalFuel * 0.15);
    a.refreshStores();
    this.game.refreshStores(a);
    this.sendStores();
  }

  private sendStores(): void {
    const p = this.game.player;
    if (p) this.net.send({ t: 'ev', e: { k: 'st', s: p.stations.map((s) => s.store) } });
  }

  // ------------------------------------------------------------ per frame

  update(dt: number): void {
    const h = this.game;
    this.elapsed += dt;
    this.net.tick(dt);
    this.updateRemotes();
    // weapons free once the drop-in is over
    if (this.match.state === 'live') {
      const hold = this.dropin > 0;
      if (RULES.holdFire && !hold) {
        h.message("WEAPONS FREE — IT'S EVERY PILOT FOR THEMSELVES", 'good', 4);
        h.voice("Fight's on");
      }
      RULES.holdFire = hold;
    }
    this.updateZone(dt);
    // lobby crash: back in after a moment
    if (this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.match.state !== 'live') this.spawnLobby();
    }
    // clear wrecks that have been on the ground a while
    for (const a of [...h.sim.aircraft]) {
      if (a.remote && !a.alive && a.fm.crashed && h.sim.time - a.destroyedAt > 20) {
        h.sim.remove(a);
        for (const r of this.remotes.values()) if (r.ac === a) r.ac = null;
      }
    }
    this.sendState(dt);
  }

  private updateZone(dt: number): void {
    const z = this.zoneMsg;
    const zr = RULES.zone;
    if (this.match.state !== 'live' || !z) {
      zr.active = false;
      return;
    }
    const arena = ROLES.arena;
    zr.active = true;
    // ease toward the server's circle (updates come 4 times a second)
    const k = Math.min(1, dt * 6);
    const tx = arena.cx + z.x, tz = arena.cz + z.z;
    if (zr.r <= 0) {
      zr.x = tx;
      zr.z = tz;
      zr.r = z.r;
    }
    zr.x += (tx - zr.x) * k;
    zr.z += (tz - zr.z) * k;
    zr.r += (z.r - zr.r) * k;
    zr.nx = arena.cx + z.nx;
    zr.nz = arena.cz + z.nz;
    zr.nr = z.nr;
    zr.sx = zr.x;
    zr.sz = zr.z;
    zr.sr = zr.r;
    RULES.revealAll = z.reveal;
    // the storm, for our own jet
    const p = this.game.player;
    if (!p || !p.alive || !this.inMatch) return;
    const out = Math.hypot(p.fm.pos.x - zr.x, p.fm.pos.z - zr.z) > zr.r;
    if (!out) {
      this.storm = Math.max(0, this.storm - dt / 90);
      return;
    }
    this.storm += dt / Math.max(4, z.die);
    this.stormWarnT = 0.3;
    if (this.game.sim.time - this.lastStormHit > 1.2) {
      this.lastStormHit = this.game.sim.time;
      this.game.stormHit(this.storm);
    }
    if (this.storm >= 1) p.destroy(this.game.sim, 'CONSUMED BY THE STORM', p.lastHitBy && this.game.sim.time - p.lastHitBy.time < 20 ? p.lastHitBy.shooter : null);
  }

  private sendState(dt: number): void {
    const p = this.game.player;
    if (!p || !this.game.sim.aircraft.includes(p)) return;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / SEND_HZ;
      const fm = p.fm;
      let rpm = 0;
      for (const x of fm.rpm) rpm += x;
      rpm /= fm.rpm.length;
      const flags =
        (p.alive ? F_ALIVE : 0) |
        (p.gunFiring ? F_GUN : 0) |
        (fm.crashed ? F_CRASHED : 0) |
        (fm.surfaceKind === 'water' ? F_WATER : 0) |
        (p.radar.mode !== 'OFF' ? F_RADAR : 0) |
        (p.damage.fire > 0 ? F_FIRE : 0) |
        (p.damage.integrity < 0.6 ? F_HURT : 0);
      const lock = p.radar.lock ? this.netIdOf(p.radar.lock) : 0;
      this.net.send({
        t: 's',
        d: [
          r1(fm.pos.x), r1(fm.pos.y), r1(fm.pos.z),
          r4(fm.quat.x), r4(fm.quat.y), r4(fm.quat.z), r4(fm.quat.w),
          r1(fm.vel.x), r1(fm.vel.y), r1(fm.vel.z),
          r3(rpm), r3(fm.afterburner), r3(fm.gearPos), r3(fm.speedbrakePos), r3(fm.alpha), r1(fm.nz),
          flags, lock,
        ],
      });
    }
    // our missiles in flight
    this.missileT -= dt;
    if (this.missileT <= 0 && this.ownMissiles.size > 0) {
      this.missileT = 1 / MISSILE_HZ;
      const l: number[][] = [];
      for (const m of this.ownMissiles) {
        if (!m.alive) {
          this.ownMissiles.delete(m);
          continue;
        }
        l.push([m.id, r1(m.pos.x), r1(m.pos.y), r1(m.pos.z), r1(m.vel.x), r1(m.vel.y), r1(m.vel.z), MODES.indexOf(m.mode)]);
      }
      if (l.length) this.net.send({ t: 'ev', e: { k: 'ms', l } });
    }
  }

  // ------------------------------------------------------------ HUD

  /** Every pilot in the room with a jet in the air (for the spectator camera). */
  override roster(): Aircraft[] {
    const list: Aircraft[] = [];
    for (const r of this.remotes.values()) if (r.ac && r.ac.alive) list.push(r.ac);
    return list;
  }

  killsOf(a: Aircraft): number {
    return a === this.game.player ? this.myKills : a.kills;
  }

  status(): ModeStatus {
    const m = this.match;
    let alive = 0;
    for (const r of this.remotes.values()) if (r.ac && r.ac.alive) alive++;
    const me = this.game.player;
    if (me && me.alive) alive++;
    const pilots = this.remotes.size + 1;
    const ping = this.net.rtt ? ` · PING ${Math.round(this.net.rtt)} MS` : '';
    let objective = '';
    let timer = 0;
    let warning = '';
    if (m.state === 'waiting') objective = `WAITING FOR ANOTHER PILOT — WEAPONS HOLD${ping}`;
    else if (m.state === 'countdown') {
      timer = this.matchClock;
      objective = `MATCH STARTS IN ${Math.ceil(this.matchClock)} S — ${pilots} PILOTS${ping}`;
    } else if (m.state === 'ended') {
      timer = this.matchClock;
      objective = `MATCH OVER — NEXT ONE IN ${Math.ceil(this.matchClock)} S${ping}`;
    } else {
      const z = this.zoneMsg;
      timer = z ? z.left : 0;
      if (this.dropin > 0) objective = `DROP-IN — WEAPONS FREE IN ${Math.ceil(this.dropin)} S`;
      else if (!this.inMatch) objective = `SPECTATING — ${alive} LEFT${ping}`;
      else if (me && !me.alive) objective = `ELIMINATED #${this.place || '?'} — ${alive} LEFT${ping}`;
      else if (z) objective = (z.phase === 'shrink' ? (z.last ? 'SUDDEN DEATH — THE CIRCLE IS COLLAPSING' : 'ZONE CLOSING — GET INSIDE') : z.nr > 0 ? `ZONE CLOSES IN ${z.left} S` : 'FINAL CIRCLE') + ping;
      if (me && me.alive && this.stormWarnT > 0) {
        this.stormWarnT = Math.max(0, this.stormWarnT - 1 / 60);
        const secs = Math.max(0, (1 - this.storm) * (z?.die ?? 30));
        warning = `OUTSIDE THE ZONE — ${Math.ceil(secs)} S TO DESTRUCTION — GET BACK INSIDE`;
      }
    }
    return {
      title: `ONLINE · ${this.roomName}`,
      blue: alive,
      red: this.myKills,
      blueText: m.state === 'live' ? `ALIVE ${alive}` : `PILOTS ${pilots}`,
      redText: `KILLS ${this.myKills}`,
      timer,
      objective,
      warning,
    };
  }

  handle(action: ResultButton['action']): void {
    void action;
  }
}

function vec(v: THREE.Vector3): number[] {
  return [r1(v.x), r1(v.y), r1(v.z)];
}

function toVec(a: unknown): THREE.Vector3 {
  const v = Array.isArray(a) ? a : [];
  return new THREE.Vector3(Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0);
}

function headingTo(x: number, z: number, tx: number, tz: number): number {
  return ((Math.atan2(tx - x, -(tz - z)) * 180) / Math.PI + 360) % 360;
}

