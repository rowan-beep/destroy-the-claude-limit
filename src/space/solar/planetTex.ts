// Planet surfaces. Most come from NASA's own global maps (public domain, from
// the NASA 3D Resources collection); the rest are drawn here: Mercury's
// cratered grey, the Moon's maria, Venus's cloud deck, Uranus's pale haze,
// Triton's pink-white ices, Earth's continents (the same ones the Earth-orbit
// view draws) and the Sun's granulated surface. Saturn's and Uranus's rings get
// a radial profile with the real gaps.
//
// Every texture is equirectangular: longitude 0 at the left edge's middle... as
// the NASA maps are, u = 0 at 180 W, u = 0.5 at the prime meridian.

import * as THREE from 'three';
import type { BodyId } from './bodies';
import { continent } from '../universe';
import jupiterUrl from './assets/jupiter.jpg';
import saturnUrl from './assets/saturn.jpg';
import neptuneUrl from './assets/neptune.jpg';
import plutoUrl from './assets/pluto.jpg';
import charonUrl from './assets/charon.jpg';
import titanUrl from './assets/titan.jpg';
import ioUrl from './assets/io.jpg';
import europaUrl from './assets/europa.jpg';
import ganymedeUrl from './assets/ganymede.jpg';
import callistoUrl from './assets/callisto.jpg';
import phobosUrl from './assets/phobos.jpg';
import enceladusUrl from './assets/enceladus.jpg';
import marsUrl from '../mars/assets/mars_viking_mdim21.jpg';

const URLS: Partial<Record<string, string>> = {
  jupiter: jupiterUrl, saturn: saturnUrl, neptune: neptuneUrl, pluto: plutoUrl, charon: charonUrl, titan: titanUrl,
  io: ioUrl, europa: europaUrl, ganymede: ganymedeUrl, callisto: callistoUrl, phobos: phobosUrl, enceladus: enceladusUrl, mars: marsUrl,
};

// ---------------------------------------------------------------- noise
function hash(x: number, y: number, z: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, z: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, s);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x: number, y: number, z: number, oct: number, s = 0): number {
  let a = 0.5, f = 1, t = 0;
  for (let i = 0; i < oct; i++) {
    t += a * vnoise(x * f, y * f, z * f, s + i);
    f *= 2.03;
    a *= 0.5;
  }
  return t;
}

/** paint a W x H equirectangular map from a function of the unit direction (x toward lon 0, z north) */
function paint(W: number, H: number, fn: (d: [number, number, number], lat: number, lon: number) => [number, number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const px = img.data;
  for (let j = 0; j < H; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) / H) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = ((i + 0.5) / W) * 2 * Math.PI - Math.PI;
      const d: [number, number, number] = [cl * Math.cos(lon), cl * Math.sin(lon), sl];
      const col = fn(d, lat, lon);
      const k = (j * W + i) * 4;
      px[k] = Math.max(0, Math.min(255, col[0] * 255));
      px[k + 1] = Math.max(0, Math.min(255, col[1] * 255));
      px[k + 2] = Math.max(0, Math.min(255, col[2] * 255));
      px[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** craters as a field of bowls with bright rims (cheap: a few octaves of cellular bumps) */
function craters(d: [number, number, number], scale: number, seed: number): number {
  let v = 0;
  for (let o = 0; o < 3; o++) {
    const f = scale * Math.pow(2.6, o);
    const x = d[0] * f, y = d[1] * f, z = d[2] * f;
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const cx = xi + dx, cy = yi + dy, cz = zi + dz;
          if (hash(cx, cy, cz, seed + o * 7) > 0.32) continue;
          const px = cx + hash(cx, cy, cz, seed + 1), py = cy + hash(cx, cy, cz, seed + 2), pz = cz + hash(cx, cy, cz, seed + 3);
          const r = 0.25 + 0.35 * hash(cx, cy, cz, seed + 4);
          const q = Math.hypot(x - px, y - py, z - pz) / r;
          if (q < 1.25) {
            const bowl = q < 1 ? -(1 - q * q) * 0.6 : 0;
            const rim = Math.exp(-((q - 1) * (q - 1)) / 0.012) * 0.45;
            v += (bowl + rim) / (1 + o * 0.6);
          }
        }
  }
  return v;
}

const cache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

/** the surface texture of a body (built or loaded once) */
export function planetTexture(id: BodyId | string): THREE.Texture {
  const hit = cache.get(id);
  if (hit) return hit;
  let t: THREE.Texture;
  const url = URLS[id];
  if (url) {
    t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.wrapS = THREE.RepeatWrapping;
  } else t = build(id);
  cache.set(id, t);
  return t;
}

function build(id: string): THREE.Texture {
  switch (id) {
    case 'mercury':
      return paint(1024, 512, (d) => {
        const n = fbm(d[0] * 3, d[1] * 3, d[2] * 3, 6, 11);
        const c = craters(d, 9, 3) + craters(d, 26, 9) * 0.6;
        const k = 0.42 + (n - 0.5) * 0.35 + c * 0.35;
        // smooth plains a touch darker and browner; rays of young craters brighter
        const pl = Math.max(0, fbm(d[0] * 1.2 + 4, d[1] * 1.2, d[2] * 1.2, 4, 3) - 0.55) * 1.6;
        return [k * (1.02 - pl * 0.12), k * (0.98 - pl * 0.14), k * (0.94 - pl * 0.17)];
      });
    case 'moon':
      return paint(1024, 512, (d, lat, lon) => {
        // the maria on the near side (centred on lon 0), the bright highlands everywhere else
        const near = Math.max(0, Math.cos(lon) * Math.cos(lat));
        const m = fbm(d[0] * 2.2, d[1] * 2.2, d[2] * 2.2, 5, 21);
        const mare = Math.max(0, Math.min(1, (m - 0.52 + near * 0.18) * 5)) * (0.4 + 0.6 * near);
        const c = craters(d, 10, 31) + craters(d, 30, 41) * 0.5;
        const k = 0.6 - mare * 0.32 + (fbm(d[0] * 9, d[1] * 9, d[2] * 9, 4, 5) - 0.5) * 0.12 + c * 0.25;
        return [k, k * 0.99, k * 0.96];
      });
    case 'venus':
      return paint(1024, 512, (d, lat) => {
        // the cloud tops: soft bands swept into a Y by the 4-day super-rotation
        const sw = d[0] * 2 + Math.sin(lat * 3) * 1.2;
        const n = fbm(sw * 1.5, d[1] * 6, d[2] * 2.2, 6, 51);
        const band = 0.5 + 0.5 * Math.sin(lat * 7 + n * 4);
        const k = 0.78 + (n - 0.5) * 0.28 + band * 0.08;
        return [k * 1.0, k * 0.9, k * 0.68];
      });
    case 'uranus':
      return paint(512, 256, (d, lat) => {
        const n = fbm(d[0] * 4, d[1] * 4, d[2] * 12, 4, 61);
        const band = Math.sin(lat * 9) * 0.015 + (n - 0.5) * 0.03;
        const pole = Math.max(0, Math.sin(lat)) * 0.05;
        return [0.62 + band + pole, 0.84 + band + pole, 0.88 + band * 0.6 + pole];
      });
    case 'triton':
      return paint(720, 360, (d, lat) => {
        const n = fbm(d[0] * 4, d[1] * 4, d[2] * 4, 6, 71);
        // the pinkish southern polar cap and the "cantaloupe" terrain to the north
        const cap = lat < -0.15 ? 0.12 : 0;
        const melon = (fbm(d[0] * 26, d[1] * 26, d[2] * 26, 3, 9) - 0.5) * (lat > -0.1 ? 0.18 : 0.05);
        const k = 0.72 + (n - 0.5) * 0.2 + melon + cap;
        return [k * 1.0, k * 0.9, k * 0.85];
      });
    case 'earth':
      return paint(1024, 512, (d, lat) => {
        // the same continents the Earth-orbit view draws (Earth-fixed: x lon 0, y north there)
        const h = continent([d[0], d[2], -d[1]], 7);
        const alat = Math.abs(lat);
        const ice = alat > 1.15 || (h > 0 && alat > 1.05) ? 1 : 0;
        const cl = fbm(d[0] * 5 + 3, d[1] * 5, d[2] * 5, 5, 81);
        const cloud = Math.max(0, Math.min(1, (cl - 0.5) * 3.5 + Math.cos(lat * 3) * 0.12));
        let c: [number, number, number];
        if (ice) c = [0.92, 0.94, 0.97];
        else if (h > 0) {
          const dry = Math.max(0, 1 - Math.abs(Math.abs(lat) - 0.4) * 3) * 0.6;
          c = [0.25 + dry * 0.45, 0.36 + dry * 0.22, 0.16 + dry * 0.08];
        } else c = [0.03, 0.12 + Math.max(0, h + 0.15) * 0.4, 0.28 + Math.max(0, h + 0.15) * 0.5];
        return [c[0] * (1 - cloud) + cloud * 0.95, c[1] * (1 - cloud) + cloud * 0.96, c[2] * (1 - cloud) + cloud * 0.98];
      });
    case 'sun':
      return paint(512, 256, (d) => {
        const n = fbm(d[0] * 40, d[1] * 40, d[2] * 40, 3, 91);
        const k = 0.85 + (n - 0.5) * 0.3;
        return [1, 0.8 * k + 0.1, 0.45 * k];
      });
    default:
      return paint(256, 128, (d) => {
        const k = 0.5 + (fbm(d[0] * 4, d[1] * 4, d[2] * 4, 5, 3) - 0.5) * 0.3 + craters(d, 8, 7) * 0.2;
        return [k, k, k];
      });
  }
}

/** a ring system's radial profile: brightness (rgb) and opacity (a), from the inner edge outward */
export function ringTexture(id: 'saturn' | 'uranus'): THREE.Texture {
  const key = 'rings-' + id;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 2048;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 4;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, 4);
  for (let i = 0; i < W; i++) {
    const u = i / (W - 1);
    let a = 0, r = 0.9, gg = 0.85, b = 0.75;
    if (id === 'saturn') {
      // radius in thousands of km across 66.9 - 140.2
      const R = 66.9 + u * (140.22 - 66.9);
      const fine = 0.85 + 0.15 * Math.sin(R * 37.0) * Math.sin(R * 11.3 + 1.0) + 0.08 * (hash(i, 0, 0, 3) - 0.5);
      if (R < 74.5) a = 0.04; // D ring
      else if (R < 92) {
        a = 0.12 + 0.1 * Math.sin(R * 3.1) ** 2; // C ring: dim, grey
        r = 0.7; gg = 0.68; b = 0.64;
      } else if (R < 117.58) {
        a = 0.75 + 0.2 * Math.sin((R - 92) * 0.35) ** 2; // B ring: the bright, dense one
        r = 0.96; gg = 0.88; b = 0.74;
        if (R > 104 && R < 110) a = 0.95;
      } else if (R < 122.17) {
        a = R > 120.0 && R < 120.6 ? 0.18 : 0.06; // Cassini Division (with the Huygens ringlet)
        r = 0.6; gg = 0.58; b = 0.55;
      } else if (R < 136.77) {
        a = 0.55 + 0.1 * Math.sin(R * 0.9) ** 2; // A ring
        if (R > 133.4 && R < 133.75) a = 0.05; // Encke Gap
        if (R > 136.48 && R < 136.52) a = 0.1; // Keeler Gap
        r = 0.88; gg = 0.82; b = 0.72;
      } else if (R > 140.0 && R < 140.4) a = 0.35; // F ring
      a *= fine;
    } else {
      // Uranus: thin, dark, narrow rings; epsilon the widest at the outside
      const R = 41.84 + u * (51.15 - 41.84);
      for (const [rr, w, aa] of [[41.84, 0.08, 0.5], [42.23, 0.05, 0.5], [42.57, 0.06, 0.5], [44.72, 0.04, 0.5], [45.66, 0.05, 0.5], [47.18, 0.04, 0.6], [47.63, 0.04, 0.6], [48.3, 0.05, 0.6], [51.15, 0.12, 0.9]] as [number, number, number][])
        if (Math.abs(R - rr) < w) a = Math.max(a, aa);
      r = 0.35; gg = 0.36; b = 0.38;
    }
    for (let j = 0; j < 4; j++) {
      const k = (j * W + i) * 4;
      img.data[k] = r * 255;
      img.data[k + 1] = gg * 255;
      img.data[k + 2] = b * 255;
      img.data[k + 3] = Math.max(0, Math.min(1, a)) * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
