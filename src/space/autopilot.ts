// Easy flying: plain-English goals that the flight computer carries out for
// you. LAUNCH hands the climb to the Instrument Unit; in orbit you can GO HOME
// (turn round, brake, separate the capsule and ride it down), GO HIGHER (two
// burns to a bigger circular orbit) or LEAVE EARTH (burn outward until the
// orbit reaches past Earth's pull). Each goal turns the vehicle, times its
// burns to the right point in the orbit and cuts the engine at the exact
// moment, and the screen says in one line what is happening and what to do.

import { FlightSim, ENGINES } from './flightSim';
import { EARTH, V3, dot, len, norm, scale } from './universe';
import { LunarPilot } from './lunarPilot';

export type ActionId = 'launch' | 'toOrbit' | 'home' | 'higher' | 'leave' | 'stop' | 'moon' | 'land';
export interface Action {
  id: ActionId;
  label: string;
  sub: string;
  enabled: boolean;
  kind?: 'go' | 'stop';
}

type ProgramId = 'home' | 'higher' | 'leave';
interface Program {
  id: ProgramId;
  phase: string;
  /** seconds (sim time) in this phase */
  t: number;
  /** target radius for GO HIGHER (m) */
  target: number;
  burning: boolean;
}

const R = EARTH.R;
const GM = EARTH.GM;
/** the periapsis a re-entry aims for: steep enough to come straight down, gentle enough for the crew */
const ENTRY_PE = R + 45_000;
/** GO HIGHER climbs through these circular orbits (km) */
const LEVELS = [400, 1000, 2000, 5000, 10_000, 20_000, 35_786];
const LEVEL_NAME: Record<number, string> = { 400: ' · space station height', 35_786: ' · geostationary' };
/** speed on an orbit of semi-major axis a at radius r */
const vis = (r: number, a: number) => Math.sqrt(Math.max(0, GM * (2 / r - 1 / a)));
const fmtKm = (m: number) => `${Math.round(m / 1000).toLocaleString('en-US')} km`;
const mmss = (t: number) => {
  if (!Number.isFinite(t)) return '--:--';
  const s = Math.max(0, t), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};

export class Autopilot {
  prog: Program | null = null;
  /** the trip to the Moon and the landing */
  readonly lunar = new LunarPilot();

  reset(): void {
    this.prog = null;
    this.lunar.reset();
  }

  /** some program is flying the vehicle */
  get busy(): boolean {
    return !!this.prog || !!this.lunar.prog;
  }

  // ------------------------------------------------------------------ what the vehicle can still do
  /** delta-v left in the S-IVB, the only engine that can restart */
  private dvAvail(sim: FlightSim): number {
    if (sim.stage !== 'sivb' || !sim.attached.has('sivb') || sim.prop.sivb <= 0) return 0;
    return sim.deltaV().stage;
  }
  private accel(sim: FlightSim): number {
    return ENGINES.sivb.thrustVac / Math.max(1, sim.mass);
  }
  /** where a braking burn happens: at the high point of a tall orbit, otherwise right away */
  private brakeAtApoapsis(sim: FlightSim): boolean {
    const o = sim.orbit;
    return o.e < 1 && o.ra - R > 2_000_000;
  }
  /** delta-v to bring the low point down into the atmosphere */
  private homeNeed(sim: FlightSim): number {
    const o = sim.orbit;
    if (o.rp < ENTRY_PE + 15_000) return 0;
    const rb = this.brakeAtApoapsis(sim) ? o.ra : len(sim.r);
    return Math.max(0, vis(rb, o.a) - vis(rb, (rb + ENTRY_PE) / 2));
  }
  /** the next circular orbit up, as a radius, or 0 */
  private higherTarget(sim: FlightSim): number {
    const o = sim.orbit;
    if (o.e >= 1) return 0;
    const top = o.ra - R;
    const L = LEVELS.find((k) => k * 1000 > top + 50_000);
    return L ? R + L * 1000 : 0;
  }
  /** delta-v for a two-burn climb to radius rT, plus enough left over to come home from there */
  private higherNeed(sim: FlightSim, rT: number): number {
    const o = sim.orbit;
    const r0 = len(sim.r);
    const at = (r0 + rT) / 2;
    const dv1 = Math.max(0, vis(r0, at) - vis(r0, o.a));
    const dv2 = Math.max(0, Math.sqrt(GM / rT) - vis(rT, at));
    const back = Math.sqrt(GM / rT) - vis(rT, (rT + ENTRY_PE) / 2);
    return (dv1 + dv2) * 1.05 + back * 1.15 + 20;
  }
  /** how far a full prograde burn would take you: Infinity means free of Earth */
  private leaveReach(sim: FlightSim): number {
    const r = len(sim.r);
    const v = len(sim.v) + this.dvAvail(sim) - 10;
    const inv = 2 / r - (v * v) / GM;
    if (inv <= 0) return Infinity;
    const ra = 2 / inv - r;
    return ra > EARTH.soi ? Infinity : ra;
  }

  /** the Instrument Unit is still flying the climb (a stage may be dropping away right now) */
  private climbing(sim: FlightSim): boolean {
    return sim.guidance && !!sim.stage && sim.attached.has(sim.stage) && sim.prop[sim.stage] > 0 && sim.orbit.rp < R + EARTH.atmosphereTop;
  }

  // ------------------------------------------------------------------ the choices on screen
  actions(sim: FlightSim): Action[] {
    const la = this.prog ? null : this.lunar.actions(sim);
    if (la) return la;
    if (sim.outcome) return [];
    if (this.prog) return [{ id: 'stop', label: 'STOP AUTOPILOT', sub: 'take the controls yourself', enabled: true, kind: 'stop' }];
    if (sim.held) {
      return sim.counting
        ? [{ id: 'launch', label: 'COUNTING DOWN', sub: 'engines light at T-9 s', enabled: false, kind: 'go' }]
        : [{ id: 'launch', label: 'LAUNCH', sub: 'the autopilot flies you to orbit', enabled: true, kind: 'go' }];
    }
    if (sim.lesBurn > 0 || sim.isCm || (sim.aborted && !sim.stage)) return [];
    const st = sim.status();
    const o = sim.orbit;
    const hasEngine = !!sim.stage && sim.attached.has(sim.stage) && sim.prop[sim.stage] > 0;
    if (st === 'ascent' || st === 'suborbital' || st === 'falling') {
      if (this.climbing(sim)) return [];
      const list: Action[] = [];
      if (!sim.guidance && hasEngine && o.rp < R + EARTH.atmosphereTop) list.push({ id: 'toOrbit', label: 'AUTOPILOT TO ORBIT', sub: 'let the computer fly the climb', enabled: true, kind: 'go' });
      if (st !== 'ascent' && sim.canCmSep) list.push({ id: 'home', label: 'GO HOME', sub: 'separate the capsule and splash down', enabled: true });
      return list;
    }
    // in orbit, or free of Earth
    const avail = this.dvAvail(sim);
    const list: Action[] = [];
    const moon = this.lunar.moonAction(sim);
    if (moon) list.push(moon);
    if (o.e < 1) {
      const need = this.homeNeed(sim);
      const ok = need === 0 || avail >= need * 1.1 + 10;
      list.push({ id: 'home', label: 'GO HOME', sub: ok ? 'brake, re-enter and splash down' : avail <= 0 ? 'no engine left to slow down with' : 'not enough fuel left to slow down', enabled: ok, kind: 'go' });
    }
    if (st === 'orbit') {
      const rT = this.higherTarget(sim);
      if (rT) {
        const ok = avail >= this.higherNeed(sim, rT);
        const L = Math.round((rT - R) / 1000);
        list.push({ id: 'higher', label: 'GO HIGHER', sub: ok ? `to a ${L.toLocaleString('en-US')} km orbit${LEVEL_NAME[L] ?? ''}` : `${L.toLocaleString('en-US')} km: not enough fuel to get there and back`, enabled: ok });
      }
      const reach = this.leaveReach(sim);
      list.push({ id: 'leave', label: 'LEAVE EARTH', sub: avail <= 50 ? 'no fuel left' : reach === Infinity ? 'burn outward until you break free · one way' : `only enough fuel to swing out to ${fmtKm(reach - R)} · one way`, enabled: avail > 50 });
    }
    return list;
  }

  /** do what the player picked */
  run(id: ActionId, sim: FlightSim): void {
    if (id === 'moon' || id === 'land') return this.lunar.run(id, sim);
    switch (id) {
      case 'launch':
        if (!sim.held || sim.counting) return;
        sim.autoStage = true;
        if (!sim.guidance) sim.setGuidance(true);
        sim.stageNext();
        return;
      case 'toOrbit':
        sim.autoStage = true;
        sim.setGuidance(true);
        sim.log('Autopilot: the Instrument Unit is flying the climb to orbit.', 'good');
        return;
      case 'stop':
        this.stop(sim, 'Autopilot off: you have the controls.');
        return;
      case 'home': {
        const st = sim.status();
        if (st !== 'orbit' && st !== 'safe') {
          // already coming down: just leave the rockets behind
          sim.cmSep();
          return;
        }
        this.prog = { id: 'home', phase: this.brakeAtApoapsis(sim) ? 'waitAp' : 'orient', t: 0, target: ENTRY_PE, burning: false };
        sim.setSas('retro');
        sim.log('Going home: turning to face backwards for the braking burn.', 'good');
        return;
      }
      case 'higher': {
        const rT = this.higherTarget(sim);
        if (!rT) return;
        this.prog = { id: 'higher', phase: 'orient1', t: 0, target: rT, burning: false };
        sim.setSas('pro');
        sim.log(`Going higher: two burns to a ${fmtKm(rT - R)} orbit.`, 'good');
        return;
      }
      case 'leave':
        this.prog = { id: 'leave', phase: 'orient', t: 0, target: 0, burning: false };
        sim.setSas('pro');
        sim.log('Leaving Earth: lining up with the direction of travel.', 'good');
        return;
    }
  }

  stop(sim: FlightSim, why: string): void {
    if (this.lunar.prog) return this.lunar.stop(sim, why);
    if (!this.prog) return;
    if (this.prog.burning) sim.cutoff();
    this.prog = null;
    sim.setSas('stab');
    sim.log(why, 'info');
  }

  // ------------------------------------------------------------------ flying the program
  private aligned(sim: FlightSim, sign: 1 | -1): boolean {
    const vref = sim.alt < 70_000 ? sim.vSurf : sim.v;
    if (len(vref) < 1) return true;
    const dir: V3 = scale(norm(vref), sign);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(sim.forward, dir))));
    return ang < (3 * Math.PI) / 180 && len(sim.w) < 0.01;
  }
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
  /** seconds before the high point to start a burn of dv: ullage, spool-up, then half the burn */
  private lead(sim: FlightSim, dv: number): number {
    return 3 + ENGINES.sivb.spoolUp + dv / this.accel(sim) / 2;
  }

  /** GO HIGHER: when to start the second burn, which rounds out the orbit at the top */
  private coastLead(sim: FlightSim): number {
    const o = sim.orbit;
    const p = this.prog!;
    const at = (o.rp + p.target) / 2;
    return this.lead(sim, Math.max(0, Math.sqrt(GM / p.target) - vis(p.target, at)));
  }

  /** once a frame, after the physics */
  update(sim: FlightSim, dt: number): void {
    if (this.lunar.prog) return this.lunar.update(sim, dt);
    const p = this.prog;
    if (!p) return;
    if (sim.outcome) {
      this.prog = null;
      return;
    }
    p.t += dt;
    const o = sim.orbit;
    // a burn that never lit (no fuel, no engine) ends the program
    if (p.burning && p.t > 9 && !sim.engines.some((e) => e.on)) {
      p.burning = false;
      if (p.id !== 'home' || p.phase !== 'burn') return this.stop(sim, 'Autopilot: the engine would not start. Out of fuel?');
    }
    switch (p.id) {
      case 'home':
        if (p.phase === 'waitAp') {
          if (o.tAp < this.lead(sim, this.homeNeed(sim)) || o.tAp > o.period - 5) {
            this.set('burn');
            this.fire(sim);
          }
        } else if (p.phase === 'orient') {
          if (this.aligned(sim, -1) || p.t > 150) {
            this.set('burn');
            this.fire(sim);
          }
        } else if (p.phase === 'burn') {
          if (sim.prop.sivb <= 0 || (p.t > 9 && !sim.engines.some((e) => e.on))) this.set('sep');
        } else if (p.phase === 'sep') {
          if (p.t > 4) {
            if (sim.canCmSep) sim.cmSep();
            this.set('ride');
          }
        }
        return;
      case 'higher':
        if (p.phase === 'orient1') {
          if (this.aligned(sim, 1) || p.t > 150) {
            this.set('burn1');
            this.fire(sim);
          }
        } else if (p.phase === 'coast') {
          if (o.tAp < this.coastLead(sim) || o.tAp > o.period - 5) {
            this.set('burn2');
            this.fire(sim);
          }
        }
        return;
      case 'leave':
        if (p.phase === 'orient' && (this.aligned(sim, 1) || p.t > 150)) {
          this.set('burn');
          this.fire(sim);
        }
        return;
    }
  }

  /** after every physics substep: cut the engine the moment a burn has done its job */
  onStep(sim: FlightSim, h = 0): void {
    if (this.lunar.prog) return this.lunar.onStep(sim, h);
    const p = this.prog;
    if (!p || !p.burning) return;
    const o = sim.orbit;
    const out = sim.prop.sivb <= 0;
    if (p.id === 'home' && p.phase === 'burn') {
      if (o.rp <= ENTRY_PE || out) {
        this.cut(sim);
        sim.log(out ? 'Out of fuel: separating the capsule for entry anyway.' : 'Braking burn done: the orbit now dips into the atmosphere.', out ? 'warn' : 'good');
        this.set('sep');
      }
    } else if (p.id === 'higher' && p.phase === 'burn1') {
      if (o.ra >= p.target || out) {
        this.cut(sim);
        sim.log(`Burn 1 done: coasting up to ${fmtKm(o.ra - R)}.`, 'good');
        this.set('coast');
      }
    } else if (p.id === 'higher' && p.phase === 'burn2') {
      if (o.rp >= p.target - 2000 || o.ra > p.target + 40_000 || out) {
        this.cut(sim);
        sim.log(`New orbit: ${fmtKm(o.rp - R)} × ${fmtKm(o.ra - R)}.`, 'good');
        this.prog = null;
        sim.setSas('pro');
      }
    } else if (p.id === 'leave' && p.phase === 'burn') {
      if (o.energy >= 0 || o.ra > EARTH.soi * 1.05 || out) {
        this.cut(sim);
        const free = o.energy >= 0 || o.ra > EARTH.soi;
        sim.log(free ? 'Free of Earth: you are drifting out of its pull for good.' : `Out of fuel: you'll swing out to ${fmtKm(o.ra - R)} and fall back.`, free ? 'good' : 'warn');
        this.prog = null;
        sim.setSas('pro');
      }
    }
  }

  // ------------------------------------------------------------------ telling the player
  /** one line: what is happening and what to do */
  guide(sim: FlightSim): string {
    if (sim.outcome) return '';
    const lg = this.prog ? null : this.lunar.guide(sim);
    if (lg) return lg;
    const o = sim.orbit;
    const p = this.prog;
    if (sim.held) {
      if (!sim.counting) return 'Press LAUNCH (SPACE). The autopilot flies you all the way to orbit.';
      return sim.met < -8.9 ? `Countdown: the engines light in ${Math.ceil(-8.9 - sim.met)} s.` : 'Ignition! Thrust is building on the hold-down arms.';
    }
    if (sim.lesBurn > 0) return 'ABORT! The escape tower is pulling the capsule clear.';
    if (sim.isCm) {
      if (sim.chute === 'main') return 'Under three main parachutes. Splashdown in a moment.';
      if (sim.chute === 'drogue') return 'Drogue chutes out, slowing down. The mains open next.';
      if (sim.heat > 3e6) return 'Re-entry! The heat shield takes the heat. The parachutes open on their own.';
      const te = sim.timeToEntry();
      if (Number.isFinite(te)) return `Capsule coasting home: entering the atmosphere in ${mmss(te)}. Press F to fast forward.`;
      return 'Capsule falling home, heat shield first. The parachutes open on their own.';
    }
    if (p) {
      const tAp = mmss(o.tAp);
      switch (`${p.id}:${p.phase}`) {
        case 'home:orient':
          return 'Going home: turning round to face backwards…';
        case 'home:waitAp':
          return `Going home: braking at the high point of the orbit, in ${tAp}. Press F to fast forward.`;
        case 'home:burn':
          return `Going home: braking burn. Low point ${fmtKm(o.rp - R)} → 45 km.`;
        case 'home:sep':
          return 'Going home: separating the capsule from the rocket.';
        case 'higher:orient1':
          return 'Going higher: lining up with the direction of travel…';
        case 'higher:burn1':
          return `Burn 1 of 2: raising the far side of the orbit to ${fmtKm(p.target - R)}.`;
        case 'higher:coast':
          return `Coasting up to ${fmtKm(p.target - R)}: burn 2 in ${tAp}. Press F to fast forward.`;
        case 'higher:burn2':
          return 'Burn 2 of 2: rounding out the new orbit.';
        case 'leave:orient':
          return 'Leaving Earth: lining up with the direction of travel…';
        case 'leave:burn':
          return `Leaving Earth: full-power burn. Far point ${o.e < 1 ? fmtKm(o.ra - R) : 'beyond reach'}.`;
      }
    }
    const st = sim.status();
    if (this.climbing(sim) && st !== 'ascent') return 'Staging: the spent stage drops away and the next one lights.';
    if (st === 'ascent') return sim.guidance ? 'Autopilot climbing to orbit. Sit back: the stages drop off by themselves. Press F to fast forward.' : 'You are steering (W A S D). Press AUTOPILOT TO ORBIT to hand it back.';
    if (st === 'suborbital' || st === 'falling') {
      if (sim.canCmSep) return 'Not in orbit: you are going to fall back. Press GO HOME to separate the capsule.';
      if (sim.canAbort) return 'Falling! Press ABORT (B twice) to save the crew.';
      return 'Falling…';
    }
    if (st === 'orbit') return 'You made it to orbit! Pick a goal, or just look around: drag to turn the camera, W A S D to steer.';
    if (st === 'safe') return 'You are free of Earth’s pull, floating in space. Press F to fast forward and watch Earth shrink away.';
    return '';
  }

  /** the time warp fast-forward may use right now */
  wantWarp(sim: FlightSim): number {
    const lw = this.prog ? null : this.lunar.wantWarp(sim);
    if (lw !== null) return lw;
    const o = sim.orbit;
    const p = this.prog;
    if (sim.held) return 4;
    if (p) {
      if (p.burning || p.phase === 'sep') return 4;
      if (p.phase.startsWith('orient')) return 10;
      if (p.phase === 'waitAp') return Math.max(1, (o.tAp - this.lead(sim, this.homeNeed(sim))) / 4);
      if (p.phase === 'coast') return Math.max(1, (o.tAp - this.coastLead(sim)) / 4);
    }
    if (sim.isCm) {
      // coast quickly to the top of the air, watch the fireball at a gentler pace, then hurry the parachutes down
      const te = sim.timeToEntry();
      if (Number.isFinite(te)) return Math.max(4, te / 4);
      return sim.heat > 3e6 ? 10 : 50;
    }
    const st = sim.status();
    if (st === 'safe') return 10_000;
    if (st === 'orbit') return 100;
    return 4;
  }
}
