// Mode 2: Escalating Waves -- ten waves, each more advanced than the last.
//   Waves 1-3  : 3 basic jets
//   Waves 4-6  : 6 tactical jets
//   Waves 7-9  : 6 aggressive jets with mid-range AIM-120Ds
//   Wave 10    : 9 elite jets, multi-ship targeting, max-G fighting
// Enemy jets are always drawn from the two types the player did NOT pick.

import { randomPaint } from '../../aircraft/models/paint';
import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton, braa, statsFor } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import { AIPilot } from '../../ai/pilot';
import { waveDef, WaveDef } from '../../ai/skill';
import { AIRFIELD_BY_ID, AIRFIELDS, airfieldsOf, fromRunwayLocal, ROLES, mapAlt, mapScale } from '../../world/islands';
import { spawnOnRunway, spawnInAir, pickEnemyType, aiStores, nextRedCallsign, resetCallsigns } from '../spawn';
import { NM, FT, MAP_HALF } from '../../core/constants';
import { rand } from '../../core/rng';

type Phase = 'brief' | 'combat' | 'intermission' | 'victory' | 'failed';

export class WavesMode extends GameMode {
  wave = 1;
  phase: Phase = 'brief';
  private timer = 0;
  private enemies: Aircraft[] = [];
  private def!: WaveDef;
  private gciTimer = 20;
  private waveTime = 0;
  private totalKills = 0;
  private deadTimer = 0;

  /** the wave picked in the menu */
  private get firstWave(): number {
    return Math.max(1, Math.min(10, this.host.config.startWave));
  }

  start(): void {
    const h = this.host;
    resetCallsigns();
    this.wave = Math.max(1, Math.min(10, h.config.startWave));
    const p = h.createPlayer();
    this.placePlayer();
    h.sim.add(p);
    h.picture.gciEnabled.blue = true;
    h.picture.gciEnabled.red = true;
    this.beginWave();
  }

  private base() {
    const f = AIRFIELD_BY_ID[this.host.config.freeBase];
    return f && f.team === 'blue' ? f : airfieldsOf('blue')[1] ?? airfieldsOf('blue')[0];
  }

  private placePlayer(): void {
    const h = this.host;
    const p = h.player!;
    const f = this.base();
    if (h.config.waveStart === 'runway') spawnOnRunway(p, f);
    else {
      // airborne a few miles off the field, pointed at the threat axis
      const threat = ROLES.redHome;
      const hdg = (Math.atan2(threat.cx - f.x, -(threat.cz - f.z)) * 180) / Math.PI;
      const s = fromRunwayLocal(f, 0, 0);
      const dir = new THREE.Vector3(Math.sin((hdg * Math.PI) / 180), 0, -Math.cos((hdg * Math.PI) / 180));
      spawnInAir(p, new THREE.Vector3(s.x, mapAlt(6100), s.z).addScaledVector(dir, 20000), (hdg + 360) % 360, 430);
    }
  }

  private beginWave(): void {
    const h = this.host;
    this.def = waveDef(this.wave);
    this.phase = 'brief';
    this.timer = 6;
    this.waveTime = 0;
    h.order(`WAVE ${this.wave} / 10 — ${this.def.tier}`, `${this.def.count} BANDITS. ${this.def.briefing}`, 9);
    h.voice(`Wave ${this.wave}`);
  }

  private spawnWave(): void {
    const h = this.host;
    const p = h.player!;
    const d = this.def;
    const redBases = AIRFIELDS.filter((f) => f.team === 'red');
    const flights = Math.ceil(d.count / 3);
    this.enemies = [];
    for (let fl = 0; fl < flights; fl++) {
      const base = redBases[(fl + this.wave) % redBases.length];
      const type = pickEnemyType(p.type);
      // spawn airborne near the red base; first flight 42-62 NM from the player
      const bp = fromRunwayLocal(base, 0, 0);
      const pos = new THREE.Vector3(bp.x, rand(mapAlt(6200), mapAlt(7800)), bp.z);
      const toPlayer = new THREE.Vector3(p.fm.pos.x - pos.x, 0, p.fm.pos.z - pos.z);
      const dist = toPlayer.length();
      toPlayer.normalize();
      // flights arrive in sequence: each later flight starts further out
      // (closer on a small map, so they never start off its edge)
      const k = mapScale();
      const minD = (42 + fl * 20) * NM * k, maxD = (62 + fl * 20) * NM * k;
      if (dist < minD) pos.addScaledVector(toPlayer, -(minD - dist));
      else if (dist > maxD) pos.addScaledVector(toPlayer, dist - maxD);
      pos.x = THREE.MathUtils.clamp(pos.x, -MAP_HALF * 0.92, MAP_HALF * 0.92);
      pos.z = THREE.MathUtils.clamp(pos.z, -MAP_HALF * 0.92, MAP_HALF * 0.92);
      const hdg = (Math.atan2(toPlayer.x, -toPlayer.z) * 180) / Math.PI;
      // patrol route: sweep toward the blue side of the theater
      const blue = airfieldsOf('blue');
      const route = [
        new THREE.Vector3(p.fm.pos.x + rand(-30000, 30000), pos.y, p.fm.pos.z + rand(-30000, 30000)),
        new THREE.Vector3(blue[fl % blue.length].x, pos.y, blue[fl % blue.length].z),
        new THREE.Vector3(ROLES.arena.cx, pos.y, ROLES.arena.cz),
      ];
      let leader: AIPilot | null = null;
      const members = Math.min(3, d.count - fl * 3);
      for (let m = 0; m < members; m++) {
        const e = new Aircraft(type, 'red', nextRedCallsign(fl, m));
        e.paint = randomPaint();
        e.setStores(aiStores(e, d.aim120, d.aim9x));
        const offRight = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
        const sp = pos.clone().addScaledVector(offRight, (m % 2 === 0 ? 1 : -1) * Math.ceil(m / 2) * 900).addScaledVector(toPlayer, -m * 500);
        spawnInAir(e, sp, (hdg + 360) % 360, 450);
        const ai = new AIPilot(e, { ...d.skill, weapons: { ...d.skill.weapons } }, h.picture);
        ai.setRoute(route.map((r) => r.clone()), pos.y);
        ai.bracketSide = m % 2 === 0 ? 1 : -1;
        if (m === 0) leader = ai;
        else {
          ai.leader = leader;
          ai.state = 'FORMATION';
          ai.formationOffset.set((m % 2 === 0 ? 1 : -1) * 900, 0, 600 * Math.ceil(m / 2));
        }
        e.ai = ai;
        h.sim.add(e);
        this.enemies.push(e);
      }
    }
    // opening GCI picture
    const lead = this.enemies[0];
    h.message(`OVERLORD: NEW PICTURE, ${flights} GROUP${flights > 1 ? 'S' : ''}. LEAD GROUP ${braa(p.fm.pos, lead)}, HOSTILE.`, 'gci', 10);
    h.voice(`${flights} groups, hostile`);
  }

  update(dt: number): void {
    this.elapsed += dt;
    const h = this.host;
    const p = h.player;
    if (!p) return;

    // clean up wrecks long after they hit the ground
    for (const e of [...h.sim.aircraft]) {
      if (e !== p && !e.alive && e.fm.crashed && h.sim.time - e.destroyedAt > 25) h.sim.remove(e);
    }

    if (!p.alive && this.phase !== 'failed' && this.phase !== 'victory') {
      this.deadTimer += dt;
      if (this.deadTimer > 3.5) {
        this.phase = 'failed';
        this.over = true;
        h.showResults({
          title: 'MISSION FAILED',
          subtitle: `Shot down during wave ${this.wave} of 10.`,
          good: false,
          stats: statsFor(p, [
            ['WAVE REACHED', `${this.wave} / 10`],
            ['TOTAL KILLS', String(this.totalKills)],
          ]),
          buttons: [
            { label: `RETRY WAVE ${this.wave}`, action: 'retryWave' },
            { label: `RESTART FROM WAVE ${this.firstWave}`, action: 'retry' },
            { label: 'MAIN MENU', action: 'menu' },
          ],
        });
      }
      return;
    }

    switch (this.phase) {
      case 'brief':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = 'combat';
          this.spawnWave();
        }
        break;
      case 'combat': {
        this.waveTime += dt;
        const alive = this.enemies.filter((e) => e.alive);
        this.totalKills = p.kills;
        this.gciTimer -= dt;
        if (this.gciTimer <= 0 && alive.length > 0) {
          this.gciTimer = 45;
          // BLUE GCI only reports what its radars (or the player) can actually see
          const tracks = h.picture.tracksFor('blue').filter((t) => t.target.alive && h.sim.time - t.time < 12);
          if (tracks.length > 0) {
            let nearest = tracks[0];
            for (const t of tracks) if (t.pos.distanceTo(p.fm.pos) < nearest.pos.distanceTo(p.fm.pos)) nearest = t;
            h.message(`OVERLORD: BANDIT ${braa(p.fm.pos, nearest.target)}.`, 'gci', 8);
          } else {
            // the direction of the freshest old track (or the enemy's home island), not always "east"
            const old = h.picture.tracksFor('blue').filter((t) => t.target.alive).sort((a, b) => b.time - a.time)[0];
            const tx = old ? old.pos.x : ROLES.redHome.cx, tz = old ? old.pos.z : ROLES.redHome.cz;
            const brg = ((Math.atan2(tx - p.fm.pos.x, -(tz - p.fm.pos.z)) * 180) / Math.PI + 360) % 360;
            const dir = ['NORTH', 'NORTH-EAST', 'EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST'][Math.round(brg / 45) % 8];
            h.message(`OVERLORD: PICTURE FADED — BANDITS LOW OR TERRAIN MASKED. LAST KNOWN TO THE ${dir}.`, 'gci', 8);
          }
        }
        if (alive.length === 0) {
          if (this.wave >= 10) {
            this.phase = 'victory';
            this.over = true;
            h.voice('All waves cleared');
            h.showResults({
              title: 'THEATER SECURED',
              subtitle: 'All ten waves destroyed. Outstanding flying.',
              good: true,
              stats: statsFor(p, [
                ['WAVES', '10 / 10'],
                ['TIME', `${Math.floor(this.elapsed / 60)}:${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}`],
              ]),
              buttons: [
                { label: 'PLAY AGAIN', action: 'retry' },
                { label: 'MAIN MENU', action: 'menu' },
              ],
            });
          } else {
            this.phase = 'intermission';
            this.timer = 22;
            h.message(`WAVE ${this.wave} CLEARED — NEXT WAVE IN 22 S`, 'good', 8);
            h.voice('Splash all bandits');
            if (h.config.autoRearm) {
              p.rearm(true);
              h.refreshStores(p);
              h.message('REARMED, REFUELED AND REPAIRED (AUTO-REARM)', 'good', 6);
            }
          }
        }
        break;
      }
      case 'intermission':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.wave++;
          this.beginWave();
        }
        break;
    }
  }

  status(): ModeStatus {
    const p = this.host.player;
    const alive = this.enemies.filter((e) => e.alive).length;
    let objective = '';
    if (this.phase === 'brief') objective = `WAVE ${this.wave} INBOUND IN ${Math.ceil(this.timer)} S`;
    else if (this.phase === 'combat') objective = `DESTROY ${alive} BANDIT${alive === 1 ? '' : 'S'}`;
    else if (this.phase === 'intermission') objective = `NEXT WAVE IN ${Math.ceil(this.timer)} S — LAND & [H] TO REARM IF NEEDED`;
    return { title: `WAVE ${this.wave}/10`, blue: p && p.alive ? 1 : 0, red: alive, timer: this.waveTime, objective };
  }

  handle(action: ResultButton['action']): void {
    const h = this.host;
    if (action === 'retry' || action === 'retryWave') {
      for (const a of [...h.sim.aircraft]) h.sim.remove(a);
      h.sim.missiles.length = 0;
      h.sim.bullets.clear();
      h.sim.cms.clear();
      h.picture.clear();
      // a restart goes back to the wave the mission was set up to start on (not always wave 1)
      const w = action === 'retry' ? this.firstWave : this.wave;
      this.over = false;
      this.deadTimer = 0;
      this.gciTimer = 20;
      // a full restart starts the clock again
      if (action === 'retry') this.elapsed = 0;
      const p = h.createPlayer();
      this.placePlayer();
      h.sim.add(p);
      this.wave = w;
      this.enemies = [];
      this.beginWave();
    }
  }
}
