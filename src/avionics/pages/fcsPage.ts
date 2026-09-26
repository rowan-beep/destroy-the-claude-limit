// FCS / DAMAGE page: airframe damage by component on a planform, flight
// control system status (G limits, override, control authority, roll trim
// from asymmetric damage), pilot G history, and the caution list.

import { MfdPage, PageEnv, bottomRow, pageTitle } from './page';
import { C, OsbButton } from '../draw';
import { PLANFORMS } from './smsPage';
import { COMPONENT_LABEL, Component } from '../../aircraft/damage';
import { clamp } from '../../core/math';
import { GLOC_THRESHOLD } from '../../aircraft/pilot';

/** Component marker positions as fractions of (half span, length from the nose). */
const COMP_POS: Record<Component, [number, number]> = {
  cockpit: [0, 0.2],
  fuselage: [0, 0.45],
  fuel: [0, 0.58],
  wingL: [-0.55, 0.62],
  wingR: [0.55, 0.62],
  engineL: [-0.14, 0.8],
  engineR: [0.14, 0.8],
  tail: [0, 0.95],
};

export function activeCautions(e: PageEnv): { text: string; level: 'warn' | 'caut' }[] {
  const p = e.p;
  const fm = p.fm;
  const d = p.damage;
  const out: { text: string; level: 'warn' | 'caut' }[] = [];
  if (d.fire > 0) out.push({ text: `${d.fireComponent === 'engineL' ? 'L ' : d.fireComponent === 'engineR' ? 'R ' : ''}FIRE`, level: 'warn' });
  fm.engineOut.forEach((o, i) => {
    if (o) out.push({ text: `${fm.engineOut.length > 1 ? (i === 0 ? 'L ' : 'R ') : ''}ENG OUT`, level: 'warn' });
  });
  if (d.leak > 0) out.push({ text: 'FUEL LEAK', level: 'caut' });
  if (d.hydraulics < 0.7) out.push({ text: 'HYD PRESS', level: d.hydraulics < 0.45 ? 'warn' : 'caut' });
  const plan = e.av.nav.fuelPlan(p);
  if (fm.fuelTotal <= 0) out.push({ text: 'FUEL EXHAUSTED', level: 'warn' });
  else if (plan.belowBingo) out.push({ text: 'BINGO FUEL', level: 'warn' });
  else if (plan.belowJoker) out.push({ text: 'JOKER FUEL', level: 'caut' });
  if (fm.overG > 0.2) out.push({ text: 'OVER-G', level: 'caut' });
  if (d.frac('wingL') < 0.5 || d.frac('wingR') < 0.5) out.push({ text: 'WING DAMAGE', level: 'caut' });
  if (d.frac('tail') < 0.5) out.push({ text: 'FLT CONTROL DEGD', level: 'caut' });
  if (fm.stallWarning) out.push({ text: 'AOA LIMIT', level: 'caut' });
  if (fm.gearPos > 0.5 && fm.cas > 150 && !fm.onGround) out.push({ text: 'GEAR OVERSPEED', level: 'caut' });
  if (p.pilot.unconscious) out.push({ text: 'PILOT UNRESPONSIVE', level: 'warn' });
  return out;
}

export const fcsPage: MfdPage = {
  id: 'FCS',

  buttons(e: PageEnv): OsbButton[] {
    return [
      {
        osb: 5,
        label: `GLIM\n${e.g.gOverride ? 'OVRD' : 'NORM'}`,
        sel: e.g.gOverride,
        color: e.g.gOverride ? C.amber : undefined,
        act: () => {
          e.g.gOverride = !e.g.gOverride;
        },
      },
      { osb: 6, label: 'RST\nPEAK', act: () => (e.av.peakG = 1) },
      { osb: 19, label: 'ENG', act: () => (e.st.page = 'ENG') },
      ...bottomRow(e, 'FCS'),
    ];
  },

  draw(e: PageEnv): void {
    const { pen, p, w, h } = e;
    pageTitle(e, 'FCS / DAMAGE');
    const outline = PLANFORMS[p.type];
    let zMin = Infinity, zMax = -Infinity, xMax = 0;
    for (const [x, z] of outline) {
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
      xMax = Math.max(xMax, x);
    }
    const areaW = w * 0.52, areaH = h - 190;
    const k = Math.min(areaW / (xMax * 2), areaH / (zMax - zMin));
    const cx = w * 0.3, top = 78;
    const pts: number[] = [];
    for (const [x, z] of outline) pts.push(cx + x * k, top + (z - zMin) * k);
    for (let i = outline.length - 1; i >= 0; i--) pts.push(cx - outline[i][0] * k, top + (outline[i][1] - zMin) * k);
    pen.color = 'rgba(120,150,170,0.14)';
    pen.poly(pts, true, true);
    pen.color = C.greenDim;
    pen.width(2);
    pen.poly(pts, true);
    const len = zMax - zMin;
    for (const c of Object.keys(COMP_POS) as Component[]) {
      const [fx, fz] = COMP_POS[c];
      const x = cx + fx * xMax * k;
      const y = top + fz * len * k;
      const f = p.damage.frac(c);
      const col = f > 0.85 ? C.green : f > 0.5 ? C.yellow : f > 0.2 ? C.amber : C.red;
      pen.color = col;
      pen.circle(x, y, 9, true);
      pen.text(`${Math.round(f * 100)}`, x, y + 20, { size: 13, color: col, align: 'center' });
    }
    if (p.damage.fire > 0 && e.blink) {
      const c = p.damage.fireComponent ?? 'fuselage';
      const [fx, fz] = COMP_POS[c];
      pen.color = C.red;
      pen.width(3);
      pen.circle(cx + fx * xMax * k, top + fz * len * k, 18);
    }

    // FCS status
    const fm = p.fm;
    const lx = w * 0.6;
    let ly = 90;
    const row = (k2: string, v: string, col: string = C.white) => {
      pen.text(k2, lx, ly, { size: 16, color: C.greenDim });
      pen.text(v, w - 60, ly, { size: 16, color: col, align: 'right' });
      ly += 22;
    };
    row('G LIMIT', `${(e.g.gOverride ? p.spec.gOverride : p.spec.gLimit).toFixed(1)} G`, e.g.gOverride ? C.amber : C.white);
    row('NEG LIM', `${p.spec.gNeg.toFixed(1)} G`);
    row('AOA LIM', `${p.spec.alphaMaxDeg} DEG`);
    row('CTRL AUTH', `${Math.round(fm.damage.control * 100)} %`, fm.damage.control < 0.8 ? C.amber : C.white);
    row('ROLL TRIM', `${(fm.damage.rollBias * 100).toFixed(0)}`, Math.abs(fm.damage.rollBias) > 0.05 ? C.amber : C.white);
    row('HYD', `${Math.round(p.damage.hydraulics * 100)} %`, p.damage.hydraulics < 0.7 ? C.amber : C.white);
    row('AIRFRAME', `${Math.round(p.damage.integrity * 100)} %`);
    ly += 8;
    // pilot G
    row('G NOW', `${fm.nz.toFixed(1)}`, fm.nz > 8 ? C.amber : C.white);
    row('G PEAK', `${e.av.peakG.toFixed(1)}`, e.av.peakG >= GLOC_THRESHOLD ? C.red : e.av.peakG > 8 ? C.amber : C.white);
    // G-LOC margin bar
    const margin = clamp(p.pilot.gSmooth / GLOC_THRESHOLD, 0, 1);
    pen.color = C.greenDim;
    pen.rect(lx, ly - 6, w - 60 - lx, 12);
    pen.color = margin > 0.76 ? C.red : margin > 0.38 ? C.amber : C.green;
    pen.rect(lx + 1, ly - 5, (w - 62 - lx) * margin, 10, true);
    ly += 26;

    // cautions
    const cautions = activeCautions(e);
    pen.text('CAUTIONS', lx, ly, { size: 16, color: C.greenDim });
    ly += 22;
    if (cautions.length === 0) pen.text('NONE', lx, ly, { size: 16, color: C.green });
    for (const c of cautions.slice(0, 4)) {
      pen.text(c.text, lx, ly, { size: 16, color: c.level === 'warn' ? C.red : C.amber, inverse: c.level === 'warn' && e.blink });
      ly += 21;
    }
    void COMPONENT_LABEL;
  },
};
