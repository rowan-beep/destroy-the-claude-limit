// MENU page: every display format on the side buttons.

import { MfdPage, PageEnv, PageId, PAGE_TITLES, bottomRow, pageTitle } from './page';
import { C, OsbButton } from '../draw';

const LEFT: PageId[] = ['RDR', 'TSD', 'SMS', 'EW'];
const RIGHT: PageId[] = ['ENG', 'FUEL', 'HSI', 'FCS'];

function label(e: PageEnv, id: PageId): string {
  if (id === 'TSD') return e.names.tsd;
  if (id === 'EW') return e.names.ew;
  if (id === 'SMS') return e.names.sms;
  return id;
}

export const menuPage: MfdPage = {
  id: 'MENU',

  buttons(e: PageEnv): OsbButton[] {
    const go = (id: PageId) => () => (e.st.page = id);
    const b: OsbButton[] = [];
    LEFT.forEach((id, i) => b.push({ osb: 19 - i, label: label(e, id), act: go(id) }));
    RIGHT.forEach((id, i) => b.push({ osb: 5 + i, label: label(e, id), act: go(id) }));
    return [...b, ...bottomRow(e, 'MENU')];
  },

  draw(e: PageEnv): void {
    const { pen, p, w, h } = e;
    pageTitle(e, 'MAIN MENU');
    pen.text(p.spec.name.toUpperCase(), w / 2, h * 0.36, { size: 24, color: C.white, align: 'center', bold: true });
    pen.text(`${p.callsign}  ·  ${p.team === 'blue' ? 'BLUE' : 'RED'} FORCE`, w / 2, h * 0.44, { size: 18, color: C.greenDim, align: 'center' });
    const lines = [
      `RADAR  ${p.spec.radar.name}`,
      `EW     ${p.spec.ew.name}`,
      p.spec.irst ? `IRST   ${p.spec.irst.name}` : `GUN    ${p.spec.gun.name}`,
      `FCS    ${p.spec.flightControl}`,
    ];
    lines.forEach((l, i) => pen.text(l.length > 34 ? l.slice(0, 34) : l, w / 2, h * 0.54 + i * 24, { size: 16, color: C.green, align: 'center' }));
    void PAGE_TITLES;
  },
};
