// The Saturn V: the three-stage super heavy-lift launch vehicle that flew the
// Apollo missions. These are the vehicle's real figures; the menu shows them and
// the flight model (still to come) will be built on them.

export interface EngineSpec {
  name: string;
  count: number;
  /** thrust of one engine, kN (sea level where known, else vacuum) */
  thrustSL?: number;
  thrustVac: number;
  propellants: string;
  notes: string[];
}

export interface StageSpec {
  id: string;
  name: string;
  maker: string;
  length: number; // m
  diameter: number; // m
  grossMass: number; // kg, fully fuelled
  engines: EngineSpec;
  /** stage thrust, vacuum, kN */
  thrustVac: number;
  burnTime: string;
  notes: string[];
}

const F1: EngineSpec = {
  name: 'Rocketdyne F-1',
  count: 5,
  thrustSL: 6770,
  thrustVac: 38257 / 5,
  propellants: 'LOX / RP-1',
  notes: [
    'Each engine burns 2,578 kg of propellant a second: 1,789 kg of liquid oxygen and 788 kg of RP-1.',
    'All five together burn 12,890 kg a second at liftoff.',
    'The single-shaft turbopump makes 55,000 bhp at 5,550 rpm, feeding the chamber at 982 psia.',
    'Chamber temperature: 3,204 °C.',
  ],
};
const J2: EngineSpec = {
  name: 'Rocketdyne J-2',
  count: 5,
  thrustVac: 5165 / 5,
  propellants: 'LOX / LH₂',
  notes: ['Chamber pressure 763 psi (5.26 MPa), expansion ratio 27.5 : 1.'],
};

export const SATURN_V = {
  name: 'Saturn V',
  height: 110.6, // m, base of the first stage to the tip of the escape tower
  diameter: 10.1,
  liftoffMass: 2_965_000, // kg (2,800,000 to 2,965,000)
  liftoffThrust: 34_500, // kN, 7.6 million lbf
  payloadLEO: 140_000, // kg
  payloadTLI: 43_500, // kg
  launches: 13,
  service: '1967 – 1973',
  stages: [
    {
      id: 'S-IC',
      name: 'First stage',
      maker: 'Boeing',
      length: 42.87,
      diameter: 10.06,
      grossMass: 2_217_285,
      engines: F1,
      thrustVac: 38_257,
      burnTime: '≈ 160 s',
      notes: [
        'LOX tank: 1.25 million litres at −183 °C, with four anti-vortex baffles.',
        'Fuel tank: 768,000 litres of RP-1 kerosene.',
        'Corrugated aluminium intertank carries the weight of the LOX tank above it.',
      ],
    },
    {
      id: 'S-II',
      name: 'Second stage',
      maker: 'North American Aviation',
      length: 24.8,
      diameter: 10.0,
      grossMass: 480_000,
      engines: J2,
      thrustVac: 5_165,
      burnTime: '≈ 6 min',
      notes: [
        'LOX and liquid hydrogen share one insulated common bulkhead, saving about 4,500 kg.',
        'The bulkhead is a fibreglass honeycomb 2.5 cm thick between two aluminium faces, so the −253 °C hydrogen never freezes the −183 °C oxygen.',
      ],
    },
    {
      id: 'S-IVB',
      name: 'Third stage',
      maker: 'Douglas Aircraft Company',
      length: 17.8,
      diameter: 6.6,
      grossMass: 119_920,
      engines: { ...J2, count: 1, thrustVac: 1033, notes: ['Restartable: a helium tank re-pressurises the valves and spins up the turbopumps in vacuum for trans-lunar injection.'] },
      thrustVac: 1033,
      burnTime: 'twice: orbit insertion, then trans-lunar injection',
      notes: [],
    },
  ] as StageSpec[],
  instrumentUnit: {
    diameter: 6.6,
    height: 0.91,
    mass: 1996,
    computer: 'IBM Launch Vehicle Digital Computer: 32,768 words of 26 bits, 12,195 instructions a second',
    platform: 'Bendix ST-124-M3 three-gimbal inertial platform on nitrogen gas bearings',
    telemetry: 'About 900 VHF channels',
    cooling: 'Water-methanol through cold plates at 15 °C',
  },
  flight: {
    maxQ: { time: 84, altitude: 13_000 }, // s, m
    maxG: 3.91, // just before the outboard F-1s shut down
    pogo: 'Helium-charged accumulators in the LOX lines damp the POGO vibration.',
  },
};
