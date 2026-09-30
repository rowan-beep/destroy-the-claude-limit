// Main menu: the jet in the hangar fills the screen. A soft floating bar at
// the bottom holds the choices (mode, aircraft, map, weather, time, start);
// each steps with ‹ › or a click and slides smoothly to its next value.
// Settings, controls, the logbook and the release notes sit top right.

import { activeMap, MAPS } from '../../world/islands';
import { switchMap } from '../../world/maps';
import { WhatsNewModal } from './whatsNew';
import { VERSION } from '../../version';
import { el, button } from '../dom';
import { AIRCRAFT_TYPES, AircraftType, SPECS, enemyTypesFor, getSpec } from '../../aircraft/specs';
import { LIBRARY } from '../../aircraft/library';
import { MissionConfig, MODE_INFO, ModeId } from '../../game/mission';
import { todaysMission, dailyDone } from '../../game/daily';
import { WEATHER_KINDS, WeatherKind } from '../../world/weather';
import type { TimeOfDay } from '../../render/environment';

/** 'online' opens the multiplayer server list instead of launching */
const MODES: [ModeId, string][] = [
  ['free', 'Free flight'],
  ['duel', '1v1 Duel'],
  ['waves', 'Waves'],
  ['team', '5v5 Team'],
  ['ffa', 'Free-for-all'],
  ['strike', 'Airstrike'],
  ['daily', 'Daily mission'],
  ['tutorial', 'Tutorial'],
  ['online', 'Online'],
];

const TIMES: [TimeOfDay, string][] = [
  ['dawn', 'Dawn'],
  ['morning', 'Morning'],
  ['noon', 'Noon'],
  ['afternoon', 'Afternoon'],
  ['dusk', 'Dusk'],
];

const title = (s: string) => s.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

export interface MainMenuCallbacks {
  onFly: (cfg: MissionConfig) => void;
  onSettings: () => void;
  onControls: () => void;
  onLogbook: () => void;
  onSelectJet: (t: AircraftType, loadoutId: string) => void;
  onMultiplayer: () => void;
  /** the weather now set, and a new pick */
  weather: () => WeatherKind;
  onWeather: (k: WeatherKind) => void;
  // kept for the other screens that still open these
  onCustomize?: (t: AircraftType) => void;
  onLibrary?: () => void;
  thumbnail?: (t: AircraftType) => string;
}

/**
 * One choice in the bar. Every option is stacked in the same spot (so the
 * control is as wide as its longest option and never jumps); changing it
 * slides the old value out and the new one in from the side it came from.
 */
class Choice<T extends string> {
  readonly root: HTMLElement;
  private spans: HTMLElement[] = [];
  private i = 0;

  constructor(
    parent: HTMLElement,
    label: string,
    private options: [T, string][],
    value: T,
    private onPick: (v: T) => void,
  ) {
    this.root = el('div', 'fm-choice', parent);
    const prev = button('‹', 'fm-step', this.root, () => this.step(-1));
    const mid = el('button', 'fm-mid', this.root);
    mid.type = 'button';
    el('span', 'fm-label', mid, label);
    const vals = el('span', 'fm-vals', mid);
    for (const [, text] of options) this.spans.push(el('span', 'fm-val', vals, text));
    mid.addEventListener('click', () => this.step(1));
    const next = button('›', 'fm-step', this.root, () => this.step(1));
    for (const b of [prev, next]) {
      b.type = 'button';
      b.tabIndex = -1;
    }
    this.i = Math.max(0, options.findIndex(([v]) => v === value));
    this.spans[this.i].classList.add('on');
  }

  private step(d: number): void {
    const n = this.options.length;
    this.show((this.i + d + n) % n, d);
    this.onPick(this.options[this.i][0]);
  }

  /** Show a value (from outside: no pick callback). */
  set(v: T): void {
    const k = this.options.findIndex(([x]) => x === v);
    if (k >= 0 && k !== this.i) this.show(k, k > this.i ? 1 : -1);
  }

  private show(k: number, d: number): void {
    const old = this.spans[this.i];
    const nu = this.spans[k];
    this.i = k;
    old.classList.remove('on', 'from-l', 'from-r');
    old.classList.add(d > 0 ? 'to-l' : 'to-r');
    // start the new value just off to its side (no transition), then let it glide in
    nu.classList.remove('to-l', 'to-r', 'on');
    nu.classList.add('snap', d > 0 ? 'from-r' : 'from-l');
    void nu.offsetWidth;
    nu.classList.remove('snap', 'from-r', 'from-l');
    nu.classList.add('on');
  }
}

export class MainMenu {
  readonly root: HTMLDivElement;
  private bar: HTMLElement;
  private jetName: HTMLElement;
  private modeLine: HTMLElement;
  private caption: HTMLElement;
  private spawn: HTMLElement;
  private spawnChoice: Record<'free' | 'waves' | 'duel', Choice<string>> | null = null;
  private weatherChoice: Choice<WeatherKind>;

  constructor(
    parent: HTMLElement,
    public cfg: MissionConfig,
    private cb: MainMenuCallbacks,
  ) {
    this.root = el('div', 'screen menu-root fm', parent);
    const top = el('div', 'fm-top', this.root);
    el('div', 'fm-brand', top, 'Triad');
    const links = el('div', 'fm-links', top);
    const wn = new WhatsNewModal(document.body);
    button('Settings', 'fm-link', links, () => cb.onSettings());
    button('Controls', 'fm-link', links, () => cb.onControls());
    button('Logbook', 'fm-link', links, () => cb.onLogbook());
    button(`What's new`, 'fm-link', links, () => wn.show(true)).title = `Release notes, v${VERSION}`;
    // only pop the notes up if the menu is still on screen (not after Launch was pressed)
    setTimeout(() => {
      if (!this.root.classList.contains('hidden')) wn.showIfNew();
    }, 1200);

    this.caption = el('div', 'fm-caption', this.root);
    this.jetName = el('div', 'fm-jet', this.caption);
    this.modeLine = el('div', 'fm-mode', this.caption);

    const dock = el('div', 'fm-dock', this.root);
    this.bar = el('div', 'fm-bar', dock);
    new Choice(this.bar, 'Mode', MODES, cfg.mode, (v) => {
      cfg.mode = v;
      this.refresh();
    });
    new Choice(this.bar, 'Aircraft', AIRCRAFT_TYPES.map((t) => [t, SPECS[t].shortName] as [AircraftType, string]), cfg.aircraft, (v) => this.selectJet(v));
    new Choice(this.bar, 'Map', MAPS.map((m) => [m.id, title(m.name)] as [string, string]), activeMap.id, (v) => {
      // a different theater reloads the game on it
      if (v === activeMap.id) return;
      this.root.classList.add('fm-busy');
      setTimeout(() => switchMap(v as typeof activeMap.id), 260);
    });
    this.weatherChoice = new Choice(this.bar, 'Weather', WEATHER_KINDS.map(([k, l]) => [k, title(l)] as [WeatherKind, string]), cb.weather(), (v) => cb.onWeather(v));
    new Choice(this.bar, 'Time', TIMES, cfg.timeOfDay, (v) => (cfg.timeOfDay = v));
    // start: its own choice per mode that has one (only the current one shows)
    this.spawn = el('div', 'fm-spawn', this.bar);
    const where: [string, string][] = [['runway', 'Runway'], ['air', 'In the air']];
    this.spawnChoice = {
      free: new Choice(this.spawn, 'Start', where, cfg.freeStart, (v) => (cfg.freeStart = v as 'runway' | 'air')),
      waves: new Choice(this.spawn, 'Start', where, cfg.waveStart, (v) => (cfg.waveStart = v as 'runway' | 'air')),
      duel: new Choice(this.spawn, 'Start', [['samos', 'Runway'], ['air', 'In the air']], cfg.duelStart, (v) => (cfg.duelStart = v as 'air' | 'samos')),
    };
    const go = el('button', 'fm-go', dock);
    go.type = 'button';
    go.textContent = 'Launch';
    go.addEventListener('click', () => {
      if (this.cfg.mode === 'online') this.cb.onMultiplayer();
      else this.cb.onFly({ ...this.cfg });
    });

    this.selectJet(cfg.aircraft);
  }

  /** screen pixels the dock covers along the bottom (the hangar lifts the jet above it) */
  get inset(): number {
    if (this.root.classList.contains('hidden')) return 0;
    return Math.max(0, window.innerHeight - this.bar.getBoundingClientRect().top);
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (v) {
      this.weatherChoice.set(this.cb.weather());
      this.refresh();
      // fade and rise in
      this.root.classList.remove('fm-in');
      void this.root.offsetWidth;
      this.root.classList.add('fm-in');
    }
  }

  /** The caption, and which start choice (if any) the mode has. */
  private refresh(): void {
    const cfg = this.cfg;
    const s = SPECS[cfg.aircraft];
    const nick = LIBRARY[cfg.aircraft].nickname;
    let about = MODE_INFO[cfg.mode].subtitle;
    if (cfg.mode === 'daily') {
      const dm = todaysMission();
      about = dm.title + (dailyDone(dm.date) ? ' (done today)' : '');
    }
    const text = `${s.shortName} ${nick}`;
    if (this.jetName.textContent !== text) {
      this.jetName.textContent = text;
      this.caption.classList.remove('fm-fresh');
      void this.caption.offsetWidth;
      this.caption.classList.add('fm-fresh');
    }
    this.modeLine.textContent = `${MODES.find(([m]) => m === cfg.mode)?.[1]} · ${about}`;
    if (this.spawnChoice) {
      const which = cfg.mode === 'free' || cfg.mode === 'waves' || cfg.mode === 'duel' ? cfg.mode : null;
      this.spawn.classList.toggle('open', !!which);
      for (const [k, c] of Object.entries(this.spawnChoice)) c.root.classList.toggle('shown', k === which);
    }
  }

  selectJet(t: AircraftType): void {
    this.cfg.aircraft = t;
    const s = getSpec(t);
    if (!s.loadouts.find((l) => l.id === this.cfg.loadoutId)) this.cfg.loadoutId = s.loadouts[0].id;
    // the duel opponent can never be the same type as the player
    const enemies = enemyTypesFor(t);
    if (!enemies.includes(this.cfg.enemyType)) this.cfg.enemyType = enemies[0];
    this.refresh();
    this.cb.onSelectJet(t, this.cfg.loadoutId);
  }
}
