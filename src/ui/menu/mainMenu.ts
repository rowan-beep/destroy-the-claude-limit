// Main menu ("command deck"): a navigation rail on the left, floating glass
// panels around the 3D hangar, a pilot card and an always-visible launch bar.
// Three sections: PLAY (game mode + mission setup), HANGAR (aircraft, loadout,
// performance) and THEATER (map + time of day); the rail also opens the jet
// library, the paint shop, multiplayer, the logbook, settings, controls and
// the release notes.

import { activeMap, MAPS, ROLES } from '../../world/islands';
import { switchMap } from '../../world/maps';
import { WhatsNewModal } from './whatsNew';
import { el, clearEl, button } from '../dom';
import { AIRCRAFT_TYPES, AircraftType, AircraftSpec, SPECS, enemyTypesFor, getSpec, strikeLoadout, jetAllowedIn } from '../../aircraft/specs';
import { MissionConfig, MODE_INFO, ModeId } from '../../game/mission';
import { todaysMission, dailyDone } from '../../game/daily';
import { CAMPAIGN, CAMPAIGN_PROLOGUE, CAMPAIGN_TITLE, campaignText, loadCampaign, missionUnlocked, nextCampaignMission, starCount } from '../../game/campaign';
import { FFA_JETS } from '../../game/modes/ffa';
import { DIFFICULTIES, Difficulty } from '../../ai/skill';
import { airfieldsOf } from '../../world/islands';
import { MISSILES } from '../../weapons/weaponSpecs';
import { LIBRARY } from '../../aircraft/library';
import { loadLogbook } from '../../game/logbook';
import { loadNetPrefs } from '../../net/servers';
import { programLogo, Program } from './program';
import { menuMusic } from '../../audio/menuMusic';
import type { TimeOfDay } from '../../render/environment';
import { menuStyle, setMenuStyle, renderSimple, picture } from './simpleMenu';

const DIFF_TEXT: Record<Difficulty, string> = {
  EASY: 'Conservative, rarely uses afterburner, flies predictable straight lines and gentle arcs. Only shoots with a perfect sustained lock. Never hides behind terrain.',
  MEDIUM: 'Breaks away from missile locks, manages speed near corner velocity, uses afterburner to recover energy in climbs, pulls up to ~6 G.',
  HARD: 'Fights for your six with high yo-yos and scissors, flares and chaff defensively, aggressive afterburner, dives behind mountain ridges to break your radar lock.',
  EXTREME: 'Operates at the absolute limits of the airframe: max-G snapshots, instant switching between gun and AIM-9X, perfect intercept geometry, and it punishes fuel or G-LOC mistakes.',
  APEX: 'A battle commander re-reads the fight every second: it works out what you are doing, learns which way you like to turn, predicts where you will be and gives each jet a role (bait, flanker, high cover, press). Its jets pull 45 G the instant they want it, never black out and never use flares or chaff: they beat missiles by flying, then sit on your tail and gun your cockpit.',
};

const MODES: ModeId[] = ['spotter', 'campaign', 'daily', 'recon', 'strike', 'tutorial', 'free', 'waves', 'duel', 'team', 'ffa'];
/** modes that need land (targets, sites, the lesson course) */
const OCEAN_OFF: ModeId[] = ['spotter', 'campaign', 'daily', 'recon', 'strike', 'tutorial'];

const TIMES: [TimeOfDay, string, string][] = [
  ['dawn', 'DAWN', 'linear-gradient(180deg,#2b3a67 0%,#c46b8a 60%,#f4b27a 100%)'],
  ['morning', 'MORNING', 'linear-gradient(180deg,#5d9be0 0%,#a8cdf0 70%,#f1e3c2 100%)'],
  ['noon', 'NOON', 'linear-gradient(180deg,#2f7fe0 0%,#7fb8f2 100%)'],
  ['afternoon', 'AFTERNOON', 'linear-gradient(180deg,#4d86c9 0%,#d9c38a 80%,#e8a860 100%)'],
  ['dusk', 'DUSK', 'linear-gradient(180deg,#27244d 0%,#b1486b 55%,#f08a3c 100%)'],
];

const RANKS: [number, string][] = [
  [0, 'CADET'],
  [6, 'SECOND LIEUTENANT'],
  [20, 'FIRST LIEUTENANT'],
  [50, 'CAPTAIN'],
  [110, 'MAJOR'],
  [220, 'LIEUTENANT COLONEL'],
  [420, 'COLONEL'],
];

type Section = 'play' | 'hangar' | 'theater';

export interface MainMenuCallbacks {
  onFly: (cfg: MissionConfig) => void;
  onSettings: () => void;
  onControls: () => void;
  onLogbook: () => void;
  onSelectJet: (t: AircraftType, loadoutId: string) => void;
  onCustomize: (t: AircraftType) => void;
  onMultiplayer: () => void;
  onLibrary: () => void;
  /** the airshow's photo album */
  onAlbum?: () => void;
  /** switch to the other program (space exploration) */
  onProgram?: (p: Program) => void;
  /** studio portrait of a jet (image URL, '' if unavailable) */
  thumbnail?: (t: AircraftType) => string;
}

/** a typical combat weight: empty + half the internal fuel + missiles */
function tw(s: AircraftSpec): number {
  return (s.engines * s.thrustAb) / ((s.emptyMass + s.internalFuel * 0.5 + 1200) * 9.81);
}

export class MainMenu {
  readonly root: HTMLDivElement;
  private musBtn!: HTMLButtonElement;
  private section: Section = 'play';
  private navBtns = new Map<Section, HTMLElement>();
  private titleEl: HTMLElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private launchInfo: HTMLElement;
  private pilot: HTMLElement;
  private caption: HTMLElement;
  private thumbs = new Map<AircraftType, string>();
  private thumbQueue: AircraftType[] = [];
  /** the SIMPLE menu (drawn over the hangar instead of the panels when chosen) */
  private simpleEl: HTMLElement;

  constructor(
    parent: HTMLElement,
    public cfg: MissionConfig,
    private cb: MainMenuCallbacks,
  ) {
    this.root = el('div', 'screen menu-root mm', parent);

    // --- navigation rail -------------------------------------------------------------------------------------------
    const rail = el('nav', 'mm-rail mm-block', this.root);
    programLogo(rail, 'air', 'AIR COMBAT SIMULATOR', (p) => cb.onProgram?.(p));
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
    sec('play', '01', 'PLAY', 'Modes & mission setup');
    sec('hangar', '02', 'HANGAR', 'Aircraft & loadout');
    sec('theater', '03', 'THEATER', 'Map & time of day');
    el('div', 'mm-nav-div', nav);
    const act = (label: string, sub: string, fn: () => void, cls = '') => {
      const b = el('button', 'mm-nav-item mm-nav-act ' + cls, nav);
      el('span', 'mm-nav-n', b, '›');
      const t = el('span', 'mm-nav-t', b);
      el('span', 'mm-nav-l', t, label);
      el('span', 'mm-nav-s', t, sub);
      b.addEventListener('click', fn);
    };
    act('JET LIBRARY', 'Every jet, in depth', () => cb.onLibrary());
    act('PAINT SHOP', 'Colours, wraps, flight suit', () => cb.onCustomize(this.cfg.aircraft));
    act('PHOTO ALBUM', 'Your airshow pictures', () => cb.onAlbum?.());
    act('MULTIPLAYER', 'Real pilots online', () => cb.onMultiplayer(), 'mm-nav-mp');
    const foot = el('div', 'mm-rail-foot', rail);
    const wn = new WhatsNewModal(document.body, 'air');
    const small = (label: string, fn: () => void) => button(label, 'mm-foot-btn', foot, fn);
    small('LOGBOOK', () => cb.onLogbook());
    small('SETTINGS', () => cb.onSettings());
    small('CONTROLS', () => cb.onControls());
    small(`v${wn.latest} NOTES`, () => wn.show(true));
    small('SIMPLE MENU', () => this.setStyle('simple'));
    const mus = (this.musBtn = small(menuMusic.enabled ? 'MUSIC ON' : 'MUSIC OFF', () => {
      mus.textContent = menuMusic.toggle() ? 'MUSIC ON' : 'MUSIC OFF';
    }));
    // only pop the notes up if the menu is still on screen (not after LAUNCH was pressed)
    setTimeout(() => {
      if (!this.root.classList.contains('hidden')) wn.showIfNew();
    }, 1200);

    // --- stage -----------------------------------------------------------------------------------------------------
    this.titleEl = el('div', 'mm-title', this.root);
    this.pilot = el('div', 'mm-pilot mm-block', this.root);
    this.left = el('div', 'mm-panel mm-left mm-block', this.root);
    this.right = el('div', 'mm-panel mm-right mm-block', this.root);
    this.caption = el('div', 'mm-caption', this.root);
    const launch = el('div', 'mm-launch mm-block', this.root);
    this.launchInfo = el('div', 'mm-launch-info', launch);
    const lb = el('button', 'mm-launch-btn', launch);
    el('span', 'mm-launch-l', lb, 'LAUNCH');
    el('span', 'mm-launch-a', lb, '▸');
    lb.addEventListener('click', () => this.cb.onFly({ ...this.cfg }));
    el('div', 'hangar-hint mm-hint', this.root, 'DRAG TO LOOK AROUND · SCROLL TO ZOOM · DOUBLE-CLICK TO RESET');

    this.simpleEl = el('div', 'sm', this.root);
    this.root.classList.toggle('simple', menuStyle('air') === 'simple');

    this.selectJet(cfg.aircraft);
    this.go('play');
  }

  private setStyle(v: 'current' | 'simple'): void {
    setMenuStyle('air', v);
    this.root.classList.toggle('simple', v === 'simple');
    this.render();
  }

  // --- the SIMPLE menu ---------------------------------------------------------------------------------------------
  /** the modes it offers (a picture each), in order */
  private static readonly SIMPLE_MODES: [ModeId, string, string][] = [
    // (first: where a new player most needs it)
    ['tutorial', 'FLIGHT SCHOOL', '11'],
    ['free', 'FREE FLIGHT', '04'],
    ['spotter', 'AIRSHOW', '16'],
    ['campaign', 'CAMPAIGN', '13'],
    ['duel', 'DOGFIGHT', '14'],
    ['waves', 'WAVE COMBAT', '12'],
    ['daily', 'DAILY MISSION', '10'],
  ];

  private renderSimpleMenu(): void {
    if (!this.root.classList.contains('simple')) return;
    const ocean = activeMap.id === 'ocean';
    const modes = MainMenu.SIMPLE_MODES.filter(([m]) => !(ocean && OCEAN_OFF.includes(m)));
    // (a mode the simple menu doesn't show, picked in the full one, still flies from here)
    const s = SPECS[this.cfg.aircraft];
    const jets = AIRCRAFT_TYPES.filter((t) => jetAllowedIn(t, this.cfg.mode));
    renderSimple(this.simpleEl, {
      program: 'air',
      subtitle: 'AIR COMBAT SIMULATOR',
      heading: 'WHAT DO YOU WANT TO FLY?',
      tiles: modes.map(([m, title, pic]) => ({
        title,
        sub: m === 'campaign' ? `Mission ${(m === this.cfg.mode ? this.cfg.campaignMission : nextCampaignMission()) + 1} of ${CAMPAIGN.length}` : MODE_INFO[m].subtitle,
        img: picture('air', pic),
        tag: m === 'tutorial' ? 'NEW? START HERE' : undefined,
        on: m === this.cfg.mode,
        click: () => {
          if (m === 'campaign' && this.cfg.mode !== 'campaign') this.cfg.campaignMission = nextCampaignMission();
          this.cfg.mode = m;
          if (!jetAllowedIn(this.cfg.aircraft, m)) this.selectJet(this.lastFighter);
          else this.render();
        },
      })),
      middle: (mid) => {
        const row = el('div', 'sm-jet', mid);
        const step = (d: number) => {
          const i = jets.indexOf(this.cfg.aircraft);
          if (jets.length) this.selectJet(jets[(i + d + jets.length) % jets.length]);
        };
        const prev = el('button', 'sm-arrow', row, '‹') as HTMLButtonElement;
        prev.type = 'button';
        prev.title = 'Previous jet';
        prev.addEventListener('click', () => step(-1));
        const t = el('div', '', row);
        el('div', 'sm-jet-k', t, 'YOUR JET');
        el('div', 'sm-jet-n', t, s.name.toUpperCase());
        const next = el('button', 'sm-arrow', row, '›') as HTMLButtonElement;
        next.type = 'button';
        next.title = 'Next jet';
        next.addEventListener('click', () => step(1));
      },
      go: { label: 'FLY', sub: `${MainMenu.SIMPLE_MODES.find(([m]) => m === this.cfg.mode)?.[1] ?? MODE_INFO[this.cfg.mode].title} · ${s.shortName.toUpperCase()}`, click: () => this.cb.onFly({ ...this.cfg }) },
      links: [
        ['PHOTO ALBUM', () => this.cb.onAlbum?.()],
        ['SETTINGS', () => this.cb.onSettings()],
        ['CONTROLS', () => this.cb.onControls()],
      ],
      onProgram: (p) => this.cb.onProgram?.(p),
      onFull: () => this.setStyle('current'),
    });
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    menuMusic.want('air', v);
    this.musBtn.textContent = menuMusic.enabled ? 'MUSIC ON' : 'MUSIC OFF';
    // back from a mission: redraw everything, so new campaign stars, unlocked
    // missions and the daily mission's DONE tag show at once
    if (v) this.render();
  }

  private go(s: Section): void {
    this.section = s;
    for (const [k, b] of this.navBtns) b.classList.toggle('on', k === s);
    this.root.dataset.section = s;
    this.render();
    if (s === 'hangar') this.loadThumbs();
  }

  private render(): void {
    const titles: Record<Section, [string, string, string]> = {
      play: ['01', 'PLAY', 'Pick a mode, set up the mission, launch.'],
      hangar: ['02', 'HANGAR', 'Choose your aircraft and what it carries.'],
      theater: ['03', 'THEATER', 'Where and when you fly.'],
    };
    const [n, t, sub] = titles[this.section];
    clearEl(this.titleEl);
    el('div', 'mm-title-n', this.titleEl, n);
    const tt = el('div', 'mm-title-t', this.titleEl);
    el('div', 'mm-title-l', tt, t);
    el('div', 'mm-title-s', tt, sub);
    clearEl(this.left);
    clearEl(this.right);
    if (this.section === 'play') {
      this.renderModes(this.left);
      this.renderSetup(this.right);
    } else if (this.section === 'hangar') {
      this.renderJets(this.left);
      this.renderJetDetail(this.right);
    } else {
      this.renderTheater(this.left);
      this.renderTime(this.right);
    }
    this.renderLaunch();
    this.renderCaption();
    this.renderPilot();
    this.renderSimpleMenu();
  }

  // --- pilot card ------------------------------------------------------------------------------------------------
  private renderPilot(): void {
    const lb = loadLogbook();
    const t = lb.totals;
    const score = t.kills * 2 + t.sorties;
    let rank = RANKS[0][1];
    let next: number | null = null;
    for (let i = 0; i < RANKS.length; i++) {
      if (score >= RANKS[i][0]) {
        rank = RANKS[i][1];
        next = RANKS[i + 1] ? RANKS[i + 1][0] : null;
      }
    }
    const cs = (loadNetPrefs().callsign || 'PILOT').toUpperCase();
    clearEl(this.pilot);
    const badge = el('div', 'mm-pilot-badge', this.pilot);
    el('div', 'mm-pilot-star', badge, '★');
    const info = el('div', 'mm-pilot-info', this.pilot);
    el('div', 'mm-pilot-cs', info, cs);
    el('div', 'mm-pilot-rank', info, rank);
    if (next !== null) {
      const bar = el('div', 'mm-pilot-bar', info);
      const prev = [...RANKS].reverse().find((r) => score >= r[0])![0];
      el('div', 'mm-pilot-fill', bar).style.width = `${Math.round(((score - prev) / (next - prev)) * 100)}%`;
    }
    const st = el('div', 'mm-pilot-stats', this.pilot);
    const stat = (v: string, k: string) => {
      const b = el('div', 'mm-stat', st);
      el('div', 'mm-stat-v', b, v);
      el('div', 'mm-stat-k', b, k);
    };
    stat(String(t.sorties), 'SORTIES');
    stat(String(t.kills), 'KILLS');
    stat(`${(t.flightSec / 3600).toFixed(1)}`, 'HOURS');
    stat(String(lb.medals.length), 'MEDALS');
  }

  // --- launch bar ------------------------------------------------------------------------------------------------
  private renderLaunch(): void {
    const s = SPECS[this.cfg.aircraft];
    const lo = s.loadouts.find((l) => l.id === this.cfg.loadoutId);
    clearEl(this.launchInfo);
    const row = (k: string, v: string) => {
      const r = el('div', 'mm-li', this.launchInfo);
      el('span', 'mm-li-k', r, k);
      el('span', 'mm-li-v', r, v);
    };
    row('MODE', this.cfg.mode === 'campaign' ? `CAMPAIGN · ${this.cfg.campaignMission + 1}. ${CAMPAIGN[this.cfg.campaignMission]?.title ?? ''}` : MODE_INFO[this.cfg.mode].title);
    row('AIRCRAFT', s.shortName.toUpperCase() + (lo ? ` · ${lo.name.split('—')[0].trim()}` : ''));
    row('THEATER', `${activeMap.name} · ${(this.cfg.mode === 'campaign' ? CAMPAIGN[this.cfg.campaignMission]?.time ?? this.cfg.timeOfDay : this.cfg.timeOfDay).toUpperCase()}`);
  }

  private renderCaption(): void {
    const s = SPECS[this.cfg.aircraft];
    const L = LIBRARY[this.cfg.aircraft];
    clearEl(this.caption);
    el('div', 'mm-cap-k', this.caption, `${L.manufacturer.toUpperCase()} · ${L.nation.toUpperCase()}`);
    el('div', 'mm-cap-n', this.caption, s.name.toUpperCase());
  }

  // --- PLAY --------------------------------------------------------------------------------------------------------
  private renderModes(p: HTMLElement): void {
    el('div', 'mm-h', p, 'GAME MODE');
    const list = el('div', 'mm-modes', p);
    // the open ocean has no land: no ground targets, no recon sites, no lesson course
    const oceanOff = (m: ModeId) => activeMap.id === 'ocean' && OCEAN_OFF.includes(m);
    if (oceanOff(this.cfg.mode)) this.cfg.mode = 'free';
    MODES.forEach((m, i) => {
      const info = MODE_INFO[m];
      const on = m === this.cfg.mode;
      const off = oceanOff(m);
      const r = el('div', 'mm-mode' + (on ? ' on' : '') + (off ? ' off' : ''), list);
      el('div', 'mm-mode-n', r, String(i + 1).padStart(2, '0'));
      const t = el('div', 'mm-mode-t', r);
      const tl = el('div', 'mm-mode-l', t, info.title);
      if (m === 'campaign') {
        const prog = loadCampaign();
        const n = prog.reduce((a, b) => a + starCount(b), 0);
        el('span', 'mm-tag' + (prog.every((b) => b & 1) ? ' done' : ''), tl, `★ ${n}/${CAMPAIGN.length * 3}`);
      }
      if (m === 'daily') {
        const dm = todaysMission();
        el('span', 'mm-tag' + (dailyDone(dm.date) ? ' done' : ''), tl, dailyDone(dm.date) ? '✓ DONE' : dm.date.slice(5).replace('-', '/'));
      }
      el('div', 'mm-mode-s', t, off ? 'NOT ON THE OPEN OCEAN: PICK ANOTHER THEATER' : info.subtitle);
      if (on) el('div', 'mm-mode-d', t, info.description);
      r.addEventListener('click', () => {
        if (off) return;
        // coming into the campaign from another mode: the first mission not yet done
        // (clicking it again keeps the mission you picked)
        if (m === 'campaign' && this.cfg.mode !== 'campaign') this.cfg.campaignMission = nextCampaignMission();
        this.cfg.mode = m;
        // the SR-71 flies only reconnaissance and free flight; reconnaissance only the SR-71
        if (!jetAllowedIn(this.cfg.aircraft, m)) {
          this.selectJet(m === 'recon' ? 'SR71' : this.lastFighter);
          return;
        }
        this.render();
      });
    });
  }

  private pills<T extends string>(parent: HTMLElement, label: string, options: [T, string][], value: T, onChange: (v: T) => void): void {
    const f = el('div', 'mm-field', parent);
    el('div', 'mm-field-l', f, label);
    const row = el('div', 'mm-pills', f);
    for (const [v, text] of options) {
      const b = button(text, 'mm-pill' + (v === value ? ' on' : ''), row, () => {
        onChange(v);
        this.render();
      });
      b.type = 'button';
    }
  }

  private slider(parent: HTMLElement, label: (v: number) => string, min: number, max: number, value: number, onInput: (v: number) => void, note?: (v: number) => string): void {
    const f = el('div', 'mm-field', parent);
    const l = el('div', 'mm-field-l', f, label(value));
    const r = el('input', 'mm-range', f);
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = '1';
    r.value = String(value);
    const d = note ? el('div', 'mm-note', f, note(value)) : null;
    r.addEventListener('input', () => {
      onInput(+r.value);
      l.textContent = label(+r.value);
      if (d && note) d.textContent = note(+r.value);
      this.renderLaunch();
    });
  }

  private difficulty(p: HTMLElement): void {
    const cfg = this.cfg;
    this.slider(
      p,
      (v) => `AI DIFFICULTY · ${DIFFICULTIES[v]}`,
      0,
      DIFFICULTIES.length - 1,
      DIFFICULTIES.indexOf(cfg.difficulty),
      (v) => (cfg.difficulty = DIFFICULTIES[v]),
      (v) => DIFF_TEXT[DIFFICULTIES[v]],
    );
  }

  private renderSetup(c: HTMLElement): void {
    const cfg = this.cfg;
    const info = MODE_INFO[cfg.mode];
    el('div', 'mm-h', c, 'MISSION SETUP');
    el('div', 'mm-setup-t', c, info.title);
    const blue = airfieldsOf('blue');
    if (!blue.some((f) => f.id === cfg.freeBase)) cfg.freeBase = blue[0].id;
    if (cfg.mode === 'spotter') {
      const land = blue.filter((f) => !f.carrier);
      if (!land.some((f) => f.id === cfg.freeBase) && land.length) cfg.freeBase = land[0].id;
      this.pills(c, 'AIRSHOW AT', land.map((f) => [f.id, f.name.replace(' AB', '')] as [string, string]), cfg.freeBase, (v) => (cfg.freeBase = v));
      el('div', 'mm-note', c, `The ${SPECS[cfg.aircraft].shortName} opens the show; every other jet follows. No flying, no enemies: just the jets and your camera. A low sun (dawn, dusk) makes the most dramatic pictures.`);
    }
    if (cfg.mode === 'free' || cfg.mode === 'waves') {
      this.pills(c, 'HOME BASE', blue.map((f) => [f.id, f.name.replace(' AB', '')] as [string, string]), cfg.freeBase, (v) => (cfg.freeBase = v));
    }
    if (cfg.mode === 'spotter') {
      // (set up above: the venue and the note)
    } else if (cfg.mode === 'free') {
      this.pills(c, 'START', [['runway', activeMap.id === 'ocean' ? 'ON THE CATAPULT' : 'ON RUNWAY'], ['air', 'IN THE AIR']], cfg.freeStart, (v) => (cfg.freeStart = v));
      el('div', 'mm-note', c, activeMap.id === 'ocean' ? 'No enemy jets, but the RED carriers in the north-east shoot at anything that comes close. Launch off the catapult (full throttle), then practise traps: gear down, hook down (H), fly the ball on the lens to the wires.' : 'No enemies. Practise take-offs, landings and high-G handling anywhere in the theater.');
    } else if (cfg.mode === 'waves') {
      this.pills(c, 'START', [['air', 'IN THE AIR'], ['runway', 'ON RUNWAY']], cfg.waveStart, (v) => (cfg.waveStart = v));
      this.slider(c, (v) => `STARTING WAVE · ${v}`, 1, 10, cfg.startWave, (v) => (cfg.startWave = v));
      this.pills(c, 'BETWEEN WAVES', [['on', 'AUTO REARM'], ['off', 'LAND TO REARM']], cfg.autoRearm ? 'on' : 'off', (v) => (cfg.autoRearm = v === 'on'));
      el('div', 'mm-note', c, 'Enemies fly the jets you did not pick. BLUE ground radars (GCI) call bandits, unless they hide low behind terrain.');
    } else if (cfg.mode === 'team') {
      this.pills(c, 'YOUR WINGMEN', [['mixed', 'MIXED JETS'], ['same', `ALL ${SPECS[cfg.aircraft].shortName.toUpperCase()}`]], cfg.teamAllies, (v) => (cfg.teamAllies = v));
      this.difficulty(c);
      this.pills(c, 'FIRST TO', [['2', '2 ROUNDS'], ['3', '3 ROUNDS'], ['4', '4 ROUNDS']], String(cfg.teamWins) as '2' | '3' | '4', (v) => (cfg.teamWins = +v));
      this.pills(c, 'WEAPONS', [['all', 'ALL'], ['ir', 'HEATERS + GUN'], ['guns', 'GUNS ONLY']], cfg.duelRules, (v) => (cfg.duelRules = v));
      el('div', 'mm-note', c, `Bandits fly only the jets you did not pick (${enemyTypesFor(cfg.aircraft).map((t) => SPECS[t].shortName).join(' / ')}). Shot down? Watch any jet or fly a free camera until the round ends.`);
    } else if (cfg.mode === 'daily') {
      const dm = todaysMission();
      const card = el('div', 'mm-daily', c);
      el('div', 'mm-daily-k', card, `TODAY · ${dm.date} · FROM THE NEWS (${dm.eventDate})`);
      el('div', 'mm-daily-t', card, dm.title);
      el('div', 'mm-daily-d', card, dm.headline);
      el(
        'div',
        'mm-daily-d',
        card,
        dm.behavior === 'inbound'
          ? `${dm.enemy.count} jet drones inbound across ${dm.targetName}, fast and radar silent. Take off, stop every one before it gets within ${dm.failNm ?? 15} NM of home${dm.rtb ? ', then fly home' : ''}.`
          : `${dm.enemy.count} × ${SPECS[dm.enemy.type].shortName} (${dm.enemy.difficulty}) waiting over ${dm.targetName}. Take off from home base${dm.rtb ? ', shoot them down and fly home' : ' and shoot them down'}.`,
      );
      if (dailyDone(dm.date)) el('div', 'mm-daily-done', card, '✓ COMPLETED TODAY');
      if (dm.map && dm.map !== activeMap.id) {
        const want = MAPS.find((x) => x.id === dm.map);
        if (want) {
          el('div', 'mm-note', c, `This story is set best on ${want.name}. You can fly it here too.`);
          button(`SWITCH TO ${want.name}`, 'mm-pill', c, () => switchMap(want.id));
        }
      }
      if (dm.realJet && dm.realJet !== cfg.aircraft) el('div', 'mm-note', c, `The real pilots flew the ${SPECS[dm.realJet].shortName}. Any jet works.`);
    } else if (cfg.mode === 'campaign') {
      this.renderCampaign(c);
      return;
    } else if (cfg.mode === 'strike') {
      this.difficulty(c);
      const lo = strikeLoadout(SPECS[cfg.aircraft]);
      el('div', 'mm-note', c, `Your ${SPECS[cfg.aircraft].shortName} flies its strike loadout: ${lo.name.split(' — ')[1] ?? lo.name}. A new target, defences, fighters and start every time; the difficulty sets how many AAA guns and SAMs guard it and how good their crews are.`);
    } else if (cfg.mode === 'recon') {
      this.difficulty(c);
      el('div', 'mm-note', c, 'SR-71A only, and it carries no weapons: speed and altitude are its only defence. Every sortie is a new story with new sites, clues, flight paths and trouble. The difficulty sets how sharp the radar crews, SAMs and MiG-31s are.');
    } else if (cfg.mode === 'tutorial') {
      el('div', 'mm-note', c, `12 short lessons in the air over ${ROLES.arena.name}, then the checkride. Each step completes itself as soon as you have done it; press ENTER to skip one. The instructor uses your own key bindings and mouse mode (change them in SETTINGS).`);
    } else if (cfg.mode === 'ffa') {
      this.difficulty(c);
      this.pills(c, 'OPPONENT JETS', [['mixed', 'MIXED TYPES'], ['same', `ALL ${SPECS[cfg.aircraft].shortName.toUpperCase()}`]], cfg.ffaJets, (v) => (cfg.ffaJets = v));
      this.pills(c, 'MATCH PACE', [['quick', 'QUICK ~6 MIN'], ['standard', 'STANDARD ~9'], ['long', 'LONG ~13']], cfg.ffaPace, (v) => (cfg.ffaPace = v));
      this.pills(c, 'WEAPONS', [['all', 'ALL'], ['ir', 'HEATERS + GUN'], ['guns', 'GUNS ONLY']], cfg.duelRules, (v) => (cfg.duelRules = v));
      el('div', 'mm-note', c, `12 jets, you included: ${FFA_JETS - 1} AI pilots, every one hostile to everyone. No respawns. Stay inside the shrinking zone; kills refill a missile of each type; the top scorer carries a bounty.`);
    } else {
      const enemies = enemyTypesFor(cfg.aircraft);
      this.pills(c, 'OPPONENT', enemies.map((t) => [t, SPECS[t].shortName.toUpperCase()] as [AircraftType, string]), cfg.enemyType, (v) => (cfg.enemyType = v));
      this.difficulty(c);
      this.pills(c, 'START', [['air', 'HEAD-ON, 22 NM'], ['samos', `${ROLES.arena.name} RUNWAYS`]], cfg.duelStart, (v) => (cfg.duelStart = v));
      this.pills(c, 'WEAPONS', [['all', 'ALL'], ['ir', 'HEATERS + GUN'], ['guns', 'GUNS ONLY']], cfg.duelRules, (v) => (cfg.duelRules = v));
    }
    this.timePicker(c);
  }

  private renderCampaign(c: HTMLElement): void {
    const cfg = this.cfg;
    const prog = loadCampaign();
    if (!missionUnlocked(cfg.campaignMission, prog)) cfg.campaignMission = nextCampaignMission(prog);
    el('div', 'mm-cm-k', c, CAMPAIGN_TITLE);
    el('div', 'mm-note', c, campaignText(CAMPAIGN_PROLOGUE));
    const list = el('div', 'mm-cms', c);
    CAMPAIGN.forEach((m, i) => {
      const open = missionUnlocked(i, prog);
      const on = i === cfg.campaignMission;
      const r = el('div', 'mm-cm' + (on ? ' on' : '') + (open ? '' : ' locked'), list);
      el('div', 'mm-cm-n', r, open ? String(i + 1) : '🔒');
      const t = el('div', 'mm-cm-t', r);
      el('div', 'mm-cm-l', t, m.title);
      el('div', 'mm-cm-s', t, open ? campaignText(m.teaser) : 'Complete the mission before to unlock');
      const st = el('div', 'mm-cm-st', r);
      for (let k = 0; k < 3; k++) el('span', (prog[i] >> k) & 1 ? 'got' : '', st, '★');
      if (open)
        r.addEventListener('click', () => {
          cfg.campaignMission = i;
          this.render();
        });
    });
    const m = CAMPAIGN[cfg.campaignMission];
    el('div', 'mm-note', c, `MISSION ${cfg.campaignMission + 1} · ${m.time.toUpperCase()}${m.dark ? ' · PITCH BLACK' : ''} · STARS: ${m.stars.map((x) => campaignText(x)).join(' · ')}`);
    this.difficulty(c);
    el('div', 'mm-note', c, 'Fly any fighter. Your wingmen fly the same jet; the enemy flies the others.');
  }

  private timePicker(c: HTMLElement): void {
    const f = el('div', 'mm-field', c);
    el('div', 'mm-field-l', f, 'TIME OF DAY');
    const row = el('div', 'mm-times', f);
    for (const [v, label, grad] of TIMES) {
      const b = el('button', 'mm-time' + (v === this.cfg.timeOfDay ? ' on' : ''), row);
      el('span', 'mm-time-sw', b).style.background = grad;
      el('span', 'mm-time-l', b, label);
      b.addEventListener('click', () => {
        this.cfg.timeOfDay = v;
        this.render();
      });
    }
  }

  // --- HANGAR ------------------------------------------------------------------------------------------------------
  private loadThumbs(): void {
    if (!this.cb.thumbnail) return;
    this.thumbQueue = AIRCRAFT_TYPES.filter((t) => !this.thumbs.has(t));
    const pump = () => {
      const t = this.thumbQueue.shift();
      if (!t || this.section !== 'hangar' || this.root.classList.contains('hidden')) return;
      requestAnimationFrame(() => {
        const url = this.cb.thumbnail!(t);
        if (url) {
          this.thumbs.set(t, url);
          const img = this.left.querySelector(`[data-jet="${t}"] img`) as HTMLImageElement | null;
          if (img) {
            img.src = url;
            img.classList.add('in');
          }
        }
        pump();
      });
    };
    pump();
  }

  private renderJets(p: HTMLElement): void {
    el('div', 'mm-h', p, 'AIRCRAFT');
    const list = el('div', 'mm-jets', p);
    for (const t of AIRCRAFT_TYPES) {
      const s = SPECS[t];
      const L = LIBRARY[t];
      const r = el('div', 'mm-jet' + (t === this.cfg.aircraft ? ' on' : ''), list);
      r.dataset.jet = t;
      const pic = el('div', 'mm-jet-pic', r);
      const img = el('img', '', pic);
      img.alt = s.shortName;
      const u = this.thumbs.get(t);
      if (u) {
        img.src = u;
        img.classList.add('in');
      }
      const tx = el('div', 'mm-jet-t', r);
      el('div', 'mm-jet-n', tx, s.shortName.toUpperCase());
      el('div', 'mm-jet-s', tx, `${L.nickname.toUpperCase()} · ${L.generation} GEN · ${L.nation.toUpperCase()}`);
      const q = el('div', 'mm-jet-q', tx);
      el('span', '', q, `M${s.maxMach.toFixed(1)}`);
      el('span', '', q, `T/W ${tw(s).toFixed(2)}`);
      el('span', '', q, t === 'SR71' ? 'RECON ONLY' : t === 'X15' ? 'RESEARCH ONLY' : `${s.maxAAM} AAM`);
      r.addEventListener('click', () => this.selectJet(t));
    }
  }

  private renderJetDetail(p: HTMLElement): void {
    const t = this.cfg.aircraft;
    const s = getSpec(t);
    el('div', 'mm-h', p, 'LOADOUT');
    const lo = el('div', 'mm-loadouts', p);
    for (const l of s.loadouts) {
      const c = el('div', 'mm-lo' + (l.id === this.cfg.loadoutId ? ' on' : ''), lo);
      const [title, detail] = l.name.split('—').map((x) => x.trim());
      el('div', 'mm-lo-t', c, title);
      const counts = new Map<string, number>();
      for (const st of Object.values(l.stores)) counts.set(st, (counts.get(st) ?? 0) + 1);
      const d = el('div', 'mm-lo-d', c, detail || [...counts].map(([k, n]) => `${n}× ${MISSILES[k as keyof typeof MISSILES]?.short ?? 'FUEL TANK'}`).join(' · ') || 'Clean');
      // (a short window shows only the chosen loadout's stores: the rest on hover)
      c.title = `${title} — ${d.textContent}`;
      c.addEventListener('click', () => {
        this.cfg.loadoutId = l.id;
        this.cb.onSelectJet(t, l.id);
        this.render();
      });
    }
    el('div', 'mm-h', p, 'PERFORMANCE');
    const all = AIRCRAFT_TYPES.map((x) => SPECS[x]);
    // (two to a row, so the panel fits a laptop screen without cutting rows off)
    const bars = el('div', 'mm-bars', p);
    const bar = (label: string, v: number, max: number, text: string) => {
      const r = el('div', 'mm-bar', bars);
      const top = el('div', 'mm-bar-top', r);
      el('span', '', top, label);
      el('span', 'mm-bar-v', top, text);
      const tr = el('div', 'mm-bar-track', r);
      el('div', 'mm-bar-fill', tr).style.width = `${Math.round((v / max) * 100)}%`;
    };
    bar('TOP SPEED', s.maxMach, Math.max(...all.map((x) => x.maxMach)), `MACH ${s.maxMach}`);
    bar('THRUST / WEIGHT', tw(s), Math.max(...all.map(tw)), tw(s).toFixed(2));
    bar('ROLL RATE', s.rollRate, Math.max(...all.map((x) => x.rollRate)), `${s.rollRate}°/S`);
    bar('COMBAT RANGE', s.combatRangeNm, Math.max(...all.map((x) => x.combatRangeNm)), `${s.combatRangeNm.toLocaleString('en-US')} NM`);
    bar('RADAR RANGE', s.radar.rangeNm, Math.max(...all.map((x) => x.radar.rangeNm)), `${s.radar.rangeNm} NM`);
    const facts = el('div', 'mm-facts', p);
    const fact = (k: string, v: string) => {
      const r = el('div', 'mm-fact', facts);
      el('span', 'mm-fact-k', r, k);
      el('span', 'mm-fact-v', r, v);
    };
    if (s.maxAAM > 0) {
      fact('MISSILES', `${MISSILES[s.missiles.radar].short} · ${MISSILES[s.missiles.ir].short}`);
      fact('CANNON', `${s.gun.name.split(' ').slice(0, 2).join(' ')} · ${s.gun.rounds} rds`);
    } else {
      fact('WEAPONS', 'NONE — UNARMED');
      fact('FLIES IN', 'BLACKBIRD RECON · FREE FLIGHT');
    }
    fact('SENSORS', `${s.radar.kind}${s.irst ? ' · IRST' : ''}${s.tvcDeg > 0 ? ` · TVC ${s.tvcDeg}°` : ''}`);
    fact('G LIMIT', `${s.gLimit} G (${s.gOverride} override)`);
    const acts = el('div', 'mm-acts', p);
    button('FULL DOSSIER ▸', 'mm-pill', acts, () => this.cb.onLibrary());
    button('PAINT SHOP ▸', 'mm-pill', acts, () => this.cb.onCustomize(t));
  }

  /** the fighter to go back to when leaving the SR-71 */
  private lastFighter: AircraftType = 'F15EX';

  selectJet(t: AircraftType): void {
    if (t !== 'SR71' && t !== 'X15') this.lastFighter = t;
    if (!jetAllowedIn(t, this.cfg.mode)) this.cfg.mode = t === 'SR71' ? 'recon' : 'free';
    this.cfg.aircraft = t;
    const s = getSpec(t);
    if (!s.loadouts.find((l) => l.id === this.cfg.loadoutId)) this.cfg.loadoutId = s.loadouts[0].id;
    // the duel opponent can never be the same type as the player
    const enemies = enemyTypesFor(t);
    if (!enemies.includes(this.cfg.enemyType)) this.cfg.enemyType = enemies[0];
    this.render();
    this.cb.onSelectJet(t, this.cfg.loadoutId);
  }

  // --- THEATER -----------------------------------------------------------------------------------------------------
  /** Map picker: switching saves the choice and reloads with the new theater. */
  private renderTheater(p: HTMLElement): void {
    el('div', 'mm-h', p, 'THEATER');
    for (const m of MAPS) {
      const cur = m.id === activeMap.id;
      const b = el('div', 'mm-map' + (cur ? ' on' : ''), p);
      el('div', 'mm-map-n', b, m.name);
      el('div', 'mm-map-p', b, `${m.sizeNm} × ${m.sizeNm} NM · ${m.places}`);
      el('div', 'mm-map-d', b, m.description);
      el('div', 'mm-map-c', b, cur ? '● CURRENT THEATER' : 'SELECT ▸');
      if (!cur)
        b.addEventListener('click', () => {
          b.classList.add('loading');
          (b.querySelector('.mm-map-c') as HTMLElement).textContent = 'LOADING THEATER…';
          switchMap(m.id);
        });
    }
  }

  private renderTime(p: HTMLElement): void {
    el('div', 'mm-h', p, 'CONDITIONS');
    this.timePicker(p);
    el('div', 'mm-note', p, 'Wind, turbulence and clouds change from flight to flight; the weather widget in flight shows what you have. Night falls after DUSK: runway and apron lights come on.');
    el('div', 'mm-note', p, `Your home base is on ${ROLES.blueHome.name}; the fight centres on ${ROLES.arena.name}; the RED coalition is based on ${ROLES.redHome.name}.`);
  }
}
