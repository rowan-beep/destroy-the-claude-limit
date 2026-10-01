// Human G tolerance. The thresholds are exactly those of the design brief:
//
//   +4.0 .. +7.9 G   grey-out: colour drains linearly, periphery blurs
//   +8.0 .. +10.4 G  monochrome tunnel vision
//   >= +10.5 G       G-LOC: pitch black for exactly 10 s, controls frozen
//                    (the view drains, closes to a pinhole and goes dark;
//                    then only the heartbeat, at 55 bpm, until you come round)
//   >= +9.0 G        the whole view is a full blur
//   G limiter on     G-LOC cannot happen: the grey-out stays, and a hard,
//                    sustained pull blurs the view now and then
//   -2.0 .. -4.9 G   partial red-out: 50 % crimson wash
//   <= -5.0 G        full red-out: 100 % solid red
//
// The G value used is lightly filtered (blood takes a moment to move), so
// a single-frame spike from turbulence or a hard landing does not trigger
// effects, while a sustained pull does.

import { VisionState, emptyVision } from '../render/vision';
import { clamp01 } from '../core/math';

export const GLOC_THRESHOLD = 10.5;
export const GLOC_DURATION = 10;
/** the view closing down before the lights go out (s) */
const GLOC_ENTRY = 0.9;
/** coming round: black, then a blurred pinhole opening out (s) */
const WAKE = 2.6;
/** resting heart rate while unconscious */
const HEART_BPM = 55;
/** the second beat ("dub") after the first ("lub") (s) */
const DUB = 0.3;

const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export class PilotPhysiology {
  gSmooth = 1;
  glocTimer = 0;
  wakeFade = 0;
  readonly vision: VisionState = emptyVision();
  /** true for the frame the pilot passes out */
  justBlackedOut = false;
  glocCount = 0;
  strain = 0;
  /** the FBW G limiter is on (G-LOC impossible): blur instead */
  limiter = false;
  /** heartbeats so far (each lub and dub), for the sound */
  beatCount = 0;
  lastBeatStrong = false;
  private blurT = 0;
  private blurNext = 3;

  reset(): void {
    this.gSmooth = 1;
    this.glocTimer = 0;
    this.wakeFade = 0;
    this.blurT = 0;
    this.blurNext = 3;
    Object.assign(this.vision, emptyVision());
  }

  get unconscious(): boolean {
    return this.glocTimer > 0;
  }

  update(dt: number, nz: number): void {
    this.justBlackedOut = false;
    // blood shifts in ~0.3 s, returns a little slower
    const tau = Math.abs(nz) > Math.abs(this.gSmooth) ? 0.3 : 0.55;
    this.gSmooth += (nz - this.gSmooth) * (1 - Math.exp(-dt / tau));
    const g = this.gSmooth;
    this.strain = clamp01((g - 5) / 5);
    const v = this.vision;

    if (this.glocTimer > 0) {
      const prev = GLOC_DURATION - this.glocTimer;
      this.glocTimer -= dt;
      const t = GLOC_DURATION - this.glocTimer;
      // the colour goes, the view closes to a pinhole, blurs, then black
      const k = clamp01(t / GLOC_ENTRY);
      v.greyout = 1;
      v.mono = 1;
      v.tunnel = 1;
      v.redout = 0;
      v.pinhole = smooth(k);
      v.blur = smooth(k * 1.4);
      v.blackout = smooth((k - 0.45) / 0.55);
      // then only the heart, slow and heavy
      const beat = 60 / HEART_BPM;
      const hb = (x: number) => {
        if (x < 0) return 0;
        const ph = x % beat;
        return Math.exp(-((ph / 0.075) ** 2)) + 0.65 * Math.exp(-(((ph - DUB) / 0.075) ** 2)) + (ph > beat - 0.15 ? Math.exp(-(((ph - beat) / 0.075) ** 2)) : 0);
      };
      const hx = t - GLOC_ENTRY - 0.4;
      v.heart = hb(hx) * smooth(hx / 1.2);
      // the beats themselves, for the sound
      const px = prev - GLOC_ENTRY - 0.4;
      if (hx >= 0) {
        const cross = (offset: number) => Math.floor((hx - offset) / beat) !== Math.floor((px - offset) / beat) && hx - offset >= 0;
        if (cross(0)) {
          this.beatCount++;
          this.lastBeatStrong = true;
        } else if (cross(DUB)) {
          this.beatCount++;
          this.lastBeatStrong = false;
        }
      }
      if (this.glocTimer <= 0) {
        this.glocTimer = 0;
        this.wakeFade = WAKE;
        v.heart = 0;
      }
      return;
    }
    if (g >= GLOC_THRESHOLD) {
      this.glocTimer = GLOC_DURATION;
      this.glocCount++;
      this.justBlackedOut = true;
      return;
    }

    // coming round after G-LOC: black, then the view opens out of a blur
    if (this.wakeFade > 0) {
      this.wakeFade = Math.max(0, this.wakeFade - dt);
    }
    const w = this.wakeFade / WAKE;
    v.blackout = smooth((w - 0.55) / 0.45);
    v.heart = 0;

    // positive G
    if (g >= 8.0) {
      v.greyout = 1;
      v.mono = 1;
      v.tunnel = 0.35 + 0.55 * clamp01((g - 8) / 2.4);
    } else if (g >= 4.0) {
      const t = clamp01((g - 4) / 3.9);
      v.greyout = t;
      v.mono = 0;
      v.tunnel = t * 0.3;
    } else {
      v.greyout = 0;
      v.mono = 0;
      v.tunnel = 0;
    }

    // waking: a blurred pinhole opening, colour coming back last
    v.pinhole = smooth((w - 0.1) / 0.6) * 0.9;
    v.blur = Math.max(0, smooth(w / 0.8));
    if (w > 0) {
      v.mono = Math.max(v.mono, smooth(w / 0.5));
      v.greyout = Math.max(v.greyout, smooth(w / 0.4));
    }

    // G limiter on: no G-LOC, but a hard sustained pull blurs the view in waves
    if (this.limiter && w === 0 && g >= 5.5) {
      const amp = 0.3 + 0.55 * clamp01((g - 5.5) / 3);
      if (this.blurT > 0) {
        this.blurT = Math.max(0, this.blurT - dt);
        v.blur = Math.sin((1 - this.blurT / 1.1) * Math.PI) * amp;
      } else {
        this.blurNext -= dt * (0.6 + 0.6 * clamp01((g - 5.5) / 3));
        if (this.blurNext <= 0) {
          this.blurT = 1.1;
          this.blurNext = 2.2 + Math.random() * 3.8;
        }
      }
    } else if (w === 0) {
      this.blurT = 0;
    }
    // 9 G and up: everything is a blur
    v.blur = Math.max(v.blur, smooth((g - 8.5) / 0.5));

    // negative G
    if (g <= -5.0) v.redout = 1;
    else if (g <= -2.0) v.redout = 0.5;
    else v.redout = 0;
  }
}
