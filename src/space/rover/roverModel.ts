// NASA's Perseverance (Mars 2020) rover, and its sister Curiosity (MSL), built
// part by part to their real layout and size: 3 m long, 2.7 m wide, 2.2 m to
// the top of the mast, 1,025 kg.
//
// The mobility system is the rocker-bogie: on each side a rocker pivots on the
// body and carries the front wheel and a bogie, which carries the middle and
// rear wheels; a differential bar across the deck ties the two rockers, so the
// body takes the average of their angles. Six 52.5 cm aluminium wheels with 48
// curved grousers each and titanium flexure spokes; the four corner wheels steer.
//
// On the deck: the Remote Sensing Mast (Mastcam-Z's zoom pair, SuperCam's
// telescope, the Navcams, the MEDA wind booms), the high-gain antenna on its
// gimbal, the UHF and low-gain antennas, the calibration targets; at the back
// the MMRTG nuclear power source with its eight fins and the big heat-rejection
// radiators; at the front the 2.1 m robotic arm with its 45 kg turret (the
// coring drill, PIXL, SHERLOC and WATSON), the bit carousel, and the Hazcams.
//
// Every part that moves in real life moves here: the wheels roll and steer, the
// suspension follows the ground, the mast pans and tilts, the antenna tracks,
// the arm unfolds and the drill spins.
//
// Frame: metres, origin on the ground under the middle of the rover, +Y up,
// -Z forward, +X right.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type MatKey = 'white' | 'body' | 'alu' | 'darkAlu' | 'ti' | 'black' | 'glass' | 'gold' | 'copper' | 'rtg' | 'fin' | 'carbon' | 'red' | 'blue' | 'cable' | 'tire' | 'label';

/** collects geometry by material and merges it into one mesh per material */
class Parts {
  private g = new Map<MatKey, THREE.BufferGeometry[]>();
  add(m: MatKey, geo: THREE.BufferGeometry, mat?: THREE.Matrix4): void {
    const gg = geo.index ? geo.toNonIndexed() : geo;
    if (mat) gg.applyMatrix4(mat);
    if (!gg.attributes.normal) gg.computeVertexNormals();
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((gg.attributes.position.count) * 2), 2));
    let l = this.g.get(m);
    if (!l) this.g.set(m, (l = []));
    l.push(gg);
  }
  build(parent: THREE.Object3D, mats: Record<MatKey, THREE.Material>): void {
    for (const [k, list] of this.g) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mats[k]);
      mesh.castShadow = k !== 'glass';
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.g.clear();
  }
}

// ---------------------------------------------------------------- shape helpers
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const M = new THREE.Matrix4();
function at(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')), V(sx, sy, sz));
}
function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}
/** a box with bevelled edges */
function bbox(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -h / 2);
  s.lineTo(x, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -y);
  s.lineTo(w / 2, y);
  s.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  s.lineTo(-x, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  s.lineTo(-w / 2, -y);
  s.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.6, bevelSegments: seg, curveSegments: seg * 2 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}
function cyl(r0: number, r1: number, h: number, seg = 24, open = false): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r1, r0, h, seg, 1, open);
}
/** a cylinder from a to b */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 12, r1 = r): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const L = d.length();
  const g = new THREE.CylinderGeometry(r1, r, L, seg, 1, false);
  g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}
function tube(pts: THREE.Vector3[], r: number, seg = 8, samples = 32): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), samples, r, seg, false);
}
function sph(r: number, seg = 16): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2));
}
function torus(R: number, r: number, seg = 32, tseg = 8, arc = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.TorusGeometry(R, r, tseg, seg, arc);
}
/** a camera: a black box with a lens barrel and glass (looking along -Z) */
function camera(P: Parts, m: THREE.Matrix4, w = 0.06, h = 0.05, d = 0.08, lensR = 0.016, lensL = 0.03): void {
  P.add('black', bbox(w, h, d, 0.006), m);
  P.add('darkAlu', cyl(lensR * 1.25, lensR * 1.1, lensL, 20).rotateX(Math.PI / 2).translate(0, 0, -d / 2 - lensL / 2), m);
  P.add('glass', new THREE.CircleGeometry(lensR, 20).rotateY(Math.PI).translate(0, 0, -d / 2 - lensL - 0.0005), m);
}
/** bolt heads in a circle (around Z) */
function bolts(P: Parts, m: THREE.Matrix4, R: number, n: number, r = 0.006, h = 0.005, key: MatKey = 'ti'): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    P.add(key, cyl(r, r, h, 6).rotateX(Math.PI / 2).translate(Math.cos(a) * R, Math.sin(a) * R, h / 2), m);
  }
}

// ---------------------------------------------------------------- materials
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

let MATS: Record<MatKey, THREE.Material> | null = null;
export function roverMaterials(): Record<MatKey, THREE.Material> {
  if (MATS) return MATS;
  // multi-layer insulation: crinkled gold foil
  const mli = canvasTex(256, 256, (g) => {
    g.fillStyle = '#c99a3a';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,230,150' : '110,70,20'},${0.08 + Math.random() * 0.18})`;
      g.beginPath();
      g.ellipse(x, y, 3 + Math.random() * 14, 1 + Math.random() * 5, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  mli.wrapS = mli.wrapT = THREE.RepeatWrapping;
  // the body's white paint, a little dusty
  const paint = canvasTex(256, 256, (g) => {
    g.fillStyle = '#f4f2ee';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(170,120,80,${Math.random() * 0.025})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 30, 1 + Math.random() * 6);
    }
  });
  paint.wrapS = paint.wrapT = THREE.RepeatWrapping;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  MATS = {
    white: std({ color: '#ffffff', roughness: 0.6, metalness: 0.02, map: paint }),
    body: std({ color: '#f2f0ec', roughness: 0.55, metalness: 0.05, map: paint }),
    alu: std({ color: '#c9ccd0', roughness: 0.32, metalness: 0.9 }),
    darkAlu: std({ color: '#55585d', roughness: 0.4, metalness: 0.85, side: THREE.DoubleSide }),
    ti: std({ color: '#9a9c9f', roughness: 0.38, metalness: 0.9 }),
    black: std({ color: '#151618', roughness: 0.5, metalness: 0.3 }),
    glass: std({ color: '#0a0f18', roughness: 0.05, metalness: 0.2, emissive: new THREE.Color('#0a1626'), emissiveIntensity: 0.4 }),
    gold: std({ color: '#d9a740', roughness: 0.28, metalness: 1, map: mli }),
    copper: std({ color: '#b5653a', roughness: 0.35, metalness: 0.9 }),
    rtg: std({ color: '#7a7c80', roughness: 0.45, metalness: 0.7 }),
    fin: std({ color: '#cfd2d6', roughness: 0.4, metalness: 0.6 }),
    carbon: std({ color: '#2a2b2e', roughness: 0.6, metalness: 0.2 }),
    red: std({ color: '#b3261e', roughness: 0.5 }),
    blue: std({ color: '#1f3b8a', roughness: 0.5 }),
    cable: std({ color: '#3a3328', roughness: 0.75 }),
    tire: std({ color: '#c4c7cb', roughness: 0.38, metalness: 0.8, side: THREE.DoubleSide }),
    label: std({ color: '#ffffff', roughness: 0.5, map: labelTex() }),
  };
  return MATS;
}

/** the decals: NASA's "meatball", the JPL logo, the flag, the family portrait plate */
function labelTex(): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = '#f1efe9';
    g.fillRect(0, 0, 512, 256);
    // the meatball
    g.fillStyle = '#0b3d91';
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 34px Arial';
    g.textAlign = 'center';
    g.fillText('NASA', 64, 76);
    g.strokeStyle = '#fc3d21';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(14, 96);
    g.quadraticCurveTo(64, 30, 118, 40);
    g.stroke();
    // JPL
    g.fillStyle = '#1c1c1c';
    g.font = 'bold 54px Arial';
    g.fillText('JPL', 196, 84);
    // the flag
    for (let i = 0; i < 13; i++) {
      g.fillStyle = i % 2 ? '#fff' : '#b22234';
      g.fillRect(260, 20 + i * 7.7, 180, 7.7);
    }
    g.fillStyle = '#3c3b6e';
    g.fillRect(260, 20, 74, 54);
    // the family-portrait plate and the "explore as one" Morse code
    g.fillStyle = '#9da0a4';
    g.fillRect(20, 150, 470, 90);
    g.fillStyle = '#3b3e42';
    g.font = 'bold 18px Arial';
    g.fillText('PERSEVERANCE · MARS 2020', 255, 180);
    g.font = '15px monospace';
    g.fillText('·  ·  ·  —  ·  —  —  ·  ·  ·   — — —  ·  — ·  ·', 255, 210);
  });
}

// ---------------------------------------------------------------- the wheel
/**
 * A 52.5 cm aluminium wheel: a thin machined rim, 48 gently curved grousers,
 * and a hub held by titanium flexure spokes that soak up shocks. Axle along X.
 */
function wheelParts(P: Parts, side: 1 | -1, curiosity: boolean): void {
  const R = 0.2625, W = curiosity ? 0.4 : 0.4;
  const seg = 96;
  // the rim's skin
  P.add('tire', cyl(R, R, W, seg, true).rotateZ(Math.PI / 2));
  P.add('darkAlu', cyl(R - 0.004, R - 0.004, W, seg, true).rotateZ(Math.PI / 2).scale(1, 1, 1));
  // the rolled lips at each edge
  for (const s of [-1, 1]) P.add('tire', torus(R - 0.002, 0.006, seg, 6).rotateY(Math.PI / 2).translate((s * W) / 2, 0, 0));
  // grousers: Perseverance's are gently curved (Curiosity's are straight chevrons)
  const n = curiosity ? 24 : 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    const steps = 6;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps - 0.5;
      // curved across the tread (a shallow S on Perseverance, a V on Curiosity)
      const da = curiosity ? Math.abs(u) * 0.12 : Math.sin(u * Math.PI) * 0.05;
      pts.push(V(u * W * 0.98, Math.cos(a + da) * (R + 0.006), Math.sin(a + da) * (R + 0.006)));
    }
    P.add('tire', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0045, 5, false));
  }
  // Curiosity's wheels carry the Morse-code holes (J P L); here as dark dots on the tread
  if (curiosity) for (let i = 0; i < 12; i++) P.add('black', new THREE.CircleGeometry(0.008, 8).rotateY(Math.PI / 2).translate(0.001, Math.cos(i * 0.52) * R, Math.sin(i * 0.52) * R));
  // the inner hub disc, the flexure spokes and the outer hub
  const hubX = side * 0.04;
  P.add('ti', cyl(0.055, 0.055, 0.09, 32).rotateZ(Math.PI / 2).translate(hubX, 0, 0));
  P.add('darkAlu', cyl(0.035, 0.035, 0.1, 24).rotateZ(Math.PI / 2).translate(hubX + side * 0.01, 0, 0));
  bolts(P, at(hubX + side * 0.046, 0, 0, 0, (side * Math.PI) / 2, 0), 0.04, 8, 0.0055, 0.006);
  const spokes = 6;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    // a curved flexure from the hub out to the rim
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const rr = 0.055 + u * (R - 0.065);
      const aa = a + Math.sin(u * Math.PI) * 0.35;
      pts.push(V(hubX * (1 - u) + side * 0.02 * u, Math.cos(aa) * rr, Math.sin(aa) * rr));
    }
    P.add('ti', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.007, 6, false));
  }
  // the inner face of the rim (dark inside the wheel)
  P.add('darkAlu', new THREE.RingGeometry(R - 0.03, R - 0.002, seg, 1).rotateY(Math.PI / 2).translate((-side * W) / 2 + side * 0.002, 0, 0));
}

// ---------------------------------------------------------------- the rig
export interface RoverWheel {
  /** steering pivot (corner wheels) */
  steer: THREE.Group | null;
  /** the wheel itself: rolls about X */
  spin: THREE.Group;
  /** where the wheel touches the ground, rover frame, at rest */
  rest: THREE.Vector3;
  side: 1 | -1;
}

export interface RoverRig {
  group: THREE.Group;
  /** the body, which tilts with the suspension */
  body: THREE.Group;
  rockers: THREE.Group[];
  bogies: THREE.Group[];
  wheels: RoverWheel[];
  diff: THREE.Group;
  mastAz: THREE.Group;
  mastEl: THREE.Group;
  hgaAz: THREE.Group;
  hgaEl: THREE.Group;
  /** the arm's joints: shoulder azimuth, shoulder elevation, elbow, wrist, turret */
  arm: THREE.Group[];
  drill: THREE.Group;
  /** where the drill bit's tip is (in the drill group) */
  drillTip: THREE.Vector3;
  /** the coring bit carousel at the front */
  carousel: THREE.Group;
  /** headlights / camera status LEDs */
  lamps: THREE.Mesh[];
  curiosity: boolean;
}

/** geometric constants of the mobility system (Perseverance) */
export const ROVER = {
  wheelR: 0.2625,
  // wheel axles: z (forward negative), half-track
  front: { z: -0.89, x: 1.04 },
  middle: { z: -0.04, x: 1.12 },
  rear: { z: 0.83, x: 1.04 },
  rockerPivot: { z: -0.12, y: 0.86, x: 0.83 },
  bogiePivot: { z: 0.4, y: 0.6 },
  /** deck height */
  deck: 1.12,
  length: 3.0,
  mass: 1025,
};

/** build Perseverance (or Curiosity) */
export function buildRover(curiosity = false): RoverRig {
  const mats = roverMaterials();
  const group = new THREE.Group();
  group.name = curiosity ? 'Curiosity' : 'Perseverance';
  const body = new THREE.Group();
  group.add(body);
  const R = ROVER;

  // ======================================================= the warm electronics box and the deck
  const B = new Parts();
  const bx0 = -0.58, bx1 = 0.58, bz0 = -0.86, bz1 = 0.74, by0 = 0.6, by1 = R.deck;
  const bw = bx1 - bx0, bd = bz1 - bz0, bh = by1 - by0;
  B.add('body', bbox(bw, bh, bd, 0.03, 2), at(0, (by0 + by1) / 2, (bz0 + bz1) / 2));
  // the belly pan and the side panels with their stiffening ribs
  B.add('darkAlu', box(bw - 0.06, 0.02, bd - 0.06), at(0, by0 - 0.01, (bz0 + bz1) / 2));
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) B.add('white', box(0.012, bh - 0.08, 0.02), at(s * (bx1 + 0.004), (by0 + by1) / 2, bz0 + 0.14 + i * 0.22));
    // gold insulation blankets on the sides
    B.add('gold', box(0.006, bh * 0.55, bd * 0.4), at(s * (bx1 + 0.005), by0 + bh * 0.35, bz0 + bd * 0.62));
    // cable harnesses running along the body to the wheels
    B.add('cable', tube([V(s * (bx1 + 0.02), by1 - 0.06, bz0 + 0.1), V(s * (bx1 + 0.03), by1 - 0.1, bz0 + 0.6), V(s * (bx1 + 0.03), by1 - 0.12, bz0 + 1.2), V(s * (bx1 + 0.02), by1 - 0.08, bz1 - 0.05)], 0.012, 6, 40));
  }
  // the deck top: equipment plates, a raised rim
  B.add('white', box(bw + 0.04, 0.025, bd + 0.04), at(0, by1 + 0.012, (bz0 + bz1) / 2));
  for (const [x, z, w, d, h] of [[-0.3, -0.45, 0.32, 0.36, 0.09], [0.12, -0.1, 0.36, 0.3, 0.07], [-0.26, 0.1, 0.4, 0.34, 0.12], [0.3, 0.32, 0.3, 0.3, 0.1], [-0.1, 0.5, 0.5, 0.18, 0.06]] as number[][]) {
    B.add('white', bbox(w, h, d, 0.012), at(x, by1 + 0.025 + h / 2, z));
    B.add('gold', box(w * 0.7, 0.004, d * 0.7), at(x, by1 + 0.026 + h, z));
  }
  // the decals plate on the deck (NASA, JPL, the flag, the family portrait)
  B.add('label', new THREE.PlaneGeometry(0.36, 0.18).rotateX(-Math.PI / 2), at(0.26, by1 + 0.026, -0.62));
  // the Mastcam-Z calibration target and the sundial post
  B.add('alu', bbox(0.1, 0.03, 0.1, 0.006), at(0.52, by1 + 0.05, 0.05));
  B.add('red', cyl(0.012, 0.012, 0.008, 12), at(0.5, by1 + 0.068, 0.03));
  B.add('blue', cyl(0.012, 0.012, 0.008, 12), at(0.54, by1 + 0.068, 0.07));
  B.add('alu', cyl(0.004, 0.004, 0.06, 6), at(0.52, by1 + 0.09, 0.05));
  // grilles and vents along the top edge
  for (let i = 0; i < 14; i++) B.add('darkAlu', box(0.5, 0.008, 0.01), at(-0.05, by1 + 0.03, 0.62 - i * 0.022));
  // the front of the body: the Hazcam pair bracket, the bumper, the sample tube window
  B.add('darkAlu', bbox(0.9, 0.08, 0.06, 0.01), at(0, by0 + 0.02, bz0 - 0.06));
  for (const s of [-1, 1]) {
    camera(B, at(s * 0.16, by0 + 0.13, bz0 - 0.03, -0.35, 0, 0), 0.07, 0.05, 0.06, 0.015, 0.02);
    camera(B, at(s * 0.26, by0 + 0.13, bz0 - 0.03, -0.35, 0, 0), 0.07, 0.05, 0.06, 0.015, 0.02);
  }
  // rear Hazcams
  for (const s of [-1, 1]) camera(B, at(s * 0.18, by0 + 0.08, bz1 + 0.04, -0.45, Math.PI, 0), 0.07, 0.05, 0.06, 0.015, 0.02);
  // the adaptive caching assembly's bit carousel (a disc at the front underside)
  const carousel = new THREE.Group();
  carousel.position.set(0.18, by0 + 0.08, bz0 - 0.02);
  carousel.rotation.x = 0.35;
  {
    const C = new Parts();
    C.add('alu', cyl(0.16, 0.16, 0.05, 48));
    C.add('darkAlu', cyl(0.165, 0.165, 0.012, 48).translate(0, 0.03, 0));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      C.add('ti', cyl(0.018, 0.018, 0.07, 12).translate(Math.cos(a) * 0.12, -0.01, Math.sin(a) * 0.12));
      C.add('black', cyl(0.008, 0.008, 0.072, 8).translate(Math.cos(a) * 0.12, -0.01, Math.sin(a) * 0.12));
    }
    C.build(carousel, mats);
  }
  body.add(carousel);
  // the belly: the RIMFAX ground-penetrating radar antenna at the back, the MOXIE vent, the sample tubes' bay
  B.add('black', bbox(0.25, 0.04, 0.12, 0.01), at(0.18, by0 - 0.03, bz1 - 0.05));
  B.add('darkAlu', cyl(0.03, 0.03, 0.05, 16), at(-0.3, by0 - 0.02, -0.2));
  B.add('alu', box(0.42, 0.05, 0.3), at(-0.12, by0 - 0.035, -0.5));
  for (let i = 0; i < 8; i++) B.add('ti', cyl(0.012, 0.012, 0.26, 10).rotateX(Math.PI / 2), at(-0.28 + i * 0.045, by0 - 0.07, -0.5));

  // ======================================================= the MMRTG and its radiators (at the back)
  {
    const t = at(0, 0.98, bz1 + 0.24, -0.5, 0, 0);
    B.add('rtg', cyl(0.2, 0.2, 0.66, 40), new THREE.Matrix4().multiplyMatrices(t, at(0, 0, 0, Math.PI / 2, 0, 0)));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const fin = box(0.006, 0.62, 0.11);
      fin.translate(0, 0, 0.2 + 0.055);
      fin.rotateY(0);
      const m = new THREE.Matrix4().multiplyMatrices(t, new THREE.Matrix4().multiplyMatrices(at(0, 0, 0, Math.PI / 2, 0, 0), at(0, 0, 0, 0, a, 0)));
      B.add('fin', fin, m);
    }
    // end caps
    for (const s of [-1, 1]) B.add('darkAlu', cyl(0.21, 0.21, 0.03, 40), new THREE.Matrix4().multiplyMatrices(t, at(0, 0, s * 0.34, Math.PI / 2, 0, 0)));
    // the big heat-rejection radiators either side (the white "ears")
    for (const s of [-1, 1]) {
      B.add('white', box(0.02, 0.34, 0.5), at(s * 0.4, 1.02, bz1 + 0.2, -0.5, 0, s * 0.18));
      for (let i = 0; i < 5; i++) B.add('copper', cyl(0.005, 0.005, 0.48, 6).rotateX(Math.PI / 2), at(s * 0.412, 0.9 + i * 0.06, bz1 + 0.17 + i * 0.03, -0.5, 0, s * 0.18));
    }
    // the mounting struts back to the body
    for (const s of [-1, 1]) B.add('ti', rod(V(s * 0.3, by1 - 0.05, bz1), V(s * 0.16, 0.95, bz1 + 0.2), 0.012, 8));
  }

  // ======================================================= antennas
  // the high-gain antenna: a hexagonal flat panel on a two-axis gimbal (rear left of the deck)
  const hgaAz = new THREE.Group();
  hgaAz.position.set(-0.36, by1 + 0.12, 0.38);
  const hgaEl = new THREE.Group();
  hgaEl.position.set(0, 0.16, 0);
  hgaAz.add(hgaEl);
  {
    const H = new Parts();
    H.add('alu', cyl(0.05, 0.06, 0.16, 24).translate(0, -0.08, 0));
    H.add('darkAlu', cyl(0.04, 0.04, 0.1, 20).rotateZ(Math.PI / 2).translate(0, 0, 0));
    H.build(hgaAz, mats);
    const E = new Parts();
    const hex = new THREE.CylinderGeometry(0.17, 0.17, 0.03, 6);
    E.add('white', hex.clone().rotateX(Math.PI / 2).translate(0, 0.0, -0.05));
    E.add('gold', new THREE.CircleGeometry(0.15, 6).rotateY(Math.PI).translate(0, 0, -0.0655));
    for (let i = 0; i < 6; i++) E.add('alu', box(0.01, 0.01, 0.06), at(Math.cos(i * 1.047) * 0.08, Math.sin(i * 1.047) * 0.08, -0.03));
    E.build(hgaEl, mats);
  }
  body.add(hgaAz);
  // the UHF antenna (a short helix in a white radome) and the low-gain antenna (a squat cylinder)
  B.add('white', cyl(0.045, 0.045, 0.2, 20), at(-0.5, by1 + 0.12, -0.2));
  B.add('darkAlu', cyl(0.05, 0.05, 0.02, 20), at(-0.5, by1 + 0.03, -0.2));
  B.add('alu', cyl(0.035, 0.05, 0.15, 20), at(-0.52, by1 + 0.1, 0.62));
  B.add('white', sph(0.04, 16), at(-0.52, by1 + 0.18, 0.62));

  // ======================================================= the remote sensing mast (front right)
  const mastBase = V(0.42, by1 + 0.02, -0.68);
  B.add('darkAlu', cyl(0.07, 0.08, 0.06, 24), at(mastBase.x, mastBase.y + 0.03, mastBase.z));
  const mastAz = new THREE.Group();
  mastAz.position.set(mastBase.x, mastBase.y + 0.06, mastBase.z);
  const mastEl = new THREE.Group();
  const mastH = 0.96;
  mastEl.position.set(0, mastH, 0);
  mastAz.add(mastEl);
  {
    const Mp = new Parts();
    // the mast tube (carbon composite, white sleeve) with joints
    Mp.add('white', cyl(0.042, 0.048, mastH - 0.1, 28).translate(0, (mastH - 0.1) / 2 + 0.05, 0));
    Mp.add('darkAlu', cyl(0.055, 0.055, 0.06, 24).translate(0, 0.04, 0));
    Mp.add('darkAlu', cyl(0.05, 0.05, 0.05, 24).translate(0, mastH * 0.55, 0));
    Mp.add('darkAlu', cyl(0.054, 0.054, 0.08, 24).translate(0, mastH - 0.04, 0));
    Mp.add('cable', tube([V(0.045, 0.06, 0.0), V(0.05, mastH * 0.4, 0.01), V(0.048, mastH * 0.8, 0.0), V(0.03, mastH - 0.02, 0.02)], 0.008, 6, 24));
    // the MEDA wind sensors: two booms partway up the mast
    for (const [ang, y] of [[0.4, 0.62], [2.6, 0.62]] as number[][]) {
      const d = V(Math.cos(ang), 0, -Math.sin(ang));
      const a0 = V(d.x * 0.045, y, d.z * 0.045), a1 = V(d.x * 0.26, y + 0.02, d.z * 0.26);
      Mp.add('ti', rod(a0, a1, 0.008, 8));
      Mp.add('white', cyl(0.018, 0.018, 0.08, 12).translate(a1.x, a1.y + 0.03, a1.z));
      for (let k = 0; k < 3; k++) Mp.add('alu', rod(a1.clone().add(V(0, 0.07, 0)), a1.clone().add(V(Math.cos(k * 2.1) * 0.04, 0.11, Math.sin(k * 2.1) * 0.04)), 0.0025, 4));
    }
    // the elevation actuator housing
    Mp.add('alu', bbox(0.14, 0.08, 0.1, 0.01).translate(0, mastH - 0.02, 0));
    Mp.build(mastAz, mats);
    // the head: SuperCam's telescope in the middle, Mastcam-Z's zoom pair, the Navcams; looks along -Z
    const Hd = new Parts();
    Hd.add('white', bbox(0.36, 0.16, 0.22, 0.02), at(0, 0.1, 0));
    Hd.add('gold', box(0.3, 0.004, 0.18), at(0, 0.182, 0));
    // SuperCam: a big round window
    Hd.add('darkAlu', cyl(0.07, 0.07, 0.04, 40).rotateX(Math.PI / 2), at(0, 0.11, -0.12));
    Hd.add('black', torus(0.062, 0.008, 40, 8), at(0, 0.11, -0.142));
    Hd.add('glass', new THREE.CircleGeometry(0.058, 40).rotateY(Math.PI), at(0, 0.11, -0.141));
    // Mastcam-Z: two zoom cameras either side, longer barrels
    for (const s of [-1, 1]) {
      Hd.add('black', bbox(0.08, 0.075, 0.13, 0.008), at(s * 0.13, 0.12, -0.06));
      Hd.add('darkAlu', cyl(0.026, 0.024, 0.06, 24).rotateX(Math.PI / 2), at(s * 0.13, 0.12, -0.15));
      Hd.add('glass', new THREE.CircleGeometry(0.02, 24).rotateY(Math.PI), at(s * 0.13, 0.12, -0.181));
      // the Navcams below
      camera(Hd, at(s * 0.07, 0.035, -0.09), 0.05, 0.035, 0.06, 0.011, 0.015);
    }
    // the infrared spectrometer port and a small lamp
    Hd.add('black', box(0.04, 0.03, 0.02), at(0, 0.035, -0.11));
    Hd.build(mastEl, mats);
  }
  body.add(mastAz);

  // ======================================================= the robotic arm (front)
  // stowed: the arm folds across the front of the rover
  const arm: THREE.Group[] = [];
  const shoulder = new THREE.Group();
  shoulder.position.set(-0.42, by0 + 0.2, bz0 - 0.06);
  body.add(shoulder);
  arm.push(shoulder); // azimuth about Y
  const shoulderEl = new THREE.Group();
  shoulder.add(shoulderEl);
  arm.push(shoulderEl); // elevation about X
  const elbow = new THREE.Group();
  elbow.position.set(0, 0, -1.0); // upper arm 1.0 m
  shoulderEl.add(elbow);
  arm.push(elbow);
  const wrist = new THREE.Group();
  wrist.position.set(0, 0, -0.9); // forearm 0.9 m
  elbow.add(wrist);
  arm.push(wrist);
  const turret = new THREE.Group();
  turret.position.set(0, 0, -0.12);
  wrist.add(turret);
  arm.push(turret);
  {
    const S = new Parts();
    S.add('alu', bbox(0.16, 0.16, 0.14, 0.015));
    S.add('darkAlu', cyl(0.07, 0.07, 0.2, 28).rotateZ(Math.PI / 2));
    S.build(shoulder, mats);
    const U = new Parts();
    // upper arm: a tapered box beam, with its actuator at the elbow and cable runs
    U.add('white', bbox(0.1, 0.09, 0.96, 0.02), at(0, 0, -0.5));
    U.add('darkAlu', cyl(0.06, 0.06, 0.16, 24).rotateZ(Math.PI / 2), at(0, 0, -1.0));
    U.add('cable', tube([V(0.06, 0.03, -0.05), V(0.065, 0.035, -0.5), V(0.06, 0.03, -0.95)], 0.009, 6, 20));
    U.add('gold', box(0.002, 0.06, 0.7), at(-0.052, 0, -0.5));
    U.build(shoulderEl, mats);
    const F = new Parts();
    F.add('white', bbox(0.09, 0.08, 0.86, 0.02), at(0, 0, -0.45));
    F.add('darkAlu', cyl(0.055, 0.055, 0.14, 24).rotateZ(Math.PI / 2), at(0, 0, -0.9));
    F.add('cable', tube([V(-0.055, 0.03, -0.05), V(-0.06, 0.035, -0.45), V(-0.055, 0.03, -0.86)], 0.008, 6, 20));
    F.build(elbow, mats);
    const Wr = new Parts();
    Wr.add('alu', bbox(0.12, 0.12, 0.12, 0.012));
    Wr.add('darkAlu', cyl(0.05, 0.05, 0.16, 20));
    Wr.build(wrist, mats);
  }
  // the turret: a hub with five tools round it
  const drill = new THREE.Group();
  const drillTip = V(0, -0.42, 0);
  {
    const T = new Parts();
    T.add('alu', cyl(0.12, 0.12, 0.1, 6), at(0, 0, 0, Math.PI / 2, 0, 0));
    T.add('gold', cyl(0.122, 0.122, 0.04, 6), at(0, 0, 0, Math.PI / 2, 0, 0));
    // PIXL (an X-ray spectrometer with a hexapod), SHERLOC + WATSON (a camera and a UV laser), GDRT and the contact sensor
    const tools: [number, string][] = [[1.05, 'pixl'], [2.1, 'sherloc'], [3.15, 'gdrt'], [4.2, 'fcs']];
    for (const [a, k] of tools) {
      const d = V(Math.cos(a), Math.sin(a), 0);
      const base = d.clone().multiplyScalar(0.12);
      if (k === 'pixl') {
        T.add('white', bbox(0.14, 0.12, 0.16, 0.012), at(base.x + d.x * 0.08, base.y + d.y * 0.08, 0, 0, 0, a));
        for (let i = 0; i < 6; i++) T.add('ti', rod(V(base.x + d.x * 0.15, base.y + d.y * 0.15, -0.05 + (i % 3) * 0.05), V(base.x + d.x * 0.2, base.y + d.y * 0.2, -0.03 + (i % 3) * 0.03), 0.005, 6));
        T.add('black', cyl(0.035, 0.035, 0.04, 16), at(base.x + d.x * 0.22, base.y + d.y * 0.22, 0, 0, 0, a - Math.PI / 2));
      } else if (k === 'sherloc') {
        T.add('white', bbox(0.12, 0.14, 0.12, 0.012), at(base.x + d.x * 0.07, base.y + d.y * 0.07, 0, 0, 0, a));
        camera(T, at(base.x + d.x * 0.16, base.y + d.y * 0.16, 0.03, 0, Math.PI / 2, a), 0.05, 0.04, 0.06, 0.012, 0.02);
        T.add('black', cyl(0.02, 0.02, 0.05, 12), at(base.x + d.x * 0.17, base.y + d.y * 0.17, -0.03, 0, 0, a - Math.PI / 2));
      } else if (k === 'gdrt') {
        T.add('darkAlu', cyl(0.03, 0.025, 0.12, 16), at(base.x + d.x * 0.06, base.y + d.y * 0.06, 0, 0, 0, a - Math.PI / 2));
        T.add('ti', cyl(0.035, 0.035, 0.012, 16), at(base.x + d.x * 0.12, base.y + d.y * 0.12, 0, 0, 0, a - Math.PI / 2));
      } else {
        T.add('alu', cyl(0.012, 0.012, 0.14, 8), at(base.x + d.x * 0.07, base.y + d.y * 0.07, 0, 0, 0, a - Math.PI / 2));
        T.add('black', sph(0.018, 10), at(base.x + d.x * 0.14, base.y + d.y * 0.14, 0));
      }
    }
    T.build(turret, mats);
    // the coring drill, pointing down (-Y of the turret): the percussive drill body, its stabilizers, the bit
    const Dh = new Parts();
    Dh.add('white', bbox(0.16, 0.26, 0.16, 0.015), at(0, -0.22, 0));
    Dh.add('darkAlu', cyl(0.05, 0.05, 0.06, 20), at(0, -0.37, 0));
    for (const s of [-1, 1]) Dh.add('ti', rod(V(s * 0.07, -0.3, 0), V(s * 0.09, -0.43, 0), 0.008, 8));
    Dh.build(turret, mats);
    drill.position.set(0, -0.4, 0);
    const Db = new Parts();
    Db.add('ti', cyl(0.014, 0.014, 0.08, 16).translate(0, -0.03, 0));
    for (let k = 0; k < 3; k++) Db.add('alu', box(0.004, 0.07, 0.03), at(0, -0.03, 0, 0, (k * Math.PI * 2) / 3, 0));
    Db.build(drill, mats);
    turret.add(drill);
  }

  B.build(body, mats);

  // ======================================================= the mobility system
  const rockers: THREE.Group[] = [];
  const bogies: THREE.Group[] = [];
  const wheels: RoverWheel[] = [];
  for (const side of [-1, 1] as (1 | -1)[]) {
    // the rocker pivots on the body
    const rk = new THREE.Group();
    rk.position.set(side * R.rockerPivot.x, R.rockerPivot.y, R.rockerPivot.z);
    group.add(rk);
    rockers.push(rk);
    const Rk = new Parts();
    // rocker: from the pivot forward and down to the front wheel's steering knuckle, and back to the bogie pivot
    const piv = V(0, 0, 0);
    // (each wheel hangs 0.24 m outboard of its leg)
    const frontKnuckle = V(side * (R.front.x - 0.24 - R.rockerPivot.x), 0.6 - R.rockerPivot.y, R.front.z - R.rockerPivot.z);
    const bogieP = V(side * (0.95 - R.rockerPivot.x), R.bogiePivot.y - R.rockerPivot.y, R.bogiePivot.z - R.rockerPivot.z);
    const mid1 = V(side * 0.12, 0.05, -0.32);
    Rk.add('ti', tube([piv, mid1, frontKnuckle], 0.032, 10, 30));
    Rk.add('ti', tube([piv, V(side * 0.08, 0.0, 0.25), bogieP], 0.03, 10, 30));
    Rk.add('darkAlu', cyl(0.06, 0.06, 0.12, 24).rotateZ(Math.PI / 2));
    Rk.add('darkAlu', cyl(0.05, 0.05, 0.1, 24).rotateZ(Math.PI / 2).translate(bogieP.x, bogieP.y, bogieP.z));
    Rk.add('cable', tube([V(side * 0.03, 0.04, 0), V(side * 0.15, 0.06, -0.35), frontKnuckle.clone().add(V(0, 0.08, 0))], 0.009, 6, 24));
    Rk.build(rk, mats);
    // the bogie: carries the middle and rear wheels
    const bg = new THREE.Group();
    bg.position.copy(bogieP);
    rk.add(bg);
    bogies.push(bg);
    const Bg = new Parts();
    const midTop = V(side * (R.middle.x - 0.24 - 0.95), 0.6 - R.bogiePivot.y, R.middle.z - R.bogiePivot.z);
    const rearTop = V(side * (R.rear.x - 0.24 - 0.95), 0.6 - R.bogiePivot.y, R.rear.z - R.bogiePivot.z);
    Bg.add('ti', tube([V(0, 0, 0), V(side * 0.04, 0.02, -0.15), midTop], 0.028, 10, 24));
    Bg.add('ti', tube([V(0, 0, 0), V(side * 0.02, 0.02, 0.15), rearTop], 0.028, 10, 24));
    Bg.build(bg, mats);
    // the wheels: front on the rocker (steering), middle and rear on the bogie (rear steers)
    const mk = (parent: THREE.Group, top: THREE.Vector3, steers: boolean, wz: number, wx: number) => {
      const holder = new THREE.Group();
      holder.position.copy(top);
      parent.add(holder);
      let steerG: THREE.Group | null = null;
      let mount = holder;
      if (steers) {
        steerG = new THREE.Group();
        holder.add(steerG);
        mount = steerG;
        const St = new Parts();
        // the steering actuator: a drum above the wheel
        St.add('alu', cyl(0.065, 0.065, 0.14, 24).translate(0, 0.06, 0));
        St.add('darkAlu', cyl(0.07, 0.07, 0.02, 24).translate(0, 0.13, 0));
        bolts(St, at(0, 0.141, 0, -Math.PI / 2, 0, 0), 0.055, 8, 0.004, 0.004);
        St.build(steerG, mats);
      }
      // the leg down to the axle, the drive motor in the hub
      const Lg = new Parts();
      const axleY = R.wheelR - 0.6;
      Lg.add('ti', rod(V(0, 0, 0), V(side * 0.05, axleY, 0), 0.026, 12));
      Lg.add('darkAlu', cyl(0.05, 0.05, 0.12, 24).rotateZ(Math.PI / 2).translate(side * 0.1, axleY, 0));
      Lg.build(mount, mats);
      const spin = new THREE.Group();
      spin.position.set(side * 0.24, axleY, 0);
      mount.add(spin);
      const Wp = new Parts();
      wheelParts(Wp, side, curiosity);
      Wp.build(spin, mats);
      wheels.push({ steer: steerG, spin, rest: V(side * wx, 0, wz), side });
    };
    mk(rk, frontKnuckle, true, R.front.z, R.front.x);
    mk(bg, midTop, false, R.middle.z, R.middle.x);
    mk(bg, rearTop, true, R.rear.z, R.rear.x);
  }
  // the differential bar across the deck: pivots in the middle, links to each rocker
  const diff = new THREE.Group();
  diff.position.set(0, R.deck + 0.12, 0.12);
  body.add(diff);
  {
    const D = new Parts();
    D.add('ti', cyl(0.025, 0.025, 1.5, 16).rotateZ(Math.PI / 2));
    D.add('darkAlu', cyl(0.05, 0.05, 0.1, 20));
    for (const s of [-1, 1]) D.add('darkAlu', sph(0.035, 12).translate(s * 0.76, 0, 0));
    D.build(diff, mats);
  }
  // the links from the diff bar down to the rockers
  {
    const Lk = new Parts();
    for (const s of [-1, 1]) Lk.add('ti', rod(V(s * 0.76, R.deck + 0.12, 0.12), V(s * R.rockerPivot.x, R.rockerPivot.y + 0.12, 0.12), 0.012, 8));
    Lk.build(body, mats);
  }

  // status lamps (they glow faintly; the game turns them up at night)
  const lamps: THREE.Mesh[] = [];
  for (const p of [V(0.42, R.deck + 1.05, -0.78), V(-0.3, R.deck + 0.1, -0.86)]) {
    const l = new THREE.Mesh(sph(0.012, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 0.6), toneMapped: false }));
    l.position.copy(p);
    body.add(l);
    lamps.push(l);
  }
  void M;
  const rig: RoverRig = { group, body, rockers, bogies, wheels, diff, mastAz, mastEl, hgaAz, hgaEl, arm, drill, drillTip, carousel, lamps, curiosity };
  stowArm(rig);
  return rig;
}

// ---------------------------------------------------------------- poses
/** the arm folded across the front (as it drives) */
export function stowArm(r: RoverRig): void {
  setArm(r, STOW);
}
const STOW = [-Math.PI / 2, 0.12, Math.PI - 0.22, -0.9, 0];
/** the arm reaching down to the ground in front of the rover (to drill or to look) */
export function deployArm(r: RoverRig, k = 1): void {
  const stow = STOW;
  const work = [0.25, -0.35, 1.2, 0.75, 0];
  setArm(r, stow.map((s, i) => s + (work[i] - s) * k));
}
/** joint angles: shoulder azimuth, shoulder elevation, elbow, wrist, turret */
export function setArm(r: RoverRig, j: number[]): void {
  r.arm[0].rotation.set(0, j[0], 0);
  r.arm[1].rotation.set(j[1], 0, 0);
  r.arm[2].rotation.set(j[2], 0, 0);
  r.arm[3].rotation.set(j[3], 0, 0);
  r.arm[4].rotation.set(0, 0, j[4]);
}
/** the mast's pan and tilt */
export function aimMast(r: RoverRig, az: number, el: number): void {
  r.mastAz.rotation.y = az;
  r.mastEl.rotation.x = el;
}

// ---------------------------------------------------------------- Ingenuity
export interface HeliRig {
  group: THREE.Group;
  rotors: THREE.Group[];
}
/**
 * Ingenuity, the Mars helicopter: 1.8 kg, 49 cm tall, two coaxial rotors 1.2 m
 * across turning at up to 2,800 rpm, a solar panel on top, a box of avionics
 * and four spring legs.
 */
export function buildIngenuity(): HeliRig {
  const mats = roverMaterials();
  const group = new THREE.Group();
  const P = new Parts();
  // the fuselage: a gold-wrapped cube on four legs
  P.add('gold', bbox(0.14, 0.14, 0.14, 0.01), at(0, 0.2, 0));
  P.add('white', box(0.142, 0.01, 0.142), at(0, 0.272, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const d = V(Math.cos(a), 0, Math.sin(a));
    P.add('carbon', tube([d.clone().multiplyScalar(0.06).add(V(0, 0.15, 0)), d.clone().multiplyScalar(0.2).add(V(0, 0.1, 0)), d.clone().multiplyScalar(0.3).add(V(0, 0.0, 0))], 0.006, 6, 12));
    P.add('black', sph(0.012, 8), at(d.x * 0.3, 0.008, d.z * 0.3));
  }
  // the mast up to the rotors
  P.add('carbon', cyl(0.015, 0.015, 0.28, 12), at(0, 0.41, 0));
  // the solar panel on top
  P.add('blue', box(0.16, 0.006, 0.09), at(0, 0.56, 0));
  P.add('darkAlu', box(0.165, 0.004, 0.095), at(0, 0.556, 0));
  // cameras under the body: navigation (down) and colour (forward)
  P.add('black', cyl(0.01, 0.01, 0.02, 8), at(0.03, 0.12, 0));
  P.build(group, mats);
  const rotors: THREE.Group[] = [];
  for (const [y, dir] of [[0.43, 1], [0.5, -1]] as number[][]) {
    const r = new THREE.Group();
    r.position.y = y;
    const Rp = new Parts();
    Rp.add('darkAlu', cyl(0.025, 0.025, 0.03, 12));
    for (const s of [0, Math.PI]) {
      // a twisted, tapered blade, 0.6 m long
      const sh = new THREE.Shape();
      sh.moveTo(0.02, -0.03);
      sh.quadraticCurveTo(0.35, -0.06, 0.6, -0.02);
      sh.lineTo(0.6, 0.015);
      sh.quadraticCurveTo(0.3, 0.035, 0.02, 0.03);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      g.rotateX(dir * 0.08);
      g.rotateY(s);
      Rp.add('carbon', g);
    }
    Rp.build(r, mats);
    group.add(r);
    rotors.push(r);
  }
  return { group, rotors };
}
