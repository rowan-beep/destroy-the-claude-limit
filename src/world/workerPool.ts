// Priority job queue over a small pool of terrain workers. Falls back to
// time-sliced main-thread generation if workers cannot be created (some
// sandboxed hosts forbid blob workers).

import TerrainWorker from './terrainWorker?worker&inline';
import type { GenRequest, GenResult } from './terrainGen';
import { handleRequest } from './terrainGen';

type Callback = (res: GenResult) => void;
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type JobRequest = DistributiveOmit<GenRequest, 'id'>;

interface Job {
  req: GenRequest;
  priority: number;
  cb: Callback;
  cancelled: boolean;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private busy: (Job | null)[] = [];
  private queue: Job[] = [];
  private nextId = 1;
  private fallback = false;
  private fallbackBudgetMs = 6;

  constructor(count: number) {
    try {
      for (let i = 0; i < count; i++) {
        const w = new TerrainWorker();
        const idx = i;
        w.onmessage = (e: MessageEvent<GenResult>) => this.onResult(idx, e.data);
        w.onerror = (err) => {
          console.warn('terrain worker error, switching to main-thread generation', err);
          this.enableFallback();
        };
        this.workers.push(w);
        this.busy.push(null);
      }
    } catch (err) {
      console.warn('Workers unavailable, using main-thread terrain generation', err);
      this.enableFallback();
    }
  }

  get usingFallback(): boolean {
    return this.fallback;
  }

  private enableFallback(): void {
    if (this.fallback) return;
    this.fallback = true;
    // Re-queue anything that was in flight.
    for (let i = 0; i < this.busy.length; i++) {
      const j = this.busy[i];
      if (j && !j.cancelled) this.queue.push(j);
      this.busy[i] = null;
    }
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.busy = [];
  }

  /** Submit a job; lower priority value runs first. Returns a cancel handle. */
  submit(req: JobRequest, priority: number, cb: Callback): { cancel: () => void; job: Job } {
    const full = { ...req, id: this.nextId++ } as GenRequest;
    const job: Job = { req: full, priority, cb, cancelled: false };
    this.queue.push(job);
    this.pump();
    return { cancel: () => (job.cancelled = true), job };
  }

  setPriority(job: Job, p: number): void {
    job.priority = p;
  }

  get pending(): number {
    return this.queue.length + this.busy.filter((b) => b).length;
  }

  private takeNext(): Job | null {
    let best = -1;
    let bestP = Infinity;
    for (let i = 0; i < this.queue.length; i++) {
      const j = this.queue[i];
      if (j.cancelled) {
        this.queue.splice(i, 1);
        i--;
        continue;
      }
      if (j.priority < bestP) {
        bestP = j.priority;
        best = i;
      }
    }
    if (best < 0) return null;
    return this.queue.splice(best, 1)[0];
  }

  private pump(): void {
    if (this.fallback) return;
    for (let i = 0; i < this.workers.length; i++) {
      if (this.busy[i]) continue;
      const job = this.takeNext();
      if (!job) return;
      this.busy[i] = job;
      this.workers[i].postMessage(job.req);
    }
  }

  private onResult(idx: number, res: GenResult): void {
    const job = this.busy[idx];
    this.busy[idx] = null;
    if (job && !job.cancelled) job.cb(res);
    this.pump();
  }

  /** Called every frame; only does work in fallback mode. */
  tick(budgetMs = this.fallbackBudgetMs): void {
    if (!this.fallback) return;
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      const job = this.takeNext();
      if (!job) return;
      job.cb(handleRequest(job.req));
    }
  }

  /** Run a list of jobs to completion (used at load time). */
  runAll(reqs: JobRequest[], onEach: (res: GenResult) => void, onProgress?: (f: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let done = 0;
      if (reqs.length === 0) resolve();
      for (const r of reqs) {
        this.submit(r, -1000, (res) => {
          onEach(res);
          done++;
          onProgress?.(done / reqs.length);
          if (done === reqs.length) resolve();
        });
      }
      // Self-driving pump: the worker pool can drop into fallback mode at any
      // moment (a worker's error event arrives asynchronously), and nothing
      // else calls tick() while the game is still loading.
      const step = () => {
        if (done >= reqs.length) return;
        if (this.fallback) this.tick(30);
        setTimeout(step, this.fallback ? 0 : 20);
      };
      step();
    });
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }
}
