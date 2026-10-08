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
.sm{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;padding:24px 34px 22px;font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;color:#eef3f8;background:linear-gradient(180deg,#0007 0%,#0000 16%,#0000 58%,#000a 100%);pointer-events:none}
.sm *{box-sizing:border-box}
.sm button{pointer-events:auto}
.sm-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;pointer-events:auto}
.sm-top-r{display:flex;gap:10px;align-items:center}
.sm-full{border:1px solid #ffffff40;background:#00000059;color:#fff;border-radius:999px;padding:9px 18px;font-family:inherit;font-size:13px;font-weight:700;letter-spacing:.22em;cursor:pointer;backdrop-filter:blur(6px)}
.sm-full:hover{background:#ffffff22}
.sm-spacer{flex:1}
.sm-hint{text-align:center;font-size:11px;letter-spacing:.3em;color:#ffffffa6;text-shadow:0 1px 4px #000;margin-bottom:10px}
.sm-h{font-size:clamp(12px,1.5vh,15px);letter-spacing:.45em;font-weight:700;margin:0 0 9px 4px;text-shadow:0 1px 6px #000}
.sm.air .sm-h{color:#ffb35c}.sm.space .sm-h{color:#8fc4ff}
.sm-tiles{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:10px}
.sm-tile{position:relative;height:var(--th);border-radius:12px;overflow:hidden;cursor:pointer;border:2px solid #ffffff2e;background:#141a22 center/cover no-repeat;transition:transform .25s cubic-bezier(.2,.8,.2,1),border-color .25s,box-shadow .25s;text-align:left;padding:0;color:inherit;font:inherit;box-shadow:0 6px 20px #0007}
.sm-tile::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,#0000 35%,#000d 100%)}
.sm-tile:hover,.sm-tile:focus-visible{transform:translateY(-3px);border-color:#ffffffa0;box-shadow:0 10px 26px #0009;outline:none}
.sm.air .sm-tile.on{border-color:#ffb35c;box-shadow:0 0 0 2px #ffb35c66,0 10px 26px #0009}
.sm-tile-t{position:absolute;left:11px;right:11px;bottom:23px;z-index:1;font-size:clamp(13px,1.8vh,19px);font-weight:800;letter-spacing:.07em;text-shadow:0 2px 8px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sm-tile-s{position:absolute;left:11px;right:11px;bottom:8px;z-index:1;font-size:clamp(10px,1.25vh,12.5px);letter-spacing:.05em;color:#dfe6ee;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sm-tag{position:absolute;right:8px;top:8px;z-index:1;font-size:10px;font-weight:800;letter-spacing:.14em;padding:3px 7px;border-radius:6px;background:#000a}
.sm-bottom{display:flex;align-items:flex-end;gap:20px;margin-top:14px;flex-wrap:wrap}
.sm-mid{flex:1;min-width:240px}
.sm-go{border:none;border-radius:14px;padding:14px 48px;cursor:pointer;font-family:inherit;color:#1a0f02;background:linear-gradient(180deg,#ffd08a,#ff9e3d);box-shadow:0 10px 30px #ff9e3d55;transition:transform .2s,box-shadow .2s;text-align:center}
.sm-go:hover{transform:translateY(-3px);box-shadow:0 14px 40px #ff9e3d88}
.sm-go-l{display:block;font-size:clamp(24px,3.2vh,34px);font-weight:800;letter-spacing:.3em;padding-left:.3em}
.sm-go-s{display:block;font-size:12px;font-weight:700;letter-spacing:.14em;opacity:.75}
.sm-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.sm-link{border:1px solid #ffffff30;background:#0000004d;color:#e8eef5;border-radius:10px;padding:8px 14px;font-family:inherit;font-size:13px;font-weight:700;letter-spacing:.16em;cursor:pointer}
.sm-link:hover{background:#ffffff1f}
.sm-jet{display:flex;align-items:center;gap:12px}
.sm-arrow{width:46px;height:46px;border-radius:50%;border:1px solid #ffffff45;background:#00000066;color:#fff;font-size:24px;cursor:pointer;font-family:inherit;line-height:1}
.sm-arrow:hover{background:#ffffff26}
.sm-jet-k{font-size:12px;letter-spacing:.4em;color:#ffb35c;font-weight:700;text-shadow:0 1px 6px #000}
.sm-jet-n{font-size:clamp(22px,3.4vh,38px);font-weight:800;letter-spacing:.06em;line-height:1.05;text-shadow:0 3px 16px #000}
.sm-show{display:none;position:absolute;left:50%;bottom:24px;transform:translateX(-50%);pointer-events:auto}
.sm.viewing{background:none}
.sm.viewing > *{display:none !important}
.sm.viewing > .sm-show{display:block !important}
@media (max-width:760px){.sm{padding:14px}.sm-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.sm-go{width:100%}}
`;

/** draws (or redraws) the simple menu into `host` */
export function renderSimple(host: HTMLElement, v: SimpleView): void {
  if (!document.getElementById('sm-css')) {
    const st = el('style', '', document.head);
    st.id = 'sm-css';
    st.textContent = CSS;
  }
  const viewing = host.classList.contains('viewing');
  clearEl(host);
  host.className = `sm ${v.program}` + (viewing ? ' viewing' : '');
  if (!host.dataset.esc) {
    // (Esc brings the menu back from the bare view)
    host.dataset.esc = '1';
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && host.classList.contains('viewing') && host.offsetParent !== null) {
        host.classList.remove('viewing');
        e.stopPropagation();
      }
    }, true);
  }
  const top = el('div', 'sm-top', host);
  // (each program's logo is styled by its own menu's brand box)
  const brand = el('div', v.program === 'space' ? 'sx2-brand' : '', top);
  programLogo(brand, v.program, v.subtitle, (p) => v.onProgram(p));
  const tr = el('div', 'sm-top-r', top);
  // (the scene behind on its own: the hangar, or the launch site round the rocket)
  const hide = el('button', 'sm-full', tr, 'HIDE MENU') as HTMLButtonElement;
  hide.type = 'button';
  hide.title = 'Just the view: drag to look around, scroll to zoom';
  hide.addEventListener('click', () => host.classList.add('viewing'));
  const full = el('button', 'sm-full', tr, 'FULL MENU') as HTMLButtonElement;
  full.type = 'button';
  full.title = 'Back to the full (CURRENT) menu';
  full.addEventListener('click', () => v.onFull());
  el('div', 'sm-spacer', host);
  el('div', 'sm-hint', host, 'DRAG TO LOOK AROUND · SCROLL TO ZOOM');
  el('div', 'sm-h', host, v.heading);
  const tiles = el('div', 'sm-tiles', host);
  // one row of up to six; more than that in two rows, so the view above stays open
  const n = v.tiles.length;
  tiles.style.setProperty('--cols', String(n <= 6 ? n : Math.ceil(n / 2)));
  tiles.style.setProperty('--th', n <= 6 ? 'clamp(84px, 13vh, 140px)' : 'clamp(70px, 10vh, 112px)');
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
  const show = el('button', 'sm-full sm-show', host, 'SHOW MENU') as HTMLButtonElement;
  show.type = 'button';
  show.addEventListener('click', () => host.classList.remove('viewing'));
  if (v.go) {
    const g = el('button', 'sm-go', bottom) as HTMLButtonElement;
    g.type = 'button';
    el('span', 'sm-go-l', g, v.go.label);
    el('span', 'sm-go-s', g, v.go.sub);
    g.addEventListener('click', v.go.click);
  }
}
