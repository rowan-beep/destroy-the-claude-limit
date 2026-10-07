// "What's new" panel: one game's release notes (the air combat menu and the
// space menu each have their own, and each lists only its own updates). Opens
// by itself the first time there are notes the player hasn't seen. The newest
// release is open; older ones are folded to a line each and open on a click.

import { el, clearEl, button } from '../dom';
import { releasesFor, latestFor, compareVersions, Game, Note, NoteKind } from '../../version';

const SEEN_KEY: Record<Game, string> = { air: 'triad.seenVersion', space: 'triad.space.seenVersion' };
const GAME_NAME: Record<Game, string> = { air: 'AIR COMBAT', space: 'SPACE EXPLORATION' };
const TAG: Record<NoteKind, string> = { new: 'NEW', better: 'IMPROVED', fix: 'FIXED' };

/** a paragraph split into its sentences */
function sentences(t: string): string[] {
  return t
    .trim()
    .split(/(?<=[.!?]["')\]]?)\s+(?=[A-Z0-9"'(\[])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * An older note, written as one paragraph, laid out like the newer ones: its
 * lead-in (the words before an early colon, or a short first sentence) as the
 * headline and the rest as points. A NEW: or FIXED: opening becomes the tag.
 */
function fromParagraph(s: string): { k?: NoteKind; h: string; d: string[] } {
  let t = s.trim();
  let k: NoteKind | undefined;
  const m = /^(New|Fixed|Fixes):\s+/.exec(t);
  if (m) {
    k = m[1] === 'New' ? 'new' : 'fix';
    t = t.charAt(m[0].length).toUpperCase() + t.slice(m[0].length + 1);
  } else if (/^Fixed\b/.test(t)) k = 'fix';
  const c = t.indexOf(': ');
  if (c > 0 && c <= 48 && !t.slice(0, c).includes('. ')) {
    const rest = t.slice(c + 2);
    return { k, h: t.slice(0, c), d: sentences(rest.charAt(0).toUpperCase() + rest.slice(1)) };
  }
  const ss = sentences(t);
  if (ss[0].length <= 80) return { k, h: ss[0].replace(/[.!]$/, ''), d: ss.slice(1) };
  return { k, h: '', d: ss };
}

function renderNote(n: Note, parent: HTMLElement): void {
  const box = el('div', 'wn-note', parent);
  const o = typeof n === 'string' ? fromParagraph(n) : n;
  if (o.h || o.k) {
    const h = el('div', 'wn-note-h', box);
    if (o.k) el('span', 'wn-tag ' + o.k, h, TAG[o.k]);
    if (o.h) el('b', '', h, o.h);
  }
  if (o.d?.length) {
    const ul = el('ul', 'wn-pts', box);
    for (const d of o.d) el('li', '', ul, d);
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
