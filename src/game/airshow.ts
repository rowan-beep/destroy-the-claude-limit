// Airshow display flying: each jet's display routine, flown on a scripted path in
// front of the crowd. The path is worked out once, ahead of time, by a small
// "turtle" that flies the manoeuvres (takeoff roll, rotation, pulls into the
// vertical, loops, level turns, rolls, high-alpha passes, a cobra for the jets
// with thrust vectoring, the approach and the landing), and repositioning legs
// between them that turn smoothly onto the next pass (Dubins paths). The jet's
// attitude comes from the forces along the path: the lift vector points where the
// path is curving, so it banks into turns, goes inverted over the top of a loop and
// rolls out afterwards at a real roll rate. Playback drives the flight model's
// state directly (position, attitude, speed, angle of attack, load factor, gear,
// throttle and afterburner), so every effect the game already draws shows up:
// afterburner flames, the vapour cone near Mach 1, wingtip vortices and wing vapour
// in hard pulls, the gear and control surfaces moving.
//
// Local frame: x along the runway (the display axis), y up from the field, z to the
// right of the runway heading. The crowd stands at z = CROWD_Z, on the left.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import { AircraftType, SPECS } from '../aircraft/specs';
import type { AirfieldDef } from '../world/islands';
import { surfaceHeight } from '../world/terrain';
import { G0 } from '../core/constants';

const D2R = Math.PI / 180;
/** where the crowd line is, metres to the side of the runway centreline (left of it) */
export const CROWD_Z = -230;
/** the display line the passes are flown along */
const LINE_Z = 70;

/** one moment of a display */
export interface DisplaySample {
  t: number;
  /** position (local) */
  p: [number, number, number];
  /** the nose and the top of the jet (local, unit) */
  nose: [number, number, number];
  up: [number, number, number];
  /** the flight path direction (local, unit) */
  dir: [number, number, number];
  v: number;
  aoa: number;
  nz: number;
  rpm: number;
  ab: number;
  gear: number;
  brake: number;
  /** thrust-vectoring nozzle pitch (rad) */
  tvc: number;
  onGround: boolean;
  /** the manoeuvre, for the programme board */
  label: string;
}

export interface DisplayRoutine {
  type: AircraftType;
  samples: DisplaySample[];
  duration: number;
  /** the manoeuvres in order, with when each starts (for the programme) */
  items: { label: string; t: number }[];
}

// ------------------------------------------------------------------ the turtle

interface Opts {
  v?: number;
  accel?: number;
  turn?: number;
  pitch?: number;
  roll?: number;
  aoa?: number | null;
  ab?: number;
  rpm?: number;
  gear?: number;
  brake?: number;
  tvc?: number;
  label?: string;
  ground?: boolean;
}

class Turtle {
  t = 0;
  x = 0;
  y = 0;
  z = 0;
  /** heading (0 = +x, turning right increases it) and flight path angle */
  psi = 0;
  gam = 0;
  v = 0;
  vTarget = 0;
  accel = 6;
  ab = 0;
  rpm = 0.7;
  gear = 1;
  gearTarget = 1;
  brake = 0;
  aoaSet: number | null = null;
  aoaNow = 0;
  tvc = 0;
  rollRate = 0;
  label = '';
  ground = true;
  /** commanded roll accumulated (rad) */
  out: { t: number; p: [number, number, number]; v: number; aoa: number | null; ab: number; rpm: number; gear: number; brake: number; tvc: number; roll: number; ground: boolean; label: string }[] = [];
  private rollAcc = 0;
  readonly dt = 0.05;
  /** the approach and landing fly down to the runway: no terrain floor */
  noFloor = false;
  /** the lowest the jet may go (m above the field) at a point, given the terrain */
  floor: (x: number, z: number) => number = () => -1e9;

  dirVec(): [number, number, number] {
    const c = Math.cos(this.gam);
    return [c * Math.cos(this.psi), Math.sin(this.gam), c * Math.sin(this.psi)];
  }

  private record(): void {
    this.out.push({ t: this.t, p: [this.x, this.y, this.z], v: this.v, aoa: this.aoaSet, ab: this.ab, rpm: this.rpm, gear: this.gear, brake: this.brake, tvc: this.tvc, roll: this.rollAcc, ground: this.ground, label: this.label });
  }

  /** fly for a while with the given rates (turn and pitch in deg/s) */
  fly(sec: number, o: Opts = {}): void {
    this.apply(o);
    const n = Math.max(1, Math.round(sec / this.dt));
    for (let i = 0; i < n; i++) this.step(o.turn ?? 0, o.pitch ?? 0, o.roll ?? 0);
  }

  private apply(o: Opts): void {
    if (o.v !== undefined) this.vTarget = o.v;
    if (o.accel !== undefined) this.accel = o.accel;
    if (o.ab !== undefined) this.ab = o.ab;
    if (o.rpm !== undefined) this.rpm = o.rpm;
    if (o.gear !== undefined) this.gearTarget = o.gear;
    if (o.brake !== undefined) this.brake = o.brake;
    if (o.aoa !== undefined) this.aoaSet = o.aoa;
    if (o.tvc !== undefined) this.tvc = o.tvc;
    if (o.label !== undefined) this.label = o.label;
    if (o.ground !== undefined) this.ground = o.ground;
  }

  step(turnDps: number, pitchDps: number, rollDps: number): void {
    const dt = this.dt;
    const dv = this.vTarget - this.v;
    this.v += Math.max(-this.accel * dt, Math.min(this.accel * dt, dv));
    this.psi += turnDps * D2R * dt;
    this.gam += pitchDps * D2R * dt;
    this.rollAcc += rollDps * D2R * dt;
    this.gear += Math.max(-dt / 4, Math.min(dt / 4, this.gearTarget - this.gear));
    const d = this.dirVec();
    this.x += d[0] * this.v * dt;
    this.y += d[1] * this.v * dt;
    this.z += d[2] * this.v * dt;
    // (never into the hills: look ahead along the path and climb away from rising ground)
    if (!this.ground && !this.noFloor) {
      const ch = Math.cos(this.gam);
      let fl = this.floor(this.x, this.z);
      for (const k of [1.5, 3, 5]) fl = Math.max(fl, this.floor(this.x + Math.cos(this.psi) * ch * this.v * k, this.z + Math.sin(this.psi) * ch * this.v * k));
      // (pull up at no more than 4 g)
      if (this.y < fl && this.gam < 0.35) this.gam = Math.min(0.35, this.gam + Math.min(18 * D2R, (4 * G0) / Math.max(50, this.v)) * dt);
    }
    this.t += dt;
    this.record();
  }

  /** a level turn through an angle (deg, + right) at a radius */
  turn(deg: number, radius: number, o: Opts = {}): void {
    this.apply(o);
    let left = Math.abs(deg);
    while (left > 1e-6) {
      const rate = (this.v / Math.max(50, radius)) / D2R;
      const d = Math.min(left, rate * this.dt);
      this.step(Math.sign(deg) * d / this.dt, 0, o.roll ?? 0);
      left -= d;
    }
  }

  /** pull (or push, negative) the path through an angle (deg) at a radius */
  pull(deg: number, radius: number, o: Opts = {}): void {
    this.apply(o);
    let left = Math.abs(deg);
    while (left > 1e-6) {
      const rate = (this.v / Math.max(50, radius)) / D2R;
      const d = Math.min(left, rate * this.dt);
      this.step(0, Math.sign(deg) * d / this.dt, o.roll ?? 0);
      left -= d;
    }
    // over the top: a reversed heading, the right way up again
    if (Math.cos(this.gam) < -1e-6) {
      this.psi += Math.PI;
      this.gam = Math.PI - this.gam;
    }
    this.gam = Math.atan2(Math.sin(this.gam), Math.cos(this.gam));
  }

  /** straight on for a distance */
  straight(dist: number, o: Opts = {}): void {
    this.apply(o);
    let s = 0;
    while (s < dist) {
      this.step(0, 0, o.roll ?? 0);
      s += this.v * this.dt;
    }
  }

  /** the height a straight pass holds (null: just fly straight on) */
  holdY: number | null = null;

  /** straight on until x passes a value (holding the pass height, if set) */
  until(x: number, o: Opts = {}): void {
    this.apply(o);
    // (on until the mark is behind, along the way the jet is going; at once if it already is)
    let guard = 0;
    while ((x - this.x) * Math.cos(this.psi) > 0 && guard++ < 20000) {
      let q = 0;
      if (this.holdY !== null && !this.ground) {
        const g = Math.max(-0.2, Math.min(0.2, Math.atan2(this.holdY - this.y, this.v * 4)));
        const lim = ((2 * G0) / Math.max(50, this.v)) / D2R;
        q = Math.max(-lim, Math.min(lim, (g - this.gam) / D2R / 1.2));
      }
      this.step(0, q, o.roll ?? 0);
    }
  }

  /** level the path out smoothly (to a flight path angle, deg) */
  levelTo(gamDeg: number, rateDps: number, o: Opts = {}): void {
    this.apply(o);
    const target = gamDeg * D2R;
    let guard = 0;
    while (Math.abs(this.gam - target) > 1e-3 && guard++ < 2000) {
      const d = Math.max(-rateDps * D2R * this.dt, Math.min(rateDps * D2R * this.dt, target - this.gam));
      this.step(0, d / D2R / this.dt, 0);
    }
  }

  /**
   * Fly to a point (x, z) at a height, arriving on a heading (rad): the shortest path of
   * a turn, a straight and a turn at the given radius (a Dubins path), climbing or
   * descending smoothly on the way.
   */
  route(tx: number, tz: number, tpsi: number, ty: number, radius: number, o: Opts = {}): void {
    this.apply(o);
    // level off first if climbing or diving steeply
    if (Math.abs(this.gam) > 0.35) this.levelTo(Math.sign(this.gam) * 10, 12);
    const plan = dubins(this.x, this.z, this.psi, tx, tz, tpsi, radius);
    const total = plan.reduce((s, p) => s + (p.kind === 'S' ? p.len : p.ang * radius), 0);
    const y0 = this.y;
    let done = 0;
    const climbTo = () => {
      // the height wanted at this distance along: a smooth S from start to end
      const u = Math.min(1, (done + this.v * 3) / Math.max(1, total));
      const want = y0 + (ty - y0) * (u * u * (3 - 2 * u));
      const g = Math.max(-0.42, Math.min(0.42, Math.atan2(want - this.y, this.v * 3)));
      // (pitching at no more than about 2.5 g either way)
      const lim = Math.min(25, ((2.5 * G0) / Math.max(50, this.v)) / D2R);
      return Math.max(-lim, Math.min(lim, (g - this.gam) / D2R / 1.5));
    };
    for (const seg of plan) {
      if (seg.kind === 'S') {
        let s = 0;
        while (s < seg.len) {
          this.step(0, climbTo(), 0);
          const h = this.v * Math.cos(this.gam) * this.dt;
          s += h;
          done += h;
        }
      } else {
        let left = seg.ang;
        while (left > 1e-6) {
          // (the turn's radius over the ground, climbing or not)
          const rate = (this.v * Math.cos(this.gam)) / radius;
          const d = Math.min(left, rate * this.dt);
          this.step((seg.kind === 'R' ? d : -d) / D2R / this.dt, climbTo(), 0);
          left -= d;
          done += d * radius;
        }
      }
    }
    // (land exactly on the line and heading for the pass, flying level)
    this.psi = tpsi;
    if (Math.abs(this.gam) > 1e-3) this.levelTo(0, 8);
  }
}

// ------------------------------------------------------------------ Dubins paths

type DubinsSeg = { kind: 'L' | 'R'; ang: number } | { kind: 'S'; len: number; ang?: never };

function mod2pi(a: number): number {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

/** the shortest turn-straight-turn path between two poses (heading 0 = +x, + turns toward +z) */
export function dubins(x0: number, z0: number, h0: number, x1: number, z1: number, h1: number, R: number): DubinsSeg[] {
  let best: DubinsSeg[] | null = null;
  let bestLen = Infinity;
  for (const a of ['L', 'R'] as const) {
    for (const b of ['L', 'R'] as const) {
      // turning right (toward +z) the centre is to the right of the heading
      const s0 = a === 'R' ? 1 : -1, s1 = b === 'R' ? 1 : -1;
      const c0x = x0 - s0 * Math.sin(h0) * R, c0z = z0 + s0 * Math.cos(h0) * R;
      const c1x = x1 - s1 * Math.sin(h1) * R, c1z = z1 + s1 * Math.cos(h1) * R;
      const dx = c1x - c0x, dz = c1z - c0z;
      const D = Math.hypot(dx, dz);
      let tang: number;
      let straight: number;
      if (a === b) {
        tang = Math.atan2(dz, dx);
        straight = D;
      } else {
        if (D < 2 * R) continue;
        const base = Math.atan2(dz, dx);
        const off = Math.asin((2 * R) / D);
        tang = a === 'R' ? base + off : base - off;
        straight = Math.sqrt(D * D - 4 * R * R);
      }
      const turn = (from: number, to: number, side: 'L' | 'R') => (side === 'R' ? mod2pi(to - from) : mod2pi(from - to));
      const a0 = turn(h0, tang, a), a1 = turn(tang, h1, b);
      const len = (a0 + a1) * R + straight;
      if (len < bestLen) {
        bestLen = len;
        best = [{ kind: a, ang: a0 }, { kind: 'S', len: straight }, { kind: b, ang: a1 }];
      }
    }
  }
  return best ?? [{ kind: 'S', len: Math.hypot(x1 - x0, z1 - z0) }];
}

// ------------------------------------------------------------------ the routines

export interface DisplayInfo {
  /** what this jet's display shows, for the spotter's checklist */
  shots: string[];
}

/** build a jet's display at a field */
export function buildDisplay(type: AircraftType, f: AirfieldDef): DisplayRoutine {
  const s = SPECS[type];
  const tu = new Turtle();
  const gh = s.gear.height;
  // the terrain round the field: keep 90 m clear of it (and the sea at 0)
  tu.floor = (x, z) => {
    const wx = f.x + f.ax * x + f.rxv * z, wz = f.z + f.az * x + f.rzv * z;
    const overField = Math.abs(x) < 5000 && Math.abs(z) < 1000;
    return Math.max(surfaceHeight(wx, wz), 0) - f.elev + (overField ? 30 : 80);
  };
  const half = f.length / 2;
  const heavy = type === 'SR71' || type === 'MIG31';
  const tvc = (s.tvcDeg ?? 0) > 0;
  const fast = heavy ? 300 : 330;
  // ---- line up and take off
  tu.x = -half + 160;
  tu.y = gh;
  tu.z = 0;
  tu.psi = 0;
  tu.gam = 0;
  tu.v = 0;
  tu.vTarget = 0;
  tu.fly(4, { label: 'LINE UP', rpm: 0.65, ab: 0, gear: 1, ground: true });
  tu.fly(1.5, { label: 'TAKEOFF', rpm: 1, ab: 1, v: 0, accel: 0 });
  const vr = heavy ? 95 : 78;
  tu.vTarget = vr;
  tu.accel = heavy ? 6.5 : 9;
  while (tu.v < vr - 0.5) tu.step(0, 0, 0);
  // rotate: the nose comes up, then the wheels leave the runway
  tu.fly(1.2, { aoa: 10, v: vr + 15, accel: 4 });
  tu.ground = false;
  tu.pull(heavy ? 8 : 12, 900, { v: 120, accel: 5 });
  tu.fly(2.5, { gear: 0, aoa: null });
  if (heavy) {
    // a long, low acceleration, then a steady climb out
    tu.levelTo(3, 3);
    tu.fly(10, { v: 200, accel: 6 });
    tu.pull(17, 1500, { label: 'CLIMB OUT' });
    tu.fly(8, { rpm: 1, ab: 1 });
  } else {
    // low along the runway, then straight up
    tu.levelTo(2, 4);
    tu.until(-150, { v: 165, accel: 7, label: 'TAKEOFF' });
    tu.pull(80, 650, { label: 'VERTICAL CLIMB', ab: 1 });
    tu.fly(6, { v: 120, accel: 4 });
    // over the top and roll out: an Immelmann
    tu.pull(100, 700, { label: 'IMMELMANN', v: 110, ab: 1 });
  }
  const R = heavy ? 2200 : 1500;
  const rep = { label: 'REPOSITIONING', v: heavy ? 210 : 255, accel: 7, ab: 0, rpm: 0.92, aoa: null } as Opts;
  // ---- the high-speed pass, left to right
  tu.route(-4000, LINE_Z, 0, 40, R, rep);
  tu.holdY = 40;
  tu.until(-3000, { v: fast, ab: 1, rpm: 1 });
  tu.until(heavy ? 3000 : -100, { label: 'HIGH-SPEED PASS', v: fast, ab: 1 });
  if (!heavy) {
    // ---- straight up out of the pass, just past the crowd, and over the top: back the other way, high
    tu.holdY = null;
    // (into the vertical at about 7 g)
    tu.pull(90, (tu.v * tu.v) / (7 * G0), { label: 'VERTICAL', ab: 1 });
    tu.fly(4, { v: 150, accel: 8 });
    tu.pull(90, 700, { label: 'HALF LOOP', v: 130 });
    // ---- the rolling pass, left to right
    tu.route(-3400, LINE_Z, 0, 130, R, rep);
    tu.holdY = 130;
    tu.until(-500, { label: 'ROLLING PASS', v: 200, accel: 6, rpm: 0.9 });
    tu.fly(4.4, { roll: 360 / 1.1 });
    tu.until(2600, { roll: 0 });
    // ---- the max-g turn in front of the crowd, right to left
    tu.route(3600, LINE_Z, Math.PI, 160, R, rep);
    tu.holdY = 160;
    tu.until(600, { label: 'MAX-G TURN', v: 215, accel: 6 });
    const n = 7.2;
    tu.turn(-360, (215 * 215) / (G0 * Math.sqrt(n * n - 1)), { ab: 1, rpm: 1 });
    tu.until(-2600, { ab: 0, rpm: 0.9 });
    // ---- the slow, high-alpha pass, left to right (a cobra for the thrust-vectoring jets)
    tu.route(-3800, LINE_Z, 0, 100, R, { ...rep, v: 170 });
    tu.holdY = 100;
    tu.until(-1500, { label: 'HIGH-ALPHA PASS', v: 72, accel: 7, aoa: 24, rpm: 0.95, ab: 0.4, gear: type === 'FA18EF' ? 1 : 0 });
    if (tvc) {
      tu.until(-350, {});
      tu.fly(1.3, { label: 'COBRA', aoa: 88, v: 55, accel: 14, tvc: -0.25, ab: 1 });
      tu.fly(1.2, {});
      tu.fly(1.4, { aoa: 24, tvc: 0 });
    }
    tu.until(2400, { aoa: 24, v: 72, ab: 0.4 });
    tu.holdY = null;
    tu.fly(4, { aoa: null, v: 160, accel: 6, ab: 1, gear: 0, label: 'REPOSITIONING' });
  } else {
    // ---- the big jets: a climbing turn away and a second, slower pass right to left
    tu.holdY = null;
    tu.pull(25, 2500, { label: 'PULL UP', ab: 1 });
    tu.fly(6, { v: 240 });
    tu.route(4200, LINE_Z, Math.PI, 120, R, rep);
    tu.holdY = 120;
    tu.until(-2800, { label: 'FLYPAST', v: 150, accel: 4, aoa: 8, gear: 1, rpm: 0.85 });
    tu.fly(4, { gear: 0, aoa: null, v: 200 });
  }
  // ---- the landing, right to left: a long final at 3 degrees, flare, touchdown, rollout
  const vApp = heavy ? 88 : 72;
  const tdX = half - 350;
  const finalLen = 4200;
  tu.holdY = null;
  tu.route(tdX + finalLen, 0, Math.PI, Math.tan(3 * D2R) * finalLen + gh, R, { ...rep, v: 150 });
  tu.noFloor = true;
  tu.levelTo(-3, 2, { label: 'LANDING', v: vApp, accel: 3, gear: 1, aoa: heavy ? 9 : 11, rpm: 0.7 });
  // glide down the slope to the flare height
  let guard = 0;
  while (tu.y > gh + 9 && guard++ < 20000) tu.step(0, 0, 0);
  tu.levelTo(-0.6, 1.4, { aoa: heavy ? 11 : 13, rpm: 0.55 });
  guard = 0;
  while (tu.y > gh + 0.05 && guard++ < 4000) tu.step(0, 0, 0);
  tu.y = gh;
  tu.gam = 0;
  tu.ground = true;
  tu.fly(1.4, { aoa: 9, v: vApp - 5, accel: 2, rpm: 0.5 });
  tu.fly(2, { aoa: 0, brake: 1, rpm: 0.45 });
  tu.vTarget = 18;
  tu.accel = 3;
  guard = 0;
  while (tu.v > 19 && guard++ < 20000) tu.step(0, 0, 0);
  tu.fly(6, { label: 'TAXI IN', v: 9, accel: 2, brake: 0, rpm: 0.55 });
  tu.turn(-90, 30, { v: 7 });
  tu.fly(6, { v: 5 });

  return finish(type, tu, s.tvcDeg ?? 0);
}

/** the attitude at every sample, from the forces along the path */
function finish(type: AircraftType, tu: Turtle, tvcDeg: number): DisplayRoutine {
  const o = tu.out;
  const n = o.length;
  const dt = tu.dt;
  const samples: DisplaySample[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const vel = (i: number) => {
    const a = o[Math.max(0, i - 1)], b = o[Math.min(n - 1, i + 1)];
    const span = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * dt || dt;
    return new THREE.Vector3((b.p[0] - a.p[0]) / span, (b.p[1] - a.p[1]) / span, (b.p[2] - a.p[2]) / span);
  };
  const vs: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) vs.push(vel(i));
  const items: { label: string; t: number }[] = [];
  let lastLabel = '';
  let aoaNow = 0;
  for (let i = 0; i < n; i++) {
    const s = o[i];
    const v = vs[i];
    const sp = v.length();
    const dir = sp > 0.5 ? v.clone().divideScalar(sp) : new THREE.Vector3(Math.cos(tu.psi), 0, Math.sin(tu.psi));
    // acceleration (smoothed over a few samples) and the specific force the wings must make
    const i0 = Math.max(0, i - 3), i1 = Math.min(n - 1, i + 3);
    const acc = vs[i1].clone().sub(vs[i0]).divideScalar(Math.max(dt, (i1 - i0) * dt));
    const sf = acc.clone().add(new THREE.Vector3(0, G0, 0));
    // the lift direction: the specific force square to the path
    const lift = sf.clone().addScaledVector(dir, -sf.dot(dir));
    let target = up.clone();
    if (s.ground) target.set(0, 1, 0);
    else if (lift.length() > 2) target.copy(lift).normalize();
    else target.copy(up).addScaledVector(dir, -up.dot(dir)).normalize();
    // the roll toward it, at a real roll rate (about 200 deg/s), plus any commanded roll
    const cur = up.clone().addScaledVector(dir, -up.dot(dir));
    if (cur.lengthSq() < 1e-6) cur.copy(target);
    cur.normalize();
    const dRoll = i > 0 ? s.roll - o[i - 1].roll : 0;
    const ang = Math.acos(Math.max(-1, Math.min(1, cur.dot(target))));
    const maxA = 200 * D2R * dt;
    // (in a commanded roll the jet rolls on its own; afterwards it settles back toward the lift)
    if (ang > 1e-5 && !dRoll) {
      const axis = new THREE.Vector3().crossVectors(cur, target);
      if (axis.lengthSq() < 1e-10) axis.copy(dir);
      axis.normalize();
      cur.applyAxisAngle(axis, Math.min(ang, maxA));
    }
    if (dRoll) cur.applyAxisAngle(dir, dRoll);
    up.copy(cur);
    // angle of attack: what the wing needs for the lift (more when slow), or the display's own
    const nz = sf.dot(up) / G0;
    const aoaAuto = s.ground ? 0 : Math.max(-2, Math.min(14, 2 + 6.5 * nz * Math.pow(110 / Math.max(60, sp), 2)));
    const aoaWant = (s.aoa ?? aoaAuto) * D2R;
    aoaNow += Math.max(-1.2 * dt * 2, Math.min(1.2 * dt * 2, aoaWant - aoaNow)) * (s.aoa !== null && s.aoa > 40 ? 1.6 : 1);
    if (s.ground && !s.aoa) aoaNow = Math.max(0, aoaNow - dt * 0.15);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const nose = dir.clone().applyAxisAngle(right, aoaNow);
    const bodyUp = up.clone().applyAxisAngle(right, aoaNow);
    samples.push({
      t: s.t,
      p: s.p,
      nose: [nose.x, nose.y, nose.z],
      up: [bodyUp.x, bodyUp.y, bodyUp.z],
      dir: [dir.x, dir.y, dir.z],
      v: sp,
      aoa: aoaNow,
      nz,
      rpm: s.rpm,
      ab: s.ab,
      gear: s.gear,
      brake: s.brake,
      tvc: tvcDeg > 0 ? s.tvc : 0,
      onGround: s.ground,
      label: s.label,
    });
    if (s.label !== lastLabel) {
      lastLabel = s.label;
      if (s.label && s.label !== 'REPOSITIONING') items.push({ label: s.label, t: s.t });
    }
  }
  return { type, samples, duration: samples[samples.length - 1].t, items };
}

// ------------------------------------------------------------------ playback

const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** drive a jet's flight-model state from its display at a time */
export class DisplayJet {
  t = 0;
  done = false;
  private i = 0;
  private prevRoll = 0;
  constructor(
    readonly ac: Aircraft,
    readonly routine: DisplayRoutine,
    private f: AirfieldDef,
  ) {}

  /** the manoeuvre now */
  get label(): string {
    return this.routine.samples[this.i]?.label ?? '';
  }

  /** local → world: a position */
  world(p: [number, number, number], out: THREE.Vector3): THREE.Vector3 {
    const f = this.f;
    return out.set(f.x + f.ax * p[0] + f.rxv * p[2], f.elev + p[1], f.z + f.az * p[0] + f.rzv * p[2]);
  }
  /** local → world: a direction */
  dirWorld(d: [number, number, number], out: THREE.Vector3): THREE.Vector3 {
    const f = this.f;
    return out.set(f.ax * d[0] + f.rxv * d[2], d[1], f.az * d[0] + f.rzv * d[2]);
  }

  /** jump to a time in the display (back or forward) */
  seek(t: number): void {
    const S = this.routine.samples;
    this.t = Math.max(0, Math.min(this.routine.duration, t));
    this.done = this.t >= this.routine.duration;
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (S[m].t <= this.t) lo = m;
      else hi = m;
    }
    this.i = lo;
    this.update(0);
  }

  update(dt: number): void {
    const S = this.routine.samples;
    this.t += dt;
    if (this.t >= this.routine.duration) {
      this.t = this.routine.duration;
      this.done = true;
    }
    while (this.i < S.length - 2 && S[this.i + 1].t <= this.t) this.i++;
    const a = S[this.i], b = S[Math.min(S.length - 1, this.i + 1)];
    const u = b.t > a.t ? Math.max(0, Math.min(1, (this.t - a.t) / (b.t - a.t))) : 0;
    const L = (x: number, y: number) => x + (y - x) * u;
    const fm = this.ac.fm;
    this.world([L(a.p[0], b.p[0]), L(a.p[1], b.p[1]), L(a.p[2], b.p[2])], fm.pos);
    // attitude: nose, top, right
    const nose = this.dirWorld([L(a.nose[0], b.nose[0]), L(a.nose[1], b.nose[1]), L(a.nose[2], b.nose[2])], _a).normalize();
    const up = this.dirWorld([L(a.up[0], b.up[0]), L(a.up[1], b.up[1]), L(a.up[2], b.up[2])], _b);
    up.addScaledVector(nose, -up.dot(nose)).normalize();
    const right = _c.crossVectors(nose, up).normalize();
    _m.makeBasis(right, up, nose.clone().negate());
    fm.quat.setFromRotationMatrix(_m);
    fm.fwd.copy(nose);
    fm.up.copy(up);
    fm.right.copy(right);
    const dir = this.dirWorld(a.dir, new THREE.Vector3());
    const v = L(a.v, b.v);
    fm.vel.copy(dir).multiplyScalar(v);
    fm.tas = v;
    fm.cas = v;
    fm.gs = v;
    fm.mach = v / 340;
    fm.alpha = L(a.aoa, b.aoa);
    fm.nz = L(a.nz, b.nz);
    fm.gearPos = L(a.gear, b.gear);
    fm.speedbrakePos = L(a.brake, b.brake);
    fm.onGround = a.onGround;
    fm.agl = fm.pos.y - this.f.elev;
    fm.vs = fm.vel.y;
    fm.heading = ((Math.atan2(fm.fwd.x, -fm.fwd.z) / D2R) + 360) % 360;
    for (let k = 0; k < fm.rpm.length; k++) {
      fm.rpm[k] = L(a.rpm, b.rpm);
      fm.ab[k] = L(a.ab, b.ab);
    }
    fm.throttleLever = a.ab > 0.05 ? 1 + 0.1 * a.ab : a.rpm;
    fm.nozzle.p = L(a.tvc, b.tvc);
    // the control surfaces: from the roll and pitch rates
    const roll = Math.atan2(right.y, up.y);
    const rr = dt > 0 ? (roll - this.prevRoll) / dt : 0;
    this.prevRoll = roll;
    fm.defl.a = Math.max(-1, Math.min(1, Number.isFinite(rr) && Math.abs(rr) < 20 ? rr / 4 : 0));
    fm.defl.e = Math.max(-1, Math.min(1, -(fm.nz - 1) / 6));
    fm.defl.r = 0;
    const c = this.ac.controls;
    c.pitch = fm.defl.e;
    c.roll = fm.defl.a;
    c.yaw = 0;
    c.gearDown = a.gear > 0.5;
  }
}
