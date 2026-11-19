// The game's sound bank: every looping noise bed, engine roar, wind, boom and the
// reverb impulse, synthesised from scratch (no recordings). Pure functions of the
// sample rate, so they can run in a worker (synthWorker.ts) while the menu is up:
// synthesising them on the main thread froze the screen and the music for a second.

import { Biquad, brown, crackleInto, hash, mixInto, modulate, normalize, normRms, nwave, onePole, pink, rng, Rng, seamless, slow, white } from './dsp';

/** overall crackle level (1 = the original mix; players wanted it far subtler) */
export const CRACKLE = 0.1;

/** the bank: each sound's channels (one or two), at the rate it was made for */
export type Bank = Record<string, Float32Array[]>;

function rms(d: Float32Array): number {
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, d.length));
}

/** Jet mixing noise: the broad hump of a real jet spectrum, breathing with the eddies, with light crackle. */
function renderJet(n: number, sr: number, r: Rng): Float32Array {
  const d = pink(n, r);
  mixInto(d, brown(n, r), 0.4);
  Biquad.hp(sr, 30, 0.7).apply(d);
  Biquad.peak(sr, 150, 0.6, 7).apply(d);
  Biquad.peak(sr, 620, 0.9, 3).apply(d);
  Biquad.lp(sr, 3400, 0.55).apply(d);
  modulate(d, sr, r, [
    [1.3, 0.3],
    [6, 0.14],
    [19, 0.07],
  ]);
  const c = new Float32Array(n);
  crackleInto(c, sr, 50, 1, r, 2);
  Biquad.hp(sr, 500, 0.7).apply(c);
  onePole(c, sr, 9000);
  const k = (0.12 * CRACKLE * rms(d)) / Math.max(1e-9, rms(c));
  return mixInto(d, c, k);
}

/** Crackle on its own: bursts of skewed shocks, the ripping edge of a jet at high power. */
function renderCrackle(n: number, sr: number, r: Rng): Float32Array {
  const d = new Float32Array(n);
  crackleInto(d, sr, 420, 1, r, 3.5);
  Biquad.hp(sr, 380, 0.7).apply(d);
  onePole(d, sr, 11000);
  // a little of the roar under the shocks so the layer blends in
  const bed = pink(n, r);
  Biquad.bp(sr, 1400, 0.5).apply(bed);
  return mixInto(d, bed, (0.25 * rms(d)) / Math.max(1e-9, rms(bed)));
}

/** Afterburner: lower, heavier, fluttering roar, sub-bass pressure, reheat pops and crackle. */
function renderAb(n: number, sr: number, r: Rng): Float32Array {
  const d = brown(n, r);
  for (let i = 0; i < n; i++) d[i] *= 0.6;
  mixInto(d, pink(n, r), 0.55);
  Biquad.hp(sr, 20, 0.7).apply(d);
  Biquad.peak(sr, 58, 0.9, 6).apply(d);
  Biquad.peak(sr, 145, 0.7, 4).apply(d);
  Biquad.lp(sr, 1700, 0.5).apply(d);
  // combustion throb and flutter
  modulate(d, sr, r, [
    [14, 0.3],
    [4, 0.2],
    [0.8, 0.14],
  ]);
  const base = rms(d);
  // reheat pops: irregular low thumps
  let t = 0;
  while (t < n) {
    t += Math.floor((-Math.log(1 - r()) * sr) / 5);
    const f = 38 + r() * 40, len = Math.floor(sr * (0.05 + r() * 0.08)), a = base * (0.8 + r() * 2.2);
    for (let k = 0; k < len && t + k < n; k++) d[t + k] += a * Math.sin((2 * Math.PI * f * k) / sr) * Math.exp((-5 * k) / len);
  }
  const c = new Float32Array(n);
  crackleInto(c, sr, 170, 1, r, 5);
  Biquad.hp(sr, 300, 0.7).apply(c);
  onePole(c, sr, 7000);
  return mixInto(d, c, (0.3 * CRACKLE * base) / Math.max(1e-9, rms(c)));
}

/** Airflow: boundary-layer rush with gusts. */
function renderWind(n: number, sr: number, r: Rng): Float32Array {
  const d = pink(n, r);
  Biquad.hp(sr, 80, 0.7).apply(d);
  Biquad.lp(sr, 7000, 0.6).apply(d);
  return modulate(d, sr, r, [
    [0.6, 0.25],
    [3, 0.1],
  ]);
}

/** Rocket motor: harsh, dense crackle over a bright roar, fluttering. */
function renderRocket(n: number, sr: number, r: Rng): Float32Array {
  const d = white(n, r);
  for (let i = 0; i < n; i++) d[i] *= 0.5;
  mixInto(d, pink(n, r), 0.8);
  Biquad.hp(sr, 180, 0.7).apply(d);
  Biquad.peak(sr, 1500, 0.6, 5).apply(d);
  Biquad.lp(sr, 8000, 0.6).apply(d);
  const c = new Float32Array(n);
  crackleInto(c, sr, 1100, 1, r, 8, [0.15, 1.2]);
  Biquad.hp(sr, 600, 0.7).apply(c);
  mixInto(d, c, (0.6 * rms(d)) / Math.max(1e-9, rms(c)));
  return modulate(d, sr, r, [
    [25, 0.25],
    [6, 0.15],
  ]);
}

/**
 * An explosion heard from nearby: the blast wave (an N-wave), the fireball's
 * roar, a long rolling rumble, falling debris, and echoes off the ground and
 * hills. Played slower / filtered / delayed for distance.
 */
function renderBoom(n: number, sr: number, r: Rng): Float32Array {
  const d = new Float32Array(n);
  nwave(d, Math.floor(sr * 0.01), 1, sr * 0.007);
  const fire = pink(n, r);
  mixInto(fire, brown(n, r), 0.8);
  Biquad.lp(sr, 2200, 0.6).apply(fire);
  const roll = brown(n, r);
  Biquad.lp(sr, 160, 0.8).apply(roll);
  const rollAm = slow(n, sr, 2.5, r);
  const deb = new Float32Array(n);
  crackleInto(deb, sr, 260, 1, r, 4, [0.1, 0.8]);
  Biquad.hp(sr, 900, 0.7).apply(deb);
  const fk = 0.5 / Math.max(1e-9, rms(fire.subarray(0, sr)));
  const rk = 0.55 / Math.max(1e-9, rms(roll.subarray(0, sr)));
  const dk = 0.12 / Math.max(1e-9, rms(deb.subarray(0, sr)));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const att = Math.min(1, t / 0.008);
    d[i] += fire[i] * fk * att * Math.exp(-t / 0.32);
    d[i] += roll[i] * rk * Math.min(1, t / 0.05) * Math.exp(-t / 1.5) * (0.6 + 0.5 * rollAm[i]);
    d[i] += deb[i] * dk * Math.min(1, t / 0.15) * Math.exp(-t / 0.6);
  }
  // echoes off the ground and the hills
  const src = d.slice(0, Math.floor(sr * 1.2));
  onePole(src, sr, 1800);
  for (const [delay, g] of [
    [0.11, 0.35],
    [0.27, 0.24],
    [0.62, 0.15],
    [1.1, 0.08],
  ]) {
    const o = Math.floor(sr * delay);
    for (let i = 0; i < src.length && i + o < n; i++) d[i + o] += src[i] * g;
  }
  return normalize(d, 0.95);
}


/**
 * A sonic boom as a thunderclap: what lightning striking right next to you sounds like. A ripping,
 * tearing crack (the nose and tail shocks inside a cluster of smaller ones), the blast's deep punch
 * and roar, then the thunder rolling away for seconds in uneven waves, each later one darker and
 * fainter, and the echoes off the ground and the hills. The body is driven into the soft saturation
 * of a recording of something too loud for the microphone; the crack stays clean on top of it.
 * `t0s`: where the crack falls (s); `gap`: nose to tail shock (s); `rollSec`: how long it rolls.
 */
function renderThunder(n: number, sr: number, r: Rng, t0s: number, gap: number, rollSec: number): Float32Array {
  // the crack (d) and the body under it (b), mixed at the end
  const d = new Float32Array(n);
  const b = new Float32Array(n);
  const t0 = Math.floor(sr * t0s);
  // the crack: the nose and tail shocks
  nwave(d, t0, 1, sr * 0.005);
  nwave(d, t0 + Math.floor(sr * gap), 0.9, sr * 0.0055);
  // (it is rendered at start-up, so each layer is only as long as it is heard, and the slow
  // envelopes are worked out every 32 samples and drawn straight between)
  const len = (sec: number) => Math.min(n - t0, Math.floor(sr * sec));
  // the tearing round them: bright noise opened by a cluster of small shocks, thinning out
  const nt = len(0.6);
  const tear = white(nt, r);
  Biquad.hp(sr, 1300, 0.6).apply(tear);
  const tk = 1 / Math.max(1e-9, rms(tear));
  const gate = new Float32Array(nt);
  const span = Math.floor(sr * 0.34);
  for (let k = 0; k < 80; k++) {
    const at = Math.floor(Math.pow(r(), 1.7) * span);
    const amp = (0.3 + 0.7 * r()) * (1 - at / span) ** 0.5;
    const ln = Math.max(8, Math.floor(sr * (0.002 + 0.012 * r())));
    nwave(d, t0 + at, 0.18 * amp * (r() < 0.5 ? 1 : 0.6), ln * 0.4);
    for (let i = 0, g = amp, kd = Math.exp(-1 / (ln * 0.35)); i < ln && at + i < nt; i++, g *= kd) gate[at + i] = Math.max(gate[at + i], g);
  }
  for (let i = 0, f = 0.25, kf = Math.exp(-1 / (sr * 0.05)); i < nt; i++, f *= kf) d[t0 + i] += tear[i] * tk * (0.5 * gate[i] + f) * Math.min(1, i / (sr * 0.0015));
  // the punch: a sine falling from 90 Hz to 30 Hz, felt more than heard
  {
    const np = len(2.5);
    const kf = Math.exp(-1 / (sr * 0.11)), ka = Math.exp(-1 / (sr * 0.38));
    let ph = 0, fx = 60, a = 1.15;
    for (let i = 0; i < np; i++, fx *= kf, a *= ka) {
      ph += (2 * Math.PI * (30 + fx)) / sr;
      b[t0 + i] += Math.sin(ph) * a * Math.min(1, i / (sr * 0.003));
    }
  }
  // the blast's roar, gone in a breath
  {
    const nb = len(1.6);
    const blast = pink(nb, r);
    mixInto(blast, brown(nb, r), 1);
    Biquad.lp(sr, 1800, 0.6).apply(blast);
    const bk = 0.6 / Math.max(1e-9, rms(blast.subarray(0, Math.min(nb, sr))));
    const ka = Math.exp(-1 / (sr * 0.24));
    for (let i = 0, a = bk; i < nb; i++, a *= ka) b[t0 + i] += blast[i] * a * Math.min(1, i / (sr * 0.004));
  }
  // the thunder rolling: deep rumble with some low-mid growl, in waves
  const nr = n - t0;
  const rum = brown(nr, r);
  Biquad.lp(sr, 115, 0.8).apply(rum);
  const ng = len(4);
  const growl = pink(ng, r);
  Biquad.bp(sr, 280, 0.7).apply(growl);
  const rk = 0.75 / Math.max(1e-9, rms(rum.subarray(0, Math.min(nr, sr))));
  const gk = 0.32 / Math.max(1e-9, rms(growl.subarray(0, Math.min(ng, sr))));
  const waves: [number, number, number][] = [[0.03, 1, 0.55]];
  let amp = 0.8;
  for (let at = 0.35 + 0.25 * r(); at < rollSec * 0.8; at += 0.3 + 0.55 * r()) {
    waves.push([at, amp * (0.6 + 0.4 * r()), 0.25 + 0.5 * r()]);
    amp *= 0.72;
  }
  const env = (t: number): number => {
    let e = 0;
    for (const [at, a, w] of waves) {
      const u = t - at;
      if (u > 0) e += a * (1 - Math.exp(-u / 0.06)) * Math.exp(-u / w);
    }
    // the long tail under the rolls, fading by the end
    return e + 0.35 * Math.min(1, t / 0.1) * Math.exp(-t / (rollSec * 0.4));
  };
  const B = 32;
  let e0 = env(0), g0 = gk;
  for (let j = 0; j < nr; j += B) {
    const t1 = (j + B) / sr;
    const e1 = env(t1), g1 = gk * Math.exp(-t1 / 0.9);
    for (let k = 0; k < B && j + k < nr; k++) {
      const i = j + k, x = k / B;
      const gr = i < ng ? growl[i] * (g0 + (g1 - g0) * x) : 0;
      b[t0 + i] += (e0 + (e1 - e0) * x) * (rum[i] * rk + gr);
    }
    e0 = e1;
    g0 = g1;
  }
  // too loud for the microphone: soft saturation lifts the body and the rolls; the crack rides on top
  normalize(b, 1);
  const drive = 2.4, dk = 1 / Math.tanh(drive);
  for (let i = 0; i < n; i++) b[i] = Math.tanh(b[i] * drive) * dk;
  normalize(d, 1);
  for (let i = 0; i < n; i++) d[i] += b[i] * 0.55;
  // echoes off the ground and the hills
  const src = d.slice(t0, t0 + Math.floor(sr * 0.9));
  onePole(src, sr, 1500);
  for (const [delay, g] of [
    [0.12, 0.32],
    [0.29, 0.22],
    [0.6, 0.15],
    [1.1, 0.09],
    [1.7, 0.05],
  ]) {
    const o = t0 + Math.floor(sr * delay);
    for (let i = 0; i < src.length && i + o < n; i++) d[i + o] += src[i] * g;
  }
  // a gentle limit on the sum, so the crack and the punch together do not leave the rest quiet
  normalize(d, 1);
  for (let i = 0; i < n; i++) d[i] = Math.tanh(d[i] * 1.4) / Math.tanh(1.4);
  // and a short fade so the end never clicks
  const fo = Math.floor(sr * 0.3);
  for (let i = 0; i < fo; i++) d[n - 1 - i] *= i / fo;
  return normalize(d, 0.95);
}

/** A sonic boom heard from the ground or another jet: the thunderclap, the shocks a little apart. */
function renderSonicBoom(n: number, sr: number, r: Rng): Float32Array {
  return renderThunder(n, sr, r, 0.005, 0.12, 4.2);
}

/**
 * Breaking the sound barrier yourself: the thunderclap the moment the jet passes Mach 1 (no build-up:
 * it lands with the explosion of the shock cone), the shocks close together.
 * (A real pilot hears none of this: the shock stays behind the cockpit. This is the cinema of it.)
 */
function renderBarrier(n: number, sr: number, r: Rng): Float32Array {
  return renderThunder(n, sr, r, 0.008, 0.09, 5);
}

/** A round passing close: the supersonic crack of the bullet's own shock. */
function renderCrack(n: number, sr: number, r: Rng): Float32Array {
  const d = new Float32Array(n);
  nwave(d, 2, 1, sr * 0.00035);
  const h = white(n, r);
  Biquad.hp(sr, 2500, 0.7).apply(h);
  for (let i = 0; i < n; i++) d[i] += h[i] * 0.3 * Math.exp(-i / (sr * 0.004));
  return normalize(d, 0.9);
}

/**
 * One loop of gunfire at `rpm`, shot by shot: the muzzle blast's N-wave, the
 * mechanism and airframe thump, a panel ringing, and the feed clattering
 * between rounds. At 6000 rpm the shots merge into the M61's growl.
 */

/** Two partly correlated channels from a mono renderer (a wide but solid image). */
function stereo(sr: number, sec: number, seed: number, render: (n: number, sr: number, r: Rng) => Float32Array, width = 0.45, loop = true): Float32Array[] {
  const n = Math.floor(sr * sec);
  const a = render(n, sr, rng(seed));
  const b = render(n, sr, rng(seed * 7 + 13));
  const l = new Float32Array(n), r = new Float32Array(n);
  const k = 1 - width;
  for (let i = 0; i < n; i++) {
    l[i] = a[i] + b[i] * k;
    r[i] = b[i] + a[i] * k;
  }
  normRms(l, 0.22);
  normRms(r, 0.22);
  return loop ? [seamless(l, sr), seamless(r, sr)] : [l, r];
}

/** Outdoor reverb: ground and terrain reflections, then a darkening diffuse tail. */
function reverbImpulse(sr: number, seconds: number): Float32Array[] {
  const len = Math.floor(sr * seconds);
  const out: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(91 + ch * 17);
    const d = new Float32Array(len);
    for (const [t, a] of [
      [0.017, 0.5],
      [0.043, 0.35],
      [0.071, 0.28],
      [0.112, 0.2],
      [0.18, 0.14],
    ]) {
      const i = Math.floor(sr * (t + r() * 0.006));
      if (i < len) d[i] += a * (r() < 0.5 ? -1 : 1);
    }
    let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const cut = 8000 * Math.exp(-t / 0.5) + 500;
      const a = 1 - Math.exp((-2 * Math.PI * cut) / sr);
      y += ((r() * 2 - 1) - y) * a;
      d[i] += y * Math.min(1, t / 0.03) * Math.exp(-t / 0.75) * 0.35;
    }
    out.push(d);
  }
  return out;
}

/** Synthesise the whole bank at sample rate sr (different lengths so the loops never line up audibly). */
export function synthBank(sr: number): Bank {
  const mono = (sec: number, seed: number, f: (n: number, r: Rng) => Float32Array) => {
    const d = f(Math.floor(sr * sec), rng(seed));
    normalize(d, 0.8);
    return [seamless(d, sr)];
  };
  const bank: Bank = {
    white: mono(2.3, 1, white),
    pink: mono(4.1, 2, pink),
    brown: mono(4.7, 3, brown),
    brown2: mono(6.1, 4, brown),
    turbSlow: [seamless(slow(Math.floor(sr * 11), sr, 1.2, rng(5)), sr, 0.5)],
    turbFast: [seamless(slow(Math.floor(sr * 3.7), sr, 9, rng(6)), sr, 0.3)],
    jet: stereo(sr, 7.3, 11, renderJet),
    crack: stereo(sr, 4.6, 12, renderCrackle, 0.7),
    ab: stereo(sr, 6.2, 13, renderAb),
    wind: stereo(sr, 5.1, 14, renderWind, 0.6),
    rocket: stereo(sr, 3.1, 15, renderRocket, 0.5),
  };
  [[4.5, 16], [3.6, 21], [5.2, 27]].forEach(([sec, seed], i) => {
    const n = Math.floor(sr * sec);
    bank['boom' + i] = [renderBoom(n, sr, rng(seed)), renderBoom(n, sr, rng(seed + 1))];
  });
  const n = Math.floor(sr * 5);
  bank.sonic = [renderSonicBoom(n, sr, rng(31)), renderSonicBoom(n, sr, rng(32))];
  bank.crackS = [renderCrack(Math.floor(sr * 0.06), sr, rng(33))];
  const nb = Math.floor(sr * 6);
  bank.barrier = [renderBarrier(nb, sr, rng(41)), renderBarrier(nb, sr, rng(42))];
  bank.reverb = reverbImpulse(sr, 2.8);
  return bank;
}
