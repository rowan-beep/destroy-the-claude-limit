// Music for the Space Exploration menu: "High Up", looping, fading in when the
// menu opens and out when it closes or a flight starts. Browsers only allow
// sound after the player has clicked or pressed a key, so the first gesture
// starts it if the menu is already showing. The on/off choice is remembered.

import highUp from '../assets/music/high-up.mp3';
import { audio } from './audio';

const KEY = 'triad.space.music';
const VOLUME = 0.55;

class MenuMusic {
  private el: HTMLAudioElement | null = null;
  private wanted = false;
  private fade = 0;
  private timer = 0;
  enabled = (() => {
    try {
      return localStorage.getItem(KEY) !== '0';
    } catch {
      return true;
    }
  })();

  constructor() {
    const kick = () => {
      if (this.wanted && this.enabled && this.el?.paused !== false) this.apply();
    };
    window.addEventListener('pointerdown', kick, { capture: true });
    window.addEventListener('keydown', kick, { capture: true });
  }

  private audioEl(): HTMLAudioElement {
    if (!this.el) {
      this.el = new Audio(highUp);
      this.el.loop = true;
      this.el.preload = 'auto';
      this.el.volume = 0;
    }
    return this.el;
  }

  /** the menu is (or is not) on screen */
  want(on: boolean): void {
    this.wanted = on;
    this.apply();
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

  private apply(): void {
    const play = this.wanted && this.enabled;
    if (play) {
      const a = this.audioEl();
      if (a.paused) a.play().catch(() => {
        /* blocked until the first click; the gesture listener retries */
      });
    }
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      const a = this.el;
      if (!a) return window.clearInterval(this.timer);
      this.fade = Math.max(0, Math.min(1, this.fade + (play ? 0.04 : -0.06)));
      a.volume = Math.max(0, Math.min(1, this.fade * VOLUME * audio.levels.master));
      if (!play && this.fade <= 0) {
        a.pause();
        window.clearInterval(this.timer);
      } else if (play && this.fade >= 1) window.clearInterval(this.timer);
    }, 50);
  }
}

export const menuMusic = new MenuMusic();
