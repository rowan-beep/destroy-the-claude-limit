// Auto-Fly: a "self-flying" autopilot. Pick a destination (any airfield or
// the bullseye, or just hold the current heading), a speed and an altitude;
// the jet flies there on its own, holds speed with the throttle, climbs
// over terrain in its path, and circles overhead on arrival. Any stick
// input hands control straight back to the pilot.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Steerpoint } from '../avionics/nav';
import { steerToward, holdSpeed } from '../ai/steering';
import { terrainHeight } from '../world/terrain';
import { FT, KT, NM, DEG } from '../core/constants';
import { clamp } from '../core/math';

export const AUTOFLY_SPEEDS = [300, 350, 420, 480, 550, 650];
export const AUTOFLY_ALTS = [2000, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000];

const ORBIT_MIN = 3 * NM;
const _dir = new THREE.Vector3();
const _rad = new THREE.Vector3();

export class AutoFly {
  engaged = false;
  /** null = hold the heading it was engaged on */
  dest: Steerpoint | null = null;
  speedKts = 420;
  altFt = 20000;
  arrived = false;
  private holdDir = new THREE.Vector3(0, 0, -1);

  engage(p: Aircraft, dest: Steerpoint | null, speedKts: number, altFt: number): void {
    this.dest = dest;
    this.speedKts = speedKts;
    this.altFt = altFt;
    this.arrived = false;
    this.holdDir.set(p.fm.fwd.x, 0, p.fm.fwd.z);
    if (this.holdDir.lengthSq() < 1e-6) this.holdDir.set(0, 0, -1);
    this.holdDir.normalize();
    this.engaged = true;
  }

  disengage(): void {
    this.engaged = false;
  }

  /** Distance (NM) to go, or null when holding a heading. */
  distanceNm(p: Aircraft): number | null {
    if (!this.dest) return null;
    return Math.hypot(this.dest.x - p.fm.pos.x, this.dest.z - p.fm.pos.z) / NM;
  }

  /** Short status for the HUD. */
  label(p: Aircraft): string {
    const where = this.dest ? `${this.dest.short || this.dest.name}${this.arrived ? ' ORBIT' : ` ${Math.round(this.distanceNm(p) ?? 0)} NM`}` : 'HDG HOLD';
    return `AUTO-FLY → ${where} · ${this.speedKts} KT · ${Math.round(this.altFt / 1000)}K FT`;
  }

  /** Fly the aircraft for one physics step. */
  control(p: Aircraft, dt: number): void {
    const fm = p.fm;
    // horizontal course
    // orbit radius a 35-degree bank turn can hold at this speed
    const ORBIT_R = Math.max(ORBIT_MIN, (fm.tas * fm.tas) / (9.81 * Math.tan(35 * DEG)));
    if (this.dest) {
      _rad.set(fm.pos.x - this.dest.x, 0, fm.pos.z - this.dest.z);
      const d = _rad.length();
      if (d < ORBIT_R * 1.3) this.arrived = true;
      if (this.arrived && d > ORBIT_R * 2.5) this.arrived = false;
      if (this.arrived) {
        // clockwise orbit: fly the tangent, corrected toward the circle
        _rad.divideScalar(Math.max(d, 1));
        _dir.set(-_rad.z, 0, _rad.x).addScaledVector(_rad, -clamp((d - ORBIT_R) / ORBIT_R, -1, 1) * 0.8);
      } else _dir.copy(_rad).multiplyScalar(-1);
    } else _dir.copy(this.holdDir);
    _dir.normalize();
    // altitude: the chosen one, but always clear the terrain ahead
    let ground = 0;
    const look = Math.max(4000, fm.tas * 50);
    for (let k = 0; k <= 8; k++) {
      const s = (k / 8) * look;
      ground = Math.max(ground, terrainHeight(fm.pos.x + _dir.x * s, fm.pos.z + _dir.z * s));
    }
    const altT = Math.max(this.altFt * FT, ground + 750);
    const climb = clamp((altT - fm.pos.y) / 2500, -1, 1) * 14 * DEG;
    _dir.y = Math.tan(climb);
    _dir.normalize();
    steerToward(p, _dir, { gCap: 3, tau: 1.6, maxBank: 45 });
    holdSpeed(p, this.speedKts * KT, true, dt);
    p.controls.gearDown = false;
  }
}
