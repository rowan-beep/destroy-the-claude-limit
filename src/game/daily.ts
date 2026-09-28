// DAILY MISSION: a mission built each day from a real piece of aviation news.
// Add the new day's mission at the TOP of DAILY; the game flies the newest one.
// Everything the mission needs is data here: the story shown in the briefing
// box, where the bandits wait, how many and how good they are, and whether
// the player has to bring the jet home afterwards.

import type { AircraftType } from '../aircraft/specs';
import type { Difficulty } from '../ai/skill';
import type { MapId } from '../world/islands';

export interface DailyMission {
  /** the day this mission is for (YYYY-MM-DD) */
  date: string;
  /** mission name */
  title: string;
  /** the real news behind it, one line */
  headline: string;
  /** date of the real event */
  eventDate: string;
  /** where the story was reported */
  source: string;
  /** the briefing story: what happened and how the mission plays it */
  story: string;
  /** step-by-step orders shown in the briefing box */
  tasks: string[];
  /** where the bandits wait: over the enemy's home base, the contested island, or the strait between them */
  target: 'redBase' | 'arena' | 'strait';
  /** for 'strait': how far out from home the bandits wait (NM, default 55) */
  distNm?: number;
  /** name used for the waiting area on the HUD and in the briefing */
  targetName: string;
  /** the bandits: they circle the target, radar silent, until the player comes within `triggerNm` */
  enemy: { type: AircraftType; count: number; difficulty: Difficulty; callsign: string; aim120: number; aim9x: number };
  triggerNm: number;
  /** after the fight, fly back to within 10 NM of home to complete the mission */
  rtb: boolean;
  /** the theater the story fits best (flown on the current one otherwise) */
  map?: MapId;
  /** the jet the real pilots flew, if the game has it */
  realJet?: AircraftType;
  /** player's callsign in the story */
  callsign: string;
}

export const DAILY: DailyMission[] = [
  {
    date: '2026-09-28',
    title: 'NORDIC SCRAMBLE',
    headline: 'Finnish Hornets and Swedish Gripens scramble together for the first time to intercept a Russian formation over the Gulf of Finland.',
    eventDate: '2026-09-24',
    source: 'Fox News / Swedish Air Force',
    story:
      'On 24 September, Finnish F/A-18 Hornets and Swedish JAS 39 Gripens launched together for the first time to meet a Russian formation over the Gulf of Finland: a transport escorted by supersonic MiG-31 interceptors and Su-30 fighters. Today you fly that scramble. In real life it ended quietly; in this version the escort flight does not back off.',
    tasks: [
      'Scramble: take off from home base.',
      'Fly to the escort flight circling over the strait (it is marked on your map and radar).',
      'Inside 20 NM the three Flankers turn on you. Shoot all three down.',
      'Return to base: bring your jet back within 10 NM of home.',
    ],
    target: 'strait',
    targetName: 'THE STRAIT',
    enemy: { type: 'SU35', count: 3, difficulty: 'MEDIUM', callsign: 'FLANKER', aim120: 2, aim9x: 2 },
    triggerNm: 20,
    rtb: true,
    map: 'frost',
    realJet: 'FA18EF',
    callsign: 'NORDIC 1',
  },
];

export function todaysMission(): DailyMission {
  return DAILY[0];
}

const DONE_KEY = 'triad-daily-done';

export function dailyDone(date: string): boolean {
  try {
    const d = JSON.parse(localStorage.getItem(DONE_KEY) || '[]') as string[];
    return d.includes(date);
  } catch {
    return false;
  }
}

export function markDailyDone(date: string): void {
  try {
    const d = JSON.parse(localStorage.getItem(DONE_KEY) || '[]') as string[];
    if (!d.includes(date)) d.push(date);
    localStorage.setItem(DONE_KEY, JSON.stringify(d.slice(-60)));
  } catch {
    /* storage blocked */
  }
}
