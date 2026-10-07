// Falcon Heavy and SLS, built to their real proportions, in parts that come
// apart in flight. Each model stands on its engines' exit plane at y = 0, +Y up.
//
// Falcon Heavy: three 3.66 m cores, 47.7 m tall; the side boosters have their
// carbon nosecones, the centre core its black interstage and the second stage
// above it, then the 13.1 m fairing. Every core has its octaweb of nine Merlins,
// four titanium grid fins and four carbon landing legs that unfold for landing.
// Inside the fairing: Europa Clipper, its 3 m high-gain dish and the two solar
// arrays folded against it (30.5 m across when unfolded).
//
// SLS Block 1: the orange foam-insulated 8.4 m core stage with its four RS-25s
// under the boat-tail, two white five-segment boosters with their flared aft
// skirts, the launch vehicle stage adapter, the ICPS, Orion's service module
// under its three fairing panels, the crew module and the launch abort tower.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** merge a list of geometries into one mesh */
function mesh(geos: THREE.BufferGeometry[], mat: THREE.Material): THREE.Mesh {
  const list = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  const m = new THREE.Mesh(mergeGeometries(list, false)!, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(r0: number, r1: number, h: number, y0: number, seg = 48, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, open);
  g.translate(0, y0 + h / 2, 0);
  return g;
}
function lathe(pts: [number, number][], seg = 48): THREE.BufferGeometry {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
function at(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  g.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(1, 1, 1)));
  return g;
}

// ---------------------------------------------------------------- materials
let mats: Record<string, THREE.Material> | null = null;
function M(): Record<string, THREE.Material> {
  if (mats) return mats;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  // the cores' white paint with the faint seams of the tank sections
  const white = canvasTex(256, 1024, (g) => {
    g.fillStyle = '#f3f3f1';
    g.fillRect(0, 0, 256, 1024);
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.moveTo(0, i * 85);
      g.lineTo(256, i * 85);
      g.stroke();
    }
  });
  // the SpaceX logo running up the centre core
  const sx = canvasTex(256, 2048, (g) => {
    g.fillStyle = '#f3f3f1';
    g.fillRect(0, 0, 256, 2048);
    g.save();
    g.translate(150, 1700);
    g.rotate(-Math.PI / 2);
    g.fillStyle = '#1b1b1d';
    g.font = 'bold 120px Arial';
    g.fillText('SPACEX', 0, 0);
    g.restore();
  });
  // SLS: the orange spray-on foam, mottled, with the NASA "worm"
  const foam = canvasTex(512, 2048, (g) => {
    g.fillStyle = '#c86a2e';
    g.fillRect(0, 0, 512, 2048);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '230,140,70' : '150,70,30'},${0.04 + Math.random() * 0.08})`;
      g.fillRect(Math.random() * 512, Math.random() * 2048, 4 + Math.random() * 20, 2 + Math.random() * 8);
    }
    g.strokeStyle = 'rgba(90,40,15,0.25)';
    g.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.moveTo(0, 200 + i * 210);
      g.lineTo(512, 200 + i * 210);
      g.stroke();
    }
  });
  const srb = canvasTex(256, 1024, (g) => {
    g.fillStyle = '#efefec';
    g.fillRect(0, 0, 256, 1024);
    g.fillStyle = '#2a2a2c';
    for (const y of [180, 360, 540, 720]) g.fillRect(0, y, 256, 10);
    g.save();
    g.translate(140, 820);
    g.rotate(-Math.PI / 2);
    g.fillStyle = '#c4302b';
    g.font = 'bold 64px Arial';
    g.fillText('NASA', 0, 0);
    g.restore();
  });
  mats = {
    white: std({ color: '#ffffff', map: white, roughness: 0.42, metalness: 0.05 }),
    logo: std({ color: '#ffffff', map: sx, roughness: 0.42, metalness: 0.05 }),
    black: std({ color: '#141416', roughness: 0.55, metalness: 0.2 }),
    soot: std({ color: '#2b2622', roughness: 0.85 }),
    ti: std({ color: '#8d8f93', roughness: 0.35, metalness: 0.9 }),
    steel: std({ color: '#5e6064', roughness: 0.35, metalness: 0.95 }),
    nozzle: std({ color: '#3a3533', roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }),
    copper: std({ color: '#b36a3c', roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide }),
    foam: std({ color: '#ffffff', map: foam, roughness: 0.9 }),
    srb: std({ color: '#ffffff', map: srb, roughness: 0.5 }),
    grey: std({ color: '#9a9ca0', roughness: 0.5, metalness: 0.4 }),
    silver: std({ color: '#d7d9dc', roughness: 0.25, metalness: 0.9 }),
    gold: std({ color: '#d4a63c', roughness: 0.3, metalness: 1 }),
    panel: std({ color: '#1c2638', roughness: 0.3, metalness: 0.4 }),
    orion: std({ color: '#e9e8e4', roughness: 0.45 }),
  };
  return mats;
}

// ---------------------------------------------------------------- Falcon Heavy
export interface FalconCore {
  group: THREE.Group;
  legs: THREE.Group[];
  fins: THREE.Group[];
  /** engine exits (local), for the plumes */
  engines: THREE.Vector3[];
}

/** nine Merlins on the octaweb: eight round one in the middle */
export function octaweb(): THREE.Vector3[] {
  const e = [V(0, 0, 0)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    e.push(V(Math.cos(a) * 1.24, 0, Math.sin(a) * 1.24));
  }
  return e;
}

function falconCore(kind: 'side' | 'centre', side: number): FalconCore {
  const m = M();
  const g = new THREE.Group();
  const R = 1.83;
  const tank = 41.2;
  const body: THREE.BufferGeometry[] = [cyl(R, R, tank - 1.6, 1.6, 64)];
  const blk: THREE.BufferGeometry[] = [];
  // the engine section (black, sooted) and the octaweb
  blk.push(cyl(R + 0.02, R + 0.02, 1.6, 0, 64));
  blk.push(cyl(R - 0.1, R - 0.1, 0.3, 0, 64, false));
  // the raceway and the pressurization lines along the tank
  body.push(at(new THREE.BoxGeometry(0.22, tank - 3, 0.16), 0, 1.6 + (tank - 3) / 2, -R - 0.05));
  if (kind === 'side') {
    // the carbon nosecone: an ogive 7 m tall
    const pts: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push([R * Math.sqrt(Math.max(0, 1 - t * t * 0.96)), tank + t * 6.5]);
    }
    pts.push([0, tank + 6.5]);
    body.push(lathe(pts, 64));
  } else {
    // the interstage (black carbon) up to the second stage
    blk.push(cyl(R, R, 6.5, tank, 64));
  }
  const mainMat = kind === 'centre' ? m.logo : m.white;
  g.add(mesh(body, mainMat), mesh(blk, m.black));
  // the nine Merlins under the octaweb
  const engines = octaweb();
  const nz: THREE.BufferGeometry[] = [];
  for (const e of engines) {
    nz.push(at(lathe([[0.18, 0.95], [0.22, 0.75], [0.3, 0.45], [0.4, 0.15], [0.46, 0]], 32), e.x, -0.95, e.z));
  }
  const nzm = mesh(nz, m.nozzle);
  nzm.position.y = 0;
  g.add(nzm);
  // grid fins at the top of the tank (stowed flat), titanium lattices
  const fins: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fg = new THREE.Group();
    fg.position.set(Math.cos(a) * R, tank - 2.5, Math.sin(a) * R);
    fg.rotation.y = -a;
    const lat: THREE.BufferGeometry[] = [];
    // a 1.2 x 1.5 m lattice
    for (let k = 0; k <= 6; k++) lat.push(at(new THREE.BoxGeometry(0.03, 1.5, 0.25), 0.05 + k * 0.2, 0, 0));
    for (let k = 0; k <= 7; k++) lat.push(at(new THREE.BoxGeometry(1.25, 0.03, 0.25), 0.65, -0.75 + k * 0.214, 0));
    const lm = mesh(lat, m.ti);
    // stowed: folded up against the tank
    lm.rotation.z = Math.PI / 2 - 0.05;
    lm.name = 'lattice';
    fg.add(lm);
    g.add(fg);
    fins.push(fg);
  }
  // landing legs: four carbon legs folded against the bottom of the tank
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const lg = new THREE.Group();
    lg.position.set(Math.cos(a) * (R + 0.08), 1.0, Math.sin(a) * (R + 0.08));
    lg.rotation.y = -a;
    const leg = mesh([at(new THREE.BoxGeometry(0.16, 9.8, 0.5), 0.0, 4.9, 0), at(new THREE.BoxGeometry(0.4, 0.3, 0.9), 0, 9.6, 0)], m.black);
    lg.add(leg);
    const foot = mesh([at(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 16), 0, 0, 0)], m.black);
    lg.add(foot);
    g.add(lg);
    legs.push(lg);
  }
  g.position.x = side * 3.95;
  return { group: g, legs, fins, engines };
}

/** deploy (k = 0 stowed .. 1 down and locked) the landing legs and the grid fins */
export function poseCore(c: FalconCore, legs: number, fins: number): void {
  for (const l of c.legs) {
    // the legs swing out and down from the top hinge (at the bottom of the tank, pivot at the leg's top)
    l.rotation.z = 0;
    l.children.forEach((ch) => (ch.rotation.z = 0));
    l.rotation.order = 'YZX';
    l.rotation.z = -legs * 2.35;
  }
  for (const f of c.fins) {
    const lat = f.getObjectByName('lattice')!;
    lat.rotation.z = Math.PI / 2 - 0.05 - fins * (Math.PI / 2 - 0.05);
  }
}

export interface ClipperRig {
  group: THREE.Group;
  arrays: THREE.Group[];
  dish: THREE.Mesh;
}

/** Europa Clipper: the spacecraft, 6 t; its arrays unfold to 30.5 m */
export function buildClipper(): ClipperRig {
  const m = M();
  const g = new THREE.Group();
  // the propulsion module: a tall cylinder (the tanks) under the electronics vault
  g.add(mesh([cyl(1.2, 1.2, 3.0, 0, 48), cyl(0.9, 1.2, 0.6, 3.0, 48)], m.gold));
  g.add(mesh([at(new THREE.BoxGeometry(1.6, 1.0, 1.6), 0, 4.1, 0)], m.silver));
  // the 3 m high-gain antenna on top
  const dish = mesh([at(lathe([[0.05, 0], [0.6, 0.06], [1.2, 0.22], [1.5, 0.36], [1.52, 0.4]], 48), 0, 4.65, 0)], m.white);
  g.add(dish);
  // the magnetometer boom and instruments
  g.add(mesh([at(new THREE.CylinderGeometry(0.03, 0.03, 8.5, 8), 0, 2.2, 0, 0, 0, Math.PI / 2).translate(4.4, 0, 0)], m.ti));
  // the two solar arrays: five panels each, folded against the body
  const arrays: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const ag = new THREE.Group();
    ag.position.set(s * 1.25, 1.6, 0);
    const panels: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) panels.push(at(new THREE.BoxGeometry(2.8, 0.05, 4.1), s * (1.5 + k * 2.85), 0, 0));
    const pm = mesh(panels, m.panel);
    ag.add(pm);
    ag.add(mesh([at(new THREE.BoxGeometry(14.5, 0.04, 0.12), s * 7.4, 0.04, 0)], m.ti));
    g.add(ag);
    arrays.push(ag);
  }
  const rig: ClipperRig = { group: g, arrays, dish };
  deployClipper(rig, 0);
  return rig;
}
export function deployClipper(c: ClipperRig, k: number): void {
  // folded: the arrays hang down along the body; unfolded: straight out
  c.arrays.forEach((a, i) => {
    const s = i === 0 ? -1 : 1;
    a.rotation.z = s * (1 - k) * (Math.PI / 2 - 0.08);
    a.scale.x = 0.2 + 0.8 * k;
  });
}

export interface FalconRig {
  group: THREE.Group;
  sides: FalconCore[];
  centre: FalconCore;
  upper: THREE.Group;
  /** the MVac's exit, local to the upper stage */
  mvac: THREE.Vector3;
  fairing: THREE.Group[];
  payload: ClipperRig;
}

export function buildFalconHeavy(): FalconRig {
  const m = M();
  const group = new THREE.Group();
  const sides = [falconCore('side', -1), falconCore('side', 1)];
  const centre = falconCore('centre', 0);
  group.add(sides[0].group, sides[1].group, centre.group);
  // the struts tying the boosters to the core (top and bottom)
  const strut = mesh([at(new THREE.BoxGeometry(0.5, 0.6, 0.8), -1.98, 39.5, 0), at(new THREE.BoxGeometry(0.5, 0.6, 0.8), 1.98, 39.5, 0), at(new THREE.BoxGeometry(0.5, 0.5, 0.6), -1.98, 3.0, 0), at(new THREE.BoxGeometry(0.5, 0.5, 0.6), 1.98, 3.0, 0)], m.black);
  centre.group.add(strut);
  // the second stage: 12.6 m tank above the interstage, the MVac's huge nozzle hidden inside
  const upper = new THREE.Group();
  upper.position.y = 47.7;
  upper.add(mesh([cyl(1.83, 1.83, 12.0, 0, 64)], m.white));
  upper.add(mesh([at(lathe([[0.45, 0], [0.7, -0.6], [1.1, -2.0], [1.6, -3.6], [1.62, -3.7]], 48), 0, 0, 0)], m.copper));
  // the fairing: two halves, 5.2 m across and 13.1 m tall
  const fairing: THREE.Group[] = [];
  const fpts: [number, number][] = [[1.83, 0], [2.6, 1.2], [2.6, 6.8]];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    fpts.push([2.6 * Math.cos(t * Math.PI * 0.48) * (1 - 0.05 * t), 6.8 + t * 6.3]);
  }
  fpts.push([0, 13.1]);
  for (const s of [-1, 1]) {
    const half = new THREE.LatheGeometry(fpts.map(([r, y]) => new THREE.Vector2(r, y)), 32, s < 0 ? 0 : Math.PI, Math.PI);
    const fg = new THREE.Group();
    fg.position.y = 12.0;
    const hm = new THREE.Mesh(half, m.white);
    hm.castShadow = true;
    fg.add(hm);
    upper.add(fg);
    fairing.push(fg);
  }
  const payload = buildClipper();
  payload.group.position.y = 12.6;
  payload.group.scale.setScalar(0.85);
  upper.add(payload.group);
  centre.group.add(upper);
  for (const c of [...sides, centre]) poseCore(c, 0, 0);
  return { group, sides, centre, upper, mvac: V(0, -3.7, 0), fairing, payload };
}

// ---------------------------------------------------------------- SLS
export interface SlsRig {
  group: THREE.Group;
  core: THREE.Group;
  srbs: THREE.Group[];
  /** ICPS + Orion (after core separation) */
  upper: THREE.Group;
  icps: THREE.Group;
  orion: THREE.Group;
  las: THREE.Group;
  smPanels: THREE.Group[];
  arrays: THREE.Group[];
  rs25: THREE.Vector3[];
  srbNozzle: THREE.Vector3;
  rl10: THREE.Vector3;
}

export function buildSLS(): SlsRig {
  const m = M();
  const group = new THREE.Group();
  const core = new THREE.Group();
  group.add(core);
  const R = 4.2, H = 64.6;
  // the core stage: foam-covered tanks, the intertank's ribbed band, the engine section and boat-tail
  core.add(mesh([cyl(R, R, H - 8.6, 8.6, 96)], m.foam));
  const ribs: THREE.BufferGeometry[] = [cyl(R + 0.03, R + 0.03, 6.8, 47, 96)];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ribs.push(at(new THREE.BoxGeometry(0.08, 6.8, 0.1), Math.cos(a) * (R + 0.06), 50.4, Math.sin(a) * (R + 0.06), 0, -a, 0));
  }
  core.add(mesh(ribs, m.foam));
  core.add(mesh([lathe([[2.9, 0.4], [3.5, 3.0], [R, 6.5], [R, 8.6]], 96), cyl(2.9, 2.9, 0.4, 0, 64)], m.foam));
  // the four RS-25s
  const rs25 = [V(-1.6, -3.4, -1.6), V(1.6, -3.4, -1.6), V(-1.6, -3.4, 1.6), V(1.6, -3.4, 1.6)];
  const eng: THREE.BufferGeometry[] = [];
  for (const e of rs25) eng.push(at(lathe([[0.45, 3.2], [0.42, 2.8], [0.6, 2.2], [0.9, 1.2], [1.15, 0.0]], 40), e.x, e.y, e.z));
  core.add(mesh(eng, m.nozzle));
  // the powerheads in their thermal blankets
  core.add(mesh(rs25.map((e) => at(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 24), e.x, 0.3, e.z)), m.silver));
  // the launch vehicle stage adapter: a cone from 8.4 m to 5 m
  core.add(mesh([lathe([[R, H], [R, H + 0.3], [2.55, H + 8.6]], 96)], m.silver));
  // the solid rocket boosters, left and right
  const srbs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const b = new THREE.Group();
    b.position.x = s * 6.15;
    const r = 1.855;
    b.add(mesh([cyl(r, r, 45.5, 5.0, 64)], m.srb));
    // the flared aft skirt and the nozzle
    b.add(mesh([lathe([[2.7, 0], [2.3, 2.0], [r, 5.0]], 64)], m.white));
    b.add(mesh([at(lathe([[0.75, 1.0], [1.0, 0.0], [1.3, -1.6], [1.45, -2.9]], 40), 0, 0, 0)], m.soot));
    // the nose cone and the frustum
    const nose: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      nose.push([r * Math.sqrt(Math.max(0, 1 - t * t * 0.97)), 50.5 + t * 5.5]);
    }
    nose.push([0, 56]);
    b.add(mesh([lathe(nose, 64)], m.white));
    // the forward and aft attach struts to the core
    b.add(mesh([at(new THREE.BoxGeometry(2.4, 0.5, 0.5), -s * 2.0, 45, 0), at(new THREE.BoxGeometry(2.4, 0.4, 0.4), -s * 2.0, 8.5, 0.6), at(new THREE.BoxGeometry(2.4, 0.4, 0.4), -s * 2.0, 8.5, -0.6)], m.grey));
    core.add(b);
    srbs.push(b);
  }
  // the upper stack: ICPS inside the adapter's top, Orion stage adapter, Orion
  const upper = new THREE.Group();
  upper.position.y = H + 8.6;
  const icps = new THREE.Group();
  icps.add(mesh([cyl(2.55, 2.55, 3.4, -3.4, 64), at(new THREE.SphereGeometry(2.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), 0, -3.4, 0, Math.PI, 0, 0)], m.white));
  icps.add(mesh([at(lathe([[0.3, 0], [0.5, -0.6], [0.95, -2.4]], 32), 0, -5.6, 0)], m.copper));
  upper.add(icps);
  // the Orion stage adapter
  upper.add(mesh([lathe([[2.55, 0], [2.55, 0.4], [2.3, 1.5]], 64)], m.silver));
  const orion = new THREE.Group();
  orion.position.y = 1.5;
  // the European Service Module: 4 m tall under three fairing panels
  orion.add(mesh([cyl(2.05, 2.05, 4.0, 0, 64)], m.silver));
  orion.add(mesh([at(lathe([[0.3, 0], [0.5, -0.5], [0.95, -1.8]], 32), 0, 0, 0)], m.copper));
  const smPanels: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const pg = new THREE.Group();
    const geo = new THREE.CylinderGeometry(2.3, 2.3, 4.2, 32, 1, true, (i / 3) * Math.PI * 2, (Math.PI * 2) / 3);
    geo.translate(0, 2.1, 0);
    const pm = new THREE.Mesh(geo, m.white);
    pm.material = (m.white as THREE.MeshStandardMaterial).clone();
    (pm.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    pg.add(pm);
    orion.add(pg);
    smPanels.push(pg);
  }
  // the four solar array wings, folded (unfold after the panels are gone)
  const arrays: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ag = new THREE.Group();
    ag.position.set(Math.cos(a) * 2.05, 3.6, Math.sin(a) * 2.05);
    ag.rotation.y = -a;
    const wing: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) wing.push(at(new THREE.BoxGeometry(2.0, 0.04, 1.9), 1.1 + k * 2.05, 0, 0));
    const wm = mesh(wing, m.panel);
    wm.name = 'wing';
    ag.add(wm);
    ag.visible = false;
    orion.add(ag);
    arrays.push(ag);
  }
  // the crew module: a 5 m cone, the crew's capsule
  orion.add(mesh([lathe([[2.5, 4.0], [2.5, 4.15], [1.05, 7.2], [0.85, 7.35], [0, 7.4]], 64)], m.orion));
  orion.add(mesh([at(new THREE.CylinderGeometry(2.52, 2.52, 0.12, 64), 0, 4.0, 0)], m.soot));
  upper.add(orion);
  // the launch abort system: the ogive fairing over the capsule and the tower with its abort motor
  const las = new THREE.Group();
  las.position.y = 1.5;
  const fp: [number, number][] = [[2.6, 3.9], [2.55, 4.4]];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    fp.push([2.55 * (1 - t) + 0.45 * t, 4.4 + t * 4.4]);
  }
  las.add(mesh([lathe(fp, 64)], m.white));
  las.add(mesh([cyl(0.45, 0.4, 5.0, 8.8, 32), cyl(0.4, 0.05, 2.2, 13.8, 32)], m.white));
  las.add(mesh([0, 1, 2, 3].map((i) => at(new THREE.CylinderGeometry(0.16, 0.2, 0.4, 16), Math.cos(i * 1.57) * 0.5, 9.2, Math.sin(i * 1.57) * 0.5, Math.cos(i * 1.57) * 0.6, 0, -Math.sin(i * 1.57) * 0.6)), m.black));
  upper.add(las);
  core.add(upper);
  return { group, core, srbs, upper, icps, orion, las, smPanels, arrays, rs25, srbNozzle: V(0, -2.9, 0), rl10: V(0, -8, 0) };
}

/** the Orion's service module after the panels are gone: its four solar wings unfolded (k 0..1) */
export function deployOrion(r: SlsRig, k: number): void {
  for (const a of r.arrays) {
    a.visible = k > 0.01;
    const w = a.getObjectByName('wing')!;
    w.scale.x = 0.15 + 0.85 * k;
    a.rotation.z = (1 - k) * 1.2;
  }
}
