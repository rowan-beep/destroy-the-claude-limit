// Flying the Saturn V. This ties the simulation to the screen: it runs the
// flight with time warp, draws it in the launch-site scene while the vehicle
// is low over the pad and on the full-scale globe above that, moves the cast-
// off stages, plumes, parachutes and re-entry glow, drives the cameras
// (chase, tracking, onboard and the map), reads the keys, plays the roar and
// shows the pause and end-of-flight cards.

import { SUITS, saveSuit } from './suits';
import * as THREE from 'three';
import { Debris, FlightSim, PartId, PART_ORDER, Q, SasMode, SpawnMode, DOCK_C, qrot, sunDirection } from './flightSim';
import { EARTH, MOON, V3, add, air, cross, dot, earthAngle, ecefDir, len, moonPos, norm, orbitPoint, padScene, rotY, scale, sub, toEcef, PAD } from './universe';
import { coast } from './lunarPlan';
import { Moonwalk } from './moonwalk';
import { SpaceScene, orbitTrack } from './spaceScene';
import { Plumes } from './plumes';
import { FlightUI } from './flightUI';
import { buildSaturnV, saturnParts, setLmLegs } from './saturnVModel';
import { updateRecord } from './record';
import { Autopilot } from './autopilot';
import { menuMusic } from '../audio/menuMusic';
import { audio } from '../audio/audio';
import type { LaunchSite } from '../ui/menu/launchSite';

/** the time-warp speeds you can pick; fast forward (AUTO) goes as high as 10,000× on long coasts */
export const WARPS = [1, 2, 10, 100, 500];
type CamMode = 'CHASE' | 'TRACKING' | 'ONBOARD';
const ROCKET_BASE = 24.5;
const PRO_KEY = 'triad.space.pro';
const loadPro = (): boolean => {
  try {
    return localStorage.getItem(PRO_KEY) === '1';
  } catch {
    return false;
  }
};

/** a fireball: sprites that swell and fade */
interface Burst {
  group: THREE.Group;
  sprites: { sp: THREE.Sprite; v: THREE.Vector3; s0: number }[];
  age: number;
}

class RocketSound {
  private gain: GainNode | null = null;
  private low: BiquadFilterNode | null = null;
  private crackG: GainNode | null = null;
  private src: AudioBufferSourceNode[] = [];
  start(): void {
    audio.init();
    const ctx = audio.ctx as AudioContext | null;
    if (!ctx || this.gain) return;
    const n = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b = 0;
      for (let i = 0; i < n; i++) {
        b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = b * 3.5;
      }
    }
    const crack = ctx.createBuffer(1, n, ctx.sampleRate);
    const cd = crack.getChannelData(0);
    for (let i = 0; i < n; i++) cd[i] = Math.random() < 0.002 ? (Math.random() * 2 - 1) : (Math.random() * 2 - 1) * 0.08;
    const mk = (b: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.start();
      this.src.push(s);
      return s;
    };
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowpass';
    this.low.frequency.value = 400;
    mk(buf).connect(this.low).connect(this.gain).connect(ctx.destination);
    this.crackG = ctx.createGain();
    this.crackG.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 900;
    mk(crack).connect(hp).connect(this.crackG).connect(ctx.destination);
  }
  update(level: number, density: number, near: number): void {
    const ctx = audio.ctx;
    if (!ctx || !this.gain || !this.low || !this.crackG) return;
    const lv = audio.levels.master * audio.levels.engine;
    const air = Math.sqrt(Math.min(1, density / 1.225));
    const g = level * (0.12 + 0.88 * air) * lv * (0.35 + 0.65 * near);
    this.gain.gain.setTargetAtTime(g * 0.9, ctx.currentTime, 0.08);
    this.low.frequency.setTargetAtTime(160 + 900 * air * near, ctx.currentTime, 0.1);
    this.crackG.gain.setTargetAtTime(level * air * near * lv * 0.6, ctx.currentTime, 0.08);
  }
  stop(): void {
    for (const s of this.src) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.src = [];
    this.gain?.disconnect();
    this.crackG?.disconnect();
    this.gain = this.low = this.crackG = null;
  }
}

export class SpaceFlight {
  active = false;
  sim: FlightSim | null = null;
  drawWith: ((scene: THREE.Scene, camera: THREE.Camera) => void) | null = null;
  onExit: (() => void) | null = null;
  private spawnMode: SpawnMode = 'pad';
  /** transposition, docking and extraction, animated: seconds into it */
  private tde = -1;
  private legsK = 0;
  private flagT = -1;
  private flag: THREE.Group | null = null;
  private dust: THREE.Sprite[] = [];
  /** the moonwalk, after touchdown: the player takes the astronaut out */
  private walk: Moonwalk | null = null;
  private walkAt = -1;
  private walkJump = false;
  private walkUse = false;
  private dustT = 0;
  private space: SpaceScene | null = null;
  private rocket: THREE.Group | null = null;
  private parts: Record<PartId, THREE.Group> | null = null;
  private holder = new THREE.Group();
  private plumes = new Plumes();
  private debrisObjs = new Map<Debris, THREE.Group>();
  private ui: FlightUI;
  private warpI = 0;
  private camMode: CamMode = 'CHASE';
  private map = false;
  private camYaw = -1.25;
  private camPitch = 0.12;
  private camDist = 300;
  private mapYaw = 0;
  private mapPitch = 0.5;
  private mapDist = 0;
  private keys = new Set<string>();
  private local = true;
  private localCam = new THREE.PerspectiveCamera(50, 1, 0.5, 140_000);
  private padLight = new THREE.PointLight(0xff9a40, 0, 0, 2);
  private chutes = new THREE.Group();
  private drogues: THREE.Object3D[] = [];
  private mains: THREE.Object3D[] = [];
  private plasma: THREE.Sprite[] = [];
  private bursts: Burst[] = [];
  private burstTex: THREE.Texture | null = null;
  private armedAbort = 0;
  private armedSep = 0;
  private endAt = 0;
  private endShown = false;
  private paused = false;
  private sound = new RocketSound();
  private liftoffCounted = false;
  private orbitTime = 0;
  private drag: { id: number; x: number; y: number } | null = null;
  private fade = 0;
  private fadeEl: HTMLElement;
  private site: LaunchSite | null = null;
  private lastStatus = '';
  /** easy flying: goal buttons and an autopilot instead of the full panel */
  private easy = !loadPro();
  private ap = new Autopilot();
  /** fast forward: time warp chosen automatically, dropping back for every burn and event */
  private ff = false;

  constructor(
    private getSite: () => LaunchSite,
    parent: HTMLElement,
  ) {
    this.ui = new FlightUI(parent, {
      stage: () => this.sim?.stageNext(),
      ignite: () => this.sim?.ignite(),
      cutoff: () => this.sim?.cutoff(),
      guidance: () => this.sim && this.sim.setGuidance(!this.sim.guidance),
      autoStage: () => {
        if (!this.sim) return;
        this.sim.autoStage = !this.sim.autoStage;
        this.sim.log(this.sim.autoStage ? 'Auto-staging on: each stage drops as soon as it burns out.' : 'Auto-staging off: press SPACE to stage.', 'info');
      },
      sas: (m) => this.sim?.setSas(m),
      warp: (d) => this.setWarp(this.warpI + d),
      pickWarp: (i) => this.setWarp(i),
      map: () => this.toggleMap(),
      camera: () => this.cycleCamera(),
      abort: () => this.guarded('abort'),
      cmSep: () => this.guarded('sep'),
      pause: () => this.setPaused(!this.paused),
      help: () => this.ui.toggleHelp(),
      action: (i) => this.doAction(i),
      ff: () => this.toggleFF(),
      pro: () => this.togglePro(),
    });
    this.fadeEl = document.createElement('div');
    this.fadeEl.style.cssText = 'position:fixed;inset:0;background:#cfe0f5;opacity:0;pointer-events:none;z-index:29;transition:none';
    parent.appendChild(this.fadeEl);
    this.holder.add(this.plumes.group);
    this.buildChutes();
    window.addEventListener('keydown', (e) => this.onKey(e, true), { capture: true });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { capture: true });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', (e) => {
      if (!this.active || this.ui.cardOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('.fx-panel, .fx-btn, .fx-help, .fx-card, button')) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (this.map) {
        this.mapYaw -= dx * 0.005;
        this.mapPitch = Math.max(-1.5, Math.min(1.5, this.mapPitch + dy * 0.005));
      } else {
        this.camYaw -= dx * 0.005;
        this.camPitch = Math.max(-1.4, Math.min(1.45, this.camPitch + dy * 0.004));
      }
    });
    const up = (e: PointerEvent) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        const t = e.target as HTMLElement | null;
        if (t && t.closest && t.closest('.fx-panel, .fx-help, .fx-card')) return;
        const k = Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0018);
        if (this.map) this.mapDist = Math.max((this.sim?.body.R ?? EARTH.R) * 1.15, Math.min(2.5e9, this.mapDist * k));
        else this.camDist = Math.max(12, Math.min(3e6, this.camDist * k));
      },
      { passive: true },
    );
  }

  // ------------------------------------------------------------------ lifecycle
  start(mode: SpawnMode): void {
    this.spawnMode = mode;
    this.site = this.getSite();
    if (!this.rocket) {
      this.rocket = buildSaturnV();
      this.parts = saturnParts(this.rocket);
      this.holder.add(this.rocket);
    }
    if (!this.space) this.space = new SpaceScene(sunDirection());
    this.clearDebris();
    for (const p of PART_ORDER) {
      const g = this.parts![p];
      g.position.set(0, 0, 0);
      g.quaternion.identity();
      g.scale.setScalar(1);
      g.visible = true;
      this.rocket!.add(g);
    }
    for (const pnl of this.slaPanels()) {
      pnl.position.copy(pnl.userData.home);
      pnl.quaternion.identity();
      pnl.visible = true;
    }
    this.tde = -1;
    this.flagT = -1;
    this.endWalk();
    if (this.flag) this.flag.visible = false;
    for (const b of this.bursts) b.group.parent?.remove(b.group);
    this.bursts = [];
    this.rocket!.visible = true;
    const sim = (this.sim = new FlightSim({ mode }));
    sim.unlimitedRestarts = this.easy;
    sim.stepHook = (h) => this.ap.onStep(sim, h);
    this.ap.reset();
    this.ap.lunar.viewer = true;
    this.legsK = sim.legsOut ? 1 : 0;
    this.ff = false;
    this.warpI = 0;
    this.map = false;
    this.camMode = 'CHASE';
    this.camYaw = mode === 'pad' ? -1.25 : 2.6;
    this.camPitch = mode === 'pad' ? 0.1 : 0.25;
    this.camDist = mode === 'pad' ? 300 : mode === 'lunar' ? 45 : 120;
    this.mapDist = 0;
    this.endShown = false;
    this.endAt = 0;
    this.paused = false;
    this.liftoffCounted = false;
    this.orbitTime = 0;
    this.lastStatus = '';
    this.stackLen = 0;
    this.local = mode === 'pad';
    this.site.setFlying(true);
    this.attachTo(this.local ? this.site.scene : this.space.scene);
    this.active = true;
    this.ui.card('', '', '', [], []);
    this.ui.show(true);
    this.ui.toggleHelp(false);
    this.sound.start();
    // the music carries on through the flight, looping seamlessly
    menuMusic.want('flight', true);
    if (mode === 'pad') this.ui.flash('SATURN V · PAD 1', '');
    else if (mode === 'orbit') this.ui.flash('PARKING ORBIT · 185 KM', 'good');
    else this.ui.flash('LUNAR ORBIT · 110 KM', 'good');
  }

  stop(): void {
    this.active = false;
    this.ui.show(false);
    this.sound.stop();
    menuMusic.want('flight', false);
    this.clearDebris();
    this.holder.parent?.remove(this.holder);
    this.padLight.parent?.remove(this.padLight);
    for (const p of this.plasma) p.parent?.remove(p);
    for (const b of this.bursts) b.group.parent?.remove(b.group);
    this.bursts = [];
    this.endWalk();
    this.site?.setFlying(false);
    this.fadeEl.style.opacity = '0';
    this.recordTime();
  }

  private exit(): void {
    this.stop();
    this.onExit?.();
  }

  private attachTo(scene: THREE.Scene): void {
    scene.add(this.holder);
    for (const g of this.debrisObjs.values()) scene.add(g);
    for (const b of this.bursts) scene.add(b.group);
    if (this.site && scene === this.site.scene) scene.add(this.padLight);
    else this.padLight.parent?.remove(this.padLight);
  }

  private clearDebris(): void {
    for (const g of this.debrisObjs.values()) g.parent?.remove(g);
    this.debrisObjs.clear();
  }

  private recordTime(): void {
    if (this.orbitTime > 0) {
      const days = this.orbitTime / 86400;
      updateRecord((r) => (r.daysInSpace += days));
      this.orbitTime = 0;
    }
  }

  // ------------------------------------------------------------------ input
  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.active) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
    const c = e.code;
    if (this.walk && this.walk.mode !== 'done' && !this.ui.cardOpen) {
      // on the Moon: the astronaut's keys
      if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) {
        e.preventDefault();
        if (down) this.keys.add(c);
        else this.keys.delete(c);
        return;
      }
      if (down && c === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        this.walkJump = true;
        return;
      }
      if (down && (c === 'KeyE' || c === 'KeyF')) {
        e.preventDefault();
        e.stopPropagation();
        this.walkUse = true;
        return;
      }
      if (down && c === 'KeyV' && this.walk) {
        e.preventDefault();
        e.stopPropagation();
        const i = SUITS.findIndex((x) => x.id === this.walk!.suit);
        const nx = SUITS[(i + 1) % SUITS.length];
        this.walk.setSuit(nx.id);
        saveSuit(nx.id);
        this.ui.flash(nx.name.toUpperCase(), 'good');
        return;
      }
    }
    const flightKeys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'];
    if (flightKeys.includes(c)) {
      e.preventDefault();
      if (down) this.keys.add(c);
      else this.keys.delete(c);
      return;
    }
    if (!down) return;
    const sim = this.sim;
    if (!sim) return;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (c === 'Escape') {
      handled();
      if (!this.ui.cardOpen || this.paused) this.setPaused(!this.paused);
      return;
    }
    if (this.ui.cardOpen) return;
    if (e.repeat && c !== 'Comma' && c !== 'Period') return handled();
    // easy flying: SPACE (or 1) does the highlighted goal, 2 and 3 the others
    const pick: Record<string, number> = { Space: 0, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
    if (this.easy && c in pick) {
      handled();
      this.doAction(pick[c]);
      return;
    }
    switch (c) {
      case 'KeyF':
        handled();
        this.toggleFF();
        break;
      case 'KeyP':
        handled();
        this.togglePro();
        break;
      case 'Space':
        handled();
        sim.stageNext();
        break;
      case 'KeyZ':
        handled();
        sim.ignite();
        break;
      case 'KeyX':
        handled();
        sim.cutoff();
        break;
      case 'KeyG':
        handled();
        sim.setGuidance(!sim.guidance);
        break;
      case 'KeyT':
        handled();
        sim.autoStage = !sim.autoStage;
        sim.log(sim.autoStage ? 'Auto-staging on.' : 'Auto-staging off: press SPACE to stage.', 'info');
        break;
      case 'KeyM':
        handled();
        this.toggleMap();
        break;
      case 'KeyC':
        handled();
        this.cycleCamera();
        break;
      case 'KeyH':
        handled();
        this.ui.toggleHelp();
        break;
      case 'KeyB':
        handled();
        this.guarded('abort');
        break;
      case 'KeyJ':
        handled();
        this.guarded('sep');
        break;
      case 'Comma':
        handled();
        this.ff = false;
        this.setWarp(this.warpI - 1);
        break;
      case 'Period':
        handled();
        this.ff = false;
        this.setWarp(this.warpI + 1);
        break;
      case 'Slash':
        handled();
        this.ff = false;
        this.setWarp(0);
        break;
      default: {
        const sas: Record<string, SasMode> = { Digit1: 'stab', Digit2: 'hold', Digit3: 'pro', Digit4: 'retro', Digit5: 'normal', Digit6: 'anti', Digit7: 'radOut', Digit8: 'radIn', Digit0: 'off' };
        if (sas[c]) {
          handled();
          sim.setSas(sas[c]);
        }
      }
    }
  }

  /** abort and CM separation need two presses within two seconds */
  private guarded(what: 'abort' | 'sep'): void {
    const sim = this.sim;
    if (!sim) return;
    const now = performance.now();
    if (what === 'abort') {
      if (!sim.canAbort) return this.ui.flash('ABORT NOT AVAILABLE', 'warn');
      if (now - this.armedAbort < 2000) {
        this.armedAbort = 0;
        this.ui.setHint('');
        sim.abort();
        this.setWarp(0);
      } else {
        this.armedAbort = now;
        this.ui.setHint('ABORT ARMED · press B again to fire the escape tower');
      }
    } else {
      if (!sim.canCmSep) return this.ui.flash('CM SEP NOT AVAILABLE', 'warn');
      if (now - this.armedSep < 2000) {
        this.armedSep = 0;
        this.ui.setHint('');
        sim.cmSep();
      } else {
        this.armedSep = now;
        this.ui.setHint('CM SEP ARMED · press J again to separate the command module');
      }
    }
  }

  /** the fastest the clock may run now */
  private warpCap(): number {
    const sim = this.sim;
    if (!sim) return 1;
    const powered = sim.thrust > 0 || sim.engines.some((e) => e.on || e.level > 0.01) || sim.lesBurn > 0;
    if (sim.outcome) return 10;
    if (sim.held) return 10;
    // low over Earth: the climb and the capsule's descent
    if (!sim.nearMoon && sim.alt < EARTH.atmosphereTop) return powered ? 10 : sim.isCm ? 50 : 10;
    return powered ? 100 : 10_000;
  }
  /** pick one of the warp speeds (and leave fast forward) */
  private setWarp(i: number): void {
    this.ff = false;
    this.warpI = Math.max(0, Math.min(WARPS.length - 1, i));
  }

  private toggleFF(): void {
    this.ff = !this.ff;
    if (!this.ff) this.warpI = 0;
  }

  private slaPanels(): THREE.Group[] {
    return (this.parts?.sla.userData.panels as THREE.Group[] | undefined) ?? [];
  }

  private togglePro(): void {
    this.easy = !this.easy;
    try {
      localStorage.setItem(PRO_KEY, this.easy ? '0' : '1');
    } catch {
      /* the choice lasts for this session */
    }
    if (this.sim) {
      if (this.easy) this.sim.unlimitedRestarts = true;
      else this.ap.stop(this.sim, 'Autopilot off: full manual controls.');
    }
    this.ui.flash(this.easy ? 'EASY CONTROLS' : 'PRO CONTROLS', '');
  }

  /** the n-th goal button on the easy panel */
  private doAction(n: number): void {
    const sim = this.sim;
    if (!sim) return;
    const a = this.ap.actions(sim)[n];
    if (!a || !a.enabled) return;
    this.ap.run(a.id, sim);
  }

  private toggleMap(): void {
    this.map = !this.map;
    if (this.map && this.sim) {
      const sim = this.sim;
      const o = sim.orb;
      const R = sim.body.R;
      this.mapDist = sim.status() === 'transit' && !sim.nearMoon ? 1.25e9 : Math.min(4e8, Math.max(R * 3.2, (Number.isFinite(o.ra) ? o.ra : len(sim.rel)) * 2.6));
      // look at the orbit from above its plane
      const n = o.W;
      this.mapYaw = Math.atan2(n[0], n[2]);
      this.mapPitch = Math.asin(Math.max(-1, Math.min(1, n[1]))) * 0.8;
    }
  }

  private cycleCamera(): void {
    const order: CamMode[] = ['CHASE', 'TRACKING', 'ONBOARD'];
    this.camMode = order[(order.indexOf(this.camMode) + 1) % order.length];
    if (this.map) this.map = false;
  }

  private setPaused(p: boolean): void {
    if (!this.sim) return;
    if (this.sim.outcome && this.endShown && !p) return;
    this.paused = p;
    if (p) {
      this.ui.card('PAUSED', 'The flight is frozen.', '', [], [
        ['RESUME', () => this.setPaused(false)],
        ['RESTART', () => this.restart(this.spawnMode)],
        ...this.otherSpawns(),
        ['EXIT TO MENU', () => this.exit(), 'red'],
      ]);
    } else this.ui.card('', '', '', [], []);
  }

  private otherSpawns(): [string, () => void][] {
    const names: Record<SpawnMode, string> = { pad: 'START ON THE PAD', orbit: 'START IN EARTH ORBIT', lunar: 'START IN LUNAR ORBIT' };
    return (['pad', 'orbit', 'lunar'] as SpawnMode[]).filter((m) => m !== this.spawnMode).map((m) => [names[m], () => this.restart(m)] as [string, () => void]);
  }

  private restart(mode: SpawnMode): void {
    this.recordTime();
    this.stop();
    this.start(mode);
  }

  // ------------------------------------------------------------------ frame
  frame(dtReal: number, w: number, h: number): void {
    const sim = this.sim;
    if (!sim || !this.space || !this.site) return;
    const dt = Number.isFinite(dtReal) ? Math.max(0, Math.min(0.1, dtReal)) : 0;
    // inputs
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    sim.input.pitch = k('KeyS') - k('KeyW');
    sim.input.yaw = k('KeyD') - k('KeyA');
    sim.input.roll = k('KeyE') - k('KeyQ');
    if (sim.isLm && !this.ap.busy) {
      // the descent engine's throttle, by hand
      if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) sim.throttle = Math.min(1, sim.throttle + dt * 0.5);
      if (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) sim.throttle = Math.max(0.1, sim.throttle - dt * 0.5);
    }
    // steering by hand takes over from the autopilot
    if (this.ap.busy && (sim.input.pitch || sim.input.yaw || sim.input.roll) && this.tde < 0) this.ap.stop(sim, 'Autopilot off: you are steering.');
    const cap = this.warpCap();
    let warp: number;
    if (this.ff) {
      // fast forward: as fast as it can go while still stopping in time for the next burn or event
      warp = Math.max(1, Math.min(cap, this.ap.wantWarp(sim)));
    } else {
      warp = Math.min(WARPS[this.warpI], cap);
      // a program in the middle of something precise keeps the clock in check
      if (this.ap.busy) warp = Math.max(1, Math.min(warp, this.ap.wantWarp(sim) * 2));
    }
    if (this.tde >= 0) warp = 1;
    if (!this.paused) {
      const before = sim.status();
      sim.advance(dt * warp);
      this.ap.update(sim, dt * warp);
      const st = sim.status();
      if (st === 'orbit' || st === 'safe') this.orbitTime += dt * warp;
      if (!this.liftoffCounted && !sim.held && this.spawnMode === 'pad' && !sim.aborted) {
        this.liftoffCounted = true;
        updateRecord((r) => r.launches++);
      }
      if (before !== st) this.lastStatus = st;
      if (sim.outcome && !this.endAt) {
        const onMoon = sim.outcome.status === 'landed' && sim.nearMoon;
        this.endAt = performance.now() + (sim.outcome.status === 'lost' ? 3200 : onMoon ? 11000 : 2500);
        if (onMoon) {
          this.flagT = -1;
          this.walkAt = 0;
          this.endAt = Infinity;
          this.camDist = 30;
          this.camPitch = 0.16;
          // swing round to the sunlit side, a little off the Sun line so the shadows show
          const up = sim.up;
          let north = sub([0, 1, 0], scale(up, up[1]));
          north = len(north) > 1e-6 ? norm(north) : [1, 0, 0];
          const east = norm(cross(north, up));
          const sd = sunDirection();
          this.camYaw = Math.atan2(dot(sd, east), dot(sd, north)) + 0.75;
          this.ui.flash('THE EAGLE HAS LANDED', 'good');
        }
        this.setWarp(0);
        if (sim.outcome.status === 'lost') this.burst();
        else updateRecord((r) => r.missions++);
      }
    }
    if (this.endAt && !this.endShown && performance.now() > this.endAt) this.showEnd();

    // which scene: the launch site while low over the pad, the globe otherwise
    const lp = this.localPos(sim.r);
    const hd = Math.hypot(lp[0], lp[2]);
    const wantLocal = !this.map && hd < 60_000 && sim.alt < (this.local ? 17_000 : 13_000);
    if (wantLocal !== this.local) {
      this.local = wantLocal;
      this.attachTo(this.local ? this.site.scene : this.space.scene);
      if (!this.map) this.fade = 1;
    }
    this.fade = Math.max(0, this.fade - dt * 1.6);
    this.fadeEl.style.opacity = String(this.fade * 0.85);

    this.updateWalk(dt);
    this.fitChase();
    this.updateTde(dt);
    this.placeVehicle();
    this.updateLanding(dt);
    const at = air(sim.alt);
    this.plumes.update(sim, dt, at.p);
    this.updateChutes();
    this.updatePlasma();
    this.updateBursts(dt);
    this.sound.update(this.plumes.fireLevel + (sim.stage && sim.stage !== 'sic' ? sim.engines.reduce((s, e) => s + e.level, 0) * 0.08 : 0) + (sim.lesBurn > 0 ? 0.7 : 0), at.rho, this.camMode === 'ONBOARD' ? 1 : Math.min(1, 400 / Math.max(50, this.camDist)));

    if (this.local) this.renderLocal(dt, w, h);
    else this.renderSpace(w, h);
    this.ui.update(sim, {
      warp,
      warpMax: cap,
      warpI: this.warpI,
      camMode: this.map ? 'MAP' : this.camMode,
      map: this.map,
      easy: this.easy ? { guide: this.ap.guide(sim), actions: this.ap.actions(sim), ff: this.ff, abort: sim.canAbort && (!sim.held || sim.engines.some((e) => e.on)) } : null,
    });
    this.updateMapLabels(w, h);
  }

  private showEnd(): void {
    const sim = this.sim!;
    const o = sim.outcome!;
    this.endShown = true;
    if (this.walk) {
      const ws = this.walk.stats;
      const mm = (t: number) => `${Math.floor(t / 60)}m ${Math.floor(t % 60)}s`;
      this.ui.card('MISSION COMPLETE', `${o.text} The crew walked on the Moon${ws.flag ? ', planted the flag' : ''} and climbed back aboard the lunar module.`, 'good', [
        ['MOONWALK', mm(ws.time)],
        ['DISTANCE WALKED', `${ws.walked.toFixed(0)} m`],
        ['JUMPS', String(ws.jumps)],
        ['HIGHEST JUMP', `${ws.highest.toFixed(2)} m`],
        ['FLAG', ws.flag ? 'PLANTED' : 'NOT PLANTED'],
        ['MISSION TIME', `${(Math.max(0, sim.met) / 86400).toFixed(2)} days`],
      ], [
        ['FLY AGAIN', () => this.restart(this.spawnMode)],
        ...this.otherSpawns(),
        ['EXIT TO MENU', () => this.exit(), 'red'],
      ]);
      return;
    }
    const s = sim.stats;
    this.ui.card(o.title.toUpperCase(), o.text, o.status === 'lost' ? 'bad' : 'good', [
      ['MAX ALTITUDE', s.maxAlt > 1e5 ? `${(s.maxAlt / 1000).toFixed(0)} km` : `${(s.maxAlt / 1000).toFixed(1)} km`],
      ['MAX SPEED', `${s.maxV.toFixed(0)} m/s`],
      ['MAX G', `${s.maxG.toFixed(2)} g`],
      ['MAX Q', `${(s.maxQ / 1000).toFixed(1)} kPa`],
      ['FLIGHT TIME', (() => {
        const t = Math.max(0, sim.met);
        return `${Math.floor(t / 60)}m ${Math.floor(t % 60)}s`;
      })()],
      ['TIME IN SPACE', `${(this.orbitTime / 60).toFixed(1)} min`],
    ], [
      ['FLY AGAIN', () => this.restart(this.spawnMode)],
      ...this.otherSpawns(),
      ['EXIT TO MENU', () => this.exit(), 'red'],
    ]);
  }

  // ------------------------------------------------------------------ placement
  private padOrigin = scale(ecefDir(PAD.lat, PAD.lon), EARTH.R);
  private axes = padScene();
  /** a point (ECI) in the launch-site scene's coordinates */
  private localPos(r: V3): V3 {
    const e = sub(toEcef(r, this.sim!.time), this.padOrigin);
    return [dot(e, this.axes.x), dot(e, this.axes.y), dot(e, this.axes.z)];
  }
  private localDir(v: V3): V3 {
    const e = rotY(v, -earthAngle(this.sim!.time));
    return [dot(e, this.axes.x), dot(e, this.axes.y), dot(e, this.axes.z)];
  }
  private quatFor(q: Q): THREE.Quaternion {
    if (!this.local) return new THREE.Quaternion(q[1], q[2], q[3], q[0]);
    const bx = this.localDir(qrot(q, [1, 0, 0])), by = this.localDir(qrot(q, [0, 1, 0])), bz = this.localDir(qrot(q, [0, 0, 1]));
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...bx), new THREE.Vector3(...by), new THREE.Vector3(...bz));
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }
  /** where a point (ECI) goes in the scene being drawn */
  private scenePos(r: V3): THREE.Vector3 {
    if (this.local) return new THREE.Vector3(...this.localPos(r));
    const o = this.sim!.r;
    return new THREE.Vector3(r[0] - o[0], r[1] - o[1], r[2] - o[2]);
  }

  private placeVehicle(): void {
    const sim = this.sim!;
    const parts = this.parts!;
    // the vehicle's model origin (base of the S-IC) and attitude
    this.holder.position.copy(this.scenePos(sim.origin));
    this.holder.quaternion.copy(this.quatFor(sim.q));
    const lost = sim.outcome?.status === 'lost';
    this.holder.visible = !lost;
    // cast-off stages
    const live = new Set<Debris>(sim.debris);
    for (const [d, g] of this.debrisObjs) {
      if (!live.has(d)) {
        g.parent?.remove(g);
        this.debrisObjs.delete(d);
      }
    }
    for (const d of sim.debris) {
      let g = this.debrisObjs.get(d);
      if (!g) {
        g = new THREE.Group();
        this.debrisObjs.set(d, g);
        (this.local ? this.site!.scene : this.space!.scene).add(g);
      }
      for (const p of d.parts) if (parts[p].parent !== g) g.add(parts[p]);
      const org = sub(d.r, qrot(d.q, [0, d.ycg, 0]));
      g.position.copy(this.scenePos(org));
      g.quaternion.copy(this.quatFor(d.q));
    }
    // parts neither on the vehicle nor in a live piece of debris have gone (burned up or splashed)
    const inDebris = new Set<PartId>();
    for (const d of sim.debris) for (const p of d.parts) inDebris.add(p);
    for (const p of PART_ORDER) {
      if (sim.attached.has(p)) {
        if (parts[p].parent !== this.rocket) this.rocket!.add(parts[p]);
        parts[p].visible = true;
      } else if (!inDebris.has(p)) parts[p].visible = false;
    }
    // docked, the lunar module rides turned round on the command module's nose
    if (this.tde < 0 && parts.lm.parent === this.rocket) {
      if (sim.layout === 'docked') {
        parts.lm.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
        parts.lm.position.set(0, DOCK_C, 0);
      } else {
        parts.lm.quaternion.identity();
        parts.lm.position.set(0, 0, 0);
      }
    }
    // the pad's fire light
    const fire = this.plumes.fireLevel;
    if (this.local) {
      const base = this.scenePos(sim.origin);
      this.padLight.position.set(base.x, Math.max(4, base.y - 12), base.z);
      this.padLight.intensity = fire * 14000 * (0.9 + 0.1 * Math.random());
    }
    // swing arms retract at liftoff
    if (this.local) {
      const t = sim.held ? (sim.met > -8 ? 0.15 : 0) : Math.min(1, 0.2 + (sim.met + 0.5) / 3);
      this.site!.setArms(t);
    }
  }

  // ------------------------------------------------------------------ cameras
  /** the chase camera offset (ECI) round the vehicle, in its local vertical frame */
  private chaseOffset(): { off: V3; up: V3 } {
    const sim = this.sim!;
    const up = sim.up;
    let north = sub([0, 1, 0], scale(up, up[1]));
    north = len(north) > 1e-6 ? norm(north) : [1, 0, 0];
    const east = norm(cross(north, up));
    const cp = Math.cos(this.camPitch);
    const dir = add(add(scale(north, cp * Math.cos(this.camYaw)), scale(east, cp * Math.sin(this.camYaw))), scale(up, Math.sin(this.camPitch)));
    return { off: scale(dir, this.camDist), up };
  }

  /** where the camera looks on the vehicle: the middle of what is left of it */
  private lookPoint(): V3 {
    const sim = this.sim!;
    let y0 = Infinity, y1 = -Infinity;
    for (const p of sim.attached) {
      y0 = Math.min(y0, Math.max(sim.py(p).y0, 0));
      y1 = Math.max(y1, sim.py(p).y1);
    }
    const mid = (y0 + y1) / 2;
    return add(sim.r, qrot(sim.q, [0, mid - sim.ycg, 0]));
  }

  private renderLocal(dt: number, w: number, h: number): void {
    const sim = this.sim!;
    const cam = this.localCam;
    cam.aspect = w / Math.max(1, h);
    const look = this.scenePos(this.lookPoint());
    if (this.camMode === 'TRACKING') {
      // a long-lens tracking camera on the causeway 1.6 km west of the pad
      cam.position.set(260, 14, 1500);
      const d = cam.position.distanceTo(look);
      cam.fov = Math.max(1.2, Math.min(50, (2 * Math.atan(95 / d) * 180) / Math.PI));
      cam.up.set(0, 1, 0);
      cam.lookAt(look);
    } else if (this.camMode === 'ONBOARD') {
      this.onboard(cam);
    } else {
      const { off, up } = this.chaseOffset();
      const ol = this.localDir(off), ul = this.localDir(up);
      cam.fov = 50;
      cam.position.set(look.x + ol[0], look.y + ol[1], look.z + ol[2]);
      const gy = this.site!.groundAt(cam.position.x, cam.position.z) + 3;
      if (cam.position.y < gy) cam.position.y = gy;
      cam.up.set(ul[0], ul[1], ul[2]);
      cam.lookAt(look);
    }
    this.frameOffset(cam, w, h, this.camMode === 'CHASE');
    cam.near = 0.5;
    cam.far = 140_000;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const vy = this.scenePos(sim.origin).y;
    this.site!.renderFlight(dt, cam, this.plumes.fireLevel * (sim.alt < 1500 ? 1 : 0), vy, sim.alt);
  }

  /** in the chase view, lift the vehicle above the attitude ball and tapes at the bottom of the screen */
  private frameOffset(cam: THREE.PerspectiveCamera, w: number, h: number, on: boolean): void {
    if (on) cam.setViewOffset(w, h, 0, h * 0.11, w, h);
    else cam.clearViewOffset();
  }

  /** keep the chase camera's framing as stages fall away: scale the distance with the length of what is left */
  private stackLen = 0;
  private fitChase(): void {
    const sim = this.sim!;
    let y0 = Infinity, y1 = -Infinity;
    for (const p of sim.attached) {
      y0 = Math.min(y0, Math.max(sim.py(p).y0, 0));
      y1 = Math.max(y1, sim.py(p).y1);
    }
    const L = Math.max(3, y1 - y0);
    if (this.stackLen && Math.abs(L - this.stackLen) > 0.5) this.camDist = Math.max(12, Math.min(3e6, this.camDist * (L / this.stackLen)));
    this.stackLen = L;
  }

  /** a camera on the side of the vehicle, looking down past the stage below at the plume and the Earth */
  private onboard(cam: THREE.PerspectiveCamera): void {
    const sim = this.sim!;
    let y0 = Infinity, rMax = 2.2;
    for (const p of sim.attached) {
      if (sim.py(p).y0 < y0) y0 = sim.py(p).y0;
      rMax = Math.max(rMax, sim.py(p).radius);
    }
    const top = sim.isLm ? 90.2 : sim.layout === 'docked' ? 97 : sim.attached.has('sm') ? Math.min(90, Math.max(y0 + 30, 50)) : 99;
    const ref = (by: number, bx: number) => sub(add(sim.origin, qrot(sim.q, [bx, by, 0])), [0, 0, 0]);
    const pos = this.scenePos(ref(top, rMax + 0.9));
    const at = this.scenePos(ref(top - 80, rMax + 0.3));
    const upv = this.local ? this.localDir(qrot(sim.q, [1, 0, 0])) : qrot(sim.q, [1, 0, 0]);
    cam.fov = 70;
    cam.position.copy(pos);
    cam.up.set(upv[0], upv[1], upv[2]);
    cam.lookAt(at);
  }

  private renderSpace(w: number, h: number): void {
    const sim = this.sim!;
    const sp = this.space!;
    const cam = sp.camera;
    const look = sub(this.lookPoint(), sim.r);
    let camPos: V3, camUp: V3, lookAt: V3;
    if (this.walk && !this.map) {
      const wc = this.walk.camera(this.camYaw, this.camPitch, Math.max(2.5, Math.min(30, this.camDist)));
      camPos = [wc.pos.x, wc.pos.y, wc.pos.z];
      lookAt = [wc.look.x, wc.look.y, wc.look.z];
      camUp = [wc.up.x, wc.up.y, wc.up.z];
      cam.fov = 55;
    } else if (this.map) {
      const c = sub(this.mapCenter(), sim.r);
      const cp = Math.cos(this.mapPitch);
      const dir: V3 = [cp * Math.sin(this.mapYaw), Math.sin(this.mapPitch), cp * Math.cos(this.mapYaw)];
      camPos = add(c, scale(dir, this.mapDist));
      camUp = [0, 1, 0];
      lookAt = c;
      cam.fov = 45;
    } else if (this.camMode === 'ONBOARD') {
      this.onboard(cam);
      camPos = [cam.position.x, cam.position.y, cam.position.z];
      camUp = [cam.up.x, cam.up.y, cam.up.z];
      const d = new THREE.Vector3();
      cam.getWorldDirection(d);
      lookAt = add(camPos, [d.x, d.y, d.z]);
    } else {
      const { off, up } = this.chaseOffset();
      camPos = add(look, off);
      // keep the camera above the ground (or the lunar surface)
      if (sim.nearMoon) {
        const rel = sub(add(sim.r, camPos), moonPos(sim.time));
        const gh = len(rel) - MOON.R - (len(rel) - MOON.R < 30_000 ? sim.groundAt(rel) : 0);
        if (gh < 2) camPos = add(camPos, scale(norm(rel), 2 - gh));
      } else {
        const ra = len(add(sim.r, camPos)) - EARTH.R;
        if (ra < 5) camPos = add(camPos, scale(sim.up, 5 - ra));
      }
      camUp = up;
      lookAt = look;
      cam.fov = 50;
    }
    this.frameOffset(cam, w, h, !this.map && this.camMode === 'CHASE');
    sp.update({ origin: sim.r, cam: camPos, camUp, look: lookAt, earthAngle: earthAngle(sim.time), time: sim.time }, w, h, this.map);
    this.plumes.group.visible = true;
    if (this.drawWith) this.drawWith(sp.scene, cam);
  }

  /** the map's centre: the Moon while near it, Earth otherwise */
  private mapCenter(): V3 {
    const sim = this.sim!;
    return sim.nearMoon ? moonPos(sim.time) : [0, 0, 0];
  }

  /** the coast ahead, propagated with both bodies' gravity (for the trip between Earth and the Moon) */
  private pathCache: { at: number; pts: V3[]; t: number } | null = null;
  private transitPath(): V3[] {
    const sim = this.sim!;
    const now = performance.now();
    if (this.pathCache && now - this.pathCache.at < 600 && Math.abs(this.pathCache.t - sim.time) < 3600 * 6) return this.pathCache.pts;
    const pts: V3[] = [];
    let s = { r: sim.r, v: sim.v };
    let t = sim.time;
    for (let i = 0; i < 160; i++) {
      const relM = sub(s.r, moonPos(t));
      pts.push(s.r);
      if (len(relM) < MOON.R || len(s.r) < EARTH.R) break;
      const step = Math.min(3 * 3600, Math.max(300, len(relM) / 4000));
      s = coast(s.r, s.v, t, step);
      t += step;
      if (t - sim.time > 6 * 86400) break;
    }
    this.pathCache = { at: now, pts, t: sim.time };
    return pts;
  }

  /** the map overlay: the predicted track drawn over the globe, dimmed where a body hides it, with the vehicle, apsides and impact point */
  private updateMapLabels(w: number, h: number): void {
    const cv = this.ui.mapCanvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const show = this.map && !!this.sim && !this.local;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const g = cv.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    this.ui.labelAp.style.display = this.ui.labelPe.style.display = 'none';
    if (!show) return;
    g.scale(dpr, dpr);
    const sim = this.sim!;
    const body = sim.body;
    const o = sim.orb;
    const center = this.mapCenter();
    const cam = this.space!.camera;
    const camEci = add(sim.r, [cam.position.x, cam.position.y, cam.position.z]);
    const mNow = moonPos(sim.time);
    const tmp = new THREE.Vector3();
    const hiddenBy = (p: V3, c: V3, R: number): boolean => {
      const d = sub(p, camEci);
      const dd = dot(d, d);
      const oc = sub(camEci, c);
      const t = Math.max(0, Math.min(1, -dot(oc, d) / dd));
      const q = add(oc, scale(d, t));
      return t > 0 && t < 0.999 && dot(q, q) < R * R * 0.999;
    };
    /** screen position of a point (ECI), and whether Earth or the Moon hides it */
    const proj = (p: V3): { x: number; y: number; hid: boolean } | null => {
      tmp.set(p[0] - sim.r[0], p[1] - sim.r[1], p[2] - sim.r[2]).project(cam);
      if (tmp.z > 1 || tmp.z < -1) return null;
      const hid = hiddenBy(p, [0, 0, 0], EARTH.R) || hiddenBy(p, mNow, MOON.R);
      return { x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h, hid };
    };
    const line = (pts: (V3 | null)[], col: string, width = 2.2, glow = true) => {
      const sp = pts.map((p) => (p ? proj(p) : null));
      for (const pass of glow ? [0, 1] : [1]) {
        for (let i = 1; i < sp.length; i++) {
          const a = sp[i - 1], b = sp[i];
          if (!a || !b) continue;
          const hid = a.hid || b.hid;
          if (hid && pass === 0) continue;
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.setLineDash(hid ? [3, 5] : []);
          g.lineWidth = pass === 0 ? 7 : hid ? 1 : width;
          g.strokeStyle = pass === 0 ? `rgba(${col},0.18)` : `rgba(${col},${hid ? 0.35 : 0.95})`;
          g.stroke();
        }
      }
      g.setLineDash([]);
    };
    // the Moon's own orbit, faint, for scale
    if (!sim.nearMoon) {
      const ring: V3[] = [];
      for (let i = 0; i <= 180; i++) ring.push(moonPos(sim.time + (i / 180) * 27.32 * 86400));
      line(ring, '170,170,190', 1, false);
      const mp = proj(mNow);
      if (mp) {
        g.fillStyle = 'rgba(220,220,230,0.9)';
        g.font = '11px Consolas, monospace';
        g.fillText('MOON', mp.x + 10, mp.y - 8);
      }
    }
    const COL: Record<string, string> = { air: '255,120,60', escape: '110,190,255', stable: '90,240,140', decay: '255,190,70' };
    const st = sim.status();
    let impact = false;
    let endP: V3 | null = null;
    if (st === 'transit' && !sim.nearMoon) {
      const pts = this.transitPath();
      line(pts, '120,200,255');
      endP = pts[pts.length - 1] ?? null;
    } else {
      const tr = orbitTrack(o, 360, body);
      impact = tr.impact;
      const pts = tr.pts.map((t) => add(center, t.p));
      const sp = pts.map((p) => proj(p));
      for (const pass of [0, 1]) {
        for (let i = 1; i < sp.length; i++) {
          const a = sp[i - 1], b = sp[i];
          if (!a || !b) continue;
          const hid = a.hid || b.hid;
          if (hid && pass === 0) continue;
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          const c = COL[tr.pts[i].kind];
          g.setLineDash(hid ? [3, 5] : []);
          g.lineWidth = pass === 0 ? 7 : hid ? 1 : 2.2;
          g.strokeStyle = pass === 0 ? `rgba(${c},0.18)` : `rgba(${c},${hid ? 0.35 : 0.95})`;
          g.stroke();
        }
      }
      g.setLineDash([]);
      if (impact) endP = pts[pts.length - 1];
    }
    // the impact point
    if (impact && endP) {
      const e = proj(endP);
      if (e) {
        g.strokeStyle = e.hid ? 'rgba(255,90,70,0.4)' : '#ff5a46';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(e.x - 6, e.y - 6);
        g.lineTo(e.x + 6, e.y + 6);
        g.moveTo(e.x + 6, e.y - 6);
        g.lineTo(e.x - 6, e.y + 6);
        g.stroke();
        g.font = '11px Consolas, monospace';
        g.fillStyle = g.strokeStyle;
        g.fillText(sim.nearMoon ? 'TOUCHDOWN' : 'IMPACT', e.x + 9, e.y + 4);
      }
    }
    // the vehicle
    const me = proj(sim.r);
    if (me) {
      const vNext = proj(add(sim.r, scale(sim.vRel, 60)));
      g.fillStyle = 'rgba(150,215,255,0.25)';
      g.beginPath();
      g.arc(me.x, me.y, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#bfe4ff';
      g.beginPath();
      g.arc(me.x, me.y, 4.5, 0, Math.PI * 2);
      g.fill();
      if (vNext) {
        const ang = Math.atan2(vNext.y - me.y, vNext.x - me.x);
        g.strokeStyle = '#bfe4ff';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(me.x + Math.cos(ang) * 8, me.y + Math.sin(ang) * 8);
        g.lineTo(me.x + Math.cos(ang) * 20, me.y + Math.sin(ang) * 20);
        g.stroke();
      }
    }
    // apoapsis and periapsis
    if (o.e >= 1 || st === 'transit') return;
    for (const [lab, nu, name] of [[this.ui.labelAp, Math.PI, 'AP'], [this.ui.labelPe, 0, 'PE']] as [HTMLElement, number, string][]) {
      if (name === 'PE' && o.rp < body.R) continue;
      const q = proj(add(center, orbitPoint(o, nu)));
      if (!q) continue;
      g.fillStyle = q.hid ? 'rgba(255,255,255,0.35)' : '#ffffff';
      g.beginPath();
      g.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
      g.fill();
      lab.style.display = 'block';
      lab.style.opacity = q.hid ? '0.45' : '1';
      lab.style.left = `${q.x}px`;
      lab.style.top = `${q.y}px`;
      const alt = (name === 'AP' ? o.ra : o.rp) - body.R;
      lab.textContent = `${name} ${(alt / 1000).toFixed(0)} km`;
    }
  }

  // ------------------------------------------------------------------ the Moon trip's set pieces
  /** transposition, docking and extraction, played out on the parts while the sim coasts */
  private updateTde(dt: number): void {
    const sim = this.sim!;
    const lp = this.ap.lunar.prog;
    if (this.tde < 0 && lp?.id === 'moon' && lp.phase === 'tde') {
      this.tde = 0;
      this.camDist = 70;
      this.camPitch = 0.35;
      this.ui.flash('TRANSPOSITION & DOCKING', 'good');
    }
    if (this.tde < 0) return;
    this.tde += dt;
    const t = this.tde;
    const sm = (x: number) => {
      const c = Math.max(0, Math.min(1, x));
      return c * c * (3 - 2 * c);
    };
    const parts = this.parts!;
    // the adapter's panels swing open, then fly off
    const open = sm(t / 3) * 0.95;
    const drift = Math.max(0, t - 2.5);
    for (const pnl of this.slaPanels()) {
      pnl.quaternion.setFromAxisAngle(pnl.userData.axis as THREE.Vector3, open + drift * 0.12);
      pnl.position.copy(pnl.userData.home as THREE.Vector3).addScaledVector(pnl.userData.radial as THREE.Vector3, drift * 2.4).add(new THREE.Vector3(0, drift * 0.4, 0));
    }
    // the command and service module backs off, turns round, comes back nose first and docks
    const c0 = 96.4;
    const dockY = DOCK_C - c0;
    const ext = 15 * sm((t - 29) / 11);
    let Y = c0 + 22 * sm((t - 2) / 6);
    if (t > 18) Y = c0 + 22 + (dockY - c0 - 22) * sm((t - 18) / 9);
    Y += ext;
    const th = Math.PI * sm((t - 8) / 10);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), th);
    for (const g of [parts.sm, parts.cm]) {
      g.quaternion.copy(q);
      g.position.set(0, Y - c0 * Math.cos(th), -c0 * Math.sin(th));
    }
    // and pulls the lunar module out of the S-IVB
    parts.lm.position.set(0, ext, 0);
    parts.lm.quaternion.identity();
    if (t > 27 && t - dt <= 27) this.ui.flash('DOCKED', 'good');
    if (t > 29 && t - dt <= 29) this.ui.flash('EXTRACTING THE LUNAR MODULE', '');
    if (t >= 40) {
      this.tde = -1;
      for (const g of [parts.sm, parts.cm, parts.lm]) {
        g.position.set(0, 0, 0);
        g.quaternion.identity();
      }
      for (const pnl of this.slaPanels()) pnl.visible = false;
      if (this.ap.lunar.prog?.phase === 'tde') this.ap.lunar.tdeDone(sim, 15);
      else sim.dock(15);
      this.camDist = 55;
    }
  }

  /** after touchdown the dust settles, then the moonwalk: the player takes the astronaut out */
  private updateWalk(dt: number): void {
    const sim = this.sim!;
    if (this.walkAt >= 0 && !this.walk) {
      this.walkAt += dt;
      if (this.walkAt > 3.5 && sim.restFixed) {
        this.walk = new Moonwalk(() => this.sim!.time, sim.restFixed, sim.q, () => this.sim!.r, this.glowTex());
        this.space!.scene.add(this.walk.group);
        this.camDist = 7;
        this.camPitch = 0.25;
        this.ui.flash('MOONWALK', 'good');
      }
    }
    const w = this.walk;
    if (!w) {
      this.ui.setEva(null);
      return;
    }
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    if (w.mode !== 'done') {
      w.update(dt, {
        fwd: k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'),
        side: k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft'),
        run: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
        jump: this.walkJump,
        use: this.walkUse,
        camYaw: this.camYaw,
      });
      if (Math.random() < dt / 3) w.refresh();
    }
    this.walkJump = this.walkUse = false;
    if (w.mode === 'done' && !this.endShown && this.endAt === Infinity) {
      this.endAt = performance.now() + 600;
      updateRecord((r) => (r.samples += 1));
    }
    this.ui.setEva(w.mode === 'done' ? null : { prompt: w.prompt, stats: w.stats });
  }

  private endWalk(): void {
    if (this.walk) this.walk.group.parent?.remove(this.walk.group);
    this.walk = null;
    this.walkAt = -1;
    this.ui.setEva(null);
  }

  /** the lander's legs, the dust its engine blasts off the ground, and the flag after touchdown */
  private updateLanding(dt: number): void {
    const sim = this.sim!;
    const parts = this.parts!;
    // legs swing out when the lander gets ready
    const want = sim.legsOut ? 1 : 0;
    this.legsK += Math.sign(want - this.legsK) * Math.min(Math.abs(want - this.legsK), dt * 0.35);
    setLmLegs(parts.lm, this.legsK);
    // dust: a sheet of regolith racing out from under the engine, low and fast
    const space = this.space!;
    if (!this.dust.length) {
      const tex = this.glowTex();
      for (let i = 0; i < 160; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.95, 0.92, 0.86), transparent: true, depthWrite: false, opacity: 0 }));
        sp.visible = false;
        sp.renderOrder = 7;
        sp.userData = { life: 0, max: 1, off: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1 };
        this.dust.push(sp);
      }
    }
    const eng = sim.isLm ? sim.engines[0]?.level ?? 0 : 0;
    const hgt = sim.nearMoon && sim.isLm ? sim.lowAlt : Infinity;
    const strength = Math.max(0, Math.min(1, eng * (1 - hgt / 45)));
    const up = sim.up;
    let y0 = Infinity;
    for (const p of sim.attached) y0 = Math.min(y0, sim.py(p).y0);
    const low = add(sim.r, qrot(sim.q, [0, y0 - sim.ycg, 0]));
    const ground = sub(low, scale(up, Number.isFinite(hgt) ? Math.max(0, hgt) : 0));
    const U = new THREE.Vector3(...up);
    const e1 = new THREE.Vector3().crossVectors(U, Math.abs(U.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const e2 = new THREE.Vector3().crossVectors(U, e1);
    this.dustT += dt * strength * 140;
    for (const sp of this.dust) {
      if (sp.parent !== space.scene && !this.local) space.scene.add(sp);
      const d = sp.userData as { life: number; max: number; off: THREE.Vector3; vel: THREE.Vector3; size: number };
      if (d.life <= 0 && this.dustT >= 1) {
        this.dustT -= 1;
        const a = Math.random() * Math.PI * 2;
        const dir = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
        d.off.copy(dir).multiplyScalar(1 + Math.random() * 2).addScaledVector(U, 0.2 + Math.random() * 0.4);
        d.vel.copy(dir).multiplyScalar(18 + Math.random() * 26).addScaledVector(U, Math.random() * 1.5);
        d.max = d.life = 1.1 + Math.random() * 1.1;
        d.size = 1.5 + Math.random() * 2;
      }
      if (d.life > 0) {
        d.life -= dt;
        d.off.addScaledVector(d.vel, dt);
        d.vel.multiplyScalar(Math.exp(-dt * 0.6));
        const k = d.life / d.max;
        const p = this.scenePos(ground).add(d.off);
        sp.position.copy(p);
        const s = d.size + (1 - k) * 9;
        sp.scale.set(s, s * 0.45, 1);
        (sp.material as THREE.SpriteMaterial).opacity = 0.5 * k * Math.min(1, (1 - k) * 6);
        sp.visible = !this.local;
      } else sp.visible = false;
    }
    // after touchdown: the camera drifts round, and a flag goes up beside the lander
    if (this.flagT >= 0 && sim.outcome?.status === 'landed') {
      this.flagT += dt;
      if (!this.drag) this.camYaw += dt * 0.07;
      if (!this.flag) this.flag = this.buildFlag();
      if (this.flag.parent !== this.holder) this.holder.add(this.flag);
      const k = Math.max(0, Math.min(1, (this.flagT - 5.5) / 1.5));
      const c = Math.max(0, Math.min(1, (this.flagT - 7) / 1.5));
      this.flag.visible = true;
      const pole = this.flag.userData.pole as THREE.Object3D;
      pole.visible = k > 0;
      pole.scale.y = Math.max(0.01, k);
      (this.flag.userData.cloth as THREE.Object3D).scale.set(Math.max(0.01, c), 1, 1);
      // an astronaut steps off the ladder and bounds out to plant it
      const astro = this.flag.userData.astro as THREE.Group;
      const w = Math.max(0, Math.min(1, (this.flagT - 2) / 3.5));
      astro.visible = this.flagT > 1.5;
      astro.position.set(-2.4 + 1.9 * w, 0, -0.6 + 1.4 * w);
      astro.position.y = w > 0 && w < 1 ? Math.abs(Math.sin(this.flagT * 5.5)) * 0.22 : 0;
      astro.rotation.y = w < 1 ? Math.atan2(1.9, 1.4) : -0.5;
    } else if (this.flag) this.flag.visible = false;
  }

  private buildFlag(): THREE.Group {
    const g = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = 190;
    c.height = 100;
    const x = c.getContext('2d')!;
    for (let i = 0; i < 13; i++) {
      x.fillStyle = i % 2 ? '#f4f3ef' : '#b22234';
      x.fillRect(0, (i * 100) / 13, 190, 100 / 13 + 1);
    }
    x.fillStyle = '#3c3b6e';
    x.fillRect(0, 0, 76, 54);
    x.fillStyle = '#f4f3ef';
    for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) x.fillRect(4 + k * 12.5 + (r % 2 ? 6 : 0), 3 + r * 5.6, 2.4, 2.4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pole = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#d8d8d4', metalness: 0.8, roughness: 0.3 }));
    rod.position.y = 1.2;
    rod.castShadow = true;
    pole.add(rod);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 6), rod.material);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0.5, 2.35, 0);
    pole.add(bar);
    const cloth = new THREE.Group();
    const geo = new THREE.PlaneGeometry(1.0, 0.62, 12, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 6) * 0.03);
    geo.translate(0.5, 0, 0);
    const cm = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    cm.castShadow = true;
    cm.position.y = 2.03;
    cloth.add(cm);
    pole.add(cloth);
    g.add(pole);
    g.add(this.buildAstronaut());
    g.position.set(5.5, 84.45, 4.0);
    g.userData.pole = pole;
    g.userData.cloth = cloth;
    g.userData.astro = g.children[g.children.length - 1];
    return g;
  }

  /** a moonwalker in the white suit, backpack on, gold visor down */
  private buildAstronaut(): THREE.Group {
    const a = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: '#f1efe9', roughness: 0.85 });
    const grey = new THREE.MeshStandardMaterial({ color: '#b9b8b2', roughness: 0.7 });
    const visor = new THREE.MeshStandardMaterial({ color: '#d4a440', roughness: 0.08, metalness: 1 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.set(rx, 0, rz);
      o.castShadow = true;
      a.add(o);
      return o;
    };
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.12, 0.1, 0.85, 10), suit, 0.13 * s, 0.5, 0);
      add(new THREE.BoxGeometry(0.17, 0.12, 0.3), grey, 0.13 * s, 0.06, 0.04);
      add(new THREE.CylinderGeometry(0.08, 0.07, 0.7, 10), suit, 0.33 * s, 1.15, 0.05, 0.2, 0.25 * s);
      add(new THREE.SphereGeometry(0.08, 10, 8), grey, 0.4 * s, 0.82, 0.12);
    }
    add(new THREE.CapsuleGeometry(0.24, 0.5, 6, 12), suit, 0, 1.25, 0);
    add(new THREE.BoxGeometry(0.5, 0.65, 0.3), suit, 0, 1.32, -0.3);
    add(new THREE.BoxGeometry(0.3, 0.18, 0.08), grey, 0, 1.25, 0.24);
    add(new THREE.SphereGeometry(0.2, 18, 14), suit, 0, 1.78, 0);
    const v = add(new THREE.SphereGeometry(0.205, 18, 10, -Math.PI / 2.4, Math.PI / 1.2, Math.PI / 4, Math.PI / 2.6), visor, 0, 1.78, 0.005);
    v.rotation.y = 0;
    a.position.set(-2.4, 0, -0.6);
    a.visible = false;
    return a;
  }

  // ------------------------------------------------------------------ effects
  private buildChutes(): void {
    const stripes = (() => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 32;
      const g = c.getContext('2d')!;
      for (let i = 0; i < 16; i++) {
        g.fillStyle = i % 2 ? '#f4f1ea' : '#e2551d';
        g.fillRect((i / 16) * 256, 0, 16, 32);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const canopy = (r: number) => {
      const g = new THREE.Group();
      const geo = new THREE.SphereGeometry(r, 32, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
      geo.scale(1, 0.55, 1);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: stripes, side: THREE.DoubleSide, roughness: 0.85 }));
      g.add(m);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r * 0.97, r * 0.55 * Math.cos(Math.PI * 0.42), Math.sin(a) * r * 0.97), new THREE.Vector3(0, -r * 1.6, 0));
      }
      g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#d8d0c0' })));
      return g;
    };
    for (let i = 0; i < 2; i++) {
      const c = canopy(2.6);
      c.position.set(i ? 2.5 : -2.5, 101.5 + 4.2 + 14, 0);
      this.drogues.push(c);
      this.chutes.add(c);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const c = canopy(12.7);
      c.position.set(Math.cos(a) * 9, 101.5 + 20.3 + 22, Math.sin(a) * 9);
      c.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      this.mains.push(c);
      this.chutes.add(c);
    }
    this.chutes.visible = false;
  }

  private updateChutes(): void {
    const sim = this.sim!;
    const cm = this.parts!.cm;
    if (this.chutes.parent !== cm) cm.add(this.chutes);
    this.chutes.visible = sim.isCm && sim.chute !== 'none' && sim.outcome?.status !== 'lost';
    const k = sim.chuteLevel;
    for (const d of this.drogues) d.visible = sim.chute === 'drogue';
    for (const m of this.mains) {
      m.visible = sim.chute === 'main';
      m.scale.setScalar(0.3 + 0.7 * k);
    }
    for (const d of this.drogues) d.scale.setScalar(0.4 + 0.6 * k);
    if (sim.outcome?.status === 'landed') for (const m of this.mains) m.visible = false;
  }

  private glowTex(): THREE.Texture {
    if (this.burstTex) return this.burstTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    this.burstTex = new THREE.CanvasTexture(c);
    return this.burstTex;
  }

  private updatePlasma(): void {
    const sim = this.sim!;
    if (!this.plasma.length) {
      for (let i = 0; i < 7; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex(), color: new THREE.Color(4, 1.6, 1), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        sp.renderOrder = 10;
        this.plasma.push(sp);
      }
    }
    const heat = sim.outcome ? 0 : sim.heat;
    const k = Math.max(0, Math.min(1, (Math.log10(Math.max(heat, 1)) - 6.2) / 1.6));
    const scene = this.local ? this.site!.scene : this.space!.scene;
    const vr = sim.vSurf;
    const vh = len(vr) > 1 ? norm(vr) : [0, 1, 0] as V3;
    let front: V3 = sim.r;
    let size = 12;
    if (sim.isCm) {
      front = add(sim.r, scale(vh, 2));
      size = 9;
    } else front = add(sim.r, scale(vh, 30));
    this.plasma.forEach((sp, i) => {
      if (sp.parent !== scene) scene.add(sp);
      sp.visible = k > 0.01;
      if (!sp.visible) return;
      const p = add(front, scale(vh, -i * size * 1.6));
      sp.position.copy(this.scenePos(p));
      const s = size * (1.4 + i * 0.5) * (0.8 + k);
      sp.scale.set(s, s, 1);
      const f = k * (1 - i / 8) * (0.85 + 0.15 * Math.random());
      (sp.material as THREE.SpriteMaterial).color.setRGB(5 * f, 2.2 * f, 1.6 * f + 0.6 * f * (i / 7));
    });
  }

  private burst(): void {
    const sim = this.sim!;
    const group = new THREE.Group();
    const sprites: Burst['sprites'] = [];
    for (let i = 0; i < 46; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex(), color: new THREE.Color(6, 3, 1.2), toneMapped: false, transparent: true, depthWrite: false, blending: i < 26 ? THREE.AdditiveBlending : THREE.NormalBlending }));
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 40);
      const y = Math.random() * 90;
      sp.position.set(0, y, 0);
      group.add(sp);
      sprites.push({ sp, v, s0: 12 + Math.random() * 20 });
    }
    group.position.copy(this.scenePos(sim.origin));
    group.quaternion.copy(this.quatFor(sim.q));
    (this.local ? this.site!.scene : this.space!.scene).add(group);
    this.bursts.push({ group, sprites, age: 0 });
  }

  private updateBursts(dt: number): void {
    const sim = this.sim!;
    for (const b of this.bursts) {
      b.age += dt;
      b.group.position.copy(this.scenePos(sim.origin));
      b.sprites.forEach((s, i) => {
        s.sp.position.addScaledVector(s.v, dt);
        s.v.multiplyScalar(Math.exp(-dt * 0.8));
        const sc = s.s0 + b.age * (30 + i);
        s.sp.scale.set(sc, sc, 1);
        const m = s.sp.material as THREE.SpriteMaterial;
        const fire = Math.max(0, 1 - b.age / 2.5);
        if (i < 26) m.color.setRGB(7 * fire, 3.2 * fire, 1.1 * fire);
        else {
          m.color.setRGB(0.25, 0.23, 0.22);
          m.opacity = Math.min(1, b.age) * Math.max(0, 1 - b.age / 14) * 0.8;
        }
      });
    }
  }
}

