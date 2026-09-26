// Player paint jobs: the factory scheme, a solid colour, or a two-colour
// wrap pattern, with a finish and a brightness. Saved per aircraft type.
// Panel lines, markings and weathering stay on top of whatever you choose.

import * as THREE from 'three';
import type { AircraftType } from '../specs';

export type PaintMode = 'factory' | 'solid' | 'wrap';
export type WrapId = 'blackice' | 'inferno' | 'aurora' | 'galaxy' | 'digital' | 'splinter' | 'tiger' | 'hex' | 'woodland' | 'arctic' | 'carbon' | 'chevron';
export type Finish = 'matte' | 'satin' | 'gloss' | 'metallic';

export interface PaintConfig {
  mode: PaintMode;
  /** main colour (solid, and the base of a wrap) */
  color: string;
  /** second wrap colour */
  color2: string;
  wrap: WrapId;
  finish: Finish;
  /** 0.5 .. 1.5 */
  brightness: number;
}

export const SOLID_COLORS: [string, string][] = [
  ['GHOST GREY', '#9aa1a6'],
  ['GUNMETAL', '#4a5056'],
  ['MIDNIGHT', '#1b1e22'],
  ['ARCTIC WHITE', '#e6e8ea'],
  ['NAVY', '#1f2f52'],
  ['ROYAL BLUE', '#2a55b8'],
  ['SKY', '#6fa8dc'],
  ['CRIMSON', '#9c1c22'],
  ['RACING RED', '#d42a1f'],
  ['SUNSET ORANGE', '#e2701f'],
  ['GOLD', '#c9a13a'],
  ['DESERT TAN', '#c2a878'],
  ['OLIVE DRAB', '#55603a'],
  ['FOREST', '#2f4a32'],
  ['TEAL', '#1f8a8a'],
  ['VIOLET', '#5b3a8e'],
  ['HOT PINK', '#d6427e'],
  ['LIME', '#8cc63f'],
];

/** full: the whole-jet art style drawn by the skin shader (3 Black Ice, 4 Inferno, 5 Aurora, 6 Galaxy). */
export const WRAPS: { id: WrapId; name: string; a: string; b: string; tileM: number; full?: number }[] = [
  { id: 'blackice', name: 'BLACK ICE', a: '#020405', b: '#2ec4d4', tileM: 5, full: 3 },
  { id: 'inferno', name: 'INFERNO', a: '#0d0706', b: '#ff5a14', tileM: 5, full: 4 },
  { id: 'aurora', name: 'AURORA', a: '#050d24', b: '#2effa8', tileM: 6, full: 5 },
  { id: 'galaxy', name: 'GALAXY', a: '#04020d', b: '#a64dff', tileM: 7, full: 6 },
  { id: 'digital', name: 'DIGITAL', a: '#7d858b', b: '#4b5258', tileM: 4 },
  { id: 'splinter', name: 'SPLINTER', a: '#b39b72', b: '#6b5436', tileM: 7 },
  { id: 'tiger', name: 'TIGER', a: '#e0701e', b: '#16171a', tileM: 5 },
  { id: 'hex', name: 'HEX', a: '#2a3036', b: '#2fb3a8', tileM: 1.6 },
  { id: 'woodland', name: 'WOODLAND', a: '#55603a', b: '#2b3321', tileM: 7 },
  { id: 'arctic', name: 'ARCTIC', a: '#e8eaec', b: '#9aa3aa', tileM: 6 },
  { id: 'carbon', name: 'CARBON', a: '#1d1f22', b: '#3b3f44', tileM: 0.5 },
  { id: 'chevron', name: 'CHEVRON', a: '#d9dcdf', b: '#b3222a', tileM: 3 },
];

export const FINISHES: [Finish, string][] = [
  ['matte', 'MATTE'],
  ['satin', 'SATIN'],
  ['gloss', 'GLOSS'],
  ['metallic', 'METALLIC'],
];

export function defaultPaint(): PaintConfig {
  return { mode: 'factory', color: '#2a55b8', color2: '#16171a', wrap: 'digital', finish: 'satin', brightness: 1 };
}

const KEY = 'triad.paint.v1';

export function loadPaint(t: AircraftType): PaintConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<string, Partial<PaintConfig>>;
      if (all[t]) return { ...defaultPaint(), ...all[t] };
    }
  } catch {
    /* storage unavailable */
  }
  return defaultPaint();
}

export function savePaint(t: AircraftType, p: PaintConfig): void {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, PaintConfig>) : {};
    all[t] = p;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// Tileable wrap masks (white = second colour)
// ---------------------------------------------------------------------------

const S = 512;
const masks = new Map<WrapId, THREE.CanvasTexture>();

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw a shape nine times so it wraps across the tile edges. */
function tiled(g: CanvasRenderingContext2D, draw: (ox: number, oy: number) => void): void {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) draw(ox, oy);
}

function drawMask(id: WrapId, g: CanvasRenderingContext2D): void {
  if (id === 'blackice') {
    drawBlackIce(g);
    return;
  }
  if (id === 'inferno') {
    drawInferno(g);
    return;
  }
  if (id === 'aurora') {
    drawAurora(g);
    return;
  }
  if (id === 'galaxy') {
    drawGalaxy(g);
    return;
  }
  const r = rng(id.length * 7919 + id.charCodeAt(0));
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  switch (id) {
    case 'digital': {
      // pixel camo: blocky clusters at two scales
      for (const [cell, n] of [[32, 60], [16, 220]] as const) {
        for (let i = 0; i < n; i++) {
          const x = Math.floor(r() * (S / cell)) * cell;
          const y = Math.floor(r() * (S / cell)) * cell;
          const w = (1 + Math.floor(r() * 3)) * cell;
          const h = (1 + Math.floor(r() * 2)) * cell;
          tiled(g, (ox, oy) => g.fillRect(x + ox, y + oy, w, h));
        }
      }
      break;
    }
    case 'splinter': {
      for (let i = 0; i < 26; i++) {
        const cx = r() * S, cy = r() * S;
        const pts: [number, number][] = [];
        const k = 3 + Math.floor(r() * 3);
        for (let j = 0; j < k; j++) {
          const a = (j / k) * Math.PI * 2 + r() * 0.8;
          const d = 30 + r() * 110;
          pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.45]);
        }
        tiled(g, (ox, oy) => {
          g.beginPath();
          pts.forEach(([x, y], j) => (j ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy)));
          g.closePath();
          g.fill();
        });
      }
      break;
    }
    case 'tiger': {
      for (let i = 0; i < 14; i++) {
        const y0 = (i / 14) * S + r() * 12;
        const amp = 10 + r() * 22;
        const th = 7 + r() * 16;
        const ph = r() * 6;
        tiled(g, (ox, oy) => {
          g.beginPath();
          for (let x = -20; x <= S + 20; x += 8) {
            const y = y0 + Math.sin((x / S) * Math.PI * 4 + ph) * amp;
            if (x === -20) g.moveTo(x + ox, y + oy);
            else g.lineTo(x + ox, y + oy);
          }
          for (let x = S + 20; x >= -20; x -= 8) {
            const taper = 0.3 + 0.7 * Math.abs(Math.sin((x / S) * Math.PI * 2 + ph));
            const y = y0 + Math.sin((x / S) * Math.PI * 4 + ph) * amp + th * taper;
            g.lineTo(x + ox, y + oy);
          }
          g.closePath();
          g.fill();
        });
      }
      break;
    }
    case 'hex': {
      const rr = S / 16;
      const w = Math.sqrt(3) * rr;
      g.lineWidth = 4;
      for (let row = -1; row < S / (rr * 1.5) + 1; row++) {
        for (let col = -1; col < S / w + 1; col++) {
          const cx = col * w + (row % 2 ? w / 2 : 0);
          const cy = row * rr * 1.5;
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
            const x = cx + Math.cos(a) * rr * 0.92, y = cy + Math.sin(a) * rr * 0.92;
            if (k === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.closePath();
          g.stroke();
        }
      }
      break;
    }
    case 'woodland':
    case 'arctic': {
      const n = id === 'woodland' ? 40 : 28;
      for (let i = 0; i < n; i++) {
        const cx = r() * S, cy = r() * S;
        const blobs = 3 + Math.floor(r() * 4);
        for (let b = 0; b < blobs; b++) {
          const x = cx + (r() - 0.5) * 70, y = cy + (r() - 0.5) * 40;
          const rx = 18 + r() * 38, ry = 10 + r() * 22;
          const rot = r() * Math.PI;
          tiled(g, (ox, oy) => {
            g.beginPath();
            g.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2);
            g.fill();
          });
        }
      }
      break;
    }
    case 'carbon': {
      // 2x2 twill weave with a sheen gradient per tow
      const cell = S / 16;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const horiz = (x + y) % 4 < 2;
          const grd = horiz ? g.createLinearGradient(0, y * cell, 0, (y + 1) * cell) : g.createLinearGradient(x * cell, 0, (x + 1) * cell, 0);
          grd.addColorStop(0, '#222');
          grd.addColorStop(0.5, horiz ? '#fff' : '#9a9a9a');
          grd.addColorStop(1, '#222');
          g.fillStyle = grd;
          g.fillRect(x * cell, y * cell, cell, cell);
        }
      }
      break;
    }
    case 'chevron': {
      const band = S / 8;
      for (let i = -2; i < 10; i += 2) {
        g.beginPath();
        g.moveTo(0, i * band);
        g.lineTo(S / 2, i * band + band * 1.6);
        g.lineTo(S, i * band);
        g.lineTo(S, i * band + band);
        g.lineTo(S / 2, i * band + band * 2.6);
        g.lineTo(0, i * band + band);
        g.closePath();
        g.fill();
      }
      break;
    }
  }
}

/** One greyscale layer of a full-jet wrap texture, optionally blurred (seamlessly). */
function layer(draw: (c: CanvasRenderingContext2D) => void, blur = 0): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000';
  x.fillRect(0, 0, S, S);
  draw(x);
  if (!blur) return x.getImageData(0, 0, S, S).data;
  // blur once at the end (a canvas filter set while drawing blurs every stroke);
  // the sharp layer is drawn 3x3 so the blur wraps and the tile stays seamless
  const d = document.createElement('canvas');
  d.width = d.height = S;
  const y = d.getContext('2d')!;
  y.filter = `blur(${blur}px)`;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) y.drawImage(c, i * S, j * S);
  return y.getImageData(0, 0, S, S).data;
}

/** Pack three greyscale layers into the R, G and B channels of the texture. */
function pack(g: CanvasRenderingContext2D, r: Uint8ClampedArray, gg: Uint8ClampedArray, b: Uint8ClampedArray): void {
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S * 4; i += 4) {
    img.data[i] = r[i];
    img.data[i + 1] = gg[i];
    img.data[i + 2] = b[i];
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/** Branching jagged lines (cracks, lava veins). */
function veins(x: CanvasRenderingContext2D, seed: number, count: number, width: number, alpha: number, seg: number): void {
  const rr = rng(seed);
  x.strokeStyle = `rgba(255,255,255,${alpha})`;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  for (let i = 0; i < count; i++) {
    let px = rr() * S, py = rr() * S;
    let ang = rr() * Math.PI * 2;
    const pts: [number, number][] = [[px, py]];
    const n = 4 + Math.floor(rr() * 7);
    for (let k = 0; k < n; k++) {
      ang += (rr() - 0.5) * 1.1;
      const len = seg * (0.5 + rr());
      px += Math.cos(ang) * len;
      py += Math.sin(ang) * len;
      pts.push([px, py]);
    }
    x.lineWidth = width * (0.5 + rr());
    tiled(x, (ox, oy) => {
      x.beginPath();
      pts.forEach(([a, b], j) => (j ? x.lineTo(a + ox, b + oy) : x.moveTo(a + ox, b + oy)));
      x.stroke();
    });
  }
}

/** Soft radial blobs, optionally stretched (smoke, flames, nebulae). */
function blobs(x: CanvasRenderingContext2D, seed: number, count: number, rMin: number, rMax: number, aMin: number, aMax: number, sx: number, sy: number): void {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const cx = r() * S, cy = r() * S, rad = rMin + r() * (rMax - rMin);
    const a = aMin + r() * (aMax - aMin);
    tiled(x, (ox, oy) => {
      const grd = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad);
      grd.addColorStop(0, `rgba(255,255,255,${a})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = grd;
      x.save();
      x.translate(cx + ox, cy + oy);
      x.scale(sx, sy);
      x.translate(-(cx + ox), -(cy + oy));
      x.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2);
      x.restore();
    });
  }
}

/** Star field: many tiny points, a few bright ones with a halo. */
function stars(x: CanvasRenderingContext2D, seed: number, count: number, big: number): void {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const cx = r() * S, cy = r() * S;
    const v = Math.floor(90 + r() * 165);
    x.fillStyle = `rgb(${v},${v},${v})`;
    const s = r() < 0.8 ? 1 : 2;
    x.fillRect(Math.floor(cx), Math.floor(cy), s, s);
  }
  for (let i = 0; i < big; i++) {
    const cx = r() * S, cy = r() * S, rad = 3 + r() * 5;
    tiled(x, (ox, oy) => {
      const grd = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = grd;
      x.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2);
    });
  }
}

/** Inferno: R = molten veins (bright cores + wide glow), G = flame licks, B = charred plates. */
function drawInferno(g: CanvasRenderingContext2D): void {
  const core = layer((x) => veins(x, 913, 44, 2.6, 1, 34));
  const glow = layer((x) => veins(x, 913, 44, 11, 0.45, 34), 5);
  const flames = layer((x) => blobs(x, 5150, 110, 14, 70, 0.08, 0.2, 2.6, 0.45), 5);
  const r = rng(77);
  const char = layer((x) => {
    for (let i = 0; i < 90; i++) {
      const cx = r() * S, cy = r() * S;
      const pts: [number, number][] = [];
      const k = 4 + Math.floor(r() * 3);
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI * 2 + r() * 0.8;
        const d = 18 + r() * 48;
        pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
      }
      const v = Math.floor(70 + r() * 185);
      x.fillStyle = `rgb(${v},${v},${v})`;
      tiled(x, (ox, oy) => {
        x.beginPath();
        pts.forEach(([a, b], j) => (j ? x.lineTo(a + ox, b + oy) : x.moveTo(a + ox, b + oy)));
        x.closePath();
        x.fill();
      });
    }
  }, 1.5);
  const veinsL = new Uint8ClampedArray(core.length);
  for (let i = 0; i < core.length; i++) veinsL[i] = Math.min(255, core[i] + glow[i] * 0.7);
  pack(g, veinsL, flames, char);
}

/** Aurora: R = light curtains (rippling vertical streaks), G = soft glow, B = stars. */
function drawAurora(g: CanvasRenderingContext2D): void {
  const r = rng(2718);
  const curtains = layer((x) => {
    for (let i = 0; i < 80; i++) {
      const x0 = r() * S;
      const amp = 8 + r() * 26, ph = r() * 6.28, fr = 1 + Math.floor(r() * 3);
      const w = 2 + r() * 9;
      const a = 0.15 + r() * 0.5;
      const top = r() * S, len = S * (0.35 + r() * 0.6);
      x.strokeStyle = `rgba(255,255,255,${a})`;
      x.lineWidth = w;
      tiled(x, (ox, oy) => {
        x.beginPath();
        for (let k = 0; k <= 40; k++) {
          const t = k / 40;
          const yy = top + t * len;
          const xx = x0 + Math.sin(ph + (yy / S) * Math.PI * 2 * fr) * amp;
          if (k === 0) x.moveTo(xx + ox, yy + oy);
          else x.lineTo(xx + ox, yy + oy);
        }
        x.stroke();
      });
    }
  }, 3.5);
  const glowL = layer((x) => blobs(x, 606, 70, 40, 140, 0.06, 0.16, 0.7, 1.9), 8);
  const starsL = layer((x) => stars(x, 31, 260, 10));
  pack(g, curtains, glowL, starsL);
}

/** Galaxy: R = nebula clouds, G = dark dust lanes, B = stars. */
function drawGalaxy(g: CanvasRenderingContext2D): void {
  const neb = layer((x) => {
    blobs(x, 1401, 60, 50, 170, 0.08, 0.2, 1.4, 0.8);
    blobs(x, 1402, 120, 12, 50, 0.08, 0.22, 1.2, 1.0);
  }, 6);
  const r = rng(99);
  const dust = layer((x) => {
    x.lineCap = 'round';
    for (let i = 0; i < 24; i++) {
      const cx = r() * S, cy = r() * S, rad = 60 + r() * 160, a0 = r() * 6.28, sweep = 0.6 + r() * 1.6;
      x.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.4})`;
      x.lineWidth = 6 + r() * 20;
      tiled(x, (ox, oy) => {
        x.beginPath();
        x.arc(cx + ox, cy + oy, rad, a0, a0 + sweep);
        x.stroke();
      });
    }
  }, 7);
  const starsL = layer((x) => stars(x, 57, 420, 16));
  pack(g, neb, dust, starsL);
}

/** Black Ice layers packed in one tileable texture: R = cracks, G = smoke wisps, B = crystal facets. */
function drawBlackIce(g: CanvasRenderingContext2D): void {
  const r = rng(4242);
  // cracks: jagged branching lines, thin and bright, with a soft halo
  const crackDraw = (x: CanvasRenderingContext2D, width: number, alpha: number) => {
    const rr = rng(777);
    x.strokeStyle = `rgba(255,255,255,${alpha})`;
    x.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      let px = rr() * S, py = rr() * S;
      let ang = rr() * Math.PI * 2;
      const pts: [number, number][] = [[px, py]];
      const n = 4 + Math.floor(rr() * 7);
      for (let k = 0; k < n; k++) {
        ang += (rr() - 0.5) * 1.1;
        const len = 14 + rr() * 46;
        px += Math.cos(ang) * len;
        py += Math.sin(ang) * len;
        pts.push([px, py]);
      }
      x.lineWidth = width * (0.5 + rr());
      tiled(x, (ox, oy) => {
        x.beginPath();
        pts.forEach(([a, b], j) => (j ? x.lineTo(a + ox, b + oy) : x.moveTo(a + ox, b + oy)));
        x.stroke();
      });
    }
  };
  const cracks = layer((x) => crackDraw(x, 1.6, 0.95));
  const halo = layer((x) => crackDraw(x, 7, 0.35), 3);
  // smoke: layered soft blobs, stretched into wisps
  const smoke = layer((x) => {
    for (let i = 0; i < 90; i++) {
      const cx = r() * S, cy = r() * S, rad = 20 + r() * 80;
      const a = 0.05 + r() * 0.12;
      tiled(x, (ox, oy) => {
        const grd = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad);
        grd.addColorStop(0, `rgba(255,255,255,${a})`);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = grd;
        x.save();
        x.translate(cx + ox, cy + oy);
        x.scale(1.8, 0.7);
        x.translate(-(cx + ox), -(cy + oy));
        x.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2);
        x.restore();
      });
    }
  }, 6);
  // facets: shards of random brightness
  const facets = layer((x) => {
    for (let i = 0; i < 70; i++) {
      const cx = r() * S, cy = r() * S;
      const pts: [number, number][] = [];
      const k = 3 + Math.floor(r() * 3);
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI * 2 + r() * 0.9;
        const d = 20 + r() * 60;
        pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
      }
      const v = Math.floor(60 + r() * 195);
      x.fillStyle = `rgb(${v},${v},${v})`;
      tiled(x, (ox, oy) => {
        x.beginPath();
        pts.forEach(([a, b], j) => (j ? x.lineTo(a + ox, b + oy) : x.moveTo(a + ox, b + oy)));
        x.closePath();
        x.fill();
      });
    }
  }, 1);
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S * 4; i += 4) {
    img.data[i] = Math.min(255, cracks[i] + halo[i] * 0.6);
    img.data[i + 1] = smoke[i];
    img.data[i + 2] = facets[i];
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

export function wrapMask(id: WrapId): THREE.CanvasTexture {
  let t = masks.get(id);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    drawMask(id, c.getContext('2d')!);
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = THREE.NoColorSpace;
    masks.set(id, t);
  }
  return t;
}

function hexRgb(h: string): [number, number, number] {
  const v = parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Small preview swatch of a wrap (data URL) for the customization screen. */
export function wrapPreview(id: WrapId, a: string, b: string, size = 64): string {
  const m = document.createElement('canvas');
  m.width = m.height = S;
  drawMask(id, m.getContext('2d')!);
  const md = m.getContext('2d')!.getImageData(0, 0, S, S).data;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const ca = hexRgb(a), cb = hexRgb(b);
  const style = WRAPS.find((w) => w.id === id)?.full ?? 0;
  if (style >= 4) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const sx = Math.floor((x / size) * S * 0.5), sy = Math.floor((y / size) * S * 0.5);
        const o = (sy * S + sx) * 4;
        const t0 = md[o] / 255, t1 = md[o + 1] / 255, t2 = md[o + 2] / 255;
        const u = x / size;
        const col = fullPreview(style, u, t0, t1, t2, ca, cb);
        const i = (y * size + x) * 4;
        for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, Math.round(col[k])));
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }
  if (id === 'blackice') {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const sx = Math.floor((x / size) * S * 0.5), sy = Math.floor((y / size) * S * 0.5);
        const o = (sy * S + sx) * 4;
        const crack = md[o] / 255, smoke = md[o + 1] / 255, facet = md[o + 2] / 255;
        const u = x / size + (smoke - 0.3) * 0.35;
        const t = Math.min(1, Math.max(0, (u - 0.2) / 0.65));
        const w = Math.min(1, Math.max(0, (u - 0.95) / 0.25)) * 0.5;
        const i = (y * size + x) * 4;
        for (let k = 0; k < 3; k++) {
          let c = ca[k] * (1 - t) + cb[k] * t;
          c = c * (1 - w) + 235 * w;
          c *= 1 - t + t * (0.55 + 0.6 * facet);
          c += crack * (k === 0 ? 120 : 200) * (0.25 + 0.45 * t) + smoke * 50 * t;
          img.data[i + k] = Math.max(0, Math.min(255, Math.round(c)));
        }
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x / size) * S * 0.5), sy = Math.floor((y / size) * S * 0.5);
      const v = md[(sy * S + sx) * 4] / 255;
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(ca[k] * (1 - v) + cb[k] * v);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

/**
 * A random paint job for an AI jet (waves and 5v5): now and then the
 * factory scheme, otherwise a solid colour or a wrap, with a random finish.
 */
export function randomPaint(): PaintConfig {
  const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
  const r = Math.random();
  const finish = pick<Finish>(['matte', 'satin', 'satin', 'gloss', 'metallic']);
  const brightness = 0.85 + Math.random() * 0.3;
  if (r < 0.2) return { ...defaultPaint(), finish, brightness };
  if (r < 0.5) {
    const c = pick(SOLID_COLORS)[1];
    return { mode: 'solid', color: c, color2: c, wrap: 'digital', finish, brightness };
  }
  const w = pick(WRAPS);
  // half the wraps keep their own colours, the rest get a random pair
  const own = w.full || Math.random() < 0.5;
  const a = own ? w.a : pick(SOLID_COLORS)[1];
  let b = own ? w.b : pick(SOLID_COLORS)[1];
  if (b === a) b = w.b;
  return { mode: 'wrap', color: a, color2: b, wrap: w.id, finish, brightness };
}

/** CPU copy of the skin shader's full-wrap styles, for the menu previews (0..255 RGB). */
function fullPreview(style: number, u: number, t0: number, t1: number, t2: number, a: number[], b: number[]): number[] {
  const mix = (p: number[], q: number[], t: number) => p.map((v, k) => v + (q[k] - v) * t);
  const ss = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  if (style === 4) {
    const heat = ss(0.2, 1.0, u + (t1 - 0.3) * 0.5);
    const ember = mix(b, [255, 220, 90], t0 * 0.8);
    const base = a.map((v) => v * (0.7 + 0.6 * t2));
    return base.map((v, k) => v + ember[k] * t0 * (0.35 + 0.8 * heat) + b[k] * t1 * heat * 0.45);
  }
  if (style === 5) {
    const band = Math.pow(t0, 1.6) * (0.55 + 0.45 * Math.sin(u * 14 + t1 * 6));
    const col = mix(b, [170, 80, 255], ss(0.2, 0.9, t1 + 0.4 * Math.sin(u * 6)));
    const star = Math.pow(t2, 7) * 220;
    return a.map((v, k) => v * (0.8 + 0.3 * t1) + col[k] * band * 0.6 + star);
  }
  const nebCol = mix(mix([50, 115, 255], b, ss(0.2, 0.8, t0)), [255, 90, 150], ss(0.65, 1, t0) * 0.6);
  const star = Math.pow(t2, 6) * 220;
  return a.map((v, k) => v * 0.7 + nebCol[k] * ss(0.35, 1, t0) * (1 - 0.9 * t1) * 0.5 + star);
}
