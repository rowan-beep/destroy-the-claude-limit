// The game shell: owns the renderer, world, simulation, cameras, input,
// audio and HUD; runs the fixed-step loop and translates the player's
// inputs into flight controls and weapon actions.

import { WeaponSelect, MISSILES, isIrMissile, launchCall } from '../weapons/weaponSpecs';
import { MissionProgress, loadProgress } from './progression';
import type { XpFx } from '../ui/xpFx';
import * as THREE from 'three';
import { GameRenderer } from '../render/renderer';
import { World, WORLD_QUALITY } from '../world/world';
import { Sim } from './sim';
import { TeamPicture } from './teamPicture';
import { CombatRenderer } from '../render/combatRenderer';
import { CameraRig } from '../render/cameraRig';
import { Input, withGamepad } from '../core/input';
import { GameSettings, saveSettings } from '../core/settings';
import { audio } from '../audio/audio';
import { Aircraft } from '../aircraft/aircraft';
import { MissionConfig } from './mission';
import { GameMode, ModeHost, MissionResult, MsgKind } from './modes/mode';
import { FreeFlightMode } from './modes/freeFlight';
import { WavesMode } from './modes/waves';
import { DuelMode } from './modes/duel';
import { TeamBattleMode } from './modes/team';
import { FreeForAllMode } from './modes/ffa';
import { resetRules, RULES } from './rules';
import { ZoneWall } from '../render/zoneWall';
import { Spectator } from './spectator';
import type { SpectatorUi } from '../ui/spectatorUi';
import { PHYSICS_DT, DEG, FT, KT } from '../core/constants';
import { clamp, damp } from '../core/math';
import { steerToward } from '../ai/steering';
import { emptyVision } from '../render/vision';
import type { Hud } from '../ui/hud/hud';
import { CockpitView } from '../render/cockpitView';
import { Avionics } from '../avionics/avionics';
import { gradeLanding } from '../avionics/nav';
import type { TouchControls } from '../ui/touchControls';
import type { ReplayUi } from '../ui/replayUi';
import { ReplayRecorder, ReplayPlayer } from './replay';
import { SortieRecorder, LogbookData, MissionOutcome, loadLogbook, saveLogbook, commitSortie, medalName } from './logbook';
import { NM } from '../core/constants';
import { prewarmAirframes } from '../aircraft/models';
import { randomizeWind, wind } from '../core/weather';
import { AutoFly } from './autoFly';
import type { AutoFlyPanel, AutoFlyChoice } from '../ui/autoFlyPanel';
import { enemyTypesFor, AIRCRAFT_TYPES } from '../aircraft/specs';

export type GameState = 'menu' | 'loading' | 'playing' | 'paused' | 'map' | 'results' | 'replay';

const CLOUD_DENSITY: Record<string, number> = { low: 0.5, medium: 0.75, high: 1, ultra: 1.35 };
const CLOUD_COVER: Record<string, number> = { clear: 0.12, scattered: 0.55, broken: 0.85, overcast: 0.98 };

export class Game implements ModeHost {
  readonly renderer: GameRenderer;
  readonly world: World;
  sim!: Sim;
  picture = new TeamPicture();
  combat!: CombatRenderer;
  readonly cam: CameraRig;
  readonly input: Input;
  readonly cockpitView = new CockpitView();
  /** the player's avionics (displays, navigation) */
  avionics: Avionics | null = null;
  /** free mouse cursor in the cockpit for clicking displays */
  cockpitCursor = false;
  private touchdownsSeen = 0;
  /** career record and the sortie being flown */
  logbook: LogbookData = loadLogbook();
  sortie: SortieRecorder | null = null;
  /** on-screen controls (phones / tablets), created by the app shell */
  touch: TouchControls | null = null;
  /** track recording of the current mission and the replay viewer */
  recorder: ReplayRecorder | null = null;
  replay: ReplayPlayer | null = null;
  replayUi: ReplayUi | null = null;
  private lastResult: MissionResult | null = null;
  hud!: Hud;
  /** pilot XP / level / money (saved), and this mission's tracker */
  readonly progress = loadProgress();
  missionProgress: MissionProgress | null = null;
  xpFx: XpFx | null = null;
  mode: GameMode | null = null;
  player: Aircraft | null = null;
  config!: MissionConfig;
  state: GameState = 'menu';
  private accumulator = 0;
  private lastT = 0;
  private running = false;
  /** mouse-aim direction (world) */
  readonly aimDir = new THREE.Vector3(0, 0, -1);
  throttleCmd = 0.85;
  private throttleHoldAtMil = 0;
  gOverride = false;
  speedbrake = false;
  gearDown = false;
  /** Auto-Fly (U): flies to a chosen destination at a chosen speed and altitude */
  readonly autoFly = new AutoFly();
  autoFlyPanel: AutoFlyPanel | null = null;
  /** team battle: watch other jets (or a free camera) after being shot down */
  readonly spectator = new Spectator();
  spectatorUi: SpectatorUi | null = null;
  private deadTime = 0;
  get autopilot(): boolean {
    return this.autoFly.engaged;
  }
  set autopilot(on: boolean) {
    if (!on) this.autoFly.disengage();
  }
  private ejectHold = 0;
  rearmTimer = -1;
  private prevRwr: string | null = null;
  private lastWarn = '';
  private deathHandled = false;
  timeScale = 1;
  /** free-for-all battle-zone boundary */
  private zoneWall: ZoneWall;
  onStateChange: ((s: GameState) => void) | null = null;
  onResults: ((r: MissionResult) => void) | null = null;
  onMenuFrame: ((dt: number) => void) | null = null;
  onAfterFrame: ((dt: number) => void) | null = null;
  private frameCount = 0;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    container: HTMLElement,
    public settings: GameSettings,
  ) {
    this.renderer = new GameRenderer(container);
    this.world = new World(this.renderer.scene);
    this.cam = new CameraRig(this.renderer.camera);
    this.zoneWall = new ZoneWall(this.renderer.scene);
    this.input = new Input(this.renderer.canvas, { ...settings.input, bindings: withGamepad(settings.input.bindings) });
    audio.levels = { ...settings.audio };
  }

  setState(s: GameState): void {
    this.state = s;
    if (s !== 'playing') this.autoFlyPanel?.hide();
    this.input.enabled = s === 'playing';
    audio.setPaused(s !== 'playing');
    if (s !== 'playing') this.input.exitPointerLock();
    this.onStateChange?.(s);
  }

  applySettings(): void {
    const s = this.settings;
    const g = s.graphics;
    this.renderer.applySettings(g);
    this.cam.fovBase = g.fov;
    this.cam.followRoll = s.gameplay.cameraRoll;
    if (this.world.ready) {
      const w = this.world;
      this.renderer.shadowLight = w.env.sun;
      w.setQuality(WORLD_QUALITY[g.quality]);
      w.clouds.setDensity(CLOUD_DENSITY[g.cloudQuality]);
      w.clouds.setCoverage(CLOUD_COVER[g.clouds]);
      w.clouds.shadowStrength = g.cloudShadows ? 1 : 0;
      w.clouds.setScattering(g.lightScattering);
      w.env.scattering = g.lightScattering;
      w.env.sun.castShadow = g.shadows !== 'off';
      w.env.setShadowExtent(g.shadows === 'ultra' ? 90 : g.shadows === 'low' ? 50 : 70);
      w.lightBaker.setEnabled(g.terrainLighting);
      this.renderer.applySettings({});
    }
    this.input.settings = { ...s.input, bindings: withGamepad(s.input.bindings) };
    this.input.rebuildMap();
    audio.levels = { ...s.audio };
    audio.applyLevels();
    if (this.sim) this.sim.autoCm = s.gameplay.autoCountermeasures;
    saveSettings(s);
  }

  // ---------------------------------------------------------------------
  // Mission lifecycle
  // ---------------------------------------------------------------------

  async startMission(cfg: MissionConfig, onProgress: (f: number, label: string) => void): Promise<void> {
    this.config = cfg;
    this.setState('loading');
    if (this.combat) this.combat.dispose();
    this.sim = new Sim(this.world.grid);
    this.sim.autoCm = this.settings.gameplay.autoCountermeasures;
    this.picture = new TeamPicture();
    this.combat = new CombatRenderer(this.renderer.scene, this.sim);
    this.combat.onExplosion = (pos, size) => {
      const d = pos.distanceTo(this.renderer.camera.position);
      audio.explosion(d, size);
      if (d < 1500) this.cam.addShake(Math.min(1.2, (size * 400) / Math.max(d, 50)));
    };
    this.world.env.setTimeOfDay(cfg.timeOfDay);
    this.world.env.buildEnvMap(this.renderer.renderer);
    this.world.bakeLighting(this.renderer.renderer);
    this.sim.sunDir.copy(this.world.env.sunDir);
    this.hookEvents();
    this.newMissionProgress();
    this.player = null;
    this.deathHandled = false;
    this.rearmTimer = -1;
    this.autopilot = false;
    this.gOverride = false;
    this.speedbrake = false;
    // build the airframes this mission can spawn before the first frame
    const pre = [new Aircraft(cfg.aircraft, 'blue', 'PRE')];
    if (cfg.mode !== 'free') for (const t of enemyTypesFor(cfg.aircraft)) pre.push(new Aircraft(t, 'red', 'PRE'));
    if (cfg.mode === 'team') for (const t of enemyTypesFor(cfg.aircraft)) pre.push(new Aircraft(t, 'blue', 'PRE'));
    if (cfg.mode === 'ffa') pre.push(new Aircraft(cfg.aircraft, 'red', 'PRE'));
    prewarmAirframes(pre);
    this.stopSpectating();
    resetRules();
    this.timeScale = 1;
    this.mode =
      cfg.mode === 'free'
        ? new FreeFlightMode(this)
        : cfg.mode === 'waves'
          ? new WavesMode(this)
          : cfg.mode === 'team'
            ? new TeamBattleMode(this)
            : cfg.mode === 'ffa'
              ? new FreeForAllMode(this)
              : new DuelMode(this);
    randomizeWind();
    this.mode.start();
    this.message(`WIND ${String(Math.round(wind.fromDeg)).padStart(3, '0')}° / ${Math.round(wind.surfaceKts)} KT${wind.turbulence > 1.1 ? ' — MODERATE TURBULENCE LOW LEVEL' : ''}`, 'info', 8);
    this.recorder = new ReplayRecorder(this.sim, cfg.mode.toUpperCase());
    this.syncPlayerControls();
    this.hud.reset(this);
    onProgress(0.2, 'GENERATING TERRAIN');
    const p = this.player!;
    this.cam.setMode(this.settings.input.mouseMode === 'mouseaim' ? 'chase' : 'chase');
    this.aimDir.copy(p.fm.fwd);
    this.cam.update(0.016, p, this.eyeWorld());
    await this.world.prewarm(p.fm.pos.clone(), this.renderer.camera, 12000);
    // build the 3D cockpit now so the first switch to it doesn't hitch
    const pv = this.combat.aircraftVis.get(p);
    if (pv) pv.getCockpit();
    onProgress(1, 'READY');
    this.setState('playing');
    this.lastT = performance.now();
    this.accumulator = 0;
  }

  /** Start tracking XP for a fresh mission (or a retry). */
  private newMissionProgress(): void {
    this.missionProgress?.dispose();
    const mp = new MissionProgress(this.progress, this.sim, this.config.mode, this.config.difficulty, () => this.autoFly.engaged);
    mp.player = this.player;
    mp.onAward = (a) => this.xpFx?.award(a, this.progress);
    mp.onLevelUp = (l) => this.xpFx?.levelUp(l);
    this.missionProgress = mp;
    this.xpFx?.reset(this.progress);
  }

  endMission(): void {
    if (this.player) this.finishSortie(this.player.alive ? (this.player.fm.onGround ? 'LANDED' : 'RTB') : 'LOST');
    this.missionProgress?.dispose();
    this.missionProgress = null;
    this.mode?.dispose();
    this.mode = null;
    if (this.sim) {
      for (const a of [...this.sim.aircraft]) this.sim.remove(a);
      this.sim.missiles.length = 0;
      this.sim.bullets.clear();
      this.sim.cms.clear();
      this.sim.events.clear();
    }
    this.combat?.clearEffects();
    this.player = null;
    this.stopSpectating();
    this.recorder?.stop();
    this.recorder = null;
    this.renderer.setOverlay(null, null);
    this.cockpitView.attach(null);
    this.avionics?.dispose();
    this.avionics = null;
    this.cockpitCursor = false;
    audio.silenceContinuous();
    this.setState('menu');
  }

  private hookEvents(): void {
    const ev = this.sim.events;
    ev.on('launch', (e) => {
      const d = this.player ? e.missile.pos.distanceTo(this.player.fm.pos) : 1e6;
      audio.missileLaunch(e.shooter === this.player, d);
      if (e.shooter === this.player) {
        // NATO brevity (FOX 3 / FOX 2) for the Western jets, "Пуск!" for the Su-35S
        const call = launchCall(e.missile.spec.type);
        this.hud.feed(`${e.shooter.callsign}: ${call.feed}${e.target ? ' → ' + e.target.callsign : ''}`, 'blue');
      }
    });
    ev.on('destroyed', (e) => {
      const v = e.victim;
      const k = e.killer;
      this.hud.feed(k ? `${k.callsign} [${k.spec.shortName}] >> ${e.weapon} >> ${v.callsign} [${v.spec.shortName}]` : `${v.callsign} [${v.spec.shortName}] — ${e.cause}`, RULES.ffa ? (k === this.player ? 'blue' : 'red') : v.team === 'red' ? 'blue' : 'red');
      if (k === this.player && v !== this.player) {
        this.message(`SPLASH! ${v.spec.shortName} DESTROYED (${e.weapon})`, 'good', 4);
        this.voice('Splash one');
      }
      if (v === this.player) this.playerKilledBy(k, e.cause);
    });
    ev.on('hit', (e) => {
      if (e.victim === this.player) {
        audio.hitThud();
        this.cam.addShake(0.5);
        this.hud.damageFlash();
      } else if (e.shooter === this.player && !e.weapon.startsWith('AIM')) {
        this.hud.hitMarker();
      }
    });
    ev.on('gloc', (e) => {
      if (e.aircraft === this.player) this.message('G-LOC — PILOT UNCONSCIOUS', 'bad', 10);
    });
    ev.on('decoy', (d) => {
      if (d.owner === this.player) audio.countermeasure();
    });
    ev.on('lockLost', (e) => {
      if (e.owner === this.player) {
        this.message(`LOCK LOST (${String(e.reason).toUpperCase()})`, 'warn', 2.5);
        if (this.avionics) this.avionics.lastLockLoss = { reason: String(e.reason), time: this.sim.time };
      }
    });
    ev.on('pitbull', (m) => {
      if (m.shooter === this.player) this.hud.feed(`${m.spec.short} PITBULL`, 'blue');
    });
    ev.on('missileLost', (e) => {
      if (e.missile.shooter === this.player) this.message(`${e.missile.spec.short} DEFEATED: ${e.reason}`, 'warn', 3);
      else if (e.missile.target === this.player) this.message(`MISSILE DEFEATED (${e.reason})`, 'good', 3);
    });
  }

  // --- ModeHost ---------------------------------------------------------

  createPlayer(): Aircraft {
    if (this.player) this.finishSortie(this.player.alive ? 'RECALLED' : 'LOST');
    const cfg = this.config;
    const p = new Aircraft(cfg.aircraft, 'blue', 'VIPER 1-1', cfg.loadoutId);
    p.isPlayer = true;
    this.player = p;
    this.deathHandled = false;
    this.throttleCmd = 0.85;
    this.gOverride = false;
    this.aimDir.set(0, 0, -1);
    this.combat.playerAircraft = p;
    this.avionics?.dispose();
    this.avionics = new Avionics(this, p);
    this.cockpitView.attach(null);
    this.touchdownsSeen = 0;
    this.sortie = new SortieRecorder(p, cfg.mode, this.sim);
    if (this.missionProgress) this.missionProgress.player = p;
    return p;
  }

  message(text: string, kind: MsgKind = 'info', seconds = 5): void {
    this.hud?.message(text, kind, seconds);
  }

  order(title: string, body: string, seconds = 10): void {
    this.hud?.order(title, body, seconds);
  }

  showResults(r: MissionResult): void {
    const outcome: MissionOutcome = {};
    if (this.mode instanceof WavesMode) {
      outcome.wave = this.mode.wave;
      outcome.wavesCleared = this.mode.phase === 'victory' ? 10 : this.mode.wave - 1;
    } else if (this.mode instanceof TeamBattleMode) {
      outcome.team = { won: this.mode.score.blue > this.mode.score.red, drawn: this.mode.score.blue === this.mode.score.red, roundsWon: this.mode.score.blue, roundsLost: this.mode.score.red };
    } else if (this.mode instanceof FreeForAllMode) {
      const me = this.mode.entries.find((e) => e.a.isPlayer);
      outcome.ffa = { place: this.mode.playerPlace || 12, of: this.mode.entries.length, bounties: me?.bounties ?? 0 };
    } else if (this.mode instanceof DuelMode) {
      outcome.duel = {
        difficulty: this.config.difficulty,
        outcome: r.title === 'VICTORY' ? 'win' : r.title === 'MUTUAL KILL' ? 'draw' : 'loss',
      };
    }
    const s = this.sortie;
    const earned = this.finishSortie(r.title, outcome);
    if (s) r.debrief = { sortie: s, earned };
    // mission result XP, then the summary for the debrief
    const mp = this.missionProgress;
    if (mp) {
      r.progress = mp.finish({
        wavesCleared: outcome.wavesCleared,
        victory: this.mode instanceof WavesMode && this.mode.phase === 'victory',
        team: outcome.team,
        duel: outcome.duel?.outcome,
        ffa: outcome.ffa,
      });
    }
    if (this.recorder && this.recorder.duration > 3 && !r.buttons.some((b) => b.action === 'replay')) {
      r.buttons.splice(Math.max(0, r.buttons.length - 1), 0, { label: 'WATCH REPLAY', action: 'replay' });
    }
    this.lastResult = r;
    this.setState('results');
    this.onResults?.(r);
  }

  // ---------------------------------------------------------------------
  // Track replay
  // ---------------------------------------------------------------------

  private startReplay(): void {
    if (!this.recorder) return;
    this.recorder.stop();
    this.combat.setVisible(false);
    this.replay = new ReplayPlayer(this.recorder.data, this.renderer.scene, this.world.grid);
    this.replayUi?.open(this.replay);
    this.cam.setMode('chase');
    this.cam.resetLook();
    this.cam.aimDir = null;
    this.renderer.setOverlay(null, null);
    this.setState('replay');
  }

  exitReplay(): void {
    this.replay?.dispose();
    this.replay = null;
    this.replayUi?.close();
    this.combat.setVisible(true);
    this.setState('results');
    if (this.lastResult) this.onResults?.(this.lastResult);
  }

  private replayFrame(dt: number): void {
    const rp = this.replay!;
    const ui = this.replayUi;
    rp.update(dt, this.renderer.camera);
    ui?.update();
    const focus = ui?.focus ?? rp.playerPuppet;
    if (focus) {
      const mode = ui?.camMode ?? 'chase';
      this.cam.target = ui?.target ?? null;
      if (this.cam.mode !== mode && !(mode === 'target' && !this.cam.target)) this.cam.setMode(mode);
      this.cam.aimDir = null;
      this.cam.update(dt, focus, null);
      this.renderer.camera.updateMatrixWorld();
      this.world.update(dt, this.renderer.camera, focus.fm.pos);
    }
    this.renderer.setVision(emptyVision());
    this.renderer.render();
    this.onAfterFrame?.(dt);
  }

  /** Close the current sortie and fold it into the logbook (once). */
  finishSortie(result: string, outcome: MissionOutcome = {}): string[] {
    const s = this.sortie;
    if (!s || s.ended) return [];
    s.end(result);
    const earned = commitSortie(this.logbook, s, outcome);
    saveLogbook(this.logbook);
    if (earned.length) this.message(`DECORATION EARNED: ${earned.map(medalName).join(', ')}`, 'good', 8);
    return earned;
  }

  refreshStores(a: Aircraft): void {
    this.combat.refreshStores(a);
  }

  award(label: string, xp: number, money: number): void {
    this.missionProgress?.award(label, xp, money, 'combat');
  }

  /** Free-for-all storm hurting the player: shake, red flash, crackle. */
  stormHit(exposure: number): void {
    this.cam.addShake(0.25 + exposure * 0.6);
    this.hud?.damageFlash();
    audio.hitThud();
  }

  playerKilledBy(killer: Aircraft | null, cause: string): void {
    if (this.deathHandled) return;
    this.deathHandled = true;
    this.hud.shotDown(killer ? killer.callsign : null, cause);
    this.cam.setMode('death');
  }

  /** A mode respawned the player (a new team-battle round). */
  onPlayerRespawn(): void {
    this.stopSpectating();
    this.syncPlayerControls();
    this.cam.setMode('chase');
    this.cam.resetLook();
    this.cam.deathFocus = null;
    this.hud?.reset(this);
    if (this.player) this.aimDir.copy(this.player.fm.fwd);
  }

  private startSpectating(): void {
    if (!this.mode || this.mode.roster().length === 0) return;
    this.spectator.start(this.mode.roster(), RULES.ffa ? 'red' : 'blue');
    this.cam.setMode('chase');
    this.cam.resetLook();
    this.cam.chaseDist = 1.4;
    this.hud?.setSpectating(true);
    this.spectatorUi?.show(true);
    this.message(RULES.ffa ? 'YOU ARE OUT — SPECTATING TO THE END · [T] FAST-FORWARD' : 'YOU ARE DOWN — SPECTATING UNTIL THE ROUND ENDS', 'info', 4);
  }

  stopSpectating(): void {
    this.spectator.stop();
    this.timeScale = 1;
    this.deadTime = 0;
    this.spectatorUi?.show(false);
    this.hud?.setSpectating(false);
  }

  /** What the spectator bar needs. */
  spectatorView() {
    return {
      roster: () => this.mode?.roster() ?? [],
      kills: (a: Aircraft) => (this.mode instanceof FreeForAllMode ? this.mode.killsOf(a) : a.kills),
      fastForward: () => this.timeScale > 1,
      watching: () => this.spectator.target,
      isFree: () => this.spectator.free,
      watch: (a: Aircraft) => {
        this.spectator.watch(a);
        this.cam.resetLook();
      },
      cycle: (dir: 1 | -1) => this.spectator.cycle(this.mode?.roster() ?? [], dir),
      toggleFree: () => {
        if (this.spectator.free) this.spectator.free = false;
        else this.spectator.enterFree(this.renderer.camera);
      },
    };
  }

  voice(text: string, key = text, cooldown = 6): void {
    audio.voice(text, key, cooldown);
  }

  /** Match the throttle / gear commands to however the player was spawned. */
  syncPlayerControls(): void {
    const p = this.player;
    if (!p) return;
    this.throttleCmd = p.fm.onGround ? 0 : 0.85;
    this.gearDown = p.fm.onGround;
    this.speedbrake = false;
    this.gOverride = false;
    this.autopilot = false;
    this.aimDir.copy(p.fm.fwd);
  }

  handleResult(action: string): void {
    if (action === 'replay') {
      this.startReplay();
      return;
    }
    if (action === 'menu') {
      this.endMission();
      return;
    }
    this.mode?.handle(action as never);
    this.newMissionProgress();
    if (this.missionProgress) this.missionProgress.player = this.player;
    this.recorder?.stop();
    this.recorder = new ReplayRecorder(this.sim, this.config.mode.toUpperCase());
    if (this.player) {
      this.syncPlayerControls();
      this.cam.setMode('chase');
      this.hud.reset(this);
    }
    this.setState('playing');
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------

  startLoop(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - this.lastT) / 1000);
      this.lastT = t;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  private frame(dt: number): void {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    this.frameCount++;
    if (this.state === 'menu' || this.state === 'loading') {
      this.onMenuFrame?.(dt);
      this.input.endFrame();
      return;
    }
    if (this.state === 'replay' && this.replay) {
      this.replayFrame(dt);
      this.input.endFrame();
      return;
    }
    const playing = this.state === 'playing';
    this.input.update(dt);
    if (playing) this.handleInput(dt);
    else if (this.input.pressed('pause') && this.state === 'map') this.setState('playing');

    if (playing && this.player) {
      const simDt = dt * this.timeScale;
      this.accumulator += simDt;
      let steps = 0;
      while (this.accumulator >= PHYSICS_DT && steps < 30) {
        this.controlPlayer(PHYSICS_DT);
        this.picture.update(PHYSICS_DT, this.sim);
        this.sim.step(PHYSICS_DT);
        this.recorder?.update();
        this.accumulator -= PHYSICS_DT;
        steps++;
      }
      if (steps >= 30) this.accumulator = 0;
      this.sortie?.update(steps * PHYSICS_DT);
      this.missionProgress?.update(steps * PHYSICS_DT);
      this.mode?.update(dt);
      this.updateRearm(dt);
      this.updateWarnings(dt);
    }

    const p = this.player;
    // team battle: once shot down, spectate after a few seconds
    if (p && playing && !p.alive && this.mode && !this.mode.over && this.mode.roster().length > 0) {
      this.deadTime += dt;
      if (!this.spectator.active && this.deadTime > 3.5) this.startSpectating();
    }
    if (p && this.spectator.active) {
      this.spectatorFrame(dt, playing);
      this.renderer.render();
      this.onAfterFrame?.(dt);
      this.input.endFrame();
      return;
    }
    if (p) {
      // camera
      this.cam.aimDir = this.settings.input.mouseMode === 'mouseaim' && p.alive ? this.aimDir : null;
      this.cam.target = p.lockedTarget ?? p.seekerTarget ?? null;
      this.cam.deathFocus = p.ejected ? this.combat.eject.playerChute : null;
      const vis = this.combat.aircraftVis.get(p);
      const inCockpit = this.cam.mode === 'cockpit' && !!vis;
      vis?.setCockpitView(inCockpit);
      this.cam.autoCenter = p.alive;
      this.cam.update(dt, p, this.eyeWorld());
      // refresh the view matrices now: the HUD projects through this camera
      // before the frame is rendered, and a stale matrix lags a whole frame
      this.renderer.camera.updateMatrixWorld();
      this.updateCockpit(inCockpit);
      this.avionics?.update(dt, inCockpit);
      this.world.update(dt, this.renderer.camera, p.fm.pos);
      this.zoneWall.update(dt);
      this.combat.update(playing ? dt : 0, this.renderer.camera);
      // pilot vision
      this.renderer.setVision(p.alive || !p.fm.crashed ? p.pilot.vision : emptyVision());
      this.hud.update(dt, this);
      this.touch?.sync(this.throttleCmd);
      this.updateAudio(p);
    }
    this.renderer.render();
    this.onAfterFrame?.(dt);
    this.input.endFrame();
  }

  /** Camera, world and HUD while spectating (the player's jet is down). */
  private spectatorFrame(dt: number, playing: boolean): void {
    const sp = this.spectator;
    const cam = this.renderer.camera;
    const roster = this.mode?.roster() ?? [];
    sp.maintain(dt, roster);
    const pv = this.player ? this.combat.aircraftVis.get(this.player) : undefined;
    pv?.setCockpitView(false);
    this.renderer.setOverlay(null, null);
    let focus: THREE.Vector3;
    if (sp.free || !sp.target) {
      if (!sp.free) sp.enterFree(cam);
      const inp = this.input;
      const look = inp.mouseHeld(2) || inp.mouseHeld(0) || inp.pointerLocked;
      sp.updateFree(dt, inp, cam, look ? inp.mouseDX : 0, look ? inp.mouseDY : 0);
      cam.fov = this.cam.fovBase;
      cam.updateProjectionMatrix();
      focus = cam.position;
    } else {
      if (this.cam.mode !== 'chase') this.cam.setMode('chase');
      this.cam.aimDir = null;
      this.cam.target = null;
      this.cam.deathFocus = null;
      this.cam.update(dt, sp.target, null);
      focus = sp.target.fm.pos;
    }
    cam.updateMatrixWorld();
    this.world.update(dt, cam, focus);
    this.zoneWall.update(dt);
    this.combat.update(playing ? dt : 0, cam);
    this.renderer.setVision(emptyVision());
    this.hud.update(dt, this);
    this.spectatorUi?.update();
    audio.silenceContinuous();
  }

  /** Build / attach the 3D cockpit and keep its pass in sync with the world camera. */
  private updateCockpit(inCockpit: boolean): void {
    const p = this.player;
    const vis = p ? this.combat.aircraftVis.get(p) : undefined;
    if (p) {
      // helmet line of sight when looking off-boresight in the cockpit
      const cam = this.renderer.camera;
      const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      p.headLos = inCockpit && p.alive && look.dot(p.fm.fwd) < Math.cos(4 * DEG) ? look : null;
    }
    if (!p || !vis || !inCockpit || !this.avionics) {
      this.renderer.setOverlay(null, null);
      return;
    }
    const ck = vis.getCockpit();
    if (this.cockpitView.active !== ck) {
      this.cockpitView.attach(ck);
      const ds = this.avionics.bind(ck.layout.displays.map((d) => d.def));
      ck.setScreenTextures(ds.map((d) => d.texture));
    }
    const blink = Math.floor(performance.now() / 350) % 2 === 0;
    const d = p.damage;
    const fm = p.fm;
    const plan = this.avionics.nav.fuelPlan(p);
    const caution = p.alive && (d.fire > 0 || fm.engineOut.some((e) => e) || d.leak > 0 || d.hydraulics < 0.7 || plan.belowBingo || fm.overG > 0.2);
    ck.update({
      pitch: p.controls.pitch,
      roll: p.controls.roll,
      yaw: p.controls.yaw,
      throttle: this.throttleCmd,
      gearPos: fm.gearPos,
      gearHandleDown: this.gearDown,
      lock: p.alive && !!p.lockedTarget,
      shoot: p.alive && this.shootCue(),
      masterCaution: caution,
      fireL: d.fire > 0 && d.fireComponent === 'engineL',
      fireR: d.fire > 0 && (d.fireComponent === 'engineR' || (d.fireComponent !== 'engineL' && d.fireComponent !== null)),
      blink,
    });
    this.cockpitView.sync(this.renderer.camera, p, this.world.env, this.renderer.scene);
    this.renderer.setOverlay(this.cockpitView.scene, this.cockpitView.camera);
  }

  /** The SHOOT cue: selected weapon has a valid target inside its launch zone. */
  shootCue(): boolean {
    const p = this.player;
    if (!p || !p.alive || p.fm.onGround) return false;
    const w = p.selectedWeapon;
    if (w === 'GUN') {
      const t = p.lockedTarget;
      return !!t && p.distanceTo(t) < 1300;
    }
    if (p.countOf(w) === 0) return false;
    const t = w === p.irMissile ? p.seekerTarget : p.lockedTarget;
    if (!t) return false;
    const lz = p.launchZoneFor(w, t);
    const r = p.distanceTo(t);
    return r < lz.rmax && r > lz.rmin;
  }

  /** Mouse click on a cockpit display or bezel button. */
  private clickCockpit(): boolean {
    const av = this.avionics;
    if (!av) return false;
    const rect = this.renderer.canvas.getBoundingClientRect();
    const nx = ((this.input.mouseX - rect.left) / rect.width) * 2 - 1;
    const ny = -((this.input.mouseY - rect.top) / rect.height) * 2 + 1;
    const hit = this.cockpitView.pick(nx, ny);
    if (!hit) return false;
    const ud = hit.object.userData as { slot?: number; kind?: string };
    if (ud.slot === undefined) return false;
    const disp = av.displays[ud.slot];
    if (!disp) return false;
    if (ud.kind === 'osb' && hit.instanceId !== undefined) return av.press(disp, 0, hit.instanceId);
    if (ud.kind === 'screen' && hit.uv) return av.clickUv(disp, hit.uv.x, hit.uv.y);
    return false;
  }

  eyeWorld(): THREE.Vector3 | null {
    const p = this.player;
    if (!p) return null;
    const v = this.combat?.aircraftVis.get(p);
    if (!v) return null;
    return v.cockpitEye.clone().applyQuaternion(p.fm.quat).add(p.fm.pos);
  }

  // ---------------------------------------------------------------------
  // Player input
  // ---------------------------------------------------------------------

  private handleInput(dt: number): void {
    const inp = this.input;
    const p = this.player;
    if (inp.pressed('pause')) {
      this.setState('paused');
      return;
    }
    if (inp.pressed('map')) {
      this.setState('map');
      return;
    }
    if (!p) return;
    if (this.spectator.active) {
      this.spectatorInput();
      return;
    }
    const ms = inp.touch.active ? 'keyboard' : this.settings.input.mouseMode;
    // touch: throttle slider and drag-to-look
    if (inp.touch.active) {
      if (inp.touch.throttle !== null) this.throttleCmd = inp.touch.throttle;
      if (inp.touch.lookX || inp.touch.lookY) this.cam.addLook(inp.touch.lookX * 0.004, inp.touch.lookY * 0.004);
    }
    // cockpit cursor: free the mouse to click display buttons
    if (inp.pressed('cockpitCursor')) {
      this.cockpitCursor = !this.cockpitCursor;
      if (this.cockpitCursor) {
        inp.exitPointerLock();
        if (this.cam.mode !== 'cockpit') this.cam.setMode('cockpit');
        this.message('COCKPIT CURSOR — CLICK DISPLAY BUTTONS · PRESS AGAIN TO FLY', 'info', 3);
      }
    }
    if (this.cam.mode !== 'cockpit') this.cockpitCursor = false;
    if (this.cam.mode === 'cockpit' && inp.mouseClicked(0) && !inp.pointerLocked && (this.cockpitCursor || ms === 'keyboard')) {
      if (this.clickCockpit()) inp.consumeClick(0);
    }
    // pointer lock for mouse flying
    if ((ms === 'joystick' || ms === 'mouseaim') && inp.mouseClicked(0) && !inp.pointerLocked && !this.cockpitCursor) inp.requestPointerLock();
    // displays and navigation
    if (this.avionics) {
      if (inp.pressed('mfdLeft')) this.avionics.cycle(0);
      if (inp.pressed('mfdCenter')) this.avionics.cycle(1);
      if (inp.pressed('mfdRight')) this.avionics.cycle(2);
      if (inp.pressed('stptNext')) {
        const sp = this.avionics.nav.next();
        this.message(`STEERPOINT ${sp.num}: ${sp.name}${sp.tacan ? ' (TCN ' + sp.tacan + ')' : ''}`, 'info', 2.5);
      }
      if (inp.pressed('navRtb')) {
        const sp = this.avionics.nav.selectNearestFriendly(p.fm.pos.x, p.fm.pos.z);
        const d = this.avionics.nav.rangeTo(p.fm.pos.x, p.fm.pos.z) / NM;
        this.message(`RTB: ${sp.name} — ${Math.round(this.avionics.nav.bearingTo(p.fm.pos.x, p.fm.pos.z))}° ${d.toFixed(0)} NM`, 'info', 3);
      }
    }

    // camera controls
    if (inp.pressed('camera')) this.cam.toggleCockpit();
    if (inp.pressed('camCockpit')) this.cam.setMode('cockpit');
    if (inp.pressed('camChase')) this.cam.setMode('chase');
    if (inp.pressed('camFlyby')) this.cam.setMode('flyby');
    if (inp.pressed('camTarget')) this.cam.setMode(this.cam.mode === 'target' ? 'chase' : 'target');
    if (inp.pressed('camWeapon') && p.lastLaunched && p.lastLaunched.alive) this.cam.followMissile(p.lastLaunched);
    if (inp.pressed('lookReset')) this.cam.resetLook();
    if (inp.pressed('zoomIn')) this.cam.zoom = Math.min(4, this.cam.zoom * 1.25);
    if (inp.pressed('zoomOut')) this.cam.zoom = Math.max(0.8, this.cam.zoom / 1.25);
    const looking = inp.mouseHeld(2) || inp.mouseHeld(1);
    this.cam.lookHeld = looking || inp.touch.looking;
    const sens = 0.0025 * this.settings.input.sensitivity;
    if (looking) {
      this.cam.addLook(inp.mouseDX * sens, inp.mouseDY * sens);
    } else if (ms === 'keyboard' && inp.pointerLocked) {
      this.cam.addLook(inp.mouseDX * sens, inp.mouseDY * sens);
    }
    if (inp.wheel !== 0) {
      if (this.cam.mode === 'cockpit') this.cam.zoom = clamp(this.cam.zoom * (inp.wheel > 0 ? 0.9 : 1.1), 0.8, 4);
      else this.cam.chaseDist = clamp(this.cam.chaseDist * (inp.wheel > 0 ? 1.12 : 0.89), 0.45, 6);
    }
    if (inp.gp.active) this.cam.addLook(inp.gp.lookX * dt * 2.5, inp.gp.lookY * dt * 2.5);

    if (!p.alive) {
      if (inp.pressed('fire') && this.mode instanceof FreeFlightMode) this.mode.handle('respawn');
      return;
    }

    // mouse flying
    if (!looking && inp.pointerLocked) {
      if (ms === 'joystick') {
        inp.joyX = clamp(inp.joyX + inp.mouseDX * 0.004 * this.settings.input.sensitivity, -1, 1);
        inp.joyY = clamp(inp.joyY + inp.mouseDY * 0.004 * this.settings.input.sensitivity * (this.settings.input.invertPitch ? -1 : 1), -1, 1);
      } else if (ms === 'mouseaim') {
        const yaw = -inp.mouseDX * sens;
        const pitch = -inp.mouseDY * sens * (this.settings.input.invertPitch ? -1 : 1);
        this.aimDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const right = new THREE.Vector3().crossVectors(this.aimDir, new THREE.Vector3(0, 1, 0)).normalize();
        const cand = this.aimDir.clone().applyAxisAngle(right, pitch);
        if (Math.abs(cand.y) < 0.985) this.aimDir.copy(cand);
        this.aimDir.normalize();
      }
    }
    if (ms === 'joystick') {
      const ret = this.settings.input.joystickReturn;
      if (ret > 0) {
        inp.joyX = damp(inp.joyX, 0, ret, dt);
        inp.joyY = damp(inp.joyY, 0, ret, dt);
      }
    }

    // throttle
    const up = inp.held('throttleUp'), dn = inp.held('throttleDown');
    if (up) {
      if (this.throttleCmd < 1) {
        this.throttleCmd = Math.min(1, this.throttleCmd + dt * 0.55);
        this.throttleHoldAtMil = 0;
      } else {
        // detent at MIL: keep holding to push into afterburner
        this.throttleHoldAtMil += dt;
        if (this.throttleHoldAtMil > 0.35 || this.throttleCmd > 1) this.throttleCmd = Math.min(1.1, this.throttleCmd + dt * 0.3);
      }
    } else this.throttleHoldAtMil = 0;
    if (dn) {
      if (this.throttleCmd > 1) this.throttleCmd = Math.max(1, this.throttleCmd - dt * 0.4);
      else this.throttleCmd = Math.max(0, this.throttleCmd - dt * 0.55);
    }
    if (inp.pressed('afterburner')) this.throttleCmd = this.throttleCmd > 1.0 ? 1.0 : 1.1;
    if (inp.gp.active && Math.abs(inp.gp.throttle) > 0.05) this.throttleCmd = clamp(this.throttleCmd + inp.gp.throttle * dt * 0.6, 0, 1.1);

    // weapons
    if (inp.pressed('weaponGun')) this.selectWeapon('GUN');
    if (inp.pressed('weapon9x') && this.player) this.selectWeapon(this.player.irMissile);
    if (inp.pressed('weapon120') && this.player) this.selectWeapon(this.player.radarMissile);
    if (inp.pressed('cycleWeapon')) {
      p.cycleWeapon();
      audio.click();
    }
    const mouseFire = (inp.pointerLocked || ms === 'keyboard') && !this.cockpitCursor;
    const fireHeld = inp.held('fire') || (inp.mouseHeld(0) && mouseFire);
    const firePressed = inp.pressed('fire') || (inp.mouseClicked(0) && mouseFire);
    p.trigger = fireHeld && p.selectedWeapon === 'GUN';
    if (firePressed && p.selectedWeapon !== 'GUN') this.fireMissile();

    // sensors
    if (inp.pressed('lock') && p.headLos) {
      // helmet look-and-lock: radar if the antenna can reach, otherwise the 9X seeker
      const t = p.helmetTarget(this.sim, p.headLos);
      if (!t) this.message('HMD: NO TARGET IN THE HELMET CUE', 'warn', 2);
      else if (p.radar.setLock(t, this.sim)) {
        audio.beep(1500, 0.08, 0.05);
        this.message(`HMD LOCK — ${t.spec.shortName.toUpperCase()}`, 'good', 2);
      } else if (p.selectedWeapon === p.irMissile && p.countOf(p.irMissile) > 0) {
        p.seekerTarget = t;
        audio.beep(1800, 0.08, 0.05);
        this.message('HMD: AIM-9X SEEKER SLAVED', 'good', 2);
      } else this.message('HMD: TARGET OUTSIDE RADAR LIMITS — SELECT AIM-9X [2]', 'warn', 2.5);
    } else if (inp.pressed('lock')) {
      const t = p.radar.cycleLock(this.sim);
      if (t) audio.beep(1500, 0.08, 0.05);
      else this.message(p.radar.mode === 'OFF' ? 'RADAR OFF (SILENT) — [Y] TO TURN ON' : 'NO RADAR CONTACT TO LOCK', 'warn', 2);
    }
    if (inp.pressed('unlock')) {
      p.radar.setLock(null, this.sim);
      if (p.irst) p.irst.lock = null;
    }
    if (inp.pressed('radarMode')) {
      const m = p.radar.cycleMode();
      this.message(`RADAR ${m === 'ACM' ? 'ACM (AUTO-ACQUIRE)' : m === 'OFF' ? 'SILENT (EMCON)' : m}`, 'info', 2);
    }
    if (inp.pressed('scopeRange')) {
      const r = [10, 20, 40, 80, 160];
      p.radar.scopeRange = r[(r.indexOf(p.radar.scopeRange) + 1) % r.length];
    }
    if (inp.pressed('irst')) {
      if (!p.irst) this.message('NO IRST ON THIS AIRCRAFT (TYPHOON AND SU-35S ONLY)', 'warn', 2);
      else {
        let best: Aircraft | null = null;
        let bd = Infinity;
        for (const c of p.irst.contacts.values()) {
          if (!c.hostile) continue;
          const a = p.radar.anglesTo(c.pos);
          const s = Math.hypot(a.az, a.el);
          if (s < bd) {
            bd = s;
            best = c.target;
          }
        }
        if (best && p.irst.setLock(best, this.sim)) this.message('PIRATE IRST LOCK (PASSIVE)', 'good', 2);
        else this.message('PIRATE: NO IR TRACK', 'warn', 2);
      }
    }
    // countermeasures
    if (inp.pressed('flare')) p.dispense('flare', p.cmBurst);
    if (inp.pressed('chaff')) p.dispense('chaff', p.cmBurst);
    // systems
    if (inp.pressed('gear')) {
      if (p.fm.onGround) this.message('WEIGHT ON WHEELS — GEAR LOCKED', 'warn', 2);
      else {
        this.gearDown = !this.gearDown;
        audio.mechanical();
        this.message(this.gearDown ? 'GEAR DOWN' : 'GEAR UP', 'info', 2);
      }
    }
    if (inp.pressed('speedbrake')) {
      this.speedbrake = !this.speedbrake;
      audio.mechanical();
    }
    if (inp.pressed('gOverride')) {
      this.gOverride = !this.gOverride;
      const tvc = p.spec.tvcDeg > 0;
      this.message(
        this.gOverride
          ? tvc
            ? `SUPERMANOEUVRE: ${p.spec.gOverride} G, THRUST VECTORING TO 70° AOA`
            : `G-LIMITER OVERRIDE: ${p.spec.gOverride} G AVAILABLE`
          : `G-LIMITER ON: ${p.spec.gLimit} G${tvc ? `, ${p.spec.alphaMaxDeg}° AOA` : ''}`,
        this.gOverride ? 'warn' : 'info',
        3,
      );
    }
    if (inp.pressed('dropTanks')) {
      if (p.dropTanks(this.sim)) this.message('FUEL TANKS JETTISONED', 'info', 2);
    }
    if (inp.pressed('autopilot')) this.toggleAutoFlyPanel();
    // a real mouse movement in mouse-aim flying takes control back
    if (this.autoFly.engaged && inp.pointerLocked && ms === 'mouseaim' && Math.abs(inp.mouseDX) + Math.abs(inp.mouseDY) > 40) {
      this.autoFly.disengage();
      this.message('AUTO-FLY DISENGAGED', 'warn', 2);
    }
    if (inp.pressed('rearm')) this.tryRearm();
    if (inp.held('eject')) {
      this.ejectHold += dt;
      if (this.ejectHold > 1) {
        p.eject(this.sim);
        this.ejectHold = 0;
      }
    } else this.ejectHold = 0;
    if (inp.pressed('labels')) {
      const o: GameSettings['gameplay']['labels'][] = ['off', 'dots', 'full'];
      this.settings.gameplay.labels = o[(o.indexOf(this.settings.gameplay.labels) + 1) % 3];
      this.message(`LABELS: ${this.settings.gameplay.labels.toUpperCase()}`, 'info', 1.5);
      saveSettings(this.settings);
    }
    if (inp.pressed('help')) this.hud.toggleHelp();
    if (inp.pressed('hud')) this.hud.toggleHidden();
  }

  private spectatorInput(): void {
    const inp = this.input;
    const v = this.spectatorView();
    if (inp.codePressed('Tab') || inp.codePressed('ArrowRight') || inp.codePressed('Period')) v.cycle(1);
    if (inp.codePressed('ArrowLeft') || inp.codePressed('Comma')) v.cycle(-1);
    if (inp.codePressed('KeyF')) v.toggleFree();
    // free-for-all: fast-forward the rest of the match
    if (RULES.ffa && inp.codePressed('KeyT')) {
      this.timeScale = this.timeScale > 1 ? 1 : 4;
      this.message(this.timeScale > 1 ? 'FAST-FORWARD 4×' : 'NORMAL SPEED', 'info', 2);
    }
    if (!this.spectator.free) {
      if (inp.mouseHeld(2) || inp.mouseHeld(0)) this.cam.addLook(inp.mouseDX * 0.004, inp.mouseDY * 0.004);
      if (inp.wheel !== 0) this.cam.chaseDist = clamp(this.cam.chaseDist * (inp.wheel > 0 ? 1.12 : 0.89), 0.5, 8);
    }
  }

  toggleAutoFlyPanel(): void {
    const panel = this.autoFlyPanel;
    if (!panel || !this.avionics || !this.player) return;
    if (panel.open) {
      panel.hide();
      return;
    }
    this.input.exitPointerLock();
    const af = this.autoFly;
    panel.show(this.avionics.nav.points, af.engaged, { dest: af.dest, speedKts: af.speedKts, altFt: af.altFt });
  }

  engageAutoFly(ch: AutoFlyChoice): void {
    const p = this.player;
    this.autoFlyPanel?.hide();
    if (!p || !p.alive) return;
    if (p.fm.onGround) {
      this.message('AUTO-FLY: TAKE OFF FIRST', 'warn', 2.5);
      return;
    }
    this.autoFly.engage(p, ch.dest, ch.speedKts, ch.altFt);
    if (ch.dest && this.avionics) this.avionics.nav.select(ch.dest.id);
    this.message(`AUTO-FLY ENGAGED → ${ch.dest ? ch.dest.name : 'HOLDING HEADING'} · ${ch.speedKts} KT · ${ch.altFt.toLocaleString('en-US')} FT`, 'good', 4);
  }

  disengageAutoFly(): void {
    this.autoFlyPanel?.hide();
    if (this.autoFly.engaged) this.message('AUTO-FLY DISENGAGED — YOU HAVE CONTROL', 'info', 2.5);
    this.autoFly.disengage();
  }

  selectWeapon(w: WeaponSelect): void {
    const p = this.player;
    if (!p) return;
    if (p.selectWeapon(w)) audio.click();
    else this.message(`NO ${w === 'GUN' ? 'GUN' : MISSILES[w].short} REMAINING`, 'warn', 2);
  }

  private fireMissile(): void {
    const p = this.player!;
    const w = p.selectedWeapon;
    if (w === 'GUN') return;
    if (p.fm.onGround) {
      this.message('WEIGHT ON WHEELS — WEAPONS SAFE', 'warn', 2);
      return;
    }
    if (isIrMissile(w) && !p.seekerTarget) {
      this.message(`${MISSILES[w].short}: NO SEEKER LOCK (LISTEN FOR THE HIGH TONE)`, 'warn', 2);
      return;
    }
    const target = p.missileTarget(w, this.sim);
    const m = p.fireMissile(this.sim, w, target);
    if (!m) return;
    if (!target) this.message('MADDOG LAUNCH — NO TARGET TRACK', 'warn', 2.5);
    const call = launchCall(w);
    audio.voice(call.voice, 'launch', 1.5, call.voiceRu);
  }

  private tryRearm(): void {
    const p = this.player;
    if (!p) return;
    if (RULES.ffa) {
      this.message('NO GROUND CREWS IN A FREE-FOR-ALL — KILLS REARM YOU', 'warn', 3);
      return;
    }
    if (!p.onRunwayStopped) {
      this.message('REARM: STOP ON A FRIENDLY AIRFIELD FIRST (THROTTLE IDLE, BRAKES)', 'warn', 3);
      return;
    }
    if (this.rearmTimer >= 0) return;
    this.rearmTimer = 15;
    this.message('GROUND CREW: REARMING & REFUELING — 15 S', 'info', 4);
  }

  private updateRearm(dt: number): void {
    const p = this.player;
    if (this.rearmTimer < 0 || !p) return;
    if (!p.onRunwayStopped || !p.alive) {
      this.rearmTimer = -1;
      this.message('REARM ABORTED', 'warn', 2);
      return;
    }
    this.rearmTimer -= dt;
    if (this.rearmTimer <= 0) {
      this.rearmTimer = -1;
      p.rearm(true);
      this.combat.refreshStores(p);
      this.message('REARM & REFUEL COMPLETE — JET REPAIRED', 'good', 4);
      audio.mechanical();
    }
  }

  /** Translate input state into the player's flight controls (every physics step). */
  private controlPlayer(dt: number): void {
    const p = this.player;
    if (!p || !p.alive) return;
    const c = p.controls;
    const inp = this.input;
    const ms = inp.touch.active ? 'keyboard' : this.settings.input.mouseMode;
    const inv = this.settings.input.invertPitch ? -1 : 1;
    let pitch = inp.kbPitch * inv;
    let roll = inp.kbRoll;
    let yaw = inp.kbYaw;
    if (inp.touch.active) {
      pitch += inp.touch.pitch * inv;
      roll += inp.touch.roll;
      yaw += inp.touch.yaw;
    }
    const kbActive = Math.abs(inp.kbPitch) > 0.02 || Math.abs(inp.kbRoll) > 0.02 || (inp.touch.active && (Math.abs(inp.touch.pitch) > 0.02 || Math.abs(inp.touch.roll) > 0.02));
    if (inp.gp.active) {
      pitch += inp.gp.pitch * inv;
      roll += inp.gp.roll;
      yaw += inp.gp.yaw;
    }
    c.throttle = this.throttleCmd;
    c.gOverride = this.gOverride;
    c.speedbrake = this.speedbrake;
    if (p.fm.onGround) this.gearDown = true;
    c.gearDown = this.gearDown;
    c.wheelBrake = inp.held('wheelBrake') || (p.fm.onGround && this.speedbrake) ? 1 : 0;

    if (this.autoFly.engaged) {
      if (kbActive || (inp.gp.active && (Math.abs(inp.gp.pitch) + Math.abs(inp.gp.roll) > 0.15)) || p.fm.onGround) {
        this.autoFly.disengage();
        this.message('AUTO-FLY DISENGAGED — YOU HAVE CONTROL', 'warn', 2.5);
      } else {
        this.autoFly.control(p, dt);
        this.throttleCmd = c.throttle;
        this.gearDown = false;
        this.aimDir.copy(p.fm.fwd);
        c.gOverride = false;
        return;
      }
    }

    if (ms === 'mouseaim' && !p.fm.onGround && !kbActive && !inp.gp.active) {
      steerToward(p, this.aimDir, {
        gCap: this.gOverride ? p.spec.gOverride : p.spec.gLimit,
        tau: 0.45,
        override: this.gOverride,
        rudder: yaw,
      });
      c.gOverride = this.gOverride;
      return;
    }
    if (ms === 'mouseaim' && (kbActive || p.fm.onGround)) {
      // keyboard overrides; keep the aim point glued to the nose meanwhile
      this.aimDir.lerp(p.fm.fwd, 0.2).normalize();
    }
    if (ms === 'joystick') {
      pitch += -inp.joyY;
      roll += inp.joyX;
    }
    c.pitch = clamp(pitch, -1, 1);
    c.roll = clamp(roll, -1, 1);
    c.yaw = clamp(yaw, -1, 1);
  }

  // ---------------------------------------------------------------------
  // Warnings & audio
  // ---------------------------------------------------------------------

  private updateWarnings(dt: number): void {
    const p = this.player;
    if (!p || !p.alive) return;
    const fm = p.fm;
    // touchdown grading (a runway spawn is not a touchdown)
    if (fm.touchdowns !== this.touchdownsSeen) {
      this.touchdownsSeen = fm.touchdowns;
      const gl = gradeLanding(p);
      this.message(gl.text, gl.grade === 'HARD' || gl.grade === 'OFF RUNWAY' ? 'warn' : 'good', 7);
      this.sim.events.emit('landing', { aircraft: p, grade: gl });
    }
    // RWR tones
    const lvl = p.rwr.level;
    if (lvl !== this.prevRwr) {
      if (lvl === 'missile') this.voice('Missile, missile');
      else if (lvl === 'lock') audio.rwrNewThreat();
      else if (lvl === 'search' && !this.prevRwr) audio.beep(1200, 0.05, 0.04, 'square');
      this.prevRwr = lvl;
    }
    // ground proximity
    const vs = fm.vel.y;
    if (!fm.onGround && fm.gearPos < 0.5) {
      const tti = vs < -5 ? fm.agl / -vs : Infinity;
      if (tti < 5 && fm.agl < 1500) this.voice('Pull up', 'pullup', 2.5);
      else if (fm.agl < 150 && vs < -3) this.voice('Altitude', 'alt', 4);
    }
    const plan = this.avionics?.nav.fuelPlan(p);
    if (plan && plan.belowBingo && fm.fuelTotal > 0) this.voice('Bingo, bingo', 'bingo', 60);
    if (fm.fuelTotal <= 0) this.voice('Fuel low, engines out', 'fuelout', 30);
    if (fm.overG > 0.5) this.voice('Over G', 'overg', 8);
    if (p.damage.fire > 0) this.voice('Engine fire', 'fire', 10);
    void dt;
  }

  private updateAudio(p: Aircraft): void {
    let rpm = 0;
    for (const r of p.fm.rpm) rpm += r;
    rpm /= p.fm.rpm.length;
    let nearby = 0;
    const cp = this.renderer.camera.position;
    for (const a of this.sim.aircraft) {
      if (a === p || !a.alive) continue;
      const d = a.fm.pos.distanceTo(cp);
      if (d < 1500) nearby = Math.max(nearby, (0.6 + a.fm.afterburner) * (1 - d / 1500));
    }
    const lvl = p.rwr.level;
    audio.updateFlight({
      rpm: p.alive ? rpm : 0,
      ab: p.alive ? p.fm.afterburner : 0,
      qbar: p.fm.qbar,
      tas: p.fm.tas,
      inCockpit: this.cam.mode === 'cockpit',
      alive: p.alive && !p.ejected,
      gunFiring: p.gunFiring,
      gunRpm: p.spec.gun.rpm,
      tone: p.seekerTone,
      rwr: !p.alive ? 'none' : lvl === 'missile' ? 'missile' : lvl === 'lock' ? 'lock' : lvl === 'search' ? 'search' : 'none',
      nearbyJet: nearby,
      stall: p.fm.stallWarning,
    });
  }

  /** Speed / altitude text in the user's units. */
  fmtSpeed(ms: number): string {
    return this.settings.gameplay.units === 'metric' ? `${Math.round(ms * 3.6)}` : `${Math.round(ms / KT)}`;
  }

  fmtAlt(m: number): string {
    return this.settings.gameplay.units === 'metric' ? `${Math.round(m)}` : `${Math.round(m / FT)}`;
  }

  get unitsSpeed(): string {
    return this.settings.gameplay.units === 'metric' ? 'KM/H' : 'KT';
  }

  get unitsAlt(): string {
    return this.settings.gameplay.units === 'metric' ? 'M' : 'FT';
  }
}

export { DEG };
