// The two new launch vehicles, with their real figures.
//
// SpaceX Falcon Heavy (Block 5): three Falcon 9 first-stage cores strapped
// side by side, 27 Merlin 1D engines and 22.8 MN at liftoff, the most powerful
// rocket flying until Starship; the two side boosters fly back and land on
// Landing Zones 1 and 2 at the Cape within seconds of each other. It launched
// NASA's Europa Clipper on 14 October 2024 (the centre core was expended).
//
// NASA Space Launch System, Block 1: an 8.4 m core stage with four RS-25
// engines left over from the Space Shuttle, two five-segment solid rocket
// boosters (the largest ever flown), the Interim Cryogenic Propulsion Stage on
// top and Orion with its European Service Module: 98 m, 2,600 t, 39.1 MN at
// liftoff, more than the Saturn V. Artemis I flew it round the Moon in 2022;
// Artemis II takes four astronauts round the far side and home.

export const G0 = 9.80665;

export interface EngineDef {
  name: string;
  count: number;
  /** thrust of one engine, N */
  thrustSL: number;
  thrustVac: number;
  /** specific impulse, s */
  ispSL: number;
  ispVac: number;
  /** lowest throttle (1 = cannot throttle) */
  minThrottle: number;
  kind: 'kerolox' | 'hydrolox' | 'solid' | 'kerolox-vac' | 'hydrolox-vac' | 'hypergolic';
}

export interface StageDef {
  name: string;
  /** dry mass, kg */
  dry: number;
  /** propellant, kg */
  prop: number;
  engine: EngineDef;
  length: number;
  diameter: number;
}

export interface VehicleDef {
  id: 'falcon-heavy' | 'sls';
  name: string;
  maker: string;
  height: number;
  liftoffMass: number;
  liftoffThrust: number;
  /** strap-on boosters (how many, each) */
  boosters: { count: number; stage: StageDef; land: boolean };
  core: StageDef;
  upper: StageDef;
  /** the payload and what protects it on the way up */
  payload: { name: string; mass: number };
  fairing: { name: string; mass: number; jettisonAlt: number };
  /** frontal area for drag, m^2, and drag coefficient */
  area: number;
  cd: number;
  facts: string[];
}

const MERLIN: EngineDef = { name: 'Merlin 1D', count: 9, thrustSL: 845_000, thrustVac: 914_000, ispSL: 282, ispVac: 311, minThrottle: 0.4, kind: 'kerolox' };
const MVAC: EngineDef = { name: 'Merlin 1D Vacuum', count: 1, thrustSL: 0, thrustVac: 981_000, ispSL: 0, ispVac: 348, minThrottle: 0.39, kind: 'kerolox-vac' };
const RS25: EngineDef = { name: 'Aerojet Rocketdyne RS-25', count: 4, thrustSL: 1_859_000, thrustVac: 2_279_000, ispSL: 366, ispVac: 452, minThrottle: 0.67, kind: 'hydrolox' };
const RSRMV: EngineDef = { name: 'Five-segment solid rocket booster', count: 1, thrustSL: 16_000_000, thrustVac: 16_800_000, ispSL: 242, ispVac: 268, minThrottle: 1, kind: 'solid' };
const RL10: EngineDef = { name: 'Aerojet Rocketdyne RL10B-2', count: 1, thrustSL: 0, thrustVac: 110_100, ispSL: 0, ispVac: 465.5, minThrottle: 1, kind: 'hydrolox-vac' };

export const FALCON_HEAVY: VehicleDef = {
  id: 'falcon-heavy',
  name: 'Falcon Heavy',
  maker: 'SpaceX',
  height: 70,
  liftoffMass: 1_420_788,
  liftoffThrust: 22_819_000,
  boosters: { count: 2, stage: { name: 'Side booster', dry: 22_200, prop: 411_000, engine: MERLIN, length: 47.7, diameter: 3.66 }, land: true },
  core: { name: 'Centre core', dry: 25_600, prop: 411_000, engine: MERLIN, length: 47.7, diameter: 3.66 },
  upper: { name: 'Second stage', dry: 4_000, prop: 111_500, engine: MVAC, length: 13.8, diameter: 3.66 },
  payload: { name: 'Europa Clipper', mass: 6_065 },
  fairing: { name: 'Payload fairing', mass: 1_900, jettisonAlt: 112_000 },
  area: 3 * Math.PI * 1.83 * 1.83,
  cd: 0.5,
  facts: [
    'Three Falcon 9 cores side by side: 27 Merlin engines, 22.8 MN at liftoff.',
    'The side boosters fly back and land at the Cape, seconds apart, 8 minutes after liftoff.',
    'First flight 6 February 2018, with a Tesla Roadster as the payload.',
  ],
};

export const SLS: VehicleDef = {
  id: 'sls',
  name: 'Space Launch System',
  maker: 'NASA · Boeing · Northrop Grumman',
  height: 98.3,
  liftoffMass: 2_608_000,
  liftoffThrust: 39_144_000,
  boosters: { count: 2, stage: { name: 'Solid rocket booster', dry: 98_000, prop: 631_000, engine: RSRMV, length: 54, diameter: 3.71 }, land: false },
  core: { name: 'Core stage', dry: 85_270, prop: 987_000, engine: RS25, length: 64.6, diameter: 8.4 },
  upper: { name: 'Interim Cryogenic Propulsion Stage', dry: 3_490, prop: 27_220, engine: RL10, length: 13.7, diameter: 5.1 },
  payload: { name: 'Orion and its European Service Module', mass: 26_520 },
  fairing: { name: 'Launch abort system', mass: 7_700, jettisonAlt: 90_000 },
  area: Math.PI * 4.2 * 4.2 + 2 * Math.PI * 1.86 * 1.86,
  cd: 0.55,
  facts: [
    'The core stage\'s four RS-25s flew on the Space Shuttle; they burn for over eight minutes.',
    'Each solid rocket booster gives 16 MN for two minutes: three-quarters of the liftoff thrust.',
    'More thrust at liftoff than the Saturn V: 39.1 MN.',
  ],
};

/** thrust (N) and mass flow (kg/s) of an engine set at an ambient pressure (Pa) */
export function engineOut(e: EngineDef, n: number, throttle: number, pressure: number): { thrust: number; mdot: number } {
  if (n <= 0 || throttle <= 0) return { thrust: 0, mdot: 0 };
  const k = Math.max(0, Math.min(1, pressure / 101_325));
  // vacuum engines would flow-separate at sea level; they only fire up high
  const vac = e.thrustSL <= 0;
  const thrust = vac ? e.thrustVac * (1 - k * 3) : e.thrustVac - (e.thrustVac - e.thrustSL) * k;
  const isp = vac ? e.ispVac : e.ispVac - (e.ispVac - e.ispSL) * k;
  const T = Math.max(0, thrust) * n * throttle;
  return { thrust: T, mdot: T / Math.max(1, isp * G0) };
}
