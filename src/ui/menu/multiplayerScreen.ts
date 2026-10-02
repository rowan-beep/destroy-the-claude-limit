// MULTIPLAYER: the server browser. The official servers (OFFICIAL 1-5) with
// live pilot counts, any other server by address, and how to host your own.

import { el, clearEl, button } from '../dom';
import { NetClient, RoomInfo, fetchRooms, normalizeServerUrl } from '../../net/client';
import { OFFICIAL_SERVER, loadNetPrefs, saveNetPrefs } from '../../net/servers';
import { SPECS, AircraftType } from '../../aircraft/specs';
import { MAPS } from '../../world/islands';
import type { PaintConfig } from '../../aircraft/models/paint';
import { inArtifact, artifactRoom, ARTIFACT_ROOMS, ARTIFACT_URL, ROOM_MAX, lobbyInfo, lockedRooms, isArtifactOwner } from '../../net/artifact';

export interface JoinRequest {
  url: string;
  room: string;
  map: string;
  callsign: string;
}

export class MultiplayerScreen {
  readonly root: HTMLDivElement;
  private body: HTMLElement;
  private list!: HTMLElement;
  private status!: HTMLElement;
  private callsign!: HTMLInputElement;
  private custom!: HTMLInputElement;
  private timer = 0;
  private busy = false;
  jet: AircraftType = 'F15EX';
  /** set by the shell: open the owner's control panel */
  onAdmin: (() => void) | null = null;
  /** inside the claude.ai artifact: rooms run in the artifact itself */
  private readonly artifact = inArtifact();

  constructor(
    parent: HTMLElement,
    private onJoin: (j: JoinRequest) => Promise<void>,
  ) {
    this.root = el('div', 'modal-back hidden', parent);
    const m = el('div', 'modal mp-modal', this.root);
    const head = el('div', 'modal-head', m);
    el('h2', '', head, 'MULTIPLAYER');
    button('CLOSE', '', head, () => this.show(false));
    this.body = el('div', 'modal-body', m);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.show(false);
    });
    this.build();
  }

  private build(): void {
    const b = this.body;
    clearEl(b);
    const prefs = loadNetPrefs();
    el('div', 'note', b, 'LAST PILOT STANDING against real pilots: free-for-all, no AI on any server. Between matches you fly with weapons on hold; a match starts as soon as two pilots are in.');
    const row = el('div', 'mp-row', b);
    const f = el('div', 'field', row);
    el('label', '', f, 'YOUR CALLSIGN');
    this.callsign = el('input', 'mp-input', f);
    this.callsign.maxLength = 16;
    this.callsign.placeholder = 'e.g. MAVERICK';
    this.callsign.value = prefs.callsign;
    const jf = el('div', 'field', row);
    el('label', '', jf, 'YOUR JET');
    el('div', 'mp-jet', jf, `${SPECS[this.jet].shortName.toUpperCase()} — pick it in the hangar`);

    if (this.artifact) {
      const h = el('h3', '', b, 'ROOMS');
      void isArtifactOwner().then((own) => {
        if (own) button('SERVER CONTROL', 'small mp-admin', h, () => this.onAdmin?.());
      });
      this.list = el('div', 'mp-list', b);
    this.rows.clear();
      this.status = el('div', 'note mp-status', b, '');
      el(
        'div',
        'note',
        b,
        'Rooms run right here inside this page, no server needed. Friends join from this same link: they need to be signed in to Claude and invited to it (the owner shares it with them from the Share menu). Someone opening a public link cannot join a room.',
      );
      return;
    }
    el('h3', '', b, 'OFFICIAL SERVERS');
    this.list = el('div', 'mp-list', b);
    this.rows.clear();
    this.status = el('div', 'note mp-status', b, '');

    el('h3', '', b, 'JOIN A SERVER BY ADDRESS');
    const cr = el('div', 'mp-row', b);
    this.custom = el('input', 'mp-input wide', cr);
    this.custom.placeholder = 'wss://my-server.example.com   or   192.168.1.20:8080';
    this.custom.value = prefs.custom;
    button('JOIN', 'primary', cr, () => void this.joinCustom());

    el('h3', '', b, 'HOST YOUR OWN');
    el(
      'div',
      'note',
      b,
      'Get the game from GitHub, then: "cd server && npm install && npm start" (options: --name "MY SERVER" --map triad|frost --port 8080). Friends join with your address. Over the internet the server needs a secure (wss://) address, e.g. behind a free Cloudflare Tunnel or on Render; on your own network a plain IP:port works from the offline build.',
    );
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    clearInterval(this.timer);
    if (!on) return;
    this.build();
    void this.refresh();
    this.timer = window.setInterval(() => void this.refresh(), this.artifact ? 1500 : 6000);
  }

  private prefs(): { callsign: string; ok: boolean } {
    const callsign = this.callsign.value.replace(/[^\w \-.#]/g, '').trim().slice(0, 16).toUpperCase();
    saveNetPrefs({ callsign, custom: this.custom ? this.custom.value.trim() : loadNetPrefs().custom });
    if (!callsign) {
      this.status.textContent = 'ENTER A CALLSIGN FIRST';
      this.callsign.focus();
    }
    return { callsign, ok: !!callsign };
  }

  private refreshing = false;
  private failures = 0;

  /** Inside the artifact: the rooms, with who is in them (from the lobby). */
  private async refreshArtifact(): Promise<void> {
    const r = await artifactRoom();
    if (!r) {
      for (const d of ARTIFACT_ROOMS) this.row({ id: d.id, name: d.name, map: d.map, official: false, players: 0, max: ROOM_MAX, state: 'offline' }, ARTIFACT_URL + d.id, true);
      if (!this.busy) this.status.textContent = 'THIS COPY CANNOT JOIN ROOMS: SIGN IN TO CLAUDE AND ASK THE OWNER TO INVITE YOU (A PUBLIC LINK CANNOT CONNECT).';
      return;
    }
    const locked = lockedRooms();
    const peers = r.peers().map((p) => lobbyInfo(p)).filter((x) => !!x);
    for (const d of ARTIFACT_ROOMS) {
      const here = peers.filter((p) => p!.rm === d.id);
      const host = here.find((p) => p!.host);
      const state = locked.includes(d.id) ? 'locked' : (host?.ms ?? here[0]?.ms ?? 'waiting');
      this.row({ id: d.id, name: d.name, map: d.map, official: false, players: here.length, max: ROOM_MAX, state }, ARTIFACT_URL + d.id, false);
    }
    if (!this.busy && !this.status.textContent?.startsWith('DISCONNECTED') && !this.status.textContent?.startsWith('COULD NOT')) this.status.textContent = '';
  }

  private async refresh(): Promise<void> {
    if (this.artifact) return this.refreshArtifact();
    if (this.refreshing) return;
    this.refreshing = true;
    let rooms: RoomInfo[];
    try {
      // a sleeping server answers once it is up: give it time
      rooms = await fetchRooms(OFFICIAL_SERVER, 12000);
    } catch {
      this.refreshing = false;
      this.failures++;
      // they sleep when nobody is on; a minute of trying wakes them
      const waking = this.failures <= 12;
      for (let i = 1; i <= 5; i++) this.row({ id: `official-${i}`, name: `OFFICIAL ${i}`, map: i <= 3 ? 'triad' : 'frost', official: true, players: 0, max: 12, state: waking ? 'waking' : 'offline' }, OFFICIAL_SERVER, true);
      if (!this.busy)
        this.status.textContent = waking
          ? 'WAKING UP THE OFFICIAL SERVERS (THEY SLEEP WHEN NOBODY IS ON). THIS TAKES UP TO A MINUTE…'
          : 'OFFICIAL SERVERS UNREACHABLE RIGHT NOW — TRY AGAIN SOON, OR JOIN A SERVER BY ADDRESS.';
      return;
    }
    this.refreshing = false;
    this.failures = 0;
    for (const r of rooms) this.row(r, OFFICIAL_SERVER, false);
    if (!this.busy) this.status.textContent = '';
  }

  /** One row per room, made once and then updated in place (a rebuilt row could swallow a click on JOIN). */
  private rows = new Map<string, { c: HTMLElement; count: HTMLElement; state: HTMLElement; btn: HTMLButtonElement; url: string; map: string }>();

  private row(r: RoomInfo, url: string, offline: boolean): void {
    const key = `${url}|${r.id}`;
    let row = this.rows.get(key);
    if (!row || !row.c.isConnected) {
      const map = MAPS.find((m) => m.id === r.map);
      const c = el('div', 'mp-server', this.list);
      el('div', 'mp-name', c, r.name);
      el('div', 'mp-map', c, map ? map.name : r.map.toUpperCase());
      const count = el('div', 'mp-count', c);
      const state = el('div', 'mp-state', c);
      const entry = { c, count, state, btn: null as unknown as HTMLButtonElement, url, map: r.map };
      entry.btn = button('JOIN', 'small', c, () => void this.join(entry.url, r.id, entry.map));
      row = entry;
      this.rows.set(key, row);
    }
    row.map = r.map;
    row.c.classList.toggle('off', offline);
    row.count.textContent = offline ? (r.state === 'waking' ? 'WAKING UP…' : 'OFFLINE') : `${r.players} / ${r.max}`;
    row.state.textContent = offline ? '' : r.state === 'live' ? 'MATCH ON' : r.state === 'countdown' ? 'STARTING' : r.state === 'ended' ? 'RESULTS' : r.state === 'locked' ? 'LOCKED' : 'WAITING';
    row.btn.disabled = offline || r.players >= r.max || r.state === 'locked';
  }


  private async joinCustom(): Promise<void> {
    const url = normalizeServerUrl(this.custom.value);
    if (!url) {
      this.status.textContent = 'TYPE A SERVER ADDRESS';
      return;
    }
    let rooms: RoomInfo[] = [];
    try {
      rooms = await fetchRooms(url);
    } catch {
      /* fall back to joining blind */
    }
    const r = rooms[0];
    await this.join(url, r ? r.id : '', r ? r.map : '');
  }

  private async join(url: string, room: string, map: string): Promise<void> {
    if (this.busy) return;
    const p = this.prefs();
    if (!p.ok) return;
    this.busy = true;
    this.status.textContent = 'CONNECTING…';
    clearInterval(this.timer);
    try {
      await this.onJoin({ url, room, map, callsign: p.callsign });
    } catch (e) {
      this.status.textContent = `COULD NOT JOIN: ${(e as Error).message}`;
    } finally {
      this.busy = false;
    }
  }

  setStatus(s: string): void {
    this.status.textContent = s;
  }
}

/** Connect to a server and join a room; the caller then starts the mission. */
export async function connectTo(url: string, room: string, callsign: string, jet: AircraftType, paint: PaintConfig | null): Promise<NetClient> {
  const net = new NetClient(url);
  await net.connect({ name: callsign, jet, paint, room: room || undefined });
  return net;
}
