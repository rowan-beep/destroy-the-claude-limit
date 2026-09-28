// Render interpolation. Physics runs at a fixed PHYSICS_HZ; on a faster
// display (144 / 165 / 240 Hz) some frames would get no new step and repeat
// the last position, which reads as judder. Around the render we show every
// jet and missile part-way between its last two physics states instead, then
// put the true state back before any game logic runs again.

import * as THREE from 'three';
import type { Sim } from './sim';

interface Body {
  pos: THREE.Vector3;
  quat?: THREE.Quaternion;
}

interface Slot {
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  truePos: THREE.Vector3;
  trueQuat: THREE.Quaternion;
}

export class RenderInterp {
  private slots = new WeakMap<object, Slot>();
  private applied: { b: Body; s: Slot }[] = [];

  private bodies(sim: Sim): Body[] {
    const out: Body[] = [];
    for (const a of sim.aircraft) out.push(a.fm);
    for (const m of sim.missiles) out.push(m as unknown as Body);
    return out;
  }

  private slot(b: Body): Slot {
    let s = this.slots.get(b);
    if (!s) {
      s = { prevPos: b.pos.clone(), prevQuat: b.quat?.clone() ?? new THREE.Quaternion(), truePos: new THREE.Vector3(), trueQuat: new THREE.Quaternion() };
      this.slots.set(b, s);
    }
    return s;
  }

  /** Call before each physics step. */
  beforeStep(sim: Sim): void {
    for (const b of this.bodies(sim)) {
      const s = this.slot(b);
      s.prevPos.copy(b.pos);
      if (b.quat) s.prevQuat.copy(b.quat);
    }
  }

  /** Show the in-between state (alpha 0..1 of the way from the last step to the next). */
  apply(sim: Sim, alpha: number): void {
    this.restore();
    const k = Math.min(1, Math.max(0, alpha || 0));
    for (const b of this.bodies(sim)) {
      const s = this.slots.get(b);
      if (!s) continue;
      // a teleport (respawn, rearm on the runway): no blending across it
      if (s.prevPos.distanceToSquared(b.pos) > 400 * 400) continue;
      s.truePos.copy(b.pos);
      b.pos.lerpVectors(s.prevPos, s.truePos, k);
      if (b.quat) {
        s.trueQuat.copy(b.quat);
        b.quat.slerpQuaternions(s.prevQuat, s.trueQuat, k);
      }
      this.applied.push({ b, s });
    }
  }

  /** Put the true physics state back. */
  restore(): void {
    for (const { b, s } of this.applied) {
      b.pos.copy(s.truePos);
      if (b.quat) b.quat.copy(s.trueQuat);
    }
    this.applied.length = 0;
  }
}
