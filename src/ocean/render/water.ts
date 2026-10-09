// The sea surface and the sky above it.
//
// The surface is a radial grid that travels with the camera (fine rings close
// by, coarse far away); its vertices take the same wave sum the hull floats
// on. From above, water reflects the sky by Fresnel's law (2 % looking straight
// down, a mirror at grazing angles) and lets the sea bed show through, which the
// sea bed's own material dims and tints along the underwater part of the view.
// From below, the surface is Snell's window: the sky squeezed into a 97° cone
// overhead, and outside it the total internal reflection of the dark sea.

import * as THREE from 'three';
import { wavesGlsl } from '../world/waves';
import { seabedHeight, WORLD } from '../world/geo';
import { OCEAN_FX } from './oceanMaterial';

/**
 * The shared sky: uniforms and the GLSL function both the dome and the water's
 * reflections use. The sky is the analytic daylight model of Preetham et al.
 * (Rayleigh scattering by the air and Mie scattering by haze along a path that
 * thickens toward the horizon; the form three.js's Sky uses): a deep blue
 * overhead, a pale bright band at the horizon, a glow round the sun, and a red
 * sky at dawn from the long path through the air. Clouds are a layer of
 * drifting cumulus (or an overcast deck) about 1.5 km up, lit by the sun on
 * the side toward it, thinning into the haze toward the horizon.
 */
export const SKY = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color() },
  uSunI: { value: 1 },
  /** the air's and the haze's scattering coefficients (1/m), and the sun's strength at the top of the air */
  uBetaR: { value: new THREE.Vector3() },
  uBetaM: { value: new THREE.Vector3() },
  uSunE: { value: 1000 },
  /** the haze's forward scattering (Henyey-Greenstein g) */
  uMieG: { value: 0.8 },
  /** clouds: cumulus cover 0..1, 1 for an overcast deck instead, drift (km, x and z) */
  uCloud: { value: new THREE.Vector4(0.3, 0, 0, 0) },
};

/** the model's constants (three.js Sky / Preetham) */
const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
/** the sky's radiance to the picture's light units (calibrated: the zenith of a clear midday as before) */
const SKY_K = 0.4;
/**
 * the brightest the clear sky gets (luminance): the model's horizon is far
 * brighter than a real one against the blue overhead, and would burn out
 */
const SKY_MAX = 1.4;

/** set the sky for a sun direction and an atmosphere (turbidity, Rayleigh scale, Mie coefficient) */
export function setSkyAtmosphere(sunDir: THREE.Vector3, turbidity: number, rayleigh: number, mie: number, g: number): void {
  SKY.uSunDir.value.copy(sunDir);
  SKY.uSunE.value = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(Math.max(-1, Math.min(1, sunDir.y)))) / 1.5)));
  SKY.uBetaR.value.set(TOTAL_RAYLEIGH[0] * rayleigh, TOTAL_RAYLEIGH[1] * rayleigh, TOTAL_RAYLEIGH[2] * rayleigh);
  const c = 0.2 * turbidity * 10e-18;
  SKY.uBetaM.value.set(0.434 * c * MIE_CONST[0] * mie, 0.434 * c * MIE_CONST[1] * mie, 0.434 * c * MIE_CONST[2] * mie);
  SKY.uMieG.value = g;
}

/** the clear sky's colour in a direction, on the CPU (the same as the shader's, without the clouds) */
export function skyRadiance(d: THREE.Vector3, out = new THREE.Color()): THREE.Color {
  const sun = SKY.uSunDir.value, bR = SKY.uBetaR.value, bM = SKY.uBetaM.value, sunE = SKY.uSunE.value, g = SKY.uMieG.value;
  const zen = Math.acos(Math.max(0, d.y));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const cosT = d.x * sun.x + d.y * sun.y + d.z * sun.z;
  const rPh = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const mPh = 0.07957747154594767 * ((1 - g * g) / Math.pow(1 - 2 * g * cosT + g * g, 1.5));
  const k = Math.min(1, Math.max(0, Math.pow(1 - sun.y, 5)));
  const ch = (r: number, m: number) => {
    const fex = Math.exp(-(r * sR + m * sM));
    const bt = (r * rPh + m * mPh) / (r + m);
    let lin = Math.pow(sunE * bt * (1 - fex), 1.5);
    lin *= 1 + (Math.pow(sunE * bt * fex, 0.5) - 1) * k;
    return (lin + 0.1 * fex) * 0.04 * SKY_K;
  };
  out.setRGB(ch(bR.x, bM.x), ch(bR.y, bM.y), ch(bR.z, bM.z));
  const L = 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
  return out.multiplyScalar((SKY_MAX * (1 - Math.exp(-L / SKY_MAX))) / Math.max(L, 1e-5));
}

/**
 * The haze over the land and the sea: the sky just above the horizon, all
 * round (the clear sky's pale band, or the underside of an overcast deck).
 */
export function hazeColor(out = new THREE.Color()): THREE.Color {
  const d = new THREE.Vector3(), c = new THREE.Color();
  out.setRGB(0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.add(skyRadiance(d.set(Math.sin(a), 0.03, Math.cos(a)).normalize(), c));
  }
  out.multiplyScalar(1 / 8);
  // (the deck as the shader draws it low down)
  const deck = SKY.uSunI.value * 0.95 * (0.7 + 0.3 * 0.03) * 1.03;
  const t = Math.max(0, Math.min(1, (SKY.uCloud.value.y - 0.5) / 0.5));
  return out.lerp(c.setRGB(0.93 * deck, 0.96 * deck, deck), t * t * (3 - 2 * t));
}

const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunI;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uSunE;
uniform float uMieG;
uniform vec4 uCloud;
float skyH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float skyN( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( skyH( i ), skyH( i + vec2( 1.0, 0.0 ) ), u.x ), mix( skyH( i + vec2( 0.0, 1.0 ) ), skyH( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float skyFbm( vec2 p ) {
  float a = 0.5, s = 0.0;
  for ( int i = 0; i < 5; i++ ) {
    s += a * skyN( p );
    p = mat2( 1.6, 1.2, -1.2, 1.6 ) * p;
    a *= 0.5;
  }
  return s;
}
vec3 skyColor( vec3 d, bool disc ) {
  vec3 dd = normalize( vec3( d.x, max( d.y, 0.0 ), d.z ) );
  // the clear sky: scattered sunlight along a path through the air that thickens toward the horizon
  float zen = acos( dd.y );
  float inv = 1.0 / ( cos( zen ) + 0.15 * pow( 93.885 - zen * 57.29578, -1.253 ) );
  vec3 fex = exp( -( uBetaR * 8.4e3 * inv + uBetaM * 1.25e3 * inv ) );
  float cosT = dot( dd, uSunDir );
  float rPh = 0.0596831 * ( 1.0 + pow( cosT * 0.5 + 0.5, 2.0 ) );
  float g2 = uMieG * uMieG;
  float mPh = 0.0795775 * ( ( 1.0 - g2 ) / pow( 1.0 - 2.0 * uMieG * cosT + g2, 1.5 ) );
  vec3 bt = ( uBetaR * rPh + uBetaM * mPh ) / ( uBetaR + uBetaM );
  vec3 lin = pow( uSunE * bt * ( 1.0 - fex ), vec3( 1.5 ) );
  lin *= mix( vec3( 1.0 ), pow( uSunE * bt * fex, vec3( 0.5 ) ), clamp( pow( 1.0 - uSunDir.y, 5.0 ), 0.0, 1.0 ) );
  vec3 c = ( lin + 0.1 * fex ) * 0.04 * ${SKY_K.toFixed(3)};
  float L = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c *= ${SKY_MAX.toFixed(3)} * ( 1.0 - exp( -L / ${SKY_MAX.toFixed(3)} ) ) / max( L, 1e-5 );
  float sunDisc = smoothstep( 0.99995, 0.99998, cosT );
  // the clouds: a layer about 1.5 km up, drifting with the wind
  if ( d.y > 0.0 && uCloud.x > 0.0 ) {
    vec2 cp = d.xz / max( d.y, 0.03 ) * 1.5 + uCloud.zw;
    float n = skyFbm( cp * 0.42 );
    float mu = max( cosT, 0.0 );
    // cumulus: tops lit by the sun, grey undersides, bright edges toward it
    float dens = smoothstep( 1.0 - uCloud.x, 1.3 - uCloud.x, n );
    float toward = skyFbm( cp * 0.42 + uSunDir.xz * 0.12 );
    float lit = clamp( 0.55 + ( n - toward ) * 3.0, 0.15, 1.0 );
    vec3 cu = uSunColor * uSunI * ( 0.25 + 0.95 * lit + 0.9 * pow( mu, 6.0 ) ) + vec3( 0.12, 0.14, 0.18 ) * uSunI;
    // an overcast deck: grey, lighter overhead and where the sun is behind it, darker where it is thick
    vec3 deck = vec3( 0.93, 0.96, 1.0 ) * uSunI * 0.95 * ( 0.7 + 0.3 * dd.y ) * ( 1.0 + 0.25 * pow( mu, 3.0 ) ) * ( 0.8 + 0.4 * n );
    float over = smoothstep( 0.5, 1.0, uCloud.y );
    // (cumulus thin out into the haze toward the horizon; a deck goes all the way down)
    float a = mix( dens * smoothstep( 0.0, 0.14, d.y ), 1.0, over );
    c = mix( c, mix( cu, deck, over ), a );
    sunDisc *= 1.0 - smoothstep( 0.05, 0.5, a );
  }
  if ( disc ) c += uSunColor * uSunE * fex * sunDisc * 0.035;
  // below the horizon (the far sea seen in reflections): the horizon, darkening
  if ( d.y < 0.0 ) c *= mix( 0.55, 1.0, exp( d.y * 10.0 ) );
  return c;
}
`;

/** a tileable ripple normal map, made once */
function rippleTexture(): THREE.DataTexture {
  const N = 256;
  const d = new Uint8Array(N * N * 4);
  // a sum of waves whose wave numbers fit the tile, so it repeats seamlessly
  const waves: [number, number, number, number][] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 24; i++) {
    const kx = Math.round((rnd() - 0.5) * 22), kz = Math.round((rnd() - 0.5) * 22);
    if (kx === 0 && kz === 0) continue;
    const k = Math.hypot(kx, kz);
    waves.push([kx, kz, 1 / Math.pow(k, 1.2), rnd() * 6.283]);
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      let dx = 0, dz = 0;
      for (const [kx, kz, a, ph] of waves) {
        const q = ((kx * i + kz * j) / N) * 6.283 + ph;
        const c = Math.cos(q) * a;
        dx += c * kx;
        dz += c * kz;
      }
      const nx = -dx * 0.12, nz = -dz * 0.12;
      const l = Math.hypot(nx, 1, nz);
      const o = (j * N + i) * 4;
      d[o] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
      d[o + 1] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
      d[o + 2] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
      d[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** water depth over the whole chart (m), for the shore foam and the far fade */
export function depthTexture(n = 256): THREE.DataTexture {
  const d = new Uint16Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = WORLD.minX + ((i + 0.5) / n) * (WORLD.maxX - WORLD.minX);
      const z = WORLD.minZ + ((j + 0.5) / n) * (WORLD.maxZ - WORLD.minZ);
      d[j * n + i] = THREE.DataUtils.toHalfFloat(Math.max(0, -seabedHeight(x, z)));
    }
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const WATER_VERT = /* glsl */ `
uniform float time;
uniform float waveAmp;
uniform vec3 uCam;
varying vec3 vWorld;
varying vec2 vSlope;
varying float vDist;
varying float vCrest;
${wavesGlsl()}
void main() {
  vec2 p = position.xz + uCam.xz;
  float dist = length( position.xz );
  vec3 w = oceanWaves( p, time, dist );
  vWorld = vec3( p.x, w.x, p.y );
  vSlope = w.yz;
  vDist = dist;
  vCrest = w.x;
  gl_Position = projectionMatrix * viewMatrix * vec4( vWorld, 1.0 );
}
`;

const WATER_FRAG = /* glsl */ `
uniform float time;
uniform float waveAmp;
uniform float uChop;
uniform sampler2D uRipple;
uniform sampler2D uDepth;
uniform vec4 uWorld;
uniform float uHaze;
uniform float uFoam;
uniform vec4 uWake[ 16 ];
uniform vec3 uSigma;
uniform vec3 uScatter;
uniform vec3 uKd;
uniform float uWaterY;
varying vec3 vWorld;
varying vec2 vSlope;
varying float vDist;
varying float vCrest;
${SKY_GLSL}
void main() {
  // the wave normal, with ripples that fade into the distance (where they would only shimmer)
  vec3 n = normalize( vec3( -vSlope.x, 1.0, -vSlope.y ) );
  // which side of the surface this piece is seen from (at the waterline the picture holds both)
  // (near the camera by the wave's own facing, so the waterline can split the picture; farther
  // away by the camera's side, or grazing views from below would catch the backs of distant waves)
  bool fromAir = vDist < 6.0 ? dot( cameraPosition - vWorld, n ) > 0.0 : cameraPosition.y >= uWaterY;
  float rf = uChop * ( 1.0 - smoothstep( 40.0, 900.0, vDist ) );
  vec3 r1 = texture2D( uRipple, vWorld.xz / 23.0 + vec2( 0.012, 0.007 ) * time ).xzy * 2.0 - 1.0;
  vec3 r2 = texture2D( uRipple, vWorld.xz / 7.3 + vec2( -0.021, 0.016 ) * time ).xzy * 2.0 - 1.0;
  n = normalize( n + vec3( r1.x + r2.x * 0.6, 0.0, r1.z + r2.z * 0.6 ) * rf );
  vec3 V = normalize( cameraPosition - vWorld );
  vec2 duv = ( vWorld.xz - uWorld.xy ) / uWorld.zw;
  float column = ( duv.x < 0.0 || duv.y < 0.0 || duv.x > 1.0 || duv.y > 1.0 ) ? 400.0 : texture2D( uDepth, duv ).r;
  if ( fromAir ) {
    // --- from the air
    float cosv = max( dot( n, V ), 0.0 );
    // (on a rough sea the facets that face the eye show, and they reflect higher, bluer sky;
    // the facets that would mirror the horizon are hidden behind the waves in front)
    float F = 0.02 + 0.98 * pow( 1.0 - cosv, 5.0 );
    F *= 1.0 - 0.3 * clamp( uChop, 0.0, 1.0 ) * smoothstep( 0.6, 1.0, F );
    vec3 R = reflect( -V, n );
    R.y = abs( R.y ) + 0.08 + 0.1 * clamp( uChop, 0.0, 1.5 );
    R = normalize( R );
    vec3 refl = skyColor( R, false );
    // the sun's glint, sharp on calm water and spread by ripples
    float spec = pow( max( dot( R, uSunDir ), 0.0 ), mix( 1200.0, 240.0, clamp( uChop, 0.0, 1.0 ) ) );
    refl += uSunColor * uSunI * spec * 18.0;
    // light scattered back out of the water body, brightest through the thin crests
    vec3 body = uScatter * ( 0.8 + 0.6 * clamp( vCrest / max( waveAmp, 0.2 ), 0.0, 1.0 ) );
    // beyond the streamed sea bed the water is drawn opaque (deep and far)
    float far = smoothstep( 1500.0, 2300.0, vDist ) + smoothstep( 120.0, 220.0, column );
    far = clamp( far, 0.0, 1.0 );
    vec3 col = refl * F + body * ( 1.0 - F ) * far;
    float alpha = F + ( 1.0 - F ) * far;
    // foam: breaking crests in a rough sea, the shoreline, the wake
    float foam = 0.0;
    if ( uFoam > 0.0 ) {
      foam += smoothstep( 0.75, 1.05, vCrest / max( waveAmp, 0.2 ) ) * smoothstep( 1.2, 1.8, waveAmp ) * 0.7;
      foam += ( 1.0 - smoothstep( 0.1, 0.7, column ) ) * step( 0.05, column ) * 0.7;
      // the wake: each mark a spreading ring of broken water, thin and streaky, fading as it spreads
      float wk = 0.0;
      for ( int i = 0; i < 16; i++ ) {
        vec4 w = uWake[ i ];
        if ( w.w <= 0.0 ) continue;
        float d = length( vWorld.xz - w.xy );
        float ring = 1.0 - smoothstep( 0.0, 0.9, abs( d - w.z ) );
        float core = 1.0 - smoothstep( 0.0, 1.6, d );
        wk = max( wk, ( ring * 0.55 + core * 0.35 ) * w.w );
      }
      foam += wk * smoothstep( 0.35, 0.75, texture2D( uRipple, vWorld.xz / 1.7 + time * 0.03 ).g );
      float grain = texture2D( uRipple, vWorld.xz / 3.1 + time * 0.05 ).r;
      foam = clamp( foam * ( 0.55 + 0.9 * grain ), 0.0, 1.0 ) * uFoam;
    }
    col = mix( col, vec3( 0.9 ) * uSunI * 0.85, foam );
    alpha = mix( alpha, 1.0, foam );
    // haze toward the horizon
    float h = 1.0 - exp( -vDist / uHaze );
    vec3 hz = skyColor( normalize( vec3( -V.x, 0.02, -V.z ) ), false );
    col = mix( col, hz * alpha, h );
    gl_FragColor = vec4( col, alpha );
  } else {
    // --- from below: Snell's window
    vec3 I = -V;               // the ray going up to the surface
    vec3 nd = -n;              // the surface faces down at the viewer
    float cosi = clamp( dot( I, -nd ), 0.0, 1.0 );
    vec3 t = refract( I, nd, 1.0 / 1.333 );
    float camD = max( -cameraPosition.y, 0.0 );
    // outside the window: total internal reflection of the darker water below
    vec3 under = uScatter * 0.55;
    vec3 col;
    if ( dot( t, t ) > 0.0 ) {
      // inside the window: the sky, dimmed toward its edge where reflection takes over
      float Fw = 0.02 + 0.98 * pow( 1.0 - cosi, 5.0 );
      float edge = smoothstep( 0.66, 0.75, cosi );
      col = mix( under, skyColor( normalize( t ), true ) * 0.9, ( 1.0 - Fw ) * edge );
    } else col = under;
    // the water between the eye and the surface
    float d = length( vWorld - cameraPosition );
    vec3 T = exp( -uSigma * d );
    float dEff = camD * ( 1.0 - min( d, 9.0 ) / max( d, 1e-3 ) );
    col = col * T + uScatter * exp( -uKd * dEff ) * ( 1.0 - T );
    gl_FragColor = vec4( col, 1.0 );
  }
}
`;

/** the radial grid: fine rings near the centre, growing outward to the horizon */
function radialGrid(rings: number, segs: number, maxR: number): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const first = 0.6;
  // r_k = first * (g^k - 1) / (g - 1), solved for g so the last ring reaches maxR
  let g = 1.1;
  for (let it = 0; it < 60; it++) {
    const r = (first * (Math.pow(g, rings) - 1)) / (g - 1);
    g *= r > maxR ? 0.995 : 1.005;
  }
  for (let k = 1; k <= rings; k++) {
    const r = (first * (Math.pow(g, k) - 1)) / (g - 1);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let k = 0; k < rings - 1; k++) {
    const a0 = 1 + k * segs, b0 = 1 + (k + 1) * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return geo;
}

export class OceanSurface {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly sky: THREE.Mesh;
  private wake: THREE.Vector4[] = Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0));
  private wakeHead = 0;
  private wakeLast = new THREE.Vector2(1e9, 1e9);

  constructor(rings: number, segs: number) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: {
        ...SKY,
        time: OCEAN_FX.uTime,
        waveAmp: { value: 1 },
        uChop: { value: 0.8 },
        uCam: { value: new THREE.Vector3() },
        uRipple: { value: rippleTexture() },
        uDepth: { value: depthTexture() },
        uWorld: { value: new THREE.Vector4(WORLD.minX, WORLD.minZ, WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ) },
        uHaze: { value: 4000 },
        uFoam: { value: 1 },
        uWake: { value: this.wake },
        uSigma: OCEAN_FX.uSigma,
        uScatter: OCEAN_FX.uScatter,
        uKd: OCEAN_FX.uKd,
        uWaterY: OCEAN_FX.uWaterY,
      },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(radialGrid(rings, segs, 9000), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'water';
    // the sky dome (above the water only)
    const skyMat = new THREE.ShaderMaterial({
      uniforms: { ...SKY, uScatter: OCEAN_FX.uScatter, uKd: OCEAN_FX.uKd, uWaterY: OCEAN_FX.uWaterY },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize( position ); vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); gl_Position = p.xyww; }',
      // (under water, any gap the surface leaves is the water's own colour)
      fragmentShader: `${SKY_GLSL}\nuniform vec3 uScatter; uniform vec3 uKd; uniform float uWaterY; varying vec3 vDir; void main(){ gl_FragColor = vec4( cameraPosition.y < uWaterY ? uScatter * exp( -uKd * max( -cameraPosition.y, 0.0 ) ) : skyColor( normalize( vDir ), true ), 1.0 ); }`,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
  }

  /** rebuild the grid for a preset */
  setDetail(rings: number, segs: number): void {
    this.mesh.geometry.dispose();
    this.mesh.geometry = radialGrid(rings, segs, 9000);
  }

  /** follow the camera, and lay foam behind a vehicle moving on the surface */
  update(cam: THREE.Vector3, boat: { x: number; z: number; speed: number; surfaced: boolean } | null, dt: number): void {
    (this.material.uniforms.uCam.value as THREE.Vector3).copy(cam);
    this.sky.position.copy(cam);
    for (const w of this.wake) w.w = Math.max(0, w.w - dt * 0.05);
    if (boat && boat.surfaced && boat.speed > 0.4) {
      if (Math.hypot(boat.x - this.wakeLast.x, boat.z - this.wakeLast.y) > 6) {
        this.wakeLast.set(boat.x, boat.z);
        const w = this.wake[this.wakeHead];
        w.set(boat.x, boat.z, 1.2, Math.min(0.8, boat.speed / 2.5));
        this.wakeHead = (this.wakeHead + 1) % this.wake.length;
      }
    }
    // older wake spreads out
    for (const w of this.wake) if (w.w > 0) w.z += dt * 0.9;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    (this.material.uniforms.uRipple.value as THREE.Texture).dispose();
    (this.material.uniforms.uDepth.value as THREE.Texture).dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
  }
}
