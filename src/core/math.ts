import * as THREE from 'three';
import { DEG, RAD } from './constants';

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v: number, a0: number, a1: number, b0: number, b1: number): number =>
  lerp(b0, b1, clamp01(invLerp(a0, a1, v)));

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function smootherstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export const sign = (v: number): number => (v < 0 ? -1 : 1);

/** Wrap an angle in radians into (-PI, PI]. */
export function wrapPi(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

/** Wrap degrees into [0, 360). */
export function wrap360(d: number): number {
  d = d % 360;
  return d < 0 ? d + 360 : d;
}

/** Exponential approach, frame-rate independent. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export const toRad = (d: number): number => d * DEG;
export const toDeg = (r: number): number => r * RAD;

/** Heading in degrees (0 = north / -Z, 90 = east / +X) of a world direction. */
export function headingOf(v: THREE.Vector3): number {
  return wrap360(Math.atan2(v.x, -v.z) * RAD);
}

/** Unit vector for a heading (deg) and pitch (deg). */
export function dirFromHeadingPitch(hdgDeg: number, pitchDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const h = hdgDeg * DEG;
  const p = pitchDeg * DEG;
  const c = Math.cos(p);
  return out.set(Math.sin(h) * c, Math.sin(p), -Math.cos(h) * c);
}

/** Horizontal (XZ) distance. */
export function distXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Bearing in degrees from point a to point b on the map. */
export function bearingXZ(ax: number, az: number, bx: number, bz: number): number {
  return wrap360(Math.atan2(bx - ax, -(bz - az)) * RAD);
}

/** Angle between two vectors in radians (safe for non-normalised inputs). */
export function angleBetween(a: THREE.Vector3, b: THREE.Vector3): number {
  const d = a.length() * b.length();
  if (d < 1e-9) return 0;
  return Math.acos(clamp(a.dot(b) / d, -1, 1));
}

/**
 * Closest approach between two points moving linearly over a step.
 * Returns the minimum distance between segment (a0->a1) and (b0->b1) when
 * both move at uniform speed over the same interval.
 */
export function closestApproach(
  a0: THREE.Vector3,
  a1: THREE.Vector3,
  b0: THREE.Vector3,
  b1: THREE.Vector3,
): { dist: number; t: number } {
  // relative motion: r(t) = (a0-b0) + t*((a1-a0)-(b1-b0))
  const rx = a0.x - b0.x, ry = a0.y - b0.y, rz = a0.z - b0.z;
  const vx = a1.x - a0.x - (b1.x - b0.x);
  const vy = a1.y - a0.y - (b1.y - b0.y);
  const vz = a1.z - a0.z - (b1.z - b0.z);
  const vv = vx * vx + vy * vy + vz * vz;
  let t = vv > 1e-12 ? -(rx * vx + ry * vy + rz * vz) / vv : 0;
  t = clamp01(t);
  const dx = rx + vx * t, dy = ry + vy * t, dz = rz + vz * t;
  return { dist: Math.sqrt(dx * dx + dy * dy + dz * dz), t };
}

/** Distance from point p to the segment a-b and the parametric position. */
export function pointSegmentDistance(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): { dist: number; t: number } {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-12 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = clamp01(t);
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return { dist: Math.sqrt(dx * dx + dy * dy + dz * dz), t };
}

/** 2D distance from point to segment in the XZ plane. */
export function pointSegDist2D(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax, abz = bz - az;
  const ab2 = abx * abx + abz * abz;
  let t = ab2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / ab2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + abx * t), dz = pz - (az + abz * t);
  return Math.sqrt(dx * dx + dz * dz);
}

// Scratch objects reused in hot loops to avoid garbage.
export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _v3 = new THREE.Vector3();
export const _v4 = new THREE.Vector3();
export const _q1 = new THREE.Quaternion();
export const _q2 = new THREE.Quaternion();
export const _m1 = new THREE.Matrix4();

export const AXIS_X = new THREE.Vector3(1, 0, 0);
export const AXIS_Y = new THREE.Vector3(0, 1, 0);
export const AXIS_Z = new THREE.Vector3(0, 0, 1);
export const FORWARD = new THREE.Vector3(0, 0, -1);
export const UP = new THREE.Vector3(0, 1, 0);
export const RIGHT = new THREE.Vector3(1, 0, 0);

/** Format helpers used across the HUD. */
export function pad(n: number, width: number, ch = '0'): string {
  let s = String(Math.abs(Math.round(n)));
  while (s.length < width) s = ch + s;
  return (n < 0 ? '-' : '') + s;
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${pad(m, 2)}:${pad(s % 60, 2)}`;
}

/** Colour from sRGB components (0..1) converted into the linear working space. */
export function srgb(r: number, g: number, b: number): THREE.Color {
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

/** sRGB component -> linear. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
