// Starship to Mars: the whole mission, flown from the pad at the coastal launch
// complex to the ground on Mars. The physics lives in MarsFlight; this draws it
// in whichever world the ship is in (the launch site while low over the pad,
// Earth from orbit, interplanetary space, then Mars) and gives it a HUD, a
// chase camera, a map and the controls.

import * as THREE from 'three';
import type { LaunchSite } from '../../ui/menu/launchSite';
import { PAD2 } from '../../ui/menu/starbasePad';
import { SpaceScene } from '../spaceScene';
import { sunDirection } from '../flightSim';
import { EARTH, PAD, V3, earthAngle, ecefDir, padScene, rotY } from '../universe';
import { menuMusic } from '../../audio/menuMusic';
import { audio } from '../../audio/audio';
import { updateRecord } from '../record';
import { MarsFlight, Phase, SHIP_COM, turnToward } from './marsFlight';
import { DAY, EARTH_P, MARS, STARSHIP, Vec, dateText, earthAir, marsPressure, marsState, earthState, propagate, vadd, vcross, vdot, vlen, vnorm, vscale, vsub } from './marsPhysics';
import { marsHeight, regionName } from './marsGlobe';
import { MarsView } from './marsView';
import { CruiseView, CRUISE_MAP_SCALE } from './cruiseView';
import { BoosterRig, ShipRig, buildBooster, buildShip, poseShip } from './starshipModel';
import { StarshipFire } from './starshipFire';
import { EntryFx } from './marsFx';

/** the time-warp speeds; the one picked is the one used */
export const MARS_WARPS = [1, 2, 5, 10, 50, 100, 1000, 10_000, 100_000, 1_000_000];
const MAX_FF = 1_000_000;
const BOOSTER_H = STARSHIP.booster.height;
const SHIP_H = STARSHIP.ship.height;
/** the stack's centre of mass above the booster's engines (as the flight places it on the pad) */
const STACK_COM = 45;
/** the booster's (nearly empty) centre of mass above its engines */
const BOOSTER_COM = 26;
/** Pad 2's launch table: the booster's engines stand this high over the ground */
const MOUNT_Y = PAD2.table;

type View = 'site' | 'earth' | 'cruise' | 'mars';

const PHASE_NAME: Record<Phase, string> = {
  pad: 'ON THE PAD',
  boost: 'ASCENT · SUPER HEAVY',
  stage: 'HOT STAGING',
  ship: 'ASCENT · STARSHIP',
  orbit: 'EARTH ORBIT',
  refuel: 'PROPELLANT TRANSFER',
  tmi: 'TRANS-MARS INJECTION',
  depart: 'LEAVING EARTH',
  cruise: 'CRUISE TO MARS',
  approach: 'MARS APPROACH',
  entry: 'MARS ENTRY',
  descent: 'BELLY-FLOP',
  landing: 'LANDING BURN',
  landed: 'ON MARS',
  lost: 'LOST',
};

const CSS = `
.mm-ui{position:fixed;inset:0;pointer-events:none;z-index:30;font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;color:#e9eef5;letter-spacing:.04em}
.mm-ui.hidden{display:none}
.mm-ui button{pointer-events:auto;font:inherit;cursor:pointer}
.mm-tl{position:absolute;left:18px;top:14px;text-shadow:0 1px 3px #000a}
.mm-k{font-size:11px;letter-spacing:.22em;color:#9fb3c8}
.mm-ph{font-size:24px;font-weight:700;letter-spacing:.12em;margin-top:2px}
.mm-date{font-size:14px;color:#cfd9e4;margin-top:4px;font-variant-numeric:tabular-nums}
.mm-tr{position:absolute;right:16px;top:14px;width:250px;background:#0b1118b8;border:1px solid #ffffff1c;border-radius:10px;padding:10px 12px;backdrop-filter:blur(6px)}
.mm-row{display:flex;justify-content:space-between;font-size:13px;padding:2px 0;font-variant-numeric:tabular-nums}
.mm-row span:first-child{color:#8fa3b8;font-size:11px;letter-spacing:.16em;padding-top:2px}
.mm-bar{height:5px;border-radius:3px;background:#ffffff18;margin:2px 0 6px;overflow:hidden}
.mm-bar i{display:block;height:100%;background:linear-gradient(90deg,#7fb6ff,#cfe3ff)}
.mm-bar.b i{background:linear-gradient(90deg,#c9cdd3,#ffffff)}
.mm-log{position:absolute;left:18px;bottom:96px;width:min(460px,60vw);font-size:13px;line-height:1.35}
.mm-log div{background:#0b1118a0;border-left:2px solid #7fb6ff;padding:4px 8px;margin-top:4px;border-radius:0 6px 6px 0;text-shadow:0 1px 2px #000}
.mm-log div.good{border-color:#6fe0a0}.mm-log div.bad{border-color:#ff6b5b}
.mm-bot{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px)}
.mm-btn{background:#101820d8;border:1px solid #ffffff2a;color:#e9eef5;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;letter-spacing:.1em}
.mm-btn:hover{border-color:#ffffff66}
.mm-btn.on{background:#2a5d9a;border-color:#7fb6ff}
.mm-act{background:linear-gradient(180deg,#f2f5f8,#c9d1da);color:#0b1118;border:0;padding:10px 20px;font-size:15px;font-weight:800}
.mm-act.off{display:none}
.mm-warp{display:flex;gap:2px;background:#101820d8;border:1px solid #ffffff2a;border-radius:8px;padding:3px}
.mm-warp button{background:none;border:0;color:#9fb3c8;font-size:12px;padding:5px 7px;border-radius:5px;font-weight:600}
.mm-warp button.on{background:#e9eef5;color:#0b1118}
.mm-flash{position:absolute;left:50%;top:22%;transform:translateX(-50%);font-size:30px;font-weight:800;letter-spacing:.2em;text-align:center;text-shadow:0 2px 12px #000;opacity:0;transition:opacity .6s}
.mm-flash.show{opacity:1}
.mm-help{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#0b1118ee;border:1px solid #ffffff2a;border-radius:12px;padding:18px 22px;font-size:14px;line-height:1.7;pointer-events:auto;display:none;max-width:min(520px,calc(100vw - 32px))}
.mm-help.show{display:block}
.mm-help b{display:inline-block;min-width:110px;color:#fff}
.mm-card{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#0008;pointer-events:auto}
.mm-card.show{display:flex}
.mm-card-b{background:#0b1118f2;border:1px solid #ffffff2a;border-radius:14px;padding:22px 26px;max-width:min(520px,calc(100vw - 32px));text-align:center}
.mm-card-t{font-size:24px;font-weight:800;letter-spacing:.12em}
.mm-card-s{font-size:14px;color:#cfd9e4;margin:10px 0 16px;line-height:1.5}
.mm-card-r{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.mm-cv{position:absolute;inset:0;width:100%;height:100%}
.mm-hint{position:absolute;right:16px;bottom:16px;font-size:11px;color:#8fa3b8;letter-spacing:.14em}
@media (max-width:700px){.mm-tr{width:190px;padding:8px}.mm-ph{font-size:18px}.mm-log{bottom:140px}.mm-cv{position:absolute;inset:0;width:100%;height:100%}
.mm-hint{display:none}}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

/** a neutral grey sky to light bare steel by (tinted for Mars) */
function neutralEnv(renderer: THREE.WebGLRenderer, top: THREE.Color, mid: THREE.Color, bottom: THREE.Color): THREE.Texture | null {
  try {
    const g = new THREE.SphereGeometry(100, 32, 16);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 100;
      if (y > 0) c.copy(mid).lerp(top, Math.pow(y, 0.6));
      else c.copy(mid).lerp(bottom, Math.pow(-y, 0.5));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pm = new THREE.PMREMGenerator(renderer);
    const t = pm.fromScene(s, 0.02).texture;
    pm.dispose();
    return t;
  } catch {
    return null;
  }
}

/** a unit vector at right angles to a */
function perp(a: Vec): Vec {
  return vnorm(vcross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
}

export class MarsMission {
  active = false;
  flight: MarsFlight | null = null;
  drawWith: ((scene: THREE.Scene, camera: THREE.Camera) => void) | null = null;
  onExit: (() => void) | null = null;
  private site: LaunchSite | null = null;
  private space: SpaceScene | null = null;
  private mars: MarsView | null = null;
  private cruise: CruiseView | null = null;
  private ship: ShipRig | null = null;
  private booster: BoosterRig | null = null;
  private fire: StarshipFire | null = null;
  private holder = new THREE.Group();
  /** super heavy on its own, after separation */
  private bHolder = new THREE.Group();
  private view: View = 'site';
  private siteCam = new THREE.PerspectiveCamera(50, 1, 0.5, 140_000);
  private padLight = new THREE.PointLight(0xff9a40, 0, 0, 2);
  private plasma: THREE.Sprite;
  private entry = new EntryFx();
  /** the Raptors' light on the ground and the dust during the landing burn */
  private engineLight = new THREE.PointLight(0xff9a50, 0, 900, 2);
  /** the nozzles still glowing after shutdown */
  private nozzleGlow: THREE.Sprite[] = [];
  private ignT = -1;
  private landedAt = -1;
  private lastDragAt = -1e9;
  private shakeT = 0;
  private wallT = 0;
  private trackAt = -1;
  private belly: Vec = [1, 0, 0];
  private bBelly: Vec = [1, 0, 0];
  private warpI = 0;
  private ff = false;
  private paused = false;
  private map = false;
  private camYaw = -1.1;
  private camPitch = 0.08;
  private camDist = 260;
  private mapYaw = 0.4;
  private mapPitch = 0.6;
  private mapDist = 0;
  private keys = new Set<string>();
  private drag: { id: number; x: number; y: number } | null = null;
  private liftT = -1;
  private spaceT = 0;
  private endAt = 0;
  private endShown = false;
  private lastPhase: Phase = 'pad';
  private logSeen = 0;
  private envSpace: THREE.Texture | null = null;
  private envMars: THREE.Texture | null = null;
  // HUD
  private ui: HTMLDivElement;
  private elPhase: HTMLElement;
  private elDate: HTMLElement;
  private elMet: HTMLElement;
  private elTel: HTMLElement;
  private elLog: HTMLElement;
  private elAct: HTMLButtonElement;
  private elFF: HTMLButtonElement;
  private elAuto: HTMLButtonElement;
  private elMap: HTMLButtonElement;
  private elWarp: HTMLButtonElement[] = [];
  private elFlash: HTMLElement;
  private elHelp: HTMLElement;
  private elCard: HTMLElement;
  private elCardT: HTMLElement;
  private elCardS: HTMLElement;
  private elCardR: HTMLElement;
  private flashT = 0;
  private cv: HTMLCanvasElement;
  /** the path drawn on the map (scene coordinates when it was computed, relative to the ship then) */
  private trackPts: Vec[] = [];
  private telKey = '';

  constructor(
    private getSite: () => LaunchSite,
    private getRenderer: () => THREE.WebGLRenderer,
    parent: HTMLElement,
  ) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.ui = el('div', 'mm-ui hidden', parent);
    this.cv = el('canvas', 'mm-cv', this.ui);
    const tl = el('div', 'mm-tl', this.ui);
    el('div', 'mm-k', tl, 'STARSHIP · MISSION TO MARS');
    this.elPhase = el('div', 'mm-ph', tl, '');
    this.elDate = el('div', 'mm-date', tl, '');
    this.elMet = el('div', 'mm-date', tl, '');
    this.elTel = el('div', 'mm-tr', this.ui);
    this.elLog = el('div', 'mm-log', this.ui);
    const bot = el('div', 'mm-bot', this.ui);
    this.elAct = el('button', 'mm-btn mm-act', bot, 'LAUNCH');
    this.elAct.addEventListener('click', () => this.action());
    this.elFF = el('button', 'mm-btn', bot, '⏩ NEXT EVENT');
    this.elFF.title = 'Fast forward: the warp picks itself and stops for the next event (F)';
    this.elFF.addEventListener('click', () => this.setFF(!this.ff));
    const warp = el('div', 'mm-warp', bot);
    MARS_WARPS.forEach((w, i) => {
      const b = el('button', '', warp, w >= 1e6 ? '1M×' : w >= 1000 ? `${w / 1000}k×` : `${w}×`);
      b.addEventListener('click', () => this.setWarp(i));
      this.elWarp.push(b);
    });
    this.elAuto = el('button', 'mm-btn', bot, 'AUTOPILOT');
    this.elAuto.title = 'Autopilot on/off (T). Off: W/S pitch, A/D yaw, Shift/Ctrl throttle';
    this.elAuto.addEventListener('click', () => this.toggleAuto());
    this.elMap = el('button', 'mm-btn', bot, 'MAP');
    this.elMap.addEventListener('click', () => this.toggleMap());
    const help = el('button', 'mm-btn', bot, '?');
    help.addEventListener('click', () => this.elHelp.classList.toggle('show'));
    const exit = el('button', 'mm-btn', bot, 'EXIT');
    exit.addEventListener('click', () => this.setPaused(true));
    this.elFlash = el('div', 'mm-flash', this.ui);
    this.elHelp = el('div', 'mm-help', this.ui);
    this.elHelp.innerHTML = [
      ['SPACE', 'the next step (launch, refuel, injection burn…)'],
      ['F', 'fast forward to the next event'],
      ['1 … 0  ,  .', 'pick a time-warp speed (exactly that speed)'],
      ['T', 'autopilot on / off'],
      ['W S / A D', 'pitch / yaw (autopilot off)'],
      ['SHIFT / CTRL', 'throttle up / down (autopilot off)'],
      ['M', 'map'],
      ['DRAG · WHEEL', 'look around · zoom'],
      ['ESC', 'pause'],
    ].map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('');
    this.elHelp.addEventListener('click', () => this.elHelp.classList.remove('show'));
    this.elCard = el('div', 'mm-card', this.ui);
    const cb = el('div', 'mm-card-b', this.elCard);
    this.elCardT = el('div', 'mm-card-t', cb);
    this.elCardS = el('div', 'mm-card-s', cb);
    this.elCardR = el('div', 'mm-card-r', cb);
    el('div', 'mm-hint', this.ui, 'PRESS ? FOR CONTROLS');

    const tex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(255,190,150,0.45)');
      gr.addColorStop(1, 'rgba(255,120,90,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    this.plasma = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0, 0, 0), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.plasma.renderOrder = 12;
    this.plasma.visible = false;

    window.addEventListener('keydown', (e) => this.onKey(e, true), { capture: true });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { capture: true });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('button, .mm-tr, .mm-help, .mm-card')) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.lastDragAt = performance.now();
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
        this.lastDragAt = performance.now();
        this.camPitch = Math.max(-1.45, Math.min(1.45, this.camPitch + dy * 0.004));
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
        if (t && t.closest && t.closest('.mm-tr, .mm-help, .mm-card')) return;
        const k = Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0018);
        if (this.map) this.mapDist = Math.max(this.mapMin(), Math.min(this.mapMax(), this.mapDist * k));
        else this.camDist = Math.max(15, Math.min(5e6, this.camDist * k));
      },
      { passive: true },
    );
  }

  // ------------------------------------------------------------------ lifecycle
  start(): void {
    const renderer = this.getRenderer();
    this.site = this.getSite();
    if (!this.ship) {
      this.ship = buildShip(true);
      this.booster = buildBooster();
      this.fire = new StarshipFire(this.ship.group, this.ship.engines, this.booster.group, this.booster.engines);
      this.ship.group.add(this.entry.sheath);
      this.engineLight.position.set(0, -8, 0);
      this.ship.group.add(this.engineLight);
      const gm = (this.plasma.material as THREE.SpriteMaterial).map;
      for (const e of this.ship.engines.filter((x) => !x.vac)) {
        const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: gm, color: new THREE.Color(0, 0, 0), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        g.position.copy(e.pos).add(new THREE.Vector3(0, 1.2, 0));
        g.scale.setScalar(2.6);
        g.visible = false;
        this.ship.group.add(g);
        this.nozzleGlow.push(g);
      }
      this.envSpace = neutralEnv(renderer, new THREE.Color(0.62, 0.64, 0.68), new THREE.Color(0.32, 0.33, 0.35), new THREE.Color(0.1, 0.1, 0.11));
      this.envMars = neutralEnv(renderer, new THREE.Color(0.7, 0.58, 0.48), new THREE.Color(0.55, 0.38, 0.25), new THREE.Color(0.3, 0.18, 0.1));
    }
    if (!this.space) {
      this.space = new SpaceScene(sunDirection());
      this.space.scene.environment = this.envSpace;
      this.space.scene.environmentIntensity = 0.35;
    }
    if (!this.cruise) {
      this.cruise = new CruiseView();
      this.cruise.scene.environment = this.envSpace;
      this.cruise.scene.environmentIntensity = 0.12;
    }
    if (!this.mars) {
      this.mars = new MarsView();
      this.mars.renderer = renderer;
      // (until Mars captures its own sky as the light, the tinted grey stands in)
      this.mars.scene.environment = this.envMars;
      this.mars.scene.environmentIntensity = 1;
    }
    const now = Date.now() / 86_400_000 + 2_440_587.5;
    const f = (this.flight = new MarsFlight(now));
    f.groundH = marsHeight;
    // some days are clearer than others; most are hazy with dust
    this.mars!.dustiness = 0.55 + Math.random() * 0.4;
    // the stack: Super Heavy with the ship on top
    this.holder.add(this.booster!.group, this.ship!.group);
    this.booster!.group.position.set(0, 0, 0);
    this.booster!.group.quaternion.identity();
    this.ship!.group.position.set(0, BOOSTER_H, 0);
    this.booster!.group.visible = true;
    this.belly = [...f.belly] as Vec;
    this.warpI = 0;
    this.ff = false;
    this.paused = false;
    this.map = false;
    this.camYaw = -1.1;
    this.camPitch = 0.08;
    this.camDist = 260;
    this.mapDist = 0;
    this.liftT = -1;
    this.spaceT = 0;
    this.endAt = 0;
    this.endShown = false;
    this.lastPhase = 'pad';
    this.logSeen = 0;
    this.landedAt = -1;
    this.ignT = -1;
    this.trackAt = -1;
    this.elLog.textContent = '';
    this.elCard.classList.remove('show');
    this.elHelp.classList.remove('show');
    this.site.setFlying(true);
    this.site.useStarshipPad(true);
    this.view = 'site';
    this.attach();
    this.active = true;
    this.ui.classList.remove('hidden');
    menuMusic.want('flight', true);
    f.say(`Super Heavy and Starship on the pad. The Mars window opens ${dateText(f.window.dep)}; arrival ${dateText(f.window.arr)}.`);
    f.say('Press LAUNCH (Space). After orbit: refuel, wait for the window, then the injection burn.');
    this.flash('STARSHIP · PAD 2');
  }

  stop(): void {
    this.active = false;
    this.ui.classList.add('hidden');
    menuMusic.want('flight', false);
    this.holder.parent?.remove(this.holder);
    this.bHolder.parent?.remove(this.bHolder);
    this.padLight.parent?.remove(this.padLight);
    this.plasma.parent?.remove(this.plasma);
    this.entry.wake.parent?.remove(this.entry.wake);
    this.entry.embers.points.parent?.remove(this.entry.embers.points);
    this.site?.setFlying(false);
    this.site?.useStarshipPad(false);
    if (this.spaceT > 0) {
      const d = this.spaceT / DAY;
      updateRecord((r) => (r.daysInSpace += d));
      this.spaceT = 0;
    }
  }

  private exit(): void {
    this.stop();
    this.onExit?.();
  }

  private sceneOf(v: View): THREE.Scene {
    if (v === 'site') return this.site!.scene;
    if (v === 'earth') return this.space!.scene;
    if (v === 'cruise') return this.cruise!.scene;
    return this.mars!.scene;
  }

  private attach(): void {
    const s = this.sceneOf(this.view);
    s.add(this.holder);
    s.add(this.bHolder);
    s.add(this.plasma);
    s.add(this.entry.wake, this.entry.embers.points);
    if (this.view === 'site') s.add(this.padLight);
    else this.padLight.parent?.remove(this.padLight);
  }

  // ------------------------------------------------------------------ input
  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.active) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const c = e.code;
    const flightKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'];
    if (flightKeys.includes(c)) {
      if (down) this.keys.add(c);
      else this.keys.delete(c);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!down) return;
    let used = true;
    if (c === 'Space') this.action();
    else if (c === 'KeyF') this.setFF(!this.ff);
    else if (c === 'KeyT') this.toggleAuto();
    else if (c === 'KeyM') this.toggleMap();
    else if (c === 'Comma') this.setWarp(this.warpI - 1);
    else if (c === 'Period') this.setWarp(this.warpI + 1);
    else if (/^Digit[0-9]$/.test(c)) {
      const n = Number(c.slice(5));
      this.setWarp(n === 0 ? 9 : n - 1);
    } else if (c === 'Escape') {
      if (this.elHelp.classList.contains('show')) this.elHelp.classList.remove('show');
      else this.setPaused(!this.paused);
    } else if (c === 'KeyH' || c === 'Slash') this.elHelp.classList.toggle('show');
    else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  private setWarp(i: number): void {
    this.warpI = Math.max(0, Math.min(MARS_WARPS.length - 1, i));
    this.ff = false;
  }

  private setFF(on: boolean): void {
    this.ff = on;
    if (on) this.flash('FAST FORWARD');
    else this.warpI = 0;
  }

  private toggleAuto(): void {
    const f = this.flight;
    if (!f) return;
    f.auto = !f.auto;
    f.say(f.auto ? 'Autopilot on.' : 'Autopilot off: W/S pitch, A/D yaw, Shift/Ctrl throttle. The guidance still holds the general direction.', 'info');
  }

  private toggleMap(): void {
    this.map = !this.map;
    this.mapDist = 0;
    this.trackAt = -1;
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.card('PAUSED', 'The mission clock is stopped.', [['RESUME', () => this.setPaused(false)], ['START OVER', () => this.restart()], ['EXIT TO MENU', () => this.exit()]]);
    else this.elCard.classList.remove('show');
  }

  private restart(): void {
    this.stop();
    this.start();
  }

  private card(title: string, text: string, buttons: [string, () => void][]): void {
    this.elCardT.textContent = title;
    this.elCardS.textContent = text;
    this.elCardR.textContent = '';
    for (const [t, fn] of buttons) {
      const b = el('button', 'mm-btn', this.elCardR, t);
      b.addEventListener('click', () => {
        audio.click();
        fn();
      });
    }
    this.elCard.classList.add('show');
  }

  private flash(text: string): void {
    this.elFlash.textContent = text;
    this.elFlash.classList.add('show');
    this.flashT = 3;
  }

  /** what Space does now */
  private nextAction(): { label: string; run: () => void } | null {
    const f = this.flight;
    if (!f || f.outcome) return null;
    const full = f.shipProp >= STARSHIP.ship.prop * 0.95;
    switch (f.phase) {
      case 'pad':
        return { label: 'LAUNCH', run: () => f.launch() };
      case 'orbit':
        if (!full) return { label: 'REFUEL IN ORBIT', run: () => f.refuel() };
        if (f.toWindow > DAY) return { label: 'WARP TO THE WINDOW', run: () => this.setFF(true) };
        return { label: 'TRANS-MARS INJECTION', run: () => f.tmi() };
      case 'refuel':
        return { label: 'WARP THROUGH REFUELLING', run: () => this.setFF(true) };
      case 'depart':
      case 'cruise':
      case 'approach':
        return { label: 'WARP TO MARS', run: () => this.setFF(true) };
      default:
        return null;
    }
  }

  private action(): void {
    const a = this.nextAction();
    if (!a) return;
    audio.init();
    audio.click();
    a.run();
  }

  /** seconds of mission time until something worth stopping for */
  private timeToEvent(): number {
    const f = this.flight!;
    switch (f.phase) {
      case 'refuel':
        return ((STARSHIP.ship.prop - f.shipProp) / STARSHIP.ship.prop) * 21 * DAY;
      case 'depart': {
        const vr = vdot(f.v, vnorm(f.r));
        return (EARTH_P.soi - vlen(f.r)) / Math.max(200, vr);
      }
      case 'approach': {
        const vr = -vdot(f.v, vnorm(f.r));
        return Math.max(0, f.alt - MARS.top) / Math.max(200, vr);
      }
      default:
        return f.nextEvent();
    }
  }

  // ------------------------------------------------------------------ the frame
  frame(dtReal: number, w: number, h: number): void {
    const f = this.flight;
    if (!f || !this.site) return;
    const dt = Number.isFinite(dtReal) ? Math.max(0, Math.min(0.1, dtReal)) : 0;
    // Mars's maps are built a little at a time while the mission flies (all at once if needed now)
    this.mars!.prepare(f.frame === 'mars' || f.phase === 'cruise' ? 1e9 : 3);
    // the pilot's hands
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    f.controls.pitch = k('KeyS') - k('KeyW');
    f.controls.yaw = k('KeyD') - k('KeyA');
    f.controls.throttle = Math.max(k('ShiftLeft'), k('ShiftRight')) - Math.max(k('ControlLeft'), k('ControlRight'));
    // the clock: the speed picked, exactly; fast forward picks its own and stops for events
    let warp = MARS_WARPS[this.warpI];
    if (this.ff) {
      const t = this.timeToEvent();
      if (t <= 0.5) {
        this.ff = false;
        this.warpI = 0;
        warp = 1;
      } else warp = Math.max(1, Math.min(MAX_FF, t / 3));
    }
    if (!this.paused) {
      const step = dt * warp;
      f.advance(step);
      if (f.phase !== 'pad' && f.phase !== 'landed' && f.phase !== 'lost') this.spaceT += f.frame === 'earth' && f.alt < 100_000 ? 0 : step;
    }
    this.onPhase(f);
    this.updateBelly(f, dt * warp);
    this.pickView(f);
    this.placeVehicle(f);
    // the engines
    const p = f.frame === 'earth' ? earthAir(Math.max(0, f.alt)).p : f.frame === 'mars' ? marsPressure(Math.max(0, f.alt)) : 0;
    // super heavy's engines: on the stack, or its own boostback burn after separation
    const bb = !f.stacked && f.booster && f.booster.phase === 'boostback' ? f.booster.engines : 0;
    const bN = f.stacked ? (f.phase === 'boost' ? f.bEng : 0) : bb;
    // hot staging: the ship lights while still sitting on the booster
    const sOn = !f.stacked || f.phase === 'stage';
    this.fire!.update(dt, bN, sOn ? f.sEng : 0, sOn ? f.vEng : 0, f.phase === 'stage' ? 1 : f.throttle, f.stacked ? f.throttle : 1, p);
    this.wallT += dt;
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.direct(f, dt);
    this.updateFx(f, dt, h);
    this.render(f, dt, w, h, warp);
    this.updateHud(f, warp, dt);
  }

  /** things that happen once when the phase changes */
  private onPhase(f: MarsFlight): void {
    if (f.phase === this.lastPhase) return;
    const was = this.lastPhase;
    this.lastPhase = f.phase;
    if (was === 'pad') {
      this.liftT = f.launchT;
      updateRecord((r) => r.launches++);
    }
    // automatic stops: everything that wants the pilot's eyes drops back to real time
    if (f.phase === 'entry' || f.phase === 'landing') {
      this.warpI = 0;
      this.ff = false;
      this.camDist = Math.min(this.camDist, f.phase === 'landing' ? 160 : 220);
    }
    if (f.phase === 'orbit' && was === 'ship') this.flash('ORBIT');
    if (f.phase === 'depart' || f.phase === 'tmi') {
      // look back down past the ship at the Earth falling away
      this.camPitch = 0.85;
      this.camDist = Math.max(this.camDist, 180);
    }
    if (f.phase === 'cruise') this.flash('BOUND FOR MARS');
    if (f.phase === 'approach') this.flash('MARS');
    if (f.phase === 'entry') this.flash('ENTRY INTERFACE');
    if (f.phase === 'landing') {
      this.flash('LANDING BURN');
      this.ignT = 0;
      this.shakeT = 1.2;
    }
    if (f.phase === 'landed' || (f.phase === 'lost' && f.frame === 'mars')) {
      this.landedAt = this.wallT;
      this.shakeT = f.phase === 'lost' ? 2.5 : 0.7;
    }
    if (f.phase === 'landed') {
      this.flash('STARSHIP HAS LANDED');
      updateRecord((r) => r.missions++);
    }
    if (f.outcome && !this.endAt) this.endAt = performance.now() + (f.outcome.ok ? 5000 : 3500);
  }

  /** which way the belly (the tiled side, +X of the model) faces: down to the ground, turned smoothly */
  private updateBelly(f: MarsFlight, dt: number): void {
    const ax = f.axis;
    const proj = (v: Vec) => vsub(v, vscale(ax, vdot(v, ax)));
    let b = proj(this.belly);
    b = vlen(b) < 1e-6 ? perp(ax) : vnorm(b);
    let want: Vec | null = null;
    if (f.phase === 'pad' || f.phase === 'boost' || f.phase === 'stage') want = proj(f.belly);
    else if (f.frame === 'sun') want = proj(vscale(f.r, -1));
    else want = proj(vscale(f.up(), -1));
    if (vlen(want) > 0.2) b = turnToward(b, vnorm(want), Math.min(Math.PI, dt * 0.35));
    this.belly = vnorm(proj(b));
    // super heavy keeps its own
    if (f.booster) {
      const bx = f.booster.axis;
      const bp = vsub(this.bBelly, vscale(bx, vdot(this.bBelly, bx)));
      this.bBelly = vlen(bp) < 1e-6 ? perp(bx) : vnorm(bp);
    }
  }

  private pickView(f: MarsFlight): void {
    let v: View;
    if (f.frame === 'sun') v = 'cruise';
    else if (f.frame === 'mars') v = 'mars';
    else {
      const lp = this.localPos(f.r);
      const hd = Math.hypot(lp[0], lp[2]);
      v = !this.map && hd < 60_000 && f.alt < (this.view === 'site' ? 17_000 : 13_000) ? 'site' : 'earth';
    }
    if (v !== this.view) {
      this.view = v;
      this.attach();
      this.trackAt = -1;
    }
  }

  // ------------------------------------------------------------------ frames of reference
  private padOrigin = vscale(ecefDir(PAD.lat, PAD.lon) as Vec, EARTH.R);
  private axes = padScene();
  /** a point (Earth frame) in the launch site's coordinates */
  private localPos(r: Vec): Vec {
    const t = this.flight!.t;
    const e = vsub(rotY(r as V3, -earthAngle(t)) as Vec, this.padOrigin);
    // (Starship flies from Pad 2, along the coast from the Saturn V's pad)
    return [vdot(e, this.axes.x as Vec) + PAD2.x, vdot(e, this.axes.y as Vec) + MOUNT_Y, vdot(e, this.axes.z as Vec) + PAD2.z];
  }
  private localDir(v: Vec): Vec {
    const e = rotY(v as V3, -earthAngle(this.flight!.t)) as Vec;
    return [vdot(e, this.axes.x as Vec), vdot(e, this.axes.y as Vec), vdot(e, this.axes.z as Vec)];
  }
  /** where a point of the flight's frame is drawn */
  private scenePos(p: Vec): THREE.Vector3 {
    if (this.view === 'site') return new THREE.Vector3(...this.localPos(p));
    const o = this.flight!.r;
    return new THREE.Vector3(p[0] - o[0], p[1] - o[1], p[2] - o[2]);
  }
  private sceneDir(v: Vec): THREE.Vector3 {
    if (this.view === 'site') return new THREE.Vector3(...this.localDir(v));
    return new THREE.Vector3(...v);
  }
  private orient(axis: Vec, belly: Vec): THREE.Quaternion {
    const x = this.sceneDir(belly), y = this.sceneDir(axis);
    const z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }

  /** the base of whatever is flying (the booster's engines while stacked, else the ship's) */
  private base(f: MarsFlight): Vec {
    return vsub(f.r, vscale(f.axis, f.stacked ? STACK_COM : SHIP_COM));
  }
  /** the middle of the vehicle, for the camera to look at */
  private middle(f: MarsFlight): Vec {
    return vadd(this.base(f), vscale(f.axis, f.stacked ? (BOOSTER_H + SHIP_H) / 2 : SHIP_H / 2));
  }

  private placeVehicle(f: MarsFlight): void {
    // separation: Super Heavy goes its own way, the ship's engines become the base
    if (!f.stacked && this.booster!.group.parent !== this.bHolder) {
      this.bHolder.add(this.booster!.group);
      this.booster!.group.position.set(0, 0, 0);
      this.ship!.group.position.set(0, 0, 0);
      this.bBelly = [...this.belly] as Vec;
    }
    const lost = f.phase === 'lost' && f.frame !== 'mars';
    // (on the solar-system map the ship is a marker; the model would sit on the Sun)
    this.holder.visible = !lost && !(this.map && this.view === 'cruise');
    this.holder.position.copy(this.scenePos(this.base(f)));
    this.holder.quaternion.copy(this.orient(f.axis, this.belly));
    // super heavy on its own: shown while it is still in the sky near the ship
    const b = f.booster;
    const bShow = !f.stacked && !!b && b.phase !== 'gone' && f.frame === 'earth' && vlen(vsub(b.r, f.r)) < 400_000;
    this.bHolder.visible = bShow;
    if (bShow && b) {
      this.bHolder.position.copy(this.scenePos(vsub(b.r, vscale(b.axis, BOOSTER_COM))));
      this.bHolder.quaternion.copy(this.orient(b.axis, this.bBelly));
    }
    // the pad: fire light and the swing arms
    if (this.view === 'site') {
      const base = this.scenePos(this.base(f));
      this.padLight.position.set(base.x, Math.max(4, base.y - 10), base.z);
      this.padLight.intensity = this.fire!.fireLevel * 18000 * (0.9 + 0.1 * Math.random());
      // the quick-disconnect arm swings clear just before liftoff
      this.site!.setQd(f.phase === 'pad' ? 0 : Math.min(1, 0.4 + (f.t - this.liftT) / 4));
    }
    // touchdown: the legs take the weight, sink and spring back
    if (this.landedAt >= 0 && f.phase === 'landed') {
      const t = this.wallT - this.landedAt;
      const sink = -0.55 * Math.exp(-t * 2.2) * Math.cos(t * 8.5) - 0.12 * (1 - Math.exp(-t * 3));
      this.holder.position.add(this.sceneDir(vscale(f.axis, sink)));
    }
  }

  /** the show: the plasma of entry, the flaps at work, the engines lighting the ground, the cooling nozzles */
  private updateFx(f: MarsFlight, dt: number, h: number): void {
    const onMars = f.frame === 'mars';
    // entry plasma, while the heating lasts
    const k = onMars && (f.phase === 'entry' || f.phase === 'descent') ? Math.min(1, Math.pow(f.heat / 7e4, 0.8)) : 0;
    const va = f.airVel();
    const down = this.sceneDir(vscale(vnorm(va), -1));
    this.ship!.group.updateMatrixWorld();
    this.entry.update(dt, h, k, this.scenePos(this.middle(f)), down, this.ship!.group.matrixWorld, new THREE.Vector3());
    // the flaps: working all through the belly-flop, small quick corrections
    poseShip(this.ship!, f.flaps, f.legs);
    if (f.phase === 'descent' || (f.phase === 'landing' && this.wallT - this.flashLit < 4)) {
      const amp = f.phase === 'descent' ? 1 : 0.5;
      this.ship!.flaps.forEach((fl, i) => {
        const j = amp * (0.07 * Math.sin(this.wallT * 1.9 + i * 1.7) + 0.035 * Math.sin(this.wallT * 5.3 + i * 2.9));
        fl.pivot.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(fl.axis, j));
      });
    }
    // the Raptors' light: orange on the ground and the dust below
    const lit = onMars && f.sEng > 0 ? (f.throttle * f.sEng) / 3 : 0;
    this.engineLight.intensity = lit * 26000 * (0.9 + 0.1 * Math.random());
    this.engineLight.visible = lit > 0;
    // the ignition flash
    if (this.ignT >= 0) {
      if (this.ignT === 0) this.flashLit = this.wallT;
      this.ignT += dt;
      const a = Math.max(0, 1 - this.ignT / 0.45);
      this.plasma.visible = a > 0;
      if (a > 0) {
        this.plasma.position.copy(this.scenePos(vsub(f.r, vscale(f.axis, SHIP_COM + 3))));
        const sz = 14 + 22 * (1 - a);
        this.plasma.scale.set(sz, sz, 1);
        (this.plasma.material as THREE.SpriteMaterial).color.setRGB(3.2 * a * a, 2.2 * a * a, 1.5 * a * a);
      } else this.ignT = -1;
    } else this.plasma.visible = false;
    // after shutdown the nozzles glow dull orange, cooling over half a minute
    const cool = f.phase === 'landed' && this.landedAt >= 0 ? Math.max(0, 1 - (this.wallT - this.landedAt) / 30) : 0;
    for (const g of this.nozzleGlow) {
      g.visible = cool > 0.01;
      (g.material as THREE.SpriteMaterial).color.setRGB(2.4 * cool * cool, 0.7 * cool * cool * cool, 0.15 * cool ** 4);
    }
  }
  private flashLit = -1e9;

  /** the camera trembles under entry, the landing burn and touchdown */
  private shake(f: MarsFlight): Vec {
    let a = 0;
    if (f.frame === 'mars') {
      if (f.phase === 'entry') a += Math.min(1, f.heat / 8e4) * 0.5 + Math.max(0, f.gLoad - 0.3) * 0.25;
      if (f.phase === 'landing') a += 0.35 * f.throttle * (f.sEng / 3) * (0.5 + 0.5 * THREE.MathUtils.smoothstep(-f.agl, -200, -5));
    }
    if (f.phase === 'boost' && f.alt < 3000) a += 0.6 * (1 - f.alt / 3000);
    a += this.shakeT * 0.9;
    if (a <= 0.001) return [0, 0, 0];
    const t = this.wallT;
    const amp = a * Math.min(2.5, 0.006 * this.camDist + 0.15);
    return [
      amp * (Math.sin(t * 37.1) * 0.6 + Math.sin(t * 61.7 + 1.3) * 0.4),
      amp * (Math.sin(t * 41.3 + 2.1) * 0.6 + Math.sin(t * 73.9) * 0.4),
      amp * (Math.sin(t * 53.9 + 0.7) * 0.6 + Math.sin(t * 29.3 + 4.1) * 0.4),
    ];
  }

  /** the director: on the way down the camera swings low and wide for the landing, then circles the ship on the ground */
  private direct(f: MarsFlight, dt: number): void {
    if (this.map || f.frame !== 'mars') return;
    const idle = performance.now() - this.lastDragAt > 4000;
    if (!idle) return;
    const ease = (cur: number, to: number, rate: number) => cur + (to - cur) * (1 - Math.exp(-dt * rate));
    if (f.phase === 'landing') {
      this.camPitch = ease(this.camPitch, f.agl > 600 ? 0.12 : 0.03, 0.8);
      this.camDist = ease(this.camDist, f.agl > 600 ? 300 : 230, 0.6);
    } else if (f.phase === 'landed' && this.landedAt >= 0) {
      const t = this.wallT - this.landedAt;
      if (t > 2) this.camYaw += dt * 0.045;
      this.camPitch = ease(this.camPitch, 0.07, 0.3);
      this.camDist = ease(this.camDist, 190, 0.3);
    }
  }

  // ------------------------------------------------------------------ cameras and drawing
  /** the chase camera's offset round the ship (flight frame), and its up */
  private chase(f: MarsFlight): { off: Vec; up: Vec } {
    let up: Vec, pole: Vec;
    if (f.frame === 'sun') {
      up = [0, 0, 1];
      pole = vnorm(vscale(f.r, -1));
    } else {
      up = f.up();
      pole = f.frame === 'earth' ? [0, 1, 0] : [0, 0, 1];
    }
    let north = vsub(pole, vscale(up, vdot(pole, up)));
    north = vlen(north) > 1e-6 ? vnorm(north) : perp(up);
    const east = vnorm(vcross(north, up));
    const cp = Math.cos(this.camPitch);
    const dir = vadd(vadd(vscale(north, cp * Math.cos(this.camYaw)), vscale(east, cp * Math.sin(this.camYaw))), vscale(up, Math.sin(this.camPitch)));
    const dist = this.camDist * (f.stacked ? 1 : 0.62);
    return { off: vadd(vscale(dir, dist), this.paused ? [0, 0, 0] : this.shake(f)), up };
  }

  private mapMin(): number {
    const f = this.flight;
    if (!f) return 1;
    if (f.frame === 'sun') return 40;
    return (f.frame === 'mars' ? MARS.R : EARTH.R) * 1.3;
  }
  private mapMax(): number {
    const f = this.flight;
    if (!f) return 1;
    if (f.frame === 'sun') return 4000;
    return f.frame === 'mars' ? 1.2e9 : 2e9;
  }

  private render(f: MarsFlight, dt: number, w: number, h: number, warp: number): void {
    const look = this.middle(f);
    const { off, up } = this.chase(f);
    if (this.view === 'site') {
      const cam = this.siteCam;
      cam.aspect = w / Math.max(1, h);
      const lk = this.scenePos(look);
      const o = this.localDir(off), u = this.localDir(up);
      cam.fov = 50;
      cam.position.set(lk.x + o[0], lk.y + o[1], lk.z + o[2]);
      const gy = this.site!.groundAt(cam.position.x, cam.position.z) + 3;
      if (cam.position.y < gy) cam.position.y = gy;
      cam.up.set(u[0], u[1], u[2]);
      cam.lookAt(lk);
      cam.near = 0.5;
      cam.far = 140_000;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this.site!.renderFlight(dt, cam, this.fire!.fireLevel * (f.alt < 1500 ? 1 : 0), this.scenePos(this.base(f)).y, f.alt);
      this.drawOverlay(f, cam, EARTH.R, '');
      return;
    }
    if (this.view === 'earth') {
      const sp = this.space!;
      let cam: Vec, camUp: Vec, at: Vec;
      if (this.map) {
        if (!this.mapDist) this.mapDist = Math.max(this.mapMin(), vlen(f.r) * 3.2);
        const c = vscale(f.r, -1);
        const cp = Math.cos(this.mapPitch);
        cam = vadd(c, vscale([cp * Math.sin(this.mapYaw), Math.sin(this.mapPitch), cp * Math.cos(this.mapYaw)], this.mapDist));
        camUp = [0, 1, 0];
        at = c;
        sp.camera.fov = 45;
        this.updateTrack(f, EARTH_P.mu, EARTH.R);
      } else {
        const lk = vsub(look, f.r);
        cam = vadd(lk, off);
        const ra = vlen(vadd(f.r, cam)) - EARTH.R;
        if (ra < 5) cam = vadd(cam, vscale(f.up(), 5 - ra));
        camUp = up;
        at = lk;
        sp.camera.fov = 50;
      }
      sp.update({ origin: f.r as V3, cam: cam as V3, camUp: camUp as V3, look: at as V3, earthAngle: earthAngle(f.t), time: f.t }, w, h, this.map);
      this.drawWith?.(sp.scene, sp.camera);
      this.drawOverlay(f, sp.camera, EARTH.R, 'EARTH');
      return;
    }
    if (this.view === 'cruise') {
      const cv = this.cruise!;
      if (this.map) {
        if (!this.mapDist) this.mapDist = 620;
        const cp = Math.cos(this.mapPitch);
        const cam: Vec = [cp * Math.sin(this.mapYaw) * this.mapDist, -cp * Math.cos(this.mapYaw) * this.mapDist, Math.sin(this.mapPitch) * this.mapDist];
        cv.update({ r: f.r, v: f.v, jd: f.jd, cam, camUp: [0, 0, 1], look: [0, 0, 0], map: true, arriveJd: f.window.arr }, w, h);
      } else {
        const lk = vsub(look, f.r);
        cv.update({ r: f.r, v: f.v, jd: f.jd, cam: vadd(lk, off), camUp: up, look: lk, map: false, arriveJd: f.window.arr }, w, h);
      }
      this.drawWith?.(cv.scene, cv.camera);
      this.drawOverlay(f, cv.camera, 1, '');
      return;
    }
    // Mars
    const mv = this.mars!;
    let cam: Vec, camUp: Vec, at: Vec;
    if (this.map) {
      if (!this.mapDist) this.mapDist = Math.max(this.mapMin(), Math.min(vlen(f.r) * 2.5, 6e7));
      const c = vscale(f.r, -1);
      const cp = Math.cos(this.mapPitch);
      cam = vadd(c, vscale([cp * Math.sin(this.mapYaw), -cp * Math.cos(this.mapYaw), Math.sin(this.mapPitch)], this.mapDist));
      camUp = [0, 0, 1];
      at = c;
      mv.camera.fov = 45;
      this.updateTrack(f, MARS.mu, MARS.R);
    } else {
      const lk = vsub(look, f.r);
      cam = vadd(lk, off);
      // keep the camera above the ground
      const cw = vadd(f.r, cam);
      const ang = f.marsAngle();
      const cf = [cw[0] * Math.cos(-ang) - cw[1] * Math.sin(-ang), cw[0] * Math.sin(-ang) + cw[1] * Math.cos(-ang), cw[2]];
      const rr = vlen(cw);
      if (rr - MARS.R < 60_000) {
        const g = MARS.R + marsHeight((Math.asin(cf[2] / rr) * 180) / Math.PI, (Math.atan2(cf[1], cf[0]) * 180) / Math.PI) + 4;
        if (rr < g) cam = vadd(cam, vscale(vnorm(cw), g - rr));
      }
      camUp = up;
      at = lk;
      mv.camera.fov = 55;
    }
    const dust = f.sEng > 0 ? (f.throttle * f.sEng) / 3 : 0;
    mv.update({ origin: f.r, cam, camUp, look: at, angle: f.marsAngle(), sun: f.sunDir(), dust, axis: f.axis, engineAgl: f.agl + (f.phase === 'landing' || f.phase === 'landed' ? 0 : 4) }, w, h, dt * Math.min(warp, 4));
    this.drawWith?.(mv.scene, mv.camera);
    mv.restoreFog();
    this.drawOverlay(f, mv.camera, MARS.R, 'MARS');
  }

  /** the orbit (or the path ahead) drawn on the map */
  private updateTrack(f: MarsFlight, mu: number, R: number): void {
    const now = performance.now();
    if (now - this.trackAt < 400) return;
    this.trackAt = now;
    const vr = vlen(f.r);
    const en = (vlen(f.v) ** 2) / 2 - mu / vr;
    const span = en < 0 ? 2 * Math.PI * Math.sqrt((-mu / (2 * en)) ** 3 / mu) : Math.min(5 * DAY, (vr * 2) / Math.max(1, vlen(f.v)));
    const pts: Vec[] = [];
    const n = 360;
    for (let i = 0; i <= n; i++) {
      const st = propagate(f.r, f.v, (span * i) / n, mu);
      pts.push(st.r);
      if (vlen(st.r) < R) break;
    }
    this.trackPts = pts;
  }

  /** the solar-system map's names: the Sun, Earth, Mars and the ship, with where Mars will be on arrival */
  private drawSolarLabels(f: MarsFlight, cam: THREE.PerspectiveCamera, g: CanvasRenderingContext2D, w: number, h: number): void {
    const k = CRUISE_MAP_SCALE;
    const v = new THREE.Vector3();
    const at = (p: Vec) => {
      v.set(p[0] * k, p[1] * k, p[2] * k).project(cam);
      return v.z > 1 || v.z < -1 ? null : { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    };
    const label = (p: Vec, text: string, col: string, ring: number, dash = false) => {
      const s = at(p);
      if (!s) return;
      g.strokeStyle = col;
      g.lineWidth = 1.5;
      g.setLineDash(dash ? [3, 3] : []);
      g.beginPath();
      g.arc(s.x, s.y, ring, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = col;
      g.fillText(text, s.x + ring + 5, s.y + 4);
    };
    g.font = '600 12px Rajdhani, system-ui, sans-serif';
    label([0, 0, 0], 'SUN', 'rgba(255,220,150,0.95)', 9);
    label(earthState(f.jd).r, 'EARTH', 'rgba(130,190,255,0.95)', 7);
    label(marsState(f.jd).r, 'MARS', 'rgba(255,150,100,0.95)', 7);
    label(marsState(f.window.arr).r, `MARS ON ARRIVAL · ${dateText(f.window.arr)}`, 'rgba(255,150,100,0.6)', 6, true);
    label(f.r, 'STARSHIP', '#ffffff', 5);
  }

  /** draw the map's path over the scene: bright where it is in view, dashed behind the planet */
  private drawOverlay(f: MarsFlight, cam: THREE.PerspectiveCamera, R: number, name: string): void {
    const cv = this.cv;
    // (the layer covers the window; measure the window, since the canvas is hidden between maps)
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext('2d')!;
    // wipe every pixel (identity transform), and hide the layer outright when no map is up
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const show = this.map && this.view !== 'site';
    cv.style.display = show ? '' : 'none';
    if (!show) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.view === 'cruise') {
      this.drawSolarLabels(f, cam, g, w, h);
      return;
    }
    // the planet's centre is at -r in the scene; the camera is in scene coordinates
    const c = new THREE.Vector3(-f.r[0], -f.r[1], -f.r[2]);
    const cp = cam.position;
    const v = new THREE.Vector3();
    const proj = (p: Vec): { x: number; y: number; hid: boolean } | null => {
      v.set(p[0] - f.r[0], p[1] - f.r[1], p[2] - f.r[2]);
      // behind the planet? (the line of sight from the camera passes through the sphere first)
      const d = v.clone().sub(cp);
      const L = d.length();
      d.divideScalar(L);
      const oc = cp.clone().sub(c);
      const b = oc.dot(d), cc = oc.lengthSq() - R * R;
      const disc = b * b - cc;
      const hid = disc > 0 && -b - Math.sqrt(disc) > 0 && -b - Math.sqrt(disc) < L * 0.999;
      v.project(cam);
      if (v.z > 1 || v.z < -1) return null;
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, hid };
    };
    const sp = this.trackPts.map(proj);
    for (const pass of [0, 1]) {
      for (let i = 1; i < sp.length; i++) {
        const a = sp[i - 1], b = sp[i];
        if (!a || !b) continue;
        const hid = a.hid || b.hid;
        if (hid && pass === 0) continue;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.setLineDash(hid ? [3, 5] : []);
        g.lineWidth = pass === 0 ? 7 : hid ? 1 : 2.2;
        g.strokeStyle = pass === 0 ? 'rgba(120,200,255,0.18)' : `rgba(150,215,255,${hid ? 0.35 : 0.95})`;
        g.stroke();
      }
    }
    g.setLineDash([]);
    g.font = '600 12px Rajdhani, system-ui, sans-serif';
    const ship = proj(f.r);
    if (ship) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(ship.x, ship.y, 4, 0, Math.PI * 2);
      g.fill();
      g.fillText('STARSHIP', ship.x + 8, ship.y - 6);
    }
    v.copy(c).project(cam);
    if (v.z < 1) {
      g.fillStyle = 'rgba(230,236,245,0.85)';
      g.fillText(name, (v.x * 0.5 + 0.5) * w - 20, (-v.y * 0.5 + 0.5) * h);
    }
    // where the path meets the ground
    const last = this.trackPts[this.trackPts.length - 1];
    if (last && vlen(last) < R * 1.0001) {
      const e = proj(last);
      if (e) {
        g.strokeStyle = e.hid ? 'rgba(255,90,70,0.45)' : '#ff5a46';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(e.x - 6, e.y - 6);
        g.lineTo(e.x + 6, e.y + 6);
        g.moveTo(e.x + 6, e.y - 6);
        g.lineTo(e.x - 6, e.y + 6);
        g.stroke();
      }
    }
  }

  // ------------------------------------------------------------------ the HUD
  private updateHud(f: MarsFlight, warp: number, dt: number): void {
    this.elPhase.textContent = PHASE_NAME[f.phase];
    this.elDate.textContent = dateText(f.jd, true);
    if (this.liftT < 0) this.elMet.textContent = 'HOLDING ON THE PAD';
    else {
      const s = Math.max(0, f.t - this.liftT);
      const d = Math.floor(s / DAY), hh = Math.floor((s % DAY) / 3600), mm = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
      this.elMet.textContent = `T+ ${d ? d + 'd ' : ''}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }
    // telemetry, rebuilt only when it changes
    const rows: [string, string][] = [];
    const km = (m: number) => (Math.abs(m) >= 1e9 ? `${(m / 1e9).toFixed(2)} million km` : Math.abs(m) >= 1e6 ? `${Math.round(m / 1000).toLocaleString('en-US')} km` : Math.abs(m) >= 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
    const sp = f.speeds();
    if (f.frame === 'sun') {
      const e = earthState(f.jd).r, m = marsState(f.jd).r;
      rows.push(['SUN', `${(vlen(f.r) / 1.495978707e11).toFixed(3)} AU`]);
      rows.push(['SPEED', `${(vlen(f.v) / 1000).toFixed(2)} km/s`]);
      rows.push(['TO MARS', km(vlen(vsub(m, f.r)))]);
      rows.push(['FROM EARTH', km(vlen(vsub(e, f.r)))]);
      rows.push(['ARRIVAL', dateText(f.window.arr)]);
    } else {
      rows.push(['ALTITUDE', km(f.alt)]);
      if (f.frame === 'mars' && f.alt < 120_000) rows.push(['ABOVE GROUND', km(Math.max(0, f.agl))]);
      const low = f.alt < 120_000;
      rows.push([low ? 'AIRSPEED' : 'SPEED', `${low && sp.v < 3000 ? Math.round(sp.v) + ' m/s' : ((low ? sp.v : vlen(f.v)) / 1000).toFixed(2) + ' km/s'}`]);
      rows.push(['VERTICAL', `${sp.vz >= 0 ? '+' : ''}${Math.abs(sp.vz) < 1000 ? sp.vz.toFixed(1) + ' m/s' : (sp.vz / 1000).toFixed(2) + ' km/s'}`]);
      if (f.alt > 60_000 && f.phase !== 'pad') {
        const o = f.orbit();
        if (o && o.pe < 0 && o.ap !== Infinity) rows.push(['APOAPSIS', `${Math.round(o.ap / 1000)} km · suborbital`]);
        else if (o) rows.push([o.ap === Infinity ? 'PERIAPSIS' : 'ORBIT', o.ap === Infinity ? km(o.pe) : `${Math.round(o.pe / 1000)} × ${Math.round(o.ap / 1000)} km`]);
      }
      if (f.frame === 'mars') {
        const ll = f.marsLatLon();
        if (f.alt < 400_000) rows.push(['OVER', regionName(ll.lat, ll.lon).toUpperCase()]);
        if (f.phase === 'entry' || f.phase === 'descent') {
          rows.push(['HEATING', `${Math.round(f.heat / 1000)} kW/m²`]);
          if (f.phase === 'entry') rows.push(['BANK', `${Math.round(f.bank)}°`]);
        }
      }
      if (f.phase === 'orbit' && f.shipProp >= STARSHIP.ship.prop * 0.95) {
        const tw = f.toWindow;
        rows.push(['WINDOW', tw > 0 ? `${Math.floor(tw / DAY)}d ${Math.floor((tw % DAY) / 3600)}h` : 'OPEN']);
      }
    }
    // what the crew feel: nothing while coasting
    const felt = ['pad', 'landed', 'lost'].includes(f.phase) ? 1 : ['orbit', 'refuel', 'depart', 'cruise', 'approach'].includes(f.phase) ? 0 : f.gLoad;
    rows.push(['G', `${(f.phase === 'landed' ? 0.38 : felt).toFixed(2)} g`]);
    const eng = f.stacked && f.phase === 'boost' ? `${f.bEng} RAPTOR` : f.sEng + f.vEng > 0 ? `${f.sEng} SL + ${f.vEng} VAC` : 'OFF';
    rows.push(['ENGINES', eng + (eng !== 'OFF' ? ` · ${Math.round(f.throttle * 100)}%` : '')]);
    rows.push(['AUTOPILOT', f.auto ? 'ON' : 'MANUAL']);
    const shipK = f.shipProp / STARSHIP.ship.prop, boostK = f.stacked ? f.boosterProp / STARSHIP.booster.prop : -1;
    const key = rows.map((r) => r.join(':')).join('|') + `|${shipK.toFixed(3)}|${boostK.toFixed(3)}`;
    if (key !== this.telKey) {
      this.telKey = key;
      const bar = (label: string, kk: number, cls: string) => `<div class="mm-row"><span>${label}</span><span>${Math.round(kk * 100)}%</span></div><div class="mm-bar ${cls}"><i style="width:${(Math.max(0, Math.min(1, kk)) * 100).toFixed(1)}%"></i></div>`;
      this.elTel.innerHTML = rows.map(([a, b]) => `<div class="mm-row"><span>${a}</span><span>${b}</span></div>`).join('') + (boostK >= 0 ? bar('SUPER HEAVY PROP', boostK, 'b') : '') + bar('STARSHIP PROP', shipK, '');
    }
    // the log: the last few lines
    if (f.log.length && (f.log.length !== this.logSeen || f.log[f.log.length - 1] !== this.lastLog)) {
      this.logSeen = f.log.length;
      this.lastLog = f.log[f.log.length - 1];
      this.elLog.textContent = '';
      for (const l of f.log.slice(-5)) el('div', l.kind, this.elLog, l.text);
    }
    // the buttons
    const a = this.nextAction();
    this.elAct.classList.toggle('off', !a);
    if (a) this.elAct.textContent = a.label;
    this.elFF.classList.toggle('on', this.ff);
    this.elAuto.classList.toggle('on', f.auto);
    this.elMap.classList.toggle('on', this.map);
    this.elWarp.forEach((b, i) => b.classList.toggle('on', !this.ff && i === this.warpI));
    this.elFF.textContent = this.ff ? `⏩ ${warp >= 1e6 ? '1M' : warp >= 1000 ? Math.round(warp / 1000) + 'k' : Math.round(warp)}×` : '⏩ NEXT EVENT';
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.elFlash.classList.remove('show');
    }
    // the end of the mission
    if (f.outcome && this.endAt && !this.endShown && performance.now() > this.endAt) {
      this.endShown = true;
      const o = f.outcome;
      const site = f.frame === 'mars' ? (() => {
        const ll = f.marsLatLon();
        return ` Landing site: ${regionName(ll.lat, ll.lon)}, ${Math.abs(ll.lat).toFixed(2)}°${ll.lat >= 0 ? 'N' : 'S'} ${Math.abs(ll.lon).toFixed(2)}°${ll.lon >= 0 ? 'E' : 'W'}.`;
      })() : '';
      this.card(o.title.toUpperCase(), o.text + site + (o.ok ? ` ${Math.round((f.t - Math.max(0, this.liftT)) / DAY)} days from liftoff.` : ''), [
        ['LOOK AROUND', () => this.elCard.classList.remove('show')],
        ['FLY AGAIN', () => this.restart()],
        ['EXIT TO MENU', () => this.exit()],
      ]);
    }
  }
  private lastLog: unknown = null;
}

