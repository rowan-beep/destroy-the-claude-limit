// Sound engine (WebAudio, fully synthesised -- no audio assets are shipped).
//
// Every sound is built from sample buffers rendered once at start-up with
// real acoustics in mind, then shaped live:
//   * jet exhaust: broadband mixing noise with the hump of a real jet
//     spectrum, breathing with the large turbulent eddies, and CRACKLE -- the
//     skewed N-wave shocks that make a fighter at high power sound torn and
//     ripping rather than like a waterfall;
//   * afterburner: a lower, heavier, fluttering roar with the combustion
//     throb, deep sub-bass pressure and irregular reheat pops; staged
//     light-off thumps and a pop when it is cancelled;
//   * turbomachinery: the fan's blade-passing tone and its "buzz-saw" shaft
//     orders once the fan tips go supersonic, and the high-pressure
//     compressor whine -- per engine (F110, F414, EJ200, M88, F119, AL-41F1S),
//     with real spool speeds and blade counts;
//   * directivity: the roar and crackle beam aft, the tones forward, air
//     absorption takes the top off with distance, Doppler and stereo for the
//     jets around you;
//   * cockpit: the canopy takes the roar down to a felt rumble, the airflow
//     over the canopy dominates at speed, plus the air conditioning, the
//     G-suit inflating and the oxygen regulator;
//   * ground: tyre rumble, runway seams, the chirp and thump of touchdown;
//   * guns rendered shot by shot, rocket motors, explosions with echoes, hits
//     on the airframe, flares and chaff, hydraulics.
// The warning tones and speech are unchanged.

import { Biquad, brown, crackleInto, hash, mixInto, modulate, normalize, normRms, nwave, onePole, pink, rng, Rng, seamless, slow, white } from './dsp';

export interface AudioLevels {
  master: number;
  engine: number;
  effects: number;
  warnings: number;
  voice: boolean;
}

/** Another jet near the listener (for its own sound). */
export interface OtherJetSound {
  id: number;
  /** distance from the listener (m) */
  dist: number;
  /** closing speed (m/s, + = approaching) */
  closing: number;
  /** -1 (left) .. +1 (right) */
  pan: number;
  /** cosine of the angle between its nose and the direction to the listener (1 = listener ahead) */
  aspect: number;
  ab: number;
  rpm: number;
  type: string;
}

/** Continuous state for the player's jet, sent every frame. */
export interface FlightSound {
  rpm: number;
  ab: number;
  qbar: number;
  tas: number;
  inCockpit: boolean;
  alive: boolean;
  gunFiring: boolean;
  gunRpm: number;
  tone: 'off' | 'search' | 'lock';
  rwr: 'none' | 'search' | 'lock' | 'missile';
  /** legacy: loudness of the nearest other jet (0..1) */
  nearbyJet: number;
  stall: boolean;
  /** aircraft type (engine voice) */
  type?: string;
  /** cosine of the angle between the jet's nose and the direction to the camera (1 = camera ahead) */
  camAspect?: number;
  /** camera distance from the jet (m) */
  camDist?: number;
  /** load factor, angle of attack (rad), gear 0..1, speedbrake */
  g?: number;
  aoa?: number;
  gear?: number;
  speedbrake?: boolean;
  mach?: number;
  /** legacy single flyby (used when `others` is absent) */
  flybyDist?: number;
  flybyClosing?: number;
  flybyAb?: number;
  /** the jets nearest the listener */
  others?: OtherJetSound[];
  /** on the ground, ground speed (m/s), vertical speed (m/s, + up) */
  onGround?: boolean;
  gs?: number;
  vs?: number;
}

/** overall crackle level (1 = the original mix; players wanted it far subtler) */
const CRACKLE = 0.1;

interface EngineVoice {
  /** low-pressure (fan) and high-pressure spool speeds at 100 % (Hz) */
  n1: number;
  n2: number;
  /** first-stage fan and compressor blade counts */
  fanBlades: number;
  compBlades: number;
  /** exhaust playback scale: bigger engines sound lower */
  roar: number;
  crackle: number;
  ab: number;
  /** weight of the tonal (fan / compressor) sound */
  whine: number;
}

const VOICES: Record<string, EngineVoice> = {
  // GE F110-GE-129: big, broad roar, heavy crackle in reheat
  F15EX: { n1: 135, n2: 245, fanBlades: 32, compBlades: 36, roar: 0.95, crackle: 1.0, ab: 1.0, whine: 1.0 },
  // GE F414: smaller and faster, the Hornet's howl
  FA18EF: { n1: 190, n2: 290, fanBlades: 28, compBlades: 30, roar: 1.02, crackle: 0.9, ab: 0.95, whine: 1.25 },
  // EJ200: the Typhoon's famous high turbine song
  TYPHOON: { n1: 178, n2: 275, fanBlades: 26, compBlades: 34, roar: 1.06, crackle: 0.85, ab: 0.9, whine: 1.55 },
  // Safran M88-2: small, fast-spooling, bright and snarling
  RAFALE: { n1: 215, n2: 330, fanBlades: 24, compBlades: 30, roar: 1.1, crackle: 0.8, ab: 0.85, whine: 1.4 },
  // P&W F119: huge mass flow, deep and violent crackle
  F22: { n1: 165, n2: 250, fanBlades: 30, compBlades: 34, roar: 0.9, crackle: 1.15, ab: 1.1, whine: 1.0 },
  // Aviadvigatel D-30F6: a big low-bypass turbofan, deep and booming
  MIG31: { n1: 128, n2: 205, fanBlades: 28, compBlades: 36, roar: 0.8, crackle: 1.3, ab: 1.35, whine: 0.75 },
  // Saturn AL-41F1S: the Flanker's thunder
  SU35: { n1: 150, n2: 222, fanBlades: 30, compBlades: 38, roar: 0.85, crackle: 1.25, ab: 1.25, whine: 0.85 },
};

// ---------------------------------------------------------------------------
// Buffer rendering
// ---------------------------------------------------------------------------

function buf1(ctx: BaseAudioContext, d: Float32Array): AudioBuffer {
  const b = ctx.createBuffer(1, Math.max(1, d.length), ctx.sampleRate);
  b.getChannelData(0).set(d);
  return b;
}

function buf2(ctx: BaseAudioContext, l: Float32Array, r: Float32Array): AudioBuffer {
  const n = Math.min(l.length, r.length);
  const b = ctx.createBuffer(2, Math.max(1, n), ctx.sampleRate);
  b.getChannelData(0).set(l.subarray(0, n));
  b.getChannelData(1).set(r.subarray(0, n));
  return b;
}

/** Two partly correlated channels from a mono renderer (a wide but solid image). */
function stereo(ctx: BaseAudioContext, sec: number, seed: number, render: (n: number, sr: number, r: Rng) => Float32Array, width = 0.45, loop = true): AudioBuffer {
  const sr = ctx.sampleRate;
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
  return loop ? buf2(ctx, seamless(l, sr), seamless(r, sr)) : buf2(ctx, l, r);
}

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
 * One loop of gunfire at `rpm`, shot by shot: the muzzle blast's N-wave, the
 * mechanism and airframe thump, a panel ringing, and the feed clattering
 * between rounds. At 6000 rpm the shots merge into the M61's growl.
 */
function gunLoop(ctx: BaseAudioContext, rpm: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const heavy = rpm < 3000;
  const interval = 60 / rpm;
  const shots = Math.max(6, Math.round(0.6 / interval));
  const n = Math.floor(shots * interval * sr);
  const r = rng(Math.round(rpm));
  const d = new Float32Array(n);
  const body0 = heavy ? 72 : 118, body1 = heavy ? 36 : 62;
  const tau = heavy ? 0.05 : 0.016;
  for (let s = 0; s < shots; s++) {
    const t0 = Math.floor((s + (r() - 0.5) * 0.06) * interval * sr);
    const g = 0.85 + r() * 0.3;
    nwave(d, t0, 0.9 * g, sr * (heavy ? 0.0012 : 0.0006));
    const len = Math.floor(sr * tau * 5);
    for (let k = 0; k < len; k++) {
      const i = (t0 + k) % n;
      const tt = k / sr;
      const f = body1 + (body0 - body1) * Math.exp(-tt / (tau * 0.6));
      let v = Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt / tau) * 0.8;
      v += Math.sin(2 * Math.PI * (heavy ? 190 : 260) * tt) * Math.exp(-tt / (heavy ? 0.04 : 0.02)) * 0.28;
      v += Math.sin(2 * Math.PI * (heavy ? 470 : 610) * tt) * Math.exp(-tt / 0.012) * 0.1;
      if (k < sr * 0.004) v += (r() * 2 - 1) * 0.35 * Math.exp(-k / (sr * 0.0012));
      d[i] += v * g;
    }
    // feed and link clatter half-way between rounds
    const tc = (t0 + Math.floor(interval * sr * 0.5)) % n;
    for (let k = 0; k < sr * 0.002; k++) d[(tc + k) % n] += (r() * 2 - 1) * 0.08 * Math.exp(-k / (sr * 0.0006));
  }
  onePole(d, sr, heavy ? 7000 : 9000);
  normalize(d, 0.9);
  return buf1(ctx, d);
}

/** Outdoor reverb: ground and terrain reflections, then a darkening diffuse tail. */
function reverbImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(91 + ch * 17);
    const d = buf.getChannelData(ch);
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
  }
  return buf;
}

/** Fan and compressor tones: PeriodicWaves at the spool frequency. */
function spoolWaves(ctx: BaseAudioContext, v: EngineVoice, type: string): { bpf: PeriodicWave; buzz: PeriodicWave; whine: PeriodicWave } {
  const r = rng(hash(type));
  const N = 96;
  const bpfRe = new Float32Array(N + 1), bpfIm = new Float32Array(N + 1);
  const buzRe = new Float32Array(N + 1), buzIm = new Float32Array(N + 1);
  const B = v.fanBlades;
  for (let k = 1; k <= N; k++) {
    // subsonic fan: the blade-passing tone and its harmonic, a little low-order unbalance
    const bp = Math.exp(-Math.pow((k - B) / 1.2, 2)) + 0.45 * Math.exp(-Math.pow((k - 2 * B) / 1.4, 2)) + 0.04 / k;
    bpfIm[k] = bp * (r() < 0.5 ? -1 : 1);
    // supersonic tips: "buzz-saw" -- every shaft order, uneven, strongest a few octaves below the BPF
    const hump = Math.exp(-Math.pow((k - 0.35 * B) / (0.3 * B), 2));
    const bz = (0.15 + 0.85 * Math.pow(r(), 1.5)) * (0.25 + hump) * (k <= B * 1.3 ? 1 : 0.2) + 0.8 * Math.exp(-Math.pow((k - B) / 1.2, 2));
    buzIm[k] = bz * (r() < 0.5 ? -1 : 1);
  }
  const C = v.compBlades;
  const wRe = new Float32Array(N + 1), wIm = new Float32Array(N + 1);
  for (let k = 1; k <= N; k++) {
    // HP compressor: narrow tone at its blade passing, with sidebands from the neighbouring stages
    wIm[k] = Math.exp(-Math.pow((k - C) / 0.7, 2)) + 0.35 * Math.exp(-Math.pow((k - C - 3) / 0.6, 2)) + 0.25 * Math.exp(-Math.pow((k - C + 4) / 0.6, 2));
  }
  return {
    bpf: ctx.createPeriodicWave(bpfRe, bpfIm),
    buzz: ctx.createPeriodicWave(buzRe, buzIm),
    whine: ctx.createPeriodicWave(wRe, wIm),
  };
}

// ---------------------------------------------------------------------------

interface Loop {
  src: AudioBufferSourceNode;
  f: BiquadFilterNode[];
  gain: GainNode;
}

interface Slot {
  id: number;
  roar: Loop;
  crack: Loop;
  ab: Loop;
  fan: OscillatorNode;
  fanGain: GainNode;
  pan: StereoPannerNode;
  type: string;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  levels: AudioLevels = { master: 0.8, engine: 0.8, effects: 0.9, warnings: 0.9, voice: true };
  muted = false;

  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private engineBus!: GainNode;
  private cabin!: BiquadFilterNode;
  private cabinBus!: GainNode;
  private fxBus!: GainNode;
  private warnBus!: GainNode;
  private uiBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;

  private whiteB!: AudioBuffer;
  private pinkB!: AudioBuffer;
  private brownB!: AudioBuffer;
  private brown2B!: AudioBuffer;
  private turbSlow!: AudioBuffer;
  private turbFast!: AudioBuffer;
  private jetB!: AudioBuffer;
  private crackB!: AudioBuffer;
  private abB!: AudioBuffer;
  private windB!: AudioBuffer;
  private rocketB!: AudioBuffer;
  private boomB!: AudioBuffer;
  private gunBufs = new Map<number, AudioBuffer>();
  private waves = new Map<string, ReturnType<typeof spoolWaves>>();

  // own jet: exhaust
  private roar!: Loop;
  private body!: Loop;
  private crack!: Loop;
  private abRoar!: Loop;
  private abSub!: Loop;
  // own jet: turbomachinery
  private fanBpf!: OscillatorNode;
  private fanBuzz!: OscillatorNode;
  private fanBpfG!: GainNode;
  private fanBuzzG!: GainNode;
  private fanLp!: BiquadFilterNode;
  private fanGain!: GainNode;
  private whine!: OscillatorNode;
  private whineLp!: BiquadFilterNode;
  private whineGain!: GainNode;
  private spoolJitter: GainNode[] = [];
  private intake!: Loop;
  // airflow and airframe
  private wind!: Loop;
  private whistle!: Loop;
  private buffet!: Loop;
  private buffetMod!: GainNode;
  private gearRumble!: Loop;
  private ecs!: Loop;
  private gsuit!: Loop;
  private roll!: Loop;
  // other jets
  private slots: Slot[] = [];
  // gun
  private gun: { src: AudioBufferSourceNode | null; gain: GainNode; filter: BiquadFilterNode; rpm: number; firing: boolean };
  // warning tones (unchanged)
  private growl!: { osc: OscillatorNode; fm: GainNode; filter: BiquadFilterNode; gain: GainNode };
  private rwr!: { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };

  private voiceName = '';
  private lastAb = 0;
  private lastRpm = 0;
  private lastT = 0;
  private lastG = 1;
  private gRise = 0;
  private breathT = 0;
  private breathPhase = 0;
  private wasOnGround = true;
  private lastVs = 0;
  private seamDist = 0;
  private lastVoice = new Map<string, number>();

  constructor() {
    this.gun = { src: null, gain: null as unknown as GainNode, filter: null as unknown as BiquadFilterNode, rpm: 0, firing: false };
  }

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      const c = this.ctx as AudioContext;
      if (c.state === 'suspended' && c.resume) void c.resume();
      return;
    }
    let ctx: AudioContext;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
    } catch {
      this.ctx = null;
      return;
    }
    this.initWith(ctx);
  }

  /** Build the whole graph on a context (an OfflineAudioContext for tests). */
  initWith(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    const sr = ctx.sampleRate;

    // --- buffers (different lengths so the loops never line up audibly) ---
    const mono = (sec: number, seed: number, f: (n: number, r: Rng) => Float32Array) => {
      const d = f(Math.floor(sr * sec), rng(seed));
      normalize(d, 0.8);
      return buf1(ctx, seamless(d, sr));
    };
    this.whiteB = mono(2.3, 1, white);
    this.pinkB = mono(4.1, 2, pink);
    this.brownB = mono(4.7, 3, brown);
    this.brown2B = mono(6.1, 4, brown);
    this.turbSlow = buf1(ctx, seamless(slow(Math.floor(sr * 11), sr, 1.2, rng(5)), sr, 0.5));
    this.turbFast = buf1(ctx, seamless(slow(Math.floor(sr * 3.7), sr, 9, rng(6)), sr, 0.3));
    this.jetB = stereo(ctx, 7.3, 11, renderJet);
    this.crackB = stereo(ctx, 4.6, 12, renderCrackle, 0.7);
    this.abB = stereo(ctx, 6.2, 13, renderAb);
    this.windB = stereo(ctx, 5.1, 14, renderWind, 0.6);
    this.rocketB = stereo(ctx, 3.1, 15, renderRocket, 0.5);
    {
      const n = Math.floor(sr * 4.5);
      const a = renderBoom(n, sr, rng(16));
      const b = renderBoom(n, sr, rng(17));
      this.boomB = buf2(ctx, a, b);
    }

    // --- buses ---
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -9;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.22;
    this.limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(this.limiter);
    // everything heard from outside the canopy goes through the cabin filter
    this.cabin = ctx.createBiquadFilter();
    this.cabin.type = 'lowpass';
    this.cabin.frequency.value = 20000;
    this.cabin.Q.value = 0.5;
    this.cabin.connect(this.master);
    this.engineBus = ctx.createGain();
    this.engineBus.connect(this.cabin);
    this.cabinBus = ctx.createGain();
    this.cabinBus.connect(this.master);
    this.fxBus = ctx.createGain();
    this.fxBus.connect(this.master);
    this.warnBus = ctx.createGain();
    this.warnBus.connect(this.master);
    this.uiBus = ctx.createGain();
    this.uiBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = reverbImpulse(ctx, 2.8);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.5;
    this.reverbSend.connect(this.reverb).connect(this.fxBus);

    const loop = (buf: AudioBuffer, filters: [BiquadFilterType, number, number][], bus: AudioNode, rate = 1): Loop => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rate;
      const f: BiquadFilterNode[] = [];
      let node: AudioNode = src;
      for (const [type, freq, q] of filters) {
        const b = ctx.createBiquadFilter();
        b.type = type;
        b.frequency.value = freq;
        b.Q.value = q;
        node.connect(b);
        node = b;
        f.push(b);
      }
      const gain = ctx.createGain();
      gain.gain.value = 0;
      node.connect(gain).connect(bus);
      src.start(ctx.currentTime + 0.01, Math.random() * buf.duration * 0.9);
      return { src, f, gain };
    };
    /** slow random modulation into an AudioParam (adds to its value) */
    const modulate = (buf: AudioBuffer, param: AudioParam, depth: number, rate = 1): GainNode => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      src.connect(g).connect(param);
      src.start(ctx.currentTime, Math.random() * buf.duration * 0.9);
      return g;
    };

    // --- own jet: exhaust ---
    this.roar = loop(this.jetB, [['lowpass', 8000, 0.6]], this.engineBus);
    this.body = loop(this.jetB, [['lowpass', 220, 0.8]], this.engineBus, 0.5);
    this.crack = loop(this.crackB, [['highpass', 300, 0.7], ['lowpass', 12000, 0.5]], this.engineBus);
    this.abRoar = loop(this.abB, [['lowpass', 1600, 0.6]], this.engineBus);
    this.abSub = loop(this.abB, [['lowpass', 95, 0.9]], this.engineBus, 0.5);

    // --- own jet: fan and compressor tones ---
    this.fanLp = ctx.createBiquadFilter();
    this.fanLp.type = 'lowpass';
    this.fanLp.frequency.value = 9000;
    const fanHp = ctx.createBiquadFilter();
    fanHp.type = 'highpass';
    fanHp.frequency.value = 220;
    this.fanGain = ctx.createGain();
    this.fanGain.gain.value = 0;
    fanHp.connect(this.fanLp).connect(this.fanGain).connect(this.engineBus);
    this.fanBpf = ctx.createOscillator();
    this.fanBuzz = ctx.createOscillator();
    this.fanBpfG = ctx.createGain();
    this.fanBuzzG = ctx.createGain();
    this.fanBpf.connect(this.fanBpfG).connect(fanHp);
    this.fanBuzz.connect(this.fanBuzzG).connect(fanHp);
    this.whine = ctx.createOscillator();
    this.whineLp = ctx.createBiquadFilter();
    this.whineLp.type = 'lowpass';
    this.whineLp.frequency.value = 16000;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(this.whineLp).connect(this.whineGain).connect(this.engineBus);
    for (const o of [this.fanBpf, this.fanBuzz, this.whine]) {
      this.spoolJitter.push(modulate(this.turbFast, o.frequency, 0, 0.5 + Math.random() * 0.3));
      o.start();
    }
    this.setVoice('F15EX');
    this.intake = loop(this.pinkB, [['bandpass', 1700, 0.9]], this.engineBus, 0.9);

    // --- airflow and airframe ---
    this.wind = loop(this.windB, [['bandpass', 600, 0.5]], this.engineBus);
    modulate(this.turbSlow, this.wind.f[0].frequency, 140, 0.5);
    this.whistle = loop(this.whiteB, [['bandpass', 3200, 7]], this.engineBus, 0.93);
    this.buffet = loop(this.brownB, [['lowpass', 70, 1.2]], this.engineBus, 1.3);
    this.buffetMod = modulate(this.turbFast, this.buffet.gain.gain, 0, 2.5);
    this.gearRumble = loop(this.brown2B, [['bandpass', 140, 0.8]], this.engineBus, 1.1);
    this.ecs = loop(this.whiteB, [['bandpass', 5200, 0.9]], this.cabinBus, 0.8);
    this.gsuit = loop(this.whiteB, [['bandpass', 2600, 0.6]], this.cabinBus, 0.7);
    this.roll = loop(this.brown2B, [['bandpass', 95, 0.9]], this.engineBus, 1.2);

    // --- the jets around you: three voices ---
    for (let i = 0; i < 3; i++) {
      const pan = ctx.createStereoPanner();
      pan.connect(this.fxBus);
      const roar = loop(this.jetB, [['lowpass', 6000, 0.6]], pan);
      const crack = loop(this.crackB, [['highpass', 300, 0.7], ['lowpass', 9000, 0.5]], pan);
      const ab = loop(this.abB, [['lowpass', 1200, 0.6]], pan);
      const fan = ctx.createOscillator();
      const fanGain = ctx.createGain();
      fanGain.gain.value = 0;
      const fhp = ctx.createBiquadFilter();
      fhp.type = 'highpass';
      fhp.frequency.value = 300;
      fan.connect(fhp).connect(fanGain).connect(pan);
      fan.setPeriodicWave(this.wavesFor('F15EX').buzz);
      fan.start();
      this.slots.push({ id: -1, roar, crack, ab, fan, fanGain, pan, type: 'F15EX' });
    }

    // --- gun ---
    const gg = ctx.createGain();
    gg.gain.value = 0;
    const gf = ctx.createBiquadFilter();
    gf.type = 'lowpass';
    gf.frequency.value = 8000;
    gg.connect(gf).connect(this.fxBus);
    const gs = ctx.createGain();
    gs.gain.value = 0.25;
    gg.connect(gs).connect(this.reverbSend);
    this.gun = { src: null, gain: gg, filter: gf, rpm: 0, firing: false };

    // --- Sidewinder growl: a triangle wave frequency-modulated by fast noise ---
    const go = ctx.createOscillator();
    go.type = 'triangle';
    go.frequency.value = 400;
    const fm = modulate(this.turbFast, go.frequency, 0, 6);
    const gfl = ctx.createBiquadFilter();
    gfl.type = 'lowpass';
    gfl.frequency.value = 2400;
    const ggn = ctx.createGain();
    ggn.gain.value = 0;
    go.connect(gfl).connect(ggn).connect(this.warnBus);
    go.start();
    this.growl = { osc: go, fm, filter: gfl, gain: ggn };

    // --- RWR / stall tone ---
    const ro = ctx.createOscillator();
    ro.type = 'square';
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 2600;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    ro.connect(rf).connect(rg).connect(this.warnBus);
    ro.start();
    this.rwr = { osc: ro, filter: rf, gain: rg };

    this.applyLevels();
  }

  private wavesFor(type: string): ReturnType<typeof spoolWaves> {
    let w = this.waves.get(type);
    if (!w) {
      w = spoolWaves(this.ctx!, VOICES[type] ?? VOICES.F15EX, type);
      this.waves.set(type, w);
    }
    return w;
  }

  private setVoice(type: string): void {
    if (type === this.voiceName || !this.ctx) return;
    this.voiceName = type;
    const w = this.wavesFor(type);
    this.fanBpf.setPeriodicWave(w.bpf);
    this.fanBuzz.setPeriodicWave(w.buzz);
    this.whine.setPeriodicWave(w.whine);
  }

  applyLevels(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.levels.master, t, 0.05);
    this.engineBus.gain.setTargetAtTime(this.levels.engine, t, 0.05);
    this.cabinBus.gain.setTargetAtTime(this.levels.engine, t, 0.05);
    this.fxBus.gain.setTargetAtTime(this.levels.effects, t, 0.05);
    this.warnBus.gain.setTargetAtTime(this.levels.warnings, t, 0.05);
    this.uiBus.gain.setTargetAtTime(Math.max(0.3, this.levels.effects), t, 0.05);
  }

  setPaused(p: boolean): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(p || this.muted ? 0 : this.levels.master, this.ctx.currentTime, 0.08);
  }

  // -------------------------------------------------------------------------
  // Continuous flight sound
  // -------------------------------------------------------------------------

  updateFlight(s: FlightSound): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0, t - this.lastT)) || 1 / 60;
    this.lastT = t;
    const type = s.type && VOICES[s.type] ? s.type : this.voiceName || 'F15EX';
    this.setVoice(type);
    const v = VOICES[type];
    const on = s.alive ? 1 : 0;
    const rpm = clamp01(s.rpm);
    const ab = clamp01(s.ab);
    const cockpit = s.inCockpit;
    const P = (p: AudioParam, val: number, tc = 0.09) => p.setTargetAtTime(val, t, tc);

    // where the listener is: the roar and crackle beam aft (loudest ~140 deg off the nose), the tones forward
    const aspect = cockpit ? 0 : s.camAspect ?? -0.8;
    const rear = clamp01((0.25 - aspect) / 1.1);
    const front = clamp01((aspect + 0.2) / 1.0);
    const dist = cockpit ? 0 : s.camDist ?? 30;
    const dk = 1 / (1 + Math.max(0, dist - 18) / 60);
    const absorb = Math.max(500, 20000 / (1 + dist / 350));
    const n1 = 0.3 + 0.7 * rpm;
    const n2 = 0.62 + 0.38 * rpm;
    const mach = s.mach ?? s.tas / 300;
    const r2 = rpm * rpm;

    // the canopy
    P(this.cabin.frequency, cockpit ? 2600 : 20000, 0.12);

    // --- exhaust ---
    const rate = v.roar * (0.82 + 0.26 * rpm) * (1 - 0.08 * ab);
    P(this.roar.src.playbackRate, rate, 0.25);
    P(this.body.src.playbackRate, rate * 0.5, 0.25);
    if (cockpit) {
      // through the airframe: a deep, felt roar (quieter once the jet outruns its own noise)
      const sup = mach > 1 ? 0.7 : 1;
      P(this.roar.gain.gain, on * (0.03 + 0.16 * r2) * (1 + 0.5 * ab) * sup);
      P(this.roar.f[0].frequency, 480, 0.2);
      P(this.body.gain.gain, on * (0.07 + 0.22 * r2) * (1 + 0.4 * ab));
      P(this.crack.gain.gain, on * v.crackle * CRACKLE * 0.05 * ab);
      P(this.crack.f[1].frequency, 1400, 0.2);
    } else {
      const roarG = on * (0.05 + 0.55 * r2) * (0.25 + 0.75 * rear) * dk * (1 + 0.3 * ab);
      P(this.roar.gain.gain, roarG);
      P(this.roar.f[0].frequency, Math.min(absorb, 1300 + 7000 * Math.pow(rpm, 1.5) + 3000 * ab), 0.2);
      P(this.body.gain.gain, on * (0.08 + 0.35 * r2) * (0.5 + 0.5 * rear) * dk);
      // crackle: only near full power, violently in reheat, beamed aft
      P(this.crack.gain.gain, on * v.crackle * CRACKLE * (0.35 * Math.pow(rpm, 4) + 0.8 * ab) * Math.pow(0.15 + 0.85 * rear, 1.3) * dk);
      P(this.crack.f[1].frequency, Math.min(absorb, 12000), 0.2);
    }

    // --- afterburner ---
    const abW = on * ab * v.ab;
    P(this.abRoar.gain.gain, abW * (cockpit ? 0.42 : 0.9 * (0.5 + 0.5 * rear) * dk), 0.12);
    P(this.abRoar.f[0].frequency, cockpit ? 340 : Math.min(absorb, 900 + 900 * ab), 0.2);
    P(this.abSub.gain.gain, abW * (cockpit ? 0.6 : 0.6 * dk), 0.12);
    if (on && ab > 0.08 && this.lastAb <= 0.08) this.abLight(cockpit ? 0.45 : dk * (0.5 + 0.5 * rear));
    if (on && ab <= 0.04 && this.lastAb > 0.04) this.abOff(cockpit ? 0.4 : dk * (0.4 + 0.6 * rear));
    this.lastAb = ab;

    // --- fan and compressor: the tones ride on the spool speeds ---
    const f1 = v.n1 * n1;
    const f2 = v.n2 * n2;
    P(this.fanBpf.frequency, f1, 0.35);
    P(this.fanBuzz.frequency, f1, 0.35);
    P(this.whine.frequency, f2, 0.4);
    this.spoolJitter[0].gain.setTargetAtTime(f1 * 0.003, t, 0.2);
    this.spoolJitter[1].gain.setTargetAtTime(f1 * 0.003, t, 0.2);
    this.spoolJitter[2].gain.setTargetAtTime(f2 * 0.002, t, 0.2);
    // the fan tips go supersonic above ~85 % N1: the clean tone turns into the buzz-saw
    const buzz = clamp01((n1 - 0.78) / 0.18);
    P(this.fanBpfG.gain, 1 - 0.7 * buzz, 0.2);
    P(this.fanBuzzG.gain, 0.2 + 0.9 * buzz, 0.2);
    if (cockpit) {
      P(this.fanGain.gain, on * v.whine * 0.011 * (0.4 + 0.6 * n1), 0.2);
      P(this.fanLp.frequency, 2400, 0.2);
      P(this.whineGain.gain, on * v.whine * 0.006, 0.2);
      P(this.whineLp.frequency, 6000, 0.2);
      P(this.intake.gain.gain, on * 0.02 * r2, 0.2);
    } else {
      P(this.fanGain.gain, on * v.whine * (0.02 + 0.05 * n1) * (0.15 + 0.85 * front) * dk, 0.2);
      P(this.fanLp.frequency, Math.min(absorb, 11000), 0.2);
      // the compressor whine stands out at idle, drowned by the roar at power
      P(this.whineGain.gain, on * v.whine * 0.02 * (0.2 + 0.8 * front) * dk * (1.25 - 0.55 * rpm), 0.2);
      P(this.whineLp.frequency, Math.min(absorb, 16000), 0.2);
      P(this.intake.gain.gain, on * 0.07 * r2 * front * dk, 0.2);
    }
    // spool-up swell of the roar
    if (on && rpm - this.lastRpm > 0.012) this.roar.gain.gain.setTargetAtTime((0.05 + 0.55 * r2) * (cockpit ? 0.25 : dk), t, 0.05);
    this.lastRpm = rpm;

    // --- airflow ---
    const q = Math.min(1.4, s.qbar / 55000);
    if (cockpit) {
      // the air tearing past the canopy dominates the cockpit at speed
      P(this.wind.gain.gain, on * Math.min(1.2, q) * 0.42, 0.15);
      P(this.wind.f[0].frequency, 350 + Math.min(2600, s.tas * 3.6), 0.2);
    } else {
      P(this.wind.gain.gain, on * q * (0.06 + 0.08 * front), 0.15);
      P(this.wind.f[0].frequency, 300 + Math.min(3000, s.tas * 4.2), 0.2);
    }
    P(this.whistle.gain.gain, on * (cockpit ? 0.018 : 0.005) * clamp01((mach - 0.6) * 2) * q, 0.3);
    P(this.whistle.f[0].frequency, 2400 + mach * 1400, 0.3);
    const aoaDeg = ((s.aoa ?? 0) * 180) / Math.PI;
    const g = s.g ?? 1;
    const buff = clamp01((aoaDeg - 14) / 12) * 0.8 + clamp01((g - 6) / 4) * 0.5 + (s.speedbrake ? 0.25 : 0);
    const buffG = on * Math.min(1, buff) * Math.min(1, q * 1.5) * (cockpit ? 0.85 : 0.35);
    P(this.buffet.gain.gain, buffG * 0.6, 0.08);
    P(this.buffetMod.gain, buffG * 0.55, 0.08);
    P(this.gearRumble.gain.gain, on * (s.gear ?? 0) * Math.min(1, q * 3) * (cockpit ? 0.32 : 0.14), 0.2);
    P(this.ecs.gain.gain, cockpit && on ? 0.007 : 0, 0.3);

    // --- G-suit: the bladders inflate as the G comes on, then meter a steady hiss ---
    const rise = Math.max(0, (g - this.lastG) / dt);
    this.lastG = g;
    this.gRise += (rise - this.gRise) * Math.min(1, dt * 8);
    const gs = cockpit && on && g > 1.6 ? clamp01(this.gRise / 4) * 0.05 + clamp01((g - 3.5) / 4) * 0.008 : 0;
    P(this.gsuit.gain.gain, gs, 0.05);

    // --- oxygen regulator: breathing in the mask, faster under G ---
    if (cockpit && on) {
      this.breathT += dt;
      const period = Math.max(1.7, Math.min(4.4, 4.4 - 0.4 * (g - 1)));
      if (this.breathPhase === 0 && this.breathT >= period) {
        this.breathT = 0;
        this.breathPhase = 1;
        this.breath(true, g);
      } else if (this.breathPhase === 1 && this.breathT >= period * 0.42) {
        this.breathPhase = 0;
        this.breath(false, g);
      }
    }

    // --- on the ground: tyres, runway seams, touchdown ---
    const ground = !!s.onGround;
    const gsp = s.gs ?? 0;
    if (!ground) this.lastVs = s.vs ?? this.lastVs;
    P(this.roll.gain.gain, on && ground ? Math.min(1, gsp / 80) * (cockpit ? 0.3 : 0.18) : 0, 0.1);
    if (on && ground && gsp > 4) {
      this.seamDist += gsp * dt;
      if (this.seamDist > 22) {
        this.seamDist = 0;
        this.seam(Math.min(1, gsp / 80) * (cockpit ? 1 : 0.6));
      }
    }
    if (on && ground && !this.wasOnGround && gsp > 25) this.touchdown(Math.min(1, Math.max(0, -this.lastVs) / 4), Math.min(1, gsp / 80), cockpit);
    this.wasOnGround = ground;

    // --- the jets around you ---
    this.updateOthers(s);

    // --- gun ---
    this.updateGun(s.gunFiring && s.alive, s.gunRpm, cockpit);

    // --- Sidewinder growl ---
    const gw = this.growl;
    if (s.tone === 'lock') {
      gw.osc.frequency.setTargetAtTime(1180, t, 0.03);
      gw.fm.gain.setTargetAtTime(35, t, 0.03);
      gw.filter.frequency.setTargetAtTime(3200, t, 0.05);
      gw.gain.gain.setTargetAtTime(0.075, t, 0.03);
    } else if (s.tone === 'search') {
      gw.osc.frequency.setTargetAtTime(390, t, 0.05);
      gw.fm.gain.setTargetAtTime(140, t, 0.05);
      gw.filter.frequency.setTargetAtTime(1300, t, 0.05);
      gw.gain.gain.setTargetAtTime(0.05, t, 0.05);
    } else gw.gain.gain.setTargetAtTime(0, t, 0.03);

    // --- RWR / stall ---
    let rOn = false;
    let rf = 1000;
    if (s.rwr === 'missile') {
      rOn = true;
      rf = Math.floor(t * 12) % 2 === 0 ? 1650 : 1250;
    } else if (s.rwr === 'lock') {
      rOn = Math.floor(t * 3.5) % 4 !== 3;
      rf = 1020;
    }
    if (s.stall && !rOn && s.alive) {
      rOn = Math.floor(t * 5) % 2 === 0;
      rf = 560;
    }
    this.rwr.osc.frequency.setTargetAtTime(rf, t, 0.004);
    this.rwr.gain.gain.setTargetAtTime(rOn ? 0.045 : 0, t, 0.006);
  }

  /** Up to three jets near the listener, each with its own Doppler-shifted, panned, beamed sound. */
  private updateOthers(s: FlightSound): void {
    const t = this.ctx!.currentTime;
    let list = s.others;
    if (!list && s.flybyDist !== undefined && s.flybyDist < 3500)
      list = [{ id: 0, dist: s.flybyDist, closing: s.flybyClosing ?? 0, pan: 0, aspect: (s.flybyClosing ?? 0) > 0 ? 0.8 : -0.8, ab: s.flybyAb ?? 0, rpm: 0.9, type: 'F15EX' }];
    list = (list ?? []).filter((o) => o.dist < 3500).slice(0, this.slots.length);
    // keep each jet in the slot it already has, so nothing jumps
    const free = this.slots.filter((sl) => !list!.some((o) => o.id === sl.id));
    for (const o of list) {
      let sl = this.slots.find((x) => x.id === o.id);
      if (!sl) {
        sl = free.shift();
        if (!sl) continue;
        sl.id = o.id;
      }
      if (sl.type !== o.type && VOICES[o.type]) {
        sl.type = o.type;
        sl.fan.setPeriodicWave(this.wavesFor(o.type).buzz);
      }
      const v = VOICES[sl.type] ?? VOICES.F15EX;
      const dop = Math.max(0.5, Math.min(2, 343 / Math.max(120, 343 - o.closing)));
      const rear = clamp01((0.25 - o.aspect) / 1.1);
      const front = clamp01((o.aspect + 0.2) / 1.0);
      const dk = (1 / (1 + o.dist / 40)) * clamp01((3500 - o.dist) / 800);
      const absorb = Math.max(250, 16000 / (1 + o.dist / 300));
      const rpm = clamp01(o.rpm);
      const rate = v.roar * (0.84 + 0.22 * rpm) * dop;
      sl.roar.src.playbackRate.setTargetAtTime(rate, t, 0.06);
      sl.crack.src.playbackRate.setTargetAtTime(dop, t, 0.06);
      sl.ab.src.playbackRate.setTargetAtTime(dop, t, 0.06);
      sl.roar.gain.gain.setTargetAtTime(dk * (0.1 + 0.6 * rpm * rpm) * (0.3 + 0.7 * rear) * (1 + 0.4 * o.ab), t, 0.06);
      sl.roar.f[0].frequency.setTargetAtTime(absorb, t, 0.08);
      sl.crack.gain.gain.setTargetAtTime(dk * v.crackle * CRACKLE * (0.3 * Math.pow(rpm, 4) + 0.9 * o.ab) * Math.pow(0.1 + 0.9 * rear, 1.3), t, 0.06);
      sl.crack.f[1].frequency.setTargetAtTime(Math.min(absorb, 10000), t, 0.08);
      sl.ab.gain.gain.setTargetAtTime(dk * o.ab * v.ab * 0.8 * (0.5 + 0.5 * rear), t, 0.06);
      sl.ab.f[0].frequency.setTargetAtTime(Math.min(absorb, 1400), t, 0.08);
      sl.fan.frequency.setTargetAtTime(v.n1 * (0.3 + 0.7 * rpm) * dop, t, 0.06);
      sl.fanGain.gain.setTargetAtTime(dk * v.whine * 0.05 * front * (0.3 + 0.7 * rpm) * clamp01(absorb / 3000), t, 0.06);
      sl.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, o.pan)) * 0.85, t, 0.05);
    }
    for (const sl of free) {
      sl.id = -1;
      for (const l of [sl.roar, sl.crack, sl.ab]) l.gain.gain.setTargetAtTime(0, t, 0.15);
      sl.fanGain.gain.setTargetAtTime(0, t, 0.15);
    }
  }

  private updateGun(firing: boolean, rpm: number, cockpit: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = this.gun;
    // in the cockpit the gun is felt through the airframe as much as heard
    g.filter.frequency.setTargetAtTime(cockpit ? 2400 : 8500, t, 0.05);
    const rotary = rpm > 3000;
    if (firing && !g.firing) {
      const key = Math.round(rpm / 50) * 50;
      let buf = this.gunBufs.get(key);
      if (!buf) {
        buf = gunLoop(ctx, key);
        this.gunBufs.set(key, buf);
      }
      g.src?.stop();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      // the M61 spins up to its full rate in about a third of a second
      if (rotary) {
        src.playbackRate.setValueAtTime(0.6, t);
        src.playbackRate.linearRampToValueAtTime(1, t + 0.32);
        this.tone(160, 420, 0.32, 0.018, 'sawtooth', 0, this.fxBus, 1200);
      }
      src.connect(g.gain);
      src.start(t);
      g.src = src;
      g.gain.gain.cancelScheduledValues(t);
      g.gain.gain.setTargetAtTime(cockpit ? 0.55 : 0.75, t, 0.01);
    } else if (!firing && g.firing) {
      g.gain.gain.cancelScheduledValues(t);
      g.gain.gain.setTargetAtTime(0, t + 0.02, 0.03);
      const src = g.src;
      if (src) {
        if (rotary) src.playbackRate.linearRampToValueAtTime(0.55, t + 0.15);
        src.stop(t + 0.3);
      }
      g.src = null;
      // spin-down: the barrels and drive whirring to a stop
      if (rotary) this.tone(420, 150, 0.45, 0.022, 'sawtooth', 0, this.fxBus, 900);
    }
    g.firing = firing;
  }

  // -------------------------------------------------------------------------
  // One-shot building blocks
  // -------------------------------------------------------------------------

  /** Filtered noise burst with an attack / exponential decay and a sweeping filter. */
  private burst(
    buf: AudioBuffer,
    o: { type: BiquadFilterType; f0: number; f1: number; q?: number; dur: number; vol: number; attack?: number; delay?: number; rate?: number; rate1?: number; bus?: AudioNode; reverb?: number },
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = buf.duration < o.dur + 0.1;
    src.playbackRate.setValueAtTime(o.rate ?? 1, t);
    if (o.rate1 !== undefined) src.playbackRate.exponentialRampToValueAtTime(o.rate1, t + o.dur);
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    const g = ctx.createGain();
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.dur);
    src.connect(f).connect(g).connect(o.bus ?? this.fxBus);
    if (o.reverb) {
      const s = ctx.createGain();
      s.gain.value = o.reverb;
      g.connect(s).connect(this.reverbSend);
    }
    src.start(t, Math.random() * Math.max(0, buf.duration - o.dur - a - 0.05));
    src.stop(t + a + o.dur + 0.05);
  }

  /** Play a rendered one-shot buffer: rate glide, lowpass glide, fade-out, stereo position, reverb. */
  private play(
    buf: AudioBuffer,
    o: { vol: number; delay?: number; rate?: number; rate1?: number; lp?: number; lp1?: number; dur?: number; fade?: number; pan?: number; reverb?: number; bus?: AudioNode; offset?: number },
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (o.delay ?? 0);
    const dur = o.dur ?? buf.duration;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = dur > buf.duration - (o.offset ?? 0);
    src.playbackRate.setValueAtTime(o.rate ?? 1, t);
    if (o.rate1 !== undefined) src.playbackRate.exponentialRampToValueAtTime(o.rate1, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.6;
    f.frequency.setValueAtTime(o.lp ?? 20000, t);
    if (o.lp1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.lp1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, o.vol), t);
    if (o.fade !== undefined) {
      g.gain.setValueAtTime(Math.max(0.0001, o.vol), t + Math.max(0, dur - o.fade));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    let node: AudioNode = src.connect(f).connect(g);
    if (o.pan !== undefined && o.pan !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      node = node.connect(p);
    }
    node.connect(o.bus ?? this.fxBus);
    if (o.reverb) {
      const s = ctx.createGain();
      s.gain.value = o.reverb;
      node.connect(s).connect(this.reverbSend);
    }
    src.start(t, o.offset ?? 0);
    src.stop(t + dur + 0.05);
  }

  /** A pitched tone with a glide and decay. */
  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0, bus?: AudioNode, lp?: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      node = o.connect(f);
    }
    node.connect(g).connect(bus ?? this.fxBus);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  /** Reheat light-off: a deep thump as the fuel catches, then the stages lighting one after another. */
  private abLight(vol: number): void {
    this.tone(62, 30, 0.55, 0.5 * vol, 'sine', 0, this.engineBus);
    this.burst(this.brown2B, { type: 'lowpass', f0: 650, f1: 90, dur: 0.65, vol: 0.55 * vol, attack: 0.015, bus: this.engineBus });
    for (const [d, k] of [
      [0.09, 0.45],
      [0.19, 0.35],
      [0.3, 0.25],
    ]) {
      this.burst(this.brownB, { type: 'lowpass', f0: 420, f1: 110, dur: 0.22, vol: k * vol, attack: 0.01, delay: d, bus: this.engineBus });
    }
  }

  /** Reheat cancelled: a soft pop and the roar dropping away. */
  private abOff(vol: number): void {
    this.burst(this.brownB, { type: 'lowpass', f0: 380, f1: 90, dur: 0.2, vol: 0.28 * vol, attack: 0.006, bus: this.engineBus });
  }

  /** One breath through the oxygen regulator: the demand valve's hiss on the way in, the exhalation valve on the way out. */
  private breath(inhale: boolean, g: number): void {
    const k = 1 + clamp01((g - 3) / 5) * 0.8;
    if (inhale) {
      this.tone(2400, 2200, 0.02, 0.004, 'square', 0, this.cabinBus, 4000);
      this.burst(this.pinkB, { type: 'bandpass', f0: 1500, f1: 2300, q: 0.8, dur: 0.8, vol: 0.02 * k, attack: 0.3, bus: this.cabinBus });
    } else {
      this.burst(this.pinkB, { type: 'bandpass', f0: 900, f1: 520, q: 0.9, dur: 0.65, vol: 0.013 * k, attack: 0.08, bus: this.cabinBus });
      this.tone(1700, 1500, 0.015, 0.003, 'square', 0.05, this.cabinBus, 3000);
    }
  }

  /** A runway expansion joint under the wheels. */
  private seam(vol: number): void {
    this.tone(75, 45, 0.09, 0.22 * vol, 'sine', 0, this.engineBus);
    this.burst(this.brownB, { type: 'lowpass', f0: 500, f1: 120, dur: 0.08, vol: 0.18 * vol, bus: this.engineBus });
  }

  /** Main wheels touching down: tyre chirps and the thump into the struts. */
  private touchdown(sink: number, speed: number, cockpit: boolean): void {
    const v = cockpit ? 0.6 : 1;
    for (const d of [0, 0.045]) {
      this.burst(this.whiteB, { type: 'bandpass', f0: 1900, f1: 1100, q: 2.2, dur: 0.16, vol: 0.12 * speed * v, delay: d, bus: this.engineBus });
      this.tone(1150, 780, 0.14, 0.03 * speed * v, 'sawtooth', d, this.engineBus, 2600);
    }
    this.tone(70, 35, 0.35, (0.2 + 0.5 * sink) * (cockpit ? 1 : 0.7), 'sine', 0.02, this.engineBus);
    this.burst(this.brown2B, { type: 'lowpass', f0: 600, f1: 90, dur: 0.35, vol: (0.2 + 0.4 * sink) * v, bus: this.engineBus });
  }

  // -------------------------------------------------------------------------
  // Public one-shots (same API the game has always used)
  // -------------------------------------------------------------------------

  /** Beep on the warning bus, with a soft envelope. */
  beep(freq: number, dur: number, vol = 0.08, type: OscillatorType = 'sine', delay = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = Math.min(9000, freq * 3.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.setValueAtTime(vol, t + Math.max(0.007, dur - 0.015));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.warnBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Missile off the rail: the launcher's clunk, the motor lighting with a crack, then the rocket tearing away. */
  missileLaunch(own: boolean, distance: number): void {
    if (!this.ctx) return;
    const v = own ? 1 : Math.max(0.02, 0.7 / (1 + distance / 250));
    const d = own ? 0 : Math.min(3, distance / 343);
    const absorb = own ? 16000 : Math.max(300, 16000 / (1 + distance / 300));
    if (own) {
      this.tone(120, 55, 0.12, 0.35, 'sine');
      this.burst(this.whiteB, { type: 'bandpass', f0: 2600, f1: 1200, q: 2, dur: 0.04, vol: 0.35 });
    }
    // ignition crack and the thump of the motor catching
    this.burst(this.whiteB, { type: 'highpass', f0: 1500, f1: 700, q: 0.7, dur: 0.07, vol: 0.5 * v * Math.min(1, absorb / 4000), delay: d + 0.03 });
    this.burst(this.brownB, { type: 'lowpass', f0: 500, f1: 70, dur: 0.5, vol: 0.5 * v, attack: 0.01, delay: d + 0.03 });
    // the motor: a harsh crackling roar, pitch and brightness falling away as it pulls away
    this.play(this.rocketB, { vol: 0.85 * v, delay: d + 0.03, rate: 1.1, rate1: 0.72, lp: Math.min(absorb, 11000), lp1: Math.min(absorb, 2200), dur: 3.2, fade: 2.2, reverb: 0.35, offset: Math.random() * 1.5 });
  }

  /** Explosion: blast wave, fireball, rolling rumble, debris and echoes -- delayed, deepened and muffled with distance. */
  explosion(distance: number, size = 1): void {
    if (!this.ctx) return;
    const d = Math.min(5, distance / 343);
    const v = Math.min(1, (size * 1.6) / (1 + distance / 350));
    if (v < 0.008) return;
    const lp = Math.max(160, 14000 / (1 + distance / 250));
    const rate = Math.max(0.6, 1.05 - size * 0.08 - Math.min(0.3, distance / 8000)) * (0.95 + Math.random() * 0.1);
    this.play(this.boomB, { vol: v, delay: d, rate, lp, reverb: 0.55 });
    // a close one cracks as well as booms
    if (distance < 600) this.burst(this.whiteB, { type: 'highpass', f0: 1600, f1: 700, dur: 0.05, vol: 0.5 * v * (1 - distance / 600), delay: d });
  }

  /** Something struck the airframe: a sharp metallic bang, the skin ringing, a thump and rattling debris. */
  hitThud(): void {
    if (!this.ctx) return;
    this.burst(this.whiteB, { type: 'bandpass', f0: 3200, f1: 1100, q: 2.5, dur: 0.07, vol: 0.55 });
    for (const [f, dur, vol] of [
      [523, 0.28, 0.04],
      [861, 0.2, 0.03],
      [1307, 0.14, 0.022],
      [2140, 0.09, 0.015],
    ])
      this.tone(f, f * 0.97, dur, vol, 'triangle');
    this.tone(95, 45, 0.22, 0.5, 'sine');
    this.burst(this.brownB, { type: 'lowpass', f0: 450, f1: 70, dur: 0.3, vol: 0.45 });
    for (let i = 0; i < 4; i++) this.burst(this.whiteB, { type: 'bandpass', f0: 4200, f1: 3000, q: 3, dur: 0.012, vol: 0.08, delay: 0.03 + Math.random() * 0.15 });
  }

  /** One heartbeat while blacked out: the strong "lub", then a softer "dub". */
  heartbeat(strong: boolean): void {
    if (!this.ctx) return;
    const v = strong ? 0.6 : 0.4;
    this.tone(strong ? 64 : 56, 36, 0.17, v, 'sine');
    this.burst(this.brownB, { type: 'lowpass', f0: 170, f1: 55, dur: 0.15, vol: v * 0.55 });
  }

  /** Flare / chaff cartridge: the squib's pop, the crack of the cartridge and the flare burning away. */
  countermeasure(): void {
    if (!this.ctx) return;
    this.tone(170, 60, 0.07, 0.3, 'sine');
    this.burst(this.whiteB, { type: 'highpass', f0: 3200, f1: 1800, dur: 0.03, vol: 0.28 });
    this.burst(this.pinkB, { type: 'bandpass', f0: 2600, f1: 1400, q: 0.8, dur: 0.55, vol: 0.06, attack: 0.02, delay: 0.02 });
  }

  /** Gear, speedbrake, ground crew: the uplock releasing, the hydraulic pump's whine and the leg locking. */
  mechanical(): void {
    if (!this.ctx) return;
    this.tone(140, 90, 0.08, 0.2, 'sine', 0, this.uiBus);
    this.tone(360, 540, 0.85, 0.016, 'sawtooth', 0.04, this.uiBus, 1300);
    this.burst(this.pinkB, { type: 'bandpass', f0: 800, f1: 1150, q: 4, dur: 0.85, vol: 0.1, attack: 0.08, bus: this.uiBus });
    this.burst(this.brownB, { type: 'lowpass', f0: 600, f1: 120, dur: 0.16, vol: 0.42, delay: 0.88, bus: this.uiBus });
    this.tone(130, 60, 0.14, 0.38, 'sine', 0.89, this.uiBus);
    this.burst(this.whiteB, { type: 'bandpass', f0: 3000, f1: 2200, q: 3, dur: 0.02, vol: 0.12, delay: 0.9, bus: this.uiBus });
  }

  /** Soft switch tick. */
  click(): void {
    if (!this.ctx) return;
    this.burst(this.whiteB, { type: 'bandpass', f0: 3800, f1: 2400, q: 1.5, dur: 0.012, vol: 0.18, attack: 0.001, bus: this.uiBus });
    this.tone(2300, 1900, 0.025, 0.02, 'sine', 0, this.uiBus);
  }

  /** New radar lock on us: the RWR's rising double chirp. */
  rwrNewThreat(): void {
    this.beep(1150, 0.05, 0.05, 'square');
    this.beep(1450, 0.05, 0.05, 'square', 0.07);
    this.beep(1150, 0.05, 0.05, 'square', 0.16);
    this.beep(1450, 0.05, 0.05, 'square', 0.23);
  }

  masterCaution(): void {
    this.beep(880, 0.12, 0.07, 'square');
    this.beep(880, 0.12, 0.07, 'square', 0.2);
  }

  /** Voice warnings ("Bitching Betty") via speech synthesis where available. */
  voice(text: string, key = text, cooldown = 6, russian?: string): void {
    if (!this.levels.voice || this.muted) return;
    const now = performance.now() / 1000;
    const last = this.lastVoice.get(key) ?? -1e9;
    if (now - last < cooldown) return;
    this.lastVoice.set(key, now);
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const voices = synth.getVoices();
      // Russian calls in a Russian voice where the device has one
      const ru = russian ? voices.find((vv) => /^ru/i.test(vv.lang)) : undefined;
      const u = new SpeechSynthesisUtterance(ru ? russian! : text);
      u.rate = 1.08;
      u.pitch = 1.0;
      u.volume = Math.min(1, this.levels.master * this.levels.warnings);
      if (ru) {
        u.voice = ru;
        u.lang = ru.lang;
        synth.speak(u);
        return;
      }
      const female = voices.find((vv) => /female|zira|samantha|victoria|karen|serena|aria|jenny/i.test(vv.name) && /en/i.test(vv.lang));
      if (female) u.voice = female;
      synth.speak(u);
    } catch {
      /* speech unavailable */
    }
  }

  silenceContinuous(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const loops = [this.roar, this.body, this.crack, this.abRoar, this.abSub, this.intake, this.wind, this.whistle, this.buffet, this.gearRumble, this.ecs, this.gsuit, this.roll];
    for (const l of loops) l.gain.gain.setTargetAtTime(0, t, 0.05);
    for (const g of [this.buffetMod, this.fanGain, this.whineGain, this.growl.gain, this.rwr.gain, this.gun.gain]) g.gain.setTargetAtTime(0, t, 0.05);
    for (const sl of this.slots) {
      sl.id = -1;
      for (const l of [sl.roar, sl.crack, sl.ab]) l.gain.gain.setTargetAtTime(0, t, 0.05);
      sl.fanGain.gain.setTargetAtTime(0, t, 0.05);
    }
    this.gun.src?.stop(t + 0.1);
    this.gun.src = null;
    this.gun.firing = false;
    this.lastAb = 0;
    this.wasOnGround = true;
  }
}

export const audio = new AudioEngine();
