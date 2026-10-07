// Mars itself: the shape of the ground and the colour of the dust, built once
// from the planet's real features and shared by everything that draws or
// lands on it.
//
// A global map (equirectangular, 2048 x 1024) holds the large-scale relief
// and albedo: the crustal dichotomy between the low, smooth northern plains
// and the high, cratered south; the Tharsis rise with Olympus Mons and the
// three Tharsis Montes, Alba Mons and the Elysium volcanoes; Valles Marineris
// with Noctis Labyrinthus at its head; the Hellas, Argyre, Isidis and Utopia
// basins; thousands of craters; the dark regions (Syrtis Major, Acidalia,
// Mare Erythraeum, Sinus Meridiani and the rest), the bright dusty uplands and
// both polar caps. Close to the ground, `marsHeight` adds what the map cannot
// hold: rolling terrain and craters down to a few metres across, the same
// everywhere, so the ship lands on exactly the ground that is drawn.
//
// Coordinates: latitude north, longitude east (-180..180); Mars-fixed unit
// vectors are (cos lat cos lon, cos lat sin lon, sin lat).

export const MAP_W = 1024;
export const MAP_H = 512;
const R_KM = 3389.5;
const D2R = Math.PI / 180;

// ------------------------------------------------------------------ noise
function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi), c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
  const e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1), g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
  const x1 = a + (b - a) * fx, x2 = c + (d - c) * fx, x3 = e + (f - e) * fx, x4 = g + (h - g) * fx;
  const y1 = x1 + (x2 - x1) * fy, y2 = x3 + (x4 - x3) * fy;
  return y1 + (y2 - y1) * fz;
}
function fbm(x: number, y: number, z: number, oct: number): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * (vnoise(x * f, y * f, z * f) * 2 - 1);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

/** great-circle angle (radians) between two lat/lon points */
function arc(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ the features
interface Volcano { lat: number; lon: number; r: number; h: number; caldera: number; scarp?: number }
const VOLCANOES: Volcano[] = [
  { lat: 18.65, lon: -133.8, r: 310, h: 19, caldera: 42, scarp: 5 }, // Olympus Mons
  { lat: 11.8, lon: -104.5, r: 220, h: 12, caldera: 30 }, // Ascraeus Mons
  { lat: 1.5, lon: -112.8, r: 210, h: 8, caldera: 24 }, // Pavonis Mons
  { lat: -8.3, lon: -120.1, r: 230, h: 11, caldera: 55 }, // Arsia Mons
  { lat: 40.5, lon: -109.6, r: 650, h: 3.5, caldera: 60 }, // Alba Mons
  { lat: 24.8, lon: 146.9, r: 190, h: 11, caldera: 14 }, // Elysium Mons
  { lat: 32.2, lon: 150.3, r: 110, h: 5, caldera: 8 }, // Hecates Tholus
  { lat: 21.4, lon: -95.4, r: 70, h: 3, caldera: 8 }, // Tharsis Tholus
];
interface Basin { lat: number; lon: number; r: number; depth: number; rim: number }
const BASINS: Basin[] = [
  { lat: -42.4, lon: 70.5, r: 1150, depth: 6.5, rim: 1.6 }, // Hellas
  { lat: -49.7, lon: -43.0, r: 900, depth: 3.8, rim: 1.2 }, // Argyre
  { lat: 12.9, lon: 87.0, r: 620, depth: 2.6, rim: 0.6 }, // Isidis
  { lat: 46.7, lon: 117.5, r: 1600, depth: 1.4, rim: 0 }, // Utopia
];
/** Valles Marineris and its western end */
const VALLES: [number, number][] = [[-7.2, -101], [-8.5, -92], [-7.8, -83], [-9.2, -76], [-11.5, -68], [-13.4, -60], [-12.6, -52], [-9.5, -45], [-5.5, -40]];
/** the dark albedo regions: lat, lon, half-extents (deg), strength */
const DARK: [number, number, number, number, number][] = [
  [9, 69.5, 9, 13, 1.0], // Syrtis Major
  [47, -28, 10, 22, 0.85], // Acidalia
  [-25, -42, 13, 22, 0.75], // Mare Erythraeum
  [-3, 0, 5, 14, 0.95], // Sinus Meridiani
  [-8, 25, 6, 18, 0.85], // Sinus Sabaeus
  [-17, 105, 8, 18, 0.75], // Mare Tyrrhenum
  [-22, 145, 8, 18, 0.75], // Mare Cimmerium
  [-30, -152, 7, 20, 0.75], // Mare Sirenum
  [-26, -87, 5, 8, 0.7], // Solis Lacus
  [-40, 50, 7, 22, 0.55], // Mare Serpentis / Hellespontus
  [55, 120, 8, 30, 0.45], // Utopia's dark collar
  [62, -20, 6, 50, 0.6], // the northern dune collar round the cap
  [-48, 160, 8, 25, 0.5], // Mare Chronium
];
/** bright, dusty regions */
const BRIGHT: [number, number, number, number, number][] = [
  [0, -110, 25, 35, 0.6], // Tharsis
  [20, 10, 18, 30, 0.45], // Arabia Terra
  [20, -160, 15, 25, 0.55], // Amazonis
  [25, 150, 15, 20, 0.45], // Elysium
  [-42, 70, 12, 20, 0.6], // Hellas floor
  [-50, -43, 8, 10, 0.45], // Argyre floor
];

export interface Region { name: string; lat: number; lon: number; r: number }
export const REGIONS: Region[] = [
  { name: 'Olympus Mons', lat: 18.65, lon: -133.8, r: 4 },
  { name: 'Jezero crater', lat: 18.4, lon: 77.6, r: 0.6 },
  { name: 'Gale crater', lat: -5.4, lon: 137.8, r: 1.2 },
  { name: 'Valles Marineris', lat: -10, lon: -72, r: 30 },
  { name: 'Hellas Planitia', lat: -42, lon: 70, r: 18 },
  { name: 'Argyre Planitia', lat: -50, lon: -43, r: 13 },
  { name: 'Arcadia Planitia', lat: 47, lon: -176, r: 18 },
  { name: 'Amazonis Planitia', lat: 24, lon: -164, r: 15 },
  { name: 'Utopia Planitia', lat: 47, lon: 118, r: 25 },
  { name: 'Elysium Planitia', lat: 3, lon: 155, r: 15 },
  { name: 'Chryse Planitia', lat: 27, lon: -40, r: 14 },
  { name: 'Acidalia Planitia', lat: 47, lon: -22, r: 16 },
  { name: 'Isidis Planitia', lat: 13, lon: 88, r: 10 },
  { name: 'Syrtis Major', lat: 9, lon: 69, r: 10 },
  { name: 'Meridiani Planum', lat: -2, lon: -6, r: 8 },
  { name: 'Tharsis', lat: 0, lon: -110, r: 30 },
  { name: 'Arabia Terra', lat: 20, lon: 5, r: 22 },
  { name: 'Terra Sabaea', lat: -2, lon: 42, r: 20 },
  { name: 'Noachis Terra', lat: -45, lon: -5, r: 20 },
  { name: 'Terra Cimmeria', lat: -35, lon: 145, r: 22 },
  { name: 'Terra Sirenum', lat: -40, lon: -150, r: 22 },
  { name: 'Xanthe Terra', lat: 2, lon: -47, r: 12 },
  { name: 'Margaritifer Terra', lat: -5, lon: -25, r: 12 },
  { name: 'Lunae Planum', lat: 11, lon: -67, r: 10 },
  { name: 'Promethei Terra', lat: -58, lon: 100, r: 15 },
  { name: 'Planum Australe', lat: -84, lon: 0, r: 8 },
  { name: 'Planum Boreum', lat: 86, lon: 0, r: 7 },
];
export function regionName(lat: number, lon: number): string {
  let best = '', bestK = Infinity;
  for (const r of REGIONS) {
    const d = arc(lat, lon, r.lat, r.lon) / D2R;
    if (d < r.r && d / r.r < bestK) {
      bestK = d / r.r;
      best = r.name;
    }
  }
  if (best) return best;
  if (lat > 55) return 'Vastitas Borealis';
  return lat < 0 ? 'the southern highlands' : 'the northern plains';
}

// ------------------------------------------------------------------ the global map
export interface MarsMaps {
  /** heights in km, row 0 at latitude +90 */
  height: Float32Array;
  /** albedo, linear RGB 0..1, three per pixel */
  albedo: Float32Array;
}
let maps: MarsMaps | null = null;

/** distance (deg of arc) from a point to the Valles polyline, and the fraction along it */
function vallesDist(lat: number, lon: number): { d: number; t: number } {
  let best = Infinity, bt = 0;
  for (let i = 0; i < VALLES.length - 1; i++) {
    const [a1, o1] = VALLES[i], [a2, o2] = VALLES[i + 1];
    const cx = Math.cos(lat * D2R);
    const ax = o1 * cx, ay = a1, bx = o2 * cx, by = a2, px = lon * cx, py = lat;
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    const d = Math.hypot(px - ax - vx * t, py - ay - vy * t);
    if (d < best) {
      best = d;
      bt = (i + t) / (VALLES.length - 1);
    }
  }
  return { d: best, t: bt };
}

function ellipseK(lat: number, lon: number, cl: number, co: number, rl: number, ro: number): number {
  let dl = lon - co;
  dl = ((dl + 540) % 360) - 180;
  return Math.hypot((lat - cl) / rl, (dl * Math.cos(lat * D2R)) / ro);
}

/** large-scale relief (km) at a point, without craters */
function reliefKm(lat: number, lon: number, x: number, y: number, z: number): number {
  // the dichotomy: the north sits ~3 km lower behind a wavy boundary
  const bLat = 18 + 15 * Math.cos((lon - 20) * D2R) + 6 * fbm(x * 2, y * 2, z * 2, 3);
  let h = 1.2 - 4.0 * sstep(bLat - 6, bLat + 6, lat);
  // rolling terrain everywhere, rougher in the south
  h += fbm(x * 3, y * 3, z * 3, 5) * (lat < bLat ? 1.4 : 0.6);
  // the Tharsis rise and Elysium's
  h += 6.5 * Math.exp(-((arc(lat, lon, 2, -108) / (45 * D2R)) ** 2));
  h += 2.0 * Math.exp(-((arc(lat, lon, 25, 148) / (14 * D2R)) ** 2));
  // the volcanoes
  for (const v of VOLCANOES) {
    const xk = (arc(lat, lon, v.lat, v.lon) * R_KM) / v.r;
    if (xk < 1.25) {
      let s = Math.max(0, 1 - Math.pow(Math.min(1, xk), 1.6));
      s = Math.pow(s, 1.25);
      h += v.h * s;
      if (v.scarp) h += v.scarp * sstep(1.05, 0.9, xk) - v.scarp * 0.2;
      const xc = (xk * v.r) / v.caldera;
      if (xc < 1.2) h -= 3.0 * sstep(1.15, 0.85, xc) * Math.min(1, v.h / 10);
    }
  }
  // the basins, with raised rims
  for (const b of BASINS) {
    const xk = (arc(lat, lon, b.lat, b.lon) * R_KM) / b.r;
    if (xk < 1.6) h += -b.depth * (1 - sstep(0.55, 1.0, xk)) + b.rim * Math.exp(-(((xk - 1.05) / 0.18) ** 2));
  }
  // Valles Marineris: deep, steep-walled troughs; the chaotic maze at its head
  const vm = vallesDist(lat, lon);
  const halfW = 2.2 + 2.0 * Math.sin(vm.t * Math.PI);
  if (vm.d < halfW * 2.5) {
    const depth = 7 * (0.55 + 0.45 * Math.sin(vm.t * Math.PI));
    const wob = 0.9 * fbm(x * 30, y * 30, z * 30, 3);
    // the main trough and the parallel chasmata beside it (Ius, Melas, Coprates, Ophir, Candor)
    const main = 1 - sstep(halfW * 0.35, halfW * 0.75, vm.d + wob);
    const side = (1 - sstep(0.25, 0.7, Math.abs(vm.d - halfW * 1.15) + wob * 0.6)) * Math.sin(vm.t * Math.PI) * 0.8;
    h -= depth * Math.max(main, side);
  }
  if (arc(lat, lon, -7, -102) < 6 * D2R) h -= 2.2 * Math.max(0, fbm(x * 70, y * 70, z * 70, 3)) * sstep(6, 3, arc(lat, lon, -7, -102) / D2R);
  // the polar layered deposits stand up to 3 km
  if (lat > 78) h += 2.8 * sstep(78, 86, lat);
  if (lat < -80) h += 3.2 * sstep(-80, -87, lat);
  return h;
}

function albedoAt(lat: number, lon: number, x: number, y: number, z: number, hKm: number, out: number[]): void {
  // dust: a bright butterscotch; basalt and dunes: a dark grey-brown
  const bright = [0.62, 0.36, 0.2];
  const dark = [0.26, 0.17, 0.12];
  let k = 0.33 + 0.22 * fbm(x * 6 + 3, y * 6, z * 6, 5);
  // ragged edges: the dark regions are wind-swept, with long tails and bays
  const warp = 0.55 * fbm(x * 7, y * 7 + 7, z * 7, 4) + 0.3 * fbm(x * 22 + 5, y * 22, z * 22, 3);
  for (const [cl, co, rl, ro, s] of DARK) {
    const e = ellipseK(lat, lon, cl, co, rl, ro) + warp;
    k += s * 0.75 * (1 - sstep(0.55, 1.15, e));
  }
  for (const [cl, co, rl, ro, s] of BRIGHT) {
    const e = ellipseK(lat, lon, cl, co, rl, ro) + warp;
    k -= s * 0.6 * (1 - sstep(0.5, 1.2, e));
  }
  // high volcanoes wear bright dust; canyon floors darker
  if (hKm > 8) k -= 0.15;
  k = Math.max(0, Math.min(1, k));
  for (let i = 0; i < 3; i++) out[i] = bright[i] + (dark[i] - bright[i]) * k;
  // the polar caps: water ice under CO2 frost, with the north cap's spiral troughs
  let ice = 0;
  if (lat > 79) {
    const sp = Math.sin((lon * 3 + (90 - lat) * 18) * D2R);
    ice = sstep(79, 83, lat) * (0.75 + 0.25 * sp);
  }
  const sd = arc(lat, lon, -87, -45) / D2R;
  if (sd < 6) ice = Math.max(ice, sstep(6, 3.5, sd));
  if (ice > 0) {
    const ic = [0.86, 0.82, 0.76];
    for (let i = 0; i < 3; i++) out[i] = out[i] + (ic[i] - out[i]) * ice;
  }
}

interface Build { height: Float32Array; albedo: Float32Array; row: number; craters: boolean }
let build: Build | null = null;

/**
 * Build the global maps a slice at a time (so the game never stalls):
 * returns true once they are ready. `budgetMs` of work per call.
 */
export function buildMarsMaps(budgetMs = 8): boolean {
  if (maps) return true;
  const W = MAP_W, H = MAP_H;
  build ??= { height: new Float32Array(W * H), albedo: new Float32Array(W * H * 3), row: 0, craters: false };
  const b = build;
  const t0 = performance.now();
  const col = [0, 0, 0];
  while (b.row < H) {
    const j = b.row++;
    const lat = 90 - ((j + 0.5) / H) * 180;
    const cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R);
    for (let i = 0; i < W; i++) {
      const lon = ((i + 0.5) / W) * 360 - 180;
      const x = cl * Math.cos(lon * D2R), y = cl * Math.sin(lon * D2R), z = sl;
      const hk = reliefKm(lat, lon, x, y, z);
      b.height[j * W + i] = hk;
      albedoAt(lat, lon, x, y, z, hk, col);
      const o = (j * W + i) * 3;
      b.albedo[o] = col[0];
      b.albedo[o + 1] = col[1];
      b.albedo[o + 2] = col[2];
    }
    if (performance.now() - t0 > budgetMs) return false;
  }
  if (!b.craters) {
    stampCraters(b.height, b.albedo);
    b.craters = true;
  }
  maps = { height: b.height, albedo: b.albedo };
  build = null;
  return true;
}

/** the global maps, built now if they are not ready yet */
export function marsMaps(): MarsMaps {
  while (!buildMarsMaps(1e9)) {
    /* finish */
  }
  return maps!;
}

function stampCraters(height: Float32Array, albedo: Float32Array): void {
  const W = MAP_W, H = MAP_H;
  // craters, stamped onto the map: a power law of sizes, three times as many in the south
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let made = 0;
  for (let k = 0; k < 40000 && made < 6000; k++) {
    const lat = Math.asin(rnd() * 2 - 1) / D2R;
    const lon = rnd() * 360 - 180;
    const south = lat < 18 + 15 * Math.cos((lon - 20) * D2R);
    if (!south && rnd() > 0.33) continue;
    // keep the young volcanoes and the caps unscarred
    let skip = false;
    for (const v of VOLCANOES) if ((arc(lat, lon, v.lat, v.lon) * R_KM) / v.r < 1) skip = true;
    if (Math.abs(lat) > 80) skip = true;
    if (skip) continue;
    const rKm = 9 * Math.pow(1 - rnd(), -1 / 1.25);
    if (rKm > 260) continue;
    made++;
    const depth = Math.min(3.5, 0.2 * rKm) * (0.5 + 0.5 * rnd());
    const rimH = depth * 0.28;
    const rLatDeg = rKm / R_KM / D2R;
    const rLonDeg = rLatDeg / Math.max(0.15, Math.cos(lat * D2R));
    const j0 = Math.floor(((90 - (lat + rLatDeg * 1.6)) / 180) * H), j1 = Math.ceil(((90 - (lat - rLatDeg * 1.6)) / 180) * H);
    const iSpan = Math.ceil((rLonDeg * 1.6 * W) / 360);
    const ic = Math.floor(((lon + 180) / 360) * W);
    const darkFloor = 0.1 * rnd();
    for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++) {
      const la = 90 - ((j + 0.5) / H) * 180;
      for (let di = -iSpan; di <= iSpan; di++) {
        const i = (((ic + di) % W) + W) % W;
        const lo = ((i + 0.5) / W) * 360 - 180;
        const x = (arc(la, lo, lat, lon) * R_KM) / rKm;
        if (x > 1.6) continue;
        let dh = 0;
        if (x < 1) dh = -depth * (1 - x * x) + rimH;
        else dh = rimH * Math.exp(-(((x - 1) / 0.22) ** 2));
        if (rKm > 18 && x < 0.18) dh += depth * 0.35 * (1 - x / 0.18);
        height[j * W + i] += dh;
        if (x < 0.9) {
          const o = (j * W + i) * 3;
          albedo[o] *= 1 - darkFloor;
          albedo[o + 1] *= 1 - darkFloor;
          albedo[o + 2] *= 1 - darkFloor;
        }
      }
    }
  }
}

/** bilinear sample of the global height map (km) */
function mapHeightKm(lat: number, lon: number): number {
  // bicubic (Catmull-Rom) over the 20 km map cells: smooth slopes, no creases along the grid
  const m = marsMaps();
  const W = MAP_W, H = MAP_H;
  const fx = ((lon + 180) / 360) * W - 0.5;
  const fy = ((90 - lat) / 180) * H - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const h = m.height;
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const row = (y: number) => {
    const yy = Math.max(0, Math.min(H - 1, y));
    const o = yy * W;
    const at = (x: number) => h[o + (((x % W) + W) % W)];
    return cr(at(x0 - 1), at(x0), at(x0 + 1), at(x0 + 2), tx);
  };
  return cr(row(y0 - 1), row(y0), row(y0 + 1), row(y0 + 2), ty);
}
// ------------------------------------------------------------------ the real colours
/**
 * The Viking orbiters' colour mosaic of Mars (MDIM 2.1, NASA / JPL / USGS,
 * public domain), equirectangular from 180 W: when it has loaded, the ground's
 * colours come from it, scaled so the planet reflects what Mars really does.
 */
let photo: { lin: Float32Array; w: number; h: number; scale: number } | null = null;
export function setMarsPhoto(img: HTMLImageElement): void {
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, w, h).data;
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const lin = new Float32Array(w * h * 3);
  let sum = 0;
  const c = [0, 0, 0];
  for (let i = 0; i < w * h; i++) {
    c[0] = lut[px[i * 4]];
    c[1] = lut[px[i * 4 + 1]];
    c[2] = lut[px[i * 4 + 2]];
    gradeMars(c);
    lin.set(c, i * 3);
    sum += c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
  }
  photo = { lin, w, h, scale: PHOTO_MEAN / (sum / (w * h)) };
}
/**
 * The mosaic's colours lean grey-pink; true colour, as the rovers and orbiters
 * see it, is a warmer butterscotch: a little more saturation and contrast,
 * shifted toward orange. (The globe's shader does the same: keep them matched.)
 */
export function gradeMars(c: number[]): void {
  const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
  const k = Math.pow(Math.max(1e-4, l) / 0.25, 0.25);
  for (let i = 0; i < 3; i++) c[i] = Math.max(0, l + (c[i] - l) * 1.5) * k;
  c[0] *= 1.12;
  c[1] *= 0.9;
  c[2] *= 0.68;
}
/** what the photo's average is brought to (Mars's ground reflects about a quarter of the light) */
export const PHOTO_MEAN = 0.17;
export function hasMarsPhoto(): boolean {
  return !!photo;
}
export function marsPhotoScale(): number {
  return photo ? photo.scale : 1;
}

/** the map's albedo at a point (linear RGB), smoothly interpolated */
export function mapAlbedo(lat: number, lon: number, out: number[]): void {
  if (photo) {
    const P = photo;
    const fx = ((lon + 180) / 360) * P.w - 0.5;
    const fy = Math.max(0, Math.min(P.h - 1.001, ((90 - lat) / 180) * P.h - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const xa = ((x0 % P.w) + P.w) % P.w, xb = (xa + 1) % P.w, yb = Math.min(P.h - 1, y0 + 1);
    for (let c = 0; c < 3; c++) {
      const a = P.lin[(y0 * P.w + xa) * 3 + c], b = P.lin[(y0 * P.w + xb) * 3 + c], d = P.lin[(yb * P.w + xa) * 3 + c], e = P.lin[(yb * P.w + xb) * 3 + c];
      out[c] = ((a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty) * P.scale;
    }
    return;
  }
  const m = marsMaps();
  const fx = ((lon + 180) / 360) * MAP_W - 0.5;
  const fy = Math.max(0, Math.min(MAP_H - 1.001, ((90 - lat) / 180) * MAP_H - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  let tx = fx - x0, ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const xa = ((x0 % MAP_W) + MAP_W) % MAP_W, xb = (xa + 1) % MAP_W, yb = Math.min(MAP_H - 1, y0 + 1);
  const A = m.albedo;
  for (let c = 0; c < 3; c++) {
    const a = A[(y0 * MAP_W + xa) * 3 + c], b = A[(y0 * MAP_W + xb) * 3 + c], d = A[(yb * MAP_W + xa) * 3 + c], e = A[(yb * MAP_W + xb) * 3 + c];
    out[c] = (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
  }
}

/**
 * The ground's colour close up: the map's albedo broken up at every scale
 * below its 20 km cells. Dark basaltic sand gathers in the low ground and the
 * dune fields; bright dust lies on the rises; streaks and mottling between.
 * (pos in metres on the sphere; detail = local relief in metres)
 */
export function groundTint(px: number, py: number, pz: number, detail: number, out: number[]): void {
  const big = fbm(px / 9000, py / 9000, pz / 9000, 3);
  const mid = fbm(px / 1400 + 7, py / 1400, pz / 1400, 3);
  const fine = fbm(px / 160, py / 160 + 3, pz / 160, 2);
  // low ground collects dark basaltic sand in sharp-edged patches; rises carry bright dust
  const sandRaw = 0.4 - detail / 260 + big * 0.9 + mid * 0.45;
  const sand = Math.max(0, Math.min(1, (sandRaw - 0.35) * 3.2));
  const dust = Math.max(0, Math.min(1, (detail / 220 - 0.2 - mid * 0.6) * 2.2));
  const k = 0.84 + 0.36 * big + 0.2 * mid + 0.1 * fine;
  out[0] *= k * (1 - 0.5 * sand) * (1 + 0.16 * dust);
  out[1] *= k * (1 - 0.46 * sand) * (1 + 0.2 * dust);
  out[2] *= k * (1 - 0.3 * sand) * (1 + 0.24 * dust);
}

/** small craters from a grid of cells in metres on the sphere: each cell may hold one */
function smallCraters(px: number, py: number, pz: number, cell: number, maxR: number, salt: number): number {
  const cx = Math.floor(px / cell), cy = Math.floor(py / cell), cz = Math.floor(pz / cell);
  let h = 0;
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++)
      for (let c = -1; c <= 1; c++) {
        const X = cx + a, Y = cy + b, Z = cz + c;
        const r0 = hash3(X + salt, Y, Z);
        if (r0 > 0.45) continue;
        const r = maxR * Math.pow(hash3(X, Y + salt, Z), 2.2) + maxR * 0.06;
        const qx = (X + hash3(X, Y, Z + salt)) * cell, qy = (Y + hash3(X + 7, Y, Z)) * cell, qz = (Z + hash3(X, Y + 3, Z)) * cell;
        const d = Math.hypot(px - qx, py - qy, pz - qz) / r;
        if (d > 1.5) continue;
        const depth = r * 0.22;
        h += d < 1 ? -depth * (1 - d * d) + depth * 0.25 : depth * 0.25 * Math.exp(-(((d - 1) / 0.2) ** 2));
      }
  return h;
}

/** relief below the map's resolution (m): hills and mesas, dune fields, craters of every size */
export function marsDetail(px: number, py: number, pz: number, spacing = 0, bigK = 1): number {
  // band-limited to the mesh: features smaller than about three vertex spacings fade out
  // (sampled more sparsely they would alias into a jagged horizon)
  const lod = (wave: number) => (spacing <= 0 ? 1 : Math.max(0, Math.min(1, (wave / spacing - 3) / 3)));
  // big rolling hills and ridges, up to the best part of a kilometre
  const big = 1 - Math.abs(fbm(px / 42000 + 3, py / 42000, pz / 42000, 3));
  let h = bigK * 820 * (big * big - 0.42);
  // hills a few kilometres across, sharp-crested
  const kR = lod(11000);
  if (kR > 0) {
    const rid = 1 - Math.abs(fbm(px / 11000, py / 11000, pz / 11000, spacing > 2500 ? 2 : 4));
    h += bigK * kR * 380 * (rid * rid - 0.45);
  }
  // flat-topped rises and the scarps round them
  const kM = lod(7000);
  if (kM > 0) {
    const mesa = fbm(px / 7000 + 11, py / 7000, pz / 7000, 3);
    h += bigK * kM * 210 * Math.max(-0.4, Math.min(0.35, mesa * 1.6));
  }
  // knobs and swells down to a few hundred metres
  const kK = lod(2600);
  if (kK > 0) h += kK * 70 * fbm(px / 2600, py / 2600, pz / 2600, 4);
  // dunes in the low ground: long crests a few hundred metres apart
  const kD = lod(300);
  if (kD > 0) {
    const field = fbm(px / 20000 + 5, py / 20000, pz / 20000, 2);
    if (field > 0.05) {
      const warp = fbm(px / 2500, py / 2500, pz / 2500, 2) * 900;
      const w = Math.sin((px * 0.8 + py * 0.6 + warp) / 70);
      h += kD * Math.min(1, (field - 0.05) * 5) * 9 * w * w;
    }
  }
  const kF = lod(240);
  if (kF > 0) h += kF * 6 * fbm(px / 240, py / 240, pz / 240, 3);
  const kC1 = lod(5200);
  if (kC1 > 0) h += kC1 * smallCraters(px, py, pz, 6000, 2600, 5);
  const kC2 = lod(760);
  if (kC2 > 0) h += kC2 * smallCraters(px, py, pz, 900, 380, 11);
  const kC3 = lod(120);
  if (kC3 > 0) h += kC3 * smallCraters(px, py, pz, 160, 60, 23);
  const kC4 = lod(20);
  if (kC4 > 0) h += kC4 * smallCraters(px, py, pz, 32, 10, 37);
  return h;
}

// ------------------------------------------------------------------ landmarks
// The global map is 20 km a pixel: it smears the craters the rovers explore into
// shallow dips. Round the two rover sites the real shapes are built in: Jezero's
// 45 km crater with its flat lake bed, breached rim and the river delta on its
// west side; Gale's 154 km crater and Mount Sharp (Aeolis Mons), 5 km of layered
// rock rising out of its floor.
interface Landmark {
  lat: number;
  lon: number;
  /** rim radius, km */
  R: number;
  /** floor and rim crest, m, relative to the plains round about */
  floor: number;
  rim: number;
  /** the floor's radius as a fraction of the rim's */
  fl: number;
  /** gaps in the rim: [azimuth from east (rad), half-width (rad)] */
  breaches: [number, number][];
  mound?: { lat: number; lon: number; r: number; h: number };
  delta?: { lat: number; lon: number; r: number; h: number; az: number };
  base?: number;
}
const LANDMARKS: Landmark[] = [
  {
    // Jezero: Neretva Vallis comes in through the west rim; the outlet cuts the east rim
    lat: 18.38, lon: 77.58, R: 22.5, floor: -420, rim: 330, fl: 0.72,
    breaches: [[Math.PI * 0.93, 0.09], [-0.12, 0.07]],
    delta: { lat: 18.5, lon: 77.38, r: 3.6, h: 85, az: Math.PI * 0.93 },
  },
  {
    // Gale: the rim highest to the south; Mount Sharp a little south-east of centre
    lat: -5.37, lon: 137.81, R: 77, floor: -1900, rim: 900, fl: 0.82,
    breaches: [],
    mound: { lat: -5.1, lon: 137.85, r: 30, h: 5200 },
  },
];
const KM_DEG = (R_KM * Math.PI) / 180;
function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
/** the change in height (m) a landmark makes at a point, and how much of the made-up relief to keep there */
function landmark(lat: number, lon: number, molaM: number): { dh: number; keep: number } {
  for (const L of LANDMARKS) {
    const cl = Math.cos(L.lat * D2R);
    let dLon = lon - L.lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const de = dLon * KM_DEG * cl, dn = (lat - L.lat) * KM_DEG;
    const r = Math.hypot(de, dn);
    const rr = r / L.R;
    if (rr > 2.2) continue;
    if (L.base === undefined) {
      // the plains round about: the map's mean on a ring well outside the rim
      let sum = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        sum += mapHeightKm(L.lat + (Math.sin(a) * 1.8 * L.R) / KM_DEG, L.lon + (Math.cos(a) * 1.8 * L.R) / (KM_DEG * cl)) * 1000;
      }
      L.base = sum / 16;
    }
    const az = Math.atan2(dn, de);
    // a rim that rises and falls round the crater
    const rimH = L.rim * (1 + 0.22 * Math.sin(3 * az + 1.3) + 0.12 * Math.sin(7 * az + 0.4) + 0.06 * Math.sin(13 * az + 2.1));
    let p: number;
    if (rr < L.fl) p = L.floor;
    else if (rr < 1) {
      const t = (rr - L.fl) / (1 - L.fl);
      p = L.floor + (rimH - L.floor) * Math.pow(t * t * (3 - 2 * t), 1.35);
    } else p = rimH * Math.exp(-(rr - 1) * 3.4);
    // breaches: the river's gap through the rim, cut down to the floor's level
    for (const [a0, hw] of L.breaches) {
      let da = Math.abs(az - a0);
      if (da > Math.PI) da = 2 * Math.PI - da;
      const w = (1 - smooth(hw * 0.5, hw, da)) * smooth(L.fl * 0.95, L.fl + 0.06, rr) * (1 - smooth(1.15, 1.5, rr));
      p = p + (Math.min(p, L.floor + 140) - p) * w;
    }
    let keep = 0.18 + 0.82 * smooth(L.fl * 0.9, 1.05, rr);
    if (L.mound) {
      const M = L.mound;
      const me = ((lon - M.lon + 540) % 360 - 180) * KM_DEG * Math.cos(M.lat * D2R), mn = (lat - M.lat) * KM_DEG;
      const mr = Math.hypot(me, mn);
      const maz = Math.atan2(mn, me);
      // lobed, not round; layered benches up its flanks
      const rad = M.r * (1 + 0.14 * Math.sin(2 * maz + 0.7) + 0.08 * Math.sin(5 * maz + 2.0));
      if (mr < rad) {
        const k = Math.pow(1 - smooth(0, 1, mr / rad), 1.25);
        let mh = M.h * k;
        mh += 45 * Math.sin(mh / 140) * k;
        p += mh;
        keep = Math.max(keep, 0.55 * k);
      }
    }
    if (L.delta) {
      const D = L.delta;
      const fe = ((lon - D.lon + 540) % 360 - 180) * KM_DEG * Math.cos(D.lat * D2R), fn = (lat - D.lat) * KM_DEG;
      const fr = Math.hypot(fe, fn);
      const faz = Math.atan2(fn, fe);
      // fingers of sediment pushing out into the old lake, and a steep front
      const rad = D.r * (1 + 0.16 * Math.sin(5 * faz + 0.9) + 0.07 * Math.sin(11 * faz));
      const top = 1 - smooth(rad - 0.35, rad + 0.15, fr);
      // the fan's surface rises gently back toward the inlet
      const up = Math.max(0, Math.cos(faz - D.az)) * fr * 9;
      p += (D.h + up) * top;
    }
    const w = 1 - smooth(1.6, 2.2, rr);
    return { dh: (L.base + p - molaM) * w, keep: 1 + (keep - 1) * w };
  }
  return { dh: 0, keep: 1 };
}

/** the ground's height above the datum (m) at a point: the global map plus the fine detail */
export function marsHeight(lat: number, lon: number): number {
  const cl = Math.cos(lat * D2R);
  const R = R_KM * 1000;
  const m = mapHeightKm(lat, lon) * 1000;
  const L = landmark(lat, lon, m);
  return m + L.dh + marsDetail(R * cl * Math.cos(lon * D2R), R * cl * Math.sin(lon * D2R), R * Math.sin(lat * D2R), 0, L.keep);
}

/** the height split into the map's part and the local relief (m), and the point on the sphere */
export function marsHeightParts(lat: number, lon: number, spacing = 0): { base: number; detail: number; px: number; py: number; pz: number } {
  const cl = Math.cos(lat * D2R);
  const R = R_KM * 1000;
  const px = R * cl * Math.cos(lon * D2R), py = R * cl * Math.sin(lon * D2R), pz = R * Math.sin(lat * D2R);
  const m = mapHeightKm(lat, lon) * 1000;
  const L = landmark(lat, lon, m);
  return { base: m + L.dh, detail: marsDetail(px, py, pz, spacing, L.keep), px, py, pz };
}
