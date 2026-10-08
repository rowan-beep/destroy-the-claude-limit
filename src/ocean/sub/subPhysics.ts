// The survey submarine's motion: a bounded, fixed-step model of thrust, drag,
// buoyancy and ballast, a stable heading, and two assists (hold depth, hold
// position). Pure TypeScript (no three.js), so it is tested on its own and
// behaves identically on every quality preset.
//
// Tuning is fictional and for play: it should settle, drift and stop where the
// player expects, not reproduce a real vessel.

import { seabedHeight, seabedNormal, colliderDistance, currentAt, angleDiff, type Collider } from '../world/geo';
import { surfaceHeight, surfaceSlope } from '../world/waves';

export interface SubSpec {
  name: string;
  /** mass (kg); inertia uses an extra added-mass share */
  mass: number;
  /** hull length and the radius of the collision spheres along it (m) */
  length: number;
  radius: number;
  /** thrust: forward (N, reverse is 80 %), lateral, vertical */
  thrust: number;
  lateral: number;
  vertical: number;
  /** yaw: top rate (deg/s) and acceleration (deg/s²) */
  yawRate: number;
  yawAccel: number;
  /** quadratic drag coefficients along, across and up the hull */
  dragF: number;
  dragL: number;
  dragV: number;
  /** ballast pump rate (tank fraction per second) and the blow-everything rate */
  pumpRate: number;
  blowRate: number;
}

export const SURVEY_SUB: SubSpec = {
  name: 'SV-1 PETREL',
  mass: 7800,
  length: 6.4,
  radius: 1.25,
  thrust: 5200,
  lateral: 1300,
  vertical: 2600,
  yawRate: 26,
  yawAccel: 34,
  dragF: 300,
  dragL: 2600,
  dragV: 1500,
  pumpRate: 0.07,
  blowRate: 0.45,
};

/** ballast fill where the submerged hull weighs exactly what it displaces */
export const NEUTRAL_BALLAST = 0.9;
const G = 9.81;
const DEG = Math.PI / 180;

export interface SubInput {
  /** -1..1 forward / reverse */
  thrust: number;
  /** -1..1 turn left / right */
  yaw: number;
  /** -1..1 descend / ascend (vertical thrusters) */
  vertical: number;
  /** -1..1 sideways (only the assists and fine positioning use it) */
  lateral: number;
  /** -1 blow, +1 flood, 0 hold the ballast as it is */
  ballast: number;
  /** Quiet Survey: thrusters limited to a whisper */
  quiet: boolean;
  /** blow every tank: straight to the surface */
  emergencyBlow: boolean;
}

export const NO_INPUT: SubInput = { thrust: 0, yaw: 0, vertical: 0, lateral: 0, ballast: 0, quiet: false, emergencyBlow: false };

export interface SubState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** degrees clockwise from north */
  heading: number;
  yawRate: number;
  /** display attitude (degrees) */
  pitch: number;
  roll: number;
  /** ballast tank fill 0..1 */
  ballast: number;
  /** battery 0..1 */
  battery: number;
  lights: boolean;
  /** hold-depth target (m below the surface), or null */
  holdDepth: number | null;
  /** the hold-depth controller's integral (it trims out a heavy or light boat) */
  holdI: number;
  /** hold-position target, or null */
  holdPos: { x: number; z: number; heading: number } | null;
  /** what the thrusters are doing this step (after the assists): for noise and sound */
  out: { thrust: number; lateral: number; vertical: number; yaw: number; pumping: boolean };
  /** seconds simulated */
  t: number;
}

export interface Bump {
  /** speed into the obstacle (m/s) */
  speed: number;
  tag: string;
  /** 'light' (a nudge) or 'hard' (worth a warning) */
  severity: 'light' | 'hard';
}

export interface SubEnv {
  /** wave amplitude scale of the weather */
  waveAmp: number;
  colliders: Collider[];
  /** no battery drain (the relaxed setting) */
  relaxed: boolean;
}

export function newSubState(x: number, z: number, heading: number): SubState {
  return {
    x, y: 0.2, z, vx: 0, vy: 0, vz: 0,
    heading, yawRate: 0, pitch: 0, roll: 0,
    ballast: 0, battery: 1, lights: true,
    holdDepth: null, holdI: 0, holdPos: null,
    out: { thrust: 0, lateral: 0, vertical: 0, yaw: 0, pumping: false },
    t: 0,
  };
}

/** depth below the mean surface (positive down) */
export const depthOf = (s: SubState): number => -s.y;

/** speed through the water (m/s) */
export const speedOf = (s: SubState): number => Math.hypot(s.vx, s.vy, s.vz);

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * One fixed step. Returns the hardest bump of the step, if the hull touched
 * anything.
 */
export function stepSub(s: SubState, spec: SubSpec, input: SubInput, env: SubEnv, dt: number): Bump | null {
  s.t += dt;
  const h = s.heading * DEG;
  const fx = Math.sin(h), fz = -Math.cos(h);
  const rx = Math.cos(h), rz = Math.sin(h);
  const quietK = input.quiet ? 0.28 : 1;
  let thrust = clamp(input.thrust, -1, 1) * quietK;
  let yaw = clamp(input.yaw, -1, 1);
  let vertical = clamp(input.vertical, -1, 1) * quietK;
  let lateral = clamp(input.lateral, -1, 1) * quietK;
  const vf = s.vx * fx + s.vz * fz;
  const vr = s.vx * rx + s.vz * rz;

  // --- the assists: they step aside while the player is steering, then take over again
  const manualH = Math.abs(input.thrust) > 0.04 || Math.abs(input.yaw) > 0.04 || Math.abs(input.lateral) > 0.04;
  if (s.holdPos) {
    if (manualH) s.holdPos = { x: s.x, z: s.z, heading: s.heading };
    else {
      const ex = s.holdPos.x - s.x, ez = s.holdPos.z - s.z;
      const ef = ex * fx + ez * fz, er = ex * rx + ez * rz;
      thrust = clamp(0.35 * ef - 1.1 * vf, -1, 1) * quietK;
      lateral = clamp(0.5 * er - 1.6 * vr, -1, 1) * quietK;
      yaw = clamp(angleDiff(s.holdPos.heading, s.heading) * 0.08 - s.yawRate * 0.05, -1, 1);
    }
  }
  const depth = -s.y;
  if (s.holdDepth !== null) {
    if (Math.abs(input.vertical) > 0.04) {
      s.holdDepth = Math.max(0, depth);
      s.holdI = 0;
    } else {
      const err = depth - s.holdDepth;
      s.holdI = clamp(s.holdI + err * dt, -30, 30);
      vertical = clamp(err * 0.6 - s.vy * 1.4 + s.holdI * 0.06, -1, 1) * (input.quiet ? 0.6 : 1);
    }
  } else s.holdI = 0;

  // --- ballast pumps
  let pumping = false;
  if (input.emergencyBlow) {
    s.ballast = Math.max(0, s.ballast - spec.blowRate * dt);
    pumping = true;
  } else if (input.ballast !== 0) {
    const nb = clamp(s.ballast + Math.sign(input.ballast) * spec.pumpRate * dt, 0, 1);
    pumping = nb !== s.ballast;
    s.ballast = nb;
  }

  // --- forces
  const m = spec.mass;
  const mi = m * 1.35; // inertia including the water dragged along
  const water = surfaceHeight(s.x, s.z, s.t, env.waveAmp);
  // how much of the hull is under water (a cylinder of the collision radius)
  const sub = clamp((water - (s.y - spec.radius)) / (2 * spec.radius), 0, 1);
  const weight = m * G * (0.8 + 0.22 * s.ballast);
  const buoy = m * G * sub;
  const cur = currentAt(s.x, s.z, depth);
  const ux = s.vx - cur.x, uz = s.vz - cur.z;
  const uf = ux * fx + uz * fz, ur = ux * rx + uz * rz;
  const tF = thrust * spec.thrust * (thrust < 0 ? 0.8 : 1);
  // thrusters out of the water push little
  const inWater = 0.25 + 0.75 * sub;
  let ax = (fx * tF + rx * lateral * spec.lateral) * inWater;
  let az = (fz * tF + rz * lateral * spec.lateral) * inWater;
  let ay = vertical * spec.vertical * sub + buoy - weight;
  // drag along and across the hull, and vertically (a surfaced hull is damped by the water round it)
  const dF = spec.dragF * Math.abs(uf) * uf + 150 * uf;
  const dR = spec.dragL * Math.abs(ur) * ur + 300 * ur;
  ax -= fx * dF + rx * dR;
  az -= fz * dF + rz * dR;
  const vdamp = spec.dragV * (1 + (1 - sub) * 2) * Math.abs(s.vy) * s.vy + 600 * s.vy;
  ay -= vdamp;
  s.vx += (ax / mi) * dt;
  s.vy += (ay / mi) * dt;
  s.vz += (az / mi) * dt;

  // --- heading
  const speedK = 0.55 + 0.45 * clamp(Math.abs(vf) / 2, 0, 1);
  const want = yaw * spec.yawRate * speedK;
  const dYaw = clamp(want - s.yawRate, -spec.yawAccel * dt, spec.yawAccel * dt);
  s.yawRate += dYaw;
  s.heading = (((s.heading + s.yawRate * dt) % 360) + 360) % 360;

  // --- move
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
  // the hull can't climb out of the sea
  const top = water + spec.radius * 0.45;
  if (s.y > top) {
    s.y = top;
    if (s.vy > 0) s.vy = 0;
  }

  // --- collisions: three spheres along the hull against the ground and every solid shape
  let bump: Bump | null = null;
  const half = spec.length / 2 - spec.radius * 0.6;
  for (const off of [half, 0, -half]) {
    const px = s.x + fx * off, pz = s.z + fz * off;
    const g = seabedHeight(px, pz);
    const pen = g + spec.radius - s.y;
    if (pen > 0) {
      const n = seabedNormal(px, pz, 2);
      s.y += pen * n[1];
      s.x += pen * n[0] * 0.5;
      s.z += pen * n[2] * 0.5;
      bump = resolve(s, n[0], n[1], n[2], 'seabed', bump);
    }
    for (const c of env.colliders) {
      // (a quick reject before the exact distance)
      const cx = c.x, cz = c.z;
      if (Math.abs(px - cx) > 60 || Math.abs(pz - cz) > 60) continue;
      const d = colliderDistance(c, px, s.y, pz);
      const p2 = spec.radius - d.d;
      if (p2 > 0) {
        s.x += d.nx * p2;
        s.y += d.ny * p2;
        s.z += d.nz * p2;
        bump = resolve(s, d.nx, d.ny, d.nz, c.tag, bump);
      }
    }
  }

  // --- what the display shows: nose up when climbing, a lean in turns, the swell at the surface
  const vfNow = s.vx * fx + s.vz * fz;
  let pitch = clamp(s.vy * 9, -14, 14);
  let roll = clamp(-s.yawRate * vfNow * 0.35, -8, 8);
  if (sub < 0.999) {
    const [sx, sz] = surfaceSlope(s.x, s.z, s.t, env.waveAmp);
    const k = 1 - sub;
    pitch += (Math.atan(sx * fx + sz * fz) / DEG) * k * 2;
    roll += (Math.atan(sx * rx + sz * rz) / DEG) * k * 2;
  }
  s.pitch += (pitch - s.pitch) * Math.min(1, dt * 3);
  s.roll += (roll - s.roll) * Math.min(1, dt * 3);

  // --- battery: hotel load, thrusters, lights, pumps
  if (!env.relaxed) {
    const use = 0.00022 + 0.00048 * (Math.abs(thrust) + 0.5 * Math.abs(lateral) + 0.7 * Math.abs(vertical)) + (s.lights ? 0.00008 : 0) + (pumping ? 0.0002 : 0);
    s.battery = Math.max(0, s.battery - use * dt);
  }
  // a flat battery leaves only a crawl
  if (s.battery <= 0) {
    s.vx *= 1 - 0.3 * dt;
    s.vz *= 1 - 0.3 * dt;
  }
  s.out = { thrust, lateral, vertical, yaw, pumping };
  return bump;
}

function resolve(s: SubState, nx: number, ny: number, nz: number, tag: string, prev: Bump | null): Bump | null {
  const vn = s.vx * nx + s.vy * ny + s.vz * nz;
  if (vn >= 0) return prev;
  // stop the motion into the obstacle (a little bounce), with some scraping friction
  const e = 0.15;
  s.vx -= (1 + e) * vn * nx;
  s.vy -= (1 + e) * vn * ny;
  s.vz -= (1 + e) * vn * nz;
  s.vx *= 0.97;
  s.vz *= 0.97;
  const speed = -vn;
  if (speed < 0.05) return prev;
  const b: Bump = { speed, tag, severity: speed > 0.9 ? 'hard' : 'light' };
  return !prev || b.speed > prev.speed ? b : prev;
}

/**
 * The fixed-step driver: runs whole steps for the frame's time (with a ceiling
 * on catch-up after a pause or a slow frame) and keeps the previous state for
 * interpolation.
 */
export class FixedStepper {
  readonly step = 1 / 60;
  private acc = 0;
  /** state at the previous step (for interpolating the display) */
  prev: { x: number; y: number; z: number; heading: number; pitch: number; roll: number } = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  /** steps run in the last frame, and frames that hit the catch-up ceiling */
  lastSteps = 0;
  clipped = 0;

  constructor(private maxSteps = 6) {}

  /** run the steps due; `alpha` (0..1) is how far between the last two states the display is */
  advance(dt: number, s: SubState, run: () => void): number {
    this.acc += Math.min(dt, 0.25);
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) {
      this.prev = { x: s.x, y: s.y, z: s.z, heading: s.heading, pitch: s.pitch, roll: s.roll };
      run();
      this.acc -= this.step;
      n++;
    }
    if (n === this.maxSteps && this.acc >= this.step) {
      // too far behind: drop the backlog instead of spiralling
      this.acc = 0;
      this.clipped++;
    }
    this.lastSteps = n;
    return this.acc / this.step;
  }
}

/** the displayed pose between the last two steps */
export function interpolate(prev: FixedStepper['prev'], s: SubState, a: number): { x: number; y: number; z: number; heading: number; pitch: number; roll: number } {
  return {
    x: prev.x + (s.x - prev.x) * a,
    y: prev.y + (s.y - prev.y) * a,
    z: prev.z + (s.z - prev.z) * a,
    heading: prev.heading + angleDiff(s.heading, prev.heading) * a,
    pitch: prev.pitch + (s.pitch - prev.pitch) * a,
    roll: prev.roll + (s.roll - prev.roll) * a,
  };
}

/** a rough range estimate (m) at the present speed and drain, for the HUD */
export function rangeEstimate(s: SubState, spec: SubSpec): number {
  const v = Math.max(0.6, Math.hypot(s.vx, s.vz));
  const thrustFrac = Math.min(1, v / 3.6);
  const use = 0.00022 + 0.00048 * thrustFrac + (s.lights ? 0.00008 : 0);
  return (s.battery / use) * v;
}
