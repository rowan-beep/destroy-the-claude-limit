// Broken pixels: a shader that takes pow() or sqrt() of a value pushed just past its
// range, or a highlight past the half-float limit, leaves a pixel with an infinite or
// NaN channel. Blur passes (depth of field, bloom) spread one of those into a disc of
// pure colour, so the scene is cleaned as it enters the post-processing chain.
//
// The test reads the float's bits: isnan() and x != x are compiled away by some
// drivers (Direct3D under ANGLE), so they let these pixels through on real GPUs.

/** badTexel(c): any channel infinite or NaN */
export const BAD_TEXEL_GLSL = /* glsl */ `
bool badTexel( vec4 c ) {
  uvec4 e = floatBitsToUint( c ) & 0x7f800000u;
  return any( equal( e, uvec4( 0x7f800000u ) ) );
}
`;

/** sceneTexel(t, uv, px): the picture at uv with broken pixels filled in (needs texture2D) */
export const SCRUB_GLSL = BAD_TEXEL_GLSL + /* glsl */ `
// the scene at uv, a broken pixel replaced by the average of its sound neighbours
vec4 sceneTexel( sampler2D t, vec2 uv, vec2 px ) {
  vec4 c = texture2D( t, uv );
  if ( !badTexel( c ) ) return clamp( c, 0.0, 65000.0 );
  vec4 s = vec4( 0.0 );
  float n = 0.0;
  for ( int i = 0; i < 8; i++ ) {
    float a = float( i ) * 0.785398;
    vec4 q = texture2D( t, uv + vec2( cos( a ), sin( a ) ) * px * 1.5 );
    if ( !badTexel( q ) ) { s += clamp( q, 0.0, 65000.0 ); n += 1.0; }
  }
  return n > 0.0 ? s / n : vec4( 0.0 );
}
`;
