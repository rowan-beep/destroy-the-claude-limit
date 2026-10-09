// OCEAN menu, over Kestrel Harbor at the berth: the harbor itself fills the
// screen, with the menu laid over it on a clear glass column at the left. One
// big DIVE button at the bottom right always says what it will start. MISSIONS
// lists the expedition, its follow-up and the free survey; BOAT has the boat,
// the ocean's own settings and the benchmark; ECHO ATLAS is the chart, every
// contact with its bearings and what it has turned out to be, and the evidence.

import { el, clearEl, button } from '../dom';
import { programLogo, Program } from './program';
import { WhatsNewModal } from './whatsNew';
import { menuMusic } from '../../audio/menuMusic';
import { menuStyle, setMenuStyle, renderSimple } from './simpleMenu';
import { loadOceanSettings, saveOceanSettings, PRESETS, type OceanSettings, type OceanPreset } from '../../ocean/perf/presets';
import { TIMES, SKIES, SEAS, weatherOf, type WeatherPick } from '../../ocean/world/waves';
import { EchoAtlas } from '../../ocean/atlas/atlas';
import { drawChart, fitView, type ChartView } from '../../ocean/ui/chart';
import { parseCheckpoint, parseCareer, PROGRESS_KEY, CAREER_KEY, MISSION_ID, MISSION_TITLE, STAGES } from '../../ocean/mission/expedition';
import { PULSE_ID, PULSE_PROGRESS_KEY, PULSE_STAGES } from '../../ocean/mission/followup';
import { SURVEY_SUB } from '../../ocean/sub/subPhysics';
import { DEPTH_BANDS } from '../../ocean/world/geo';
import type { BenchResult } from '../../ocean/perf/benchmark';

type Section = 'missions' | 'harbor' | 'chart';

export interface OceanMenuCallbacks {
  onProgram: (p: Program) => void;
  onSettings: () => void;
  onControls: () => void;
  /** start a dive: the expedition (fresh or continued) or a free survey */
  onDive: (mode: 'expedition' | 'free' | 'pulse', resume: boolean) => void;
  /** run the benchmark route on a preset */
  onBenchmark: (preset: OceanPreset) => Promise<BenchResult>;
}

const SEC_KEY = 'triad.ocean.section';
const SECTIONS: [Section, string][] = [
  ['missions', 'Missions'],
  ['harbor', 'The boat'],
  ['chart', 'Echo Atlas'],
];

const CSS = `
.ocx { --ink: #f3f7f9; --dim: rgba(243, 247, 249, 0.66); --faint: rgba(243, 247, 249, 0.42); --line: rgba(255, 255, 255, 0.2); --line2: rgba(255, 255, 255, 0.32); --glass: rgba(16, 52, 72, 0.34); --glass2: rgba(16, 52, 72, 0.48); --acc: #5ff0dc; --warn: #ffc56b;
  background: none; color: var(--ink); text-shadow: 0 1px 10px rgba(0, 24, 40, 0.35); font-family: 'Inter', 'SF Pro Text', -apple-system, 'Segoe UI Variable Text', 'Segoe UI', Roboto, system-ui, sans-serif; font-size: 14px; letter-spacing: 0; -webkit-font-smoothing: antialiased; }
.ocx * { box-sizing: border-box; }
.ocx { -webkit-user-select: none; user-select: none; }
.ocx-hint { position: absolute; left: calc(50% + 80px); bottom: 30px; transform: translateX(-50%); font-size: 12px; color: var(--dim); letter-spacing: 0.02em; white-space: nowrap; pointer-events: none !important; }
.ocx.atlas .ocx-hint { display: none; }
.ocx .num { font-variant-numeric: tabular-nums; }
.ocx-scrim { position: absolute; inset: 0; pointer-events: none !important; background:
  linear-gradient(90deg, rgba(4, 22, 34, 0.42) 0%, rgba(4, 22, 34, 0.2) 30%, rgba(4, 22, 34, 0) 50%),
  linear-gradient(180deg, rgba(4, 22, 34, 0.3) 0%, rgba(4, 22, 34, 0) 15%, rgba(4, 22, 34, 0) 78%, rgba(4, 22, 34, 0.36) 100%); }
.ocx.atlas .ocx-scrim { background: rgba(4, 18, 28, 0.55); }
/* top bar */
.ocx-top { position: absolute; left: 0; right: 0; top: 0; height: 72px; display: flex; align-items: center; gap: 36px; padding: 0 36px; }
.ocx-brand .mm-logo { padding: 0; }
.ocx-brand .mm-logo-mark { font-size: 20px; font-weight: 700; letter-spacing: 0.32em; background: none; color: var(--ink); -webkit-text-fill-color: var(--ink); }
.ocx-brand .mm-logo-arrow { color: var(--faint); font-size: 11px; margin-top: 2px; }
.ocx-brand .mm-logo-sub { font-size: 11px; letter-spacing: 0.24em; color: var(--acc); margin-top: 3px; }
.ocx-brand .mm-prog { top: 44px; left: -8px; right: auto; width: 300px; --mm-line: var(--line2); --mm-acc: var(--acc); --mm-ink: var(--ink); --mm-dim: var(--dim); background: rgba(9, 15, 20, 0.97); border-radius: 12px; }
.ocx-nav { position: relative; display: flex; gap: 6px; }
.ocx-nav button { position: relative; font: inherit; font-size: 14px; font-weight: 500; color: var(--dim); background: none; border: none; padding: 10px 14px; cursor: pointer; border-radius: 8px; transition: color 0.15s, background 0.15s; }
.ocx-nav button:hover { color: var(--ink); background: rgba(255, 255, 255, 0.05); }
.ocx-nav button.on { color: var(--ink); }
.ocx-nav button.on::after { content: ''; position: absolute; left: 14px; right: 14px; bottom: 2px; height: 2px; border-radius: 1px; background: var(--acc); }
.ocx-top-r { margin-left: auto; display: flex; align-items: center; gap: 18px; color: var(--dim); font-size: 13px; }
.ocx-top-r .sep { width: 1px; height: 16px; background: var(--line2); }
.ocx-music { font: inherit; font-size: 13px; color: var(--dim); background: none; border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px 6px 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.ocx-music:hover { color: var(--ink); border-color: var(--line2); }
.ocx-music i { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
.ocx-music.on i { background: var(--acc); box-shadow: 0 0 0 3px rgba(111, 227, 208, 0.18); }
/* the column */
.ocx-main { position: absolute; left: 36px; top: 96px; bottom: 76px; width: min(470px, calc(100vw - 72px)); overflow-y: auto; overflow-x: hidden; padding-right: 10px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
.ocx-main.swap > * { animation: ocx-in 0.35s ease both; }
.ocx-main.swap > *:nth-child(2) { animation-delay: 0.03s; } .ocx-main.swap > *:nth-child(3) { animation-delay: 0.06s; } .ocx-main.swap > *:nth-child(4) { animation-delay: 0.09s; } .ocx-main.swap > *:nth-child(n+5) { animation-delay: 0.12s; }
@keyframes ocx-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.ocx-eye { font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--acc); }
.ocx-h1 { font-size: 34px; font-weight: 650; letter-spacing: -0.01em; line-height: 1.1; margin: 8px 0 8px; }
.ocx-lead { font-size: 14.5px; line-height: 1.55; color: var(--dim); margin: 0 0 22px; max-width: 440px; }
.ocx-h2 { font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint); margin: 26px 0 10px; }
/* missions */
.ocx-mis { position: relative; padding: 16px 18px; border-radius: 14px; background: var(--glass); border: 1px solid var(--line); backdrop-filter: blur(20px) saturate(180%) brightness(1.06); -webkit-backdrop-filter: blur(20px) saturate(180%) brightness(1.06); margin-bottom: 10px; cursor: pointer; transition: border-color 0.15s, background 0.15s, transform 0.15s; }
.ocx-mis:hover { border-color: var(--line2); background: var(--glass2); }
.ocx-mis.sel { border-color: rgba(95, 240, 220, 0.75); background: rgba(20, 80, 92, 0.48); box-shadow: 0 0 0 1px rgba(95, 240, 220, 0.25), 0 10px 30px rgba(0, 40, 60, 0.25); }
.ocx-mis.locked { cursor: default; opacity: 0.62; }
.ocx-mis.locked:hover { border-color: var(--line); background: var(--glass); }
.ocx-mis-top { display: flex; align-items: baseline; gap: 10px; }
.ocx-mis-t { font-size: 16.5px; font-weight: 600; line-height: 1.3; }
.ocx-chip { flex: none; font-size: 11px; font-weight: 600; color: var(--dim); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line2); }
.ocx-chip.done { color: #1d1500; background: var(--warn); border-color: var(--warn); text-shadow: none; }
.ocx-mis-s { font-size: 13.5px; line-height: 1.5; color: var(--dim); margin-top: 6px; }
.ocx-prog { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 12.5px; color: var(--dim); }
.ocx-prog .bar { flex: 1; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.ocx-prog .bar b { display: block; height: 100%; background: var(--acc); border-radius: 2px; }
.ocx-acts { display: flex; gap: 8px; margin-top: 14px; }
.ocx-btn, .ocx .btn.ocx-btn { font: inherit; font-size: 13.5px; font-weight: 600; letter-spacing: 0; text-transform: none; padding: 9px 16px; border-radius: 999px; cursor: pointer; border: 1px solid var(--line2); background: rgba(255, 255, 255, 0.04); color: var(--ink); transition: background 0.15s, border-color 0.15s, color 0.15s; min-width: 0; box-shadow: none; }
.ocx-btn:hover { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.3); }
.ocx-btn.pri { background: var(--ink); color: #0a1217; border-color: var(--ink); text-shadow: none; }
.ocx-btn.pri:hover { background: #fff; }
.ocx-btn.danger:hover { border-color: #ff8a7a; color: #ff8a7a; }
.ocx-tip { margin-top: 18px; padding: 14px 16px; border-radius: 12px; border: 1px solid var(--line); background: var(--glass); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); font-size: 13px; line-height: 1.6; color: var(--dim); }
.ocx-tip kbd { display: inline-block; min-width: 20px; padding: 0 6px; margin: 0 2px; border-radius: 5px; border: 1px solid var(--line2); border-bottom-width: 2px; font: 600 11.5px/18px inherit; text-align: center; color: var(--ink); background: rgba(255, 255, 255, 0.06); }
/* boat */
.ocx-specs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; border-radius: 14px; overflow: hidden; border: 1px solid var(--line); background: var(--line); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); }
.ocx-spec { padding: 12px 14px; background: var(--glass2); }
.ocx-spec b { display: block; font-size: 16px; font-weight: 600; }
.ocx-spec span { display: block; font-size: 12px; color: var(--faint); margin-top: 2px; }
.ocx-presets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ocx-preset { font: inherit; text-align: left; padding: 12px; border-radius: 12px; cursor: pointer; border: 1px solid var(--line); background: var(--glass); color: var(--ink); text-shadow: inherit; backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); }
.ocx-preset:hover { border-color: var(--line2); }
.ocx-preset b { display: block; font-size: 13.5px; font-weight: 600; }
.ocx-preset span { display: block; font-size: 12px; line-height: 1.45; color: var(--faint); margin-top: 4px; }
.ocx-preset.on { border-color: rgba(95, 240, 220, 0.75); background: rgba(20, 80, 92, 0.5); }
.ocx-preset.on b::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--acc); margin-right: 7px; vertical-align: 1px; }
.ocx-rows { border-radius: 14px; border: 1px solid var(--line); background: var(--glass); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); }
.ocx-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 10px 14px; border-top: 1px solid var(--line); }
.ocx-row:first-child { border-top: none; }
.ocx-row.wrap { flex-wrap: wrap; row-gap: 8px; }
.ocx-row > span { font-size: 13.5px; color: var(--dim); }
.ocx-seg { display: inline-flex; padding: 2px; border-radius: 999px; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line); flex: none; }
.ocx-seg button { font: inherit; font-size: 12.5px; font-weight: 500; color: var(--dim); background: none; border: none; padding: 5px 11px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
.ocx-seg button:hover { color: var(--ink); }
.ocx-seg button.on { background: var(--ink); color: #0a1217; font-weight: 600; text-shadow: none; }
.ocx-note { font-size: 13px; line-height: 1.55; color: var(--faint); margin: 8px 0 12px; }
.ocx-bench { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; font-variant-numeric: tabular-nums; }
.ocx-bench th, .ocx-bench td { text-align: right; padding: 5px 4px; border-bottom: 1px solid var(--line); }
.ocx-bench th:first-child, .ocx-bench td:first-child { text-align: left; }
.ocx-bench th { color: var(--faint); font-weight: 600; }
/* atlas */
.ocx-contact { padding: 14px 16px; margin-bottom: 10px; border-radius: 14px; background: var(--glass2); border: 1px solid var(--line); backdrop-filter: blur(20px) saturate(160%); -webkit-backdrop-filter: blur(20px) saturate(160%); }
.ocx-contact-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.ocx-contact b { font-size: 15px; font-weight: 600; }
.ocx-contact .st { font-size: 11.5px; font-weight: 600; color: var(--warn); }
.ocx-contact.confirmed .st { color: var(--acc); }
.ocx-contact p { margin: 6px 0 0; font-size: 13px; color: var(--dim); line-height: 1.5; }
.ocx-contact .cap { font-style: italic; color: var(--faint); }
.ocx-ev { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); font-size: 13px; }
.ocx-ev img { width: 96px; height: 56px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); flex: none; }
.ocx-ev .k { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--acc); }
.ocx-ev .t { font-weight: 600; margin-top: 2px; }
.ocx-ev .x { color: var(--faint); margin-top: 2px; line-height: 1.45; }
.ocx-log { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 13px; color: var(--dim); }
.ocx-chart { position: absolute; left: calc(36px + min(470px, calc(100vw - 72px)) + 28px); right: 36px; top: 96px; bottom: 76px; border-radius: 16px; overflow: hidden; border: 1px solid var(--line); background: #06101a; }
.ocx-chart canvas { width: 100%; height: 100%; display: block; cursor: grab; }
.ocx-chart .hint { position: absolute; right: 14px; bottom: 12px; font-size: 12px; color: var(--faint); pointer-events: none; }
.ocx:not(.atlas) .ocx-chart { display: none; }
.ocx.atlas .ocx-cond, .ocx.atlas .ocx-go { display: none; }
/* right: conditions and the DIVE button */
.ocx-cond { position: absolute; right: 36px; top: 96px; width: 300px; max-height: calc(100vh - 96px - 290px); overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.25) transparent; padding: 14px 16px; border-radius: 14px; background: var(--glass); border: 1px solid var(--line); backdrop-filter: blur(20px) saturate(180%) brightness(1.06); -webkit-backdrop-filter: blur(20px) saturate(180%) brightness(1.06); }
.ocx-wx { margin: 4px 0 12px; }
.ocx-wx-k { display: flex; justify-content: space-between; align-items: baseline; font-size: 12.5px; color: var(--dim); margin-bottom: 6px; }
.ocx-wx-k b { font-size: 13.5px; font-weight: 600; color: var(--ink); }
.ocx-wx-range { width: 100%; margin: 2px 0 0; accent-color: var(--acc); cursor: pointer; }
.ocx-wx-ticks { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--faint); margin-top: 2px; }
.ocx-wx-seg { display: flex; width: 100%; }
.ocx-wx-seg button { flex: 1; padding: 5px 4px; }
.ocx-wx-out { border-top: 1px solid var(--line); padding-top: 6px; }
.ocx-cond h3 { margin: 0 0 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint); }
.ocx-kv { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; font-size: 13.5px; }
.ocx-kv span:first-child { color: var(--dim); }
.ocx-kv span:last-child { font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; }
.ocx-kv .warm { color: var(--warn); }
.ocx-go { position: absolute; right: 36px; bottom: 76px; width: 300px; padding: 16px; border-radius: 16px; background: var(--glass); border: 1px solid var(--line); backdrop-filter: blur(20px) saturate(180%) brightness(1.06); -webkit-backdrop-filter: blur(20px) saturate(180%) brightness(1.06); }
.ocx-ready { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.ocx-ready div { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--dim); }
.ocx-ready div b { margin-left: auto; font-weight: 500; color: var(--ink); }
.ocx-ready i { width: 7px; height: 7px; border-radius: 50%; background: #5fd38a; }
.ocx-dive { width: 100%; font: inherit; text-shadow: none; cursor: pointer; border: none; border-radius: 12px; padding: 14px 16px; background: var(--ink); color: #0a1217; text-align: left; display: flex; align-items: center; justify-content: space-between; transition: transform 0.12s, background 0.15s; }
.ocx-dive:hover { background: #fff; }
.ocx-dive:active { transform: scale(0.985); }
.ocx-dive b { display: block; font-size: 19px; font-weight: 700; }
.ocx-dive span { display: block; font-size: 12.5px; color: rgba(10, 18, 23, 0.62); margin-top: 2px; }
.ocx-dive svg { width: 22px; height: 22px; flex: none; }
/* footer */
.ocx-foot { position: absolute; left: 36px; bottom: 24px; display: flex; gap: 6px; }
.ocx-foot button { font: inherit; font-size: 13px; color: var(--dim); background: none; border: 1px solid transparent; border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.ocx-foot button:hover { color: var(--ink); border-color: var(--line); background: rgba(255, 255, 255, 0.04); }
.ocx-run { position: fixed; inset: 0; z-index: 60; pointer-events: none; display: none; }
.ocx-run.on { display: block; }
.ocx-run div { position: absolute; left: 50%; top: 20px; transform: translateX(-50%); padding: 10px 18px; border-radius: 999px; background: rgba(9, 17, 23, 0.85); border: 1px solid var(--line2); color: var(--ink); font: 600 13px 'Inter', 'Segoe UI', system-ui, sans-serif; }
.ocx.play .ocx-top, .ocx.play .ocx-main, .ocx.play .ocx-cond, .ocx.play .ocx-go, .ocx.play .ocx-foot { animation: ocx-in 0.5s ease both; }
.ocx.play .ocx-main { animation-delay: 0.05s; } .ocx.play .ocx-cond { animation-delay: 0.1s; } .ocx.play .ocx-go { animation-delay: 0.15s; } .ocx.play .ocx-foot { animation-delay: 0.2s; }
@media (max-width: 1100px) { .ocx-cond { display: none; } }
@media (max-width: 1240px) { .ocx-hint { display: none; } }
/* (a short window: the weather panel keeps its controls and the sun, the dive card its button) */
@media (max-height: 820px) { .ocx-wx-out .ocx-kv:nth-child(n+2) { display: none; } .ocx-wx { margin-bottom: 8px; } }
@media (max-height: 700px) { .ocx-ready { display: none; } }
@media (max-width: 820px) {
  .ocx-top { padding: 0 16px; gap: 14px; height: 64px; } .ocx-top-r .clock, .ocx-top-r .sep { display: none; }
  .ocx-nav button { padding: 8px 9px; font-size: 13px; }
  .ocx-main { left: 16px; right: 16px; width: auto; top: 76px; bottom: 170px; }
  .ocx-go { left: 16px; right: 16px; width: auto; bottom: 64px; padding: 12px; } .ocx-ready { display: none; }
  .ocx-foot { left: 16px; bottom: 14px; } .ocx-h1 { font-size: 28px; }
  .ocx-chart { left: 16px; right: 16px; top: auto; height: 38vh; bottom: 64px; } .ocx.atlas .ocx-main { bottom: calc(38vh + 76px); }
}
`;

function readSaved(): { stage: number | null; completed: boolean; unlocked: boolean; pulseStage: number | null; pulseDone: boolean } {
  let raw: string | null = null, car: string | null = null, praw: string | null = null;
  try {
    raw = localStorage.getItem(PROGRESS_KEY);
    car = localStorage.getItem(CAREER_KEY);
    praw = localStorage.getItem(PULSE_PROGRESS_KEY);
  } catch {
    /* none */
  }
  const c = parseCheckpoint(raw);
  const pc = parseCheckpoint(praw, PULSE_ID);
  const career = parseCareer(car);
  return { stage: c ? c.stage : null, completed: career.completed.includes(MISSION_ID), unlocked: career.unlocked.includes('deep-pulse'), pulseStage: pc ? pc.stage : null, pulseDone: career.completed.includes(PULSE_ID) };
}

const DIVE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';

export class OceanMenu {
  readonly root: HTMLDivElement;
  private section: Section = 'missions';
  private tabs = new Map<Section, HTMLElement>();
  private main: HTMLElement;
  private chartP: HTMLElement;
  private chartCv: HTMLCanvasElement;
  private chartView: ChartView | null = null;
  private clock: HTMLElement;
  private sea: HTMLElement;
  private cond: HTMLElement;
  private diveB: HTMLElement;
  private diveS: HTMLElement;
  /** the dive the big button starts (the mission picked in the list) */
  private pick: 'expedition' | 'pulse' | 'free' = 'expedition';
  private timer = 0;
  private musBtn!: HTMLButtonElement;
  private notes: WhatsNewModal;
  private notesTimer = 0;
  private simpleEl: HTMLElement;
  private settings: OceanSettings = loadOceanSettings();
  private bench: BenchResult | null = null;
  private benchRunning = false;
  private runEl: HTMLElement;

  constructor(parent: HTMLElement, private cb: OceanMenuCallbacks) {
    if (!document.getElementById('ocx-css')) {
      const st = document.createElement('style');
      st.id = 'ocx-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = el('div', 'screen menu-root ocx hidden', parent);
    try {
      const s = localStorage.getItem(SEC_KEY) as Section | null;
      if (s === 'missions' || s === 'harbor' || s === 'chart') this.section = s;
    } catch {
      /* default */
    }
    el('div', 'ocx-scrim', this.root);
    // --- top bar: the program, the pages, music and the time
    const top = el('div', 'ocx-top', this.root);
    const brand = el('div', 'ocx-brand', top);
    programLogo(brand, 'ocean', 'OCEAN', (p) => cb.onProgram(p));
    const nav = el('nav', 'ocx-nav', top);
    for (const [id, label] of SECTIONS) {
      const b = el('button', '', nav, label);
      b.type = 'button';
      b.addEventListener('click', () => this.go(id));
      this.tabs.set(id, b);
    }
    const right = el('div', 'ocx-top-r', top);
    this.sea = el('span', '', right);
    el('span', 'sep', right);
    this.clock = el('span', 'clock num', right);
    const mus = (this.musBtn = el('button', 'ocx-music' + (menuMusic.enabled ? ' on' : ''), right) as HTMLButtonElement);
    mus.type = 'button';
    mus.title = 'Music on / off';
    el('i', '', mus);
    mus.append('Music');
    mus.addEventListener('click', () => mus.classList.toggle('on', menuMusic.toggle()));
    // --- the column
    this.main = el('div', 'ocx-main', this.root);
    // --- the chart (ECHO ATLAS only)
    this.chartP = el('div', 'ocx-chart', this.root);
    this.chartCv = el('canvas', '', this.chartP);
    el('div', 'hint', this.chartP, 'Drag to move · scroll to zoom');
    let cd: { x: number; y: number } | null = null;
    this.chartCv.addEventListener('pointerdown', (e) => (cd = { x: e.clientX, y: e.clientY }));
    window.addEventListener('pointermove', (e) => {
      if (!cd || !this.chartView) return;
      this.chartView.cx -= (e.clientX - cd.x) / this.chartView.k;
      this.chartView.cz -= (e.clientY - cd.y) / this.chartView.k;
      cd = { x: e.clientX, y: e.clientY };
      this.drawChart();
    });
    window.addEventListener('pointerup', () => (cd = null));
    this.chartCv.addEventListener(
      'wheel',
      (e) => {
        if (!this.chartView) return;
        e.preventDefault();
        this.chartView.k = Math.max(0.05, Math.min(3, this.chartView.k * Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.002)));
        this.drawChart();
      },
      { passive: false },
    );
    // --- right: the conditions, and the boat with the DIVE button
    this.cond = el('div', 'ocx-cond', this.root);
    const go = el('div', 'ocx-go', this.root);
    const ready = el('div', 'ocx-ready', go);
    for (const [k, v] of [['Boat', 'SV-1 Petrel'], ['Battery', 'Charged'], ['Lamps', 'Tested'], ['Hydrophones', 'Ready']]) {
      const r = el('div', '', ready);
      el('i', '', r);
      r.append(k);
      el('b', '', r, v);
    }
    const dive = el('button', 'ocx-dive', go) as HTMLButtonElement;
    dive.type = 'button';
    const dt = el('div', '', dive);
    this.diveB = el('b', '', dt, 'Dive');
    this.diveS = el('span', '', dt, '');
    dive.insertAdjacentHTML('beforeend', DIVE_ICON);
    dive.addEventListener('click', () => this.startPicked());
    el('div', 'ocx-hint', this.root, 'Drag to look around · scroll to zoom · double-click to reset');
    // --- footer
    const foot = el('div', 'ocx-foot', this.root);
    const link = (t: string, f: () => void) => {
      const b = el('button', '', foot, t);
      b.type = 'button';
      b.addEventListener('click', f);
      return b;
    };
    link('Settings', () => cb.onSettings());
    link('Controls', () => cb.onControls());
    this.notes = new WhatsNewModal(document.body, 'ocean');
    link(`What's new · v${this.notes.latest}`, () => this.notes.show(true));
    link('Simple menu', () => this.setStyle('simple'));
    this.simpleEl = el('div', 'sm', this.root);
    this.root.classList.toggle('simple', menuStyle('ocean') === 'simple');
    this.renderSimpleMenu();
    this.runEl = el('div', 'ocx-run', document.body);
    el('div', '', this.runEl, 'Benchmark running · about a minute');
    this.go(this.section, false);
  }

  /** start whatever the big button says */
  private startPicked(): void {
    const s = readSaved();
    if (this.pick === 'free') this.cb.onDive('free', false);
    else if (this.pick === 'pulse' && s.unlocked) this.cb.onDive('pulse', s.pulseStage !== null);
    else this.cb.onDive('expedition', s.stage !== null);
  }

  private setStyle(v: 'current' | 'simple'): void {
    setMenuStyle('ocean', v);
    this.root.classList.toggle('simple', v === 'simple');
    this.renderSimpleMenu();
  }

  private renderSimpleMenu(): void {
    if (!this.root.classList.contains('simple')) return;
    const cb = this.cb;
    const s = readSaved();
    const tiles = [
      { title: s.stage !== null ? 'CONTINUE THE EXPEDITION' : 'THE SILENT BUOY', sub: s.stage !== null ? `Stage ${s.stage + 1} of ${STAGES.length}` : 'Find what is knocking under the slope', img: '', tag: s.completed ? 'DONE' : undefined, click: () => cb.onDive('expedition', s.stage !== null) },
      ...(s.unlocked ? [{ title: s.pulseStage !== null ? 'CONTINUE THE SLOW PULSE' : 'THE SLOW PULSE', sub: s.pulseStage !== null ? `Stage ${s.pulseStage + 1} of ${PULSE_STAGES.length}` : 'Find what is pulsing in the deep basin', img: '', tag: s.pulseDone ? 'DONE' : undefined, click: () => cb.onDive('pulse', s.pulseStage !== null) }] : []),
      { title: 'FREE SURVEY', sub: 'Leave the harbor: listen, ping, chart', img: '', click: () => cb.onDive('free', false) },
      { title: 'ECHO ATLAS', sub: 'The chart and everything heard', img: '', click: () => {
        this.setStyle('current');
        this.go('chart');
      } },
      { title: 'THE BOAT', sub: 'The boat, graphics and the benchmark', img: '', click: () => {
        this.setStyle('current');
        this.go('harbor');
      } },
    ];
    renderSimple(this.simpleEl, {
      program: 'ocean',
      subtitle: 'OCEAN',
      heading: 'WHERE DO YOU WANT TO DIVE?',
      tiles,
      links: [
        ['SETTINGS', () => cb.onSettings()],
        ['CONTROLS', () => cb.onControls()],
        [`v${this.notes.latest} NOTES`, () => this.notes.show(true)],
        [menuMusic.enabled ? 'MUSIC ON' : 'MUSIC OFF', () => {
          menuMusic.toggle();
          this.musBtn.classList.toggle('on', menuMusic.enabled);
          this.renderSimpleMenu();
        }],
      ],
      onProgram: (p) => cb.onProgram(p),
      onFull: () => this.setStyle('current'),
    });
  }

  show(v: boolean): void {
    const was = !this.root.classList.contains('hidden');
    this.root.classList.toggle('hidden', !v);
    menuMusic.want('ocean', v);
    this.musBtn.classList.toggle('on', menuMusic.enabled);
    window.clearInterval(this.timer);
    if (v) {
      this.settings = loadOceanSettings();
      this.renderCond();
      this.tick();
      this.timer = window.setInterval(() => this.tick(), 1000);
      if (!was) {
        this.root.classList.remove('play');
        void this.root.offsetWidth;
        this.root.classList.add('play');
        this.go(this.section, false);
        this.renderSimpleMenu();
        window.clearTimeout(this.notesTimer);
        this.notesTimer = window.setTimeout(() => {
          if (!this.root.classList.contains('hidden')) this.notes.showIfNew();
        }, 1200);
      }
    } else {
      window.clearTimeout(this.notesTimer);
      this.notes.show(false);
    }
  }

  private tick(): void {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    this.clock.textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
    const wp = this.settings.weather;
    this.sea.textContent = `${TIMES.find(([k]) => k === wp.time)?.[1] ?? ''} · ${SKIES.find(([k]) => k === wp.sky)?.[1] ?? ''}`;
    // the big button says what a dive would be
    const s = readSaved();
    if (this.pick === 'pulse' && !s.unlocked) this.pick = 'expedition';
    let t = 'Dive', sub = '';
    if (this.pick === 'free') sub = 'Free survey · open sea';
    else if (this.pick === 'pulse') {
      t = s.pulseStage !== null ? 'Continue' : 'Dive';
      sub = s.pulseStage !== null ? `The Slow Pulse · stage ${s.pulseStage + 1} of ${PULSE_STAGES.length}` : 'The Slow Pulse';
    } else {
      t = s.stage !== null ? 'Continue' : 'Dive';
      sub = s.stage !== null ? `The Silent Buoy · stage ${s.stage + 1} of ${STAGES.length}` : s.completed ? 'The Silent Buoy · again' : 'The Silent Buoy';
    }
    if (this.diveB.textContent !== t) this.diveB.textContent = t;
    if (this.diveS.textContent !== sub) this.diveS.textContent = sub;
  }

  private go(s: Section, animate = true): void {
    this.section = s;
    try {
      localStorage.setItem(SEC_KEY, s);
    } catch {
      /* */
    }
    for (const [k, b] of this.tabs) b.classList.toggle('on', k === s);
    this.root.classList.toggle('atlas', s === 'chart');
    clearEl(this.main);
    if (s === 'missions') this.renderMissions();
    else if (s === 'harbor') this.renderBoat();
    else this.renderAtlas();
    this.main.scrollTop = 0;
    if (animate) {
      this.main.classList.remove('swap');
      void this.main.offsetWidth;
      this.main.classList.add('swap');
    }
    if (s === 'chart') requestAnimationFrame(() => this.drawChart());
  }

  private head(eye: string, title: string, lead: string): void {
    el('div', 'ocx-eye', this.main, eye);
    el('div', 'ocx-h1', this.main, title);
    el('p', 'ocx-lead', this.main, lead);
  }

  /** the weather panel: time of day on a slider, the sky and the sea as buttons, and what they come to */
  private renderCond(): void {
    clearEl(this.cond);
    el('h3', '', this.cond, 'Weather');
    const pick = this.settings.weather;
    // time of day: five stops through the day
    const tr = el('div', 'ocx-wx', this.cond);
    const tk = el('div', 'ocx-wx-k', tr);
    el('span', '', tk, 'Time of day');
    const tv = el('b', '', tk, TIMES.find(([k]) => k === pick.time)?.[1] ?? '');
    const range = el('input', 'ocx-wx-range', tr) as HTMLInputElement;
    range.type = 'range';
    range.min = '0';
    range.max = String(TIMES.length - 1);
    range.step = '1';
    range.value = String(Math.max(0, TIMES.findIndex(([k]) => k === pick.time)));
    range.setAttribute('aria-label', 'Time of day');
    range.addEventListener('input', () => {
      const t = TIMES[+range.value];
      if (!t) return;
      tv.textContent = t[1];
      this.setWeather({ ...this.settings.weather, time: t[0] }, false);
    });
    range.addEventListener('change', () => this.renderCond());
    const ticks = el('div', 'ocx-wx-ticks', tr);
    for (const [, t] of TIMES) el('span', '', ticks, t === 'Afternoon' ? 'Aft.' : t);
    this.wxSeg(this.cond, 'Sky', 'sky', SKIES);
    this.wxSeg(this.cond, 'Sea', 'sea', SEAS);
    const w = weatherOf(pick);
    const rows: [string, string, string?][] = [
      ['Sun', `${w.sunEl}° above the horizon`, w.sunEl < 12 ? 'warm' : undefined],
      ['Wind', `${Math.round(6 + w.wind * 22)} kt`],
      ['Swell', `${(w.amp * 1.4).toFixed(1)} m`],
      ['Water', 'Clear coastal · 14 °C'],
    ];
    const kv = el('div', 'ocx-wx-out', this.cond);
    for (const [k, v, c] of rows) {
      const r = el('div', 'ocx-kv', kv);
      el('span', '', r, k);
      el('span', c ?? '', r, v);
    }
  }

  /** a row of weather buttons (the panel's and the boat page's are kept in step) */
  private wxSeg<K extends 'sky' | 'sea'>(parent: HTMLElement, label: string, key: K, opts: [WeatherPick[K], string][]): void {
    const g = el('div', 'ocx-wx', parent);
    el('div', 'ocx-wx-k', g, label);
    const seg = el('div', 'ocx-seg ocx-wx-seg', g);
    for (const [v, t] of opts) {
      const b = el('button', this.settings.weather[key] === v ? 'on' : '', seg, t) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.wx = key;
      b.dataset.v = v;
      b.addEventListener('click', () => this.setWeather({ ...this.settings.weather, [key]: v }));
    }
  }

  /** a new weather: saved, and the harbor behind the menu follows it at once */
  private setWeather(p: WeatherPick, redraw = true): void {
    this.settings = { ...this.settings, weather: p };
    saveOceanSettings(this.settings);
    if (redraw) this.renderCond();
    this.root.querySelectorAll<HTMLButtonElement>('[data-wx]').forEach((b) => b.classList.toggle('on', this.settings.weather[b.dataset.wx as 'sky' | 'sea'] === b.dataset.v));
    this.root.querySelectorAll<HTMLButtonElement>('[data-wxt]').forEach((b) => b.classList.toggle('on', this.settings.weather.time === b.dataset.wxt));
    this.tick();
  }

  // ------------------------------------------------------------------ MISSIONS
  private renderMissions(): void {
    this.head('Kestrel Harbor · survey office', 'Dive plan', 'Petrel is alongside at berth 1, charged and ready. Pick a dive, then press Dive.');
    const s = readSaved();
    const card = (id: 'expedition' | 'pulse' | 'free', title: string, kind: string, text: string, open: boolean, stage: [number, number] | null, done: boolean, lockText?: string) => {
      const r = el('div', 'ocx-mis' + (open ? '' : ' locked') + (open && this.pick === id ? ' sel' : ''), this.main);
      const top = el('div', 'ocx-mis-top', r);
      el('div', 'ocx-mis-t', top, title);
      el('span', 'ocx-chip' + (done ? ' done' : ''), top, done ? 'Completed' : kind);
      el('div', 'ocx-mis-s', r, open ? text : lockText ?? text);
      if (stage) {
        const pr = el('div', 'ocx-prog', r);
        const bar = el('div', 'bar', pr);
        el('b', '', bar).style.width = `${(stage[0] / stage[1]) * 100}%`;
        el('span', 'num', pr, `Stage ${stage[0] + 1} of ${stage[1]}`);
      }
      if (!open) return;
      r.addEventListener('click', () => {
        this.pick = id;
        this.main.querySelectorAll('.ocx-mis').forEach((x) => x.classList.toggle('sel', x === r));
        this.tick();
      });
      if (stage) {
        const a = el('div', 'ocx-acts', r);
        button('Continue', 'ocx-btn pri', a, () => this.cb.onDive(id, true));
        button('Start over', 'ocx-btn', a, () => this.cb.onDive(id, false));
      }
    };
    card('expedition', MISSION_TITLE.replace(/^QUIET SURVEY: /i, 'Quiet Survey: ').replace(/THE SILENT BUOY/i, 'The Silent Buoy'), 'Expedition', 'A double knock under the slope that nobody can place. Listen for it, take bearings, find it, and bring back what you can.', true, s.stage !== null ? [s.stage, STAGES.length] : null, s.completed && s.stage === null);
    card('free', 'Free survey', 'Open sea', 'Leave the harbor with no task. Listen, ping, chart the reef, the slope and the deep basin. Come back to the berth to finish.', true, null, false);
    card('pulse', 'The Slow Pulse', 'Follow-up', "A slow, low pulse from the deep basin, on ORIEL BAY's recorder and the harbor's hydrophone log. Take bearings on it, go down and find what is sending it. Deep work: 280 m and more.", s.unlocked, s.unlocked && s.pulseStage !== null ? [s.pulseStage, PULSE_STAGES.length] : null, s.pulseDone && s.pulseStage === null, 'Finish the Silent Buoy expedition to open this.');
    const tip = el('div', 'ocx-tip', this.main);
    tip.innerHTML = 'Ocean is about listening. Slow down and go quiet with <kbd>Q</kbd> to hear faint sounds; take bearings from two places and they cross where the sound comes from. A ping, <kbd>P</kbd>, shows the ground and anything hard, but drowns faint sounds for a few seconds.';
  }

  // ------------------------------------------------------------------ THE BOAT
  private renderBoat(): void {
    this.head('Berth 1 · alongside', 'SV-1 Petrel', 'A one-pilot survey submersible: an acrylic bow dome, two stern and two vertical thrusters, LED lamps and floodlights, a scanning sonar with a multibeam under the hull, a hydrophone array and a five-function arm.');
    const grid = el('div', 'ocx-specs', this.main);
    for (const [v, k] of [
      [`${SURVEY_SUB.length} m`, 'Length'],
      [`${(SURVEY_SUB.mass / 1000).toFixed(1)} t`, 'Mass'],
      ['5 kn', 'Top speed'],
      [`${DEPTH_BANDS.comfortable} m`, 'Depth rating'],
      [`${DEPTH_BANDS.limit} m`, 'Hull limit'],
      ['2 + 7', 'Lamps + floods'],
    ]) {
      const c = el('div', 'ocx-spec', grid);
      el('b', 'num', c, v);
      el('span', '', c, k);
    }
    el('div', 'ocx-h2', this.main, 'Graphics');
    const pr = el('div', 'ocx-presets', this.main);
    for (const id of ['performance', 'balanced', 'cinematic'] as OceanPreset[]) {
      const d = PRESETS[id];
      const b = el('button', 'ocx-preset' + (this.settings.preset === id ? ' on' : ''), pr) as HTMLButtonElement;
      b.type = 'button';
      el('b', '', b, cap(d.label));
      el('span', '', b, d.blurb);
      b.addEventListener('click', () => {
        this.settings = { ...this.settings, preset: id };
        saveOceanSettings(this.settings);
        pr.querySelectorAll('.ocx-preset').forEach((x) => x.classList.toggle('on', x === b));
        const rb = this.main.querySelector('.ocx-runb');
        if (rb && !this.benchRunning) rb.textContent = `Run on ${cap(PRESETS[id].label)}`;
      });
    }
    el('div', 'ocx-h2', this.main, 'Diving');
    const rows = el('div', 'ocx-rows', this.main);
    const seg = <K extends keyof OceanSettings>(label: string, key: K, opts: [OceanSettings[K], string][]) => {
      const r = el('div', 'ocx-row', rows);
      el('span', '', r, label);
      const g = el('div', 'ocx-seg', r);
      for (const [v, t] of opts) {
        const b = el('button', this.settings[key] === v ? 'on' : '', g, t) as HTMLButtonElement;
        b.type = 'button';
        b.addEventListener('click', () => {
          this.settings = { ...this.settings, [key]: v };
          saveOceanSettings(this.settings);
          g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          this.renderCond();
          this.tick();
        });
      }
    };
    // the weather (the same as the panel at the right)
    {
      const r = el('div', 'ocx-row wrap', rows);
      el('span', '', r, 'Time of day');
      const g = el('div', 'ocx-seg', r);
      for (const [v, t] of TIMES) {
        const b = el('button', this.settings.weather.time === v ? 'on' : '', g, t) as HTMLButtonElement;
        b.type = 'button';
        b.dataset.wxt = v;
        b.addEventListener('click', () => this.setWeather({ ...this.settings.weather, time: v }));
      }
      for (const [label, key, opts] of [['Sky', 'sky', SKIES], ['Sea', 'sea', SEAS]] as const) {
        const rr = el('div', 'ocx-row', rows);
        el('span', '', rr, label);
        const gg = el('div', 'ocx-seg', rr);
        for (const [v, t] of opts) {
          const b = el('button', this.settings.weather[key] === v ? 'on' : '', gg, t) as HTMLButtonElement;
          b.type = 'button';
          b.dataset.wx = key;
          b.dataset.v = v;
          b.addEventListener('click', () => this.setWeather({ ...this.settings.weather, [key]: v }));
        }
      }
    }
    seg('Guidance', 'guidance', [['markers', 'Markers'], ['bearing', 'Compass'], ['instruments', 'Instruments']]);
    seg('Battery', 'relaxed', [[false, 'Real drain'], [true, 'No drain']]);
    seg('Visibility aid', 'visibilityAid', [[false, 'Off'], [true, 'On']]);
    seg('Large HUD', 'largeHud', [[false, 'Off'], [true, 'On']]);
    seg('Reduce motion', 'reduceMotion', [[false, 'Off'], [true, 'On']]);
    seg('Look speed', 'lookSpeed', [[0.6, 'Slow'], [1, 'Normal'], [1.5, 'Fast']]);
    el('div', 'ocx-h2', this.main, 'Benchmark');
    el('div', 'ocx-note', this.main, 'The same route every time: the harbor at dawn, a rough surface, down through the waterline and back, the reef, the wreck with the lamps on, the deep basin and a spell of listening. About a minute.');
    const b = el('div', 'ocx-acts', this.main);
    const run = button(this.benchRunning ? 'Running…' : `Run on ${cap(PRESETS[this.settings.preset].label)}`, 'ocx-btn pri ocx-runb', b, () => {
      if (this.benchRunning) return;
      this.benchRunning = true;
      run.textContent = 'Running…';
      this.root.style.visibility = 'hidden';
      this.runEl.classList.add('on');
      void this.cb.onBenchmark(this.settings.preset).then((r) => {
        this.bench = r;
        this.benchRunning = false;
        this.root.style.visibility = '';
        this.runEl.classList.remove('on');
        if (import.meta.env.DEV) Object.assign(window, { __bench: r });
        if (this.section === 'harbor') this.go('harbor', false);
      });
    });
    if (this.bench) this.benchTable(this.bench);
  }

  private benchTable(r: BenchResult): void {
    const t = el('table', 'ocx-bench', this.main);
    const hr = el('tr', '', t);
    for (const h of ['Segment', 'Median', 'P95', 'P99', 'Max', '>50', 'FPS']) el('th', '', hr, h);
    const row = (label: string, s: { medianMs: number; p95Ms: number; p99Ms: number; maxMs: number; over50: number; avgFps: number }) => {
      const tr = el('tr', '', t);
      el('td', '', tr, label);
      for (const v of [s.medianMs, s.p95Ms, s.p99Ms, s.maxMs]) el('td', '', tr, v.toFixed(1));
      el('td', '', tr, String(s.over50));
      el('td', '', tr, s.avgFps.toFixed(0));
    };
    for (const s of r.segments) row(s.label, s);
    row('Whole route', r.total);
    el('div', 'ocx-note', this.main, `${cap(r.preset)} · ${r.width} × ${r.height} · frame times in ms (leaving the menu: ${r.warmupMaxMs} ms, not counted) · heap ${r.memory.heapStartMB ?? '?'} → ${r.memory.heapEndMB ?? '?'} MB · ${r.stream.chunkBuilds} sea-bed tiles built${r.stream.workerTiles ? ` (${r.stream.workerTiles} on a worker thread, slowest there ${r.stream.workerMaxMs} ms)` : ''}, ${r.stream.chunkDisposals} released, slowest on the main thread ${r.stream.maxChunkMs} ms · ${r.gpu}`);
  }

  // ------------------------------------------------------------------ ECHO ATLAS
  private renderAtlas(): void {
    const a = new EchoAtlas();
    const d = a.data;
    const km = d.tracks.reduce((s, tr) => {
      let L = 0;
      for (let i = 1; i < tr.points.length; i++) L += Math.hypot(tr.points[i][0] - tr.points[i - 1][0], tr.points[i][1] - tr.points[i - 1][1]);
      return s + L;
    }, 0) / 1000;
    this.head('Echo Atlas', 'What you have heard', `${d.tracks.length} dive${d.tracks.length === 1 ? '' : 's'} · ${d.contacts.length} contact${d.contacts.length === 1 ? '' : 's'} · ${d.evidence.length} piece${d.evidence.length === 1 ? '' : 's'} of evidence · ${km < 10 ? km.toFixed(1) : Math.round(km)} km surveyed`);
    if (!d.contacts.length) el('div', 'ocx-note', this.main, 'Nothing yet. Contacts appear here the first time the hydrophones pick them out of the noise, with every bearing you take on them.');
    for (const c of d.contacts) {
      const e = el('div', 'ocx-contact' + (c.status === 'confirmed' ? ' confirmed' : ''), this.main);
      const t = el('div', 'ocx-contact-top', e);
      el('b', '', t, c.label);
      el('span', 'st', t, cap(c.status));
      el('p', 'cap', e, c.pattern.caption);
      const obs = d.observations.filter((o) => o.contactId === c.id).length;
      el('p', '', e, `${obs} bearing${obs === 1 ? '' : 's'}${c.estimate ? ` · search area ${Math.round(c.estimate.r)} m across` : ''}${c.site ? ` · at ${Math.round(c.site.depth)} m` : ''}`);
      for (const it of c.interpretations) el('p', '', e, it.text);
    }
    if (d.evidence.length) {
      el('div', 'ocx-h2', this.main, 'Evidence');
      for (const ev of d.evidence.slice().reverse()) {
        const r = el('div', 'ocx-ev', this.main);
        if (ev.image) {
          const im = el('img', '', r) as HTMLImageElement;
          im.src = ev.image;
          im.alt = ev.title;
        }
        const t = el('div', '', r);
        el('div', 'k', t, ev.kind);
        el('div', 't', t, ev.title);
        el('div', 'x', t, ev.text);
      }
    }
    if (d.expeditions.length) {
      el('div', 'ocx-h2', this.main, 'Log');
      for (const x of d.expeditions.slice().reverse()) {
        const r = el('div', 'ocx-log num', this.main);
        el('span', '', r, new Date(x.t).toLocaleDateString());
        el('span', '', r, `${Math.round(x.durationS / 60)} min · ${(x.distanceM / 1000).toFixed(1)} km · ${Math.round(x.maxDepth)} m · ${x.bearings} bearings`);
      }
    }
    const b = el('div', 'ocx-acts', this.main);
    b.style.marginTop = '18px';
    const reset = button('Clear the atlas', 'ocx-btn danger', b, () => {
      if (reset.dataset.sure !== '1') {
        reset.dataset.sure = '1';
        reset.textContent = 'Click again to clear';
        return;
      }
      a.reset();
      this.go('chart', false);
    });
  }

  private drawChart(): void {
    if (this.section !== 'chart') return;
    const W = this.chartCv.clientWidth, H = this.chartCv.clientHeight;
    if (!W || !H) return;
    this.chartView ??= fitView(W, H, -1300, 1300, -500, 3100);
    drawChart(this.chartCv, this.chartView, new EchoAtlas().data, {});
  }
}

/** "DAWN SWELL" → "Dawn swell" */
function cap(t: string): string {
  const s = t.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
