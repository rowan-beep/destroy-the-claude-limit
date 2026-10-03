// Round analog instruments for the X-15's 1960s panel: white needles on black
// dials, each in its own bezel. One gauge per display canvas.

import type { Avionics } from './avionics';
import { FT } from '../core/constants';

export type GaugeId = 'adi' | 'mach' | 'alt' | 'alpha' | 'vvi' | 'g' | 'pc' | 'prop' | 'hdg';

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

export function drawGauge(ctx: CanvasRenderingContext2D, w: number, h: number, av: Avionics, id: GaugeId): void {
  const fm = av.p.fm;
  ctx.fillStyle = PANEL;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
  bezel(ctx, cx, cy, R);
  switch (id) {
    case 'adi':
      adi(ctx, cx, cy, R, fm.pitchAngle, fm.bank);
      return;
    case 'mach': {
      ticks(ctx, cx, cy, R, 0, 8, 0.5, 1, (v) => String(v));
      title(ctx, cx, cy + R * 0.42, R, 'MACH');
      needle(ctx, cx, cy, R, sweep(fm.mach, 0, 8));
      return;
    }
    case 'alt': {
      const kft = fm.pos.y / FT / 1000;
      ticks(ctx, cx, cy, R, 0, 400, 25, 50, (v) => String(v));
      title(ctx, cx, cy - R * 0.3, R, 'ALT', 0.14);
      title(ctx, cx, cy - R * 0.14, R, 'x1000 FT', 0.1);
      drum(ctx, cx, cy + R * 0.42, R, String(Math.max(0, Math.round(fm.pos.y / FT))).padStart(6, '0'));
      needle(ctx, cx, cy, R, sweep(kft, 0, 400));
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
