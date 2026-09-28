// Procedurally generated textures (no external image assets needed).

import * as THREE from 'three';
import { Simplex2 } from '../core/noise';

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

/** Tileable fractal noise (by sampling noise on a torus). */
export function tileableNoiseData(size: number, seed: number, octaves: number, baseFreq: number): Float32Array {
  const n = new Simplex2(seed);
  const out = new Float32Array(size * size);
  // map the 2D square onto a 4D torus approximation: use two 2D noise calls
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = x / size, t = y / size;
      const a = s * Math.PI * 2, b = t * Math.PI * 2;
      let sum = 0, amp = 1, norm = 0, f = baseFreq;
      for (let o = 0; o < octaves; o++) {
        const r = f / (Math.PI * 2);
        const nx = Math.cos(a) * r, ny = Math.sin(a) * r;
        const nz = Math.cos(b) * r, nw = Math.sin(b) * r;
        // pseudo-4D by combining two 2D planes
        const v = n.noise(nx + nz * 0.7 + o * 13.1, ny + nw * 0.7 - o * 7.7) * 0.5 + n.noise(nz - ny * 0.3 + 5.2, nw + nx * 0.3 - 2.1) * 0.5;
        sum += v * amp;
        norm += amp;
        amp *= 0.5;
        f *= 2;
      }
      out[y * size + x] = sum / norm;
    }
  }
  return out;
}

let terrainDetail: THREE.Texture | null = null;

/** Tileable Worley (cellular) noise: F2 - F1, 0 on the cracks between cells. */
function tileableCracks(size: number, cells: number, seed: number): Float32Array {
  let st = seed >>> 0;
  const rnd = () => {
    st = (st + 0x6d2b79f5) >>> 0;
    let t = st;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) {
    px[i] = rnd();
    py[i] = rnd();
  }
  const out = new Float32Array(size * size);
  let mx = 1e-6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const cx = Math.floor(fx), cy = Math.floor(fy);
      let f1 = 1e9, f2 = 1e9;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const gx = cx + i, gy = cy + j;
          const k = (((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells);
          const dx = gx + px[k] - fx, dy = gy + py[k] - fy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      const v = f2 - f1;
      out[y * size + x] = v;
      if (v > mx) mx = v;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= mx;
  return out;
}

/**
 * Terrain detail texture (tileable, linear):
 *   R  grain: soft fractal noise that breaks up the vertex colours
 *   G  rock: fractures between blocks (0 in a crack), with finer crazing
 *   B  fine grain: high-frequency speckle for close range
 */
export function getTerrainDetailTexture(): THREE.Texture {
  if (terrainDetail) return terrainDetail;
  const size = 512;
  const d1 = tileableNoiseData(size, 91, 6, 8);
  const d2 = tileableNoiseData(size, 17, 4, 32);
  const big = tileableCracks(size, 9, 7);
  const small = tileableCracks(size, 31, 23);
  const grain = tileableNoiseData(size, 53, 3, 96);
  const { c, g } = makeCanvas(size, size);
  const img = g.createImageData(size, size);
  const cl = (v: number) => Math.max(0, Math.min(255, v * 255));
  for (let i = 0; i < size * size; i++) {
    const v = 0.5 + 0.42 * d1[i] + 0.18 * d2[i];
    const rock = Math.min(1, Math.pow(big[i], 0.6)) * (0.55 + 0.45 * Math.min(1, Math.pow(small[i], 0.5)));
    img.data[i * 4] = cl(v);
    img.data[i * 4 + 1] = cl(rock);
    img.data[i * 4 + 2] = cl(0.5 + 0.5 * grain[i]);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  // sharp at grazing angles (three clamps this to what the GPU supports)
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  terrainDetail = tex;
  return tex;
}

let waterNormals: THREE.Texture | null = null;

/** Tileable water normal map built from noise gradients. */
export function getWaterNormalTexture(): THREE.Texture {
  if (waterNormals) return waterNormals;
  const size = 256;
  const h = tileableNoiseData(size, 5, 5, 6);
  const { c, g } = makeCanvas(size, size);
  const img = g.createImageData(size, size);
  const strength = 3.0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const d = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  waterNormals = tex;
  return tex;
}

let cloudPuff: THREE.Texture | null = null;

/** Soft cauliflower cloud puff sprite (alpha in A, shading in RGB). */
export function getCloudPuffTexture(): THREE.Texture {
  if (cloudPuff) return cloudPuff;
  const size = 256;
  const n = new Simplex2(77);
  const { c, g } = makeCanvas(size, size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const v = ((y + 0.5) / size) * 2 - 1;
      const r = Math.sqrt(u * u + v * v);
      const nn = n.fbm(u * 2.2 + 3, v * 2.2 - 1, 6) * 0.5 + 0.5;
      const fine = n.fbm(u * 7 - 5, v * 7 + 2, 3) * 0.5 + 0.5;
      // soft, wide core with a billowy, torn edge: neighbouring puffs melt
      // into one cloud instead of reading as separate balls
      const edge = r * (0.62 + 0.62 * nn + 0.18 * fine);
      let a = Math.exp(-edge * edge * 2.3) - 0.05;
      a = Math.max(0, Math.min(1, a * 1.3));
      // fake self-shadowing: lit from above, darker underneath, cauliflower texture
      const shade = 0.7 + 0.22 * (1 - (v * 0.5 + 0.5)) + 0.14 * (nn - 0.5) + 0.06 * (fine - 0.5);
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, shade * 255);
      img.data[i + 1] = Math.min(255, shade * 255);
      img.data[i + 2] = Math.min(255, shade * 255);
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cloudPuff = tex;
  return tex;
}

let softDot: THREE.Texture | null = null;

/** Radial soft dot used for particles, flares, lights. */
export function getSoftDotTexture(): THREE.Texture {
  if (softDot) return softDot;
  const size = 64;
  const { c, g } = makeCanvas(size, size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  softDot = tex;
  return tex;
}

let smokePuff: THREE.Texture | null = null;

/** Billowy smoke sprite. */
export function getSmokeTexture(): THREE.Texture {
  if (smokePuff) return smokePuff;
  const size = 64;
  const n = new Simplex2(303);
  const { c, g } = makeCanvas(size, size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size * 2 - 1;
      const v = (y + 0.5) / size * 2 - 1;
      const r = Math.sqrt(u * u + v * v);
      const nn = n.fbm(u * 3 + 1, v * 3 + 2, 4) * 0.5 + 0.5;
      let a = 1 - r * (0.9 + 0.5 * nn);
      a = Math.max(0, Math.min(1, a * 1.8));
      const i = (y * size + x) * 4;
      const s = 200 + 55 * nn;
      img.data[i] = s;
      img.data[i + 1] = s;
      img.data[i + 2] = s;
      img.data[i + 3] = a * a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  smokePuff = tex;
  return tex;
}

/** Simple text/number canvas texture helper (runway numbers etc). */
export function makeTextTexture(
  text: string,
  w: number,
  h: number,
  opts: { font?: string; color?: string; bg?: string; rotate?: number } = {},
): THREE.Texture {
  const { c, g } = makeCanvas(w, h);
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, w, h);
  } else {
    g.clearRect(0, 0, w, h);
  }
  g.save();
  g.translate(w / 2, h / 2);
  if (opts.rotate) g.rotate(opts.rotate);
  g.fillStyle = opts.color ?? '#fff';
  g.font = opts.font ?? `bold ${Math.floor(h * 0.7)}px Arial`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Concrete / asphalt style texture for runways and aprons. */
export function makePavementTexture(seed: number, base: [number, number, number], variance: number): THREE.Texture {
  const size = 256;
  const d = tileableNoiseData(size, seed, 5, 10);
  const d2 = tileableNoiseData(size, seed + 1, 2, 64);
  const { c, g } = makeCanvas(size, size);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 1 + variance * (d[i] * 0.7 + d2[i] * 0.5);
    img.data[i * 4] = Math.max(0, Math.min(255, base[0] * v));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, base[1] * v));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, base[2] * v));
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
