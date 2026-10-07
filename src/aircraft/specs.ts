// The six aircraft in the game. Every number here comes from the
// published specifications given in the design brief; aerodynamic
// coefficients are engineering estimates tuned so the real top speeds,
// ceilings and ranges fall out of the physics.

import { FT, LB, LBF } from '../core/constants';
import type { MissileType, BombType } from '../weapons/weaponSpecs';

export type AircraftType = 'F15EX' | 'FA18EF' | 'F16C' | 'TYPHOON' | 'SU35' | 'RAFALE' | 'F22' | 'MIG31' | 'SR71' | 'X15' | 'F35A' | 'SU57' | 'GRIPEN';
export const AIRCRAFT_TYPES: AircraftType[] = ['F15EX', 'FA18EF', 'F16C', 'TYPHOON', 'SU35', 'RAFALE', 'F22', 'MIG31', 'SR71', 'X15', 'F35A', 'SU57', 'GRIPEN'];
/**
 * The armed fighters: everything the AI flies and every combat mode allows.
 * The SR-71 is an unarmed reconnaissance jet still in testing: it only flies
 * Blackbird reconnaissance missions and free flight.
 */
export const COMBAT_TYPES: AircraftType[] = AIRCRAFT_TYPES.filter((t) => t !== 'SR71' && t !== 'X15');
/** jets only some modes may use */
export function jetAllowedIn(t: AircraftType, mode: string): boolean {
  if (t === 'SR71') return mode === 'free' || mode === 'recon';
  // the X-15 is a rocket research ship: dropped from its mothership in free flight only
  if (t === 'X15') return mode === 'free';
  return mode !== 'recon';
}

export type StoreType = MissileType | BombType | 'TANK';

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
  /** internal stations: which weapons bay (its doors must be open to launch) */
  bay?: WeaponBay;
  /** internal stations: where the store sits once its bay is open (lowered on its launcher) */
  bayOut?: [number, number, number];
}

/** F-22 weapons bays: the big main bay under the belly and one each side of the intakes */
export type WeaponBay = 'main' | 'left' | 'right';

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
  /** extra lift at zero AoA from landing flaps (out with the gear, slow); jets without it fly it on AoA alone */
  flapCl0?: number;
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
  /** bleed-bypass / ramjet effect: extra afterburner thrust multiplier reached by Mach 3.2 (J58) */
  ramjetGain?: number;
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
  /** post-stall AoA limit with the G-limiter overridden (TVC jets; default 70 deg) */
  tvcAlphaMaxDeg?: number;
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
  /** a rocket instead of jet engines: vacuum thrust (lbf; thrustMil is the sea-level figure) and the throttle floor */
  rocket?: { vacLbf: number; minThrottle: number };
  /** reaction-control thrusters: angular acceleration (rad/s^2) at full stick when the air is too thin for the surfaces */
  reaction?: { pitch: number; roll: number; yaw: number };
  /** this jet's own external tanks: fuel (kg) and empty mass (kg) each, instead of the standard 480 gal tank */
  tank?: { fuel: number; mass: number; dropWhenEmpty: boolean };
  /** dropped from a mothership instead of taking off: launch height (ft) and speed (kt true) */
  airLaunch?: { altFt: number; kts: number; carrier: string };
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
const GBU31 = 'GBU31' as const;
const GBU32 = 'GBU32' as const;
const GBU39 = 'GBU39' as const;
const PW4 = 'PAVEWAY4' as const;
const AASM = 'AASM' as const;
const KAB = 'KAB500' as const;
const R37 = 'R37M' as const;
const IRIS = 'IRIST' as const;
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
    port: [1.98, 0.31, -1.4],
  },
  stations: [
    { id: 1, label: 'LW OB-O', pos: [-4.45, -0.15, F15_RZ], allowed: [AIM9, AIM120], mount: 'pylon', hang: 0.09, rack: -4.15 },
    { id: 2, label: 'LW OB-I', pos: [-3.85, -0.15, F15_RZ], allowed: [AIM120, AIM9], mount: 'pylon', hang: 0.09, rack: -4.15 },
    { id: 3, label: 'LW IB-O', pos: [-3.05, -0.15, F15_RZ], allowed: [AIM120, AIM9, TANK, GBU31], mount: 'pylon', hang: 0.09, rack: -2.75 },
    { id: 4, label: 'LW IB-I', pos: [-2.45, -0.15, F15_RZ], allowed: [AIM120, AIM9], mount: 'pylon', hang: 0.09, rack: -2.75 },
    { id: 5, label: 'L CFT-F', pos: [-1.55, -0.95, -1.4], allowed: [AIM120], mount: 'conformal' },
    { id: 6, label: 'L CFT-A', pos: [-1.55, -0.95, 1.9], allowed: [AIM120, GBU31], mount: 'conformal' },
    { id: 7, label: 'CL', pos: [0, -1.2, 0.4], allowed: [TANK], mount: 'pylon' },
    { id: 8, label: 'R CFT-A', pos: [1.55, -0.95, 1.9], allowed: [AIM120, GBU31], mount: 'conformal' },
    { id: 9, label: 'R CFT-F', pos: [1.55, -0.95, -1.4], allowed: [AIM120], mount: 'conformal' },
    { id: 10, label: 'RW IB-I', pos: [2.45, -0.15, F15_RZ], allowed: [AIM120, AIM9], mount: 'pylon', hang: 0.09, rack: 2.75 },
    { id: 11, label: 'RW IB-O', pos: [3.05, -0.15, F15_RZ], allowed: [AIM120, AIM9, TANK, GBU31], mount: 'pylon', hang: 0.09, rack: 2.75 },
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
      id: 'eagle-strike',
      name: 'STRIKE EAGLE — 4x GBU-31 JDAM, 2x AIM-120D, 2x AIM-9X',
      stores: { 1: AIM9, 13: AIM9, 3: GBU31, 11: GBU31, 6: GBU31, 8: GBU31, 5: AIM120, 9: AIM120 },
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
    port: [0, 0.45, -7.4],
  },
  stations: [
    { id: 1, label: 'LWT', pos: [-6.75, -0.1, 2.4], allowed: [AIM9], mount: 'rail' },
    { id: 2, label: 'LW OB', pos: [-5.1, -0.85, 2.0], allowed: [AIM120, AIM9], mount: 'pylon', hang: -0.035 },
    // station 3: LAU-115 with two LAU-127 shoulder rails (a tank hangs from the pylon centre)
    { id: 3, label: 'LW MID-O', pos: [-4.2, -0.3, FA18_RZ], allowed: [AIM120, AIM9, TANK, GBU32], mount: 'pylon', hang: -0.04, rack: -3.9 },
    { id: 4, label: 'LW MID-I', pos: [-3.6, -0.3, FA18_RZ], allowed: [AIM120, TANK, GBU32], mount: 'pylon', hang: -0.04, rack: -3.9 },
    { id: 5, label: 'L FUS', pos: [-0.85, -1.1, -1.4], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 6, label: 'CL', pos: [0, -1.35, 0.2], allowed: [TANK], mount: 'pylon' },
    { id: 7, label: 'R FUS', pos: [0.85, -1.1, -1.4], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 8, label: 'RW MID-I', pos: [3.6, -0.3, FA18_RZ], allowed: [AIM120, TANK, GBU32], mount: 'pylon', hang: -0.04, rack: 3.9 },
    { id: 9, label: 'RW MID-O', pos: [4.2, -0.3, FA18_RZ], allowed: [AIM120, AIM9, TANK, GBU32], mount: 'pylon', hang: -0.04, rack: 3.9 },
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
      id: 'hornet-strike',
      name: 'STRIKE — 4x GBU-32 JDAM, 2x AIM-120D, 2x AIM-9X',
      stores: { 1: AIM9, 11: AIM9, 3: GBU32, 4: GBU32, 8: GBU32, 9: GBU32, 5: AIM120, 7: AIM120 },
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
    port: [0.98, -0.2, -2.15],
  },
  stations: [
    { id: 1, label: 'LW OB', pos: [-5.1, -0.35, 4.2], allowed: [AIM9], mount: 'rail', hang: -0.44 },
    { id: 2, label: 'LW MID', pos: [-3.9, -0.6, 3.2], allowed: [AIM120, AIM9, PW4], mount: 'pylon', hang: -0.44 },
    { id: 3, label: 'LW IB', pos: [-2.8, -0.7, 2.6], allowed: [AIM120, AIM9, TANK, PW4], mount: 'pylon', hang: -0.45 },
    { id: 4, label: 'L FUS-F', pos: [-0.9, -1.0, -1.2], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 5, label: 'L FUS-A', pos: [-0.9, -1.0, 1.6], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 6, label: 'CL', pos: [0, -1.25, 0.4], allowed: [TANK], mount: 'pylon' },
    { id: 7, label: 'R FUS-A', pos: [0.9, -1.0, 1.6], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 8, label: 'R FUS-F', pos: [0.9, -1.0, -1.2], allowed: [AIM120], mount: 'semi-recessed' },
    { id: 9, label: 'RW IB', pos: [2.8, -0.7, 2.6], allowed: [AIM120, AIM9, TANK, PW4], mount: 'pylon', hang: -0.45 },
    { id: 10, label: 'RW MID', pos: [3.9, -0.6, 3.2], allowed: [AIM120, AIM9, PW4], mount: 'pylon', hang: -0.44 },
    { id: 11, label: 'RW OB', pos: [5.1, -0.35, 4.2], allowed: [AIM9], mount: 'rail', hang: -0.44 },
  ],
  loadouts: [
    {
      id: 'typhoon-aa',
      name: 'AIR DOMINANCE — 6x AIM-120D, 2x AIM-9X',
      stores: { 1: AIM9, 2: AIM120, 4: AIM120, 5: AIM120, 7: AIM120, 8: AIM120, 10: AIM120, 11: AIM9 },
    },
    {
      id: 'typhoon-strike',
      name: 'SWING ROLE — 4x PAVEWAY IV, 4x AIM-120D, 2x AIM-9X',
      stores: { 1: AIM9, 11: AIM9, 2: PW4, 3: PW4, 9: PW4, 10: PW4, 4: AIM120, 5: AIM120, 7: AIM120, 8: AIM120 },
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
    port: [1.05, 0.1, -4.0],
  },
  stations: [
    { id: 1, label: 'LWT', pos: [-7.04, -0.17, 3.75], allowed: [R74], mount: 'rail' },
    { id: 2, label: 'LW OB', pos: [-5.7, -0.64, 3.0], allowed: [R74, R77], mount: 'pylon' },
    { id: 3, label: 'LW MID', pos: [-4.4, -0.66, 2.5], allowed: [R77, R74, KAB], mount: 'pylon' },
    { id: 4, label: 'LW IB', pos: [-3.1, -0.68, 1.9], allowed: [R77, R74, KAB], mount: 'pylon' },
    { id: 5, label: 'L NAC', pos: [-1.55, -1.45, 0.4], allowed: [R77], mount: 'pylon' },
    { id: 6, label: 'TUN-F', pos: [0, -0.95, -1.6], allowed: [R77], mount: 'pylon' },
    { id: 7, label: 'TUN-A', pos: [0, -0.95, 2.4], allowed: [R77], mount: 'pylon' },
    { id: 8, label: 'R NAC', pos: [1.55, -1.45, 0.4], allowed: [R77], mount: 'pylon' },
    { id: 9, label: 'RW IB', pos: [3.1, -0.68, 1.9], allowed: [R77, R74, KAB], mount: 'pylon' },
    { id: 10, label: 'RW MID', pos: [4.4, -0.66, 2.5], allowed: [R77, R74, KAB], mount: 'pylon' },
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
      id: 'flanker-strike',
      name: 'STRIKE — 4x KAB-500S, 4x R-77M, 2x R-74M',
      stores: { 1: R74, 12: R74, 3: KAB, 4: KAB, 9: KAB, 10: KAB, 2: R77, 11: R77, 5: R77, 8: R77 },
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
    port: [0.97, -0.18, -1.15],
  },
  stations: [
    { id: 1, label: 'LWT', pos: [-5.4, -0.34, 4.15], allowed: [MICA], mount: 'rail' },
    { id: 2, label: 'LW OB', pos: [-4.25, -0.62, 3.45], allowed: [MICA, MTR], mount: 'pylon', hang: -0.4 },
    { id: 3, label: 'LW MID', pos: [-3.15, -0.7, 3.0], allowed: [MTR, MICA, TANK, AASM], mount: 'pylon', hang: -0.41 },
    { id: 4, label: 'LW IB', pos: [-2.1, -0.75, 2.5], allowed: [TANK, MTR, AASM], mount: 'pylon', hang: -0.42 },
    { id: 5, label: 'L FUS-F', pos: [-0.72, -1.02, -0.9], allowed: [MTR, MICA], mount: 'pylon' },
    { id: 6, label: 'L FUS-A', pos: [-0.72, -1.0, 2.6], allowed: [MTR, MICA], mount: 'pylon' },
    { id: 7, label: 'CL', pos: [0, -1.2, 0.9], allowed: [TANK], mount: 'pylon' },
    { id: 8, label: 'R FUS-A', pos: [0.72, -1.0, 2.6], allowed: [MTR, MICA], mount: 'pylon' },
    { id: 9, label: 'R FUS-F', pos: [0.72, -1.02, -0.9], allowed: [MTR, MICA], mount: 'pylon' },
    { id: 10, label: 'RW IB', pos: [2.1, -0.75, 2.5], allowed: [TANK, MTR, AASM], mount: 'pylon', hang: -0.42 },
    { id: 11, label: 'RW MID', pos: [3.15, -0.7, 3.0], allowed: [MTR, MICA, TANK, AASM], mount: 'pylon', hang: -0.41 },
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
      id: 'rafale-strike',
      name: 'STRIKE — 4x AASM HAMMER, 2x METEOR, 4x MICA IR, CL TANK',
      stores: { 1: MICA, 2: MICA, 12: MICA, 13: MICA, 3: AASM, 4: AASM, 10: AASM, 11: AASM, 5: MTR, 9: MTR, 7: TANK },
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
  tvcAlphaMaxDeg: 60,
  gun: {
    name: 'M61A2 Vulcan 20mm rotary cannon',
    caliberMm: 20,
    rounds: 480,
    rpm: 6000,
    muzzleVelocity: 1050,
    damage: 7,
    dispersionMil: 4.5,
    port: [1.35, 0.35, -2.05],
  },
  stations: [
    { id: 1, label: 'L SIDE BAY', pos: [-1.2, -0.3, -0.45], allowed: [AIM9], mount: 'internal', bay: 'left', bayOut: [-2.0, -0.62, -0.45] },
    { id: 2, label: 'MAIN BAY 1', pos: [-0.7, -0.62, 0.6], allowed: [AIM120], mount: 'internal', bay: 'main', bayOut: [-0.7, -0.93, 0.6] },
    { id: 3, label: 'MAIN BAY 2', pos: [-0.42, -0.62, 0.6], allowed: [AIM120, GBU39], mount: 'internal', bay: 'main', bayOut: [-0.42, -0.93, 0.6] },
    { id: 4, label: 'MAIN BAY 3', pos: [-0.14, -0.62, 0.6], allowed: [AIM120, GBU39], mount: 'internal', bay: 'main', bayOut: [-0.14, -0.93, 0.6] },
    { id: 5, label: 'MAIN BAY 4', pos: [0.14, -0.62, 0.6], allowed: [AIM120, GBU39], mount: 'internal', bay: 'main', bayOut: [0.14, -0.93, 0.6] },
    { id: 6, label: 'MAIN BAY 5', pos: [0.42, -0.62, 0.6], allowed: [AIM120, GBU39], mount: 'internal', bay: 'main', bayOut: [0.42, -0.93, 0.6] },
    { id: 7, label: 'MAIN BAY 6', pos: [0.7, -0.62, 0.6], allowed: [AIM120], mount: 'internal', bay: 'main', bayOut: [0.7, -0.93, 0.6] },
    { id: 8, label: 'R SIDE BAY', pos: [1.2, -0.3, -0.45], allowed: [AIM9], mount: 'internal', bay: 'right', bayOut: [2.0, -0.62, -0.45] },
  ],
  loadouts: [
    {
      id: 'raptor-std',
      name: 'AIR DOMINANCE — 6x AIM-120D, 2x AIM-9X (internal)',
      stores: { 1: AIM9, 2: AIM120, 3: AIM120, 4: AIM120, 5: AIM120, 6: AIM120, 7: AIM120, 8: AIM9 },
    },
    {
      id: 'raptor-strike',
      name: 'STRIKE — 4x GBU-39 SDB, 2x AIM-120D, 2x AIM-9X (internal)',
      stores: { 1: AIM9, 8: AIM9, 2: AIM120, 7: AIM120, 3: GBU39, 4: GBU39, 5: GBU39, 6: GBU39 },
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
  gear: { nose: -6.1, main: 0.95, track: 1.55, height: 2.05 },
  hitRadius: 5.8,
  paint: { top: '#8b9196', bottom: '#9ba1a5', accent: '#6b7176' },
};

// ---------------------------------------------------------------------------
// Mikoyan MiG-31BM Foxhound
// ---------------------------------------------------------------------------
const MIG31: AircraftSpec = {
  type: 'MIG31',
  name: 'Mikoyan MiG-31BM Foxhound',
  shortName: 'MiG-31BM',
  role: 'Two-seat long-range supersonic interceptor',
  crew: 2,
  description:
    'The fastest jet in the theater: a huge two-seat interceptor built to dash out at Mach 2.83, 67,600 ft up, and kill bombers far from home. Two Aviadvigatel D-30F6 turbofans (152 kN each in afterburner), the Zaslon-M passive phased-array radar and four R-37M very-long-range missiles half-sunk under the belly, the longest reach in the game. Built for speed, not turning: it is limited to 5 G. 23 mm GSh-6-23M six-barrel cannon, 260 rounds.',
  lengthFt: 74.4,
  wingspanFt: 44.2,
  heightFt: 20.2,
  length: 22.69,
  span: 13.46,
  height: 6.15,
  emptyMass: 21820,
  internalFuel: 16350,
  maxTakeoff: 46200,
  maxTakeoffLb: 101850,
  payloadLb: 19840,
  wingArea: 61.6,
  cd0: 0.023,
  // shaped for Mach 2.8: less wave drag at the top end than the dogfighters
  waveDragPeak: 1.75,
  waveDragHigh: 1.2,
  kInduced: 0.125,
  clAlpha: 3.4,
  clMax: 1.55,
  // big plain flaps and leading-edge flaps: a heavy jet that still lands at about 150 kt
  flapCl0: 0.45,
  alphaMaxDeg: 20,
  maxMach: 2.83,
  ceilingFt: 67600,
  // 1,500 km/h indicated: Mach 1.23 on the deck
  maxIasKts: 810,
  engineName: '2 x Aviadvigatel D-30F6 afterburning turbofans',
  engines: 2,
  thrustMil: lbf(20900),
  thrustAb: lbf(34170),
  thrustMilLbf: 20900,
  thrustAbLbf: 34170,
  tsfcMil: 0.72,
  tsfcAb: 1.9,
  // low-bypass engines tuned for high Mach: thrust keeps growing with speed
  ramFactor: 0.8,
  spool: 0.95,
  gLimit: 5.0,
  gOverride: 5.5,
  gStructural: 7.5,
  gNeg: -2,
  rollRate: 150,
  pitchRate: 18,
  cornerKts: 420,
  rotateKts: 175,
  approachKts: 170,
  speedbrakeCd: 0.05,
  combatRangeNm: 1620,
  hardpoints: 8,
  maxAAM: 8,
  missiles: { radar: R37, ir: R74 },
  tvcDeg: 0,
  gun: {
    name: 'GSh-6-23M 23mm six-barrel rotary cannon',
    caliberMm: 23,
    rounds: 260,
    rpm: 8000,
    muzzleVelocity: 715,
    damage: 14,
    dispersionMil: 6,
    // in a fairing under the right intake trunk, just ahead of the right main gear
    port: [1.55, -1.08, -0.7],
  },
  stations: [
    { id: 1, label: 'LW OB', pos: [-5.05, -0.62, 2.85], allowed: [R74], mount: 'pylon' },
    { id: 2, label: 'LW IB', pos: [-3.35, -0.66, 2.1], allowed: [R74, R37, KAB, TANK], mount: 'pylon' },
    { id: 3, label: 'FUS LF', pos: [-0.54, -1.12, -0.95], allowed: [R37], mount: 'conformal' },
    { id: 4, label: 'FUS LA', pos: [-0.54, -1.12, 3.55], allowed: [R37], mount: 'conformal' },
    { id: 5, label: 'FUS RA', pos: [0.54, -1.12, 3.55], allowed: [R37], mount: 'conformal' },
    { id: 6, label: 'FUS RF', pos: [0.54, -1.12, -0.95], allowed: [R37], mount: 'conformal' },
    { id: 7, label: 'RW IB', pos: [3.35, -0.66, 2.1], allowed: [R74, R37, KAB, TANK], mount: 'pylon' },
    { id: 8, label: 'RW OB', pos: [5.05, -0.62, 2.85], allowed: [R74], mount: 'pylon' },
  ],
  loadouts: [
    {
      id: 'foxhound-int',
      name: 'INTERCEPTOR — 4x R-37M, 4x R-74M',
      stores: { 1: R74, 2: R74, 3: R37, 4: R37, 5: R37, 6: R37, 7: R74, 8: R74 },
    },
    {
      id: 'foxhound-long',
      name: 'LONG REACH — 6x R-37M, 2x R-74M',
      stores: { 1: R74, 2: R37, 3: R37, 4: R37, 5: R37, 6: R37, 7: R37, 8: R74 },
    },
    {
      id: 'foxhound-ferry',
      name: 'FAR PATROL — 4x R-37M, 2x R-74M, 2x tanks',
      stores: { 1: R74, 2: TANK, 3: R37, 4: R37, 5: R37, 6: R37, 7: TANK, 8: R74 },
    },
    {
      id: 'foxhound-strike',
      name: 'STRIKE — 2x KAB-500S, 4x R-37M, 2x R-74M',
      stores: { 1: R74, 2: KAB, 3: R37, 4: R37, 5: R37, 6: R37, 7: KAB, 8: R74 },
    },
  ],
  radar: { name: 'Zaslon-M PESA (X/L-band)', kind: 'PESA', rangeNm: 125, azLimitDeg: 70, elLimitDeg: 65, maxTracks: 24, frameTime: 2.0 },
  irst: { name: '8TK retractable IRST', rangeNm: 30, fovDeg: 60 },
  ew: { name: 'SPO-15 Beryoza RWR', maws: false, jamming: 0.12, autoDispense: false },
  flightControl: 'SAU-155MP analog automatic flight control (no fly-by-wire)',
  chaff: 48,
  flares: 48,
  rcs: 14,
  irSignature: 1.55,
  gear: { nose: -6.35, main: 1.85, track: 1.82, height: 2.45 },
  hitRadius: 7,
  paint: { top: '#a4adb3', bottom: '#bcc3c8', accent: '#5a646c' },
};

// ---------------------------------------------------------------------------
// Lockheed SR-71A Blackbird
// ---------------------------------------------------------------------------
const SR71: AircraftSpec = {
  type: 'SR71',
  name: 'Lockheed SR-71A Blackbird',
  shortName: 'SR-71A',
  role: 'Two-seat strategic reconnaissance aircraft (unarmed)',
  crew: 2,
  description:
    'The fastest air-breathing crewed jet ever flown: a titanium Mach 3 spy plane that cruises above 80,000 ft, so high and so fast that missiles fired at it fell behind. Two Pratt & Whitney J58 bleed-bypass turbojets (34,000 lb each in afterburner) breathe through moving inlet spikes and turn into near-ramjets at speed, so thrust keeps climbing with Mach. Radar-absorbing chines and blackened skin cut its radar return; the black paint sheds the heat of 300 °C skin. It carries no weapons at all: only its cameras, the ASARS radar and its ELINT recorders, a pilot and a Reconnaissance Systems Officer. Still in testing here: flown only on Blackbird reconnaissance missions and in free flight.',
  lengthFt: 107.4,
  wingspanFt: 55.6,
  heightFt: 18.5,
  length: 32.74,
  span: 16.94,
  height: 5.64,
  emptyMass: 30600,
  internalFuel: 36290,
  maxTakeoff: 78000,
  maxTakeoffLb: 172000,
  payloadLb: 0,
  wingArea: 167.2,
  cd0: 0.0105,
  // a slender, chined Mach 3 shape: little wave drag once it is through the sound barrier
  waveDragPeak: 2.3,
  waveDragHigh: 1.22,
  kInduced: 0.16,
  clAlpha: 2.4,
  clMax: 1.15,
  alphaMaxDeg: 14,
  maxMach: 3.5,
  // service ceiling 85,000 ft and more: it still holds Mach 3 up there
  ceilingFt: 88000,
  maxIasKts: 640,
  engineName: '2 x Pratt & Whitney J58 (JT11D-20) afterburning bleed-bypass turbojets',
  engines: 2,
  thrustMil: lbf(25000),
  thrustAb: lbf(34000),
  thrustMilLbf: 25000,
  thrustAbLbf: 34000,
  tsfcMil: 0.9,
  tsfcAb: 1.9,
  ramFactor: 0.8,
  // the J58 becomes a near-ramjet: past Mach 1 the inlet and bypass bleed
  // multiply the afterburner thrust (about 3x by Mach 3.1)
  ramjetGain: 2.0,
  spool: 0.45,
  gLimit: 3.0,
  gOverride: 3.5,
  gStructural: 4.5,
  gNeg: -1,
  rollRate: 55,
  pitchRate: 7,
  cornerKts: 420,
  rotateKts: 210,
  approachKts: 175,
  speedbrakeCd: 0.02,
  combatRangeNm: 2600,
  hardpoints: 0,
  maxAAM: 0,
  // (no weapons are ever loaded: these only satisfy the type)
  missiles: { radar: AIM120, ir: AIM9 },
  tvcDeg: 0,
  gun: {
    name: 'None (unarmed reconnaissance aircraft)',
    caliberMm: 0,
    rounds: 0,
    rpm: 1,
    muzzleVelocity: 1000,
    damage: 0,
    dispersionMil: 1,
    port: [0, 0, -16],
  },
  stations: [],
  loadouts: [
    {
      id: 'blackbird-recon',
      name: 'RECONNAISSANCE — OBC & TEOC cameras, ASARS-1 radar, ELINT recorders (no weapons)',
      stores: {},
    },
  ],
  radar: { name: 'ASARS-1 ground-mapping radar (no air-to-air mode)', kind: 'PESA', rangeNm: 4, azLimitDeg: 30, elLimitDeg: 20, maxTracks: 4, frameTime: 4 },
  irst: null,
  ew: { name: 'DEF A2/H defensive electronics & ECM', maws: false, jamming: 0.45, autoDispense: false },
  flightControl: 'Stability augmentation and autopilot (no fly-by-wire)',
  chaff: 0,
  flares: 0,
  // chines, iron-ferrite paint and cusped edges: a small return for a 32 m jet
  rcs: 0.8,
  irSignature: 1.6,
  gear: { nose: -10.5, main: 1.0, track: 2.55, height: 2.15 },
  hitRadius: 9,
  paint: { top: '#17191c', bottom: '#1b1d20', accent: '#b8332a' },
};


// ---------------------------------------------------------------------------
// North American X-15
// ---------------------------------------------------------------------------
const X15: AircraftSpec = {
  type: 'X15',
  name: 'North American X-15',
  shortName: 'X-15',
  role: 'Rocket-powered hypersonic research aircraft (unarmed)',
  crew: 1,
  description:
    'The fastest and highest-flying winged aircraft ever flown by a pilot: Mach 6.72 (4,520 mph) and 354,200 ft, above the edge of space. A black Inconel X nickel-steel skin takes 1,200 °F of friction heat. It is dropped from under the wing of a B-52 at 45,000 ft, lights its Thiokol XLR99 rocket (57,000 lb of thrust) and climbs like nothing else. Here it carries about 5 minutes of propellant inside, and two drop tanks double that to about 10 minutes at full power. Above the air the tail surfaces do nothing: small hydrogen-peroxide thrusters in the nose and wingtips point it. Then it falls back into the atmosphere at a steep angle of attack and glides home without power to land on skids. Unarmed; flown in free flight only.',
  lengthFt: 50.25,
  wingspanFt: 22.33,
  heightFt: 13,
  length: 15.32,
  span: 6.81,
  height: 4.0,
  emptyMass: 6350,
  // 18,000 lb of liquid oxygen and anhydrous ammonia
  internalFuel: 8165,
  maxTakeoff: 25460,
  maxTakeoffLb: 56130,
  payloadLb: 0,
  wingArea: 18.6,
  // blunt base, wedge tails: draggy at low speed, slippery for its speed when hypersonic
  cd0: 0.027,
  waveDragPeak: 2.4,
  waveDragHigh: 1.1,
  kInduced: 0.2,
  clAlpha: 2.7,
  clMax: 1.15,
  // re-entry is flown at 20-26 degrees angle of attack
  alphaMaxDeg: 26,
  maxMach: 6.72,
  ceilingFt: 354200,
  maxIasKts: 820,
  engineName: 'Thiokol (Reaction Motors) XLR99-RM-2 throttleable liquid-propellant rocket (liquid oxygen and anhydrous ammonia)',
  engines: 1,
  thrustMil: lbf(57000),
  thrustAb: lbf(57000),
  thrustMilLbf: 57000,
  thrustAbLbf: 57000,
  // propellant flow at full thrust: the 8,165 kg inside last about 5 minutes, and with
  // the two drop tanks about 10 (far longer than the real rocket's 80 seconds)
  tsfcMil: 3.5,
  tsfcAb: 3.5,
  ramFactor: 0,
  spool: 4,
  gLimit: 6,
  gOverride: 7.33,
  gStructural: 9,
  gNeg: -3,
  rollRate: 60,
  pitchRate: 10,
  cornerKts: 380,
  rotateKts: 190,
  approachKts: 200,
  // the split speed brakes on the upper and lower tail
  speedbrakeCd: 0.06,
  combatRangeNm: 280,
  hardpoints: 2,
  maxAAM: 0,
  // (no weapons are ever loaded: these only satisfy the type)
  missiles: { radar: AIM120, ir: AIM9 },
  tvcDeg: 0,
  gun: {
    name: 'None (research aircraft)',
    caliberMm: 0,
    rounds: 0,
    rpm: 1,
    muzzleVelocity: 1000,
    damage: 0,
    dispersionMil: 1,
    port: [0, 0, -8],
  },
  // two big drop tanks along the lower fuselage under the wing roots
  stations: [
    { id: 1, label: 'TANK L', pos: [-0.95, -0.95, 0.6], allowed: [TANK], mount: 'pylon' },
    { id: 2, label: 'TANK R', pos: [0.95, -0.95, 0.6], allowed: [TANK], mount: 'pylon' },
  ],
  loadouts: [
    { id: 'x15-tanks', name: 'LONG BURN — two drop tanks (about 10 minutes at full power)', stores: { 1: TANK, 2: TANK } },
    { id: 'x15-clean', name: 'CLEAN — internal propellant only (about 5 minutes)', stores: {} },
  ],
  radar: { name: 'None (research instrumentation, ball nose air-data probe)', kind: 'PESA', rangeNm: 1, azLimitDeg: 10, elLimitDeg: 10, maxTracks: 1, frameTime: 4 },
  irst: null,
  ew: { name: 'None', maws: false, jamming: 0, autoDispense: false },
  flightControl: 'Hydraulic flight controls with stability augmentation; hydrogen-peroxide reaction controls above the air',
  chaff: 0,
  flares: 0,
  rcs: 3,
  // 57,000 lb of rocket flame
  irSignature: 5,
  // nose wheel under the cockpit, two steel landing skids under the tail
  gear: { nose: -5.3, main: 4.6, track: 1.5, height: 1.25 },
  hitRadius: 5,
  paint: { top: '#16171a', bottom: '#1a1b1e', accent: '#f0c419' },
  rocket: { vacLbf: 61000, minThrottle: 0.5 },
  reaction: { pitch: 0.4, roll: 0.9, yaw: 0.3 },
  // each drop tank: 4,000 kg of propellant, 600 kg empty; let go when it runs dry
  tank: { fuel: 4000, mass: 600, dropWhenEmpty: true },
  airLaunch: { altFt: 45000, kts: 420, carrier: 'B-52' },
};

// ---------------------------------------------------------------------------
// General Dynamics / Lockheed Martin F-16C Fighting Falcon (Block 50, F110-GE-129)
// ---------------------------------------------------------------------------
const F16_RZ = 1.25;

const F16: AircraftSpec = {
  type: 'F16C',
  name: 'F-16C Fighting Falcon',
  shortName: 'F-16C',
  role: 'Single-engine multirole fighter',
  crew: 1,
  description:
    'The Viper: small, light and built to turn. Relaxed stability under digital fly-by-wire, a frameless bubble canopy, a side-stick and a seat reclined 30 degrees for 9 G. Mach 2, 50,000 ft ceiling, F110-GE-129 at 29,500 lb in afterburner, an M61A1 Vulcan in the left wing root with 511 rounds and nine weapon stations.',
  lengthFt: 49.4,
  wingspanFt: 32.7,
  heightFt: 16,
  length: 49.4 * FT,
  span: 32.7 * FT,
  height: 16 * FT,
  emptyMass: kg(19700),
  internalFuel: kg(7000),
  maxTakeoff: kg(37500),
  maxTakeoffLb: 37500,
  payloadLb: 17000,
  wingArea: 27.87,
  cd0: 0.0175,
  waveDragPeak: 2.3,
  waveDragHigh: 1.9,
  kInduced: 0.118,
  clAlpha: 3.6,
  clMax: 1.6,
  flapCl0: 0.18,
  alphaMaxDeg: 25.5,
  maxMach: 2.05,
  ceilingFt: 50000,
  maxIasKts: 800,
  engineName: 'General Electric F110-GE-129',
  engines: 1,
  thrustMil: lbf(17155),
  thrustAb: lbf(29500),
  thrustMilLbf: 17155,
  thrustAbLbf: 29500,
  tsfcMil: 0.74,
  tsfcAb: 1.95,
  ramFactor: 0.6,
  spool: 1.35,
  gLimit: 9.0,
  gOverride: 9.0,
  gStructural: 13.5,
  gNeg: -3,
  rollRate: 300,
  pitchRate: 30,
  cornerKts: 330,
  rotateKts: 150,
  approachKts: 148,
  speedbrakeCd: 0.05,
  combatRangeNm: 1740,
  hardpoints: 11,
  maxAAM: 6,
  missiles: { radar: AIM120, ir: AIM9 },
  tvcDeg: 0,
  gun: {
    name: 'M61A1 Vulcan 20mm rotary cannon',
    caliberMm: 20,
    rounds: 511,
    rpm: 6000,
    muzzleVelocity: 1050,
    damage: 7,
    dispersionMil: 4.5,
    port: [-0.6, 0.3, -3.55],
  },
  stations: [
    { id: 1, label: 'LWT', pos: [-4.9, 0.0, 2.55], allowed: [AIM120, AIM9], mount: 'rail' },
    { id: 2, label: 'LW OB', pos: [-3.95, -0.3, 1.95], allowed: [AIM120, AIM9], mount: 'pylon', hang: -0.04 },
    { id: 3, label: 'LW MID', pos: [-3.0, -0.35, F16_RZ], allowed: [AIM120, AIM9, GBU31, GBU32], mount: 'pylon', hang: -0.045 },
    { id: 4, label: 'LW IB', pos: [-2.05, -0.38, 0.9], allowed: [TANK, GBU31, GBU32], mount: 'pylon', hang: -0.05 },
    { id: 5, label: 'CL', pos: [0, -1.72, 0.35], allowed: [TANK], mount: 'pylon' },
    { id: 6, label: 'RW IB', pos: [2.05, -0.38, 0.9], allowed: [TANK, GBU31, GBU32], mount: 'pylon', hang: -0.05 },
    { id: 7, label: 'RW MID', pos: [3.0, -0.35, F16_RZ], allowed: [AIM120, AIM9, GBU31, GBU32], mount: 'pylon', hang: -0.045 },
    { id: 8, label: 'RW OB', pos: [3.95, -0.3, 1.95], allowed: [AIM120, AIM9], mount: 'pylon', hang: -0.04 },
    { id: 9, label: 'RWT', pos: [4.9, 0.0, 2.55], allowed: [AIM120, AIM9], mount: 'rail' },
  ],
  loadouts: [
    {
      id: 'viper-cap',
      name: 'COMBAT AIR PATROL — 4x AIM-120D, 2x AIM-9X, 2x TANKS',
      stores: { 1: AIM120, 2: AIM9, 3: AIM120, 4: TANK, 6: TANK, 7: AIM120, 8: AIM9, 9: AIM120 },
    },
    {
      id: 'viper-aa',
      name: 'MAX AAM — 6x AIM-120D',
      stores: { 1: AIM120, 2: AIM120, 3: AIM120, 7: AIM120, 8: AIM120, 9: AIM120 },
    },
    {
      id: 'viper-strike',
      name: 'STRIKE — 2x GBU-31 JDAM, 2x AIM-120D, 2x AIM-9X, 2x TANKS',
      stores: { 1: AIM120, 9: AIM120, 2: AIM9, 8: AIM9, 3: GBU31, 7: GBU31, 4: TANK, 6: TANK },
    },
    {
      id: 'viper-dog',
      name: 'DOGFIGHT — 2x AIM-120D, 4x AIM-9X',
      stores: { 1: AIM9, 2: AIM9, 3: AIM120, 7: AIM120, 8: AIM9, 9: AIM9 },
    },
    {
      id: 'viper-long',
      name: 'FERRY / LONG CAP — 2x AIM-120D, 2x AIM-9X, 3x TANKS',
      stores: { 1: AIM9, 3: AIM120, 4: TANK, 5: TANK, 6: TANK, 7: AIM120, 9: AIM9 },
    },
  ],
  radar: { name: 'AN/APG-83 SABR AESA', kind: 'AESA', rangeNm: 70, azLimitDeg: 60, elLimitDeg: 60, maxTracks: 15, frameTime: 1.3 },
  irst: null,
  ew: { name: 'AN/ALR-69A RWR + AN/ALQ-213', maws: false, jamming: 0.12, autoDispense: false },
  flightControl: 'Quadruplex digital fly-by-wire, relaxed static stability, side-stick',
  chaff: 60,
  flares: 60,
  rcs: 1.2,
  irSignature: 0.85,
  gear: { nose: -2.55, main: 1.0, track: 1.18, height: 2.0 },
  hitRadius: 4.3,
  paint: { top: '#80868c', bottom: '#90969b', accent: '#5a6066' },
  tank: { fuel: 1124, mass: 150, dropWhenEmpty: false },
};

// ---------------------------------------------------------------------------
// Lockheed Martin F-35A Lightning II
// ---------------------------------------------------------------------------
// The most numerous fighter of its generation. One F135, the biggest fighter
// engine there is; everything for air combat rides in two bays side by side
// under the belly; and the best sensors in the theater (APG-81 radar, EOTS
// targeting IRST, DAS cameras that see a launch anywhere round the jet). As
// with the F-22 its stealth is not modelled: it fights on its kinematics.
const F35A: AircraftSpec = {
  type: 'F35A',
  name: 'Lockheed Martin F-35A Lightning II',
  shortName: 'F-35A',
  role: 'Fifth-generation multirole stealth fighter',
  crew: 1,
  description:
    'The most widely flown fifth-generation fighter. A single Pratt & Whitney F135, 43,000 lbf in afterburner, takes it to Mach 1.6 and 50,000 ft; it carries four AIM-120Ds inside its two weapons bays (two 2,000 lb JDAMs for strike) and more on the wings when stealth doesn\'t matter. AN/APG-81 AESA radar, the EOTS infrared search and track, and DAS cameras that warn of missile launches from any direction. Comfortable at 50 degrees angle of attack. GAU-22/A 25 mm four-barrel gun inside the left shoulder, 182 rounds.',
  lengthFt: 51.4,
  wingspanFt: 35.0,
  heightFt: 14.4,
  length: 51.4 * FT,
  span: 35.0 * FT,
  height: 14.4 * FT,
  emptyMass: kg(29300),
  internalFuel: kg(18250),
  maxTakeoff: kg(70000),
  maxTakeoffLb: 70000,
  payloadLb: 18000,
  wingArea: 42.7,
  cd0: 0.0215,
  // a deep, area-ruled-but-bulky fuselage: a hard transonic drag rise, Mach 1.6 at the top
  waveDragPeak: 2.2,
  waveDragHigh: 1.85,
  kInduced: 0.13,
  clAlpha: 3.7,
  clMax: 1.75,
  flapCl0: 0.2,
  alphaMaxDeg: 50,
  maxMach: 1.6,
  ceilingFt: 50000,
  maxIasKts: 700,
  engineName: '1 x Pratt & Whitney F135-PW-100',
  engines: 1,
  thrustMil: lbf(28000),
  thrustAb: lbf(43000),
  thrustMilLbf: 28000,
  thrustAbLbf: 43000,
  tsfcMil: 0.74,
  tsfcAb: 1.95,
  ramFactor: 0.5,
  spool: 1.3,
  gLimit: 9.0,
  gOverride: 9.5,
  gStructural: 13.5,
  gNeg: -3,
  rollRate: 210,
  pitchRate: 28,
  cornerKts: 340,
  rotateKts: 150,
  approachKts: 145,
  speedbrakeCd: 0.055,
  combatRangeNm: 1200,
  hardpoints: 10,
  maxAAM: 10,
  missiles: { radar: AIM120, ir: AIM9 },
  tvcDeg: 0,
  gun: {
    name: 'GAU-22/A Equalizer 25mm four-barrel cannon',
    caliberMm: 25,
    rounds: 182,
    rpm: 3300,
    muzzleVelocity: 1050,
    damage: 12,
    dispersionMil: 4,
    port: [-0.78, 0.36, -1.7],
  },
  stations: [
    { id: 1, label: 'LW OB', pos: [-4.15, -0.42, 2.6], allowed: [AIM9], mount: 'pylon', hang: -0.36 },
    { id: 2, label: 'LW MID', pos: [-3.2, -0.48, 2.25], allowed: [AIM120, GBU32], mount: 'pylon', hang: -0.4 },
    { id: 3, label: 'LW IB', pos: [-2.25, -0.52, 1.9], allowed: [AIM120, GBU32], mount: 'pylon', hang: -0.42 },
    { id: 4, label: 'L BAY OB', pos: [-0.84, -0.4, 0.8], allowed: [AIM120, GBU31], mount: 'internal', bay: 'left', bayOut: [-0.86, -0.98, 0.8] },
    { id: 5, label: 'L BAY IB', pos: [-0.38, -0.48, 0.8], allowed: [AIM120], mount: 'internal', bay: 'left', bayOut: [-0.38, -0.9, 0.8] },
    { id: 6, label: 'R BAY IB', pos: [0.38, -0.48, 0.8], allowed: [AIM120], mount: 'internal', bay: 'right', bayOut: [0.38, -0.9, 0.8] },
    { id: 7, label: 'R BAY OB', pos: [0.84, -0.4, 0.8], allowed: [AIM120, GBU31], mount: 'internal', bay: 'right', bayOut: [0.86, -0.98, 0.8] },
    { id: 8, label: 'RW IB', pos: [2.25, -0.52, 1.9], allowed: [AIM120, GBU32], mount: 'pylon', hang: -0.42 },
    { id: 9, label: 'RW MID', pos: [3.2, -0.48, 2.25], allowed: [AIM120, GBU32], mount: 'pylon', hang: -0.4 },
    { id: 10, label: 'RW OB', pos: [4.15, -0.42, 2.6], allowed: [AIM9], mount: 'pylon', hang: -0.36 },
  ],
  loadouts: [
    {
      id: 'f35-stealth',
      name: 'STEALTH — 4x AIM-120D (internal)',
      stores: { 4: AIM120, 5: AIM120, 6: AIM120, 7: AIM120 },
    },
    {
      id: 'f35-aa',
      name: 'AIR SUPERIORITY — 4x AIM-120D (internal), 2x AIM-9X',
      stores: { 1: AIM9, 4: AIM120, 5: AIM120, 6: AIM120, 7: AIM120, 10: AIM9 },
    },
    {
      id: 'f35-strike',
      name: 'STRIKE — 2x GBU-31 JDAM, 2x AIM-120D (internal)',
      stores: { 4: GBU31, 5: AIM120, 6: AIM120, 7: GBU31 },
    },
    {
      id: 'f35-beast',
      name: 'BEAST MODE — 8x AIM-120D, 2x AIM-9X',
      stores: { 1: AIM9, 2: AIM120, 3: AIM120, 4: AIM120, 5: AIM120, 6: AIM120, 7: AIM120, 8: AIM120, 9: AIM120, 10: AIM9 },
    },
    {
      id: 'f35-bomb',
      name: 'HEAVY STRIKE — 4x GBU-32, 2x GBU-31, 2x AIM-120D',
      stores: { 2: GBU32, 3: GBU32, 8: GBU32, 9: GBU32, 4: GBU31, 7: GBU31, 5: AIM120, 6: AIM120 },
    },
  ],
  radar: { name: 'AN/APG-81 AESA', kind: 'AESA', rangeNm: 100, azLimitDeg: 60, elLimitDeg: 60, maxTracks: 23, frameTime: 1.0 },
  irst: { name: 'AN/AAQ-40 EOTS', rangeNm: 45, fovDeg: 60 },
  ew: { name: 'AN/ASQ-239 with AN/AAQ-37 DAS', maws: true, jamming: 0.35, autoDispense: true },
  flightControl: 'Triplex digital fly-by-wire, carefree to 50 degrees angle of attack',
  chaff: 0,
  flares: 48,
  // a conventional signature (no stealth advantage in the game, as for the F-22)
  rcs: 7,
  irSignature: 0.95,
  gear: { nose: -5.1, main: 0.9, track: 1.55, height: 1.95 },
  hitRadius: 4.9,
  paint: { top: '#6b7075', bottom: '#73787d', accent: '#55595d' },
};

// ---------------------------------------------------------------------------
// Sukhoi Su-57 Felon
// ---------------------------------------------------------------------------
// Russia's fifth-generation fighter: big, fast and agile, with Su-35 heritage
// and three-dimensional thrust vectoring. Two tandem bays down the centre
// carry the R-77Ms; a small bay under each wing root holds one R-74M.
const SU57: AircraftSpec = {
  type: 'SU57',
  name: 'Sukhoi Su-57 Felon',
  shortName: 'Su-57',
  role: 'Fifth-generation air superiority fighter',
  crew: 1,
  description:
    'Russia\'s fifth-generation fighter: a big, fast airframe with blended lifting fuselage, all-moving tails and leading-edge root extensions that move. Two Saturn AL-41F1 engines (142 kN each in afterburner) supercruise it near Mach 1.3, push it to Mach 2 and 65,000 ft, and their nozzles vector in three dimensions for post-stall turns. Four R-77Ms in two tandem bays down the belly and one R-74M in each wing-root bay; six more stations on the wings. N036 Byelka AESA radar and the 101KS-V infrared search and track. GSh-30-1 30 mm cannon, 150 rounds.',
  lengthFt: 65.9,
  wingspanFt: 46.3,
  heightFt: 15.1,
  length: 20.1,
  span: 14.1,
  height: 4.6,
  emptyMass: 18000,
  internalFuel: 10300,
  maxTakeoff: 35000,
  maxTakeoffLb: 77160,
  payloadLb: 22000,
  wingArea: 78.8,
  cd0: 0.0185,
  waveDragPeak: 1.9,
  waveDragHigh: 1.45,
  kInduced: 0.11,
  clAlpha: 3.8,
  clMax: 2.15,
  alphaMaxDeg: 35,
  maxMach: 2.0,
  ceilingFt: 65600,
  maxIasKts: 760,
  engineName: '2 x Saturn AL-41F1 (izdeliye 117), 3D thrust vectoring',
  engines: 2,
  thrustMil: lbf(19840),
  thrustAb: lbf(32000),
  thrustMilLbf: 19840,
  thrustAbLbf: 32000,
  tsfcMil: 0.75,
  tsfcAb: 1.9,
  ramFactor: 0.66,
  spool: 1.35,
  gLimit: 9.0,
  gOverride: 10.5,
  gStructural: 13.5,
  gNeg: -3,
  rollRate: 270,
  pitchRate: 36,
  cornerKts: 310,
  rotateKts: 150,
  approachKts: 155,
  speedbrakeCd: 0.06,
  combatRangeNm: 1890,
  hardpoints: 12,
  maxAAM: 12,
  missiles: { radar: R77, ir: R74 },
  tvcDeg: 15,
  gun: {
    name: 'GSh-30-1 30mm cannon',
    caliberMm: 30,
    rounds: 150,
    rpm: 1800,
    muzzleVelocity: 860,
    damage: 19,
    dispersionMil: 4,
    port: [0.98, 0.12, -3.3],
  },
  stations: [
    { id: 1, label: 'LW OB', pos: [-5.1, -0.36, 3.1], allowed: [R74, R77], mount: 'pylon', hang: -0.32 },
    { id: 2, label: 'LW MID', pos: [-3.9, -0.4, 2.55], allowed: [R77, R74, KAB], mount: 'pylon', hang: -0.36 },
    { id: 3, label: 'LW IB', pos: [-2.7, -0.44, 2.0], allowed: [R77, KAB], mount: 'pylon', hang: -0.4 },
    { id: 4, label: 'L LEX BAY', pos: [-1.82, -0.06, -1.25], allowed: [R74], mount: 'internal', bay: 'left', bayOut: [-1.95, -0.5, -1.25] },
    { id: 5, label: 'BAY F-L', pos: [-0.33, -0.16, 0.65], allowed: [R77, KAB], mount: 'internal', bay: 'main', bayOut: [-0.33, -0.66, 0.65] },
    { id: 6, label: 'BAY F-R', pos: [0.33, -0.16, 0.65], allowed: [R77, KAB], mount: 'internal', bay: 'main', bayOut: [0.33, -0.66, 0.65] },
    { id: 7, label: 'BAY A-L', pos: [-0.33, -0.14, 4.75], allowed: [R77], mount: 'internal', bay: 'main', bayOut: [-0.33, -0.62, 4.75] },
    { id: 8, label: 'BAY A-R', pos: [0.33, -0.14, 4.75], allowed: [R77], mount: 'internal', bay: 'main', bayOut: [0.33, -0.62, 4.75] },
    { id: 9, label: 'R LEX BAY', pos: [1.82, -0.06, -1.25], allowed: [R74], mount: 'internal', bay: 'right', bayOut: [1.95, -0.5, -1.25] },
    { id: 10, label: 'RW IB', pos: [2.7, -0.44, 2.0], allowed: [R77, KAB], mount: 'pylon', hang: -0.4 },
    { id: 11, label: 'RW MID', pos: [3.9, -0.4, 2.55], allowed: [R77, R74, KAB], mount: 'pylon', hang: -0.36 },
    { id: 12, label: 'RW OB', pos: [5.1, -0.36, 3.1], allowed: [R74, R77], mount: 'pylon', hang: -0.32 },
  ],
  loadouts: [
    {
      id: 'su57-stealth',
      name: 'STEALTH — 4x R-77M, 2x R-74M (internal)',
      stores: { 4: R74, 5: R77, 6: R77, 7: R77, 8: R77, 9: R74 },
    },
    {
      id: 'su57-max',
      name: 'MAX AAM — 8x R-77M, 4x R-74M',
      stores: { 1: R74, 2: R77, 3: R77, 4: R74, 5: R77, 6: R77, 7: R77, 8: R77, 9: R74, 10: R77, 11: R77, 12: R74 },
    },
    {
      id: 'su57-strike',
      name: 'STRIKE — 4x KAB-500S, 2x R-77M, 2x R-74M',
      stores: { 2: KAB, 3: KAB, 10: KAB, 11: KAB, 4: R74, 9: R74, 7: R77, 8: R77 },
    },
    {
      id: 'su57-dog',
      name: 'DOGFIGHT — 2x R-77M, 6x R-74M',
      stores: { 1: R74, 2: R74, 4: R74, 9: R74, 11: R74, 12: R74, 5: R77, 6: R77 },
    },
  ],
  radar: { name: 'N036 Byelka AESA', kind: 'AESA', rangeNm: 100, azLimitDeg: 70, elLimitDeg: 60, maxTracks: 30, frameTime: 1.1 },
  irst: { name: '101KS-V IRST', rangeNm: 48, fovDeg: 90 },
  ew: { name: 'L402 Himalayas EW suite', maws: true, jamming: 0.35, autoDispense: true },
  flightControl: 'Digital fly-by-wire with integrated 3D thrust vectoring',
  chaff: 96,
  flares: 96,
  // a conventional signature (no stealth advantage in the game)
  rcs: 7,
  irSignature: 1.05,
  gear: { nose: -6.6, main: 1.0, track: 2.0, height: 2.15 },
  hitRadius: 5.8,
  paint: { top: '#7d8894', bottom: '#9aa6b0', accent: '#56616c' },
};

// ---------------------------------------------------------------------------
// Saab JAS 39E Gripen E
// ---------------------------------------------------------------------------
// The small one: a canard delta built to fly from roads, turn round in ten
// minutes and carry Meteor. The E has a bigger body for 40% more fuel, the
// F414 engine and an AESA radar on a swashplate that looks 100 degrees off
// the nose.
const GRIPEN: AircraftSpec = {
  type: 'GRIPEN',
  name: 'Saab JAS 39E Gripen E',
  shortName: 'Gripen E',
  role: 'Light multirole fighter',
  crew: 1,
  description:
    'The lightest fighter in the theater: a canard delta that turns hard, rolls fast and lands on a road. One General Electric F414G (98 kN in afterburner) gives Mach 2, and it supercruises at about Mach 1.15 with four missiles. The Raven ES-05 AESA radar sits on a tilting swashplate and sees 100 degrees either side of the nose, the widest field of regard in the game; Skyward-G IRST and the Arexis EW suite. Ten stations carry Meteor ramjet missiles and IRIS-T dogfight missiles, which can turn on a target behind the wing line. Mauser BK-27 27 mm cannon, 120 rounds.',
  lengthFt: 49.9,
  wingspanFt: 28.2,
  heightFt: 14.8,
  length: 15.2,
  span: 8.6,
  height: 4.5,
  emptyMass: 8000,
  internalFuel: 3400,
  maxTakeoff: 16500,
  maxTakeoffLb: 36400,
  payloadLb: 15900,
  wingArea: 30,
  cd0: 0.0195,
  waveDragPeak: 1.95,
  waveDragHigh: 1.5,
  kInduced: 0.125,
  clAlpha: 3.6,
  clMax: 1.9,
  alphaMaxDeg: 28,
  maxMach: 2.0,
  ceilingFt: 52000,
  maxIasKts: 750,
  engineName: '1 x General Electric F414G',
  engines: 1,
  // tuned so it supercruises (about Mach 1.15 with four missiles) in the game's
  // engine model, as Saab demonstrated (the display figure below is the real F414's)
  thrustMil: lbf(16500),
  thrustAb: lbf(22000),
  thrustMilLbf: 13000,
  thrustAbLbf: 22000,
  tsfcMil: 0.81,
  tsfcAb: 1.95,
  ramFactor: 0.6,
  spool: 1.6,
  gLimit: 9.0,
  gOverride: 9.0,
  gStructural: 13.5,
  gNeg: -3,
  rollRate: 280,
  pitchRate: 32,
  cornerKts: 330,
  rotateKts: 135,
  approachKts: 130,
  speedbrakeCd: 0.06,
  combatRangeNm: 1700,
  hardpoints: 10,
  maxAAM: 8,
  missiles: { radar: MTR, ir: IRIS },
  tvcDeg: 0,
  gun: {
    name: 'Mauser BK-27 27mm revolver cannon',
    caliberMm: 27,
    rounds: 120,
    rpm: 1700,
    muzzleVelocity: 1025,
    damage: 17,
    dispersionMil: 3.5,
    port: [-0.55, -0.42, -1.6],
  },
  stations: [
    { id: 1, label: 'LWT', pos: [-4.3, -0.34, 2.9], allowed: [IRIS], mount: 'rail' },
    { id: 2, label: 'LW OB', pos: [-3.4, -0.48, 2.45], allowed: [IRIS, MTR, AIM120], mount: 'pylon', hang: -0.32 },
    { id: 3, label: 'LW MID', pos: [-2.55, -0.52, 2.1], allowed: [MTR, AIM120, TANK, GBU39, PW4], mount: 'pylon', hang: -0.34 },
    { id: 4, label: 'LW IB', pos: [-1.65, -0.56, 1.6], allowed: [MTR, TANK, PW4], mount: 'pylon', hang: -0.36 },
    { id: 5, label: 'CL', pos: [0, -0.92, 0.4], allowed: [TANK, MTR], mount: 'pylon' },
    { id: 6, label: 'R FUS', pos: [0.62, -0.8, -1.2], allowed: [MTR, AIM120], mount: 'pylon' },
    { id: 7, label: 'RW IB', pos: [1.65, -0.56, 1.6], allowed: [MTR, TANK, PW4], mount: 'pylon', hang: -0.36 },
    { id: 8, label: 'RW MID', pos: [2.55, -0.52, 2.1], allowed: [MTR, AIM120, TANK, GBU39, PW4], mount: 'pylon', hang: -0.34 },
    { id: 9, label: 'RW OB', pos: [3.4, -0.48, 2.45], allowed: [IRIS, MTR, AIM120], mount: 'pylon', hang: -0.32 },
    { id: 10, label: 'RWT', pos: [4.3, -0.34, 2.9], allowed: [IRIS], mount: 'rail' },
  ],
  loadouts: [
    {
      id: 'gripen-aa',
      name: 'AIR SUPERIORITY — 4x METEOR, 2x IRIS-T',
      stores: { 1: IRIS, 3: MTR, 4: MTR, 7: MTR, 8: MTR, 10: IRIS },
    },
    {
      id: 'gripen-max',
      name: 'MAX AAM — 4x METEOR, 4x IRIS-T',
      stores: { 1: IRIS, 2: IRIS, 3: MTR, 4: MTR, 7: MTR, 8: MTR, 9: IRIS, 10: IRIS },
    },
    {
      id: 'gripen-cap',
      name: 'COMBAT AIR PATROL — 2x METEOR, 2x IRIS-T, CL TANK',
      stores: { 1: IRIS, 3: MTR, 5: TANK, 8: MTR, 10: IRIS },
    },
    {
      id: 'gripen-strike',
      name: 'STRIKE — 4x GBU-39 SDB, 2x METEOR, 2x IRIS-T, CL TANK',
      stores: { 1: IRIS, 10: IRIS, 3: GBU39, 8: GBU39, 4: PW4, 7: PW4, 2: MTR, 9: MTR, 5: TANK },
    },
  ],
  radar: { name: 'Leonardo Raven ES-05 AESA (swashplate)', kind: 'AESA', rangeNm: 80, azLimitDeg: 100, elLimitDeg: 60, maxTracks: 30, frameTime: 1.1 },
  irst: { name: 'Skyward-G IRST', rangeNm: 40, fovDeg: 90 },
  ew: { name: 'Saab Arexis', maws: true, jamming: 0.35, autoDispense: true },
  flightControl: 'Triplex digital fly-by-wire, relaxed stability canard delta',
  chaff: 80,
  flares: 40,
  rcs: 1.2,
  irSignature: 0.75,
  gear: { nose: -4.55, main: 0.9, track: 1.2, height: 1.6 },
  hitRadius: 4.1,
  paint: { top: '#848c92', bottom: '#9aa1a6', accent: '#5d656b' },
};

export const SPECS: Record<AircraftType, AircraftSpec> = {
  F15EX: F15EX,
  FA18EF: FA18,
  F16C: F16,
  TYPHOON: TYPHOON,
  SU35: SU35,
  RAFALE: RAFALE,
  F22: F22,
  F35A: F35A,
  SU57: SU57,
  GRIPEN: GRIPEN,
  MIG31: MIG31,
  SR71: SR71,
  X15: X15,
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
  GBU31: { type: 'GBU31', name: 'GBU-31 JDAM (2,000 lb)', mass: 934, dragCd: 0.0042, length: 3.88, diameter: 0.46 },
  GBU32: { type: 'GBU32', name: 'GBU-32 JDAM (1,000 lb)', mass: 460, dragCd: 0.0028, length: 3.03, diameter: 0.36 },
  GBU39: { type: 'GBU39', name: 'GBU-39 Small Diameter Bomb', mass: 129, dragCd: 0.0008, length: 1.8, diameter: 0.19 },
  PAVEWAY4: { type: 'PAVEWAY4', name: 'Paveway IV (500 lb)', mass: 226, dragCd: 0.0019, length: 3.0, diameter: 0.27 },
  AASM: { type: 'AASM', name: 'AASM Hammer', mass: 340, dragCd: 0.0024, length: 3.1, diameter: 0.3 },
  KAB500: { type: 'KAB500', name: 'KAB-500S', mass: 560, dragCd: 0.0032, length: 3.0, diameter: 0.4 },
  R37M: { type: 'R37M', name: 'R-37M', mass: 510, dragCd: 0.0026, length: 4.2, diameter: 0.38 },
  IRIST: { type: 'IRIST', name: 'Diehl IRIS-T', mass: 87.4, dragCd: 0.0007, length: 2.94, diameter: 0.127 },
};

/** A strike loadout for this jet (the airstrike mode flies it). */
export function strikeLoadout(spec: AircraftSpec): LoadoutPreset {
  return spec.loadouts.find((l) => l.id.endsWith('-strike')) ?? spec.loadouts[0];
}

/** Fuel carried in each external tank (kg, JP-8 at 480 US gal). */
export const TANK_FUEL = 1450;

/** Enemy types the spawner may use: never the player's own type. */
export function enemyTypesFor(player: AircraftType): AircraftType[] {
  return COMBAT_TYPES.filter((t) => t !== player);
}
