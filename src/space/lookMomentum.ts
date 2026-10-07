// The space cameras' look-around: a flick of the mouse keeps the view turning for a
// moment after you let go, slowing to a stop, so it feels like turning a camera in
// 3D rather than sliding a picture about. Grabbing again stops it dead.

export class LookMomentum {
  private vx = 0;
  private vy = 0;
  private t = 0;
  private held = false;

  /** a drag step: the yaw and pitch it turned by (radians) */
  move(dYaw: number, dPitch: number): void {
    const now = performance.now();
    const dt = Math.max(0.008, Math.min(0.1, (now - this.t) / 1000));
    this.t = now;
    // a running average of the last few steps' speed
    this.vx = this.vx * 0.5 + (dYaw / dt) * 0.5;
    this.vy = this.vy * 0.5 + (dPitch / dt) * 0.5;
    this.held = true;
  }

  /** grabbed: whatever spin there was stops */
  grab(): void {
    this.vx = this.vy = 0;
    this.t = performance.now();
    this.held = true;
  }

  /** let go: keep turning only if the mouse was still moving */
  release(): void {
    this.held = false;
    if (performance.now() - this.t > 70) this.vx = this.vy = 0;
    // (not too wild: at most a couple of turns a second)
    const cap = 6;
    this.vx = Math.max(-cap, Math.min(cap, this.vx));
    this.vy = Math.max(-cap, Math.min(cap, this.vy));
  }

  /** each frame: how much further to turn [yaw, pitch] */
  step(dt: number): [number, number] {
    if (this.held || (!this.vx && !this.vy)) return [0, 0];
    const out: [number, number] = [this.vx * dt, this.vy * dt];
    const k = Math.exp(-dt * 4);
    this.vx *= k;
    this.vy *= k;
    if (Math.abs(this.vx) < 0.01 && Math.abs(this.vy) < 0.01) this.vx = this.vy = 0;
    return out;
  }
}
