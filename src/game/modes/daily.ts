// DAILY MISSION: today's mission from src/game/daily.ts. The player scrambles
// from home base; the bandits circle where the story put them, radar silent,
// until the player comes within the trigger range (or shoots at them), then
// they turn hot. Shoot them all down, then bring the jet home.

import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton, statsFor, braa } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import { AIPilot } from '../../ai/pilot';
import { duelSkill } from '../../ai/skill';
import { ROLES, mapAlt, airfieldsOf, AirfieldDef, activeMap, MAPS } from '../../world/islands';
import { spawnOnRunway, spawnInAir, aiStores } from '../spawn';
import { NM } from '../../core/constants';
import { SPECS } from '../../aircraft/specs';
import { setMissionObjective } from '../../avionics/nav';
import { todaysMission, markDailyDone, DailyMission } from '../daily';

type Phase = 'ingress' | 'fight' | 'rtb' | 'done';

const ORBIT_R = 14000;
const RTB_NM = 10;

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][m - 1] ?? '';
  return `${d} ${mon} ${y}`;
}

function mmss(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

export class DailyMode extends GameMode {
  readonly m: DailyMission = todaysMission();
  private enemies: Aircraft[] = [];
  private phase: Phase = 'ingress';
  private readonly target = new THREE.Vector3();
  private home!: AirfieldDef;
  private deadTimer = 0;
  private endTimer = -1;
  private gciTimer = 0;
  private fightStart = 0;

  start(): void {
    this.setup();
  }

  /** Where the bandits wait. */
  private targetPoint(): { x: number; z: number } {
    const m = this.m;
    const arena = ROLES.arena;
    const red = ROLES.redHome;
    if (m.target === 'arena') return { x: arena.cx, z: arena.cz };
    if (m.target === 'redBase') {
      const fields = airfieldsOf('red').filter((f) => f.island === red.id);
      const f = (fields.length ? fields : airfieldsOf('red'))[0];
      return { x: f.x, z: f.z };
    }
    // the strait: open water on the way from home toward the enemy's home, about `distNm` out
    const grid = this.host.sim.grid;
    const hf = this.homeField();
    const dx = red.cx - hf.x, dz = red.cz - hf.z;
    const len = Math.max(1, Math.hypot(dx, dz));
    const want = Math.min((m.distNm ?? 55) * NM, len * 0.8);
    let best = { x: hf.x + (dx / len) * want, z: hf.z + (dz / len) * want };
    let bestD = Infinity;
    for (let d = want - 15 * NM; d <= want + 15 * NM; d += NM) {
      const x = hf.x + (dx / len) * d, z = hf.z + (dz / len) * d;
      if (grid.height(x, z) < 1 && Math.abs(d - want) < bestD) {
        bestD = Math.abs(d - want);
        best = { x, z };
      }
    }
    return best;
  }

  /** Home: the BLUE field on the home island nearest the enemy. */
  private homeField(): AirfieldDef {
    const blue = airfieldsOf('blue');
    const own = blue.filter((f) => f.island === ROLES.blueHome.id);
    const pool = own.length ? own : blue;
    const r = ROLES.redHome;
    return pool.reduce((a, b) => (Math.hypot(a.x - r.cx, a.z - r.cz) < Math.hypot(b.x - r.cx, b.z - r.cz) ? a : b));
  }

  private setup(): void {
    const h = this.host;
    const m = this.m;
    const t = this.targetPoint();
    this.target.set(t.x, mapAlt(6000), t.z);
    this.home = this.homeField();
    // the waiting area is steerpoint 1
    setMissionObjective({ name: m.targetName, short: 'TGT', x: t.x, z: t.z });

    const p = h.createPlayer();
    p.callsign = m.callsign;
    spawnOnRunway(p, this.home);
    h.sim.add(p);

    // the bandits: circling the waiting area, spread around the orbit, radar silent
    this.enemies = [];
    const e0 = m.enemy;
    const n = Math.max(1, e0.count);
    const inbound = m.behavior === 'inbound';
    if (inbound) {
      // inbound: a loose line abreast crossing the border, low and fast, heading for home
      const toHome = new THREE.Vector3(this.home.x - t.x, 0, this.home.z - t.z).normalize();
      const side = new THREE.Vector3(-toHome.z, 0, toHome.x);
      const hdg = (Math.atan2(toHome.x, -toHome.z) * 180) / Math.PI;
      // low, but clear of the highest ground on the way in (a drone flying into a hill is no win)
      const grid = h.sim.grid;
      let ground = 0;
      const span = Math.hypot(this.home.x - t.x, this.home.z - t.z);
      for (let d = 0; d <= span; d += 500)
        for (const o of [-12000, -6000, 0, 6000, 12000]) ground = Math.max(ground, grid.height(t.x + toHome.x * d + side.x * o, t.z + toHome.z * d + side.z * o));
      const cruise = Math.max(m.altM ?? 500, ground + 300);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 5 * NM;
        const pos = new THREE.Vector3(t.x, cruise, t.z).addScaledVector(side, off).addScaledVector(toHome, -(i % 2) * 4 * NM);
        const e = new Aircraft(e0.type, 'red', `${e0.callsign} ${i + 1}`);
        e.setStores(aiStores(e, 0, 0));
        spawnInAir(e, pos, (hdg + 360) % 360, 420);
        const ai = new AIPilot(e, duelSkill(e0.difficulty), h.picture);
        ai.passive = true;
        ai.weaponsHold = true;
        // each heads for a point beside the home field (they fan out a little)
        ai.setRoute([new THREE.Vector3(this.home.x + side.x * off * 0.3, pos.y, this.home.z + side.z * off * 0.3)], pos.y);
        e.ai = ai;
        h.sim.add(e);
        this.enemies.push(e);
      }
    }
    for (let i = 0; i < (inbound ? 0 : n); i++) {
      const a0 = (i / n) * Math.PI * 2;
      const pos = new THREE.Vector3(t.x + Math.sin(a0) * ORBIT_R, this.target.y + (i - (n - 1) / 2) * 300, t.z - Math.cos(a0) * ORBIT_R);
      const e = new Aircraft(e0.type, 'red', `${e0.callsign} ${i + 1}`);
      e.setStores(aiStores(e, e0.aim120, e0.aim9x));
      // heading along the orbit (clockwise seen from above)
      const hdg = ((a0 * 180) / Math.PI + 90) % 360;
      spawnInAir(e, pos, hdg, 430);
      const ai = new AIPilot(e, duelSkill(e0.difficulty), h.picture);
      ai.passive = true;
      const route: THREE.Vector3[] = [];
      for (let k = 1; k <= 6; k++) {
        const a = a0 + (k / 6) * Math.PI * 2;
        route.push(new THREE.Vector3(t.x + Math.sin(a) * ORBIT_R, pos.y, t.z - Math.cos(a) * ORBIT_R));
      }
      ai.setRoute(route, pos.y);
      e.ai = ai;
      h.sim.add(e);
      this.enemies.push(e);
    }
    h.picture.gciEnabled.blue = true;
    h.picture.gciEnabled.red = false;

    this.phase = 'ingress';
    this.elapsed = 0;
    this.deadTimer = 0;
    this.endTimer = -1;
    this.gciTimer = 20;
    this.over = false;

    const jet = SPECS[e0.type].shortName;
    const real = m.realJet && m.realJet !== p.type ? ` The real pilots flew the ${SPECS[m.realJet].shortName}.` : '';
    const theater = m.map && m.map !== activeMap.id ? ` This story is set best on ${MAPS.find((x) => x.id === m.map)?.name ?? m.map}.` : '';
    h.brief?.({
      kicker: `DAILY MISSION · ${fmtDate(m.date)}`,
      title: m.title,
      story: m.story,
      tasks: m.tasks,
      footer: inbound
        ? `Based on real news (${fmtDate(m.eventDate)}): ${m.headline} Source: ${m.source}. You: ${m.callsign}, ${p.spec.shortName}, at ${this.home.name}. Targets: ${n} jet drones (flown by ${jet} airframes in the game), inbound from ${m.targetName}.${real}${theater}`
        : `Based on real news (${fmtDate(m.eventDate)}): ${m.headline} Source: ${m.source}. You: ${m.callsign}, ${p.spec.shortName}, at ${this.home.name}. Bandits: ${n} × ${jet} (${e0.difficulty}) over ${m.targetName}.${real}${theater}`,
      onOk: () => {
        if (inbound) {
          h.order(`${m.title} — SCRAMBLE`, `Take off from ${this.home.name}. ${n} jet drones are crossing ${m.targetName} (steerpoint 1), fast and radar silent, heading for you. Stop every one before it gets within ${m.failNm ?? 15} NM of home.`, 14);
          this.phase = 'fight';
          this.fightStart = 0.001;
        } else h.order(`${m.title} — SCRAMBLE`, `Take off from ${this.home.name} and head for ${m.targetName} (steerpoint 1, TGT). ${n} ${jet}s are circling there, radar silent. Inside ${m.triggerNm} NM they will turn on you.`, 12);
        h.voice('Scramble, scramble');
      },
    });
  }

  private wake(reason: string): void {
    const h = this.host;
    const p = h.player!;
    this.phase = 'fight';
    this.fightStart = this.elapsed;
    h.picture.gciEnabled.red = true;
    for (const e of this.enemies) {
      const ai = e.ai as AIPilot | null;
      if (!ai || !e.alive) continue;
      ai.passive = false;
      ai.setRoute([p.fm.pos.clone()], e.fm.pos.y);
    }
    const lead = this.enemies.find((e) => e.alive);
    h.order(`${this.m.enemy.callsign} FLIGHT — HOSTILE`, `${reason} Weapons free: shoot down all ${this.enemies.filter((e) => e.alive).length}.`, 10);
    if (lead) h.message(`OVERLORD: ${this.m.enemy.callsign} FLIGHT TURNING HOT, ${braa(p.fm.pos, lead)}.`, 'gci', 10);
    h.voice('Bandits turning hot');
  }

  update(dt: number): void {
    this.elapsed += dt;
    const h = this.host;
    const p = h.player;
    if (!p || this.over) return;

    // wrecks long after they hit the ground
    for (const e of [...h.sim.aircraft]) {
      if (e !== p && !e.alive && e.fm.crashed && h.sim.time - e.destroyedAt > 25) h.sim.remove(e);
    }

    if (!p.alive) {
      this.deadTimer += dt;
      if (this.deadTimer > 3.5) this.finish(false, `You were lost: ${p.damage.destroyCause || p.fm.crashCause || 'shot down'}.`);
      return;
    }

    const alive = this.enemies.filter((e) => e.alive);
    if (this.m.behavior === 'inbound' && this.phase === 'fight') {
      const failNm = this.m.failNm ?? 15;
      let near = Infinity;
      let lead: Aircraft | null = null;
      for (const e of alive) {
        const d = Math.hypot(e.fm.pos.x - this.home.x, e.fm.pos.z - this.home.z);
        if (d < near) {
          near = d;
          lead = e;
        }
      }
      if (lead && near < failNm * NM) {
        this.finish(false, `${lead.callsign} got through to within ${failNm} NM of ${this.home.name}.`);
        return;
      }
      this.gciTimer -= dt;
      if (this.gciTimer <= 0 && lead) {
        this.gciTimer = 40;
        h.message(`OVERLORD: ${alive.length} TRACK${alive.length > 1 ? 'S' : ''} INBOUND, LEAD ${braa(p.fm.pos, lead)}, ${Math.round(near / NM)} NM FROM HOME.`, 'gci', 9);
      }
    }
    if (this.phase === 'ingress') {
      const dT = Math.hypot(p.fm.pos.x - this.target.x, p.fm.pos.z - this.target.z);
      const dE = Math.min(...alive.map((e) => Math.hypot(p.fm.pos.x - e.fm.pos.x, p.fm.pos.z - e.fm.pos.z)), Infinity);
      const shotAt = h.sim.missiles.some((mi) => mi.shooter === p && mi.target !== null && this.enemies.includes(mi.target));
      if (Math.min(dT, dE) < this.m.triggerNm * NM) this.wake(`You are inside ${this.m.triggerNm} NM: the flight has seen you.`);
      else if (shotAt || alive.length < this.enemies.length) this.wake('You fired on the flight: it is coming for you.');
      else {
        this.gciTimer -= dt;
        if (this.gciTimer <= 0 && alive[0]) {
          this.gciTimer = 45;
          h.message(`OVERLORD: ${this.m.enemy.callsign} FLIGHT, ${braa(p.fm.pos, alive[0])}, ORBITING.`, 'gci', 8);
        }
      }
    }
    if (this.phase === 'fight' && alive.length === 0) {
      const what = this.m.behavior === 'inbound' ? 'drones' : 'bandits';
      if (this.m.rtb) {
        this.phase = 'rtb';
        h.order('SPLASH ALL — RETURN TO BASE', `All ${this.enemies.length} ${what} down. Bring the jet home: get within ${RTB_NM} NM of ${this.home.name} or any friendly field. Press [End] to steer to the nearest one.`, 12);
        h.voice('Splash, return to base');
      } else this.finish(true, `All ${this.enemies.length} ${what} shot down.`);
    }
    if (this.phase === 'rtb') {
      const near = airfieldsOf('blue').some((f) => Math.hypot(p.fm.pos.x - f.x, p.fm.pos.z - f.z) < RTB_NM * NM);
      if (near) {
        this.phase = 'done';
        this.endTimer = 3;
        h.message('WELCOME HOME. MISSION COMPLETE.', 'good', 6);
        h.voice('Mission complete');
      }
    }
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish(true, `All ${this.enemies.length} ${this.m.behavior === 'inbound' ? 'drones' : 'bandits'} shot down and ${p.callsign} home safe.`);
    }
  }

  private finish(good: boolean, subtitle: string): void {
    const h = this.host;
    this.over = true;
    if (good) markDailyDone(this.m.date);
    const kills = this.enemies.filter((e) => !e.alive).length;
    h.showResults({
      title: good ? 'MISSION COMPLETE' : 'MISSION FAILED',
      subtitle: `${this.m.title}: ${subtitle}`,
      good,
      stats: statsFor(h.player, [
        ['DAILY MISSION', fmtDate(this.m.date)],
        [this.m.behavior === 'inbound' ? 'TARGETS DOWN' : 'BANDITS DOWN', `${kills} / ${this.enemies.length}`],
        ['MISSION TIME', mmss(this.elapsed)],
        ...(this.fightStart > 0 && kills ? ([['FIGHT TIME', mmss(this.elapsed - this.fightStart)]] as [string, string][]) : []),
      ]),
      buttons: [
        { label: 'FLY IT AGAIN', action: 'retry' },
        { label: 'MAIN MENU', action: 'menu' },
      ],
    });
  }

  status(): ModeStatus {
    const p = this.host.player;
    const alive = this.enemies.filter((e) => e.alive).length;
    let objective = '';
    if (p) {
      if (this.phase === 'ingress') objective = `FLY TO ${this.m.targetName}: ${Math.round(Math.hypot(p.fm.pos.x - this.target.x, p.fm.pos.z - this.target.z) / NM)} NM`;
      else if (this.phase === 'fight' && this.m.behavior === 'inbound') {
        const near = Math.min(...this.enemies.filter((e) => e.alive).map((e) => Math.hypot(e.fm.pos.x - this.home.x, e.fm.pos.z - this.home.z) / NM), 999);
        objective = `STOP THE DRONES: ${alive} LEFT · NEAREST ${Math.round(near)} NM FROM HOME`;
      } else if (this.phase === 'fight') objective = `SHOOT DOWN THE ${this.m.enemy.callsign} FLIGHT: ${alive} LEFT`;
      else if (this.phase === 'rtb') objective = `RETURN TO BASE: ${this.home.icao} ${Math.round(Math.hypot(p.fm.pos.x - this.home.x, p.fm.pos.z - this.home.z) / NM)} NM`;
      else objective = 'MISSION COMPLETE';
    }
    return {
      title: `DAILY · ${this.m.title}`,
      blue: p && p.alive ? 1 : 0,
      red: alive,
      timer: this.elapsed,
      objective,
    };
  }

  handle(action: ResultButton['action']): void {
    if (action === 'retry') {
      const h = this.host;
      for (const a of [...h.sim.aircraft]) h.sim.remove(a);
      h.sim.missiles.length = 0;
      h.sim.bullets.clear();
      h.sim.cms.clear();
      h.picture.clear();
      this.setup();
    }
  }

  dispose(): void {
    setMissionObjective(null);
  }
}
