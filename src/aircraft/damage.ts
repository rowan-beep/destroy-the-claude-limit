// Component damage model. Hits are resolved to the part of the airframe
// they strike; each component degrades the flight model differently.

import * as THREE from 'three';
import { FlightModel } from './flightModel';
import { clamp01 } from '../core/math';

export type Component = 'fuselage' | 'cockpit' | 'wingL' | 'wingR' | 'engineL' | 'engineR' | 'tail' | 'fuel';

export const COMPONENT_HP: Record<Component, number> = {
  fuselage: 110,
  cockpit: 45,
  wingL: 70,
  wingR: 70,
  engineL: 55,
  engineR: 55,
  tail: 55,
  fuel: 50,
};

export const COMPONENT_LABEL: Record<Component, string> = {
  fuselage: 'FUSELAGE',
  cockpit: 'COCKPIT',
  wingL: 'L WING',
  wingR: 'R WING',
  engineL: 'L ENGINE',
  engineR: 'R ENGINE',
  tail: 'EMPENNAGE',
  fuel: 'FUEL SYS',
};

export class DamageModel {
  readonly hp: Record<Component, number>;
  fire = 0; // seconds of fire remaining (0 = none)
  fireComponent: Component | null = null;
  leak = 0; // kg/s fuel leak
  destroyed = false;
  destroyCause = '';
  pilotKilled = false;
  wingLost: 'L' | 'R' | null = null;
  hydraulics = 1;
  totalTaken = 0;

  constructor() {
    this.hp = { ...COMPONENT_HP };
  }

  reset(): void {
    Object.assign(this.hp, COMPONENT_HP);
    this.fire = 0;
    this.fireComponent = null;
    this.leak = 0;
    this.destroyed = false;
    this.destroyCause = '';
    this.pilotKilled = false;
    this.wingLost = null;
    this.hydraulics = 1;
    this.totalTaken = 0;
  }

  frac(c: Component): number {
    return clamp01(this.hp[c] / COMPONENT_HP[c]);
  }

  /** Overall integrity 0..1 for the HUD. */
  get integrity(): number {
    let s = 0, m = 0;
    for (const k of Object.keys(COMPONENT_HP) as Component[]) {
      s += Math.max(0, this.hp[k]);
      m += COMPONENT_HP[k];
    }
    return s / m;
  }

  /** Map a body-frame impact point to a component. */
  static componentAt(local: THREE.Vector3, span: number, length: number): Component {
    const halfSpan = span / 2;
    const x = local.x, z = local.z;
    if (Math.abs(x) > halfSpan * 0.28) return x < 0 ? 'wingL' : 'wingR';
    if (z < -length * 0.3) return 'cockpit';
    if (z > length * 0.33) return 'tail';
    if (z > length * 0.12) return x < 0 ? 'engineL' : 'engineR';
    if (Math.abs(x) < 0.8 && local.y > 0) return 'fuel';
    return 'fuselage';
  }

  apply(c: Component, amount: number): void {
    if (this.destroyed) return;
    this.hp[c] -= amount;
    this.totalTaken += amount;
    // secondary effects
    if ((c === 'engineL' || c === 'engineR' || c === 'fuel') && Math.random() < amount / 45) {
      this.fire = Math.max(this.fire, 6 + Math.random() * 14);
      this.fireComponent = c;
    }
    if ((c === 'fuel' || c === 'wingL' || c === 'wingR') && Math.random() < amount / 30) {
      this.leak = Math.min(8, this.leak + 0.6 + Math.random() * 2);
    }
    if (c === 'fuselage' || c === 'tail') this.hydraulics = Math.max(0.3, this.hydraulics - amount / 160);
    this.evaluate();
  }

  /** Blast damage spread over the components nearest the burst. */
  applyBlast(localBurst: THREE.Vector3, amount: number, span: number, length: number): void {
    const main = DamageModel.componentAt(localBurst, span, length);
    this.apply(main, amount * 0.6);
    this.apply('fuselage', amount * 0.25);
    const side: Component = localBurst.x < 0 ? 'wingL' : 'wingR';
    this.apply(side, amount * 0.2);
    const eng: Component = localBurst.x < 0 ? 'engineL' : 'engineR';
    if (localBurst.z > 0) this.apply(eng, amount * 0.3);
  }

  private evaluate(): void {
    if (this.hp.cockpit <= 0) {
      this.pilotKilled = true;
      this.destroyed = true;
      this.destroyCause = 'PILOT KILLED';
    } else if (this.hp.fuselage <= 0) {
      this.destroyed = true;
      this.destroyCause = 'AIRFRAME DESTROYED';
    } else if (this.hp.wingL <= 0 || this.hp.wingR <= 0) {
      this.wingLost = this.hp.wingL <= 0 ? 'L' : 'R';
      this.destroyed = true;
      this.destroyCause = 'WING SEPARATED';
    } else if (this.hp.tail <= 0 && this.hp.fuselage < 40) {
      this.destroyed = true;
      this.destroyCause = 'LOSS OF CONTROL';
    } else if (this.hp.fuel <= -20) {
      this.destroyed = true;
      this.destroyCause = 'FUEL EXPLOSION';
    }
  }

  /** Per-step effects: fire burns, leaks drain fuel, and the FM degrades. */
  update(dt: number, fm: FlightModel): void {
    if (this.fire > 0) {
      this.fire -= dt;
      const c = this.fireComponent ?? 'fuselage';
      this.hp[c] -= dt * 3.2;
      this.hp.fuselage -= dt * 1.2;
      if (this.fire <= 0) this.fireComponent = null;
      this.evaluate();
    }
    if (this.leak > 0) {
      fm.fuelInternal = Math.max(0, fm.fuelInternal - this.leak * dt);
    }
    // flight model degradation
    const eL = this.frac('engineL');
    const eR = this.frac('engineR');
    fm.damage.thrust[0] = eL <= 0 ? 0 : 0.35 + 0.65 * eL;
    if (fm.damage.thrust.length > 1) fm.damage.thrust[1] = eR <= 0 ? 0 : 0.35 + 0.65 * eR;
    if (eL <= 0) fm.engineOut[0] = true;
    if (eR <= 0 && fm.engineOut.length > 1) fm.engineOut[1] = true;
    const wl = this.frac('wingL'), wr = this.frac('wingR');
    fm.damage.lift = 0.55 + 0.45 * Math.min(wl, wr);
    fm.damage.rollBias = (wl - wr) * 1.4; // rad/s toward the damaged wing
    fm.damage.control = Math.max(0.25, this.hydraulics * (0.5 + 0.5 * this.frac('tail')));
    fm.damage.drag = (1 - wl) * 0.01 + (1 - wr) * 0.01 + (1 - this.frac('fuselage')) * 0.008;
  }
}
