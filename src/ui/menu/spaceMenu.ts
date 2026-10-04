// SPACE EXPLORATION menu: a mission-control interface over the launch site.
// A thin top bar (program switch, section tabs with a sliding indicator, the
// mission clock and the commander), a content panel on the left, telemetry and
// the launch ring on the right, and the pad's status across the bottom. Panels
// rise in one after another when the menu opens and when a section changes.

import { el, clearEl, button } from '../dom';
import { VERSION } from '../../version';
import { loadNetPrefs } from '../../net/servers';
import { programLogo, Program } from './program';

type Section = 'missions' | 'factory' | 'destinations';

export interface SpaceMenuCallbacks {
  onProgram: (p: Program) => void;
  onSettings: () => void;
  onControls: () => void;
}

interface SpaceRecord {
  missions: number;
  launches: number;
  daysInSpace: number;
  samples: number;
}
const REC_KEY = 'triad.space.record';
const SEC_KEY = 'triad.space.section';

function loadRecord(): SpaceRecord {
  const d: SpaceRecord = { missions: 0, launches: 0, daysInSpace: 0, samples: 0 };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(REC_KEY) || '{}') };
  } catch {
    return d;
  }
}

const SECTIONS: [Section, string][] = [
  ['missions', 'MISSIONS'],
  ['factory', 'LAUNCH PAD'],
  ['destinations', 'DESTINATIONS'],
];

const DESTINATIONS: [string, string, string, string][] = [
  ['EARTH ORBIT', '400 KM · 90 MIN / ORBIT', 'radial-gradient(circle at 32% 28%, #bfe6ff, #2b7fd6 45%, #0b2350 75%)', 'First stop for every mission.'],
  ['THE MOON', '384,400 KM · 3 DAYS', 'radial-gradient(circle at 32% 28%, #ffffff, #a9a9a4 45%, #3b3b3a 80%)', 'Land, drive the lunar rover, bring rocks home.'],
  ['MARS', '225 M KM · 7 MONTHS', 'radial-gradient(circle at 32% 28%, #ffd0a8, #c9542b 45%, #4a1a0e 80%)', 'Rovers across the red planet.'],
];

export class SpaceMenu {
  readonly root: HTMLDivElement;
  private section: Section = 'factory';
  private tabs = new Map<Section, HTMLElement>();
  private tabInd: HTMLElement;
  private side: HTMLElement;
  private clock: HTMLElement;
  private commander: HTMLElement;
  private heroK: HTMLElement;
  private heroT: HTMLElement;
  private timer = 0;

  constructor(parent: HTMLElement, private cb: SpaceMenuCallbacks) {
    this.root = el('div', 'screen menu-root sx2 hidden', parent);
    try {
      const s = localStorage.getItem(SEC_KEY) as Section | null;
      if (s === 'missions' || s === 'factory' || s === 'destinations') this.section = s;
    } catch {
      /* default section */
    }
    // a soft vignette and drifting specks of light over the scene
    el('div', 'sx2-vignette', this.root);
    const specks = el('div', 'sx2-specks', this.root);
    for (let i = 0; i < 26; i++) {
      const p = el('i', '', specks);
      p.style.left = `${Math.random() * 100}%`;
      p.style.top = `${Math.random() * 60}%`;
      p.style.animationDelay = `${-Math.random() * 8}s`;
      p.style.animationDuration = `${5 + Math.random() * 6}s`;
    }

    // --- top bar
    const top = el('div', 'sx2-top sx2-block sx2-in', this.root);
    top.style.setProperty('--d', '0s');
    const brand = el('div', 'sx2-brand', top);
    programLogo(brand, 'space', 'SPACE EXPLORATION', (p) => cb.onProgram(p));
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
    this.clock = el('div', 'sx2-clock', right);
    this.commander = el('div', 'sx2-cmdr', right);

    // --- left content panel
    this.side = el('div', 'sx2-side sx2-block sx2-in sx2-frame', this.root);
    this.side.style.setProperty('--d', '0.12s');

    // --- right: telemetry and the launch ring
    const tele = el('div', 'sx2-tele sx2-block sx2-in sx2-frame', this.root);
    tele.style.setProperty('--d', '0.24s');
    el('div', 'sx2-h', tele, 'SITE TELEMETRY');
    const rows: [string, string, string?][] = [
      ['SITE', 'COASTAL COMPLEX · PAD 1'],
      ['LOCAL TIME', 'SUNRISE', 'warm'],
      ['SUN ELEVATION', '+0.3°'],
      ['WIND', '7 KT · NNE'],
      ['SEA STATE', '2 · SLIGHT'],
      ['RANGE', 'CLEAR', 'ok'],
    ];
    for (const [k, v, c] of rows) {
      const r = el('div', 'sx2-kv', tele);
      el('span', 'sx2-k', r, k);
      el('span', 'sx2-v' + (c ? ' ' + c : ''), r, v);
    }
    const launch = el('div', 'sx2-launch sx2-block sx2-in sx2-frame', this.root);
    launch.style.setProperty('--d', '0.36s');
    const ring = el('div', 'sx2-ring', launch);
    ring.innerHTML =
      '<svg viewBox="0 0 120 120"><circle class="r0" cx="60" cy="60" r="54"/><circle class="r1" cx="60" cy="60" r="54"/><circle class="r2" cx="60" cy="60" r="46"/></svg>';
    const lb = el('button', 'sx2-launch-btn', ring);
    lb.disabled = true;
    el('span', 'sx2-lb-l', lb, 'LAUNCH');
    el('span', 'sx2-lb-s', lb, 'NO VEHICLE');
    const lst = el('div', 'sx2-launch-st', launch);
    const st = (k: string, v: string, dot: string) => {
      const r = el('div', 'sx2-st', lst);
      el('i', 'sx2-dot ' + dot, r);
      el('span', 'sx2-k', r, k);
      el('span', 'sx2-v', r, v);
    };
    st('VEHICLE', 'NONE ON PAD', 'off');
    st('PROPELLANT', 'TANK FARM FULL', 'ok');
    st('TOWER', 'READY', 'ok');
    st('WEATHER', 'GO', 'ok');

    // --- bottom: the pad's status, the foot buttons
    const hero = el('div', 'sx2-hero sx2-in', this.root);
    hero.style.setProperty('--d', '0.5s');
    this.heroK = el('div', 'sx2-hero-k', hero);
    this.heroT = el('div', 'sx2-hero-t', hero);
    const foot = el('div', 'sx2-foot sx2-block sx2-in', this.root);
    foot.style.setProperty('--d', '0.6s');
    button('SETTINGS', 'sx2-fbtn', foot, () => cb.onSettings());
    button('CONTROLS', 'sx2-fbtn', foot, () => cb.onControls());
    el('span', 'sx2-ver', foot, `v${VERSION}`);
    el('div', 'sx2-hint', this.root, 'DRAG TO LOOK AROUND · SCROLL TO ZOOM · DOUBLE-CLICK TO RESET');

    this.go(this.section, false);
  }

  show(v: boolean): void {
    const was = !this.root.classList.contains('hidden');
    this.root.classList.toggle('hidden', !v);
    window.clearInterval(this.timer);
    if (v) {
      this.renderCommander();
      this.tick();
      this.timer = window.setInterval(() => this.tick(), 1000);
      if (!was) {
        // replay the entrance
        this.root.classList.remove('play');
        void this.root.offsetWidth;
        this.root.classList.add('play');
        requestAnimationFrame(() => this.placeIndicator());
      }
    }
  }

  private tick(): void {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    clearEl(this.clock);
    el('span', 'sx2-clock-k', this.clock, 'UTC');
    el('span', 'sx2-clock-v', this.clock, `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`);
    el('span', 'sx2-clock-k', this.clock, 'T−');
    el('span', 'sx2-clock-v dim', this.clock, '--:--:--');
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
      /* ignore */
    }
    for (const [k, b] of this.tabs) b.classList.toggle('on', k === s);
    this.placeIndicator();
    requestAnimationFrame(() => this.placeIndicator());
    clearEl(this.side);
    if (s === 'missions') this.renderMissions();
    else if (s === 'factory') this.renderPad();
    else this.renderDestinations();
    // the panel's contents rise in one after another
    [...this.side.children].forEach((c, i) => {
      const e = c as HTMLElement;
      e.classList.add('sx2-item');
      e.style.setProperty('--i', String(i));
    });
    if (animate) {
      this.side.classList.remove('swap');
      void this.side.offsetWidth;
      this.side.classList.add('swap');
    }
    const hero: Record<Section, [string, string]> = {
      missions: ['MISSION PROGRAM', 'CHOOSE YOUR MISSION'],
      factory: ['COASTAL LAUNCH COMPLEX · PAD 1', 'AWAITING VEHICLE'],
      destinations: ['FLIGHT PLANNING', 'ORBIT · MOON · MARS'],
    };
    this.heroK.textContent = hero[s][0];
    clearEl(this.heroT);
    // the title types itself in, letter by letter
    [...hero[s][1]].forEach((ch, i) => {
      const sp = el('span', '', this.heroT, ch === ' ' ? ' ' : ch);
      sp.style.animationDelay = `${0.25 + i * 0.03}s`;
    });
  }

  private renderCommander(): void {
    const r = loadRecord();
    const cs = (loadNetPrefs().callsign || 'COMMANDER').toUpperCase();
    clearEl(this.commander);
    const badge = el('div', 'sx2-badge', this.commander);
    badge.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/><ellipse cx="20" cy="20" rx="17" ry="6"/><circle class="m" cx="33" cy="15" r="2.4"/></svg>';
    const t = el('div', 'sx2-cmdr-t', this.commander);
    el('div', 'sx2-cmdr-n', t, cs);
    el('div', 'sx2-cmdr-r', t, 'ASTRONAUT CANDIDATE');
    const stats = el('div', 'sx2-stats', this.commander);
    for (const [v, k] of [[r.missions, 'MSN'], [r.launches, 'LCH'], [r.daysInSpace, 'DAYS'], [r.samples, 'SMPL']] as [number, string][]) {
      const b = el('div', 'sx2-stat', stats);
      el('div', 'sx2-stat-v', b, String(v));
      el('div', 'sx2-stat-k', b, k);
    }
  }

  private head(title: string, sub: string): void {
    const h = el('div', 'sx2-sec', this.side);
    el('div', 'sx2-sec-t', h, title);
    el('div', 'sx2-sec-s', h, sub);
  }

  private renderMissions(): void {
    this.head('MISSIONS', 'Pick where the program goes next.');
    const items: [string, string, string][] = [
      ['ORBITAL FLIGHT', 'Reach orbit and come home', 'LEO'],
      ['LUNAR LANDING', 'Land on the Moon', 'MOON'],
      ['LUNAR ROVER', 'Drive across the Moon', 'MOON'],
      ['MARS ROVER', 'Explore the red planet', 'MARS'],
    ];
    items.forEach(([t, s, tag], i) => {
      const r = el('div', 'sx2-card locked', this.side);
      el('div', 'sx2-card-n', r, String(i + 1).padStart(2, '0'));
      const tx = el('div', 'sx2-card-t', r);
      const tl = el('div', 'sx2-card-l', tx, t);
      el('span', 'sx2-tag', tl, tag);
      el('div', 'sx2-card-s', tx, s);
      el('div', 'sx2-lock', r, 'SOON');
    });
    el('div', 'sx2-note', this.side, 'The first vehicle, the Saturn V, is on its way to the pad. Missions open as the rockets and rovers arrive.');
  }

  private renderPad(): void {
    this.head('LAUNCH PAD', 'Where the rockets stand.');
    const slot = el('div', 'sx2-slot', this.side);
    el('div', 'sx2-slot-k', slot, 'PAD 1');
    el('div', 'sx2-slot-t', slot, 'EMPTY');
    el('div', 'sx2-slot-s', slot, 'The launch mount and tower are ready. The Saturn V will stand here.');
    el('div', 'sx2-scan', slot);
    const slot2 = el('div', 'sx2-slot dim', this.side);
    el('div', 'sx2-slot-k', slot2, 'ROVER BAY');
    el('div', 'sx2-slot-t', slot2, 'EMPTY');
    el('div', 'sx2-slot-s', slot2, 'Moon and Mars rovers, later.');
    const spec = el('div', 'sx2-spec', this.side);
    for (const [k, v] of [['LAUNCH TOWER', '145 m'], ['LAUNCH MOUNT', '18 m deck'], ['LIGHTNING MASTS', '2 × 194 m'], ['WATER TOWER', '87 m'], ['TANK FARM', '11 tanks'], ['CRAWLER CRANE', '120 m boom']]) {
      const r = el('div', 'sx2-kv', spec);
      el('span', 'sx2-k', r, k);
      el('span', 'sx2-v', r, v);
    }
  }

  private renderDestinations(): void {
    this.head('DESTINATIONS', 'From low orbit to the red planet.');
    for (const [name, sub, orb, desc] of DESTINATIONS) {
      const r = el('div', 'sx2-card locked sx2-dest', this.side);
      el('div', 'sx2-orb', r).style.background = orb;
      const t = el('div', 'sx2-card-t', r);
      el('div', 'sx2-card-l', t, name);
      el('div', 'sx2-card-s mono', t, sub);
      el('div', 'sx2-card-d', t, desc);
      el('div', 'sx2-lock', r, 'LOCKED');
    }
  }
}
