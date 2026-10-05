// The spacesuits the moonwalker can wear, built in detail on one jointed body.
//
// A7L: the white Apollo moonwalking suit. Layered beta cloth with seams and
// creases, grey with lunar dust from the knees down, the life-support backpack
// with the oxygen purge unit on top, the chest control box with its red and
// blue connectors and hoses, the US flag on the left shoulder, ribbed overshoes,
// grey-brown gloves, and the helmet's gold sun visor (reflecting the ground and
// the lander) under its white shell.
//
// AxEMU: the new lunar suit. Charcoal outer layer with orange and blue panels
// on the shoulders, arms and knees, blue piping down the chest, a slim black
// backpack, and a clear bubble helmet ringed with lights, the crew member's
// head visible inside in a comms cap.
//
// ACES: the orange launch and entry pressure suit. Orange nylon with pockets,
// white harness straps and buckles, a silver neck ring and wrist rings, black
// boots and gloves rings, the US flag, and a white helmet with its dark visor.
//
// The body: pelvis, torso, helmet, shoulders, elbows, hands, hips, knees and
// ankles, each a pivot the animation turns.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type SuitId = 'a7l' | 'axemu' | 'aces';
export const SUITS: { id: SuitId; name: string; sub: string; art: string }[] = [
  { id: 'a7l', name: 'APOLLO A7L', sub: 'The white moonwalking suit · gold visor', art: 'linear-gradient(160deg, #f4f2ec 0%, #d9d6cc 60%, #b8b29f 100%)' },
  { id: 'axemu', name: 'AXIOM AxEMU', sub: 'Next-generation lunar suit · bubble helmet', art: 'linear-gradient(160deg, #24252b 0%, #1a1b20 55%, #e8642c 56%, #e8642c 64%, #3a6fd8 65%, #3a6fd8 70%, #1a1b20 71%)' },
  { id: 'aces', name: 'ACES PRESSURE SUIT', sub: 'The orange launch-and-entry suit', art: 'linear-gradient(160deg, #f07a3a 0%, #e0622a 60%, #b8481e 100%)' },
];
const KEY = 'triad.space.suit';
export function loadSuit(): SuitId {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'a7l' || s === 'axemu' || s === 'aces') return s;
  } catch {
    /* the default */
  }
  return 'a7l';
}
export function saveSuit(s: SuitId): void {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* this session only */
  }
}

export interface Rig {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  hipL: THREE.Group;
  kneeL: THREE.Group;
  ankleL: THREE.Group;
  hipR: THREE.Group;
  kneeR: THREE.Group;
  ankleR: THREE.Group;
  shL: THREE.Group;
  elL: THREE.Group;
  shR: THREE.Group;
  elR: THREE.Group;
  handR: THREE.Group;
}

// ------------------------------------------------------------------ cloth
const cache = new Map<string, { map: THREE.Texture; bump: THREE.Texture }>();
/** woven fabric: a colour field with weave, creases, seams and (optionally) dust rising from the bottom */
function fabric(key: string, base: string, opts: { dust?: number; seams?: number; creases?: number } = {}): { map: THREE.Texture; bump: THREE.Texture } {
  const k = `${key}|${base}|${opts.dust ?? 0}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const N = 256;
  const col = document.createElement('canvas');
  const bmp = document.createElement('canvas');
  col.width = col.height = bmp.width = bmp.height = N;
  const c = col.getContext('2d')!, b = bmp.getContext('2d')!;
  c.fillStyle = base;
  c.fillRect(0, 0, N, N);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, N, N);
  let s = 1234 + key.length * 77;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // the weave
  for (let y = 0; y < N; y += 2) {
    c.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.025})`;
    c.fillRect(0, y, N, 1);
    b.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.05})`;
    b.fillRect(0, y, N, 1);
  }
  // creases: soft curved folds, light on one side, shadow on the other
  for (let i = 0; i < (opts.creases ?? 26); i++) {
    const x0 = r() * N, y0 = r() * N, len = 30 + r() * 90, a = (r() - 0.5) * 0.9 + (r() < 0.5 ? 0 : Math.PI / 2);
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    const cx = (x0 + x1) / 2 + (r() - 0.5) * 30, cy = (y0 + y1) / 2 + (r() - 0.5) * 30;
    for (const [off, cs, bs] of [[-1.5, 'rgba(0,0,0,0.13)', 'rgba(0,0,0,0.5)'], [1.5, 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.45)']] as [number, string, string][]) {
      for (const [ctx, st] of [[c, cs], [b, bs]] as [CanvasRenderingContext2D, string][]) {
        ctx.strokeStyle = st;
        ctx.lineWidth = 2 + r() * 2;
        ctx.beginPath();
        ctx.moveTo(x0 + off, y0);
        ctx.quadraticCurveTo(cx + off, cy, x1 + off, y1);
        ctx.stroke();
      }
    }
  }
  // seams: stitched lines
  for (let i = 0; i < (opts.seams ?? 3); i++) {
    const vert = r() < 0.5;
    const p = r() * N;
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    b.strokeStyle = 'rgba(0,0,0,0.6)';
    for (const ctx of [c, b]) {
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      if (vert) {
        ctx.moveTo(p, 0);
        ctx.lineTo(p + (r() - 0.5) * 20, N);
      } else {
        ctx.moveTo(0, p);
        ctx.lineTo(N, p + (r() - 0.5) * 20);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // lunar dust, worked into the lower parts
  if (opts.dust) {
    const g = c.createLinearGradient(0, 0, 0, N);
    g.addColorStop(0, 'rgba(90,84,76,0)');
    g.addColorStop(0.55, `rgba(90,84,76,${0.12 * opts.dust})`);
    g.addColorStop(1, `rgba(70,64,58,${0.55 * opts.dust})`);
    c.fillStyle = g;
    c.fillRect(0, 0, N, N);
    for (let i = 0; i < 300 * opts.dust; i++) {
      c.fillStyle = `rgba(70,64,56,${r() * 0.25})`;
      const y = N * (0.5 + 0.5 * Math.sqrt(r()));
      c.fillRect(r() * N, y, 1 + r() * 4, 1 + r() * 3);
    }
  }
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(bmp);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  const out = { map, bump };
  cache.set(k, out);
  return out;
}

function flagTex(): THREE.Texture {
  const fc = document.createElement('canvas');
  fc.width = 76;
  fc.height = 40;
  const fg = fc.getContext('2d')!;
  for (let i = 0; i < 13; i++) {
    fg.fillStyle = i % 2 ? '#f4f3ef' : '#b22234';
    fg.fillRect(0, (i * 40) / 13, 76, 40 / 13 + 0.5);
  }
  fg.fillStyle = '#3c3b6e';
  fg.fillRect(0, 0, 31, 21.5);
  fg.fillStyle = '#ffffff';
  for (let r = 0; r < 5; r++) for (let k = 0; k < 6; k++) fg.fillRect(2 + k * 5, 2 + r * 4, 1.2, 1.2);
  const t = new THREE.CanvasTexture(fc);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** the gold visor: sky, a reflected horizon, the lander and the ground, as the photos show */
function goldVisor(): THREE.MeshStandardMaterial {
  const vc = document.createElement('canvas');
  vc.width = 128;
  vc.height = 128;
  const g = vc.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#0d0802');
  gr.addColorStop(0.42, '#2a1a05');
  gr.addColorStop(0.47, '#c79a45');
  gr.addColorStop(0.75, '#a87c34');
  gr.addColorStop(1, '#e8c47a');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  // the reflected lander and a figure
  g.fillStyle = 'rgba(255,210,120,0.8)';
  g.fillRect(84, 44, 16, 14);
  g.fillStyle = 'rgba(30,20,8,0.7)';
  g.fillRect(70, 52, 3, 26);
  // the highlight of the Sun
  const hl = g.createRadialGradient(40, 30, 0, 40, 30, 22);
  hl.addColorStop(0, 'rgba(255,250,230,0.9)');
  hl.addColorStop(1, 'rgba(255,250,230,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(vc);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.06, metalness: 0.95, emissive: new THREE.Color('#2a1c06'), emissiveIntensity: 0.5 });
}

// ------------------------------------------------------------------ the body
export function buildSuit(id: SuitId): Rig {
  const A7L = id === 'a7l', AX = id === 'axemu', ACES = id === 'aces';
  const baseCol = A7L ? '#f1eee6' : AX ? '#26272c' : '#e8692e';
  const f = fabric(id, baseCol, { creases: A7L ? 30 : AX ? 18 : 34, seams: AX ? 5 : 3 });
  const fLow = fabric(id + 'low', baseCol, { dust: A7L ? 1 : 0.6, creases: 36 });
  const suit = new THREE.MeshStandardMaterial({ map: f.map, bumpMap: f.bump, bumpScale: 1.4, roughness: AX ? 0.75 : 0.88 });
  const suitLow = new THREE.MeshStandardMaterial({ map: fLow.map, bumpMap: fLow.bump, bumpScale: 1.6, roughness: 0.9 });
  const shade = new THREE.MeshStandardMaterial({ color: A7L ? '#dcd8cc' : AX ? '#1b1c20' : '#cf5a26', roughness: 0.9 });
  const grey = new THREE.MeshStandardMaterial({ color: '#a9a8a2', roughness: 0.55, metalness: 0.35 });
  const metal = new THREE.MeshStandardMaterial({ color: '#c9cacc', roughness: 0.25, metalness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.55 });
  const blue = new THREE.MeshStandardMaterial({ color: AX ? '#3a6fd8' : '#2b4fa8', roughness: 0.55 });
  const red = new THREE.MeshStandardMaterial({ color: '#b5262e', roughness: 0.55 });
  const orange = new THREE.MeshStandardMaterial({ color: '#e8642c', roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: '#f2f1ed', roughness: 0.6 });
  const glove = new THREE.MeshStandardMaterial({ color: A7L ? '#8a7f6e' : AX ? '#1a1a1d' : '#e0642c', roughness: 0.8 });
  const boot = new THREE.MeshStandardMaterial({ color: A7L ? '#c9c6bb' : '#121214', roughness: 0.75 });
  const sole = new THREE.MeshStandardMaterial({ color: A7L ? '#4a5468' : '#1c1c1e', roughness: 0.9 });
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const joint = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const band = (parent: THREE.Object3D, r: number, y: number, m: THREE.Material, h = 0.05) => mesh(new THREE.CylinderGeometry(r, r, h, 16, 1, true), m, parent, 0, y, 0);
  const bulk = A7L ? 1.08 : AX ? 1.0 : 0.92;

  const root = new THREE.Group();
  const pelvis = joint(root, 0, 0.98, 0);
  mesh(new THREE.CapsuleGeometry(0.2 * bulk, 0.14, 6, 16).rotateZ(Math.PI / 2), suit, pelvis);
  const torso = joint(pelvis, 0, 0.08, 0);
  mesh(new THREE.CapsuleGeometry(0.25 * bulk, 0.32, 8, 18), suit, torso, 0, 0.32, 0);
  // ---- the back
  if (A7L) {
    // the life-support backpack and the oxygen purge unit on top
    // both wear the same creased white beta-cloth cover as the suit
    mesh(new RoundedBoxGeometry(0.52, 0.64, 0.27, 4, 0.05), suit, torso, 0, 0.36, -0.35);
    mesh(new RoundedBoxGeometry(0.47, 0.17, 0.24, 3, 0.04), suit, torso, 0, 0.77, -0.35);
    mesh(new THREE.BoxGeometry(0.48, 0.025, 0.25), shade, torso, 0, 0.675, -0.35);
    // the cover's seams and lacing, the water fill port, the harness straps over the shoulders
    for (const y of [0.2, 0.46]) mesh(new THREE.BoxGeometry(0.53, 0.012, 0.28), shade, torso, 0, y, -0.35);
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 10).rotateX(Math.PI / 2), grey, torso, 0.16, 0.3, -0.49);
    mesh(new THREE.BoxGeometry(0.1, 0.06, 0.02), grey, torso, -0.12, 0.56, -0.49);
    for (const sx of [-1, 1]) {
      mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 6), grey, torso, sx * 0.27, 0.36, -0.22);
      const st = mesh(new THREE.TorusGeometry(0.2, 0.018, 4, 12, Math.PI * 0.75), shade, torso, sx * 0.17, 0.52, -0.02);
      st.rotation.set(0, Math.PI / 2, Math.PI * 0.12);
    }
  } else if (AX) {
    const pack = mesh(new THREE.CapsuleGeometry(0.2, 0.36, 6, 14), black, torso, 0, 0.36, -0.32);
    pack.scale.set(1.25, 1, 0.7);
    mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), orange, torso, 0, 0.62, -0.42);
  } else {
    // a slim survival pack and harness
    mesh(new RoundedBoxGeometry(0.42, 0.5, 0.16, 3, 0.05), suit, torso, 0, 0.36, -0.3);
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.05, 0.52, 0.02), white, torso, sx * 0.13, 0.37, -0.39);
    mesh(new THREE.BoxGeometry(0.3, 0.04, 0.02), white, torso, 0, 0.22, -0.39);
  }
  // ---- the front
  if (A7L) {
    // the chest control box, its controls, and the red and blue suit connectors with their hoses
    mesh(new THREE.BoxGeometry(0.3, 0.17, 0.11), white, torso, 0, 0.4, 0.27);
    mesh(new THREE.BoxGeometry(0.06, 0.07, 0.02), grey, torso, 0.06, 0.42, 0.33);
    for (const [x, y, m] of [[-0.11, 0.2, red], [0.1, 0.21, red], [-0.09, 0.28, blue], [0.08, 0.29, blue]] as [number, number, THREE.Material][]) {
      const cn = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), m, torso, x, y, 0.27);
      cn.rotation.x = Math.PI / 2;
    }
    for (const [sx, m] of [[1, blue], [-1, red]] as [number, THREE.Material][]) {
      const hose = mesh(new THREE.TorusGeometry(0.12, 0.022, 6, 14, Math.PI * 0.9), m, torso, sx * 0.1, 0.24, 0.24);
      hose.rotation.set(0, Math.PI / 2, -0.4 * sx);
    }
    mesh(new THREE.BoxGeometry(0.42, 0.04, 0.03), shade, torso, 0, 0.05, 0.23);
  } else if (AX) {
    // blue piping down the chest, orange yoke, the logo
    for (const sx of [-1, 1]) {
      const p = mesh(new THREE.BoxGeometry(0.025, 0.42, 0.02), blue, torso, sx * 0.07, 0.3, 0.255);
      p.rotation.z = sx * 0.28;
    }
    const lc = document.createElement('canvas');
    lc.width = 64;
    lc.height = 32;
    const lg = lc.getContext('2d')!;
    lg.fillStyle = '#e8642c';
    lg.font = 'bold 26px Arial';
    lg.fillText('AX', 12, 26);
    const lt = new THREE.CanvasTexture(lc);
    lt.colorSpace = THREE.SRGBColorSpace;
    mesh(new THREE.PlaneGeometry(0.14, 0.07), new THREE.MeshStandardMaterial({ map: lt, transparent: true, roughness: 0.6 }), torso, 0, 0.47, 0.27);
  } else {
    // the harness: white straps over the shoulders and across the chest, buckles, a pocket
    for (const sx of [-1, 1]) {
      const st = mesh(new THREE.BoxGeometry(0.05, 0.5, 0.02), white, torso, sx * 0.11, 0.38, 0.255);
      st.rotation.z = sx * 0.12;
    }
    mesh(new THREE.BoxGeometry(0.34, 0.04, 0.02), white, torso, 0, 0.36, 0.27);
    mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), metal, torso, 0, 0.36, 0.285);
    mesh(new THREE.BoxGeometry(0.12, 0.1, 0.04), shade, torso, 0.12, 0.2, 0.25);
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 14), metal, torso, -0.09, 0.22, 0.27).rotation.x = Math.PI / 2;
  }
  // the flag on the left shoulder
  const patch = mesh(new THREE.PlaneGeometry(0.13, 0.07), new THREE.MeshStandardMaterial({ map: flagTex(), roughness: 0.8 }), torso, 0.285 * bulk, 0.5, 0.06);
  patch.rotation.y = Math.PI / 2;
  // ---- the helmet
  const head = joint(torso, 0, 0.66, 0.02);
  if (A7L) {
    mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 20), grey, head, 0, -0.06, 0).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.225, 26, 18), white, head, 0, 0.1, -0.01);
    mesh(new THREE.SphereGeometry(0.212, 26, 18, Math.PI * 0.1, Math.PI * 0.8, Math.PI * 0.24, Math.PI * 0.44), goldVisor(), head, 0, 0.1, 0.016);
  } else if (AX) {
    // a clear bubble: the head inside in a comms cap, a ring of lights on top
    mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 22), black, head, 0, -0.06, 0).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshStandardMaterial({ color: '#7a5a46', roughness: 0.7 }), head, 0, 0.08, 0.02);
    mesh(new THREE.SphereGeometry(0.118, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: '#1d1d22', roughness: 0.8 }), head, 0, 0.09, 0.0);
    // the face inside: eyes, brows, a microphone at the cheek
    const dk = new THREE.MeshStandardMaterial({ color: '#1a1210', roughness: 0.5 });
    for (const sx of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.012, 8, 6), dk, head, sx * 0.035, 0.1, 0.122);
      mesh(new THREE.BoxGeometry(0.03, 0.006, 0.01), dk, head, sx * 0.036, 0.122, 0.118);
    }
    mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshStandardMaterial({ color: '#6e4f3c', roughness: 0.7 }), head, 0, 0.075, 0.13);
    mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6).rotateZ(Math.PI / 2.4), black, head, 0.06, 0.03, 0.11);
    // the bubble: clear polycarbonate that shows itself only at its rim and in the sun's glint
    const shell = new THREE.SphereGeometry(0.23, 36, 26);
    const glint = mesh(shell, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false }), head, 0, 0.1, 0);
    glint.castShadow = false;
    glint.renderOrder = 2;
    const rim = mesh(
      shell,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec3 vN; varying vec3 vV; void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5); gl_FragColor = vec4(vec3(0.82, 0.88, 0.95), 0.04 + 0.55 * f); }',
      }),
      head,
      0,
      0.1,
      0,
    );
    rim.castShadow = false;
    rim.renderOrder = 3;
    // the light bar hugs the bubble's brow, a lamp and a camera either side
    mesh(new THREE.TorusGeometry(0.222, 0.026, 8, 28, Math.PI * 1.1).rotateZ(-Math.PI * 0.05).rotateX(Math.PI / 2), black, head, 0, 0.18, 0);
    const lamp = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: new THREE.Color('#fff6dd'), emissiveIntensity: 2.5 });
    for (const sx of [-1, 1]) {
      const a = 0.55 * sx;
      const l = mesh(new THREE.BoxGeometry(0.06, 0.03, 0.03), lamp, head, Math.sin(a) * 0.24, 0.18, Math.cos(a) * 0.24);
      l.rotation.y = a;
    }
  } else {
    mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 20), metal, head, 0, -0.06, 0).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.215, 26, 18), white, head, 0, 0.1, -0.01);
    mesh(new THREE.SphereGeometry(0.205, 26, 18, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.2, Math.PI * 0.44), new THREE.MeshStandardMaterial({ color: '#0c0d10', roughness: 0.05, metalness: 0.6 }), head, 0, 0.1, 0.016);
    for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), metal, head, sx * 0.2, 0.1, 0.02).rotation.z = Math.PI / 2;
  }
  // ---- arms
  const arm = (sx: number) => {
    const sh = joint(torso, sx * 0.3 * bulk, 0.52, 0);
    mesh(new THREE.SphereGeometry(0.11 * bulk, 14, 10), suit, sh);
    const ua = mesh(new THREE.CapsuleGeometry(0.085 * bulk, 0.24, 6, 14), suit, sh, 0, -0.17, 0);
    void ua;
    if (AX) band(sh, 0.09, -0.1, orange, 0.07);
    if (AX) band(sh, 0.092, -0.22, blue, 0.025);
    const el = joint(sh, 0, -0.33, 0);
    mesh(new THREE.SphereGeometry(0.085 * bulk, 12, 8), shade, el);
    mesh(new THREE.CapsuleGeometry(0.075 * bulk, 0.22, 6, 14), suit, el, 0, -0.15, 0);
    // the glove's wrist ring, then the glove
    band(el, 0.08, -0.29, ACES ? black : AX ? orange : metal, 0.05);
    if (A7L && sx < 0) mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), black, el, 0, -0.24, 0.07);
    const hand = joint(el, 0, -0.36, 0);
    mesh(new THREE.BoxGeometry(0.095, 0.12, 0.075), glove, hand, 0, -0.03, 0);
    mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), glove, hand, -sx * 0.055, -0.01, 0.03);
    return { sh, el, hand };
  };
  const L = arm(1), Rr = arm(-1);
  // ---- legs
  const leg = (sx: number) => {
    const hip = joint(pelvis, sx * 0.12, -0.05, 0);
    mesh(new THREE.CapsuleGeometry(0.105 * bulk, 0.3, 6, 14), suit, hip, 0, -0.22, 0);
    if (ACES) mesh(new THREE.BoxGeometry(0.1, 0.14, 0.05), shade, hip, sx * 0.07, -0.25, 0.08);
    const knee = joint(hip, 0, -0.45, 0);
    mesh(new THREE.SphereGeometry(0.1 * bulk, 12, 8), AX ? orange : shade, knee);
    mesh(new THREE.CapsuleGeometry(0.095 * bulk, 0.28, 6, 14), suitLow, knee, 0, -0.2, 0);
    if (AX) band(knee, 0.1, -0.08, orange, 0.06);
    const ankle = joint(knee, 0, -0.43, 0);
    // boots: the Apollo overshoe with its ribbed blue sole, or black boots
    mesh(new THREE.BoxGeometry(0.16, 0.13, 0.3), boot, ankle, 0, -0.035, 0.05);
    mesh(new THREE.BoxGeometry(0.17, 0.035, 0.32), sole, ankle, 0, -0.1, 0.05);
    if (A7L) for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(0.165, 0.012, 0.012), grey, ankle, 0, -0.02, -0.06 + i * 0.07);
    if (AX) mesh(new THREE.BoxGeometry(0.165, 0.03, 0.31), orange, ankle, 0, 0.02, 0.05);
    return { hip, knee, ankle };
  };
  const LL = leg(1), RL = leg(-1);
  return { root, pelvis, torso, head, hipL: LL.hip, kneeL: LL.knee, ankleL: LL.ankle, hipR: RL.hip, kneeR: RL.knee, ankleR: RL.ankle, shL: L.sh, elL: L.el, shR: Rr.sh, elR: Rr.el, handR: Rr.hand };
}
