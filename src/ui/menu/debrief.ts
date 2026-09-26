// Mission debrief: a map of the engagement (every aircraft's track over the
// dark moving-map raster, kills and landings marked) and the event timeline
// of the sortie, plus any decorations earned.

import { el } from '../dom';
import type { SortieRecorder, TimelineEvent } from '../../game/logbook';
import { MEDALS } from '../../game/logbook';
import type { MapData } from '../../world/mapData';
import { MAP_HALF, MAP_SIZE, NM } from '../../core/constants';
import { AIRFIELDS } from '../../world/islands';
import { fmtTime } from '../../core/math';

const KIND_COLOR: Record<TimelineEvent['kind'], string> = {
  kill: '#5cf0a0',
  loss: '#ff6a5a',
  shot: '#9fd0ff',
  defeat: '#ffd36a',
  land: '#8ee8ff',
  info: '#c6d4de',
  hit: '#ff9a7a',
};

export function renderDebrief(parent: HTMLElement, s: SortieRecorder, earned: string[], map: MapData | null): void {
  const wrap = el('div', 'debrief', parent);
  const left = el('div', 'debrief-map', wrap);
  const canvas = el('canvas', '', left);
  canvas.width = 520;
  canvas.height = 340;
  drawTrackMap(canvas, s, map);
  const right = el('div', 'debrief-log', wrap);
  el('div', 'dh', right, 'SORTIE TIMELINE');
  const list = el('div', 'dl', right);
  const evs = s.events.slice(-40);
  if (evs.length === 0) el('div', 'de', list, 'No notable events.');
  for (const e of evs) {
    const row = el('div', 'de', list);
    el('span', 'dt', row, fmtTime(e.t));
    const tx = el('span', 'dx', row, e.text);
    tx.style.color = KIND_COLOR[e.kind];
  }
  const stats = el('div', 'dstats', right);
  stats.textContent = `FLIGHT ${fmtTime(s.flightSec)} · MAX ${s.maxG.toFixed(1)} G · M${s.maxMach.toFixed(2)} · ${Math.round(s.maxAltFt).toLocaleString('en-US')} FT`;
  if (earned.length) {
    const m = el('div', 'medals-earned', parent);
    el('div', 'dh', m, 'DECORATIONS EARNED');
    for (const id of earned) {
      const def = MEDALS.find((d) => d.id === id);
      const b = el('div', 'medal got', m);
      el('b', '', b, def?.name ?? id);
      el('small', '', b, def?.desc ?? '');
    }
  }
}

/** Engagement map: fit all tracks, draw them over the terrain raster. */
export function drawTrackMap(canvas: HTMLCanvasElement, s: SortieRecorder, map: MapData | null): void {
  const g = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  g.fillStyle = '#06141f';
  g.fillRect(0, 0, W, H);
  // bounds of all tracks (+ margin), at least 20 NM across
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const tr of s.tracks.values()) {
    for (const p of tr.pts) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z);
      z1 = Math.max(z1, p.z);
    }
  }
  if (!isFinite(x0)) {
    const p = s.player.fm.pos;
    x0 = x1 = p.x;
    z0 = z1 = p.z;
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  let span = Math.max(x1 - x0, (z1 - z0) * (W / H), 30 * NM) * 1.25;
  span = Math.min(span, MAP_SIZE);
  const k = W / span;
  const X = (x: number) => W / 2 + (x - cx) * k;
  const Y = (z: number) => H / 2 + (z - cz) * k;
  // terrain: a crisp relief rendered for exactly this area
  if (map) {
    g.drawImage(map.region(cx - span / 2, cz - (span * H) / W / 2, span, W, H), 0, 0);
  }
  void MAP_HALF;
  // coastline for crispness
  if (map?.coast) {
    g.strokeStyle = 'rgba(120,220,255,0.7)';
    g.lineWidth = 1;
    g.beginPath();
    for (const seg of map.coast.tiles.values()) {
      for (let i = 0; i < seg.length; i += 4) {
        const ax = X(seg[i]), ay = Y(seg[i + 1]);
        if (ax < -10 || ay < -10 || ax > W + 10 || ay > H + 10) continue;
        g.moveTo(ax, ay);
        g.lineTo(X(seg[i + 2]), Y(seg[i + 3]));
      }
    }
    g.stroke();
  }
  // airfields
  for (const f of AIRFIELDS) {
    const x = X(f.x), y = Y(f.z);
    if (x < 0 || y < 0 || x > W || y > H) continue;
    g.fillStyle = f.team === 'blue' ? '#5aa9ff' : '#ff6a5a';
    g.fillRect(x - 3, y - 3, 6, 6);
    g.font = "10px 'Share Tech Mono', monospace";
    g.fillText(f.icao, x + 5, y - 4);
  }
  // tracks
  for (const tr of s.tracks.values()) {
    if (tr.pts.length < 2) continue;
    g.strokeStyle = tr.self ? '#7fffb2' : tr.team === 'blue' ? '#6fb8ff' : '#ff7a6a';
    g.lineWidth = tr.self ? 2.2 : 1.3;
    g.globalAlpha = tr.self ? 1 : 0.85;
    g.beginPath();
    g.moveTo(X(tr.pts[0].x), Y(tr.pts[0].z));
    for (let i = 1; i < tr.pts.length; i++) g.lineTo(X(tr.pts[i].x), Y(tr.pts[i].z));
    g.stroke();
    // start marker
    g.fillStyle = g.strokeStyle;
    g.beginPath();
    g.arc(X(tr.pts[0].x), Y(tr.pts[0].z), 2.5, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  // kills
  for (const kl of s.kills) {
    const x = X(kl.x), y = Y(kl.z);
    g.strokeStyle = '#ffec6a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - 5, y - 5);
    g.lineTo(x + 5, y + 5);
    g.moveTo(x + 5, y - 5);
    g.lineTo(x - 5, y + 5);
    g.stroke();
  }
  // scale bar
  const nm10 = 10 * NM * k;
  g.strokeStyle = '#c6d4de';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(12, H - 14);
  g.lineTo(12 + nm10, H - 14);
  g.stroke();
  g.fillStyle = '#c6d4de';
  g.font = "11px 'Share Tech Mono', monospace";
  g.fillText('10 NM', 14, H - 20);
  g.strokeStyle = 'rgba(140,200,255,0.3)';
  g.strokeRect(0.5, 0.5, W - 1, H - 1);
}
