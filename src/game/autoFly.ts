// Auto-Fly: a complete autopilot, gate to gate.
//
//  TAKEOFF    on the runway: brakes off, military power (afterburner when the
//             jet is heavy), nosewheel steering on the centreline, rotate at
//             the jet's rotation speed, gear up once climbing.
//  CLIMB      straight ahead to 1,500 ft above the ground, then onto course.
//  CRUISE     a straight track from where it started to the destination: it
//             corrects any drift back onto the line (so wind and the climb-out
//             turn never leave it off course), holds the chosen speed (any
//             speed up to the jet's top speed; afterburner when it takes it)
//             and height, and climbs over any terrain in its path.
//  DESCENT    to an airfield with auto-land on: it plans the top of descent
//             so it arrives at the approach gate, 12 NM out on the runway's
//             extended centreline, at 3,900 ft and 250 kt.
//  APPROACH   it picks the runway end into the wind (or the clear one if the
//             other has hills under the approach), flies to the gate, turns
//             onto the localizer and rides the 3 degree glideslope down,
//             slowing to the jet's approach speed with the gear down.
//  FLARE      a few metres up it rounds out and closes the throttle.
//  ROLLOUT    speedbrake, nose down, wheel brakes, steering on the centreline,
//             to a full stop. Then it hands the jet back.
//
// If the approach goes wrong (too high, too far off the centreline close
// in) it goes around and flies the approach again. Without auto-land, or to
// a point that is not an airfield, it circles overhead on arrival. Any stick
// input hands control straight back to the pilot.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Steerpoint } from '../avionics/nav';
import type { AirfieldDef } from '../world/islands';
import { steerToward } from '../ai/steering';
import { terrainHeight } from '../world/terrain';
import { FT, KT, NM, DEG } from '../core/constants';
import { clamp } from '../core/math';
import { wind } from '../core/weather';
import { GLIDESLOPE_DEG, GS_AIMPOINT, runwayDesignator } from '../avionics/nav';

/** Top speed (kt, true) for a jet: its Mach limit at the tropopause. */
export function topSpeedKts(maxMach: number): number {
  return Math.round((maxMach * 573) / 10) * 10;
}

/** Afterburner use: never, only when the chosen speed needs it, or lit the whole way. */
export type AbMode = 'off' | 'auto' | 'max';

export type AfPhase = 'takeoff' | 'climb' | 'cruise' | 'descent' | 'approach' | 'final' | 'flare' | 'rollout' | 'stopped' | 'orbit';

const ORBIT_MIN = 3 * NM;
/** approach gate: this far before the touchdown aim point, on the centreline */
const GATE_DIST = 12 * NM;
const TAN_GS = Math.tan(GLIDESLOPE_DEG * DEG);

const _dir = new THREE.Vector3();
const _rad = new THREE.Vector3();
const _p = new THREE.Vector3();

interface Runway {
  f: AirfieldDef;
  /** unit vector of the landing direction (horizontal) */
  ux: number;
  uz: number;
  /** touchdown aim point (world) */
  aim: THREE.Vector3;
  /** landing runway heading (deg) and designator */
  hdg: number;
  name: string;
}

export class AutoFly {
  engaged = false;
  /** null = hold the heading it was engaged on */
  dest: Steerpoint | null = null;
  speedKts = 480;
  altFt = 20000;
  /** land at the destination airfield */
  autoLand = true;
  abMode: AbMode = 'auto';
  arrived = false;
  phase: AfPhase = 'cruise';
  /** callouts for the HUD / radio */
  onCall: ((text: string, kind: 'info' | 'good' | 'warn') => void) | null = null;
  private holdDir = new THREE.Vector3(0, 0, -1);
  private origin = new THREE.Vector3();
  private rwy: Runway | null = null;
  private goArounds = 0;
  private phaseT = 0;
  private locCap = false;
  private gsCap = false;
  private heavy = false;
  private takeoffHdg = 0;
  private gearUp = false;
  private rollCalled = false;
  private appBonus = 0;
  private flarePitch = 0;
  /** glideslope integrator (m s) */
  private gsI = 0;
  private lastGam = 0;
  private leg: 'gate' | 'outbound' = 'gate';
  private legSide = 1;
  /** throttle controller: integrator (the trim that holds the speed), burner latch */
  private thrI = 0.8;
  private abOn = false;
  private abTimer = 0;
  /** smoothed height command (m) */
  private altCmd = 0;

  engage(p: Aircraft, dest: Steerpoint | null, speedKts: number, altFt: number, autoLand = true, abMode: AbMode = 'auto'): void {
    this.abMode = abMode;
    this.thrI = clamp(p.controls.throttle, 0.4, 1);
    this.abOn = abMode === 'max' || p.fm.throttleLever > 1.001;
    this.abTimer = 0;
    this.altCmd = p.fm.pos.y;
    this.dest = dest;
    this.speedKts = speedKts;
    this.altFt = altFt;
    this.autoLand = autoLand;
    this.arrived = false;
    this.rwy = null;
    this.goArounds = 0;
    this.locCap = this.gsCap = false;
    this.holdDir.set(p.fm.fwd.x, 0, p.fm.fwd.z);
    if (this.holdDir.lengthSq() < 1e-6) this.holdDir.set(0, 0, -1);
    this.holdDir.normalize();
    this.origin.copy(p.fm.pos);
    this.engaged = true;
    this.phaseT = 0;
    this.gearUp = !p.fm.onGround;
    this.rollCalled = false;
    this.appBonus = 0;
    if (p.fm.onGround) {
      this.phase = 'takeoff';
      this.takeoffHdg = p.fm.heading;
      this.heavy = p.fm.mass > p.spec.emptyMass + p.spec.internalFuel * 0.9 + 2500;
    } else this.phase = 'cruise';
    if (this.landing()) this.rwy = this.pickRunway(p, dest!.field!);
  }

  disengage(): void {
    this.engaged = false;
  }

  private landing(): boolean {
    return !!this.autoLand && !!this.dest?.field;
  }

  private set(ph: AfPhase, call?: string, kind: 'info' | 'good' | 'warn' = 'info'): void {
    if (this.phase === ph) return;
    this.phase = ph;
    this.phaseT = 0;
    if (call) this.onCall?.(call, kind);
  }

  /** Distance (NM) to go, or null when holding a heading. */
  distanceNm(p: Aircraft): number | null {
    if (!this.dest) return null;
    return Math.hypot(this.dest.x - p.fm.pos.x, this.dest.z - p.fm.pos.z) / NM;
  }

  /** Short status for the HUD. */
  label(p: Aircraft): string {
    const d = this.distanceNm(p);
    const where = this.dest ? `${this.dest.short || this.dest.name}` : 'HDG HOLD';
    const spd = `${this.speedKts} KT · ${Math.round(this.altFt / 1000)}K FT${this.abMode === 'max' ? ' · AB MAX' : this.abMode === 'off' ? ' · NO AB' : this.abOn ? ' · AB' : ''}`;
    switch (this.phase) {
      case 'takeoff':
        return `AUTO-FLY TAKEOFF → ${where}`;
      case 'climb':
        return `AUTO-FLY CLIMB → ${where} · ${spd}`;
      case 'cruise':
        return `AUTO-FLY → ${where}${d !== null ? ` ${Math.round(d)} NM` : ''} · ${spd}`;
      case 'descent':
        return `AUTO-FLY DESCENT → ${where} ${Math.round(d ?? 0)} NM`;
      case 'approach':
        return `AUTO-LAND APPROACH RWY ${this.rwy?.name ?? ''} · ${Math.round(d ?? 0)} NM`;
      case 'final':
        return `AUTO-LAND FINAL RWY ${this.rwy?.name ?? ''}${this.locCap ? ' LOC' : ''}${this.gsCap ? ' GS' : ''} · ${(this.distToAim(p) / NM).toFixed(1)} NM`;
      case 'flare':
        return 'AUTO-LAND FLARE';
      case 'rollout':
        return 'AUTO-LAND ROLLOUT';
      case 'stopped':
        return 'AUTO-LAND STOPPED';
      case 'orbit':
        return `AUTO-FLY → ${where} ORBIT · ${spd}`;
    }
  }

  // -------------------------------------------------------------------------
  // Runway and approach geometry
  // -------------------------------------------------------------------------

  /** Landing direction: into the wind, avoiding an approach over high ground, else the nearer end. */
  private pickRunway(p: Aircraft, f: AirfieldDef): Runway {
    let best: Runway | null = null;
    let bestScore = Infinity;
    for (const s of [1, -1]) {
      const ux = f.ax * s, uz = f.az * s;
      const hdg = (f.heading + (s > 0 ? 0 : 180)) % 360;
      // threshold at the approach end, aim point 300 m in
      const thrAlong = -s * (f.length / 2);
      const tx = f.x + f.ax * thrAlong, tz = f.z + f.az * thrAlong;
      const aim = new THREE.Vector3(tx + ux * GS_AIMPOINT, f.elev, tz + uz * GS_AIMPOINT);
      // terrain under the glide path: how much it pokes above it
      let block = 0;
      for (let d = 1500; d <= GATE_DIST + 4000; d += 750) {
        const h = terrainHeight(aim.x - ux * d, aim.z - uz * d);
        block = Math.max(block, h - (f.elev + d * TAN_GS - 120));
      }
      const head = Math.cos((wind.fromDeg - hdg) * DEG) * wind.surfaceKts;
      const gx = aim.x - ux * GATE_DIST, gz = aim.z - uz * GATE_DIST;
      const dist = Math.hypot(p.fm.pos.x - gx, p.fm.pos.z - gz) / NM;
      const score = Math.max(0, block) * 5 - (wind.surfaceKts > 6 ? head * 4 : 0) + dist;
      if (score < bestScore) {
        bestScore = score;
        best = { f, ux, uz, aim, hdg, name: runwayDesignator(hdg) };
      }
    }
    return best!;
  }

  /** Along-track distance before the aim point (m, + = short of it) and cross-track (m, + = right). */
  private track(p: Aircraft): { s: number; e: number } {
    const r = this.rwy!;
    const dx = p.fm.pos.x - r.aim.x, dz = p.fm.pos.z - r.aim.z;
    const along = dx * r.ux + dz * r.uz;
    // right of the landing direction: (ux, uz) rotated clockwise seen from above = (-uz, ux)
    const e = dx * -r.uz + dz * r.ux;
    return { s: -along, e };
  }

  private distToAim(p: Aircraft): number {
    const r = this.rwy;
    if (!r) return 0;
    return Math.hypot(p.fm.pos.x - r.aim.x, p.fm.pos.z - r.aim.z);
  }

  /** Glide path height (world) at `s` metres before the aim point. */
  private glideY(s: number): number {
    return this.rwy!.f.elev + Math.max(0, s) * TAN_GS;
  }

  // -------------------------------------------------------------------------
  // Flying
  // -------------------------------------------------------------------------

  /**
   * Limit how far the requested horizontal direction is from where the jet is
   * going now, so a big course change is flown as a steady, level turn
   * rather than one large (and, bank-limited, sagging) steering command.
   */
  private limitTurn(p: Aircraft, dir: THREE.Vector3, maxDeg = 25): void {
    const vx = p.fm.vel.x, vz = p.fm.vel.z;
    const vh = Math.hypot(vx, vz);
    if (vh < 20) return;
    const cur = Math.atan2(vx, -vz);
    const want = Math.atan2(dir.x, -dir.z);
    const d = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const lim = maxDeg * DEG;
    if (Math.abs(d) <= lim) return;
    const h = cur + Math.sign(d) * lim;
    dir.set(Math.sin(h), 0, -Math.cos(h));
  }

  /**
   * With the gear down and slow, the jets' flight controls switch to the
   * powered-approach law: the stick commands pitch RATE (7 deg/s at full
   * stick) and the jet holds its attitude hands-off, with angle of attack
   * capped at 16 degrees. Steering it like the normal G law gives almost no
   * response, so on final and in the flare the flight path is flown through
   * this law directly: pitch rate proportional to the flight-path-angle error,
   * damped by how fast the flight path is already changing.
   */
  private pathPitch(p: Aircraft, gamCmd: number, dt: number, gain: number): void {
    const fm = p.fm;
    const V = Math.max(40, fm.vel.length());
    const gam = Math.asin(clamp(fm.vel.y / V, -1, 1));
    const gamRate = dt > 0 ? (gam - this.lastGam) / dt : 0;
    this.lastGam = gam;
    const q = clamp(gain * (gamCmd - gam) - 0.7 * gamRate, -6 * DEG, 6 * DEG);
    p.controls.pitch = clamp(q / (7 * DEG), -1, 1);
  }

  /** Is the powered-approach (gear-down) control law in charge? */
  private gearLaw(p: Aircraft): boolean {
    return p.fm.gearPos > 0.5 && p.fm.cas < 280 * KT;
  }

  /** Highest ground along a direction ahead. */
  private groundAhead(p: Aircraft, dx: number, dz: number, look: number): number {
    let g = 0;
    for (let k = 0; k <= 10; k++) {
      const s = (k / 10) * look;
      g = Math.max(g, terrainHeight(p.fm.pos.x + dx * s, p.fm.pos.z + dz * s));
    }
    return g;
  }

  /** True-airspeed target (kt) -> calibrated, within the jet's limits. */
  private casFor(p: Aircraft, kts: number): number {
    const fm = p.fm;
    const ratio = fm.tas > 30 ? fm.cas / fm.tas : 1;
    return Math.min(kts * KT * ratio, p.spec.maxIasKts * KT * 0.97);
  }

  /**
   * Smooth throttle to hold a calibrated airspeed. A PI controller with
   * acceleration damping: the integrator finds the steady throttle for this
   * speed and height and the lever only moves slowly around it, so the engines
   * stay spooled up (never below `floor`) instead of pumping between idle and
   * full power. The afterburner is latched: in AUTO it lights only after the
   * jet has sat below the chosen speed at full military power for a few
   * seconds, and goes out only after it has been well over for a few seconds;
   * MAX keeps it lit, OFF never lights it.
   */
  private thrust(p: Aircraft, cas: number, dt: number, floor: number, allowAb = true, sbKt = 30): void {
    const fm = p.fm;
    const c = p.controls;
    const errKt = (cas - fm.cas) / KT;
    const v = Math.max(1, fm.vel.length());
    const along = (fm.accel.x * fm.vel.x + fm.accel.y * fm.vel.y + fm.accel.z * fm.vel.z) / v;
    // afterburner latch
    const mode = allowAb ? this.abMode : 'off';
    if (mode === 'max') this.abOn = true;
    else if (mode === 'off') this.abOn = false;
    else {
      const wantOn = !this.abOn && this.thrI > 0.985 && errKt > 8;
      const wantOff = this.abOn && errKt < -12;
      this.abTimer = wantOn || wantOff ? this.abTimer + dt : 0;
      if (this.abTimer > 3) {
        this.abOn = !this.abOn;
        this.abTimer = 0;
        this.thrI = this.abOn ? 1.03 : 0.97;
      }
    }
    const lo = this.abOn ? 1.02 : floor;
    const hi = this.abOn ? 1.1 : 1.0;
    this.thrI = clamp(this.thrI + errKt * 0.004 * dt, lo, hi);
    const thr = clamp(this.thrI + errKt * 0.008 - along * 0.04, lo, hi);
    c.throttle = clamp(c.throttle + clamp(thr - c.throttle, -0.4 * dt, 0.4 * dt), lo, hi);
    // the speedbrake only for a big overspeed (a steep descent), never to hold speed
    c.speedbrake = errKt < -sbKt;
  }

  /** Fly one physics step. */
  control(p: Aircraft, dt: number): void {
    const fm = p.fm;
    const c = p.controls;
    this.phaseT += dt;
    c.speedbrake = false;
    c.wheelBrake = 0;

    // --- on the ground ---------------------------------------------------------
    if (this.phase === 'takeoff') return this.takeoff(p, dt);
    if (this.phase === 'rollout' || this.phase === 'stopped') return this.rollout(p);
    if (fm.onGround && (this.phase === 'flare' || this.phase === 'final')) {
      this.set('rollout', 'TOUCHDOWN', 'good');
      return this.rollout(p);
    }

    // a go-around that touches the runway: roll on and lift off again (touch and go)
    if (this.phase === 'climb' && fm.onGround) return this.takeoff(p, dt);

    // --- climb-out: wings level on the runway heading to 1,500 ft above the ground
    if (this.phase === 'climb') {
      if (!this.gearUp && fm.agl > 15 && fm.vs > 1) this.gearUp = true;
      c.gearDown = !this.gearUp;
      const h = this.takeoffHdg * DEG;
      _dir.set(Math.sin(h), 0, -Math.cos(h)).multiplyScalar(Math.cos(12 * DEG)).setY(Math.sin(12 * DEG));
      steerToward(p, _dir, { gCap: 2.5, tau: 1.4, maxBank: 8 });
      c.throttle = this.takeoffPower(fm.cas < 250 * KT);
      if (fm.agl > 1500 * FT && fm.cas > 230 * KT) {
        this.thrI = Math.min(1, c.throttle);
        this.abOn = this.abMode === 'max';
        c.gearDown = false;
        this.origin.copy(fm.pos);
        this.set('cruise', 'CLIMB-OUT COMPLETE — ON COURSE');
      }
      return;
    }
    c.gearDown = false;

    // --- approach, final, flare -------------------------------------------------
    if (this.rwy && (this.phase === 'approach' || this.phase === 'final' || this.phase === 'flare')) return this.approach(p, dt);

    // --- cruise / descent / orbit -----------------------------------------------
    const d = this.dest;
    let wantAlt = this.altFt * FT;
    const wantKts = this.speedKts;
    let descentCas = 0;
    if (d) {
      _rad.set(fm.pos.x - d.x, 0, fm.pos.z - d.z);
      const dist = _rad.length();
      if (this.rwy) {
        // top of descent: arrive at the gate at its height
        const r = this.rwy;
        const gx = r.aim.x - r.ux * GATE_DIST, gz = r.aim.z - r.uz * GATE_DIST;
        const gDist = Math.hypot(fm.pos.x - gx, fm.pos.z - gz);
        const gAlt = this.glideY(GATE_DIST);
        const tod = (fm.pos.y - gAlt) / Math.tan(3.2 * DEG) + 6000;
        if (this.phase === 'cruise' && gDist < tod && fm.pos.y > gAlt + 150) this.set('descent', `TOP OF DESCENT — ${r.f.name} RWY ${r.name}`);
        if (this.phase === 'descent' || gDist < tod) {
          wantAlt = Math.min(wantAlt, gAlt + Math.max(0, gDist - 5000) * Math.tan(3.2 * DEG));
          // descend at 300 kt (calibrated), 250 kt below 10,000 ft: arrive slow enough to configure
          descentCas = (fm.pos.y < 10000 * FT ? 250 : 300) * KT;
        }
        // after a go-around: fly the circuit round to the gate low and slow, not back up to cruise
        if (this.goArounds > 0) {
          wantAlt = Math.min(wantAlt, gAlt + 600);
          descentCas = 250 * KT;
        }
        if (gDist < 9000 || ((this.phase === 'descent' || this.goArounds > 0) && gDist < 16000 && fm.pos.y < gAlt + 700)) {
          this.set('approach', `APPROACH — RWY ${r.name}, ${r.f.name}. WIND ${String(Math.round(wind.fromDeg)).padStart(3, '0')}/${Math.round(wind.surfaceKts)}`);
          return this.approach(p, dt);
        }
        _dir.set(gx - fm.pos.x, 0, gz - fm.pos.z).normalize();
        this.courseCorrect(p, gx, gz, _dir);
      } else {
        const ORBIT_R = Math.max(ORBIT_MIN, (fm.tas * fm.tas) / (9.81 * Math.tan(35 * DEG)));
        if (dist < ORBIT_R * 1.3 && !this.arrived) {
          this.arrived = true;
          this.set('orbit', `ARRIVED — ORBITING ${d.name}`, 'good');
        }
        if (this.arrived && dist > ORBIT_R * 2.5) {
          this.arrived = false;
          this.set('cruise');
        }
        if (this.arrived) {
          _rad.divideScalar(Math.max(dist, 1));
          _dir.set(-_rad.z, 0, _rad.x).addScaledVector(_rad, -clamp((dist - ORBIT_R) / ORBIT_R, -1, 1) * 0.8);
        } else {
          _dir.copy(_rad).multiplyScalar(-1).normalize();
          this.courseCorrect(p, d.x, d.z, _dir);
        }
      }
    } else _dir.copy(this.holdDir);
    _dir.setY(0).normalize();
    this.limitTurn(p, _dir);
    // always clear the terrain ahead (and a little to each side of the track)
    const look = Math.max(5000, fm.tas * 60);
    const ground = this.groundAhead(p, _dir.x, _dir.z, look);
    wantAlt = Math.max(wantAlt, ground + (this.phase === 'descent' ? 450 : 330));
    // the height command moves smoothly (terrain ahead can't jerk it about);
    // climbs to clear high ground are never held back
    const up = wantAlt > this.altCmd;
    this.altCmd += clamp(wantAlt - this.altCmd, -25 * dt, (up && wantAlt - fm.pos.y > 200 ? 60 : 30) * dt);
    if (wantAlt > fm.pos.y + 150) this.altCmd = Math.max(this.altCmd, wantAlt);
    // vertical speed proportional to the height error (a gentle exponential capture,
    // with a small dead band so it doesn't chase every metre)
    const err = this.altCmd - fm.pos.y;
    const e = Math.abs(err) < 8 ? 0 : err - Math.sign(err) * 8;
    const V = Math.max(60, fm.vel.length());
    const vsMax = err > 0 ? Math.min(60, V * Math.sin((fm.cas > 280 * KT ? 18 : 10) * DEG)) : this.phase === 'descent' ? V * Math.sin(7 * DEG) : 25;
    const vs = clamp(e * 0.05, -vsMax, vsMax);
    const climb = Math.asin(clamp(vs / V, -0.5, 0.5));
    _dir.multiplyScalar(Math.cos(climb)).setY(Math.sin(climb));
    steerToward(p, _dir, { gCap: 3, tau: 1.6, maxBank: 40 });
    if (descentCas > 0) this.thrust(p, Math.min(descentCas, this.casFor(p, wantKts)), dt, 0.3, false);
    else this.thrust(p, this.casFor(p, wantKts), dt, 0.45);
  }

  /**
   * Hold the straight line from the start point to (tx, tz): turn the desired
   * course toward the line in proportion to the cross-track error.
   */
  private courseCorrect(p: Aircraft, tx: number, tz: number, out: THREE.Vector3): void {
    const o = this.origin;
    const lx = tx - o.x, lz = tz - o.z;
    const len = Math.hypot(lx, lz);
    if (len < 5000) return;
    const ux = lx / len, uz = lz / len;
    const dx = p.fm.pos.x - o.x, dz = p.fm.pos.z - o.z;
    const along = dx * ux + dz * uz;
    if (along < 0 || along > len - 8000) return;
    const cross = dx * -uz + dz * ux; // + = right of the line
    const corr = clamp(-cross / 6000, -1, 1) * 35 * DEG;
    const c = Math.cos(corr), s = Math.sin(corr);
    // rotate the line direction by corr (clockwise seen from above = right)
    out.set(ux * c - uz * s, 0, uz * c + ux * s);
  }

  /** Takeoff / climb-out power: full burner on MAX, burner when heavy on AUTO, military power on OFF. */
  private takeoffPower(early: boolean): number {
    if (this.abMode === 'max') return 1.1;
    if (this.abMode === 'off') return 1.0;
    return this.heavy && early ? 1.1 : 1.0;
  }

  private takeoff(p: Aircraft, dt: number): void {
    const fm = p.fm;
    const c = p.controls;
    c.gearDown = true;
    c.wheelBrake = 0;
    c.throttle = this.takeoffPower(true);
    if (fm.onGround) {
      c.roll = 0;
      // hold the centreline with the nosewheel / rudder
      let herr = ((this.takeoffHdg - fm.heading + 540) % 360) - 180;
      const f = fm.surfaceField;
      if (f) {
        const s = Math.sign(Math.cos((fm.heading - f.heading) * DEG)) || 1;
        const dx = fm.pos.x - f.x, dz = fm.pos.z - f.z;
        const across = (dx * f.rxv + dz * f.rzv) * s;
        const rh = s > 0 ? f.heading : f.heading + 180;
        herr = ((rh - fm.heading + 540) % 360) - 180 - clamp(across * 0.6, -6, 6);
        this.takeoffHdg = rh;
      }
      c.yaw = clamp(herr * 0.1, -1, 1);
      const vr = p.spec.rotateKts * KT * (this.heavy ? 1.08 : 1);
      if (fm.cas > vr) c.pitch = clamp((11 - fm.pitchAngle) * 0.08, 0, 0.7);
      else c.pitch = 0;
      if (!this.rollCalled) {
        this.rollCalled = true;
        this.onCall?.(`TAKEOFF ROLL — ${this.takeoffPower(true) > 1 ? 'AFTERBURNER' : 'MIL POWER'}`, 'info');
      }
      return;
    }
    this.set('climb', 'AIRBORNE — POSITIVE CLIMB, GEAR UP');
    void dt;
  }

  private approach(p: Aircraft, dt: number): void {
    const fm = p.fm;
    const c = p.controls;
    const r = this.rwy!;
    const { s, e } = this.track(p);
    const app = p.spec.approachKts;
    const hRwy = fm.pos.y - r.f.elev;
    // on the extended centreline, in front of the runway, heading roughly its way?
    const vx = fm.vel.x, vz = fm.vel.z;
    const vh = Math.max(1, Math.hypot(vx, vz));
    const aligned = (vx * r.ux + vz * r.uz) / vh;
    const inCone = s > 800 && Math.abs(e) < Math.max(700, Math.min(s * 0.3, 2200)) && aligned > 0.8;

    if (this.phase === 'approach' && inCone && s < GATE_DIST + 6000) {
      this.leg = 'gate';
      this.gsI = 0;
      this.set('final', `FINAL — RWY ${r.name}`);
    }
    // lost the centreline far out: set the approach up again
    if (this.phase === 'final' && s > 3500 && (Math.abs(e) > Math.max(1500, Math.min(s * 0.4, 3000)) || aligned < 0.3)) {
      this.locCap = this.gsCap = false;
      this.set('approach', 'RE-INTERCEPTING THE LOCALIZER', 'warn');
    }

    if (this.phase === 'approach') {
      // fly to the gate, at the gate height, slowing to 250 kt. Coming from the
      // wrong side (inside the gate, or heading against the landing direction)
      // it first flies outbound, beside the centreline, to turn in from there.
      if (this.leg === 'gate' && s < GATE_DIST - 2500 && aligned < 0.7) {
        this.leg = 'outbound';
        // the side with the lower ground under the outbound point
        const o = GATE_DIST + 7000;
        const hs = [1, -1].map((sd) => terrainHeight(r.aim.x - r.ux * o - r.uz * 4500 * sd, r.aim.z - r.uz * o + r.ux * 4500 * sd));
        this.legSide = Math.abs(hs[0] - hs[1]) > 150 ? (hs[0] < hs[1] ? 1 : -1) : e >= 0 ? 1 : -1;
      }
      if (this.leg === 'outbound') {
        // too close in: fly out beside the centreline to set up the approach
        const o = GATE_DIST + 7000, side = 4500 * this.legSide;
        const gx = r.aim.x - r.ux * o - r.uz * side;
        const gz = r.aim.z - r.uz * o + r.ux * side;
        _dir.set(gx - fm.pos.x, 0, gz - fm.pos.z).normalize();
        if (Math.hypot(fm.pos.x - gx, fm.pos.z - gz) < 2500 || s > GATE_DIST + 3000) this.leg = 'gate';
      } else {
        // intercept the extended centreline: runway heading plus up to 45 degrees toward
        // it, easing off as the offset shrinks (how an approach is really vectored)
        const cc = clamp(-e / 1500, -1, 1) * 45 * DEG;
        _dir.set(r.ux * Math.cos(cc) - r.uz * Math.sin(cc), 0, r.uz * Math.cos(cc) + r.ux * Math.sin(cc)).normalize();
      }
      this.limitTurn(p, _dir);
      const ground = Math.max(this.groundAhead(p, _dir.x, _dir.z, Math.max(6000, fm.tas * 45)), terrainHeight(fm.pos.x, fm.pos.z));
      const wantAlt = Math.max(this.glideY(GATE_DIST) - 150, ground + 450);
      const climb = clamp((wantAlt - fm.pos.y) / 1200, -1, 1) * (wantAlt > fm.pos.y ? 16 : 8) * DEG;
      _dir.multiplyScalar(Math.cos(climb)).setY(Math.sin(climb));
      steerToward(p, _dir, { gCap: 2.5, tau: 1.3, maxBank: 30 });
      this.thrust(p, 240 * KT, dt, 0.2, false, 15);
      return;
    }

    // --- final: ride the localizer and glideslope with a carrot on the path ------
    if (!this.locCap && Math.abs(e) < 150) {
      this.locCap = true;
      this.onCall?.('LOCALIZER CAPTURED', 'info');
    }
    const gsY = this.glideY(s);
    if (!this.gsCap && this.locCap && Math.abs(fm.pos.y - gsY) < 60) {
      this.gsCap = true;
      this.onCall?.('GLIDESLOPE CAPTURED', 'info');
    }
    // on-speed: fly the approach angle of attack, not a fixed number (a heavy jet needs more speed)
    const aoa = fm.alpha / DEG;
    // integrate: keep adding speed until the jet really flies at 10.5 deg (5 deg of margin to the
    // 16 deg gear-down limit for the flare), whatever its weight
    if (this.gearLaw(p)) this.appBonus = clamp(this.appBonus + (aoa - 10.5) * 3.5 * dt, 0, 90);
    const onSpeed = app + this.appBonus;
    // go around only for a real mess close in: well off the centreline or far above the path.
    // Speed never sends it round: it closes the throttle and opens the speedbrake instead.
    const tooHigh = fm.pos.y - gsY > Math.max(55, s * 0.08);
    const offLine = Math.abs(e) > Math.max(45, s * 0.06);
    if (s < 1500 && s > -300 && this.phase === 'final' && (offLine || tooHigh)) {
      this.origin.copy(fm.pos);
      this.goAround(p, `GO AROUND — ${offLine ? 'OFF THE CENTRELINE' : 'TOO HIGH'}`);
      return;
    }
    const V = Math.max(40, fm.vel.length());
    const L = clamp(V * 7, 700, 2200);
    const sc = Math.max(s - L, -600);
    const cx = r.aim.x - r.ux * sc, cz = r.aim.z - r.uz * sc;
    // glide path at the carrot, but never climb up to it from below on intercept
    let cy = this.glideY(sc);
    if (!this.gsCap) cy = Math.min(cy, Math.max(fm.pos.y, this.glideY(sc)));
    // never below the high ground ahead while still well out
    if (s > 3000) cy = Math.max(cy, this.groundAhead(p, r.ux, r.uz, 3000) + 150, this.glideY(s) - 120);

    // flare: round out a few metres up, then settle on
    // flare height from the sink rate: about two seconds before the wheels would touch
    const hFlare = clamp(-fm.vs * 2.1, 7, 18);
    if ((hRwy < hFlare && s < 1100) || this.phase === 'flare') {
      if (this.phase !== 'flare') {
        this.set('flare', 'FLARE');
        this.flarePitch = 0.05;
      }
      // round out: the sink rate eases off with height (about 2 s to go at any height),
      // down to 0.6 m/s at the wheels; after 5 s it stops holding off and lets it settle
      let sink = -Math.max(0.6, hRwy / 2.2);
      if (this.phaseT > 5) sink = Math.min(sink, -1.3);
      // only a balloon, or running out of runway still in the air, sends it round
      const remaining = r.f.length - GS_AIMPOINT + s;
      if (hRwy > 30 || (remaining < 900 && hRwy > 2.5)) {
        this.origin.copy(fm.pos);
        this.goAround(p, `GO AROUND — ${hRwy > 30 ? 'BALLOONED' : 'RUNWAY TOO SHORT'}`);
        return;
      }
      const Vf = Math.max(40, fm.vel.length());
      this.pathPitch(p, Math.asin(clamp(sink / Vf, -0.2, 0.02)), dt, 2.2);
      // never rotate far enough to drag the tail
      if (fm.pitchAngle > 14) c.pitch = Math.min(c.pitch, 0);
      // wings level, a touch of wing-low into any drift off the centreline
      const wantBank = clamp(-e * 0.4, -4, 4);
      c.roll = clamp((wantBank - fm.bank) * 0.04 - fm.rollRate * 0.01, -0.4, 0.4);
      const hdgErr = ((r.hdg - fm.heading + 540) % 360) - 180;
      c.yaw = clamp((hdgErr - clamp(e * 0.4, -4, 4)) * 0.08, -0.6, 0.6);
      // keep the engines spooled until just above the runway, then idle
      // throttle back through the flare, idle just above the runway
      const want = hRwy < 5 || this.phaseT > 4 ? 0 : Math.min(0.3, c.throttle);
      c.throttle = Math.max(want, c.throttle - dt * 0.5);
      c.speedbrake = this.phaseT > 3 || fm.cas > onSpeed * KT + 10;
      c.gearDown = true;
      return;
    }
    // terrain warning well out on the approach: climb away and set it up again
    if (s > 3000 && fm.agl < 120 && this.glideY(s) - fm.pos.y > 60) {
      this.locCap = this.gsCap = false;
      this.set('approach', 'TERRAIN — PULL UP, GOING AROUND', 'warn');
      return;
    }
    const hx = cx - fm.pos.x, hz = cz - fm.pos.z;
    const hd = Math.max(1, Math.hypot(hx, hz));
    // vertical: fly the glideslope angle, corrected by how far off the path it is
    // (1 degree per 40 m); below the path before capture, hold the height
    const pathErr = this.glideY(s) - fm.pos.y;
    if (this.gsCap) this.gsI = clamp(this.gsI + pathErr * dt, -300, 300);
    let gam = -GLIDESLOPE_DEG * DEG + clamp(pathErr / 25 + this.gsI * 0.004, -3, 3) * DEG;
    if (!this.gsCap && pathErr < 0 && fm.pos.y - this.glideY(s) > 0) gam = Math.max(gam, -6 * DEG);
    if (!this.gsCap && pathErr > 0) gam = Math.max(gam, 0);
    // terrain well out on the approach
    if (s > 3000) gam = Math.max(gam, Math.atan2(cy - fm.pos.y, hd));
    _dir.set(hx / hd, 0, hz / hd);
    this.limitTurn(p, _dir, 20);
    _dir.multiplyScalar(Math.cos(gam)).setY(Math.sin(gam));
    steerToward(p, _dir, { gCap: 2.2, tau: 0.9, maxBank: s < 4000 ? 12 : 30, allowPush: false });
    if (this.gearLaw(p)) this.pathPitch(p, gam, dt, 1.3);
    else this.lastGam = Math.asin(clamp(fm.vel.y / Math.max(40, fm.vel.length()), -1, 1));
    c.gearDown = s < 11 * NM || fm.cas < 230 * KT;
    // configured and slowing: 210 kt at 8 NM, then on-speed from 5 NM
    const base = s > 8 * NM ? Math.max(210, onSpeed) : s > 5 * NM ? Math.max(Math.min(app + 30, 195), onSpeed) : onSpeed;
    // below the path: carry a little more energy (the throttle helps the climb back up)
    const target = base + clamp(pathErr * 0.4, -5, 15);
    this.thrust(p, target * KT, dt, 0.25, false, s < 4000 ? 5 : 8);
  }

  /**
   * Go around: full power, wings level, climb straight ahead on the runway
   * heading (the climb-out), gear up once climbing, then back round for
   * another approach.
   */
  private goAround(p: Aircraft, why: string): void {
    this.goArounds++;
    this.locCap = this.gsCap = false;
    this.takeoffHdg = this.rwy ? this.rwy.hdg : p.fm.heading;
    this.gearUp = false;
    this.set('climb', why, 'warn');
    p.controls.throttle = this.takeoffPower(true);
  }

  private rollout(p: Aircraft): void {
    const fm = p.fm;
    const c = p.controls;
    const r = this.rwy;
    c.throttle = 0;
    c.gearDown = true;
    c.speedbrake = true;
    c.roll = 0;
    // derotate, then brakes
    c.pitch = this.phaseT < 1.2 ? -0.1 : -0.25;
    c.wheelBrake = this.phaseT > 1.5 ? 1 : 0;
    if (r) {
      const hdgErr = ((r.hdg - fm.heading + 540) % 360) - 180;
      const { e } = this.track(p);
      c.yaw = clamp((hdgErr - clamp(e * 0.5, -5, 5)) * 0.1, -1, 1);
    } else c.yaw = 0;
    if (this.phase === 'rollout' && fm.gs < 2) this.set('stopped', `LANDED${r ? ` AT ${r.f.name}` : ''} — STOPPED. YOU HAVE CONTROL`, 'good');
  }
}
