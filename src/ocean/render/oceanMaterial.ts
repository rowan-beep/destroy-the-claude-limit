// How light behaves in the sea, shared by every material below (and above) the
// waterline. Seawater absorbs red first, then green, then blue:
//  - sunlight and skylight reaching a surface are dimmed per colour by the
//    depth of that surface (diffuse attenuation Kd), so a wreck at 85 m sits in
//    blue twilight while the shallows stay warm;
//  - the vehicle's lamps lose their red over the distance they travel;
//  - what the eye sees is extinguished per colour along the view path and
//    replaced by light scattered in the water (the colour of the sea at that
//    depth); seen from the air, only the part of the path under the surface
//    counts, which is what makes shallow water turquoise and deep water navy.
// Plus caustics on the shallow seabed and the sonar ping's wavefront.
// Coefficients are for clear coastal water (roughly Jerlov type II).

import * as THREE from 'three';

export const OCEAN_FX = {
  uTime: { value: 0 },
  /** caustics strength (0 = off: the Performance preset) */
  uCaust: { value: 1 },
  /** the ping: x, z, wavefront radius (m), strength (0..1) */
  uPing: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** the ping's origin height */
  uPingY: { value: 0 },
  /** stronger silhouettes nearby (the visibility aid) */
  uAid: { value: 0 },
  /** sunlight colour for the caustics */
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  /** diffuse attenuation of daylight with depth, per colour (1/m) */
  uKd: { value: new THREE.Vector3(0.42, 0.072, 0.045) },
  /** beam attenuation along a line of sight, per colour (1/m) */
  uSigma: { value: new THREE.Vector3(0.46, 0.095, 0.075) },
  /** light scattered into the line of sight at the camera's depth (linear) */
  uScatter: { value: new THREE.Color(0.0, 0.05, 0.07) },
  /** the same just under the surface (for the view from the air) */
  uScatterSurf: { value: new THREE.Color(0.01, 0.12, 0.15) },
  /** 1 when the camera is under water */
  uCamUnder: { value: 0 },
};

const VERT_PARS = /* glsl */ `
varying vec3 vOcWorld;
varying vec3 vOcNormal;
`;
const VERT_MAIN = /* glsl */ `
{
  vec4 ocw = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    ocw = instanceMatrix * ocw;
  #endif
  ocw = modelMatrix * ocw;
  vOcWorld = ocw.xyz;
  vOcNormal = normalize( mat3( modelMatrix ) * objectNormal );
}
`;
const FRAG_PARS = /* glsl */ `
varying vec3 vOcWorld;
varying vec3 vOcNormal;
uniform float uTime;
uniform float uCaust;
uniform vec4 uPing;
uniform float uPingY;
uniform float uAid;
uniform vec3 uSunCol;
uniform vec3 uKd;
uniform vec3 uSigma;
uniform vec3 uScatter;
uniform vec3 uScatterSurf;
uniform float uCamUnder;
/** daylight left at this fragment's depth, per colour */
vec3 ocDaylight() {
  float d = max( -vOcWorld.y, 0.0 );
  return exp( -uKd * d );
}
float ocCaustic( vec2 p, float t ) {
  // drifting interference of a few waves: bright thin lines like light focused by the surface
  vec2 q = p * 0.21;
  float a = sin( q.x * 1.7 + t * 0.9 + sin( q.y * 1.3 + t * 0.6 ) * 1.6 );
  float b = sin( q.y * 1.9 - t * 0.8 + sin( q.x * 1.1 - t * 0.7 ) * 1.5 );
  float c = sin( ( q.x + q.y ) * 1.3 + t * 0.5 );
  float v = abs( a + b + c ) / 3.0;
  return pow( 1.0 - clamp( v, 0.0, 1.0 ), 6.0 );
}
`;
const FRAG_MAIN = /* glsl */ `
{
  float ocDepth = max( -vOcWorld.y, 0.0 );
  // caustics: strongest in the first metres, on faces that look up at the sun
  if ( uCaust > 0.0 && vOcWorld.y < 0.0 ) {
    float k = uCaust * clamp( vOcNormal.y, 0.0, 1.0 ) * smoothstep( 0.0, 1.5, ocDepth );
    totalEmissiveRadiance += diffuseColor.rgb * uSunCol * ocDaylight() * ocCaustic( vOcWorld.xz, uTime ) * k * 0.8;
  }
  // the ping: a bright wavefront, then a fading outline of the steep faces it crossed
  if ( uPing.w > 0.0 ) {
    float d = length( vec3( vOcWorld.x - uPing.x, ( vOcWorld.y - uPingY ) * 0.6, vOcWorld.z - uPing.y ) );
    float front = smoothstep( uPing.z - 7.0, uPing.z, d ) * ( 1.0 - smoothstep( uPing.z, uPing.z + 1.5, d ) );
    float edge = step( d, uPing.z ) * ( 1.0 - abs( vOcNormal.y ) ) * 0.55;
    totalEmissiveRadiance += vec3( 0.25, 0.85, 1.0 ) * ( front * 1.3 + edge ) * uPing.w;
  }
  if ( uAid > 0.0 ) totalEmissiveRadiance += diffuseColor.rgb * 0.18 * uAid;
}
`;
const FOG = /* glsl */ `
{
  if ( uCamUnder > 0.5 ) {
    // all of the line of sight is water
    float ocD = length( vOcWorld - cameraPosition );
    vec3 T = exp( -uSigma * ocD );
    gl_FragColor.rgb = gl_FragColor.rgb * T + uScatter * ( 1.0 - T );
  } else {
    if ( vOcWorld.y < 0.0 ) {
      // seen from the air: only the stretch of the ray below the surface
      vec3 v = normalize( vOcWorld - cameraPosition );
      float path = -vOcWorld.y / max( 0.1, -v.y );
      vec3 T = exp( -uSigma * path );
      gl_FragColor.rgb = gl_FragColor.rgb * T + uScatterSurf * ( 1.0 - T );
    }
    #include <fog_fragment>
  }
}
`;

/** the light loop with daylight dimmed by depth and the lamps losing their red over distance */
function lightsChunk(): string {
  return THREE.ShaderChunk.lights_fragment_begin
    .replace('getSpotLightInfo( spotLight, geometryPosition, directLight );', 'getSpotLightInfo( spotLight, geometryPosition, directLight );\n\t\tdirectLight.color *= exp( -uSigma * length( spotLight.position - geometryPosition ) );')
    .replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= ocDaylight();')
    .replace('vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );', 'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor ) * ocDaylight();')
    .replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );', 'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * ocDaylight();');
}

/** give a built-in material (Lambert or Standard) the sea's light */
export function patchOceanMaterial<T extends THREE.MeshLambertMaterial | THREE.MeshStandardMaterial>(mat: T, key: string): T {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, OCEAN_FX);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_MAIN)
      .replace('#include <lights_fragment_begin>', lightsChunk())
      .replace('#include <fog_fragment>', FOG);
  };
  mat.customProgramCacheKey = () => 'ocean-fx2-' + key;
  return mat;
}

/** daylight left at a depth (linear, per colour), for the CPU side (lights, the water colour) */
export function daylightAt(depth: number, out = new THREE.Vector3()): THREE.Vector3 {
  const k = OCEAN_FX.uKd.value;
  const d = Math.max(0, depth);
  return out.set(Math.exp(-k.x * d), Math.exp(-k.y * d), Math.exp(-k.z * d));
}
