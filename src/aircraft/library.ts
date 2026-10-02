// JET LIBRARY data: the real-world background of every jet in the game
// (maker, nation, dates, operators) and how each one plays here. The flight
// numbers themselves come from specs.ts.

import type { AircraftType } from './specs';

export type Region = 'usa' | 'europe' | 'russia';

export interface LibraryEntry {
  nation: string;
  region: Region;
  /** flag stripes for the nation chip, left to right (top to bottom with flagH) */
  flag: string[];
  flagH?: boolean;
  manufacturer: string;
  generation: '3' | '4' | '4.5' | '5';
  firstFlight: string;
  inService: string;
  built: string;
  operators: string;
  carrier: boolean;
  nickname: string;
  /** one-paragraph history */
  history: string;
  /** how it plays in TRIAD */
  strengths: string[];
  weaknesses: string[];
  /** best way to fight it (and in it) */
  tactics: string;
}

export const LIBRARY: Record<AircraftType, LibraryEntry> = {
  F15EX: {
    nation: 'United States',
    region: 'usa',
    flag: ['#b22234', '#ffffff', '#3c3b6e'],
    manufacturer: 'Boeing',
    generation: '4.5',
    firstFlight: '2 Feb 2021',
    inService: '2024',
    built: 'In production',
    operators: 'U.S. Air Force (Israel and Indonesia have ordered versions)',
    carrier: false,
    nickname: 'Eagle II',
    history:
      'The newest Eagle: a clean-sheet update of the F-15 with fly-by-wire controls, a digital cockpit, the APG-82 AESA radar and the EPAWSS electronic-warfare suite. The Air Force bought it to replace worn-out F-15Cs quickly, and to carry the biggest air-to-air load of any fighter in service.',
    strengths: ['Carries 12 air-to-air missiles, more than any other jet here', 'Mach 2.5: the fastest top speed in the library', 'Big AESA radar and EPAWSS auto-countermeasures'],
    weaknesses: ['Large and heavy: bleeds energy in a slow turning fight', 'No IRST: needs its radar (which warns the target) to lock'],
    tactics: 'Fight long. Use the speed and the missile count to shoot first and keep shooting, and never let a lighter jet drag you into a slow knife fight.',
  },
  FA18EF: {
    nation: 'United States',
    region: 'usa',
    flag: ['#b22234', '#ffffff', '#3c3b6e'],
    manufacturer: 'Boeing (McDonnell Douglas)',
    generation: '4.5',
    firstFlight: '29 Nov 1995',
    inService: '1999',
    built: 'Over 600',
    operators: 'U.S. Navy, Royal Australian Air Force, Kuwait',
    carrier: true,
    nickname: 'Rhino',
    history:
      'A larger, longer-legged development of the original Hornet, built to fly off aircraft carriers. It became the backbone of U.S. Navy carrier air wings, with a strengthened airframe and landing gear for arrested landings and the APG-79 AESA radar.',
    strengths: ['Excellent nose authority at high angle of attack and low speed', 'Long combat range and a tough, carrier-rated airframe', 'Two seats: a weapons officer in the back (F model)'],
    weaknesses: ['Slowest top speed in the library (Mach 1.8)', 'Lowest thrust-to-weight: slow to regain energy', '7.5 G limit'],
    tactics: 'Use the high-AoA nose to point first in a close fight, but avoid long energy fights and drag races with faster jets.',
  },
  TYPHOON: {
    nation: 'UK · Germany · Italy · Spain',
    region: 'europe',
    flag: ['#012169', '#ffce00', '#009246', '#aa151b'],
    manufacturer: 'Eurofighter (Airbus, BAE Systems, Leonardo)',
    generation: '4.5',
    firstFlight: '27 Mar 1994',
    inService: '2003',
    built: 'About 600',
    operators: 'UK, Germany, Italy, Spain, Austria, Saudi Arabia, Oman, Kuwait, Qatar',
    carrier: false,
    nickname: 'Eurofighter',
    history:
      'Four European nations built it together as a pure air-superiority fighter: an unstable canard-delta flown by computer, with huge thrust for its weight. It climbs and accelerates superbly and carries the PIRATE infrared search-and-track for passive, silent targeting.',
    strengths: ['Outstanding acceleration and climb', 'PIRATE IRST locks targets without radar (no RWR warning for them)', 'Radar with a wide 100° field of regard'],
    weaknesses: ['No thrust vectoring: loses the post-stall fight to the Su-35S and F-22A', 'Fewer missiles than the F-15EX or Su-35S'],
    tactics: 'Climb high and fast, find targets silently with the IRST, and use the energy advantage to set up the shot rather than turning in circles.',
  },
  SU35: {
    nation: 'Russia',
    region: 'russia',
    flag: ['#ffffff', '#0039a6', '#d52b1e'],
    flagH: true,
    manufacturer: 'Sukhoi',
    generation: '4.5',
    firstFlight: '19 Feb 2008',
    inService: '2014',
    built: 'Over 100',
    operators: 'Russia, China',
    carrier: false,
    nickname: 'Flanker-E',
    history:
      'The final, most advanced Flanker before the Su-57: a deeply modernised Su-27 with 3D thrust-vectoring AL-41F1S engines, the powerful Irbis-E passive phased-array radar, the OLS-35 infrared search-and-track and a big internal fuel load.',
    strengths: ['3D thrust vectoring: post-stall moves nothing else can match', 'Irbis-E radar: the longest detection range in the library', 'Longest combat range, 12 missiles and an IRST'],
    weaknesses: ['Large radar signature: seen first by everyone', 'PESA radar scans slower than the AESAs'],
    tactics: 'Turn the fight into a slow-speed knife fight where thrust vectoring rules, and use the IRST to get close unannounced.',
  },
  RAFALE: {
    nation: 'France',
    region: 'europe',
    flag: ['#002395', '#ffffff', '#ed2939'],
    manufacturer: 'Dassault Aviation',
    generation: '4.5',
    firstFlight: '19 May 1991',
    inService: '2001',
    built: 'Over 250',
    operators: 'France, Egypt, Qatar, India, Greece, Croatia (more on order)',
    carrier: true,
    nickname: 'Squall',
    history:
      'France built its own "omnirole" fighter when it left the Eurofighter program: a compact canard-delta that does air defence, strike and nuclear deterrence, with a carrier version (Rafale M) for the French Navy. It carries the Meteor, a ramjet missile with the biggest no-escape zone of any in the game.',
    strengths: ['Meteor ramjet missile: the most energy at long range', 'Fastest roll rate and the SPECTRA EW suite with auto-countermeasures', 'OSF IRST for silent tracking'],
    weaknesses: ['Lower top speed (Mach 1.8) than the heavy fighters', 'Small airframe: less thrust than the F-22A or Typhoon'],
    tactics: 'Take the long shot with the Meteor, then stay agile: the Rafale is at its best rolling and pointing in the middle of the fight.',
  },
  F22: {
    nation: 'United States',
    region: 'usa',
    flag: ['#b22234', '#ffffff', '#3c3b6e'],
    manufacturer: 'Lockheed Martin (with Boeing)',
    generation: '5',
    firstFlight: '7 Sep 1997',
    inService: '2005',
    built: '195',
    operators: 'U.S. Air Force only',
    carrier: false,
    nickname: 'Raptor',
    history:
      'The first fifth-generation fighter: built for stealth, supercruise (supersonic flight without afterburner) and super-manoeuvrability with pitch-vectoring nozzles. Production stopped at 195 aircraft and export was never allowed; it is still the benchmark air-dominance fighter.',
    strengths: ['Supercruises at Mach 1.8 without afterburner', 'Best thrust-to-weight and climb in the library', '2D thrust vectoring for post-stall pitch moves'],
    weaknesses: ['Only 8 missiles, all carried internally', 'No IRST'],
    tactics: 'Arrive fast and high on dry thrust, take the first shots, and use the vectoring nozzles if anything gets close.',
  },
  MIG31: {
    nation: 'Russia',
    region: 'russia',
    flag: ['#ffffff', '#0039a6', '#d52b1e'],
    flagH: true,
    manufacturer: 'Mikoyan',
    generation: '4',
    firstFlight: '16 Sep 1975',
    inService: '1981',
    built: 'About 520',
    operators: 'Russia, Kazakhstan',
    carrier: false,
    nickname: 'Foxhound',
    history:
      'Built from the MiG-25 to guard the Soviet Union\'s vast northern frontier: a two-seat interceptor that dashes out at nearly three times the speed of sound and hunts bombers, cruise missiles and spy planes with the first phased-array radar ever fitted to a fighter. Four of them, sharing radar pictures by datalink, could watch a front hundreds of kilometres wide. The MiG-31BM upgrade added the Zaslon-M radar, digital cockpit displays and the R-37M, a missile that reaches out further than any other in service.',
    strengths: ['Fastest jet in the library: Mach 2.83 up high, Mach 1.23 on the deck', 'R-37M: the longest-range missile in the game', 'Zaslon-M radar tracks 24 targets'],
    weaknesses: ['Limited to 5 G: it cannot turn with any fighter', 'Huge radar and heat signature', 'No missile warning, weak jamming'],
    tactics: 'Climb high, go fast and shoot first from very far away with the R-37M, then turn away and run: nothing else can catch you, and nothing should get close enough to turn with you.',
  },
  SR71: {
    nation: 'United States',
    region: 'usa',
    flag: ['#b22234', '#ffffff', '#3c3b6e'],
    manufacturer: 'Lockheed Skunk Works',
    generation: '3',
    firstFlight: '22 Dec 1964',
    inService: '1966',
    built: '32',
    operators: 'US Air Force, NASA',
    carrier: false,
    nickname: 'Blackbird',
    history:
      'Kelly Johnson\'s Skunk Works built it in secret from titanium bought through shell companies, because nothing else could survive the heat of sustained Mach 3. For 24 years it photographed and recorded the world\'s most defended places from 80,000 ft and was never shot down: more than 4,000 missiles were fired at it, and every one fell behind. Crews called it the Habu. It still holds the speed record for an air-breathing crewed jet, 2,193 mph, set in 1976.',
    strengths: ['Fastest jet in the game: Mach 3.5, cruising above 80,000 ft', 'Outruns and outclimbs every missile and interceptor', 'Low radar return for its size; huge range'],
    weaknesses: ['Completely unarmed: no gun, no missiles, no flares', 'Turns like an ocean liner: 3 G limit and a vast turn radius', 'Long take-off roll; slow and heavy at low speed'],
    tactics: 'Never fight. Plan the route, climb to 75,000 ft and above, push past Mach 3 and let altitude and speed keep you alive. Turns cost miles: start them early. If a missile comes, accelerate and turn away; it will run out of energy long before you do.',
  },
};

export const REGION_NAME: Record<Region, string> = { usa: 'USA', europe: 'EUROPE', russia: 'RUSSIA' };
