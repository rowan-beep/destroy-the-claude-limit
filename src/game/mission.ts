// Mission configuration chosen in the menus.

import type { AircraftType } from '../aircraft/specs';
import type { Difficulty } from '../ai/skill';
import type { TimeOfDay } from '../render/environment';

export type ModeId = 'free' | 'waves' | 'duel' | 'team' | 'ffa' | 'online' | 'tutorial' | 'daily';

export interface MissionConfig {
  mode: ModeId;
  aircraft: AircraftType;
  loadoutId: string;
  timeOfDay: TimeOfDay;
  // free flight
  freeBase: string;
  freeStart: 'runway' | 'air';
  // waves
  startWave: number;
  autoRearm: boolean;
  waveStart: 'runway' | 'air';
  // duel
  enemyType: AircraftType;
  difficulty: Difficulty;
  duelStart: 'air' | 'samos';
  duelRules: 'all' | 'ir' | 'guns';
  // 5v5 team battle
  teamAllies: 'same' | 'mixed';
  teamWins: number;
  // free-for-all
  ffaPace: 'quick' | 'standard' | 'long';
  ffaJets: 'mixed' | 'same';
}

export function defaultMission(): MissionConfig {
  return {
    mode: 'free',
    aircraft: 'F15EX',
    loadoutId: 'eagle-12',
    timeOfDay: 'morning',
    freeBase: 'broadford',
    freeStart: 'runway',
    startWave: 1,
    autoRearm: true,
    waveStart: 'air',
    enemyType: 'TYPHOON',
    difficulty: 'MEDIUM',
    duelStart: 'air',
    duelRules: 'all',
    teamAllies: 'mixed',
    teamWins: 3,
    ffaPace: 'standard',
    ffaJets: 'mixed',
  };
}

export const MODE_INFO: Record<ModeId, { title: string; subtitle: string; description: string }> = {
  daily: {
    title: 'DAILY MISSION',
    subtitle: 'Today\'s news, flown',
    description:
      'A new mission every day, built from real aviation news. Read the briefing, press OKAY and fly it: scramble from your home base, find the bandits where the story put them, fight, and bring the jet home.',
  },
  tutorial: {
    title: 'FLIGHT SCHOOL',
    subtitle: 'Tutorial + checkride',
    description:
      'New here? An instructor walks you through flying the jet (views, climbing and diving, turning, throttle and afterburner, pulling G) and fighting with it (radar lock, radar missile, heat-seeker, gun with the lead circle, flares and chaff) against target drones that never shoot back. Then the checkride: 3 drones and a manoeuvring bandit in 5 minutes, graded A to C.',
  },
  online: {
    title: 'ONLINE',
    subtitle: 'Real pilots, free-for-all',
    description: 'Multiplayer LAST PILOT STANDING on the official servers or your own: real players only, no AI.',
  },
  free: {
    title: 'FREE FLIGHT',
    subtitle: 'Sandbox',
    description:
      'Take any jet from a BLUE runway and fly the whole theater. No enemies: practise take-offs, landings, high-G handling and see how fast the afterburner drains your tanks.',
  },
  waves: {
    title: 'WAVE COMBAT',
    subtitle: '10 escalating waves',
    description:
      'Waves 1-3: three basic bandits. Waves 4-6: six tactical bandits that defend, dispense and terrain-mask. Waves 7-9: six aggressive bandits with afterburner discipline and long radar-missile shots. Wave 10: nine elite bandits with multi-ship tactics.',
  },
  team: {
    title: '5v5 TEAM BATTLE',
    subtitle: 'Rounds · first to 3',
    description:
      'You and four AI wingmen against five AI bandits over the contested island. Wipe out the other team to win the round; everyone respawns rearmed for the next. First team to 3 rounds wins the match. Shot down? Spectate any jet on either side, or fly a free camera, until the round is over.',
  },
  ffa: {
    title: 'FREE-FOR-ALL',
    subtitle: '12 jets · last one standing',
    description:
      'LAST PILOT STANDING: you and eleven AI pilots, every jet hostile to every other, no respawns. Everyone drops in on a ring around the contested island. The battle zone shrinks in stages: outside it the storm tears your jet apart. Kills refill a missile of each type, gun rounds, flares and fuel; the top scorer carries a bounty everyone hunts. Two left? FINAL DUEL. Last jet flying wins.',
  },
  duel: {
    title: '1v1 DUEL',
    subtitle: 'Custom dogfight',
    description:
      'Pick your jet, the enemy jet (any type but yours) and the AI difficulty: Easy, Medium, Hard or Extreme. Start head-on in the air or on opposite runways of the contested island with the mountains between you.',
  },
};
