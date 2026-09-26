// Small Auto-Fly panel (opened with U): destination, speed, altitude, engage.

import { el, button, clearEl } from './dom';
import { AUTOFLY_SPEEDS, AUTOFLY_ALTS } from '../game/autoFly';
import type { Steerpoint } from '../avionics/nav';

export interface AutoFlyChoice {
  dest: Steerpoint | null;
  speedKts: number;
  altFt: number;
}

export class AutoFlyPanel {
  readonly root: HTMLDivElement;
  private destSel!: HTMLSelectElement;
  private speedSel!: HTMLSelectElement;
  private altSel!: HTMLSelectElement;
  private points: Steerpoint[] = [];
  private engageBtn!: HTMLButtonElement;

  constructor(
    parent: HTMLElement,
    private onEngage: (c: AutoFlyChoice) => void,
    private onDisengage: () => void,
    private onClose: () => void,
  ) {
    this.root = el('div', 'autofly hidden', parent);
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(points: Steerpoint[], engaged: boolean, current: AutoFlyChoice): void {
    this.points = points;
    const r = this.root;
    clearEl(r);
    const head = el('div', 'af-head', r);
    el('b', '', head, 'AUTO-FLY');
    button('✕', 'af-x', head, () => this.onClose());
    const row = (label: string) => {
      const d = el('label', 'af-row', r);
      el('span', '', d, label);
      return d;
    };
    this.destSel = el('select', '', row('DESTINATION'));
    const hold = el('option', '', this.destSel, 'HOLD CURRENT HEADING');
    hold.value = '';
    for (const p of points) {
      const o = el('option', '', this.destSel, `${p.name}${p.tacan ? ' · ' + p.tacan : ''}${p.kind === 'airfield' ? (p.friendly ? ' (FRIENDLY)' : ' (ENEMY)') : ''}`);
      o.value = p.id;
    }
    this.destSel.value = current.dest?.id ?? '';
    this.speedSel = el('select', '', row('SPEED'));
    for (const s of AUTOFLY_SPEEDS) el('option', '', this.speedSel, `${s} KT`).value = String(s);
    this.speedSel.value = String(current.speedKts);
    this.altSel = el('select', '', row('ALTITUDE'));
    for (const a of AUTOFLY_ALTS) el('option', '', this.altSel, `${a.toLocaleString('en-US')} FT`).value = String(a);
    this.altSel.value = String(current.altFt);
    const btns = el('div', 'af-btns', r);
    this.engageBtn = button(engaged ? 'UPDATE' : 'ENGAGE', 'primary', btns, () => this.engage());
    if (engaged) button('DISENGAGE', '', btns, () => this.onDisengage());
    el('div', 'af-hint', r, 'Moving the stick takes control back. U closes this panel.');
    r.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private engage(): void {
    const id = this.destSel.value;
    this.onEngage({
      dest: this.points.find((p) => p.id === id) ?? null,
      speedKts: +this.speedSel.value,
      altFt: +this.altSel.value,
    });
  }
}
