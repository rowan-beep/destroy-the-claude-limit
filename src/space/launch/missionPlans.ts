// The two new missions' trajectories.
//
// Europa Clipper's real route to Jupiter, MEGA (Mars-Earth Gravity Assist):
// launched 14 October 2024, past Mars on 1 March 2025, past Earth on
// 3 December 2026, into orbit round Jupiter on 11 April 2030. Each leg is the
// Keplerian arc round the Sun between the planets' real positions on those
// dates (a Lambert solution), so the path on the map is the one it flies.
//
// Artemis II's free return: after the translunar injection the capsule falls
// out to the Moon, swings round its far side about 7,400 km up, and the Moon's
// pull bends its path back to Earth without another big burn. The burn's time
// and size are found by flying trial trajectories through Earth's and the
// Moon's gravity and refining them until both ends come right.

import { lambert, propagate, Vec, vsub, vlen, vadd, vscale, vdot, vnorm, vcross, J2000 } from '../mars/marsPhysics';
import { planetState, BODIES } from '../solar/bodies';
import { V3, gravityAt, EARTH, MOON, moonState, len, sub, add, scale, dot, norm, cross } from '../universe';

const SUN_MU = BODIES.sun.mu;

/** a calendar date to a Julian date */
export function jdOf(y: number, m: number, d: number, h = 0): number {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5 + h / 24;
}

// ---------------------------------------------------------------- Europa Clipper
export interface Leg {
  from: string;
  to: string;
  jd0: number;
  jd1: number;
  r0: Vec;
  v0: Vec;
  /** the arrival velocity (heliocentric) */
  v1: Vec;
  /** the hyperbolic excess speed relative to the target, m/s */
  vinf1: number;
}

export interface ClipperPlan {
  launchJd: number;
  legs: Leg[];
  /** the excess speed leaving Earth (m/s) and its direction (heliocentric) */
  vinfDepart: Vec;
  arriveJd: number;
}

export const CLIPPER_DATES = {
  launch: jdOf(2024, 10, 14, 16.1),
  mars: jdOf(2025, 3, 1, 17),
  earth: jdOf(2026, 12, 3, 12),
  jupiter: jdOf(2030, 4, 11, 0),
};

export function planClipper(): ClipperPlan {
  const D = CLIPPER_DATES;
  const stops: [string, 'earth' | 'mars' | 'jupiter', number][] = [
    ['Earth', 'earth', D.launch + 1],
    ['Mars', 'mars', D.mars],
    ['Earth', 'earth', D.earth],
    ['Jupiter', 'jupiter', D.jupiter],
  ];
  const legs: Leg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const [n0, id0, j0] = stops[i];
    const [n1, id1, j1] = stops[i + 1];
    const a = planetState(id0, j0), b = planetState(id1, j1);
    const sol = lambert(a.r, b.r, (j1 - j0) * 86400, SUN_MU) ?? { v1: a.v, v2: b.v };
    legs.push({ from: n0, to: n1, jd0: j0, jd1: j1, r0: a.r, v0: sol.v1, v1: sol.v2, vinf1: vlen(vsub(sol.v2, b.v)) });
  }
  const e0 = planetState('earth', D.launch + 1);
  return { launchJd: D.launch, legs, vinfDepart: vsub(legs[0].v0, e0.v), arriveJd: D.jupiter };
}

/** where the spacecraft is on the route at a date (heliocentric) */
export function clipperAt(p: ClipperPlan, jd: number): { r: Vec; v: Vec; leg: number } {
  let i = p.legs.findIndex((l) => jd < l.jd1);
  if (i < 0) i = p.legs.length - 1;
  const l = p.legs[Math.max(0, i)];
  const st = propagate(l.r0, l.v0, (Math.max(l.jd0, jd) - l.jd0) * 86400, SUN_MU);
  return { r: st.r, v: st.v, leg: i };
}

// ---------------------------------------------------------------- Artemis free return
export interface TrialResult {
  /** closest approach to the Moon's surface (m) and when */
  perilune: number;
  tPerilune: number;
  /** the far side? (behind the Moon as seen from Earth at closest approach) */
  farSide: boolean;
  /** closest approach to Earth on the way back (altitude, m) */
  returnPerigee: number;
  tReturn: number;
}

/** fly a trajectory through Earth's and the Moon's gravity (RK4 with a step that shrinks near either body) */
export function flyTrial(r0: V3, v0: V3, t0: number, maxT = 12 * 86400, homeward = false, hMax = 200): TrialResult {
  let r = r0, v = v0, t = t0;
  let peri = Infinity, tPeri = t0, far = false;
  let retPer = Infinity, tRet = t0;
  let pastMoon = homeward;
  /** on the way down toward Earth (a trial only ends once it has come down and turned back up) */
  let falling = false;
  const acc = (rr: V3, tt: number) => gravityAt(rr, tt);
  while (t - t0 < maxT) {
    const re = len(r);
    const m = moonState(t).r;
    const dm = len(sub(r, m));
    const h = Math.max(10, Math.min(hMax, Math.min(re - EARTH.R, dm - MOON.R) / (hMax > 300 ? 3000 : 4000)));
    // RK4
    const k1v = acc(r, t), k1r = v;
    const k2v = acc(add(r, scale(k1r, h / 2)), t + h / 2), k2r = add(v, scale(k1v, h / 2));
    const k3v = acc(add(r, scale(k2r, h / 2)), t + h / 2), k3r = add(v, scale(k2v, h / 2));
    const k4v = acc(add(r, scale(k3r, h)), t + h), k4r = add(v, scale(k3v, h));
    r = add(r, scale(add(add(k1r, scale(k2r, 2)), add(scale(k3r, 2), k4r)), h / 6));
    v = add(v, scale(add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), h / 6));
    t += h;
    const alt = dm - MOON.R;
    if (alt < peri) {
      peri = alt;
      tPeri = t;
      // behind the Moon: further from Earth than the Moon is
      far = len(r) > len(m);
    }
    if (!pastMoon && alt > peri + 2e7 && peri < 2e8) pastMoon = true;
    if (pastMoon) {
      const ea = len(r) - EARTH.R;
      if (ea < retPer) {
        retPer = ea;
        tRet = t;
      }
      if (dot(r, v) < 0) falling = true;
      if (ea < 0 || (falling && dot(r, v) > 0)) break;
    }
    if (alt < 0) break;
  }
  return { perilune: peri, tPerilune: tPeri, farSide: far, returnPerigee: retPer, tReturn: tRet };
}

/** an impulsive burn, prograde plus a normal component, applied to a state */
export function burnState(r: V3, v: V3, prograde: number, normal: number): V3 {
  const u = norm(v);
  const n = norm(cross(r, v));
  return add(add(v, scale(u, prograde)), scale(n, normal));
}

export interface FreeReturn {
  /** seconds after the given time to burn, and the burn (prograde, normal), m/s */
  wait: number;
  dvPro: number;
  dvNorm: number;
  trial: TrialResult;
}

/**
 * Find the translunar injection for a free return, from a parking orbit state at
 * time t: when to burn and how hard, for a ~7,400 km far-side pass and a return
 * that grazes the atmosphere (a perigee about 40 km up).
 */
export function* solveFreeReturnSteps(r0: V3, v0: V3, t0: number, targetPeri = 7_400_000, targetRet = 40_000): Generator<void, FreeReturn> {
  const mu = EARTH.GM;
  const R0 = len(r0);
  const period = 2 * Math.PI * Math.sqrt(R0 ** 3 / mu);
  // the parking orbit propagated (two-body is fine for an hour and a half)
  const at = (w: number) => {
    const s = propagate(r0 as Vec, v0 as Vec, w, mu);
    return { r: s.r as V3, v: s.v as V3 };
  };
  const cost = (w: number, dp: number, dn: number, hMax = 200): { c: number; tr: TrialResult } => {
    const s = at(w);
    const tr = flyTrial(s.r, burnState(s.r, s.v, dp, dn), t0 + w, 11 * 86400, false, hMax);
    const ep = (tr.perilune - targetPeri) / 2e6;
    const er = tr.returnPerigee === Infinity ? 50 : (tr.returnPerigee - targetRet) / 1.5e5;
    const side = tr.farSide ? 0 : 3;
    return { c: ep * ep + Math.min(er * er, 400) + side, tr };
  };
  // the speed for an apogee at the Moon's distance
  const vc = Math.sqrt(mu / R0);
  const ra = 384_400_000;
  const vp = Math.sqrt(mu * (2 / R0 - 2 / (R0 + ra)));
  let best = { w: 0, dp: vp - vc, dn: 0, c: Infinity, tr: null as TrialResult | null };
  // when: scan one orbit
  for (let k = 0; k < 48; k++) {
    const w = (k / 48) * period;
    for (const dp of [vp - vc - 10, vp - vc + 5, vp - vc + 20]) {
      const r = cost(w, dp, 0, 600);
      yield;
      if (r.c < best.c) best = { w, dp, dn: 0, c: r.c, tr: r.tr };
    }
  }
  // refine: a few rounds of coordinate search on (when, prograde, normal)
  best = { ...best, ...(() => { const r = cost(best.w, best.dp, best.dn); return { c: r.c, tr: r.tr }; })() };
  let steps = [period / 96, 6, 30];
  for (let it = 0; it < 26; it++) {
    let improved = false;
    for (let d = 0; d < 3; d++) {
      for (const sgn of [-1, 1]) {
        const w = best.w + (d === 0 ? sgn * steps[0] : 0);
        const dp = best.dp + (d === 1 ? sgn * steps[1] : 0);
        const dn = best.dn + (d === 2 ? sgn * steps[2] : 0);
        const r = cost(w, dp, dn);
        yield;
        if (r.c < best.c) {
          best = { w, dp, dn, c: r.c, tr: r.tr };
          improved = true;
        }
      }
    }
    if (!improved) steps = steps.map((x) => x * 0.5);
  }
  return { wait: best.w, dvPro: best.dp, dvNorm: best.dn, trial: best.tr! };
}

/** a small correction (impulsive) so the free return comes out right, from a coasting state */
export function* solveCorrectionSteps(r0: V3, v0: V3, t0: number, targetPeri = 7_400_000, targetRet = 40_000): Generator<void, { dv: V3; trial: TrialResult }> {
  const u = norm(v0), n = norm(cross(r0, v0)), rr = norm(cross(n, u));
  const cost = (a: number, b: number, c: number, hMax = 200) => {
    const v = add(add(add(v0, scale(u, a)), scale(n, b)), scale(rr, c));
    const tr = flyTrial(r0, v, t0, 10 * 86400, false, hMax);
    const ep = (tr.perilune - targetPeri) / 2e6;
    const er = tr.returnPerigee === Infinity ? 50 : (tr.returnPerigee - targetRet) / 1.5e5;
    return { cost: ep * ep + Math.min(er * er, 400) + (tr.farSide ? 0 : 3), tr, v };
  };
  let best = { a: 0, b: 0, c: 0, ...cost(0, 0, 0) };
  // a coarse look round first (a bad injection can be hundreds of m/s out)
  for (const a of [-200, -120, -70, -40, -20, -10, 0, 10, 20, 40, 70, 120, 200]) {
    for (const b of [-60, -20, 0, 20, 60]) {
      const r = cost(a, b, 0, 600);
      yield;
      if (r.cost < best.cost) best = { a, b, c: 0, ...r };
    }
  }
  // refine: coarse steps through gravity first, then a short pass with fine ones
  function* refine(step: number, stop: number, hMax: number): Generator<void> {
    best = { ...best, ...cost(best.a, best.b, best.c, hMax) };
    for (let it = 0; it < 60 && step > stop; it++) {
      let improved = false;
      for (const [da, db, dc] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const r = cost(best.a + da * step, best.b + db * step, best.c + dc * step, hMax);
        yield;
        if (r.cost < best.cost) {
          best = { a: best.a + da * step, b: best.b + db * step, c: best.c + dc * step, ...r };
          improved = true;
        }
      }
      if (!improved) step *= 0.5;
    }
  }
  yield* refine(8, 0.1, 600);
  yield* refine(0.4, 0.01, 200);
  return { dv: sub(best.v, v0), trial: best.tr };
}

void J2000;
void vadd;
void vscale;
void vdot;
void vnorm;
void vcross;

/** the return correction, past the Moon: aim the entry (a perigee about 40 km up) */
export function* solveReturnSteps(r0: V3, v0: V3, t0: number, targetRet = 40_000): Generator<void, { dv: V3; trial: TrialResult }> {
  const u = norm(v0), n = norm(cross(r0, v0)), rr = norm(cross(n, u));
  const cost = (a: number, b: number, c: number) => {
    const v = add(add(add(v0, scale(u, a)), scale(n, b)), scale(rr, c));
    const tr = flyTrial(r0, v, t0, 8 * 86400, true);
    const er = tr.returnPerigee === Infinity ? 1e3 : (tr.returnPerigee - targetRet) / 5e3;
    return { cost: er * er + (a * a + b * b + c * c) * 1e-4, tr, v };
  };
  let best = { a: 0, b: 0, c: 0, ...cost(0, 0, 0) };
  let step = 4;
  for (let it = 0; it < 60 && step > 0.005; it++) {
    let improved = false;
    for (const [da, db, dc] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const r = cost(best.a + da * step, best.b + db * step, best.c + dc * step);
      yield;
      if (r.cost < best.cost) {
        best = { a: best.a + da * step, b: best.b + db * step, c: best.c + dc * step, ...r };
        improved = true;
      }
    }
    if (!improved) step *= 0.5;
  }
  return { dv: sub(best.v, v0), trial: best.tr };
}

/** run one of the step-by-step solvers to the end at once */
export function runAll<T>(g: Generator<void, T>): T {
  for (;;) {
    const n = g.next();
    if (n.done) return n.value;
  }
}
export const solveFreeReturn = (r0: V3, v0: V3, t0: number): FreeReturn => runAll(solveFreeReturnSteps(r0, v0, t0));
export const solveCorrection = (r0: V3, v0: V3, t0: number) => runAll(solveCorrectionSteps(r0, v0, t0));
export const solveReturn = (r0: V3, v0: V3, t0: number) => runAll(solveReturnSteps(r0, v0, t0));
