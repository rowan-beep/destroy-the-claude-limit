// The manipulator under the pilot's own hands. Like a real five-function arm
// on a small submersible it is flown by its jaw: the controls move the jaw
// ahead and back, left and right, up and down (in the boat's frame), and the
// joints follow. The jaw cannot go further than the arm reaches from its
// shoulder, behind the shoulder, or into the hull and skids. Pure (vectors in,
// vectors out), so the limits are tested on their own.

import * as THREE from 'three';

/** from the shoulder to the jaw at full stretch (upper arm, forearm and jaw, less a little) */
export const ARM_REACH = 2.1;
/** the jaw cannot fold closer to the shoulder than this */
export const ARM_MIN = 0.6;
/** how fast the jaw moves at full deflection (m/s) */
export const ARM_SPEED = 0.45;
/** where the jaw waits when the arm first comes out: ahead of and below the bow */
export const ARM_READY = new THREE.Vector3(0.45, -1.75, -3.3);
/** the hull and the skids, as the jaw must stay out of them: below this unless ahead of the dome */
const HULL_BOTTOM = -1.5;
const DOME_FRONT = -3.35;

/** can the arm put its jaw here? */
export function armCanReach(p: THREE.Vector3, shoulder: THREE.Vector3): boolean {
  if (p.y > shoulder.y + 0.3 || p.z > shoulder.z - 0.3) return false;
  if (p.z > DOME_FRONT && p.y > HULL_BOTTOM) return false;
  const d = p.distanceTo(shoulder);
  return d <= ARM_REACH && d >= ARM_MIN;
}

/** bring a jaw target back where the arm can put it (after the bottom has pushed it, say) */
export function clampArmTarget(p: THREE.Vector3, shoulder: THREE.Vector3): THREE.Vector3 {
  for (let k = 0; k < 8 && !armCanReach(p, shoulder); k++) {
    if (p.y > shoulder.y + 0.3) p.y = shoulder.y + 0.3;
    if (p.z > shoulder.z - 0.3) p.z = shoulder.z - 0.3;
    if (p.z > DOME_FRONT && p.y > HULL_BOTTOM) p.y = HULL_BOTTOM;
    const dx = p.x - shoulder.x, dy = p.y - shoulder.y, dz = p.z - shoulder.z;
    const d = Math.hypot(dx, dy, dz);
    // (a little inside the limit, so the planes and the sphere settle)
    const want = Math.max(ARM_MIN, Math.min(ARM_REACH - 1e-4 * k, d));
    if (d > 1e-6 && want !== d) p.set(shoulder.x + (dx * want) / d, shoulder.y + (dy * want) / d, shoulder.z + (dz * want) / d);
  }
  return p;
}

/**
 * Move the jaw with the controls (each -1..1: ahead, to starboard, up) for dt
 * seconds. Each direction moves on its own and only if the jaw stays where the
 * arm reaches, so at a limit it slides along it instead of sticking.
 */
export function moveArmTarget(p: THREE.Vector3, shoulder: THREE.Vector3, input: { reach: number; side: number; up: number }, dt: number): THREE.Vector3 {
  if (!armCanReach(p, shoulder)) clampArmTarget(p, shoulder);
  const step = ARM_SPEED * dt;
  const tryMove = (axis: 'x' | 'y' | 'z', v: number) => {
    if (!v) return;
    const old = p[axis];
    p[axis] = old + v * step;
    if (!armCanReach(p, shoulder)) p[axis] = old;
  };
  tryMove('z', -input.reach);
  tryMove('x', input.side);
  tryMove('y', input.up);
  return p;
}
