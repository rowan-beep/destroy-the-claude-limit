// Sound engine (WebAudio, fully synthesised -- no audio assets are shipped).
//
// Everything is built from noise, oscillators and small procedurally
// rendered sample buffers made once at start-up:
//   * jet engine: exhaust rumble, mid roar and jet hiss (all breathing with
//     slow random turbulence so it never sounds like a steady fan), faint
//     drifting turbine tones tuned per engine type, afterburner rumble with
//     popping crackle and a light-off "whump"; balanced by where the camera
//     sits (behind = roar, in front = turbine, cockpit = muffled);
//   * airflow: wind rush that grows with dynamic pressure, canopy whistle,
//     buffet at high G / AoA, gear-down rumble, cockpit air-conditioning;
//   * other jets passing close: Doppler-shifted roar;
//   * guns rendered shot by shot (M61 "BRRRT", 27 / 30 mm thumps);
//   * rocket-motor launches, layered explosions delayed and muffled by
//     distance, metallic hits, flare / chaff pops, mechanical clunks;
//   * Sidewinder growl, RWR warbles, stall tone, soft UI ticks;
//   * a limiter on the master bus.

export interface AudioLevels {
  master: number;
  engine: number;
  effects: number;
  warnings: number;
  voice: boolean;
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
  /** nearest other jet to the camera: distance (m), closing speed (m/s, + = approaching), afterburner */
  flybyDist?: number;
  flybyClosing?: number;
  flybyAb?: number;
}

interface EngineVoice {
  /** turbine tone partial frequencies at idle / full rpm (Hz) */
  tone: [number, number];
  partials: number[];
  /** exhaust roar band centre at idle / full (Hz) */
  roar: [number, number];
  /** rumble lowpass at idle / full (Hz) */
  rumble: [number, number];
  /** afterburner crackle centre (Hz) and weight */
  crackle: number;
  abWeight: number;
  toneWeight: number;
}

const VOICES: Record<string, EngineVoice> = {
  // GE F110-GE-129: broad, powerful roar
  F15EX: { tone: [260, 1180], partials: [1, 1.52, 2.31], roar: [380, 1150], rumble: [150, 420], crackle: 1500, abWeight: 1, toneWeight: 1 },
  // GE F414: a touch higher, the Hornet "howl"
  FA18EF: { tone: [300, 1320], partials: [1, 1.41, 2.07], roar: [420, 1300], rumble: [170, 460], crackle: 1700, abWeight: 0.9, toneWeight: 1.25 },
  // EJ200: the Typhoon's distinctive high turbine song
  TYPHOON: { tone: [340, 1480], partials: [1, 1.33, 1.98, 2.9], roar: [450, 1380], rumble: [170, 480], crackle: 1800, abWeight: 0.85, toneWeight: 1.5 },
  // AL-41F1S: deep, heavy Flanker thunder
  SU35: { tone: [220, 960], partials: [1, 1.61, 2.44], roar: [320, 980], rumble: [120, 360], crackle: 1250, abWeight: 1.2, toneWeight: 0.8 },
};

// ---------------------------------------------------------------------------
// Procedural buffers
// ---------------------------------------------------------------------------

function makeBuffer(ctx: AudioContext, seconds: number, fill: (d: Float32Array, sr: number) => void): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  fill(buf.getChannelData(0), ctx.sampleRate);
  return buf;
}

function normalize(d: Float32Array, peak = 0.9): void {
  let m = 1e-9;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  const k = peak / m;
  for (let i = 0; i < d.length; i++) d[i] *= k;
}

/** Cross-fade the end into the start so a looped buffer has no click. */
function seamless(d: Float32Array, sr: number, fadeSec = 0.05): void {
  const n = Math.min(Math.floor(sr * fadeSec), Math.floor(d.length / 4));
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const end = d.length - n + i;
    d[i] = d[i] * a + d[end] * (1 - a);
  }
}

function noise(ctx: AudioContext, seconds: number, kind: 'white' | 'pink' | 'brown'): AudioBuffer {
  return makeBuffer(ctx, seconds, (d, sr) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        // Paul Kellet's refined pink filter
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last;
      }
    }
    normalize(d, 0.8);
    seamless(d, sr);
  });
}

/** Slow random turbulence (control signal, roughly -1..1). */
function turbulence(ctx: AudioContext, seconds: number, cornerHz: number): AudioBuffer {
  return makeBuffer(ctx, seconds, (d, sr) => {
    let y = 0, z = 0;
    const a = 1 - Math.exp((-2 * Math.PI * cornerHz) / sr);
    for (let i = 0; i < d.length; i++) {
      y += (Math.random() * 2 - 1 - y) * a;
      z += (y - z) * a;
      d[i] = z;
    }
    normalize(d, 1);
    seamless(d, sr, 0.5);
  });
}

/** Afterburner crackle: a Poisson stream of short decaying pops of random size. */
function crackle(ctx: AudioContext, seconds: number, rate: number): AudioBuffer {
  return makeBuffer(ctx, seconds, (d, sr) => {
    let t = 0;
    while (t < d.length) {
      t += Math.floor((-Math.log(1 - Math.random()) * sr) / rate);
      const amp = 0.08 + Math.pow(Math.random(), 4) * 0.92;
      const dur = Math.floor(sr * (0.002 + Math.random() * 0.014));
      for (let k = 0; k < dur && t + k < d.length; k++) d[t + k] += (Math.random() * 2 - 1) * amp * Math.exp((-4 * k) / dur);
    }
    normalize(d, 0.9);
    seamless(d, sr, 0.01);
  });
}

/**
 * One loop of gunfire at `rpm`, rendered shot by shot: a sharp crack, a
 * body thump and (heavy cannon) a deeper boom; small timing jitter.
 */
function gunLoop(ctx: AudioContext, rpm: number): AudioBuffer {
  const heavy = rpm < 3000;
  const interval = 60 / rpm;
  const shots = Math.max(4, Math.round(0.5 / interval));
  return makeBuffer(ctx, shots * interval, (d, sr) => {
    const bodyHz = heavy ? 58 : 92;
    const crackLen = Math.floor(sr * (heavy ? 0.014 : 0.005));
    const bodyLen = Math.floor(sr * (heavy ? 0.09 : 0.03));
    for (let s = 0; s < shots; s++) {
      const t0 = Math.floor((s + (Math.random() - 0.5) * 0.08) * interval * sr);
      const gain = 0.85 + Math.random() * 0.3;
      let lp = 0;
      for (let k = 0; k < bodyLen; k++) {
        const i = (t0 + k + d.length) % d.length;
        const tt = k / sr;
        let v = Math.sin(2 * Math.PI * bodyHz * tt * (1 - tt * (heavy ? 3 : 6))) * Math.exp(-tt / (heavy ? 0.035 : 0.012));
        if (k < crackLen) {
          const w = Math.random() * 2 - 1;
          lp += (w - lp) * (heavy ? 0.35 : 0.6);
          v += lp * Math.exp((-5 * k) / crackLen) * (heavy ? 1.1 : 0.9);
        }
        d[i] += v * gain;
      }
    }
    normalize(d, 0.9);
  });
}

/** Short convolution tail for explosions rolling around the sky. */
function reverbImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
  }
  return buf;
}

// ---------------------------------------------------------------------------

interface Loop {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class AudioEngine {
  ctx: AudioContext | null = null;
  levels: AudioLevels = { master: 0.8, engine: 0.8, effects: 0.9, warnings: 0.9, voice: true };
  muted = false;

  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private engineBus!: GainNode;
  private fxBus!: GainNode;
  private warnBus!: GainNode;
  private uiBus!: GainNode;
  private cockpitFilter!: BiquadFilterNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;

  private white!: AudioBuffer;
  private pink!: AudioBuffer;
  private pink2!: AudioBuffer;
  private brown!: AudioBuffer;
  private brown2!: AudioBuffer;
  private turbSlow!: AudioBuffer;
  private turbFast!: AudioBuffer;
  private crackleBuf!: AudioBuffer;
  private gunBufs = new Map<number, AudioBuffer>();

  // engine
  private rumble!: Loop;
  private roar!: Loop;
  private hiss!: Loop;
  private roarMod!: GainNode;
  private turbine!: { oscs: OscillatorNode[]; gains: GainNode[]; bus: GainNode; filter: BiquadFilterNode; jitter: GainNode[] };
  private turbineMod!: GainNode;
  private abRumble!: Loop;
  private abCrackle!: Loop;
  private abMod!: GainNode;
  // airflow
  private wind!: Loop;
  private whistle!: Loop;
  private buffet!: Loop;
  private buffetMod!: GainNode;
  private gearRumble!: Loop;
  private ecs!: Loop;
  // other jets
  private flyby!: Loop;
  private flybyHiss!: Loop;
  // gun
  private gun: { src: AudioBufferSourceNode | null; gain: GainNode; filter: BiquadFilterNode; rpm: number; firing: boolean };
  // warning tones
  private growl!: { osc: OscillatorNode; fm: GainNode; filter: BiquadFilterNode; gain: GainNode };
  private rwr!: { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };

  private voiceName = 'F15EX';
  private lastAb = 0;
  private lastRpm = 0;
  private lastVoice = new Map<string, number>();

  constructor() {
    this.gun = { src: null, gain: null as unknown as GainNode, filter: null as unknown as BiquadFilterNode, rpm: 0, firing: false };
  }

  /** Must be called from a user gesture. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;

    // buffers (different lengths so the loops never line up audibly)
    this.white = noise(ctx, 2.3, 'white');
    this.pink = noise(ctx, 4.1, 'pink');
    this.pink2 = noise(ctx, 5.3, 'pink');
    this.brown = noise(ctx, 4.7, 'brown');
    this.brown2 = noise(ctx, 6.1, 'brown');
    this.turbSlow = turbulence(ctx, 11, 1.2);
    this.turbFast = turbulence(ctx, 3.7, 9);
    this.crackleBuf = crackle(ctx, 3.3, 55);

    // buses
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;
    this.limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(this.limiter);
    this.cockpitFilter = ctx.createBiquadFilter();
    this.cockpitFilter.type = 'lowpass';
    this.cockpitFilter.frequency.value = 18000;
    this.cockpitFilter.Q.value = 0.5;
    this.cockpitFilter.connect(this.master);
    this.engineBus = ctx.createGain();
    this.engineBus.connect(this.cockpitFilter);
    this.fxBus = ctx.createGain();
    this.fxBus.connect(this.master);
    this.warnBus = ctx.createGain();
    this.warnBus.connect(this.master);
    this.uiBus = ctx.createGain();
    this.uiBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = reverbImpulse(ctx, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb).connect(this.fxBus);

    const loop = (buf: AudioBuffer, type: BiquadFilterType, freq: number, q: number, bus: AudioNode, rate = 1): Loop => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rate;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(bus);
      src.start(ctx.currentTime + Math.random() * 0.05);
      return { src, filter, gain };
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
      src.start(ctx.currentTime + Math.random() * 2);
      return g;
    };

    // --- engine --------------------------------------------------------------
    this.rumble = loop(this.brown, 'lowpass', 200, 0.7, this.engineBus);
    this.roar = loop(this.pink, 'bandpass', 600, 0.55, this.engineBus);
    this.hiss = loop(this.white, 'bandpass', 3800, 0.6, this.engineBus);
    this.roarMod = modulate(this.turbSlow, this.roar.gain.gain, 0, 1);
    modulate(this.turbSlow, this.rumble.filter.frequency, 35, 0.7);
    modulate(this.turbFast, this.roar.filter.frequency, 90, 0.8);

    // turbine tones: soft, several inharmonic partials, pitch drifting with turbulence
    const tBus = ctx.createGain();
    tBus.gain.value = 0;
    const tFilter = ctx.createBiquadFilter();
    tFilter.type = 'lowpass';
    tFilter.frequency.value = 3000;
    tBus.connect(tFilter).connect(this.engineBus);
    this.turbineMod = modulate(this.turbSlow, tBus.gain, 0, 1.3);
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const jitter: GainNode[] = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g).connect(tBus);
      jitter.push(modulate(this.turbFast, o.frequency, 0, 0.6 + i * 0.17));
      o.start();
      oscs.push(o);
      gains.push(g);
    }
    this.turbine = { oscs, gains, bus: tBus, filter: tFilter, jitter };

    // afterburner: heavy low rumble pulsing with turbulence + crackle
    this.abRumble = loop(this.brown2, 'lowpass', 320, 0.9, this.engineBus);
    this.abMod = modulate(this.turbFast, this.abRumble.gain.gain, 0, 1.4);
    this.abCrackle = loop(this.crackleBuf, 'bandpass', 1500, 0.7, this.engineBus);

    // --- airflow ---------------------------------------------------------------
    this.wind = loop(this.pink2, 'bandpass', 500, 0.45, this.engineBus);
    modulate(this.turbSlow, this.wind.filter.frequency, 120, 0.5);
    this.whistle = loop(this.white, 'bandpass', 3200, 6, this.engineBus, 0.93);
    this.buffet = loop(this.brown, 'lowpass', 70, 1.2, this.engineBus, 1.3);
    this.buffetMod = modulate(this.turbFast, this.buffet.gain.gain, 0, 2.5);
    this.gearRumble = loop(this.brown2, 'bandpass', 140, 0.8, this.engineBus, 1.1);
    this.ecs = loop(this.white, 'bandpass', 5200, 0.9, this.master, 0.8);

    // --- other jets passing ----------------------------------------------------
    this.flyby = loop(this.pink2, 'lowpass', 900, 0.7, this.fxBus);
    this.flybyHiss = loop(this.white, 'bandpass', 2500, 0.6, this.fxBus);

    // --- gun --------------------------------------------------------------------
    const gg = ctx.createGain();
    gg.gain.value = 0;
    const gf = ctx.createBiquadFilter();
    gf.type = 'lowpass';
    gf.frequency.value = 6000;
    gg.connect(gf).connect(this.fxBus);
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

    // --- RWR / stall tone ---------------------------------------------------------
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

  applyLevels(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.levels.master, t, 0.05);
    this.engineBus.gain.setTargetAtTime(this.levels.engine, t, 0.05);
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
    const v = VOICES[s.type ?? this.voiceName] ?? VOICES.F15EX;
    if (s.type) this.voiceName = s.type;
    const on = s.alive ? 1 : 0;
    const rpm = clamp01(s.rpm);
    const ab = clamp01(s.ab);
    const cockpit = s.inCockpit;
    // where the listener is relative to the jet: behind (-1) .. ahead (+1)
    const aspect = cockpit ? 0 : s.camAspect ?? -0.8;
    const behind = clamp01(-aspect);
    const ahead = clamp01(aspect);
    const dist = cockpit ? 0 : s.camDist ?? 30;
    const distK = 1 / (1 + Math.max(0, dist - 25) / 90);
    const k = 0.09;
    const lerp = (a: number, b: number, x: number) => a + (b - a) * x;

    // cockpit: canopy and helmet take the top off everything outside
    this.cockpitFilter.frequency.setTargetAtTime(cockpit ? 1400 : 18000, t, 0.12);

    // --- exhaust rumble / roar / hiss ---
    const r2 = rpm * rpm;
    const ext = cockpit ? 0.5 : distK * (0.55 + 0.6 * behind);
    this.rumble.gain.gain.setTargetAtTime(on * (0.12 + 0.55 * r2) * ext, t, k);
    this.rumble.filter.frequency.setTargetAtTime(lerp(v.rumble[0], v.rumble[1], rpm), t, 0.2);
    const roarG = on * (0.05 + 0.5 * r2) * (cockpit ? 0.35 : distK * (0.35 + 0.75 * behind));
    this.roar.gain.gain.setTargetAtTime(roarG, t, k);
    this.roarMod.gain.setTargetAtTime(roarG * 0.35, t, 0.2);
    this.roar.filter.frequency.setTargetAtTime(lerp(v.roar[0], v.roar[1], rpm), t, 0.25);
    this.hiss.gain.gain.setTargetAtTime(on * r2 * rpm * (cockpit ? 0.01 : distK * 0.045 * (0.2 + behind)), t, k);

    // --- turbine: faint, drifting, mostly heard from ahead and in the cockpit ---
    const tw = on * v.toneWeight * (0.18 + 0.82 * rpm) * (cockpit ? 0.011 : distK * (0.004 + 0.026 * ahead));
    this.turbine.bus.gain.setTargetAtTime(tw, t, 0.15);
    this.turbineMod.gain.setTargetAtTime(tw * 0.6, t, 0.2);
    const f0 = lerp(v.tone[0], v.tone[1], Math.pow(rpm, 1.3));
    this.turbine.oscs.forEach((o, i) => {
      const p = v.partials[i];
      if (p === undefined) {
        this.turbine.gains[i].gain.setTargetAtTime(0, t, 0.1);
        return;
      }
      o.frequency.setTargetAtTime(f0 * p, t, 0.35);
      this.turbine.jitter[i].gain.setTargetAtTime(f0 * p * 0.006, t, 0.2);
      this.turbine.gains[i].gain.setTargetAtTime(1 / (1 + i * 1.4), t, 0.2);
    });
    this.turbine.filter.frequency.setTargetAtTime(cockpit ? 1800 : 4500, t, 0.2);

    // --- afterburner ---
    const abG = on * ab * v.abWeight * (cockpit ? 0.45 : distK * (0.4 + 0.8 * behind));
    this.abRumble.gain.gain.setTargetAtTime(abG * 0.9, t, 0.12);
    this.abMod.gain.setTargetAtTime(abG * 0.45, t, 0.15);
    this.abRumble.filter.frequency.setTargetAtTime(240 + 220 * ab, t, 0.2);
    this.abCrackle.gain.gain.setTargetAtTime(abG * (cockpit ? 0.08 : 0.55 * (0.3 + behind)), t, 0.12);
    this.abCrackle.filter.frequency.setTargetAtTime(v.crackle * (cockpit ? 0.5 : 1), t, 0.2);
    // light-off: a deep whump when the burner catches
    if (on && ab > 0.08 && this.lastAb <= 0.08) this.abLight(cockpit ? 0.35 : distK * (0.5 + 0.5 * behind));
    this.lastAb = ab;
    // spool-up swell
    if (on && rpm - this.lastRpm > 0.012) {
      this.roar.gain.gain.setTargetAtTime(roarG * 1.35, t, 0.05);
    }
    this.lastRpm = rpm;

    // --- airflow ---
    const q = Math.min(1.4, s.qbar / 55000);
    const windG = on * q * (cockpit ? 0.34 : 0.12 + 0.1 * ahead);
    this.wind.gain.gain.setTargetAtTime(windG, t, 0.15);
    this.wind.filter.frequency.setTargetAtTime(280 + Math.min(2600, s.tas * 4.2), t, 0.2);
    const mach = s.mach ?? s.tas / 300;
    this.whistle.gain.gain.setTargetAtTime(on * (cockpit ? 0.02 : 0.006) * clamp01((mach - 0.6) * 2) * q, t, 0.3);
    this.whistle.filter.frequency.setTargetAtTime(2400 + mach * 1400, t, 0.3);
    // buffet: high AoA / G at speed shakes the airframe
    const aoaDeg = ((s.aoa ?? 0) * 180) / Math.PI;
    const buff = clamp01((aoaDeg - 14) / 12) * 0.8 + clamp01(((s.g ?? 1) - 6) / 4) * 0.5 + (s.speedbrake ? 0.25 : 0);
    const buffG = on * Math.min(1, buff) * Math.min(1, q * 1.5) * (cockpit ? 0.8 : 0.35);
    this.buffet.gain.gain.setTargetAtTime(buffG * 0.6, t, 0.08);
    this.buffetMod.gain.setTargetAtTime(buffG * 0.55, t, 0.08);
    this.gearRumble.gain.gain.setTargetAtTime(on * (s.gear ?? 0) * Math.min(1, q * 3) * (cockpit ? 0.3 : 0.14), t, 0.2);
    // cockpit air conditioning: a faint steady hiss
    this.ecs.gain.gain.setTargetAtTime(cockpit && on ? 0.006 : 0, t, 0.3);

    // --- another jet close by: Doppler-shifted roar ---
    const fd = s.flybyDist ?? Infinity;
    if (fd < 2500) {
      const closing = s.flybyClosing ?? 0;
      const dop = Math.max(0.55, Math.min(1.8, 343 / Math.max(120, 343 - closing)));
      const fg = Math.pow(clamp01(1 - fd / 2500), 1.6) * (0.55 + 0.6 * (s.flybyAb ?? 0));
      this.flyby.gain.gain.setTargetAtTime(fg * 0.9, t, 0.08);
      this.flyby.filter.frequency.setTargetAtTime(500 + 2500 * clamp01(1 - fd / 1500), t, 0.1);
      this.flyby.src.playbackRate.setTargetAtTime(dop, t, 0.08);
      this.flybyHiss.gain.gain.setTargetAtTime(fg * 0.12 * clamp01(1 - fd / 800), t, 0.08);
      this.flybyHiss.src.playbackRate.setTargetAtTime(dop, t, 0.08);
    } else {
      this.flyby.gain.gain.setTargetAtTime(Math.min(0.5, s.nearbyJet * 0.5), t, 0.15);
      this.flybyHiss.gain.gain.setTargetAtTime(0, t, 0.15);
    }

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
      // fast high warble
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

  private updateGun(firing: boolean, rpm: number, cockpit: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = this.gun;
    g.filter.frequency.setTargetAtTime(cockpit ? 2200 : 7000, t, 0.05);
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
      // the M61 spins up for a moment before reaching full rate
      if (rpm > 3000) {
        src.playbackRate.setValueAtTime(0.7, t);
        src.playbackRate.linearRampToValueAtTime(1, t + 0.25);
      }
      src.connect(g.gain);
      src.start(t);
      g.src = src;
      g.gain.gain.cancelScheduledValues(t);
      g.gain.gain.setTargetAtTime(cockpit ? 0.5 : 0.7, t, 0.01);
    } else if (!firing && g.firing) {
      g.gain.gain.cancelScheduledValues(t);
      g.gain.gain.setTargetAtTime(0, t + 0.02, 0.03);
      const src = g.src;
      if (src) {
        if (rpm > 3000) src.playbackRate.linearRampToValueAtTime(0.6, t + 0.15);
        src.stop(t + 0.3);
      }
      g.src = null;
      // spin-down: the rotary barrels whirring to a stop
      if (rpm > 3000) this.tone(420, 180, 0.35, 0.02, 'sawtooth', 0, this.fxBus, 900);
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

  private abLight(vol: number): void {
    this.tone(70, 38, 0.45, 0.5 * vol, 'sine');
    this.burst(this.brown, { type: 'lowpass', f0: 600, f1: 160, dur: 0.7, vol: 0.55 * vol, attack: 0.03 });
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

  /** Missile off the rail: clunk, ignition crack, then the rocket motor roaring away. */
  missileLaunch(own: boolean, distance: number): void {
    if (!this.ctx) return;
    const v = own ? 1 : Math.max(0.02, 0.7 / (1 + distance / 250));
    const d = own ? 0 : Math.min(3, distance / 343);
    const muffle = own ? 1 : Math.max(0.15, 1 - distance / 4000);
    if (own) {
      this.tone(95, 55, 0.12, 0.35, 'sine');
      this.burst(this.white, { type: 'bandpass', f0: 2200, f1: 900, q: 1.2, dur: 0.05, vol: 0.4 });
    }
    // motor: bright roar sliding down in pitch as it pulls away
    this.burst(this.pink, { type: 'bandpass', f0: 2600 * muffle, f1: 450 * muffle, q: 0.5, dur: 2.6, vol: 0.75 * v, attack: 0.03, delay: d, rate: 1.15, rate1: 0.75, reverb: 0.3 });
    this.burst(this.white, { type: 'highpass', f0: 3500, f1: 1800, q: 0.5, dur: 1.4, vol: 0.18 * v * muffle, attack: 0.02, delay: d });
    this.burst(this.brown, { type: 'lowpass', f0: 500, f1: 90, dur: 2.2, vol: 0.6 * v, attack: 0.05, delay: d });
  }

  /** Explosion: crack (close), boom, rolling body and debris, delayed and muffled with distance. */
  explosion(distance: number, size = 1): void {
    if (!this.ctx) return;
    const d = Math.min(5, distance / 343);
    const v = Math.min(1, (size * 1.6) / (1 + distance / 350));
    if (v < 0.008) return;
    const near = Math.max(0, 1 - distance / 1500);
    const muffle = Math.max(140, 3500 / (1 + distance / 500));
    if (near > 0) this.burst(this.white, { type: 'highpass', f0: 1500, f1: 600, dur: 0.06, vol: 0.6 * v * near, delay: d });
    this.tone(62, 28, 0.9 + size * 0.4, 0.7 * v, 'sine', d);
    this.burst(this.brown2, { type: 'lowpass', f0: Math.min(900, muffle), f1: 45, dur: 2.8 + size * 1.2, vol: v, attack: 0.012, delay: d, reverb: 0.6 });
    this.burst(this.pink, { type: 'lowpass', f0: muffle, f1: 180, dur: 1.1, vol: 0.55 * v, attack: 0.008, delay: d, reverb: 0.4 });
    if (near > 0.2) this.burst(this.crackleBuf, { type: 'bandpass', f0: 1800, f1: 700, q: 0.6, dur: 1.6, vol: 0.4 * v * near, attack: 0.05, delay: d + 0.05 });
  }

  /** Something struck the airframe: a sharp metallic bang with a ring and a thump. */
  hitThud(): void {
    if (!this.ctx) return;
    this.burst(this.white, { type: 'bandpass', f0: 2600, f1: 900, q: 2.5, dur: 0.09, vol: 0.55 });
    this.tone(410, 380, 0.18, 0.06, 'sine');
    this.tone(1130, 1060, 0.12, 0.035, 'sine');
    this.tone(95, 50, 0.22, 0.5, 'sine');
    this.burst(this.brown, { type: 'lowpass', f0: 400, f1: 70, dur: 0.3, vol: 0.45 });
  }

  /** Flare / chaff cartridge: a thump and a hiss. */
  countermeasure(): void {
    if (!this.ctx) return;
    this.tone(140, 70, 0.07, 0.25, 'sine');
    this.burst(this.white, { type: 'highpass', f0: 4200, f1: 1800, dur: 0.28, vol: 0.14, attack: 0.006 });
  }

  /** Gear, speedbrake, ground crew: hydraulic whine and a couple of clunks. */
  mechanical(): void {
    if (!this.ctx) return;
    this.burst(this.pink, { type: 'bandpass', f0: 700, f1: 1100, q: 3, dur: 0.9, vol: 0.12, attack: 0.08, bus: this.uiBus });
    this.tone(160, 110, 0.12, 0.3, 'sine', 0.05, this.uiBus);
    this.burst(this.brown, { type: 'lowpass', f0: 500, f1: 120, dur: 0.18, vol: 0.4, delay: 0.85, bus: this.uiBus });
    this.tone(120, 70, 0.14, 0.35, 'sine', 0.86, this.uiBus);
  }

  /** Soft switch tick. */
  click(): void {
    if (!this.ctx) return;
    this.burst(this.white, { type: 'bandpass', f0: 3800, f1: 2400, q: 1.5, dur: 0.012, vol: 0.18, attack: 0.001, bus: this.uiBus });
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
    const loops = [this.rumble, this.roar, this.hiss, this.abRumble, this.abCrackle, this.wind, this.whistle, this.buffet, this.gearRumble, this.ecs, this.flyby, this.flybyHiss];
    for (const l of loops) l.gain.gain.setTargetAtTime(0, t, 0.05);
    for (const g of [this.roarMod, this.abMod, this.buffetMod, this.turbineMod, this.turbine.bus, this.growl.gain, this.rwr.gain, this.gun.gain]) g.gain.setTargetAtTime(0, t, 0.05);
    this.gun.src?.stop(t + 0.1);
    this.gun.src = null;
    this.gun.firing = false;
    this.lastAb = 0;
  }
}

export const audio = new AudioEngine();
