// Flares (IR decoys) and chaff (radar decoys). Both are simulated as
// objects in the world so seekers can actually be seduced by them.

import * as THREE from 'three';
import type { Sim } from '../game/sim';
import type { Aircraft } from '../aircraft/aircraft';
import { G0 } from '../core/constants';
import { rand } from '../core/rng';

export interface Decoy {
  id: number;
  kind: 'flare' | 'chaff';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  owner: Aircraft;
  /** relative intensity (IR for flares, RCS for chaff) */
  strength: number;
  /** seekers that already evaluated this decoy */
  judged: Set<number>;
}

let nextId = 1;

export class CountermeasureSystem {
  readonly decoys: Decoy[] = [];

  constructor(private sim: Sim) {}

  deploy(owner: Aircraft, kind: 'flare' | 'chaff'): Decoy {
    const fm = owner.fm;
    const pos = fm.pos.clone().addScaledVector(fm.up, -0.8).addScaledVector(fm.fwd, -3);
    const side = (Math.random() < 0.5 ? -1 : 1) * rand(6, 14);
    const ej = new THREE.Vector3()
      .addScaledVector(fm.up, -rand(18, 28))
      .addScaledVector(fm.right, side)
      .addScaledVector(fm.fwd, -rand(5, 15));
    const vel = fm.vel.clone().add(ej);
    const d: Decoy = {
      id: nextId++,
      kind,
      pos,
      vel,
      age: 0,
      life: kind === 'flare' ? rand(3.8, 5) : rand(5, 7),
      owner,
      strength: kind === 'flare' ? rand(0.9, 1.3) : rand(0.9, 1.4),
      judged: new Set(),
    };
    this.decoys.push(d);
    this.sim.events.emit('decoy', d);
    return d;
  }

  step(dt: number): void {
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.age += dt;
      if (d.age > d.life) {
        this.decoys.splice(i, 1);
        continue;
      }
      // heavy drag: decoys decelerate to the local air mass quickly
      const k = d.kind === 'flare' ? 1.1 : 3.5;
      d.vel.multiplyScalar(Math.exp(-k * dt));
      d.vel.y -= (d.kind === 'flare' ? G0 * 0.8 : G0 * 0.05) * dt;
      d.pos.addScaledVector(d.vel, dt);
      if (d.kind === 'flare') d.strength *= Math.exp(-0.25 * dt);
    }
  }

  clear(): void {
    this.decoys.length = 0;
  }
}
