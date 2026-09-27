// FUEL page: tank schematic with quantities (drained in the real transfer
// order: external tanks, then conformal / fuselage transfer tanks, wings,
// and the feed tanks last), totals, fuel flow, endurance, still-air range,
// fuel at the steerpoint, bingo / joker setting and leak detection.

import { MfdPage, PageEnv, bottomRow, pageTitle } from './page';
import { C, OsbButton } from '../draw';
import { LB } from '../../core/constants';
import { clamp } from '../../core/math';
import type { AircraftType } from '../../aircraft/specs';
import { fmtTtg } from '../nav';

interface TankDef {
  name: string;
  /** fraction of internal fuel */
  frac: number;
  /** layout box in a 0..1 unit square (x, y, w, h) */
  box: [number, number, number, number];
}

/** Tanks listed in drain order (first listed empties first). */
const TANKS: Record<AircraftType, TankDef[]> = {
  F15EX: [
    { name: 'CFT L', frac: 0.14, box: [0.08, 0.3, 0.12, 0.4] },
    { name: 'CFT R', frac: 0.14, box: [0.8, 0.3, 0.12, 0.4] },
    { name: 'TK 1', frac: 0.2, box: [0.41, 0.08, 0.18, 0.2] },
    { name: 'WING L', frac: 0.15, box: [0.22, 0.42, 0.16, 0.24] },
    { name: 'WING R', frac: 0.15, box: [0.62, 0.42, 0.16, 0.24] },
    { name: 'FEED L', frac: 0.11, box: [0.41, 0.34, 0.085, 0.3] },
    { name: 'FEED R', frac: 0.11, box: [0.505, 0.34, 0.085, 0.3] },
  ],
  FA18EF: [
    { name: 'TK 1', frac: 0.18, box: [0.41, 0.06, 0.18, 0.18] },
    { name: 'TK 4', frac: 0.22, box: [0.41, 0.66, 0.18, 0.2] },
    { name: 'WING L', frac: 0.15, box: [0.16, 0.38, 0.2, 0.22] },
    { name: 'WING R', frac: 0.15, box: [0.64, 0.38, 0.2, 0.22] },
    { name: 'FEED L', frac: 0.15, box: [0.41, 0.28, 0.085, 0.34] },
    { name: 'FEED R', frac: 0.15, box: [0.505, 0.28, 0.085, 0.34] },
  ],
  TYPHOON: [
    { name: 'FUS FWD', frac: 0.26, box: [0.41, 0.06, 0.18, 0.2] },
    { name: 'FUS AFT', frac: 0.24, box: [0.41, 0.66, 0.18, 0.2] },
    { name: 'WING L', frac: 0.17, box: [0.16, 0.4, 0.2, 0.24] },
    { name: 'WING R', frac: 0.17, box: [0.64, 0.4, 0.2, 0.24] },
    { name: 'FEED', frac: 0.16, box: [0.41, 0.3, 0.18, 0.32] },
  ],
  F22: [
    { name: 'F-1', frac: 0.2, box: [0.41, 0.06, 0.18, 0.2] },
    { name: 'F-2', frac: 0.2, box: [0.41, 0.3, 0.18, 0.22] },
    { name: 'WING L', frac: 0.2, box: [0.16, 0.42, 0.2, 0.24] },
    { name: 'WING R', frac: 0.2, box: [0.64, 0.42, 0.2, 0.24] },
    { name: 'F-3', frac: 0.2, box: [0.41, 0.6, 0.18, 0.24] },
  ],
  RAFALE: [
    { name: 'FUS FWD', frac: 0.24, box: [0.41, 0.06, 0.18, 0.2] },
    { name: 'FUS AFT', frac: 0.22, box: [0.41, 0.66, 0.18, 0.2] },
    { name: 'WING L', frac: 0.19, box: [0.16, 0.4, 0.2, 0.24] },
    { name: 'WING R', frac: 0.19, box: [0.64, 0.4, 0.2, 0.24] },
    { name: 'FEED', frac: 0.16, box: [0.41, 0.3, 0.18, 0.32] },
  ],
  SU35: [
    { name: 'TK 1', frac: 0.2, box: [0.41, 0.06, 0.18, 0.18] },
    { name: 'TK 3', frac: 0.2, box: [0.41, 0.66, 0.18, 0.2] },
    { name: 'WING L', frac: 0.16, box: [0.14, 0.38, 0.22, 0.24] },
    { name: 'WING R', frac: 0.16, box: [0.64, 0.38, 0.22, 0.24] },
    { name: 'TK 2', frac: 0.28, box: [0.41, 0.28, 0.18, 0.34] },
  ],
};

export function tankQuantities(type: AircraftType, internalKg: number, capKg: number): { def: TankDef; qty: number; cap: number }[] {
  const defs = TANKS[type];
  const out = defs.map((d) => ({ def: d, qty: 0, cap: d.frac * capKg }));
  // fill from the last-drained tank backwards
  let rem = internalKg;
  for (let i = out.length - 1; i >= 0; i--) {
    // symmetric pairs share what is left evenly
    const pair = i > 0 && out[i].def.name.endsWith(' R') && out[i - 1].def.name.endsWith(' L');
    if (pair) {
      const each = Math.min(out[i].cap, rem / 2);
      out[i].qty = each;
      out[i - 1].qty = each;
      rem -= each * 2;
      i--;
    } else {
      out[i].qty = Math.min(out[i].cap, rem);
      rem -= out[i].qty;
    }
  }
  return out;
}

export const fuelPage: MfdPage = {
  id: 'FUEL',

  buttons(e: PageEnv): OsbButton[] {
    const nav = e.av.nav;
    return [
      { osb: 5, label: 'BNGO\n▲', act: () => (nav.bingoLb = Math.min(20000, nav.bingoLb + 500)) },
      { osb: 6, label: `${(nav.bingoLb / 1000).toFixed(1)}K` },
      { osb: 7, label: 'BNGO\n▼', act: () => (nav.bingoLb = Math.max(0, nav.bingoLb - 500)) },
      { osb: 19, label: 'ENG', act: () => (e.st.page = 'ENG') },
      { osb: 18, label: 'HSI', act: () => (e.st.page = 'HSI') },
      ...bottomRow(e, 'FUEL'),
    ];
  },

  draw(e: PageEnv): void {
    const { pen, p, w, h } = e;
    pageTitle(e, 'FUEL');
    const fm = p.fm;
    const plan = e.av.nav.fuelPlan(p);
    // schematic
    const sx = 70, sy = 70, sw = w - 140, sh = 200;
    const tanks = tankQuantities(p.type, fm.fuelInternal, p.spec.internalFuel);
    for (const t of tanks) {
      const [bx, by, bw, bh] = t.def.box;
      const x = sx + bx * sw, y = sy + by * sh, ww = bw * sw, hh = bh * sh;
      const f = t.cap > 0 ? clamp(t.qty / t.cap, 0, 1) : 0;
      pen.color = 'rgba(67,220,255,0.35)';
      pen.rect(x, y + hh * (1 - f), ww, hh * f, true);
      pen.color = C.cyan;
      pen.width(2);
      pen.rect(x, y, ww, hh);
      pen.text(t.def.name, x + ww / 2, y + 14, { size: 13, color: C.white, align: 'center' });
      pen.text(`${Math.round(t.qty / LB / 10) * 10}`, x + ww / 2, y + hh - 12, { size: 15, color: C.white, align: 'center' });
    }
    // external tanks
    const tanksExt = p.countOf('TANK');
    if (tanksExt > 0) {
      const each = fm.fuelExternal / tanksExt;
      const cap = fm.fuelExternalCap / Math.max(1, tanksExt);
      for (let i = 0; i < tanksExt; i++) {
        const x = sx + sw * (tanksExt === 1 ? 0.5 : 0.25 + (0.5 * i) / (tanksExt - 1)) - 22;
        const y = sy + sh + 4;
        const f = cap > 0 ? clamp(each / cap, 0, 1) : 0;
        pen.color = 'rgba(67,220,255,0.35)';
        pen.rect(x, y + 30 * (1 - f), 44, 30 * f, true);
        pen.color = C.cyan;
        pen.rect(x, y, 44, 30);
        pen.text(`${Math.round(each / LB / 10) * 10}`, x + 22, y + 44, { size: 13, color: C.white, align: 'center' });
      }
    }
    // totals
    const rows: [string, string, string?][] = [
      ['TOTAL', `${Math.round(plan.totalLb).toLocaleString('en-US')} LB`, plan.belowBingo ? C.red : plan.belowJoker ? C.amber : C.white],
      ['INT / EXT', `${Math.round(fm.fuelInternal / LB).toLocaleString('en-US')} / ${Math.round(fm.fuelExternal / LB).toLocaleString('en-US')}`],
      ['FLOW', `${Math.round(plan.flowPph).toLocaleString('en-US')} PPH`, fm.afterburner > 0.05 ? C.amber : undefined],
      ['ENDUR', plan.enduranceMin > 600 ? '--' : `${plan.enduranceMin.toFixed(1)} MIN`],
      ['RANGE', plan.rangeNm > 5000 ? '--' : `${Math.round(plan.rangeNm)} NM`],
      [`STPT ${e.av.nav.current.num}`, `${fmtTtg(plan.ttgSec)}  ${Math.round(plan.atStptLb / 100) * 100} LB`, plan.atStptLb < plan.bingoLb ? C.amber : undefined],
      ['BINGO / JOKER', `${Math.round(plan.bingoLb)} / ${Math.round(plan.jokerLb)}`],
    ];
    const ty = sy + sh + (tanksExt > 0 ? 70 : 24);
    rows.forEach(([k, v, col], i) => {
      pen.text(k, 60, ty + i * 21, { size: 16, color: C.greenDim });
      pen.text(v, w - 60, ty + i * 21, { size: 16, color: col ?? C.white, align: 'right' });
    });
    const leak = p.damage.leak;
    if (leak > 0) pen.text(`LEAK ${Math.round((leak / LB) * 3600).toLocaleString('en-US')} PPH`, w / 2, 62, { size: 18, color: e.blink ? C.red : C.amber, align: 'center', bold: true });
    else if (plan.belowBingo && e.blink) pen.text('BINGO', w / 2, 62, { size: 20, color: C.red, align: 'center', inverse: true, bold: true });
  },
};
