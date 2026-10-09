// RANKED: a Rainbow Six Siege-style ladder for the air game (not space, not ocean).
//
// THE LADDER (Siege Ranked 2.0's): 36 ranks. Copper, Bronze, Silver, Gold, Platinum,
// Emerald and Diamond, five divisions each (V lowest .. I highest), 100 RP a division:
// Copper V starts at 1000 RP, each tier spans 500, Diamond I starts at 4400. Champion,
// from 4500 RP (and 8 matches in the week), has no divisions and shows your place on the
// leaderboard (#N).
//
// HIDDEN SKILL (Ranked 2.0's): a rating (MMR) with an uncertainty, kept from week to
// week. It picks the AI you are matched against and pulls your visible RP toward it:
// each result is worth about +/-30 RP at par, up to +80 / down to -9 when you are ranked
// well below your skill (the gap rule).
//
// RP: the result is scored Elo-style against the other side; every kill adds 5 RP (at
// most 15 a match, and never more than half a loss back) -- kills count here, unlike
// Siege. A win is worth at least 10. The DEMOTION SHIELD: a loss that would drop you a
// division leaves you at its 0 RP if you started the match above it (Champion is held at
// 4500 the same way); the next loss at 0 drops you normally.
//
// THE WEEK: ranks reset every Monday at 8:00 a.m. Pacific time (America/Los_Angeles,
// daylight saving included). Each week starts with 5 PLACEMENT matches, rank hidden until
// the fifth: +100 for a win and -50 for a loss at par (Siege Ranked 3.0's), seeded 300 RP
// (or one uncertainty) below your hidden skill, at most Diamond V; a first-time pilot
// seeds at 1667 (Bronze IV). Placements never reach Champion.
//
// LEAVING a match counts as a loss (no kill RP, no shield) and keeps you out of ranked
// for 5, 15, 45 then 120 minutes, forgiven after 7 days.
//
// Online free-for-all matches count too (4 pilots or more): your placing is scored as a
// win or loss against every other pilot.
//
// Numbers Siege never published (the Elo scale, the uncertainty constants, the seed cap)
// are the research report's recommendations for a weekly ladder.

import { clamp } from '../core/math';
import { apexSkill, skillFromLevel, type AISkill } from '../ai/skill';

export const TIERS = ['COPPER', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'CHAMPION'] as const;
export type TierId = (typeof TIERS)[number];
/** division names, lowest first */
export const DIVISIONS = ['V', 'IV', 'III', 'II', 'I'] as const;

export const RP_FLOOR = 1000;
export const DIV_RP = 100;
export const TIER_RP = 500;
export const CHAMPION_RP = 4500;
export const RANK_COUNT = 36;
/** Champion also needs this many completed ranked matches in the week */
export const CHAMPION_MIN_MATCHES = 8;

/** Elo: a 500 RP (one tier) edge is a 76% expected win */
export const ELO_SCALE = 1000;
/** a result is worth 60 x (score - expected): +/-30 at par */
export const OUTCOME_RP = 60;
export const GAP_SCALE = 400;
export const WIN_MIN_RP = 10;
export const LOSS_MIN_RP = 9;
export const SWING_MAX_RP = 80;
export const KILL_RP = 5;
export const KILL_RP_CAP = 15;

export const PLACEMENTS = 5;
/** placements never reach Champion */
export const PLACEMENT_CAP = CHAMPION_RP - 1;
export const SOFT_RESET_RP = 300;
/** nobody is seeded above Diamond V */
export const SEED_CAP = 4000;

/** hidden skill: start, uncertainty, its decay per match and floor */
export const MMR_START = 2500;
export const SIGMA_START = 833;
export const SIGMA_DECAY = 0.96;
export const SIGMA_FLOOR = 350;

/** queue cooldowns after leaving matches (minutes), forgiven after a week */
export const LEAVE_COOLDOWN_MIN = [5, 15, 45, 120];
export const LEAVE_FORGIVE_MS = 7 * 86400000;
/** an online match counts with this many pilots or more */
export const ONLINE_MIN_PILOTS = 4;

export const TIER_COLORS: Record<TierId, { main: string; light: string; dark: string }> = {
  COPPER: { main: '#b5562f', light: '#e0835a', dark: '#5c2412' },
  BRONZE: { main: '#b07a3e', light: '#e2ad6c', dark: '#5a3714' },
  SILVER: { main: '#a9b4bf', light: '#e4ebf2', dark: '#4d5762' },
  GOLD: { main: '#e2b23a', light: '#ffe18a', dark: '#7a5510' },
  PLATINUM: { main: '#3fb6b0', light: '#94ece6', dark: '#145651' },
  EMERALD: { main: '#2fbf6b', light: '#8ff0b4', dark: '#0f5a2e' },
  DIAMOND: { main: '#9b7cf0', light: '#d3c4ff', dark: '#3d2a85' },
  CHAMPION: { main: '#e0217e', light: '#ff8cc6', dark: '#6a0838' },
};

export interface Rank {
  /** 0 = Copper V .. 34 = Diamond I, 35 = Champion */
  index: number;
  tier: TierId;
  tierIndex: number;
  /** 5 (V) .. 1 (I); 0 for Champion */
  division: number;
  /** "GOLD III", "CHAMPION" */
  name: string;
  /** RP where it starts */
  start: number;
  /** RP where the next rank starts (null for Champion) */
  next: number | null;
}

function makeRank(index: number): Rank {
  if (index >= RANK_COUNT - 1) return { index: RANK_COUNT - 1, tier: 'CHAMPION', tierIndex: 7, division: 0, name: 'CHAMPION', start: CHAMPION_RP, next: null };
  const tierIndex = Math.floor(index / 5);
  const d = index % 5; // 0 = V
  const tier = TIERS[tierIndex];
  const start = RP_FLOOR + tierIndex * TIER_RP + d * DIV_RP;
  return { index, tier, tierIndex, division: 5 - d, name: `${tier} ${DIVISIONS[d]}`, start, next: start + DIV_RP };
}

export const RANKS: Rank[] = Array.from({ length: RANK_COUNT }, (_, i) => makeRank(i));

/** the rank an RP figure is in (Champion from 4500, whatever the match count) */
export function rankOf(rp: number): Rank {
  if (rp >= CHAMPION_RP) return RANKS[RANK_COUNT - 1];
  return RANKS[clamp(Math.floor((rp - RP_FLOOR) / DIV_RP), 0, RANK_COUNT - 2)];
}

// --- the week ------------------------------------------------------------------------------------------------------

const TZ = 'America/Los_Angeles';
const DAY = 86400000;
let fmt: Intl.DateTimeFormat | null = null;

/** wall-clock time in Pacific time */
function pacific(t: number): { y: number; mo: number; d: number; h: number; mi: number; s: number; wd: number } {
  fmt ??= new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
  });
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(new Date(t))) p[x.type] = x.value;
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd };
}

/** the moment a Pacific wall-clock time happens (daylight saving included) */
function fromPacific(y: number, mo: number, d: number, h: number): number {
  const want = Date.UTC(y, mo - 1, d, h);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const w = pacific(t);
    t += want - Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  }
  return t;
}

/** the last weekly reset (Monday 8:00 a.m. Pacific) at or before t */
export function weekStart(t = Date.now()): number {
  const w = pacific(t);
  let back = w.wd; // days since Monday
  if (back === 0 && w.h < 8) back = 7;
  const day = new Date(Date.UTC(w.y, w.mo - 1, w.d - back));
  return fromPacific(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 8);
}

/** the next weekly reset after t */
export function nextReset(t = Date.now()): number {
  return weekStart(weekStart(t) + 8 * DAY);
}

/** the week's name, from its Monday: "2026-10-05" */
export function weekId(start: number): string {
  const w = pacific(start);
  return `${w.y}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
}

// --- matchmaking ---------------------------------------------------------------------------------------------------

/** hidden skill -> AI skill level: Easy 1500, Medium 2500, Hard 3300, Extreme 4000 (APEX from 4500, rated 4700) */
const AI_ANCHORS: [number, number][] = [
  [RP_FLOOR, 0],
  [1500, 0.05],
  [2500, 0.35],
  [3300, 0.65],
  [4000, 1],
];
export const APEX_RATING = 4700;

export function skillLevelFor(mmr: number): number {
  if (mmr <= AI_ANCHORS[0][0]) return 0;
  for (let i = 1; i < AI_ANCHORS.length; i++) {
    const [r1, l1] = AI_ANCHORS[i];
    if (mmr <= r1) {
      const [r0, l0] = AI_ANCHORS[i - 1];
      return l0 + ((mmr - r0) / (r1 - r0)) * (l1 - l0);
    }
  }
  return 1;
}

/** the AI pilots a ranked match puts up at this hidden skill (wingmen and bandits alike) */
export function rankedSkill(mmr: number): AISkill {
  if (mmr >= CHAMPION_RP) return apexSkill();
  return skillFromLevel(skillLevelFor(mmr), rankOf(mmr).name);
}

/** how strong those AI pilots are, as a rating (what a result is scored against) */
export function aiRating(mmr: number): number {
  if (mmr >= CHAMPION_RP) return APEX_RATING;
  return Math.min(mmr, 4000);
}

/** the plain difficulty closest to a hidden skill (labels, the logbook) */
export function difficultyFor(mmr: number): 'EASY' | 'MEDIUM' | 'HARD' | 'EXTREME' | 'APEX' {
  if (mmr >= CHAMPION_RP) return 'APEX';
  const l = skillLevelFor(mmr);
  return l < 0.2 ? 'EASY' : l < 0.5 ? 'MEDIUM' : l < 0.82 ? 'HARD' : 'EXTREME';
}

// --- state ---------------------------------------------------------------------------------------------------------

export type MatchResult = 'win' | 'loss' | 'draw';
export type RankedPlaylist = 'ranked' | 'online';

export interface MatchRecord {
  /** when it ended (ms) */
  t: number;
  week: string;
  playlist: RankedPlaylist;
  result: MatchResult;
  abandon?: boolean;
  kills: number;
  deaths: number;
  /** e.g. "4 : 2" or "3rd of 8" */
  score: string;
  /** 1..5 during placements, 0 after */
  placement: number;
  rpBefore: number;
  rpAfter: number;
  /** the result's share of the change (with the gap rule) */
  resultRp: number;
  /** the kills' share */
  killRp: number;
  /** the demotion shield held the line */
  shield: boolean;
  /** why the result was worth what it was */
  reason: string;
}

export interface WeekRecord {
  week: string;
  /** final RP (null: placements not finished) */
  rp: number | null;
  maxRp: number | null;
  /** final Champion place, if known */
  place: number | null;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  kills: number;
}

export interface RankedState {
  v: 2;
  /** the weekly reset this state belongs to (ms) */
  week: number;
  /** hidden skill and its uncertainty (never reset) */
  mmr: number;
  sigma: number;
  /** visible RP (meaningful once placements are done) */
  rp: number;
  /** placement matches played this week */
  placed: number;
  /** where this week's placements started */
  seed: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  abandons: number;
  kills: number;
  deaths: number;
  /** best RP this week after placements (0: not placed yet) */
  maxRp: number;
  /** newest first */
  history: MatchRecord[];
  /** finished weeks, newest first */
  weeks: WeekRecord[];
  /** a ranked match in progress: if the game closes before it ends, it counts as a loss */
  live: { started: number; playlist: RankedPlaylist; opp: number; kind: 'team' | 'ffa'; of?: number } | null;
  /** when matches were left (ms), for the cooldown ladder */
  left: number[];
  /** no ranked until (ms) */
  cooldownUntil: number;
  /** last Champion place seen this week */
  place: number | null;
}

const KEY = 'triad.ranked.v2';
const HISTORY = 50;
const WEEKS = 26;

export function seedFor(mmr: number, sigma: number): number {
  return clamp(Math.round(mmr - Math.max(SOFT_RESET_RP, sigma)), RP_FLOOR, SEED_CAP);
}

export function newRankedState(now = Date.now()): RankedState {
  const seed = seedFor(MMR_START, SIGMA_START);
  return {
    v: 2,
    week: weekStart(now),
    mmr: MMR_START,
    sigma: SIGMA_START,
    rp: seed,
    placed: 0,
    seed,
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    abandons: 0,
    kills: 0,
    deaths: 0,
    maxRp: 0,
    history: [],
    weeks: [],
    live: null,
    left: [],
    cooldownUntil: 0,
    place: null,
  };
}

let mem: RankedState | null = null;
/** the match this page started (its start time): loading the state mid-match must not settle it as left */
let liveHere = 0;

export function loadRanked(now = Date.now()): RankedState {
  let s: RankedState | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = JSON.parse(raw) as RankedState;
  } catch {
    s = null;
  }
  if (!s || s.v !== 2) s = mem ?? newRankedState(now);
  // a match left running when the game closed counts as a loss
  if (s.live && s.live.started !== liveHere) {
    const L = s.live;
    settleMatch(s, { playlist: L.playlist, kind: L.kind, result: 'loss', place: L.of, of: L.of, kills: 0, deaths: 1, oppRating: L.opp, abandon: true, score: 'LEFT THE MATCH' }, L.started);
  }
  rollWeek(s, now);
  mem = s;
  return s;
}

export function saveRanked(s: RankedState): void {
  mem = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: keep the session copy */
  }
}

/** true while this week's placements are not finished */
export function placing(s: RankedState): boolean {
  return s.placed < PLACEMENTS;
}

/** the rating matchmaking uses: the hidden skill */
export function ratingOf(s: RankedState): number {
  return s.mmr;
}

/** Champion needs 4500 RP and 8 matches this week */
export function championEligible(s: RankedState): boolean {
  return s.rp >= CHAMPION_RP && s.matches >= CHAMPION_MIN_MATCHES;
}

/** the visible rank (null while placing: UNRANKED); 4500+ RP short of 8 matches shows Diamond I */
export function visibleRank(s: RankedState): Rank | null {
  if (placing(s)) return null;
  if (s.rp >= CHAMPION_RP && !championEligible(s)) return RANKS[RANK_COUNT - 2];
  return rankOf(s.rp);
}

/** RP into the current division (0..99; above 4500 for Champion) */
export function divisionRp(s: RankedState): number {
  const r = visibleRank(s);
  if (!r) return 0;
  return r.tier === 'CHAMPION' ? s.rp - CHAMPION_RP : Math.min(DIV_RP - 1, s.rp - r.start);
}

/** ranked queue closed (cooldown after leaving a match): ms left, 0 = open */
export function cooldownLeft(s: RankedState, now = Date.now()): number {
  return Math.max(0, s.cooldownUntil - now);
}

/** Close the week if Monday 8:00 a.m. Pacific has passed: file it, seed from hidden skill, back to placements. */
export function rollWeek(s: RankedState, now = Date.now()): boolean {
  const start = weekStart(now);
  if (s.week === start) return false;
  if (s.matches > 0) {
    const done = !placing(s);
    s.weeks.unshift({
      week: weekId(s.week),
      rp: done ? s.rp : null,
      maxRp: done ? s.maxRp : null,
      place: done && championEligible(s) ? s.place : null,
      matches: s.matches,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      kills: s.kills,
    });
    s.weeks.length = Math.min(s.weeks.length, WEEKS);
  }
  s.seed = seedFor(s.mmr, s.sigma);
  s.rp = s.seed;
  s.week = start;
  s.placed = 0;
  s.matches = s.wins = s.losses = s.draws = s.abandons = s.kills = s.deaths = 0;
  s.maxRp = 0;
  s.place = null;
  s.live = null;
  return true;
}

/** Elo expectation of beating a side rated `opp` */
export function expected(rating: number, opp: number): number {
  return 1 / (1 + Math.pow(10, (opp - rating) / ELO_SCALE));
}

export interface MatchInput {
  playlist: RankedPlaylist;
  /** team (5v5) or free-for-all (scored on placing) */
  kind: 'team' | 'ffa';
  /** team: the result */
  result?: MatchResult;
  /** ffa: your placing (1 = won) and how many pilots started */
  place?: number;
  of?: number;
  kills: number;
  deaths: number;
  /** the other side's rating (default: the AI at your hidden skill) */
  oppRating?: number;
  abandon?: boolean;
  score: string;
}

export interface MatchOutcome {
  record: MatchRecord;
  /** rank before and after (null = unranked / still placing) */
  before: Rank | null;
  after: Rank | null;
  /** the fifth placement just finished: the rank is revealed */
  revealed: boolean;
  promoted: boolean;
  demoted: boolean;
  /** placements still to play */
  placementsLeft: number;
  /** the match did not count (too few pilots online) */
  uncounted?: boolean;
}

/** a match's score (0..1) and expectation for you */
function scoreOf(m: MatchInput, mmr: number, opp: number): { S: number; E: number; outcome: number } {
  if (m.kind === 'ffa') {
    const n = Math.max(2, m.of ?? 2);
    const place = clamp(m.place ?? n, 1, n);
    // a win against every pilot below you, a loss against every one above (an even lobby)
    const S = (n - place) / (n - 1);
    const E = expected(mmr, opp);
    const outcome = OUTCOME_RP * (1 + (n - 2) / 10) * (S - E);
    return { S, E, outcome };
  }
  const S = m.result === 'win' ? 1 : m.result === 'draw' ? 0.5 : 0;
  const E = expected(mmr, opp);
  return { S, E, outcome: OUTCOME_RP * (S - E) };
}

/** Fold a finished ranked match into the state (and the history); returns what changed. */
export function settleMatch(s: RankedState, m: MatchInput, now = Date.now()): MatchOutcome {
  rollWeek(s, now);
  if (s.live && s.live.started === liveHere) liveHere = 0;
  s.live = null;
  const placementsLeft = () => Math.max(0, PLACEMENTS - s.placed);
  if (m.kind === 'ffa' && (m.of ?? 0) < ONLINE_MIN_PILOTS) {
    const r = visibleRank(s);
    return { record: null as unknown as MatchRecord, before: r, after: r, revealed: false, promoted: false, demoted: false, placementsLeft: placementsLeft(), uncounted: true };
  }
  const kills = m.abandon ? 0 : Math.max(0, m.kills | 0);
  const before = visibleRank(s);
  const wasPlacing = placing(s);
  const opp = m.oppRating ?? aiRating(s.mmr);
  const { S, E, outcome } = scoreOf(m, s.mmr, opp);
  const result: MatchResult = m.kind === 'ffa' ? (S > 0.5 ? 'win' : S < 0.5 ? 'loss' : 'draw') : (m.result ?? 'loss');
  const killRpRaw = Math.min(KILL_RP_CAP, kills * KILL_RP);
  const rpBefore = s.rp;
  let resultRp: number;
  let killRp: number;
  let shield = false;
  let next: number;
  if (wasPlacing) {
    // boosted: +100 / -50 at par
    const d = outcome >= 0 ? (outcome * 10) / 3 : (outcome * 5) / 3;
    resultRp = Math.round(d);
    killRp = d >= 0 ? killRpRaw : Math.floor(Math.min(killRpRaw, -d / 2));
    next = Math.min(PLACEMENT_CAP, s.rp + resultRp + killRp);
  } else {
    // the gap rule: RP leans toward hidden skill
    const gap = s.mmr - s.rp;
    if (outcome >= 0) {
      resultRp = Math.round(clamp(outcome * clamp(1 + gap / GAP_SCALE, 0.5, 2.67), result === 'win' ? WIN_MIN_RP : 0, SWING_MAX_RP));
      killRp = killRpRaw;
    } else {
      const loss = clamp(-outcome * clamp(1 - gap / GAP_SCALE, 0.3, 2), LOSS_MIN_RP, SWING_MAX_RP);
      resultRp = -Math.round(loss);
      // kills soften a loss, never erase it
      killRp = Math.floor(Math.min(killRpRaw, Math.round(loss) / 2));
    }
    next = s.rp + resultRp + killRp;
    // the demotion shield (not for leaving)
    const floor = s.rp >= CHAMPION_RP ? CHAMPION_RP : Math.floor(s.rp / DIV_RP) * DIV_RP;
    if (!m.abandon && next < s.rp && next < floor && s.rp > floor) {
      next = floor;
      shield = true;
    }
  }
  s.rp = Math.max(RP_FLOOR, Math.round(next));
  // hidden skill: Elo with a step that shrinks as it gets surer
  const edge = opp - s.mmr;
  const K = 80 + 420 * Math.pow(s.sigma / SIGMA_START, 2);
  s.mmr = clamp(s.mmr + K * (S - E), 0, 9000);
  s.sigma = Math.max(SIGMA_FLOOR, s.sigma * SIGMA_DECAY);
  if (wasPlacing) s.placed++;
  s.matches++;
  if (result === 'win') s.wins++;
  else if (result === 'loss') s.losses++;
  else s.draws++;
  s.kills += kills;
  s.deaths += Math.max(0, m.deaths | 0);
  if (!placing(s)) s.maxRp = Math.max(s.maxRp, s.rp);
  if (m.abandon) {
    s.abandons++;
    s.left = s.left.filter((t) => now - t < LEAVE_FORGIVE_MS);
    s.left.push(now);
    s.cooldownUntil = now + LEAVE_COOLDOWN_MIN[Math.min(s.left.length, LEAVE_COOLDOWN_MIN.length) - 1] * 60000;
  }
  const reason = m.abandon
    ? 'left the match'
    : m.kind === 'ffa'
      ? `${m.place} of ${m.of}`
      : Math.abs(edge) < 150
        ? 'even match'
        : edge > 0
          ? 'vs a stronger side'
          : 'vs a weaker side';
  const record: MatchRecord = {
    t: now,
    week: weekId(s.week),
    playlist: m.playlist,
    result,
    abandon: m.abandon || undefined,
    kills,
    deaths: Math.max(0, m.deaths | 0),
    score: m.score,
    placement: wasPlacing ? s.placed : 0,
    rpBefore,
    rpAfter: s.rp,
    resultRp: shield ? s.rp - rpBefore : resultRp,
    killRp: shield ? 0 : killRp,
    shield,
    reason,
  };
  s.history.unshift(record);
  s.history.length = Math.min(s.history.length, HISTORY);
  const after = visibleRank(s);
  return {
    record,
    before,
    after,
    revealed: wasPlacing && !placing(s),
    promoted: !!before && !!after && after.index > before.index,
    demoted: !!before && !!after && after.index < before.index,
    placementsLeft: placementsLeft(),
  };
}

/** A ranked match is starting: if the game is closed before it ends, it counts as a loss. `opp`: the other side's rating (default: the AI at your hidden skill). */
export function beginMatch(s: RankedState, playlist: RankedPlaylist, kind: 'team' | 'ffa' = 'team', of?: number, opp?: number, now = Date.now()): void {
  rollWeek(s, now);
  s.live = { started: now, playlist, opp: opp ?? aiRating(s.mmr), kind, of };
  liveHere = now;
  saveRanked(s);
}

/** e.g. "2 d 14 h", "3 h 05 m", "12 m" */
export function untilText(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${String(mm).padStart(2, '0')} m`;
  return `${mm} m`;
}
