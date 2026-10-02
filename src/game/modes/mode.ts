// Common interface between the game shell and a game-mode director.

import * as THREE from 'three';
import type { Sim } from '../sim';
import type { TeamPicture } from '../teamPicture';
import type { MissionConfig } from '../mission';
import type { Aircraft } from '../../aircraft/aircraft';
import type { SortieRecorder } from '../logbook';
import { NM, FT } from '../../core/constants';
import { bearingXZ } from '../../core/math';

export type MsgKind = 'info' | 'warn' | 'good' | 'bad' | 'order' | 'gci';

export interface ResultButton {
  label: string;
  action: 'retry' | 'retryWave' | 'nextWave' | 'menu' | 'respawn' | 'continue' | 'replay';
}

export interface MissionResult {
  title: string;
  subtitle: string;
  good: boolean;
  stats: [string, string][];
  buttons: ResultButton[];
  /** filled in by the game shell: the sortie record and decorations earned */
  debrief?: { sortie: SortieRecorder; earned: string[] };
}

/** Centre-screen mission briefing: the sim holds until the player presses OKAY. */
export interface Briefing {
  kicker: string;
  title: string;
  story: string;
  tasks: string[];
  footer?: string;
  onOk?: () => void;
  /** heading over the task list (default YOUR MISSION) */
  heading?: string;
  /** a decision instead of OKAY: one button per choice */
  choices?: { label: string; detail?: string; pick: () => void }[];
}

export interface ModeHost {
  readonly sim: Sim;
  readonly picture: TeamPicture;
  readonly config: MissionConfig;
  player: Aircraft | null;
  createPlayer(): Aircraft;
  message(text: string, kind?: MsgKind, seconds?: number): void;
  order(title: string, body: string, seconds?: number): void;
  showResults(r: MissionResult): void;
  refreshStores(a: Aircraft): void;
  playerKilledBy(killer: Aircraft | null, cause: string): void;
  voice(text: string): void;
  /** the mode respawned the player mid-mission (team battle rounds) */
  onPlayerRespawn?(): void;
  /** the player's jet is being hurt by the free-for-all storm (exposure 0..1) */
  stormHit?(exposure: number): void;
  /** current camera view (cockpit, chase, ...) */
  cameraMode?(): string;
  /** throttle lever command 0..1.1 (above 1 = afterburner) */
  throttle?(): number;
  /** show a briefing box; the mission waits for OKAY */
  brief?(b: Briefing): void;
}

export interface ModeStatus {
  title: string;
  blue: number;
  red: number;
  timer: number;
  objective: string;
  /** score bar texts replacing FRIENDLY n / ENEMY n */
  blueText?: string;
  redText?: string;
  /** centre-screen warning from the mode (below missile / terrain warnings) */
  warning?: string;
}

export abstract class GameMode {
  elapsed = 0;
  over = false;
  constructor(protected host: ModeHost) {}
  abstract start(): void;
  abstract update(dt: number): void;
  abstract status(): ModeStatus;
  /** result-screen buttons route here */
  abstract handle(action: ResultButton['action']): void;
  dispose(): void {}
  /** jets the player can spectate after being shot down (empty = no spectating) */
  roster(): Aircraft[] {
    return [];
  }
}

/** GCI-style BRAA call from `from` to `target`: bearing, range, altitude, aspect. */
export function braa(from: THREE.Vector3, target: Aircraft): string {
  const p = target.fm.pos;
  const brg = Math.round(bearingXZ(from.x, from.z, p.x, p.z));
  const rng = Math.round(Math.hypot(p.x - from.x, p.z - from.z) / NM);
  const alt = Math.round(p.y / FT / 1000);
  // aspect relative to the observer
  const toObs = new THREE.Vector3(from.x - p.x, 0, from.z - p.z).normalize();
  const hv = new THREE.Vector3(target.fm.vel.x, 0, target.fm.vel.z).normalize();
  const c = hv.dot(toObs);
  const aspect = c > 0.8 ? 'HOT' : c > 0.2 ? 'FLANK' : c > -0.3 ? 'BEAM' : 'COLD';
  return `BRAA ${String(brg).padStart(3, '0')}/${rng}, ${alt} THOUSAND, ${aspect}`;
}

export function statsFor(p: Aircraft | null, extra: [string, string][] = []): [string, string][] {
  if (!p) return extra;
  const acc = p.shotsFired > 0 ? Math.round((p.kills / p.shotsFired) * 100) : 0;
  return [
    ['AIRCRAFT', p.spec.name],
    ['KILLS', String(p.kills)],
    ['MISSILES FIRED', String(p.shotsFired)],
    ['KILL / SHOT', `${acc}%`],
    ['GUN ROUNDS LEFT', String(p.gunAmmo)],
    ['FUEL REMAINING', `${Math.round(p.fm.fuelTotal / 0.4536)} LB`],
    ...extra,
  ];
}
