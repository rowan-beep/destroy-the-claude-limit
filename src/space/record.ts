// The commander's record in the space program, kept apart from the air
// combat logbook.

export interface SpaceRecord {
  missions: number;
  launches: number;
  daysInSpace: number;
  samples: number;
}
const REC_KEY = 'triad.space.record';

export function loadRecord(): SpaceRecord {
  const d: SpaceRecord = { missions: 0, launches: 0, daysInSpace: 0, samples: 0 };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(REC_KEY) || '{}') };
  } catch {
    return d;
  }
}

export function updateRecord(fn: (r: SpaceRecord) => void): void {
  const r = loadRecord();
  fn(r);
  try {
    localStorage.setItem(REC_KEY, JSON.stringify(r));
  } catch {
    /* private mode: the record lasts for this session only */
  }
}
