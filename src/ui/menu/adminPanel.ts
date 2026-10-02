// SERVER CONTROL: the artifact owner's panel for multiplayer inside the
// artifact. Everyone who has the game open shows up (from the lobby), with
// their room, jet, ping and flight data; the owner can message, mute,
// smite, kick and ban pilots, and start, end, lock and clear rooms.
// Commands go out on the admin channel, which only the owner (and the
// artifact's editors) can send on. Only the owner ever sees this panel.

import { el, clearEl, button } from '../dom';
import { artifactRoom, ARTIFACT_ROOMS, ROOM_MAX, lobbyInfo, LobbyInfo, sendAdmin, setLobby, AdminCmd } from '../../net/artifact';
import { SPECS, AircraftType } from '../../aircraft/specs';
import { MAPS } from '../../world/islands';

const CSS = `
.adm-back { position: fixed; inset: 0; z-index: 60; background: rgba(4,7,10,.72); display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 24px 16px; font-family: Inter, system-ui, sans-serif; }
.adm { width: min(1180px, 100%); background: #0e1319; border: 1px solid #243040; border-radius: 14px; color: #dfe7ef; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
.adm-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 18px; border-bottom: 1px solid #222c38; }
.adm-brand { font: 600 11px 'Share Tech Mono', monospace; letter-spacing: .24em; color: #4fd8ff; }
.adm-title { font-size: 18px; font-weight: 700; margin-right: auto; }
.adm-stats { display: flex; gap: 8px; flex-wrap: wrap; }
.adm-stat { background: #131a22; border: 1px solid #222c38; border-radius: 8px; padding: 4px 10px; }
.adm-stat span { display: block; font: 600 9px 'Share Tech Mono', monospace; letter-spacing: .12em; color: #56657a; }
.adm-stat b { font: 600 14px 'Share Tech Mono', monospace; }
.adm-btn { border: 1px solid #2a3542; background: #161d26; color: #dfe7ef; border-radius: 7px; padding: 6px 11px; font: 500 12px Inter, system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
.adm-btn:hover { background: #1c2531; border-color: #3a4756; }
.adm-btn:disabled { opacity: .4; cursor: default; }
.adm-btn.sm { padding: 3px 8px; font-size: 11px; border-radius: 6px; }
.adm-btn.god { color: #c4a5ff; } .adm-btn.warn { color: #fbbf24; } .adm-btn.danger { color: #f87171; }
.adm-body { padding: 16px 18px; display: grid; gap: 16px; }
.adm-h { font: 600 11px 'Share Tech Mono', monospace; letter-spacing: .16em; color: #8393a5; margin: 0 0 8px; }
.adm-rooms { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.adm-room { background: #131a22; border: 1px solid #222c38; border-radius: 10px; padding: 10px; display: grid; gap: 6px; }
.adm-room b { font-size: 13px; }
.adm-room .meta { font: 11px 'Share Tech Mono', monospace; color: #8393a5; display: flex; gap: 8px; align-items: center; }
.adm-badge { font: 600 9px 'Share Tech Mono', monospace; letter-spacing: .08em; padding: 1px 6px; border: 1px solid currentColor; border-radius: 99px; text-transform: uppercase; }
.st-waiting { color: #56657a; } .st-countdown { color: #fbbf24; } .st-live { color: #4ade80; } .st-ended { color: #c4a5ff; } .st-locked { color: #f87171; }
.adm-acts { display: flex; gap: 5px; flex-wrap: wrap; }
.adm-tw { overflow-x: auto; border: 1px solid #222c38; border-radius: 10px; }
.adm table { width: 100%; border-collapse: collapse; min-width: 900px; font-size: 13px; }
.adm th { text-align: left; font: 600 9px 'Share Tech Mono', monospace; letter-spacing: .12em; color: #56657a; padding: 8px 10px; border-bottom: 1px solid #222c38; white-space: nowrap; }
.adm td { padding: 7px 10px; border-bottom: 1px solid rgba(34,44,56,.6); white-space: nowrap; }
.adm tr:last-child td { border-bottom: 0; }
.adm .mono { font-family: 'Share Tech Mono', monospace; }
.adm .dim { color: #56657a; font: 11px 'Share Tech Mono', monospace; }
.p-good { color: #4ade80; } .p-ok { color: #fbbf24; } .p-bad { color: #f87171; }
.adm-empty { padding: 26px; text-align: center; color: #56657a; }
.adm-log { max-height: 220px; overflow-y: auto; font: 12px 'Share Tech Mono', monospace; border: 1px solid #222c38; border-radius: 10px; padding: 6px 0; }
.adm-log div { padding: 2px 12px; } .adm-log time { color: #56657a; margin-right: 8px; }
.k-join { color: #4fd8ff; } .k-leave { color: #8393a5; } .k-kill { color: #f87171; } .k-admin { color: #c4a5ff; }
.adm-ask { position: fixed; inset: 0; z-index: 61; background: rgba(0,0,0,.5); display: grid; place-items: center; padding: 16px; }
.adm-ask form { width: min(420px, 100%); background: #11161d; border: 1px solid #243040; border-radius: 12px; padding: 18px; display: grid; gap: 10px; color: #dfe7ef; font-family: Inter, system-ui, sans-serif; }
.adm-ask h3 { margin: 0; font-size: 16px; } .adm-ask p { margin: 0; color: #8393a5; font-size: 13px; }
.adm-ask input, .adm-ask select { background: #0a0d11; border: 1px solid #243040; border-radius: 8px; color: #dfe7ef; padding: 9px 10px; font: 13px 'Share Tech Mono', monospace; }
.adm-ask .row { display: flex; gap: 8px; justify-content: flex-end; }
.adm-toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 62; background: #161d26; border: 1px solid #2a3542; color: #dfe7ef; border-radius: 9px; padding: 9px 14px; font: 13px Inter, system-ui, sans-serif; }
`;

const BANS_KEY = 'triad.admin.bans';
interface Ban {
  by: string;
  name: string;
  until: number;
  reason: string;
}

function loadBans(): Ban[] {
  try {
    const b = JSON.parse(localStorage.getItem(BANS_KEY) ?? '[]') as Ban[];
    return Array.isArray(b) ? b.filter((x) => x.until === 0 || x.until > Date.now()) : [];
  } catch {
    return [];
  }
}
let bans: Ban[] = loadBans();
function saveBans(): void {
  try {
    localStorage.setItem(BANS_KEY, JSON.stringify(bans.filter((b) => b.until !== 0)));
  } catch {
    /* storage unavailable: bans last this session */
  }
}

interface Row {
  info: LobbyInfo;
  by: string | null;
  peer: string;
}

const jetName = (j: string) => (SPECS[j as AircraftType] ? SPECS[j as AircraftType].shortName : j);
const pingCls = (p?: number) => (!p ? '' : p < 120 ? 'p-good' : p < 250 ? 'p-ok' : 'p-bad');

export class AdminPanel {
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private stats: HTMLDivElement;
  private timer = 0;
  private open = false;
  private log: { t: number; text: string; kind: string }[] = [];
  private prev = new Map<number, LobbyInfo>();
  private locks = new Set<string>();

  constructor() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.root = el('div', 'adm-back hidden', document.body);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.show(false);
    });
    const box = el('div', 'adm', this.root);
    const head = el('div', 'adm-head', box);
    const t = el('div', '', head);
    el('div', 'adm-brand', t, 'TRIAD · OWNER ONLY');
    el('div', 'adm-title', t, 'Server control');
    this.stats = el('div', 'adm-stats', head);
    button('Announce to everyone', 'adm-btn god', head, () => void this.ask('Announce to everyone', 'Shown big on the screen of everyone in a room.', 'Message').then((v) => { if (v) void this.cmd({ c: 'ann', text: v }, 'announced'); }));
    button('Close', 'adm-btn', head, () => this.show(false));
    this.body = el('div', 'adm-body', box);
    // keep watch even while closed: log events, enforce bans and locks
    window.setInterval(() => void this.watch(), 1500);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.show(false);
    });
  }

  show(on: boolean): void {
    this.open = on;
    this.root.classList.toggle('hidden', !on);
    clearInterval(this.timer);
    if (on) {
      void this.render();
      this.timer = window.setInterval(() => void this.render(), 1000);
    }
  }

  toggle(): void {
    this.show(!this.open);
  }

  private async rows(): Promise<Row[]> {
    const r = await artifactRoom();
    if (!r) return [];
    const out: Row[] = [];
    for (const p of r.peers()) {
      const info = lobbyInfo(p);
      if (info && p.kind !== 'agent') out.push({ info, by: p.by, peer: p.peer });
    }
    return out;
  }

  /** Runs every 1.5 s: the event log, and bans enforced on anyone banned who shows up in a room. */
  private async watch(): Promise<void> {
    const rows = await this.rows();
    const now = new Map(rows.map((r) => [r.info.id, r.info]));
    for (const [id, i] of now) {
      const was = this.prev.get(id);
      const where = i.rm ? ARTIFACT_ROOMS.find((x) => x.id === i.rm)?.name ?? i.rm : 'the menu';
      if (!was) this.note(`${i.n} is online (${where})`, 'join');
      else {
        if (was.rm !== i.rm) this.note(i.rm ? `${i.n} joined ${where}` : `${i.n} left ${ARTIFACT_ROOMS.find((x) => x.id === was.rm)?.name ?? 'the room'}`, i.rm ? 'join' : 'leave');
        if ((i.k ?? 0) > (was.k ?? 0)) this.note(`${i.n} scored a kill (${i.k})`, 'kill');
        if ((i.d ?? 0) > (was.d ?? 0)) this.note(`${i.n} went down`, 'kill');
      }
    }
    for (const [id, i] of this.prev) if (!now.has(id)) this.note(`${i.n} closed the game`, 'leave');
    this.prev = now;
    // banned pilots do not stay
    bans = bans.filter((b) => b.until === 0 || b.until > Date.now());
    for (const r of rows) {
      if (r.info.rm && r.by && bans.some((b) => b.by === r.by)) void sendAdmin({ c: 'kick', id: r.info.id, text: 'BANNED' }).catch(() => {});
    }
  }

  private note(text: string, kind: string): void {
    this.log.push({ t: Date.now(), text, kind });
    if (this.log.length > 200) this.log.shift();
  }

  private async cmd(c: AdminCmd, done: string): Promise<void> {
    try {
      await sendAdmin(c);
      this.note(`[you] ${done}`, 'admin');
      this.toast(done);
    } catch (e) {
      this.toast(`Could not send: ${(e as Error).message || 'not allowed'}`);
    }
  }

  private async render(): Promise<void> {
    const rows = (await this.rows()).sort((a, b) => (a.info.rm ?? 'zz').localeCompare(b.info.rm ?? 'zz') || a.info.n.localeCompare(b.info.n));
    const inRooms = rows.filter((r) => r.info.rm);
    clearEl(this.stats);
    const stat = (k: string, v: string, cls = '') => {
      const s = el('div', 'adm-stat', this.stats);
      el('span', '', s, k);
      el('b', cls, s, v);
    };
    const pings = inRooms.map((r) => r.info.pg ?? 0).filter((x) => x > 0);
    const avg = pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : 0;
    stat('GAME OPEN', String(rows.length));
    stat('IN ROOMS', String(inRooms.length));
    stat('AVG PING', avg ? `${avg} ms` : '—', pingCls(avg));
    stat('LIVE MATCHES', String(ARTIFACT_ROOMS.filter((d) => inRooms.some((r) => r.info.rm === d.id && r.info.ms === 'live')).length));

    const b = this.body;
    clearEl(b);
    // rooms
    const rs = el('div', '', b);
    el('div', 'adm-h', rs, 'ROOMS');
    const grid = el('div', 'adm-rooms', rs);
    for (const d of ARTIFACT_ROOMS) {
      const here = inRooms.filter((r) => r.info.rm === d.id);
      const host = here.find((r) => r.info.host);
      const state = host?.info.ms ?? here[0]?.info.ms ?? 'waiting';
      const card = el('div', 'adm-room', grid);
      el('b', '', card, d.name);
      const meta = el('div', 'meta', card);
      el('span', '', meta, MAPS.find((m) => m.id === d.map)?.name ?? d.map);
      el('span', `adm-badge st-${state}`, meta, state === 'live' ? 'live' : state);
      if (this.locks.has(d.id)) el('span', 'adm-badge st-locked', meta, 'locked');
      el('span', '', meta, `${here.length}/${ROOM_MAX}`);
      const acts = el('div', 'adm-acts', card);
      if (state === 'live') button('End match', 'adm-btn sm warn', acts, () => void this.cmd({ c: 'end', rm: d.id }, `ended the match in ${d.name}`));
      else {
        const s = button('Start now', 'adm-btn sm', acts, () => void this.cmd({ c: 'start', rm: d.id }, `started a match in ${d.name}`));
        s.disabled = here.length < 2;
      }
      button(this.locks.has(d.id) ? 'Unlock' : 'Lock', 'adm-btn sm', acts, () => this.toggleLock(d.id));
      button('Announce', 'adm-btn sm god', acts, () => void this.ask(`Announce in ${d.name}`, 'Shown big on every screen in this room.', 'Message').then((v) => { if (v) void this.cmd({ c: 'ann', rm: d.id, text: v }, `announced in ${d.name}`); }));
      const c = button('Clear', 'adm-btn sm danger', acts, () => void this.ask(`Clear ${d.name}?`, 'Everyone in it is sent back to the menu.', 'Reason (optional)').then((v) => { if (v !== null) void this.cmd({ c: 'clear', rm: d.id, text: v }, `cleared ${d.name}`); }));
      c.disabled = !here.length;
    }

    // pilots
    const ps = el('div', '', b);
    el('div', 'adm-h', ps, `PILOTS · ${rows.length} WITH THE GAME OPEN`);
    if (!rows.length) el('div', 'adm-empty', ps, 'Nobody else has the game open right now. Pilots show up here the moment they open it.');
    else {
      const tw = el('div', 'adm-tw', ps);
      const tb = el('table', '', tw);
      const hr = el('tr', '', el('thead', '', tb));
      for (const h of ['Pilot', 'Where', 'Jet', 'Ping', 'Status', 'K / D', 'Altitude', 'Speed', 'Powers']) el('th', '', hr, h);
      const body = el('tbody', '', tb);
      for (const r of rows) {
        const i = r.info;
        const tr = el('tr', '', body);
        const pc = el('td', '', tr);
        el('b', '', pc, i.n + (i.mu ? '  (muted)' : ''));
        el('div', 'dim', pc, `#${i.id}${r.by ? '' : ' · not signed in'}`);
        const room = i.rm ? ARTIFACT_ROOMS.find((d) => d.id === i.rm)?.name ?? i.rm : i.md && i.md !== 'menu' ? `SOLO · ${i.md.toUpperCase()}` : 'MENU';
        el('td', '', tr, room + (i.host ? ' (host)' : ''));
        el('td', '', tr, jetName(i.j));
        el('td', `mono ${pingCls(i.pg)}`, tr, i.rm ? (i.host ? 'host' : i.pg ? `${i.pg} ms` : '…') : '—');
        el('td', 'mono', tr, !i.rm ? '—' : i.ms === 'live' ? (i.im ? (i.al ? 'IN MATCH' : 'DOWN') : 'WATCHING') : 'LOBBY');
        el('td', 'mono', tr, i.rm ? `${i.k ?? 0} / ${i.d ?? 0}` : '—');
        el('td', 'mono', tr, i.alt !== undefined && i.rm ? `${Math.round(i.alt / 0.3048).toLocaleString('en-US')} ft` : '—');
        el('td', 'mono', tr, i.spd !== undefined && i.rm ? `${Math.round(i.spd * 1.94384)} kt · ${String(i.hdg ?? 0).padStart(3, '0')}°` : '—');
        const acts = el('div', 'adm-acts', el('td', '', tr));
        const inRoom = !!i.rm;
        const add = (label: string, cls: string, fn: () => void) => {
          const btn = button(label, `adm-btn sm ${cls}`, acts, fn);
          btn.disabled = !inRoom;
        };
        add('Message', '', () => void this.ask(`Message ${i.n}`, 'Only this pilot sees it.', 'Message').then((v) => { if (v) void this.cmd({ c: 'msg', id: i.id, text: v }, `messaged ${i.n}`); }));
        add(i.mu ? 'Unmute' : 'Mute', '', () => void this.cmd({ c: i.mu ? 'unmute' : 'mute', id: i.id }, `${i.mu ? 'unmuted' : 'muted'} ${i.n}`));
        add('Smite', 'god', () => void this.ask(`Smite ${i.n}?`, 'Their jet is destroyed on the spot.', 'Cause shown to them (optional)').then((v) => { if (v !== null) void this.cmd({ c: 'smite', id: i.id, text: v }, `smote ${i.n}`); }));
        add('Kick', 'warn', () => void this.ask(`Kick ${i.n}?`, 'Sent back to the menu; they can rejoin.', 'Reason (optional)').then((v) => { if (v !== null) void this.cmd({ c: 'kick', id: i.id, text: v }, `kicked ${i.n}`); }));
        add('Ban', 'danger', () => void this.askBan(r));
      }
    }

    // bans
    if (bans.length) {
      const bs = el('div', '', b);
      el('div', 'adm-h', bs, 'BANS');
      for (const x of bans) {
        const row = el('div', 'adm-acts', bs);
        el('span', 'mono', row, `${x.name} · ${x.until ? 'until ' + new Date(x.until).toLocaleString() : 'this session'}${x.reason ? ' · ' + x.reason : ''}`);
        button('Unban', 'adm-btn sm', row, () => {
          bans = bans.filter((y) => y !== x);
          saveBans();
          void this.cmd({ c: 'unban', text: x.by }, `unbanned ${x.name}`);
        });
      }
    }

    // log
    const ls = el('div', '', b);
    el('div', 'adm-h', ls, 'EVENT LOG');
    const log = el('div', 'adm-log', ls);
    if (!this.log.length) el('div', 'dim', log, 'Nothing yet.');
    for (const e of [...this.log].reverse().slice(0, 120)) {
      const d = el('div', `k-${e.kind}`, log);
      el('time', '', d, new Date(e.t).toLocaleTimeString([], { hour12: false }));
      d.appendChild(document.createTextNode(e.text));
    }
  }

  private toggleLock(id: string): void {
    if (this.locks.has(id)) this.locks.delete(id);
    else this.locks.add(id);
    // the lock list rides on our own presence; the admin topic proves it is ours
    setLobby({ lk: [...this.locks] });
    const name = ARTIFACT_ROOMS.find((d) => d.id === id)?.name ?? id;
    void this.cmd({ c: 'hi' }, `${this.locks.has(id) ? 'locked' : 'unlocked'} ${name}`);
    void this.render();
  }

  private async askBan(r: Row): Promise<void> {
    const v = await this.ask(`Ban ${r.info.n}?`, r.by ? 'Kicked now, and kept out of every room.' : 'Not signed in: the ban sticks to this copy of the game only.', 'Reason (optional)', [
      ['60', '1 hour'],
      ['1440', '1 day'],
      ['10080', '1 week'],
      ['0', 'This session'],
    ]);
    if (v === null) return;
    const [reason, min] = v.split('\u0000');
    if (r.by) {
      bans = bans.filter((b) => b.by !== r.by);
      bans.push({ by: r.by, name: r.info.n, until: +min ? Date.now() + +min * 60000 : 0, reason });
      saveBans();
    }
    await this.cmd({ c: 'ban', id: r.info.id, min: +min, text: reason }, `banned ${r.info.n}`);
  }

  private ask(title: string, text: string, input: string, select?: [string, string][]): Promise<string | null> {
    return new Promise((res) => {
      const back = el('div', 'adm-ask', document.body);
      const f = el('form', '', back);
      el('h3', '', f, title);
      el('p', '', f, text);
      const inp = el('input', '', f);
      inp.placeholder = input;
      inp.maxLength = 120;
      let sel: HTMLSelectElement | null = null;
      if (select) {
        sel = el('select', '', f);
        for (const [v, l] of select) {
          const o = el('option', '', sel, l);
          o.value = v;
        }
      }
      const row = el('div', 'row', f);
      const done = (v: string | null) => {
        back.remove();
        res(v);
      };
      const cancel = button('Cancel', 'adm-btn', row, () => done(null));
      cancel.type = 'button';
      const ok = button('OK', 'adm-btn god', row, () => {});
      ok.type = 'submit';
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        done(sel ? `${inp.value.trim()}\u0000${sel.value}` : inp.value.trim());
      });
      back.addEventListener('mousedown', (e) => {
        if (e.target === back) done(null);
      });
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      setTimeout(() => inp.focus(), 0);
    });
  }

  private toast(msg: string): void {
    const t = el('div', 'adm-toast', document.body, msg);
    setTimeout(() => t.remove(), 2600);
  }
}
