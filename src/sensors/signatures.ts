// Target signatures seen by sensors: infrared intensity (engines, aspect,
// afterburner) and radar cross-section (aspect dependent).

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import { smoothstep } from '../core/math';

const _d = new THREE.Vector3();

/** Relative IR intensity of `t` seen from `viewer` (1.0 = typical fighter at MIL, beam aspect). */
export function irIntensity(t: Aircraft, viewer: THREE.Vector3): number {
  const fm = t.fm;
  _d.subVectors(viewer, fm.pos).normalize();
  const tailCos = -fm.fwd.dot(_d); // +1 viewer directly behind the target
  const aspect = 0.42 + 0.9 * smoothstep(-0.35, 0.95, tailCos);
  let rpm = 0;
  for (const r of fm.rpm) rpm += r;
  rpm /= fm.rpm.length;
  const power = 0.4 + 0.6 * rpm + 1.2 * fm.afterburner;
  const friction = 1 + Math.min(0.6, (fm.mach * fm.mach) * 0.12); // aero heating of the skin
  const fire = t.damage.fire > 0 ? 1.6 : 1;
  const dead = t.alive ? 1 : 0.6;
  return t.spec.irSignature * aspect * power * friction * fire * dead;
}

/** Radar cross-section (m^2) of `t` seen from `viewer`. */
export function rcsFrom(t: Aircraft, viewer: THREE.Vector3): number {
  const fm = t.fm;
  _d.subVectors(viewer, fm.pos).normalize();
  const noseCos = Math.abs(fm.fwd.dot(_d));
  const sideFactor = 1 + 2.2 * (1 - noseCos); // beam aspect shows the whole side
  const topFactor = 1 + 1.5 * Math.abs(fm.up.dot(_d));
  let stores = 1 + t.storeCount() * 0.04;
  if (t.fm.gearPos > 0.5) stores *= 1.3;
  return t.spec.rcs * Math.max(sideFactor, topFactor) * stores;
}

/** Radial velocity (m/s) of the target along the line of sight from `viewer` (+ = moving away). */
export function radialVelocity(t: Aircraft, viewer: THREE.Vector3): number {
  _d.subVectors(t.fm.pos, viewer).normalize();
  return t.fm.vel.dot(_d);
}
