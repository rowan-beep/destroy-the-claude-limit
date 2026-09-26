// The free-for-all battle-zone boundary drawn in the world: a towering,
// softly glowing curtain of storm light with streaks racing up it, from the
// sea to far above the fighters. Follows RULES.zone every frame.

import * as THREE from 'three';
import { RULES } from '../game/rules';

const VERT = /* glsl */ `
varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float time;
uniform vec3 color;
uniform vec3 hot;
uniform float opacity;
varying vec2 vUv;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float u = vUv.x * 6.2831853;
  // racing vertical streaks, wobbling so they never look like a fence
  float s1 = 0.5 + 0.5 * sin( u * 220.0 + sin( u * 17.0 + time * 0.4 ) * 4.0 + vUv.y * 9.0 - time * 1.7 );
  float s2 = 0.5 + 0.5 * sin( u * 71.0 - time * 0.9 + vUv.y * 3.0 );
  float streak = pow( s1, 6.0 ) * 0.8 + s2 * 0.35;
  // pulses climbing the wall
  float pulse = pow( 0.5 + 0.5 * sin( vUv.y * 60.0 - time * 3.2 + sin( u * 9.0 ) * 2.0 ), 12.0 );
  float base = 1.0 - smoothstep( 0.0, 0.16, vUv.y );
  float fade = 1.0 - smoothstep( 0.55, 1.0, vUv.y );
  float a = opacity * fade * ( 0.22 + 0.45 * streak + 0.28 * pulse + 0.8 * base );
  vec3 col = mix( color, hot, clamp( pulse * 0.8 + base * 0.6, 0.0, 1.0 ) );
  gl_FragColor = vec4( col * a, 1.0 );
}
`;

export class ZoneWall {
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 360, 1, true);
    geo.translate(0, 0.5, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(0.28, 0.42, 1.0) },
        hot: { value: new THREE.Color(0.85, 0.55, 1.0) },
        opacity: { value: 0.55 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
    this.mesh.name = 'zone-wall';
    scene.add(this.mesh);
  }

  update(dt: number): void {
    const z = RULES.zone;
    this.mesh.visible = z.active && z.r > 10;
    if (!this.mesh.visible) return;
    this.t += dt;
    this.mat.uniforms.time.value = this.t;
    this.mesh.position.set(z.x, -600, z.z);
    this.mesh.scale.set(z.r, 26000, z.r);
  }
}
