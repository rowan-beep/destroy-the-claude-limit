// Mode 3: 1v1 Duel against a single AI of chosen type and difficulty.

import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton, statsFor } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import { AIPilot } from '../../ai/pilot';
import { duelSkill } from '../../ai/skill';
import { ROLES, mapAlt } from '../../world/islands';
import { spawnOnRunway, spawnInAir, aiStores, pickEnemyType } from '../spawn';
import { enemyTypesFor } from '../../aircraft/specs';
import { NM } from '../../core/constants';

export class DuelMode extends GameMode {
  enemy: Aircraft | null = null;
  private endTimer = -1;
  private rounds = 0;
  private wins = 0;
  private draws = 0;

  start(): void {
    this.setup();
  }

  private setup(): void {
    const h = this.host;
    const cfg = h.config;
    const p = h.createPlayer();
    // the enemy may only be one of the two aircraft the player did not choose
    const enemyType = enemyTypesFor(p.type).includes(cfg.enemyType) ? cfg.enemyType : pickEnemyType(p.type);
    const e = new Aircraft(enemyType, 'red', 'BANDIT 1-1');
    const skill = duelSkill(cfg.difficulty);
    if (cfg.duelRules === 'ir') {
      p.setStores(aiStores(p, 0, Math.min(6, p.spec.maxAAM)));
      e.setStores(aiStores(e, 0, 4));
    } else if (cfg.duelRules === 'guns') {
      p.setStores({});
      e.setStores({});
      p.selectedWeapon = 'GUN';
      e.selectedWeapon = 'GUN';
    }
    const ai = new AIPilot(e, skill, h.picture);
    e.ai = ai;
    if (cfg.duelStart === 'samos') {
      // opposite runways on the contested island, the dividing mountains between you
      const kv = ROLES.duelBlue;
      spawnOnRunway(p, kv);
      spawnOnRunway(e, ROLES.duelRed);
      ai.state = 'TAKEOFF';
      // hunt: around the north end of the ridge, over the player's side, around the south end
      const arena = ROLES.arena;
      const endOff = arena.id === 'samos' ? 70000 : arena.ry * 1.25;
      const side = Math.min(20000, arena.rx * 0.45);
      ai.setRoute(
        [
          new THREE.Vector3(arena.cx + side, mapAlt(6400), arena.cz - endOff),
          new THREE.Vector3(kv.x + side * 0.75, mapAlt(6000), kv.z - side),
          new THREE.Vector3(kv.x - side * 0.5, mapAlt(6000), kv.z + side * 1.25),
          new THREE.Vector3(arena.cx + side, mapAlt(6400), arena.cz + endOff),
          new THREE.Vector3(arena.cx, mapAlt(7600), arena.cz),
        ],
        mapAlt(6000),
      );
      const short = (n: string) => n.replace(/ AB$/, '');
      h.order(
        `1v1 DUEL — ${arena.name}`,
        `You: ${p.spec.shortName} at ${short(kv.name)} (west). Bandit: ${e.spec.shortName} (${cfg.difficulty}) at ${short(ROLES.duelRed.name)} (east). The mountains block radar between you: climb above them or fly around the ends to find him.`,
        12,
      );
    } else {
      const samos = ROLES.arena;
      const half = 11 * NM;
      spawnInAir(p, new THREE.Vector3(samos.cx - half, mapAlt(6400), samos.cz + 8000), 90, 450);
      spawnInAir(e, new THREE.Vector3(samos.cx + half, mapAlt(6400), samos.cz + 8000), 270, 450);
      ai.setRoute([new THREE.Vector3(samos.cx - half, mapAlt(6400), samos.cz)], mapAlt(6400));
      h.order(
        '1v1 DUEL',
        `Head-on at 22 NM over ${ROLES.arena.name[0] + ROLES.arena.name.slice(1).toLowerCase()}. You: ${p.spec.shortName}. Bandit: ${e.spec.shortName} flown by a ${cfg.difficulty} AI. ${cfg.duelRules === 'guns' ? 'GUNS ONLY.' : cfg.duelRules === 'ir' ? 'SIDEWINDERS AND GUNS ONLY.' : 'ALL WEAPONS FREE.'} FIGHT'S ON!`,
        10,
      );
    }
    h.sim.add(p);
    h.sim.add(e);
    this.enemy = e;
    h.picture.gciEnabled.blue = cfg.duelStart !== 'samos';
    h.picture.gciEnabled.red = cfg.duelStart !== 'samos';
    this.endTimer = -1;
    this.elapsed = 0;
    this.rounds++;
    h.voice("Fight's on");
  }

  update(dt: number): void {
    this.elapsed += dt;
    const h = this.host;
    const p = h.player;
    const e = this.enemy;
    if (!p || !e || this.over) return;
    if (this.endTimer < 0 && (!p.alive || !e.alive)) this.endTimer = 4;
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        this.over = true;
        const won = p.alive && !e.alive;
        const mutual = !p.alive && !e.alive;
        if (won) this.wins++;
        if (mutual) this.draws++;
        h.showResults({
          title: won ? 'VICTORY' : mutual ? 'MUTUAL KILL' : 'DEFEAT',
          subtitle: won
            ? `${e.spec.shortName} (${h.config.difficulty}) destroyed: ${e.damage.destroyCause || e.fm.crashCause || 'splash one'}.`
            : `You were lost: ${p.damage.destroyCause || p.fm.crashCause || 'shot down'}.`,
          good: won,
          stats: statsFor(p, [
            ['DUEL TIME', `${Math.floor(this.elapsed / 60)}:${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}`],
            ['RECORD', `${this.wins} W / ${this.rounds - this.wins - this.draws} L${this.draws ? ` / ${this.draws} D` : ''}`],
          ]),
          buttons: [
            { label: 'REMATCH', action: 'retry' },
            { label: 'MAIN MENU', action: 'menu' },
          ],
        });
      }
    }
  }

  status(): ModeStatus {
    const p = this.host.player;
    const e = this.enemy;
    return {
      title: `DUEL · ${this.host.config.difficulty}`,
      blue: p && p.alive ? 1 : 0,
      red: e && e.alive ? 1 : 0,
      timer: this.elapsed,
      objective: e ? `DESTROY THE ${e.spec.shortName.toUpperCase()}` : '',
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
      this.over = false;
      this.setup();
    }
  }
}
