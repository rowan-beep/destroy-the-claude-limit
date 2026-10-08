// What the sea bed looks like up close, worked out per pixel on top of the
// tile's colour: wave ripples in the sand (crests across the swell, longer and
// fainter with depth as the waves' reach dies away), grains and shell hash,
// patches of coarser and finer sand; lumpy, cracked rock with dark crevices and
// pink coralline crusts in the shallows; and on the deep silt the low mounds
// and burrow holes the animals living in it leave. The relief tilts the
// surface's normal (the light and the caustics pick it out) and shades its
// colour; both fade with distance so nothing shimmers far off.

import * as THREE from 'three';

/** 0 off, 1 colour only, 2 colour and relief (set by the preset) */
export const SEABED_DETAIL = { value: 2 };

const PARS = /* glsl */ `
uniform float uSbDetail;
float sbHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float sbNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( sbHash( i ), sbHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( sbHash( i + vec2( 0.0, 1.0 ) ), sbHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
// burrows and mounds on the silt: one of each at a random place in some cells
float sbBurrows( vec2 p ) {
  vec2 c = floor( p / 1.3 ), f = p / 1.3 - c;
  float r = 0.0;
  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
    vec2 g = c + vec2( float( x ), float( y ) );
    float h = sbHash( g );
    vec2 o = vec2( sbHash( g + 7.1 ), sbHash( g + 3.7 ) ) + vec2( float( x ), float( y ) );
    float d = length( ( f - o ) * 1.3 );
    if ( h < 0.45 ) r -= 0.045 * ( 1.0 - smoothstep( 0.02, 0.07, d ) );
    else if ( h < 0.75 ) r += 0.05 * ( 1.0 - smoothstep( 0.0, 0.3, d ) );
  }
  return r;
}
// the ground's relief (m) and how much of it is a ripple trough (for the colour)
float sbRelief( vec2 p, float depth, float rock, float silt, out float trough ) {
  // ripples: across the swell (it runs toward 200°), wavelength and height growing a little with depth, gone below about 90 m
  vec2 dir = vec2( -0.342, 0.940 );
  // (bent only gently: long, nearly straight crests that fork here and there)
  float warp = sbNoise( p * 0.035 ) * 4.5 + sbNoise( p * 0.21 ) * 0.6;
  float lam = mix( 0.42, 1.3, smoothstep( 4.0, 60.0, depth ) );
  float s = 0.5 + 0.5 * sin( ( dot( p, dir ) + warp ) / lam * 6.2832 );
  float rip = pow( s, 1.7 ) - 0.45;
  float amp = lam * 0.085 * ( 1.0 - smoothstep( 25.0, 90.0, depth ) ) * ( 0.45 + 0.55 * sbNoise( p * 0.045 + 3.0 ) );
  trough = ( 1.0 - s ) * ( amp > 0.0 ? 1.0 : 0.0 );
  float sand = rip * amp + ( sbNoise( p * 6.0 ) - 0.5 ) * 0.014;
  float rk = ( sbNoise( p * 0.8 ) - 0.5 ) * 0.4 + ( sbNoise( p * 2.9 ) - 0.5 ) * 0.13 + ( sbNoise( p * 8.7 ) - 0.5 ) * 0.035;
  float sl = sbBurrows( p ) + ( sbNoise( p * 0.6 ) - 0.5 ) * 0.06;
  return mix( mix( sand, rk, rock ), sl, silt );
}
`;

const ALBEDO = /* glsl */ `
float sbRock = 0.0, sbSilt = 0.0, sbFade = 0.0, sbTrough = 0.0, sbRel = 0.0, sbDepth = 0.0;
vec2 sbP = vOcWorld.xz;
if ( uSbDetail > 0.0 && vOcWorld.y < 0.3 ) {
  sbDepth = -vOcWorld.y;
  sbRock = 1.0 - smoothstep( 0.78, 0.9, vOcNormal.y );
  sbSilt = smoothstep( 140.0, 170.0, sbDepth ) * ( 1.0 - sbRock );
  float sbDist = length( vOcWorld - cameraPosition );
  sbFade = 1.0 - smoothstep( 25.0, 140.0, sbDist );
  sbRel = sbRelief( sbP, sbDepth, sbRock, sbSilt, sbTrough );
  // large patches of coarser and finer sediment (seen from far as well)
  float patches = 0.82 + 0.36 * sbNoise( sbP * 0.11 ) * sbNoise( sbP * 0.023 + 5.0 );
  vec3 k = vec3( patches );
  if ( sbFade > 0.0 ) {
    // heavy minerals settle in the ripple troughs; shell hash glints on the crests
    // (small round fragments at random places, not the cells they are drawn from)
    vec2 sc = floor( sbP * 9.0 ), sf = fract( sbP * 9.0 ) - 0.5 - ( vec2( sbHash( sc + 1.7 ), sbHash( sc + 4.3 ) ) - 0.5 ) * 0.6;
    float shell = step( 0.9, sbHash( sc ) ) * ( 1.0 - smoothstep( 0.05, 0.12, length( sf * vec2( 1.0, 1.6 ) ) ) ) * ( 1.0 - sbRock ) * ( 1.0 - sbSilt );
    float grain = 0.9 + 0.2 * sbNoise( sbP * 23.0 );
    vec3 sand = vec3( 1.0 - 0.22 * sbTrough ) * grain + shell * 0.45;
    // rock: crevices dark, faces lit; pink coralline crusts in the shallows
    float crust = smoothstep( 0.55, 0.75, sbNoise( sbP * 1.7 + 9.0 ) ) * ( 1.0 - smoothstep( 15.0, 45.0, sbDepth ) );
    vec3 rock = vec3( 0.65 + sbRel * 1.6 ) * mix( vec3( 1.0 ), vec3( 1.45, 0.85, 1.05 ), crust );
    // silt: burrow mouths darker, mounds of brought-up sediment paler
    vec3 silt = vec3( 1.0 + clamp( sbRel * 5.0, -0.45, 0.2 ) ) * ( 0.92 + 0.16 * sbNoise( sbP * 3.0 ) );
    vec3 fine = mix( mix( sand, rock, sbRock ), silt, sbSilt );
    k *= mix( vec3( 1.0 ), fine, sbFade );
  }
  diffuseColor.rgb *= k;
}
`;

const NORMALS = /* glsl */ `
if ( uSbDetail > 1.5 && sbFade > 0.0 && vOcWorld.y < 0.3 ) {
  // the relief's slope by finite differences, near the camera only
  float e = 0.04, tr;
  float hx = sbRelief( sbP + vec2( e, 0.0 ), sbDepth, sbRock, sbSilt, tr ) - sbRelief( sbP - vec2( e, 0.0 ), sbDepth, sbRock, sbSilt, tr );
  float hz = sbRelief( sbP + vec2( 0.0, e ), sbDepth, sbRock, sbSilt, tr ) - sbRelief( sbP - vec2( 0.0, e ), sbDepth, sbRock, sbSilt, tr );
  vec3 nw = normalize( vOcNormal - vec3( hx, 0.0, hz ) / ( 2.0 * e ) * sbFade );
  normal = normalize( mat3( viewMatrix ) * nw );
}
`;

/** add the close-up detail to the sea bed's (already ocean-patched) material */
export function addSeabedDetail<T extends THREE.Material>(mat: T): T {
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    base.call(mat, sh, r);
    sh.uniforms.uSbDetail = SEABED_DETAIL;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + ALBEDO)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + NORMALS);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key() + '-sbdetail1';
  return mat;
}
