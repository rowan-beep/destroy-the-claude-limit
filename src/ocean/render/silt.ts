// Sediment the boat stirs up: run the thrusters close to a soft bottom (or
// touch it) and the wash lifts it in billowing clouds. Fine silt (the deep
// basin's mud) hangs for half a minute, drifting with the current and spreading
// as it slowly settles; sand drops back within seconds. The puffs are soft
// billboards lit like everything else in the water: daylight for their depth,
// the lamps' beams (a silt-out in the lamps is a wall of light), and the water
// between them and the eye.

import * as THREE from 'three';
import { OCEAN_FX } from './oceanMaterial';
import { LAMPS } from './fx';
import { currentAt } from '../world/geo';

const VERT = /* glsl */ `
attribute vec4 aPuff;   // centre, size (m)
attribute vec4 aLook;   // opacity, seed, kind (0 sand, 1 silt), age 0..1
uniform vec3 uKd;
uniform vec3 uSigma;
uniform vec3 uScatter;
uniform float uDayK;
uniform vec3 uLampP0, uLampD0, uLampP1, uLampD1;
uniform float uLampOn;
varying vec2 vUv;
varying vec4 vLook;
varying vec3 vCol;
varying float vT;
float beam( vec3 p, vec3 lp, vec3 ld ) {
  vec3 v = p - lp;
  float d = length( v );
  float c = dot( v / max( d, 1e-3 ), ld );
  return smoothstep( 0.72, 0.9, c ) / ( 1.0 + d * d * 0.3 );
}
void main() {
  vUv = position.xy + 0.5;
  vLook = aLook;
  vec3 c = aPuff.xyz;
  // a billboard facing the camera
  vec3 right = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
  vec3 up = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
  vec3 p = c + ( right * position.x + up * position.y ) * aPuff.w;
  // its light: the daylight left at its depth (from above, so it is lit on top), and the lamps
  float depth = max( -c.y, 0.0 );
  vec3 alb = mix( vec3( 0.62, 0.58, 0.5 ), vec3( 0.5, 0.48, 0.44 ), aLook.z );
  vec3 day = exp( -uKd * depth ) * uDayK * ( 0.75 + 0.25 * position.y );
  float lit = ( beam( c, uLampP0, uLampD0 ) + beam( c, uLampP1, uLampD1 ) ) * uLampOn;
  vec3 lamp = vec3( 1.0, 0.95, 0.88 ) * lit * 2.2 * exp( -uSigma * length( c - uLampP0 ) );
  // and the water between it and the eye
  float L = length( c - cameraPosition );
  vec3 T = exp( -uSigma * L );
  float dEff = mix( max( -cameraPosition.y, 0.0 ), depth, min( L, 9.0 ) / max( L, 1e-3 ) );
  vCol = alb * ( day + lamp ) * T + uScatter * exp( -uKd * dEff ) * ( 1.0 - T );
  vT = ( T.g + T.b ) * 0.5;
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vLook;
varying vec3 vCol;
varying float vT;
float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float n( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( h( i ), h( i + vec2( 1.0, 0.0 ) ), u.x ), mix( h( i + vec2( 0.0, 1.0 ) ), h( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
void main() {
  vec2 q = vUv - 0.5;
  float r = length( q ) * 2.0;
  if ( r > 1.0 ) discard;
  // a billow: soft edge, lumpy inside, a little different for every puff
  vec2 s = q * 3.2 + vLook.y * 17.0;
  float lump = 0.55 * n( s ) + 0.3 * n( s * 2.3 + 4.1 ) + 0.15 * n( s * 5.1 + 9.7 );
  float a = smoothstep( 1.0, 0.25, r + ( lump - 0.5 ) * 0.7 ) * vLook.x;
  // (far away the water, not the silt, decides the colour: thin it out with the distance)
  a *= 0.35 + 0.65 * vT;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( vCol * a, a );
}
`;

export class SiltClouds {
  readonly mesh: THREE.InstancedMesh;
  private mat: THREE.ShaderMaterial;
  private max: number;
  private next = 0;
  private live = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private grow: Float32Array;
  private kind: Float32Array;
  private seed: Float32Array;
  private puff: THREE.InstancedBufferAttribute;
  private look: THREE.InstancedBufferAttribute;
  /** how bright daylight is in the water (set from the weather) */
  readonly dayK = { value: 0.6 };

  constructor(max: number) {
    this.max = Math.max(1, max);
    const g = new THREE.PlaneGeometry(1, 1);
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.age = new Float32Array(this.max).fill(1e9);
    this.life = new Float32Array(this.max).fill(1);
    this.grow = new Float32Array(this.max);
    this.kind = new Float32Array(this.max);
    this.seed = new Float32Array(this.max);
    this.puff = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4);
    this.look = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4);
    this.puff.setUsage(THREE.DynamicDrawUsage);
    this.look.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPuff', this.puff);
    g.setAttribute('aLook', this.look);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uKd: OCEAN_FX.uKd, uSigma: OCEAN_FX.uSigma, uScatter: OCEAN_FX.uScatter, uDayK: this.dayK, ...LAMPS },
      transparent: true,
      depthWrite: false,
      // (premultiplied: the silt hides what is behind it and adds its own light)
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'silt';
  }

  /** stir up n puffs at a point on the bottom, pushed along (vx, vz) by the wash; silt (fine mud) or sand */
  emit(x: number, y: number, z: number, n: number, vx: number, vz: number, silt: boolean): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const sp = silt ? 0.5 : 0.3;
      this.pos[i * 3] = x + (Math.random() - 0.5) * sp;
      this.pos[i * 3 + 1] = y + Math.random() * 0.2;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * sp;
      const push = 0.6 + Math.random() * 0.8;
      this.vel[i * 3] = vx * push + (Math.random() - 0.5) * 0.35;
      this.vel[i * 3 + 1] = (silt ? 0.25 : 0.18) + Math.random() * 0.35;
      this.vel[i * 3 + 2] = vz * push + (Math.random() - 0.5) * 0.35;
      this.age[i] = 0;
      // fine silt hangs for half a minute and spreads wide; sand drops out in seconds
      this.life[i] = silt ? 22 + Math.random() * 16 : 5 + Math.random() * 4;
      this.grow[i] = silt ? 2.4 + Math.random() * 1.6 : 0.9 + Math.random() * 0.6;
      this.kind[i] = silt ? 1 : 0;
      this.seed[i] = Math.random();
    }
  }

  update(dt: number): void {
    const P = this.puff.array as Float32Array, L = this.look.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) continue;
      // the wash dies away in the water; the cloud drifts with the current and slowly settles
      const drag = Math.exp(-dt * 1.6);
      const cur = currentAt(this.pos[i * 3], this.pos[i * 3 + 2], -this.pos[i * 3 + 1]);
      this.vel[i * 3] = this.vel[i * 3] * drag + cur.x * (1 - drag);
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * drag + cur.z * (1 - drag);
      const settle = this.kind[i] ? -0.012 : -0.09;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + settle * (1 - drag);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // packed into the live range (order does not matter: they are all alike)
      P[n * 4] = this.pos[i * 3];
      P[n * 4 + 1] = this.pos[i * 3 + 1];
      P[n * 4 + 2] = this.pos[i * 3 + 2];
      P[n * 4 + 3] = 0.35 + this.grow[i] * Math.sqrt(t);
      // thick at first, thinning as it spreads
      L[n * 4] = Math.min(1, t * 12) * (1 - t) * (1 - t) * (this.kind[i] ? 0.85 : 0.7);
      L[n * 4 + 1] = this.seed[i];
      L[n * 4 + 2] = this.kind[i];
      L[n * 4 + 3] = t;
      n++;
    }
    this.live = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n) {
      this.puff.needsUpdate = true;
      this.look.needsUpdate = true;
    }
  }

  get count(): number {
    return this.live;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
