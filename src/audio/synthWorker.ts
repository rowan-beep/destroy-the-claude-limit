// Synthesises the sound bank off the main thread (see synthBank.ts).
import { synthBank } from './synthBank';

self.onmessage = (e: MessageEvent<{ sr: number }>) => {
  const bank = synthBank(e.data.sr);
  const transfer = Object.values(bank).flatMap((chs) => chs.map((c) => c.buffer as ArrayBuffer));
  (self as unknown as Worker).postMessage({ sr: e.data.sr, bank }, transfer);
};
