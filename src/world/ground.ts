// What is under an aircraft's wheels: runway, taxiway/apron, a carrier's
// flight deck, bare terrain or sea. A deck moves: its velocity, turn rate and
// tilt come back too, so a jet on it rides the ship.

import { terrainHeight } from './terrain';
import { AIRFIELDS, AirfieldDef, FIELD_FLAT } from './islands';
import { RUNWAY_Y } from './airfieldMeshes.consts';
import { deckAt, Carrier } from './carriers';

export type SurfaceKind = 'runway' | 'paved' | 'terrain' | 'water' | 'deck';

export interface Surface {
  h: number;
  kind: SurfaceKind;
  field: AirfieldDef | null;
  /** a carrier deck: the ship, the point in ship coordinates, the deck's velocity and turn rate (rad/s) */
  carrier?: Carrier | null;
  u?: number;
  v?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  yawRate?: number;
  /** the deck's tilt: its surface normal is (nx, 1, nz) normalised */
  nx?: number;
  nz?: number;
}

const _dv = { x: 0, y: 0, z: 0 };

export function groundSurface(x: number, z: number, out: Surface = { h: 0, kind: 'terrain', field: null }): Surface {
  out.carrier = null;
  out.vx = out.vy = out.vz = out.yawRate = out.nx = out.nz = 0;
  const dk = deckAt(x, z);
  if (dk) {
    const c = dk.c;
    c.deckVel(dk.u, dk.v, _dv);
    out.h = c.deckY(dk.u, dk.v);
    out.kind = 'deck';
    out.field = c.f;
    out.carrier = c;
    out.u = dk.u;
    out.v = dk.v;
    out.vx = _dv.x;
    out.vy = _dv.y;
    out.vz = _dv.z;
    out.yawRate = c.yawRate;
    const tp = Math.tan(c.pitch), tr = Math.tan(c.roll);
    out.nx = -(tp * c.fx - tr * c.rx);
    out.nz = -(tp * c.fz - tr * c.rz);
    return out;
  }
  for (let i = 0; i < AIRFIELDS.length; i++) {
    const f = AIRFIELDS[i];
    if (f.carrier) continue;
    const dx = x - f.x, dz = z - f.z;
    if (Math.abs(dx) > 3500 || Math.abs(dz) > 3500) continue;
    const along = dx * f.ax + dz * f.az;
    const across = dx * f.rxv + dz * f.rzv;
    const halfL = f.length / 2;
    if (Math.abs(along) < halfL + 125 && Math.abs(across) < f.width / 2 + 16) {
      out.h = f.elev + RUNWAY_Y;
      out.kind = 'runway';
      out.field = f;
      return out;
    }
    if (Math.abs(along) < halfL + FIELD_FLAT.alongPad * 0.6 && across > -200 && across < 700) {
      out.h = f.elev + RUNWAY_Y - 0.05;
      out.kind = 'paved';
      out.field = f;
      return out;
    }
  }
  const h = terrainHeight(x, z);
  if (h <= 0) {
    out.h = 0;
    out.kind = 'water';
  } else {
    out.h = h;
    out.kind = 'terrain';
  }
  out.field = null;
  return out;
}

/** Height above the surface (terrain or sea) at a position. */
export function heightAboveSurface(x: number, y: number, z: number): number {
  const h = terrainHeight(x, z);
  return y - Math.max(h, 0);
}
