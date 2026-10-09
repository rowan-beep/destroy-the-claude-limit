// The RANKED leaderboard. Inside the claude.ai artifact every pilot's rank for the
// week is a document in the artifact's shared database (`ranked/<their id>`): everyone
// reads the board, each pilot writes only their own row (the artifact's db rules say
// so). Champion shows its place on it (#1, #2, ...). Anywhere else (the web build, the
// Windows app) there is no shared board and these calls quietly return null.

import { inArtifact } from './artifact';
import { loadNetPrefs } from './servers';
import { placing, weekId, CHAMPION_RP, type RankedState } from '../game/ranked';

interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface QuerySnap {
  docs: DocSnap[];
}
interface Query {
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, dir?: 'asc' | 'desc'): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnap>;
}
interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
}
interface Collection extends Query {
  doc(id: string): DocRef;
}
interface Db {
  collection(path: string): Collection;
}
interface UserApi {
  id(): Promise<string | null>;
}

export interface BoardRow {
  /** the pilot's id (only for spotting your own row) */
  id: string;
  callsign: string;
  rp: number;
  wins: number;
  losses: number;
  kills: number;
  me: boolean;
}

const COLLECTION = 'ranked';

function use<T>(name: string): Promise<T | null> {
  const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
  if (!c || typeof c.use !== 'function') return Promise.resolve(null);
  return Promise.race([c.use(name).then((x) => (x as T) ?? null, () => null), new Promise<null>((r) => setTimeout(() => r(null), 12000))]);
}

let dbP: Promise<Db | null> | null = null;
let idP: Promise<string | null> | null = null;
function db(): Promise<Db | null> {
  dbP ??= inArtifact() ? use<Db>('db') : Promise.resolve(null);
  return dbP;
}
function myId(): Promise<string | null> {
  idP ??= use<UserApi>('user').then((u) => (u ? u.id().catch(() => null) : null));
  return idP;
}

/** Is there a shared leaderboard in this copy of the game? */
export async function boardAvailable(): Promise<boolean> {
  return !!(await db()) && !!(await myId());
}

/** Write this pilot's row for the week (after each ranked match). */
export async function publishRank(s: RankedState): Promise<boolean> {
  try {
    const [d, id] = await Promise.all([db(), myId()]);
    if (!d || !id || placing(s)) return false;
    await d.collection(COLLECTION).doc(id).set({
      week: weekId(s.week),
      callsign: (loadNetPrefs().callsign || 'PILOT').toUpperCase().slice(0, 16),
      rp: s.rp,
      maxRp: s.maxRp,
      wins: s.wins,
      losses: s.losses,
      kills: s.kills,
      t: Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}

/** This week's board, best first (null: no shared board here). */
export async function loadBoard(s: RankedState, limit = 100): Promise<BoardRow[] | null> {
  try {
    const [d, id] = await Promise.all([db(), myId()]);
    if (!d) return null;
    const snap = await d.collection(COLLECTION).where('week', '==', weekId(s.week)).orderBy('rp', 'desc').limit(limit).get();
    return snap.docs
      .filter((x) => x.exists)
      .map((x) => {
        const v = x.data() ?? {};
        const num = (k: string) => (typeof v[k] === 'number' && isFinite(v[k] as number) ? (v[k] as number) : 0);
        return {
          id: x.id,
          callsign: typeof v.callsign === 'string' ? v.callsign.slice(0, 16) : 'PILOT',
          rp: num('rp'),
          wins: num('wins'),
          losses: num('losses'),
          kills: num('kills'),
          me: x.id === id,
        };
      });
  } catch {
    return null;
  }
}

/** Your place among this week's Champions (null: not Champion, or no board here). */
export async function championPlace(s: RankedState): Promise<number | null> {
  if (placing(s) || s.rp < CHAMPION_RP) return null;
  const rows = await loadBoard(s, 1000);
  if (!rows) return null;
  const above = rows.filter((r) => !r.me && r.rp > s.rp).length;
  return above + 1;
}
