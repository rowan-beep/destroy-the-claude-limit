// The ocean's sounds, made with Web Audio through the game's effects bus:
// the sea (slosh at the surface, a low rumble below), the thrusters, the
// ballast pumps, the hull settling as it goes deeper, and the hydrophone. In
// Quiet Survey the boat's own noise drops away and the hydrophone's hiss comes
// up: a contact is heard as its pattern standing out of that hiss, as clearly
// as its signal-to-noise ratio allows. Nothing here is needed to play: every
// sound is also shown and described on screen.

import { audio } from '../../audio/audio';

interface Layer {
  src: AudioBufferSourceNode | OscillatorNode;
  gain: GainNode;
}

export class OceanAudio {
  private ctx: BaseAudioContext | null = null;
  private out: GainNode | null = null;
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private under: Layer | null = null;
  private surf: Layer | null = null;
  private surfLfo: OscillatorNode | null = null;
  private motor: Layer | null = null;
  private motorF: BiquadFilterNode | null = null;
  private whine: Layer | null = null;
  private pump: Layer | null = null;
  private hiss: Layer | null = null;
  private creakT = 3;
  private running = false;
  private lastDepth = 0;

  /** build the graph (after a user gesture has started the audio) */
  start(): void {
    audio.init();
    const ctx = audio.ctx;
    const bus = audio.fxOut;
    if (!ctx || !bus) return;
    if (this.running) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(bus);
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
    const sr = ctx.sampleRate;
    if (!this.white) {
      const n = sr * 2;
      const w = ctx.createBuffer(1, n, sr), b = ctx.createBuffer(1, n * 2, sr);
      const wd = w.getChannelData(0), bd = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) wd[i] = Math.random() * 2 - 1;
      for (let i = 0; i < n * 2; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        bd[i] = last * 3.5;
      }
      this.white = w;
      this.brown = b;
    }
    const noise = (buf: AudioBuffer, type: BiquadFilterType, f: number, q: number): Layer => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(fl).connect(g).connect(this.out!);
      src.start();
      return { src, gain: g };
    };
    // the sea below: a deep rumble; at the surface: slosh and spray, rising and falling with the swell
    this.under = noise(this.brown!, 'lowpass', 260, 0.7);
    this.surf = noise(this.white!, 'bandpass', 900, 0.6);
    this.surfLfo = ctx.createOscillator();
    this.surfLfo.frequency.value = 0.11;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.25;
    this.surfLfo.connect(lfoG).connect(this.surf.gain.gain);
    this.surfLfo.start();
    // the thrusters: a motor buzz through the hull, and the whine of the drives
    const mo = ctx.createOscillator();
    mo.type = 'sawtooth';
    mo.frequency.value = 70;
    this.motorF = ctx.createBiquadFilter();
    this.motorF.type = 'lowpass';
    this.motorF.frequency.value = 500;
    const mg = ctx.createGain();
    mg.gain.value = 0;
    mo.connect(this.motorF).connect(mg).connect(this.out);
    mo.start();
    this.motor = { src: mo, gain: mg };
    const wh = ctx.createOscillator();
    wh.type = 'sine';
    wh.frequency.value = 900;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    wh.connect(wg).connect(this.out);
    wh.start();
    this.whine = { src: wh, gain: wg };
    // the ballast pump
    const pu = ctx.createOscillator();
    pu.type = 'square';
    pu.frequency.value = 118;
    const pf = ctx.createBiquadFilter();
    pf.type = 'bandpass';
    pf.frequency.value = 420;
    pf.Q.value = 3;
    const pg = ctx.createGain();
    pg.gain.value = 0;
    pu.connect(pf).connect(pg).connect(this.out);
    pu.start();
    this.pump = { src: pu, gain: pg };
    // the hydrophone's own hiss (only while listening)
    this.hiss = noise(this.white!, 'highpass', 2500, 0.5);
    this.running = true;
  }

  stop(): void {
    if (!this.running || !this.ctx || !this.out) return;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.15);
    const nodes = [this.under, this.surf, this.motor, this.whine, this.pump, this.hiss];
    const lfo = this.surfLfo;
    const out = this.out;
    window.setTimeout(() => {
      for (const n of nodes) {
        try {
          n?.src.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        lfo?.stop();
      } catch {
        /* */
      }
      out.disconnect();
    }, 800);
    this.running = false;
    this.out = null;
  }

  /** each frame: what the boat is doing and where it is */
  update(s: { depth: number; surfaced: boolean; thrust: number; vertical: number; lateral: number; pumping: boolean; quiet: boolean; listening: boolean; paused: boolean }): void {
    if (!this.running || !this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (l: Layer | null, v: number, tc = 0.15) => l?.gain.gain.setTargetAtTime(s.paused ? 0 : v, t, tc);
    const listen = s.listening ? 0.25 : 1;
    const deep = Math.min(1, s.depth / 60);
    set(this.under, s.surfaced ? 0.04 : (0.18 - 0.08 * deep) * listen, 0.5);
    set(this.surf, s.surfaced ? 0.35 : s.depth < 4 ? 0.12 * (1 - s.depth / 4) : 0, 0.4);
    const drive = Math.min(1, Math.abs(s.thrust) + 0.5 * Math.abs(s.lateral) + 0.6 * Math.abs(s.vertical));
    set(this.motor, drive * (s.quiet ? 0.025 : 0.07) * listen);
    set(this.whine, drive * (s.quiet ? 0.004 : 0.012) * listen);
    (this.motor?.src as OscillatorNode | undefined)?.frequency.setTargetAtTime(55 + 160 * drive, t, 0.3);
    (this.whine?.src as OscillatorNode | undefined)?.frequency.setTargetAtTime(700 + 1500 * drive, t, 0.3);
    this.motorF?.frequency.setTargetAtTime(300 + 900 * drive, t, 0.3);
    set(this.pump, s.pumping ? 0.05 * listen : 0, 0.08);
    set(this.hiss, s.listening ? 0.03 : 0, 0.3);
    // the hull settles as it goes deeper: a creak now and then, more often while descending
    const rate = s.depth - this.lastDepth;
    this.lastDepth = s.depth;
    this.creakT -= 1 / 60 + Math.max(0, rate) * 0.5;
    if (!s.paused && !s.surfaced && s.depth > 25 && this.creakT <= 0) {
      this.creakT = 5 + Math.random() * 14;
      this.creak(0.4 + deep * 0.6);
    }
  }

  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType, when = 0, q = 0): void {
    if (!this.ctx || !this.out) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (q > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = f0;
      f.Q.value = q;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, vol: number, type: BiquadFilterType, f: number, q: number, when = 0, brown = false): void {
    if (!this.ctx || !this.out || !this.white) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.white;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(this.out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private creak(k: number): void {
    const f = 90 + Math.random() * 120;
    this.tone(f, f * 0.8, 0.9, 0.035 * k, 'sawtooth', 0, 8);
    this.burst(0.5, 0.02 * k, 'bandpass', 160, 6, 0.1, true);
  }

  /** the active sonar's transmit and its first echo off the bottom */
  ping(echoDelay = 0.12): void {
    this.tone(3400, 3300, 0.09, 0.08, 'sine');
    this.tone(3400, 3300, 0.6, 0.012, 'sine', echoDelay);
    this.burst(1.6, 0.012, 'bandpass', 3300, 12, 0.05);
  }

  /** a contact's pattern, as heard through the hydrophone (the beacon's 37.5 kHz brought down to a knock) */
  contact(pitch: number, beats: number, clarity: number): void {
    if (clarity <= 0) return;
    const v = 0.02 + 0.09 * Math.min(1, clarity);
    for (let i = 0; i < beats; i++) {
      this.tone(pitch * 1.6, pitch, 0.09, v, 'triangle', i * 0.22, 2);
      this.burst(0.06, v * 0.5, 'bandpass', pitch * 2, 4, i * 0.22);
    }
  }

  /** a bearing is in */
  chime(): void {
    this.tone(880, 880, 0.18, 0.04, 'sine');
    this.tone(1320, 1320, 0.25, 0.035, 'sine', 0.12);
  }

  bump(hard: boolean): void {
    this.burst(hard ? 0.7 : 0.3, hard ? 0.35 : 0.12, 'lowpass', hard ? 180 : 260, 0.8, 0, true);
    this.tone(hard ? 70 : 110, 40, hard ? 0.5 : 0.25, hard ? 0.2 : 0.07, 'sine');
  }

  /** compressed air into the tanks */
  blow(long: boolean): void {
    this.burst(long ? 3.2 : 1.4, long ? 0.22 : 0.1, 'bandpass', 1400, 0.7);
    this.burst(long ? 2.6 : 1.1, long ? 0.15 : 0.06, 'lowpass', 400, 0.7, 0.1, true);
  }

  /** the vent valves opening (diving) */
  vent(): void {
    this.burst(1.2, 0.08, 'bandpass', 700, 0.8);
  }

  clunk(): void {
    this.tone(140, 60, 0.35, 0.18, 'triangle');
    this.burst(0.4, 0.12, 'lowpass', 300, 1, 0, true);
  }

  camera(): void {
    this.burst(0.05, 0.12, 'highpass', 3000, 0.7);
    this.tone(2200, 2200, 0.05, 0.02, 'square', 0.06);
  }
}
