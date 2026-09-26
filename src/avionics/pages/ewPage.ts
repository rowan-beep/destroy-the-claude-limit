// EW page (EPAWSS on the F-15EX, ALR-67 / ALQ-214 on the Super Hornet,
// DASS on the Typhoon): a large threat display with lethality rings, the
// threat list, missile warnings with time to impact, and the self-protection
// controls — auto countermeasures, jammer transmit / standby and the
// expendables program.

import { MfdPage, PageEnv, bottomRow, pageTitle } from './page';
import { C, OsbButton } from '../draw';
import { RWR_SYMBOL } from '../../sensors/rwr';
import { wrap360 } from '../../core/math';

const PROGRAMS = [1, 2, 4, 6];

export const ewPage: MfdPage = {
  id: 'EW',

  buttons(e: PageEnv): OsbButton[] {
    const p = e.p;
    const sim = e.g.sim;
    const b: OsbButton[] = [
      {
        osb: 6,
        label: `JMR\n${p.jammerOn ? 'XMIT' : 'STBY'}`,
        sel: p.jammerOn,
        act: () => {
          p.jammerOn = !p.jammerOn;
          e.g.message(p.jammerOn ? 'JAMMER TRANSMITTING' : 'JAMMER STANDBY', 'info', 2);
        },
      },
      {
        osb: 7,
        label: `PROG\n${p.cmBurst}`,
        act: () => (p.cmBurst = PROGRAMS[(PROGRAMS.indexOf(p.cmBurst) + 1) % PROGRAMS.length]),
      },
    ];
    if (p.spec.ew.autoDispense) {
      b.push({
        osb: 5,
        label: `AUTO\n${sim.autoCm ? 'ON' : 'OFF'}`,
        sel: sim.autoCm,
        act: () => {
          sim.autoCm = !sim.autoCm;
          e.g.settings.gameplay.autoCountermeasures = sim.autoCm;
        },
      });
    }
    return [...b, ...bottomRow(e, 'EW')];
  },

  draw(e: PageEnv): void {
    const { pen, p, w, h } = e;
    pageTitle(e, p.spec.ew.name.toUpperCase());
    const cx = w * 0.38, cy = h * 0.47, R = Math.min(w, h) * 0.3;
    // rings
    pen.width(1.5);
    pen.color = C.greenDim;
    pen.circle(cx, cy, R);
    pen.circle(cx, cy, R * 0.62);
    pen.dash([4, 6]);
    pen.circle(cx, cy, R * 0.3);
    pen.dash();
    for (let d = 0; d < 360; d += 30) {
      const a = (d * Math.PI) / 180;
      pen.line(cx + Math.sin(a) * R, cy - Math.cos(a) * R, cx + Math.sin(a) * (R + (d % 90 === 0 ? 12 : 7)), cy - Math.cos(a) * (R + (d % 90 === 0 ? 12 : 7)));
    }
    pen.color = C.white;
    pen.ownship(cx, cy, 0.8);

    // threats
    const threats = [...p.rwr.threats.values()].sort((a, b) => rank(b.level) - rank(a.level));
    for (const t of threats) {
      const lethal = t.level !== 'search';
      const rr = t.level === 'missile' ? R * 0.3 : lethal ? R * 0.62 : R * 0.85;
      const x = cx + Math.sin(t.bearing) * rr;
      const y = cy - Math.cos(t.bearing) * rr;
      const col = t.level === 'missile' ? C.red : t.level === 'lock' ? C.amber : C.green;
      if (t.level === 'missile' && !e.blink) continue;
      pen.color = col;
      pen.width(2);
      pen.text(RWR_SYMBOL[t.source.type] ?? 'U', x, y, { size: 22, color: col, align: 'center', bold: true });
      if (lethal) pen.circle(x, y, 17);
      if (t.newThreat && e.blink) pen.arc(x, y, 23, Math.PI, Math.PI * 2);
    }
    for (const m of p.rwr.missiles) {
      const x = cx + Math.sin(m.bearing) * R * 0.18;
      const y = cy - Math.cos(m.bearing) * R * 0.18;
      pen.color = C.red;
      pen.width(3);
      pen.line(cx, cy, cx + Math.sin(m.bearing) * R, cy - Math.cos(m.bearing) * R);
      if (e.blink) pen.text('M', x, y, { size: 20, color: C.red, align: 'center', bold: true });
    }

    // threat list
    const lx = w * 0.7;
    let ly = 96;
    pen.text('THREATS', lx, ly, { size: 17, color: C.greenDim });
    ly += 26;
    if (threats.length === 0) pen.text('CLEAR', lx, ly, { size: 18, color: C.green });
    for (const t of threats.slice(0, 7)) {
      const brg = Math.round(wrap360((t.bearing * 180) / Math.PI));
      const clock = Math.round(wrap360((t.bearing * 180) / Math.PI) / 30) % 12 || 12;
      const lvl = t.level === 'missile' ? 'MSL' : t.level === 'lock' ? 'LOCK' : t.level === 'launch' ? 'LNCH' : 'SRCH';
      const col = t.level === 'missile' ? C.red : t.level === 'lock' ? C.amber : C.white;
      pen.text(`${RWR_SYMBOL[t.source.type] ?? 'U'} ${String(brg).padStart(3, '0')} ${clock}H ${lvl}`, lx, ly, { size: 16, color: col });
      ly += 22;
    }
    ly += 12;
    if (p.rwr.missiles.length > 0) {
      pen.text('MISSILES', lx, ly, { size: 17, color: C.red });
      ly += 24;
      for (const m of p.rwr.missiles.slice(0, 4)) {
        const clock = Math.round(wrap360((m.bearing * 180) / Math.PI) / 30) % 12 || 12;
        pen.text(`${m.kind === 'ir' ? 'IR ' : 'RDR'} ${clock}H ${m.tti.toFixed(0)}S`, lx, ly, { size: 16, color: C.red });
        ly += 22;
      }
    }

    // expendables & jammer status strip
    const y = h - 58;
    pen.text(`FLR ${p.flares}`, w * 0.2, y, { size: 19, color: p.flares < 10 ? C.amber : C.white, align: 'center' });
    pen.text(`CHF ${p.chaff}`, w * 0.45, y, { size: 19, color: p.chaff < 10 ? C.amber : C.white, align: 'center' });
    pen.text(p.jammerOn ? 'JAM XMIT' : 'JAM STBY', w * 0.72, y, { size: 17, color: p.jammerOn ? C.green : C.grey, align: 'center', box: p.jammerOn });
    if (p.spec.ew.maws) pen.text('MAWS', 70, 96, { size: 15, color: C.greenDim });
  },
};

function rank(l: string): number {
  return l === 'missile' ? 3 : l === 'launch' ? 2 : l === 'lock' ? 1 : 0;
}
