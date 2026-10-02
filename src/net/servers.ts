// Where the official servers live, and the player's saved multiplayer settings.
//
// The official servers (OFFICIAL 1-5) are the rooms of one server process
// started with `node server/server.mjs --official` (see render.yaml / the
// README). Point OFFICIAL_SERVER at wherever that is deployed; a build can
// override it with the VITE_TRIAD_SERVER environment variable.

const ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;

export const OFFICIAL_SERVER: string = ENV?.VITE_TRIAD_SERVER || 'wss://triad-servers.onrender.com';

/**
 * The official servers sleep when nobody has been on for a while and take
 * up to a minute to wake. Knock once at start-up so they are usually awake
 * by the time anyone opens the server list.
 */
export function wakeOfficialServers(): void {
  try {
    void fetch(OFFICIAL_SERVER.replace(/^ws/, 'http') + '/status', { cache: 'no-store' }).catch(() => {});
  } catch {
    /* offline */
  }
}

export interface NetPrefs {
  callsign: string;
  custom: string;
}

const KEY = 'triad.net.v1';

export function loadNetPrefs(): NetPrefs {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<NetPrefs>;
    return { callsign: j.callsign ?? '', custom: j.custom ?? '' };
  } catch {
    return { callsign: '', custom: '' };
  }
}

export function saveNetPrefs(p: NetPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

/** A join that survives the page reload needed to switch to the server's map. */
export interface PendingJoin {
  url: string;
  room: string;
}

const JOIN_KEY = 'triad.net.autojoin';

export function setPendingJoin(j: PendingJoin | null): void {
  try {
    if (j) sessionStorage.setItem(JOIN_KEY, JSON.stringify(j));
    else sessionStorage.removeItem(JOIN_KEY);
  } catch {
    /* ignore */
  }
}

export function takePendingJoin(): PendingJoin | null {
  try {
    const s = sessionStorage.getItem(JOIN_KEY);
    sessionStorage.removeItem(JOIN_KEY);
    return s ? (JSON.parse(s) as PendingJoin) : null;
  } catch {
    return null;
  }
}
