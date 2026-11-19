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
const PANEL_TITLES_RU = [
  'ТОПЛИВО', 'ДВИГАТЕЛЬ', 'СВЯЗЬ', 'ОПОЗН.', 'ПОС', 'АНО', 'ОСВЕЩ.', 'КИСЛОРОД', 'СКВ', 'РЛС', 'НАВИГ.', 'СПУ', 'ФОНАРЬ', 'АВАР.', 'АКК. / ГЕН.', 'СДУ', 'ТРИМ.', 'СБРОС', 'ГЛАВН. ВЫКЛ.', 'РЭБ',
];
const SWITCH_LABELS_RU = ['ВКЛ', 'ОТКЛ', 'АВТ', 'НОРМ', 'БОЕВ', 'ПРЕДОХР', 'РЕЗЕРВ', 'КОНТР', 'РУЧН', 'ЛЕВ', 'ПРАВ', 'ОБА'];
const SWITCH_LABELS = ['ON', 'OFF', 'AUTO', 'NORM', 'ARM', 'SAFE', 'STBY', 'OVRD', 'TEST', 'MAN', 'L', 'R', 'BOTH', 'PRI', 'SEC', 'RST', 'DIM', 'BRT'];

/** Console top: a column of switch panels. */
/** (`ru`: the placards in Russian, as in the Sukhoi and MiG cockpits) */
export function consoleTexture(base: number, seed: number, ru = false): THREE.CanvasTexture {
  const titles = ru ? PANEL_TITLES_RU : PANEL_TITLES;
  const legends = ru ? SWITCH_LABELS_RU : SWITCH_LABELS;
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
    g.fillText(titles[Math.floor(rnd() * titles.length)], W / 2, y + 28);
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
        g.fillText(legends[Math.floor(rnd() * legends.length)], cx, cy - 34);
        g.fillText(legends[Math.floor(rnd() * legends.length)], cx, cy + 30);
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
        g.fillText(rnd() < 0.5 ? (ru ? 'АВАР' : 'EMER') : ru ? 'СБРОС' : 'JETT', cx, cy + 36);
      }
    }
    y += h;
  }
  return tex(c);
}

/** A control set into the instrument panel (drawn here, built in 3D by the cockpit). */
export interface PanelControl {
  px: number;
  py: number;
  kind: 'knob' | 'toggle' | 'button' | 'guard';
  label: string;
}

export interface PanelFace {
  /** the panel's half width and height (m) */
  hw: number;
  h: number;
  /** where the displays sit: centre and size (m), so the plates go round them */
  keep: { px: number; py: number; w: number; h: number }[];
  controls: PanelControl[];
  ru: boolean;
}

/**
 * Instrument panel face, as the photos show it: matte paint worn lighter where hands go and grimier
 * low down; every display set in its own mounting plate with fasteners; between them small sub-panels
 * carrying the switches, knobs and buttons (built in 3D on top) with their legends and scales; seams;
 * the jet's placard at the bottom. Mapped by the panel face's own outline (x across, y down).
 */
export function panelTexture(base: number, label: string, face?: PanelFace): THREE.CanvasTexture {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = hex(base);
  g.fillRect(0, 0, W, H);
  const rnd = mulberry32(label.length * 977 + 13);
  // matte paint: a fine mottle, a darker grime toward the bottom, lighter worn patches up top
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${rnd() * 0.025})` : `rgba(0,0,0,${rnd() * 0.035})`;
    g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 7, 2 + rnd() * 7);
  }
  const grime = g.createLinearGradient(0, 0, 0, H);
  grime.addColorStop(0, 'rgba(255,255,255,0.05)');
  grime.addColorStop(0.5, 'rgba(0,0,0,0)');
  grime.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grime;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = rnd() * H * 0.5, r = 20 + rnd() * 70;
    const wear = g.createRadialGradient(x, y, 1, x, y, r);
    wear.addColorStop(0, 'rgba(255,255,255,0.06)');
    wear.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = wear;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const ink = '#e6e4da';
  if (face) {
    const X = (px: number) => ((px + face.hw) / (2 * face.hw)) * W;
    const Y = (py: number) => (py / face.h) * H;
    const sx = W / (2 * face.hw), sy = H / face.h;
    // each display's mounting plate: a slightly darker plate, a seam round it, fasteners at the corners
    for (const k of face.keep) {
      const x0 = X(k.px - k.w / 2 - 0.012), y0 = Y(k.py - k.h / 2 - 0.012);
      const w = (k.w + 0.024) * sx, h = (k.h + 0.024) * sy;
      g.fillStyle = shade(base, 0.82);
      g.fillRect(x0, y0, w, h);
      g.strokeStyle = shade(base, 0.45);
      g.lineWidth = 4;
      g.strokeRect(x0, y0, w, h);
      for (const [fx, fy] of [[x0 + 12, y0 + 12], [x0 + w - 12, y0 + 12], [x0 + 12, y0 + h - 12], [x0 + w - 12, y0 + h - 12]]) screw(g, fx, fy, 6);
    }
    // the controls' sub-panels: a plate each, a legend above, a scale or the positions round it
    for (const ctl of face.controls) {
      const cx = X(ctl.px), cy = Y(ctl.py);
      const pw = 0.04 * sx, ph = 0.044 * sy;
      g.fillStyle = shade(base, 0.92 + rnd() * 0.08);
      g.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
      g.strokeStyle = shade(base, 0.5);
      g.lineWidth = 3;
      g.strokeRect(cx - pw / 2, cy - ph / 2, pw, ph);
      screw(g, cx - pw / 2 + 8, cy - ph / 2 + 8, 4);
      screw(g, cx + pw / 2 - 8, cy + ph / 2 - 8, 4);
      g.fillStyle = ink;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${Math.round(0.0062 * sy)}px Arial, sans-serif`;
      g.fillText(ctl.label, cx, cy - ph / 2 + 0.008 * sy);
      g.font = `${Math.round(0.0052 * sy)}px Arial, sans-serif`;
      if (ctl.kind === 'knob') {
        g.strokeStyle = ink;
        g.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          const ang = -2.3 + (4.6 * i) / 8;
          const r0 = 0.0125 * sx, r1 = 0.0155 * sx;
          g.beginPath();
          g.moveTo(cx + Math.sin(ang) * r0, cy + 0.003 * sy - Math.cos(ang) * r0);
          g.lineTo(cx + Math.sin(ang) * r1, cy + 0.003 * sy - Math.cos(ang) * r1);
          g.stroke();
        }
      } else if (ctl.kind === 'toggle') {
        g.fillText(face.ru ? 'ВКЛ' : 'ON', cx, cy - 0.009 * sy);
        g.fillText(face.ru ? 'ОТКЛ' : 'OFF', cx, cy + 0.016 * sy);
      } else if (ctl.kind === 'guard') {
        g.fillStyle = '#c8a53a';
        g.fillRect(cx - 0.012 * sx, cy - 0.006 * sy, 0.024 * sx, 0.02 * sy);
        g.strokeStyle = '#1a1a1a';
        g.lineWidth = 5;
        for (let k = -2; k < 3; k++) {
          g.beginPath();
          g.moveTo(cx - 0.012 * sx + k * 14, cy + 0.014 * sy);
          g.lineTo(cx - 0.012 * sx + k * 14 + 20, cy - 0.006 * sy);
          g.stroke();
        }
      }
    }
  }
  // seams between the panel's sections and the placard
  g.strokeStyle = shade(base, 0.55);
  g.lineWidth = 3;
  for (const x of [W * 0.2, W * 0.8]) {
    g.beginPath();
    g.moveTo(x, H * 0.03);
    g.lineTo(x, H * 0.97);
    g.stroke();
  }
  for (let x = 30; x < W; x += 90) {
    screw(g, x, 16, 5);
    screw(g, x, H - 16, 5);
  }
  g.fillStyle = ink;
  g.font = 'bold 30px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText(label, W / 2, H - 44);
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
/** Diagonal hazard stripes: yellow and black, or (a Russian seat's handles) red and white. */
export function stripeTexture(a = '#e8c21a', b = '#141414'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = a;
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = b;
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
