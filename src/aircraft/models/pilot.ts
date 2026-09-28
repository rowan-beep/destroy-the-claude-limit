// The pilot in the cockpit: a seated aircrew figure built to real proportions
// in real flying kit -- flight suit, survival vest and harness, anti-G suit
// chaps, gloves and boots, a helmet with its tinted visor, helmet-sight mount
// and oxygen mask on its hose -- on the jet's ejection seat, with the stick and
// throttle in his hands.
//
// The only thing that moves is the stick: it follows the pilot's pitch and
// roll inputs and the right arm follows the hand on it (two-bone IK: shoulder,
// elbow, hand). Everything else is one static mesh per material.

import * as THREE from 'three';
import type { AirframeVisual } from './visual';
import type { Aircraft } from '../aircraft';
import { loft, Section } from './builder';
import { lathe, join, strip, roundBox, P2 } from './kit';
import { seatAndPilot, partMaterials } from './parts';

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
}

interface Kit {
  suit: THREE.MeshStandardMaterial;
  gsuit: THREE.MeshStandardMaterial;
  vest: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  shell: THREE.MeshStandardMaterial;
  shellDark: THREE.MeshStandardMaterial;
  visor: THREE.MeshStandardMaterial;
  mask: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  fitting: THREE.MeshStandardMaterial;
  grip: THREE.MeshStandardMaterial;
  console: THREE.MeshStandardMaterial;
}

const kits = new Map<AircrewStyle, Kit>();
function kit(style: AircrewStyle): Kit {
  let k = kits.get(style);
  if (k) return k;
  const M = (color: number, roughness: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const suit = { us: 0x5d624a, eu: 0x575e4b, ru: 0x505748 }[style];
  const gsuit = { us: 0x6a6547, eu: 0x4e5440, ru: 0x484e42 }[style];
  const glove = { us: 0x7b6750, eu: 0x2a2928, ru: 0x2c2b29 }[style];
  const shell = { us: 0x7c8388, eu: 0x8a9095, ru: 0xd9d9d2 }[style];
  k = {
    suit: M(suit, 0.88),
    gsuit: M(gsuit, 0.82),
    vest: M(0x30342b, 0.8),
    glove: M(glove, 0.62),
    shell: M(shell, 0.38, 0.05),
    shellDark: M(0x3a3e41, 0.45, 0.2),
    visor: new THREE.MeshStandardMaterial({ color: 0x17140f, roughness: 0.06, metalness: 0.85, envMapIntensity: 1.4 }),
    mask: M(style === 'ru' ? 0x3d4a38 : 0x3a3d37, 0.7),
    boot: M(0x1b1a19, 0.6, 0.05),
    fitting: M(0x9ba0a4, 0.35, 0.8),
    grip: M(0x141414, 0.55, 0.05),
    console: M(0x2a2d30, 0.7, 0.2),
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

/** The gloved hand closed round a grip: fist, thumb over the top, gauntlet cuff. */
function fist(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // palm and wrapped fingers (the fist lies across the forearm axis)
  const palm = new THREE.SphereGeometry(1, 16, 12);
  palm.scale(0.046, 0.05, 0.052);
  parts.push(strip(palm));
  // knuckle ridge
  const kn = new THREE.CapsuleGeometry(0.018, 0.06, 4, 10);
  kn.rotateZ(Math.PI / 2);
  kn.translate(0, 0.022, -0.035);
  parts.push(strip(kn));
  // thumb along the top of the grip
  const th = new THREE.CapsuleGeometry(0.013, 0.045, 4, 8);
  th.rotateX(-0.9);
  th.translate(-0.028, 0.04, -0.012);
  parts.push(strip(th));
  return join(parts);
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  // --- the ejection seat (the existing seat, built at the origin of this frame) -----
  const sp = seatAndPilot(new THREE.Vector3(), 0, o.martinBaker);
  const seatParts = [sp.seat];
  // yellow and black ejection handles: on the seat pan sides (ACES II), or the
  // loop between the knees (Martin-Baker / K-36, already in the seat)
  if (!o.martinBaker) for (const sx of [-1, 1]) seatParts.push(strip(roundBox(0.035, 0.05, 0.12, 0.012).translate(sx * 0.27, -0.84, -0.1)));
  add(join(seatParts), pm.seat);
  sp.flight.dispose();
  sp.helmet.dispose();
  sp.visor.dispose();
  // seat cushion and back pad
  add(join([strip(roundBox(0.44, 0.07, 0.42, 0.03).translate(0, -0.85, 0.08)), strip(roundBox(0.42, 0.6, 0.06, 0.025).translate(0, -0.5, 0.235))]), K.console);

  // --- consoles, throttle, stick ---------------------------------------------------------------
  const cons: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) cons.push(strip(roundBox(0.12, 0.3, 0.62, 0.02).translate(sx * 0.37, -0.84, -0.18)));
  add(join(cons), K.console);
  // throttle quadrant and grip on the left console
  const thr: THREE.BufferGeometry[] = [];
  thr.push(strip(roundBox(0.07, 0.05, 0.22, 0.01).translate(-0.35, -0.67, -0.14)));
  thr.push(along(limb(0.1, [[0.012, 0], [0.012, 1]], 8), V(-0.35, -0.67, -0.12), V(-0.34, -0.58, -0.13)));
  thr.push(strip(roundBox(0.045, 0.05, 0.1, 0.018).translate(-0.335, -0.555, -0.14)));
  add(join(thr), K.grip);

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
    { z: 0.49, w: 0.2, top: 0.112, bot: 0.1, n: 2.6 },
    { z: 0.555, w: 0.19, top: 0.09, bot: 0.09, n: 2.4 },
    { z: 0.6, w: 0.1, top: 0.06, bot: 0.06, n: 2 },
  ];
  add(trunk(secs).translate(pelvis.x, pelvis.y, pelvis.z), K.suit);
  // survival vest over the chest and back, LPU collar over the shoulders, harness
  const vest = trunk(
    secs.slice(2, 6).map((s) => ({ ...s, w: s.w + 0.014, top: s.top + 0.016, bot: s.bot + 0.012 })),
  ).translate(pelvis.x, pelvis.y, pelvis.z);
  const vp: THREE.BufferGeometry[] = [vest];
  for (const sx of [-1, 1]) {
    // flotation collar lobe from the chest over the shoulder to the back
    const c = new THREE.CatmullRomCurve3([V(sx * 0.06, -0.44, -0.02), V(sx * 0.13, -0.3, -0.03), V(sx * 0.15, -0.23, 0.1), V(sx * 0.12, -0.32, 0.22)]);
    vp.push(strip(new THREE.TubeGeometry(c, 16, 0.038, 10, false)));
    // leg strap of the harness round the thigh
    const ring = new THREE.TorusGeometry(0.085, 0.012, 6, 18);
    ring.rotateY(Math.PI / 2);
    ring.rotateZ(0.1);
    ring.translate(sx * 0.11, -0.8, -0.02);
    vp.push(strip(ring));
    // survival vest pockets
    vp.push(strip(roundBox(0.08, 0.1, 0.04, 0.012).translate(sx * 0.1, -0.5, -0.03)));
  }
  add(join(vp), K.vest);
  // chest buckles and the mask hose connector
  add(join([strip(roundBox(0.05, 0.04, 0.02, 0.006).translate(0, -0.52, -0.04)), strip(roundBox(0.035, 0.035, 0.02, 0.006).translate(-0.07, -0.42, -0.035))]), K.fitting);

  // legs: thigh and calf in the G-suit chaps, knees and boots
  const leg: THREE.BufferGeometry[] = [];
  const legG: THREE.BufferGeometry[] = [];
  const bootG: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const hip = V(sx * 0.095, -0.81, 0.08);
    const knee = V(sx * 0.125, -0.73, -0.36);
    const ankle = V(sx * 0.13, -1.15, -0.47);
    legG.push(along(limb(hip.distanceTo(knee), [[0.075, 0], [0.086, 0.12], [0.08, 0.5], [0.064, 0.9], [0.058, 1]]), hip, knee));
    leg.push(ellipsoid(0.062, 0.06, 0.066, knee, 14, 10));
    legG.push(along(limb(knee.distanceTo(ankle), [[0.058, 0], [0.062, 0.2], [0.052, 0.65], [0.042, 1]]), knee, ankle));
    // boot
    const b = roundBox(0.1, 0.11, 0.27, 0.035);
    b.rotateX(-0.25);
    b.translate(ankle.x, ankle.y - 0.035, ankle.z - 0.08);
    bootG.push(strip(b));
    bootG.push(along(limb(0.1, [[0.046, 0], [0.047, 1]], 12), V(ankle.x, ankle.y - 0.02, ankle.z + 0.01), V(ankle.x, ankle.y + 0.07, ankle.z + 0.03)));
    // shoulder
    leg.push(ellipsoid(0.066, 0.06, 0.064, V(sx * 0.195, -0.285, 0.12), 14, 10));
  }
  add(join(leg), K.suit);
  add(join(legG), K.gsuit);
  add(join(bootG), K.boot);
  // neck (collar)
  add(along(limb(0.1, [[0.058, 0], [0.052, 1]], 16), V(0, -0.25, 0.1), V(0, -0.15, 0.09)), K.suit);

  // helmet: shell, visor housing, tinted visor, helmet-sight mount, oxygen mask and hose
  const hc = V(0, 0.015, 0.085);
  const shell = new THREE.SphereGeometry(1, 28, 20);
  shell.scale(0.128, 0.142, 0.15);
  shell.translate(hc.x, hc.y, hc.z);
  const hs: THREE.BufferGeometry[] = [strip(shell)];
  // the shell comes down over the ears and the nape
  const ear = new THREE.SphereGeometry(1, 16, 12);
  ear.scale(0.132, 0.1, 0.12);
  ear.translate(hc.x, hc.y - 0.06, hc.z + 0.02);
  hs.push(strip(ear));
  add(join(hs), K.shell);
  const dark: THREE.BufferGeometry[] = [];
  // visor housing band across the brow
  const band = new THREE.SphereGeometry(1, 28, 8, Math.PI * 1.12, Math.PI * 0.76, Math.PI * 0.18, Math.PI * 0.16);
  band.scale(0.138, 0.152, 0.16);
  band.translate(hc.x, hc.y, hc.z);
  dark.push(strip(band));
  // helmet-sight mount above the visor
  dark.push(strip(roundBox(0.07, 0.03, 0.05, 0.01).translate(hc.x, hc.y + 0.12, hc.z - 0.1)));
  // the mask: a rounded cup over nose and mouth, with the hose running to the chest connector
  const maskG = lathe([[0.001, 0.0], [0.03, 0.005], [0.052, 0.03], [0.058, 0.06], [0.052, 0.085]], 18, 0, 0, true, false);
  maskG.scale(1, 1.15, 1);
  maskG.rotateX(0.35);
  maskG.translate(hc.x, hc.y - 0.1, hc.z - 0.195);
  add(strip(maskG), K.mask);
  const hose = new THREE.CatmullRomCurve3([V(0, -0.1, -0.118), V(-0.02, -0.19, -0.1), V(-0.05, -0.3, -0.07), V(-0.07, -0.42, -0.05)]);
  add(strip(new THREE.TubeGeometry(hose, 20, 0.017, 8, false)), K.mask);
  add(join(dark), K.shellDark);
  // tinted visor down over the eyes
  const visor = new THREE.SphereGeometry(1, 28, 10, Math.PI * 1.14, Math.PI * 0.72, Math.PI * 0.33, Math.PI * 0.22);
  visor.scale(0.14, 0.155, 0.162);
  visor.translate(hc.x, hc.y, hc.z);
  add(strip(visor), K.visor);

  // left arm on the throttle (static)
  const lS = V(-0.2, -0.285, 0.12);
  const lH = V(-0.335, -0.545, -0.15);
  const lE = elbow(lS, lH, 0.3, 0.3, V(-0.6, -0.6, 0.5));
  add(along(limb(lS.distanceTo(lE), [[0.056, 0], [0.058, 0.2], [0.048, 1]]), lS, lE), K.suit);
  add(along(limb(lE.distanceTo(lH), [[0.046, 0], [0.042, 0.55], [0.036, 0.8], [0.042, 0.84], [0.042, 1]]), lE, lH), K.suit);
  add(ellipsoid(0.048, 0.046, 0.048, lE, 12, 10), K.suit);
  const lf = fist();
  lf.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, lH.clone().sub(lE).normalize()));
  lf.translate(lH.x, lH.y, lH.z);
  add(lf, K.glove);

  // right arm on the stick: upper arm and forearm+hand are posed every frame
  const upper = new THREE.Group();
  const fore = new THREE.Group();
  frame.add(upper);
  frame.add(fore);
  const L1 = 0.3, L2 = 0.31;
  add(limb(L1, [[0.056, 0], [0.058, 0.2], [0.048, 1]]), K.suit, upper);
  add(ellipsoid(0.048, 0.046, 0.048, V(0, L1, 0), 12, 10), K.suit, upper);
  add(limb(L2 - 0.05, [[0.046, 0], [0.042, 0.6], [0.036, 0.85], [0.043, 0.9], [0.043, 1]]), K.suit, fore);
  add(fist().translate(0, L2 - 0.02, 0), K.glove, fore);

  const rig: PilotRig = {
    stick,
    upper,
    fore,
    shoulder: V(0.2, -0.285, 0.12),
    base,
    gripLen,
    handOff: V(0.006, -0.01, 0.012),
    l1: L1,
    l2: L2,
    pole: side ? V(0.45, -0.55, 0.7) : V(0.6, -0.7, 0.45),
    travel: side ? [0.1, 0.1] : [0.22, 0.18],
    p: 0,
    r: 0,
  };
  poseRig(rig, 0, 0);
  for (const m of meshes) m.userData.pilot = true;
  v.hideInCockpit.push(...meshes);
  v.pilots.push(rig);
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

/** Stick deflection (pitch, roll in -1..1) and the right arm following it. */
export function poseRig(r: PilotRig, pitch: number, roll: number): void {
  r.stick.rotation.set(pitch * r.travel[0], 0, -roll * r.travel[1]);
  _g.set(0, r.gripLen, 0).applyEuler(r.stick.rotation).add(r.base);
  _h.copy(_g).add(r.handOff);
  elbow(r.shoulder, _h, r.l1, r.l2, r.pole, _e);
  r.upper.position.copy(r.shoulder);
  r.upper.quaternion.copy(_q.setFromUnitVectors(UP, _d.subVectors(_e, r.shoulder).normalize()));
  r.fore.position.copy(_e);
  r.fore.quaternion.copy(_q.setFromUnitVectors(UP, _d.subVectors(_h, _e).normalize()));
}

/** Per frame: the stick eases toward the pilot's inputs. */
export function updatePilot(r: PilotRig, ac: Aircraft, dt: number): void {
  const c = ac.controls;
  const alive = ac.alive;
  const tp = alive ? THREE.MathUtils.clamp(c.pitch, -1, 1) : 0;
  const tr = alive ? THREE.MathUtils.clamp(c.roll, -1, 1) : 0;
  const k = Math.min(1, dt * 12);
  r.p += (tp - r.p) * k;
  r.r += (tr - r.r) * k;
  poseRig(r, r.p, r.r);
}
