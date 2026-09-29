// Auto-Fly panel (opened with U): destination, a speed slider up to the
// jet's top speed, an altitude slider up to its ceiling, auto-land, engage.

import { el, button, clearEl } from './dom';
import type { Steerpoint } from '../avionics/nav';

export interface AutoFlyChoice {
  dest: Steerpoint | null;
  speedKts: number;
  altFt: number;
  autoLand: boolean;
}

export interface AutoFlyLimits {
  /** top speed (kt, true airspeed) */
  maxKts: number;
  ceilingFt: number;
  onGround: boolean;
}

export class AutoFlyPanel {
  readonly root: HTMLDivElement;
  private destSel!: HTMLSelectElement;
  private speed!: HTMLInputElement;
  private alt!: HTMLInputElement;
  private land!: HTMLInputElement;
  private points: Steerpoint[] = [];

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

  show(points: Steerpoint[], engaged: boolean, current: AutoFlyChoice, lim: AutoFlyLimits): void {
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

    // speed: a slider from 200 kt to the jet's top speed
    const sRow = el('div', 'af-slide', r);
    const sLab = el('div', 'af-slab', sRow);
    this.speed = el('input', 'af-range', sRow);
    this.speed.type = 'range';
    this.speed.min = '200';
    this.speed.max = String(lim.maxKts);
    this.speed.step = '10';
    this.speed.value = String(Math.min(lim.maxKts, Math.max(200, current.speedKts)));
    const sNote = el('div', 'af-snote', sRow);
    const showSpeed = () => {
      const v = +this.speed.value;
      sLab.textContent = `SPEED  ${v} KT  ·  MACH ${(v / 573).toFixed(2)} AT ALTITUDE`;
      sNote.textContent =
        v > 700 ? 'Supersonic: afterburner, and only up high (low down the airspeed limit holds it back). Burns fuel fast.' : v > 560 ? 'Fast cruise: afterburner at times.' : v < 300 ? 'Slow: long-endurance loiter.' : 'Economical cruise.';
    };
    this.speed.addEventListener('input', showSpeed);
    showSpeed();

    // altitude: 1,000 ft to the ceiling
    const aRow = el('div', 'af-slide', r);
    const aLab = el('div', 'af-slab', aRow);
    this.alt = el('input', 'af-range', aRow);
    this.alt.type = 'range';
    this.alt.min = '1000';
    this.alt.max = String(Math.min(lim.ceilingFt, 60000));
    this.alt.step = '500';
    this.alt.value = String(current.altFt);
    const showAlt = () => (aLab.textContent = `ALTITUDE  ${(+this.alt.value).toLocaleString('en-US')} FT`);
    this.alt.addEventListener('input', showAlt);
    showAlt();

    const lRow = el('label', 'af-row af-check', r);
    this.land = el('input', '', lRow);
    this.land.type = 'checkbox';
    this.land.checked = current.autoLand;
    el('span', '', lRow, 'AUTO-LAND AT A DESTINATION AIRFIELD');

    const btns = el('div', 'af-btns', r);
    button(engaged ? 'UPDATE' : lim.onGround ? 'TAKE OFF & GO' : 'ENGAGE', 'primary', btns, () => this.engage());
    if (engaged) button('DISENGAGE', '', btns, () => this.onDisengage());
    el(
      'div',
      'af-hint',
      r,
      `${lim.onGround ? 'On the runway it takes off by itself. ' : ''}It flies a straight track to the destination, climbs over high ground, plans its descent and, to an airfield, flies the approach and lands. Moving the stick takes control back. U closes this panel.`,
    );
    r.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private engage(): void {
    const id = this.destSel.value;
    this.onEngage({
      dest: this.points.find((p) => p.id === id) ?? null,
      speedKts: +this.speed.value,
      altFt: +this.alt.value,
      autoLand: this.land.checked,
    });
  }
}
