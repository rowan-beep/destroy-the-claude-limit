// Listening, pinging and triangulating: a deliberately simplified acoustic
// model with fictional tuning (decibels here are game numbers, not a sonar
// equation to rely on). Pure TypeScript: the same numbers drive the sound, the
// listening display, the bearings and the Echo Atlas on every quality preset.

import { seabedHeight, colliderDistance, bearing, angleDiff, type Collider, SITES } from '../world/geo';

export type PatternKind = 'knock' | 'pulse' | 'chirp';

/** what a contact sounds like, also described in words and drawn (hearing is never required) */
export interface SoundPattern {
  kind: PatternKind;
  /** seconds between repeats */
  period: number;
  /** hits in each repeat */
  beats: number;
  /** pitch of a hit (Hz) */
  pitch: number;
  caption: string;
}

export interface ContactDef {
  id: string;
  /** what the player calls it before it is understood */
  unknownLabel: string;
  x: number;
  y: number;
  z: number;
  /** source level (game dB) */
  level: number;
  pattern: SoundPattern;
}

export const CONTACTS: ContactDef[] = [
  {
    id: 'knock',
    unknownLabel: 'INTERMITTENT KNOCK',
    x: SITES.recorder.x,
    y: seabedHeight(SITES.recorder.x, SITES.recorder.z) + 1,
    z: SITES.recorder.z,
    level: 128,
    pattern: { kind: 'knock', period: 2.4, beats: 2, pitch: 420, caption: 'Two dull metallic knocks, every 2.4 s' },
  },
  {
    id: 'deep-pulse',
    unknownLabel: 'SLOW PULSE',
    x: SITES.deepPulse.x,
    y: seabedHeight(SITES.deepPulse.x, SITES.deepPulse.z) + 2,
    z: SITES.deepPulse.z,
    level: 132,
    pattern: { kind: 'pulse', period: 6.5, beats: 1, pitch: 95, caption: 'A long low pulse, every 6.5 s' },
  },
];

/** background sea noise (game dB), louder near a windy surface */
export function ambientNoise(depth: number, wind: number): number {
  return 52 + wind * 12 * Math.max(0, 1 - depth / 25);
}

/** the submarine's own noise: thrusters, pumps, flow over the hull */
export function selfNoise(out: { thrust: number; lateral: number; vertical: number; pumping: boolean }, speed: number): number {
  return 38 + 24 * Math.abs(out.thrust) + 9 * Math.abs(out.vertical) + 8 * Math.abs(out.lateral) + 10 * Math.min(1, speed / 4) + (out.pumping ? 14 : 0);
}

/** how long a ping rings in the water (s), masking faint contacts */
export const PING_MASK_S = 6;

/** extra noise from the ping's ringing, decaying to nothing over PING_MASK_S */
export function pingMask(sincePing: number): number {
  if (sincePing < 0 || sincePing >= PING_MASK_S) return 0;
  return 40 * (1 - sincePing / PING_MASK_S);
}

/** decibel sum of noise sources */
export function addDb(...dbs: number[]): number {
  let p = 0;
  for (const d of dbs) p += Math.pow(10, d / 10);
  return 10 * Math.log10(p);
}

/** what arrives from a contact at a listener (game dB) */
export function receivedLevel(c: ContactDef, x: number, y: number, z: number): number {
  const d = Math.max(1, Math.hypot(c.x - x, c.y - y, c.z - z));
  return c.level - 20 * Math.log10(d) - 0.0035 * d;
}

/** a contact is heard above this signal-to-noise ratio (dB) */
export const HEAR_SNR = 4;

/** half-width of the bearing wedge (degrees): a cleaner signal gives a narrower wedge */
export function bearingHalfWidth(snr: number): number {
  return Math.max(3, Math.min(22, 24 - 1.3 * snr));
}

/** a bearing measurement: the true bearing with an error inside the wedge (deterministic for a seed) */
export function measureBearing(trueBearing: number, halfWidth: number, seed: number): number {
  const r = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  const u = (r - Math.floor(r)) * 2 - 1;
  return (trueBearing + u * halfWidth * 0.35 + 360) % 360;
}

/** listening from a position: the snr and true bearing of every contact */
export function listen(
  x: number,
  y: number,
  z: number,
  noise: number,
  contacts: ContactDef[] = CONTACTS,
  active: (id: string) => boolean = () => true,
): { id: string; snr: number; bearing: number }[] {
  const out: { id: string; snr: number; bearing: number }[] = [];
  for (const c of contacts) {
    if (!active(c.id)) continue;
    out.push({ id: c.id, snr: receivedLevel(c, x, y, z) - noise, bearing: bearing(x, z, c.x, c.z) });
  }
  return out;
}

// ---------------------------------------------------------------- Quiet Survey
/** seconds of steady listening that earn a bearing */
export const LISTEN_TIME = 3.5;

/**
 * The listening procedure: progress fills while the contact is heard and the
 * vehicle is steady, and drains when it is not.
 */
export class ListenGauge {
  progress = 0;
  /** why it isn't filling (for the HUD), or '' */
  blocker = '';

  update(dt: number, snr: number, speed: number, yawRate: number, masked: boolean): boolean {
    let why = '';
    if (masked) why = 'PING STILL RINGING';
    else if (speed > 1.2) why = 'TOO FAST: COAST TO LISTEN';
    else if (Math.abs(yawRate) > 6) why = 'HOLD STILL: TURNING';
    else if (snr < HEAR_SNR) why = 'NOTHING CLEAR ABOVE THE NOISE';
    this.blocker = why;
    if (why) this.progress = Math.max(0, this.progress - dt / LISTEN_TIME);
    else this.progress = Math.min(1, this.progress + dt / LISTEN_TIME);
    return this.progress >= 1;
  }

  reset(): void {
    this.progress = 0;
  }
}

// ---------------------------------------------------------------- triangulation
export interface BearingLine {
  x: number;
  z: number;
  bearing: number;
  halfWidth: number;
}

export interface Fix {
  x: number;
  z: number;
  /** rough radius of the search area (m) */
  r: number;
  /** widest angle between the bearings (degrees, 0..90) */
  crossing: number;
}

/** the smallest angle between two bearing lines (0..90) */
export function crossingAngle(a: number, b: number): number {
  const d = Math.abs(angleDiff(a, b)) % 180;
  return d > 90 ? 180 - d : d;
}

/**
 * Least-squares crossing of two or more bearing lines, weighted by how sharp
 * each is. Null when the lines don't cross usefully (too parallel, or the
 * crossing lies behind an observer).
 */
export function triangulate(lines: BearingLine[], minCrossing = 15): Fix | null {
  if (lines.length < 2) return null;
  let crossing = 0;
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) crossing = Math.max(crossing, crossingAngle(lines[i].bearing, lines[j].bearing));
  if (crossing < minCrossing) return null;
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (const l of lines) {
    const t = (l.bearing * Math.PI) / 180;
    const dx = Math.sin(t), dz = -Math.cos(t);
    const nx = -dz, nz = dx;
    const w = 1 / (l.halfWidth * l.halfWidth);
    a11 += w * nx * nx;
    a12 += w * nx * nz;
    a22 += w * nz * nz;
    const c = nx * l.x + nz * l.z;
    b1 += w * nx * c;
    b2 += w * nz * c;
  }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-12) return null;
  const x = (a22 * b1 - a12 * b2) / det;
  const z = (a11 * b2 - a12 * b1) / det;
  // in front of every observer
  let dSum = 0, hwSum = 0;
  for (const l of lines) {
    const t = (l.bearing * Math.PI) / 180;
    const along = (x - l.x) * Math.sin(t) + (z - l.z) * -Math.cos(t);
    if (along < 0) return null;
    dSum += along;
    hwSum += l.halfWidth;
  }
  const dAvg = dSum / lines.length;
  const hw = ((hwSum / lines.length) * Math.PI) / 180;
  const r = Math.max(25, (dAvg * Math.tan(hw)) / Math.sin((crossing * Math.PI) / 180));
  return { x, z, r, crossing };
}

/** the four corners where two bearing wedges overlap (for drawing the search area), or null */
export function wedgeOverlap(a: BearingLine, b: BearingLine): [number, number][] | null {
  const ray = (l: BearingLine, off: number) => {
    const t = ((l.bearing + off) * Math.PI) / 180;
    return { x: l.x, z: l.z, dx: Math.sin(t), dz: -Math.cos(t) };
  };
  const hit = (p: ReturnType<typeof ray>, q: ReturnType<typeof ray>): [number, number] | null => {
    const den = p.dx * q.dz - p.dz * q.dx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((q.x - p.x) * q.dz - (q.z - p.z) * q.dx) / den;
    const u = ((q.x - p.x) * p.dz - (q.z - p.z) * p.dx) / den;
    if (t < 0 || u < 0) return null;
    return [p.x + p.dx * t, p.z + p.dz * t];
  };
  const pts: [number, number][] = [];
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const h = hit(ray(a, sa * a.halfWidth), ray(b, sb * b.halfWidth));
    if (!h) return null;
    pts.push(h);
  }
  // order round the centre
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cz = pts.reduce((s, p) => s + p[1], 0) / 4;
  pts.sort((p, q) => Math.atan2(p[1] - cz, p[0] - cx) - Math.atan2(q[1] - cz, q[0] - cx));
  return pts;
}

// ---------------------------------------------------------------- active sonar
export interface SonarReturn {
  /** bearing (deg) */
  b: number;
  /** range (m), or -1 for nothing within reach */
  r: number;
  /** 0..1: a hard man-made surface returns strongest */
  s: number;
  /** what it hit */
  kind: 'none' | 'terrain' | 'object';
  tag: string;
}

export const SONAR_RANGE = 280;

/**
 * Cast sonar rays round the vehicle at its depth: the first ground or object
 * each meets. `from`..`to` (indices of `count` rays) lets a ping spread its work
 * over several frames.
 */
export function sonarRays(x: number, y: number, z: number, colliders: Collider[], count: number, from: number, to: number, step = 5): SonarReturn[] {
  const out: SonarReturn[] = [];
  const near = colliders.filter((c) => Math.abs(c.x - x) < SONAR_RANGE + 40 && Math.abs(c.z - z) < SONAR_RANGE + 40);
  for (let i = from; i < to; i++) {
    const b = (i / count) * 360;
    const t = (b * Math.PI) / 180;
    const dx = Math.sin(t), dz = -Math.cos(t);
    let ret: SonarReturn = { b, r: -1, s: 0, kind: 'none', tag: '' };
    for (let r = step; r <= SONAR_RANGE; r += step) {
      const px = x + dx * r, pz = z + dz * r;
      // the beam fans out downward a little: ground a few metres below the vehicle answers too
      const g = seabedHeight(px, pz);
      if (g > y - 2 - r * 0.02) {
        ret = { b, r, s: 0.55 * (1 - r / SONAR_RANGE) + 0.25, kind: 'terrain', tag: 'seabed' };
        break;
      }
      let hitTag = '';
      for (const c of near) {
        if (colliderDistance(c, px, y - r * 0.02, pz).d < 2.5) {
          hitTag = c.tag;
          break;
        }
      }
      if (hitTag) {
        ret = { b, r, s: 1, kind: 'object', tag: hitTag };
        break;
      }
    }
    out.push(ret);
  }
  return out;
}
