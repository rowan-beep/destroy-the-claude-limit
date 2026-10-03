// Each coalition's shared air picture: ground-controlled-intercept (GCI)
// radars at every airbase plus whatever the team's fighters see. Ground
// radars obey the same terrain masking and earth-curvature horizon as the
// fighters, so flying low behind Samos' dividing mountain keeps you off
// the enemy's scopes.

import * as THREE from 'three';
import type { Sim } from './sim';
import type { Aircraft } from '../aircraft/aircraft';
import { AIRFIELDS, fromRunwayLocal } from '../world/islands';
import { NM, Team } from '../core/constants';
import { RULES } from './rules';

export interface PictureTrack {
  target: Aircraft;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  time: number;
  source: 'gci' | 'radar' | 'irst' | 'visual';
}

export interface GciSite {
  team: Team;
  name: string;
  pos: THREE.Vector3;
  rangeNm: number;
  /** a carrier's radar sails with the ship */
  field?: (typeof AIRFIELDS)[number];
}

function buildSites(): GciSite[] {
  return AIRFIELDS.map((f) => {
  // a carrier: the radars on the island mast, about 40 m above the deck
  if (f.carrier) return { team: f.team, name: f.name + ' RADAR', pos: new THREE.Vector3(f.x, f.elev + 40, f.z), rangeNm: 190, field: f };
  const p = fromRunwayLocal(f, -300, 700);
  // the radar head sits on high ground / a mast above the field
  return { team: f.team, name: f.name + ' GCI', pos: new THREE.Vector3(p.x, f.elev + 260, p.z), rangeNm: 190 };
});
}

/** Ground radars at every airfield of the active map (the map is chosen before first use). */
export const GCI_SITES: GciSite[] = [];
export function refreshGciSites(): void {
  GCI_SITES.length = 0;
  GCI_SITES.push(...buildSites());
}
refreshGciSites();

export class TeamPicture {
  private tracks: Record<Team, Map<number, PictureTrack>> = { blue: new Map(), red: new Map() };
  private timer = 0;
  gciEnabled: Record<Team, boolean> = { blue: true, red: true };

  update(dt: number, sim: Sim): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.0;
    const now = sim.time;
    // carriers' radars move with their ships (the map and the TSD read the same positions)
    for (const site of GCI_SITES) if (site.field) site.pos.set(site.field.x, site.field.elev + 40, site.field.z);
    for (const team of ['blue', 'red'] as Team[]) {
      const map = this.tracks[team];
      // free-for-all: no shared picture between the AI jets (each flies on its own sensors)
      if (RULES.ffa && team === 'red') {
        map.clear();
        continue;
      }
      for (const [id, t] of map) if (now - t.time > 45 || !t.target.alive) map.delete(id);
      // GCI sweeps (ground radars refresh every ~5 s)
      if (this.gciEnabled[team] && Math.floor(now) % 5 === 0) {
        for (const site of GCI_SITES) {
          if (site.team !== team) continue;
          for (const a of sim.aircraft) {
            if (!a.alive || a.team === team) continue;
            const d = a.fm.pos.distanceTo(site.pos);
            if (d > site.rangeNm * NM) continue;
            // low fliers in clutter are hard for ground radar too
            if (a.fm.agl < 90 && d > 15 * NM) continue;
            if (!sim.lineOfSight(site.pos, a.fm.pos)) continue;
            this.record(team, a, 'gci', now);
          }
        }
      }
      // fighters' own sensors (datalink)
      for (const own of sim.aircraft) {
        if (!own.alive || own.team !== team) continue;
        for (const c of own.radar.contacts.values()) if (c.hostile && now - c.lastSeen < 3) this.record(team, c.target, 'radar', c.lastSeen);
        if (own.irst) for (const c of own.irst.contacts.values()) if (c.hostile && now - c.lastSeen < 3) this.record(team, c.target, 'irst', c.lastSeen);
      }
    }
  }

  record(team: Team, target: Aircraft, source: PictureTrack['source'], time: number): void {
    const map = this.tracks[team];
    let t = map.get(target.id);
    if (!t) {
      t = { target, pos: new THREE.Vector3(), vel: new THREE.Vector3(), time, source };
      map.set(target.id, t);
    }
    if (time >= t.time) {
      t.pos.copy(target.fm.pos);
      t.vel.copy(target.fm.vel);
      t.time = time;
      t.source = source;
    }
  }

  tracksFor(team: Team): PictureTrack[] {
    return [...this.tracks[team].values()];
  }

  get(team: Team, target: Aircraft): PictureTrack | undefined {
    return this.tracks[team].get(target.id);
  }

  clear(): void {
    this.tracks.blue.clear();
    this.tracks.red.clear();
  }
}
