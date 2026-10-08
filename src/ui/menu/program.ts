// The programs the game holds: TRIAD (air combat), SPACE EXPLORATION and OCEAN.
// The logo at the top of the menu rail opens a dropdown to switch between
// them; the choice is remembered, and each program keeps its own data.

import { el } from '../dom';

export type Program = 'air' | 'space' | 'ocean';

const KEY = 'triad.program';

export function loadProgram(): Program {
  try {
    const p = localStorage.getItem(KEY);
    return p === 'space' || p === 'ocean' ? p : 'air';
  } catch {
    return 'air';
  }
}

export function saveProgram(p: Program): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* private mode: the switch still works for this session */
  }
}

/**
 * The menu logo as a dropdown button: the big mark with an arrow, and under it
 * the list of programs. `onPick` is called with the chosen program.
 */
export function programLogo(parent: HTMLElement, current: Program, sub: string, onPick: (p: Program) => void): void {
  const logo = el('div', 'mm-logo', parent);
  const btn = el('button', 'mm-logo-btn', logo);
  btn.type = 'button';
  el('span', 'mm-logo-mark', btn, 'TRIAD');
  el('span', 'mm-logo-arrow', btn, '▾');
  el('div', 'mm-logo-sub', logo, sub);
  const list = el('div', 'mm-prog', logo);
  const item = (p: Program, label: string, text: string) => {
    const b = el('button', 'mm-prog-item ' + p + (p === current ? ' on' : ''), list);
    b.type = 'button';
    el('span', 'mm-prog-l', b, label);
    el('span', 'mm-prog-s', b, text);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      if (p !== current) onPick(p);
    });
  };
  item('air', 'TRIAD', 'Air combat: jets, missions, logbook');
  item('space', 'SPACE EXPLORATION', 'Rockets, the Moon and Mars');
  item('ocean', 'OCEAN', 'A survey submarine: listen, chart, investigate');
  const close = () => {
    list.classList.remove('open');
    btn.classList.remove('open');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !list.classList.contains('open');
    list.classList.toggle('open', open);
    btn.classList.toggle('open', open);
  });
  document.addEventListener('click', (e) => {
    if (!logo.contains(e.target as Node)) close();
  });
}
