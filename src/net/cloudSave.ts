// The game's browser save as one cloud save, and how a device and an account agree
// on which copy is current without ever losing one.
//
// Everything the game keeps in localStorage under "triad." / "triad-" is the save
// (settings, ranked, logbook, campaign, paint, ocean and space progress...), apart
// from caches and this module's own bookkeeping. No network here: cloud.ts does that.

export type SaveData = Record<string, string>;

/** Is this localStorage entry part of the player's save? */
export function isSaveKey(k: string): boolean {
  if (!/^triad[.-]/.test(k)) return false;
  if (k.startsWith('triad.thumb.')) return false; // hangar picture cache, rebuilt on demand
  if (k.startsWith('triad.cloud.')) return false; // sync bookkeeping (cloud.ts)
  return true;
}

type ReadStore = Pick<Storage, 'length' | 'key' | 'getItem'>;
type WriteStore = ReadStore & Pick<Storage, 'setItem' | 'removeItem'>;

/** Every save entry in the store. */
export function snapshot(store: ReadStore): SaveData {
  const d: SaveData = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k === null || !isSaveKey(k)) continue;
    const v = store.getItem(k);
    if (v !== null) d[k] = v;
  }
  return d;
}

/** The same JSON for the same save, whatever order the entries were read in. */
export function canonical(d: SaveData): string {
  const o: SaveData = {};
  for (const k of Object.keys(d).sort()) o[k] = d[k];
  return JSON.stringify(o);
}

/** A short fingerprint of a save (cyrb53: two 32-bit lanes, hex). */
export function saveHash(d: SaveData): string {
  const s = canonical(d);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function isEmptySave(d: SaveData): boolean {
  return Object.keys(d).length === 0;
}

/** Make the store hold exactly this save (other save entries removed; caches kept). */
export function applySave(store: WriteStore, d: SaveData): void {
  const old: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k !== null && isSaveKey(k) && !(k in d)) old.push(k);
  }
  for (const k of old) store.removeItem(k);
  for (const [k, v] of Object.entries(d)) if (isSaveKey(k)) store.setItem(k, v);
}

export type SyncPlan =
  /** device -> account ('first': the account had no save yet, the migration) */
  | { do: 'upload'; reason: 'first' | 'newer' }
  /** account -> device */
  | { do: 'download' }
  | { do: 'none' }
  /** both changed since they last agreed (or never have): the player picks */
  | { do: 'ask' };

/**
 * What to do when a device meets its account.
 * @param local this device's save
 * @param cloudHash the account's save fingerprint (null: no save in the account yet)
 * @param agreed the fingerprint this device and this account last agreed on (null: never)
 */
export function planSync(local: SaveData, cloudHash: string | null, agreed: string | null): SyncPlan {
  const empty = isEmptySave(local);
  const hash = saveHash(local);
  if (cloudHash === null) return empty ? { do: 'none' } : { do: 'upload', reason: 'first' };
  if (cloudHash === hash) return { do: 'none' };
  if (empty) return { do: 'download' };
  // the account has not moved since we last agreed: this device simply played on
  if (agreed === cloudHash) return { do: 'upload', reason: 'newer' };
  // this device has not moved since we last agreed: another device played on
  if (agreed === hash) return { do: 'download' };
  return { do: 'ask' };
}

/** A few recognisable numbers for "which copy do you want to keep?" */
export interface SaveSummary {
  items: number;
  flights: number;
  rankedMatches: number;
  rp: number | null;
}

export function summarize(d: SaveData): SaveSummary {
  const json = (k: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(d[k] ?? 'null') as unknown;
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const num = (o: Record<string, unknown> | null | undefined, k: string): number => (o && typeof o[k] === 'number' ? (o[k] as number) : 0);
  const log = json('triad.logbook.v1');
  const totals = (log?.totals ?? null) as Record<string, unknown> | null;
  const ranked = json('triad.ranked.v2');
  return {
    items: Object.keys(d).length,
    flights: num(totals, 'sorties'),
    rankedMatches: num(ranked, 'matches'),
    rp: ranked && typeof ranked.rp === 'number' ? (ranked.rp as number) : null,
  };
}
