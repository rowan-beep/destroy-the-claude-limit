// Pad 2: the Starship launch complex, built big (the hardstand alone is ten
// times the Saturn V's). A concrete pad hill with a flame trench cut straight
// through it to the sea: the exhaust hits a curved, water-cooled steel
// deflector under the launch mount and is thrown out of the far end of the
// trench. On the hill: the orbital launch mount on four massive legs, and the
// launch-and-catch tower (146 m) with its chopsticks and the ship's
// quick-disconnect arm. Round it on a vast apron: the propellant farm (big
// vertical tanks, rows of horizontal ones, subcoolers and pipe racks), the
// deluge water tanks, floodlight masts, lightning masts, blast walls,
// workshops, a launch-control bunker, and across the road the Mega Bay.
//
// Everything is in the complex's own frame: the launch mount's centre on the
// ground at the origin, +y up, -z toward the sea.

import * as THREE from 'three';

export const PAD2 = {
  /** where the complex's origin (under the launch mount) is in the site */
  x: -820,
  z: 10,
  /** the pad hill's deck and the launch table's top (the booster stands on it) */
  deck: 11,
  table: 24.5,
  /** the hill and the apron, in the complex's frame */
  hill: { x: 75, z: 70, slope: 28 },
  apron: { x0: -330, x1: 330, z0: -180, z1: 175 },
  trench: { half: 11, z1: 6 },
};

export interface PadMats {
  steel: THREE.Material;
  darkSteel: THREE.Material;
  paint: THREE.Material;
  concrete: THREE.Material;
  concreteTop: THREE.Texture;
}

export interface Pad2 {
  group: THREE.Group;
  /** the ship quick-disconnect arm (swings clear before launch) */
  qdArm: THREE.Object3D;
  /** lamps that glow at night / always (for the blinkers) */
  lamps: THREE.Mesh[];
  /** where the exhaust comes out (site frame) and which way it goes */
  exhaust: { trench: THREE.Vector3; dir: THREE.Vector3; mount: THREE.Vector3; ring: number };
}

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** straight members as one instanced mesh */
class Bars {
  private m: THREE.Matrix4[] = [];
  line(a: THREE.Vector3, b: THREE.Vector3, w: number, d = w): void {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.m.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(w, len, d)));
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, ry = 0): void {
    this.m.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz)));
  }
  build(mat: THREE.Material, shadow = true): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, Math.max(1, this.m.length));
    this.m.forEach((x, i) => im.setMatrixAt(i, x));
    im.count = this.m.length;
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadow;
    im.receiveShadow = true;
    return im;
  }
}

/** cylinders (tanks, pipes, legs) as one instanced mesh */
class Cyls {
  private m: THREE.Matrix4[] = [];
  constructor(private seg = 24) {}
  /** a vertical cylinder standing at (x, y0, z) */
  up(x: number, y0: number, z: number, r: number, h: number): void {
    this.m.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y0 + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(r, h, r)));
  }
  /** a cylinder from a to b */
  line(a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.m.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(r, len, r)));
  }
  build(mat: THREE.Material, shadow = true): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, this.seg, 1), mat, Math.max(1, this.m.length));
    this.m.forEach((x, i) => im.setMatrixAt(i, x));
    im.count = this.m.length;
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadow;
    im.receiveShadow = true;
    return im;
  }
}

/** a right-triangle prism: a slope of `run` metres falling `h`, `len` long along +x, facing +z */
function slope(len: number, h: number, run: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.lineTo(run, 0);
  sh.lineTo(0, h);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  // shape in x (run) / y (height), extruded along z: turn so the run goes +z and the length +x
  g.rotateY(-Math.PI / 2);
  g.translate(len, 0, 0);
  return g;
}

/** the apron's painted surface: slabs and joints, stains, safety lines, the pad markings */
function apronTexture(w: number, d: number): THREE.CanvasTexture {
  const W = 2048, H = Math.round((2048 * d) / w);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const sx = W / w, sz = H / d;
  const r = prng(77);
  g.fillStyle = '#b9b4aa';
  g.fillRect(0, 0, W, H);
  // slabs: each a slightly different shade
  const slab = 12;
  for (let x = 0; x < w; x += slab)
    for (let z = 0; z < d; z += slab) {
      const v = 172 + Math.floor((r() - 0.5) * 22);
      g.fillStyle = `rgb(${v},${v - 4},${v - 11})`;
      g.fillRect(x * sx, z * sz, slab * sx + 1, slab * sz + 1);
    }
  // stains: oil, tyre tracks, rust runs, rain-darkened patches
  for (let i = 0; i < 900; i++) {
    const x = r() * W, y = r() * H, rr = 4 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    const a = 0.05 + r() * 0.12;
    gr.addColorStop(0, `rgba(${60 + r() * 40},${55 + r() * 30},${50 + r() * 20},${a})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // joints
  g.strokeStyle = 'rgba(70,66,60,0.55)';
  g.lineWidth = 1;
  for (let x = 0; x <= w; x += slab) {
    g.beginPath();
    g.moveTo(x * sx, 0);
    g.lineTo(x * sx, H);
    g.stroke();
  }
  for (let z = 0; z <= d; z += slab) {
    g.beginPath();
    g.moveTo(0, z * sz);
    g.lineTo(W, z * sz);
    g.stroke();
  }
  // tyre tracks along the service lanes
  g.strokeStyle = 'rgba(40,38,36,0.18)';
  g.lineWidth = 3;
  for (let k = 0; k < 14; k++) {
    const z = (40 + r() * (d - 80)) * sz;
    g.beginPath();
    g.moveTo(0, z);
    g.bezierCurveTo(W * 0.3, z + (r() - 0.5) * 80, W * 0.6, z + (r() - 0.5) * 80, W, z + (r() - 0.5) * 40);
    g.stroke();
  }
  // safety lines: yellow lanes round the hill and the tank farm, red keep-out hatching
  const ax = (x: number) => (x - PAD2.apron.x0) * sx, az = (z: number) => (z - PAD2.apron.z0) * sz;
  g.strokeStyle = 'rgba(232,190,40,0.9)';
  g.lineWidth = 3;
  const H2 = PAD2.hill;
  g.strokeRect(ax(-H2.x - H2.slope - 12), az(-H2.z - H2.slope - 12), (2 * (H2.x + H2.slope + 12)) * sx, (2 * (H2.z + H2.slope + 12)) * sz);
  g.strokeRect(ax(120), az(10), 200 * sx, 150 * sz);
  g.setLineDash([12, 10]);
  g.strokeRect(ax(-H2.x - H2.slope - 24), az(-H2.z - H2.slope - 24), (2 * (H2.x + H2.slope + 24)) * sx, (2 * (H2.z + H2.slope + 24)) * sz);
  g.setLineDash([]);
  // big lettering
  g.fillStyle = 'rgba(245,245,240,0.82)';
  g.font = `bold ${Math.round(26 * sx)}px sans-serif`;
  g.textAlign = 'center';
  g.fillText('PAD 2', ax(-200), az(130));
  g.font = `bold ${Math.round(9 * sx)}px sans-serif`;
  g.fillText('NO UNAUTHORISED ACCESS · LIVE LOX / LCH4', ax(-200), az(150));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

export function buildPad2(m: PadMats): Pad2 {
  const root = new THREE.Group();
  root.position.set(PAD2.x, 0, PAD2.z);
  const lamps: THREE.Mesh[] = [];
  const { deck, table } = PAD2;
  const Hh = PAD2.hill;
  const T = PAD2.trench;
  const concrete = m.concrete;
  const white = new THREE.MeshStandardMaterial({ color: '#e9e8e3', roughness: 0.42, metalness: 0.15 });
  const silver = new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.3, metalness: 0.85 });
  const towerSteel = new THREE.MeshStandardMaterial({ color: '#5d6066', roughness: 0.55, metalness: 0.75 });
  const soot = new THREE.MeshStandardMaterial({ color: '#2b2724', roughness: 0.96 });
  const heatSteel = new THREE.MeshStandardMaterial({ color: '#4a4440', roughness: 0.45, metalness: 0.8 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#d9a51c', roughness: 0.5, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#2a3440', roughness: 0.15, metalness: 0.6 });

  // ---------------------------------------------------------------- the apron
  const A = PAD2.apron;
  const aw = A.x1 - A.x0, ad = A.z1 - A.z0;
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(aw, ad), new THREE.MeshStandardMaterial({ map: apronTexture(aw, ad), roughness: 0.88, metalness: 0 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set((A.x0 + A.x1) / 2, 0.22, (A.z0 + A.z1) / 2);
  apron.receiveShadow = true;
  root.add(apron);

  // ---------------------------------------------------------------- the pad hill, cut by the flame trench
  const hill = new Bars();
  // south block (behind the mount), and the two walls of the trench
  hill.box(0, deck / 2, (T.z1 + Hh.z) / 2, 2 * Hh.x, deck, Hh.z - T.z1);
  hill.box(-(Hh.x + T.half) / 2, deck / 2, (T.z1 - Hh.z) / 2, Hh.x - T.half, deck, Hh.z + T.z1);
  hill.box((Hh.x + T.half) / 2, deck / 2, (T.z1 - Hh.z) / 2, Hh.x - T.half, deck, Hh.z + T.z1);
  root.add(hill.build(concrete));
  // the hill's sloping sides
  const sMat = new THREE.MeshStandardMaterial({ color: '#a8a296', roughness: 0.95 });
  const addSlope = (len: number, x: number, z: number, ry: number) => {
    const sm = new THREE.Mesh(slope(len, deck, Hh.slope), sMat);
    sm.position.set(x, 0, z);
    sm.rotation.y = ry;
    sm.castShadow = sm.receiveShadow = true;
    root.add(sm);
  };
  addSlope(2 * Hh.x, -Hh.x, Hh.z, 0); // south
  addSlope(2 * Hh.z, Hh.x, Hh.z, Math.PI / 2); // east
  addSlope(2 * Hh.z, -Hh.x, -Hh.z, -Math.PI / 2); // west
  // north, either side of the trench mouth (turned round, so placed at their far ends)
  addSlope(Hh.x - T.half, Hh.x, -Hh.z, Math.PI);
  addSlope(Hh.x - T.half, -T.half, -Hh.z, Math.PI);
  // corners: little pyramids so the slopes meet
  const corner = new THREE.ConeGeometry(Hh.slope * 1.414, deck, 4, 1);
  corner.rotateY(Math.PI / 4);
  corner.translate(0, deck / 2, 0);
  for (const [cx, cz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const cm = new THREE.Mesh(corner, sMat);
    cm.position.set(cx * Hh.x, 0, cz * Hh.z);
    cm.scale.set(1, 1, 1);
    cm.castShadow = cm.receiveShadow = true;
    root.add(cm);
  }
  // the deck's surface, round the open trench (tiled concrete, 16 m to a tile)
  const deckMat = new THREE.MeshStandardMaterial({ map: m.concreteTop, roughness: 0.85 });
  m.concreteTop.wrapS = m.concreteTop.wrapT = THREE.RepeatWrapping;
  const deckPlane = (x0: number, x1: number, z0: number, z1: number) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 16, (z1 - uv.getY(i) * (z1 - z0)) / 16);
    const d = new THREE.Mesh(g, deckMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set((x0 + x1) / 2, deck + 0.04, (z0 + z1) / 2);
    d.receiveShadow = true;
    root.add(d);
  };
  deckPlane(-Hh.x, Hh.x, T.z1, Hh.z);
  deckPlane(-Hh.x, -T.half, -Hh.z, T.z1);
  deckPlane(T.half, Hh.x, -Hh.z, T.z1);
  // soot from past launches round the mount, blown outward
  const sootC = document.createElement('canvas');
  sootC.width = sootC.height = 512;
  const so = sootC.getContext('2d')!;
  const sgd = so.createRadialGradient(256, 256, 20, 256, 256, 250);
  sgd.addColorStop(0, 'rgba(24,20,18,0.85)');
  sgd.addColorStop(0.45, 'rgba(40,34,30,0.45)');
  sgd.addColorStop(1, 'rgba(50,44,40,0)');
  so.fillStyle = sgd;
  so.fillRect(0, 0, 512, 512);
  const rs = prng(31);
  for (let i = 0; i < 260; i++) {
    const a = rs() * Math.PI * 2, d0 = 40 + rs() * 200;
    so.strokeStyle = `rgba(30,26,24,${0.05 + rs() * 0.12})`;
    so.lineWidth = 2 + rs() * 7;
    so.beginPath();
    so.moveTo(256 + Math.cos(a) * d0 * 0.4, 256 + Math.sin(a) * d0 * 0.4);
    so.lineTo(256 + Math.cos(a) * d0, 256 + Math.sin(a) * d0);
    so.stroke();
  }
  const sootMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(sootC), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const sootPlane = (x0: number, x1: number, z0: number, z1: number) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    // (one stain across the whole deck: map each piece to its part of it)
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0) + Hh.x) / (2 * Hh.x), (z1 - uv.getY(i) * (z1 - z0) + Hh.z) / (2 * Hh.z));
    const d = new THREE.Mesh(g, sootMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set((x0 + x1) / 2, deck + 0.08, (z0 + z1) / 2);
    root.add(d);
  };
  sootPlane(-Hh.x, Hh.x, T.z1, Hh.z);
  sootPlane(-Hh.x, -T.half, -Hh.z, T.z1);
  sootPlane(T.half, Hh.x, -Hh.z, T.z1);
  // the trench: sooted floor, steel-lined walls near the mount, a curved water-cooled deflector
  const tf = new THREE.Mesh(new THREE.BoxGeometry(2 * T.half, 0.5, Hh.z + T.z1 + Hh.slope), soot);
  tf.position.set(0, 0.25, (T.z1 - Hh.z - Hh.slope) / 2);
  tf.receiveShadow = true;
  root.add(tf);
  const liner = new Bars();
  for (const sx of [-1, 1]) {
    for (let z = -60; z < T.z1; z += 4.1) liner.box(sx * (T.half - 0.15), deck / 2 + 0.2, z + 2, 0.3, deck - 0.4, 3.9);
  }
  root.add(liner.build(heatSteel));
  // soot climbing the trench walls and scorch beyond the mouth
  const sootWall = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.45, depthWrite: false });
  for (const sx of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(Hh.z + T.z1, deck * 0.9), sootWall);
    sw.rotation.y = -sx * Math.PI / 2;
    sw.position.set(sx * (T.half - 0.32), deck * 0.45, (T.z1 - Hh.z) / 2);
    root.add(sw);
  }
  const scorchC = document.createElement('canvas');
  scorchC.width = scorchC.height = 256;
  const sg = scorchC.getContext('2d')!;
  const sgr = sg.createRadialGradient(128, 30, 0, 128, 80, 220);
  sgr.addColorStop(0, 'rgba(20,18,16,0.9)');
  sgr.addColorStop(0.45, 'rgba(45,38,32,0.45)');
  sgr.addColorStop(1, 'rgba(60,50,40,0)');
  sg.fillStyle = sgr;
  sg.fillRect(0, 0, 256, 256);
  const scorch = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(scorchC), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  scorch.rotation.x = -Math.PI / 2;
  scorch.rotation.z = Math.PI;
  scorch.position.set(0, 0.3, -Hh.z - Hh.slope - 70);
  root.add(scorch);
  // the deflector: a concave sweep of steel plates, high under the engines, curving down to
  // the trench floor toward the sea (the exhaust comes straight down and is turned north)
  const defl = new Bars();
  const dR = 26, dzc = -14, dyc = 0.5 + dR;
  const at = (a: number) => new THREE.Vector3(0, dyc - Math.sin(a) * dR, dzc + Math.cos(a) * dR);
  for (let k = 0; k < 18; k++) {
    const p0 = at((k / 18) * (Math.PI / 2)), p1 = at(((k + 1) / 18) * (Math.PI / 2));
    if (p1.y > deck - 0.2 || p1.z > T.z1) continue;
    defl.line(p0.y > deck ? p1.clone().setY(deck) : p0, p1, 2 * T.half - 0.8, 0.9);
  }
  const deflMesh = defl.build(heatSteel);
  root.add(deflMesh);
  // water-deluge pipes along the deflector's top edge
  const dpipes = new Cyls(12);
  for (let k = -4; k <= 4; k++) dpipes.line(new THREE.Vector3(k * 2.3, deck - 0.6, T.z1 - 0.6), new THREE.Vector3(k * 2.3, deck - 2.6, T.z1 - 3.6), 0.25);
  dpipes.line(new THREE.Vector3(-T.half, deck - 0.6, T.z1 - 0.6), new THREE.Vector3(T.half, deck - 0.6, T.z1 - 0.6), 0.6);
  root.add(dpipes.build(silver));
  // the bridge girders that carry the mount's south legs over nothing; guard rails round the trench mouth
  const rails = new Bars();
  for (const sx of [-1, 1]) {
    for (let z = -Hh.z + 1; z < T.z1; z += 3) rails.box(sx * (T.half + 0.6), deck + 0.6, z, 0.1, 1.2, 0.1);
    rails.box(sx * (T.half + 0.6), deck + 1.15, (T.z1 - Hh.z) / 2, 0.08, 0.08, Hh.z + T.z1);
  }
  root.add(rails.build(yellow, false));

  // ---------------------------------------------------------------- the orbital launch mount
  const olm = new Bars();
  const L = 15.5; // legs at the corners of a 31 m square, straddling the trench
  const tableBot = table - 3.6;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    olm.box(sx * L, (deck + tableBot) / 2, sz * L, 4.2, tableBot - deck, 4.2);
    // a foot block on the deck
    olm.box(sx * L, deck + 0.8, sz * L, 7, 1.6, 7);
    // diagonal braces to the table's edge
    olm.line(new THREE.Vector3(sx * L, deck + 2.5, sz * L), new THREE.Vector3(sx * L * 0.45, tableBot, sz * L), 0.9);
    olm.line(new THREE.Vector3(sx * L, deck + 2.5, sz * L), new THREE.Vector3(sx * L, tableBot, sz * L * 0.45), 0.9);
  }
  // cross-beams joining the legs at mid height
  for (const s of [1, -1]) {
    olm.box(0, (deck + tableBot) / 2, s * L, 2 * L, 1.6, 1.6);
    olm.box(s * L, (deck + tableBot) / 2, 0, 1.6, 1.6, 2 * L);
  }
  // the table: a 36 m square, 3.6 m deep, round a 10 m opening
  const tw = 36, hole = 10.4;
  olm.box(0, tableBot + 1.8, (hole / 2 + tw / 2) / 2, tw, 3.6, tw / 2 - hole / 2);
  olm.box(0, tableBot + 1.8, -(hole / 2 + tw / 2) / 2, tw, 3.6, tw / 2 - hole / 2);
  olm.box((hole / 2 + tw / 2) / 2, tableBot + 1.8, 0, tw / 2 - hole / 2, 3.6, hole);
  olm.box(-(hole / 2 + tw / 2) / 2, tableBot + 1.8, 0, tw / 2 - hole / 2, 3.6, hole);
  root.add(olm.build(m.darkSteel));
  // the hold-down clamps round the opening, and the booster quick-disconnect
  const clamps = new Bars();
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    clamps.box(Math.cos(a) * 5.6, table + 0.7, Math.sin(a) * 5.6, 1.1, 1.4, 1.6, -a);
  }
  clamps.box(9, table + 2.2, -2, 4, 4.4, 3.4);
  root.add(clamps.build(silver));
  // the water-cooled steel plate under the engines (seen through the opening)
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(5.1, 5.1, 0.4, 40), heatSteel);
  plate.position.set(0, tableBot - 0.4, 0);
  root.add(plate);

  // ---------------------------------------------------------------- the launch-and-catch tower
  const tx = 34, tz = 0, tw2 = 12, top = deck + 146;
  const tower = new Bars();
  const hw = tw2 / 2;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) tower.box(tx + sx * hw, (deck + top) / 2, tz + sz * hw, 1.5, top - deck, 1.5);
  const lv = 7.3;
  for (let y = deck + lv; y < top; y += lv) {
    for (const s of [1, -1]) {
      tower.box(tx, y, tz + s * hw, tw2, 0.7, 0.7);
      tower.box(tx + s * hw, y, tz, 0.7, 0.7, tw2);
    }
    // x-bracing on every face
    const y0 = y - lv;
    for (const s of [1, -1]) {
      tower.line(new THREE.Vector3(tx - hw, y0, tz + s * hw), new THREE.Vector3(tx + hw, y, tz + s * hw), 0.45);
      tower.line(new THREE.Vector3(tx + hw, y0, tz + s * hw), new THREE.Vector3(tx - hw, y, tz + s * hw), 0.45);
      tower.line(new THREE.Vector3(tx + s * hw, y0, tz - hw), new THREE.Vector3(tx + s * hw, y, tz + hw), 0.45);
      tower.line(new THREE.Vector3(tx + s * hw, y0, tz + hw), new THREE.Vector3(tx + s * hw, y, tz - hw), 0.45);
    }
  }
  // the tower's base block and the top: drawworks housing and a lightning rod
  tower.box(tx, deck + 3, tz, tw2 + 6, 6, tw2 + 6);
  tower.box(tx, top + 3, tz, tw2 + 2, 6, tw2 + 2);
  tower.box(tx + 3, top + 8, tz, 6, 4, 8);
  root.add(tower.build(towerSteel));
  const rod = new Cyls(8);
  rod.line(new THREE.Vector3(tx, top + 6, tz), new THREE.Vector3(tx, top + 34, tz), 0.35);
  // the carriage's pulleys and cables down the tower face
  for (const dz of [-3, 3]) rod.line(new THREE.Vector3(tx - hw - 0.8, deck + 8, tz + dz), new THREE.Vector3(tx - hw - 0.8, top, tz + dz), 0.12);
  root.add(rod.build(silver));
  // the chopsticks: two 37 m arms on a carriage, open toward the mount
  const chop = new Bars();
  const cy = deck + 98;
  chop.box(tx - hw - 1.6, cy, tz, 3.2, 9, tw2 + 4);
  for (const s of [1, -1]) {
    const base = new THREE.Vector3(tx - hw - 3, cy, tz + s * 5);
    const ang = Math.PI + s * 0.32;
    const tip = base.clone().add(new THREE.Vector3(Math.cos(ang) * 37, 0, Math.sin(ang) * 37 * 0.6 + s * 4));
    // a truss: top and bottom chords and the web between
    chop.line(base.clone().add(new THREE.Vector3(0, 1.6, 0)), tip.clone().add(new THREE.Vector3(0, 1.2, 0)), 0.9);
    chop.line(base.clone().add(new THREE.Vector3(0, -1.6, 0)), tip.clone().add(new THREE.Vector3(0, -1.2, 0)), 0.9);
    for (let k = 0; k < 8; k++) {
      const a = base.clone().lerp(tip, k / 8), b = base.clone().lerp(tip, (k + 1) / 8);
      chop.line(a.clone().add(new THREE.Vector3(0, -1.5, 0)), b.clone().add(new THREE.Vector3(0, 1.5, 0)), 0.35);
    }
    // the catch rail on the inner face
    chop.line(base.clone().add(new THREE.Vector3(0, 2.4, -s * 0.6)), tip.clone().add(new THREE.Vector3(0, 2.2, -s * 0.6)), 0.5);
  }
  root.add(chop.build(white));
  // the ship quick-disconnect arm, swinging on a hinge at the tower
  const qdArm = new THREE.Group();
  qdArm.position.set(tx - hw, deck + 89.5, tz - 2);
  const qd = new Bars();
  // (reaching from the tower to the ship's side, 4.5 m off its axis)
  const qdLen = tx - hw - 4.5;
  qd.box(-qdLen / 2, 0, 0, qdLen, 2.6, 3);
  qd.box(-qdLen + 1.5, -1.6, 0, 3, 3.2, 4);
  for (let k = 0; k < 5; k++) qd.box(-3 - k * 5, 1.9, 0, 0.3, 1.2, 3);
  qdArm.add(qd.build(m.darkSteel));
  root.add(qdArm);
  // aircraft-warning lamps up the tower
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.5, 0.3), toneMapped: false });
  for (const y of [deck + 50, deck + 100, top + 6, top + 34]) {
    const lm = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), lampMat);
    lm.position.set(tx - hw, y, tz - hw);
    root.add(lm);
    lamps.push(lm);
  }

  // ---------------------------------------------------------------- lightning masts round the hill
  const masts = new Cyls(10);
  for (const [mx, mz] of [[-95, -90], [95, -90], [-95, 95], [95, 95]]) {
    masts.line(new THREE.Vector3(mx, 0, mz), new THREE.Vector3(mx, 120, mz), 0.9);
    masts.line(new THREE.Vector3(mx, 120, mz), new THREE.Vector3(mx, 135, mz), 0.25);
  }
  root.add(masts.build(towerSteel));
  // catenary wires between them (thin straight members; the sag is small at this scale)
  const wires = new Bars();
  for (const [a, b] of [[[-95, -90], [95, -90]], [[95, -90], [95, 95]], [[95, 95], [-95, 95]], [[-95, 95], [-95, -90]]] as [number[], number[]][])
    wires.line(new THREE.Vector3(a[0], 134, a[1]), new THREE.Vector3(b[0], 134, b[1]), 0.06);
  root.add(wires.build(m.darkSteel, false));

  // ---------------------------------------------------------------- the propellant farm
  const farm = new Cyls(28);
  const farmLow = new Cyls(20);
  const r = prng(9);
  // big vertical tanks: liquid oxygen, liquid methane, liquid nitrogen
  const vt: [number, number, number, number][] = [];
  for (let i = 0; i < 5; i++) vt.push([150 + i * 30, 45, 8, 38]);
  for (let i = 0; i < 5; i++) vt.push([150 + i * 30, 80, 8, 38]);
  for (let i = 0; i < 4; i++) vt.push([165 + i * 34, 120, 6, 26]);
  for (const [x, z, rr, h] of vt) {
    farm.up(x, 0, z, rr, h);
    // a domed top
  }
  root.add(farm.build(white));
  const domes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), white, vt.length);
  vt.forEach(([x, z, rr, h], i) => domes.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, h, z), new THREE.Quaternion(), new THREE.Vector3(rr, rr * 0.35, rr))));
  domes.castShadow = true;
  root.add(domes);
  // rows of horizontal tanks on saddles
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 6; i++) {
      const x = 150 + i * 24, z = 150 - row * 8 + 5;
      if (z > A.z1 - 6) continue;
      farmLow.line(new THREE.Vector3(x - 10, 4, z), new THREE.Vector3(x + 10, 4, z), 2.4);
    }
  root.add(farmLow.build(silver));
  // subcoolers: big boxes with fan stacks on top
  const sub = new Bars();
  for (let i = 0; i < 4; i++) {
    sub.box(265 + (i % 2) * 34, 7, 25 + Math.floor(i / 2) * 32, 26, 14, 18);
    for (let f = 0; f < 6; f++) sub.box(255 + (i % 2) * 34 + (f % 3) * 9, 15, 20 + Math.floor(i / 2) * 32 + Math.floor(f / 3) * 9, 6, 2, 6);
  }
  root.add(sub.build(m.paint));
  // tank saddles, walkways and stairs (the dark steel bits)
  const walk = new Bars();
  for (const [x, z, rr, h] of vt) {
    walk.box(x, h + rr * 0.35 + 0.6, z, rr * 1.2, 0.3, 1.2);
    walk.line(new THREE.Vector3(x + rr + 0.6, 0, z), new THREE.Vector3(x + rr + 0.6, h, z + rr * 0.6), 0.5, 1.2);
  }
  root.add(walk.build(m.darkSteel));
  // blast walls round the farm
  const walls = new Bars();
  walls.box(232, 2.5, 6, 200, 5, 1.2);
  walls.box(132, 2.5, 82, 1.2, 5, 152);
  root.add(walls.build(concrete));

  // ---------------------------------------------------------------- pipe racks from the farm to the mount
  const pipes = new Cyls(14);
  const rack = new Bars();
  const rackY = 6;
  const runs: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(132, rackY, 60), new THREE.Vector3(Hh.x + Hh.slope + 4, rackY, 60)],
    [new THREE.Vector3(Hh.x + Hh.slope + 4, rackY, 60), new THREE.Vector3(Hh.x + 4, deck + 3, 30)],
    [new THREE.Vector3(Hh.x + 4, deck + 3, 30), new THREE.Vector3(tx + hw + 2, deck + 3, 30)],
  ];
  for (const [a, b] of runs) {
    for (let k = -2; k <= 2; k++) pipes.line(a.clone().add(new THREE.Vector3(0, 0, k * 1.4)), b.clone().add(new THREE.Vector3(0, 0, k * 1.4)), k === 0 ? 0.65 : 0.4);
    const n = Math.ceil(a.distanceTo(b) / 9);
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      rack.box(p.x, p.y / 2 - 0.4, p.z, 0.7, p.y - 0.8, 0.7);
      rack.box(p.x, p.y - 0.8, p.z, 0.8, 0.5, 8);
    }
  }
  // up the tower to the arm
  pipes.line(new THREE.Vector3(tx + hw + 2, deck + 3, 30), new THREE.Vector3(tx + hw + 2, deck + 90, tz + hw + 2), 0.55);
  pipes.line(new THREE.Vector3(tx + hw + 3.3, deck + 3, 30), new THREE.Vector3(tx + hw + 3.3, deck + 90, tz + hw + 2), 0.55);
  // and across the deck to the mount
  pipes.line(new THREE.Vector3(tx - hw, deck + 1.2, tz - 4), new THREE.Vector3(9, deck + 1.2, -2), 0.6);
  root.add(pipes.build(silver));
  root.add(rack.build(m.darkSteel));

  // ---------------------------------------------------------------- deluge water: two tall tanks and a pump house
  const water = new Cyls(32);
  water.up(-170, 0, 60, 13, 34);
  water.up(-170, 0, 105, 13, 34);
  root.add(water.build(white));
  const pump = new Bars();
  pump.box(-205, 5, 82, 24, 10, 40);
  root.add(pump.build(m.paint));
  const wpipe = new Cyls(12);
  wpipe.line(new THREE.Vector3(-157, 3, 82), new THREE.Vector3(-Hh.x - Hh.slope - 3, 3, 40), 1.1);
  wpipe.line(new THREE.Vector3(-Hh.x - Hh.slope - 3, 3, 40), new THREE.Vector3(-Hh.x, deck + 2, 20), 1.1);
  wpipe.line(new THREE.Vector3(-Hh.x, deck + 2, 20), new THREE.Vector3(-L - 2, deck + 2, 6), 1.1);
  root.add(wpipe.build(silver));

  // ---------------------------------------------------------------- floodlight masts round the apron
  const fl = new Bars();
  const flHeads = new Bars();
  const flPos: [number, number][] = [];
  for (let k = 0; k < 7; k++) flPos.push([A.x0 + 30 + k * ((aw - 60) / 6), A.z0 + 14]);
  for (let k = 0; k < 7; k++) flPos.push([A.x0 + 30 + k * ((aw - 60) / 6), A.z1 - 14]);
  for (const [x, z] of [[A.x0 + 14, 0], [A.x1 - 14, 0]]) flPos.push([x, z]);
  for (const [x, z] of flPos) {
    fl.box(x, 18, z, 0.9, 36, 0.9);
    fl.box(x, 36.4, z, 7, 0.4, 1.2);
    flHeads.box(x, 35.6, z + (z < 0 ? 0.8 : -0.8), 6.2, 1.2, 0.3);
  }
  root.add(fl.build(towerSteel));
  const headMesh = flHeads.build(new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.6, 3.6), toneMapped: false }), false);
  root.add(headMesh);

  // ---------------------------------------------------------------- buildings: launch control, workshops, a guard house
  const bld = new Bars();
  bld.box(-250, 6, -110, 60, 12, 36);
  bld.box(-250, 14, -110, 20, 4, 14);
  bld.box(-130, 8, 140, 70, 16, 30);
  bld.box(-60, 6, 150, 40, 12, 22);
  bld.box(300, 3, -150, 20, 6, 14);
  root.add(bld.build(m.paint));
  // the launch-control bunker: a mound of earth with a concrete face
  const bunker = new THREE.Mesh(new THREE.SphereGeometry(26, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8d8a6c', roughness: 1 }));
  bunker.scale.set(1, 0.42, 0.8);
  bunker.position.set(-270, 0, 40);
  bunker.castShadow = bunker.receiveShadow = true;
  root.add(bunker);
  const bface = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 2), concrete);
  bface.position.set(-270, 4, 19);
  root.add(bface);
  const win = new Bars();
  for (let k = 0; k < 8; k++) win.box(-262.5 - k * 2.2 + 8, 5.5, 17.9, 1.6, 1.2, 0.2);
  for (let k = 0; k < 10; k++) win.box(-250 - 27 + k * 6, 7, -127.9 + 0.3, 3.6, 2, 0.2);
  root.add(win.build(glass, false));
  // the Mega Bay across the road: the hall where the ships are stacked
  const bay = new Bars();
  bay.box(-180, 47.5, 330, 140, 95, 80);
  bay.box(-180, 98, 330, 120, 6, 60);
  root.add(bay.build(new THREE.MeshStandardMaterial({ color: '#d9dadc', roughness: 0.55, metalness: 0.35 })));
  const doors = new Bars();
  for (const dx of [-35, 35]) doors.box(-180 + dx, 45, 289.8, 40, 88, 0.6);
  root.add(doors.build(new THREE.MeshStandardMaterial({ color: '#7d828a', roughness: 0.5, metalness: 0.5 })));
  const logo = document.createElement('canvas');
  logo.width = 1024;
  logo.height = 128;
  const lg = logo.getContext('2d')!;
  lg.fillStyle = 'rgba(0,0,0,0)';
  lg.clearRect(0, 0, 1024, 128);
  lg.fillStyle = '#1c2230';
  lg.font = 'bold 92px sans-serif';
  lg.textAlign = 'center';
  lg.fillText('STARBASE · MEGA BAY', 512, 98);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(110, 13.75), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(logo), transparent: true, roughness: 0.6 }));
  sign.position.set(-180, 80, 289.6);
  sign.rotation.y = Math.PI;
  root.add(sign);
  // ground equipment: trailers and containers
  const kit = new Bars();
  for (let i = 0; i < 26; i++) {
    const x = A.x0 + 40 + r() * (aw - 80), z = A.z0 + 30 + r() * (ad - 60);
    if (Math.abs(x) < Hh.x + Hh.slope + 20 && Math.abs(z) < Hh.z + Hh.slope + 20) continue;
    if (x > 125 && x < 330 && z > 5 && z < 165) continue;
    kit.box(x, 1.4, z, 12, 2.8, 2.6, r() * Math.PI);
  }
  root.add(kit.build(new THREE.MeshStandardMaterial({ color: '#cfd3d6', roughness: 0.6 })));

  const exhaust = {
    trench: new THREE.Vector3(PAD2.x, 3, PAD2.z - Hh.z - Hh.slope + 4),
    dir: new THREE.Vector3(0, 0, -1),
    mount: new THREE.Vector3(PAD2.x, deck + 3, PAD2.z),
    ring: 22,
  };
  return { group: root, qdArm, lamps, exhaust };
}

/** the height of the pad hill's top at a site point (or -Infinity off it), for cameras */
export function pad2Height(x: number, z: number): number {
  const lx = x - PAD2.x, lz = z - PAD2.z;
  const H = PAD2.hill;
  const ox = Math.max(0, Math.abs(lx) - H.x), oz = Math.max(0, Math.abs(lz) - H.z);
  const d = Math.max(ox, oz);
  if (d > H.slope) return -Infinity;
  // (the trench is open between its walls, north of the mount)
  if (Math.abs(lx) < PAD2.trench.half && lz < PAD2.trench.z1) return -Infinity;
  return PAD2.deck * (1 - d / H.slope);
}
