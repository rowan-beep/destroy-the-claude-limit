// The dive's instruments, drawn in the page over the 3D view: nothing from the
// aircraft HUD appears here. Instruments a submersible pilot reads: heading,
// depth and the clearance under the skids, speed, battery and range, ballast,
// the assists that are on. The Quiet Survey panel shows what the hydrophones
// hear (a bearing-time display, the noise budget, each contact's pattern in
// words) and the sector sonar shows the last ping. DOM writes happen only when a
// value changes; the canvases redraw at their own rates.

import { el, clearEl } from '../../ui/dom';
import { drawChart, fitView, type ChartView, type ChartOverlay } from '../ui/chart';
import type { AtlasData } from '../atlas/atlas';
import type { SonarReturn } from '../acoustics/acoustics';

const CSS = `
.oc-hud { position: fixed; inset: 0; z-index: 30; pointer-events: none; font-family: 'Inter', 'SF Pro Text', -apple-system, 'Segoe UI Variable Text', 'Segoe UI', Roboto, system-ui, sans-serif; color: #f3f7f9; -webkit-font-smoothing: antialiased;
  --a: #6fe3d0; --a2: #ffbf5e; --ink: #f3f7f9; --dim: rgba(243, 247, 249, 0.66); --faint: rgba(243, 247, 249, 0.42); --glass: rgba(9, 17, 23, 0.5); --line: rgba(255, 255, 255, 0.1); --line2: rgba(255, 255, 255, 0.18); user-select: none; font-variant-numeric: tabular-nums; }
.oc-hud.hidden { display: none; }
.oc-hud .mono, .oc-hud .oc-v { font-variant-numeric: tabular-nums; }
.oc-panel { position: absolute; background: var(--glass); border: 1px solid var(--line); border-radius: 14px; backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18); }
.oc-obj { left: 20px; top: 18px; max-width: min(440px, calc(33vw - 30px)); padding: 12px 16px 13px; }
.oc-kick { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--a); }
.oc-task { font-size: 16px; font-weight: 600; margin-top: 5px; line-height: 1.3; }
.oc-hint { font-size: 12.5px; color: var(--dim); margin-top: 4px; line-height: 1.4; }
.oc-stages { display: flex; gap: 3px; margin-top: 10px; }
.oc-stages i { flex: 1; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.14); }
.oc-stages i.d { background: var(--a); }
.oc-stages i.c { background: var(--ink); }
.oc-compass { left: 50%; top: 18px; transform: translateX(-50%); width: min(460px, 34vw); height: 44px; padding: 0; overflow: hidden; background: rgba(9, 17, 23, 0.42); -webkit-mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent); mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent); border: none; border-radius: 10px; box-shadow: none; }
.oc-compass canvas { width: 100%; height: 100%; display: block; }
.oc-left { left: 20px; top: 50%; transform: translateY(-50%); width: 128px; padding: 12px; }
.oc-right { right: 20px; top: 50%; transform: translateY(-50%); width: 184px; padding: 12px 14px; }
.oc-big { font-size: 30px; font-weight: 650; line-height: 1; letter-spacing: -0.01em; }
.oc-unit { font-size: 12px; font-weight: 500; color: var(--faint); margin-left: 4px; }
.oc-k { font-size: 10.5px; font-weight: 600; letter-spacing: 0.1em; color: var(--faint); margin-top: 12px; }
.oc-k:first-child { margin-top: 0; }
.oc-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 12.5px; color: var(--dim); margin-top: 4px; }
.oc-v { font-size: 14px; font-weight: 500; color: var(--ink); }
.oc-bar { height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); margin-top: 6px; position: relative; overflow: hidden; }
.oc-bar b { position: absolute; left: 0; top: 0; bottom: 0; background: var(--a); border-radius: 3px; transition: width 0.3s; }
.oc-bar.warn b { background: var(--a2); }
.oc-bar.bad b { background: #ff6b5a; }
.oc-bar u { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--ink); border-radius: 1px; }
.oc-tape { width: 100%; height: 190px; display: block; margin-top: 8px; border-radius: 8px; }
.oc-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 12px; }
.oc-tag { font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line2); color: var(--dim); }
.oc-tag.on { color: #0a1217; background: var(--ink); border-color: var(--ink); font-weight: 600; }
.oc-tag.amber { color: #1d1500; background: var(--a2); border-color: var(--a2); font-weight: 600; }
.oc-mini { right: 20px; bottom: 20px; width: 196px; height: 196px; padding: 0; overflow: hidden; border-radius: 16px; }
.oc-mini canvas { width: 100%; height: 100%; display: block; }
.oc-survey { left: 50%; bottom: 66px; transform: translateX(-50%); width: min(780px, 62vw); padding: 12px 14px; display: none; gap: 14px; }
.oc-survey.show { display: flex; }
.oc-btr { width: 260px; height: 120px; display: block; border-radius: 8px; background: #020a10; margin-top: 6px; }
.oc-ppi { width: 120px; height: 120px; display: block; border-radius: 50%; background: #020a10; margin-top: 6px; }
.oc-scope { right: 20px; bottom: 20px; width: 220px; padding: 10px 11px 11px; display: none; border-radius: 16px; }
.oc-scope.show { display: block; }
.oc-scope canvas { width: 198px; height: 198px; display: block; margin-top: 6px; }
.oc-hud.scoping .oc-mini { display: none; }
.oc-hud.scoping .oc-survey { left: calc(50% - 125px); }
.oc-sv-mid { flex: 1; min-width: 0; font-size: 12.5px; }
.oc-sv-h { font-size: 10.5px; font-weight: 600; letter-spacing: 0.1em; color: var(--faint); }
.oc-noise { display: grid; grid-template-columns: 76px 1fr 48px; gap: 4px 8px; align-items: center; margin-top: 8px; font-size: 11.5px; color: var(--dim); }
.oc-noise .oc-bar { margin: 0; }
.oc-noise span:nth-child(3n) { text-align: right; color: var(--ink); }
.oc-contact { margin-top: 8px; padding: 7px 10px; border-radius: 10px; background: rgba(255, 191, 94, 0.08); border: 1px solid rgba(255, 191, 94, 0.25); }
.oc-contact b { font-size: 12.5px; font-weight: 600; }
.oc-contact div { font-size: 12px; color: var(--dim); margin-top: 2px; }
.oc-gauge { margin-top: 8px; }
.oc-gauge-t { font-size: 12px; font-weight: 500; margin-top: 4px; color: var(--a); }
.oc-gauge-t.block { color: var(--a2); }
.oc-prompt { position: absolute; left: 50%; bottom: 170px; transform: translateX(-50%); padding: 9px 18px; font-size: 14px; font-weight: 600; border-radius: 999px; background: rgba(9, 17, 23, 0.72); border: 1px solid rgba(111, 227, 208, 0.6); color: var(--ink); display: none; white-space: nowrap; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
.oc-prompt.show { display: block; }
.oc-survey.show ~ .oc-prompt { bottom: 274px; }
.oc-survey.show ~ .oc-warp { display: none; }
.oc-prompt.block { border-color: rgba(255, 191, 94, 0.7); color: var(--a2); }
.oc-warn { position: absolute; left: 50%; top: 74px; transform: translateX(-50%); font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: #ff8f7a; text-shadow: 0 1px 10px rgba(0, 0, 0, 0.8); text-align: center; }
.oc-flash { position: absolute; left: 50%; top: 22%; transform: translate(-50%, -50%); text-align: center; opacity: 0; transition: opacity 0.4s; text-shadow: 0 2px 18px rgba(0, 0, 0, 0.7); }
.oc-flash.show { opacity: 1; }
.oc-flash-k { font-size: 12px; font-weight: 600; letter-spacing: 0.14em; color: var(--a); }
.oc-flash-t { font-size: 28px; font-weight: 650; letter-spacing: 0.01em; margin-top: 4px; }
.oc-mark { position: absolute; transform: translate(-50%, -50%); text-align: center; font-size: 11.5px; font-weight: 600; color: var(--ink); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9); white-space: nowrap; }
.oc-mark i { display: block; width: 12px; height: 12px; margin: 0 auto 4px; border: 2px solid var(--a); transform: rotate(45deg); border-radius: 2px; }
.oc-mark.area i { width: 22px; height: 22px; border-radius: 50%; transform: none; border-style: dashed; }
.oc-mark.edge i { border: none; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 14px solid var(--a); transform: rotate(var(--r, 0deg)); border-radius: 0; }
.oc-label { position: absolute; transform: translate(-50%, -100%); font-size: 11px; font-weight: 600; color: var(--a2); text-shadow: 0 1px 6px rgba(0, 0, 0, 0.9); white-space: nowrap; }
.oc-bot { position: absolute; left: 20px; bottom: 20px; display: flex; gap: 6px; pointer-events: auto; }
.oc-warp { position: absolute; left: 20px; bottom: 64px; pointer-events: auto; }
.oc-hud .wz { --wz-a: 111, 227, 208; --wz-b: 210, 255, 246; background: rgba(9, 17, 23, 0.6); border: 1px solid var(--line2); border-radius: 999px; padding: 4px 16px 4px 14px; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 0 calc(18px * var(--wz-k)) rgba(var(--wz-a), calc(0.3 * var(--wz-k))); }
.oc-hud .wz-read b { font: 650 15px 'Inter', 'Segoe UI', system-ui, sans-serif; letter-spacing: 0; }
.oc-hud .wz-read span { font: 600 9.5px 'Inter', 'Segoe UI', system-ui, sans-serif; letter-spacing: 0.08em; color: var(--faint); }
.oc-hud .wz-marks u { font: 500 9.5px 'Inter', 'Segoe UI', system-ui, sans-serif; letter-spacing: 0; color: var(--faint); }
.oc-hud .wz-marks u.on { color: var(--ink); }
.oc-hud .wz-thumb { background: var(--ink); box-shadow: 0 0 0 2px rgba(9, 17, 23, 0.9), 0 0 calc(4px + 14px * var(--wz-k)) rgba(var(--wz-a), 0.9); }
.oc-btn { pointer-events: auto; font: inherit; font-size: 12.5px; font-weight: 600; padding: 8px 14px; border-radius: 999px; background: rgba(9, 17, 23, 0.6); border: 1px solid var(--line2); color: var(--ink); cursor: pointer; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); transition: background 0.15s, border-color 0.15s; }
.oc-btn:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.3); }
.oc-btn.primary { background: var(--ink); color: #0a1217; border-color: var(--ink); }
.oc-btn.primary:hover { background: #fff; color: #0a1217; }
.oc-help { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(660px, 90vw); padding: 20px 24px; display: none; pointer-events: auto; column-count: 2; column-gap: 26px; background: rgba(9, 17, 23, 0.86); border-radius: 16px; }
.oc-help.show { display: block; }
.oc-help div { font-size: 13px; padding: 4px 0; break-inside: avoid; color: var(--dim); }
.oc-help b { display: inline-block; min-width: 78px; color: var(--ink); font-weight: 600; }
.oc-help h4 { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.12em; color: var(--a); column-span: all; }
.oc-modal { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(2, 7, 10, 0.5); pointer-events: auto; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.oc-modal.show { display: flex; }
.oc-card { width: min(520px, 92vw); max-height: 88vh; overflow-y: auto; padding: 24px 26px; background: rgba(10, 18, 24, 0.9); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45); }
.oc-card.wide { width: min(980px, 94vw); }
.oc-card h2 { margin: 0; font-size: 24px; font-weight: 650; letter-spacing: 0; }
.oc-card .sub { color: var(--dim); font-size: 13.5px; margin-top: 8px; line-height: 1.5; }
.oc-card .btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.oc-card .btns .oc-btn { padding: 10px 18px; font-size: 13.5px; }
.oc-set { display: grid; grid-template-columns: 1fr auto; gap: 10px 14px; margin-top: 16px; font-size: 13.5px; color: var(--dim); align-items: center; }
.oc-set select { font: inherit; background: rgba(255, 255, 255, 0.06); color: var(--ink); border: 1px solid var(--line2); border-radius: 8px; padding: 5px 8px; }
.oc-chartwrap { position: absolute; inset: 0; display: none; pointer-events: auto; background: #06101a; }
.oc-chartwrap.show { display: block; }
.oc-chartwrap canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.oc-chart-side { position: absolute; right: 20px; top: 20px; width: 320px; max-height: calc(100% - 40px); overflow-y: auto; padding: 14px 16px; }
.oc-chart-side .oc-contact { margin-top: 8px; }
.oc-deb { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px; }
.oc-deb-stats { display: grid; grid-template-columns: 1fr auto; gap: 7px 12px; font-size: 13.5px; color: var(--dim); }
.oc-deb-stats span:nth-child(2n) { text-align: right; color: var(--ink); font-weight: 500; }
.oc-deb img { width: 100%; border-radius: 10px; border: 1px solid var(--line); display: block; }
.oc-deb p { font-size: 13.5px; line-height: 1.6; color: var(--dim); margin: 0 0 10px; }
.oc-shake { animation: oc-shake 0.35s; }
@keyframes oc-shake { 0%, 100% { transform: none; } 25% { transform: translate(3px, -2px); } 50% { transform: translate(-3px, 2px); } 75% { transform: translate(2px, 1px); } }
.oc-hud.large .oc-task { font-size: 20px; }
.oc-hud.large .oc-big { font-size: 38px; }
.oc-hud.large .oc-hint, .oc-hud.large .oc-row { font-size: 14.5px; }
@media (max-width: 900px) { .oc-left, .oc-right { transform: translateY(-50%) scale(0.85); } .oc-survey { width: 92vw; } .oc-btr { width: 180px; } }
/* (a phone held upright: the big messages sit under the compass, beside the objective panel and above the instruments) */
@media (max-width: 600px) { .oc-flash { top: 74px; left: calc(33vw + 4px); right: 8px; transform: none; } .oc-flash-t { font-size: 18px; } }
`;

export interface HudState {
  kicker: string;
  task: string;
  hint: string;
  stage: number;
  stages: number;
  heading: number;
  depth: number;
  /** clearance under the skids (m), or null when out of sonar altimeter range */
  alt: number | null;
  seabed: number;
  speedMs: number;
  vs: number;
  battery: number;
  rangeKm: number;
  ballast: number;
  neutral: number;
  tags: [string, 'on' | 'amber' | ''][];
  /** compass marks: bearing and kind */
  marks: { b: number; kind: 'guide' | 'contact' | 'home' | 'live' }[];
  warn: string;
}

export interface SurveyState {
  show: boolean;
  self: number;
  sea: number;
  ping: number;
  contacts: { label: string; snr: number; caption: string; heard: boolean }[];
  progress: number;
  blocker: string;
  /** energy by bearing (360 bins, 0..1) for the bearing-time display */
  energy: Float32Array | null;
  heading: number;
}

export class DiveHud {
  readonly root: HTMLDivElement;
  private elKick: HTMLElement;
  private elTask: HTMLElement;
  private elHint: HTMLElement;
  private elStages: HTMLElement;
  private compass: HTMLCanvasElement;
  private elDepth: HTMLElement;
  private elAlt: HTMLElement;
  private tape: HTMLCanvasElement;
  private elSpeed: HTMLElement;
  private elVs: HTMLElement;
  private elBatt: HTMLElement;
  private barBatt: HTMLElement;
  private elRange: HTMLElement;
  private barBall: HTMLElement;
  private markBall: HTMLElement;
  private elBall: HTMLElement;
  private elTags: HTMLElement;
  private mini: HTMLCanvasElement;
  private survey: HTMLElement;
  private btr: HTMLCanvasElement;
  private btrRows: Float32Array[] = [];
  private ppi: HTMLCanvasElement;
  private scope: HTMLElement;
  private scopeCv: HTMLCanvasElement;
  private scopeHead: HTMLElement;
  private svNoise: HTMLElement;
  private svContacts: HTMLElement;
  private svBar: HTMLElement;
  private svText: HTMLElement;
  readonly prompt: HTMLElement;
  private warn: HTMLElement;
  private flashEl: HTMLElement;
  private flashK: HTMLElement;
  private flashT: HTMLElement;
  private flashTimer = 0;
  private markEl: HTMLElement;
  private markLab: HTMLElement;
  private labels: HTMLElement;
  readonly help: HTMLElement;
  readonly modal: HTMLElement;
  private card: HTMLElement;
  readonly chartWrap: HTMLElement;
  readonly chartCanvas: HTMLCanvasElement;
  readonly chartSide: HTMLElement;
  chartView: ChartView | null = null;
  private last = new Map<HTMLElement, string>();
  private btrT = 0;
  private miniT = 0;

  constructor(parent: HTMLElement, keys: [string, string][][], onButton: (id: 'chart' | 'help' | 'pause' | 'camera') => void) {
    if (!document.getElementById('oc-hud-css')) {
      const st = document.createElement('style');
      st.id = 'oc-hud-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = el('div', 'oc-hud hidden', parent);
    this.labels = el('div', '', this.root);
    const obj = el('div', 'oc-panel oc-obj', this.root);
    this.elKick = el('div', 'oc-kick', obj);
    this.elTask = el('div', 'oc-task', obj);
    this.elHint = el('div', 'oc-hint', obj);
    this.elStages = el('div', 'oc-stages', obj);
    const cp = el('div', 'oc-panel oc-compass', this.root);
    this.compass = el('canvas', '', cp);
    // left: depth
    const left = el('div', 'oc-panel oc-left', this.root);
    el('div', 'oc-k', left, 'DEPTH');
    const dr = el('div', '', left);
    this.elDepth = el('span', 'oc-big', dr, '0');
    el('span', 'oc-unit', dr, 'M');
    this.tape = el('canvas', 'oc-tape', left);
    el('div', 'oc-k', left, 'UNDER SKIDS');
    this.elAlt = el('div', 'oc-v', left, '—');
    // right: speed, battery, ballast, assists
    const right = el('div', 'oc-panel oc-right', this.root);
    el('div', 'oc-k', right, 'SPEED');
    const sr = el('div', '', right);
    this.elSpeed = el('span', 'oc-big', sr, '0.0');
    el('span', 'oc-unit', sr, 'KN');
    const vr = el('div', 'oc-row', right);
    el('span', '', vr, 'VERTICAL');
    this.elVs = el('span', 'oc-v', vr, '0.0 m/s');
    el('div', 'oc-k', right, 'BATTERY');
    const br = el('div', 'oc-row', right);
    this.elBatt = el('span', 'oc-v', br, '100 %');
    this.elRange = el('span', 'oc-v', br, '');
    const bb = el('div', 'oc-bar', right);
    this.barBatt = el('b', '', bb);
    this.barBatt.parentElement!.dataset.k = 'batt';
    el('div', 'oc-k', right, 'BALLAST');
    const blr = el('div', 'oc-row', right);
    this.elBall = el('span', 'oc-v', blr, '');
    const bl = el('div', 'oc-bar', right);
    this.barBall = el('b', '', bl);
    this.markBall = el('u', '', bl);
    this.elTags = el('div', 'oc-tags', right);
    // minimap
    const mini = el('div', 'oc-panel oc-mini', this.root);
    this.mini = el('canvas', '', mini);
    // the scanning sonar's display (in the minimap's place while the head turns)
    this.scope = el('div', 'oc-panel oc-scope', this.root);
    this.scopeHead = el('div', 'oc-sv-h', this.scope, 'SCANNING SONAR · 280 M');
    this.scopeCv = el('canvas', '', this.scope);
    // Quiet Survey
    this.survey = el('div', 'oc-panel oc-survey', this.root);
    const btrBox = el('div', '', this.survey);
    el('div', 'oc-sv-h', btrBox, 'HYDROPHONES · BEARING / TIME');
    this.btr = el('canvas', 'oc-btr', btrBox);
    const mid = el('div', 'oc-sv-mid', this.survey);
    el('div', 'oc-sv-h', mid, 'QUIET SURVEY');
    this.svNoise = el('div', 'oc-noise', mid);
    this.svContacts = el('div', '', mid);
    const gauge = el('div', 'oc-gauge', mid);
    const gb = el('div', 'oc-bar', gauge);
    this.svBar = el('b', '', gb);
    this.svText = el('div', 'oc-gauge-t', gauge);
    const ppiBox = el('div', '', this.survey);
    el('div', 'oc-sv-h', ppiBox, 'SONAR');
    this.ppi = el('canvas', 'oc-ppi', ppiBox);
    this.prompt = el('div', 'oc-prompt', this.root);
    this.warn = el('div', 'oc-warn', this.root);
    this.flashEl = el('div', 'oc-flash', this.root);
    this.flashK = el('div', 'oc-flash-k', this.flashEl);
    this.flashT = el('div', 'oc-flash-t', this.flashEl);
    this.markEl = el('div', 'oc-mark', this.root);
    el('i', '', this.markEl);
    this.markLab = el('span', '', this.markEl);
    // buttons (for mouse players)
    const bot = el('div', 'oc-bot', this.root);
    for (const [id, label] of [['chart', 'Chart · M'], ['camera', 'Camera · C'], ['help', 'Keys · ?'], ['pause', 'Menu']] as const) {
      const b = el('button', 'oc-btn', bot, label) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => onButton(id));
    }
    // help
    this.help = el('div', 'oc-panel oc-help', this.root);
    for (const sec of keys) {
      for (const [k, v] of sec) {
        if (k === '#') el('h4', '', this.help, v);
        else {
          const r = el('div', '', this.help);
          el('b', '', r, k);
          r.append(v);
        }
      }
    }
    this.help.addEventListener('click', () => this.help.classList.remove('show'));
    // the chart
    this.chartWrap = el('div', 'oc-chartwrap', this.root);
    this.chartCanvas = el('canvas', '', this.chartWrap);
    this.chartSide = el('div', 'oc-panel oc-chart-side', this.chartWrap);
    // pause / debrief cards
    this.modal = el('div', 'oc-modal', this.root);
    this.card = el('div', 'oc-card', this.modal);
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (!v) {
      this.modal.classList.remove('show');
      this.chartWrap.classList.remove('show');
      this.help.classList.remove('show');
    }
  }

  setLarge(v: boolean): void {
    this.root.classList.toggle('large', v);
  }

  private text(e: HTMLElement, t: string): void {
    if (this.last.get(e) === t) return;
    this.last.set(e, t);
    e.textContent = t;
  }

  private width(e: HTMLElement, f: number): void {
    const t = `${Math.max(0, Math.min(100, f * 100)).toFixed(1)}%`;
    if (this.last.get(e) === t) return;
    this.last.set(e, t);
    e.style.width = t;
  }

  update(s: HudState, dt: number): void {
    this.text(this.elKick, s.kicker);
    this.text(this.elTask, s.task);
    this.text(this.elHint, s.hint);
    const stKey = `${s.stage}/${s.stages}`;
    if (this.last.get(this.elStages) !== stKey) {
      this.last.set(this.elStages, stKey);
      clearEl(this.elStages);
      for (let i = 0; i < s.stages; i++) el('i', i < s.stage ? 'd' : i === s.stage ? 'c' : '', this.elStages);
    }
    this.text(this.elDepth, s.depth < 0.5 ? '0' : s.depth < 10 ? s.depth.toFixed(1) : Math.round(s.depth).toString());
    this.text(this.elAlt, s.alt === null ? '—' : `${s.alt.toFixed(1)} M`);
    this.text(this.elSpeed, (s.speedMs * 1.9438).toFixed(1));
    this.text(this.elVs, `${s.vs >= 0 ? '+' : ''}${s.vs.toFixed(1)} m/s`);
    this.text(this.elBatt, `${Math.round(s.battery * 100)} %`);
    this.text(this.elRange, s.rangeKm < 99 ? `≈ ${s.rangeKm.toFixed(1)} KM` : '');
    this.width(this.barBatt, s.battery);
    const bp = this.barBatt.parentElement!;
    bp.classList.toggle('warn', s.battery < 0.3 && s.battery >= 0.12);
    bp.classList.toggle('bad', s.battery < 0.12);
    this.width(this.barBall, s.ballast);
    const nm = `${(s.neutral * 100).toFixed(1)}%`;
    if (this.last.get(this.markBall) !== nm) {
      this.last.set(this.markBall, nm);
      this.markBall.style.left = nm;
    }
    this.text(this.elBall, Math.abs(s.ballast - s.neutral) < 0.03 ? 'NEUTRAL' : s.ballast < s.neutral ? (s.ballast < 0.05 ? 'TANKS BLOWN' : 'LIGHT') : 'HEAVY');
    const tagKey = s.tags.map((t) => t.join(':')).join('|');
    if (this.last.get(this.elTags) !== tagKey) {
      this.last.set(this.elTags, tagKey);
      clearEl(this.elTags);
      for (const [t, c] of s.tags) el('span', 'oc-tag' + (c ? ' ' + c : ''), this.elTags, t);
    }
    this.text(this.warn, s.warn);
    this.drawCompass(s.heading, s.marks);
    this.drawTape(s.depth, s.seabed);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashEl.classList.remove('show');
    }
  }

  flash(kicker: string, title: string, secs = 3.2): void {
    this.flashK.textContent = kicker;
    this.flashT.textContent = title;
    this.flashEl.classList.add('show');
    this.flashTimer = secs;
  }

  shake(): void {
    this.root.classList.remove('oc-shake');
    void this.root.offsetWidth;
    this.root.classList.add('oc-shake');
  }

  setPrompt(t: string, blocked = false): void {
    this.text(this.prompt, t);
    this.prompt.classList.toggle('show', !!t);
    this.prompt.classList.toggle('block', blocked);
  }

  /** the guide marker on screen (or at the edge, pointing to it) */
  setMarker(m: { x: number; y: number; on: boolean; edge: boolean; angle: number; label: string; area: boolean } | null): void {
    if (!m) {
      this.markEl.style.display = 'none';
      return;
    }
    this.markEl.style.display = 'block';
    this.markEl.style.left = `${m.x}px`;
    this.markEl.style.top = `${m.y}px`;
    this.markEl.classList.toggle('edge', m.edge);
    this.markEl.classList.toggle('area', m.area && !m.edge);
    if (m.edge) this.markEl.style.setProperty('--r', `${m.angle}deg`);
    this.text(this.markLab, m.label);
  }

  /** small labels for things in view (sites in the atlas) */
  setLabels(ls: { x: number; y: number; text: string }[]): void {
    const key = ls.map((l) => `${l.text}@${Math.round(l.x)},${Math.round(l.y)}`).join('|');
    if (this.last.get(this.labels) === key) return;
    this.last.set(this.labels, key);
    clearEl(this.labels);
    for (const l of ls) {
      const e = el('div', 'oc-label', this.labels, l.text);
      e.style.left = `${l.x}px`;
      e.style.top = `${l.y}px`;
    }
  }

  private drawCompass(h: number, marks: HudState['marks']): void {
    const cv = this.compass;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const span = 110;
    const x = (b: number) => W / 2 + (((b - h + 540) % 360) - 180) * (W / span);
    g.strokeStyle = 'rgba(230,251,255,0.6)';
    g.fillStyle = 'rgba(230,251,255,0.85)';
    g.font = '600 11px Inter, "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'center';
    const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let b = 0; b < 360; b += 5) {
      const px = x(b);
      if (px < -10 || px > W + 10) continue;
      const big = b % 15 === 0;
      g.beginPath();
      g.moveTo(px, H - 4);
      g.lineTo(px, H - (big ? 12 : 7));
      g.stroke();
      if (b % 45 === 0) {
        g.fillStyle = b === 0 ? '#6fe3d0' : 'rgba(230,251,255,0.9)';
        g.fillText(names[b], px, 17);
      } else if (b % 15 === 0) {
        g.fillStyle = 'rgba(230,251,255,0.5)';
        g.fillText(String(b).padStart(3, '0'), px, 17);
      }
    }
    const col = { guide: '#6fe3d0', contact: '#ffbf5e', home: '#ffffff', live: '#6fe3d0' };
    for (const m of marks) {
      let px = x(m.b);
      const off = px < 6 || px > W - 6;
      px = Math.max(6, Math.min(W - 6, px));
      g.fillStyle = col[m.kind];
      g.globalAlpha = off ? 0.5 : 1;
      g.beginPath();
      if (m.kind === 'home') {
        g.fillText('H', px, 31);
      } else {
        g.moveTo(px, 22);
        g.lineTo(px - 5, 30);
        g.lineTo(px + 5, 30);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
    }
    // the lubber line and the heading
    g.fillStyle = '#04241c';
    g.fillRect(W / 2 - 22, H - 18, 44, 16);
    g.strokeStyle = '#6fe3d0';
    g.strokeRect(W / 2 - 22, H - 18, 44, 16);
    g.fillStyle = '#6fe3d0';
    g.font = '700 12px Inter, "Segoe UI", system-ui, sans-serif';
    g.fillText(String(Math.round(((h % 360) + 360) % 360) % 360).padStart(3, '0') + '°', W / 2, H - 6);
  }

  private drawTape(depth: number, seabed: number): void {
    const cv = this.tape;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // 60 m of water round the boat; the surface and the bottom drawn where they are in view
    const span = 60;
    const y = (d: number) => H / 2 + ((d - depth) / span) * H;
    g.fillStyle = 'rgba(124,240,200,0.06)';
    g.fillRect(0, Math.max(0, y(0)), W, H);
    if (y(0) > 0) {
      g.fillStyle = 'rgba(180,220,255,0.18)';
      g.fillRect(0, 0, W, y(0));
    }
    const bottom = -seabed;
    if (y(bottom) < H) {
      g.fillStyle = 'rgba(160,130,90,0.55)';
      g.fillRect(0, y(bottom), W, H - y(bottom));
    }
    g.strokeStyle = 'rgba(230,251,255,0.4)';
    g.fillStyle = 'rgba(230,251,255,0.65)';
    g.font = '10px Inter, "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'right';
    const step = 10;
    for (let d = Math.ceil((depth - span / 2) / step) * step; d <= depth + span / 2; d += step) {
      if (d < 0) continue;
      g.beginPath();
      g.moveTo(W - 14, y(d));
      g.lineTo(W, y(d));
      g.stroke();
      g.fillText(String(d), W - 17, y(d) + 3);
    }
    // the boat
    g.fillStyle = '#ffe17a';
    g.beginPath();
    g.moveTo(4, H / 2);
    g.lineTo(16, H / 2 - 5);
    g.lineTo(16, H / 2 + 5);
    g.closePath();
    g.fill();
    g.strokeStyle = '#ffe17a';
    g.beginPath();
    g.moveTo(16, H / 2);
    g.lineTo(W, H / 2);
    g.stroke();
  }

  /** the Quiet Survey panel and the sonar */
  updateSurvey(s: SurveyState, ping: { view: ScopeView; age: number } | null, dt: number): void {
    // (with the sonar's own display up, the panel is for listening only)
    const pinged = !!(ping && ping.age < 20) && !this.root.classList.contains('scoping');
    this.survey.classList.toggle('show', s.show || pinged);
    if (!s.show && !pinged) return;
    // noise budget
    const nk = `${Math.round(s.self)}|${Math.round(s.sea)}|${Math.round(s.ping)}`;
    if (this.last.get(this.svNoise) !== nk) {
      this.last.set(this.svNoise, nk);
      clearEl(this.svNoise);
      const row = (k: string, v: number, warn: boolean) => {
        el('span', '', this.svNoise, k);
        const b = el('div', 'oc-bar' + (warn ? ' warn' : ''), this.svNoise);
        el('b', '', b).style.width = `${Math.max(0, Math.min(100, ((v - 30) / 70) * 100))}%`;
        el('span', '', this.svNoise, v > 1 ? `${Math.round(v)} dB` : '—');
      };
      row('OWN NOISE', s.self, s.self > s.sea + 6);
      row('SEA NOISE', s.sea, false);
      row('PING RING', s.ping, s.ping > 0);
    }
    const ck = s.contacts.map((c) => `${c.label}${Math.round(c.snr)}${c.heard}`).join('|');
    if (this.last.get(this.svContacts) !== ck) {
      this.last.set(this.svContacts, ck);
      clearEl(this.svContacts);
      if (!s.contacts.length) el('div', 'oc-contact', this.svContacts).append(Object.assign(document.createElement('div'), { textContent: 'Nothing above the noise. Slow down, or listen from somewhere else.' }));
      for (const c of s.contacts) {
        const e = el('div', 'oc-contact', this.svContacts);
        el('b', '', e, `${c.label} · ${c.snr >= 0 ? '+' : ''}${Math.round(c.snr)} dB`);
        el('div', '', e, c.heard ? c.caption : 'Too faint to make out');
      }
    }
    this.width(this.svBar, s.progress);
    this.text(this.svText, s.blocker || (s.progress > 0 ? 'LISTENING… HOLD STEADY' : s.show ? 'LISTENING' : ''));
    this.svText.classList.toggle('block', !!s.blocker);
    this.btrT += dt;
    if (this.btrT > 0.25 && s.energy) {
      this.btrT = 0;
      this.drawBtr(s.energy, s.heading);
    }
    if (ping) drawScope(this.ppi, 120, ping.view);
  }

  /** the scanning sonar's display, while the head turns and a little after (null: the minimap again) */
  updateScope(v: ScopeView | null): void {
    const on = !!v && v.k > 0.01;
    this.scope.classList.toggle('show', on);
    this.root.classList.toggle('scoping', on);
    if (!on) return;
    this.text(this.scopeHead, v!.scanning ? `SCANNING SONAR · ${v!.range} M` : `SONAR · PING · ${v!.range} M`);
    drawScope(this.scopeCv, 198, v!);
  }

  private drawBtr(energy: Float32Array, heading: number): void {
    const cv = this.btr;
    const W = 260, H = 120;
    if (cv.width !== W) {
      cv.width = W;
      cv.height = H;
    }
    const row = new Float32Array(W);
    for (let i = 0; i < W; i++) {
      // the display is centred on the bow: -180..180 relative
      const rel = (i / W) * 360 - 180;
      const b = Math.round((heading + rel + 720) % 360) % 360;
      row[i] = energy[b];
    }
    this.btrRows.unshift(row);
    if (this.btrRows.length > H / 3) this.btrRows.pop();
    const g = cv.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#020a10';
    g.fillRect(0, 0, W, H);
    const img = g.getImageData(0, 0, W, H);
    this.btrRows.forEach((r, k) => {
      for (let i = 0; i < W; i++) {
        const v = Math.min(1, r[i]);
        for (let yy = 0; yy < 3; yy++) {
          const o = ((k * 3 + yy) * W + i) * 4;
          img.data[o] = 30 + v * 225;
          img.data[o + 1] = 40 + v * 200;
          img.data[o + 2] = 30 + v * 90;
          img.data[o + 3] = 255;
        }
      }
    });
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(124,240,200,0.6)';
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.lineTo(W / 2, 6);
    g.stroke();
    g.fillStyle = 'rgba(230,251,255,0.6)';
    g.font = '9px Inter, "Segoe UI", system-ui, sans-serif';
    g.fillText('BOW', W / 2 - 9, H - 3);
    g.fillText('PORT', 4, H - 3);
    g.fillText('STBD', W - 28, H - 3);
  }

  /** the minimap: the boat in the middle, north up */
  drawMini(atlas: AtlasData, o: ChartOverlay, dt: number): void {
    this.miniT += dt;
    if (this.miniT < 0.2) return;
    this.miniT = 0;
    const s = o.sub;
    if (!s) return;
    drawChart(this.mini, { cx: s.x, cz: s.z, k: 190 / 900 }, atlas, { ...o, labels: false, pastRoutes: false });
  }

  /** the full chart (M) */
  showChart(v: boolean, atlas: AtlasData, o: ChartOverlay): void {
    this.chartWrap.classList.toggle('show', v);
    if (!v) return;
    const W = this.chartCanvas.clientWidth || window.innerWidth, H = this.chartCanvas.clientHeight || window.innerHeight;
    if (!this.chartView) this.chartView = o.sub ? { cx: o.sub.x, cz: o.sub.z, k: Math.min(W, H) / 2600 } : fitView(W, H, -1800, 1800, -900, 3300);
    drawChart(this.chartCanvas, this.chartView, atlas, o);
  }

  /** a card in the middle (pause, debrief, messages) */
  showCard(build: ((card: HTMLElement) => void) | null, wide = false): void {
    if (!build) {
      this.modal.classList.remove('show');
      return;
    }
    clearEl(this.card);
    this.card.classList.toggle('wide', wide);
    build(this.card);
    this.modal.classList.add('show');
  }

  get cardOpen(): boolean {
    return this.modal.classList.contains('show');
  }
}

/** what the sonar display shows: the returns, where the beam is and how much of the turn it has painted */
export interface ScopeView {
  returns: SonarReturn[];
  /** the beam's bearing (degrees, clockwise from north) */
  deg: number;
  /** how far round it has painted (degrees, up to 360) */
  span: number;
  /** the beam is turning */
  lead: boolean;
  /** 0..1: the picture fades a few seconds after a single sweep */
  k: number;
  /** the boat's heading: the display is heading-up */
  heading: number;
  range: number;
  scanning: boolean;
}

/**
 * A scanning sonar's display, heading-up: the beam goes round, the sea bed
 * and anything hard light up as it passes and fade behind it, with range
 * rings every 50 m. Hard returns are drawn amber.
 */
export function drawScope(cv: HTMLCanvasElement, S: number, v: ScopeView): void {
  if (cv.width !== S) {
    cv.width = S;
    cv.height = S;
  }
  const g = cv.getContext('2d')!;
  const c = S / 2, R = S / 2 - 3;
  const TAU = Math.PI * 2;
  // a bearing to the canvas's angle (0 = to the right, clockwise: the bow at the top)
  const scr = (b: number) => ((b - v.heading) * Math.PI) / 180 - Math.PI / 2;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(c, c, R, 0, TAU);
  g.clip();
  const bg = g.createRadialGradient(c, c, 0, c, c, R);
  bg.addColorStop(0, '#04202e');
  bg.addColorStop(1, '#010810');
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  // the trace behind the beam
  if (v.k > 0) {
    const steps = 40, trail = Math.min(v.span, 150);
    for (let i = 0; i < steps; i++) {
      const a0 = v.deg - ((i + 1) * trail) / steps, a1 = v.deg - (i * trail) / steps;
      g.fillStyle = `rgba(30, 140, 255, ${(0.34 * Math.exp((-i / steps) * 3.2) * v.k).toFixed(3)})`;
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, R, scr(a0), scr(a1));
      g.closePath();
      g.fill();
    }
  }
  // range rings and the bow line
  g.strokeStyle = 'rgba(90, 180, 255, 0.22)';
  g.lineWidth = 1;
  for (let r = 50; r < v.range; r += 50) {
    g.beginPath();
    g.arc(c, c, (R * r) / v.range, 0, TAU);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(c, c);
  g.lineTo(c, c - R);
  g.stroke();
  // the returns: bright as the beam passes, fading behind it
  for (const r of v.returns) {
    if (r.r < 0) continue;
    const since = (((v.deg - r.b) % 360) + 360) % 360;
    if (since > v.span) continue;
    const fade = Math.exp((-since / 360) * 3.5) * (0.3 + 0.7 * v.k);
    if (fade < 0.02) continue;
    const a = scr(r.b), d = (r.r / v.range) * R;
    if (r.kind === 'object') {
      g.fillStyle = `rgba(255, 214, 120, ${fade.toFixed(3)})`;
      g.shadowColor = 'rgba(255, 190, 80, 0.9)';
      g.shadowBlur = 8 * fade;
      g.beginPath();
      g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, S > 150 ? 3 : 2.2, 0, TAU);
      g.fill();
      g.shadowBlur = 0;
    } else {
      // the bottom answers along the beam's width, strongest at the face it meets, and nothing comes from behind it
      const w = (Math.PI / 90) * 1.1;
      const grd = g.createRadialGradient(c, c, Math.max(0, d - 2), c, c, Math.min(R, d + R * 0.12));
      grd.addColorStop(0, `rgba(110, 210, 255, ${(fade * (0.45 + r.s * 0.55)).toFixed(3)})`);
      grd.addColorStop(1, 'rgba(110, 210, 255, 0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(c, c, Math.min(R, d + R * 0.12), a - w, a + w);
      g.arc(c, c, Math.max(0, d - 1.5), a + w, a - w, true);
      g.closePath();
      g.fill();
    }
  }
  // the beam
  if (v.lead && v.k > 0) {
    const a = scr(v.deg);
    g.strokeStyle = 'rgba(170, 235, 255, 0.95)';
    g.lineWidth = S > 150 ? 2 : 1.5;
    g.shadowColor = 'rgba(70, 170, 255, 1)';
    g.shadowBlur = 10;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
    g.stroke();
    g.shadowBlur = 0;
  }
  g.restore();
  // the rim, the boat and the range
  g.strokeStyle = 'rgba(90, 180, 255, 0.55)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(c, c, R, 0, TAU);
  g.stroke();
  g.fillStyle = '#ffe17a';
  g.beginPath();
  g.moveTo(c, c - 5);
  g.lineTo(c + 3.5, c + 4);
  g.lineTo(c - 3.5, c + 4);
  g.closePath();
  g.fill();
  if (S > 150) {
    g.fillStyle = 'rgba(200, 235, 255, 0.65)';
    g.font = '9px Inter, "Segoe UI", system-ui, sans-serif';
    g.fillText('100', c + 3, c - (R * 100) / v.range - 2);
    g.fillText('200', c + 3, c - (R * 200) / v.range - 2);
  }
}
