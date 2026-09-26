// AI difficulty. One continuous "level" (0 = green, 1 = elite) drives
// reaction times, piloting precision and tactical choices; the four duel
// difficulties and the ten waves are points on that scale with some
// explicit feature switches on top.

import { lerp, clamp01 } from '../core/math';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'EXTREME';
export const DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'EXTREME'];

export interface AISkill {
  label: string;
  level: number;
  /** seconds between tactical decisions (Easy: 2 s, Extreme: every frame) */
  thinkInterval: number;
  /** delay before reacting to a new missile / threat */
  reaction: number;
  /** maximum G the AI will pull (absolute) -- Extreme uses the aircraft's limit */
  maxG: number;
  /** use the G-limiter override to reach the airframe limit */
  useOverride: boolean;
  /** afterburner policy 0 never .. 1 aggressive */
  abUse: number;
  /** how precisely it holds corner velocity 0..1 */
  energy: number;
  /** probability / quality of missile defence 0..1 */
  defense: number;
  /** countermeasure usage 0..1 */
  cmUse: number;
  /** actively hides behind terrain to break radar locks */
  terrainMasking: boolean;
  /** advanced BFM: yo-yos, scissors, vertical fight */
  advancedBfm: boolean;
  /** uses the vertical plane to trade altitude for speed */
  vertical: boolean;
  /** cuts throttle vs. IR missiles */
  throttleCut: boolean;
  /** gun aim error (mils) */
  aimError: number;
  gunRange: number;
  /** fires missiles at this fraction of Rmax */
  missileRangeFrac: number;
  /** a lock must be held this long before shooting */
  lockHold: number;
  /** requires the target nearly dead ahead before shooting IR missiles */
  shotConeDeg: number;
  weapons: { aim120: boolean; aim9x: boolean; gun: boolean };
  /** lead-intercept geometry vs pure pursuit */
  leadIntercept: boolean;
  /** coordinated multi-ship tactics (pincer, sorting, staggered shots) */
  teamwork: number;
  /** terrain clearance it keeps (m) and prediction horizon (s) */
  minAgl: number;
  terrainLookahead: number;
  /** exploits player's fuel / G-LOC mistakes */
  exploit: boolean;
  /** max bank angle used in gentle manoeuvres */
  gentleBank: number;
  /** how quickly it spots things visually (NM) */
  visualRangeNm: number;
  /** switches guns/9X instantly by range */
  weaponAgility: boolean;
}

export function skillFromLevel(level: number, label: string): AISkill {
  const l = clamp01(level);
  return {
    label,
    level: l,
    thinkInterval: l < 0.15 ? 2.0 : l < 0.4 ? lerp(1.2, 0.6, (l - 0.15) / 0.25) : l < 0.8 ? lerp(0.35, 0.08, (l - 0.4) / 0.4) : 0,
    reaction: lerp(2.6, 0.12, l),
    maxG: l < 0.25 ? lerp(3.8, 5.2, l / 0.25) : l < 0.45 ? 6.0 : l < 0.8 ? lerp(7.0, 9.0, (l - 0.45) / 0.35) : 11,
    useOverride: l >= 0.85,
    abUse: l < 0.2 ? 0 : l < 0.45 ? 0.3 : l < 0.75 ? 0.7 : 1,
    energy: lerp(0.1, 1, l),
    defense: l < 0.2 ? 0.15 : lerp(0.5, 1, (l - 0.2) / 0.8),
    cmUse: l < 0.25 ? 0.05 : lerp(0.45, 1, (l - 0.25) / 0.75),
    terrainMasking: l >= 0.5,
    advancedBfm: l >= 0.5,
    vertical: l >= 0.5,
    throttleCut: l >= 0.55,
    aimError: lerp(9, 1.2, l),
    gunRange: lerp(700, 1300, l),
    missileRangeFrac: l < 0.2 ? 0.45 : lerp(0.55, 0.85, l),
    lockHold: l < 0.2 ? 3.0 : lerp(1.6, 0.15, l),
    shotConeDeg: l < 0.2 ? 8 : lerp(20, 70, l),
    weapons: { aim120: true, aim9x: true, gun: true },
    leadIntercept: l >= 0.3,
    teamwork: l >= 0.9 ? 1 : l >= 0.6 ? 0.4 : 0,
    minAgl: lerp(1200, 150, l),
    terrainLookahead: lerp(12, 6, l),
    exploit: l >= 0.9,
    gentleBank: lerp(35, 80, l),
    visualRangeNm: lerp(3, 7, l),
    weaponAgility: l >= 0.85,
  };
}

export function duelSkill(d: Difficulty): AISkill {
  switch (d) {
    case 'EASY':
      return skillFromLevel(0.05, 'EASY');
    case 'MEDIUM':
      return skillFromLevel(0.35, 'MEDIUM');
    case 'HARD':
      return skillFromLevel(0.65, 'HARD');
    case 'EXTREME':
      return skillFromLevel(1.0, 'EXTREME');
  }
}

export interface WaveDef {
  wave: number;
  count: number;
  tier: 'BASIC' | 'TACTICAL' | 'AGGRESSIVE' | 'ELITE';
  skill: AISkill;
  /** loadout rules for the enemy jets */
  aim120: number;
  aim9x: number;
  briefing: string;
}

/** The ten escalating waves exactly as specified. */
export function waveDef(wave: number): WaveDef {
  const w = Math.max(1, Math.min(10, wave));
  let count: number, tier: WaveDef['tier'], level: number, aim120: number, aim9x: number, briefing: string;
  if (w <= 3) {
    count = 3;
    tier = 'BASIC';
    level = [0.02, 0.08, 0.14][w - 1];
    aim120 = 0;
    aim9x = 2;
    briefing = 'Three basic bandits. Predictable flight paths, weak evasion, guns and loose Sidewinder locks.';
  } else if (w <= 6) {
    count = 6;
    tier = 'TACTICAL';
    level = [0.32, 0.4, 0.48][w - 4];
    aim120 = 0;
    aim9x = 2;
    briefing = 'Six tactical bandits. Proper defensive manoeuvres, countermeasures, and terrain masking to break your lock.';
  } else if (w <= 9) {
    count = 6;
    tier = 'AGGRESSIVE';
    level = [0.62, 0.7, 0.78][w - 7];
    aim120 = 2;
    aim9x = 2;
    briefing = 'Six aggressive bandits. Smart afterburner use and mid-range AIM-120D shots on advanced intercept geometry.';
  } else {
    count = 9;
    tier = 'ELITE';
    level = 1.0;
    aim120 = 4;
    aim9x = 2;
    briefing = 'FINAL WAVE. Nine elite bandits: coordinated multi-ship targeting and maximum-G dogfighting.';
  }
  const skill = skillFromLevel(level, `WAVE ${w}`);
  if (tier === 'BASIC') {
    skill.weapons.aim120 = false;
    skill.terrainMasking = false;
    skill.teamwork = 0;
  } else if (tier === 'TACTICAL') {
    skill.weapons.aim120 = false;
    skill.terrainMasking = true;
    skill.cmUse = Math.max(skill.cmUse, 0.7);
    skill.defense = Math.max(skill.defense, 0.7);
  } else if (tier === 'AGGRESSIVE') {
    skill.abUse = 1;
    skill.leadIntercept = true;
    skill.teamwork = Math.max(skill.teamwork, 0.3);
  } else {
    skill.teamwork = 1;
    skill.useOverride = true;
  }
  return { wave: w, count, tier, skill, aim120, aim9x, briefing };
}
