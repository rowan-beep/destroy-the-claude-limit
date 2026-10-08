// Loading screen, pause menu, results screen, controls reference.

import { OCEAN_KEY_SECTIONS } from '../../ocean/keys';
import { renderDebrief } from './debrief';
import type { MapData } from '../../world/mapData';
import { el, clearEl, button } from '../dom';
import type { MissionResult, Briefing } from '../../game/modes/mode';
import { ACTION_LABELS, Action, InputSettings } from '../../core/input';
import { SPACE_KEY_SECTIONS } from '../../space/keyHelp';

const TIPS = [
  'Afterburner drains fuel roughly ten times faster than cruise. Use it to fight, not to commute.',
  'Terrain blocks radar. Fly low behind a mountain ridge and nobody can lock you.',
  'Beam an incoming AMRAAM (put it at your 3 or 9 o\'clock) while low to hide in the Doppler notch, and drop chaff.',
  'Past 4 G the colour drains, past 8 G the world goes black and white, at 10.5 G you pass out for ten seconds.',
  'Pushing negative G reddens your vision: -2 G is a 50% red-out, -5 G blinds you completely.',
  'The Typhoon\'s PIRATE IRST tracks targets passively — their RWR stays silent. Press [I] to lock.',
  'The F-15EX\'s EPAWSS can dispense countermeasures automatically when a missile is about to hit.',
  'Listen for the AIM-9X tone: a low growl while searching, a high steady tone when locked.',
  'Hold [Shift] at 100 % to push the throttle through the detent into afterburner, or tap [Tab].',
  'Land on a friendly runway, stop, and press [H] to rearm, refuel and repair.',
];

export class LoadingScreen {
  readonly root: HTMLDivElement;
  private fill: HTMLElement;
  private label: HTMLElement;
  private tip: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'loading', parent);
    el('h1', '', this.root, 'TRIAD');
    el('div', 'lbl', this.root, 'AIR COMBAT SIMULATOR');
    const bar = el('div', 'bar', this.root);
    this.fill = el('div', 'fill', bar);
    this.label = el('div', 'lbl', this.root, 'LOADING');
    this.tip = el('div', 'tip', this.root, TIPS[Math.floor(Math.random() * TIPS.length)]);
  }

  set(frac: number, label: string): void {
    this.fill.style.width = `${Math.round(frac * 100)}%`;
    this.label.textContent = label;
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (v) this.tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  }
}

export class PauseMenu {
  readonly root: HTMLDivElement;
  constructor(
    parent: HTMLElement,
    cb: { resume: () => void; settings: () => void; controls: () => void; restart: () => void; quit: () => void },
  ) {
    this.root = el('div', 'modal-back hidden', parent);
    const m = el('div', 'pause-menu', this.root);
    el('h2', '', m, 'PAUSED');
    button('RESUME', 'primary', m, cb.resume);
    button('SETTINGS', '', m, cb.settings);
    button('CONTROLS', '', m, cb.controls);
    this.restartBtn = button('RESTART MISSION', '', m, cb.restart);
    button('QUIT TO MAIN MENU', '', m, cb.quit);
  }
  private restartBtn: HTMLElement;
  /** (an online match can't be restarted: the button is hidden there) */
  show(v: boolean, canRestart = true): void {
    this.root.classList.toggle('hidden', !v);
    this.restartBtn.style.display = canRestart ? '' : 'none';
  }
}

/** Daily mission (and other) briefings: the mission waits until OKAY. */
export class BriefingModal {
  readonly root: HTMLDivElement;
  private box: HTMLDivElement;
  constructor(
    parent: HTMLElement,
    private onOk: () => void,
    private onChoice: (i: number) => void = () => undefined,
  ) {
    this.root = el('div', 'modal-back briefing-back hidden', parent);
    this.box = el('div', 'briefing', this.root);
  }
  show(b: Briefing | null): void {
    this.root.classList.toggle('hidden', !b);
    if (!b) return;
    const m = this.box;
    clearEl(m);
    el('div', 'bk', m, b.kicker);
    el('h2', '', m, b.title);
    el('p', 'bs', m, b.story);
    el('div', 'bh', m, b.heading ?? 'YOUR MISSION');
    const ol = el('ol', 'bt', m);
    for (const t of b.tasks) el('li', '', ol, t);
    if (b.footer) el('div', 'bf', m, b.footer);
    if (b.choices?.length) {
      const row = el('div', 'bchoices', m);
      b.choices.forEach((c, i) => {
        const btn = button('', 'bchoice', row, () => this.onChoice(i));
        el('b', '', btn, c.label);
        if (c.detail) el('span', '', btn, c.detail);
      });
      return;
    }
    const ok = button('OKAY', 'primary big', m, () => this.onOk());
    setTimeout(() => ok.focus(), 0);
  }
}

export class ResultsScreen {
  readonly root: HTMLDivElement;
  private box: HTMLElement;
  constructor(
    parent: HTMLElement,
    private onAction: (a: string) => void,
    private mapData: () => MapData | null = () => null,
  ) {
    this.root = el('div', 'modal-back hidden', parent);
    this.box = el('div', 'results', this.root);
  }
  show(r: MissionResult | null): void {
    this.root.classList.toggle('hidden', !r);
    if (!r) return;
    clearEl(this.box);
    this.box.classList.toggle('wide', !!r.debrief);
    el('h1', r.good ? 'good' : 'bad', this.box, r.title);
    el('div', 'rs', this.box, r.subtitle);
    const t = el('table', 'specs', this.box);
    for (const [k, v] of r.stats) {
      const tr = el('tr', '', t);
      el('td', '', tr, k);
      el('td', '', tr, v);
    }
    if (r.debrief) renderDebrief(this.box, r.debrief.sortie, r.debrief.earned, this.mapData());
    const b = el('div', 'btns', this.box);
    for (const btn of r.buttons) {
      button(btn.label, btn.action === 'menu' ? '' : 'primary', b, () => this.onAction(btn.action));
    }
  }
}

export function keyLabel(code: string): string {
  if (code.startsWith('GP_')) return 'PAD ' + code.slice(3);
  const map: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'L-SHIFT',
    ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL',
    ControlRight: 'R-CTRL',
    Space: 'SPACE',
    Backquote: '`',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Escape: 'ESC',
    Equal: '=',
    Minus: '-',
    NumpadAdd: 'NUM +',
    NumpadSubtract: 'NUM -',
    Tab: 'TAB',
    Home: 'HOME',
  };
  if (map[code]) return map[code];
  return code.replace(/^Key/, '').replace(/^Digit/, '');
}

export class ControlsModal {
  readonly root: HTMLDivElement;
  private body: HTMLElement;
  constructor(parent: HTMLElement) {
    this.root = el('div', 'modal-back hidden', parent);
    const m = el('div', 'modal', this.root);
    const head = el('div', 'modal-head', m);
    el('h2', '', head, 'CONTROLS');
    button('CLOSE', 'small', head, () => this.show(false));
    this.body = el('div', 'modal-body', m);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.show(false);
    });
  }
  /** the space program's keys, mission by mission (the flight keys above are the jets') */
  showSpace(): void {
    this.root.classList.remove('hidden');
    clearEl(this.body);
    el('div', 'note', this.body, 'Every mission also shows its own keys in flight: press H or the ? button. The mouse drags the view round and the wheel zooms everywhere.');
    for (const [title, rows] of SPACE_KEY_SECTIONS) {
      el('h3', 'keys-h', this.body, title);
      const g = el('div', 'bind-grid keys-ro', this.body);
      for (const [k, t] of rows) {
        el('div', '', g, t);
        el('div', 'bk', g, k);
      }
    }
  }
  /** the ocean's keys (the jet's are not used there) */
  showOcean(): void {
    this.root.classList.remove('hidden');
    clearEl(this.body);
    el('div', 'note', this.body, 'The same keys are in every dive: press H or the ? button. Drag to look round; the wheel zooms the chase camera.');
    for (const rows of OCEAN_KEY_SECTIONS) {
      const g0 = rows.find(([k]) => k === '#');
      if (g0) el('h3', 'keys-h', this.body, g0[1]);
      const g = el('div', 'bind-grid keys-ro', this.body);
      for (const [k, t] of rows) {
        if (k === '#') continue;
        el('div', '', g, t);
        el('div', 'bk', g, k);
      }
    }
  }
  show(v: boolean, input?: InputSettings): void {
    this.root.classList.toggle('hidden', !v);
    if (!v || !input) return;
    clearEl(this.body);
    el('div', 'note', this.body, `MOUSE MODE: ${input.mouseMode === 'mouseaim' ? 'MOUSE AIM — move the mouse to point where you want to fly; the fly-by-wire instructor steers there. Keyboard W/S/A/D overrides. Left click fires, hold right mouse to look around.' : input.mouseMode === 'joystick' ? 'VIRTUAL JOYSTICK — mouse movement deflects the stick (it recentres). Left click fires, right mouse to look.' : 'KEYBOARD — fly with W/S/A/D/Q/E; hold right mouse and drag to look around the jet (full 360° in chase view).'}  Gamepads are supported (left stick fly, triggers throttle, A fire).`);
    const g = el('div', 'bind-grid', this.body);
    for (const a of Object.keys(ACTION_LABELS) as Action[]) {
      el('div', '', g, ACTION_LABELS[a]);
      el('div', 'bk', g, input.bindings[a].filter((c) => !c.startsWith('GP_')).map(keyLabel).join('  /  ') || '—');
    }
  }
}
