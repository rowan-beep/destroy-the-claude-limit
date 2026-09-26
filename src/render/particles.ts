// Instanced billboard particles (smoke, fire, sparks, spray). Simulated on
// the CPU in double precision and uploaded relative to a floating origin so
// effects stay rock-steady 350 km from the map centre.

import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iColor;   // rgb, alpha
attribute vec2 iSizeRot; // size, rotation
varying vec2 vUv;
varying vec4 vColor;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vColor = iColor;
  vec4 mvPosition = modelViewMatrix * vec4( iPos, 1.0 );
  float c = cos( iSizeRot.y ), s = sin( iSizeRot.y );
  vec2 corner = vec2( position.x * c - position.y * s, position.x * s + position.y * c );
  mvPosition.xy += corner * iSizeRot.x;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float additive;
varying vec2 vUv;
varying vec4 vColor;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D( map, vUv );
  float a = t.a * vColor.a;
  if ( a < 0.004 ) discard;
  vec3 col = vColor.rgb * t.rgb;
  if ( additive > 0.5 ) {
    gl_FragColor = vec4( col * a, 1.0 );
  } else {
    gl_FragColor = vec4( col, a );
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size0: number;
  size1: number;
  /** start / end colours (linear) */
  c0: THREE.Color;
  c1?: THREE.Color;
  a0: number;
  a1?: number;
  drag?: number;
  gravity?: number;
  rot?: number;
  spin?: number;
}

export class ParticleSystem {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private pos: Float32Array;
  private col: Float32Array;
  private sr: Float32Array;
  // simulation arrays
  private px: Float64Array;
  private py: Float64Array;
  private pz: Float64Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private a0: Float32Array;
  private a1: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  count = 0;
  private origin = new THREE.Vector3();

  constructor(
    readonly max: number,
    texture: THREE.Texture,
    additive: boolean,
    renderOrder = 15,
  ) {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.sr = new Float32Array(max * 2);
    const a1 = new THREE.InstancedBufferAttribute(this.pos, 3);
    const a2 = new THREE.InstancedBufferAttribute(this.col, 4);
    const a3 = new THREE.InstancedBufferAttribute(this.sr, 2);
    for (const a of [a1, a2, a3]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', a1);
    this.geo.setAttribute('iColor', a2);
    this.geo.setAttribute('iSizeRot', a3);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, additive: { value: additive ? 1 : 0 } }]),
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    mat.uniforms.map.value = texture;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.px = new Float64Array(max);
    this.py = new Float64Array(max);
    this.pz = new Float64Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.vz = new Float32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.a1 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
  }

  spawn(p: ParticleSpawn): void {
    let i: number;
    if (this.count < this.max) i = this.count++;
    else {
      // recycle the oldest-by-fraction slot (cheap: overwrite a random one)
      i = Math.floor(Math.random() * this.max);
    }
    this.px[i] = p.x;
    this.py[i] = p.y;
    this.pz[i] = p.z;
    this.vx[i] = p.vx ?? 0;
    this.vy[i] = p.vy ?? 0;
    this.vz[i] = p.vz ?? 0;
    this.age[i] = 0;
    this.life[i] = p.life;
    this.s0[i] = p.size0;
    this.s1[i] = p.size1;
    const c1 = p.c1 ?? p.c0;
    this.c0[i * 3] = p.c0.r;
    this.c0[i * 3 + 1] = p.c0.g;
    this.c0[i * 3 + 2] = p.c0.b;
    this.c1[i * 3] = c1.r;
    this.c1[i * 3 + 1] = c1.g;
    this.c1[i * 3 + 2] = c1.b;
    this.a0[i] = p.a0;
    this.a1[i] = p.a1 ?? 0;
    this.drag[i] = p.drag ?? 0.5;
    this.grav[i] = p.gravity ?? 0;
    this.rot[i] = p.rot ?? Math.random() * Math.PI * 2;
    this.spin[i] = p.spin ?? (Math.random() - 0.5) * 0.6;
  }

  private kill(i: number): void {
    const j = --this.count;
    if (i === j) return;
    this.px[i] = this.px[j];
    this.py[i] = this.py[j];
    this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.vz[i] = this.vz[j];
    this.age[i] = this.age[j];
    this.life[i] = this.life[j];
    this.s0[i] = this.s0[j];
    this.s1[i] = this.s1[j];
    for (let k = 0; k < 3; k++) {
      this.c0[i * 3 + k] = this.c0[j * 3 + k];
      this.c1[i * 3 + k] = this.c1[j * 3 + k];
    }
    this.a0[i] = this.a0[j];
    this.a1[i] = this.a1[j];
    this.drag[i] = this.drag[j];
    this.grav[i] = this.grav[j];
    this.rot[i] = this.rot[j];
    this.spin[i] = this.spin[j];
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.origin.set(Math.round(cam.x / 500) * 500, Math.round(cam.y / 500) * 500, Math.round(cam.z / 500) * 500);
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kill(i);
        continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d + this.grav[i] * dt;
      this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spin[i] * dt;
    }
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const t = this.age[i] / this.life[i];
      this.pos[i * 3] = this.px[i] - this.origin.x;
      this.pos[i * 3 + 1] = this.py[i] - this.origin.y;
      this.pos[i * 3 + 2] = this.pz[i] - this.origin.z;
      this.col[i * 4] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * t;
      this.col[i * 4 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * t;
      this.col[i * 4 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * t;
      // fade in quickly, then toward a1
      const fadeIn = Math.min(1, t * 12);
      this.col[i * 4 + 3] = (this.a0[i] + (this.a1[i] - this.a0[i]) * t) * fadeIn;
      this.sr[i * 2] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      this.sr[i * 2 + 1] = this.rot[i];
    }
    this.geo.instanceCount = n;
    this.mesh.position.copy(this.origin);
    const at = this.geo.attributes;
    (at.iPos as THREE.InstancedBufferAttribute).needsUpdate = true;
    (at.iColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    (at.iSizeRot as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.geo.instanceCount = 0;
  }
}
