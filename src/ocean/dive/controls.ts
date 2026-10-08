// Touch and gamepad controls for a dive. They drive the boat the way the keys
// do: held controls as analog values (-1..1, added to the keys) and one-shot
// orders by the key they stand for, so the dive does not care where an order
// came from. The touch layer shows on touch screens; a gamepad works whenever
// one is connected (standard layout).

import { el } from '../../ui/dom';

export interface Analog {
  thrust: number;
  yaw: number;
  vertical: number;
  lateral: number;
  /** +1 floods the tanks (Z), -1 blows them (X) */
  ballast: number;
}

export const zeroAnalog = (): Analog => ({ thrust: 0, yaw: 0, vertical: 0, lateral: 0, ballast: 0 });

/** what the controls can ask of the dive */
export interface ControlTarget {
  /** a one-shot order, by the key code it stands for */
  command(code: string): void;
  /** turn the camera (pixels of drag) */
  look(dx: number, dy: number): void;
  /** zoom the chase camera by a factor (>1 further away) */
  zoom(k: number): void;
  readonly emergency: boolean;
}

/** what the touch buttons show as switched on */
export interface ControlState {
  quiet: boolean;
  lamps: boolean;
  holdDepth: boolean;
  holdPos: boolean;
  overlay: boolean;
  time: number;
  emergency: boolean;
}

/** seconds the emergency blow must be held, on the touch button or the D-pad */
export const EMERGENCY_HOLD_S = 2;

/** deadzone with the range rescaled, so small deflections still count once past it */
export function deadzone(v: number, dz = 0.15): number {
  const a = Math.abs(v);
  return a < dz ? 0 : (Math.sign(v) * (a - dz)) / (1 - dz);
}

// ---------------------------------------------------------------- gamepad
/** standard-layout buttons to the orders they give (pressed once) */
const PAD_PRESS: Record<number, string> = {
  0: 'KeyE', // A: use
  1: 'KeyP', // B: ping
  2: 'KeyQ', // X: Quiet Survey
  3: 'KeyL', // Y: lamps
  8: 'KeyM', // View / Back: chart
  9: 'Escape', // Menu / Start: pause
  10: 'KeyC', // left stick press: camera
  11: 'KeyO', // right stick press: sonar overlay
  14: 'KeyT', // D-pad left: hold depth
  15: 'KeyG', // D-pad right: hold position
};

export class DiveGamepad {
  readonly analog = zeroAnalog();
  connected = false;
  private prev: boolean[] = [];
  /** when D-pad up went down (wall clock, ms: a hold is timed in real seconds, whatever the frame rate) */
  private upSince = -1;
  private blew = false;

  /** read the first connected pad; `drive` false (paused, chart open) leaves only the orders */
  poll(dt: number, t: ControlTarget, drive: boolean): void {
    const a = this.analog;
    let pad: Gamepad | null = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected && (!pad || p.mapping === 'standard')) pad = p;
    } catch {
      pad = null;
    }
    this.connected = !!pad;
    if (!pad) {
      Object.assign(a, zeroAnalog());
      this.prev = [];
      return;
    }
    const pressed = pad.buttons.map((b) => b.pressed);
    // the orders, on the press
    for (const [i, code] of Object.entries(PAD_PRESS)) {
      const k = Number(i);
      if (pressed[k] && !this.prev[k]) t.command(code);
    }
    this.prev = pressed;
    if (!drive) {
      Object.assign(a, zeroAnalog());
      this.upSince = -1;
      return;
    }
    const ax = (i: number) => deadzone(pad!.axes[i] ?? 0);
    const val = (i: number) => pad!.buttons[i]?.value ?? 0;
    // left stick: ahead / astern and turn; triggers: up and down; bumpers: side thrusters
    a.thrust = -ax(1);
    a.yaw = ax(0);
    a.vertical = val(7) - val(6);
    a.lateral = (pressed[5] ? 1 : 0) - (pressed[4] ? 1 : 0);
    // D-pad up blows the tanks, down floods them; up held 2 s is the emergency blow
    a.ballast = (pressed[13] ? 1 : 0) - (pressed[12] ? 1 : 0);
    if (pressed[12]) {
      const now = performance.now();
      if (this.upSince < 0) this.upSince = now;
      if (now - this.upSince >= EMERGENCY_HOLD_S * 1000 && !this.blew) {
        this.blew = true;
        if (!t.emergency) t.command('KeyB');
      }
    } else {
      this.upSince = -1;
      this.blew = false;
    }
    // right stick: the camera
    const lx = ax(2), ly = ax(3);
    if (lx || ly) t.look(lx * 700 * dt, ly * 480 * dt);
  }
}

// ---------------------------------------------------------------- touch
const CSS = `
.oct { position: fixed; inset: 0; z-index: 31; pointer-events: none; font-family: 'Segoe UI', system-ui, sans-serif; color: #e6fbff; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.oct.hidden, .oct.away { display: none; }
.oct-stick { position: absolute; left: calc(20px + env(safe-area-inset-left, 0px)); bottom: calc(60px + env(safe-area-inset-bottom, 0px)); width: 140px; height: 140px; border-radius: 50%; border: 2px solid rgba(124, 240, 200, 0.35); background: rgba(3, 16, 24, 0.38); pointer-events: auto; touch-action: none; display: flex; align-items: center; justify-content: center; }
.oct-stick .knob { width: 56px; height: 56px; border-radius: 50%; background: rgba(124, 240, 200, 0.28); border: 2px solid rgba(124, 240, 200, 0.75); pointer-events: none; }
.oct-stick .l { position: absolute; font-size: 9px; letter-spacing: 0.14em; color: #8fb3bf; pointer-events: none; }
.oct-stick .l.t { top: 8px; } .oct-stick .l.b { bottom: 8px; }
.oct-pad { position: absolute; right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); display: grid; grid-template-columns: repeat(4, 58px); gap: 6px; pointer-events: auto; }
.oct-b { position: relative; overflow: hidden; height: 44px; border-radius: 8px; border: 1px solid rgba(124, 240, 200, 0.35); background: rgba(3, 16, 24, 0.6); display: flex; align-items: center; justify-content: center; text-align: center; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; line-height: 1.1; touch-action: none; }
.oct-b.on { background: rgba(124, 240, 200, 0.32); border-color: rgba(124, 240, 200, 0.8); }
.oct-b.down { background: rgba(124, 240, 200, 0.45); }
.oct-b.wide { grid-column: span 2; }
.oct-b.warn { border-color: rgba(255, 120, 90, 0.6); color: #ffc4b3; }
.oct-b.warn.on { background: rgba(255, 98, 98, 0.4); }
.oct-b .fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: rgba(255, 98, 98, 0.4); pointer-events: none; }
.oct-b span { position: relative; pointer-events: none; }
.oc-hud.touch .oc-mini { display: none; }
.oc-hud.touch .oc-survey { left: calc(50% - 110px); width: min(700px, 54vw); }
@media (max-width: 900px), (max-height: 520px) {
  .oct-stick { width: 118px; height: 118px; bottom: calc(52px + env(safe-area-inset-bottom, 0px)); }
  .oct-stick .knob { width: 46px; height: 46px; }
  .oct-pad { grid-template-columns: repeat(4, 50px); gap: 5px; }
  .oct-b { height: 36px; font-size: 9.5px; }
}
/* a phone held sideways: the instruments shrink to the top corners, the survey panel moves to the top */
@media (max-height: 520px) {
  .oc-hud.touch .oc-obj { max-width: 36vw; padding: 6px 10px; }
  .oc-hud.touch .oc-task { font-size: 14px; }
  .oc-hud.touch .oc-hint { display: none; }
  .oc-hud.touch .oc-compass { left: 60%; width: 40vw; }
  .oc-hud.touch .oc-left { top: 78px; transform: scale(0.7); transform-origin: top left; }
  .oc-hud.touch .oc-right { top: 62px; transform: scale(0.7); transform-origin: top right; }
  .oc-hud.touch .oc-survey { top: 60px; bottom: auto; left: 50%; width: 640px; transform: translateX(-50%) scale(0.72); transform-origin: top center; }
  .oct-stick { left: calc(100px + env(safe-area-inset-left, 0px)); }
}
`;

interface PadButton {
  label: string;
  /** a held control (field and value) or a one-shot order (key code) */
  hold?: [keyof Analog, number];
  code?: string;
  /** which state lights it */
  on?: keyof ControlState;
  cls?: string;
}

export class DiveTouch {
  readonly root: HTMLDivElement;
  readonly analog = zeroAnalog();
  /** two fingers on the view: zooming, not turning the camera */
  pinching = false;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private centre = { x: 0, y: 0 };
  private lit: { e: HTMLElement; on: keyof ControlState }[] = [];
  private timeBtn: HTMLElement | null = null;
  private emergFill: HTMLElement | null = null;
  /** when the emergency button went down (wall clock, ms), or -1 */
  private emergSince = -1;
  private emergBtn: HTMLElement | null = null;
  private fingers = new Map<number, { x: number; y: number }>();
  private pinchD = 0;

  constructor(parent: HTMLElement, private t: ControlTarget) {
    if (!document.getElementById('oct-css')) {
      const st = document.createElement('style');
      st.id = 'oct-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = el('div', 'oct hidden', parent);
    // the stick: up ahead, down astern, sideways turns
    this.stick = el('div', 'oct-stick', this.root);
    el('div', 'l t', this.stick, 'AHEAD');
    el('div', 'l b', this.stick, 'ASTERN');
    this.knob = el('div', 'knob', this.stick);
    this.stick.addEventListener('pointerdown', (e) => this.stickStart(e));
    this.stick.addEventListener('pointermove', (e) => this.stickMove(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) this.stick.addEventListener(ev, (e) => this.stickEnd(e as PointerEvent));
    const pad = el('div', 'oct-pad', this.root);
    const btns: PadButton[] = [
      { label: 'TIME ×1', code: 'TimeCycle' },
      { label: 'SONAR VIEW', code: 'KeyO', on: 'overlay' },
      { label: 'EMERGENCY BLOW', cls: 'wide warn', on: 'emergency' },
      { label: '▲ UP', hold: ['vertical', 1] },
      { label: 'FLOOD', hold: ['ballast', 1] },
      { label: 'LISTEN', code: 'KeyQ', on: 'quiet' },
      { label: 'PING', code: 'KeyP' },
      { label: '▼ DOWN', hold: ['vertical', -1] },
      { label: 'BLOW', hold: ['ballast', -1] },
      { label: 'USE', code: 'KeyE' },
      { label: 'LAMPS', code: 'KeyL', on: 'lamps' },
      { label: '◀ SIDE', hold: ['lateral', -1] },
      { label: 'SIDE ▶', hold: ['lateral', 1] },
      { label: 'HOLD DEPTH', code: 'KeyT', on: 'holdDepth' },
      { label: 'HOLD POS', code: 'KeyG', on: 'holdPos' },
    ];
    for (const b of btns) this.button(pad, b);
    // two fingers on the view zoom the chase camera
    window.addEventListener('pointerdown', (e) => this.fingerDown(e));
    window.addEventListener('pointermove', (e) => this.fingerMove(e));
    for (const ev of ['pointerup', 'pointercancel'] as const) window.addEventListener(ev, (e) => this.fingerUp(e as PointerEvent));
  }

  private button(parent: HTMLElement, b: PadButton): void {
    const e = el('div', 'oct-b' + (b.cls ? ' ' + b.cls : ''), parent);
    el('span', '', e, b.label);
    if (b.on) this.lit.push({ e, on: b.on });
    if (b.code === 'TimeCycle') this.timeBtn = e.firstChild as HTMLElement;
    const emergency = b.label === 'EMERGENCY BLOW';
    if (emergency) {
      this.emergBtn = e;
      this.emergFill = el('div', 'fill', e);
      e.insertBefore(this.emergFill, e.firstChild);
    }
    const down = (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        e.setPointerCapture(ev.pointerId);
      } catch {
        /* gone */
      }
      e.classList.add('down');
      if (b.hold) this.analog[b.hold[0]] = b.hold[1];
      else if (b.code) this.t.command(b.code);
      else if (emergency) {
        // already blowing: one tap stops it; otherwise hold to confirm
        if (this.t.emergency) this.t.command('KeyB');
        else this.emergSince = performance.now();
      }
    };
    const up = (ev: PointerEvent) => {
      ev.preventDefault();
      e.classList.remove('down');
      if (b.hold && this.analog[b.hold[0]] === b.hold[1]) this.analog[b.hold[0]] = 0;
      if (emergency) this.emergSince = -1;
    };
    e.addEventListener('pointerdown', down);
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', up);
    e.addEventListener('lostpointercapture', up);
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (!on) {
      Object.assign(this.analog, zeroAnalog());
      this.stickId = null;
      this.knob.style.transform = '';
      this.emergSince = -1;
      this.fingers.clear();
      this.pinching = false;
    }
  }

  get shown(): boolean {
    return !this.root.classList.contains('hidden') && !this.root.classList.contains('away');
  }

  /** out of the way while a card, the chart or the pause menu is up (held controls let go) */
  setAway(v: boolean): void {
    if (v === this.root.classList.contains('away')) return;
    this.root.classList.toggle('away', v);
    if (v) {
      Object.assign(this.analog, zeroAnalog());
      this.stickId = null;
      this.knob.style.transform = '';
      this.emergSince = -1;
      for (const b of this.root.querySelectorAll('.oct-b.down')) b.classList.remove('down');
    }
  }

  /** the buttons' lights, and the emergency button's hold */
  sync(s: ControlState): void {
    for (const l of this.lit) l.e.classList.toggle('on', !!s[l.on]);
    if (this.timeBtn) this.timeBtn.textContent = `TIME ×${s.time}`;
    let held = 0;
    if (this.emergSince >= 0) {
      held = (performance.now() - this.emergSince) / 1000;
      if (held >= EMERGENCY_HOLD_S) {
        this.emergSince = -1;
        held = 0;
        if (!this.t.emergency) this.t.command('KeyB');
      }
    }
    if (this.emergFill) this.emergFill.style.width = `${Math.min(100, (held / EMERGENCY_HOLD_S) * 100)}%`;
  }

  private stickStart(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.stickId = e.pointerId;
    try {
      this.stick.setPointerCapture(e.pointerId);
    } catch {
      /* gone */
    }
    const r = this.stick.getBoundingClientRect();
    this.centre = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    this.stickMove(e);
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    const R = this.stick.clientWidth / 2;
    let dx = (e.clientX - this.centre.x) / R, dy = (e.clientY - this.centre.y) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    this.knob.style.transform = `translate(${dx * R * 0.65}px, ${dy * R * 0.65}px)`;
    // a soft centre for fine positioning
    const expo = (v: number) => Math.sign(v) * (0.4 * Math.abs(v) + 0.6 * v * v);
    this.analog.thrust = -expo(deadzone(dy, 0.08));
    this.analog.yaw = expo(deadzone(dx, 0.08));
  }

  private stickEnd(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.knob.style.transform = '';
    this.analog.thrust = 0;
    this.analog.yaw = 0;
  }

  // two-finger pinch on the view (not on the controls)
  private fingerDown(e: PointerEvent): void {
    if (!this.shown || e.pointerType !== 'touch') return;
    const tg = e.target as HTMLElement | null;
    if (tg && tg.closest && tg.closest('.oct-stick, .oct-pad, button, .oc-panel, .oc-modal')) return;
    this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.fingers.size === 2) {
      const [a, b] = [...this.fingers.values()];
      this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinching = true;
    }
  }

  private fingerMove(e: PointerEvent): void {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    f.x = e.clientX;
    f.y = e.clientY;
    if (this.fingers.size === 2 && this.pinchD > 0) {
      const [a, b] = [...this.fingers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) this.t.zoom(this.pinchD / d);
      this.pinchD = d;
    }
  }

  private fingerUp(e: PointerEvent): void {
    if (!this.fingers.delete(e.pointerId)) return;
    if (this.fingers.size < 2) {
      this.pinchD = 0;
      // (stays "pinching" until every finger is up, so the camera does not jump)
      if (this.fingers.size === 0) this.pinching = false;
    }
  }
}
