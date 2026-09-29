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
  /**
   * how the bandits behave: 'orbit' (default) circles the target, radar silent,
   * and turns on you inside `triggerNm`; 'inbound' flies low toward your home
   * base without fighting back, and the mission fails if any gets within `failNm`
   */
  behavior?: 'orbit' | 'inbound';
  failNm?: number;
  /** cruise altitude for 'inbound' targets (m above sea level) */
  altM?: number;
  /** the theater the story fits best (flown on the current one otherwise) */
  map?: MapId;
  /** the jet the real pilots flew, if the game has it */
  realJet?: AircraftType;
  /** player's callsign in the story */
  callsign: string;
}

export const DAILY: DailyMission[] = [
  {
    date: '2026-09-29',
    title: 'BORDER WATCH',
    headline: 'Poland and Romania scramble fighters as Russia launches 161 drones, 82 of them jet-powered, and cruise missiles at Ukraine; two Romanian F-16s track a target manoeuvring near the border at Valkove.',
    eventDate: '2026-09-23',
    source: 'ABC News, Polish Operational Command, Romanian Ministry of National Defence',
    story:
      'Overnight on 22 to 23 September, Russia launched 161 drones, 82 of them jet-powered, and Banderol cruise missiles at Ukraine. Poland scrambled fighters against the jet drones striking western Ukraine, and Romania launched two F-16s after a target was seen manoeuvring near Valkove, right on its border. Both alerts ended after about an hour with no airspace violated. You fly that quick-reaction alert; in this version the jet drones turn toward your side of the border.',
    tasks: [
      'Scramble: take off from home base.',
      'Four jet drones are inbound, fast and radar silent (steerpoint 1 marks where they cross the border). They do not shoot back.',
      'Shoot all four down before any of them gets within 15 NM of home.',
      'Return to base: bring your jet back within 10 NM of home.',
    ],
    target: 'strait',
    distNm: 85,
    targetName: 'THE BORDER',
    behavior: 'inbound',
    failNm: 15,
    altM: 500,
    enemy: { type: 'SU35', count: 4, difficulty: 'MEDIUM', callsign: 'DRONE', aim120: 0, aim9x: 0 },
    triggerNm: 20,
    rtb: true,
    map: 'triad',
    callsign: 'CARPAT 1',
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
