// Builds sea-bed tiles off the main thread: a request names a tile, the answer
// is its arrays, handed over without copying.

import { buildChunkArrays } from './seabedArrays';

export interface TileRequest {
  key: string;
  x0: number;
  z0: number;
  size: number;
  segs: number;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<TileRequest>) => void) | null; postMessage: (m: unknown, t: Transferable[]) => void };
ctx.onmessage = (e) => {
  const r = e.data;
  const t0 = performance.now();
  const a = buildChunkArrays(r.x0, r.z0, r.segs, r.size);
  ctx.postMessage({ key: r.key, ms: performance.now() - t0, ...a }, [a.pos.buffer, a.nor.buffer, a.col.buffer, a.idx.buffer]);
};
