// Planning the trip to the Moon. A fast trajectory propagator (Earth and Moon
// gravity, RK4 with a step that shrinks near either body) predicts where a coast
// goes; on top of it, a targeter finds when to fire the trans-lunar injection so
// the path swings round the Moon at the right height, and a corrector works out
// the small mid-course burn that trims the arrival: the right periselene on the
// side that gives a prograde lunar orbit, in the Moon's own orbital plane.

import { EARTH, MOON, MOON_ORBIT, V3, add, addScaled, cross, dot, gravityAt, len, moonState, norm, scale, sub } from './universe';

export interface Encounter {
  /** closest distance to the Moon's centre, m, and when (sim time) */
  dmin: number;
  t: number;
  /** signed miss: + when the pass goes round the Moon the same way it turns (prograde) */
  b: number;
  /** out-of-plane offset of the closest point from the Moon's orbital plane, m */
  z: number;
  /** speed relative to the Moon at closest approach */
  vRel: number;
}

/** coast from (r, v) at time t for up to `span` seconds and report the closest pass by the Moon */
export function encounter(r0: V3, v0: V3, t0: number, span = 7 * 86400): Encounter {
  let r = r0, v = v0, t = t0;
  let best: Encounter = { dmin: Infinity, t: t0, b: Infinity, z: 0, vRel: 0 };
  const N = MOON_ORBIT.N;
  const end = t0 + span;
  let receding = 0;
  while (t < end) {
    const m = moonState(t);
    const dr = sub(r, m.r);
    const dm = len(dr);
    const vr = sub(v, m.v);
    if (dm < best.dmin) {
      const side = Math.sign(dot(cross(dr, vr), N)) || 1;
      best = { dmin: dm, t, b: side * dm, z: dot(dr, N), vRel: len(vr) };
      receding = 0;
    } else if (dm < MOON.soi * 1.5 && ++receding > 3) break;
    const rE = len(r);
    if (rE < EARTH.R) break;
    // a step that is a small fraction of the time to cross the local scale
    const h = Math.max(1, Math.min(900, 0.006 * Math.min(rE / Math.max(1, len(v)), dm / Math.max(1, len(vr)))));
    const a = (rr: V3, tt: number) => gravityAt(rr, tt);
    const k1v = a(r, t), k1r = v;
    const k2v = a(addScaled(r, k1r, h / 2), t + h / 2), k2r = addScaled(v, k1v, h / 2);
    const k3v = a(addScaled(r, k2r, h / 2), t + h / 2), k3r = addScaled(v, k2v, h / 2);
    const k4v = a(addScaled(r, k3r, h), t + h), k4r = addScaled(v, k3v, h);
    r = add(r, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), h / 6));
    v = add(v, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6));
    t += h;
  }
  return best;
}

/** advance a coasting state by dt with the same propagator (no encounter bookkeeping) */
export function coast(r0: V3, v0: V3, t0: number, dt: number): { r: V3; v: V3 } {
  let r = r0, v = v0, t = t0;
  const end = t0 + dt;
  while (t < end - 1e-6) {
    const m = moonState(t);
    const h = Math.min(end - t, Math.max(0.5, Math.min(120, 0.006 * Math.min(len(r) / Math.max(1, len(v)), len(sub(r, m.r)) / Math.max(1, len(sub(v, m.v)))))));
    const a = (rr: V3, tt: number) => gravityAt(rr, tt);
    const k1v = a(r, t), k1r = v;
    const k2v = a(addScaled(r, k1r, h / 2), t + h / 2), k2r = addScaled(v, k1v, h / 2);
    const k3v = a(addScaled(r, k2r, h / 2), t + h / 2), k3r = addScaled(v, k2v, h / 2);
    const k4v = a(addScaled(r, k3r, h), t + h), k4r = addScaled(v, k3v, h);
    r = add(r, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), h / 6));
    v = add(v, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6));
    t += h;
  }
  return { r, v };
}

/** the periselene the trip aims for: 110 km up, passing the prograde way round */
export const TARGET_B = MOON.R + 110_000;

export interface TliPlan {
  /** sim time to start the burn (its middle falls on the planned impulse) */
  tIgnite: number;
  /** the planned impulse: when, and how much along the velocity */
  tImpulse: number;
  dv: number;
  /** the orbital energy (about Earth) to cut the engine at */
  energy: number;
  encounter: Encounter;
}

/**
 * Plan the trans-lunar injection from a coasting parking orbit: a prograde
 * impulse of dv, at the moment within the next orbit that makes the coast pass
 * the Moon at TARGET_B. `accel` is the engine's acceleration, to centre the
 * real (finite) burn on that moment.
 */
export function planTli(r: V3, v: V3, t: number, accel: number, lead = 300): TliPlan | null {
  const rr = len(r);
  // an ellipse reaching about 1.25 times the Moon's distance: about three days out
  const ra = MOON_ORBIT.D * 1.25;
  const vNeed = Math.sqrt(EARTH.GM * (2 / rr - 2 / (rr + ra)));
  const dv = Math.max(0, vNeed - len(v));
  const period = 2 * Math.PI * Math.sqrt(rr ** 3 / EARTH.GM);
  const burnTime = dv / Math.max(0.1, accel);
  const shot = (tb: number): Encounter => {
    const s = coast(r, v, t, tb - t);
    const vv = addScaled(s.v, norm(s.v), dv);
    return encounter(s.r, vv, tb, 6 * 86400);
  };
  const t0 = t + lead + burnTime / 2;
  const n = 48;
  let prev: { tb: number; e: Encounter } | null = null;
  const err = (e: Encounter) => e.b - TARGET_B;
  let bracket: [number, number, Encounter, Encounter] | null = null;
  for (let i = 0; i <= n; i++) {
    const tb = t0 + (period * i) / n;
    const e = shot(tb);
    if (prev && Math.abs(e.b) < MOON.soi && Math.abs(prev.e.b) < MOON.soi && Math.sign(err(e)) !== Math.sign(err(prev.e))) {
      bracket = [prev.tb, tb, prev.e, e];
      break;
    }
    prev = { tb, e };
  }
  if (!bracket) return null;
  let [a, b, ea, eb] = bracket;
  let best = Math.abs(err(ea)) < Math.abs(err(eb)) ? { tb: a, e: ea } : { tb: b, e: eb };
  for (let k = 0; k < 30 && Math.abs(err(best.e)) > 2_000; k++) {
    const m = (a + b) / 2;
    const em = shot(m);
    if (Math.abs(err(em)) < Math.abs(err(best.e))) best = { tb: m, e: em };
    if (Math.sign(err(em)) === Math.sign(err(ea))) {
      a = m;
      ea = em;
    } else {
      b = m;
      eb = em;
    }
  }
  const s = coast(r, v, t, best.tb - t);
  const vAfter = len(s.v) + dv;
  return { tIgnite: best.tb - burnTime / 2, tImpulse: best.tb, dv, energy: (vAfter * vAfter) / 2 - EARTH.GM / len(s.r), encounter: best.e };
}

/**
 * The mid-course correction: a small impulse now (along the velocity and out of
 * the plane) that puts the closest pass at TARGET_B in the Moon's plane. Newton
 * steps on two numerically differentiated misses.
 */
export function planMcc(r: V3, v: V3, t: number): { dv: V3; encounter: Encounter } {
  const T = norm(v);
  const N = MOON_ORBIT.N;
  const W = norm(sub(N, scale(T, dot(N, T))));
  let x = [0, 0];
  const f = (p: number[]) => encounter(r, add(v, add(scale(T, p[0]), scale(W, p[1]))), t, 7 * 86400);
  let e = f(x);
  for (let it = 0; it < 10; it++) {
    const F = [e.b - TARGET_B, e.z];
    if (Math.abs(F[0]) < 1_500 && Math.abs(F[1]) < 1_500) break;
    const h = 0.05;
    const e1 = f([x[0] + h, x[1]]), e2 = f([x[0], x[1] + h]);
    const J = [
      [(e1.b - e.b) / h, (e2.b - e.b) / h],
      [(e1.z - e.z) / h, (e2.z - e.z) / h],
    ];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!Number.isFinite(det) || Math.abs(det) < 1e-9) break;
    let d0 = (J[1][1] * F[0] - J[0][1] * F[1]) / det;
    let d1 = (-J[1][0] * F[0] + J[0][0] * F[1]) / det;
    // damp big steps: the miss is far from linear when it is large
    const mag = Math.hypot(d0, d1);
    const cap = 40;
    if (mag > cap) {
      d0 *= cap / mag;
      d1 *= cap / mag;
    }
    const nx = [x[0] - d0, x[1] - d1];
    const en = f(nx);
    if (Math.hypot(en.b - TARGET_B, en.z) < Math.hypot(F[0], F[1]) || it < 2) {
      x = nx;
      e = en;
    } else break;
  }
  return { dv: add(scale(T, x[0]), scale(W, x[1])), encounter: e };
}
