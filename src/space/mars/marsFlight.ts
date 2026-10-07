// The Starship mission to Mars, as a simulation: every phase from the pad to
// the Martian surface, with the guidance that flies it (or helps you fly it).
//
//  pad -> boost (Super Heavy) -> stage (hot staging) -> ship (to a 200 km
//  orbit) -> orbit -> refuel (the tanker campaign) -> tmi (trans-Mars
//  injection) -> depart (climbing out of Earth's sphere of influence) ->
//  cruise (round the Sun) -> approach (falling toward Mars) -> entry (lifting
//  entry, belly first) -> descent (the belly-flop) -> landing (flip and
//  landing burn) -> landed
//
// Frames: 'earth' is Earth-centred inertial with +Y through the North Pole
// (the frame the rest of the space program uses); 'sun' is heliocentric in
// the ecliptic (+Z north of it); 'mars' is Mars-centred with the same axes as
// 'sun' (Mars's spin axis is taken along +Z).

import type { Vec, Window } from './marsPhysics';
import {
  vadd, vsub, vscale, vdot, vcross, vlen, vnorm, vaxpy, G0, DAY, SUN_MU, EARTH_P, MARS, STARSHIP,
  marsDensity, marsPressure, earthAir, earthState, marsState, lambert, propagate, apsides, shipEngines, boosterEngines, findWindowNear,
} from './marsPhysics';

export type Phase = 'pad' | 'boost' | 'stage' | 'ship' | 'orbit' | 'refuel' | 'tmi' | 'depart' | 'cruise' | 'approach' | 'entry' | 'descent' | 'landing' | 'landed' | 'lost';
export type Frame = 'earth' | 'sun' | 'mars';

const EARTH_SPIN = 7.2921159e-5;
const PAD = { lat: 28.6, lon: -80.6 };
const D2R = Math.PI / 180;
/** the stack's frontal area and drag coefficient going up */
const STACK_A = Math.PI * 4.5 * 4.5;
const STACK_CD = 0.55;
/** the ship's centre of mass above its leg feet (a nearly empty ship), m */
export const SHIP_COM = 17.5;

const rotY = (a: Vec, ang: number): Vec => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [a[0] * c + a[2] * s, a[1], -a[0] * s + a[2] * c];
};
const rotZ = (a: Vec, ang: number): Vec => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c, a[2]];
};
export function ecefDir(lat: number, lon: number): Vec {
  const p = lat * D2R, l = lon * D2R;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
}
function eastAt(lat: number, lon: number): Vec {
  const l = lon * D2R;
  return [-Math.sin(l), 0, -Math.cos(l)];
  void lat;
}
/** rotate unit vector a toward b by at most `maxAng` radians */
export function turnToward(a: Vec, b: Vec, maxAng: number): Vec {
  const c = Math.max(-1, Math.min(1, vdot(a, b)));
  const ang = Math.acos(c);
  if (ang <= maxAng || ang < 1e-9) return vnorm(b);
  let ax = vcross(a, b);
  if (vlen(ax) < 1e-9) ax = Math.abs(a[0]) < 0.9 ? vcross(a, [1, 0, 0]) : vcross(a, [0, 1, 0]);
  ax = vnorm(ax);
  // Rodrigues
  const s = Math.sin(maxAng), cc = Math.cos(maxAng);
  return vnorm(vadd(vadd(vscale(a, cc), vscale(vcross(ax, a), s)), vscale(ax, vdot(ax, a) * (1 - cc))));
}

export interface Booster {
  r: Vec;
  v: Vec;
  axis: Vec;
  prop: number;
  engines: number;
  throttle: number;
  phase: 'flip' | 'boostback' | 'coast' | 'gone';
  t: number;
}

export interface LogLine {
  t: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
}

export interface Controls {
  /** -1..1 stick: pitch and yaw tilt the thrust in the local frame */
  pitch: number;
  yaw: number;
  /** throttle change per second (-1..1) */
  throttle: number;
}

export class MarsFlight {
  /** Julian date at t = 0 (liftoff time on the pad) */
  readonly jd0: number;
  readonly window: Window;
  t = 0;
  phase: Phase = 'pad';
  frame: Frame = 'earth';
  r: Vec = [0, 0, 0];
  v: Vec = [0, 0, 0];
  /** where the nose points */
  axis: Vec = [0, 1, 0];
  /** which way the belly (the heat shield) faces */
  belly: Vec = [1, 0, 0];
  boosterProp: number = STARSHIP.booster.prop;
  shipProp: number = STARSHIP.ship.prop;
  stacked = true;
  booster: Booster | null = null;
  throttle = 1;
  /** engines lit: booster (0..33) and the ship's sea-level / vacuum Raptors */
  bEng = 0;
  sEng = 0;
  vEng = 0;
  /** guidance flies it; off: the pilot does */
  auto = true;
  controls: Controls = { pitch: 0, yaw: 0, throttle: 0 };
  /** 0 stowed .. 1 down */
  legs = 0;
  /** flap angle for the picture: 0 folded flat .. 1 out for the belly-flop */
  flaps = 0;
  /** entry heating, W/m^2 at the stagnation point (for the plasma glow) */
  heat = 0;
  /** aerodynamic deceleration, m/s^2 */
  aeroAcc = 0;
  /** current acceleration felt (g) */
  gLoad = 1;
  /** bank angle in the entry (deg) */
  bank = 0;
  /** surface height under the ship (Mars), set by the view's terrain */
  groundH: (lat: number, lon: number) => number = () => 0;
  log: LogLine[] = [];
  outcome: { ok: boolean; title: string; text: string } | null = null;
  /** cruise: the conic and when it reaches Mars's sphere of influence */
  private cruise: { r0: Vec; v0: Vec; t0: number; tSoi: number; tcm: number } | null = null;
  /** the approach conic (Mars frame) */
  private conic: { r0: Vec; v0: Vec; t0: number } | null = null;
  /** Earth-departure conic */
  private depart: { r0: Vec; v0: Vec; t0: number } | null = null;
  /** LEO conic while coasting (exact and cheap at any warp) */
  private leo: { r0: Vec; v0: Vec; t0: number } | null = null;
  /** Mars's rotation angle at t = 0 */
  /** Mars's rotation angle when the clock read zero (fixed once the landing site is chosen) */
  marsRot0 = 0.7;
  /** the chosen landing site */
  site: { lat: number; lon: number } | null = null;
  private predicting = false;
  private tmiTarget = 0;
  private tmiVinf = 0;
  private flipT = -1;
  maxQ = 0;
  /** the entry glide's smoothed ground level (m), set at the entry interface */
  private gSmooth: number | null = null;
  /** mission time of liftoff */
  launchT = 0;
  touchdown: { vz: number; vh: number; tilt: number } | null = null;

  constructor(nowJd: number) {
    this.window = findWindowNear(nowJd);
    // the tankers need three weeks in orbit; launch so the ship is ready as the window opens
    this.jd0 = this.window.dep - 21 - 3.5;
    this.placeOnPad();
  }

  get jd(): number {
    return this.jd0 + this.t / DAY;
  }
  get mass(): number {
    const s = STARSHIP.ship.dry + STARSHIP.ship.cargo + this.shipProp;
    return this.stacked ? s + STARSHIP.booster.dry + this.boosterProp : s;
  }

  // ------------------------------------------------------------ Earth helpers
  private earthAng(): number {
    return EARTH_SPIN * this.t;
  }
  padPos(): Vec {
    return vscale(rotY(ecefDir(PAD.lat, PAD.lon), this.earthAng()), EARTH_P.R);
  }
  private placeOnPad(): void {
    const up = vnorm(this.padPos());
    // the stack's centre of mass ~45 m above the ground
    this.r = vaxpy(this.padPos(), up, 45);
    this.v = vcross([0, EARTH_SPIN, 0], this.r);
    this.axis = up;
    this.belly = vnorm(rotY(eastAt(PAD.lat, PAD.lon), this.earthAng()));
  }
  /** altitude above the reference sphere of the current body */
  get alt(): number {
    if (this.frame === 'earth') return vlen(this.r) - EARTH_P.R;
    if (this.frame === 'mars') return vlen(this.r) - MARS.R;
    return Infinity;
  }
  /** Mars-fixed latitude / longitude (deg) of a Mars-frame position */
  marsLatLon(p: Vec = this.r): { lat: number; lon: number } {
    const f = rotZ(p, -(this.marsRot0 + MARS.spin * this.t));
    const R = vlen(f);
    return { lat: Math.asin(f[2] / R) / D2R, lon: Math.atan2(f[1], f[0]) / D2R };
  }
  /** a Mars-fixed point (unit vector) in the Mars frame now */
  marsFixedToFrame(f: Vec): Vec {
    return rotZ(f, this.marsRot0 + MARS.spin * this.t);
  }
  marsAngle(): number {
    return this.marsRot0 + MARS.spin * this.t;
  }
  /** height above the ground (Mars: terrain; Earth: sphere) */
  get agl(): number {
    if (this.frame !== 'mars') return this.alt;
    const ll = this.marsLatLon();
    return this.alt - this.groundH(ll.lat, ll.lon) - this.bottom();
  }
  /** from the centre of mass down to the lowest point: the leg feet upright, the hull lying flat */
  bottom(): number {
    const c = Math.max(0, vdot(this.axis, this.up()));
    return SHIP_COM * c + 4.5 * (1 - c);
  }
  /** velocity relative to the air (or ground) */
  airVel(): Vec {
    if (this.frame === 'earth') return vsub(this.v, vcross([0, EARTH_SPIN, 0], this.r));
    if (this.frame === 'mars') return vsub(this.v, vcross([0, 0, MARS.spin], this.r));
    return this.v;
  }
  up(): Vec {
    return vnorm(this.r);
  }
  /** vertical and horizontal speed relative to the ground */
  speeds(): { vz: number; vh: number; v: number } {
    const va = this.airVel();
    const u = this.up();
    const vz = vdot(va, u);
    return { vz, vh: vlen(vsub(va, vscale(u, vz))), v: vlen(va) };
  }
  sunDir(): Vec {
    // from the planet the Sun is opposite the planet's heliocentric position
    const p = this.frame === 'earth' ? earthState(this.jd).r : marsState(this.jd).r;
    return vnorm(vscale(p, -1));
  }
  /** heliocentric position of the ship (any frame) */
  helio(): Vec {
    if (this.frame === 'sun') return this.r;
    if (this.frame === 'mars') return vadd(marsState(this.jd).r, this.r);
    // Earth frame: rotate ECI (Y north) into the ecliptic (Z north), roughly
    const e = earthState(this.jd).r;
    const eps = 23.44 * D2R;
    const x = this.r[0], y = this.r[2], z = this.r[1];
    return vadd(e, [x, y * Math.cos(eps) + z * Math.sin(eps), -y * Math.sin(eps) + z * Math.cos(eps)]);
  }
  orbit(): { pe: number; ap: number } | null {
    const mu = this.frame === 'earth' ? EARTH_P.mu : this.frame === 'mars' ? MARS.mu : SUN_MU;
    const Rb = this.frame === 'earth' ? EARTH_P.R : this.frame === 'mars' ? MARS.R : 0;
    const a = apsides(this.r, this.v, mu);
    return { pe: a.rp - Rb, ap: a.ra === Infinity ? Infinity : a.ra - Rb };
  }

  say(text: string, kind: LogLine['kind'] = 'info'): void {
    this.log.push({ t: this.t, text, kind });
    if (this.log.length > 60) this.log.shift();
  }

  // ------------------------------------------------------------ commands
  launch(): void {
    if (this.phase !== 'pad') return;
    this.phase = 'boost';
    this.launchT = this.t;
    this.bEng = 33;
    this.throttle = 1;
    this.say('Liftoff! All 33 Raptors running.', 'good');
  }
  /** fill the ship in orbit (the tanker campaign), ready for the window */
  refuel(): void {
    if (this.phase !== 'orbit') return;
    this.phase = 'refuel';
    this.say('Propellant transfer: the tanker campaign begins.');
  }
  /** start the trans-Mars injection burn */
  tmi(): void {
    if (this.phase !== 'orbit' || this.shipProp < STARSHIP.ship.prop * 0.95) return;
    this.phase = 'tmi';
    // the excess speed needed where the ship will leave Earth's influence, three days on
    const tExit = this.jd + 3;
    const e3 = earthState(tExit);
    const l3 = lambert(e3.r, marsState(this.window.arr).r, (this.window.arr - tExit) * DAY, SUN_MU);
    const vinf = l3 ? vlen(vsub(l3.v1, e3.v)) : this.window.vInfDep;
    this.tmiVinf = vinf;
    this.tmiTarget = Math.sqrt(vinf ** 2 + (2 * EARTH_P.mu) / vlen(this.r));
    this.sEng = 3;
    this.vEng = 3;
    this.throttle = 1;
    this.say(`Trans-Mars injection: ${Math.round(this.tmiTarget - vlen(this.v))} m/s burn.`, 'good');
  }
  /** seconds until the window opens (negative once it has) */
  get toWindow(): number {
    return (this.window.dep - 3.5 - this.jd) * DAY;
  }

  // ------------------------------------------------------------ the clock
  /** advance by dt seconds of mission time */
  advance(dt: number): void {
    if (this.outcome && this.phase !== 'landed') return;
    if (this.phase === 'pad') {
      // holding on the pad: the Earth turns under the stack
      this.t += dt;
      this.placeOnPad();
      return;
    }
    if (this.phase === 'landed') {
      this.t += dt;
      this.holdOnMars();
      return;
    }
    // conic phases are exact for any step
    if (this.phase === 'orbit' && !this.leoNeedsSteps()) return this.coastConic(dt, 'leo');
    if (this.phase === 'refuel') return this.stepRefuel(dt);
    if (this.phase === 'depart') return this.coastConic(dt, 'depart');
    if (this.phase === 'cruise') return this.stepCruise(dt);
    if (this.phase === 'approach') return this.stepApproach(dt);
    // powered or in the air: small fixed steps
    const h = this.phase === 'entry' ? 0.1 : this.phase === 'landing' ? 0.02 : 0.05;
    let n = Math.ceil(dt / h);
    // a very high warp in powered flight: keep the work per frame bounded (coarser steps)
    const maxN = 20000;
    const hh = n > maxN ? dt / maxN : dt / n;
    n = Math.min(n, maxN);
    for (let i = 0; i < n; i++) {
      this.step(hh);
      if (this.outcome) break;
      // (step() may have moved the flight into a coasting phase)
      const ph = this.phase as Phase;
      if (ph === 'orbit' || ph === 'depart' || ph === 'cruise' || ph === 'approach' || ph === 'landed') {
        const rest = dt - (i + 1) * hh;
        if (rest > 0) this.advance(rest);
        break;
      }
    }
  }

  private leoNeedsSteps(): boolean {
    return !!(this.booster && this.booster.phase !== 'gone');
  }

  private coastConic(dt: number, which: 'leo' | 'depart'): void {
    const c = which === 'leo' ? (this.leo ??= { r0: this.r, v0: this.v, t0: this.t }) : this.depart!;
    this.t += dt;
    const s = propagate(c.r0, c.v0, this.t - c.t0, EARTH_P.mu);
    this.r = s.r;
    this.v = s.v;
    this.pointPrograde(dt);
    if (which === 'depart' && vlen(this.r) > EARTH_P.soi) this.leaveEarth();
  }

  private pointPrograde(dt: number): void {
    this.axis = turnToward(this.axis, vnorm(this.v), dt * 0.05);
  }

  private stepRefuel(dt: number): void {
    // tankers dock one after another over three weeks; the ship tops up
    this.t += dt;
    const c = (this.leo ??= { r0: this.r, v0: this.v, t0: this.t });
    const s = propagate(c.r0, c.v0, this.t - c.t0, EARTH_P.mu);
    this.r = s.r;
    this.v = s.v;
    const need = STARSHIP.ship.prop - this.shipProp;
    const rate = STARSHIP.ship.prop / (21 * DAY);
    const before = Math.floor((this.shipProp / STARSHIP.ship.prop) * 10);
    this.shipProp = Math.min(STARSHIP.ship.prop, this.shipProp + rate * dt);
    const after = Math.floor((this.shipProp / STARSHIP.ship.prop) * 10);
    if (after > before && after < 10) this.say(`Tanker ${after} docked: propellant ${after * 10}%.`);
    if (need <= rate * dt) {
      this.phase = 'orbit';
      this.say('Tanks full: 1,550 t of methane and liquid oxygen. Ready for Mars.', 'good');
    }
  }

  private leaveEarth(): void {
    // patch to the Sun: the ship leaves Earth's sphere of influence; aim the
    // conic exactly at Mars's arrival point (the correction burn is reported)
    const e = earthState(this.jd);
    const vEsc = vlen(this.v);
    const tof = (this.window.arr - this.jd) * DAY;
    const l = lambert(e.r, marsState(this.window.arr).r, tof, SUN_MU);
    this.frame = 'sun';
    this.r = e.r;
    if (l) {
      const vinf = vsub(l.v1, e.v);
      const corr = Math.abs(vlen(vinf) - vEsc);
      this.v = l.v1;
      this.burnDv(corr);
      this.say(`Left Earth's sphere of influence. Course correction TCM-1: ${corr.toFixed(0)} m/s.`, 'good');
    } else {
      this.v = vadd(e.v, vscale(vnorm(e.v), vEsc));
    }
    this.phase = 'cruise';
    this.leo = null;
    this.depart = null;
    // when the ship meets Mars's sphere of influence
    let lo = this.t, hi = this.t + tof;
    const dist = (t: number) => {
      const s = propagate(this.r, this.v, t - this.t, SUN_MU);
      return vlen(vsub(s.r, marsState(this.jd0 + t / DAY).r));
    };
    for (let i = 0; i < 80; i++) {
      const m = 0.5 * (lo + hi);
      if (dist(m) > MARS.soi) lo = m;
      else hi = m;
    }
    this.cruise = { r0: this.r, v0: this.v, t0: this.t, tSoi: hi, tcm: 0 };
    this.axis = vnorm(this.v);
  }

  private stepCruise(dt: number): void {
    const c = this.cruise!;
    this.t = Math.min(this.t + dt, c.tSoi);
    const s = propagate(c.r0, c.v0, this.t - c.t0, SUN_MU);
    this.r = s.r;
    this.v = s.v;
    // keep the belly to the Sun's heat? no: the nose toward the Sun's side, a slow roll
    this.axis = vnorm(vcross([0, 0, 1], vnorm(this.r)));
    if (this.t >= c.tSoi) this.enterMars(dt - (c.tSoi - (this.t - dt)));
  }

  private enterMars(rest: number): void {
    const m = marsState(this.jd);
    let r = vsub(this.r, m.r);
    const v = vsub(this.v, m.v);
    const vinf = vlen(v);
    // final targeting (TCM-3): set the miss distance for a periapsis in the atmosphere
    const rp = MARS.R + 28_000;
    const B = rp * Math.sqrt(1 + (2 * MARS.mu) / (rp * vinf * vinf));
    const vh = vnorm(v);
    // the approach side that brings the ship down on the day side
    let p = vnorm(vcross(vh, [0, 0, 1]));
    const sun = vnorm(vscale(m.r, -1));
    if (vdot(p, sun) < 0) p = vscale(p, -1);
    const along = vdot(r, vh);
    const before = r;
    r = vadd(vscale(vh, along), vscale(p, B));
    this.frame = 'mars';
    this.r = r;
    this.v = v;
    this.cruise = null;
    this.phase = 'approach';
    this.conic = { r0: this.r, v0: this.v, t0: this.t };
    const trim = vlen(vsub(r, before));
    const dv = (vinf * trim) / Math.max(1, vlen(before));
    this.burnDv(dv);
    this.say(`Entered Mars's sphere of influence at ${(vinf / 1000).toFixed(2)} km/s. TCM-3 (${dv.toFixed(0)} m/s) trims the aim point by ${Math.round(trim / 1000)} km for entry.`, 'good');
    if (!this.predicting) this.chooseSite();
    if (rest > 0) this.advance(rest);
  }

  /**
   * Mission planning: the arrival is timed so the ship comes down on low, open
   * plains (thick air to brake in, room to land) rather than on Tharsis or a
   * canyon wall. Fly the approach once ahead of time to see where it lands,
   * then shift the arrival (Mars's rotation under the track) to put that spot
   * on the best ground along the same latitude.
   */
  private chooseSite(): void {
    const sim = Object.assign(Object.create(Object.getPrototypeOf(this)), this) as MarsFlight;
    sim.predicting = true;
    sim.log = [];
    sim.auto = true;
    for (let i = 0; i < 4000 && sim.phase === 'approach'; i++) sim.advance(120);
    for (let i = 0; i < 40000 && (sim.phase === 'entry' || sim.phase === 'descent' || sim.phase === 'landing'); i++) sim.advance(0.2);
    if (!sim.touchdownFixed) return;
    // where it came down, as a direction fixed in space at the touchdown time
    const ll = sim.marsLatLon(sim.r);
    const inertial = ll.lon * D2R + sim.marsAngle();
    // score every longitude on that latitude: low and smooth is good
    const score = (lon: number) => {
      let sum = 0, sq = 0;
      for (const [dl, dn] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [1.2, 0], [-1.2, 0]]) {
        const hh = this.groundH(ll.lat + dn, lon + dl);
        sum += hh;
        sq += hh * hh;
      }
      const mean = sum / 7;
      const rough = Math.sqrt(Math.max(0, sq / 7 - mean * mean));
      return mean + rough * 4;
    };
    let best = ll.lon, bestS = Infinity;
    for (let lon = -180; lon < 180; lon += 2) {
      const sc = score(lon);
      if (sc < bestS) {
        bestS = sc;
        best = lon;
      }
    }
    // the same touchdown time puts longitude `best` under the point if Mars is turned by the difference
    this.marsRot0 += (ll.lon - best) * D2R;
    void inertial;
    this.site = { lat: ll.lat, lon: best };
    this.say(`Landing site chosen: ${best >= 0 ? best.toFixed(0) + '°E' : (-best).toFixed(0) + '°W'}, ${Math.abs(ll.lat).toFixed(0)}°${ll.lat >= 0 ? 'N' : 'S'}, low open plains with thick air to brake in.`, 'good');
  }

  private stepApproach(dt: number): void {
    const c = this.conic!;
    // propagate on the conic; switch to the atmosphere at the entry interface
    const tEnd = this.t + dt;
    const at = (t: number) => propagate(c.r0, c.v0, t - c.t0, MARS.mu);
    // a long step must not jump over the atmosphere: look for the crossing all along it
    // (sub-steps no longer than the time to fall from here to the entry interface)
    let lo = this.t, hi = -1;
    while (lo < tEnd) {
      const p = at(lo);
      const room = vlen(p.r) - MARS.R - MARS.top;
      const step = Math.min(tEnd - lo, Math.max(2, room / Math.max(1, vlen(p.v)) * 0.5));
      const next = lo + step;
      if (vlen(at(next).r) - MARS.R <= MARS.top) {
        hi = next;
        break;
      }
      lo = next;
    }
    if (hi < 0) {
      const s = at(tEnd);
      this.t = tEnd;
      this.r = s.r;
      this.v = s.v;
      this.axis = turnToward(this.axis, vscale(vnorm(this.v), -1), dt * 0.02);
      return;
    }
    // find the crossing of the entry interface
    for (let i = 0; i < 60; i++) {
      const m = 0.5 * (lo + hi);
      if (vlen(at(m).r) - MARS.R > MARS.top) lo = m;
      else hi = m;
    }
    const e = at(hi);
    this.t = hi;
    this.r = e.r;
    this.v = e.v;
    this.phase = 'entry';
    // vent what the landing will not need: a lighter ship slows down higher
    const extra = this.shipProp - STARSHIP.ship.landingProp;
    if (extra > 0) {
      this.shipProp -= extra;
      this.say(`Vented ${Math.round(extra / 1000)} t of surplus propellant before entry.`);
    }
    const sp = this.speeds();
    const gam = Math.asin(sp.vz / sp.v) / D2R;
    this.say(`Entry interface: ${(sp.v / 1000).toFixed(2)} km/s, flight path ${gam.toFixed(1)}°. Belly first into the atmosphere.`, 'good');
    this.axis = this.horizontalAxis();
    if (tEnd - hi > 0) this.advance(tEnd - hi);
  }

  /** nose forward along the ground track, flat (the belly-first attitude) */
  private horizontalAxis(): Vec {
    const va = this.airVel();
    const u = this.up();
    const h = vsub(va, vscale(u, vdot(va, u)));
    return vlen(h) > 1 ? vnorm(h) : vnorm(vcross(u, [0, 0, 1]));
  }

  /** pay for a small correction burn with the vacuum Raptors (rocket equation) */
  private burnDv(dv: number): void {
    const used = this.mass * (1 - Math.exp(-dv / (STARSHIP.ship.vac.ispVac * G0)));
    this.shipProp = Math.max(0, this.shipProp - used);
  }

  private holdOnMars(): void {
    // standing on the ground: ride round with Mars
    if (!this.touchdownFixed) return;
    const p = this.marsFixedToFrame(this.touchdownFixed.p);
    this.r = p;
    this.v = vcross([0, 0, MARS.spin], p);
    this.axis = vnorm(p);
  }
  private touchdownFixed: { p: Vec } | null = null;

  // ------------------------------------------------------------ the integrator
  private step(h: number): void {
    switch (this.phase) {
      case 'boost':
      case 'stage':
        this.stepAscent(h);
        break;
      case 'ship':
      case 'tmi':
        this.stepShipEarth(h);
        break;
      case 'orbit':
        this.stepShipEarth(h);
        break;
      case 'entry':
      case 'descent':
      case 'landing':
        this.stepMars(h);
        break;
    }
    if (this.booster && this.booster.phase !== 'gone') this.stepBooster(h);
    this.t += h;
  }

  private gravity(mu: number, r: Vec): Vec {
    const R = vlen(r);
    return vscale(r, -mu / (R * R * R));
  }

  private stepAscent(h: number): void {
    const alt = this.alt;
    const air = earthAir(alt);
    const va = this.airVel();
    const V = vlen(va);
    const q = 0.5 * air.rho * V * V;
    this.maxQ = Math.max(this.maxQ, q);
    // guidance: straight up off the tower, a small kick east, then a gravity turn
    const up = this.up();
    const east = vnorm(rotY(eastAt(PAD.lat, PAD.lon), this.earthAng()));
    let want: Vec;
    if (alt < 400) want = up;
    else if (V < 110) want = vnorm(vadd(up, vscale(east, 0.09)));
    else {
      want = vnorm(va);
      // never pitch below a profile that keeps the climb going
      const pitch = Math.asin(Math.max(-1, Math.min(1, vdot(want, up))));
      const minPitch = (Math.max(18, 82 - alt / 1300) * Math.PI) / 180;
      if (pitch < minPitch) want = vnorm(vadd(vscale(up, Math.sin(minPitch)), vscale(vnorm(vsub(want, vscale(up, vdot(want, up)))), Math.cos(minPitch))));
    }
    if (!this.auto) want = this.manualTilt(want);
    this.axis = turnToward(this.axis, want, h * 4 * D2R);
    // throttle back through max-Q
    if (this.auto) this.throttle = alt > 8000 && alt < 15000 ? 0.75 : 1;
    let F = 0;
    if (this.phase === 'boost') {
      const e = boosterEngines(air.p, this.bEng);
      F = e.thrust * this.throttle;
      this.boosterProp -= e.mdot * this.throttle * h;
      if (this.boosterProp <= STARSHIP.booster.prop * STARSHIP.booster.reserve) {
        this.phase = 'stage';
        this.flipT = this.t;
        this.bEng = 3;
        this.sEng = 3;
        this.vEng = 3;
        this.say(`MECO at ${(alt / 1000).toFixed(0)} km, ${(V / 1000).toFixed(2)} km/s. Hot staging: the ship lights its Raptors.`, 'good');
      }
    } else {
      // hot staging: the booster's three centre engines hold it while the ship pulls away
      const e = shipEngines(air.p, this.sEng, this.vEng);
      F = e.thrust;
      this.shipProp -= e.mdot * h;
      if (this.t - this.flipT > 1.5) this.separate();
    }
    const drag = V > 1 ? vscale(va, (-q * STACK_CD * STACK_A) / (V * this.mass)) : [0, 0, 0] as Vec;
    const acc = vadd(vadd(this.gravity(EARTH_P.mu, this.r), vscale(this.axis, F / this.mass)), drag);
    this.gLoad = vlen(vsub(acc, this.gravity(EARTH_P.mu, this.r))) / G0;
    this.v = vaxpy(this.v, acc, h);
    this.r = vaxpy(this.r, this.v, h);
    if (vlen(this.r) < EARTH_P.R + 30 && this.t > 5) this.fail('Lost', 'The stack fell back to the ground.');
  }

  private separate(): void {
    this.stacked = false;
    this.phase = 'ship';
    const bp = this.boosterProp;
    this.booster = { r: vaxpy(this.r, this.axis, -55), v: vaxpy(this.v, this.axis, -3), axis: this.axis, prop: bp, engines: 0, throttle: 1, phase: 'flip', t: 0 };
    this.say('Separation. Super Heavy flips for the boostback burn.');
  }

  private stepBooster(h: number): void {
    const b = this.booster!;
    b.t += h;
    const R = vlen(b.r);
    const alt = R - EARTH_P.R;
    const air = earthAir(alt);
    const va = vsub(b.v, vcross([0, EARTH_SPIN, 0], b.r));
    const mass = STARSHIP.booster.dry + b.prop;
    let F = 0;
    if (b.phase === 'flip') {
      b.axis = turnToward(b.axis, vscale(vnorm(va), -1), h * 20 * D2R);
      if (b.t > 9) {
        b.phase = 'boostback';
        b.engines = 13;
      }
    } else if (b.phase === 'boostback') {
      const e = boosterEngines(air.p, b.engines);
      F = e.thrust;
      b.prop -= e.mdot * h;
      if (b.prop < STARSHIP.booster.prop * 0.025 || b.t > 60) {
        b.phase = 'coast';
        b.engines = 0;
      }
    } else {
      b.axis = turnToward(b.axis, vscale(vnorm(va), -1), h * 5 * D2R);
    }
    const q = 0.5 * air.rho * vlen(va) ** 2;
    const drag = vlen(va) > 1 ? vscale(vnorm(va), (-q * 1.2 * STACK_A) / mass) : ([0, 0, 0] as Vec);
    const acc = vadd(vadd(this.gravity(EARTH_P.mu, b.r), vscale(b.axis, F / mass)), drag);
    b.v = vaxpy(b.v, acc, h);
    b.r = vaxpy(b.r, b.v, h);
    if (alt < 0 || b.t > 600) {
      b.phase = 'gone';
    }
  }

  /** the ship under its own power round the Earth: to orbit, or the injection burn */
  private stepShipEarth(h: number): void {
    const alt = this.alt;
    const air = earthAir(alt);
    const up = this.up();
    const mu = EARTH_P.mu;
    let F = 0, mdot = 0;
    if (this.phase === 'ship') {
      // closed-loop guidance to a 200 km orbit: hold a climb rate, build horizontal speed
      const vz = vdot(this.v, up);
      const vhv = vsub(this.v, vscale(up, vz));
      const vh = vlen(vhv);
      const R = vlen(this.r);
      const e = shipEngines(air.p, this.sEng, this.vEng);
      const a = e.thrust / this.mass;
      const vzCmd = Math.max(-60, Math.min(400, (200_000 - alt) / 45));
      const az = (vzCmd - vz) / 12 + mu / (R * R) - (vh * vh) / R;
      const s = Math.max(-0.4, Math.min(0.85, az / a));
      let want = vnorm(vadd(vscale(up, s), vscale(vnorm(vhv), Math.sqrt(1 - s * s))));
      if (!this.auto) want = this.manualTilt(want);
      this.axis = turnToward(this.axis, want, h * 3 * D2R);
      // no more than 3.5 g as the tanks empty
      this.throttle = this.auto ? Math.max(STARSHIP.minThrottle, Math.min(1, (3.5 * G0 * this.mass) / e.thrust)) : this.throttle;
      F = e.thrust * this.throttle;
      mdot = e.mdot * this.throttle;
      const o = this.orbit()!;
      if (o.pe > 185_000 || (o.pe > 150_000 && vh > Math.sqrt(mu / R))) {
        this.phase = 'orbit';
        this.sEng = this.vEng = 0;
        this.leo = null;
        this.say(`SECO. Orbit ${Math.round(o.pe / 1000)} x ${Math.round(o.ap / 1000)} km with ${Math.round(this.shipProp / 1000)} t of propellant left.`, 'good');
        return;
      }
      if (this.shipProp <= 0) this.fail('Out of propellant', 'The ship ran dry before reaching orbit.');
    } else if (this.phase === 'tmi') {
      const e = shipEngines(0, this.sEng, this.vEng);
      this.axis = turnToward(this.axis, vnorm(this.v), h * 3 * D2R);
      F = e.thrust * this.throttle;
      mdot = e.mdot * this.throttle;
      // the energy target at the height the ship has climbed to
      this.tmiTarget = Math.sqrt(this.tmiVinf ** 2 + (2 * EARTH_P.mu) / vlen(this.r));
      if (vlen(this.v) >= this.tmiTarget || this.shipProp <= 0) {
        this.sEng = this.vEng = 0;
        this.phase = 'depart';
        this.depart = { r0: this.r, v0: this.v, t0: this.t + h };
        this.say(`Injection complete: on the way to Mars. ${Math.round(this.shipProp / 1000)} t of propellant left.`, 'good');
      }
    }
    this.shipProp = Math.max(0, this.shipProp - mdot * h);
    const va = this.airVel();
    const V = vlen(va);
    const q = 0.5 * air.rho * V * V;
    const drag = V > 1 ? vscale(va, (-q * 0.5 * STACK_A) / (V * this.mass)) : ([0, 0, 0] as Vec);
    const acc = vadd(vadd(this.gravity(mu, this.r), vscale(this.axis, F / this.mass)), drag);
    this.gLoad = vlen(vsub(acc, this.gravity(mu, this.r))) / G0;
    this.v = vaxpy(this.v, acc, h);
    this.r = vaxpy(this.r, this.v, h);
  }

  /** the pilot's stick tilts the guidance's direction a little */
  private manualTilt(want: Vec): Vec {
    const c = this.controls;
    const up = this.up();
    let side = vcross(want, up);
    if (vlen(side) < 1e-6) side = vcross(want, [0, 0, 1]);
    side = vnorm(side);
    const fwd = vnorm(vcross(up, side));
    return vnorm(vadd(vadd(want, vscale(fwd, -c.pitch * 0.35)), vscale(side, c.yaw * 0.35)));
  }

  // ------------------------------------------------------------ Mars: entry, belly-flop, landing
  private stepMars(h: number): void {
    const alt = this.alt;
    const ll = this.marsLatLon();
    const ground = this.groundH(ll.lat, ll.lon);
    // height of the lowest point of the ship (the legs upright, the hull lying flat)
    const agl = alt - ground - this.bottom();
    // what the guidance flies by: the highest ground under the ship and where it will be in
    // two and five seconds (so hills and canyon walls ahead are no surprise)
    const vg = this.airVel();
    const upg = this.up();
    const vhg = vsub(vg, vscale(upg, vdot(vg, upg)));
    const gAhead = (s: number) => {
      const q = this.marsLatLon(vaxpy(this.r, vhg, s));
      return this.groundH(q.lat, q.lon);
    };
    const aglG = this.phase === 'entry' ? agl : alt - this.bottom() - Math.max(ground, gAhead(2), gAhead(5));
    // a smoothed ground level for the entry glide (it should not chase every canyon)
    this.gSmooth = this.gSmooth === null ? ground : this.gSmooth + (ground - this.gSmooth) * (1 - Math.exp(-h / 25));
    const rho = marsDensity(alt);
    const p = marsPressure(alt);
    const va = this.airVel();
    const V = vlen(va);
    const up = this.up();
    const R = vlen(this.r);
    const s = STARSHIP.ship;
    const q = 0.5 * rho * V * V;
    this.heat = 1.7415e-4 * Math.sqrt(rho / 4.5) * V * V * V;
    let aero: Vec = [0, 0, 0];
    if (V > 1) {
      const vh = vscale(va, 1 / V);
      // broadside (belly first) until the flip, nose-on after it
      const D = this.phase === 'landing' ? q * 0.8 * STACK_A * 1.5 : q * s.cdBelly * s.area;
      aero = vscale(vh, -D);
      if (this.phase === 'entry') {
        // lift from the body at entry angle of attack, steered by banking
        const L = D * s.ld;
        const l0raw = vsub(up, vscale(vh, vdot(up, vh)));
        const l0 = vlen(l0raw) > 1e-6 ? vnorm(l0raw) : up;
        const vz = vdot(va, up);
        const vhor = Math.sqrt(Math.max(0, V * V - vz * vz));
        // equilibrium glide: aim for an altitude that falls as the speed does
        const hT = 9_000 + 24_000 * Math.max(0, Math.min(1, (V - 500) / 4500));
        // (the target is a height over the ground below: Tharsis stands 9 km above the datum)
        const vzCmd = Math.max(-250, Math.min(120, (hT - (alt - this.gSmooth)) / 25));
        const need = (vzCmd - vz) / 6 + MARS.mu / (R * R) - (vhor * vhor) / R;
        const cb = this.auto ? Math.max(-1, Math.min(1, (need * this.mass) / Math.max(1, L))) : Math.max(-1, Math.min(1, 1 - Math.abs(this.controls.yaw) * 2)) * (this.controls.pitch < -0.5 ? -1 : 1);
        this.bank = (Math.acos(cb) * 180) / Math.PI;
        const side = vnorm(vcross(vh, l0));
        aero = vadd(aero, vscale(vadd(vscale(l0, cb), vscale(side, Math.sqrt(1 - cb * cb))), L));
      }
    }
    this.aeroAcc = vlen(aero) / this.mass;
    let thrust: Vec = [0, 0, 0];
    if (this.phase === 'entry') {
      this.axis = turnToward(this.axis, this.horizontalAxis(), h * 2 * D2R);
      this.flaps = Math.max(0, this.flaps - h * 0.2);
      // slow enough for the belly-flop, or (over high ground) running out of height
      if (V < 900 || alt - this.gSmooth < 5_500) {
        this.phase = 'descent';
        this.say(`Entry complete at ${(alt / 1000).toFixed(1)} km, ${Math.round(V)} m/s. Belly-flop: the flaps steer the fall.`, 'good');
      }
    } else if (this.phase === 'descent') {
      this.flaps = Math.min(1, this.flaps + h * 0.5);
      this.axis = turnToward(this.axis, this.horizontalAxis(), h * 6 * D2R);
      // when to light the engines: the burn from here (with the flip) stops just above the ground
      const vz = -vdot(va, up);
      const e = shipEngines(p, 3, 0);
      const aNet = (e.thrust * 0.85) / this.mass - MARS.g;
      // the burn takes V / aNet seconds; the ship keeps falling while it slows
      const stop = (Math.max(0, vz) * V) / (2 * Math.max(1, aNet));
      // or when the fall leaves too little time to cancel the whole speed (most of it is sideways)
      const tFall = aglG / Math.max(1, vz);
      const tNeed = V / Math.max(1, aNet);
      if ((this.auto && (aglG < stop * 1.3 + vz * 4.5 + 300 || tFall < tNeed * 1.4 + 14)) || (!this.auto && this.controls.throttle > 0.5)) {
        this.phase = 'landing';
        this.flipT = this.t;
        this.sEng = 3;
        this.throttle = 1;
        this.say(`Landing burn: three Raptors light and the ship flips upright at ${Math.round(agl)} m.`, 'good');
      }
    } else if (this.phase === 'landing') {
      const e = shipEngines(p, this.sEng, 0);
      const aMax = e.thrust / this.mass;
      const vz = vdot(va, up);
      const vhv = vsub(va, vscale(up, vz));
      // the flip: swing upright over a few seconds as the engines take hold
      const flipping = this.t - this.flipT < 4.5;
      this.legs = agl < 400 ? Math.min(1, this.legs + h * 0.6) : this.legs;
      this.flaps = Math.max(0, this.flaps - h * 0.3);
      let want: Vec;
      if (this.auto) {
        // powered descent guidance: follow a sink rate that stops at the ground,
        // spend what thrust is left on killing the drift, stay upright near the end
        // while there is drift left, sink only as fast as leaves time to cancel it
        const tH = vlen(vhv) / Math.max(1, 0.75 * aMax) + 4;
        const vzCmd = -Math.max(1.5, Math.min(600, Math.sqrt(2 * Math.max(1, 0.55 * (aMax - MARS.g)) * Math.max(0, aglG - 4)), Math.max(0, aglG - 4) / tH));
        const azReq = Math.max(0, (vzCmd - vz) / (aglG < 40 ? 0.7 : 1.5) + MARS.g);
        const tGo = Math.max(2, aglG / Math.max(2, -vzCmd));
        let ah = vscale(vhv, -1 / Math.max(1.2, tGo * 0.6));
        const tiltMax = aglG < 40 ? 0.12 : aglG < 300 ? 0.45 : 1.0;
        const ahMax = Math.min(Math.sqrt(Math.max(0, aMax * aMax - azReq * azReq)), azReq * Math.tan(tiltMax) + (aglG > 300 ? aMax * 0.5 : 0));
        const ahL = vlen(ah);
        if (ahL > ahMax) ah = vscale(ah, ahMax / Math.max(1e-6, ahL));
        const aw = vadd(vscale(up, azReq), ah);
        want = vlen(aw) > 1e-3 ? vnorm(aw) : up;
        let thr = vlen(aw) / Math.max(1e-3, aMax);
        // fewer engines once the throttle runs low (a Raptor goes no lower than 40%)
        if (!flipping && this.sEng > 1 && thr * this.sEng < (this.sEng - 1) * 0.95) {
          this.sEng -= 1;
          thr = vlen(aw) / Math.max(1e-3, shipEngines(p, this.sEng, 0).thrust / this.mass);
        }
        this.throttle = Math.max(STARSHIP.minThrottle, Math.min(1, thr));
      } else {
        want = this.manualTilt(up);
        this.throttle = Math.max(STARSHIP.minThrottle, Math.min(1, this.throttle + this.controls.throttle * h * 0.6));
      }
      const rate = flipping ? 30 : 12;
      this.axis = turnToward(this.axis, want, h * rate * D2R);
      const ee = shipEngines(p, this.sEng, 0);
      thrust = vscale(this.axis, ee.thrust * this.throttle);
      this.shipProp -= ee.mdot * this.throttle * h;
      if (this.shipProp <= 0) {
        this.shipProp = 0;
        if (this.sEng > 0) this.say('Out of propellant!', 'bad');
        this.sEng = 0;
      }
    }
    const g = this.gravity(MARS.mu, this.r);
    const acc = vadd(vadd(g, vscale(aero, 1 / this.mass)), vscale(thrust, 1 / this.mass));
    this.gLoad = vlen(vsub(acc, g)) / G0;
    this.v = vaxpy(this.v, acc, h);
    this.r = vaxpy(this.r, this.v, h);
    // the ground
    if (agl <= 0.5) this.touchDown();
  }

  private touchDown(): void {
    const sp = this.speeds();
    const tilt = (Math.acos(Math.max(-1, Math.min(1, vdot(this.axis, this.up())))) * 180) / Math.PI;
    this.touchdown = { vz: -sp.vz, vh: sp.vh, tilt };
    const ok = this.phase === 'landing' && -sp.vz < 4 && sp.vh < 2.5 && tilt < 12 && this.legs > 0.95;
    // set it on the ground and stop
    const ll = this.marsLatLon();
    const f = rotZ(this.r, -this.marsAngle());
    const fr = vscale(vnorm(f), MARS.R + this.groundH(ll.lat, ll.lon) + SHIP_COM);
    this.touchdownFixed = { p: fr };
    this.sEng = this.vEng = 0;
    this.throttle = 0;
    if (ok) {
      this.phase = 'landed';
      this.holdOnMars();
      this.outcome = { ok: true, title: 'Starship has landed on Mars', text: `Touchdown at ${(-sp.vz).toFixed(1)} m/s, ${tilt.toFixed(1)}° from vertical, with ${(this.shipProp / 1000).toFixed(1)} t of propellant left.` };
      this.say('Touchdown! Starship is on Mars.', 'good');
    } else {
      this.fail('Crashed on Mars', `Hit the ground at ${(-sp.vz).toFixed(0)} m/s down and ${sp.vh.toFixed(0)} m/s sideways, ${tilt.toFixed(0)}° from vertical. A safe landing needs under 4 m/s down, under 2.5 m/s sideways, upright on its legs.`);
      this.phase = 'lost';
      this.holdOnMars();
    }
  }

  private fail(title: string, text: string): void {
    this.outcome = { ok: false, title, text };
    this.sEng = this.vEng = this.bEng = 0;
    this.say(title + '.', 'bad');
  }

  /** time to the next event worth stopping for (for the fast-forward button), seconds */
  nextEvent(): number {
    switch (this.phase) {
      case 'orbit':
        return this.shipProp < STARSHIP.ship.prop * 0.95 ? 0 : Math.max(0, this.toWindow);
      case 'cruise':
        return this.cruise ? this.cruise.tSoi - this.t : 0;
      case 'depart':
        return 3 * DAY;
      case 'approach':
        return 3600;
      default:
        return 0;
    }
  }
}

export { DAY };
