// Round analog instruments for the jets with steam-gauge panels (the X-15, the SR-71, the MiG-31):
// white needles on black dials, each in its own bezel. One gauge per display canvas. The engine
// gauges come per engine: 'rpm1' is the left engine, 'rpm2' the right.

import type { Avionics } from './avionics';
import { FT, KT } from '../core/constants';

export type GaugeId =
  | 'adi' | 'mach' | 'alt' | 'alpha' | 'vvi' | 'g' | 'pc' | 'prop' | 'hdg'
  | 'kias' | 'tdi' | 'fuel' | 'clock'
  | 'rpm1' | 'rpm2' | 'egt1' | 'egt2' | 'noz1' | 'noz2' | 'ff1' | 'ff2';

const FACE = '#0b0c0d';
const INK = '#e9e6dc';
const INK_DIM = 'rgba(233,230,220,0.55)';
const NEEDLE = '#f2efe6';
const TIP = '#ff8a1c';
const PANEL = '#1f2225';
const FONT = "'Arial Narrow', Arial, sans-serif";

/** Dial angle for a value: a 270 degree sweep from bottom-left, clockwise. */
function sweep(v: number, lo: number, hi: number, a0 = -225, a1 = 45): number {
  const u = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return ((a0 + (a1 - a0) * u) * Math.PI) / 180;
}

function bezel(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  const g = ctx.createRadialGradient(cx, cy - R * 0.3, R * 0.2, cx, cy, R * 1.12);
  g.addColorStop(0, '#5a5e62');
  g.addColorStop(0.85, '#2a2c2f');
  g.addColorStop(1, '#141516');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = FACE;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  // four mounting screws in the corners
  ctx.fillStyle = '#3c3f43';
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.arc(cx + sx * R * 1.07, cy + sy * R * 1.07, R * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

function ticks(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, lo: number, hi: number, step: number, major: number, label: (v: number) => string | null, a0?: number, a1?: number): void {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(R * 0.2)}px ${FONT}`;
  for (let v = lo, i = 0; v <= hi + 1e-6; v += step, i++) {
    const a = sweep(v, lo, hi, a0, a1);
    const big = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const r0 = big ? R * 0.78 : R * 0.86;
    ctx.lineWidth = big ? R * 0.035 : R * 0.018;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95);
    ctx.stroke();
    if (big) {
      const s = label(v);
      if (s) ctx.fillText(s, cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6);
    }
  }
}

function needle(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, a: number, len = 0.86, width = 0.05): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = NEEDLE;
  ctx.beginPath();
  ctx.moveTo(-R * 0.18, -R * width);
  ctx.lineTo(R * (len - 0.12), -R * width * 0.6);
  ctx.lineTo(R * len, 0);
  ctx.lineTo(R * (len - 0.12), R * width * 0.6);
  ctx.lineTo(-R * 0.18, R * width);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = TIP;
  ctx.beginPath();
  ctx.moveTo(R * (len - 0.2), -R * width * 0.5);
  ctx.lineTo(R * len, 0);
  ctx.lineTo(R * (len - 0.2), R * width * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#2e3033';
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

function title(ctx: CanvasRenderingContext2D, cx: number, y: number, R: number, s: string, size = 0.15): void {
  ctx.fillStyle = INK_DIM;
  ctx.font = `bold ${Math.round(R * size)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, cx, y);
}

function drum(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, s: string): void {
  ctx.font = `bold ${Math.round(R * 0.17)}px 'Consolas', monospace`;
  const w = ctx.measureText(s).width + R * 0.12;
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - w / 2, cy - R * 0.12, w, R * 0.24);
  ctx.strokeStyle = '#3c3f43';
  ctx.lineWidth = R * 0.02;
  ctx.strokeRect(cx - w / 2, cy - R * 0.12, w, R * 0.24);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, cx, cy + R * 0.01);
}

/** The attitude ball: white sky, black ground, a fixed aircraft symbol. */
function adi(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, pitch: number, bank: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.97, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((-bank * Math.PI) / 180);
  const k = (R * 0.9) / 40;
  const off = Math.max(-80, Math.min(80, pitch)) * k;
  ctx.fillStyle = '#d9d6cc';
  ctx.fillRect(-R * 2, -R * 4 + off, R * 4, R * 4);
  ctx.fillStyle = '#17181a';
  ctx.fillRect(-R * 2, off, R * 4, R * 4);
  ctx.strokeStyle = '#e9e6dc';
  ctx.lineWidth = R * 0.03;
  ctx.beginPath();
  ctx.moveTo(-R * 2, off);
  ctx.lineTo(R * 2, off);
  ctx.stroke();
  ctx.font = `bold ${Math.round(R * 0.11)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let p = -80; p <= 80; p += 10) {
    if (p === 0) continue;
    const y = off - p * k;
    if (Math.abs(y) > R * 1.1) continue;
    const ink = p > 0 ? '#202124' : '#e9e6dc';
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = R * 0.02;
    const half = p % 20 === 0 ? R * 0.3 : R * 0.16;
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
    ctx.stroke();
    if (p % 20 === 0) {
      ctx.fillText(String(Math.abs(p)), -half - R * 0.12, y);
      ctx.fillText(String(Math.abs(p)), half + R * 0.12, y);
    }
  }
  ctx.restore();
  // bank scale and pointer
  ctx.strokeStyle = INK;
  ctx.lineWidth = R * 0.025;
  for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = ((b - 90) * Math.PI) / 180;
    const r0 = b % 30 === 0 ? R * 0.8 : R * 0.87;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * R * 0.96, cy + Math.sin(a) * R * 0.96);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-bank * Math.PI) / 180);
  ctx.fillStyle = TIP;
  ctx.beginPath();
  ctx.moveTo(0, -R * 0.78);
  ctx.lineTo(-R * 0.06, -R * 0.66);
  ctx.lineTo(R * 0.06, -R * 0.66);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // the little aircraft
  ctx.strokeStyle = TIP;
  ctx.lineWidth = R * 0.045;
  ctx.beginPath();
  ctx.moveTo(cx - R * 0.42, cy);
  ctx.lineTo(cx - R * 0.14, cy);
  ctx.lineTo(cx - R * 0.07, cy + R * 0.08);
  ctx.moveTo(cx + R * 0.42, cy);
  ctx.lineTo(cx + R * 0.14, cy);
  ctx.lineTo(cx + R * 0.07, cy + R * 0.08);
  ctx.stroke();
  ctx.fillStyle = TIP;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.035, 0, Math.PI * 2);
  ctx.fill();
}

/** The SR-71's triple display indicator: three counter windows, KEAS, Mach and altitude, in one box. */
function tdi(ctx: CanvasRenderingContext2D, w: number, h: number, keas: number, mach: number, altFt: number): void {
  ctx.fillStyle = '#141516';
  ctx.fillRect(w * 0.04, h * 0.04, w * 0.92, h * 0.92);
  const rows: [string, string][] = [
    ['KEAS', String(Math.round(keas)).padStart(3, '0')],
    ['MACH', mach.toFixed(2)],
    ['ALT FT', String(Math.max(0, Math.round(altFt / 10) * 10)).padStart(5, '0')],
  ];
  rows.forEach(([label, val], i) => {
    const y = h * (0.2 + i * 0.29);
    ctx.fillStyle = INK_DIM;
    ctx.font = `bold ${Math.round(h * 0.07)}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w * 0.1, y);
    ctx.fillStyle = '#000';
    ctx.fillRect(w * 0.38, y - h * 0.09, w * 0.52, h * 0.18);
    ctx.strokeStyle = '#3c3f43';
    ctx.lineWidth = h * 0.012;
    ctx.strokeRect(w * 0.38, y - h * 0.09, w * 0.52, h * 0.18);
    ctx.fillStyle = INK;
    ctx.font = `bold ${Math.round(h * 0.13)}px 'Consolas', monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(val, w * 0.87, y + h * 0.005);
  });
}

export function drawGauge(ctx: CanvasRenderingContext2D, w: number, h: number, av: Avionics, id: GaugeId, bg = PANEL): void {
  const fm = av.p.fm;
  const spec = av.p.spec;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
  if (id === 'tdi') {
    tdi(ctx, w, h, fm.cas / KT, fm.mach, fm.pos.y / FT);
    return;
  }
  bezel(ctx, cx, cy, R);
  // engine gauges: which engine, and how hard it is working
  const eng = /[12]$/.test(id) ? Math.min(fm.rpm.length - 1, Number(id.slice(-1)) - 1) : 0;
  const rpm = fm.rpm[eng] ?? 0;
  const ab = fm.ab[eng] ?? 0;
  const out = fm.engineOut[eng] ?? false;
  // (the dials follow the jet: a Mach 3 jet's dial runs to 4, the X-15's to 8; altitude in thousands of feet)
  const machHi = spec.maxMach > 4.5 ? 8 : 4;
  const altHi = spec.ceilingFt > 150000 ? 400 : 100;
  switch (id) {
    case 'kias': {
      ticks(ctx, cx, cy, R, 0, 800, 25, 100, (v) => String(v / 100));
      title(ctx, cx, cy + R * 0.34, R, 'KNOTS', 0.12);
      title(ctx, cx, cy + R * 0.5, R, 'x100', 0.1);
      needle(ctx, cx, cy, R, sweep(fm.cas / KT, 0, 800));
      return;
    }
    case 'rpm1':
    case 'rpm2': {
      const pct = out ? 0 : 60 + rpm * 42;
      ticks(ctx, cx, cy, R, 0, 110, 5, 10, (v) => (v % 20 === 0 ? String(v) : null));
      title(ctx, cx, cy + R * 0.34, R, eng === 0 ? 'RPM L' : 'RPM R', 0.12);
      title(ctx, cx, cy + R * 0.5, R, '%', 0.1);
      needle(ctx, cx, cy, R, sweep(pct, 0, 110));
      return;
    }
    case 'egt1':
    case 'egt2': {
      const c = out ? 60 : 380 + rpm * 420 + ab * 120;
      ticks(ctx, cx, cy, R, 0, 1000, 50, 200, (v) => String(v / 100));
      title(ctx, cx, cy + R * 0.34, R, eng === 0 ? 'EGT L' : 'EGT R', 0.12);
      title(ctx, cx, cy + R * 0.5, R, 'C x100', 0.1);
      needle(ctx, cx, cy, R, sweep(c, 0, 1000));
      return;
    }
    case 'noz1':
    case 'noz2': {
      // nozzle area: open at idle and in the burner, closed down at military power
      const pct = out ? 100 : ab > 0.02 ? 40 + 60 * ab : 100 - 85 * Math.min(1, rpm);
      ticks(ctx, cx, cy, R, 0, 100, 5, 25, (v) => String(v));
      title(ctx, cx, cy + R * 0.34, R, eng === 0 ? 'NOZ L' : 'NOZ R', 0.12);
      title(ctx, cx, cy + R * 0.5, R, '% OPEN', 0.1);
      needle(ctx, cx, cy, R, sweep(pct, 0, 100));
      return;
    }
    case 'ff1':
    case 'ff2': {
      const pph = (fm.fuelFlow * 7936.6) / Math.max(1, fm.rpm.length) / 1000;
      ticks(ctx, cx, cy, R, 0, 60, 2.5, 10, (v) => String(v));
      title(ctx, cx, cy + R * 0.34, R, eng === 0 ? 'FF L' : 'FF R', 0.12);
      title(ctx, cx, cy + R * 0.5, R, 'PPH x1000', 0.1);
      needle(ctx, cx, cy, R, sweep(pph, 0, 60));
      return;
    }
    case 'fuel': {
      const lb = (fm.fuelTotal * 2.2046) / 1000;
      const hi = Math.max(10, Math.ceil(((spec.internalFuel + fm.fuelExternalCap) * 2.2046) / 10000) * 10);
      ticks(ctx, cx, cy, R, 0, hi, hi / 20, hi / 5, (v) => String(Math.round(v)));
      title(ctx, cx, cy + R * 0.34, R, 'FUEL', 0.12);
      title(ctx, cx, cy + R * 0.5, R, 'LB x1000', 0.1);
      needle(ctx, cx, cy, R, sweep(lb, 0, hi));
      return;
    }
    case 'clock': {
      const d = new Date();
      const hr = (d.getHours() % 12) + d.getMinutes() / 60;
      ticks(ctx, cx, cy, R, 0, 60, 1, 5, (v) => (v === 0 ? null : String(v / 5)), -90, 270);
      needle(ctx, cx, cy, R, sweep(hr * 5, 0, 60, -90, 270), 0.55, 0.06);
      needle(ctx, cx, cy, R, sweep(d.getMinutes() + d.getSeconds() / 60, 0, 60, -90, 270), 0.85, 0.04);
      return;
    }
    case 'adi':
      adi(ctx, cx, cy, R, fm.pitchAngle, fm.bank);
      return;
    case 'mach': {
      ticks(ctx, cx, cy, R, 0, machHi, machHi / 16, machHi / 8, (v) => String(v));
      title(ctx, cx, cy + R * 0.42, R, 'MACH');
      needle(ctx, cx, cy, R, sweep(fm.mach, 0, machHi));
      return;
    }
    case 'alt': {
      const kft = fm.pos.y / FT / 1000;
      ticks(ctx, cx, cy, R, 0, altHi, altHi / 16, altHi / 8, (v) => String(v));
      title(ctx, cx, cy - R * 0.3, R, 'ALT', 0.14);
      title(ctx, cx, cy - R * 0.14, R, 'x1000 FT', 0.1);
      drum(ctx, cx, cy + R * 0.42, R, String(Math.max(0, Math.round(fm.pos.y / FT))).padStart(6, '0'));
      needle(ctx, cx, cy, R, sweep(kft, 0, altHi));
      return;
    }
    case 'alpha': {
      const a = (fm.alpha * 180) / Math.PI;
      ticks(ctx, cx, cy, R, -10, 30, 2.5, 10, (v) => String(v));
      title(ctx, cx, cy + R * 0.42, R, 'ANGLE OF ATTACK', 0.11);
      needle(ctx, cx, cy, R, sweep(a, -10, 30));
      return;
    }
    case 'vvi': {
      // thousands of feet a minute: zero at 9 o'clock, climb clockwise up, descent down
      const v = ((fm.vel.y / FT) * 60) / 1000;
      ticks(ctx, cx, cy, R, -40, 40, 5, 10, (x) => String(Math.abs(x)), 20, 340);
      title(ctx, cx + R * 0.2, cy - R * 0.3, R, 'UP', 0.13);
      title(ctx, cx + R * 0.2, cy + R * 0.3, R, 'DN', 0.13);
      title(ctx, cx + R * 0.38, cy, R, 'x1000', 0.1);
      needle(ctx, cx, cy, R, sweep(v, -40, 40, 20, 340));
      return;
    }
    case 'g': {
      ticks(ctx, cx, cy, R, -4, 10, 1, 2, (v) => String(v));
      title(ctx, cx, cy + R * 0.42, R, 'G');
      needle(ctx, cx, cy, R, sweep(fm.nz, -4, 10));
      return;
    }
    case 'pc': {
      // the XLR99's chamber pressure: about 600 psi at full thrust
      const psi = fm.rpm[0] * 600 * (fm.thrust > 0 ? 1 : 0);
      ticks(ctx, cx, cy, R, 0, 700, 50, 100, (v) => String(v / 100));
      title(ctx, cx, cy + R * 0.34, R, 'CHAMBER', 0.12);
      title(ctx, cx, cy + R * 0.5, R, 'PSI x100', 0.1);
      needle(ctx, cx, cy, R, sweep(psi, 0, 700));
      return;
    }
    case 'prop': {
      const cap = av.p.spec.internalFuel + fm.fuelExternalCap;
      const pct = cap > 0 ? (fm.fuelTotal / cap) * 100 : 0;
      ticks(ctx, cx, cy, R, 0, 100, 5, 25, (v) => (v === 0 ? 'E' : v === 100 ? 'F' : String(v)));
      title(ctx, cx, cy + R * 0.34, R, 'PROPELLANT', 0.12);
      title(ctx, cx, cy + R * 0.5, R, fm.fuelExternal > 0 ? 'EXT TANKS' : 'INTERNAL', 0.1);
      needle(ctx, cx, cy, R, sweep(pct, 0, 100));
      return;
    }
    case 'hdg': {
      // compass card turning under a fixed lubber line
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((-fm.heading * Math.PI) / 180);
      ctx.strokeStyle = INK;
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let d = 0; d < 360; d += 5) {
        const a = ((d - 90) * Math.PI) / 180;
        const big = d % 30 === 0;
        ctx.lineWidth = big ? R * 0.03 : R * 0.015;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (big ? R * 0.78 : R * 0.86), Math.sin(a) * (big ? R * 0.78 : R * 0.86));
        ctx.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
        ctx.stroke();
        if (big) {
          ctx.save();
          ctx.translate(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6);
          ctx.rotate(((d) * Math.PI) / 180);
          ctx.font = `bold ${Math.round(R * 0.2)}px ${FONT}`;
          ctx.fillText(d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10), 0, 0);
          ctx.restore();
        }
      }
      ctx.restore();
      ctx.fillStyle = TIP;
      ctx.beginPath();
      ctx.moveTo(cx, cy - R * 0.98);
      ctx.lineTo(cx - R * 0.07, cy - R * 0.82);
      ctx.lineTo(cx + R * 0.07, cy - R * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = TIP;
      ctx.lineWidth = R * 0.04;
      ctx.beginPath();
      ctx.moveTo(cx, cy - R * 0.3);
      ctx.lineTo(cx, cy + R * 0.3);
      ctx.moveTo(cx - R * 0.25, cy - R * 0.05);
      ctx.lineTo(cx + R * 0.25, cy - R * 0.05);
      ctx.moveTo(cx - R * 0.1, cy + R * 0.25);
      ctx.lineTo(cx + R * 0.1, cy + R * 0.25);
      ctx.stroke();
      return;
    }
  }
}
