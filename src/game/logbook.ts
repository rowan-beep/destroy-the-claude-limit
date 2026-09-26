// Pilot logbook: every sortie is recorded (flight time, kills by weapon and
// range, shots, defeated missiles, landings, G / Mach / altitude records,
// the flight path of everyone involved) and folded into a persistent career
// record with per-jet totals, the best wave reached, the duel record by
// difficulty and earned decorations.
//
// Stored in localStorage; if storage is unavailable the logbook simply lives
// for the session.

import type { Aircraft } from '../aircraft/aircraft';
import { AIRCRAFT_TYPES, AircraftType } from '../aircraft/specs';
import type { Difficulty } from '../ai/skill';
import type { Sim } from './sim';
import type { ModeId } from './mission';
import type { LandingGrade } from '../avionics/nav';
import { NM, FT } from '../core/constants';

const KEY = 'triad.logbook.v1';

export interface JetRecord {
  sorties: number;
  flightSec: number;
  kills: number;
  losses: number;
  ejections: number;
  shots: number;
  landings: number;
  greasers: number;
}

export interface SortieSummary {
  date: string;
  mode: ModeId;
  jet: AircraftType;
  result: string;
  kills: number;
  shots: number;
  durationSec: number;
  detail: string;
}

export interface LogbookData {
  version: 1;
  totals: JetRecord;
  byJet: Record<AircraftType, JetRecord>;
  killsOf: Record<AircraftType, number>;
  killsBy: Record<string, number>;
  missilesDefeated: Record<string, number>;
  bestWave: number;
  bestWaveByJet: Record<AircraftType, number>;
  wavesCleared: number;
  duel: Record<Difficulty, { wins: number; losses: number; draws: number }>;
  /** 5v5 team battle: matches and rounds */
  team: { wins: number; losses: number; roundsWon: number; roundsLost: number };
  records: { maxG: number; maxMach: number; maxAltFt: number; longestKillNm: number; closestGunKillM: number };
  medals: string[];
  recent: SortieSummary[];
}

export interface MedalDef {
  id: string;
  name: string;
  desc: string;
}

export const MEDALS: MedalDef[] = [
  { id: 'first-blood', name: 'FIRST BLOOD', desc: 'Score your first air-to-air kill.' },
  { id: 'ace', name: 'ACE IN A DAY', desc: 'Five kills in a single sortie.' },
  { id: 'guns', name: 'GUNSLINGER', desc: 'A kill with the cannon.' },
  { id: 'long-shot', name: 'LONG SHOT', desc: 'An AIM-120D kill from beyond 30 NM.' },
  { id: 'knife', name: 'KNIFE FIGHT', desc: 'An AIM-9X kill inside 1 NM.' },
  { id: 'notch', name: 'IN THE NOTCH', desc: 'Defeat a radar missile by beaming it.' },
  { id: 'masker', name: 'TERRAIN MASKER', desc: 'Defeat a missile by putting terrain between you and it.' },
  { id: 'flares', name: 'SPOOFED', desc: 'Decoy an IR missile with flares.' },
  { id: 'greaser', name: 'GREASER', desc: 'Touch down under 300 fpm on the centreline in the touchdown zone.' },
  { id: 'recovery', name: 'RECOVERY', desc: 'Land back at base after a combat sortie.' },
  { id: 'mach2', name: 'MACH TWO', desc: 'Exceed Mach 2.0.' },
  { id: 'high', name: 'EDGE OF SPACE', desc: 'Climb above 55,000 ft.' },
  { id: 'gloc', name: 'LIGHTS OUT', desc: 'Survive a G-LOC.' },
  { id: 'wave5', name: 'HOLDING THE LINE', desc: 'Clear wave 5.' },
  { id: 'wave10', name: 'THEATER SECURED', desc: 'Clear all ten waves.' },
  { id: 'duel-hard', name: 'TOP GUN', desc: 'Win a duel on HARD.' },
  { id: 'duel-extreme', name: 'GRANDMASTER', desc: 'Win a duel on EXTREME.' },
  { id: 'team-win', name: 'SQUADRON LEADER', desc: 'Win a 5v5 Team Battle.' },
  { id: 'team-sweep', name: 'CLEAN SWEEP', desc: 'Win a 5v5 Team Battle without losing a round.' },
  { id: 'all-jets', name: 'TRIAD', desc: 'Score a kill in all three aircraft.' },
];

function emptyJet(): JetRecord {
  return { sorties: 0, flightSec: 0, kills: 0, losses: 0, ejections: 0, shots: 0, landings: 0, greasers: 0 };
}

function perJet<T>(make: () => T): Record<AircraftType, T> {
  const o = {} as Record<AircraftType, T>;
  for (const t of AIRCRAFT_TYPES) o[t] = make();
  return o;
}

export function emptyLogbook(): LogbookData {
  return {
    version: 1,
    totals: emptyJet(),
    byJet: perJet(emptyJet),
    killsOf: perJet(() => 0),
    killsBy: {},
    missilesDefeated: {},
    bestWave: 0,
    bestWaveByJet: perJet(() => 0),
    wavesCleared: 0,
    duel: {
      EASY: { wins: 0, losses: 0, draws: 0 },
      MEDIUM: { wins: 0, losses: 0, draws: 0 },
      HARD: { wins: 0, losses: 0, draws: 0 },
      EXTREME: { wins: 0, losses: 0, draws: 0 },
    },
    team: { wins: 0, losses: 0, roundsWon: 0, roundsLost: 0 },
    records: { maxG: 0, maxMach: 0, maxAltFt: 0, longestKillNm: 0, closestGunKillM: 0 },
    medals: [],
    recent: [],
  };
}

export function loadLogbook(): LogbookData {
  const base = emptyLogbook();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const d = JSON.parse(raw) as Partial<LogbookData>;
    // shallow-merge so new fields added later get defaults
    return {
      ...base,
      ...d,
      totals: { ...base.totals, ...(d.totals ?? {}) },
      byJet: perJetMerge(base.byJet, d.byJet),
      killsOf: { ...base.killsOf, ...(d.killsOf ?? {}) },
      bestWaveByJet: { ...base.bestWaveByJet, ...(d.bestWaveByJet ?? {}) },
      duel: { ...base.duel, ...(d.duel ?? {}) },
      team: { ...base.team, ...(d.team ?? {}) },
      records: { ...base.records, ...(d.records ?? {}) },
      medals: Array.isArray(d.medals) ? d.medals : [],
      recent: Array.isArray(d.recent) ? d.recent.slice(0, 25) : [],
    } as LogbookData;
  } catch {
    return base;
  }
}

function perJetMerge(base: Record<AircraftType, JetRecord>, d: Partial<Record<AircraftType, JetRecord>> | undefined): Record<AircraftType, JetRecord> {
  const out = { ...base };
  if (d) for (const t of AIRCRAFT_TYPES) if (d[t]) out[t] = { ...base[t], ...d[t] };
  return out;
}

export function saveLogbook(d: LogbookData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: keep the session copy */
  }
}

// ---------------------------------------------------------------------------
// Sortie recorder
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  t: number;
  text: string;
  kind: 'kill' | 'loss' | 'shot' | 'defeat' | 'land' | 'info' | 'hit';
}

export interface TrackSample {
  x: number;
  z: number;
}

export interface KillRecord {
  victim: AircraftType;
  weapon: string;
  rangeNm: number;
  x: number;
  z: number;
  t: number;
}

/** Everything that happened to one player aircraft, from spawn to the end of its flight. */
export class SortieRecorder {
  readonly events: TimelineEvent[] = [];
  readonly tracks = new Map<number, { team: string; type: AircraftType; pts: TrackSample[]; self: boolean }>();
  readonly kills: KillRecord[] = [];
  readonly defeated: string[] = [];
  readonly landings: LandingGrade[] = [];
  flightSec = 0;
  shots = 0;
  maxG = 1;
  maxMach = 0;
  maxAltFt = 0;
  glocs = 0;
  ended = false;
  result = 'IN FLIGHT';
  private sampleT = 0;
  private startT: number;
  private offs: (() => void)[] = [];

  constructor(
    readonly player: Aircraft,
    readonly mode: ModeId,
    private sim: Sim,
  ) {
    this.startT = sim.time;
    const ev = sim.events;
    const T = () => sim.time - this.startT;
    this.offs.push(
      ev.on('launch', (e) => {
        if (e.shooter !== player) return;
        this.shots++;
        const tgt = e.target ? ` at ${e.target.spec.shortName.toUpperCase()} ${(player.distanceTo(e.target) / NM).toFixed(1)} NM` : ' (MADDOG)';
        this.events.push({ t: T(), text: `${e.missile.spec.short} away${tgt}`, kind: 'shot' });
      }),
      ev.on('destroyed', (e) => {
        if (e.killer === player && e.victim !== player) {
          const rng = player.fm.pos.distanceTo(e.victim.fm.pos);
          this.kills.push({ victim: e.victim.type, weapon: e.weapon, rangeNm: rng / NM, x: e.victim.fm.pos.x, z: e.victim.fm.pos.z, t: T() });
          this.events.push({ t: T(), text: `SPLASH ${e.victim.spec.shortName.toUpperCase()} — ${e.weapon} @ ${(rng / NM).toFixed(1)} NM`, kind: 'kill' });
        }
        if (e.victim === player) {
          this.events.push({ t: T(), text: e.killer ? `SHOT DOWN BY ${e.killer.spec.shortName.toUpperCase()} (${e.weapon})` : `LOST: ${e.cause}`, kind: 'loss' });
        }
      }),
      ev.on('missileLost', (e) => {
        if (e.missile.target === player) {
          this.defeated.push(e.reason);
          this.events.push({ t: T(), text: `${e.missile.spec.short} DEFEATED — ${e.reason}`, kind: 'defeat' });
        }
      }),
      ev.on('hit', (e) => {
        if (e.victim === player && e.weapon.startsWith('AIM')) this.events.push({ t: T(), text: `HIT BY ${e.weapon}`, kind: 'hit' });
      }),
      ev.on('gloc', (e) => {
        if (e.aircraft === player) {
          this.glocs++;
          this.events.push({ t: T(), text: 'G-LOC', kind: 'info' });
        }
      }),
      ev.on('landing', (e) => {
        if (e.aircraft !== player) return;
        this.landings.push(e.grade);
        this.events.push({ t: T(), text: `LANDED ${e.grade.field?.icao ?? ''} — ${e.grade.grade} (${Math.round(e.grade.sinkFpm)} FPM)`, kind: 'land' });
      }),
      ev.on('eject', (e) => {
        if (e.aircraft === player) this.events.push({ t: T(), text: 'EJECTED', kind: 'loss' });
      }),
    );
  }

  get durationSec(): number {
    return this.sim.time - this.startT;
  }

  update(dt: number): void {
    if (this.ended) return;
    const p = this.player;
    if (p.alive) {
      if (!p.fm.onGround) this.flightSec += dt;
      this.maxG = Math.max(this.maxG, p.fm.nz);
      this.maxMach = Math.max(this.maxMach, p.fm.mach);
      this.maxAltFt = Math.max(this.maxAltFt, p.fm.pos.y / FT);
    }
    this.sampleT -= dt;
    if (this.sampleT <= 0) {
      this.sampleT = 2;
      for (const a of this.sim.aircraft) {
        if (!a.alive && a.fm.crashed) continue;
        let tr = this.tracks.get(a.id);
        if (!tr) this.tracks.set(a.id, (tr = { team: a.team, type: a.type, pts: [], self: a === p }));
        tr.pts.push({ x: a.fm.pos.x, z: a.fm.pos.z });
        if (tr.pts.length > 1800) tr.pts.splice(0, tr.pts.length - 1800);
      }
    }
  }

  end(result: string): void {
    if (this.ended) return;
    this.ended = true;
    this.result = result;
    for (const off of this.offs) off();
    this.offs = [];
  }
}

// ---------------------------------------------------------------------------
// Committing a sortie to the career record
// ---------------------------------------------------------------------------

export interface MissionOutcome {
  wave?: number;
  wavesCleared?: number;
  duel?: { difficulty: Difficulty; outcome: 'win' | 'loss' | 'draw' };
  /** a finished 5v5 match: final score */
  team?: { won: boolean; drawn?: boolean; roundsWon: number; roundsLost: number };
}

/** Fold a finished sortie into the logbook; returns newly earned medal ids. */
export function commitSortie(book: LogbookData, s: SortieRecorder, outcome: MissionOutcome = {}): string[] {
  const p = s.player;
  const jet = book.byJet[p.type];
  const tot = book.totals;
  for (const r of [jet, tot]) {
    r.sorties++;
    r.flightSec += s.flightSec;
    r.kills += s.kills.length;
    r.shots += s.shots;
    r.landings += s.landings.length;
    r.greasers += s.landings.filter((l) => l.grade === 'GREASER').length;
    if (!p.alive) r.losses++;
    if (p.ejected) r.ejections++;
  }
  for (const k of s.kills) {
    book.killsOf[k.victim] = (book.killsOf[k.victim] ?? 0) + 1;
    book.killsBy[k.weapon] = (book.killsBy[k.weapon] ?? 0) + 1;
    book.records.longestKillNm = Math.max(book.records.longestKillNm, k.rangeNm);
    if (k.weapon === 'M61' || k.weapon === 'BK-27' || k.weapon === 'GUN') {
      const m = k.rangeNm * NM;
      book.records.closestGunKillM = book.records.closestGunKillM ? Math.min(book.records.closestGunKillM, m) : m;
    }
  }
  for (const d of s.defeated) book.missilesDefeated[d] = (book.missilesDefeated[d] ?? 0) + 1;
  book.records.maxG = Math.max(book.records.maxG, s.maxG);
  book.records.maxMach = Math.max(book.records.maxMach, s.maxMach);
  book.records.maxAltFt = Math.max(book.records.maxAltFt, s.maxAltFt);
  if (outcome.wave) {
    book.bestWave = Math.max(book.bestWave, outcome.wave);
    book.bestWaveByJet[p.type] = Math.max(book.bestWaveByJet[p.type] ?? 0, outcome.wave);
  }
  if (outcome.wavesCleared) book.wavesCleared = Math.max(book.wavesCleared, outcome.wavesCleared);
  if (outcome.team) {
    const t = book.team;
    if (outcome.team.won) t.wins++;
    else if (!outcome.team.drawn) t.losses++;
    t.roundsWon += outcome.team.roundsWon;
    t.roundsLost += outcome.team.roundsLost;
  }
  if (outcome.duel) {
    const r = book.duel[outcome.duel.difficulty];
    if (outcome.duel.outcome === 'win') r.wins++;
    else if (outcome.duel.outcome === 'loss') r.losses++;
    else r.draws++;
  }
  // decorations
  const earned: string[] = [];
  const give = (id: string, cond: boolean) => {
    if (cond && !book.medals.includes(id)) {
      book.medals.push(id);
      earned.push(id);
    }
  };
  const gunKill = s.kills.some((k) => k.weapon === 'M61' || k.weapon === 'BK-27' || k.weapon === 'GUN');
  give('first-blood', tot.kills > 0);
  give('ace', s.kills.length >= 5);
  give('guns', gunKill);
  give('long-shot', s.kills.some((k) => k.weapon.startsWith('AIM-120') && k.rangeNm > 30));
  give('knife', s.kills.some((k) => k.weapon.startsWith('AIM-9') && k.rangeNm < 1));
  give('notch', s.defeated.includes('NOTCH'));
  give('masker', s.defeated.includes('TERRAIN MASK'));
  give('flares', s.defeated.includes('FLARE'));
  give('greaser', s.landings.some((l) => l.grade === 'GREASER'));
  give('recovery', s.landings.length > 0 && (s.kills.length > 0 || s.shots > 0) && p.alive);
  give('mach2', s.maxMach > 2.0);
  give('high', s.maxAltFt > 55000);
  give('gloc', s.glocs > 0 && p.alive);
  give('wave5', (outcome.wavesCleared ?? 0) >= 5 || book.wavesCleared >= 5);
  give('wave10', (outcome.wavesCleared ?? 0) >= 10 || book.wavesCleared >= 10);
  give('duel-hard', outcome.duel?.outcome === 'win' && outcome.duel.difficulty === 'HARD');
  give('duel-extreme', outcome.duel?.outcome === 'win' && outcome.duel.difficulty === 'EXTREME');
  give('team-win', !!outcome.team?.won);
  give('team-sweep', !!outcome.team?.won && outcome.team.roundsLost === 0);
  give('all-jets', AIRCRAFT_TYPES.every((t) => book.byJet[t].kills > 0));
  // recent sorties
  const d = new Date();
  book.recent.unshift({
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    mode: s.mode,
    jet: p.type,
    result: s.result,
    kills: s.kills.length,
    shots: s.shots,
    durationSec: Math.round(s.durationSec),
    detail: outcome.wave ? `WAVE ${outcome.wave}` : outcome.duel ? `${outcome.duel.difficulty}` : outcome.team ? `5v5 ${outcome.team.roundsWon}-${outcome.team.roundsLost}` : '',
  });
  if (book.recent.length > 25) book.recent.length = 25;
  return earned;
}

export function medalName(id: string): string {
  return MEDALS.find((m) => m.id === id)?.name ?? id.toUpperCase();
}

export function fmtHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
