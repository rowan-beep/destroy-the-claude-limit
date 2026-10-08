// One complete expedition, as a small state machine: leave the harbor, hear a
// strange knock, take two bearings, ping the approach, find the wreck in the
// lights, scan its plate, recover the recorder, come home and dock. Each stage
// names one useful action; the mystery is never given a precise marker before
// the player has located it. Pure: the checks read plain state.

import { HARBOR, SITES, bearing, angleDiff } from '../world/geo';
import type { AtlasContact } from '../atlas/atlas';
import type { Fix } from '../acoustics/acoustics';

export type StageId = 'depart' | 'dive' | 'listen1' | 'listen2' | 'ping' | 'search' | 'scan' | 'recover' | 'return' | 'dock';

export const STAGES: StageId[] = ['depart', 'dive', 'listen1', 'listen2', 'ping', 'search', 'scan', 'recover', 'return', 'dock'];

/** what the HUD may show for the current task */
export type Guide =
  | { kind: 'point'; x: number; z: number; label: string }
  | { kind: 'area'; x: number; z: number; r: number; label: string }
  | { kind: 'none' };

export interface StageView {
  id: string;
  /** the one task, in plain words */
  task: string;
  /** a short hint for how (keys) */
  hint: string;
  guide: Guide;
}

export interface MissionCtx {
  x: number;
  z: number;
  depth: number;
  speed: number;
  heading: number;
  knock: AtlasContact | undefined;
  /** bearings taken on the knock */
  bearings: number;
  /** seconds since the last ping (Infinity if never) */
  sincePing: number;
  /** where the last ping was made */
  pingAt: { x: number; z: number } | null;
  plateScanned: boolean;
  recorderTaken: boolean;
  docked: boolean;
}

export const MISSION_ID = 'silent-buoy';
export const MISSION_TITLE = 'QUIET SURVEY: THE SILENT BUOY';

/** what the dive needs from a mission: its stages as a state machine over plain state */
export interface MissionRun<C extends MissionCtx = MissionCtx> {
  readonly missionId: string;
  readonly title: string;
  readonly stageCount: number;
  /** where its progress is saved */
  readonly progressKey: string;
  stage: number;
  second: { x: number; z: number } | null;
  changed: boolean;
  lastNote: string;
  readonly id: string;
  readonly done: boolean;
  view(ctx: C): StageView;
  update(ctx: C): boolean;
}

/** where a second bearing would cross the first well: off to the side, in open water */
export function secondListeningPoint(obsX: number, obsZ: number, firstBearing: number): { x: number; z: number } {
  // two candidates square to the first bearing; keep the one in open shelf water, away from the harbor
  const t = ((firstBearing + 90) * Math.PI) / 180;
  const d = 420;
  const a = { x: obsX + Math.sin(t) * d, z: obsZ - Math.cos(t) * d };
  const b = { x: obsX - Math.sin(t) * d, z: obsZ + Math.cos(t) * d };
  const score = (p: { x: number; z: number }) => (p.z > 260 && p.z < 950 ? 0 : 1000) + Math.abs(p.x) * 0.2 + (Math.hypot(p.x - SITES.reef.x, p.z - SITES.reef.z) < 250 ? 500 : 0);
  return score(a) <= score(b) ? a : b;
}

export class Expedition implements MissionRun {
  readonly missionId = MISSION_ID;
  readonly title = MISSION_TITLE;
  readonly stageCount = STAGES.length;
  readonly progressKey = PROGRESS_KEY;
  stage = 0;
  /** the suggested second listening position, once the first bearing is in */
  second: { x: number; z: number } | null = null;
  /** set when the stage changes (for the HUD and the checkpoint) */
  changed = true;
  /** a short line for the moment a stage is passed */
  lastNote = '';

  constructor(stage = 0) {
    this.stage = Math.max(0, Math.min(STAGES.length - 1, stage));
  }

  get id(): StageId {
    return STAGES[this.stage];
  }

  get done(): boolean {
    return this.stage >= STAGES.length;
  }

  view(ctx: MissionCtx): StageView {
    const fix: Fix | null = ctx.knock?.estimate ?? null;
    switch (this.id) {
      case 'depart':
        return { id: 'depart', task: 'Clear the harbor gate', hint: 'W / S thrust · A / D steer', guide: { kind: 'point', x: HARBOR.gate.x, z: HARBOR.gate.z + 20, label: 'HARBOR GATE' } };
      case 'dive':
        return { id: 'dive', task: 'Dive near the training buoy', hint: 'Z floods the tanks to dive · R / F up and down · T holds the depth', guide: { kind: 'point', x: SITES.buoy.x, z: SITES.buoy.z, label: 'TRAINING BUOY' } };
      case 'listen1':
        return { id: 'listen1', task: 'Coast to a stop and listen for anything unusual', hint: 'Q: Quiet Survey · stay slow and steady until the bearing is recorded', guide: { kind: 'none' } };
      case 'listen2': {
        const p = this.second;
        const cross = ctx.knock && ctx.bearings >= 2 && !fix;
        return {
          id: 'listen2',
          task: cross ? 'Those bearings run almost parallel: listen again from further to the side' : 'Move to a second listening position and listen again',
          hint: 'A second bearing from another place narrows where the knock is',
          guide: p ? { kind: 'point', x: p.x, z: p.z, label: 'GOOD LISTENING POSITION' } : { kind: 'none' },
        };
      }
      case 'ping':
        return {
          id: 'ping',
          task: 'Ping to see the ground ahead',
          hint: 'P: active sonar · it masks faint sounds for a few seconds',
          guide: fix ? { kind: 'area', x: fix.x, z: fix.z, r: fix.r, label: 'SEARCH AREA' } : { kind: 'none' },
        };
      case 'search':
        return {
          id: 'search',
          task: 'Search the area: find the source in your lights',
          hint: 'L lights · ping again to see the shape of what is there',
          guide: fix ? { kind: 'area', x: fix.x, z: fix.z, r: fix.r, label: 'SEARCH AREA' } : { kind: 'none' },
        };
      case 'scan':
        return { id: 'scan', task: 'Scan the identification plate on the stern', hint: 'Come within 10 m, face it, hold still · E scans', guide: { kind: 'point', x: SITES.plate.x, z: SITES.plate.z, label: 'PLATE' } };
      case 'recover':
        return { id: 'recover', task: 'Retrieve the recording unit by the bridge', hint: 'Come within 4 m, nose towards it · E reaches with the arm · G holds position', guide: { kind: 'point', x: SITES.recorder.x, z: SITES.recorder.z, label: 'RECORDER' } };
      case 'return':
        return { id: 'return', task: 'Return to the harbor', hint: 'X blows the tanks to surface · B emergency blow', guide: { kind: 'point', x: HARBOR.gate.x, z: HARBOR.gate.z, label: 'HOME' } };
      case 'dock':
        return { id: 'dock', task: 'Dock at the berth', hint: 'Slow into the marked berth · E to dock', guide: { kind: 'point', x: HARBOR.berth.x, z: HARBOR.berth.z, label: 'BERTH' } };
    }
  }

  /** advance if the current stage is done; returns true when it moved on */
  update(ctx: MissionCtx): boolean {
    if (this.done) return false;
    const fix = ctx.knock?.estimate ?? null;
    let pass = false;
    switch (this.id) {
      case 'depart':
        pass = ctx.z > HARBOR.gate.z + 15;
        if (pass) this.lastNote = 'Out of the harbor';
        break;
      case 'dive':
        pass = Math.hypot(ctx.x - SITES.buoy.x, ctx.z - SITES.buoy.z) < 160 && ctx.depth > 10;
        if (pass) this.lastNote = 'At the buoy, under way';
        break;
      case 'listen1':
        pass = ctx.bearings >= 1;
        if (pass && ctx.knock) {
          this.lastNote = 'First bearing recorded';
          // where the second bearing should come from
          this.second = secondListeningPoint(ctx.x, ctx.z, bearing(ctx.x, ctx.z, SITES.recorder.x, SITES.recorder.z));
        }
        break;
      case 'listen2':
        pass = !!fix;
        if (pass) this.lastNote = 'The bearings cross: a search area';
        break;
      case 'ping':
        pass = ctx.sincePing < 1 && !!ctx.pingAt && !!fix && Math.hypot(ctx.pingAt.x - fix.x, ctx.pingAt.z - fix.z) < fix.r + 450;
        if (pass) this.lastNote = 'Sonar: a long hard shape in the search area';
        break;
      case 'search':
        pass = Math.hypot(ctx.x - SITES.wreck.x, ctx.z - SITES.wreck.z) < 70 && ctx.depth > 40;
        if (pass) this.lastNote = 'A wreck in the lights';
        break;
      case 'scan':
        pass = ctx.plateScanned;
        if (pass) this.lastNote = 'Plate scanned and photographed';
        break;
      case 'recover':
        pass = ctx.recorderTaken;
        if (pass) this.lastNote = 'Recording unit recovered';
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

/** is the vehicle close, slow and facing a point enough to use a tool on it? */
export function toolReady(x: number, z: number, heading: number, speed: number, tx: number, tz: number, reach: number, cone = 40): { ok: boolean; why: string } {
  const d = Math.hypot(tx - x, tz - z);
  if (d > reach) return { ok: false, why: `MOVE CLOSER (${Math.round(d)} M, ${reach} M NEEDED)` };
  if (speed > 0.6) return { ok: false, why: 'SLOW DOWN: HOLD STILL' };
  const off = Math.abs(angleDiff(bearing(x, z, tx, tz), heading));
  if (off > cone) return { ok: false, why: 'TURN TO FACE IT' };
  return { ok: true, why: '' };
}

// ---------------------------------------------------------------- saved progress
export interface SubSnapshot {
  x: number;
  y: number;
  z: number;
  heading: number;
  ballast: number;
  battery: number;
}

export interface Checkpoint {
  mission: string;
  stage: number;
  sub: SubSnapshot;
  /** elapsed expedition seconds, distance (m), deepest point, battery at departure */
  elapsed: number;
  distance: number;
  maxDepth: number;
  battery0: number;
  plateScanned: boolean;
  recorderTaken: boolean;
  /** the follow-up's tasks (absent in the first expedition's saves) */
  tagScanned?: boolean;
  hydrophoneTaken?: boolean;
  footPinged?: boolean;
  second: { x: number; z: number } | null;
  /** the route so far */
  track: [number, number, number][];
  t: number;
}

export interface Career {
  completed: string[];
  /** contacts opened by finished expeditions (follow-ups) */
  unlocked: string[];
}

export const PROGRESS_KEY = 'triad.ocean.progress.v1';
export const CAREER_KEY = 'triad.ocean.career.v1';

export function parseCheckpoint(raw: string | null, mission = MISSION_ID): Checkpoint | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Checkpoint;
    if (c && c.mission === mission && typeof c.stage === 'number' && c.sub && Number.isFinite(c.sub.x)) return c;
  } catch {
    /* a damaged checkpoint: the expedition starts over */
  }
  return null;
}

export function parseCareer(raw: string | null): Career {
  try {
    const c = raw ? (JSON.parse(raw) as Career) : null;
    if (c && Array.isArray(c.completed)) return { completed: c.completed, unlocked: Array.isArray(c.unlocked) ? c.unlocked : [] };
  } catch {
    /* fresh */
  }
  return { completed: [], unlocked: [] };
}
