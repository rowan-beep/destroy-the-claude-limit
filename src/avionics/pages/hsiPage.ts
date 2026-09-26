// HSI page: heading-up compass rose with the TACAN bearing pointer to the
// selected steerpoint, a course arrow with course deviation (TACAN or ILS
// localizer), the ILS glideslope scale, DME, time-to-go, ground speed and
// the steerpoint selector.

import { MfdPage, PageEnv, bottomRow, pageTitle } from './page';
import { C, OsbButton } from '../draw';
import { NM, KT, DEG, FT } from '../../core/constants';
import { clamp, wrap360 } from '../../core/math';
import { fmtBrg, fmtTtg } from '../nav';

export const hsiPage: MfdPage = {
  id: 'HSI',

  buttons(e: PageEnv): OsbButton[] {
    const nav = e.av.nav;
    const p = e.p;
    const crs = Math.round(nav.displayCourse(p));
    return [
      { osb: 5, label: 'CRS\n▲', act: () => (nav.course = wrap360((nav.course ?? crs) + 5)) },
      { osb: 6, label: fmtBrg(crs) },
      { osb: 7, label: 'CRS\n▼', act: () => (nav.course = wrap360((nav.course ?? crs) - 5)) },
      { osb: 8, label: 'AUTO', sel: nav.course === null, act: () => (nav.course = null) },
      { osb: 9, label: 'ILS', sel: nav.ilsEnabled, act: () => (nav.ilsEnabled = !nav.ilsEnabled) },
      { osb: 19, label: 'STPT\n▲', act: () => nav.next() },
      { osb: 18, label: 'STPT\n▼', act: () => nav.prev() },
      { osb: 17, label: 'RTB', act: () => nav.selectNearestFriendly(p.fm.pos.x, p.fm.pos.z) },
      ...bottomRow(e, 'HSI'),
    ];
  },

  draw(e: PageEnv): void {
    const { pen, p, w, h } = e;
    const nav = e.av.nav;
    const fm = p.fm;
    pageTitle(e, 'HSI');
    const cx = w / 2, cy = h / 2 + 14;
    const R = Math.min(w, h) * 0.3;
    const hdg = fm.heading;
    pen.width(2);
    pen.compassRose(cx, cy, R, hdg, C.white, true, 18);
    // lubber line & heading box
    pen.color = C.white;
    pen.poly([cx, cy - R - 2, cx - 8, cy - R - 16, cx + 8, cy - R - 16], true, true);
    pen.text(fmtBrg(hdg), cx, cy - R - 32, { size: 22, color: C.white, align: 'center', box: true, bold: true });

    const sp = nav.current;
    const brg = nav.bearingTo(fm.pos.x, fm.pos.z);
    const dme = nav.dmeTo(p) / NM;
    const ils = nav.ils(p);
    const crs = nav.displayCourse(p);

    // bearing pointer (TACAN needle): double line to the steerpoint
    {
      const a = (brg - hdg) * DEG;
      const sx = Math.sin(a), sy = -Math.cos(a);
      pen.color = C.cyan;
      pen.width(3);
      pen.line(cx - sx * (R - 6), cy - sy * (R - 6), cx - sx * (R * 0.55), cy - sy * (R * 0.55));
      pen.line(cx + sx * (R * 0.55), cy + sy * (R * 0.55), cx + sx * (R - 22), cy + sy * (R - 22));
      pen.poly([cx + sx * (R - 6), cy + sy * (R - 6), cx + sx * (R - 24) - sy * 9, cy + sy * (R - 24) + sx * 9, cx + sx * (R - 24) + sy * 9, cy + sy * (R - 24) - sx * 9], true, true);
    }

    // course arrow and deviation bar
    {
      const a = (crs - hdg) * DEG;
      const sx = Math.sin(a), sy = -Math.cos(a);
      const px = Math.cos(a), py = Math.sin(a); // perpendicular (right of course)
      pen.color = C.magenta;
      pen.width(3);
      const r1 = R * 0.78, r2 = R * 0.42;
      // head
      pen.line(cx + sx * r2, cy + sy * r2, cx + sx * r1, cy + sy * r1);
      pen.poly([cx + sx * (r1 + 14), cy + sy * (r1 + 14), cx + sx * r1 - px * 9, cy + sy * r1 - py * 9, cx + sx * r1 + px * 9, cy + sy * r1 + py * 9], true, true);
      // tail
      pen.line(cx - sx * r2, cy - sy * r2, cx - sx * r1, cy - sy * r1);
      // deviation dots
      const dot = R * 0.14;
      pen.width(2);
      pen.color = C.white;
      for (const k of [-2, -1, 1, 2]) pen.circle(cx + px * dot * k, cy + py * dot * k, 4);
      // CDI: ILS localizer (2 dots = full scale) or TACAN (1 dot = 1 NM)
      const devDots = ils ? clamp(ils.locDots, -2.3, 2.3) : clamp(nav.courseDeviationNm(p), -2.3, 2.3);
      const ox = px * dot * devDots, oy = py * dot * devDots;
      pen.color = ils?.captured ? C.green : C.magenta;
      pen.width(4);
      pen.line(cx + ox - sx * r2 * 0.95, cy + oy - sy * r2 * 0.95, cx + ox + sx * r2 * 0.95, cy + oy + sy * r2 * 0.95);
      // to/from
      let rel = wrap360(brg - crs);
      if (rel > 180) rel -= 360;
      const to = Math.abs(rel) < 90;
      pen.color = C.white;
      pen.triangle(cx + sx * R * 0.25 * (to ? 1 : -1), cy + sy * R * 0.25 * (to ? 1 : -1), 8, a + (to ? 0 : Math.PI), true);
    }

    // own aircraft
    pen.color = C.white;
    pen.width(2.5);
    pen.ownship(cx, cy, 1);

    // glideslope scale
    if (ils) {
      const gx = w - 70, gy = cy, gs = R * 0.16;
      pen.color = C.white;
      pen.width(2);
      for (const k of [-2, -1, 1, 2]) pen.circle(gx, gy + k * gs, 4);
      pen.line(gx - 12, gy, gx + 12, gy);
      // above the glideslope -> the diamond sits below centre (fly down)
      const d = clamp(ils.gsDots, -2.3, 2.3);
      pen.color = ils.captured ? C.green : C.magenta;
      pen.diamond(gx, gy + d * gs, 9, true);
      pen.text('GS', gx, gy - gs * 2.8, { size: 15, color: C.greenDim, align: 'center' });
    }

    // data blocks
    const gsKts = Math.hypot(fm.vel.x, fm.vel.z) / KT;
    const plan = nav.fuelPlan(p);
    pen.text(`${sp.num} ${sp.name}`, 60, 88, { size: 17, color: C.white });
    pen.text(sp.tacan ? `TCN ${sp.tacan}` : sp.kind === 'bullseye' ? 'BULLSEYE' : '', 60, 110, { size: 16, color: C.cyan });
    pen.text(`${dme.toFixed(1)} NM`, w - 60, 88, { size: 20, color: C.white, align: 'right', bold: true });
    pen.text(`${fmtBrg(brg)}°  ${fmtTtg(plan.ttgSec)}`, w - 60, 110, { size: 16, color: C.greenDim, align: 'right' });
    pen.text(`GS ${Math.round(gsKts)}`, 60, h - 58, { size: 17, color: C.greenDim });
    if (ils) {
      pen.text(`ILS ${ils.field.icao} RWY ${ils.runway}`, w / 2, h - 80, { size: 17, color: ils.captured ? C.green : C.magenta, align: 'center' });
      pen.text(`${(ils.distThr / NM).toFixed(1)} NM  ${Math.round(ils.hat / FT)} FT  ${ils.gsAngle.toFixed(1)}°`, w / 2, h - 58, { size: 16, color: C.white, align: 'center' });
    } else {
      pen.text(`CRS ${fmtBrg(crs)}${nav.course === null ? ' AUTO' : ''}`, w - 60, h - 58, { size: 17, color: C.magenta, align: 'right' });
    }
  },
};
