// "What's new" panel: one game's release notes (the air combat menu and the
// space menu each have their own, and each lists only its own updates). Opens
// by itself the first time there are notes the player hasn't seen. The newest
// release is open; older ones are folded to a line each and open on a click.

import { el, clearEl, button } from '../dom';
import { releasesFor, latestFor, compareVersions, Game, Note, NoteKind } from '../../version';

const SEEN_KEY: Record<Game, string> = { air: 'triad.seenVersion', space: 'triad.space.seenVersion' };
const GAME_NAME: Record<Game, string> = { air: 'AIR COMBAT', space: 'SPACE EXPLORATION' };
const TAG: Record<NoteKind, string> = { new: 'NEW', better: 'IMPROVED', fix: 'FIXED' };

/** an old paragraph-style note split into a bold lead-in and the rest */
function leadIn(s: string): [string, string] {
  const c = s.indexOf(': ');
  if (c > 0 && c <= 48 && !/^(New|Fixed|Fixes|Also)$/.test(s.slice(0, c))) return [s.slice(0, c + 1), s.slice(c + 2)];
  const m = /^(.{8,90}?[.!])\s/.exec(s);
  if (m) return [m[1], s.slice(m[0].length)];
  return ['', s];
}

function renderNote(n: Note, parent: HTMLElement): void {
  const box = el('div', 'wn-note', parent);
  if (typeof n === 'string') {
    const [lead, rest] = leadIn(n);
    const p = el('p', 'wn-para', box);
    if (lead) el('b', '', p, lead + ' ');
    p.append(rest);
    return;
  }
  const h = el('div', 'wn-note-h', box);
  if (n.k) el('span', 'wn-tag ' + n.k, h, TAG[n.k]);
  el('b', '', h, n.h);
  if (n.d?.length) {
    const ul = el('ul', 'wn-pts', box);
    for (const d of n.d) el('li', '', ul, d);
  }
}

export class WhatsNewModal {
  readonly root: HTMLDivElement;
  private body: HTMLElement;

  constructor(parent: HTMLElement, private game: Game = 'air') {
    this.root = el('div', 'modal-back hidden', parent);
    const m = el('div', 'modal whatsnew' + (game === 'space' ? ' wn-space' : ''), this.root);
    const head = el('div', 'modal-head', m);
    const t = el('div', 'wn-title', head);
    el('h2', '', t, "WHAT'S NEW");
    el('span', 'wn-game', t, GAME_NAME[game]);
    button('CLOSE', 'wn-close', head, () => this.show(false));
    this.body = el('div', 'modal-body', m);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.show(false);
    });
  }

  /** the newest version with notes for this game (for the button that opens them) */
  get latest(): string {
    return latestFor(this.game);
  }

  /**
   * Open or close. `since`: the last version the player saw; every release
   * after it starts open (otherwise only the newest).
   */
  show(on: boolean, since: string | null = null): void {
    this.root.classList.toggle('hidden', !on);
    if (!on) return;
    clearEl(this.body);
    releasesFor(this.game).forEach((r, i) => {
      const open = i === 0 || (since !== null && compareVersions(r.version, since) > 0);
      const sec = el('section', 'wn-rel' + (open ? ' open' : '') + (i === 0 ? ' newest' : ''), this.body);
      const h = el('button', 'wn-rel-head', sec);
      h.type = 'button';
      el('span', 'wn-ver', h, `v${r.version}`);
      el('span', 'wn-rel-t', h, r.title);
      el('span', 'wn-date', h, r.date);
      el('span', 'wn-chev', h, '›');
      const b = el('div', 'wn-rel-body', sec);
      for (const n of r.notes) renderNote(n, b);
      h.addEventListener('click', () => sec.classList.toggle('open'));
    });
    this.body.scrollTop = 0;
    try {
      localStorage.setItem(SEEN_KEY[this.game], this.latest);
    } catch {
      /* storage unavailable */
    }
  }

  /** Open once when there are notes the player hasn't seen. */
  showIfNew(): void {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY[this.game]);
    } catch {
      return;
    }
    if (seen === null || compareVersions(seen, this.latest) < 0) this.show(true, seen);
  }
}
