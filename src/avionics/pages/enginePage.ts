// ENGINE page: per-engine core speed, turbine temperature, nozzle position,
// fuel flow, oil pressure and thrust, plus hydraulic system pressures. Fire
// and flame-out states come from the damage model.

import { MfdPage, PageEnv, bottomRow, pageTitle } from './page';
import { C, OsbButton } from '../draw';
import { LB, LBF } from '../../core/constants';
import { clamp, lerp } from '../../core/math';
import type { AircraftType } from '../../aircraft/specs';

const TEMP_NAME: Record<AircraftType, string> = { F15EX: 'FTIT', FA18EF: 'EGT', TYPHOON: 'TBT', SU35: 'EGT', RAFALE: 'T5', F22: 'FTIT', MIG31: 'EGT' };
const RPM_NAME: Record<AircraftType, string> = { F15EX: 'RPM', FA18EF: 'N2', TYPHOON: 'NH', SU35: 'N2', RAFALE: 'N2', F22: 'N2', MIG31: 'N2' };

export interface EngineReadout {
  rpm: number;
  temp: number;
  nozzle: number;
  ffPph: number;
  oil: number;
  thrustLbf: number;
  ab: number;
  out: boolean;
  fire: boolean;
  health: number;
}

/** Derived engine instrument readings for engine i. */
export function engineReadout(e: PageEnv, i: number): EngineReadout {
  const fm = e.p.fm;
  const n = fm.rpm.length;
  const rpm = fm.rpm[Math.min(i, n - 1)];
  const ab = fm.ab[Math.min(i, fm.ab.length - 1)];
  const out = fm.engineOut[Math.min(i, fm.engineOut.length - 1)];
  const dmg = e.p.damage;
  const comp = i === 0 ? 'engineL' : 'engineR';
  const health = dmg.frac(comp);
  const fire = dmg.fire > 0 && dmg.fireComponent === comp;
  // turbine temperature: idle ~450 C, MIL ~ 880 C, AB adds a little; damage runs hot
  let temp = out ? lerp(temp0(fm.tas), 200, 0.5) : lerp(430, 880, clamp((rpm - 0.62) / 0.38, 0, 1)) + ab * 35 + (1 - health) * 90;
  if (fire) temp += 180;
  const nozzle = out ? 80 : rpm < 0.78 ? lerp(78, 18, clamp((rpm - 0.6) / 0.18, 0, 1)) : 12 + ab * 84;
  const running = out ? 0 : 1;
  const ffPph = n > 0 ? ((fm.fuelFlow / LB) * 3600 * running) / Math.max(1, n - fm.engineOut.filter((x) => x).length) : 0;
  const oil = out ? Math.max(0, rpm * 30) : 18 + 32 * rpm;
  const thrustLbf = out ? 0 : fm.thrust / LBF / Math.max(1, n - fm.engineOut.filter((x) => x).length);
  return { rpm, temp, nozzle, ffPph, oil, thrustLbf, ab, out, fire, health };
}

function temp0(tas: number): number {
  // windmilling engine: ram air temperature
  return 20 + tas * tas * 0.0005;
}

export const enginePage: MfdPage = {
  id: 'ENG',

  buttons(e: PageEnv): OsbButton[] {
    return [
      { osb: 8, label: 'FUEL', act: () => (e.st.page = 'FUEL') },
      { osb: 9, label: 'FCS', act: () => (e.st.page = 'FCS') },
      ...bottomRow(e, 'ENG'),
    ];
  },

  draw(e: PageEnv): void {
    const { pen, p, w, h } = e;
    pageTitle(e, `ENGINE — ${p.spec.engineName.toUpperCase()}`);
    const n = p.spec.engines;
    const cols = n === 1 ? [w / 2] : [w * 0.3, w * 0.7];
    const tName = TEMP_NAME[p.type];
    const rName = RPM_NAME[p.type];
    for (let i = 0; i < cols.length; i++) {
      const x = cols[i];
      const r = engineReadout(e, i);
      const label = cols.length > 1 ? (i === 0 ? 'L' : 'R') : '';
      const stateCol = r.fire ? C.red : r.out ? C.amber : C.white;
      pen.text(`${label} ENG`, x, 82, { size: 18, color: stateCol, align: 'center', bold: true });
      if (r.fire && e.blink) pen.text('FIRE', x, 104, { size: 20, color: C.red, align: 'center', inverse: true, bold: true });
      else if (r.out) pen.text('FLAMEOUT', x, 104, { size: 18, color: C.amber, align: 'center' });
      else if (r.ab > 0.05) pen.text(`AB ${Math.round(r.ab * 5)}`, x, 104, { size: 18, color: C.amber, align: 'center' });
      pen.dial(x, 168, 50, r.rpm / 1.05, r.out ? C.amber : C.green, rName, `${Math.round(r.rpm * 100)}`, 0.97);
      pen.dial(x, 288, 42, (r.temp - 200) / 850, r.temp > 960 ? C.red : r.temp > 900 ? C.amber : C.green, tName, `${Math.round(r.temp)}`, 0.86);
      const rows: [string, string, string?][] = [
        ['NOZ', `${Math.round(r.nozzle)} %`],
        ['FF', `${Math.round(r.ffPph).toLocaleString('en-US')}`],
        ['OIL', `${Math.round(r.oil)} PSI`, r.oil < 12 ? C.amber : undefined],
        ['THR', `${Math.round(r.thrustLbf).toLocaleString('en-US')}`],
        ['HLTH', `${Math.round(r.health * 100)} %`, r.health < 0.5 ? C.red : r.health < 0.9 ? C.amber : undefined],
      ];
      rows.forEach(([k, v, col], j) => {
        pen.text(k, x - 70, 344 + j * 21, { size: 17, color: C.greenDim });
        pen.text(v, x + 72, 344 + j * 21, { size: 17, color: col ?? C.white, align: 'right' });
      });
    }
    // hydraulics
    const hyd = p.damage.hydraulics;
    const outL = p.fm.engineOut[0];
    const outR = p.fm.engineOut[Math.min(1, p.fm.engineOut.length - 1)];
    const psi = (on: boolean) => Math.round((on ? 3000 : 0) * clamp(hyd, 0, 1));
    const hy = [
      ['PC1', psi(!outL)],
      ['PC2', psi(!outR)],
      ['UTL', psi(!(outL && outR))],
    ] as const;
    const y = h - 52;
    hy.forEach(([k, v], j) => {
      const x = w * (0.22 + j * 0.28);
      pen.text(`${k} ${v}`, x, y, { size: 17, color: v < 1500 ? C.red : v < 2700 ? C.amber : C.greenDim, align: 'center' });
    });
  },
};
