// Web worker entry: builds terrain chunks, tree cells and height-grid rows.
import { handleRequest, transferables, GenRequest } from './terrainGen';
import { applyMap } from './maps';
import type { MapId } from './islands';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<GenRequest>) => void) | null;
  postMessage: (msg: unknown, transfer: Transferable[]) => void;
};

ctx.onmessage = (e: MessageEvent<GenRequest | { type: 'map'; id: MapId }>) => {
  // the pool tells each worker the active map before its first job
  if (e.data.type === 'map') {
    applyMap(e.data.id);
    return;
  }
  const res = handleRequest(e.data as GenRequest);
  ctx.postMessage(res, transferables(res));
};
