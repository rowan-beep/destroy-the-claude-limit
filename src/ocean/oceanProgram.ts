// The ocean program, loaded only when it is first needed (the jet and space
// players never download it): the harbor backdrop for the menu, the dive, and
// the benchmark route.

import * as THREE from 'three';
import { OceanWorld } from './render/oceanWorld';
import { OceanDive, type DiveMode } from './dive/dive';
import { loadOceanSettings, PRESETS, type OceanPreset } from './perf/presets';
import { HARBOR } from './world/geo';
import { BENCH_ROUTE, frameStats, type BenchResult, type SegmentResult } from './perf/benchmark';
import { listen, ambientNoise, selfNoise, addDb } from './acoustics/acoustics';

export interface OceanHost {
  renderer: () => THREE.WebGLRenderer;
  /** draw a scene through the game's post-processing at an exposure */
  draw: (scene: THREE.Scene, camera: THREE.Camera, exposure: number) => void;
  /** a preset's render scale (1 = the player's own setting) */
  setRenderScale: (k: number) => void;
  /** a dive ended: back to the menus */
  onExit: () => void;
}

interface BenchRun {
  seg: number;
  t: number;
  last: number;
  intervals: number[];
  work: number[];
  all: number[];
  allWork: number[];
  results: SegmentResult[];
  heapStart: number | null;
  preset: OceanPreset;
  resolve: (r: BenchResult) => void;
  calls: number;
  tris: number;
  /** route steps per second of the route (60: every frame a 60th of a second along it) */
  sps: number;
  /** tiles built on the worker thread in this run */
  worker: boolean;
  /** the worst frame of the warm-up (the menu going away, the first frames after it) */
  warmMax: number;
}

const heapMB = (): number | null => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round((m.usedJSHeapSize / 1048576) * 10) / 10 : null;
};

export class OceanProgram {
  readonly world: OceanWorld;
  readonly dive: OceanDive;
  private menuT = 0;
  private bench: BenchRun | null = null;

  constructor(private host: OceanHost) {
    const s = loadOceanSettings();
    this.world = new OceanWorld(host.renderer(), s.preset, s.weather);
    this.dive = new OceanDive(this.world, { draw: host.draw, setRenderScale: host.setRenderScale, canvas: () => host.renderer().domElement }, document.body);
    this.dive.onExit = () => host.onExit();
    this.world.sub.place(HARBOR.berth.x, -0.75, HARBOR.berth.z, HARBOR.berth.heading, 0, 0);
    this.world.fill(HARBOR.berth.x, HARBOR.berth.z);
    if (import.meta.env.DEV) Object.assign(window, { __ocean: this, __dive: this.dive });
  }

  get active(): boolean {
    return this.dive.active || !!this.bench;
  }

  start(mode: DiveMode, resume: boolean): void {
    this.dive.start(mode, resume);
  }

  /** a frame of the dive or the benchmark (false if neither runs) */
  frame(dt: number, w: number, h: number): boolean {
    if (this.bench) {
      this.benchFrame(w, h);
      return true;
    }
    if (!this.dive.active) return false;
    this.dive.frame(dt, w, h);
    return true;
  }

  /** the menu's backdrop: PETREL alongside at the berth, the camera drifting round her */
  renderMenu(dt: number, w: number, h: number): void {
    const s = loadOceanSettings();
    if (this.world.preset.id !== s.preset) this.world.setPreset(s.preset);
    if (this.world.weather.id !== s.weather) this.world.setWeather(s.weather);
    this.host.setRenderScale(PRESETS[s.preset].renderScale);
    this.menuT += dt;
    const b = HARBOR.berth;
    const bob = this.world.surfaceAt(b.x, b.z);
    this.world.sub.place(b.x, -0.75 + bob * 0.8, b.z, b.heading, 0, 0);
    this.world.sub.setLights(true);
    this.world.sub.poseArm(0, 0.6);
    const a = 2.2 + Math.sin(this.menuT * 0.05) * 0.7;
    const cam = this.world.camera;
    cam.position.set(b.x + Math.sin(a) * 15, 3.2 + Math.sin(this.menuT * 0.11) * 0.4, b.z + Math.cos(a) * 15);
    cam.up.set(0, 1, 0);
    cam.lookAt(b.x + 2, 0.4, b.z + 3);
    cam.fov = 50;
    cam.near = 0.08;
    cam.updateProjectionMatrix();
    this.world.resize(w, h);
    this.world.update(dt, h, { x: b.x, z: b.z }, { lamps: true, overlay: false, boat: null });
    this.host.draw(this.world.scene, cam, this.world.exposureFor(true));
  }

  /** release the GPU's memory for the ocean when another program takes over (kept: rebuilt is slower) */
  leaveMenu(): void {
    this.host.setRenderScale(1);
  }

  // ------------------------------------------------------------------ benchmark
  /**
   * Run the benchmark route on a preset; resolves with the measurements. The
   * route is always the same path; `stepsPerSecond` sets how finely it is
   * sampled (60 frames for each second of route by default; a slow machine can
   * use fewer, the same path in fewer frames).
   */
  benchmark(preset: OceanPreset, stepsPerSecond = 60, worker = true): Promise<BenchResult> {
    return new Promise((resolve) => {
      this.world.setPreset(preset);
      // (the sea-bed worker can be left out, to compare)
      const usingWorker = this.world.seabed.useWorker(worker);
      this.world.resetStreamStats();
      this.host.setRenderScale(PRESETS[preset].renderScale);
      const r = this.host.renderer();
      r.info.autoReset = false;
      this.bench = { seg: 0, t: 0, last: performance.now(), intervals: [], work: [], all: [], allWork: [], results: [], heapStart: heapMB(), preset, resolve, calls: 0, tris: 0, sps: Math.max(5, Math.min(120, stepsPerSecond)), warmMax: 0, worker: usingWorker };
      this.enterSegment(0);
    });
  }

  private enterSegment(i: number): void {
    const seg = BENCH_ROUTE[i];
    if (this.world.weather.id !== seg.weather) this.world.setWeather(seg.weather);
    this.world.sub.setLights(seg.lamps);
    const p = seg.pose(0);
    // (the first frame of a segment is a jump: the streaming catches up as it would after a teleport)
    this.world.camera.position.set(p.x, p.y, p.z);
  }

  private benchFrame(w: number, h: number): void {
    const b = this.bench!;
    const now = performance.now();
    const interval = now - b.last;
    b.last = now;
    const seg = BENCH_ROUTE[b.seg];
    // fixed time steps: the same path whatever the frame rate
    const dt = 1 / b.sps;
    b.t += dt;
    const f = Math.min(1, b.t / seg.seconds);
    const p = seg.pose(f);
    const cam = this.world.camera;
    cam.position.set(p.x, p.y, p.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(p.lx, p.ly, p.lz);
    cam.fov = 62;
    cam.near = 0.08;
    cam.updateProjectionMatrix();
    const sp = seg.sub ? seg.sub(f) : { x: HARBOR.berth.x, y: -0.75, z: HARBOR.berth.z, heading: HARBOR.berth.heading };
    this.world.sub.place(sp.x, sp.y, sp.z, sp.heading, 0, 0);
    if (seg.listen) {
      // the acoustics' per-frame work, as in a Quiet Survey
      const n = (fk: number) => addDb(ambientNoise(-sp.y, this.world.weather.wind, fk), selfNoise({ thrust: 0, lateral: 0, vertical: 0, pumping: false }, 0.2));
      for (let k = 0; k < 4; k++) listen(sp.x, sp.y, sp.z, n);
    }
    const r = this.host.renderer();
    r.info.reset();
    this.world.resize(w, h);
    this.world.update(dt, h, { x: p.lx, z: p.lz }, { lamps: seg.lamps, overlay: false, boat: null });
    this.host.draw(this.world.scene, cam, this.world.exposureFor(seg.lamps));
    const work = performance.now() - now;
    b.calls = Math.max(b.calls, r.info.render.calls);
    b.tris = Math.max(b.tris, r.info.render.triangles);
    // (the first half second of the route is a warm-up: the page is still putting the menu away,
    // which can take seconds in a software compositor; its worst frame is reported on its own.
    // The first frames of the later segments carry the jump and count, as a player would see them.)
    if (b.seg === 0 && b.t <= 0.5) b.warmMax = Math.max(b.warmMax, interval);
    else if (b.t > dt * 1.5) {
      b.intervals.push(interval);
      b.work.push(work);
      b.all.push(interval);
      b.allWork.push(work);
    }
    if (f >= 1) {
      b.results.push({ id: seg.id, label: seg.label, ...frameStats(b.intervals, b.work), maxAt: b.intervals.indexOf(Math.max(...b.intervals)), drawCalls: b.calls, triangles: b.tris });
      b.intervals = [];
      b.work = [];
      b.calls = 0;
      b.tris = 0;
      b.t = 0;
      b.seg++;
      if (b.seg >= BENCH_ROUTE.length) this.finishBench();
      else this.enterSegment(b.seg);
    }
  }

  private finishBench(): void {
    const b = this.bench!;
    this.bench = null;
    const r = this.host.renderer();
    r.info.autoReset = true;
    const st = this.world.stats();
    const gl = r.getContext();
    let gpu = '';
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    } catch {
      /* hidden */
    }
    const size = r.getSize(new THREE.Vector2());
    const res: BenchResult = {
      preset: b.preset,
      stepsPerSecond: b.sps,
      width: Math.round(size.x * r.getPixelRatio()),
      height: Math.round(size.y * r.getPixelRatio()),
      pixelRatio: r.getPixelRatio(),
      segments: b.results,
      total: frameStats(b.all, b.allWork),
      warmupMaxMs: Math.round(b.warmMax),
      seabedWorker: b.worker,
      stream: { chunkBuilds: st.chunkBuilds, chunkDisposals: st.chunkDisposals, maxChunkMs: Math.round(st.maxChunkMs * 10) / 10, stalls: st.streamStalls, workerTiles: st.workerTiles, workerMaxMs: Math.round(st.workerMaxMs * 10) / 10, wreckBuilds: st.wreckBuilds, wreckDisposals: st.wreckDisposals },
      memory: { heapStartMB: b.heapStart, heapEndMB: heapMB(), geometries: st.geometries, textures: st.textures, programs: st.programs },
      userAgent: navigator.userAgent,
      gpu,
      t: new Date().toISOString(),
    };
    this.host.setRenderScale(1);
    this.world.seabed.useWorker(true);
    b.resolve(res);
  }
}
