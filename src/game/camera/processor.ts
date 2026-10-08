// The main thread's side of the developing worker.

import DevelopWorker from './developWorker?worker&inline';
import type { DevelopJob, DevelopResult } from './developWorker';
import { develop } from './develop';

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: DevelopResult) => void>();

function get(): Worker | null {
  if (worker) return worker;
  try {
    worker = new DevelopWorker();
    worker.onmessage = (e: MessageEvent<DevelopResult>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** develop a captured frame (in the worker, or here if workers are unavailable) */
export async function process(job: Omit<DevelopJob, 'id'>): Promise<DevelopResult> {
  const w = typeof OffscreenCanvas !== 'undefined' ? get() : null;
  const id = ++seq;
  if (w) {
    return new Promise((res) => {
      waiting.set(id, res);
      w.postMessage({ ...job, id }, [job.bmp]);
    });
  }
  // (fallback: an ordinary canvas on this thread)
  const c = document.createElement('canvas');
  c.width = job.w;
  c.height = job.h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(job.bmp, 0, 0, job.w, job.h);
  job.bmp.close();
  const toBlob = (cv: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((r) => cv.toBlob(r, type, q));
  const raw = job.raw ? await toBlob(c, 'image/png') : null;
  const img = g.getImageData(0, 0, job.w, job.h);
  develop(img, { ...job.params, adobe: false });
  g.putImageData(img, 0, 0);
  const jpeg = job.jpeg || !raw ? await toBlob(c, 'image/jpeg', job.quality) : null;
  const t = document.createElement('canvas');
  t.width = job.thumbW;
  t.height = Math.round((job.thumbW * job.h) / job.w);
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
  return { id, jpeg, raw, thumb: await toBlob(t, 'image/jpeg', 0.8) };
}
