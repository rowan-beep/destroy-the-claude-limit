// The first thing on screen: TRIAD, and its two programs side by side, each one
// a picture from the game. Picking one starts the music and the loading screen:
// cinematic shots of that program cross-fading over each other, a fact along the
// bottom, and a bar that fills smoothly while the game loads that program behind
// it (models, textures, shaders), so the menu comes up ready. It takes 17 s from
// the click to the menu, however fast the loading is.

import { el } from '../dom';
import type { Program } from '../menu/program';
import { menuMusic } from '../../audio/menuMusic';
import { audio } from '../../audio/audio';
import { AIR_FACTS, SPACE_FACTS } from './facts';
import { SHOTS, Shot, shotUrl } from './shots';
import { markPicked } from './introSkip';

/** from the click to the menu on screen (s) */
const TOTAL = 17;
/** the last part of it: the fade into the menu */
const FADE_OUT = 1.3;
/** each picture's turn, and the cross-fade between two */
const SHOT_T = 4;
const SHOT_FADE = 1.4;
/** each fact's turn */
const FACT_T = 7;

const CSS = /* css */ `
.tl{position:fixed;inset:0;z-index:9000;background:#020306;color:#eef3f8;font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;overflow:hidden;user-select:none;transition:opacity ${FADE_OUT}s ease}
.tl.out{opacity:0;pointer-events:none}
.tl *{box-sizing:border-box}
/* ---- the picker */
.tl-pick{position:absolute;inset:0;display:flex;transition:opacity .9s ease,transform 1.4s cubic-bezier(.2,.7,.2,1)}
.tl-pick.gone{opacity:0;transform:scale(1.04);pointer-events:none}
.tl-side{position:relative;flex:1;overflow:hidden;cursor:pointer;transition:flex 1s cubic-bezier(.2,.8,.2,1);outline:none}
.tl-side:hover,.tl-side:focus-visible,.tl-side.sel{flex:1.6}
.tl-side .bg{position:absolute;inset:-4%;background-size:cover;background-position:center;opacity:0;transform:scale(1.08);transition:opacity 1.6s ease,transform 14s linear,filter .8s;filter:brightness(.55) saturate(1.05)}
.tl-side .bg.in{opacity:1;transform:scale(1)}
.tl-side:hover .bg,.tl-side.sel .bg{filter:brightness(.85) saturate(1.1)}
.tl-side.air .fb{background:radial-gradient(120% 90% at 30% 70%,#d9733a 0%,#5a2a3c 38%,#101a33 70%,#04060c 100%)}
.tl-side.space .fb{background:radial-gradient(90% 70% at 70% 40%,#2b3d6e 0%,#0c1430 45%,#020309 80%),#020309}
.tl-side .fb{position:absolute;inset:0}
.tl-side::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,#0008 0%,#0000 30%,#0000 55%,#000c 100%);pointer-events:none}
.tl-side.air{clip-path:polygon(0 0,100% 0,calc(100% - 6vh) 100%,0 100%);margin-right:-3vh}
.tl-side.space{clip-path:polygon(6vh 0,100% 0,100% 100%,0 100%);margin-left:-3vh}
.tl-card{position:absolute;bottom:10vh;z-index:2;padding:0 6vw;transition:transform .8s cubic-bezier(.2,.8,.2,1)}
.tl-side.space .tl-card{right:0;text-align:right}
.tl-side:hover .tl-card,.tl-side.sel .tl-card{transform:translateY(-1.5vh)}
.tl-card .k{font-size:clamp(11px,1.3vh,15px);letter-spacing:.5em;color:#ffb35c;font-weight:700}
.tl-side.space .tl-card .k{color:#8fc4ff}
.tl-card .t{font-size:clamp(34px,7vh,92px);font-weight:800;letter-spacing:.05em;line-height:.95;margin:.25em 0 .2em;text-shadow:0 4px 30px #000a}
.tl-card .d{font-size:clamp(13px,1.8vh,19px);letter-spacing:.12em;color:#d7dde6;opacity:.85;max-width:34em}
.tl-card .go{display:inline-block;margin-top:2.2vh;padding:.7em 1.6em;border:1px solid #fff6;border-radius:999px;font-size:clamp(12px,1.5vh,16px);letter-spacing:.3em;font-weight:700;background:#ffffff10;backdrop-filter:blur(6px);transition:background .3s,border-color .3s,letter-spacing .4s}
.tl-side:hover .go,.tl-side.sel .go{background:#ffffff26;border-color:#fff;letter-spacing:.38em}
.tl-logo{position:absolute;left:0;right:0;top:7vh;z-index:3;text-align:center;pointer-events:none}
.tl-logo .m{font-size:clamp(40px,9vh,120px);font-weight:800;letter-spacing:.42em;padding-left:.42em;text-shadow:0 0 40px #fff3,0 6px 30px #000;animation:tlIn 2.2s cubic-bezier(.2,.7,.2,1) both}
.tl-logo .r{height:2px;width:min(46vw,620px);margin:1.2vh auto;background:linear-gradient(90deg,#0000,#ffb35c,#fff,#8fc4ff,#0000);animation:tlRule 2.4s .4s cubic-bezier(.2,.7,.2,1) both}
.tl-logo .s{font-size:clamp(11px,1.5vh,16px);letter-spacing:.6em;padding-left:.6em;color:#cfd6df;animation:tlIn 2s .8s ease both}
@keyframes tlIn{from{opacity:0;letter-spacing:.9em;filter:blur(8px)}to{opacity:1}}
@keyframes tlRule{from{transform:scaleX(0);opacity:0}to{transform:none;opacity:1}}
.tl-hint{position:absolute;bottom:3vh;left:0;right:0;text-align:center;z-index:3;font-size:12px;letter-spacing:.35em;color:#fff8;pointer-events:none;animation:tlIn 2s 1.6s ease both}
/* ---- the loading screen */
.tl-load{position:absolute;inset:0;opacity:0;transition:opacity 1.2s ease}
.tl-load.on{opacity:1}
.tl-shot{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;will-change:opacity,transform;transition:opacity ${SHOT_FADE}s ease}
.tl-shot.in{opacity:1}
.tl-fb{position:absolute;inset:0}
.tl-load.air .tl-fb{background:radial-gradient(120% 90% at 30% 70%,#d9733a 0%,#5a2a3c 38%,#101a33 70%,#04060c 100%)}
.tl-load.space .tl-fb{background:radial-gradient(90% 70% at 70% 40%,#2b3d6e 0%,#0c1430 45%,#020309 80%),#020309}
.tl-shade{position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 45%,#0000 55%,#0009 100%),linear-gradient(180deg,#0000 60%,#000d 100%);pointer-events:none}
.tl-bars::before,.tl-bars::after{content:'';position:absolute;left:0;right:0;height:6.5vh;background:#000;z-index:2}
.tl-bars::before{top:0}.tl-bars::after{bottom:0}
.tl-cap{position:absolute;right:4vw;top:calc(6.5vh + 2.4vh);z-index:3;text-align:right;font-size:clamp(11px,1.4vh,15px);letter-spacing:.32em;color:#fffc;text-shadow:0 1px 8px #000;transition:opacity .8s}
.tl-brand{position:absolute;left:4vw;top:calc(6.5vh + 2vh);z-index:3;text-shadow:0 2px 12px #000}
.tl-brand .m{font-size:clamp(22px,3.4vh,40px);font-weight:800;letter-spacing:.35em}
.tl-brand .p{font-size:clamp(11px,1.4vh,15px);letter-spacing:.42em;color:#ffb35c;margin-top:.3vh}
.tl-load.space .tl-brand .p{color:#8fc4ff}
.tl-foot{position:absolute;left:4vw;right:4vw;bottom:calc(6.5vh + 2.6vh);z-index:3}
.tl-fact{min-height:3.4em;max-width:62em;margin-bottom:2.2vh;transition:opacity .9s ease,transform .9s ease;text-shadow:0 2px 10px #000}
.tl-fact.hide{opacity:0;transform:translateY(8px)}
.tl-fact .h{font-size:clamp(10px,1.25vh,13px);letter-spacing:.42em;color:#ffb35c;font-weight:700;margin-bottom:.5vh}
.tl-load.space .tl-fact .h{color:#8fc4ff}
.tl-fact .x{font-size:clamp(15px,2.15vh,24px);letter-spacing:.03em;line-height:1.35;color:#f2f5f8}
.tl-bar{position:relative;height:3px;background:#ffffff1f;border-radius:2px;overflow:hidden}
.tl-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#ffb35c,#fff);box-shadow:0 0 12px #ffb35c99;border-radius:2px}
.tl-load.space .tl-fill{background:linear-gradient(90deg,#5aa8ff,#fff);box-shadow:0 0 12px #5aa8ff99}
.tl-fill::after{content:'';position:absolute;right:0;top:-3px;bottom:-3px;width:40px;background:radial-gradient(closest-side,#fff,#fff0);opacity:.8}
.tl-meta{display:flex;justify-content:space-between;margin-top:1vh;font-size:clamp(10px,1.25vh,13px);letter-spacing:.3em;color:#fffa}
@media (max-aspect-ratio: 4/5){.tl-pick{flex-direction:column}.tl-side.air,.tl-side.space{clip-path:none;margin:0}.tl-card{bottom:6vh}}
@media (prefers-reduced-motion: reduce){.tl-shot,.tl-side .bg{transition:opacity 1s ease !important}}
`;

const shuffle = <T,>(a: T[]): T[] => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** load and decode a picture off the main thread's critical path; null if it can't be had */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      // (decoded before it is shown: an 8K picture would otherwise stall the fade)
      (img.decode ? img.decode() : Promise.resolve()).then(() => res(img), () => res(img));
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

export class Launcher {
  private root: HTMLDivElement;
  private pickEl: HTMLDivElement;
  private loadEl: HTMLDivElement | null = null;
  private picked: Program | null = null;
  private pickResolve!: (p: Program) => void;
  /** resolves with the program the player picked */
  readonly chosen: Promise<Program>;
  // loading
  private t0 = 0;
  private work = 0;
  private workLabel = 'LOADING';
  private workDone = false;
  private shown = 0;
  private raf = 0;
  private fill: HTMLElement | null = null;
  private pct: HTMLElement | null = null;
  private lbl: HTMLElement | null = null;
  private doneResolve: (() => void) | null = null;
  private finished = false;
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(last: Program) {
    if (!document.getElementById('tl-css')) {
      const st = el('style', '', document.head);
      st.id = 'tl-css';
      st.textContent = CSS;
    }
    this.root = el('div', 'tl', document.body);
    this.chosen = new Promise((r) => (this.pickResolve = r));
    this.pickEl = el('div', 'tl-pick', this.root);
    const side = (p: Program, kicker: string, title: string, desc: string) => {
      const s = el('div', `tl-side ${p}` + (p === last ? ' sel' : ''), this.pickEl);
      s.tabIndex = 0;
      s.setAttribute('role', 'button');
      s.setAttribute('aria-label', title);
      el('div', 'fb', s);
      const bg = el('div', 'bg', s);
      const hero = SHOTS[p][0];
      if (hero) void loadImage(shotUrl(p, hero)).then((img) => {
        if (!img) return;
        bg.style.backgroundImage = `url("${img.src}")`;
        requestAnimationFrame(() => bg.classList.add('in'));
      });
      const c = el('div', 'tl-card', s);
      el('div', 'k', c, kicker);
      el('div', 't', c, title);
      el('div', 'd', c, desc);
      el('div', 'go', c, 'ENTER');
      s.addEventListener('mouseenter', () => this.select(p));
      s.addEventListener('click', () => this.pick(p));
      return s;
    };
    side('air', 'PROGRAM 01', 'AIR COMBAT', 'Thirteen jets, carriers, campaigns, airshows and dogfights over a 400-mile theater.');
    side('space', 'PROGRAM 02', 'SPACE EXPLORATION', 'Saturn V to the Moon, Falcon, Starship, the ISS, rovers on Mars and the whole Solar System.');
    const logo = el('div', 'tl-logo', this.pickEl);
    el('div', 'm', logo, 'TRIAD');
    el('div', 'r', logo);
    el('div', 's', logo, 'CHOOSE YOUR PROGRAM');
    el('div', 'tl-hint', this.pickEl, '← →  TO CHOOSE  ·  ENTER TO START');
    this.keyHandler = (e) => {
      if (this.picked) return;
      if (e.key === 'ArrowLeft' || e.key === '1') this.select('air');
      else if (e.key === 'ArrowRight' || e.key === '2') this.select('space');
      else if (e.key === 'Enter' || e.key === ' ') {
        const s = this.pickEl.querySelector('.tl-side.sel');
        this.pick(s?.classList.contains('space') ? 'space' : 'air');
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  private select(p: Program): void {
    for (const s of this.pickEl.querySelectorAll('.tl-side')) s.classList.toggle('sel', s.classList.contains(p));
  }

  private pick(p: Program): void {
    if (this.picked) return;
    this.picked = p;
    markPicked();
    // the music starts with this click (browsers allow no sound before one) and carries on into the menu
    audio.init();
    audio.click();
    menuMusic.want('intro', true);
    window.removeEventListener('keydown', this.keyHandler, true);
    this.select(p);
    this.pickEl.classList.add('gone');
    setTimeout(() => this.pickEl.remove(), 1500);
    this.startLoading(p);
    this.pickResolve(p);
  }

  /** what the game is loading behind the screen (0..1), and what it is doing */
  setProgress(f: number, label?: string): void {
    this.work = Math.max(this.work, Math.min(1, f));
    if (label) this.workLabel = label;
  }

  /** the game has finished loading: the screen goes once its time is up */
  markDone(): void {
    this.work = 1;
    this.workDone = true;
  }

  /** resolves once the loading screen has faded into the menu */
  finished_(): Promise<void> {
    if (this.finished) return Promise.resolve();
    return new Promise((r) => (this.doneResolve = r));
  }

  private startLoading(p: Program): void {
    this.t0 = performance.now();
    const L = (this.loadEl = el('div', `tl-load ${p}`, this.root));
    el('div', 'tl-fb', L);
    const stage = el('div', '', L);
    stage.style.cssText = 'position:absolute;inset:0';
    el('div', 'tl-shade', L);
    el('div', 'tl-bars', L).style.cssText = 'position:absolute;inset:0;pointer-events:none';
    const brand = el('div', 'tl-brand', L);
    el('div', 'm', brand, 'TRIAD');
    el('div', 'p', brand, p === 'air' ? 'AIR COMBAT' : 'SPACE EXPLORATION');
    const cap = el('div', 'tl-cap', L);
    const foot = el('div', 'tl-foot', L);
    const fact = el('div', 'tl-fact hide', foot);
    el('div', 'h', fact, 'DID YOU KNOW');
    const fx = el('div', 'x', fact);
    const bar = el('div', 'tl-bar', foot);
    this.fill = el('div', 'tl-fill', bar);
    const meta = el('div', 'tl-meta', foot);
    this.lbl = el('span', '', meta, 'LOADING');
    this.pct = el('span', '', meta, '0%');
    requestAnimationFrame(() => L.classList.add('on'));

    // ---- the pictures: in a random order, each loaded while the one before shows
    const order = shuffle(SHOTS[p]);
    let next = 0;
    const fetchNext = (): Promise<{ img: HTMLImageElement; shot: Shot } | null> => {
      // (no pictures at all: the gradient behind stays)
      if (!order.length) return Promise.resolve(null);
      const shot = order[next++ % order.length];
      return loadImage(shotUrl(p, shot)).then((img) => (img ? { img, shot } : null));
    };
    let pending = fetchNext();
    let lastSwap = -1e9;
    let current: HTMLDivElement | null = null;
    const swap = () => {
      if (this.finished) return;
      void pending.then((got) => {
        if (this.finished) return;
        pending = fetchNext();
        if (!got) return;
        const d = el('div', 'tl-shot', stage);
        d.style.backgroundImage = `url("${got.img.src}")`;
        // a slow drift and push-in, a different one each time
        const z0 = 1.04 + Math.random() * 0.04, z1 = z0 + 0.07;
        const dx = (Math.random() - 0.5) * 3, dy = (Math.random() - 0.5) * 2;
        d.animate(
          [
            { transform: `scale(${z0}) translate(${-dx}%, ${-dy}%)` },
            { transform: `scale(${z1}) translate(${dx}%, ${dy}%)` },
          ],
          { duration: (SHOT_T + SHOT_FADE * 2) * 1000, easing: 'linear', fill: 'forwards' },
        );
        requestAnimationFrame(() => d.classList.add('in'));
        const old = current;
        current = d;
        if (old) setTimeout(() => old.remove(), SHOT_FADE * 1000 + 200);
        cap.style.opacity = '0';
        setTimeout(() => {
          cap.textContent = got.shot.caption;
          cap.style.opacity = '1';
        }, 500);
        lastSwap = performance.now();
      });
    };
    swap();

    // ---- the facts: a random one every 7 s
    const facts = shuffle(p === 'air' ? AIR_FACTS : SPACE_FACTS);
    let fi = 0;
    const showFact = () => {
      fact.classList.add('hide');
      setTimeout(() => {
        fx.textContent = facts[fi++ % facts.length];
        fact.classList.remove('hide');
      }, fi === 0 ? 0 : 900);
    };
    showFact();
    let lastFact = performance.now();

    // ---- the clock: pictures, facts, and a bar that never jumps
    let prev = performance.now();
    const tick = () => {
      if (this.finished) return;
      this.raf = requestAnimationFrame(tick);
      const now = performance.now();
      // (real time, even at a low frame rate: the screen must not outstay its 17 s on a slow machine)
      const dt = Math.min(0.5, (now - prev) / 1000);
      prev = now;
      const t = (now - this.t0) / 1000;
      // (pictures and facts keep coming while a slow machine is still loading; they stop just before the fade)
      const winding = this.workDone && t >= TOTAL - FADE_OUT - 1;
      if (now - lastSwap > SHOT_T * 1000 && !winding) {
        lastSwap = now;
        swap();
      }
      if (now - lastFact > FACT_T * 1000 && !(this.workDone && t >= TOTAL - FADE_OUT - 2)) {
        lastFact = now;
        showFact();
      }
      // the bar follows the slower of the clock and the real work, eased
      const clock = Math.min(1, t / (TOTAL - FADE_OUT - 1));
      const eased = 1 - Math.pow(1 - clock, 1.6);
      const target = Math.min(eased, this.workDone ? 1 : 0.06 + this.work * 0.9);
      const rate = Math.max(0, target - this.shown);
      this.shown += Math.min(rate, rate * (1 - Math.exp(-dt * 2.5)) + dt * 0.02, dt * 0.18);
      if (this.fill) this.fill.style.width = `${(this.shown * 100).toFixed(2)}%`;
      if (this.pct) this.pct.textContent = `${Math.floor(this.shown * 100)}%`;
      if (this.lbl) this.lbl.textContent = this.shown > 0.995 ? 'READY' : this.workDone ? (p === 'air' ? 'PREFLIGHT CHECKS' : 'FINAL CHECKS') : this.workLabel;
      if (t >= TOTAL - FADE_OUT && this.workDone && this.shown > 0.995) this.finish();
    };
    this.raf = requestAnimationFrame(tick);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.raf);
    this.root.classList.add('out');
    // (the menu's own music took over while the menu came up behind: no restart)
    setTimeout(() => {
      menuMusic.want('intro', false);
      this.root.remove();
      this.doneResolve?.();
    }, FADE_OUT * 1000);
  }
}
