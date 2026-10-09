// Mission configuration chosen in the menus.

import type { AircraftType } from '../aircraft/specs';
import type { Difficulty } from '../ai/skill';
import type { TimeOfDay } from '../render/environment';

export type ModeId = 'free' | 'waves' | 'duel' | 'team' | 'ffa' | 'online' | 'tutorial' | 'daily' | 'strike' | 'recon' | 'campaign' | 'spotter';

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
  // campaign: which mission (0-based)
  campaignMission: number;
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
    campaignMission: 0,
  };
}

export const MODE_INFO: Record<ModeId, { title: string; subtitle: string; description: string }> = {
  spotter: {
    title: 'AIRSHOW',
    subtitle: 'Plane spotting · every jet on display',
    description:
      'No flying: you are on the crowd line with a camera and a long zoom lens, and every jet in the game flies its display in front of you. The takeoff into a vertical climb, the high-speed pass with its vapour cone, the rolling pass, the max-g turn with vapour pouring off the wings, the slow high-alpha pass (a cobra from the thrust-vectoring jets) and the landing. Photograph them: every picture is scored on how the jet fills and sits in the frame, how sharp it is (pan with it) and the moment you caught. The best go in your album, every kind of shot of every jet in the spotter\'s logbook, and the points climb you through the ranks to longer lenses. The jet you pick opens the show.',
  },
  campaign: {
    title: 'CAMPAIGN',
    subtitle: 'Wolf of the Strait · 8 missions',
    description:
      'A story in eight missions. The RED coalition stops turning back at the line, and its ace, WOLF 1, leads them. Intercept, defend your own base, bomb a radar and a command post, escort Strike Eagles, hunt a MiG-31 in the pitch dark, lead a six-ship into the biggest air battle of the war, and finally meet WOLF 1 himself. Wingmen and radio calls throughout. Each mission unlocks the next and has three stars to earn.',
  },
  recon: {
    title: 'BLACKBIRD',
    subtitle: 'SR-71 spy missions · story',
    description:
      'You fly the SR-71A Blackbird, unarmed, for the agency. Every mission is a new crisis written for that sortie: a missing missile brigade, a defector, a dark radar, an airbase build-up, a lost agent. Sneak over enemy bases without being caught: photograph them, sweep them with the side-looking radar and record their radio traffic, then piece the clues together, make the call and send the fighters in. Each mission has new sites, new clues, a new right answer and new trouble along the way: inlet unstarts, SA-2 launches, MiG-31s scrambling after you, re-tasking from home. Stay high, stay fast, stay unseen.',
  },
  strike: {
    title: 'AIRSTRIKE',
    subtitle: 'Bomb a defended target',
    description:
      'Fly a strike loadout (JDAM, SDB, Paveway IV, Hammer or KAB-500S) against a ground target: an ammunition depot, a command post, a SAM site, an army camp, a radar station or an enemy airbase. Every sortie is new: a different target in a different place, different AAA and SAM defences, fighters on patrol or scrambling after you, and a different start. The bombing computer counts down to the release point. Destroy every primary target, then fly home and land.',
  },
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
      'Pick your jet, the enemy jet (any type but yours) and the AI difficulty: Easy, Medium, Hard, Extreme or APEX. Start head-on in the air or on opposite runways of the contested island with the mountains between you.',
  },
};
