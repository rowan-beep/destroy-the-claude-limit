// The flight of a launch vehicle from the pad to orbit and beyond, kept free of
// rendering. Real physics in Earth's inertial frame (the universe module's ECI:
// +Y north): Earth's gravity and spin, the standard atmosphere, drag, engine
// thrust and specific impulse that change with the air pressure, and the mass
// burning away. Guidance flies the ascent (vertical rise, pitch kick, gravity
// turn, closed-loop to a parking orbit).
//
// Falcon Heavy's side boosters come home on their own: they flip, burn back
// toward the Cape, fall, relight three engines for the entry burn, steer with
// their grid fins, and land on Landing Zones 1 and 2 on one engine. The centre
// core and the SLS boosters fall into the ocean.
//
// After the parking orbit the mission's own script takes over: an escape burn
// (Europa Clipper), or the translunar injection and the coast round the Moon
// with the Moon's gravity (Artemis II).

import { V3, add, sub, scale, dot, cross, len, norm, addScaled, EARTH, earthAngle, ecefDir, enu, padScene, PAD, rotY, gravityAt, airVelocity, air, moonState, MOON } from '../universe';
import { VehicleDef, engineOut, G0 } from './vehicles';

const D2R = Math.PI / 180;

export type LaunchPhase = 'pad' | 'boost' | 'core' | 'upper' | 'orbit' | 'burn' | 'coast' | 'entry' | 'chutes' | 'splash' | 'escaped' | 'lost';

export interface LogLine {
  text: string;
  kind: string;
}

/** a booster flying (or falling) on its own after separation */
export interface FreeStage {
  name: string;
  r: V3;
  v: V3;
  axis: V3;
  dry: number;
  prop: number;
  engines: number;
  throttle: number;
  phase: 'flip' | 'boostback' | 'coast' | 'entry' | 'fall' | 'landing' | 'landed' | 'gone';
  t: number;
  /** where it is going to land (ECEF), if it lands */
  lz: V3 | null;
  side: number;
  legs: number;
  fins: number;
  land: boolean;
  /** where it stands once landed (Earth-fixed), so it rides round with the Earth */
  at?: V3;
}

export class LaunchFlight {
  t = 0;
  r: V3;
  v: V3;
  axis: V3;
  phase: LaunchPhase = 'pad';
  throttle = 1;
  gLoad = 1;
  maxQ = 0;
  q = 0;
  log: LogLine[] = [];
  auto = true;
  // what is still attached, and its propellant
  boosters = true;
  boosterProp: number;
  coreOn = true;
  coreProp: number;
  upperProp: number;
  fairingOn = true;
  payloadOn = true;
  /** the upper stage has gone and only the payload (Orion, Clipper) flies on */
  payloadOnly = false;
  coreEngines: number;
  boosterEngines: number;
  upperEngines = 0;
  /** stages flying on their own */
  free: FreeStage[] = [];
  /** the parking orbit's target height */
  parkAlt = 185_000;
  /** the launch azimuth, degrees from north (90: due east) */
  azimuth = 90;
  /** a commanded burn: along the velocity until the velocity reaches a target speed at the current radius' energy */
  private burnTarget: { energy: number; label: string; done: string } | null = null;
  /** capsule mass after separating (Orion) */
  capsuleMass = 0;
  /**
   * the payload's own engine, to finish a burn the upper stage runs out on
   * (Orion's service module: the ICPS raises the orbit, Orion does the rest)
   */
  kick: { thrust: number; isp: number; prop: number; say: string } | null = null;
  chuteK = 0;
  /** landing zones (ECEF) for the side boosters */
  lz: V3[] = [];
  outcome: { ok: boolean; title: string; text: string } | null = null;

  constructor(readonly vehicle: VehicleDef, readonly padOffset: [number, number]) {
    // the pad: Pad 1's position, moved by the site-frame offset of the vehicle's own pad
    const ax = padScene();
    const p0 = scale(ecefDir(PAD.lat, PAD.lon), EARTH.R);
    const pad = add(add(p0, scale(ax.x, padOffset[0])), scale(ax.z, padOffset[1]));
    const R = len(pad);
    this.r = scale(pad, (R + 0) / R);
    this.padEcef = pad;
    this.v = cross([0, EARTH.spin, 0], this.r);
    this.axis = norm(this.r);
    this.boosterProp = vehicle.boosters.stage.prop * vehicle.boosters.count;
    this.coreProp = vehicle.core.prop;
    this.upperProp = vehicle.upper.prop;
    this.coreEngines = vehicle.core.engine.count;
    this.boosterEngines = vehicle.boosters.stage.engine.count * vehicle.boosters.count;
  }

  /** a site-frame point (x south, z west, metres from Pad 1) as Earth-fixed coordinates */
  static siteToEcef(x: number, z: number, y = 0): V3 {
    const ax = padScene();
    const p0 = scale(ecefDir(PAD.lat, PAD.lon), EARTH.R);
    return add(add(add(p0, scale(ax.x, x)), scale(ax.z, z)), scale(ax.y, y));
  }

  say(text: string, kind = ''): void {
    this.log.push({ text, kind });
  }

  get alt(): number {
    return len(this.r) - EARTH.R;
  }
  up(): V3 {
    return norm(this.r);
  }
  airVel(): V3 {
    return sub(this.v, airVelocity(this.r));
  }

  get mass(): number {
    const V = this.vehicle;
    let m = 0;
    if (this.payloadOnly) return this.capsuleMass;
    if (this.boosters) m += V.boosters.stage.dry * V.boosters.count + this.boosterProp;
    if (this.coreOn) m += V.core.dry + this.coreProp;
    m += V.upper.dry + this.upperProp;
    if (this.fairingOn) m += V.fairing.mass;
    if (this.payloadOn) m += V.payload.mass;
    return m;
  }

  launch(): void {
    if (this.phase !== 'pad') return;
    this.phase = 'boost';
    this.t = 0;
    const V = this.vehicle;
    if (V.boosters.count === 0) {
      // (Falcon 9: no strap-ons, the first stage is the core)
      this.phase = 'core';
      this.boosters = false;
      this.say(`Liftoff! All nine Merlins: ${(V.liftoffThrust / 1e6).toFixed(1)} MN. Falcon 9 clears the tower and rolls onto its heading, northeast up the coast.`, 'good');
      return;
    }
    this.say(`Liftoff! ${V.id === 'sls' ? 'Four RS-25s and two solid boosters' : 'All 27 Merlins'}: ${(V.liftoffThrust / 1e6).toFixed(1)} MN.`, 'good');
  }

  orbit(): { ap: number; pe: number; e: number; a: number } {
    const mu = EARTH.GM;
    const R = len(this.r), v2 = dot(this.v, this.v);
    const en = v2 / 2 - mu / R;
    const h = len(cross(this.r, this.v));
    const a = -mu / (2 * en);
    const e = Math.sqrt(Math.max(0, 1 + (2 * en * h * h) / (mu * mu)));
    return { a, e, ap: en < 0 ? a * (1 + e) - EARTH.R : Infinity, pe: a * (1 - e) - EARTH.R };
  }

  /** start a burn along the velocity until the orbital energy reaches `energy` (J/kg) */
  burnTo(energy: number, label: string, done: string): void {
    this.burnTarget = { energy, label, done };
    this.phase = 'burn';
    this.upperEngines = 1;
    this.throttle = 1;
    this.say(label, 'info');
  }

  advance(dt: number): void {
    if (this.phase === 'pad' || this.phase === 'splash' || this.phase === 'lost') {
      if (this.phase === 'pad') {
        // the pad rides round with the Earth
        this.r = rotY(this.r, EARTH.spin * dt);
        this.v = cross([0, EARTH.spin, 0], this.r);
        this.axis = norm(this.r);
      }
      this.t += dt;
      return;
    }
    // small steps when anything is under power or low; long ones coasting high
    const coasting = this.phase === 'orbit' || this.phase === 'coast' || this.phase === 'escaped';
    const free = this.free.some((f) => f.phase !== 'gone' && f.phase !== 'landed');
    const hmax = coasting && !free ? (this.alt > 2e6 ? 30 : this.alt > 300_000 ? 5 : 1) : 0.05;
    // out on the way to the Moon: steps that shrink near either body, like the planner's
    const far = (this.phase === 'coast' || this.phase === 'escaped') && !free && this.alt > 140_000;
    let left = dt;
    while (left > 1e-9) {
      let h = Math.min(hmax, left);
      if (far && (this.phase === 'coast' || this.phase === 'escaped')) {
        const dm = len(sub(this.r, moonState(this.t).r)) - MOON.R;
        h = Math.min(left, Math.max(1, Math.min(600, Math.min(len(this.r) - EARTH.R - 120_000, dm) / 3000)));
        if (h >= 1 && len(this.r) - EARTH.R > 140_000) {
          this.rk4(h);
          left -= h;
          continue;
        }
      }
      this.step(h);
      left -= h;
      if ((this.phase as LaunchPhase) === 'splash' || (this.phase as LaunchPhase) === 'lost') break;
    }
  }

  /** a coasting step through Earth's and the Moon's gravity (RK4) */
  private rk4(h: number): void {
    const r = this.r, v = this.v, t = this.t;
    const k1v = gravityAt(r, t), k1r = v;
    const k2v = gravityAt(add(r, scale(k1r, h / 2)), t + h / 2), k2r = add(v, scale(k1v, h / 2));
    const k3v = gravityAt(add(r, scale(k2r, h / 2)), t + h / 2), k3r = add(v, scale(k2v, h / 2));
    const k4v = gravityAt(add(r, scale(k3r, h)), t + h), k4r = add(v, scale(k3v, h));
    this.r = add(r, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), h / 6));
    this.v = add(v, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6));
    this.t += h;
    this.axis = turnToward(this.axis, norm(this.v), h * 1 * D2R);
  }

  private step(h: number): void {
    const V = this.vehicle;
    const alt = this.alt;
    const atm = air(Math.max(0, alt));
    const va = this.airVel();
    const vA = len(va);
    this.q = 0.5 * atm.rho * vA * vA;
    this.maxQ = Math.max(this.maxQ, this.q);
    let F = 0;
    const up = this.up();
    // ---- guidance
    if (this.phase === 'boost' || this.phase === 'core' || this.phase === 'upper') {
      let want: V3;
      if (alt < 300) want = up;
      else if (vA < 90) {
        // the pitch kick: lean toward the launch azimuth (due east, out over the sea)
        const { E, N } = enu(PAD.lat, PAD.lon);
        const az = this.azimuth * D2R;
        const head = norm(rotY(add(scale(N, Math.cos(az)), scale(E, Math.sin(az))), earthAngle(this.t)));
        want = norm(add(up, scale(head, 0.1)));
      } else if (this.phase !== 'upper' && alt < 60_000) {
        // the gravity turn: fly along the airflow, no lower than a pitch profile
        want = norm(va);
        const pitch = Math.asin(Math.max(-1, Math.min(1, dot(want, up))));
        const minPitch = Math.max(22, 84 - alt / 1100) * D2R;
        if (pitch < minPitch) want = norm(add(scale(up, Math.sin(minPitch)), scale(norm(sub(want, scale(up, dot(want, up)))), Math.cos(minPitch))));
      } else {
        // closed-loop to the parking orbit: hold a climb rate, build horizontal speed
        const vz = dot(this.v, up);
        const vhv = sub(this.v, scale(up, vz));
        const vh = len(vhv);
        const R = len(this.r);
        const a = Math.max(1, this.thrustNow(atm.p) / this.mass);
        const vzCmd = Math.max(-80, Math.min(450, (this.parkAlt - alt) / 40));
        const az = (vzCmd - vz) / 15 + EARTH.GM / (R * R) - (vh * vh) / R;
        const s = Math.max(-0.35, Math.min(0.9, az / a));
        want = norm(add(scale(up, s), scale(norm(vhv), Math.sqrt(1 - s * s))));
      }
      this.axis = turnToward(this.axis, want, h * 3.5 * D2R);
      // Falcon: the centre core throttles back while the side boosters burn (saving its propellant); max-Q throttle bucket
      const bucket = alt > 9000 && alt < 16000 ? 0.75 : 1;
      if (this.phase === 'boost') {
        // the SRBs' grain is shaped: full thrust off the pad, a dip through max-Q, then tail-off
        const tb = this.t;
        const srbK = tb < 20 ? 1 : tb < 55 ? 1 - (0.27 * (tb - 20)) / 35 : tb < 85 ? 0.73 + (0.1 * (tb - 55)) / 30 : 0.83;
        const b = engineOut(V.boosters.stage.engine, this.boosterEngines, V.id === 'sls' ? srbK : bucket, atm.p);
        const coreTh = V.id === 'falcon-heavy' ? (this.t > 50 ? 0.62 : bucket) : Math.max(V.core.engine.minThrottle, bucket);
        const c = engineOut(V.core.engine, this.coreEngines, coreTh, atm.p);
        F = b.thrust + c.thrust;
        this.boosterProp -= b.mdot * h;
        this.coreProp -= c.mdot * h;
        this.throttle = coreTh;
        // the boosters' end: the SRBs burn out; Falcon's side boosters keep a reserve to fly home
        const reserve = V.boosters.land ? 0.21 : 0.0;
        if (this.boosterProp <= V.boosters.stage.prop * V.boosters.count * reserve) this.dropBoosters();
      } else if (this.phase === 'core') {
        // no more than about 3.5 g as the core stage empties
        const full = engineOut(V.core.engine, this.coreEngines, 1, atm.p);
        const th = Math.max(V.core.engine.minThrottle, Math.min(1, (3.6 * G0 * this.mass) / Math.max(1, full.thrust)));
        const c = engineOut(V.core.engine, this.coreEngines, th, atm.p);
        F = c.thrust;
        this.throttle = th;
        this.coreProp -= c.mdot * h;
        // (Falcon 9 keeps about a tenth of its propellant to fly home to the drone ship)
        if (this.coreProp <= V.core.prop * (V.id === 'falcon-9' ? 0.1 : 0.01) || (V.id === 'sls' && this.orbit().pe > -40_000 && this.orbit().ap > this.parkAlt)) this.dropCore();
      } else {
        const u = engineOut(V.upper.engine, 1, 1, atm.p);
        F = u.thrust;
        this.throttle = 1;
        this.upperEngines = 1;
        this.upperProp -= u.mdot * h;
        const o = this.orbit();
        if (o.pe > this.parkAlt - 15_000) {
          this.phase = 'orbit';
          this.upperEngines = 0;
          this.say(`${V.id === 'sls' ? 'The ICPS' : 'The second stage'} cuts off: parking orbit ${Math.round(o.pe / 1000)} × ${Math.round(o.ap / 1000)} km.`, 'good');
        }
        if (this.upperProp <= 0) this.fail('Out of propellant', 'The upper stage ran dry before orbit.');
      }
      if (this.fairingOn && alt > V.fairing.jettisonAlt) {
        this.fairingOn = false;
        this.say(V.id === 'sls' ? 'Launch abort system jettisoned: the tower and its fairing pull away. Orion\'s service module panels follow.' : 'Fairing separation: the two halves fall away. Europa Clipper sees the sky for the first time.', 'info');
        this.dropFairing();
      }
    } else if (this.phase === 'burn' && this.burnTarget) {
      this.axis = turnToward(this.axis, norm(this.v), h * 5 * D2R);
      const k = this.kick;
      if (this.payloadOnly && k) {
        // the payload's own engine
        F = k.prop > 0 ? k.thrust : 0;
        const md = (F / (k.isp * G0)) * h;
        k.prop -= md;
        this.capsuleMass -= md;
      } else {
        const u = engineOut(V.upper.engine, 1, 1, 0);
        F = u.thrust;
        this.upperProp -= u.mdot * h;
        if (this.upperProp <= 0 && k && !this.payloadOnly) {
          this.upperProp = 0;
          this.separatePayload(V.payload.mass);
          this.say(k.say, 'info');
        }
      }
      const en = dot(this.v, this.v) / 2 - EARTH.GM / len(this.r);
      const dry = this.payloadOnly && k ? k.prop <= 0 : this.upperProp <= 0 && !k;
      if (en >= this.burnTarget.energy || dry) {
        this.upperEngines = 0;
        this.phase = this.burnTarget.energy >= 0 ? 'escaped' : 'coast';
        this.say(this.burnTarget.done, 'good');
        this.burnTarget = null;
        this.kick = null;
      }
    } else if (this.phase === 'orbit' || this.phase === 'coast' || this.phase === 'escaped') {
      // coasting: point along the velocity (slowly)
      this.axis = turnToward(this.axis, norm(this.v), h * 1 * D2R);
    }
    // ---- forces
    const m = this.mass;
    const grav = this.phase === 'coast' || this.phase === 'escaped' || this.phase === 'entry' || this.phase === 'chutes' ? gravityAt(this.r, this.t) : scale(this.r, -EARTH.GM / len(this.r) ** 3);
    let drag: V3 = [0, 0, 0];
    if (atm.rho > 0 && vA > 0.5) {
      let cdA = V.cd * V.area;
      if (this.phase === 'upper' || this.phase === 'orbit') cdA = 0.6 * Math.PI * 2.6 * 2.6;
      if (this.phase === 'entry') cdA = 1.25 * Math.PI * 2.5 * 2.5;
      if (this.phase === 'chutes') cdA = 1.25 * Math.PI * 2.5 * 2.5 + this.chuteK * 3 * 0.8 * Math.PI * 58 * 58 * 0.25;
      drag = scale(va, (-0.5 * atm.rho * vA * cdA) / m);
    }
    const thrustAcc = scale(this.axis, F / Math.max(1, m));
    const acc = add(add(grav, thrustAcc), drag);
    this.gLoad = len(add(thrustAcc, drag)) / G0;
    this.v = addScaled(this.v, acc, h);
    this.r = addScaled(this.r, this.v, h);
    this.t += h;
    // ---- coming home: entry, parachutes, splashdown
    if (this.payloadOnly && (this.phase === 'coast' || this.phase === 'entry' || this.phase === 'chutes')) this.returnHome(alt, vA);
    if (len(this.r) < EARTH.R && this.phase !== 'splash' && this.t > 10 && !this.payloadOnly) this.fail('Lost', 'The vehicle fell back to Earth.');
    // ---- the stages on their own
    for (const f of this.free) this.stepFree(f, h);
  }

  private thrustNow(p: number): number {
    const V = this.vehicle;
    if (this.phase === 'boost') return engineOut(V.boosters.stage.engine, this.boosterEngines, 1, p).thrust + engineOut(V.core.engine, this.coreEngines, 1, p).thrust;
    if (this.phase === 'core') return engineOut(V.core.engine, this.coreEngines, 1, p).thrust;
    return engineOut(V.upper.engine, 1, 1, p).thrust;
  }

  private dropBoosters(): void {
    const V = this.vehicle;
    this.boosters = false;
    this.phase = 'core';
    const alt = this.alt;
    const each = this.boosterProp / V.boosters.count;
    for (let i = 0; i < V.boosters.count; i++) {
      const side = i === 0 ? -1 : 1;
      // (a nudge apart, so they separate cleanly)
      const sideDir = norm(cross(this.axis, this.up()));
      const off = add(scale(sideDir, side * 6.15), scale(this.axis, 0));
      this.free.push({
        name: V.boosters.stage.name,
        r: add(this.r, off),
        v: addScaled(this.v, sideDir, side * 2.5),
        axis: this.axis,
        dry: V.boosters.stage.dry,
        prop: each,
        engines: 0,
        throttle: 1,
        phase: V.boosters.land ? 'flip' : 'fall',
        t: 0,
        lz: V.boosters.land ? this.lz[i] ?? null : null,
        side,
        legs: 0,
        fins: 0,
        land: V.boosters.land,
      });
    }
    if (V.id === 'sls') this.say(`Booster separation at ${(alt / 1000).toFixed(0)} km: the two SRBs, burnt out after two minutes, tumble away toward the Atlantic.`, 'good');
    else this.say(`BECO: the side boosters shut down at ${(alt / 1000).toFixed(0)} km and separate. They flip round to fly home.`, 'good');
  }

  private dropCore(): void {
    const V = this.vehicle;
    this.coreOn = false;
    this.phase = 'upper';
    if (V.id === 'falcon-9') {
      // the first stage flies home to the drone ship, waiting where it will come down
      const st: FreeStage = { name: V.core.name, r: this.r, v: addScaled(this.v, this.axis, -2), axis: this.axis, dry: V.core.dry, prop: this.coreProp, engines: 0, throttle: 1, phase: 'coast', t: 0, lz: null, side: 0, legs: 0, fins: 0, land: true };
      st.lz = this.predictLanding(st);
      this.free.push(st);
      this.say(`MECO at ${(this.alt / 1000).toFixed(0)} km, ${(len(this.v) / 1000).toFixed(2)} km/s. Stage separation: the second stage lights its Merlin Vacuum, and the first stage flips round, grid fins out, for the drone ship ${Math.round(this.downrange(st.lz) / 1000)} km downrange.`, 'good');
      return;
    }
    this.free.push({ name: V.core.name, r: this.r, v: addScaled(this.v, this.axis, -2), axis: this.axis, dry: V.core.dry, prop: 0, engines: 0, throttle: 0, phase: 'fall', t: 0, lz: null, side: 0, legs: 0, fins: 0, land: false });
    this.say(V.id === 'sls' ? `Core stage cutoff, ${(this.alt / 1000).toFixed(0)} km, ${(len(this.v) / 1000).toFixed(2)} km/s. The core stage separates; the ICPS lights its RL10.` : `MECO: the centre core shuts down at ${(this.alt / 1000).toFixed(0)} km and separates. The second stage lights its Merlin Vacuum.`, 'good');
  }

  /** where a stage let go now would come down (Earth-fixed), flying its entry burn but not steering */
  private predictLanding(st: FreeStage): V3 {
    const ghost: FreeStage = { ...st, land: false, lz: null, axis: [...st.axis] as V3, r: [...st.r] as V3, v: [...st.v] as V3 };
    let t = this.t;
    for (let i = 0; i < 20_000 && ghost.phase !== 'gone'; i++) {
      const before = ghost.r;
      this.stepFree(ghost, 0.1);
      t += 0.1;
      if ((ghost.phase as string) === 'gone') {
        // back to the ground crossing, then Earth-fixed
        const R0 = len(before) - EARTH.R, R1 = len(ghost.r) - EARTH.R;
        const k = R0 / Math.max(1e-6, R0 - R1);
        const hit = add(before, scale(sub(ghost.r, before), k));
        return rotY(scale(norm(hit), EARTH.R + 0.5), -earthAngle(t));
      }
    }
    return rotY(scale(norm(ghost.r), EARTH.R + 0.5), -earthAngle(t));
  }

  /** ground distance from the pad to an Earth-fixed point */
  downrange(p: V3): number {
    const pad = rotY(this.padEcef, 0);
    return Math.acos(Math.max(-1, Math.min(1, dot(norm(pad), norm(p))))) * EARTH.R;
  }
  private padEcef: V3 = [0, 0, 0];

  private dropFairing(): void {
    /* the mission's renderer flies the halves off; nothing here carries mass any more */
  }

  /** the upper stage lets go of the payload (Clipper / Orion) */
  separatePayload(capsuleMass: number): void {
    this.payloadOnly = true;
    this.capsuleMass = capsuleMass;
    this.upperEngines = 0;
  }

  /** the side boosters' flight home (and anything falling) */
  private stepFree(f: FreeStage, h: number): void {
    if (f.phase === 'landed' && f.at) {
      f.r = rotY(f.at, earthAngle(this.t));
      f.v = cross([0, EARTH.spin, 0], f.r);
      return;
    }
    if (f.phase === 'gone' || f.phase === 'landed') return;
    f.t += h;
    const R = len(f.r);
    const alt = R - EARTH.R;
    const atm = air(Math.max(0, alt));
    const va = sub(f.v, airVelocity(f.r));
    const vA = len(va);
    const up = norm(f.r);
    const E = this.vehicle.boosters.stage.engine;
    const mass = f.dry + f.prop;
    let F = 0;
    const lz = f.lz ? rotY(f.lz, earthAngle(this.t)) : null;
    const lzVel = lz ? cross([0, EARTH.spin, 0], lz) : null;
    if (f.phase === 'flip') {
      // turn engines-first toward home
      const back = lz ? norm(sub(lz, f.r)) : up;
      const horiz = norm(sub(back, scale(up, dot(back, up))));
      f.axis = turnToward(f.axis, norm(add(horiz, scale(up, 0.15))), h * 18 * D2R);
      f.fins = Math.min(1, f.fins + h * 0.5);
      if (f.t > 12) {
        f.phase = 'boostback';
        f.engines = 3;
        if (f.side < 0) this.say('Boostback: the side boosters relight three engines each and turn back for the Cape.', 'info');
      }
    } else if (f.phase === 'boostback' && lz && lzVel) {
      // burn until a vacuum fall would come down a little past the landing zone (the air shortens it)
      const relV = sub(f.v, lzVel);
      const toLz = sub(lz, f.r);
      const horiz = sub(toLz, scale(up, dot(toLz, up)));
      const dist = len(horiz);
      const vh = sub(relV, scale(up, dot(relV, up)));
      const vz = dot(relV, up);
      const g = EARTH.GM / (R * R);
      const tFall = (vz + Math.sqrt(vz * vz + 2 * g * alt)) / g;
      const miss = sub(scale(vh, tFall), horiz);
      const want = norm(scale(miss, -1));
      f.axis = turnToward(f.axis, scale(want, 1), h * 6 * D2R);
      F = engineOut(E, f.engines, 1, atm.p).thrust;
      f.prop -= engineOut(E, f.engines, 1, atm.p).mdot * h;
      if (len(miss) < dist * 0.04 + 300 || f.prop < this.vehicle.boosters.stage.prop * 0.085 || f.t > 70) {
        f.phase = 'coast';
        f.engines = 0;
      }
    } else if (f.phase === 'coast') {
      // fall engines-first, grid fins out
      f.axis = turnToward(f.axis, norm(scale(va, -1)), h * 8 * D2R);
      f.fins = 1;
      if (alt < 58_000 && dot(f.v, up) < 0 && vA > 900) {
        f.phase = 'entry';
        f.engines = 3;
        if (f.side < 0) this.say('Entry burn: three engines light again to slow the boosters through the thickest heating.', 'info');
        else if (f.side === 0 && f.land) this.say('Entry burn: the first stage relights three engines to slow down through the thickest heating.', 'info');
      }
      if (alt < 40_000 && dot(f.v, up) < 0) f.phase = 'fall';
    } else if (f.phase === 'entry') {
      f.axis = turnToward(f.axis, norm(scale(va, -1)), h * 8 * D2R);
      F = engineOut(E, f.engines, 1, atm.p).thrust;
      f.prop -= engineOut(E, f.engines, 1, atm.p).mdot * h;
      // (Falcon 9's stage, alone, can afford a longer entry burn: it keeps less in reserve for the landing)
      if (vA < 520 || f.prop < this.vehicle.boosters.stage.prop * (this.vehicle.id === 'falcon-9' ? 0.018 : 0.035)) {
        f.phase = 'fall';
        f.engines = 0;
      }
    } else if (f.phase === 'fall') {
      f.axis = turnToward(f.axis, norm(scale(va, -1)), h * 8 * D2R);
      if (f.land && lz && lzVel) {
        // the grid fins steer the fall toward the landing zone
        const toLz = sub(lz, f.r);
        const horiz = sub(toLz, scale(up, dot(toLz, up)));
        const relV = sub(f.v, lzVel);
        const vh = sub(relV, scale(up, dot(relV, up)));
        const tGo = Math.max(3, alt / Math.max(50, -dot(relV, up)));
        const aCmd = sub(scale(horiz, 2 / (tGo * tGo)), scale(vh, 2 / tGo));
        const lim = Math.min(40, atm.rho * vA * vA * 0.0012);
        const ac = len(aCmd) > lim ? scale(norm(aCmd), lim) : aCmd;
        f.v = addScaled(f.v, ac, h);
        // the landing burn: one engine, timed to stop at the ground
        const vz = -dot(relV, up);
        const a1 = engineOut(E, 1, 1, atm.p).thrust / mass - EARTH.GM / (R * R);
        const groundAlt = alt - len(lz) + EARTH.R;
        // (drag slows the fall to about 250 m/s near the ground; the burn waits for the last few kilometres)
        if (vz > 0 && groundAlt < 4500 && (vz * vz) / (2 * Math.max(0.5, a1 * 0.8)) >= groundAlt - 2) {
          f.phase = 'landing';
          f.engines = 1;
          if (f.side < 0) this.say('Landing burn: one engine each. The legs swing down.', 'info');
          else if (f.side === 0) this.say('Landing burn: the centre engine relights and the four legs swing down over the drone ship.', 'info');
        }
      }
      if (alt < 0) {
        f.phase = 'gone';
        if (!f.land && f.side === 0 && this.vehicle.id === 'falcon-heavy') this.say('The centre core falls into the Atlantic, as planned for this mission.', '');
      }
    } else if (f.phase === 'landing' && lz && lzVel) {
      const relV = sub(f.v, lzVel);
      const toLz = sub(lz, f.r);
      const groundAlt = -dot(toLz, up);
      const horiz = sub(toLz, scale(up, dot(toLz, up)));
      const vh = sub(relV, scale(up, dot(relV, up)));
      const vz = -dot(relV, up);
      const g = EARTH.GM / (R * R);
      // a sink rate that comes to 1.5 m/s at the pad, and lateral steering by tilting the thrust
      const vzWant = Math.max(1.5, Math.sqrt(2 * 9 * Math.max(0, groundAlt - 0.5)));
      const aUp = g + (vz - vzWant) * 1.8;
      const aLat = add(scale(horiz, 0.12), scale(vh, -0.9));
      const latL = Math.min(len(aLat), aUp * 0.35);
      const latV = len(aLat) > 1e-6 ? scale(norm(aLat), latL) : ([0, 0, 0] as V3);
      const dir = norm(add(scale(up, aUp), latV));
      f.axis = turnToward(f.axis, dir, h * 10 * D2R);
      const full = engineOut(E, 1, 1, atm.p);
      const need = (Math.hypot(aUp, latL) * mass) / Math.max(1, full.thrust);
      f.throttle = Math.max(E.minThrottle, Math.min(1, need));
      F = full.thrust * f.throttle;
      f.prop -= full.mdot * f.throttle * h;
      f.legs = Math.min(1, f.legs + h * 0.6);
      if (groundAlt < 0.3) {
        f.phase = 'landed';
        f.engines = 0;
        // (settle onto the pad if it came down on it; otherwise where it is)
        const miss0 = len(horiz);
        if (miss0 < 40) f.r = lz;
        f.v = lzVel;
        f.axis = up;
        f.at = rotY(f.r, -earthAngle(this.t));
        const miss = len(horiz);
        if (f.side === 0) this.say(miss < 40 ? `The first stage has landed on the drone ship A Shortfall of Gravitas, ${miss.toFixed(1)} m from the centre of the deck. It will fly again.` : `The first stage came down ${Math.round(miss)} m off the drone ship.`, miss < 40 ? 'good' : 'bad');
        if (f.side > 0) this.say(miss < 40 ? `Both side boosters have landed on Landing Zones 1 and 2, seconds apart (${miss.toFixed(1)} m from the centre). They will fly again.` : `A side booster came down ${Math.round(miss)} m off its landing zone.`, miss < 40 ? 'good' : 'bad');
        return;
      }
    }
    // physics
    let acc: V3 = scale(f.r, -EARTH.GM / (R * R * R));
    acc = addScaled(acc, f.axis, F / mass);
    if (atm.rho > 0 && vA > 0.5) acc = addScaled(acc, va, (-0.5 * atm.rho * vA * 1.1 * 10.5 * (f.fins > 0.5 ? 1.15 : 1)) / mass);
    f.v = addScaled(f.v, acc, h);
    f.r = addScaled(f.r, f.v, h);
    if (f.phase !== 'landing' && f.lz && len(f.r) < len(rotY(f.lz, earthAngle(this.t))) - 1 && f.land) {
      f.phase = 'gone';
      this.say(f.side === 0 ? 'The first stage missed the drone ship.' : 'A side booster missed the landing zone.', 'bad');
    }
    if (f.t > 1200) f.phase = 'gone';
  }

  /** Orion on the way home: entry interface, the parachutes, splashdown */
  private returnHome(alt: number, vA: number): void {
    if (this.phase === 'coast' && alt < 122_000 && dot(this.v, this.up()) < 0) {
      this.phase = 'entry';
      // the service module was let go before entry: only the 9.3 t crew module comes in
      this.capsuleMass = Math.min(this.capsuleMass, 9_300);
      this.say(`Entry interface: 122 km, ${(len(this.v) / 1000).toFixed(1)} km/s. The heat shield faces 2,800 °C.`, 'good');
    }
    if (this.phase === 'entry') {
      this.axis = norm(scale(this.airVel(), -1));
      if (alt < 7_600 && vA < 250) {
        this.phase = 'chutes';
        this.chuteK = 0;
        this.say(this.vehicle.id === 'falcon-9' ? 'Parachutes: two drogues steady Dragon, then its four mains open, each 35 m across.' : 'Parachutes: two drogues at 7.6 km, then three 35 m mains open at 2.9 km.', 'good');
      }
    }
    if (this.phase === 'chutes') {
      this.chuteK = Math.min(1, this.chuteK + 0.004);
      if (alt <= 0) {
        this.phase = 'splash';
        this.v = cross([0, EARTH.spin, 0], this.r);
        this.outcome = this.vehicle.id === 'falcon-9'
          ? { ok: true, title: 'Splashdown', text: 'Crew Dragon is down in the Atlantic off Florida under its four mains. The recovery ship comes alongside to lift it aboard, and the crew are home from the space station.' }
          : { ok: true, title: 'Splashdown', text: 'Orion is down in the ocean at 30 km/h under its three mains, the crew safe home from the far side of the Moon.' };
        this.say('Splashdown!', 'good');
      }
    }
  }

  fail(title: string, text: string): void {
    if (this.outcome) return;
    this.phase = 'lost';
    this.outcome = { ok: false, title, text };
    this.say(text, 'bad');
  }

  /** where the Moon is now (ECI), and how far */
  moon(): { r: V3; d: number } {
    const m = moonState(this.t).r;
    return { r: m, d: len(sub(this.r, m)) - MOON.R };
  }
}

/** turn unit vector a toward b by at most `ang` radians */
export function turnToward(a: V3, b: V3, ang: number): V3 {
  const c = Math.max(-1, Math.min(1, dot(a, b)));
  const th = Math.acos(c);
  if (th <= ang || th < 1e-9) return b;
  let ax = cross(a, b);
  if (len(ax) < 1e-9) ax = norm(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  else ax = norm(ax);
  // Rodrigues
  const s = Math.sin(ang), cs = Math.cos(ang);
  return norm(add(add(scale(a, cs), scale(cross(ax, a), s)), scale(ax, dot(ax, a) * (1 - cs))));
}
