// The six aircraft in the game. Every number here comes from the
// published specifications given in the design brief; aerodynamic
// coefficients are engineering estimates tuned so the real top speeds,
// ceilings and ranges fall out of the physics.

import { FT, LB, LBF } from '../core/constants';
import type { MissileType } from '../weapons/weaponSpecs';

export type AircraftType = 'F15EX' | 'FA18EF' | 'TYPHOON' | 'SU35' | 'RAFALE' | 'F22';
export const AIRCRAFT_TYPES: AircraftType[] = ['F15EX', 'FA18EF', 'TYPHOON', 'SU35', 'RAFALE', 'F22'];

export type StoreType = MissileType | 'TANK';

export interface GunSpec {
  name: string;
  caliberMm: number;
  rounds: number;
  rpm: number;
  muzzleVelocity: number; // m/s
  damage: number; // per hit
  dispersionMil: number;
  /** gun port position in body frame (x right, y up, z forward negative) */
  port: [number, number, number];
}

export interface StationDef {
  id: number;
  label: string;
  /** body-frame position of the store's centre (metres) */
  pos: [number, number, number];
  /** what can hang here */
  allowed: StoreType[];
  /** visual: rail (wingtip / fuselage launcher) or pylon */
  /** internal: carried in a closed weapons bay (not drawn, no drag) */
  mount: 'rail' | 'pylon' | 'conformal' | 'semi-recessed' | 'internal';
  /**
   * Height of the wing underside at this station. When given, each store
   * hangs its own radius below it (a tank lower than a missile) instead of
   * sitting at pos[1].
   */
  hang?: number;
  /**
   * Twin-rail rack: x of the shared pylon's centre line. The missile rides on
   * a shoulder rail beside the pylon (two missiles side by side, noses level,
   * like LAU-128s on an F-15 pylon); a fuel tank hangs from the pylon centre.
   */
  rack?: number;
}

export interface LoadoutPreset {
  id: string;
  name: string;
  /** station id -> store */
  stores: Record<number, StoreType>;
}

export interface RadarSpec {
  name: string;
  kind: 'AESA' | 'AESA/MSA' | 'PESA';
  /** detection range vs. a 5 m^2 fighter, nautical miles */
  rangeNm: number;
  azLimitDeg: number;
  elLimitDeg: number;
  maxTracks: number;
  /** full-scan frame time in seconds (AESA is fast) */
  frameTime: number;
}

export interface IrstSpec {
  name: string;
  rangeNm: number; // vs afterburning tail-on target
  fovDeg: number;
}

export interface EwSpec {
  name: string;
  /** missile approach warning (detects IR missile launches) */
  maws: boolean;
  /** reduces enemy radar detection range / missile seeker robustness (0..1) */
  jamming: number;
  /** automatically dispenses countermeasures on launch detection */
  autoDispense: boolean;
}

export interface AircraftSpec {
  type: AircraftType;
  name: string;
  shortName: string;
  role: string;
  crew: number;
  description: string;
  // dimensions (display in feet, sim in metres)
  lengthFt: number;
  wingspanFt: number;
  heightFt: number;
  length: number;
  span: number;
  height: number;
  // weights
  emptyMass: number; // kg
  internalFuel: number; // kg
  maxTakeoff: number; // kg
  maxTakeoffLb: number;
  payloadLb: number;
  // aerodynamics
  wingArea: number; // m^2
  cd0: number;
  waveDragPeak: number; // CD0 multiplier at Mach ~1.1
  waveDragHigh: number; // multiplier at max Mach
  kInduced: number;
  clAlpha: number; // per radian (subsonic)
  clMax: number;
  alphaMaxDeg: number; // FBW alpha limit
  maxMach: number;
  ceilingFt: number;
  maxIasKts: number;
  // engines
  engineName: string;
  engines: number;
  thrustMil: number; // N per engine
  thrustAb: number; // N per engine
  thrustMilLbf: number;
  thrustAbLbf: number;
  tsfcMil: number; // kg/(N*h) equiv via lb/(lbf*h)
  tsfcAb: number;
  ramFactor: number; // thrust growth with Mach in AB
  spool: number; // 1/s
  // handling
  gLimit: number; // FBW limit
  gOverride: number; // with G-limiter override (paddle switch)
  gStructural: number; // structural failure
  gNeg: number;
  rollRate: number; // deg/s max
  pitchRate: number; // deg/s max
  cornerKts: number; // best sustained / instantaneous turn speed (AI)
  rotateKts: number;
  approachKts: number;
  speedbrakeCd: number;
  // combat
  combatRangeNm: number;
  hardpoints: number;
  maxAAM: number;
  /** the jet's own missiles: radar-guided (Fox 3) and infrared (Fox 2) */
  missiles: { radar: MissileType; ir: MissileType };
  /** 3D thrust vectoring: nozzle deflection limit in degrees (0 = none) */
  tvcDeg: number;
  /** thrust vectoring in pitch only (2D nozzles) instead of pitch, yaw and roll */
  tvcPitchOnly?: boolean;
  gun: GunSpec;
  stations: StationDef[];
  loadouts: LoadoutPreset[];
  radar: RadarSpec;
  irst: IrstSpec | null;
  ew: EwSpec;
  flightControl: string;
  chaff: number;
  flares: number;
  /** radar cross section (m^2), frontal; drives detection range */
  rcs: number;
  /** IR signature scale */
  irSignature: number;
  /** gear geometry: nose z, main z (body frame), main half-track, gear height */
  gear: { nose: number; main: number; track: number; height: number };
  /** approximate hit-sphere layout for bullets */
  hitRadius: number;
  // paint
  paint: { top: string; bottom: string; accent: string };
}

const lbf = (v: number) => v * LBF;
const kg = (lb: number) => lb * LB;

const AIM120 = 'AIM120D' as const;
const AIM9 = 'AIM9X' as const;
const TANK = 'TANK' as const;
const R77 = 'R77M' as const;
const R74 = 'R74M' as const;
const MTR = 'METEOR' as const;
const MICA = 'MICAIR' as const;
/** fore-aft centre of the wing missile racks: every rack's missiles sit nose-level */
const F15_RZ = 1.3;
const FA18_RZ = 1.8;

// ---------------------------------------------------------------------------
// F-15EX Eagle II
// ---------------------------------------------------------------------------
const F15EX: AircraftSpec = {
  type: 'F15EX',
  name: 'F-15EX Eagle II',
  shortName: 'F-15EX',
  role: 'Two-seat multirole air superiority fighter',
  crew: 2,
  description:
    'The heaviest hitter in the theater. Mach 2.5, a 60,000 ft ceiling and 23 hardpoints carrying up to 12 air-to-air missiles. AN/APG-82(V)1 AESA radar, EPAWSS electronic warfare suite and an all-digital fly-by-wire system.',
  lengthFt: 63.8,
  wingspanFt: 42.8,
  heightFt: 18.5,
  length: 63.8 * FT,
  span: 42.8 * FT,
  height: 18.5 * FT,
  emptyMass: kg(31700),
  internalFuel: kg(13550 + 9750), // internal + conformal fuel tanks
  maxTakeoff: kg(81000),
  maxTakeoffLb: 81000,
  payloadLb: 29000,
  wingArea: 56.5,
  cd0: 0.0205,
  waveDragPeak: 2.15,
  waveDragHigh: 1.6,
  kInduced: 0.122,
  clAlpha: 3.9,
  clMax: 1.85,
  alphaMaxDeg: 30,
  maxMach: 2.5,
  ceilingFt: 60000,
  maxIasKts: 800,
  engineName: '2 x General Electric F110-GE-129',
  engines: 2,
  thrustMil: lbf(17155),
  thrustAb: lbf(29500),
  thrustMilLbf: 17155,
  thrustAbLbf: 29500,
  tsfcMil: 0.74,
  tsfcAb: 1.95,
  ramFactor: 0.62,
  spool: 1.3,
  gLimit: 9.0,
  gOverride: 11.0,
  gStructural: 13.5,
  gNeg: -3,
  rollRate: 250,
  pitchRate: 28,
  cornerKts: 350,
  rotateKts: 150,
  approachKts: 160,
  speedbrakeCd: 0.07,
  combatRangeNm: 687,
  hardpoints: 23,
  maxAAM: 12,
  missiles: { radar: AIM120, ir: AIM9 },
  tvcDeg: 0,
  gun: {
    name: 'M61A1 Vulcan 20mm rotary cannon',
    caliberMm: 20,
    rounds: 510,
    rpm: 6000,
    muzzleVelocity: 1050,
    damage: 7,
    dispersionMil: 4.5,
    port: [2.0, 0.5, -3.2],
  },
  stations: [
    { id: 1, label: 'LW OB-O', pos: [-4.45, -0.15, F15_RZ], allowed: [AIM9, AIM120], mount: 'pylon', hang: 0.09, rack: -4.15 },
    { id: 2, label: 'LW OB-I', pos: [-3.85, -0.15, F15_RZ], allowed: [AIM120, AIM9], mount: 'pylon', hang: 0.09, rack: -4.15 },
    { id: 3, label: 'LW IB-O', pos: [-3.05, -0.15, F15_RZ], allowed: [AIM120, AIM9, TANK], mount: 'pylon', hang: 0.09, rack: -2.75 },
    { id: 4, label: 'LW IB-I', pos: [-2.45, -0.15, F15_RZ], allowed: [AIM120, AIM9], mount: 'pylon', hang: 0.09, rack: -2.75 },
    { id: 5, label: 'L CFT-F', pos: [-1.55, -0.95, -1.4], allowed: [AIM120], mount: 'conformal' },
    { id: 6, label: 'L CFT-A', pos: [-1.55, -0.95, 1.9], allowed: [AIM120], mount: 'conformal' },
    { id: 7, label: 'CL', pos: [0, -1.2, 0.4], allowed: [TANK], mount: 'pylon' },
    { id: 8, label: 'R CFT-A', pos: [1.55, -0.95, 1.9], allowed: [AIM120], mount: 'conformal' },
    { id: 9, label: 'R CFT-F', pos: [1.55, -0.95, -1.4], allowed: [AIM120], mount: 'conformal' },
    { id: 10, label: 'RW IB-I', pos: [2.45, -0.15, F15_RZ], allowed: [AIM120, AIM9], mount: 'pylon', hang: 0.09, rack: 2.75 },
    { id: 11, label: 'RW IB-O', pos: [3.05, -0.15, F15_RZ], allowed: [AIM120, AIM9, TANK], mount: 'pylon', hang: 0.09, rack: 2.75 },
    { id: 12, label: 'RW OB-I', pos: [3.85, -0.15, F15_RZ], allowed: [AIM120, AIM9], mount: 'pylon', hang: 0.09, rack: 4.15 },
    { id: 13, label: 'RW OB-O', pos: [4.45, -0.15, F15_RZ], allowed: [AIM9, AIM120], mount: 'pylon', hang: 0.09, rack: 4.15 },
  ],
  loadouts: [
    {
      id: 'eagle-12',
      name: 'EAGLE II "MISSILE TRUCK" — 8x AIM-120D, 4x AIM-9X',
      stores: { 1: AIM9, 2: AIM120, 3: AIM120, 4: AIM9, 5: AIM120, 6: AIM120, 8: AIM120, 9: AIM120, 10: AIM9, 11: AIM120, 12: AIM120, 13: AIM9 },
    },
    {
      id: 'eagle-bvr',
      name: 'LONG REACH — 10x AIM-120D, 2x AIM-9X',
      stores: { 1: AIM9, 2: AIM120, 3: AIM120, 4: AIM120, 5: AIM120, 6: AIM120, 8: AIM120, 9: AIM120, 10: AIM120, 11: AIM120, 12: AIM120, 13: AIM9 },
    },
    {
      id: 'eagle-std',
      name: 'CAP STANDARD — 6x AIM-120D, 4x AIM-9X, CL TANK',
      stores: { 1: AIM9, 4: AIM9, 5: AIM120, 6: AIM120, 7: TANK, 8: AIM120, 9: AIM120, 10: AIM9, 13: AIM9, 3: AIM120, 11: AIM120 },
    },
    {
      id: 'eagle-ferry',
      name: 'FERRY — 3x TANKS, 4x AIM-9X',
      stores: { 1: AIM9, 3: TANK, 4: AIM9, 7: TANK, 10: AIM9, 11: TANK, 13: AIM9 },
    },
  ],
  radar: { name: 'AN/APG-82(V)1 AESA', kind: 'AESA', rangeNm: 105, azLimitDeg: 60, elLimitDeg: 60, maxTracks: 16, frameTime: 1.2 },
  irst: null,
  ew: { name: 'EPAWSS (Eagle Passive/Active Warning Survivability System)', maws: true, jamming: 0.3, autoDispense: true },
  flightControl: 'Digital fly-by-wire',
  chaff: 120,
  flares: 60,
  rcs: 10,
  irSignature: 1.15,
  gear: { nose: -5.5, main: 1.2, track: 1.4, height: 2.05 },
  hitRadius: 5.5,
  paint: { top: '#5d646a', bottom: '#737a80', accent: '#3e4448' },
};

// ---------------------------------------------------------------------------
// F/A-18E/F Super Hornet
// ---------------------------------------------------------------------------
const FA18: AircraftSpec = {
  type: 'FA18EF',
  name: 'F/A-18E/F Super Hornet',
  shortName: 'F/A-18E/F',
  role: 'Carrier-capable two-seat strike fighter',
  crew: 2,
  description:
    'Long-legged and brutally agile at low speed. 1,275 NM combat range, Mach 1.8, excellent high angle-of-attack authority from its LEX. Internal M61A2 Vulcan cannon and 11 weapon stations.',
  lengthFt: 60.3,
  wingspanFt: 44.9,
  heightFt: 16,
  length: 60.3 * FT,
  span: 44.9 * FT,
  height: 16 * FT,
  emptyMass: kg(32081),
  internalFuel: kg(14700),
  maxTakeoff: kg(66000),
  maxTakeoffLb: 66000,
  payloadLb: 17750,
  wingArea: 46.45,
  cd0: 0.0235,
  waveDragPeak: 2.45,
  waveDragHigh: 2.1,
  kInduced: 0.098,
  clAlpha: 4.3,
  clMax: 2.0,
  alphaMaxDeg: 42,
  maxMach: 1.8,
  ceilingFt: 50000,
  maxIasKts: 750,
  engineName: '2 x General Electric F414-GE-400',
  engines: 2,
  thrustMil: lbf(14770),
  thrustAb: lbf(22000),
  thrustMilLbf: 14770,
  thrustAbLbf: 22000,
  tsfcMil: 0.78,
  tsfcAb: 1.85,
  ramFactor: 0.62,
  spool: 1.5,
  gLimit: 7.5,
  gOverride: 10.0,
  gStructural: 12.0,
  gNeg: -3,
  rollRate: 220,
  pitchRate: 32,
  cornerKts: 330,
  rotateKts: 145,
  approachKts: 145,
  speedbrakeCd: 0.05,
  combatRangeNm: 1275,
  hardpoints: 11,
  maxAAM: 10,
  missiles: { radar: AIM120, ir: AIM9 },
  tvcDeg: 0,
  gun: {
    name: 'M61A2 Vulcan 20mm rotary cannon',
    caliberMm: 20,
    rounds: 412,
    rpm: 6000,
    muzzleVelocity: 1050,
    damage: 7,
    dispersionMil: 4.5,
    port: [0, 0.55, -8.2],
  },
  stations: [
    { id: 1, label: 'LWT', pos: [-6.75, -0.1, 2.4], allowed: [AIM9], mount: 'rail' },
    { id: 2, label: 'LW OB', pos: [-5.1, -0.85, 2.0], allowed: [AIM120, AIM9], mount: 'pylon', hang: -0.035 },
    // station 3: LAU-115 with two LAU-127 shoulder rails (a tank hangs from the pylon centre)
    { id: 3, label: 'LW MID-O', pos: [-4.2, -0.3, FA18_RZ], allowed: [AIM120, AIM9, TANK], mount: 'pylon', hang: -0.04, rack: -3.9 },
    { id: 4, label: 'LW MID-I', pos: [-3.6, -0.3, FA18_RZ], allowed: [AIM120, TANK], mount: 'pylon', hang: -0.04, rack: -3.9 },
    { id: 5, label: 'L FUS', pos: [-0.85, -1.1, -1.4], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 6, label: 'CL', pos: [0, -1.35, 0.2], allowed: [TANK], mount: 'pylon' },
    { id: 7, label: 'R FUS', pos: [0.85, -1.1, -1.4], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 8, label: 'RW MID-I', pos: [3.6, -0.3, FA18_RZ], allowed: [AIM120, TANK], mount: 'pylon', hang: -0.04, rack: 3.9 },
    { id: 9, label: 'RW MID-O', pos: [4.2, -0.3, FA18_RZ], allowed: [AIM120, AIM9, TANK], mount: 'pylon', hang: -0.04, rack: 3.9 },
    { id: 10, label: 'RW OB', pos: [5.1, -0.85, 2.0], allowed: [AIM120, AIM9], mount: 'pylon', hang: -0.035 },
    { id: 11, label: 'RWT', pos: [6.75, -0.1, 2.4], allowed: [AIM9], mount: 'rail' },
  ],
  loadouts: [
    {
      id: 'hornet-ss',
      name: 'SWING FIGHTER — 6x AIM-120D, 2x AIM-9X',
      stores: { 1: AIM9, 3: AIM120, 4: AIM120, 5: AIM120, 7: AIM120, 8: AIM120, 9: AIM120, 11: AIM9 },
    },
    {
      id: 'hornet-max',
      name: 'MAX AAM — 8x AIM-120D, 2x AIM-9X',
      stores: { 1: AIM9, 2: AIM120, 3: AIM120, 4: AIM120, 5: AIM120, 7: AIM120, 8: AIM120, 9: AIM120, 10: AIM120, 11: AIM9 },
    },
    {
      id: 'hornet-dog',
      name: 'DOGFIGHT — 2x AIM-120D, 6x AIM-9X',
      stores: { 1: AIM9, 2: AIM9, 3: AIM9, 5: AIM120, 7: AIM120, 9: AIM9, 10: AIM9, 11: AIM9 },
    },
    {
      id: 'hornet-long',
      name: 'EXTENDED CAP — 4x AIM-120D, 2x AIM-9X, 3x TANKS',
      stores: { 1: AIM9, 3: TANK, 5: AIM120, 6: TANK, 7: AIM120, 9: TANK, 2: AIM120, 10: AIM120, 11: AIM9 },
    },
  ],
  radar: { name: 'AN/APG-79 AESA', kind: 'AESA', rangeNm: 85, azLimitDeg: 60, elLimitDeg: 60, maxTracks: 12, frameTime: 1.4 },
  irst: null,
  ew: { name: 'AN/ALR-67(V)3 RWR + ALQ-214 IDECM', maws: false, jamming: 0.18, autoDispense: false },
  flightControl: 'Digital fly-by-wire (quad redundant)',
  chaff: 60,
  flares: 60,
  rcs: 3.5,
  irSignature: 1.0,
  gear: { nose: -5.6, main: 1.0, track: 1.6, height: 1.95 },
  hitRadius: 5.4,
  paint: { top: '#8a9197', bottom: '#a4aaae', accent: '#5f666b' },
};

// ---------------------------------------------------------------------------
// Eurofighter Typhoon
// ---------------------------------------------------------------------------
const TYPHOON: AircraftSpec = {
  type: 'TYPHOON',
  name: 'Eurofighter Typhoon',
  shortName: 'Typhoon',
  role: 'Single-seat canard-delta air superiority fighter',
  crew: 1,
  description:
    'Supercruising canard-delta with the best thrust-to-weight in the theater. Mach 2.0, 55,000 ft ceiling, CAPTOR radar plus the PIRATE passive IRST that can track targets without lighting up their warning receivers. Internal 27 mm Mauser BK-27.',
  lengthFt: 52.4,
  wingspanFt: 35.9,
  heightFt: 17.3,
  length: 52.4 * FT,
  span: 35.9 * FT,
  height: 17.3 * FT,
  emptyMass: kg(24250),
  internalFuel: kg(11000),
  maxTakeoff: kg(51800),
  maxTakeoffLb: 51800,
  payloadLb: 16500,
  wingArea: 51.2,
  cd0: 0.019,
  waveDragPeak: 2.05,
  waveDragHigh: 1.8,
  kInduced: 0.16,
  clAlpha: 3.5,
  clMax: 1.55,
  alphaMaxDeg: 28,
  maxMach: 2.0,
  ceilingFt: 55000,
  maxIasKts: 750,
  engineName: '2 x Eurojet EJ200',
  engines: 2,
  thrustMil: lbf(13490),
  thrustAb: lbf(20233),
  thrustMilLbf: 13490,
  thrustAbLbf: 20233,
  tsfcMil: 0.8,
  tsfcAb: 1.75,
  ramFactor: 0.55,
  spool: 1.6,
  gLimit: 9.0,
  gOverride: 11.0,
  gStructural: 13.0,
  gNeg: -3,
  rollRate: 270,
  pitchRate: 30,
  cornerKts: 340,
  rotateKts: 135,
  approachKts: 140,
  speedbrakeCd: 0.055,
  combatRangeNm: 1564,
  hardpoints: 13,
  maxAAM: 10,
  missiles: { radar: AIM120, ir: AIM9 },
  tvcDeg: 0,
  gun: {
    name: 'Mauser BK-27 27mm revolver cannon',
    caliberMm: 27,
    rounds: 150,
    rpm: 1700,
    muzzleVelocity: 1025,
    damage: 16,
    dispersionMil: 3.5,
    port: [0.75, -0.3, -3.6],
  },
  stations: [
    { id: 1, label: 'LW OB', pos: [-5.1, -0.35, 4.2], allowed: [AIM9], mount: 'rail', hang: -0.44 },
    { id: 2, label: 'LW MID', pos: [-3.9, -0.6, 3.2], allowed: [AIM120, AIM9], mount: 'pylon', hang: -0.44 },
    { id: 3, label: 'LW IB', pos: [-2.8, -0.7, 2.6], allowed: [AIM120, AIM9, TANK], mount: 'pylon', hang: -0.45 },
    { id: 4, label: 'L FUS-F', pos: [-0.9, -1.0, -1.2], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 5, label: 'L FUS-A', pos: [-0.9, -1.0, 1.6], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 6, label: 'CL', pos: [0, -1.25, 0.4], allowed: [TANK], mount: 'pylon' },
    { id: 7, label: 'R FUS-A', pos: [0.9, -1.0, 1.6], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 8, label: 'R FUS-F', pos: [0.9, -1.0, -1.2], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 9, label: 'RW IB', pos: [2.8, -0.7, 2.6], allowed: [AIM120, AIM9, TANK], mount: 'pylon', hang: -0.45 },
    { id: 10, label: 'RW MID', pos: [3.9, -0.6, 3.2], allowed: [AIM120, AIM9], mount: 'pylon', hang: -0.44 },
    { id: 11, label: 'RW OB', pos: [5.1, -0.35, 4.2], allowed: [AIM9], mount: 'rail', hang: -0.44 },
  ],
  loadouts: [
    {
      id: 'typhoon-aa',
      name: 'AIR DOMINANCE — 6x AIM-120D, 2x AIM-9X',
      stores: { 1: AIM9, 2: AIM120, 4: AIM120, 5: AIM120, 7: AIM120, 8: AIM120, 10: AIM120, 11: AIM9 },
    },
    {
      id: 'typhoon-max',
      name: 'MAX AAM — 8x AIM-120D, 2x AIM-9X',
      stores: { 1: AIM9, 2: AIM120, 3: AIM120, 4: AIM120, 5: AIM120, 7: AIM120, 8: AIM120, 9: AIM120, 10: AIM120, 11: AIM9 },
    },
    {
      id: 'typhoon-wvr',
      name: 'KNIFE FIGHT — 4x AIM-120D, 6x AIM-9X',
      stores: { 1: AIM9, 2: AIM9, 3: AIM9, 4: AIM120, 5: AIM120, 7: AIM120, 8: AIM120, 9: AIM9, 10: AIM9, 11: AIM9 },
    },
    {
      id: 'typhoon-long',
      name: 'LONG RANGE CAP — 4x AIM-120D, 2x AIM-9X, 3x TANKS',
      stores: { 1: AIM9, 3: TANK, 4: AIM120, 5: AIM120, 6: TANK, 7: AIM120, 8: AIM120, 9: TANK, 11: AIM9 },
    },
  ],
  radar: { name: 'CAPTOR-E AESA (mechanical repositioner)', kind: 'AESA/MSA', rangeNm: 90, azLimitDeg: 100, elLimitDeg: 60, maxTracks: 12, frameTime: 1.6 },
  irst: { name: 'PIRATE passive IRST', rangeNm: 40, fovDeg: 70 },
  ew: { name: 'Praetorian DASS', maws: true, jamming: 0.22, autoDispense: false },
  flightControl: 'Quadruplex digital fly-by-wire, carefree handling',
  chaff: 80,
  flares: 60,
  rcs: 1.2,
  irSignature: 0.9,
  gear: { nose: -4.4, main: 1.4, track: 1.3, height: 1.9 },
  hitRadius: 4.8,
  paint: { top: '#7f878d', bottom: '#98a0a5', accent: '#555c61' },
};

// ---------------------------------------------------------------------------
// Sukhoi Su-35S
// ---------------------------------------------------------------------------
const SU35: AircraftSpec = {
  type: 'SU35',
  name: 'Sukhoi Su-35S',
  shortName: 'Su-35S',
  role: 'Twin-engine super-manoeuvrable air superiority and multirole fighter',
  crew: 1,
  description:
    'The Flanker. Two Saturn AL-41F1S engines with 3D thrust vectoring let it point its nose far past the stall and turn at speeds where the others fall out of the sky. Mach 2.25, 59,060 ft ceiling, N035 Irbis-E PESA radar, OLS-35 IRST and a 30 mm GSh-30-1. Carries its own R-77M and R-74M missiles.',
  lengthFt: 71.9,
  wingspanFt: 49,
  heightFt: 19.4,
  length: 71.9 * FT,
  span: 49 * FT,
  height: 19.4 * FT,
  emptyMass: kg(40570),
  internalFuel: kg(25350),
  maxTakeoff: kg(76059),
  maxTakeoffLb: 76059,
  payloadLb: 17630,
  wingArea: 62,
  cd0: 0.0205,
  waveDragPeak: 1.95,
  waveDragHigh: 1.6,
  kInduced: 0.098,
  clAlpha: 3.9,
  clMax: 2.2,
  alphaMaxDeg: 34,
  maxMach: 2.25,
  ceilingFt: 59060,
  maxIasKts: 760,
  engineName: '2 x Saturn AL-41F1S (3D thrust vectoring)',
  engines: 2,
  thrustMil: lbf(19400),
  thrustAb: lbf(32000),
  thrustMilLbf: 19400,
  thrustAbLbf: 32000,
  tsfcMil: 0.76,
  tsfcAb: 1.9,
  ramFactor: 0.68,
  spool: 1.35,
  gLimit: 9.0,
  gOverride: 11.0,
  gStructural: 13.5,
  gNeg: -3,
  rollRate: 270,
  pitchRate: 36,
  cornerKts: 310,
  rotateKts: 150,
  approachKts: 160,
  speedbrakeCd: 0.065,
  combatRangeNm: 1944,
  hardpoints: 12,
  maxAAM: 12,
  missiles: { radar: R77, ir: R74 },
  tvcDeg: 15,
  gun: {
    name: 'GSh-30-1 30mm cannon',
    caliberMm: 30,
    rounds: 150,
    rpm: 1650,
    muzzleVelocity: 860,
    damage: 19,
    dispersionMil: 4,
    port: [1.05, 0.45, -5.6],
  },
  stations: [
    { id: 1, label: 'LWT', pos: [-7.04, -0.17, 3.75], allowed: [R74], mount: 'rail' },
    { id: 2, label: 'LW OB', pos: [-5.7, -0.64, 3.0], allowed: [R74, R77], mount: 'pylon' },
    { id: 3, label: 'LW MID', pos: [-4.4, -0.66, 2.5], allowed: [R77, R74], mount: 'pylon' },
    { id: 4, label: 'LW IB', pos: [-3.1, -0.68, 1.9], allowed: [R77, R74], mount: 'pylon' },
    { id: 5, label: 'L NAC', pos: [-1.55, -1.45, 0.4], allowed: [R77], mount: 'pylon' },
    { id: 6, label: 'TUN-F', pos: [0, -0.95, -1.6], allowed: [R77], mount: 'pylon' },
    { id: 7, label: 'TUN-A', pos: [0, -0.95, 2.4], allowed: [R77], mount: 'pylon' },
    { id: 8, label: 'R NAC', pos: [1.55, -1.45, 0.4], allowed: [R77], mount: 'pylon' },
    { id: 9, label: 'RW IB', pos: [3.1, -0.68, 1.9], allowed: [R77, R74], mount: 'pylon' },
    { id: 10, label: 'RW MID', pos: [4.4, -0.66, 2.5], allowed: [R77, R74], mount: 'pylon' },
    { id: 11, label: 'RW OB', pos: [5.7, -0.64, 3.0], allowed: [R74, R77], mount: 'pylon' },
    { id: 12, label: 'RWT', pos: [7.04, -0.17, 3.75], allowed: [R74], mount: 'rail' },
  ],
  loadouts: [
    {
      id: 'flanker-aa',
      name: 'AIR SUPERIORITY — 6x R-77M, 4x R-74M',
      stores: { 1: R74, 2: R74, 3: R77, 4: R77, 5: R77, 8: R77, 9: R77, 10: R77, 11: R74, 12: R74 },
    },
    {
      id: 'flanker-max',
      name: 'MAX LOAD — 10x R-77M, 2x R-74M',
      stores: { 1: R74, 2: R77, 3: R77, 4: R77, 5: R77, 6: R77, 7: R77, 8: R77, 9: R77, 10: R77, 11: R77, 12: R74 },
    },
    {
      id: 'flanker-bvr',
      name: 'LONG REACH — 8x R-77M, 2x R-74M',
      stores: { 1: R74, 2: R77, 3: R77, 4: R77, 5: R77, 8: R77, 9: R77, 10: R77, 11: R77, 12: R74 },
    },
    {
      id: 'flanker-dog',
      name: 'DOGFIGHT — 4x R-77M, 6x R-74M',
      stores: { 1: R74, 2: R74, 3: R74, 4: R77, 5: R77, 8: R77, 9: R77, 10: R74, 11: R74, 12: R74 },
    },
  ],
  radar: { name: 'N035 Irbis-E PESA (X-band)', kind: 'PESA', rangeNm: 110, azLimitDeg: 100, elLimitDeg: 60, maxTracks: 16, frameTime: 1.7 },
  irst: { name: 'OLS-35 optical/laser IRST', rangeNm: 45, fovDeg: 90 },
  ew: { name: 'L175M Khibiny-M', maws: true, jamming: 0.25, autoDispense: false },
  flightControl: 'KSU-35 digital fly-by-wire with integrated 3D thrust vectoring',
  chaff: 64,
  flares: 64,
  rcs: 8,
  irSignature: 1.2,
  gear: { nose: -6.9, main: 1.5, track: 2.2, height: 2.3 },
  hitRadius: 6,
  paint: { top: '#6f8ea6', bottom: '#b7cad6', accent: '#40566a' },
};

// ---------------------------------------------------------------------------
// Dassault Rafale C
// ---------------------------------------------------------------------------
const RAFALE: AircraftSpec = {
  type: 'RAFALE',
  name: 'Dassault Rafale C',
  shortName: 'Rafale',
  role: 'Twin-engine canard-delta omnirole fighter',
  crew: 1,
  description:
    'The lightest and most agile jet in the theater: a close-coupled canard delta that keeps its energy in the turn and flies happily at high angle of attack. Two Safran M88-2 engines, Mach 1.8, 50,000 ft, RBE2 AESA radar, OSF passive IRST and the SPECTRA self-protection suite. RBE2 radar reach 90 NM, combat range 2,000 NM with tanks. Carries its own Meteor ramjet missiles (about 92 NM reach and a 34 NM no-escape zone, the biggest in the theater) and MICA IR. 30 mm Nexter 30M791 cannon.',
  lengthFt: 50.2,
  wingspanFt: 35.8,
  heightFt: 17.4,
  length: 50.2 * FT,
  span: 35.8 * FT,
  height: 17.4 * FT,
  emptyMass: 9850,
  internalFuel: 4700,
  maxTakeoff: 24500,
  maxTakeoffLb: 54000,
  payloadLb: 20900,
  wingArea: 45.7,
  cd0: 0.0188,
  waveDragPeak: 2.0,
  waveDragHigh: 1.85,
  kInduced: 0.15,
  clAlpha: 3.5,
  // the close-coupled canards keep the delta lifting to high angles of attack
  clMax: 1.65,
  alphaMaxDeg: 30,
  maxMach: 1.8,
  ceilingFt: 50000,
  maxIasKts: 750,
  engineName: '2 x Safran M88-2',
  engines: 2,
  thrustMil: 50000,
  thrustAb: 75000,
  thrustMilLbf: 11240,
  thrustAbLbf: 16860,
  tsfcMil: 0.8,
  tsfcAb: 1.72,
  ramFactor: 0.5,
  spool: 1.75,
  gLimit: 9.0,
  gOverride: 11.0,
  gStructural: 13.0,
  gNeg: -3.2,
  rollRate: 280,
  pitchRate: 32,
  cornerKts: 320,
  rotateKts: 130,
  approachKts: 125,
  speedbrakeCd: 0.045,
  combatRangeNm: 2000,
  hardpoints: 14,
  maxAAM: 10,
  missiles: { radar: MTR, ir: MICA },
  tvcDeg: 0,
  gun: {
    name: 'Nexter 30M791 30mm revolver cannon',
    caliberMm: 30,
    rounds: 125,
    rpm: 2500,
    muzzleVelocity: 1025,
    damage: 18,
    dispersionMil: 3.5,
    port: [0.8, -0.35, -2.4],
  },
  stations: [
    { id: 1, label: 'LWT', pos: [-5.4, -0.34, 4.15], allowed: [MICA], mount: 'rail' },
    { id: 2, label: 'LW OB', pos: [-4.25, -0.62, 3.45], allowed: [MICA, MTR], mount: 'pylon', hang: -0.4 },
    { id: 3, label: 'LW MID', pos: [-3.15, -0.7, 3.0], allowed: [MTR, MICA, TANK], mount: 'pylon', hang: -0.41 },
    { id: 4, label: 'LW IB', pos: [-2.1, -0.75, 2.5], allowed: [TANK, MTR], mount: 'pylon', hang: -0.42 },
    { id: 5, label: 'L FUS-F', pos: [-0.72, -1.02, -0.9], allowed: [MTR, MICA], mount: 'pylon' },
    { id: 6, label: 'L FUS-A', pos: [-0.72, -1.0, 2.6], allowed: [MTR, MICA], mount: 'pylon' },
    { id: 7, label: 'CL', pos: [0, -1.2, 0.9], allowed: [TANK], mount: 'pylon' },
    { id: 8, label: 'R FUS-A', pos: [0.72, -1.0, 2.6], allowed: [MTR, MICA], mount: 'pylon' },
    { id: 9, label: 'R FUS-F', pos: [0.72, -1.02, -0.9], allowed: [MTR, MICA], mount: 'pylon' },
    { id: 10, label: 'RW IB', pos: [2.1, -0.75, 2.5], allowed: [TANK, MTR], mount: 'pylon', hang: -0.42 },
    { id: 11, label: 'RW MID', pos: [3.15, -0.7, 3.0], allowed: [MTR, MICA, TANK], mount: 'pylon', hang: -0.41 },
    { id: 12, label: 'RW OB', pos: [4.25, -0.62, 3.45], allowed: [MICA, MTR], mount: 'pylon', hang: -0.4 },
    { id: 13, label: 'RWT', pos: [5.4, -0.34, 4.15], allowed: [MICA], mount: 'rail' },
  ],
  loadouts: [
    {
      id: 'rafale-aa',
      name: 'AIR SUPERIORITY — 4x METEOR, 4x MICA IR',
      stores: { 1: MICA, 2: MICA, 5: MTR, 6: MTR, 8: MTR, 9: MTR, 12: MICA, 13: MICA },
    },
    {
      id: 'rafale-cap',
      name: 'COMBAT AIR PATROL — 2x METEOR, 4x MICA IR, 3x TANKS',
      stores: { 1: MICA, 2: MICA, 3: TANK, 5: MTR, 7: TANK, 9: MTR, 11: TANK, 12: MICA, 13: MICA },
    },
    {
      id: 'rafale-max',
      name: 'MAX AAM — 6x METEOR, 4x MICA IR',
      stores: { 1: MICA, 2: MICA, 3: MTR, 5: MTR, 6: MTR, 8: MTR, 9: MTR, 11: MTR, 12: MICA, 13: MICA },
    },
    {
      id: 'rafale-dog',
      name: 'DOGFIGHT — 2x METEOR, 6x MICA IR',
      stores: { 1: MICA, 2: MICA, 3: MICA, 5: MTR, 9: MTR, 11: MICA, 12: MICA, 13: MICA },
    },
  ],
  radar: { name: 'Thales RBE2 AESA', kind: 'AESA', rangeNm: 90, azLimitDeg: 70, elLimitDeg: 60, maxTracks: 40, frameTime: 1.1 },
  irst: { name: 'OSF Optronique Secteur Frontal (IRST)', rangeNm: 42, fovDeg: 70 },
  ew: { name: 'SPECTRA', maws: true, jamming: 0.3, autoDispense: true },
  flightControl: 'Triplex digital fly-by-wire (carefree handling, no G/AoA exceedance)',
  chaff: 112,
  flares: 32,
  rcs: 1.0,
  irSignature: 0.85,
  gear: { nose: -4.7, main: 1.1, track: 1.35, height: 1.75 },
  hitRadius: 4.6,
  paint: { top: '#7b8388', bottom: '#949ca1', accent: '#4f575c' },
};


// ---------------------------------------------------------------------------
// Lockheed Martin F-22A Raptor
// ---------------------------------------------------------------------------
// The first fifth-generation jet in the game, here for its speed: supercruise
// at Mach 1.8 without afterburner, Mach 2.25 flat out, 65,000 ft and a climb
// that goes straight up. Everything else is kept level with the rest: an
// F-15-class radar, a conventional radar signature, and only eight missiles.
const F22: AircraftSpec = {
  type: 'F22',
  name: 'Lockheed Martin F-22A Raptor',
  shortName: 'F-22A',
  role: 'Fifth-generation air superiority fighter',
  crew: 1,
  description:
    'The fastest jet in the theater. Two Pratt & Whitney F119s supercruise it at Mach 1.8 with no afterburner, push it to Mach 2.25 and 65,000 ft, and climb at over 60,000 ft a minute. The nozzles vector 20 degrees up and down for post-stall flips. Its radar is F-15-class and everything rides inside the weapons bays, so it carries only 6 AIM-120s and 2 AIM-9s. M61A2 20 mm gun, 480 rounds.',
  lengthFt: 62.0,
  wingspanFt: 44.5,
  heightFt: 16.7,
  length: 62.0 * FT,
  span: 44.5 * FT,
  height: 16.7 * FT,
  emptyMass: kg(43300),
  internalFuel: kg(18000),
  maxTakeoff: kg(83500),
  maxTakeoffLb: 83500,
  payloadLb: 5600,
  wingArea: 78.04,
  cd0: 0.0172,
  waveDragPeak: 1.85,
  waveDragHigh: 1.35,
  kInduced: 0.14,
  clAlpha: 3.6,
  clMax: 1.8,
  alphaMaxDeg: 30,
  maxMach: 2.25,
  ceilingFt: 65000,
  maxIasKts: 800,
  engineName: '2 x Pratt & Whitney F119-PW-100',
  engines: 2,
  // tuned so the jet supercruises at Mach 1.8 in the game's engine model
  // (the display figure below is the real F119's)
  thrustMil: lbf(33000),
  thrustAb: lbf(35000),
  thrustMilLbf: 26000,
  thrustAbLbf: 35000,
  tsfcMil: 0.72,
  tsfcAb: 1.9,
  ramFactor: 0.62,
  spool: 1.5,
  gLimit: 9.0,
  gOverride: 11.0,
  gStructural: 13.5,
  gNeg: -3,
  rollRate: 240,
  pitchRate: 30,
  cornerKts: 330,
  rotateKts: 140,
  approachKts: 140,
  speedbrakeCd: 0.06,
  combatRangeNm: 1600,
  hardpoints: 8,
  maxAAM: 8,
  missiles: { radar: AIM120, ir: AIM9 },
  tvcDeg: 20,
  tvcPitchOnly: true,
  gun: {
    name: 'M61A2 Vulcan 20mm rotary cannon',
    caliberMm: 20,
    rounds: 480,
    rpm: 6000,
    muzzleVelocity: 1050,
    damage: 7,
    dispersionMil: 4.5,
    port: [1.35, 0.2, -2.2],
  },
  stations: [
    { id: 1, label: 'L SIDE BAY', pos: [-1.2, -0.3, -1.3], allowed: [AIM9], mount: 'internal' },
    { id: 2, label: 'MAIN BAY 1', pos: [-0.7, -0.62, 0.6], allowed: [AIM120], mount: 'internal' },
    { id: 3, label: 'MAIN BAY 2', pos: [-0.42, -0.62, 0.6], allowed: [AIM120], mount: 'internal' },
    { id: 4, label: 'MAIN BAY 3', pos: [-0.14, -0.62, 0.6], allowed: [AIM120], mount: 'internal' },
    { id: 5, label: 'MAIN BAY 4', pos: [0.14, -0.62, 0.6], allowed: [AIM120], mount: 'internal' },
    { id: 6, label: 'MAIN BAY 5', pos: [0.42, -0.62, 0.6], allowed: [AIM120], mount: 'internal' },
    { id: 7, label: 'MAIN BAY 6', pos: [0.7, -0.62, 0.6], allowed: [AIM120], mount: 'internal' },
    { id: 8, label: 'R SIDE BAY', pos: [1.2, -0.3, -1.3], allowed: [AIM9], mount: 'internal' },
  ],
  loadouts: [
    {
      id: 'raptor-std',
      name: 'AIR DOMINANCE — 6x AIM-120D, 2x AIM-9X (internal)',
      stores: { 1: AIM9, 2: AIM120, 3: AIM120, 4: AIM120, 5: AIM120, 6: AIM120, 7: AIM120, 8: AIM9 },
    },
    {
      id: 'raptor-light',
      name: 'LIGHT — 4x AIM-120D, 2x AIM-9X (internal)',
      stores: { 1: AIM9, 3: AIM120, 4: AIM120, 5: AIM120, 6: AIM120, 8: AIM9 },
    },
  ],
  // kept to F-15EX performance on purpose: the Raptor is here for its speed
  radar: { name: 'AN/APG-77 AESA', kind: 'AESA', rangeNm: 105, azLimitDeg: 60, elLimitDeg: 60, maxTracks: 16, frameTime: 1.2 },
  irst: null,
  ew: { name: 'AN/ALR-94 EW suite', maws: true, jamming: 0.3, autoDispense: true },
  flightControl: 'Digital fly-by-wire with integrated thrust vectoring',
  chaff: 60,
  flares: 60,
  // a conventional signature (no stealth advantage in the game)
  rcs: 8,
  irSignature: 1.05,
  gear: { nose: -5.6, main: 1.0, track: 1.6, height: 1.85 },
  hitRadius: 5.8,
  paint: { top: '#8b9196', bottom: '#9ba1a5', accent: '#6b7176' },
};

export const SPECS: Record<AircraftType, AircraftSpec> = {
  F15EX: F15EX,
  FA18EF: FA18,
  TYPHOON: TYPHOON,
  SU35: SU35,
  RAFALE: RAFALE,
  F22: F22,
};

export function getSpec(t: AircraftType): AircraftSpec {
  return SPECS[t];
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export interface StoreSpec {
  type: StoreType;
  name: string;
  mass: number; // kg
  dragCd: number; // added CD referenced to wing area ~50 m^2
  length: number;
  diameter: number;
}

export const STORES: Record<StoreType, StoreSpec> = {
  AIM120D: { type: 'AIM120D', name: 'AIM-120D AMRAAM', mass: 161.5, dragCd: 0.0011, length: 3.66, diameter: 0.178 },
  AIM9X: { type: 'AIM9X', name: 'AIM-9X Sidewinder Block II', mass: 85.3, dragCd: 0.0008, length: 3.02, diameter: 0.127 },
  TANK: { type: 'TANK', name: 'External fuel tank (480 gal)', mass: 220, dragCd: 0.0045, length: 5.0, diameter: 0.75 },
  R77M: { type: 'R77M', name: 'R-77M', mass: 190, dragCd: 0.0013, length: 3.71, diameter: 0.2 },
  R74M: { type: 'R74M', name: 'R-74M', mass: 105, dragCd: 0.0009, length: 2.92, diameter: 0.17 },
  METEOR: { type: 'METEOR', name: 'MBDA Meteor', mass: 190, dragCd: 0.0012, length: 3.65, diameter: 0.178 },
  MICAIR: { type: 'MICAIR', name: 'MBDA MICA IR', mass: 112, dragCd: 0.0009, length: 3.1, diameter: 0.16 },
};

/** Fuel carried in each external tank (kg, JP-8 at 480 US gal). */
export const TANK_FUEL = 1450;

/** Enemy types the spawner may use: never the player's own type. */
export function enemyTypesFor(player: AircraftType): AircraftType[] {
  return AIRCRAFT_TYPES.filter((t) => t !== player);
}
