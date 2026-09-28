// Offline DSP used to render the sound engine's sample buffers once at
// start-up: filters, seeded noise, slow random envelopes and the pressure
// waveforms that make jet noise sound like jet noise (skewed N-wave shocks,
// i.e. "crackle").

export type Rng = () => number;

/** Seeded PRNG (mulberry32) so every engine voice renders the same each time. */
export function rng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** RBJ biquad, direct form I. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  static lp(sr: number, f: number, q = 0.707): Biquad {
    return new Biquad().set('lp', sr, f, q);
  }
  static hp(sr: number, f: number, q = 0.707): Biquad {
    return new Biquad().set('hp', sr, f, q);
  }
  static bp(sr: number, f: number, q = 0.707): Biquad {
    return new Biquad().set('bp', sr, f, q);
  }
  static peak(sr: number, f: number, q: number, db: number): Biquad {
    return new Biquad().set('peak', sr, f, q, db);
  }

  set(kind: 'lp' | 'hp' | 'bp' | 'peak', sr: number, f: number, q: number, db = 0): this {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const c = Math.cos(w), sn = Math.sin(w);
    const al = sn / (2 * q);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    if (kind === 'lp') {
      b0 = (1 - c) / 2;
      b1 = 1 - c;
      b2 = (1 - c) / 2;
      a0 = 1 + al;
      a1 = -2 * c;
      a2 = 1 - al;
    } else if (kind === 'hp') {
      b0 = (1 + c) / 2;
      b1 = -(1 + c);
      b2 = (1 + c) / 2;
      a0 = 1 + al;
      a1 = -2 * c;
      a2 = 1 - al;
    } else if (kind === 'bp') {
      b0 = al;
      b1 = 0;
      b2 = -al;
      a0 = 1 + al;
      a1 = -2 * c;
      a2 = 1 - al;
    } else {
      const A = Math.pow(10, db / 40);
      b0 = 1 + al * A;
      b1 = -2 * c;
      b2 = 1 - al * A;
      a0 = 1 + al / A;
      a1 = -2 * c;
      a2 = 1 - al / A;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    return this;
  }

  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  /** Filter a whole buffer in place. */
  apply(d: Float32Array): Float32Array {
    for (let i = 0; i < d.length; i++) d[i] = this.run(d[i]);
    return d;
  }
}

/** One-pole lowpass in place. */
export function onePole(d: Float32Array, sr: number, f: number): Float32Array {
  const a = 1 - Math.exp((-2 * Math.PI * f) / sr);
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    y += (d[i] - y) * a;
    d[i] = y;
  }
  return d;
}

export function white(n: number, r: Rng): Float32Array {
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  return d;
}

/** Pink noise (Paul Kellet's refined filter), unit-ish level. */
export function pink(n: number, r: Rng): Float32Array {
  const d = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.2;
    b6 = w * 0.115926;
  }
  return d;
}

/** Brown (red) noise: integrated white with a leak. */
export function brown(n: number, r: Rng): Float32Array {
  const d = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = (y + 0.02 * (r() * 2 - 1)) / 1.02;
    d[i] = y * 3.5;
  }
  return d;
}

/** Slow random envelope, roughly -1..1, band-limited below `hz`. */
export function slow(n: number, sr: number, hz: number, r: Rng): Float32Array {
  const d = new Float32Array(n);
  const a = 1 - Math.exp((-2 * Math.PI * hz) / sr);
  let y = 0, z = 0;
  for (let i = 0; i < n; i++) {
    y += (r() * 2 - 1 - y) * a;
    z += (y - z) * a;
    d[i] = z;
  }
  normalize(d, 1);
  return d;
}

export function normalize(d: Float32Array, peak = 0.9): Float32Array {
  let m = 1e-9;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  const k = peak / m;
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return d;
}

/** Normalise to an RMS level (then soft-limit the rare peaks). */
export function normRms(d: Float32Array, rms = 0.25): Float32Array {
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  const k = rms / Math.max(1e-9, Math.sqrt(s / d.length));
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * k * 1.1) / 1.1;
  return d;
}

/** Cross-fade the end into the start so a looped buffer has no click. */
export function seamless(d: Float32Array, sr: number, sec = 0.08): Float32Array {
  const n = Math.min(Math.floor(sr * sec), Math.floor(d.length / 4));
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const e = d.length - n + i;
    d[i] = d[i] * a + d[e] * (1 - a);
  }
  return d.subarray(0, d.length - n).slice();
}

/**
 * One N-wave shock: an almost instant pressure rise, then a linear fall
 * through zero to the rarefaction and back -- the building block of jet
 * crackle, gunfire cracks and sonic booms. `dur` in samples.
 */
export function nwave(d: Float32Array, t0: number, amp: number, dur: number): void {
  const n = Math.max(2, Math.floor(dur));
  const len = d.length;
  // a two-sample rise keeps it from aliasing
  d[(t0 + len) % len] += amp * 0.5;
  for (let k = 1; k <= n; k++) d[(t0 + k + len) % len] += amp * (1 - (2 * (k - 1)) / n);
}

/**
 * Jet crackle: a stream of positive-going N-wave shocks with a heavy-tailed
 * size distribution, arriving in bursts carried by the large eddies.
 */
export function crackleInto(d: Float32Array, sr: number, rate: number, level: number, r: Rng, burstHz = 3, durMs: [number, number] = [0.25, 2.4]): void {
  const env = slow(d.length, sr, burstHz, r);
  let t = 0;
  while (t < d.length) {
    const e = Math.max(0.05, 0.55 + 0.9 * env[Math.floor(t)]);
    t += Math.max(1, Math.floor((-Math.log(1 - r()) * sr) / (rate * e)));
    if (t >= d.length) break;
    const u = r();
    const amp = level * (0.04 + 0.96 * Math.pow(u, 5)) * (0.6 + 0.8 * e);
    const dur = (sr * (durMs[0] + (durMs[1] - durMs[0]) * r() * r())) / 1000;
    nwave(d, t, amp, dur);
  }
}

/** Multiply by an amplitude envelope 1 + sum(depth * slow(hz)). */
export function modulate(d: Float32Array, sr: number, r: Rng, mods: [number, number][]): Float32Array {
  const envs = mods.map(([hz]) => slow(d.length, sr, hz, r));
  for (let i = 0; i < d.length; i++) {
    let m = 1;
    for (let k = 0; k < mods.length; k++) m += mods[k][1] * envs[k][i];
    d[i] *= Math.max(0, m);
  }
  return d;
}

export function mixInto(dst: Float32Array, src: Float32Array, k: number): Float32Array {
  const n = Math.min(dst.length, src.length);
  for (let i = 0; i < n; i++) dst[i] += src[i] * k;
  return dst;
}
