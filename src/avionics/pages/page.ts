// Display page framework: a page draws itself into a portal (a rectangle of
// a display canvas) and publishes the option select buttons it responds to.
// Pages are stateless singletons; per-portal options live in PortalState.

import type { Game } from '../../game/game';
import type { Aircraft } from '../../aircraft/aircraft';
import type { Avionics } from '../avionics';
import { Pen, OsbButton } from '../draw';

export type PageId = 'MENU' | 'RDR' | 'TSD' | 'SMS' | 'ENG' | 'FUEL' | 'EW' | 'HSI' | 'FCS';

export const PAGE_TITLES: Record<PageId, string> = {
  MENU: 'MENU',
  RDR: 'RADAR',
  TSD: 'TSD',
  SMS: 'STORES',
  ENG: 'ENGINE',
  FUEL: 'FUEL',
  EW: 'EW',
  HSI: 'HSI',
  FCS: 'FCS/DMG',
};

export interface PortalState {
  page: PageId;
  opts: Record<string, number | string | boolean>;
}

export interface PageEnv {
  g: Game;
  p: Aircraft;
  av: Avionics;
  pen: Pen;
  w: number;
  h: number;
  st: PortalState;
  /** 2 Hz blink phase */
  blink: boolean;
  /** wall-clock seconds */
  t: number;
  /** aircraft-specific naming (page labels differ between the three jets) */
  names: PageNames;
}

export interface PageNames {
  tsd: string;
  ew: string;
  sms: string;
}

export interface MfdPage {
  id: PageId;
  buttons(e: PageEnv): OsbButton[];
  draw(e: PageEnv): void;
}

export function opt<T extends number | string | boolean>(st: PortalState, key: string, def: T): T {
  const v = st.opts[key];
  return (v === undefined ? def : v) as T;
}

export function setOpt(st: PortalState, key: string, v: number | string | boolean): void {
  st.opts[key] = v;
}

/** Bottom row shared by every page: MENU and four quick page selectors. */
export function bottomRow(e: PageEnv, current: PageId): OsbButton[] {
  const go = (id: PageId) => () => {
    e.st.page = id;
  };
  const quick: [PageId, string][] = [
    ['RDR', 'RDR'],
    ['TSD', e.names.tsd],
    ['SMS', e.names.sms],
    ['EW', e.names.ew],
  ];
  const out: OsbButton[] = [{ osb: 14, label: 'MENU', sel: current === 'MENU', act: go('MENU') }];
  quick.forEach(([id, label], i) => out.push({ osb: 13 - i, label, sel: current === id, act: go(id) }));
  return out;
}

/** Title strip at the top centre of the portal. */
export function pageTitle(e: PageEnv, text: string): void {
  e.pen.text(text, e.w / 2, 50, { size: 18, color: '#9fb4c4', align: 'center' });
}
