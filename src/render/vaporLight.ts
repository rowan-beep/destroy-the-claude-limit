// The light the vapour is lit by, read from the scene's own sun and sky lights so it
// matches the jets and clouds around it: warm and low at dusk, cold and flat under an
// overcast, dark at night. Everything is in the same display-linear units the cloud
// puffs use (a white surface full in the sun is about 1).

import * as THREE from 'three';

export interface VaporLight {
  /** unit vector toward the sun (world) */
  sunDir: THREE.Vector3;
  /** sunlight on a surface facing it */
  sunCol: THREE.Color;
  /** the sky's fill light */
  ambCol: THREE.Color;
  /** how damp the air is, 0.5 (dry) .. 1.25 (rain): scales how readily vapour forms */
  humidity: number;
}

/** how readily the air makes vapour in this weather: a dry clear day is shy, rain and storms are eager */
export function humidityOf(kind: string): number {
  switch (kind) {
    case 'clear': return 0.85;
    case 'cloudy': return 1;
    case 'overcast': return 1.1;
    case 'rain': return 1.25;
    case 'storm': return 1.3;
    case 'snow': return 0.95;
    default: return 1;
  }
}

export function newVaporLight(): VaporLight {
  return { sunDir: new THREE.Vector3(0, 1, 0), sunCol: new THREE.Color(1, 1, 1), ambCol: new THREE.Color(0.35, 0.4, 0.5), humidity: 1 };
}

const cache = new WeakMap<THREE.Scene, { sun: THREE.DirectionalLight | null; hemi: THREE.HemisphereLight | null }>();
const _c = new THREE.Color();

/** Fill `out` from the scene's lights (`sunDir` overrides the sun's direction when given). */
export function sampleVaporLight(scene: THREE.Scene, out: VaporLight, sunDir?: THREE.Vector3): void {
  let c = cache.get(scene);
  if (!c || (!c.sun && !c.hemi)) {
    c = { sun: null, hemi: null };
    for (const o of scene.children) {
      if ((o as THREE.DirectionalLight).isDirectionalLight && (!c.sun || o.castShadow)) c.sun = o as THREE.DirectionalLight;
      else if ((o as THREE.HemisphereLight).isHemisphereLight) c.hemi = o as THREE.HemisphereLight;
    }
    cache.set(scene, c);
  }
  if (sunDir) out.sunDir.copy(sunDir).normalize();
  else if (c.sun) out.sunDir.copy(c.sun.position).sub(c.sun.target.position).normalize();
  if (c.sun) out.sunCol.copy(c.sun.color).multiplyScalar((c.sun.intensity / Math.PI) * 1.05);
  if (c.hemi) {
    _c.copy(c.hemi.groundColor).lerp(c.hemi.color, 0.7);
    // (a cloud's shade is bright and not very blue: the whole sky fills it, and the cloud around it bounces more)
    const luma = _c.r * 0.3 + _c.g * 0.59 + _c.b * 0.11;
    _c.r += (luma - _c.r) * 0.35;
    _c.g += (luma - _c.g) * 0.35;
    _c.b += (luma - _c.b) * 0.35;
    out.ambCol.copy(_c).multiplyScalar((c.hemi.intensity / Math.PI) * 1.2);
  }
}
