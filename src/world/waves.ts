// Moving sea for the OPEN OCEAN map: a few long swells and wind waves
// rolling across the water. The same sum of waves runs in the water shader
// (vertex heights near the camera) and here on the CPU (the carriers' wakes
// ride it), so both agree. The other maps keep their still water.

import { activeMap } from './islands';

/** direction the wave travels (deg, clockwise from north), wavelength (m), amplitude (m), phase */
const WAVES: [number, number, number, number][] = [
  [35, 96, 0.6, 0.0],
  [62, 63, 0.36, 1.7],
  [14, 38, 0.2, 4.1],
  [80, 24, 0.1, 2.6],
];

const G = 9.81;
const DEG = Math.PI / 180;

/** Per wave: kx, kz (rad/m along the travel direction), angular speed, amplitude, phase, wavelength. */
export const WAVE_TABLE = WAVES.map(([dir, len, amp, ph]) => {
  const k = (2 * Math.PI) / len;
  // deep-water dispersion: longer waves run faster
  const w = Math.sqrt(G * k);
  return { kx: Math.sin(dir * DEG) * k, kz: -Math.cos(dir * DEG) * k, w, amp, ph, len };
});

/** Does the active map have a moving sea? */
export function seaMoves(): boolean {
  return activeMap.id === 'ocean';
}

/**
 * Sea surface height (m) at (x, z), time t (s), for a viewer `dist` metres
 * away (short waves fade out with distance, as in the shader).
 */
export function waveHeight(x: number, z: number, t: number, dist = 0): number {
  let h = 0;
  for (const s of WAVE_TABLE) {
    const fade = 1 - smooth(s.len * 4, s.len * 12, dist);
    if (fade <= 0) continue;
    h += s.amp * fade * Math.sin(s.kx * x + s.kz * z - s.w * t + s.ph);
  }
  return h;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** GLSL: the same waves (uniform `time`), height and slope for a viewer `dist` away. */
export function wavesGlsl(): string {
  const lines = WAVE_TABLE.map(
    (s) =>
      `  { float f = 1.0 - smoothstep( ${(s.len * 4).toFixed(1)}, ${(s.len * 12).toFixed(1)}, dist );` +
      ` float a = ${s.amp.toFixed(3)} * f; float q = ${s.kx.toFixed(6)} * p.x + ${s.kz.toFixed(6)} * p.y - ${s.w.toFixed(6)} * t + ${s.ph.toFixed(3)};` +
      ` h += a * sin( q ); d += a * cos( q ) * vec2( ${s.kx.toFixed(6)}, ${s.kz.toFixed(6)} ); }`,
  );
  return `
vec3 seaWaves( vec2 p, float t, float dist ) {
  float h = 0.0; vec2 d = vec2( 0.0 );
${lines.join('\n')}
  return vec3( h, d );
}
`;
}
