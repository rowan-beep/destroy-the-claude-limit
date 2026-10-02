// MULTIPLAYER: the server browser. The official servers (OFFICIAL 1-5) with
// live pilot counts, any other server by address, and how to host your own.

import { el, clearEl, button } from '../dom';
import { NetClient, RoomInfo, fetchRooms, normalizeServerUrl } from '../../net/client';
import { OFFICIAL_SERVER, loadNetPrefs, saveNetPrefs } from '../../net/servers';
import { SPECS, AircraftType } from '../../aircraft/specs';
import { MAPS } from '../../world/islands';
import type { PaintConfig } from '../../aircraft/models/paint';

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

    el('h3', '', b, 'OFFICIAL SERVERS');
    this.list = el('div', 'mp-list', b);
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
    this.timer = window.setInterval(() => void this.refresh(), 6000);
  }

  private prefs(): { callsign: string; ok: boolean } {
    const callsign = this.callsign.value.replace(/[^\w \-.#]/g, '').trim().slice(0, 16).toUpperCase();
    saveNetPrefs({ callsign, custom: this.custom.value.trim() });
    if (!callsign) {
      this.status.textContent = 'ENTER A CALLSIGN FIRST';
      this.callsign.focus();
    }
    return { callsign, ok: !!callsign };
  }

  private refreshing = false;
  private failures = 0;

  private async refresh(): Promise<void> {
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
      clearEl(this.list);
      for (let i = 1; i <= 5; i++) this.row({ id: `official-${i}`, name: `OFFICIAL ${i}`, map: i <= 3 ? 'triad' : 'frost', official: true, players: 0, max: 12, state: waking ? 'waking' : 'offline' }, OFFICIAL_SERVER, true);
      if (!this.busy)
        this.status.textContent = waking
          ? 'WAKING UP THE OFFICIAL SERVERS (THEY SLEEP WHEN NOBODY IS ON). THIS TAKES UP TO A MINUTE…'
          : 'OFFICIAL SERVERS UNREACHABLE RIGHT NOW — TRY AGAIN SOON, OR JOIN A SERVER BY ADDRESS.';
      return;
    }
    this.refreshing = false;
    this.failures = 0;
    clearEl(this.list);
    for (const r of rooms) this.row(r, OFFICIAL_SERVER, false);
    if (!this.busy) this.status.textContent = '';
  }

  private row(r: RoomInfo, url: string, offline: boolean): void {
    const map = MAPS.find((m) => m.id === r.map);
    const c = el('div', 'mp-server' + (offline ? ' off' : ''), this.list);
    el('div', 'mp-name', c, r.name);
    el('div', 'mp-map', c, map ? map.name : r.map.toUpperCase());
    el('div', 'mp-count', c, offline ? (r.state === 'waking' ? 'WAKING UP…' : 'OFFLINE') : `${r.players} / ${r.max}`);
    el('div', 'mp-state', c, offline ? '' : r.state === 'live' ? 'MATCH ON' : r.state === 'countdown' ? 'STARTING' : r.state === 'ended' ? 'RESULTS' : 'WAITING');
    const b = button('JOIN', 'small', c, () => void this.join(url, r.id, r.map));
    b.disabled = offline || r.players >= r.max;
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
