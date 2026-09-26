// Replaces three.js' fog shader chunks with an altitude-aware aerial
// perspective model: dense aerosol haze near the sea that thins out with
// height, plus a thin Rayleigh component. Flying at 40,000 ft gives crisp
// views of the islands far below; at wave-top height the horizon melts into
// haze exactly like the reference screenshots.

import * as THREE from 'three';

let installed = false;

export const FOG_AEROSOL_SCALE_HEIGHT = 1900;
export const FOG_RAYLEIGH_SCALE_HEIGHT = 8000;

export function installAltitudeFog(): void {
  if (installed) return;
  installed = true;
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
  varying vec3 vFogRel;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  float altitudeFogFactor( vec3 rel ) {
    float dist = length( rel );
    #ifdef FOG_EXP2
      float h0 = max( cameraPosition.y, 0.0 );
      float dy = rel.y;
      float bA = 1.0 / ${FOG_AEROSOL_SCALE_HEIGHT.toFixed(1)};
      float bR = 1.0 / ${FOG_RAYLEIGH_SCALE_HEIGHT.toFixed(1)};
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
  gl_FragColor.rgb = mix( gl_FragColor.rgb, linearToOutputTexel( vec4( fogColor, 1.0 ) ).rgb, fogFactor );
#endif
`;
}
