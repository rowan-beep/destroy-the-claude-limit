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

/** the shared sky: uniforms and the GLSL function both the dome and the water use */
export const SKY = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uSunColor: { value: new THREE.Color() },
  uSunI: { value: 1 },
};

const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uSunI;
vec3 skyColor( vec3 d, bool disc ) {
  float y = max( d.y, 0.0 );
  vec3 c = mix( uHorizon, uZenith, pow( y, 0.45 ) );
  float mu = max( dot( d, uSunDir ), 0.0 );
  // forward scattering round the sun
  c += uSunColor * ( pow( mu, 6.0 ) * 0.22 + pow( mu, 48.0 ) * 0.45 );
  if ( disc ) c += uSunColor * smoothstep( 0.99955, 0.9998, mu ) * 40.0;
  // below the horizon (the far sea seen in reflections)
  if ( d.y < 0.0 ) c = mix( uHorizon * 0.55, uHorizon, exp( d.y * 10.0 ) );
  return c * uSunI;
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
uniform vec3 uScatterSurf;
uniform float uCamUnder;
varying vec3 vWorld;
varying vec2 vSlope;
varying float vDist;
varying float vCrest;
${SKY_GLSL}
void main() {
  // the wave normal, with ripples that fade into the distance (where they would only shimmer)
  vec3 n = normalize( vec3( -vSlope.x, 1.0, -vSlope.y ) );
  float rf = uChop * ( 1.0 - smoothstep( 40.0, 900.0, vDist ) );
  vec3 r1 = texture2D( uRipple, vWorld.xz / 23.0 + vec2( 0.012, 0.007 ) * time ).xzy * 2.0 - 1.0;
  vec3 r2 = texture2D( uRipple, vWorld.xz / 7.3 + vec2( -0.021, 0.016 ) * time ).xzy * 2.0 - 1.0;
  n = normalize( n + vec3( r1.x + r2.x * 0.6, 0.0, r1.z + r2.z * 0.6 ) * rf );
  vec3 V = normalize( cameraPosition - vWorld );
  vec2 duv = ( vWorld.xz - uWorld.xy ) / uWorld.zw;
  float column = ( duv.x < 0.0 || duv.y < 0.0 || duv.x > 1.0 || duv.y > 1.0 ) ? 400.0 : texture2D( uDepth, duv ).r;
  if ( uCamUnder < 0.5 ) {
    // --- from the air
    float cosv = max( dot( n, V ), 0.0 );
    float F = 0.02 + 0.98 * pow( 1.0 - cosv, 5.0 );
    vec3 R = reflect( -V, n );
    R.y = abs( R.y );
    vec3 refl = skyColor( R, false );
    // the sun's glint, sharp on calm water and spread by ripples
    float spec = pow( max( dot( R, uSunDir ), 0.0 ), mix( 1200.0, 240.0, clamp( uChop, 0.0, 1.0 ) ) );
    refl += uSunColor * uSunI * spec * 18.0;
    // light scattered back out of the water body, brightest through the thin crests
    vec3 body = uScatterSurf * ( 0.8 + 0.6 * clamp( vCrest / max( waveAmp, 0.2 ), 0.0, 1.0 ) );
    // beyond the streamed sea bed the water is drawn opaque (deep and far)
    float far = smoothstep( 1500.0, 2300.0, vDist ) + smoothstep( 120.0, 220.0, column );
    far = clamp( far, 0.0, 1.0 );
    vec3 col = refl * F + body * ( 1.0 - F ) * far;
    float alpha = F + ( 1.0 - F ) * far;
    // foam: breaking crests in a rough sea, the shoreline, the wake
    float foam = 0.0;
    if ( uFoam > 0.0 ) {
      foam += smoothstep( 0.75, 1.05, vCrest / max( waveAmp, 0.2 ) ) * smoothstep( 1.2, 1.8, waveAmp ) * 0.7;
      foam += ( 1.0 - smoothstep( 0.2, 1.6, column ) ) * step( 0.05, column ) * 0.8;
      for ( int i = 0; i < 16; i++ ) {
        vec4 w = uWake[ i ];
        if ( w.w <= 0.0 ) continue;
        float d = length( vWorld.xz - w.xy );
        foam += ( 1.0 - smoothstep( w.z * 0.4, w.z, d ) ) * w.w;
      }
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
    vec3 under = uScatter * 1.25;
    vec3 col;
    if ( dot( t, t ) > 0.0 ) {
      // inside the window: the sky, dimmed toward its edge where reflection takes over
      float Fw = 0.02 + 0.98 * pow( 1.0 - cosi, 5.0 );
      float edge = smoothstep( 0.66, 0.75, cosi );
      col = mix( under, skyColor( normalize( t ), true ) * 0.9, ( 1.0 - Fw ) * edge );
    } else {
      // total internal reflection: the dim sea mirrored
      col = under;
    }
    // the water between the eye and the surface
    float d = length( vWorld - cameraPosition );
    vec3 T = exp( -uSigma * d );
    col = col * T + uScatter * ( 1.0 - T );
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
        uScatterSurf: OCEAN_FX.uScatterSurf,
        uCamUnder: OCEAN_FX.uCamUnder,
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
      uniforms: { ...SKY },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize( position ); vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); gl_Position = p.xyww; }',
      fragmentShader: `${SKY_GLSL}\nvarying vec3 vDir; void main(){ gl_FragColor = vec4( skyColor( normalize( vDir ), true ), 1.0 ); }`,
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
    for (const w of this.wake) w.w = Math.max(0, w.w - dt * 0.08);
    if (boat && boat.surfaced && boat.speed > 0.4) {
      if (Math.hypot(boat.x - this.wakeLast.x, boat.z - this.wakeLast.y) > 6) {
        this.wakeLast.set(boat.x, boat.z);
        const w = this.wake[this.wakeHead];
        w.set(boat.x, boat.z, 3 + boat.speed * 1.5, Math.min(1, boat.speed / 2));
        this.wakeHead = (this.wakeHead + 1) % this.wake.length;
      }
    }
    // older wake spreads out
    for (const w of this.wake) if (w.w > 0) w.z += dt * 0.6;
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
