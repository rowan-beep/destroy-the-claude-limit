// Spawning helpers and the vehicle allocation rules:
//  * only the three allowed aircraft exist;
//  * enemy NPCs are NEVER the player's own type -- they are drawn only from
//    the two aircraft the player did not choose (Waves and Duel alike).

import * as THREE from 'three';
import { Aircraft } from '../aircraft/aircraft';
import { AircraftType, enemyTypesFor, StoreType } from '../aircraft/specs';
import { AirfieldDef, fromRunwayLocal } from '../world/islands';
import { Team, KT, FT } from '../core/constants';
import { randPick } from '../core/rng';

export const BLUE_CALLSIGNS = ['VIPER', 'SABRE', 'COLT', 'DODGE', 'SPRINGFIELD', 'ENFIELD', 'UZI', 'PONTIAC'];
export const RED_CALLSIGNS = ['COBRA', 'VENOM', 'FANG', 'SPECTRE', 'RAVEN', 'KNIFE', 'WOLF', 'HYDRA', 'TALON', 'REAPER'];

let redCounter = 0;

export function nextRedCallsign(flight: number, member: number): string {
  return `${RED_CALLSIGNS[(flight + redCounter) % RED_CALLSIGNS.length]} ${flight + 1}-${member + 1}`;
}

export function resetCallsigns(): void {
  redCounter = Math.floor(Math.random() * RED_CALLSIGNS.length);
}

/** Choose an enemy type, never the player's. */
export function pickEnemyType(player: AircraftType): AircraftType {
  return randPick(enemyTypesFor(player));
}

/** Park an aircraft on a runway, lined up for takeoff. */
export function spawnOnRunway(ac: Aircraft, f: AirfieldDef, reverse = false): void {
  const along = reverse ? f.length / 2 - 120 : -f.length / 2 + 120;
  const p = fromRunwayLocal(f, along, 0);
  const hdg = reverse ? (f.heading + 180) % 360 : f.heading;
  ac.fm.setOnGround(new THREE.Vector3(p.x, f.elev, p.z), hdg);
  ac.controls.gearDown = true;
  ac.controls.throttle = 0;
}

/** Put an aircraft in the air at an altitude (ft) and speed (kt TAS). */
export function spawnInAir(ac: Aircraft, pos: THREE.Vector3, headingDeg: number, speedKts = 420): void {
  ac.fm.setAirborne(pos, headingDeg, speedKts * KT, 0);
  ac.controls.gearDown = false;
  ac.controls.throttle = 0.85;
}

export function altFt(ft: number): number {
  return ft * FT;
}

/** Restricted AI loadouts for waves / duel rules. */
export function aiStores(ac: Aircraft, aim120: number, aim9x: number): Record<number, StoreType> {
  const stores: Record<number, StoreType> = {};
  let n120 = aim120, n9 = aim9x;
  // wingtip / outboard rails first for Sidewinders, fuselage & inboard for AMRAAMs
  const byOut = [...ac.spec.stations].sort((a, b) => Math.abs(b.pos[0]) - Math.abs(a.pos[0]));
  for (const st of byOut) {
    if (n9 > 0 && st.allowed.includes(ac.irMissile)) {
      stores[st.id] = ac.irMissile;
      n9--;
    }
  }
  const byIn = [...ac.spec.stations].sort((a, b) => Math.abs(a.pos[0]) - Math.abs(b.pos[0]));
  for (const st of byIn) {
    if (stores[st.id]) continue;
    if (n120 > 0 && st.allowed.includes(ac.radarMissile)) {
      stores[st.id] = ac.radarMissile;
      n120--;
    }
  }
  return stores;
}

export function makeAircraft(type: AircraftType, team: Team, callsign: string, loadoutId?: string): Aircraft {
  return new Aircraft(type, team, callsign, loadoutId);
}
