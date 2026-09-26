// Small fixed-function cockpit displays: the up-front controller scratchpad,
// the standby flight display (attitude, airspeed, altitude), the warning /
// caution light panel and the Super Hornet's engine-fuel display.

import { weaponCode } from '../weapons/weaponSpecs';
import type { Avionics } from './avionics';
import { Pen, C } from './draw';
import { FT, KT, DEG, LB } from '../core/constants';
import { clamp, wrap360 } from '../core/math';
import { fmtBrg } from './nav';
import { activeCautions } from './pages/fcsPage';
import { engineReadout } from './pages/enginePage';
import type { PageEnv } from './pages/page';

/** A PageEnv for helpers that expect one (no portal state needed). */
function pseudoEnv(av: Avionics, pen: Pen, w: number, h: number): PageEnv {
  return {
    g: av.g,
    p: av.p,
    av,
    pen,
    w,
    h,
    st: { page: 'MENU', opts: {} },
    blink: Math.floor(performance.now() / 400) % 2 === 0,
    t: performance.now() / 1000,
    names: av.names,
  };
}

/** Up-front controller: scratchpad and option windows. */
export function drawUfc(pen: Pen, w: number, h: number, av: Avionics): void {
  const p = av.p;
  const nav = av.nav;
  const sp = nav.current;
  const fm = p.fm;
  pen.ctx.fillStyle = '#020a04';
  pen.ctx.fillRect(0, 0, w, h);
  const g = '#6dff8a';
  const plan = nav.fuelPlan(p);
  const brg = nav.bearingTo(fm.pos.x, fm.pos.z);
  const t = av.g.sim.time;
  const clock = `${String(Math.floor(t / 3600) + 10).padStart(2, '0')}:${String(Math.floor((t / 60) % 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const lines = [
    `STPT ${sp.num} ${sp.short}${sp.tacan ? '  TCN ' + sp.tacan : ''}`,
    `${fmtBrg(brg)}/${(nav.rangeTo(fm.pos.x, fm.pos.z) / 1852).toFixed(1)}  BNGO ${(nav.bingoLb / 1000).toFixed(1)}`,
    `RDR ${p.radar.mode} ${p.radar.scopeRange}  ${p.selectedWeapon === 'GUN' ? 'GUN' : weaponCode(p.selectedWeapon)}`,
    `FUEL ${Math.round(plan.totalLb / 100) * 100}   ${clock}`,
  ];
  const size = Math.floor(h / (lines.length + 1));
  lines.forEach((l, i) => pen.text(l, 10, size * (i + 0.9), { size: size * 0.8, color: g }));
}

/** Standby flight display: attitude ball, airspeed, altitude, heading. */
export function drawStandby(pen: Pen, w: number, h: number, av: Avionics): void {
  const ctx = pen.ctx;
  const fm = av.p.fm;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
  const pitch = fm.pitchAngle; // deg
  const bank = fm.bank; // deg
  const pxPerDeg = R / 30;
  ctx.fillStyle = '#05080a';
  ctx.fillRect(0, 0, w, h);
  pen.save();
  pen.clipCircle(cx, cy, R);
  ctx.translate(cx, cy);
  ctx.rotate(-bank * DEG);
  const off = pitch * pxPerDeg;
  ctx.fillStyle = '#2a78c8';
  ctx.fillRect(-w, -h * 2 + off, w * 2, h * 2);
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(-w, off, w * 2, h * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w, off);
  ctx.lineTo(w, off);
  ctx.stroke();
  for (let d = -30; d <= 30; d += 10) {
    if (d === 0) continue;
    const y = off - d * pxPerDeg;
    const hw = d % 20 === 0 ? R * 0.3 : R * 0.18;
    ctx.beginPath();
    ctx.moveTo(-hw, y);
    ctx.lineTo(hw, y);
    ctx.stroke();
  }
  pen.restore();
  // bank scale
  pen.color = C.white;
  pen.width(2);
  for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = b * DEG;
    const l = b % 30 === 0 ? 12 : 7;
    pen.line(cx + Math.sin(a) * R, cy - Math.cos(a) * R, cx + Math.sin(a) * (R + l), cy - Math.cos(a) * (R + l));
  }
  // bank pointer
  const ba = -bank * DEG;
  pen.color = C.yellow;
  pen.poly([cx + Math.sin(ba) * (R - 2), cy - Math.cos(ba) * (R - 2), cx + Math.sin(ba) * (R - 14) - Math.cos(ba) * 7, cy - Math.cos(ba) * (R - 14) - Math.sin(ba) * 7, cx + Math.sin(ba) * (R - 14) + Math.cos(ba) * 7, cy - Math.cos(ba) * (R - 14) + Math.sin(ba) * 7], true, true);
  // aircraft reference
  pen.color = C.yellow;
  pen.width(4);
  pen.line(cx - R * 0.55, cy, cx - R * 0.18, cy);
  pen.line(cx + R * 0.18, cy, cx + R * 0.55, cy);
  pen.circle(cx, cy, 3, true);
  // data
  const s = Math.max(14, Math.floor(w / 12));
  pen.text(`${Math.round(fm.cas / KT)}`, 6, cy, { size: s, color: C.white, bold: true });
  pen.text(`${Math.round(fm.pos.y / FT / 10) * 10}`, w - 6, cy, { size: s, color: C.white, align: 'right', bold: true });
  pen.text(fmtBrg(fm.heading), cx, h - s * 0.7, { size: s * 0.9, color: C.white, align: 'center' });
  pen.text(`M${fm.mach.toFixed(2)}`, 6, s * 0.8, { size: s * 0.8, color: C.greenDim });
  pen.text(`G ${fm.nz.toFixed(1)}`, w - 6, s * 0.8, { size: s * 0.8, color: fm.nz > 8 ? C.amber : C.greenDim, align: 'right' });
  void clamp;
  void wrap360;
}

/** Warning / caution light panel (the Typhoon's DWP, a caution panel elsewhere). */
export function drawWarningPanel(pen: Pen, w: number, h: number, av: Avionics, blink: boolean): void {
  const ctx = pen.ctx;
  ctx.fillStyle = '#0b0d0f';
  ctx.fillRect(0, 0, w, h);
  const env = pseudoEnv(av, pen, w, h);
  const active = activeCautions(env);
  const has = (t: string) => active.find((c) => c.text.includes(t));
  const p = av.p;
  const captions: [string, 'warn' | 'caut' | null][] = [
    ['L FIRE', p.damage.fire > 0 && p.damage.fireComponent === 'engineL' ? 'warn' : null],
    ['R FIRE', p.damage.fire > 0 && p.damage.fireComponent === 'engineR' ? 'warn' : null],
    ['L ENG', p.fm.engineOut[0] ? 'warn' : null],
    ['R ENG', p.fm.engineOut[Math.min(1, p.fm.engineOut.length - 1)] ? 'warn' : null],
    ['HYD', has('HYD') ? has('HYD')!.level : null],
    ['FUEL', has('LEAK') || has('BINGO') || has('EXHAUST') ? 'warn' : has('JOKER') ? 'caut' : null],
    ['FCS', has('FLT CONTROL') ? 'caut' : null],
    ['OVER G', has('OVER-G') ? 'caut' : null],
    ['WING', has('WING') ? 'caut' : null],
    ['AOA', has('AOA') ? 'caut' : null],
    ['GEAR', has('GEAR') ? 'caut' : null],
    ['MSL', p.rwr.level === 'missile' ? 'warn' : p.rwr.level === 'lock' ? 'caut' : null],
  ];
  const cols = 2;
  const rows = Math.ceil(captions.length / cols);
  const cw = w / cols, chh = h / rows;
  captions.forEach(([label, lvl], i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * chh;
    const lit = lvl && (lvl === 'caut' || blink || label.includes('FIRE') === false);
    ctx.fillStyle = lit ? (lvl === 'warn' ? '#e0261c' : '#f0a410') : '#1b1f22';
    ctx.fillRect(x + 4, y + 4, cw - 8, chh - 8);
    pen.text(label, x + cw / 2, y + chh / 2, { size: Math.floor(chh * 0.36), color: lit ? '#1a0b00' : '#4a5258', align: 'center', bold: true });
  });
}

/** Engine / fuel display (F/A-18E/F lower left). */
export function drawEfd(pen: Pen, w: number, h: number, av: Avionics): void {
  const ctx = pen.ctx;
  ctx.fillStyle = '#020604';
  ctx.fillRect(0, 0, w, h);
  const env = pseudoEnv(av, pen, w, h);
  const l = engineReadout(env, 0);
  const r = engineReadout(env, 1);
  const g = '#6dff8a';
  const s = Math.floor(h / 11);
  const row = (label: string, a: string, b: string, i: number) => {
    const y = s * (i + 1.2);
    pen.text(a, w * 0.28, y, { size: s * 0.85, color: g, align: 'right' });
    pen.text(label, w * 0.5, y, { size: s * 0.7, color: '#3a9a55', align: 'center' });
    pen.text(b, w * 0.72, y, { size: s * 0.85, color: g });
  };
  row('RPM', `${Math.round(l.rpm * 100)}`, `${Math.round(r.rpm * 100)}`, 0);
  row('EGT', `${Math.round(l.temp)}`, `${Math.round(r.temp)}`, 1);
  row('FF', `${Math.round(l.ffPph / 100)}`, `${Math.round(r.ffPph / 100)}`, 2);
  row('NOZ', `${Math.round(l.nozzle)}`, `${Math.round(r.nozzle)}`, 3);
  row('OIL', `${Math.round(l.oil)}`, `${Math.round(r.oil)}`, 4);
  const fm = av.p.fm;
  const plan = av.nav.fuelPlan(av.p);
  pen.text(`INT ${Math.round(fm.fuelInternal / LB)}`, w / 2, s * 7.6, { size: s * 0.85, color: g, align: 'center' });
  pen.text(`TOT ${Math.round(plan.totalLb)}`, w / 2, s * 8.7, { size: s * 0.85, color: plan.belowBingo ? C.amber : g, align: 'center' });
  pen.text(`BINGO ${Math.round(plan.bingoLb)}`, w / 2, s * 9.8, { size: s * 0.75, color: '#3a9a55', align: 'center' });
  if (l.fire || r.fire) pen.text('FIRE', w / 2, s * 6.4, { size: s, color: C.red, align: 'center', bold: true });
}
