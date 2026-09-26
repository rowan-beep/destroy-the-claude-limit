// Static layout of the theater: the three islands and the six airfields.
// Everything is expressed in world metres (x = east, z = south).

import { NM, Team, nmToWorld } from '../core/constants';

export type IslandId = 'skye' | 'capri' | 'samos';

export interface IslandDef {
  id: IslandId;
  name: string;
  description: string;
  owner: Team | 'contested';
  /** centre in world metres */
  cx: number;
  cz: number;
  /** semi-axes in metres (east-west, north-south before rotation) */
  rx: number;
  ry: number;
  /** rotation (radians, counter-clockwise seen from above) */
  rot: number;
  /** coastline irregularity */
  warp: number;
  /** precomputed trig */
  cos: number;
  sin: number;
  /** effective radius for inland-distance estimate */
  reff: number;
  /** bounding radius for fast rejection (includes continental shelf) */
  bound: number;
}

function island(
  id: IslandId,
  name: string,
  description: string,
  owner: Team | 'contested',
  xNm: number,
  yNm: number,
  rxNm: number,
  ryNm: number,
  rotDeg: number,
  warp: number,
): IslandDef {
  const c = nmToWorld(xNm, yNm);
  const rot = (rotDeg * Math.PI) / 180;
  const rx = rxNm * NM;
  const ry = ryNm * NM;
  return {
    id,
    name,
    description,
    owner,
    cx: c.x,
    cz: c.z,
    rx,
    ry,
    rot,
    warp,
    cos: Math.cos(rot),
    sin: Math.sin(rot),
    reff: Math.sqrt(rx * ry),
    bound: Math.max(rx, ry) * 1.45 + 45000,
  };
}

export const ISLANDS: IslandDef[] = [
  island(
    'skye',
    'SKYE',
    'Steep razor-backed mountains, deep sea lochs and sheer coastal cliffs. Home of the BLUE coalition.',
    'blue',
    -100,
    95,
    82,
    60,
    12,
    1,
  ),
  island(
    'capri',
    'CAPRI',
    'A compact, rocky fortress of steep limestone crags ringed by sea cliffs and blue grottoes. Home of the RED coalition.',
    'red',
    118,
    98,
    56,
    40,
    -8,
    0.8,
  ),
  island(
    'samos',
    'SAMOS',
    'High pine-covered hills and pebble beaches, split in two by a massive dividing mountain wall. Contested: one BLUE and one RED airfield.',
    'contested',
    5,
    -100,
    98,
    54,
    3,
    0.9,
  ),
];

export const ISLAND_BY_ID: Record<IslandId, IslandDef> = {
  skye: ISLANDS[0],
  capri: ISLANDS[1],
  samos: ISLANDS[2],
};

/** Island-local coordinates: u = along the island's east axis, v = north axis (metres). */
export function toIslandLocal(isl: IslandDef, x: number, z: number, out: { u: number; v: number }): { u: number; v: number } {
  const dx = x - isl.cx;
  const dn = -(z - isl.cz); // north
  out.u = dx * isl.cos + dn * isl.sin;
  out.v = -dx * isl.sin + dn * isl.cos;
  return out;
}

export function fromIslandLocal(isl: IslandDef, u: number, v: number): { x: number; z: number } {
  const dx = u * isl.cos - v * isl.sin;
  const dn = u * isl.sin + v * isl.cos;
  return { x: isl.cx + dx, z: isl.cz - dn };
}

// ---------------------------------------------------------------------------
// Airfields
// ---------------------------------------------------------------------------

export interface AirfieldDef {
  id: string;
  name: string;
  icao: string;
  team: Team;
  island: IslandId;
  /** runway centre (world metres) */
  x: number;
  z: number;
  /** runway true heading in degrees (direction of the low-numbered end's takeoff) */
  heading: number;
  /** field elevation (m) */
  elev: number;
  /** runway dimensions (m) */
  length: number;
  width: number;
  /** unit vectors along runway (heading direction) and to the right of it */
  ax: number;
  az: number;
  rxv: number;
  rzv: number;
  /** TACAN-style channel shown on the HUD nav page */
  tacan: string;
}

function field(
  id: string,
  name: string,
  icao: string,
  team: Team,
  isl: IslandId,
  xNm: number,
  yNm: number,
  heading: number,
  elev: number,
  tacan: string,
): AirfieldDef {
  const c = nmToWorld(xNm, yNm);
  const h = (heading * Math.PI) / 180;
  const ax = Math.sin(h);
  const az = -Math.cos(h);
  return {
    id,
    name,
    icao,
    team,
    island: isl,
    x: c.x,
    z: c.z,
    heading,
    elev,
    length: 3300,
    width: 50,
    ax,
    az,
    rxv: -az, // right of heading: rotate (ax,az) by +90 deg clockwise seen from above
    rzv: ax,
    tacan,
  };
}

export const AIRFIELDS: AirfieldDef[] = [
  field('dunvegan', 'DUNVEGAN AB', 'EGDV', 'blue', 'skye', -157, 104, 22, 42, '31X'),
  field('broadford', 'BROADFORD AB', 'EGBF', 'blue', 'skye', -52, 76, 158, 35, '44X'),
  field('karlovasi', 'KARLOVASI AB', 'LGKV', 'blue', 'samos', -66, -96, 4, 55, '57X'),
  field('anacapri', 'ANACAPRI AB', 'LIAC', 'red', 'capri', 84, 104, 88, 60, '62X'),
  field('marina', 'MARINA GRANDE AB', 'LIMG', 'red', 'capri', 147, 90, 38, 40, '71X'),
  field('vathy', 'VATHY AB', 'LGVT', 'red', 'samos', 77, -106, 182, 50, '85X'),
];

export const AIRFIELD_BY_ID: Record<string, AirfieldDef> = Object.fromEntries(AIRFIELDS.map((f) => [f.id, f]));

export function airfieldsOf(team: Team): AirfieldDef[] {
  return AIRFIELDS.filter((f) => f.team === team);
}

/** Runway-local coordinates: along (metres from centre toward heading), across (metres to the right). */
export function toRunwayLocal(f: AirfieldDef, x: number, z: number): { along: number; across: number } {
  const dx = x - f.x;
  const dz = z - f.z;
  return { along: dx * f.ax + dz * f.az, across: dx * f.rxv + dz * f.rzv };
}

export function fromRunwayLocal(f: AirfieldDef, along: number, across: number): { x: number; z: number } {
  return { x: f.x + f.ax * along + f.rxv * across, z: f.z + f.az * along + f.rzv * across };
}

/** Airfield footprint (in runway-local metres) that the terrain is levelled to. */
export const FIELD_FLAT = {
  alongPad: 900,
  acrossMin: -320,
  acrossMax: 820,
  blend: 2200,
};

// Sea loch centre-lines on Skye, island-local nautical miles (u east, v north).
// Each starts out at sea and runs inland so the fjord connects to open water.
export const SKYE_LOCHS: { pts: [number, number][]; width: number }[] = [
  { pts: [[-98, 28], [-72, 24], [-58, 30], [-47, 27]], width: 2200 },
  { pts: [[-22, 72], [-19, 48], [-10, 34], [-2, 28]], width: 2600 },
  { pts: [[98, 18], [74, 10], [62, 16], [54, 12]], width: 2000 },
  { pts: [[28, -76], [26, -52], [17, -36], [12, -27]], width: 2400 },
  { pts: [[-66, -64], [-46, -44], [-37, -30]], width: 1800 },
  { pts: [[74, 60], [55, 42], [44, 36]], width: 2000 },
  { pts: [[-95, -22], [-74, -16], [-64, -20]], width: 1600 },
  { pts: [[8, 70], [12, 52], [22, 44]], width: 1500 },
];

// Blue grotto coves around Capri, as angle around the coast (deg) and cove radius (m).
export const CAPRI_GROTTOES: { angle: number; radius: number; name: string }[] = [
  { angle: 205, radius: 1100, name: 'GROTTA AZZURRA' },
  { angle: 250, radius: 800, name: 'GROTTA VERDE' },
  { angle: 300, radius: 900, name: 'GROTTA BIANCA' },
  { angle: 20, radius: 700, name: 'GROTTA MERAVIGLIOSA' },
  { angle: 120, radius: 950, name: 'GROTTA DEL CORALLO' },
  { angle: 160, radius: 750, name: 'GROTTA ROSSA' },
];
