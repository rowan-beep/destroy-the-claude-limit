// The noise the vapour is made of: one small tileable 3-D texture, built in the
// background in short slices (so it never costs a frame) the first time a jet might
// need it. Four channels, all periodic so it can be sampled at any scale:
//   R  billows: Perlin–Worley, the fat cotton-ball shapes of a cloud
//   G  medium cells (inverted Worley, 8 per tile): the lumps on the billows
//   B  fine cells (inverted Worley, 16 per tile): the frayed, feathery edge
//   A  smooth gradient noise: bends the sampling position so edges roll up and curl
// Sampled with a handful of fetches per ray step, this is far cheaper than computing
// noise in the shader and has none of its grid artefacts.

import * as THREE from 'three';

const N = 64;

let tex: THREE.Data3DTexture | null = null;
let ready = false;
let started = false;

/** the shared noise volume (a flat grey until `vaporNoiseReady()`) */
export function vaporNoiseTexture(): THREE.Data3DTexture {
  if (!tex) {
    const data = new Uint8Array(N * N * N * 4).fill(96);
    tex = new THREE.Data3DTexture(data, N, N, N);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
  }
  return tex;
}

export function vaporNoiseReady(): boolean {
  return ready;
}

// ---- a small deterministic generator ----------------------------------------

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const perm = new Uint8Array(512);
{
  const r = mulberry(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function grad(h: number, x: number, y: number, z: number): number {
  const k = h & 15;
  const u = k < 8 ? x : y;
  const v = k < 4 ? y : k === 12 || k === 14 ? x : z;
  return ((k & 1) === 0 ? u : -u) + ((k & 2) === 0 ? v : -v);
}

/** tileable Perlin noise, -1..1, with P (a power of two) lattice cells per tile; x,y,z in [0,1) */
function perlin(x: number, y: number, z: number, P: number): number {
  const X = x * P, Y = y * P, Z = z * P;
  const xi = Math.floor(X), yi = Math.floor(Y), zi = Math.floor(Z);
  const xf = X - xi, yf = Y - yi, zf = Z - zi;
  const m = P - 1;
  const x0 = xi & m, x1 = (xi + 1) & m, y0 = yi & m, y1 = (yi + 1) & m, z0 = zi & m, z1 = (zi + 1) & m;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const a = perm[x0] + y0, b = perm[x1] + y0, a1 = perm[x0] + y1, b1 = perm[x1] + y1;
  const aa = perm[a] + z0, ba = perm[b] + z0, ab = perm[a1] + z0, bb = perm[b1] + z0;
  const aa1 = perm[a] + z1, ba1 = perm[b] + z1, ab1 = perm[a1] + z1, bb1 = perm[b1] + z1;
  return lerp(
    lerp(lerp(grad(perm[aa], xf, yf, zf), grad(perm[ba], xf - 1, yf, zf), u), lerp(grad(perm[ab], xf, yf - 1, zf), grad(perm[bb], xf - 1, yf - 1, zf), u), v),
    lerp(lerp(grad(perm[aa1], xf, yf, zf - 1), grad(perm[ba1], xf - 1, yf, zf - 1), u), lerp(grad(perm[ab1], xf, yf - 1, zf - 1), grad(perm[bb1], xf - 1, yf - 1, zf - 1), u), v),
    w,
  );
}

interface WorleySet {
  F: number;
  pts: Float32Array;
}

function worleySet(F: number, seed: number): WorleySet {
  const r = mulberry(seed);
  const pts = new Float32Array(F * F * F * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  return { F, pts };
}

/** tileable Worley (distance to the nearest feature point), roughly 0..1 */
function worley(s: WorleySet, x: number, y: number, z: number): number {
  const F = s.F;
  const X = x * F, Y = y * F, Z = z * F;
  const cx = Math.floor(X), cy = Math.floor(Y), cz = Math.floor(Z);
  let best = 9;
  for (let dz = -1; dz <= 1; dz++) {
    const nz = cz + dz;
    const wz = ((nz % F) + F) % F;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      const wy = ((ny % F) + F) % F;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        const wx = ((nx % F) + F) % F;
        const i = ((wz * F + wy) * F + wx) * 3;
        const px = nx + s.pts[i] - X, py = ny + s.pts[i + 1] - Y, pz = nz + s.pts[i + 2] - Z;
        const d = px * px + py * py + pz * pz;
        if (d < best) best = d;
      }
    }
  }
  return Math.min(1, Math.sqrt(best) / 0.9);
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Start building the noise volume in the background (idempotent). It is ready a
 * second or two later; vapour that is wanted before then simply waits.
 */
export function startVaporNoise(): void {
  if (started) return;
  started = true;
  const t = vaporNoiseTexture();
  const data = t.image.data as Uint8Array;
  const w4 = worleySet(4, 11), w8 = worleySet(8, 23), w16 = worleySet(16, 37);
  let z = 0;
  const step = () => {
    const t0 = performance.now();
    while (z < N && performance.now() - t0 < 5) {
      const fz = z / N;
      for (let y = 0; y < N; y++) {
        const fy = y / N;
        for (let x = 0; x < N; x++) {
          const fx = x / N;
          // billows: Perlin fbm pushed up by inverted Worley, the Nubis recipe
          const pf = perlin(fx, fy, fz, 4) * 0.55 + perlin(fx, fy, fz, 8) * 0.3 + perlin(fx, fy, fz, 16) * 0.15;
          const pn = clamp01(pf * 0.5 + 0.5);
          const wb = 1 - worley(w4, fx, fy, fz);
          const billow = clamp01(0.5 * pn + 0.5 * wb + (pn * wb - 0.25) * 0.55);
          const med = 1 - worley(w8, fx, fy, fz);
          const fine = 1 - worley(w16, fx, fy, fz);
          const warp = clamp01(perlin(fx + 0.37, fy + 0.11, fz + 0.73, 8) * 0.5 + 0.5);
          const o = ((z * N + y) * N + x) * 4;
          data[o] = Math.round(billow * 255);
          data[o + 1] = Math.round(med * 255);
          data[o + 2] = Math.round(fine * 255);
          data[o + 3] = Math.round(warp * 255);
        }
      }
      z++;
    }
    if (z < N) setTimeout(step, 0);
    else {
      t.needsUpdate = true;
      ready = true;
    }
  };
  setTimeout(step, 0);
}
