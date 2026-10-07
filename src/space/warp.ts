// The time warp, shared by every space mission: one smooth slider in place of a
// row of fixed speeds, and the look of time running fast.
//
// WarpBar: a logarithmic slider (1× at the left, the mission's top speed at the
// right). Drag it, click anywhere on it, or roll the mouse wheel over it; it
// clicks softly into the round numbers on the way. The thumb always shows the
// warp actually running, so it glides on its own when fast forward picks the
// speed, and a faint marker stays where the player set it when a burn holds the
// clock back. The readout rolls through the numbers, and the chrono dial beside
// it spins faster the faster time goes.
//
// WarpFx: a canvas over the scene. Light streams outward from the edges of the
// screen (the middle stays clear for the spacecraft), the edges glow and pulse,
// a shockwave ring bursts out when the warp engages and collapses back when it
// drops out, and each power of ten gives a smaller ring and a tick. With a
// whoosh up and down to match.

import { audio } from '../audio/audio';

export type WarpTone = 'space' | 'mars';

export interface WarpOpts {
  /** the top of the slider */
  max: number;
  /** the bottom (default 1×) */
  min?: number;
  /** labelled marks along the track (the slider clicks into these) */
  marks: number[];
  /** how a speed reads in the readout (default "1,250×") */
  fmt?: (w: number) => string;
  /** the marks' labels (default "1k", "1M") */
  markFmt?: (w: number) => string;
  tone?: WarpTone;
  /** narrower, for tight panels (no dial) */
  compact?: boolean;
  /** stretch to fill the row it sits in */
  fluid?: boolean;
  /** the player moved it */
  onPick: (w: number) => void;
}

const CSS = `
.wz{position:relative;display:flex;align-items:center;gap:9px;padding:5px 12px 5px 6px;border-radius:12px;background:linear-gradient(180deg,#0f1a28e8,#0a121ce8);border:1px solid #ffffff26;pointer-events:auto;user-select:none;-webkit-user-select:none;--wz-a:124,192,255;--wz-b:190,140,255;--wz-k:0;box-shadow:0 0 calc(4px + 22px * var(--wz-k)) rgba(var(--wz-a),calc(.12 + .35 * var(--wz-k)));transition:box-shadow .3s}
.wz.mars{--wz-a:255,168,104;--wz-b:255,214,140;background:linear-gradient(180deg,#24170fe8,#170e09e8)}
.wz.auto{--wz-a:255,196,92;--wz-b:255,236,170}
.wz-dial{position:relative;width:30px;height:30px;flex:none}
.wz-dial i{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(var(--wz-a),0) 0deg,rgba(var(--wz-a),.95) 300deg,#fff 352deg,rgba(var(--wz-a),0) 360deg);-webkit-mask:radial-gradient(circle,transparent 9px,#000 10px);mask:radial-gradient(circle,transparent 9px,#000 10px);opacity:calc(.35 + .65 * var(--wz-k))}
.wz-dial b{position:absolute;inset:4px;border-radius:50%;border:1px dashed rgba(var(--wz-b),.55)}
.wz-dial s{position:absolute;left:50%;top:50%;width:2px;height:10px;margin:-10px 0 0 -1px;background:#fff;border-radius:1px;transform-origin:50% 100%;box-shadow:0 0 6px rgba(var(--wz-a),.9)}
.wz-read{min-width:74px;display:flex;flex-direction:column;align-items:flex-start;line-height:1}
.wz-read b{font:700 17px 'Rajdhani',system-ui,sans-serif;letter-spacing:.04em;font-variant-numeric:tabular-nums;color:#fff;text-shadow:0 0 calc(10px * var(--wz-k)) rgba(var(--wz-a),.9);transition:transform .25s cubic-bezier(.2,1.6,.4,1)}
.wz.pop .wz-read b{transform:scale(1.22)}
.wz-read span{font:700 9px 'Rajdhani',system-ui,sans-serif;letter-spacing:.16em;white-space:nowrap;color:rgba(var(--wz-a),.9);margin-top:3px;min-height:9px}
.wz-track{position:relative;width:250px;height:34px;cursor:pointer;touch-action:none}
.wz.compact .wz-track{width:170px}
.wz.compact .wz-dial{display:none}
.wz.compact{padding-left:10px}
.wz.fluid{flex:1 1 auto;min-width:0}
.wz.fluid .wz-track{flex:1;width:auto;min-width:110px}
.wz.compact .wz-read{min-width:62px}
.wz.compact .wz-read b{font-size:15px}
.wz-rail{position:absolute;left:0;right:0;top:9px;height:6px;border-radius:3px;background:#ffffff16;overflow:hidden}
.wz-fill{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:linear-gradient(90deg,rgba(var(--wz-a),.35),rgba(var(--wz-a),.95) 70%,#fff);background-size:200% 100%}
.wz-fill:after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(115deg,transparent 0 10px,rgba(255,255,255,.38) 10px 13px,transparent 13px 22px);background-position:var(--wz-x,0) 0;opacity:calc(.15 + .85 * var(--wz-k))}
.wz-ghost{position:absolute;top:5px;width:2px;height:14px;margin-left:-1px;background:rgba(var(--wz-b),.85);border-radius:1px;display:none}
.wz-ghost.on{display:block}
.wz-thumb{position:absolute;top:3px;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff,rgba(var(--wz-a),1) 60%,rgba(var(--wz-a),.6));box-shadow:0 0 0 2px #0b1118,0 0 calc(6px + 18px * var(--wz-k)) rgba(var(--wz-a),.95)}
.wz-thumb:after{content:'';position:absolute;inset:-6px;border-radius:50%;border:1px solid rgba(var(--wz-a),.6);opacity:var(--wz-k);animation:wz-ring 1.1s linear infinite}
@keyframes wz-ring{from{transform:scale(.6);opacity:calc(.9 * var(--wz-k))}to{transform:scale(1.5);opacity:0}}
.wz.drag .wz-thumb{transform:scale(1.18)}
.wz-marks{position:absolute;left:0;right:0;top:23px;height:11px}
.wz-marks i{position:absolute;top:-8px;width:1px;height:4px;background:#ffffff40}
.wz-marks u{position:absolute;top:0;transform:translateX(-50%);font:600 9px 'Rajdhani',system-ui,sans-serif;letter-spacing:.06em;color:#ffffff80;text-decoration:none;white-space:nowrap;transition:color .2s}
.wz-marks u.on{color:#fff}
.wz-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
@media (max-width:700px){.wz-track{width:150px}.wz-dial{display:none}.wz-read{min-width:56px}}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function style(): void {
  if (document.getElementById('wz-style')) return;
  const st = document.createElement('style');
  st.id = 'wz-style';
  st.textContent = CSS;
  document.head.appendChild(st);
}

/** "1,250×" */
export function warpText(w: number): string {
  if (w < 10) return `${(Math.round(w * 10) / 10).toString()}×`;
  return `${Math.round(w).toLocaleString('en-US')}×`;
}
function markText(w: number): string {
  return w >= 1e6 ? `${w / 1e6}M` : w >= 1000 ? `${w / 1000}k` : `${w}`;
}

/** a round number near w: tenths below 10×, whole numbers to 100×, two figures above */
function nice(w: number): number {
  if (w < 10) return Math.round(w * 10) / 10;
  if (w < 100) return Math.round(w);
  const p = Math.pow(10, Math.floor(Math.log10(w)) - 1);
  return Math.round(w / p) * p;
}

export class WarpBar {
  readonly el: HTMLDivElement;
  /** the speed the player set */
  value: number;
  private min: number;
  private max: number;
  private fmt: (w: number) => string;
  private track: HTMLDivElement;
  private fill: HTMLDivElement;
  private thumb: HTMLDivElement;
  private ghost: HTMLDivElement;
  private readB: HTMLElement;
  private readS: HTMLElement;
  private hand: HTMLElement;
  private ring: HTMLElement;
  private markEls: HTMLElement[] = [];
  private marks: number[];
  /** what the thumb shows (0..1 along the track), gliding to the warp running */
  private su = 0;
  private dialA = 0;
  private stripe = 0;
  private dragId = -1;
  private lastLevel = 0;
  private popT = 0;
  private readKey = '';

  constructor(parent: HTMLElement, private o: WarpOpts) {
    style();
    this.min = o.min ?? 1;
    this.max = o.max;
    this.marks = o.marks;
    this.fmt = o.fmt ?? warpText;
    this.value = this.min;
    this.el = el('div', 'wz' + (o.tone === 'mars' ? ' mars' : '') + (o.compact ? ' compact' : '') + (o.fluid ? ' fluid' : ''), parent);
    this.el.title = 'Time warp: drag, click or roll the wheel. , and . step between the marks';
    const dial = el('div', 'wz-dial', this.el);
    this.ring = el('i', '', dial);
    el('b', '', dial);
    this.hand = el('s', '', dial);
    const read = el('div', 'wz-read', this.el);
    this.readB = el('b', '', read, '1×');
    this.readS = el('span', '', read, '');
    this.track = el('div', 'wz-track', this.el);
    this.track.setAttribute('role', 'slider');
    this.track.setAttribute('aria-label', 'Time warp');
    const rail = el('div', 'wz-rail', this.track);
    this.fill = el('div', 'wz-fill', rail);
    this.ghost = el('div', 'wz-ghost', this.track);
    const mk = el('div', 'wz-marks', this.track);
    for (const m of this.marks) {
      const u = this.uOf(m) * 100;
      el('i', '', mk).style.left = `${u}%`;
      // (a mark with no label is still a detent)
      const t = el('u', '', mk, (o.markFmt ?? markText)(m));
      t.style.left = `${u}%`;
      this.markEls.push(t);
    }
    this.thumb = el('div', 'wz-thumb', this.track);
    // dragging: anywhere on the track jumps there and keeps following
    this.track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      audio.init();
      this.dragId = e.pointerId;
      try {
        this.track.setPointerCapture(e.pointerId);
      } catch {
        /* (an old browser: the drag still works while over the track) */
      }
      this.el.classList.add('drag');
      this.fromX(e.clientX);
    });
    this.track.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.dragId) this.fromX(e.clientX);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.dragId) return;
      this.dragId = -1;
      this.el.classList.remove('drag');
    };
    this.track.addEventListener('pointerup', up);
    this.track.addEventListener('pointercancel', up);
    // (not the mission's camera zoom underneath)
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const u = this.uOf(this.value) - Math.sign(e.deltaY) * 0.03;
        this.pick(this.wOf(Math.max(0, Math.min(1, u))), true);
      },
      { passive: false },
    );
  }

  uOf(w: number): number {
    if (w <= this.min) return 0;
    return Math.min(1, Math.log(w / this.min) / Math.log(this.max / this.min));
  }
  wOf(u: number): number {
    return this.min * Math.pow(this.max / this.min, u);
  }

  private fromX(x: number): void {
    const r = this.track.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width)));
    this.pick(this.wOf(u), true);
  }

  /** set the speed (snapping into a mark when close), and tell the mission */
  pick(w: number, snap = false): void {
    let v = Math.max(this.min, Math.min(this.max, w));
    if (snap) {
      const u = this.uOf(v);
      let best = -1, bd = 0.022;
      this.marks.forEach((m, i) => {
        const d = Math.abs(this.uOf(m) - u);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      v = best >= 0 ? this.marks[best] : nice(v);
    }
    if (v === this.value) return;
    this.value = v;
    this.o.onPick(v);
  }

  /** the next mark up or down from the speed set */
  step(dir: number): void {
    const cur = this.value;
    const list = dir > 0 ? this.marks.filter((m) => m > cur * 1.001) : this.marks.filter((m) => m < cur * 0.999).reverse();
    this.pick(list.length ? list[0] : dir > 0 ? this.max : this.min);
  }

  /** set it from the mission's side (no callback): a reset, or an automatic stop */
  set(w: number): void {
    this.value = Math.max(this.min, Math.min(this.max, w));
  }

  /** set it and put the thumb straight there (a mission starting: no glide up from 1×) */
  jump(w: number): void {
    this.set(w);
    this.su = this.uOf(this.value);
    this.lastLevel = this.value >= 1 ? Math.floor(Math.log10(this.value) + 1e-6) : 0;
  }

  /**
   * Each frame: the warp actually running (0 when paused), and what is driving it.
   * auto: fast forward is picking the speed; held: something (a burn, a job) holds it below the setting.
   */
  update(dt: number, running: number, state: { auto?: boolean; paused?: boolean; note?: string } = {}): void {
    // the fill glides to the speed really running; the thumb stays exactly where it was set
    // (under fast forward the thumb is the automatic speed itself)
    const want = this.uOf(Math.max(this.min, running));
    this.su = this.su + (want - this.su) * (1 - Math.exp(-dt * 12));
    if (!Number.isFinite(this.su)) this.su = want;
    const k = Math.max(0, Math.min(1, this.su));
    const uv = this.uOf(this.value);
    const thumbU = state.auto ? k : uv;
    this.el.style.setProperty('--wz-k', state.paused ? '0' : k.toFixed(3));
    this.el.classList.toggle('auto', !!state.auto);
    this.thumb.style.left = `${(thumbU * 100).toFixed(2)}%`;
    this.fill.style.width = `${(k * 100).toFixed(2)}%`;
    // held back below the setting (a burn, low in the air, real time for a job): the fill stops short
    const held = !state.auto && !state.paused && uv - want > 0.02;
    this.ghost.classList.toggle('on', held);
    if (held) this.ghost.style.left = `${(k * 100).toFixed(2)}%`;
    // the stripes stream along the bar, faster with the warp
    this.stripe += dt * (8 + 160 * k * k);
    this.fill.style.setProperty('--wz-x', `${(this.stripe % 1000).toFixed(1)}px`);
    // the chrono dial: a turn every few seconds at 1×, a blur at the top
    this.dialA = (this.dialA + dt * (0.25 + 9 * k * k) * 360) % 360;
    this.hand.style.transform = `rotate(${this.dialA.toFixed(1)}deg)`;
    this.ring.style.transform = `rotate(${(this.dialA * 0.5).toFixed(1)}deg)`;
    // the readout: the speed running now, rolling through the numbers on its way
    const shown = state.paused ? 0 : this.wOf(this.su);
    const level = shown >= 1 ? Math.floor(Math.log10(shown) + 1e-6) : 0;
    if (level > this.lastLevel && !state.paused) this.popT = 0.25;
    this.lastLevel = level;
    this.popT = Math.max(0, this.popT - dt);
    this.el.classList.toggle('pop', this.popT > 0);
    const txt = state.paused ? 'PAUSED' : this.fmt(Math.abs(shown - running) / Math.max(1, running) < 0.004 ? running : nice(shown));
    const sub = state.paused
      ? ''
      : state.auto
        ? 'AUTO · NEXT EVENT'
        : held
          ? `SET ${this.fmt(this.value)} · ${state.note ?? 'HELD BACK'}`
          : state.note ?? (running > 1.01 ? 'TIME WARP' : 'REAL TIME');
    const key = txt + '|' + sub;
    if (key !== this.readKey) {
      this.readKey = key;
      this.readB.textContent = txt;
      this.readS.textContent = sub;
      this.track.setAttribute('aria-valuetext', sub ? `${txt}, ${sub.toLowerCase()}` : txt);
    }
    // the mark the thumb is on lights up
    this.markEls.forEach((m, i) => m.classList.toggle('on', Math.abs(this.uOf(this.marks[i]) - thumbU) < 0.02));
  }
}

// ---------------------------------------------------------------- the look of it

interface Streak {
  a: number;
  r: number;
  v: number;
  b: number;
  warm: boolean;
}
interface Ring {
  t: number;
  dur: number;
  out: boolean;
  s: number;
}

const TONES: Record<WarpTone, { streak: string; warm: string; glow: string; ringA: string; ringB: string }> = {
  space: { streak: '205,228,255', warm: '255,236,210', glow: '64,140,255', ringA: '120,200,255', ringB: '200,140,255' },
  mars: { streak: '255,226,196', warm: '255,250,235', glow: '255,120,50', ringA: '255,176,110', ringB: '255,226,150' },
};

export class WarpFx {
  readonly cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private streaks: Streak[] = [];
  private rings: Ring[] = [];
  private k = 0;
  private flashA = 0;
  private time = 0;
  private prev = 1;
  private lastLevel = 0;
  private lastRingAt = -9;
  private clear = true;
  private calm: boolean;
  private c: (typeof TONES)['space'];

  /** full: the warp at which the effect is at its strongest; quiet: the warp it starts from */
  constructor(parent: HTMLElement, private full: number, tone: WarpTone = 'space', private quiet = 1) {
    style();
    this.cv = document.createElement('canvas');
    this.cv.className = 'wz-fx';
    parent.insertBefore(this.cv, parent.firstChild);
    this.g = this.cv.getContext('2d');
    this.c = TONES[tone];
    let calm = false;
    try {
      calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      /* (no media queries: full effects) */
    }
    this.calm = calm;
    // (no light streaks: players found them too distracting; the glowing edges and the rings stay)
  }

  private spawn(r: number): Streak {
    return { a: Math.random() * Math.PI * 2, r, v: 0.35 + Math.random() * 0.9, b: 0.4 + Math.random() * 0.6, warm: Math.random() < 0.12 };
  }

  /** a fresh start (a new mission at this warp): no leftover glow, no burst for the first speed */
  reset(w = 1): void {
    this.k = 0;
    this.rings = [];
    this.flashA = 0;
    this.prev = Math.max(1, w);
    this.lastLevel = Math.floor(Math.log10(Math.max(1, w)) + 1e-6);
  }

  /** each frame: real seconds, the warp running now (0 when paused), the screen in CSS pixels */
  update(dt: number, warp: number, w: number, h: number): void {
    const g = this.g;
    if (!g) return;
    this.time += dt;
    const wv = Math.max(1, warp);
    // the bursts: going into warp, coming out of it, and each power of ten on the way up
    const level = Math.floor(Math.log10(wv) + 1e-6);
    const q = Math.max(1, this.quiet);
    if (this.prev <= q * 1.05 && wv > q * 1.5) this.burst(true, 0.55 + 0.45 * this.target(wv));
    else if (this.prev > q * 3 && wv <= q * 1.05) {
      this.burst(false, 0.5 + 0.5 * this.k);
      this.flashA = 0.22 * (0.4 + this.k);
    } else if (level > this.lastLevel && level >= 1 && this.prev > q * 1.05) {
      if (this.time - this.lastRingAt > 0.3) {
        this.rings.push({ t: 0, dur: 0.6, out: true, s: 0.32 });
        this.lastRingAt = this.time;
        audio.warpTick(level);
      }
    }
    this.lastLevel = level;
    this.prev = warp <= 0 ? this.prev : wv;
    // the strength follows the warp (quick to rise, quicker to fall)
    const tk = warp <= 0 ? 0 : this.target(wv);
    this.k += (tk - this.k) * (1 - Math.exp(-dt * (tk > this.k ? 3.5 : 5)));
    this.flashA = Math.max(0, this.flashA - dt * 0.7);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    const busy = this.k > 0.004 || this.rings.length > 0 || this.flashA > 0.002;
    // size the canvas to the screen, at no more than one pixel per CSS pixel (soft light needs no more)
    const sc = Math.min(1, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(w * sc)), H = Math.max(1, Math.round(h * sc));
    if (this.cv.width !== W || this.cv.height !== H) {
      this.cv.width = W;
      this.cv.height = H;
      this.clear = false;
    }
    if (!busy) {
      if (!this.clear) {
        g.clearRect(0, 0, W, H);
        this.clear = true;
      }
      return;
    }
    this.clear = false;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const R = Math.hypot(cx, cy);
    const k = this.k;
    const c = this.c;
    // the edges glow and breathe, faster as time speeds up
    if (k > 0.004) {
      const pulse = 1 + 0.16 * Math.sin(this.time * (1.6 + 5 * k));
      const gr = g.createRadialGradient(cx, cy, R * 0.42, cx, cy, R);
      gr.addColorStop(0, `rgba(${c.glow},0)`);
      gr.addColorStop(0.65, `rgba(${c.glow},${(0.1 * k * pulse).toFixed(3)})`);
      gr.addColorStop(1, `rgba(${c.glow},${(0.34 * k * pulse).toFixed(3)})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    g.globalCompositeOperation = 'lighter';
    // light streaming outward past the edges (the middle stays clear)
    if (k > 0.01 && this.streaks.length) {
      const speed = 0.12 + 2.6 * k * k;
      const len = 0.02 + 0.3 * k * k;
      g.lineCap = 'round';
      g.lineWidth = (0.8 + 1.6 * k) * sc;
      for (const s of this.streaks) {
        s.r += dt * s.v * speed * (0.35 + s.r);
        if (s.r > 1.2) Object.assign(s, this.spawn(0.14 + Math.random() * 0.22));
        const fade = Math.min(1, Math.max(0, (s.r - 0.22) / 0.3));
        const a = k * fade * s.b * (0.25 + 0.55 * k);
        if (a < 0.01) continue;
        const r1 = s.r * R, r0 = Math.max(0, s.r - len * (0.5 + s.r)) * R;
        const ca = Math.cos(s.a), sa = Math.sin(s.a);
        g.strokeStyle = `rgba(${s.warm ? c.warm : c.streak},${a.toFixed(3)})`;
        g.beginPath();
        g.moveTo(cx + ca * r0, cy + sa * r0);
        g.lineTo(cx + ca * r1, cy + sa * r1);
        g.stroke();
      }
    }
    // the shockwave rings: two colours a hair apart, for a little chromatic fringe
    for (const r of this.rings) {
      const e = r.t / r.dur;
      const ee = 1 - Math.pow(1 - e, 3);
      const rad = (r.out ? 0.04 + 1.22 * ee : 1.25 - 1.12 * ee) * R;
      const a = r.s * Math.pow(1 - e, 1.4);
      g.lineWidth = (2 + 12 * (1 - e)) * sc * (r.out ? 1 : 0.8);
      for (const [col, off] of [[c.ringA, 0], [c.ringB, 6 * sc]] as [string, number][]) {
        g.strokeStyle = `rgba(${col},${(a * (off ? 0.7 : 1)).toFixed(3)})`;
        g.beginPath();
        g.arc(cx, cy, Math.max(1, rad + off), 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';
    // the drop out of warp: a brief wash of light
    if (this.flashA > 0.002) {
      g.fillStyle = `rgba(${c.ringA},${this.flashA.toFixed(3)})`;
      g.fillRect(0, 0, W, H);
    }
  }

  private target(w: number): number {
    const q = Math.max(1, this.quiet);
    return Math.max(0, Math.min(1, Math.log10(w / q) / Math.log10(Math.max(10, this.full / q))));
  }

  private burst(out: boolean, s: number): void {
    if (this.time - this.lastRingAt < 0.2) return;
    this.lastRingAt = this.time;
    if (!this.calm) this.rings.push({ t: 0, dur: out ? 0.75 : 0.55, out, s });
    audio.warp(out, s);
  }
}
