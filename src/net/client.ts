// Multiplayer connection to a TRIAD game server (server/server.mjs).
//
// JSON messages over one WebSocket. Every client flies its own jet and
// simulates its own weapons; the server relays state and events to the rest
// of the room, forwards hits to the pilot who was hit and runs the match.

import type { AircraftType } from '../aircraft/specs';
import type { PaintConfig } from '../aircraft/models/paint';

export const PROTOCOL = 1;

export interface NetPlayer {
  id: number;
  name: string;
  jet: AircraftType;
  paint: PaintConfig | null;
  inMatch: boolean;
  alive: boolean;
  kills: number;
}

export interface RoomInfo {
  id: string;
  name: string;
  map: string;
  official: boolean;
  players: number;
  max: number;
  state: string;
}

export interface MatchResult {
  id: number;
  name: string;
  jet: AircraftType;
  place: number;
  kills: number;
  killedBy: string;
}

export interface MatchMsg {
  t: 'match';
  state: 'waiting' | 'countdown' | 'live' | 'ended';
  timer: number;
  matchId: number;
  slots?: Record<string, { angle: number; ring: number; tier: number }>;
  elapsed?: number;
  dropin?: number;
  results?: MatchResult[];
}

export interface ZoneMsg {
  t: 'zone';
  x: number;
  z: number;
  r: number;
  nx: number;
  nz: number;
  nr: number;
  phase: 'hold' | 'shrink';
  stage: number;
  last: boolean;
  left: number;
  die: number;
  reveal: boolean;
}

/** A message from the server (loosely typed: fields are checked where used). */
export type ServerMsg =
  | MatchMsg
  | ZoneMsg
  | { t: 'welcome'; id: number; room: RoomInfo; players: NetPlayer[] }
  | { t: 'join'; p: NetPlayer }
  | { t: 'leave'; id: number }
  | { t: 's'; id: number; d: number[] }
  | { t: 'ev'; id: number; e: Record<string, unknown> }
  | { t: 'hit'; from: number; h: Record<string, unknown> }
  | { t: 'dead'; id: number; killer: number | null; weapon: string; cause: string; place: number; left: number }
  | { t: 'chat'; id: number; text: string }
  | { t: 'pong'; c: number }
  | { t: 'sys'; text: string }
  | { t: 'smite'; text?: string }
  | { t: 'error'; reason: string };

export interface Hello {
  name: string;
  jet: AircraftType;
  paint: PaintConfig | null;
  room?: string;
}

/** ws:// or wss:// URL from what the player typed ("host:port", "https://..."). */
export function normalizeServerUrl(s: string): string {
  let u = s.trim();
  if (!u) return '';
  if (u.startsWith('https://')) u = 'wss://' + u.slice(8);
  else if (u.startsWith('http://')) u = 'ws://' + u.slice(7);
  else if (!/^wss?:\/\//.test(u)) {
    // bare host: local addresses are plain ws, anything else secure
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u);
    u = (local ? 'ws://' : 'wss://') + u;
  }
  return u.replace(/\/+$/, '');
}

/** The HTTP status URL of a server (room list). */
export function statusUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws/, 'http') + '/status';
}

export class NetClient {
  private ws: WebSocket | null = null;
  id = 0;
  /** our callsign as the server has it */
  name = '';
  room: RoomInfo | null = null;
  players: NetPlayer[] = [];
  /** round-trip time (ms), smoothed */
  rtt = 0;
  private pingT = 0;
  onMessage: ((m: ServerMsg) => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  private closedByUs = false;
  /** the last error the server sent (a kick or ban says why before it hangs up) */
  private lastError = '';

  constructor(readonly url: string) {}

  get open(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /** Connect and join a room; resolves with the welcome, rejects with a reason. */
  connect(hello: Hello, timeoutMs = 8000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (reason: string) => {
        if (settled) return;
        settled = true;
        try {
          this.ws?.close();
        } catch {
          /* ignore */
        }
        reject(new Error(reason));
      };
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch {
        fail('BAD SERVER ADDRESS');
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => fail('NO ANSWER FROM THE SERVER'), timeoutMs);
      this.name = hello.name;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', protocol: PROTOCOL, ...hello }));
      ws.onerror = () => fail('COULD NOT CONNECT');
      ws.onclose = () => {
        clearTimeout(timer);
        if (!settled) fail('CONNECTION REFUSED');
        else if (!this.closedByUs) this.onClose?.(this.lastError || 'CONNECTION TO THE SERVER LOST');
      };
      ws.onmessage = (ev) => {
        let m: ServerMsg;
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (!settled) {
          if (m.t === 'error') {
            fail(m.reason);
            return;
          }
          if (m.t === 'welcome') {
            settled = true;
            clearTimeout(timer);
            this.id = m.id;
            this.room = m.room;
            this.players = m.players;
            resolve();
            return;
          }
        }
        if (m.t === 'error') this.lastError = m.reason;
        if (m.t === 'pong') {
          const r = performance.now() - m.c;
          // (a sample taken while the page was busy loading says nothing about the network)
          if (r < 2500) this.rtt = this.rtt ? this.rtt * 0.8 + r * 0.2 : r;
          return;
        }
        this.onMessage?.(m);
      };
    });
  }

  send(m: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Call every frame: keeps the ping estimate fresh. */
  tick(dt: number): void {
    this.pingT -= dt;
    if (this.pingT <= 0) {
      this.pingT = 2;
      this.send({ t: 'ping', c: performance.now() });
    }
  }

  close(): void {
    this.closedByUs = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }
}

/** Ask a server for its rooms (HTTP /status). */
export async function fetchRooms(wsUrl: string, timeoutMs = 4000): Promise<RoomInfo[]> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(statusUrl(wsUrl), { signal: ctl.signal });
    const j = (await r.json()) as { game?: string; rooms?: RoomInfo[] };
    if (j.game !== 'TRIAD' || !Array.isArray(j.rooms)) throw new Error('not a TRIAD server');
    return j.rooms;
  } finally {
    clearTimeout(t);
  }
}
