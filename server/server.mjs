// TRIAD multiplayer game server.
//
// A small relay + match director for LAST PILOT STANDING free-for-all
// matches between real players (no AI, ever). Every client flies its own jet
// and simulates its own weapons; the server
//   * keeps rooms (up to 12 pilots each) and who is in them,
//   * relays each jet's state and weapon events to everyone else in the room,
//   * forwards hits to the pilot who was hit (the shooter's view decides a hit),
//   * runs the match: waiting -> countdown -> drop-in -> combat -> results,
//     the shrinking zone (sent in arena-relative metres), kills and placings.
//
// Run the official servers (rooms OFFICIAL 1-5):
//   node server/server.mjs --official
// Run your own (one room):
//   node server/server.mjs --name "My Server" --map triad --port 8080
// Options can also come from the environment: PORT, TRIAD_OFFICIAL=1,
// TRIAD_NAME, TRIAD_MAP, TRIAD_MAX.
// GET /status returns the room list as JSON (the in-game server browser uses it).

import http from 'node:http';
import { WebSocketServer } from 'ws';

const PROTOCOL = 1;
const NM = 1852;
const TICK = 0.1; // match logic (s)
const JETS = ['F15EX', 'FA18EF', 'TYPHOON', 'SU35'];
const MAPS = ['triad', 'frost'];

// ---------------------------------------------------------------- options
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const PORT = +(arg('port', process.env.PORT ?? 8080));
const OFFICIAL = !!(arg('official', false) || process.env.TRIAD_OFFICIAL === '1');
const MAX = Math.max(2, Math.min(12, +(arg('max', process.env.TRIAD_MAX ?? 12))));

// ---------------------------------------------------------------- zone
/** radius (NM), hold (s), shrink into it (s), seconds outside to go down */
const STAGES = [
  { r: 40, hold: 75, shrink: 0, die: 60 },
  { r: 26, hold: 70, shrink: 55, die: 45 },
  { r: 16, hold: 60, shrink: 45, die: 32 },
  { r: 9, hold: 50, shrink: 35, die: 22 },
  { r: 4.5, hold: 45, shrink: 28, die: 14 },
  { r: 3, hold: 120, shrink: 22, die: 14 },
  { r: 0.8, hold: 1e9, shrink: 75, die: 8 },
];
const DROPIN = 8; // weapons hold after the start (s)
const COUNTDOWN = Math.max(3, +(arg('countdown', 15)));
const RESULTS = 14;

const clean = (s, n) => String(s ?? '').replace(/[^\w \-.#]/g, '').trim().slice(0, n);

class Room {
  constructor(id, name, map, official) {
    this.id = id;
    this.name = name;
    this.map = MAPS.includes(map) ? map : 'triad';
    this.official = official;
    this.players = new Map(); // id -> player
    this.state = 'waiting';
    this.timer = 0;
    this.matchId = 0;
    this.results = null;
  }

  info() {
    return { id: this.id, name: this.name, map: this.map, official: this.official, players: this.players.size, max: MAX, state: this.state };
  }

  broadcast(msg, except = null) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
  }

  roster() {
    return [...this.players.values()].map((p) => p.pub());
  }

  matchMsg() {
    const m = { t: 'match', state: this.state, timer: Math.max(0, this.timer), matchId: this.matchId };
    if (this.state === 'live') {
      m.slots = this.slots;
      m.elapsed = this.elapsed;
      m.dropin = Math.max(0, DROPIN - this.elapsed);
    }
    if (this.state === 'ended') m.results = this.results;
    return m;
  }

  // ------------------------------------------------------------ match flow
  update(dt) {
    const n = this.players.size;
    if (this.state === 'waiting') {
      if (n >= 2) {
        this.state = 'countdown';
        this.timer = COUNTDOWN;
        this.broadcast(this.matchMsg());
      }
    } else if (this.state === 'countdown') {
      this.timer -= dt;
      if (n < 2) {
        this.state = 'waiting';
        this.broadcast(this.matchMsg());
      } else if (this.timer <= 0) this.startMatch();
    } else if (this.state === 'live') {
      this.elapsed += dt;
      this.updateZone(dt);
      const alive = [...this.players.values()].filter((p) => p.inMatch && p.alive);
      if (alive.length <= 1) this.endMatch(alive[0] ?? null);
    } else if (this.state === 'ended') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = n >= 2 ? 'countdown' : 'waiting';
        this.timer = COUNTDOWN;
        for (const p of this.players.values()) p.inMatch = false;
        this.broadcast(this.matchMsg());
      }
    }
  }

  startMatch() {
    const list = [...this.players.values()];
    this.matchId++;
    this.state = 'live';
    this.elapsed = 0;
    this.results = null;
    // fewer pilots start in a smaller circle, so nobody flies for minutes to find a fight
    const n = list.length;
    this.stage = n <= 3 ? 2 : n <= 6 ? 1 : 0;
    this.zonePhase = 'hold';
    this.zoneT = 0;
    const r0 = STAGES[this.stage].r * NM;
    this.from = { x: 0, z: 0, r: r0 };
    this.to = { ...this.from };
    this.pickNext();
    const a0 = Math.random() * Math.PI * 2;
    const shuffled = list.sort(() => Math.random() - 0.5);
    this.slots = {};
    shuffled.forEach((p, i) => {
      p.inMatch = true;
      p.alive = true;
      p.kills = 0;
      p.place = 0;
      p.killedBy = '';
      this.slots[p.id] = { angle: a0 + (i / n) * Math.PI * 2, ring: r0 * 0.8, tier: (i % 3) - 1 };
    });
    this.broadcast(this.matchMsg());
    this.sendZone();
  }

  endMatch(winner) {
    if (winner) winner.place = 1;
    this.state = 'ended';
    this.timer = RESULTS;
    const ranked = [...this.players.values()]
      .filter((p) => p.inMatch)
      .sort((a, b) => (a.place || 99) - (b.place || 99) || b.kills - a.kills);
    this.results = ranked.map((p) => ({ id: p.id, name: p.name, jet: p.jet, place: p.place || 1, kills: p.kills, killedBy: p.killedBy }));
    this.broadcast(this.matchMsg());
  }

  pickNext() {
    const next = STAGES[this.stage + 1];
    if (!next) {
      this.next = null;
      return;
    }
    const cur = this.to;
    const nr = next.r * NM;
    const slack = Math.max(0, cur.r - nr) * 0.85;
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * slack;
    this.next = { x: cur.x + Math.sin(a) * d, z: cur.z - Math.cos(a) * d, r: nr };
  }

  zone() {
    if (this.zonePhase === 'hold') return this.to;
    const st = STAGES[this.stage];
    const k = Math.min(1, this.zoneT / Math.max(1, st.shrink));
    const s = k * k * (3 - 2 * k);
    const f = this.from, t = this.to;
    return { x: f.x + (t.x - f.x) * s, z: f.z + (t.z - f.z) * s, r: f.r + (t.r - f.r) * s };
  }

  updateZone(dt) {
    this.zoneT += dt;
    const st = STAGES[this.stage];
    if (this.zonePhase === 'hold') {
      if (STAGES[this.stage + 1] && this.zoneT >= st.hold) {
        this.stage++;
        this.zonePhase = 'shrink';
        this.zoneT = 0;
        this.from = { ...this.to };
        this.to = { ...this.next };
      }
    } else if (this.zoneT >= st.shrink) {
      this.zonePhase = 'hold';
      this.zoneT = 0;
      this.pickNext();
    }
    this.zoneSendT = (this.zoneSendT ?? 0) - dt;
    if (this.zoneSendT <= 0) {
      this.zoneSendT = 0.25;
      this.sendZone();
    }
  }

  sendZone() {
    const z = this.zone();
    const st = STAGES[this.stage];
    const next = this.zonePhase === 'shrink' ? this.to : this.next;
    const left = this.zonePhase === 'hold' ? (STAGES[this.stage + 1] ? st.hold - this.zoneT : 0) : st.shrink - this.zoneT;
    this.broadcast({
      t: 'zone',
      x: Math.round(z.x),
      z: Math.round(z.z),
      r: Math.round(z.r),
      nx: next ? Math.round(next.x) : Math.round(z.x),
      nz: next ? Math.round(next.z) : Math.round(z.z),
      nr: next ? Math.round(next.r) : 0,
      phase: this.zonePhase,
      stage: this.stage,
      last: this.stage === STAGES.length - 1,
      left: Math.max(0, Math.round(left)),
      die: st.die,
      reveal: this.stage >= 4,
    });
  }

  /** A pilot is down (reported by their own client, or a disconnect). */
  playerDown(p, killerId, weapon, cause) {
    if (this.state !== 'live' || !p.inMatch || !p.alive) return;
    p.alive = false;
    const left = [...this.players.values()].filter((o) => o.inMatch && o.alive).length;
    p.place = left + 1;
    const k = killerId !== null && killerId !== undefined ? this.players.get(killerId) : null;
    if (k && k !== p && k.inMatch) {
      k.kills++;
      p.killedBy = `${k.name} · ${clean(weapon, 12)}`;
    } else p.killedBy = clean(cause, 40);
    this.broadcast({ t: 'dead', id: p.id, killer: k && k !== p ? k.id : null, weapon: clean(weapon, 12), cause: clean(cause, 40), place: p.place, left });
  }
}

// ---------------------------------------------------------------- rooms
const rooms = [];
if (OFFICIAL) {
  for (let i = 1; i <= 5; i++) rooms.push(new Room(`official-${i}`, `OFFICIAL ${i}`, i <= 3 ? 'triad' : 'frost', true));
} else {
  rooms.push(new Room('main', clean(arg('name', process.env.TRIAD_NAME ?? 'TRIAD SERVER'), 32) || 'TRIAD SERVER', arg('map', process.env.TRIAD_MAP ?? 'triad'), false));
}

let nextId = 1;

class Player {
  constructor(ws, room, hello) {
    this.ws = ws;
    this.room = room;
    this.id = nextId++;
    this.name = clean(hello.name, 16) || `PILOT ${this.id}`;
    this.jet = JETS.includes(hello.jet) ? hello.jet : 'F15EX';
    this.paint = typeof hello.paint === 'object' && hello.paint && JSON.stringify(hello.paint).length < 600 ? hello.paint : null;
    this.inMatch = false;
    this.alive = false;
    this.kills = 0;
    this.place = 0;
    this.killedBy = '';
    this.msgs = 0;
  }
  pub() {
    return { id: this.id, name: this.name, jet: this.jet, paint: this.paint, inMatch: this.inMatch, alive: this.alive, kills: this.kills };
  }
}

// ---------------------------------------------------------------- http + ws
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/status' || req.url === '/') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ game: 'TRIAD', protocol: PROTOCOL, official: OFFICIAL, rooms: rooms.map((r) => r.info()) }));
    return;
  }
  res.statusCode = 404;
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  let player = null;
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    if (!player) {
      if (m.t === 'info') {
        send({ t: 'info', protocol: PROTOCOL, rooms: rooms.map((r) => r.info()) });
        return;
      }
      if (m.t !== 'hello') return;
      if (m.protocol !== PROTOCOL) {
        send({ t: 'error', reason: 'VERSION MISMATCH — UPDATE THE GAME' });
        ws.close();
        return;
      }
      const room = rooms.find((r) => r.id === m.room) ?? rooms[0];
      if (room.players.size >= MAX) {
        send({ t: 'error', reason: 'SERVER FULL' });
        ws.close();
        return;
      }
      player = new Player(ws, room, m);
      room.players.set(player.id, player);
      send({ t: 'welcome', id: player.id, room: room.info(), players: room.roster() });
      send(room.matchMsg());
      if (room.state === 'live') room.sendZone();
      room.broadcast({ t: 'join', p: player.pub() }, player);
      log(`${room.name}: ${player.name} joined (${room.players.size})`);
      return;
    }
    // flood guard: the counter resets every 0.1 s tick
    player.msgs++;
    if (player.msgs > 30) return;
    const room = player.room;
    switch (m.t) {
      case 's':
        if (Array.isArray(m.d) && m.d.length < 40) room.broadcast({ t: 's', id: player.id, d: m.d }, player);
        break;
      case 'ev':
        if (m.e && typeof m.e === 'object') room.broadcast({ t: 'ev', id: player.id, e: m.e }, player);
        break;
      case 'hit': {
        // only live combat counts
        if (room.state !== 'live' || (room.elapsed ?? 0) < DROPIN || !player.inMatch) break;
        const to = room.players.get(m.to);
        if (to && to !== player && to.alive && to.ws.readyState === 1) to.ws.send(JSON.stringify({ t: 'hit', from: player.id, h: m.h }));
        break;
      }
      case 'dead':
        room.playerDown(player, m.killer, m.weapon, m.cause);
        break;
      case 'chat': {
        const text = clean(m.text, 80);
        if (text) room.broadcast({ t: 'chat', id: player.id, text });
        break;
      }
      case 'ping':
        send({ t: 'pong', c: m.c });
        break;
    }
  });
  ws.on('close', () => {
    if (!player) return;
    const room = player.room;
    room.playerDown(player, null, '', 'DISCONNECTED');
    room.players.delete(player.id);
    room.broadcast({ t: 'leave', id: player.id });
    log(`${room.name}: ${player.name} left (${room.players.size})`);
  });
});

setInterval(() => {
  for (const r of rooms) {
    r.update(TICK);
    for (const p of r.players.values()) p.msgs = 0;
  }
}, TICK * 1000);

function log(s) {
  console.log(new Date().toISOString().slice(11, 19), s);
}

server.listen(PORT, () => {
  log(`TRIAD server on port ${PORT}: ${rooms.map((r) => `${r.name} [${r.map}]`).join(', ')}`);
});
