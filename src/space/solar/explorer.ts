// SOLAR SYSTEM EXPLORER: a free tour of the solar system at its real scale and
// on its real orbits. Pick any planet or major moon and the camera flies to
// it; drag to circle it, scroll to come in close or pull back until the
// planets are points of light; run the clock forward to watch the moons go
// round and the planets turn. Each world has an info card with its real
// numbers.

import * as THREE from 'three';
import { SolarView } from './solarView';
import { BODIES, BodyId, PLANETS, bodyPos, orbitPeriodDays } from './bodies';
import { AU, Vec, dateText } from '../mars/marsPhysics';
import { menuMusic } from '../../audio/menuMusic';
import { audio } from '../../audio/audio';
import { WarpBar, WarpFx } from '../warp';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

/** clock speeds: simulated seconds per real second (the marks on the slider) */
const MARKS = [1, 60, 3600, 86400, 7 * 86400, 30.44 * 86400, 365.25 * 86400];
const MARK_NAMES = ['REAL', '1 MIN', '1 HR', '1 DAY', '', '1 MO', '1 YR'];

/** a clock speed as time per second: "3.5 DAYS/S" */
function rateText(w: number): string {
  const u: [number, string, string][] = [[365.25 * 86400, 'YR', 'YRS'], [30.44 * 86400, 'MO', 'MO'], [7 * 86400, 'WK', 'WKS'], [86400, 'DAY', 'DAYS'], [3600, 'HR', 'HRS'], [60, 'MIN', 'MIN']];
  for (const [s, one, many] of u) {
    if (w >= s * 0.995) {
      const v = w / s;
      const t = v < 10 ? (Math.round(v * 10) / 10).toString() : Math.round(v).toString();
      return `${t} ${t === '1' ? one : many}/S`;
    }
  }
  return w <= 1.01 ? 'REAL TIME' : `${Math.round(w)} S/S`;
}

const STYLE = `
.sx-chips{position:absolute;left:16px;right:340px;top:92px;display:flex;flex-wrap:wrap;gap:6px;pointer-events:auto}
@media (max-width:700px){.sx-chips{right:16px}}
.sx-chips button{background:#101820d8;border:1px solid #ffffff26;color:#dfe7f0;border-radius:16px;padding:5px 11px;font:600 12px Rajdhani,system-ui;letter-spacing:.12em}
.sx-chips button.on{background:#e9eef5;color:#0b1118}
.sx-chips button.moon{border-style:dashed}
.sx-info{position:absolute;right:16px;top:14px;width:min(300px,calc(100vw - 32px));background:#0b1118c4;border:1px solid #ffffff1c;border-radius:10px;padding:12px 14px;backdrop-filter:blur(6px);pointer-events:auto}
.sx-info h3{margin:0 0 6px;font:800 20px Rajdhani,system-ui;letter-spacing:.14em}
.sx-info .row{display:flex;justify-content:space-between;font-size:12px;color:#9fb3c8;letter-spacing:.08em;margin:2px 0}
.sx-info .row b{color:#e9eef5;font-weight:600}
.sx-info p{font-size:13px;line-height:1.45;color:#cfd9e4;margin:8px 0 0}
@media (max-width:700px){.sx-info{top:auto;bottom:150px}}
`;

export class SolarExplorer {
  active = false;
  drawWith: ((scene: THREE.Scene, camera: THREE.Camera) => void) | null = null;
  onExit: (() => void) | null = null;
  private view: SolarView | null = null;
  private jd = 0;
  /** the clock's speed, simulated seconds per real second */
  private warp = 3600;
  private paused = false;
  private warpBar: WarpBar;
  private warpFx: WarpFx;
  private elPause: HTMLButtonElement;
  private focus: BodyId = 'earth';
  /** the flight from one body to the next */
  private move: { from: BodyId; to: BodyId; t: number; d0: number; d1: number } | null = null;
  private yaw = 0.6;
  private pitch = 0.25;
  /** distance from the focused body's centre, in its radii */
  private zoom = 4;
  private drag: { id: number; x: number; y: number } | null = null;
  private ui: HTMLDivElement;
  private elDate: HTMLElement;
  private elChips: HTMLDivElement;
  private elInfo: HTMLDivElement;
  private elLabels: HTMLDivElement;
  private chipFor = '';

  constructor(parent: HTMLElement) {
    if (!document.getElementById('sx-style')) {
      const st = document.createElement('style');
      st.id = 'sx-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    // (the Starship mission's stylesheet supplies the shared mm-* look)
    this.ui = el('div', 'mm-ui hidden', parent);
    this.elLabels = el('div', '', this.ui);
    const tl = el('div', 'mm-tl', this.ui);
    el('div', 'mm-k', tl, 'SPACE PROGRAM');
    el('div', 'mm-ph', tl, 'SOLAR SYSTEM EXPLORER');
    this.elDate = el('div', 'mm-date', tl, '');
    this.elInfo = el('div', 'sx-info', this.ui);
    this.elChips = el('div', 'sx-chips', this.ui);
    const bot = el('div', 'mm-bot', this.ui);
    this.elPause = el('button', 'mm-btn', bot, '❚❚');
    this.elPause.title = 'Stop the clock (SPACE)';
    this.elPause.addEventListener('click', () => (this.paused = !this.paused));
    this.warpBar = new WarpBar(bot, {
      max: MARKS[MARKS.length - 1],
      marks: MARKS,
      fmt: rateText,
      markFmt: (w) => MARK_NAMES[MARKS.indexOf(w)] ?? '',
      onPick: (w) => {
        this.warp = w;
        this.paused = false;
      },
    });
    // (calm at an hour a second, the explorer's everyday pace; full at a year a second)
    this.warpFx = new WarpFx(this.ui, MARKS[MARKS.length - 1], 'space', 3600);
    const now = el('button', 'mm-btn', bot, 'TODAY');
    now.addEventListener('click', () => (this.jd = Date.now() / 86_400_000 + 2_440_587.5));
    const ex = el('button', 'mm-btn', bot, 'EXIT');
    ex.addEventListener('click', () => this.exit());

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      let used = true;
      if (e.code === 'Escape') this.exit();
      else if (e.code === 'BracketRight' || e.code === 'BracketLeft') {
        const list = this.tourList();
        const i = list.indexOf(this.focus);
        this.goTo(list[(i + (e.code === 'BracketRight' ? 1 : list.length - 1)) % list.length]);
      } else if (e.code === 'Digit1' || e.code === 'Space') this.paused = !this.paused;
      else if (/^Digit[2-7]$/.test(e.code)) {
        this.warp = MARKS[Number(e.code.slice(5)) - 1];
        this.warpBar.set(this.warp);
        this.paused = false;
      } else if (e.code === 'Comma' || e.code === 'Period') this.warpBar.step(e.code === 'Period' ? 1 : -1);
      else used = false;
      if (used) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, { capture: true });
    window.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('button, .sx-info')) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      this.yaw -= (e.clientX - this.drag.x) * 0.005;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + (e.clientY - this.drag.y) * 0.004));
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('wheel', (e) => {
      if (!this.active) return;
      // from just above the surface out to where the whole solar system fits in view
      const maxZoom = (60 * AU) / BODIES[this.focus].R;
      this.zoom = Math.max(1.35, Math.min(maxZoom, this.zoom * Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0022)));
    }, { passive: true });
  }

  start(): void {
    if (!this.view) this.view = new SolarView();
    this.jd = Date.now() / 86_400_000 + 2_440_587.5;
    this.focus = 'earth';
    this.move = null;
    this.zoom = 4;
    this.yaw = 0.6;
    this.pitch = 0.25;
    this.warp = 3600;
    this.warpBar.jump(this.warp);
    this.paused = false;
    this.warpFx.reset(this.warp);
    this.chipFor = '';
    this.faceSun();
    this.active = true;
    this.ui.classList.remove('hidden');
    menuMusic.want('flight', true);
    this.info();
  }

  stop(): void {
    this.active = false;
    this.ui.classList.add('hidden');
    menuMusic.want('flight', false);
  }

  private exit(): void {
    this.stop();
    this.onExit?.();
  }

  /** the Sun, the planets, and the moons of the planet in focus */
  private tourList(): BodyId[] {
    const home = BODIES[this.focus].parent && BODIES[this.focus].parent !== 'sun' ? BODIES[this.focus].parent! : this.focus;
    const moons = (Object.keys(BODIES) as BodyId[]).filter((id) => BODIES[id].parent === home);
    const list: BodyId[] = ['sun'];
    for (const p of PLANETS) {
      list.push(p);
      if (p === home) list.push(...moons);
    }
    return list;
  }

  private goTo(id: BodyId): void {
    if (id === this.focus && !this.move) return;
    audio.init();
    audio.click();
    const d0 = this.zoom * BODIES[this.focus].R;
    const zoom1 = id === 'sun' ? 6 : 4;
    this.move = { from: this.focus, to: id, t: 0, d0, d1: zoom1 * BODIES[id].R };
    this.focus = id;
    this.zoom = zoom1;
    this.faceSun();
    this.info();
  }

  /** put the camera on the sunlit side of the body in focus, a little off the Sun line */
  private faceSun(): void {
    if (this.focus === 'sun') return;
    const p = bodyPos(this.focus, this.jd);
    this.yaw = Math.atan2(-p[1], -p[0]) + 0.55;
    this.pitch = 0.22;
  }

  private chips(): void {
    const list = this.tourList();
    const key = list.join(',') + '|' + this.focus;
    if (key === this.chipFor) return;
    this.chipFor = key;
    this.elChips.textContent = '';
    for (const id of list) {
      const b = el('button', (id === this.focus ? 'on ' : '') + (BODIES[id].parent && BODIES[id].parent !== 'sun' ? 'moon' : ''), this.elChips, BODIES[id].name.replace(/^The /, '').toUpperCase());
      b.addEventListener('click', () => this.goTo(id));
    }
  }

  private info(): void {
    const b = BODIES[this.focus];
    const rows: [string, string][] = [];
    rows.push(['RADIUS', `${Math.round(b.R / 1000).toLocaleString('en-US')} km`]);
    if (b.parent) {
      const days = orbitPeriodDays(this.focus);
      rows.push(['ORBIT', days > 700 ? `${(days / 365.25).toFixed(1)} years` : `${days.toFixed(days < 10 ? 2 : 1)} days`]);
    }
    const h = Math.abs(b.rot);
    rows.push(['DAY', `${h > 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} hours`}${b.rot < 0 ? ' (backwards)' : ''}`]);
    rows.push(['SURFACE GRAVITY', `${(b.mu / (b.R * b.R)).toFixed(2)} m/s²`]);
    this.elInfo.innerHTML = `<h3>${b.name.toUpperCase()}</h3>` + rows.map(([k, v]) => `<div class="row">${k}<b>${v}</b></div>`).join('') + `<div class="row">FROM THE SUN<b data-k="sun"></b></div>` + b.facts.map((f) => `<p>${f}</p>`).join('');
  }

  frame(dtReal: number, w: number, h: number): void {
    const sv = this.view;
    if (!sv) return;
    const dt = Number.isFinite(dtReal) ? Math.max(0, Math.min(0.1, dtReal)) : 0;
    this.jd += (dt * (this.paused ? 0 : this.warp)) / 86400;
    // where the camera looks: the body in focus (flying between two on a change)
    let target = bodyPos(this.focus, this.jd);
    let dist = this.zoom * BODIES[this.focus].R;
    if (this.move) {
      const m = this.move;
      m.t = Math.min(1, m.t + dt / 2.6);
      const e = m.t * m.t * (3 - 2 * m.t);
      const a = bodyPos(m.from, this.jd), b = bodyPos(m.to, this.jd);
      target = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
      // pull back on the way, to keep both ends in sight
      const gap = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const ld = Math.log(m.d0) + (Math.log(m.d1) - Math.log(m.d0)) * e;
      const peak = Math.max(ld, Math.log(Math.max(m.d0, m.d1, gap * 0.6)));
      dist = Math.exp(ld + (peak - ld) * Math.sin(Math.PI * e));
      if (m.t >= 1) this.move = null;
    }
    const cp = Math.cos(this.pitch);
    const dir: Vec = [cp * Math.cos(this.yaw), cp * Math.sin(this.yaw), Math.sin(this.pitch)];
    const cam: Vec = [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist];
    sv.origin = target;
    sv.update({ jd: this.jd, cam, look: target, up: [0, 0, 1], fov: 45 }, w, h);
    this.drawWith?.(sv.scene, sv.camera);
    this.hud(w, h, target, dt);
  }

  private hud(w: number, h: number, target: Vec, dt: number): void {
    // where the panels are (the world buttons and the info card), read before anything
    // on the page changes this frame so it costs no extra layout; no names go under them
    const o = this.ui.getBoundingClientRect();
    const panels = [this.elChips, this.elInfo].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    this.elDate.textContent = dateText(this.jd);
    this.elPause.classList.toggle('on', this.paused);
    this.elPause.textContent = this.paused ? '▶' : '❚❚';
    this.warpBar.update(dt, this.paused ? 0 : this.warp, { paused: this.paused });
    this.warpFx.update(dt, this.paused ? 0 : this.warp, w, h);
    this.chips();
    const sun = this.elInfo.querySelector('[data-k="sun"]');
    if (sun) sun.textContent = this.focus === 'sun' ? '—' : `${(Math.hypot(...target) / AU).toFixed(3)} AU`;
    // names on the worlds in view (the focus first, then the rest where they don't overlap)
    const sv = this.view!;
    const ids = [this.focus, ...this.tourList().filter((i) => i !== this.focus)];
    const placed: [number, number, number][] = [];
    let html = '';
    for (const id of ids) {
      const p = sv.project(id, w, h);
      if (!p || p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40 || p.r > h * 0.42) continue;
      const name = BODIES[id].name.replace(/^The /, '').toUpperCase();
      const y = p.y - Math.max(8, p.r) - 6;
      const hw = name.length * 4.6 + 6;
      if (placed.some(([x0, y0, w0]) => Math.abs(x0 - p.x) < hw + w0 && Math.abs(y0 - y) < 15)) continue;
      if (panels.some((r) => p.x + hw > r.left - o.left && p.x - hw < r.right - o.left && y > r.top - o.top && y - 14 < r.bottom - o.top)) continue;
      placed.push([p.x, y, hw]);
      html += `<div style="position:absolute;left:${p.x.toFixed(0)}px;top:${y.toFixed(0)}px;transform:translate(-50%,-100%);font:600 11px Rajdhani,system-ui;letter-spacing:.14em;color:${id === this.focus ? '#ffffff' : '#cfe3ff'};text-shadow:0 1px 3px #000">${name}</div>`;
    }
    if (html !== this.elLabels.innerHTML) this.elLabels.innerHTML = html;
  }
}
