// SPACE EXPLORATION menu: the same command-deck layout as the air-combat menu,
// in blue and black with white trim, over the rocket factory. Its own sections
// and its own (separate) record; the rockets, rovers and missions arrive later.

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

/** the space program's own record, kept apart from the pilot logbook */
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

const DESTINATIONS: [string, string, string, string][] = [
  ['EARTH ORBIT', '400 km up · 90 minutes a lap', 'radial-gradient(circle at 35% 30%, #8fd0ff, #1d5fb8 55%, #0b2350)', 'First stop for every mission.'],
  ['THE MOON', '384,400 km · 3 days out', 'radial-gradient(circle at 35% 30%, #f2f2ee, #9c9c98 55%, #3b3b3a)', 'Land, drive the lunar rover, bring rocks home.'],
  ['MARS', '225 million km · 7 months', 'radial-gradient(circle at 35% 30%, #ffb27a, #c2502a 55%, #4a1a0e)', 'Rovers across the red planet.'],
];

export class SpaceMenu {
  readonly root: HTMLDivElement;
  private section: Section = 'factory';
  private navBtns = new Map<Section, HTMLElement>();
  private titleEl: HTMLElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private pilot: HTMLElement;
  private caption: HTMLElement;
  private launchInfo: HTMLElement;

  constructor(parent: HTMLElement, private cb: SpaceMenuCallbacks) {
    this.root = el('div', 'screen menu-root mm sx hidden', parent);
    try {
      const s = localStorage.getItem(SEC_KEY) as Section | null;
      if (s === 'missions' || s === 'factory' || s === 'destinations') this.section = s;
    } catch {
      /* default section */
    }

    const rail = el('nav', 'mm-rail mm-block', this.root);
    programLogo(rail, 'space', 'SPACE EXPLORATION', (p) => cb.onProgram(p));
    const nav = el('div', 'mm-nav', rail);
    const sec = (id: Section, n: string, label: string, sub: string) => {
      const b = el('button', 'mm-nav-item', nav);
      el('span', 'mm-nav-n', b, n);
      const t = el('span', 'mm-nav-t', b);
      el('span', 'mm-nav-l', t, label);
      el('span', 'mm-nav-s', t, sub);
      b.addEventListener('click', () => this.go(id));
      this.navBtns.set(id, b);
    };
    sec('missions', '01', 'MISSIONS', 'Where you are going');
    sec('factory', '02', 'LAUNCH PAD', 'Rockets & vehicles');
    sec('destinations', '03', 'DESTINATIONS', 'Orbit, the Moon, Mars');
    el('div', 'mm-nav-div', nav);
    const soon = (label: string, sub: string) => {
      const b = el('button', 'mm-nav-item mm-nav-act', nav);
      b.disabled = true;
      b.style.opacity = '0.55';
      b.style.cursor = 'default';
      el('span', 'mm-nav-n', b, '›');
      const t = el('span', 'mm-nav-t', b);
      el('span', 'mm-nav-l', t, label);
      el('span', 'mm-nav-s', t, sub);
    };
    soon('ROCKET LIBRARY', 'Coming soon');
    soon('ROVERS', 'Moon and Mars · coming soon');
    const foot = el('div', 'mm-rail-foot', rail);
    button('SETTINGS', 'mm-foot-btn', foot, () => cb.onSettings());
    button('CONTROLS', 'mm-foot-btn', foot, () => cb.onControls());
    const ver = button(`v${VERSION}`, 'mm-foot-btn', foot, () => {});
    ver.style.gridColumn = '1 / span 2';
    ver.style.cursor = 'default';

    this.titleEl = el('div', 'mm-title', this.root);
    this.pilot = el('div', 'mm-pilot mm-block', this.root);
    this.left = el('div', 'mm-panel mm-left mm-block', this.root);
    this.right = el('div', 'mm-panel mm-right mm-block', this.root);
    this.caption = el('div', 'mm-caption', this.root);
    const launch = el('div', 'mm-launch mm-block', this.root);
    this.launchInfo = el('div', 'mm-launch-info', launch);
    const lb = el('button', 'mm-launch-btn locked', launch);
    lb.disabled = true;
    el('span', 'mm-launch-l', lb, 'LAUNCH');
    el('span', 'mm-launch-a', lb, '▸');
    el('div', 'hangar-hint mm-hint', this.root, 'DRAG TO LOOK AROUND · SCROLL TO ZOOM · DOUBLE-CLICK TO RESET');
    this.go(this.section);
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (v) this.renderPilot();
  }

  private go(s: Section): void {
    this.section = s;
    try {
      localStorage.setItem(SEC_KEY, s);
    } catch {
      /* ignore */
    }
    for (const [k, b] of this.navBtns) b.classList.toggle('on', k === s);
    this.render();
  }

  private render(): void {
    const titles: Record<Section, [string, string, string]> = {
      missions: ['01', 'MISSIONS', 'Pick where the program goes next.'],
      factory: ['02', 'LAUNCH PAD', 'Where the rockets stand.'],
      destinations: ['03', 'DESTINATIONS', 'From low orbit to the red planet.'],
    };
    const [n, t, sub] = titles[this.section];
    clearEl(this.titleEl);
    el('div', 'mm-title-n', this.titleEl, n);
    const tt = el('div', 'mm-title-t', this.titleEl);
    el('div', 'mm-title-l', tt, t);
    el('div', 'mm-title-s', tt, sub);
    clearEl(this.left);
    clearEl(this.right);
    if (this.section === 'missions') this.renderMissions();
    else if (this.section === 'factory') this.renderFactory();
    else this.renderDestinations();
    // the launch bar: nothing to launch until a rocket rolls out of the factory
    clearEl(this.launchInfo);
    const row = (k: string, v: string) => {
      const r = el('div', 'mm-li', this.launchInfo);
      el('span', 'mm-li-k', r, k);
      el('span', 'mm-li-v', r, v);
    };
    row('VEHICLE', 'NONE ON THE PAD');
    row('DESTINATION', '—');
    row('STATUS', 'AWAITING VEHICLE');
    clearEl(this.caption);
    el('div', 'mm-cap-k', this.caption, 'LAUNCH COMPLEX · PAD 1');
    el('div', 'mm-cap-n', this.caption, 'AWAITING VEHICLE');
    this.renderPilot();
  }

  private renderPilot(): void {
    const r = loadRecord();
    const cs = (loadNetPrefs().callsign || 'COMMANDER').toUpperCase();
    clearEl(this.pilot);
    const badge = el('div', 'mm-pilot-badge', this.pilot);
    el('div', 'mm-pilot-star', badge, '✦');
    const info = el('div', 'mm-pilot-info', this.pilot);
    el('div', 'mm-pilot-cs', info, cs);
    el('div', 'mm-pilot-rank', info, 'ASTRONAUT CANDIDATE');
    const st = el('div', 'mm-pilot-stats', this.pilot);
    const stat = (v: string, k: string) => {
      const b = el('div', 'mm-stat', st);
      el('div', 'mm-stat-v', b, v);
      el('div', 'mm-stat-k', b, k);
    };
    stat(String(r.missions), 'MISSIONS');
    stat(String(r.launches), 'LAUNCHES');
    stat(String(r.daysInSpace), 'DAYS UP');
    stat(String(r.samples), 'SAMPLES');
  }

  private renderMissions(): void {
    const p = this.left;
    el('div', 'mm-h', p, 'MISSION PROGRAM');
    const list = el('div', 'mm-modes', p);
    const items: [string, string][] = [
      ['ORBITAL FLIGHT', 'Reach orbit and come home'],
      ['LUNAR LANDING', 'Land on the Moon'],
      ['LUNAR ROVER', 'Drive the Moon'],
      ['MARS ROVER', 'Explore the red planet'],
    ];
    items.forEach(([t, s], i) => {
      const r = el('div', 'mm-mode off', list);
      el('div', 'mm-mode-n', r, String(i + 1).padStart(2, '0'));
      const tx = el('div', 'mm-mode-t', r);
      const tl = el('div', 'mm-mode-l', tx, t);
      el('span', 'sx-soon', tl, 'SOON');
      el('div', 'mm-mode-s', tx, s);
    });
    const q = this.right;
    el('div', 'mm-h', q, 'BRIEFING');
    el('div', 'mm-note', q, 'The space program is being built. The first vehicle, the Saturn V, is on its way to the pad; missions open as the rockets and rovers arrive.');
  }

  private renderFactory(): void {
    const p = this.left;
    el('div', 'mm-h', p, 'VEHICLES');
    const slot = el('div', 'sx-slot', p);
    el('div', 'sx-slot-t', slot, 'PAD 1 · EMPTY');
    el('div', 'sx-slot-s', slot, 'The launch mount and tower are ready. The Saturn V will stand here.');
    const slot2 = el('div', 'sx-slot', p);
    slot2.style.opacity = '0.6';
    el('div', 'sx-slot-t', slot2, 'ROVER BAY · EMPTY');
    el('div', 'sx-slot-s', slot2, 'Moon and Mars rovers, later.');
    const q = this.right;
    el('div', 'mm-h', q, 'LAUNCH COMPLEX');
    const kv = (k: string, v: string) => {
      const r = el('div', 'sx-kv', q);
      el('span', '', r, k);
      el('span', '', r, v);
    };
    kv('LAUNCH TOWER', '145 m');
    kv('LAUNCH MOUNT', '20 m deck');
    kv('TANK FARM', '6 + 3 tanks');
    kv('CRAWLER CRANE', '120 m boom');
    kv('VEHICLES', '0');
  }

  private renderDestinations(): void {
    const p = this.left;
    el('div', 'mm-h', p, 'DESTINATIONS');
    const list = el('div', 'mm-modes', p);
    for (const [name, sub, orb, desc] of DESTINATIONS) {
      const r = el('div', 'mm-mode off sx-dest', list);
      el('div', 'sx-orb', r).style.background = orb;
      const t = el('div', 'mm-mode-t', r);
      const tl = el('div', 'mm-mode-l', t, name);
      el('span', 'sx-soon', tl, 'LOCKED');
      el('div', 'mm-mode-s', t, sub);
      el('div', 'mm-mode-d', t, desc);
    }
    const q = this.right;
    el('div', 'mm-h', q, 'GETTING THERE');
    el('div', 'mm-note', q, 'Every destination needs a vehicle on the pad. Orbit first, then the Moon, then Mars.');
  }
}
