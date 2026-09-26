// Gun fire-control solution shared by the AI and the HUD gunsight: where to
// point the gun line so rounds (which inherit the shooter's velocity and
// then slow down and drop) meet the target.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import { G0, DEG } from '../core/constants';
import { atmosphere, AtmoState } from '../core/atmosphere';

const _atm: AtmoState = { T: 0, p: 0, rho: 0, a: 0, sigma: 0, delta: 0 };
const _rel = new THREE.Vector3();
const _relV = new THREE.Vector3();

export const GUN_HARMONIZATION = 2 * DEG;

/** World direction of the gun line (fuselage axis harmonised 2 deg up). */
export function gunLine(a: Aircraft, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(a.fm.fwd).addScaledVector(a.fm.up, Math.tan(GUN_HARMONIZATION)).normalize();
}

/** Mean round velocity over range r (m/s), accounting for drag at altitude. */
export function meanRoundSpeed(a: Aircraft, r: number): number {
  atmosphere(a.fm.pos.y, _atm);
  const k = (a.spec.gun.caliberMm > 25 ? 0.00031 : 0.00038) * (_atm.rho / 1.225);
  const v0 = a.spec.gun.muzzleVelocity;
  // v(x) = v0 * exp(-k x) for quadratic drag in distance; mean over [0, r]
  const kr = k * r;
  return kr < 1e-4 ? v0 : (v0 * (1 - Math.exp(-kr))) / kr;
}

/**
 * Lead-computing solution: world point the gun line must point at, and the
 * time of flight. Iterates twice for convergence.
 */
export function gunSolution(shooter: Aircraft, target: Aircraft, out: THREE.Vector3): { tof: number; range: number } {
  const sp = shooter.fm.pos;
  _relV.subVectors(target.fm.vel, shooter.fm.vel);
  let tof = 0;
  let range = target.fm.pos.distanceTo(sp);
  for (let i = 0; i < 3; i++) {
    _rel.subVectors(target.fm.pos, sp).addScaledVector(_relV, tof);
    range = _rel.length();
    tof = range / meanRoundSpeed(shooter, range);
  }
  _rel.subVectors(target.fm.pos, sp).addScaledVector(_relV, tof);
  // rounds fall under gravity: aim above by the drop
  _rel.y += 0.5 * G0 * tof * tof;
  out.copy(sp).add(_rel);
  return { tof, range };
}
