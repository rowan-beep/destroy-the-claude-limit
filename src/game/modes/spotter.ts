// AIRSHOW: a game for people who love jets, without flying one. You stand at the
// crowd line of an airbase with a camera and a long zoom lens while every jet in
// the game flies its display in front of you: the takeoff into a vertical climb,
// the high-speed pass with its vapour cone, the rolling pass, the max-g turn, the
// slow high-alpha pass (a cobra for the thrust-vectoring jets) and the landing.
// Photograph them. Each picture is scored on how well the jet fills and sits in the
// frame, how sharp it is (pan with it: at 600 mm a jet passing at 600 kt crosses the
// frame in a blink) and the moment caught (the afterburners lit, the vapour cone, the
// top side in a hard turn...). The best shots go in the album, every kind of shot of
// every jet in the spotter's logbook, and the points build up through the ranks,
// each bringing a longer lens.

import * as THREE from 'three';
import { GameMode, ModeStatus, ResultButton } from './mode';
import { Aircraft } from '../../aircraft/aircraft';
import { AIRCRAFT_TYPES, AircraftType, SPECS } from '../../aircraft/specs';
import { AIRFIELD_BY_ID, AirfieldDef, airfieldsOf, fromRunwayLocal } from '../../world/islands';
import { surfaceHeight } from '../../world/terrain';
import { buildDisplay, DisplayJet, DisplayRoutine } from '../airshow';
import { AirshowScene, BARRIER_Z, SpotFence } from '../airshowScene';
import { SHOTS, RANKS, PhotoMeta, loadSpotterLog, saveSpotterLog, rankOf, savePhoto, SpotterLog } from '../spotterBook';
import { audio, OtherJetSound } from '../../audio/audio';
import type { Input } from '../../core/input';

const D2R = Math.PI / 180;
/** the sensor's height (full frame, 24 mm): the field of view from the focal length */
const SENSOR_H = 24;
export const fovFor = (mm: number) => (2 * Math.atan(SENSOR_H / 2 / mm)) / D2R;
/** the shutter: fast enough to freeze a jet, slow enough that panning matters */
const EXPOSURE = 1 / 500;
const _cam = new THREE.PerspectiveCamera();
const _v = new THREE.Vector3();
const _zero = new THREE.Vector3();

/** where the spotter can stand (runway-local metres), what it is good for, and the rank it takes */
export interface Spot {
  id: string;
  name: string;
  note: string;
  along: number;
  across: number;
  /** the way to look at first: runway-local heading (rad, 0 = down the runway, +pi/2 = across it) */
  look: number;
  pitch: number;
  rank: number;
}

/** where along the runway the show is centred (and the crowd stands) */
const SHOW_CENTRE = -150;
/** the static display: the first jet along the runway, the spacing, and how far back from the barrier */
const STATIC_AT = SHOW_CENTRE - 230;
const STATIC_GAP = 58;
const STATIC_ACROSS = BARRIER_Z - 84;

export interface ShotResult {
  meta: PhotoMeta;
  url: string;
  newTags: string[];
  points: number;
  rankUp: string | null;
  notes: string[];
}

export class SpotterMode extends GameMode {
  /** the field and where the crowd stands */
  field!: AirfieldDef;
  readonly eye = new THREE.Vector3();
  yaw = 0;
  pitch = 0.08;
  /** focal length (mm) */
  focal = 70;
  track = false;
  grid = true;
  /** show speed (the display's clock) */
  showSpeed = 1;
  /** the programme: one jet after another */
  acts: AircraftType[] = [];
  actI = -1;
  jet: DisplayJet | null = null;
  private gap = 0;
  private routines = new Map<AircraftType, DisplayRoutine>();
  log: SpotterLog = loadSpotterLog();
  /** the shot just taken (for the UI) */
  lastShot: ShotResult | null = null;
  shotSeq = 0;
  private wantShot = false;
  private burstT = 0;
  /** the jet's motion across the frame (px/s) */
  readonly screenVel = new THREE.Vector2();
  /** the view's own turn rate (rad/s, smoothed), for panning */
  private prevYaw = 0;
  private prevPitch = 0;
  private panYaw = 0;
  private panPitch = 0;
  private flash = 0;
  /** dragging the view with the mouse */
  private drag: { id: number; x: number; y: number; moved: number; btn: number } | null = null;
  private listeners: [string, (e: Event) => void][] = [];
  canvas: HTMLCanvasElement | null = null;
  /** the UI asks to open the album */
  onToggleAlbum: (() => void) | null = null;
  albumOpen = false;
  /** the crowd, the barriers, the marquees */
  private grounds: AirshowScene | null = null;
  /** the static display behind the crowd (the spotter's own pick among them) */
  statics: Aircraft[] = [];
  spots: Spot[] = [];
  spotI = 0;
  /** the display clock against ours, last frame (for the shutter's blur) */
  private clock = 1;

  start(): void {
    const h = this.host;
    const cfg = h.config;
    // the field: the one picked for free flight if it is a land base, else the first
    const pick = AIRFIELD_BY_ID[cfg.freeBase];
    this.field = pick && !pick.carrier ? pick : airfieldsOf('blue').find((f) => !f.carrier) ?? Object.values(AIRFIELD_BY_ID).find((f) => !f.carrier)!;
    const f = this.field;
    // the places to shoot from: the crowd line, the fence under the landing approach, the runway end
    const half = f.length / 2;
    this.spots = [
      { id: 'crowd', name: 'CROWD LINE', note: 'Show centre, on the barrier: every pass right in front of you', along: SHOW_CENTRE, across: BARRIER_Z - 1.2, look: Math.PI / 2 + 0.25, pitch: 0.04, rank: 0 },
      { id: 'static', name: 'STATIC PARK', note: 'The parked jets behind the crowd: portraits up close', along: STATIC_AT + 1.5 * STATIC_GAP, across: BARRIER_Z - 38, look: -Math.PI / 2, pitch: -0.03, rank: 0 },
      { id: 'fence', name: 'LANDING FENCE', note: 'Under the approach: the jets land right over your head', along: half + 330, across: -42, look: 0, pitch: 0.12, rank: 1 },
      { id: 'end', name: 'RUNWAY END', note: 'Behind the takeoff roll: afterburners from behind', along: -half - 260, across: -58, look: 0, pitch: 0.03, rank: 3 },
    ];
    const fences: SpotFence[] = [
      { along: half + 327, across: -42, face: Math.PI, len: 40 },
      { along: -half - 257, across: -58, face: 0, len: 40 },
    ];
    this.grounds = new AirshowScene(f, SHOW_CENTRE, SHOW_CENTRE, fences, this.spots.map((x) => [x.along, x.across] as [number, number]));
    h.scene?.add(this.grounds.group);
    // the static display behind the crowd: the spotter's own pick (the game's "player" jet:
    // it never flies) and three more, parked nose-in toward the crowd
    const p = h.createPlayer();
    const pool = AIRCRAFT_TYPES.filter((t) => t !== 'X15' && t !== cfg.aircraft);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.host.sim.add(p);
    const parked: Aircraft[] = [p];
    for (const t of pool.slice(0, 3)) {
      const a = new Aircraft(t, 'blue', 'STATIC');
      this.host.sim.add(a);
      parked.push(a);
    }
    parked.forEach((a, i) => {
      a.scripted = true;
      a.crewless = true;
      const c = fromRunwayLocal(f, STATIC_AT + i * STATIC_GAP, STATIC_ACROSS);
      a.fm.setOnGround(new THREE.Vector3(c.x, f.elev, c.z), (f.heading + 90 + (i % 2 ? -28 : 28) + 360) % 360);
      for (let k = 0; k < a.fm.rpm.length; k++) a.fm.rpm[k] = 0;
    });
    this.statics = parked;
    // visitors round the parked jets (by the wingtips and the noses, clear of the view to them)
    const visitors: { a: number; c: number; rot: number }[] = [];
    parked.forEach((_, i) => {
      const a0 = STATIC_AT + i * STATIC_GAP;
      for (let k = 0; k < 7; k++) {
        const side = k % 2 ? 1 : -1;
        visitors.push({ a: a0 + side * (11 + Math.random() * 12), c: STATIC_ACROSS + (Math.random() - 0.3) * 20, rot: Math.PI + (Math.random() - 0.5) * 2.5 });
      }
    });
    this.grounds.addPeople(visitors);
    this.spotI = 0;
    this.goTo(0);
    // the programme: the jet picked in the menu first, then everyone else
    const first: AircraftType = cfg.aircraft === 'X15' ? 'F22' : cfg.aircraft;
    const rest = AIRCRAFT_TYPES.filter((t) => t !== first && t !== 'X15');
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.acts = [first, ...rest];
    this.actI = -1;
    this.focal = 70;
    // (auto-track on to begin with: the show is easy to find; pan by hand for the best pictures)
    this.track = true;
    this.nextAct();
    h.order(
      `AIRSHOW AT ${f.name.toUpperCase()}`,
      `You're on the crowd line with a camera. ${SPECS[first].name} opens the show. DRAG to look round, WHEEL to zoom, CLICK or SPACE to take a picture. Pan with the jet to keep it sharp. T: auto-track · G: grid · N: next act · F: show speed · TAB: the album.`,
      14,
    );
  }

  /** the heading (yaw, rad) from the crowd straight across the runway */
  private headingAcross(): number {
    const f = this.field;
    // the camera looks along (-sin yaw, -cos yaw): turn that onto the runway's right-hand side
    return Math.atan2(-f.rxv, -f.rzv);
  }

  /** the spots this rank can use */
  spotOpen(i: number): boolean {
    return rankOf(this.log.points).i >= (this.spots[i]?.rank ?? 99);
  }

  /** walk to a spot */
  goTo(i: number): void {
    const s = this.spots[i];
    if (!s) return;
    this.spotI = i;
    const f = this.field;
    const e = fromRunwayLocal(f, s.along, s.across);
    this.eye.set(e.x, surfaceHeight(e.x, e.z) + 1.7, e.z);
    const dx = f.ax * Math.cos(s.look) + f.rxv * Math.sin(s.look), dz = f.az * Math.cos(s.look) + f.rzv * Math.sin(s.look);
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = s.pitch;
    // (a walk, not a swing of the camera: no pan to blur the next picture)
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    this.panYaw = this.panPitch = 0;
  }

  /** the next spot this rank allows */
  nextSpot(): void {
    for (let k = 1; k < this.spots.length; k++) {
      const i = (this.spotI + k) % this.spots.length;
      if (this.spotOpen(i)) {
        this.goTo(i);
        const s = this.spots[i];
        this.host.message(`${s.name}: ${s.note}`, 'info', 4);
        return;
      }
    }
    // nowhere else yet: say what opens the next one
    const locked = this.spots.find((_, i) => !this.spotOpen(i));
    if (locked) this.host.message(`${locked.name} opens at ${RANKS[locked.rank].name} (${RANKS[locked.rank].pts.toLocaleString('en-US')} points)`, 'info', 4);
  }

  private routine(t: AircraftType): DisplayRoutine {
    let r = this.routines.get(t);
    if (!r) {
      r = buildDisplay(t, this.field);
      this.routines.set(t, r);
    }
    return r;
  }

  /** the next act on: the jet lines up on the runway */
  nextAct(): void {
    const sim = this.host.sim;
    if (this.jet) {
      sim.remove(this.jet.ac);
      this.jet = null;
    }
    this.actI = (this.actI + 1) % this.acts.length;
    const type = this.acts[this.actI];
    const ac = new Aircraft(type, 'blue', `DISPLAY ${this.actI + 1}`);
    ac.scripted = true;
    const jet = new DisplayJet(ac, this.routine(type), this.field);
    // (flown along its path inside the physics step, so it is drawn as smoothly as any jet)
    ac.script = (dt) => {
      if (jet.done) return;
      // the long repositioning legs between passes go by four times faster
      const fast = jet.label === 'REPOSITIONING' ? 4 : 1;
      jet.update(dt * this.showSpeed * fast);
    };
    this.jet = jet;
    jet.update(0);
    sim.add(ac);
    this.gap = 0;
    // (the next jet's display, worked out now while this one taxis out)
    const nxt = this.acts[(this.actI + 1) % this.acts.length];
    setTimeout(() => this.routine(nxt), 1500);
  }

  update(dt: number): void {
    this.elapsed += dt;
    const j = this.jet;
    if (!j) return;
    if (j.done) {
      this.gap += dt;
      if (this.gap > 4) this.nextAct();
    }
  }

  status(): ModeStatus {
    return { title: 'AIRSHOW', blue: 0, red: 0, timer: this.elapsed, objective: this.jet ? `${this.jet.ac.spec.name} · ${this.jet.label}` : '' };
  }

  handle(action: ResultButton['action']): void {
    void action;
  }

  dispose(): void {
    this.grounds?.dispose();
    this.grounds = null;
    for (const [k, fn] of this.listeners) window.removeEventListener(k, fn);
    this.listeners = [];
    audio.silenceContinuous();
  }

  // ------------------------------------------------------------------ input

  /** mouse: drag to look, click to shoot, wheel to zoom (wired once the canvas is known) */
  attach(canvas: HTMLCanvasElement): void {
    if (this.canvas) return;
    this.canvas = canvas;
    const on = (k: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
      window.addEventListener(k, fn, opts);
      this.listeners.push([k, fn]);
    };
    on('pointerdown', (ev) => {
      const e = ev as PointerEvent;
      if (e.target !== canvas || this.albumOpen) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, btn: e.button };
      if (e.button === 0) this.burstT = 0;
    });
    on('pointermove', (ev) => {
      const e = ev as PointerEvent;
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      // (look round: drag right to look right; slower the longer the lens)
      if (d.moved > 5 || d.btn !== 0) {
        const k = (fovFor(this.focal) * D2R) / Math.max(300, window.innerHeight);
        this.yaw += dx * k;
        this.pitch = Math.max(-0.2, Math.min(1.5, this.pitch - dy * k));
        if (this.track) this.track = false;
      }
    });
    const up = (ev: Event) => {
      const e = ev as PointerEvent;
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      if (d.btn === 0 && d.moved <= 5) this.wantShot = true;
      this.drag = null;
    };
    on('pointerup', up);
    on('pointercancel', up);
    on(
      'wheel',
      (ev) => {
        const e = ev as WheelEvent;
        if (e.target !== canvas || this.albumOpen) return;
        this.zoom(e.deltaY < 0 ? 1 : -1);
      },
      { passive: true },
    );
    on('contextmenu', (ev) => {
      if (ev.target === canvas) ev.preventDefault();
    });
  }

  /** the longest lens the spotter's rank allows */
  maxFocal(): number {
    return rankOf(this.log.points).rank.lens;
  }

  zoom(dir: number): void {
    this.focal = Math.max(24, Math.min(this.maxFocal(), this.focal * (dir > 0 ? 1.15 : 1 / 1.15)));
  }

  handleInput(inp: Input, dt: number): void {
    if (this.albumOpen) {
      if (inp.codePressed('Tab') || inp.codePressed('Escape')) this.onToggleAlbum?.();
      return;
    }
    if (inp.codePressed('Space')) this.wantShot = true;
    // burst (from the third rank): hold the shutter
    const burst = rankOf(this.log.points).i >= 2;
    if (burst && (inp.codeHeld('Space') || (this.drag && this.drag.btn === 0 && this.drag.moved <= 5 && inp.mouseHeld(0)))) {
      this.burstT += dt;
      if (this.burstT > 0.35) {
        this.wantShot = true;
        this.burstT = 0.35 - 0.12;
      }
    }
    if (inp.codePressed('KeyT')) this.track = !this.track;
    if (inp.codePressed('KeyG')) this.grid = !this.grid;
    if (inp.codePressed('KeyN')) this.nextAct();
    if (inp.codePressed('KeyV')) this.nextSpot();
    if (inp.codePressed('KeyF')) this.showSpeed = this.showSpeed >= 4 ? 1 : this.showSpeed * 2;
    if (inp.codePressed('Tab')) this.onToggleAlbum?.();
    if (inp.codePressed('Equal') || inp.codePressed('NumpadAdd')) this.zoom(1);
    if (inp.codePressed('Minus') || inp.codePressed('NumpadSubtract')) this.zoom(-1);
    // the keys look round too
    const k = fovFor(this.focal) * D2R * 0.6 * dt;
    const kx = (inp.codeHeld('ArrowRight') || inp.codeHeld('KeyD') ? 1 : 0) - (inp.codeHeld('ArrowLeft') || inp.codeHeld('KeyA') ? 1 : 0);
    const ky = (inp.codeHeld('ArrowUp') || inp.codeHeld('KeyW') ? 1 : 0) - (inp.codeHeld('ArrowDown') || inp.codeHeld('KeyS') ? 1 : 0);
    if (kx || ky) {
      this.yaw += kx * k;
      this.pitch = Math.max(-0.2, Math.min(1.5, this.pitch + ky * k));
      this.track = false;
    }
  }

  // ------------------------------------------------------------------ the camera

  /** aim the camera for this frame */
  frameCamera(cam: THREE.PerspectiveCamera, dt: number, running = true): void {
    const j = this.jet;
    // how fast the display's clock runs against ours (it stops while paused)
    const clock = running && j && !j.done ? this.showSpeed * (j.label === 'REPOSITIONING' ? 4 : 1) : 0;
    this.clock = clock;
    // auto-track: hold the jet in the middle. It turns the view at the jet's own rate
    // across the sky (so it doesn't trail behind a fast pass) and closes what is left.
    if (this.track && j && !j.done) {
      const fm = j.ac.fm;
      const px = fm.pos.x - this.eye.x, py = fm.pos.y - this.eye.y, pz = fm.pos.z - this.eye.z;
      const vx = fm.vel.x * clock, vy = fm.vel.y * clock, vz = fm.vel.z * clock;
      const h2 = Math.max(1, px * px + pz * pz), h = Math.sqrt(h2);
      const wantYaw = Math.atan2(-px, -pz);
      const wantPitch = Math.atan2(py, h);
      let ey = wantYaw - this.yaw;
      ey = Math.atan2(Math.sin(ey), Math.cos(ey));
      // (a big swing, like the start of a new act, is eased rather than snapped)
      if (Math.abs(ey) < 0.5 && Math.abs(wantPitch - this.pitch) < 0.5) {
        // carry on turning as fast as the jet crosses the sky, then close what is left
        this.yaw += ((pz * vx - px * vz) / h2) * dt;
        this.pitch += ((h * vy - (py * (px * vx + pz * vz)) / h) / (h2 + py * py)) * dt;
        ey = Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw));
      }
      const k = 1 - Math.exp(-dt * 8);
      this.yaw += ey * k;
      this.pitch += (wantPitch - this.pitch) * k;
    }
    this.pitch = Math.max(-0.25, Math.min(1.56, this.pitch));
    cam.position.copy(this.eye);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.fov = fovFor(this.focal);
    cam.near = 0.5;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // how fast the view itself is panning (smoothed: a photographer's swing, not the mouse's jitter)
    if (dt > 0) {
      let dyaw = this.yaw - this.prevYaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const kr = 1 - Math.exp(-dt / 0.06);
      this.panYaw += (dyaw / dt - this.panYaw) * kr;
      this.panPitch += ((this.pitch - this.prevPitch) / dt - this.panPitch) * kr;
    }
    this.prevYaw = this.yaw;
    this.prevPitch = this.pitch;
    // the jet's motion across the frame (what makes a picture sharp or blurred): where it is
    // now, and where it will be a moment later with the view still swinging as it is
    this.screenVel.set(0, 0);
    if (j) this.screenMotion(cam, j.ac.fm.pos, j.ac.fm.vel, clock, this.screenVel);
    this.flash = Math.max(0, this.flash - dt);
  }

  /** how fast a point moving at `vel` (scaled by `clock`) crosses the frame (px/s), with the view swinging as it is */
  private screenMotion(cam: THREE.PerspectiveCamera, pos: THREE.Vector3, vel: THREE.Vector3, clock: number, out: THREE.Vector2): THREE.Vector2 {
    const w = window.innerWidth, hh = window.innerHeight;
    out.set(0, 0);
    const a = _v.copy(pos).project(cam);
    if (a.z > 1 || a.z < -1) return out;
    const ax = (a.x * 0.5 + 0.5) * w, ay = (-a.y * 0.5 + 0.5) * hh;
    const dT = 1 / 60;
    _cam.copy(cam, false);
    _cam.rotation.set(this.pitch + this.panPitch * dT, this.yaw + this.panYaw * dT, 0, 'YXZ');
    _cam.updateMatrixWorld();
    const v = _v.copy(pos).addScaledVector(vel, dT * clock).project(_cam);
    if (v.z < 1 && v.z > -1) out.set(((v.x * 0.5 + 0.5) * w - ax) / dT, ((-v.y * 0.5 + 0.5) * hh - ay) / dT);
    return out;
  }

  /** the jet's centre on screen (px), or null off it / behind */
  screenPos(cam: THREE.Camera, w: number, h: number): THREE.Vector2 | null {
    const j = this.jet;
    if (!j) return null;
    const v = j.ac.fm.pos.clone().project(cam);
    if (v.z > 1 || v.z < -1) return null;
    return new THREE.Vector2((v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h);
  }

  /** the sound of the show, heard from the crowd line */
  sound(cam: THREE.Camera): void {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const others: OtherJetSound[] = [];
    for (const a of this.host.sim.aircraft) {
      // (only the jet flying its display: the static display is silent)
      if (!a.script) continue;
      const r = a.fm.pos.clone().sub(this.eye);
      const d = r.length();
      const rl = Math.max(1, d);
      let rpm = 0;
      for (const x of a.fm.rpm) rpm += x;
      others.push({
        id: a.id,
        dist: d,
        closing: -a.fm.vel.dot(r) / rl,
        pan: right.dot(r) / rl,
        aspect: -a.fm.fwd.dot(r) / rl,
        ab: a.fm.afterburner,
        rpm: rpm / a.fm.rpm.length,
        type: a.type,
      });
    }
    audio.updateFlight({ others, onGround: true, gs: 0, vs: 0, rpm: 0, ab: 0, qbar: 0, tas: 0, inCockpit: false, alive: false, gunFiring: false, gunRpm: 0, tone: 'off', rwr: 'none', nearbyJet: 0, stall: false });
  }

  // ------------------------------------------------------------------ the shutter

  get flashing(): number {
    return this.flash;
  }

  /** right after the frame is drawn: take the picture if the shutter was pressed */
  afterRender(canvas: HTMLCanvasElement, cam: THREE.PerspectiveCamera): void {
    if (!this.wantShot) return;
    this.wantShot = false;
    this.flash = 0.12;
    audio.click();
    audio.beep(5200, 0.025, 0.03, 'square');
    const shot = this.score(cam, canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    // the picture: the frame as drawn, scaled to at most 1600 px wide
    const W = Math.min(1600, canvas.width), H = Math.round((W * canvas.height) / Math.max(1, canvas.width));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (!g) return;
    g.drawImage(canvas, 0, 0, W, H);
    // the photographer's caption in the corner
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, H - 26, W, 26);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = `600 ${Math.round(H / 45)}px Rajdhani, system-ui`;
    g.fillText(`${shot.jet} · ${this.field.name.toUpperCase()} · ${Math.round(this.focal)} MM`, 12, H - 8);
    const url = c.toDataURL('image/jpeg', 0.86);
    const seq = ++this.shotSeq;
    // (the album copy, in the background)
    this.saving = new Promise<void>((res) =>
      c.toBlob((b) => {
        if (b && shot.score >= 15) void savePhoto(shot, b).finally(res);
        else res();
      }, 'image/jpeg', 0.86),
    );
    // the logbook: the best of each kind for this jet, and the points
    const L = this.log;
    const before = rankOf(L.points);
    const best = (L.best[shot.type] ??= {});
    const newTags: string[] = [];
    let points = Math.round(shot.score / 10);
    for (const t of shot.tags) {
      const prev = best[t] ?? 0;
      if (shot.stars > prev) {
        if (!prev) {
          newTags.push(t);
          points += SHOTS[t]?.pts ?? 20;
        } else points += Math.round((SHOTS[t]?.pts ?? 20) * 0.25 * (shot.stars - prev));
        best[t] = shot.stars;
      }
    }
    if (!shot.tags.length && shot.stars >= 3 && !best.portrait) {
      best.portrait = shot.stars;
      points += 15;
    }
    L.points += points;
    L.shots += 1;
    L.topScore = Math.max(L.topScore, shot.score);
    saveSpotterLog(L);
    const after = rankOf(L.points);
    this.lastShot = { meta: shot, url, newTags, points, rankUp: after.i > before.i ? after.rank.name : null, notes: this.notes };
    void seq;
  }

  private notes: string[] = [];
  /** the album copy of the last picture, being written (the album waits for it) */
  saving: Promise<void> = Promise.resolve();

  /** how good is the picture: the jet's size and place in the frame, sharpness and the moment */
  private score(cam: THREE.PerspectiveCamera, w: number, h: number): PhotoMeta {
    const j = this.jet;
    const notes: string[] = [];
    const meta: PhotoMeta = { id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`, time: Date.now(), type: j?.ac.type ?? 'F15EX', jet: j?.ac.spec.name ?? '', score: 0, stars: 0, tags: [], base: this.field.name, lens: Math.round(this.focal) };
    this.notes = notes;
    // what is in the picture: the jet flying its display, or one on the static display
    // (whichever fills more of the frame; the flying one wins a close call)
    let a: Aircraft | null = null;
    let bestFill = 0;
    let flying = false;
    const fillOf = (x: Aircraft): number => {
      const to = x.fm.pos.clone().sub(this.eye);
      const d = Math.max(1, to.length());
      const side = 1 - Math.abs(x.fm.fwd.dot(to.divideScalar(d)));
      const ext = Math.max(x.spec.span, x.spec.length * (0.35 + 0.65 * side));
      return ext / (2 * d * Math.tan((cam.fov * D2R) / 2) * (w / h));
    };
    const inFrame = (x: Aircraft): boolean => {
      const c = x.fm.pos.clone().project(cam);
      return c.z < 1 && c.z > -1 && Math.abs(c.x) < 1.1 && Math.abs(c.y) < 1.1;
    };
    if (j && !j.done && inFrame(j.ac)) {
      a = j.ac;
      bestFill = fillOf(j.ac) * 1.5;
      flying = true;
    }
    for (const x of this.statics) {
      if (!inFrame(x)) continue;
      const fl = fillOf(x);
      if (fl > bestFill) {
        a = x;
        bestFill = fl;
        flying = false;
      }
    }
    if (!a) {
      notes.push(j && !j.done ? 'Missed it: the jet is out of the frame' : 'No jet in the picture');
      return meta;
    }
    meta.type = a.type;
    meta.jet = a.spec.name;
    meta.spot = this.spots[this.spotI]?.id;
    const fm = a.fm;
    // its size in the frame: the bigger of span and length, seen from here
    const toJet = fm.pos.clone().sub(this.eye);
    const c = fm.pos.clone().project(cam);
    const fill = fillOf(a);
    // how much of it is cut off by the edges
    const half = fill;
    const cut = Math.max(0, Math.abs(c.x) + half - 1) / Math.max(0.01, half * 2);
    let size = fill < 0.04 ? 0 : fill < 0.15 ? (fill - 0.04) / 0.11 * 0.6 : fill < 0.3 ? 0.6 + ((fill - 0.15) / 0.15) * 0.4 : fill <= 0.8 ? 1 : Math.max(0.4, 1 - (fill - 0.8) * 1.5);
    size *= 1 - Math.min(1, cut * 1.6);
    if (fill < 0.04) notes.push('Too small: zoom in');
    else if (fill < 0.15) notes.push('A bit small in the frame');
    else if (fill > 0.9) notes.push('Too tight: a wing cut off');
    // where it sits: the middle, or on a third, with room ahead of the nose
    const sx = c.x * 0.5 + 0.5, sy = -c.y * 0.5 + 0.5;
    meta.sx = +sx.toFixed(3);
    meta.sy = +sy.toFixed(3);
    const pts: [number, number][] = [[0.5, 0.5], [1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3]];
    const dmin = Math.min(...pts.map(([x, y]) => Math.hypot(sx - x, sy - y)));
    let comp = Math.max(0, 1 - dmin / 0.3);
    const nose = fm.pos.clone().add(fm.fwd).project(cam);
    const lead = Math.sign(nose.x - c.x) * (0.5 - sx);
    if (lead > 0.05) comp = Math.min(1, comp + 0.15);
    // sharpness: how far it moved across the frame while the shutter was open
    const motion = flying ? this.screenVel : this.screenMotion(cam, fm.pos, _zero, 0, new THREE.Vector2());
    const blurPx = motion.length() * EXPOSURE;
    const sharp = Math.exp(-blurPx / 7);
    if (blurPx > 10) notes.push(flying ? `Motion blur: pan with the jet (${Math.round(blurPx)} px of blur)` : `Camera shake: hold still (${Math.round(blurPx)} px of blur)`);
    if (!flying) {
      // the static display: a portrait of a parked jet
      const tags = fill >= 0.2 ? ['static'] : [];
      const q = size > 0 ? 0.36 * size + 0.19 * comp + 0.45 * sharp : 0;
      const score = Math.round(100 * q * (0.72 + 0.28 * (tags.length ? 0.45 : 0)));
      const stars = score >= 88 ? 5 : score >= 74 ? 4 : score >= 58 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0;
      if (!tags.length && size > 0) notes.push('Fill more of the frame with it');
      meta.score = score;
      meta.stars = stars;
      meta.tags = stars >= 1 ? tags : [];
      return meta;
    }
    const label = j!.label;
    // the moment
    const tags: string[] = [];
    const toCam = toJet.clone().normalize().negate();
    const up = fm.up, fwd = fm.fwd;
    const air = !fm.onGround;
    const agl = fm.pos.y - this.field.elev;
    if (air && agl < 25 && fm.gearPos > 0.6 && (label === 'TAKEOFF' || label === 'LINE UP')) tags.push('takeoff');
    if (fm.afterburner > 0.6 && fwd.dot(toCam) < 0.3) tags.push('afterburner');
    if (air && fwd.y > 0.85) tags.push('vertical');
    if (fm.mach > 0.955 && fm.mach < 1.05 && agl < 6000) tags.push('vapor');
    if (fm.nz > 6.3) tags.push('highg');
    if (air && up.dot(toCam) > 0.72) tags.push('topside');
    if (air && up.dot(toCam) < -0.72 && agl > 30) tags.push('belly');
    if (air && up.y < -0.75) tags.push('inverted');
    if (air && Math.abs(up.y) < 0.3 && Math.abs(fwd.y) < 0.4 && label === 'ROLLING PASS') tags.push('knife');
    if (air && fwd.dot(toCam) > 0.88) tags.push('headon');
    if (air && fm.alpha > 18 * D2R && fm.alpha < 45 * D2R) tags.push('highalpha');
    if (air && fm.alpha > 50 * D2R) tags.push('cobra');
    if (air && fm.gearPos > 0.95 && label === 'LANDING') tags.push('gear');
    if (fm.onGround && label === 'LANDING' && fm.tas > 40) tags.push('touchdown');
    // the score: the picture itself (size, framing, sharpness) makes up to three stars;
    // the moment caught (vapour, afterburners, the top side in a turn...) makes it a four
    // or five. Auto-track does the panning for you: four stars at most.
    const q = size > 0 ? 0.36 * size + 0.19 * comp + 0.45 * sharp : 0;
    const moment = Math.min(1, tags.reduce((s, t) => s + (SHOTS[t]?.pts ?? 20), 0) / 60);
    let score = 100 * q * (0.72 + 0.28 * moment);
    if (this.track) score = Math.min(score * 0.92, 87);
    score = Math.round(Math.max(0, score));
    const stars = score >= 88 ? 5 : score >= 74 ? 4 : score >= 58 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0;
    if (!notes.length && stars >= 4) notes.push('A keeper');
    if (this.track && stars === 4 && q > 0.9 && moment > 0.6) notes.push('Pan it yourself (auto-track off) for five stars');
    meta.score = score;
    meta.stars = stars;
    meta.tags = stars >= 1 ? tags : [];
    return meta;
  }
}
