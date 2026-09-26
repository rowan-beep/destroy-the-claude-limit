// Pilot progression: XP, levels, ranks and money.
//
// Everything you do in the air earns XP: kills (and money), defeating
// missiles, manoeuvres, distance flown, landings and mission results. XP
// raises your level along a gently rising curve; every level-up pays a cash
// bonus. Nothing is ever taken away.
//
// Fairness rules:
//  - each level needs a little more XP than the last (500, 650, 800 ...),
//    so early levels come quickly and later ones stay reachable
//  - combat pays the most; manoeuvres have cooldowns and a per-mission cap,
//    so they can't be farmed; distance doesn't count while Auto-Fly flies
//  - kill rewards scale with the enemy difficulty

import type { Aircraft } from '../aircraft/aircraft';
import type { Sim } from './sim';
import type { ModeId } from './mission';
import type { Difficulty } from '../ai/skill';
import { DEG, FT, KT, NM } from '../core/constants';
import { hostile } from './rules';

export const MAX_LEVEL = 100;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 500 + 150 * (level - 1);
}

/** Total XP needed to reach `level` (level 1 = 0). */
export function xpForLevel(level: number): number {
  const n = Math.max(0, level - 1);
  return 500 * n + 75 * n * (n - 1);
}

export function levelInfo(xp: number): { level: number; into: number; need: number; frac: number } {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, into: 0, need: 0, frac: 1 };
  const into = xp - xpForLevel(level);
  const need = xpToNext(level);
  return { level, into, need, frac: into / need };
}

const RANKS: [number, string][] = [
  [1, 'CADET'],
  [3, 'PILOT OFFICER'],
  [6, 'SECOND LIEUTENANT'],
  [10, 'FIRST LIEUTENANT'],
  [15, 'CAPTAIN'],
  [22, 'MAJOR'],
  [30, 'LIEUTENANT COLONEL'],
  [40, 'COLONEL'],
  [52, 'BRIGADIER GENERAL'],
  [65, 'MAJOR GENERAL'],
  [80, 'LIEUTENANT GENERAL'],
  [95, 'GENERAL'],
  [100, 'GENERAL OF THE AIR FORCE'],
];

export function rankFor(level: number): string {
  let r = RANKS[0][1];
  for (const [l, name] of RANKS) if (level >= l) r = name;
  return r;
}

/** Cash paid for reaching `level`. */
export function levelBonus(level: number): number {
  return 250 * level;
}

// ---------------------------------------------------------------------------
// Saved progress
// ---------------------------------------------------------------------------

export interface ProgressData {
  xp: number;
  money: number;
  /** what the main-menu card last showed (it animates from there) */
  shownXp: number;
  shownMoney: number;
}

const KEY = 'triad.progress.v1';

export function loadProgress(): ProgressData {
  const d: ProgressData = { xp: 0, money: 0, shownXp: 0, shownMoney: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(d, JSON.parse(raw));
  } catch {
    /* storage unavailable */
  }
  for (const k of ['xp', 'money', 'shownXp', 'shownMoney'] as const) if (!Number.isFinite(d[k]) || d[k] < 0) d[k] = 0;
  return d;
}

export function saveProgress(p: ProgressData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// Awards during a mission
// ---------------------------------------------------------------------------

export type AwardKind = 'kill' | 'combat' | 'maneuver' | 'flight' | 'landing' | 'mission' | 'level';

export interface Award {
  label: string;
  xp: number;
  money: number;
  kind: AwardKind;
}

export interface LevelUp {
  level: number;
  rank: string;
  bonus: number;
  newRank: boolean;
}

export interface MissionSummary {
  awards: Award[];
  xpStart: number;
  xpEnd: number;
  moneyStart: number;
  moneyEnd: number;
  levelStart: number;
  levelEnd: number;
}

const DIFF_MULT: Record<Difficulty, number> = { EASY: 0.6, MEDIUM: 0.8, HARD: 1.0, EXTREME: 1.4 };

/** Most manoeuvre awards one mission can pay out. */
const MANEUVER_CAP = 40;

/**
 * Watches one mission: turns kills, manoeuvres, distance and landings into
 * awards, and banks them straight into the saved progress (so nothing is lost
 * if you quit to the menu).
 */
export class MissionProgress {
  readonly awards: Award[] = [];
  player: Aircraft | null = null;
  onAward: ((a: Award) => void) | null = null;
  onLevelUp: ((l: LevelUp) => void) | null = null;
  private readonly xpStart: number;
  private readonly moneyStart: number;
  private readonly mult: number;
  private maneuvers = 0;
  private cooldown = new Map<string, number>();
  private once = new Set<string>();
  private t = 0;
  // manoeuvre detectors
  private highG = 0;
  private pitchAcc = 0;
  private pitchT = 0;
  private rollAcc = 0;
  private rollT = 0;
  private lowT = 0;
  private invT = 0;
  private distAcc = 0;
  private lastKillT = -99;
  private kills = 0;
  private unsub: (() => void)[] = [];

  constructor(
    private progress: ProgressData,
    private sim: Sim,
    mode: ModeId,
    difficulty: Difficulty,
    /** true while Auto-Fly is flying the jet (no distance XP then) */
    private autoFlying: () => boolean,
  ) {
    this.xpStart = progress.xp;
    this.moneyStart = progress.money;
    // waves get tougher as they go: pay as HARD; free flight has no enemies
    this.mult = mode === 'waves' ? 1 : DIFF_MULT[difficulty] ?? 1;
    const ev = sim.events;
    this.unsub.push(
      ev.on('destroyed', (e) => {
        const p = this.player;
        if (!p || e.killer !== p || e.victim === p || !hostile(e.victim, p)) return;
        this.onKill(e.victim, e.weapon);
      }),
      ev.on('missileLost', (e) => {
        const p = this.player;
        if (p && p.alive && e.missile.target === p && hostile(e.missile.shooter, p)) this.award('MISSILE DEFEATED', 25, 100, 'combat');
      }),
      ev.on('landing', (e) => {
        if (e.aircraft !== this.player) return;
        const g = e.grade.grade;
        if (g === 'GREASER') this.award('GREASER LANDING', 100, 300, 'landing');
        else if (g === 'GOOD') this.award('GOOD LANDING', 60, 150, 'landing');
        else if (g === 'FIRM') this.award('LANDING', 30, 50, 'landing');
      }),
    );
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
  }

  private onKill(victim: Aircraft, weapon: string): void {
    const m = this.mult;
    const p = this.player!;
    this.kills++;
    this.award(`SPLASH ${victim.spec.shortName.toUpperCase()}`, Math.round(100 * m), Math.round(400 * m), 'kill');
    if (/^(GUN|M61|BK-27|GSh-30)/i.test(weapon)) this.award('GUN KILL', 50, 200, 'kill');
    const range = p.distanceTo(victim);
    if (range > 20 * NM) this.award('LONG SHOT', 40, 150, 'kill');
    if (this.kills === 1) this.award('FIRST BLOOD', 25, 0, 'kill');
    if (this.t - this.lastKillT < 12) this.award('DOUBLE KILL', 50, 250, 'kill');
    this.lastKillT = this.t;
  }

  /** Bank an award: XP and money are saved at once; level-ups fire here. */
  award(label: string, xp: number, money: number, kind: AwardKind): void {
    if (xp <= 0 && money <= 0) return;
    const before = levelInfo(this.progress.xp).level;
    this.progress.xp += xp;
    this.progress.money += money;
    const a: Award = { label, xp, money, kind };
    this.awards.push(a);
    this.onAward?.(a);
    const after = levelInfo(this.progress.xp).level;
    for (let l = before + 1; l <= after; l++) {
      const bonus = levelBonus(l);
      this.progress.money += bonus;
      this.awards.push({ label: `LEVEL ${l}`, xp: 0, money: bonus, kind: 'level' });
      this.onLevelUp?.({ level: l, rank: rankFor(l), bonus, newRank: rankFor(l) !== rankFor(l - 1) });
    }
    saveProgress(this.progress);
  }

  private maneuver(key: string, label: string, xp: number, cooldown: number): void {
    if (this.maneuvers >= MANEUVER_CAP) return;
    if ((this.cooldown.get(key) ?? -1e9) > this.t) return;
    this.cooldown.set(key, this.t + cooldown);
    this.maneuvers++;
    this.award(label, xp, 0, 'maneuver');
  }

  private first(key: string, label: string, xp: number, money = 0): void {
    if (this.once.has(key)) return;
    this.once.add(key);
    this.award(label, xp, money, 'flight');
  }

  /** Called every frame while flying. */
  update(dt: number): void {
    this.t += dt;
    const p = this.player;
    if (!p || !p.alive || p.fm.onGround || dt <= 0) {
      this.highG = this.lowT = this.invT = 0;
      return;
    }
    const fm = p.fm;
    const agl = fm.agl;
    const safe = agl > 300 * FT;
    // sustained high G
    if (fm.nz >= 7) {
      this.highG += dt;
      if (this.highG >= 3) {
        this.maneuver('highg', 'HIGH-G TURN', 15, 20);
        this.highG = 0;
      }
    } else this.highG = Math.max(0, this.highG - dt * 2);
    // loop: a full turn in pitch with the wings roughly level (in body axes)
    this.pitchT += dt;
    this.pitchAcc += fm.qRate * dt;
    if (Math.abs(fm.pRate) > 1.2) this.pitchAcc *= 0.97;
    if (this.pitchT > 30) {
      this.pitchT = 0;
      this.pitchAcc = 0;
    }
    if (Math.abs(this.pitchAcc) >= 2 * Math.PI * 0.92 && safe) {
      this.maneuver('loop', 'LOOP', 40, 15);
      this.pitchAcc = 0;
      this.pitchT = 0;
    }
    // aileron roll: 360 degrees of roll in under 4 s
    this.rollT += dt;
    this.rollAcc += fm.pRate * dt;
    if (this.rollT > 4) {
      this.rollT = 0;
      this.rollAcc = 0;
    }
    if (Math.abs(this.rollAcc) >= 2 * Math.PI && safe) {
      this.maneuver('roll', 'AILERON ROLL', 10, 12);
      this.rollAcc = 0;
      this.rollT = 0;
    }
    // low and fast
    if (agl < 200 * FT && fm.cas > 350 * KT) {
      this.lowT += dt;
      if (this.lowT >= 4) {
        this.maneuver('low', 'LOW PASS', 30, 45);
        this.lowT = 0;
      }
    } else this.lowT = 0;
    // inverted flight
    if (Math.abs(fm.bank) > 150 && safe) {
      this.invT += dt;
      if (this.invT >= 6) {
        this.maneuver('inv', 'INVERTED FLIGHT', 15, 40);
        this.invT = 0;
      }
    } else this.invT = 0;
    // post-stall manoeuvring (the Su-35S's thrust vectoring)
    if (fm.alpha > 45 * DEG && !fm.departed && safe) this.maneuver('pst', 'SUPERMANOEUVRE', 30, 30);
    // speed and altitude milestones, once per mission
    if (fm.mach >= 1) this.first('m1', 'SUPERSONIC', 25);
    if (fm.mach >= 1.5) this.first('m15', 'MACH 1.5', 40);
    if (fm.mach >= 2) this.first('m2', 'MACH 2', 75, 200);
    if (fm.pos.y > 50000 * FT) this.first('alt', 'EDGE OF SPACE (50,000 FT)', 40);
    // distance: 2 XP per NM, 3 when supersonic; paid in 10 NM chunks
    if (!this.autoFlying()) {
      this.distAcc += (fm.tas * dt * (fm.mach >= 1 ? 1.5 : 1)) / NM;
      if (this.distAcc >= 10) {
        this.distAcc -= 10;
        this.award('10 NM FLOWN', 20, 0, 'flight');
      }
    }
  }

  /** Mission result bonuses, then the summary for the debrief. */
  finish(outcome: { wavesCleared?: number; victory?: boolean; team?: { won: boolean; drawn?: boolean; roundsWon: number }; duel?: 'win' | 'loss' | 'draw'; ffa?: { place: number; of: number } }): MissionSummary {
    const m = this.mult;
    if (outcome.wavesCleared) this.award(`${outcome.wavesCleared} WAVE${outcome.wavesCleared === 1 ? '' : 'S'} CLEARED`, 60 * outcome.wavesCleared, 250 * outcome.wavesCleared, 'mission');
    if (outcome.victory) this.award('ALL 10 WAVES — VICTORY', 500, 2500, 'mission');
    if (outcome.team) {
      if (outcome.team.roundsWon) this.award(`${outcome.team.roundsWon} ROUND${outcome.team.roundsWon === 1 ? '' : 'S'} WON`, Math.round(50 * outcome.team.roundsWon * m), Math.round(200 * outcome.team.roundsWon * m), 'mission');
      if (outcome.team.won) this.award('MATCH WON', Math.round(300 * m), Math.round(1500 * m), 'mission');
      else if (outcome.team.drawn) this.award('MATCH DRAWN', Math.round(100 * m), Math.round(400 * m), 'mission');
    }
    if (outcome.ffa) {
      // free-for-all placing: big rewards for the podium, something for every pilot outlasted
      const { place, of } = outcome.ffa;
      if (place === 1) this.award('LAST PILOT STANDING', Math.round(600 * m), Math.round(3000 * m), 'mission');
      else if (place === 2) this.award('2ND PLACE', Math.round(350 * m), Math.round(1500 * m), 'mission');
      else if (place === 3) this.award('3RD PLACE', Math.round(250 * m), Math.round(1000 * m), 'mission');
      const outlasted = Math.max(0, of - place);
      if (outlasted > 0 && place > 3) this.award(`OUTLASTED ${outlasted} PILOT${outlasted === 1 ? '' : 'S'}`, Math.round(20 * outlasted * m), Math.round(60 * outlasted * m), 'mission');
    }
    if (outcome.duel === 'win') this.award('DUEL WON', Math.round(200 * m), Math.round(800 * m), 'mission');
    else if (outcome.duel === 'draw') this.award('DUEL DRAWN', Math.round(60 * m), Math.round(200 * m), 'mission');
    return this.summary();
  }

  summary(): MissionSummary {
    return {
      awards: this.awards.slice(),
      xpStart: this.xpStart,
      xpEnd: this.progress.xp,
      moneyStart: this.moneyStart,
      moneyEnd: this.progress.money,
      levelStart: levelInfo(this.xpStart).level,
      levelEnd: levelInfo(this.progress.xp).level,
    };
  }
}

/** Group awards with the same label (for the debrief list). */
export function groupAwards(awards: Award[]): { label: string; count: number; xp: number; money: number; kind: AwardKind }[] {
  const out: { label: string; count: number; xp: number; money: number; kind: AwardKind }[] = [];
  const by = new Map<string, (typeof out)[number]>();
  for (const a of awards) {
    const key = a.kind === 'kill' && a.label.startsWith('SPLASH') ? a.label : a.label;
    let g = by.get(key);
    if (!g) {
      g = { label: a.label, count: 0, xp: 0, money: 0, kind: a.kind };
      by.set(key, g);
      out.push(g);
    }
    g.count++;
    g.xp += a.xp;
    g.money += a.money;
  }
  return out;
}

export function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}
