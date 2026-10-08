// Multiplayer inside the claude.ai artifact.
//
// An artifact page cannot reach outside servers, but the page it runs in
// offers a live "room": everyone who has this artifact open right now (and
// was invited to it) can share presence and messages. Matches run on top of
// it (see roomLink.ts). This file is the thin layer over that runtime:
//   * the lobby: every open copy of the game says who it is and which room
//     it is in, so the room list and the owner's control panel can show it;
//   * the admin channel: a topic only the artifact's owner (and its
//     editors) can send on, enforced by the platform, so commands from it
//     are genuine; room locks and bans ride on the admin's own presence.

export type Json = unknown;

export interface RoomPeer {
  peer: string;
  by: string | null;
  isMe: boolean;
  sameTab: boolean;
  kind: string;
  guest: boolean;
  presence: Readonly<Record<string, Json>>;
  updatedAt: number;
}

export interface PeersChange {
  peers: readonly RoomPeer[];
  joined: readonly RoomPeer[];
  left: readonly RoomPeer[];
  updated: readonly RoomPeer[];
}

export interface RoomMsg {
  peer: string;
  by: string | null;
  isMe: boolean;
  sameTab: boolean;
  topic: string;
  data?: Json;
}

export interface RoomChannel {
  emit(topic: string, data?: Json): Promise<void>;
  on(topic: string, fn: (m: RoomMsg) => void, onError?: (e: { code: string; message: string }) => void): () => void;
  presence(patch: Record<string, Json | null>): Promise<void>;
  peers(): readonly RoomPeer[];
  onPeers(fn: (c: PeersChange) => void, onError?: (e: { code: string; message: string }) => void): () => void;
  connected(): boolean;
}

export interface NamedRoomChannel extends RoomChannel {
  readonly name: string;
  leave(): Promise<void>;
}

export interface LobbyRoom extends RoomChannel {
  join(name: string): Promise<NamedRoomChannel>;
}

interface UserApi {
  isOwner(): Promise<boolean>;
  canEdit(): Promise<boolean>;
  id(): Promise<string | null>;
}

interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

function runtime(): ClaudeRuntime | null {
  const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

/** Are we running inside a claude.ai artifact? */
export function inArtifact(): boolean {
  return !!runtime();
}

function use<T>(name: string): Promise<T | null> {
  const c = runtime();
  if (!c) return Promise.resolve(null);
  return Promise.race([
    c.use(name).then((x) => (x as T) ?? null, () => null),
    new Promise<null>((r) => setTimeout(() => r(null), 12000)),
  ]);
}

interface DownloadsApi {
  save(req: { filename: string; data: Blob | string | ArrayBuffer }): Promise<{ status: string }>;
}
let downloadsP: Promise<DownloadsApi | null> | null = null;

/**
 * Give the player a file. Inside a claude.ai artifact a page may not download
 * by itself: the viewer is asked to confirm the save. Anywhere else (the web
 * build, the Windows app) it is an ordinary download. Resolves true if saved.
 */
export async function saveFile(filename: string, data: Blob): Promise<boolean> {
  if (runtime()) {
    if (!downloadsP) downloadsP = use<DownloadsApi>('downloads');
    const dl = await downloadsP;
    if (dl) {
      try {
        await dl.save({ filename, data });
        return true;
      } catch (e) {
        // (the viewer said no: that is their answer, no fallback)
        if ((e as { code?: string })?.code === 'declined') return false;
      }
    }
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

let roomP: Promise<LobbyRoom | null> | null = null;
let userP: Promise<UserApi | null> | null = null;

/** The artifact's lobby room, or null where this view cannot connect. */
export function artifactRoom(): Promise<LobbyRoom | null> {
  if (!roomP) roomP = use<LobbyRoom>('room');
  return roomP;
}

let ownerP: Promise<boolean> | null = null;
/** Is the person looking at this page the artifact's owner? */
export function isArtifactOwner(): Promise<boolean> {
  if (!ownerP) {
    if (!userP) userP = use<UserApi>('user');
    ownerP = userP.then((u) => (u ? u.isOwner().catch(() => false) : false));
  }
  return ownerP;
}

// ------------------------------------------------------------------ rooms

export interface ArtifactRoomDef {
  id: string;
  name: string;
  map: 'jade' | 'triad' | 'frost';
}

/** The rooms of this artifact (the map decides which theater everyone flies). */
export const ARTIFACT_ROOMS: ArtifactRoomDef[] = [
  { id: 'room-1', name: 'ROOM 1', map: 'jade' },
  { id: 'room-2', name: 'ROOM 2', map: 'jade' },
  { id: 'room-3', name: 'ROOM 3', map: 'triad' },
  { id: 'room-4', name: 'ROOM 4', map: 'frost' },
  { id: 'room-5', name: 'ROOM 5', map: 'frost' },
];
export const ROOM_MAX = 12;
/** How a room is addressed where a server URL would go. */
export const ARTIFACT_URL = 'artifact:';

/** This page's pilot id (one per open copy of the game). */
export const MY_NET_ID = 1 + Math.floor(Math.random() * 2 ** 30);

// ------------------------------------------------------------------ lobby

/** What one open copy of the game says about itself in the lobby. */
export interface LobbyInfo {
  v: 1;
  id: number;
  /** callsign */
  n: string;
  /** jet */
  j: string;
  /** room id, or null in the menu */
  rm: string | null;
  /** the match state as this pilot sees it */
  ms?: string;
  /** directing its room's matches */
  host?: boolean;
  /** in the match, alive */
  im?: boolean;
  al?: boolean;
  /** kills, deaths */
  k?: number;
  d?: number;
  /** altitude (m), speed (m/s), heading (deg) */
  alt?: number;
  spd?: number;
  hdg?: number;
  /** ping (ms) */
  pg?: number;
  /** muted by the admin */
  mu?: boolean;
  /** what it is doing outside the rooms: 'menu' or a game mode */
  md?: string;
  /** admin only: locked rooms */
  lk?: string[];
}

export function lobbyInfo(p: RoomPeer): LobbyInfo | null {
  const pr = p.presence as Partial<LobbyInfo>;
  return pr && pr.v === 1 && typeof pr.id === 'number' && typeof pr.n === 'string' ? (pr as LobbyInfo) : null;
}

const mine: Partial<LobbyInfo> = { v: 1, id: MY_NET_ID, n: 'PILOT', j: 'F15EX', rm: null };

/** Update what this copy of the game tells the lobby. */
export function setLobby(patch: Partial<LobbyInfo>): void {
  Object.assign(mine, patch);
  void artifactRoom().then((r) => r?.presence(patch as Record<string, Json>).catch(() => {}));
}

// ------------------------------------------------------------------ admin

export interface AdminCmd {
  c: string;
  /** target pilot */
  id?: number;
  /** target room */
  rm?: string;
  text?: string;
  /** ban length (min); 0 = this session */
  min?: number;
}

const adminFns = new Set<(cmd: AdminCmd) => void>();
let adminPeer = '';
let adminWired = false;

function wireAdmin(): void {
  if (adminWired) return;
  adminWired = true;
  void artifactRoom().then((r) => {
    if (!r) return;
    // only the owner and editors may send here: the platform drops anyone else's
    r.on('admin', (m) => {
      adminPeer = m.peer;
      const d = m.data as AdminCmd | undefined;
      if (!d || typeof d.c !== 'string') return;
      // an unban names the pilot's account: lift it if that is us
      if (d.c === 'unban' && d.text) void myAccount().then((me) => me && me === d.text && clearLocalBan());
      for (const f of adminFns) f(d);
    });
  });
}

/** Listen for the admin's commands. */
export function onAdmin(fn: (cmd: AdminCmd) => void): () => void {
  wireAdmin();
  adminFns.add(fn);
  return () => adminFns.delete(fn);
}

/** The admin's word for everyone (rejects for anyone who is not an admin). */
export async function sendAdmin(cmd: AdminCmd): Promise<void> {
  const r = await artifactRoom();
  if (!r) throw new Error('not connected');
  await r.emit('admin', cmd as unknown as Json);
}

/** Rooms the admin has locked (read from the admin's own presence only). */
export function lockedRooms(): string[] {
  const r = roomNow;
  if (!r || !adminPeer) return [];
  const p = r.peers().find((x) => x.peer === adminPeer);
  const lk = p ? (p.presence as { lk?: unknown }).lk : null;
  return Array.isArray(lk) ? lk.filter((x): x is string => typeof x === 'string') : [];
}

let roomNow: LobbyRoom | null = null;
void Promise.resolve().then(() => {
  if (!inArtifact()) return;
  void artifactRoom().then((r) => {
    roomNow = r;
    if (r) {
      wireAdmin();
      void r.presence(mine as Record<string, Json>).catch(() => {});
    }
  });
});

/** This viewer's opaque account id (what the room calls `by`). */
function myAccount(): Promise<string | null> {
  if (!userP) userP = use<UserApi>('user');
  return userP.then((u) => (u ? u.id().catch(() => null) : null));
}

function clearLocalBan(): void {
  sessionBan = null;
  try {
    localStorage.removeItem(BAN_KEY);
  } catch {
    /* storage unavailable */
  }
}

// a ban the admin handed this copy of the game
const BAN_KEY = 'triad.mp.ban';
export function localBan(): { until: number; reason: string } | null {
  try {
    const b = JSON.parse(localStorage.getItem(BAN_KEY) ?? 'null') as { until: number; reason: string } | null;
    if (b && (b.until === 0 || b.until > Date.now())) return b;
  } catch {
    /* storage unavailable */
  }
  return sessionBan;
}
let sessionBan: { until: number; reason: string } | null = null;
export function setLocalBan(min: number, reason: string): void {
  const b = { until: min > 0 ? Date.now() + min * 60000 : 0, reason };
  sessionBan = b;
  if (min <= 0) return;
  try {
    localStorage.setItem(BAN_KEY, JSON.stringify(b));
  } catch {
    /* storage unavailable: it lasts this session */
  }
}
