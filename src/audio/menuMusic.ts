// Music for both games: "High Up", looping, heard while a main menu (Air
// Combat or Space Exploration) is on screen and while flying the Saturn V. It plays through the game's
// own audio context (the one the engines and clicks already use), decoded
// once straight from the page so no network request is needed, and loops
// without a gap: each pass starts a few seconds before the last one ends and
// the two crossfade. Coming into a menu it fades up gently; a mission or a
// flight fades it away, and next time it picks up where it left off. Browsers
// only allow sound after a click or key press, so the first gesture starts it.
// The on/off choice is remembered.

import highUp from '../assets/music/high-up.mp3';
import { audio } from './audio';

const KEY = 'triad.space.music';
const VOLUME = 0.5;
/** seconds of crossfade where the track loops back to its start */
const XFADE = 4;
/** time constants of the fades (s): in slowly, out a little quicker */
const FADE_IN = 1.1;
const FADE_OUT = 0.6;

interface Voice {
  src: AudioBufferSourceNode;
  g: GainNode;
  /** context time the track's position 0 lines up with */
  t0: number;
}

class MenuMusic {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buf: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;
  private voices: Voice[] = [];
  private nextAt = 0;
  /** where in the track to carry on from */
  private pos = 0;
  private timer = 0;
  private stopTimer = 0;
  private showing = new Set<string>();
  enabled = (() => {
    try {
      return localStorage.getItem(KEY) !== '0';
    } catch {
      return true;
    }
  })();

  constructor() {
    const kick = () => {
      if (this.wanted && !this.voices.length) this.apply();
    };
    window.addEventListener('pointerdown', kick, { capture: true });
    window.addEventListener('keydown', kick, { capture: true });
  }

  private get wanted(): boolean {
    return this.showing.size > 0 && this.enabled;
  }

  /** a menu came on or went off screen; the music plays while any of them shows */
  want(menu: string, on: boolean): void {
    const was = this.wanted;
    if (on) this.showing.add(menu);
    else this.showing.delete(menu);
    if (was !== this.wanted) this.apply();
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(KEY, this.enabled ? '1' : '0');
    } catch {
      /* remembered for this session only */
    }
    this.apply();
    return this.enabled;
  }

  /** the track's bytes: decoded straight from the page when it is embedded */
  private async bytes(): Promise<ArrayBuffer> {
    if (highUp.startsWith('data:')) {
      const bin = atob(highUp.slice(highUp.indexOf(',') + 1));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out.buffer;
    }
    return (await fetch(highUp)).arrayBuffer();
  }

  private load(ctx: AudioContext): Promise<void> {
    if (!this.loading) {
      this.loading = this.bytes()
        .then((data) => ctx.decodeAudioData(data))
        .then((b) => {
          this.buf = b;
        })
        .catch(() => {
          this.useElement = true;
        });
    }
    return this.loading;
  }

  private apply(): void {
    if (this.useElement) return this.applyElement();
    if (!this.wanted) return this.fadeOut();
    // the game's context: created (or woken) by this gesture if need be
    audio.init();
    const ctx = audio.ctx as AudioContext | null;
    if (!ctx || typeof ctx.resume !== 'function') return;
    if (this.ctx !== ctx) {
      this.ctx = ctx;
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(ctx.destination);
    }
    window.clearTimeout(this.stopTimer);
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    void this.load(ctx).then(() => {
      if (this.useElement) return this.applyElement();
      if (!this.wanted || !this.buf) return;
      if (!this.voices.length) {
        this.nextAt = ctx.currentTime + 0.05;
        this.schedule(true);
      }
      const g = this.out!.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.setTargetAtTime(VOLUME * audio.levels.master, ctx.currentTime, FADE_IN);
      window.clearInterval(this.timer);
      this.timer = window.setInterval(() => this.schedule(false), 500);
    });
  }

  /** keep the next pass queued: it starts XFADE seconds before the current one ends */
  private schedule(resume: boolean): void {
    const ctx = this.ctx, buf = this.buf;
    if (!ctx || !buf || !this.out) return;
    while (this.nextAt < ctx.currentTime + 2) {
      const offset = resume ? this.pos : 0;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const start = this.nextAt;
      const t0 = start - offset;
      const end = t0 + buf.duration;
      // crossfade in (a pass picking up mid-track comes in under the master fade)
      g.gain.setValueAtTime(resume ? 1 : 0, start);
      if (!resume) g.gain.linearRampToValueAtTime(1, start + XFADE);
      // and out over the last XFADE seconds, under the next pass
      g.gain.setValueAtTime(1, Math.max(start, end - XFADE));
      g.gain.linearRampToValueAtTime(0, end);
      src.connect(g).connect(this.out);
      src.start(start, offset);
      src.stop(end + 0.05);
      const v: Voice = { src, g, t0 };
      src.onended = () => {
        this.voices = this.voices.filter((x) => x !== v);
      };
      this.voices.push(v);
      this.nextAt = end - XFADE;
      resume = false;
    }
  }

  private fadeOut(): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const g = this.out.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.setTargetAtTime(0, ctx.currentTime, FADE_OUT);
    window.clearInterval(this.timer);
    window.clearTimeout(this.stopTimer);
    // once silent, stop the track and remember where it was: nothing plays outside the menus
    this.stopTimer = window.setTimeout(() => {
      if (this.wanted || !this.buf) return;
      const last = this.voices[this.voices.length - 1];
      if (last) this.pos = Math.max(0, Math.min(this.buf.duration - XFADE - 1, ctx.currentTime - last.t0));
      for (const v of this.voices) {
        try {
          v.src.onended = null;
          v.src.stop();
        } catch {
          /* already stopped */
        }
        v.g.disconnect();
      }
      this.voices = [];
    }, FADE_OUT * 6000);
  }

  // ---- fallback: a plain <audio> element, faded by hand
  private useElement = false;
  private el: HTMLAudioElement | null = null;
  private elFade = 0;
  private elTimer = 0;
  private applyElement(): void {
    const play = this.wanted;
    if (!this.el) {
      this.el = new Audio(highUp);
      this.el.loop = true;
      this.el.volume = 0;
    }
    const a = this.el;
    if (play && a.paused) a.play().catch(() => undefined);
    window.clearInterval(this.elTimer);
    this.elTimer = window.setInterval(() => {
      this.elFade = Math.max(0, Math.min(1, this.elFade + (play ? 0.03 : -0.05)));
      a.volume = this.elFade * VOLUME * audio.levels.master;
      if (!play && this.elFade <= 0) {
        a.pause();
        window.clearInterval(this.elTimer);
      } else if (play && this.elFade >= 1) window.clearInterval(this.elTimer);
    }, 50);
  }
}

export const menuMusic = new MenuMusic();
