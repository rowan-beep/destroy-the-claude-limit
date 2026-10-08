// How light behaves in the sea, shared by every material below (and above) the
// waterline. Seawater absorbs red first, then green, then blue:
//  - sunlight and skylight reaching a surface are dimmed per colour by the
//    depth of that surface (diffuse attenuation Kd), so a wreck at 85 m sits in
//    blue twilight while the shallows stay warm;
//  - the vehicle's lamps lose their red over the distance they travel;
//  - what the eye sees is extinguished per colour along the part of the sight
//    line that is under water, and replaced by light scattered in the water
//    (the colour of the sea at that depth). The same rule covers looking down
//    from the air (shallow water turquoise, deep water navy), looking up from
//    below at the harbor wall, and a camera sitting right at the waterline,
//    where the top of the picture is in air and the bottom in the sea.
// Plus caustics on the shallow seabed and the sonar ping's wavefront.
// Coefficients are for clear coastal water (roughly Jerlov type II).

import * as THREE from 'three';

export const OCEAN_FX = {
  uTime: { value: 0 },
  /** caustics strength (0 = off: the Performance preset) */
  uCaust: { value: 1 },
  /** the scanning sonar's sweep: the head (x, z), the beam's bearing (radians clockwise from north), the range (m) */
  uSweep: { value: new THREE.Vector4(0, 0, 0, 280) },
  /** the head's height */
  uSweepY: { value: 0 },
  /** how far round the beam has gone since the scan began (radians, up to a full turn) */
  uSweepSpan: { value: 0 },
  /** the beam itself: 1 while it turns, 0 once a single sweep is done */
  uSweepLead: { value: 0 },
  /** the whole picture: fades once a single sweep is done; 0 with the overlay off */
  uSweepK: { value: 0 },
  /** 1 / the eye's exposure (the picture keeps its brightness) */
  uSweepExpInv: { value: 1 },
  /** stronger silhouettes nearby (the visibility aid) */
  uAid: { value: 0 },
  /** sunlight colour for the caustics */
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  /** diffuse attenuation of daylight with depth, per colour (1/m) */
  uKd: { value: new THREE.Vector3(0.42, 0.072, 0.045) },
  /** beam attenuation along a line of sight, per colour (1/m) */
  uSigma: { value: new THREE.Vector3(0.46, 0.095, 0.075) },
  /** light scattered into a line of sight just under the surface (linear); deeper it is dimmed by uKd */
  uScatter: { value: new THREE.Color(0.006, 0.11, 0.16) },
  /** the sea surface's height where the camera is (the waterline between air and water near it) */
  uWaterY: { value: 0 },
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
uniform vec4 uSweep;
uniform float uSweepY, uSweepSpan, uSweepLead, uSweepK, uSweepExpInv;
uniform float uAid;
uniform vec3 uSunCol;
uniform vec3 uKd;
uniform vec3 uSigma;
uniform vec3 uScatter;
uniform float uWaterY;
/** daylight left at this fragment's depth, per colour */
vec3 ocDaylight() {
  float d = max( -vOcWorld.y, 0.0 );
  return exp( -uKd * d );
}
vec2 ocHash( vec2 p ) {
  p = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) );
  return fract( sin( p ) * 43758.5453 );
}
/** distance to the nearest cell edge of a drifting cellular pattern */
float ocCells( vec2 p, float t ) {
  vec2 i = floor( p ), f = fract( p );
  float d1 = 8.0, d2 = 8.0;
  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
    vec2 g = vec2( float( x ), float( y ) );
    vec2 o = ocHash( i + g );
    o = 0.5 + 0.42 * sin( t * 0.9 + 6.2831 * o );
    float d = length( g + o - f );
    if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) d2 = d;
  }
  return d2 - d1;
}
float ocCaustic( vec2 p, float t ) {
  // the net of bright lines the waves above focus on the bottom: two drifting cell patterns
  // of about a metre, bright where their edges cross
  float a = ocCells( p * 0.85, t );
  float b = ocCells( p * 0.85 * 1.37 + vec2( 3.1, 7.7 ), t * 1.3 );
  float l = exp( -a * 9.0 ) + exp( -b * 9.0 );
  return l * l * 0.35;
}
`;
const FRAG_MAIN = /* glsl */ `
{
  float ocDepth = max( -vOcWorld.y, 0.0 );
  // caustics: strongest in the first metres, on faces that look up at the sun
  if ( uCaust > 0.0 && vOcWorld.y < 0.0 ) {
    // (they blur away with depth as the focus spreads)
    float k = uCaust * clamp( vOcNormal.y, 0.0, 1.0 ) * smoothstep( 0.0, 1.5, ocDepth ) * ( 1.0 - smoothstep( 5.0, 28.0, ocDepth ) );
    totalEmissiveRadiance += diffuseColor.rgb * uSunCol * ocDaylight() * ocCaustic( vOcWorld.xz, uTime ) * k * 0.9;
  }
  if ( uAid > 0.0 ) totalEmissiveRadiance += diffuseColor.rgb * 0.18 * uAid;
}
`;
const FOG = /* glsl */ `
{
  // the stretch of the sight line under the surface (taken as level through the camera's waterline)
  float ocC = cameraPosition.y - uWaterY, ocF = vOcWorld.y - uWaterY;
  float ocFrac = 0.0;
  if ( ocC < 0.0 && ocF < 0.0 ) ocFrac = 1.0;
  else if ( ocC < 0.0 || ocF < 0.0 ) {
    float t = ocC / ( ocC - ocF );
    ocFrac = ocC < 0.0 ? t : 1.0 - t;
  }
  if ( ocFrac > 0.0 ) {
    float L = length( vOcWorld - cameraPosition ) * ocFrac;
    // most of the light scattered toward the eye comes from the first few metres of water
    float d0 = max( -cameraPosition.y, 0.0 ), d1 = max( -vOcWorld.y, 0.0 );
    if ( ocC >= 0.0 ) d0 = 0.0;
    float dEff = mix( d0, d1, min( L, 9.0 ) / max( L, 1e-3 ) );
    vec3 T = exp( -uSigma * L );
    gl_FragColor.rgb = gl_FragColor.rgb * T + uScatter * exp( -uKd * dEff ) * ( 1.0 - T );
  }
  if ( ocC >= 0.0 ) {
    #include <fog_fragment>
  }
  // the scanning sonar's picture: what the beam hits lights up blue and fades behind it
  // (a display laid over the view, so after the water, at the same brightness at any depth)
  if ( uSweepK > 0.0 && ocF < 0.0 ) {
    vec2 sv = vOcWorld.xz - uSweep.xy;
    float sd = length( sv );
    float since = mod( uSweep.z - atan( sv.x, -sv.y ), 6.2831853 );
    if ( sd < uSweep.w && since <= uSweepSpan ) {
      float lead = exp( -since * 18.0 ) * uSweepLead;
      float trail = exp( -since * 1.6 );
      // the beam fans out downward: far above or below the head it is faint
      float fan = exp( -max( 0.0, abs( vOcWorld.y - uSweepY ) - 4.0 - sd * 0.5 ) * 0.15 );
      float fall = ( 1.0 - smoothstep( uSweep.w * 0.75, uSweep.w, sd ) ) * smoothstep( 3.5, 6.0, sd );
      // what faces the head sends the sound back; the far sides of ridges, rocks and hulls lie in its shadow
      vec3 toHead = normalize( vec3( uSweep.x, uSweepY, uSweep.y ) - vOcWorld );
      float facing = max( dot( inverseTransformDirection( normal, viewMatrix ), toHead ), 0.0 );
      float back = 0.15 + 1.6 * facing * facing;
      // range rings every 50 m
      float ring = exp( -pow( ( fract( sd / 50.0 + 0.5 ) - 0.5 ) * 50.0, 2.0 ) * 0.5 ) * 0.6;
      float a = ( ( lead * 1.3 + trail * 0.45 ) * back + ( lead + trail ) * ring ) * fan * fall * uSweepK;
      // (laid over the picture: the scene dims under it a little, so it shows in bright shallow water too)
      gl_FragColor.rgb = gl_FragColor.rgb * ( 1.0 - 0.4 * min( a, 1.0 ) ) + vec3( 0.12, 0.55, 1.0 ) * a * uSweepExpInv * 1.4;
    }
  }
}
`;

/** the light loop with daylight dimmed by depth and the lamps losing their red over distance */
function lightsChunk(): string {
  return THREE.ShaderChunk.lights_fragment_begin
    .replace('getSpotLightInfo( spotLight, geometryPosition, directLight );', 'getSpotLightInfo( spotLight, geometryPosition, directLight );\n\t\tdirectLight.color *= exp( -uSigma * length( spotLight.position - geometryPosition ) );')
    .replace('getPointLightInfo( pointLight, geometryPosition, directLight );', 'getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tdirectLight.color *= exp( -uSigma * length( pointLight.position - geometryPosition ) );')
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
  mat.customProgramCacheKey = () => 'ocean-fx4-' + key;
  return mat;
}

/** daylight left at a depth (linear, per colour), for the CPU side (lights, the water colour) */
export function daylightAt(depth: number, out = new THREE.Vector3()): THREE.Vector3 {
  const k = OCEAN_FX.uKd.value;
  const d = Math.max(0, depth);
  return out.set(Math.exp(-k.x * d), Math.exp(-k.y * d), Math.exp(-k.z * d));
}
