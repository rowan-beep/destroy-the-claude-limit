// Logbook analytics: the same career record the logbook keeps, drawn as
// charts so a pilot can see their habits at a glance: where the flight hours
// went, which jet and which weapon actually score, how the last sorties went,
// how they survive missiles and how they fare in duels.
//
// Read-only: it never writes to the logbook, and needs nothing new stored.
// Bars are plain DOM (they reflow with the modal); the sortie history is an
// SVG so the bars and the axis scale together.

import { el } from '../dom';
import { LogbookData, fmtHours, SortieSummary } from '../../game/logbook';
import { AIRCRAFT_TYPES, SPECS } from '../../aircraft/specs';
import { DIFFICULTIES } from '../../ai/skill';
import type { ModeId } from '../../game/mission';
import { fmtTime } from '../../core/math';

const MODE_NAMES: Record<ModeId, string> = {
  free: 'FREE FLIGHT',
  waves: 'WAVES',
  duel: '1v1 DUEL',
  team: '5v5 TEAM',
  ffa: 'FREE-FOR-ALL',
  online: 'ONLINE',
  tutorial: 'TUTORIAL',
  strike: 'STRIKE',
  recon: 'RECON',
  campaign: 'CAMPAIGN',
  spotter: 'SPOTTER',
  ranked: 'RANKED',
};

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : '—');
const jetName = (t: string) => SPECS[t as keyof typeof SPECS]?.shortName.toUpperCase() ?? t;

interface Bar {
  label: string;
  value: number;
  text: string;
  /** colour class: '' (green), 'blue', 'amber', 'red' */
  tone?: string;
}

/** A titled card of horizontal bars, longest first, scaled to the biggest value. */
function barCard(parent: HTMLElement, title: string, bars: Bar[], empty: string, cls = ''): HTMLElement {
  const card = el('div', 'card la-card ' + cls, parent);
  el('h3', '', card, title);
  const rows = bars.filter((b) => b.value > 0).sort((a, b) => b.value - a.value);
  if (rows.length === 0) {
    el('div', 'note', card, empty);
    return card;
  }
  const max = rows[0].value;
  const list = el('div', 'la-bars', card);
  for (const b of rows) {
    el('span', 'la-bl', list, b.label);
    const track = el('span', 'la-track', list);
    const fill = el('i', 'la-fill' + (b.tone ? ' ' + b.tone : ''), track);
    fill.style.width = `${Math.max(2, (b.value / max) * 100)}%`;
    el('span', 'la-bv', list, b.text);
  }
  return card;
}

/** Fill the logbook's ANALYTICS tab. */
export function renderAnalytics(body: HTMLElement, b: LogbookData): void {
  const t = b.totals;
  if (t.sorties === 0) {
    el('div', 'note la-empty', body, 'No sorties yet. Fly a mission and your analytics will appear here: flight time by jet, kill rates, recent form, missile defences and more.');
    return;
  }
  const hours = t.flightSec / 3600;

  // derived figures: rates the plain totals don't show
  const tiles = el('div', 'lb-tiles', body);
  const tile = (k: string, v: string, hint: string) => {
    const d = el('div', 'lb-tile', tiles);
    d.title = hint;
    el('b', '', d, v);
    el('small', '', d, k);
  };
  tile('KILLS / FLIGHT HOUR', hours > 0.01 ? (t.kills / hours).toFixed(1) : '—', 'Aerial victories for every hour airborne.');
  tile('KILLS / SORTIE', (t.kills / t.sorties).toFixed(2), 'Average aerial victories per sortie.');
  tile('AVG SORTIE', fmtTime(Math.round(t.flightSec / t.sorties)), 'Average time airborne per sortie.');
  tile('SURVIVAL RATE', pct(t.sorties - t.losses, t.sorties), 'Sorties that ended without losing the jet.');
  tile('MISSILE HIT RATE', pct(Math.min(t.missileKills ?? 0, t.shots), t.shots), 'Missile kills over missiles fired.');
  tile('GREASER RATE', pct(t.greasers, t.landings), 'Landings graded GREASER: under 300 fpm, on the centreline, in the touchdown zone.');

  const grid = el('div', 'lb-grid', body);

  // recent form, across the whole width
  recentCard(grid, b.recent);

  const flown = AIRCRAFT_TYPES.filter((a) => b.byJet[a].sorties > 0);
  barCard(
    grid,
    'FLIGHT TIME BY AIRCRAFT',
    flown.map((a) => ({
      label: jetName(a),
      value: b.byJet[a].flightSec,
      text: `${fmtHours(b.byJet[a].flightSec)} · ${b.byJet[a].sorties} SORTIE${b.byJet[a].sorties === 1 ? '' : 'S'}`,
      tone: 'blue',
    })),
    'No time in the air yet.',
  );

  // kill rate per jet: only jets with at least ten minutes airborne, or a single lucky kill dominates
  barCard(
    grid,
    'KILLS PER HOUR BY AIRCRAFT',
    flown
      .filter((a) => b.byJet[a].flightSec >= 600)
      .map((a) => {
        const r = b.byJet[a];
        const kph = r.kills / (r.flightSec / 3600);
        const kl = r.losses > 0 ? (r.kills / r.losses).toFixed(1) : r.kills > 0 ? '∞' : '—';
        return { label: jetName(a), value: kph, text: `${kph.toFixed(1)} · K/L ${kl}` };
      }),
    'Fly a jet for at least ten minutes and score a kill to see its kill rate.',
  );

  const kills = Object.values(b.killsBy).reduce((s, n) => s + n, 0);
  barCard(
    grid,
    'KILLS BY WEAPON',
    Object.entries(b.killsBy).map(([w, n]) => ({ label: w, value: n, text: `${n} · ${pct(n, kills)}` })),
    'No kills yet.',
  );

  barCard(
    grid,
    'AIRCRAFT SHOT DOWN',
    AIRCRAFT_TYPES.map((a) => ({ label: jetName(a), value: b.killsOf[a] ?? 0, text: String(b.killsOf[a] ?? 0), tone: 'amber' })),
    'No kills yet.',
  );

  const defeated = Object.values(b.missilesDefeated).reduce((s, n) => s + n, 0);
  barCard(
    grid,
    'HOW YOU BEAT MISSILES',
    Object.entries(b.missilesDefeated).map(([r, n]) => ({ label: r, value: n, text: `${n} · ${pct(n, defeated)}`, tone: 'blue' })),
    'No missiles defeated yet: beam, notch, flare, chaff, or put a mountain in the way.',
  );

  // modes, from the recent sorties (the only place the logbook keeps the mode)
  const byMode = new Map<ModeId, { n: number; sec: number }>();
  for (const s of b.recent) {
    const m = byMode.get(s.mode) ?? { n: 0, sec: 0 };
    m.n++;
    m.sec += s.durationSec;
    byMode.set(s.mode, m);
  }
  barCard(
    grid,
    `MODES FLOWN (LAST ${b.recent.length})`,
    [...byMode].map(([m, v]) => ({ label: MODE_NAMES[m] ?? m.toUpperCase(), value: v.n, text: `${v.n} · ${Math.max(1, Math.round(v.sec / 60))} MIN` })),
    'No recent sorties.',
  );

  duelCard(grid, b);
}

/** Last sorties, oldest on the left: missiles fired behind, kills in front
 *  (a sortie can have more kills than missiles: gun kills). */
function recentCard(parent: HTMLElement, recent: SortieSummary[]): void {
  const card = el('div', 'card la-card lb-wide', parent);
  const head = el('div', 'la-head', card);
  el('h3', '', head, `RECENT FORM (LAST ${recent.length} SORTIES)`);
  const key = el('div', 'la-key', head);
  el('span', 'k-kill', key, 'KILLS');
  el('span', 'k-shot', key, 'MISSILES FIRED');
  if (recent.length === 0) {
    el('div', 'note', card, 'No recent sorties.');
    return;
  }
  const list = [...recent].reverse();
  const W = 1000;
  const H = 170;
  const L = 34; // room for the axis numbers
  const T = 8;
  const B = 22; // room for the sortie numbers
  const ph = H - T - B;
  const top = Math.max(2, ...list.map((s) => Math.max(s.kills, s.shots)));
  // a round axis top: steps of 1, 2, 5, 10 ...
  const step = [1, 2, 5, 10, 20, 50].find((s) => top / s <= 4) ?? 100;
  const yMax = Math.ceil(top / step) * step;
  const y = (v: number) => T + ph - (v / yMax) * ph;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'la-svg', role: 'img', 'aria-label': 'Kills and missiles fired in recent sorties' }, card);
  for (let v = 0; v <= yMax; v += step) {
    svg('line', { x1: L, x2: W, y1: y(v), y2: y(v), class: v === 0 ? 'la-axis' : 'la-grid' }, root);
    svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'la-tick' }, root).textContent = String(v);
  }
  const slot = (W - L) / Math.max(list.length, 8);
  const bw = Math.min(slot * 0.62, 34);
  list.forEach((s, i) => {
    const cx = L + slot * (i + 0.5);
    const g = svg('g', {}, root);
    svg('title', {}, g).textContent = `${s.date} · ${MODE_NAMES[s.mode] ?? s.mode}${s.detail ? ' · ' + s.detail : ''} · ${jetName(s.jet)}\n${s.result} · ${s.kills} kill${s.kills === 1 ? '' : 's'}, ${s.shots} missile${s.shots === 1 ? '' : 's'} fired · ${fmtTime(s.durationSec)}`;
    // a full-height hit area so the tooltip works on sorties with nothing to show
    svg('rect', { x: cx - slot / 2, y: T, width: slot, height: ph, class: 'la-hit' }, g);
    if (s.shots > 0) svg('rect', { x: cx - bw / 2, y: y(s.shots), width: bw, height: y(0) - y(s.shots), class: 'la-shot' }, g);
    if (s.kills > 0) svg('rect', { x: cx - bw * 0.3, y: y(s.kills), width: bw * 0.6, height: y(0) - y(s.kills), class: 'la-kill' }, g);
    svg('text', { x: cx, y: H - 6, 'text-anchor': 'middle', class: 'la-tick' }, g).textContent = String(i + 1);
  });
  el('div', 'note', card, 'Oldest on the left, newest on the right. Hover a sortie for its details.');
}

/** Duel results per difficulty as one stacked bar each: wins, draws, losses. */
function duelCard(parent: HTMLElement, b: LogbookData): void {
  const card = el('div', 'card la-card', parent);
  el('h3', '', card, '1v1 DUEL WIN RATE');
  const played = DIFFICULTIES.filter((d) => {
    const r = b.duel[d];
    return r.wins + r.losses + r.draws > 0;
  });
  if (played.length === 0) {
    el('div', 'note', card, 'No duels flown yet.');
    return;
  }
  const list = el('div', 'la-bars', card);
  for (const d of played) {
    const r = b.duel[d];
    const n = r.wins + r.losses + r.draws;
    el('span', 'la-bl', list, d);
    const track = el('span', 'la-track la-stack', list);
    for (const [v, tone] of [
      [r.wins, ''],
      [r.draws, 'grey'],
      [r.losses, 'red'],
    ] as const) {
      if (v > 0) el('i', 'la-fill ' + tone, track).style.width = `${(v / n) * 100}%`;
    }
    el('span', 'la-bv', list, `${pct(r.wins, n)} · ${r.wins}-${r.losses}${r.draws ? `-${r.draws}` : ''}`);
  }
}
