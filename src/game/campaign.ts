// CAMPAIGN: "Wolf of the Strait", eight story missions flown in order.
//
// Each mission is a scripted sortie (built and run by modes/campaign.ts)
// that unlocks the next once it is completed. Every mission has three
// stars: one for completing it and two for doing it well. Stars are kept
// across attempts (earn a missing one on a later flight and it is added).
//
// The story is written for any land theater: {HOME}, {FIELD}, {RED},
// {REDFIELD} and {ARENA} are filled in with the names on the current map.

import type { TimeOfDay } from '../render/environment';
import type { Difficulty } from '../ai/skill';
import { ROLES, airfieldsOf, AirfieldDef } from '../world/islands';

export type CampaignMissionId = 'contact' | 'raid' | 'radar' | 'escort' | 'ghost' | 'command' | 'battle' | 'wolf';

export interface CampaignMission {
  id: CampaignMissionId;
  title: string;
  /** one line for the mission list */
  teaser: string;
  time: TimeOfDay;
  /** pitch-black night (night-vision goggles) */
  dark?: boolean;
  /** base AI difficulty (shifted by the difficulty picked in the menu) */
  difficulty: Difficulty;
  /** the briefing story */
  story: string;
  tasks: string[];
  /** the three stars: [complete it, bonus, bonus] */
  stars: [string, string, string];
}

export const CAMPAIGN_TITLE = 'WOLF OF THE STRAIT';

export const CAMPAIGN_PROLOGUE =
  'For months the RED coalition on {RED} has been testing the line: fighters racing at the strait and turning back at the last minute. Its best pilot, an ace the radio calls WOLF 1, leads them. This week they stop turning back. You are VIPER 1-1, flying from {FIELD} on {HOME}.';

export const CAMPAIGN_EPILOGUE =
  "With WOLF 1 gone, RED's last squadron stays on the ground. The next morning their leaders ask for talks, and for the first time in a year the strait is quiet. Your wingman paints a small white wolf under your canopy rail.";

export const CAMPAIGN: CampaignMission[] = [
  {
    id: 'contact',
    title: 'FIRST CONTACT',
    teaser: 'Two RED fighters stop turning back. Meet them.',
    time: 'morning',
    difficulty: 'EASY',
    story:
      "Every morning this week two RED fighters have raced at the line over the strait and turned back at the last minute. This morning they didn't turn. You and your wingman, VIPER 1-2, are already on patrol east of {FIELD}. Go and meet them, and don't fire first: they will turn on you as you close, and then you are cleared hot.",
    tasks: [
      'Fly to steerpoint 1 (CAP) with VIPER 1-2 on your wing. [U] auto-fly can take you there.',
      'The two bandits turn on you as you close. Shoot them both down.',
      'Fly home and land at {FIELD} or any friendly field ([U] auto-fly can land for you).',
    ],
    stars: ['Shoot down both bandits', 'VIPER 1-2 comes home', 'Land at a friendly airfield'],
  },
  {
    id: 'raid',
    title: 'WOLF AT THE DOOR',
    teaser: 'Four bombers inbound to {FIELD}. Scramble.',
    time: 'dawn',
    difficulty: 'MEDIUM',
    story:
      "At dawn RED answers. Four strike jets, HAMMER flight, are coming in low and fast for {FIELD}, escorted by two fighters from WOLF squadron. You are on the alert pad with the engine running. VIPER 1-2 is airborne and heading out to meet them. Scramble, and stop every bomber before it reaches the field.",
    tasks: [
      'Scramble: take off from {FIELD}.',
      'Four HAMMER bombers are inbound low (they do not shoot back). Two WOLF fighters escort them.',
      'Shoot down all four bombers before any gets within {FAIL} NM of {FIELD}.',
    ],
    stars: ['Stop all four bombers', 'No bomber gets within {CLOSE} NM of {FIELD}', 'Both WOLF escorts shot down'],
  },
  {
    id: 'radar',
    title: 'BLIND THEIR EYES',
    teaser: 'Bomb the radar station that saw you coming.',
    time: 'noon',
    difficulty: 'MEDIUM',
    story:
      'HAMMER flight knew exactly where our alert jets were: a radar station on the high ground of {RED} watches everything we launch. Take it out. You carry your strike loadout; VIPER 1-2 flies cover. Expect anti-aircraft guns and a short-range SAM at the site, and alert fighters that scramble once you are seen.',
    tasks: [
      'Fly to the radar station: steerpoint 1 (TGT).',
      'Bombs are selected [4]. The computer boxes a target ([R] for the next) and counts down to release: press [SPACE] on RELEASE.',
      'Destroy both radars and the mast (amber diamonds), then fly home and land.',
    ],
    stars: ['Destroy the radar station', 'Come home with less than 10% damage', 'Land at a friendly airfield'],
  },
  {
    id: 'escort',
    title: 'SHEPHERD',
    teaser: 'Get the Strike Eagles to {REDFIELD}.',
    time: 'afternoon',
    difficulty: 'MEDIUM',
    story:
      "With their radar blind, we go for {REDFIELD}, the airbase WOLF squadron flies from. Four Strike Eagles, HAWG flight, will bomb the runway and the jets parked on it. They are loaded with bombs and can't fight: you and VIPER 1-2 are their only protection. A patrol waits halfway, and more fighters will scramble from the base itself.",
    tasks: [
      'Stay with HAWG flight (steerpoint 1 is the target, {REDFIELD}).',
      'Shoot down the interceptors before they reach the bombers.',
      'At least two Strike Eagles must reach the target.',
    ],
    stars: ['At least two HAWG jets bomb {REDFIELD}', 'All four HAWG jets bomb it', 'Shoot down three or more yourself'],
  },
  {
    id: 'ghost',
    title: 'NIGHT HUNTER',
    teaser: 'A MiG-31 in the dark, high and fast. Stop it.',
    time: 'dusk',
    dark: true,
    difficulty: 'MEDIUM',
    story:
      "RED needs to know what is left at {FIELD}. Tonight a MiG-31, callsign GHOST, will run in at high altitude and twice the speed of sound to photograph it, with two escorts below. It is pitch black: no moon, no stars. Press [9] for your night-vision goggles. Catch GHOST before it gets home with the pictures.",
    tasks: [
      'Press [9] for night-vision goggles.',
      'GHOST runs in high and fast toward {FIELD}, then turns for home. Shoot it down.',
      'It gets away if it makes it back to {REDFIELD}.',
    ],
    stars: ['Shoot down GHOST', 'Before it reaches {FIELD}', 'Both escorts shot down'],
  },
  {
    id: 'command',
    title: 'ANVIL',
    teaser: 'Hit the command post running the war.',
    time: 'morning',
    difficulty: 'HARD',
    story:
      "GHOST's film never reached them, and RED is rattled. Its fighters are now run from a hardened command post on {RED}: a bunker, a headquarters, a radio mast and a radar. Destroy it and WOLF squadron flies blind. This one is well defended: guns, two SAMs and a fighter patrol overhead.",
    tasks: [
      'Fly to the command post: steerpoint 1 (TGT).',
      'Destroy the bunker, the headquarters, the mast and the radar.',
      'Fly home and land.',
    ],
    stars: ['Destroy the command post', 'Destroy every air defence there', 'Land at a friendly airfield'],
  },
  {
    id: 'battle',
    title: 'FULL SKY',
    teaser: 'Eight against six over the strait.',
    time: 'afternoon',
    difficulty: 'MEDIUM',
    story:
      "RED throws everything it has left at us: eight fighters, coming across the strait together. Every jet we can fly goes up to meet them. You lead six: your own VIPER flight and SABRE flight. Win the sky and this war is nearly over.",
    tasks: ['Lead your five wingmen into the fight.', 'Shoot down all eight RED fighters.'],
    stars: ['Win the battle', 'Shoot down three or more yourself', 'Three or more of your wingmen survive'],
  },
  {
    id: 'wolf',
    title: 'THE WHITE WOLF',
    teaser: 'He called you out by name.',
    time: 'dusk',
    difficulty: 'HARD',
    story:
      "Their air force is broken, but one pilot still flies: WOLF 1, the ace with eleven of our jets painted on his nose. He has called you out by name on an open channel: dusk, over the strait, you and your wingman against him and his two. End it.",
    tasks: ['Fly out with VIPER 1-2 to meet WOLF flight.', 'Shoot down WOLF 1.'],
    stars: ['Shoot down WOLF 1', 'Shoot him down yourself', 'VIPER 1-2 comes home'],
  },
];

/** Home: the BLUE field on the home island nearest the enemy. */
export function campaignHome(): AirfieldDef {
  const blue = airfieldsOf('blue').filter((f) => !f.carrier);
  const own = blue.filter((f) => f.island === ROLES.blueHome.id);
  const pool = own.length ? own : blue;
  const r = ROLES.redHome;
  return pool.reduce((a, b) => (Math.hypot(a.x - r.cx, a.z - r.cz) < Math.hypot(b.x - r.cx, b.z - r.cz) ? a : b));
}

/** The enemy's front-line airbase: the RED field on its home island nearest our home. */
export function campaignRedField(): AirfieldDef {
  const red = airfieldsOf('red').filter((f) => !f.carrier);
  const own = red.filter((f) => f.island === ROLES.redHome.id);
  const pool = own.length ? own : red;
  const h = campaignHome();
  return pool.reduce((a, b) => (Math.hypot(a.x - h.x, a.z - h.z) < Math.hypot(b.x - h.x, b.z - h.z) ? a : b));
}

const NM_M = 1852;

/** distance from our front-line field to theirs (m) */
export function campaignSpan(): number {
  const h = campaignHome(), r = campaignRedField();
  return Math.max(20 * NM_M, Math.hypot(h.x - r.x, h.z - r.z));
}

/** WOLF AT THE DOOR: a bomber this close to the field fails the mission; outside `close` earns a star (m) */
export function raidRanges(): { fail: number; close: number } {
  const D = campaignSpan();
  return { fail: Math.max(8 * NM_M, 0.12 * D), close: Math.max(16 * NM_M, 0.35 * D) };
}

/** Fill in the place names (and any extra {KEY} values) for the current map. */
export function campaignText(s: string, extra: Record<string, string | number> = {}): string {
  const names: Record<string, string> = {
    HOME: ROLES.blueHome.name,
    RED: ROLES.redHome.name,
    ARENA: ROLES.arena.name,
    FIELD: campaignHome().name,
    REDFIELD: campaignRedField().name,
    FAIL: String(Math.round(raidRanges().fail / NM_M)),
    CLOSE: String(Math.round(raidRanges().close / NM_M)),
  };
  return s.replace(/\{([A-Z]+)\}/g, (m, k: string) => (k in extra ? String(extra[k]) : names[k] ?? m));
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

const KEY = 'triad.campaign.v1';

/** per mission: bit 0 complete, bits 1-2 the bonus stars */
export function loadCampaign(): number[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(a)) return CAMPAIGN.map((_, i) => (typeof a[i] === 'number' ? a[i] & 7 : 0));
  } catch {
    /* storage blocked */
  }
  return CAMPAIGN.map(() => 0);
}

/** Add the stars earned on a flight (stars already held are kept). */
export function saveCampaignStars(i: number, bits: number): number {
  const p = loadCampaign();
  p[i] = (p[i] | bits) & 7;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked */
  }
  return p[i];
}

export function starCount(bits: number): number {
  return (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1);
}

/** Missions open in order: each one once the one before it is complete. */
export function missionUnlocked(i: number, p = loadCampaign()): boolean {
  return i === 0 || (p[i - 1] & 1) === 1;
}

/** The first mission not yet completed (or the last). */
export function nextCampaignMission(p = loadCampaign()): number {
  const i = p.findIndex((b) => (b & 1) === 0);
  return i < 0 ? CAMPAIGN.length - 1 : i;
}
