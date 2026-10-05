// The flight display for the space program: mission-control blue on black.
// Top: the mission clock, the flight state (ON THE PAD, POWERED FLIGHT,
// IN ORBIT, FALLING, SAFE) and the three big lamps ORBIT / FALLING / SAFE.
// Left: the vehicle (stage stack, engine lights as on the real Saturn V
// panel, propellant, delta-v). Right: the orbit (apoapsis, periapsis,
// inclination, period, a live diagram). Bottom: the attitude ball between
// altitude and speed tapes, the aerodynamic load bars, the event log and the
// controls, every one of them also clickable.

import { el, clearEl } from '../ui/dom';
import { EARTH, V3, cross, dot, enu, len, norm, orbitPoint, rotY, scale, sub, earthAngle, PAD } from './universe';
import { ENGINES, FlightSim, PART_ORDER, PartId, PARTS, SasMode, Status, qrot } from './flightSim';
import type { Action } from './autopilot';

export interface FlightHandlers {
  stage(): void;
  ignite(): void;
  cutoff(): void;
  guidance(): void;
  autoStage(): void;
  sas(m: SasMode): void;
  warp(d: number): void;
  map(): void;
  camera(): void;
  abort(): void;
  cmSep(): void;
  pause(): void;
  help(): void;
  /** easy flying: the n-th goal button */
  action(n: number): void;
  ff(): void;
  pro(): void;
}

/** what the easy panel shows */
export interface EasyView {
  guide: string;
  actions: Action[];
  ff: boolean;
  abort: boolean;
}

export interface FlightInfo {
  warp: number;
  warpMax: number;
  camMode: string;
  map: boolean;
  easy: EasyView | null;
}

const fmtT = (t: number) => {
  const s = Math.abs(t);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return `${t < 0 ? 'T-' : 'T+'}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};
const mmss = (t: number) => {
  if (!Number.isFinite(t)) return '--:--';
  const s = Math.max(0, t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};
const km = (m: number) => (Math.abs(m) >= 1e6 ? `${(m / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })} km` : `${(m / 1000).toFixed(1)} km`);
const STATUS_TEXT: Record<Status, [string, string]> = {
  pad: ['ON THE PAD', 'pad'],
  ascent: ['POWERED FLIGHT', 'warn'],
  suborbital: ['SUBORBITAL', 'warn'],
  falling: ['FALLING', 'bad'],
  orbit: ['IN ORBIT', 'good'],
  safe: ['SAFE', 'safe'],
  landed: ['CREW SAFE', 'good'],
  lost: ['VEHICLE LOST', 'bad'],
};

export class FlightUI {
  readonly root: HTMLElement;
  private clock: HTMLElement;
  private badge: HTMLElement;
  private badgeSub: HTMLElement;
  private lamps: Record<'orbit' | 'falling' | 'safe', HTMLElement>;
  private stack: HTMLElement;
  private stackParts = new Map<PartId, HTMLElement>();
  private engRow: HTMLElement;
  private stageName: HTMLElement;
  private propBar: HTMLElement;
  private propText: HTMLElement;
  private vehRows: Record<string, HTMLElement> = {};
  private orbRows: Record<string, HTMLElement> = {};
  private orbCanvas: HTMLCanvasElement;
  private ball: HTMLCanvasElement;
  private ballImg: ImageData | null = null;
  private ballRead: HTMLElement;
  private tapeL: Record<string, HTMLElement> = {};
  private tapeR: Record<string, HTMLElement> = {};
  private qBar: HTMLElement;
  private qaBar: HTMLElement;
  private qText: HTMLElement;
  private qaText: HTMLElement;
  private log: HTMLElement;
  private logCount = -1;
  private flashEl: HTMLElement;
  private flashTimer = 0;
  private btn: Record<string, HTMLButtonElement> = {};
  private sasBtns = new Map<SasMode, HTMLButtonElement>();
  private warpText: HTMLElement;
  private hint: HTMLElement;
  private overlay: HTMLElement;
  private helpEl: HTMLElement;
  private labels: HTMLElement;
  readonly mapCanvas: HTMLCanvasElement;
  readonly labelAp: HTMLElement;
  readonly labelPe: HTMLElement;
  private lastEvent = 0;
  private ezGuide: HTMLElement;
  private ezActs: HTMLElement;
  private ezSig = '';
  private ezBtn: Record<string, HTMLButtonElement> = {};
  private ezWarp: HTMLElement;

  constructor(parent: HTMLElement, private h: FlightHandlers) {
    this.root = el('div', 'fx hidden', parent);
    el('div', 'fx-vignette', this.root);
    // ---- top: clock and state
    const top = el('div', 'fx-top', this.root);
    this.clock = el('div', 'fx-clock', top, 'T-00:00:20');
    const st = el('div', 'fx-state', top);
    this.badge = el('div', 'fx-badge pad', st, 'ON THE PAD');
    this.badgeSub = el('div', 'fx-badge-sub', st, '');
    const lamps = el('div', 'fx-lamps', top);
    const lamp = (k: 'orbit' | 'falling' | 'safe', t: string) => {
      const l = el('div', 'fx-lamp ' + k, lamps);
      el('i', '', l);
      el('span', '', l, t);
      return l;
    };
    this.lamps = { orbit: lamp('orbit', 'ORBIT'), falling: lamp('falling', 'FALLING'), safe: lamp('safe', 'SAFE') };

    // ---- left: the vehicle
    const veh = el('div', 'fx-panel fx-veh', this.root);
    el('div', 'fx-h', veh, 'VEHICLE');
    const vb = el('div', 'fx-veh-body', veh);
    this.stack = el('div', 'fx-stack', vb);
    const labels: Record<PartId, string> = { les: 'LES', cm: 'CM', slaSm: 'SM · LM', sivb: 'S-IVB', sii: 'S-II', siiInter: '', sic: 'S-IC' };
    for (const p of [...PART_ORDER].reverse()) {
      const d = PARTS[p];
      const b = el('div', 'fx-stk ' + p, this.stack);
      b.style.flexGrow = String(Math.max(0.6, d.y1 - Math.max(d.y0, 0)));
      if (labels[p]) el('span', '', b, labels[p]);
      this.stackParts.set(p, b);
    }
    const vr = el('div', 'fx-veh-r', vb);
    this.stageName = el('div', 'fx-stage', vr, 'S-IC');
    this.engRow = el('div', 'fx-eng', vr);
    const pb = el('div', 'fx-prop', vr);
    this.propBar = el('i', '', el('div', 'fx-prop-bar', pb));
    this.propText = el('div', 'fx-prop-t', pb, '');
    for (const [k, t] of [['mass', 'MASS'], ['twr', 'THRUST / WEIGHT'], ['dv', 'Δv STAGE · TOTAL'], ['burn', 'BURN LEFT'], ['ctl', 'CONTROL'], ['restart', 'J-2 STARTS LEFT']]) {
      const r = el('div', 'fx-kv', vr);
      el('span', 'k', r, t);
      this.vehRows[k] = el('span', 'v', r, '—');
    }

    // ---- right: the orbit
    const orb = el('div', 'fx-panel fx-orb', this.root);
    el('div', 'fx-h', orb, 'ORBIT');
    this.orbCanvas = el('canvas', 'fx-orb-c', orb) as HTMLCanvasElement;
    this.orbCanvas.width = 520;
    this.orbCanvas.height = 300;
    for (const [k, t] of [['ap', 'APOAPSIS'], ['pe', 'PERIAPSIS'], ['tap', 'TIME TO AP'], ['tpe', 'TIME TO PE'], ['inc', 'INCLINATION'], ['per', 'PERIOD'], ['ecc', 'ECCENTRICITY'], ['ground', 'OVER']]) {
      const r = el('div', 'fx-kv', orb);
      el('span', 'k', r, t);
      this.orbRows[k] = el('span', 'v', r, '—');
    }

    // ---- bottom centre: tapes and the attitude ball
    const mid = el('div', 'fx-mid', this.root);
    const tl = el('div', 'fx-tape l', mid);
    for (const [k, t] of [['alt', 'ALTITUDE'], ['vv', 'VERTICAL'], ['g', 'G-LOAD']]) {
      const c = el('div', 'fx-tv', tl);
      this.tapeL[k] = el('div', 'v', c, '—');
      el('div', 'k', c, t);
    }
    const bw = el('div', 'fx-ball-w', mid);
    this.ball = el('canvas', 'fx-ball', bw) as HTMLCanvasElement;
    this.ball.width = this.ball.height = 220;
    this.ballRead = el('div', 'fx-ball-r', bw, '');
    const tr = el('div', 'fx-tape r', mid);
    for (const [k, t] of [['v', 'ORBITAL SPEED'], ['vs', 'SURFACE SPEED'], ['mach', 'MACH']]) {
      const c = el('div', 'fx-tv', tr);
      this.tapeR[k] = el('div', 'v', c, '—');
      el('div', 'k', c, t);
    }
    const loads = el('div', 'fx-loads', this.root);
    const bar = (t: string) => {
      const r = el('div', 'fx-load', loads);
      const head = el('div', 'fx-load-h', r);
      el('span', '', head, t);
      const v = el('span', 'v', head, '');
      const b = el('i', '', el('div', 'fx-load-b', r));
      return [b, v] as const;
    };
    [this.qBar, this.qText] = bar('DYNAMIC PRESSURE');
    [this.qaBar, this.qaText] = bar('AERO LOAD q·α');

    // ---- bottom left: the event log
    const lg = el('div', 'fx-panel fx-log', this.root);
    el('div', 'fx-h', lg, 'FLIGHT LOG');
    this.log = el('div', 'fx-log-b', lg);

    // ---- bottom right: controls
    const ctl = el('div', 'fx-panel fx-ctl', this.root);
    const row = (cls = '') => el('div', 'fx-row ' + cls, ctl);
    const b = (r: HTMLElement, k: string, t: string, key: string, fn: () => void, cls = '') => {
      const x = el('button', 'fx-btn ' + cls, r) as HTMLButtonElement;
      x.type = 'button';
      el('span', 'l', x, t);
      el('span', 'kk', x, key);
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
        x.blur();
      });
      this.btn[k] = x;
      return x;
    };
    const r1 = row();
    b(r1, 'stage', 'STAGE', 'SPACE', () => h.stage(), 'wide');
    b(r1, 'ignite', 'IGNITE', 'Z', () => h.ignite());
    b(r1, 'cutoff', 'CUTOFF', 'X', () => h.cutoff());
    const r2 = row();
    b(r2, 'guid', 'IU GUIDANCE', 'G', () => h.guidance(), 'wide');
    b(r2, 'auto', 'AUTO-STAGE', 'T', () => h.autoStage(), 'wide');
    const r3 = row('sas');
    const sas: [SasMode, string, string][] = [['stab', 'STAB', '1'], ['hold', 'HOLD', '2'], ['pro', 'PRO', '3'], ['retro', 'RETRO', '4'], ['normal', 'NRM', '5'], ['anti', 'A-NRM', '6'], ['radOut', 'RAD+', '7'], ['radIn', 'RAD-', '8'], ['off', 'FREE', '0']];
    for (const [m, t, k] of sas) this.sasBtns.set(m, b(r3, 'sas-' + m, t, k, () => h.sas(m), 'sm'));
    const r4 = row();
    b(r4, 'warpd', '◀◀', ',', () => h.warp(-1), 'sm');
    this.warpText = el('div', 'fx-warp', r4, '1×');
    b(r4, 'warpu', '▶▶', '.', () => h.warp(1), 'sm');
    b(r4, 'map', 'MAP', 'M', () => h.map());
    b(r4, 'cam', 'CAMERA', 'C', () => h.camera());
    const r5 = row();
    b(r5, 'abort', 'ABORT', 'B ×2', () => h.abort(), 'red wide');
    b(r5, 'cmsep', 'CM SEP', 'J ×2', () => h.cmSep(), 'amber wide');
    b(r5, 'help', '?', 'H', () => h.help(), 'sm');
    b(r5, 'pause', 'II', 'ESC', () => h.pause(), 'sm');
    b(r5, 'easy', 'EASY', 'P', () => h.pro(), 'sm');

    // ---- bottom right, easy flying: one line saying what to do, big goal buttons, a few essentials
    const ez = el('div', 'fx-panel fx-easy', this.root);
    this.ezGuide = el('div', 'fx-ez-guide', ez, '');
    this.ezActs = el('div', 'fx-ez-acts', ez);
    const er = el('div', 'fx-ez-row', ez);
    const eb = (k: string, t: string, key: string, fn: () => void, cls = '') => {
      const x = el('button', 'fx-btn ' + cls, er) as HTMLButtonElement;
      x.type = 'button';
      el('span', 'l', x, t);
      el('span', 'kk', x, key);
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
        x.blur();
      });
      this.ezBtn[k] = x;
      return x;
    };
    eb('abort', 'ABORT · SAVE THE CREW', 'B ×2', () => h.abort(), 'red');
    eb('ff', 'FAST FORWARD', 'F', () => h.ff(), 'wide ff');
    this.ezWarp = el('span', 'fx-ez-warp', this.ezBtn.ff, '');
    eb('map', 'MAP', 'M', () => h.map());
    eb('cam', 'CAMERA', 'C', () => h.camera());
    eb('help', '?', 'H', () => h.help(), 'sm');
    eb('pause', 'II', 'ESC', () => h.pause(), 'sm');
    eb('pro', 'PRO', 'P', () => h.pro(), 'sm');
    this.hint = el('div', 'fx-hint', this.root, '');

    this.flashEl = el('div', 'fx-flash', this.root);
    this.labels = el('div', 'fx-labels', this.root);
    this.mapCanvas = el('canvas', 'fx-mapc', this.labels) as HTMLCanvasElement;
    this.labelAp = el('div', 'fx-mlabel ap', this.labels, 'AP');
    this.labelPe = el('div', 'fx-mlabel pe', this.labels, 'PE');
    this.overlay = el('div', 'fx-overlay hidden', this.root);
    this.helpEl = el('div', 'fx-help hidden', this.root);
    this.buildHelp();
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
    if (v) {
      this.root.classList.remove('play');
      void this.root.offsetWidth;
      this.root.classList.add('play');
      this.logCount = -1;
      this.lastEvent = 0;
    }
  }

  flash(text: string, kind = ''): void {
    this.flashEl.textContent = text;
    this.flashEl.className = 'fx-flash on ' + kind;
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.flashEl.classList.remove('on'), 2600);
  }

  toggleHelp(v?: boolean): void {
    this.helpEl.classList.toggle('hidden', v === undefined ? !this.helpEl.classList.contains('hidden') : !v);
  }

  private buildHelp(): void {
    const hp = this.helpEl;
    el('div', 'fx-h', hp, 'FLYING THE SATURN V');
    const easy = el('div', 'fx-help-easy', hp);
    const easyRows: [string, string][] = [
      ['SPACE', 'Do the highlighted goal: LAUNCH, GO HOME…'],
      ['2 · 3', 'The other goal buttons'],
      ['F', 'Fast forward: skips the waiting and slows down by itself for every burn'],
      ['W A S D', 'Steer yourself (this switches the autopilot off)'],
      ['Mouse', 'Drag to look around, scroll to zoom'],
      ['M · C', 'Map of your orbit · change camera'],
      ['B B', 'ABORT during the climb: the escape tower saves the crew'],
      ['P', 'Pro controls: every switch of the real rocket'],
      ['ESC', 'Pause'],
    ];
    for (const [k, t] of easyRows) {
      const r = el('div', 'fx-help-r', easy);
      el('span', 'k', r, k);
      el('span', 't', r, t);
    }
    el('div', 'fx-note', easy, 'Press LAUNCH and the autopilot flies you to orbit. Once you are up there, pick GO HOME to come back down by parachute, GO HIGHER for a bigger orbit, or LEAVE EARTH to break free. The line above the buttons always tells you what is happening.');
    const pro = el('div', 'fx-help-pro', hp);
    const rows: [string, string][] = [
      ['SPACE', 'Resume the count on the pad · stage in flight'],
      ['W S · A D · Q E', 'Pitch · yaw · roll (turns off IU guidance)'],
      ['G', 'IU guidance on/off: the Instrument Unit flies the real ascent to a 185 km orbit'],
      ['Z / X', 'Ignite the S-IVB (restartable J-2) / engine cutoff'],
      ['1 – 8, 0', 'Attitude: stabilise, hold, prograde, retrograde, normal, anti-normal, radial out, radial in, free'],
      [', / .', 'Time warp down / up (4× at most under power or in the air)'],
      ['M', 'Map view: your orbit, apoapsis and periapsis'],
      ['C', 'Camera: chase, tracking, onboard'],
      ['B B', 'ABORT: the escape tower pulls the command module clear (while the tower is on)'],
      ['J J', 'CM SEP: separate the command module for re-entry'],
      ['Mouse', 'Drag to look around, scroll to zoom'],
      ['ESC', 'Pause'],
    ];
    for (const [k, t] of rows) {
      const r = el('div', 'fx-help-r', pro);
      el('span', 'k', r, k);
      el('span', 't', r, t);
    }
    el(
      'div',
      'fx-note',
      pro,
      'Coming home: from orbit, point retrograde (4), burn the S-IVB until the periapsis is about 40 km, then separate the command module. Its heat shield and parachutes bring the crew down. Without separating, the vehicle burns up on re-entry.',
    );
    const close = el('button', 'fx-btn wide', hp) as HTMLButtonElement;
    el('span', 'l', close, 'CLOSE');
    close.addEventListener('click', () => this.toggleHelp(false));
  }

  /** a modal card: pause menu or the end of a flight */
  card(title: string, sub: string, kind: string, stats: [string, string][], buttons: [string, () => void, string?][]): void {
    clearEl(this.overlay);
    this.overlay.classList.toggle('hidden', !title);
    if (!title) return;
    const c = el('div', 'fx-card ' + kind, this.overlay);
    el('div', 'fx-card-t', c, title);
    if (sub) el('div', 'fx-card-s', c, sub);
    if (stats.length) {
      const g = el('div', 'fx-card-g', c);
      for (const [k, v] of stats) {
        const x = el('div', 'fx-card-c', g);
        el('div', 'v', x, v);
        el('div', 'k', x, k);
      }
    }
    const bs = el('div', 'fx-card-b', c);
    for (const [t, fn, cls] of buttons) {
      const x = el('button', 'fx-btn wide ' + (cls ?? ''), bs) as HTMLButtonElement;
      el('span', 'l', x, t);
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
    }
  }
  get cardOpen(): boolean {
    return !this.overlay.classList.contains('hidden');
  }

  setHint(t: string): void {
    this.hint.textContent = t;
    this.hint.classList.toggle('on', !!t);
  }

  // ------------------------------------------------------------------ per frame
  update(sim: FlightSim, info: FlightInfo): void {
    const status = sim.status();
    const o = sim.orbit;
    const R = EARTH.R;
    // the clock and the state
    this.clock.textContent = fmtT(sim.met);
    const [txt, cls] = STATUS_TEXT[status];
    let label = txt;
    if (status === 'landed' && sim.outcome) label = sim.outcome.title.toUpperCase();
    if (sim.isCm && sim.chute === 'main' && status === 'falling') label = 'UNDER PARACHUTES';
    this.badge.textContent = label;
    this.badge.className = 'fx-badge ' + cls;
    this.badgeSub.textContent = this.subStatus(sim, status);
    const lit = status === 'orbit' ? 'orbit' : status === 'safe' || status === 'landed' ? 'safe' : status === 'falling' || status === 'lost' ? 'falling' : '';
    for (const k of ['orbit', 'falling', 'safe'] as const) this.lamps[k].classList.toggle('on', lit === k);

    // the vehicle
    for (const [p, e] of this.stackParts) {
      e.classList.toggle('gone', !sim.attached.has(p));
      e.classList.toggle('active', sim.stage === p);
    }
    const stageLbl = sim.stage ? `${PARTS[sim.stage].name} · ${ENGINES[sim.stage].at.length} × ${ENGINES[sim.stage].kind}` : sim.isCm ? 'COMMAND MODULE' : sim.attached.has('les') ? 'ESCAPE TOWER' : '—';
    this.stageName.textContent = stageLbl;
    if (this.engRow.childElementCount !== sim.engines.length) {
      clearEl(this.engRow);
      const E = sim.stage ? ENGINES[sim.stage] : null;
      sim.engines.forEach((_, i) => {
        const d = el('i', '', this.engRow);
        if (E) {
          const [x, z] = E.at[i];
          d.style.left = `${50 + (x / 4.2) * 32}%`;
          d.style.top = `${50 + (z / 4.2) * 32}%`;
        } else {
          d.style.left = '50%';
          d.style.top = '50%';
        }
      });
    }
    sim.engines.forEach((e, i) => {
      const d = this.engRow.children[i] as HTMLElement;
      if (d) d.className = e.level > 0.9 ? 'on' : e.level > 0.05 ? 'spool' : e.on ? 'spool' : '';
    });
    const st = sim.stage;
    const frac = st ? sim.prop[st] / PARTS[st].prop : 0;
    this.propBar.style.width = `${(frac * 100).toFixed(1)}%`;
    this.propBar.className = frac < 0.1 ? 'low' : '';
    this.propText.textContent = st ? `${(sim.prop[st] / 1000).toFixed(1)} t · ${(frac * 100).toFixed(0)}%` : '';
    const dv = sim.deltaV();
    const g = EARTH.GM / (len(sim.r) ** 2);
    this.vehRows.mass.textContent = `${(sim.mass / 1000).toFixed(1)} t`;
    this.vehRows.twr.textContent = sim.thrust > 0 ? (sim.thrust / (sim.mass * g)).toFixed(2) : '0.00';
    this.vehRows.dv.textContent = `${dv.stage.toFixed(0)} · ${dv.total.toFixed(0)} m/s`;
    this.vehRows.burn.textContent = st ? mmss(dv.burn) : '—';
    this.vehRows.ctl.textContent = sim.guidance ? 'IU GUIDANCE' : sim.sas === 'off' ? 'FREE' : `SAS ${sim.sas.toUpperCase()}`;
    this.vehRows.restart.textContent = sim.attached.has('sivb') ? (sim.unlimitedRestarts ? '∞' : String(sim.sivbStarts)) : '—';

    // the orbit
    const closed = o.e < 1;
    this.orbRows.ap.textContent = closed ? km(o.ra - R) : '∞ (escape)';
    this.orbRows.pe.textContent = km(o.rp - R);
    this.orbRows.pe.className = 'v ' + (o.rp < R ? 'bad' : o.rp < R + EARTH.atmosphereTop ? 'warn' : 'good');
    this.orbRows.tap.textContent = closed ? mmss(o.tAp) : '—';
    this.orbRows.tpe.textContent = mmss(o.tPe);
    this.orbRows.inc.textContent = `${((o.i * 180) / Math.PI).toFixed(2)}°`;
    this.orbRows.per.textContent = Number.isFinite(o.period) ? mmss(o.period) : '—';
    this.orbRows.ecc.textContent = o.e.toFixed(4);
    const ecef = rotY(sim.r, -earthAngle(sim.time));
    const lat = (Math.asin(ecef[1] / len(ecef)) * 180) / Math.PI, lon = (Math.atan2(-ecef[2], ecef[0]) * 180) / Math.PI;
    this.orbRows.ground.textContent = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'} · ${sim.overSea() ? 'SEA' : 'LAND'}`;
    this.drawOrbit(sim);

    // tapes
    this.tapeL.alt.textContent = sim.alt < 100_000 ? `${(sim.alt / 1000).toFixed(2)} km` : km(sim.alt);
    this.tapeL.vv.textContent = `${sim.vVert >= 0 ? '+' : ''}${sim.vVert.toFixed(0)} m/s`;
    this.tapeL.g.textContent = `${sim.gLoad.toFixed(2)} g`;
    this.tapeR.v.textContent = `${len(sim.v).toFixed(0)} m/s`;
    this.tapeR.vs.textContent = `${len(sim.vSurf).toFixed(0)} m/s`;
    this.tapeR.mach.textContent = sim.alt < 90_000 ? sim.mach.toFixed(2) : '—';
    const qk = sim.qDyn / 1000;
    this.qBar.style.width = `${Math.min(100, (qk / 40) * 100)}%`;
    this.qText.textContent = `${qk.toFixed(1)} kPa${sim.stats.maxQ > 15000 && !sim.held ? ` · max ${(sim.stats.maxQ / 1000).toFixed(1)}` : ''}`;
    const qa = sim.qAlpha / 170_000;
    this.qaBar.style.width = `${Math.min(100, qa * 100)}%`;
    this.qaBar.className = qa > 0.75 ? 'bad' : qa > 0.45 ? 'warn' : '';
    this.qaText.textContent = `${(sim.qAlpha / 1000).toFixed(0)} / 170 kPa·°`;

    this.drawBall(sim);

    // easy flying
    this.root.classList.toggle('easy', !!info.easy);
    if (info.easy) this.updateEasy(info.easy, info);

    // controls
    this.btn.guid.classList.toggle('on', sim.guidance);
    this.btn.auto.classList.toggle('on', sim.autoStage);
    for (const [m, x] of this.sasBtns) x.classList.toggle('on', !sim.guidance && sim.sas === m);
    this.btn.abort.disabled = !sim.canAbort;
    this.btn.cmsep.disabled = !sim.canCmSep;
    this.btn.ignite.disabled = !(sim.stage === 'sivb' && !sim.engines[0]?.on && sim.sivbStarts > 0) && !sim.held;
    this.btn.cutoff.disabled = !sim.engines.some((e) => e.on);
    this.btn.stage.querySelector('.l')!.textContent = sim.held ? (sim.counting ? 'COUNTING' : 'START COUNT') : 'STAGE';
    this.warpText.textContent = `${info.warp}×${info.warp >= info.warpMax ? ' MAX' : ''}`;
    this.btn.map.classList.toggle('on', info.map);
    this.btn.cam.querySelector('.l')!.textContent = info.camMode;

    // the log
    if (sim.events.length !== this.logCount) {
      this.logCount = sim.events.length;
      clearEl(this.log);
      for (const e of sim.events.slice(-7)) {
        const r = el('div', 'fx-ev ' + e.kind, this.log);
        el('span', 't', r, fmtT(e.t));
        el('span', 'x', r, e.text);
      }
      const last = sim.events[sim.events.length - 1];
      if (last && sim.events.length > this.lastEvent) {
        this.lastEvent = sim.events.length;
        if (last.kind !== 'info') this.flash(last.text.split(/[.:]/)[0].toUpperCase(), last.kind);
      }
    }
  }

  private updateEasy(ez: EasyView, info: FlightInfo): void {
    this.ezGuide.textContent = ez.guide;
    this.ezGuide.style.display = ez.guide ? '' : 'none';
    // rebuild the goal buttons only when they change, so a click is never lost
    const sig = ez.actions.map((a) => `${a.id}|${a.label}|${a.sub}|${a.enabled}`).join('#');
    if (sig !== this.ezSig) {
      this.ezSig = sig;
      clearEl(this.ezActs);
      ez.actions.forEach((a, i) => {
        const x = el('button', `fx-ez-act${i === 0 ? ' primary' : ''}${a.kind ? ' ' + a.kind : ''}`, this.ezActs) as HTMLButtonElement;
        x.type = 'button';
        x.disabled = !a.enabled;
        const top = el('div', 'fx-ez-top', x);
        el('span', 'l', top, a.label);
        el('span', 'kk', top, i === 0 ? 'SPACE' : String(i + 1));
        el('span', 's', x, a.sub);
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          this.h.action(i);
          x.blur();
        });
      });
    }
    this.ezActs.style.display = ez.actions.length ? '' : 'none';
    this.ezBtn.ff.classList.toggle('on', ez.ff);
    this.ezWarp.textContent = ez.ff || info.warp > 1 ? `${info.warp}×` : '';
    this.ezBtn.map.classList.toggle('on', info.map);
    this.ezBtn.cam.querySelector('.l')!.textContent = info.camMode === 'MAP' ? 'CAMERA' : info.camMode;
    this.ezBtn.abort.style.display = ez.abort ? '' : 'none';
  }

  private subStatus(sim: FlightSim, s: Status): string {
    const o = sim.orbit;
    const R = EARTH.R;
    switch (s) {
      case 'pad':
        return sim.counting ? (sim.met < -8.9 ? 'Count running' : 'Ignition: thrust building on the hold-down arms') : 'Count holding · press SPACE to resume';
      case 'ascent':
        return `Engines burning · periapsis ${km(o.rp - R)}`;
      case 'suborbital': {
        const t = sim.timeToImpact();
        return `Coasting up · apoapsis ${km(o.ra - R)} · then falls back${Number.isFinite(t) ? ` in ${mmss(t)}` : ''}`;
      }
      case 'falling': {
        if (sim.isCm && sim.chute === 'main') return `Main chutes · ${len(sim.vSurf).toFixed(1)} m/s · ${sim.overSea() ? 'over the sea' : 'over land'}`;
        if (sim.isCm && sim.chute === 'drogue') return 'Drogue chutes · slowing for the mains';
        const te = sim.timeToEntry();
        if (Number.isFinite(te)) return `Entry interface in ${mmss(te)}`;
        if (sim.heat > 3e6) return `Re-entry: ${(sim.gLoad).toFixed(1)} g, plasma round the ${sim.isCm ? 'heat shield' : 'vehicle'}`;
        const t = sim.timeToImpact();
        return Number.isFinite(t) ? `Impact in ${mmss(t)} unless you act` : 'Descending';
      }
      case 'orbit':
        return `Stable · ${km(o.rp - R)} × ${km(o.ra - R)} · ${mmss(o.period)} per orbit`;
      case 'safe':
        return len(sim.r) > EARTH.soi ? 'Floating free beyond Earth’s pull' : `Escape trajectory · ${(len(sim.v) / 1000).toFixed(2)} km/s · drifting free of Earth`;
      case 'landed':
        return sim.outcome?.text ?? '';
      case 'lost':
        return sim.outcome?.text ?? '';
    }
  }

  // the orbit drawn in its own plane, with the Earth and its atmosphere
  private drawOrbit(sim: FlightSim): void {
    const c = this.orbCanvas, g = c.getContext('2d')!;
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const o = sim.orbit;
    const R = EARTH.R;
    const P = o.P, Q = cross(o.W, o.P);
    const pts: [number, number][] = [];
    let maxR = R * 1.25;
    if (o.e < 1) {
      for (let i = 0; i <= 180; i++) {
        const p = orbitPoint(o, (i / 180) * Math.PI * 2);
        pts.push([dot(p, P), dot(p, Q)]);
        maxR = Math.max(maxR, Math.abs(dot(p, P)) * 1.05, Math.abs(dot(p, Q)) * 1.1);
      }
    } else {
      const lim = Math.acos(-1 / o.e) * 0.95;
      for (let i = 0; i <= 120; i++) {
        const p = orbitPoint(o, -lim + (2 * lim * i) / 120);
        if (len(p) < 6 * R) pts.push([dot(p, P), dot(p, Q)]);
      }
      maxR = R * 6;
    }
    const s = Math.min(W / 2, H / 2) / maxR * 0.95;
    const cx = W / 2 + (o.e < 1 ? (o.a * o.e) * s * 0.5 : 0), cy = H / 2;
    // atmosphere and Earth
    g.fillStyle = 'rgba(80,150,255,0.12)';
    g.beginPath();
    g.arc(cx, cy, (R + EARTH.atmosphereTop) * s, 0, Math.PI * 2);
    g.fill();
    const gr = g.createRadialGradient(cx - R * s * 0.3, cy - R * s * 0.3, 0, cx, cy, R * s);
    gr.addColorStop(0, '#2c6aa8');
    gr.addColorStop(1, '#0c2440');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, R * s, 0, Math.PI * 2);
    g.fill();
    // the orbit
    g.lineWidth = 2;
    g.strokeStyle = o.e >= 1 ? '#6fb8ff' : o.rp > R + EARTH.atmosphereTop ? '#4fe08a' : '#ffb347';
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x * s, cy - y * s) : g.moveTo(cx + x * s, cy - y * s)));
    g.stroke();
    // apsides and the vehicle
    const mark = (p: V3, col: string, label: string) => {
      const x = cx + dot(p, P) * s, y = cy - dot(p, Q) * s;
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
      g.font = '11px Consolas, monospace';
      g.fillText(label, x + 6, y - 6);
    };
    if (o.e < 1) {
      mark(orbitPoint(o, Math.PI), '#9fd0ff', 'AP');
      mark(orbitPoint(o, 0), '#9fd0ff', 'PE');
    }
    const x = cx + dot(sim.r, P) * s, y = cy - dot(sim.r, Q) * s;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, y, 2.5, 0, Math.PI * 2);
    g.fill();
  }

  // the attitude ball: the sky and ground as seen along the nose
  private drawBall(sim: FlightSim): void {
    const c = this.ball;
    const W = c.width;
    const g = c.getContext('2d')!;
    if (!this.ballImg) this.ballImg = g.createImageData(W, W);
    const img = this.ballImg;
    const q = sim.q;
    const F = qrot(q, [0, 1, 0]), U = qrot(q, [0, 0, 1]), Rt = scale(qrot(q, [1, 0, 0]), -1);
    const up = sim.up;
    const ang = earthAngle(sim.time);
    const e0 = enu(PAD.lat, PAD.lon);
    void e0;
    const north0 = norm(sub([0, 1, 0], scale(up, up[1])));
    const north = len(north0) > 1e-6 ? north0 : rotY([1, 0, 0], ang);
    const east = norm(cross(north, up));
    const r = W / 2 - 2;
    const d = img.data;
    for (let py = 0; py < W; py++) {
      for (let px = 0; px < W; px++) {
        const x = (px - W / 2) / r, y = -(py - W / 2) / r;
        const rr = x * x + y * y;
        const o = (py * W + px) * 4;
        if (rr > 1) {
          d[o + 3] = 0;
          continue;
        }
        const z = Math.sqrt(1 - rr);
        const dx = x * Rt[0] + y * U[0] + z * F[0], dy = x * Rt[1] + y * U[1] + z * F[1], dz = x * Rt[2] + y * U[2] + z * F[2];
        const el = dx * up[0] + dy * up[1] + dz * up[2];
        const nn = dx * north[0] + dy * north[1] + dz * north[2];
        const ee = dx * east[0] + dy * east[1] + dz * east[2];
        const elev = Math.asin(Math.max(-1, Math.min(1, el))) * 57.2958;
        const az = Math.atan2(ee, nn) * 57.2958;
        let cr: number, cg: number, cb: number;
        if (el >= 0) {
          cr = 40 + el * 30;
          cg = 110 + el * 50;
          cb = 190 + el * 40;
        } else {
          cr = 120 + el * 30;
          cg = 82 + el * 20;
          cb = 52;
        }
        const lineEl = Math.abs(elev / 10 - Math.round(elev / 10)) * 10;
        const lineAz = Math.abs(az / 30 - Math.round(az / 30)) * 30 * Math.cos(el);
        if (Math.abs(elev) < 0.9) cr = cg = cb = 245;
        else if (lineEl < 0.35 || (lineAz < 0.6 && Math.abs(elev) < 80)) {
          cr = cr * 0.55 + 110;
          cg = cg * 0.55 + 110;
          cb = cb * 0.55 + 110;
        }
        const shade = 0.55 + 0.45 * z;
        d[o] = cr * shade;
        d[o + 1] = cg * shade;
        d[o + 2] = cb * shade;
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // markers
    const proj = (v: V3): [number, number, number] => [dot(v, Rt), dot(v, U), dot(v, F)];
    const draw = (v: V3, col: string, kind: 'pro' | 'retro' | 'normal' | 'anti' | 'rad' | 'radin') => {
      const [x, y, z] = proj(norm(v));
      if (z < 0) return;
      const sx = W / 2 + x * r, sy = W / 2 - y * r;
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(sx, sy, 9, 0, Math.PI * 2);
      g.stroke();
      if (kind === 'pro') {
        g.beginPath();
        g.arc(sx, sy, 2.5, 0, Math.PI * 2);
        g.fill();
        for (const [ax, ay] of [[0, -1], [-1, 0], [1, 0]]) {
          g.beginPath();
          g.moveTo(sx + ax * 9, sy + ay * 9);
          g.lineTo(sx + ax * 15, sy + ay * 15);
          g.stroke();
        }
      } else if (kind === 'retro') {
        g.beginPath();
        g.moveTo(sx - 6, sy - 6);
        g.lineTo(sx + 6, sy + 6);
        g.moveTo(sx + 6, sy - 6);
        g.lineTo(sx - 6, sy + 6);
        g.stroke();
      } else {
        g.font = 'bold 10px Consolas, monospace';
        g.textAlign = 'center';
        g.fillText(kind === 'normal' ? 'N' : kind === 'anti' ? 'A' : kind === 'rad' ? 'R+' : 'R-', sx, sy + 3.5);
      }
    };
    const vref = sim.alt < 70_000 ? sim.vSurf : sim.v;
    if (len(vref) > 2) {
      draw(vref, '#e8ff5a', 'pro');
      draw(scale(vref, -1), '#e8ff5a', 'retro');
    }
    const h = cross(sim.r, sim.v);
    if (len(h) > 1) {
      draw(h, '#d58bff', 'normal');
      draw(scale(h, -1), '#d58bff', 'anti');
    }
    draw(up, '#6fe3ff', 'rad');
    draw(scale(up, -1), '#6fe3ff', 'radin');
    // the vehicle symbol, fixed in the centre
    g.strokeStyle = '#ffa53a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(W / 2 - 34, W / 2);
    g.lineTo(W / 2 - 12, W / 2);
    g.lineTo(W / 2 - 6, W / 2 + 8);
    g.lineTo(W / 2, W / 2);
    g.lineTo(W / 2 + 6, W / 2 + 8);
    g.lineTo(W / 2 + 12, W / 2);
    g.lineTo(W / 2 + 34, W / 2);
    g.stroke();
    // readouts: where the nose points
    const fe = dot(F, up), fn = dot(F, north), fE = dot(F, east);
    const pitch = (Math.asin(Math.max(-1, Math.min(1, fe))) * 180) / Math.PI;
    let hdg = (Math.atan2(fE, fn) * 180) / Math.PI;
    if (hdg < 0) hdg += 360;
    this.ballRead.textContent = `PITCH ${pitch.toFixed(1)}°  ·  HDG ${hdg.toFixed(0).padStart(3, '0')}°  ·  AoA ${((sim.alpha * 180) / Math.PI).toFixed(1)}°`;
  }
}
