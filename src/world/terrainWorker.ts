// Web worker entry: builds terrain chunks, tree cells and height-grid rows.
import { handleRequest, transferables, GenRequest } from './terrainGen';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<GenRequest>) => void) | null;
  postMessage: (msg: unknown, transfer: Transferable[]) => void;
};

ctx.onmessage = (e: MessageEvent<GenRequest>) => {
  const res = handleRequest(e.data);
  ctx.postMessage(res, transferables(res));
};
