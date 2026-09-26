// What is under an aircraft's wheels: runway, taxiway/apron, bare terrain or sea.

import { terrainHeight } from './terrain';
import { AIRFIELDS, AirfieldDef, FIELD_FLAT } from './islands';
import { RUNWAY_Y } from './airfieldMeshes.consts';

export type SurfaceKind = 'runway' | 'paved' | 'terrain' | 'water';

export interface Surface {
  h: number;
  kind: SurfaceKind;
  field: AirfieldDef | null;
}

export function groundSurface(x: number, z: number, out: Surface = { h: 0, kind: 'terrain', field: null }): Surface {
  for (let i = 0; i < AIRFIELDS.length; i++) {
    const f = AIRFIELDS[i];
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
