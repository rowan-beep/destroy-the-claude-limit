// Application bootstrap: builds the theater, then shows the main menu.
import { CustomizeScreen } from './ui/menu/customizeScreen';
import { JetLibrary } from './ui/menu/jetLibrary';
import { SpectatorUi } from './ui/spectatorUi';
import { AutoFlyPanel } from './ui/autoFlyPanel';
import * as THREE from 'three';
import './styles.css';
import './ui/ui.css';
import { checkForNewBuild } from './core/freshness';
import { Game } from './game/game';
import { loadSettings, saveSettings } from './core/settings';
import { defaultMission, MissionConfig } from './game/mission';
import { Hud } from './ui/hud/hud';
import { WeatherWidget } from './ui/weatherWidget';
import { MainMenu } from './ui/menu/mainMenu';
import { Hangar } from './ui/menu/hangar';
import { LoadingScreen, PauseMenu, ResultsScreen, ControlsModal, BriefingModal } from './ui/menu/screens';
import { SettingsModal } from './ui/menu/settingsModal';
import { LogbookModal } from './ui/menu/logbookScreen';
import { ReplayUi } from './ui/replayUi';
import { MapView } from './ui/mapView';
import { audio } from './audio/audio';
import { applyMap, loadMapChoice } from './world/maps';
import { refreshGciSites } from './game/teamPicture';
import { activeMap } from './world/islands';
import type { AircraftType } from './aircraft/specs';
import { MultiplayerScreen, connectTo, JoinRequest } from './ui/menu/multiplayerScreen';
import { setPendingJoin, takePendingJoin, loadNetPrefs } from './net/servers';
import { switchMap } from './world/maps';
import { loadPaint } from './aircraft/models/paint';
import type { MapId } from './world/islands';

async function boot(): Promise<void> {
  // the theater must be chosen before anything about the world is built
  applyMap(loadMapChoice());
  refreshGciSites();
  const app = document.getElementById('app')!;
  const settings = loadSettings();
  // the pilot XP / level system was removed: drop its saved data
  try {
    localStorage.removeItem('triad.progress.v1');
  } catch {
    /* storage unavailable */
  }
  const loading = new LoadingScreen(document.body);
  loading.set(0.02, 'STARTING');

  const game = new Game(app, settings);
  const hud = new Hud(document.body);
  const weather = new WeatherWidget(document.body, game.world.weather, (w) => {
    game.world.setWeather(w);
    // reflections follow the sky (grey under an overcast)
    if (game.world.ready) game.world.env.buildEnvMap(game.renderer.renderer);
  });
  hud.setVisible(false);
  game.hud = hud;
  (window as unknown as { game: Game }).game = game;

  const t0 = performance.now();
  await game.world.buildGrid((f) => loading.set(0.05 + f * 0.8, `GENERATING ${activeMap.name} (${activeMap.sizeNm} × ${activeMap.sizeNm} NM)`));
  await game.world.buildMapData((f) => loading.set(0.85 + f * 0.07, 'BUILDING THE DIGITAL MAP'));
  loading.set(0.93, 'BUILDING WORLD');
  game.world.init();
  game.applySettings();
  const mapView = new MapView(document.body, () => game.setState('playing'));
  mapView.setGrid(game.world.grid);
  const hangar = new Hangar(game.renderer.renderer);
  if (import.meta.env.DEV) (window as unknown as { __hangar: Hangar }).__hangar = hangar;
  hangar.drawWith = (sc, cam) => game.renderer.renderScene(sc, cam, THREE.ACESFilmicToneMapping);
  const customize = new CustomizeScreen(document.body, hangar, () => {
    menu.root.classList.remove('hidden');
    hangar.setJet(menu.cfg.aircraft, menu.cfg.loadoutId);
  });
  console.info(`theater ready in ${Math.round(performance.now() - t0)} ms${game.world.pool.usingFallback ? ' (main-thread fallback)' : ''}`);

  const cfg: MissionConfig = defaultMission();
  if (settings.lastAircraft === 'F15EX' || settings.lastAircraft === 'FA18EF' || settings.lastAircraft === 'TYPHOON' || settings.lastAircraft === 'SU35' || settings.lastAircraft === 'RAFALE' || settings.lastAircraft === 'F22') cfg.aircraft = settings.lastAircraft as AircraftType;
  cfg.loadoutId = settings.lastLoadout[cfg.aircraft] ?? '';
  cfg.timeOfDay = settings.gameplay.timeOfDay;

  const settingsModal = new SettingsModal(
    document.body,
    settings,
    game.input,
    () => {
      game.applySettings();
      hud.reset(game);
    },
    () => {
      const r = game.renderer.renderSize;
      const aa = Math.min(settings.graphics.antialias, game.renderer.renderer.capabilities.maxSamples);
      return `RENDERING ${r.w} × ${r.h}${aa ? ` · MSAA ${aa}×` : ''} · ${Math.round(game.fps)} FPS`;
    },
  );
  const controls = new ControlsModal(document.body);
  const logbook = new LogbookModal(document.body, (fresh) => (game.logbook = fresh));
  game.autoFlyPanel = new AutoFlyPanel(
    document.body,
    (c) => game.engageAutoFly(c),
    () => game.disengageAutoFly(),
    () => game.autoFlyPanel?.hide(),
  );
  game.spectatorUi = new SpectatorUi(document.body, game.spectatorView());
  game.replayUi = new ReplayUi(document.body, game.cam, () => game.exitReplay());

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
  const library = new JetLibrary(document.body, {
    onSelect: (t, l) => {
      menu.cfg.loadoutId = l;
      menu.selectJet(t);
    },
    onPreview: (t, l) => hangar.setJet(t, l),
    onCustomize: (t) => customize.show(t),
    onClose: () => {
      menu.root.classList.remove('hidden');
      hangar.setJet(menu.cfg.aircraft, menu.cfg.loadoutId);
    },
    thumbnail: (t) => hangar.thumbnail(t),
  });
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
    onLibrary: () => {
      audio.init();
      menu.root.classList.add('hidden');
      library.show(menu.cfg.aircraft, menu.cfg.loadoutId);
    },
    onMultiplayer: () => {
      audio.init();
      mp.jet = menu.cfg.aircraft;
      mp.show(true);
    },
  });

  // --- multiplayer ---------------------------------------------------------
  const join = async (j: JoinRequest): Promise<void> => {
    // every pilot in a room flies the same theater: load the server's first
    const reloadFor = (map: string) => {
      setPendingJoin({ url: j.url, room: j.room });
      mp.setStatus('LOADING THE SERVER\'S THEATER…');
      switchMap(map as MapId);
    };
    if (j.map && j.map !== activeMap.id) {
      reloadFor(j.map);
      return;
    }
    const jet = menu.cfg.aircraft;
    const net = await connectTo(j.url, j.room, j.callsign, jet, loadPaint(jet));
    if (net.room && net.room.map !== activeMap.id) {
      net.close();
      reloadFor(net.room.map);
      return;
    }
    mp.show(false);
    game.pendingNet = net;
    await fly({ ...menu.cfg, mode: 'online' });
  };
  const mp = new MultiplayerScreen(document.body, join);
  game.onNetLost = (reason) => {
    mp.jet = menu.cfg.aircraft;
    mp.show(true);
    mp.setStatus(`DISCONNECTED: ${reason}`);
  };

  const briefing = new BriefingModal(document.body, () => game.acceptBriefing());
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
    briefing.show(s === 'briefing' ? game.briefing : null);
    hud.setVisible(s === 'playing' || s === 'paused' || s === 'results' || s === 'map' || s === 'briefing');
    pause.show(s === 'paused');
    weather.show(s === 'playing' || s === 'paused');
    mapView.show(s === 'map', game);
    if (s !== 'results') results.show(null);
    if (s === 'menu') {
      loading.show(false);
      hangar.setJet(cfg.aircraft, cfg.loadoutId);
    }
  };
  // the menu hangar draws at 60 fps at most (no need to run a 144 Hz laptop flat out
  // on a parked jet), and drops its resolution by itself if a slow GPU can't keep up
  let menuAcc = 0;
  game.onMenuFrame = (dt) => {
    menuAcc += dt;
    if (menuAcc < 1 / 61) return;
    const step = Math.min(menuAcc, 0.1);
    menuAcc = 0;
    game.renderer.adaptFrame(step);
    const sz = game.renderer.size;
    hangar.render(step, sz.w, sz.h);
  };
  game.onAfterFrame = () => {
    if (game.state === 'map') mapView.draw(game);
  };

  // keys that work while the flight input is disabled (pause / map)
  window.addEventListener('keydown', (e) => {
    if (game.state === 'briefing' && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
      e.preventDefault();
      game.acceptBriefing();
      return;
    }
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
  // came back from loading a server's theater: finish joining
  const pj = takePendingJoin();
  if (pj) {
    mp.jet = menu.cfg.aircraft;
    mp.show(true);
    mp.setStatus('CONNECTING…');
    join({ url: pj.url, room: pj.room, map: activeMap.id, callsign: loadNetPrefs().callsign || 'PILOT' }).catch((e) => mp.setStatus(`COULD NOT JOIN: ${(e as Error).message}`));
  }
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

checkForNewBuild();
