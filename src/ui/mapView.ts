// Theater map (M): shaded relief of the full 400 x 400 NM area, airfields,
// GCI radar sites, your jet, friendlies and known hostile tracks.

import type { Game } from '../game/game';
import { el, button } from './dom';
import { HeightGrid, GRID_N } from '../world/heightGrid';
import { MAP_HALF, MAP_SIZE, NM } from '../core/constants';
import { AIRFIELDS, ISLANDS } from '../world/islands';
import { GCI_SITES } from '../game/teamPicture';
import { getGrottoes } from '../world/terrain';
import { clamp } from '../core/math';

export function renderReliefImage(grid: HeightGrid, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const step = MAP_SIZE / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -MAP_HALF + (i + 0.5) * step, z = -MAP_HALF + (j + 0.5) * step;
      const h = grid.height(x, z);
      const hx = grid.height(x + step, z), hz = grid.height(x, z + step);
      let r: number, gg: number, b: number;
      if (h <= 0) {
        const d = clamp(-h / 300, 0, 1);
        r = 30 + 40 * (1 - d);
        gg = 70 + 80 * (1 - d);
        b = 110 + 70 * (1 - d);
        if (h > -8) {
          r = 90;
          gg = 170;
          b = 190;
        }
      } else {
        const t = clamp(h / 4500, 0, 1);
        // hypsometric tint: warm earth -> brown -> grey rock -> snow
        if (t < 0.15) {
          r = 196 - t * 200;
          gg = 170 - t * 180;
          b = 120 - t * 100;
        } else if (t < 0.55) {
          const k = (t - 0.15) / 0.4;
          r = 166 - 50 * k;
          gg = 143 - 45 * k;
          b = 105 - 20 * k;
        } else if (t < 0.78) {
          const k = (t - 0.55) / 0.23;
          r = 116 + 40 * k;
          gg = 98 + 50 * k;
          b = 85 + 60 * k;
        } else {
          r = 230;
          gg = 232;
          b = 238;
        }
        const shade = clamp(1 - ((hx - h) * 0.9 - (hz - h) * 0.9) / step * 3, 0.45, 1.45);
        r *= shade;
        gg *= shade;
        b *= shade;
      }
      const k = (j * size + i) * 4;
      img.data[k] = clamp(r, 0, 255);
      img.data[k + 1] = clamp(gg, 0, 255);
      img.data[k + 2] = clamp(b, 0, 255);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  void GRID_N;
  return c;
}

export class MapView {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private relief: HTMLCanvasElement | null = null;
  private zoom = 1;
  private cx = 0;
  private cz = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private legend: HTMLElement;
  private follow = true;

  constructor(
    parent: HTMLElement,
    private onClose: () => void,
  ) {
    this.root = el('div', 'map-screen hidden', parent);
    this.canvas = el('canvas', 'map-canvas', this.root);
    this.ctx = this.canvas.getContext('2d')!;
    this.legend = el('div', 'map-legend', this.root);
    const close = el('div', 'map-close', this.root);
    button('CLOSE [M]', 'small', close, () => this.onClose());
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = clamp(this.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 0.8, 12);
    }, { passive: false });
    this.canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.follow = false;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const s = this.scale();
      this.cx -= (e.clientX - this.lastX) / s;
      this.cz -= (e.clientY - this.lastY) / s;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
  }

  setGrid(grid: HeightGrid): void {
    this.relief = renderReliefImage(grid, 1024);
  }

  show(v: boolean, g?: Game): void {
    this.root.classList.toggle('hidden', !v);
    if (v && g?.player) {
      this.follow = true;
      this.cx = g.player.fm.pos.x;
      this.cz = g.player.fm.pos.z;
    }
  }

  private scale(): number {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return (Math.min(w, h) / MAP_SIZE) * this.zoom;
  }

  draw(g: Game): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.floor(w * dpr)) {
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
    }
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0c1a24';
    c.fillRect(0, 0, w, h);
    const p = g.player;
    if (this.follow && p) {
      this.cx = p.fm.pos.x;
      this.cz = p.fm.pos.z;
    }
    const s = this.scale();
    const X = (x: number) => w / 2 + (x - this.cx) * s;
    const Y = (z: number) => h / 2 + (z - this.cz) * s;
    if (this.relief) {
      c.imageSmoothingEnabled = true;
      c.drawImage(this.relief, X(-MAP_HALF), Y(-MAP_HALF), MAP_SIZE * s, MAP_SIZE * s);
    }
    // scanlines (CRT look)
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
    // grid every 50 NM
    c.strokeStyle = 'rgba(200,230,255,0.12)';
    c.fillStyle = 'rgba(200,230,255,0.45)';
    c.font = "11px 'Share Tech Mono', monospace";
    for (let v = -200; v <= 200; v += 50) {
      const xx = X(v * NM), zz = Y(-v * NM);
      c.beginPath();
      c.moveTo(xx, Y(-MAP_HALF));
      c.lineTo(xx, Y(MAP_HALF));
      c.stroke();
      c.beginPath();
      c.moveTo(X(-MAP_HALF), zz);
      c.lineTo(X(MAP_HALF), zz);
      c.stroke();
      c.fillText(`${v}`, xx + 3, Y(MAP_HALF) - 4);
    }
    c.strokeStyle = 'rgba(255,200,120,0.5)';
    c.strokeRect(X(-MAP_HALF), Y(-MAP_HALF), MAP_SIZE * s, MAP_SIZE * s);
    // island names
    c.textAlign = 'center';
    c.font = "bold 16px 'Rajdhani', sans-serif";
    for (const isl of ISLANDS) {
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fillText(isl.name, X(isl.cx), Y(isl.cz - isl.ry * 1.05));
      c.font = "11px 'Share Tech Mono', monospace";
      c.fillStyle = isl.owner === 'blue' ? '#8fc7ff' : isl.owner === 'red' ? '#ff9c8c' : '#ffe08a';
      c.fillText(isl.owner === 'contested' ? 'CONTESTED' : isl.owner.toUpperCase(), X(isl.cx), Y(isl.cz - isl.ry * 1.05) + 14);
      c.font = "bold 16px 'Rajdhani', sans-serif";
    }
    // grottoes
    c.fillStyle = 'rgba(80,220,255,0.8)';
    c.font = "10px 'Share Tech Mono', monospace";
    if (this.zoom > 2.5) for (const gr of getGrottoes()) c.fillText(gr.name, X(gr.x), Y(gr.z) - 6);
    // GCI coverage rings (nominal, high altitude)
    for (const site of GCI_SITES) {
      c.strokeStyle = site.team === 'blue' ? 'rgba(90,169,255,0.18)' : 'rgba(255,90,72,0.18)';
      c.beginPath();
      c.arc(X(site.pos.x), Y(site.pos.z), site.rangeNm * NM * s, 0, Math.PI * 2);
      c.stroke();
    }
    // airfields
    c.font = "11px 'Share Tech Mono', monospace";
    for (const f of AIRFIELDS) {
      const x = X(f.x), y = Y(f.z);
      const col = f.team === 'blue' ? '#5aa9ff' : '#ff5a48';
      c.strokeStyle = col;
      c.beginPath();
      c.arc(x, y, 10 * NM * s, 0, Math.PI * 2);
      c.stroke();
      c.save();
      c.translate(x, y);
      c.rotate((f.heading * Math.PI) / 180);
      c.fillStyle = col;
      c.fillRect(-2, -f.length * s * 0.5 - 4, 4, f.length * s + 8);
      c.restore();
      c.fillStyle = '#e6f0f8';
      c.fillText(`${f.name} (${f.team.toUpperCase()})`, x, y + 22);
    }
    if (!g.sim) return;
    const now = g.sim.time;
    // known hostile tracks
    if (p) {
      for (const t of g.picture.tracksFor(p.team)) {
        if (!t.target.alive) continue;
        const age = now - t.time;
        c.globalAlpha = clamp(1 - age / 45, 0.25, 1);
        c.fillStyle = '#ff5a48';
        const x = X(t.pos.x), y = Y(t.pos.z);
        c.beginPath();
        c.moveTo(x, y - 6);
        c.lineTo(x + 5, y + 4);
        c.lineTo(x - 5, y + 4);
        c.closePath();
        c.fill();
        c.fillText(`${t.target.spec.shortName} ${Math.round(t.pos.y / 304.8)}`, x, y - 10);
        c.globalAlpha = 1;
      }
    }
    for (const a of g.sim.aircraft) {
      if (!a.alive || !p || a === p || a.team !== p.team) continue;
      c.fillStyle = '#7dd3ff';
      c.fillRect(X(a.fm.pos.x) - 3, Y(a.fm.pos.z) - 3, 6, 6);
    }
    for (const m of g.sim.missiles) {
      if (!m.alive || !p || (m.shooter !== p && m.target !== p)) continue;
      c.fillStyle = m.shooter === p ? '#fff' : '#ff5a48';
      c.fillRect(X(m.pos.x) - 1.5, Y(m.pos.z) - 1.5, 3, 3);
    }
    if (p) {
      const x = X(p.fm.pos.x), y = Y(p.fm.pos.z);
      const hd = Math.atan2(p.fm.fwd.x, -p.fm.fwd.z);
      c.save();
      c.translate(x, y);
      c.rotate(hd);
      c.fillStyle = '#6cff9a';
      c.beginPath();
      c.moveTo(0, -10);
      c.lineTo(7, 8);
      c.lineTo(0, 4);
      c.lineTo(-7, 8);
      c.closePath();
      c.fill();
      c.restore();
    }
    this.legend.innerHTML =
      `THEATER 400 × 400 NM · GRID 50 NM · ZOOM ${this.zoom.toFixed(1)}×<br>` +
      `<span style="color:#6cff9a">▲</span> YOU &nbsp; <span style="color:#7dd3ff">■</span> FRIENDLY &nbsp; <span style="color:#ff5a48">▲</span> HOSTILE TRACK (GCI / RADAR)<br>` +
      `<span style="color:#5aa9ff">○</span> BLUE AIRFIELD &nbsp; <span style="color:#ff5a48">○</span> RED AIRFIELD · FAINT RINGS: GCI RADAR RANGE<br>` +
      `WHEEL: ZOOM · DRAG: PAN · TERRAIN MASKS ALL RADARS`;
    c.textAlign = 'left';
  }
}
