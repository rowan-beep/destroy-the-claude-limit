// Bioluminescence: in dark water the plankton flash when they are disturbed,
// blue-green (about 480 nm, the colour that carries furthest in seawater). The
// hull pushing through the water and the thrusters' wash set off sparks that
// flare in a few hundredths of a second and fade over a second or so. They
// make their own light, so they are seen only where the daylight has gone:
// the deep basin, or with the lamps off in the slope's twilight.

import * as THREE from 'three';
import { OCEAN_FX } from './oceanMaterial';

const VERT = /* glsl */ `
attribute float aBorn;
attribute float aLife;
attribute float aGain;
uniform float uNow;
uniform float uPx;
uniform vec3 uSigma;
varying float vI;
void main() {
  float age = uNow - aBorn;
  // a quick flare, then a slower fade
  float f = age < 0.0 || age > aLife ? 0.0 : smoothstep( 0.0, 0.05, age ) * exp( -age / ( aLife * 0.35 ) );
  vec4 mv = viewMatrix * vec4( position, 1.0 );
  float d = -mv.z;
  vI = f * aGain;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = f > 0.0 ? clamp( 0.05 * uPx / max( d, 0.1 ), 1.5, 9.0 ) : 0.0;
  // (the water dims it on the way to the eye, blue-green least)
  vI *= exp( -uSigma.g * d * 0.85 );
}
`;
const FRAG = /* glsl */ `
uniform sampler2D uDot;
varying float vI;
void main() {
  float a = texture2D( uDot, gl_PointCoord ).a * vI;
  if ( a < 0.002 ) discard;
  gl_FragColor = vec4( vec3( 0.18, 0.78, 1.0 ) * a, 0.0 );
}
`;

export class Bioluminescence {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private max: number;
  private next = 0;
  private pos: Float32Array;
  private born: Float32Array;
  private life: Float32Array;
  private gain: Float32Array;
  private geo: THREE.BufferGeometry;
  private dirtyFrom = -1;
  private dirtyTo = -1;

  constructor(max: number, dot: THREE.Texture) {
    this.max = Math.max(1, max);
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.born = new Float32Array(this.max).fill(-1e9);
    this.life = new Float32Array(this.max).fill(1);
    this.gain = new Float32Array(this.max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aBorn', new THREE.BufferAttribute(this.born, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aGain', new THREE.BufferAttribute(this.gain, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uNow: { value: 0 }, uPx: { value: 600 }, uSigma: OCEAN_FX.uSigma, uDot: { value: dot } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.name = 'bioluminescence';
    this.points.renderOrder = 6;
  }

  /** a spark at a point, now; gain is how bright (exposure-relative: the deep's camera sees faint light) */
  spark(x: number, y: number, z: number, now: number, gain: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.born[i] = now + Math.random() * 0.08;
    this.life[i] = 0.5 + Math.random() * 1.3;
    this.gain[i] = gain * (0.4 + Math.random() * 0.9);
    if (this.dirtyFrom < 0) this.dirtyFrom = this.dirtyTo = i;
    else {
      this.dirtyFrom = Math.min(this.dirtyFrom, i);
      this.dirtyTo = Math.max(this.dirtyTo, i);
    }
  }

  update(now: number, px: number, visible: boolean): void {
    this.mat.uniforms.uNow.value = now;
    this.mat.uniforms.uPx.value = px;
    this.points.visible = visible;
    if (this.dirtyFrom >= 0) {
      // (the ring wraps: upload the whole of it rather than two ranges)
      for (const k of ['position', 'aBorn', 'aLife', 'aGain']) this.geo.attributes[k].needsUpdate = true;
      this.dirtyFrom = this.dirtyTo = -1;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
