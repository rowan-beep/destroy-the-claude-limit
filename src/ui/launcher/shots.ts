// The loading screen's pictures: twenty cinematic shots of each program, taken in
// the game itself at 7680 × 4320 (8K) and kept as separate files next to the page
// (cinematics/<program>/NN.webp), so the page itself stays small and each one is
// only downloaded when it is about to be shown. The first of each is the picker's.

import type { Program } from '../menu/program';

export interface Shot {
  file: string;
  caption: string;
}

export const SHOTS: Record<Program, Shot[]> = {
  air: [],
  space: [],
};

export function shotUrl(p: Program, s: Shot): string {
  return `${import.meta.env.BASE_URL}cinematics/${p}/${s.file}`;
}
