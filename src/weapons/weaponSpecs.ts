// Air-to-air missile performance data: AIM-120D AMRAAM and AIM-9X Block II
// for the US / European jets, R-77M and R-74M for the Su-35S, and Meteor and
// MICA IR for the Rafale.

export type MissileType = 'AIM120D' | 'AIM9X' | 'R77M' | 'R74M' | 'METEOR' | 'MICAIR';
export type WeaponSelect = 'GUN' | MissileType;

export interface MissileSpec {
  type: MissileType;
  name: string;
  short: string;
  seeker: 'ARH' | 'IR';
  mass0: number;
  massBurnout: number;
  burnTime: number;
  thrust: number;
  refArea: number;
  maxG: number;
  /** dynamic pressure at which the full G is available */
  qFullG: number;
  gimbalDeg: number;
  /** ARH: pitbull (seeker goes active) range; IR: base lock range (MIL power, tail aspect) */
  seekerRange: number;
  fuseRadius: number;
  lethalRadius: number;
  damage: number;
  maxTime: number;
  minRange: number;
  navConstant: number;
  loft: boolean;
  /** counter-countermeasure resistance 0..1 */
  ccm: number;
  length: number;
  diameter: number;
  description: string;
  /**
   * Air-breathing sustainer after the boost (Meteor's throttleable ramjet):
   * thrust (N) for this many seconds after the booster burns out.
   */
  sustain?: { thrust: number; time: number };
}

export const MISSILES: Record<MissileType, MissileSpec> = {
  AIM120D: {
    type: 'AIM120D',
    name: 'AIM-120D AMRAAM',
    short: 'AIM-120D',
    seeker: 'ARH',
    mass0: 161.5,
    massBurnout: 112,
    burnTime: 8,
    thrust: 15200,
    refArea: 0.0249,
    maxG: 40,
    qFullG: 90000,
    gimbalDeg: 60,
    seekerRange: 18500,
    fuseRadius: 9,
    lethalRadius: 15,
    damage: 170,
    maxTime: 100,
    minRange: 900,
    navConstant: 4,
    loft: true,
    ccm: 0.35,
    length: 3.66,
    diameter: 0.178,
    description: 'Active-radar beyond-visual-range missile. Datalink midcourse updates, lofted trajectory, goes active (PITBULL) at ~10 NM.',
  },
  AIM9X: {
    type: 'AIM9X',
    name: 'AIM-9X Sidewinder Block II',
    short: 'AIM-9X',
    seeker: 'IR',
    mass0: 85.3,
    massBurnout: 57,
    burnTime: 5.2,
    thrust: 12800,
    refArea: 0.01267,
    maxG: 55,
    qFullG: 55000,
    gimbalDeg: 90,
    seekerRange: 10500,
    fuseRadius: 6,
    lethalRadius: 10,
    damage: 125,
    maxTime: 45,
    minRange: 300,
    navConstant: 4.5,
    loft: false,
    ccm: 0.55,
    length: 3.02,
    diameter: 0.127,
    description: 'Imaging-infrared, thrust-vectored, high off-boresight dogfight missile. Lock-on before launch; strong flare rejection.',
  },
  R77M: {
    type: 'R77M',
    name: 'R-77M (izdeliye 180)',
    short: 'R-77M',
    seeker: 'ARH',
    mass0: 190,
    massBurnout: 128,
    burnTime: 10,
    thrust: 16800,
    refArea: 0.0314,
    maxG: 38,
    qFullG: 95000,
    gimbalDeg: 55,
    seekerRange: 20000,
    fuseRadius: 10,
    lethalRadius: 16,
    damage: 175,
    maxTime: 110,
    minRange: 1000,
    navConstant: 4,
    loft: true,
    ccm: 0.3,
    length: 3.71,
    diameter: 0.2,
    description: 'Active-radar long-range missile with a dual-pulse motor and a conventional tail (no lattice fins). Longest reach in the theater, a little easier to decoy than the AIM-120D.',
  },
  R74M: {
    type: 'R74M',
    name: 'R-74M',
    short: 'R-74M',
    seeker: 'IR',
    mass0: 105,
    massBurnout: 70,
    burnTime: 5.5,
    thrust: 14500,
    refArea: 0.0227,
    maxG: 50,
    qFullG: 58000,
    gimbalDeg: 75,
    seekerRange: 11000,
    fuseRadius: 6.5,
    lethalRadius: 11,
    damage: 130,
    maxTime: 45,
    minRange: 300,
    navConstant: 4.3,
    loft: false,
    ccm: 0.5,
    length: 2.92,
    diameter: 0.17,
    description: 'Infrared dogfight missile with canards and gas-dynamic thrust vectoring. High off-boresight through the helmet sight, slightly longer range than the AIM-9X.',
  },
  METEOR: {
    type: 'METEOR',
    name: 'MBDA Meteor',
    short: 'METEOR',
    seeker: 'ARH',
    mass0: 190,
    massBurnout: 150,
    // solid booster, then the throttleable ducted rocket (ramjet) cruises for most of the flight
    burnTime: 3.2,
    thrust: 17000,
    sustain: { thrust: 2500, time: 85 },
    refArea: 0.0249,
    maxG: 38,
    qFullG: 90000,
    gimbalDeg: 60,
    seekerRange: 19500,
    fuseRadius: 9,
    lethalRadius: 15,
    damage: 175,
    maxTime: 240,
    minRange: 1200,
    navConstant: 4,
    loft: true,
    ccm: 0.4,
    length: 3.65,
    diameter: 0.178,
    description: 'Ramjet-powered beyond-visual-range missile: a short rocket boost, then an air-breathing ducted rocket that keeps it powered and fast to the end. Reaches about 92 NM from 40,000 ft at Mach 1.3 (about 52 NM at 20,000 ft) with a no-escape zone of about 34 NM, the biggest in the theater. Rafale only.',
  },
  MICAIR: {
    type: 'MICAIR',
    name: 'MBDA MICA IR',
    short: 'MICA IR',
    seeker: 'IR',
    mass0: 112,
    massBurnout: 72,
    burnTime: 5.8,
    thrust: 14000,
    refArea: 0.0201,
    maxG: 50,
    qFullG: 58000,
    gimbalDeg: 60,
    seekerRange: 12000,
    fuseRadius: 6.5,
    lethalRadius: 11,
    damage: 128,
    maxTime: 55,
    minRange: 300,
    navConstant: 4.4,
    loft: false,
    ccm: 0.55,
    length: 3.1,
    diameter: 0.16,
    description: 'Imaging-infrared missile with thrust vectoring and long body strakes. Reaches about 27 NM from 40,000 ft and 18 NM at 20,000 ft, longer than the other heat-seekers (it doubles as a medium-range missile), launched from the Rafale\'s wingtips and pylons. Rafale only.',
  },
};

/** Infrared (Fox 2) or radar (Fox 3)? */
export function isIrMissile(t: MissileType): boolean {
  return MISSILES[t].seeker === 'IR';
}


/** Drag coefficient vs Mach for a slender missile body. */
export function missileCd(M: number, motorOn: boolean): number {
  let cd: number;
  if (M < 0.8) cd = 0.32;
  else if (M < 1.15) cd = 0.32 + (M - 0.8) * 0.9;
  else cd = Math.max(0.28, 0.63 - (M - 1.15) * 0.12);
  // base drag disappears while the motor is burning
  return motorOn ? cd * 0.78 : cd;
}

/**
 * Rough dynamic launch zone (metres) for HUD cues and AI shot decisions.
 * aspectCos: +1 = target flying straight at the shooter, -1 = running away.
 */
export function launchZone(
  type: MissileType,
  shooterAlt: number,
  shooterMach: number,
  targetAlt: number,
  aspectCos: number,
  targetSpeed: number,
): { rmin: number; rmax: number; rne: number } {
  const avgAlt = (shooterAlt * 2 + targetAlt) / 3;
  const altF = Math.min(1, Math.max(0, avgAlt / 12000));
  const speedF = 1 + 0.35 * Math.max(-0.5, Math.min(1.2, shooterMach - 0.9));
  const climbF = 1 + Math.max(-0.35, Math.min(0.25, (shooterAlt - targetAlt) / 12000));
  const closeF = 0.55 + 0.45 * ((aspectCos + 1) / 2) + (aspectCos > 0 ? (aspectCos * targetSpeed) / 1400 : (aspectCos * targetSpeed) / 900);
  const reach = type === 'R77M' ? 1.12 : type === 'R74M' ? 1.06 : type === 'METEOR' ? 1.6 : type === 'MICAIR' ? 1.2 : 1;
  if (!isIrMissile(type)) {
    const base = (22000 + 58000 * altF) * reach;
    const rmax = Math.max(4000, base * speedF * climbF * closeF);
    // the ramjet keeps Meteor powered to the end: a far bigger no-escape zone
    return { rmin: MISSILES[type].minRange, rmax, rne: rmax * (type === 'METEOR' ? 0.36 : 0.42) };
  }
  const base = (6500 + 12500 * altF) * reach;
  const rmax = Math.max(1500, base * speedF * climbF * Math.max(0.55, closeF));
  return { rmin: 300, rmax, rne: rmax * 0.5 };
}

/** Short display code (HUD, MFD). */
export function weaponCode(t: MissileType): string {
  return t === 'AIM120D' ? '120D' : t === 'AIM9X' ? '9X' : t === 'R77M' ? 'R77M' : t === 'R74M' ? 'R74M' : t === 'METEOR' ? 'MTR' : 'MICA';
}

/**
 * The radio call when this missile leaves the rail. NATO pilots use the
 * brevity code (FOX 3 active radar, FOX 2 infrared). Russian pilots call
 * "Pusk!" (Пуск, "launch!") for any missile.
 */
export function launchCall(t: MissileType): { feed: string; voice: string; voiceRu?: string } {
  if (t === 'R77M' || t === 'R74M') return { feed: 'PUSK!', voice: 'Pusk!', voiceRu: 'Пуск!' };
  return isIrMissile(t) ? { feed: 'FOX 2', voice: 'Fox two' } : { feed: 'FOX 3', voice: 'Fox three' };
}
