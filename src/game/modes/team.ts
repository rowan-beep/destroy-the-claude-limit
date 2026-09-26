// Mode 4: 5v5 Team Battle. The player and four AI wingmen (BLUE) against
// five AI bandits (RED) over Samos. A round ends when one team has no jets
// left; everyone respawns rearmed for the next; first team to N rounds wins.
// Both teams use the same AI pilots, just on opposite sides. Enemy jets are
// never the player's own type; allies can be any of the three.

import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton, statsFor } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import { AIPilot } from '../../ai/pilot';
import { duelSkill } from '../../ai/skill';
import { ISLAND_BY_ID } from '../../world/islands';
import { spawnInAir, aiStores, pickEnemyType } from '../spawn';
import { AIRCRAFT_TYPES, AircraftType } from '../../aircraft/specs';
import { NM } from '../../core/constants';
import { randPick, rand } from '../../core/rng';
import type { Team } from '../../core/constants';

type Phase = 'brief' | 'combat' | 'roundEnd' | 'over';

const BLUE_NAMES = ['VIPER 1-1', 'VIPER 1-2', 'VIPER 1-3', 'VIPER 1-4', 'VIPER 1-5'];
const RED_NAMES = ['COBRA 2-1', 'COBRA 2-2', 'COBRA 2-3', 'COBRA 2-4', 'COBRA 2-5'];
/** a round that nobody finishes is decided by who has more jets left */
const ROUND_LIMIT = 10 * 60;

export class TeamBattleMode extends GameMode {
  round = 0;
  readonly score = { blue: 0, red: 0 };
  phase: Phase = 'brief';
  blue: Aircraft[] = [];
  red: Aircraft[] = [];
  private timer = 0;
  private roundTime = 0;
  /** player kills summed over the match (the player jet is new each round) */
  private matchKills = 0;
  private matchShots = 0;
  private roundWinner: Team | null = null;

  get winsNeeded(): number {
    return Math.max(1, Math.min(5, this.host.config.teamWins || 3));
  }

  start(): void {
    this.score.blue = this.score.red = 0;
    this.round = 0;
    this.matchKills = this.matchShots = 0;
    this.startRound();
  }

  private clearField(): void {
    const h = this.host;
    for (const a of [...h.sim.aircraft]) h.sim.remove(a);
    h.sim.missiles.length = 0;
    h.sim.bullets.clear();
    h.sim.cms.clear();
    h.picture.clear();
  }

  private loadout(a: Aircraft, isPlayer: boolean): void {
    const rules = this.host.config.duelRules;
    if (rules === 'ir') a.setStores(aiStores(a, 0, isPlayer ? Math.min(6, a.spec.maxAAM) : 4));
    else if (rules === 'guns') {
      a.setStores({});
      a.selectedWeapon = 'GUN';
    } else if (!isPlayer) a.setStores(aiStores(a, 4, 2));
  }

  private startRound(): void {
    const h = this.host;
    const cfg = h.config;
    this.clearField();
    this.round++;
    this.roundTime = 0;
    this.roundWinner = null;
    const samos = ISLAND_BY_ID.samos;
    const sep = 24 * NM;
    const skill = duelSkill(cfg.difficulty);

    const p = h.createPlayer();
    this.loadout(p, true);
    this.blue = [p];
    this.red = [];
    // BLUE comes in from the west, RED from the east, line abreast 1.2 NM apart
    const slots = [0, -1, 1, -2, 2];
    for (let i = 0; i < 5; i++) {
      const off = slots[i] * 1.2 * NM;
      const alt = 6400 + rand(-400, 400);
      // BLUE
      let b: Aircraft;
      if (i === 0) b = p;
      else {
        const type: AircraftType = cfg.teamAllies === 'same' ? p.type : randPick(AIRCRAFT_TYPES);
        b = new Aircraft(type, 'blue', BLUE_NAMES[i]);
        this.loadout(b, false);
        this.blue.push(b);
      }
      spawnInAir(b, new THREE.Vector3(samos.cx - sep - Math.abs(slots[i]) * 900, i === 0 ? 6400 : alt, samos.cz + off), 90, 460);
      // RED: never the player's type
      const r = new Aircraft(pickEnemyType(p.type), 'red', RED_NAMES[i]);
      this.loadout(r, false);
      spawnInAir(r, new THREE.Vector3(samos.cx + sep + Math.abs(slots[i]) * 900, alt, samos.cz + off), 270, 460);
      this.red.push(r);
    }
    // the same AI flies for both sides; each sweeps toward the other team's side of Samos
    const route = (team: Team) => {
      const sx = team === 'blue' ? 1 : -1;
      return [
        new THREE.Vector3(samos.cx + sx * sep, 6600, samos.cz + rand(-8000, 8000)),
        new THREE.Vector3(samos.cx, 7200, samos.cz + rand(-20000, 20000)),
        new THREE.Vector3(samos.cx - sx * sep * 0.6, 6600, samos.cz + rand(-15000, 15000)),
      ];
    };
    const arm = (list: Aircraft[], team: Team) => {
      list.forEach((a, i) => {
        if (a.isPlayer) return;
        const ai = new AIPilot(a, { ...skill, weapons: { ...skill.weapons } }, h.picture);
        ai.setRoute(route(team), 6600);
        ai.bracketSide = i % 2 === 0 ? 1 : -1;
        a.ai = ai;
      });
    };
    arm(this.blue, 'blue');
    arm(this.red, 'red');
    for (const a of [...this.blue, ...this.red]) h.sim.add(a);
    h.picture.gciEnabled.blue = true;
    h.picture.gciEnabled.red = true;

    this.phase = 'brief';
    this.timer = 5;
    const need = this.winsNeeded;
    h.order(
      `ROUND ${this.round} — BLUE ${this.score.blue} : ${this.score.red} RED`,
      `First to ${need}. Your flight: ${this.blue.map((a) => a.spec.shortName).join(', ')}. Bandits: ${this.red.map((a) => a.spec.shortName).join(', ')} (${cfg.difficulty}). ${
        cfg.duelRules === 'guns' ? 'GUNS ONLY.' : cfg.duelRules === 'ir' ? 'SIDEWINDERS AND GUNS ONLY.' : 'ALL WEAPONS FREE.'
      } Merge over Samos in about a minute.`,
      9,
    );
    h.voice(`Round ${this.round}`);
    h.onPlayerRespawn?.();
  }

  private alive(list: Aircraft[]): number {
    let n = 0;
    for (const a of list) if (a.alive) n++;
    return n;
  }

  update(dt: number): void {
    this.elapsed += dt;
    const h = this.host;
    if (this.phase === 'over') return;
    // clear wrecks a while after they hit the ground
    for (const e of [...h.sim.aircraft]) {
      if (!e.isPlayer && !e.alive && e.fm.crashed && h.sim.time - e.destroyedAt > 25) h.sim.remove(e);
    }
    const blueAlive = this.alive(this.blue);
    const redAlive = this.alive(this.red);
    switch (this.phase) {
      case 'brief':
        this.timer -= dt;
        this.roundTime += dt;
        if (this.timer <= 0) {
          this.phase = 'combat';
          h.message("FIGHT'S ON", 'good', 3);
          h.voice("Fight's on");
        }
        break;
      case 'combat': {
        this.roundTime += dt;
        let winner: Team | null | 'draw' = null;
        if (blueAlive === 0 && redAlive === 0) winner = 'draw';
        else if (redAlive === 0) winner = 'blue';
        else if (blueAlive === 0) winner = 'red';
        else if (this.roundTime > ROUND_LIMIT) winner = blueAlive > redAlive ? 'blue' : redAlive > blueAlive ? 'red' : 'draw';
        if (winner) this.endRound(winner);
        break;
      }
      case 'roundEnd':
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.score.blue >= this.winsNeeded || this.score.red >= this.winsNeeded) this.finish();
          else this.startRound();
        }
        break;
    }
  }

  private endRound(winner: Team | 'draw'): void {
    const h = this.host;
    const p = h.player;
    if (p) {
      this.matchKills += p.kills;
      this.matchShots += p.shotsFired;
    }
    this.phase = 'roundEnd';
    this.timer = 7;
    if (winner === 'draw') {
      h.message(`ROUND ${this.round} DRAWN — REPLAYING`, 'warn', 6);
      this.round--;
      return;
    }
    this.roundWinner = winner;
    this.score[winner]++;
    const won = winner === 'blue';
    const txt = `ROUND ${this.round}: ${won ? 'BLUE' : 'RED'} WINS — BLUE ${this.score.blue} : ${this.score.red} RED`;
    h.message(txt, won ? 'good' : 'bad', 7);
    h.voice(won ? 'Round won' : 'Round lost');
  }

  private finish(): void {
    const h = this.host;
    this.phase = 'over';
    this.over = true;
    const won = this.score.blue > this.score.red;
    const p = h.player;
    h.showResults({
      title: won ? 'MATCH WON' : 'MATCH LOST',
      subtitle: `5v5 Team Battle — BLUE ${this.score.blue} : ${this.score.red} RED over ${this.round} round${this.round === 1 ? '' : 's'}.`,
      good: won,
      stats: [
        ['FINAL SCORE', `${this.score.blue} : ${this.score.red}`],
        ['YOUR KILLS (MATCH)', String(this.matchKills)],
        ['MISSILES FIRED (MATCH)', String(this.matchShots)],
        ['AI DIFFICULTY', h.config.difficulty],
        ...statsFor(p, []).slice(0, 1),
        ['MATCH TIME', `${Math.floor(this.elapsed / 60)}:${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}`],
      ],
      buttons: [
        { label: 'PLAY AGAIN', action: 'retry' },
        { label: 'MAIN MENU', action: 'menu' },
      ],
    });
  }

  /** Every jet in the round, for the spectator list (BLUE first). */
  roster(): Aircraft[] {
    return [...this.blue, ...this.red];
  }

  status(): ModeStatus {
    const blueAlive = this.alive(this.blue);
    const redAlive = this.alive(this.red);
    let objective = '';
    if (this.phase === 'brief') objective = `ROUND ${this.round} — MERGE IN ${Math.ceil(this.timer)} S`;
    else if (this.phase === 'combat') objective = `DESTROY ALL ${redAlive} BANDIT${redAlive === 1 ? '' : 'S'} · FIRST TO ${this.winsNeeded}`;
    else if (this.phase === 'roundEnd') objective = this.roundWinner ? `${this.roundWinner === 'blue' ? 'BLUE' : 'RED'} TAKES ROUND ${this.round} — NEXT ROUND IN ${Math.ceil(this.timer)} S` : `NEXT ROUND IN ${Math.ceil(this.timer)} S`;
    return {
      title: `ROUND ${Math.max(1, this.round)} · ${this.score.blue}:${this.score.red}`,
      blue: blueAlive,
      red: redAlive,
      timer: this.roundTime,
      objective,
    };
  }

  handle(action: ResultButton['action']): void {
    if (action === 'retry') {
      this.over = false;
      this.elapsed = 0;
      this.start();
    }
  }
}
