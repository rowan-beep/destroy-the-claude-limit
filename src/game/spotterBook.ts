// The plane spotter's records: the photo album (kept in the browser's IndexedDB,
// the pictures themselves as JPEGs) and the spotter's logbook (localStorage): the
// best shot of each kind for each jet, points, and the rank they add up to.

import type { AircraftType } from '../aircraft/specs';

/** the kinds of shot to collect, what earns them, and what they are worth */
export const SHOTS: Record<string, { name: string; hint: string; pts: number }> = {
  takeoff: { name: 'TAKEOFF', hint: 'The wheels just off the runway, gear still down', pts: 30 },
  afterburner: { name: 'AFTERBURNER', hint: 'Both burners lit, from behind or the side', pts: 30 },
  vertical: { name: 'VERTICAL', hint: 'Pointing straight up', pts: 35 },
  vapor: { name: 'VAPOR CONE', hint: 'The cone of cloud near Mach 1 on the high-speed pass', pts: 60 },
  highg: { name: 'HIGH-G VAPOR', hint: 'Vapour pouring off the wings in a hard pull', pts: 45 },
  topside: { name: 'TOP SIDE', hint: 'The whole top of the jet, in a hard turn toward you', pts: 40 },
  belly: { name: 'UNDERSIDE', hint: 'The belly and the weapons stations', pts: 20 },
  inverted: { name: 'INVERTED', hint: 'Upside down, over the top', pts: 35 },
  knife: { name: 'KNIFE EDGE', hint: 'Wings vertical in the rolling pass', pts: 40 },
  headon: { name: 'HEAD-ON', hint: 'Coming straight at you', pts: 35 },
  highalpha: { name: 'HIGH ALPHA', hint: 'Nose high, slow, hanging on its wings', pts: 40 },
  cobra: { name: 'COBRA', hint: 'The nose pitched past vertical (thrust-vectoring jets)', pts: 80 },
  gear: { name: 'GEAR DOWN', hint: 'On final with the gear down', pts: 20 },
  touchdown: { name: 'TOUCHDOWN', hint: 'Wheels on the runway', pts: 35 },
  static: { name: 'STATIC DISPLAY', hint: 'Parked behind the crowd (turn round): fill the frame with it', pts: 20 },
};

/** spotter ranks: the points to reach each, and what it brings */
export const RANKS: { name: string; pts: number; lens: number; perk: string }[] = [
  { name: 'ROOKIE SPOTTER', pts: 0, lens: 300, perk: 'A 24-300 mm zoom, a place on the crowd line' },
  { name: 'FENCE REGULAR', pts: 600, lens: 400, perk: 'Lens out to 400 mm, and the fence under the landing approach' },
  { name: 'CROWD-LINE PRO', pts: 1800, lens: 600, perk: 'Lens out to 600 mm, burst shooting (hold the shutter)' },
  { name: 'AVIATION PHOTOGRAPHER', pts: 4000, lens: 800, perk: 'Lens out to 800 mm, and the runway end: takeoffs from behind' },
  { name: 'MAGAZINE COVER', pts: 8000, lens: 1120, perk: 'A 1.4x teleconverter: 1120 mm' },
];

export interface PhotoMeta {
  id: string;
  time: number;
  type: AircraftType;
  jet: string;
  score: number;
  stars: number;
  tags: string[];
  base: string;
  /** focal length, mm */
  lens: number;
  /** where the jet sat in the picture (0..1 across and down), for cropping */
  sx?: number;
  sy?: number;
  /** where it was taken from (the photo spot's id) */
  spot?: string;
}

export interface SpotterLog {
  points: number;
  shots: number;
  /** best stars of each kind, per jet */
  best: Partial<Record<AircraftType, Record<string, number>>>;
  /** best score of any shot */
  topScore: number;
}

const KEY = 'triad.spotter';

export function loadSpotterLog(): SpotterLog {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s.points === 'number') return { points: s.points, shots: s.shots ?? 0, best: s.best ?? {}, topScore: s.topScore ?? 0 };
  } catch {
    /* (unreadable: start a fresh one) */
  }
  return { points: 0, shots: 0, best: {}, topScore: 0 };
}

export function saveSpotterLog(l: SpotterLog): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* (storage full or blocked: this session only) */
  }
}

export function rankOf(points: number): { i: number; rank: (typeof RANKS)[number]; next: (typeof RANKS)[number] | null } {
  let i = 0;
  while (i + 1 < RANKS.length && points >= RANKS[i + 1].pts) i++;
  return { i, rank: RANKS[i], next: RANKS[i + 1] ?? null };
}

// ------------------------------------------------------------------ the album

const DB = 'triad-spotter';
const MAX_PHOTOS = 120;
let dbP: Promise<IDBDatabase | null> | null = null;
/** if IndexedDB is blocked, the album lives for this session */
const memory = new Map<string, { meta: PhotoMeta; blob: Blob }>();

function db(): Promise<IDBDatabase | null> {
  if (!dbP)
    dbP = new Promise((res) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('blob')) d.createObjectStore('blob');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
        r.onblocked = () => res(null);
      } catch {
        res(null);
      }
    });
  return dbP;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function listPhotos(): Promise<PhotoMeta[]> {
  const d = await db();
  let list: PhotoMeta[];
  if (!d) list = [...memory.values()].map((m) => m.meta);
  else {
    try {
      list = await req(d.transaction('meta').objectStore('meta').getAll() as IDBRequest<PhotoMeta[]>);
    } catch {
      list = [...memory.values()].map((m) => m.meta);
    }
  }
  return list.sort((a, b) => b.time - a.time);
}

export async function photoBlob(id: string): Promise<Blob | null> {
  const m = memory.get(id);
  if (m) return m.blob;
  const d = await db();
  if (!d) return null;
  try {
    return ((await req(d.transaction('blob').objectStore('blob').get(id))) as Blob) ?? null;
  } catch {
    return null;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  memory.delete(id);
  const d = await db();
  if (!d) return;
  try {
    const tx = d.transaction(['meta', 'blob'], 'readwrite');
    tx.objectStore('meta').delete(id);
    tx.objectStore('blob').delete(id);
  } catch {
    /* (gone already) */
  }
}

/** keep a photo; the album holds the best and newest 120 (the weakest old ones go first) */
export async function savePhoto(meta: PhotoMeta, blob: Blob): Promise<void> {
  const d = await db();
  if (!d) {
    memory.set(meta.id, { meta, blob });
    return;
  }
  try {
    const tx = d.transaction(['meta', 'blob'], 'readwrite');
    tx.objectStore('meta').put(meta);
    tx.objectStore('blob').put(blob, meta.id);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    memory.set(meta.id, { meta, blob });
    return;
  }
  const all = await listPhotos();
  if (all.length > MAX_PHOTOS) {
    // the oldest of the low scorers make room
    const drop = all
      .slice(20)
      .sort((a, b) => a.score - b.score || a.time - b.time)
      .slice(0, all.length - MAX_PHOTOS);
    for (const p of drop) await deletePhoto(p.id);
  }
}
