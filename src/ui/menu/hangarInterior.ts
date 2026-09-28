// The hangar behind the main menu: a modern maintenance hangar, built
// procedurally. A steel-framed shed with insulated cladding, clerestory
// windows and sliding doors half open onto a sunlit apron; the sun falls in
// through the doors and windows (real shadows, light shafts, dust in the
// beams). Inside: roof trusses, an overhead crane, ducts and LED high-bays; a
// two-storey office block with stairs at the back; workbenches, tool chests,
// racking, desks with computers, lockers and posters along the walls; and
// ground equipment around the jet (boarding ladder, chocks, power cart,
// extinguisher, work stands, cones).
//
// Everything static is merged into one mesh per material, so the whole
// building costs a few dozen draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Aircraft } from '../../aircraft/aircraft';
import type { AirframeVisual } from '../../aircraft/models';

/** interior: x -W/2..W/2, z -D/2 (doors) .. D/2 (offices), floor 0 .. roof H */
export const HANGAR = { W: 46, D: 60, H: 15 };
const W2 = HANGAR.W / 2;
const D2 = HANGAR.D / 2;
const H = HANGAR.H;
const DOOR_W2 = 15;
const DOOR_H = 12.5;
/** clerestory windows on both side walls */
const WIN_Y0 = 8;
const WIN_Y1 = 11;

/** direction the sunlight travels (from the sun toward the ground) */
export const SUN_DIR = new THREE.Vector3(0.62, -0.58, 0.53).normalize();

// ---------------------------------------------------------------------------
// geometry batching
// ---------------------------------------------------------------------------

class Batch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, geo: THREE.BufferGeometry, m?: THREE.Matrix4): void {
    if (m) geo.applyMatrix4(m);
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g = g as THREE.BufferGeometry;
    let list = this.groups.get(mat);
    if (!list) this.groups.set(mat, (list = []));
    list.push(g);
  }
  build(parent: THREE.Object3D, shadows = true): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.groups) {
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!geo) continue;
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      const lit = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && !mat.transparent;
      m.castShadow = shadows && lit;
      m.receiveShadow = lit;
      parent.add(m);
      out.push(m);
    }
    this.groups.clear();
    return out;
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
function at(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.Matrix4 {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return _m.clone().compose(new THREE.Vector3(x, y, z), _q, _s);
}
/** box centred at x, y, z */
function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}
function cyl(r0: number, r1: number, h: number, seg = 16): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r0, r1, h, seg);
}
/** a round bar from a to b */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
/** a square steel member from a to b */
function beam(a: THREE.Vector3, b: THREE.Vector3, s: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(s, len, s);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** World-space UVs (metres * scale) projected along the dominant normal axis. */
function worldUV(g: THREE.BufferGeometry, scale = 1): THREE.BufferGeometry {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ax >= ay && ax >= az) (u = p.getZ(i)), (v = p.getY(i));
    else if (az >= ay) (u = p.getX(i)), (v = p.getY(i));
    else (u = p.getX(i)), (v = p.getZ(i));
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------------------------------------------------------------------------
// procedural textures
// ---------------------------------------------------------------------------

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function tex(c: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Polished epoxy floor with its painted markings, joints and wear. Returns colour + roughness maps. */
function floorTextures(): { map: THREE.Texture; rough: THREE.Texture } {
  const PX = 34; // px per metre
  const w = HANGAR.W * PX, h = HANGAR.D * PX;
  const [c, g] = canvas(w, h);
  const [rc, rg] = canvas(w, h);
  const r = rng(7);
  // metres -> px (x right, z down: z = -D/2 (doors) at the top)
  const X = (x: number) => (x + W2) * PX;
  const Z = (z: number) => (z + D2) * PX;
  g.fillStyle = '#8f9599';
  g.fillRect(0, 0, w, h);
  rg.fillStyle = 'rgb(0,70,0)';
  rg.fillRect(0, 0, w, h);
  // trowel mottling and faint cloudy variation in the resin
  for (let i = 0; i < 2600; i++) {
    const x = r() * w, y = r() * h, rad = 20 + r() * 160;
    const dark = r() < 0.55;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, dark ? `rgba(60,64,66,${0.03 + r() * 0.04})` : `rgba(190,194,196,${0.03 + r() * 0.04})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    const rr = rg.createRadialGradient(x, y, 0, x, y, rad);
    rr.addColorStop(0, `rgba(0,${dark ? 95 : 55},0,0.25)`);
    rr.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = rr;
    rg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // slab joints every 6 m
  g.strokeStyle = 'rgba(40,42,44,0.55)';
  g.lineWidth = 2;
  for (let x = -W2 + 5; x < W2; x += 6) {
    g.beginPath();
    g.moveTo(X(x), 0);
    g.lineTo(X(x), h);
    g.stroke();
  }
  for (let z = -D2 + 6; z < D2; z += 6) {
    g.beginPath();
    g.moveTo(0, Z(z));
    g.lineTo(w, Z(z));
    g.stroke();
  }
  const paint = (col: string, rough = 150) => {
    g.fillStyle = col;
    rg.fillStyle = `rgb(0,${rough},0)`;
  };
  const rect = (x0: number, z0: number, x1: number, z1: number) => {
    g.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
    rg.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
  };
  // yellow lead-in line from the doors to the nose-wheel stop bar
  paint('#d9a514');
  rect(-0.08, -D2, 0.08, -7.2);
  rect(-2.2, -7.35, 2.2, -7.05);
  // parking box: dashed yellow outline around the jet
  for (let t = -20; t < 20; t += 1.6) {
    rect(-11.5, t, -11.35, t + 0.9);
    rect(11.35, t, 11.5, t + 0.9);
  }
  for (let t = -11.5; t < 11.5; t += 1.6) {
    rect(t, -20, t + 0.9, -19.85);
    rect(t, 19.85, t + 0.9, 20);
  }
  // pedestrian walkways along both side walls (green), with white edges
  paint('#2f7d4f', 140);
  rect(-W2 + 1.2, -D2 + 2, -W2 + 2.4, D2 - 7);
  rect(W2 - 2.4, -D2 + 2, W2 - 1.2, D2 - 7);
  paint('#e8e8e2');
  for (const x of [-W2 + 1.2, -W2 + 2.33, W2 - 2.4, W2 - 1.27]) rect(x, -D2 + 2, x + 0.07, D2 - 7);
  // hatched keep-clear boxes (doors' tracks, electrical panels, the stair foot)
  const hatch = (x0: number, z0: number, x1: number, z1: number, a: string, b: string) => {
    g.save();
    g.beginPath();
    g.rect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
    g.clip();
    g.fillStyle = a;
    g.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
    g.strokeStyle = b;
    g.lineWidth = 0.28 * PX;
    for (let k = -80; k < 80; k += 0.8) {
      g.beginPath();
      g.moveTo(X(x0 + k), Z(z0));
      g.lineTo(X(x0 + k + (z1 - z0)), Z(z1));
      g.stroke();
    }
    g.restore();
    rg.fillStyle = 'rgb(0,150,0)';
    rg.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
  };
  hatch(-W2, -D2, -DOOR_W2 + 0.5, -D2 + 1.6, '#d9a514', '#1c1c1c');
  hatch(DOOR_W2 - 0.5, -D2, W2, -D2 + 1.6, '#d9a514', '#1c1c1c');
  hatch(14.6, 15.4, 17.6, 17.4, '#d9a514', '#1c1c1c');
  hatch(-W2 + 2.6, -2.5, -W2 + 4.2, 1.5, '#c9352b', '#e8e8e2');
  // drainage trench across the door opening
  g.fillStyle = '#2a2c2e';
  g.fillRect(X(-DOOR_W2), Z(-D2 + 2.2), X(DOOR_W2) - X(-DOOR_W2), 0.35 * PX);
  g.fillStyle = '#55595c';
  for (let x = -DOOR_W2; x < DOOR_W2; x += 0.12) g.fillRect(X(x), Z(-D2 + 2.23), 0.05 * PX, 0.29 * PX);
  // stencilled text on the floor
  g.save();
  g.fillStyle = 'rgba(232,232,226,0.9)';
  g.font = `bold ${Math.round(0.9 * PX)}px Arial`;
  g.textAlign = 'center';
  g.fillText('NO SMOKING', X(0), Z(-D2 + 5));
  g.fillText('FOD CHECK', X(-8), Z(-D2 + 5));
  g.fillText('BAY 2', X(8), Z(-D2 + 5));
  g.restore();
  // tie-down rings on a grid
  g.strokeStyle = 'rgba(70,74,76,0.9)';
  g.lineWidth = 3;
  for (let x = -16; x <= 16; x += 8)
    for (let z = -18; z <= 18; z += 9) {
      g.beginPath();
      g.arc(X(x), Z(z), 0.14 * PX, 0, Math.PI * 2);
      g.stroke();
    }
  // tyre marks along the lead-in line and fluid stains near the parking spot
  for (const off of [-1.4, 1.4, -0.05]) {
    for (let k = 0; k < 6; k++) {
      g.strokeStyle = `rgba(30,30,30,${0.05 + r() * 0.06})`;
      g.lineWidth = (0.15 + r() * 0.15) * PX;
      g.beginPath();
      const x0 = off + (r() - 0.5) * 0.4;
      g.moveTo(X(x0), Z(-D2 + r() * 3));
      g.bezierCurveTo(X(x0 + (r() - 0.5)), Z(-20), X(x0 + (r() - 0.5)), Z(-12), X(off * 0.6 + (r() - 0.5) * 0.3), Z(-2 - r() * 6));
      g.stroke();
    }
  }
  for (let i = 0; i < 16; i++) {
    const x = (r() - 0.5) * 14, z = -4 + r() * 14, rad = (0.15 + r() * 0.5) * PX;
    const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), rad);
    gr.addColorStop(0, 'rgba(24,22,20,0.35)');
    gr.addColorStop(0.7, 'rgba(24,22,20,0.18)');
    gr.addColorStop(1, 'rgba(24,22,20,0)');
    g.fillStyle = gr;
    g.fillRect(X(x) - rad, Z(z) - rad, rad * 2, rad * 2);
    rg.fillStyle = 'rgba(0,30,0,0.6)';
    rg.beginPath();
    rg.arc(X(x), Z(z), rad * 0.6, 0, Math.PI * 2);
    rg.fill();
  }
  const map = tex(c);
  const rough = tex(rc, false);
  return { map, rough };
}

/** Trapezoidal-rib metal cladding: normal map tile (ribs run vertically). */
function claddingNormal(): THREE.Texture {
  const [c, g] = canvas(128, 8);
  for (let x = 0; x < 128; x++) {
    const u = x / 128;
    // rib profile: flat pan, sloped flank up, flat crown, flank down
    let nx = 0;
    if (u > 0.1 && u < 0.18) nx = -0.7;
    else if (u > 0.32 && u < 0.4) nx = 0.7;
    else if (u > 0.6 && u < 0.62) nx = -0.3;
    else if (u > 0.8 && u < 0.82) nx = 0.3;
    const r = Math.round((nx * 0.5 + 0.5) * 255);
    g.fillStyle = `rgb(${r},128,${Math.round(Math.sqrt(1 - nx * nx) * 127 + 128)})`;
    g.fillRect(x, 0, 1, 8);
  }
  const t = tex(c, false, true);
  return t;
}

/** Painted concrete blockwork (lower walls). */
function blockTexture(): THREE.Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#b4babd';
  g.fillRect(0, 0, 256, 256);
  const r = rng(3);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '90,95,98' : '220,224,226'},0.05)`;
    g.fillRect(r() * 256, r() * 256, 2 + r() * 10, 2 + r() * 10);
  }
  g.strokeStyle = 'rgba(95,100,104,0.8)';
  g.lineWidth = 2;
  // 0.4 x 0.2 m blocks: the tile is 0.8 x 0.8 m
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
    for (let k = 0; k < 3; k++) {
      const x = ((k * 128 + (row % 2) * 64) % 256) + 0.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 64);
      g.stroke();
    }
  }
  return tex(c, true, true);
}

function sign(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  return tex(c);
}

function textFit(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, font = 'Arial', weight = 'bold'): void {
  g.fillStyle = col;
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

/** Maintenance status board: a whiteboard grid of tail numbers and jobs. */
function whiteboard(): THREE.Texture {
  return sign(1024, 512, (g, w, h) => {
    g.fillStyle = '#f2f3f1';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a3440';
    g.lineWidth = 3;
    const cols = [0, 170, 420, 640, 820, w];
    const heads = ['TAIL', 'JOB CARD', 'STATUS', 'CREW', 'DUE'];
    for (let r = 0; r <= 9; r++) {
      g.beginPath();
      g.moveTo(0, 20 + r * 48);
      g.lineTo(w, 20 + r * 48);
      g.stroke();
    }
    for (const x of cols) {
      g.beginPath();
      g.moveTo(x, 20);
      g.lineTo(x, 20 + 9 * 48);
      g.stroke();
    }
    heads.forEach((s, i) => textFit(g, s, (cols[i] + cols[i + 1]) / 2, 44, 26, '#1c3d7a'));
    const r = rng(11);
    const jobs = ['PHASE INSP', 'ENG RUN', 'TIRE CHG', 'LOX SVC', 'FUEL LEAK', 'IFF CHK', 'NDI WING', 'BRAKES'];
    const st = [['#1f8a3a', 'FMC'], ['#d99a14', 'PMC'], ['#c0302a', 'NMC']];
    for (let i = 0; i < 8; i++) {
      const y = 92 + i * 48;
      textFit(g, `${86 + Math.floor(r() * 12)}-0${Math.floor(r() * 900) + 100}`, 85, y, 24, '#222', 'Courier New');
      textFit(g, jobs[i], 295, y, 24, '#222', 'Arial', 'normal');
      const s = st[Math.floor(r() * 3)];
      g.fillStyle = s[0];
      g.beginPath();
      g.arc(470, y, 12, 0, Math.PI * 2);
      g.fill();
      textFit(g, s[1], 560, y, 24, s[0]);
      textFit(g, ['A', 'B', 'C'][Math.floor(r() * 3)] + ' SHIFT', 730, y, 22, '#222', 'Arial', 'normal');
      textFit(g, `${Math.floor(r() * 28) + 1} OCT`, 920, y, 22, '#222', 'Arial', 'normal');
    }
  });
}

function squadronBanner(): THREE.Texture {
  return sign(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#16263d');
    gr.addColorStop(1, '#0e1828');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8a24a';
    g.lineWidth = 10;
    g.strokeRect(14, 14, w - 28, h - 28);
    // crest: a shield with three stars and a stylised arrowhead
    g.save();
    g.translate(w / 2, 220);
    g.fillStyle = '#c8a24a';
    g.beginPath();
    g.moveTo(-110, -150);
    g.lineTo(110, -150);
    g.lineTo(110, 10);
    g.quadraticCurveTo(110, 110, 0, 160);
    g.quadraticCurveTo(-110, 110, -110, 10);
    g.closePath();
    g.fill();
    g.fillStyle = '#1b3358';
    g.beginPath();
    g.moveTo(-94, -134);
    g.lineTo(94, -134);
    g.lineTo(94, 8);
    g.quadraticCurveTo(94, 96, 0, 140);
    g.quadraticCurveTo(-94, 96, -94, 8);
    g.closePath();
    g.fill();
    g.fillStyle = '#e9e6dc';
    g.beginPath();
    g.moveTo(0, -100);
    g.lineTo(52, 70);
    g.lineTo(0, 38);
    g.lineTo(-52, 70);
    g.closePath();
    g.fill();
    const star = (x: number, y: number, s: number) => {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? s * 0.45 : s;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    };
    g.fillStyle = '#c8a24a';
    star(-58, -100, 16);
    star(0, -118, 16);
    star(58, -100, 16);
    g.restore();
    textFit(g, '1ST TACTICAL FIGHTER SQUADRON', w / 2, 420, 40, '#e9e6dc');
    textFit(g, 'TRIAD  ·  AIR SUPERIORITY', w / 2, 468, 26, '#c8a24a');
  });
}

function poster(kind: 'fod' | 'smoke' | 'ear' | 'exit' | 'tools'): THREE.Texture {
  if (kind === 'exit')
    return sign(256, 128, (g, w, h) => {
      g.fillStyle = '#0f8a3c';
      g.fillRect(0, 0, w, h);
      textFit(g, 'EXIT', w / 2 + 20, h / 2 + 2, 64, '#f4fff6');
      g.fillStyle = '#f4fff6';
      g.fillRect(28, 44, 36, 40);
    });
  if (kind === 'tools')
    return sign(512, 256, (g, w, h) => {
      // pegboard with tool shadows painted on it
      g.fillStyle = '#d8d4c8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(90,86,78,0.55)';
      for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) g.fillRect(x, y, 3, 3);
      const r = rng(5);
      for (let i = 0; i < 26; i++) {
        const x = 20 + r() * (w - 40), y = 20 + r() * (h - 60), len = 40 + r() * 70;
        g.fillStyle = ['#30343a', '#b52a24', '#27466e', '#3a3a3a', '#c9a227'][Math.floor(r() * 5)];
        g.save();
        g.translate(x, y);
        g.rotate((r() - 0.5) * 0.3);
        g.fillRect(-4, 0, 8, len);
        g.fillRect(-10, len - 8, 20, 12);
        g.restore();
      }
    });
  return sign(384, 512, (g, w, h) => {
    const [bg, fg, title, body] =
      kind === 'fod'
        ? ['#c32b25', '#ffffff', 'F.O.D.', ['FOREIGN OBJECT', 'DAMAGE', 'CHECK IT', 'BAG IT', 'BIN IT']]
        : kind === 'smoke'
          ? ['#ffffff', '#c32b25', 'DANGER', ['NO SMOKING', 'NO OPEN FLAME', 'WITHIN 50 FT', 'OF AIRCRAFT']]
          : ['#1d5aa6', '#ffffff', 'NOTICE', ['HEARING', 'PROTECTION', 'REQUIRED', 'BEYOND THIS POINT']];
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.fillRect(16, 16, w - 32, 110);
    textFit(g, title, w / 2, 72, 72, bg);
    (body as string[]).forEach((s, i) => textFit(g, s, w / 2, 190 + i * 64, 40, fg));
  });
}

/** A lit monitor: dark UI with a map, charts and lists. */
function screenTexture(seed: number): THREE.Texture {
  return sign(256, 160, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = '#0d1a24';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d3a52';
    g.fillRect(0, 0, w, 16);
    g.fillStyle = '#16303f';
    g.fillRect(8, 24, 120, 126);
    g.strokeStyle = '#3fb4d8';
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(8, 30 + r() * 110);
      for (let x = 8; x < 128; x += 12) g.lineTo(x, 30 + r() * 110);
      g.stroke();
    }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = r() < 0.2 ? '#e0a33a' : '#7fb6cf';
      g.fillRect(140, 28 + i * 13, 40 + r() * 70, 6);
    }
  });
}

/** Warm office interior seen through the office windows. */
function officeTexture(): THREE.Texture {
  return sign(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#f3ead8');
    gr.addColorStop(1, '#8c7f6a');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const r = rng(21);
    // desks, chairs, shelves and people-shaped shadows
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `rgba(60,52,44,${0.35 + r() * 0.3})`;
      const x = r() * w;
      g.fillRect(x, h * 0.62, 40 + r() * 30, 6);
      g.fillRect(x + 4, h * 0.62, 4, h * 0.38);
      if (r() < 0.5) g.fillRect(x + 10, h * 0.25, 30, h * 0.3);
    }
    g.fillStyle = 'rgba(255,250,235,0.9)';
    for (let i = 0; i < 8; i++) g.fillRect((i + 0.5) * (w / 8) - 20, 2, 40, 5);
  });
}

// ---------------------------------------------------------------------------
// the building
// ---------------------------------------------------------------------------

export interface HangarInterior {
  sun: THREE.DirectionalLight;
  /** per-frame: dust drifting in the sunbeams */
  update(dt: number): void;
  /** ground equipment around the current jet */
  placeJetProps(ac: Aircraft, vis: AirframeVisual): void;
}

export function buildHangarInterior(scene: THREE.Scene): HangarInterior {
  const root = new THREE.Group();
  root.name = 'hangar';
  scene.add(root);
  const B = new Batch();

  // --- materials ------------------------------------------------------------
  const fl = floorTextures();
  const floorMat = new THREE.MeshStandardMaterial({ map: fl.map, roughnessMap: fl.rough, roughness: 1, metalness: 0.0, envMapIntensity: 1.0 });
  const cladN = claddingNormal();
  const cladding = new THREE.MeshStandardMaterial({ color: 0xc9ced2, roughness: 0.55, metalness: 0.35, normalMap: cladN, normalScale: new THREE.Vector2(1, 1) });
  const cladDark = new THREE.MeshStandardMaterial({ color: 0x7e878e, roughness: 0.5, metalness: 0.4, normalMap: cladN });
  const block = new THREE.MeshStandardMaterial({ map: blockTexture(), roughness: 0.9, metalness: 0 });
  const kick = new THREE.MeshStandardMaterial({ color: 0x3b4146, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x55616b, roughness: 0.55, metalness: 0.6 });
  const steelLight = new THREE.MeshStandardMaterial({ color: 0x9aa3aa, roughness: 0.45, metalness: 0.7 });
  const ceiling = new THREE.MeshStandardMaterial({ color: 0xd9dcdc, roughness: 0.8, metalness: 0.1, normalMap: cladN });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe0ab12, roughness: 0.5, metalness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.75, metalness: 0.1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.92 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa8171a, roughness: 0.32, metalness: 0.25 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc3c7ca, roughness: 0.32, metalness: 0.9 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1f4f8f, roughness: 0.5, metalness: 0.3 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xd9621c, roughness: 0.55 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8c9296, roughness: 0.55, metalness: 0.3 });
  const locker = new THREE.MeshStandardMaterial({ color: 0x6e7c86, roughness: 0.45, metalness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7b58, roughness: 0.6 });
  const desk = new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.55 });
  const cardboard = new THREE.MeshStandardMaterial({ color: 0xa4835a, roughness: 0.85 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x3d5a3a, roughness: 0.7, metalness: 0.2 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.2 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.4, metalness: 0.7 });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.93).multiplyScalar(6) });
  const office = new THREE.MeshBasicMaterial({ map: officeTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(1.3) });
  const apron = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.9 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x5d7240, roughness: 1 });
  const hills = new THREE.MeshStandardMaterial({ color: 0x55664a, roughness: 1 });
  const tarmac = new THREE.MeshStandardMaterial({ color: 0x4a4b4c, roughness: 0.95 });

  // --- floor ----------------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HANGAR.W, HANGAR.D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // --- walls -------------------------------------------------------------------------
  const clad = (g: THREE.BufferGeometry, m: THREE.Matrix4, mat = cladding) => B.add(mat, worldUV(g.applyMatrix4(m), 3.0));
  const wallT = 0.3;
  for (const sx of [-1, 1]) {
    const x = sx * (W2 + wallT / 2);
    // blockwork up to 3 m with a dark kick band, cladding above; a window band 8-11 m
    B.add(block, worldUV(box(wallT, 3, HANGAR.D).applyMatrix4(at(x, 1.5, 0)), 1 / 0.8));
    B.add(kick, box(wallT + 0.04, 0.3, HANGAR.D).applyMatrix4(at(x, 0.15, 0)));
    clad(box(wallT, WIN_Y0 - 3, HANGAR.D), at(x, (WIN_Y0 + 3) / 2, 0));
    clad(box(wallT, H - WIN_Y1, HANGAR.D), at(x, (H + WIN_Y1) / 2, 0));
    // piers between the windows
    const zs: number[] = [];
    for (let z = -D2; z <= D2 + 0.01; z += 6) zs.push(z);
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      const pw = i === 0 || i === zs.length - 1 ? 3 : 1.2;
      clad(box(wallT, WIN_Y1 - WIN_Y0, pw), at(x, (WIN_Y0 + WIN_Y1) / 2, z));
    }
    // glazing: frames, mullions, transom and sill in each bay
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i] + (i === 0 ? 1.5 : 0.6);
      const z1 = zs[i + 1] - (i === zs.length - 2 ? 1.5 : 0.6);
      const zc = (z0 + z1) / 2, wz = z1 - z0;
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(wz, WIN_Y1 - WIN_Y0), glass);
      gl.position.set(sx * W2 + sx * 0.05, (WIN_Y0 + WIN_Y1) / 2, zc);
      gl.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      gl.castShadow = false;
      root.add(gl);
      B.add(frame, box(0.12, 0.12, wz).applyMatrix4(at(sx * W2, WIN_Y0 + 0.06, zc)));
      B.add(frame, box(0.12, 0.1, wz).applyMatrix4(at(sx * W2, WIN_Y1 - 0.05, zc)));
      B.add(frame, box(0.1, 0.07, wz).applyMatrix4(at(sx * W2, WIN_Y0 + 1.9, zc)));
      B.add(steelLight, box(0.35, 0.05, wz + 0.1).applyMatrix4(at(sx * (W2 - 0.1), WIN_Y0 - 0.02, zc)));
      for (let k = 1; k < 3; k++) B.add(frame, box(0.1, WIN_Y1 - WIN_Y0, 0.07).applyMatrix4(at(sx * W2, (WIN_Y0 + WIN_Y1) / 2, z0 + (wz * k) / 3)));
    }
  }
  // back wall (offices in front of it)
  B.add(block, worldUV(box(HANGAR.W + 0.6, 3, wallT).applyMatrix4(at(0, 1.5, D2 + wallT / 2)), 1 / 0.8));
  clad(box(HANGAR.W + 0.6, H - 3, wallT), at(0, (H + 3) / 2, D2 + wallT / 2));
  // front wall above and beside the door opening
  clad(box(HANGAR.W + 0.6, H - DOOR_H, wallT), at(0, (H + DOOR_H) / 2, -D2 - wallT / 2));
  for (const sx of [-1, 1]) clad(box(W2 - DOOR_W2 + 0.3, DOOR_H, wallT), at(sx * (DOOR_W2 + (W2 - DOOR_W2 + 0.3) / 2), DOOR_H / 2, -D2 - wallT / 2));
  // door header beam
  B.add(steel, box(DOOR_W2 * 2 + 1, 0.9, 0.6).applyMatrix4(at(0, DOOR_H + 0.45, -D2 + 0.1)));
  // sliding door leaves, stacked open behind the side walls' ends (two tracks)
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const x = sx * (DOOR_W2 + 1.9 + k * 3.4);
      const z = -D2 - 0.55 - k * 0.45;
      clad(box(4.2, DOOR_H - 0.05, 0.22), at(x, DOOR_H / 2, z), cladDark);
      for (const y of [0.35, 4.2, 8.3, DOOR_H - 0.3]) B.add(steel, box(4.25, 0.14, 0.26).applyMatrix4(at(x, y, z)));
      B.add(rubber, box(0.15, DOOR_H, 0.3).applyMatrix4(at(x - sx * 2.1, DOOR_H / 2, z)));
    }
  }
  // door track in the floor and guides overhead
  B.add(steelLight, box(HANGAR.W, 0.03, 0.9).applyMatrix4(at(0, 0.015, -D2 - 0.8)));
  B.add(steel, box(HANGAR.W + 12, 0.35, 1.3).applyMatrix4(at(0, DOOR_H + 0.15, -D2 - 0.8)));

  // --- roof: deck, trusses, purlins, columns ------------------------------------------------
  const roof = box(HANGAR.W + 1, 0.3, HANGAR.D + 1.5).applyMatrix4(at(0, H + 0.15, -0.5));
  B.add(ceiling, worldUV(roof, 2.5));
  const bayZ: number[] = [];
  for (let z = -D2 + 3.75; z < D2; z += 7.5) bayZ.push(z);
  const chordLo = H - 2.4, chordHi = H - 0.25;
  for (const z of bayZ) {
    B.add(steel, beam(V(-W2, chordLo, z), V(W2, chordLo, z), 0.22));
    B.add(steel, beam(V(-W2, chordHi, z), V(W2, chordHi, z), 0.22));
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const x = -W2 + (HANGAR.W * i) / n;
      B.add(steel, beam(V(x, chordLo, z), V(x, chordHi, z), 0.1));
      if (i < n) {
        const x1 = -W2 + (HANGAR.W * (i + 1)) / n;
        B.add(steel, i % 2 ? beam(V(x, chordLo, z), V(x1, chordHi, z), 0.09) : beam(V(x, chordHi, z), V(x1, chordLo, z), 0.09));
      }
    }
    // I-section columns at both walls
    for (const sx of [-1, 1]) {
      const x = sx * (W2 - 0.25);
      B.add(steel, box(0.45, H, 0.04).applyMatrix4(at(x, H / 2, z - 0.2)));
      B.add(steel, box(0.45, H, 0.04).applyMatrix4(at(x, H / 2, z + 0.2)));
      B.add(steel, box(0.04, H, 0.4).applyMatrix4(at(x, H / 2, z)));
      B.add(steel, box(0.55, 0.3, 0.55).applyMatrix4(at(x, 0.15, z)));
      // crane runway bracket
      B.add(steel, box(0.9, 0.35, 0.4).applyMatrix4(at(x - sx * 0.6, 11.2, z)));
    }
  }
  for (let x = -W2 + 2; x < W2; x += 3) B.add(steel, box(0.12, 0.2, HANGAR.D).applyMatrix4(at(x, H - 0.12, 0)));
  // wall girts on the insides of the side walls
  for (const sx of [-1, 1]) for (const y of [4.5, 6.5, 12.5]) B.add(steelLight, box(0.08, 0.18, HANGAR.D).applyMatrix4(at(sx * (W2 - 0.08), y, 0)));

  // --- overhead bridge crane: runways along both walls, a yellow bridge girder with a hoist -----
  for (const sx of [-1, 1]) B.add(steel, box(0.35, 0.6, HANGAR.D).applyMatrix4(at(sx * (W2 - 1.1), 11.7, 0)));
  const cz = 9;
  B.add(yellow, box(HANGAR.W - 2.2, 0.9, 0.7).applyMatrix4(at(0, 12.45, cz)));
  B.add(yellow, box(HANGAR.W - 2.2, 0.08, 1.1).applyMatrix4(at(0, 12.95, cz)));
  for (const sx of [-1, 1]) B.add(yellow, box(0.8, 0.7, 2.6).applyMatrix4(at(sx * (W2 - 1.1), 12.25, cz)));
  B.add(yellow, box(1.3, 0.8, 1.5).applyMatrix4(at(-4, 11.65, cz)));
  B.add(black, bar(V(-4.15, 11.3, cz), V(-4.15, 7.2, cz), 0.025, 6));
  B.add(black, bar(V(-3.85, 11.3, cz), V(-3.85, 7.2, cz), 0.025, 6));
  B.add(yellow, box(0.5, 0.6, 0.35).applyMatrix4(at(-4, 6.9, cz)));
  B.add(steelLight, new THREE.TorusGeometry(0.16, 0.05, 8, 16, Math.PI * 1.4).applyMatrix4(at(-4, 6.45, cz, 0, 0, Math.PI * 0.8)));
  // pendant control on its cable
  B.add(black, bar(V(-3.4, 11.3, cz), V(-3.4, 1.6, cz), 0.01, 4));
  B.add(yellow, box(0.12, 0.35, 0.1).applyMatrix4(at(-3.4, 1.45, cz)));

  // --- ducts, cable trays, sprinklers ---------------------------------------------------------
  for (const x of [-9, 9]) {
    B.add(steelLight, worldUV(cyl(0.45, 0.45, HANGAR.D - 8, 20).applyMatrix4(at(x, H - 3.1, -2, 0, Math.PI / 2)), 1));
    for (let z = -D2 + 8; z < D2 - 8; z += 7.5) {
      B.add(steelLight, cyl(0.5, 0.5, 0.08, 20).applyMatrix4(at(x, H - 3.1, z, 0, Math.PI / 2)));
      B.add(frame, box(0.6, 0.25, 0.6).applyMatrix4(at(x, H - 3.65, z + 3.5)));
      B.add(black, bar(V(x, H - 2.65, z), V(x, H - 0.4, z), 0.02, 4));
    }
  }
  for (const sx of [-1, 1]) {
    B.add(steelLight, box(0.5, 0.08, HANGAR.D - 2).applyMatrix4(at(sx * (W2 - 0.4), 6.2, 0)));
    B.add(black, box(0.35, 0.1, HANGAR.D - 2).applyMatrix4(at(sx * (W2 - 0.4), 6.27, 0)));
  }
  for (let x = -W2 + 4; x < W2; x += 5)
    for (let z = -D2 + 5; z < D2; z += 5) B.add(red, bar(V(x, H - 0.3, z), V(x, H - 0.9, z), 0.025, 6));

  // --- LED high-bay lights on drop rods -------------------------------------------------------------
  const lampPos: THREE.Vector3[] = [];
  for (const x of [-15, -5, 5, 15])
    for (const z of [-20, -10, 0, 10, 20]) {
      const y = 11.4;
      lampPos.push(V(x, y, z));
      B.add(black, bar(V(x, y + 0.2, z), V(x, chordLo, z), 0.02, 4));
      B.add(frame, cyl(0.42, 0.5, 0.14, 24).applyMatrix4(at(x, y + 0.08, z)));
      B.add(frame, cyl(0.15, 0.15, 0.25, 12).applyMatrix4(at(x, y + 0.25, z)));
      const disc = new THREE.CircleGeometry(0.44, 24).applyMatrix4(at(x, y, z, 0, Math.PI / 2));
      B.add(lamp, disc);
    }

  // --- offices along the back wall: two storeys, glazed, with a stair and a railed walkway ---------
  const oz0 = D2 - 6.5, oz1 = D2;
  const ox = 13;
  // front faces: sill and header bands around a window strip on each storey
  B.add(block, worldUV(box(ox * 2, 1.0, 0.25).applyMatrix4(at(0, 0.5, oz0)), 1 / 0.8));
  B.add(block, worldUV(box(ox * 2, 0.7, 0.25).applyMatrix4(at(0, 2.95, oz0)), 1 / 0.8));
  for (const sx of [-1, 1]) B.add(block, worldUV(box(1.5, 1.6, 0.25).applyMatrix4(at(sx * (ox - 0.75), 1.8, oz0)), 1 / 0.8));
  B.add(desk, box(ox * 2 + 0.4, 0.3, oz1 - oz0 + 0.3).applyMatrix4(at(0, 3.45, (oz0 + oz1) / 2)));
  clad(box(ox * 2, 0.7, 0.2), at(0, 3.95, oz0));
  clad(box(ox * 2, 0.7, 0.2), at(0, 6.45, oz0));
  for (const sx of [-1, 1]) clad(box(1.5, 1.8, 0.2), at(sx * (ox - 0.75), 5.2, oz0));
  B.add(ceiling, box(ox * 2 + 0.4, 0.2, oz1 - oz0 + 0.3).applyMatrix4(at(0, 6.9, (oz0 + oz1) / 2)));
  for (const sx of [-1, 1]) {
    B.add(block, worldUV(box(0.25, 3.3, oz1 - oz0).applyMatrix4(at(sx * ox, 1.65, (oz0 + oz1) / 2)), 1 / 0.8));
    clad(box(0.2, 3.2, oz1 - oz0), at(sx * ox, 5.2, (oz0 + oz1) / 2));
  }
  // window strips: lit rooms behind glass, mullions every 1.5 m
  for (const [y0, y1] of [[1.0, 2.6], [4.3, 6.1]]) {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(ox * 2 - 3, y1 - y0), office);
    back.position.set(0, (y0 + y1) / 2, oz0 + 0.25);
    root.add(back);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(ox * 2 - 3, y1 - y0), glass);
    gl.position.set(0, (y0 + y1) / 2, oz0 - 0.14);
    gl.rotation.y = Math.PI;
    root.add(gl);
    for (let x = -ox + 1.5; x <= ox - 1.5 + 0.01; x += 1.5) B.add(frame, box(0.08, y1 - y0, 0.3).applyMatrix4(at(x, (y0 + y1) / 2, oz0 - 0.05)));
    B.add(frame, box(ox * 2 - 3, 0.08, 0.3).applyMatrix4(at(0, y0, oz0 - 0.05)));
    B.add(frame, box(ox * 2 - 3, 0.08, 0.3).applyMatrix4(at(0, y1, oz0 - 0.05)));
  }
  // doors into the ground floor offices
  for (const x of [-10.5, 10.5]) {
    B.add(frame, box(1.2, 2.2, 0.12).applyMatrix4(at(x, 1.1, oz0 - 0.1)));
    B.add(steelLight, box(0.05, 0.3, 0.06).applyMatrix4(at(x + 0.45, 1.05, oz0 - 0.2)));
  }
  // walkway railing along the office roof (it is the mezzanine floor)
  for (let x = -ox; x <= ox + 0.01; x += 1.6) B.add(yellow, bar(V(x, 3.6, oz0 - 0.1), V(x, 4.7, oz0 - 0.1), 0.025, 6));
  B.add(yellow, beam(V(-ox, 4.7, oz0 - 0.1), V(ox, 4.7, oz0 - 0.1), 0.05));
  B.add(yellow, beam(V(-ox, 4.15, oz0 - 0.1), V(ox, 4.15, oz0 - 0.1), 0.035));
  // steel stair up to the walkway (along +z, beside the offices)
  {
    const sx = 16.2, z0 = 16.2, z1 = oz0 - 0.2, n = 18;
    for (const side of [-0.55, 0.55]) B.add(steel, beam(V(sx + side, 0.1, z0), V(sx + side, 3.55, z1), 0.08));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      B.add(steelLight, box(1.0, 0.04, 0.28).applyMatrix4(at(sx, 0.1 + t * 3.45, z0 + t * (z1 - z0))));
    }
    for (const side of [-0.6, 0.6]) {
      B.add(yellow, beam(V(sx + side, 1.0, z0), V(sx + side, 4.45, z1), 0.04));
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const p = V(sx + side, 0.1 + t * 3.45, z0 + t * (z1 - z0));
        B.add(yellow, bar(p, p.clone().setY(p.y + 0.9), 0.02, 6));
      }
    }
    B.add(steelLight, box(2.6, 0.1, 2.2).applyMatrix4(at(sx - 0.9, 3.55, z1 + 0.9)));
  }
  // banner above the offices
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ map: squadronBanner(), roughness: 0.85 }));
  banner.position.set(0, 10.2, D2 - 0.02);
  banner.rotation.y = Math.PI;
  banner.receiveShadow = true;
  root.add(banner);

  // --- signs and posters -------------------------------------------------------------------------------
  const plane = (t: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry: number, emissive = false) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      emissive ? new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1, 1, 1).multiplyScalar(2.2) }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = !emissive;
    root.add(m);
    return m;
  };
  const faceL = Math.PI / 2, faceR = -Math.PI / 2;
  plane(poster('fod'), 0.9, 1.2, -W2 + 0.02, 2.2, -16, faceL);
  plane(poster('smoke'), 0.9, 1.2, W2 - 0.02, 2.2, -16, faceR);
  plane(poster('ear'), 0.9, 1.2, W2 - 0.02, 2.2, 3, faceR);
  plane(poster('fod'), 0.9, 1.2, W2 - 0.02, 2.2, 24, faceR);
  plane(poster('exit'), 0.6, 0.3, -W2 + 0.03, 3.6, 26, faceL, true);
  plane(poster('exit'), 0.6, 0.3, W2 - 0.03, 3.6, 26, faceR, true);
  plane(poster('exit'), 0.6, 0.3, -10.5, 2.55, oz0 - 0.2, Math.PI, true);
  plane(whiteboard(), 3.6, 1.8, -W2 + 0.03, 2.1, -10, faceL);
  B.add(frame, box(0.06, 1.9, 3.7).applyMatrix4(at(-W2 + 0.02, 2.1, -10)));
  B.add(alu, box(0.12, 0.05, 3.4).applyMatrix4(at(-W2 + 0.08, 1.18, -10)));

  // --- right wall: workbenches with pegboards, tool chests, racking ----------------------------------
  const pegT = poster('tools');
  const bench = (z: number) => {
    const x = W2 - 0.55;
    B.add(wood, box(0.9, 0.06, 2.4).applyMatrix4(at(x, 0.92, z)));
    B.add(grey, box(0.85, 0.04, 2.3).applyMatrix4(at(x, 0.2, z)));
    for (const dz of [-1.1, 1.1]) for (const dx of [-0.38, 0.38]) B.add(grey, box(0.06, 0.9, 0.06).applyMatrix4(at(x + dx, 0.45, z + dz)));
    B.add(red, box(0.7, 0.55, 0.6).applyMatrix4(at(x, 0.62, z + 0.75)));
    // vise and a few things on the bench
    B.add(blue, box(0.2, 0.18, 0.3).applyMatrix4(at(x - 0.3, 1.04, z - 0.9)));
    B.add(steelLight, box(0.05, 0.05, 0.4).applyMatrix4(at(x - 0.42, 1.08, z - 0.9)));
    B.add(black, box(0.35, 0.12, 0.25).applyMatrix4(at(x, 1.01, z - 0.2)));
    B.add(orange, cyl(0.08, 0.08, 0.2, 10).applyMatrix4(at(x - 0.1, 1.05, z + 0.3)));
    plane(pegT, 2.4, 1.2, W2 - 0.03, 1.9, z, faceR);
    // strip light over the bench
    B.add(frame, box(0.18, 0.08, 1.8).applyMatrix4(at(W2 - 0.3, 2.75, z)));
    B.add(lamp, box(0.12, 0.02, 1.7).applyMatrix4(at(W2 - 0.3, 2.705, z)));
  };
  for (const z of [-21, -17.8, 11, 14.2]) bench(z);
  const toolChest = (x: number, z: number, ry = 0) => {
    const m = at(x, 0, z, ry);
    B.add(red, box(0.7, 1.0, 1.4).applyMatrix4(at(0, 0.62, 0)).applyMatrix4(m));
    B.add(red, box(0.66, 0.5, 1.3).applyMatrix4(at(0, 1.37, 0)).applyMatrix4(m));
    for (let k = 0; k < 7; k++) B.add(steelLight, box(0.02, 0.025, 1.1).applyMatrix4(at(-0.36, 0.25 + k * 0.16, 0)).applyMatrix4(m));
    B.add(steelLight, box(0.02, 0.025, 1.0).applyMatrix4(at(-0.34, 1.3, 0)).applyMatrix4(m));
    B.add(black, box(0.7, 0.03, 1.4).applyMatrix4(at(0, 1.635, 0)).applyMatrix4(m));
    for (const dz of [-0.6, 0.6]) for (const dx of [-0.28, 0.28]) B.add(rubber, cyl(0.06, 0.06, 0.05, 10).applyMatrix4(at(dx, 0.07, dz, 0, 0, Math.PI / 2)).applyMatrix4(m));
  };
  toolChest(W2 - 0.9, -15.1);
  toolChest(W2 - 0.9, 16.6);
  toolChest(W2 - 3.2, 8.2, 0.35);
  // pallet racking with bins and boxes
  {
    const x = W2 - 0.75, z0 = -8.5, z1 = 6.5;
    for (let z = z0; z <= z1 + 0.01; z += 2.5) for (const dx of [-0.45, 0.45]) B.add(blue, box(0.08, 4.6, 0.08).applyMatrix4(at(x + dx, 2.3, z)));
    for (const y of [0.15, 1.6, 3.05, 4.5]) for (const dx of [-0.45, 0.45]) B.add(orange, box(0.06, 0.12, z1 - z0).applyMatrix4(at(x + dx, y, (z0 + z1) / 2)));
    const r = rng(9);
    for (const y of [0.21, 1.66, 3.11])
      for (let z = z0 + 0.4; z < z1 - 0.3; z += 0.55 + r() * 0.3) {
        if (r() < 0.15) continue;
        const h = 0.3 + r() * 0.8, w = 0.4 + r() * 0.25;
        B.add(r() < 0.6 ? cardboard : r() < 0.5 ? blue : grey, box(0.8, h, w).applyMatrix4(at(x, y + h / 2, z)));
      }
  }
  // air compressor and a hose reel on the wall
  B.add(blue, cyl(0.35, 0.35, 1.2, 16).applyMatrix4(at(W2 - 0.8, 0.5, 9.2, 0, 0, Math.PI / 2)));
  B.add(black, box(0.5, 0.4, 0.5).applyMatrix4(at(W2 - 0.8, 1.1, 9.2)));
  B.add(red, cyl(0.35, 0.35, 0.18, 20).applyMatrix4(at(W2 - 0.15, 2.4, 1, 0, 0, Math.PI / 2)));

  // --- left wall: desks with computers, lockers, cabinets --------------------------------------------------
  const deskStation = (x: number, z: number, seed: number) => {
    B.add(desk, box(0.8, 0.04, 1.6).applyMatrix4(at(x, 0.74, z)));
    for (const dz of [-0.75, 0.75]) B.add(frame, box(0.7, 0.72, 0.04).applyMatrix4(at(x, 0.36, z + dz)));
    B.add(frame, box(0.04, 0.4, 1.5).applyMatrix4(at(x - 0.35, 0.5, z)));
    // two monitors on stands, keyboard, mouse, a mug
    for (const dz of [-0.33, 0.33]) {
      B.add(black, box(0.04, 0.33, 0.56).applyMatrix4(at(x - 0.22, 1.08, z + dz, dz > 0 ? 0.18 : -0.18)));
      B.add(black, box(0.05, 0.2, 0.05).applyMatrix4(at(x - 0.26, 0.86, z + dz)));
      B.add(black, box(0.18, 0.02, 0.2).applyMatrix4(at(x - 0.26, 0.77, z + dz)));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.29), new THREE.MeshBasicMaterial({ map: screenTexture(seed + (dz > 0 ? 1 : 0)), color: new THREE.Color(1, 1, 1).multiplyScalar(1.4) }));
      scr.position.set(x - 0.195, 1.08, z + dz);
      scr.rotation.y = Math.PI / 2 + (dz > 0 ? 0.18 : -0.18);
      root.add(scr);
    }
    B.add(black, box(0.16, 0.02, 0.45).applyMatrix4(at(x + 0.05, 0.77, z)));
    B.add(grey, box(0.08, 0.02, 0.05).applyMatrix4(at(x + 0.05, 0.77, z + 0.35)));
    B.add(desk, cyl(0.04, 0.035, 0.1, 10).applyMatrix4(at(x + 0.2, 0.81, z - 0.55)));
    // office chair
    const cx = x + 0.75, czz = z + 0.1;
    B.add(fabric, box(0.48, 0.08, 0.48).applyMatrix4(at(cx, 0.48, czz)));
    B.add(fabric, box(0.08, 0.55, 0.45).applyMatrix4(at(cx + 0.24, 0.82, czz, 0, 0, -0.12)));
    B.add(frame, cyl(0.03, 0.03, 0.36, 8).applyMatrix4(at(cx, 0.28, czz)));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      B.add(frame, beam(V(cx, 0.1, czz), V(cx + Math.cos(a) * 0.3, 0.06, czz + Math.sin(a) * 0.3), 0.03));
      B.add(rubber, cyl(0.03, 0.03, 0.03, 8).applyMatrix4(at(cx + Math.cos(a) * 0.3, 0.03, czz + Math.sin(a) * 0.3, 0, 0, Math.PI / 2)));
    }
    // filing cabinet
    B.add(locker, box(0.6, 1.3, 0.5).applyMatrix4(at(x - 0.05, 0.65, z + 1.2)));
    for (let k = 0; k < 4; k++) B.add(steelLight, box(0.02, 0.03, 0.18).applyMatrix4(at(x + 0.26, 0.25 + k * 0.3, z + 1.2)));
  };
  deskStation(-W2 + 0.75, -20.5, 31);
  deskStation(-W2 + 0.75, -16.6, 33);
  deskStation(-W2 + 0.75, -4.2, 35);
  // row of lockers
  for (let i = 0; i < 10; i++) {
    const z = 3.2 + i * 0.52;
    B.add(locker, box(0.55, 1.95, 0.5).applyMatrix4(at(-W2 + 0.35, 0.98, z)));
    B.add(frame, box(0.02, 1.8, 0.02).applyMatrix4(at(-W2 + 0.63, 0.98, z + 0.25)));
    for (let k = 0; k < 4; k++) B.add(frame, box(0.02, 0.02, 0.2).applyMatrix4(at(-W2 + 0.63, 1.6 + k * 0.06, z)));
    B.add(steelLight, box(0.03, 0.12, 0.03).applyMatrix4(at(-W2 + 0.64, 1.05, z - 0.15)));
  }
  B.add(wood, box(0.35, 0.05, 5.2).applyMatrix4(at(-W2 + 1.1, 0.45, 5.6)));
  for (const z of [3.4, 7.8]) B.add(frame, box(0.3, 0.45, 0.05).applyMatrix4(at(-W2 + 1.1, 0.22, z)));
  // water cooler, bin, electrical panels
  B.add(desk, box(0.35, 1.0, 0.35).applyMatrix4(at(-W2 + 0.4, 0.5, 9.4)));
  B.add(blue, cyl(0.15, 0.15, 0.45, 16).applyMatrix4(at(-W2 + 0.4, 1.23, 9.4)));
  B.add(greenMat, cyl(0.25, 0.22, 0.8, 16).applyMatrix4(at(-W2 + 0.5, 0.4, 10.3)));
  for (let k = 0; k < 3; k++) B.add(grey, box(0.3, 1.4, 0.9).applyMatrix4(at(-W2 + 0.18, 1.6, -1.8 + k * 1.1)));
  B.add(grey, box(0.2, 2.5, 0.2).applyMatrix4(at(-W2 + 0.15, 4.2, -0.7)));

  // --- fire safety: extinguisher cabinets on the columns, hose reels -------------------------------
  for (const z of bayZ.filter((_, i) => i % 2 === 0))
    for (const sx of [-1, 1]) {
      B.add(red, box(0.25, 0.7, 0.35).applyMatrix4(at(sx * (W2 - 0.62), 1.4, z + 0.45)));
      B.add(red, cyl(0.08, 0.08, 0.5, 12).applyMatrix4(at(sx * (W2 - 0.75), 0.4, z + 0.45)));
      B.add(black, cyl(0.035, 0.035, 0.1, 8).applyMatrix4(at(sx * (W2 - 0.75), 0.7, z + 0.45)));
    }

  // --- ground equipment on the hangar floor ----------------------------------------------------------------
  // tow tractor near the doors, facing in
  {
    const m = at(9.5, 0, -21, 0.4);
    B.add(yellow, box(1.6, 0.7, 2.8).applyMatrix4(at(0, 0.7, 0)).applyMatrix4(m));
    B.add(yellow, box(1.5, 0.35, 1.0).applyMatrix4(at(0, 1.2, 0.7)).applyMatrix4(m));
    B.add(black, box(0.6, 0.6, 0.12).applyMatrix4(at(0, 1.35, 0.2)).applyMatrix4(m));
    B.add(black, cyl(0.2, 0.2, 0.05, 12).applyMatrix4(at(0, 1.55, -0.1, 0, 0.9)).applyMatrix4(m));
    for (const dz of [-0.95, 0.95]) for (const dx of [-0.85, 0.85]) B.add(rubber, cyl(0.38, 0.38, 0.3, 18).applyMatrix4(at(dx, 0.38, dz, 0, 0, Math.PI / 2)).applyMatrix4(m));
    B.add(steel, box(0.3, 0.2, 0.6).applyMatrix4(at(0, 0.45, -1.6)).applyMatrix4(m));
    B.add(black, box(1.7, 0.18, 0.2).applyMatrix4(at(0, 0.5, 1.45)).applyMatrix4(m));
  }
  // munitions trolley with two missiles
  {
    const m = at(-13, 0, 9, -0.25);
    B.add(yellow, box(1.1, 0.12, 3.2).applyMatrix4(at(0, 0.55, 0)).applyMatrix4(m));
    for (const dz of [-1.2, 1.2]) for (const dx of [-0.5, 0.5]) B.add(rubber, cyl(0.2, 0.2, 0.12, 14).applyMatrix4(at(dx, 0.2, dz, 0, 0, Math.PI / 2)).applyMatrix4(m));
    for (const dz of [-1.2, 1.2]) B.add(yellow, box(0.9, 0.35, 0.1).applyMatrix4(at(0, 0.3, dz)).applyMatrix4(m));
    B.add(yellow, beam(V(0, 0.6, -1.6), V(0, 0.9, -2.6), 0.06).applyMatrix4(m));
    for (const dx of [-0.25, 0.25]) {
      B.add(grey, cyl(0.09, 0.09, 3.2, 14).applyMatrix4(at(dx, 0.78, 0, 0, Math.PI / 2)).applyMatrix4(m));
      B.add(grey, cyl(0.001, 0.09, 0.35, 14).applyMatrix4(at(dx, 0.78, -1.77, 0, -Math.PI / 2)).applyMatrix4(m));
      for (let k = 0; k < 4; k++) B.add(grey, box(0.01, 0.2, 0.3).applyMatrix4(at(dx, 0.78, 1.4, 0, 0, (k * Math.PI) / 4)).applyMatrix4(m));
      B.add(yellow, cyl(0.092, 0.092, 0.06, 14).applyMatrix4(at(dx, 0.78, -1.1, 0, Math.PI / 2)).applyMatrix4(m));
    }
  }
  // maintenance work stand (platform with stairs and handrails)
  const workStand = (x: number, z: number, ry: number, hgt: number) => {
    const m = at(x, 0, z, ry);
    B.add(yellow, box(1.6, 0.08, 1.4).applyMatrix4(at(0, hgt, 0)).applyMatrix4(m));
    for (const dx of [-0.75, 0.75]) for (const dz of [-0.65, 0.65]) B.add(yellow, box(0.07, hgt, 0.07).applyMatrix4(at(dx, hgt / 2, dz)).applyMatrix4(m));
    for (const dx of [-0.75, 0.75]) B.add(yellow, beam(V(dx, 0.3, -0.65), V(dx, hgt - 0.1, 0.65), 0.05).applyMatrix4(m));
    for (const dx of [-0.75, 0.75]) {
      B.add(yellow, beam(V(dx, hgt, -0.65), V(dx, hgt + 1.05, -0.65), 0.04).applyMatrix4(m));
      B.add(yellow, beam(V(dx, hgt, 0.65), V(dx, hgt + 1.05, 0.65), 0.04).applyMatrix4(m));
      B.add(yellow, beam(V(dx, hgt + 1.05, -0.65), V(dx, hgt + 1.05, 0.65), 0.04).applyMatrix4(m));
    }
    B.add(yellow, beam(V(-0.75, hgt + 1.05, 0.65), V(0.75, hgt + 1.05, 0.65), 0.04).applyMatrix4(m));
    // stairs down the back
    const n = Math.round(hgt / 0.25);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      B.add(steelLight, box(0.8, 0.04, 0.25).applyMatrix4(at(0, t * hgt, -0.7 - (1 - t) * hgt * 0.9)).applyMatrix4(m));
    }
    for (const dx of [-0.42, 0.42]) {
      B.add(yellow, beam(V(dx, 0.05, -0.7 - hgt * 0.9), V(dx, hgt, -0.7), 0.05).applyMatrix4(m));
      B.add(yellow, beam(V(dx, 0.95, -0.7 - hgt * 0.9), V(dx, hgt + 0.95, -0.7), 0.035).applyMatrix4(m));
    }
    for (const dx of [-0.7, 0.7]) for (const dz of [-0.6, 0.6]) B.add(rubber, cyl(0.08, 0.08, 0.06, 10).applyMatrix4(at(dx, 0.08, dz, 0, 0, Math.PI / 2)).applyMatrix4(m));
  };
  workStand(12.5, 11, -0.6, 2.2);
  workStand(-12.8, -6, 0.3, 1.5);
  // A-frame step ladders
  const stepLadder = (x: number, z: number, ry: number, hgt: number) => {
    const m = at(x, 0, z, ry);
    for (const dx of [-0.25, 0.25]) {
      B.add(alu, beam(V(dx, 0, -0.45), V(dx * 0.8, hgt, 0), 0.05).applyMatrix4(m));
      B.add(alu, beam(V(dx, 0, 0.45), V(dx * 0.8, hgt, 0), 0.05).applyMatrix4(m));
    }
    const n = Math.floor(hgt / 0.3);
    for (let i = 1; i <= n; i++) {
      const t = (i * 0.3) / hgt;
      B.add(alu, box(0.5 - 0.1 * t, 0.03, 0.1).applyMatrix4(at(0, t * hgt, -0.45 * (1 - t))).applyMatrix4(m));
    }
    B.add(orange, box(0.45, 0.06, 0.25).applyMatrix4(at(0, hgt + 0.03, 0)).applyMatrix4(m));
  };
  stepLadder(W2 - 2.2, -12, 0.3, 2.4);
  stepLadder(-6.5, 12.5, 1.1, 1.8);
  // floor jack, drip trays, a chained stanchion line near the stair foot
  B.add(yellow, box(0.5, 0.25, 1.2).applyMatrix4(at(-9.5, 0.2, 13.5, 0.5)));
  B.add(yellow, beam(V(-9.4, 0.3, 14.2), V(-9.1, 1.1, 15.0), 0.04));
  for (const [x, z] of [[-17.5, 18], [17.2, 21.5]]) B.add(black, box(1.2, 0.08, 0.8).applyMatrix4(at(x, 0.04, z)));
  for (let k = 0; k < 4; k++) {
    const x = -4 + k * 2.5;
    B.add(yellow, cyl(0.04, 0.04, 1.0, 10).applyMatrix4(at(x, 0.5, 21.5)));
    B.add(black, cyl(0.2, 0.22, 0.06, 16).applyMatrix4(at(x, 0.03, 21.5)));
  }
  // bollards at the door jambs
  for (const sx of [-1, 1]) for (const dz of [0.6, 1.6]) B.add(yellow, cyl(0.15, 0.15, 1.1, 14).applyMatrix4(at(sx * (DOOR_W2 - 0.4), 0.55, -D2 + dz)));
  // a pallet of boxes and spare wheels by the racking
  B.add(wood, box(1.2, 0.14, 1.0).applyMatrix4(at(W2 - 2.5, 0.07, -3.2)));
  B.add(cardboard, box(1.1, 0.8, 0.9).applyMatrix4(at(W2 - 2.5, 0.54, -3.2)));
  for (let k = 0; k < 3; k++) B.add(rubber, new THREE.TorusGeometry(0.34, 0.14, 10, 24).applyMatrix4(at(W2 - 2.6, 0.14 + k * 0.28, 1.5, 0, Math.PI / 2)));

  // --- outside: apron, taxiway, grass, a hangar across the way, light masts, a fuel truck, hills ---------
  const apronG = new THREE.PlaneGeometry(220, 110).applyMatrix4(at(0, -0.02, -D2 - 55, 0, -Math.PI / 2));
  const apronM = new THREE.Mesh(apronG, apron);
  apronM.receiveShadow = true;
  root.add(apronM);
  for (let z = -D2 - 5; z > -D2 - 110; z -= 7.5) B.add(kick, box(220, 0.01, 0.06).applyMatrix4(at(0, -0.005, z)));
  for (let x = -110; x < 110; x += 7.5) B.add(kick, box(0.06, 0.01, 110).applyMatrix4(at(x, -0.005, -D2 - 55)));
  B.add(yellow, box(0.18, 0.012, 100).applyMatrix4(at(0, 0, -D2 - 50)));
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(400, 30).applyMatrix4(at(0, -0.03, -D2 - 125, 0, -Math.PI / 2)), tarmac);
  taxi.receiveShadow = true;
  root.add(taxi);
  const grassM = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).applyMatrix4(at(0, -0.05, 0, 0, -Math.PI / 2)), grass);
  grassM.receiveShadow = true;
  root.add(grassM);
  // the hangar across the apron
  clad(box(60, 16, 40), at(-10, 8, -D2 - 175), cladDark);
  B.add(steel, box(40, 13, 0.4).applyMatrix4(at(-10, 6.5, -D2 - 154.9)));
  B.add(steel, box(62, 1.2, 42).applyMatrix4(at(-10, 16.6, -D2 - 175)));
  // light masts
  for (const x of [-40, 40]) {
    B.add(steelLight, cyl(0.25, 0.4, 24, 12).applyMatrix4(at(x, 12, -D2 - 70)));
    B.add(frame, box(3, 1.2, 0.5).applyMatrix4(at(x, 24.5, -D2 - 70)));
  }
  // fuel truck parked on the apron
  {
    const m = at(-24, 0, -D2 - 22, 1.25);
    B.add(desk, box(2.4, 2.2, 2.2).applyMatrix4(at(0, 1.6, -3.6)).applyMatrix4(m));
    B.add(black, box(2.2, 0.8, 0.1).applyMatrix4(at(0, 2.1, -4.72)).applyMatrix4(m));
    B.add(alu, cyl(1.2, 1.2, 6, 20).applyMatrix4(at(0, 1.9, 0.6, 0, Math.PI / 2)).applyMatrix4(m));
    B.add(frame, box(2.3, 0.4, 8.6).applyMatrix4(at(0, 0.7, -0.6)).applyMatrix4(m));
    for (const dz of [-3.6, 1.6, 3.0]) for (const dx of [-1.05, 1.05]) B.add(rubber, cyl(0.5, 0.5, 0.35, 18).applyMatrix4(at(dx, 0.5, dz, 0, 0, Math.PI / 2)).applyMatrix4(m));
  }
  // distant low hills with a tree line
  {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    const r = rng(17);
    const N = 90;
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * 0.55 + (i / N) * Math.PI * 0.9;
      const a1 = Math.PI * 0.55 + ((i + 1) / N) * Math.PI * 0.9;
      const R = 700;
      const h0 = 25 + 30 * Math.sin(i * 0.37) + r() * 10, h1 = 25 + 30 * Math.sin((i + 1) * 0.37) + r() * 10;
      const p = (a: number, y: number) => [Math.sin(a) * R, y, Math.cos(a) * R];
      pts.push(...p(a0, -1), ...p(a1, -1), ...p(a1, h1), ...p(a0, -1), ...p(a1, h1), ...p(a0, h0));
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, hills);
    m.material.side = THREE.DoubleSide;
    root.add(m);
    for (let i = 0; i < 160; i++) {
      const a = Math.PI * 0.62 + r() * Math.PI * 0.76;
      const R = 260 + r() * 120;
      const hgt = 8 + r() * 10;
      B.add(greenMat, cyl(0.001, 2.5 + r() * 2, hgt, 7).applyMatrix4(at(Math.sin(a) * R, hgt / 2, Math.cos(a) * R)));
    }
  }

  // --- sky -------------------------------------------------------------------------------------------------------
  const sunTo = SUN_DIR.clone().negate();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { sunDir: { value: sunTo } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir;
        varying vec3 vD;
        void main() {
          vec3 d = normalize( vD );
          float h = max( d.y, 0.0 );
          vec3 zen = vec3( 0.28, 0.5, 0.95 );
          vec3 hor = vec3( 0.82, 0.88, 0.95 );
          vec3 col = mix( hor, zen, pow( h, 0.45 ) ) * 2.4;
          float s = max( dot( d, sunDir ), 0.0 );
          col += vec3( 1.0, 0.9, 0.75 ) * ( pow( s, 8.0 ) * 1.2 + pow( s, 900.0 ) * 60.0 );
          if ( d.y < 0.0 ) col = mix( hor * 2.0, vec3( 0.45, 0.47, 0.42 ), smoothstep( 0.0, -0.05, d.y ) );
          gl_FragColor = vec4( col, 1.0 );
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  root.add(sky);
  // aerial perspective: the hills and the far side of the airfield fade into the haze
  scene.fog = new THREE.Fog(new THREE.Color(0.82, 0.88, 0.95).multiplyScalar(2.0), 160, 1300);

  B.build(root);

  // --- lights ---------------------------------------------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff0dc, 5.2);
  sun.position.copy(sunTo).multiplyScalar(90);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -52;
  sc.right = 52;
  sc.top = 52;
  sc.bottom = -52;
  sc.near = 10;
  sc.far = 220;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  // sky light from above (the roof keeps most of it out) and the warm bounce off the floor
  const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x8a847a, 0.45);
  scene.add(hemi);
  // high-bays: a key over the jet (casting its shadow) and two softer ones fore and aft
  const key = new THREE.SpotLight(0xfff6ea, 520, 40, 0.75, 0.9, 1.6);
  key.position.set(1.5, 12.8, 1);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  key.shadow.radius = 4;
  scene.add(key);
  scene.add(key.target);
  for (const z of [-11, 12]) {
    const s = new THREE.SpotLight(0xfff6ea, 260, 36, 0.85, 1, 1.6);
    s.position.set(0, 12.8, z);
    s.target.position.set(0, 0, z * 0.6);
    scene.add(s);
    scene.add(s.target);
  }

  // --- sunbeams through the door and the left windows, with dust --------------------------------------------------
  const beams = new THREE.Group();
  root.add(beams);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(1.0, 0.93, 0.8).multiplyScalar(0.022) } },
    vertexShader: /* glsl */ `
      attribute vec2 bt;
      varying vec2 vB;
      varying float vDist;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vB = bt;
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 col;
      varying vec2 vB;
      varying float vDist;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        // soft across the beam, fading toward the floor, and near the camera
        float across = smoothstep( 0.0, 0.45, vB.x ) * smoothstep( 1.0, 0.55, vB.x );
        float along = ( 1.0 - vB.y * 0.6 ) * smoothstep( 0.0, 0.08, vB.y );
        float near = smoothstep( 2.0, 9.0, vDist );
        gl_FragColor = vec4( col * across * along * near, 1.0 );
      }`,
  });
  /** a light shaft from a wall opening (4 corners, in order) down along the sun to the floor */
  const shaft = (c: THREE.Vector3[]) => {
    const ends = c.map((p) => p.clone().addScaledVector(SUN_DIR, p.y / -SUN_DIR.y));
    const pos: number[] = [];
    const bt: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4], a2 = ends[i], b2 = ends[(i + 1) % 4];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z, a.x, a.y, a.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
      bt.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('bt', new THREE.Float32BufferAttribute(bt, 2));
    const m = new THREE.Mesh(g, beamMat);
    m.renderOrder = 5;
    beams.add(m);
  };
  // left-wall windows (the sun is on the left)
  for (let z = -D2; z < D2 - 0.1; z += 6) {
    const z0 = z + (z === -D2 ? 1.5 : 0.6), z1 = z + 6 - (z + 6 >= D2 - 0.1 ? 1.5 : 0.6);
    const x = -W2;
    shaft([V(x, WIN_Y0, z0), V(x, WIN_Y0, z1), V(x, WIN_Y1, z1), V(x, WIN_Y1, z0)]);
  }
  // the door opening: its top edge makes the shaft's roof
  shaft([V(-DOOR_W2, DOOR_H, -D2), V(DOOR_W2, DOOR_H, -D2), V(DOOR_W2, DOOR_H - 0.01, -D2 + 0.01), V(-DOOR_W2, DOOR_H - 0.01, -D2 + 0.01)]);

  // dust motes drifting in the light
  const N = 520;
  const dustPos = new Float32Array(N * 3);
  const r = rng(99);
  const seedDust = (i: number) => {
    // a random point inside one of the window shafts
    const z = -D2 + 2 + r() * (HANGAR.D - 4);
    const y0 = WIN_Y0 + r() * (WIN_Y1 - WIN_Y0);
    const t = r() * (y0 / -SUN_DIR.y) * 0.9;
    const p = V(-W2, y0, z).addScaledVector(SUN_DIR, t);
    dustPos[i * 3] = p.x;
    dustPos[i * 3 + 1] = p.y;
    dustPos[i * 3 + 2] = p.z;
  };
  for (let i = 0; i < N; i++) seedDust(i);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(0.7), size: 0.011, sizeAttenuation: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  dust.frustumCulled = false;
  root.add(dust);
  let tDust = 0;

  // --- ground equipment tied to the jet: rebuilt when the jet changes ------------------------------------------------
  const jetProps = new THREE.Group();
  root.add(jetProps);
  const placeJetProps = (ac: Aircraft, vis: AirframeVisual) => {
    for (const c of [...jetProps.children]) {
      jetProps.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const P = new Batch();
    const s = ac.spec;
    const rootY = s.gear.height + 0.12;
    // wheel chocks at the nose and main wheels
    const chock = (x: number, z: number) => {
      for (const dz of [-0.55, 0.55]) P.add(yellow, box(0.3, 0.2, 0.28).applyMatrix4(at(x, 0.1, z + dz)));
      P.add(black, beam(V(x, 0.1, z - 0.45), V(x, 0.1, z + 0.45), 0.02));
    };
    chock(0, s.gear.nose);
    for (const sx of [-1, 1]) chock(sx * s.gear.track, s.gear.main);
    // boarding ladder hooked over the left cockpit sill
    const e = vis.cockpitEye;
    const top = V(-0.72, rootY + e.y - 0.35, e.z + 0.25);
    const foot = V(-2.35, 0, e.z + 0.25);
    for (const dz of [-0.24, 0.24]) {
      P.add(yellow, beam(foot.clone().setZ(foot.z + dz), top.clone().setZ(top.z + dz), 0.05));
      P.add(yellow, beam(top.clone().setZ(top.z + dz), top.clone().setZ(top.z + dz).add(V(0.25, 0.12, 0)), 0.04));
      P.add(rubber, box(0.14, 0.05, 0.12).applyMatrix4(at(foot.x, 0.025, foot.z + dz)));
    }
    const len = foot.distanceTo(top);
    for (let d = 0.3; d < len - 0.1; d += 0.3) {
      const p = foot.clone().lerp(top, d / len);
      P.add(steelLight, box(0.12, 0.03, 0.46).applyMatrix4(at(p.x, p.y, p.z)));
    }
    P.add(yellow, box(0.3, 0.04, 0.5).applyMatrix4(at(top.x + 0.15, top.y + 0.05, top.z)));
    // cones with reflective bands off each wingtip and the nose
    const cone = (x: number, z: number) => {
      P.add(orange, cyl(0.03, 0.2, 0.7, 16).applyMatrix4(at(x, 0.38, z)));
      P.add(desk, cyl(0.1, 0.14, 0.12, 16).applyMatrix4(at(x, 0.4, z)));
      P.add(black, box(0.46, 0.04, 0.46).applyMatrix4(at(x, 0.02, z)));
    };
    for (const sx of [-1, 1]) cone(sx * (s.span / 2 + 0.8), 1.5);
    cone(-1.2, -s.length / 2 - 1.5);
    // ground power cart with its cable to the jet
    {
      const gx = -6.8, gz = -3;
      P.add(desk, box(1.2, 1.1, 2.0).applyMatrix4(at(gx, 0.85, gz, 0.2)));
      P.add(frame, box(1.25, 0.08, 2.05).applyMatrix4(at(gx, 1.44, gz, 0.2)));
      for (const dz of [-0.7, 0.7]) for (const dx of [-0.55, 0.55]) P.add(rubber, cyl(0.25, 0.25, 0.14, 14).applyMatrix4(at(gx + dx, 0.25, gz + dz, 0.2, 0, Math.PI / 2)));
      P.add(steel, beam(V(gx - 0.3, 0.35, gz - 1.0), V(gx - 0.5, 0.2, gz - 1.9), 0.05));
      const cable = new THREE.CatmullRomCurve3([V(gx + 0.5, 0.7, gz + 0.4), V(gx + 1.5, 0.05, gz + 0.9), V(-2.5, 0.04, 0.5), V(-1.2, 0.05, 1.2), V(-0.6, rootY - 0.6, 1.4)]);
      P.add(rubber, new THREE.TubeGeometry(cable, 40, 0.035, 6, false));
      // flight-line extinguisher on its wheels
      const fx = 5.8, fz = -9.5;
      P.add(red, cyl(0.28, 0.28, 1.1, 18).applyMatrix4(at(fx, 0.95, fz)));
      P.add(red, cyl(0.28, 0.18, 0.2, 18).applyMatrix4(at(fx, 1.6, fz)));
      P.add(black, cyl(0.04, 0.04, 0.2, 8).applyMatrix4(at(fx, 1.78, fz)));
      P.add(steel, beam(V(fx - 0.35, 0.35, fz), V(fx - 0.35, 1.5, fz - 0.4), 0.04));
      P.add(steel, beam(V(fx + 0.35, 0.35, fz), V(fx + 0.35, 1.5, fz - 0.4), 0.04));
      P.add(steel, beam(V(fx - 0.35, 1.5, fz - 0.4), V(fx + 0.35, 1.5, fz - 0.4), 0.04));
      for (const dx of [-0.42, 0.42]) P.add(rubber, cyl(0.32, 0.32, 0.1, 18).applyMatrix4(at(fx + dx, 0.32, fz, 0, 0, Math.PI / 2)));
      P.add(black, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(fx + 0.1, 1.7, fz), V(fx + 0.5, 1.2, fz + 0.3), V(fx + 0.4, 0.8, fz + 0.25)]), 12, 0.02, 5, false));
    }
    // tool box and a drip tray under the engines
    P.add(red, box(0.55, 0.3, 0.3).applyMatrix4(at(1.8, 0.15, -s.length / 2 + 2.5, 0.4)));
    P.add(black, box(2.2, 0.06, 1.3).applyMatrix4(at(0, 0.03, s.length / 2 - 3.2)));
    P.build(jetProps);
  };

  return {
    sun,
    update(dt: number) {
      tDust += dt;
      // slow Brownian drift; motes that leave their beam start again inside it
      const a = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        dustPos[k] += Math.sin(tDust * 0.3 + i) * 0.004 + 0.002;
        dustPos[k + 1] += Math.sin(tDust * 0.23 + i * 1.7) * 0.003 - 0.0015;
        dustPos[k + 2] += Math.cos(tDust * 0.27 + i * 0.7) * 0.004;
        if (dustPos[k + 1] < 0.3 || dustPos[k] > 5 || (i + Math.floor(tDust * 10)) % 3000 === 0) seedDust(i);
      }
      a.needsUpdate = true;
    },
    placeJetProps,
  };
}
