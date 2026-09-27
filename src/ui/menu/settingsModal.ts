// Settings: graphics (overall presets plus every individual option, applied
// live), controls (mouse mode, sensitivity, key rebinding), audio and
// gameplay. Docked to the right with a see-through backdrop so graphics
// changes can be judged on the picture behind it.

import { el, clearEl, button } from '../dom';
import { GameSettings, GRAPHICS_PRESETS, GraphicsOptions, GraphicsPreset, defaultGraphics } from '../../core/settings';
import { ACTION_LABELS, Action, DEFAULT_BINDINGS, Input } from '../../core/input';
import { keyLabel } from './screens';

type Tab = 'graphics' | 'controls' | 'audio' | 'gameplay';

const TABS: [Tab, string, string][] = [
  ['graphics', 'GRAPHICS', 'Quality, lighting, picture'],
  ['controls', 'CONTROLS', 'Mouse, keys, sensitivity'],
  ['audio', 'AUDIO', 'Volume and voice'],
  ['gameplay', 'GAMEPLAY', 'Labels, units, camera'],
];

const PRESET_CARDS: [Exclude<GraphicsPreset, 'custom'>, string, string][] = [
  ['low', 'LOW', 'Fastest. No shadows or bloom, lower resolution.'],
  ['medium', 'MEDIUM', 'Balanced. Mountain lighting, soft bloom, 2× MSAA.'],
  ['high', 'HIGH', 'Recommended. Soft shadows, cloud shadows, 4× MSAA.'],
  ['ultra', 'ULTRA', 'Everything maxed at your screen resolution, 8× MSAA.'],
  ['ultra4k', '4K ULTRA', 'Ultra rendered at 3840 × 2160. Needs a strong GPU.'],
];

/** options each preset controls: touching one of these makes the preset CUSTOM */
const PRESET_KEYS = new Set(Object.keys(GRAPHICS_PRESETS.high));

export class SettingsModal {
  readonly root: HTMLDivElement;
  private body: HTMLElement;
  private nav: HTMLElement;
  private tab: Tab = 'graphics';
  private listening: Action | null = null;
  private applyQueued = false;
  private infoEl: HTMLElement | null = null;
  private infoTimer = 0;

  constructor(
    parent: HTMLElement,
    private settings: GameSettings,
    private input: Input,
    private onApply: () => void,
    /** live readout for the graphics page (render size, frame rate) */
    private info?: () => string,
  ) {
    this.root = el('div', 'modal-back st-back hidden', parent);
    const m = el('div', 'st-panel', this.root);
    const head = el('div', 'st-head', m);
    const ht = el('div', 'st-title', head);
    el('h2', '', ht, 'SETTINGS');
    el('div', 'st-sub', ht, 'Changes apply instantly and are saved automatically');
    button('DONE', 'primary st-done', head, () => this.show(false));
    const main = el('div', 'st-main', m);
    this.nav = el('div', 'st-nav', main);
    this.body = el('div', 'st-body', main);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.show(false);
    });
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (v) {
      this.render();
      this.infoTimer = window.setInterval(() => {
        if (this.infoEl && this.info) this.infoEl.textContent = this.info();
      }, 500);
    } else {
      window.clearInterval(this.infoTimer);
      this.listening = null;
      this.input.onKey = null;
      this.onApply();
    }
  }

  /** Apply at most once per frame while sliders are dragged. */
  private applySoon(): void {
    if (this.applyQueued) return;
    this.applyQueued = true;
    requestAnimationFrame(() => {
      this.applyQueued = false;
      this.onApply();
    });
  }

  private render(): void {
    clearEl(this.nav);
    for (const [t, name, sub] of TABS) {
      const b = el('button', 'st-tab' + (t === this.tab ? ' active' : ''), this.nav);
      el('span', 'st-tab-name', b, name);
      el('span', 'st-tab-sub', b, sub);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.tab = t;
        this.render();
      });
    }
    const top = this.body.scrollTop;
    clearEl(this.body);
    this.infoEl = null;
    if (this.tab === 'graphics') this.graphics();
    else if (this.tab === 'controls') this.controls();
    else if (this.tab === 'audio') this.audio();
    else this.gameplay();
    this.body.scrollTop = top;
  }

  // ------------------------------------------------------------------ rows

  private section(title: string, note?: string): HTMLElement {
    const s = el('div', 'st-section', this.body);
    const h = el('div', 'st-sec-head', s);
    el('h3', '', h, title);
    if (note) el('span', '', h, note);
    return s;
  }

  private row(parent: HTMLElement, label: string, desc?: string): HTMLElement {
    const r = el('div', 'st-row', parent);
    const l = el('div', 'st-label', r);
    el('div', 'st-name', l, label);
    if (desc) el('div', 'st-desc', l, desc);
    return el('div', 'st-ctrl', r);
  }

  private seg<T extends string>(parent: HTMLElement, label: string, desc: string | undefined, opts: [T, string][], value: T, set: (v: T) => void): void {
    const c = this.row(parent, label, desc);
    const row = el('div', 'st-seg', c);
    for (const [v, t] of opts) {
      button(t, v === value ? 'active' : '', row, () => {
        set(v);
        this.onApply();
        this.render();
      });
    }
  }

  private toggle(parent: HTMLElement, label: string, desc: string | undefined, value: boolean, set: (v: boolean) => void): void {
    const c = this.row(parent, label, desc);
    const t = el('button', 'st-switch' + (value ? ' on' : ''), c);
    el('span', 'knob', t);
    el('span', 'st-switch-lbl', c, value ? 'ON' : 'OFF');
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      set(!value);
      this.onApply();
      this.render();
    });
  }

  private slider(
    parent: HTMLElement,
    label: string,
    desc: string | undefined,
    min: number,
    max: number,
    step: number,
    value: number,
    set: (v: number) => void,
    fmt = (v: number) => v.toFixed(2),
    live = false,
  ): void {
    const c = this.row(parent, label, desc);
    const wrap = el('div', 'st-slider', c);
    const r = el('input', '', wrap);
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    r.value = String(value);
    const out = el('span', 'st-val', wrap, fmt(value));
    const paint = () => r.style.setProperty('--fill', `${((+r.value - min) / (max - min)) * 100}%`);
    paint();
    r.addEventListener('input', () => {
      set(+r.value);
      out.textContent = fmt(+r.value);
      paint();
      if (live) this.applySoon();
    });
    r.addEventListener('change', () => this.onApply());
  }

  // -------------------------------------------------------------- graphics

  private graphics(): void {
    const g = this.settings.graphics;
    /** set a preset-driven option: the overall preset becomes CUSTOM */
    const P = <K extends keyof GraphicsOptions>(k: K) => (v: GraphicsOptions[K]) => {
      g[k] = v;
      if (PRESET_KEYS.has(k)) g.preset = 'custom';
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;

    // ---- overall preset
    const ps = this.section('OVERALL QUALITY', g.preset === 'custom' ? 'CUSTOM' : undefined);
    const cards = el('div', 'st-presets', ps);
    for (const [id, name, desc] of PRESET_CARDS) {
      const card = el('button', 'st-preset' + (g.preset === id ? ' active' : ''), cards);
      el('div', 'st-preset-bars', card).append(...[0, 1, 2, 3, 4].map((i) => {
        const b = document.createElement('i');
        if (i <= PRESET_CARDS.findIndex((p) => p[0] === id)) b.className = 'on';
        return b;
      }));
      el('div', 'st-preset-name', card, name);
      el('div', 'st-preset-desc', card, desc);
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        Object.assign(g, GRAPHICS_PRESETS[id]);
        g.preset = id;
        this.onApply();
        this.render();
      });
    }
    if (this.info) this.infoEl = el('div', 'st-info', ps, this.info());

    // ---- display
    const d = this.section('DISPLAY');
    this.seg(
      d,
      'RENDER RESOLUTION',
      'Pixels drawn each frame. 4K renders 3840 × 2160 and downsamples to your screen for razor-sharp edges.',
      [
        ['native', 'NATIVE'],
        ['1080', '1080p'],
        ['1440', '1440p'],
        ['2160', '4K'],
      ],
      g.resolution,
      P('resolution'),
    );
    this.slider(d, 'RESOLUTION SCALE', 'Fine-tune the resolution above. Lower it to gain frame rate.', 0.5, 1, 0.05, g.resolutionScale, P('resolutionScale'), pct);
    this.seg(
      d,
      'ANTI-ALIASING',
      'Multisample anti-aliasing smooths jagged edges on jets, runways and ridgelines.',
      [
        ['0', 'OFF'],
        ['2', 'MSAA 2×'],
        ['4', 'MSAA 4×'],
        ['8', 'MSAA 8×'],
      ],
      String(g.antialias) as '0' | '2' | '4' | '8',
      (v) => P('antialias')(+v as GraphicsOptions['antialias']),
    );
    this.slider(d, 'FIELD OF VIEW', 'Wider shows more around you; narrower magnifies distant jets.', 50, 100, 1, g.fov, (v) => (g.fov = v), (v) => `${v}°`, true);

    // ---- lighting
    const l = this.section('LIGHTING & EFFECTS');
    this.seg(
      l,
      'SHADOWS',
      'Sharp, soft shadows on jets, pylons, missiles and airfield buildings. Higher tiers use bigger, softer shadow maps.',
      [
        ['off', 'OFF'],
        ['low', 'LOW'],
        ['medium', 'MEDIUM'],
        ['high', 'HIGH'],
        ['ultra', 'ULTRA'],
      ],
      g.shadows,
      P('shadows'),
    );
    this.toggle(
      l,
      'MOUNTAIN LIGHTING',
      'The whole theater is lit from the real sun: mountains cast long shadows across valleys and fjords, and deep valleys get less sky light.',
      g.terrainLighting,
      P('terrainLighting'),
    );
    this.toggle(l, 'LIGHT SCATTERING', 'Sunlight glows through the haze around the sun and clouds get bright silver linings when backlit.', g.lightScattering, P('lightScattering'));
    this.slider(l, 'BLOOM', 'Glow around very bright light: the sun, afterburners, flares, explosions and runway lights.', 0, 1.5, 0.05, g.bloom, P('bloom'), (v) => (v < 0.01 ? 'OFF' : pct(v)), true);
    this.seg(
      l,
      'TONE MAPPING',
      'How bright light is mapped to your screen. Filmic is punchier and more saturated; AgX is soft and natural, like a film camera.',
      [
        ['neutral', 'NEUTRAL'],
        ['aces', 'FILMIC'],
        ['agx', 'AgX'],
      ],
      g.toneMapping,
      (v) => (g.toneMapping = v),
    );

    // ---- picture
    const pic = this.section('PICTURE');
    this.slider(pic, 'BRIGHTNESS', 'Overall exposure of the scene.', 0.5, 1.6, 0.02, g.exposure, (v) => (g.exposure = v), pct, true);
    this.slider(pic, 'CONTRAST', undefined, 0.6, 1.5, 0.02, g.contrast, (v) => (g.contrast = v), pct, true);
    this.slider(pic, 'SATURATION', undefined, 0, 1.6, 0.02, g.saturation, (v) => (g.saturation = v), pct, true);
    this.toggle(pic, 'VIGNETTE', 'Gently darkens the corners of the picture, like a camera lens.', g.vignette, (v) => (g.vignette = v));
    const rp = el('div', 'st-actions', pic);
    button('RESET PICTURE', 'small', rp, () => {
      const dflt = defaultGraphics();
      Object.assign(g, { exposure: dflt.exposure, contrast: dflt.contrast, saturation: dflt.saturation, vignette: dflt.vignette, toneMapping: dflt.toneMapping });
      this.onApply();
      this.render();
    });

    // ---- world
    const w = this.section('WORLD & CLOUDS');
    this.seg(
      w,
      'WORLD DETAIL',
      'Terrain mesh detail near and far, and how far out trees are drawn.',
      [
        ['low', 'LOW'],
        ['medium', 'MEDIUM'],
        ['high', 'HIGH'],
        ['ultra', 'ULTRA'],
      ],
      g.quality,
      P('quality'),
    );
    this.seg(
      w,
      'CLOUD QUALITY',
      'Puffs per cloud: higher is fuller, rounder cumulus.',
      [
        ['low', 'LOW'],
        ['medium', 'MEDIUM'],
        ['high', 'HIGH'],
        ['ultra', 'ULTRA'],
      ],
      g.cloudQuality,
      P('cloudQuality'),
    );
    this.toggle(w, 'CLOUD SHADOWS', 'Clouds cast soft shadows that drift across the land and the sea.', g.cloudShadows, P('cloudShadows'));

    const act = el('div', 'st-actions', this.body);
    button('RESET ALL GRAPHICS', 'small', act, () => {
      Object.assign(g, defaultGraphics());
      this.onApply();
      this.render();
    });
  }

  // -------------------------------------------------------------- controls

  private controls(): void {
    const s = this.settings.input;
    const m = this.section('FLYING');
    this.seg(
      m,
      'MOUSE MODE',
      'Mouse Aim: point where you want to go. Virtual Joystick: the mouse is the stick. Keyboard: fly with keys, mouse looks around.',
      [
        ['mouseaim', 'MOUSE AIM'],
        ['joystick', 'JOYSTICK'],
        ['keyboard', 'KEYBOARD'],
      ],
      s.mouseMode,
      (v) => (s.mouseMode = v),
    );
    this.slider(m, 'MOUSE SENSITIVITY', undefined, 0.2, 3, 0.05, s.sensitivity, (v) => (s.sensitivity = v));
    this.slider(m, 'KEYBOARD RESPONSE', 'How quickly keys move the controls to full deflection.', 1, 10, 0.5, s.keyboardRate, (v) => (s.keyboardRate = v), (v) => v.toFixed(1));
    this.slider(m, 'JOYSTICK RE-CENTRE', 'How fast the virtual stick returns to centre (off = stays put).', 0, 4, 0.1, s.joystickReturn, (v) => (s.joystickReturn = v), (v) => (v === 0 ? 'OFF' : v.toFixed(1)));
    this.seg(m, 'PITCH AXIS', undefined, [['normal', 'W = NOSE DOWN'], ['invert', 'W = NOSE UP']], s.invertPitch ? 'invert' : 'normal', (v) => (s.invertPitch = v === 'invert'));
    const k = this.section('KEY BINDINGS', 'CLICK A KEY, THEN PRESS THE NEW ONE · ESC CANCELS');
    const grid = el('div', 'bind-grid st-binds', k);
    for (const a of Object.keys(ACTION_LABELS) as Action[]) {
      el('div', '', grid, ACTION_LABELS[a]);
      const kb = el('div', 'bk' + (this.listening === a ? ' listening' : ''), grid, this.listening === a ? 'PRESS A KEY…' : s.bindings[a].map(keyLabel).join(' / '));
      kb.addEventListener('click', () => {
        this.listening = a;
        this.render();
        this.input.onKey = (code) => {
          this.input.onKey = null;
          if (code !== 'Escape') s.bindings[a] = [code];
          this.listening = null;
          this.onApply();
          this.render();
        };
      });
    }
    const act = el('div', 'st-actions', k);
    button('RESET ALL BINDINGS', 'small', act, () => {
      s.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
      this.onApply();
      this.render();
    });
  }

  // ----------------------------------------------------------------- audio

  private audio(): void {
    const a = this.settings.audio;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const v = this.section('VOLUME');
    this.slider(v, 'MASTER', undefined, 0, 1, 0.05, a.master, (x) => (a.master = x), pct, true);
    this.slider(v, 'ENGINES & WIND', undefined, 0, 1, 0.05, a.engine, (x) => (a.engine = x), pct, true);
    this.slider(v, 'WEAPONS & EXPLOSIONS', undefined, 0, 1, 0.05, a.effects, (x) => (a.effects = x), pct, true);
    this.slider(v, 'WARNING TONES', 'Radar warning receiver and missile seeker tones.', 0, 1, 0.05, a.warnings, (x) => (a.warnings = x), pct, true);
    const c = this.section('VOICE');
    this.toggle(c, 'VOICE WARNINGS', 'Cockpit voice calls: missile launches, altitude, fuel.', a.voice, (x) => (a.voice = x));
  }

  // -------------------------------------------------------------- gameplay

  private gameplay(): void {
    const g = this.settings.gameplay;
    const h = this.section('HUD & DISPLAY');
    this.seg(h, 'AIRCRAFT LABELS', 'Help spotting other jets at range.', [['off', 'OFF'], ['dots', 'DOTS'], ['full', 'FULL LABELS']], g.labels, (v) => (g.labels = v));
    this.seg(h, 'UNITS', undefined, [['imperial', 'KNOTS / FEET'], ['metric', 'KM/H / METRES']], g.units, (v) => (g.units = v));
    this.toggle(h, 'CONTROLS PANEL IN FLIGHT', 'The key reference panel on the right of the screen.', g.showHelp, (v) => (g.showHelp = v));
    this.seg(h, 'TOUCH CONTROLS', undefined, [['auto', 'AUTO'], ['on', 'ON'], ['off', 'OFF']], g.touchControls, (v) => (g.touchControls = v as typeof g.touchControls));
    const f = this.section('FLIGHT');
    this.toggle(f, 'AUTO COUNTERMEASURES', 'EPAWSS pops flares and chaff automatically against incoming missiles.', g.autoCountermeasures, (v) => (g.autoCountermeasures = v));
    this.seg(f, 'CHASE CAMERA', undefined, [['level', 'HORIZON LEVEL'], ['roll', 'FOLLOWS ROLL']], g.cameraRoll ? 'roll' : 'level', (v) => (g.cameraRoll = v === 'roll'));
  }
}
