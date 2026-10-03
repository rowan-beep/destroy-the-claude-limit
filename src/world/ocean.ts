// The sea: a camera-following water plane. Its colour comes from the real
// water depth (a depth map built from the theater height grid): turquoise
// shallows along every coast, deep blue channels, navy open sea, with broad
// static colour variation and faint current streaks so it reads well from
// 20,000 ft. The surface itself is still (no animated waves): fixed ripples,
// Fresnel sky reflection and sun glitter. Drawn semi-transparent in the
// shallows so the sea bed shows through. An opaque "abyss" plane below hides
// the deep sea floor.

import * as THREE from 'three';
import { getWaterNormalTexture } from '../render/textures';
import { Environment } from '../render/environment';
import type { HeightGrid } from './heightGrid';
import { activeMap } from './islands';
import { MAP_HALF } from '../core/constants';
import { TERRAIN_LIGHT, TERRAIN_LIGHT_GLSL } from '../render/terrainLight';
import { seaMoves, wavesGlsl } from './waves';
import { ringDisc } from '../render/curvature';

/** Radius (m) of the dense, wave-displaced patch of sea that follows the camera (open ocean). */
const PATCH_R = 1500;
/** Radius (m) of the sea disc: past the horizon even from the edge of space. */
const SEA_R = 1500000;

/** Water depth over the theater (0 = shore, 1 = 400 m or deeper), from the height grid. */
function depthTexture(grid: HeightGrid): THREE.DataTexture {
  const n = grid.n;
  const d = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const h = grid.data[i];
    d[i] = h >= 0 ? 0 : Math.min(255, Math.round((-h / 400) * 255));
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const WATER_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vRel;
varying vec3 vWave;
uniform float time;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
// @WAVES@
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vWave = vec3( 0.0 );
#ifdef WAVES
  // rolling swell: lift the vertex and keep the slope for the lighting
  vec3 w = seaWaves( wp.xz, time, length( wp.xz - cameraPosition.xz ) );
  wp.y += w.x;
  vWave = w;
#endif
  vWorldPos = wp.xyz;
  vec4 mvPosition = curveView( viewMatrix * wp );
  gl_Position = projectionMatrix * mvPosition;
  vRel = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const WATER_FRAG = /* glsl */ `
uniform sampler2D normalMap;
uniform float time;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 horizonColor;
uniform vec3 zenithColor;
uniform vec3 deepColor;
uniform sampler2D depthMap;
${TERRAIN_LIGHT_GLSL}
uniform float mapHalf;
uniform vec3 shallowColor;
uniform vec3 midColor;
uniform float flow;
uniform float holeR;
varying vec3 vWorldPos;
varying vec3 vRel;
varying vec3 vWave;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>

vec3 sampleN( vec2 uv ) {
  return texture2D( normalMap, uv ).xyz * 2.0 - 1.0;
}

void main() {
  #include <logdepthbuf_fragment>
  // the open ocean's near patch draws the sea around the camera; the far disc leaves it a hole
  if ( holeR > 0.0 && length( vWorldPos.xz - cameraPosition.xz ) < holeR ) discard;
  vec3 rel = vRel;
  float dist = length( rel );
  vec3 V = -rel / max( dist, 1e-3 );
  vec2 uv = vWorldPos.xz;
  // ripples at several scales (on the open ocean they drift with the wind)
  float ft = time * flow;
  vec3 n1 = sampleN( uv / 210.0 + vec2( 0.011, 0.006 ) * ft );
  vec3 n2 = sampleN( uv / 57.0 + vec2( 0.31, 0.77 ) + vec2( -0.017, 0.024 ) * ft );
  vec3 n3 = sampleN( uv / 13.0 + vec2( 0.53, 0.19 ) + vec2( 0.05, 0.035 ) * ft );
  vec3 n4 = sampleN( uv / 1400.0 );
  float fade = 1.0 - smoothstep( 800.0, 30000.0, dist );
  float fade2 = 1.0 - smoothstep( 60.0, 900.0, dist );
  vec2 slope = ( n1.xy * 0.9 + n2.xy * 0.6 ) * fade + n3.xy * 0.5 * fade2 + n4.xy * 0.8;
  vec3 N = normalize( vec3( slope.x * 0.35 - vWave.y, 1.0, slope.y * 0.35 - vWave.z ) );
  float ndv = max( dot( N, V ), 0.0 );
  float fresnel = 0.02 + 0.98 * pow( 1.0 - ndv, 5.0 );
  vec3 R = reflect( -V, N );
  float ry = max( R.y, 0.0 );
  vec3 sky = mix( horizonColor, zenithColor, pow( ry, 0.45 ) );
  float sdr = max( dot( R, sunDir ), 0.0 );
  vec3 spec = sunColor * ( pow( sdr, 900.0 ) * 30.0 + pow( sdr, 90.0 ) * 0.6 ) * step( 0.0, sunDir.y );
  float sunLit = clamp( sunDir.y * 1.5 + 0.2, 0.2, 1.0 );
  // depth: 0 at the shore .. 1 at ~400 m and beyond (off the map = deep)
  vec2 duv = ( vWorldPos.xz + mapHalf ) / ( 2.0 * mapHalf );
  float dep = ( duv.x < 0.0 || duv.y < 0.0 || duv.x > 1.0 || duv.y > 1.0 ) ? 1.0 : texture2D( depthMap, duv ).r;
  vec3 body = mix( shallowColor, midColor, smoothstep( 0.0, 0.07, dep ) );
  body = mix( body, deepColor, smoothstep( 0.07, 0.6, dep ) );
  // broad, still colour variation and faint current streaks (seen from altitude)
  float broad = texture2D( normalMap, uv / 26000.0 ).r;
  float streak = texture2D( normalMap, vec2( uv.x / 70000.0, uv.y / 9000.0 ) + vec2( broad * 0.15 ) ).g;
  body *= 0.9 + 0.16 * broad + 0.08 * smoothstep( 0.55, 0.85, streak ) * smoothstep( 0.05, 0.3, dep );
  // mountain and cloud shadows on the water: no glitter, darker body
  vec2 tlv = terrainLight( vWorldPos.xz, 0.0 );
  float shade = tlv.r * ( 1.0 - 0.6 * cloudShadow( vWorldPos.xz, 0.0 ) );
  spec *= shade;
  body *= sunLit * ( 0.62 + 0.38 * shade );
  // keep the water's own colour visible from high up (less washed-out sky)
  vec3 col = mix( body, sky, fresnel * 0.8 ) + spec;
#ifdef WAVES
  // white caps on the steepest crests
  float cap = smoothstep( 0.8, 1.15, vWave.x ) * smoothstep( 0.62, 0.86, texture2D( normalMap, uv / 9.0 + vec2( 0.02, 0.01 ) * ft ).b );
  col = mix( col, vec3( 0.85, 0.88, 0.9 ) * sunLit, cap * 0.35 * ( 1.0 - smoothstep( 300.0, 1400.0, dist ) ) );
#endif
  float alpha = mix( mix( 0.55, 0.96, smoothstep( 0.0, 0.2, dep ) ), 1.0, clamp( fresnel * 1.4 + smoothstep( 4000.0, 30000.0, dist ) * 0.6, 0.0, 1.0 ) );
  gl_FragColor = vec4( col, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class Ocean {
  readonly water: THREE.Mesh;
  private patch: THREE.Mesh | null = null;
  readonly abyss: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private t = 0;

  /** seconds the sea has been running (the waves' clock) */
  get time(): number {
    return this.t;
  }

  constructor(
    scene: THREE.Scene,
    private env: Environment,
    grid: HeightGrid,
  ) {
    const frost = activeMap.id === 'frost';
    const jade = activeMap.id === 'jade';
    const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
    const u = env.uniformsForWater;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          normalMap: { value: null },
          time: { value: 0 },
          sunDir: { value: new THREE.Vector3() },
          sunColor: { value: new THREE.Color() },
          horizonColor: { value: new THREE.Color() },
          zenithColor: { value: new THREE.Color() },
          deepColor: { value: frost ? srgb(0.02, 0.1, 0.24) : jade ? srgb(0.02, 0.15, 0.33) : srgb(0.02, 0.13, 0.27) },
          midColor: { value: frost ? srgb(0.04, 0.25, 0.46) : jade ? srgb(0.02, 0.4, 0.56) : srgb(0.03, 0.3, 0.46) },
          shallowColor: { value: frost ? srgb(0.2, 0.56, 0.68) : jade ? srgb(0.16, 0.8, 0.76) : srgb(0.12, 0.6, 0.62) },
          depthMap: { value: depthTexture(grid) },
          mapHalf: { value: MAP_HALF },
          flow: { value: seaMoves() ? 1 : 0 },
          holeR: { value: 0 },
        },
      ]),
      transparent: true,
      depthWrite: true,
      fog: true,
    });
    this.mat.uniforms.normalMap.value = getWaterNormalTexture();
    Object.assign(this.mat.uniforms, TERRAIN_LIGHT);
    void u;
    // A disc of concentric rings so vertices stay dense near the camera (and the
    // sea follows the Earth's curve when seen from high up).
    const geo = ringDisc(SEA_R, 100, 128, 10);
    this.water = new THREE.Mesh(geo, this.mat);
    this.water.frustumCulled = false;
    this.water.renderOrder = 1;
    this.water.name = 'water';
    scene.add(this.water);

    // the open ocean: a dense patch around the camera carries the rolling swell
    if (seaMoves()) {
      const pm = this.mat.clone();
      // same uniforms (one update drives both), but the patch never has a hole
      pm.uniforms = { ...this.mat.uniforms, holeR: { value: 0 } };
      pm.defines = { WAVES: 1 };
      pm.vertexShader = WATER_VERT.replace('// @WAVES@', wavesGlsl());
      this.patch = new THREE.Mesh(ringDisc(PATCH_R, 72, 144, 1.5), pm);
      this.patch.frustumCulled = false;
      this.patch.renderOrder = 1;
      this.patch.name = 'water-near';
      scene.add(this.patch);
    }

    // same rings as the sea, so it stays 90 m under it all the way to the horizon
    this.abyss = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.03, 0.14, 0.26, THREE.SRGBColorSpace), fog: true }));
    this.abyss.position.y = -90;
    this.abyss.frustumCulled = false;
    this.abyss.name = 'abyss';
    scene.add(this.abyss);
  }

  update(dt: number, camPos: THREE.Vector3): void {
    this.t += dt;
    const u = this.mat.uniforms;
    u.time.value = this.t;
    const e = this.env.uniformsForWater;
    (u.sunDir.value as THREE.Vector3).copy(e.sunDir);
    (u.sunColor.value as THREE.Color).copy(e.sunColor);
    (u.horizonColor.value as THREE.Color).copy(e.horizon);
    (u.zenithColor.value as THREE.Color).copy(e.zenith);
    this.water.position.set(camPos.x, 0, camPos.z);
    if (this.patch) {
      this.patch.position.set(camPos.x, 0, camPos.z);
      // high up, the swell is too small to see: let the flat disc draw it all
      const near = camPos.y < 2500;
      this.patch.visible = near;
      u.holeR.value = near ? PATCH_R - 1 : 0;
    }
    this.abyss.position.set(camPos.x, -90, camPos.z);
  }
}
