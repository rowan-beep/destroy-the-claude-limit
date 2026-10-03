// Mode 1: Free Flight -- pure sandbox, no enemies.

import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton } from './mode';
import { AIRFIELD_BY_ID, airfieldsOf, fromRunwayLocal, activeMap } from '../../world/islands';
import { spawnOnRunway, spawnInAir } from '../spawn';
import { FT } from '../../core/constants';

export class FreeFlightMode extends GameMode {
  private deadTimer = 0;
  private landedAnnounced = false;

  start(): void {
    const h = this.host;
    const p = h.createPlayer();
    this.place();
    h.sim.add(p);
    h.picture.gciEnabled.blue = true;
    h.picture.gciEnabled.red = false;
    const f = this.base();
    if (p.spec.airLaunch) {
      h.order(
        'X-15 RESEARCH FLIGHT',
        `Dropped from the ${p.spec.airLaunch.carrier} at ${p.spec.airLaunch.altFt.toLocaleString('en-US')} ft. Throttle up to light the rocket, pull up to about 42 degrees (that is the 354,000 ft record profile; steeper goes higher) and hold it until the propellant runs out, about 80 seconds: you will coast up through the edge of space. For the Mach 6.7 speed run take the drop tanks, climb to 100,000 ft and level off. Above the air only the thrusters point the nose. Coming back down, hold 20-25 degrees angle of attack, then glide home to ${f.name} without power.`,
        16,
      );
      return;
    }
    h.order(
      'FREE FLIGHT',
      `${p.spec.name} at ${f.name}. The whole ${activeMap.sizeNm} x ${activeMap.sizeNm} NM theater of ${activeMap.name} is yours. Watch the afterburner fuel burn. Land on any BLUE runway and press [H] to rearm & refuel.`,
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
  }

  status(): ModeStatus {
    const p = this.host.player;
    const fuelMin = p && p.fm.fuelFlow > 0 ? p.fm.fuelTotal / p.fm.fuelFlow / 60 : 0;
    return {
      title: 'FREE FLIGHT',
      blue: 1,
      red: 0,
      timer: this.elapsed,
      objective: p ? `ALT ${Math.round(p.fm.pos.y / FT)} FT · FUEL ${Math.round(fuelMin)} MIN AT THIS POWER` : '',
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
    }
  }
}
