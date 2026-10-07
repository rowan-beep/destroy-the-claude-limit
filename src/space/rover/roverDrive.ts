// Driving a Mars rover. Kept free of rendering so it can be checked on its own.
//
// The rover drives on the real (MOLA-based) Mars terrain the rest of the game
// uses, in a local east/north frame about a site. Real numbers: a top speed of
// 4.2 cm/s on flat ground (152 m an hour), slower on slopes and rough ground;
// the corner wheels steer for gentle Ackermann turns, or swing to a diamond so
// the rover can turn on the spot; it will not take on slopes past 30 degrees.
// (The mission's time warp is how anyone gets anywhere.)
//
// The pose comes from the ground under each of the six wheels: each bogie tips
// to sit its two wheels on the ground, each rocker tips to sit its front wheel
// and its bogie, and the differential bar averages the two rockers' angles into
// the body's pitch, so the body rides level-ish over a rock under one wheel.
//
// Every rock is solid: each one has a footprint and a height, and a wheel that
// rolls onto it climbs up over its rounded top and down the other side (the
// suspension takes it). Rocks taller than the wheels can climb stop the rover.

import { marsHeight } from '../mars/marsGlobe';
import { MARS } from '../mars/marsPhysics';
import { ROVER } from './roverModel';

const D2R = Math.PI / 180;

export interface Rock {
  e: number;
  n: number;
  /** the footprint's radius, m */
  r: number;
  /** how far it stands up out of the ground, m */
  top: number;
}

/** the tallest rock the wheels can climb (Perseverance's wheels are 52.5 cm across) */
export const CLIMB = 0.42;
/** a wheel meets a rock this far out from its edge (the wheel's own curve) */
const WHEEL_REACH = 0.15;
/** the grid the rocks are sorted into, for finding the ones under a wheel quickly */
const CELL = 1;
const key = (ix: number, iz: number) => (ix + 32768) * 65536 + (iz + 32768);

export interface RoverControls {
  /** -1 .. 1 drive */
  drive: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
}

export class RoverDrive {
  /** east / north of the site, metres */
  e = 0;
  n = 0;
  /** heading: 0 north, clockwise, radians */
  heading = 0;
  /** ground speed along the heading, m/s (signed) */
  speed = 0;
  /** steering command after the actuators' lag (-1..1) */
  steer = 0;
  /** distance driven */
  odometer = 0;
  /** wheel roll angle */
  roll = 0;
  /** turn-in-place mode (the corner wheels toed into a diamond) */
  spot = 0;
  // pose
  y = 0;
  pitch = 0;
  bank = 0;
  rocker: [number, number] = [0, 0];
  bogie: [number, number] = [0, 0];
  /** the slope under the rover, deg, and the reason it stopped (if any) */
  slope = 0;
  blocked = '';
  /** how high the highest wheel is riding up on a rock, m */
  onRock = 0;
  rocks: Rock[] = [];
  /** the ones too tall to climb (the only ones that can stop it) */
  private boulders: Rock[] = [];
  private grid = new Map<number, number[]>();
  readonly controls: RoverControls = { drive: 0, steer: 0 };
  /** top speed, m/s (4.2 cm/s) */
  vmax = 0.042;

  constructor(readonly lat0: number, readonly lon0: number) {}

  /** the rocks round the rover (sorted into the grid, so a wheel finds the ones under it at once) */
  setRocks(rocks: Rock[]): void {
    this.rocks = rocks;
    this.boulders = rocks.filter((rk) => rk.top >= CLIMB);
    this.grid.clear();
    rocks.forEach((rk, i) => {
      const re = rk.r + WHEEL_REACH;
      for (let ix = Math.floor((rk.e - re) / CELL); ix <= Math.floor((rk.e + re) / CELL); ix++)
        for (let iz = Math.floor((rk.n - re) / CELL); iz <= Math.floor((rk.n + re) / CELL); iz++) {
          const k = key(ix, iz);
          const l = this.grid.get(k);
          if (l) l.push(i);
          else this.grid.set(k, [i]);
        }
    });
  }

  /** how far a wheel at this point rides up on a rock: over the rounded top of whichever is tallest there */
  rockLift(e: number, n: number): number {
    const l = this.grid.get(key(Math.floor(e / CELL), Math.floor(n / CELL)));
    if (!l) return 0;
    let h = 0;
    for (const i of l) {
      const rk = this.rocks[i];
      const re = rk.r + WHEEL_REACH;
      const d2 = (e - rk.e) * (e - rk.e) + (n - rk.n) * (n - rk.n);
      if (d2 < re * re) h = Math.max(h, rk.top * (1 - d2 / (re * re)));
    }
    return h;
  }

  /** what a wheel sits on: the ground, and any rock there */
  surface(e: number, n: number): number {
    return this.ground(e, n) + this.rockLift(e, n);
  }

  /** ground height (m above the datum) at a local point */
  ground(e: number, n: number): number {
    const lat = this.lat0 + n / MARS.R / D2R;
    const lon = this.lon0 + e / (MARS.R * Math.cos(this.lat0 * D2R)) / D2R;
    return marsHeight(lat, lon);
  }
  latLon(e = this.e, n = this.n): { lat: number; lon: number } {
    return { lat: this.lat0 + n / MARS.R / D2R, lon: this.lon0 + e / (MARS.R * Math.cos(this.lat0 * D2R)) / D2R };
  }

  /** where a point of the rover (its own x right, z back) is on the ground plan */
  private plan(x: number, z: number): [number, number] {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    // forward is (sin h, cos h) in east/north; right is (cos h, -sin h)
    return [this.e + x * c - z * s, this.n - x * s - z * c];
  }

  step(dt: number): void {
    if (dt <= 0) return;
    const c = this.controls;
    // the corner wheels take a few seconds to swing
    const spotWant = Math.abs(c.drive) < 0.05 && Math.abs(c.steer) > 0.05 ? 1 : 0;
    this.spot += Math.max(-dt / 6, Math.min(dt / 6, spotWant - this.spot));
    this.steer += Math.max(-dt / 3, Math.min(dt / 3, c.steer - this.steer));
    // the slope ahead limits the speed (and stops the climb past 30 deg)
    // the grade over the rover's own footprint (3 m), not the ripples under one wheel
    const ahead = this.plan(0, -1.6), behind = this.plan(0, 1.6);
    const hA = this.ground(ahead[0], ahead[1]), hB = this.ground(behind[0], behind[1]);
    const grade = Math.atan2(hA - hB, 3.2) / D2R;
    const sideL = this.plan(-1.4, 0), sideR = this.plan(1.4, 0);
    const cross = Math.atan2(this.ground(sideL[0], sideL[1]) - this.ground(sideR[0], sideR[1]), 2.8) / D2R;
    this.slope = Math.hypot(grade, cross);
    let want = c.drive * this.vmax * (1 - this.spot);
    const climbing = want * grade > 0 ? Math.abs(grade) : 0;
    want *= Math.max(0.35, 1 - climbing / 45);
    // a wheel climbing over a rock: slower, the motors working
    want *= 1 - Math.min(0.45, this.onRock * 1.4);
    this.blocked = '';
    if (climbing > 30) {
      want = 0;
      this.blocked = 'TOO STEEP';
    }
    // tipped too far sideways: stop (turning on the spot to face down the slope gets it out)
    if (Math.abs(cross) > 30) {
      want = 0;
      this.blocked = 'TILT LIMIT';
    }
    // boulders: a rock bigger than the wheels can climb (about 0.65 m) stops the rover
    const dir = Math.sign(want);
    if (dir !== 0) {
      const probe = this.plan(0, dir > 0 ? -1.45 : 1.3);
      // (the wheels climb anything up to about their own diameter)
      for (const r of this.boulders) {
        const d = Math.hypot(r.e - probe[0], r.n - probe[1]);
        if (d < r.r + 0.55) {
          want = 0;
          this.blocked = 'ROCK AHEAD';
          break;
        }
      }
    }
    this.speed += Math.max(-dt * 0.05, Math.min(dt * 0.05, want - this.speed));
    // turning: Ackermann (radius from the steering), or on the spot
    const wheelbase = ROVER.rear.z - ROVER.front.z;
    const maxSteer = 0.42; // rad on the corner wheels
    let yawRate = 0;
    if (this.spot > 0.5) yawRate = this.steer * 0.004 * (this.spot - 0.5) * 2; // ~0.23 deg/s on the spot
    else if (Math.abs(this.steer) > 0.01) yawRate = (this.speed * Math.tan(this.steer * maxSteer)) / (wheelbase / 2);
    this.heading = (this.heading + yawRate * dt + Math.PI * 2) % (Math.PI * 2);
    this.e += Math.sin(this.heading) * this.speed * dt;
    this.n += Math.cos(this.heading) * this.speed * dt;
    this.odometer += Math.abs(this.speed) * dt;
    this.roll += (this.speed * dt) / ROVER.wheelR + (this.spot > 0.5 ? yawRate * dt * 1.3 / ROVER.wheelR : 0);
    this.pose();
  }

  /** the suspension: sit each wheel on the ground */
  pose(): void {
    const R = ROVER;
    // (each wheel on the ground or riding up over a rock)
    let lift = 0;
    const h = (x: number, z: number) => {
      const p = this.plan(x, z);
      const l = this.rockLift(p[0], p[1]);
      lift = Math.max(lift, l);
      return this.ground(p[0], p[1]) + l;
    };
    const wh: number[][] = [];
    for (const s of [-1, 1]) wh.push([h(s * R.front.x, R.front.z), h(s * R.middle.x, R.middle.z), h(s * R.rear.x, R.rear.z)]);
    const bogieDz = R.rear.z - R.middle.z;
    const rockerDz = R.bogiePivot.z - R.front.z;
    const sideAng: number[] = [];
    for (let i = 0; i < 2; i++) {
      const [f, m, r] = wh[i];
      // the bogie's angle (nose up positive) and the height of its pivot
      const bAng = Math.atan2(m - r, bogieDz);
      const bp = (m + r) / 2;
      // the rocker: from the front wheel back to the bogie pivot
      sideAng.push(Math.atan2(f - bp, rockerDz));
      this.bogie[i] = bAng;
    }
    // the differential bar: the body pitches by the average, each rocker turns by its difference
    this.pitch = (sideAng[0] + sideAng[1]) / 2;
    for (let i = 0; i < 2; i++) {
      this.rocker[i] = sideAng[i] - this.pitch;
      this.bogie[i] -= sideAng[i];
    }
    const left = (wh[0][0] + wh[0][1] + wh[0][2]) / 3, right = (wh[1][0] + wh[1][1] + wh[1][2]) / 3;
    this.bank = Math.atan2(left - right, R.middle.x * 2);
    this.y = (left + right) / 2;
    this.onRock = lift;
  }
}
