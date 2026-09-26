// Terrain lighting baked on the GPU from the theater height grid:
//   R = sun visibility (mountains cast soft shadows across valleys and sea)
//   G = sky visibility (valleys and gorges get less sky light, peaks get all)
// Rebaked whenever the sun moves (time of day). Also holds the moving cloud
// shadow map drawn around the camera by the cloud system. Every material that
// wants this lighting shares the uniforms below by reference.

import * as THREE from 'three';
import { DataUtils } from 'three';
import type { HeightGrid } from '../world/heightGrid';

function blank(v: number): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

/** Shared uniforms (same objects in every material). */
export const TERRAIN_LIGHT = {
  tlMap: { value: blank(255) as THREE.Texture },
  /** x = map half size, y = grid spacing, z = grid samples per side, w = on (0/1) */
  tlGrid: { value: new THREE.Vector4(1, 1, 1, 0) },
  csMap: { value: blank(0) as THREE.Texture },
  /** x,y = world centre, z = size (m), w = strength (0 = off) */
  csArea: { value: new THREE.Vector4(0, 0, 1, 0) },
  /** cloud base height: terrain above it gets no cloud shadow */
  csBase: { value: 2200 },
};

/** GLSL declarations + helpers; `xz` is the world position. */
export const TERRAIN_LIGHT_GLSL = /* glsl */ `
uniform sampler2D tlMap;
uniform vec4 tlGrid;
uniform sampler2D csMap;
uniform vec4 csArea;
uniform float csBase;
vec2 terrainLight( vec2 xz, float h ) {
  if ( tlGrid.w < 0.5 ) return vec2( 1.0 );
  vec2 uv = ( ( xz + tlGrid.x ) / tlGrid.y + 0.5 ) / tlGrid.z;
  if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return vec2( 1.0 );
  return texture2D( tlMap, uv ).rg;
}
float cloudShadow( vec2 xz, float h ) {
  if ( csArea.w <= 0.0 ) return 0.0;
  vec2 uv = ( xz - csArea.xy ) / csArea.z + 0.5;
  if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return 0.0;
  float edge = smoothstep( 0.0, 0.08, min( min( uv.x, uv.y ), min( 1.0 - uv.x, 1.0 - uv.y ) ) );
  return texture2D( csMap, uv ).r * csArea.w * edge * ( 1.0 - smoothstep( csBase - 400.0, csBase + 300.0, h ) );
}
`;

const BAKE_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BAKE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D heights;
uniform float n;
uniform float spacing;
uniform vec3 sunDir;
varying vec2 vUv;
float H( vec2 uv ) { return max( texture2D( heights, uv ).r, 0.0 ); }
void main() {
  vec2 uv = vUv;
  float h0 = H( uv ) + 4.0;
  // --- sun: march toward the sun, track the steepest blocking slope
  vec2 sd = normalize( sunDir.xz + vec2( 1e-6 ) );
  float sunTan = sunDir.y / max( length( sunDir.xz ), 1e-4 );
  float maxSlope = -1e3;
  float t = spacing * 0.8;
  for ( int i = 0; i < 72; i++ ) {
    vec2 p = uv + sd * ( t / spacing ) / n;
    if ( p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0 ) break;
    maxSlope = max( maxSlope, ( H( p ) - h0 ) / t );
    t *= 1.075;
    if ( t > 90000.0 ) break;
  }
  // soft penumbra (wider far from the blocker, like a real 0.5 deg sun + haze)
  float sun = smoothstep( -0.035, 0.03, sunTan - maxSlope );
  // --- sky: horizon angle in 8 directions
  float sky = 0.0;
  for ( int k = 0; k < 8; k++ ) {
    float a = float( k ) * 0.785398 + 0.3;
    vec2 d = vec2( cos( a ), sin( a ) );
    float ms = 0.0;
    float s = spacing;
    for ( int i = 0; i < 12; i++ ) {
      vec2 p = uv + d * ( s / spacing ) / n;
      ms = max( ms, ( H( p ) - h0 ) / s );
      s *= 1.32;
    }
    float sinE = ms / sqrt( 1.0 + ms * ms );
    sky += 1.0 - sinE;
  }
  sky /= 8.0;
  gl_FragColor = vec4( sun, sky, 0.0, 1.0 );
}
`;

export class TerrainLightBaker {
  private heightTex: THREE.DataTexture;
  private target: THREE.WebGLRenderTarget;
  private mat: THREE.ShaderMaterial;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private grid: HeightGrid, half: number) {
    const n = grid.n;
    const half16 = new Uint16Array(n * n);
    const src = grid.data;
    for (let i = 0; i < n * n; i++) half16[i] = DataUtils.toHalfFloat(src[i] > 0 ? src[i] : 0);
    this.heightTex = new THREE.DataTexture(half16, n, n, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.wrapS = this.heightTex.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTex.needsUpdate = true;
    this.target = new THREE.WebGLRenderTarget(n, n, { depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    this.target.texture.generateMipmaps = false;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      uniforms: {
        heights: { value: this.heightTex },
        n: { value: n },
        spacing: { value: grid.spacing },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    TERRAIN_LIGHT.tlGrid.value.set(half, grid.spacing, n, TERRAIN_LIGHT.tlGrid.value.w);
  }

  /** Bake for a sun direction (unit vector toward the sun). */
  bake(renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3): void {
    (this.mat.uniforms.sunDir.value as THREE.Vector3).copy(sunDir);
    const prevTarget = renderer.getRenderTarget();
    const n = this.grid.n;
    // bake in strips so no single draw call keeps the GPU busy for long
    this.target.scissorTest = true;
    const strip = 128;
    for (let y = 0; y < n; y += strip) {
      this.target.scissor.set(0, y, n, Math.min(strip, n - y));
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, this.cam);
    }
    this.target.scissorTest = false;
    this.target.scissor.set(0, 0, n, n);
    renderer.setRenderTarget(prevTarget);
    TERRAIN_LIGHT.tlMap.value = this.target.texture;
  }

  setEnabled(on: boolean): void {
    TERRAIN_LIGHT.tlGrid.value.w = on ? 1 : 0;
  }
}

/** Give a Lambert material (plain or instanced) the baked terrain lighting. */
export function applyTerrainLight(mat: THREE.MeshLambertMaterial): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, TERRAIN_LIGHT);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTlWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 tlw = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            tlw = instanceMatrix * tlw;
          #endif
          vTlWorld = ( modelMatrix * tlw ).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTlWorld;\n' + TERRAIN_LIGHT_GLSL)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          vec2 tl = terrainLight( vTlWorld.xz, vTlWorld.y );
          float cs = cloudShadow( vTlWorld.xz, vTlWorld.y );
          reflectedLight.directDiffuse *= tl.r * ( 1.0 - 0.62 * cs );
          reflectedLight.indirectDiffuse *= ( 0.45 + 0.55 * tl.g ) * ( 1.0 - 0.18 * cs );
        }`,
      );
  };
}
