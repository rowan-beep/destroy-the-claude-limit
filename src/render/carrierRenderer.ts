// Carriers as you see them: the hull with its boot-top and red bottom, the
// flight deck with its real markings (angled landing area, foul lines,
// catapult tracks, elevators, the ramp), the island with its bridge, Pri-Fly
// and turning radars, arresting wires, jet blast deflectors that rise behind
// a jet on the catapult, deck and approach lights, the Fresnel lens (the
// "meatball") that shows a landing pilot where the glide path is, jets
// parked on deck and the white wake curling behind the ship.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CARRIERS, Carrier, CarrierLayout } from '../world/carriers';
import { DECK_HEIGHT, LANDING_AREA } from '../world/islands';
import { getSoftDotTexture, makeTextTexture } from './textures';
import { waveHeight, seaMoves } from '../world/waves';
import type { Environment } from './environment';
import { Aircraft } from '../aircraft/aircraft';
import { createAirframe, AirframeVisual } from '../aircraft/models';

type G = THREE.BufferGeometry;
const DEG = Math.PI / 180;
/** the waterline, in the ship model's frame (flight deck at y = 0) */
const WL = -DECK_HEIGHT;

const HAZE = '#7f878d';
const HAZE_D = '#697177';
const HAZE_L = '#959ca1';
const WINDOW = '#1b2329';
const BOOT = '#1d1f21';
const BOTTOM = '#6a2a24';

// --- geometry helpers (ship frame: u toward the bow, v to starboard, y up from the deck) ------

function paint(g: G, hex: string): G {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}

/** A box spanning u0..u1, v0..v1, y0..y1. */
function bx(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, hex: string): G {
  const g = new THREE.BoxGeometry(v1 - v0, y1 - y0, u1 - u0);
  g.translate((v0 + v1) / 2, (y0 + y1) / 2, -(u0 + u1) / 2);
  return paint(g, hex);
}

/** A vertical cylinder at (u, v) from y0 to y1. */
function cyl(u: number, v: number, r0: number, r1: number, y0: number, y1: number, hex: string, seg = 10): G {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg);
  g.translate(v, (y0 + y1) / 2, -u);
  return paint(g, hex);
}

function sphere(u: number, v: number, y: number, r: number, hex: string): G {
  const g = new THREE.SphereGeometry(r, 12, 8);
  g.translate(v, y, -u);
  return paint(g, hex);
}

/** A box turned `rotDeg` about the vertical (+ = toward starboard), centred at (u, v). */
function bxRot(u: number, v: number, len: number, wid: number, y0: number, y1: number, rotDeg: number, hex: string): G {
  const g = new THREE.BoxGeometry(wid, y1 - y0, len);
  g.rotateY(-rotDeg * DEG);
  g.translate(v, (y0 + y1) / 2, -u);
  return paint(g, hex);
}

// --- the hull ------------------------------------------------------------------------------------

/** Sections from the stern to the bow: u, half-beam at the gallery deck, at the waterline, keel rise. */
const SECTIONS: [number, number, number, number][] = [
  [-150, 17.5, 15, 8],
  [-138, 19.5, 18, 5],
  [-115, 21, 20, 1.5],
  [-85, 21.5, 20.4, 0],
  [40, 21.5, 20.4, 0],
  [80, 20.5, 18.6, 0],
  [108, 18.2, 15, 0.5],
  [130, 14.8, 10.5, 1.5],
  [146, 11, 6.2, 3],
  [157, 7.5, 3, 5],
  [164, 4.2, 1.2, 6.5],
  [168, 1.6, 0.4, 7],
];

function hullGeometry(): G {
  const yTop = -6;
  const keel0 = WL - 11.5;
  const rings = SECTIONS.map(([u, bt, bw, kr]) => {
    const k = Math.min(keel0 + kr, WL - 4.5);
    const pts: [number, number][] = [
      [-bt, yTop],
      [-bw, WL + 0.7],
      [-bw, WL - 0.9],
      [-bw * 0.95, k + 3.5],
      [-bw * 0.7, k],
      [bw * 0.7, k],
      [bw * 0.95, k + 3.5],
      [bw, WL - 0.9],
      [bw, WL + 0.7],
      [bt, yTop],
    ];
    return { z: -u, pts };
  });
  const cols = [HAZE, BOOT, BOTTOM, BOTTOM, BOTTOM, BOTTOM, BOTTOM, BOOT, HAZE].map((h) => new THREE.Color(h));
  const pos: number[] = [];
  const col: number[] = [];
  const tri = (a: number[], b: number[], c: number[], k: THREE.Color) => {
    pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b);
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i], r1 = rings[i + 1];
    for (let j = 0; j < 9; j++) {
      const A = [r0.pts[j][0], r0.pts[j][1], r0.z];
      const B = [r0.pts[j + 1][0], r0.pts[j + 1][1], r0.z];
      const C = [r1.pts[j + 1][0], r1.pts[j + 1][1], r1.z];
      const D = [r1.pts[j][0], r1.pts[j][1], r1.z];
      tri(A, C, B, cols[j]);
      tri(A, D, C, cols[j]);
    }
  }
  // the transom (faces aft) and the stem (faces forward)
  for (const [r, aft] of [
    [rings[0], true],
    [rings[rings.length - 1], false],
  ] as const) {
    const P = r.pts.map((p) => [p[0], p[1], r.z]);
    const upper = [P[0], P[1], P[8], P[9]];
    const hz = cols[0];
    if (aft) {
      tri(upper[0], upper[1], upper[2], hz);
      tri(upper[0], upper[2], upper[3], hz);
    } else {
      tri(upper[0], upper[2], upper[1], hz);
      tri(upper[0], upper[3], upper[2], hz);
    }
    const c = [0, WL + 0.7, r.z];
    for (let j = 1; j < 8; j++) {
      if (aft) tri(c, P[j], P[j + 1], cols[j]);
      else tri(c, P[j + 1], P[j], cols[j]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The flight deck's outline as a shape in (v, u). */
function deckShape(L: CarrierLayout): THREE.Shape {
  return new THREE.Shape(L.deck.map(([u, v]) => new THREE.Vector2(v, u)));
}

/** The gallery deck and sponsons under the flight deck (the slab the deck sits on). */
function slabGeometry(L: CarrierLayout): G {
  const g = new THREE.ExtrudeGeometry(deckShape(L), { depth: 6.4, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -6.45, 0);
  return paint(g, HAZE_D);
}

// --- the deck texture --------------------------------------------------------------------------

const U0 = -162, U1 = 174;
const TEX_W = 2048;
const PX = TEX_W / (U1 - U0);
const V0 = -52;
const TEX_H = 552;
const V1 = V0 + TEX_H / PX;

function rnd(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const deckTextures = new Map<string, THREE.Texture>();

function deckTexture(cls: string, L: CarrierLayout, red: boolean): THREE.Texture {
  const cached = deckTextures.get(cls);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d')!;
  const R = rnd(cls.length * 977 + 13);
  // non-skid: dark grey with a fine grain
  g.fillStyle = red ? '#44484b' : '#404447';
  g.fillRect(0, 0, TEX_W, TEX_H);
  const img = g.getImageData(0, 0, TEX_W, TEX_H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * 14;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // from here on draw in metres: x = u (toward the bow), y = v (to starboard)
  g.setTransform(PX, 0, 0, PX, -U0 * PX, -V0 * PX);
  // deck plating seams
  g.strokeStyle = 'rgba(0,0,0,0.14)';
  g.lineWidth = 0.08;
  for (let u = U0; u < U1; u += 6.1) {
    g.beginPath();
    g.moveTo(u, V0);
    g.lineTo(u, V1);
    g.stroke();
  }
  for (let v = V0; v < V1; v += 3.05) {
    g.beginPath();
    g.moveTo(U0, v);
    g.lineTo(U1, v);
    g.stroke();
  }
  // weathered patches
  for (let k = 0; k < 90; k++) {
    g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
    const u = U0 + R() * (U1 - U0), v = V0 + R() * (V1 - V0);
    g.beginPath();
    g.ellipse(u, v, 3 + R() * 12, 2 + R() * 6, R() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // island footprint (in its shadow)
  const [iu0, iu1, iv0, iv1] = L.island;
  g.fillStyle = '#2c2f31';
  g.fillRect(iu0 - 0.6, iv0 - 0.6, iu1 - iu0 + 1.2, iv1 - iv0 + 1.2);
  // elevators: hazard-striped edges
  for (const [u0, u1, v0, v1] of L.elevators) {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(u0, v0, u1 - u0, v1 - v0);
    hazardRect(g, u0, v0, u1 - u0, v1 - v0, 0.55);
  }
  // --- the angled landing area -----------------------------------------------------------
  g.save();
  g.translate(L.rampU, L.rampV);
  g.rotate(-LANDING_AREA.angleDeg * DEG);
  const len = LANDING_AREA.length;
  // rubber and exhaust stains where the jets land and the wires drag them
  g.fillStyle = 'rgba(0,0,0,0.13)';
  g.fillRect(8, -10, len - 20, 20);
  for (let k = 0; k < 230; k++) {
    const s0 = 18 + Math.pow(R(), 1.3) * 120;
    const lat = (R() + R() + R() - 1.5) * 4.2;
    g.strokeStyle = `rgba(8,8,8,${0.12 + R() * 0.22})`;
    g.lineWidth = 0.2 + R() * 0.35;
    g.beginPath();
    g.moveTo(s0, lat);
    g.lineTo(s0 + 8 + R() * 55, lat + (R() - 0.5) * 1.2);
    g.stroke();
  }
  // edge lines
  g.fillStyle = '#e9e9e4';
  g.fillRect(0, -12.9, len, 0.45);
  g.fillRect(0, 12.45, len, 0.45);
  // centreline: white dashes
  for (let s = 2; s < len; s += 9) g.fillRect(s, -0.22, 4.5, 0.45);
  // foul line along the starboard edge: red and white
  for (let s = 0, k = 0; s < len; s += 1.5, k++) {
    g.fillStyle = k % 2 ? '#c0281f' : '#ecebe6';
    g.fillRect(s, 13.6, 1.5, 0.7);
  }
  // touchdown target lines and the wires (dark cable across the deck)
  for (const w of L.wires) {
    g.fillStyle = '#e9e9e4';
    g.fillRect(w - 0.25, -12.6, 0.5, 1.2);
    g.fillRect(w - 0.25, 11.4, 0.5, 1.2);
    g.strokeStyle = '#141414';
    g.lineWidth = 0.14;
    g.beginPath();
    g.moveTo(w, -12.2);
    g.lineTo(w, 12.2);
    g.stroke();
  }
  g.restore();
  // ramp: black and white hash on the round-down
  g.save();
  g.beginPath();
  g.rect(-160, -24, 4.2, 54);
  g.clip();
  g.fillStyle = '#ecebe6';
  g.fillRect(-160, -24, 4.2, 54);
  g.fillStyle = '#151515';
  for (let v = -30; v < 34; v += 2.4) {
    g.beginPath();
    g.moveTo(-160, v);
    g.lineTo(-155.8, v + 2.6);
    g.lineTo(-155.8, v + 3.8);
    g.lineTo(-160, v + 1.2);
    g.fill();
  }
  g.restore();
  // --- catapults --------------------------------------------------------------------------
  L.cats.forEach((cat, i) => {
    g.save();
    g.translate(cat.u, cat.v);
    g.rotate(cat.off * DEG);
    // lead-in line (yellow) up to the shuttle, then the track slot
    g.fillStyle = '#d9b521';
    g.fillRect(-34, -0.18, 34, 0.36);
    g.fillStyle = '#18191a';
    g.fillRect(0, -0.3, cat.stroke, 0.6);
    g.fillStyle = 'rgba(217,181,33,0.65)';
    g.fillRect(0, -0.9, cat.stroke, 0.12);
    g.fillRect(0, 0.78, cat.stroke, 0.12);
    // the jet blast deflector's well behind the jet
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(-24.4, -6.2, 4.4, 12.4);
    hazardRect(g, -24.4, -6.2, 4.4, 12.4, 0.35);
    // catapult number
    g.save();
    g.translate(-6, cat.v < 0 && i < 2 ? -3.8 : 3.8);
    g.rotate(Math.PI / 2);
    g.fillStyle = '#ecebe6';
    g.font = 'bold 3.2px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(i + 1), 0, 0);
    g.restore();
    g.restore();
  });
  // a yellow taxi line around the bow and down the starboard side
  g.strokeStyle = '#d9b521';
  g.lineWidth = 0.32;
  g.beginPath();
  g.moveTo(-145, 18.5);
  g.lineTo(iu0 - 4, 18.5);
  g.moveTo(iu1 + 4, 18.5);
  g.lineTo(100, 18.5);
  g.lineTo(140, 2);
  g.stroke();
  // deck edge: a thin white line
  g.strokeStyle = 'rgba(236,236,230,0.85)';
  g.lineWidth = 0.5;
  g.beginPath();
  L.deck.forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v)));
  g.closePath();
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  deckTextures.set(cls, tex);
  return tex;
}

function hazardRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lw: number): void {
  g.save();
  g.lineWidth = lw;
  g.strokeStyle = '#d9b521';
  g.strokeRect(x, y, w, h);
  g.setLineDash([lw * 1.6, lw * 1.6]);
  g.strokeStyle = '#151515';
  g.strokeRect(x, y, w, h);
  g.restore();
}

/** The flat deck surface (textured), slightly above the slab. */
function deckTopGeometry(L: CarrierLayout): G {
  const g = new THREE.ShapeGeometry(deckShape(L));
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const v = p.getX(i), u = -p.getZ(i);
    uv[i * 2] = (u - U0) / (U1 - U0);
    uv[i * 2 + 1] = 1 - (v - V0) / (V1 - V0);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// --- the island ---------------------------------------------------------------------------------

/** Box with a band of dark windows around it. */
function storey(u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, win: number, out: G[], hex = HAZE): void {
  out.push(bx(u0, u1, v0, v1, y0, y1, hex));
  if (win > 0) {
    const wy = y0 + (y1 - y0) * 0.45;
    out.push(bx(u0 - 0.08, u1 + 0.08, v0 - 0.08, v1 + 0.08, wy, wy + win, WINDOW));
  }
}

interface IslandParts {
  geo: G;
  /** rotating radar antennas: (geometry centred on its axis, u, v, y, rpm) */
  radars: { geo: G; u: number; v: number; y: number; rpm: number }[];
  /** where the hull number is painted (u centre, y centre, width, height) */
  number: [number, number, number, number];
  /** masthead light */
  mast: [number, number, number];
}

function islandParts(cls: string, L: CarrierLayout): IslandParts {
  const parts: G[] = [];
  const radars: IslandParts['radars'] = [];
  const [u0, u1, v0, v1] = L.island;
  if (cls === 'nimitz') {
    storey(u0, u1, v0, v1, 0, 8.5, 0, parts);
    storey(u0 + 2, u1 - 2, v0 + 0.5, v1 - 0.5, 8.5, 15, 1.2, parts);
    storey(u0 + 12, u1 - 4, v0 - 0.6, v1 + 0.2, 15, 19, 1.6, parts, HAZE_L);
    // Pri-Fly: the air boss's glass box, overhanging the deck at the aft end
    storey(u0 + 1, u0 + 14, v0 - 2, v1 - 1, 19, 22.5, 1.8, parts, HAZE_L);
    storey(u0 + 14, u1 - 10, v0 + 1.5, v1 - 1.5, 19, 24, 0, parts);
    // the mast with its yardarm
    const mu = u0 + 24, mv = (v0 + v1) / 2;
    parts.push(bx(mu - 1.5, mu + 1.5, mv - 1.5, mv + 1.5, 24, 37, HAZE));
    parts.push(bx(mu - 0.5, mu + 0.5, v0, v1, 33, 33.5, HAZE_D));
    parts.push(cyl(mu, mv, 0.25, 0.15, 37, 41, HAZE_D, 6));
    // radomes and ESM boxes
    parts.push(sphere(u0 + 16, v0 + 2, 25.3, 1.3, '#e3e5e4'), sphere(u1 - 12, v1 - 2, 25.3, 1.3, '#e3e5e4'));
    parts.push(bx(u0 + 5, u0 + 9, v0 + 4, v1 - 4, 22.5, 24, HAZE_D));
    // SPS-48 (flat array, top of the mast) and SPS-49 (curved mesh, aft)
    radars.push({ geo: paint(new THREE.BoxGeometry(5, 4.4, 0.5), '#3e4448'), u: mu, v: mv, y: 39, rpm: 15 });
    const s49 = new THREE.CylinderGeometry(4, 4, 3.2, 14, 1, true, -0.7, 1.4);
    s49.translate(0, 0, -3.6);
    radars.push({ geo: paint(s49, '#50575c'), u: u0 + 6, v: mv, y: 27, rpm: 12 });
    parts.push(cyl(u0 + 6, mv, 0.6, 0.5, 24, 26, HAZE_D, 8));
    return { geo: mergeGeometries(parts)!, radars, number: [u0 + 22, 6.5, 18, 9], mast: [mu, mv, 41.3] };
  }
  if (cls === 'ford') {
    storey(u0, u1, v0, v1, 0, 9, 0, parts);
    storey(u0 + 1, u1 - 1, v0 + 0.5, v1 - 0.5, 9, 16, 1.2, parts);
    storey(u0 + 3, u1 - 1, v0 - 0.6, v1 + 0.2, 16, 20, 1.6, parts, HAZE_L);
    storey(u0 - 1, u0 + 7, v0 - 2, v1 - 1, 18, 21, 1.6, parts, HAZE_L);
    // the radar block: dual-band arrays on three faces
    storey(u0 + 5, u1 - 4, v0 + 1, v1 - 1, 20, 27, 0, parts);
    const cu = (u0 + 5 + u1 - 4) / 2, cv = (v0 + v1) / 2;
    parts.push(bx(u1 - 4.05, u1 - 3.95, cv - 3, cv + 3, 21.5, 26, '#4d5459'));
    parts.push(bx(cu - 3, cu + 3, v0 + 0.95, v0 + 1.05, 21.5, 26, '#4d5459'));
    parts.push(bx(cu - 3, cu + 3, v1 - 1.05, v1 - 0.95, 21.5, 26, '#4d5459'));
    parts.push(bx(cu - 1, cu + 1, cv - 1, cv + 1, 27, 35, HAZE));
    parts.push(cyl(cu, cv, 0.22, 0.14, 35, 39, HAZE_D, 6));
    parts.push(sphere(cu - 5, cv, 28.2, 1.2, '#e3e5e4'));
    radars.push({ geo: paint(new THREE.BoxGeometry(4.2, 1.2, 0.4), '#3e4448'), u: cu, v: cv, y: 33.5, rpm: 20 });
    return { geo: mergeGeometries(parts)!, radars, number: [(u0 + u1) / 2, 6, 14, 8], mast: [cu, cv, 39.3] };
  }
  // Type 003: one tall integrated island with flat-panel radars and a funnel
  storey(u0, u1, v0, v1, 0, 10, 0, parts);
  storey(u0 + 1, u1 - 1, v0 + 0.5, v1 - 0.5, 10, 18, 1.2, parts);
  storey(u0 + 3, u1 - 2, v0 - 0.6, v1 + 0.2, 18, 22, 1.7, parts, HAZE_L);
  storey(u0 + 7, u1 - 7, v0 + 1.5, v1 - 1.5, 22, 30, 0, parts);
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  for (const [a, b, c2, d2] of [
    [u1 - 7.05, u1 - 6.95, cv - 2.8, cv + 2.8],
    [u0 + 6.95, u0 + 7.05, cv - 2.8, cv + 2.8],
    [cu - 3.5, cu + 3.5, v0 + 1.45, v0 + 1.55],
    [cu - 3.5, cu + 3.5, v1 - 1.55, v1 - 1.45],
  ]) {
    parts.push(bx(a, b, c2, d2, 23.5, 28.5, '#4a5055'));
  }
  parts.push(bx(cu - 2.5, cu + 2.5, cv - 2, cv + 2, 30, 34, HAZE));
  parts.push(cyl(cu, cv, 0.22, 0.14, 34, 38, HAZE_D, 6));
  // funnel at the aft end, black-topped
  parts.push(bx(u0 - 0.5, u0 + 6, cv - 3, cv + 3, 10, 25, HAZE), bx(u0 - 0.6, u0 + 6.1, cv - 3.1, cv + 3.1, 25, 26, '#202224'));
  parts.push(sphere(cu + 4, cv, 31, 1.1, '#e3e5e4'));
  radars.push({ geo: paint(new THREE.BoxGeometry(3.6, 1.6, 0.4), '#3e4448'), u: cu, v: cv, y: 35.5, rpm: 18 });
  return { geo: mergeGeometries(parts)!, radars, number: [u1 - 9, 6, 14, 8], mast: [cu, cv, 38.3] };
}

// --- materials --------------------------------------------------------------------------------

let MATS: { hull: THREE.MeshStandardMaterial; wire: THREE.MeshStandardMaterial } | null = null;
function mats() {
  if (!MATS) {
    MATS = {
      hull: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }),
      wire: new THREE.MeshStandardMaterial({ color: 0x1e1f20, roughness: 0.5, metalness: 0.6 }),
    };
  }
  return MATS;
}

let dotTex: THREE.Texture | null = null;
function lightMaterial(size: number, attenuate: boolean): THREE.PointsMaterial {
  dotTex ??= getSoftDotTexture();
  return new THREE.PointsMaterial({
    size,
    sizeAttenuation: attenuate,
    vertexColors: true,
    map: dotTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function points(list: [number, number, number, [number, number, number]][], mat: THREE.PointsMaterial): THREE.Points {
  const pos: number[] = [];
  const col: number[] = [];
  for (const [u, v, y, c] of list) {
    pos.push(v, y, -u);
    col.push(...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  return p;
}

/** A point on the landing area: s along from the ramp, lat to starboard. */
function landingPoint(L: CarrierLayout, s: number, lat: number): [number, number] {
  const a = -LANDING_AREA.angleDeg * DEG;
  return [L.rampU + Math.cos(a) * s - Math.sin(a) * lat, L.rampV + Math.sin(a) * s + Math.cos(a) * lat];
}

// --- the wake -------------------------------------------------------------------------------------

let foamTex: THREE.Texture | null = null;
function foamTexture(): THREE.Texture {
  if (foamTex) return foamTex;
  const W = 128, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const R = rnd(4242);
  g.clearRect(0, 0, W, H);
  // churned streaks along the wake, densest in the middle
  for (let k = 0; k < 1400; k++) {
    const x = W / 2 + (R() + R() + R() - 1.5) * W * 0.55;
    const y = R() * H;
    const a = 0.05 + R() * 0.16;
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.beginPath();
    g.ellipse(x, y, 1 + R() * 4, 4 + R() * 22, (R() - 0.5) * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  foamTex = t;
  return t;
}

const WAKE_N = 56;
const WAKE_DT = 2.2;
const BOW_N = 8;

class Wake {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private uv: Float32Array;
  private readonly strips: number;

  constructor() {
    // main wake + two bow waves, each a strip of quads
    const verts = (WAKE_N + 1) * 2 + (BOW_N + 1) * 2 * 2;
    this.strips = verts;
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 4);
    this.uv = new Float32Array(verts * 2);
    const idx: number[] = [];
    const strip = (start: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = start + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    };
    strip(0, WAKE_N);
    strip((WAKE_N + 1) * 2, BOW_N);
    strip((WAKE_N + 1) * 2 + (BOW_N + 1) * 2, BOW_N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({
      map: foamTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'carrier-wake';
  }

  private put(i: number, x: number, z: number, y: number, a: number, uvx: number, uvy: number): void {
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 4] = 1;
    this.col[i * 4 + 1] = 1;
    this.col[i * 4 + 2] = 1;
    this.col[i * 4 + 3] = a;
    this.uv[i * 2] = uvx;
    this.uv[i * 2 + 1] = uvy;
  }

  update(c: Carrier, cam: THREE.Vector3, seaT: number, light: number): void {
    const waves = seaMoves();
    const sea = (x: number, z: number) => (waves ? waveHeight(x, z, seaT, Math.hypot(x - cam.x, z - cam.z)) : 0) + 0.9;
    const p = { x: 0, z: 0, h: 0 };
    // the churned water left behind the stern, spreading and fading
    for (let k = 0; k <= WAKE_N; k++) {
      c.pathAt(c.t - k * WAKE_DT, p);
      const fx = Math.sin(p.h), fz = -Math.cos(p.h);
      const rx = Math.cos(p.h), rz = Math.sin(p.h);
      const sx = p.x - fx * 148, sz = p.z - fz * 148;
      const f = k / WAKE_N;
      const half = 16 + 70 * Math.pow(f, 0.8);
      const a = (k === 0 ? 0.55 : 0.85) * Math.pow(1 - f, 1.4);
      const vy = (k * WAKE_DT * c.spec.speed) / 220;
      this.put(k * 2, sx - rx * half, sz - rz * half, sea(sx - rx * half, sz - rz * half), a, 0, vy);
      this.put(k * 2 + 1, sx + rx * half, sz + rz * half, sea(sx + rx * half, sz + rz * half), a, 1, vy);
    }
    // the bow wave peeling off each side
    for (const side of [-1, 1]) {
      const base = (WAKE_N + 1) * 2 + (side < 0 ? 0 : (BOW_N + 1) * 2);
      for (let k = 0; k <= BOW_N; k++) {
        const f = k / BOW_N;
        const u = 160 - f * 120;
        const v = side * (2 + f * 34);
        const w = 2.5 + f * 7;
        const x0 = c.x + c.fx * u + c.rx * v, z0 = c.z + c.fz * u + c.rz * v;
        const a = 0.75 * (1 - f);
        this.put(base + k * 2, x0 - c.rx * w * side * 0.5, z0 - c.rz * w * side * 0.5, sea(x0, z0), a, 0.2, f * 0.6 + seaT * 0.02);
        this.put(base + k * 2 + 1, x0 + c.rx * w * side * 0.5, z0 + c.rz * w * side * 0.5, sea(x0, z0), a, 0.8, f * 0.6 + seaT * 0.02);
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    (this.mesh.material as THREE.MeshBasicMaterial).color.setScalar(light);
    void this.strips;
  }
}

// --- one ship --------------------------------------------------------------------------------------

interface Jbd {
  pivot: THREE.Object3D;
  angle: number;
  cat: number;
}

class CarrierView {
  readonly root = new THREE.Group();
  readonly wake = new Wake();
  private radars: { obj: THREE.Object3D; rpm: number }[] = [];
  private jbds: Jbd[] = [];
  private ball: THREE.Mesh;
  private ballGlow: THREE.Points;
  private datum: THREE.Object3D[] = [];
  private waveOff: THREE.Object3D[] = [];
  private lens = new THREE.Group();
  private lights: THREE.Points;
  private farLights: THREE.Points;
  private jets: AirframeVisual[] | null = null;
  private t = Math.random() * 10;

  constructor(readonly c: Carrier) {
    const L = c.layout;
    const cls = c.spec.cls;
    const red = c.f.team === 'red';
    const m = mats();
    this.root.name = 'carrier-' + c.f.id;
    this.root.rotation.order = 'YXZ';
    // hull, gallery deck and island in one mesh
    const isl = islandParts(cls, L);
    const struct: G[] = [hullGeometry(), slabGeometry(L), isl.geo];
    // sponsons for the close-in guns
    for (const [u, v, y] of L.guns) struct.push(cyl(u, v, 2.6, 2.2, y - DECK_HEIGHT - 2.5, y - DECK_HEIGHT + 0.05, HAZE_D, 14));
    // the LSO platform on the port side aft, and the lens sponson
    struct.push(bx(-128, -118, -27.5, -23.5, -1.2, -0.05, HAZE_D));
    // hangar doors behind the deck-edge elevators (dark openings in the hull)
    for (const [u0, u1, v0] of L.elevators) {
      const side = v0 > 0 ? 1 : -1;
      struct.push(bx(u0 + 1, u1 - 1, side * 21.45 - 0.1, side * 21.45 + 0.1, -14, -6.6, '#25292c'));
    }
    const hull = new THREE.Mesh(mergeGeometries(struct)!, m.hull);
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.root.add(hull);
    // the flight deck
    const deckMat = new THREE.MeshStandardMaterial({ map: deckTexture(cls, L, red), roughness: 0.9, metalness: 0.02 });
    const deck = new THREE.Mesh(deckTopGeometry(L), deckMat);
    deck.receiveShadow = true;
    this.root.add(deck);
    // arresting wires (raised a hand's width off the deck on their supports)
    const wires: G[] = [];
    for (const w of L.wires) {
      const [a1, b1] = landingPoint(L, w, -12.3);
      const [a2, b2] = landingPoint(L, w, 12.3);
      const len = Math.hypot(a2 - a1, b2 - b1);
      const wg = new THREE.CylinderGeometry(0.05, 0.05, len, 5);
      wg.rotateZ(Math.PI / 2);
      wg.rotateY(LANDING_AREA.angleDeg * DEG);
      wg.translate((b1 + b2) / 2, 0.13, -(a1 + a2) / 2);
      wires.push(paint(wg, '#1e1f20'));
      for (const [a, b] of [
        [a1, b1],
        [a2, b2],
      ]) {
        wires.push(bx(a - 0.5, a + 0.5, b - 0.35, b + 0.35, 0, 0.22, '#3a3d3f'));
      }
    }
    const wireMesh = new THREE.Mesh(mergeGeometries(wires)!, m.hull);
    this.root.add(wireMesh);
    // hull numbers: on the island and on the bow end of the deck
    const num = c.spec.hull.replace(/^CVN-/, '').replace(/^0/, '');
    const islTex = makeTextTexture(num, 512, 256, { font: 'bold 210px Arial', color: '#f2f2ee' });
    const numMat = new THREE.MeshStandardMaterial({ map: islTex, transparent: true, alphaTest: 0.4, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
    const [nu, ny, nw, nh] = isl.number;
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(nw, nh), numMat);
      p.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
      p.position.set(side < 0 ? L.island[2] - 0.12 : L.island[3] + 0.12, ny, -nu);
      this.root.add(p);
    }
    const deckNum = new THREE.Mesh(new THREE.PlaneGeometry(22, 14), new THREE.MeshStandardMaterial({ map: makeTextTexture(num, 512, 320, { font: 'bold 300px Arial', color: '#e8e8e2' }), transparent: true, alphaTest: 0.3, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    deckNum.rotation.x = -Math.PI / 2;
    deckNum.position.set(0.5, 0.02, -146);
    this.root.add(deckNum);
    // turning radars
    for (const r of isl.radars) {
      const obj = new THREE.Mesh(r.geo, m.hull);
      obj.position.set(r.v, r.y, -r.u);
      obj.castShadow = true;
      this.root.add(obj);
      this.radars.push({ obj, rpm: r.rpm });
    }
    // jet blast deflectors: panels hinged on their forward edge behind each catapult
    L.cats.forEach((cat, i) => {
      const hu = cat.u - 20 * Math.cos(cat.off * DEG), hv = cat.v - 20 * Math.sin(cat.off * DEG);
      const frame = new THREE.Group();
      frame.position.set(hv, 0.03, -hu);
      frame.rotation.y = -cat.off * DEG;
      const pivot = new THREE.Group();
      const panel = new THREE.Mesh(paint(new THREE.BoxGeometry(12, 0.35, 4.2), '#5d6468'), m.hull);
      panel.position.set(0, 0.17, 2.1);
      panel.castShadow = true;
      pivot.add(panel);
      frame.add(pivot);
      this.root.add(frame);
      this.jbds.push({ pivot, angle: 0, cat: i });
    });
    // the Fresnel lens on the port side, abeam the target wire, facing the approach
    const aim = c.f.aimPoint ?? 72;
    const [lu, lv] = landingPoint(L, aim + 8, -21.5);
    this.lens.position.set(lv, 0, -lu);
    this.lens.rotation.y = LANDING_AREA.angleDeg * DEG;
    const housing = new THREE.Mesh(paint(new THREE.BoxGeometry(1.6, 3.2, 0.8), '#202326'), m.hull);
    housing.position.y = 2.2;
    this.lens.add(housing);
    const amber = new THREE.MeshBasicMaterial({ color: 0xffa62a, toneMapped: false });
    this.ball = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), amber);
    this.ball.position.set(0, 2.2, 0.42);
    this.lens.add(this.ball);
    this.ballGlow = points([[0, 0, 0, [1, 0.62, 0.15]]], lightMaterial(9, false));
    this.ball.add(this.ballGlow);
    const green = new THREE.MeshBasicMaterial({ color: 0x3dff6a, toneMapped: false });
    const gl: [number, number, number, [number, number, number]][] = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), green);
        const x = side * (1.5 + k * 0.6);
        d.position.set(x, 2.2, 0.05);
        this.lens.add(d);
        this.datum.push(d);
        gl.push([-0.05, x, 2.2, [0.2, 1, 0.35]]);
      }
      const wo = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 2.6), new THREE.MeshBasicMaterial({ color: 0xff1a10, toneMapped: false }));
      wo.position.set(side * 1.05, 2.2, 0.42);
      wo.visible = false;
      this.lens.add(wo);
      this.waveOff.push(wo);
    }
    // datum glow (points in the lens frame: the helper writes (v, y, -u))
    this.lens.add(points(gl, lightMaterial(5, false)));
    this.root.add(this.lens);
    // deck lights: landing area edges and centreline, the drop lights down the stern, deck edge
    const lights: [number, number, number, [number, number, number]][] = [];
    const W: [number, number, number] = [1, 0.93, 0.8];
    for (let s = 0; s <= LANDING_AREA.length; s += 12) {
      for (const lat of [-12.9, 12.9]) {
        const [u, v] = landingPoint(L, s, lat);
        lights.push([u, v, 0.15, W]);
      }
      const [u, v] = landingPoint(L, s + 6, 0);
      if (s + 6 < LANDING_AREA.length) lights.push([u, v, 0.08, W]);
    }
    for (let y = -1.2; y > -13; y -= 1.3) lights.push([L.rampU - 0.6, L.rampV, y, [1, 0.55, 0.15]]);
    const D = L.deck;
    for (let i = 0; i < D.length; i++) {
      const [au, av] = D[i], [bu, bv] = D[(i + 1) % D.length];
      const n = Math.max(1, Math.round(Math.hypot(bu - au, bv - av) / 14));
      for (let k = 0; k < n; k++) lights.push([au + ((bu - au) * k) / n, av + ((bv - av) * k) / n, 0.2, [0.35, 0.5, 1]]);
    }
    this.lights = points(lights, lightMaterial(1.3, true));
    this.root.add(this.lights);
    // lights seen from far away: masthead, side lights, the stern
    const [mu, mv, my] = isl.mast;
    this.farLights = points(
      [
        [mu, mv, my, [1, 1, 0.95]],
        [mu, mv, my - 6, [1, 0.12, 0.08]],
        [40, -50.5, 0.6, [1, 0.12, 0.08]],
        [L.island[0] + 10, L.island[3] + 0.4, 12, [0.15, 1, 0.3]],
        [-160.5, 2, -3, [1, 0.95, 0.85]],
      ],
      lightMaterial(3.5, false),
    );
    this.root.add(this.farLights);
  }

  update(dt: number, cam: THREE.Vector3, night: number, light: number, tanHalf: number): void {
    const c = this.c;
    this.t += dt;
    this.root.position.set(c.x, c.heave + DECK_HEIGHT, c.z);
    this.root.rotation.set(c.pitch, (-c.heading * Math.PI) / 180, -c.roll);
    const d = Math.hypot(cam.x - c.x, cam.z - c.z);
    this.root.visible = d < 160000;
    if (!this.root.visible) return;
    for (const r of this.radars) r.obj.rotation.y -= (r.rpm / 60) * Math.PI * 2 * dt;
    // the deflector rises behind a jet on the catapult and lowers after the shot
    for (const j of this.jbds) {
      const busy = c.catBusy[j.cat] !== null || c.t - c.catFired[j.cat] < 2.5;
      const want = busy ? 52 : 0;
      j.angle += Math.max(-30 * dt, Math.min(30 * dt, want - j.angle));
      j.pivot.rotation.x = -j.angle * DEG;
    }
    // lights: bright at night, faint by day
    (this.lights.material as THREE.PointsMaterial).opacity = 0.25 + 0.75 * night;
    (this.farLights.material as THREE.PointsMaterial).opacity = (0.15 + 0.85 * night) * (d > 400 ? 1 : d / 400);
    // the meatball: where the eye sits on the glide path
    if (d < 9000) {
      const gp = c.glidePath(cam.x, cam.y, cam.z);
      const off = Math.max(-1, Math.min(1, gp.dev / 0.75));
      this.ball.position.y = 2.2 + off * 1.25;
      const low = gp.dev < -0.6;
      (this.ball.material as THREE.MeshBasicMaterial).color.setHex(low ? 0xff2a14 : 0xffa62a);
      const gc = this.ballGlow.geometry.attributes.color as THREE.BufferAttribute;
      gc.setXYZ(0, low ? 1 : 1, low ? 0.15 : 0.62, low ? 0.1 : 0.15);
      gc.needsUpdate = true;
      this.ballGlow.visible = gp.inSector;
      // wave-off: flashing red when far too low close in
      const wave = gp.inSector && gp.range < 1300 && gp.dev < -1.1;
      const on = wave && Math.sin(this.t * 14) > 0;
      for (const w of this.waveOff) w.visible = on;
    }
    // jets parked on deck: built the first time the camera comes close
    if (d < 14000 && !this.jets) this.parkJets();
    if (this.jets) {
      const show = d < 20000;
      for (const j of this.jets) {
        j.root.visible = show;
        if (show) j.updateLod(cam.distanceTo(this.root.position), tanHalf);
      }
    }
    void light;
  }

  private parkJets(): void {
    const c = this.c;
    const red = c.f.team === 'red';
    this.jets = [];
    for (const [u, v, rot] of c.layout.parked) {
      const ac = new Aircraft(red ? 'SU35' : 'FA18EF', c.f.team, 'PARKED');
      // in the ship's frame: nose toward rot (deg from the bow), wheels on the deck
      ac.fm.setOnGround(new THREE.Vector3(v, 0, -u), rot);
      ac.fm.pos.set(v, ac.spec.gear.height, -u);
      ac.fm.gearPos = 1;
      const vis = createAirframe(ac);
      vis.update(0);
      this.root.add(vis.root);
      this.jets.push(vis);
    }
  }
}

/** Every carrier on the map, drawn and animated. */
export class CarrierRenderer {
  private views: CarrierView[] = [];
  private lastT = performance.now();

  constructor(
    scene: THREE.Scene,
    private env: Environment,
  ) {
    for (const c of CARRIERS) {
      const v = new CarrierView(c);
      scene.add(v.root);
      scene.add(v.wake.mesh);
      this.views.push(v);
    }
  }

  update(camera: THREE.Camera, seaT: number): void {
    if (!this.views.length) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const cam = camera.position;
    const pc = camera as THREE.PerspectiveCamera;
    const tanHalf = Math.tan(((pc.fov ?? 70) * Math.PI) / 360) / Math.max(0.01, pc.zoom ?? 1);
    const day = this.env.daylight;
    const night = Math.max(0, Math.min(1, (0.75 - day) / 0.35));
    const light = Math.max(0.05, Math.min(1, day * 1.05));
    for (const v of this.views) {
      v.update(dt, cam, night, light, tanHalf);
      const d = Math.hypot(cam.x - v.c.x, cam.z - v.c.z);
      v.wake.mesh.visible = d < 40000 && cam.y < 16000;
      if (v.wake.mesh.visible) v.wake.update(v.c, cam, seaT, light);
    }
  }
}
