// The follow-up to the first expedition: the slow pulse from the deep basin.
// Leave the harbor, take two bearings on the pulse, go down into the search
// area and find what is sending it in the lamps (the top float of the lab's
// mooring K3, 282 m down), scan its tag, take its hydrophone recorder off the
// line, ping to see what lies at the foot of the line (57 m further down,
// past PETREL's rating: the multibeam can look where the boat must not go),
// come home and dock. Like the first expedition, nothing marks the source
// before the player has located it. Pure: the checks read plain state.

import { HARBOR, K3, WORLD, seabedHeight, bearing, angleDiff } from '../world/geo';
import type { AtlasContact } from '../atlas/atlas';
import type { Fix } from '../acoustics/acoustics';
import type { MissionCtx, MissionRun, StageView } from './expedition';

export const PULSE_ID = 'slow-pulse';
export const PULSE_TITLE = 'FOLLOW-UP: THE SLOW PULSE';
export const PULSE_PROGRESS_KEY = 'triad.ocean.progress.pulse.v1';

export type PulseStageId = 'depart' | 'listen1' | 'listen2' | 'search' | 'scan' | 'recover' | 'ping' | 'return' | 'dock';
export const PULSE_STAGES: PulseStageId[] = ['depart', 'listen1', 'listen2', 'search', 'scan', 'recover', 'ping', 'return', 'dock'];

export interface PulseCtx extends MissionCtx {
  /** the slow pulse in the atlas, and the bearings taken on it */
  pulse: AtlasContact | undefined;
  pulseBearings: number;
  lamps: boolean;
  tagScanned: boolean;
  hydrophoneTaken: boolean;
  footPinged: boolean;
}

/** how close (3D) the top float must be to count as found in the lamps */
export const FLOAT_FOUND_M = 22;

/** the multibeam under the boat: a fan of beams 65° either side of straight down, 120 m deep */
export function multibeamSees(sx: number, sy: number, sz: number, tx: number, ty: number, tz: number): boolean {
  const below = sy - ty;
  if (below <= 0 || below > 120) return false;
  return Math.hypot(tx - sx, tz - sz) <= below * Math.tan((65 * Math.PI) / 180);
}

/**
 * Where a second bearing on the pulse would cross the first well: to the side
 * of the first line and nearer the source, in water deep enough to listen in
 * and inside the surveyed area. (The pulse is kilometres off: a short step to
 * the side would give almost the same bearing.)
 */
export function secondPulsePoint(obsX: number, obsZ: number): { x: number; z: number } {
  const b0 = bearing(obsX, obsZ, K3.x, K3.z);
  let best = { x: obsX, z: obsZ }, bestScore = Infinity;
  for (const off of [60, -60, 75, -75, 90, -90]) {
    for (const d of [900, 1200, 1500]) {
      const a = ((b0 + off) * Math.PI) / 180;
      const p = { x: obsX + Math.sin(a) * d, z: obsZ - Math.cos(a) * d };
      const cross = Math.abs(angleDiff(bearing(p.x, p.z, K3.x, K3.z), b0));
      let score = -Math.min(cross, 70) + d * 0.004;
      if (seabedHeight(p.x, p.z) > -25) score += 1000;
      if (p.x < WORLD.minX + 150 || p.x > WORLD.maxX - 150 || p.z < WORLD.minZ + 150 || p.z > WORLD.maxZ - 150) score += 1000;
      if (Math.hypot(p.x - K3.x, p.z - K3.z) < 400) score += 200;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  return best;
}

export class PulseMission implements MissionRun<PulseCtx> {
  readonly missionId = PULSE_ID;
  readonly title = PULSE_TITLE;
  readonly stageCount = PULSE_STAGES.length;
  readonly progressKey = PULSE_PROGRESS_KEY;
  stage = 0;
  second: { x: number; z: number } | null = null;
  changed = true;
  lastNote = '';

  constructor(stage = 0) {
    this.stage = Math.max(0, Math.min(PULSE_STAGES.length - 1, stage));
  }

  get id(): PulseStageId {
    return PULSE_STAGES[this.stage];
  }

  get done(): boolean {
    return this.stage >= PULSE_STAGES.length;
  }

  view(ctx: PulseCtx): StageView {
    const fix: Fix | null = ctx.pulse?.estimate ?? null;
    switch (this.id) {
      case 'depart':
        return { id: 'depart', task: 'Clear the harbor gate', hint: 'W / S thrust · A / D steer · , / . transit time', guide: { kind: 'point', x: HARBOR.gate.x, z: HARBOR.gate.z + 20, label: 'HARBOR GATE' } };
      case 'listen1':
        return { id: 'listen1', task: 'Stop and listen for the slow pulse', hint: 'Q: Quiet Survey · a low tone every 6.5 s · stay slow and steady', guide: { kind: 'none' } };
      case 'listen2': {
        const p = this.second;
        const parallel = ctx.pulse && ctx.pulseBearings >= 2 && !fix;
        return {
          id: 'listen2',
          task: parallel ? 'Those bearings run almost parallel: listen again from further to the side' : 'Move well to the side and listen again',
          hint: 'The pulse is kilometres away: the second bearing needs a long step sideways',
          guide: p ? { kind: 'point', x: p.x, z: p.z, label: 'GOOD LISTENING POSITION' } : { kind: 'none' },
        };
      }
      case 'search':
        return {
          id: 'search',
          task: 'Go down in the search area: find the source in your lamps',
          hint: 'A deep mooring floats 50–60 m above the bottom: go down to that height and ping for small hard returns · L lamps',
          guide: fix ? { kind: 'area', x: fix.x, z: fix.z, r: fix.r, label: 'SEARCH AREA' } : { kind: 'none' },
        };
      case 'scan':
        return { id: 'scan', task: 'Scan the tag on the top float', hint: 'Come within 8 m, face it, hold still · E scans', guide: { kind: 'point', x: K3.tag.x, z: K3.tag.z, label: 'K3 TAG' } };
      case 'recover':
        return { id: 'recover', task: 'Take the hydrophone recorder off the line', hint: 'Come within 4 m, level with it, nose towards it · E reaches with the arm · G holds position', guide: { kind: 'point', x: K3.hydrophone.x, z: K3.hydrophone.z, label: 'RECORDER' } };
      case 'ping':
        return { id: 'ping', task: 'Ping: see what lies at the foot of the line', hint: 'P pings · the multibeam under the boat maps the bottom 120 m down · stay above 300 m', guide: { kind: 'point', x: K3.x, z: K3.z, label: 'K3' } };
      case 'return':
        return { id: 'return', task: 'Return to the harbor', hint: 'X blows the tanks to surface · , / . transit time in open water', guide: { kind: 'point', x: HARBOR.gate.x, z: HARBOR.gate.z, label: 'HOME' } };
      case 'dock':
        return { id: 'dock', task: 'Dock at the berth', hint: 'Slow into the marked berth · E to dock', guide: { kind: 'point', x: HARBOR.berth.x, z: HARBOR.berth.z, label: 'BERTH' } };
    }
  }

  update(ctx: PulseCtx): boolean {
    if (this.done) return false;
    const fix = ctx.pulse?.estimate ?? null;
    let pass = false;
    switch (this.id) {
      case 'depart':
        pass = ctx.z > HARBOR.gate.z + 15;
        if (pass) this.lastNote = 'Out of the harbor';
        break;
      case 'listen1':
        pass = ctx.pulseBearings >= 1;
        if (pass) {
          this.lastNote = 'First bearing on the pulse';
          this.second = secondPulsePoint(ctx.x, ctx.z);
        }
        break;
      case 'listen2':
        pass = !!fix;
        if (pass) this.lastNote = 'The bearings cross in the deep basin';
        break;
      case 'search':
        pass = ctx.lamps && Math.hypot(ctx.x - K3.x, -ctx.depth - K3.floatY, ctx.z - K3.z) < FLOAT_FOUND_M;
        if (pass) this.lastNote = 'A mooring float in the lamps';
        break;
      case 'scan':
        pass = ctx.tagScanned;
        if (pass) this.lastNote = 'Tag scanned: mooring K3';
        break;
      case 'recover':
        pass = ctx.hydrophoneTaken;
        if (pass) this.lastNote = 'Hydrophone recorder aboard';
        break;
      case 'ping':
        pass = ctx.footPinged;
        if (pass) this.lastNote = 'A container across the line, 339 m down';
        break;
      case 'return':
        pass = ctx.z < HARBOR.gate.z - 10 && Math.abs(ctx.x) < 230;
        if (pass) this.lastNote = 'Inside the harbor';
        break;
      case 'dock':
        pass = ctx.docked;
        if (pass) this.lastNote = 'Docked';
        break;
    }
    if (pass) {
      this.stage++;
      this.changed = true;
    }
    return pass;
  }
}
