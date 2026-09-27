// In-flight weather control, top left: pick clear, cloudy, overcast, rain,
// storm or snow and fine-tune cloud cover, rain / snow and visibility. The
// arrow tab slides it off the screen and back.

import { el } from './dom';
import { Weather, WeatherKind, WEATHER_KINDS, WEATHER_PRESETS, saveWeather } from '../world/weather';

const OPEN_KEY = 'triad.weatherWidget.open';

const ICON: Record<WeatherKind, string> = {
  clear: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  cloudy: '<circle cx="8" cy="8" r="3"/><path d="M8 2.5v1.6M2.5 8h1.6M4.1 4.1l1.1 1.1M11.9 4.1l-1.1 1.1"/><path d="M7 19h10a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7 19z"/>',
  overcast: '<path d="M5 13h11a3 3 0 0 0 .3-6 4.4 4.4 0 0 0-8.5 1A2.6 2.6 0 0 0 5 13z"/><path d="M8 20h11a3 3 0 0 0 .3-6 4.4 4.4 0 0 0-8.5 1A2.6 2.6 0 0 0 8 20z"/>',
  rain: '<path d="M6 14h11a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 6 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  storm: '<path d="M6 13h11a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 6 13z"/><path d="M12.5 14l-2.5 4h3l-2 4"/>',
  snow: '<path d="M6 13h11a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 6 13z"/><path d="M8 17v3M6.6 18.5h2.8M16 17v3M14.6 18.5h2.8M12 19v3M10.6 20.5h2.8"/>',
};

const svg = (k: WeatherKind) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

interface SliderRow {
  input: HTMLInputElement;
  value: HTMLElement;
  row: HTMLElement;
}

export class WeatherWidget {
  readonly root: HTMLDivElement;
  private tab: HTMLButtonElement;
  private kindButtons = new Map<WeatherKind, HTMLButtonElement>();
  private cover!: SliderRow;
  private precip!: SliderRow;
  private vis!: SliderRow;
  private w: Weather;
  private applyTimer = 0;
  private kindName: HTMLElement;

  constructor(
    parent: HTMLElement,
    initial: Weather,
    private onChange: (w: Weather) => void,
  ) {
    this.w = { ...initial };
    this.root = el('div', 'wx-widget hidden', parent);
    const panel = el('div', 'wx-panel', this.root);
    const head = el('div', 'wx-head', panel);
    el('span', 'wx-title', head, 'WEATHER');
    this.kindName = el('span', 'wx-kind-name', head, '');
    const kinds = el('div', 'wx-kinds', panel);
    for (const [k, label] of WEATHER_KINDS) {
      const b = el('button', 'wx-kind', kinds);
      b.type = 'button';
      b.tabIndex = -1;
      b.title = label;
      b.innerHTML = `${svg(k)}<span>${label}</span>`;
      b.addEventListener('click', () => {
        this.w = { ...WEATHER_PRESETS[k] };
        this.sync();
        this.apply(true);
        b.blur();
      });
      this.kindButtons.set(k, b);
    }
    this.cover = this.slider(panel, 'CLOUD COVER', (v) => (this.w.cover = v));
    this.precip = this.slider(panel, 'RAIN / SNOW', (v) => (this.w.precip = v));
    this.vis = this.slider(panel, 'VISIBILITY', (v) => (this.w.vis = v));
    el('div', 'wx-sub', panel, 'Only changes your own screen.');

    this.tab = el('button', 'wx-tab', this.root);
    this.tab.type = 'button';
    this.tab.tabIndex = -1;
    this.tab.addEventListener('click', () => {
      this.setOpen(this.root.classList.contains('closed'));
      this.tab.blur();
    });
    // keep clicks and keys on the widget away from the flight controls
    for (const ev of ['mousedown', 'pointerdown', 'wheel', 'contextmenu']) this.root.addEventListener(ev, (e) => e.stopPropagation());
    // short screens: start tucked away (it would cover the flight panel)
    let open = window.innerHeight >= 820;
    try {
      const saved = localStorage.getItem(OPEN_KEY);
      if (saved !== null) open = saved !== '0';
    } catch {
      /* storage unavailable */
    }
    this.setOpen(open);
    this.sync();
  }

  private slider(parent: HTMLElement, label: string, set: (v: number) => void): SliderRow {
    const row = el('div', 'wx-row', parent);
    const top = el('div', 'wx-row-top', row);
    el('span', 'wx-label', top, label);
    const value = el('span', 'wx-value', top, '');
    const input = el('input', 'wx-range', row);
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.tabIndex = -1;
    input.addEventListener('input', () => {
      set(+input.value / 100);
      this.syncValues();
      this.apply(false);
    });
    // hand the arrow keys back to the flight controls
    input.addEventListener('change', () => input.blur());
    input.addEventListener('pointerup', () => input.blur());
    return { input, value, row };
  }

  private setOpen(open: boolean): void {
    this.root.classList.toggle('closed', !open);
    this.tab.innerHTML = open ? '&#9664;' : '&#9654;';
    this.tab.title = open ? 'Hide weather' : 'Weather';
    try {
      localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }

  /** Apply now (a preset) or shortly after the slider settles. */
  private apply(now: boolean): void {
    clearTimeout(this.applyTimer);
    const go = () => {
      saveWeather(this.w);
      this.onChange({ ...this.w });
    };
    if (now) go();
    else this.applyTimer = window.setTimeout(go, 140);
  }

  private sync(): void {
    for (const [k, b] of this.kindButtons) b.classList.toggle('on', k === this.w.kind);
    this.kindName.textContent = WEATHER_KINDS.find(([k]) => k === this.w.kind)?.[1] ?? '';
    this.cover.input.value = String(Math.round(this.w.cover * 100));
    this.precip.input.value = String(Math.round(this.w.precip * 100));
    this.vis.input.value = String(Math.round(this.w.vis * 100));
    this.syncValues();
  }

  private syncValues(): void {
    const w = this.w;
    const wet = w.kind === 'rain' || w.kind === 'storm' || w.kind === 'snow';
    this.precip.row.classList.toggle('off', !wet);
    this.precip.input.disabled = !wet;
    this.precip.value.textContent = wet ? `${Math.round(w.precip * 100)}%` : 'NONE';
    this.cover.value.textContent = w.cover < 0.2 ? 'FEW' : w.cover < 0.5 ? 'SCATTERED' : w.cover < 0.8 ? 'BROKEN' : 'OVERCAST';
    // visibility shown as a rough distance in nautical miles
    const nm = Math.round(2 + Math.pow(w.vis, 1.6) * 48);
    this.vis.value.textContent = `~${nm} NM`;
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }
}
