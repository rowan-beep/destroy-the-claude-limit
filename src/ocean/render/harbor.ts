// Kestrel Harbor above the water, built like a working small port. The quay
// is a cast concrete wall with a capping beam, rubber fenders, steel ladders,
// cast-iron bollards and crane rails; behind it a concrete yard with stacked
// containers, a corrugated-steel shed, the marine lab, a workshop with the
// harbor control tower, fuel tanks and lamp masts. The pier stands on
// concrete piles with timber fendering, the berth has its launch crane and
// foam fenders, and the survey vessel lies alongside. Two armour-rock
// breakwaters with a concrete crown run out to the lights at the gate.
//
// Every surface is textured (harborTex.ts) by world position, so concrete,
// cladding and rock read at their real scale, and each kind of surface is one
// merged mesh. Everything the tide reaches is wet, weeded and darker up to the
// high-water mark (a band in the shader, by height).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HARBOR } from '../world/geo';
import { patchOceanMaterial } from './oceanMaterial';
import { makeHarborTextures, disposeHarborTextures, type HarborTextures } from './harborTex';
import { buildVessel, VESSEL } from './vessel';

const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export type Surface = 'concrete' | 'asphalt' | 'timber' | 'clad' | 'rock' | 'facade' | 'steel' | 'rubber' | 'glass' | 'hull' | 'plain';
type RGB = [number, number, number];

/** how many metres each surface's texture covers (across, up) */
const TILE: Record<Surface, [number, number]> = {
  concrete: [4, 4], asphalt: [8, 8], timber: [4, 4], clad: [2, 2], rock: [3, 3], facade: [3.6, 3.5], steel: [2, 2], rubber: [1, 1], glass: [1, 1], hull: [6, 3], plain: [1, 1],
};

/** paint every vertex a colour, with a slow variation so long surfaces are not flat */
function colorize(g: THREE.BufferGeometry, c0: RGB, vary: number, by?: (x: number, y: number, z: number) => RGB): void {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = by ? by(p.getX(i), p.getY(i), p.getZ(i)) : c0;
    const k = 1 + vary * (Math.sin(p.getX(i) * 0.37 + p.getZ(i) * 0.23) * 0.6 + Math.sin(p.getX(i) * 1.7 + p.getY(i) * 2.1 + p.getZ(i) * 1.3) * 0.4);
    col[i * 3] = srgb(Math.min(1, c[0] * k));
    col[i * 3 + 1] = srgb(Math.min(1, c[1] * k));
    col[i * 3 + 2] = srgb(Math.min(1, c[2] * k));
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/**
 * Map a texture by world position, from whichever side a face looks to: the
 * same metres per tile everywhere. ox / oy / oz shift the tiling (a facade's
 * bays and storeys lined up with its corners and its ground floor).
 */
function boxUV(g: THREE.BufferGeometry, su: number, sv: number, ox = 0, oy = 0, oz = 0): void {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i) - ox, y = p.getY(i) - oy, z = p.getZ(i) - oz;
    let u: number, v: number;
    if (ay >= ax && ay >= az) {
      u = x / su;
      v = z / sv;
    } else if (ax >= az) {
      u = (n.getX(i) > 0 ? -z : z) / su;
      v = y / sv;
    } else {
      u = (n.getZ(i) > 0 ? x : -x) / su;
      v = y / sv;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export interface PartOpts {
  vary?: number;
  /** a colour by position instead of one colour (a hull's antifouling, boot-top and topsides) */
  colorBy?: (x: number, y: number, z: number) => RGB;
  ox?: number;
  oy?: number;
  oz?: number;
}

/** the parts of one model, by surface, merged into one mesh per surface at the end */
export class Parts {
  private by = new Map<Surface, THREE.BufferGeometry[]>();
  tris = 0;

  add(s: Surface, g: THREE.BufferGeometry, rgb: RGB, o: PartOpts = {}): void {
    if (!g.attributes.normal) g.computeVertexNormals();
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    colorize(ng, rgb, o.vary ?? 0.04, o.colorBy);
    boxUV(ng, TILE[s][0], TILE[s][1], o.ox ?? 0, o.oy ?? 0, o.oz ?? 0);
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') ng.deleteAttribute(k);
    let list = this.by.get(s);
    if (!list) this.by.set(s, (list = []));
    list.push(ng);
    this.tris += ng.attributes.position.count / 3;
  }

  /** one mesh per surface, added to the parent */
  build(mats: Record<Surface, THREE.Material>, parent: THREE.Object3D, shadows: boolean, name: string): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [s, list] of this.by) {
      const m = new THREE.Mesh(mergeGeometries(list)!, mats[s]);
      for (const g of list) g.dispose();
      m.name = `${name}-${s}`;
      m.receiveShadow = true;
      m.castShadow = shadows && s !== 'rock' && s !== 'asphalt';
      parent.add(m);
      out.push(m);
    }
    this.by.clear();
    return out;
  }
}

// ------------------------------------------------------------------ shapes
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const B = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, segs: [number, number, number] = [1, 1, 1]) => {
  const g = new THREE.BoxGeometry(w, h, d, ...segs);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
};
export const C = (rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, rx = 0, rz = 0, open = false) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};
/** a round member from a to b */
export const T = (a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6) => {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
};
/** a cast-iron mooring bollard standing on y */
export const bollard = (x: number, y: number, z: number) => {
  const pts = [[0, 0], [0.3, 0], [0.29, 0.12], [0.24, 0.42], [0.33, 0.5], [0.36, 0.6], [0.3, 0.66], [0, 0.68]].map(([r, h]) => new THREE.Vector2(r, h));
  const g = new THREE.LatheGeometry(pts, 10);
  g.translate(x, y, z);
  return g;
};
/** a sagging mooring line from a to b */
export const line = (a: THREE.Vector3, b: THREE.Vector3, sag: number, r = 0.035) => {
  const m = a.clone().lerp(b, 0.5);
  m.y -= sag;
  return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 12, r, 5, false);
};

// ------------------------------------------------------------------ materials
/** the tide on everything it reaches: wet and darker up to the high-water mark, weed and barnacles in the band the water covers and bares */
const TIDE = (k: number) => /* glsl */ `
{
  float ty = vOcWorld.y;
  float wet = 1.0 - smoothstep( 0.5, 1.5, ty );
  float band = smoothstep( -2.6, -1.3, ty ) * ( 1.0 - smoothstep( 0.3, 1.1, ty ) );
  float tn = fract( sin( dot( floor( vOcWorld.xz * 4.0 + ty * 6.0 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  diffuseColor.rgb *= 1.0 - 0.3 * wet * ${k.toFixed(2)};
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.06, 0.075, 0.04 ) * ( 0.75 + 0.5 * tn ), band * 0.75 * ${k.toFixed(2)} );
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.62, 0.8, 0.7 ), ( 1.0 - smoothstep( -3.2, -2.4, ty ) ) * 0.55 * ${k.toFixed(2)} );
}
`;

function tidal<T extends THREE.MeshStandardMaterial>(mat: T, k: number): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + TIDE(k))
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.5 * ${k.toFixed(2)} * ( 1.0 - smoothstep( 0.5, 1.6, vOcWorld.y ) );`);
  };
  const key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => `${key}-tide${k}`;
  return mat;
}

export function harborMaterials(t: HarborTextures): Record<Surface, THREE.MeshStandardMaterial> {
  const std = (key: Surface, o: THREE.MeshStandardMaterialParameters, tide = 1) => tidal(patchOceanMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }), 'hb-' + key), tide);
  return {
    concrete: std('concrete', { map: t.concrete.map, normalMap: t.concrete.normal, roughness: 0.92, metalness: 0 }),
    asphalt: std('asphalt', { map: t.asphalt.map, normalMap: t.asphalt.normal, roughness: 0.96, metalness: 0 }),
    timber: std('timber', { map: t.timber.map, normalMap: t.timber.normal, roughness: 0.88, metalness: 0 }),
    clad: std('clad', { map: t.corrugated.map, normalMap: t.corrugated.normal, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.55, metalness: 0.35 }),
    rock: std('rock', { map: t.rock.map, normalMap: t.rock.normal, roughness: 0.94, metalness: 0 }),
    facade: std('facade', { map: t.facade.map, normalMap: t.facade.normal, roughness: 0.62, metalness: 0.05 }),
    steel: std('steel', { map: t.painted.map, normalMap: t.painted.normal, roughness: 0.5, metalness: 0.45 }),
    rubber: std('rubber', { roughness: 0.95, metalness: 0 }),
    glass: std('glass', { roughness: 0.06, metalness: 0.1 }, 0),
    hull: std('hull', { map: t.plating.map, normalMap: t.plating.normal, roughness: 0.42, metalness: 0.3 }, 0.35),
    plain: std('plain', { roughness: 0.7, metalness: 0 }),
  };
}

// ------------------------------------------------------------------ colours
const CONC: RGB = [0.66, 0.65, 0.62];
const CONC_L: RGB = [0.74, 0.73, 0.7];
const GALV: RGB = [0.58, 0.6, 0.6];
const BLACK: RGB = [0.07, 0.07, 0.075];
const YELLOW: RGB = [0.95, 0.72, 0.1];
const WHITE: RGB = [0.92, 0.92, 0.9];
const CONTAINER: RGB[] = [[0.13, 0.32, 0.58], [0.66, 0.13, 0.1], [0.14, 0.42, 0.3], [0.8, 0.55, 0.12], [0.55, 0.56, 0.55], [0.86, 0.86, 0.83], [0.34, 0.22, 0.16], [0.1, 0.45, 0.55]];

/** deterministic randoms */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5;
    s ^= s >>> 13;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** a text sign (transparent, letters only) */
function sign(text: string, w: number, h: number, color: string, weight = 700): THREE.Mesh {
  const px = 64;
  const c = document.createElement('canvas');
  c.width = Math.min(2048, Math.round((w / h) * px));
  c.height = px;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${weight} ${Math.round(px * 0.78)}px 'Inter', 'Segoe UI', Arial, sans-serif`;
  const tw = g.measureText(text).width;
  if (tw > c.width * 0.98) g.font = `${weight} ${Math.round((px * 0.78 * c.width * 0.98) / tw)}px 'Inter', 'Segoe UI', Arial, sans-serif`;
  g.fillText(text, c.width / 2, px / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = patchOceanMaterial(new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.6, metalness: 0.1 }), 'hb-sign');
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.name = 'sign';
  return m;
}

export interface HarborBuild {
  group: THREE.Group;
  /** the gate lights, blinking in their periods */
  lights: { mesh: THREE.Mesh; period: number; phase: number }[];
  /** things that turn (radar scanners) */
  spinners: { obj: THREE.Object3D; rate: number }[];
  tris: number;
  textures: HarborTextures;
  dispose(): void;
}

/** build the harbor (detail 1 full, 0..1 fewer rocks and smaller textures) */
export function buildHarbor(shadows: boolean, detail = 1): HarborBuild {
  const tex = makeHarborTextures(detail);
  const mats = harborMaterials(tex);
  const group = new THREE.Group();
  group.name = 'harbor';
  const p = new Parts();
  const lights: HarborBuild['lights'] = [];
  const spinners: HarborBuild['spinners'] = [];
  const signs: THREE.Mesh[] = [];
  const hb = HARBOR.basin;
  const Y = 2.7;
  const FACE = hb.minZ;
  const X0 = -255, X1 = 255;
  const pier = { x0: -32, x1: -20, z0: -198, z1: -102 };
  const nearPier = (x: number) => x > pier.x0 - 5 && x < pier.x1 + 5;

  // ---------------------------------------------------------------- the quay wall
  p.add('concrete', B(X1 - X0, 14.2, 6, 0, -4.4, FACE - 3, 0, [32, 1, 1]), CONC, { vary: 0.05 });
  p.add('concrete', B(X1 - X0, 1.0, 1.3, 0, 2.3, FACE - 0.4, 0, [32, 1, 1]), CONC_L);
  p.add('plain', B(X1 - X0, 0.02, 0.18, 0, 2.81, FACE + 0.08), YELLOW, { vary: 0 });
  for (let x = -246; x <= 246; x += 12) {
    if (nearPier(x)) continue;
    p.add('rubber', B(0.9, 2.6, 0.6, x, 0.5, FACE + 0.55), BLACK, { vary: 0 });
    p.add('steel', B(1.7, 2.9, 0.16, x, 0.5, FACE + 0.93), [0.12, 0.12, 0.12]);
  }
  for (const x0 of [-232, -196, -154, -112, -70, 14, 56, 98, 140, 182, 224]) {
    const x = x0 + 6;
    for (const dx of [-0.22, 0.22]) p.add('steel', C(0.035, 0.035, 6.4, 6, x + dx, -0.5, FACE + 0.22), GALV);
    for (let y = -3.4; y < 2.6; y += 0.3) p.add('steel', C(0.02, 0.02, 0.44, 5, x, y, FACE + 0.22, 0, Math.PI / 2), GALV);
  }
  for (let x = -243; x <= 243; x += 18) if (!nearPier(x)) p.add('steel', bollard(x, 2.8, FACE - 0.55), BLACK);
  // crane rails along the quay
  for (const z of [FACE - 7, FACE - 13.5]) p.add('steel', B(X1 - X0, 0.08, 0.16, 0, Y + 0.04, z), [0.3, 0.29, 0.28]);

  // ---------------------------------------------------------------- the yard
  p.add('concrete', B(X1 - X0, 0.4, 84, 0, Y - 0.2, -258.1, 0, [48, 1, 8]), [0.62, 0.61, 0.58], { vary: 0.07 });
  p.add('asphalt', B(X1 - X0, 0.42, 12, 0, Y - 0.19, -293, 0, [24, 1, 1]), [1, 1, 1], { vary: 0.04 });
  for (let x = -250; x <= 250; x += 9) p.add('plain', B(4.5, 0.01, 0.16, x, Y + 0.025, -293), WHITE, { vary: 0 });
  for (const z of [-287.4, -298.6]) p.add('plain', B(X1 - X0, 0.01, 0.14, 0, Y + 0.025, z), WHITE, { vary: 0 });
  p.add('plain', B(X1 - X0, 0.01, 0.14, 0, Y + 0.008, FACE - 4.2), YELLOW, { vary: 0 });
  // lamp masts along the quay
  const mast = (x: number, z: number, h: number, dir: number) => {
    p.add('steel', C(0.09, 0.15, h, 8, x, Y + h / 2, z), GALV);
    p.add('steel', T(V(x, Y + h - 0.2, z), V(x, Y + h, z + 1.4 * dir), 0.05), GALV);
    p.add('steel', B(0.5, 0.14, 0.9, x, Y + h, z + 1.7 * dir), [0.2, 0.2, 0.21]);
    p.add('glass', B(0.42, 0.02, 0.8, x, Y + h - 0.075, z + 1.7 * dir), [0.95, 0.93, 0.85]);
  };
  for (let x = -230; x <= 230; x += 46) if (!nearPier(x)) mast(x, FACE - 4.6, 11, 1);

  // ---------------------------------------------------------------- the pier
  const pz = (pier.z0 + pier.z1) / 2, plen = pier.z1 - pier.z0;
  p.add('concrete', B(12, 0.7, plen, -26, 2.45, pz, 0, [2, 1, 12]), CONC, { vary: 0.06 });
  for (const x of [pier.x0 + 0.15, pier.x1 - 0.15]) p.add('concrete', B(0.3, 0.25, plen, x, 2.925, pz), CONC_L);
  for (let i = 0; i < 16; i++) {
    const z = -196 + i * 6.2;
    p.add('concrete', B(12.6, 0.9, 0.9, -26, 1.65, z), CONC);
    for (const x of [-31, -26, -21]) p.add('concrete', C(0.42, 0.45, 13.4, 12, x, -4.95, z), [0.6, 0.6, 0.57]);
  }
  // timber fendering on both sides (the berth to the east, the vessel's side to the west)
  for (const [x, side] of [[pier.x1 + 0.3, 1], [pier.x0 - 0.3, -1]] as [number, number][]) {
    for (let z = pier.z0 + 1; z <= pier.z1 - 1; z += 3) p.add('timber', B(0.3, 6.2, 0.3, x, -0.6, z), [0.55, 0.47, 0.38]);
    for (const y of [0.4, 1.6]) p.add('timber', B(0.25, 0.3, plen, x + 0.25 * side, y, pz), [0.52, 0.45, 0.36]);
  }
  for (let z = -195; z <= -105; z += 15) for (const x of [pier.x1 - 1, pier.x0 + 1]) p.add('steel', bollard(x, 2.8, z), BLACK);
  for (const z of [-188, -158, -128]) mast(pier.x0 + 0.6, z, 8, 1);
  // the berth: its mark, foam fenders, the marker buoys and the launch and recovery crane
  const bz = HARBOR.berth.z;
  p.add('plain', B(0.18, 0.012, 16, pier.x1 - 0.4, 2.812, bz), YELLOW, { vary: 0 });
  for (const dz of [-5, 5]) {
    p.add('rubber', C(0.55, 0.55, 2.2, 16, pier.x1 + 1.1, 0.5, bz + dz, Math.PI / 2), YELLOW, { vary: 0.02 });
    for (const e of [-1.1, 1.1]) p.add('rubber', C(0.3, 0.3, 0.12, 12, pier.x1 + 1.1, 0.5, bz + dz + e, Math.PI / 2), BLACK);
    p.add('steel', T(V(pier.x1 + 1.1, 1.05, bz + dz), V(pier.x1 - 0.2, 2.8, bz + dz), 0.025, 4), [0.3, 0.3, 0.3]);
  }
  for (const dz of [-9, 9]) {
    const x = HARBOR.berth.x + 3.5, z = bz + dz;
    p.add('rubber', C(0.55, 0.6, 1.1, 18, x, 0.15, z), [0.95, 0.42, 0.08], { vary: 0 });
    p.add('rubber', C(0.06, 0.55, 0.9, 18, x, 1.15, z), [0.95, 0.42, 0.08], { vary: 0 });
    p.add('plain', C(0.4, 0.43, 0.18, 18, x, 1.0, z), WHITE, { vary: 0 });
  }
  {
    const cx = pier.x1 - 2.4, cy = 2.8, cz = bz - 2;
    p.add('steel', C(0.5, 0.6, 2.2, 14, cx, cy + 1.1, cz), YELLOW);
    p.add('steel', B(1.5, 1.1, 1.9, cx, cy + 2.7, cz), YELLOW);
    const a = V(cx + 0.2, cy + 3.0, cz), k = V(cx + 5.4, cy + 6.9, cz), tip = V(cx + 9.6, cy + 5.3, cz);
    p.add('steel', T(a, k, 0.26, 8), YELLOW);
    p.add('steel', T(k, tip, 0.19, 8), YELLOW);
    p.add('steel', T(V(cx + 0.5, cy + 2.2, cz + 0.3), V(cx + 3.4, cy + 5.2, cz + 0.3), 0.07, 6), [0.75, 0.76, 0.78]);
    p.add('steel', T(tip, V(tip.x, cy - 0.4, cz), 0.014, 4), [0.2, 0.2, 0.2]);
    p.add('steel', B(0.36, 0.5, 0.28, tip.x, cy - 0.6, cz), YELLOW);
  }

  // ---------------------------------------------------------------- the shed
  {
    const cx = -135, cz = -266, Lx = 36, Lz = 22, H = 8.5, rise = (Lz / 2) * Math.tan((12 * Math.PI) / 180);
    const wall: RGB = [0.4, 0.49, 0.56];
    p.add('concrete', B(Lx + 0.3, 0.9, Lz + 0.3, cx, Y + 0.45, cz), CONC);
    p.add('clad', B(Lx, H - 0.9, Lz, cx, Y + 0.9 + (H - 0.9) / 2, cz), wall, { vary: 0.03 });
    // the gables and the roof
    const tri = new THREE.Shape([new THREE.Vector2(-Lz / 2, 0), new THREE.Vector2(Lz / 2, 0), new THREE.Vector2(0, rise)]);
    const gab = new THREE.ExtrudeGeometry(tri, { depth: Lx, bevelEnabled: false });
    gab.rotateY(Math.PI / 2);
    gab.translate(cx - Lx / 2, Y + H, cz);
    p.add('clad', gab, wall, { vary: 0.03 });
    const slope = Math.hypot(Lz / 2, rise) + 0.6;
    const ang = Math.atan2(rise, Lz / 2);
    for (const s of [-1, 1]) {
      const r = new THREE.BoxGeometry(Lx + 0.8, 0.12, slope);
      r.rotateX(s * ang);
      r.translate(cx, Y + H + rise / 2 + 0.08, cz - s * (Lz / 4 + 0.15));
      p.add('clad', r, [0.6, 0.62, 0.64], { vary: 0.05 });
      p.add('steel', C(0.11, 0.11, Lx + 0.8, 8, cx, Y + H - 0.05, cz - s * (Lz / 2 + 0.4), 0, Math.PI / 2), [0.55, 0.57, 0.58]);
    }
    p.add('steel', B(Lx + 0.8, 0.16, 0.7, cx, Y + H + rise + 0.12, cz), [0.5, 0.52, 0.53]);
    const front = cz + Lz / 2;
    for (const dx of [-10, 6]) {
      p.add('steel', B(6, 5.6, 0.1, cx + dx, Y + 0.9 + 2.8, front + 0.06), [0.66, 0.67, 0.66]);
      for (let y = 1.2; y < 6.4; y += 0.32) p.add('steel', B(6, 0.04, 0.03, cx + dx, Y + y, front + 0.12), [0.5, 0.5, 0.5]);
      for (const e of [-3.2, 3.2]) p.add('steel', B(0.3, 5.9, 0.3, cx + dx + e, Y + 0.9 + 2.95, front + 0.15), YELLOW);
    }
    p.add('steel', B(1.0, 2.15, 0.08, cx - 1.5, Y + 0.9 + 1.07, front + 0.05), [0.18, 0.32, 0.26]);
    p.add('glass', B(Lx - 4, 0.9, 0.06, cx, Y + H - 1.4, front + 0.04), [0.62, 0.7, 0.74]);
    for (const [dx, dz] of [[-Lx / 2, -Lz / 2], [Lx / 2, -Lz / 2], [-Lx / 2, Lz / 2], [Lx / 2, Lz / 2]]) p.add('steel', C(0.07, 0.07, H, 6, cx + dx + Math.sign(dx) * 0.2, Y + H / 2, cz + dz + Math.sign(dz) * 0.2), [0.5, 0.52, 0.53]);
    const s = sign('KESTREL HARBOR · SHED 2', 14, 1.0, '#f2f4f2');
    s.position.set(cx + 8, Y + H - 2.6, front + 0.14);
    signs.push(s);
  }

  // ---------------------------------------------------------------- the marine lab
  {
    const cx = 86.4, cz = -264.6, Lx = 28.8, Lz = 14.4, F = Y + 0.4;
    const x0 = cx - Lx / 2, z0 = cz - Lz / 2;
    p.add('concrete', B(Lx + 0.4, 0.4, Lz + 0.4, cx, Y + 0.2, cz), CONC);
    p.add('facade', B(Lx, 7.0, Lz, cx, F + 3.5, cz), [0.93, 0.92, 0.89], { vary: 0.01, ox: x0, oy: F, oz: z0 });
    p.add('concrete', B(Lx + 0.2, 0.28, Lz + 0.2, cx, F + 3.5, cz), CONC_L);
    p.add('concrete', B(Lx + 0.3, 0.8, Lz + 0.3, cx, F + 7.4, cz), CONC_L);
    p.add('asphalt', B(Lx - 0.4, 0.1, Lz - 0.4, cx, F + 7.3, cz), [0.6, 0.6, 0.62]);
    // the entrance
    p.add('glass', B(4.2, 2.8, 0.25, cx, F + 1.4, cz + Lz / 2 + 0.02), [0.35, 0.42, 0.46]);
    p.add('steel', B(4.4, 0.1, 0.1, cx, F + 2.85, cz + Lz / 2 + 0.16), [0.25, 0.26, 0.27]);
    p.add('concrete', B(6.4, 0.25, 2.6, cx, F + 3.15, cz + Lz / 2 + 1.3), CONC_L);
    for (const e of [-2.9, 2.9]) p.add('steel', C(0.07, 0.07, 3.0, 8, cx + e, F + 1.5, cz + Lz / 2 + 2.4), GALV);
    // the roof: plant, a mast, solar panels
    for (const dx of [-8, -4.5]) p.add('steel', B(2.4, 1.4, 1.6, cx + dx, F + 8.0, cz - 2), [0.7, 0.71, 0.7]);
    p.add('steel', C(0.05, 0.06, 6, 6, cx + 11, F + 10.3, cz - 4), GALV);
    for (const y of [11.5, 12.6]) p.add('steel', C(0.025, 0.025, 1.6, 4, cx + 11, F + y, cz - 4, 0, Math.PI / 2), GALV);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BoxGeometry(1.7, 0.05, 1.05);
      g.rotateX(-0.45);
      g.translate(cx + 1 + (i % 3) * 2.0, F + 7.9, cz + 1.2 + Math.floor(i / 3) * 1.6);
      p.add('glass', g, [0.12, 0.17, 0.3]);
    }
    const s = sign('KESTREL MARINE LAB', 13, 0.62, '#1d3a4a');
    s.position.set(cx, F + 7.4, cz + Lz / 2 + 0.17);
    signs.push(s);
  }

  // ---------------------------------------------------------------- the workshop and the control tower
  {
    const cx = 172, cz = -270, Lx = 20, Lz = 14, H = 6, rise = 2.2;
    const wall: RGB = [0.8, 0.76, 0.66];
    p.add('concrete', B(Lx + 0.3, 0.8, Lz + 0.3, cx, Y + 0.4, cz), CONC);
    p.add('clad', B(Lx, H - 0.8, Lz, cx, Y + 0.8 + (H - 0.8) / 2, cz), wall, { vary: 0.03 });
    const tri = new THREE.Shape([new THREE.Vector2(-Lz / 2, 0), new THREE.Vector2(Lz / 2, 0), new THREE.Vector2(0, rise)]);
    const gab = new THREE.ExtrudeGeometry(tri, { depth: Lx, bevelEnabled: false });
    gab.rotateY(Math.PI / 2);
    gab.translate(cx - Lx / 2, Y + H, cz);
    p.add('clad', gab, wall);
    const ang = Math.atan2(rise, Lz / 2), slope = Math.hypot(Lz / 2, rise) + 0.5;
    for (const s of [-1, 1]) {
      const r = new THREE.BoxGeometry(Lx + 0.7, 0.12, slope);
      r.rotateX(s * ang);
      r.translate(cx, Y + H + rise / 2 + 0.08, cz - s * (Lz / 4 + 0.12));
      p.add('clad', r, [0.46, 0.2, 0.14], { vary: 0.05 });
    }
    p.add('steel', B(4.5, 4.2, 0.1, cx - 4, Y + 0.8 + 2.1, cz + Lz / 2 + 0.06), [0.24, 0.36, 0.48]);
    p.add('glass', B(6, 1.1, 0.06, cx + 4.5, Y + 3.3, cz + Lz / 2 + 0.04), [0.4, 0.47, 0.5]);
    // the harbor control tower: three storeys and the glass control room
    const tx = 150, tz = -264, F = Y + 0.4;
    p.add('concrete', B(6.4, 0.4, 6.4, tx, Y + 0.2, tz), CONC);
    p.add('facade', B(6.0, 10.5, 6.0, tx, F + 5.25, tz), [0.94, 0.93, 0.9], { vary: 0.01, ox: tx - 3, oy: F, oz: tz - 3 });
    p.add('concrete', B(7.6, 0.35, 7.6, tx, F + 10.65, tz), CONC_L);
    p.add('glass', B(7.0, 2.8, 7.0, tx, F + 12.25, tz), [0.3, 0.38, 0.42]);
    for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5], [0, -3.5], [0, 3.5], [-3.5, 0], [3.5, 0]]) p.add('steel', B(0.12, 2.8, 0.12, tx + dx, F + 12.25, tz + dz), [0.2, 0.21, 0.22]);
    p.add('concrete', B(8.4, 0.4, 8.4, tx, F + 13.85, tz), CONC_L);
    p.add('steel', C(0.06, 0.08, 4.5, 6, tx + 2.5, F + 16.3, tz + 2.5), GALV);
    p.add('steel', C(0.25, 0.3, 1.0, 10, tx - 1.5, F + 14.55, tz - 1.5), [0.8, 0.8, 0.78]);
    const scan = new THREE.Group();
    scan.position.set(tx - 1.5, F + 15.2, tz - 1.5);
    const scanMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 0.32), new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.5 }));
    scan.add(scanMesh);
    group.add(scan);
    spinners.push({ obj: scan, rate: 2.6 });
    const s = sign('HARBOR CONTROL', 5.2, 0.5, '#1d3a4a');
    s.position.set(tx, F + 10.2, tz + 3.02);
    signs.push(s);
  }

  // ---------------------------------------------------------------- fuel tanks
  {
    const cx = -212, cz = -275;
    for (const dx of [-6, 6]) {
      p.add('steel', C(4.3, 4.3, 7.5, 28, cx + dx, Y + 0.4 + 3.75, cz), [0.88, 0.88, 0.85], { vary: 0.02 });
      p.add('steel', C(0.6, 4.35, 0.9, 28, cx + dx, Y + 8.6, cz), [0.84, 0.84, 0.82]);
      for (let a = 0; a < 7.5; a += 0.5) p.add('steel', C(0.025, 0.025, 1.0, 4, cx + dx + Math.cos(a * 0.5) * 4.45, Y + 0.6 + a, cz + Math.sin(a * 0.5) * 4.45), GALV);
    }
    for (const [w, d, x, z] of [[26, 0.3, cx, cz - 7], [26, 0.3, cx, cz + 7], [0.3, 14, cx - 13, cz], [0.3, 14, cx + 13, cz]]) p.add('concrete', B(w, 1.1, d, x, Y + 0.55, z), CONC);
    p.add('steel', T(V(cx + 6, Y + 1.0, cz + 4.3), V(cx + 6, Y + 1.0, FACE - 9), 0.12, 8), [0.6, 0.62, 0.6]);
    p.add('steel', T(V(cx - 6, Y + 1.0, cz + 4.3), V(cx - 6, Y + 1.0, FACE - 9.5), 0.12, 8), [0.6, 0.62, 0.6]);
  }

  // ---------------------------------------------------------------- containers
  {
    const r = rng(7);
    const box = (x: number, z: number, len: number, lvl: number, col: RGB) => {
      const y = Y + 1.295 + lvl * 2.6;
      p.add('clad', B(len, 2.59, 2.44, x, y, z), col, { vary: 0.03 });
      for (const ex of [-len / 2 + 0.1, len / 2 - 0.1]) for (const ez of [-1.12, 1.12]) for (const ey of [-1.2, 1.2]) p.add('steel', B(0.2, 0.18, 0.2, x + ex, y + ey, z + ez), [0.25, 0.25, 0.25]);
      for (let i = 0; i < 4; i++) p.add('steel', B(0.06, 2.4, 0.04, x + len / 2 + 0.02, y, z - 0.9 + i * 0.6).rotateY(Math.PI / 2), col);
    };
    for (const [x, z] of [[-94, -240], [-80.6, -240], [-67.2, -240], [-94, -243.2], [-80.6, -243.2], [-67.2, -243.2], [-94, -246.4], [-80.6, -246.4]] as [number, number][]) {
      const n = 1 + Math.floor(r() * 3);
      for (let l = 0; l < n; l++) box(x, z, 12.19, l, CONTAINER[Math.floor(r() * CONTAINER.length)]);
    }
    for (const [x, z] of [[112, -238], [119, -238], [126, -238], [112, -241.2], [119, -241.2], [133, -238], [112, -244.4]] as [number, number][]) {
      const n = 1 + Math.floor(r() * 2);
      for (let l = 0; l < n; l++) box(x, z, 6.06, l, CONTAINER[Math.floor(r() * CONTAINER.length)]);
    }
  }

  // ---------------------------------------------------------------- the quay crane
  {
    const cx = 40, cz = FACE - 10.2, base = Y;
    for (const [dx, dz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) {
      p.add('steel', B(0.7, 8, 0.7, cx + dx, base + 4, cz + dz), YELLOW);
      p.add('steel', B(1.4, 0.6, 1.0, cx + dx, base + 0.3, cz + dz), [0.2, 0.2, 0.2]);
    }
    for (const dz of [-3.2, 3.2]) p.add('steel', T(V(cx - 3.2, base + 1, cz + dz), V(cx + 3.2, base + 7, cz + dz), 0.12), YELLOW);
    p.add('steel', B(7.4, 0.9, 7.4, cx, base + 8.4, cz), YELLOW);
    p.add('steel', B(5.6, 4.0, 7.2, cx, base + 10.85, cz - 0.6), YELLOW);
    p.add('concrete', B(4.6, 2.4, 1.8, cx, base + 10.4, cz - 4.9), [0.5, 0.5, 0.48]);
    p.add('steel', B(2.0, 2.3, 2.4, cx + 2.9, base + 10.1, cz + 3.4), WHITE);
    p.add('glass', B(2.04, 1.2, 2.44, cx + 2.9, base + 10.5, cz + 3.4), [0.3, 0.38, 0.42]);
    const apex = V(cx, base + 17.5, cz - 1.2);
    for (const dx of [-2.2, 2.2]) {
      p.add('steel', T(V(cx + dx, base + 12.8, cz - 3.4), apex, 0.16), YELLOW);
      p.add('steel', T(V(cx + dx, base + 12.8, cz + 1.4), apex, 0.16), YELLOW);
    }
    // the lattice jib, luffed up over the water
    const piv = V(cx, base + 11.6, cz + 2.8);
    const ang = (38 * Math.PI) / 180, L = 30;
    const dir = V(0, Math.sin(ang), Math.cos(ang));
    const up = V(0, Math.cos(ang), -Math.sin(ang));
    const side = V(1, 0, 0);
    const corner = (t: number, sx: number, sy: number) => {
      const w = 1.5 - 0.9 * t;
      return piv.clone().addScaledVector(dir, t * L).addScaledVector(side, sx * w * 0.5).addScaledVector(up, sy * w * 0.5);
    };
    const segs = 12;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add('steel', T(corner(0, sx, sy), corner(1, sx, sy), 0.07, 6), YELLOW);
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const faces: [number, number, number, number][] = [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]];
      for (const [ax, ay, bx, by] of faces) {
        p.add('steel', T(corner(t0, ax, ay), corner(t1, bx, by), 0.035, 4), YELLOW);
        p.add('steel', T(corner(t1, ax, ay), corner(t1, bx, by), 0.03, 4), YELLOW);
      }
    }
    const tip = piv.clone().addScaledVector(dir, L);
    for (const dx of [-0.25, 0.25]) p.add('steel', T(V(apex.x + dx, apex.y, apex.z), V(tip.x + dx, tip.y, tip.z), 0.025, 4), [0.2, 0.2, 0.2]);
    const hookY = Y + 3.2;
    p.add('steel', T(tip, V(tip.x, hookY + 0.5, tip.z), 0.02, 4), [0.2, 0.2, 0.2]);
    p.add('steel', B(0.7, 0.9, 0.45, tip.x, hookY, tip.z), YELLOW);
    p.add('steel', new THREE.TorusGeometry(0.22, 0.06, 6, 12, Math.PI * 1.4).rotateZ(Math.PI).translate(tip.x, hookY - 0.75, tip.z), [0.2, 0.2, 0.2]);
  }

  // ---------------------------------------------------------------- the breakwaters and the gate lights
  {
    const r = rng(19);
    const rockGeo = (s: number, seed: number) => {
      const g = new THREE.IcosahedronGeometry(1, detail >= 1 ? 1 : 0);
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const k = 1 + 0.22 * Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.7) + 0.12 * Math.sin(z * 5.3 + seed * 0.7);
        pa.setXYZ(i, x * k, Math.max(y * k, -0.55), z * k);
      }
      g.computeVertexNormals();
      g.scale(s * (0.9 + r() * 0.4), s * (0.55 + r() * 0.25), s * (0.9 + r() * 0.4));
      g.rotateY(r() * Math.PI * 2);
      g.rotateX((r() - 0.5) * 0.5);
      return g;
    };
    const arm = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      p.add('concrete', B(5, 4.6, len, (x0 + x1) / 2, 1.2, (z0 + z1) / 2, yaw, [1, 1, 24]), [0.64, 0.63, 0.6], { vary: 0.05 });
      const step = detail >= 1 ? 2.8 : 3.6;
      const n = Math.floor(len / step);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const bx = x0 + (x1 - x0) * t, bz = z0 + (z1 - z0) * t;
        for (const [off, y, s] of [[4.6, -0.3, 2.1], [-4.6, -0.3, 2.1], [8.2, -2.7, 2.7], [-8.2, -2.7, 2.7]]) {
          const j = (r() - 0.5) * 1.2;
          const g = rockGeo(s * (0.85 + r() * 0.35), i * 7.3 + off);
          g.translate(bx + nx * (off + j), y + (r() - 0.5) * 0.6, bz + nz * (off + j));
          const shade = 0.85 + r() * 0.25;
          p.add('rock', g, [0.56 * shade, 0.54 * shade, 0.5 * shade], { vary: 0.03 });
        }
      }
      // the head: a ring of rock round the light
      for (let a = 0; a < 14; a++) {
        const th = (a / 14) * Math.PI * 2;
        const g = rockGeo(2.6, a * 3.1 + x1);
        g.translate(x1 + Math.cos(th) * 6.5, -1.4, z1 + Math.sin(th) * 6.5);
        p.add('rock', g, [0.55, 0.53, 0.5]);
      }
    };
    const gx = HARBOR.gate.halfWidth + 6, gz = HARBOR.gate.z;
    arm(-250, -190, -gx, gz);
    arm(250, -190, gx, gz);
    for (const [x, band] of [[-gx, [0.78, 0.1, 0.08]], [gx, [0.1, 0.55, 0.22]]] as [number, RGB][]) {
      p.add('concrete', C(3.4, 3.8, 3.0, 28, x, 2.0, gz), CONC);
      for (let i = 0; i < 6; i++) {
        const rb = 1.55 - i * 0.07, rt = rb - 0.07;
        p.add(i % 2 ? 'steel' : 'steel', C(rt, rb, 1.5, 24, x, 3.5 + 0.75 + i * 1.5, gz), i % 2 ? band : WHITE, { vary: 0.01 });
      }
      p.add('steel', C(1.8, 1.8, 0.18, 28, x, 12.6, gz), [0.18, 0.2, 0.2]);
      for (let k = 0; k < 14; k++) {
        const th = (k / 14) * Math.PI * 2;
        p.add('steel', C(0.025, 0.025, 0.95, 4, x + Math.cos(th) * 1.68, 13.15, gz + Math.sin(th) * 1.68), [0.18, 0.2, 0.2]);
      }
      p.add('steel', new THREE.TorusGeometry(1.68, 0.035, 4, 32).rotateX(Math.PI / 2).translate(x, 13.62, gz), [0.18, 0.2, 0.2]);
      p.add('glass', C(0.75, 0.75, 1.3, 16, x, 13.4, gz), [0.6, 0.66, 0.66]);
      p.add('steel', C(0.08, 0.95, 0.7, 16, x, 14.4, gz), band);
      p.add('steel', new THREE.SphereGeometry(0.16, 8, 6).translate(x, 14.85, gz), [0.15, 0.15, 0.15]);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(band[0] * 1.6 + 0.2, band[1] * 1.6 + 0.2, band[2] * 1.6 + 0.1) }));
      lamp.position.set(x, 13.4, gz);
      group.add(lamp);
      lights.push({ mesh: lamp, period: x < 0 ? 4 : 3, phase: x < 0 ? 0 : 1.3 });
    }
  }

  // ---------------------------------------------------------------- the survey vessel, alongside the pier's west face
  buildVessel(p, signs, spinners, group);
  // its mooring lines, to the pier's bollards
  {
    const vx = VESSEL.x, vz = VESSEL.z;
    const deck = (z: number) => VESSEL.deckAt(z);
    for (const [lz, bz] of [[-15, -137], [-12, -125], [12, -110], [15, -102]] as [number, number][]) {
      const a = V(vx + 4.0, deck(lz) + 0.6, vz + lz);
      const b = V(pier.x0 + 1, 3.3, bz);
      p.add('rubber', line(a, b, 0.8, 0.04), [0.85, 0.82, 0.7], { vary: 0 });
    }
  }

  const meshes = p.build(mats, group, shadows, 'harbor');
  for (const s of signs) group.add(s);
  return {
    group,
    lights,
    spinners,
    tris: p.tris,
    textures: tex,
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const m of Object.values(mats)) m.dispose();
      for (const s of signs) {
        s.geometry.dispose();
        const sm = s.material as THREE.MeshStandardMaterial;
        sm.map?.dispose();
        sm.dispose();
      }
      for (const l of lights) {
        l.mesh.geometry.dispose();
        (l.mesh.material as THREE.Material).dispose();
      }
      for (const sp of spinners) sp.obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      disposeHarborTextures(tex);
    },
  };
}
