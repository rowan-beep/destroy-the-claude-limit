// "What's new" panel: the version and release notes for every update.
// Opens by itself the first time a new version is started.

import { el, clearEl, button } from '../dom';
import { RELEASES, VERSION } from '../../version';

const SEEN_KEY = 'triad.seenVersion';

export class WhatsNewModal {
  readonly root: HTMLDivElement;
  private body: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'modal-back hidden', parent);
    const m = el('div', 'modal whatsnew', this.root);
    const head = el('div', 'modal-head', m);
    el('h2', '', head, `WHAT'S NEW — v${VERSION}`);
    button('CLOSE', '', head, () => this.show(false));
    this.body = el('div', 'modal-body', m);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.show(false);
    });
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (!on) return;
    clearEl(this.body);
    for (const r of RELEASES) {
      const sec = el('div', 'wn-release', this.body);
      const h = el('div', 'wn-head', sec);
      el('b', '', h, `v${r.version}`);
      el('span', '', h, ` · ${r.title} · ${r.date}`);
      const ul = el('ul', '', sec);
      for (const n of r.notes) el('li', '', ul, n);
    }
    try {
      localStorage.setItem(SEEN_KEY, VERSION);
    } catch {
      /* storage unavailable */
    }
  }

  /** Open once per new version. */
  showIfNew(): void {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      return;
    }
    if (seen !== VERSION) this.show(true);
  }
}
