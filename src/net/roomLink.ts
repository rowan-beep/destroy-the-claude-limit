// A multiplayer room inside the claude.ai artifact, standing in for the
// game server: it speaks the same messages to the online mode as NetClient.
//
// Everything travels on presence (each pilot's own little shared object,
// which every invited viewer may set): the jet's state, its missiles in
// flight, and a short outbox of recent one-off events (launches, hits,
// deaths, chat), each numbered so nobody acts on one twice. One pilot's
// browser directs the matches (director.ts) and publishes the match state;
// when it leaves, the next pilot carries on from the last snapshot.

import type { Hello, NetPlayer, RoomInfo, ServerMsg } from './client';
import type { NetLink } from './link';
import type { AircraftType } from '../aircraft/specs';
import type { PaintConfig } from '../aircraft/models/paint';
import { Director, Hd, DeadMsg, DROPIN, zoneFromHd } from './director';
import {
  artifactRoom,
  ArtifactRoomDef,
  NamedRoomChannel,
  RoomPeer,
  PeersChange,
  Json,
  MY_NET_ID,
  ROOM_MAX,
  setLobby,
  onAdmin,
  AdminCmd,
  localBan,
  setLocalBan,
  lockedRooms,
} from './artifact';

/** how long an event stays in the outbox (ms) */
const OUTBOX_MS = 2500;
/** presence must stay under 4 KiB */
const PRESENCE_BUDGET = 3800;
/** how long a newcomer listens before deciding who directs the room */
const SETTLE_MS = 1800;

// (a peer's presence arrives as a fresh copy whenever any of it changes,
// so each part carries its own counter: sq the jet, mq its missiles, hq
// the match state)
interface Known {
  peer: string;
  id: number;
  p: NetPlayer;
  lastSeq: number;
  lastS: number;
  lastMs: number;
  lastHd: number;
  lastAk: number;
  lastPg: unknown;
  /** it says it directs the room */
  hosting: boolean;
  /** its tab is in front (a hidden tab's timers crawl: it should not direct) */
  vis: boolean;
  /** its standing "I am down" report: [matchId, killer, weapon, cause] */
  dn: unknown;
  /** when we last heard from it (ms) */
  seen: number;
}

type Out = { seq: number; t: number; p: Record<string, Json> };

/** seconds between heartbeats in our presence */
const HEARTBEAT_S = 4;
/** silent this long (ms) and a pilot is treated as gone */
const GHOST_MS = 15000;

export class RoomLink implements NetLink {
  id = MY_NET_ID;
  name = '';
  room: RoomInfo | null = null;
  players: NetPlayer[] = [];
  rtt = 0;
  onClose: ((reason: string) => void) | null = null;

  private handler: ((m: ServerMsg) => void) | null = null;
  private queue: ServerMsg[] = [];
  private ch: NamedRoomChannel | null = null;
  private unsubs: (() => void)[] = [];
  private mine: Record<string, Json> = {};
  private seq = 0;
  private outbox: Out[] = [];
  private known = new Map<string, Known>();
  private myPeer = '';
  private settled = false;
  private hostPeer: string | null = null;
  private director: Director | null = null;
  private dirTimer = 0;
  private dirLast = 0;
  private hdPublishT = 0;
  private lastHd: Hd | null = null;
  private hdAt = 0;
  private matchKey = '';
  private acks: Record<string, number> = {};
  private ackDirty = false;
  private pingSeq = 0;
  private pingAt = 0;
  private pingT = 1;
  private lobbyT = 0;
  /** heartbeat: a pilot who has gone quiet (closed tab, dropped link) is dropped, never left as a ghost */
  private hbN = 0;
  private sweepT = 1;
  private pruneT = 0;
  private muted = new Set<number>();
  private closed = false;
  private jet: AircraftType = 'F15EX';
  private paint: PaintConfig | null = null;
  private lastState: number[] | null = null;
  /** deaths already told to the online mode ("matchId:id") */
  private deadSeen = new Set<string>();
  private hiddenFor = 0;
  private reconcileT = 0;
  private onVis = () => this.setPresence({ vis: !document.hidden });
  private sq = 0;
  private mq = 0;
  private hq = 0;
  private deaths = 0;

  constructor(readonly def: ArtifactRoomDef) {}

  get onMessage(): ((m: ServerMsg) => void) | null {
    return this.handler;
  }
  /** messages that arrive before the mode is listening wait for it */
  set onMessage(fn: ((m: ServerMsg) => void) | null) {
    this.handler = null;
    if (!fn) return;
    // once the mode has finished starting (and spawned our jet), as a
    // server's messages would arrive: a match already on then makes us watch
    setTimeout(() => {
      if (this.closed) return;
      const q = this.queue;
      this.queue = [];
      for (const m of q) fn(m);
      this.handler = fn;
      const more = this.queue;
      this.queue = [];
      for (const m of more) fn(m);
    }, 0);
  }

  private deliver(m: ServerMsg): void {
    if (this.handler) this.handler(m);
    else if (this.queue.length < 400) this.queue.push(m);
  }

  // ------------------------------------------------------------ joining

  async connect(hello: Hello): Promise<void> {
    const ban = localBan();
    if (ban) throw new Error(`BANNED FROM MULTIPLAYER${ban.reason ? ': ' + ban.reason : ''}`);
    if (lockedRooms().includes(this.def.id)) throw new Error('THIS ROOM IS LOCKED');
    const lobby = await artifactRoom();
    if (!lobby) throw new Error('THIS COPY CANNOT CONNECT: SIGN IN TO CLAUDE AND ASK THE OWNER TO INVITE YOU');
    this.name = hello.name;
    this.jet = hello.jet;
    this.paint = hello.paint;
    let ch: NamedRoomChannel;
    try {
      ch = await lobby.join(this.def.id);
    } catch (e) {
      const code = (e as { code?: string }).code;
      throw new Error(code === 'not_permitted' ? 'THIS VIEW CANNOT JOIN ROOMS: ASK THE OWNER TO INVITE YOU' : 'COULD NOT JOIN THE ROOM, TRY AGAIN');
    }
    this.ch = ch;
    const paint = this.paint && JSON.stringify(this.paint).length < 600 ? this.paint : null;
    this.setPresence({ v: 1, id: this.id, n: this.name, j: this.jet, pt: paint as Json, vis: !document.hidden });
    document.addEventListener('visibilitychange', this.onVis);
    this.unsubs.push(() => document.removeEventListener('visibilitychange', this.onVis));
    this.unsubs.push(ch.onPeers((c) => this.onPeers(c)));
    this.unsubs.push(onAdmin((cmd) => this.onAdmin(cmd)));
    // listen a moment: who is here, and is a match on?
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    if (this.closed) throw new Error('LEFT');
    const others = [...this.known.values()];
    if (others.length >= ROOM_MAX) {
      this.close();
      throw new Error('ROOM FULL');
    }
    this.settled = true;
    // on a timer, not the frame loop: a background tab draws no frames but must not look gone
    const hb = window.setInterval(() => this.setPresence({ hb: ++this.hbN }), HEARTBEAT_S * 1000);
    this.unsubs.push(() => clearInterval(hb));
    this.players = [this.me(), ...others.map((k) => k.p)];
    this.room = { id: this.def.id, name: this.def.name, map: this.def.map, official: false, players: this.players.length, max: ROOM_MAX, state: this.lastHd?.st ?? 'waiting' };
    this.electHost();
    this.publishLobby();
  }

  private me(): NetPlayer {
    return { id: this.id, name: this.name, jet: this.jet, paint: this.paint, inMatch: false, alive: false, kills: 0 };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    clearInterval(this.dirTimer);
    this.director = null;
    void this.ch?.leave().catch(() => {});
    this.ch = null;
    setLobby({ rm: null, host: false, ms: undefined, im: false, al: false });
  }

  private kicked(reason: string): void {
    this.close();
    this.onClose?.(reason);
  }

  // ------------------------------------------------------------ sending

  private setPresence(patch: Record<string, Json | null>): void {
    if (!this.ch) return;
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete this.mine[k];
      else this.mine[k] = v;
    }
    // stay under the size limit: the paint goes first, then the oldest events
    let size = JSON.stringify(this.mine).length;
    if (size > PRESENCE_BUDGET && this.mine.pt) {
      delete this.mine.pt;
      patch.pt = null;
      size = JSON.stringify(this.mine).length;
    }
    while (size > PRESENCE_BUDGET && this.outbox.length > 1) {
      this.outbox.shift();
      this.mine.ob = this.outbox.map((o) => [o.seq, o.p]);
      patch.ob = this.mine.ob;
      size = JSON.stringify(this.mine).length;
    }
    void this.ch.presence(patch).catch(() => {});
  }

  private post(p: Record<string, Json>): void {
    this.outbox.push({ seq: ++this.seq, t: performance.now(), p });
    this.pruneOutbox();
    this.setPresence({ ob: this.outbox.map((o) => [o.seq, o.p]) });
  }

  private pruneOutbox(): boolean {
    const t = performance.now() - OUTBOX_MS;
    const n = this.outbox.length;
    while (this.outbox.length && this.outbox[0].t < t) this.outbox.shift();
    return this.outbox.length !== n;
  }

  send(m: object): void {
    if (this.closed) return;
    const msg = m as Record<string, unknown>;
    switch (msg.t) {
      case 's':
        this.lastState = msg.d as number[];
        this.setPresence({ s: msg.d as Json, sq: ++this.sq });
        break;
      case 'ev': {
        const e = msg.e as Record<string, unknown>;
        if (e.k === 'ms') {
          this.setPresence({ ms: e.l as Json, mq: ++this.mq });
          break;
        }
        if (e.k === 'spawn') {
          this.jet = e.jet as AircraftType;
          this.setPresence({ j: this.jet, ms: null, mq: ++this.mq });
        }
        this.post({ k: 'ev', e: e as Json });
        break;
      }
      case 'hit':
        this.post({ k: 'hit', to: msg.to as Json, h: msg.h as Json });
        break;
      case 'dead':
        this.deaths++;
        // a standing report too: an event can be missed, this cannot
        this.setPresence({ dn: [this.lastHd?.mid ?? 0, (msg.killer as Json) ?? null, String(msg.weapon ?? '').slice(0, 12), String(msg.cause ?? '').slice(0, 40)] });
        if (this.director) this.director.playerDown(this.id, (msg.killer as number | null) ?? null, String(msg.weapon ?? ''), String(msg.cause ?? ''));
        else this.post({ k: 'dead', killer: (msg.killer as Json) ?? null, weapon: String(msg.weapon ?? ''), cause: String(msg.cause ?? '') });
        break;
      case 'chat':
        this.post({ k: 'chat', text: String(msg.text ?? '').slice(0, 80) });
        break;
    }
  }

  tick(dt: number): void {
    if (this.closed || !this.ch) return;
    // events age out of the outbox
    this.pruneT -= dt;
    if (this.pruneT <= 0) {
      this.pruneT = 0.5;
      if (this.pruneOutbox()) this.setPresence({ ob: this.outbox.length ? this.outbox.map((o) => [o.seq, o.p]) : null });
    }
    // ping the host now and then (it answers in its presence)
    this.pingT -= dt;
    if (this.pingT <= 0 && this.settled && this.hostPeer && this.hostPeer !== this.myPeer) {
      this.pingT = 2;
      this.pingSeq++;
      this.pingAt = performance.now();
      this.setPresence({ pg: this.pingSeq });
    }
    if (this.director && this.ackDirty) {
      this.ackDirty = false;
      this.setPresence({ ak: { ...this.acks } });
    }
    // heartbeat, and drop anyone who has been silent too long (missed leave, closed laptop)
    this.sweepT -= dt;
    if (this.sweepT <= 0 && this.settled) {
      this.sweepT = 1;
      const now = performance.now();
      let gone = false;
      for (const k of [...this.known.values()]) {
        if (now - k.seen > GHOST_MS) {
          this.dropPeer(k.peer);
          gone = true;
        }
      }
      if (gone) {
        this.electHost();
        this.director?.sync(this.roster());
      }
    }
    this.lobbyT -= dt;
    if (this.lobbyT <= 0) {
      this.lobbyT = 1;
      this.publishLobby();
    }
  }

  /** What the lobby (and the owner's control panel) sees of us. */
  private publishLobby(): void {
    const d = this.lastState;
    const me = this.lastHd?.pl.find((p) => p[0] === this.id);
    setLobby({
      n: this.name,
      j: this.jet,
      rm: this.def.id,
      ms: this.lastHd?.st ?? 'waiting',
      host: !!this.director,
      im: !!me?.[1],
      al: !!me?.[2],
      k: me?.[3] ?? 0,
      d: this.deaths,
      alt: d ? Math.round(d[1]) : undefined,
      spd: d ? Math.round(Math.hypot(d[7], d[8], d[9])) : undefined,
      hdg: d ? Math.round(((Math.atan2(d[7], -d[9]) * 180) / Math.PI + 360) % 360) : undefined,
      pg: Math.round(this.rtt),
      mu: this.muted.has(this.id),
    });
  }

  // ------------------------------------------------------------ receiving

  private onPeers(c: PeersChange): void {
    if (this.closed) return;
    for (const p of c.left) this.dropPeer(p.peer);
    for (const p of [...c.joined, ...c.updated]) {
      if (p.sameTab) {
        this.myPeer = p.peer;
        continue;
      }
      this.process(p);
    }
    if (this.settled) {
      this.electHost();
      this.director?.sync(this.roster());
    }
  }

  private dropPeer(peer: string): void {
    const k = this.known.get(peer);
    if (!k) return;
    this.known.delete(peer);
    this.players = this.players.filter((x) => x.id !== k.id);
    this.deliver({ t: 'leave', id: k.id });
    if (this.hostPeer === peer) this.hostPeer = null;
  }

  private process(peer: RoomPeer): void {
    const pr = peer.presence as Record<string, unknown>;
    if (pr.v !== 1 || typeof pr.id !== 'number' || pr.id === this.id) return;
    let k = this.known.get(peer.peer);
    const jet = (typeof pr.j === 'string' ? pr.j : 'F15EX') as AircraftType;
    const name = typeof pr.n === 'string' ? pr.n.slice(0, 16) : `PILOT ${pr.id}`;
    if (!k) {
      const p: NetPlayer = { id: pr.id, name, jet, paint: (pr.pt as PaintConfig) ?? null, inMatch: false, alive: false, kills: 0 };
      k = { peer: peer.peer, id: pr.id, p, lastSeq: 0, lastS: -1, lastMs: -1, lastHd: -1, lastAk: -1, lastPg: null, hosting: false, vis: true, dn: null, seen: performance.now() };
      this.known.set(peer.peer, k);
      if (this.settled) {
        this.players.push(p);
        this.deliver({ t: 'join', p });
      }
    } else {
      k.p.name = name;
      k.p.jet = jet;
      if (pr.pt && !k.p.paint) k.p.paint = pr.pt as PaintConfig;
    }
    k.seen = performance.now();
    k.hosting = !!pr.hd;
    k.vis = pr.vis !== false;
    k.dn = pr.dn ?? null;
    // the jet
    if (typeof pr.sq === 'number' && pr.sq !== k.lastS && Array.isArray(pr.s)) {
      k.lastS = pr.sq;
      this.deliver({ t: 's', id: k.id, d: pr.s as number[] });
    }
    if (typeof pr.mq === 'number' && pr.mq !== k.lastMs) {
      k.lastMs = pr.mq;
      if (Array.isArray(pr.ms)) this.deliver({ t: 'ev', id: k.id, e: { k: 'ms', l: pr.ms } });
    }
    // its events, each once
    if (Array.isArray(pr.ob)) {
      let top = k.lastSeq;
      for (const o of pr.ob as unknown[]) {
        if (!Array.isArray(o) || typeof o[0] !== 'number' || o[0] <= k.lastSeq) continue;
        top = Math.max(top, o[0]);
        this.event(k, peer, (o[1] ?? {}) as Record<string, unknown>);
      }
      k.lastSeq = top;
    }
    // the host's word: match state, and our ping answer
    if (pr.hd && typeof pr.hq === 'number' && pr.hq !== k.lastHd && (this.hostPeer === peer.peer || !this.hostPeer)) {
      k.lastHd = pr.hq;
      if (!this.director) this.applyHd(pr.hd as Hd);
    }
    if (pr.ak && this.hostPeer === peer.peer) {
      const a = (pr.ak as Record<string, number> | undefined)?.[String(this.id)];
      if (a === this.pingSeq && this.pingAt) {
        const r = performance.now() - this.pingAt;
        if (r < 5000) this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r;
        this.pingAt = 0;
      }
    }
    // (as the host) answer their ping
    if (this.director && pr.pg !== k.lastPg && typeof pr.pg === 'number') {
      k.lastPg = pr.pg;
      this.acks[String(k.id)] = pr.pg;
      this.ackDirty = true;
    }
  }

  private event(k: Known, peer: RoomPeer, e: Record<string, unknown>): void {
    switch (e.k) {
      case 'ev':
        if (e.e && typeof e.e === 'object') this.deliver({ t: 'ev', id: k.id, e: e.e as Record<string, unknown> });
        break;
      case 'hit':
        if (e.to === this.id && this.hitsAllowed(k.id) && e.h && typeof e.h === 'object') this.deliver({ t: 'hit', from: k.id, h: e.h as Record<string, unknown> });
        break;
      case 'dead':
        this.director?.playerDown(k.id, typeof e.killer === 'number' ? e.killer : null, String(e.weapon ?? ''), String(e.cause ?? ''));
        break;
      case 'chat':
        if (!this.muted.has(k.id)) this.deliver({ t: 'chat', id: k.id, text: String(e.text ?? '').slice(0, 80) });
        break;
      case 'dd':
        // the host announces a pilot down
        if (peer.peer === this.hostPeer && !this.director) {
          const d = e as unknown as DeadMsg;
          const key = `${this.lastHd?.mid ?? 0}:${d.id}`;
          if (!this.deadSeen.has(key)) {
            this.deadSeen.add(key);
            this.deliver({ t: 'dead', ...d });
          }
        }
        break;
    }
  }

  /** Only live combat counts (the same rule the server applies). */
  private hitsAllowed(from: number): boolean {
    const h = this.lastHd;
    if (!h || h.st !== 'live') return false;
    const el = h.el + (performance.now() - this.hdAt) / 1000;
    if (el < DROPIN) return false;
    const p = h.pl.find((x) => x[0] === from);
    return !!p && !!p[1];
  }

  /** The match as the host has it: tell the online mode what changed. */
  private applyHd(h: Hd): void {
    this.lastHd = h;
    this.hdAt = performance.now();
    if (this.room) this.room.state = h.st;
    for (const [id, inMatch, alive, kills] of h.pl) {
      const p = this.players.find((x) => x.id === id);
      if (p) {
        p.inMatch = !!inMatch;
        p.alive = !!alive;
        p.kills = kills;
      }
    }
    const key = `${h.st}:${h.mid}`;
    if (key !== this.matchKey) {
      this.matchKey = key;
      if (h.st === 'live' && Array.isArray(this.mine.dn) && (this.mine.dn as unknown[])[0] !== h.mid) this.setPresence({ dn: null });
      const slots: Record<string, { angle: number; ring: number; tier: number }> = {};
      for (const [id, s] of Object.entries(h.sl ?? {})) slots[id] = { angle: s[0], ring: s[1], tier: s[2] };
      this.deliver({
        t: 'match',
        state: h.st,
        timer: h.tm,
        matchId: h.mid,
        slots: h.st === 'live' ? slots : undefined,
        elapsed: h.el,
        dropin: Math.max(0, DROPIN - h.el),
        results: h.st === 'ended' ? (h.rs ?? []).map((r) => ({ id: r[0], name: r[1], jet: r[2] as AircraftType, place: r[3], kills: r[4], killedBy: r[5] })) : undefined,
      });
    }
    if (h.st === 'live') {
      this.deliver(zoneFromHd(h));
      // anyone the host has down that we never heard about
      const left = h.pl.filter((p) => p[1] && p[2]).length;
      for (const [id, inMatch, alive, , place] of h.pl) {
        if (!inMatch || alive) continue;
        const dk = `${h.mid}:${id}`;
        if (this.deadSeen.has(dk)) continue;
        this.deadSeen.add(dk);
        this.deliver({ t: 'dead', id, killer: null, weapon: '', cause: 'SHOT DOWN', place, left });
      }
    }
  }

  // ------------------------------------------------------------ hosting

  /** Who directs this room: whoever already does (the earliest claim wins); else the first of us. */
  private electHost(): void {
    if (this.closed || !this.ch) return;
    if (!this.myPeer) this.myPeer = this.ch.peers().find((p) => p.sameTab)?.peer ?? '';
    // only pilots heard from lately can direct (a silent one may already be gone)
    const now = performance.now();
    const live = [...this.known.values()].filter((k) => now - k.seen < HEARTBEAT_S * 2500);
    const claim = live.filter((k) => k.hosting).map((k) => k.peer);
    if (this.director && this.myPeer) claim.push(this.myPeer);
    let host: string | null;
    if (claim.length) host = claim.sort()[0];
    else {
      // a new director: someone whose tab is in front, if anyone's is
      const all = live.map((k) => ({ peer: k.peer, vis: k.vis }));
      if (this.myPeer) all.push({ peer: this.myPeer, vis: !document.hidden });
      const pool = all.some((x) => x.vis) ? all.filter((x) => x.vis) : all;
      host = pool.map((x) => x.peer).sort()[0] ?? null;
    }
    this.hostPeer = host;
    if (host && host === this.myPeer) {
      if (!this.director) this.becomeHost();
    } else if (this.director) this.stopHosting();
  }

  private roster(): { id: number; name: string; jet: string }[] {
    return [{ id: this.id, name: this.name, jet: this.jet }, ...[...this.known.values()].map((k) => ({ id: k.id, name: k.p.name, jet: k.p.jet }))];
  }

  private becomeHost(): void {
    const d = new Director();
    if (this.lastHd) {
      const names = new Map(this.roster().map((p) => [p.id, p]));
      d.restore(this.lastHd, names);
    }
    d.sync(this.roster());
    d.onDead = (m) => {
      this.post({ k: 'dd', ...m } as unknown as Record<string, Json>);
      this.deadSeen.add(`${d.matchId}:${m.id}`);
      this.deliver({ t: 'dead', ...m });
    };
    d.onChange = () => this.publishHd();
    this.director = d;
    this.dirLast = performance.now();
    // its own clock, so a hidden tab (no animation frames) still runs the match
    this.dirTimer = window.setInterval(() => this.directorTick(), 100);
    this.publishHd();
  }

  private stopHosting(): void {
    clearInterval(this.dirTimer);
    this.director = null;
    this.setPresence({ hd: null, hq: null, ak: null });
  }

  private directorTick(): void {
    const d = this.director;
    if (!d || this.closed) return;
    const now = performance.now();
    const dt = Math.min(5, (now - this.dirLast) / 1000);
    this.dirLast = now;
    d.update(dt);
    // standing "I am down" reports (one might have missed the event)
    this.reconcileT -= dt;
    if (this.reconcileT <= 0) {
      this.reconcileT = 1;
      for (const k of this.known.values()) {
        const dn = k.dn as unknown[] | null;
        if (Array.isArray(dn) && dn[0] === d.matchId) d.playerDown(k.id, typeof dn[1] === 'number' ? dn[1] : null, String(dn[2] ?? ''), String(dn[3] ?? ''));
      }
      // a pilot in the fight who has gone silent (tab closed, laptop shut) cannot hold the match up
      const now = performance.now();
      for (const k of this.known.values()) {
        const p = d.players.get(k.id);
        if (p && p.inMatch && p.alive && d.state === 'live' && now - k.seen > 30000) d.playerDown(k.id, null, '', 'LOST CONTACT');
      }
      const mine = this.mine.dn as unknown[] | undefined;
      if (Array.isArray(mine) && mine[0] === d.matchId) d.playerDown(this.id, typeof mine[1] === 'number' ? mine[1] : null, String(mine[2] ?? ''), String(mine[3] ?? ''));
    }
    // a hidden tab's timers crawl: hand the room to someone who is looking at it
    this.hiddenFor = document.hidden ? this.hiddenFor + dt : 0;
    if (this.hiddenFor > 8 && [...this.known.values()].some((k) => k.vis)) {
      this.hiddenFor = 0;
      this.stopHosting();
      this.hostPeer = null;
      return;
    }
    this.hdPublishT -= dt;
    if (this.hdPublishT <= 0) this.publishHd();
  }

  private publishHd(): void {
    const d = this.director;
    if (!d) return;
    this.hdPublishT = 0.25;
    const h = d.snapshot();
    this.setPresence({ hd: h as unknown as Json, hq: ++this.hq });
    this.applyHd(h);
  }

  // ------------------------------------------------------------ the admin

  private onAdmin(cmd: AdminCmd): void {
    if (this.closed) return;
    const forMe = cmd.id === this.id;
    const forRoom = !cmd.rm || cmd.rm === this.def.id;
    const text = String(cmd.text ?? '').slice(0, 120).toUpperCase();
    switch (cmd.c) {
      case 'msg':
        if (forMe && text) this.deliver({ t: 'sys', text });
        break;
      case 'ann':
        if (forRoom && text) this.deliver({ t: 'sys', text });
        break;
      case 'smite':
        if (forMe) this.deliver({ t: 'smite', text: text || 'STRUCK DOWN BY THE ADMIN' });
        break;
      case 'mute':
      case 'unmute':
        if (cmd.id === undefined) break;
        if (cmd.c === 'mute') this.muted.add(cmd.id);
        else this.muted.delete(cmd.id);
        if (forMe) this.deliver({ t: 'sys', text: cmd.c === 'mute' ? 'THE ADMIN HAS MUTED YOU' : 'YOU CAN CHAT AGAIN' });
        break;
      case 'kick':
        if (forMe) this.kicked(`KICKED BY THE ADMIN${text ? ': ' + text : ''}`);
        break;
      case 'ban':
        if (forMe) {
          setLocalBan(Math.max(0, Number(cmd.min) || 0), text);
          this.kicked(`BANNED BY THE ADMIN${text ? ': ' + text : ''}`);
        }
        break;
      case 'clear':
        if (cmd.rm === this.def.id) this.kicked(`THE ADMIN CLEARED THE ROOM${text ? ': ' + text : ''}`);
        break;
      case 'start':
      case 'end':
        if (cmd.rm === this.def.id && this.director) {
          const err = cmd.c === 'start' ? this.director.forceStart() : this.director.forceEnd();
          if (!err) this.publishHd();
        }
        break;
    }
  }
}
