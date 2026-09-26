// Navigation system: a steerpoint list built from the theater (every
// airfield plus the bullseye), TACAN-style bearing / range, an ILS for each
// runway end, and fuel planning (bingo, fuel at steerpoint, endurance).
//
// The HUD, the HSI / FUEL / TSD pages and the UFC all read from this.

import type { Aircraft } from '../aircraft/aircraft';
import { AIRFIELDS, AirfieldDef, toRunwayLocal } from '../world/islands';
import { NM, LB, DEG, Team } from '../core/constants';
import { bearingXZ, clamp, wrap360 } from '../core/math';

export type SteerKind = 'airfield' | 'bullseye';

export interface Steerpoint {
  num: number;
  id: string;
  name: string;
  short: string;
  kind: SteerKind;
  x: number;
  z: number;
  elev: number;
  field: AirfieldDef | null;
  tacan: string;
  friendly: boolean;
}

export interface IlsState {
  field: AirfieldDef;
  /** runway heading for this approach end (deg true) */
  course: number;
  /** runway designator for the approach end, e.g. "16" */
  runway: string;
  /** distance to the threshold along the extended centreline (m, >0 before it) */
  distThr: number;
  /** lateral offset (m, + = right of centreline) */
  across: number;
  /** localizer deviation in dots (-2..2, + = runway is to the right) */
  locDots: number;
  /** glideslope deviation in dots (-2..2, + = you are above) */
  gsDots: number;
  /** current angle above the threshold (deg) */
  gsAngle: number;
  /** height above the field (m) */
  hat: number;
  captured: boolean;
}

export interface FuelPlan {
  totalLb: number;
  flowPph: number;
  enduranceMin: number;
  /** still-air range at the current fuel flow and ground speed (NM) */
  rangeNm: number;
  /** time to the selected steerpoint (s) */
  ttgSec: number;
  /** fuel remaining on arrival at the steerpoint (lb) */
  atStptLb: number;
  bingoLb: number;
  jokerLb: number;
  belowBingo: boolean;
  belowJoker: boolean;
}

export const GLIDESLOPE_DEG = 3;
/** where along the runway the glideslope touches down (m past the threshold) */
export const GS_AIMPOINT = 300;

export function runwayDesignator(headingDeg: number): string {
  let n = Math.round(wrap360(headingDeg) / 10);
  if (n === 0) n = 36;
  return String(n).padStart(2, '0');
}

export class NavSystem {
  readonly points: Steerpoint[] = [];
  index = 0;
  bingoLb = 4000;
  /** approach mode: ILS cues follow the selected airfield */
  ilsEnabled = true;
  /** manual course (deg) for the HSI; null = auto (runway course / direct) */
  course: number | null = null;

  constructor(readonly team: Team) {
    const own = AIRFIELDS.filter((f) => f.team === team);
    const other = AIRFIELDS.filter((f) => f.team !== team);
    let n = 1;
    for (const f of [...own, ...other]) {
      this.points.push({
        num: n++,
        id: f.id,
        name: f.name,
        short: f.icao,
        kind: 'airfield',
        x: f.x,
        z: f.z,
        elev: f.elev,
        field: f,
        tacan: f.tacan,
        friendly: f.team === team,
      });
    }
    this.points.push({
      num: n++,
      id: 'bullseye',
      name: 'BULLSEYE',
      short: 'BULL',
      kind: 'bullseye',
      x: 0,
      z: 0,
      elev: 0,
      field: null,
      tacan: '',
      friendly: true,
    });
  }

  get current(): Steerpoint {
    return this.points[this.index];
  }

  get bullseye(): Steerpoint {
    return this.points[this.points.length - 1];
  }

  next(): Steerpoint {
    this.index = (this.index + 1) % this.points.length;
    this.course = null;
    return this.current;
  }

  prev(): Steerpoint {
    this.index = (this.index + this.points.length - 1) % this.points.length;
    this.course = null;
    return this.current;
  }

  select(id: string): void {
    const i = this.points.findIndex((p) => p.id === id);
    if (i >= 0) {
      this.index = i;
      this.course = null;
    }
  }

  /** Pick the nearest friendly airfield (RTB). */
  selectNearestFriendly(x: number, z: number): Steerpoint {
    let best = 0;
    let bd = Infinity;
    this.points.forEach((p, i) => {
      if (p.kind !== 'airfield' || !p.friendly) return;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    this.index = best;
    this.course = null;
    return this.current;
  }

  bearingTo(x: number, z: number, sp = this.current): number {
    return bearingXZ(x, z, sp.x, sp.z);
  }

  rangeTo(x: number, z: number, sp = this.current): number {
    return Math.hypot(sp.x - x, sp.z - z);
  }

  /** Slant range (TACAN DME is slant range) in metres. */
  dmeTo(p: Aircraft, sp = this.current): number {
    const dh = p.fm.pos.y - sp.elev;
    return Math.sqrt(this.rangeTo(p.fm.pos.x, p.fm.pos.z, sp) ** 2 + dh * dh);
  }

  /** Bearing / range from the bullseye to a point, e.g. "045/32". */
  bullsFor(x: number, z: number): { brg: number; rngNm: number; text: string } {
    const b = this.bullseye;
    const brg = bearingXZ(b.x, b.z, x, z);
    const rngNm = Math.hypot(x - b.x, z - b.z) / NM;
    return { brg, rngNm, text: `${String(Math.round(brg) % 360).padStart(3, '0')}/${Math.round(rngNm)}` };
  }

  /** Course the HSI shows: manual, the runway course near a field, or direct. */
  displayCourse(p: Aircraft): number {
    if (this.course !== null) return this.course;
    const ils = this.ils(p);
    if (ils) return ils.course;
    return this.bearingTo(p.fm.pos.x, p.fm.pos.z);
  }

  /** Deviation from the displayed course line through the steerpoint, in NM (+ = steerpoint line is to the right). */
  courseDeviationNm(p: Aircraft): number {
    const crs = this.displayCourse(p) * DEG;
    const sp = this.current;
    // vector from steerpoint to aircraft
    const dx = p.fm.pos.x - sp.x, dn = -(p.fm.pos.z - sp.z);
    // component perpendicular to the course (positive = aircraft right of course)
    const right = dx * Math.cos(crs) - dn * Math.sin(crs);
    return -right / NM;
  }

  /**
   * ILS for the selected airfield (or, failing that, the nearest friendly one)
   * when the aircraft is within 10 NM of a threshold (glideslope service volume), roughly lined up.
   */
  ils(p: Aircraft): IlsState | null {
    if (!this.ilsEnabled) return null;
    const fields: AirfieldDef[] = [];
    const cur = this.current.field;
    if (cur) fields.push(cur);
    for (const f of AIRFIELDS) if (f.team === this.team && f !== cur) fields.push(f);
    let best: IlsState | null = null;
    for (const f of fields) {
      const loc = toRunwayLocal(f, p.fm.pos.x, p.fm.pos.z);
      for (const recip of [false, true]) {
        const along = recip ? -loc.along : loc.along;
        const across = recip ? -loc.across : loc.across;
        const distThr = -along - f.length / 2;
        if (distThr < -f.length || distThr > 10 * NM) continue;
        const course = wrap360(recip ? f.heading + 180 : f.heading);
        let dh = wrap360(p.fm.heading - course);
        if (dh > 180) dh -= 360;
        if (Math.abs(dh) > 70) continue;
        // lateral cone: +-35 deg from the threshold
        if (Math.abs(across) > Math.max(1200, Math.abs(distThr) * 0.7)) continue;
        const hat = p.fm.pos.y - f.elev;
        const gsDist = Math.max(1, distThr + GS_AIMPOINT);
        const gsAngle = Math.atan2(hat, gsDist) / DEG;
        // localizer: full scale (2 dots) = 2.5 deg
        const locAng = Math.atan2(across, Math.max(50, distThr + f.length)) / DEG;
        const locDots = clamp(-locAng / 1.25, -2.5, 2.5);
        // glideslope: full scale (2 dots) = 0.7 deg
        const gsDots = clamp((gsAngle - GLIDESLOPE_DEG) / 0.35, -2.5, 2.5);
        const st: IlsState = {
          field: f,
          course,
          runway: runwayDesignator(course),
          distThr,
          across,
          locDots,
          gsDots,
          gsAngle,
          hat,
          captured: Math.abs(locDots) < 1 && Math.abs(gsDots) < 1,
        };
        if (f === cur) return st;
        if (!best || Math.abs(across) < Math.abs(best.across)) best = st;
      }
      if (f === cur && best) break;
    }
    return best;
  }

  fuelPlan(p: Aircraft): FuelPlan {
    const fm = p.fm;
    const totalLb = fm.fuelTotal / LB;
    const flowPph = (fm.fuelFlow / LB) * 3600;
    const gs = Math.max(1, Math.hypot(fm.vel.x, fm.vel.z));
    const enduranceMin = flowPph > 1 ? (totalLb / flowPph) * 60 : 999;
    const rangeNm = flowPph > 1 ? (totalLb / flowPph) * ((gs * 3600) / NM) : 9999;
    const dist = this.rangeTo(fm.pos.x, fm.pos.z);
    const ttgSec = dist / gs;
    // cruise back at a sensible fuel flow if the engines are idling right now
    const planFlow = Math.max(flowPph, (p.spec.engines * 3200));
    const atStptLb = totalLb - (planFlow * ttgSec) / 3600;
    const jokerLb = this.bingoLb + 1500;
    return {
      totalLb,
      flowPph,
      enduranceMin,
      rangeNm,
      ttgSec,
      atStptLb,
      bingoLb: this.bingoLb,
      jokerLb,
      belowBingo: totalLb < this.bingoLb,
      belowJoker: totalLb < jokerLb,
    };
  }

  /** Default bingo: enough to fly 60 NM home and land with reserve. */
  defaultBingo(p: Aircraft): number {
    const internalLb = p.spec.internalFuel / LB;
    return Math.round((internalLb * 0.18) / 100) * 100;
  }
}

export function fmtBrg(deg: number): string {
  return String(Math.round(wrap360(deg)) % 360).padStart(3, '0');
}

export function fmtTtg(sec: number): string {
  if (!isFinite(sec) || sec > 99 * 3600) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** On-speed approach angle of attack (deg) for the AoA bracket / indexer. */
export const ONSPEED_AOA: Record<string, number> = { F15EX: 8.5, FA18EF: 8.1, TYPHOON: 11 };

export interface LandingGrade {
  grade: 'GREASER' | 'GOOD' | 'FIRM' | 'HARD' | 'OFF RUNWAY';
  sinkFpm: number;
  speedKts: number;
  speedDelta: number;
  centreline: number;
  pastThreshold: number;
  field: AirfieldDef | null;
  text: string;
}

/** Grade a touchdown: sink rate, speed vs. approach speed, centreline and touchdown zone. */
export function gradeLanding(p: Aircraft): LandingGrade {
  const td = p.fm.lastTouchdown;
  const sinkFpm = (td.sink / 0.3048) * 60;
  const speedKts = td.tas / 0.514444;
  const speedDelta = speedKts - p.spec.approachKts;
  // nearest runway end we landed on
  let field: AirfieldDef | null = null;
  let centre = Infinity;
  let past = 0;
  for (const f of AIRFIELDS) {
    const loc = toRunwayLocal(f, td.x, td.z);
    if (Math.abs(loc.along) > f.length / 2 + 200 || Math.abs(loc.across) > 150) continue;
    let dh = wrap360(td.heading - f.heading);
    if (dh > 180) dh -= 360;
    const recip = Math.abs(dh) > 90;
    const along = recip ? -loc.along : loc.along;
    if (Math.abs(loc.across) < Math.abs(centre)) {
      field = f;
      centre = recip ? -loc.across : loc.across;
      past = along + f.length / 2;
    }
  }
  let grade: LandingGrade['grade'];
  if (!field || Math.abs(centre) > 25 || past < -20) grade = 'OFF RUNWAY';
  else if (sinkFpm < 300 && Math.abs(centre) < 6 && past > 100 && past < 700) grade = 'GREASER';
  else if (sinkFpm < 600) grade = 'GOOD';
  else if (sinkFpm < 900) grade = 'FIRM';
  else grade = 'HARD';
  const parts = [`${Math.round(sinkFpm)} FPM`, `${Math.round(speedKts)} KT (${speedDelta >= 0 ? '+' : ''}${Math.round(speedDelta)})`];
  if (field) parts.push(`CL ${Math.abs(centre).toFixed(0)} M ${centre > 0.5 ? 'R' : centre < -0.5 ? 'L' : ''}`.trim(), `${Math.round(past)} M PAST THR`);
  return {
    grade,
    sinkFpm,
    speedKts,
    speedDelta,
    centreline: isFinite(centre) ? centre : 0,
    pastThreshold: past,
    field,
    text: `TOUCHDOWN ${field ? field.icao + ' ' : ''}— ${parts.join(' · ')} — ${grade}${grade === 'GREASER' ? '!' : ''}`,
  };
}
