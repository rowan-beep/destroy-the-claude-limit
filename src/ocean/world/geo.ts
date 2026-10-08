// The ocean's geography as plain data and functions (no three.js): the seabed
// height everywhere, the solid shapes the submarine can strike, the authored
// sites and the named regions. Everything that decides the game (collision,
// mission checks, acoustics, the chart) reads this, so it works the same
// whether or not a region's visuals are loaded.
//
// Frame: x east, z south, y up, metres; sea level y = 0. A heading or bearing is
// in degrees clockwise from north (-z).

/** the playable area (the chart's frame) */
export const WORLD = { minX: -1800, maxX: 1800, minZ: -900, maxZ: 3300 };

/** fictional depth bands of the starter survey submarine (m below the surface) */
export const DEPTH_BANDS = { comfortable: 300, caution: 330, limit: 360 };

// ---------------------------------------------------------------- noise
function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** smooth value noise in [-1, 1] */
export function vnoise(x: number, z: number, seed = 1): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

function fbm(x: number, z: number, oct: number, seed: number): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, z * f, seed + i * 17);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- the layout
/** the coastline: z of the shore (land to the north of it) at x */
export function coastZ(x: number): number {
  const wild = -230 + 55 * Math.sin(x / 310 + 0.6) + 28 * Math.sin(x / 97) + 18 * vnoise(x / 140, 3.1, 5);
  // (straight along the harbor: its quay is the shore)
  const w = smooth(250, 430, Math.abs(x));
  return -222 + (wild + 222) * w;
}

/** the harbor basin, dredged flat inside the breakwater */
export const HARBOR = {
  /** the berth the submarine leaves from and returns to */
  berth: { x: -12, z: -150, heading: 180 },
  /** the opening in the breakwater */
  gate: { x: 0, z: 118, halfWidth: 46 },
  basin: { minX: -235, maxX: 235, minZ: -215, maxZ: 112 },
  depth: 9,
};

/** the authored places of the first expedition */
export const SITES = {
  buoy: { x: 150, z: 430, label: 'TRAINING BUOY' },
  /** the broken freighter, on the upper slope */
  wreck: { x: -260, z: 1180, yaw: 28, label: 'WRECK' },
  /** where the recorder's knock comes from (the voyage recorder lying by the bridge) */
  recorder: { x: -251, z: 1168 },
  /** the identification plate on the stern */
  plate: { x: -278, z: 1214 },
  /** the slow pulse the recorder points to (a later chapter) */
  deepPulse: { x: 640, z: 2860 },
  reef: { x: 560, z: 520, r: 300 },
};

/** named regions, for the chart and the streaming priorities */
export interface Region {
  id: string;
  name: string;
  /** chart label position */
  x: number;
  z: number;
  band: string;
}
export const REGIONS: Region[] = [
  { id: 'harbor', name: 'KESTREL HARBOR', x: 0, z: -40, band: '0–9 m' },
  { id: 'shelf', name: 'COASTAL SHELF', x: -520, z: 420, band: '10–45 m' },
  { id: 'reef', name: 'LANTERN REEF', x: 560, z: 520, band: '12–30 m' },
  { id: 'slope', name: 'THE SLOPE', x: 120, z: 1250, band: '45–180 m' },
  { id: 'wreck', name: 'WRECK SITE', x: -260, z: 1180, band: '≈ 85 m' },
  { id: 'basin', name: 'DEEP BASIN', x: 300, z: 2600, band: '180–340 m' },
];

/** which region a point is in (for the chart's visited marks and the HUD) */
export function regionAt(x: number, z: number): Region {
  const h = HARBOR.basin;
  if (x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ) return REGIONS[0];
  if (Math.hypot(x - SITES.wreck.x, z - SITES.wreck.z) < 220) return REGIONS[4];
  if (Math.hypot(x - SITES.reef.x, z - SITES.reef.z) < SITES.reef.r + 60) return REGIONS[2];
  if (z > 1950) return REGIONS[5];
  if (z > 950) return REGIONS[3];
  return REGIONS[1];
}

/** depth of the open shelf and slope with distance offshore (negative = below sea level) */
function profile(z: number): number {
  const shelf = -10 - 32 * smooth(120, 900, z);
  const slope = -150 * smooth(900, 1900, z);
  const basin = -150 * smooth(1800, 2900, z);
  return shelf + slope + basin;
}

/**
 * Height of the ground (seabed or land) at x, z in metres: below 0 is under
 * water. Deterministic and cheap enough to call per vertex and per physics step.
 */
export function seabedHeight(x: number, z: number): number {
  const cz = coastZ(x);
  const off = z - cz;
  // the open-water profile, with rolling relief and finer texture
  let h = profile(z) + 6 * fbm(x / 260, z / 260, 4, 11) + 1.6 * fbm(x / 40, z / 40, 3, 23);
  // deep basin: long ridges across the abyssal plain
  h += 22 * smooth(1900, 2600, z) * Math.max(0, vnoise(x / 520, z / 900, 41)) ;
  // the reef: knolls and outcrops round its centre
  const dr = Math.hypot(x - SITES.reef.x, z - SITES.reef.z);
  if (dr < SITES.reef.r + 80) {
    const k = 1 - smooth(SITES.reef.r - 120, SITES.reef.r + 80, dr);
    h += k * (9 + 7 * fbm(x / 55, z / 55, 3, 31));
  }
  // the wreck rests on a gentler bench of the slope
  const dw = Math.hypot(x - SITES.wreck.x, z - SITES.wreck.z);
  if (dw < 240) h = h + (-86 - h) * (1 - smooth(110, 240, dw)) * 0.85;
  // the coast: a beach and low hills inland (north of the shoreline)
  if (off < 60) {
    const land = smooth(60, -40, off);
    const hills = 4 + Math.max(0, -off) * 0.09 + 14 * Math.max(0, fbm(x / 300, z / 300, 4, 7) + 0.3) * smooth(0, -260, off);
    h = h + (hills - h) * land;
  }
  // the dredged harbor basin and its quay
  const hb = HARBOR.basin;
  const inX = smooth(hb.minX - 30, hb.minX + 25, x) * smooth(hb.maxX + 30, hb.maxX - 25, x);
  const inZ = smooth(hb.minZ - 40, hb.minZ + 10, z) * smooth(hb.maxZ + 40, hb.maxZ - 10, z);
  const inB = inX * inZ;
  if (inB > 0) h = h + (-HARBOR.depth - 0.6 * fbm(x / 30, z / 30, 2, 3) - h) * inB;
  // the quay along the north side of the basin (where the berth is)
  if (z < hb.minZ + 30 && z > hb.minZ - 60 && x > hb.minX && x < hb.maxX) h = Math.max(h, z < hb.minZ - 6 ? 2.5 : h);
  return h;
}

/** surface normal of the ground (finite differences) */
export function seabedNormal(x: number, z: number, e = 1.5): [number, number, number] {
  const hx = seabedHeight(x + e, z) - seabedHeight(x - e, z);
  const hz = seabedHeight(x, z + e) - seabedHeight(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

/** what the ground is made of at a point (for colour and the scanner) */
export type Ground = 'sand' | 'rock' | 'reef' | 'silt' | 'land' | 'quay';
export function groundAt(x: number, z: number, h = seabedHeight(x, z)): Ground {
  if (h > 0.5) return 'land';
  const hb = HARBOR.basin;
  if (x > hb.minX && x < hb.maxX && z > hb.minZ && z < hb.maxZ) return 'sand';
  if (Math.hypot(x - SITES.reef.x, z - SITES.reef.z) < SITES.reef.r && h > -32) return 'reef';
  if (h < -150) return 'silt';
  const n = seabedNormal(x, z, 3);
  return n[1] < 0.86 ? 'rock' : 'sand';
}

// ---------------------------------------------------------------- solid shapes
/** an oriented box (yaw in degrees about y), or an upright cylinder, or a sphere */
export type Collider =
  | { kind: 'box'; x: number; y: number; z: number; hx: number; hy: number; hz: number; yaw: number; tag: string }
  | { kind: 'cyl'; x: number; z: number; y0: number; y1: number; r: number; tag: string }
  | { kind: 'sphere'; x: number; y: number; z: number; r: number; tag: string };

const DEG = Math.PI / 180;

function breakwater(out: Collider[], x0: number, z0: number, x1: number, z1: number, tag: string): void {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, -(z1 - z0)) / DEG;
  out.push({ kind: 'box', x: cx, y: -3, z: cz, hx: 9, hy: 9, hz: len / 2, yaw, tag });
}

/** every solid shape of the first region set (cheap enough to test against them all) */
export function buildColliders(): Collider[] {
  const c: Collider[] = [];
  // the breakwater: two arms leaving a gate in the middle
  breakwater(c, -250, -190, -HARBOR.gate.halfWidth - 6, HARBOR.gate.z, 'breakwater');
  breakwater(c, 250, -190, HARBOR.gate.halfWidth + 6, HARBOR.gate.z, 'breakwater');
  // the pier running out from the quay, and its berth
  c.push({ kind: 'box', x: -26, y: 0.6, z: -150, hx: 6, hy: 2.2, hz: 48, yaw: 0, tag: 'pier' });
  for (let i = 0; i < 6; i++) c.push({ kind: 'cyl', x: -26 + (i % 2 ? 5 : -5), z: -186 + Math.floor(i / 2) * 30, y0: -12, y1: 1, r: 0.7, tag: 'pile' });
  // the training buoy and its mooring
  c.push({ kind: 'cyl', x: SITES.buoy.x, z: SITES.buoy.z, y0: -2.5, y1: 3.5, r: 1.4, tag: 'buoy' });
  // the wreck: stern section with the bridge, the broken-off bow, the crane, the boxes of cargo
  const w = SITES.wreck;
  const ry = w.yaw;
  const at = (lx: number, lz: number) => {
    const s = Math.sin(ry * DEG), co = Math.cos(ry * DEG);
    return { x: w.x + lx * co - lz * s, z: w.z + lx * s + lz * co };
  };
  const ground = seabedHeight(w.x, w.z);
  const stern = at(0, 24);
  c.push({ kind: 'box', x: stern.x, y: ground + 6, z: stern.z, hx: 7.5, hy: 6, hz: 30, yaw: ry, tag: 'wreck-hull' });
  const bridge = at(0, 40);
  c.push({ kind: 'box', x: bridge.x, y: ground + 15, z: bridge.z, hx: 6, hy: 4, hz: 5, yaw: ry, tag: 'wreck-bridge' });
  const bow = at(9, -32);
  c.push({ kind: 'box', x: bow.x, y: ground + 5, z: bow.z, hx: 7, hy: 5.5, hz: 18, yaw: ry + 21, tag: 'wreck-bow' });
  const crane = at(-2, 2);
  c.push({ kind: 'cyl', x: crane.x, z: crane.z, y0: ground + 10, y1: ground + 24, r: 0.9, tag: 'wreck-crane' });
  for (let i = 0; i < 6; i++) {
    const p = at(-14 - i * 7, -48 - i * 13 + (i % 2) * 6);
    c.push({ kind: 'box', x: p.x, y: seabedHeight(p.x, p.z) + 1.3, z: p.z, hx: 1.25, hy: 1.3, hz: 3, yaw: ry + i * 23, tag: 'cargo' });
  }
  // reef arches: a few big rocks the submarine must steer round
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.4, r = 70 + (i % 3) * 70;
    const x = SITES.reef.x + Math.cos(a) * r, z = SITES.reef.z + Math.sin(a) * r;
    c.push({ kind: 'sphere', x, y: seabedHeight(x, z) + 3, z, r: 5 + (i % 3) * 2, tag: 'reef-rock' });
  }
  return c;
}

/** the closest point on a collider to p, and the distance (negative inside) */
export function colliderDistance(cl: Collider, px: number, py: number, pz: number): { d: number; nx: number; ny: number; nz: number } {
  if (cl.kind === 'sphere') {
    const dx = px - cl.x, dy = py - cl.y, dz = pz - cl.z;
    const l = Math.hypot(dx, dy, dz) || 1e-6;
    return { d: l - cl.r, nx: dx / l, ny: dy / l, nz: dz / l };
  }
  if (cl.kind === 'cyl') {
    const dx = px - cl.x, dz = pz - cl.z;
    const lr = Math.hypot(dx, dz) || 1e-6;
    const dr = lr - cl.r;
    const dyTop = py - cl.y1, dyBot = cl.y0 - py;
    const dy = Math.max(dyTop, dyBot);
    if (dr > 0 && dy > 0) {
      const l = Math.hypot(dr, dy);
      return { d: l, nx: (dx / lr) * (dr / l), ny: (dyTop > dyBot ? 1 : -1) * (dy / l), nz: (dz / lr) * (dr / l) };
    }
    if (dr > dy) return { d: dr, nx: dx / lr, ny: 0, nz: dz / lr };
    return { d: dy, nx: 0, ny: dyTop > dyBot ? 1 : -1, nz: 0 };
  }
  // box: into its frame
  const s = Math.sin(cl.yaw * DEG), co = Math.cos(cl.yaw * DEG);
  const rx = px - cl.x, ry = py - cl.y, rz = pz - cl.z;
  const lx = rx * co + rz * s, lz = -rx * s + rz * co;
  const qx = Math.abs(lx) - cl.hx, qy = Math.abs(ry) - cl.hy, qz = Math.abs(lz) - cl.hz;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  const outside = Math.hypot(ox, oy, oz);
  let nlx = 0, nly = 0, nlz = 0, d: number;
  if (outside > 0) {
    d = outside;
    nlx = (ox * Math.sign(lx)) / outside;
    nly = (oy * Math.sign(ry)) / outside;
    nlz = (oz * Math.sign(lz)) / outside;
  } else {
    d = Math.max(qx, qy, qz);
    if (d === qx) nlx = Math.sign(lx) || 1;
    else if (d === qy) nly = Math.sign(ry) || 1;
    else nlz = Math.sign(lz) || 1;
  }
  // back to the world frame
  return { d, nx: nlx * co - nlz * s, ny: nly, nz: nlx * s + nlz * co };
}

// ---------------------------------------------------------------- helpers
/** bearing from a to b, degrees clockwise from north (-z), 0..360 */
export function bearing(ax: number, az: number, bx: number, bz: number): number {
  const b = Math.atan2(bx - ax, -(bz - az)) / DEG;
  return (b + 360) % 360;
}

/** signed smallest difference a - b in degrees (-180..180) */
export function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** a gentle current on the slope (m/s), steady and bounded; none in the harbor */
export function currentAt(x: number, z: number, depth: number): { x: number; z: number } {
  const k = smooth(800, 1100, z) * (1 - smooth(1500, 1900, z)) * smooth(20, 60, depth);
  return { x: 0.16 * k, z: 0.04 * k };
}
