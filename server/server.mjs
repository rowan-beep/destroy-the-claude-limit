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
// GET /admin is the operator console (needs the admin key: see "admin" below).

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';

const PROTOCOL = 1;
const NM = 1852;
const TICK = 0.1; // match logic (s)
const JETS = ['F15EX', 'FA18EF', 'TYPHOON', 'SU35', 'RAFALE', 'F22', 'MIG31'];
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
    this.locked = false;
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
    stats.matches++;
    note(this, `match ${this.matchId} started with ${list.length} pilots`, 'match');
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
    note(this, winner ? `match ${this.matchId} won by ${winner.name}` : `match ${this.matchId} ended`, 'match');
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
    p.deaths++;
    const left = [...this.players.values()].filter((o) => o.inMatch && o.alive).length;
    p.place = left + 1;
    const k = killerId !== null && killerId !== undefined ? this.players.get(killerId) : null;
    if (k && k !== p && k.inMatch) {
      k.kills++;
      p.killedBy = `${k.name} · ${clean(weapon, 12)}`;
    } else p.killedBy = clean(cause, 40);
    note(this, k && k !== p ? `${k.name} shot down ${p.name} (${clean(weapon, 12) || 'GUN'})` : `${p.name} went down: ${clean(cause, 40) || 'unknown'}`, 'kill');
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
  constructor(ws, room, hello, ip) {
    this.ws = ws;
    this.ip = ip;
    this.joinedAt = Date.now();
    this.ping = 0;
    this.pingSent = 0;
    this.lastPong = Date.now();
    this.st = null;
    this.deaths = 0;
    this.muted = false;
    this.msgTotal = 0;
    this.msgPrev = 0;
    this.rate = 0;
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
  const path = (req.url || '/').split('?')[0];
  if (path === '/admin' || path.startsWith('/admin/')) {
    handleAdmin(req, res, path);
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (path === '/status' || path === '/') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ game: 'TRIAD', protocol: PROTOCOL, official: OFFICIAL, rooms: rooms.map((r) => r.info()) }));
    return;
  }
  res.statusCode = 404;
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

wss.on('connection', (ws, req) => {
  let player = null;
  const ip = clientIp(req);
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  const ban = activeBan(ip);
  if (ban) {
    send({ t: 'error', reason: `BANNED FROM THIS SERVER${ban.reason ? ': ' + ban.reason : ''}` });
    ws.close();
    return;
  }
  ws.on('pong', () => {
    if (!player) return;
    player.lastPong = Date.now();
    const rtt = Date.now() - player.pingSent;
    if (player.pingSent && rtt < 10000) player.ping = player.ping ? Math.round(player.ping * 0.6 + rtt * 0.4) : rtt;
  });
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
      if (room.locked) {
        send({ t: 'error', reason: 'THIS ROOM IS LOCKED' });
        ws.close();
        return;
      }
      player = new Player(ws, room, m, ip);
      stats.connections++;
      room.players.set(player.id, player);
      send({ t: 'welcome', id: player.id, room: room.info(), players: room.roster() });
      send(room.matchMsg());
      if (room.state === 'live') room.sendZone();
      room.broadcast({ t: 'join', p: player.pub() }, player);
      log(`${room.name}: ${player.name} joined (${room.players.size})`);
      note(room, `${player.name} joined in a ${player.jet}`, 'join');
      stats.peak = Math.max(stats.peak, onlineCount());
      return;
    }
    player.msgTotal++;
    // flood guard: the counter resets every 0.1 s tick
    player.msgs++;
    if (player.msgs > 30) return;
    const room = player.room;
    switch (m.t) {
      case 's':
        if (Array.isArray(m.d) && m.d.length < 40) {
          player.st = { d: m.d, t: Date.now() };
          room.broadcast({ t: 's', id: player.id, d: m.d }, player);
        }
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
        if (!text) break;
        if (player.muted) {
          send({ t: 'sys', text: 'YOU ARE MUTED' });
          break;
        }
        note(room, `${player.name}: ${text}`, 'chat');
        room.broadcast({ t: 'chat', id: player.id, text });
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
    note(room, `${player.name} left`, 'leave');
  });
});

setInterval(() => {
  for (const r of rooms) {
    r.update(TICK);
    for (const p of r.players.values()) p.msgs = 0;
  }
}, TICK * 1000);

// ping every pilot (WebSocket ping frames: the browser answers them itself),
// drop dead connections, and keep a messages-per-second figure for the console
setInterval(() => {
  const now = Date.now();
  for (const r of rooms) {
    for (const p of r.players.values()) {
      if (now - p.lastPong > 45000) {
        p.ws.terminate();
        continue;
      }
      p.rate = (p.msgTotal - p.msgPrev) / 2;
      p.msgPrev = p.msgTotal;
      p.pingSent = now;
      try {
        p.ws.ping();
      } catch {
        /* closing */
      }
    }
  }
}, 2000);

function log(s) {
  console.log(new Date().toISOString().slice(11, 19), s);
}

// ---------------------------------------------------------------- admin
// The operator console at /admin. It needs the admin key, sent as the
// x-admin-key header. Only a SHA-256 of the key lives here: the official
// servers use the built-in one; a server you run yourself has no console
// until you give it your own key (TRIAD_ADMIN_KEY) or its hash
// (TRIAD_ADMIN_HASH).

const OFFICIAL_ADMIN_HASH = '3d6e2fdc61d482b985c1a48c36e0993dd6d0cb436998169e4890cf5421ee8505';
const ADMIN_HASH = (
  process.env.TRIAD_ADMIN_HASH ||
  (process.env.TRIAD_ADMIN_KEY ? sha256(process.env.TRIAD_ADMIN_KEY) : OFFICIAL ? OFFICIAL_ADMIN_HASH : '')
).toLowerCase();
const ADMIN_PAGE = (() => {
  try {
    return fs.readFileSync(new URL('./admin.html', import.meta.url));
  } catch {
    return null;
  }
})();
const TRUST_PROXY = OFFICIAL || process.env.TRIAD_TRUST_PROXY === '1';
const STARTED = Date.now();
const stats = { connections: 0, peak: 0, matches: 0 };
const events = [];
const bans = new Map(); // ip -> { until, name, reason, at }
const failures = new Map(); // ip -> { n, t }

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function adminOk(key) {
  if (!ADMIN_HASH || typeof key !== 'string' || !key || key.length > 200) return false;
  const a = Buffer.from(sha256(key), 'hex'), b = Buffer.from(ADMIN_HASH, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clientIp(req) {
  const fwd = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  return (fwd || req.socket.remoteAddress || '?').replace(/^::ffff:/, '');
}

function activeBan(ip) {
  const b = bans.get(ip);
  if (!b) return null;
  if (b.until && Date.now() > b.until) {
    bans.delete(ip);
    return null;
  }
  return b;
}

function onlineCount() {
  let n = 0;
  for (const r of rooms) n += r.players.size;
  return n;
}

/** Something worth showing in the console's event log. */
function note(room, text, kind) {
  events.push({ t: Date.now(), room: room ? room.name : '', text, kind });
  if (events.length > 400) events.splice(0, events.length - 400);
}

function allPlayers() {
  return rooms.flatMap((r) => [...r.players.values()]);
}

function adminState() {
  const now = Date.now();
  return {
    now,
    server: {
      official: OFFICIAL,
      name: OFFICIAL ? 'OFFICIAL SERVERS' : rooms[0].name,
      uptime: Math.round((now - STARTED) / 1000),
      memMb: Math.round(process.memoryUsage().rss / 1048576),
      node: process.version,
      protocol: PROTOCOL,
      online: onlineCount(),
      max: MAX,
      ...stats,
    },
    rooms: rooms.map((r) => ({
      ...r.info(),
      locked: r.locked,
      timer: Math.max(0, Math.round(r.timer)),
      elapsed: Math.round(r.elapsed ?? 0),
      matchId: r.matchId,
      zone: r.state === 'live' ? r.zone() : null,
    })),
    players: allPlayers().map((p) => {
      const d = p.st?.d;
      return {
        id: p.id,
        name: p.name,
        room: p.room.id,
        roomName: p.room.name,
        jet: p.jet,
        ping: p.ping,
        ip: p.ip,
        since: p.joinedAt,
        inMatch: p.inMatch,
        alive: p.alive,
        kills: p.kills,
        deaths: p.deaths,
        muted: p.muted,
        rate: p.rate,
        pos: d
          ? {
              x: Math.round(d[0]),
              y: Math.round(d[1]),
              z: Math.round(d[2]),
              speed: Math.round(Math.hypot(d[7], d[8], d[9])),
              hdg: Math.round(((Math.atan2(d[7], -d[9]) * 180) / Math.PI + 360) % 360),
              age: now - p.st.t,
            }
          : null,
      };
    }),
    bans: [...bans.entries()].filter(([ip]) => activeBan(ip)).map(([ip, b]) => ({ ip, ...b })),
    events: events.slice(-200),
  };
}

function kick(p, reason) {
  if (p.ws.readyState === 1) p.ws.send(JSON.stringify({ t: 'error', reason: `KICKED FROM THE SERVER${reason ? ': ' + reason : ''}` }));
  setTimeout(() => p.ws.close(), 150);
}

/** One console command; returns a line for the console. */
function adminAction(a) {
  // admin text keeps its punctuation (the game shows it as plain text)
  const text = (n) => String(a.text ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n).toUpperCase();
  const p = a.id !== undefined ? allPlayers().find((x) => x.id === +a.id) : null;
  const room = a.room ? rooms.find((r) => r.id === a.room) : null;
  const need = (x, what) => {
    if (!x) throw new Error(`no such ${what}`);
    return x;
  };
  switch (a.a) {
    case 'msg': {
      const t = need(text(120), 'message');
      need(p, 'pilot').ws.send(JSON.stringify({ t: 'sys', text: t }));
      note(p.room, `[admin] to ${p.name}: ${t}`, 'admin');
      return `sent to ${p.name}`;
    }
    case 'announce': {
      const t = need(text(120), 'message');
      for (const r of room ? [room] : rooms) r.broadcast({ t: 'sys', text: t });
      note(room, `[admin] announcement${room ? '' : ' (all rooms)'}: ${t}`, 'admin');
      return 'announced';
    }
    case 'smite':
      need(p, 'pilot').ws.send(JSON.stringify({ t: 'smite', text: text(60) }));
      note(p.room, `[admin] smote ${p.name}`, 'admin');
      return `${p.name} smitten`;
    case 'mute':
    case 'unmute':
      need(p, 'pilot').muted = a.a === 'mute';
      if (p.muted) p.ws.send(JSON.stringify({ t: 'sys', text: 'AN ADMIN HAS MUTED YOU' }));
      note(p.room, `[admin] ${a.a}d ${p.name}`, 'admin');
      return `${p.name} ${a.a}d`;
    case 'kick':
      kick(need(p, 'pilot'), text(60));
      note(p.room, `[admin] kicked ${p.name}${a.text ? ': ' + text(60) : ''}`, 'admin');
      return `${p.name} kicked`;
    case 'ban': {
      need(p, 'pilot');
      const min = Math.max(0, Math.min(525600, +a.minutes || 0));
      bans.set(p.ip, { until: min ? Date.now() + min * 60000 : 0, name: p.name, reason: text(60), at: Date.now() });
      kick(p, `BANNED${a.text ? ': ' + text(60) : ''}`);
      // anyone else on the same address goes too
      for (const o of allPlayers()) if (o !== p && o.ip === p.ip) kick(o, 'BANNED');
      note(p.room, `[admin] banned ${p.name} (${p.ip}) ${min ? `for ${min} min` : 'until restart'}`, 'admin');
      return `${p.name} banned`;
    }
    case 'unban':
      if (!bans.delete(String(a.ip))) throw new Error('not banned');
      note(null, `[admin] unbanned ${a.ip}`, 'admin');
      return `${a.ip} unbanned`;
    case 'start':
      need(room, 'room');
      if (room.players.size < 2) throw new Error('a match needs 2 pilots');
      if (room.state === 'live') throw new Error('a match is already on');
      room.startMatch();
      note(room, '[admin] started the match', 'admin');
      return 'match started';
    case 'end': {
      need(room, 'room');
      if (room.state !== 'live') throw new Error('no match running');
      const alive = [...room.players.values()].filter((x) => x.inMatch && x.alive).sort((x, y) => y.kills - x.kills);
      room.endMatch(alive[0] ?? null);
      note(room, '[admin] ended the match', 'admin');
      return 'match ended';
    }
    case 'lock':
    case 'unlock':
      need(room, 'room').locked = a.a === 'lock';
      note(room, `[admin] ${a.a}ed the room`, 'admin');
      return `${room.name} ${a.a}ed`;
    case 'clear': {
      need(room, 'room');
      const n = room.players.size;
      for (const x of room.players.values()) kick(x, text(60));
      note(room, `[admin] cleared the room (${n})`, 'admin');
      return `${n} kicked`;
    }
  }
  throw new Error('unknown command');
}

function handleAdmin(req, res, path) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const json = (code, obj) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  if (!ADMIN_HASH || !ADMIN_PAGE) {
    res.statusCode = 404;
    res.end();
    return;
  }
  if (req.method === 'GET' && (path === '/admin' || path === '/admin/')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
    res.end(ADMIN_PAGE);
    return;
  }
  if (!path.startsWith('/admin/api/')) return json(404, { error: 'not found' });
  // slow down key guessing: 20 wrong keys in 10 minutes and that address waits
  const ip = clientIp(req);
  const f = failures.get(ip);
  if (f && Date.now() - f.t > 600000) failures.delete(ip);
  if ((failures.get(ip)?.n ?? 0) >= 20) return json(429, { error: 'too many attempts, try later' });
  if (!adminOk(req.headers['x-admin-key'])) {
    const g = failures.get(ip) ?? { n: 0, t: Date.now() };
    g.n++;
    failures.set(ip, g);
    log(`admin: wrong key from ${ip}`);
    return json(401, { error: 'wrong key' });
  }
  failures.delete(ip);
  if (req.method === 'GET' && path === '/admin/api/state') return json(200, adminState());
  if (req.method === 'POST' && path === '/admin/api/action') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 4096) req.destroy();
    });
    req.on('end', () => {
      try {
        const msg = adminAction(JSON.parse(body || '{}'));
        json(200, { ok: true, msg });
      } catch (e) {
        json(400, { ok: false, error: e.message });
      }
    });
    return;
  }
  json(404, { error: 'not found' });
}

server.listen(PORT, () => {
  log(`TRIAD server on port ${PORT}: ${rooms.map((r) => `${r.name} [${r.map}]`).join(', ')}`);
});
