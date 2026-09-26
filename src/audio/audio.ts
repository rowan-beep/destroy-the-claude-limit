// Fully synthesised sound (WebAudio): no audio assets are shipped.

export interface AudioLevels {
  master: number;
  engine: number;
  effects: number;
  warnings: number;
  voice: boolean;
}

function noiseBuffer(ctx: AudioContext, seconds: number, kind: 'white' | 'pink' | 'brown'): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineBus!: GainNode;
  private fxBus!: GainNode;
  private warnBus!: GainNode;
  private white!: AudioBuffer;
  private pink!: AudioBuffer;
  private brown!: AudioBuffer;
  // continuous voices
  private rumble!: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };
  private whine!: { osc: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };
  private ab!: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };
  private wind!: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };
  private gun!: { osc: OscillatorNode; noise: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode };
  private tone!: { osc: OscillatorNode; lfo: OscillatorNode; lfoGain: GainNode; gain: GainNode };
  private rwrOsc!: { osc: OscillatorNode; gain: GainNode };
  private flyby!: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };
  private cockpitFilter!: BiquadFilterNode;
  levels: AudioLevels = { master: 0.8, engine: 0.8, effects: 0.9, warnings: 0.9, voice: true };
  private lastVoice = new Map<string, number>();
  private rwrPattern = 0;
  muted = false;

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
    this.white = noiseBuffer(ctx, 2, 'white');
    this.pink = noiseBuffer(ctx, 3, 'pink');
    this.brown = noiseBuffer(ctx, 3, 'brown');
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.cockpitFilter = ctx.createBiquadFilter();
    this.cockpitFilter.type = 'lowpass';
    this.cockpitFilter.frequency.value = 20000;
    this.cockpitFilter.connect(this.master);
    this.engineBus = ctx.createGain();
    this.engineBus.connect(this.cockpitFilter);
    this.fxBus = ctx.createGain();
    this.fxBus.connect(this.master);
    this.warnBus = ctx.createGain();
    this.warnBus.connect(this.master);

    const loopNoise = (buf: AudioBuffer, type: BiquadFilterType, freq: number, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.engineBus);
      src.start();
      return { src, filter, gain };
    };
    this.rumble = loopNoise(this.brown, 'lowpass', 300);
    this.ab = loopNoise(this.pink, 'lowpass', 900);
    this.wind = loopNoise(this.white, 'bandpass', 800, 0.5);
    this.flyby = loopNoise(this.pink, 'lowpass', 1200);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.Q.value = 4;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    osc.connect(wf);
    osc2.connect(wf);
    wf.connect(wg).connect(this.engineBus);
    osc.start();
    osc2.start();
    this.whine = { osc, osc2, filter: wf, gain: wg };

    // gun: buzz at the firing rate
    const gOsc = ctx.createOscillator();
    gOsc.type = 'square';
    gOsc.frequency.value = 100;
    const gNoise = ctx.createBufferSource();
    gNoise.buffer = this.white;
    gNoise.loop = true;
    const gF = ctx.createBiquadFilter();
    gF.type = 'lowpass';
    gF.frequency.value = 1400;
    const gG = ctx.createGain();
    gG.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 100;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(gG.gain);
    gOsc.connect(gF);
    gNoise.connect(gF);
    gF.connect(gG).connect(this.fxBus);
    gOsc.start();
    gNoise.start();
    lfo.start();
    this.gun = { osc: gOsc, noise: gNoise, filter: gF, gain: gG, lfo };

    // Sidewinder growl / lock tone
    const tOsc = ctx.createOscillator();
    tOsc.type = 'sine';
    const tLfo = ctx.createOscillator();
    tLfo.frequency.value = 18;
    const tLfoG = ctx.createGain();
    tLfoG.gain.value = 40;
    tLfo.connect(tLfoG).connect(tOsc.frequency);
    const tG = ctx.createGain();
    tG.gain.value = 0;
    tOsc.connect(tG).connect(this.warnBus);
    tOsc.start();
    tLfo.start();
    this.tone = { osc: tOsc, lfo: tLfo, lfoGain: tLfoG, gain: tG };

    const rOsc = ctx.createOscillator();
    rOsc.type = 'square';
    const rG = ctx.createGain();
    rG.gain.value = 0;
    const rF = ctx.createBiquadFilter();
    rF.type = 'lowpass';
    rF.frequency.value = 3000;
    rOsc.connect(rF).connect(rG).connect(this.warnBus);
    rOsc.start();
    this.rwrOsc = { osc: rOsc, gain: rG };
    this.applyLevels();
  }

  applyLevels(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.levels.master, t, 0.05);
    this.engineBus.gain.setTargetAtTime(this.levels.engine, t, 0.05);
    this.fxBus.gain.setTargetAtTime(this.levels.effects, t, 0.05);
    this.warnBus.gain.setTargetAtTime(this.levels.warnings, t, 0.05);
  }

  setPaused(p: boolean): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(p || this.muted ? 0 : this.levels.master, this.ctx.currentTime, 0.05);
  }

  /** Continuous engine / wind state for the player's jet. */
  updateFlight(s: {
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
    nearbyJet: number;
    stall: boolean;
  }): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = 0.08;
    const alive = s.alive ? 1 : 0;
    const ext = s.inCockpit ? 0.55 : 1;
    this.cockpitFilter.frequency.setTargetAtTime(s.inCockpit ? 2600 : 20000, t, 0.1);
    this.rumble.gain.gain.setTargetAtTime(alive * (0.15 + 0.5 * s.rpm) * ext, t, k);
    this.rumble.filter.frequency.setTargetAtTime(180 + 420 * s.rpm, t, k);
    this.whine.osc.frequency.setTargetAtTime(700 + 2600 * s.rpm, t, 0.2);
    this.whine.osc2.frequency.setTargetAtTime(1400 + 5200 * s.rpm, t, 0.2);
    this.whine.filter.frequency.setTargetAtTime(900 + 3000 * s.rpm, t, 0.2);
    this.whine.gain.gain.setTargetAtTime(alive * 0.035 * s.rpm * (s.inCockpit ? 1.3 : 0.7), t, k);
    this.ab.gain.gain.setTargetAtTime(alive * s.ab * 0.7 * ext, t, 0.12);
    this.ab.filter.frequency.setTargetAtTime(600 + s.ab * 900, t, 0.1);
    const w = Math.min(1, s.qbar / 60000);
    this.wind.gain.gain.setTargetAtTime(w * (s.inCockpit ? 0.35 : 0.22), t, 0.1);
    this.wind.filter.frequency.setTargetAtTime(400 + Math.min(4000, s.tas * 5), t, 0.1);
    this.flyby.gain.gain.setTargetAtTime(Math.min(0.8, s.nearbyJet), t, 0.1);
    // gun
    this.gun.lfo.frequency.setTargetAtTime(s.gunRpm / 60, t, 0.01);
    this.gun.osc.frequency.setTargetAtTime(s.gunRpm / 60, t, 0.01);
    this.gun.gain.gain.setTargetAtTime(s.gunFiring ? 0.55 : 0, t, 0.02);
    // sidewinder tone
    if (s.tone === 'lock') {
      this.tone.osc.frequency.setTargetAtTime(1150, t, 0.02);
      this.tone.lfoGain.gain.setTargetAtTime(8, t, 0.02);
      this.tone.gain.gain.setTargetAtTime(0.07, t, 0.02);
    } else if (s.tone === 'search') {
      this.tone.osc.frequency.setTargetAtTime(420, t, 0.02);
      this.tone.lfoGain.gain.setTargetAtTime(60, t, 0.02);
      this.tone.gain.gain.setTargetAtTime(0.045, t, 0.02);
    } else this.tone.gain.gain.setTargetAtTime(0, t, 0.02);
    // RWR pattern
    this.rwrPattern += 1 / 60;
    let on = false;
    let f = 1000;
    if (s.rwr === 'missile') {
      on = Math.floor(this.rwrPattern * 10) % 2 === 0;
      f = 1650;
    } else if (s.rwr === 'lock') {
      on = true;
      f = Math.floor(this.rwrPattern * 4) % 2 === 0 ? 1100 : 900;
    }
    if (s.stall && !on) {
      on = Math.floor(this.rwrPattern * 6) % 2 === 0;
      f = 520;
    }
    this.rwrOsc.osc.frequency.setTargetAtTime(f, t, 0.005);
    this.rwrOsc.gain.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.005);
  }

  private envNoise(buf: AudioBuffer, type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, delay = 0, bus?: GainNode): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus ?? this.fxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  beep(freq: number, dur: number, vol = 0.08, type: OscillatorType = 'sine', delay = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + dur - 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.warnBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  missileLaunch(own: boolean, distance: number): void {
    const v = own ? 0.9 : Math.max(0.02, 0.6 / (1 + distance / 300));
    const d = own ? 0 : Math.min(3, distance / 343);
    this.envNoise(this.pink, 'bandpass', 2500, 300, 1.8, v, d);
    this.envNoise(this.brown, 'lowpass', 400, 80, 2.2, v * 0.8, d);
  }

  explosion(distance: number, size = 1): void {
    const d = Math.min(4, distance / 343);
    const v = Math.min(1, (size * 1.5) / (1 + distance / 400));
    if (v < 0.01) return;
    const muffle = Math.max(150, 1200 - distance * 0.2);
    this.envNoise(this.brown, 'lowpass', muffle, 40, 2.5 + size, v, d);
    this.envNoise(this.white, 'lowpass', muffle * 2, 100, 0.6, v * 0.6, d);
  }

  hitThud(): void {
    this.envNoise(this.white, 'bandpass', 1800, 400, 0.12, 0.5);
    this.envNoise(this.brown, 'lowpass', 300, 60, 0.25, 0.6);
  }

  countermeasure(): void {
    this.envNoise(this.white, 'highpass', 3000, 1500, 0.08, 0.25);
  }

  mechanical(): void {
    this.envNoise(this.brown, 'lowpass', 700, 200, 1.2, 0.25);
  }

  click(): void {
    this.beep(1800, 0.03, 0.04, 'square');
  }

  rwrNewThreat(): void {
    this.beep(1300, 0.06, 0.06, 'square');
    this.beep(1300, 0.06, 0.06, 'square', 0.12);
  }

  masterCaution(): void {
    this.beep(880, 0.12, 0.08, 'square');
    this.beep(880, 0.12, 0.08, 'square', 0.2);
  }

  /** Voice warnings ("Bitching Betty") via speech synthesis where available. */
  voice(text: string, key = text, cooldown = 6): void {
    if (!this.levels.voice || this.muted) return;
    const now = performance.now() / 1000;
    const last = this.lastVoice.get(key) ?? -1e9;
    if (now - last < cooldown) return;
    this.lastVoice.set(key, now);
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.15;
      u.pitch = 1.05;
      u.volume = Math.min(1, this.levels.master * this.levels.warnings);
      const voices = synth.getVoices();
      const female = voices.find((vv) => /female|zira|samantha|victoria|karen|serena/i.test(vv.name) && /en/i.test(vv.lang));
      if (female) u.voice = female;
      synth.speak(u);
    } catch {
      /* speech unavailable */
    }
  }

  silenceContinuous(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const g of [this.rumble.gain, this.whine.gain, this.ab.gain, this.wind.gain, this.gun.gain, this.tone.gain, this.rwrOsc.gain, this.flyby.gain]) {
      g.gain.setTargetAtTime(0, t, 0.05);
    }
  }
}

export const audio = new AudioEngine();
