// The International Space Station, Crew Dragon and the drone ship, built to
// their real proportions.
//
// The ISS frame: +X forward along the velocity (ram), +Y up (zenith), +Z
// starboard. The pressurised modules run fore and aft: Harmony with the
// forward docking port (PMA-2 and IDA-2, where Crew Dragon docks), Destiny,
// Unity, Zarya and Zvezda at the back; Columbus to starboard and Kibo with its
// exposed facility to port, Tranquility and the Cupola off Unity, Nauka and
// Poisk on the Russian segment, and a Soyuz and a Progress docked. Across the
// top runs the 109 m integrated truss with its two rotary joints: eight solar
// array wings 35 m long (with the newer roll-out arrays on six of them), the
// big white radiators, the arrays' own radiators and Canadarm2.
//
// Crew Dragon: the capsule with its heat shield, four SuperDraco pods, windows
// and the nosecone that swings open over the docking adapter; the trunk with
// its solar cells and fins. The drone ship A Shortfall of Gravitas: a 91 m
// barge with the landing circle on its deck and blast walls at the stern.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** merge geometries into one mesh (positions, normals and uvs only) */
function mesh(geos: THREE.BufferGeometry[], mat: THREE.Material): THREE.Mesh {
  const list = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  const m = new THREE.Mesh(mergeGeometries(list, false)!, mat);
  m.frustumCulled = false;
  return m;
}
function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  g.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(1, 1, 1)));
  return g;
}
const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => place(new THREE.BoxGeometry(sx, sy, sz), x, y, z, rx, ry, rz);
/** a cylinder along an axis ('x' | 'y' | 'z'), centred at (x, y, z) */
function cylA(axis: 'x' | 'y' | 'z', r: number, len: number, x: number, y: number, z: number, seg = 40, r2 = r, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1, open);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
function lathe(pts: [number, number][], seg = 48): THREE.BufferGeometry {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

// ---------------------------------------------------------------- materials
let mats: Record<string, THREE.Material> | null = null;
function M(): Record<string, THREE.Material> {
  if (mats) return mats;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  // the modules' micrometeoroid shields: off-white panels in rings, with seams and the odd handrail
  const shield = canvasTex(512, 512, (g) => {
    g.fillStyle = '#e9e6de';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,250' : '190,185,172'},${0.05 + Math.random() * 0.08})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 90, 10 + Math.random() * 50);
    }
    g.strokeStyle = 'rgba(90,85,75,0.45)';
    g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo(0, i * 64);
      g.lineTo(512, i * 64);
      g.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j < 8; j++) {
        const x = (i * 85 + (j % 2) * 42) % 512;
        g.beginPath();
        g.moveTo(x, j * 64);
        g.lineTo(x, j * 64 + 64);
        g.stroke();
      }
    }
    // handrails: little yellow-gold bars
    g.fillStyle = 'rgba(200,160,60,0.8)';
    for (let i = 0; i < 18; i++) g.fillRect(Math.random() * 500, Math.random() * 500, 26, 4);
  }, [2, 2]);
  // Russian modules: white with grey-green blanket patches
  const ru = canvasTex(512, 512, (g) => {
    g.fillStyle = '#dcdcd2';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,128,112' : '238,236,228'},${0.25 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 120, 30 + Math.random() * 90);
    }
    g.strokeStyle = 'rgba(60,60,55,0.4)';
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo(0, i * 64);
      g.lineTo(512, i * 64);
      g.stroke();
    }
  }, [2, 2]);
  // a solar array blanket: cells in a fine grid, dark copper-gold, with the white seams between panels
  const cells = canvasTex(256, 1024, (g) => {
    g.fillStyle = '#5a3a1c';
    g.fillRect(0, 0, 256, 1024);
    for (let y = 0; y < 1024; y += 8) {
      for (let x = 0; x < 256; x += 8) {
        const v = 70 + Math.random() * 30;
        g.fillStyle = `rgb(${v + 40},${v},${v * 0.45})`;
        g.fillRect(x + 1, y + 1, 6, 6);
      }
    }
    g.fillStyle = 'rgba(230,220,200,0.85)';
    for (let y = 0; y < 1024; y += 56) g.fillRect(0, y, 256, 2);
  });
  // the roll-out arrays: dark blue-black cells
  const icells = canvasTex(128, 512, (g) => {
    g.fillStyle = '#121a2c';
    g.fillRect(0, 0, 128, 512);
    for (let y = 0; y < 512; y += 6) {
      for (let x = 0; x < 128; x += 6) {
        const v = 26 + Math.random() * 18;
        g.fillStyle = `rgb(${v},${v + 6},${v + 22})`;
        g.fillRect(x + 1, y + 1, 4, 4);
      }
    }
  });
  // radiator panels: white with the coolant lines showing faintly
  const rad = canvasTex(128, 512, (g) => {
    g.fillStyle = '#f4f4f2';
    g.fillRect(0, 0, 128, 512);
    g.strokeStyle = 'rgba(150,150,150,0.35)';
    for (let x = 6; x < 128; x += 12) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 512);
      g.stroke();
    }
    g.strokeStyle = 'rgba(110,110,110,0.6)';
    g.lineWidth = 2;
    for (let y = 0; y < 512; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y);
      g.stroke();
    }
  });
  // the drone ship's deck: dark steel, the landing circle and the X
  const deck = canvasTex(1024, 1024, (g) => {
    g.fillStyle = '#3a3c3e';
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,20,20' : '90,90,92'},${0.06 + Math.random() * 0.1})`;
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 6 + Math.random() * 40, 3 + Math.random() * 20);
    }
    // scorch in the middle
    const gr = g.createRadialGradient(512, 512, 20, 512, 512, 280);
    gr.addColorStop(0, 'rgba(10,8,6,0.75)');
    gr.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(240,240,240,0.9)';
    g.lineWidth = 26;
    g.beginPath();
    g.arc(512, 512, 330, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 60;
    g.beginPath();
    g.moveTo(360, 360);
    g.lineTo(664, 664);
    g.moveTo(664, 360);
    g.lineTo(360, 664);
    g.stroke();
    // yellow safety edging
    g.fillStyle = '#d8b229';
    g.fillRect(0, 0, 1024, 14);
    g.fillRect(0, 1010, 1024, 14);
  });
  const hullTex = canvasTex(1024, 128, (g) => {
    g.fillStyle = '#1e2124';
    g.fillRect(0, 0, 1024, 128);
    g.fillStyle = '#e8e8e8';
    g.font = 'bold 52px Arial';
    g.fillText('A SHORTFALL OF GRAVITAS', 120, 78);
  });
  mats = {
    shield: std({ color: '#ffffff', map: shield, roughness: 0.75, metalness: 0.05 }),
    ru: std({ color: '#ffffff', map: ru, roughness: 0.8 }),
    truss: std({ color: '#b8b6ae', roughness: 0.5, metalness: 0.6 }),
    box: std({ color: '#e2dfd6', roughness: 0.7 }),
    cells: std({ color: '#ffffff', map: cells, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide }),
    icells: std({ color: '#ffffff', map: icells, roughness: 0.3, metalness: 0.35, side: THREE.DoubleSide }),
    back: std({ color: '#cfc7b4', roughness: 0.8, side: THREE.DoubleSide }),
    rad: std({ color: '#ffffff', map: rad, roughness: 0.55, side: THREE.DoubleSide }),
    mast: std({ color: '#8a8478', roughness: 0.5, metalness: 0.6 }),
    gold: std({ color: '#c9a043', roughness: 0.35, metalness: 0.9 }),
    dark: std({ color: '#26282b', roughness: 0.6, metalness: 0.3 }),
    window: std({ color: '#0a0e14', roughness: 0.08, metalness: 0.6 }),
    ring: std({ color: '#9da2a8', roughness: 0.35, metalness: 0.85 }),
    green: std({ color: '#6c7560', roughness: 0.8 }),
    soyuzArr: std({ color: '#1b2540', roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide }),
    dragon: std({ color: '#f2f2f0', roughness: 0.38, metalness: 0.05 }),
    heat: std({ color: '#3a2a1e', roughness: 0.9 }),
    trunkCells: std({ color: '#ffffff', map: icells, roughness: 0.3, metalness: 0.35 }),
    black: std({ color: '#151517', roughness: 0.5, metalness: 0.3 }),
    nozzle: std({ color: '#3a3533', roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }),
    deck: std({ color: '#ffffff', map: deck, roughness: 0.85, metalness: 0.2 }),
    hull: std({ color: '#ffffff', map: hullTex, roughness: 0.7, metalness: 0.3 }),
    hullDark: std({ color: '#25282b', roughness: 0.75, metalness: 0.3 }),
    yellow: std({ color: '#d8b229', roughness: 0.6 }),
  };
  return mats;
}

// ---------------------------------------------------------------- the ISS
export interface IssRig {
  group: THREE.Group;
  /** the outboard truss on each side (rotates about Z, the solar alpha rotary joints) */
  sarj: THREE.Group[];
  /** the forward docking port (IDA-2) on Harmony, in the station's frame */
  port: THREE.Vector3;
}

/** a module: a cylinder along an axis with end cones, in shield (or Russian) panels */
function module(geo: THREE.BufferGeometry[], axis: 'x' | 'y' | 'z', r: number, len: number, x: number, y: number, z: number): void {
  geo.push(cylA(axis, r, len, x, y, z, 48));
  // end cones (the bulkheads)
  const d = len / 2 + 0.35;
  const [ax, ay, az] = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
  geo.push(cylA(axis, r, 0.7, x + ax * d, y + ay * d, z + az * d, 48, r * 0.7));
  geo.push(cylA(axis, r * 0.7, 0.7, x - ax * d, y - ay * d, z - az * d, 48, r));
}

/** one solar array wing (two blankets either side of the mast), extending along +Y from its base, facing ±X */
function wing(cells: THREE.BufferGeometry[], back: THREE.BufferGeometry[], mast: THREE.BufferGeometry[], z: number, dir: number, y0: number): void {
  const L = 34.5, W = 4.6, gap = 0.9;
  for (const s of [-1, 1]) {
    const b = new THREE.PlaneGeometry(W, L);
    b.rotateY(Math.PI / 2);
    b.translate(0.02, dir * (y0 + 1.8 + L / 2), z + s * (gap / 2 + W / 2));
    cells.push(b);
    const bb = new THREE.PlaneGeometry(W, L);
    bb.rotateY(-Math.PI / 2);
    bb.translate(-0.02, dir * (y0 + 1.8 + L / 2), z + s * (gap / 2 + W / 2));
    back.push(bb);
    // the blanket boxes at both ends
    mast.push(box(0.5, 0.5, W, 0, dir * (y0 + 1.6), z + s * (gap / 2 + W / 2)));
    mast.push(box(0.4, 0.4, W, 0, dir * (y0 + 1.8 + L + 0.2), z + s * (gap / 2 + W / 2)));
  }
  // the mast: a lattice in the gap (shown as a slim column with battens)
  mast.push(box(0.35, L + 0.6, 0.35, 0, dir * (y0 + 1.8 + L / 2), z));
  for (let k = 0; k <= 20; k++) mast.push(box(0.6, 0.06, 0.06, 0, dir * (y0 + 1.8 + (k * L) / 20), z));
  // the mast canister and the beta gimbal
  mast.push(box(1.0, 1.6, 1.0, 0, dir * (y0 + 0.8), z));
}

/** a roll-out array (iROSA) on a wing: narrower, angled out from the old blanket */
function irosa(geo: THREE.BufferGeometry[], frame: THREE.BufferGeometry[], z: number, dir: number, y0: number): void {
  const L = 19, W = 6;
  const p = new THREE.PlaneGeometry(W, L);
  p.rotateY(Math.PI / 2);
  p.rotateZ(dir * 0.12);
  p.translate(0.9, dir * (y0 + 3 + L / 2), z);
  geo.push(p);
  frame.push(box(0.8, 0.4, W + 0.4, 0.5, dir * (y0 + 2.5), z), box(0.3, L, 0.12, 0.8, dir * (y0 + 3 + L / 2), z - W / 2), box(0.3, L, 0.12, 0.8, dir * (y0 + 3 + L / 2), z + W / 2));
}

/** a box truss section along Z from z0 to z1 (centre at x, y; w across X, h across Y) */
function truss(geo: THREE.BufferGeometry[], z0: number, z1: number, x: number, y: number, w: number, h: number): void {
  const L = z1 - z0;
  const t = 0.16;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) geo.push(box(t, t, L, x + (sx * w) / 2, y + (sy * h) / 2, (z0 + z1) / 2));
  const bays = Math.max(1, Math.round(L / 2.4));
  const bl = L / bays;
  for (let i = 0; i <= bays; i++) {
    const z = z0 + i * bl;
    geo.push(box(w, t, t, x, y + h / 2, z), box(w, t, t, x, y - h / 2, z), box(t, h, t, x + w / 2, y, z), box(t, h, t, x - w / 2, y, z));
    if (i === bays) break;
    // diagonals on the four faces
    const zc = z + bl / 2;
    const dl = Math.hypot(bl, h);
    const ang = Math.atan2(h, bl) * (i % 2 ? 1 : -1);
    geo.push(box(t * 0.8, t * 0.8, dl, x + w / 2, y, zc, ang, 0, 0), box(t * 0.8, t * 0.8, dl, x - w / 2, y, zc, -ang, 0, 0));
    const dw = Math.hypot(bl, w);
    const aw = Math.atan2(w, bl) * (i % 2 ? 1 : -1);
    geo.push(box(t * 0.8, t * 0.8, dw, x, y + h / 2, zc, 0, aw, 0), box(t * 0.8, t * 0.8, dw, x, y - h / 2, zc, 0, -aw, 0));
  }
}

/** a Soyuz (or, with cargo, a Progress) docked along an axis: its tip at the port, body pointing away */
function soyuz(g: THREE.Group, progress: boolean): void {
  const m = M();
  const body: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  // (built along +Y from the port at y = 0)
  body.push(place(new THREE.SphereGeometry(1.15, 32, 20), 0, 1.4, 0));
  if (progress) body.push(lathe([[0.4, 0], [1.1, 0.6], [1.35, 1.6], [1.35, 2.8], [0.6, 3.2]], 32).translate(0, 0.0, 0));
  body.push(lathe([[1.1, 0], [1.3, 0.4], [1.08, 2.0], [0.6, 2.2]], 32).translate(0, 2.5, 0).rotateX(Math.PI).translate(0, 7.0, 0));
  dark.push(cylA('y', 1.36, 2.6, 0, 6.3, 0, 32), cylA('y', 1.45, 0.4, 0, 7.6, 0, 32));
  body.push(place(new THREE.TorusGeometry(1.36, 0.06, 6, 32), 0, 5.2, 0, Math.PI / 2));
  g.add(mesh(body, progress ? m.green : m.green), mesh(dark, m.dark));
  // its two solar arrays (four panels each)
  const arr: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) arr.push(box(1.0, 0.04, 1.1, s * (1.8 + k * 1.05), 6.4, 0));
  g.add(mesh(arr, m.soyuzArr));
  g.add(mesh([place(new THREE.TorusGeometry(0.55, 0.12, 8, 24), 0, 0.1, 0, Math.PI / 2)], m.ring));
}

export function buildISS(): IssRig {
  const m = M();
  const group = new THREE.Group();
  const usos: THREE.BufferGeometry[] = [];
  const ru: THREE.BufferGeometry[] = [];
  const ring: THREE.BufferGeometry[] = [];
  const gold: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const win: THREE.BufferGeometry[] = [];
  const boxes: THREE.BufferGeometry[] = [];
  // ---- the US segment, front to back along X
  module(usos, 'x', 2.2, 7.2, 16, 0, 0); // Harmony
  // PMA-2 and IDA-2: the forward port
  ring.push(cylA('x', 1.45, 1.6, 20.9, 0, 0, 40, 0.95));
  ring.push(cylA('x', 0.95, 0.7, 22.0, 0, 0, 40));
  ring.push(place(new THREE.TorusGeometry(0.88, 0.1, 10, 40), 22.4, 0, 0, 0, Math.PI / 2));
  // PMA-3 and IDA-3 on Harmony's zenith
  ring.push(cylA('y', 1.45, 1.6, 16, 3.4, 0, 40, 0.95), cylA('y', 0.95, 0.6, 16, 4.5, 0, 40));
  module(usos, 'x', 2.15, 8.5, 8.0, 0, 0); // Destiny
  win.push(place(new THREE.CircleGeometry(0.25, 20), 8.0, -2.17, 0, Math.PI / 2)); // the nadir science window
  module(usos, 'x', 2.3, 5.2, 1.4, 0, 0); // Unity
  module(usos, 'z', 2.2, 6.8, 16, 0, 5.8); // Columbus (starboard)
  module(usos, 'z', 2.2, 11.2, 16, 0, -8.2); // Kibo pressurised module (port)
  module(usos, 'y', 2.2, 4.0, 14.5, 4.4, -8.6); // Kibo's logistics module on top
  // Kibo's exposed facility: a platform off the end with experiment boxes, and its arm
  boxes.push(box(5.0, 1.2, 5.6, 16, -0.4, -16.8));
  for (let i = 0; i < 6; i++) boxes.push(box(1.6, 1.0 + (i % 3) * 0.3, 1.4, 14.4 + (i % 2) * 3.2, 0.7, -15.0 - Math.floor(i / 2) * 1.9));
  dark.push(box(0.25, 0.25, 9.0, 16, 2.6, -11.5, 0.3, 0, 0));
  module(usos, 'z', 2.2, 6.7, 1.4, 0, -6.4); // Tranquility (port of Unity)
  // the Cupola under Tranquility: a dome of windows
  ring.push(cylA('y', 1.5, 0.8, 1.4, -2.9, -6.4, 7, 1.5));
  win.push(cylA('y', 1.4, 0.75, 1.4, -2.9, -6.4, 7, 1.4, true));
  win.push(place(new THREE.CircleGeometry(0.55, 24), 1.4, -3.32, -6.4, Math.PI / 2));
  module(usos, 'x', 2.2, 6.4, 1.4, 0, -11.0); // Leonardo (PMM)
  usos.push(place(new THREE.SphereGeometry(1.6, 24, 16), -1.8, 0, -6.6)); // BEAM
  module(usos, 'z', 1.9, 4.0, 1.4, 0, 4.5); // Quest airlock
  ring.push(cylA('z', 1.0, 1.4, 1.4, 0, 7.1, 32));
  ring.push(cylA('x', 1.4, 2.4, -2.4, 0, 0, 40, 1.0)); // PMA-1
  // ---- the Russian segment
  module(ru, 'x', 2.05, 12.6, -10.1, 0, 0); // Zarya
  module(ru, 'x', 2.05, 4.3, -19.6, 0, 0); // Zvezda's transfer and working sections
  module(ru, 'x', 2.9, 6.5, -25.0, 0, 0);
  ring.push(cylA('x', 1.0, 1.6, -29.3, 0, 0, 32)); // Zvezda's aft port
  module(ru, 'y', 2.2, 11.0, -19.6, -8.0, 0); // Nauka, nadir
  ru.push(place(new THREE.SphereGeometry(1.6, 24, 16), -19.6, -14.8, 0)); // Prichal
  module(ru, 'y', 1.3, 3.8, -19.6, 3.6, 0); // Poisk, zenith
  module(ru, 'y', 1.2, 5.0, -10.1, -4.6, 0); // Rassvet, nadir of Zarya
  // Zvezda's and Zarya's own solar arrays
  const ruArr: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) ruArr.push(box(2.0, 0.05, 1.9, -24.5, 0.4, s * (3.6 + k * 2.0)));
    dark.push(box(0.15, 0.15, 12.4, -24.5, 0.4, s * 8.6));
    for (let k = 0; k < 4; k++) ruArr.push(box(3.2, 0.05, 2.4, -12.5, 0, s * (3.4 + k * 2.5)));
  }
  group.add(mesh(ruArr, m.soyuzArr));
  // ---- the integrated truss, across the top over Destiny
  const TX = 5.2, TY = 4.6;
  const tr: THREE.BufferGeometry[] = [];
  truss(tr, -21, 21, TX, TY, 4.4, 3.2);
  // the S0 truss's attachment struts down to Destiny
  for (const s of [-1, 1]) for (const z of [-2, 2]) tr.push(box(0.25, 3.0, 0.25, TX + s * 1.6, 2.4, z, 0, 0, s * 0.3));
  // equipment on the inner truss (boxes in MLI)
  for (let i = 0; i < 14; i++) {
    const z = -19 + i * 2.9;
    boxes.push(box(1.6, 1.2, 1.6, TX - 1.2 + (i % 2) * 2.4, TY + 1.9, z));
  }
  boxes.push(box(3.8, 2.6, 6, TX, TY, 0));
  // the mobile base and Canadarm2 on the truss's front face
  dark.push(box(2.6, 2.4, 3.4, TX + 3.1, TY, 6.5));
  const arm: THREE.BufferGeometry[] = [];
  arm.push(cylA('y', 0.22, 2.0, TX + 4.2, TY + 1.6, 6.5, 16));
  arm.push(place(new THREE.CylinderGeometry(0.2, 0.2, 7.6, 16), 0, 0, 0, 0, 0, Math.PI / 2 - 0.5).translate(TX + 7.4, TY + 4.3, 6.5));
  arm.push(place(new THREE.CylinderGeometry(0.2, 0.2, 7.6, 16), 0, 0, 0, 0, 0, -0.9).translate(TX + 12.4, TY + 4.8, 6.5));
  for (const p of [V(TX + 4.2, TY + 2.7, 6.5), V(TX + 10.6, TY + 6.2, 6.5), V(TX + 15.1, TY + 2.4, 6.5)]) arm.push(place(new THREE.SphereGeometry(0.42, 16, 12), p.x, p.y, p.z));
  group.add(mesh(arm, m.box));
  // the big radiators on S1 and P1: three panels a side, hanging down and aft
  const rad: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      // (flat panels reaching aft over the modules, 22.5 m long)
      const q = new THREE.PlaneGeometry(22.5, 3.4);
      q.rotateX(-Math.PI / 2);
      q.rotateZ(0);
      q.translate(-11.25 + TX - 2.4, TY - 1.6 - k * 0.1, s * (10.5 + k * 3.7));
      rad.push(q);
      tr.push(box(1.0, 0.8, 0.6, TX - 2.4, TY - 1.4, s * (10.5 + k * 3.7)));
    }
  }
  group.add(mesh(rad, m.rad));
  // ---- the outboard truss on each side, on its rotary joint, with the arrays
  const sarj: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const og = new THREE.Group();
    og.position.set(TX, TY, s * 21.6);
    const otr: THREE.BufferGeometry[] = [];
    // S3/P3 (to the joint), S4/P4, S5/P5, S6/P6 (in the outboard group's frame: z out from the joint)
    truss(otr, 0, s * 11, 0, 0, 4.0, 3.0);
    otr.push(place(new THREE.TorusGeometry(2.1, 0.28, 10, 40), 0, 0, s * 11.6));
    otr.push(cylA('z', 2.0, 0.9, 0, 0, s * 11.6, 40));
    truss(otr, s * 12.2, s * 33, 0, 0, 3.6, 2.8);
    // the arrays: on S4/P4 near the joint and S6/P6 at the end, each with a wing up and a wing down
    const cells: THREE.BufferGeometry[] = [];
    const back: THREE.BufferGeometry[] = [];
    const mast: THREE.BufferGeometry[] = [];
    const ic: THREE.BufferGeometry[] = [];
    const icf: THREE.BufferGeometry[] = [];
    for (const [zc, roll] of [[s * 16.0, true], [s * 29.0, true]] as [number, boolean][]) {
      wing(cells, back, mast, zc, 1, 1.4);
      wing(cells, back, mast, zc, -1, 1.4);
      if (roll) {
        irosa(ic, icf, zc, 1, 1.4);
        if (Math.abs(zc) < 20 || s > 0) irosa(ic, icf, zc, -1, 1.4);
      }
      // the arrays' own radiator (PVR), out to the side
      const pv = new THREE.PlaneGeometry(13, 3.4);
      pv.rotateX(-Math.PI / 2);
      pv.translate(-8.5, -0.6, zc + s * 6.6);
      otr.push(box(1.2, 0.8, 1.2, -1.6, -0.6, zc + s * 6.6));
      og.add(mesh([pv], m.rad));
    }
    og.add(mesh(cells, m.cells), mesh(back, m.back), mesh(mast, m.mast), mesh(ic, m.icells), mesh(icf, m.mast));
    og.add(mesh(otr, m.truss));
    group.add(og);
    sarj.push(og);
  }
  group.add(mesh(tr, m.truss));
  // ---- visiting ships: a Soyuz under Rassvet, a Progress at Zvezda's aft port
  const sz = new THREE.Group();
  soyuz(sz, false);
  sz.position.set(-10.1, -7.2, 0);
  sz.rotation.x = Math.PI;
  group.add(sz);
  const pg = new THREE.Group();
  soyuz(pg, true);
  pg.position.set(-30.1, 0, 0);
  pg.rotation.z = Math.PI / 2;
  group.add(pg);
  // ---- the meshes
  group.add(mesh(usos, m.shield), mesh(ru, m.ru), mesh(ring, m.ring), mesh(boxes, m.box), mesh(dark, m.dark), mesh(win, m.window));
  if (gold.length) group.add(mesh(gold, m.gold));
  return { group, sarj, port: V(22.5, 0, 0) };
}

/** turn the arrays to the Sun: `sun` is the Sun's direction in the station's frame */
export function pointArrays(rig: IssRig, sun: THREE.Vector3): void {
  // the alpha joints turn the outboard truss about Z so the wings face the Sun's direction in the X-Y plane
  const a = Math.atan2(sun.y, sun.x);
  for (const g of rig.sarj) g.rotation.z = a;
}

// ---------------------------------------------------------------- Crew Dragon
export interface DragonRig {
  group: THREE.Group;
  capsule: THREE.Group;
  trunk: THREE.Group;
  /** the nosecone, hinged at its forward edge */
  nose: THREE.Group;
  /** the docking adapter's face (local, +Y along the capsule's axis) */
  dockAt: number;
  /** where the Draco thrusters are (for their puffs) */
  dracos: THREE.Vector3[];
}

export function buildDragon(): DragonRig {
  const m = M();
  const group = new THREE.Group();
  // the trunk, 3.7 m across and 2.8 m tall: half solar cells, half white radiator, four fins at the bottom
  const trunk = new THREE.Group();
  const tw: THREE.BufferGeometry[] = [];
  const tc: THREE.BufferGeometry[] = [];
  tw.push(new THREE.CylinderGeometry(1.85, 1.85, 2.8, 48, 1, true, Math.PI, Math.PI).translate(0, 1.4, 0));
  tc.push(new THREE.CylinderGeometry(1.86, 1.86, 2.8, 48, 1, true, 0, Math.PI).translate(0, 1.4, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    tw.push(place(new THREE.BoxGeometry(0.08, 1.4, 0.9), Math.cos(a) * 2.1, 0.7, Math.sin(a) * 2.1, 0, -a, 0));
  }
  trunk.add(mesh(tw, m.dragon), mesh(tc, m.trunkCells));
  group.add(trunk);
  // the capsule: the heat shield, the sloping wall up to the nose
  const capsule = new THREE.Group();
  capsule.position.y = 2.8;
  const wall: THREE.BufferGeometry[] = [lathe([[1.98, 0.12], [2.0, 0.3], [1.8, 1.2], [1.42, 2.6], [1.12, 3.4], [0.98, 3.65]], 64)];
  const shield = lathe([[0, -0.08], [1.4, 0.0], [1.95, 0.08], [2.0, 0.14]], 64);
  capsule.add(mesh(wall, m.dragon), mesh([shield], m.heat));
  // the docking adapter's ring under the nosecone
  capsule.add(mesh([cylA('y', 0.82, 0.35, 0, 3.8, 0, 40), place(new THREE.TorusGeometry(0.78, 0.07, 8, 40), 0, 3.98, 0, Math.PI / 2)], m.ring));
  // the SuperDraco pods (four, two engines each) and their black trim
  const blk: THREE.BufferGeometry[] = [];
  const noz: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const r = 1.62;
    blk.push(place(new THREE.BoxGeometry(0.5, 1.4, 0.95), Math.cos(a) * r, 1.4, Math.sin(a) * r, 0, -a, 0.28 * 0));
    for (const o of [-0.22, 0.22]) {
      const nx = Math.cos(a) * (r + 0.08) - Math.sin(a) * o, nz = Math.sin(a) * (r + 0.08) + Math.cos(a) * o;
      noz.push(place(new THREE.CylinderGeometry(0.08, 0.14, 0.32, 14, 1, true), nx, 0.62, nz));
    }
  }
  // the windows: four round ones and the hatch window
  const win: THREE.BufferGeometry[] = [];
  for (const a of [0.4, 1.2, 2.0, 2.8, 4.6]) {
    const p = new THREE.CircleGeometry(a === 4.6 ? 0.2 : 0.16, 20);
    const r = 1.62;
    const v = V(Math.cos(a) * r, 2.0, Math.sin(a) * r);
    p.lookAt(V(Math.cos(a), 0.35, Math.sin(a)));
    p.translate(v.x, v.y, v.z);
    win.push(p);
  }
  // a black band round the top of the wall (the trunk mates below, the nosecone above)
  blk.push(cylA('y', 1.0, 0.14, 0, 3.55, 0, 48, 0.99));
  capsule.add(mesh(blk, m.black), mesh(noz, m.nozzle), mesh(win, m.window));
  // the nosecone: a dome on a hinge at its forward edge (+X)
  const nose = new THREE.Group();
  nose.position.set(0.98, 3.65, 0);
  const cone = lathe([[0.99, 0], [0.92, 0.32], [0.7, 0.62], [0.36, 0.84], [0, 0.9]], 48).translate(-0.98, 0, 0);
  nose.add(mesh([cone], m.dragon));
  capsule.add(nose);
  group.add(capsule);
  // the Dracos: 16 small thrusters, round the top of the wall
  const dracos: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    dracos.push(V(Math.cos(a) * 1.25, 2.8 + 3.0, Math.sin(a) * 1.25));
  }
  return { group, capsule, trunk, nose, dockAt: 2.8 + 4.05, dracos };
}

/** open (k = 1) or close the nosecone */
export function openNose(d: DragonRig, k: number): void {
  d.nose.rotation.z = -k * 2.1;
}

// ---------------------------------------------------------------- the drone ship
export function buildDroneShip(): THREE.Group {
  const m = M();
  const g = new THREE.Group();
  // the barge: 91 m long (along Z), 52 m across with its wings; the deck stands 2.6 m over the water
  const L = 91, W = 52, D = 2.6;
  const deck = new THREE.PlaneGeometry(W, L);
  deck.rotateX(-Math.PI / 2);
  deck.translate(0, D, 0);
  g.add(mesh([deck], m.deck));
  const hull = new THREE.BoxGeometry(W - 0.2, 6, L - 0.2);
  hull.translate(0, D - 3.02, 0);
  g.add(mesh([hull], m.hullDark));
  // the name along the side
  const side = new THREE.PlaneGeometry(L * 0.7, L * 0.7 * (128 / 1024));
  side.rotateY(Math.PI / 2);
  side.translate(W / 2 + 0.05, D - 1.6, 0);
  g.add(mesh([side], m.hull));
  // blast walls and the equipment at the stern; low walls along the deck edges
  const st: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    st.push(box(12, 6.5, 10, s * 17, D + 3.25, L / 2 - 6));
    st.push(box(0.6, 1.4, L - 14, s * (W / 2 - 0.3), D + 0.7, -5));
  }
  st.push(box(W, 1.2, 0.6, 0, D + 0.6, -L / 2 + 0.3));
  g.add(mesh(st, m.hullDark));
  const yl: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) yl.push(box(0.65, 0.25, L - 14, s * (W / 2 - 0.3), D + 1.45, -5));
  g.add(mesh(yl, m.yellow));
  return g;
}
