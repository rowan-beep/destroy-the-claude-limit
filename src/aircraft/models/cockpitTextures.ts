// Procedural canvas textures that give the cockpit its detail without
// thousands of meshes: console switch panels with legends and guards, the
// instrument panel face with fasteners and placards, the UFC keypad, the
// yellow-and-black ejection handle and annunciator lenses.

import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';

function tex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

function shade(n: number, k: number): string {
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

function screw(g: CanvasRenderingContext2D, x: number, y: number, r = 5): void {
  const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  grd.addColorStop(0, '#9aa0a6');
  grd.addColorStop(1, '#3a3e42');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#202224';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x - r * 0.7, y);
  g.lineTo(x + r * 0.7, y);
  g.stroke();
}

const PANEL_TITLES = [
  'FUEL CONTROL', 'ENGINE CONTROL', 'COMM', 'IFF', 'ANTI-ICE', 'EXT LIGHTS', 'INT LIGHTS', 'OXYGEN', 'ECS', 'SENSOR',
  'NAV', 'ICS', 'KY-58', 'CANOPY', 'EMER', 'BATT / GEN', 'FCS', 'TRIM', 'JETT', 'MASTER ARM', 'RADAR', 'EW', 'CMDS', 'VIDEO',
];
const SWITCH_LABELS = ['ON', 'OFF', 'AUTO', 'NORM', 'ARM', 'SAFE', 'STBY', 'OVRD', 'TEST', 'MAN', 'L', 'R', 'BOTH', 'PRI', 'SEC', 'RST', 'DIM', 'BRT'];

/** Console top: a column of switch panels. */
export function consoleTexture(base: number, seed: number): THREE.CanvasTexture {
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(seed);
  g.fillStyle = shade(base, 0.9);
  g.fillRect(0, 0, W, H);
  let y = 8;
  while (y < H - 60) {
    const ph = 90 + Math.floor(rnd() * 140);
    const h = Math.min(ph, H - 8 - y);
    // panel plate
    g.fillStyle = shade(base, 1.0 + rnd() * 0.08);
    g.fillRect(10, y, W - 20, h - 8);
    g.strokeStyle = shade(base, 0.55);
    g.lineWidth = 3;
    g.strokeRect(10, y, W - 20, h - 8);
    screw(g, 22, y + 12);
    screw(g, W - 22, y + 12);
    screw(g, 22, y + h - 20);
    screw(g, W - 22, y + h - 20);
    // title
    g.fillStyle = '#e8e8e0';
    g.font = 'bold 22px Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(PANEL_TITLES[Math.floor(rnd() * PANEL_TITLES.length)], W / 2, y + 28);
    // controls
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const cx = 50 + ((W - 100) * (i + 0.5)) / n;
      const cy = y + 40 + (h - 60) * 0.55;
      const kind = rnd();
      if (kind < 0.45) {
        // toggle switch: base nut + bat handle
        g.fillStyle = '#1a1c1e';
        g.beginPath();
        g.arc(cx, cy, 12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#b8bcc0';
        g.fillRect(cx - 4, cy - 26, 8, 26);
        g.fillStyle = '#e8e8e0';
        g.font = '16px Arial, sans-serif';
        g.fillText(SWITCH_LABELS[Math.floor(rnd() * SWITCH_LABELS.length)], cx, cy - 34);
        g.fillText(SWITCH_LABELS[Math.floor(rnd() * SWITCH_LABELS.length)], cx, cy + 30);
      } else if (kind < 0.8) {
        // rotary knob with a pointer and scale
        g.strokeStyle = '#e8e8e0';
        g.lineWidth = 2;
        for (let k = 0; k < 7; k++) {
          const a = -2.2 + (4.4 * k) / 6;
          g.beginPath();
          g.moveTo(cx + Math.sin(a) * 24, cy - Math.cos(a) * 24);
          g.lineTo(cx + Math.sin(a) * 30, cy - Math.cos(a) * 30);
          g.stroke();
        }
        g.fillStyle = '#121416';
        g.beginPath();
        g.arc(cx, cy, 19, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#e8e8e0';
        g.lineWidth = 3;
        const a = -2 + rnd() * 4;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.sin(a) * 16, cy - Math.cos(a) * 16);
        g.stroke();
      } else {
        // guarded switch (red guard)
        g.fillStyle = '#8c1a14';
        g.fillRect(cx - 14, cy - 22, 28, 40);
        g.strokeStyle = '#3a0a08';
        g.strokeRect(cx - 14, cy - 22, 28, 40);
        g.fillStyle = '#e8e8e0';
        g.font = '15px Arial, sans-serif';
        g.fillText(rnd() < 0.5 ? 'EMER' : 'JETT', cx, cy + 36);
      }
    }
    y += h;
  }
  return tex(c);
}

/** Instrument panel face: matte paint, seams, fasteners, placards. */
export function panelTexture(base: number, label: string): THREE.CanvasTexture {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = hex(base);
  g.fillRect(0, 0, W, H);
  // subtle mottling
  const rnd = mulberry32(label.length * 977);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(255,255,255,${rnd() * 0.02})`;
    g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 2 + rnd() * 6);
  }
  // seams
  g.strokeStyle = shade(base, 0.6);
  g.lineWidth = 3;
  for (const x of [W * 0.22, W * 0.78]) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, H * 0.62);
  g.lineTo(W, H * 0.62);
  g.stroke();
  // fasteners along the seams and edges
  for (let x = 20; x < W; x += 60) {
    screw(g, x, 14, 4);
    screw(g, x, H - 14, 4);
  }
  for (let y = 40; y < H; y += 60) {
    screw(g, W * 0.22 - 10, y, 4);
    screw(g, W * 0.78 + 10, y, 4);
  }
  // placards
  g.fillStyle = '#e8e8e0';
  g.font = 'bold 20px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText(label, W / 2, H - 30);
  g.font = '16px Arial, sans-serif';
  g.fillText('EMER JETT', W * 0.9, H * 0.72);
  g.fillText('MASTER ARM', W * 0.1, H * 0.72);
  g.fillText('ARM   SAFE', W * 0.1, H * 0.8);
  g.fillStyle = '#c8a53a';
  g.fillRect(W * 0.9 - 30, H * 0.75, 60, 40);
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = 6;
  for (let k = -2; k < 4; k++) {
    g.beginPath();
    g.moveTo(W * 0.9 - 30 + k * 16, H * 0.75 + 40);
    g.lineTo(W * 0.9 - 30 + k * 16 + 40, H * 0.75);
    g.stroke();
  }
  return tex(c);
}

/** Up-front controller keypad around its display. */
export function keypadTexture(base: number): THREE.CanvasTexture {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = shade(base, 0.8);
  g.fillRect(0, 0, W, H);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'ENT'];
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  keys.forEach((k, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = W * 0.62 + col * 60, y = 36 + row * 58;
    g.fillStyle = '#2f3336';
    g.fillRect(x - 24, y - 22, 48, 44);
    g.strokeStyle = '#111';
    g.lineWidth = 2;
    g.strokeRect(x - 24, y - 22, 48, 44);
    g.fillStyle = '#e8e8e0';
    g.font = `${k.length > 1 ? 15 : 24}px Arial, sans-serif`;
    g.fillText(k, x, y);
  });
  const fk = ['A/P', 'IFF', 'TCN', 'ILS', 'D/L', 'BCN', 'ON/OFF'];
  fk.forEach((k, i) => {
    const x = 34 + (i % 4) * 66, y = H - 58 + Math.floor(i / 4) * 30;
    g.fillStyle = '#2f3336';
    g.fillRect(x - 28, y - 12, 56, 24);
    g.fillStyle = '#e8e8e0';
    g.font = '14px Arial, sans-serif';
    g.fillText(k, x, y);
  });
  return tex(c);
}

/** Yellow/black striped texture for the ejection handle. */
export function stripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8c21a';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#141414';
  for (let x = -32; x < 160; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 32);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 0);
    g.closePath();
    g.fill();
  }
  return tex(c, true);
}

/** An annunciator lens legend (e.g. LOCK, SHOOT, MASTER CAUTION). */
export function legendTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(0,0,0,0.85)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = text.split('\n');
  g.font = `bold ${lines.length > 1 ? 40 : 56}px Arial, sans-serif`;
  lines.forEach((l, i) => g.fillText(l, 128, 64 + (i - (lines.length - 1) / 2) * 46));
  return tex(c);
}

/** Seat cushion quilting. */
export function cushionTexture(base: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = hex(base);
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = shade(base, 0.6);
  g.lineWidth = 3;
  for (let x = 16; x < 128; x += 32) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  return tex(c, true);
}

/**
 * Canopy acrylic wear: the fine circular swirls a cleaning cloth leaves, a few
 * longer hairline scratches and dust specks. Invisible until the sun is in
 * front of you, when they light up across the glass (red channel = intensity).
 */
export function canopyScratchTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = mulberry32(911);
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  // wipe swirls: clusters of concentric arcs
  for (let k = 0; k < 26; k++) {
    const cx = r() * S, cy = r() * S;
    const n = 6 + Math.floor(r() * 10);
    for (let i = 0; i < n; i++) {
      const rad = 12 + r() * 70;
      const a0 = r() * Math.PI * 2;
      g.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.22})`;
      g.lineWidth = 0.6 + r() * 0.6;
      g.beginPath();
      g.arc(cx + (r() - 0.5) * 20, cy + (r() - 0.5) * 20, rad, a0, a0 + 0.4 + r() * 1.6);
      g.stroke();
    }
  }
  // long hairline scratches
  for (let k = 0; k < 14; k++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 60 + r() * 220;
    g.strokeStyle = `rgba(255,255,255,${0.2 + r() * 0.3})`;
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 20, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 20, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // dust and tiny pits
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`;
    const s = 0.6 + r() * 1.4;
    g.fillRect(r() * S, r() * S, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
