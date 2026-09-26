// Application bootstrap: builds the theater, then shows the main menu.
import { CustomizeScreen } from './ui/menu/customizeScreen';
import { SpectatorUi } from './ui/spectatorUi';
import { AutoFlyPanel } from './ui/autoFlyPanel';
import './styles.css';
import './ui/ui.css';
import { Game } from './game/game';
import { loadSettings, saveSettings } from './core/settings';
import { defaultMission, MissionConfig } from './game/mission';
import { Hud } from './ui/hud/hud';
import { MainMenu } from './ui/menu/mainMenu';
import { Hangar } from './ui/menu/hangar';
import { LoadingScreen, PauseMenu, ResultsScreen, ControlsModal } from './ui/menu/screens';
import { SettingsModal } from './ui/menu/settingsModal';
import { LogbookModal } from './ui/menu/logbookScreen';
import { TouchControls, isTouchDevice } from './ui/touchControls';
import { ReplayUi } from './ui/replayUi';
import { MapView } from './ui/mapView';
import { audio } from './audio/audio';
import type { AircraftType } from './aircraft/specs';

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  const settings = loadSettings();
  const loading = new LoadingScreen(document.body);
  loading.set(0.02, 'STARTING');

  const game = new Game(app, settings);
  const hud = new Hud(document.body);
  hud.setVisible(false);
  game.hud = hud;
  (window as unknown as { game: Game }).game = game;

  const t0 = performance.now();
  await game.world.buildGrid((f) => loading.set(0.05 + f * 0.8, 'GENERATING THE 400 × 400 NM THEATER'));
  await game.world.buildMapData((f) => loading.set(0.85 + f * 0.07, 'BUILDING THE DIGITAL MAP'));
  loading.set(0.93, 'BUILDING WORLD');
  game.world.init();
  game.applySettings();
  const mapView = new MapView(document.body, () => game.setState('playing'));
  mapView.setGrid(game.world.grid);
  const hangar = new Hangar(game.renderer.renderer);
  const customize = new CustomizeScreen(document.body, hangar, () => {
    menu.root.classList.remove('hidden');
    hangar.setJet(menu.cfg.aircraft, menu.cfg.loadoutId);
  });
  console.info(`theater ready in ${Math.round(performance.now() - t0)} ms${game.world.pool.usingFallback ? ' (main-thread fallback)' : ''}`);

  const cfg: MissionConfig = defaultMission();
  if (settings.lastAircraft === 'F15EX' || settings.lastAircraft === 'FA18EF' || settings.lastAircraft === 'TYPHOON') cfg.aircraft = settings.lastAircraft as AircraftType;
  cfg.loadoutId = settings.lastLoadout[cfg.aircraft] ?? '';
  cfg.timeOfDay = settings.gameplay.timeOfDay;

  const settingsModal = new SettingsModal(document.body, settings, game.input, () => {
    game.applySettings();
    hud.reset(game);
  });
  const controls = new ControlsModal(document.body);
  const logbook = new LogbookModal(document.body, (fresh) => (game.logbook = fresh));
  const touch = new TouchControls(document.body, game.input);
  game.touch = touch;
  game.autoFlyPanel = new AutoFlyPanel(
    document.body,
    (c) => game.engageAutoFly(c),
    () => game.disengageAutoFly(),
    () => game.autoFlyPanel?.hide(),
  );
  game.spectatorUi = new SpectatorUi(document.body, game.spectatorView());
  game.replayUi = new ReplayUi(document.body, game.cam, () => game.exitReplay());
  const touchWanted = () => settings.gameplay.touchControls === 'on' || (settings.gameplay.touchControls === 'auto' && isTouchDevice());

  let menu: MainMenu;
  const fly = async (c: MissionConfig) => {
    audio.init();
    audio.click();
    settings.lastAircraft = c.aircraft;
    settings.lastLoadout[c.aircraft] = c.loadoutId;
    settings.gameplay.timeOfDay = c.timeOfDay;
    saveSettings(settings);
    menu.show(false);
    loading.show(true);
    loading.set(0.05, 'PREPARING MISSION');
    await game.startMission(c, (f, l) => loading.set(0.1 + f * 0.9, l));
    loading.show(false);
  };
  menu = new MainMenu(document.body, cfg, {
    onFly: (c) => void fly(c),
    onSettings: () => {
      audio.init();
      settingsModal.show(true);
    },
    onControls: () => controls.show(true, settings.input),
    onLogbook: () => logbook.show(game.logbook),
    onSelectJet: (t, l) => hangar.setJet(t, l),
    onCustomize: (t) => {
      menu.root.classList.add('hidden');
      customize.show(t);
    },
  });

  const pause = new PauseMenu(document.body, {
    resume: () => game.setState('playing'),
    settings: () => settingsModal.show(true),
    controls: () => controls.show(true, settings.input),
    restart: () => {
      pause.show(false);
      game.handleResult('retry');
    },
    quit: () => game.endMission(),
  });
  const results = new ResultsScreen(
    document.body,
    (a) => {
      results.show(null);
      game.handleResult(a);
    },
    () => game.world.mapData ?? null,
  );
  game.onResults = (r) => results.show(r);

  game.onStateChange = (s) => {
    menu.show(s === 'menu');
    hud.setVisible(s === 'playing' || s === 'paused' || s === 'results' || s === 'map');
    pause.show(s === 'paused');
    touch.show(s === 'playing' && touchWanted());
    mapView.show(s === 'map', game);
    if (s !== 'results') results.show(null);
    if (s === 'menu') {
      loading.show(false);
      hangar.setJet(cfg.aircraft, cfg.loadoutId);
    }
  };
  game.onMenuFrame = (dt) => {
    const sz = game.renderer.size;
    hangar.render(dt, sz.w, sz.h);
  };
  game.onAfterFrame = () => {
    if (game.state === 'map') mapView.draw(game);
  };

  // keys that work while the flight input is disabled (pause / map)
  window.addEventListener('keydown', (e) => {
    if (game.state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) {
      e.preventDefault();
      game.setState('playing');
    } else if (game.state === 'map' && (e.code === 'Escape' || e.code === 'KeyM')) {
      e.preventDefault();
      game.setState('playing');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') game.setState('paused');
  });

  hangar.setJet(cfg.aircraft, menu.cfg.loadoutId);
  loading.set(1, 'READY');
  loading.show(false);
  game.setState('menu');
  game.startLoop();
}

const q = new URLSearchParams(location.search);
if (q.get('test') === 'world') {
  import('./testWorld').then((m) => m.runWorldTest(document.getElementById('app')!));
} else if (q.get('test') === 'models') {
  import('./testModels').then((m) => m.runModelTest(document.getElementById('app')!));
} else {
  boot().catch((err) => {
    console.error(err);
    document.body.innerHTML = `<pre style="color:#f88;padding:20px;font-family:monospace">Failed to start: ${String(err?.stack ?? err)}</pre>`;
  });
}
