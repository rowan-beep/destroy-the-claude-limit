// Replaces three.js' fog shader chunks with an altitude-aware aerial
// perspective model: dense aerosol haze near the sea that thins out with
// height, plus a thin Rayleigh component. Flying at 40,000 ft gives crisp
// views of the islands far below; at wave-top height the horizon melts into
// haze exactly like the reference screenshots.

import * as THREE from 'three';

let installed = false;

/**
 * Sun in-scattering for the haze, shared by every fogged material:
 * xyz = direction to the sun, w = strength (0 = off). Plain typed arrays so
 * three.js passes them to each material by reference (never cloned).
 */
export const FOG_SUN = new Float32Array([0, 1, 0, 0]);
/** colour of the sunlit haze (linear) */
export const FOG_SUN_COLOR = new Float32Array([1, 0.9, 0.75]);

export const FOG_AEROSOL_SCALE_HEIGHT = 1900;
export const FOG_RAYLEIGH_SCALE_HEIGHT = 8000;
/**
 * Which way is up for the haze: xyz = up, w = the camera's height above the
 * ground. The default (w below -1e8) is the theaters' world: +Y up, the
 * camera's y its height. Scenes on another body (Mars, round its floating
 * origin) set their own and put the default back after drawing.
 */
export const FOG_FRAME = new Float32Array([0, 1, 0, -1e9]);
/** inverse scale heights of the aerosol and the clear-air haze (1/m) */
export const FOG_SCALE = new Float32Array([1 / FOG_AEROSOL_SCALE_HEIGHT, 1 / FOG_RAYLEIGH_SCALE_HEIGHT]);
export function resetFogFrame(): void {
  FOG_FRAME.set([0, 1, 0, -1e9]);
  FOG_SCALE.set([1 / FOG_AEROSOL_SCALE_HEIGHT, 1 / FOG_RAYLEIGH_SCALE_HEIGHT]);
}

function addFogSunUniforms(u: Record<string, THREE.IUniform>): void {
  u.fogSun = { value: FOG_SUN };
  u.fogSunColor = { value: FOG_SUN_COLOR };
  u.fogFrame = { value: FOG_FRAME };
  u.fogScale = { value: FOG_SCALE };
}

export function installAltitudeFog(): void {
  if (installed) return;
  installed = true;
  addFogSunUniforms(THREE.UniformsLib.fog as unknown as Record<string, THREE.IUniform>);
  for (const k of Object.keys(THREE.ShaderLib)) {
    const u = (THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform> }>)[k].uniforms;
    if (u && 'fogColor' in u) addFogSunUniforms(u);
  }
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogRel;
#endif
`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogRel = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif
`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec4 fogSun;
  uniform vec3 fogSunColor;
  uniform vec4 fogFrame;
  uniform vec2 fogScale;
  varying vec3 vFogRel;
  // haze lit by the sun: bright forward-scattering glow toward the sun (Mie)
  vec3 hazeColor( vec3 rel ) {
    float mu = max( dot( rel / max( length( rel ), 1e-3 ), fogSun.xyz ), 0.0 );
    float glow = pow( mu, 5.0 ) * 0.28 + pow( mu, 24.0 ) * 0.42 + pow( mu, 180.0 ) * 0.6;
    return fogColor + fogSunColor * glow * fogSun.w;
  }
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  float altitudeFogFactor( vec3 rel ) {
    float dist = length( rel );
    #ifdef FOG_EXP2
      bool world = fogFrame.w < -1e8;
      float h0 = max( world ? cameraPosition.y : fogFrame.w, 0.0 );
      float dy = world ? rel.y : dot( rel, fogFrame.xyz );
      float bA = fogScale.x;
      float bR = fogScale.y;
      float kA = 1.0, kR = 1.0;
      if ( abs( dy ) > 1.0 ) {
        kA = ( 1.0 - exp( -bA * dy ) ) / ( bA * dy );
        kR = ( 1.0 - exp( -bR * dy ) ) / ( bR * dy );
      }
      float integ = dist * ( fogDensity * exp( -bA * h0 ) * kA + fogDensity * 0.16 * exp( -bR * h0 ) * kR );
      return 1.0 - exp( -integ );
    #else
      return smoothstep( fogNear, fogFar, dist );
    #endif
  }
#endif
`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogFactor = altitudeFogFactor( vFogRel );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, linearToOutputTexel( vec4( hazeColor( vFogRel ), 1.0 ) ).rgb, fogFactor );
#endif
`;
}
