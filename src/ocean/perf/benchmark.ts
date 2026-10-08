// A repeatable benchmark through the ocean: the same camera path every time,
// through the harbor at dawn, a rough overcast surface, down through the
// waterline and back up, over the reef, along the wreck with the lamps on, out
// over the deep basin, and a stretch of Quiet Survey listening. Each segment
// records frame intervals and the time the frame's own work took; the run
// reports percentiles, long frames, streaming work, renderer counts and memory.

import type { Weather } from '../world/waves';
import { SITES, HARBOR, seabedHeight } from '../world/geo';

export interface BenchPose {
  x: number;
  y: number;
  z: number;
  /** look-at point */
  lx: number;
  ly: number;
  lz: number;
}

export interface BenchSegment {
  id: string;
  label: string;
  seconds: number;
  weather: Weather;
  lamps: boolean;
  /** camera pose at a fraction 0..1 through the segment */
  pose: (f: number) => BenchPose;
  /** the boat (null: at the berth) */
  sub?: (f: number) => { x: number; y: number; z: number; heading: number };
  /** listen during this segment (the acoustics run every frame) */
  listen?: boolean;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const W = SITES.wreck;
const wreckY = seabedHeight(W.x, W.z);

export const BENCH_ROUTE: BenchSegment[] = [
  {
    id: 'harbor',
    label: 'Harbor at dawn',
    seconds: 8,
    weather: 'dawn',
    lamps: false,
    pose: (f) => {
      const a = -0.6 + f * 1.4;
      return { x: HARBOR.berth.x + Math.sin(a) * 40, y: 9, z: HARBOR.berth.z + 40 + Math.cos(a) * 40, lx: HARBOR.berth.x, ly: 0, lz: HARBOR.berth.z };
    },
  },
  {
    id: 'surface',
    label: 'Rough surface, overcast',
    seconds: 8,
    weather: 'overcast',
    lamps: false,
    pose: (f) => ({ x: lerp(0, 120, f), y: 3.5, z: lerp(160, 420, f), lx: lerp(40, 160, f), ly: 0, lz: lerp(260, 560, f) }),
    sub: (f) => ({ x: lerp(0, 120, f) + 6, y: -0.75, z: lerp(160, 420, f) + 14, heading: 25 }),
  },
  {
    id: 'waterline',
    label: 'Through the waterline, down and up',
    seconds: 8,
    weather: 'calm',
    lamps: true,
    pose: (f) => {
      // down from 2 m above to 3 m below and back, slowly, looking level
      const y = 2 - 5 * Math.sin(f * Math.PI);
      return { x: 150, y, z: 440, lx: 150 + 20, ly: y - 0.5, lz: 440 - 10 };
    },
  },
  {
    id: 'reef',
    label: 'Lantern Reef, 12-25 m',
    seconds: 10,
    weather: 'calm',
    lamps: false,
    pose: (f) => {
      const x = lerp(470, 650, f), z = lerp(380, 600, f);
      const g = seabedHeight(x, z);
      return { x, y: Math.min(-3, g + 7), z, lx: x + 18, ly: g + 1, lz: z + 22 };
    },
  },
  {
    id: 'wreck',
    label: 'Along the wreck, lamps on, 85 m',
    seconds: 12,
    weather: 'dawn',
    lamps: true,
    pose: (f) => {
      const a = f * Math.PI * 1.2 - 0.4;
      return { x: W.x + Math.sin(a) * 26, y: wreckY + 9, z: W.z + Math.cos(a) * 26, lx: W.x, ly: wreckY + 4, lz: W.z };
    },
    sub: (f) => {
      const a = f * Math.PI * 1.2 - 0.4 + 0.25;
      return { x: W.x + Math.sin(a) * 22, y: wreckY + 6, z: W.z + Math.cos(a) * 22, heading: ((-a * 180) / Math.PI + 270 + 360) % 360 };
    },
  },
  {
    id: 'deep',
    label: 'Deep water over the basin',
    seconds: 8,
    weather: 'dawn',
    lamps: true,
    pose: (f) => ({ x: lerp(200, 500, f), y: -150, z: lerp(2000, 2500, f), lx: lerp(220, 520, f), ly: -170, lz: lerp(2040, 2540, f) }),
  },
  {
    id: 'survey',
    label: 'Quiet Survey listening at the buoy',
    seconds: 6,
    weather: 'dawn',
    lamps: true,
    listen: true,
    pose: (f) => ({ x: SITES.buoy.x - 10, y: -18, z: SITES.buoy.z + 12, lx: SITES.buoy.x + 30 * Math.cos(f), ly: -22, lz: SITES.buoy.z - 30 }),
    sub: () => ({ x: SITES.buoy.x, y: -20, z: SITES.buoy.z, heading: 200 }),
  },
];

export interface FrameStats {
  frames: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  over50: number;
  avgFps: number;
  /** our own work in the frame (simulation, streaming, the draw call submission) */
  workMedianMs: number;
  workP95Ms: number;
}

export function frameStats(intervals: number[], work: number[]): FrameStats {
  const q = (a: number[], p: number) => {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  };
  const total = intervals.reduce((a, b) => a + b, 0);
  return {
    frames: intervals.length,
    medianMs: q(intervals, 0.5),
    p95Ms: q(intervals, 0.95),
    p99Ms: q(intervals, 0.99),
    maxMs: intervals.length ? Math.max(...intervals) : 0,
    over50: intervals.filter((x) => x > 50).length,
    avgFps: total > 0 ? (intervals.length * 1000) / total : 0,
    workMedianMs: q(work, 0.5),
    workP95Ms: q(work, 0.95),
  };
}

export interface SegmentResult extends FrameStats {
  id: string;
  label: string;
  drawCalls: number;
  triangles: number;
}

export interface BenchResult {
  preset: string;
  /** frames per second of route (60 = every frame a 60th of a second along the path) */
  stepsPerSecond: number;
  width: number;
  height: number;
  pixelRatio: number;
  segments: SegmentResult[];
  total: FrameStats;
  stream: { chunkBuilds: number; chunkDisposals: number; maxChunkMs: number; stalls: number; wreckBuilds: number; wreckDisposals: number };
  memory: { heapStartMB: number | null; heapEndMB: number | null; geometries: number; textures: number; programs: number };
  userAgent: string;
  gpu: string;
  t: string;
}
