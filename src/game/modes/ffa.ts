// Mode 5: LAST PILOT STANDING -- a 12-jet free-for-all.
//
// The player and eleven AI pilots, every one hostile to every other, drop in
// on a ring around the contested island facing inward. No respawns. A battle
// zone ("the storm" outside it) shrinks in stages toward a random final
// circle; outside it jets take steadily heavier damage until they go down.
// Kills refill a missile of each kind, some gun rounds, flares, chaff and
// fuel (scavenging). The jet with the most kills carries a bounty that every
// AI hunts and that pays extra. When two are left: FINAL DUEL, both rearmed.
// Last jet flying wins; everyone else is placed by when they went down.

import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import { AIPilot } from '../../ai/pilot';
import { duelSkill } from '../../ai/skill';
import { ROLES, mapAlt } from '../../world/islands';
import { spawnInAir, aiStores } from '../spawn';
import { AIRCRAFT_TYPES, AircraftType, StoreType } from '../../aircraft/specs';
import { randomPaint } from '../../aircraft/models/paint';
import { NM } from '../../core/constants';
import { rand, randPick } from '../../core/rng';
import { RULES } from '../rules';

/** total jets in the match, the player included */
export const FFA_JETS = 12;

const CALLSIGNS = [
  'GHOST', 'HAVOC', 'NOMAD', 'ONYX', 'SPECTRE', 'TITAN', 'VANDAL', 'WRAITH', 'ZEPHYR', 'JOKER', 'ROGUE', 'DAGGER',
  'BLAZE', 'RAPTOR', 'KESTREL', 'MONSOON', 'OUTLAW', 'PHANTOM', 'SABRE', 'TEMPEST', 'VORTEX', 'WARLOCK', 'YETI', 'BANSHEE',
];

/** zone stages: radius (NM), hold before the next shrink (s), shrink time into this circle (s), seconds outside to go down */
const STAGES = [
  { r: 40, hold: 75, shrink: 0, die: 60 },
  { r: 26, hold: 70, shrink: 55, die: 45 },
  { r: 16, hold: 60, shrink: 45, die: 32 },
  { r: 9, hold: 50, shrink: 35, die: 22 },
  { r: 4.5, hold: 45, shrink: 28, die: 14 },
  { r: 3, hold: 120, shrink: 22, die: 14 },
  // sudden death: the last circle collapses
  { r: 0.8, hold: 1e9, shrink: 75, die: 8 },
];

const PACE: Record<string, number> = { quick: 0.65, standard: 1, long: 1.45 };

interface Entry {
  a: Aircraft;
  kills: number;
  /** final placing (1 = winner), 0 while still flying */
  place: number;
  /** match time when it went down */
  downAt: number;
  cause: string;
  killedBy: string;
  bounties: number;
  /** storm exposure 0..1 (1 = destroyed) */
  storm: number;
}

type Phase = 'dropin' | 'combat' | 'over';

export class FreeForAllMode extends GameMode {
  phase: Phase = 'dropin';
  entries: Entry[] = [];
  private byId = new Map<number, Entry>();
  private stage = 0;
  private zonePhase: 'hold' | 'shrink' = 'hold';
  private zoneT = 0;
  /** circle we are shrinking from / to */
  private from = { x: 0, z: 0, r: 0 };
  private to = { x: 0, z: 0, r: 0 };
  private timer = 0;
  private finalDuel = false;
  private endTimer = -1;
  private unsub: (() => void)[] = [];
  private stormWarnT = 0;
  /** stage whose 30-second warning has been given */
  private warned30 = -1;
  private lastStormHit = 0;
  /** player's placing once decided */
  playerPlace = 0;

  private get pace(): number {
    return PACE[this.host.config.ffaPace] ?? 1;
  }

  start(): void {
    const h = this.host;
    const cfg = h.config;
    this.clearField();
    this.phase = 'dropin';
    this.timer = 6;
    this.elapsed = 0;
    this.finalDuel = false;
    this.endTimer = -1;
    this.playerPlace = 0;
    this.entries = [];
    this.byId.clear();
    RULES.ffa = true;
    RULES.bountyId = -1;
    RULES.revealAll = false;
    h.picture.gciEnabled.blue = false;
    h.picture.gciEnabled.red = false;

    // the battle zone starts centred on the contested island
    const arena = ROLES.arena;
    this.stage = 0;
    this.warned30 = -1;
    this.zonePhase = 'hold';
    this.zoneT = 0;
    this.from = { x: arena.cx, z: arena.cz, r: STAGES[0].r * NM };
    this.to = { ...this.from };
    this.pickNext();
    this.publishZone();

    // twelve jets on a ring, facing the middle, staggered in height
    const skill = duelSkill(cfg.difficulty);
    const names = [...CALLSIGNS].sort(() => Math.random() - 0.5);
    const ring = STAGES[0].r * NM * 0.8;
    const playerSlot = Math.floor(Math.random() * FFA_JETS);
    const a0 = Math.random() * Math.PI * 2;
    let n = 0;
    for (let i = 0; i < FFA_JETS; i++) {
      const ang = a0 + (i / FFA_JETS) * Math.PI * 2 + rand(-0.08, 0.08);
      const x = arena.cx + Math.sin(ang) * ring;
      const z = arena.cz - Math.cos(ang) * ring;
      const hdg = ((Math.atan2(arena.cx - x, -(arena.cz - z)) * 180) / Math.PI + 360 + rand(-12, 12)) % 360;
      const alt = mapAlt(6400) + ((i % 3) - 1) * 650 + rand(-150, 150);
      let a: Aircraft;
      if (i === playerSlot) {
        a = h.createPlayer();
        this.loadout(a, true);
      } else {
        const type: AircraftType = cfg.ffaJets === 'same' ? cfg.aircraft : randPick(AIRCRAFT_TYPES);
        a = new Aircraft(type, 'red', names[n++]);
        a.paint = randomPaint();
        this.loadout(a, false);
        const ai = new AIPilot(a, { ...skill, weapons: { ...skill.weapons } }, h.picture);
        ai.setRoute(this.zoneRoute(), mapAlt(6600) + rand(-500, 500));
        ai.bracketSide = i % 2 === 0 ? 1 : -1;
        a.ai = ai;
      }
      spawnInAir(a, new THREE.Vector3(x, alt, z), hdg, 460);
      const e: Entry = { a, kills: 0, place: 0, downAt: 0, cause: '', killedBy: '', bounties: 0, storm: 0 };
      this.entries.push(e);
      this.byId.set(a.id, e);
      h.sim.add(a);
    }

    const ev = h.sim.events;
    this.unsub.push(ev.on('destroyed', (e) => this.onDestroyed(e.victim, e.killer, e.weapon, e.cause)));

    const rules = cfg.duelRules === 'guns' ? 'GUNS ONLY' : cfg.duelRules === 'ir' ? 'HEATERS AND GUNS ONLY' : 'ALL WEAPONS FREE';
    h.order(
      `LAST PILOT STANDING — ${FFA_JETS} JETS`,
      `Every jet is hostile. No respawns, no wingmen. The battle zone shrinks in stages — stay inside or the storm will take you down. Kills refill a missile of each type, gun rounds, flares and fuel. Most kills carries the bounty. ${rules}. Last jet flying wins.`,
      11,
    );
    h.voice('Last pilot standing');
    h.onPlayerRespawn?.();
  }

  private clearField(): void {
    const h = this.host;
    for (const a of [...h.sim.aircraft]) h.sim.remove(a);
    h.sim.missiles.length = 0;
    h.sim.bullets.clear();
    h.sim.cms.clear();
    h.picture.clear();
    for (const u of this.unsub) u();
    this.unsub = [];
  }

  private loadout(a: Aircraft, isPlayer: boolean): void {
    const rules = this.host.config.duelRules;
    if (rules === 'ir') a.setStores(aiStores(a, 0, isPlayer ? Math.min(6, a.spec.maxAAM) : 4));
    else if (rules === 'guns') {
      a.setStores({});
      a.selectedWeapon = 'GUN';
    } else if (!isPlayer) a.setStores(aiStores(a, 4, 2));
  }

  // ---------------------------------------------------------------- zone

  /** Choose the next circle: smaller, somewhere inside the current one. */
  private pickNext(): void {
    const next = STAGES[this.stage + 1];
    if (!next) return;
    const cur = this.to;
    const nr = next.r * NM;
    const slack = Math.max(0, cur.r - nr) * 0.85;
    const ang = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * slack;
    this.nextCircle = { x: cur.x + Math.sin(ang) * d, z: cur.z - Math.cos(ang) * d, r: nr };
  }
  private nextCircle = { x: 0, z: 0, r: 0 };

  private get zone(): { x: number; z: number; r: number } {
    if (this.zonePhase === 'hold') return this.to;
    const st = STAGES[this.stage];
    const k = Math.min(1, this.zoneT / Math.max(1, st.shrink * this.pace));
    const s = k * k * (3 - 2 * k);
    return {
      x: this.from.x + (this.to.x - this.from.x) * s,
      z: this.from.z + (this.to.z - this.from.z) * s,
      r: this.from.r + (this.to.r - this.from.r) * s,
    };
  }

  private publishZone(): void {
    const z = this.zone;
    const zr = RULES.zone;
    zr.active = true;
    zr.x = z.x;
    zr.z = z.z;
    zr.r = z.r;
    // where the edge is heading: the circle it is shrinking into, or the next one
    const next = this.zonePhase === 'shrink' ? this.to : STAGES[this.stage + 1] ? this.nextCircle : null;
    zr.nx = next ? next.x : z.x;
    zr.nz = next ? next.z : z.z;
    zr.nr = next ? next.r : 0;
    // the AI gets inside the destination early (while shrinking, and 20 s before)
    const holdLeft = STAGES[this.stage].hold * this.pace - this.zoneT;
    const early = next && (this.zonePhase === 'shrink' || holdLeft < 20);
    zr.sx = early ? next.x : z.x;
    zr.sz = early ? next.z : z.z;
    zr.sr = early ? Math.min(next.r, z.r) : z.r;
  }

  /** A few waypoints inside the (next) zone for patrolling AI. */
  private zoneRoute(): THREE.Vector3[] {
    const c = this.zonePhase === 'hold' && this.nextCircle.r > 0 ? this.nextCircle : this.to;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * c.r * 0.7;
      pts.push(new THREE.Vector3(c.x + Math.sin(ang) * d, mapAlt(6600) + rand(-600, 600), c.z - Math.cos(ang) * d));
    }
    return pts;
  }

  private rerouteAi(): void {
    for (const e of this.entries) if (e.a.alive && e.a.ai) e.a.ai.setRoute(this.zoneRoute());
  }

  private updateZone(dt: number): void {
    const h = this.host;
    this.zoneT += dt;
    const st = STAGES[this.stage];
    if (this.zonePhase === 'hold') {
      const left = st.hold * this.pace - this.zoneT;
      if (STAGES[this.stage + 1] && left <= 0) {
        // start closing in on the next circle
        this.stage++;
        this.zonePhase = 'shrink';
        this.zoneT = 0;
        this.from = { ...this.to };
        this.to = { ...this.nextCircle };
        const sudden = this.stage === STAGES.length - 1;
        if (this.stage >= 4 && !RULES.revealAll) {
          RULES.revealAll = true;
          h.message('FINAL CIRCLES — EVERY JET IS NOW REVEALED ON RADAR', 'order', 6);
        }
        h.message(sudden ? 'SUDDEN DEATH — THE LAST CIRCLE IS COLLAPSING' : `THE ZONE IS CLOSING — STAGE ${this.stage} OF ${STAGES.length - 2}`, sudden ? 'bad' : 'warn', 6);
        h.voice(sudden ? 'Sudden death' : 'Zone closing');
        this.rerouteAi();
      } else if (left <= 30 && this.warned30 !== this.stage && STAGES[this.stage + 1]) {
        this.warned30 = this.stage;
        h.message('ZONE CLOSES IN 30 SECONDS — CHECK THE MAP [M]', 'warn', 5);
      }
    } else if (this.zoneT >= st.shrink * this.pace) {
      this.zonePhase = 'hold';
      this.zoneT = 0;
      this.pickNext();
      this.rerouteAi();
    }
    this.publishZone();

    // the storm: damage builds up while outside the zone
    const z = this.zone;
    const die = STAGES[this.stage].die;
    for (const e of this.entries) {
      const a = e.a;
      if (!a.alive) continue;
      const out = Math.hypot(a.fm.pos.x - z.x, a.fm.pos.z - z.z) > z.r;
      if (!out) {
        // the airframe slowly recovers once back inside
        e.storm = Math.max(0, e.storm - dt / 90);
        continue;
      }
      e.storm += dt / die;
      if (a.isPlayer) {
        this.stormWarnT = 0.3;
        if (h.sim.time - this.lastStormHit > 1.2) {
          this.lastStormHit = h.sim.time;
          h.stormHit?.(e.storm);
        }
      }
      if (e.storm >= 1) a.destroy(h.sim, 'CONSUMED BY THE STORM', null);
    }
    this.stormWarnT = Math.max(0, this.stormWarnT - dt);
  }

  // ---------------------------------------------------------------- kills

  private aliveCount(): number {
    let n = 0;
    for (const e of this.entries) if (e.a.alive) n++;
    return n;
  }

  private onDestroyed(victim: Aircraft, killer: Aircraft | null, weapon: string, cause: string): void {
    const h = this.host;
    const v = this.byId.get(victim.id);
    if (!v || v.place) return;
    const alive = this.aliveCount();
    v.place = alive + 1;
    v.downAt = this.elapsed;
    v.cause = cause;
    const k = killer ? this.byId.get(killer.id) : undefined;
    if (k && k !== v) {
      k.kills++;
      v.killedBy = `${killer!.callsign} · ${weapon}`;
      if (killer!.alive) this.scavenge(killer!);
      // claimed a bounty?
      if (victim.id === RULES.bountyId) {
        k.bounties++;
        if (killer!.isPlayer) {
          h.message(`BOUNTY CLAIMED — ${victim.callsign} (${v.kills} KILLS)`, 'good', 6);
          h.award?.('BOUNTY CLAIMED', 150, 600);
        } else h.message(`${killer!.callsign} CLAIMED THE BOUNTY ON ${victim.callsign}`, 'info', 5);
        RULES.bountyId = -1;
      }
      if (killer!.isPlayer) h.message(`${alive} LEFT — REARMED: +1 MISSILE EACH, GUN, FLARES, FUEL`, 'good', 4);
    } else v.killedBy = cause;
    if (victim.isPlayer) {
      this.playerPlace = v.place;
      h.message(`ELIMINATED — #${v.place} OF ${FFA_JETS}. SPECTATING: [T] FAST-FORWARD · [ESC] QUIT`, 'bad', 10);
    } else if (h.player?.alive) {
      if (alive > 2) h.message(`${alive} PILOTS LEFT`, 'info', 3);
    }
    this.updateBounty();
    if (alive === 2 && !this.finalDuel) {
      this.finalDuel = true;
      const last = this.entries.filter((e) => e.a.alive);
      for (const e of last) this.scavenge(e.a, true);
      h.order('FINAL DUEL', `${last.map((e) => `${e.a.callsign} [${e.a.spec.shortName}]`).join('  vs  ')} — both rearmed. One of you goes home.`, 7);
      h.voice('Final duel');
    }
    if (alive <= 1 && this.endTimer < 0) this.endTimer = 3.5;
  }

  /** Kill reward: a missile of each kind back on the rails, rounds, decoys, fuel. `full` = everything. */
  private scavenge(a: Aircraft, full = false): void {
    let r = full ? 99 : 1;
    let ir = full ? 99 : 1;
    for (const s of a.stations) {
      if (s.store) continue;
      const want = a.loadout.stores[s.def.id] as StoreType | undefined;
      if (want === a.radarMissile && r > 0) {
        s.store = want;
        r--;
      } else if (want === a.irMissile && ir > 0) {
        s.store = want;
        ir--;
      }
    }
    a.gunAmmo = Math.min(a.spec.gun.rounds, a.gunAmmo + Math.round(a.spec.gun.rounds * (full ? 1 : 0.3)));
    a.flares = Math.min(a.spec.flares, a.flares + (full ? a.spec.flares : 8));
    a.chaff = Math.min(a.spec.chaff, a.chaff + (full ? a.spec.chaff : 8));
    a.fm.fuelInternal = Math.min(a.spec.internalFuel, a.fm.fuelInternal + a.spec.internalFuel * (full ? 0.5 : 0.15));
    a.refreshStores();
    if (a.selectedWeapon === 'GUN' && this.host.config.duelRules !== 'guns') {
      if (a.countOf(a.radarMissile) > 0) a.selectedWeapon = a.radarMissile;
      else if (a.countOf(a.irMissile) > 0) a.selectedWeapon = a.irMissile;
    }
    this.host.refreshStores(a);
  }

  /** The bounty sits on the single top scorer with at least two kills. */
  private updateBounty(): void {
    const h = this.host;
    let best: Entry | null = null;
    let tie = false;
    for (const e of this.entries) {
      if (!e.a.alive || e.kills < 2) continue;
      if (!best || e.kills > best.kills) {
        best = e;
        tie = false;
      } else if (e.kills === best.kills) tie = true;
    }
    const id = best && !tie ? best.a.id : -1;
    const cur = this.byId.get(RULES.bountyId);
    if (id === RULES.bountyId || (id === -1 && cur?.a.alive)) return;
    RULES.bountyId = id;
    if (!best || tie) return;
    if (best.a.isPlayer) {
      h.message(`YOU CARRY THE BOUNTY (${best.kills} KILLS) — EVERYONE IS HUNTING YOU`, 'warn', 6);
      h.voice('Bounty on you');
    } else h.message(`BOUNTY ON ${best.a.callsign} [${best.a.spec.shortName}] — ${best.kills} KILLS — +150 XP FOR THE KILL`, 'order', 6);
  }

  // ---------------------------------------------------------------- loop

  update(dt: number): void {
    const h = this.host;
    if (this.phase === 'over') return;
    this.elapsed += dt;
    // clear wrecks a while after they hit the ground
    for (const a of [...h.sim.aircraft]) {
      if (!a.isPlayer && !a.alive && a.fm.crashed && h.sim.time - a.destroyedAt > 25) h.sim.remove(a);
    }
    if (this.phase === 'dropin') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'combat';
        h.message("WEAPONS FREE — IT'S EVERY PILOT FOR THEMSELVES", 'good', 4);
        h.voice("Fight's on");
      }
    }
    this.updateZone(dt);
    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish();
    }
  }

  private finish(): void {
    const h = this.host;
    this.phase = 'over';
    this.over = true;
    RULES.zone.active = false;
    // the survivor (if any) wins
    for (const e of this.entries) if (!e.place) e.place = 1;
    const ranked = [...this.entries].sort((a, b) => a.place - b.place || b.kills - a.kills);
    const me = this.entries.find((e) => e.a.isPlayer);
    const place = me?.place ?? FFA_JETS;
    this.playerPlace = place;
    const won = place === 1;
    const winner = ranked[0];
    const t = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const suffix = (n: number) => (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH');
    const board: [string, string][] = ranked.map((e) => [
      `${e.place}${suffix(e.place)}  ${e.a.isPlayer ? 'YOU' : e.a.callsign} [${e.a.spec.shortName}]`,
      `${e.kills} KILL${e.kills === 1 ? '' : 'S'}${e.place > 1 ? ` · DOWN ${t(e.downAt)}` : ' · WINNER'}`,
    ]);
    h.showResults({
      title: won ? 'LAST PILOT STANDING' : `${place}${suffix(place)} PLACE`,
      subtitle: won
        ? `You outlasted ${FFA_JETS - 1} pilots with ${me?.kills ?? 0} kill${me?.kills === 1 ? '' : 's'}.`
        : `${winner.a.callsign} [${winner.a.spec.shortName}] won with ${winner.kills} kill${winner.kills === 1 ? '' : 's'}. ${me?.killedBy ? `You were taken down by ${me.killedBy}.` : ''}`,
      good: place <= 3,
      stats: [
        ['YOUR PLACING', `${place} / ${FFA_JETS}`],
        ['YOUR KILLS', String(me?.kills ?? 0)],
        ['BOUNTIES CLAIMED', String(me?.bounties ?? 0)],
        ['SURVIVED', t(me && me.place > 1 ? me.downAt : this.elapsed)],
        ['MATCH TIME', t(this.elapsed)],
        ['AI DIFFICULTY', h.config.difficulty],
        ...board,
      ],
      buttons: [
        { label: 'PLAY AGAIN', action: 'retry' },
        { label: 'MAIN MENU', action: 'menu' },
      ],
    });
  }

  /** Everyone in the match (for the spectator list). */
  override roster(): Aircraft[] {
    return this.entries.map((e) => e.a);
  }

  killsOf(a: Aircraft): number {
    return this.byId.get(a.id)?.kills ?? 0;
  }

  status(): ModeStatus {
    const alive = this.aliveCount();
    const me = this.entries.find((e) => e.a.isPlayer);
    const st = STAGES[this.stage];
    let timer = 0;
    let objective = '';
    if (this.phase === 'dropin') objective = `DROP-IN — WEAPONS FREE IN ${Math.ceil(this.timer)} S`;
    if (this.zonePhase === 'hold') {
      timer = STAGES[this.stage + 1] ? Math.max(0, st.hold * this.pace - this.zoneT) : 0;
      if (this.phase !== 'dropin') objective = STAGES[this.stage + 1] ? `ZONE CLOSES IN ${Math.ceil(timer)} S` : 'FINAL CIRCLE';
    } else {
      timer = Math.max(0, st.shrink * this.pace - this.zoneT);
      if (this.phase !== 'dropin') objective = this.stage === STAGES.length - 1 ? 'SUDDEN DEATH — THE CIRCLE IS COLLAPSING' : 'ZONE CLOSING — GET INSIDE';
    }
    if (me && !me.a.alive) objective = `ELIMINATED #${me.place} — ${alive} LEFT · [T] FAST-FORWARD`;
    else if (this.finalDuel && alive === 2) objective = 'FINAL DUEL';
    let warning = '';
    if (me && me.a.alive && this.stormWarnT > 0) {
      const secs = Math.max(0, (1 - me.storm) * STAGES[this.stage].die);
      warning = `OUTSIDE THE ZONE — ${Math.ceil(secs)} S TO DESTRUCTION — GET BACK INSIDE`;
    }
    return {
      title: 'FREE-FOR-ALL',
      blue: alive,
      red: me?.kills ?? 0,
      blueText: `ALIVE ${alive}/${FFA_JETS}`,
      redText: `KILLS ${me?.kills ?? 0}`,
      timer,
      objective,
      warning,
    };
  }

  handle(action: ResultButton['action']): void {
    if (action === 'retry') {
      this.over = false;
      this.start();
    }
  }

  override dispose(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    RULES.ffa = false;
    RULES.zone.active = false;
    RULES.bountyId = -1;
    RULES.revealAll = false;
  }
}
