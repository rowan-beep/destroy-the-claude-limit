// Cockpit multi-function displays (drawn into canvas textures).

import type { Game } from '../../game/game';
import type { CockpitDisplays } from '../../aircraft/models/cockpit';
import { drawRadarScope, drawMinimap } from './scopes';
import { LB, FT, KT } from '../../core/constants';

export function drawMfds(d: CockpitDisplays, g: Game, sweep: number): void {
  const p = g.player;
  if (!p) return;
  const [left, centre, right] = d.canvases;
  for (const c of d.canvases) {
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#020806';
    ctx.fillRect(0, 0, c.width, c.height);
  }
  drawMinimap(left, g);
  drawRadarScope(centre, g, sweep);
  // engine / fuel / stores page
  const ctx = right.getContext('2d')!;
  const fm = p.fm;
  ctx.fillStyle = '#6cff9a';
  ctx.font = "16px 'Share Tech Mono', monospace";
  let rpm = 0;
  for (const r of fm.rpm) rpm += r;
  rpm /= fm.rpm.length;
  const lines = [
    'ENG / FUEL',
    `RPM  ${Math.round(rpm * 100)}%  AB ${Math.round(fm.afterburner * 100)}%`,
    `FF   ${Math.round((fm.fuelFlow / LB) * 3600)} PPH`,
    `INT  ${Math.round(fm.fuelInternal / LB)} LB`,
    `EXT  ${Math.round(fm.fuelExternal / LB)} LB`,
    `GW   ${Math.round(fm.mass / LB)} LB`,
    '',
    `120D ${p.countOf('AIM120D')}  9X ${p.countOf('AIM9X')}`,
    `GUN  ${p.gunAmmo}`,
    `FLR  ${p.flares}  CHF ${p.chaff}`,
    `CAS  ${Math.round(fm.cas / KT)}  ALT ${Math.round(fm.pos.y / FT)}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 12, 26 + i * 21));
  for (const t of d.textures) t.needsUpdate = true;
}
