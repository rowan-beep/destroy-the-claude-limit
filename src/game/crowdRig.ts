// The airshow's spectators: one rigged person, instanced by the thousand and posed on
// the GPU. Every vertex carries the bone it hangs off (legs, torso, head, upper arm,
// forearm, or a hand-held thing) and what it is (skin, shirt, trousers, hair...); each
// instance carries its clothes, its build and what it is doing. The vertex shader poses
// the arms with two-bone IK to hand targets, turns the head (and a little of the body)
// to follow the display jet, and colours each part from the instance's palette.
//
// The ten things people do: watch, point at the jet, film it on a phone, wave, clap,
// shade their eyes, cheer, drink, chat to the person next to them, and shoot it on a
// camera with a long lens.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** the bones */
const P = { LEGS: 0, TORSO: 1, HEAD: 2, LUP: 3, LFORE: 4, RUP: 5, RFORE: 6, PHONE: 7, CUP: 8, CAMERA: 9 } as const;
/** what a vertex is */
const R = {
  SKIN: 0, SHIRT: 1, PANTS: 2, HAIR: 3, SHOES: 4,
  /** the forearm: shirt with long sleeves, skin without */
  SLEEVE: 5,
  /** the shins: trousers, or skin under shorts */
  SHIN: 6,
  CAP: 7, DARK: 8, GLASSES: 9, LONGHAIR: 10, WHITE: 11, BELT: 12,
} as const;

export const ANIMS = ['WATCH', 'POINT', 'PHONE', 'WAVE', 'CLAP', 'SHADE', 'CHEER', 'DRINK', 'TALK', 'CAMERA'] as const;

// rest-pose joints (metres, the person facing -z)
const SHOULDER_Y = 1.43, SHOULDER_X = 0.215, L1 = 0.29, L2 = 0.31;

function tag(g: THREE.BufferGeometry, part: number, role: number): THREE.BufferGeometry {
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    a[i * 2] = part;
    a[i * 2 + 1] = role;
  }
  g.setAttribute('aRig', new THREE.BufferAttribute(a, 2));
  return g;
}

/** a tapered limb from y0 down to y1 (centred on x, z) */
function limb(x: number, y0: number, y1: number, r0: number, r1: number, seg: number, z = 0, flat = 1): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r0, r1, y0 - y1, seg, 1, true).scale(1, 1, flat).translate(x, (y0 + y1) / 2, z);
}

/** a lathed shape (radius by height), squashed front-to-back by `flat` */
function lathe(pts: [number, number][], seg: number, flat: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.scale(1, 1, flat);
  return g;
}

/** the whole person; `hi` for the close-up one, else a lighter one for the far crowd */
export function personGeometry(hi: boolean): THREE.BufferGeometry {
  const s = hi ? 8 : 5;
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, part: number, role: number) => parts.push(tag(g, part, role));
  // ---- legs: shoes, shins, thighs, hips (they don't move)
  for (const sx of [-1, 1]) {
    const x = sx * 0.088;
    const shoe = hi ? new THREE.SphereGeometry(0.06, 8, 5).scale(0.95, 0.62, 2.1).translate(x, 0.04, -0.045) : new THREE.BoxGeometry(0.1, 0.08, 0.25).translate(x, 0.04, -0.04);
    add(shoe, P.LEGS, R.SHOES);
    add(limb(x, 0.52, 0.06, 0.06, 0.045, s), P.LEGS, R.SHIN);
    add(limb(x, 0.97, 0.5, 0.092, 0.062, s), P.LEGS, R.PANTS);
  }
  add(lathe([[0.001, 0.86], [0.07, 0.87], [0.14, 0.9], [0.175, 0.94], [0.172, 1.0], [0.001, 1.0]], s + 2, 0.66), P.LEGS, R.PANTS);
  if (hi) add(limb(0, 1.0, 0.97, 0.176, 0.176, s + 2, 0, 0.67), P.LEGS, R.BELT);
  // ---- the torso: a chest wider than the waist, shoulders rounded off
  add(
    lathe(
      [[0.001, 0.99], [0.165, 0.99], [0.158, 1.1], [0.175, 1.25], [0.2, 1.36], [0.195, 1.43], [0.155, 1.48], [0.08, 1.52], [0.001, 1.53]],
      s + 2,
      0.62,
    ),
    P.TORSO,
    R.SHIRT,
  );
  // the neck
  add(limb(0, 1.56, 1.46, 0.048, 0.055, s), P.TORSO, R.SKIN);
  // ---- the head: skull, jaw, nose, ears, hair (and the optional cap, glasses, long hair)
  const hs = hi ? 10 : 6;
  add(new THREE.SphereGeometry(0.1, hs, hi ? 9 : 5).scale(0.85, 1.13, 0.98).translate(0, 1.66, 0), P.HEAD, R.SKIN);
  if (hi) {
    add(new THREE.ConeGeometry(0.016, 0.04, 4).rotateX(-Math.PI / 2 - 0.4).translate(0, 1.655, -0.105), P.HEAD, R.SKIN);
    for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.022, 5, 4).scale(0.5, 1, 0.8).translate(sx * 0.087, 1.66, 0.005), P.HEAD, R.SKIN);
    add(new THREE.BoxGeometry(0.135, 0.024, 0.016).translate(0, 1.685, -0.098), P.HEAD, R.GLASSES);
  }
  // hair: a cap of the skull, the back of the head down to the neck
  add(new THREE.SphereGeometry(0.106, hs, hi ? 6 : 3, 0, Math.PI * 2, 0, Math.PI * 0.42).scale(0.88, 1.08, 1.03).translate(0, 1.672, 0.006), P.HEAD, R.HAIR);
  if (hi) add(new THREE.SphereGeometry(0.1, 8, 6, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.35).scale(0.9, 1.06, 1.04).translate(0, 1.66, 0.006), P.HEAD, R.HAIR);
  add(new THREE.CylinderGeometry(0.08, 0.06, 0.26, hi ? 8 : 4).scale(1.05, 1, 0.55).translate(0, 1.53, 0.07), P.HEAD, R.LONGHAIR);
  // a baseball cap: the crown and the peak
  add(new THREE.SphereGeometry(0.111, hs, hi ? 5 : 3, 0, Math.PI * 2, 0, Math.PI * 0.4).scale(0.9, 0.95, 1.04).translate(0, 1.685, 0.004), P.HEAD, R.CAP);
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.012, hi ? 10 : 5, 1, false, Math.PI * 0.5, Math.PI).scale(1, 1, 1.25).translate(0, 1.71, -0.085), P.HEAD, R.CAP);
  // ---- the arms, hanging straight down from the shoulders (the shader poses them)
  for (const sx of [-1, 1]) {
    const x = sx * SHOULDER_X;
    const up = sx < 0 ? P.LUP : P.RUP, fore = sx < 0 ? P.LFORE : P.RFORE;
    const elbow = SHOULDER_Y - L1;
    // the shoulder ball and the short sleeve
    add(new THREE.SphereGeometry(0.06, s, 4).translate(x, SHOULDER_Y, 0), up, R.SHIRT);
    add(limb(x, SHOULDER_Y, SHOULDER_Y - 0.13, 0.06, 0.054, s), up, R.SHIRT);
    add(limb(x, SHOULDER_Y - 0.13, elbow, 0.048, 0.042, s), up, R.SLEEVE);
    add(new THREE.SphereGeometry(0.043, s, 4).translate(x, elbow, 0), fore, R.SLEEVE);
    add(limb(x, elbow + 0.01, elbow - 0.25, 0.042, 0.032, s), fore, R.SLEEVE);
    // the hand (a mitten with a thumb)
    add(new THREE.BoxGeometry(0.042, 0.095, 0.075).translate(x, elbow - 0.305, -0.005), fore, R.SKIN);
    if (hi) add(new THREE.BoxGeometry(0.022, 0.05, 0.022).rotateX(0.4).translate(x - sx * 0.02, elbow - 0.28, -0.045), fore, R.SKIN);
  }
  // ---- the things people hold (each shown only while doing the thing that needs it;
  //      built round the hand, looking down -z)
  add(new THREE.BoxGeometry(0.075, 0.15, 0.009).translate(0, 0.03, 0), P.PHONE, R.DARK);
  add(new THREE.CylinderGeometry(0.038, 0.03, 0.12, hi ? 8 : 4).translate(0, 0.03, 0), P.CUP, R.WHITE);
  add(new THREE.BoxGeometry(0.13, 0.09, 0.08).translate(-0.05, 0.02, 0.0), P.CAMERA, R.DARK);
  add(new THREE.CylinderGeometry(0.042, 0.045, 0.3, hi ? 8 : 4).rotateX(Math.PI / 2).translate(-0.05, 0.02, -0.19), P.CAMERA, R.WHITE);
  return mergeGeometries(parts)!;
}

/** one person's look and what they are doing */
export interface Spectator {
  shirt: THREE.Color;
  pants: THREE.Color;
  skin: THREE.Color;
  hair: THREE.Color;
  cap: THREE.Color;
  anim: number;
  /** 0..1, so neighbours don't move in step */
  phase: number;
  longSleeves: boolean;
  trousers: boolean;
  hasCap: boolean;
  glasses: boolean;
  longHair: boolean;
}

const SHIRTS = [0xc8302c, 0x2b5fb3, 0xe7e2d6, 0x1f2328, 0x3f7a3a, 0xe0a52a, 0x7b4a9a, 0x2d8fa8, 0xd86a2b, 0x8a8f96, 0xf0f0ee, 0x2a3f6b, 0xb8324f, 0x6c7a3c, 0x4f6f8f, 0xd9c7a0];
const PANTS = [0x2e3a52, 0x3a4560, 0x23262b, 0x5b5348, 0x8a7a5c, 0x3d4a3a, 0x6b6f75, 0x2b3448, 0xb9ad94];
const SKINS = [0xf1c8a8, 0xd9a47e, 0xa8714a, 0x6e4529, 0xe8b894, 0xc68a5e, 0x8d5a3b, 0xf5d2b8];
const HAIRS = [0x2a1d14, 0x3d2a1c, 0x5c3d22, 0x8a6236, 0xb08a52, 0x1a1512, 0x6e6a66, 0xc9c3ba, 0x7a3a1c];
const CAPS = [0x1f2a44, 0xc8302c, 0xf0f0ee, 0x23262b, 0x3f7a3a, 0xe0a52a, 0x2b5fb3];

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** what the crowd does, by share: mostly watching, plenty of phones and pointing */
const ANIM_SHARE = [0.26, 0.1, 0.16, 0.05, 0.06, 0.07, 0.05, 0.07, 0.1, 0.08];

export function randomSpectator(kid = false): Spectator {
  let r = Math.random(), anim = 0;
  for (; anim < ANIM_SHARE.length - 1; anim++) {
    r -= ANIM_SHARE[anim];
    if (r < 0) break;
  }
  // (kids don't drink coffee or carry long lenses)
  if (kid && (anim === 7 || anim === 9)) anim = Math.random() < 0.5 ? 6 : 3;
  const c = (hex: number, v = 0.12) => new THREE.Color(hex).multiplyScalar(1 + (Math.random() - 0.5) * v * 2);
  return {
    shirt: c(pick(SHIRTS), 0.15),
    pants: c(pick(PANTS)),
    skin: c(pick(SKINS), 0.05),
    hair: c(pick(HAIRS)),
    cap: c(pick(CAPS)),
    anim,
    phase: Math.random(),
    longSleeves: Math.random() < 0.3,
    trousers: Math.random() < 0.62,
    hasCap: Math.random() < 0.3,
    glasses: Math.random() < 0.3,
    longHair: Math.random() < 0.35,
  };
}

/** the per-instance attributes for a list of spectators */
export function spectatorAttributes(g: THREE.InstancedBufferGeometry | THREE.BufferGeometry, list: Spectator[]): void {
  const n = list.length;
  const shirt = new Float32Array(n * 3), pants = new Float32Array(n * 3), skin = new Float32Array(n * 3), hair = new Float32Array(n * 3), cap = new Float32Array(n * 3);
  const anim = new Float32Array(n * 4);
  list.forEach((p, i) => {
    p.shirt.toArray(shirt, i * 3);
    p.pants.toArray(pants, i * 3);
    p.skin.toArray(skin, i * 3);
    p.hair.toArray(hair, i * 3);
    p.cap.toArray(cap, i * 3);
    const flags = (p.longSleeves ? 1 : 0) | (p.trousers ? 2 : 0) | (p.hasCap ? 4 : 0) | (p.glasses ? 8 : 0) | (p.longHair ? 16 : 0) | (Math.random() < 0.3 ? 32 : 0);
    anim.set([p.anim, p.phase, flags, 0.85 + Math.random() * 0.3], i * 4);
  });
  g.setAttribute('iShirt', new THREE.InstancedBufferAttribute(shirt, 3));
  g.setAttribute('iPants', new THREE.InstancedBufferAttribute(pants, 3));
  g.setAttribute('iSkin', new THREE.InstancedBufferAttribute(skin, 3));
  g.setAttribute('iHair', new THREE.InstancedBufferAttribute(hair, 3));
  g.setAttribute('iCap', new THREE.InstancedBufferAttribute(cap, 3));
  g.setAttribute('iAnim', new THREE.InstancedBufferAttribute(anim, 4));
}

const VERT_PARS = /* glsl */ `
attribute vec2 aRig;
attribute vec3 iShirt;
attribute vec3 iPants;
attribute vec3 iSkin;
attribute vec3 iHair;
attribute vec3 iCap;
attribute vec4 iAnim;
uniform float uTime;
uniform vec3 uJet;
uniform float uJetOn;

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

// the frame of a bone from its rest frame (down -y, back +z): pointing along d, bent toward u
mat3 boneFrame(vec3 d, vec3 u) {
  vec3 back = u - d * dot(u, d);
  float bl = length(back);
  back = bl > 1e-4 ? back / bl : normalize(cross(d, vec3(1.0, 0.0, 0.0)));
  vec3 right = cross(back, d);
  return mat3(right, -d, back);
}

// two-bone IK: the elbow between shoulder S and hand target T, bending toward the pole
vec3 elbowAt(vec3 S, vec3 T, vec3 pole) {
  vec3 v = T - S;
  float d = clamp(length(v), 0.08, ${(L1 + L2 - 0.002).toFixed(4)});
  vec3 n = normalize(v);
  float a = (${(L1 * L1 - L2 * L2).toFixed(5)} + d * d) / (2.0 * d);
  float h = sqrt(max(0.0, ${(L1 * L1).toFixed(5)} - a * a));
  vec3 u = pole - n * dot(pole, n);
  u = length(u) > 1e-4 ? normalize(u) : vec3(0.0, 0.0, 1.0);
  return S + n * a + u * h;
}
`;

// the pose: everything is worked out per vertex (it is cheap next to the lighting),
// in the person's own frame (facing -z, y up, feet at 0)
const VERT_POSE = /* glsl */ `
  int part = int(aRig.x + 0.5);
  int anim = int(iAnim.x + 0.5);
  float ph = iAnim.y * 6.2832;
  float t = uTime * iAnim.w + ph * 3.0;
  // ---- where the jet is, as seen from this person's head
  mat3 rotI = mat3(modelMatrix) * mat3(instanceMatrix);
  vec3 headW = (modelMatrix * instanceMatrix * vec4(0.0, 1.6, 0.0, 1.0)).xyz;
  vec3 dj = transpose(rotI) * (uJet - headW);
  float jYaw = atan(-dj.x, -dj.z);
  float jPitch = atan(dj.y, length(dj.xz));
  // (nothing flying: looking down the line, now and then glancing about)
  float idleYaw = 0.35 * sin(uTime * 0.13 + ph) + 0.25 * sin(uTime * 0.071 + ph * 2.0);
  float lookYaw = mix(idleYaw, clamp(jYaw, -2.1, 2.1), uJetOn) + 0.06 * sin(uTime * 0.4 + ph);
  float lookPitch = mix(0.02, clamp(jPitch, -0.3, 1.25), uJetOn);
  float track = 1.0;
  // ---- the body: a slow weight shift, breathing
  float sway = 0.025 * sin(t * 0.45);
  float lean = 0.02 + 0.008 * sin(t * 1.6);
  float bounce = 0.0;
  // ---- the arms: hand targets in the body's frame, and which way the elbows point
  vec3 SL = vec3(-${SHOULDER_X}, ${SHOULDER_Y}, 0.0), SR = vec3(${SHOULDER_X}, ${SHOULDER_Y}, 0.0);
  vec3 hangL = SL + vec3(-0.035, -0.58, -0.04), hangR = SR + vec3(0.035, -0.58, -0.04);
  hangL.z += 0.03 * sin(t * 0.45 + 1.0); hangR.z -= 0.03 * sin(t * 0.45 + 1.0);
  vec3 tL = hangL, tR = hangR;
  vec3 poleL = vec3(-0.5, -0.2, 0.85), poleR = vec3(0.5, -0.2, 0.85);
  float yawShare = 0.35;
  vec3 neck = vec3(0.0, 1.52, 0.0);
  int acc = 0;
  // ---- the ten things people do
  if (anim == 1) {
    // pointing it out: the right arm out at the jet, now and then
    float on = smoothstep(0.1, 0.4, sin(t * 0.35)) * uJetOn;
    float by = lookYaw * (1.0 - yawShare), bp = lookPitch;
    vec3 f = vec3(-sin(by) * cos(bp), sin(bp), -cos(by) * cos(bp));
    tR = mix(hangR, SR + f * 0.58, on);
    poleR = vec3(0.6, -0.6, 0.3);
  } else if (anim == 2 || anim == 9) {
    // filming it (phone) or shooting it (a long lens): both hands up in front of the face
    float by = lookYaw * (1.0 - yawShare), bp = clamp(lookPitch, -0.2, 0.95);
    float up = anim == 2 ? smoothstep(-0.6, -0.2, sin(t * 0.22)) : 1.0;
    up = mix(up, 1.0, step(0.5, uJetOn) * (anim == 9 ? 1.0 : 0.6));
    vec3 f = vec3(-sin(by) * cos(bp), sin(bp), -cos(by) * cos(bp));
    vec3 rt = vec3(cos(by), 0.0, -sin(by));
    vec3 eye = vec3(0.0, 1.66, -0.05);
    vec3 hold = anim == 2 ? eye + f * 0.38 - vec3(0.0, 0.06, 0.0) : eye + f * 0.12;
    tR = mix(hangR, hold + rt * (anim == 2 ? 0.03 : 0.06), up);
    tL = mix(hangL, anim == 2 ? hold - rt * 0.03 : eye + f * 0.3 - rt * 0.05 - vec3(0.0, 0.06, 0.0), up);
    poleL = vec3(-0.8, -0.6, 0.1); poleR = vec3(0.8, -0.6, 0.1);
    acc = up > 0.5 ? (anim == 2 ? 7 : 9) : 0;
  } else if (anim == 3) {
    // waving at the pilot
    float w = sin(t * 7.0);
    float on = smoothstep(-0.2, 0.3, sin(t * 0.3));
    tR = mix(hangR, SR + vec3(0.16 + 0.12 * w, 0.5, -0.12), on);
    poleR = vec3(0.9, -0.3, 0.3);
  } else if (anim == 4) {
    // clapping
    float c = 0.5 + 0.5 * sin(t * 15.0);
    float on = smoothstep(0.0, 0.4, sin(t * 0.4 + 1.0));
    vec3 mid = vec3(0.0, 1.18, -0.3);
    tL = mix(hangL, mid + vec3(-0.012 - 0.07 * c, 0.0, 0.0), on);
    tR = mix(hangR, mid + vec3(0.012 + 0.07 * c, 0.0, 0.0), on);
    poleL = vec3(-1.0, -0.4, 0.4); poleR = vec3(1.0, -0.4, 0.4);
    bounce = 0.008 * on * c;
  } else if (anim == 5) {
    // a hand up shading the eyes against the sky
    tR = vec3(0.03, 1.71, -0.16);
    poleR = vec3(1.0, 0.1, 0.0);
    lookPitch = max(lookPitch, 0.25);
  } else if (anim == 6) {
    // cheering: both arms up, a bounce on the toes
    float j = abs(sin(t * 4.0));
    float on = smoothstep(-0.3, 0.2, sin(t * 0.33));
    tL = mix(hangL, SL + vec3(-0.18, 0.5 + 0.05 * j, -0.08), on);
    tR = mix(hangR, SR + vec3(0.18, 0.5 + 0.05 * j, -0.08), on);
    poleL = vec3(-1.0, -0.3, 0.2); poleR = vec3(1.0, -0.3, 0.2);
    bounce = 0.045 * j * on;
  } else if (anim == 7) {
    // a coffee: held at the chest, a sip now and then
    float sip = smoothstep(0.75, 0.95, sin(t * 0.5));
    tR = mix(vec3(0.15, 1.12, -0.25), vec3(0.05, 1.56, -0.13), sip);
    poleR = vec3(0.8, -0.8, 0.2);
    lookPitch = mix(lookPitch, 0.15, sip);
    acc = 8;
  } else if (anim == 8) {
    // chatting to a neighbour: turned to them, hands going; looking up when it's loud
    float side = iAnim.y > 0.5 ? 1.0 : -1.0;
    float glance = smoothstep(0.3, 0.8, sin(t * 0.17));
    track = glance;
    lookYaw = mix(side * 1.15 + 0.1 * sin(t * 0.7), lookYaw, glance);
    lookPitch = mix(-0.08, lookPitch, glance);
    float g = sin(t * 2.3);
    tR = mix(vec3(0.17, 1.08 + 0.05 * g, -0.27), hangR, glance);
    poleR = vec3(0.8, -0.6, 0.4);
  }
  // ---- the head (and a share of the body) turned to look
  float bodyYaw = lookYaw * yawShare;
  float headYaw = clamp(lookYaw - bodyYaw, -1.3, 1.3);
  mat3 Rh = rotY(headYaw) * rotX(lookPitch * 0.85);
  mat3 Rt = rotY(bodyYaw) * rotX(-lean + lookPitch * 0.08) * rotZ(sway);
  vec3 p = position;
  vec3 nrm = normal;
  if (part == 3 || part == 4 || part == 5 || part == 6) {
    bool left = part < 5;
    vec3 S = left ? SL : SR;
    vec3 T = left ? tL : tR;
    vec3 E = elbowAt(S, T, normalize(left ? poleL : poleR));
    vec3 E0 = S - vec3(0.0, ${L1}, 0.0);
    bool upper = part == 3 || part == 5;
    vec3 u = normalize(left ? poleL : poleR);
    mat3 M = upper ? boneFrame(normalize(E - S), u) : boneFrame(normalize(T - E), u);
    p = upper ? S + M * (p - S) : E + M * (p - E0);
    nrm = M * nrm;
  } else if (part == 2) {
    p = neck + Rh * (p - neck);
    nrm = Rh * nrm;
  } else if (part >= 7) {
    // the thing in the right hand, looking where the head looks (a cup stays upright)
    mat3 Ra = part == 8 ? mat3(1.0) : rotY(headYaw) * rotX(clamp(lookPitch, -0.2, 0.95));
    p = (part == acc ? 1.0 : 0.0) * (Ra * p) + tR;
    nrm = Ra * nrm;
  }
  if (part >= 1) {
    vec3 hip = vec3(0.0, 0.95, 0.0);
    p = hip + Rt * (p - hip);
    nrm = Rt * nrm;
  }
  p.y += bounce;
  // ---- the colours
  int role = int(aRig.y + 0.5);
  int flags = int(iAnim.z + 0.5);
  vec3 col = iSkin;
  if (role == 1) col = iShirt;
  else if (role == 2) col = iPants;
  else if (role == 3) col = iHair;
  else if (role == 4) col = (flags & 32) != 0 ? vec3(0.78, 0.78, 0.76) : vec3(0.07, 0.065, 0.06) + iPants * 0.12;
  else if (role == 5) col = (flags & 1) != 0 ? iShirt : iSkin;
  else if (role == 6) col = (flags & 2) != 0 ? iPants : iSkin;
  else if (role == 7) col = iCap;
  else if (role == 8) col = vec3(0.05, 0.05, 0.06);
  else if (role == 9) col = vec3(0.03, 0.035, 0.04);
  else if (role == 10) col = iHair;
  else if (role == 11) col = vec3(0.85, 0.83, 0.8);
  else if (role == 12) col = vec3(0.12, 0.09, 0.07);
  // (things a person hasn't got fold away to nothing)
  bool hide = (role == 7 && (flags & 4) == 0) || (role == 9 && (flags & 8) == 0) || (role == 10 && (flags & 16) == 0);
  if (hide) p = neck + vec3(0.0, 0.1, 0.0);
`;

/** the crowd's material: Lambert-lit and fogged like everything else, posed in the vertex shader */
export class CrowdMaterial extends THREE.MeshLambertMaterial {
  readonly rig = { uTime: { value: 0 }, uJet: { value: new THREE.Vector3() }, uJetOn: { value: 0 } };
  constructor() {
    super({ vertexColors: true });
    this.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.rig);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
        .replace('#include <color_vertex>', '')
        .replace('#include <beginnormal_vertex>', `${VERT_POSE}\n  vColor = vec4(col, 1.0);\n  vec3 objectNormal = nrm;`)
        .replace('#include <begin_vertex>', 'vec3 transformed = p;');
    };
  }
  customProgramCacheKey(): string {
    return 'airshow-crowd-1';
  }
}
