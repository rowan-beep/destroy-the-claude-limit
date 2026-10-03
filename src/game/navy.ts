// The enemy carriers' close-in guns. Each RED carrier carries four Type 1130
// thirty-millimetre Gatlings on its sponsons (guns only, no missiles). They
// ride the ship and fire in every mode on the ocean map, free flight too.

import * as THREE from 'three';
import { CARRIERS } from '../world/carriers';
import { GroundUnit, AirDefense, DEFENSES } from './ground';
import type { Sim } from './sim';
import type { Difficulty } from '../ai/skill';

const CREW: Record<Difficulty, number> = { EASY: 0.2, MEDIUM: 0.45, HARD: 0.7, EXTREME: 0.92 };

/** Man the guns of every RED carrier on the active map. */
export function armCarriers(sim: Sim, difficulty: Difficulty): void {
  for (const c of CARRIERS) {
    c.mounts.length = 0;
    if (c.f.team !== 'red') continue;
    c.layout.guns.forEach(([u, v, y], i) => {
      const unit = new GroundUnit('ciws', new THREE.Vector3(), 0, false, `${c.spec.hull} CIWS ${i + 1}`);
      unit.mounted = true;
      const d = new AirDefense(DEFENSES.CIWS, unit, CREW[difficulty]);
      c.mounts.push({
        u,
        v,
        y,
        place: (x, wy, z, hdg) => {
          unit.pos.set(x, wy, z);
          unit.heading = hdg;
          d.ghost.fm.pos.set(x, wy + unit.def.h, z);
        },
      });
      sim.ground.push(unit);
      sim.defenses.push(d);
    });
    c.update(sim.time);
  }
}
