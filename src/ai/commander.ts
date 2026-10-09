// APEX: the battle commander behind the hardest AI.
//
// Once a second it reads the whole fight: where every jet and every missile is,
// what each enemy pilot is doing now and has been doing (which way they like to
// turn, how far away they shoot from, how many missiles they have left), works
// out what they are up to and where they will be, and gives each of its own jets
// an order: bait, flank, high cover, press, cut off. The pilots carry the orders
// out at their own frame rate (pilot.ts); between two readings nothing is held
// back from them, they just keep the last plan.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Sim } from '../game/sim';
import { hostile, RULES } from '../game/rules';
import { NM, KT, DEG } from '../core/constants';
import type { AIPilot } from './pilot';

/** what an enemy pilot is doing, as the commander reads it */
export type Intent = 'HUNTING' | 'SHOOTING' | 'DEFENDING' | 'RUNNING' | 'DOGFIGHT' | 'LOW' | 'SLOW' | 'CRUISING';
/** what a jet has been told to do */
export type Role = 'SHOOTER' | 'BAIT' | 'FLANKER' | 'HIGH_COVER' | 'PRESS';

export interface Order {
  role: Role;
  target: Aircraft;
  /** where to go first (a flank, the top cover, the cut-off), or null to go straight for the target */
  point: THREE.Vector3 | null;
  /** hold the radar missiles (the bait, while it drags him in) */
  hold: boolean;
  /** what the commander read the target to be doing when it gave the order */
  intent: Intent;
  /** when this jet got this role (s, sim time) */
  since?: number;
}

/** how often the commander reads the fight (s) */
export const READ_INTERVAL = 1;

interface Sample {
  t: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  heading: number;
}

/** one enemy pilot, as the commander has learnt them */
export class HostileModel {
  samples: Sample[] = [];
  intent: Intent = 'CRUISING';
  /** horizontal turn rate now (rad/s, + right) */
  turnRate = 0;
  /** which way they like to turn when they fight: -1 left .. +1 right */
  turnBias = 0;
  /** ranges (m) they have fired missiles from */
  readonly shotRanges: number[] = [];
  private seenMissiles = new Set<number>();
  /** the jet of ours they have locked, if any */
  lockedOn: Aircraft | null = null;

  constructor(readonly ac: Aircraft) {}

  /** where they will be in t seconds, flying on as they are turning now */
  predict(t: number, out: THREE.Vector3): THREE.Vector3 {
    const fm = this.ac.fm;
    const v = Math.hypot(fm.vel.x, fm.vel.z);
    const h0 = Math.atan2(fm.vel.x, -fm.vel.z);
    const w = Math.abs(this.turnRate) > 0.01 ? this.turnRate : 0;
    let x = fm.pos.x, z = fm.pos.z;
    if (w === 0) {
      x += fm.vel.x * t;
      z += fm.vel.z * t;
    } else {
      // an arc: the heading sweeps at w, the speed stays
      const h1 = h0 + w * t;
      x += (v / w) * (Math.cos(h0) - Math.cos(h1));
      z += (v / w) * (Math.sin(h1) - Math.sin(h0)) * -1;
    }
    return out.set(x, Math.max(fm.pos.y + fm.vel.y * t, 150), z);
  }

  /** the range they usually shoot from (m), or null before they have shot */
  usualShotRange(): number | null {
    if (!this.shotRanges.length) return null;
    const s = [...this.shotRanges].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  read(sim: Sim, ours: Aircraft[]): void {
    const ac = this.ac, fm = ac.fm;
    const heading = Math.atan2(fm.vel.x, -fm.vel.z);
    const prev = this.samples[this.samples.length - 1];
    this.samples.push({ t: sim.time, pos: fm.pos.clone(), vel: fm.vel.clone(), heading });
    if (this.samples.length > 30) this.samples.shift();
    if (prev && sim.time > prev.t) {
      let dh = heading - prev.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.turnRate = dh / (sim.time - prev.t);
      // (the habit: which way they turn when they turn hard)
      if (Math.abs(this.turnRate) > 6 * DEG) this.turnBias = this.turnBias * 0.85 + Math.sign(this.turnRate) * 0.15;
    }
    // their shots: the ranges they like to fire from
    let shooting = false;
    for (const m of sim.missiles) {
      if (m.shooter !== ac || this.seenMissiles.has(m.id)) continue;
      this.seenMissiles.add(m.id);
      shooting = true;
      if (m.target) this.shotRanges.push(m.launchRange);
      if (this.shotRanges.length > 12) this.shotRanges.shift();
    }
    const lock = ac.radar.lock;
    this.lockedOn = lock && ours.includes(lock) ? lock : null;
    // the nearest of ours, and how they sit against it
    let near: Aircraft | null = null, nd = Infinity;
    for (const o of ours) {
      const d = o.distanceTo(ac);
      if (d < nd) {
        nd = d;
        near = o;
      }
    }
    const corner = ac.spec.cornerKts * KT;
    const underFire = sim.missiles.some((m) => m.alive && m.target === ac && ours.includes(m.shooter) && m.mode !== 'LOST' && m.mode !== 'DECOY');
    let away = false;
    if (near) {
      const toUs = near.fm.pos.clone().sub(fm.pos).normalize();
      away = fm.fwd.dot(toUs) < -0.5;
    }
    if (shooting) this.intent = 'SHOOTING';
    else if (underFire && (ac.rwr.primaryMissile || away)) this.intent = 'DEFENDING';
    else if (nd < 3 * NM) this.intent = fm.cas < corner * 0.7 ? 'SLOW' : 'DOGFIGHT';
    else if (this.lockedOn) this.intent = 'HUNTING';
    else if (away && fm.mach > 0.85 && nd > 5 * NM) this.intent = 'RUNNING';
    else if (fm.agl < 700 && fm.pos.y < 2500) this.intent = 'LOW';
    else this.intent = 'CRUISING';
  }

  /** missiles of each kind they still carry */
  missilesLeft(): number {
    const ac = this.ac;
    return ac.countOf(ac.radarMissile) + ac.countOf(ac.irMissile);
  }
}

/** a message from the commander to the player's screen (enemy radio): set by the game */
export const apexComms: { sink: ((text: string) => void) | null } = { sink: null };

const SAY: Record<string, string[]> = {
  HUNTING: ["He's locked on {bait}. {bait}, drag him. Everyone else, take his beam.", 'Bait is out. Flankers in, shoot when he commits.'],
  HUNTING1: ["He's locked on me. Turning cold, let him chase.", 'Spiked. Dragging him into my shot.'],
  SHOOTING: ['Missile in the air. Notch it, then go back in.', 'He fired. Defend, then hit him while he is busy.'],
  DEFENDING: ["He's defensive. Press, press!", 'He is spending energy on the missile. Second shot, now.'],
  RUNNING: ["He's running. Cut him off, long shot to turn him.", 'Bugging out? Not today. Full burner after him.'],
  DOGFIGHT: ['In the merge. {cover}, stay high and wait for his nose to commit.', 'Knife fight. He likes to turn {bias}, take the other side.'],
  DOGFIGHT1: ['Merged. He likes to turn {bias}. Taking the other side.', 'Close in. Watching his nose.'],
  SLOW: ["He's slow. Go vertical and finish it.", 'Out of energy. Heater, now.'],
  LOW: ['He went low. One high to look down, one in after him.', 'Down in the hills. Looking down on him.'],
  CRUISING: ['Bracket him from both sides.', 'Spread out, pincer. No wasted heaters.'],
  WINCHESTER: ["He's out of missiles. Close in, guns.", 'He has nothing left. Get close.'],
};

const radio = { last: -1e9 };

/** the commander of one team's APEX jets */
export class Commander {
  readonly models = new Map<number, HostileModel>();
  private last = -1e9;
  private lastSaid = -1e9;
  private lastPlan = '';
  /** for tests: the last plan */
  plan = '';

  constructor(readonly team: string) {}

  model(ac: Aircraft): HostileModel {
    let m = this.models.get(ac.id);
    if (!m || m.ac !== ac) {
      m = new HostileModel(ac);
      this.models.set(ac.id, m);
    }
    return m;
  }

  /** called by every APEX pilot each frame; the reading itself happens once a second */
  tick(sim: Sim, pilots: AIPilot[]): void {
    if (sim.time - this.last < READ_INTERVAL && sim.time >= this.last) return;
    this.last = sim.time;
    const ours = pilots.filter((p) => p.ac.alive).map((p) => p.ac);
    if (!ours.length) return;
    const enemies = sim.aircraft.filter((a) => a.alive && hostile(a, ours[0]));
    if (!enemies.length) return;
    for (const e of enemies) this.model(e).read(sim, ours);
    // the main enemy: the player first (in a free-for-all, whoever is nearest), else the nearest to our centre
    const centre = new THREE.Vector3();
    for (const o of ours) centre.add(o.fm.pos);
    centre.divideScalar(ours.length);
    const player = RULES.ffa ? undefined : enemies.find((e) => e.isPlayer);
    const main = player ?? enemies.reduce((a, b) => (a.fm.pos.distanceTo(centre) < b.fm.pos.distanceTo(centre) ? a : b));
    const hm = this.model(main);
    // every jet knows where the main enemy is (the picture refreshed once a second)
    for (const p of pilots) if (p.ac.alive) p.feedPicture(main, sim.time);
    this.assign(sim, pilots.filter((p) => p.ac.alive), hm, enemies);
  }

  private assign(sim: Sim, pilots: AIPilot[], hm: HostileModel, enemies: Aircraft[]): void {
    const tgt = hm.ac;
    const byRange = [...pilots].sort((a, b) => a.ac.distanceTo(tgt) - b.ac.distanceTo(tgt));
    const winchester = hm.missilesLeft() === 0;
    const intent: Intent = hm.intent;
    const p = new THREE.Vector3();
    const side = (sign: number, dist: number, up = 0) => {
      // a point on the target's beam: to its left (-1) or right (+1)
      const f = tgt.fm.fwd;
      const r = new THREE.Vector3(-f.z, 0, f.x).normalize();
      return tgt.fm.pos.clone().addScaledVector(r, sign * dist).setY(Math.max(tgt.fm.pos.y + up, 1500));
    };
    // their favourite turn: we come from the other side
    const bias = hm.turnBias >= 0 ? 1 : -1;
    const n = byRange.length;
    let key: string = intent;
    if (winchester && intent !== 'DEFENDING') key = 'WINCHESTER';
    for (let i = 0; i < n; i++) {
      const me = byRange[i];
      let o: Order;
      if (key === 'WINCHESTER') o = { role: 'PRESS', target: tgt, point: null, hold: false, intent };
      else if (intent === 'HUNTING' && hm.lockedOn) {
        if (me.ac === hm.lockedOn && n > 1) o = { role: 'BAIT', target: tgt, point: null, hold: true, intent };
        else if (n > 1) o = { role: 'FLANKER', target: tgt, point: side(i % 2 ? -bias : bias, 9000, 1200), hold: false, intent };
        // (alone and locked: shoot first if he is inside our reach, else drag him)
        else o = { role: 'SHOOTER', target: tgt, point: null, hold: false, intent };
      } else if (intent === 'SHOOTING' || intent === 'DEFENDING' || intent === 'SLOW') {
        o = { role: 'PRESS', target: tgt, point: null, hold: false, intent };
      } else if (intent === 'RUNNING') {
        o = i === 0 ? { role: 'PRESS', target: tgt, point: null, hold: false, intent } : { role: 'FLANKER', target: tgt, point: hm.predict(30, p).clone(), hold: false, intent };
      } else if (intent === 'DOGFIGHT') {
        o = i === 0 ? { role: 'SHOOTER', target: tgt, point: null, hold: false, intent } : { role: 'HIGH_COVER', target: tgt, point: side(-bias, 3500, 3000), hold: false, intent };
      } else if (intent === 'LOW') {
        o = i === 0 && n > 1 ? { role: 'HIGH_COVER', target: tgt, point: tgt.fm.pos.clone().setY(tgt.fm.pos.y + 4500), hold: false, intent } : { role: 'PRESS', target: tgt, point: null, hold: false, intent };
      } else {
        // cruising: a pincer from both sides, shots only inside the no-escape range
        o = n > 1 ? { role: 'FLANKER', target: tgt, point: side(i % 2 ? -1 : 1, 14000, 1500), hold: false, intent } : { role: 'SHOOTER', target: tgt, point: null, hold: false, intent };
      }
      o.since = me.order && me.order.role === o.role && me.order.target === o.target ? me.order.since : sim.time;
      me.order = o;
      // (in a turning fight: from the side he does not like to turn to)
      if (intent === 'DOGFIGHT' || intent === 'SLOW') me.bracketSide = -bias;
    }
    void enemies;
    // the plan, said over the radio when it changes (not more than every 6 s)
    const solo = n === 1 && (key === 'HUNTING' || key === 'DOGFIGHT');
    const plan = key + (solo ? '1' : '');
    this.plan = plan;
    // (one voice at a time across every commander: a free-for-all has one per jet)
    const quiet = sim.time - radio.last > 4 || sim.time < radio.last;
    if (plan !== this.lastPlan && sim.time - this.lastSaid > 6 && quiet && tgt.isPlayer) {
      const lines = SAY[plan] ?? SAY[key];
      if (lines) {
        const bait = byRange.find((b) => b.order?.role === 'BAIT')?.ac.callsign ?? 'Lead';
        const cover = byRange.find((b) => b.order?.role === 'HIGH_COVER')?.ac.callsign ?? 'Two';
        const text = lines[Math.floor(Math.random() * lines.length)].replace('{bait}', short(bait)).replace('{cover}', short(cover)).replace('{bias}', bias > 0 ? 'right' : 'left');
        apexComms.sink?.(`APEX · "${text}"`);
        this.lastSaid = sim.time;
        radio.last = sim.time;
      }
    }
    this.lastPlan = plan;
  }
}

const short = (callsign: string) => callsign.replace(/^BANDIT\s*/i, '').trim() || callsign;

/** one commander per team per simulation */
const commanders = new WeakMap<Sim, Map<string, Commander>>();
export function commanderFor(sim: Sim, team: string): Commander {
  let m = commanders.get(sim);
  if (!m) {
    m = new Map();
    commanders.set(sim, m);
  }
  let c = m.get(team);
  if (!c) {
    c = new Commander(team);
    m.set(team, c);
  }
  return c;
}
