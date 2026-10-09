// KESTREL SURVEYOR, the lab's 34 m survey vessel, lying alongside the pier.
// The hull is lofted from sections (a raked stem and a fine V forefoot
// opening into round bilges amidships, a wide transom), painted as a working
// ship is: red antifouling below the waterline, a white boot-top, dark blue
// topsides. Forward stands the deckhouse and the bridge with its raked,
// wraparound windows, the mast with two turning radar scanners and the
// satellite domes, and the funnel; aft is the open working deck with the
// A-frame over the stern, the winch, a deck crane, a lab container, the
// liferafts and the rescue boat. Its parts go into the harbor's merged meshes.

import * as THREE from 'three';
import { HARBOR } from '../world/geo';
import { Parts, B, C, T, bollard } from './harbor';

type RGB = [number, number, number];
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const L = 34;
const BEAM = 8.6;

/** 0 at the stem, 1 at the transom */
const tOf = (lz: number) => Math.max(0, Math.min(1, (lz + L / 2) / L));
const halfBeam = (t: number) => {
  const a = Math.min(1, t / 0.42);
  let hb = (BEAM / 2) * (1 - Math.pow(1 - a, 2.2));
  if (t > 0.9) hb *= 1 - (t - 0.9) * 0.5;
  return hb;
};
const keelAt = (t: number) => -2.3 + 1.6 * Math.pow(1 - Math.min(1, t / 0.16), 2);
const deckAt = (t: number) => 1.9 + 1.5 * Math.pow(1 - t, 2.5);

export const VESSEL = {
  x: HARBOR.vessel.x,
  z: HARBOR.vessel.z,
  /** the main deck's height at a point along the hull (local z, + toward the stern) */
  deckAt: (lz: number) => deckAt(tOf(lz)),
};

const NAVY: RGB = [0.07, 0.13, 0.24];
const RED: RGB = [0.45, 0.09, 0.07];
const WHITE: RGB = [0.92, 0.92, 0.9];
const ORANGE: RGB = [0.95, 0.42, 0.08];
const DECK: RGB = [0.36, 0.42, 0.38];
const DARK: RGB = [0.12, 0.12, 0.13];
const hullColor = (_x: number, y: number): RGB => (y < -0.03 ? RED : y < 0.35 ? WHITE : NAVY);

/** the hull's skin, both sides, the deck and the transom (local coordinates) */
function hullGeometry(): { skin: THREE.BufferGeometry; deck: THREE.BufferGeometry; transom: THREE.BufferGeometry } {
  const N = 48;
  const levels = (keel: number, deck: number) => {
    const ys: number[] = [];
    for (let j = 0; j < 7; j++) ys.push(keel + ((-0.06 - keel) * j) / 6);
    ys.push(0, 0.32);
    for (let j = 0; j < 6; j++) ys.push(0.38 + ((deck - 0.38) * j) / 5);
    return ys;
  };
  const K = 15;
  const sectionX = (t: number, y: number, keel: number, deck: number) => {
    const s = Math.max(0, Math.min(1, (y - keel) / (deck - keel)));
    const round = 1 - Math.pow(1 - s, 3.2);
    const vee = Math.pow(s, 0.75);
    const m = Math.max(0, Math.min(1, (t - 0.05) / 0.35));
    return halfBeam(t) * (vee + (round - vee) * m * m * (3 - 2 * m));
  };
  const pos: number[] = [];
  const idx: number[] = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const z = -L / 2 + t * L;
      const keel = keelAt(t), deck = deckAt(t);
      for (const y of levels(keel, deck)) pos.push(side * sectionX(t, y, keel, deck), y, z);
    }
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < K - 1; j++) {
        const a = base + i * K + j, b = base + (i + 1) * K + j, c = a + 1, d = b + 1;
        if (side > 0) idx.push(a, c, b, c, d, b);
        else idx.push(a, b, c, c, b, d);
      }
    }
  }
  const skin = new THREE.BufferGeometry();
  skin.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skin.setIndex(idx);
  skin.computeVertexNormals();
  // the deck: a strip across between the two deck edges
  const dp: number[] = [];
  const di: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const z = -L / 2 + t * L, y = deckAt(t), hb = halfBeam(t) * 0.995;
    dp.push(-hb, y, z, hb, y, z);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      di.push(a, c, b, b, c, d);
    }
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  deck.setIndex(di);
  deck.computeVertexNormals();
  // the transom: the last section, closed across
  const tp: number[] = [];
  const ti: number[] = [];
  {
    const t = 1, keel = keelAt(t), dk = deckAt(t);
    const ys = levels(keel, dk);
    ys.forEach((y, j) => {
      const x = sectionX(t, y, keel, dk);
      tp.push(-x, y, L / 2, x, y, L / 2);
      if (j > 0) {
        const a = (j - 1) * 2, b = a + 1, c = j * 2, d = c + 1;
        ti.push(a, b, c, b, d, c);
      }
    });
  }
  const transom = new THREE.BufferGeometry();
  transom.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  transom.setIndex(ti);
  transom.computeVertexNormals();
  return { skin, deck, transom };
}

/** a quad strip along the deck edge on one side, from t0 to t1, between heights above the deck */
function edgeStrip(side: number, t0: number, t1: number, h0: number, h1: number, inset: number, outward: boolean): THREE.BufferGeometry {
  const n = 24;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const z = -L / 2 + t * L, y = deckAt(t), x = side * (halfBeam(t) - inset);
    pos.push(x, y + h0, z, x, y + h1, z);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      const flip = (side > 0) === outward;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a radar scanner that turns: a bar on a pedestal */
function scanner(len: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.28), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 }));
  g.add(m);
  return g;
}

export function buildVessel(p: Parts, signs: THREE.Mesh[], spinners: { obj: THREE.Object3D; rate: number }[], group: THREE.Group): void {
  const ox = VESSEL.x, oz = VESSEL.z;
  const at = (g: THREE.BufferGeometry) => g.translate(ox, 0, oz);
  const W = (x: number, y: number, z: number) => V(ox + x, y, oz + z);
  const { skin, deck, transom } = hullGeometry();
  p.add('hull', at(skin), NAVY, { colorBy: hullColor, vary: 0.02 });
  p.add('hull', at(transom), NAVY, { colorBy: hullColor, vary: 0.02 });
  p.add('steel', at(deck), DECK, { vary: 0.03 });
  // bulwarks forward, railings aft
  for (const side of [1, -1]) {
    p.add('hull', at(edgeStrip(side, 0.0, 0.5, 0, 1.0, 0, true)), NAVY, { vary: 0.02 });
    p.add('steel', at(edgeStrip(side, 0.0, 0.5, 0, 1.0, 0.07, false)), WHITE, { vary: 0.01 });
    p.add('steel', at(edgeStrip(side, 0.0, 0.5, 1.0, 1.08, 0.0, true)), WHITE, { vary: 0 });
    let prev: THREE.Vector3 | null = null, prevLow: THREE.Vector3 | null = null;
    for (let t = 0.5; t <= 1.0001; t += 0.04) {
      const z = -L / 2 + t * L, y = deckAt(t), x = side * (halfBeam(t) - 0.08);
      p.add('steel', at(C(0.025, 0.025, 1.05, 5, x, y + 0.52, z)), WHITE, { vary: 0 });
      const top = W(x, y + 1.05, z), low = W(x, y + 0.55, z);
      if (prev && prevLow) {
        p.add('steel', T(prev, top, 0.028, 5), WHITE, { vary: 0 });
        p.add('steel', T(prevLow, low, 0.02, 4), WHITE, { vary: 0 });
      }
      prev = top;
      prevLow = low;
    }
  }
  // the deckhouse and the bridge
  p.add('steel', at(B(7.6, 2.9, 11.5, 0, 3.25, -4.6)), WHITE, { vary: 0.01 });
  for (const side of [1, -1]) for (let z = -9.2; z <= -0.4; z += 1.9) p.add('glass', at(B(0.05, 0.75, 1.1, side * 3.81, 3.6, z)), [0.16, 0.22, 0.26]);
  p.add('steel', at(B(7.2, 2.6, 6.6, 0, 5.95, -6.4)), WHITE, { vary: 0.01 });
  p.add('steel', at(B(BEAM + 0.2, 0.18, 2.0, 0, 4.72, -8.6)), WHITE, { vary: 0 });
  {
    // the raked front windows, the side windows, the mullions
    const fw = new THREE.BoxGeometry(7.24, 1.25, 0.06);
    fw.rotateX(-0.2);
    p.add('glass', at(fw.translate(0, 6.15, -9.66)), [0.12, 0.17, 0.2]);
    for (let x = -3.0; x <= 3.01; x += 1.0) {
      const m = new THREE.BoxGeometry(0.07, 1.3, 0.1);
      m.rotateX(-0.2);
      p.add('steel', at(m.translate(x, 6.15, -9.7)), WHITE, { vary: 0 });
    }
    for (const side of [1, -1]) p.add('glass', at(B(0.06, 1.1, 5.4, side * 3.61, 6.2, -6.3)), [0.12, 0.17, 0.2]);
    p.add('steel', at(B(7.8, 0.16, 7.4, 0, 7.33, -6.4)), WHITE, { vary: 0 });
    // the rail round the bridge roof
    for (const side of [1, -1]) p.add('steel', T(W(side * 3.6, 8.3, -9.9), W(side * 3.6, 8.3, -2.9), 0.025, 4), WHITE, { vary: 0 });
    p.add('steel', T(W(-3.6, 8.3, -9.9), W(3.6, 8.3, -9.9), 0.025, 4), WHITE, { vary: 0 });
    for (let z = -9.9; z <= -2.8; z += 1.4) for (const side of [1, -1]) p.add('steel', at(C(0.02, 0.02, 0.9, 4, side * 3.6, 7.85, z)), WHITE, { vary: 0 });
  }
  // the mast, the scanners, the domes, the antennas
  p.add('steel', at(C(0.11, 0.18, 6.0, 8, 0, 10.3, -5.0)), WHITE, { vary: 0 });
  p.add('steel', at(C(0.045, 0.045, 3.4, 6, 0, 12.0, -5.0, 0, Math.PI / 2)), WHITE, { vary: 0 });
  p.add('steel', at(B(1.6, 0.12, 1.2, 0, 9.4, -5.0)), WHITE, { vary: 0 });
  p.add('steel', at(B(1.2, 0.12, 1.0, 0, 11.0, -5.0)), WHITE, { vary: 0 });
  for (const [y, len, rate] of [[9.75, 2.6, 2.1], [11.35, 1.7, 3.0]] as [number, number, number][]) {
    const s = scanner(len, 0xe9e9e5);
    s.position.set(ox, y, oz - 5.0);
    group.add(s);
    spinners.push({ obj: s, rate });
  }
  for (const side of [1, -1]) {
    p.add('steel', at(C(0.08, 0.1, 0.6, 8, side * 2.4, 7.7, -4.0)), WHITE, { vary: 0 });
    p.add('steel', at(new THREE.SphereGeometry(0.45, 16, 12).translate(side * 2.4, 8.3, -4.0)), WHITE, { vary: 0 });
    p.add('steel', at(C(0.015, 0.02, 3.2, 4, side * 3.3, 9.0, -9.4)), WHITE, { vary: 0 });
  }
  // the funnel
  {
    const f = new THREE.CylinderGeometry(0.85, 0.95, 3.2, 20);
    f.scale(1, 1, 1.55);
    p.add('steel', at(f.translate(0, 5.0, 2.2)), WHITE, { vary: 0.01 });
    const band = new THREE.CylinderGeometry(0.87, 0.87, 0.55, 20);
    band.scale(1, 1, 1.55);
    p.add('steel', at(band.translate(0, 6.0, 2.2)), [0.1, 0.25, 0.5], { vary: 0 });
    const cap = new THREE.CylinderGeometry(0.8, 0.86, 0.3, 20);
    cap.scale(1, 1, 1.55);
    p.add('steel', at(cap.translate(0, 6.42, 2.2)), DARK, { vary: 0 });
    for (const dz of [-0.4, 0.4]) p.add('steel', at(C(0.13, 0.13, 0.7, 8, 0, 6.8, 2.2 + dz)), DARK, { vary: 0 });
  }
  // liferafts on the deckhouse roof, the rescue boat on its davit
  for (const side of [1, -1]) for (const z of [-1.6, 0.0]) {
    p.add('steel', at(C(0.32, 0.32, 1.15, 12, side * 3.25, 5.0, z, Math.PI / 2)), WHITE, { vary: 0.02 });
    p.add('steel', at(B(0.7, 0.12, 1.0, side * 3.25, 4.7, z)), DARK, { vary: 0 });
  }
  {
    const rib = new THREE.CapsuleGeometry(0.42, 3.4, 6, 12);
    rib.rotateX(Math.PI / 2);
    rib.scale(1.55, 0.75, 1);
    p.add('rubber', at(rib.translate(-3.05, 3.45, 3.6)), ORANGE, { vary: 0.02 });
    p.add('steel', T(W(-3.6, 2.0, 2.6), W(-3.4, 5.0, 3.6), 0.07, 6), WHITE, { vary: 0 });
    p.add('steel', T(W(-3.4, 5.0, 3.6), W(-3.05, 4.9, 3.6), 0.06, 6), WHITE, { vary: 0 });
  }
  // the working deck: winch, deck crane, a lab container
  const aftY = deckAt(0.75);
  p.add('steel', at(C(0.62, 0.62, 1.9, 18, 0, aftY + 0.8, 9.2, 0, Math.PI / 2)), [0.2, 0.28, 0.36]);
  for (const dx of [-1.05, 1.05]) p.add('steel', at(B(0.15, 1.6, 1.6, dx, aftY + 0.8, 9.2)), [0.2, 0.28, 0.36]);
  p.add('steel', at(C(0.42, 0.5, 1.5, 12, 2.6, aftY + 0.75, 4.8)), ORANGE);
  p.add('steel', T(W(2.6, aftY + 1.4, 4.8), W(3.0, aftY + 5.2, 9.0), 0.2, 8), ORANGE);
  p.add('steel', T(W(3.0, aftY + 5.2, 9.0), W(3.3, aftY + 3.4, 12.2), 0.15, 8), ORANGE);
  p.add('steel', T(W(3.3, aftY + 3.4, 12.2), W(3.3, aftY + 1.6, 12.2), 0.015, 4), DARK, { vary: 0 });
  p.add('clad', at(B(2.44, 2.59, 6.06, -2.3, aftY + 1.3, 9.6)), WHITE, { vary: 0.01 });
  p.add('glass', at(B(0.04, 0.8, 1.2, -1.07, aftY + 1.6, 9.6)), [0.16, 0.22, 0.26]);
  // the A-frame over the stern, its rams, the block and the wire
  {
    const sy = deckAt(1);
    const topY = sy + 6.3;
    for (const side of [1, -1]) {
      p.add('steel', T(W(side * 3.55, sy, 15.6), W(side * 3.0, topY, 17.2), 0.24, 10), ORANGE);
      p.add('steel', T(W(side * 3.55, sy + 0.3, 13.2), W(side * 3.25, sy + 3.6, 16.2), 0.1, 8), [0.82, 0.83, 0.85]);
      p.add('steel', at(B(0.7, 0.4, 1.2, side * 3.55, sy + 0.2, 15.6)), ORANGE);
    }
    p.add('steel', T(W(-3.05, topY, 17.2), W(3.05, topY, 17.2), 0.28, 10), ORANGE);
    p.add('steel', at(C(0.38, 0.38, 0.26, 14, 0, topY - 0.55, 17.25, 0, Math.PI / 2)), DARK, { vary: 0 });
    p.add('steel', T(W(0, topY - 0.9, 17.25), W(0, sy + 0.6, 17.25), 0.02, 4), DARK, { vary: 0 });
  }
  // the bow: anchors, a bollard pair each side, the name
  for (const side of [1, -1]) {
    const t = 0.1;
    p.add('steel', at(B(0.12, 0.75, 0.6, side * (halfBeam(t) + 0.04), deckAt(t) - 0.9, -L / 2 + t * L)), DARK, { vary: 0 });
    for (const lz of [-13, 13]) p.add('steel', at(bollard(side * (halfBeam(tOf(lz)) - 0.6), deckAt(tOf(lz)), lz)), DARK);
  }
  // the pneumatic fenders against the pier
  for (const lz of [-10, 0, 10]) p.add('rubber', at(C(0.48, 0.48, 1.7, 16, halfBeam(tOf(lz)) + 0.5, 0.7, lz, Math.PI / 2)), [0.2, 0.2, 0.21]);
  // the names: both bows and the transom
  const name = (text: string, w: number, h: number, x: number, y: number, z: number, ry: number) => {
    const s = signFor(text, w, h);
    s.position.set(ox + x, y, oz + z);
    s.rotation.y = ry;
    signs.push(s);
  };
  {
    const lz = -11.5, t = tOf(lz);
    const dhb = (halfBeam(t + 0.01) - halfBeam(t - 0.01)) / (0.02 * L);
    const yaw = Math.atan(dhb);
    name('KESTREL SURVEYOR', 6.2, 0.55, halfBeam(t) + 0.03, deckAt(t) - 0.7, lz, Math.PI / 2 - yaw);
    name('KESTREL SURVEYOR', 6.2, 0.55, -(halfBeam(t) + 0.03), deckAt(t) - 0.7, lz, -Math.PI / 2 + yaw);
    name('KESTREL SURVEYOR', 5.6, 0.5, 0, deckAt(1) - 0.7, L / 2 + 0.03, 0);
    name('KESTREL HARBOR', 3.6, 0.36, 0, deckAt(1) - 1.25, L / 2 + 0.03, 0);
  }
}

/** a white painted name (letters only) */
function signFor(text: string, w: number, h: number): THREE.Mesh {
  const px = 64;
  const c = document.createElement('canvas');
  c.width = Math.min(2048, Math.round((w / h) * px));
  c.height = px;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f2ee';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${Math.round(px * 0.8)}px 'Inter', 'Segoe UI', Arial, sans-serif`;
  const tw = g.measureText(text).width;
  if (tw > c.width * 0.98) g.font = `700 ${Math.round((px * 0.8 * c.width * 0.98) / tw)}px 'Inter', 'Segoe UI', Arial, sans-serif`;
  g.fillText(text, c.width / 2, px / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.5, metalness: 0.1 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.name = 'vessel-name';
  return m;
}
