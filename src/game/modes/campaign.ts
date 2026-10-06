// CAMPAIGN director: builds and runs the eight story missions of
// src/game/campaign.ts, one at a time.
//
// Everything is laid out along the line from our front-line field ({FIELD})
// to the enemy's ({REDFIELD}), as fractions of the distance between them, so
// the same story plays on every land theater. The cast talks over the radio:
// OVERLORD (our airborne controller), VIPER 1-2 (your wingman), the bomber
// and strike leads, and WOLF 1, RED's ace, whose channel we listen to.

import * as THREE from 'three';
import { GameMode, ModeHost, ModeStatus, ResultButton, MsgKind, braa, statsFor } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import { AIPilot } from '../../ai/pilot';
import { duelSkill, Difficulty, DIFFICULTIES } from '../../ai/skill';
import { airfieldsOf, AirfieldDef, fromRunwayLocal, mapAlt } from '../../world/islands';
import { spawnOnRunway, spawnInAir, aiStores } from '../spawn';
import { NM, DEG, MAP_HALF } from '../../core/constants';
import { SPECS, strikeLoadout, AircraftType, COMBAT_TYPES, enemyTypesFor } from '../../aircraft/specs';
import { setMissionObjective } from '../../avionics/nav';
import { GroundUnit, GroundKind, AirDefense, DEFENSES, UNIT_DEFS } from '../ground';
import { findEnemySite, SiteType } from './strike';
import { bearingXZ } from '../../core/math';
import { CAMPAIGN, CAMPAIGN_EPILOGUE, CampaignMission, campaignHome, campaignRedField, campaignSpan, campaignText, raidRanges, saveCampaignStars, starCount, loadCampaign } from '../campaign';

const LAND_CLOCK = 150;

function mmss(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

interface Line {
  at: number;
  who: string;
  text: string;
  kind: MsgKind;
  voice?: string;
}

export class CampaignMode extends GameMode {
  readonly idx: number;
  readonly M: CampaignMission;
  private H!: AirfieldDef;
  private RF!: AirfieldDef;
  /** distance from our field to theirs (m) */
  private D = 0;
  private phase = 'start';
  private wing: Aircraft | null = null;
  private proxy: AIPilot | null = null;
  private allies: Aircraft[] = [];
  private enemies: Aircraft[] = [];
  /** the mission's main group of hostiles (bandits, bombers, GHOST, WOLF 1...) */
  private targets: Aircraft[] = [];
  /** the second group (escorts, alert fighters) */
  private escorts: Aircraft[] = [];
  private primaries: GroundUnit[] = [];
  private defenseUnits: GroundUnit[] = [];
  private parked: GroundUnit[] = [];
  private bombed = new Set<Aircraft>();
  private site = new THREE.Vector3();
  private killers = new Map<Aircraft, Aircraft | null>();
  private radio: Line[] = [];
  private deadTimer = 0;
  private endTimer = -1;
  private endText = '';
  private gciTimer = 30;
  private huntTimer = 0;
  private landClock = -1;
  private landed = false;
  private flags: Record<string, boolean | number> = {};
  private unsub: (() => void)[] = [];

  constructor(host: ModeHost) {
    super(host);
    this.idx = Math.max(0, Math.min(CAMPAIGN.length - 1, host.config.campaignMission ?? 0));
    this.M = CAMPAIGN[this.idx];
  }

  start(): void {
    const ev = this.host.sim.events;
    this.unsub.push(
      ev.on('destroyed', (e) => {
        this.killers.set(e.victim, e.killer);
        this.onDown(e.victim, e.killer);
      }),
      ev.on('groundDestroyed', (e) => this.onGround(e.unit, e.by)),
      ev.on('bombImpact', (e) => {
        if (e.bomb.shooter === this.host.player) this.alarm();
      }),
    );
    this.setup();
  }

  // -------------------------------------------------------------------------
  // Helpers: places, jets, radio
  // -------------------------------------------------------------------------

  /** a point a fraction `f` of the way from our field to theirs, `side` metres to the right */
  private pt(f: number, side = 0): THREE.Vector3 {
    const H = this.H, R = this.RF;
    const ux = (R.x - H.x) / this.D, uz = (R.z - H.z) / this.D;
    const lim = MAP_HALF * 0.92;
    return new THREE.Vector3(
      THREE.MathUtils.clamp(H.x + ux * this.D * f - uz * side, -lim, lim),
      0,
      THREE.MathUtils.clamp(H.z + uz * this.D * f + ux * side, -lim, lim),
    );
  }

  /** a cruising altitude here, scaled to the theater and clear of the ground */
  private alt(v: THREE.Vector3, m: number): THREE.Vector3 {
    v.y = Math.max(mapAlt(m), this.host.sim.grid.height(v.x, v.z) + 1500);
    return v;
  }

  private hdg(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return bearingXZ(a.x, a.z, b.x, b.z);
  }

  private dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  /** the mission's AI difficulty, shifted by the one picked in the menu */
  private diff(base: Difficulty, extra = 0): Difficulty {
    const shift = DIFFICULTIES.indexOf(this.host.config.difficulty) - 1;
    return DIFFICULTIES[THREE.MathUtils.clamp(DIFFICULTIES.indexOf(base) + shift + extra, 0, 3)];
  }

  /** an enemy type, the first of `pref` the rules allow (never the player's own type) */
  private redType(pref: AircraftType[]): AircraftType {
    const ok = enemyTypesFor(this.host.config.aircraft);
    return pref.find((t) => ok.includes(t)) ?? ok[Math.floor(Math.random() * ok.length)];
  }

  private red(type: AircraftType, cs: string, pos: THREE.Vector3, hdg: number, d: Difficulty, o: { passive?: boolean; a120?: number; a9?: number; kts?: number; loadout?: string } = {}): Aircraft {
    const e = new Aircraft(type, 'red', cs, o.loadout);
    if (!o.loadout) e.setStores(aiStores(e, o.a120 ?? 2, o.a9 ?? 2));
    spawnInAir(e, pos, hdg, o.kts ?? 450);
    const ai = new AIPilot(e, duelSkill(d), this.host.picture);
    ai.passive = !!o.passive;
    e.ai = ai;
    this.host.sim.add(e);
    this.enemies.push(e);
    return e;
  }

  private blue(type: AircraftType, cs: string, pos: THREE.Vector3, hdg: number, o: { passive?: boolean; loadout?: string; kts?: number; d?: Difficulty } = {}): Aircraft {
    const a = new Aircraft(type, 'blue', cs, o.loadout);
    if (!o.loadout) a.setStores(aiStores(a, 4, 2));
    spawnInAir(a, pos, hdg, o.kts ?? 450);
    const ai = new AIPilot(a, duelSkill(o.d ?? 'HARD'), this.host.picture);
    ai.passive = !!o.passive;
    a.ai = ai;
    this.host.sim.add(a);
    this.allies.push(a);
    return a;
  }

  /** VIPER 1-2 on the player's right wing, holding formation (and fire) until released */
  private wingman(p: Aircraft, hold = true): Aircraft {
    const h = Math.atan2(p.fm.fwd.x, -p.fm.fwd.z);
    const fwd = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
    const right = new THREE.Vector3(Math.cos(h), 0, Math.sin(h));
    const pos = p.fm.pos.clone().addScaledVector(right, 600).addScaledVector(fwd, -400);
    const w = this.blue(this.host.config.aircraft, 'VIPER 1-2', pos, (h / DEG + 360) % 360, { kts: p.fm.vel.length() / 0.5144 });
    // the player has no AI of their own: a stand-in leader the wingman can follow
    this.proxy = new AIPilot(p, duelSkill('HARD'), this.host.picture);
    const ai = w.ai as AIPilot;
    ai.leader = this.proxy;
    ai.state = 'FORMATION';
    ai.formationHold = hold;
    this.wing = w;
    return w;
  }

  private release(): void {
    const ai = this.wing?.ai as AIPilot | null;
    if (ai) ai.formationHold = false;
  }

  /** queue a radio call `delay` seconds from now */
  private say(who: string, text: string, delay = 0, kind: MsgKind = 'gci', voice?: string): void {
    this.radio.push({ at: this.elapsed + delay, who, text: campaignText(text), kind, voice });
    this.radio.sort((a, b) => a.at - b.at);
  }

  /** passive jets turn hot and come for the player */
  private wake(list: Aircraft[]): void {
    const p = this.host.player;
    if (!p) return;
    this.host.picture.gciEnabled.red = true;
    for (const e of list) {
      const ai = e.ai as AIPilot | null;
      if (!ai || !e.alive) continue;
      ai.passive = false;
      ai.setRoute([p.fm.pos.clone()], Math.max(e.fm.pos.y, mapAlt(4500)));
    }
  }

  /** circle a point, radar silent, until woken */
  private orbit(e: Aircraft, c: THREE.Vector3, r: number, a0: number): void {
    const route: THREE.Vector3[] = [];
    for (let k = 1; k <= 6; k++) {
      const a = a0 + (k / 6) * Math.PI * 2;
      route.push(new THREE.Vector3(c.x + Math.sin(a) * r, e.fm.pos.y, c.z - Math.cos(a) * r));
    }
    (e.ai as AIPilot).setRoute(route, e.fm.pos.y);
  }

  /** fighters on the runway of a RED field, lined up to take off one behind the other */
  private scramble(f: AirfieldDef, n: number, prefix: string, d: Difficulty, type: AircraftType): Aircraft[] {
    const out: Aircraft[] = [];
    for (let i = 0; i < n; i++) {
      const e = new Aircraft(type, 'red', `${prefix} ${i + 1}`);
      e.setStores(aiStores(e, 2, 2));
      spawnOnRunway(e, f);
      e.fm.pos.addScaledVector(new THREE.Vector3(f.ax, 0, f.az), i * 300);
      e.ai = new AIPilot(e, duelSkill(d), this.host.picture);
      this.host.sim.add(e);
      this.enemies.push(e);
      out.push(e);
    }
    this.host.picture.gciEnabled.red = true;
    return out;
  }

  private alive(list: Aircraft[]): Aircraft[] {
    return list.filter((a) => a.alive);
  }

  /** a sleeping patrol notices when it is shot at (or loses a jet): no sniping it from long range */
  private firedOn(list: Aircraft[]): boolean {
    const p = this.host.player;
    return list.some((e) => !e.alive) || this.host.sim.missiles.some((m) => m.shooter === p && !!m.target && list.includes(m.target));
  }

  private killedByPlayer(a: Aircraft): boolean {
    return !a.alive && this.killers.get(a) === this.host.player;
  }

  // -------------------------------------------------------------------------
  // Ground targets
  // -------------------------------------------------------------------------

  private unit(kind: GroundKind, x: number, z: number, hdg: number, primary: boolean, label?: string, y?: number): GroundUnit {
    const u = new GroundUnit(kind, new THREE.Vector3(x, y ?? Math.max(0, this.host.sim.grid.height(x, z)), z), hdg, primary, label ?? UNIT_DEFS[kind].name);
    this.host.sim.ground.push(u);
    if (primary) this.primaries.push(u);
    return u;
  }

  private skill(): number {
    return { EASY: 0.2, MEDIUM: 0.45, HARD: 0.7, EXTREME: 0.92 }[this.diff(this.M.difficulty)];
  }

  /** an air defence `r` metres out from the site, with its own radar if it needs one */
  private defense(kind: string, a: number, r: number): void {
    const spec = DEFENSES[kind];
    const x = this.site.x + Math.cos(a) * r, z = this.site.z + Math.sin(a) * r;
    const u = this.unit(spec.kind === 'AAA' ? 'aaa' : 'sam', x, z, a, false, spec.name);
    this.defenseUnits.push(u);
    const d = new AirDefense(spec, u, this.skill());
    if (spec.kind === 'SAM_RADAR') d.radar = this.unit('samRadar', x + 30, z + 20, 0, false, `${spec.short} RADAR`);
    this.host.sim.defenses.push(d);
  }

  /** the closest good spot on enemy ground for a site of this type (a few tries) */
  private pickSite(type: SiteType): THREE.Vector3 {
    let best: { x: number; z: number } | null = null;
    for (let i = 0; i < 5; i++) {
      const s = findEnemySite(this.host.sim.grid, type);
      if (!best || this.dist(s, this.H) < this.dist(best, this.H)) best = s;
    }
    return new THREE.Vector3(best!.x, 0, best!.z);
  }

  private buildSite(type: 'radar' | 'command'): void {
    const c = this.pickSite(type);
    this.site.copy(c);
    const rot = Math.random() * Math.PI * 2;
    const at = (lx: number, lz: number) => ({ x: c.x + lx * Math.cos(rot) - lz * Math.sin(rot), z: c.z + lx * Math.sin(rot) + lz * Math.cos(rot) });
    const put = (kind: GroundKind, lx: number, lz: number, primary: boolean, label?: string) => {
      const q = at(lx, lz);
      return this.unit(kind, q.x, q.z, rot, primary, label);
    };
    if (type === 'radar') {
      put('ewr', 0, 0, true, 'RADAR 1');
      put('ewr', 72, 30, true, 'RADAR 2');
      put('mast', -60, 40, true, 'RADIO MAST');
      put('bunker', 20, -80, false);
      put('barracks', -90, -60, false);
      for (let i = 0; i < 2; i++) put('truck', 40 + i * 10, 90, false);
      const lvl = DIFFICULTIES.indexOf(this.diff(this.M.difficulty));
      const kinds = ['ZSU', 'SA13', ...(lvl >= 1 ? ['ZSU'] : []), ...(lvl >= 2 ? ['SA15'] : [])];
      kinds.forEach((k, i) => this.defense(k, (i / kinds.length) * Math.PI * 2 + 0.4, DEFENSES[k].kind === 'AAA' ? 420 : 750));
    } else {
      put('bunker', 0, 0, true, 'COMMAND BUNKER');
      put('hq', 90, -30, true, 'HEADQUARTERS');
      put('mast', -80, 60, true, 'RADIO MAST');
      put('ewr', -110, -70, true, 'RADAR');
      for (let i = 0; i < 2; i++) put('barracks', 60 + i * 20, 120, false);
      for (let i = 0; i < 3; i++) put('truck', 20 + i * 10, 70, false);
      const lvl = DIFFICULTIES.indexOf(this.diff(this.M.difficulty));
      const kinds = ['ZSU', 'ZSU', 'SA13', 'SA15', ...(lvl >= 3 ? ['SA11'] : [])];
      kinds.forEach((k, i) => this.defense(k, (i / kinds.length) * Math.PI * 2 + 0.3, DEFENSES[k].kind === 'AAA' ? 450 : DEFENSES[k].kind === 'SAM_IR' ? 700 : 1300));
    }
    this.host.sim.groundSites.push({ x: c.x, z: c.z, r: 240 });
  }

  // -------------------------------------------------------------------------
  // Mission start
  // -------------------------------------------------------------------------

  private reset(): void {
    const h = this.host;
    for (const a of [...h.sim.aircraft]) h.sim.remove(a);
    h.sim.missiles.length = 0;
    h.sim.bombs.length = 0;
    h.sim.bullets.clear();
    h.sim.cms.clear();
    h.picture.clear();
    h.sim.ground.length = 0;
    h.sim.defenses.length = 0;
    h.sim.groundSites.length = 0;
    h.sim.groundGen++;
    this.wing = null;
    this.proxy = null;
    this.allies = [];
    this.enemies = [];
    this.targets = [];
    this.escorts = [];
    this.primaries = [];
    this.defenseUnits = [];
    this.parked = [];
    this.bombed.clear();
    this.killers.clear();
    this.radio = [];
    this.deadTimer = 0;
    this.endTimer = -1;
    this.gciTimer = 30;
    this.huntTimer = 0;
    this.landClock = -1;
    this.landed = false;
    this.flags = {};
    this.phase = 'start';
    this.elapsed = 0;
    this.over = false;
  }

  private setup(): void {
    const h = this.host;
    this.reset();
    this.H = campaignHome();
    this.RF = campaignRedField();
    this.D = campaignSpan();
    h.setDark?.(!!this.M.dark);
    h.picture.gciEnabled.blue = true;
    h.picture.gciEnabled.red = false;
    const p = h.createPlayer();
    p.callsign = 'VIPER 1-1';
    const air = (f: number, m: number, side = 0) => {
      const pos = this.alt(this.pt(f, side), m);
      spawnInAir(p, pos, this.hdg(pos, this.RF), 450);
    };
    switch (this.M.id) {
      case 'contact':
        air(0.15, 6000);
        h.sim.add(p);
        this.setupContact(p);
        break;
      case 'raid':
        spawnOnRunway(p, this.H);
        h.sim.add(p);
        this.setupRaid();
        break;
      case 'radar':
      case 'command': {
        p.applyLoadout(strikeLoadout(p.spec));
        this.buildSite(this.M.id);
        const back = this.dist(this.site, this.H);
        const dir = new THREE.Vector3(this.H.x - this.site.x, 0, this.H.z - this.site.z).normalize();
        const pos = this.alt(this.site.clone().addScaledVector(dir, Math.max(22 * NM, Math.min(0.3 * this.D, back - 6 * NM))), 6000);
        spawnInAir(p, pos, this.hdg(pos, this.site), 450);
        h.sim.add(p);
        h.refreshStores(p);
        if (p.bombType) p.selectWeapon(p.bombType);
        this.setupStrike(p);
        break;
      }
      case 'escort':
        air(0.55, 5800, 1500);
        h.sim.add(p);
        this.setupEscort(p);
        break;
      case 'ghost':
        air(0.1, 7500);
        h.sim.add(p);
        this.setupGhost(p);
        break;
      case 'battle':
        air(0.22, 6500);
        h.sim.add(p);
        this.setupBattle(p);
        break;
      case 'wolf':
        air(0.25, 6500);
        h.sim.add(p);
        this.setupWolf(p);
        break;
    }
    this.brief(p);
  }

  private brief(p: Aircraft): void {
    const h = this.host;
    const M = this.M;
    const ex = this.textExtras();
    h.brief?.({
      kicker: `CAMPAIGN · MISSION ${this.idx + 1} OF ${CAMPAIGN.length} · ${M.time.toUpperCase()}${M.dark ? ' · PITCH BLACK' : ''}`,
      title: M.title,
      story: campaignText(M.story, ex),
      tasks: M.tasks.map((t) => campaignText(t, ex)),
      footer: `STARS: ★ ${campaignText(M.stars[0], ex)} · ★ ${campaignText(M.stars[1], ex)} · ★ ${campaignText(M.stars[2], ex)}. You: VIPER 1-1, ${p.spec.shortName}. Enemy pilots: ${this.diff(M.difficulty)}.`,
      onOk: () => this.go(),
    });
  }

  private textExtras(): Record<string, string | number> {
    return {};
  }

  /** the raid: a bomber this close to the field is a failure */
  private failR(): number {
    return raidRanges().fail;
  }
  private closeR(): number {
    return raidRanges().close;
  }

  // ---- 1 FIRST CONTACT ------------------------------------------------------
  private setupContact(p: Aircraft): void {
    this.wingman(p);
    const c = this.alt(this.pt(0.45), 6200);
    this.site.copy(c);
    const t = this.redType(['SU35', 'MIG31', 'TYPHOON']);
    for (let i = 0; i < 2; i++) {
      const a0 = i * Math.PI;
      const pos = new THREE.Vector3(c.x + Math.sin(a0) * 12000, c.y + i * 300, c.z - Math.cos(a0) * 12000);
      const e = this.red(t, `COBRA ${i + 1}`, pos, ((a0 / DEG + 90) % 360), this.diff('EASY'), { passive: true });
      this.orbit(e, c, 12000, a0);
      this.targets.push(e);
    }
    setMissionObjective({ name: 'CAP', short: 'CAP', x: c.x, z: c.z });
  }

  // ---- 2 WOLF AT THE DOOR ---------------------------------------------------
  private setupRaid(): void {
    const grid = this.host.sim.grid;
    const start = this.pt(0.75);
    const toHome = new THREE.Vector3(this.H.x - start.x, 0, this.H.z - start.z).normalize();
    const side = new THREE.Vector3(-toHome.z, 0, toHome.x);
    // low, but clear of the highest ground on the way in
    let ground = 0;
    const span = this.dist(start, this.H);
    for (let d = 0; d <= span; d += 600) for (const o of [-6000, 0, 6000]) ground = Math.max(ground, grid.height(start.x + toHome.x * d + side.x * o, start.z + toHome.z * d + side.z * o));
    const cruise = Math.max(450, ground + 350);
    const bt = this.redType(['SU35', 'MIG31', 'TYPHOON']);
    const hdg = this.hdg(start, this.H);
    for (let i = 0; i < 4; i++) {
      const off = (i - 1.5) * 1800;
      const pos = start.clone().addScaledVector(side, off).addScaledVector(toHome, -(i % 2) * 1500);
      pos.y = cruise;
      const e = this.red(bt, `HAMMER ${i + 1}`, pos, hdg, this.diff('MEDIUM'), { passive: true, loadout: strikeLoadout(SPECS[bt]).id, kts: 480 });
      const ai = e.ai as AIPilot;
      ai.weaponsHold = true;
      ai.setRoute([new THREE.Vector3(this.H.x + side.x * off * 0.3, cruise, this.H.z + side.z * off * 0.3)], cruise);
      this.targets.push(e);
    }
    // the WOLF escorts ride above them and fight anything that comes near
    const et = this.redType(['SU35', 'TYPHOON', 'RAFALE']);
    for (let i = 0; i < 2; i++) {
      const pos = start.clone().addScaledVector(side, (i ? 1 : -1) * 5000).addScaledVector(toHome, 3000);
      pos.y = Math.max(cruise + 2500, mapAlt(5000));
      const e = this.red(et, `WOLF ${i + 2}`, pos, hdg, this.diff('MEDIUM'), { a120: 2, a9: 2 });
      (e.ai as AIPilot).setRoute([this.pt(0.3), this.pt(0.1)], pos.y);
      this.escorts.push(e);
    }
    this.host.picture.gciEnabled.red = true;
    // VIPER 1-2 is already up and heads out to meet them
    const w = this.blue(this.host.config.aircraft, 'VIPER 1-2', this.alt(this.pt(0.1, 4000), 5500), this.hdg(this.H, this.RF));
    (w.ai as AIPilot).setRoute([this.pt(0.45), this.pt(0.25)], mapAlt(5000));
    this.wing = w;
    setMissionObjective({ name: 'RAID', short: 'RAID', x: start.x, z: start.z });
  }

  // ---- 3 BLIND THEIR EYES / 6 ANVIL -----------------------------------------
  private setupStrike(p: Aircraft): void {
    this.wingman(p);
    setMissionObjective({ name: this.M.id === 'radar' ? 'RADAR STATION' : 'COMMAND POST', short: 'TGT', x: this.site.x, z: this.site.z });
    if (this.M.id === 'command') {
      // a fighter patrol over the post
      const t = this.redType(['SU35', 'MIG31', 'TYPHOON']);
      const c = this.alt(this.site.clone(), 6500);
      for (let i = 0; i < 2; i++) {
        const a0 = i * Math.PI;
        const pos = new THREE.Vector3(c.x + Math.sin(a0) * 15000, c.y + i * 300, c.z - Math.cos(a0) * 15000);
        const e = this.red(t, `WOLF ${i + 2}`, pos, (a0 / DEG + 90) % 360, this.diff('MEDIUM'), { passive: true });
        this.orbit(e, c, 15000, a0);
        this.escorts.push(e);
      }
    }
  }

  // ---- 4 SHEPHERD -----------------------------------------------------------
  private setupEscort(p: Aircraft): void {
    this.wingman(p, false);
    const hdg = this.hdg(p.fm.pos, this.RF);
    const fwd = new THREE.Vector3(this.RF.x - p.fm.pos.x, 0, this.RF.z - p.fm.pos.z).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const st = 'F15EX' as AircraftType;
    for (let i = 0; i < 4; i++) {
      const pos = p.fm.pos.clone().addScaledVector(fwd, 1500 - (i % 2) * 900).addScaledVector(right, -2500 - Math.floor(i / 2) * 1400);
      pos.y = p.fm.pos.y - 300;
      const a = this.blue(st, `HAWG ${i + 1}`, pos, hdg, { passive: true, loadout: strikeLoadout(SPECS[st]).id, kts: 450 });
      (a.ai as AIPilot).cruiseMach = 0.9;
      (a.ai as AIPilot).setRoute([new THREE.Vector3(this.RF.x, pos.y, this.RF.z)], pos.y);
      this.targets.push(a);
    }
    // the patrol halfway
    const t = this.redType(['SU35', 'MIG31', 'TYPHOON']);
    const c = this.alt(this.pt(0.74, -4000), 6500);
    for (let i = 0; i < 2; i++) {
      const a0 = i * Math.PI;
      const pos = new THREE.Vector3(c.x + Math.sin(a0) * 12000, c.y, c.z - Math.cos(a0) * 12000);
      const e = this.red(t, `COBRA ${i + 1}`, pos, (a0 / DEG + 90) % 360, this.diff('MEDIUM'), { passive: true, a120: 1, a9: 2 });
      this.orbit(e, c, 12000, a0);
      this.escorts.push(e);
    }
    // WOLF squadron's jets parked on the apron of the target base
    const f = this.RF;
    const jt = this.redType(['SU35', 'MIG31']);
    for (let i = 0; i < 4; i++) {
      const q = fromRunwayLocal(f, -380 + i * 110, 330);
      const u = this.unit('jet', q.x, q.z, f.heading * DEG - Math.PI / 2, false, `PARKED ${SPECS[jt].shortName} ${i + 1}`, f.elev);
      u.jetType = jt;
      this.parked.push(u);
    }
    for (let i = 0; i < 2; i++) {
      const q = fromRunwayLocal(f, -420 + i * 380, 575);
      this.parked.push(this.unit('ammo', q.x, q.z, f.heading * DEG + Math.PI / 2, false, 'AMMUNITION BUNKER', f.elev));
    }
    this.flags.reached = 0;
    setMissionObjective({ name: this.RF.name, short: 'TGT', x: this.RF.x, z: this.RF.z });
  }

  // ---- 5 NIGHT HUNTER -------------------------------------------------------
  private setupGhost(p: Aircraft): void {
    this.wingman(p, false);
    const start = this.pt(0.95, 6000);
    start.y = Math.max(mapAlt(12500), this.host.sim.grid.height(start.x, start.z) + 3000);
    const gt = this.redType(['MIG31', 'SU35']);
    const g = this.red(gt, 'GHOST', start, this.hdg(start, this.H), this.diff('MEDIUM'), { passive: true, a120: 0, a9: 0, kts: 900 });
    const ai = g.ai as AIPilot;
    ai.weaponsHold = true;
    ai.cruiseMach = 1.6;
    ai.setRoute([new THREE.Vector3(this.H.x, start.y, this.H.z)], start.y);
    this.targets.push(g);
    const et = this.redType(['SU35', 'TYPHOON', 'RAFALE']);
    for (let i = 0; i < 2; i++) {
      const pos = this.alt(this.pt(0.82, (i ? 1 : -1) * 6000), 7500);
      const e = this.red(et, `SHADE ${i + 1}`, pos, this.hdg(pos, this.H), this.diff('MEDIUM'));
      (e.ai as AIPilot).setRoute([this.pt(0.35), this.pt(0.15)], pos.y);
      this.escorts.push(e);
    }
    setMissionObjective({ name: 'GHOST TRACK', short: 'GHST', x: start.x, z: start.z });
  }

  // ---- 7 FULL SKY -----------------------------------------------------------
  private setupBattle(p: Aircraft): void {
    this.wingman(p, false);
    const types = (['FA18EF', 'F16C', 'RAFALE', 'TYPHOON', 'F15EX', 'F22'] as AircraftType[]).filter((t) => COMBAT_TYPES.includes(t));
    const hdgB = this.hdg(this.H, this.RF);
    for (let i = 0; i < 4; i++) {
      const pos = this.alt(this.pt(0.19, -5000 - i * 1200), 6200 + i * 150);
      const a = this.blue(types[i % types.length], `SABRE 2-${i + 1}`, pos, hdgB);
      (a.ai as AIPilot).setRoute([this.pt(0.6, -3000)], pos.y);
    }
    (this.wing!.ai as AIPilot).setRoute([this.pt(0.6)], p.fm.pos.y);
    const ok = enemyTypesFor(this.host.config.aircraft);
    const hdgR = this.hdg(this.RF, this.H);
    for (let i = 0; i < 8; i++) {
      const pos = this.alt(this.pt(0.74, (i < 4 ? -1 : 1) * (4000 + (i % 4) * 1500)), 6500 + (i % 4) * 200);
      const e = this.red(ok[i % ok.length], `${i < 4 ? 'FANG' : 'RAVEN'} ${(i % 4) + 1}`, pos, hdgR, this.diff('MEDIUM', i % 2));
      (e.ai as AIPilot).setRoute([this.pt(0.3, (i < 4 ? -1 : 1) * 3000)], pos.y);
      this.targets.push(e);
    }
    this.host.picture.gciEnabled.red = true;
    const m = this.pt(0.5);
    setMissionObjective({ name: 'THE STRAIT', short: 'FGHT', x: m.x, z: m.z });
  }

  // ---- 8 THE WHITE WOLF -----------------------------------------------------
  private setupWolf(p: Aircraft): void {
    this.wingman(p, false);
    (this.wing!.ai as AIPilot).setRoute([this.pt(0.6)], p.fm.pos.y);
    const wt = this.redType(['SU35', 'F22', 'TYPHOON', 'RAFALE']);
    const hdg = this.hdg(this.RF, this.H);
    const pos = this.alt(this.pt(0.72), 7000);
    const wolf = this.red(wt, 'WOLF 1', pos, hdg, this.diff('HARD', 1), { a120: 4, a9: 2 });
    (wolf.ai as AIPilot).setRoute([this.pt(0.4)], pos.y);
    this.targets.push(wolf);
    const et = this.redType(['SU35', 'MIG31', 'TYPHOON']);
    for (let i = 0; i < 2; i++) {
      const q = this.alt(this.pt(0.74, (i ? 1 : -1) * 2500), 6800);
      const e = this.red(et, `WOLF ${i + 2}`, q, hdg, this.diff('MEDIUM'));
      (e.ai as AIPilot).setRoute([this.pt(0.4, (i ? 1 : -1) * 2000)], q.y);
      this.escorts.push(e);
    }
    this.host.picture.gciEnabled.red = true;
    const m = this.pt(0.5);
    setMissionObjective({ name: 'WOLF FLIGHT', short: 'WOLF', x: m.x, z: m.z });
  }

  // -------------------------------------------------------------------------
  // The first radio calls once the player presses OKAY
  // -------------------------------------------------------------------------

  private go(): void {
    const h = this.host;
    const p = h.player!;
    const T = this.targets[0];
    const b = T ? braa(p.fm.pos, T) : '';
    switch (this.M.id) {
      case 'contact':
        this.phase = 'ingress';
        h.order('FIRST CONTACT', campaignText('Fly to steerpoint 1 (CAP) with VIPER 1-2. Weapons tight until they turn on you.'), 10);
        this.say('OVERLORD', `VIPER 1-1, OVERLORD. Two bandits orbiting at the line, ${b}. Weapons tight until they turn on you.`, 2);
        this.say('VIPER 1-2', "Two's on your right wing. Let's go and say hello.", 9);
        break;
      case 'raid':
        this.phase = 'fight';
        h.order('SCRAMBLE, SCRAMBLE', campaignText('Take off from {FIELD}. Four bombers inbound low, with two fighters above them. Stop every bomber before it reaches {FIELD}.'), 12);
        h.voice('Scramble, scramble');
        this.say('OVERLORD', `Four tracks low and fast, ${b}, heading straight for {FIELD}. Two more high above them.`, 3);
        this.say('WOLF 1 (INTERCEPT)', 'Hammer, Wolf. Stay low and fast. My boys will keep their fighters busy.', 20, 'warn');
        this.say('VIPER 1-2', "I'm out ahead of you. I'll try to draw off the escorts.", 30);
        break;
      case 'radar':
      case 'command':
        this.phase = 'ingress';
        h.order(this.M.title, `${this.M.id === 'radar' ? 'Radar station' : 'Command post'}: steerpoint 1 (TGT), ${Math.round(this.dist(p.fm.pos, this.site) / NM)} NM. Bombs selected [4].`, 10);
        if (this.M.id === 'radar') {
          this.say('OVERLORD', 'VIPER, the radar station is on the nose. Expect guns and a short-range SAM. Their alert jets will launch once you are seen.', 3);
          this.say('VIPER 1-2', "I've got your back. Put the bombs on the dishes.", 12);
        } else {
          this.say('OVERLORD', 'Two WOLF fighters on patrol over the command post. Guns and two SAM batteries around it.', 3);
          this.say('WOLF 1 (INTERCEPT)', "Wolf 2, Wolf 3: they will come for the command post. Don't let them.", 16, 'warn');
        }
        break;
      case 'escort':
        this.phase = 'ingress';
        h.order('SHEPHERD', campaignText('Escort HAWG flight to {REDFIELD} (steerpoint 1). At least two of the four must get there.'), 10);
        this.say('HAWG 1', 'HAWG flight, four Strike Eagles, heavy and slow. VIPER, we are counting on you.', 3);
        this.say('OVERLORD', `A two-ship patrol halfway out, ${braa(p.fm.pos, this.escorts[0])}.`, 11);
        break;
      case 'ghost':
        this.phase = 'inbound';
        h.order('NIGHT HUNTER', 'GHOST is inbound high and fast. Press [9] for night-vision goggles.', 10);
        this.say('OVERLORD', `GHOST is up: one track, very high and very fast, ${b}. Two more lower down.`, 3);
        this.say('VIPER 1-2', "Goggles on. It's black as ink out here.", 12);
        break;
      case 'battle':
        this.phase = 'fight';
        h.order('FULL SKY', 'Eight RED fighters crossing the strait. Lead your five wingmen into them.', 10);
        h.voice('All flights, engage');
        this.say('OVERLORD', `All flights, eight bandits, ${b}. VIPER leads. Cleared hot.`, 2);
        this.say('SABRE 2-1', "SABRE's with you. Lead the way, VIPER.", 9);
        break;
      case 'wolf':
        this.phase = 'fight';
        h.order('THE WHITE WOLF', 'WOLF 1 and his two wingmen are waiting over the strait. Shoot down WOLF 1.', 10);
        this.say('WOLF 1', 'Viper. I have waited a long time for this. Come.', 3, 'warn', 'I have waited for this');
        this.say('VIPER 1-2', "Lead, I'll take his wingmen if I can. He's yours.", 11);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  private onDown(v: Aircraft, k: Aircraft | null): void {
    const p = this.host.player;
    if (!p || this.over) return;
    if (v === this.wing) this.say('OVERLORD', 'VIPER 1-2 is down. Good chute. You are on your own, VIPER 1-1.', 0.5, 'bad');
    switch (this.M.id) {
      case 'raid':
        if (this.targets.includes(v)) {
          const left = this.alive(this.targets).length;
          this.host.message(`${v.callsign} DOWN — ${left ? `${left} BOMBER${left > 1 ? 'S' : ''} LEFT` : 'ALL FOUR BOMBERS DOWN'}`, 'good', 4);
        }
        break;
      case 'escort':
        if (this.targets.includes(v)) {
          const left = this.alive(this.targets).length;
          this.say(v.callsign === 'HAWG 1' ? 'HAWG 2' : 'HAWG 1', `${v.callsign} is hit! ${left} left.`, 0.3, 'bad');
        }
        break;
      case 'wolf':
        if (this.escorts.includes(v)) {
          const left = this.alive(this.escorts).length;
          this.say('WOLF 1', left ? 'You will pay for that.' : 'So. Just you and me now, Viper.', 1.5, 'warn');
        }
        if (v === this.targets[0]) {
          this.say('OVERLORD', k === p ? 'Splash WOLF 1! VIPER 1-1, that was WOLF 1! He is down!' : 'WOLF 1 is down! WOLF 1 is down!', 0.5, 'good', 'Splash the wolf');
        }
        break;
    }
    void k;
  }

  private onGround(u: GroundUnit, by: Aircraft | null): void {
    const h = this.host;
    const p = h.player;
    if (!p) return;
    if (u.primary) {
      const left = this.primaries.filter((x) => x.alive).length;
      h.message(`${u.label} DESTROYED — ${left ? `${left} TARGET${left > 1 ? 'S' : ''} LEFT` : 'ALL TARGETS DESTROYED'}`, 'good', 4);
      if (by === p) h.voice(left ? 'Target destroyed' : 'Shack');
    } else if (u.defense) h.message(`${u.label} DESTROYED`, 'good', 3);
    if (p.groundTarget === u) p.groundTarget = null;
    this.alarm();
  }

  /** the strike target knows we are here */
  private alarm(): void {
    if (this.flags.alarm || (this.M.id !== 'radar' && this.M.id !== 'command')) return;
    this.flags.alarm = true;
    const h = this.host;
    this.release();
    if (this.M.id === 'radar') {
      const fields = airfieldsOf('red').filter((f) => !f.carrier);
      const f = fields.reduce((a, b) => (this.dist(a, this.site) < this.dist(b, this.site) ? a : b));
      this.escorts.push(...this.scramble(f, 2, 'WOLF', this.diff('MEDIUM'), this.redType(['SU35', 'MIG31', 'TYPHOON'])));
      this.say('OVERLORD', `You've been seen. Two fighters scrambling from ${f.name}.`, 0, 'gci', 'Enemy fighters scrambling');
      this.say('VIPER 1-2', "I'll meet them. Keep on the target.", 4);
    } else {
      this.wake(this.escorts);
      this.say('OVERLORD', 'The patrol is turning on you. Bandits hot.', 0, 'gci', 'Bandits hot');
    }
    void h;
  }

  // -------------------------------------------------------------------------
  // Running the mission
  // -------------------------------------------------------------------------

  update(dt: number): void {
    this.elapsed += dt;
    const h = this.host;
    const p = h.player;
    if (!p || this.over) return;

    // the radio
    while (this.radio.length && this.radio[0].at <= this.elapsed) {
      const l = this.radio.shift()!;
      h.message(`${l.who}: ${l.text}`, l.kind, Math.min(12, 4 + l.text.length / 18));
      if (l.voice) h.voice(l.voice);
    }

    for (const e of [...h.sim.aircraft]) {
      if (e !== p && !e.alive && e.fm.crashed && h.sim.time - e.destroyedAt > 25) h.sim.remove(e);
    }
    // once the mission is won it stays won, even if a last missile finds you
    if (!p.alive && this.endTimer <= 0) {
      this.deadTimer += dt;
      if (this.deadTimer > 3.5) this.finish(false, `You were lost: ${p.damage.destroyCause || p.fm.crashCause || 'shot down'}.`);
      return;
    }
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish(true, this.endText);
      return;
    }

    // hostiles that are awake keep hunting the player when they have nothing better to do
    this.huntTimer -= dt;
    if (this.huntTimer <= 0) {
      this.huntTimer = 5;
      for (const e of this.enemies) {
        const ai = e.ai as AIPilot | null;
        if (!ai || !e.alive || ai.passive || e.fm.onGround || ai.target) continue;
        if (this.M.id === 'raid' && this.targets.includes(e)) continue;
        ai.setRoute([p.fm.pos.clone()], Math.max(e.fm.pos.y, mapAlt(4500)));
      }
    }
    this.gci(dt);

    switch (this.M.id) {
      case 'contact':
        this.runContact();
        break;
      case 'raid':
        this.runRaid(dt);
        break;
      case 'radar':
      case 'command':
        this.runStrike();
        break;
      case 'escort':
        this.runEscort();
        break;
      case 'ghost':
        this.runGhost(dt);
        break;
      case 'battle':
        if (this.alive(this.targets).length === 0) this.win('All eight RED fighters down. The sky over the strait is ours.', 'OVERLORD', 'All eight down. The sky is ours. Outstanding, VIPER.');
        break;
      case 'wolf':
        this.runWolf();
        break;
    }
    if (this.phase === 'rtb') this.runRtb(dt);
  }

  private gci(dt: number): void {
    const p = this.host.player!;
    this.gciTimer -= dt;
    if (this.gciTimer > 0) return;
    this.gciTimer = 40;
    const awake = this.enemies.filter((e) => e.alive && !e.fm.onGround && !(e.ai as AIPilot | null)?.passive);
    if (!awake.length || this.phase === 'rtb') return;
    awake.sort((a, b) => a.distanceTo(p) - b.distanceTo(p));
    this.host.message(`OVERLORD: ${awake.length} BANDIT${awake.length > 1 ? 'S' : ''}, NEAREST ${braa(p.fm.pos, awake[0])}.`, 'gci', 8);
  }

  private runContact(): void {
    const p = this.host.player!;
    if (this.phase === 'ingress') {
      const near = Math.min(...this.alive(this.targets).map((e) => this.dist(e.fm.pos, p.fm.pos)), Infinity);
      const shot = this.host.sim.missiles.some((m) => m.shooter === p);
      if (near < Math.max(12 * NM, 0.18 * this.D) || shot || this.alive(this.targets).length < 2) {
        this.phase = 'fight';
        this.wake(this.targets);
        this.release();
        this.host.order('BANDITS HOT', 'They have turned on you. Weapons free: shoot down both.', 8);
        this.say('OVERLORD', 'VIPER, bandits turning hot! Cleared hot, weapons free.', 0, 'gci', 'Bandits turning hot');
        this.say('VIPER 1-2', 'Two, engaged.', 3);
      }
    }
    if (this.phase === 'fight' && this.alive(this.targets).length === 0) {
      this.say('OVERLORD', 'Splash both. Good work, VIPER. Return to base.', 0.5, 'good', 'Splash both');
      this.say('OVERLORD', 'VIPER, we caught their radio as they went down: "Wolf, Cobra flight is gone. They are not turning back." Someone called WOLF was listening.', 9);
      this.startRtb();
    }
  }

  private runRaid(dt: number): void {
    const p = this.host.player!;
    const left = this.alive(this.targets);
    let near = Infinity;
    for (const e of left) near = Math.min(near, this.dist(e.fm.pos, this.H));
    if (near < this.closeR()) this.flags.close = true;
    if (left.length && near < this.failR()) {
      const lead = left.find((e) => this.dist(e.fm.pos, this.H) === near)!;
      this.finish(false, campaignText(`${lead.callsign} got through to {FIELD}.`));
      return;
    }
    if (this.phase === 'fight' && left.length === 0) {
      this.phase = 'mop';
      this.flags.mopT = 100;
      this.say('WOLF 1 (INTERCEPT)', 'Hammer flight is gone... Who is flying that jet? Viper. I will remember the name.', 1, 'warn', 'I will remember');
      if (this.alive(this.escorts).length) this.host.order('BOMBERS DOWN', 'All four bombers are down. The WOLF escorts are still out there: get them for a star before they run for home.', 10);
    }
    if (this.phase === 'mop') {
      this.flags.mopT = (this.flags.mopT as number) - dt;
      if (this.alive(this.escorts).length === 0 || (this.flags.mopT as number) <= 0) {
        if (this.alive(this.escorts).length) {
          for (const e of this.alive(this.escorts)) {
            const ai = e.ai as AIPilot;
            ai.passive = true;
            ai.setRoute([new THREE.Vector3(this.RF.x, e.fm.pos.y, this.RF.z)], e.fm.pos.y);
          }
          this.say('OVERLORD', 'The escorts are bugging out for home.', 0);
        }
        this.win(campaignText('All four HAMMER bombers shot down short of {FIELD}.'), 'OVERLORD', 'Raid defeated. {FIELD} is safe. Nice flying, VIPER.');
      }
    }
    void p;
  }

  private runStrike(): void {
    const p = this.host.player!;
    if (this.phase === 'ingress') {
      const d = this.dist(p.fm.pos, this.site);
      if (d < Math.max(14 * NM, (this.M.id === 'command' ? 0.22 : 0.2) * this.D) || this.firedOn(this.escorts)) this.alarm();
      if (this.primaries.every((u) => !u.alive)) {
        this.say('OVERLORD', this.M.id === 'radar' ? 'Good hits! The radar station is off the air. Bring it home, VIPER.' : 'Shack! The command post is gone. Get out of there and come home.', 0.5, 'good', 'Shack');
        if (this.M.id === 'radar') this.say('WOLF 1 (INTERCEPT)', 'Our eyes are gone... Viper again. Always Viper.', 8, 'warn');
        this.startRtb();
      }
    }
  }

  private runEscort(): void {
    const h = this.host;
    const p = h.player!;
    const hawgs = this.targets;
    const left = this.alive(hawgs);
    // the Strike Eagles that have bombed, or are still flying and could
    if (new Set([...this.bombed, ...left]).size < 2) {
      this.finish(false, 'Too many Strike Eagles were shot down to hit the target.');
      return;
    }
    // the patrol wakes when anyone gets close
    if (!this.flags.cap) {
      const cap = this.alive(this.escorts);
      const close = cap.some((e) => [p, ...left].some((b) => this.dist(b.fm.pos, e.fm.pos) < Math.max(14 * NM, 0.15 * this.D))) || this.firedOn(this.escorts);
      if (close) {
        this.flags.cap = true;
        this.wake(cap);
        this.say('OVERLORD', 'The patrol is turning in! Two bandits, hot.', 0, 'gci', 'Bandits hot');
      }
    }
    // the second wave launches as the bombers close on the base
    const lead = left[0];
    if (!this.flags.wave2 && lead && this.dist(lead.fm.pos, this.RF) < Math.max(14 * NM, 0.2 * this.D)) {
      this.flags.wave2 = true;
      const t = this.redType(['SU35', 'MIG31', 'TYPHOON']);
      const out = new THREE.Vector3(this.H.x - this.RF.x, 0, this.H.z - this.RF.z).normalize();
      for (let i = 0; i < 3; i++) {
        const pos = new THREE.Vector3(this.RF.x, 0, this.RF.z).addScaledVector(out, 4 * NM).addScaledVector(new THREE.Vector3(-out.z, 0, out.x), (i - 1) * 2500);
        this.alt(pos, 3500);
        const e = this.red(t, `WOLF ${i + 2}`, pos, this.hdg(pos, lead.fm.pos), this.diff('MEDIUM'), { a120: 1, a9: 2 });
        (e.ai as AIPilot).setRoute([lead.fm.pos.clone()], pos.y);
        this.escorts.push(e);
      }
      h.picture.gciEnabled.red = true;
      this.say('OVERLORD', campaignText('Three more coming up off {REDFIELD}, going for the bombers!'), 0, 'gci', 'Bandits launching');
      this.say('WOLF 1 (INTERCEPT)', 'Wolf 2, Wolf 3, Wolf 4: the bombers. Kill the bombers.', 5, 'warn');
    }
    // bombs on target
    for (const a of left) {
      if (this.bombed.has(a)) continue;
      if (this.dist(a.fm.pos, this.RF) < 3 * NM) {
        this.bombed.add(a);
        this.flags.reached = (this.flags.reached as number) + 1;
        (a.ai as AIPilot).setRoute([new THREE.Vector3(this.H.x, a.fm.pos.y, this.H.z)], a.fm.pos.y);
        if (!this.flags.bombed) {
          this.flags.bombed = true;
          this.flags.bombT = this.elapsed;
          this.say(a.callsign, 'Bombs away, bombs away!', 0, 'good', 'Bombs away');
        }
      }
    }
    // the bombs land a few seconds later
    if (this.flags.bombed && !this.flags.hit && this.elapsed - (this.flags.bombT as number) > 6) {
      this.flags.hit = true;
      for (const u of this.parked) u.damage(99999, h.sim, null, 'GBU-31');
      this.say('HAWG 1', campaignText('Good hits on {REDFIELD}! The runway and the jets on it are burning. HAWG flight heading home.'), 1, 'good');
      this.say('WOLF 1 (INTERCEPT)', 'Our base... Viper, you will answer for this.', 9, 'warn');
    }
    // done: every surviving bomber has dropped, and the sky is clear or a minute has passed
    if (this.flags.hit && left.every((a) => this.bombed.has(a))) {
      if (this.flags.doneT === undefined) this.flags.doneT = this.elapsed;
      const enemies = this.enemies.filter((e) => e.alive && !e.fm.onGround);
      if (enemies.length === 0 || this.elapsed - (this.flags.doneT as number) > 60) {
        this.win(campaignText(`${this.flags.reached} of 4 Strike Eagles bombed {REDFIELD}.`), 'HAWG 1', 'VIPER, HAWG. Thanks for the ride. Drinks are on us tonight.');
      }
    }
  }

  private runGhost(dt: number): void {
    const p = this.host.player!;
    const g = this.targets[0];
    // a long afterburner dash would drain GHOST's tanks and drop it in the sea on its own
    if (g.alive) g.fm.fuelInternal = Math.max(g.fm.fuelInternal, g.spec.internalFuel * 0.5);
    if (this.phase === 'inbound' || this.phase === 'outbound') {
      if (g.alive) setMissionObjective({ name: 'GHOST', short: 'GHST', x: g.fm.pos.x, z: g.fm.pos.z });
      if (!g.alive) {
        this.flags.beforeHome = this.phase === 'inbound';
        this.phase = 'mop';
        this.flags.mopT = 90;
        this.say('OVERLORD', 'Splash GHOST! The pictures are going into the sea.', 0.5, 'good', 'Splash the ghost');
        if (this.alive(this.escorts).length) this.host.order('GHOST DOWN', 'Shoot down the escorts for a star, before they turn for home.', 9);
      } else if (this.phase === 'inbound' && this.dist(g.fm.pos, this.H) < 6 * NM) {
        this.phase = 'outbound';
        (g.ai as AIPilot).setRoute([new THREE.Vector3(this.RF.x, g.fm.pos.y, this.RF.z)], g.fm.pos.y);
        this.say('OVERLORD', campaignText('GHOST is over {FIELD} and turning for home. Catch it!'), 0, 'warn', 'Ghost turning for home');
      } else if (this.phase === 'outbound' && this.dist(g.fm.pos, this.RF) < Math.max(8 * NM, 0.15 * this.D)) {
        this.finish(false, 'GHOST got home with the pictures.');
        return;
      }
    }
    if (this.phase === 'mop') {
      this.flags.mopT = (this.flags.mopT as number) - dt;
      if (this.alive(this.escorts).length === 0 || (this.flags.mopT as number) <= 0) this.win('GHOST shot down in the dark.', 'OVERLORD', 'Good hunting, VIPER. Come on home.');
    }
    void p;
  }

  private runWolf(): void {
    const wolf = this.targets[0];
    if (!this.flags.taunt && wolf.alive && wolf.damage.integrity < 0.65) {
      this.flags.taunt = true;
      this.say('WOLF 1', 'Not yet, Viper. Not yet!', 0.5, 'warn');
    }
    if (!wolf.alive && this.phase === 'fight') {
      this.phase = 'done';
      for (const e of this.alive(this.escorts)) {
        const ai = e.ai as AIPilot;
        ai.passive = true;
        ai.setRoute([new THREE.Vector3(this.RF.x, e.fm.pos.y, this.RF.z)], e.fm.pos.y);
      }
      if (this.alive(this.escorts).length) this.say('OVERLORD', "WOLF's wingmen are running for home.", 4);
      this.win('WOLF 1 shot down over the strait.', 'VIPER 1-2', "It's over, lead. It's really over.", 7);
    }
  }

  /** the wingman leaves the formation and orbits high over our field */
  private holdOverhead(): void {
    const w = this.wing;
    const ai = w?.ai as AIPilot | null;
    if (!w || !w.alive || !ai) return;
    ai.leader = null;
    ai.formationHold = false;
    const alt = Math.max(mapAlt(3000), this.host.sim.grid.height(this.H.x, this.H.z) + 1500);
    const r = 5000;
    ai.setRoute([0, 1, 2, 3, 4, 5].map((k) => new THREE.Vector3(this.H.x + Math.sin((k / 6) * Math.PI * 2) * r, alt, this.H.z - Math.cos((k / 6) * Math.PI * 2) * r)), alt);
    ai.state = 'PATROL';
    this.say('VIPER 1-2', "I'll hold high over the field. You land first, lead.", 1);
  }

  // ---- coming home ------------------------------------------------------------
  private startRtb(): void {
    this.phase = 'rtb';
    const h = this.host;
    const f = this.H;
    setMissionObjective({ name: f.name, short: 'HOME', x: f.x, z: f.z });
    h.order('RETURN TO BASE', campaignText('Fly home and land at {FIELD} or any friendly field for a star. [U] auto-fly can fly the approach and land for you.'), 12);
  }

  private runRtb(dt: number): void {
    const p = this.host.player!;
    if (p.fm.onGround && p.onRunwayStopped) {
      this.landed = true;
      this.win(`Mission complete and VIPER 1-1 down safe at ${p.fm.surfaceField?.name ?? 'base'}.`, 'TOWER', 'Welcome home, VIPER.');
      return;
    }
    const near = airfieldsOf('blue').some((f) => this.dist(p.fm.pos, f) < 10 * NM);
    if (near && this.landClock < 0) {
      this.landClock = LAND_CLOCK;
      this.host.order('WELCOME BACK', 'Land for a star, or fly on: the mission ends in 2:30. Lowering the gear holds the clock.', 10);
      // VIPER 1-2 stops following you down: a formation slot next to a jet on
      // the runway is in the ground. He circles high over the field instead.
      this.holdOverhead();
    }
    if (this.landClock > 0) {
      if (!p.controls.gearDown) this.landClock -= dt;
      if (this.landClock <= 0) this.win('Mission complete and VIPER 1-1 home.', 'OVERLORD', 'Good work today, VIPER.');
    }
  }

  // -------------------------------------------------------------------------
  // The end
  // -------------------------------------------------------------------------

  /** mission won: a last radio call, then the results a few seconds later */
  private win(text: string, who: string, call: string, delay = 4): void {
    if (this.endTimer > 0 || this.over) return;
    this.say(who, call, 0.2, 'good');
    this.endText = text;
    this.endTimer = delay;
  }

  private bonus(): [boolean, boolean] {
    const p = this.host.player!;
    const wingHome = !!this.wing && this.wing.alive;
    switch (this.M.id) {
      case 'contact':
        return [wingHome, this.landed];
      case 'raid':
        return [!this.flags.close, this.escorts.every((e) => !e.alive)];
      case 'radar':
        return [p.damage.integrity >= 0.9, this.landed];
      case 'escort':
        return [(this.flags.reached as number) >= 4, p.kills >= 3];
      case 'ghost':
        return [!!this.flags.beforeHome, this.escorts.every((e) => !e.alive)];
      case 'command':
        return [this.defenseUnits.every((u) => !u.alive), this.landed];
      case 'battle':
        return [p.kills >= 3, this.allies.filter((a) => a.alive).length >= 3];
      case 'wolf':
        return [this.killedByPlayer(this.targets[0]), wingHome];
    }
  }

  private finish(good: boolean, subtitle: string): void {
    const h = this.host;
    if (this.over) return;
    this.over = true;
    const ex = this.textExtras();
    const [b1, b2] = good ? this.bonus() : [false, false];
    const bits = good ? 1 | (b1 ? 2 : 0) | (b2 ? 4 : 0) : 0;
    const total = good ? saveCampaignStars(this.idx, bits) : loadCampaign()[this.idx];
    const got = [good, b1, b2];
    const stars: [string, string][] = this.M.stars.map((s, i) => [campaignText(s, ex).toUpperCase(), got[i] ? '★ EARNED' : (total >> i) & 1 ? '★ (EARNED BEFORE)' : '☆ —'] as [string, string]);
    const last = this.idx === CAMPAIGN.length - 1;
    const all = loadCampaign().reduce((n, b) => n + starCount(b), 0);
    const buttons: ResultButton[] = good
      ? last
        ? [
            { label: 'FLY IT AGAIN', action: 'retry' },
            { label: 'MAIN MENU', action: 'menu' },
          ]
        : [
            { label: 'NEXT MISSION ▸', action: 'next' },
            { label: 'FLY IT AGAIN', action: 'retry' },
            { label: 'MAIN MENU', action: 'menu' },
          ]
      : [
          { label: 'TRY AGAIN', action: 'retry' },
          { label: 'MAIN MENU', action: 'menu' },
        ];
    h.showResults({
      title: good ? (last ? 'CAMPAIGN COMPLETE' : 'MISSION COMPLETE') : 'MISSION FAILED',
      subtitle: good && last ? `${subtitle} ${CAMPAIGN_EPILOGUE}` : `${this.M.title}: ${subtitle}`,
      good,
      stats: [
        ...stars,
        ['MISSION', `${this.idx + 1} OF ${CAMPAIGN.length} · ${this.M.title}`],
        ['CAMPAIGN STARS', `${all} / ${CAMPAIGN.length * 3}`],
        ['MISSION TIME', mmss(this.elapsed)],
        ...statsFor(h.player, []).filter(([k]) => k === 'AIRCRAFT' || k === 'KILLS' || k === 'MISSILES FIRED'),
      ],
      buttons,
    });
  }

  status(): ModeStatus {
    const p = this.host.player;
    let objective = '';
    const nm = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.round(this.dist(a, b) / NM);
    if (p) {
      const t = this.alive(this.targets).length;
      switch (this.phase) {
        case 'start':
          objective = 'BRIEFING';
          break;
        case 'rtb':
          objective = this.landClock > 0 ? `LAND FOR A STAR · MISSION ENDS IN ${mmss(this.landClock)}${p.controls.gearDown ? ' (HELD)' : ''}` : `RETURN TO BASE: ${this.H.icao} ${nm(p.fm.pos, this.H)} NM`;
          break;
        case 'mop':
          objective = `OPTIONAL: SHOOT DOWN THE ESCORTS (${this.alive(this.escorts).length} LEFT) · ENDS IN ${Math.max(0, Math.ceil(this.flags.mopT as number))} S`;
          break;
        default:
          switch (this.M.id) {
            case 'contact':
              objective = this.phase === 'ingress' ? `FLY TO THE CAP POINT: ${nm(p.fm.pos, this.site)} NM · WEAPONS TIGHT` : `SHOOT DOWN THE BANDITS: ${t} LEFT`;
              break;
            case 'raid': {
              const near = Math.min(...this.alive(this.targets).map((e) => this.dist(e.fm.pos, this.H) / NM), 999);
              objective = `STOP THE BOMBERS: ${t} LEFT · NEAREST ${Math.round(near)} NM FROM ${this.H.icao}`;
              break;
            }
            case 'radar':
            case 'command': {
              const left = this.primaries.filter((u) => u.alive).length;
              const bombs = p.bombType ? p.countOf(p.bombType) : 0;
              objective = `DESTROY THE ${this.M.id === 'radar' ? 'RADAR STATION' : 'COMMAND POST'}: ${left} TARGETS · ${nm(p.fm.pos, this.site)} NM · ${bombs} BOMBS`;
              break;
            }
            case 'escort':
              objective = `PROTECT HAWG FLIGHT: ${t} OF 4 · ${this.flags.reached} BOMBED · ${t ? nm(this.alive(this.targets)[0].fm.pos, this.RF) : 0} NM TO TARGET`;
              break;
            case 'ghost': {
              const g = this.targets[0];
              objective = g.alive ? `SHOOT DOWN GHOST: ${nm(p.fm.pos, g.fm.pos)} NM · ${Math.round(g.fm.pos.y / 0.3048 / 1000)},000 FT${this.phase === 'outbound' ? ' · RUNNING FOR HOME' : ''}` : 'GHOST DOWN';
              break;
            }
            case 'battle':
              objective = `WIN THE SKY: ${t} OF 8 BANDITS LEFT · ${this.alive(this.allies).length} WINGMEN`;
              break;
            case 'wolf': {
              const w = this.targets[0];
              objective = w.alive ? `SHOOT DOWN WOLF 1: ${nm(p.fm.pos, w.fm.pos)} NM · ${this.alive(this.escorts).length} WINGMEN WITH HIM` : 'WOLF 1 IS DOWN';
              break;
            }
          }
      }
    }
    return {
      title: `CAMPAIGN ${this.idx + 1} · ${this.M.title}`,
      blue: this.alive([...(p ? [p] : []), ...this.allies.filter((a) => a.team === 'blue')]).length,
      red: this.enemies.filter((e) => e.alive).length,
      timer: this.elapsed,
      objective,
    };
  }

  handle(action: ResultButton['action']): void {
    if (action === 'retry') this.setup();
  }

  roster(): Aircraft[] {
    return [];
  }

  dispose(): void {
    for (const f of this.unsub) f();
    this.unsub = [];
    setMissionObjective(null);
    this.host.setDark?.(false);
  }
}
