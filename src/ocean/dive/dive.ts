// A dive: the submarine under the player's hands, from the berth and back.
// The physics runs in fixed 1/60 s steps (with interpolation for the picture),
// the acoustics on the same simulated clock, the expedition's checks on plain
// state. The camera, the HUD and the sound follow. Everything the player
// learns goes into the Echo Atlas as it happens, and the expedition saves a
// checkpoint at every stage.

import * as THREE from 'three';
import type { OceanWorld } from '../render/oceanWorld';
import { DiveHud, type HudState, type SurveyState } from './hud';
import { OceanAudio } from '../audio/oceanAudio';
import { OCEAN_KEY_SECTIONS } from '../keys';
import { SURVEY_SUB, NEUTRAL_BALLAST, newSubState, stepSub, FixedStepper, interpolate, rangeEstimate, speedOf, type SubState, type SubInput, type SubEnv } from '../sub/subPhysics';
import { buildColliders, seabedHeight, bearing, HARBOR, SITES, DEPTH_BANDS, regionAt, type Collider } from '../world/geo';
import { CONTACTS, listen, ambientNoise, selfNoise, addDb, pingMask, ListenGauge, bearingHalfWidth, measureBearing, sonarRays, HEAR_SNR, PING_MASK_S, type SonarReturn } from '../acoustics/acoustics';
import { EchoAtlas, TrackRecorder } from '../atlas/atlas';
import { Expedition, STAGES, MISSION_ID, MISSION_TITLE, toolReady, PROGRESS_KEY, CAREER_KEY, parseCheckpoint, parseCareer, type Checkpoint, type MissionCtx, type Career } from '../mission/expedition';
import { loadOceanSettings, saveOceanSettings, PRESETS, type OceanSettings } from '../perf/presets';
import { WEATHERS } from '../world/waves';
import { OCEAN_FX } from '../render/oceanMaterial';
import { el } from '../../ui/dom';
import { audio } from '../../audio/audio';

export type DiveMode = 'expedition' | 'free';
type CamMode = 'chase' | 'dome';

const DEG = Math.PI / 180;
const TIME_STEPS = [1, 2, 4];
const PING_RAYS = 90;

/** what the story says as each piece falls into place */
const STORY = {
  heard: 'Something knocking, twice, every couple of seconds. Too regular for an animal: probably mechanical.',
  bearing: 'One bearing: the knock comes from somewhere along this line. A second bearing from another place will narrow it.',
  located: 'The bearings cross over the slope, about 85 m down. Nothing is charted there.',
  pinged: 'Sonar shows a long, hard-edged shape on the slope: a hull?',
  found: 'A wreck: a small cargo ship sitting upright, her bow broken off.',
  plate: 'The stern reads ORIEL BAY, KESTREL: the coaster reported missing in the January gale.',
  recovered: 'The knock was the locator beacon on her voyage data recorder, running down. The recorder is aboard.',
};

export interface DiveHost {
  draw: (scene: THREE.Scene, camera: THREE.Camera, exposure: number) => void;
  /** the render scale a preset asks for (1 = the player's own setting) */
  setRenderScale: (k: number) => void;
  canvas: () => HTMLCanvasElement;
}

export class OceanDive {
  active = false;
  onExit: (() => void) | null = null;
  readonly atlas = new EchoAtlas();
  settings: OceanSettings = loadOceanSettings();
  readonly hud: DiveHud;
  private sound = new OceanAudio();
  private mode: DiveMode = 'expedition';
  private sub: SubState = newSubState(HARBOR.berth.x, HARBOR.berth.z, HARBOR.berth.heading);
  private stepper = new FixedStepper(8);
  private env: SubEnv;
  private colliders: Collider[];
  private keys = new Set<string>();
  private exp: Expedition | null = null;
  private career: Career = parseCareer(null);
  private quiet = false;
  private gauge = new ListenGauge();
  private overlay = true;
  private emergency = false;
  private timeIdx = 0;
  private paused = false;
  private chartOpen = false;
  private ended = false;
  // the camera
  private cam: CamMode = 'chase';
  private camYaw = 0;
  private camPitch = 0.22;
  private camDist = 11;
  private lookYaw = 0;
  private lookPitch = -0.08;
  private camPos = new THREE.Vector3();
  private camInit = false;
  private drag: { id: number; x: number; y: number } | null = null;
  private lastDrag = -1e9;
  private exposure = 1;
  private shakeT = 0;
  // acoustics
  private simT = 0;
  private lastPing = -1e9;
  private pingAt: { x: number; z: number } | null = null;
  private pingRays: SonarReturn[] = [];
  private pingNext = PING_RAYS;
  private pingOrigin = { x: 0, y: 0, z: 0, heading: 0 };
  private heardT = new Map<string, number>();
  private soundT = new Map<string, number>();
  private energy = new Float32Array(360);
  private survey: SurveyState = { show: false, self: 0, sea: 0, ping: 0, contacts: [], progress: 0, blocker: '', energy: null, heading: 0 };
  // the tools
  private scanT = -1;
  private arm: { t: number; attached: boolean } | null = null;
  private plateScanned = false;
  private recorderTaken = false;
  private docked = false;
  private photoPending = false;
  private photo: string | null = null;
  // the record of the dive
  private track = new TrackRecorder(25);
  private elapsed = 0;
  private maxDepth = 0;
  private battery0 = 1;
  private bumps = 0;
  private safe: Checkpoint | null = null;
  private saveT = 0;
  private regionT = 0;
  private region = '';
  private warnText = '';
  private warnT = 0;
  private batteryCard = false;
  private lightHintT = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(private world: OceanWorld, private host: DiveHost, parent: HTMLElement) {
    this.colliders = buildColliders();
    this.env = { waveAmp: world.weather.amp, colliders: this.colliders, relaxed: false };
    this.hud = new DiveHud(parent, OCEAN_KEY_SECTIONS, (id) => {
      audio.click();
      if (id === 'chart') this.toggleChart();
      else if (id === 'help') this.hud.help.classList.toggle('show');
      else if (id === 'camera') this.cycleCam();
      else this.setPaused(true);
    });
    window.addEventListener('keydown', (e) => this.onKey(e, true), { capture: true });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { capture: true });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', (e) => {
      if (!this.active || this.paused || this.chartOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('button, .oc-panel, .oc-modal, select')) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.lastDrag = performance.now();
      const k = 0.005 * this.settings.lookSpeed;
      if (this.cam === 'dome') {
        this.lookYaw = Math.max(-1.9, Math.min(1.9, this.lookYaw - dx * k));
        this.lookPitch = Math.max(-1.0, Math.min(0.9, this.lookPitch - dy * k));
      } else {
        this.camYaw -= dx * k;
        this.camPitch = Math.max(-0.6, Math.min(1.35, this.camPitch + dy * k));
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
        if (!this.active || this.paused) return;
        if (this.chartOpen) {
          const v = this.hud.chartView;
          if (v) {
            v.k = Math.max(0.05, Math.min(3, v.k * Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.002)));
            this.drawChart();
          }
          return;
        }
        const t = e.target as HTMLElement | null;
        if (t && t.closest && t.closest('.oc-panel, .oc-modal')) return;
        this.camDist = Math.max(5, Math.min(60, this.camDist * Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0018)));
      },
      { passive: true },
    );
    // dragging the chart pans it
    let cd: { x: number; y: number } | null = null;
    this.hud.chartCanvas.addEventListener('pointerdown', (e) => (cd = { x: e.clientX, y: e.clientY }));
    window.addEventListener('pointermove', (e) => {
      if (!cd || !this.hud.chartView) return;
      this.hud.chartView.cx -= (e.clientX - cd.x) / this.hud.chartView.k;
      this.hud.chartView.cz -= (e.clientY - cd.y) / this.hud.chartView.k;
      cd = { x: e.clientX, y: e.clientY };
      this.drawChart();
    });
    window.addEventListener('pointerup', () => (cd = null));
  }

  // ------------------------------------------------------------------ lifecycle
  /** is there an expedition to continue? */
  static savedStage(): number | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(PROGRESS_KEY);
    } catch {
      /* none */
    }
    const c = parseCheckpoint(raw);
    return c ? c.stage : null;
  }

  static loadCareer(): Career {
    try {
      return parseCareer(localStorage.getItem(CAREER_KEY));
    } catch {
      return parseCareer(null);
    }
  }

  start(mode: DiveMode, resume: boolean): void {
    this.keys.clear();
    this.mode = mode;
    this.settings = loadOceanSettings();
    this.career = OceanDive.loadCareer();
    this.applySettings();
    this.world.props.resetRecorder();
    this.sub = newSubState(HARBOR.berth.x, HARBOR.berth.z, HARBOR.berth.heading);
    this.sub.y = -0.75;
    this.stepper = new FixedStepper(8);
    this.exp = mode === 'expedition' ? new Expedition(0) : null;
    this.quiet = false;
    this.gauge.reset();
    this.emergency = false;
    this.timeIdx = 0;
    this.paused = false;
    this.chartOpen = false;
    this.ended = false;
    this.simT = 0;
    this.lastPing = -1e9;
    this.pingAt = null;
    this.pingRays = [];
    this.pingNext = PING_RAYS;
    this.heardT.clear();
    this.soundT.clear();
    this.scanT = -1;
    this.arm = null;
    this.plateScanned = false;
    this.recorderTaken = false;
    this.docked = false;
    this.photo = null;
    this.track = new TrackRecorder(25);
    this.elapsed = 0;
    this.maxDepth = 0;
    this.battery0 = 1;
    this.bumps = 0;
    this.safe = null;
    this.region = '';
    this.batteryCard = false;
    this.world.fx.clearSonar();
    this.world.sub.poseArm(0, 0.6);
    this.cam = 'chase';
    this.camYaw = 0;
    this.camPitch = 0.22;
    this.camDist = 11;
    this.camInit = false;
    this.world.sub.setInterior(false);
    if (mode === 'expedition' && resume) {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(PROGRESS_KEY);
      } catch {
        /* none */
      }
      const c = parseCheckpoint(raw);
      if (c) this.restore(c);
    }
    if (mode === 'expedition' && !resume) {
      try {
        localStorage.removeItem(PROGRESS_KEY);
      } catch {
        /* */
      }
    }
    if (this.exp && !this.safe) this.safe = this.checkpoint();
    this.world.sub.setLights(this.sub.lights);
    this.world.fill(this.sub.x, this.sub.z);
    this.hud.show(true);
    this.hud.setLarge(this.settings.largeHud);
    this.hud.showCard(null);
    // (no music in a dive: the sea and the hydrophones are the soundtrack)
    this.sound.start();
    this.active = true;
    const title = mode === 'expedition' ? MISSION_TITLE : 'FREE SURVEY';
    this.hud.flash(mode === 'expedition' ? (resume ? 'EXPEDITION RESUMED' : 'EXPEDITION') : 'KESTREL HARBOR', title, 4);
  }

  stop(): void {
    if (!this.active) return;
    if (this.exp && !this.ended) this.save();
    this.active = false;
    this.hud.show(false);
    this.sound.stop();
    this.host.setRenderScale(1);
    OCEAN_FX.uAid.value = 0;
  }

  private exit(): void {
    this.stop();
    this.onExit?.();
  }

  private applySettings(): void {
    const s = this.settings;
    this.world.setPreset(s.preset);
    if (this.world.weather.id !== s.weather) this.world.setWeather(s.weather);
    this.env.waveAmp = this.world.weather.amp;
    this.env.relaxed = s.relaxed;
    this.host.setRenderScale(PRESETS[s.preset].renderScale);
    OCEAN_FX.uAid.value = s.visibilityAid ? 1 : 0;
    this.hud.setLarge(s.largeHud);
  }

  // ------------------------------------------------------------------ saving
  private checkpoint(): Checkpoint {
    const s = this.sub;
    return {
      mission: MISSION_ID,
      stage: this.exp?.stage ?? 0,
      sub: { x: s.x, y: s.y, z: s.z, heading: s.heading, ballast: s.ballast, battery: s.battery },
      elapsed: this.elapsed,
      distance: this.track.distance,
      maxDepth: this.maxDepth,
      battery0: this.battery0,
      plateScanned: this.plateScanned,
      recorderTaken: this.recorderTaken,
      second: this.exp?.second ?? null,
      track: this.track.points.slice(),
      t: Date.now(),
    };
  }

  private save(): void {
    if (!this.exp || this.ended) return;
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.checkpoint()));
    } catch {
      /* storage full or blocked: the dive goes on */
    }
  }

  private restore(c: Checkpoint): void {
    const s = this.sub;
    s.x = c.sub.x;
    s.y = Math.min(-0.75, c.sub.y);
    s.z = c.sub.z;
    s.vx = s.vy = s.vz = 0;
    s.heading = c.sub.heading;
    s.ballast = c.sub.ballast;
    s.battery = c.sub.battery;
    s.holdDepth = c.sub.y < -3 ? -c.sub.y : null;
    s.holdPos = null;
    if (this.exp) {
      this.exp.stage = c.stage;
      this.exp.second = c.second;
      this.exp.changed = true;
    }
    this.elapsed = c.elapsed;
    this.maxDepth = c.maxDepth;
    this.battery0 = c.battery0;
    this.plateScanned = c.plateScanned;
    this.recorderTaken = c.recorderTaken;
    this.track = new TrackRecorder(25);
    this.track.points = c.track.slice();
    this.track.distance = c.distance;
    if (this.recorderTaken) this.stowRecorder();
    this.safe = c;
    this.camInit = false;
  }

  /** back to the last stage reached, as it was then */
  private recoverToSafe(): void {
    if (!this.safe) return;
    this.world.props.resetRecorder();
    this.world.sub.poseArm(0, 0.6);
    this.arm = null;
    this.scanT = -1;
    this.restore(this.safe);
    this.world.fill(this.sub.x, this.sub.z);
    this.setPaused(false);
    this.hud.flash('RECOVERED', 'BACK AT THE LAST SAFE POINT');
  }

  // ------------------------------------------------------------------ input
  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.active) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const c = e.code;
    const held = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyR', 'KeyF', 'KeyZ', 'KeyX', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft'];
    if (held.includes(c)) {
      if (down) this.keys.add(c);
      else this.keys.delete(c);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!down || e.repeat) return;
    let used = true;
    if (c === 'Escape') {
      if (this.hud.help.classList.contains('show')) this.hud.help.classList.remove('show');
      else if (this.chartOpen) this.toggleChart();
      else if (!this.ended) this.setPaused(!this.paused);
    } else if (this.paused || this.ended) used = false;
    else if (c === 'KeyM') this.toggleChart();
    else if (c === 'KeyH' || c === 'Slash') this.hud.help.classList.toggle('show');
    else if (this.chartOpen) used = false;
    else if (c === 'KeyQ') this.setQuiet(!this.quiet);
    else if (c === 'KeyP') this.ping();
    else if (c === 'KeyO') {
      this.overlay = !this.overlay;
      this.hud.flash('SONAR', this.overlay ? 'OVERLAY ON' : 'OVERLAY OFF', 1.5);
    } else if (c === 'KeyL') {
      this.sub.lights = !this.sub.lights;
      this.world.sub.setLights(this.sub.lights);
      audio.click();
    } else if (c === 'KeyT') {
      const d = Math.max(0, -this.sub.y);
      this.sub.holdDepth = this.sub.holdDepth === null && d > 1.5 ? d : null;
      this.sub.holdI = 0;
      this.hud.flash('ASSIST', this.sub.holdDepth !== null ? `HOLDING ${Math.round(d)} M` : 'DEPTH HOLD OFF', 1.5);
    } else if (c === 'KeyG') {
      this.sub.holdPos = this.sub.holdPos ? null : { x: this.sub.x, z: this.sub.z, heading: this.sub.heading };
      this.hud.flash('ASSIST', this.sub.holdPos ? 'HOLDING POSITION' : 'POSITION HOLD OFF', 1.5);
    } else if (c === 'KeyB') {
      this.emergency = !this.emergency;
      if (this.emergency) {
        this.sound.blow(true);
        this.sub.holdDepth = null;
        this.hud.flash('EMERGENCY BLOW', 'ALL TANKS TO THE SURFACE', 2.5);
      }
    } else if (c === 'KeyE') this.use();
    else if (c === 'KeyC') this.cycleCam();
    else if (c === 'Comma' || c === 'Period') this.stepTime(c === 'Period' ? 1 : -1);
    else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  private setQuiet(v: boolean): void {
    this.quiet = v;
    this.gauge.reset();
    if (v && this.timeIdx) this.timeIdx = 0;
    this.hud.flash('QUIET SURVEY', v ? 'LISTENING' : 'OFF', 1.4);
    audio.click();
  }

  private cycleCam(): void {
    this.cam = this.cam === 'chase' ? 'dome' : 'chase';
    this.world.sub.setInterior(this.cam === 'dome');
    this.lookYaw = 0;
    this.lookPitch = -0.08;
    this.camInit = false;
    this.hud.flash('CAMERA', this.cam === 'dome' ? "PILOT'S DOME" : 'CHASE', 1.2);
  }

  private stepTime(d: number): void {
    const n = Math.max(0, Math.min(TIME_STEPS.length - 1, this.timeIdx + d));
    if (n > 0) {
      const why = this.timeBlocked();
      if (why) {
        this.hud.flash('TIME', why, 2);
        return;
      }
    }
    this.timeIdx = n;
    this.hud.flash('TRANSIT TIME', `×${TIME_STEPS[n]}`, 1.2);
  }

  /** transit time runs faster only in open water, away from anything that needs care */
  private timeBlocked(): string {
    if (this.quiet) return 'NOT WHILE LISTENING';
    if (this.arm || this.scanT >= 0) return 'NOT DURING A TASK';
    const alt = this.sub.y - 1.4 - seabedHeight(this.sub.x, this.sub.z);
    if (alt < 6 && -this.sub.y > 2) return 'TOO CLOSE TO THE BOTTOM';
    if (Math.hypot(this.sub.x - SITES.wreck.x, this.sub.z - SITES.wreck.z) < 300) return 'NEAR THE SITE: ×1';
    if (this.sub.x > HARBOR.basin.minX && this.sub.x < HARBOR.basin.maxX && this.sub.z < HARBOR.basin.maxZ + 30) return 'INSIDE THE HARBOR: ×1';
    return '';
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    if (p) {
      this.save();
      this.keys.clear();
      this.pauseCard();
    } else this.hud.showCard(null);
  }

  private pauseCard(): void {
    this.hud.showCard((c) => {
      el('h2', '', c, 'PAUSED');
      el('div', 'sub', c, this.exp ? `${MISSION_TITLE} · stage ${Math.min(this.exp.stage + 1, STAGES.length)} of ${STAGES.length}. Progress is saved at every stage.` : 'Free survey from Kestrel Harbor.');
      const set = el('div', 'oc-set', c);
      const sel = <K extends keyof OceanSettings>(label: string, key: K, opts: [OceanSettings[K], string][]) => {
        el('span', '', set, label);
        const s = el('select', '', set) as HTMLSelectElement;
        for (const [v, t] of opts) {
          const o = el('option', '', s, t) as HTMLOptionElement;
          o.value = String(v);
          o.selected = this.settings[key] === v;
        }
        s.addEventListener('change', () => {
          const v = opts.find(([x]) => String(x) === s.value)?.[0];
          if (v === undefined) return;
          this.settings = { ...this.settings, [key]: v };
          saveOceanSettings(this.settings);
          this.applySettings();
        });
      };
      sel('Graphics', 'preset', [['performance', 'PERFORMANCE'], ['balanced', 'BALANCED'], ['cinematic', 'CINEMATIC']]);
      sel('Sea', 'weather', [['calm', WEATHERS.calm.label], ['dawn', WEATHERS.dawn.label], ['overcast', WEATHERS.overcast.label]]);
      sel('Guidance', 'guidance', [['markers', 'MARKERS IN VIEW'], ['bearing', 'COMPASS ONLY'], ['instruments', 'INSTRUMENTS ONLY']]);
      sel('Battery', 'relaxed', [[false, 'REAL DRAIN'], [true, 'RELAXED (NO DRAIN)']]);
      sel('Visibility aid', 'visibilityAid', [[false, 'OFF'], [true, 'ON']]);
      sel('Large HUD', 'largeHud', [[false, 'OFF'], [true, 'ON']]);
      sel('Reduce motion', 'reduceMotion', [[false, 'OFF'], [true, 'ON']]);
      const b = el('div', 'btns', c);
      const btn = (t: string, fn: () => void, primary = false) => {
        const x = el('button', 'oc-btn' + (primary ? ' primary' : ''), b, t) as HTMLButtonElement;
        x.type = 'button';
        x.addEventListener('click', () => {
          audio.click();
          fn();
        });
      };
      btn('RESUME', () => this.setPaused(false), true);
      btn('CONTROLS', () => this.hud.help.classList.add('show'));
      if (this.exp && this.safe) btn('RECOVER TO LAST SAFE POINT', () => this.recoverToSafe());
      if (this.exp) btn('RESTART EXPEDITION', () => this.start('expedition', false));
      btn(this.exp ? 'SAVE AND QUIT TO HARBOR' : 'QUIT TO HARBOR', () => this.exit());
    });
  }

  private toggleChart(): void {
    this.chartOpen = !this.chartOpen;
    if (this.chartOpen) this.hud.chartView = null;
    this.drawChart();
  }

  private drawChart(): void {
    const g = this.guideFor();
    this.hud.showChart(this.chartOpen, this.atlas.data, {
      sub: { x: this.sub.x, z: this.sub.z, heading: this.sub.heading },
      route: this.track.points,
      guide: this.settings.guidance !== 'instruments' ? g : null,
    });
    if (!this.chartOpen) return;
    const side = this.hud.chartSide;
    side.textContent = '';
    el('div', 'oc-sv-h', side, 'ECHO ATLAS');
    if (!this.atlas.data.contacts.length) el('div', 'oc-hint', side, 'Nothing heard yet. Contacts appear here when the hydrophones pick something out of the noise.');
    for (const ct of this.atlas.data.contacts) {
      const e = el('div', 'oc-contact', side);
      el('b', '', e, `${ct.label} · ${ct.status.toUpperCase()}`);
      el('div', '', e, ct.pattern.caption);
      el('div', '', e, ct.interpretations[ct.interpretations.length - 1]?.text ?? '');
      const obs = this.atlas.data.observations.filter((o) => o.contactId === ct.id).length;
      el('div', '', e, `${obs} bearing${obs === 1 ? '' : 's'}${ct.estimate ? ` · search area ${Math.round(ct.estimate.r)} m across` : ''}`);
    }
    el('div', 'oc-hint', side, 'Drag to pan · wheel to zoom · M or Esc closes');
  }

  // ------------------------------------------------------------------ acoustics
  private noiseAt(fKhz: number, sincePing: number): { total: number; self: number; sea: number; ping: number } {
    const s = this.sub;
    const sea = ambientNoise(Math.max(0, -s.y), this.world.weather.wind, fKhz);
    const self = selfNoise(s.out, speedOf(s));
    const ping = pingMask(sincePing);
    return { total: addDb(sea, self, ping > 0 ? sea + ping : -200), self, sea, ping };
  }

  private activeContact = (id: string): boolean => {
    if (id === 'knock') return !this.recorderTaken && !this.career.completed.includes(MISSION_ID);
    if (id === 'deep-pulse') return this.career.unlocked.includes('deep-pulse');
    return true;
  };

  private listenStep(dt: number): void {
    const s = this.sub;
    const sincePing = this.simT - this.lastPing;
    const n = this.noiseAt(37.5, sincePing);
    const heard = listen(s.x, s.y, s.z, (f) => this.noiseAt(f, sincePing).total, CONTACTS, this.activeContact);
    this.survey.self = n.self;
    this.survey.sea = n.sea;
    this.survey.ping = n.ping;
    this.survey.heading = s.heading;
    this.survey.show = this.quiet;
    // the bearing-time display: each contact a streak at its bearing, blinking with its pattern
    const e = this.energy;
    const floor = 0.06 + Math.max(0, Math.min(0.5, (n.self - n.sea) / 60));
    for (let b = 0; b < 360; b++) e[b] = floor * (0.6 + Math.random() * 0.8) + (n.ping > 0 ? (n.ping / 40) * 0.8 : 0);
    const list: SurveyState['contacts'] = [];
    let best: { id: string; snr: number; bearing: number } | null = null;
    for (const h of heard) {
      const def = CONTACTS.find((c) => c.id === h.id)!;
      const known = this.atlas.contact(h.id);
      if (h.snr > HEAR_SNR - 8) {
        const p = def.pattern;
        const ph = this.simT % p.period;
        const on = ph < p.beats * 0.22 + 0.1;
        const amp = Math.max(0, Math.min(1, (h.snr + 4) / 22)) * (on ? 1 : 0.35);
        const w = bearingHalfWidth(h.snr);
        for (let k = -40; k <= 40; k++) {
          const b = (((Math.round(h.bearing) + k) % 360) + 360) % 360;
          e[b] += amp * Math.exp(-(k * k) / (2 * w * w));
        }
        list.push({ label: known?.label ?? def.unknownLabel, snr: h.snr, caption: p.caption, heard: h.snr >= HEAR_SNR });
        // the sound itself, through the hydrophones (louder and cleaner with a better signal)
        if (this.quiet) {
          const last = this.soundT.get(h.id) ?? -1e9;
          if (this.simT - last >= p.period) {
            this.soundT.set(h.id, this.simT);
            this.sound.contact(p.pitch, p.beats, (h.snr - HEAR_SNR + 4) / 14);
          }
        }
      }
      if (h.snr >= HEAR_SNR) {
        // heard steadily for a moment: it goes in the atlas
        const t = (this.heardT.get(h.id) ?? 0) + dt;
        this.heardT.set(h.id, t);
        if (t > 1.5 && !known) {
          this.atlas.hear(h.id, def.unknownLabel, def.pattern, h.id === 'knock' ? STORY.heard : 'A slow, low pulse from far out in the basin.');
          this.hud.flash('NEW CONTACT', def.unknownLabel);
        }
        if (!best || h.snr > best.snr) best = { id: h.id, snr: h.snr, bearing: h.bearing };
      } else this.heardT.set(h.id, 0);
    }
    this.survey.contacts = list;
    this.survey.energy = e;
    // the listening procedure
    if (this.quiet) {
      const done = this.gauge.update(dt, best?.snr ?? -99, speedOf(s), s.yawRate, sincePing < PING_MASK_S);
      this.survey.progress = this.gauge.progress;
      this.survey.blocker = this.gauge.blocker;
      if (done && best) {
        this.gauge.reset();
        const def = CONTACTS.find((c) => c.id === best!.id)!;
        if (!this.atlas.contact(def.id)) this.atlas.hear(def.id, def.unknownLabel, def.pattern, def.id === 'knock' ? STORY.heard : 'A slow, low pulse from far out in the basin.');
        const hw = bearingHalfWidth(best.snr);
        const n0 = this.atlas.data.observations.length;
        const measured = measureBearing(best.bearing, hw, n0 * 7919 + Math.round(s.x * 13 + s.z * 7));
        const { fix } = this.atlas.observe({ contactId: def.id, x: s.x, z: s.z, depth: -s.y, bearing: measured, halfWidth: hw, snr: best.snr });
        this.sound.chime();
        const c = this.atlas.contact(def.id)!;
        if (fix) {
          if (def.id === 'knock') this.atlas.interpret(def.id, STORY.located);
          this.hud.flash('BEARINGS CROSS', 'SEARCH AREA ON THE CHART', 3.5);
        } else {
          if (def.id === 'knock' && c.interpretations.length < 2) this.atlas.interpret(def.id, STORY.bearing);
          this.hud.flash('BEARING RECORDED', `${String(Math.round(measured)).padStart(3, '0')}° ± ${Math.round(hw)}°`, 3);
        }
      }
    } else {
      this.survey.progress = 0;
      this.survey.blocker = '';
    }
  }

  private ping(): void {
    if (this.simT - this.lastPing < 2) return;
    const s = this.sub;
    this.lastPing = this.simT;
    this.pingAt = { x: s.x, z: s.z };
    this.pingOrigin = { x: s.x, y: s.y, z: s.z, heading: s.heading };
    this.pingRays = [];
    this.pingNext = 0;
    this.gauge.reset();
    const alt = s.y - seabedHeight(s.x, s.z);
    this.sound.ping(Math.min(0.5, (2 * Math.max(2, alt)) / 1500 + 0.05));
  }

  /** the ping's rays, a slice per frame; each answer goes on the sector display and the overlay */
  private pingStep(): void {
    if (this.pingNext >= PING_RAYS) return;
    const o = this.pingOrigin;
    const to = Math.min(PING_RAYS, this.pingNext + 18);
    const rays = sonarRays(o.x, o.y, o.z, this.colliders, PING_RAYS, this.pingNext, to, 5);
    this.pingRays.push(...rays);
    const pts: { x: number; y: number; z: number; kind: number; at: number }[] = [];
    const t0 = this.world.t;
    for (const r of rays) {
      const a = r.b * DEG;
      const dx = Math.sin(a), dz = -Math.cos(a);
      const end = r.r > 0 ? r.r : 280;
      // the multibeam under the boat maps the bottom along each ray (to 120 m below)
      for (let d = 8; d <= end; d += 10) {
        const x = o.x + dx * d, z = o.z + dz * d;
        const g = seabedHeight(x, z);
        if (o.y - g > 120) continue;
        pts.push({ x, y: g + 0.3, z, kind: 0, at: t0 + d / 1500 });
      }
      if (r.kind === 'object') {
        const x = o.x + dx * r.r, z = o.z + dz * r.r;
        for (let k = 0; k < 4; k++) pts.push({ x: x + (Math.random() - 0.5) * 3, y: o.y - r.r * 0.02 + (Math.random() - 0.5) * 3, z: z + (Math.random() - 0.5) * 3, kind: 1, at: t0 + r.r / 1500 });
      }
    }
    this.world.fx.addSonar(pts);
    this.pingNext = to;
    if (to >= PING_RAYS) {
      const hard = this.pingRays.filter((r) => r.kind === 'object' && r.tag.startsWith('wreck'));
      if (hard.length && this.atlas.contact('knock')) {
        this.atlas.interpret('knock', STORY.pinged);
        this.hud.flash('SONAR', `HARD RETURN AT ${Math.round(Math.min(...hard.map((r) => r.r)))} M`, 3);
      }
    }
  }

  // ------------------------------------------------------------------ tools
  private use(): void {
    const s = this.sub;
    const speed = speedOf(s);
    const depth = -s.y;
    // dock
    const db = Math.hypot(s.x - HARBOR.berth.x, s.z - HARBOR.berth.z);
    if (db < 16 && depth < 1.6) {
      if (speed > 0.7) return this.hud.flash('DOCKING', 'SLOW DOWN', 1.5);
      if (!this.exp || this.exp.id === 'dock') return this.dock();
      return this.hud.flash('DOCKING', 'THE EXPEDITION IS NOT FINISHED', 2);
    }
    if (this.batteryCard || this.arm || this.scanT >= 0) return;
    // scan the plate
    if (!this.plateScanned && (!this.exp || this.exp.id === 'scan')) {
      const p = this.world.props.plateWorld(this.tmp);
      const r = toolReady(s.x, s.z, s.heading, speed, p.x, p.z, 12, 45);
      if (Math.hypot(s.x - p.x, s.z - p.z) < 30) {
        if (!r.ok) return this.hud.flash('SCANNER', r.why, 1.8);
        this.scanT = 0;
        this.sound.camera();
        return;
      }
    }
    // recover the recorder
    if (!this.recorderTaken && (!this.exp || this.exp.id === 'recover' || this.exp.stage > STAGES.indexOf('recover'))) {
      const rp = SITES.recorder;
      const d = Math.hypot(s.x - rp.x, s.z - rp.z);
      if (d < 30) {
        const r = toolReady(s.x, s.z, s.heading, speed, rp.x, rp.z, 5.5, 35);
        const above = s.y - (seabedHeight(rp.x, rp.z) + 0.4);
        if (!r.ok) return this.hud.flash('ARM', r.why, 1.8);
        if (above > 4.2) return this.hud.flash('ARM', 'GO LOWER: THE ARM REACHES 2 M BELOW THE SKIDS', 2);
        this.arm = { t: 0, attached: false };
        s.holdPos = { x: s.x, z: s.z, heading: s.heading };
        audio.servo(1.2, 1);
        return;
      }
    }
  }

  private stowRecorder(): void {
    const rec = this.world.props.recorder;
    this.world.sub.basket.add(rec);
    rec.position.set(0, -0.02, 0);
    rec.rotation.set(0, Math.PI / 2, 0);
    rec.scale.setScalar(0.8);
  }

  private toolStep(dt: number): void {
    const s = this.sub;
    // the scan: two seconds of holding still facing the plate
    if (this.scanT >= 0) {
      const p = this.world.props.plateWorld(this.tmp);
      const r = toolReady(s.x, s.z, s.heading, speedOf(s), p.x, p.z, 12, 45);
      if (!r.ok) {
        this.scanT = -1;
        this.hud.flash('SCAN INTERRUPTED', r.why, 2);
      } else {
        this.scanT += dt;
        if (this.scanT >= 2) {
          this.scanT = -1;
          this.plateScanned = true;
          this.photoPending = true;
          this.atlas.addEvidence({ contactId: 'knock', kind: 'scan', title: 'Stern plate: ORIEL BAY, KESTREL', text: 'Laser scan of the transom lettering: ORIEL BAY, port of registry KESTREL.' });
          if (this.atlas.contact('knock')) this.atlas.interpret('knock', STORY.plate);
          this.hud.flash('SCANNED', 'ORIEL BAY · KESTREL', 3.5);
        }
      }
    }
    // the arm: reach, grip, lift and stow (about six seconds)
    if (this.arm) {
      const a = this.arm;
      a.t += dt;
      const m = this.world.sub;
      const rec = this.world.props.recorder;
      if (!a.attached) {
        // reach for the capsule's handle
        const tgt = m.toBody(this.tmp.set(SITES.recorder.x, rec.getWorldPosition(this.tmp2).y + 0.4, SITES.recorder.z));
        m.setArmTarget(tgt);
      }
      if (a.t < 2.4) m.poseArm(a.t / 2.4, 1);
      else if (a.t < 3.0) m.poseArm(1, 1 - ((a.t - 2.4) / 0.6) * 0.85);
      else {
        if (!a.attached) {
          a.attached = true;
          m.grip.attach(rec);
          audio.servo(0.6, 0.8);
        }
        if (a.t < 5.6) m.poseArm(1 - (a.t - 3.0) / 2.6, 0.15);
        else {
          this.stowRecorder();
          m.poseArm(0, 0.6);
          this.arm = null;
          this.recorderTaken = true;
          s.holdPos = null;
          this.sound.clunk();
          this.atlas.addEvidence({ contactId: 'knock', kind: 'item', title: 'Voyage data recorder capsule', text: 'An orange recorder capsule with its underwater locator beacon (37.5 kHz), still pinging weakly. Recovered from beside the bridge.' });
          if (this.atlas.contact('knock')) this.atlas.confirm('knock', { x: SITES.recorder.x, z: SITES.recorder.z, depth: -seabedHeight(SITES.recorder.x, SITES.recorder.z) }, 'MV ORIEL BAY · VDR BEACON', STORY.recovered);
          this.hud.flash('RECOVERED', 'VOYAGE DATA RECORDER', 3.5);
        }
      }
    }
  }

  private dock(): void {
    this.docked = true;
    const s = this.sub;
    s.vx = s.vy = s.vz = 0;
    s.x = HARBOR.berth.x;
    s.z = HARBOR.berth.z;
    s.heading = HARBOR.berth.heading;
    this.sound.clunk();
    if (!this.exp) {
      this.finishFree();
      return;
    }
  }

  // ------------------------------------------------------------------ the expedition's end
  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const knock = this.atlas.contact('knock');
    const fixErr = knock?.estimate ? Math.hypot(knock.estimate.x - SITES.recorder.x, knock.estimate.z - SITES.recorder.z) : null;
    const bearings = this.atlas.data.observations.filter((o) => o.contactId === 'knock').length;
    this.atlas.addExpedition({ mission: MISSION_ID, t: Date.now(), durationS: this.elapsed, distanceM: this.track.distance, maxDepth: this.maxDepth, bearings, fixErrorM: fixErr, batteryUsed: this.battery0 - this.sub.battery, recovered: this.recorderTaken ? ['Voyage data recorder'] : [] });
    this.track.add(this.sub.x, this.sub.z, Math.max(0, -this.sub.y));
    this.atlas.addTrack({ mission: MISSION_ID, t: Date.now(), points: this.track.points });
    if (!this.career.completed.includes(MISSION_ID)) this.career.completed.push(MISSION_ID);
    const fresh = !this.career.unlocked.includes('deep-pulse');
    if (fresh) this.career.unlocked.push('deep-pulse');
    try {
      localStorage.setItem(CAREER_KEY, JSON.stringify(this.career));
      localStorage.removeItem(PROGRESS_KEY);
    } catch {
      /* */
    }
    if (fresh) {
      const dp = CONTACTS.find((c) => c.id === 'deep-pulse')!;
      this.atlas.hear(dp.id, dp.unknownLabel, dp.pattern, 'Found on the recorder\'s last minutes, and on the harbor hydrophone log since: a slow, low pulse from far out in the deep basin. Listen for it on a free survey.');
    }
    const mm = (x: number) => `${Math.floor(x / 60)} min ${String(Math.round(x % 60)).padStart(2, '0')} s`;
    this.hud.showCard((c) => {
      el('h2', '', c, 'DEBRIEF');
      el('div', 'sub', c, MISSION_TITLE);
      const g = el('div', 'oc-deb', c);
      const l = el('div', '', g);
      el('p', '', l, 'Three weeks ago the coaster MV ORIEL BAY stopped answering in a winter gale off Kestrel. Nothing was found on the surface.');
      el('p', '', l, 'Your bearings on a faint double knock crossed over the slope. Sonar showed a hull; your lamps found her upright at 85 m, bow broken off. The stern plate confirmed her name, and the knock was her voyage data recorder\'s locator beacon, nearly flat.');
      el('p', '', l, 'The recorder is ashore with the investigators. Its last minutes, and the harbor\'s own hydrophone log, carry something else: a slow, low pulse from the deep basin. It is in your Echo Atlas.');
      const r = el('div', '', g);
      if (this.photo) {
        const im = el('img', '', r) as HTMLImageElement;
        im.src = this.photo;
        im.alt = 'Scan photograph of the stern plate';
      }
      const st = el('div', 'oc-deb-stats', r);
      st.style.marginTop = '12px';
      const row = (k: string, v: string) => {
        el('span', '', st, k);
        el('span', '', st, v);
      };
      row('Time', mm(this.elapsed));
      row('Distance', `${(this.track.distance / 1000).toFixed(2)} km`);
      row('Deepest', `${Math.round(this.maxDepth)} m`);
      row('Bearings taken', String(bearings));
      row('Search area centre to source', fixErr === null ? '—' : `${Math.round(fixErr)} m`);
      row('Battery used', `${Math.round((this.battery0 - this.sub.battery) * 100)} %`);
      row('Bumps', String(this.bumps));
      const b = el('div', 'btns', c);
      const x = el('button', 'oc-btn primary', b, 'BACK TO THE HARBOR') as HTMLButtonElement;
      x.type = 'button';
      x.addEventListener('click', () => {
        audio.click();
        this.exit();
      });
    }, true);
  }

  private finishFree(): void {
    this.ended = true;
    this.track.add(this.sub.x, this.sub.z, Math.max(0, -this.sub.y));
    this.atlas.addTrack({ mission: 'free', t: Date.now(), points: this.track.points });
    this.hud.showCard((c) => {
      el('h2', '', c, 'BACK AT THE BERTH');
      el('div', 'sub', c, `${(this.track.distance / 1000).toFixed(2)} km covered, deepest ${Math.round(this.maxDepth)} m. Your route is on the chart.`);
      const b = el('div', 'btns', c);
      const x = el('button', 'oc-btn primary', b, 'BACK TO THE HARBOR') as HTMLButtonElement;
      x.type = 'button';
      x.addEventListener('click', () => this.exit());
    });
  }

  // ------------------------------------------------------------------ the frame
  private input(): SubInput {
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    const busy = !!this.arm;
    const thrust = busy ? 0 : k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown');
    return {
      thrust,
      yaw: busy ? 0 : k('KeyD') - k('KeyA'),
      vertical: busy ? 0 : k('KeyR') - k('KeyF'),
      lateral: busy ? 0 : k('ArrowRight') - k('ArrowLeft'),
      ballast: k('KeyZ') - k('KeyX'),
      quiet: this.quiet,
      emergencyBlow: this.emergency,
    };
  }

  private guideFor(): { kind: 'point' | 'area'; x: number; z: number; r?: number; label: string } | null {
    if (!this.exp || this.exp.done) return null;
    const v = this.exp.view(this.ctx());
    if (v.guide.kind === 'none') return null;
    return v.guide.kind === 'area' ? { kind: 'area', x: v.guide.x, z: v.guide.z, r: v.guide.r, label: v.guide.label } : { kind: 'point', x: v.guide.x, z: v.guide.z, label: v.guide.label };
  }

  private ctx(): MissionCtx {
    const s = this.sub;
    const knock = this.atlas.contact('knock');
    return {
      x: s.x,
      z: s.z,
      depth: -s.y,
      speed: speedOf(s),
      heading: s.heading,
      knock,
      bearings: this.atlas.data.observations.filter((o) => o.contactId === 'knock').length,
      sincePing: this.simT - this.lastPing,
      pingAt: this.pingAt,
      plateScanned: this.plateScanned,
      recorderTaken: this.recorderTaken,
      docked: this.docked,
    };
  }

  frame(dtReal: number, w: number, h: number): void {
    if (!this.active) return;
    const dt = Number.isFinite(dtReal) ? Math.max(0, Math.min(0.1, dtReal)) : 0;
    const s = this.sub;
    const frozen = this.paused || this.chartOpen || this.ended;
    let alpha = 1;
    if (!frozen) {
      if (this.timeIdx && this.timeBlocked()) {
        this.timeIdx = 0;
        this.hud.flash('TRANSIT TIME', '×1', 1.2);
      }
      const scale = TIME_STEPS[this.timeIdx];
      const inp = this.input();
      // pushing down at the surface with light tanks does nothing: say why
      this.lightHintT -= dt;
      if (inp.vertical < 0 && -s.y < 2.5 && s.ballast < NEUTRAL_BALLAST - 0.08 && this.lightHintT <= 0) {
        this.lightHintT = 5;
        this.hud.flash('TOO LIGHT TO DIVE', 'FLOOD THE TANKS: HOLD Z', 2.5);
      }
      let bump: ReturnType<typeof stepSub> = null;
      alpha = this.stepper.advance(dt * scale, s, () => {
        const b = stepSub(s, SURVEY_SUB, inp, this.env, this.stepper.step);
        if (b && (!bump || b.speed > bump.speed)) bump = b;
        this.simT += this.stepper.step;
      });
      const sdt = dt * scale;
      this.elapsed += sdt;
      if (bump) this.onBump(bump);
      // the emergency blow ends at the surface
      if (this.emergency && -s.y < 1.2) {
        this.emergency = false;
        this.hud.flash('SURFACED', 'TANKS BLOWN', 2);
      }
      // the hull's rating
      const depth = -s.y;
      if (depth > DEPTH_BANDS.limit && !this.emergency) {
        this.emergency = true;
        this.sound.blow(true);
        this.hud.flash('HULL RATING EXCEEDED', 'AUTOMATIC EMERGENCY BLOW', 3);
      }
      this.maxDepth = Math.max(this.maxDepth, depth);
      this.track.add(s.x, s.z, Math.max(0, depth));
      this.listenStep(sdt);
      this.pingStep();
      this.toolStep(sdt);
      // the expedition
      if (this.exp && !this.exp.done) {
        const moved = this.exp.update(this.ctx());
        if (moved) {
          if (this.exp.lastNote === 'A wreck in the lights' && this.atlas.contact('knock')) this.atlas.interpret('knock', STORY.found);
          this.hud.flash(`STAGE ${this.exp.stage} OF ${STAGES.length}`, this.exp.lastNote.toUpperCase(), 3);
          this.sound.chime();
          this.safe = this.checkpoint();
          this.save();
          if (this.exp.done) this.finish();
        }
      }
      // checkpoints now and then, and the regions as they are reached
      this.saveT += dt;
      if (this.saveT > 20 && !this.arm) {
        this.saveT = 0;
        this.save();
      }
      this.regionT += dt;
      if (this.regionT > 1) {
        this.regionT = 0;
        const r = regionAt(s.x, s.z);
        if (r.id !== this.region) {
          this.region = r.id;
          if (this.atlas.visit(r.id) && r.id !== 'harbor') this.hud.flash('NEW REGION', `${r.name} · ${r.band}`, 3);
        }
      }
      // a flat battery
      if (s.battery <= 0 && !this.batteryCard && !this.env.relaxed) this.batteryFlat();
    }
    // the boat between its last two steps
    const p = interpolate(this.stepper.prev, s, frozen ? 1 : alpha);
    const m = this.world.sub;
    m.place(p.x, p.y, p.z, p.heading, p.pitch, p.roll);
    m.animate(dt, s.out, this.world.t, -s.y < 1.5);
    // bubbles: venting while blowing, churn from thrusters near the surface
    if (!frozen) {
      if (s.out.pumping && (this.emergency || this.keys.has('KeyX')) && Math.random() < 0.7) {
        const v = m.toWorld(this.tmp.set(0, 1.2, 0.4));
        this.world.fx.emitBubbles(v.x, v.y, v.z, this.emergency ? 4 : 1, 0.6, 0.6);
      }
      if (Math.abs(s.out.thrust) > 0.5 && -s.y < 8 && Math.random() < 0.4) {
        const v = m.toWorld(this.tmp.set(1.2 * (Math.random() < 0.5 ? -1 : 1), 0, 2.7));
        this.world.fx.emitBubbles(v.x, v.y, v.z, 1, 0.3, 0.3);
      }
    }
    this.placeCamera(dt, p);
    const cam = this.world.camera;
    this.world.resize(w, h);
    const fwd = s.heading * DEG;
    this.world.update(dt, h, { x: s.x + Math.sin(fwd) * 60 + s.vx * 8, z: s.z - Math.cos(fwd) * 60 + s.vz * 8 }, { lamps: s.lights, overlay: this.overlay, boat: { x: s.x, z: s.z, speed: Math.hypot(s.vx, s.vz), surfaced: -s.y < 1.2 }, time: s.t });
    // the eye adapts: quickly to light, more slowly to the dark
    const want = this.world.exposureFor(s.lights);
    const k = want > this.exposure ? 0.7 : 2.2;
    this.exposure += (want - this.exposure) * Math.min(1, dt * k);
    this.world.fx.setExposure(this.exposure);
    this.host.draw(this.world.scene, cam, this.exposure);
    if (this.photoPending) this.takePhoto();
    this.updateHud(dt, w, h);
    this.sound.update({ depth: -s.y, surfaced: -s.y < 1.2, thrust: s.out.thrust, vertical: s.out.vertical, lateral: s.out.lateral, pumping: s.out.pumping, quiet: this.quiet, listening: this.quiet, paused: this.paused || this.ended });
  }

  private onBump(b: { speed: number; tag: string; severity: 'light' | 'hard' }): void {
    if (b.speed < 0.15) return;
    this.sound.bump(b.severity === 'hard');
    if (b.severity === 'hard') {
      this.bumps++;
      this.warnText = b.tag === 'seabed' ? 'HIT THE BOTTOM' : `COLLISION: ${b.tag.toUpperCase().replace(/-/g, ' ')}`;
      this.warnT = 2.5;
      if (!this.settings.reduceMotion) {
        this.shakeT = 0.35;
        this.hud.shake();
      }
    }
  }

  private batteryFlat(): void {
    this.batteryCard = true;
    this.hud.showCard((c) => {
      el('h2', '', c, 'BATTERY FLAT');
      el('div', 'sub', c, 'PETREL has no power for the thrusters. The support vessel can come out and tow you home, or you can go back to the last safe point.');
      const b = el('div', 'btns', c);
      const btn = (t: string, fn: () => void, primary = false) => {
        const x = el('button', 'oc-btn' + (primary ? ' primary' : ''), b, t) as HTMLButtonElement;
        x.type = 'button';
        x.addEventListener('click', () => {
          audio.click();
          this.batteryCard = false;
          this.hud.showCard(null);
          fn();
        });
      };
      btn('CALL A TOW', () => {
        const s = this.sub;
        s.x = HARBOR.gate.x;
        s.z = HARBOR.gate.z - 40;
        s.y = -0.75;
        s.vx = s.vy = s.vz = 0;
        s.heading = 0;
        s.ballast = 0;
        s.battery = 0.35;
        s.holdDepth = null;
        this.emergency = false;
        this.camInit = false;
        this.world.fill(s.x, s.z);
        this.hud.flash('TOWED IN', 'BATTERY CHARGED TO 35 %', 3);
      }, true);
      if (this.safe) btn('LAST SAFE POINT', () => this.recoverToSafe());
    });
  }

  private placeCamera(dt: number, p: { x: number; y: number; z: number; heading: number; pitch: number; roll: number }): void {
    const cam = this.world.camera;
    const m = this.world.sub;
    if (this.cam === 'dome') {
      const eye = m.toWorld(this.tmp.copy(m.eye));
      cam.position.copy(eye);
      const yaw = p.heading * DEG + this.lookYaw;
      const pitch = p.pitch * DEG + this.lookPitch;
      cam.up.set(0, 1, 0);
      cam.lookAt(eye.x + Math.sin(yaw) * Math.cos(pitch), eye.y + Math.sin(pitch), eye.z - Math.cos(yaw) * Math.cos(pitch));
      cam.fov = 70;
      cam.near = 0.05;
    } else {
      // the chase camera swings in behind the boat unless the player has looked away recently;
      // while the arm or the scanner works it moves round to watch from ahead and to the side
      const task = !!this.arm || this.scanT >= 0;
      const free = performance.now() - this.lastDrag > 4000 && !this.drag;
      if (free) {
        const target = task ? 2.3 : 0;
        this.camYaw += (target - this.camYaw) * Math.min(1, dt * (task ? 1.2 : 0.6));
      }
      const yaw = p.heading * DEG + this.camYaw;
      const d = task ? Math.min(this.camDist, 8) : this.camDist;
      const pitch = task ? Math.max(this.camPitch, 0.35) : this.camPitch;
      const want = this.tmp.set(p.x - Math.sin(yaw) * Math.cos(pitch) * d, p.y + 1.2 + Math.sin(pitch) * d, p.z + Math.cos(yaw) * Math.cos(pitch) * d);
      // stay off the bottom
      const g = seabedHeight(want.x, want.z) + 0.8;
      if (want.y < g) want.y = g;
      if (!this.camInit) {
        this.camPos.copy(want);
        this.camInit = true;
      } else this.camPos.lerp(want, Math.min(1, dt * 4.5));
      cam.position.copy(this.camPos);
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        cam.position.x += (Math.random() - 0.5) * 0.12;
        cam.position.y += (Math.random() - 0.5) * 0.12;
      }
      cam.up.set(0, 1, 0);
      cam.lookAt(p.x, p.y + 0.8, p.z);
      cam.fov = 62;
      cam.near = 0.08;
    }
    cam.updateProjectionMatrix();
  }

  private takePhoto(): void {
    this.photoPending = false;
    try {
      const src = this.host.canvas();
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = Math.round((400 * src.height) / Math.max(1, src.width));
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
      this.photo = c.toDataURL('image/jpeg', 0.72);
      this.atlas.addEvidence({ contactId: 'knock', kind: 'photo', title: 'Photograph: the stern of the wreck', text: 'Taken by the pilot\'s camera during the scan.', image: this.photo });
    } catch {
      /* no picture (a tainted or lost canvas): the scan itself is recorded */
    }
  }

  private updateHud(dt: number, w: number, h: number): void {
    const s = this.sub;
    const depth = Math.max(0, -s.y);
    const ground = seabedHeight(s.x, s.z);
    const alt = s.y - 1.4 - ground;
    const guide = this.guideFor();
    const ctx = this.ctx();
    let task = 'Explore, listen and chart. Dock at the berth to finish.', hint = 'Q listens · P pings · M opens the chart', kicker = 'FREE SURVEY · KESTREL HARBOR';
    let stage = 0;
    if (this.exp && !this.exp.done) {
      const v = this.exp.view(ctx);
      task = v.task;
      hint = v.hint;
      stage = this.exp.stage;
      kicker = `${MISSION_TITLE} · ${stage + 1}/${STAGES.length}`;
    } else if (this.exp) {
      task = 'Expedition complete';
      hint = '';
      stage = STAGES.length;
      kicker = MISSION_TITLE;
    }
    // compass marks
    const marks: HudState['marks'] = [];
    const showGuide = this.settings.guidance !== 'instruments';
    if (guide && showGuide) marks.push({ b: bearing(s.x, s.z, guide.x, guide.z), kind: 'guide' });
    for (const o of this.atlas.data.observations.slice(-4)) if (Math.hypot(o.x - s.x, o.z - s.z) < 400) marks.push({ b: o.bearing, kind: 'contact' });
    if (Math.hypot(s.x - HARBOR.gate.x, s.z - HARBOR.gate.z) > 250) marks.push({ b: bearing(s.x, s.z, HARBOR.gate.x, HARBOR.gate.z), kind: 'home' });
    // tags
    const tags: HudState['tags'] = [];
    if (this.quiet) tags.push(['QUIET', 'on']);
    if (s.holdDepth !== null) tags.push([`HOLD ${Math.round(s.holdDepth)} M`, 'on']);
    if (s.holdPos) tags.push(['HOLD POS', 'on']);
    tags.push(['LAMPS', s.lights ? 'on' : '']);
    if (this.overlay) tags.push(['OVERLAY', '']);
    if (this.timeIdx) tags.push([`TIME ×${TIME_STEPS[this.timeIdx]}`, 'amber']);
    if (this.emergency) tags.push(['EMERG BLOW', 'amber']);
    if (this.env.relaxed) tags.push(['RELAXED', '']);
    // warnings
    let warn = '';
    if (depth > DEPTH_BANDS.caution) warn = `DEPTH ${Math.round(depth)} M: NEAR THE HULL RATING (${DEPTH_BANDS.limit} M)`;
    else if (s.battery < 0.1 && !this.env.relaxed) warn = 'BATTERY LOW: HEAD HOME';
    else if (this.warnT > 0) warn = this.warnText;
    else if (alt < 2.5 && s.vy < -0.15 && depth > 3) warn = 'BOTTOM CLOSE';
    this.warnT -= dt;
    this.hud.update(
      {
        kicker,
        task,
        hint,
        stage,
        stages: this.exp ? STAGES.length : 0,
        heading: s.heading,
        depth,
        alt: alt < 150 && depth > 1.5 ? Math.max(0, alt) : null,
        seabed: ground,
        // (speed over the ground; the vertical rate is shown on its own)
        speedMs: Math.hypot(s.vx, s.vz),
        vs: s.vy,
        battery: s.battery,
        rangeKm: this.env.relaxed ? 999 : rangeEstimate(s, SURVEY_SUB) / 1000,
        ballast: s.ballast,
        neutral: NEUTRAL_BALLAST,
        tags,
        marks,
        warn,
      },
      dt,
    );
    const age = this.simT - this.lastPing;
    this.hud.updateSurvey(this.survey, this.pingRays.length ? { returns: this.pingRays, age, heading: this.pingOrigin.heading } : null, dt);
    // the prompt for the tool in reach
    this.hud.setPrompt(...this.promptText());
    // the guide marker in view
    const cam = this.world.camera;
    if (guide && this.settings.guidance === 'markers' && !this.chartOpen) {
      const gy = guide.kind === 'area' ? seabedHeight(guide.x, guide.z) + 4 : depth < 2 ? 1.5 : Math.max(seabedHeight(guide.x, guide.z) + 3, s.y);
      const v = this.tmp.set(guide.x, gy, guide.z).project(cam);
      const dist = Math.hypot(guide.x - s.x, guide.z - s.z);
      const label = `${guide.label} · ${dist < 1000 ? Math.round(dist) + ' M' : (dist / 1000).toFixed(1) + ' KM'}`;
      const behind = v.z > 1;
      if (!behind && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.9) this.hud.setMarker({ x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, on: true, edge: false, angle: 0, label, area: guide.kind === 'area' });
      else {
        let ax = v.x, ay = v.y;
        if (behind) {
          ax = -ax;
          ay = -ay;
        }
        const a = Math.atan2(ay, ax);
        const ex = Math.cos(a), ey = Math.sin(a);
        const kk = Math.min(0.88 / Math.max(1e-3, Math.abs(ex)), 0.8 / Math.max(1e-3, Math.abs(ey)));
        this.hud.setMarker({ x: (ex * kk * 0.5 + 0.5) * w, y: (-ey * kk * 0.5 + 0.5) * h, on: true, edge: true, angle: 90 - (a * 180) / Math.PI, label, area: false });
      }
    } else this.hud.setMarker(null);
    // labels for confirmed sites in view
    const labels: { x: number; y: number; text: string }[] = [];
    for (const c of this.atlas.data.contacts) {
      if (!c.site) continue;
      const d = Math.hypot(c.site.x - s.x, c.site.z - s.z);
      if (d > 400 || d < 8) continue;
      const v = this.tmp.set(c.site.x, -c.site.depth + 3, c.site.z).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      labels.push({ x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, text: `${c.label} · ${Math.round(d)} M` });
    }
    this.hud.setLabels(labels);
    this.hud.drawMini(this.atlas.data, { sub: { x: s.x, z: s.z, heading: s.heading }, route: this.track.points, guide: this.settings.guidance !== 'instruments' ? guide : null }, dt);
  }

  private promptText(): [string, boolean] {
    if (this.paused || this.ended || this.chartOpen) return ['', false];
    const s = this.sub;
    const speed = speedOf(s);
    if (this.scanT >= 0) return [`SCANNING ${Math.round((this.scanT / 2) * 100)} % · HOLD STILL`, false];
    if (this.arm) return ['ARM WORKING · HOLDING POSITION', false];
    if (Math.hypot(s.x - HARBOR.berth.x, s.z - HARBOR.berth.z) < 16 && -s.y < 1.6) {
      if (this.exp && this.exp.id !== 'dock') return ['', false];
      return speed > 0.7 ? ['SLOW DOWN TO DOCK', true] : ['E · DOCK AT THE BERTH', false];
    }
    if (!this.plateScanned && (!this.exp || this.exp.id === 'scan')) {
      const pl = this.world.props.plateWorld(this.tmp2);
      if (Math.hypot(s.x - pl.x, s.z - pl.z) < 30) {
        const r = toolReady(s.x, s.z, s.heading, speed, pl.x, pl.z, 12, 45);
        return r.ok ? ['E · SCAN THE PLATE', false] : [r.why, true];
      }
    }
    if (!this.recorderTaken && (!this.exp || this.exp.id === 'recover')) {
      const rp = SITES.recorder;
      if (Math.hypot(s.x - rp.x, s.z - rp.z) < 30) {
        const r = toolReady(s.x, s.z, s.heading, speed, rp.x, rp.z, 5.5, 35);
        if (!r.ok) return [r.why, true];
        if (s.y - (seabedHeight(rp.x, rp.z) + 0.4) > 4.2) return ['GO LOWER FOR THE ARM', true];
        return ['E · RECOVER WITH THE ARM', false];
      }
    }
    return ['', false];
  }
}
