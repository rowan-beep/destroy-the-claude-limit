// Mission configuration chosen in the menus.

import type { AircraftType } from '../aircraft/specs';
import type { Difficulty } from '../ai/skill';
import type { TimeOfDay } from '../render/environment';

export type ModeId = 'free' | 'waves' | 'duel' | 'team';

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
  };
}

export const MODE_INFO: Record<ModeId, { title: string; subtitle: string; description: string }> = {
  free: {
    title: 'FREE FLIGHT',
    subtitle: 'Sandbox',
    description:
      'Take any of the three jets from a BLUE runway and fly the whole 400 x 400 NM theater. No enemies: practise take-offs, landings, high-G handling and see how fast the afterburner drains your tanks.',
  },
  waves: {
    title: 'WAVE COMBAT',
    subtitle: '10 escalating waves',
    description:
      'Waves 1-3: three basic bandits. Waves 4-6: six tactical bandits that defend, dispense and terrain-mask. Waves 7-9: six aggressive bandits with afterburner discipline and AIM-120D shots. Wave 10: nine elite bandits with multi-ship tactics.',
  },
  team: {
    title: '5v5 TEAM BATTLE',
    subtitle: 'Rounds · first to 3',
    description:
      'You and four AI wingmen against five AI bandits over Samos. Wipe out the other team to win the round; everyone respawns rearmed for the next. First team to 3 rounds wins the match. Shot down? Spectate any jet on either side, or fly a free camera, until the round is over.',
  },
  duel: {
    title: '1v1 DUEL',
    subtitle: 'Custom dogfight',
    description:
      'Pick your jet, the enemy jet (one of the two you did not choose) and the AI difficulty: Easy, Medium, Hard or Extreme. Start head-on in the air or on opposite Samos runways with the great ridge between you.',
  },
};
