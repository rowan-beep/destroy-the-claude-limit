// SMS / STORES / WEAPONS page: a planform of the jet with every station and
// what hangs on it, the next round up, weapon selection, gun rate, master
// arm state and tank jettison.

import { MfdPage, PageEnv, bottomRow, pageTitle } from './page';
import { C, OsbButton } from '../draw';
import type { AircraftType, StoreType } from '../../aircraft/specs';
import { LB } from '../../core/constants';
import { TANK_FUEL } from '../../aircraft/specs';

/** Right-half planform outlines, body metres (x right, z aft positive, nose at the smallest z). */
export const PLANFORMS: Record<AircraftType, [number, number][]> = {
  F15EX: [
    [0, -9.85], [0.45, -8.5], [0.66, -6.4], [0.84, -4.6], [1.9, -4.5], [1.95, -1.9], [6.5, 3.17], [6.5, 4.77],
    [1.95, 4.5], [1.75, 5.2], [4.3, 7.8], [4.3, 9.0], [1.5, 9.2], [0.9, 9.6], [0, 9.6],
  ],
  FA18EF: [
    [0, -9.3], [0.42, -7.8], [0.6, -6.4], [1.2, -3.0], [1.62, -0.8], [6.85, 2.0], [6.85, 3.6], [1.6, 4.0],
    [1.3, 4.9], [3.3, 7.3], [3.3, 8.5], [1.2, 8.8], [0.9, 9.0], [0, 9.0],
  ],
  TYPHOON: [
    [0, -8.05], [0.44, -6.6], [0.55, -5.3], [1.95, -4.3], [1.95, -3.8], [0.62, -4.0], [0.72, -2.6], [0.95, -2.2],
    [5.47, 4.0], [5.47, 5.0], [0.95, 7.0], [0.85, 7.9], [0, 7.9],
  ],
};

const STORE_SHORT: Record<StoreType, string> = { AIM120D: '120D', AIM9X: '9X', TANK: 'TK' };

export const smsPage: MfdPage = {
  id: 'SMS',

  buttons(e: PageEnv): OsbButton[] {
    const p = e.p;
    const b: OsbButton[] = [
      { osb: 0, label: 'GUN', sel: p.selectedWeapon === 'GUN', act: () => e.g.selectWeapon('GUN') },
      { osb: 1, label: '9X', sel: p.selectedWeapon === 'AIM9X', color: p.countOf('AIM9X') ? undefined : C.grey, act: () => e.g.selectWeapon('AIM9X') },
      { osb: 2, label: '120D', sel: p.selectedWeapon === 'AIM120D', color: p.countOf('AIM120D') ? undefined : C.grey, act: () => e.g.selectWeapon('AIM120D') },
      { osb: 5, label: `RATE\n${p.gunRateLow ? 'LOW' : 'HIGH'}`, act: () => (p.gunRateLow = !p.gunRateLow) },
    ];
    if (p.countOf('TANK') > 0) {
      b.push({
        osb: 9,
        label: 'JETT\nTANKS',
        color: C.amber,
        act: () => {
          if (p.dropTanks(e.g.sim)) e.g.message('FUEL TANKS JETTISONED', 'info', 2);
        },
      });
    }
    return [...b, ...bottomRow(e, 'SMS')];
  },

  draw(e: PageEnv): void {
    const { pen, p, w, h } = e;
    pageTitle(e, e.names.sms);
    const spec = p.spec;
    const outline = PLANFORMS[p.type];
    let zMin = Infinity, zMax = -Infinity, xMax = 0;
    for (const [x, z] of outline) {
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
      xMax = Math.max(xMax, x);
    }
    const areaW = w - 150, areaH = h - 230;
    const k = Math.min(areaW / (xMax * 2 + 2), areaH / (zMax - zMin));
    const cx = w / 2;
    const top = 92;
    const P = (x: number, z: number): [number, number] => [cx + x * k, top + (z - zMin) * k];

    // airframe outline (mirrored)
    const pts: number[] = [];
    for (const [x, z] of outline) pts.push(...P(x, z));
    for (let i = outline.length - 1; i >= 0; i--) pts.push(...P(-outline[i][0], outline[i][1]));
    pen.color = 'rgba(120,150,170,0.18)';
    pen.poly(pts, true, true);
    pen.color = C.greenDim;
    pen.width(2);
    pen.poly(pts, true);

    // stations
    const sel = p.selectedWeapon;
    const nextUp = sel !== 'GUN' ? p.pickStation(sel) : null;
    for (const st of p.stations) {
      const [x, y] = P(st.def.pos[0], st.def.pos[2]);
      const store = st.store;
      if (!store) {
        pen.color = C.grey;
        pen.width(1.5);
        pen.rect(x - 5, y - 5, 10, 10);
        continue;
      }
      const isSel = store === sel;
      const col = store === 'TANK' ? C.cyan : isSel ? C.white : C.green;
      pen.color = col;
      pen.width(2);
      if (store === 'TANK') {
        pen.ctx.beginPath();
        pen.ctx.ellipse(x, y, 7, 22, 0, 0, Math.PI * 2);
        pen.ctx.stroke();
      } else {
        const len = store === 'AIM120D' ? 30 : 24;
        pen.line(x, y - len / 2, x, y + len / 2);
        pen.line(x - 6, y + len / 2 - 4, x + 6, y + len / 2 - 4);
        pen.line(x - 4, y - len / 2 + 7, x + 4, y - len / 2 + 7);
      }
      pen.text(STORE_SHORT[store], x, y + (store === 'TANK' ? 36 : 28), { size: 15, color: col, align: 'center', inverse: st === nextUp });
    }

    // gun
    const gunPort = spec.gun.port;
    const [gx, gy] = P(gunPort[0], gunPort[2]);
    pen.color = sel === 'GUN' ? C.white : C.green;
    pen.circle(gx, gy, 5, sel === 'GUN');

    // inventory block
    const lines: [string, string, string?][] = [
      ['AIM-120D', String(p.countOf('AIM120D')), sel === 'AIM120D' ? C.white : undefined],
      ['AIM-9X', String(p.countOf('AIM9X')), sel === 'AIM9X' ? C.white : undefined],
      [spec.gun.name.split(' ').slice(0, 2).join(' '), `${p.gunAmmo}`, sel === 'GUN' ? C.white : undefined],
      ['FLR / CHF', `${p.flares} / ${p.chaff}`],
    ];
    const tanks = p.countOf('TANK');
    if (tanks > 0) lines.push([`TANK x${tanks}`, `${Math.round(p.fm.fuelExternal / LB)} LB`]);
    else lines.push(['TANKS', 'NONE']);
    const bx = 60, by = h - 190;
    pen.ctx.fillStyle = 'rgba(0,0,0,0.5)';
    pen.ctx.fillRect(bx - 6, by - 16, 250, lines.length * 24 + 8);
    lines.forEach(([a, b, col], i) => {
      pen.text(a, bx, by + i * 24, { size: 18, color: col ?? C.green });
      pen.text(b, bx + 236, by + i * 24, { size: 18, color: col ?? C.white, align: 'right' });
    });
    void TANK_FUEL;

    // master arm (weight on wheels safes the weapons)
    const wow = p.fm.onGround;
    pen.text(wow ? 'SAFE (WOW)' : 'ARM', w - 64, h - 78, { size: 20, color: wow ? C.amber : C.green, align: 'right', box: true });
    pen.text(`${spec.gun.rpm * (p.gunRateLow ? 0.66 : 1) | 0} SPM`, w - 64, h - 110, { size: 16, color: C.greenDim, align: 'right' });
  },
};
