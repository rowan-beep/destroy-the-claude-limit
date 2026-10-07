// What the ground of Mars is made of, close up, as the rovers photograph it:
// fine reddish-brown dust and sand drifted into low ripples, strewn with
// pebbles and cobbles of dark grey basalt, rusty fragments and the odd pale
// stone, many half sunk in the drift. The texture tiles every 9 m and is
// sampled again at much larger scales to break up any repetition, with a
// matching normal map so every grain and pebble catches the low sunlight.
// The boulders are irregular, faceted lumps of rock in a few shapes.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const N = 1024;

function hash(x: number, y: number, s: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** tileable value noise with period p (in lattice cells) over [0, p) */
function vnoise(x: number, y: number, p: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const w = (i: number) => ((i % p) + p) % p;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(u: number, v: number, base: number, oct: number, s: number): number {
  let sum = 0, amp = 0.5, tot = 0, p = base;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u * p, v * p, p, s + o * 17);
    tot += amp;
    amp *= 0.55;
    p *= 2;
  }
  return sum / tot;
}

export interface Regolith {
  map: THREE.Texture;
  normal: THREE.Texture;
  /** the texture's mean colour (linear), so it can modulate the ground around 1 */
  mean: THREE.Color;
}

let cached: Regolith | null = null;

/** the close-up ground texture (built once, ~0.3 s) */
export function regolith(): Regolith {
  if (cached) return cached;
  const h = new Float32Array(N * N);
  const col = new Float32Array(N * N * 3);
  // the drift: fine sand mottled at several scales, raked into low ripples
  for (let y = 0; y < N; y++) {
    const v = y / N;
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const big = fbm(u, v, 4, 4, 1);
      const mid = fbm(u, v, 32, 3, 9);
      const fine = vnoise(u * 512, v * 512, 512, 23) * 0.6 + vnoise(u * 256, v * 256, 256, 29) * 0.4;
      const warp = fbm(u, v, 8, 3, 41);
      const rip = Math.sin(2 * Math.PI * (22 * u + 7 * v + 2.2 * warp));
      const ripple = Math.pow(0.5 + 0.5 * rip, 1.6) * (0.5 + 0.8 * big);
      const i = y * N + x;
      h[i] = ripple * 0.35 + mid * 0.25 + fine * 0.18;
      // dust on the crests is paler and redder; coarser, darker grains in the troughs
      const t = 0.82 + 0.3 * (big - 0.5) + 0.16 * (ripple - 0.4) + 0.12 * (fine - 0.5);
      const dark = 1 - 0.25 * Math.max(0, mid - 0.55) * 3;
      col[i * 3] = 0.6 * t * dark;
      col[i * 3 + 1] = 0.37 * t * dark * (0.96 + 0.08 * fine);
      col[i * 3 + 2] = 0.23 * t * dark * (0.92 + 0.1 * big);
    }
  }
  // the stones: many small pebbles, fewer cobbles, some sunk into the sand
  let s = 4711;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const kinds: [number, number, number][] = [
    [0.24, 0.19, 0.17], // dark basalt
    [0.3, 0.22, 0.18],
    [0.46, 0.29, 0.19], // rusty fragments
    [0.55, 0.36, 0.24],
    [0.66, 0.53, 0.41], // pale stone
  ];
  for (let k = 0; k < 5200; k++) {
    const cx = r() * N, cy = r() * N;
    const rad = 1.2 + Math.pow(r(), 3.2) * 17;
    const kind = kinds[Math.min(kinds.length - 1, Math.floor(Math.pow(r(), 1.4) * kinds.length))];
    const sink = r() * 0.6;
    const ex = 0.7 + r() * 0.6, rot = r() * Math.PI;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const bright = 0.85 + r() * 0.3;
    const R2 = Math.ceil(rad * 1.4);
    for (let dy = -R2; dy <= R2; dy++)
      for (let dx = -R2; dx <= R2; dx++) {
        const lx = (dx * ca + dy * sa) / ex, ly = (-dx * sa + dy * ca) * ex;
        const d = Math.hypot(lx, ly) / rad;
        if (d > 1.25) continue;
        const xi = (((Math.floor(cx + dx)) % N) + N) % N, yi = (((Math.floor(cy + dy)) % N) + N) % N;
        const i = yi * N + xi;
        if (d < 1) {
          const dome = Math.sqrt(1 - d * d) * rad * 0.06 - sink * rad * 0.04;
          if (dome > 0 && h[i] < 0.5 + dome) {
            h[i] = 0.5 + dome;
            // a few facets and a dusting of fines on top
            const facet = 0.85 + 0.3 * hash(Math.floor(lx * 0.6), Math.floor(ly * 0.6), k);
            const dust = 0.25 * Math.max(0, 1 - d * 1.6);
            for (let c = 0; c < 3; c++) col[i * 3 + c] = (kind[c] * facet * bright) * (1 - dust) + col[i * 3 + c] * dust;
          }
        } else {
          // a little shadowed moat of disturbed sand round each stone
          for (let c = 0; c < 3; c++) col[i * 3 + c] *= 0.93;
        }
      }
  }
  // to bytes (sRGB), and the normal map from the height
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(N, N);
  const nv = document.createElement('canvas');
  nv.width = nv.height = N;
  const ng = nv.getContext('2d')!;
  const nimg = ng.createImageData(N, N);
  const toS = (x: number) => {
    const c = Math.max(0, Math.min(1, x));
    return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
  };
  const mean = [0, 0, 0];
  const H = (x: number, y: number) => h[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const STR = 9;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      for (let c = 0; c < 3; c++) {
        img.data[i * 4 + c] = toS(col[i * 3 + c]);
        mean[c] += col[i * 3 + c];
      }
      img.data[i * 4 + 3] = 255;
      const nx = -(H(x + 1, y) - H(x - 1, y)) * STR, ny = (H(x, y + 1) - H(x, y - 1)) * STR;
      const L = Math.hypot(nx, ny, 1);
      nimg.data[i * 4] = Math.round((nx / L * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 1] = Math.round((ny / L * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 2] = Math.round((1 / L * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  ng.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.CanvasTexture(nv);
  for (const t of [map, normal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  const n2 = N * N;
  cached = { map, normal, mean: new THREE.Color(mean[0] / n2, mean[1] / n2, mean[2] / n2) };
  return cached;
}

/**
 * The ground material: the vertex colours carry the albedo maps of the
 * planet; the regolith texture modulates them around 1 at three scales (9 m,
 * 73 m and 530 m) so no repetition shows from any height.
 */
export function groundMaterial(): THREE.MeshStandardMaterial {
  const rg = regolith();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, map: rg.map, normalMap: rg.normal, normalScale: new THREE.Vector2(1.15, 1.15) });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rgMean = { value: new THREE.Vector3(rg.mean.r, rg.mean.g, rg.mean.b) };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform vec3 rgMean;')
      .replace(
        '#include <map_fragment>',
        `
        vec3 t1 = texture2D(map, vMapUv).rgb / rgMean;
        vec3 t2 = texture2D(map, vMapUv * 0.123 + vec2(0.31, 0.67)).rgb / rgMean;
        vec3 t3 = texture2D(map, vMapUv * 0.017 + vec2(0.71, 0.13)).rgb / rgMean;
        float l2 = dot(t2, vec3(0.3, 0.55, 0.15)), l3 = dot(t3, vec3(0.3, 0.55, 0.15));
        diffuseColor.rgb *= t1 * mix(1.0, l2, 0.45) * mix(1.0, l3, 0.5);
        `,
      );
  };
  return m;
}

function vn3(x: number, y: number, z: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h = (i: number, j: number, k: number) => hash(xi + i + (zi + k) * 7919, yi + j, s);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}

/**
 * An irregular boulder (shape by seed): a weathered lump broken along a few
 * fracture planes, its surface pitted and knobbly, squat and flat underneath
 * where it sits in the sand. `detail` sets the mesh's resolution (5 close up,
 * 2 far off); the same seed gives the same rock at any detail.
 */
export function boulderGeometry(seed: number, detail = 5): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  // fracture planes: where the rock split, flat faces with sharp-ish edges
  const planes: [THREE.Vector3, number][] = [];
  const nPl = 6 + Math.floor(hash(5, 5, seed) * 6);
  for (let k = 0; k < nPl; k++) {
    const n = new THREE.Vector3(hash(k, 1, seed) * 2 - 1, hash(k, 2, seed) * 2 - 1, hash(k, 3, seed) * 2 - 1).normalize();
    planes.push([n, 0.42 + 0.36 * hash(k, 4, seed)]);
  }
  const v = new THREE.Vector3();
  const sq = 0.5 + 0.3 * hash(7, 7, seed);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    // knobs and hollows at two scales, then the fracture faces cut through them
    const n1 = vn3(v.x * 2.1 + seed, v.y * 2.1, v.z * 2.1, seed) - 0.5;
    const n2 = vn3(v.x * 5.3, v.y * 5.3 + seed, v.z * 5.3, seed + 3) - 0.5;
    const n3 = vn3(v.x * 13, v.y * 13, v.z * 13 + seed, seed + 7) - 0.5;
    v.multiplyScalar(1 + n1 * 0.22 + n2 * 0.1 + n3 * 0.035);
    let k = 1;
    for (const [n, d] of planes) {
      const t = v.dot(n);
      if (t > d) k = Math.min(k, d / t + (t - d) * 0.025);
    }
    v.multiplyScalar(k);
    // squat: wider than tall, with a flat base to sit in the sand
    v.y = v.y > 0 ? v.y * sq : Math.max(v.y * 0.7, -0.32);
    v.x *= 1.0 + 0.35 * hash(1, 9, seed);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The rocks' material: the instance colour is the stone; on top of it, in the
 * rock's own frame, grain and pits, faint layering (much of Jezero's and
 * Gale's rock is laid down in beds), and the dust that settles on every
 * upward face.
 */
export function rockMaterial(color = 0xffffff): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRkP;\nvarying vec3 vRkN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRkP = position;\nvRkN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRkP;
varying vec3 vRkN;
float rkH(vec3 p) { p = fract(p * vec3(0.1031, 0.103, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float rkN(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkH(i), rkH(i + vec3(1,0,0)), f.x), mix(rkH(i + vec3(0,1,0)), rkH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rkH(i + vec3(0,0,1)), rkH(i + vec3(1,0,1)), f.x), mix(rkH(i + vec3(0,1,1)), rkH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float rkHeight(vec3 p) {
  return rkN(p * 9.0) * 0.5 + rkN(p * 23.0) * 0.3 + rkN(p * 61.0) * 0.2 - 0.5 * smoothstep(0.78, 0.9, rkN(p * 17.0));
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    vec3 q = vRkP;
    float grain = rkN(q * 31.0) * 0.6 + rkN(q * 97.0) * 0.4;
    float beds = sin(q.y * 26.0 + rkN(q * 2.5) * 5.0) * 0.5 + 0.5;
    float tone = 0.78 + 0.32 * grain + 0.1 * (beds - 0.5) + 0.12 * (rkN(q * 3.3) - 0.5);
    diffuseColor.rgb *= tone;
    // pits and vesicles: dark specks
    diffuseColor.rgb *= 1.0 - 0.45 * smoothstep(0.8, 0.92, rkN(q * 47.0));
    // dust on the upward faces, thicker in the hollows
    float up = smoothstep(0.25, 0.8, normalize(vRkN).y);
    float dust = clamp(up * (0.25 + 0.5 * rkN(q * 7.0)) - grain * 0.2, 0.0, 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.17, 0.09), dust);
  }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  {
    // fine relief: grain, pits and chips catch the low sunlight
    float hh = rkHeight(vRkP);
    vec2 dH = vec2(dFdx(hh), dFdy(hh)) * 0.9;
    vec3 vSigmaX = normalize(dFdx(-vViewPosition)), vSigmaY = normalize(dFdy(-vViewPosition));
    vec3 R1 = cross(vSigmaY, normal), R2 = cross(normal, vSigmaX);
    float fDet = dot(vSigmaX, R1);
    vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
    normal = normalize(abs(fDet) * normal - vGrad);
  }`,
      );
  };
  return m;
}
