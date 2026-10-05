// Menu music for both games: "High Up", looping, heard only while a main menu
// (Air Combat or Space Exploration) is on screen. It is decoded once and played
// through Web Audio so the loop never has a gap: each pass starts a few seconds
// before the last one ends and the two crossfade. Coming into a menu it fades
// up gently; starting a mission or a flight fades it away, and it picks up again
// where it left off next time. Browsers only allow sound after the player has
// clicked or pressed a key, so the first gesture starts it. The on/off choice
// is remembered.

import highUp from '../assets/music/high-up.mp3';
import { audio } from './audio';

const KEY = 'triad.space.music';
const VOLUME = 0.5;
/** seconds of crossfade where the track loops back to its start */
const XFADE = 4;
/** time constants of the fades (s): in slowly, out a little quicker */
const FADE_IN = 1.1;
const FADE_OUT = 0.6;

class MenuMusic {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buf: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;
  /** the passes now sounding, each with its own crossfade gain */
  private voices: { src: AudioBufferSourceNode; g: GainNode; start: number }[] = [];
  private nextAt = 0;
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
      if (this.wanted) this.apply();
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

  private load(): Promise<void> {
    if (!this.loading) {
      this.loading = fetch(highUp)
        .then((r) => r.arrayBuffer())
        .then((data) => this.ctx!.decodeAudioData(data))
        .then((b) => {
          this.buf = b;
        })
        .catch(() => {
          this.loading = null;
        });
    }
    return this.loading;
  }

  private apply(): void {
    if (!this.wanted) {
      this.fadeOut();
      return;
    }
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.out = this.ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(this.ctx.destination);
    }
    const ctx = this.ctx;
    window.clearTimeout(this.stopTimer);
    void Promise.all([ctx.state === 'suspended' ? ctx.resume().catch(() => undefined) : null, this.load()]).then(() => {
      if (!this.wanted || !this.buf || ctx.state !== 'running') return;
      if (!this.voices.length) {
        this.nextAt = ctx.currentTime + 0.05;
        this.schedule();
      }
      const g = this.out!.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.setTargetAtTime(VOLUME * audio.levels.master, ctx.currentTime, FADE_IN);
      window.clearInterval(this.timer);
      this.timer = window.setInterval(() => this.schedule(), 500);
    });
  }

  /** keep the next pass queued: it starts XFADE seconds before the current one ends */
  private schedule(): void {
    const ctx = this.ctx, buf = this.buf;
    if (!ctx || !buf || !this.out) return;
    while (this.nextAt < ctx.currentTime + 2) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const t0 = this.nextAt;
      const first = !this.voices.length;
      // crossfade in (except the very first pass, which the master fade brings up)
      g.gain.setValueAtTime(first ? 1 : 0, t0);
      if (!first) g.gain.linearRampToValueAtTime(1, t0 + XFADE);
      // and out over the last XFADE seconds, under the next pass
      g.gain.setValueAtTime(1, t0 + buf.duration - XFADE);
      g.gain.linearRampToValueAtTime(0, t0 + buf.duration);
      src.connect(g).connect(this.out);
      src.start(t0);
      src.stop(t0 + buf.duration + 0.05);
      const v = { src, g, start: t0 };
      src.onended = () => {
        this.voices = this.voices.filter((x) => x !== v);
      };
      this.voices.push(v);
      this.nextAt = t0 + buf.duration - XFADE;
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
    // once silent, pause the whole context: nothing plays outside the menus
    this.stopTimer = window.setTimeout(() => {
      if (!this.wanted && ctx.state === 'running') ctx.suspend().catch(() => undefined);
    }, FADE_OUT * 6000);
  }
}

export const menuMusic = new MenuMusic();
