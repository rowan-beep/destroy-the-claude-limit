// Rover missions on Mars: drive Perseverance or Curiosity across the real
// terrain of their landing sites to the science targets, and do the science:
// core a rock with the drill, zap one with the laser, put Ingenuity down and
// fly it. Drawn by the same Mars view as the Starship landing (the ground, the
// boulders, the dust in the wind, the sky), with the rover's own wheel tracks
// left in the sand behind it.
//
// Time runs at the real pace of Mars (a sol is 24 h 40 min) and the rover at
// its real top speed of 4.2 cm/s; the warp is how a morning's drive fits into
// a few minutes.

import * as THREE from 'three';
import { MarsView } from '../mars/marsView';
import { marsHeight, regionName } from '../mars/marsGlobe';
import { MARS, Vec, marsState, vnorm, vscale, dateText } from '../mars/marsPhysics';
import { boulderGeometry, rockMaterial } from '../mars/marsSurface';
import { menuMusic } from '../../audio/menuMusic';
import { audio } from '../../audio/audio';
import { updateRecord } from '../record';
import { RoverDrive } from './roverDrive';
import { RoverRig, HeliRig, buildRover, buildIngenuity, deployArm, stowArm, aimMast, ROVER } from './roverModel';
import { EdlSequence } from './edl';

const D2R = Math.PI / 180;
export const ROVER_WARPS = [1, 5, 10, 30, 100, 300];

export type TargetKind = 'drill' | 'zap' | 'heli' | 'reach';

export interface RoverTarget {
  name: string;
  e: number;
  n: number;
  kind: TargetKind;
  /** what the scientists want there */
  text: string;
}

export interface RoverMissionDef {
  id: string;
  title: string;
  rover: 'perseverance' | 'curiosity';
  site: { lat: number; lon: number; name: string };
  /** local mean solar time at the start, hours */
  hour: number;
  heading: number;
  intro: string[];
  targets: RoverTarget[];
  /** start with the entry, descent and landing */
  edl?: boolean;
  outro: string;
}

export const ROVER_MISSIONS: RoverMissionDef[] = [
  {
    id: 'm2020-edl',
    title: 'MARS 2020 · SEVEN MINUTES OF TERROR',
    rover: 'perseverance',
    site: { lat: 18.4447, lon: 77.4508, name: 'Octavia E. Butler Landing, Jezero Crater' },
    hour: 15.6,
    heading: 0.3,
    edl: true,
    intro: [
      'Mars 2020 hits the top of the atmosphere at 5.4 km/s. Seven minutes later Perseverance must be standing on its wheels in Jezero Crater.',
      'Everything is automatic: the light-time to Earth is over eleven minutes. Watch it happen; after touchdown, drive.',
    ],
    targets: [
      { name: 'FIRST DRIVE', e: 6, n: 30, kind: 'reach', text: 'Drive 30 m: the first test drive of the mobility system.' },
      { name: 'ROCHETTE', e: -40, n: 85, kind: 'drill', text: 'A volcanic rock cut by water: take the first core sample.' },
    ],
    outro: 'Perseverance is down, driving and sampling. The first core of Mars rock is sealed in its tube for the trip to Earth.',
  },
  {
    id: 'm2020-jezero',
    title: 'PERSEVERANCE · JEZERO SAMPLE HUNT',
    rover: 'perseverance',
    site: { lat: 18.4447, lon: 77.4508, name: 'Octavia E. Butler Landing, Jezero Crater' },
    hour: 9.5,
    heading: 0.6,
    intro: [
      'Jezero was a lake 3.5 billion years ago, fed by a river whose delta still stands on the crater floor. If life ever got started on Mars, its traces could be here.',
      'Drive to the targets, core the rocks, put Ingenuity down at its airfield and fly it. W/S drive, A/D steer (A/D alone turns on the spot), SPACE for the job at a target.',
    ],
    targets: [
      { name: 'ROCHETTE', e: 34, n: 70, kind: 'drill', text: 'A volcanic rock altered by water: core sample #1.' },
      { name: 'VAN ZYL OVERLOOK', e: -45, n: 120, kind: 'heli', text: 'Ingenuity\'s airfield: drop the helicopter and fly it.' },
      { name: 'BRAC', e: 60, n: 170, kind: 'zap', text: 'Séítah\'s layered rock: zap it with SuperCam\'s laser to read what it\'s made of.' },
      { name: 'WILDCAT RIDGE', e: 10, n: 230, kind: 'drill', text: 'Fine mudstone at the delta front, where organics would keep best: core sample #2.' },
    ],
    outro: 'Two cores sealed, Ingenuity flown, the delta reached. These are the samples a future mission is meant to bring back to Earth.',
  },
  {
    id: 'msl-gale',
    title: 'CURIOSITY · GALE CRATER',
    rover: 'curiosity',
    site: { lat: -4.5895, lon: 137.4417, name: 'Bradbury Landing, Gale Crater' },
    hour: 10.2,
    heading: 3.4,
    intro: [
      'Curiosity landed in 2012 and is still driving. Ahead is Mount Sharp, 5 km of layered rock: a history of Mars\'s climate, written in stone.',
      'Drill the mudstone at Yellowknife Bay, zap the conglomerate, then climb toward the mountain.',
    ],
    targets: [
      { name: 'YELLOWKNIFE BAY', e: -30, n: -60, kind: 'drill', text: 'John Klein: the first rock ever drilled on Mars, a lake-bed mudstone.' },
      { name: 'HOTTAH', e: 40, n: -110, kind: 'zap', text: 'Rounded pebbles cemented together: an old streambed. Zap it with ChemCam.' },
      { name: 'PAHRUMP HILLS', e: 0, n: -190, kind: 'reach', text: 'The first layers of Mount Sharp: reach the base of the mountain.' },
    ],
    outro: 'Lake-bed mud, an ancient streambed and the foot of Mount Sharp: Gale Crater held water for millions of years.',
  },
];

const CSS = `
.rv-ui{position:fixed;inset:0;pointer-events:none;z-index:30;font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;color:#eef2f6;letter-spacing:.04em}
.rv-ui.hidden{display:none}
.rv-ui button{pointer-events:auto;font:inherit;cursor:pointer}
.rv-tl{position:absolute;left:18px;top:14px;text-shadow:0 1px 3px #000a;max-width:min(560px,60vw)}
.rv-k{font-size:11px;letter-spacing:.22em;color:#d9b493}
.rv-t{font-size:22px;font-weight:700;letter-spacing:.1em;margin-top:2px}
.rv-obj{font-size:14px;margin-top:6px;color:#f5e6d8;line-height:1.35}
.rv-tr{position:absolute;right:16px;top:14px;width:240px;background:#1a110cb8;border:1px solid #ffffff1c;border-radius:10px;padding:10px 12px;backdrop-filter:blur(6px)}
.rv-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:2px 0;font-variant-numeric:tabular-nums}
.rv-row span:first-child{color:#c9a98c;font-size:11px;letter-spacing:.16em;padding-top:2px}
.rv-log{position:absolute;left:18px;bottom:100px;width:min(440px,60vw);font-size:13px;line-height:1.35}
.rv-log div{background:#1a110ca8;border-left:2px solid #e8a36a;padding:4px 8px;margin-top:4px;border-radius:0 6px 6px 0;text-shadow:0 1px 2px #000}
.rv-log div.good{border-color:#6fe0a0}.rv-log div.bad{border-color:#ff6b5b}
.rv-bot{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px)}
.rv-btn{background:#20150fd8;border:1px solid #ffffff2a;color:#eef2f6;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;letter-spacing:.1em}
.rv-btn.on{background:#8a4b26;border-color:#e8a36a}
.rv-act{background:linear-gradient(180deg,#fff3e6,#e8c4a4);color:#20150f;border:0;padding:10px 20px;font-size:15px;font-weight:800}
.rv-act.off{display:none}
.rv-warp{display:flex;gap:2px;background:#20150fd8;border:1px solid #ffffff2a;border-radius:8px;padding:3px}
.rv-warp button{background:none;border:0;color:#c9a98c;font-size:12px;padding:5px 7px;border-radius:5px;font-weight:600}
.rv-warp button.on{background:#eef2f6;color:#20150f}
.rv-map{position:absolute;right:16px;bottom:70px;width:200px;height:200px;border-radius:10px;background:#1a110cc0;border:1px solid #ffffff1c}
.rv-lab{position:absolute;transform:translate(-50%,-100%);font-size:12px;font-weight:700;letter-spacing:.12em;text-shadow:0 1px 3px #000;white-space:nowrap;text-align:center}
.rv-lab i{display:block;font-style:normal;font-weight:500;font-size:11px;color:#f2d7bf}
.rv-flash{position:absolute;left:50%;top:22%;transform:translateX(-50%);font-size:30px;font-weight:800;letter-spacing:.2em;text-align:center;text-shadow:0 2px 12px #000;opacity:0;transition:opacity .6s}
.rv-flash.show{opacity:1}
.rv-card{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#0008;pointer-events:auto}
.rv-card.show{display:flex}
.rv-card-b{background:#1a110cf2;border:1px solid #ffffff2a;border-radius:14px;padding:22px 26px;max-width:min(540px,calc(100vw - 32px));text-align:center}
.rv-card-t{font-size:24px;font-weight:800;letter-spacing:.12em}
.rv-card-s{font-size:14px;color:#f2e2d4;margin:10px 0 16px;line-height:1.5}
.rv-card-r{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.rv-help{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#1a110cee;border:1px solid #ffffff2a;border-radius:12px;padding:18px 22px;font-size:14px;line-height:1.7;pointer-events:auto;display:none}
.rv-help.show{display:block}
.rv-help b{display:inline-block;min-width:120px;color:#fff}
@media (max-width:700px){.rv-tr{width:180px}.rv-map{width:140px;height:140px;bottom:120px}.rv-t{font-size:17px}.rv-log{bottom:140px}}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

type CamMode = 'chase' | 'orbit' | 'mast';

interface Activity {
  kind: TargetKind | 'heliFly';
  t: number;
  target: RoverTarget;
}

/** wheel tracks: a ribbon in the dust behind each side's wheels */
class Tracks {
  readonly mesh: THREE.Mesh;
  private pts: { x: number; y: number; z: number; rx: number; rz: number }[] = [];
  private geo = new THREE.BufferGeometry();
  private dirty = false;
  constructor(mat: THREE.Material) {
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }
  add(x: number, y: number, z: number, rx: number, rz: number): void {
    const l = this.pts[this.pts.length - 1];
    if (l && Math.hypot(l.x - x, l.z - z) < 0.2) return;
    this.pts.push({ x, y, z, rx, rz });
    if (this.pts.length > 6000) this.pts.splice(0, 1000);
    this.dirty = true;
  }
  update(): void {
    if (!this.dirty || this.pts.length < 2) return;
    this.dirty = false;
    const n = this.pts.length;
    const pos = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
    const idx: number[] = [];
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      if (i > 0) dist += Math.hypot(p.x - this.pts[i - 1].x, p.z - this.pts[i - 1].z);
      const w = 0.2;
      pos.set([p.x - p.rx * w, p.y + 0.015, p.z - p.rz * w, p.x + p.rx * w, p.y + 0.015, p.z + p.rz * w], i * 6);
      uv.set([0, dist / 0.4, 1, dist / 0.4], i * 4);
      if (i > 0) {
        const a = (i - 1) * 2;
        // break the ribbon where it jumps (the rover was moved)
        if (Math.hypot(p.x - this.pts[i - 1].x, p.z - this.pts[i - 1].z) < 1.5) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geo.dispose();
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.geo.computeVertexNormals();
    this.mesh.geometry = this.geo;
  }
  clear(): void {
    this.pts = [];
    this.dirty = true;
    this.geo.dispose();
    this.geo = new THREE.BufferGeometry();
    this.mesh.geometry = this.geo;
  }
}

function trackMaterial(): THREE.Material {
  // the grouser pattern pressed into the sand: darker, shadowed bands
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 128);
  for (let i = 0; i < 8; i++) {
    const y = i * 16;
    g.fillStyle = 'rgba(60,32,18,0.55)';
    g.beginPath();
    g.moveTo(0, y + 4);
    g.quadraticCurveTo(32, y - 2, 64, y + 4);
    g.lineTo(64, y + 10);
    g.quadraticCurveTo(32, y + 4, 0, y + 10);
    g.fill();
  }
  g.fillStyle = 'rgba(80,45,25,0.22)';
  g.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
}

export class RoverMission {
  active = false;
  drawWith: ((scene: THREE.Scene, camera: THREE.Camera) => void) | null = null;
  onExit: (() => void) | null = null;
  def: RoverMissionDef | null = null;
  drive: RoverDrive | null = null;
  mars: MarsView | null = null;
  private rig: RoverRig | null = null;
  private rigCur: RoverRig | null = null;
  private heli: HeliRig | null = null;
  /** everything at the site, in its local tangent frame (x east, y up, z south) */
  private site = new THREE.Group();
  private tracksL: Tracks;
  private tracksR: Tracks;
  private markers: THREE.Group[] = [];
  private laser: THREE.Mesh;
  private spark: THREE.Sprite;
  private dustPuff: THREE.Points;
  private dustAge: Float32Array;
  private dustVel: Float32Array;
  private h0 = 0;
  /** seconds since the start (Mars time) */
  t = 0;
  private angle0 = 0;
  private jd0 = 0;
  private warpI = 3;
  private paused = false;
  private camMode: CamMode = 'chase';
  private camYaw = 0.5;
  private camPitch = 0.28;
  private camDist = 9;
  private mastAz = 0;
  private mastEl = 0;
  private keys = new Set<string>();
  private drag: { id: number; x: number; y: number } | null = null;
  private lastDrag = -1e9;
  private act: Activity | null = null;
  private done = new Set<number>();
  samples = 0;
  private heliOut = false;
  private heliPlaced = false;
  private heliPos = new THREE.Vector3();
  private heliYaw = 0;
  private endShown = false;
  private rockGen = -1;
  private wallT = 0;
  edl: EdlSequence | null = null;
  // UI
  private ui: HTMLDivElement;
  private elKicker: HTMLElement;
  private elTitle: HTMLElement;
  private elObj: HTMLElement;
  private elTel: HTMLElement;
  private elLog: HTMLElement;
  private elAct: HTMLButtonElement;
  private elWarp: HTMLButtonElement[] = [];
  private elCam: HTMLButtonElement;
  private elMap: HTMLCanvasElement;
  private elLabels: HTMLDivElement;
  private elFlash: HTMLElement;
  private elCard: HTMLElement;
  private elCardT: HTMLElement;
  private elCardS: HTMLElement;
  private elCardR: HTMLElement;
  private elHelp: HTMLElement;
  private flashT = 0;
  private telKey = '';
  private log: { text: string; kind: string }[] = [];
  private logKey = '';

  constructor(private getRenderer: () => THREE.WebGLRenderer, parent: HTMLElement) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.ui = el('div', 'rv-ui hidden', parent);
    this.elLabels = el('div', '', this.ui);
    const tl = el('div', 'rv-tl', this.ui);
    this.elKicker = el('div', 'rv-k', tl, '');
    this.elTitle = el('div', 'rv-t', tl, '');
    this.elObj = el('div', 'rv-obj', tl, '');
    this.elTel = el('div', 'rv-tr', this.ui);
    this.elLog = el('div', 'rv-log', this.ui);
    this.elMap = el('canvas', 'rv-map', this.ui);
    const bot = el('div', 'rv-bot', this.ui);
    this.elAct = el('button', 'rv-btn rv-act off', bot, '');
    this.elAct.addEventListener('click', () => this.action());
    const warp = el('div', 'rv-warp', bot);
    ROVER_WARPS.forEach((w, i) => {
      const b = el('button', '', warp, `${w}×`);
      b.addEventListener('click', () => (this.warpI = i));
      this.elWarp.push(b);
    });
    this.elCam = el('button', 'rv-btn', bot, 'CAMERA');
    this.elCam.addEventListener('click', () => this.cycleCam());
    const help = el('button', 'rv-btn', bot, '?');
    help.addEventListener('click', () => this.elHelp.classList.toggle('show'));
    const ex = el('button', 'rv-btn', bot, 'EXIT');
    ex.addEventListener('click', () => this.setPaused(true));
    this.elFlash = el('div', 'rv-flash', this.ui);
    this.elHelp = el('div', 'rv-help', this.ui);
    this.elHelp.innerHTML = [
      ['W / S', 'drive forward / back'],
      ['A / D', 'steer (alone: turn on the spot)'],
      ['SPACE', 'the job at a target (drill, laser, helicopter)'],
      ['1 … 6', 'time warp'],
      ['C', 'camera: chase, orbit, Mastcam'],
      ['DRAG · WHEEL', 'look around · zoom'],
      ['ESC', 'pause'],
    ].map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('');
    this.elHelp.addEventListener('click', () => this.elHelp.classList.remove('show'));
    this.elCard = el('div', 'rv-card', this.ui);
    const cb = el('div', 'rv-card-b', this.elCard);
    this.elCardT = el('div', 'rv-card-t', cb);
    this.elCardS = el('div', 'rv-card-s', cb);
    this.elCardR = el('div', 'rv-card-r', cb);
    const tm = trackMaterial();
    this.tracksL = new Tracks(tm);
    this.tracksR = new Tracks(tm);
    this.site.add(this.tracksL.mesh, this.tracksR.mesh);
    // SuperCam's laser: a thin red line and a spark of plasma on the rock
    this.laser = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.laser.visible = false;
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sg = sc.getContext('2d')!;
    const gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,190,160,0.6)');
    gr.addColorStop(1, 'rgba(255,120,80,0)');
    sg.fillStyle = gr;
    sg.fillRect(0, 0, 64, 64);
    const spTex = new THREE.CanvasTexture(sc);
    this.spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: spTex, color: new THREE.Color(4, 3, 2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.spark.visible = false;
    this.site.add(this.laser, this.spark);
    // the drill's dust and the helicopter's downwash
    const N = 400;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.dustAge = new Float32Array(N).fill(99);
    this.dustVel = new Float32Array(N * 3);
    this.dustPuff = new THREE.Points(pg, new THREE.PointsMaterial({ map: spTex, color: new THREE.Color(0.75, 0.52, 0.36), size: 0.25, transparent: true, opacity: 0.55, depthWrite: false }));
    this.dustPuff.frustumCulled = false;
    this.site.add(this.dustPuff);

    window.addEventListener('keydown', (e) => this.onKey(e, true), { capture: true });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { capture: true });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest && t.closest('button, .rv-tr, .rv-help, .rv-card, .rv-map')) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.lastDrag = performance.now();
      if (this.camMode === 'mast') {
        this.mastAz -= dx * 0.004;
        this.mastEl = Math.max(-0.9, Math.min(0.9, this.mastEl - dy * 0.004));
      } else {
        this.camYaw -= dx * 0.005;
        this.camPitch = Math.max(0.02, Math.min(1.45, this.camPitch + dy * 0.004));
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
        const k = Math.exp(Math.max(-120, Math.min(120, e.deltaY)) * 0.0018);
        this.camDist = Math.max(3, Math.min(400, this.camDist * k));
      },
      { passive: true },
    );
  }

  // ------------------------------------------------------------------ lifecycle
  start(def: RoverMissionDef): void {
    // (keys still held from the last flight were released while nothing was listening)
    this.keys.clear();
    this.def = def;
    const renderer = this.getRenderer();
    if (!this.mars) {
      this.mars = new MarsView();
      this.mars.renderer = renderer;
      this.mars.scene.add(this.site);
    }
    this.mars.dustiness = 0.45 + Math.random() * 0.35;
    this.mars.rockScale = 0.6;
    const curiosity = def.rover === 'curiosity';
    if (!this.rig || this.rig.curiosity !== curiosity) {
      if (this.rig) this.site.remove(this.rig.group);
      this.rig = buildRover(curiosity);
      this.site.add(this.rig.group);
    }
    this.rigCur = this.rig;
    if (!this.heli) {
      this.heli = buildIngenuity();
      this.site.add(this.heli.group);
    }
    this.heli.group.visible = false;
    this.heliOut = false;
    this.heliPlaced = false;
    const d = (this.drive = new RoverDrive(def.site.lat, def.site.lon));
    d.heading = def.heading;
    this.h0 = marsHeight(def.site.lat, def.site.lon);
    d.pose();
    this.tracksL.clear();
    this.tracksR.clear();
    // the clock: today's date on Mars, the site at the chosen local time
    this.jd0 = Date.now() / 86_400_000 + 2_440_587.5;
    const sun = this.sunDir(this.jd0);
    const sunAz = Math.atan2(sun[1], sun[0]);
    // the site's meridian is (hour - 12) * 15 deg past the Sun's
    this.angle0 = sunAz + ((def.hour - 12) / 24) * Math.PI * 2 - def.site.lon * D2R;
    this.t = 0;
    this.warpI = 3;
    this.paused = false;
    this.camMode = 'chase';
    this.camYaw = 0.6;
    this.camPitch = 0.25;
    this.camDist = 9;
    this.mastAz = 0;
    this.mastEl = 0;
    this.act = null;
    this.done.clear();
    this.samples = 0;
    this.endShown = false;
    this.rockGen = -1;
    this.log = [];
    this.logKey = '';
    stowArm(this.rig);
    // the targets: a beacon and a patch of outcrop at each
    for (const m of this.markers) this.site.remove(m);
    this.markers = def.targets.map((tg, i) => this.makeMarker(tg, i));
    this.elCard.classList.remove('show');
    this.elHelp.classList.remove('show');
    this.elKicker.textContent = def.rover === 'curiosity' ? 'CURIOSITY · MARS SCIENCE LABORATORY' : 'PERSEVERANCE · MARS 2020';
    this.elTitle.textContent = def.title;
    this.active = true;
    this.ui.classList.remove('hidden');
    menuMusic.want('flight', true);
    for (const l of def.intro) this.say(l);
    // the entry, descent and landing first, if this mission flies it
    if (def.edl) {
      this.edl = new EdlSequence(this.site, this.rig, (lat, lon) => marsHeight(lat, lon) - this.h0, def.site.lat, def.site.lon);
      this.rig.group.visible = false;
      this.warpI = 0;
    } else {
      this.edl = null;
      this.rig.group.visible = true;
      this.flash(def.site.name.split(',')[0].toUpperCase());
    }
  }

  stop(): void {
    this.active = false;
    this.ui.classList.add('hidden');
    menuMusic.want('flight', false);
    if (this.edl) this.edl.dispose();
    this.edl = null;
  }

  private exit(): void {
    this.stop();
    this.onExit?.();
  }

  private restart(): void {
    const d = this.def;
    this.stop();
    if (d) this.start(d);
  }

  say(text: string, kind = ''): void {
    this.log.push({ text, kind });
  }

  private flash(text: string): void {
    this.elFlash.textContent = text;
    this.elFlash.classList.add('show');
    this.flashT = 3.2;
  }

  private card(title: string, text: string, buttons: [string, () => void][]): void {
    this.elCardT.textContent = title;
    this.elCardS.textContent = text;
    this.elCardR.textContent = '';
    for (const [t, fn] of buttons) {
      const b = el('button', 'rv-btn', this.elCardR, t);
      b.addEventListener('click', () => {
        audio.click();
        fn();
      });
    }
    this.elCard.classList.add('show');
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.card('PAUSED', 'The mission clock is stopped.', [['RESUME', () => this.setPaused(false)], ['START OVER', () => this.restart()], ['EXIT TO MENU', () => this.exit()]]);
    else this.elCard.classList.remove('show');
  }

  private cycleCam(): void {
    this.camMode = this.camMode === 'chase' ? 'orbit' : this.camMode === 'orbit' ? 'mast' : 'chase';
    this.flash(this.camMode === 'mast' ? 'MASTCAM-Z' : this.camMode === 'orbit' ? 'ORBIT CAMERA' : 'CHASE CAMERA');
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.active) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const c = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) {
      if (down) this.keys.add(c);
      else this.keys.delete(c);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!down) return;
    // (paused: only Escape, to resume, and the help)
    if (this.paused && c !== 'Escape' && c !== 'KeyH' && c !== 'Slash') return;
    let used = true;
    if (c === 'Space') this.action();
    else if (c === 'KeyC') this.cycleCam();
    else if (/^Digit[1-6]$/.test(c)) this.warpI = Number(c.slice(5)) - 1;
    else if (c === 'Escape') {
      if (this.elHelp.classList.contains('show')) this.elHelp.classList.remove('show');
      else this.setPaused(!this.paused);
    } else if (c === 'KeyH' || c === 'Slash') this.elHelp.classList.toggle('show');
    else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // ------------------------------------------------------------------ geometry
  private sunDir(jd: number): Vec {
    return vnorm(vscale(marsState(jd).r, -1));
  }
  private angle(): number {
    return this.angle0 + MARS.spin * this.t;
  }
  /** the local frame's y at a point (terrain, less the curve of the planet) */
  ground(e: number, n: number): number {
    return this.drive!.ground(e, n) - this.h0 - (e * e + n * n) / (2 * MARS.R);
  }
  /** a site point (east, height, north) in the Mars-fixed frame */
  private fixed(e: number, y: number, n: number): THREE.Vector3 {
    const { lat, lon } = this.def!.site;
    const la = lat * D2R, lo = lon * D2R;
    const U = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
    const E = new THREE.Vector3(-Math.sin(lo), Math.cos(lo), 0);
    const N = new THREE.Vector3().crossVectors(U, E);
    return U.clone().multiplyScalar(MARS.R + this.h0 + y).addScaledVector(E, e).addScaledVector(N, n);
  }

  private makeMarker(tg: RoverTarget, i: number): THREE.Group {
    const g = new THREE.Group();
    const y = this.ground(tg.e, tg.n);
    g.position.set(tg.e, y, -tg.n);
    // a few outcrop slabs at the target (the rock the scientists picked)
    let s = (i + 3) * 7919;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const rockMat = rockMaterial(0x523321);
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(boulderGeometry(i * 11 + k), rockMat);
      const sz = k === 0 ? 0.7 : 0.25 + r() * 0.35;
      const a = r() * 6.28, d = k === 0 ? 0 : 0.8 + r() * 1.6;
      m.position.set(Math.cos(a) * d, -sz * 0.25, Math.sin(a) * d);
      m.scale.set(sz * (1.2 + r() * 0.6), sz * 0.55, sz * (1 + r() * 0.5));
      m.rotation.y = r() * 6;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    // the beacon: a soft column of light and a ring on the ground (a game aid, not on Mars)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.4), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.position.y = 20;
    beam.name = 'beam';
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.85, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.0, 0.45), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.name = 'ring';
    g.add(beam, ring);
    this.site.add(g);
    return g;
  }

  // ------------------------------------------------------------------ actions
  private nearTarget(): number {
    const d = this.drive!;
    const def = this.def!;
    for (let i = 0; i < def.targets.length; i++) {
      if (this.done.has(i)) continue;
      const tg = def.targets[i];
      // (once Ingenuity is down, the rover watches from where it backed off to)
      const r = tg.kind === 'reach' ? 4 : tg.kind === 'heli' && this.heliOut ? 30 : 5.5;
      if (Math.hypot(tg.e - d.e, tg.n - d.n) < r) return i;
    }
    return -1;
  }

  /** arriving at a waypoint is the whole job there */
  checkReach(): void {
    const i = this.nearTarget();
    if (i < 0 || this.act) return;
    const tg = this.def!.targets[i];
    if (tg.kind === 'reach') this.finish(i, `${tg.name}: reached. ${tg.text}`);
  }

  private nextAction(): { label: string; run: () => void } | null {
    if (this.edl) return this.edl.done ? { label: 'START DRIVING', run: () => this.endEdl() } : null;
    if (this.act) return null;
    const i = this.nearTarget();
    if (i < 0) return null;
    const tg = this.def!.targets[i];
    if (Math.abs(this.drive!.speed) > 0.002) return { label: 'STOP TO WORK', run: () => {} };
    if (tg.kind === 'drill') return { label: 'DRILL A CORE', run: () => this.begin('drill', i) };
    if (tg.kind === 'zap') return { label: this.def!.rover === 'curiosity' ? 'FIRE CHEMCAM' : 'FIRE SUPERCAM', run: () => this.begin('zap', i) };
    if (tg.kind === 'heli') return this.heliOut ? { label: 'FLY INGENUITY', run: () => this.begin('heliFly', i) } : { label: 'DROP INGENUITY', run: () => this.begin('heli', i) };
    return null;
  }

  private action(): void {
    const a = this.nextAction();
    if (!a) return;
    audio.init();
    audio.click();
    a.run();
  }

  private begin(kind: Activity['kind'], i: number): void {
    this.act = { kind, t: 0, target: this.def!.targets[i] };
    this.warpI = 0;
    if (kind === 'drill') this.say(`Drilling at ${this.act.target.name}: the arm unfolds, the turret swings the coring drill down onto the rock.`);
    if (kind === 'zap') this.say(`${this.def!.rover === 'curiosity' ? 'ChemCam' : 'SuperCam'} fires its laser at ${this.act.target.name} from 7 m away: each pulse turns a pinhead of rock to glowing plasma, and the spectrometer reads its light.`);
    if (kind === 'heli') this.say('Ingenuity drops from the rover\'s belly onto the airfield. The rover backs away to watch.');
    if (kind === 'heliFly') this.say('Ingenuity spins its rotors up to 2,537 rpm: in air 1% as thick as Earth\'s, it has to spin that fast to fly at all.');
  }

  private finish(i: number, text: string): void {
    this.done.add(i);
    this.say(text, 'good');
    const m = this.markers[i];
    m.getObjectByName('beam')!.visible = false;
    ((m.getObjectByName('ring') as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setRGB(0.4, 1.6, 0.7);
    audio.beep(880, 0.12, 0.06);
    if (this.done.size === this.def!.targets.length) this.complete();
  }

  private complete(): void {
    if (this.endShown) return;
    this.endShown = true;
    updateRecord((r) => {
      r.missions++;
      r.samples += this.samples;
    });
    const d = this.drive!;
    setTimeout(() => {
      if (!this.active) return;
      this.flash('MISSION COMPLETE');
      this.card('MISSION COMPLETE', `${this.def!.outro} Driven: ${d.odometer.toFixed(0)} m in ${this.solText()}.`, [
        ['KEEP DRIVING', () => this.elCard.classList.remove('show')],
        ['PLAY AGAIN', () => this.restart()],
        ['EXIT TO MENU', () => this.exit()],
      ]);
    }, 2500);
  }

  private endEdl(): void {
    if (!this.edl) return;
    // drive on from where the rover came down
    const at = this.edl.landedAt();
    if (at && this.drive) {
      this.drive.e = at.e;
      this.drive.n = at.n;
      this.drive.heading = at.heading;
      this.drive.pose();
    }
    this.edl.dispose();
    this.edl = null;
    this.rig!.group.visible = true;
    this.warpI = 3;
    this.flash('DRIVE');
    this.say('Touchdown confirmed. Perseverance is safe on the floor of Jezero Crater. Time to drive.', 'good');
  }

  // ------------------------------------------------------------------ the frame
  frame(dtReal: number, w: number, h: number): void {
    const d = this.drive;
    if (!d || !this.mars || !this.rig || !this.def) return;
    const dt = Number.isFinite(dtReal) ? Math.max(0, Math.min(0.1, dtReal)) : 0;
    this.wallT += dt;
    this.mars.prepare(1e9);
    const warp = this.paused ? 0 : ROVER_WARPS[this.warpI];
    if (this.edl) {
      const ed = this.paused ? 0 : dt * Math.min(10, warp);
      this.edl.step(ed);
      this.t += ed;
      for (const m of this.edl.takeLog()) this.say(m.text, m.kind);
      if (this.edl.flashText) {
        this.flash(this.edl.flashText);
        this.edl.flashText = '';
      }
    } else if (!this.paused) {
      // drive (no driving while a job is under way)
      const k = (c: string) => (this.keys.has(c) ? 1 : 0);
      d.controls.drive = this.act ? 0 : k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown');
      d.controls.steer = this.act ? 0 : k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
      const step = dt * warp;
      // sub-step the physics at warp so the pose stays smooth
      const n = Math.max(1, Math.ceil(step / 0.5));
      for (let i = 0; i < n; i++) d.step(step / n);
      this.t += step;
      if (this.act) this.stepActivity(dt);
      this.checkReach();
    }
    // boulders from the Mars view, for collisions
    if (this.mars.rockGen !== this.rockGen) {
      this.rockGen = this.mars.rockGen;
      const { lat, lon } = this.def.site;
      d.rocks = this.mars.rockList.map((r) => ({ e: (r.lon - lon) * D2R * MARS.R * Math.cos(lat * D2R), n: (r.lat - lat) * D2R * MARS.R, r: r.size })).filter((r) => {
        // (keep the targets and the start clear)
        if (Math.hypot(r.e, r.n) < 8) return false;
        return !this.def!.targets.some((t) => Math.hypot(t.e - r.e, t.n - r.n) < 7);
      });
    }
    if (!this.edl) this.pose(dt);
    this.render(dt, w, h, warp);
    this.hud(warp, dt, w, h);
  }

  /** the rover's pose on the ground, its wheels, mast and antenna */
  private pose(dt: number): void {
    const d = this.drive!;
    const r = this.rig!;
    const y = d.y - this.h0 - (d.e * d.e + d.n * d.n) / (2 * MARS.R);
    r.group.position.set(d.e, y, -d.n);
    r.group.rotation.set(d.pitch, -d.heading, -d.bank, 'YXZ');
    for (let i = 0; i < 2; i++) {
      r.rockers[i].rotation.x = d.rocker[i];
      r.bogies[i].rotation.x = d.bogie[i] - d.rocker[i] * 0;
    }
    // the differential bar turns as the rockers counter-rotate
    r.diff.rotation.y = (d.rocker[1] - d.rocker[0]) * 0.6;
    const st = d.steer * 0.42 * (1 - d.spot);
    for (const wh of r.wheels) {
      wh.spin.rotation.x = -d.roll;
      if (wh.steer) {
        const front = wh.rest.z < 0;
        const diamond = (front ? 1 : -1) * wh.side * 0.78 * d.spot;
        wh.steer.rotation.y = (front ? -st : st) + diamond;
      }
    }
    // the mast: looking where the Mastcam view looks, or slowly scanning the horizon
    if (this.camMode === 'mast') aimMast(r, this.mastAz, this.mastEl);
    else if (!this.act) aimMast(r, Math.sin(this.wallT * 0.07) * 0.6, -0.12 + Math.sin(this.wallT * 0.05) * 0.05);
    // the high-gain antenna tracks Earth (roughly: up and off to one side)
    r.hgaAz.rotation.y = 0.6 + Math.sin(this.t * 7.27e-5) * 0.4;
    r.hgaEl.rotation.x = -0.7;
    // wheel tracks behind the middle wheels
    if (Math.abs(d.speed) > 0.001 || d.spot > 0.5) {
      const s = Math.sin(d.heading), c = Math.cos(d.heading);
      for (const side of [-1, 1]) {
        const x = side * ROVER.middle.x, z = ROVER.rear.z + 0.1;
        const e = d.e + x * c - z * s, n = d.n - x * s - z * c;
        const tr = side < 0 ? this.tracksL : this.tracksR;
        tr.add(e, this.ground(e, n), -n, c, s);
      }
    }
    this.tracksL.update();
    this.tracksR.update();
    // the target beacons pulse
    this.markers.forEach((m, i) => {
      const b = m.getObjectByName('beam') as THREE.Mesh;
      const tg = this.def!.targets[i];
      // (faded out as the rover arrives, so the camera is never inside it)
      const near = THREE.MathUtils.smoothstep(Math.hypot(tg.e - d.e, tg.n - d.n), 6, 20);
      b.visible = !this.done.has(i) && near > 0.01;
      if (b.visible) (b.material as THREE.MeshBasicMaterial).opacity = (0.12 + 0.08 * Math.sin(this.wallT * 2.2)) * near;
    });
    void dt;
  }

  private stepActivity(dt: number): void {
    const a = this.act!;
    a.t += dt;
    const r = this.rig!;
    const i = this.def!.targets.indexOf(a.target);
    if (a.kind === 'drill') {
      // unfold (5 s), drill (8 s), stow (4 s)
      const k = a.t < 5 ? a.t / 5 : a.t < 13 ? 1 : Math.max(0, 1 - (a.t - 13) / 4);
      deployArm(r, k * k * (3 - 2 * k));
      r.drill.rotation.y += dt * (a.t > 5 && a.t < 13 ? 40 : 0);
      if (a.t > 5.5 && a.t < 13) {
        r.drill.updateMatrixWorld();
        const tip = r.drill.localToWorld(new THREE.Vector3(0, -0.06, 0));
        this.site.worldToLocal(tip);
        this.puff(tip, 0.4, 3);
      }
      if (a.t > 17) {
        stowArm(r);
        this.act = null;
        this.samples++;
        this.finish(i, `Core sample #${this.samples} taken at ${a.target.name}: a pencil-thick cylinder of rock, sealed in its titanium tube.`);
      }
    } else if (a.kind === 'zap') {
      // aim the mast head at the rock, fire 30 pulses over 6 s
      const tg = a.target;
      const d = this.drive!;
      const head = new THREE.Vector3();
      r.mastEl.updateMatrixWorld();
      r.mastEl.localToWorld(head.set(0, 0.11, -0.16));
      this.site.worldToLocal(head);
      const rock = new THREE.Vector3(tg.e, this.ground(tg.e, tg.n) + 0.35, -tg.n);
      // the mast's pan and tilt toward it
      const rel = rock.clone().sub(new THREE.Vector3(d.e, this.ground(d.e, d.n) + 2, -d.n));
      const az = Math.atan2(rel.x, -rel.z) - d.heading;
      aimMast(r, -az, Math.atan2(rel.y, Math.hypot(rel.x, rel.z)));
      const firing = a.t > 1.5 && a.t < 7.5 && Math.floor(a.t * 5) % 2 === 0;
      this.laser.visible = firing;
      this.spark.visible = firing;
      if (firing) {
        const mid = head.clone().add(rock).multiplyScalar(0.5);
        this.laser.position.copy(mid);
        this.laser.scale.set(1, head.distanceTo(rock), 1);
        this.laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rock.clone().sub(head).normalize());
        this.spark.position.copy(rock);
        this.spark.scale.setScalar(0.25 + Math.random() * 0.2);
        if (Math.random() < 0.3) audio.beep(2400 + Math.random() * 400, 0.02, 0.02, 'square');
      }
      if (a.t > 8) {
        this.laser.visible = this.spark.visible = false;
        this.act = null;
        this.finish(i, `${a.target.name}: the plasma's light splits into the lines of iron, magnesium, silicon and calcium, and of hydrogen: water locked into the minerals.`);
      }
    } else if (a.kind === 'heli') {
      // Ingenuity drops from under the belly, then the rover backs off 5 m
      const h = this.heli!;
      const d = this.drive!;
      const s = Math.sin(d.heading), c = Math.cos(d.heading);
      if (!this.heliPlaced) {
        this.heliPlaced = true;
        this.heliPos.set(d.e - s * 0.2, 0, -(d.n - c * 0.2));
        this.heliYaw = d.heading;
      }
      h.group.visible = true;
      const k = Math.min(1, a.t / 4);
      const gy = this.ground(this.heliPos.x, -this.heliPos.z);
      h.group.position.set(this.heliPos.x, gy + (1 - k) * 0.45, this.heliPos.z);
      h.group.rotation.y = -this.heliYaw;
      if (a.t > 4 && a.t < 8) {
        d.controls.drive = -1;
        d.step(dt * 30);
      }
      if (a.t > 8) {
        d.controls.drive = 0;
        d.speed = 0;
        this.heliOut = true;
        this.act = null;
        this.say('Ingenuity is down on the airfield, charging its batteries from its solar panel. Fly it when ready.', 'good');
      }
    } else if (a.kind === 'heliFly') {
      // a real first flight, a little extended: up, hover, a hop across the field and back, land
      const h = this.heli!;
      const T = a.t;
      const spin = Math.min(1, T / 3);
      h.rotors[0].rotation.y += dt * 265 * spin;
      h.rotors[1].rotation.y -= dt * 265 * spin;
      let alt = 0, fwd = 0;
      if (T > 3 && T < 7) alt = ((T - 3) / 4) * 5;
      else if (T >= 7 && T < 11) alt = 5;
      else if (T >= 11 && T < 17) {
        alt = 5;
        fwd = ((T - 11) / 6) * 25;
      } else if (T >= 17 && T < 19) {
        alt = 5;
        fwd = 25;
      } else if (T >= 19 && T < 25) {
        alt = 5;
        fwd = 25 * (1 - (T - 19) / 6);
      } else if (T >= 25 && T < 29) alt = 5 * (1 - (T - 25) / 4);
      const s = Math.sin(this.heliYaw), c = Math.cos(this.heliYaw);
      const x = this.heliPos.x + s * fwd, z = this.heliPos.z - c * fwd;
      const gy = this.ground(x, -z);
      h.group.position.set(x, gy + alt, z);
      h.group.rotation.set(T > 11 && T < 25 ? (T < 19 ? -0.12 : 0.12) : 0, -this.heliYaw + (T > 7 && T < 11 ? (T - 7) * 0.4 : T >= 11 ? 1.6 : 0), 0, 'YXZ');
      if (alt > 0.05 || (T > 2 && T < 30)) this.puff(new THREE.Vector3(x, gy + 0.05, z), 1.4 * spin * Math.max(0, 1 - alt / 6), 2);
      if (T > 31) {
        this.act = null;
        this.finish(i, 'Ingenuity flew: up to 5 m, a hop of 25 m across the airfield and back, and down. The first powered, controlled flight on another world.');
      }
    }
  }

  /** a few dust grains at a point (drill cuttings, rotor downwash) */
  private puff(p: THREE.Vector3, spread: number, count: number): void {
    const pos = this.dustPuff.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < count; k++) {
      let j = 0;
      for (; j < this.dustAge.length; j++) if (this.dustAge[j] > 3) break;
      if (j >= this.dustAge.length) return;
      this.dustAge[j] = 0;
      const a = Math.random() * 6.28;
      pos.setXYZ(j, p.x, p.y, p.z);
      this.dustVel.set([Math.cos(a) * spread * (0.4 + Math.random()), 0.15 + Math.random() * 0.4, Math.sin(a) * spread * (0.4 + Math.random())], j * 3);
    }
  }

  private stepPuffs(dt: number): void {
    const pos = this.dustPuff.geometry.attributes.position as THREE.BufferAttribute;
    for (let j = 0; j < this.dustAge.length; j++) {
      if (this.dustAge[j] > 3) {
        pos.setXYZ(j, 0, -1e4, 0);
        continue;
      }
      this.dustAge[j] += dt;
      const v = this.dustVel;
      v[j * 3 + 1] -= 3.71 * dt * 0.3;
      pos.setXYZ(j, pos.getX(j) + v[j * 3] * dt, pos.getY(j) + v[j * 3 + 1] * dt, pos.getZ(j) + v[j * 3 + 2] * dt);
    }
    pos.needsUpdate = true;
  }

  // ------------------------------------------------------------------ drawing
  private render(dt: number, w: number, hgt: number, warp: number): void {
    const d = this.drive!;
    const mv = this.mars!;
    this.stepPuffs(dt);
    const ang = this.angle();
    const rot = new THREE.Matrix4().makeRotationZ(ang);
    // the floating origin: the ground under the rover (or the lander during the descent)
    const focus = this.edl ? this.edl.focus() : new THREE.Vector3(d.e, this.ground(d.e, d.n), -d.n);
    const originF = this.fixed(focus.x, focus.y, -focus.z);
    const origin = originF.clone().applyMatrix4(rot);
    // the site frame in the scene
    const sitePt = this.fixed(0, 0, 0).applyMatrix4(rot);
    this.site.position.set(sitePt.x - origin.x, sitePt.y - origin.y, sitePt.z - origin.z);
    const { lat, lon } = this.def!.site;
    const la = lat * D2R, lo = lon * D2R;
    const U = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)).applyMatrix4(rot);
    const E = new THREE.Vector3(-Math.sin(lo), Math.cos(lo), 0).applyMatrix4(rot);
    const N = new THREE.Vector3().crossVectors(U, E);
    // local x = east, y = up, z = south
    this.site.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(E, U, N.clone().negate()));
    this.site.updateMatrixWorld(true);
    // the camera, in the site frame, then into the scene
    const target = this.edl ? this.edl.focus() : new THREE.Vector3(d.e, this.ground(d.e, d.n) + 1.1, -d.n);
    let camL: THREE.Vector3;
    let lookL: THREE.Vector3;
    if (this.edl) {
      const c = this.edl.camera(this.camYaw, this.camPitch, performance.now() - this.lastDrag > 3500);
      camL = c.cam;
      lookL = c.look;
    } else if (this.camMode === 'mast') {
      const r = this.rig!;
      r.mastEl.updateMatrixWorld();
      camL = r.mastEl.localToWorld(new THREE.Vector3(0, 0.12, -0.25));
      lookL = r.mastEl.localToWorld(new THREE.Vector3(0, 0.06, -10));
      this.site.worldToLocal(camL);
      this.site.worldToLocal(lookL);
    } else {
      // chase: behind the rover, swinging round with its heading when nobody is dragging
      const idle = performance.now() - this.lastDrag > 2500;
      if (this.camMode === 'chase' && idle) {
        const want = -d.heading + Math.PI + 0.5;
        let dy = ((want - this.camYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        this.camYaw += dy * Math.min(1, dt * 0.8);
      }
      if (this.camMode === 'orbit' && idle) this.camYaw += dt * 0.05;
      const cp = Math.cos(this.camPitch);
      camL = target.clone().add(new THREE.Vector3(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp).multiplyScalar(this.camDist));
      const gy = this.ground(camL.x, -camL.z) + 0.6;
      if (camL.y < gy) camL.y = gy;
      lookL = target;
    }
    // the activity cameras: close on the arm, or on the helicopter
    if (this.act && !this.edl && performance.now() - this.lastDrag > 2500 && this.camMode !== 'mast') {
      if (this.act.kind === 'heliFly' || this.act.kind === 'heli') {
        const hp = this.heli!.group.position;
        lookL = hp.clone().add(new THREE.Vector3(0, 0.6, 0));
        const s = Math.sin(this.heliYaw), c = Math.cos(this.heliYaw);
        // (Ingenuity is 49 cm tall: the camera stays close)
        lookL = hp.clone().add(new THREE.Vector3(0, 0.3, 0));
        camL = hp.clone().add(new THREE.Vector3(c * 3.4 - s * 1.6, 0.9, s * 3.4 + c * 1.6));
        camL.y = Math.max(camL.y, this.ground(camL.x, -camL.z) + 0.4);
      } else if (this.act.kind === 'drill') {
        // off the front corner, looking at the turret on the rock
        const s = Math.sin(d.heading), c = Math.cos(d.heading);
        const g0 = this.ground(d.e, d.n);
        lookL = new THREE.Vector3(d.e + s * 1.5, g0 + 0.6, -(d.n + c * 1.5));
        camL = new THREE.Vector3(d.e + s * 5.2 + c * 3.2, g0 + 2.4, -(d.n + c * 5.2 - s * 3.2));
      }
    }
    const toScene = (p: THREE.Vector3) => p.clone().applyMatrix4(this.site.matrixWorld);
    const camS = toScene(camL), lookS = toScene(lookL);
    const upS = U;
    const sun = this.sunDir(this.jd0 + this.t / 86400);
    mv.update(
      {
        origin: [origin.x, origin.y, origin.z],
        cam: [camS.x, camS.y, camS.z],
        camUp: [upS.x, upS.y, upS.z],
        look: [lookS.x, lookS.y, lookS.z],
        angle: ang,
        sun,
        dust: this.edl ? this.edl.engineLevel() : 0,
        axis: [U.x, U.y, U.z],
        engineAgl: this.edl ? this.edl.engineAgl() : 50,
      },
      w,
      hgt,
      dt * Math.min(warp || 1, 4),
    );
    mv.camera.fov = this.camMode === 'mast' && !this.edl ? 40 : 55;
    mv.camera.near = 0.05;
    mv.camera.updateProjectionMatrix();
    this.drawWith?.(mv.scene, mv.camera);
    mv.restoreFog();
  }

  private solText(): string {
    const s = this.t / 88775;
    const sols = Math.floor(s);
    return sols > 0 ? `${sols} sol${sols > 1 ? 's' : ''} ${Math.round((s % 1) * 24.66)} h` : `${(this.t / 3600).toFixed(1)} h`;
  }

  private localTime(): string {
    const h = (((this.def!.hour + (this.t / 88775) * 24) % 24) + 24) % 24;
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} LMST`;
  }

  private hud(warp: number, dt: number, w: number, h: number): void {
    const d = this.drive!;
    const def = this.def!;
    // the objective
    let obj = '';
    if (this.edl) obj = this.edl.objective();
    else {
      const i = def.targets.findIndex((_, k) => !this.done.has(k));
      if (i >= 0) {
        const tg = def.targets[i];
        const dist = Math.hypot(tg.e - d.e, tg.n - d.n);
        obj = `${tg.name} · ${dist.toFixed(0)} m — ${tg.text}`;
      } else obj = 'All targets done. Explore as long as you like.';
    }
    if (obj !== this.elObj.textContent) this.elObj.textContent = obj;
    const rows: [string, string][] = [];
    const ll = d.latLon();
    if (this.edl) for (const r of this.edl.telemetry()) rows.push(r);
    else {
      rows.push(['LOCAL TIME', this.localTime()]);
      rows.push(['MISSION TIME', this.solText()]);
      rows.push(['SPEED', `${(Math.abs(d.speed) * 100).toFixed(1)} cm/s`]);
      rows.push(['DRIVEN', `${d.odometer.toFixed(1)} m`]);
      rows.push(['HEADING', `${Math.round(((d.heading / D2R) % 360 + 360) % 360)}°`]);
      rows.push(['SLOPE', `${d.slope.toFixed(1)}°${d.blocked ? ' · ' + d.blocked : ''}`]);
      rows.push(['SAMPLES', `${this.samples}`]);
      rows.push(['POSITION', `${Math.abs(ll.lat).toFixed(4)}°${ll.lat >= 0 ? 'N' : 'S'} ${Math.abs(ll.lon).toFixed(4)}°E`]);
      rows.push(['REGION', regionName(ll.lat, ll.lon).toUpperCase()]);
      rows.push(['POWER', 'MMRTG 110 W']);
    }
    rows.push(['DATE', dateText(this.jd0 + this.t / 86400)]);
    const key = rows.map((r) => r.join(':')).join('|');
    if (key !== this.telKey) {
      this.telKey = key;
      this.elTel.innerHTML = rows.map(([a, b]) => `<div class="rv-row"><span>${a}</span><span>${b}</span></div>`).join('');
    }
    // the log
    const lk = this.log.length + ':' + (this.log[this.log.length - 1]?.text ?? '');
    if (lk !== this.logKey) {
      this.logKey = lk;
      this.elLog.textContent = '';
      for (const l of this.log.slice(-4)) el('div', l.kind, this.elLog, l.text);
    }
    const a = this.nextAction();
    this.elAct.classList.toggle('off', !a);
    if (a) this.elAct.textContent = a.label;
    this.elWarp.forEach((b, i) => b.classList.toggle('on', i === this.warpI));
    this.elCam.textContent = this.camMode === 'mast' ? 'MASTCAM' : this.camMode === 'orbit' ? 'ORBIT' : 'CHASE';
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.elFlash.classList.remove('show');
    }
    void warp;
    this.drawLabels(w, h);
    this.drawMap();
  }

  private drawLabels(w: number, h: number): void {
    const cam = this.mars!.camera;
    const def = this.def!;
    let html = '';
    const d = this.drive!;
    if (!this.edl)
      def.targets.forEach((tg, i) => {
        const p = new THREE.Vector3(tg.e, this.ground(tg.e, tg.n) + 3, -tg.n).applyMatrix4(this.site.matrixWorld).project(cam);
        if (p.z > 1 || p.z < -1) return;
        const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h;
        if (x < -50 || x > w + 50 || y < -50 || y > h + 50) return;
        const dist = Math.hypot(tg.e - d.e, tg.n - d.n);
        const col = this.done.has(i) ? '#8ff0b8' : '#ffd2a8';
        html += `<div class="rv-lab" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;color:${col}">${tg.name}<i>${this.done.has(i) ? 'DONE' : dist.toFixed(0) + ' m'}</i></div>`;
      });
    if (html !== this.elLabels.innerHTML) this.elLabels.innerHTML = html;
  }

  private drawMap(): void {
    const cv = this.elMap;
    const W = cv.clientWidth || 200, H = cv.clientHeight || 200;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const d = this.drive!;
    const def = this.def!;
    // scale to show the rover and every target
    let ext = 40;
    for (const t of def.targets) ext = Math.max(ext, Math.abs(t.e - d.e) + 15, Math.abs(t.n - d.n) + 15);
    const k = (Math.min(W, H) / 2 - 10) / ext;
    const X = (e: number) => W / 2 + (e - d.e) * k, Y = (n: number) => H / 2 - (n - d.n) * k;
    // the terrain's shading: a quick hillshade of the area
    g.globalAlpha = 0.5;
    const step = 10;
    for (let py = 0; py < H; py += step)
      for (let px = 0; px < W; px += step) {
        const e = d.e + (px - W / 2) / k, n = d.n - (py - H / 2) / k;
        const h1 = d.ground(e, n), h2 = d.ground(e + 6 / k, n + 6 / k);
        const sh = Math.max(0, Math.min(1, 0.5 + (h2 - h1) * 0.08));
        g.fillStyle = `rgb(${Math.round(90 + sh * 80)},${Math.round(55 + sh * 50)},${Math.round(35 + sh * 30)})`;
        g.fillRect(px, py, step, step);
      }
    g.globalAlpha = 1;
    // grid
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    // targets
    def.targets.forEach((t, i) => {
      g.fillStyle = this.done.has(i) ? '#6fe0a0' : '#ffb27a';
      g.beginPath();
      g.arc(X(t.e), Y(t.n), 4.5, 0, Math.PI * 2);
      g.fill();
    });
    // the rover
    g.save();
    g.translate(X(d.e), Y(d.n));
    g.rotate(d.heading);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = '600 10px Rajdhani, system-ui';
    g.fillText('N', W / 2 - 3, 11);
    g.fillText(`${Math.round(ext)} m`, 6, H - 6);
  }
}

export { ROVER };
