// The harbor's surfaces, painted once on canvases when the ocean loads: cast
// concrete with its aggregate, formwork joints and stains; asphalt; weathered
// timber planks; ribbed corrugated cladding; granite armour rock; an office
// facade bay (rendered wall, a window with its frame, sill and the sky in the
// glass); painted steel with chips and rust; a ship's welded plating. Each has
// a relief map turned into a normal map, so the sun and the lamps pick out the
// ribs, joints and grain. All of them tile, and the geometry maps them by
// world position (boxUV in harbor.ts), so a surface's texture is the same size
// in metres wherever it is.

import * as THREE from 'three';

export interface SurfaceTex {
  map: THREE.Texture;
  normal: THREE.Texture | null;
}

/** a small fast hash noise that tiles with period p (cells) */
function makeNoise(seed: number) {
  const h = (x: number, y: number, p: number) => {
    x = ((x % p) + p) % p;
    y = ((y % p) + p) % p;
    let n = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const vn = (x: number, y: number, p: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi, p), b = h(xi + 1, yi, p), c = h(xi, yi + 1, p), d = h(xi + 1, yi + 1, p);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  /** fbm in [0,1) over a unit tile (u,v in 0..1), base frequency f cells per tile */
  return (u: number, v: number, f: number, oct = 4) => {
    let s = 0, a = 0.5, n = 0, fr = f;
    for (let i = 0; i < oct; i++) {
      s += a * vn(u * fr, v * fr, fr);
      n += a;
      a *= 0.5;
      fr *= 2;
    }
    return s / n;
  };
}

/** paint a tile pixel by pixel: rgb 0..1 and a height 0..1 for the relief */
function paint(size: number, fn: (u: number, v: number, out: number[]) => void, bump: number, srgbMap = true): SurfaceTex {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(size, size);
  const hgt = new Float32Array(size * size);
  const o = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn((x + 0.5) / size, (y + 0.5) / size, o);
      const i = (y * size + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, o[0] * 255));
      img.data[i + 1] = Math.max(0, Math.min(255, o[1] * 255));
      img.data[i + 2] = Math.max(0, Math.min(255, o[2] * 255));
      img.data[i + 3] = 255;
      hgt[y * size + x] = o[3];
    }
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(cv);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  if (srgbMap) map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.generateMipmaps = true;
  let normal: THREE.Texture | null = null;
  if (bump > 0) {
    const nc = document.createElement('canvas');
    nc.width = nc.height = size;
    const ng = nc.getContext('2d')!;
    const ni = ng.createImageData(size, size);
    const at = (x: number, y: number) => hgt[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * bump;
        const dy = (at(x, y + 1) - at(x, y - 1)) * bump;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        ni.data[i] = (-dx / l * 0.5 + 0.5) * 255;
        ni.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
        ni.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
        ni.data[i + 3] = 255;
      }
    }
    ng.putImageData(ni, 0, 0);
    normal = new THREE.CanvasTexture(nc);
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.anisotropy = 8;
  }
  return { map, normal };
}

const n1 = makeNoise(11), n2 = makeNoise(23), n3 = makeNoise(37), n4 = makeNoise(53);
const sm = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** cast concrete, a 4 m tile: aggregate, pores, a formwork joint along each edge, rain stains */
function concrete(size: number): SurfaceTex {
  return paint(size, (u, v, o) => {
    const base = 0.6 + 0.08 * (n1(u, v, 6) - 0.5) + 0.05 * (n2(u, v, 40, 2) - 0.5);
    const stain = sm(0.5, 0.8, n3(u, v, 3)) * 0.05;
    const speck = n4(u, v, 160, 1);
    const pore = speck > 0.86 ? 0.12 : speck < 0.08 ? -0.06 : 0;
    const ju = Math.min(u, 1 - u) * 4, jv = Math.min(v, 1 - v) * 4;
    const joint = Math.min(ju, jv) < 0.012 ? 1 : 0;
    const c = (base - stain - pore - joint * 0.07);
    o[0] = c * 1.01;
    o[1] = c;
    o[2] = c * 0.96;
    o[3] = 0.6 + 0.25 * n2(u, v, 40, 2) - pore * 2 - joint * 0.5;
  }, 3);
}

/** asphalt, an 8 m tile: dark binder, light grit, patched areas */
function asphalt(size: number): SurfaceTex {
  return paint(size, (u, v, o) => {
    const grit = n4(u, v, 256, 1);
    const patch = sm(0.55, 0.62, n1(u, v, 3)) * 0.05;
    const c = 0.19 + 0.03 * (n2(u, v, 20) - 0.5) + (grit > 0.82 ? 0.09 : 0) - patch;
    o[0] = c;
    o[1] = c;
    o[2] = c * 1.03;
    o[3] = grit;
  }, 1.2);
}

/** weathered timber planks, a 4 m tile: 16 planks across, grain along them, gaps between */
function timber(size: number): SurfaceTex {
  return paint(size, (u, v, o) => {
    const pu = u * 16;
    const k = Math.floor(pu);
    const f = pu - k;
    const shade = 0.82 + 0.3 * (((Math.sin(k * 12.9898 + 4.1) * 43758.5453) % 1) + 1) % 1;
    const grain = n1(f * 0.12 + k * 0.37, v, 4, 3) * 0.6 + n2(f * 0.5, v * 6, 8, 2) * 0.4;
    const gap = f < 0.04 || f > 0.97 ? 1 : 0;
    const end = Math.abs(((v * 3 + k * 0.37) % 1) - 0.5) > 0.495 ? 1 : 0;
    const c = (0.42 + 0.18 * grain) * shade * (gap || end ? 0.35 : 1);
    o[0] = c * 1.0;
    o[1] = c * 0.9;
    o[2] = c * 0.76;
    o[3] = gap || end ? 0 : 0.5 + 0.3 * grain;
  }, 4);
}

/** corrugated cladding, a 2 m tile: ribs every 0.2 m, dirt washed down from the top, a little rust at the foot */
function corrugated(size: number): SurfaceTex {
  return paint(size, (u, v, o) => {
    const rib = 0.5 + 0.5 * Math.cos(u * 10 * Math.PI * 2);
    const streak = n1(u * 1, v * 0.15, 8, 3);
    const dirt = 0.1 * sm(0.4, 0.8, streak) + 0.06 * (n2(u, v, 12) - 0.5);
    const c = 0.9 - dirt - (1 - rib) * 0.12;
    o[0] = c;
    o[1] = c;
    o[2] = c;
    o[3] = rib;
  }, 5);
}

/** granite armour rock, a 3 m tile: grains, cracks, lichen */
function rock(size: number): SurfaceTex {
  return paint(size, (u, v, o) => {
    const b = n1(u, v, 5, 5);
    const crack = Math.abs(n2(u, v, 4, 3) - 0.5) < 0.012 ? 1 : 0;
    const grain = n4(u, v, 200, 1);
    const lichen = sm(0.62, 0.7, n3(u, v, 7)) * 0.5;
    let r = 0.5 + 0.18 * (b - 0.5) + (grain > 0.9 ? 0.08 : grain < 0.08 ? -0.07 : 0);
    let gr = r * 0.98, bl = r * 0.94;
    r = r * (1 - lichen) + 0.62 * lichen;
    gr = gr * (1 - lichen) + 0.6 * lichen;
    bl = bl * (1 - lichen) + 0.38 * lichen;
    const k = crack ? 0.4 : 1;
    o[0] = r * k;
    o[1] = gr * k;
    o[2] = bl * k;
    o[3] = b * 0.8 + grain * 0.2 - crack * 0.5;
  }, 4);
}

/** one bay of an office facade (3.6 m wide, 3.5 m tall): rendered wall, a window with frame and sill, the sky in the glass */
function facade(size: number): SurfaceTex {
  return paint(size, (u, v, o) => {
    // (v runs down the canvas: 0 at the top of the storey)
    const inX = u > 0.14 && u < 0.86, inY = v > 0.2 && v < 0.74;
    const frame = inX && inY && (u < 0.16 || u > 0.84 || v < 0.22 || v > 0.72 || Math.abs(u - 0.5) < 0.012);
    const sill = u > 0.12 && u < 0.88 && v > 0.74 && v < 0.78;
    let r: number, g: number, b: number, hgt: number;
    if (inX && inY && !frame) {
      // glass: the sky, darker inside, a soft reflection band
      const refl = 0.16 + 0.22 * (1 - (v - 0.2) / 0.54) + 0.1 * sm(0.3, 0.6, n1(u * 0.5, v, 3));
      r = refl * 0.7;
      g = refl * 0.82;
      b = refl * 0.95;
      hgt = 0.2;
    } else if (frame) {
      r = g = b = 0.2;
      hgt = 0.7;
    } else if (sill) {
      r = g = b = 0.8;
      hgt = 0.9;
    } else {
      const w = 0.86 + 0.04 * (n2(u, v, 24, 3) - 0.5) - 0.06 * sm(0.75, 1, v) * n3(u, v, 6);
      r = w;
      g = w * 0.98;
      b = w * 0.94;
      hgt = 0.6 + 0.05 * n2(u, v, 24, 2);
    }
    o[0] = r;
    o[1] = g;
    o[2] = b;
    o[3] = hgt;
  }, 3);
}

/** painted steel, a 2 m tile: fine texture, chipped paint, rust bleeding (white: tinted by the paint colour) */
function painted(size: number): SurfaceTex {
  return paint(size, (u, v, o) => {
    const fine = 0.04 * (n2(u, v, 64, 2) - 0.5);
    const chip = sm(0.86, 0.89, n1(u, v, 10, 3)) * 0.7;
    const run = sm(0.7, 0.95, n3(u * 3, v * 0.3, 6, 2)) * 0.12;
    const k = 0.95 + fine - run * 0.25;
    o[0] = k * (1 - chip) + 0.55 * chip;
    o[1] = k * (1 - chip) + 0.32 * chip;
    o[2] = k * (1 - chip) + 0.2 * chip;
    o[3] = 0.6 - chip * 0.2 + fine;
  }, 2);
}

/** a ship's plating, a 6 m tile: welded seams, streaks of rust running down */
function plating(size: number): SurfaceTex {
  return paint(size, (u, v, o) => {
    const seamU = Math.min(Math.abs(((u * 3) % 1)), 1 - ((u * 3) % 1)) < 0.006;
    const seamV = Math.min(Math.abs(((v * 2) % 1)), 1 - ((v * 2) % 1)) < 0.008;
    const streak = sm(0.7, 0.95, n1(u * 2, v * 0.2, 16, 2)) * 0.5;
    const k = 0.94 + 0.04 * (n2(u, v, 32) - 0.5);
    o[0] = k * (1 - streak) + 0.5 * streak;
    o[1] = k * (1 - streak) + 0.3 * streak;
    o[2] = k * (1 - streak) + 0.2 * streak;
    o[3] = seamU || seamV ? 0.75 : 0.5;
  }, 2);
}

export interface HarborTextures {
  concrete: SurfaceTex;
  asphalt: SurfaceTex;
  timber: SurfaceTex;
  corrugated: SurfaceTex;
  rock: SurfaceTex;
  facade: SurfaceTex;
  painted: SurfaceTex;
  plating: SurfaceTex;
}

/** paint every surface (about a third of a second; once per session) */
export function makeHarborTextures(detail = 1): HarborTextures {
  const s = detail >= 1 ? 512 : 256;
  return {
    concrete: concrete(s),
    asphalt: asphalt(s),
    timber: timber(s),
    corrugated: corrugated(s / 2),
    rock: rock(s),
    facade: facade(s / 2),
    painted: painted(s / 2),
    plating: plating(s / 2),
  };
}

export function disposeHarborTextures(t: HarborTextures): void {
  for (const k of Object.values(t)) {
    k.map.dispose();
    k.normal?.dispose();
  }
}
