// On-screen controls for phones and tablets: a virtual stick (pitch/roll)
// on the left, a throttle slider with the afterburner detent on the right,
// weapon / sensor / countermeasure buttons, and drag-anywhere-else to look.
// Everything feeds the normal Input, so the rest of the game is unchanged.

import { el } from './dom';
import type { Input, Action } from '../core/input';
import { clamp } from '../core/math';

function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    /* pointer already gone */
  }
}

export function isTouchDevice(): boolean {
  try {
    return (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
  } catch {
    return false;
  }
}

interface Btn {
  action: Action;
  label: string;
  cls?: string;
  hold?: boolean;
}

export class TouchControls {
  readonly root: HTMLDivElement;
  private stickBase: HTMLElement;
  private stickKnob: HTMLElement;
  private thrTrack: HTMLElement;
  private thrFill: HTMLElement;
  private thrLabel: HTMLElement;
  private stickId: number | null = null;
  private thrId: number | null = null;
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private stickCentre = { x: 0, y: 0 };
  throttle = 0.85;
  enabled = false;

  constructor(
    parent: HTMLElement,
    private input: Input,
  ) {
    this.root = el('div', 'touch-ui hidden', parent);
    // look surface under everything
    const look = el('div', 'touch-look', this.root);
    look.addEventListener('pointerdown', (e) => this.lookStart(e));
    look.addEventListener('pointermove', (e) => this.lookMove(e));
    look.addEventListener('pointerup', (e) => this.lookEnd(e));
    look.addEventListener('pointercancel', (e) => this.lookEnd(e));
    look.addEventListener('lostpointercapture', (e) => this.lookEnd(e));

    // stick
    this.stickBase = el('div', 'touch-stick', this.root);
    this.stickKnob = el('div', 'knob', this.stickBase);
    this.stickBase.addEventListener('pointerdown', (e) => this.stickStart(e));
    this.stickBase.addEventListener('pointermove', (e) => this.stickMove(e));
    this.stickBase.addEventListener('pointerup', (e) => this.stickEnd(e));
    this.stickBase.addEventListener('pointercancel', (e) => this.stickEnd(e));

    // throttle
    this.thrTrack = el('div', 'touch-thr', this.root);
    this.thrFill = el('div', 'fill', this.thrTrack);
    el('div', 'detent', this.thrTrack);
    this.thrLabel = el('div', 'lbl', this.thrTrack, '85%');
    this.thrTrack.addEventListener('pointerdown', (e) => this.thrStart(e));
    this.thrTrack.addEventListener('pointermove', (e) => this.thrMove(e));
    this.thrTrack.addEventListener('pointerup', (e) => this.thrEnd(e));
    this.thrTrack.addEventListener('pointercancel', (e) => this.thrEnd(e));

    // buttons
    const right = el('div', 'touch-btns', this.root);
    const btns: Btn[] = [
      { action: 'fire', label: 'FIRE', cls: 'fire', hold: true },
      { action: 'lock', label: 'LOCK' },
      { action: 'cycleWeapon', label: 'WPN' },
      { action: 'flare', label: 'FLR' },
      { action: 'chaff', label: 'CHF' },
      { action: 'radarMode', label: 'RDR' },
    ];
    for (const b of btns) this.button(right, b);
    const top = el('div', 'touch-top', this.root);
    const small: Btn[] = [
      { action: 'camera', label: 'CAM' },
      { action: 'gear', label: 'GEAR' },
      { action: 'speedbrake', label: 'BRK' },
      { action: 'wheelBrake', label: 'WHL', hold: true },
      { action: 'gOverride', label: 'G-OVR' },
      { action: 'navRtb', label: 'RTB' },
      { action: 'map', label: 'MAP' },
      { action: 'pause', label: '❚❚' },
    ];
    for (const b of small) this.button(top, b);
    const rud = el('div', 'touch-rudder', this.root);
    this.button(rud, { action: 'yawLeft', label: '◀ RUD', hold: true });
    this.button(rud, { action: 'yawRight', label: 'RUD ▶', hold: true });
  }

  private button(parent: HTMLElement, b: Btn): void {
    const e = el('div', 'tbtn' + (b.cls ? ' ' + b.cls : ''), parent, b.label);
    const down = (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      capture(e, ev.pointerId);
      e.classList.add('on');
      this.input.virtual(b.action, true);
      if (b.action === 'yawLeft') this.input.touch.yaw = -1;
      if (b.action === 'yawRight') this.input.touch.yaw = 1;
    };
    const up = (ev: PointerEvent) => {
      ev.preventDefault();
      e.classList.remove('on');
      this.input.virtual(b.action, false);
      if (b.action === 'yawLeft' || b.action === 'yawRight') this.input.touch.yaw = 0;
    };
    e.addEventListener('pointerdown', down);
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', up);
    e.addEventListener('pointerleave', (ev) => {
      if (e.classList.contains('on')) up(ev);
    });
  }

  show(on: boolean): void {
    this.enabled = on;
    this.root.classList.toggle('hidden', !on);
    this.input.touch.active = on;
    document.body.classList.toggle('touch-mode', on);
    if (!on) {
      this.input.touch.pitch = this.input.touch.roll = this.input.touch.yaw = 0;
      this.input.touch.throttle = null;
    }
  }

  /** Keep the slider in step with the game's throttle (keyboard / AB button). */
  sync(throttleCmd: number): void {
    if (this.thrId === null) this.throttle = throttleCmd;
    const f = clamp(this.throttle / 1.1, 0, 1);
    this.thrFill.style.height = `${f * 100}%`;
    this.thrFill.classList.toggle('ab', this.throttle > 1.0);
    this.thrLabel.textContent = this.throttle > 1.0 ? 'AB' : `${Math.round(this.throttle * 100)}%`;
  }

  // --- stick -------------------------------------------------------------

  private stickStart(e: PointerEvent): void {
    e.preventDefault();
    this.stickId = e.pointerId;
    capture(this.stickBase, e.pointerId);
    const r = this.stickBase.getBoundingClientRect();
    this.stickCentre = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    this.stickMove(e);
  }

  private stickMove(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    const R = this.stickBase.clientWidth / 2;
    let dx = (e.clientX - this.stickCentre.x) / R;
    let dy = (e.clientY - this.stickCentre.y) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    this.stickKnob.style.transform = `translate(${dx * R * 0.7}px, ${dy * R * 0.7}px)`;
    // gentle expo for fine control near the centre
    const expo = (v: number) => Math.sign(v) * (0.35 * Math.abs(v) + 0.65 * v * v);
    this.input.touch.roll = expo(dx);
    this.input.touch.pitch = expo(dy); // drag down = pull back
  }

  private stickEnd(e: PointerEvent): void {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.stickKnob.style.transform = '';
    this.input.touch.pitch = 0;
    this.input.touch.roll = 0;
  }

  // --- throttle ----------------------------------------------------------

  private thrStart(e: PointerEvent): void {
    e.preventDefault();
    this.thrId = e.pointerId;
    capture(this.thrTrack, e.pointerId);
    this.thrMove(e);
  }

  private thrMove(e: PointerEvent): void {
    if (e.pointerId !== this.thrId) return;
    const r = this.thrTrack.getBoundingClientRect();
    const f = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
    let t = f * 1.1;
    // detent at MIL: the top 8 % of the track is afterburner
    if (t > 1.0 && t < 1.04) t = 1.0;
    this.throttle = t;
    this.input.touch.throttle = t;
  }

  private thrEnd(e: PointerEvent): void {
    if (e.pointerId !== this.thrId) return;
    this.thrId = null;
    this.input.touch.throttle = null;
  }

  // --- look --------------------------------------------------------------

  private lookStart(e: PointerEvent): void {
    this.lookId = e.pointerId;
    this.input.touch.looking = true;
    this.lookLast = { x: e.clientX, y: e.clientY };
    capture(e.target as HTMLElement, e.pointerId);
  }

  private lookMove(e: PointerEvent): void {
    if (e.pointerId !== this.lookId) return;
    this.input.touch.lookX += e.clientX - this.lookLast.x;
    this.input.touch.lookY += e.clientY - this.lookLast.y;
    this.lookLast = { x: e.clientX, y: e.clientY };
  }

  private lookEnd(e: PointerEvent): void {
    if (e.pointerId === this.lookId) {
      this.lookId = null;
      this.input.touch.looking = false;
    }
  }
}
