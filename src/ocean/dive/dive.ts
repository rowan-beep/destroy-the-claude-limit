// A dive: the submarine under the player's hands, from the berth and back.
// The physics runs in fixed 1/60 s steps (with interpolation for the picture),
// the acoustics on the same simulated clock, the expedition's checks on plain
// state. The camera, the HUD and the sound follow. Everything the player
// learns goes into the Echo Atlas as it happens, and the expedition saves a
// checkpoint at every stage.

import * as THREE from 'three';
import type { OceanWorld } from '../render/oceanWorld';
import { DiveHud, type HudState, type SurveyState, type ScopeView } from './hud';
import { OceanAudio } from '../audio/oceanAudio';
import { OCEAN_KEY_SECTIONS } from '../keys';
import { DiveTouch, DiveGamepad, type ControlTarget } from './controls';
import { ARM_READY, moveArmTarget } from './manipulator';
import { isTouchDevice } from '../../ui/touchControls';
import { SURVEY_SUB, NEUTRAL_BALLAST, newSubState, stepSub, FixedStepper, interpolate, rangeEstimate, speedOf, type SubState, type SubInput, type SubEnv } from '../sub/subPhysics';
import { buildColliders, seabedHeight, groundAt, bearing, HARBOR, SITES, K3, DEPTH_BANDS, regionAt, type Collider } from '../world/geo';
import { CONTACTS, listen, ambientNoise, selfNoise, addDb, pingMask, ListenGauge, bearingHalfWidth, measureBearing, sonarRays, HEAR_SNR, PING_MASK_S, SONAR_RANGE, type SonarReturn } from '../acoustics/acoustics';
import { EchoAtlas, TrackRecorder } from '../atlas/atlas';
import { Expedition, STAGES, MISSION_ID, MISSION_TITLE, toolReady, CAREER_KEY, parseCheckpoint, parseCareer, type Checkpoint, type MissionRun, type Career } from '../mission/expedition';
import { PulseMission, PULSE_ID, PULSE_TITLE, PULSE_STAGES, multibeamSees, type PulseCtx } from '../mission/followup';
import { loadOceanSettings, saveOceanSettings, PRESETS, type OceanSettings } from '../perf/presets';
import { WEATHERS } from '../world/waves';
import { OCEAN_FX } from '../render/oceanMaterial';
import { el } from '../../ui/dom';
import { audio } from '../../audio/audio';

export type DiveMode = 'expedition' | 'free' | 'pulse';
type CamMode = 'chase' | 'dome';

const DEG = Math.PI / 180;
const TIME_STEPS = [1, 2, 4];
const PING_RAYS = 90;
/** a full turn of the scanning sonar's head (s) */
const SWEEP_S = 3;
/** what the arm can take, as the pilot sees it */
const SAMPLE_NAMES: Record<string, string> = { shell: 'SHELL', stone: 'STONE', starfish: 'STARFISH', urchin: 'SEA URCHIN', cucumber: 'SEA CUCUMBER' };

/** something in the jaw */
interface Held {
  what: 'recorder' | 'hydrophone' | 'sample';
  obj: THREE.Object3D;
  name: string;
  depth: number;
}

/** the arm under the pilot's own hands */
interface Manip {
  /** 0 stowed .. 1 out (the joints blend from the stowed pose) */
  k: number;
  /** where the jaw is wanted, in the boat's frame */
  tip: THREE.Vector3;
  /** 0 closed .. 1 open */
  jaw: number;
  held: Held | null;
  /** seconds into stowing, or -1 while working */
  stowing: number;
  /** the holds as they were before the arm came out */
  prevPos: SubState['holdPos'];
  prevDepth: number | null;
  /** the jaw is on the bottom */
  touching: boolean;
  /** where the jaw started stowing from */
  from: THREE.Vector3;
}

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

/** and the follow-up's */
const PULSE_STORY = {
  heard: 'A slow, low pulse from far out in the basin.',
  bearing: 'One bearing on the pulse. It is kilometres off: the second bearing needs a long step to the side.',
  located: 'The bearings cross over the deep basin, where the bottom is 330 m down and more.',
  found: 'An orange float in the lamps, 282 m down, on a taut yellow line running down into the dark: a deep mooring.',
  tag: 'The tag reads KESTREL MARINE LAB · MOORING K3. Its relocation pinger only starts when the mooring is knocked over.',
  recovered: "K3's hydrophone recorder is aboard. It has been listening to the basin since the autumn.",
  foot: "The multibeam shows a box 6 m long lying across the line at the anchor, 339 m down: a shipping container. Past PETREL's rating: a job for the lab's ROV.",
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
  private exp: MissionRun<PulseCtx> | null = null;
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
  /** the scanning sonar: when this turn of the head began (sim time), the bearing it began at (deg) */
  private sweepT0 = -1e9;
  private sweepFrom = 0;
  /** the last turn's returns (they stay on the display until the beam comes round again) */
  private prevRays: SonarReturn[] = [];
  /** the head keeps turning, a ping a turn, until it is switched off */
  private scanning = false;
  private scanSince = 0;
  private heardT = new Map<string, number>();
  private soundT = new Map<string, number>();
  private energy = new Float32Array(360);
  private survey: SurveyState = { show: false, self: 0, sea: 0, ping: 0, contacts: [], progress: 0, blocker: '', energy: null, heading: 0 };
  // the tools
  private scanT = -1;
  private arm: { t: number; attached: boolean } | null = null;
  private plateScanned = false;
  private recorderTaken = false;
  private tagScanned = false;
  private hydrophoneTaken = false;
  private footPinged = false;
  /** what the scanner and the arm are working on */
  private scanWhat: 'plate' | 'tag' = 'plate';
  private armWhat: 'recorder' | 'hydrophone' = 'recorder';
  /** the arm flown by hand, and what the controls ask of it this frame */
  private manip: Manip | null = null;
  private armIn = { reach: 0, side: 0, up: 0 };
  /** samples in the basket this dive */
  private samples: string[] = [];
  /** samples let go of, lying on the bottom */
  private dropped: THREE.Object3D[] = [];
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
  /** silt the wash has stirred but not yet released as puffs */
  private siltAcc = 0;
  /** plankton sparks the hull and the wash have set off but not yet placed */
  private sparkAcc = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private tmp3 = new THREE.Vector3();
  // touch and gamepad: held controls added to the keys, orders as key codes
  private touch: DiveTouch;
  private pad = new DiveGamepad();
  private ctl: ControlTarget;

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
    const dive = this;
    this.ctl = {
      command: (c) => {
        if (dive.active) dive.command(c);
      },
      look: (dx, dy) => dive.lookBy(dx, dy),
      zoom: (k) => {
        dive.camDist = Math.max(5, Math.min(60, dive.camDist * k));
        dive.lastDrag = performance.now();
      },
      get emergency() {
        return dive.emergency;
      },
    };
    this.touch = new DiveTouch(parent, this.ctl);
    window.addEventListener('keydown', (e) => this.onKey(e, true), { capture: true });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { capture: true });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', (e) => {
      if (!this.active || this.paused || this.chartOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('button, .oc-panel, .oc-modal, select, .oct-stick, .oct-pad')) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      // (two fingers zoom: the camera does not turn meanwhile)
      if (!this.touch.pinching) this.lookBy(dx, dy);
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
    // (the menu may have cleared the atlas since the last dive)
    this.atlas.reload();
    this.applySettings();
    this.world.props.resetRecorder();
    // (once the expedition is done the recorder is ashore: a free survey finds the wreck without it)
    this.world.props.recorder.visible = !(mode === 'free' && this.career.completed.includes(MISSION_ID));
    // (likewise K3's hydrophone recorder once the follow-up is done)
    this.world.props.resetK3Hydrophone();
    this.world.props.k3HydrophoneShown = mode === 'pulse' || !this.career.completed.includes(PULSE_ID);
    this.sub = newSubState(HARBOR.berth.x, HARBOR.berth.z, HARBOR.berth.heading);
    this.sub.y = -0.75;
    this.stepper = new FixedStepper(8);
    this.exp = mode === 'expedition' ? new Expedition(0) : mode === 'pulse' ? new PulseMission(0) : null;
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
    this.sweepT0 = -1e9;
    this.prevRays = [];
    this.scanning = false;
    this.clearManip();
    for (const o of this.dropped) o.removeFromParent();
    this.dropped = [];
    this.samples = [];
    for (const c of [...this.world.sub.basket.children]) if (c.name.startsWith('sample-')) c.removeFromParent();
    this.world.life.resetTaken();
    this.heardT.clear();
    this.soundT.clear();
    this.scanT = -1;
    this.arm = null;
    this.plateScanned = false;
    this.recorderTaken = false;
    this.tagScanned = false;
    this.hydrophoneTaken = false;
    this.footPinged = false;
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
    if (this.exp && resume) {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(this.exp.progressKey);
      } catch {
        /* none */
      }
      const c = parseCheckpoint(raw, this.exp.missionId);
      if (c) this.restore(c);
    }
    if (this.exp && !resume) {
      try {
        localStorage.removeItem(this.exp.progressKey);
      } catch {
        /* */
      }
    }
    if (this.exp && !this.safe) this.safe = this.checkpoint();
    this.world.sub.setLights(this.sub.lights);
    this.world.sub.setFloods(this.sub.floods);
    this.world.fill(this.sub.x, this.sub.z);
    this.hud.show(true);
    this.hud.setLarge(this.settings.largeHud);
    const touch = isTouchDevice();
    this.touch.show(touch);
    this.hud.root.classList.toggle('touch', touch);
    this.hud.showCard(null);
    // (no music in a dive: the sea and the hydrophones are the soundtrack)
    this.sound.start();
    this.active = true;
    const title = this.exp ? this.exp.title : 'FREE SURVEY';
    this.hud.flash(this.exp ? (resume ? 'RESUMED' : mode === 'pulse' ? 'FOLLOW-UP' : 'EXPEDITION') : 'KESTREL HARBOR', title, 4);
  }

  stop(): void {
    if (!this.active) return;
    if (this.exp && !this.ended) this.save();
    this.active = false;
    this.hud.show(false);
    this.touch.show(false);
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
      mission: this.exp?.missionId ?? MISSION_ID,
      stage: this.exp?.stage ?? 0,
      sub: { x: s.x, y: s.y, z: s.z, heading: s.heading, ballast: s.ballast, battery: s.battery },
      elapsed: this.elapsed,
      distance: this.track.distance,
      maxDepth: this.maxDepth,
      battery0: this.battery0,
      plateScanned: this.plateScanned,
      recorderTaken: this.recorderTaken,
      tagScanned: this.tagScanned,
      hydrophoneTaken: this.hydrophoneTaken,
      footPinged: this.footPinged,
      second: this.exp?.second ?? null,
      track: this.track.points.slice(),
      t: Date.now(),
    };
  }

  private save(): void {
    if (!this.exp || this.ended) return;
    try {
      localStorage.setItem(this.exp.progressKey, JSON.stringify(this.checkpoint()));
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
    this.tagScanned = !!c.tagScanned;
    this.hydrophoneTaken = !!c.hydrophoneTaken;
    this.footPinged = !!c.footPinged;
    this.track = new TrackRecorder(25);
    this.track.points = c.track.slice();
    this.track.distance = c.distance;
    if (this.recorderTaken) this.stowRecorder();
    if (this.hydrophoneTaken) this.stowHydrophone();
    this.safe = c;
    this.camInit = false;
  }

  /** back to the last stage reached, as it was then */
  private recoverToSafe(): void {
    if (!this.safe) return;
    this.world.props.resetRecorder();
    this.world.props.resetK3Hydrophone();
    this.world.sub.poseArm(0, 0.6);
    this.arm = null;
    this.clearManip();
    this.scanT = -1;
    this.restore(this.safe);
    this.world.fill(this.sub.x, this.sub.z);
    this.setPaused(false);
    this.hud.flash('RECOVERED', 'BACK AT THE LAST SAFE POINT');
  }

  // ------------------------------------------------------------------ input
  /** turn the camera (pixels of drag, or the gamepad's right stick) */
  private lookBy(dx: number, dy: number): void {
    this.lastDrag = performance.now();
    const k = 0.005 * this.settings.lookSpeed;
    if (this.cam === 'dome') {
      this.lookYaw = Math.max(-1.9, Math.min(1.9, this.lookYaw - dx * k));
      this.lookPitch = Math.max(-1.0, Math.min(0.9, this.lookPitch - dy * k));
    } else {
      this.camYaw -= dx * k;
      this.camPitch = Math.max(-0.6, Math.min(1.35, this.camPitch + dy * k));
    }
  }

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
    if (this.command(c)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /** a one-shot order, from a key, a touch button or the gamepad; true if it meant something now */
  private command(c: string): boolean {
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
    else if (c === 'KeyN') this.setScanning(!this.scanning);
    else if (c === 'KeyV') this.toggleArm();
    else if (c === 'KeyO') {
      this.overlay = !this.overlay;
      this.hud.flash('SONAR', this.overlay ? 'OVERLAY ON' : 'OVERLAY OFF', 1.5);
    } else if (c === 'KeyL') {
      this.sub.lights = !this.sub.lights;
      this.world.sub.setLights(this.sub.lights);
      audio.click();
    } else if (c === 'KeyK') {
      this.sub.floods = !this.sub.floods;
      this.world.sub.setFloods(this.sub.floods);
      this.hud.flash('FLOODLIGHTS', this.sub.floods ? 'ON' : 'OFF', 1.2);
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
    } else if (c === 'KeyE') {
      if (this.manip) this.grip();
      else this.use();
    }
    else if (c === 'KeyC') this.cycleCam();
    else if (c === 'Comma' || c === 'Period') this.stepTime(c === 'Period' ? 1 : -1);
    else if (c === 'TimeCycle') this.stepTime(this.timeIdx >= TIME_STEPS.length - 1 ? -this.timeIdx : 1);
    else used = false;
    return used;
  }

  private setQuiet(v: boolean): void {
    // (listening and a turning sonar head do not go together)
    if (v && this.scanning) this.setScanning(false, true);
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
    if (Math.hypot(this.sub.x - K3.x, this.sub.z - K3.z) < 300 && -this.sub.y > 150) return 'NEAR THE SITE: ×1';
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
      el('div', 'sub', c, this.exp ? `${this.exp.title} · stage ${Math.min(this.exp.stage + 1, this.exp.stageCount)} of ${this.exp.stageCount}. Progress is saved at every stage.` : 'Free survey from Kestrel Harbor.');
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
      if (this.exp) btn('RESTART', () => this.start(this.mode, false));
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
    if (id === 'deep-pulse') return this.mode === 'pulse' || this.career.unlocked.includes('deep-pulse');
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
          this.atlas.hear(h.id, def.unknownLabel, def.pattern, h.id === 'knock' ? STORY.heard : PULSE_STORY.heard);
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
        if (!this.atlas.contact(def.id)) this.atlas.hear(def.id, def.unknownLabel, def.pattern, def.id === 'knock' ? STORY.heard : PULSE_STORY.heard);
        const hw = bearingHalfWidth(best.snr);
        const n0 = this.atlas.data.observations.length;
        const measured = measureBearing(best.bearing, hw, n0 * 7919 + Math.round(s.x * 13 + s.z * 7));
        const { fix } = this.atlas.observe({ contactId: def.id, x: s.x, z: s.z, depth: -s.y, bearing: measured, halfWidth: hw, snr: best.snr });
        this.sound.chime();
        const c = this.atlas.contact(def.id)!;
        if (fix) {
          if (def.id === 'knock') this.atlas.interpret(def.id, STORY.located);
          else if (def.id === 'deep-pulse' && c.status !== 'confirmed') this.atlas.interpret(def.id, PULSE_STORY.located);
          this.hud.flash('BEARINGS CROSS', 'SEARCH AREA ON THE CHART', 3.5);
        } else {
          if (def.id === 'knock' && c.interpretations.length < 2) this.atlas.interpret(def.id, STORY.bearing);
          else if (def.id === 'deep-pulse' && c.interpretations.length < 2) this.atlas.interpret(def.id, PULSE_STORY.bearing);
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
    // scanning, the head goes on round from where it is; a single ping starts it at the bow
    const turn = (this.simT - this.sweepT0) / SWEEP_S;
    this.sweepFrom = this.scanning && turn < 1.5 ? (this.sweepFrom + 360 * Math.min(1, turn)) % 360 : s.heading;
    this.sweepT0 = this.simT;
    this.lastPing = this.simT;
    this.pingAt = { x: s.x, z: s.z };
    this.pingOrigin = { x: s.x, y: s.y, z: s.z, heading: s.heading };
    if (this.pingRays.length) this.prevRays = this.pingRays;
    this.pingRays = [];
    this.pingNext = 0;
    this.gauge.reset();
    const alt = s.y - seabedHeight(s.x, s.z);
    this.sound.ping(Math.min(0.5, (2 * Math.max(2, alt)) / 1500 + 0.05));
  }

  /** the scanning sonar on (a ping every turn of the head) or off */
  private setScanning(v: boolean, quietly = false): void {
    if (v && this.quiet) this.setQuiet(false);
    this.scanning = v;
    if (v) {
      this.scanSince = this.simT;
      this.lastPing = -1e9;
      this.ping();
    }
    if (!quietly) this.hud.flash('SCANNING SONAR', v ? 'ON · THE HYDROPHONES ARE MASKED' : 'OFF', 1.8);
    audio.click();
  }

  /** the ping's rays, cast as the head turns past them; each answer goes on the display and the overlay */
  private pingStep(): void {
    if (this.pingNext >= PING_RAYS) return;
    const o = this.pingOrigin;
    const to = Math.min(PING_RAYS, Math.ceil(((this.simT - this.sweepT0) / SWEEP_S) * PING_RAYS));
    if (to <= this.pingNext) return;
    // (the head starts where the turn began and goes clockwise: the rays in its order, wrapping past north)
    const i0 = Math.round(this.sweepFrom / (360 / PING_RAYS));
    const rays: SonarReturn[] = [];
    for (let k = this.pingNext; k < to; ) {
      const a = (i0 + k) % PING_RAYS;
      const n = Math.min(to - k, PING_RAYS - a);
      rays.push(...sonarRays(o.x, o.y, o.z, this.colliders, PING_RAYS, a, a + n, 5));
      k += n;
    }
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
      // small hard returns: K3's float and line, when the ping is made near their depth
      const k3 = this.pingRays.filter((r) => r.kind === 'object' && r.tag.startsWith('k3'));
      if (k3.length && !hard.length) {
        const n = k3.reduce((a, b) => (b.r < a.r ? b : a));
        this.hud.flash('SONAR', `SMALL HARD RETURN · ${String(Math.round(n.b)).padStart(3, '0')}° · ${Math.round(n.r)} M`, 3.5);
      }
      // the multibeam looks down where the boat may not go: the foot of K3's line
      const kc = K3.container;
      if (multibeamSees(o.x, o.y, o.z, kc.x, kc.y, kc.z)) {
        const box: { x: number; y: number; z: number; kind: number; at: number }[] = [];
        const a = (kc.yaw * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        const at = t0 + (o.y - kc.y) / 1500;
        for (let i = -2; i <= 2; i++) {
          for (let j = -5; j <= 5; j++) {
            const lx = (i / 2) * kc.hx, lz = (j / 5) * kc.hz;
            box.push({ x: kc.x + lx * ca - lz * sa, y: kc.y + kc.hy, z: kc.z + lx * sa + lz * ca, kind: 1, at });
          }
        }
        this.world.fx.addSonar(box);
        this.hud.flash('MULTIBEAM', `A ${Math.round(kc.hz * 2)} M BOX ON THE BOTTOM AT ${Math.round(-kc.y)} M`, 3.5);
        if (!this.footPinged && this.atlas.contact('deep-pulse')) this.atlas.interpret('deep-pulse', PULSE_STORY.foot);
        this.footPinged = true;
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
    const pulse = this.exp?.missionId === PULSE_ID;
    // scan K3's tag
    if (pulse && !this.tagScanned && this.exp!.id === 'scan') {
      const p = this.world.props.k3TagWorld(this.tmp);
      if (Math.hypot(s.x - p.x, s.z - p.z) < 30 && Math.abs(s.y - p.y) < 15) {
        const r = toolReady(s.x, s.z, s.heading, speed, p.x, p.z, 8, 45);
        if (!r.ok) return this.hud.flash('SCANNER', r.why, 1.8);
        if (!this.facingTag()) return this.hud.flash('SCANNER', 'GO ROUND: THE TAG FACES NORTH', 2);
        if (Math.abs(s.y - p.y) > 3) return this.hud.flash('SCANNER', 'COME LEVEL WITH THE TAG', 1.8);
        this.scanT = 0;
        this.scanWhat = 'tag';
        this.sound.camera();
        return;
      }
    }
    // take the hydrophone recorder off K3's line
    if (pulse && !this.hydrophoneTaken && this.world.props.k3HydrophoneShown && this.exp!.stage >= PULSE_STAGES.indexOf('recover')) {
      const hp = K3.hydrophone;
      if (Math.hypot(s.x - hp.x, s.z - hp.z) < 30 && Math.abs(s.y - hp.y) < 15) {
        const r = toolReady(s.x, s.z, s.heading, speed, hp.x, hp.z, 4.5, 35);
        if (!r.ok) return this.hud.flash('ARM', r.why, 1.8);
        // (the arm works below and ahead of the boat: the recorder should be level with the skids, or a little below)
        const above = s.y - hp.y;
        if (above > 2.6) return this.hud.flash('ARM', 'GO LOWER: LEVEL WITH THE RECORDER', 2);
        if (above < -0.6) return this.hud.flash('ARM', 'GO HIGHER: LEVEL WITH THE RECORDER', 2);
        this.arm = { t: 0, attached: false };
        this.armWhat = 'hydrophone';
        s.holdPos = { x: s.x, z: s.z, heading: s.heading };
        audio.servo(1.2, 1);
        return;
      }
    }
    // scan the plate
    if (!pulse && !this.plateScanned && (!this.exp || this.exp.id === 'scan')) {
      const p = this.world.props.plateWorld(this.tmp);
      const r = toolReady(s.x, s.z, s.heading, speed, p.x, p.z, 12, 45);
      if (Math.hypot(s.x - p.x, s.z - p.z) < 30) {
        if (!r.ok) return this.hud.flash('SCANNER', r.why, 1.8);
        this.scanT = 0;
        this.scanWhat = 'plate';
        this.sound.camera();
        return;
      }
    }
    // recover the recorder
    if (!pulse && !this.recorderTaken && this.world.props.recorder.visible && (!this.exp || this.exp.id === 'recover' || this.exp.stage > STAGES.indexOf('recover'))) {
      const rp = SITES.recorder;
      const d = Math.hypot(s.x - rp.x, s.z - rp.z);
      if (d < 30) {
        const r = toolReady(s.x, s.z, s.heading, speed, rp.x, rp.z, 5.5, 35);
        const above = s.y - (seabedHeight(rp.x, rp.z) + 0.4);
        if (!r.ok) return this.hud.flash('ARM', r.why, 1.8);
        if (above > 4.2) return this.hud.flash('ARM', 'GO LOWER: THE ARM REACHES 2 M BELOW THE SKIDS', 2);
        this.arm = { t: 0, attached: false };
        this.armWhat = 'recorder';
        s.holdPos = { x: s.x, z: s.z, heading: s.heading };
        audio.servo(1.2, 1);
        return;
      }
    }
  }

  /** the tag is read from in front: the boat must be on its side of the float (within 60° of where it faces) */
  private facingTag(): boolean {
    const s = this.sub, t = K3.tag;
    const dx = s.x - t.x, dz = s.z - t.z;
    // (it faces north, -z)
    return -dz > 0.5 * Math.hypot(dx, dz);
  }

  private stowHydrophone(): void {
    const h = this.world.props.k3Hydrophone;
    this.world.sub.basket.add(h);
    h.position.set(0.2, 0.02, 0);
    h.rotation.set(0, 0, Math.PI / 2);
    h.scale.setScalar(1);
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
      const tag = this.scanWhat === 'tag';
      const p = tag ? this.world.props.k3TagWorld(this.tmp) : this.world.props.plateWorld(this.tmp);
      const r = toolReady(s.x, s.z, s.heading, speedOf(s), p.x, p.z, tag ? 8 : 12, 45);
      const facing = !tag || this.facingTag();
      if (!r.ok || !facing) {
        this.scanT = -1;
        this.hud.flash('SCAN INTERRUPTED', r.ok ? 'GO ROUND: THE TAG FACES NORTH' : r.why, 2);
      } else {
        this.scanT += dt;
        if (this.scanT >= 2 && tag) {
          this.scanT = -1;
          this.tagScanned = true;
          this.photoPending = true;
          this.atlas.addEvidence({ contactId: 'deep-pulse', kind: 'scan', title: 'Mooring tag: KESTREL MARINE LAB · K3', text: 'Photograph of the tag on the top float: KESTREL MARINE LAB, MOORING K3, IF FOUND DO NOT CUT.' });
          if (this.atlas.contact('deep-pulse')) this.atlas.interpret('deep-pulse', PULSE_STORY.tag);
          this.hud.flash('SCANNED', 'MOORING K3 · KESTREL MARINE LAB', 3.5);
        } else if (this.scanT >= 2) {
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
      const hyd = this.armWhat === 'hydrophone';
      const rec = hyd ? this.world.props.k3Hydrophone : this.world.props.recorder;
      if (!a.attached) {
        // reach for the capsule's handle (or the recorder's clamp on the line)
        const tgt = hyd ? m.toBody(this.tmp.set(K3.hydrophone.x, K3.hydrophone.y + 0.1, K3.hydrophone.z)) : m.toBody(this.tmp.set(SITES.recorder.x, rec.getWorldPosition(this.tmp2).y + 0.4, SITES.recorder.z));
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
          this.recovered(hyd);
          m.poseArm(0, 0.6);
          this.arm = null;
          s.holdPos = null;
        }
      }
    }
  }

  /** the recorder (or K3's hydrophone recorder) is in the basket: the record and the story */
  private recovered(hyd: boolean): void {
    this.sound.clunk();
    if (hyd) {
      this.stowHydrophone();
      this.hydrophoneTaken = true;
      this.atlas.addEvidence({ contactId: 'deep-pulse', kind: 'item', title: 'Hydrophone recorder from mooring K3', text: "A grey pressure housing with a hydrophone at one end, unclamped from K3's line 3 m below the top float. It has been recording the basin since the autumn." });
      if (this.atlas.contact('deep-pulse')) this.atlas.confirm('deep-pulse', { x: K3.x, z: K3.z, depth: -K3.pingerY }, 'MOORING K3 · RELOCATION PINGER', PULSE_STORY.recovered);
      this.hud.flash('RECOVERED', 'HYDROPHONE RECORDER', 3.5);
    } else {
      this.stowRecorder();
      this.recorderTaken = true;
      this.atlas.addEvidence({ contactId: 'knock', kind: 'item', title: 'Voyage data recorder capsule', text: 'An orange recorder capsule with its underwater locator beacon (37.5 kHz), still pinging weakly. Recovered from beside the bridge.' });
      if (this.atlas.contact('knock')) this.atlas.confirm('knock', { x: SITES.recorder.x, z: SITES.recorder.z, depth: -seabedHeight(SITES.recorder.x, SITES.recorder.z) }, 'MV ORIEL BAY · VDR BEACON', STORY.recovered);
      this.hud.flash('RECOVERED', 'VOYAGE DATA RECORDER', 3.5);
    }
  }

  // ------------------------------------------------------------------ the arm, by hand
  /** the arm out (the boat holds its place and depth) or, if out, stowed */
  private toggleArm(): void {
    if (this.manip) {
      if (this.manip.stowing < 0 && this.manip.k >= 1) {
        this.manip.stowing = 0;
        this.manip.from.copy(this.manip.tip);
        audio.servo(1.2, 1);
      }
      return;
    }
    if (this.arm || this.scanT >= 0 || this.batteryCard || this.docked) return;
    const s = this.sub;
    if (-s.y < 2) {
      this.hud.flash('ARM', 'DIVE FIRST: THE ARM WORKS UNDER WATER', 1.8);
      return;
    }
    this.manip = { k: 0, tip: ARM_READY.clone(), jaw: 1, held: null, stowing: -1, prevPos: s.holdPos, prevDepth: s.holdDepth, touching: false, from: new THREE.Vector3() };
    s.holdPos = { x: s.x, z: s.z, heading: s.heading };
    if (s.holdDepth === null) {
      s.holdDepth = -s.y;
      s.holdI = 0;
    }
    // (the camera comes down level with the bow to watch the jaw)
    this.camPitch = 0.12;
    audio.servo(1.2, 1);
    this.hud.flash('MANIPULATOR', 'W/S REACH · A/D SWING · R/F UP / DOWN · E GRIP · V STOW', 3.5);
  }

  /** the arm put away at once (a new dive, back to a safe point) */
  private clearManip(): void {
    const a = this.manip;
    if (!a) return;
    if (a.held) {
      if (a.held.what === 'sample') a.held.obj.removeFromParent();
      else if (a.held.what === 'recorder') this.world.props.resetRecorder();
      else this.world.props.resetK3Hydrophone();
    }
    this.manip = null;
    this.world.sub.poseArm(0, 0.6);
  }

  /** what the jaw could close on at a world point */
  private reachable(p: THREE.Vector3, take: boolean): Held | null {
    const pulse = this.exp?.missionId === PULSE_ID;
    // the expedition's recorder, once the expedition has got that far
    if (!pulse && !this.recorderTaken && this.world.props.recorder.visible && (!this.exp || this.exp.id === 'recover' || this.exp.stage > STAGES.indexOf('recover'))) {
      const rec = this.world.props.recorder;
      const y = rec.getWorldPosition(this.tmp3).y + 0.4;
      if (Math.hypot(p.x - SITES.recorder.x, p.y - y, p.z - SITES.recorder.z) < 0.55) return { what: 'recorder', obj: rec, name: 'THE RECORDER', depth: -y };
    }
    // K3's hydrophone recorder
    if (pulse && !this.hydrophoneTaken && this.world.props.k3HydrophoneShown && this.exp!.stage >= PULSE_STAGES.indexOf('recover')) {
      const hp = K3.hydrophone;
      if (Math.hypot(p.x - hp.x, p.y - (hp.y + 0.1), p.z - hp.z) < 0.55) return { what: 'hydrophone', obj: this.world.props.k3Hydrophone, name: 'THE HYDROPHONE RECORDER', depth: -hp.y };
    }
    // something off the bottom
    if (!take) {
      const n = this.world.life.peekNear(p, 0.35);
      return n ? { what: 'sample', obj: this.world.sub.grip, name: SAMPLE_NAMES[n] ?? n.toUpperCase(), depth: -p.y } : null;
    }
    const smp = this.world.life.takeNear(p, 0.35);
    if (!smp) return null;
    this.world.scene.add(smp.mesh);
    return { what: 'sample', obj: smp.mesh, name: SAMPLE_NAMES[smp.name] ?? smp.name.toUpperCase(), depth: smp.depth };
  }

  /** E with the arm out: close the jaw on what is between it, or let go */
  private grip(): void {
    const a = this.manip!;
    if (a.k < 1 || a.stowing >= 0) return;
    const m = this.world.sub;
    if (a.held) {
      if (a.held.what !== 'sample') {
        this.hud.flash('ARM', 'V PUTS IT IN THE BASKET', 1.8);
        return;
      }
      // let go: it falls back to the bottom
      const o = a.held.obj;
      this.world.scene.attach(o);
      o.position.y = seabedHeight(o.position.x, o.position.z);
      this.dropped.push(o);
      a.held = null;
      a.jaw = 1;
      audio.servo(0.5, 0.7);
      return;
    }
    if (a.jaw < 0.5) {
      a.jaw = 1;
      audio.servo(0.5, 0.7);
      return;
    }
    const held = this.reachable(m.grip.getWorldPosition(this.tmp), true);
    audio.servo(0.6, 0.8);
    if (!held) {
      a.jaw = 0;
      return;
    }
    a.held = held;
    a.jaw = 0.18;
    m.grip.attach(held.obj);
    this.sound.clunk();
  }

  /** the arm, each frame: out, flown, or on its way back to the basket */
  private manipStep(dt: number): void {
    const a = this.manip;
    if (!a) return;
    const m = this.world.sub;
    const s = this.sub;
    if (a.stowing < 0) {
      a.k = Math.min(1, a.k + dt / 1.4);
      if (a.k >= 1) {
        moveArmTarget(a.tip, m.shoulderAt, this.armIn, dt);
        // not into the bottom: the jaw rests on it, and stirs it
        const w = m.toWorld(this.tmp.copy(a.tip));
        const g = seabedHeight(w.x, w.z) + 0.06;
        if (w.y < g) {
          w.y = g;
          a.tip.copy(m.toBody(w));
          if (!a.touching) {
            const kind = groundAt(w.x, w.z, g);
            if (kind === 'sand' || kind === 'silt') this.world.silt.emit(w.x, g, w.z, 3, 0, 0, kind === 'silt');
          }
          a.touching = true;
        } else a.touching = false;
      }
    } else {
      // back to the basket: over it, open the jaw, then fold
      a.stowing += dt;
      const over = this.tmp2.copy(m.basketAt).add(this.tmp.set(0, 0.45, -0.05));
      if (a.held) {
        const f = Math.min(1, a.stowing / 1.6);
        a.tip.lerpVectors(a.from, over, f * f * (3 - 2 * f));
        if (f >= 1) {
          const h = a.held;
          a.held = null;
          a.jaw = 1;
          if (h.what === 'sample') {
            m.basket.attach(h.obj);
            h.obj.position.set((Math.random() - 0.5) * 0.8, -0.1, (Math.random() - 0.5) * 0.35);
            this.samples.push(h.name);
            this.atlas.addEvidence({ contactId: null, kind: 'item', title: `Sample: ${h.name.toLowerCase()} from ${Math.round(h.depth)} m`, text: `Taken off the bottom with the arm at ${Math.round(h.depth)} m and stowed in the sample basket.` });
            this.hud.flash('IN THE BASKET', `${h.name} · ${this.samples.length} SAMPLE${this.samples.length > 1 ? 'S' : ''}`, 2.5);
            this.sound.clunk();
          } else this.recovered(h.what === 'hydrophone');
          a.stowing = 0;
          a.from.copy(a.tip);
        }
      } else {
        a.k = Math.max(0, a.k - dt / 1.4);
        if (a.k <= 0) {
          this.manip = null;
          m.poseArm(0, 0.6);
          s.holdPos = a.prevPos;
          s.holdDepth = a.prevDepth;
          return;
        }
      }
    }
    m.setArmTarget(a.tip);
    m.poseArm(a.k, a.jaw);
  }

  /** the sonar display: this turn's returns over the last turn's, and where the beam is */
  private scopeView(): ScopeView {
    const el = this.simT - this.sweepT0;
    const going = this.scanning || el < SWEEP_S;
    const turn = Math.max(0, Math.min(1, el / SWEEP_S));
    const span = Math.min(1, Math.max(0, (this.scanning ? this.simT - this.scanSince : el) / SWEEP_S));
    return {
      returns: this.scanning ? this.prevRays.concat(this.pingRays) : this.pingRays,
      deg: this.sweepFrom + 360 * turn,
      span: span * 360,
      lead: going,
      // (the display fades more slowly than the overlay: it is the instrument)
      k: el < 0 ? 0 : going ? 1 : Math.max(0, 1 - (el - SWEEP_S) / 12),
      heading: this.sub.heading,
      range: SONAR_RANGE,
      scanning: this.scanning,
    };
  }

  /** the scanning sonar's sweep, for the overlay, the display and the head on the deck */
  private updateSweep(): void {
    const el = this.simT - this.sweepT0;
    const turn = Math.max(0, Math.min(1, el / SWEEP_S));
    const going = this.scanning || el < SWEEP_S;
    const deg = this.sweepFrom + 360 * turn;
    const span = Math.min(1, Math.max(0, (this.scanning ? this.simT - this.scanSince : el) / SWEEP_S));
    const k = !this.overlay || el < 0 ? 0 : going ? 1 : Math.max(0, 1 - (el - SWEEP_S) / 4);
    const o = this.pingOrigin;
    OCEAN_FX.uSweep.value.set(o.x, o.z, deg * DEG, SONAR_RANGE);
    OCEAN_FX.uSweepY.value = o.y;
    OCEAN_FX.uSweepSpan.value = span * Math.PI * 2;
    OCEAN_FX.uSweepLead.value = going ? 1 : 0;
    OCEAN_FX.uSweepK.value = k;
    this.world.sub.setSonarHead((deg - this.sub.heading) * DEG);
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
    if (this.exp?.missionId === PULSE_ID) return this.finishPulse();
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
      localStorage.removeItem(this.exp!.progressKey);
    } catch {
      /* */
    }
    if (fresh) {
      const dp = CONTACTS.find((c) => c.id === 'deep-pulse')!;
      this.atlas.hear(dp.id, dp.unknownLabel, dp.pattern, "Found on the recorder's last minutes, and on the harbor hydrophone log since: a slow, low pulse from far out in the deep basin. Follow it up from the MISSIONS page.");
    }
    const mm = (x: number) => `${Math.floor(x / 60)} min ${String(Math.round(x % 60)).padStart(2, '0')} s`;
    this.hud.showCard((c) => {
      el('h2', '', c, 'DEBRIEF');
      el('div', 'sub', c, MISSION_TITLE);
      const g = el('div', 'oc-deb', c);
      const l = el('div', '', g);
      el('p', '', l, 'Three weeks ago the coaster MV ORIEL BAY stopped answering in a winter gale off Kestrel. Nothing was found on the surface.');
      el('p', '', l, 'Your bearings on a faint double knock crossed over the slope. Sonar showed a hull; your lamps found her upright at 85 m, bow broken off. The stern plate confirmed her name, and the knock was her voyage data recorder\'s locator beacon, nearly flat.');
      el('p', '', l, "The recorder is ashore with the investigators. Its last minutes, and the harbor's own hydrophone log, carry something else: a slow, low pulse from the deep basin. It is in your Echo Atlas, and THE SLOW PULSE is open on the MISSIONS page.");
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

  /** the follow-up's end: what K3 was, what lay at its foot, and what its recorder heard */
  private finishPulse(): void {
    this.ended = true;
    const pc = this.atlas.contact('deep-pulse');
    const fixErr = pc?.estimate ? Math.hypot(pc.estimate.x - K3.x, pc.estimate.z - K3.z) : null;
    const bearings = this.atlas.data.observations.filter((o) => o.contactId === 'deep-pulse').length;
    this.atlas.addExpedition({ mission: PULSE_ID, t: Date.now(), durationS: this.elapsed, distanceM: this.track.distance, maxDepth: this.maxDepth, bearings, fixErrorM: fixErr, batteryUsed: this.battery0 - this.sub.battery, recovered: this.hydrophoneTaken ? ['Hydrophone recorder (K3)'] : [] });
    this.track.add(this.sub.x, this.sub.z, Math.max(0, -this.sub.y));
    this.atlas.addTrack({ mission: PULSE_ID, t: Date.now(), points: this.track.points });
    if (!this.career.completed.includes(PULSE_ID)) this.career.completed.push(PULSE_ID);
    try {
      localStorage.setItem(CAREER_KEY, JSON.stringify(this.career));
      localStorage.removeItem(this.exp!.progressKey);
    } catch {
      /* */
    }
    const mm = (x: number) => `${Math.floor(x / 60)} min ${String(Math.round(x % 60)).padStart(2, '0')} s`;
    this.hud.showCard((c) => {
      el('h2', '', c, 'DEBRIEF');
      el('div', 'sub', c, PULSE_TITLE);
      const g = el('div', 'oc-deb', c);
      const l = el('div', '', g);
      el('p', '', l, "The slow pulse on ORIEL BAY's recorder was not hers. Your bearings crossed over the deep basin, and 282 m down your lamps found the top float of the Kestrel Marine Lab's current-meter mooring K3.");
      el('p', '', l, "K3's relocation pinger only starts when the mooring is knocked over. The multibeam showed why: a 20-foot container lying across the line at the anchor, 339 m down, past PETREL's rating.");
      el('p', '', l, "The lab played back the hydrophone recorder you brought up. On the night of the gale it heard a ship's engine pass overhead, a heavy splash, and the mooring jerk as the container came down across its line. ORIEL BAY was already losing her deck cargo over the basin, before she went down on the slope. The investigators now know where it began.");
      const r = el('div', '', g);
      if (this.photo) {
        const im = el('img', '', r) as HTMLImageElement;
        im.src = this.photo;
        im.alt = "Photograph of K3's tag";
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
    // the keys, the touch controls and a gamepad together, each control within -1..1
    const t = this.touch.analog, g = this.pad.analog;
    const sum = (key: number, f: 'thrust' | 'yaw' | 'vertical' | 'lateral' | 'ballast') => Math.max(-1, Math.min(1, key + t[f] + g[f]));
    const thrust = sum(Math.max(-1, Math.min(1, k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'))), 'thrust');
    const yaw = sum(k('KeyD') - k('KeyA'), 'yaw');
    const vertical = sum(k('KeyR') - k('KeyF'), 'vertical');
    // with the arm out the same controls fly the jaw, and the boat holds still
    this.armIn.reach = this.manip ? thrust : 0;
    this.armIn.side = this.manip ? yaw : 0;
    this.armIn.up = this.manip ? vertical : 0;
    const busy = !!this.arm || !!this.manip;
    return {
      thrust: busy ? 0 : thrust,
      yaw: busy ? 0 : yaw,
      vertical: busy ? 0 : vertical,
      lateral: busy ? 0 : sum(k('ArrowRight') - k('ArrowLeft'), 'lateral'),
      ballast: sum(k('KeyZ') - k('KeyX'), 'ballast'),
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

  private ctx(): PulseCtx {
    const s = this.sub;
    const knock = this.atlas.contact('knock');
    return {
      pulse: this.atlas.contact('deep-pulse'),
      pulseBearings: this.atlas.data.observations.filter((o) => o.contactId === 'deep-pulse').length,
      lamps: s.lights,
      tagScanned: this.tagScanned,
      hydrophoneTaken: this.hydrophoneTaken,
      footPinged: this.footPinged,
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
    this.pad.poll(dt, this.ctl, !frozen && !this.batteryCard);
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
      this.stirBottom(sdt);
      this.disturbPlankton(sdt);
      this.listenStep(sdt);
      // scanning: the next turn begins as the last one ends
      if (this.scanning && this.pingNext >= PING_RAYS && this.simT - this.sweepT0 >= SWEEP_S) this.ping();
      this.pingStep();
      this.toolStep(sdt);
      this.manipStep(sdt);
      // the expedition
      if (this.exp && !this.exp.done) {
        const moved = this.exp.update(this.ctx());
        if (moved) {
          if (this.exp.lastNote === 'A wreck in the lights' && this.atlas.contact('knock')) this.atlas.interpret('knock', STORY.found);
          if (this.exp.lastNote === 'A mooring float in the lamps' && this.atlas.contact('deep-pulse')) this.atlas.interpret('deep-pulse', PULSE_STORY.found);
          this.hud.flash(`STAGE ${this.exp.stage} OF ${this.exp.stageCount}`, this.exp.lastNote.toUpperCase(), 3);
          this.sound.chime();
          this.safe = this.checkpoint();
          this.save();
          if (this.exp.done) this.finish();
        }
      }
      // checkpoints now and then, and the regions as they are reached
      this.saveT += dt;
      if (this.saveT > 20 && !this.arm && !this.manip) {
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
    this.updateSweep();
    this.world.update(dt, h, { x: s.x + Math.sin(fwd) * 60 + s.vx * 8, z: s.z - Math.cos(fwd) * 60 + s.vz * 8 }, { lamps: s.lights, floods: s.floods, overlay: this.overlay, boat: { x: s.x, z: s.z, speed: Math.hypot(s.vx, s.vz), surfaced: -s.y < 1.2 }, time: s.t });
    // the eye adapts: quickly to light, more slowly to the dark
    const want = this.world.exposureFor(s.lights || s.floods);
    const k = want > this.exposure ? 0.7 : 2.2;
    this.exposure += (want - this.exposure) * Math.min(1, dt * k);
    this.world.fx.setExposure(this.exposure);
    this.host.draw(this.world.scene, cam, this.exposure);
    if (this.photoPending) this.takePhoto();
    this.updateHud(dt, w, h);
    this.sound.update({ depth: -s.y, surfaced: -s.y < 1.2, thrust: s.out.thrust, vertical: s.out.vertical, lateral: s.out.lateral, pumping: s.out.pumping, quiet: this.quiet, listening: this.quiet, paused: this.paused || this.ended });
  }

  /**
   * The thrusters' wash on the bottom: the stern jets blow aft (or forward when
   * going astern), the vertical ones push water down when the boat climbs. Close
   * to sand or mud it lifts the sediment; rock and reef stay clear.
   */
  private stirBottom(dt: number): void {
    const s = this.sub;
    if (-s.y < 2 || dt <= 0) return;
    const ground = seabedHeight(s.x, s.z);
    const alt = s.y - 1.4 - ground;
    if (alt > 3.5) return;
    const o = s.out;
    const near = 1 - Math.max(0, alt) / 3.5;
    const stir = (Math.abs(o.thrust) + Math.max(0, o.vertical) * 1.8 + Math.abs(o.lateral) * 0.6) * near;
    if (stir < 0.05) return;
    this.siltAcc += stir * dt * 30;
    const m = this.world.sub;
    const back = o.thrust >= 0 ? 1 : -1;
    while (this.siltAcc >= 1) {
      this.siltAcc -= 1;
      // where this puff starts: in the stern jets' wash, or under the boat for the vertical ones
      const vertical = Math.random() * stir < Math.max(0, o.vertical) * 1.8 * near;
      const w = vertical ? m.toWorld(this.tmp.set((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 3)) : m.toWorld(this.tmp.set((Math.random() - 0.5) * 1.6, 0, back * (3 + Math.random() * 2)));
      const g = seabedHeight(w.x, w.z);
      const kind = groundAt(w.x, w.z, g);
      if (kind === 'rock' || kind === 'reef' || kind === 'land' || kind === 'quay') continue;
      // pushed away from the jet
      const dx = w.x - s.x, dz = w.z - s.z, dl = Math.hypot(dx, dz) || 1;
      this.world.silt.emit(w.x, g + 0.15, w.z, 1, (dx / dl) * 0.7, (dz / dl) * 0.7, kind === 'silt');
    }
  }

  /**
   * In dark water the plankton flash where the hull pushes through them and in
   * the thrusters' wash. Faint: seen only once the daylight has gone (the deep,
   * or the slope at night with the lamps off), as the eye opens up.
   */
  private disturbPlankton(dt: number): void {
    const dark = 1 - Math.min(1, this.world.ambient / 0.004);
    if (dark <= 0 || !this.world.under || dt <= 0) return;
    const s = this.sub, o = s.out;
    const speed = speedOf(s);
    this.sparkAcc += (speed * 90 + Math.abs(o.thrust) * 120 + Math.abs(o.vertical) * 60 + Math.abs(o.lateral) * 40) * dt;
    const m = this.world.sub;
    const back = o.thrust >= 0 ? 1 : -1;
    let n = 0;
    while (this.sparkAcc >= 1 && n++ < 60) {
      this.sparkAcc -= 1;
      let w: THREE.Vector3;
      if (Math.random() < 0.65) {
        // on the hull's skin, more of them toward the bow (where it meets the water)
        const a = Math.random() * Math.PI * 2;
        const zz = -3 + Math.pow(Math.random(), 1.6) * 6;
        const r = Math.sqrt(Math.max(0.05, 1 - (zz / 3.2) ** 2));
        w = m.toWorld(this.tmp.set(Math.cos(a) * 1.15 * r, Math.sin(a) * 1.1 * r, zz));
      } else {
        // in the stern jets' wash
        w = m.toWorld(this.tmp.set(1.2 * (Math.random() < 0.5 ? -1 : 1) + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, back * (2.8 + Math.random() * 3)));
      }
      this.world.biolum.spark(w.x, w.y, w.z, this.world.t, 0.13 * dark);
    }
    this.sparkAcc = Math.min(this.sparkAcc, 60);
  }

  private onBump(b: { speed: number; tag: string; severity: 'light' | 'hard' }): void {
    // touching the bottom raises a cloud
    if (b.tag === 'seabed' && b.speed > 0.1) {
      const g = seabedHeight(this.sub.x, this.sub.z);
      const kind = groundAt(this.sub.x, this.sub.z, g);
      if (kind === 'sand' || kind === 'silt') this.world.silt.emit(this.sub.x, g + 0.1, this.sub.z, Math.min(14, 3 + Math.round(b.speed * 20)), 0, 0, kind === 'silt');
    }
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
      const task = !!this.arm || this.scanT >= 0 || !!this.manip;
      const free = performance.now() - this.lastDrag > 4000 && !this.drag;
      if (free) {
        // (the hand-flown arm is watched from starboard and a little ahead, its side of the bow, low enough to see under it)
        const target = this.manip ? -1.9 : task ? 2.3 : 0;
        this.camYaw += (target - this.camYaw) * Math.min(1, dt * (task ? 1.2 : 0.6));
      }
      const yaw = p.heading * DEG + this.camYaw;
      const d = this.manip ? Math.min(this.camDist, 5) : task ? Math.min(this.camDist, 8) : this.camDist;
      const pitch = this.manip ? Math.max(-0.1, Math.min(0.3, this.camPitch)) : task ? Math.max(this.camPitch, 0.35) : this.camPitch;
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
      if (this.manip) {
        // between the boat and the jaw
        const j = m.grip.getWorldPosition(this.tmp2);
        cam.lookAt((p.x + j.x) / 2, (p.y + 0.8 + j.y) / 2, (p.z + j.z) / 2);
      } else cam.lookAt(p.x, p.y + 0.8, p.z);
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
      const tag = this.scanWhat === 'tag';
      this.atlas.addEvidence({ contactId: tag ? 'deep-pulse' : 'knock', kind: 'photo', title: tag ? "Photograph: K3's top float and tag" : 'Photograph: the stern of the wreck', text: "Taken by the pilot's camera during the scan.", image: this.photo });
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
      kicker = `${this.exp.title} · ${stage + 1}/${this.exp.stageCount}`;
    } else if (this.exp) {
      task = 'Expedition complete';
      hint = '';
      stage = this.exp.stageCount;
      kicker = this.exp.title;
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
    if (s.floods) tags.push(['FLOODS', 'on']);
    if (this.scanning) tags.push(['SCANNING', 'on']);
    if (this.manip) tags.push(['ARM', 'on']);
    if (this.samples.length) tags.push([`SAMPLES ${this.samples.length}`, '']);
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
    this.touch.setAway(this.paused || this.ended || this.chartOpen || this.batteryCard);
    this.touch.sync({ quiet: this.quiet, lamps: s.lights, floods: s.floods, arm: !!this.manip, scan: this.scanning, holdDepth: s.holdDepth !== null, holdPos: !!s.holdPos, overlay: this.overlay, time: TIME_STEPS[this.timeIdx], emergency: this.emergency });
    this.hud.update(
      {
        kicker,
        task,
        hint,
        stage,
        stages: this.exp ? this.exp.stageCount : 0,
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
    const view = this.scopeView();
    this.hud.updateSurvey(this.survey, this.pingRays.length ? { view, age } : null, dt);
    this.hud.updateScope(view.k > 0 ? view : null);
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
    if (this.manip) {
      const a = this.manip;
      if (a.stowing >= 0) return [a.held ? 'INTO THE BASKET' : 'STOWING THE ARM', false];
      if (a.k < 1) return ['ARM COMING OUT · HOLDING POSITION', false];
      if (a.held) return [a.held.what === 'sample' ? `HOLDING ${a.held.name} · V BASKET · E LET GO` : `HOLDING ${a.held.name} · V PUTS IT IN THE BASKET`, false];
      const near = this.reachable(this.world.sub.grip.getWorldPosition(this.tmp2), false);
      if (near) return [`E · GRIP ${near.name}`, false];
      return [a.jaw < 0.5 ? 'JAW CLOSED · E OPENS IT' : 'W/S REACH · A/D SWING · R/F UP / DOWN · E GRIP · V STOW', false];
    }
    if (Math.hypot(s.x - HARBOR.berth.x, s.z - HARBOR.berth.z) < 16 && -s.y < 1.6) {
      if (this.exp && this.exp.id !== 'dock') return ['', false];
      return speed > 0.7 ? ['SLOW DOWN TO DOCK', true] : ['E · DOCK AT THE BERTH', false];
    }
    const pulse = this.exp?.missionId === PULSE_ID;
    if (pulse && !this.tagScanned && this.exp!.id === 'scan') {
      const p = this.world.props.k3TagWorld(this.tmp2);
      if (Math.hypot(s.x - p.x, s.z - p.z) < 30 && Math.abs(s.y - p.y) < 15) {
        const r = toolReady(s.x, s.z, s.heading, speed, p.x, p.z, 8, 45);
        if (!r.ok) return [r.why, true];
        if (!this.facingTag()) return ['GO ROUND: THE TAG FACES NORTH', true];
        return Math.abs(s.y - p.y) > 3 ? ['COME LEVEL WITH THE TAG', true] : ['E · SCAN THE TAG', false];
      }
    }
    if (pulse && !this.hydrophoneTaken && this.world.props.k3HydrophoneShown && this.exp!.id === 'recover') {
      const hp = K3.hydrophone;
      if (Math.hypot(s.x - hp.x, s.z - hp.z) < 30 && Math.abs(s.y - hp.y) < 15) {
        const r = toolReady(s.x, s.z, s.heading, speed, hp.x, hp.z, 4.5, 35);
        if (!r.ok) return [r.why, true];
        const above = s.y - hp.y;
        if (above > 2.6) return ['GO LOWER: LEVEL WITH THE RECORDER', true];
        if (above < -0.6) return ['GO HIGHER: LEVEL WITH THE RECORDER', true];
        return ['E · TAKE THE RECORDER WITH THE ARM', false];
      }
    }
    if (!pulse && !this.plateScanned && (!this.exp || this.exp.id === 'scan')) {
      const pl = this.world.props.plateWorld(this.tmp2);
      if (Math.hypot(s.x - pl.x, s.z - pl.z) < 30) {
        const r = toolReady(s.x, s.z, s.heading, speed, pl.x, pl.z, 12, 45);
        return r.ok ? ['E · SCAN THE PLATE', false] : [r.why, true];
      }
    }
    if (!pulse && !this.recorderTaken && this.world.props.recorder.visible && (!this.exp || this.exp.id === 'recover')) {
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
