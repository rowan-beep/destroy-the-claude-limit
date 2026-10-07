// Mode 1: Free Flight -- pure sandbox, no enemies.

import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton } from './mode';
import { AIRFIELD_BY_ID, airfieldsOf, fromRunwayLocal, activeMap } from '../../world/islands';
import { spawnOnRunway, spawnInAir } from '../spawn';
import { FT, NM } from '../../core/constants';
import { Tanker } from '../tanker';
import { setMissionObjective } from '../../avionics/nav';

export class FreeFlightMode extends GameMode {
  private deadTimer = 0;
  private landedAnnounced = false;
  /** the KC-46 on its racetrack off the base */
  private tanker: Tanker | null = null;

  start(): void {
    const h = this.host;
    const p = h.createPlayer();
    this.place();
    h.sim.add(p);
    h.picture.gciEnabled.blue = true;
    h.picture.gciEnabled.red = false;
    const f = this.base();
    // a tanker on a racetrack 15 NM out along the runway heading
    const tc = fromRunwayLocal(f, 15 * NM, 0);
    this.tanker = new Tanker(new THREE.Vector3(tc.x, 0, tc.z), f.heading);
    h.scene?.add(this.tanker.model.group);
    if (p.spec.airLaunch) {
      h.order(
        'X-15 RESEARCH FLIGHT',
        `Dropped from the ${p.spec.airLaunch.carrier} at ${p.spec.airLaunch.altFt.toLocaleString('en-US')} ft. Throttle up to light the rocket (full power lasts about 10 minutes with the drop tanks, 5 without; they drop away when empty). Pull up to 40-45 degrees and climb through the edge of space: 354,000 ft is the record. For top speed, level off near 100,000 ft: it tops out around Mach 6.7. Above the air only the thrusters point the nose. Coming back down, hold 20-25 degrees angle of attack, then glide home to ${f.name} without power.`,
        16,
      );
      return;
    }
    h.order(
      'FREE FLIGHT',
      `${p.spec.name} at ${f.name}. The whole ${activeMap.sizeNm} x ${activeMap.sizeNm} NM theater of ${activeMap.name} is yours. Watch the afterburner fuel burn. Land on any BLUE runway and press [H] to rearm & refuel, or join the KC-46 tanker orbiting 15 NM out at 22,000 ft and take fuel in the air.`,
      12,
    );
  }

  private base() {
    const f = AIRFIELD_BY_ID[this.host.config.freeBase];
    return f && f.team === 'blue' ? f : airfieldsOf('blue')[0];
  }

  private place(): void {
    const h = this.host;
    const p = h.player!;
    const f = this.base();
    const air = p.spec.airLaunch;
    if (air) {
      // dropped from the mothership out on the extended centreline, pointing home, rocket off
      const s = fromRunwayLocal(f, -40000, 0);
      spawnInAir(p, new THREE.Vector3(s.x, air.altFt * FT, s.z), f.heading, air.kts);
      p.controls.throttle = 0;
      p.fm.throttleLever = 0;
      p.fm.rpm.fill(0);
      return;
    }
    if (h.config.freeStart === 'runway') {
      spawnOnRunway(p, f);
    } else {
      const s = fromRunwayLocal(f, -12000, 0);
      spawnInAir(p, new THREE.Vector3(s.x, f.elev + 3000, s.z), f.heading, 380);
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    const h = this.host;
    const p = h.player;
    if (!p) return;
    if (!p.alive) {
      this.deadTimer += dt;
      if (this.deadTimer > 3 && !this.over) {
        this.over = true;
        h.showResults({
          title: 'AIRCRAFT LOST',
          subtitle: p.fm.crashCause || p.damage.destroyCause || 'The jet did not survive.',
          good: false,
          stats: [
            ['FLIGHT TIME', `${Math.floor(this.elapsed / 60)} MIN`],
            ['FUEL REMAINING', `${Math.round(p.fm.fuelTotal / 0.4536)} LB`],
          ],
          buttons: [
            { label: 'RESPAWN', action: 'respawn' },
            { label: 'MAIN MENU', action: 'menu' },
          ],
        });
      }
      return;
    }
    // landing / rearm hints
    if (p.fm.onGround && p.fm.surfaceField && p.fm.gs < 30 && !this.landedAnnounced && this.elapsed > 20) {
      this.landedAnnounced = true;
      const f = p.fm.surfaceField;
      h.message(`WELCOME TO ${f.name}${f.team === 'blue' ? ' — STOP AND PRESS [H] TO REARM & REFUEL' : ' (ENEMY FIELD)'}`, f.team === 'blue' ? 'good' : 'warn', 8);
    }
    if (!p.fm.onGround && p.fm.agl > 300) this.landedAnnounced = false;
    // the tanker, and the arrow to it once the fuel runs low
    const tk = this.tanker;
    if (tk) {
      tk.update(dt, p, (t, k) => h.message(t, k ?? 'info', 6));
      const nm = p.fm.pos.distanceTo(tk.pos) / NM;
      const low = p.fm.fuelTotal < (p.spec.internalFuel + p.fm.fuelExternalCap) * 0.55;
      setMissionObjective(low && nm > 1.5 && tk.kind !== 'none' ? { name: 'TANKER', short: 'TKR', x: tk.pos.x, z: tk.pos.z, y: tk.pos.y, hint: 'KC-46 · TAKE FUEL' } : null);
    }
  }

  dispose(): void {
    this.tanker?.model.group.removeFromParent();
    this.tanker = null;
    setMissionObjective(null);
  }

  status(): ModeStatus {
    const p = this.host.player;
    const fuelMin = p && p.fm.fuelFlow > 0 ? p.fm.fuelTotal / p.fm.fuelFlow / 60 : 0;
    return {
      title: 'FREE FLIGHT',
      blue: 1,
      red: 0,
      timer: this.elapsed,
      objective: !p ? '' : this.tanker?.cue ? this.tanker.cue : `ALT ${Math.round(p.fm.pos.y / FT)} FT · FUEL ${Math.round(fuelMin)} MIN AT THIS POWER${this.tanker && this.tanker.kind !== 'none' ? ` · TANKER ${Math.round(p.fm.pos.distanceTo(this.tanker.pos) / NM)} NM` : ''}`,
    };
  }

  handle(action: ResultButton['action']): void {
    if (action === 'respawn' || action === 'retry') {
      const h = this.host;
      if (h.player) h.sim.remove(h.player);
      const p = h.createPlayer();
      this.place();
      h.sim.add(p);
      this.over = false;
      this.deadTimer = 0;
      // a fresh flight: the clock restarts and a runway respawn is not a landing
      this.elapsed = 0;
      this.landedAnnounced = false;
    }
  }
}
