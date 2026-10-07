// The Falcon Heavy and SLS missions on screen: the launch from the coastal
// complex (Falcon Heavy from Pad 3, SLS from Pad 1), the climb to orbit seen
// round the Earth, Falcon Heavy's side boosters coming home to the landing
// zones, and then each mission's own road:
//
//  · Europa Clipper: the escape burn, the arrays unfolding, and the cruise
//    through the real solar system past Mars and Earth to Jupiter, its orbit
//    insertion and a pass over Europa's ice.
//  · Artemis II: the translunar injection, Orion's arrays unfolding, the coast
//    out to the Moon, the pass behind its far side, the fall home, the fiery
//    entry, the parachutes and splashdown.
//
// The physics is in LaunchFlight and missionPlans; this draws it and runs the
// HUD (it borrows the Starship mission's look).

import * as THREE from 'three';
import type { LaunchSite } from '../../ui/menu/launchSite';
import { PAD3 } from '../../ui/menu/falconPad';
import { SpaceScene } from '../spaceScene';
import { sunDirection } from '../flightSim';
import { EARTH, MOON, PAD, V3, earthAngle, ecefDir, padScene, rotY, len, sub, scale, norm, add, cross, dot, air, moonState } from '../universe';
import { menuMusic } from '../../audio/menuMusic';
import { audio } from '../../audio/audio';
import { updateRecord } from '../record';
import { PLUME_FRAG, PLUME_VERT } from '../plumes';
import { LaunchFlight, FreeStage } from './launchFlight';
import { FALCON_HEAVY, SLS, FALCON_9, VehicleDef, EngineDef } from './vehicles';
import { buildFalconHeavy, buildSLS, buildFalcon9, poseCore, deployClipper, deployOrion, FalconRig, SlsRig, F9Rig, buildClipper, ClipperRig } from './launchModels';
import { buildISS, IssRig, pointArrays, openNose, buildDroneShip } from './iss';
import { planClipper, clipperAt, ClipperPlan, CLIPPER_DATES, solveFreeReturnSteps, solveCorrectionSteps, solveReturnSteps, FreeReturn } from './missionPlans';
import { SolarView } from '../solar/solarView';
import { neutralEnv } from '../mars/marsMission';
import { BODIES, bodyPos, BodyId, PLANETS, planetState } from '../solar/bodies';
import { AU, Vec, dateText, propagate } from '../mars/marsPhysics';

export type LaunchMissionId = 'clipper' | 'artemis' | 'iss';

const WARPS = [1, 2, 5, 10, 50, 100, 1000, 10_000, 100_000, 1_000_000];
const D2R = Math.PI / 180;
/** the SLS stands on Pad 1's mount: its aft skirts at this height */
const SLS_Y = 28;
/** where the drone ship waits in the site view (the stage's last minutes are drawn here, off the coast) */
const DRONE = new THREE.Vector3(1500, 0, -9000);
/** the ISS's orbit: 420 km, circular */
const ISS_R = 6_371_000 + 420_000;
/** the final approach, along the station's velocity to Harmony's forward port: [metres ahead of the port, seconds to get there, seconds holding] */
const APPROACH: [number, number, number, string][] = [
  [400, 240, 25, 'Waypoint 0, 400 m out: Dragon enters the approach ellipsoid and checks in with the station. GO for the approach.'],
  [220, 120, 20, 'Waypoint 1, 220 m: Dragon lines up on the docking axis, its sensors locked on the targets round Harmony\'s forward port.'],
  [20, 200, 25, 'Waypoint 2, 20 m: holding. Final GO from the crew and Houston.'],
  [0, 200, 0, 'Closing at 10 cm a second…'],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

// ---------------------------------------------------------------- engine plumes
interface PlumeSet {
  meshes: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; core: boolean }[];
  kind: EngineDef['kind'];
  r: number;
}
const PLUME_GEO = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 32, 20, true);
  g.translate(0, -0.5, 0);
  return g;
})();
/** a plume (two layers) on an engine's exit, in a parent group */
function addPlume(parent: THREE.Object3D, at: THREE.Vector3, r: number, kind: EngineDef['kind']): PlumeSet {
  const set: PlumeSet = { meshes: [], kind, r };
  for (const core of [false, true]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        r0: { value: 1 }, r1: { value: 2 }, spread: { value: 0.7 },
        core: { value: new THREE.Color() }, outer: { value: new THREE.Color() }, smoke: { value: new THREE.Color() },
        power: { value: 0 }, time: { value: 0 }, len: { value: 50 }, diamonds: { value: 0 }, curtain: { value: 0 }, turb: { value: 1 }, seed: { value: Math.random() * 50 },
      },
      vertexShader: PLUME_VERT,
      fragmentShader: PLUME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(PLUME_GEO, mat);
    mesh.position.copy(at);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = core ? 9 : 8;
    parent.add(mesh);
    set.meshes.push({ mesh, mat, core });
  }
  return set;
}
/** shape and colour a plume for its propellant, the air pressure and the throttle */
function drivePlume(s: PlumeSet, on: number, pressure: number, t: number): void {
  const k = Math.max(0, Math.min(1, pressure / 101_325));
  const vac = 1 - k;
  for (const { mesh, mat, core } of s.meshes) {
    mesh.visible = on > 0.01;
    if (!mesh.visible) continue;
    const u = mat.uniforms;
    const R = s.r;
    let L = 0, r1 = 0, power = 0;
    switch (s.kind) {
      case 'kerolox':
        // Merlin: a yellow-white core in orange, long and narrow low down, a huge glowing bell up high
        L = (core ? 10 : 26) * R * (1 + vac * 3);
        r1 = R * (core ? 0.9 + vac * 3 : 1.6 + vac * 9);
        (u.core.value as THREE.Color).setRGB(3.2, 2.6, 1.7);
        (u.outer.value as THREE.Color).setRGB(2.6, 1.2, 0.4);
        (u.smoke.value as THREE.Color).setRGB(0.4, 0.18, 0.06);
        u.diamonds.value = core ? 0.6 * k : 0;
        power = (core ? 1.3 : 0.75) * (0.35 + 0.65 * k + 0.3 * vac);
        break;
      case 'kerolox-vac':
      case 'hydrolox-vac':
        L = (core ? 6 : 22) * R;
        r1 = R * (core ? 1.4 : 5);
        (u.core.value as THREE.Color).setRGB(s.kind === 'kerolox-vac' ? 2.4 : 1.6, s.kind === 'kerolox-vac' ? 1.8 : 1.7, s.kind === 'kerolox-vac' ? 1.4 : 2.4);
        (u.outer.value as THREE.Color).setRGB(s.kind === 'kerolox-vac' ? 1.2 : 0.6, 0.6, s.kind === 'kerolox-vac' ? 0.6 : 1.4);
        (u.smoke.value as THREE.Color).setRGB(0.1, 0.06, 0.1);
        u.diamonds.value = 0;
        power = core ? 0.8 : 0.3;
        break;
      case 'hydrolox':
        // RS-25: nearly clear, with bright Mach diamonds in thick air; a pale violet-blue glow up high
        L = (core ? 9 : 20) * R * (1 + vac * 2.5);
        r1 = R * (core ? 0.8 + vac * 2 : 1.3 + vac * 6);
        (u.core.value as THREE.Color).setRGB(2.6, 2.4, 2.9);
        (u.outer.value as THREE.Color).setRGB(1.0, 0.9, 1.5);
        (u.smoke.value as THREE.Color).setRGB(0.25, 0.25, 0.35);
        u.diamonds.value = core ? 2.4 * k : 0;
        power = (core ? 0.95 : 0.4) * (0.6 + 0.4 * k);
        break;
      case 'solid':
        // the SRBs: a blinding white-gold flame, very long, thick with smoke
        L = (core ? 16 : 40) * R * (1 + vac * 2);
        r1 = R * (core ? 1.1 + vac * 3 : 2.4 + vac * 7);
        (u.core.value as THREE.Color).setRGB(4.0, 3.4, 2.4);
        (u.outer.value as THREE.Color).setRGB(3.2, 2.0, 0.8);
        (u.smoke.value as THREE.Color).setRGB(1.0, 0.85, 0.7);
        u.diamonds.value = 0;
        power = core ? 1.5 : 1.0;
        break;
      default:
        L = 8 * R;
        r1 = 2 * R;
        power = 0.4;
    }
    mesh.scale.set(1, L, 1);
    u.r0.value = R * (core ? 0.6 : 0.95);
    u.r1.value = r1;
    u.len.value = L;
    u.power.value = power * on * (0.92 + Math.random() * 0.08);
    u.time.value = t;
    u.turb.value = core ? 0.6 : 1;
  }
}

// ---------------------------------------------------------------- the mission
type View = 'site' | 'earth' | 'solar';

export class LaunchMission {
  active = false;
  drawWith: ((scene: THREE.Scene, camera: THREE.Camera) => void) | null = null;
  onExit: (() => void) | null = null;
  id: LaunchMissionId = 'clipper';
  flight: LaunchFlight | null = null;
  private vehicle: VehicleDef = FALCON_HEAVY;
  private site: LaunchSite | null = null;
  private space: SpaceScene | null = null;
  private solar: SolarView | null = null;
  private fh: FalconRig | null = null;
  private sls: SlsRig | null = null;
  private f9: F9Rig | null = null;
  private iss: IssRig | null = null;
  private drone: THREE.Group | null = null;
  /** Crew Dragon's road to the station: the plan and where it has got to */
  private rv: {
    phase: 'plan' | 'wait' | 'transfer' | 'approach' | 'docked' | 'undock' | 'home';
    t0: number;
    e1: V3;
    e2: V3;
    phi0: number;
    n: number;
    tBurn1: number;
    tArrive: number;
    speed1: number;
    /** the approach: its clock, the start offset (ahead, up, starboard of the port) and the segment it is on */
    tA: number;
    off0: V3;
    seg: number;
    segT: number;
    told: number;
    prevX: number;
    said: number;
    rate: number;
  } | null = null;
  private noseT = -1;
  /** the Draco thrusters' puffs during the approach */
  private puffs: { sp: THREE.Sprite; t: number }[] = [];
  private puffT = 0;
  /** the stack (what the camera follows) */
  private holder = new THREE.Group();
  /** separated stages flying on their own, each in its own holder */
  private freeHolders = new Map<FreeStage, THREE.Group>();
  private plumes: { set: PlumeSet; which: 'booster' | 'core' | 'upper' | 'free'; free?: FreeStage }[] = [];
  private view: View = 'site';
  private siteCam = new THREE.PerspectiveCamera(50, 1, 0.5, 400_000);
  private padLight = new THREE.PointLight(0xffa050, 0, 0, 2);
  private warpI = 0;
  private ff = false;
  private paused = false;
  private camYaw = -1.0;
  private camPitch = 0.12;
  private camDist = 180;
  private lastDrag = -1e9;
  private follow: 'stack' | 'boosters' = 'stack';
  private keys = new Set<string>();
  private drag: { id: number; x: number; y: number } | null = null;
  private wallT = 0;
  private liftT = -1;
  private fairT = -1;
  private lasT = -1;
  private sepT = -1;
  private deployK = 0;
  // Clipper
  private plan: ClipperPlan | null = null;
  private clipper: ClipperRig | null = null;
  private jd = 0;
  /** the cruise: from leaving Earth's sphere of influence */
  private cruising = false;
  private cruiseEvents: { jd: number; text: string; flash: string; done: boolean }[] = [];
  private arrived = false;
  private europaT = -1;
  // Artemis
  private fr: FreeReturn | null = null;
  private tliAt = -1;
  private tliLead = 300;
  private corrected = false;
  private periluneSeen = false;
  private returnFixed = false;
  private chutes: THREE.Group | null = null;
  /** a trajectory being worked out, a slice each frame (the mission clock holds meanwhile) */
  private job: { g: Generator<void, unknown>; done: (v: unknown) => void } | null = null;
  private splashT = -1;
  private endShown = false;
  private endAt = 0;
  private logSeen = 0;
  // HUD
  private ui: HTMLDivElement;
  private elKick: HTMLElement;
  private elPhase: HTMLElement;
  private elDate: HTMLElement;
  private elMet: HTMLElement;
  private elTel: HTMLElement;
  private elLog: HTMLElement;
  private elAct: HTMLButtonElement;
  private elFF: HTMLButtonElement;
  private elWarp: HTMLButtonElement[] = [];
  private elFollow: HTMLButtonElement;
  private elFlash: HTMLElement;
  private elCard: HTMLElement;
  private elCardT: HTMLElement;
  private elCardS: HTMLElement;
  private elCardR: HTMLElement;
  private elHelp: HTMLElement;
  private elLabels: HTMLDivElement;
  private elBot!: HTMLElement;
  private flashT = 0;
  private telKey = '';
  private path: THREE.Line | null = null;

  constructor(private getSite: () => LaunchSite, private getRenderer: () => THREE.WebGLRenderer, parent: HTMLElement) {
    // (the Starship mission's stylesheet is already on the page: the same look)
    this.ui = el('div', 'mm-ui hidden', parent);
    this.elLabels = el('div', '', this.ui);
    const tl = el('div', 'mm-tl', this.ui);
    this.elKick = el('div', 'mm-k', tl, '');
    this.elPhase = el('div', 'mm-ph', tl, '');
    this.elDate = el('div', 'mm-date', tl, '');
    this.elMet = el('div', 'mm-date', tl, '');
    this.elTel = el('div', 'mm-tr', this.ui);
    this.elLog = el('div', 'mm-log', this.ui);
    const bot = (this.elBot = el('div', 'mm-bot', this.ui));
    this.elAct = el('button', 'mm-btn mm-act', bot, 'LAUNCH');
    this.elAct.addEventListener('click', () => this.action());
    this.elFF = el('button', 'mm-btn', bot, '⏩ NEXT EVENT');
    this.elFF.addEventListener('click', () => this.setFF(!this.ff));
    const warp = el('div', 'mm-warp', bot);
    WARPS.forEach((w, i) => {
      const b = el('button', '', warp, w >= 1e6 ? '1M×' : w >= 1000 ? `${w / 1000}k×` : `${w}×`);
      b.addEventListener('click', () => {
        this.warpI = i;
        this.ff = false;
      });
      this.elWarp.push(b);
    });
    this.elFollow = el('button', 'mm-btn', bot, 'CAMERA');
    this.elFollow.addEventListener('click', () => {
      this.follow = this.follow === 'stack' ? 'boosters' : 'stack';
    });
    const help = el('button', 'mm-btn', bot, '?');
    help.addEventListener('click', () => this.elHelp.classList.toggle('show'));
    const ex = el('button', 'mm-btn', bot, 'EXIT');
    ex.addEventListener('click', () => this.setPaused(true));
    this.elFlash = el('div', 'mm-flash', this.ui);
    this.elHelp = el('div', 'mm-help', this.ui);
    this.elHelp.innerHTML = [
      ['SPACE', 'the next step (launch, burns…)'],
      ['F', 'fast forward to the next event'],
      ['1 … 0', 'time warp'],
      ['C', 'camera: follow the rocket or the boosters'],
      ['DRAG · WHEEL', 'look around · zoom'],
      ['ESC', 'pause'],
    ].map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('');
    this.elHelp.addEventListener('click', () => this.elHelp.classList.remove('show'));
    this.elCard = el('div', 'mm-card', this.ui);
    const cb = el('div', 'mm-card-b', this.elCard);
    this.elCardT = el('div', 'mm-card-t', cb);
    this.elCardS = el('div', 'mm-card-s', cb);
    this.elCardR = el('div', 'mm-card-r', cb);

    window.addEventListener('keydown', (e) => this.onKey(e), { capture: true });
    window.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('button, .mm-tr, .mm-help, .mm-card')) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      this.camYaw -= (e.clientX - this.drag.x) * 0.005;
      this.camPitch = Math.max(-1.4, Math.min(1.4, this.camPitch + (e.clientY - this.drag.y) * 0.004));
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.lastDrag = performance.now();
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
        this.camDist = Math.max(12, Math.min(5e7, this.camDist * Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0018)));
      },
      { passive: true },
    );
  }

  // ------------------------------------------------------------------ lifecycle
  start(id: LaunchMissionId): void {
    this.id = id;
    this.vehicle = id === 'clipper' ? FALCON_HEAVY : id === 'artemis' ? SLS : FALCON_9;
    this.fh = null;
    this.sls = null;
    this.f9 = null;
    this.rv = null;
    this.noseT = -1;
    this.site = this.getSite();
    const renderer = this.getRenderer();
    const env = () => neutralEnv(renderer, new THREE.Color(0.62, 0.64, 0.68), new THREE.Color(0.32, 0.33, 0.35), new THREE.Color(0.1, 0.1, 0.11));
    if (!this.space) {
      this.space = new SpaceScene(sunDirection());
      this.space.scene.environment = env();
      this.space.scene.environmentIntensity = 0.35;
    }
    if (!this.solar) {
      this.solar = new SolarView();
      this.solar.scene.environment = env();
      this.solar.scene.environmentIntensity = 0.35;
    }
    // a fresh vehicle every flight
    this.holder.clear();
    for (const h of this.freeHolders.values()) h.parent?.remove(h);
    this.freeHolders.clear();
    this.plumes = [];
    if (id === 'clipper') {
      this.fh = buildFalconHeavy();
      this.holder.add(this.fh.group);
      const merlinR = 0.46;
      for (const c of this.fh.sides) for (const e of c.engines) this.plumes.push({ set: addPlume(c.group, e.clone().setY(-0.95), merlinR, 'kerolox'), which: 'booster' });
      for (const e of this.fh.centre.engines) this.plumes.push({ set: addPlume(this.fh.centre.group, e.clone().setY(-0.95), merlinR, 'kerolox'), which: 'core' });
      this.plumes.push({ set: addPlume(this.fh.upper, this.fh.mvac, 1.6, 'kerolox-vac'), which: 'upper' });
      this.clipper = this.fh.payload;
      this.plan = planClipper();
      this.jd = CLIPPER_DATES.launch;
    } else if (id === 'iss') {
      this.f9 = buildFalcon9();
      this.holder.add(this.f9.group);
      for (const e of this.f9.core.engines) this.plumes.push({ set: addPlume(this.f9.core.group, e.clone().setY(-0.95), 0.46, 'kerolox'), which: 'core' });
      this.plumes.push({ set: addPlume(this.f9.upper, this.f9.mvac, 1.6, 'kerolox-vac'), which: 'upper' });
      this.plan = null;
      this.jd = Date.now() / 86_400_000 + 2_440_587.5;
      if (!this.iss) this.iss = buildISS();
      this.space.scene.add(this.iss.group);
      this.iss.group.visible = false;
      if (!this.drone) this.drone = buildDroneShip();
    } else {
      this.sls = buildSLS();
      this.holder.add(this.sls.group);
      for (const e of this.sls.rs25) this.plumes.push({ set: addPlume(this.sls.core, e, 1.15, 'hydrolox'), which: 'core' });
      for (const b of this.sls.srbs) this.plumes.push({ set: addPlume(b, this.sls.srbNozzle, 1.45, 'solid'), which: 'booster' });
      this.plumes.push({ set: addPlume(this.sls.icps, this.sls.rl10, 0.95, 'hydrolox-vac'), which: 'upper' });
      this.plan = null;
      this.jd = Date.now() / 86_400_000 + 2_440_587.5;
    }
    const onPad3 = id === 'clipper' || id === 'iss';
    const f = (this.flight = new LaunchFlight(this.vehicle, onPad3 ? [PAD3.x, PAD3.z] : [0, 0]));
    if (id === 'clipper') f.lz = PAD3.lz.map((l) => LaunchFlight.siteToEcef(l.x, l.z, 0.5));
    if (id === 'iss') {
      // northeast up the coast, into the station's 51.6 degree orbit; Dragon is let go at about 200 km
      f.azimuth = 44;
      f.parkAlt = 200_000;
      this.drone!.position.copy(DRONE);
      this.drone!.rotation.y = 0.4;
      this.site.scene.add(this.drone!);
    } else if (this.drone) this.drone.removeFromParent();
    if (this.iss && id !== 'iss') this.iss.group.removeFromParent();
    this.site.setFlying(true);
    this.site.usePad(onPad3 ? 3 : 1);
    this.view = 'site';
    this.attach();
    this.warpI = 0;
    this.ff = false;
    this.paused = false;
    this.camYaw = onPad3 ? -0.9 : -1.15;
    this.camPitch = 0.1;
    this.camDist = id === 'clipper' ? 160 : id === 'iss' ? 130 : 230;
    this.follow = 'stack';
    this.liftT = this.fairT = this.lasT = this.sepT = -1;
    this.deployK = 0;
    this.cruising = false;
    this.arrived = false;
    this.europaT = -1;
    this.fr = null;
    this.tliAt = -1;
    this.corrected = false;
    this.periluneSeen = false;
    this.returnFixed = false;
    this.chutes = null;
    this.job = null;
    this.splashT = -1;
    this.endShown = false;
    this.endAt = 0;
    this.logSeen = 0;
    this.elLog.textContent = '';
    this.elCard.classList.remove('show');
    this.cruiseEvents = [];
    if (this.path) {
      this.path.parent?.remove(this.path);
      this.path = null;
    }
    this.active = true;
    this.ui.classList.remove('hidden');
    menuMusic.want('flight', true);
    this.elKick.textContent = id === 'clipper' ? 'FALCON HEAVY · EUROPA CLIPPER' : id === 'iss' ? 'FALCON 9 · CREW DRAGON TO THE ISS' : 'SLS · ARTEMIS II';
    if (id === 'iss') {
      f.say('Falcon 9 on Pad 3 with Crew Dragon and four astronauts, bound for the International Space Station, 420 km up.');
      f.say('Press LAUNCH (Space). The first stage lands on the drone ship out in the Atlantic: the camera follows it in (C switches). Then Dragon chases down the station and docks.');
    } else if (id === 'clipper') {
      f.say(`Falcon Heavy on Pad 3 with NASA's Europa Clipper: the biggest planetary spacecraft NASA has built, bound for Jupiter's ocean moon. The real mission, from its launch on ${dateText(CLIPPER_DATES.launch)}.`);
      f.say('Press LAUNCH (Space). Watch the side boosters come home: the camera follows them in (C switches).');
    } else {
      f.say('SLS on Pad 1 with Orion and a crew of four: Artemis II, the first people round the Moon since 1972.');
      f.say('Press LAUNCH (Space). In orbit the autopilot plans the free return round the Moon\'s far side.');
    }
    this.flash(id === 'clipper' ? 'FALCON HEAVY · PAD 3' : id === 'iss' ? 'FALCON 9 · PAD 3' : 'SLS · PAD 1');
  }

  stop(): void {
    this.active = false;
    this.ui.classList.add('hidden');
    menuMusic.want('flight', false);
    this.holder.parent?.remove(this.holder);
    for (const h of this.freeHolders.values()) h.parent?.remove(h);
    this.padLight.parent?.remove(this.padLight);
    if (this.path) this.path.parent?.remove(this.path);
    this.drone?.removeFromParent();
    this.iss?.group.removeFromParent();
    this.site?.setFlying(false);
    this.site?.usePad(1);
  }

  private exit(): void {
    this.stop();
    this.onExit?.();
  }

  private sceneOf(v: View): THREE.Scene {
    return v === 'site' ? this.site!.scene : v === 'earth' ? this.space!.scene : this.solar!.scene;
  }
  private attach(): void {
    const s = this.sceneOf(this.view);
    s.add(this.holder);
    for (const h of this.freeHolders.values()) s.add(h);
    if (this.view === 'site') s.add(this.padLight);
    else this.padLight.parent?.remove(this.padLight);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const c = e.code;
    let used = true;
    if (c === 'Space') this.action();
    else if (c === 'KeyF') this.setFF(!this.ff);
    else if (c === 'KeyC') this.follow = this.follow === 'stack' ? 'boosters' : 'stack';
    else if (/^Digit[0-9]$/.test(c)) {
      const n = Number(c.slice(5));
      this.warpI = n === 0 ? 9 : n - 1;
      this.ff = false;
    } else if (c === 'Escape') this.setPaused(!this.paused);
    else if (c === 'KeyH' || c === 'Slash') this.elHelp.classList.toggle('show');
    else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  private setFF(on: boolean): void {
    this.ff = on;
    if (!on) this.warpI = 0;
  }
  private setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.card('PAUSED', 'The mission clock is stopped.', [['RESUME', () => this.setPaused(false)], ['START OVER', () => this.restart()], ['EXIT TO MENU', () => this.exit()]]);
    else this.elCard.classList.remove('show');
  }
  private restart(): void {
    const id = this.id;
    this.stop();
    this.start(id);
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

  // ------------------------------------------------------------------ the mission's steps
  private nextAction(): { label: string; run: () => void } | null {
    const f = this.flight;
    if (this.job) return null;
    if (!f || f.outcome) return null;
    if (f.phase === 'pad') return { label: 'LAUNCH', run: () => f.launch() };
    if (this.id === 'iss') {
      const rv = this.rv;
      if (!rv) return null;
      if (rv.phase === 'wait') return { label: 'WARP TO THE ORBIT-RAISING BURN', run: () => this.setFF(true) };
      if (rv.phase === 'transfer') return { label: 'WARP TO THE STATION', run: () => this.setFF(true) };
      if (rv.phase === 'docked') return { label: 'UNDOCK AND COME HOME', run: () => this.undock() };
      if (rv.phase === 'home' && f.phase === 'coast') return { label: 'WARP TO ENTRY', run: () => this.setFF(true) };
      return null;
    }
    if (this.id === 'clipper') {
      if (f.phase === 'orbit') return { label: 'ESCAPE BURN', run: () => this.escapeBurn() };
      if (this.cruising && !this.arrived) return { label: 'WARP TO THE NEXT EVENT', run: () => this.setFF(true) };
      if (this.arrived && this.europaT < 0) return { label: 'FLY PAST EUROPA', run: () => this.europaFlyby() };
    } else {
      if (f.phase === 'orbit' && !this.fr) return { label: 'PLAN THE FREE RETURN', run: () => this.planTli() };
      if (f.phase === 'orbit' && this.fr) return { label: 'WARP TO THE BURN', run: () => this.setFF(true) };
      if (f.phase === 'coast' || f.phase === 'escaped') return { label: 'WARP TO THE NEXT EVENT', run: () => this.setFF(true) };
    }
    return null;
  }
  private action(): void {
    const a = this.nextAction();
    if (!a) return;
    audio.init();
    audio.click();
    a.run();
  }

  private escapeBurn(): void {
    const f = this.flight!;
    const p = this.plan!;
    const vinf = Math.hypot(...p.vinfDepart);
    // what the stage can give, and what the route asks
    f.burnTo((vinf * vinf) / 2, `Second burn of the Merlin Vacuum: escape velocity, out of Earth's grip and onto the road to Mars.`, `Escape! Europa Clipper is leaving Earth for good.`);
  }

  private planTli(): void {
    const f = this.flight!;
    if (this.job) return;
    f.say('Planning the translunar injection: when and how hard to burn so the Moon\'s gravity swings Orion round its far side and back to Earth.', 'info');
    this.runJob(solveFreeReturnSteps(f.r, f.v, f.t), (fr) => {
      this.fr = fr;
      this.tliAt = f.t + fr.wait;
      // how long the burn takes, to centre it on the planned moment (ICPS then Orion)
      const V = this.vehicle;
      const ve = V.upper.engine.ispVac * 9.80665;
      const m0 = f.mass;
      const dvIcps = Math.min(fr.dvPro, ve * Math.log(m0 / (m0 - f.upperProp)));
      const tIcps = (m0 * (1 - Math.exp(-dvIcps / ve))) / (V.upper.engine.thrustVac / ve);
      const dvO = Math.max(0, fr.dvPro - dvIcps);
      const tO = (V.payload.mass * (1 - Math.exp(-dvO / (316 * 9.80665)))) / (26_700 / (316 * 9.80665));
      this.tliLead = Math.min(fr.wait, (tIcps + tO) / 2);
      f.say(`Free return found: burn ${(fr.dvPro / 1000).toFixed(2)} km/s in ${Math.round(fr.wait / 60)} min. Closest approach ${Math.round(fr.trial.perilune / 1000).toLocaleString('en-US')} km above the far side; home in ${((fr.trial.tReturn - f.t) / 86400).toFixed(1)} days.`, 'good');
    });
  }

  private runJob<T>(g: Generator<void, T>, done: (v: T) => void): void {
    this.job = { g: g as Generator<void, unknown>, done: done as (v: unknown) => void };
  }

  private tli(): void {
    const f = this.flight!;
    const fr = this.fr!;
    const vAfter = len(f.v) + fr.dvPro;
    const en = (vAfter * vAfter) / 2 - EARTH.GM / len(f.r);
    // Orion's European Service Module: the AJ10 main engine, 26.7 kN, 316 s, 8.6 t of propellant
    f.kick = { thrust: 26_700, isp: 316, prop: 8_600, say: 'The ICPS is empty: Orion separates and lights the service module\'s main engine to finish the injection.' };
    f.burnTo(en, 'Translunar injection: the ICPS\'s RL10 lights, then Orion\'s own engine takes over.', 'TLI complete: Orion is on its way to the Moon.');
  }

  private europaFlyby(): void {
    this.europaT = 0;
    this.flash('EUROPA');
    this.flight!.say('Flyby of Europa at 25 km above the ice: the radar looks for the ocean underneath, the cameras map the cracks where it may come to the surface.', 'good');
  }

  // ------------------------------------------------------------------ the frame
  frame(dtReal: number, w: number, h: number): void {
    const f = this.flight;
    if (!f || !this.site) return;
    const dt = Number.isFinite(dtReal) ? Math.max(0, Math.min(0.1, dtReal)) : 0;
    this.wallT += dt;
    let warp = WARPS[this.warpI];
    if (this.ff) {
      const te = this.timeToEvent();
      if (te <= 1) {
        this.ff = false;
        this.warpI = 0;
        warp = 1;
      } else warp = Math.max(1, Math.min(1_000_000, te / 3));
    }
    // the burns that must fly at real speed
    if (f.phase === 'burn' || (f.phase !== 'pad' && f.alt < 200_000 && f.phase !== 'orbit' && f.phase !== 'coast' && f.phase !== 'escaped' && f.phase !== 'splash')) warp = Math.min(warp, f.phase === 'burn' ? 50 : 10);
    if (this.job) {
      const t0 = performance.now();
      while (performance.now() - t0 < 10) {
        const n = this.job.g.next();
        if (n.done) {
          const d = this.job.done;
          this.job = null;
          d(n.value);
          break;
        }
      }
    }
    if (this.rv && (this.rv.phase === 'approach' || this.rv.phase === 'docked' || this.rv.phase === 'undock')) warp = Math.min(warp, 20);
    const step = this.paused || this.job ? 0 : dt * warp;
    if (this.cruising) this.stepCruise(step);
    else f.advance(step);
    this.jd += this.cruising ? 0 : step / 86400;
    this.script(f);
    this.pickView(f);
    this.place(f, dt);
    this.render(f, dt, w, h);
    this.hud(f, warp, dt, w, h);
  }

  private timeToEvent(): number {
    const f = this.flight!;
    if (this.id === 'iss') {
      const rv = this.rv;
      if (!rv) return 0;
      if (rv.phase === 'wait') return rv.tBurn1 - f.t - 20;
      if (rv.phase === 'transfer') return rv.tArrive - f.t - 60;
      if (rv.phase === 'home' && f.phase === 'coast') {
        const vr = -dot(f.v, norm(f.r));
        return Math.max(0, (f.alt - 140_000) / Math.max(150, vr)) - 60;
      }
      return 0;
    }
    if (this.id === 'clipper') {
      if (this.cruising) {
        const ev = this.cruiseEvents.find((e) => !e.done);
        return ev ? (ev.jd - this.jd) * 86400 - 3600 : 0;
      }
      if (f.phase === 'escaped') return Math.max(0, (4e8 - len(f.r)) / Math.max(1000, len(f.v)));
      return 0;
    }
    if (f.phase === 'orbit' && this.tliAt > 0) return this.tliAt - f.t - 60;
    if (f.phase === 'coast') {
      if (!this.corrected) return f.t > 0 ? Math.max(0, this.tliAt + 4 * 3600 - f.t) : 0;
      if (!this.periluneSeen && this.fr) return Math.max(0, this.fr.trial.tPerilune - f.t - 1800);
      if (!this.returnFixed && this.fr) return Math.max(0, this.fr.trial.tPerilune + 86400 - f.t);
      // falling home: to the top of the atmosphere
      const vr = -dot(f.v, norm(f.r));
      return Math.max(0, (f.alt - 140_000) / Math.max(500, vr)) - 60;
    }
    return 0;
  }

  /** the mission's own sequence on top of the flight */
  private script(f: LaunchFlight): void {
    if (f.phase !== 'pad' && this.liftT < 0) {
      this.liftT = this.wallT;
      updateRecord((r) => r.launches++);
    }
    if (!f.fairingOn && this.fairT < 0) this.fairT = this.wallT;
    if (this.id === 'iss') this.dragonScript(f);
    else if (this.id === 'artemis') {
      if (!f.fairingOn && this.lasT < 0) this.lasT = this.wallT;
      if (f.phase === 'orbit' && this.fr && f.t >= this.tliAt - this.tliLead && this.tliAt > 0) this.tli();
      // after the injection: Orion lets go of the ICPS and opens its arrays
      if ((f.phase === 'escaped' || f.phase === 'coast') && !f.payloadOnly) f.separatePayload(26_520);
      if (f.payloadOnly && this.sepT < 0) {
        this.sepT = this.wallT;
        f.say('Orion separates from the ICPS and unfolds its four solar array wings, 19 m tip to tip.', 'good');
        this.flash('ORION');
      }
      // the outbound correction burn, a day out
      if (f.phase === 'coast' && f.payloadOnly && !this.corrected && f.t > this.tliAt + 4 * 3600) {
        this.corrected = true;
        this.runJob(solveCorrectionSteps(f.r, f.v, f.t), (c) => {
          f.v = add(f.v, c.dv);
          if (this.fr) this.fr.trial = c.trial;
          f.say(`Outbound trajectory correction: ${len(c.dv).toFixed(1)} m/s from the service module's engine. Closest approach to the Moon now ${Math.round(c.trial.perilune / 1000).toLocaleString('en-US')} km, over the far side.`, 'info');
        });
      }
      // the return correction, a day past the Moon: aim for the entry corridor
      if (this.periluneSeen && !this.returnFixed && f.phase === 'coast' && this.fr && f.t > this.fr.trial.tPerilune + 86400) {
        this.returnFixed = true;
        this.runJob(solveReturnSteps(f.r, f.v, f.t), (c) => {
          f.v = add(f.v, c.dv);
          const fr = this.fr!;
          fr.trial = { ...fr.trial, returnPerigee: c.trial.returnPerigee, tReturn: c.trial.tReturn };
          f.say(`Return trajectory correction: ${len(c.dv).toFixed(1)} m/s to aim for the entry corridor, ${((c.trial.tReturn - f.t) / 86400).toFixed(1)} days out.`, 'info');
        });
      }
      if (this.fr && !this.periluneSeen && f.phase === 'coast' && f.t > this.fr.trial.tPerilune) {
        this.periluneSeen = true;
        const m = f.moon();
        this.flash('THE FAR SIDE OF THE MOON');
        f.say(`Closest approach: ${Math.round(m.d / 1000).toLocaleString('en-US')} km over the far side, ${Math.round(len(f.r) / 1000).toLocaleString('en-US')} km from Earth${len(f.r) > 400_171_000 ? ': farther than any crew before, past Apollo 13\'s 400,171 km' : ''}. Out of radio contact behind the Moon; then Earth rises over its edge.`, 'good');
        updateRecord((r) => (r.daysInSpace += (f.t - 500) / 86400));
      }
    } else {
      if (f.phase === 'escaped' && !f.payloadOnly) {
        f.separatePayload(6_065);
        this.sepT = this.wallT;
        f.say('Spacecraft separation: Europa Clipper is flying on its own. The two solar arrays, 30.5 m from tip to tip, unfold.', 'good');
        this.flash('EUROPA CLIPPER');
      }
      // out of Earth's sphere of influence: on to the route round the Sun
      if (f.phase === 'escaped' && f.payloadOnly && len(f.r) > 9.2e8 && !this.cruising) this.beginCruise(f);
    }
    if (f.outcome && !this.endAt) this.endAt = performance.now() + (f.outcome.ok ? 4000 : 3000);
    if (f.outcome && this.endAt && !this.endShown && performance.now() > this.endAt) {
      this.endShown = true;
      if (f.outcome.ok) updateRecord((r) => r.missions++);
      this.card(f.outcome.title.toUpperCase(), f.outcome.text, [
        ['LOOK AROUND', () => this.elCard.classList.remove('show')],
        ['FLY AGAIN', () => this.restart()],
        ['EXIT TO MENU', () => this.exit()],
      ]);
    }
    // the log
    if (f.log.length !== this.logSeen) {
      this.logSeen = f.log.length;
      this.elLog.textContent = '';
      for (const l of f.log.slice(-4)) el('div', l.kind, this.elLog, l.text);
    }
  }

  // ------------------------------------------------------------------ Crew Dragon to the ISS
  /** the station's position and velocity (ECI): a circle in the plane Dragon reached orbit in */
  private issState(t: number): { r: V3; v: V3; ram: V3; up: V3 } {
    const rv = this.rv!;
    const ph = rv.phi0 + rv.n * (t - rv.t0);
    const c = Math.cos(ph), s = Math.sin(ph);
    const up = add(scale(rv.e1, c), scale(rv.e2, s));
    const ram = add(scale(rv.e1, -s), scale(rv.e2, c));
    return { r: scale(up, ISS_R), v: scale(ram, ISS_R * rv.n), ram, up };
  }

  /** a two-body coast (for planning) */
  private coast2(r: V3, v: V3, dt: number): { r: V3; v: V3 } {
    const mu = EARTH.GM;
    const acc = (p: V3): V3 => scale(p, -mu / len(p) ** 3);
    let R = r, U = v;
    const n = Math.max(1, Math.ceil(dt / 5));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const k1v = acc(R), k1r = U;
      const k2v = acc(add(R, scale(k1r, h / 2))), k2r = add(U, scale(k1v, h / 2));
      const k3v = acc(add(R, scale(k2r, h / 2))), k3r = add(U, scale(k2v, h / 2));
      const k4v = acc(add(R, scale(k3r, h))), k4r = add(U, scale(k3v, h));
      R = add(R, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), h / 6));
      U = add(U, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6));
    }
    return { r: R, v: U };
  }

  /**
   * The rendezvous: wait part of an orbit, burn to raise the high point to the
   * station's height, and arrive there 3 km ahead of it. The station is placed
   * on its orbit so the meeting works out (the real launch is timed for it).
   */
  private planRendezvous(f: LaunchFlight): void {
    const mu = EARTH.GM;
    const e1 = norm(f.r);
    const hv = cross(f.r, f.v);
    const e2 = norm(cross(hv, e1));
    const t0 = f.t;
    const wait = 50 * 60;
    const b = this.coast2(f.r, f.v, wait);
    const r1 = len(b.r);
    const speed1 = Math.sqrt(mu * (2 / r1 - 2 / (r1 + ISS_R)));
    let r = b.r, v = scale(norm(b.v), speed1);
    // coast to the high point
    let tt = 0;
    let vr = dot(v, norm(r));
    for (let i = 0; i < 2000; i++) {
      const s = this.coast2(r, v, 10);
      const vr2 = dot(s.v, norm(s.r));
      tt += 10;
      r = s.r;
      v = s.v;
      if (vr > 0 && vr2 <= 0) break;
      vr = vr2;
    }
    const tArrive = t0 + wait + tt;
    const phi2 = Math.atan2(dot(r, e2), dot(r, e1));
    const n = Math.sqrt(mu / ISS_R ** 3);
    // the station 3 km behind where Dragon arrives (its forward port faces Dragon)
    const phi0 = phi2 - 3000 / ISS_R - n * (tArrive - t0);
    this.rv = { phase: 'wait', t0, e1, e2, phi0, n, tBurn1: t0 + wait, tArrive, speed1, tA: 0, off0: [0, 0, 0], seg: 0, segT: 0, told: 0, prevX: 0, said: -1, rate: 0 };
    const d0 = len(sub(this.issState(t0).r, f.r));
    f.say(`Rendezvous plan: the station is ${Math.round(d0 / 1000).toLocaleString('en-US')} km away. Dragon coasts ${Math.round(wait / 60)} minutes, then fires its Dracos to climb to 420 km, arriving ${Math.round(tt / 60)} minutes later just ahead of it.`, 'info');
  }

  /** where Dragon's docking face is, relative to the port, in the station's frame (ahead, up, starboard) */
  private dragonOffset(f: LaunchFlight): V3 {
    const st = this.issState(f.t);
    const side = norm(cross(st.ram, st.up));
    const port = add(st.r, scale(st.ram, this.iss!.port.x));
    const d = sub(f.r, port);
    return [dot(d, st.ram) - this.f9!.dragon.dockAt, dot(d, st.up), dot(d, side)];
  }

  /** little white puffs from the Dracos as Dragon trims its approach */
  private dracoPuffs(dt: number): void {
    const d = this.f9!.dragon;
    if (!this.puffs.length) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(0.4, 'rgba(235,240,255,0.35)');
      gr.addColorStop(1, 'rgba(235,240,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
        sp.visible = false;
        d.group.add(sp);
        this.puffs.push({ sp, t: 1 });
      }
    }
    this.puffT -= dt;
    if (this.puffT <= 0) {
      this.puffT = 0.35 + Math.random() * 1.4;
      const p = this.puffs.find((q) => q.t >= 1);
      if (p) {
        const at = d.dracos[Math.floor(Math.random() * d.dracos.length)];
        p.sp.position.copy(at).add(at.clone().setY(0).normalize().multiplyScalar(0.4));
        p.sp.userData.dir = at.clone().setY(0).normalize();
        p.t = 0;
      }
    }
    for (const p of this.puffs) {
      if (p.t >= 1) {
        p.sp.visible = false;
        continue;
      }
      p.t = Math.min(1, p.t + dt / 0.5);
      p.sp.visible = true;
      p.sp.position.addScaledVector(p.sp.userData.dir as THREE.Vector3, dt * 6);
      p.sp.scale.setScalar(0.4 + p.t * 2.2);
      (p.sp.material as THREE.SpriteMaterial).opacity = (1 - p.t) * 0.85;
    }
  }

  private undock(): void {
    const f = this.flight!;
    const rv = this.rv;
    if (!rv || rv.phase !== 'docked') return;
    rv.phase = 'undock';
    rv.segT = f.t;
    this.elCard.classList.remove('show');
    f.say('Undocking: the hooks open and springs push Dragon off Harmony. The Dracos back it out to 250 m, clear of the station.', 'info');
    this.flash('UNDOCKING');
  }

  /** the deorbit burn: a perigee 25 km up, into the atmosphere off Florida; the trunk is let go */
  private deorbit(f: LaunchFlight): void {
    const rv = this.rv!;
    const st = this.issState(f.t);
    const ra = len(f.r), rp = EARTH.R + 25_000;
    const va = Math.sqrt((EARTH.GM * 2 * rp) / (ra * (ra + rp)));
    f.v = scale(norm(st.v), va);
    f.capsuleMass = 12_500;
    f.phase = 'coast';
    rv.phase = 'home';
    this.f9!.dragon.trunk.visible = false;
    f.say(`Deorbit burn: ${Math.round(len(st.v) - va)} m/s against the direction of flight. The trunk is let go; Dragon falls toward the Atlantic, heat shield first.`, 'good');
    this.flash('DEORBIT BURN');
  }

  private dragonScript(f: LaunchFlight): void {
    // Dragon is let go in orbit, opens its nosecone and works out the rendezvous
    if (f.phase === 'orbit' && !f.payloadOnly) {
      f.separatePayload(12_500);
      this.sepT = this.wallT;
      this.noseT = f.t + 60;
      f.say('Dragon separation! The second stage lets go of Crew Dragon. The crew are in orbit.', 'good');
      this.flash('CREW DRAGON');
      this.planRendezvous(f);
    }
    const rv = this.rv;
    if (!rv) return;
    if (this.noseT > 0 && f.t >= this.noseT) {
      this.noseT = -1;
      f.say('The nosecone swings open over the docking adapter.', 'info');
    }
    if (rv.phase === 'wait' && f.t >= rv.tBurn1) {
      // the orbit-raising burn: the Dracos, along the velocity
      const dv = rv.speed1 - len(f.v);
      f.v = scale(norm(f.v), rv.speed1);
      rv.phase = 'transfer';
      const o = f.orbit();
      f.say(`Orbit-raising burn: the Dracos fire ${Math.round(dv)} m/s along the velocity. New orbit ${Math.round(o.pe / 1000)} × ${Math.round(o.ap / 1000)} km, up to the station.`, 'info');
      this.flash('ORBIT RAISING');
    }
    if (rv.phase === 'transfer' && f.t > rv.tBurn1 + 120 && dot(f.v, norm(f.r)) <= 0) {
      // at the high point: match the station's circle
      const st = this.issState(f.t);
      const up = norm(f.r);
      f.v = scale(norm(sub(f.v, scale(up, dot(f.v, up)))), len(st.v) * Math.sqrt(ISS_R / len(f.r)));
      rv.phase = 'approach';
      rv.tA = f.t;
      rv.off0 = this.dragonOffset(f);
      rv.seg = 0;
      rv.segT = f.t;
      rv.told = f.t;
      rv.prevX = rv.off0[0];
      rv.said = -1;
      f.say(`Circularisation burn at 420 km. The ISS is ${(Math.hypot(...rv.off0) / 1000).toFixed(1)} km behind: Dragon turns its nose to the station and flies the final approach on its own.`, 'good');
      this.flash('THE ISS');
    }
    if (rv.phase === 'undock' && f.t - rv.segT > 100) this.deorbit(f);
    if (rv.phase === 'approach' || rv.phase === 'docked' || rv.phase === 'undock') {
      // fly the approach: from the start offset through the waypoints, holding at each
      const st = this.issState(f.t);
      const side = norm(cross(st.ram, st.up));
      let off: V3 = [0, 0, 0];
      if (rv.phase === 'undock') {
        // the springs push Dragon off, then its Dracos back it out along the docking axis
        const k = Math.min(1, (f.t - rv.segT) / 90);
        off = [250 * k * k * (3 - 2 * k), 0, 0];
      }
      if (rv.phase === 'approach') {
        const [x1, dur, hold] = APPROACH[rv.seg];
        const from: V3 = rv.seg === 0 ? rv.off0 : [APPROACH[rv.seg - 1][0], 0, 0];
        const k = Math.min(1, (f.t - rv.segT) / dur);
        // the last stretch at a steady 10 cm/s; the rest eased in and out
        const e = rv.seg === APPROACH.length - 1 ? k : k * k * (3 - 2 * k);
        off = [from[0] + (x1 - from[0]) * e, from[1] * (1 - e), from[2] * (1 - e)];
        if (k >= 1 && rv.said < rv.seg && rv.seg < APPROACH.length - 1) {
          rv.said = rv.seg;
          f.say(APPROACH[rv.seg][3], 'info');
        }
        if (rv.seg === APPROACH.length - 1 && rv.said < rv.seg) {
          rv.said = rv.seg;
          f.say(APPROACH[rv.seg][3], 'info');
        }
        if (k >= 1 && f.t - rv.segT >= dur + hold) {
          if (rv.seg === APPROACH.length - 1) {
            rv.phase = 'docked';
            updateRecord((r) => {
              r.daysInSpace += f.t / 86400;
              r.missions++;
            });
            f.say('Contact and soft capture at Harmony\'s forward port! The hooks drive closed: hard capture. Dragon is docked to the International Space Station.', 'good');
            this.flash('DOCKED');
            window.setTimeout(() => {
              if (!this.active || this.rv?.phase !== 'docked') return;
              this.card('DOCKED TO THE ISS', 'Crew Dragon is docked to Harmony\'s forward port, 420 km up. Leak checks done, the hatches open, and the crew float through to a welcome aboard the station.', [
                ['LOOK AROUND', () => this.elCard.classList.remove('show')],
                ['UNDOCK AND COME HOME', () => {
                  this.elCard.classList.remove('show');
                  this.undock();
                }],
                ['EXIT TO MENU', () => this.exit()],
              ]);
            }, 4000);
          } else {
            rv.seg++;
            rv.segT = f.t;
          }
        }
      }
      // closing rate, for the HUD
      if (f.t - rv.told > 0.5) {
        rv.rate = (rv.prevX - off[0]) / (f.t - rv.told);
        rv.prevX = off[0];
        rv.told = f.t;
      }
      const port = add(st.r, scale(st.ram, this.iss!.port.x));
      f.r = add(add(add(port, scale(st.ram, off[0] + this.f9!.dragon.dockAt)), scale(st.up, off[1])), scale(side, off[2]));
      f.v = st.v;
      f.axis = scale(st.ram, -1);
    }
  }

  // ------------------------------------------------------------------ Europa Clipper's cruise
  private beginCruise(f: LaunchFlight): void {
    this.cruising = true;
    const p = this.plan!;
    // the trip from here runs on the route's own clock: a day after launch, leaving Earth
    this.jd = Math.max(this.jd, p.launchJd + 1);
    const D = CLIPPER_DATES;
    this.cruiseEvents = [
      { jd: D.mars, flash: 'MARS FLYBY', text: 'Mars gravity assist, 884 km above the surface: Mars bends the path and hands back some of its speed to aim Clipper at Earth.', done: false },
      { jd: D.earth, flash: 'EARTH FLYBY', text: 'Earth gravity assist, 3,200 km over the Pacific: the boost that flings Clipper out to Jupiter.', done: false },
      { jd: D.jupiter - 3, flash: 'JUPITER', text: 'Jupiter fills the view: 140,000 km across, its bands and the Great Red Spot turning every 10 hours.', done: false },
      { jd: D.jupiter, flash: 'JUPITER ORBIT INSERTION', text: 'Jupiter orbit insertion: the main engines burn for over an hour to slow down and be captured. Clipper is in orbit round Jupiter.', done: false },
    ];
    f.say(`Out of Earth\'s sphere of influence. The route: past Mars on ${dateText(D.mars)}, past Earth on ${dateText(D.earth)}, Jupiter on ${dateText(D.jupiter)}.`, 'info');
    this.flash('BOUND FOR JUPITER');
    // draw the route
    const pts: THREE.Vector3[] = [];
    for (let jd = p.launchJd + 1; jd < p.arriveJd; jd += 4) {
      const r = clipperAt(p, jd).r;
      pts.push(new THREE.Vector3(r[0], r[1], r[2]));
    }
    this.pathPts = pts;
    const g = new THREE.BufferGeometry().setFromPoints(pts.map(() => new THREE.Vector3()));
    this.path = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.6, depthWrite: false }));
    this.path.frustumCulled = false;
    this.solar!.scene.add(this.path);
    deployClipper(this.clipper!, 1);
  }
  private pathPts: THREE.Vector3[] = [];

  private stepCruise(dt: number): void {
    if (dt <= 0) return;
    const f = this.flight!;
    this.jd += dt / 86400;
    const p = this.plan!;
    if (this.jd > p.arriveJd) {
      if (!this.arrived) this.arrived = true;
      // in orbit round Jupiter: hold near it on a slow capture orbit
      this.jd = Math.min(this.jd, p.arriveJd + 120);
    }
    for (const ev of this.cruiseEvents) {
      if (!ev.done && this.jd >= ev.jd) {
        ev.done = true;
        this.flash(ev.flash);
        f.say(ev.text, 'good');
        this.ff = false;
        this.warpI = 0;
      }
    }
    if (this.europaT >= 0) {
      this.europaT += dt;
      if (this.europaT > 120 && !f.outcome) f.outcome = { ok: true, title: 'Europa Clipper at Jupiter', text: 'Launched on Falcon Heavy, past Mars and Earth, into orbit round Jupiter, and the first close look at Europa: an ocean world under the ice. The mission flies 49 passes over the next four years.' };
    }
    f.t += dt;
  }

  /** where Clipper is now (heliocentric), passing the flyby planets at the real heights */
  private clipperPos(): Vec {
    const r = this.routePos();
    if (this.europaT >= 0 || !this.plan) return r;
    const D = CLIPPER_DATES;
    for (const [id, jd, alt] of [['mars', D.mars, 884_000], ['earth', D.earth, 3_200_000]] as [BodyId, number, number][]) {
      if (Math.abs(this.jd - jd) > 6) continue;
      // the route's arcs run planet centre to planet centre; push the path out sideways
      // to the flyby distance (a smooth bend that fades with distance)
      const pp = bodyPos(id, this.jd);
      const rel: V3 = [r[0] - pp[0], r[1] - pp[1], r[2] - pp[2]];
      const pv = planetState(id, this.jd).v;
      const cv = clipperAt(this.plan, this.jd).v;
      const u = norm([cv[0] - pv[0], cv[1] - pv[1], cv[2] - pv[2]]);
      const along = dot(rel, u);
      const pl = len(sub(rel, scale(u, along)));
      // pass on the day side: push out toward the Sun (square to the path), by enough
      // that the closest approach is the flyby distance; far off the push fades away
      const toSun = norm(scale(pp as V3, -1));
      const sp = sub(toSun, scale(u, dot(toSun, u)));
      const side = len(sp) > 1e-6 ? norm(sp) : norm(cross(u, [0, 0, 1]));
      const dMin = BODIES[id].R + alt;
      const o = add(rel, scale(side, Math.sqrt(pl * pl + dMin * dMin) - pl));
      return [pp[0] + o[0], pp[1] + o[1], pp[2] + o[2]];
    }
    return r;
  }

  /** a body worth framing behind the craft now, if any */
  private focusBody(): BodyId | null {
    if (this.europaT >= 0) return 'europa';
    const D = CLIPPER_DATES;
    if (this.jd > D.jupiter - 40) return 'jupiter';
    if (Math.abs(this.jd - D.mars) < 3) return 'mars';
    if (Math.abs(this.jd - D.earth) < 3) return 'earth';
    if (this.jd < this.plan!.launchJd + 12) return 'earth';
    return null;
  }

  private routePos(): Vec {
    const p = this.plan!;
    if (this.europaT >= 0) {
      // a pass over Europa: a straight line past it at 4.5 km/s, 25 km above the ice at closest approach
      const e = bodyPos('europa', this.jd);
      const ev = planetState('jupiter', this.jd).v;
      const u = norm(ev as V3);
      // over the sunlit hemisphere: the side toward the Sun, square to the path
      const toSun = norm(scale(e as V3, -1));
      let side = sub(toSun, scale(u as V3, dot(toSun, u as V3)));
      side = len(side) > 1e-6 ? norm(side) : norm(cross(u as V3, [0, 0, 1]));
      const t = this.europaT - 60;
      const R = BODIES.europa.R + 25_000;
      return [e[0] + side[0] * R + u[0] * 4500 * t, e[1] + side[1] * R + u[1] * 4500 * t, e[2] + side[2] * R + u[2] * 4500 * t];
    }
    if (this.jd >= p.arriveJd - 3) {
      // the approach and the capture orbit round Jupiter
      const j = bodyPos('jupiter', this.jd);
      const arr = clipperAt(p, p.arriveJd - 3);
      const jA = bodyPos('jupiter', p.arriveJd - 3);
      const rel0: Vec = [arr.r[0] - jA[0], arr.r[1] - jA[1], arr.r[2] - jA[2]];
      const vJ = planetState('jupiter', p.arriveJd - 3).v;
      const relV: Vec = [arr.v[0] - vJ[0], arr.v[1] - vJ[1], arr.v[2] - vJ[2]];
      // (the route's arc ends at Jupiter's centre: bend the approach out to the
      // closest approach, on the sunlit side, then a wide capture orbit after the burn)
      const u = norm(relV as V3);
      const toSun = norm(scale(j as V3, -1));
      const sp = sub(toSun, scale(u, dot(toSun, u)));
      const side = len(sp) > 1e-6 ? norm(sp) : norm(cross(u, [0, 0, 1]));
      const dMin = BODIES.jupiter.R * 4.5;
      let rel: V3;
      if (this.jd <= p.arriveJd) {
        const tt = (this.jd - (p.arriveJd - 3)) * 86400;
        const lin = add(rel0 as V3, scale(relV as V3, tt));
        const pl = len(sub(lin, scale(u, dot(lin, u))));
        rel = add(lin, scale(side, Math.sqrt(pl * pl + dMin * dMin) - pl));
      } else {
        const ang = (this.jd - p.arriveJd) * 0.18;
        rel = add(scale(side, dMin * Math.cos(ang)), scale(u, dMin * Math.sin(ang)));
      }
      return [j[0] + rel[0], j[1] + rel[1], j[2] + rel[2]];
    }
    return clipperAt(p, this.jd).r;
  }

  // ------------------------------------------------------------------ frames and drawing
  private padOrigin = scale(ecefDir(PAD.lat, PAD.lon), EARTH.R);
  private axes = padScene();
  private localPos(r: V3, t: number): V3 {
    const e = sub(rotY(r, -earthAngle(t)), this.padOrigin);
    return [dot(e, this.axes.x), dot(e, this.axes.y), dot(e, this.axes.z)];
  }
  private localDir(v: V3, t: number): V3 {
    const e = rotY(v, -earthAngle(t));
    return [dot(e, this.axes.x), dot(e, this.axes.y), dot(e, this.axes.z)];
  }
  /** the height the vehicle's base stands at on its pad (site frame) */
  private baseY(): number {
    return this.id === 'clipper' || this.id === 'iss' ? PAD3.table : SLS_Y;
  }

  private pickView(f: LaunchFlight): void {
    let v: View;
    if (this.cruising) v = 'solar';
    else {
      // follow the boosters home in the site view
      const lp = this.localPos(f.r, f.t);
      const near = Math.hypot(lp[0], lp[2]) < 90_000 && f.alt < 25_000;
      const boosting = this.followingBoosters();
      v = near || boosting || this.finalDescent(f) ? 'site' : 'earth';
    }
    if (v !== this.view) {
      this.view = v;
      this.attach();
    }
  }

  /** Orion's last minutes, under its parachutes: drawn over the sea off the Cape */
  private finalDescent(f: LaunchFlight): boolean {
    return (this.id === 'artemis' || (this.id === 'iss' && this.rv?.phase === 'home')) && f.payloadOnly && (f.phase === 'chutes' || f.phase === 'splash' || (f.phase === 'entry' && f.alt < 15_000));
  }

  private followingBoosters(): boolean {
    const f = this.flight!;
    const lands = f.free.filter((s) => s.land);
    if (!lands.length) return false;
    const active = lands.some((s) => s.phase !== 'gone' && (s.phase !== 'landed' || f.t - this.landedAtT < 25));
    if (!active) return false;
    if (this.follow === 'boosters') return true;
    // automatically, from the entry burn to just after touchdown
    if (performance.now() - this.lastDrag < 2000) return false;
    return lands.some((s) => s.phase === 'entry' || s.phase === 'fall' || s.phase === 'landing' || (s.phase === 'landed' && f.t - this.landedAtT < 25));
  }
  private landedAtT = 0;

  /** place the stack, its separated stages and the plumes */
  private place(f: LaunchFlight, dt: number): void {
    const t = f.t;
    const inSite = this.view === 'site';
    const posOf = (r: V3): THREE.Vector3 => {
      if (inSite) {
        const l = this.localPos(r, t);
        // (Pad 3 is down the coast; the flight's frame starts at Pad 1's spot)
        return new THREE.Vector3(l[0], l[1] + this.baseY(), l[2]);
      }
      if (this.view === 'earth') return new THREE.Vector3(r[0] - f.r[0], r[1] - f.r[1], r[2] - f.r[2]);
      return new THREE.Vector3();
    };
    const orient = (axis: V3, roll: V3): THREE.Quaternion => {
      const y = inSite ? new THREE.Vector3(...this.localDir(axis, t)) : new THREE.Vector3(...axis);
      const xr = inSite ? new THREE.Vector3(...this.localDir(roll, t)) : new THREE.Vector3(...roll);
      const x = xr.sub(y.clone().multiplyScalar(xr.dot(y))).normalize();
      const z = new THREE.Vector3().crossVectors(x, y);
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    };
    const north: V3 = [0, 1, 0];
    // the stack
    if (this.view !== 'solar') {
      // the vehicle's flight frame starts at the pad point itself; the site pads are offset
      if (inSite && this.finalDescent(f)) {
        // out over the sea, nine kilometres off the beach; the capsule rocks under its chutes, then on the swell
        const bob = f.phase === 'splash' ? Math.sin(this.wallT * 1.1) * 0.35 : 0;
        this.holder.position.set(0, Math.max(0, f.alt) - 2.5 - (f.phase === 'splash' ? 1.2 : 0) + bob, -9000);
        const sw = f.phase === 'splash' ? 0.06 : 0.04;
        this.holder.quaternion.setFromEuler(new THREE.Euler(Math.sin(this.wallT * 0.8) * sw, this.wallT * 0.03, Math.sin(this.wallT * 0.63 + 1) * sw));
      } else {
        this.holder.position.copy(posOf(f.r));
        this.holder.quaternion.copy(orient(f.axis, norm(cross(f.axis, north))));
      }
    } else {
      this.holder.position.set(0, 0, 0);
      const sunDir = new THREE.Vector3(...(norm(scale(this.clipperPos() as V3, -1)) as V3));
      // the high-gain dish toward Earth (roughly sunward in the inner system); arrays to the Sun
      this.holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir);
    }
    this.holder.visible = !(f.phase === 'lost' && f.alt < 0);
    // what's attached
    if (this.fh) {
      const r = this.fh;
      for (const c of r.sides) if (!f.boosters && c.group.parent === r.group) c.group.removeFromParent();
      if (!f.coreOn && r.centre.group.parent === r.group) {
        // the upper stage carries on alone
        r.upper.removeFromParent();
        r.upper.position.set(0, 0, 0);
        this.holder.add(r.upper);
        r.centre.group.removeFromParent();
      }
      // the fairing halves peel away and tumble off
      if (this.fairT >= 0) {
        const k = Math.min(1, (this.wallT - this.fairT) / 6);
        r.fairing.forEach((fg, i) => {
          const s = i === 0 ? -1 : 1;
          fg.position.set(s * 3 * k * k * 8, 12 + k * 2, 0);
          fg.rotation.z = -s * k * 1.4;
          fg.visible = k < 0.999;
        });
      }
      // only the spacecraft after separation
      if (f.payloadOnly && r.payload.group.parent !== this.holder) {
        r.payload.group.removeFromParent();
        r.payload.group.position.set(0, 0, 0);
        r.payload.group.scale.setScalar(1);
        this.holder.clear();
        this.holder.add(r.payload.group);
      }
      if (f.payloadOnly && this.sepT >= 0) deployClipper(r.payload, Math.min(1, (this.wallT - this.sepT) / 20));
    }
    if (this.f9) {
      const r = this.f9;
      if (!f.coreOn && r.upper.parent === r.core.group) {
        // the second stage carries on alone
        r.upper.removeFromParent();
        r.upper.position.set(0, 0, 0);
        this.holder.clear();
        this.holder.add(r.upper);
      }
      if (f.payloadOnly && r.dragon.group.parent !== this.holder) {
        r.dragon.group.removeFromParent();
        r.dragon.group.position.set(0, 0, 0);
        this.holder.clear();
        this.holder.add(r.dragon.group);
      }
      if (this.rv && this.rv.phase === 'approach' && f.payloadOnly) this.dracoPuffs(dt);
      else for (const p of this.puffs) p.sp.visible = false;
      openNose(r.dragon, f.payloadOnly && this.noseT < 0 ? 1 : f.payloadOnly && this.noseT > 0 ? Math.max(0, 1 - (this.noseT - f.t) / 6) : 0);
      this.driveChutes(f, 4);
      // (the drone ship and its stage are far away by the time Dragon comes home)
      if (this.drone) this.drone.visible = this.rv?.phase !== 'home';
      // the station, in the orbital view
      if (this.iss) {
        const show = this.view === 'earth' && !!this.rv;
        this.iss.group.visible = false;
        if (show) {
          const st = this.issState(t);
          const d = sub(st.r, f.r);
          if (len(d) < 600_000) {
            this.iss.group.visible = true;
            this.iss.group.position.set(d[0], d[1], d[2]);
            const x = new THREE.Vector3(...st.ram), y = new THREE.Vector3(...st.up);
            const z = new THREE.Vector3().crossVectors(x, y);
            this.iss.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
            const sun = new THREE.Vector3(...sunDirection()).applyQuaternion(this.iss.group.quaternion.clone().invert());
            pointArrays(this.iss, sun);
          }
        }
      }
    }
    if (this.sls) {
      const r = this.sls;
      for (const b of r.srbs) if (!f.boosters && b.parent === r.core) b.removeFromParent();
      if (!f.coreOn && r.upper.parent === r.core) {
        r.upper.removeFromParent();
        r.upper.position.set(0, 0, 0);
        this.holder.clear();
        this.holder.add(r.upper);
      }
      if (this.lasT >= 0) {
        const k = Math.min(1, (this.wallT - this.lasT) / 4);
        r.las.position.y = 1.5 + k * k * 80;
        r.las.visible = k < 0.999;
        r.smPanels.forEach((p, i) => {
          const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
          const kk = Math.max(0, Math.min(1, (this.wallT - this.lasT - 3) / 5));
          p.position.set(Math.cos(a) * kk * kk * 30, -kk * 6, Math.sin(a) * kk * kk * 30);
          p.rotation.set(Math.sin(a) * kk * 2, 0, Math.cos(a) * kk * 2);
          p.visible = kk < 0.999;
        });
      }
      if (f.payloadOnly && r.orion.parent !== this.holder) {
        r.orion.removeFromParent();
        r.orion.position.set(0, 0, 0);
        this.holder.clear();
        this.holder.add(r.orion);
      }
      if (this.sepT >= 0) deployOrion(r, Math.min(1, (this.wallT - this.sepT) / 15));
      // under the three 35 m main parachutes
      this.driveChutes(f, 3);
      // on the way home the service module is cast off before entry; only the capsule comes in
      const sm = r.orion.children;
      if ((f.phase === 'entry' || f.phase === 'chutes' || f.phase === 'splash') && sm.length) {
        r.orion.children.forEach((c, i) => {
          // keep the crew module (the last two meshes) and drop the rest
          if (i < r.orion.children.length - 2) c.visible = false;
        });
      }
    }
    // separated stages: boosters flying home, the core and the SRBs falling
    for (const s of f.free) {
      let hl = this.freeHolders.get(s);
      if (!hl) {
        hl = new THREE.Group();
        this.freeHolders.set(s, hl);
        this.sceneOf(this.view).add(hl);
        if (this.fh) {
          const core = s.side === 0 ? this.fh.centre : this.fh.sides[s.side < 0 ? 0 : 1];
          core.group.removeFromParent();
          core.group.position.set(0, 0, 0);
          hl.add(core.group);
          if (s.land) for (const e of core.engines) this.plumes.push({ set: addPlume(core.group, e.clone().setY(-0.95), 0.46, 'kerolox'), which: 'free', free: s });
        } else if (this.f9) {
          const core = this.f9.core;
          core.group.removeFromParent();
          core.group.position.set(0, 0, 0);
          hl.add(core.group);
          for (const e of core.engines) this.plumes.push({ set: addPlume(core.group, e.clone().setY(-0.95), 0.46, 'kerolox'), which: 'free', free: s });
        } else if (this.sls) {
          if (s.side === 0) {
            // the empty core stage
            this.sls.core.removeFromParent();
            hl.add(this.sls.core);
            this.sls.core.position.set(0, 0, 0);
          } else {
            const b = this.sls.srbs[s.side < 0 ? 0 : 1];
            b.removeFromParent();
            b.position.set(0, 0, 0);
            hl.add(b);
          }
        }
      }
      if (s.phase === 'landed' && !this.landedAtT) this.landedAtT = f.t;
      const show = s.phase !== 'gone' && this.view !== 'solar' && (inSite ? s.land || len(s.r) - EARTH.R < 120_000 : len(sub(s.r, f.r)) < 3e5);
      hl.visible = (show || (s.phase === 'landed' && this.view === 'site')) && !(this.f9 && this.rv?.phase === 'home');
      if (hl.visible && this.f9 && inSite && s.lz) {
        // the drone ship's own frame: the stage relative to its landing point, carried to where the ship is drawn
        const lzI = rotY(s.lz, earthAngle(t));
        const upPad = norm(rotY(add(this.padOrigin, [0, 0, 0]), earthAngle(t)));
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...upPad), new THREE.Vector3(...norm(lzI)));
        const ax = (v: V3): THREE.Vector3 => new THREE.Vector3(...rotY(v, earthAngle(t))).applyQuaternion(q);
        const X = ax(this.axes.x), Y = ax(this.axes.y), Z = ax(this.axes.z);
        const rel = new THREE.Vector3(...sub(s.r, lzI));
        hl.position.set(DRONE.x + rel.dot(X), DRONE.y + 2.6 + 1.7 + rel.dot(Y), DRONE.z + rel.dot(Z));
        const a = new THREE.Vector3(...s.axis);
        const yv = new THREE.Vector3(a.dot(X), a.dot(Y), a.dot(Z)).normalize();
        let xr = new THREE.Vector3(1, 0, 0);
        if (Math.abs(yv.x) > 0.9) xr = new THREE.Vector3(0, 0, 1);
        const xv = xr.sub(yv.clone().multiplyScalar(xr.dot(yv))).normalize();
        const zv = new THREE.Vector3().crossVectors(xv, yv);
        hl.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xv, yv, zv));
        poseCore(this.f9.core, s.legs, s.fins);
      } else if (hl.visible) {
        hl.position.copy(posOf(s.r));
        if (inSite && s.phase === 'landed') hl.position.y -= this.baseY() - 0.5 - 1.2;
        hl.quaternion.copy(orient(s.axis, norm(cross(s.axis, north))));
        if (this.fh) {
          const core = s.side === 0 ? this.fh.centre : this.fh.sides[s.side < 0 ? 0 : 1];
          poseCore(core, s.legs, s.fins);
        }
        if (this.f9) poseCore(this.f9.core, s.legs, s.fins);
      }
    }
    // the engines
    const atm = air(Math.max(0, f.alt));
    for (const p of this.plumes) {
      let on = 0;
      if (p.which === 'booster') on = f.phase === 'boost' ? 1 : 0;
      else if (p.which === 'core') on = (f.phase === 'boost' || f.phase === 'core') && f.coreOn ? (this.vehicle.id !== 'sls' ? Math.max(0.5, f.throttle) : f.throttle) : 0;
      else if (p.which === 'upper') on = (f.phase === 'upper' || f.phase === 'burn') && !f.payloadOnly ? 1 : 0;
      else if (p.free) {
        const s = p.free;
        const coreRig = this.fh ? (s.side === 0 ? this.fh.centre : this.fh.sides[s.side < 0 ? 0 : 1]) : this.f9 ? this.f9.core : null;
        const engIdx = coreRig ? coreRig.engines.findIndex((e) => p.set.meshes[0].mesh.position.x === e.x && p.set.meshes[0].mesh.position.z === e.z) : 0;
        // boostback and entry: the centre and two outer engines; landing: the centre one
        const lit = s.engines >= 3 ? engIdx === 0 || engIdx === 1 || engIdx === 5 : s.engines >= 1 ? engIdx === 0 : false;
        on = lit ? (s.phase === 'landing' ? s.throttle : 1) : 0;
        const sp = air(Math.max(0, len(s.r) - EARTH.R)).p;
        drivePlume(p.set, on, sp, this.wallT);
        continue;
      }
      drivePlume(p.set, on, atm.p, this.wallT);
    }
    // the pad's fire light and the strongback
    if (inSite) {
      const base = this.holder.position;
      this.padLight.position.set(base.x, Math.max(4, base.y - 6), base.z);
      const fire = f.phase === 'boost' && f.alt < 1500 ? 1 : 0;
      this.padLight.intensity = fire * 14000 * (0.9 + 0.1 * Math.random());
      if (this.id === 'clipper' || this.id === 'iss') this.site!.setTe(f.phase === 'pad' ? 0 : Math.min(1, f.t / 2));
    }
    void dt;
  }

  /** the main parachutes over the capsule, from opening to splashdown */
  private driveChutes(f: LaunchFlight, n: number): void {
    const chutesOut = f.phase === 'chutes' || f.phase === 'splash';
    if (chutesOut && !this.chutes) {
      this.chutes = buildMains(n);
      this.holder.add(this.chutes);
    }
    if (!this.chutes) return;
    this.chutes.visible = chutesOut;
    const k = f.phase === 'splash' ? Math.max(0, 1 - (this.wallT - this.splashT) / 6) : Math.min(1, f.chuteK * 1.3);
    if (f.phase === 'splash' && this.splashT < 0) this.splashT = this.wallT;
    const m = this.chutes.children.length;
    this.chutes.children.forEach((c, i) => {
      const a = (i / m) * Math.PI * 2 + 0.4;
      const sway = Math.sin(this.wallT * 0.7 + i * 2.1) * 0.05;
      const spread = m > 3 ? 21 : 14;
      c.position.set(Math.cos(a) * spread * k, 7.4 + 8 + 48 * k, Math.sin(a) * spread * k);
      c.rotation.set(Math.sin(a) * 0.28 * k + sway, 0, -Math.cos(a) * 0.28 * k + sway);
      c.scale.set(0.15 + 0.85 * k, 0.3 + 0.7 * k, 0.15 + 0.85 * k);
    });
  }

  /** the camera's offset round its target (in the frame the target is drawn in) */
  private chase(up: V3): { off: V3; up: V3 } {
    let north: V3 = sub([0, 1, 0], scale(up, dot([0, 1, 0], up)));
    if (len(north) < 1e-6) north = [1, 0, 0];
    north = norm(north);
    const east = norm(cross(north, up));
    const cp = Math.cos(this.camPitch);
    const dir = add(add(scale(north, cp * Math.cos(this.camYaw)), scale(east, cp * Math.sin(this.camYaw))), scale(up, Math.sin(this.camPitch)));
    return { off: scale(dir, this.camDist), up };
  }

  private render(f: LaunchFlight, dt: number, w: number, h: number): void {
    const height = this.vehicle.height;
    if (this.view === 'site') {
      const cam = this.siteCam;
      cam.aspect = w / Math.max(1, h);
      // the target: the stack, or the boosters coming home
      let target = this.holder.position.clone().add(new THREE.Vector3(...this.localDir(f.axis, f.t)).multiplyScalar(height * 0.45));
      let dist = this.camDist;
      if (this.finalDescent(f)) {
        target = this.holder.position.clone().add(new THREE.Vector3(0, this.chutes?.visible ? 30 : 3, 0));
        dist = this.chutes?.visible ? Math.max(110, this.camDist * 0.7) : Math.max(25, this.camDist * 0.25);
      }
      if (this.followingBoosters()) {
        const lands = f.free.filter((s) => s.land && s.phase !== 'gone');
        if (lands.length) {
          const c = new THREE.Vector3();
          for (const s of lands) c.add(this.freeHolders.get(s)!.position);
          c.multiplyScalar(1 / lands.length);
          target = c.add(new THREE.Vector3(0, 22, 0));
          const spread = lands.length > 1 ? this.freeHolders.get(lands[0])!.position.distanceTo(this.freeHolders.get(lands[1])!.position) : 0;
          dist = Math.max(160, spread * 1.3 + 120);
        }
      }
      const { off, up } = this.chase([0, 1, 0]);
      const o = new THREE.Vector3(...off).normalize().multiplyScalar(dist);
      cam.position.copy(target).add(o);
      const gy = Math.max(1, this.site!.groundAt(cam.position.x, cam.position.z)) + 3;
      if (cam.position.y < gy) cam.position.y = gy;
      cam.up.set(up[0], up[1], up[2]);
      cam.lookAt(target);
      cam.near = 0.5;
      cam.far = 400_000;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      const fire = f.phase === 'boost' && f.alt < 1500 ? 1 : 0;
      this.site!.renderFlight(dt, cam, fire, this.holder.position.y, f.alt);
      return;
    }
    if (this.view === 'earth') {
      const sp = this.space!;
      const up = norm(f.r);
      const { off } = this.chase(up);
      const scaleD = f.payloadOnly ? 0.35 : 1;
      const lk = scale(f.axis, height * (f.payloadOnly ? 0.05 : 0.3));
      let cam = add(lk, scale(off, scaleD));
      let look = lk;
      // near the Moon (and until the player looks round): the Moon behind Orion
      const mRel = sub(moonState(f.t).r, f.r);
      if (this.id === 'artemis' && f.payloadOnly && len(mRel) < 90_000_000 && performance.now() - this.lastDrag > 8000) {
        const toM = norm(mRel);
        let sd = cross(toM, up);
        if (len(sd) < 1e-6) sd = [1, 0, 0];
        sd = norm(sd);
        const d = len(off) * scaleD;
        cam = add(add(scale(toM, -d), scale(sd, d * 0.45)), scale(up, d * 0.2));
        look = scale(toM, d * 0.6);
      }
      // Crew Dragon near the station (until the player looks round): the station ahead of Dragon
      if (this.id === 'iss' && this.rv && this.iss && this.rv.phase !== 'home' && performance.now() - this.lastDrag > 8000) {
        const st = this.issState(f.t);
        const port = add(sub(st.r, f.r), scale(st.ram, this.iss.port.x));
        const dist = len(port);
        if (dist < 40_000) {
          const toI = norm(port);
          const side = norm(cross(st.ram, st.up));
          // over Dragon's shoulder: the station ahead, the Earth below
          const near = Math.min(1, dist / 400);
          cam = add(add(scale(toI, -(16 + 10 * near)), scale(side, 7 + 6 * near)), scale(st.up, 4 + 3 * near));
          look = add(scale(toI, Math.min(dist * 0.6, 70)), scale(st.up, -Math.min(dist * 0.08, 10)));
        }
      }
      const ra = len(add(f.r, cam)) - EARTH.R;
      if (ra < 5) cam = add(cam, scale(up, 5 - ra));
      sp.update({ origin: f.r, cam, camUp: up, look, earthAngle: earthAngle(f.t), time: f.t }, w, h, false);
      this.drawWith?.(sp.scene, sp.camera);
      return;
    }
    // the solar system (Europa Clipper's cruise)
    const sv = this.solar!;
    const r = this.clipperPos();
    sv.origin = r;
    const up: V3 = [0, 0, 1];
    const { off } = this.chase(up);
    const camD = Math.min(this.camDist, 300) / 160;
    let cam: Vec = [r[0] + off[0] * camD * 0.4, r[1] + off[1] * camD * 0.4, r[2] + off[2] * camD * 0.4];
    let look: Vec = r;
    // near a planet (and until the player looks round): the planet behind the craft
    const fb = this.focusBody();
    if (fb && performance.now() - this.lastDrag > 8000) {
      const bp = bodyPos(fb, this.jd);
      const toB = norm([bp[0] - r[0], bp[1] - r[1], bp[2] - r[2]]);
      let sideV = cross(toB, [0, 0, 1]);
      if (len(sideV) < 1e-6) sideV = [1, 0, 0];
      sideV = norm(sideV);
      const d = 70 * camD;
      const c = add(add(scale(toB, -d), scale(sideV, -d * 0.45)), [0, 0, d * 0.22]);
      cam = [r[0] + c[0], r[1] + c[1], r[2] + c[2]];
      // aim between the craft and the planet, so both are in the picture
      look = [r[0] + toB[0] * d * 0.6, r[1] + toB[1] * d * 0.6, r[2] + toB[2] * d * 0.6];
    }
    sv.update({ jd: this.jd, cam, look, up: [0, 0, 1], fov: 50 }, w, h);
    // the route, relative to the craft
    if (this.path) {
      const pa = this.path.geometry.attributes.position as THREE.BufferAttribute;
      this.pathPts.forEach((p, i) => pa.setXYZ(i, p.x - r[0], p.y - r[1], p.z - r[2]));
      pa.needsUpdate = true;
    }
    this.drawWith?.(sv.scene, sv.camera);
  }

  // ------------------------------------------------------------------ the HUD
  private phaseName(f: LaunchFlight): string {
    if (this.cruising) {
      if (this.europaT >= 0) return 'EUROPA FLYBY';
      if (this.arrived) return 'IN ORBIT ROUND JUPITER';
      const ev = this.cruiseEvents.find((e) => !e.done);
      return ev ? `CRUISE · NEXT: ${ev.flash}` : 'CRUISE';
    }
    const V = this.vehicle;
    if (this.id === 'iss' && this.rv) {
      const p = this.rv.phase;
      if (p === 'home') return f.phase === 'coast' ? 'DEORBIT · FALLING HOME' : f.phase === 'entry' ? 'ENTRY' : f.phase === 'chutes' ? 'UNDER PARACHUTES' : f.phase === 'splash' ? 'SPLASHDOWN' : 'COMING HOME';
      return p === 'wait' ? 'IN ORBIT · CHASING THE ISS' : p === 'transfer' ? 'CLIMBING TO THE ISS' : p === 'approach' ? `FINAL APPROACH${this.rv.seg > 0 ? ' · WAYPOINT ' + (this.rv.seg - 1) : ''}` : p === 'undock' ? 'UNDOCKING' : 'DOCKED TO THE ISS';
    }
    switch (f.phase) {
      case 'pad':
        return 'ON THE PAD';
      case 'boost':
        return V.id === 'sls' ? 'ASCENT · SOLIDS AND CORE' : 'ASCENT · 27 ENGINES';
      case 'core':
        return V.id === 'sls' ? 'ASCENT · CORE STAGE' : V.id === 'falcon-9' ? 'ASCENT · FIRST STAGE' : 'ASCENT · CENTRE CORE';
      case 'upper':
        return V.id === 'sls' ? 'ASCENT · ICPS' : 'ASCENT · SECOND STAGE';
      case 'orbit':
        return 'PARKING ORBIT';
      case 'burn':
        return V.id === 'sls' ? 'TRANSLUNAR INJECTION' : 'ESCAPE BURN';
      case 'coast':
        return this.periluneSeen ? 'RETURN TO EARTH' : 'OUTBOUND TO THE MOON';
      case 'escaped':
        return 'LEAVING EARTH';
      case 'entry':
        return 'ENTRY';
      case 'chutes':
        return 'PARACHUTES';
      case 'splash':
        return 'SPLASHDOWN';
      default:
        return 'LOST';
    }
  }

  private hud(f: LaunchFlight, warp: number, dt: number, w: number, h: number): void {
    this.elPhase.textContent = this.phaseName(f);
    this.elDate.textContent = dateText(this.cruising ? this.jd : this.jd, true);
    if (this.liftT < 0) this.elMet.textContent = 'HOLDING ON THE PAD';
    else {
      const s = this.cruising ? (this.jd - CLIPPER_DATES.launch) * 86400 : f.t;
      const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
      this.elMet.textContent = `T+ ${d ? d + 'd ' : ''}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }
    const rows: [string, string][] = [];
    const km = (m: number) => (Math.abs(m) >= 1e9 ? `${(m / 1e9).toFixed(2)} million km` : Math.abs(m) >= 1e6 ? `${Math.round(m / 1000).toLocaleString('en-US')} km` : Math.abs(m) >= 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
    if (this.cruising) {
      const r = this.clipperPos();
      rows.push(['FROM THE SUN', `${(Math.hypot(...r) / AU).toFixed(3)} AU`]);
      for (const id of ['earth', 'mars', 'jupiter'] as BodyId[]) {
        const b = bodyPos(id, this.jd);
        rows.push([`TO ${BODIES[id].name.toUpperCase()}`, km(Math.hypot(b[0] - r[0], b[1] - r[1], b[2] - r[2]) - BODIES[id].R)]);
      }
      if (this.europaT >= 0) {
        const e = bodyPos('europa', this.jd);
        rows.push(['ABOVE EUROPA', km(Math.hypot(e[0] - r[0], e[1] - r[1], e[2] - r[2]) - BODIES.europa.R)]);
      }
      rows.push(['ARRIVAL', dateText(CLIPPER_DATES.jupiter)]);
    } else {
      rows.push(['ALTITUDE', km(f.alt)]);
      const va = len(f.airVel());
      rows.push([f.alt < 100_000 ? 'AIRSPEED' : 'SPEED', f.alt < 100_000 ? `${Math.round(va)} m/s` : `${(len(f.v) / 1000).toFixed(2)} km/s`]);
      rows.push(['VERTICAL', `${dot(f.v, norm(f.r)) >= 0 ? '+' : ''}${dot(f.v, norm(f.r)).toFixed(0)} m/s`]);
      if (f.alt > 70_000 && f.phase !== 'pad') {
        const o = f.orbit();
        if (o.ap !== Infinity && o.ap < 4e8) rows.push(['ORBIT', `${Math.round(o.pe / 1000)} × ${Math.round(o.ap / 1000).toLocaleString('en-US')} km`]);
      }
      if (this.id === 'artemis' && (f.phase === 'coast' || f.phase === 'escaped')) {
        rows.push(['TO THE MOON', km(f.moon().d)]);
        rows.push(['FROM EARTH', km(f.alt)]);
      }
      if (f.phase === 'boost' || f.phase === 'core') {
        rows.push(['DYNAMIC PRESSURE', `${(f.q / 1000).toFixed(1)} kPa`]);
        rows.push(['G', `${f.gLoad.toFixed(2)} g`]);
      }
      if (this.id === 'artemis' && this.tliAt > 0 && f.phase === 'orbit') {
        const tw = this.tliAt - f.t;
        rows.push(['TLI IN', `${Math.max(0, Math.floor(tw / 60))} min ${Math.max(0, Math.floor(tw % 60))} s`]);
      }
      const V = this.vehicle;
      const pct = (a: number, b: number) => `${Math.max(0, Math.round((a / b) * 100))}%`;
      if (f.boosters) rows.push([V.id === 'sls' ? 'SOLID BOOSTERS' : 'SIDE BOOSTERS', pct(f.boosterProp, V.boosters.stage.prop * V.boosters.count)]);
      if (f.coreOn) rows.push([V.id === 'sls' ? 'CORE STAGE' : V.id === 'falcon-9' ? 'FIRST STAGE' : 'CENTRE CORE', pct(f.coreProp, V.core.prop)]);
      if (this.id === 'iss' && this.rv && this.iss && this.rv.phase !== 'home') {
        const st = this.issState(f.t);
        const port = add(st.r, scale(st.ram, this.iss.port.x));
        const d = Math.max(0, len(sub(f.r, port)) - this.f9!.dragon.dockAt);
        rows.push(['TO THE ISS', this.rv.phase === 'docked' ? 'DOCKED' : km(d)]);
        if (this.rv.phase === 'approach') rows.push(['CLOSING RATE', `${this.rv.rate.toFixed(2)} m/s`]);
        if (this.rv.phase === 'wait') {
          const tw = this.rv.tBurn1 - f.t;
          rows.push(['BURN IN', `${Math.max(0, Math.floor(tw / 60))} min ${Math.max(0, Math.floor(tw % 60))} s`]);
        }
      }
      if (!f.payloadOnly) rows.push([V.id === 'sls' ? 'ICPS' : 'SECOND STAGE', pct(f.upperProp, V.upper.prop)]);
      const lands = f.free.filter((s) => s.land && !(this.f9 && this.rv?.phase === 'home'));
      for (const s of lands) {
        const lz = s.lz ? rotY(s.lz, earthAngle(f.t)) : null;
        rows.push([this.f9 ? 'FIRST STAGE → DRONE SHIP' : s.side < 0 ? 'BOOSTER → LZ-1' : 'BOOSTER → LZ-2', s.phase === 'landed' ? 'LANDED' : s.phase === 'gone' ? 'LOST' : `${s.phase.toUpperCase()} · ${lz ? km(len(sub(lz, s.r))) : ''}`]);
      }
    }
    const key = rows.map((r) => r.join(':')).join('|');
    if (key !== this.telKey) {
      this.telKey = key;
      this.elTel.innerHTML = rows.map(([a, b]) => `<div class="mm-row"><span>${a}</span><span>${b}</span></div>`).join('');
    }
    const a = this.job ? null : this.nextAction();
    this.elAct.classList.toggle('off', !a && !this.job);
    if (this.job) this.elAct.textContent = 'WORKING OUT THE TRAJECTORY…';
    else if (a) this.elAct.textContent = a.label;
    this.elFF.classList.toggle('on', this.ff);
    this.elWarp.forEach((b, i) => b.classList.toggle('on', !this.ff && i === this.warpI));
    this.elFF.textContent = this.ff ? `⏩ ${warp >= 1e6 ? '1M' : warp >= 1000 ? Math.round(warp / 1000) + 'k' : Math.round(warp)}×` : '⏩ NEXT EVENT';
    this.elFollow.textContent = this.follow === 'boosters' ? 'CAM: BOOSTERS' : 'CAM: ROCKET';
    this.elFollow.style.display = (this.id === 'clipper' || this.id === 'iss') && !this.cruising ? '' : 'none';
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.elFlash.classList.remove('show');
    }
    // the log sits above the button bar, however many rows it wraps to
    const lb = `${this.elBot.offsetHeight + 28}px`;
    if (this.elLog.style.bottom !== lb) this.elLog.style.bottom = lb;
    // planet labels on the cruise
    let html = '';
    if (this.view === 'solar') {
      // the body in focus first, then the rest; a label that would overlap one already placed is left out
      const fb = this.focusBody();
      const ids = [...PLANETS, 'europa', 'io', 'ganymede', 'callisto'] as BodyId[];
      if (fb) ids.sort((a, b) => (b === fb ? 1 : 0) - (a === fb ? 1 : 0));
      const placed: [number, number, number][] = [];
      for (const id of ids) {
        const p = this.solar!.project(id, w, h);
        if (!p || p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40 || p.r > h * 0.35) continue;
        const name = BODIES[id].name.toUpperCase();
        const y = p.y - Math.max(8, p.r) - 6;
        const hw = name.length * 4.6 + 6;
        if (placed.some(([x0, y0, w0]) => Math.abs(x0 - p.x) < hw + w0 && Math.abs(y0 - y) < 15)) continue;
        placed.push([p.x, y, hw]);
        html += `<div style="position:absolute;left:${p.x.toFixed(0)}px;top:${y.toFixed(0)}px;transform:translate(-50%,-100%);font:600 11px Rajdhani,system-ui;letter-spacing:.14em;color:#cfe3ff;text-shadow:0 1px 3px #000">${name}</div>`;
      }
    }
    if (html !== this.elLabels.innerHTML) this.elLabels.innerHTML = html;
    void MOON;
    void moonState;
  }
}

/** Orion's three main parachutes: orange and white gores, with their risers down to the capsule */
function buildMains(n = 3): THREE.Group {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? '#f4f1ea' : '#e2581f';
    g.fillRect(i * 16, 0, 16, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const canopyMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide });
  const lineMat = new THREE.LineBasicMaterial({ color: 0xd8d4c8, transparent: true, opacity: 0.6 });
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const one = new THREE.Group();
    // a 35 m canopy: a shallow dome with a vent at the top
    const dome = new THREE.Mesh(new THREE.SphereGeometry(17.5, 48, 12, 0, Math.PI * 2, 0.08, 1.15), canopyMat);
    dome.position.y = -8;
    one.add(dome);
    // the risers, from the skirt down to the capsule's top (at this group's origin, 56 m below once open)
    const pts: THREE.Vector3[] = [];
    const skirtY = -8 + 17.5 * Math.cos(1.23);
    const skirtR = 17.5 * Math.sin(1.23);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * skirtR, skirtY, Math.sin(a) * skirtR), new THREE.Vector3(0, -56, 0));
    }
    one.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    grp.add(one);
  }
  return grp;
}

export { buildClipper };
