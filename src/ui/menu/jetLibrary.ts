// JET LIBRARY: a full-screen section of the menu for browsing every jet.
// A shelf of studio portraits along the bottom (filter and sort it), the
// focused jet large in the hangar behind, and a dossier on the right: the
// real aircraft's story, performance ranked against the whole library,
// weapons and loadouts, sensors, your own record in it, and a head-to-head
// comparison with any other jet. SELECT puts it (and the loadout) in the
// main menu.

import { el, button, clearEl } from '../dom';
import { AIRCRAFT_TYPES, AircraftType, AircraftSpec, SPECS, getSpec } from '../../aircraft/specs';
import { LIBRARY, REGION_NAME, Region } from '../../aircraft/library';
import { MISSILES } from '../../weapons/weaponSpecs';
import { loadLogbook } from '../../game/logbook';
import { loadPaint } from '../../aircraft/models/paint';

type Tab = 'overview' | 'performance' | 'weapons' | 'sensors' | 'compare';
type Filter = 'all' | Region | 'gen5' | 'gen45' | 'carrier' | 'twoseat' | 'tvc' | 'irst';
type Sort = 'name' | 'speed' | 'tw' | 'range' | 'roll' | 'missiles' | 'newest';

interface Metric {
  id: string;
  label: string;
  unit: string;
  /** value for a spec */
  get: (s: AircraftSpec) => number;
  fmt: (v: number) => string;
  /** smaller is better (wing loading) */
  lowBetter?: boolean;
}

/** a typical combat weight: empty + half the internal fuel + missiles */
function combatKg(s: AircraftSpec): number {
  return s.emptyMass + s.internalFuel * 0.5 + 1200;
}

const METRICS: Metric[] = [
  { id: 'speed', label: 'TOP SPEED', unit: '', get: (s) => s.maxMach, fmt: (v) => `MACH ${v.toFixed(2)}` },
  { id: 'tw', label: 'THRUST / WEIGHT', unit: '', get: (s) => (s.engines * s.thrustAb) / (combatKg(s) * 9.81), fmt: (v) => v.toFixed(2) },
  { id: 'wl', label: 'WING LOADING', unit: '', get: (s) => combatKg(s) / s.wingArea, fmt: (v) => `${Math.round(v)} KG/M²`, lowBetter: true },
  { id: 'roll', label: 'ROLL RATE', unit: '', get: (s) => s.rollRate, fmt: (v) => `${Math.round(v)}°/S` },
  { id: 'pitch', label: 'PITCH RATE', unit: '', get: (s) => s.pitchRate, fmt: (v) => `${Math.round(v)}°/S` },
  { id: 'g', label: 'G LIMIT', unit: '', get: (s) => s.gLimit, fmt: (v) => `${v.toFixed(1)} G` },
  { id: 'ceiling', label: 'CEILING', unit: '', get: (s) => s.ceilingFt, fmt: (v) => `${Math.round(v / 1000)},000 FT` },
  { id: 'range', label: 'COMBAT RANGE', unit: '', get: (s) => s.combatRangeNm, fmt: (v) => `${Math.round(v).toLocaleString('en-US')} NM` },
  { id: 'aam', label: 'AIR-TO-AIR MISSILES', unit: '', get: (s) => s.maxAAM, fmt: (v) => String(v) },
  { id: 'radar', label: 'RADAR RANGE', unit: '', get: (s) => s.radar.rangeNm, fmt: (v) => `${v} NM` },
];

const FILTERS: [Filter, string][] = [
  ['all', 'ALL'],
  ['usa', 'USA'],
  ['europe', 'EUROPE'],
  ['russia', 'RUSSIA'],
  ['gen5', '5TH GEN'],
  ['gen45', '4.5 GEN'],
  ['tvc', 'THRUST VECTORING'],
  ['irst', 'IRST'],
  ['carrier', 'CARRIER'],
  ['twoseat', 'TWO-SEAT'],
];

const SORTS: [Sort, string][] = [
  ['name', 'NAME'],
  ['speed', 'TOP SPEED'],
  ['tw', 'THRUST / WEIGHT'],
  ['range', 'RANGE'],
  ['roll', 'AGILITY (ROLL)'],
  ['missiles', 'MISSILES'],
  ['newest', 'NEWEST'],
];

function metric(id: string): Metric {
  return METRICS.find((m) => m.id === id)!;
}

/** 0..1 score of a spec on a metric against the whole library (1 = best). */
function score(m: Metric, s: AircraftSpec): number {
  const vals = AIRCRAFT_TYPES.map((t) => m.get(SPECS[t]));
  const v = m.get(s);
  if (m.lowBetter) return Math.min(...vals) / v;
  return v / Math.max(...vals);
}

function rank(m: Metric, s: AircraftSpec): number {
  const v = m.get(s);
  const vals = AIRCRAFT_TYPES.map((t) => m.get(SPECS[t]));
  return 1 + vals.filter((x) => (m.lowBetter ? x < v : x > v)).length;
}

function year(d: string): number {
  const m = d.match(/(\d{4})/);
  return m ? +m[1] : 0;
}

export interface LibraryCallbacks {
  /** SELECT: make this jet (and loadout) the menu's choice */
  onSelect: (t: AircraftType, loadoutId: string) => void;
  /** show a jet in the hangar behind the library */
  onPreview: (t: AircraftType, loadoutId: string) => void;
  onCustomize: (t: AircraftType) => void;
  onClose: () => void;
  /** studio portrait of a jet (image URL, '' if unavailable) */
  thumbnail: (t: AircraftType) => string;
}

export class JetLibrary {
  readonly root: HTMLDivElement;
  private shelf: HTMLElement;
  private panel: HTMLElement;
  private hero: HTMLElement;
  private chips: HTMLElement;
  private sortSel: HTMLSelectElement;
  private countEl: HTMLElement;
  private focus: AircraftType = 'F15EX';
  private current: AircraftType = 'F15EX';
  private tab: Tab = 'overview';
  private filter: Filter = 'all';
  private sort: Sort = 'name';
  private versus: AircraftType | null = null;
  private loadouts: Partial<Record<AircraftType, string>> = {};
  private thumbs = new Map<string, string>();
  private thumbQueue: AircraftType[] = [];

  constructor(
    parent: HTMLElement,
    private cb: LibraryCallbacks,
  ) {
    this.root = el('div', 'library hidden', parent);
    const top = el('div', 'lib-top', this.root);
    button('◂ BACK', 'lib-back', top, () => this.close());
    const tt = el('div', 'lib-title', top);
    el('div', 'lt', tt, 'JET LIBRARY');
    this.countEl = el('div', 'ls', tt, '');
    this.chips = el('div', 'lib-chips', top);
    const sw = el('label', 'lib-sort', top, 'SORT');
    this.sortSel = el('select', '', sw);
    for (const [v, t] of SORTS) {
      const o = el('option', '', this.sortSel, t);
      o.value = v;
    }
    this.sortSel.addEventListener('change', () => {
      this.sort = this.sortSel.value as Sort;
      this.renderShelf();
    });
    this.hero = el('div', 'lib-hero', this.root);
    this.panel = el('div', 'lib-panel', this.root);
    this.shelf = el('div', 'lib-shelf', this.root);
    el('div', 'hangar-hint lib-hint', this.root, 'DRAG TO LOOK AROUND · SCROLL TO ZOOM');
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape') this.close();
      else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        const list = this.visible();
        const i = list.indexOf(this.focus);
        const n = list[(i + (e.code === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
        if (n) this.setFocus(n);
      }
    });
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(current: AircraftType, loadoutId: string): void {
    this.current = current;
    this.loadouts[current] = loadoutId;
    this.root.classList.remove('hidden');
    this.focus = current;
    this.versus = null;
    this.renderChips();
    this.renderShelf();
    this.renderFocus();
    // portraits render one per frame so opening stays instant
    this.thumbQueue = AIRCRAFT_TYPES.filter((t) => !this.thumbs.has(this.thumbKey(t)));
    this.pumpThumbs();
  }

  close(): void {
    this.root.classList.add('hidden');
    this.cb.onClose();
  }

  private thumbKey(t: AircraftType): string {
    return t + JSON.stringify(loadPaint(t));
  }

  private pumpThumbs(): void {
    const t = this.thumbQueue.shift();
    if (!t || !this.open) return;
    requestAnimationFrame(() => {
      const url = this.cb.thumbnail(t);
      if (url) {
        this.thumbs.set(this.thumbKey(t), url);
        const img = this.shelf.querySelector(`[data-jet="${t}"] img`) as HTMLImageElement | null;
        if (img) {
          img.src = url;
          img.classList.add('in');
        }
        if (t === this.focus) this.renderHero();
      }
      this.pumpThumbs();
    });
  }

  private loadoutOf(t: AircraftType): string {
    const s = getSpec(t);
    const id = this.loadouts[t];
    return id && s.loadouts.some((l) => l.id === id) ? id : s.loadouts[0].id;
  }

  private matches(t: AircraftType): boolean {
    const s = SPECS[t];
    const L = LIBRARY[t];
    switch (this.filter) {
      case 'all':
        return true;
      case 'usa':
      case 'europe':
      case 'russia':
        return L.region === this.filter;
      case 'gen5':
        return L.generation === '5';
      case 'gen45':
        return L.generation !== '5';
      case 'carrier':
        return L.carrier;
      case 'twoseat':
        return s.crew >= 2;
      case 'tvc':
        return s.tvcDeg > 0;
      case 'irst':
        return !!s.irst;
    }
  }

  private visible(): AircraftType[] {
    const list = AIRCRAFT_TYPES.filter((t) => this.matches(t));
    const by = (f: (s: AircraftSpec) => number) => list.sort((a, b) => f(SPECS[b]) - f(SPECS[a]));
    switch (this.sort) {
      case 'name':
        list.sort((a, b) => SPECS[a].shortName.localeCompare(SPECS[b].shortName));
        break;
      case 'speed':
        by((s) => s.maxMach);
        break;
      case 'tw':
        by((s) => metric('tw').get(s));
        break;
      case 'range':
        by((s) => s.combatRangeNm);
        break;
      case 'roll':
        by((s) => s.rollRate);
        break;
      case 'missiles':
        by((s) => s.maxAAM);
        break;
      case 'newest':
        list.sort((a, b) => year(LIBRARY[b].firstFlight) - year(LIBRARY[a].firstFlight));
        break;
    }
    return list;
  }

  private sortStat(t: AircraftType): string {
    const s = SPECS[t];
    switch (this.sort) {
      case 'speed':
        return `MACH ${s.maxMach}`;
      case 'tw':
        return `T/W ${metric('tw').fmt(metric('tw').get(s))}`;
      case 'range':
        return `${s.combatRangeNm.toLocaleString('en-US')} NM`;
      case 'roll':
        return `${s.rollRate}°/S ROLL`;
      case 'missiles':
        return `${s.maxAAM} MISSILES`;
      case 'newest':
        return `FIRST FLEW ${year(LIBRARY[t].firstFlight)}`;
      default:
        return `${LIBRARY[t].generation} GEN · ${REGION_NAME[LIBRARY[t].region]}`;
    }
  }

  private renderChips(): void {
    clearEl(this.chips);
    for (const [f, label] of FILTERS) {
      const n = AIRCRAFT_TYPES.filter((t) => {
        const keep = this.filter;
        this.filter = f;
        const r = this.matches(t);
        this.filter = keep;
        return r;
      }).length;
      if (n === 0) continue;
      const b = button(`${label} ${n}`, 'lib-chip' + (f === this.filter ? ' on' : ''), this.chips, () => {
        this.filter = f;
        this.renderChips();
        this.renderShelf();
      });
      b.title = `${n} jet${n === 1 ? '' : 's'}`;
    }
  }

  private renderShelf(): void {
    clearEl(this.shelf);
    const list = this.visible();
    const nations = new Set(AIRCRAFT_TYPES.map((t) => LIBRARY[t].region)).size;
    this.countEl.textContent = `${AIRCRAFT_TYPES.length} AIRCRAFT · ${nations} REGIONS · SHOWING ${list.length}`;
    list.forEach((t, i) => {
      const s = SPECS[t];
      const L = LIBRARY[t];
      const c = el('div', 'lib-card' + (t === this.focus ? ' focus' : '') + (t === this.current ? ' current' : ''), this.shelf);
      c.dataset.jet = t;
      const pic = el('div', 'lc-pic', c);
      const img = el('img', '', pic);
      img.alt = s.shortName;
      const url = this.thumbs.get(this.thumbKey(t));
      if (url) {
        img.src = url;
        img.classList.add('in');
      }
      el('div', 'lc-idx', pic, String(i + 1).padStart(2, '0'));
      if (t === this.current) el('div', 'lc-cur', pic, 'IN YOUR HANGAR');
      const flag = el('div', 'lc-flag' + (L.flagH ? ' h' : ''), c);
      for (const col of L.flag) el('span', '', flag).style.background = col;
      el('div', 'lc-name', c, s.shortName.toUpperCase());
      el('div', 'lc-nick', c, `“${L.nickname.toUpperCase()}”`);
      el('div', 'lc-stat', c, this.sortStat(t));
      c.addEventListener('click', () => this.setFocus(t));
    });
    if (!list.length) el('div', 'lib-empty', this.shelf, 'No jets match this filter.');
  }

  private setFocus(t: AircraftType): void {
    if (this.versus === t) this.versus = null;
    this.focus = t;
    for (const c of this.shelf.querySelectorAll('.lib-card')) c.classList.toggle('focus', (c as HTMLElement).dataset.jet === t);
    (this.shelf.querySelector(`[data-jet="${t}"]`) as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    this.renderFocus();
  }

  private renderFocus(): void {
    this.cb.onPreview(this.focus, this.loadoutOf(this.focus));
    this.renderHero();
    this.renderPanel();
  }

  /** big type name top-left, over the hangar */
  private renderHero(): void {
    const t = this.focus;
    const s = SPECS[t];
    const L = LIBRARY[t];
    clearEl(this.hero);
    el('div', 'lh-kicker', this.hero, `${L.manufacturer.toUpperCase()} · ${L.nation.toUpperCase()}`);
    el('div', 'lh-name', this.hero, s.shortName.toUpperCase());
    el('div', 'lh-full', this.hero, s.name.includes(L.nickname) ? s.name : `${s.name} “${L.nickname}”`);
    el('div', 'lh-role', this.hero, s.role);
    const q = el('div', 'lh-quick', this.hero);
    const quick: [string, string][] = [
      ['GEN', L.generation],
      ['CREW', String(s.crew)],
      ['MACH', String(s.maxMach)],
      ['T/W', metric('tw').fmt(metric('tw').get(s))],
      ['AAM', String(s.maxAAM)],
    ];
    for (const [k, v] of quick) {
      const b = el('div', 'lq', q);
      el('div', 'lqv', b, v);
      el('div', 'lqk', b, k);
    }
  }

  private renderPanel(): void {
    const t = this.focus;
    const s = SPECS[t];
    const L = LIBRARY[t];
    const p = this.panel;
    clearEl(p);
    const head = el('div', 'lp-head', p);
    const flag = el('div', 'lp-flag', head);
    if (L.flagH) flag.classList.add('h');
    for (const col of L.flag) el('span', '', flag).style.background = col;
    el('div', 'lp-gen', head, L.generation === '5' ? '5TH GENERATION' : L.generation === '4' ? '4TH GENERATION' : '4.5 GENERATION');
    if (L.carrier) el('div', 'lp-gen', head, 'CARRIER');
    if (s.tvcDeg > 0) el('div', 'lp-gen', head, `TVC ${s.tvcDeg}°`);
    const tabs = el('div', 'lp-tabs', p);
    const names: [Tab, string][] = [
      ['overview', 'OVERVIEW'],
      ['performance', 'PERFORMANCE'],
      ['weapons', 'WEAPONS'],
      ['sensors', 'SENSORS'],
      ['compare', 'COMPARE'],
    ];
    for (const [id, label] of names) {
      button(label, 'lp-tab' + (id === this.tab ? ' on' : ''), tabs, () => {
        this.tab = id;
        this.renderPanel();
      });
    }
    const body = el('div', 'lp-body', p);
    if (this.tab === 'overview') this.overview(body, t);
    else if (this.tab === 'performance') this.performance(body, t);
    else if (this.tab === 'weapons') this.weapons(body, t);
    else if (this.tab === 'sensors') this.sensors(body, t);
    else this.compare(body, t);
    const foot = el('div', 'lp-foot', p);
    button('CUSTOMIZE ▸', '', foot, () => {
      this.root.classList.add('hidden');
      this.cb.onCustomize(t);
    });
    const sel = button(t === this.current ? '✓ SELECTED — BACK TO MENU' : `SELECT ${s.shortName.toUpperCase()}`, 'primary', foot, () => {
      this.current = t;
      this.cb.onSelect(t, this.loadoutOf(t));
      this.close();
    });
    sel.classList.add('lp-select');
    void L;
  }

  private facts(parent: HTMLElement, rows: [string, string][]): void {
    const g = el('div', 'lp-facts', parent);
    for (const [k, v] of rows) {
      const r = el('div', 'lf', g);
      el('div', 'lfk', r, k);
      el('div', 'lfv', r, v);
    }
  }

  private overview(b: HTMLElement, t: AircraftType): void {
    const s = SPECS[t];
    const L = LIBRARY[t];
    el('p', 'lp-text', b, L.history);
    this.facts(b, [
      ['MANUFACTURER', L.manufacturer],
      ['FIRST FLIGHT', L.firstFlight],
      ['IN SERVICE', L.inService],
      ['BUILT', L.built],
      ['OPERATORS', L.operators],
      ['ENGINES', s.engineName],
      ['SIZE', `${s.lengthFt} ft long · ${s.wingspanFt} ft span`],
    ]);
    const cols = el('div', 'lp-pros', b);
    const pro = el('div', 'pro', cols);
    el('div', 'ph', pro, 'STRENGTHS');
    for (const x of L.strengths) el('div', 'pi', pro, x);
    const con = el('div', 'con', cols);
    el('div', 'ph', con, 'WEAKNESSES');
    for (const x of L.weaknesses) el('div', 'pi', con, x);
    el('div', 'lp-sub', b, 'HOW TO FLY IT');
    el('p', 'lp-text', b, L.tactics);
    // your record in this jet
    const rec = loadLogbook().byJet[t];
    el('div', 'lp-sub', b, 'YOUR RECORD');
    if (!rec || rec.sorties === 0) el('p', 'lp-text dim', b, 'You have not flown this jet yet.');
    else {
      const kd = rec.losses ? (rec.kills / rec.losses).toFixed(1) : rec.kills ? '∞' : '0';
      this.facts(b, [
        ['SORTIES', String(rec.sorties)],
        ['FLIGHT TIME', `${Math.floor(rec.flightSec / 3600)} h ${Math.floor((rec.flightSec % 3600) / 60)} min`],
        ['KILLS / LOSSES', `${rec.kills} / ${rec.losses} (K/D ${kd})`],
        ['LANDINGS', `${rec.landings}${rec.greasers ? ` (${rec.greasers} greased)` : ''}`],
      ]);
    }
  }

  private bar(parent: HTMLElement, m: Metric, s: AircraftSpec, other?: AircraftSpec): void {
    const row = el('div', 'lb', parent);
    const top = el('div', 'lbt', row);
    el('span', 'lbl', top, m.label);
    el('span', 'lbv', top, m.fmt(m.get(s)) + (other ? '' : `  #${rank(m, s)}`));
    const track = el('div', 'lbtrack', row);
    const f = el('div', 'lbfill', track);
    f.style.width = `${Math.round(score(m, s) * 100)}%`;
    if (rank(m, s) === 1) f.classList.add('best');
    if (other) {
      const t2 = el('div', 'lbtrack vs', row);
      const f2 = el('div', 'lbfill vs', t2);
      f2.style.width = `${Math.round(score(m, other) * 100)}%`;
      const a = m.get(s), c = m.get(other);
      const d = m.lowBetter ? (c - a) / c : (a - c) / c;
      const pct = Math.round(d * 100);
      const bot = el('div', 'lbt', row);
      el('span', 'lbl vs', bot, `${other.shortName.toUpperCase()} ${m.fmt(c)}`);
      el('span', 'lbd ' + (pct > 0 ? 'up' : pct < 0 ? 'down' : ''), bot, pct === 0 ? 'EVEN' : `${pct > 0 ? '+' : ''}${pct}%`);
    }
  }

  private performance(b: HTMLElement, t: AircraftType): void {
    const s = SPECS[t];
    el('p', 'lp-text dim', b, 'Bars are against the best jet in the library on each line (#1 = best of all six). Thrust-to-weight and wing loading at a typical combat weight.');
    for (const m of METRICS) if (m.id !== 'radar' && m.id !== 'aam') this.bar(b, m, s);
    this.facts(b, [
      ['THRUST (EACH, AB)', `${s.thrustAbLbf.toLocaleString('en-US')} lbf`],
      ['THRUST VECTORING', s.tvcDeg > 0 ? `${s.tvcDeg}° ${t === 'SU35' ? '3D (pitch and yaw)' : '2D (pitch)'}` : 'None'],
      ['G OVERRIDE / STRUCTURE', `${s.gOverride} G / ${s.gStructural} G`],
      ['MAX TAKEOFF WEIGHT', `${s.maxTakeoffLb.toLocaleString('en-US')} lb`],
      ['FLIGHT CONTROL', s.flightControl],
    ]);
  }

  private weapons(b: HTMLElement, t: AircraftType): void {
    const s = SPECS[t];
    const R = MISSILES[s.missiles.radar];
    const I = MISSILES[s.missiles.ir];
    const mi = el('div', 'lp-missiles', b);
    for (const [kind, m] of [
      ['RADAR (FOX 3)', R],
      ['HEAT-SEEKER (FOX 2)', I],
    ] as const) {
      const c = el('div', 'lm', mi);
      el('div', 'lmk', c, kind);
      el('div', 'lmn', c, m.short);
      el('div', 'lmd', c, m.name);
      el('div', 'lmq', c, `${m.maxG} G · ${m.seeker === 'ARH' ? 'active radar' : 'infrared'}${m.sustain ? ' · ramjet' : ''}`);
    }
    this.facts(b, [
      ['CANNON', `${s.gun.name}`],
      ['ROUNDS', String(s.gun.rounds)],
      ['MAX AIR-TO-AIR MISSILES', String(s.maxAAM)],
      ['HARDPOINTS', String(s.hardpoints)],
      ['FLARES / CHAFF', `${s.flares} / ${s.chaff}`],
    ]);
    el('div', 'lp-sub', b, 'LOADOUT — CLICK TO CHOOSE');
    const cur = this.loadoutOf(t);
    const list = el('div', 'lp-loadouts', b);
    for (const l of s.loadouts) {
      const c = el('div', 'll' + (l.id === cur ? ' on' : ''), list);
      el('div', 'lln', c, l.name);
      const counts = new Map<string, number>();
      for (const st of Object.values(l.stores)) counts.set(st, (counts.get(st) ?? 0) + 1);
      el('div', 'llq', c, [...counts].map(([k, n]) => `${n}× ${MISSILES[k as keyof typeof MISSILES]?.short ?? k.replace('TANK', 'FUEL TANK')}`).join(' · ') || 'Clean');
      c.addEventListener('click', () => {
        this.loadouts[t] = l.id;
        this.cb.onPreview(t, l.id);
        this.renderPanel();
      });
    }
  }

  private sensors(b: HTMLElement, t: AircraftType): void {
    const s = SPECS[t];
    this.bar(b, metric('radar'), s);
    this.facts(b, [
      ['RADAR', `${s.radar.name}`],
      ['TYPE', s.radar.kind],
      ['FIELD OF REGARD', `±${s.radar.azLimitDeg}°`],
      ['TRACKS', String(s.radar.maxTracks)],
      ['SCAN TIME', `${s.radar.frameTime.toFixed(1)} s`],
      ['IRST', s.irst ? `${s.irst.name} (${s.irst.rangeNm} NM)` : 'None'],
      ['EW SUITE', s.ew.name],
      ['MISSILE APPROACH WARNING', s.ew.maws ? 'Yes' : 'No'],
      ['AUTO COUNTERMEASURES', s.ew.autoDispense ? 'Yes' : 'No'],
    ]);
    el('p', 'lp-text dim', b, s.irst ? 'The IRST tracks targets by their heat: a lock with it gives the target no radar warning.' : 'No IRST: every lock uses the radar, and the target\'s warning receiver hears it.');
  }

  private compare(b: HTMLElement, t: AircraftType): void {
    const others = AIRCRAFT_TYPES.filter((x) => x !== t);
    if (!this.versus || this.versus === t) this.versus = others[0];
    el('div', 'lp-sub', b, 'COMPARE WITH');
    const row = el('div', 'lp-vs', b);
    for (const o of others) {
      button(SPECS[o].shortName.toUpperCase(), 'lib-chip' + (o === this.versus ? ' on' : ''), row, () => {
        this.versus = o;
        this.renderPanel();
      });
    }
    const s = SPECS[t], v = SPECS[this.versus];
    let wins = 0;
    for (const m of METRICS) {
      const a = m.get(s), c = m.get(v);
      if (m.lowBetter ? a < c : a > c) wins++;
    }
    el('div', 'lp-verdict', b, `${s.shortName.toUpperCase()} WINS ${wins} OF ${METRICS.length} vs ${v.shortName.toUpperCase()}`);
    for (const m of METRICS) this.bar(b, m, s, v);
  }
}
