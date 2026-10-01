// Layout of the theater: islands, airfields and the roles the game modes use
// (the contested arena island, each side's home, the duel runways), for each
// map. Everything is expressed in world metres (x = east, z = south).
//
//  TRIAD ISLES       400 x 400 NM: Skye, Capri and Samos.
//  FROSTFALL STRAIT  200 x 200 NM: a frozen arctic archipelago of huge
//                    snow-covered ranges, pack ice and a contested island.
//  JADE ARCHIPELAGO  80 x 80 NM: twenty tropical islands, every one
//                    different, jungle and beaches, one runway per side.
//
// applyMapData() swaps the active map in place (ISLANDS, AIRFIELDS and the
// lookup tables are mutated, so every importer sees the new map).

import { NM, Team, nmToWorld } from '../core/constants';

export type IslandId = string;
/** Which terrain generator shapes the island. */
export type IslandStyle = 'skye' | 'capri' | 'samos' | 'frost' | 'islet' | 'tropic';
/** Jade Archipelago: the shape of each tropical island. */
export type TropicKind = 'strato' | 'shield' | 'highland' | 'karst' | 'atoll' | 'caldera' | 'twin' | 'ridge' | 'mesa' | 'cone' | 'spires' | 'hills' | 'crescent' | 'cay';

export interface IslandDef {
  id: IslandId;
  style: IslandStyle;
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
  /** tropical islands: their landform and its highest point (m) */
  kind?: TropicKind;
  peak?: number;
}

function island(
  id: IslandId,
  style: IslandStyle,
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
    style,
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

const TRIAD_ISLANDS: IslandDef[] = [
  island(
    'skye',
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

// Frostfall Strait: two frozen coalitions facing each other across a
// strait, huge ranges on every landmass, pack ice at the edges and the
// contested island of Hvitøy in the middle.
const FROST_ISLANDS: IslandDef[] = [
  island('nordland', 'frost', 'NORDLAND', 'A vast ice-capped range rising straight out of the sea. Home of the BLUE coalition.', 'blue', -80, 74, 54, 40, -18, 1.6),
  island('sorvik', 'frost', 'SØRVIK', 'Glaciated peaks and deep fjords in the south-west. BLUE territory.', 'blue', -80, -74, 46, 38, 12, 1.6),
  island('ostmark', 'frost', 'ØSTMARK', 'The great eastern landmass: jagged ridges towering over the strait. Home of the RED coalition.', 'red', 70, -62, 64, 50, 24, 1.6),
  island('kragfjell', 'frost', 'KRAGFJELL', 'Needle peaks and ice fields in the north-east. RED territory.', 'red', 76, 74, 44, 36, -12, 1.6),
  island('hvitoy', 'frost', 'HVITØY', 'The contested island in the middle of the strait: a wall of mountains between one BLUE and one RED airfield.', 'contested', -20, 2, 19, 15, 28, 1.3),
  island('skjaer1', 'islet', 'SKJÆR', 'Rocky islets.', 'contested', 12, 46, 4.5, 3.5, 0, 0.8),
  island('skjaer2', 'islet', 'SKJÆR', 'Rocky islets.', 'contested', 27, 49, 3.5, 3, 20, 0.8),
  island('skjaer3', 'islet', 'SKJÆR', 'Rocky islets.', 'contested', 40, 41, 3.2, 2.6, -15, 0.8),
  island('skjaer4', 'islet', 'SKJÆR', 'Rocky islets.', 'contested', -46, -24, 3.6, 2.8, 35, 0.8),
  island('skjaer5', 'islet', 'SKJÆR', 'Rocky islets.', 'contested', 4, -30, 3, 2.4, 0, 0.8),
];

// Jade Archipelago: twenty tropical islands in an 80 x 80 NM sea, each one a
// different landform. BLUE flies from Tamaru in the south-west, RED from
// Kahiki in the north-east; the great volcano Mauna Jade stands between them.
function tropic(id: string, name: string, description: string, owner: Team | 'contested', x: number, y: number, rx: number, ry: number, rot: number, kind: TropicKind, peak: number, warp = 0.9): IslandDef {
  const i = island(id, 'tropic', name, description, owner, x, y, rx, ry, rot, warp);
  i.kind = kind;
  i.peak = peak;
  // a small sea: shelves are kilometres, not tens of kilometres
  i.bound = Math.max(i.rx, i.ry) * 1.45 + 9000;
  return i;
}

const JADE_ISLANDS: IslandDef[] = [
  tropic('tamaru', 'TAMARU', 'A long jungle range above a wide coastal plain and white beaches. Home of the BLUE coalition.', 'blue', -23, -21, 9, 6.5, 15, 'highland', 1900),
  tropic('kahiki', 'KAHIKI', 'A broad shield volcano wrapped in rainforest, black-sand beaches on its flanks. Home of the RED coalition.', 'red', 24, 22, 9, 7, -10, 'shield', 2300),
  tropic('mauna', 'MAUNA JADE', 'The great volcano in the middle of the archipelago: a 10,000 ft cone of rainforest, cloud forest and bare rock. Contested.', 'contested', 1, 1, 7.5, 6.5, 8, 'strato', 3150),
  tropic('tuaha', 'TUAHA', 'Hundreds of sheer limestone towers rising straight out of the jungle and the sea.', 'contested', -9, 25, 5.5, 3.5, 20, 'karst', 420),
  tropic('lagoa', 'LAGOA ATOLL', 'A ring of palm-covered sand around a turquoise lagoon.', 'contested', 31, -24, 4.2, 3.6, 0, 'atoll', 6),
  tropic('nalu', 'NALU', 'Twin jungle volcanoes joined by a high saddle.', 'contested', -31, 18, 4.5, 3.2, -25, 'twin', 1650),
  tropic('motu', 'MOTU', 'A tiny sand cay with a few palms.', 'contested', 12, -7, 1.1, 0.8, 30, 'cay', 3),
  tropic('kaluna', 'KALUNA CALDERA', 'The broken rim of a sunken volcano, its crater flooded by the sea.', 'contested', 17, -17, 4, 3.6, 0, 'caldera', 820),
  tropic('reva', 'REVA', 'A knife-edged jungle ridge running thirty kilometres out to sea.', 'contested', -6, -31, 7.5, 1.8, 25, 'ridge', 1050),
  tropic('mesa', 'TAPU MESA', 'A flat-topped plateau ringed by red cliffs.', 'contested', 35, 3, 3.4, 2.6, -15, 'mesa', 560),
  tropic('ahi', 'AHI', 'A steep young volcanic cone, its upper slopes still bare rock.', 'contested', -35, -4, 2.8, 2.6, 0, 'cone', 1350),
  tropic('pinna', 'PINNA', 'A small cluster of limestone stacks and coves.', 'contested', 8, 33, 3, 2, -10, 'karst', 300),
  tropic('kea', 'KEA CAY', 'A sand cay on the reef.', 'contested', -19, 5, 1.4, 1.0, 60, 'cay', 3),
  tropic('needles', 'THE NEEDLES', 'A cluster of needle peaks, sheer rock above the jungle.', 'contested', -22, 34, 3, 2.4, 15, 'spires', 1500),
  tropic('vaitu', 'VAITU', 'Low rolling green hills and long beaches.', 'contested', -1, -16, 4, 3, -20, 'hills', 380),
  tropic('manu', 'MANU ATOLL', 'A small ring of palms around a shallow lagoon.', 'contested', -35, 35, 2.8, 2.5, 20, 'atoll', 5),
  tropic('ula', 'ULA CAY', 'A lone sand cay at the edge of the reef.', 'contested', 35, -36, 1.0, 0.8, 0, 'cay', 3),
  tropic('kalo', 'KALO', 'A narrow rocky ridge with jungle on its lee side.', 'contested', 13, 12, 3, 1.4, -35, 'ridge', 700),
  tropic('ohana', 'OHANA BAY', 'A crescent island curled around a sheltered bay.', 'contested', -36, -34, 3.5, 3, 30, 'crescent', 640),
  tropic('sola', 'SOLA CAY', 'A sand cay ringed by coral.', 'contested', 5, -35, 1.2, 0.9, -20, 'cay', 3),
];

/** The active map's islands (mutated in place by applyMapData). */
export const ISLANDS: IslandDef[] = [...TRIAD_ISLANDS];

export const ISLAND_BY_ID: Record<IslandId, IslandDef> = Object.fromEntries(ISLANDS.map((i) => [i.id, i]));

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

const TRIAD_AIRFIELDS: AirfieldDef[] = [
  field('dunvegan', 'DUNVEGAN AB', 'EGDV', 'blue', 'skye', -157, 104, 22, 42, '31X'),
  field('broadford', 'BROADFORD AB', 'EGBF', 'blue', 'skye', -52, 76, 158, 35, '44X'),
  field('karlovasi', 'KARLOVASI AB', 'LGKV', 'blue', 'samos', -66, -96, 4, 55, '57X'),
  field('anacapri', 'ANACAPRI AB', 'LIAC', 'red', 'capri', 84, 104, 88, 60, '62X'),
  field('marina', 'MARINA GRANDE AB', 'LIMG', 'red', 'capri', 147, 90, 38, 40, '71X'),
  field('vathy', 'VATHY AB', 'LGVT', 'red', 'samos', 77, -106, 182, 50, '85X'),
];

const FROST_AIRFIELDS: AirfieldDef[] = [
  field('nordhavn', 'NORDHAVN AB', 'ENNH', 'blue', 'nordland', -52, 50, 58, 30, '21X'),
  field('isvik', 'ISVIK AB', 'ENIV', 'blue', 'sorvik', -54, -58, 24, 25, '33X'),
  field('hvitavest', 'HVITØY WEST AB', 'ENHW', 'blue', 'hvitoy', -31, 5, 12, 28, '47X'),
  field('kragen', 'KRAGEN AB', 'ENKR', 'red', 'ostmark', 40, -36, 34, 30, '64X'),
  field('svalbru', 'SVALBRU AB', 'ENSB', 'red', 'kragfjell', 52, 58, 104, 28, '78X'),
  field('hvitaost', 'HVITØY EAST AB', 'ENHE', 'red', 'hvitoy', -10, -2, 192, 26, '86X'),
];

// one runway per side, each on its home island's coastal plain
const JADE_AIRFIELDS: AirfieldDef[] = [
  field('tamaru', 'TAMARU AB', 'NTTA', 'blue', 'tamaru', -24, -24, 75, 12, '24X'),
  field('kahiki', 'KAHIKI AB', 'NTKH', 'red', 'kahiki', 27, 19, 40, 14, '68X'),
];

/** The active map's airfields (mutated in place by applyMapData). */
export const AIRFIELDS: AirfieldDef[] = [...TRIAD_AIRFIELDS];

export const AIRFIELD_BY_ID: Record<string, AirfieldDef> = Object.fromEntries(AIRFIELDS.map((f) => [f.id, f]));

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

export type MapId = 'triad' | 'frost' | 'jade';

export interface MapInfo {
  id: MapId;
  name: string;
  sizeNm: number;
  /** highest terrain anywhere (m), for line-of-sight rejection */
  maxTerrain: number;
  /** typical fight altitude (m): battles start and patrol above the high ground */
  fightAlt: number;
  description: string;
  /** subtitle listing the main land masses */
  places: string;
}

export const MAPS: MapInfo[] = [
  {
    id: 'jade',
    name: 'JADE ARCHIPELAGO',
    sizeNm: 80,
    maxTerrain: 3300,
    fightAlt: 5200,
    description: 'Twenty tropical islands in an 80 × 80 NM sea, each one different: a 10,000 ft volcano, limestone towers, atolls and lagoons, a flooded caldera, needle peaks, jungle ridges and white beaches. One runway per side.',
    places: 'TAMARU · MAUNA JADE · KAHIKI · TUAHA · KALUNA',
  },
  {
    id: 'frost',
    name: 'FROSTFALL STRAIT',
    sizeNm: 200,
    maxTerrain: 8600,
    fightAlt: 9000,
    description: 'A frozen arctic archipelago, 200 × 200 NM: towering snow-covered ranges over 25,000 ft, deep blue water, pack ice and the contested island of Hvitøy in the strait.',
    places: 'NORDLAND · SØRVIK · HVITØY · ØSTMARK · KRAGFJELL',
  },
  {
    id: 'triad',
    name: 'TRIAD ISLES',
    sizeNm: 400,
    maxTerrain: 5600,
    fightAlt: 6400,
    description: 'The original 400 × 400 NM theater: Skye, Capri and the contested island of Samos.',
    places: 'SKYE · CAPRI · SAMOS',
  },
];

/**
 * Roles the game modes use on the active map: the contested island where
 * battles meet, each side's home island, and the duel runway pair.
 */
export interface MapRoles {
  arena: IslandDef;
  blueHome: IslandDef;
  redHome: IslandDef;
  duelBlue: AirfieldDef;
  duelRed: AirfieldDef;
}

export let activeMap: MapInfo = MAPS.find((m) => m.id === 'triad')!;

/** Scale an altitude written for Triad Isles (fights near 6,400 m) to the active map. */
export function mapAlt(m: number): number {
  return m + (activeMap.fightAlt - 6400);
}
export const ROLES: MapRoles = {
  arena: TRIAD_ISLANDS[2],
  blueHome: TRIAD_ISLANDS[0],
  redHome: TRIAD_ISLANDS[1],
  duelBlue: TRIAD_AIRFIELDS[2],
  duelRed: TRIAD_AIRFIELDS[5],
};

/** Make `id` the active map's layout (islands, airfields, roles). */
/**
 * How far apart things in a mode are set, relative to the 200 NM theater the
 * modes were laid out on: 1 there and on bigger maps, less on smaller ones,
 * so nothing is placed beyond the edge of a small map.
 */
export function mapScale(): number {
  return Math.min(1, Math.max(0.4, activeMap.sizeNm / 200));
}

export function applyMapData(id: MapId): void {
  activeMap = MAPS.find((m) => m.id === id) ?? MAPS.find((m) => m.id === 'triad')!;
  const which = activeMap.id;
  const isl = which === 'frost' ? FROST_ISLANDS : which === 'jade' ? JADE_ISLANDS : TRIAD_ISLANDS;
  const fld = which === 'frost' ? FROST_AIRFIELDS : which === 'jade' ? JADE_AIRFIELDS : TRIAD_AIRFIELDS;
  ISLANDS.length = 0;
  ISLANDS.push(...isl);
  AIRFIELDS.length = 0;
  AIRFIELDS.push(...fld);
  for (const k of Object.keys(ISLAND_BY_ID)) delete ISLAND_BY_ID[k];
  for (const i of isl) ISLAND_BY_ID[i.id] = i;
  for (const k of Object.keys(AIRFIELD_BY_ID)) delete AIRFIELD_BY_ID[k];
  for (const f of fld) AIRFIELD_BY_ID[f.id] = f;
  const by = (id2: string) => isl.find((i) => i.id === id2)!;
  const fb = (id2: string) => fld.find((f) => f.id === id2)!;
  if (which === 'frost') {
    ROLES.arena = by('hvitoy');
    ROLES.blueHome = by('nordland');
    ROLES.redHome = by('ostmark');
    ROLES.duelBlue = fb('hvitavest');
    ROLES.duelRed = fb('hvitaost');
  } else if (which === 'jade') {
    ROLES.arena = by('mauna');
    ROLES.blueHome = by('tamaru');
    ROLES.redHome = by('kahiki');
    ROLES.duelBlue = fb('tamaru');
    ROLES.duelRed = fb('kahiki');
  } else {
    ROLES.arena = by('samos');
    ROLES.blueHome = by('skye');
    ROLES.redHome = by('capri');
    ROLES.duelBlue = fb('karlovasi');
    ROLES.duelRed = fb('vathy');
  }
}

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
