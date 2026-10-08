// The SIMPLE menu: the same game with almost nothing to read. Big picture tiles
// for what to play, one big button to go, and a switch back to the full
// (CURRENT) menu. Each program remembers which of the two the player likes.

import { el, clearEl } from '../dom';
import type { Program } from './program';
import { programLogo } from './program';
import { SHOTS, shotUrl } from '../launcher/shots';

export type MenuStyle = 'current' | 'simple';

const KEY = 'triad.menuStyle';

export function menuStyle(p: Program): MenuStyle {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return s[p] === 'simple' ? 'simple' : 'current';
  } catch {
    return 'current';
  }
}

export function setMenuStyle(p: Program, v: MenuStyle): void {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    s[p] = v;
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* (this session only) */
  }
}

/** one of the loading screen's pictures, by its number ('07'), as a tile background */
export function picture(p: Program, n: string): string {
  const s = SHOTS[p].find((x) => x.file.startsWith(n));
  return s ? shotUrl(p, s) : '';
}

export interface SimpleTile {
  title: string;
  sub: string;
  /** background picture URL ('' for none) */
  img: string;
  tag?: string;
  on?: boolean;
  click: () => void;
}

export interface SimpleView {
  program: Program;
  subtitle: string;
  heading: string;
  tiles: SimpleTile[];
  /** something under the tiles (the jet picker), or nothing */
  middle?: (parent: HTMLElement) => void;
  /** the big button, or none (the tiles go straight away) */
  go?: { label: string; sub: string; click: () => void };
  links: [string, () => void][];
  onProgram: (p: Program) => void;
  /** back to the full menu */
  onFull: () => void;
}

const CSS = /* css */ `
.menu-root:not(.simple) > .sm{display:none !important}
.menu-root.simple > :not(.sm){display:none !important}
.sm{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;padding:28px 40px 26px;font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;color:#eef3f8;background:linear-gradient(180deg,#000a 0%,#0000 26%,#0000 52%,#000c 100%);pointer-events:none}
.sm *{box-sizing:border-box}
.sm>*{pointer-events:auto}
.sm-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
.sm-full{border:1px solid #ffffff40;background:#00000059;color:#fff;border-radius:999px;padding:9px 18px;font:700 13px/1 inherit;font-family:inherit;letter-spacing:.22em;cursor:pointer;backdrop-filter:blur(6px)}
.sm-full:hover{background:#ffffff22}
.sm-spacer{flex:1;pointer-events:none}
.sm-h{font-size:clamp(13px,1.6vh,17px);letter-spacing:.45em;font-weight:700;margin:0 0 12px 4px;opacity:.85}
.sm.air .sm-h{color:#ffb35c}.sm.space .sm-h{color:#8fc4ff}
.sm-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,42vw),1fr));gap:14px}
.sm-tile{position:relative;height:clamp(110px,17vh,190px);border-radius:14px;overflow:hidden;cursor:pointer;border:2px solid #ffffff26;background:#141a22 center/cover no-repeat;transition:transform .25s cubic-bezier(.2,.8,.2,1),border-color .25s,box-shadow .25s;text-align:left;padding:0;color:inherit;font:inherit}
.sm-tile::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,#0000 30%,#000d 100%)}
.sm-tile:hover,.sm-tile:focus-visible{transform:translateY(-4px);border-color:#ffffffa0;box-shadow:0 12px 30px #0009;outline:none}
.sm.air .sm-tile.on{border-color:#ffb35c;box-shadow:0 0 0 2px #ffb35c66,0 12px 30px #0009}
.sm-tile-t{position:absolute;left:14px;right:14px;bottom:30px;z-index:1;font-size:clamp(17px,2.3vh,24px);font-weight:800;letter-spacing:.08em;text-shadow:0 2px 10px #000}
.sm-tile-s{position:absolute;left:14px;right:14px;bottom:11px;z-index:1;font-size:clamp(12px,1.4vh,14px);letter-spacing:.06em;color:#dfe6ee;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sm-tag{position:absolute;right:10px;top:10px;z-index:1;font-size:11px;font-weight:800;letter-spacing:.14em;padding:4px 8px;border-radius:6px;background:#000a}
.sm-bottom{display:flex;align-items:flex-end;gap:24px;margin-top:22px;flex-wrap:wrap}
.sm-mid{flex:1;min-width:260px}
.sm-go{border:none;border-radius:16px;padding:18px 54px;cursor:pointer;font-family:inherit;color:#1a0f02;background:linear-gradient(180deg,#ffd08a,#ff9e3d);box-shadow:0 10px 30px #ff9e3d55;transition:transform .2s,box-shadow .2s;text-align:center}
.sm-go:hover{transform:translateY(-3px);box-shadow:0 14px 40px #ff9e3d88}
.sm-go-l{display:block;font-size:clamp(26px,3.6vh,38px);font-weight:800;letter-spacing:.3em;padding-left:.3em}
.sm-go-s{display:block;font-size:13px;font-weight:700;letter-spacing:.14em;opacity:.75}
.sm-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.sm-link{border:1px solid #ffffff30;background:#0000004d;color:#e8eef5;border-radius:10px;padding:10px 16px;font-family:inherit;font-size:14px;font-weight:700;letter-spacing:.16em;cursor:pointer}
.sm-link:hover{background:#ffffff1f}
.sm-jet{display:flex;align-items:center;gap:14px}
.sm-arrow{width:52px;height:52px;border-radius:50%;border:1px solid #ffffff45;background:#00000066;color:#fff;font-size:26px;cursor:pointer;font-family:inherit;line-height:1}
.sm-arrow:hover{background:#ffffff26}
.sm-jet-k{font-size:13px;letter-spacing:.4em;color:#ffb35c;font-weight:700}
.sm-jet-n{font-size:clamp(26px,4vh,44px);font-weight:800;letter-spacing:.06em;line-height:1.05;text-shadow:0 3px 16px #000}
@media (max-width:700px){.sm{padding:16px}.sm-go{width:100%}}
`;

/** draws (or redraws) the simple menu into `host` */
export function renderSimple(host: HTMLElement, v: SimpleView): void {
  if (!document.getElementById('sm-css')) {
    const st = el('style', '', document.head);
    st.id = 'sm-css';
    st.textContent = CSS;
  }
  clearEl(host);
  host.className = `sm ${v.program}`;
  const top = el('div', 'sm-top', host);
  // (each program's logo is styled by its own menu's brand box)
  const brand = el('div', v.program === 'space' ? 'sx2-brand' : '', top);
  programLogo(brand, v.program, v.subtitle, (p) => v.onProgram(p));
  const full = el('button', 'sm-full', top, 'FULL MENU') as HTMLButtonElement;
  full.type = 'button';
  full.title = 'Back to the full (CURRENT) menu';
  full.addEventListener('click', () => v.onFull());
  el('div', 'sm-spacer', host);
  el('div', 'sm-h', host, v.heading);
  const tiles = el('div', 'sm-tiles', host);
  for (const t of v.tiles) {
    const b = el('button', 'sm-tile' + (t.on ? ' on' : ''), tiles) as HTMLButtonElement;
    b.type = 'button';
    if (t.img) b.style.backgroundImage = `url("${t.img}")`;
    if (t.tag) el('span', 'sm-tag', b, t.tag);
    el('span', 'sm-tile-t', b, t.title);
    el('span', 'sm-tile-s', b, t.sub);
    b.addEventListener('click', () => t.click());
  }
  const bottom = el('div', 'sm-bottom', host);
  const mid = el('div', 'sm-mid', bottom);
  v.middle?.(mid);
  const links = el('div', 'sm-links', mid);
  for (const [label, fn] of v.links) {
    const b = el('button', 'sm-link', links, label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', fn);
  }
  if (v.go) {
    const g = el('button', 'sm-go', bottom) as HTMLButtonElement;
    g.type = 'button';
    el('span', 'sm-go-l', g, v.go.label);
    el('span', 'sm-go-s', g, v.go.sub);
    g.addEventListener('click', v.go.click);
  }
}
