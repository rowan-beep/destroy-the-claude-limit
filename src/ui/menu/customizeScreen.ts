// Jet customisation screen: a full-screen view of just the jet on the hangar
// turntable plus the paint controls. Changes preview live on the jet but
// are only saved with APPLY; CANCEL (or Esc) puts the saved paint back.

import { el, button, clearEl } from '../dom';
import { AIRCRAFT_TYPES, AircraftType, SPECS } from '../../aircraft/specs';
import { PaintConfig, PaintMode, SOLID_COLORS, WRAPS, FINISHES, loadPaint, savePaint, defaultPaint, wrapPreview, WrapId, SUIT_COLORS } from '../../aircraft/models/paint';
import type { Hangar } from './hangar';

export class CustomizeScreen {
  readonly root: HTMLDivElement;
  private panel: HTMLElement;
  private tabs: HTMLElement;
  private status: HTMLElement;
  private type: AircraftType = 'F15EX';
  private draft: PaintConfig = defaultPaint();
  private saved: PaintConfig = defaultPaint();
  private previews = new Map<string, string>();

  constructor(
    parent: HTMLElement,
    private hangar: Hangar,
    private onClose: () => void,
  ) {
    this.root = el('div', 'customize hidden', parent);
    const top = el('div', 'cz-top', this.root);
    el('h1', '', top, 'CUSTOMIZE');
    this.tabs = el('div', 'cz-tabs', top);
    this.panel = el('div', 'cz-panel', this.root);
    const foot = el('div', 'cz-foot', this.root);
    this.status = el('div', 'cz-status', foot, '');
    el('div', 'hangar-hint cz-hint', this.root, 'DRAG TO LOOK AROUND · SCROLL TO ZOOM · DOUBLE-CLICK TO RESET');
    button('RESET TO FACTORY', '', foot, () => {
      this.draft = defaultPaint();
      this.render();
    });
    button('CANCEL', '', foot, () => this.close(false));
    button('APPLY', 'primary', foot, () => this.close(true));
    window.addEventListener('keydown', (e) => {
      if (this.root.classList.contains('hidden')) return;
      if (e.code === 'Escape') this.close(false);
    });
  }

  get open(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(type: AircraftType): void {
    this.root.classList.remove('hidden');
    this.select(type);
  }

  /** Switch jets (unsaved changes on the previous one are dropped). */
  private select(type: AircraftType): void {
    if (this.open && this.type !== type) this.hangar.previewPaint(this.type, this.saved);
    this.type = type;
    this.saved = loadPaint(type);
    this.draft = { ...this.saved };
    this.hangar.setJet(type);
    this.render();
  }

  private close(apply: boolean): void {
    if (apply) {
      savePaint(this.type, this.draft);
      this.saved = { ...this.draft };
    }
    this.hangar.previewPaint(this.type, this.saved);
    this.root.classList.add('hidden');
    this.onClose();
  }

  private dirty(): boolean {
    return JSON.stringify(this.draft) !== JSON.stringify(this.saved);
  }

  private update(): void {
    this.hangar.previewPaint(this.type, this.draft);
    this.status.textContent = this.dirty() ? 'UNSAVED CHANGES — PRESS APPLY TO KEEP THEM' : 'SAVED';
    this.status.classList.toggle('dirty', this.dirty());
  }

  private preview(id: WrapId, a: string, b: string): string {
    const k = `${id}|${a}|${b}`;
    let u = this.previews.get(k);
    if (!u) {
      u = wrapPreview(id, a, b);
      this.previews.set(k, u);
    }
    return u;
  }

  private render(): void {
    clearEl(this.tabs);
    for (const t of AIRCRAFT_TYPES) button(SPECS[t].shortName.toUpperCase(), t === this.type ? 'active' : '', this.tabs, () => this.select(t));
    const d = this.draft;
    const p = this.panel;
    clearEl(p);
    el('h2', '', p, SPECS[this.type].name.toUpperCase());

    const sec = (title: string) => {
      const s = el('div', 'cz-sec', p);
      el('h3', '', s, title);
      return s;
    };
    // paint type
    const modes = sec('PAINT');
    const mrow = el('div', 'seg', modes);
    for (const [m, label] of [['factory', 'FACTORY'], ['solid', 'SOLID COLOUR'], ['wrap', 'WRAP']] as [PaintMode, string][]) {
      button(label, 'small' + (d.mode === m ? ' active' : ''), mrow, () => {
        d.mode = m;
        if (m === 'wrap') {
          const w = WRAPS.find((x) => x.id === d.wrap)!;
          if (d.color === defaultPaint().color) {
            d.color = w.a;
            d.color2 = w.b;
          }
        }
        this.render();
      });
    }
    if (d.mode === 'factory') el('div', 'note', modes, 'The standard scheme for this jet. Finish and brightness still apply.');

    // wrap patterns
    if (d.mode === 'wrap') {
      const ws = sec('WRAP PATTERN');
      const grid = el('div', 'cz-wraps', ws);
      for (const w of WRAPS) {
        const b = el('button', 'cz-wrap' + (d.wrap === w.id ? ' active' : ''), grid);
        const img = el('img', '', b);
        img.src = this.preview(w.id, w.a, w.b);
        el('span', '', b, w.name);
        b.addEventListener('click', () => {
          d.wrap = w.id;
          d.color = w.a;
          d.color2 = w.b;
          this.render();
        });
      }
    }

    // colours
    const swatches = (title: string, value: string, set: (c: string) => void) => {
      const s = sec(title);
      const grid = el('div', 'cz-swatches', s);
      for (const [name, hex] of SOLID_COLORS) {
        const b = el('button', 'cz-sw' + (value.toLowerCase() === hex ? ' active' : ''), grid);
        b.style.background = hex;
        b.title = name;
        b.addEventListener('click', () => {
          set(hex);
          this.render();
        });
      }
      const custom = el('label', 'cz-custom', s);
      el('span', '', custom, 'CUSTOM');
      const inp = el('input', '', custom);
      inp.type = 'color';
      inp.value = value;
      inp.addEventListener('input', () => {
        set(inp.value);
        this.update();
      });
      inp.addEventListener('change', () => this.render());
    };
    if (d.mode === 'solid') swatches('COLOUR', d.color, (c) => (d.color = c));
    if (d.mode === 'wrap') {
      swatches('BASE COLOUR', d.color, (c) => (d.color = c));
      swatches('PATTERN COLOUR', d.color2, (c) => (d.color2 = c));
    }

    // finish
    const fs = sec('FINISH');
    const frow = el('div', 'seg', fs);
    for (const [f, label] of FINISHES) {
      button(label, 'small' + (d.finish === f ? ' active' : ''), frow, () => {
        d.finish = f;
        this.render();
      });
    }

    // the pilot's flight suit
    {
      const s = sec('PILOT FLIGHT SUIT');
      const grid = el('div', 'cz-swatches', s);
      const std = el('button', 'cz-sw cz-std' + (!d.suit ? ' active' : ''), grid);
      std.textContent = 'STD';
      std.title = 'STANDARD ISSUE';
      std.addEventListener('click', () => {
        d.suit = '';
        this.render();
      });
      for (const [name, hex] of SUIT_COLORS) {
        const b = el('button', 'cz-sw' + ((d.suit ?? '').toLowerCase() === hex ? ' active' : ''), grid);
        b.style.background = hex;
        b.title = name;
        b.addEventListener('click', () => {
          d.suit = hex;
          this.render();
        });
      }
      const custom = el('label', 'cz-custom', s);
      el('span', '', custom, 'CUSTOM');
      const inp = el('input', '', custom);
      inp.type = 'color';
      inp.value = d.suit || '#5d624a';
      inp.addEventListener('input', () => {
        d.suit = inp.value;
        this.update();
      });
      inp.addEventListener('change', () => this.render());
      el('div', 'note', s, 'Zoom in on the cockpit to see it (scroll on the hangar).');
    }

    // brightness
    const bs = sec(`BRIGHTNESS: ${Math.round(d.brightness * 100)}%`);
    const r = el('input', '', bs);
    r.type = 'range';
    r.min = '50';
    r.max = '150';
    r.step = '1';
    r.value = String(Math.round(d.brightness * 100));
    r.addEventListener('input', () => {
      d.brightness = +r.value / 100;
      (bs.firstChild as HTMLElement).textContent = `BRIGHTNESS: ${r.value}%`;
      this.update();
    });
    this.update();
  }
}
