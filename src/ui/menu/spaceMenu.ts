// SPACE EXPLORATION menu: a mission-control interface over the launch site.
// A thin top bar (program switch, section tabs with a sliding indicator, the
// mission clock and the commander), a content panel on the left, telemetry and
// the launch ring on the right, and the pad's status across the bottom. Panels
// rise in one after another when the menu opens and when a section changes.

import { SUITS, loadSuit, saveSuit } from '../../space/suits';
import { SATURN_V } from '../../space/saturnV';
import { loadRecord } from '../../space/record';
import { el, clearEl, button } from '../dom';
import { VERSION } from '../../version';
import { loadNetPrefs } from '../../net/servers';
import { programLogo, Program } from './program';
import { menuMusic } from '../../audio/menuMusic';

type Section = 'missions' | 'factory' | 'destinations';

export interface SpaceMenuCallbacks {
  onProgram: (p: Program) => void;
  onSettings: () => void;
  onControls: () => void;
  /** fly the Saturn V: from the pad, or already in orbit */
  onLaunch: (mode: 'pad' | 'orbit' | 'lunar') => void;
  /** fly Starship from the pad to the ground on Mars */
  onMars: () => void;
  /** a rover mission on Mars (by id) */
  onRover: (id: string) => void;
  onLaunchMission: (id: 'clipper' | 'artemis') => void;
  onExplore: () => void;
}

const SEC_KEY = 'triad.space.section';

const SECTIONS: [Section, string][] = [
  ['missions', 'MISSIONS'],
  ['factory', 'LAUNCH PAD'],
  ['destinations', 'DESTINATIONS'],
];

const DESTINATIONS: [string, string, string, string][] = [
  ['EARTH ORBIT', '400 KM · 90 MIN / ORBIT', 'radial-gradient(circle at 32% 28%, #bfe6ff, #2b7fd6 45%, #0b2350 75%)', 'First stop for every mission.'],
  ['THE MOON', '384,400 KM · 3 DAYS', 'radial-gradient(circle at 32% 28%, #ffffff, #a9a9a4 45%, #3b3b3a 80%)', 'Land, drive the lunar rover, bring rocks home.'],
  ['MARS', '225 M KM · 7 MONTHS', 'radial-gradient(circle at 32% 28%, #ffd0a8, #c9542b 45%, #4a1a0e 80%)', 'Starship lands on the red planet.'],
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
  private musBtn!: HTMLButtonElement;

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
    const mus = (this.musBtn = el('button', 'sx2-music' + (menuMusic.enabled ? ' on' : ''), right) as HTMLButtonElement);
    mus.type = 'button';
    mus.title = 'Music on / off';
    el('span', 'sx2-music-bars', mus).append(...[0, 1, 2, 3].map(() => document.createElement('i')));
    el('span', 'sx2-music-t', mus, 'MUSIC');
    mus.addEventListener('click', () => mus.classList.toggle('on', menuMusic.toggle()));
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
    lb.type = 'button';
    el('span', 'sx2-lb-l', lb, 'LAUNCH');
    el('span', 'sx2-lb-s', lb, 'SATURN V');
    lb.addEventListener('click', () => this.chooseSpawn());
    const lst = el('div', 'sx2-launch-st', launch);
    const st = (k: string, v: string, dot: string) => {
      const r = el('div', 'sx2-st', lst);
      el('i', 'sx2-dot ' + dot, r);
      el('span', 'sx2-k', r, k);
      el('span', 'sx2-v', r, v);
    };
    st('VEHICLE', 'SATURN V', 'ok');
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
    menuMusic.want('space', v);
    this.musBtn.classList.toggle('on', menuMusic.enabled);
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
      factory: ['COASTAL LAUNCH COMPLEX · PAD 1', 'SATURN V'],
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
    for (const [v, k] of [[r.missions, 'MSN'], [r.launches, 'LCH'], [r.daysInSpace < 10 ? Number(r.daysInSpace.toFixed(2)) : Math.round(r.daysInSpace), 'DAYS'], [r.samples, 'SMPL']] as [number, string][]) {
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
    const items: [string, string, string, (() => void) | null, string?][] = [
      ['ORBITAL FLIGHT', 'Saturn V: reach orbit, go to the Moon, land', 'LEO', () => this.chooseSpawn()],
      ['STARSHIP TO MARS', 'Fly Starship from the pad to Mars and land', 'MARS', () => this.cb.onMars()],
      ['FALCON HEAVY · EUROPA CLIPPER', 'Twin booster landings, then the long way round to Jupiter', 'JUPITER', () => this.cb.onLaunchMission('clipper'), 'NEW'],
      ['SLS · ARTEMIS II', 'Four astronauts round the far side of the Moon and home', 'MOON', () => this.cb.onLaunchMission('artemis'), 'NEW'],
      ['SOLAR SYSTEM EXPLORER', 'Fly to any planet or moon at real scale, on the real orbits', 'TOUR', () => this.cb.onExplore(), 'NEW'],
      ['SEVEN MINUTES OF TERROR', 'Mars 2020: entry, parachute, sky crane, then drive Perseverance', 'MARS', () => this.cb.onRover('m2020-edl'), 'NEW'],
      ['JEZERO SAMPLE HUNT', 'Perseverance: core rocks, zap with the laser, fly Ingenuity', 'ROVER', () => this.cb.onRover('m2020-jezero'), 'NEW'],
      ['GALE CRATER', 'Curiosity: drill the lake bed, climb toward Mount Sharp', 'ROVER', () => this.cb.onRover('msl-gale'), 'NEW'],
    ];
    items.forEach(([t, s, tag, run, badge], i) => {
      const open = !!run;
      const r = el('div', 'sx2-card' + (open ? ' open' : ' locked'), this.side);
      el('div', 'sx2-card-n', r, String(i + 1).padStart(2, '0'));
      const tx = el('div', 'sx2-card-t', r);
      const tl = el('div', 'sx2-card-l', tx, t);
      el('span', 'sx2-tag', tl, tag);
      if (badge) el('span', 'sx2-tag', tl, badge).style.background = '#c4532b';
      el('div', 'sx2-card-s', tx, s);
      el('div', 'sx2-lock', r, open ? (tag === 'ROVER' ? 'DRIVE' : 'FLY') : 'SOON');
      if (run) r.addEventListener('click', run);
    });
    el('div', 'sx2-note', this.side, 'Rover missions drive NASA\'s Perseverance and Curiosity on the real ground of their landing sites, at their real top speed (use the time warp).');
  }

  /** pick where the flight starts */
  private chooseSpawn(): void {
    const back = el('div', 'sx2-choice', this.root);
    const box = el('div', 'sx2-choice-box', back);
    el('div', 'sx2-h', box, 'SATURN V · FLIGHT');
    el('div', 'sx2-choice-t', box, 'WHERE DO YOU START?');
    const row = el('div', 'sx2-choice-row', box);
    const opt = (mode: 'pad' | 'orbit' | 'lunar', title: string, sub: string, desc: string) => {
      const b = el('button', 'sx2-opt ' + mode, row) as HTMLButtonElement;
      b.type = 'button';
      el('div', 'sx2-opt-art', b);
      el('div', 'sx2-opt-t', b, title);
      el('div', 'sx2-opt-s', b, sub);
      el('div', 'sx2-opt-d', b, desc);
      b.addEventListener('click', () => {
        back.remove();
        this.cb.onLaunch(mode);
      });
    };
    opt('pad', 'ON THE PAD', 'PAD 1 · T-20 s', 'The full stack on the mount. Press LAUNCH and the autopilot flies you to orbit; from there you can go home, go higher, or go to the Moon.');
    opt('orbit', 'EARTH ORBIT', '185 KM · READY FOR THE MOON', 'The S-IVB and the Apollo spacecraft in a parking orbit, fuelled for the trip. Press GO TO THE MOON, or come home.');
    opt('lunar', 'LUNAR ORBIT', '110 KM ROUND THE MOON', 'The command module docked to the lunar module, circling the Moon. Undock and fly the lander down to the surface.');
    const x = el('button', 'sx2-choice-x', box, 'CANCEL') as HTMLButtonElement;
    x.type = 'button';
    x.addEventListener('click', () => back.remove());
    back.addEventListener('click', (e) => {
      if (e.target === back) back.remove();
    });
  }

  private renderPad(): void {
    const v = SATURN_V;
    const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d });
    this.head('LAUNCH PAD', 'The Saturn V, stacked on Pad 1.');
    const slot = el('div', 'sx2-slot on', this.side);
    el('div', 'sx2-slot-k', slot, 'PAD 1 · ON THE MOUNT');
    el('div', 'sx2-slot-t', slot, 'SATURN V');
    el('div', 'sx2-slot-s', slot, `Three-stage super heavy-lift launch vehicle. ${v.launches} launches, ${v.service}. Swing arms connected, crew access arm at the command module.`);
    el('div', 'sx2-scan', slot);
    // the crew's spacesuit for the moonwalk
    el('div', 'sx2-suit-h', this.side, 'SPACESUIT');
    const suits = el('div', 'sx2-suits', this.side);
    const cur = loadSuit();
    for (const su of SUITS) {
      const b = el('button', 'sx2-suit' + (su.id === cur ? ' on' : ''), suits) as HTMLButtonElement;
      b.type = 'button';
      const art = el('div', 'sx2-suit-art', b);
      art.style.background = su.art;
      el('div', 'sx2-suit-n', b, su.name);
      el('div', 'sx2-suit-s', b, su.sub);
      b.addEventListener('click', () => {
        saveSuit(su.id);
        suits.querySelectorAll('.sx2-suit').forEach((x) => x.classList.toggle('on', x === b));
      });
    }
    const grid = el('div', 'sx2-grid', this.side);
    for (const [k, val] of [
      ['HEIGHT', `${n(v.height, 1)} m`],
      ['DIAMETER', `${n(v.diameter, 1)} m`],
      ['LIFTOFF MASS', `${n(v.liftoffMass / 1000)} t`],
      ['LIFTOFF THRUST', `${n(v.liftoffThrust / 1000, 1)} MN`],
      ['TO LOW ORBIT', `${n(v.payloadLEO / 1000)} t`],
      ['TO THE MOON', `${n(v.payloadTLI / 1000, 1)} t`],
    ]) {
      const c = el('div', 'sx2-cell', grid);
      el('div', 'sx2-cell-v', c, val);
      el('div', 'sx2-cell-k', c, k);
    }
    for (const st of v.stages) {
      const c = el('div', 'sx2-stage', this.side);
      const h = el('div', 'sx2-stage-h', c);
      el('span', 'sx2-stage-id', h, st.id);
      el('span', 'sx2-stage-n', h, `${st.name.toUpperCase()} · ${st.maker}`);
      el('div', 'sx2-stage-r', c, `${st.engines.count} × ${st.engines.name.replace('Rocketdyne ', '')} · ${st.engines.propellants} · ${n(st.thrustVac)} kN vac`);
      el('div', 'sx2-stage-r dim', c, `${n(st.length, 1)} m · ${n(st.grossMass / 1000)} t fuelled · burn ${st.burnTime}`);
    }
    const iu = el('div', 'sx2-stage', this.side);
    const ih = el('div', 'sx2-stage-h', iu);
    el('span', 'sx2-stage-id', ih, 'IU');
    el('span', 'sx2-stage-n', ih, 'INSTRUMENT UNIT · THE BRAIN');
    el('div', 'sx2-stage-r', iu, 'IBM LVDC · 32,768 words · 12,195 instructions/s');
    el('div', 'sx2-stage-r dim', iu, `${n(v.instrumentUnit.mass)} kg · ST-124-M3 inertial platform · ~900 telemetry channels`);
    const slot2 = el('div', 'sx2-slot dim', this.side);
    el('div', 'sx2-slot-k', slot2, 'PAD 2 · MARS');
    el('div', 'sx2-slot-t', slot2, 'STARSHIP');
    el('div', 'sx2-slot-s', slot2, 'Super Heavy and Starship: 124 m, 33 + 6 Raptors. Click to fly to Mars.');
    slot2.style.cursor = 'pointer';
    slot2.addEventListener('click', () => this.cb.onMars());
    const spec = el('div', 'sx2-spec', this.side);
    for (const [k, val] of [['LAUNCH TOWER', '145 m'], ['LIGHTNING MASTS', '2 × 194 m'], ['TANK FARM', '11 tanks']]) {
      const r = el('div', 'sx2-kv', spec);
      el('span', 'sx2-k', r, k);
      el('span', 'sx2-v', r, val);
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
