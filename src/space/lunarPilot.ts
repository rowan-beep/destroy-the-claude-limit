// The flight computer's two lunar programs.
//
// GO TO THE MOON, from Earth orbit: plan the trans-lunar injection (TLI), wait
// for the moment, burn the S-IVB until the orbit has the planned energy; then
// transposition, docking and extraction (the screen animates it: the adapter
// panels open, the command and service module turns round, docks with the lunar
// module and pulls it free; the S-IVB is left behind); if the S-IVB ran short,
// the service module's engine finishes the job; two mid-course corrections trim
// the arrival to a 110 km pass; then lunar orbit insertion behind the Moon.
//
// LAND ON THE MOON, from lunar orbit: undock the lunar module, pick a landing
// spot where the Sun stands low behind you (long shadows, the way Apollo came
// in), lower the orbit to a 15 km low point half an orbit before it, and fly
// the powered descent: braking with the engine pointed along the path, pitching
// up through the high gate, then a slow, near-vertical approach, throttling down
// to touchdown at about a metre a second. The lunar module stays there.

import { FlightSim, ENGINES } from './flightSim';
import { EARTH, MOON, V3, add, cross, dot, len, norm, scale, sub } from './universe';
import { planMcc, planTli, TliPlan, encounter } from './lunarPlan';
import { sunDirection } from './flightSim';
import type { Action } from './autopilot';

export type LunarId = 'moon' | 'land';
interface Lunar {
  id: LunarId;
  phase: string;
  t: number;
  burning: boolean;
  plan?: TliPlan;
  /** a burn along a fixed direction: what is left of it (m/s) */
  dvLeft?: number;
  /** time of the second mid-course correction, and of the closest pass */
  tMcc2?: number;
  tArrive?: number;
  /** landing: the orbit's frame and the angles (from that frame's x) for DOI and touchdown */
  ex?: V3;
  ey?: V3;
  aDoi?: number;
  aLand?: number;
}

const days = (t: number) => {
  if (!Number.isFinite(t)) return '--';
  const s = Math.max(0, t);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  if (d) return `${d}d ${h}h ${String(m).padStart(2, '0')}m`;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
};
const km = (m: number) => `${Math.round(m / 1000).toLocaleString('en-US')} km`;
/** perilune for the powered descent (above the mean radius) */
const PDI_ALT = 15_000;
/** the high gate: where the braking phase hands over to the approach */
const HIGH_GATE = 2_200;
/** how far the braking phase carries the lander, as an angle round the Moon */
const BRAKING_ARC = (15.5 * Math.PI) / 180;
/** the Sun's height over the landing site the planner looks for */
const SUN_EL = (18 * Math.PI) / 180;

export class LunarPilot {
  prog: Lunar | null = null;
  /** a viewer is watching: transposition and docking waits for its animation */
  viewer = false;

  reset(): void {
    this.prog = null;
  }

  // ------------------------------------------------------------------ choices
  /** goal buttons for the Moon (null: not the Moon's business) */
  actions(sim: FlightSim): Action[] | null {
    if (this.prog) return [{ id: 'stop', label: 'STOP AUTOPILOT', sub: 'take the controls yourself', enabled: true, kind: 'stop' }];
    if (sim.outcome) return [];
    if (sim.nearMoon) {
      const st = sim.status();
      if (st === 'orbit' && (sim.layout === 'docked' || sim.isLm) && sim.prop.lm > 1000) {
        return [{ id: 'land', label: 'LAND ON THE MOON', sub: sim.isLm ? 'fly the lunar module down' : 'undock the lunar module and fly it down · one way', enabled: true, kind: 'go' }];
      }
      return [];
    }
    return null;
  }

  /** GO TO THE MOON, offered in Earth orbit while the S-IVB and the lunar module are aboard */
  moonAction(sim: FlightSim): Action | null {
    if (!sim.attached.has('lm') || sim.layout !== 'stack' || sim.status() !== 'orbit' || sim.nearMoon) return null;
    const ok = sim.attached.has('sivb') && sim.prop.sivb > 40_000;
    return { id: 'moon', label: 'GO TO THE MOON', sub: ok ? 'three days out, then into orbit round the Moon' : 'the S-IVB has too little fuel left for the trip', enabled: ok, kind: 'go' };
  }

  run(id: LunarId, sim: FlightSim): void {
    if (id === 'moon') {
      const plan = planTli(sim.r, sim.v, sim.time, ENGINES.sivb.thrustVac / sim.mass);
      if (!plan) {
        sim.log('Trans-lunar injection: no workable shot from this orbit.', 'warn');
        return;
      }
      this.prog = { id: 'moon', phase: 'wait', t: 0, burning: false, plan };
      sim.setSas('pro');
      sim.log(`Going to the Moon. TLI burn in ${days(plan.tIgnite - sim.time)}: ${Math.round(plan.dv)} m/s with the S-IVB, then about ${((plan.encounter.t - plan.tImpulse) / 86400).toFixed(1)} days coasting.`, 'good');
      return;
    }
    // landing
    this.prog = { id: 'land', phase: sim.isLm ? 'plan' : 'undock', t: 0, burning: false };
    sim.setSas('stab');
    sim.log('Landing on the Moon: the lunar module is going down.', 'good');
  }

  stop(sim: FlightSim, why: string): void {
    if (!this.prog) return;
    if (this.prog.burning) sim.cutoff();
    this.prog = null;
    sim.aim = null;
    sim.throttle = 1;
    sim.setSas('stab');
    sim.log(why, 'info');
  }

  /** the screen finished animating transposition, docking and extraction */
  tdeDone(sim: FlightSim, pulled: number): void {
    if (this.prog?.id !== 'moon' || this.prog.phase !== 'tde') return;
    sim.dock(pulled);
    sim.setSas('pro');
    this.set('topup');
  }

  // ------------------------------------------------------------------ flying
  private set(phase: string): void {
    this.prog!.phase = phase;
    this.prog!.t = 0;
  }
  private fire(sim: FlightSim): void {
    this.prog!.burning = true;
    sim.ignite();
  }
  private cut(sim: FlightSim): void {
    this.prog!.burning = false;
    sim.cutoff();
  }
  private aligned(sim: FlightSim, dir: V3, tol = 3): boolean {
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(sim.forward, norm(dir)))));
    return ang < (tol * Math.PI) / 180 && len(sim.w) < 0.012;
  }
  private energyE(sim: FlightSim): number {
    return dot(sim.v, sim.v) / 2 - EARTH.GM / len(sim.r);
  }
  /** angle of the vehicle round the Moon in the landing plan's frame */
  private angle(sim: FlightSim): number {
    const p = this.prog!;
    const r = sim.rel;
    return Math.atan2(dot(r, p.ey!), dot(r, p.ex!));
  }

  update(sim: FlightSim, dt: number): void {
    const p = this.prog;
    if (!p) return;
    if (sim.outcome) {
      this.prog = null;
      return;
    }
    p.t += dt;
    if (p.id === 'moon') this.updateMoon(sim, p);
    else this.updateLand(sim, p);
  }

  private updateMoon(sim: FlightSim, p: Lunar): void {
    switch (p.phase) {
      case 'wait':
        // the J-2 lights three seconds after the ullage motors
        if (sim.time >= p.plan!.tIgnite - 3) {
          this.set('tli');
          this.fire(sim);
        }
        return;
      case 'tli':
        if (p.t > 12 && !sim.engines.some((e) => e.on)) this.endTli(sim);
        return;
      case 'tde':
        if (!this.viewer && p.t > 1) this.tdeDone(sim, 15);
        return;
      case 'topup':
        // the S-IVB ran short: the service module's engine finishes the injection
        if (!p.burning) {
          if (this.energyE(sim) >= p.plan!.energy - 2_000) {
            sim.setSas('stab');
            return this.set('mccWait');
          }
          sim.setSas('pro');
          if (this.aligned(sim, sim.v, 2)) this.fire(sim);
        } else if (p.t > 8 && !sim.engines.some((e) => e.on)) {
          p.burning = false;
          this.set('mccWait');
        }
        return;
      case 'mccWait':
        if (p.t > 1800) this.planCorrection(sim, p, 'mcc1');
        return;
      case 'mcc1':
      case 'mcc2':
        if (!p.burning && (this.aligned(sim, sim.aim!) || p.t > 90)) this.fire(sim);
        else if (p.burning && p.t > 8 && !sim.engines.some((e) => e.on)) this.afterCorrection(sim, p);
        return;
      case 'coast': {
        if (p.tMcc2 && sim.time >= p.tMcc2) {
          p.tMcc2 = 0;
          this.planCorrection(sim, p, 'mcc2');
          return;
        }
        if (sim.nearMoon) {
          sim.setSas('retro');
          const o = sim.orb;
          const vp = Math.sqrt(Math.max(0, 2 * (o.energy + MOON.GM / o.rp)));
          const dv = vp - Math.sqrt(MOON.GM / o.rp);
          const lead = 0.6 + (dv / (ENGINES.sm.thrustVac / sim.mass)) / 2;
          if (Number.isFinite(o.tPe) && o.tPe < lead) {
            this.set('loi');
            this.fire(sim);
          }
        }
        return;
      }
      case 'loi':
        if (p.t > 8 && !sim.engines.some((e) => e.on) && !p.burning) {
          const o = sim.orb;
          sim.log(`Lunar orbit insertion done: ${km(o.rp - MOON.R)} × ${km(o.ra - MOON.R)} round the Moon.`, 'good');
          this.prog = null;
          sim.setSas('pro');
        }
        return;
    }
  }

  private endTli(sim: FlightSim): void {
    const p = this.prog!;
    p.burning = false;
    sim.log('TLI cutoff: on the way to the Moon.', 'good');
    this.set('tde');
    sim.setSas('stab');
  }

  private planCorrection(sim: FlightSim, p: Lunar, phase: 'mcc1' | 'mcc2'): void {
    const m = planMcc(sim.r, sim.v, sim.time);
    p.tArrive = m.encounter.t;
    const mag = len(m.dv);
    if (mag < 0.5 || sim.prop.sm <= 0) {
      if (phase === 'mcc1') p.tMcc2 = sim.time + (m.encounter.t - sim.time) * 0.6;
      sim.passPlan = { alt: m.encounter.dmin - MOON.R, t: m.encounter.t };
      sim.log(`Mid-course correction not needed: arriving ${km(m.encounter.dmin - MOON.R)} above the Moon.`, 'info');
      this.set('coast');
      return;
    }
    sim.aim = norm(m.dv);
    sim.setSas('aim');
    p.dvLeft = mag;
    if (phase === 'mcc1') p.tMcc2 = sim.time + (m.encounter.t - sim.time) * 0.6;
    sim.log(`Mid-course correction: ${mag.toFixed(1)} m/s with the service module engine.`, 'info');
    this.set(phase);
  }

  private afterCorrection(sim: FlightSim, p: Lunar): void {
    p.burning = false;
    const e = encounter(sim.r, sim.v, sim.time);
    p.tArrive = e.t;
    sim.passPlan = { alt: e.dmin - MOON.R, t: e.t };
    sim.log(`Correction done: arriving ${km(e.dmin - MOON.R)} above the Moon in ${days(e.t - sim.time)}.`, 'good');
    sim.setSas('stab');
    this.set('coast');
  }

  // ---- landing
  private updateLand(sim: FlightSim, p: Lunar): void {
    switch (p.phase) {
      case 'undock':
        if (p.t > 2) {
          sim.undock();
          this.set('sepWait');
        }
        return;
      case 'sepWait':
        if (p.t > 20) this.set('plan');
        return;
      case 'plan':
        this.planLanding(sim, p);
        sim.setSas('retro');
        this.set('toDoi');
        return;
      case 'toDoi': {
        const a = this.angle(sim);
        let d = p.aDoi! - a;
        while (d < -Math.PI) d += 2 * Math.PI;
        while (d > Math.PI) d -= 2 * Math.PI;
        if (Math.abs(d) < 0.004 || (d < 0 && d > -0.05)) {
          sim.throttle = 0.4;
          this.set('doi');
          this.fire(sim);
        }
        return;
      }
      case 'doi':
        if (!p.burning && p.t > 4) {
          sim.throttle = 1;
          this.set('coastPdi');
        }
        return;
      case 'coastPdi': {
        const o = sim.orb;
        if (Number.isFinite(o.tPe) && (o.tPe < 6 || o.tPe > o.period - 30)) {
          sim.throttle = 1;
          sim.aim = scale(norm(sim.vSurf), -1);
          sim.setSas('aim');
          this.set('brake');
          this.fire(sim);
        }
        return;
      }
    }
  }

  private planLanding(sim: FlightSim, p: Lunar): void {
    const r = sim.rel, v = sim.vRel;
    const h = norm(cross(r, v));
    const ex = norm(r);
    const ey = norm(cross(h, ex));
    p.ex = ex;
    p.ey = ey;
    const sun = sunDirection();
    // the Sun's height over each point of the orbit's ground track, ahead of us
    const el = (a: number) => Math.asin(Math.max(-1, Math.min(1, dot(add(scale(ex, Math.cos(a)), scale(ey, Math.sin(a))), sun))));
    let aLand = NaN, bestEl = -Infinity, bestA = 0;
    const start = Math.PI + BRAKING_ARC + 0.3;
    for (let i = 0; i < 720; i++) {
      const a = start + (i / 720) * 2 * Math.PI;
      const e0 = el(a), e1 = el(a + 0.01);
      if (e0 > bestEl) {
        bestEl = e0;
        bestA = a;
      }
      // the Sun low and behind: its height falling as we fly on
      if (e0 >= SUN_EL && e1 < SUN_EL) {
        aLand = a;
        break;
      }
    }
    const sunEl = Number.isFinite(aLand) ? SUN_EL : bestEl;
    if (!Number.isFinite(aLand)) aLand = bestA;
    p.aLand = aLand;
    p.aDoi = aLand - BRAKING_ARC - Math.PI;
    sim.log(`Landing site chosen: the Sun ${((sunEl * 180) / Math.PI).toFixed(0)}° up behind us, long shadows. Descent orbit burn in ${days((((p.aDoi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * sim.orb.period)}.`, 'info');
  }

  /** after every physics substep: cutoffs and the powered descent */
  onStep(sim: FlightSim, h: number): void {
    const p = this.prog;
    if (!p) return;
    if (p.id === 'moon') {
      if (p.phase === 'tli' && p.burning) {
        if (this.energyE(sim) >= p.plan!.energy || sim.prop.sivb <= 0) {
          this.cut(sim);
          this.endTli(sim);
        }
      } else if (p.phase === 'topup' && p.burning) {
        if (this.energyE(sim) >= p.plan!.energy) {
          this.cut(sim);
          sim.setSas('stab');
          sim.log('Service module burn done: the injection is complete.', 'good');
          this.set('mccWait');
        }
      } else if ((p.phase === 'mcc1' || p.phase === 'mcc2') && p.burning) {
        p.dvLeft! -= (sim.thrust / sim.mass) * h;
        if (p.dvLeft! <= 0) {
          this.cut(sim);
          this.afterCorrection(sim, p);
        }
      } else if (p.phase === 'loi' && p.burning) {
        const o = sim.orb;
        if (o.energy <= -MOON.GM / (2 * len(sim.rel)) || sim.prop.sm <= 0) this.cut(sim);
      }
      return;
    }
    // landing
    if (p.phase === 'doi' && p.burning) {
      if (sim.orb.rp <= MOON.R + PDI_ALT) this.cut(sim);
      return;
    }
    if (p.phase === 'brake' || p.phase === 'approach' || p.phase === 'final') this.descent(sim, p);
  }

  /** the powered descent: thrust direction and throttle every step */
  private descent(sim: FlightSim, p: Lunar): void {
    const up = sim.up;
    const vs = sim.vSurf;
    const vz = dot(vs, up);
    const vhVec = sub(vs, scale(up, vz));
    const vh = len(vhVec);
    const vhHat = vh > 1e-3 ? scale(vhVec, 1 / vh) : ([0, 0, 0] as V3);
    const r = len(sim.rel);
    const g = MOON.GM / (r * r);
    const gEff = g - (vh * vh) / r;
    const hgt = sim.lowAlt;
    const aMax = ENGINES.lm.thrustVac / sim.mass;
    let a: V3;
    if (p.phase === 'brake') {
      // brake along the path at full thrust, bleeding height so the high gate comes as the speed runs out
      const aH = Math.sqrt(Math.max(0.01, (aMax * 0.9) ** 2 - gEff * gEff));
      const ts = vh / aH;
      let vzDes = -(hgt - HIGH_GATE) / Math.max(ts, 25);
      vzDes = Math.max(-90, Math.min(25, vzDes));
      // never come down faster than the engine could stop
      vzDes = Math.max(vzDes, -Math.sqrt(2 * Math.max(0.2, aMax * 0.5 - g) * Math.max(0, hgt - HIGH_GATE * 0.5)));
      const az = Math.max(-0.2 * aMax, Math.min(0.95 * aMax, gEff + (vzDes - vz) / 5));
      const ah = Math.sqrt(Math.max(0, aMax * aMax - az * az));
      a = add(scale(up, az), scale(vhHat, -ah));
      sim.throttle = 1;
      if (vh < 55 || hgt < HIGH_GATE) {
        this.set('approach');
        sim.log('High gate: pitching up for the approach. The landing site is in view.', 'info');
      }
    } else {
      const final = p.phase === 'final';
      const vzDes = final ? -Math.max(0.7, Math.min(2.2, 0.06 * hgt + 0.6)) : -Math.max(1.5, Math.min(30, hgt * 0.055));
      const az = gEff + (vzDes - vz) / (final ? 1.5 : 2.5);
      // null the sideways drift, leaning no more than the approach allows
      let ah = scale(vhVec, -1 / (final ? 2.0 : 3.5));
      const lim = Math.max(0.05, az) * Math.tan(((final ? 12 : 35) * Math.PI) / 180);
      if (len(ah) > lim) ah = scale(norm(ah), lim);
      a = add(scale(up, Math.max(0.05, az)), ah);
      sim.throttle = Math.max(0.1, Math.min(1, len(a) / aMax));
      if (!final && hgt < 40) {
        this.set('final');
        sim.log('Final descent: forty metres, kicking up dust.', 'info');
      }
      if (final && hgt < 1.6 && p.burning) {
        // the probes under the footpads touch: engine stop
        this.cut(sim);
        sim.log('Contact light.', 'good');
      }
    }
    sim.aim = norm(a);
  }

  // ------------------------------------------------------------------ telling the player
  guide(sim: FlightSim): string | null {
    const p = this.prog;
    if (!p) {
      if (sim.nearMoon && !sim.outcome && sim.status() === 'orbit') return sim.isLm || sim.layout === 'docked' ? 'In orbit round the Moon. Press LAND ON THE MOON when you are ready.' : 'In orbit round the Moon.';
      if (sim.status() === 'transit') return 'Coasting between Earth and the Moon. Press F to fast forward.';
      return null;
    }
    const o = sim.orb;
    switch (`${p.id}:${p.phase}`) {
      case 'moon:wait':
        return `Going to the Moon: TLI burn in ${days(p.plan!.tIgnite - sim.time)}. Press F to fast forward.`;
      case 'moon:tli':
        return `Trans-lunar injection: the S-IVB pushes you out of Earth orbit. ${Math.round(len(sim.v))} m/s.`;
      case 'moon:tde':
        return 'Transposition and docking: the command module turns round and pulls the lunar module out.';
      case 'moon:topup':
        return 'The S-IVB ran short: the service module engine finishes the injection.';
      case 'moon:mccWait':
        return `Coasting away from Earth: checking the aim for the Moon in ${days(1800 - p.t)}.`;
      case 'moon:mcc1':
      case 'moon:mcc2':
        return 'Mid-course correction: a short burn to trim the arrival.';
      case 'moon:coast':
        if (sim.nearMoon) return `Falling toward the Moon: lunar orbit insertion behind it in ${days(o.tPe)}. Press F to fast forward.`;
        return `Coasting to the Moon: ${km(len(sim.r) - EARTH.R)} from Earth, arriving in ${days((p.tArrive ?? sim.time) - sim.time)}. Press F to fast forward.`;
      case 'moon:loi':
        return 'Lunar orbit insertion: braking hard behind the Moon to be captured.';
      case 'land:undock':
      case 'land:sepWait':
        return 'Undocking: the lunar module separates, legs out. The command module stays up.';
      case 'land:plan':
      case 'land:toDoi':
        return `Lining up: the descent orbit burn comes half an orbit before the landing site. Press F to fast forward.`;
      case 'land:doi':
        return 'Descent orbit insertion: a short burn to drop the low point to 15 km.';
      case 'land:coastPdi':
        return `Coasting down to 15 km: powered descent begins in ${days(o.tPe)}.`;
      case 'land:brake':
        return `Powered descent: braking. ${(sim.lowAlt / 1000).toFixed(1)} km up, ${Math.round(len(sim.vSurf))} m/s.`;
      case 'land:approach':
        return `Approach: pitched up, the ground ahead. ${Math.round(sim.lowAlt)} m, ${sim.vVert.toFixed(1)} m/s.`;
      case 'land:final':
        return `Final descent: ${sim.lowAlt.toFixed(1)} m, ${sim.vVert.toFixed(1)} m/s. Dust everywhere.`;
    }
    return null;
  }

  /** the time warp fast-forward may use (null: not the Moon's business) */
  wantWarp(sim: FlightSim): number | null {
    const p = this.prog;
    if (!p) return sim.status() === 'transit' ? 10_000 : sim.nearMoon && !sim.outcome ? 100 : null;
    if (p.burning) return p.phase === 'brake' ? 10 : p.phase === 'approach' ? 4 : p.phase === 'final' ? 1 : p.phase === 'doi' ? 4 : 20;
    switch (p.phase) {
      case 'wait':
        return Math.max(1, (p.plan!.tIgnite - 3 - sim.time - 4) / 2);
      case 'tde':
      case 'undock':
      case 'sepWait':
        return 1;
      case 'mccWait':
        return Math.max(1, (1800 - p.t) / 2);
      case 'mcc1':
      case 'mcc2':
      case 'topup':
        return 10;
      case 'coast': {
        if (sim.nearMoon) return Math.max(1, (sim.orb.tPe - 60) / 2);
        const next = Math.min(p.tMcc2 || Infinity, (p.tArrive ?? Infinity) - 6 * 3600);
        return Math.max(4, (next - sim.time) / 2);
      }
      case 'toDoi':
        return Math.max(1, ((((p.aDoi! - this.angle(sim)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI / sim.orb.period) / 2 - 2);
      case 'coastPdi':
        return Math.max(1, (sim.orb.tPe - 20) / 2);
      case 'brake':
        return 10;
      case 'approach':
        return 4;
      case 'final':
        return 1;
    }
    return 4;
  }
}
