// Human G tolerance. The thresholds are exactly those of the design brief:
//
//   +4.0 .. +7.9 G   grey-out: colour drains linearly, periphery blurs
//   +8.0 .. +10.4 G  monochrome tunnel vision
//   >= +10.5 G       G-LOC: pitch black for exactly 10 s, controls frozen
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

export class PilotPhysiology {
  gSmooth = 1;
  glocTimer = 0;
  wakeFade = 0;
  readonly vision: VisionState = emptyVision();
  /** true for the frame the pilot passes out */
  justBlackedOut = false;
  glocCount = 0;
  strain = 0;

  reset(): void {
    this.gSmooth = 1;
    this.glocTimer = 0;
    this.wakeFade = 0;
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
      this.glocTimer -= dt;
      v.blackout = 1;
      v.greyout = 1;
      v.mono = 1;
      v.tunnel = 1;
      v.redout = 0;
      if (this.glocTimer <= 0) {
        this.glocTimer = 0;
        this.wakeFade = 1.5;
      }
      return;
    }
    if (g >= GLOC_THRESHOLD) {
      this.glocTimer = GLOC_DURATION;
      this.glocCount++;
      this.justBlackedOut = true;
      v.blackout = 1;
      return;
    }

    // coming round after G-LOC: fade up from black
    if (this.wakeFade > 0) {
      this.wakeFade = Math.max(0, this.wakeFade - dt);
    }
    v.blackout = this.wakeFade / 1.5;

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

    // negative G
    if (g <= -5.0) v.redout = 1;
    else if (g <= -2.0) v.redout = 0.5;
    else v.redout = 0;
  }
}
