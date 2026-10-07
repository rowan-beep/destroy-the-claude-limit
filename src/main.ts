// Application bootstrap: builds the theater, then shows the main menu.
import { CustomizeScreen } from './ui/menu/customizeScreen';
import { JetLibrary } from './ui/menu/jetLibrary';
import { SpectatorUi } from './ui/spectatorUi';
import { AutoFlyPanel } from './ui/autoFlyPanel';
import * as THREE from 'three';
import './styles.css';
import './ui/ui.css';
import { checkForNewBuild, watchForUpdates } from './core/freshness';
import { Game } from './game/game';
import { loadSettings, saveSettings } from './core/settings';
import { defaultMission, MissionConfig } from './game/mission';
import { Hud } from './ui/hud/hud';
import { WeatherWidget } from './ui/weatherWidget';
import { MainMenu } from './ui/menu/mainMenu';
import { PerfWatch } from './ui/perfWarning';
import { Hangar } from './ui/menu/hangar';
import { LaunchSite } from './ui/menu/launchSite';
import { SpaceMenu } from './ui/menu/spaceMenu';
import { menuMusic } from './audio/menuMusic';
import { SpaceFlight } from './space/spaceFlight';
import { MarsMission } from './space/mars/marsMission';
import { loadProgram, saveProgram, Program } from './ui/menu/program';
import { LoadingScreen, PauseMenu, ResultsScreen, ControlsModal, BriefingModal } from './ui/menu/screens';
import { SettingsModal } from './ui/menu/settingsModal';
import { LogbookModal } from './ui/menu/logbookScreen';
import { ReplayUi } from './ui/replayUi';
import { MapView } from './ui/mapView';
import { audio } from './audio/audio';
import { applyMap, loadMapChoice } from './world/maps';
import { refreshGciSites } from './game/teamPicture';
import { activeMap } from './world/islands';
import { jetAllowedIn, AIRCRAFT_TYPES } from './aircraft/specs';
import type { AircraftType } from './aircraft/specs';
import { MultiplayerScreen, connectTo, JoinRequest } from './ui/menu/multiplayerScreen';
import { setPendingJoin, takePendingJoin, loadNetPrefs, wakeOfficialServers, pendingJoinHash } from './net/servers';
import { inArtifact, isArtifactOwner, ARTIFACT_ROOMS, ARTIFACT_URL, setLobby, sendAdmin } from './net/artifact';
import { RoomLink } from './net/roomLink';
import { AdminPanel } from './ui/menu/adminPanel';
import type { NetLink } from './net/link';
import { switchMap } from './world/maps';
import { loadPaint } from './aircraft/models/paint';
import type { MapId } from './world/islands';

wakeOfficialServers();

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

  // the theater itself (terrain, digital map, ocean, trees) is generated on
  // the first launch: the menu only draws the hangar
  game.applySettings();
  const mapView = new MapView(document.body, () => game.setState('playing'));
  game.onWorldBuilt = () => mapView.setGrid(game.world.grid);
  const hangar = new Hangar(game.renderer.renderer);
  if (import.meta.env.DEV) Object.assign(window, { __hangar: hangar, __THREE: THREE });
  hangar.drawWith = (sc, cam) => game.renderer.renderScene(sc, cam, THREE.ACESFilmicToneMapping);
  hangar.compileWith = (o, sc, cam) => game.renderer.compileFor(o, sc, cam);
  const perfWatch = new PerfWatch(game.renderer.renderer);
  const customize = new CustomizeScreen(document.body, hangar, () => {
    menu.root.classList.remove('hidden');
    hangar.setJet(menu.cfg.aircraft, menu.cfg.loadoutId);
  });

  const cfg: MissionConfig = defaultMission();
  if ((AIRCRAFT_TYPES as string[]).includes(settings.lastAircraft)) cfg.aircraft = settings.lastAircraft as AircraftType;
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
    // the open ocean has no land: a mode that needs it (kept from another theater) falls back to free flight
    if (activeMap.id === 'ocean' && ['campaign', 'daily', 'recon', 'strike', 'tutorial'].includes(c.mode)) c = { ...c, mode: 'free' };
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
  game.onNextMission = (c) => {
    menu.cfg.campaignMission = c.campaignMission;
    void fly(c);
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
  // --- the two programs: TRIAD air combat and SPACE EXPLORATION ------------------
  // each keeps its own data; switching only swaps the menu and its 3D showcase
  let program: Program = loadProgram();
  let factory: LaunchSite | null = null;
  const getFactory = (): LaunchSite => {
    if (!factory) {
      factory = new LaunchSite(game.renderer.renderer);
      if (import.meta.env.DEV) Object.assign(window, { __site: factory });
      factory.drawWith = (sc, cam) => {
        // outdoor daylight under a physical sky: a lower exposure than the hangar's
        const r = game.renderer.renderer;
        const e = r.toneMappingExposure;
        r.toneMappingExposure = e * 1.05;
        game.renderer.renderScene(sc, cam, THREE.ACESFilmicToneMapping);
        r.toneMappingExposure = e;
      };
    }
    return factory;
  };
  const setProgram = (p: Program) => {
    program = p;
    saveProgram(p);
    audio.init();
    audio.click();
    showMenus(game.state === 'menu');
    if (p === 'air') hangar.setJet(menu.cfg.aircraft, menu.cfg.loadoutId);
  };
  // flying the Saturn V: the space program's own flight, drawn in place of the menu
  const flight = new SpaceFlight(() => getFactory(), document.body);
  flight.drawWith = (sc, cam) => game.renderer.renderScene(sc, cam, THREE.ACESFilmicToneMapping);
  flight.onExit = () => showMenus(game.state === 'menu');
  // Starship to Mars, drawn the same way
  const marsMission = new MarsMission(() => getFactory(), () => game.renderer.renderer, document.body);
  marsMission.drawWith = (sc, cam) => game.renderer.renderScene(sc, cam, THREE.ACESFilmicToneMapping);
  marsMission.onExit = () => showMenus(game.state === 'menu');
  if (import.meta.env.DEV) Object.assign(window, { __flight: flight, __mars: marsMission });
  Object.assign(window, { __music: menuMusic });
  const showMenus = (v: boolean) => {
    const space = program === 'space';
    if (flight.active || marsMission.active) v = false;
    menu.show(v && !space);
    spaceMenu.show(v && space);
    if (factory) factory.active = v && space;
    else if (v && space) getFactory().active = true;
  };
  const spaceMenu = new SpaceMenu(document.body, {
    onProgram: (p) => setProgram(p),
    onSettings: () => {
      audio.init();
      settingsModal.show(true);
    },
    onControls: () => controls.show(true, settings.input),
    onLaunch: (mode) => {
      audio.init();
      audio.click();
      flight.start(mode);
      showMenus(false);
      if (factory) factory.active = false;
    },
    onMars: () => {
      audio.init();
      audio.click();
      marsMission.start();
      showMenus(false);
      if (factory) factory.active = false;
    },
  });

  menu = new MainMenu(document.body, cfg, {
    onProgram: (p) => setProgram(p),
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
    thumbnail: (t) => hangar.thumbnail(t),
    onLibrary: () => {
      audio.init();
      menu.root.classList.add('hidden');
      library.show(menu.cfg.aircraft, menu.cfg.loadoutId);
    },
    onMultiplayer: () => {
      audio.init();
      // the SR-71 is not cleared for combat: online it flies a fighter
      mp.jet = jetAllowedIn(menu.cfg.aircraft, 'online') ? menu.cfg.aircraft : 'F15EX';
      mp.show(true);
    },
  });

  // --- multiplayer ---------------------------------------------------------
  const join = async (j: JoinRequest): Promise<void> => {
    // every pilot in a room flies the same theater: load the server's first
    const reloadFor = (map: string) => {
      setPendingJoin({ url: j.url, room: j.room });
      mp.setStatus('LOADING THE ROOM\'S THEATER…');
      switchMap(map as MapId, pendingJoinHash({ url: j.url, room: j.room }));
    };
    if (j.map && j.map !== activeMap.id) {
      reloadFor(j.map);
      return;
    }
    const jet = jetAllowedIn(menu.cfg.aircraft, 'online') ? menu.cfg.aircraft : 'F15EX';
    let net: NetLink;
    if (j.url.startsWith(ARTIFACT_URL)) {
      // a room inside this artifact
      const def = ARTIFACT_ROOMS.find((d) => d.id === j.url.slice(ARTIFACT_URL.length)) ?? ARTIFACT_ROOMS[0];
      if (def.map !== activeMap.id) {
        reloadFor(def.map);
        return;
      }
      const link = new RoomLink(def);
      await link.connect({ name: j.callsign, jet, paint: loadPaint(jet) });
      net = link;
    } else net = await connectTo(j.url, j.room, j.callsign, jet, loadPaint(jet));
    if (net.room && net.room.map !== activeMap.id) {
      net.close();
      reloadFor(net.room.map);
      return;
    }
    mp.show(false);
    game.pendingNet = net;
    await fly({ ...menu.cfg, aircraft: jet, mode: 'online' });
  };
  const mp = new MultiplayerScreen(document.body, join);

  // --- inside the claude.ai artifact: the lobby, and the owner's control panel
  if (inArtifact()) {
    const tellLobby = () => {
      // (in a room, the room itself keeps the lobby up to date)
      if (game.online) return setLobby({ md: 'online' });
      setLobby({
        n: (loadNetPrefs().callsign || 'PILOT').toUpperCase().slice(0, 16),
        j: game.player?.type ?? menu.cfg.aircraft,
        md: game.state === 'menu' || !game.mode ? 'menu' : game.config.mode,
      });
    };
    tellLobby();
    window.setInterval(tellLobby, 3000);
    void isArtifactOwner().then((own) => {
      if (!own) return;
      const panel = new AdminPanel();
      mp.onAdmin = () => panel.show(true);
      window.addEventListener('keydown', (e) => {
        if (e.key === 'F8') {
          e.preventDefault();
          panel.toggle();
        }
      });
      // say who the admin is now and then, so everyone trusts our room locks
      const hi = () => void sendAdmin({ c: 'hi' }).catch(() => {});
      hi();
      window.setInterval(hi, 10000);
    });
  }
  game.onNetLost = (reason) => {
    mp.jet = jetAllowedIn(menu.cfg.aircraft, 'online') ? menu.cfg.aircraft : 'F15EX';
    mp.show(true);
    mp.setStatus(`DISCONNECTED: ${reason}`);
  };

  const briefing = new BriefingModal(document.body, () => game.acceptBriefing(), (i) => game.chooseBriefing(i));
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
    showMenus(s === 'menu');
    briefing.show(s === 'briefing' ? game.briefing : null);
    hud.setVisible(s === 'playing' || s === 'paused' || s === 'results' || s === 'map' || s === 'briefing');
    pause.show(s === 'paused', !game.online);
    weather.show(s === 'playing' || s === 'paused');
    mapView.show(s === 'map', game);
    if (s !== 'results') results.show(null);
    if (s === 'menu') {
      loading.show(false);
      hangar.setJet(cfg.aircraft, cfg.loadoutId);
    }
  };
  // the menu hangar draws every display frame (a 60 fps cap on a 144 Hz screen
  // judders); a slow GPU drops the render resolution by itself instead
  game.onMenuFrame = (dt) => {
    // behind the (opaque) loading screen the hangar would only slow the
    // theater and mission from loading
    if (game.state === 'loading') return;
    const step = Math.min(dt, 0.1);
    game.renderer.adaptFrame(step);
    const sz = game.renderer.size;
    if (flight.active) flight.frame(step, sz.w, sz.h);
    else if (marsMission.active) marsMission.frame(step, sz.w, sz.h);
    else if (program === 'space') getFactory().render(step, sz.w, sz.h);
    else hangar.render(step, sz.w, sz.h);
  };
  game.onAfterFrame = (dt) => {
    perfWatch.update(dt, game.state === 'playing', game.fps);
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
  // new versions install themselves: straight away in the menu, or once you are back from a flight
  watchForUpdates(
    () => game.state === 'menu' && !customize.open && !library.open && !flight.active && !marsMission.active,
    () => {
      if (game.state !== 'menu') game.message('A NEW VERSION IS READY: IT INSTALLS WHEN YOU RETURN TO THE MENU', 'info', 10);
    },
  );
  // came back from loading a server's theater: finish joining
  const pj = takePendingJoin();
  if (pj) {
    mp.jet = jetAllowedIn(menu.cfg.aircraft, 'online') ? menu.cfg.aircraft : 'F15EX';
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
    const msg = String(err?.message ?? err);
    // (Firefox's stack leaves the message out: always show both)
    const detail = `${msg}\n${String(err?.stack ?? '')}`.replace(/</g, '&lt;');
    const gl = /WebGL|WEBGL/i.test(msg);
    document.body.innerHTML = gl
      ? `<div style="font-family:system-ui,sans-serif;color:#e9eef5;background:#0b1118;position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box"><div style="max-width:560px;line-height:1.5"><h2 style="margin:0 0 10px">The browser won't start 3D graphics right now</h2><p>The game couldn't get a WebGL context. This usually happens after the graphics driver has reset: the browser then turns WebGL off until it is restarted.</p><p><b>Fix:</b> close <i>every</i> browser window (in Firefox: menu ▸ Exit), open it again and reload this page. To check WebGL on its own, open <code>get.webgl.org/webgl2</code>: if the cube doesn't spin there either, the browser has WebGL switched off, and restarting the computer (which resets the graphics driver) usually brings it back. If it still fails, check that hardware acceleration is on (Firefox: Settings ▸ General ▸ Performance) and look at <code>about:support</code> ▸ WebGL 2.</p><button onclick="location.reload()" style="margin-top:8px;padding:10px 18px;font:inherit;font-weight:700;border-radius:8px;border:0;cursor:pointer">TRY AGAIN</button><pre style="margin-top:18px;color:#f88;font-size:11px;white-space:pre-wrap">${detail}</pre></div></div>`
      : `<pre style="color:#f88;padding:20px;font-family:monospace;white-space:pre-wrap">Failed to start: ${detail}</pre>`;
  });
}

checkForNewBuild();
