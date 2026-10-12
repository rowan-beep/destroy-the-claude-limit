// Where the official servers live, and the player's saved multiplayer settings.
//
// The official servers (OFFICIAL 1-5) are the rooms of one server process
// started with `node server/server.mjs --official` (see render.yaml / the
// README). Point OFFICIAL_SERVER at wherever that is deployed; a build can
// override it with the VITE_TRIAD_SERVER environment variable. A path such as
// "/api" means the same host as the page (the Vercel deployment, vercel.json).

import { inArtifact } from './artifact';

/**
 * Is multiplayer offered in this copy? Only inside the claude.ai artifact (its own
 * live rooms): it was taken off the website and the Windows app in 7.12.0, where the
 * game server dropped every connection after five minutes. The servers and the
 * code stay, switched off.
 */
export function multiplayerOn(): boolean {
  return inArtifact();
}

function serverUrl(s: string): string {
  if (!s.startsWith('/') || typeof location === 'undefined') return s;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + s.replace(/\/+$/, '');
}

export const OFFICIAL_SERVER: string = serverUrl(import.meta.env?.VITE_TRIAD_SERVER || 'wss://triad-servers.onrender.com');

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

/** The same join, for the URL (where storage is blocked, e.g. inside the artifact). */
export function pendingJoinHash(j: PendingJoin): string {
  return `join=${encodeURIComponent(`${j.url}|${j.room}`)}`;
}

export function takePendingJoin(): PendingJoin | null {
  try {
    const s = sessionStorage.getItem(JOIN_KEY);
    sessionStorage.removeItem(JOIN_KEY);
    if (s) return JSON.parse(s) as PendingJoin;
  } catch {
    /* storage unavailable: try the URL */
  }
  try {
    const m = /[#&]join=([^&]+)/.exec(location.hash);
    if (!m) return null;
    const [url, room] = decodeURIComponent(m[1]).split('|');
    history.replaceState(null, '', location.href.replace(/[&]?join=[^&]+/, ''));
    return url ? { url, room: room ?? '' } : null;
  } catch {
    return null;
  }
}
