// Air-to-air missile performance data (AIM-120D AMRAAM, AIM-9X Block II).

export type MissileType = 'AIM120D' | 'AIM9X';
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
};

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
  if (type === 'AIM120D') {
    const base = 22000 + 58000 * altF;
    const rmax = Math.max(4000, base * speedF * climbF * closeF);
    return { rmin: 900, rmax, rne: rmax * 0.42 };
  }
  const base = 6500 + 12500 * altF;
  const rmax = Math.max(1500, base * speedF * climbF * Math.max(0.55, closeF));
  return { rmin: 300, rmax, rne: rmax * 0.5 };
}
