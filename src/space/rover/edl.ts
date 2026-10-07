// Mars 2020's entry, descent and landing: "seven minutes of terror".
//
// The real sequence and figures. Entry interface at 125 km and 5.4 km/s, 15.5
// degrees below the horizon; the 4.5 m heat shield takes up to 10 g and 1,300
// C while the capsule's offset centre of mass gives it lift to steer with. At
// about Mach 1.75 and 11 km the mortar fires a 21.5 m disk-gap-band parachute
// (its red and white gores spell "DARE MIGHTY THINGS" in binary); 20 s later
// the heat shield falls away and the radar and cameras see the ground (terrain
// relative navigation picks a safe spot). At 2.1 km the descent stage drops out
// of the backshell and lights its eight engines, slows to a walk, and at 21 m
// lowers the rover 7.6 m on three nylon bridles: the sky crane. When the wheels
// touch, pyros cut the bridles and the descent stage flies off to crash a safe
// distance away.
//
// Everything is in the landing site's local frame (x east, y up, z south),
// with the planet's curve accounted for, so the descent can start 700 km out.

import * as THREE from 'three';
import { MARS, marsDensity } from '../mars/marsPhysics';
import type { RoverRig } from './roverModel';
import { setArm } from './roverModel';

const G = MARS.g;
const A_SHIELD = Math.PI * 2.25 * 2.25;
const CHUTE_D = 21.5;
const A_CHUTE = Math.PI * (CHUTE_D / 2) ** 2;
const BRIDLE = 7.6;

type Phase = 'cruise' | 'entry' | 'chute' | 'backshell' | 'powered' | 'skycrane' | 'flyaway' | 'down';

interface Msg {
  text: string;
  kind: string;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** the parachute's gores: "DARE MIGHTY THINGS" in 7-bit groups round three rings, the JPL coordinates on the band */
function chuteTexture(): THREE.CanvasTexture {
  return canvasTex(1024, 512, (g) => {
    g.fillStyle = '#f2f0ea';
    g.fillRect(0, 0, 1024, 512);
    const words = ['DARE', 'MIGHTY', 'THINGS'];
    const gores = 80;
    // rows top (apex) to bottom (skirt): three rings of the message, then the band
    const rowH = [90, 110, 120];
    let y = 40;
    words.forEach((w, ri) => {
      const bits: number[] = [];
      for (const ch of w) {
        const v = ch.charCodeAt(0) - 64;
        for (let b = 6; b >= 0; b--) bits.push((v >> b) & 1);
        bits.push(0, 0, 0);
      }
      for (let i = 0; i < gores; i++) {
        if (bits[i % bits.length]) {
          g.fillStyle = '#c4302b';
          g.fillRect((i / gores) * 1024, y, 1024 / gores + 0.5, rowH[ri]);
        }
      }
      y += rowH[ri];
    });
    // the band: 34 11 58 N  118 10 31 W
    const band = [1, 0, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1];
    for (let i = 0; i < gores; i++) {
      if (band[i % band.length]) {
        g.fillStyle = '#c4302b';
        g.fillRect((i / gores) * 1024, 400, 1024 / gores + 0.5, 112);
      }
    }
    // seams
    g.strokeStyle = 'rgba(80,70,60,0.35)';
    for (let i = 0; i <= gores; i++) {
      g.beginPath();
      g.moveTo((i / gores) * 1024, 0);
      g.lineTo((i / gores) * 1024, 512);
      g.stroke();
    }
  });
}

export class EdlSequence {
  phase: Phase = 'entry';
  done = false;
  flashText = '';
  /** seconds since entry interface */
  t = 0;
  /** downrange distance to go (m, positive = still short of the site) and height above the datum */
  private s = 0;
  private h = 125_000;
  /** velocity: horizontal (toward the site) and vertical (up), m/s */
  private vx = 0;
  private vz = 0;
  private mass = 3300;
  private bank = 0;
  private heat = 0;
  private gLoad = 0;
  private throttle = 0;
  private chuteK = 0;
  private bridle = 0;
  private flyT = 0;
  /** where the descent stage ended up */
  private crash: THREE.Vector3 | null = null;
  /** the approach azimuth: the direction it travels (unit, site frame x/z) */
  private dir = new THREE.Vector2(0.3, -0.95).normalize();
  private log: Msg[] = [];
  // models
  private root = new THREE.Group();
  private capsule = new THREE.Group();
  private heatShield: THREE.Mesh;
  private backshell = new THREE.Group();
  private chute = new THREE.Group();
  private chuteCanopy: THREE.Mesh;
  private stage = new THREE.Group();
  private plumes: THREE.Mesh[] = [];
  private glow: THREE.Sprite;
  private wake: THREE.Mesh;
  private bridles: THREE.LineSegments;
  /** heat shield and backshell, after they part (falling on their own) */
  private shieldFall: { obj: THREE.Object3D; p: THREE.Vector3; v: THREE.Vector3; spin: number } | null = null;
  private shellFall: { obj: THREE.Object3D; p: THREE.Vector3; v: THREE.Vector3; spin: number } | null = null;
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private rootPos = new THREE.Vector3();

  constructor(
    private site: THREE.Group,
    private rover: RoverRig,
    /** local ground height (site frame y) at a lat/lon */
    private groundLL: (lat: number, lon: number) => number,
    private lat0: number,
    private lon0: number,
  ) {
    const white = new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.55, metalness: 0.05 });
    const grey = new THREE.MeshStandardMaterial({ color: '#7d7f83', roughness: 0.5, metalness: 0.6 });
    const shieldMat = new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.85, emissive: new THREE.Color(0, 0, 0) });
    const gold = new THREE.MeshStandardMaterial({ color: '#d4a440', roughness: 0.3, metalness: 1 });
    // the heat shield: a 70-degree sphere-cone, 4.5 m across
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * 0.35;
      prof.push(new THREE.Vector2(Math.sin(a) * 1.1, -0.9 + (1 - Math.cos(a)) * 1.1));
    }
    prof.push(new THREE.Vector2(2.2, -0.05), new THREE.Vector2(2.25, 0), new THREE.Vector2(2.2, 0.04));
    this.heatShield = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), shieldMat);
    this.heatShield.castShadow = true;
    // the backshell: a truncated cone with the parachute canister on top
    const bs = new THREE.LatheGeometry([new THREE.Vector2(2.22, 0.02), new THREE.Vector2(2.1, 0.25), new THREE.Vector2(1.0, 2.2), new THREE.Vector2(0.75, 2.3), new THREE.Vector2(0.6, 2.75), new THREE.Vector2(0.0, 2.78)], 64);
    const bsm = new THREE.Mesh(bs, white);
    bsm.castShadow = true;
    this.backshell.add(bsm);
    // its ring of cruise-stage fittings and the balance-mass ports
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), grey);
      b.position.set(Math.cos(a) * 1.9, 0.5, Math.sin(a) * 1.9);
      this.backshell.add(b);
    }
    this.capsule.add(this.heatShield, this.backshell);
    // the glow of entry: a bright sheath at the shield and a long wake
    const gc = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,190,140,0.6)');
      gr.addColorStop(1, 'rgba(255,120,80,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: gc, color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.glow.scale.setScalar(14);
    this.glow.position.y = -1.4;
    this.capsule.add(this.glow);
    const wg = new THREE.ConeGeometry(2.6, 60, 32, 1, true);
    wg.translate(0, 30, 0);
    const wm = new THREE.ShaderMaterial({
      uniforms: { k: { value: 0 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y / 60.0; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float k; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(1.0 - abs(dot(vN, vV)), 1.5); float a = k * (1.0 - vY) * (1.0 - vY) * (0.25 + edge); gl_FragColor = vec4(vec3(2.4, 1.1, 0.7) * a, a); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.wake = new THREE.Mesh(wg, wm);
    this.wake.position.y = 0.5;
    this.capsule.add(this.wake);
    // the parachute: canopy (disk and band), 80 suspension lines to the confluence, the riser
    const canopy = new THREE.Group();
    const R = CHUTE_D / 2;
    const disk = new THREE.SphereGeometry(R, 80, 12, 0, Math.PI * 2, 0, 0.95);
    this.chuteCanopy = new THREE.Mesh(disk, new THREE.MeshStandardMaterial({ map: chuteTexture(), side: THREE.DoubleSide, roughness: 0.85, transparent: true, opacity: 0.97 }));
    this.chuteCanopy.position.y = -R * 0.55;
    canopy.add(this.chuteCanopy);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.82, R * 0.84, 2.6, 80, 1, true), new THREE.MeshStandardMaterial({ color: '#f2f0ea', side: THREE.DoubleSide, roughness: 0.85 }));
    band.position.y = -R * 0.55 - R * 0.95 * 0.55;
    canopy.add(band);
    const lines: number[] = [];
    const skirtY = band.position.y - 1.3;
    for (let i = 0; i < 80; i++) {
      const a = (i / 80) * Math.PI * 2;
      lines.push(Math.cos(a) * R * 0.84, skirtY, Math.sin(a) * R * 0.84, 0, skirtY - 28, 0);
    }
    lines.push(0, skirtY - 28, 0, 0, skirtY - 45, 0);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    canopy.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#d8d2c8', transparent: true, opacity: 0.8 })));
    canopy.position.y = 45 + 2.8 + 9;
    this.chute.add(canopy);
    this.chute.visible = false;
    this.capsule.add(this.chute);
    // the descent stage: a frame round three spherical tanks, eight Mars Landing Engines on four outriggers
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.35, 6), grey);
    frame.position.y = 0.2;
    this.stage.add(frame);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const tank = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), gold);
      tank.position.set(Math.cos(a) * 0.7, 0.55, Math.sin(a) * 0.7);
      this.stage.add(tank);
    }
    const radar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), white);
    radar.position.set(0, -0.02, 0.9);
    this.stage.add(radar);
    const plumeMat = new THREE.ShaderMaterial({
      uniforms: { k: { value: 0 }, t: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = -position.y / 3.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float k; uniform float t; varying float vY; void main(){ float a = k * (1.0 - vY) * (0.75 + 0.25 * sin(vY * 30.0 - t * 40.0)); gl_FragColor = vec4(vec3(1.3, 1.1, 1.6) * a, a); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.0), grey);
      arm.position.set(Math.cos(a) * 1.35, 0.15, Math.sin(a) * 1.35);
      arm.rotation.y = -a + Math.PI / 2;
      this.stage.add(arm);
      for (const off of [-0.18, 0.18]) {
        const ex = Math.cos(a) * 1.75 + Math.cos(a + Math.PI / 2) * off, ez = Math.sin(a) * 1.75 + Math.sin(a + Math.PI / 2) * off;
        const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.3, 16, 1, true), grey);
        eng.position.set(ex, 0.0, ez);
        eng.rotation.z = Math.cos(a) * 0.4;
        eng.rotation.x = -Math.sin(a) * 0.4;
        this.stage.add(eng);
        const pl = new THREE.Mesh(new THREE.ConeGeometry(0.12, 3, 16, 1, true).translate(0, -1.5, 0), plumeMat);
        pl.position.set(ex, -0.15, ez);
        pl.rotation.copy(eng.rotation);
        this.stage.add(pl);
        this.plumes.push(pl);
      }
    }
    // the bridles: three nylon lines and the umbilical, from the stage down to the rover
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 2 * 3), 3));
    this.bridles = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: '#e8e0d0' }));
    this.bridles.frustumCulled = false;
    this.stage.add(this.bridles);
    this.stage.visible = false;
    this.root.add(this.capsule, this.stage);
    site.add(this.root);
    // the rover rides folded inside: wheels up, arm stowed
    setArm(rover, [-Math.PI / 2, 0.12, Math.PI - 0.22, -0.9, 0]);
    this.plan();
    this.say('Entry interface: 125 km above Mars at 5.4 km/s, 15.5° below the horizon. The cruise stage is gone; the capsule turns its heat shield forward.', 'info');
    this.flashText = 'ENTRY INTERFACE';
  }

  private say(text: string, kind = ''): void {
    this.log.push({ text, kind });
  }
  takeLog(): Msg[] {
    const l = this.log;
    this.log = [];
    return l;
  }

  /** fly the entry and the parachute once ahead of time to see how far they carry, so it starts that far out */
  private plan(): void {
    const v0 = 5400, fpa = 15.5 * (Math.PI / 180);
    this.vx = v0 * Math.cos(fpa);
    this.vz = -v0 * Math.sin(fpa);
    this.s = 0;
    this.h = 125_000;
    this.mass = 3300;
    for (let i = 0; i < 40000; i++) {
      this.bank = this.h > 40_000 ? 0.4 : 1.1;
      this.entryStep(0.05);
      if (Math.hypot(this.vx, this.vz) / 240 < 1.75 && this.h < 14_000) break;
    }
    // under the canopy, down to the backshell separation (the ground here is near the datum)
    const h0 = this.groundLL(this.lat0, this.lon0);
    for (let i = 0; i < 40000 && this.h > h0 + 2100; i++) {
      const v = Math.hypot(this.vx, this.vz);
      const rho = marsDensity(this.h);
      const drag = (0.5 * rho * v * v * (1.68 * A_SHIELD + 0.6 * A_CHUTE)) / this.mass;
      this.vx += -drag * (this.vx / Math.max(1, v)) * 0.05;
      this.vz += (-drag * (this.vz / Math.max(1, v)) - G) * 0.05;
      this.s -= this.vx * 0.05;
      this.h += this.vz * 0.05;
    }
    // what it flew, plus the powered descent's own last few hundred metres
    const travelled = -this.s + 350;
    this.s = travelled;
    this.h = 125_000;
    this.vx = v0 * Math.cos(fpa);
    this.vz = -v0 * Math.sin(fpa);
    this.mass = 3300;
    this.heat = 0;
    this.gLoad = 0;
  }

  /** the capsule in the upper air: drag, a little lift banked to steer, gravity, the planet's curve */
  private entryStep(dt: number): void {
    const rho = marsDensity(this.h);
    const v = Math.hypot(this.vx, this.vz);
    const cd = 1.68;
    const drag = (0.5 * rho * v * v * cd * A_SHIELD) / this.mass;
    // lift: L/D 0.24, banked to keep the descent on profile
    const lift = drag * 0.24 * Math.cos(this.bank);
    const ux = this.vx / Math.max(1, v), uz = this.vz / Math.max(1, v);
    const R = MARS.R + this.h;
    const ax = -drag * ux - lift * uz;
    const az = -drag * uz + lift * ux - G + (this.vx * this.vx) / R;
    this.vx += ax * dt;
    this.vz += az * dt;
    this.s -= this.vx * dt * (MARS.R / R);
    this.h += this.vz * dt;
    this.gLoad = Math.hypot(drag, lift) / 9.81;
    // Sutton-Graves stagnation heating (Mars), kW/m², on the 1.125 m nose
    this.heat = (1.9e-4 * Math.sqrt(rho / 1.125) * v ** 3) / 1000;
  }

  /** the vehicle in the site frame (x east, y up, z south) */
  private sitePos(s: number, h: number, out: THREE.Vector3): THREE.Vector3 {
    // s metres short of the site along the approach, h above the datum; the planet curves away
    const th = s / MARS.R;
    const back = (MARS.R + h) * Math.sin(th);
    const up = (MARS.R + h) * Math.cos(th) - MARS.R;
    // (the site frame's y is relative to the site's own height)
    const h0 = this.groundLL(this.lat0, this.lon0);
    return out.set(-this.dir.x * back, up - h0, -this.dir.y * back);
  }

  private groundAt(p: THREE.Vector3): number {
    const lat = this.lat0 + (-p.z / MARS.R) * (180 / Math.PI);
    const lon = this.lon0 + (p.x / (MARS.R * Math.cos((this.lat0 * Math.PI) / 180))) * (180 / Math.PI);
    return this.groundLL(lat, lon) - (p.x * p.x + p.z * p.z) / (2 * MARS.R);
  }

  agl(): number {
    this.sitePos(this.s, this.h, this.pos);
    return this.pos.y - this.groundAt(this.pos);
  }

  step(dt: number): void {
    if (this.phase === 'down') {
      this.flyT += dt;
      this.pose(dt);
      return;
    }
    // small fixed steps for the physics
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let i = 0; i < n; i++) this.sub(dt / n);
    this.pose(dt);
  }

  private sub(dt: number): void {
    this.t += dt;
    const agl = this.agl();
    const v = Math.hypot(this.vx, this.vz);
    switch (this.phase) {
      case 'entry': {
        // bank: lift up while high and fast, rolling toward full lift-down as it slows (a simple profile)
        this.bank = this.h > 40_000 ? 0.4 : 1.1;
        this.entryStep(dt);
        if (this.heat > 300 && !this.flags.has('heat')) {
          this.flags.add('heat');
          this.say('Peak heating: the shield\'s face reaches about 1,300 °C. The plasma round the capsule blacks out the radio.', 'info');
        }
        if (this.gLoad > 8 && !this.flags.has('g')) {
          this.flags.add('g');
          this.say(`Peak deceleration: ${this.gLoad.toFixed(1)} g, ten times what the rover will ever feel on the ground.`, 'info');
          this.flashText = 'PEAK HEATING';
        }
        const mach = v / 240;
        if (mach < 1.75 && this.h < 14_000) {
          this.phase = 'chute';
          this.chuteK = 0;
          this.chute.visible = true;
          this.flashText = 'PARACHUTE';
          this.say(`Parachute deploy at Mach ${mach.toFixed(2)}, ${(this.h / 1000).toFixed(1)} km: the 21.5 m canopy fills in under a second. Its red and white gores spell "DARE MIGHTY THINGS" in binary.`, 'good');
          this.t0 = this.t;
        }
        break;
      }
      case 'chute': {
        this.chuteK = Math.min(1, this.chuteK + dt * 1.6);
        const rho = marsDensity(this.h);
        const cdA = 1.68 * A_SHIELD * (this.shieldFall ? 0.6 : 1) + 0.6 * A_CHUTE * this.chuteK;
        const drag = (0.5 * rho * v * v * cdA) / this.mass;
        this.vx += (-drag * (this.vx / Math.max(1, v))) * dt;
        this.vz += (-drag * (this.vz / Math.max(1, v)) - G) * dt;
        this.s -= this.vx * dt;
        this.h += this.vz * dt;
        this.gLoad = drag / 9.81;
        this.heat = 0;
        if (!this.shieldFall && this.t - this.t0 > 20) {
          this.mass -= 440;
          this.shieldFall = { obj: this.heatShield, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: 0.6 };
          this.flashText = 'HEAT SHIELD SEPARATION';
          this.say('Heat shield away. The radar locks on to the ground; the cameras start matching what they see to the onboard map: terrain-relative navigation.', 'info');
        }
        if (agl < 2100) {
          this.phase = 'backshell';
          this.t0 = this.t;
          this.mass = 2100;
          this.shellFall = { obj: this.backshell, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: 0.2 };
          this.stage.visible = true;
          this.throttle = 0;
          this.flashText = 'BACKSHELL SEPARATION';
          this.say(`Backshell separation at ${Math.round(agl)} m, ${Math.round(v * 3.6)} km/h. The descent stage drops free and lights its eight engines.`, 'good');
        }
        break;
      }
      case 'backshell':
      case 'powered': {
        // powered descent: a vertical speed that tapers with height, and null the drift to arrive over the site
        if (this.phase === 'backshell' && this.t - this.t0 > 1) this.phase = 'powered';
        const vzWant = -Math.max(0.75, Math.min(80, Math.sqrt(2 * 3 * Math.max(0, agl - 21)) + 0.75));
        const vxWant = Math.max(-25, Math.min(25, this.s * 0.08));
        const az = (vzWant - this.vz) * 1.2 + G;
        const ax = (vxWant - this.vx) * 0.6;
        const a = Math.min(24_500 / this.mass, Math.hypot(ax, az));
        const ang = Math.atan2(ax, az);
        this.throttle = this.phase === 'backshell' ? 0.3 : Math.max(0.2, Math.min(1, a / (24_500 / this.mass)));
        this.vx += a * Math.sin(ang) * dt;
        this.vz += (a * Math.cos(ang) - G) * dt;
        this.s -= this.vx * dt;
        this.h += this.vz * dt;
        this.mass -= (this.throttle * 24_500) / (2200 * 9.81) * dt;
        this.gLoad = a / 9.81;
        if (agl < 21.5 && this.phase === 'powered') {
          this.phase = 'skycrane';
          this.t0 = this.t;
          this.flashText = 'SKY CRANE';
          this.say('Sky crane: 21 m up, the rover drops away on three 7.6 m bridles and its wheels swing down and lock.', 'good');
        }
        break;
      }
      case 'skycrane': {
        // descend at 0.75 m/s while the bridles pay out; the rover touches down
        this.vz = -0.75;
        this.vx *= Math.exp(-dt * 2);
        this.h += this.vz * dt;
        this.s -= this.vx * dt;
        this.throttle = 0.55;
        this.bridle = Math.min(BRIDLE, this.bridle + dt * 0.75 * 1.9);
        if (agl - this.bridle - 0.6 < 0.02) {
          this.phase = 'flyaway';
          this.t0 = this.t;
          this.flashText = 'TOUCHDOWN';
          this.say(`Touchdown! ${Math.floor(this.t / 60)} min ${Math.round(this.t % 60)} s after entry. The bridles are cut; the descent stage flies off to crash a safe distance away.`, 'good');
        }
        break;
      }
      case 'flyaway': {
        this.throttle = 1;
        const tt = this.t - this.t0;
        const ax = 3, az = tt < 3 ? 6 : -1.5;
        this.vx += ax * dt;
        this.vz += (az + (tt < 3 ? 0 : 0) - (tt < 3 ? 0 : G * 0.6)) * dt;
        this.flyX += this.vx * dt;
        this.flyH += this.vz * dt;
        if (tt > 3 && this.flyH < 0) {
          this.phase = 'down';
          this.done = true;
          this.flyT = 0;
          this.say('The descent stage hits the ground 700 m away, as planned. Perseverance is on Mars.', 'good');
          this.flashText = 'PERSEVERANCE IS ON MARS';
        }
        break;
      }
    }
  }
  private flags = new Set<string>();
  private t0 = 0;
  private flyX = 0;
  private flyH = 0;

  /** place the models */
  private pose(dt: number): void {
    const p = this.sitePos(this.s, this.h, this.rootPos);
    const v = new THREE.Vector3(this.dir.x * this.vx, this.vz, this.dir.y * this.vx);
    const vv = v.length();
    // the capsule flies heat shield first (into the wind)
    if (this.phase === 'entry' || this.phase === 'chute') {
      this.root.position.copy(p);
      const into = vv > 1 ? v.clone().normalize() : new THREE.Vector3(0, -1, 0);
      this.capsule.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), into);
      // a gentle oscillation under the chute
      if (this.phase === 'chute') this.capsule.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(this.t * 1.3) * 0.08, 0, Math.sin(this.t * 0.9) * 0.06)));
      // the chute itself flies straight up the airflow
      this.chute.scale.set(0.3 + 0.7 * this.chuteK, 0.5 + 0.5 * this.chuteK, 0.3 + 0.7 * this.chuteK);
      this.chute.visible = this.phase === 'chute';
      const k = this.phase === 'entry' ? Math.min(1, this.heat / 250) : 0;
      (this.glow.material as THREE.SpriteMaterial).color.setRGB(3 * k, 1.6 * k, 0.9 * k);
      (this.wake.material as THREE.ShaderMaterial).uniforms.k.value = k * 0.8;
      (this.heatShield.material as THREE.MeshStandardMaterial).emissive.setRGB(1.6 * k, 0.5 * k, 0.15 * k);
      this.capsule.visible = true;
    }
    // falling pieces
    for (const f of [this.shieldFall, this.shellFall]) {
      if (!f) continue;
      if (f.obj.parent !== this.site) {
        f.obj.updateMatrixWorld();
        const wp = new THREE.Vector3();
        f.obj.getWorldPosition(wp);
        this.site.worldToLocal(wp);
        const wq = new THREE.Quaternion();
        f.obj.getWorldQuaternion(wq);
        const sq = new THREE.Quaternion();
        this.site.getWorldQuaternion(sq);
        this.site.add(f.obj);
        f.obj.position.copy(wp);
        f.obj.quaternion.copy(sq.invert().multiply(wq));
        f.p.copy(wp);
        f.v.copy(v);
      }
      const gy = this.groundAt(f.p);
      if (f.p.y > gy + 0.5) {
        const rho = marsDensity(Math.max(0, f.p.y));
        const sp = f.v.length();
        const drag = Math.min(sp / Math.max(dt, 1e-3), (0.5 * rho * sp * sp * 1.2 * A_SHIELD) / 440);
        if (sp > 0) f.v.addScaledVector(f.v, (-drag / sp) * dt);
        f.v.y -= G * dt;
        f.p.addScaledVector(f.v, dt);
        f.obj.position.copy(f.p);
        f.obj.rotateX(f.spin * dt);
      }
    }
    // the descent stage and the rover hanging under it
    if (this.phase === 'backshell' || this.phase === 'powered' || this.phase === 'skycrane' || this.phase === 'flyaway' || this.phase === 'down') {
      this.capsule.visible = false;
      const stagePos = this.phase === 'flyaway' || this.phase === 'down' ? this.flyPos(p) : p;
      this.root.position.copy(stagePos);
      this.stage.quaternion.setFromEuler(new THREE.Euler(this.phase === 'flyaway' ? -0.6 : Math.max(-0.3, Math.min(0.3, -this.vx * 0.01)), Math.atan2(this.dir.x, this.dir.y), 0));
      const k = this.phase === 'down' ? 0 : this.throttle;
      for (const pl of this.plumes) {
        const m = pl.material as THREE.ShaderMaterial;
        m.uniforms.k.value = k * (0.75 + Math.random() * 0.25);
        m.uniforms.t.value = this.t;
      }
      this.stage.visible = this.phase !== 'down' || this.flyT < 0.3;
      // the rover: tucked under the stage, then on the bridles, then on the ground
      const r = this.rover.group;
      r.visible = true;
      if (this.phase === 'flyaway' || this.phase === 'down') {
        // where it touched down
        if (!this.landed) {
          this.landed = p.clone();
          this.landed.y = this.groundAt(p);
        }
        r.position.copy(this.landed);
        r.rotation.set(0, Math.atan2(this.dir.x, this.dir.y) + Math.PI, 0);
      } else {
        const drop = this.phase === 'skycrane' ? this.bridle : 0;
        r.position.set(p.x, p.y - 0.9 - drop - 0.6, p.z);
        r.rotation.set(0, Math.atan2(this.dir.x, this.dir.y) + Math.PI, 0);
      }
      // the bridles
      const pa = this.bridles.geometry.attributes.position as THREE.BufferAttribute;
      const showB = this.phase === 'skycrane';
      this.bridles.visible = showB;
      if (showB) {
        const L = this.bridle + 0.4;
        const pts = [[0.5, 0, 0.3], [-0.5, 0, 0.3], [0, 0, -0.55], [0.1, 0, 0]];
        pts.forEach((q, i) => pa.setXYZ(i * 2, q[0], -0.1, q[2]) && 0);
        pts.forEach((q, i) => {
          pa.setXYZ(i * 2, q[0], -0.1, q[2]);
          pa.setXYZ(i * 2 + 1, q[0] * 0.8, -L, q[2] * 0.8);
        });
        pa.needsUpdate = true;
      }
    }
    void dt;
  }
  private landed: THREE.Vector3 | null = null;
  /** where the rover stands after touchdown (site east/north) and which way it faces */
  landedAt(): { e: number; n: number; heading: number } | null {
    if (!this.landed) return null;
    return { e: this.landed.x, n: -this.landed.z, heading: -(Math.atan2(this.dir.x, this.dir.y) + Math.PI) };
  }

  private flyPos(p: THREE.Vector3): THREE.Vector3 {
    if (!this.crash) this.crash = p.clone();
    const base = this.crash;
    const gy = this.groundAt(base);
    return new THREE.Vector3(base.x + this.dir.x * this.flyX, Math.max(gy + 0.5, base.y + this.flyH), base.z + this.dir.y * this.flyX);
  }

  // ---------------------------------------------------------------- for the mission
  focus(): THREE.Vector3 {
    if (this.phase === 'flyaway' || this.phase === 'down') return this.landed ? this.landed.clone().add(new THREE.Vector3(0, 1, 0)) : this.root.position.clone();
    return this.root.position.clone();
  }

  camera(yaw: number, pitch: number, idle: boolean): { cam: THREE.Vector3; look: THREE.Vector3 } {
    const f = this.focus();
    let dist = 30, py = pitch, yw = yaw + this.t * 0.02;
    if (this.phase === 'entry') dist = 24;
    if (this.phase === 'chute') {
      dist = this.shieldFall ? 60 : 85;
      py = idle ? 0.15 : pitch;
    }
    if (this.phase === 'backshell' || this.phase === 'powered') dist = 26;
    if (this.phase === 'skycrane') {
      dist = 22;
      py = idle ? 0.05 : pitch;
    }
    if (this.phase === 'flyaway' || this.phase === 'down') {
      dist = 16;
      py = idle ? 0.12 : pitch;
    }
    const look = f.clone();
    if (this.phase === 'chute') look.y += 20;
    if (this.phase === 'skycrane') look.y -= 4;
    const cp = Math.cos(py);
    const cam = look.clone().add(new THREE.Vector3(Math.sin(yw) * cp, Math.sin(py), Math.cos(yw) * cp).multiplyScalar(dist));
    const gy = this.groundAt(cam) + 1.2;
    if (cam.y < gy) cam.y = gy;
    return { cam, look };
  }

  engineLevel(): number {
    return this.phase === 'powered' || this.phase === 'skycrane' || this.phase === 'flyaway' ? this.throttle : 0;
  }
  engineAgl(): number {
    return Math.max(0, this.agl());
  }

  objective(): string {
    const names: Record<Phase, string> = {
      cruise: '',
      entry: 'Entry: the heat shield takes the heat while the capsule steers with its lift.',
      chute: 'Under the parachute: slowing from supersonic to under 100 m/s.',
      backshell: 'Backshell separation: the descent stage drops free.',
      powered: 'Powered descent: eight engines, steering to the safe spot terrain-relative navigation picked.',
      skycrane: 'Sky crane: lowering the rover on its bridles.',
      flyaway: 'Touchdown! The descent stage flies away.',
      down: 'Perseverance is on Mars. Press START DRIVING.',
    };
    return names[this.phase];
  }

  telemetry(): [string, string][] {
    const v = Math.hypot(this.vx, this.vz);
    const agl = this.agl();
    const rows: [string, string][] = [
      ['ENTRY + ', `${Math.floor(this.t / 60)}:${String(Math.floor(this.t % 60)).padStart(2, '0')}`],
      ['ALTITUDE', agl > 10_000 ? `${(agl / 1000).toFixed(1)} km` : `${Math.round(agl)} m`],
      ['SPEED', v > 1000 ? `${(v / 1000).toFixed(2)} km/s` : `${v.toFixed(1)} m/s`],
      ['VERTICAL', `${this.vz.toFixed(1)} m/s`],
      ['MACH', (v / 240).toFixed(2)],
      ['DECELERATION', `${this.gLoad.toFixed(1)} g`],
    ];
    if (this.phase === 'entry') rows.push(['HEATING', `${Math.round(this.heat)} kW/m²`]);
    if (this.phase === 'chute') rows.push(['PARACHUTE', '21.5 m DGB']);
    if (this.phase === 'powered' || this.phase === 'skycrane') rows.push(['THROTTLE', `${Math.round(this.throttle * 100)}%`]);
    if (this.phase === 'skycrane') rows.push(['BRIDLES', `${this.bridle.toFixed(1)} / 7.6 m`]);
    if (this.s > 1000 && this.phase === 'entry') rows.push(['TO GO', `${Math.round(this.s / 1000)} km`]);
    return rows;
  }

  dispose(): void {
    this.site.remove(this.root);
    for (const f of [this.shieldFall, this.shellFall]) if (f && f.obj.parent === this.site) this.site.remove(f.obj);
    this.rover.group.position.set(0, 0, 0);
  }
}
