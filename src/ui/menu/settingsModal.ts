// Settings: graphics, controls (mouse mode, sensitivity, key rebinding),
// audio and gameplay options.

import { el, clearEl, button } from '../dom';
import type { GameSettings } from '../../core/settings';
import { ACTION_LABELS, Action, DEFAULT_BINDINGS, Input } from '../../core/input';
import { keyLabel } from './screens';

type Tab = 'graphics' | 'controls' | 'audio' | 'gameplay';

export class SettingsModal {
  readonly root: HTMLDivElement;
  private body: HTMLElement;
  private tabsEl: HTMLElement;
  private tab: Tab = 'graphics';
  private listening: Action | null = null;

  constructor(
    parent: HTMLElement,
    private settings: GameSettings,
    private input: Input,
    private onApply: () => void,
  ) {
    this.root = el('div', 'modal-back hidden', parent);
    const m = el('div', 'modal', this.root);
    const head = el('div', 'modal-head', m);
    el('h2', '', head, 'SETTINGS');
    button('DONE', 'small primary', head, () => this.show(false));
    const b = el('div', 'modal-body', m);
    this.tabsEl = el('div', 'tabs', b);
    this.body = el('div', '', b);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.show(false);
    });
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (v) this.render();
    else {
      this.listening = null;
      this.input.onKey = null;
      this.onApply();
    }
  }

  private render(): void {
    clearEl(this.tabsEl);
    for (const t of ['graphics', 'controls', 'audio', 'gameplay'] as Tab[]) {
      button(t.toUpperCase(), 'small' + (t === this.tab ? ' active' : ''), this.tabsEl, () => {
        this.tab = t;
        this.render();
      });
    }
    clearEl(this.body);
    if (this.tab === 'graphics') this.graphics();
    else if (this.tab === 'controls') this.controls();
    else if (this.tab === 'audio') this.audio();
    else this.gameplay();
  }

  private seg<T extends string>(parent: HTMLElement, label: string, opts: [T, string][], value: T, set: (v: T) => void): void {
    const f = el('div', 'field', parent);
    el('label', '', f, label);
    const row = el('div', 'seg', f);
    for (const [v, t] of opts) {
      button(t, 'small' + (v === value ? ' active' : ''), row, () => {
        set(v);
        this.onApply();
        this.render();
      });
    }
  }

  private slider(parent: HTMLElement, label: string, min: number, max: number, step: number, value: number, set: (v: number) => void, fmt = (v: number) => v.toFixed(2)): void {
    const f = el('div', 'field', parent);
    const l = el('label', '', f, `${label}: ${fmt(value)}`);
    const r = el('input', '', f);
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    r.value = String(value);
    r.addEventListener('input', () => {
      set(+r.value);
      l.textContent = `${label}: ${fmt(+r.value)}`;
    });
    r.addEventListener('change', () => this.onApply());
  }

  private graphics(): void {
    const g = this.settings.graphics;
    const b = this.body;
    this.seg(b, 'QUALITY', [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH'], ['ultra', 'ULTRA']], g.quality, (v) => (g.quality = v));
    this.slider(b, 'RESOLUTION SCALE', 0.5, 1, 0.05, g.resolutionScale, (v) => (g.resolutionScale = v));
    this.seg(b, 'SHADOWS', [['on', 'ON'], ['off', 'OFF']], g.shadows ? 'on' : 'off', (v) => (g.shadows = v === 'on'));
    this.slider(b, 'FIELD OF VIEW', 50, 100, 1, g.fov, (v) => (g.fov = v), (v) => `${v}°`);
    this.seg(b, 'CLOUDS', [['clear', 'CLEAR'], ['scattered', 'SCATTERED'], ['broken', 'BROKEN']], g.clouds, (v) => (g.clouds = v));
    el('div', 'note', b, 'Quality scales terrain detail, tree draw distance and render resolution. Lower it if the frame rate drops over dense Samos forests.');
  }

  private controls(): void {
    const s = this.settings.input;
    const b = this.body;
    this.seg(
      b,
      'MOUSE MODE',
      [
        ['mouseaim', 'MOUSE AIM (INSTRUCTOR)'],
        ['joystick', 'VIRTUAL JOYSTICK'],
        ['keyboard', 'KEYBOARD + MOUSE LOOK'],
      ],
      s.mouseMode,
      (v) => (s.mouseMode = v),
    );
    this.slider(b, 'MOUSE SENSITIVITY', 0.2, 3, 0.05, s.sensitivity, (v) => (s.sensitivity = v));
    this.slider(b, 'KEYBOARD RESPONSE', 1, 10, 0.5, s.keyboardRate, (v) => (s.keyboardRate = v), (v) => v.toFixed(1));
    this.slider(b, 'JOYSTICK RE-CENTRE', 0, 4, 0.1, s.joystickReturn, (v) => (s.joystickReturn = v), (v) => (v === 0 ? 'OFF' : v.toFixed(1)));
    this.seg(b, 'PITCH AXIS', [['normal', 'NORMAL (W = NOSE DOWN)'], ['invert', 'INVERTED (W = NOSE UP)']], s.invertPitch ? 'invert' : 'normal', (v) => (s.invertPitch = v === 'invert'));
    el('h3', '', b, 'KEY BINDINGS — CLICK A KEY, THEN PRESS THE NEW KEY (ESC CANCELS)');
    const grid = el('div', 'bind-grid', b);
    for (const a of Object.keys(ACTION_LABELS) as Action[]) {
      el('div', '', grid, ACTION_LABELS[a]);
      const k = el('div', 'bk' + (this.listening === a ? ' listening' : ''), grid, this.listening === a ? 'PRESS A KEY…' : s.bindings[a].map(keyLabel).join(' / '));
      k.addEventListener('click', () => {
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
    button('RESET ALL BINDINGS', 'small', b, () => {
      s.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
      this.onApply();
      this.render();
    });
  }

  private audio(): void {
    const a = this.settings.audio;
    const b = this.body;
    this.slider(b, 'MASTER', 0, 1, 0.05, a.master, (v) => (a.master = v), (v) => `${Math.round(v * 100)}%`);
    this.slider(b, 'ENGINES & WIND', 0, 1, 0.05, a.engine, (v) => (a.engine = v), (v) => `${Math.round(v * 100)}%`);
    this.slider(b, 'WEAPONS & EXPLOSIONS', 0, 1, 0.05, a.effects, (v) => (a.effects = v), (v) => `${Math.round(v * 100)}%`);
    this.slider(b, 'WARNING TONES (RWR / SEEKER)', 0, 1, 0.05, a.warnings, (v) => (a.warnings = v), (v) => `${Math.round(v * 100)}%`);
    this.seg(b, 'VOICE WARNINGS', [['on', 'ON'], ['off', 'OFF']], a.voice ? 'on' : 'off', (v) => (a.voice = v === 'on'));
  }

  private gameplay(): void {
    const g = this.settings.gameplay;
    const b = this.body;
    this.seg(b, 'AIRCRAFT LABELS', [['off', 'OFF'], ['dots', 'SPOTTING DOTS'], ['full', 'FULL LABELS']], g.labels, (v) => (g.labels = v));
    this.seg(b, 'UNITS', [['imperial', 'KNOTS / FEET'], ['metric', 'KM/H / METRES']], g.units, (v) => (g.units = v));
    this.seg(b, 'AUTO COUNTERMEASURES (EPAWSS)', [['on', 'ON'], ['off', 'OFF']], g.autoCountermeasures ? 'on' : 'off', (v) => (g.autoCountermeasures = v === 'on'));
    this.seg(b, 'CHASE CAMERA', [['level', 'HORIZON LEVEL'], ['roll', 'FOLLOWS ROLL']], g.cameraRoll ? 'roll' : 'level', (v) => (g.cameraRoll = v === 'roll'));
    this.seg(b, 'CONTROLS PANEL IN FLIGHT', [['on', 'SHOW'], ['off', 'HIDE']], g.showHelp ? 'on' : 'off', (v) => (g.showHelp = v === 'on'));
    this.seg(b, 'TOUCH CONTROLS', [['auto', 'AUTO'], ['on', 'ON'], ['off', 'OFF']], g.touchControls, (v) => (g.touchControls = v as typeof g.touchControls));
  }
}
