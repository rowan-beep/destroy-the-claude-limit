// Auto-Fly: a complete autopilot, gate to gate.
//
// It flies like a fighter pilot in a hurry: hard turns, steep climbs and
// dives with the speedbrake out, a short final, and full power whenever it
// helps.
//
//  TAKEOFF    on the runway: brakes off, military power (afterburner when the
//             jet is heavy), nosewheel steering on the centreline, rotate at
//             the jet's rotation speed, gear up once climbing.
//  CLIMB      a steep pull-up straight ahead to 600 ft above the ground, then
//             onto course.
//  CRUISE     a straight track from where it started to the destination: it
//             corrects any drift back onto the line (so wind and the climb-out
//             turn never leave it off course), holds the chosen speed (any
//             speed up to the jet's top speed; afterburner when it takes it)
//             and height (climbing at up to 30 degrees), and climbs over any
//             terrain in its path.
//  DESCENT    to an airfield with auto-land on: it stays high and fast until
//             late, then dives at 10 degrees, speedbrake out, to arrive at
//             the approach gate, 8 NM out on the runway's extended centreline,
//             at about 2,500 ft.
//  APPROACH   it picks the runway end into the wind (or the clear one if the
//             other has hills under the approach), flies to the gate at 300 kt,
//             breaks hard onto the localizer and rides the 3 degree glideslope
//             down, slowing to the jet's approach speed with the gear down.
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
import { Carrier, carrierOf } from '../world/carriers';
import { DECK_HEIGHT, LANDING_AREA } from '../world/islands';
import { Tanker, aarKind, contactTarget, receiverPoint } from './tanker';

/** Carrier approach: final starts this far astern of the touchdown point (m). */
const CV_GATE = 5500;
const CV_GS = 3.5 * DEG;
/** Carrier on-speed: knots over each jet's book approach speed (what it needs to hold the
 * 3.5 degree path at a comfortable angle of attack in this flight model). */
const CV_SPEED_ADD: Partial<Record<string, number>> = { RAFALE: 40, MIG31: 55, SR71: 45, X15: 40, GRIPEN: 30 };
/** how far behind the main wheels the hook point trails (m, beyond the gear) */
const HOOK_AFT = 4.6;

/** Top speed (kt, true) for a jet: its Mach limit at the tropopause. */
export function topSpeedKts(maxMach: number): number {
  return Math.round((maxMach * 573) / 10) * 10;
}

/** Afterburner use: never, only when the chosen speed needs it, or lit the whole way. */
export type AbMode = 'off' | 'auto' | 'max';

export type AfPhase = 'takeoff' | 'climb' | 'cruise' | 'descent' | 'approach' | 'final' | 'flare' | 'rollout' | 'stopped' | 'orbit' | 'tanker';

const ORBIT_MIN = 3 * NM;
/** approach gate: this far before the touchdown aim point, on the centreline */
const GATE_DIST = 8 * NM;
/** the dive from cruise height down to the gate (deg) */
const DESCENT_DEG = 10;
const TAN_GS = Math.tan(GLIDESLOPE_DEG * DEG);

const _dir = new THREE.Vector3();
const _rad = new THREE.Vector3();
const _p = new THREE.Vector3();
const _vt = new THREE.Vector3();
const _bk = new THREE.Vector3();

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
  /** a go-around just happened: the next approach flies out beside the runway first */
  private circuit = false;
  private legSide = 1;
  /** How far astern the carrier's outbound turn point lies (longer when there is height to lose). */
  private cvOut = CV_GATE + 4500;
  /** throttle controller: integrator (the trim that holds the speed), burner latch */
  private thrI = 0.8;
  private abOn = false;
  private abTimer = 0;
  /** smoothed height command (m) */
  private altCmd = 0;
  /** auto-landing on a carrier: the ship, and the predicted time to touchdown (s) */
  private carrier: Carrier | null = null;
  private cvTd = -1;
  private cvBolters = 0;
  private dtLast = 1 / 120;
  private ePrev = 0;
  private apBonus = 0;
  private aoaGuard = 0;
  private eDotF = 0;
  /** why the last wave-off happened (diagnostics) */
  woWhy = '';
  /** the TANKER program: the KC-46 to join, and how far it is */
  tanker: Tanker | null = null;
  tankerDist = 0;
  /** the touchdown point and landing direction where the ship will be at touchdown */
  private cv = { x: 0, z: 0, y: 0, ux: 0, uz: -1, d: 0, e: 0 };

  /** Fly to the KC-46 and into its auto-connect envelope (from the runway too: it takes off first). */
  engageTanker(p: Aircraft, tanker: Tanker): void {
    this.engage(p, null, Math.round(tanker.speed / KT) + 40, Math.round(tanker.alt / FT), false, 'auto');
    this.tanker = tanker;
    this.tankerDist = p.fm.pos.distanceTo(tanker.pos);
    if (this.phase !== 'takeoff') this.phase = 'tanker';
  }

  engage(p: Aircraft, dest: Steerpoint | null, speedKts: number, altFt: number, autoLand = true, abMode: AbMode = 'auto'): void {
    this.tanker = null;
    this.abMode = abMode;
    this.thrI = clamp(p.controls.throttle, 0.4, 1);
    this.abOn = abMode === 'max' || p.fm.throttleLever > 1.001;
    this.abTimer = 0;
    this.altCmd = p.fm.pos.y;
    this.dest = dest;
    this.speedKts = speedKts;
    this.altFt = altFt;
    this.autoLand = autoLand;
    // a carrier: its own approach (the ship moves and turns), straight to the wires
    this.carrier = autoLand ? carrierOf(dest?.field) ?? null : null;
    this.cvTd = -1;
    this.cvBolters = 0;
    this.appBonus = 0;
    this.apBonus = 0;
    this.arrived = false;
    this.rwy = null;
    this.goArounds = 0;
    this.circuit = false;
    this.locCap = this.gsCap = false;
    this.holdDir.set(p.fm.fwd.x, 0, p.fm.fwd.z);
    if (this.holdDir.lengthSq() < 1e-6) this.holdDir.set(0, 0, -1);
    this.holdDir.normalize();
    this.origin.copy(p.fm.pos);
    this.engaged = true;
    this.phaseT = 0;
    this.gearUp = !p.fm.onGround;
    this.rollCalled = false;
    // a carrier approach starts a little above the book speed (the deck is no place to learn it)
    this.appBonus = 0;
    this.aoaGuard = 0;
    if (p.fm.onGround) {
      this.phase = 'takeoff';
      this.takeoffHdg = p.fm.heading;
      this.heavy = p.fm.mass > p.spec.emptyMass + p.spec.internalFuel * 0.9 + 2500;
    } else this.phase = 'cruise';
    if (this.landing() && !this.carrier) this.rwy = this.pickRunway(p, dest!.field!);
    if (this.carrier && !p.fm.onGround) p.fm.hookDown = false;
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
        if (this.carrier) return `AUTO-LAND CARRIER ${this.leg === 'outbound' ? 'SETTING UP BEHIND THE SHIP' : 'APPROACH'} · ${this.carrier.name}`;
        return `AUTO-LAND APPROACH RWY ${this.rwy?.name ?? ''} · ${Math.round(d ?? 0)} NM`;
      case 'final':
        if (this.carrier) return `AUTO-LAND CARRIER FINAL · ON THE BALL · ${(this.cv.d / NM).toFixed(1)} NM`;
        return `AUTO-LAND FINAL RWY ${this.rwy?.name ?? ''}${this.locCap ? ' LOC' : ''}${this.gsCap ? ' GS' : ''} · ${(this.distToAim(p) / NM).toFixed(1)} NM`;
      case 'flare':
        return 'AUTO-LAND FLARE';
      case 'rollout':
        return 'AUTO-LAND ROLLOUT';
      case 'stopped':
        return 'AUTO-LAND STOPPED';
      case 'orbit':
        return `AUTO-FLY → ${where} ORBIT · ${spd}`;
      case 'tanker':
        return `AUTO-FLY → KC-46 TANKER · ${this.tankerDist < 1000 ? `${Math.round(this.tankerDist)} M` : `${(this.tankerDist / NM).toFixed(1)} NM`} · HANDS OFF, IT CONNECTS BY ITSELF`;
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
   * MAX keeps it lit, OFF never lights it. `quick`: a fast, firm hand on the
   * throttle (the burner in and out within a second, the lever slammed), for
   * closing on a target or slowing hard onto final.
   */
  private thrust(p: Aircraft, cas: number, dt: number, floor: number, allowAb = true, sbKt = 30, quick = false): void {
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
      const wantOn = !this.abOn && this.thrI > 0.985 && errKt > (quick ? 4 : 8);
      const wantOff = this.abOn && errKt < (quick ? -4 : -12);
      this.abTimer = wantOn || wantOff ? this.abTimer + dt : 0;
      if (this.abTimer > (quick ? 0.6 : 3)) {
        this.abOn = !this.abOn;
        this.abTimer = 0;
        this.thrI = this.abOn ? 1.03 : 0.97;
      }
    }
    const lo = this.abOn ? 1.02 : floor;
    const hi = this.abOn ? 1.1 : 1.0;
    const k = quick ? 4 : 1;
    this.thrI = clamp(this.thrI + errKt * 0.004 * k * dt, lo, hi);
    const thr = clamp(this.thrI + errKt * 0.008 * k - along * 0.04, lo, hi);
    c.throttle = clamp(c.throttle + clamp(thr - c.throttle, -0.4 * k * dt, 0.4 * k * dt), lo, hi);
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
    // --- the tanker join -------------------------------------------------------
    if (this.phase === 'tanker' && this.tanker) return this.flyTanker(p, dt);
    if (this.carrier && this.phase !== 'climb') {
      if (this.phase === 'rollout' || this.phase === 'stopped' || fm.trap) return this.carrierRollout(p);
      const dShip = Math.hypot(fm.pos.x - this.carrier.x, fm.pos.z - this.carrier.z);
      // start in time to get down from cruise height (about a 6 degree descent to the pattern)
      const startAt = Math.max(22000, (fm.pos.y - 400) / Math.tan(6 * DEG) + 8000);
      if (this.phase === 'approach' || this.phase === 'final' || dShip < startAt) return this.carrierApproach(p, dt);
    }
    if (this.phase === 'rollout' || this.phase === 'stopped') return this.rollout(p);
    if (fm.onGround && (this.phase === 'flare' || this.phase === 'final')) {
      this.set('rollout', 'TOUCHDOWN', 'good');
      return this.rollout(p);
    }

    // a go-around that touches the runway: roll on and lift off again (touch and go)
    if (this.phase === 'climb' && fm.onGround) return this.takeoff(p, dt);

    // --- climb-out: wings level on the runway heading, pulling up steeply as the speed builds,
    // to 600 ft above the ground
    if (this.phase === 'climb') {
      if (!this.gearUp && fm.agl > 10 && fm.vs > 1) this.gearUp = true;
      c.gearDown = !this.gearUp;
      const h = this.takeoffHdg * DEG;
      const pull = (fm.cas > 210 * KT ? 22 : 12) * DEG;
      _dir.set(Math.sin(h), 0, -Math.cos(h)).multiplyScalar(Math.cos(pull)).setY(Math.sin(pull));
      steerToward(p, _dir, { gCap: 3.5, tau: 1.0, maxBank: 8 });
      c.throttle = this.takeoffPower(fm.cas < 250 * KT);
      if (this.carrier && fm.agl > 250 && fm.cas > 170 * KT && this.phaseT > 6) {
        this.thrI = Math.min(1, c.throttle);
        this.set('approach', this.goArounds > 0 || this.cvBolters > 0 ? 'CLIMBING OUT — BACK AROUND FOR ANOTHER PASS' : 'TURNING BACK FOR THE CARRIER APPROACH');
        return;
      }
      if (fm.agl > 600 * FT && fm.cas > 200 * KT && (this.goArounds === 0 || this.phaseT > 8)) {
        this.thrI = Math.min(1, c.throttle);
        this.abOn = this.abMode === 'max';
        c.gearDown = false;
        this.origin.copy(fm.pos);
        this.set(this.tanker ? 'tanker' : 'cruise', this.tanker ? 'CLIMB-OUT COMPLETE — JOINING THE TANKER' : 'CLIMB-OUT COMPLETE — ON COURSE');
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
        const tanD = Math.tan(DESCENT_DEG * DEG);
        const tod = (fm.pos.y - gAlt) / tanD + 7000;
        if (this.phase === 'cruise' && gDist < tod && fm.pos.y > gAlt + 150) this.set('descent', `TOP OF DESCENT — DIVING FOR ${r.f.name} RWY ${r.name}`);
        if (this.phase === 'descent' || gDist < tod) {
          wantAlt = Math.min(wantAlt, gAlt + Math.max(0, gDist - 6000) * tanD);
          // dive at up to 450 kt (calibrated), the speedbrake holding it there; 350 kt down low
          descentCas = (fm.pos.y - gAlt < 1500 ? 350 : 450) * KT;
        }
        // after a go-around: fly the circuit round to the gate low and fast, not back up to cruise
        if (this.goArounds > 0) {
          wantAlt = Math.min(wantAlt, gAlt + 300);
          descentCas = 320 * KT;
        }
        if (gDist < 7000 || ((this.phase === 'descent' || this.goArounds > 0) && gDist < 12000 && fm.pos.y < gAlt + 700)) {
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
    this.limitTurn(p, _dir, 90);
    // always clear the terrain ahead (and a little to each side of the track)
    const look = Math.max(5000, fm.tas * 60);
    const ground = this.groundAhead(p, _dir.x, _dir.z, look);
    wantAlt = Math.max(wantAlt, ground + (this.phase === 'descent' ? 450 : 330));
    // the height command moves smoothly (terrain ahead can't jerk it about);
    // climbs to clear high ground are never held back
    const up = wantAlt > this.altCmd;
    this.altCmd += clamp(wantAlt - this.altCmd, -90 * dt, (up && wantAlt - fm.pos.y > 200 ? 160 : 60) * dt);
    if (wantAlt > fm.pos.y + 150) this.altCmd = Math.max(this.altCmd, wantAlt);
    if (this.phase === 'descent' && wantAlt < this.altCmd) this.altCmd = wantAlt;
    // vertical speed proportional to the height error (a firm capture, with a small dead band so
    // it doesn't chase every metre): steep climbs when there is speed for them, dives on the descent
    const err = this.altCmd - fm.pos.y;
    const e = Math.abs(err) < 8 ? 0 : err - Math.sign(err) * 8;
    const V = Math.max(60, fm.vel.length());
    const diving = this.phase === 'descent' && err < 0;
    const vsMax = err > 0 ? Math.min(160, V * Math.sin((fm.cas > 280 * KT ? 30 : 12) * DEG)) : diving ? V * Math.sin((DESCENT_DEG + 6) * DEG) : 60;
    const vs = clamp(e * (diving ? 0.2 : 0.08), -vsMax, vsMax);
    const climb = Math.asin(clamp(vs / V, -0.6, 0.6));
    _dir.multiplyScalar(Math.cos(climb)).setY(Math.sin(climb));
    // hard turns: up to 7 G when there is the speed for it
    steerToward(p, _dir, { gCap: fm.cas > 300 * KT ? 7 : 5, tau: 0.6, maxBank: 85 });
    if (descentCas > 0) this.thrust(p, Math.min(descentCas, this.casFor(p, wantKts)), dt, 0.0, false, 8, true);
    else this.thrust(p, this.casFor(p, wantKts), dt, 0.45);
  }

  /**
   * The TANKER program: a rendezvous with the KC-46. The jet runs in at full
   * speed (up to 390 kt faster than the tanker), climbing or diving at up to
   * 30 degrees, and brakes hard at the last moment (idle and speedbrake, on a
   * steady-deceleration profile) to arrive at the pre-contact point, a little
   * behind and below the boom's nozzle (or the basket), still closing; the
   * tanker's auto-connect takes it from there. From ahead of the tanker it
   * swings round behind it first, so it never meets it head-on.
   */
  private flyTanker(p: Aircraft, dt: number): void {
    const tk = this.tanker!;
    const fm = p.fm;
    const c = p.controls;
    c.gearDown = false;
    const kind = aarKind(p.spec.type) === 'probe' ? 'probe' : 'boom';
    const goal = tk.toWorld(contactTarget(kind).add(new THREE.Vector3(0, -1.5, 12)));
    // (the goal is for the receptacle / probe: offset it to the jet's own reference point)
    _p.copy(receiverPoint(p, kind)).applyQuaternion(fm.quat);
    goal.sub(_p);
    _rad.copy(goal).sub(fm.pos);
    const dist = _rad.length();
    this.tankerDist = dist;
    // not behind the tanker yet: first to a point 3 km behind it, on this side, then in
    const back = _bk.copy(tk.vel).setY(0).normalize();
    const along = (fm.pos.x - tk.pos.x) * back.x + (fm.pos.z - tk.pos.z) * back.z; // + = ahead of it
    let target = dist;
    let rejoin = false;
    if (along > -600 && dist > 900) {
      rejoin = true;
      const side = (fm.pos.x - tk.pos.x) * -back.z + (fm.pos.z - tk.pos.z) * back.x >= 0 ? 1 : -1;
      _rad.set(tk.pos.x - back.x * 3000 - back.z * side * 1200, goal.y, tk.pos.z - back.z * 3000 + back.x * side * 1200).sub(fm.pos);
      target = _rad.length() + 3000;
    }
    // closing speed: as fast as the jet can go far out, then a steady 2.5 m/s/s deceleration
    // that arrives at the pre-contact point still closing at 8 m/s
    const closure = Math.min(200, Math.sqrt(64 + 2 * 2.5 * Math.max(0, target - 15)));
    _dir.copy(_rad).divideScalar(Math.max(_rad.length(), 1e-3));
    // far out, climbs and dives up to 30 degrees
    if (dist > 1500) {
      const lim = Math.sin(30 * DEG);
      if (Math.abs(_dir.y) > lim) {
        const h = Math.hypot(_dir.x, _dir.z);
        const s = Math.sqrt(1 - lim * lim) / Math.max(h, 1e-6);
        _dir.set(_dir.x * s, Math.sign(_dir.y) * lim, _dir.z * s);
      }
    }
    // (swinging round behind it: flat out for the point behind it, never held back by the
    // tanker coming the other way)
    if (rejoin) _vt.copy(_dir).multiplyScalar(tk.speed + 150);
    else _vt.copy(tk.vel).addScaledVector(_dir, closure);
    // far out never slower than 250 kt (a slow jet low down sinks into the hills)
    const want = dist > 3000 ? Math.max(_vt.length(), this.casFor(p, 250) * (fm.tas / Math.max(1, fm.cas))) : _vt.length();
    _dir.copy(_vt).normalize();
    // the straight line up to the tanker can run into high ground (a join from
    // low level near the hills): keep clear of the terrain ahead, as every other leg does
    if (dist > 400) {
      const hl = Math.hypot(_dir.x, _dir.z);
      if (hl > 1e-3) {
        const hx = _dir.x / hl, hz = _dir.z / hl;
        const ground = this.groundAhead(p, hx, hz, Math.max(5000, fm.tas * 45));
        const short = ground + 450 - fm.pos.y;
        if (short > 0) {
          const minClimb = Math.sin(Math.min(1, short / 800) * 20 * DEG);
          if (_dir.y < minClimb) {
            const k = Math.sqrt(1 - minClimb * minClimb);
            _dir.set(hx * k, minClimb, hz * k);
          }
        }
      }
    }
    const close = dist < 400;
    steerToward(p, _dir, { gCap: close ? 2.5 : 7, tau: close ? 1.2 : 0.6, maxBank: close ? 25 : 85, allowPush: false });
    this.thrust(p, this.casFor(p, want / KT), dt, close ? 0.25 : 0.0, dist > 2500, close ? 3 : 6, true);
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

  /** Takeoff / climb-out power: full burner on MAX, burner to 250 kt on AUTO, military power on OFF. */
  private takeoffPower(early: boolean): number {
    if (this.abMode === 'max') return 1.1;
    if (this.abMode === 'off') return 1.0;
    return early ? 1.1 : 1.0;
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
    const inCone = s > 800 && Math.abs(e) < Math.max(500, Math.min(s * 0.12, 1200)) && aligned > 0.85;

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
      // fly to the gate, at the gate height, at 300 kt. Coming from the wrong side
      // (inside the gate, or heading against the landing direction) it first flies
      // outbound, beside the centreline, and turns in hard from there.
      const circuit = this.circuit;
      this.circuit = false;
      if (this.leg === 'gate' && s < GATE_DIST - 1500 && (aligned < 0.7 || circuit)) {
        this.leg = 'outbound';
        // the side with the lower ground under the outbound point
        const o = GATE_DIST + 3500;
        const hs = [1, -1].map((sd) => terrainHeight(r.aim.x - r.ux * o - r.uz * 3000 * sd, r.aim.z - r.uz * o + r.ux * 3000 * sd));
        this.legSide = Math.abs(hs[0] - hs[1]) > 150 ? (hs[0] < hs[1] ? 1 : -1) : e >= 0 ? 1 : -1;
      }
      if (this.leg === 'outbound') {
        // too close in: fly out beside the centreline to set up the approach
        const o = GATE_DIST + 3500, side = 3000 * this.legSide;
        const gx = r.aim.x - r.ux * o - r.uz * side;
        const gz = r.aim.z - r.uz * o + r.ux * side;
        _dir.set(gx - fm.pos.x, 0, gz - fm.pos.z).normalize();
        if (Math.hypot(fm.pos.x - gx, fm.pos.z - gz) < 1500 || s > GATE_DIST + 2000) this.leg = 'gate';
      } else {
        // intercept the extended centreline: runway heading plus up to 60 degrees toward
        // it, easing off as the offset shrinks, the turn-in started early enough for the
        // jet's turn radius at this speed
        const vNow = Math.hypot(fm.vel.x, fm.vel.z);
        const R = (vNow * vNow) / (9.81 * Math.tan(70 * DEG));
        const cc = clamp(-e / Math.max(900, R * 1.3), -1, 1) * 60 * DEG;
        _dir.set(r.ux * Math.cos(cc) - r.uz * Math.sin(cc), 0, r.uz * Math.cos(cc) + r.ux * Math.sin(cc)).normalize();
      }
      this.limitTurn(p, _dir, 80);
      const ground = Math.max(this.groundAhead(p, _dir.x, _dir.z, Math.max(6000, fm.tas * 45)), terrainHeight(fm.pos.x, fm.pos.z));
      const wantAlt = Math.max(this.glideY(GATE_DIST) - 150, ground + 450);
      // terrain escape: rising ground close ahead of where the jet is actually going (the look-ahead
      // above follows the wanted heading, which keeps swinging round in a turn): wings level, full
      // power, climb, and only then carry on with the pattern
      const vh = Math.max(1, Math.hypot(fm.vel.x, fm.vel.z));
      const near = Math.max(this.groundAhead(p, fm.vel.x / vh, fm.vel.z / vh, Math.max(3000, fm.tas * 25)), terrainHeight(fm.pos.x, fm.pos.z));
      if (fm.pos.y - near < 300) {
        _dir.set(fm.vel.x / vh, 0, fm.vel.z / vh).multiplyScalar(Math.cos(15 * DEG)).setY(Math.sin(15 * DEG));
        steerToward(p, _dir, { gCap: 4, tau: 0.6, maxBank: 10, allowPush: false });
        p.controls.throttle = this.abMode === 'off' ? 1 : 1.1;
        p.controls.speedbrake = false;
        p.controls.gearDown = false;
        return;
      }
      const climb = clamp((wantAlt - fm.pos.y) / 700, -1, 1) * (wantAlt > fm.pos.y ? 20 : 16) * DEG;
      _dir.multiplyScalar(Math.cos(climb)).setY(Math.sin(climb));
      // a hard break round onto the centreline: fast, slowing to 220 kt over the last few km
      steerToward(p, _dir, { gCap: 6, tau: 0.6, maxBank: 75 });
      const toGate = Math.hypot(s - GATE_DIST, e);
      this.thrust(p, (toGate > 6000 ? 300 : 220) * KT, dt, 0.0, false, 10, true);
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
    // flare height from the sink rate: about two and a half seconds before the wheels would
    // touch (a heavy jet coming down fast needs the room: up to 30 m)
    const hFlare = clamp(-fm.vs * 2.6, 7, 30);
    if ((hRwy < hFlare && s < 1100) || this.phase === 'flare') {
      if (this.phase !== 'flare') {
        this.set('flare', 'FLARE');
        this.flarePitch = 0.05;
      }
      // round out: the sink rate eases off with height (about 2.5 s to go at any height),
      // down to 0.6 m/s at the wheels; after 5 s it stops holding off and lets it settle
      let sink = -Math.max(0.6, hRwy / 2.6);
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
    steerToward(p, _dir, { gCap: 3, tau: 0.8, maxBank: s < 4000 ? 15 : 40, allowPush: false });
    if (this.gearLaw(p)) this.pathPitch(p, gam, dt, 1.3);
    else this.lastGam = Math.asin(clamp(fm.vel.y / Math.max(40, fm.vel.length()), -1, 1));
    c.gearDown = true;
    // configured and slowing: a little fast for the first 3 NM, then on-speed from 5 NM
    const base = s > 5 * NM ? Math.max(Math.min(app + 30, 195), onSpeed) : onSpeed;
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
    this.circuit = true;
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

  // -------------------------------------------------------------------------
  // Carrier auto-land
  // -------------------------------------------------------------------------

  /**
   * Where the touchdown point will be when the jet gets there. The ship sails
   * a circle, so the deck is aimed at where it will be at touchdown, not where
   * it is now: that point and the landing direction then are fixed in the
   * world, and the jet flies a straight 3.5 degree path to them (like a
   * runway), arriving just as the deck does. The time to go is refined every
   * step, so the aim converges on the real deck as it closes.
   */
  private cvGeometry(p: Aircraft, tdTime: number): void {
    const c = this.carrier!;
    const fm = p.fm;
    const L = c.layout;
    const wires = L.wires;
    // the hook comes down onto the deck just short of the target wire (the 3-wire, or the
    // 2-wire with three): a little long still catches the last, a little short rolls the
    // hook across the first ones
    const back = p.spec.gear.main + HOOK_AFT;
    const target = wires[wires.length >= 4 ? 2 : 1];
    const sCg = wires[0] - 4 + back;
    const a = -LANDING_AREA.angleDeg * DEG;
    const au = L.rampU + Math.cos(a) * sCg, av = L.rampV + Math.sin(a) * sCg;
    const pp = { x: 0, z: 0, h: 0 };
    c.pathAt(tdTime, pp);
    const fx = Math.sin(pp.h), fz = -Math.cos(pp.h), rx = Math.cos(pp.h), rz = Math.sin(pp.h);
    const cv = this.cv;
    cv.x = pp.x + fx * au + rx * av;
    cv.z = pp.z + fz * au + rz * av;
    const hl = pp.h - LANDING_AREA.angleDeg * DEG;
    cv.ux = Math.sin(hl);
    cv.uz = -Math.cos(hl);
    cv.d = (cv.x - fm.pos.x) * cv.ux + (cv.z - fm.pos.z) * cv.uz;
    cv.e = (fm.pos.x - cv.x) * -cv.uz + (fm.pos.z - cv.z) * cv.ux;
    // the deck height there at that moment (its heave and pitch are predictable), wheels on it
    cv.y = c.deckYAt(au, av, tdTime) + p.spec.gear.height;
  }

  /** Time (s) the jet still needs to reach the touchdown point the way it will fly there. */
  private cvTimeNeeded(p: Aircraft): number {
    const fm = p.fm;
    const cv = this.cv;
    const vFinal = Math.max(55, p.spec.approachKts * KT);
    // on final the jet flies on-speed: plan with that speed, not the speed of the moment
    // (slowing down would otherwise keep moving the touchdown point, and swing the final course)
    const ratio = fm.tas > 30 ? fm.tas / Math.max(1, fm.cas) : 1;
    const vOn = Math.max(45, this.cvSpeedMin(p) * ratio);
    if (this.phase === 'final') return Math.max(0, cv.d) / vOn;
    const vApp = Math.max(70, Math.hypot(fm.vel.x, fm.vel.z));
    const gx = cv.x - cv.ux * CV_GATE, gz = cv.z - cv.uz * CV_GATE;
    let path = Math.hypot(fm.pos.x - gx, fm.pos.z - gz);
    if (this.leg === 'outbound' || cv.d < CV_GATE) {
      // out beside the final course, then back in to the gate
      const o = this.cvOut;
      const ox = cv.x - cv.ux * o - cv.uz * 3200 * this.legSide, oz = cv.z - cv.uz * o + cv.ux * 3200 * this.legSide;
      path = Math.hypot(fm.pos.x - ox, fm.pos.z - oz) + o - CV_GATE + 2000;
    }
    return path / vApp + CV_GATE / Math.max(vFinal, vOn);
  }

  /** Touchdown time and geometry: committed for the approach, refined on final. */
  private cvPlan(p: Aircraft): void {
    const now = this.carrier!.t;
    if (this.phase === 'final') {
      // refine the touchdown time smoothly (a jump would swing the final course about)
      let want = this.cvTd;
      for (let k = 0; k < 3; k++) {
        this.cvGeometry(p, want);
        want = now + this.cvTimeNeeded(p);
      }
      // close in the touchdown time is locked: a fixed aim point the jet can line up on
      // exactly (a second early or late only moves the touchdown a few metres along the deck)
      const rate = this.cv.d < 1500 ? 0 : 1.2;
      this.cvTd += clamp(want - this.cvTd, -rate * this.dtLast, rate * this.dtLast);
      this.cvGeometry(p, this.cvTd);
      return;
    }
    const first = this.cvTd < 0;
    if (first) this.cvTd = now + 120;
    let want = this.cvTd;
    for (let k = 0; k < 3; k++) {
      this.cvGeometry(p, want);
      want = now + this.cvTimeNeeded(p);
    }
    // keep the plan unless it is badly out (a long way round); then move it, but gradually:
    // a jump would swing the final course (the ship is sailing a circle) out from under the jet
    if (first) this.cvTd = want;
    else if (Math.abs(this.cvTd - want) > 25 || this.cvTd < want - 10) this.cvTd += clamp(want - this.cvTd, -3 * this.dtLast, 3 * this.dtLast);
    this.cvGeometry(p, this.cvTd);
  }

  /** On-speed (calibrated, m/s): the approach speed plus what this jet needs to fly the
   * path without too much angle of attack (learnt on final). */
  private cvSpeedMin(p: Aircraft): number {
    return (p.spec.approachKts + (CV_SPEED_ADD[p.type] ?? 28) + this.aoaGuard) * KT;
  }

  /** Glide path height (world) for the wheels, `d` metres short of touchdown. */
  private cvPathY(d: number): number {
    return this.cv.y + Math.max(0, d) * Math.tan(CV_GS);
  }

  private carrierApproach(p: Aircraft, dt: number): void {
    const fm = p.fm;
    const c = p.controls;
    this.dtLast = dt;
    this.cvPlan(p);
    const cv = this.cv;
    const { d, e } = cv;
    const vx = fm.vel.x, vz = fm.vel.z;
    const vh = Math.max(1, Math.hypot(vx, vz));
    const aligned = (vx * cv.ux + vz * cv.uz) / vh;
    const app = p.spec.approachKts;
    // on the deck, hook down: keep going until a wire takes it; past the last wire it is a bolter
    if (this.phase === 'final' && fm.onGround && !fm.trap) {
      const L = this.carrier!.layout;
      const back = p.spec.gear.main + HOOK_AFT;
      const l = this.carrier!.toLocal(fm.pos.x - fm.fwd.x * back, fm.pos.z - fm.fwd.z * back, { u: 0, v: 0 });
      const ax = this.carrier!.landingAxis(l.u, l.v);
      if (ax.s < L.wires[L.wires.length - 1] + 3) {
        c.pitch = 0;
        c.roll = 0;
        fm.hookDown = true;
        return;
      }
    }
    // a bolter: the wheels touched but no wire caught - full power and go round
    if (this.phase === 'final' && fm.onGround && !fm.trap) {
      this.cvBolters++;
      this.takeoffHdg = fm.heading;
      this.gearUp = true;
      this.cvTd = -1;
      this.leg = 'outbound';
      this.rollCalled = true;
      this.set('climb', 'BOLTER, BOLTER — POWER UP, GOING AROUND', 'warn');
      c.throttle = 1;
      c.pitch = 0.3;
      return;
    }
    if (this.phase !== 'approach' && this.phase !== 'final') {
      if (this.phase !== 'climb') this.leg = 'gate';
      this.set('approach', `CARRIER APPROACH — ${this.carrier!.name}`);
    }
    if (this.phase === 'approach' && this.leg === 'gate' && d > 3000 && d < CV_GATE + 3500 && Math.abs(e) < Math.max(300, d * 0.06) && aligned > 0.96 && Math.abs(fm.pos.y - this.cvPathY(d)) < 200) {
      this.gsI = 0;
      this.ePrev = e;
      this.eDotF = 0;
      this.locCap = this.gsCap = false;
      this.set('final', 'FINAL — CALL THE BALL');
    }
    // way off close in: wave off and come round again
    // off the final course while still well out: back to the approach to intercept it again
    if (this.phase === 'final' && d > 2500 && (Math.abs(e) > Math.max(800, d * 0.25) || aligned < 0.6)) {
      this.leg = 'gate';
      this.set('approach', 'RE-INTERCEPTING THE FINAL COURSE', 'warn');
    }
    // off the line: fixable well out (it banks back on), not close in
    const woLat = d < 1800 && Math.abs(e) > Math.max(13, d * 0.1);
    const woHigh = d < 1800 && fm.pos.y - this.cvPathY(d) > Math.max(9, d * 0.04);
    // low close in: never press on into the ramp
    // (only before the ramp: past the touchdown point the wheels are about to meet the deck)
    const woLow = d < 1800 && d > 60 && this.cvPathY(d) - fm.pos.y > Math.max(6, d * 0.025);
    if (this.phase === 'final' && (woLat || woHigh || woLow || d < -150 || (d <= 2500 && aligned < 0.6))) {
      this.woWhy = `${woLat ? 'LINE-UP' : woHigh ? 'HIGH' : woLow ? 'LOW' : d < -150 ? 'PASSED' : 'ALIGN'} d=${Math.round(d)} e=${Math.round(e)} dy=${Math.round(fm.pos.y - this.cvPathY(d))} al=${aligned.toFixed(2)}`;
      this.takeoffHdg = fm.heading;
      this.gearUp = false;
      this.cvTd = -1;
      this.leg = 'outbound';
      this.rollCalled = true;
      this.goArounds++;
      this.set('climb', 'WAVE OFF — GOING AROUND FOR ANOTHER PASS', 'warn');
      return;
    }
    if (this.phase === 'approach') {
      // clean and fast until final (gear down only on final, like the runway approach)
      c.gearDown = false;
      fm.hookDown = false;
      // to the final course astern of the ship; from ahead or abeam, out beside it first
      if (this.leg === 'gate' && (d < 2800 || (d < CV_GATE - 1500 && aligned < 0.7))) {
        this.leg = 'outbound';
        this.legSide = e >= 0 ? 1 : -1;
        this.onCall?.('SETTING UP — SWINGING OUT BEHIND THE SHIP TO TURN ONTO FINAL', 'info');
      }
      const gateAlt = this.cvPathY(CV_GATE) + 40;
      if (this.leg === 'outbound') {
        // high above the pattern: run out further, so the whole descent fits in one lap
        // (out and back at about 10 degrees) instead of circling down a lap at a time
        const hiNow = Math.max(0, fm.pos.y - gateAlt);
        this.cvOut = Math.max(this.cvOut, clamp((hiNow / Math.tan(10 * DEG) + CV_GATE) / 2 + 1500, CV_GATE + 4500, 35000));
        const o = this.cvOut, side = 3200 * this.legSide;
        const gx = cv.x - cv.ux * o - cv.uz * side, gz = cv.z - cv.uz * o + cv.ux * side;
        _dir.set(gx - fm.pos.x, 0, gz - fm.pos.z).normalize();
        if (Math.hypot(fm.pos.x - gx, fm.pos.z - gz) < 1800 || d > o - 1500) {
          this.leg = 'gate';
          this.cvOut = CV_GATE + 4500;
          this.onCall?.('TURNING IN — LINING UP ON THE DECK', 'info');
        }
      } else {
        // intercept the final course: steeper the further off it, and eased off early enough
        // for this jet's turn radius at this speed (a heavy, fast jet would sail through it)
        const R = (vh * vh) / (9.81 * Math.tan(50 * DEG));
        const lead = clamp(R * 1.6, 1500, 5000);
        const cc = clamp(Math.atan2(-e, lead), -80 * DEG, 80 * DEG);
        _dir.set(cv.ux * Math.cos(cc) - cv.uz * Math.sin(cc), 0, cv.uz * Math.cos(cc) + cv.ux * Math.sin(cc)).normalize();
      }
      this.limitTurn(p, _dir, 75);
      const high = fm.pos.y - gateAlt;
      const climb = clamp(-high / 900, -1, 1) * (high < 0 ? 12 : high > 1500 ? 12 : 8) * DEG;
      _dir.multiplyScalar(Math.cos(climb)).setY(Math.sin(climb));
      // pull hard round to the ship (it is a fighter); low below the gate height, shallower
      // turns so the climb back up comes first; never a wings-level 'push' to descend
      const low = fm.pos.y < gateAlt - 80;
      // close to the water and sinking: wings level, full power, climb (never into the sea)
      const danger = fm.pos.y < 140 && fm.vs < -2;
      if (danger) {
        _dir.setY(0).normalize().multiplyScalar(Math.cos(14 * DEG)).setY(Math.sin(14 * DEG));
        steerToward(p, _dir, { gCap: 4, tau: 0.6, maxBank: 10, allowPush: false });
        p.controls.throttle = this.abMode === 'off' ? 1 : 1.1;
        p.controls.speedbrake = false;
        return;
      }
      steerToward(p, _dir, { gCap: low ? 3.5 : 4.5, tau: 0.8, maxBank: low ? 50 : 70, allowPush: false });
      // slow to just above on-speed before the gate, so final is flown at one speed; a heavy
      // jet that needs a high angle of attack to hold its height gets more
      this.apBonus = clamp(this.apBonus + ((fm.alpha / DEG) - 13) * 4 * dt, 0, 120);
      const near = this.cvSpeedMin(p) / KT + 10;
      // far from the ship: keep the cruise speed (just descending), slow down only close in
      const shipDist = Math.hypot(fm.pos.x - this.carrier!.x, fm.pos.z - this.carrier!.z);
      const wantKts = shipDist > 20000 ? Math.max(250, Math.min(this.speedKts, 450)) : d < 11000 && high < 600 ? Math.max(near, 150) + this.apBonus : 250 + this.apBonus * 0.5;
      this.thrust(p, shipDist > 20000 ? this.casFor(p, wantKts) : wantKts * KT, dt, 0.2, false, high > 600 ? 10 : 12);
      if (high > 800) p.controls.speedbrake = p.controls.speedbrake || fm.cas > 300 * KT;
      return;
    }
    // --- final: the line to where the deck will be, on a 3.5 degree path --------
    const aoa = fm.alpha / DEG;
    // the speed is set per jet (a steady speed keeps the touchdown time, and so the aim
    // point, steady); a jet that still runs out of angle of attack gets more, slowly
    if (this.gearLaw(p)) this.aoaGuard = clamp(this.aoaGuard + (aoa > 15 ? (aoa - 15) * 2 : 0) * dt, 0, 30);
    const onSpeed = this.cvSpeedMin(p) / KT;
    const V = Math.max(40, fm.vel.length());
    const Lc = d < 3000 ? clamp(V * 2.6, 150, 1400) : clamp(V * 4, 200, 1400);
    const sc = d - Lc;
    const cx = cv.x - cv.ux * sc, cz = cv.z - cv.uz * sc;
    const hx = cx - fm.pos.x, hz = cz - fm.pos.z;
    const hd = Math.max(1, Math.hypot(hx, hz));
    _dir.set(hx / hd, 0, hz / hd);
    this.limitTurn(p, _dir, 20);
    const pathErr = this.cvPathY(d) - fm.pos.y;
    this.gsI = clamp(this.gsI + pathErr * dt, -200, 200);
    // no flare on a carrier: fly the path all the way into the deck
    let gam = -CV_GS + clamp(pathErr / (d < 1500 ? 10 : 18) + this.gsI * 0.006, -3, 3) * DEG;
    // close in: point the flight path at the touchdown point itself, so being a few metres
    // high or low is taken out before the deck rather than carried onto it (landing long)
    if (d < 1500) {
      const aim = -Math.atan2(fm.pos.y - cv.y, Math.max(d, 250));
      gam = clamp(aim + (pathErr / 10) * DEG * 0.5, -CV_GS - 2.5 * DEG, -CV_GS + 2 * DEG);
    }
    _dir.multiplyScalar(Math.cos(gam)).setY(Math.sin(gam));
    steerToward(p, _dir, { gCap: 2.2, tau: 0.8, maxBank: d < 1500 ? 15 : 25, allowPush: false });
    if (this.gearLaw(p)) this.pathPitch(p, gam, dt, 1.4);
    else this.lastGam = Math.asin(clamp(fm.vel.y / V, -1, 1));
    // line-up: small corrections need real bank (the general steering only uses rudder for
    // the last few degrees, too weak to take out a few metres): bank from the error off the
    // centreline and how fast it is changing
    const eDot = this.dtLast > 0 ? (e - this.ePrev) / this.dtLast : 0;
    this.ePrev = e;
    this.eDotF += (eDot - this.eDotF) * Math.min(1, this.dtLast * 4);
    if (d > 120) {
      const lim = d > 1000 ? 22 : 12;
      const wantBank = clamp(-(e * 0.25 + this.eDotF * 1.6), -lim, lim);
      c.roll = clamp((wantBank - fm.bank) * 0.06 - fm.rollRate * 0.012, -0.6, 0.6);
    }
    // the last moments: wings level, nose on the line
    if (d < 120) {
      c.roll = clamp((clamp(-e * 0.6, -5, 5) - fm.bank) * 0.05 - fm.rollRate * 0.01, -0.5, 0.5);
      const hdgErr = ((Math.atan2(cv.ux, -cv.uz) / DEG - fm.heading + 540) % 360) - 180;
      c.yaw = clamp((hdgErr - clamp(e * 0.5, -4, 4)) * 0.08, -0.6, 0.6);
    }
    c.gearDown = true;
    fm.hookDown = true;
    // slowing to on-speed by 4 km out, then on-speed all the way to the deck
    // (power stays up through the touchdown in case of a bolter)
    const target = onSpeed + clamp(pathErr * 0.4, -5, 12);
    this.thrust(p, target * KT, dt, 0.2, false, 6);
  }

  /** In the wire: idle, then stopped. */
  private carrierRollout(p: Aircraft): void {
    const fm = p.fm;
    const c = p.controls;
    c.throttle = 0;
    c.gearDown = true;
    c.pitch = 0;
    c.roll = 0;
    c.yaw = 0;
    if (this.phase !== 'rollout' && this.phase !== 'stopped') this.set('rollout', `TRAPPED — ${fm.lastTrap.wire} WIRE`, 'good');
    if (this.phase === 'rollout' && !fm.trap && fm.gs < 2) {
      this.set('stopped', `ON DECK ${this.carrier!.name}. YOU HAVE CONTROL · H TO REARM`, 'good');
      this.engaged = false;
    }
  }
}
