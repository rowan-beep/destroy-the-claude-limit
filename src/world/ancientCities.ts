// Dune Sea: the four ancient cities. Greco-Roman towns the sand took: walls with
// gates, colonnaded streets on a grid, a forum, temples, a theatre, house blocks,
// an amphitheatre and tombs outside, an aqueduct striding in over the dunes.
//
// A city is a plan: a list of pieces, each a copy of one of the ruin kinds
// (desertRuins.ts, drawn instanced: cheap however many there are), placed in the
// city's own frame (u across, v along its main street, metres, from its centre),
// plus optional one-off models of the city's own (extras). desertProps.ts turns
// the plan into the world: it sinks every piece to the lowest sand under it and
// draws it only within its range of the camera. The cities' ground is levelled in
// desert.ts (duneHeight, round each ANCIENT entry).

import * as THREE from 'three';
import { ANCIENT } from './desert';

export type AncientCity = (typeof ANCIENT)[number];

/** One piece of a city: a copy of a ruin kind. */
export interface CityPiece {
  /** a RuinKind (desertRuins.ts); kinds the ruins module does not have are skipped */
  kind: string;
  /** position in the city's frame (m from its centre: u across, v along the main street) */
  u: number;
  v: number;
  /** turn about the vertical, relative to the city's grid (rad; a ruin's local +z runs along +v at 0) */
  yaw: number;
  /** drawn this many times life size */
  scale: number;
  /** which of the kind's versions (0-2; random when left out) */
  version?: number;
  /** extra depth to sink it below the lowest sand under it (m; default 0.4) */
  sink?: number;
  /** drawn within this distance of the camera (m; a default per kind when left out) */
  range?: number;
}

/** A one-off model of a city's own, built after loading. */
export interface CityExtra {
  build: () => THREE.BufferGeometry;
  u: number;
  v: number;
  yaw: number;
  /** the radius of ground it stands on (m: it is sunk to the lowest sand within 0.6 of it) */
  footprint: number;
  range: number;
  scale?: number;
  sink?: number;
}

export interface CityPlan {
  pieces: CityPiece[];
  extras?: CityExtra[];
}

/** the cities are built this much bigger than life (real-size ruins all but vanish from a jet) */
const SCALE = 1.6;

/**
 * One of the ancient cities: walls round a square town with a gate on each side, the two colonnaded
 * main streets crossing at the forum, temples, a basilica and baths round it, a theatre, house blocks
 * filling the grid (most of them long since gone under the sand), outside the walls an amphitheatre,
 * tower tombs lining the road out of one gate, and an aqueduct striding in across the dunes.
 */
export function buildCity(c: AncientCity, rnd: () => number): CityPlan {
  const H = c.H;
  const S = SCALE;
  const pieces: CityPiece[] = [];
  // (the plan drawn at life size, every distance and piece scaled up together)
  const put = (kind: string, u: number, v: number, yaw: number) => pieces.push({ kind, u: u * S, v: v * S, yaw, scale: S });
  const SEC = 60;
  const half = Math.PI / 2;
  // the walls: sections along each side, some stretches fallen and gone; the gates where the main streets leave
  for (let side = 0; side < 4; side++) {
    for (let t = -H + SEC / 2; t < H; t += SEC) {
      if (Math.abs(t) < 30) continue;
      if (rnd() < 0.42) continue;
      const [u, v, yaw] = side === 0 ? [-H, t, 0] : side === 1 ? [H, t, 0] : side === 2 ? [t, -H, half] : [t, H, half];
      put('wallrun', u, v, yaw);
    }
    const [gu, gv, gy] = side === 0 ? [-H, 0, half] : side === 1 ? [H, 0, half] : side === 2 ? [0, -H, 0] : [0, H, 0];
    put('gate', gu, gv, gy);
  }
  // the cardo (along v) and the decumanus (along u), colonnaded, crossing at the forum
  const forum = { u: 0, v: 0 };
  for (let t = -H + 40; t < H - 40; t += SEC) {
    if (Math.abs(t) < 70) continue;
    if (rnd() < 0.85) put('street', 0, t + SEC / 2 - 30, 0);
    if (rnd() < 0.85) put('street', t + SEC / 2 - 30, 0, half);
  }
  // round the crossing: the forum, an arch over the decumanus, temples, the basilica and the baths
  put('forum', forum.u + 110, forum.v - 100, 0);
  put('arch', -150, 0, half);
  put('temple', 120, 230, 0);
  put('temple', -230, -170, half);
  if (rnd() < 0.6) put('temple', 330, -330, 0);
  put('basilica', -130, 180, half);
  put('basilica', 380, 200, 0);
  put('theatre', -H * 0.55, H * 0.5, Math.PI + 0.3);
  put('colonnade', 250, -90, half);
  // a library's two-storey columned façade facing the cardo, the hall behind it long gone
  put('facade', 45, 330, -half);
  put('obelisk', 40, -60, 0);
  put('statue', 160, -40, rnd() * 6);
  put('column', -60, 60, 0);
  put('column', 70, 90, 0);
  put('well', -90, -80, 0);
  // the house blocks on the grid, most of them buried
  const pitch = 100;
  for (let bu = -H + pitch; bu < H - pitch / 2; bu += pitch) {
    for (let bv = -H + pitch; bv < H - pitch / 2; bv += pitch) {
      if (Math.abs(bu) < 60 || Math.abs(bv) < 60) continue;
      // (the monuments' ground round the crossing, and the theatre's quarter)
      if (Math.abs(bu) < 480 && Math.abs(bv) < 420) continue;
      if (Math.hypot(bu + H * 0.55, bv - H * 0.5) < 160) continue;
      if (rnd() < 0.3) put('houses', bu + (rnd() - 0.5) * 12, bv + (rnd() - 0.5) * 12, (rnd() < 0.5 ? 0 : half) + (rnd() - 0.5) * 0.06);
    }
  }
  // outside: the amphitheatre beyond the east wall, tower tombs along the road from the south gate
  put('amphitheatre', H + 420, -H * 0.35, half);
  for (let i = 0; i < 9; i++) {
    const v = -H - 120 - i * 70 - rnd() * 20;
    put('tomb', (i % 2 ? 1 : -1) * (35 + rnd() * 25), v, rnd() * 0.3);
  }
  // the aqueduct: in from the north-west, 3-5 km of it, stretches fallen
  const len = 3000 + rnd() * 2000;
  const ang = -2.3 + (rnd() - 0.5) * 0.5;
  const du = Math.cos(ang), dv = Math.sin(ang);
  const yaw = Math.atan2(du, dv);
  for (let s = H + 80; s < H + len; s += SEC) {
    if (rnd() < 0.18) continue;
    put('aqueduct', du * s, dv * s, yaw);
  }
  return { pieces };
}
