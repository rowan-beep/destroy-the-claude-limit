// The game shell: owns the renderer, world, simulation, cameras, input,
// audio and HUD; runs the fixed-step loop and translates the player's
// inputs into flight controls and weapon actions.

import { activeMap } from '../world/islands';
import { RenderInterp } from './interp';
import { WeaponSelect, MISSILES, isIrMissile, launchCall, isBomb, weaponShort } from '../weapons/weaponSpecs';
import { BombComputer } from '../weapons/bombing';
import { predictBomb } from '../weapons/bomb';
import * as THREE from 'three';
import { GameRenderer } from '../render/renderer';
import { World, WORLD_QUALITY } from '../world/world';
import { Sim } from './sim';
import { TeamPicture } from './teamPicture';
import { CombatRenderer } from '../render/combatRenderer';
import { CameraRig } from '../render/cameraRig';
import { Input, withGamepad } from '../core/input';
import { GameSettings, saveSettings } from '../core/settings';
import { audio, OtherJetSound } from '../audio/audio';
import { Aircraft } from '../aircraft/aircraft';
import { MissionConfig } from './mission';
import { GameMode, ModeHost, MissionResult, MsgKind, Briefing } from './modes/mode';
import { DailyMode } from './modes/daily';
import { StrikeMode } from './modes/strike';
import { ReconMode } from './modes/recon';
import { CampaignMode } from './modes/campaign';
import { CAMPAIGN } from './campaign';
import type { Weather } from '../world/weather';
import { GroundRenderer } from '../render/groundRenderer';
import { todaysMission } from './daily';
import { FreeFlightMode } from './modes/freeFlight';
import { WavesMode } from './modes/waves';
import { DuelMode } from './modes/duel';
import { TutorialMode } from './modes/tutorial';
import { TeamBattleMode } from './modes/team';
import { FreeForAllMode } from './modes/ffa';
import { OnlineMode } from './modes/online';
import type { NetLink } from '../net/link';
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
import { gradeLanding, setMissionObjective } from '../avionics/nav';
import type { TouchControls } from '../ui/touchControls';
import type { ReplayUi } from '../ui/replayUi';
import { ReplayRecorder, ReplayPlayer } from './replay';
import { SortieRecorder, LogbookData, MissionOutcome, loadLogbook, saveLogbook, commitSortie, medalName } from './logbook';
import { NM } from '../core/constants';
import { prewarmAirframes, setHeroDetail } from '../aircraft/models';
import { randomizeWind, wind } from '../core/weather';
import { AutoFly, topSpeedKts } from './autoFly';
import type { AutoFlyPanel, AutoFlyChoice } from '../ui/autoFlyPanel';
import { enemyTypesFor, AIRCRAFT_TYPES, getSpec } from '../aircraft/specs';
import { CARRIERS, carrierOf, clearCatapults, nearestCarrier, updateCarriers } from '../world/carriers';
import { armCarriers } from './navy';
import { NIGHT } from '../render/night';

export type GameState = 'menu' | 'loading' | 'playing' | 'paused' | 'map' | 'results' | 'replay' | 'briefing';

const GUN_WEAPONS = new Set(['M61', 'BK-27', 'GSh-30', '30M791', 'GUN']);
const CLOUD_DENSITY: Record<string, number> = { low: 0.5, medium: 0.75, high: 1, ultra: 1.35 };

export class Game implements ModeHost {
  readonly renderer: GameRenderer;
  readonly world: World;
  sim!: Sim;
  picture = new TeamPicture();
  combat!: CombatRenderer;
  ground: GroundRenderer | null = null;
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
  mode: GameMode | null = null;
  player: Aircraft | null = null;
  config!: MissionConfig;
  state: GameState = 'menu';
  private accumulator = 0;
  private readonly interp = new RenderInterp();
  private lastT = 0;
  private sunCheckAt = 0;
  private running = false;
  /** mouse-aim direction (world) */
  readonly aimDir = new THREE.Vector3(0, 0, -1);
  throttleCmd = 0.85;
  private throttleHoldAtMil = 0;
  gOverride = false;
  /** heartbeats already played (G-LOC) */
  private heardBeats = 0;
  speedbrake = false;
  gearDown = false;
  /** Auto-Fly (U): flies to a chosen destination at a chosen speed and altitude */
  readonly autoFly = new AutoFly();
  /** bombing computer: ground target designation and the release cue */
  readonly bombComputer = new BombComputer();
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
  /** multiplayer: the connected server, handed over before startMission('online') */
  pendingNet: NetLink | null = null;
  /** multiplayer: the connection dropped (the mission has already ended) */
  onNetLost: ((reason: string) => void) | null = null;
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
    // thunder from storm lightning (the audio delays it by the distance)
    this.world.onThunder = (d) => audio.explosion(d, 12);
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
    setHeroDetail(g.quality);
    this.cam.fovBase = g.fov;
    this.cam.followRoll = s.gameplay.cameraRoll;
    if (this.world.ready) {
      const w = this.world;
      this.renderer.shadowLight = w.env.sun;
      w.setQuality(WORLD_QUALITY[g.quality]);
      w.clouds.setDensity(CLOUD_DENSITY[g.cloudQuality]);
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

  /** called once the theater has been generated (the first launch) */
  onWorldBuilt: (() => void) | null = null;

  /**
   * Generate the theater: the height grid, the digital map and the render
   * objects. The menu never needs it, so this waits for the first launch.
   */
  async ensureWorld(onProgress: (f: number, label: string) => void): Promise<void> {
    if (this.world.ready) return;
    const t0 = performance.now();
    const name = `GENERATING ${activeMap.name} (${activeMap.sizeNm} × ${activeMap.sizeNm} NM)`;
    await this.world.buildGrid((f) => onProgress(f * 0.8, name));
    await this.world.buildMapData((f) => onProgress(0.8 + f * 0.15, 'BUILDING THE DIGITAL MAP'));
    onProgress(0.97, 'BUILDING WORLD');
    this.world.init();
    this.applySettings();
    this.onWorldBuilt?.();
    console.info(`theater ready in ${Math.round(performance.now() - t0)} ms${this.world.pool.usingFallback ? ' (main-thread fallback)' : ''}`);
  }

  async startMission(cfg: MissionConfig, progress: (f: number, label: string) => void): Promise<void> {
    let onProgress = progress;
    // a campaign mission sets its own time of day
    if (cfg.mode === 'campaign') cfg = { ...cfg, timeOfDay: CAMPAIGN[Math.max(0, Math.min(CAMPAIGN.length - 1, cfg.campaignMission ?? 0))].time };
    this.config = cfg;
    this.briefing = null;
    setMissionObjective(null);
    this.setState('loading');
    if (!this.world.ready) {
      await this.ensureWorld((f, l) => progress(f * 0.6, l));
      onProgress = (f, l) => progress(0.6 + f * 0.4, l);
    }
    if (this.combat) this.combat.dispose();
    this.ground?.dispose();
    this.ground = null;
    this.sim = new Sim(this.world.grid);
    this.sim.autoCm = this.settings.gameplay.autoCountermeasures;
    // the carriers start their loops again (every catapult free)
    clearCatapults();
    updateCarriers(0);
    this.picture = new TeamPicture();
    this.combat = new CombatRenderer(this.renderer.scene, this.sim);
    this.ground = new GroundRenderer(this.renderer.scene, this.sim, this.combat);
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
    this.player = null;
    this.deathHandled = false;
    this.rearmTimer = -1;
    this.autopilot = false;
    this.gOverride = false;
    this.speedbrake = false;
    // build the airframes this mission can spawn before the first frame
    const pre = [new Aircraft(cfg.aircraft, 'blue', 'PRE')];
    if (cfg.mode === 'online') for (const t of AIRCRAFT_TYPES) pre.push(new Aircraft(t, 'red', 'PRE'));
    else if (cfg.mode !== 'free') for (const t of enemyTypesFor(cfg.aircraft)) pre.push(new Aircraft(t, 'red', 'PRE'));
    if (cfg.mode === 'team' || cfg.mode === 'recon' || cfg.mode === 'campaign') for (const t of enemyTypesFor(cfg.aircraft)) pre.push(new Aircraft(t, 'blue', 'PRE'));
    if (cfg.mode === 'ffa') pre.push(new Aircraft(cfg.aircraft, 'red', 'PRE'));
    if (cfg.mode === 'daily') pre.push(new Aircraft(todaysMission().enemy.type, 'red', 'PRE'));
    prewarmAirframes(pre);
    this.stopSpectating();
    resetRules();
    this.timeScale = 1;
    if (cfg.mode === 'online' && !this.pendingNet) throw new Error('not connected to a server');
    this.mode =
      cfg.mode === 'online'
        ? this.makeOnline(this.pendingNet!)
        : cfg.mode === 'free'
        ? new FreeFlightMode(this)
        : cfg.mode === 'waves'
          ? new WavesMode(this)
          : cfg.mode === 'team'
            ? new TeamBattleMode(this)
            : cfg.mode === 'ffa'
              ? new FreeForAllMode(this)
              : cfg.mode === 'tutorial'
                ? new TutorialMode(this)
                : cfg.mode === 'daily'
                  ? new DailyMode(this)
                  : cfg.mode === 'strike'
                    ? new StrikeMode(this)
                    : cfg.mode === 'recon'
                      ? new ReconMode(this)
                      : cfg.mode === 'campaign'
                        ? new CampaignMode(this)
                        : new DuelMode(this);
    randomizeWind();
    // every sortie starts with the goggles stowed (left on from a night flight they would
    // wash a daylight one out in green)
    NIGHT.nvg = false;
    this.mode.start();
    armCarriers(this.sim, cfg.difficulty);
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
    // compile every shader the opening scene needs while the loading screen is
    // up (in parallel where the browser can), instead of stalling in flight
    onProgress(0.98, 'PREPARING SHADERS');
    await this.renderer.compileFor(this.renderer.scene, this.renderer.scene, this.renderer.camera).catch(() => undefined);
    onProgress(1, 'READY');
    this.goLive();
    this.lastT = performance.now();
    this.accumulator = 0;
  }

  private makeOnline(net: NetLink): OnlineMode {
    this.pendingNet = null;
    const m = new OnlineMode(this, net);
    m.onLost = (reason) => {
      this.endMission();
      this.onNetLost?.(reason);
    };
    return m;
  }

  /** In a multiplayer match the world keeps going while the pause menu or map is up. */
  get online(): boolean {
    return this.mode instanceof OnlineMode;
  }

  endMission(): void {
    if (this.player) this.finishSortie(this.player.alive ? (this.player.fm.onGround ? 'LANDED' : 'RTB') : 'LOST');
    this.mode?.dispose();
    this.mode = null;
    if (this.sim) {
      for (const a of [...this.sim.aircraft]) this.sim.remove(a);
      this.sim.missiles.length = 0;
      this.sim.bombs.length = 0;
      this.sim.ground.length = 0;
      this.sim.defenses.length = 0;
      this.sim.bullets.clear();
      this.sim.cms.clear();
      this.sim.events.clear();
    }
    this.combat?.clearEffects();
    this.ground?.dispose();
    this.ground = null;
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
    this.briefing = null;
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
      this.hud.feed(k ? `${k.groundLabel ? k.callsign : `${k.callsign} [${k.spec.shortName}]`} >> ${e.weapon} >> ${v.callsign} [${v.spec.shortName}]` : `${v.callsign} [${v.spec.shortName}] — ${e.cause}`, RULES.ffa ? (k === this.player ? 'blue' : 'red') : v.team === 'red' ? 'blue' : 'red');
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
      } else if (e.shooter === this.player && GUN_WEAPONS.has(e.weapon)) {
        // hit markers are for gun hits (missile hits read 'AIM-..' or 'R-..')
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
    // an air-launched rocket ship drops with its engine off: the pilot lights it
    this.throttleCmd = p.spec.airLaunch ? 0 : 0.85;
    this.gOverride = false;
    this.aimDir.set(0, 0, -1);
    this.combat.playerAircraft = p;
    this.avionics?.dispose();
    this.avionics = new Avionics(this, p);
    this.cockpitView.attach(null);
    this.touchdownsSeen = 0;
    this.sortie = new SortieRecorder(p, cfg.mode, this.sim);
    return p;
  }

  cameraMode(): string {
    return this.cam.mode;
  }

  throttle(): number {
    return this.throttleCmd;
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
      this.renderer.updateDroplets(dt, this.world.precip.rainOnCamera, this.world.precip.camSpeed);
    }
    this.renderer.setVision(emptyVision());
    this.renderer.setHaze([]);
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
    this.message(this.online ? 'SPECTATING — [TAB] NEXT PILOT · [F] FREE CAMERA' : RULES.ffa ? 'YOU ARE OUT — SPECTATING TO THE END · [T] FAST-FORWARD' : 'YOU ARE DOWN — SPECTATING UNTIL THE ROUND ENDS', 'info', 4);
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
      kills: (a: Aircraft) => (this.mode instanceof FreeForAllMode || this.mode instanceof OnlineMode ? this.mode.killsOf(a) : a.kills),
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
    this.throttleCmd = p.fm.onGround ? 0 : Math.max(0.85, p.controls.throttle);
    this.gearDown = p.fm.onGround;
    this.speedbrake = false;
    this.gOverride = false;
    this.autopilot = false;
    this.aimDir.copy(p.fm.fwd);
  }

  /** the campaign's NEXT MISSION button (the app shell loads it) */
  onNextMission: ((cfg: MissionConfig) => void) | null = null;
  /** the player's own weather while a mission has made the night pitch black */
  private savedWeather: Weather | null = null;

  setDark(on: boolean): void {
    if (on) {
      if (!this.savedWeather) this.savedWeather = { ...this.world.weather };
      this.world.setWeather({ ...this.world.weather, dark: true });
    } else if (this.savedWeather) {
      this.world.setWeather(this.savedWeather);
      this.savedWeather = null;
    } else return;
    if (this.world.ready) this.world.env.buildEnvMap(this.renderer.renderer);
  }

  handleResult(action: string): void {
    if (action === 'next' && this.mode instanceof CampaignMode) {
      const cfg = { ...this.config, campaignMission: this.mode.idx + 1 };
      this.endMission();
      this.onNextMission?.(cfg);
      return;
    }
    if (action === 'replay') {
      this.startReplay();
      return;
    }
    if (action === 'menu') {
      this.endMission();
      return;
    }
    this.mode?.handle(action as never);
    this.recorder?.stop();
    this.recorder = new ReplayRecorder(this.sim, this.config.mode.toUpperCase());
    if (this.player) {
      this.syncPlayerControls();
      this.cam.setMode('chase');
      this.hud.reset(this);
    }
    this.goLive();
  }

  /** a mode's briefing waiting for the player's OKAY (the sim holds until then) */
  briefing: Briefing | null = null;

  brief(b: Briefing): void {
    this.briefing = b;
    if (this.state === 'playing') this.setState('briefing');
  }

  private goLive(): void {
    this.setState(this.briefing ? 'briefing' : 'playing');
  }

  /** OKAY on the briefing box: the mission starts. */
  /** A decision briefing: the player picked choice `i`. */
  chooseBriefing(i: number): void {
    if (this.state !== 'briefing') return;
    const c = this.briefing?.choices?.[i];
    if (!c) return;
    this.briefing = null;
    this.lastT = performance.now();
    this.accumulator = 0;
    this.setState('playing');
    c.pick();
  }

  acceptBriefing(): void {
    if (this.state !== 'briefing') return;
    if (this.briefing?.choices?.length) return;
    const b = this.briefing;
    this.briefing = null;
    this.lastT = performance.now();
    this.accumulator = 0;
    this.setState('playing');
    b?.onOk?.();
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
    this.interp.restore();
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
    if (playing) this.renderer.adaptFrame(dt);
    this.input.update(dt);
    if (playing) this.handleInput(dt);
    else if (this.input.pressed('pause') && this.state === 'map') this.setState('playing');

    const simOn = playing || (this.online && (this.state === 'paused' || this.state === 'map'));
    if (simOn && this.player) {
      const simDt = dt * this.timeScale;
      this.accumulator += simDt;
      let steps = 0;
      while (this.accumulator >= PHYSICS_DT && steps < 30) {
        this.controlPlayer(PHYSICS_DT);
        this.picture.update(PHYSICS_DT, this.sim);
        this.interp.beforeStep(this.sim);
        this.sim.step(PHYSICS_DT);
        this.recorder?.update();
        this.accumulator -= PHYSICS_DT;
        steps++;
      }
      if (steps >= 30) this.accumulator = 0;
      this.sortie?.update(steps * PHYSICS_DT);
      // the mission runs on simulated time: it speeds up with fast-forward
      // (the free-for-all zone used to ignore it)
      this.mode?.update(steps * PHYSICS_DT);
      this.updateRearm(dt);
      this.updateCarrierCalls();
      this.updateWarnings(dt);
    }

    // night-vision goggles: the round tube view only from the cockpit
    NIGHT.tube = this.cam.mode === 'cockpit';
    // high-refresh displays: draw everything part-way to the next physics step
    if (this.player) this.interp.apply(this.sim, this.accumulator / PHYSICS_DT);
    const p = this.player;
    // team battle: once shot down, spectate after a few seconds
    if (p && simOn && !p.alive && this.mode && !this.mode.over && this.mode.roster().length > 0) {
      this.deadTime += dt;
      if (!this.spectator.active && this.deadTime > 3.5) this.startSpectating();
    }
    if (p && this.spectator.active) {
      this.spectatorFrame(dt, simOn);
      this.renderer.render();
      this.interp.restore();
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
      this.renderer.updateDroplets(dt, this.world.precip.rainOnCamera, this.world.precip.camSpeed);
      this.zoneWall.update(dt);
      this.combat.update(simOn ? dt : 0, this.renderer.camera);
      this.ground?.update(simOn ? dt : 0, this.renderer.camera);
      this.renderer.setHaze(this.combat.haze);
      this.renderer.setSpeed(this.cam.mode === 'cockpit' || this.cam.mode === 'chase' ? p.fm.vel.length() : 0);
      // pilot vision (with the G limiter on G-LOC cannot happen: blur instead)
      p.pilot.limiter = !this.gOverride;
      this.renderer.setVision(p.alive || !p.fm.crashed ? p.pilot.vision : emptyVision());
      audio.setBlackedOut(p.alive && p.pilot.unconscious);
      if (p.pilot.beatCount !== this.heardBeats) {
        this.heardBeats = p.pilot.beatCount;
        if (p.alive && p.pilot.unconscious) audio.heartbeat(p.pilot.lastBeatStrong);
      }
      this.bombComputer.update(p, this.sim, dt);
      this.hud.update(dt, this);
      this.touch?.sync(this.throttleCmd);
      this.updateAudio(p);
    }
    this.renderer.render();
    this.interp.restore();
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
    this.renderer.updateDroplets(dt, this.world.precip.rainOnCamera, this.world.precip.camSpeed);
    this.zoneWall.update(dt);
    this.combat.update(playing ? dt : 0, cam);
    this.ground?.update(playing ? dt : 0, cam);
    this.renderer.setHaze(this.combat.haze);
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
    // is the sun in clear view (not behind a mountain)? checked a few times a second
    const now = performance.now();
    if (now - this.sunCheckAt > 250) {
      this.sunCheckAt = now;
      const sd = this.world.env.sunDir;
      const e = this.renderer.camera.position;
      this.cockpitView.sunVisible = sd.y > -0.05 && this.sim.grid.lineOfSight(e.x, e.y, e.z, e.x + sd.x * 30000, e.y + sd.y * 30000, e.z + sd.z * 30000) ? 1 : 0;
    }
    this.cam.head.strength = this.settings.gameplay.headMotion;
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
    if (isBomb(w)) return this.bombComputer.cue.state === 'inRange' && p.countOf(w) > 0;
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
      // respawn through the same path as the results button, so the camera,
      // HUD, gear handle and throttle are reset along with the jet
      if (inp.pressed('fire') && this.mode instanceof FreeFlightMode) this.handleResult('respawn');
      return;
    }
    // G-LOC: the pilot is out cold. No stick, throttle, weapons or switches
    // until they come round (the camera, pause and map still work); the
    // mouse-aim point rides with the jet so waking up does not yank it round
    if (p.pilot.unconscious) {
      p.trigger = false;
      this.aimDir.copy(p.fm.fwd);
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
    if (inp.pressed('weaponBomb') && this.player) {
      const b = this.player.bombType;
      if (b) this.selectWeapon(b);
      else this.message('NO BOMBS ON THIS LOADOUT — PICK A STRIKE LOADOUT', 'warn', 2.5);
    }
    if (inp.pressed('cycleWeapon')) {
      p.cycleWeapon();
      audio.click();
    }
    const mouseFire = (inp.pointerLocked || ms === 'keyboard') && !this.cockpitCursor;
    const fireHeld = inp.held('fire') || (inp.mouseHeld(0) && mouseFire);
    const firePressed = inp.pressed('fire') || (inp.mouseClicked(0) && mouseFire);
    p.trigger = fireHeld && p.selectedWeapon === 'GUN';
    if (p.trigger && RULES.holdFire && inp.pressed('fire')) this.message('WEAPONS HOLD — WAIT FOR WEAPONS FREE', 'warn', 2);
    if (firePressed && p.selectedWeapon !== 'GUN') this.fireMissile();

    // sensors
    if (inp.pressed('lock') && isBomb(p.selectedWeapon)) {
      const t = BombComputer.cycle(p, this.sim);
      if (t) {
        audio.beep(1300, 0.06, 0.05);
        this.message(`DESIGNATED: ${t.label}`, 'info', 1.8);
      } else this.message('NO GROUND TARGETS IN RANGE', 'warn', 2);
    } else if (inp.pressed('lock') && p.headLos) {
      // helmet look-and-lock: radar if the antenna can reach, otherwise the 9X seeker
      const t = p.helmetTarget(this.sim, p.headLos);
      if (!t) this.message('HMD: NO TARGET IN THE HELMET CUE', 'warn', 2);
      else if (p.radar.setLock(t, this.sim)) {
        audio.beep(1500, 0.08, 0.05);
        this.message(`HMD LOCK — ${t.spec.shortName.toUpperCase()}`, 'good', 2);
      } else if (p.selectedWeapon === p.irMissile && p.countOf(p.irMissile) > 0) {
        p.seekerTarget = t;
        audio.beep(1800, 0.08, 0.05);
        this.message(`HMD: ${MISSILES[p.irMissile].short} SEEKER SLAVED`, 'good', 2);
      } else this.message(`HMD: TARGET OUTSIDE RADAR LIMITS — SELECT ${MISSILES[p.irMissile].short} [2]`, 'warn', 2.5);
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
      if (!p.irst) this.message(`NO IRST ON THIS AIRCRAFT (${AIRCRAFT_TYPES.filter((t) => getSpec(t).irst).map((t) => getSpec(t).shortName.toUpperCase()).join(', ')} ONLY)`, 'warn', 2.5);
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
        const irst = p.type === 'SU35' ? 'OLS-35' : p.type === 'MIG31' ? '8TK' : p.type === 'RAFALE' ? 'OSF' : p.type === 'SU57' ? '101KS-V' : p.type === 'F35A' ? 'EOTS' : p.type === 'GRIPEN' ? 'SKYWARD-G' : 'PIRATE';
        if (best && p.irst.setLock(best, this.sim)) this.message(`${irst} IRST LOCK (PASSIVE)`, 'good', 2);
        else this.message(`${irst}: NO IR TRACK`, 'warn', 2);
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
    if (inp.pressed('nvg')) {
      NIGHT.nvg = !NIGHT.nvg;
      this.message(NIGHT.nvg ? 'NIGHT VISION ON' : 'NIGHT VISION OFF', 'info', 2);
      audio.mechanical();
    }
    if (inp.pressed('rearm')) {
      // in the air near carriers the same key works the tailhook
      if (!p.fm.onGround && CARRIERS.length) {
        p.fm.hookDown = !p.fm.hookDown;
        this.message(p.fm.hookDown ? 'HOOK DOWN' : 'HOOK UP', 'info', 2);
      } else this.tryRearm();
    }
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
    // (never online: everyone shares one clock)
    if (RULES.ffa && !this.online && inp.codePressed('KeyT')) {
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
    const p = this.player;
    panel.show(this.avionics.nav.points, af.engaged, { dest: af.dest, speedKts: af.speedKts, altFt: af.altFt, autoLand: af.autoLand, ab: af.abMode }, { maxKts: topSpeedKts(p.spec.maxMach), ceilingFt: p.spec.ceilingFt, onGround: p.fm.onGround });
  }

  engageAutoFly(ch: AutoFlyChoice): void {
    const p = this.player;
    this.autoFlyPanel?.hide();
    if (!p || !p.alive) return;
    this.autoFly.onCall = (t, k) => this.message(`AUTO-FLY: ${t}`, k, 3.5);
    this.autoFly.engage(p, ch.dest, ch.speedKts, ch.altFt, ch.autoLand, ch.ab);
    if (ch.dest && this.avionics) this.avionics.nav.select(ch.dest.id);
    this.gearDown = p.fm.onGround;
    const land = (ch.autoLand && ch.dest?.field ? ' · AUTO-LAND' : '') + (ch.ab === 'max' ? ' · AB MAX' : ch.ab === 'off' ? ' · NO AB' : '');
    this.message(`AUTO-FLY ENGAGED → ${ch.dest ? ch.dest.name : 'HOLDING HEADING'} · ${ch.speedKts} KT · ${ch.altFt.toLocaleString('en-US')} FT${land}`, 'good', 4);
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
    else this.message(isBomb(w) ? 'NO BOMBS ON THIS LOADOUT — PICK A STRIKE LOADOUT' : `NO ${weaponShort(w)} REMAINING`, 'warn', 2);
  }

  /** Release a guided bomb on the designated ground target. */
  private dropBomb(): void {
    const p = this.player!;
    if (p.fm.onGround) {
      this.message('WEIGHT ON WHEELS — WEAPONS SAFE', 'warn', 2);
      return;
    }
    if (RULES.holdFire) {
      this.message('WEAPONS HOLD — WAIT FOR WEAPONS FREE', 'warn', 2);
      return;
    }
    const t = BombComputer.autoDesignate(p, this.sim);
    if (!t) {
      this.message('NO GROUND TARGET TO DESIGNATE', 'warn', 2);
      return;
    }
    const type = p.bombType!;
    const aim = t.aimPoint();
    const pred = predictBomb(type, p.fm.pos.clone().addScaledVector(p.fm.up, -1.5), p.fm.vel, aim);
    // (from a weapons bay it leaves once the doors are fully open)
    p.releaseBomb(this.sim, t, aim, (b) => {
      b.tof = pred.tof;
      this.message(`${weaponShort(type)} AWAY → ${t.label} · IMPACT ${Math.round(pred.tof)} S${pred.hit ? '' : ' (OUTSIDE THE ZONE: IT WILL FALL SHORT)'}`, pred.hit ? 'good' : 'warn', 3);
      const ru = p.type === 'SU35' || p.type === 'MIG31' || p.type === 'SU57';
      audio.voice(ru ? 'Sbros' : 'Pickle', 'launch', 1.2, ru ? 'Сброс!' : undefined);
      // the computer moves on to the next target nobody has a bomb on
      if (t.claimed > 0 && p.groundTarget === t) {
        p.groundTarget = null;
        BombComputer.autoDesignate(p, this.sim);
      }
    });
  }

  private fireMissile(): void {
    const p = this.player!;
    const w = p.selectedWeapon;
    if (w === 'GUN') return;
    if (isBomb(w)) {
      this.dropBomb();
      return;
    }
    if (p.fm.onGround) {
      this.message('WEIGHT ON WHEELS — WEAPONS SAFE', 'warn', 2);
      return;
    }
    if (RULES.holdFire) {
      this.message('WEAPONS HOLD — WAIT FOR WEAPONS FREE', 'warn', 2);
      return;
    }
    if (isIrMissile(w) && !p.seekerTarget) {
      this.message(`${MISSILES[w].short}: NO SEEKER LOCK (LISTEN FOR THE HIGH TONE)`, 'warn', 2);
      return;
    }
    const target = p.missileTarget(w, this.sim);
    // (from a weapons bay it leaves once the doors are fully open)
    p.fireMissile(this.sim, w, target, () => {
      if (!target) this.message('MADDOG LAUNCH — NO TARGET TRACK', 'warn', 2.5);
      const call = launchCall(w);
      audio.voice(call.voice, 'launch', 1.5, call.voiceRu);
    });
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

  /** What the flight deck tells you: catapult hook-up, the shot, the trap, a bolter. */
  private deckSeen = { ac: null as Aircraft | null, cat: false, salute: false, shots: 0, traps: 0, bolters: 0, hookCall: false, away: false };
  private updateCarrierCalls(): void {
    const p = this.player;
    if (!p || !CARRIERS.length) return;
    const fm = p.fm;
    const s = this.deckSeen;
    if (s.ac !== p) Object.assign(s, { ac: p, cat: false, salute: false, shots: fm.catShots, traps: fm.traps, bolters: fm.bolters, hookCall: false, away: false });
    const cat = fm.cat;
    if (cat && !s.cat) this.message(`ON CATAPULT ${cat.idx + 1}, ${cat.carrier.name}. FULL THROTTLE TO LAUNCH`, 'info', 7);
    s.cat = !!cat;
    if (cat && cat.phase === 'hold' && cat.t > 0.05 && !s.salute) {
      s.salute = true;
      this.message('SALUTE. HOLD FULL POWER…', 'info', 2);
    }
    if (!cat) s.salute = false;
    if (fm.catShots !== s.shots) {
      s.shots = fm.catShots;
      this.message('CAT SHOT. GEAR UP WHEN CLIMBING', 'good', 3);
    }
    if (fm.traps !== s.traps) {
      s.traps = fm.traps;
      const t = fm.lastTrap;
      this.message(`TRAPPED: ${t.wire} WIRE · ${t.grade}. THROTTLE IDLE · H TO REARM`, t.grade === 'OK' ? 'good' : 'info', 6);
    }
    if (fm.bolters !== s.bolters) {
      s.bolters = fm.bolters;
      this.message('BOLTER, BOLTER, BOLTER. FULL POWER, GO AROUND', 'warn', 4);
    }
    // a reminder on the way back in: gear down near a ship with the hook still up
    if (fm.onGround) {
      s.hookCall = false;
      s.away = false;
    } else {
      const n = nearestCarrier(fm.pos.x, fm.pos.z);
      if (n && n.d > 7000) s.away = true;
      if (s.away && !s.hookCall && fm.gearPos > 0.5 && !fm.hookDown && n && n.d < 4000 && n.c.f.team === p.team) {
        s.hookCall = true;
        this.message('HOOK IS UP. PRESS H TO LOWER IT FOR THE WIRES', 'warn', 4);
      }
    }
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
      // on a carrier the deck crew taxis you onto a free catapult
      const cv = carrierOf(p.fm.surfaceKind === 'deck' ? p.fm.surfaceField : null);
      if (cv && !p.fm.cat) {
        const idx = cv.freeCat();
        if (idx >= 0) {
          p.fm.attachCat(cv, idx);
          p.controls.throttle = 0;
          p.fm.throttleLever = 0;
        }
      }
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
      const af = this.autoFly;
      const onGroundOk = af.phase === 'takeoff' || af.phase === 'rollout' || af.phase === 'stopped' || af.phase === 'flare' || af.phase === 'final' || af.phase === 'climb';
      if (kbActive || (inp.gp.active && (Math.abs(inp.gp.pitch) + Math.abs(inp.gp.roll) > 0.15)) || (p.fm.onGround && !onGroundOk)) {
        af.disengage();
        this.message('AUTO-FLY DISENGAGED — YOU HAVE CONTROL', 'warn', 2.5);
      } else {
        c.throttle = this.throttleCmd;
        af.control(p, dt);
        this.throttleCmd = c.throttle;
        this.gearDown = c.gearDown;
        this.speedbrake = c.speedbrake;
        this.aimDir.copy(p.fm.fwd);
        c.gOverride = false;
        if (af.phase === 'stopped') {
          af.disengage();
          this.throttleCmd = 0;
        }
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
    const cp = this.renderer.camera.position;
    // nearest other jet to the listener (Doppler flyby)
    let fb: Aircraft | null = null;
    let fbd = Infinity;
    for (const a of this.sim.aircraft) {
      if (a === p || !a.alive) continue;
      const d = a.fm.pos.distanceTo(cp);
      if (d < fbd) {
        fbd = d;
        fb = a;
      }
    }
    let closing = 0;
    if (fb) {
      const rx = fb.fm.pos.x - cp.x, ry = fb.fm.pos.y - cp.y, rz = fb.fm.pos.z - cp.z;
      const rl = Math.max(1, Math.hypot(rx, ry, rz));
      const vx = fb.fm.vel.x - p.fm.vel.x, vy = fb.fm.vel.y - p.fm.vel.y, vz = fb.fm.vel.z - p.fm.vel.z;
      closing = -(vx * rx + vy * ry + vz * rz) / rl;
    }
    // where the camera sits relative to the jet (behind = roar, ahead = turbine)
    const dx = cp.x - p.fm.pos.x, dy = cp.y - p.fm.pos.y, dz = cp.z - p.fm.pos.z;
    const camDist = Math.hypot(dx, dy, dz);
    const f = p.fm.fwd;
    const camAspect = camDist > 1 ? (f.x * dx + f.y * dy + f.z * dz) / camDist : 0;
    // the jets nearest the listener, each with its own sound
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.renderer.camera.quaternion);
    const others: OtherJetSound[] = [];
    for (const a of this.sim.aircraft) {
      if (a === p || !a.alive) continue;
      const rx = a.fm.pos.x - cp.x, ry = a.fm.pos.y - cp.y, rz = a.fm.pos.z - cp.z;
      const d = Math.hypot(rx, ry, rz);
      if (d > 3500) continue;
      const rl = Math.max(1, d);
      const vx = a.fm.vel.x - p.fm.vel.x, vy = a.fm.vel.y - p.fm.vel.y, vz = a.fm.vel.z - p.fm.vel.z;
      const af = a.fm.fwd;
      let arpm = 0;
      for (const r of a.fm.rpm) arpm += r;
      others.push({
        id: a.id,
        dist: d,
        closing: -(vx * rx + vy * ry + vz * rz) / rl,
        pan: (right.x * rx + right.y * ry + right.z * rz) / rl,
        aspect: -(af.x * rx + af.y * ry + af.z * rz) / rl,
        ab: a.fm.afterburner,
        rpm: arpm / a.fm.rpm.length,
        type: a.type,
      });
    }
    others.sort((a, b) => a.dist - b.dist);
    const lvl = p.rwr.level;
    audio.updateFlight({
      others: others.slice(0, 3),
      onGround: p.fm.onGround,
      gs: p.fm.gs,
      vs: p.fm.vs,
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
      nearbyJet: 0,
      stall: p.fm.stallWarning,
      type: p.type,
      camAspect,
      camDist,
      g: p.fm.nz,
      aoa: p.fm.alpha,
      buffet: p.fm.buffet,
      gear: p.fm.gearPos,
      speedbrake: this.speedbrake,
      mach: p.fm.mach,
      flybyDist: fbd,
      flybyClosing: closing,
      flybyAb: fb ? fb.fm.afterburner : 0,
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
