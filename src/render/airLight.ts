// Lighting terms shared by every aircraft paint shader.
//
// A jet's belly and lower sides are lit mostly by sunlight bouncing off the
// ground and sea below. The hemisphere light alone leaves them nearly black
// (it has no idea how bright the sunlit ground is), so the environment
// computes that bounce each frame from the sun's colour, strength and
// elevation and a typical ground albedo, and the paint adds it in proportion
// to how much of each surface faces the ground.

import * as THREE from 'three';

export const AIR_LIGHT = {
  /** radiance bounced up from the ground (linear RGB) */
  airBounce: { value: new THREE.Color(0, 0, 0) },
};

/** Ground albedo seen from the air: land, sea and cloud tops averaged. */
const ALBEDO = 0.24;

export function updateAirLight(sunColor: THREE.Color, sunIntensity: number, sunElev: number): void {
  AIR_LIGHT.airBounce.value.copy(sunColor).multiplyScalar(sunIntensity * ALBEDO * Math.max(0, Math.sin(sunElev)) * 0.55);
}
