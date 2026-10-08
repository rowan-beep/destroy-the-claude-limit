// OCEAN menu, over Kestrel Harbor at the berth: the same frame as the space
// program's mission-control menu (top bar, a content panel, the conditions and
// a big round DIVE button) in sea colours. MISSIONS starts or continues the
// expedition and the free survey; HARBOR has the boat, the ocean's own
// settings and the benchmark; CHART is the Echo Atlas: the chart, every
// contact with its bearings and what it has turned out to be, and the evidence.

import { el, clearEl, button } from '../dom';
import { programLogo, Program } from './program';
import { WhatsNewModal } from './whatsNew';
import { menuMusic } from '../../audio/menuMusic';
import { menuStyle, setMenuStyle, renderSimple } from './simpleMenu';
import { loadOceanSettings, saveOceanSettings, PRESETS, type OceanSettings, type OceanPreset } from '../../ocean/perf/presets';
import { WEATHERS } from '../../ocean/world/waves';
import { EchoAtlas } from '../../ocean/atlas/atlas';
import { drawChart, fitView, type ChartView } from '../../ocean/ui/chart';
import { parseCheckpoint, parseCareer, PROGRESS_KEY, CAREER_KEY, MISSION_ID, MISSION_TITLE, STAGES } from '../../ocean/mission/expedition';
import { PULSE_ID, PULSE_PROGRESS_KEY, PULSE_STAGES } from '../../ocean/mission/followup';
import { SURVEY_SUB } from '../../ocean/sub/subPhysics';
import { DEPTH_BANDS } from '../../ocean/world/geo';
import type { BenchResult } from '../../ocean/perf/benchmark';

type Section = 'missions' | 'harbor' | 'chart';

export interface OceanMenuCallbacks {
  onProgram: (p: Program) => void;
  onSettings: () => void;
  onControls: () => void;
  /** start a dive: the expedition (fresh or continued) or a free survey */
  onDive: (mode: 'expedition' | 'free' | 'pulse', resume: boolean) => void;
  /** run the benchmark route on a preset */
  onBenchmark: (preset: OceanPreset) => Promise<BenchResult>;
}

const SEC_KEY = 'triad.ocean.section';
const SECTIONS: [Section, string][] = [
  ['missions', 'MISSIONS'],
  ['harbor', 'HARBOR'],
  ['chart', 'CHART'],
];

const CSS = `
.sx2.oc2 { --a: #7cf0c8; --a2: #d8fff2; --ink: #effcff; --dim: #8fb3bf; --glass: rgba(3, 18, 28, 0.55); --line: rgba(124, 240, 200, 0.2); }
.oc2 .sx2-brand .mm-logo-mark { background: linear-gradient(90deg, #fff, #9ff0d8); -webkit-background-clip: text; background-clip: text; }
.oc2 .sx2-tab-ind { background: linear-gradient(180deg, rgba(124, 240, 200, 0.2), rgba(124, 240, 200, 0.06)); border-color: rgba(124, 240, 200, 0.45); box-shadow: 0 0 18px rgba(124, 240, 200, 0.22); }
.oc2 .sx2-frame::before, .oc2 .sx2-frame::after { border-color: var(--a); filter: drop-shadow(0 0 4px rgba(124, 240, 200, 0.7)); }
.oc2 .sx2-specks i { width: 2px; height: 2px; background: #cfeee6; box-shadow: none; animation-name: oc2-snow; }
@keyframes oc2-snow { 0% { opacity: 0; transform: translateY(-10px); } 30%, 70% { opacity: 0.45; } 100% { opacity: 0; transform: translateY(40px); } }
.oc2-status { font-size: 10px; letter-spacing: 0.16em; padding: 2px 6px; border-radius: 4px; background: rgba(124, 240, 200, 0.16); color: var(--a); }
.oc2-status.done { background: rgba(255, 210, 122, 0.18); color: #ffd27a; }
.oc2-btns { display: flex; gap: 8px; margin: 2px 0 12px 42px; }
.oc2-btn { font: inherit; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; padding: 8px 12px; border-radius: 6px; cursor: pointer; border: 1px solid var(--line); background: rgba(255, 255, 255, 0.04); color: var(--ink); }
.oc2-btn:hover { border-color: var(--a); color: var(--a); }
.oc2-btn.primary { background: var(--a); color: #03221a; border-color: var(--a); }
.oc2-btn.primary:hover { color: #03221a; filter: brightness(1.08); }
.oc2-set { display: grid; grid-template-columns: 1fr auto; gap: 7px 12px; align-items: center; font-size: 12.5px; margin: 6px 0 12px; }
.oc2-set select { font: inherit; font-size: 12px; background: #031620; color: var(--ink); border: 1px solid var(--line); border-radius: 5px; padding: 4px 6px; }
.oc2-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 6px 0 12px; }
.oc2-preset { font: inherit; text-align: left; padding: 9px 9px; border-radius: 7px; cursor: pointer; border: 1px solid var(--line); background: rgba(255, 255, 255, 0.03); color: var(--ink); }
.oc2-preset b { display: block; font-size: 11.5px; letter-spacing: 0.14em; }
.oc2-preset span { display: block; font-size: 10.5px; color: var(--dim); margin-top: 3px; line-height: 1.35; }
.oc2-preset.on { border-color: var(--a); background: rgba(124, 240, 200, 0.1); }
.oc2-chartp { position: absolute; left: 466px; right: 18px; top: 96px; bottom: 96px; padding: 0; overflow: hidden; }
.oc2-chartp canvas { width: 100%; height: 100%; display: block; border-radius: 10px; }
.oc2.chart .sx2-tele, .oc2.chart .sx2-launch { display: none; }
.oc2:not(.chart) .oc2-chartp { display: none; }
.oc2-contact { padding: 10px 12px; margin-bottom: 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.035); border-left: 3px solid #ffd27a; }
.oc2-contact.confirmed { border-left-color: var(--a); }
.oc2-contact b { font-size: 12.5px; letter-spacing: 0.08em; }
.oc2-contact .st { float: right; font-size: 10px; letter-spacing: 0.16em; color: var(--dim); }
.oc2-contact p { margin: 5px 0 0; font-size: 11.5px; color: #cfe5ec; line-height: 1.45; }
.oc2-contact .cap { color: var(--dim); font-style: italic; }
.oc2-ev { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 11.5px; }
.oc2-ev img { width: 92px; height: 52px; object-fit: cover; border-radius: 4px; border: 1px solid var(--line); }
.oc2-ev .k { font-size: 9.5px; letter-spacing: 0.18em; color: var(--a); }
.oc2-ev .t { font-weight: 700; margin-top: 2px; }
.oc2-ev .x { color: var(--dim); margin-top: 2px; line-height: 1.4; }
.oc2-bench { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; font-family: 'Consolas', 'Menlo', monospace; }
.oc2-bench th, .oc2-bench td { text-align: right; padding: 3px 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.oc2-bench th:first-child, .oc2-bench td:first-child { text-align: left; font-family: 'Segoe UI', system-ui, sans-serif; }
.oc2-bench th { color: var(--dim); font-weight: 600; font-size: 10px; letter-spacing: 0.08em; }
.oc2-run { position: fixed; inset: 0; z-index: 60; pointer-events: none; display: none; }
.oc2-run.on { display: block; }
.oc2-run div { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); padding: 8px 16px; border-radius: 8px; background: rgba(3, 18, 28, 0.8); border: 1px solid rgba(124, 240, 200, 0.4); color: #7cf0c8; font: 700 12px 'Segoe UI', system-ui, sans-serif; letter-spacing: 0.2em; }
`;

function readSaved(): { stage: number | null; completed: boolean; unlocked: boolean; pulseStage: number | null; pulseDone: boolean } {
  let raw: string | null = null, car: string | null = null, praw: string | null = null;
  try {
    raw = localStorage.getItem(PROGRESS_KEY);
    car = localStorage.getItem(CAREER_KEY);
    praw = localStorage.getItem(PULSE_PROGRESS_KEY);
  } catch {
    /* none */
  }
  const c = parseCheckpoint(raw);
  const pc = parseCheckpoint(praw, PULSE_ID);
  const career = parseCareer(car);
  return { stage: c ? c.stage : null, completed: career.completed.includes(MISSION_ID), unlocked: career.unlocked.includes('deep-pulse'), pulseStage: pc ? pc.stage : null, pulseDone: career.completed.includes(PULSE_ID) };
}

export class OceanMenu {
  readonly root: HTMLDivElement;
  private section: Section = 'missions';
  private tabs = new Map<Section, HTMLElement>();
  private tabInd: HTMLElement;
  private side: HTMLElement;
  private chartP: HTMLElement;
  private chartCv: HTMLCanvasElement;
  private chartView: ChartView | null = null;
  private clock: HTMLElement;
  private pilot: HTMLElement;
  private tele: HTMLElement;
  private ringL: HTMLElement;
  private ringS: HTMLElement;
  private heroK: HTMLElement;
  private heroT: HTMLElement;
  private timer = 0;
  private musBtn!: HTMLButtonElement;
  private notes: WhatsNewModal;
  private notesTimer = 0;
  private simpleEl: HTMLElement;
  private settings: OceanSettings = loadOceanSettings();
  private bench: BenchResult | null = null;
  private benchRunning = false;
  private runEl: HTMLElement;

  constructor(parent: HTMLElement, private cb: OceanMenuCallbacks) {
    if (!document.getElementById('oc2-css')) {
      const st = document.createElement('style');
      st.id = 'oc2-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = el('div', 'screen menu-root sx2 oc2 hidden', parent);
    try {
      const s = localStorage.getItem(SEC_KEY) as Section | null;
      if (s === 'missions' || s === 'harbor' || s === 'chart') this.section = s;
    } catch {
      /* default */
    }
    el('div', 'sx2-vignette', this.root);
    const specks = el('div', 'sx2-specks', this.root);
    for (let i = 0; i < 30; i++) {
      const p = el('i', '', specks);
      p.style.left = `${Math.random() * 100}%`;
      p.style.top = `${Math.random() * 90}%`;
      p.style.animationDelay = `${-Math.random() * 9}s`;
      p.style.animationDuration = `${7 + Math.random() * 7}s`;
    }
    // --- top bar
    const top = el('div', 'sx2-top sx2-block sx2-in', this.root);
    top.style.setProperty('--d', '0s');
    const brand = el('div', 'sx2-brand', top);
    programLogo(brand, 'ocean', 'OCEAN', (p) => cb.onProgram(p));
    const tabs = el('div', 'sx2-tabs', top);
    SECTIONS.forEach(([id, label], i) => {
      const b = el('button', 'sx2-tab', tabs);
      b.type = 'button';
      el('span', 'sx2-tab-n', b, String(i + 1).padStart(2, '0'));
      el('span', 'sx2-tab-l', b, label);
      b.addEventListener('click', () => this.go(id));
      this.tabs.set(id, b);
    });
    this.tabInd = el('div', 'sx2-tab-ind', tabs);
    const right = el('div', 'sx2-top-r', top);
    const mus = (this.musBtn = el('button', 'sx2-music' + (menuMusic.enabled ? ' on' : ''), right) as HTMLButtonElement);
    mus.type = 'button';
    mus.title = 'Music on / off';
    el('span', 'sx2-music-bars', mus).append(...[0, 1, 2, 3].map(() => document.createElement('i')));
    el('span', 'sx2-music-t', mus, 'MUSIC');
    mus.addEventListener('click', () => mus.classList.toggle('on', menuMusic.toggle()));
    this.clock = el('div', 'sx2-clock', right);
    this.pilot = el('div', 'sx2-cmdr', right);
    // --- left content panel
    this.side = el('div', 'sx2-side sx2-block sx2-in sx2-frame', this.root);
    this.side.style.setProperty('--d', '0.12s');
    // --- the chart (CHART only)
    this.chartP = el('div', 'oc2-chartp sx2-block sx2-frame', this.root);
    this.chartCv = el('canvas', '', this.chartP);
    let cd: { x: number; y: number } | null = null;
    this.chartCv.addEventListener('pointerdown', (e) => (cd = { x: e.clientX, y: e.clientY }));
    window.addEventListener('pointermove', (e) => {
      if (!cd || !this.chartView) return;
      this.chartView.cx -= (e.clientX - cd.x) / this.chartView.k;
      this.chartView.cz -= (e.clientY - cd.y) / this.chartView.k;
      cd = { x: e.clientX, y: e.clientY };
      this.drawChart();
    });
    window.addEventListener('pointerup', () => (cd = null));
    this.chartCv.addEventListener(
      'wheel',
      (e) => {
        if (!this.chartView) return;
        e.preventDefault();
        this.chartView.k = Math.max(0.05, Math.min(3, this.chartView.k * Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.002)));
        this.drawChart();
      },
      { passive: false },
    );
    // --- right: conditions and the DIVE ring
    this.tele = el('div', 'sx2-tele sx2-block sx2-in sx2-frame', this.root);
    this.tele.style.setProperty('--d', '0.24s');
    const launch = el('div', 'sx2-launch sx2-block sx2-in sx2-frame', this.root);
    launch.style.setProperty('--d', '0.36s');
    const ring = el('div', 'sx2-ring', launch);
    ring.innerHTML = '<svg viewBox="0 0 120 120"><circle class="r0" cx="60" cy="60" r="54"/><circle class="r1" cx="60" cy="60" r="54"/><circle class="r2" cx="60" cy="60" r="46"/></svg>';
    const lb = el('button', 'sx2-launch-btn', ring);
    lb.type = 'button';
    this.ringL = el('span', 'sx2-lb-l', lb, 'DIVE');
    this.ringS = el('span', 'sx2-lb-s', lb, 'EXPEDITION');
    lb.addEventListener('click', () => {
      const s = readSaved();
      this.cb.onDive('expedition', s.stage !== null);
    });
    const lst = el('div', 'sx2-launch-st', launch);
    for (const [k, v] of [['BOAT', 'SV-1 PETREL'], ['BATTERY', 'CHARGED'], ['LAMPS', 'TESTED'], ['HYDROPHONES', 'READY']]) {
      const r = el('div', 'sx2-st', lst);
      el('i', 'sx2-dot ok', r);
      el('span', 'sx2-k', r, k);
      el('span', 'sx2-v', r, v);
    }
    // --- bottom
    const hero = el('div', 'sx2-hero sx2-in', this.root);
    hero.style.setProperty('--d', '0.5s');
    this.heroK = el('div', 'sx2-hero-k', hero);
    this.heroT = el('div', 'sx2-hero-t', hero);
    const foot = el('div', 'sx2-foot sx2-block sx2-in', this.root);
    foot.style.setProperty('--d', '0.6s');
    button('SETTINGS', 'sx2-fbtn', foot, () => cb.onSettings());
    button('CONTROLS', 'sx2-fbtn', foot, () => cb.onControls());
    this.notes = new WhatsNewModal(document.body, 'ocean');
    button(`v${this.notes.latest} NOTES`, 'sx2-fbtn sx2-notes', foot, () => this.notes.show(true));
    button('SIMPLE MENU', 'sx2-fbtn', foot, () => this.setStyle('simple'));
    this.simpleEl = el('div', 'sm', this.root);
    this.root.classList.toggle('simple', menuStyle('ocean') === 'simple');
    this.renderSimpleMenu();
    this.runEl = el('div', 'oc2-run', document.body);
    el('div', '', this.runEl, 'BENCHMARK RUNNING · ABOUT A MINUTE');
    this.go(this.section, false);
  }

  private setStyle(v: 'current' | 'simple'): void {
    setMenuStyle('ocean', v);
    this.root.classList.toggle('simple', v === 'simple');
    this.renderSimpleMenu();
    if (v === 'current') requestAnimationFrame(() => this.placeIndicator());
  }

  private renderSimpleMenu(): void {
    if (!this.root.classList.contains('simple')) return;
    const cb = this.cb;
    const s = readSaved();
    const tiles = [
      { title: s.stage !== null ? 'CONTINUE THE EXPEDITION' : 'THE SILENT BUOY', sub: s.stage !== null ? `Stage ${s.stage + 1} of ${STAGES.length}` : 'Find what is knocking under the slope', img: '', tag: s.completed ? 'DONE' : undefined, click: () => cb.onDive('expedition', s.stage !== null) },
      ...(s.unlocked ? [{ title: s.pulseStage !== null ? 'CONTINUE THE SLOW PULSE' : 'THE SLOW PULSE', sub: s.pulseStage !== null ? `Stage ${s.pulseStage + 1} of ${PULSE_STAGES.length}` : 'Find what is pulsing in the deep basin', img: '', tag: s.pulseDone ? 'DONE' : undefined, click: () => cb.onDive('pulse', s.pulseStage !== null) }] : []),
      { title: 'FREE SURVEY', sub: 'Leave the harbor: listen, ping, chart', img: '', click: () => cb.onDive('free', false) },
      { title: 'ECHO ATLAS', sub: 'The chart and everything heard', img: '', click: () => {
        this.setStyle('current');
        this.go('chart');
      } },
      { title: 'HARBOR', sub: 'The boat, graphics and the benchmark', img: '', click: () => {
        this.setStyle('current');
        this.go('harbor');
      } },
    ];
    renderSimple(this.simpleEl, {
      program: 'ocean',
      subtitle: 'OCEAN',
      heading: 'WHERE DO YOU WANT TO DIVE?',
      tiles,
      links: [
        ['SETTINGS', () => cb.onSettings()],
        ['CONTROLS', () => cb.onControls()],
        [`v${this.notes.latest} NOTES`, () => this.notes.show(true)],
        [menuMusic.enabled ? 'MUSIC ON' : 'MUSIC OFF', () => {
          menuMusic.toggle();
          this.musBtn.classList.toggle('on', menuMusic.enabled);
          this.renderSimpleMenu();
        }],
      ],
      onProgram: (p) => cb.onProgram(p),
      onFull: () => this.setStyle('current'),
    });
  }

  show(v: boolean): void {
    const was = !this.root.classList.contains('hidden');
    this.root.classList.toggle('hidden', !v);
    menuMusic.want('ocean', v);
    this.musBtn.classList.toggle('on', menuMusic.enabled);
    window.clearInterval(this.timer);
    if (v) {
      this.settings = loadOceanSettings();
      this.renderPilot();
      this.renderTele();
      this.tick();
      this.timer = window.setInterval(() => this.tick(), 1000);
      if (!was) {
        this.root.classList.remove('play');
        void this.root.offsetWidth;
        this.root.classList.add('play');
        this.go(this.section, false);
        this.renderSimpleMenu();
        requestAnimationFrame(() => this.placeIndicator());
        window.clearTimeout(this.notesTimer);
        this.notesTimer = window.setTimeout(() => {
          if (!this.root.classList.contains('hidden')) this.notes.showIfNew();
        }, 1200);
      }
    } else {
      window.clearTimeout(this.notesTimer);
      this.notes.show(false);
    }
  }

  private tick(): void {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    clearEl(this.clock);
    el('span', 'sx2-clock-k', this.clock, 'LOCAL');
    el('span', 'sx2-clock-v', this.clock, `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    el('span', 'sx2-clock-k', this.clock, 'SEA');
    el('span', 'sx2-clock-v', this.clock, WEATHERS[this.settings.weather].label.split(',')[0]);
    // the ring says what a dive would be
    const s = readSaved();
    this.ringL.textContent = 'DIVE';
    this.ringS.textContent = s.stage !== null ? `CONTINUE ${s.stage + 1}/${STAGES.length}` : s.completed ? 'EXPEDITION AGAIN' : 'EXPEDITION';
  }

  private placeIndicator(): void {
    const b = this.tabs.get(this.section);
    if (!b || !b.offsetWidth) return;
    this.tabInd.style.width = `${b.offsetWidth}px`;
    this.tabInd.style.transform = `translateX(${b.offsetLeft - 4}px)`;
  }

  private go(s: Section, animate = true): void {
    this.section = s;
    try {
      localStorage.setItem(SEC_KEY, s);
    } catch {
      /* */
    }
    for (const [k, b] of this.tabs) b.classList.toggle('on', k === s);
    this.placeIndicator();
    requestAnimationFrame(() => this.placeIndicator());
    this.root.classList.toggle('chart', s === 'chart');
    clearEl(this.side);
    if (s === 'missions') this.renderMissions();
    else if (s === 'harbor') this.renderHarbor();
    else this.renderAtlas();
    [...this.side.children].forEach((c, i) => {
      const e = c as HTMLElement;
      e.classList.add('sx2-item');
      e.style.setProperty('--i', String(Math.min(i, 12)));
    });
    if (animate) {
      this.side.classList.remove('swap');
      void this.side.offsetWidth;
      this.side.classList.add('swap');
    }
    const hero: Record<Section, [string, string]> = {
      missions: ['KESTREL HARBOR · SURVEY OFFICE', 'LISTEN TO THE DARK'],
      harbor: ['BERTH 1 · ALONGSIDE', 'SV-1 PETREL'],
      chart: ['ECHO ATLAS', 'WHAT YOU HAVE HEARD'],
    };
    this.heroK.textContent = hero[s][0];
    clearEl(this.heroT);
    [...hero[s][1]].forEach((ch, i) => {
      const sp = el('span', '', this.heroT, ch === ' ' ? '\u00a0' : ch);
      sp.style.animationDelay = `${0.25 + i * 0.03}s`;
    });
    if (s === 'chart') requestAnimationFrame(() => this.drawChart());
  }

  private head(title: string, sub: string): void {
    const h = el('div', 'sx2-sec', this.side);
    el('div', 'sx2-sec-t', h, title);
    el('div', 'sx2-sec-s', h, sub);
  }

  private renderPilot(): void {
    const a = new EchoAtlas();
    const d = a.data;
    clearEl(this.pilot);
    const badge = el('div', 'sx2-badge', this.pilot);
    badge.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/><ellipse cx="20" cy="20" rx="17" ry="6"/><circle class="m" cx="33" cy="15" r="2.4"/></svg>';
    const t = el('div', 'sx2-cmdr-t', this.pilot);
    el('div', 'sx2-cmdr-n', t, 'SURVEY PILOT');
    el('div', 'sx2-cmdr-r', t, 'KESTREL HARBOR');
    const stats = el('div', 'sx2-stats', this.pilot);
    const km = d.tracks.reduce((s, tr) => {
      let L = 0;
      for (let i = 1; i < tr.points.length; i++) L += Math.hypot(tr.points[i][0] - tr.points[i - 1][0], tr.points[i][1] - tr.points[i - 1][1]);
      return s + L;
    }, 0) / 1000;
    for (const [v, k] of [[d.tracks.length, 'DIVES'], [d.contacts.length, 'CONT'], [d.evidence.length, 'EVID'], [km < 10 ? Number(km.toFixed(1)) : Math.round(km), 'KM']] as [number, string][]) {
      const b = el('div', 'sx2-stat', stats);
      el('div', 'sx2-stat-v', b, String(v));
      el('div', 'sx2-stat-k', b, k);
    }
  }

  private renderTele(): void {
    clearEl(this.tele);
    el('div', 'sx2-h', this.tele, 'HARBOR CONDITIONS');
    const w = WEATHERS[this.settings.weather];
    const rows: [string, string, string?][] = [
      ['SEA', w.label],
      ['SWELL', `${(w.amp * 1.4).toFixed(1)} M`],
      ['WIND', `${Math.round(6 + w.wind * 22)} KT`],
      ['SUN', `${w.sunEl}° UP`, w.sunEl < 12 ? 'warm' : undefined],
      ['WATER', 'CLEAR COASTAL · 14 °C'],
      ['GATE', 'OPEN', 'ok'],
    ];
    for (const [k, v, c] of rows) {
      const r = el('div', 'sx2-kv', this.tele);
      el('span', 'sx2-k', r, k);
      el('span', 'sx2-v' + (c ? ' ' + c : ''), r, v);
    }
  }

  // ------------------------------------------------------------------ MISSIONS
  private renderMissions(): void {
    this.head('MISSIONS', 'An expedition, its follow-up, and the open sea.');
    const s = readSaved();
    const card = (n: string, title: string, tag: string, sub: string, lock: string, run: (() => void) | null, status?: [string, boolean]) => {
      const r = el('div', 'sx2-card' + (run ? ' open' : ' locked'), this.side);
      el('div', 'sx2-card-n', r, n);
      const tx = el('div', 'sx2-card-t', r);
      const tl = el('div', 'sx2-card-l', tx, title);
      el('span', 'sx2-tag', tl, tag);
      if (status) el('span', 'oc2-status' + (status[1] ? ' done' : ''), tl, status[0]);
      el('div', 'sx2-card-s', tx, sub);
      el('div', 'sx2-lock', r, lock);
      if (run) r.addEventListener('click', run);
      return r;
    };
    card('01', MISSION_TITLE, 'EXPEDITION', 'A double knock under the slope that nobody can place. Listen for it, take bearings, find it, and bring back what you can.', s.stage !== null ? 'GO ON' : 'DIVE', () => this.cb.onDive('expedition', s.stage !== null), s.stage !== null ? [`STAGE ${s.stage + 1}/${STAGES.length}`, false] : s.completed ? ['COMPLETED', true] : undefined);
    if (s.stage !== null) {
      const b = el('div', 'oc2-btns', this.side);
      button('CONTINUE', 'oc2-btn primary', b, () => this.cb.onDive('expedition', true));
      button('START OVER', 'oc2-btn', b, () => this.cb.onDive('expedition', false));
    }
    card('02', 'FREE SURVEY', 'OPEN SEA', 'Leave the harbor with no task. Listen, ping, chart the reef, the slope and the deep basin. Dock at the berth to finish.', 'DIVE', () => this.cb.onDive('free', false));
    card(
      '03',
      'THE SLOW PULSE',
      'FOLLOW-UP',
      s.unlocked ? "A slow, low pulse from the deep basin, on ORIEL BAY's recorder and the harbor's hydrophone log. Take bearings on it, go down and find what is sending it, and bring back what it knows. Deep work: 280 m and more." : 'Finish the expedition to open this.',
      !s.unlocked ? 'LOCKED' : s.pulseStage !== null ? 'GO ON' : 'DIVE',
      s.unlocked ? () => this.cb.onDive('pulse', s.pulseStage !== null) : null,
      s.pulseStage !== null ? [`STAGE ${s.pulseStage + 1}/${PULSE_STAGES.length}`, false] : s.pulseDone ? ['COMPLETED', true] : undefined,
    );
    if (s.unlocked && s.pulseStage !== null) {
      const b = el('div', 'oc2-btns', this.side);
      button('CONTINUE', 'oc2-btn primary', b, () => this.cb.onDive('pulse', true));
      button('START OVER', 'oc2-btn', b, () => this.cb.onDive('pulse', false));
    }
    el('div', 'sx2-note', this.side, 'Ocean is about listening. Slow down and go quiet (Q) to hear faint sounds; take bearings from two places and they cross where the sound comes from. A ping (P) shows the ground and anything hard, but drowns faint sounds for a few seconds.');
  }

  // ------------------------------------------------------------------ HARBOR
  private renderHarbor(): void {
    this.head('HARBOR', 'The boat at the berth, and how the sea is drawn.');
    const slot = el('div', 'sx2-slot on', this.side);
    el('div', 'sx2-slot-k', slot, 'BERTH 1 · ALONGSIDE');
    el('div', 'sx2-slot-t', slot, SURVEY_SUB.name);
    el('div', 'sx2-slot-s', slot, 'A one-pilot survey submersible: an acrylic bow dome, two stern and two vertical thrusters, LED lamps, a forward-looking sonar with a multibeam under the hull, a hydrophone array and a five-function arm.');
    el('div', 'sx2-scan', slot);
    const grid = el('div', 'sx2-grid', this.side);
    for (const [k, v] of [
      ['LENGTH', `${SURVEY_SUB.length} m`],
      ['MASS', `${(SURVEY_SUB.mass / 1000).toFixed(1)} t`],
      ['TOP SPEED', '2.6 m/s · 5 kn'],
      ['DEPTH RATING', `${DEPTH_BANDS.comfortable} m`],
      ['HULL LIMIT', `${DEPTH_BANDS.limit} m`],
      ['LAMPS', '2 × LED FLOOD'],
    ]) {
      const c = el('div', 'sx2-cell', grid);
      el('div', 'sx2-cell-v', c, v);
      el('div', 'sx2-cell-k', c, k);
    }
    el('div', 'sx2-suit-h', this.side, 'GRAPHICS');
    const pr = el('div', 'oc2-presets', this.side);
    for (const id of ['performance', 'balanced', 'cinematic'] as OceanPreset[]) {
      const d = PRESETS[id];
      const b = el('button', 'oc2-preset' + (this.settings.preset === id ? ' on' : ''), pr) as HTMLButtonElement;
      b.type = 'button';
      el('b', '', b, d.label);
      el('span', '', b, d.blurb);
      b.addEventListener('click', () => {
        this.settings = { ...this.settings, preset: id };
        saveOceanSettings(this.settings);
        pr.querySelectorAll('.oc2-preset').forEach((x) => x.classList.toggle('on', x === b));
      });
    }
    el('div', 'sx2-suit-h', this.side, 'DIVING');
    const set = el('div', 'oc2-set', this.side);
    const sel = <K extends keyof OceanSettings>(label: string, key: K, opts: [OceanSettings[K], string][]) => {
      el('span', '', set, label);
      const s = el('select', '', set) as HTMLSelectElement;
      for (const [v, t] of opts) {
        const o = el('option', '', s, t) as HTMLOptionElement;
        o.value = String(v);
        o.selected = this.settings[key] === v;
      }
      s.addEventListener('change', () => {
        const v = opts.find(([x]) => String(x) === s.value)?.[0];
        if (v === undefined) return;
        this.settings = { ...this.settings, [key]: v };
        saveOceanSettings(this.settings);
        this.renderTele();
      });
    };
    sel('Sea and light', 'weather', [['calm', WEATHERS.calm.label], ['dawn', WEATHERS.dawn.label], ['overcast', WEATHERS.overcast.label]]);
    sel('Guidance', 'guidance', [['markers', 'Markers in view'], ['bearing', 'Compass only'], ['instruments', 'Instruments only']]);
    sel('Battery', 'relaxed', [[false, 'Real drain'], [true, 'Relaxed (no drain)']]);
    sel('Visibility aid', 'visibilityAid', [[false, 'Off'], [true, 'On']]);
    sel('Large HUD', 'largeHud', [[false, 'Off'], [true, 'On']]);
    sel('Reduce motion', 'reduceMotion', [[false, 'Off'], [true, 'On']]);
    sel('Look speed', 'lookSpeed', [[0.6, 'Slow'], [1, 'Normal'], [1.5, 'Fast']]);
    el('div', 'sx2-suit-h', this.side, 'BENCHMARK');
    el('div', 'sx2-note', this.side, 'The same route every time: the harbor at dawn, a rough surface, down through the waterline and back, the reef, the wreck with the lamps on, the deep basin and a spell of listening. About a minute.');
    const b = el('div', 'oc2-btns', this.side);
    b.style.marginLeft = '0';
    const run = button(this.benchRunning ? 'RUNNING…' : `RUN ON ${PRESETS[this.settings.preset].label}`, 'oc2-btn primary', b, () => {
      if (this.benchRunning) return;
      this.benchRunning = true;
      run.textContent = 'RUNNING…';
      this.root.style.visibility = 'hidden';
      this.runEl.classList.add('on');
      void this.cb.onBenchmark(this.settings.preset).then((r) => {
        this.bench = r;
        this.benchRunning = false;
        this.root.style.visibility = '';
        this.runEl.classList.remove('on');
        if (import.meta.env.DEV) Object.assign(window, { __bench: r });
        if (this.section === 'harbor') this.go('harbor', false);
      });
    });
    if (this.bench) this.benchTable(this.bench);
  }

  private benchTable(r: BenchResult): void {
    const t = el('table', 'oc2-bench', this.side);
    const hr = el('tr', '', t);
    for (const h of ['SEGMENT', 'MED', 'P95', 'P99', 'MAX', '>50', 'FPS']) el('th', '', hr, h);
    const row = (label: string, s: { medianMs: number; p95Ms: number; p99Ms: number; maxMs: number; over50: number; avgFps: number }) => {
      const tr = el('tr', '', t);
      el('td', '', tr, label);
      for (const v of [s.medianMs, s.p95Ms, s.p99Ms, s.maxMs]) el('td', '', tr, v.toFixed(1));
      el('td', '', tr, String(s.over50));
      el('td', '', tr, s.avgFps.toFixed(0));
    };
    for (const s of r.segments) row(s.label, s);
    row('WHOLE ROUTE', r.total);
    el('div', 'sx2-note', this.side, `${r.preset.toUpperCase()} · ${r.width} × ${r.height} · frame times in ms (leaving the menu: ${r.warmupMaxMs} ms, not counted) · heap ${r.memory.heapStartMB ?? '?'} → ${r.memory.heapEndMB ?? '?'} MB · ${r.stream.chunkBuilds} sea-bed chunks built, ${r.stream.chunkDisposals} released, slowest ${r.stream.maxChunkMs} ms · ${r.gpu}`);
  }

  // ------------------------------------------------------------------ CHART
  private renderAtlas(): void {
    const a = new EchoAtlas();
    const d = a.data;
    this.head('ECHO ATLAS', 'Everything you have heard, where you heard it, and what it turned out to be.');
    if (!d.contacts.length) el('div', 'sx2-note', this.side, 'Nothing yet. Contacts appear here the first time the hydrophones pick them out of the noise, with every bearing you take on them.');
    for (const c of d.contacts) {
      const e = el('div', 'oc2-contact' + (c.status === 'confirmed' ? ' confirmed' : ''), this.side);
      el('span', 'st', e, c.status.toUpperCase());
      el('b', '', e, c.label);
      el('p', 'cap', e, c.pattern.caption);
      const obs = d.observations.filter((o) => o.contactId === c.id).length;
      el('p', '', e, `${obs} bearing${obs === 1 ? '' : 's'}${c.estimate ? ` · search area ${Math.round(c.estimate.r)} m across` : ''}${c.site ? ` · at ${Math.round(c.site.depth)} m` : ''}`);
      for (const it of c.interpretations) el('p', '', e, it.text);
    }
    if (d.evidence.length) {
      el('div', 'sx2-suit-h', this.side, 'EVIDENCE');
      for (const ev of d.evidence.slice().reverse()) {
        const r = el('div', 'oc2-ev', this.side);
        if (ev.image) {
          const im = el('img', '', r) as HTMLImageElement;
          im.src = ev.image;
          im.alt = ev.title;
        }
        const t = el('div', '', r);
        el('div', 'k', t, ev.kind.toUpperCase());
        el('div', 't', t, ev.title);
        el('div', 'x', t, ev.text);
      }
    }
    if (d.expeditions.length) {
      el('div', 'sx2-suit-h', this.side, 'LOG');
      for (const x of d.expeditions.slice().reverse()) {
        const r = el('div', 'sx2-kv', this.side);
        el('span', 'sx2-k', r, new Date(x.t).toLocaleDateString());
        el('span', 'sx2-v', r, `${Math.round(x.durationS / 60)} min · ${(x.distanceM / 1000).toFixed(1)} km · ${Math.round(x.maxDepth)} m · ${x.bearings} bearings`);
      }
    }
    const b = el('div', 'oc2-btns', this.side);
    b.style.marginLeft = '0';
    const reset = button('CLEAR THE ATLAS', 'oc2-btn', b, () => {
      if (reset.dataset.sure !== '1') {
        reset.dataset.sure = '1';
        reset.textContent = 'CLICK AGAIN TO CLEAR';
        return;
      }
      a.reset();
      this.go('chart', false);
    });
  }

  private drawChart(): void {
    if (this.section !== 'chart') return;
    const W = this.chartCv.clientWidth, H = this.chartCv.clientHeight;
    if (!W || !H) return;
    this.chartView ??= fitView(W, H, -1300, 1300, -500, 3100);
    drawChart(this.chartCv, this.chartView, new EchoAtlas().data, {});
  }
}
