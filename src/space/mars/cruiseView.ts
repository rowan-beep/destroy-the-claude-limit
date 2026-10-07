// Interplanetary space, for the months between Earth and Mars: the ship under
// a hard, unfiltered Sun (dimmer the further out it goes), the stars, and Earth
// and Mars as the points of light they really are from out here. The map shows
// the inner solar system from above the ecliptic: the Sun, the orbits of Earth
// and Mars, both planets where they are today, and the ship's coast ahead.

import * as THREE from 'three';
import { AU, DAY, MARS, SUN_MU, Vec, earthState, marsState, propagate, vlen, vnorm, vsub } from './marsPhysics';

/** map units: one per million kilometres */
const MAP = 1e-9;

export interface CruiseState {
  /** ship, heliocentric (ecliptic, Z north) */
  r: Vec;
  v: Vec;
  jd: number;
  /** camera relative to the ship (chase), or the map's camera relative to the Sun (map units) */
  cam: Vec;
  camUp: Vec;
  look: Vec;
  map: boolean;
  /** when the coast ends (for drawing the path ahead) */
  arriveJd: number;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,248,235,0.85)');
  gr.addColorStop(0.45, 'rgba(255,220,170,0.18)');
  gr.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class CruiseView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1e7);
  /** the ship goes here (at the origin, chase view) */
  readonly local = new THREE.Group();
  readonly sunLight = new THREE.DirectionalLight(0xfff8f0, 3.4);
  private hemi = new THREE.HemisphereLight(0x8090a0, 0x101010, 0.05);
  private stars: THREE.Points;
  private sun: THREE.Sprite;
  private sunGlow: THREE.Sprite;
  private earthDot: THREE.Sprite;
  private marsDot: THREE.Sprite;
  // the map
  private mapGroup = new THREE.Group();
  private mapSun: THREE.Mesh;
  private mapEarth: THREE.Mesh;
  private mapMars: THREE.Mesh;
  private mapShip: THREE.Sprite;
  private path: THREE.Line;
  private pathKey = '';
  private earthOrbit: THREE.Line;
  private marsOrbit: THREE.Line;

  constructor() {
    const scene = this.scene;
    scene.background = new THREE.Color(0x000000);
    // stars: a sphere of points that rides with the camera
    const N = 6000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    let s = 7;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < N; i++) {
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, rr = Math.sqrt(1 - z * z);
      // a band of extra stars along the galaxy
      pos.set([rr * Math.cos(a) * 9000, rr * Math.sin(a) * 9000, z * 9000], i * 3);
      const b = Math.pow(rnd(), 3) * 1.4 + 0.15;
      const warm = rnd();
      col.set([b * (0.85 + 0.25 * warm), b * (0.88 + 0.1 * warm), b * (1.1 - 0.3 * warm)], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, toneMapped: false, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -2;
    scene.add(this.stars);
    const glow = glowTexture();
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(40, 38, 34), toneMapped: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(0.6, 0.55, 0.45), toneMapped: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    const dot = dotTexture();
    this.earthDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: new THREE.Color(1.6, 2.0, 3.0), toneMapped: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.marsDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: new THREE.Color(3.0, 1.5, 0.8), toneMapped: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    for (const sp of [this.sun, this.sunGlow, this.earthDot, this.marsDot]) {
      sp.renderOrder = -1;
      scene.add(sp);
    }
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    const sc = this.sunLight.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -60;
    sc.right = sc.top = 60;
    sc.near = 1;
    sc.far = 500;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.05;
    scene.add(this.sunLight, this.sunLight.target, this.hemi, this.local);

    // ------------------------------------------------------------ the map
    this.mapSun = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5, 3.5), toneMapped: false }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(2.4, 2, 1.4), toneMapped: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(40);
    this.mapSun.add(halo);
    this.mapEarth = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 12), new THREE.MeshBasicMaterial({ color: 0x4f8fe0 }));
    this.mapMars = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 12), new THREE.MeshBasicMaterial({ color: 0xd2643a }));
    this.mapShip = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: new THREE.Color(3, 3, 3), toneMapped: false, depthWrite: false, depthTest: false, transparent: true }));
    this.mapShip.renderOrder = 5;
    const orbitLine = (body: 'earth' | 'mars', color: number): THREE.Line => {
      const P = body === 'earth' ? 365.256 : 686.98;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 360; i++) {
        const st = (body === 'earth' ? earthState : marsState)(2451545 + (P * i) / 360);
        pts.push(new THREE.Vector3(st.r[0] * MAP, st.r[1] * MAP, st.r[2] * MAP));
      }
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
    };
    this.earthOrbit = orbitLine('earth', 0x4f8fe0);
    this.marsOrbit = orbitLine('mars', 0xd2643a);
    this.path = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.9 }));
    this.path.frustumCulled = false;
    // the ecliptic grid: faint rings every 0.5 AU
    for (let k = 1; k <= 4; k++) {
      const r = k * 0.5 * AU * MAP;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.15, r + 0.15, 180), new THREE.MeshBasicMaterial({ color: 0x3a4a5e, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      this.mapGroup.add(ring);
    }
    this.mapGroup.add(this.mapSun, this.mapEarth, this.mapMars, this.mapShip, this.earthOrbit, this.marsOrbit, this.path);
    this.mapGroup.visible = false;
    scene.add(this.mapGroup);
  }

  update(st: CruiseState, w: number, h: number): void {
    const cam = this.camera;
    cam.aspect = w / Math.max(1, h);
    const rs = vlen(st.r);
    const sunDir = vnorm(vsub([0, 0, 0], st.r));
    const e = earthState(st.jd).r, m = marsState(st.jd).r;
    this.mapGroup.visible = st.map;
    this.local.visible = !st.map;
    this.earthDot.visible = this.marsDot.visible = this.sun.visible = this.sunGlow.visible = !st.map;
    if (st.map) {
      // the map: the camera round the Sun, the planets and the ship where they are
      cam.position.set(...st.cam);
      cam.up.set(...st.camUp);
      cam.lookAt(new THREE.Vector3(...st.look));
      cam.near = 0.5;
      cam.far = 1e6;
      cam.fov = 45;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this.mapEarth.position.set(e[0] * MAP, e[1] * MAP, e[2] * MAP);
      this.mapMars.position.set(m[0] * MAP, m[1] * MAP, m[2] * MAP);
      this.mapShip.position.set(st.r[0] * MAP, st.r[1] * MAP, st.r[2] * MAP);
      const d = cam.position.distanceTo(this.mapShip.position);
      this.mapShip.scale.setScalar(d * 0.02);
      // keep the planets visible however far out the camera is
      const k = Math.max(1.5, cam.position.length() / 160);
      this.mapEarth.scale.setScalar(k);
      this.mapMars.scale.setScalar(k);
      this.stars.position.copy(cam.position);
      this.stars.visible = true;
      this.updatePath(st);
      return;
    }
    // chase view round the ship
    cam.position.set(...st.cam);
    cam.up.set(...st.camUp);
    cam.lookAt(new THREE.Vector3(...st.look));
    cam.near = 0.5;
    cam.far = 1e7;
    cam.fov = 50;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.stars.position.copy(cam.position);
    this.stars.visible = true;
    // the Sun: smaller and dimmer the further out
    const sd = new THREE.Vector3(...sunDir);
    const far = 1e6;
    const ang = (2 * 6.96e8) / rs;
    this.sun.position.copy(cam.position).addScaledVector(sd, far);
    this.sun.scale.setScalar(far * ang * 3.2);
    this.sunGlow.position.copy(this.sun.position);
    this.sunGlow.scale.setScalar(far * ang * 22);
    const flux = (AU / rs) ** 2;
    this.sunLight.intensity = 3.4 * Math.min(1.2, flux);
    this.sunLight.position.copy(sd).multiplyScalar(250);
    this.sunLight.target.position.set(0, 0, 0);
    // Earth and Mars: points of light, a little disc when close
    const pix = ((cam.fov * Math.PI) / 180 / Math.max(1, h)) * far;
    const place = (sp: THREE.Sprite, p: Vec, radius: number, bright: number) => {
      const rel = vsub(p, st.r);
      const dist = vlen(rel);
      const dir = vnorm(rel);
      sp.position.copy(cam.position).add(new THREE.Vector3(...dir).multiplyScalar(far));
      sp.scale.setScalar(Math.max(pix * 5, ((2 * radius) / dist) * far * 2.4));
      (sp.material as THREE.SpriteMaterial).opacity = Math.min(1, bright * (2e10 / dist + 0.35));
    };
    place(this.earthDot, e, 6.371e6, 1);
    place(this.marsDot, m, MARS.R, 1);
  }

  /** the ship's coast from now to the arrival at Mars */
  private updatePath(st: CruiseState): void {
    const key = `${Math.round(st.jd * 4)}:${Math.round(st.arriveJd * 4)}`;
    if (key === this.pathKey) return;
    this.pathKey = key;
    const pts: THREE.Vector3[] = [];
    const span = Math.max(0, st.arriveJd - st.jd) * DAY;
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const s = propagate(st.r, st.v, (span * i) / n, SUN_MU);
      pts.push(new THREE.Vector3(s.r[0] * MAP, s.r[1] * MAP, s.r[2] * MAP));
    }
    this.path.geometry.dispose();
    this.path.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.path.computeLineDistances();
  }
}

export { MAP as CRUISE_MAP_SCALE };
