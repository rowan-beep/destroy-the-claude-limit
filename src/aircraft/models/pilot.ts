// The pilot in the cockpit: a seated aircrew figure built to real proportions
// in real flying kit -- Nomex flight suit, survival vest and harness, anti-G
// suit chaps, gloves and boots, a helmet with its tinted visor, helmet-sight
// mount and oxygen mask on its hose -- on the jet's ejection seat, with the
// stick and throttle in his hands.
//
// Materials are procedural so they hold up at close range: the suit, gloves
// and harness carry a woven micro-normal and roughness variation in the
// shader (no textures or UVs needed), the skin gets a warm rim, the helmet is
// clear-coated paint with its reflective tape and markings painted on, and the
// visor is a dark clear-coated mirror.
//
// What moves: the stick follows the pilot's pitch and roll inputs and the
// right arm follows the hand on it (two-bone IK); the throttle slides with the
// throttle input and the left arm follows; the head looks into the turn and
// scans slowly. Everything else is one static mesh per material.

import * as THREE from 'three';
import type { AirframeVisual } from './visual';
import type { Aircraft } from '../aircraft';
import { loft, Section } from './builder';
import { lathe, join, strip, roundBox, P2 } from './kit';
import { partMaterials } from './parts';

export type AircrewStyle = 'us' | 'eu' | 'ru';

export interface PilotRig {
  /** stick pivot (rotates with the pilot's inputs), in the pilot frame */
  stick: THREE.Object3D;
  upper: THREE.Object3D;
  fore: THREE.Object3D;
  shoulder: THREE.Vector3;
  base: THREE.Vector3;
  gripLen: number;
  /** hand centre relative to the grip point */
  handOff: THREE.Vector3;
  l1: number;
  l2: number;
  pole: THREE.Vector3;
  /** stick travel (rad) for full pitch / roll */
  travel: [number, number];
  p: number;
  r: number;
  /** the head (helmet, visor, mask) turning at the neck */
  head: THREE.Object3D;
  hy: number;
  hp: number;
  /** the throttle grip sliding on the left console, and the arm on it */
  throttle: THREE.Object3D;
  lUpper: THREE.Object3D;
  lFore: THREE.Object3D;
  lShoulder: THREE.Vector3;
  /** throttle grip at idle, and its full travel */
  tBase: THREE.Vector3;
  tTravel: THREE.Vector3;
  tHandOff: THREE.Vector3;
  lPole: THREE.Vector3;
  t: number;
  time: number;
}

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------

export interface FabricOptions {
  /** weave cell size in metres (0 = smooth leather grain instead) */
  weave: number;
  /** micro-normal strength */
  bump: number;
  /** roughness variation */
  rough: number;
  /** low-frequency shading of folds and wear */
  wear: number;
}

const FABRIC_VERT_PARS = 'varying vec3 vFabP; varying vec3 vFabN;';
const FABRIC_FRAG_PARS = `
varying vec3 vFabP; varying vec3 vFabN;
uniform vec4 fabric; // weave cell, bump, roughness variation, wear
float fabHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float fabNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fabHash(i), fabHash(i + vec3(1,0,0)), f.x), mix(fabHash(i + vec3(0,1,0)), fabHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fabHash(i + vec3(0,0,1)), fabHash(i + vec3(1,0,1)), f.x), mix(fabHash(i + vec3(0,1,1)), fabHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 fabPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy) {
  vec3 sx = dFdx(surfPos); vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm); vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * (float(gl_FrontFacing) * 2.0 - 1.0);
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;
// the woven (or grained) micro-surface, faded out as soon as a pixel spans more than a cell
const FABRIC_NORMAL = `
{
  float h = 0.0;
  if (fabric.x > 0.0) {
    vec3 p = vFabP * (6.2831853 / fabric.x);
    vec3 an = abs(normalize(vFabN)); an /= (an.x + an.y + an.z);
    float wx = sin(p.y) * sin(p.z), wy = sin(p.x) * sin(p.z), wz = sin(p.x) * sin(p.y);
    h = wx * an.x + wy * an.y + wz * an.z;
    h += 0.35 * fabNoise(vFabP * 900.0);
  } else {
    h = fabNoise(vFabP * 1400.0) + 0.5 * fabNoise(vFabP * 4200.0);
  }
  float fade = clamp(1.0 - length(fwidth(vFabP)) / max(fabric.x, 0.0015) * 1.6, 0.0, 1.0);
  h *= fabric.y * fade;
  normal = fabPerturb(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)));
}
`;
const FABRIC_ROUGH = `
roughnessFactor = clamp(roughnessFactor + fabric.z * (fabNoise(vFabP * 60.0) - 0.5), 0.05, 1.0);
`;
const FABRIC_COLOR = `
{
  float w = fabNoise(vFabP * 14.0) * 0.6 + fabNoise(vFabP * 45.0) * 0.4;
  diffuseColor.rgb *= 1.0 - fabric.w * (0.5 - w) * 1.4;
}
`;

function applyFabric(mat: THREE.MeshStandardMaterial, o: FabricOptions): void {
  const uniforms = { fabric: { value: new THREE.Vector4(o.weave, o.bump, o.rough, o.wear) } };
  mat.userData.fabric = o;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + FABRIC_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFabP = transformed;\nvFabN = objectNormal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FABRIC_FRAG_PARS)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FABRIC_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FABRIC_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FABRIC_NORMAL);
  };
  mat.customProgramCacheKey = () => 'fabric-v3';
}

function fabric(color: number, roughness: number, o: FabricOptions, metalness = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  applyFabric(m, o);
  return m;
}

/** A copy of a suit material that keeps its woven shader (for recolouring). */
export function cloneSuit(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const ud = m.userData;
  m.userData = {};
  let c: THREE.MeshStandardMaterial;
  try {
    c = m.clone();
  } finally {
    m.userData = ud;
  }
  c.userData = { ...ud };
  if (ud.fabric) applyFabric(c, ud.fabric as FabricOptions);
  if (ud.skinRim) applySkinRim(c);
  return c;
}

// skin: a warm translucent rim where the light grazes
function applySkinRim(mat: THREE.MeshStandardMaterial): void {
  mat.userData.skinRim = true;
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
{
  float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
  reflectedLight.indirectDiffuse += vec3(0.16, 0.05, 0.02) * rim;
}`,
    );
  };
  mat.customProgramCacheKey = () => 'skinrim-v1';
}

/** The helmet's paint: base colour, reflective tape, trim and wear, per air arm. */
function helmetPaint(style: AircrewStyle): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  const base = { us: '#7a8187', eu: '#4f5558', ru: '#e6e6df' }[style];
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 512);
  // subtle paint mottle
  let s = 7;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) {
    const a = 0.03 + rnd() * 0.05;
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    const x = rnd() * 1024, y = rnd() * 512;
    g.fillRect(x, y, 2 + rnd() * 10, 1 + rnd() * 3);
  }
  // u: 0.25 = the back, 0.75 = the face; v: 1 = crown
  const X = (u: number) => u * 1024;
  const Y = (v: number) => (1 - v) * 512;
  if (style === 'us') {
    // HGU-55/P: two short strips of reflective tape low across the back
    for (const [u0, u1, v0, v1] of [[0.16, 0.34, 0.46, 0.49], [0.16, 0.34, 0.52, 0.55]] as const) {
      g.fillStyle = '#d9dcde';
      g.fillRect(X(u0), Y(v1), X(u1) - X(u0), Y(v0) - Y(v1));
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let x = X(u0); x < X(u1); x += 6) g.fillRect(x, Y(v1), 2, Y(v0) - Y(v1));
    }
    // the squadron's stripe down the back of the shell
    g.fillStyle = '#2d3f6b';
    g.fillRect(X(0.235), Y(0.8), X(0.265) - X(0.235), Y(0.56) - Y(0.8));
  } else if (style === 'eu') {
    // Striker II: dark shell, a grey spine down the back and the tape on the sides
    g.fillStyle = '#6b7175';
    g.fillRect(X(0.23), Y(0.82), X(0.27) - X(0.23), Y(0.5) - Y(0.82));
    for (const u0 of [0.02, 0.44]) {
      g.fillStyle = '#c9ccce';
      g.fillRect(X(u0), Y(0.6), X(u0 + 0.06) - X(u0), Y(0.46) - Y(0.6));
    }
  } else {
    // ZSh-7: white shell with the grey lower band
    g.fillStyle = '#b9bcb8';
    g.fillRect(0, Y(0.42), 1024, Y(0.3) - Y(0.42));
  }
  // scuffs and the matt edge round the face opening
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.08 + rnd() * 0.12})`;
    g.lineWidth = 1 + rnd() * 2;
    const x = rnd() * 1024, y = 150 + rnd() * 300;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 60, y + (rnd() - 0.5) * 20);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface Kit {
  suit: THREE.MeshStandardMaterial;
  gsuit: THREE.MeshStandardMaterial;
  vest: THREE.MeshStandardMaterial;
  strap: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  shell: THREE.MeshPhysicalMaterial;
  shellPlain: THREE.MeshPhysicalMaterial;
  shellDark: THREE.MeshStandardMaterial;
  visor: THREE.MeshPhysicalMaterial;
  mask: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  fitting: THREE.MeshStandardMaterial;
  grip: THREE.MeshStandardMaterial;
  console: THREE.MeshStandardMaterial;
  cushion: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  liner: THREE.MeshStandardMaterial;
  patch: THREE.MeshStandardMaterial;
  handle: THREE.MeshStandardMaterial;
}

const kits = new Map<AircrewStyle, Kit>();
function kit(style: AircrewStyle): Kit {
  let k = kits.get(style);
  if (k) return k;
  const M = (color: number, roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const suit = { us: 0x5d624a, eu: 0x575e4b, ru: 0x505748 }[style];
  const gsuit = { us: 0x6a6547, eu: 0x4e5440, ru: 0x484e42 }[style];
  const glove = { us: 0x7b6750, eu: 0x2a2928, ru: 0x2c2b29 }[style];
  const shellColor = { us: 0x7a8187, eu: 0x4f5558, ru: 0xe6e6df }[style];
  const nomex: FabricOptions = { weave: 0.0024, bump: 0.35, rough: 0.14, wear: 0.16 };
  const webbing: FabricOptions = { weave: 0.0036, bump: 0.55, rough: 0.1, wear: 0.1 };
  const leather: FabricOptions = { weave: 0, bump: 0.22, rough: 0.16, wear: 0.2 };
  const skin = M(0x9a7560, 0.62);
  applySkinRim(skin);
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: helmetPaint(style), roughness: 0.42, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.18 });
  const shellPlain = new THREE.MeshPhysicalMaterial({ color: shellColor, roughness: 0.42, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.18 });
  k = {
    suit: fabric(suit, 0.86, nomex),
    gsuit: fabric(gsuit, 0.8, nomex),
    vest: fabric(0x30342b, 0.78, webbing),
    strap: fabric(style === 'ru' ? 0x4a4e44 : 0x5a5e55, 0.74, webbing),
    glove: fabric(glove, 0.58, leather),
    shell,
    shellPlain,
    shellDark: M(0x34383b, 0.42, 0.25),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x1a1410, roughness: 0.04, metalness: 0.55, clearcoat: 1.0, clearcoatRoughness: 0.03, envMapIntensity: 1.6 }),
    mask: fabric(style === 'ru' ? 0x3d4a38 : 0x3a3d37, 0.68, { weave: 0, bump: 0.1, rough: 0.1, wear: 0.1 }),
    rubber: M(0x1f2123, 0.82),
    boot: fabric(0x1b1a19, 0.55, leather, 0.05),
    fitting: M(0x9ba0a4, 0.32, 0.85),
    grip: M(0x141414, 0.55, 0.05),
    console: M(0x2a2d30, 0.7, 0.2),
    cushion: fabric(0x2d3134, 0.9, { weave: 0.004, bump: 0.3, rough: 0.1, wear: 0.2 }),
    skin,
    liner: new THREE.MeshStandardMaterial({ color: 0x1d1e1f, roughness: 0.95, side: THREE.BackSide }),
    patch: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true }),
    handle: new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.6 }),
  };
  kits.set(style, k);
  return k;
}

// ---------------------------------------------------------------------------
// shape helpers (pilot frame: x right, y up the spine, z aft; origin at the eye)
// ---------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);

/** A limb segment along +y from 0 to len, radius profile [r, y] (0..1 of len). */
function limb(len: number, prof: [number, number][], segs = 16): THREE.BufferGeometry {
  const p: P2[] = prof.map(([r, t]) => [r, t * len]);
  const g = lathe(p, segs, 0, 0, true, true);
  // lathe runs along +z: stand it up along +y
  g.rotateX(-Math.PI / 2);
  return strip(g);
}

/** Place a +y-aligned geometry from a to b. */
function along(g: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

function ellipsoid(rx: number, ry: number, rz: number, at: THREE.Vector3, w = 20, h = 14): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  g.translate(at.x, at.y, at.z);
  return strip(g);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Loft along +y with superellipse sections (w = half width, top = front, bot = back). */
function trunk(secs: Section[], radial = 28): THREE.BufferGeometry {
  const g = loft(secs, radial, 3, true);
  // loft runs along z with "top" up: turn it so z -> up and "top" -> forward (-z)
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)));
  return strip(g);
}

/**
 * A flat webbing strap laid along a curve over the body: `w` wide, `t` thick,
 * standing off the surface along the outward direction from the torso axis.
 */
function ribbon(pts: THREE.Vector3[], w: number, t = 0.004, n = 24): THREE.BufferGeometry {
  const c = new THREE.CatmullRomCurve3(pts);
  const pos: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), O = new THREE.Vector3(), S = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    c.getPointAt(u, P);
    c.getTangentAt(u, T);
    // outward: from the torso axis (x = 0, z = 0.1) at this height
    O.set(P.x, 0, P.z - 0.1);
    if (O.lengthSq() < 1e-6) O.set(0, 0, -1);
    O.normalize();
    S.crossVectors(T, O).normalize();
    O.crossVectors(S, T).normalize();
    for (const [sx, oy] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]] as const) {
      pos.push(P.x + S.x * sx * w + O.x * oy * t, P.y + S.y * sx * w + O.y * oy * t, P.z + S.z * sx * w + O.z * oy * t);
    }
    if (i > 0) {
      const a = (i - 1) * 4, b = i * 4;
      // top face, both edges, underside
      for (const [p, q] of [[3, 2], [2, 1], [0, 3], [1, 0]] as const) {
        idx.push(a + p, b + p, b + q, a + p, b + q, a + q);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A small flat patch coloured per vertex (rows of colour from top to bottom). */
function patch(w: number, h: number, rows: number[][], at: THREE.Vector3, normal: THREE.Vector3): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 1, rows.length);
  const col: number[] = [];
  const n = g.attributes.position.count;
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const row = Math.min(rows.length - 1, Math.floor(i / 2));
    c.setHex(rows[row][0]);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.lookAt(normal);
  g.translate(at.x, at.y, at.z);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  return g;
}

/** Like join() but keeping the vertex colours. */
function joinColored(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return join(gs);
}

/** The gloved hand closed round a grip: fist, thumb over the top, gauntlet cuff. */
function fist(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // palm and wrapped fingers (the fist lies across the forearm axis)
  const palm = new THREE.SphereGeometry(1, 18, 14);
  palm.scale(0.046, 0.05, 0.052);
  parts.push(strip(palm));
  // four finger segments wrapped under
  for (let i = 0; i < 4; i++) {
    const f = new THREE.CapsuleGeometry(0.011, 0.03, 4, 10);
    f.rotateX(Math.PI / 2);
    f.translate(-0.027 + i * 0.018, 0.012, -0.04);
    parts.push(strip(f));
  }
  // knuckle ridge
  const kn = new THREE.CapsuleGeometry(0.017, 0.06, 4, 10);
  kn.rotateZ(Math.PI / 2);
  kn.translate(0, 0.024, -0.035);
  parts.push(strip(kn));
  // thumb along the top of the grip
  const th = new THREE.CapsuleGeometry(0.013, 0.045, 4, 8);
  th.rotateX(-0.9);
  th.translate(-0.028, 0.04, -0.012);
  parts.push(strip(th));
  // gauntlet cuff
  const cuff = new THREE.CylinderGeometry(0.045, 0.042, 0.03, 14);
  cuff.translate(0, -0.04, 0);
  parts.push(strip(cuff));
  return join(parts);
}

/** A ribbed hose along a curve. */
function hose(path: THREE.Curve<THREE.Vector3>, r: number, ribs: number, segs = 90): THREE.BufferGeometry {
  const g = new THREE.TubeGeometry(path, segs, r, 10, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const P = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    path.getPointAt(i / segs, P);
    const k = 1 + 0.16 * Math.abs(Math.sin((i / segs) * Math.PI * ribs));
    for (let j = 0; j <= 10; j++) {
      const idx = i * 11 + j;
      q.fromBufferAttribute(pos, idx).sub(P).multiplyScalar(k).add(P);
      pos.setXYZ(idx, q.x, q.y, q.z);
    }
  }
  g.computeVertexNormals();
  return strip(g);
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

export interface PilotOptions {
  style: AircrewStyle;
  /** centre stick between the knees, or a side stick on the right console */
  stick: 'center' | 'side';
  martinBaker: boolean;
}

/**
 * Seat, pilot, stick, throttle and consoles at `eye`, reclined `recline` rad.
 * Adds the meshes to the airframe (hidden in the first-person view) and its rig.
 */
export function addPilot(v: AirframeVisual, eye: THREE.Vector3, recline: number, o: PilotOptions): void {
  const K = kit(o.style);
  const pm = partMaterials();
  const frame = new THREE.Group();
  frame.name = 'pilot';
  frame.position.copy(eye);
  frame.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), recline);
  v.body.add(frame);
  const meshes: THREE.Mesh[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = frame) => {
    const mesh = new THREE.Mesh(g, m);
    if (m === K.suit) mesh.userData.pilotPart = 'suit';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const k36 = o.style === 'ru';

  // --- the ejection seat: ACES II, Martin-Baker Mk16 or Zvezda K-36 ------------------------
  {
    const seat: THREE.BufferGeometry[] = [];
    const cush: THREE.BufferGeometry[] = [];
    const fit: THREE.BufferGeometry[] = [];
    // back with the parachute container, the headbox on top
    seat.push(strip(roundBox(0.5, 0.8, 0.12, 0.03).translate(0, -0.53, 0.31)));
    seat.push(strip(roundBox(0.4, 0.56, 0.08, 0.03).translate(0, -0.55, 0.4)));
    const hb = k36 ? roundBox(0.36, 0.34, 0.2, 0.05) : o.martinBaker ? roundBox(0.34, 0.32, 0.18, 0.05) : roundBox(0.3, 0.26, 0.18, 0.05);
    hb.translate(0, k36 ? 0.04 : o.martinBaker ? 0.02 : -0.04, 0.31);
    seat.push(strip(hb));
    // headrest pad
    cush.push(strip(roundBox(0.2, 0.16, 0.05, 0.02).translate(0, -0.06, 0.2)));
    // seat pan with the survival kit under it, side rails
    seat.push(strip(roundBox(0.5, 0.12, 0.46, 0.03).translate(0, -0.93, 0.08)));
    seat.push(strip(roundBox(0.46, 0.08, 0.4, 0.02).translate(0, -1.02, 0.1)));
    for (const sx of [-1, 1]) {
      seat.push(strip(roundBox(0.05, 0.92, 0.14, 0.015).translate(sx * 0.26, -0.5, 0.31)));
      seat.push(strip(roundBox(0.04, 0.2, 0.3, 0.012).translate(sx * 0.25, -0.8, 0.0)));
      // the catapult rails behind the seat
      fit.push(along(limb(0.9, [[0.014, 0], [0.014, 1]], 10), V(sx * 0.2, -0.95, 0.38), V(sx * 0.2, -0.05, 0.38)));
    }
    if (k36) {
      // K-36: the arm-restraint paddles each side of the headbox and the deflector lip
      for (const sx of [-1, 1]) seat.push(strip(roundBox(0.03, 0.26, 0.16, 0.01).translate(sx * 0.2, 0.0, 0.3)));
      seat.push(strip(roundBox(0.36, 0.03, 0.08, 0.01).translate(0, 0.22, 0.27)));
    }
    if (o.martinBaker || k36) {
      // firing handle loop between the knees (yellow and black)
      const loop = new THREE.TorusGeometry(0.06, 0.013, 8, 18, Math.PI);
      loop.translate(0, -0.9, -0.16);
      add(strip(loop), K.handle);
    } else {
      // ACES II: the handles on the seat pan sides
      for (const sx of [-1, 1]) add(strip(roundBox(0.035, 0.05, 0.12, 0.012).translate(sx * 0.27, -0.84, -0.1)), K.handle);
    }
    add(join(seat), pm.seat);
    // cushions: pan and back pad, with their stitched seams
    cush.push(strip(roundBox(0.44, 0.07, 0.42, 0.03).translate(0, -0.85, 0.08)));
    cush.push(strip(roundBox(0.42, 0.6, 0.06, 0.025).translate(0, -0.5, 0.235)));
    add(join(cush), K.cushion);
    add(join(fit), K.fitting);
  }

  // --- consoles, throttle, stick ---------------------------------------------------------------
  const cons: THREE.BufferGeometry[] = [];
  const knobs: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    cons.push(strip(roundBox(0.12, 0.3, 0.62, 0.02).translate(sx * 0.37, -0.84, -0.18)));
    // a few knobs and switches on each console
    for (let i = 0; i < 4; i++) knobs.push(strip(new THREE.CylinderGeometry(0.008, 0.009, 0.012, 10).translate(sx * (0.33 + (i % 2) * 0.05), -0.69, 0.02 + i * 0.045)));
  }
  add(join(cons), K.console);
  add(join(knobs), K.fitting);
  // throttle quadrant on the left console; the grip slides fore and aft in its slot
  add(join([strip(roundBox(0.07, 0.05, 0.26, 0.01).translate(-0.35, -0.67, -0.14)), strip(roundBox(0.02, 0.052, 0.22, 0.004).translate(-0.35, -0.668, -0.14))]), K.console);
  const tBase = V(-0.35, -0.665, -0.03);
  const tTravel = V(0.0, 0.0, -0.22);
  const throttle = new THREE.Group();
  throttle.position.copy(tBase);
  frame.add(throttle);
  add(join([along(limb(0.1, [[0.012, 0], [0.012, 1]], 8), V(0, 0, 0), V(0.01, 0.09, -0.01)), strip(roundBox(0.045, 0.05, 0.1, 0.018).translate(0.015, 0.115, -0.01))]), K.grip, throttle);

  const side = o.stick === 'side';
  const base = side ? V(0.36, -0.69, -0.2) : V(0, -1.02, -0.3);
  const gripLen = side ? 0.13 : 0.43;
  const stick = new THREE.Group();
  stick.position.copy(base);
  frame.add(stick);
  const st: THREE.BufferGeometry[] = [];
  if (!side) st.push(along(limb(0.36, [[0.012, 0], [0.011, 1]], 10), V(0, 0, 0), V(0, 0.36, 0)));
  // ergonomic grip, slightly forward-canted, with the trigger guard and top hat
  const gy = gripLen;
  const g0 = roundBox(0.042, 0.12, 0.052, 0.018);
  g0.rotateX(-0.15);
  g0.translate(0, gy - 0.02, 0);
  st.push(strip(g0));
  st.push(ellipsoid(0.026, 0.018, 0.03, V(0, gy + 0.045, -0.004), 10, 8));
  add(join(st), K.grip, stick);
  if (!side) add(lathe([[0.001, -0.01], [0.07, 0.0], [0.05, 0.05], [0.018, 0.12]], 16, 0, 0), pm.darkMetal, stick).rotateX(-Math.PI / 2);
  else add(strip(roundBox(0.06, 0.03, 0.08, 0.01)), pm.darkMetal, stick);

  // --- the pilot -----------------------------------------------------------------------------------
  const pelvis = V(0, -0.84, 0.12);
  const secs: Section[] = [
    { z: 0.0, w: 0.165, top: 0.095, bot: 0.1, n: 2.4 },
    { z: 0.1, w: 0.165, top: 0.1, bot: 0.1, n: 2.4 },
    { z: 0.24, w: 0.152, top: 0.098, bot: 0.095, n: 2.4 },
    { z: 0.38, w: 0.175, top: 0.118, bot: 0.1, n: 2.5 },
    { z: 0.51, w: 0.2, top: 0.112, bot: 0.1, n: 2.6 },
    { z: 0.585, w: 0.19, top: 0.09, bot: 0.09, n: 2.4 },
    { z: 0.635, w: 0.1, top: 0.062, bot: 0.062, n: 2 },
  ];
  add(trunk(secs).translate(pelvis.x, pelvis.y, pelvis.z), K.suit);
  // survival vest over the chest and back, LPU collar over the shoulders
  const vest = trunk(
    secs.slice(2, 6).map((s) => ({ ...s, w: s.w + 0.014, top: s.top + 0.016, bot: s.bot + 0.012 })),
  ).translate(pelvis.x, pelvis.y, pelvis.z);
  const vp: THREE.BufferGeometry[] = [vest];
  for (const sx of [-1, 1]) {
    // flotation collar lobe from the chest over the shoulder to the back
    const c = new THREE.CatmullRomCurve3([V(sx * 0.06, -0.42, -0.02), V(sx * 0.13, -0.275, -0.03), V(sx * 0.15, -0.2, 0.1), V(sx * 0.12, -0.3, 0.22)]);
    vp.push(strip(new THREE.TubeGeometry(c, 16, 0.038, 10, false)));
    // survival vest pockets, with their flap seams
    vp.push(strip(roundBox(0.08, 0.1, 0.04, 0.012).translate(sx * 0.1, -0.5, -0.03)));
    vp.push(strip(roundBox(0.085, 0.025, 0.044, 0.008).translate(sx * 0.1, -0.462, -0.03)));
    vp.push(strip(roundBox(0.06, 0.06, 0.03, 0.01).translate(sx * 0.14, -0.6, 0.0)));
  }
  add(join(vp), K.vest);
  // the torso harness: shoulder straps over the chest to the lap, the lap belt,
  // the chest strap, the leg straps round the thighs
  const straps: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    straps.push(ribbon([V(sx * 0.1, -0.24, 0.1), V(sx * 0.105, -0.3, -0.03), V(sx * 0.1, -0.42, -0.06), V(sx * 0.085, -0.56, -0.07), V(sx * 0.08, -0.7, -0.03)], 0.048, 0.006));
    straps.push(ribbon([V(sx * 0.1, -0.24, 0.1), V(sx * 0.11, -0.3, 0.2), V(sx * 0.1, -0.42, 0.24)], 0.046, 0.006, 10));
    const ring = new THREE.TorusGeometry(0.085, 0.012, 6, 18);
    ring.rotateY(Math.PI / 2);
    ring.rotateZ(0.1);
    ring.translate(sx * 0.11, -0.8, -0.02);
    straps.push(strip(ring));
  }
  straps.push(ribbon([V(-0.17, -0.72, 0.0), V(-0.09, -0.74, -0.08), V(0, -0.745, -0.1), V(0.09, -0.74, -0.08), V(0.17, -0.72, 0.0)], 0.05, 0.007));
  straps.push(ribbon([V(-0.1, -0.44, -0.06), V(0, -0.45, -0.085), V(0.1, -0.44, -0.06)], 0.03, 0.005, 10));
  add(join(straps), K.strap);
  // Koch fittings, buckles and the regulator on the chest
  const fits: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    fits.push(strip(roundBox(0.05, 0.05, 0.02, 0.006).translate(sx * 0.1, -0.36, -0.065)));
    fits.push(strip(roundBox(0.056, 0.035, 0.022, 0.006).translate(sx * 0.085, -0.7, -0.045)));
  }
  fits.push(strip(roundBox(0.05, 0.04, 0.022, 0.006).translate(0, -0.745, -0.11)));
  fits.push(strip(roundBox(0.045, 0.035, 0.03, 0.008).translate(-0.07, -0.42, -0.04)));
  add(join(fits), K.fitting);
  // patches: the name tag, the flag on the left shoulder, the squadron patch on the right
  const flag = o.style === 'us'
    ? [[0xb22234], [0xffffff], [0xb22234], [0xffffff], [0xb22234], [0xffffff], [0xb22234]]
    : o.style === 'eu' ? [[0x006aa7], [0xfecc02], [0x006aa7]] : [[0xffffff], [0x0039a6], [0xd52b1e]];
  const patches: THREE.BufferGeometry[] = [
    patch(0.09, 0.03, [[0x2a1d14]], V(0.1, -0.32, -0.085), V(0, 0.25, -1)),
    patch(0.055, 0.035, flag, V(-0.2, -0.33, 0.05), V(-1, 0.1, -0.3)),
    patch(0.05, 0.05, [[0x1f2d5c], [0xc9a227], [0x1f2d5c]], V(0.2, -0.33, 0.05), V(1, 0.1, -0.3)),
  ];
  add(joinColored(patches), K.patch);

  // legs: thigh and calf in the G-suit chaps, knees, boots, the kneeboard on the right thigh
  const leg: THREE.BufferGeometry[] = [];
  const legG: THREE.BufferGeometry[] = [];
  const bootG: THREE.BufferGeometry[] = [];
  const lacing: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const hip = V(sx * 0.095, -0.81, 0.08);
    const knee = V(sx * 0.125, -0.73, -0.36);
    const ankle = V(sx * 0.13, -1.15, -0.47);
    legG.push(along(limb(hip.distanceTo(knee), [[0.075, 0], [0.086, 0.12], [0.08, 0.5], [0.064, 0.9], [0.058, 1]]), hip, knee));
    leg.push(ellipsoid(0.062, 0.06, 0.066, knee, 14, 10));
    legG.push(along(limb(knee.distanceTo(ankle), [[0.058, 0], [0.062, 0.2], [0.052, 0.65], [0.042, 1]]), knee, ankle));
    // G-suit lacing down the outside of the thigh and calf
    for (let i = 0; i < 5; i++) {
      const t = 0.2 + i * 0.15;
      const p = hip.clone().lerp(knee, t);
      lacing.push(strip(new THREE.TorusGeometry(0.012, 0.004, 5, 10).rotateY(Math.PI / 2).translate(p.x + sx * 0.08, p.y + 0.01, p.z)));
    }
    for (let i = 0; i < 4; i++) {
      const p = knee.clone().lerp(ankle, 0.25 + i * 0.17);
      lacing.push(strip(new THREE.TorusGeometry(0.01, 0.0035, 5, 10).rotateY(Math.PI / 2).translate(p.x + sx * 0.058, p.y, p.z)));
    }
    // boot: upper, sole, laces
    const b = roundBox(0.1, 0.11, 0.27, 0.035);
    b.rotateX(-0.25);
    b.translate(ankle.x, ankle.y - 0.035, ankle.z - 0.08);
    bootG.push(strip(b));
    const sole = roundBox(0.104, 0.025, 0.28, 0.01);
    sole.rotateX(-0.25);
    sole.translate(ankle.x, ankle.y - 0.085, ankle.z - 0.085);
    bootG.push(strip(sole));
    bootG.push(along(limb(0.1, [[0.046, 0], [0.047, 1]], 12), V(ankle.x, ankle.y - 0.02, ankle.z + 0.01), V(ankle.x, ankle.y + 0.07, ankle.z + 0.03)));
    for (let i = 0; i < 4; i++) lacing.push(strip(new THREE.TorusGeometry(0.02, 0.003, 5, 10).rotateX(Math.PI / 2 - 0.3).translate(ankle.x, ankle.y + 0.0 + i * 0.02, ankle.z - 0.06 - i * 0.012)));
    // shoulder
    leg.push(ellipsoid(0.066, 0.06, 0.064, V(sx * 0.195, -0.258, 0.12), 14, 10));
  }
  // kneeboard strapped to the right thigh
  const kb = roundBox(0.12, 0.016, 0.16, 0.006);
  kb.rotateX(0.2);
  kb.translate(0.135, -0.66, -0.2);
  add(join([strip(kb), strip(roundBox(0.1, 0.004, 0.13, 0.002).rotateX(0.2).translate(0.135, -0.65, -0.2))]), K.console);
  add(join(leg), K.suit);
  add(join(legG), K.gsuit);
  add(join(bootG), K.boot);
  add(join(lacing), K.rubber);
  // the neck rises from the suit collar right up into the helmet
  add(along(limb(0.05, [[0.062, 0], [0.058, 1]], 16), V(0, -0.215, 0.1), V(0, -0.165, 0.098)), K.suit);
  const collar = new THREE.TorusGeometry(0.062, 0.014, 8, 20);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, -0.2, 0.098);
  add(strip(collar), K.suit);

  // --- the head: everything from the neck up turns together -------------------------------------
  const neck = V(0, -0.17, 0.098);
  const head = new THREE.Group();
  head.position.copy(neck);
  frame.add(head);
  const H = (x: number, y: number, z: number) => V(x - neck.x, y - neck.y, z - neck.z);
  add(along(limb(0.125, [[0.054, 0], [0.05, 0.6], [0.052, 1]], 16), H(0, -0.175, 0.098), H(0, -0.05, 0.095)), K.skin, head);

  // helmet: the shell (painted, with UVs for its markings), the lower half open at the face
  const hc = H(0, 0.015, 0.085);
  const crown = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.53);
  crown.scale(0.128, 0.142, 0.15);
  crown.translate(hc.x, hc.y, hc.z);
  for (const k of Object.keys(crown.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') crown.deleteAttribute(k);
  add(crown, K.shell, head);
  const hs: THREE.BufferGeometry[] = [];
  const lower = new THREE.SphereGeometry(1, 36, 14, Math.PI * 1.8, Math.PI * 1.4, Math.PI * 0.53, Math.PI * 0.36);
  lower.scale(0.128, 0.142, 0.15);
  lower.translate(hc.x, hc.y, hc.z);
  hs.push(strip(lower));
  // rolled edge round the face opening, ear cups each side, the rear lip
  const edge = new THREE.TorusGeometry(1, 0.075, 8, 28, Math.PI * 0.62);
  edge.rotateZ(Math.PI * 0.69);
  edge.scale(0.098, 0.09, 1);
  edge.rotateX(-0.2);
  edge.translate(hc.x, hc.y - 0.072, hc.z - 0.108);
  hs.push(strip(edge));
  for (const sx of [-1, 1]) hs.push(ellipsoid(0.028, 0.05, 0.052, V(hc.x + sx * 0.128, hc.y - 0.06, hc.z + 0.01), 14, 10));
  hs.push(strip(roundBox(0.2, 0.03, 0.05, 0.012).translate(hc.x, hc.y - 0.1, hc.z + 0.12)));
  add(join(hs), K.shellPlain, head);
  // the head inside: face in the opening (mostly hidden by the visor and mask), the skull in the padding
  add(ellipsoid(0.08, 0.11, 0.118, V(hc.x, hc.y - 0.028, hc.z + 0.006), 24, 18), K.skin, head);
  // brows and the nose bridge seen through the visor
  add(join([
    ellipsoid(0.03, 0.008, 0.012, V(hc.x - 0.03, hc.y - 0.012, hc.z - 0.108), 10, 6),
    ellipsoid(0.03, 0.008, 0.012, V(hc.x + 0.03, hc.y - 0.012, hc.z - 0.108), 10, 6),
  ]), K.rubber, head);
  // padded liner: the inside of the shell seen past the face and neck
  const liner = new THREE.SphereGeometry(1, 26, 16);
  liner.scale(0.122, 0.136, 0.143);
  liner.translate(hc.x, hc.y, hc.z);
  add(strip(liner), K.liner, head);
  const dark: THREE.BufferGeometry[] = [];
  // visor housing band across the brow, with its centre knob and the side rails
  const band = new THREE.SphereGeometry(1, 36, 10, Math.PI * 1.12, Math.PI * 0.76, Math.PI * 0.18, Math.PI * 0.16);
  band.scale(0.14, 0.154, 0.162);
  band.translate(hc.x, hc.y, hc.z);
  dark.push(strip(band));
  dark.push(strip(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 12).rotateX(Math.PI / 2).translate(hc.x, hc.y + 0.07, hc.z - 0.148)));
  for (const sx of [-1, 1]) dark.push(strip(roundBox(0.012, 0.06, 0.05, 0.004).translate(hc.x + sx * 0.136, hc.y + 0.01, hc.z - 0.05)));
  // helmet-sight mount above the visor: JHMCS, Striker or the Russian sight's bulkier housing
  if (o.style === 'eu') dark.push(strip(roundBox(0.11, 0.035, 0.06, 0.012).translate(hc.x, hc.y + 0.115, hc.z - 0.1)));
  else dark.push(strip(roundBox(0.07, 0.03, 0.05, 0.01).translate(hc.x, hc.y + 0.12, hc.z - 0.1)));
  // chin strap and cup
  dark.push(ellipsoid(0.034, 0.02, 0.026, V(hc.x, hc.y - 0.2, hc.z - 0.06), 12, 8));
  add(join(dark), K.shellDark, head);
  for (const sx of [-1, 1]) {
    const cs = new THREE.BoxGeometry(0.004, 0.09, 0.016);
    add(along(cs.translate(0, 0.045, 0), V(hc.x + sx * 0.02, hc.y - 0.2, hc.z - 0.06), V(hc.x + sx * 0.11, hc.y - 0.11, hc.z - 0.01)), K.strap, head);
  }

  // oxygen mask, modelled on the MBU-20/P: a hard shell over nose and mouth,
  // narrow at the bridge and wide at the chin, the rubber face seal behind it,
  // the exhalation valve and hose connector underneath, and a bayonet strap up
  // each side clipping into the helmet
  const my = hc.y - 0.165;
  const mz = hc.z - 0.125;
  const maskSecs: Section[] = [
    { z: 0.0, w: 0.028, top: 0.034, bot: 0.014, n: 2.2 },
    { z: 0.02, w: 0.046, top: 0.055, bot: 0.014, n: 2.4 },
    { z: 0.048, w: 0.052, top: 0.066, bot: 0.014, n: 2.4 },
    { z: 0.078, w: 0.046, top: 0.058, bot: 0.014, n: 2.3 },
    { z: 0.104, w: 0.03, top: 0.042, bot: 0.012, n: 2.1 },
    { z: 0.124, w: 0.012, top: 0.022, bot: 0.008, n: 2.0 },
  ];
  const maskShell = trunk(maskSecs, 28);
  maskShell.rotateX(-0.12);
  maskShell.translate(hc.x, my, mz);
  add(maskShell, K.mask, head);
  // face seal: a slightly wider, flatter rim against the face
  const seal = trunk(maskSecs.map((q) => ({ ...q, w: q.w + 0.006, top: q.top * 0.35, bot: q.bot + 0.004 })), 20);
  seal.rotateX(-0.12);
  seal.translate(hc.x, my, mz + 0.004);
  add(seal, K.rubber, head);
  const fit: THREE.BufferGeometry[] = [];
  // exhalation valve on the front below the mouth, microphone bump, hose connector underneath
  fit.push(along(limb(0.018, [[0.02, 0], [0.02, 1]], 14), V(0, my + 0.03, mz - 0.05), V(0, my + 0.025, mz - 0.068)));
  fit.push(along(limb(0.03, [[0.019, 0], [0.017, 1]], 14), V(0, my + 0.004, mz - 0.03), V(0, my - 0.024, mz - 0.034)));
  fit.push(ellipsoid(0.012, 0.012, 0.008, V(-0.03, my + 0.055, mz - 0.05), 8, 6));
  // bayonet straps to the helmet, with their receivers on the shell
  const strapM: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const a = V(sx * 0.047, my + 0.06, mz - 0.02);
    const b = V(sx * 0.118, hc.y - 0.062, hc.z - 0.03);
    const st2 = new THREE.BoxGeometry(0.005, a.distanceTo(b), 0.016);
    strapM.push(along(st2.translate(0, a.distanceTo(b) / 2, 0), a, b));
    fit.push(strip(roundBox(0.012, 0.028, 0.03, 0.005).translate(b.x, b.y, b.z)));
  }
  add(join(strapM), K.strap, head);
  add(join(fit), K.fitting, head);
  // the hose: its first bend turns with the head, the rest hangs to the chest regulator
  const hoseTop = new THREE.CatmullRomCurve3([V(0, my - 0.03, mz - 0.034), V(-0.006, my - 0.07, mz - 0.034), V(-0.012, my - 0.1, mz - 0.03)]);
  add(hose(hoseTop, 0.016, 8, 24), K.mask, head);
  const hoseLow = new THREE.CatmullRomCurve3([V(-0.012, my - 0.1 + neck.y, mz - 0.03 + neck.z), V(-0.03, -0.26, -0.065), V(-0.05, -0.33, -0.07), V(-0.07, -0.41, -0.05)]);
  add(hose(hoseLow, 0.016, 26, 70), K.mask);
  // tinted visor down over the eyes
  const visor = new THREE.SphereGeometry(1, 40, 14, Math.PI * 1.14, Math.PI * 0.72, Math.PI * 0.33, Math.PI * 0.22);
  visor.scale(0.14, 0.155, 0.162);
  visor.translate(hc.x, hc.y, hc.z);
  add(strip(visor), K.visor, head);

  // --- arms: the left on the throttle, the right on the stick; both posed every frame --------------
  const armParts = (upper: THREE.Object3D, fore: THREE.Object3D, L1: number, L2: number, watch: boolean) => {
    add(limb(L1, [[0.056, 0], [0.058, 0.2], [0.048, 1]]), K.suit, upper);
    add(ellipsoid(0.048, 0.046, 0.048, V(0, L1, 0), 12, 10), K.suit, upper);
    add(limb(L2 - 0.05, [[0.046, 0], [0.042, 0.6], [0.036, 0.85], [0.043, 0.9], [0.043, 1]]), K.suit, fore);
    // pen pocket on the upper arm
    add(strip(roundBox(0.03, 0.08, 0.01, 0.004).translate(-0.05, L1 * 0.5, 0.0)), K.suit, upper);
    if (watch) {
      add(strip(new THREE.TorusGeometry(0.04, 0.006, 6, 18).translate(0, L2 - 0.08, 0)), K.rubber, fore);
      add(strip(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 14).rotateZ(Math.PI / 2).translate(-0.04, L2 - 0.08, 0)), K.fitting, fore);
    }
    add(fist().translate(0, L2 - 0.02, 0), K.glove, fore);
  };
  const upper = new THREE.Group();
  const fore = new THREE.Group();
  const lUpper = new THREE.Group();
  const lFore = new THREE.Group();
  frame.add(upper, fore, lUpper, lFore);
  const L1 = 0.3, L2 = 0.31;
  armParts(upper, fore, L1, L2, false);
  armParts(lUpper, lFore, L1, L2, true);

  const rig: PilotRig = {
    stick,
    upper,
    fore,
    shoulder: V(0.2, -0.258, 0.12),
    base,
    gripLen,
    handOff: V(0.006, -0.01, 0.012),
    l1: L1,
    l2: L2,
    pole: side ? V(0.45, -0.55, 0.7) : V(0.6, -0.7, 0.45),
    travel: side ? [0.1, 0.1] : [0.22, 0.18],
    p: 0,
    r: 0,
    head,
    hy: 0,
    hp: 0,
    throttle,
    lUpper,
    lFore,
    lShoulder: V(-0.2, -0.258, 0.12),
    tBase,
    tTravel,
    tHandOff: V(0.015, 0.125, -0.012),
    lPole: V(-0.6, -0.6, 0.5),
    t: 0.75,
    time: 0,
  };
  poseRig(rig, 0, 0);
  for (const m of meshes) m.userData.pilot = true;
  v.hideInCockpit.push(...meshes);
  v.pilots.push(rig);
}

/** The moving frames of a rig (they stay their own meshes when the airframe is folded). */
export function rigFrames(r: PilotRig): THREE.Object3D[] {
  return [r.stick, r.upper, r.fore, r.head, r.throttle, r.lUpper, r.lFore];
}

/** Elbow position for a two-bone arm from shoulder s to hand h, bending toward `pole`. */
function elbow(s: THREE.Vector3, h: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const dir = _d.subVectors(h, s);
  let d = dir.length();
  dir.divideScalar(Math.max(d, 1e-6));
  d = Math.min(d, l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pl = _p.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  return out.copy(s).addScaledVector(dir, a).addScaledVector(pl, hh);
}
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _g = new THREE.Vector3();
const _e = new THREE.Vector3();
const _h = new THREE.Vector3();
const _q = new THREE.Quaternion();

function arm(shoulder: THREE.Vector3, hand: THREE.Vector3, r: PilotRig, pole: THREE.Vector3, upper: THREE.Object3D, fore: THREE.Object3D): void {
  elbow(shoulder, hand, r.l1, r.l2, pole, _e);
  upper.position.copy(shoulder);
  upper.quaternion.copy(_q.setFromUnitVectors(UP, _d.subVectors(_e, shoulder).normalize()));
  fore.position.copy(_e);
  fore.quaternion.copy(_q.setFromUnitVectors(UP, _d.subVectors(hand, _e).normalize()));
}

/** Stick deflection (pitch, roll in -1..1), throttle (0..1.1), head (yaw, pitch rad) and the arms following. */
export function poseRig(r: PilotRig, pitch: number, roll: number, throttle = r.t, headYaw = r.hy, headPitch = r.hp): void {
  r.stick.rotation.set(pitch * r.travel[0], 0, -roll * r.travel[1]);
  _g.set(0, r.gripLen, 0).applyEuler(r.stick.rotation).add(r.base);
  _h.copy(_g).add(r.handOff);
  arm(r.shoulder, _h, r, r.pole, r.upper, r.fore);
  const t = Math.min(1, Math.max(0, throttle / 1.1));
  r.throttle.position.copy(r.tBase).addScaledVector(r.tTravel, t);
  _h.copy(r.throttle.position).add(r.tHandOff);
  arm(r.lShoulder, _h, r, r.lPole, r.lUpper, r.lFore);
  r.head.rotation.set(headPitch, headYaw, 0, 'YXZ');
}

/** Per frame: the stick and throttle ease toward the pilot's inputs; the head looks into the turn. */
export function updatePilot(r: PilotRig, ac: Aircraft, dt: number): void {
  const c = ac.controls;
  const alive = ac.alive;
  const tp = alive ? THREE.MathUtils.clamp(c.pitch, -1, 1) : 0;
  const tr = alive ? THREE.MathUtils.clamp(c.roll, -1, 1) : 0;
  const tt = alive ? THREE.MathUtils.clamp(c.throttle, 0, 1.1) : 0;
  r.time += dt;
  const k = Math.min(1, dt * 12);
  r.p += (tp - r.p) * k;
  r.r += (tr - r.r) * k;
  r.t += (tt - r.t) * Math.min(1, dt * 6);
  // the head: into the turn (toward the roll, up with the pull), plus a slow scan of the sky
  const scan = alive ? Math.sin(r.time * 0.37) * 0.22 + Math.sin(r.time * 0.11) * 0.18 : 0;
  const ty = alive ? THREE.MathUtils.clamp(-r.r * 0.55 + scan, -0.9, 0.9) : 0.3;
  const tpH = alive ? THREE.MathUtils.clamp(-r.p * 0.3 - 0.04 + Math.sin(r.time * 0.23) * 0.05, -0.35, 0.3) : 0.5;
  const kh = Math.min(1, dt * 2.5);
  r.hy += (ty - r.hy) * kh;
  r.hp += (tpH - r.hp) * kh;
  poseRig(r, r.p, r.r, r.t, r.hy, r.hp);
}
