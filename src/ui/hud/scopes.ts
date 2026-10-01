// Small canvas instruments: radar B-scope, RWR, minimap, compass tape.

import type { Game } from '../../game/game';
import type { Aircraft } from '../../aircraft/aircraft';
import { DEG, NM, FT } from '../../core/constants';
import { wrap360, clamp } from '../../core/math';
import { AIRFIELDS, activeMap } from '../../world/islands';
import { rwrSymbol } from '../../sensors/rwr';
import { hostile, RULES } from '../../game/rules';

// Canvas sizes come from a ResizeObserver: reading clientWidth every frame forced
// the browser to recompute the page layout right after the HUD text changed.
const sizes = new WeakMap<HTMLCanvasElement, { w: number; h: number }>();
const ro =
  typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver((entries) => {
        for (const e of entries) sizes.set(e.target as HTMLCanvasElement, { w: e.contentRect.width, h: e.contentRect.height });
      })
    : null;

function cssSize(canvas: HTMLCanvasElement): { w: number; h: number } {
  let s = sizes.get(canvas);
  if (!s || !ro) {
    s = { w: canvas.clientWidth, h: canvas.clientHeight };
    sizes.set(canvas, s);
    ro?.observe(canvas);
  }
  return s;
}

function visible(canvas: HTMLCanvasElement): boolean {
  if (!canvas.isConnected) return true;
  const s = cssSize(canvas);
  return s.w > 10 && s.h > 10;
}

function fit(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  if (!canvas.isConnected) {
    // offscreen (cockpit MFD texture): draw at native resolution
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return ctx;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cs = cssSize(canvas);
  const w = cs.w || canvas.width, h = cs.h || canvas.height;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

const G = '#6cff9a';
const GD = 'rgba(108,255,154,0.35)';
const RED = '#ff5a48';
// friendly blips are green, hostiles red (per the brief)
const FRIEND = '#5dff8a';

export function drawRadarScope(canvas: HTMLCanvasElement, g: Game, sweepT: number): void {
  if (!visible(canvas)) return;
  const ctx = fit(canvas);
  const cs = canvas.isConnected ? cssSize(canvas) : null;
  const w = cs ? cs.w : canvas.width, h = cs ? cs.h : canvas.height;
  const p = g.player!;
  ctx.clearRect(0, 0, w, h);
  const r = p.radar;
  const az = r.scanAz * DEG;
  const range = r.scopeRange * NM;
  ctx.strokeStyle = GD;
  ctx.lineWidth = 1;
  ctx.font = "10px 'Share Tech Mono', monospace";
  ctx.fillStyle = GD;
  // grid
  for (let i = 1; i < 4; i++) {
    const y = h - (i / 4) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (const a of [-0.5, 0, 0.5]) {
    const x = w / 2 + a * (w / 2);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.fillText(`${r.scopeRange}`, 2, 10);
  ctx.fillText(`${r.scopeRange / 2}`, 2, h / 2 + 4);
  if (r.mode === 'OFF') {
    ctx.fillStyle = G;
    ctx.textAlign = 'center';
    ctx.fillText('SILENT', w / 2, h / 2);
    ctx.textAlign = 'left';
  } else {
    // sweep line
    const sx = w / 2 + Math.sin(sweepT) * (w / 2) * 0.98;
    ctx.strokeStyle = 'rgba(108,255,154,0.25)';
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
    ctx.stroke();
  }
  const now = g.sim.time;
  const draw = (azr: number, rng: number, hostile: boolean, locked: boolean, alpha: number, alt: number, vel: { x: number; z: number } | null) => {
    if (Math.abs(azr) > az * 1.02 || rng > range) return;
    const x = w / 2 + (azr / az) * (w / 2);
    const y = h - (rng / range) * h;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hostile ? RED : FRIEND;
    ctx.fillRect(x - 3, y - 2, 6, 4);
    if (vel) {
      ctx.strokeStyle = hostile ? RED : FRIEND;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + vel.x * 8, y - vel.z * 8);
      ctx.stroke();
    }
    ctx.fillStyle = G;
    ctx.fillText(String(Math.round(alt / FT / 1000)), x + 5, y + 3);
    if (locked) {
      ctx.strokeStyle = G;
      ctx.strokeRect(x - 6, y - 5, 12, 10);
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
  const fwdH = Math.atan2(p.fm.fwd.x, -p.fm.fwd.z);
  for (const c of r.contacts.values()) {
    const age = now - c.lastSeen;
    const a = r.anglesTo(c.pos);
    // velocity vector relative to scope (heading-relative)
    let vel: { x: number; z: number } | null = null;
    if (r.mode === 'TWS' || r.lock === c.target) {
      const vh = Math.atan2(c.vel.x, -c.vel.z) - fwdH;
      const sp = Math.min(1, Math.hypot(c.vel.x, c.vel.z) / 400);
      vel = { x: Math.sin(vh) * sp, z: Math.cos(vh) * sp };
    }
    draw(a.az, a.range, c.hostile, r.lock === c.target, clamp(1 - age / 6, 0.15, 1), c.pos.y, vel);
  }
  if (p.irst) {
    for (const c of p.irst.contacts.values()) {
      if (r.contacts.has(c.target.id)) continue;
      const a = r.anglesTo(c.pos);
      draw(a.az, a.range, c.hostile, p.irst.lock === c.target, clamp(1 - (now - c.lastSeen) / 5, 0.15, 1) * 0.8, c.pos.y, null);
    }
  }
  // own missiles in flight (datalink symbols)
  for (const m of g.sim.missiles) {
    if (m.shooter !== p || !m.alive) continue;
    const a = r.anglesTo(m.pos);
    if (Math.abs(a.az) > az || a.range > range) continue;
    const x = w / 2 + (a.az / az) * (w / 2);
    const y = h - (a.range / range) * h;
    ctx.fillStyle = m.mode === 'ACTIVE' || m.mode === 'IR' ? '#ffe28a' : '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawRwr(canvas: HTMLCanvasElement, g: Game, blink: boolean): void {
  if (!visible(canvas)) return;
  const ctx = fit(canvas);
  const cs = canvas.isConnected ? cssSize(canvas) : null;
  const w = cs ? cs.w : canvas.width, h = cs ? cs.h : canvas.height;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 4;
  const p = g.player!;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = GD;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = "bold 10px 'Share Tech Mono', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of p.rwr.threats.values()) {
    const lethal = t.level !== 'search';
    const rr = lethal ? R * 0.45 : R * 0.8;
    const x = cx + Math.sin(t.bearing) * rr;
    const y = cy - Math.cos(t.bearing) * rr;
    ctx.fillStyle = t.level === 'missile' ? RED : t.level === 'lock' ? '#ffc94a' : G;
    if (t.level === 'missile' && !blink) continue;
    ctx.fillText(rwrSymbol(t.source), x, y);
    if (lethal) {
      ctx.strokeStyle = ctx.fillStyle as string;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (const m of p.rwr.missiles) {
    const x = cx + Math.sin(m.bearing) * R * 0.28;
    const y = cy - Math.cos(m.bearing) * R * 0.28;
    ctx.fillStyle = RED;
    if (blink) ctx.fillText('M', x, y);
  }
  ctx.fillStyle = G;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx - 3, cy + 3);
  ctx.lineTo(cx + 3, cy + 3);
  ctx.closePath();
  ctx.fill();
}

export function drawMinimap(canvas: HTMLCanvasElement, g: Game): void {
  if (!visible(canvas)) return;
  const ctx = fit(canvas);
  const cs = canvas.isConnected ? cssSize(canvas) : null;
  const w = cs ? cs.w : canvas.width, h = cs ? cs.h : canvas.height;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 3;
  const p = g.player!;
  ctx.clearRect(0, 0, w, h);
  // 60 NM on the big theaters; on a small map, enough to show its islands at a useful size
  const rangeNm = Math.min(60, Math.round(activeMap.sizeNm * 0.4));
  const rangeM = rangeNm * NM;
  const hdg = Math.atan2(p.fm.fwd.x, -p.fm.fwd.z);
  const toScreen = (x: number, z: number): [number, number] => {
    const dx = x - p.fm.pos.x, dn = -(z - p.fm.pos.z);
    // rotate so heading is up
    const rx = dx * Math.cos(hdg) - dn * Math.sin(hdg);
    const ry = dx * Math.sin(hdg) + dn * Math.cos(hdg);
    return [cx + (rx / rangeM) * R, cy - (ry / rangeM) * R];
  };
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(90,220,200,0.25)';
  for (const rr of [0.33, 0.66]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  // free-for-all battle zone (solid) and the next circle (dashed)
  const zn = RULES.zone;
  if (zn.active) {
    const [zx, zy] = toScreen(zn.x, zn.z);
    ctx.strokeStyle = 'rgba(150,120,255,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(zx, zy, (zn.r / rangeM) * R, 0, Math.PI * 2);
    ctx.stroke();
    if (zn.nr > 0) {
      const [nx, ny] = toScreen(zn.nx, zn.nz);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(nx, ny, (zn.nr / rangeM) * R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineWidth = 1;
  }
  // free-for-all final circles: every jet revealed
  if (RULES.revealAll) {
    ctx.fillStyle = 'rgba(255,120,100,0.85)';
    for (const a of g.sim.aircraft) {
      if (a === p || !a.alive) continue;
      const [rx, ry] = toScreen(a.fm.pos.x, a.fm.pos.z);
      ctx.beginPath();
      ctx.arc(rx, ry, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // free-for-all bounty: revealed to everyone
  if (RULES.ffa && RULES.bountyId >= 0) {
    const b = g.sim.aircraft.find((a) => a.id === RULES.bountyId);
    if (b && b.alive && b !== p) {
      const [bx, by] = toScreen(b.fm.pos.x, b.fm.pos.z);
      ctx.fillStyle = '#ffd35a';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', bx, by + 4);
    }
  }
  // airfields
  for (const f of AIRFIELDS) {
    const [x, y] = toScreen(f.x, f.z);
    ctx.fillStyle = f.team === 'blue' ? '#5aa9ff' : '#ff5a48';
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  // known contacts (own sensors + GCI picture)
  const now = g.sim.time;
  for (const t of g.picture.tracksFor(p.team)) {
    if (!t.target.alive || now - t.time > 20) continue;
    const [x, y] = toScreen(t.pos.x, t.pos.z);
    ctx.fillStyle = RED;
    ctx.globalAlpha = clamp(1 - (now - t.time) / 20, 0.3, 1);
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 4, y + 3);
    ctx.lineTo(x - 4, y + 3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const a of g.sim.aircraft) {
    if (a === p || hostile(a, p) || !a.alive) continue;
    const [x, y] = toScreen(a.fm.pos.x, a.fm.pos.z);
    ctx.fillStyle = FRIEND;
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  for (const m of g.sim.missiles) {
    if (!m.alive) continue;
    if (m.shooter !== p && m.target !== p) continue;
    const [x, y] = toScreen(m.pos.x, m.pos.z);
    ctx.fillStyle = m.shooter === p ? '#fff' : RED;
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  ctx.restore();
  // cardinal letters
  ctx.font = "bold 11px 'Share Tech Mono', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const card: [string, number][] = [
    ['N', 0],
    ['E', 90],
    ['S', 180],
    ['W', 270],
  ];
  for (const [s, deg] of card) {
    const a = deg * DEG - hdg;
    ctx.fillStyle = s === 'N' ? '#ff8a7a' : '#9fe';
    ctx.fillText(s, cx + Math.sin(a) * (R - 9), cy - Math.cos(a) * (R - 9));
  }
  // own ship
  ctx.fillStyle = '#6cff9a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 7);
  ctx.lineTo(cx - 5, cy + 5);
  ctx.lineTo(cx, cy + 2);
  ctx.lineTo(cx + 5, cy + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#9fe';
  ctx.font = "9px 'Share Tech Mono', monospace";
  ctx.fillText(`${rangeNm} NM`, cx, h - 8);
}

export function drawCompass(canvas: HTMLCanvasElement, g: Game): void {
  if (!visible(canvas)) return;
  const ctx = fit(canvas);
  const cs = canvas.isConnected ? cssSize(canvas) : null;
  const w = cs ? cs.w : canvas.width, h = cs ? cs.h : canvas.height;
  const p = g.player!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(12,20,28,0.62)';
  ctx.fillRect(0, 0, w, h);
  const hdg = p.fm.heading;
  const span = 60;
  ctx.strokeStyle = '#cfe3f5';
  ctx.fillStyle = '#cfe3f5';
  ctx.font = "11px 'Share Tech Mono', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = Math.floor((hdg - span) / 5) * 5; d <= hdg + span; d += 5) {
    const x = w / 2 + ((d - hdg) / span) * (w / 2);
    const dd = wrap360(d);
    const r = Math.round(dd);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x, h - (r % 10 === 0 ? 8 : 4));
    ctx.stroke();
    if (r % 30 === 0) {
      const lbl = r === 0 ? 'N' : r === 90 ? 'E' : r === 180 ? 'S' : r === 270 ? 'W' : String(r / 10);
      ctx.fillText(lbl, x, 10);
    }
  }
  ctx.globalAlpha = 1;
  const mark = (brg: number, col: string, shape: 'sq' | 'tri') => {
    let d = brg - hdg;
    d = ((d + 540) % 360) - 180;
    if (Math.abs(d) > span) return;
    const x = w / 2 + (d / span) * (w / 2);
    ctx.fillStyle = col;
    if (shape === 'sq') ctx.fillRect(x - 5, h - 16, 10, 8);
    else {
      ctx.beginPath();
      ctx.moveTo(x, h - 17);
      ctx.lineTo(x + 5, h - 8);
      ctx.lineTo(x - 5, h - 8);
      ctx.closePath();
      ctx.fill();
    }
  };
  // selected steerpoint (or the nearest friendly base without avionics)
  const nav = g.avionics?.nav;
  if (nav) mark(nav.bearingTo(p.fm.pos.x, p.fm.pos.z), '#4ad28a', 'sq');
  else {
    let best = null as null | { b: number; d: number };
    for (const f of AIRFIELDS) {
      if (f.team !== p.team) continue;
      const d = Math.hypot(f.x - p.fm.pos.x, f.z - p.fm.pos.z);
      if (!best || d < best.d) best = { b: (Math.atan2(f.x - p.fm.pos.x, -(f.z - p.fm.pos.z)) / DEG + 360) % 360, d };
    }
    if (best) mark(best.b, '#4ad28a', 'sq');
  }
  const lt = p.lockedTarget;
  if (lt) mark((Math.atan2(lt.fm.pos.x - p.fm.pos.x, -(lt.fm.pos.z - p.fm.pos.z)) / DEG + 360) % 360, '#ff5a48', 'tri');
  else {
    for (const t of g.picture.tracksFor(p.team)) {
      if (!t.target.alive) continue;
      mark((Math.atan2(t.pos.x - p.fm.pos.x, -(t.pos.z - p.fm.pos.z)) / DEG + 360) % 360, 'rgba(255,90,72,0.7)', 'tri');
    }
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(w / 2, h - 1);
  ctx.lineTo(w / 2 - 5, h - 9);
  ctx.lineTo(w / 2 + 5, h - 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = "bold 12px 'Share Tech Mono', monospace";
  ctx.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), w / 2, 10);
}

export function unused(a: Aircraft): void {
  void a;
}
