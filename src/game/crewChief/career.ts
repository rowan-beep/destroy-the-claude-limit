// The crew chief's record: experience, jets turned and the rank they add up to.

export const CC_RANKS: { name: string; xp: number; perk: string }[] = [
  { name: 'AIRMAN BASIC', xp: 0, perk: 'Tires, brakes, servicing and walkarounds' },
  { name: 'AIRMAN', xp: 400, perk: 'Hydraulic leaks and canopy seals' },
  { name: 'AIRMAN FIRST CLASS', xp: 1100, perk: 'Avionics fault isolation and weapons loading' },
  { name: 'SENIOR AIRMAN', xp: 2400, perk: 'Bird strikes, borescopes and engine changes' },
  { name: 'STAFF SERGEANT · DEDICATED CREW CHIEF', xp: 4500, perk: 'Your name painted on the canopy rail' },
  { name: 'TECHNICAL SERGEANT · EXPEDITER', xp: 8000, perk: 'Bigger work orders, three jets a shift' },
  { name: 'MASTER SERGEANT · PRODUCTION SUPERINTENDENT', xp: 14000, perk: 'The whole flight line' },
];

export interface CcLog {
  xp: number;
  jets: number;
  jobs: number;
  /** jobs signed off with no mistakes */
  clean: number;
  /** foreign object damage caused (tools left in jets) */
  fod: number;
  /** the crew chief's name (for the canopy rail) */
  name: string;
}

const KEY = 'triad.crewchief.v1';

export function loadCc(): CcLog {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s.xp === 'number') return { jets: 0, jobs: 0, clean: 0, fod: 0, name: '', ...s };
  } catch {
    /* (fresh) */
  }
  return { xp: 0, jets: 0, jobs: 0, clean: 0, fod: 0, name: '' };
}

export function saveCc(l: CcLog): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* (this session only) */
  }
}

export function ccRank(xp: number): { i: number; rank: (typeof CC_RANKS)[number]; next: (typeof CC_RANKS)[number] | null } {
  let i = 0;
  while (i + 1 < CC_RANKS.length && xp >= CC_RANKS[i + 1].xp) i++;
  return { i, rank: CC_RANKS[i], next: CC_RANKS[i + 1] ?? null };
}

/** the jobs a rank may be given (the hard ones come with experience) */
export function jobsForRank(i: number): string[] {
  const all = ['tyre', 'brakes', 'oil', 'fuel', 'preflight'];
  if (i >= 1) all.push('hyd', 'canopy');
  if (i >= 2) all.push('radar', 'load', 'lo');
  if (i >= 3) all.push('bird');
  return all;
}
