// What you see through the hangar doors and windows at golden hour: a
// physically based sunset sky with drifting clouds, the airfield (concrete
// apron with its stands and markings, taxiway and runway with their lights,
// jets parked on the apron, a fuel truck and a tug), the buildings around it
// (a neighbouring hangar, hardened aircraft shelters, the control tower and a
// turning radar), tree lines, and 3D mountain ranges that fade into the warm
// haze. Everything static is batched; trees are instanced.

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Batch, at, box, cyl, bar, beam, V, canvas, tex, rng } from './hangarKit';
import { Aircraft } from '../../aircraft/aircraft';
import { createAirframe } from '../../aircraft/models';
import type { AircraftType } from '../../aircraft/specs';

export interface Outside {
  update(dt: number): void;
  /** hide the sun's disc while the environment map is captured (it would blow out the reflections) */
  setSunDisc(on: boolean): void;
}

// ---------------------------------------------------------------------------
// noise
// ---------------------------------------------------------------------------

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, seed: number, oct = 5): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f, seed + i * 17);
    f *= 2.03;
    a *= 0.5;
  }
  return s / (1 - Math.pow(0.5, oct));
}
function ridged(x: number, y: number, seed: number, oct = 6): number {
  let s = 0, a = 0.5, f = 1, w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(vnoise(x * f, y * f, seed + i * 31) * 2 - 1);
    n *= n * w;
    w = Math.min(1, n * 1.6);
    s += a * n;
    f *= 2.1;
    a *= 0.5;
  }
  return s;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------

/** Apron concrete: 7.5 m slabs with sealed joints, tone variation, aggregate, stains and tyre marks. One tile = 30 m. */
function concreteTexture(): THREE.Texture {
  const S = 1024, PX = S / 30;
  const [c, g] = canvas(S, S);
  const r = rng(41);
  g.fillStyle = '#b8b2a6';
  g.fillRect(0, 0, S, S);
  // per-slab tone and trowel direction
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const t = (r() - 0.5) * 22;
      g.fillStyle = `rgba(${t > 0 ? 255 : 40},${t > 0 ? 250 : 38},${t > 0 ? 240 : 34},${Math.abs(t) / 100})`;
      g.fillRect(i * 7.5 * PX, j * 7.5 * PX, 7.5 * PX, 7.5 * PX);
      // brushed texture across the slab
      g.strokeStyle = 'rgba(60,55,50,0.05)';
      g.lineWidth = 1;
      for (let k = 0; k < 90; k++) {
        const y = j * 7.5 * PX + r() * 7.5 * PX;
        g.beginPath();
        g.moveTo(i * 7.5 * PX, y);
        g.lineTo((i + 1) * 7.5 * PX, y + (r() - 0.5) * 3);
        g.stroke();
      }
    }
  // aggregate speckle
  for (let k = 0; k < 90000; k++) {
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(70,66,60,${0.1 + r() * 0.18})` : `rgba(235,230,220,${0.08 + r() * 0.14})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 1.4, 1 + r() * 1.4);
  }
  // blotchy weathering
  for (let k = 0; k < 160; k++) {
    const x = r() * S, y = r() * S, rad = 10 + r() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(80,74,64,${0.04 + r() * 0.06})`);
    gr.addColorStop(1, 'rgba(80,74,64,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // oil stains
  for (let k = 0; k < 14; k++) {
    const x = r() * S, y = r() * S, rad = 6 + r() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(25,22,18,${0.25 + r() * 0.2})`);
    gr.addColorStop(0.7, 'rgba(25,22,18,0.08)');
    gr.addColorStop(1, 'rgba(25,22,18,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // tyre marks
  g.lineCap = 'round';
  for (let k = 0; k < 10; k++) {
    g.strokeStyle = `rgba(20,20,20,${0.06 + r() * 0.08})`;
    g.lineWidth = 6 + r() * 6;
    const x = r() * S, y = r() * S;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + (r() - 0.5) * 300, y + r() * 200, x + (r() - 0.5) * 300, y + 200 + r() * 200, x + (r() - 0.5) * 200, y + 450);
    g.stroke();
  }
  // hairline cracks
  g.strokeStyle = 'rgba(40,36,32,0.35)';
  g.lineWidth = 1;
  for (let k = 0; k < 18; k++) {
    let x = r() * S, y = r() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 12; s++) {
      x += (r() - 0.5) * 22;
      y += (r() - 0.5) * 22;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // slab joints with black sealant
  for (let i = 0; i <= 4; i++) {
    const p = i * 7.5 * PX;
    g.fillStyle = 'rgba(28,26,24,0.85)';
    g.fillRect(p - 1.5, 0, 3, S);
    g.fillRect(0, p - 1.5, S, 3);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(p + 1.5, 0, 1, S);
    g.fillRect(0, p + 1.5, S, 1);
  }
  const t = tex(c, true, true);
  t.anisotropy = 16;
  return t;
}

/** Asphalt with aggregate, patches and sealed cracks. One tile = 12 m. */
function asphaltTexture(): THREE.Texture {
  const S = 512;
  const [c, g] = canvas(S, S);
  const r = rng(53);
  g.fillStyle = '#3a3a3a';
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 40000; k++) {
    const v = r();
    g.fillStyle = v < 0.55 ? `rgba(15,15,15,${0.2 + r() * 0.3})` : `rgba(150,146,140,${0.1 + r() * 0.25})`;
    g.fillRect(r() * S, r() * S, 1 + r(), 1 + r());
  }
  for (let k = 0; k < 8; k++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '20,20,20' : '90,88,84'},${0.12 + r() * 0.1})`;
    g.fillRect(r() * S, r() * S, 30 + r() * 90, 20 + r() * 60);
  }
  g.strokeStyle = 'rgba(8,8,8,0.7)';
  g.lineWidth = 2.5;
  for (let k = 0; k < 7; k++) {
    let x = r() * S, y = r() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 10; s++) {
      x += (r() - 0.5) * 40;
      y += (r() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const t = tex(c, true, true);
  t.anisotropy = 16;
  return t;
}

/** Mown grass, late in the day: warm greens and dry patches. One tile = 6 m. */
function grassTexture(): THREE.Texture {
  const S = 512;
  const [c, g] = canvas(S, S);
  const r = rng(61);
  g.fillStyle = '#5b6b35';
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 220; k++) {
    const x = r() * S, y = r() * S, rad = 12 + r() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const dry = r() < 0.4;
    gr.addColorStop(0, dry ? `rgba(150,140,70,${0.18 + r() * 0.2})` : `rgba(40,70,25,${0.18 + r() * 0.2})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // blades
  for (let k = 0; k < 26000; k++) {
    const x = r() * S, y = r() * S;
    const l = 2 + r() * 4;
    const v = r();
    g.strokeStyle = v < 0.45 ? `rgba(30,52,18,${0.35 + r() * 0.3})` : v < 0.85 ? `rgba(110,130,60,${0.3 + r() * 0.3})` : `rgba(170,160,90,${0.3 + r() * 0.3})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 2, y - l);
    g.stroke();
  }
  const t = tex(c, true, true);
  t.anisotropy = 16;
  return t;
}

/** A conifer or a broadleaf tree on a transparent background. */
function treeTexture(kind: 'pine' | 'broad', seed: number): THREE.Texture {
  const Wd = 256, Ht = 512;
  const [c, g] = canvas(Wd, Ht);
  const r = rng(seed);
  g.clearRect(0, 0, Wd, Ht);
  const cx = Wd / 2;
  if (kind === 'pine') {
    g.fillStyle = '#3a2a1c';
    g.fillRect(cx - 5, Ht * 0.72, 10, Ht * 0.28);
    // tiers of drooping branches, widest at the bottom
    const tiers = 34;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const y = Ht * 0.04 + t * Ht * 0.8;
      const w = (Wd * 0.46) * Math.pow(t, 0.85) * (0.8 + r() * 0.35) + 6;
      for (const side of [-1, 1]) {
        const n = 7;
        for (let k = 0; k < n; k++) {
          const f = k / n;
          const x0 = cx + side * w * f;
          const lit = side < 0 ? 0.25 + r() * 0.2 : 0;
          const base = 22 + r() * 18;
          g.fillStyle = `rgb(${base + 10 + lit * 90},${base + 34 + lit * 70},${base + 8 + lit * 30})`;
          g.beginPath();
          g.ellipse(x0, y + f * 10 + r() * 4, 7 + r() * 7, 4 + r() * 5, side * 0.35, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  } else {
    g.fillStyle = '#4a3826';
    g.beginPath();
    g.moveTo(cx - 7, Ht);
    g.lineTo(cx - 3, Ht * 0.45);
    g.lineTo(cx + 3, Ht * 0.45);
    g.lineTo(cx + 7, Ht);
    g.fill();
    // leaf clumps in a rounded crown
    for (let k = 0; k < 900; k++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r());
      const x = cx + Math.cos(a) * rr * Wd * 0.44;
      const y = Ht * 0.36 + Math.sin(a) * rr * Ht * 0.3;
      const lit = Math.max(0, (cx - x) / Wd + (Ht * 0.36 - y) / Ht) * 1.4;
      const base = 26 + r() * 22;
      g.fillStyle = `rgb(${base + 18 + lit * 90},${base + 40 + lit * 70},${base + 6 + lit * 20})`;
      g.beginPath();
      g.arc(x, y, 5 + r() * 8, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = tex(c, true, false);
  t.anisotropy = 4;
  return t;
}

function textTexture(text: string, w: number, h: number, fg: string, bg: string, font = 'bold 150px Arial'): THREE.Texture {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 6);
  return tex(c);
}

// ---------------------------------------------------------------------------
// aerial perspective: warm glare toward the low sun, cool blue-grey haze elsewhere
// ---------------------------------------------------------------------------

const HAZE = {
  hazeSun: { value: new THREE.Vector3(0, 0.1, -1) },
  hazeSunCol: { value: new THREE.Color(1.0, 0.62, 0.34).multiplyScalar(1.25) },
  hazeSkyCol: { value: new THREE.Color(0.55, 0.58, 0.68).multiplyScalar(0.95) },
  hazeDen: { value: 1 / 8500 },
};

/** Replace three's fog on a material with the directional haze (world-space distance from the camera). */
function hazed<T extends THREE.MeshStandardMaterial>(m: T): T {
  m.fog = false;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HAZE);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazeW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 hp = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
          hp = instanceMatrix * hp;
          #endif
          vHazeW = ( modelMatrix * hp ).xyz;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazeW;\nuniform vec3 hazeSun;\nuniform vec3 hazeSunCol;\nuniform vec3 hazeSkyCol;\nuniform float hazeDen;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        {
          vec3 hv = vHazeW - cameraPosition;
          float hd = length( hv );
          vec3 hdir = hv / max( hd, 1.0 );
          float toSun = max( dot( hdir, hazeSun ), 0.0 );
          vec3 hc = mix( hazeSkyCol, hazeSunCol, pow( toSun, 5.0 ) * 0.85 + pow( toSun, 40.0 ) * 0.6 );
          float hf = 1.0 - exp( -hd * hazeDen );
          // thinner haze high up: the peaks stand out of it
          hf *= mix( 1.0, 0.55, smoothstep( 0.0, 2200.0, vHazeW.y ) );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, hc, hf );
        }`,
      );
  };
  m.customProgramCacheKey = () => 'haze-v1';
  return m;
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

export function buildOutside(parent: THREE.Group, scene: THREE.Scene, sunTo: THREE.Vector3, D2: number, quality: string): Outside {
  const B = new Batch();
  HAZE.hazeSun.value.copy(sunTo).normalize();
  const root = new THREE.Group();
  root.name = 'outside';
  parent.add(root);
  const low = quality === 'low';

  // --- materials -----------------------------------------------------------------------------------------
  const concrete = hazed(new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.88 }));
  const asphalt = hazed(new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 }));
  const grassMap = grassTexture();
  const paintY = hazed(new THREE.MeshStandardMaterial({ color: 0xd9a81c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const paintW = hazed(new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const paintR = new THREE.MeshStandardMaterial({ color: 0xa82020, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const wallC = hazed(new THREE.MeshStandardMaterial({ color: 0xb7b3aa, roughness: 0.85 }));
  const cladG = hazed(new THREE.MeshStandardMaterial({ color: 0x8d969b, roughness: 0.5, metalness: 0.45 }));
  const cladW = hazed(new THREE.MeshStandardMaterial({ color: 0xd2d4d2, roughness: 0.55, metalness: 0.3 }));
  const roofM = hazed(new THREE.MeshStandardMaterial({ color: 0x6d7479, roughness: 0.45, metalness: 0.55 }));
  const hasC = hazed(new THREE.MeshStandardMaterial({ color: 0x8e8a7c, roughness: 0.92 }));
  const steel = hazed(new THREE.MeshStandardMaterial({ color: 0x5c656c, roughness: 0.5, metalness: 0.6 }));
  const white = hazed(new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.5, metalness: 0.1 }));
  const dark = hazed(new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.7 }));
  const rubber = hazed(new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 }));
  const yellowV = hazed(new THREE.MeshStandardMaterial({ color: 0xe0ab12, roughness: 0.45, metalness: 0.2 }));
  const redV = hazed(new THREE.MeshStandardMaterial({ color: 0xa31d1d, roughness: 0.4, metalness: 0.2 }));
  const tankM = hazed(new THREE.MeshStandardMaterial({ color: 0xc9ccce, roughness: 0.28, metalness: 0.85 }));
  const glassT = hazed(new THREE.MeshStandardMaterial({ color: 0x2a3a44, roughness: 0.06, metalness: 0.9, envMapIntensity: 1.6 }));
  const orangeW = hazed(new THREE.MeshStandardMaterial({ color: 0xe35d12, roughness: 0.8 }));
  const lampW = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.93, 0.8).multiplyScalar(5) });
  const lampB = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.45, 1).multiplyScalar(5) });
  const lampR = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.08).multiplyScalar(5) });
  const winLit = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.84, 0.6).multiplyScalar(1.4) });
  const interiorDark = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.3, 0.25) });

  const flat = (mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, uvScale: number) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).applyMatrix4(at((x0 + x1) / 2, y, (z0 + z1) / 2, 0, -Math.PI / 2));
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / uvScale, p.getZ(i) / uvScale);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  /** painted line from a to b on the ground */
  const line = (mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, w: number, y = 0.02) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    B.add(mat, new THREE.PlaneGeometry(w, len).applyMatrix4(at((x0 + x1) / 2, y, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0), -Math.PI / 2)));
  };

  // --- ground --------------------------------------------------------------------------------------------------
  // grass everywhere, with a large-scale variation of lush and dry patches in the vertex colours
  {
    const size = 36000, seg = low ? 90 : 160;
    const g = new THREE.PlaneGeometry(size, size, seg, seg).applyMatrix4(at(0, -0.06, 0, 0, -Math.PI / 2));
    const p = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      uv.setXY(i, x / 6, z / 6);
      const n = fbm(x / 900, z / 900, 5, 4);
      const d = fbm(x / 160, z / 160, 9, 3);
      const k = 0.78 + 0.35 * n + 0.12 * d;
      col[i * 3] = k * (1.0 + 0.25 * (n - 0.5));
      col[i * 3 + 1] = k;
      col[i * 3 + 2] = k * (0.9 - 0.2 * (n - 0.5));
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, hazed(new THREE.MeshStandardMaterial({ map: grassMap, vertexColors: true, roughness: 1 })));
    m.receiveShadow = true;
    root.add(m);
  }
  // apron: from the hangar doors out to the taxiway
  const AZ0 = -D2 - 0.4, AZ1 = -152;
  flat(concrete, -175, 175, AZ1, AZ0, -0.01, 30);
  // taxiway along the front of the apron, and the runway beyond
  const TZ0 = -152, TZ1 = -176, TC = (TZ0 + TZ1) / 2;
  flat(asphalt, -1400, 1400, TZ1, TZ0, -0.015, 12);
  const RZ0 = -318, RZ1 = -363, RC = (RZ0 + RZ1) / 2;
  flat(asphalt, -2400, 2400, RZ1, RZ0, -0.015, 12);
  // a connecting taxiway from ours to the runway
  flat(asphalt, -330, -305, RZ0, TZ1, -0.016, 12);
  flat(asphalt, 380, 405, RZ0, TZ1, -0.016, 12);

  // markings: taxiway centreline and edges, runway centreline dashes and edges
  line(paintY, -1400, TC, 1400, TC, 0.3);
  for (const z of [TZ0 + 0.6, TZ0 + 0.9, TZ1 - 0.6, TZ1 - 0.9]) line(paintY, -1400, z, -40, z, 0.15);
  for (const z of [TZ1 - 0.6, TZ1 - 0.9]) line(paintY, -40, z, 1400, z, 0.15);
  for (const z of [RZ0 + 1.2, RZ1 - 1.2]) line(paintW, -2400, z, 2400, z, 0.9);
  for (let x = -2400; x < 2400; x += 60) line(paintW, x, RC, x + 36, RC, 0.9);
  for (const x of [-317.5, 392.5]) line(paintY, x, TZ1, x, RZ0, 0.3);
  // runway hold-short bars on the connectors
  for (const x of [-317.5, 392.5]) for (const dz of [0, 0.6, 1.8, 2.4]) line(paintY, x - 12, RZ0 + 20 + dz, x + 12, RZ0 + 20 + dz, 0.15);
  // apron: lead-in lines from the taxiway to two parking stands, stand numbers, and our hangar's lead-in
  const stands: [number, number, number][] = [
    [-26, -70, 0.62],
    [30, -88, -0.5],
  ];
  for (const [sx, sz, hd] of stands) {
    const pts: THREE.Vector3[] = [];
    const a = V(sx - Math.sin(hd) * 45, 0, TZ0 + 8), c2 = V(sx, 0, sz);
    const cp = V(sx - Math.sin(hd) * 12, 0, sz - 22);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new THREE.Vector3().copy(a).multiplyScalar((1 - t) * (1 - t)).addScaledVector(cp, 2 * t * (1 - t)).addScaledVector(c2, t * t));
    }
    for (let i = 0; i < pts.length - 1; i++) line(paintY, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, 0.25);
    // stop bar and the stand box
    line(paintY, sx - 2, sz + 2, sx + 2, sz + 2, 0.4);
    for (const d of [-1, 1]) line(paintR, sx + d * 9, sz - 12, sx + d * 9, sz + 12, 0.2);
  }
  {
    const t1 = textTexture('A3', 256, 256, '#e3b21c', 'rgba(0,0,0,0)');
    const t2 = textTexture('A4', 256, 256, '#e3b21c', 'rgba(0,0,0,0)');
    for (const [t, [sx, sz]] of [[t1, stands[0]], [t2, stands[1]]] as [THREE.Texture, [number, number, number]][]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(sx, 0.03, sz + 5);
      root.add(m);
    }
  }

  // --- lights along the taxiway and runway (they are on: it is getting late) -------------------------------------
  for (let x = -1400; x <= 1400; x += 30)
    for (const z of [TZ0 + 1.6, TZ1 - 1.6]) {
      B.add(dark, cyl(0.05, 0.05, 0.3, 6).applyMatrix4(at(x, 0.15, z)));
      B.add(lampB, cyl(0.09, 0.09, 0.12, 8).applyMatrix4(at(x, 0.35, z)));
    }
  for (let x = -2400; x <= 2400; x += 60)
    for (const z of [RZ0 + 3, RZ1 - 3]) {
      B.add(dark, cyl(0.06, 0.06, 0.35, 6).applyMatrix4(at(x, 0.17, z)));
      B.add(lampW, cyl(0.12, 0.12, 0.14, 8).applyMatrix4(at(x, 0.42, z)));
    }
  // taxiway signs: black-on-yellow location and yellow-on-black direction boards on frangible legs
  {
    const signs: [string, string, number, number][] = [
      ['A', '#111', -20, TZ0 + 7],
      ['← B  A3', '#111', -70, TZ0 + 7],
      ['A4  C →', '#111', 90, TZ0 + 7],
      ['28-10', '#fff', -330, RZ0 + 26],
      ['28-10', '#fff', 405, RZ0 + 26],
    ];
    for (const [txt, fg, x, z] of signs) {
      const red = fg === '#fff';
      const t = textTexture(txt, 512, 160, red ? '#fff' : '#111', red ? '#b01818' : '#e7b81c', 'bold 110px Arial');
      const w = 0.9 + txt.length * 0.42;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
      m.position.set(x, 1.0, z + 0.14);
      root.add(m);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
      back.position.set(x, 1.0, z - 0.14);
      back.rotation.y = Math.PI;
      root.add(back);
      B.add(dark, box(w + 0.1, 1.2, 0.26).applyMatrix4(at(x, 1.0, z)));
      for (const dx of [-w / 3, w / 3]) B.add(steel, cyl(0.04, 0.04, 0.45, 6).applyMatrix4(at(x + dx, 0.22, z)));
    }
  }

  // --- apron floodlight masts ----------------------------------------------------------------------------------------
  for (const [x, z] of [
    [-62, -58],
    [66, -58],
    [-62, -128],
    [66, -128],
  ]) {
    B.add(steel, cyl(0.28, 0.5, 26, 12).applyMatrix4(at(x, 13, z)));
    B.add(steel, box(4.2, 0.25, 0.6).applyMatrix4(at(x, 26.2, z)));
    for (const dx of [-1.5, -0.5, 0.5, 1.5]) {
      B.add(dark, box(0.8, 0.5, 0.55).applyMatrix4(at(x + dx, 26.6, z, 0, -0.4)));
      B.add(lampW, box(0.7, 0.05, 0.45).applyMatrix4(at(x + dx, 26.34, z + 0.1, 0, -0.4)));
    }
    B.add(dark, box(0.6, 1.0, 0.4).applyMatrix4(at(x, 1.2, z + 0.5)));
  }

  // --- the neighbouring hangar (left), doors part open onto a lit bay ------------------------------------------------
  {
    const hx = -110, hz = -96, w = 44, d = 64, h = 16;
    // walls with a barrel-vault roof
    B.add(cladG, box(w, h, 0.4).applyMatrix4(at(hx, h / 2, hz + d / 2)));
    B.add(cladG, box(w, h, 0.4).applyMatrix4(at(hx, h / 2, hz - d / 2)));
    B.add(cladG, box(0.4, h, d).applyMatrix4(at(hx - w / 2, h / 2, hz)));
    // front (facing +x): door opening 34 m wide, 13 m high
    B.add(cladG, box(0.4, h - 13, d).applyMatrix4(at(hx + w / 2, 13 + (h - 13) / 2, hz)));
    for (const s of [-1, 1]) B.add(cladG, box(0.4, 13, (d - 34) / 2).applyMatrix4(at(hx + w / 2, 6.5, hz + s * (17 + (d - 34) / 4))));
    // door leaves: two closed, the middle two slid apart
    for (const [dz, open] of [
      [-12.75, false],
      [-4.25, true],
      [4.25, true],
      [12.75, false],
    ] as [number, boolean][]) {
      const zz = hz + dz + (open ? Math.sign(dz) * 6.5 : 0);
      B.add(cladW, box(0.3, 12.8, 8.4).applyMatrix4(at(hx + w / 2 + (open ? 0.9 : 0.55), 6.4, zz)));
      for (const y of [0.4, 6.4, 12.4]) B.add(steel, box(0.34, 0.2, 8.4).applyMatrix4(at(hx + w / 2 + (open ? 0.9 : 0.55), y, zz)));
    }
    // the lit bay behind the gap
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 12.4), winLit);
    bay.position.set(hx + w / 2 - 6, 6.2, hz);
    bay.rotation.y = Math.PI / 2;
    root.add(bay);
    B.add(interiorDark, box(0.2, 12.8, 17).applyMatrix4(at(hx + w / 2 - 6.2, 6.4, hz)));
    B.add(interiorDark, box(6, 0.2, 17).applyMatrix4(at(hx + w / 2 - 3, 12.8, hz)));
    // vaulted roof: a half-cylinder along z
    const roof = new THREE.CylinderGeometry(w / 2 + 0.3, w / 2 + 0.3, d + 1, 40, 1, true, -Math.PI / 2, Math.PI);
    roof.applyMatrix4(new THREE.Matrix4().makeScale(1, 0.26, 1));
    B.add(roofM, roof.applyMatrix4(at(hx, h, hz, 0, Math.PI / 2)));
    for (let k = -3; k <= 3; k++) B.add(steel, box(0.5, 0.5, 0.5).applyMatrix4(at(hx + w / 2 + 0.3, 13.5, hz + k * 8)));
    // big number on the gable and a row of lights over the door
    const num = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardMaterial({ map: textTexture('H2', 512, 256, '#1c2226', '#d2d4d2', 'bold 180px Arial'), roughness: 0.6 }));
    num.position.set(hx + w / 2 + 0.22, 14.5, hz + 22);
    num.rotation.y = Math.PI / 2;
    root.add(num);
    for (let k = -3; k <= 3; k++) B.add(lampW, box(0.1, 0.25, 0.8).applyMatrix4(at(hx + w / 2 + 0.35, 13.2, hz + k * 4.6)));
  }

  // --- hardened aircraft shelters (right) --------------------------------------------------------------------------------
  for (const [sx, sz] of [
    [78, -124],
    [124, -124],
  ]) {
    const rr = 13;
    // concrete arch along z (its door faces the taxiway, -z)
    const arch = new THREE.CylinderGeometry(rr, rr, 34, 40, 1, true, -Math.PI / 2, Math.PI);
    arch.applyMatrix4(new THREE.Matrix4().makeScale(1, 0.62, 1));
    B.add(hasC, arch.applyMatrix4(at(sx, 0, sz + 6, 0, Math.PI / 2)));
    // the back wall and the grassy earth berm around it
    B.add(hasC, new THREE.CircleGeometry(rr, 40, 0, Math.PI).applyMatrix4(new THREE.Matrix4().makeScale(1, 0.62, 1)).applyMatrix4(at(sx, 0, sz + 23)));
    // front door: heavy sliding steel leaves in a concrete frame
    B.add(hasC, box(rr * 2 + 2, 8.6, 1.2).applyMatrix4(at(sx, 4.3, sz - 11.2)));
    B.add(steel, box(rr * 2 - 3, 7.4, 0.8).applyMatrix4(at(sx, 3.7, sz - 11.9)));
    for (let k = -3; k <= 3; k++) B.add(dark, box(0.12, 7.4, 0.84).applyMatrix4(at(sx + k * 3.2, 3.7, sz - 11.9)));
    // blast deflector at the back
    B.add(hasC, box(10, 5, 1.2).applyMatrix4(at(sx, 2.5, sz + 30)));
  }

  // --- control tower, operations building and a turning radar (across the taxiway) ----------------------------------
  let radar: THREE.Group | null = null;
  {
    const tx = -48, tz = -238;
    // shaft, balcony and the glass cab
    B.add(wallC, box(6, 30, 6).applyMatrix4(at(tx, 15, tz)));
    for (let y = 3; y < 29; y += 3.2) B.add(winLit, box(0.9, 1.3, 6.05).applyMatrix4(at(tx + 2.3, y, tz)));
    B.add(white, box(12, 0.5, 12).applyMatrix4(at(tx, 30.25, tz)));
    const cab = new THREE.CylinderGeometry(5.8, 5.0, 4.2, 8);
    B.add(glassT, cab.applyMatrix4(at(tx, 32.6, tz)));
    B.add(white, cyl(6.2, 6.2, 0.6, 8).applyMatrix4(at(tx, 35, tz)));
    B.add(steel, cyl(0.1, 0.1, 5, 6).applyMatrix4(at(tx + 2, 37.8, tz)));
    B.add(lampR, new THREE.SphereGeometry(0.25, 10, 8).applyMatrix4(at(tx + 2, 40.4, tz)));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      B.add(white, box(0.25, 4.2, 0.25).applyMatrix4(at(tx + Math.cos(a) * 5.5, 32.6, tz + Math.sin(a) * 5.5)));
    }
    // operations block beside it, two storeys with windows lit
    const ox = tx + 34;
    B.add(wallC, box(52, 8, 16).applyMatrix4(at(ox, 4, tz)));
    B.add(dark, box(52.4, 0.5, 16.4).applyMatrix4(at(ox, 8.2, tz)));
    for (const y of [2.2, 5.8]) for (let k = -12; k <= 12; k++) B.add(k % 3 === 0 ? dark : winLit, box(1.4, 1.4, 0.1).applyMatrix4(at(ox + k * 2, y, tz + 8.02)));
    for (let k = 0; k < 4; k++) B.add(steel, box(2.2, 1.2, 1.6).applyMatrix4(at(ox - 18 + k * 9, 9.1, tz)));
    // radar on a lattice mast
    const rx = 140, rz = -262;
    for (const [dx, dz] of [
      [-1.6, -1.6],
      [1.6, -1.6],
      [1.6, 1.6],
      [-1.6, 1.6],
    ]) B.add(steel, beam(V(rx + dx * 1.6, 0, rz + dz * 1.6), V(rx + dx * 0.5, 18, rz + dz * 0.5), 0.18));
    for (let y = 3; y < 18; y += 3)
      for (let s = 0; s < 4; s++) {
        const f = 1.6 - (y / 18) * 1.1;
        const pts = [V(-f, y, -f), V(f, y, -f), V(f, y, f), V(-f, y, f)];
        const a = pts[s], b = pts[(s + 1) % 4];
        B.add(steel, beam(a.clone().add(V(rx, 0, rz)), b.clone().add(V(rx, 0, rz)), 0.1));
      }
    B.add(white, box(2.2, 1.2, 2.2).applyMatrix4(at(rx, 18.6, rz)));
    radar = new THREE.Group();
    radar.position.set(rx, 19.4, rz);
    const antM = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6, 2.2, 24, 1, true, -0.7, 1.4).applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 0.35)),
      new THREE.MeshStandardMaterial({ color: 0xd8dada, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }),
    );
    antM.position.set(0, 1.4, -1.2);
    antM.castShadow = true;
    radar.add(antM);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.4, 12), steel);
    radar.add(hub);
    root.add(radar);
    // a low fire station and fuel farm to the right
    B.add(wallC, box(40, 7, 18).applyMatrix4(at(80, 3.5, -232)));
    for (let k = -2; k <= 2; k++) {
      B.add(redV, box(6, 5.2, 0.2).applyMatrix4(at(80 + k * 7.5, 2.6, -222.9)));
      B.add(white, box(6.4, 0.3, 0.3).applyMatrix4(at(80 + k * 7.5, 5.4, -222.9)));
    }
    for (let k = 0; k < 3; k++) {
      B.add(white, cyl(7, 7, 10, 28).applyMatrix4(at(-150 + k * 17, 5, -250)));
      B.add(white, cyl(7.1, 5.5, 1.2, 28).applyMatrix4(at(-150 + k * 17, 10.6, -250)));
    }
  }

  // --- windsock by the runway ----------------------------------------------------------------------------------------
  const sock = new THREE.Group();
  {
    const x = 210, z = RZ0 + 40;
    B.add(white, cyl(0.12, 0.16, 7, 8).applyMatrix4(at(x, 3.5, z)));
    sock.position.set(x, 6.9, z);
    for (let k = 0; k < 5; k++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.45 - k * 0.06, 0.45 - (k + 1) * 0.06, 0.75, 14, 1, true), k % 2 ? white : orangeW);
      seg.rotation.z = Math.PI / 2;
      seg.position.set(0.38 + k * 0.75, 0, 0);
      sock.add(seg);
    }
    sock.rotation.y = 0.9;
    root.add(sock);
  }

  // --- vehicles on the apron: a fuel bowser, a tug and a follow-me pickup -----------------------------------------
  const vehicle = (m: THREE.Matrix4, fn: (P: (mat: THREE.Material, g: THREE.BufferGeometry) => void) => void) => fn((mat, g) => B.add(mat, g.applyMatrix4(m)));
  vehicle(at(-6, 0, -58, 2.2), (P) => {
    // fuel bowser: cab, chassis, polished tank, hose reel at the back
    P(white, box(2.5, 2.2, 2.4).applyMatrix4(at(0, 1.75, -4.3)));
    P(dark, box(2.4, 0.9, 0.08).applyMatrix4(at(0, 2.2, -5.52)));
    P(dark, box(0.08, 0.8, 1.4).applyMatrix4(at(1.26, 2.2, -4.4)));
    P(dark, box(0.08, 0.8, 1.4).applyMatrix4(at(-1.26, 2.2, -4.4)));
    P(steel, box(2.4, 0.5, 11).applyMatrix4(at(0, 0.85, 0)));
    P(tankM, cyl(1.25, 1.25, 7.4, 28).applyMatrix4(at(0, 2.3, 1.2, 0, Math.PI / 2)));
    for (const z of [-2.5, 4.9]) P(tankM, new THREE.SphereGeometry(1.25, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).applyMatrix4(at(0, 2.3, z, 0, z < 0 ? -Math.PI / 2 : Math.PI / 2)));
    P(steel, box(2.5, 0.12, 7.6).applyMatrix4(at(0, 3.62, 1.2)));
    P(redV, box(2.45, 0.35, 0.05).applyMatrix4(at(0, 2.3, 4.95)));
    P(dark, cyl(0.45, 0.45, 1.8, 16).applyMatrix4(at(0, 1.3, 5.2, 0, 0, Math.PI / 2)));
    for (const z of [-4.3, 1.8, 3.4]) for (const x of [-1.1, 1.1]) P(rubber, cyl(0.52, 0.52, 0.4, 18).applyMatrix4(at(x, 0.52, z, 0, 0, Math.PI / 2)));
    P(lampW, box(0.3, 0.2, 0.05).applyMatrix4(at(0.9, 1.3, -5.55)));
    P(lampW, box(0.3, 0.2, 0.05).applyMatrix4(at(-0.9, 1.3, -5.55)));
    P(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.05).multiplyScalar(4) }), box(0.6, 0.15, 0.3).applyMatrix4(at(0, 2.95, -4.3)));
  });
  vehicle(at(18, 0, -52, -0.7), (P) => {
    // aircraft tug
    P(yellowV, box(2.1, 0.9, 4.2).applyMatrix4(at(0, 0.75, 0)));
    P(yellowV, box(1.9, 1.1, 1.3).applyMatrix4(at(0, 1.7, 1.2)));
    P(dark, box(1.8, 0.7, 1.32).applyMatrix4(at(0, 1.85, 1.2)));
    P(dark, box(2.2, 0.3, 0.3).applyMatrix4(at(0, 0.6, -2.2)));
    for (const z of [-1.4, 1.4]) for (const x of [-1.05, 1.05]) P(rubber, cyl(0.48, 0.48, 0.36, 18).applyMatrix4(at(x, 0.48, z, 0, 0, Math.PI / 2)));
    P(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.05).multiplyScalar(4) }), cyl(0.1, 0.1, 0.18, 10).applyMatrix4(at(0.6, 2.35, 1.4)));
  });
  vehicle(at(46, 0, -40, 0.25), (P) => {
    // follow-me pickup, checkered tailgate
    P(yellowV, box(1.9, 0.8, 5.2).applyMatrix4(at(0, 0.95, 0)));
    P(yellowV, box(1.8, 0.8, 2.2).applyMatrix4(at(0, 1.75, -0.9)));
    P(dark, box(1.82, 0.55, 2.0).applyMatrix4(at(0, 1.8, -0.9)));
    P(dark, box(1.7, 0.08, 2.4).applyMatrix4(at(0, 1.38, 1.4)));
    for (const z of [-1.7, 1.7]) for (const x of [-0.9, 0.9]) P(rubber, cyl(0.38, 0.38, 0.28, 16).applyMatrix4(at(x, 0.38, z, 0, 0, Math.PI / 2)));
    P(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.05).multiplyScalar(4) }), box(1.2, 0.12, 0.25).applyMatrix4(at(0, 2.2, -0.9)));
  });
  // blast fence along the far side of the taxiway, jersey barriers by the shelters
  for (let x = -60; x < 200; x += 4) B.add(steel, box(3.9, 3, 0.1).applyMatrix4(at(x, 1.5, TZ1 - 24, 0, -0.35)));
  for (let x = 58; x < 150; x += 3.2) B.add(wallC, box(3, 0.8, 0.6).applyMatrix4(at(x, 0.4, -106)));

  // --- jets parked on the apron stands ---------------------------------------------------------------------------------
  const parked: { vis: ReturnType<typeof createAirframe> }[] = [];
  if (!low) {
    const types: AircraftType[] = ['F15EX', 'TYPHOON'];
    stands.forEach(([sx, sz, hd], i) => {
      const ac = new Aircraft(types[i], 'blue', 'STAND');
      ac.fm.gearPos = 1;
      ac.fm.rpm.fill(0);
      ac.fm.pos.set(sx, ac.spec.gear.height + 0.12, sz);
      const vis = createAirframe(ac, false);
      vis.update(0.016);
      vis.root.position.set(sx, ac.spec.gear.height + 0.12, sz);
      vis.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI - hd);
      vis.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (m.name === 'shadow-proxy') m.visible = false;
        else if (!(m.material as THREE.Material).transparent) m.castShadow = true;
      });
      root.add(vis.root);
      parked.push({ vis });
      // chocks and cones around it
      const s = ac.spec;
      const rot = new THREE.Matrix4().makeRotationY(Math.PI - hd);
      const place = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(rot).add(V(sx, 0, sz));
      for (const [x, z] of [
        [0, s.gear.nose],
        [-s.gear.track, s.gear.main],
        [s.gear.track, s.gear.main],
      ]) {
        for (const dz of [-0.55, 0.55]) {
          const p = place(x, z + dz);
          B.add(yellowV, box(0.3, 0.2, 0.28).applyMatrix4(at(p.x, 0.1, p.z, Math.PI - hd)));
        }
      }
      for (const [x, z] of [
        [-s.span / 2 - 0.8, 1.5],
        [s.span / 2 + 0.8, 1.5],
        [0, -s.length / 2 - 2],
      ]) {
        const p = place(x, z);
        B.add(orangeW, cyl(0.03, 0.2, 0.7, 12).applyMatrix4(at(p.x, 0.38, p.z)));
        B.add(white, cyl(0.1, 0.14, 0.12, 12).applyMatrix4(at(p.x, 0.4, p.z)));
      }
    });
  }

  // --- trees: instanced crossed cards, pines and broadleaves in belts and groves -----------------------------------------
  {
    const card = (): THREE.BufferGeometry => {
      // two crossed quads, 1 wide and 1 tall, standing on y = 0; normals bend outward so the crown shades round
      const pos: number[] = [], nor: number[] = [], uv: number[] = [];
      for (const a of [0, Math.PI / 2]) {
        const cx = Math.cos(a), cz = Math.sin(a);
        const q = [
          [-0.5, 0, 0, 0],
          [0.5, 0, 1, 0],
          [0.5, 1, 1, 1],
          [-0.5, 0, 0, 0],
          [0.5, 1, 1, 1],
          [-0.5, 1, 0, 1],
        ];
        for (const [s, y, u, v] of q) {
          pos.push(cx * s, y, cz * s);
          const n = new THREE.Vector3(cx * s * 1.6, 0.55, cz * s * 1.6).normalize();
          nor.push(n.x, n.y, n.z);
          uv.push(u, v);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return g;
    };
    const kinds: { t: THREE.Texture; aspect: number; n: number; hMin: number; hMax: number }[] = [
      { t: treeTexture('pine', 3), aspect: 0.5, n: low ? 700 : 1800, hMin: 11, hMax: 24 },
      { t: treeTexture('broad', 5), aspect: 0.62, n: low ? 400 : 1000, hMin: 8, hMax: 16 },
    ];
    const r = rng(77);
    for (const k of kinds) {
      const mat = hazed(new THREE.MeshStandardMaterial({ map: k.t, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.95 }));
      const mesh = new THREE.InstancedMesh(card(), mat, k.n);
      const m4 = new THREE.Matrix4();
      let placed = 0, tries = 0;
      while (placed < k.n && tries < k.n * 30) {
        tries++;
        // anywhere outside the airfield, denser in belts
        const a = r() * Math.PI * 2;
        const R = 250 + Math.pow(r(), 1.3) * 1600;
        const x = Math.sin(a) * R, z = Math.cos(a) * R;
        if (z > -200 && z < 120 && Math.abs(x) < 220) continue;
        if (z < RZ0 + 60 && z > RZ1 - 90) continue;
        if (z < TZ0 + 10 && z > TZ1 - 30 && Math.abs(x) < 1400) continue;
        if (fbm(x / 260, z / 260, 13, 3) < 0.5) continue;
        const h = k.hMin + r() * (k.hMax - k.hMin);
        m4.compose(new THREE.Vector3(x, -0.05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI), new THREE.Vector3(h * k.aspect * (0.85 + r() * 0.3), h, h * k.aspect));
        mesh.setMatrixAt(placed++, m4);
      }
      mesh.count = placed;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      root.add(mesh);
    }
  }

  // --- mountains: 3D ranges on every side, low near the airfield, big and snow-capped far off -------------------------
  {
    const NA = low ? 240 : 420, radii: number[] = [];
    for (let rr = 1700; rr < 17000; rr *= 1.075) radii.push(rr);
    const NR = radii.length;
    const pos = new Float32Array((NA + 1) * NR * 3);
    const col = new Float32Array((NA + 1) * NR * 3);
    const sunAz = Math.atan2(sunTo.x, sunTo.z);
    const hgt = (x: number, z: number, rr: number, az: number) => {
      const near = smooth(1700, 3500, rr);
      // keep a lower pass toward the setting sun so it still shows over the ridges
      let da = Math.abs(az - sunAz);
      if (da > Math.PI) da = Math.PI * 2 - da;
      const pass = 0.3 + 0.7 * smooth(0.1, 0.6, da);
      const hills = (50 + 240 * fbm(x / 1400, z / 1400, 21, 5)) * near * (0.35 + 0.65 * smooth(0.06, 0.4, da));
      const far = smooth(4500, 9000, rr) * (1 - smooth(14500, 17000, rr));
      const peaks = 2400 * ridged(x / 7000, z / 7000, 33, 6) * far * pass;
      return hills + peaks * (0.55 + 0.45 * fbm(x / 20000, z / 20000, 44, 2));
    };
    for (let j = 0; j < NR; j++) {
      for (let i = 0; i <= NA; i++) {
        const az = (i / NA) * Math.PI * 2;
        const rr = radii[j] * (1 + 0.04 * Math.sin(az * 7 + j));
        const x = Math.sin(az) * rr, z = Math.cos(az) * rr;
        const y = j === 0 ? -0.5 : hgt(x, z, rr, az);
        const k = (j * (NA + 1) + i) * 3;
        pos[k] = x;
        pos[k + 1] = y;
        pos[k + 2] = z;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < NR - 1; j++)
      for (let i = 0; i < NA; i++) {
        const a = j * (NA + 1) + i, b = a + 1, c = a + NA + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let v = 0; v < pos.length / 3; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const slope = 1 - nrm.getY(v);
      const n = fbm(x / 600, z / 600, 55, 3);
      // forest low down, rock on steep ground and high up, snow on the high gentle slopes
      const forest = [0.07 + 0.03 * n, 0.1 + 0.04 * n, 0.055];
      const rock = [0.3 + 0.08 * n, 0.27 + 0.07 * n, 0.24 + 0.06 * n];
      const snow = [0.86, 0.88, 0.93];
      const tRock = smooth(0.18, 0.42, slope) * 0.8 + smooth(700, 1300, y + (n - 0.5) * 300) * 0.9;
      const tSnow = smooth(1350, 1750, y + (n - 0.5) * 400) * (1 - smooth(0.35, 0.6, slope));
      for (let c = 0; c < 3; c++) {
        let v2 = forest[c] + (rock[c] - forest[c]) * Math.min(1, tRock);
        v2 += (snow[c] - v2) * tSnow;
        col[v * 3 + c] = v2;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, hazed(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })));
    m.frustumCulled = false;
    root.add(m);
  }

  // --- sky: Preetham scattering with clouds, lit by a low sun ---------------------------------------------------------
  const sky = new Sky();
  sky.scale.setScalar(24000);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  const su = sky.material.uniforms;
  su.turbidity.value = 9;
  su.rayleigh.value = 3.2;
  su.mieCoefficient.value = 0.007;
  su.mieDirectionalG.value = 0.86;
  su.sunPosition.value.copy(sunTo).multiplyScalar(10000);
  su.cloudCoverage.value = 0.34;
  su.cloudDensity.value = 0.55;
  su.cloudElevation.value = 0.55;
  su.cloudScale.value = 0.00016;
  su.cloudSpeed.value = 0.00003;
  (su as Record<string, THREE.IUniform>).skyGain = { value: 0.6 };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('uniform float time;', 'uniform float time;\nuniform float skyGain;')
    .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * skyGain, 1.0 );');
  sky.material.needsUpdate = true;
  root.add(sky);
  // no global fog: the outdoor materials carry their own directional haze
  scene.fog = null;

  B.build(root);
  const jets = new Set<THREE.Object3D>(parked.map((p) => p.vis.root));
  const walk = (o: THREE.Object3D) => {
    if (jets.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      // far scenery never needs to cast into the hangar's shadow map
      if (m.geometry.boundingSphere && m.geometry.boundingSphere.radius > 1500) m.castShadow = false;
      // outdoors is lit by the sun and the sky, not by reflections of the hangar interior
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.isMeshStandardMaterial && mat !== glassT) mat.envMapIntensity = 0.18;
    }
    for (const c of o.children) walk(c);
  };
  walk(root);

  let t = 0;
  return {
    update(dt: number) {
      t += dt;
      su.time.value = t;
      if (radar) radar.rotation.y -= dt * 1.6;
      sock.rotation.y = 0.9 + Math.sin(t * 0.7) * 0.06;
      sock.rotation.z = -0.06 + Math.sin(t * 1.3) * 0.03;
    },
    setSunDisc(on: boolean) {
      su.showSunDisc.value = on ? 1 : 0;
    },
  };
}
