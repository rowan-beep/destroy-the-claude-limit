// The match director for a room inside the artifact: the same LAST PILOT
// STANDING flow the game server runs (waiting -> countdown -> drop-in ->
// combat -> results, the shrinking zone, kills and placings), run by one
// pilot's browser for the whole room. Its state travels as one compact
// snapshot (Hd) so every pilot can follow it, and whoever takes over when
// the host leaves carries on from the last one.

import type { ZoneMsg } from './client';

export const DROPIN = 8;
const NM = 1852;
const COUNTDOWN = 15;
const RESULTS = 14;

/** radius (NM), hold (s), shrink into it (s), seconds outside to go down */
const STAGES = [
  { r: 40, hold: 75, shrink: 0, die: 60 },
  { r: 26, hold: 70, shrink: 55, die: 45 },
  { r: 16, hold: 60, shrink: 45, die: 32 },
  { r: 9, hold: 50, shrink: 35, die: 22 },
  { r: 4.5, hold: 45, shrink: 28, die: 14 },
  { r: 3, hold: 120, shrink: 22, die: 14 },
  { r: 0.8, hold: 1e9, shrink: 75, die: 8 },
];

export type MatchState = 'waiting' | 'countdown' | 'live' | 'ended';
type Circle = [number, number, number];

/** The director's state, as every pilot sees it. */
export interface Hd {
  st: MatchState;
  /** countdown / results time left (s) */
  tm: number;
  mid: number;
  /** match time (s) */
  el: number;
  sg: number;
  zp: 'hold' | 'shrink';
  zt: number;
  f: Circle;
  to: Circle;
  nx: Circle | null;
  /** start slots: id -> [angle, ring, tier] */
  sl?: Record<string, [number, number, number]>;
  /** pilots: [id, inMatch, alive, kills, place] */
  pl: [number, number, number, number, number][];
  /** results: [id, name, jet, place, kills, killedBy] */
  rs?: [number, string, string, number, number, string][];
}

export interface DPlayer {
  id: number;
  name: string;
  jet: string;
  inMatch: boolean;
  alive: boolean;
  kills: number;
  place: number;
  killedBy: string;
}

export interface DeadMsg {
  id: number;
  killer: number | null;
  weapon: string;
  cause: string;
  place: number;
  left: number;
}

const round = (c: { x: number; z: number; r: number }): Circle => [Math.round(c.x), Math.round(c.z), Math.round(c.r)];
const circ = (c: Circle) => ({ x: c[0], z: c[1], r: c[2] });

export class Director {
  state: MatchState = 'waiting';
  timer = 0;
  matchId = 0;
  elapsed = 0;
  private stage = 0;
  private zonePhase: 'hold' | 'shrink' = 'hold';
  private zoneT = 0;
  private from = { x: 0, z: 0, r: 0 };
  private to = { x: 0, z: 0, r: 0 };
  private next: { x: number; z: number; r: number } | null = null;
  private slots: Record<string, [number, number, number]> = {};
  private results: Hd['rs'] = undefined;
  readonly players = new Map<number, DPlayer>();
  /** a pilot went down (tell everyone) */
  onDead: ((d: DeadMsg) => void) | null = null;
  /** something changed that everyone should hear now */
  onChange: (() => void) | null = null;

  /** Carry on from a snapshot (the host left; we are the new one). */
  restore(h: Hd, names: Map<number, { name: string; jet: string }>): void {
    this.state = h.st;
    this.timer = h.tm;
    this.matchId = h.mid;
    this.elapsed = h.el;
    this.stage = h.sg;
    this.zonePhase = h.zp;
    this.zoneT = h.zt;
    this.from = circ(h.f);
    this.to = circ(h.to);
    this.next = h.nx ? circ(h.nx) : null;
    this.slots = h.sl ?? {};
    this.results = h.rs;
    for (const [id, inMatch, alive, kills, place] of h.pl) {
      const n = names.get(id);
      if (!n) continue;
      this.players.set(id, { id, name: n.name, jet: n.jet, inMatch: !!inMatch, alive: !!alive, kills, place, killedBy: '' });
    }
  }

  snapshot(): Hd {
    return {
      st: this.state,
      tm: Math.max(0, Math.round(this.timer * 10) / 10),
      mid: this.matchId,
      el: Math.round(this.elapsed * 10) / 10,
      sg: this.stage,
      zp: this.zonePhase,
      zt: Math.round(this.zoneT * 10) / 10,
      f: round(this.from),
      to: round(this.to),
      nx: this.next ? round(this.next) : null,
      sl: this.state === 'live' ? this.slots : undefined,
      pl: [...this.players.values()].map((p) => [p.id, p.inMatch ? 1 : 0, p.alive ? 1 : 0, p.kills, p.place]),
      rs: this.state === 'ended' ? this.results : undefined,
    };
  }

  /** The pilots in the room now: add newcomers, drop the ones who left. */
  sync(list: { id: number; name: string; jet: string }[]): void {
    const ids = new Set(list.map((p) => p.id));
    for (const id of [...this.players.keys()]) {
      if (!ids.has(id)) {
        this.playerDown(id, null, '', 'DISCONNECTED');
        this.players.delete(id);
      }
    }
    for (const p of list) {
      const have = this.players.get(p.id);
      if (have) {
        have.name = p.name;
        have.jet = p.jet;
      } else this.players.set(p.id, { id: p.id, name: p.name, jet: p.jet, inMatch: false, alive: false, kills: 0, place: 0, killedBy: '' });
    }
  }

  update(dt: number): void {
    const n = this.players.size;
    if (this.state === 'waiting') {
      if (n >= 2) {
        this.state = 'countdown';
        this.timer = COUNTDOWN;
        this.onChange?.();
      }
    } else if (this.state === 'countdown') {
      this.timer -= dt;
      if (n < 2) {
        this.state = 'waiting';
        this.onChange?.();
      } else if (this.timer <= 0) this.startMatch();
    } else if (this.state === 'live') {
      this.elapsed += dt;
      this.updateZone(dt);
      const alive = [...this.players.values()].filter((p) => p.inMatch && p.alive);
      if (alive.length <= 1) this.endMatch(alive[0] ?? null);
    } else if (this.state === 'ended') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = n >= 2 ? 'countdown' : 'waiting';
        this.timer = COUNTDOWN;
        for (const p of this.players.values()) p.inMatch = false;
        this.onChange?.();
      }
    }
  }

  /** Admin: start now (needs two pilots). */
  forceStart(): string {
    if (this.players.size < 2) return 'a match needs 2 pilots';
    if (this.state === 'live') return 'a match is already on';
    this.startMatch();
    return '';
  }

  /** Admin: end the match; the pilot alive with the most kills wins. */
  forceEnd(): string {
    if (this.state !== 'live') return 'no match running';
    const alive = [...this.players.values()].filter((p) => p.inMatch && p.alive).sort((a, b) => b.kills - a.kills);
    this.endMatch(alive[0] ?? null);
    return '';
  }

  private startMatch(): void {
    const list = [...this.players.values()];
    this.matchId++;
    this.state = 'live';
    this.elapsed = 0;
    this.results = undefined;
    const n = list.length;
    // fewer pilots start in a smaller circle, so nobody flies for minutes to find a fight
    this.stage = n <= 3 ? 2 : n <= 6 ? 1 : 0;
    this.zonePhase = 'hold';
    this.zoneT = 0;
    const r0 = STAGES[this.stage].r * NM;
    this.from = { x: 0, z: 0, r: r0 };
    this.to = { ...this.from };
    this.pickNext();
    const a0 = Math.random() * Math.PI * 2;
    const shuffled = list.sort(() => Math.random() - 0.5);
    this.slots = {};
    shuffled.forEach((p, i) => {
      p.inMatch = true;
      p.alive = true;
      p.kills = 0;
      p.place = 0;
      p.killedBy = '';
      this.slots[String(p.id)] = [Math.round((a0 + (i / n) * Math.PI * 2) * 1000) / 1000, Math.round(r0 * 0.8), (i % 3) - 1];
    });
    this.onChange?.();
  }

  private endMatch(winner: DPlayer | null): void {
    if (winner) winner.place = 1;
    this.state = 'ended';
    this.timer = RESULTS;
    const ranked = [...this.players.values()].filter((p) => p.inMatch).sort((a, b) => (a.place || 99) - (b.place || 99) || b.kills - a.kills);
    this.results = ranked.map((p) => [p.id, p.name, p.jet, p.place || 1, p.kills, p.killedBy.slice(0, 30)]);
    this.onChange?.();
  }

  private pickNext(): void {
    const next = STAGES[this.stage + 1];
    if (!next) {
      this.next = null;
      return;
    }
    const cur = this.to;
    const nr = next.r * NM;
    const slack = Math.max(0, cur.r - nr) * 0.85;
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * slack;
    this.next = { x: cur.x + Math.sin(a) * d, z: cur.z - Math.cos(a) * d, r: nr };
  }

  private updateZone(dt: number): void {
    this.zoneT += dt;
    const st = STAGES[this.stage];
    if (this.zonePhase === 'hold') {
      if (STAGES[this.stage + 1] && this.zoneT >= st.hold && this.next) {
        this.stage++;
        this.zonePhase = 'shrink';
        this.zoneT = 0;
        this.from = { ...this.to };
        this.to = { ...this.next };
      }
    } else if (this.zoneT >= st.shrink) {
      this.zonePhase = 'hold';
      this.zoneT = 0;
      this.pickNext();
    }
  }

  /** A pilot is down (reported by their own game, or they left). */
  playerDown(id: number, killerId: number | null, weapon: string, cause: string): void {
    const p = this.players.get(id);
    if (this.state !== 'live' || !p || !p.inMatch || !p.alive) return;
    p.alive = false;
    const left = [...this.players.values()].filter((o) => o.inMatch && o.alive).length;
    p.place = left + 1;
    const k = killerId !== null && killerId !== undefined ? this.players.get(killerId) : undefined;
    if (k && k !== p && k.inMatch) {
      k.kills++;
      p.killedBy = `${k.name} · ${weapon.slice(0, 12)}`;
    } else p.killedBy = cause.slice(0, 40);
    this.onDead?.({ id, killer: k && k !== p ? k.id : null, weapon: weapon.slice(0, 12), cause: cause.slice(0, 40), place: p.place, left });
    this.onChange?.();
  }
}

/** The zone message every pilot works out from a snapshot. */
export function zoneFromHd(h: Hd): ZoneMsg {
  const st = STAGES[h.sg] ?? STAGES[0];
  let z = circ(h.to);
  if (h.zp === 'shrink') {
    const k = Math.min(1, h.zt / Math.max(1, st.shrink));
    const s = k * k * (3 - 2 * k);
    const f = circ(h.f), t = circ(h.to);
    z = { x: f.x + (t.x - f.x) * s, z: f.z + (t.z - f.z) * s, r: f.r + (t.r - f.r) * s };
  }
  const next = h.zp === 'shrink' ? circ(h.to) : h.nx ? circ(h.nx) : null;
  const left = h.zp === 'hold' ? (STAGES[h.sg + 1] ? st.hold - h.zt : 0) : st.shrink - h.zt;
  return {
    t: 'zone',
    x: Math.round(z.x),
    z: Math.round(z.z),
    r: Math.round(z.r),
    nx: next ? Math.round(next.x) : Math.round(z.x),
    nz: next ? Math.round(next.z) : Math.round(z.z),
    nr: next ? Math.round(next.r) : 0,
    phase: h.zp,
    stage: h.sg,
    last: h.sg === STAGES.length - 1,
    left: Math.max(0, Math.round(left)),
    die: st.die,
    reveal: h.sg >= 4,
  };
}
