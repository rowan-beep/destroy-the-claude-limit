// The moonwalk. After touchdown an astronaut climbs down the lander's ladder
// and the player takes over: walk, lope in the bounding Apollo gait, jump in
// one-sixth gravity, plant the flag, and climb back aboard to end the mission.
//
// The astronaut is a jointed figure in the white A7L suit (pelvis, torso with
// the life-support backpack and chest unit, helmet with the gold visor, upper
// and lower arms with gloves, thighs, shins and boots), posed every frame by
// hand-made procedural animation: a cycle for each gait driven by the distance
// covered, the vertical motion coming from real ballistic hops in lunar
// gravity, blended joint by joint so changes flow. Every footfall leaves a
// bootprint in the regolith and throws a spray of dust that arcs and falls
// cleanly, with no air to hold it up.
//
// Everything is placed in a frame fixed to the landing site (east, north and
// up at the ground under the lander), on the very ground the physics uses.

import * as THREE from 'three';
import { MOON, V3, add, cross, dot, fromMoonFixed, len, moonHeight, moonPos, norm, scale, sub, toMoonFixed } from './universe';
import { qrot, Q } from './flightSim';
import { buildSuit, loadSuit, Rig, SuitId } from './suits';

const G = 1.62;
const WALK = 1.15;
const LOPE = 2.6;
/** the lander's descent stage, which the astronaut cannot walk through */
const LM_R = 2.5;

type Mode = 'descend' | 'free' | 'plant' | 'climb' | 'done';

/** joint angles (radians) and body offsets for one pose */
interface Pose {
  pelvisY: number;
  lean: number;
  roll: number;
  hipL: number;
  kneeL: number;
  ankleL: number;
  hipR: number;
  kneeR: number;
  ankleR: number;
  shL: number;
  shLz: number;
  elL: number;
  shR: number;
  shRz: number;
  elR: number;
  head: number;
}
const REST: Pose = { pelvisY: 0.98, lean: 0.06, roll: 0, hipL: 0.05, kneeL: 0.12, ankleL: -0.05, hipR: 0.05, kneeR: 0.12, ankleR: -0.05, shL: 0.1, shLz: 0.28, elL: 0.55, shR: 0.1, shRz: 0.28, elR: 0.55, head: 0 };
const KEYS = Object.keys(REST) as (keyof Pose)[];

export interface MoonwalkInput {
  fwd: number;
  side: number;
  run: boolean;
  jump: boolean;
  use: boolean;
  camYaw: number;
}

export interface MoonwalkStats {
  walked: number;
  jumps: number;
  highest: number;
  flag: boolean;
  time: number;
}

export class Moonwalk {
  readonly group = new THREE.Group();
  mode: Mode = 'descend';
  /** what to tell the player right now */
  prompt = '';
  stats: MoonwalkStats = { walked: 0, jumps: 0, highest: 0, flag: false, time: 0 };
  // ---- the site frame (Moon-fixed): ground point under the lander and its east, north, up
  private O: V3;
  private E: V3;
  private N: V3;
  private U: V3;
  /** the ladder: its heading in the site plane (radians from north toward east) */
  private ladderHead: number;
  // ---- the astronaut's state, in the site plane: x east, z north, y up from the ground
  private x = 0;
  private z = 0;
  private y = 0;
  private vx = 0;
  private vz = 0;
  private vy = 0;
  private head = 0;
  private onGround = true;
  private crouch = 0;
  private phase = 0;
  private airT = 0;
  private landT = 1;
  private jumpWind = -1;
  /** a jump pressed mid-stride (in the air of a lope) waits for the next footfall */
  private jumpReq = 0;
  /** E pressed while in the air waits for the feet to touch down */
  private useReq = 0;
  private modeT = 0;
  private pose: Pose = { ...REST };
  // ---- the figure
  private rig!: Rig;
  private camLift = 0;
  suit: SuitId = loadSuit();
  // ---- the flag, bootprints and dust
  private flag: THREE.Group;
  private flagAt: { x: number; z: number } | null = null;
  private flagPole!: THREE.Object3D;
  private flagCloth!: THREE.Object3D;
  private prints: THREE.InstancedMesh;
  private printN = 0;
  private dust: { sp: THREE.Sprite; p: THREE.Vector3; v: THREE.Vector3; life: number; max: number }[] = [];
  private lastStepSide = 0;

  constructor(
    private time: () => number,
    /** Moon-fixed rest point of the lander's centre of mass, and its attitude */
    lmRest: V3,
    lmQ: Q,
    private origin: () => V3,
    glowTex: THREE.Texture,
  ) {
    const d = norm(lmRest);
    this.U = d;
    this.O = scale(d, MOON.R + moonHeight(d));
    let n = sub([0, 0, 1], scale(d, d[2]));
    n = len(n) > 1e-6 ? norm(n) : norm(cross(d, [1, 0, 0]));
    this.N = n;
    this.E = norm(cross(n, d));
    // the ladder is on the lander's first leg
    const legEci = qrot(lmQ, [Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)]);
    const legM = toMoonFixed(legEci, this.time());
    this.ladderHead = Math.atan2(dot(legM, this.E), dot(legM, this.N));
    this.buildRig();
    this.flag = this.buildFlag();
    this.flag.visible = false;
    this.group.add(this.flag);
    // bootprints: dark, ridged ovals pressed into the dust
    const pc = document.createElement('canvas');
    pc.width = 64;
    pc.height = 128;
    const g = pc.getContext('2d')!;
    const grd = g.createRadialGradient(32, 64, 4, 32, 64, 34);
    grd.addColorStop(0, 'rgba(0,0,0,0.75)');
    grd.addColorStop(0.75, 'rgba(0,0,0,0.5)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.scale(1, 1.9);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(32, 33.7, 30, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(8, 14 + i * 12, 48, 4);
    }
    const ptex = new THREE.CanvasTexture(pc);
    this.prints = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.17, 0.34).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: ptex, transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }),
      800,
    );
    this.prints.count = 0;
    this.prints.frustumCulled = false;
    this.group.add(this.prints);
    for (let i = 0; i < 70; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.9, 0.87, 0.82), transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false;
      this.group.add(sp);
      this.dust.push({ sp, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1 });
    }
    // start at the top of the ladder
    this.mode = 'descend';
    this.modeT = 0;
    this.head = this.ladderHead + Math.PI;
  }

  // ------------------------------------------------------------------ the site frame
  /** the surface point under (x, z) in the site plane, Moon-fixed, and the local up */
  private surface(x: number, z: number): { p: V3; up: V3 } {
    const dir = norm(add(this.O, add(scale(this.E, x), scale(this.N, z))));
    return { p: scale(dir, MOON.R + moonHeight(dir)), up: dir };
  }
  /** a Moon-fixed point to scene coordinates (relative to the floating origin) */
  private toScene(m: V3): THREE.Vector3 {
    const t = this.time();
    const w = add(moonPos(t), fromMoonFixed(m, t));
    const o = this.origin();
    return new THREE.Vector3(w[0] - o[0], w[1] - o[1], w[2] - o[2]);
  }
  /** an orientation in the site frame (heading from north toward east, local up) as a scene quaternion */
  private frameQ(heading: number, up: V3): THREE.Quaternion {
    const t = this.time();
    const f0 = add(scale(this.E, Math.sin(heading)), scale(this.N, Math.cos(heading)));
    const f = norm(sub(f0, scale(up, dot(f0, up))));
    const r = norm(cross(f, up));
    const fe = fromMoonFixed(f, t), ue = fromMoonFixed(up, t), re = fromMoonFixed(r, t);
    // model: +y up, +z forward, +x to its left
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...re).negate(), new THREE.Vector3(...ue), new THREE.Vector3(...fe));
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }
  /** the ladder's foot and top, in the site plane */
  private ladder(): { bx: number; bz: number; tx: number; tz: number } {
    const s = Math.sin(this.ladderHead), c = Math.cos(this.ladderHead);
    return { bx: s * 4.25, bz: c * 4.25, tx: s * 2.35, tz: c * 2.35 };
  }

  // ------------------------------------------------------------------ the camera
  /** where the camera sits and looks (scene coordinates), orbiting the astronaut */
  camera(yaw: number, pitch: number, dist: number): { pos: THREE.Vector3; look: THREE.Vector3; up: THREE.Vector3 } {
    const s = this.surface(this.x, this.z);
    const target = add(s.p, scale(s.up, this.y + 1.25));
    // a crater rim between the camera and the astronaut: rise over it, easing so the view never pops
    const at = (pp: number) => add(scale(this.E, Math.sin(yaw) * Math.cos(pp)), add(scale(this.N, Math.cos(yaw) * Math.cos(pp)), scale(s.up, Math.sin(pp))));
    const blocked = (pp: number) => {
      const d0 = at(pp);
      for (let i = 1; i <= 10; i++) {
        const q = add(target, scale(d0, (dist * i) / 10));
        if (len(q) - (MOON.R + moonHeight(norm(q))) < 0.35) return true;
      }
      return false;
    };
    const base = Math.max(-0.1, Math.min(1.2, pitch));
    let want = 0;
    while (want < 1.3 - base && blocked(base + want)) want += 0.06;
    this.camLift += (want - this.camLift) * (want > this.camLift ? 0.25 : 0.05);
    const p = Math.min(1.35, base + this.camLift);
    const dir = at(p);
    let cam = add(target, scale(dir, dist));
    // keep it above the ground
    const cd = norm(cam);
    const gh = MOON.R + moonHeight(cd) + 0.4;
    if (len(cam) < gh) cam = scale(cd, gh);
    const t = this.time();
    return { pos: this.toScene(cam), look: this.toScene(target), up: new THREE.Vector3(...fromMoonFixed(s.up, t)) };
  }

  // ------------------------------------------------------------------ simulation and animation
  update(dt: number, inp: MoonwalkInput): void {
    dt = Math.min(dt, 0.05);
    this.modeT += dt;
    this.stats.time += dt;
    const lad = this.ladder();
    let target: Pose = { ...REST };
    if (this.mode === 'descend' || this.mode === 'climb') {
      // on the ladder: hands and feet alternate rung by rung
      const dur = 4.2;
      const k = Math.min(1, this.modeT / dur);
      const u = this.mode === 'descend' ? 1 - k : k;
      this.x = lad.bx + (lad.tx - lad.bx) * u;
      this.z = lad.bz + (lad.tz - lad.bz) * u;
      this.y = 0.3 + 2.55 * u;
      this.head = this.ladderHead + Math.PI;
      const c = (u * 9) * Math.PI;
      target = { ...REST, pelvisY: 0.92, lean: 0.22, hipL: 0.6 + 0.5 * Math.max(0, Math.sin(c)), kneeL: 0.9 + 0.6 * Math.max(0, Math.sin(c)), hipR: 0.6 + 0.5 * Math.max(0, -Math.sin(c)), kneeR: 0.9 + 0.6 * Math.max(0, -Math.sin(c)), shL: -2.2 - 0.5 * Math.max(0, -Math.sin(c)), shLz: 0.15, elL: 0.5, shR: -2.2 - 0.5 * Math.max(0, Math.sin(c)), shRz: 0.15, elR: 0.5, head: -0.25 };
      if (k >= 1) {
        if (this.mode === 'descend') {
          // hop off the footpad onto the Moon
          this.mode = 'free';
          this.modeT = 0;
          const s = Math.sin(this.ladderHead), cc = Math.cos(this.ladderHead);
          this.x = lad.bx + s * 0.8;
          this.z = lad.bz + cc * 0.8;
          this.y = 0.35;
          this.vy = 0.6;
          this.onGround = false;
          this.head = this.ladderHead;
        } else this.mode = 'done';
      }
    } else if (this.mode === 'plant') {
      target = this.plantPose(this.modeT);
      if (this.modeT > 6.4) {
        this.mode = 'free';
        this.modeT = 0;
      }
    } else if (this.mode === 'free') {
      target = this.move(dt, inp);
    }
    // the prompt
    const nearLadder = Math.hypot(this.x - lad.bx, this.z - lad.bz) < 2.2;
    if (this.mode === 'free') {
      if (nearLadder && this.stats.flag) this.prompt = 'E · CLIMB ABOARD AND END THE MOONWALK';
      else if (nearLadder) this.prompt = 'E · CLIMB ABOARD (plant the flag first, or leave it)';
      else if (!this.stats.flag) this.prompt = Math.hypot(this.x, this.z) > 5 ? 'E · PLANT THE FLAG HERE' : 'Walk out a few metres to plant the flag';
      else this.prompt = 'Explore. Return to the ladder and press E to climb aboard';
      if (inp.use) this.useReq = 1.6;
      this.useReq = Math.max(0, this.useReq - dt);
      if (this.useReq > 0 && this.onGround) {
        this.useReq = 0;
        if (nearLadder) {
          // turn to the ladder and climb
          this.mode = 'climb';
          this.modeT = 0;
        } else if (!this.stats.flag && Math.hypot(this.x, this.z) > 5) {
          this.mode = 'plant';
          this.modeT = 0;
          this.vx = this.vz = 0;
          const s = Math.sin(this.head), c = Math.cos(this.head);
          this.flagAt = { x: this.x + s * 0.75, z: this.z + c * 0.75 };
          this.flag.visible = true;
        }
      }
    } else if (this.mode === 'climb') this.prompt = 'Climbing aboard…';
    else if (this.mode === 'plant') this.prompt = 'Planting the flag…';
    else if (this.mode === 'descend') this.prompt = 'Climbing down the ladder…';
    else this.prompt = '';
    // blend toward the target pose (faster for the quick gaits)
    const rate = this.mode === 'free' ? 12 : 8;
    const a = 1 - Math.exp(-rate * dt);
    for (const k of KEYS) this.pose[k] += (target[k] - this.pose[k]) * a;
    this.apply(dt);
    this.updateFlag();
    this.updateDust(dt);
  }

  /** walking, loping and jumping, with collisions; returns the pose to aim for */
  private move(dt: number, inp: MoonwalkInput): Pose {
    // where the stick points, relative to the camera
    const fx = -Math.sin(inp.camYaw), fz = -Math.cos(inp.camYaw);
    const rx = -fz, rz = fx;
    let mx = fx * inp.fwd + rx * inp.side, mz = fz * inp.fwd + rz * inp.side;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const moving = ml > 0.1;
    const speed = inp.run ? LOPE : WALK;
    // the suit is heavy and the ground slippery: velocity eases toward the wish, slower in the air
    const k = 1 - Math.exp(-(this.onGround ? 3.2 : 0.4) * dt);
    this.vx += (mx * speed - this.vx) * k;
    this.vz += (mz * speed - this.vz) * k;
    if (moving) {
      const want = Math.atan2(mx, mz);
      let d = want - this.head;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.head += d * Math.min(1, dt * 5);
    }
    const hs = Math.hypot(this.vx, this.vz);
    // jumping: a crouch to wind up, then off
    // (a lope's hop lasts about 1.4 s in the Moon's gravity: a press during it waits for the landing)
    if (inp.jump) this.jumpReq = 1.6;
    this.jumpReq = Math.max(0, this.jumpReq - dt);
    if (this.jumpReq > 0 && this.onGround && this.jumpWind < 0 && this.landT > 0.08) {
      this.jumpWind = 0;
      this.jumpReq = 0;
    }
    if (this.jumpWind >= 0) {
      this.jumpWind += dt;
      if (this.jumpWind > 0.28) {
        this.jumpWind = -1;
        this.vy = 2.6 + hs * 0.25;
        this.onGround = false;
        this.airT = 0;
        this.stats.jumps++;
        this.kick(1.2, 10);
      }
    }
    // the bounding lope: every landing springs into the next low hop
    if (this.onGround && inp.run && moving && hs > 1.4 && this.jumpWind < 0 && this.jumpReq <= 0 && this.landT > 0.12) {
      this.vy = 1.15;
      this.onGround = false;
      this.airT = 0;
      this.footfall(0, 0.6);
    }
    // ballistic in one-sixth gravity
    const ox = this.x, oz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // the lander's descent stage is in the way
    const r = Math.hypot(this.x, this.z);
    if (r < LM_R) {
      this.x *= LM_R / r;
      this.z *= LM_R / r;
    }
    // keep within the landing area
    const far = Math.hypot(this.x, this.z);
    if (far > 380) {
      this.x *= 380 / far;
      this.z *= 380 / far;
    }
    this.stats.walked += Math.hypot(this.x - ox, this.z - oz);
    if (!this.onGround) {
      this.airT += dt;
      this.vy -= G * dt;
      this.y += this.vy * dt;
      this.stats.highest = Math.max(this.stats.highest, this.y);
      if (this.y <= 0) {
        this.y = 0;
        const hard = Math.min(1, -this.vy / 3);
        this.vy = 0;
        this.onGround = true;
        this.landT = 0;
        this.crouch = 0.25 + hard * 0.7;
        this.footfall(0, 0.5 + hard);
        this.footfall(1, 0.5 + hard);
      }
    } else {
      this.y = 0;
      this.landT += dt;
    }
    this.crouch *= Math.exp(-dt * 5);
    // the gait cycle, driven by distance covered
    const stride = inp.run ? 1.9 : 0.95;
    const prevPhase = this.phase;
    this.phase += (hs / stride) * Math.PI * dt;
    const p = this.phase;
    let pose: Pose;
    if (this.jumpWind >= 0) {
      // winding up: sink, swing the arms back
      const w = Math.min(1, this.jumpWind / 0.28);
      pose = { ...REST, pelvisY: 0.98 - 0.32 * w, lean: 0.3 * w, hipL: 0.75 * w, kneeL: 1.3 * w, ankleL: -0.5 * w, hipR: 0.75 * w, kneeR: 1.3 * w, ankleR: -0.5 * w, shL: 0.7 * w, elL: 0.5, shR: 0.7 * w, elR: 0.5, head: -0.1 };
    } else if (!this.onGround && this.vy > 0.5 && !inp.run) {
      // a real jump, rising: stretched out, arms up
      pose = { ...REST, pelvisY: 1.0, lean: -0.05, hipL: -0.1, kneeL: 0.25, ankleL: 0.4, hipR: 0.15, kneeR: 0.5, ankleR: 0.35, shL: -1.6, shLz: 0.45, elL: 0.3, shR: -1.6, shRz: 0.45, elR: 0.3, head: 0.25 };
    } else if (!this.onGround && !inp.run) {
      // falling back: knees up, reaching for the ground
      const t = Math.min(1, -this.vy / 2);
      pose = { ...REST, pelvisY: 0.95, lean: 0.12, hipL: 0.55 + 0.2 * t, kneeL: 0.9, ankleL: -0.2, hipR: 0.45 + 0.2 * t, kneeR: 0.8, ankleR: -0.2, shL: -0.6 + 0.3 * t, shLz: 0.6, elL: 0.6, shR: -0.6 + 0.3 * t, shRz: 0.6, elR: 0.6, head: -0.15 };
    } else if (inp.run && (moving || !this.onGround)) {
      // the Apollo lope: a skipping gallop, legs nearly together, leaning into it
      const air = this.onGround ? 0 : Math.min(1, this.airT / 0.6);
      const rise = this.vy > 0 ? 1 : 0;
      pose = {
        ...REST,
        pelvisY: 0.98 - this.crouch * 0.3,
        lean: 0.28,
        roll: Math.sin(p) * 0.05,
        hipL: 0.15 + (rise ? -0.25 : 0.55) * air + this.crouch * 0.6,
        kneeL: 0.3 + (rise ? 0.2 : 0.65) * air + this.crouch * 1.1,
        ankleL: rise ? 0.4 * air : -0.15,
        hipR: 0.35 + (rise ? -0.05 : 0.7) * air + this.crouch * 0.6,
        kneeR: 0.55 + (rise ? 0.35 : 0.5) * air + this.crouch * 1.1,
        ankleR: rise ? 0.35 * air : -0.15,
        shL: -0.35 + Math.sin(p) * 0.2,
        shLz: 0.42,
        elL: 0.9,
        shR: -0.35 - Math.sin(p) * 0.2,
        shRz: 0.42,
        elR: 0.9,
        head: -0.12,
      };
    } else if (hs > 0.15) {
      // walking: deliberate, knees well bent, a little bounce in each step
      const sL = Math.sin(p), sR = Math.sin(p + Math.PI);
      const amp = Math.min(1, hs / WALK);
      pose = {
        ...REST,
        pelvisY: 0.97 - this.crouch * 0.25 + Math.abs(Math.cos(p)) * 0.035 * amp,
        lean: 0.12 * amp,
        roll: sL * 0.06 * amp,
        hipL: 0.1 + sL * 0.5 * amp,
        kneeL: 0.2 + Math.max(0, -Math.cos(p)) * 0.75 * amp + this.crouch,
        ankleL: -0.1 - sL * 0.2 * amp,
        hipR: 0.1 + sR * 0.5 * amp,
        kneeR: 0.2 + Math.max(0, Math.cos(p)) * 0.75 * amp + this.crouch,
        ankleR: -0.1 - sR * 0.2 * amp,
        shL: -sL * 0.35 * amp,
        shLz: 0.3,
        elL: 0.6,
        shR: -sR * 0.35 * amp,
        shRz: 0.3,
        elR: 0.6,
        head: -0.05,
      };
      // a footfall each half cycle
      const half = Math.floor(p / Math.PI), prevHalf = Math.floor(prevPhase / Math.PI);
      if (half !== prevHalf && this.onGround) this.footfall(half % 2, 0.35 * amp);
    } else {
      // standing: the suit's slow sway
      const b = Math.sin(this.stats.time * 1.3);
      pose = { ...REST, pelvisY: 0.98 - this.crouch * 0.3 + b * 0.006, kneeL: 0.12 + this.crouch, kneeR: 0.12 + this.crouch, hipL: 0.05 + this.crouch * 0.5, hipR: 0.05 + this.crouch * 0.5, head: Math.sin(this.stats.time * 0.4) * 0.15 };
    }
    return pose;
  }

  /** planting the flag: lift, drive it in twice, twist, unfurl, step back and salute */
  private plantPose(t: number): Pose {
    const lift = (a: number) => Math.max(0, Math.min(1, a));
    const up1 = lift(t / 0.6) * (1 - lift((t - 0.6) / 0.4));
    const up2 = lift((t - 1.0) / 0.5) * (1 - lift((t - 1.5) / 0.4));
    const hold = t < 2.2 ? 1 : 0;
    const both = Math.max(up1, up2);
    const drive = t < 2.2 ? 1 - both : 0;
    const salute = lift((t - 4.3) / 0.4) * (1 - lift((t - 5.9) / 0.4));
    const back = lift((t - 3.4) / 0.8);
    if (t > 3.4 && t < 4.2) {
      // step back to admire it
      const s = Math.sin(this.head), c = Math.cos(this.head);
      this.x -= s * 0.5 * (1 / 60) * 1.6;
      this.z -= c * 0.5 * (1 / 60) * 1.6;
    }
    return {
      ...REST,
      pelvisY: 0.98 - drive * 0.12,
      lean: 0.15 + drive * 0.15 - back * 0.08,
      hipL: 0.15 + drive * 0.3,
      kneeL: 0.2 + drive * 0.5,
      hipR: 0.05 + drive * 0.3,
      kneeR: 0.2 + drive * 0.5,
      shL: hold ? -1.0 - both * 1.3 : -salute * 0.2,
      shLz: hold ? 0.05 : 0.28,
      elL: hold ? 0.5 + drive * 0.4 : 0.55,
      shR: hold ? -0.9 - both * 1.3 : -salute * 1.25,
      shRz: hold ? 0.05 : 0.28 + salute * 0.9,
      elR: hold ? 0.5 + drive * 0.4 : 0.55 + salute * 1.9,
      head: 0.1 + salute * 0.15,
    };
  }

  /** pose the joints and place the figure on the ground */
  private apply(dt: number): void {
    void dt;
    const P = this.pose;
    const r = this.rig;
    r.pelvis.position.y = P.pelvisY;
    r.pelvis.rotation.set(P.lean, 0, P.roll);
    r.torso.rotation.set(P.lean * 0.4, 0, 0);
    r.head.rotation.set(P.head, 0, 0);
    // legs: hips pitch forward with +, knees bend back, ankles keep the boots flat
    r.hipL.rotation.set(-P.hipL - P.lean, 0, 0.04);
    r.kneeL.rotation.set(P.kneeL, 0, 0);
    r.ankleL.rotation.set(-(P.kneeL - P.hipL - P.lean) * 0.6 + P.ankleL, 0, 0);
    r.hipR.rotation.set(-P.hipR - P.lean, 0, -0.04);
    r.kneeR.rotation.set(P.kneeR, 0, 0);
    r.ankleR.rotation.set(-(P.kneeR - P.hipR - P.lean) * 0.6 + P.ankleR, 0, 0);
    // arms: shoulders pitch (negative raises them forward and up) and swing out; elbows bend
    r.shL.rotation.set(P.shL, 0, P.shLz);
    r.elL.rotation.set(-P.elL, 0, 0);
    r.shR.rotation.set(P.shR, 0, -P.shRz);
    r.elR.rotation.set(-P.elR, 0, 0);
    // the ground under the feet, and the drop of the leg's bend
    const s = this.surface(this.x, this.z);
    const legLen = 0.98;
    const bend = Math.min(P.kneeL, P.kneeR);
    const hipsDrop = legLen * (1 - Math.cos(Math.min(1.2, bend) * 0.5)) * 0.5;
    const base = add(s.p, scale(s.up, this.y - hipsDrop * 0.4));
    r.root.position.copy(this.toScene(base));
    r.root.quaternion.copy(this.frameQ(this.head, s.up));
  }

  private updateFlag(): void {
    if (!this.flagAt) return;
    const s = this.surface(this.flagAt.x, this.flagAt.z);
    this.flag.position.copy(this.toScene(s.p));
    this.flag.quaternion.copy(this.frameQ(this.head + Math.PI / 2, s.up));
    const t = this.mode === 'plant' ? this.modeT : 99;
    // the pole goes in a bit with each drive, then the flag unfurls along its bar
    const depth = t < 0.6 ? 0.9 : t < 1.0 ? 0.9 - 0.45 * ((t - 0.6) / 0.4) : t < 1.6 ? 0.45 : t < 2.0 ? 0.45 - 0.35 * ((t - 1.6) / 0.4) : 0.1;
    const lifted = t < 0.6 ? (t / 0.6) * 0.4 : t < 1.6 && t > 1.0 ? ((t - 1.0) / 0.6) * 0.25 : 0;
    this.flagPole.position.y = -depth + lifted;
    const unfurl = Math.max(0.02, Math.min(1, (t - 2.5) / 0.9));
    this.flagCloth.scale.set(unfurl, 1, 1);
    if (t >= 2.5 && !this.stats.flag) {
      this.stats.flag = true;
      this.kick(0.6, 8, this.flagAt.x, this.flagAt.z);
    }
  }

  // ------------------------------------------------------------------ prints and dust
  /** a boot comes down: a print in the dust and a spray of regolith */
  private footfall(side: number, strength: number): void {
    if (side === this.lastStepSide && strength < 0.5) side = 1 - side;
    this.lastStepSide = side;
    const s = Math.sin(this.head), c = Math.cos(this.head);
    const off = side ? -0.13 : 0.13;
    const px = this.x + c * off, pz = this.z - s * off;
    const sf = this.surface(px, pz);
    if (this.printN < 800) {
      const q = this.frameQ(this.head, sf.up);
      const pos = this.toScene(add(sf.p, scale(sf.up, 0.012)));
      // stored relative to the site, refreshed as the floating origin moves
      this.printPts.push({ x: px, z: pz, head: this.head });
      const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1));
      this.prints.setMatrixAt(this.printN++, m);
      this.prints.count = this.printN;
      this.prints.instanceMatrix.needsUpdate = true;
    }
    this.kick(strength, Math.round(4 + strength * 6), px, pz);
  }
  private printPts: { x: number; z: number; head: number }[] = [];

  private kick(strength: number, n: number, x = this.x, z = this.z): void {
    for (let i = 0; i < n; i++) {
      const d = this.dust.find((q) => q.life <= 0);
      if (!d) return;
      const a = Math.random() * Math.PI * 2;
      const sp = (0.4 + Math.random()) * strength;
      d.p.set(x + Math.cos(a) * 0.1, 0.05, z + Math.sin(a) * 0.1);
      d.v.set(Math.cos(a) * sp + this.vx * 0.3, (0.6 + Math.random() * 1.1) * strength, Math.sin(a) * sp + this.vz * 0.3);
      d.max = d.life = 0.8 + Math.random() * 1.2;
    }
  }

  private updateDust(dt: number): void {
    for (const d of this.dust) {
      if (d.life <= 0) {
        d.sp.visible = false;
        continue;
      }
      d.life -= dt;
      // no air: every grain flies a clean arc and drops
      d.v.y -= G * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < 0) {
        d.p.y = 0;
        d.v.set(0, 0, 0);
        d.life = Math.min(d.life, 0.15);
      }
      const s = this.surface(d.p.x, d.p.z);
      d.sp.position.copy(this.toScene(add(s.p, scale(s.up, d.p.y + 0.05))));
      const k = d.life / d.max;
      const size = 0.1 + (1 - k) * 0.35;
      d.sp.scale.set(size, size, 1);
      (d.sp.material as THREE.SpriteMaterial).opacity = 0.7 * k;
      d.sp.visible = true;
    }
  }

  /** the floating origin moves with the lander as the Moon turns: keep the prints where they were pressed */
  refresh(): void {
    this.printPts.forEach((pp, i) => {
      const sf = this.surface(pp.x, pp.z);
      const m = new THREE.Matrix4().compose(this.toScene(add(sf.p, scale(sf.up, 0.012))), this.frameQ(pp.head, sf.up), new THREE.Vector3(1, 1, 1));
      this.prints.setMatrixAt(i, m);
    });
    if (this.printPts.length) this.prints.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the figure
  private buildRig(): void {
    this.rig = buildSuit(this.suit);
    this.group.add(this.rig.root);
  }

  /** swap into another suit without breaking stride */
  setSuit(id: SuitId): void {
    if (id === this.suit) return;
    const old = this.rig.root;
    this.group.remove(old);
    old.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.suit = id;
    this.buildRig();
    this.apply(0);
  }

  private buildFlag(): THREE.Group {
    const g = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = 190;
    c.height = 100;
    const x = c.getContext('2d')!;
    for (let i = 0; i < 13; i++) {
      x.fillStyle = i % 2 ? '#f4f3ef' : '#b22234';
      x.fillRect(0, (i * 100) / 13, 190, 100 / 13 + 1);
    }
    x.fillStyle = '#3c3b6e';
    x.fillRect(0, 0, 76, 54);
    x.fillStyle = '#f4f3ef';
    for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) x.fillRect(4 + k * 12.5 + (r % 2 ? 6 : 0), 3 + r * 5.6, 2.4, 2.4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pole = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#d8d8d4', metalness: 0.8, roughness: 0.3 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.5, 8), metal);
    rod.position.y = 1.25;
    rod.castShadow = true;
    pole.add(rod);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.95, 6), metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0.475, 2.42, 0);
    pole.add(bar);
    const cloth = new THREE.Group();
    const geo = new THREE.PlaneGeometry(0.92, 0.6, 14, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 7) * 0.025);
    geo.translate(0.46, 0, 0);
    const cm = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    cm.castShadow = true;
    cm.position.y = 2.11;
    cloth.add(cm);
    pole.add(cloth);
    g.add(pole);
    this.flagPole = pole;
    this.flagCloth = cloth;
    return g;
  }
}
