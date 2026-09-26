// Spectator bar: who you're watching, every jet in the round (click to
// watch it, BLUE and RED), previous / next, free camera, and the controls.

import { el, button, clearEl } from './dom';
import type { Aircraft } from '../aircraft/aircraft';

export interface SpectatorView {
  roster(): Aircraft[];
  watching(): Aircraft | null;
  isFree(): boolean;
  watch(a: Aircraft): void;
  cycle(dir: 1 | -1): void;
  toggleFree(): void;
}

export class SpectatorUi {
  readonly root: HTMLDivElement;
  private title: HTMLElement;
  private list: HTMLElement;
  private freeBtn: HTMLButtonElement;
  private hint: HTMLElement;
  private chips = new Map<Aircraft, HTMLButtonElement>();
  private rosterKey = '';

  constructor(
    parent: HTMLElement,
    private view: SpectatorView,
  ) {
    this.root = el('div', 'spectator hidden', parent);
    const top = el('div', 'sp-top', this.root);
    el('span', 'sp-tag', top, 'SPECTATING');
    this.title = el('span', 'sp-title', top, '');
    const nav = el('div', 'sp-nav', top);
    button('◀', '', nav, () => this.view.cycle(-1));
    button('▶', '', nav, () => this.view.cycle(1));
    this.freeBtn = button('FREE CAM [F]', '', nav, () => this.view.toggleFree());
    this.list = el('div', 'sp-list', this.root);
    this.hint = el('div', 'sp-hint', this.root, '');
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (!on) this.rosterKey = '';
  }

  update(): void {
    if (this.root.classList.contains('hidden')) return;
    const roster = this.view.roster();
    const key = roster.map((a) => a.id).join(',');
    if (key !== this.rosterKey) {
      this.rosterKey = key;
      clearEl(this.list);
      this.chips.clear();
      for (const team of ['blue', 'red']) {
        const row = el('div', `sp-row ${team}`, this.list);
        el('span', 'sp-team', row, team === 'blue' ? 'BLUE' : 'RED');
        for (const a of roster.filter((x) => x.team === team)) {
          const b = button(`${a.callsign.split(' ').pop()} · ${a.spec.shortName}${a.isPlayer ? ' (YOU)' : ''}`, 'sp-chip', row, () => this.view.watch(a));
          this.chips.set(a, b);
        }
      }
    }
    const w = this.view.watching();
    const free = this.view.isFree();
    for (const [a, b] of this.chips) {
      b.classList.toggle('dead', !a.alive);
      b.classList.toggle('active', !free && a === w);
    }
    this.freeBtn.classList.toggle('active', free);
    if (free) {
      this.title.textContent = 'FREE CAMERA';
      this.hint.textContent = 'WASD move · Q / E down / up · SHIFT fast · mouse (right-drag) look · F back to jets';
    } else if (w) {
      const kts = Math.round(w.fm.cas / 0.514444);
      const ft = Math.round(w.fm.pos.y / 0.3048);
      this.title.textContent = `${w.callsign} · ${w.spec.name} · ${w.team === 'blue' ? 'BLUE' : 'RED'}${w.alive ? ` · ${kts} KT · ${ft.toLocaleString('en-US')} FT · ${w.ai ? w.ai.state : ''}` : ' · DOWN'}`;
      this.hint.textContent = '◀ ▶ / TAB switch jet · right-drag orbit · wheel zoom · F free camera';
    } else {
      this.title.textContent = '';
      this.hint.textContent = 'Pick a jet to watch, or F for a free camera';
    }
  }
}
