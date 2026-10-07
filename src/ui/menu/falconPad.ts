// Pad 3: a Falcon launch pad along the coast from Pad 1, and SpaceX's two
// landing zones a couple of kilometres down the coast where Falcon Heavy's
// side boosters come home.
//
// The pad: a concrete deck over a flame trench that turns the exhaust out to
// sea, the transporter-erector (the "strongback" lattice that carries the
// rocket out horizontally, raises it, and holds it with its clamps and
// umbilicals until it tilts back at liftoff), the fixed service tower with its
// crew access arm, three lightning masts on their catenary wires, water
// towers for the sound-suppression deluge and floodlights.
//
// The landing zones: two 86 m concrete circles, each painted with its ring and
// the big "X" the boosters aim for, with their own lights and a camera mast.

import * as THREE from 'three';
import { Bars, Cyls, prng, type PadMats } from './starbasePad';

export const PAD3 = {
  x: 900,
  z: 10,
  /** the deck's height, and where the rocket's engines stand (on the hold-down clamps) */
  deck: 4,
  table: 8.5,
  /** the two landing zones (site frame), each 86 m across */
  lz: [
    { x: 2400, z: 700, name: 'LZ-1' },
    { x: 2400, z: 1000, name: 'LZ-2' },
  ],
  lzR: 43,
};

export interface Pad3 {
  group: THREE.Group;
  /** the strongback: tilts back (rotation.x) at liftoff */
  te: THREE.Group;
  lamps: THREE.Mesh[];
  exhaust: { trench: THREE.Vector3; dir: THREE.Vector3; mount: THREE.Vector3; ring: number };
}

function lzTexture(name: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#bdbab3';
  g.fillRect(0, 0, 1024, 1024);
  // weathering: slabs, scorch at the middle
  const r = prng(name.length * 77);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '90,86,80' : '230,226,220'},${r() * 0.06})`;
    g.fillRect(r() * 1024, r() * 1024, 4 + r() * 60, 4 + r() * 30);
  }
  const sc = g.createRadialGradient(512, 512, 0, 512, 512, 300);
  sc.addColorStop(0, 'rgba(30,26,22,0.55)');
  sc.addColorStop(1, 'rgba(30,26,22,0)');
  g.fillStyle = sc;
  g.fillRect(0, 0, 1024, 1024);
  // the ring and the X
  g.strokeStyle = '#f2f2f0';
  g.lineWidth = 34;
  g.beginPath();
  g.arc(512, 512, 330, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 60;
  g.beginPath();
  g.moveTo(330, 330);
  g.lineTo(694, 694);
  g.moveTo(694, 330);
  g.lineTo(330, 694);
  g.stroke();
  g.fillStyle = '#1a1a1c';
  g.font = 'bold 54px Arial';
  g.textAlign = 'center';
  g.fillText(name, 512, 960);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildPad3(m: PadMats): Pad3 {
  const root = new THREE.Group();
  const P = PAD3;
  const lamps: THREE.Mesh[] = [];
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7, 5), toneMapped: false });
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 0.3), toneMapped: false });
  // ---- the pad: deck, trench, hardstand
  const pad = new THREE.Group();
  pad.position.set(P.x, 0, P.z);
  root.add(pad);
  const deckTex = m.concreteTop.clone();
  deckTex.needsUpdate = true;
  deckTex.wrapS = deckTex.wrapT = THREE.RepeatWrapping;
  deckTex.repeat.set(6, 6);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(140, P.deck, 120), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.95 }));
  deck.position.set(0, P.deck / 2 - 0.02, 20);
  deck.receiveShadow = true;
  pad.add(deck);
  // the flame trench, open toward the sea (-z), with its steel diverter
  const trench = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 60), new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 1 }));
  trench.position.set(0, P.deck + 0.05, -25);
  pad.add(trench);
  const div = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 13, 24, 1, true, Math.PI, Math.PI / 2), m.darkSteel);
  div.rotation.z = Math.PI / 2;
  div.position.set(0, P.deck - 2, -4);
  pad.add(div);
  // the hold-down base: the TE's launch mount with clamps round the three cores
  const B = new Bars();
  B.box(0, P.deck + 2.2, 0, 15, 1.2, 7);
  for (const x of [-6, 0, 6]) B.box(x, P.deck + 3.4, 0, 2.2, 1.2, 2.2);
  pad.add(B.build(m.darkSteel));
  // ---- the transporter-erector: a lattice strongback alongside the rocket, hinged at its base
  const te = new THREE.Group();
  te.position.set(0, P.deck + 3, 5.5);
  const T = new Bars();
  const H = 66;
  for (const x of [-2.2, 2.2]) for (const z of [0, 2.4]) T.line(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, H, z), 0.35);
  for (let y = 0; y < H; y += 3) {
    T.line(new THREE.Vector3(-2.2, y, 0), new THREE.Vector3(2.2, y, 0), 0.2);
    T.line(new THREE.Vector3(-2.2, y, 2.4), new THREE.Vector3(2.2, y, 2.4), 0.2);
    T.line(new THREE.Vector3(-2.2, y, 0), new THREE.Vector3(2.2, y + 3, 0), 0.14);
    T.line(new THREE.Vector3(2.2, y, 2.4), new THREE.Vector3(-2.2, y + 3, 2.4), 0.14);
    T.line(new THREE.Vector3(-2.2, y, 0), new THREE.Vector3(-2.2, y + 3, 2.4), 0.14);
    T.line(new THREE.Vector3(2.2, y, 2.4), new THREE.Vector3(2.2, y + 3, 0), 0.14);
  }
  // the umbilical arms reaching to the second stage and the cores
  for (const y of [12, 30, 52, 60]) T.box(0, y, -1.6, 1.2, 0.6, 3.4);
  te.add(T.build(new THREE.MeshStandardMaterial({ color: '#b9bcbf', roughness: 0.6, metalness: 0.6 })));
  pad.add(te);
  // ---- the fixed service structure: a square steel tower with the crew access arm
  const F = new Bars();
  const fx = 0, fz = 22, fh = 105, fw = 9;
  for (const [x, z] of [[-fw / 2, -fw / 2], [fw / 2, -fw / 2], [-fw / 2, fw / 2], [fw / 2, fw / 2]]) F.line(new THREE.Vector3(fx + x, P.deck, fz + z), new THREE.Vector3(fx + x, P.deck + fh, fz + z), 0.6);
  for (let y = P.deck; y < P.deck + fh; y += 6) {
    F.box(fx, y, fz, fw + 0.6, 0.35, fw + 0.6);
    for (const s of [-1, 1]) {
      F.line(new THREE.Vector3(fx - fw / 2, y, fz + (s * fw) / 2), new THREE.Vector3(fx + fw / 2, y + 6, fz + (s * fw) / 2), 0.18);
      F.line(new THREE.Vector3(fx + (s * fw) / 2, y, fz - fw / 2), new THREE.Vector3(fx + (s * fw) / 2, y + 6, fz + fw / 2), 0.18);
    }
  }
  // the crew access arm (swung away)
  F.box(fx - 8, P.deck + 70, fz - 2, 12, 2.4, 2.4);
  // the stairwell and lift shaft
  F.box(fx + fw / 2 + 1.5, P.deck + fh / 2, fz, 2.6, fh, 2.6);
  pad.add(F.build(new THREE.MeshStandardMaterial({ color: '#7d8186', roughness: 0.55, metalness: 0.7 })));
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), red);
  beacon.position.set(fx, P.deck + fh + 2, fz);
  pad.add(beacon);
  lamps.push(beacon);
  // ---- lightning masts with their catenary wires
  const C = new Cyls(12);
  const masts: [number, number][] = [[-50, -30], [50, -30], [0, 65]];
  for (const [x, z] of masts) {
    C.up(x, P.deck, z, 0.9, 110);
    C.up(x, P.deck + 110, z, 0.3, 12);
  }
  pad.add(C.build(m.steel));
  const wires: number[] = [];
  for (let i = 0; i < masts.length; i++) {
    const a = masts[i], b = masts[(i + 1) % masts.length];
    for (let k = 0; k < 16; k++) {
      const t0 = k / 16, t1 = (k + 1) / 16;
      const sag = (t: number) => P.deck + 120 - Math.sin(t * Math.PI) * 14;
      wires.push(a[0] + (b[0] - a[0]) * t0, sag(t0), a[1] + (b[1] - a[1]) * t0, a[0] + (b[0] - a[0]) * t1, sag(t1), a[1] + (b[1] - a[1]) * t1);
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  pad.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2a2a2a' })));
  // ---- the deluge water tower and the floodlights
  const W = new Cyls(28);
  W.up(55, P.deck, 45, 7, 26);
  for (let i = 0; i < 6; i++) W.line(new THREE.Vector3(55 + Math.cos(i) * 6, 0, 45 + Math.sin(i) * 6), new THREE.Vector3(55 + Math.cos(i) * 6, P.deck + 1, 45 + Math.sin(i) * 6), 0.4);
  pad.add(W.build(m.paint));
  const L = new Bars();
  for (const [x, z] of [[-60, 40], [60, -40], [-60, -40], [65, 60]]) {
    L.box(x, P.deck + 15, z, 0.7, 30, 0.7);
    L.box(x, P.deck + 30.4, z, 5, 0.4, 1);
    const l = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1, 0.25), lampMat);
    l.position.set(x, P.deck + 29.7, z + (z < 0 ? 0.6 : -0.6));
    pad.add(l);
  }
  pad.add(L.build(m.steel));
  // ---- the landing zones
  for (const lz of P.lz) {
    const g = new THREE.Group();
    g.position.set(lz.x, 0.25, lz.z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(P.lzR, P.lzR + 1.5, 0.5, 96), new THREE.MeshStandardMaterial({ map: lzTexture(lz.name), roughness: 0.92 }));
    // (the texture on the top cap only)
    (disc.material as THREE.MeshStandardMaterial).map!.center.set(0.5, 0.5);
    disc.receiveShadow = true;
    g.add(disc);
    // the apron round it, a service road, camera and light masts
    const ring = new THREE.Mesh(new THREE.RingGeometry(P.lzR + 1.5, P.lzR + 14, 96), new THREE.MeshStandardMaterial({ color: '#9b978e', roughness: 1 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    g.add(ring);
    const LM = new Bars();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      LM.box(Math.cos(a) * (P.lzR + 22), 9, Math.sin(a) * (P.lzR + 22), 0.5, 18, 0.5);
      const l = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 0.6), lampMat);
      l.position.set(Math.cos(a) * (P.lzR + 21), 18, Math.sin(a) * (P.lzR + 21));
      g.add(l);
    }
    g.add(LM.build(m.steel));
    root.add(g);
  }
  // a road from the pad to the landing zones
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 1), new THREE.MeshStandardMaterial({ color: '#4a4844', roughness: 1 }));
  const a = new THREE.Vector3(P.x + 60, 0.15, P.z + 80), b = new THREE.Vector3(P.lz[0].x, 0.15, P.lz[0].z);
  road.scale.y = a.distanceTo(b);
  road.rotation.x = -Math.PI / 2;
  road.rotation.z = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI;
  road.position.copy(a).add(b).multiplyScalar(0.5);
  root.add(road);
  void prng;
  return {
    group: root,
    te,
    lamps,
    exhaust: { trench: new THREE.Vector3(P.x, P.deck + 1, P.z - 55), dir: new THREE.Vector3(0, 0, -1), mount: new THREE.Vector3(P.x, P.table, P.z), ring: 10 },
  };
}

/** the height of Pad 3's deck at a site point (or -Infinity off it), for cameras */
export function pad3Height(x: number, z: number): number {
  const lx = x - PAD3.x, lz = z - PAD3.z;
  if (Math.abs(lx) < 70 && lz > -40 && lz < 80) return PAD3.deck;
  return -Infinity;
}
