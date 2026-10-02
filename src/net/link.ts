// What the online mode needs from a connection: a TRIAD server over a
// WebSocket (NetClient) or a room inside the claude.ai artifact (RoomLink).

import type { NetPlayer, RoomInfo, ServerMsg } from './client';

export interface NetLink {
  /** our player id in the room */
  id: number;
  /** our callsign as the room has it */
  name: string;
  room: RoomInfo | null;
  players: NetPlayer[];
  /** round-trip time (ms), smoothed; 0 when unknown */
  rtt: number;
  onMessage: ((m: ServerMsg) => void) | null;
  onClose: ((reason: string) => void) | null;
  send(m: object): void;
  /** call every frame */
  tick(dt: number): void;
  close(): void;
}
