// The sea: a camera-following water plane with animated normal-mapped
// waves, Fresnel sky reflection and sun glitter, drawn semi-transparent so
// the sandy shallows, sea lochs and Capri's blue grottoes glow turquoise.
// Below it an opaque "abyss" plane hides the deep sea floor.

import * as THREE from 'three';
import { getWaterNormalTexture } from '../render/textures';
import { Environment } from '../render/environment';

const WATER_VERT = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vRel;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vWorldPos = wp.xyz;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
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
varying vec3 vWorldPos;
varying vec3 vRel;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>

vec3 sampleN( vec2 uv ) {
  return texture2D( normalMap, uv ).xyz * 2.0 - 1.0;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 rel = vRel;
  float dist = length( rel );
  vec3 V = -rel / max( dist, 1e-3 );
  vec2 uv = vWorldPos.xz;
  vec3 n1 = sampleN( uv / 210.0 + time * vec2( 0.010, 0.007 ) );
  vec3 n2 = sampleN( uv / 57.0 + time * vec2( -0.021, 0.016 ) );
  vec3 n3 = sampleN( uv / 13.0 + time * vec2( 0.05, -0.04 ) );
  vec3 n4 = sampleN( uv / 1400.0 + time * vec2( 0.002, 0.0015 ) );
  float fade = 1.0 - smoothstep( 800.0, 30000.0, dist );
  float fade2 = 1.0 - smoothstep( 60.0, 900.0, dist );
  vec2 slope = ( n1.xy * 0.9 + n2.xy * 0.6 ) * fade + n3.xy * 0.5 * fade2 + n4.xy * 0.8;
  vec3 N = normalize( vec3( slope.x * 0.35, 1.0, slope.y * 0.35 ) );
  float ndv = max( dot( N, V ), 0.0 );
  float fresnel = 0.02 + 0.98 * pow( 1.0 - ndv, 5.0 );
  vec3 R = reflect( -V, N );
  float ry = max( R.y, 0.0 );
  vec3 sky = mix( horizonColor, zenithColor, pow( ry, 0.45 ) );
  float sdr = max( dot( R, sunDir ), 0.0 );
  vec3 spec = sunColor * ( pow( sdr, 900.0 ) * 30.0 + pow( sdr, 90.0 ) * 0.6 ) * step( 0.0, sunDir.y );
  float sunLit = clamp( sunDir.y * 1.5 + 0.2, 0.2, 1.0 );
  vec3 body = deepColor * sunLit;
  vec3 col = mix( body, sky, fresnel ) + spec;
  float alpha = mix( 0.74, 1.0, clamp( fresnel * 1.6 + smoothstep( 2000.0, 20000.0, dist ), 0.0, 1.0 ) );
  gl_FragColor = vec4( col, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class Ocean {
  readonly water: THREE.Mesh;
  readonly abyss: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private t = 0;

  constructor(
    scene: THREE.Scene,
    private env: Environment,
  ) {
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
          deepColor: { value: new THREE.Color().setRGB(0.05, 0.22, 0.38, THREE.SRGBColorSpace) },
        },
      ]),
      transparent: true,
      depthWrite: true,
      fog: true,
    });
    this.mat.uniforms.normalMap.value = getWaterNormalTexture();
    void u;
    // A disc of concentric rings so vertices stay dense near the camera.
    const geo = new THREE.CircleGeometry(900000, 64);
    geo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(geo, this.mat);
    this.water.frustumCulled = false;
    this.water.renderOrder = 1;
    this.water.name = 'water';
    scene.add(this.water);

    const abyssGeo = new THREE.CircleGeometry(900000, 32);
    abyssGeo.rotateX(-Math.PI / 2);
    this.abyss = new THREE.Mesh(abyssGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.03, 0.14, 0.26, THREE.SRGBColorSpace), fog: true }));
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
    this.abyss.position.set(camPos.x, -90, camPos.z);
  }
}
