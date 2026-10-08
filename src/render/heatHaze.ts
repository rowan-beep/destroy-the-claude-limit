// Heat haze: the air behind a hot engine bends the light passing through it,
// so whatever is seen through an exhaust plume shimmers and wobbles. Each
// plume is a capsule on screen (from the nozzle exit to where the jet has
// cooled); inside it the picture is displaced by noise that flows downstream.

import * as THREE from 'three';
import { SCRUB_GLSL } from './scrub';

export const MAX_HAZE = 8;

export interface HazeSource {
  /** nozzle exit and end of the hot column (world) */
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** radius at the exit and at the end (m) */
  r0: number;
  r1: number;
  /** 0..1 (afterburner ~1, military power ~0.45) */
  strength: number;
}

export const HeatHazeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    count: { value: 0 },
    aspect: { value: 1 },
    /** one pixel, in uv */
    px: { value: new THREE.Vector2(1, 1) },
    seg: { value: Array.from({ length: MAX_HAZE }, () => new THREE.Vector4()) },
    rad: { value: Array.from({ length: MAX_HAZE }, () => new THREE.Vector4()) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform int count;
    uniform float aspect;
    uniform vec2 px;
    ${SCRUB_GLSL}
    uniform vec4 seg[${MAX_HAZE}];   // exit uv, end uv
    uniform vec4 rad[${MAX_HAZE}];   // radius at exit, at end (uv height units), strength
    varying vec2 vUv;
    float h2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
    float n2( vec2 p ) {
      vec2 i = floor( p ); vec2 f = fract( p );
      f = f * f * ( 3.0 - 2.0 * f );
      return mix( mix( h2( i ), h2( i + vec2( 1, 0 ) ), f.x ), mix( h2( i + vec2( 0, 1 ) ), h2( i + vec2( 1, 1 ) ), f.x ), f.y );
    }
    void main() {
      vec2 off = vec2( 0.0 );
      vec2 P = vUv * vec2( aspect, 1.0 );
      for ( int i = 0; i < ${MAX_HAZE}; i++ ) {
        if ( i >= count ) break;
        vec2 A = seg[i].xy * vec2( aspect, 1.0 );
        vec2 B = seg[i].zw * vec2( aspect, 1.0 );
        vec2 AB = B - A;
        float L2 = max( dot( AB, AB ), 1e-8 );
        float t = clamp( dot( P - A, AB ) / L2, 0.0, 1.0 );
        float d = length( P - A - AB * t );
        float R = mix( rad[i].x, rad[i].y, t );
        if ( d > R ) continue;
        // strongest in the core just behind the nozzle, fading as the jet cools and mixes
        float w = ( 1.0 - smoothstep( 0.2, 1.0, d / R ) ) * smoothstep( 0.0, 0.06, t ) * ( 1.0 - 0.75 * t ) * rad[i].z;
        // noise flowing downstream along the plume, scaled to its size on screen
        vec2 dir = AB / sqrt( L2 );
        vec2 q = vec2( dot( P - A, dir ), dot( P - A, vec2( -dir.y, dir.x ) ) ) / max( R, 1e-4 );
        vec2 f = q * vec2( 2.2, 3.4 ) - vec2( time * 9.0, 0.0 );
        vec2 g = vec2( n2( f ) + 0.5 * n2( f * 2.3 + 7.1 ), n2( f + 19.7 ) + 0.5 * n2( f * 2.3 + 3.3 ) ) - 0.75;
        off += g * w * R * 0.1;
      }
      gl_FragColor = sceneTexel( tDiffuse, vUv + off * vec2( 1.0 / aspect, 1.0 ), px );
    }`,
};

const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();

/**
 * Project the sources nearest the camera into the pass uniforms.
 * Returns how many were written.
 */
export function writeHaze(sources: HazeSource[], camera: THREE.PerspectiveCamera, u: typeof HeatHazeShader.uniforms): number {
  const cam = camera.position;
  const list = sources
    .filter((s) => s.strength > 0.02)
    .map((s) => ({ s, d: s.a.distanceToSquared(cam) }))
    .filter((x) => x.d < 320 * 320)
    .sort((x, y) => x.d - y.d);
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360) / Math.max(0.01, camera.zoom);
  const view = camera.matrixWorldInverse;
  let n = 0;
  for (const { s } of list) {
    if (n >= MAX_HAZE) break;
    // seen from ahead, the jet itself is in front of its exhaust: little to bend
    const dir = _vb.copy(s.b).sub(s.a).normalize();
    const facing = _va.copy(cam).sub(s.a).normalize().dot(dir);
    const strength = s.strength * THREE.MathUtils.smoothstep(facing, -0.4, 0.3);
    if (strength < 0.02) continue;
    _va.copy(s.a).applyMatrix4(view);
    _vb.copy(s.b).applyMatrix4(view);
    const near = -0.4;
    if (_va.z > near && _vb.z > near) continue;
    let r0 = s.r0, r1 = s.r1;
    // clip the column where it passes behind the camera
    if (_va.z > near || _vb.z > near) {
      const k = (near - _va.z) / (_vb.z - _va.z);
      const cut = _va.clone().lerp(_vb, k);
      const rc = r0 + (r1 - r0) * k;
      if (_va.z > near) {
        _va.copy(cut);
        r0 = rc;
      } else {
        _vb.copy(cut);
        r1 = rc;
      }
    }
    const toUv = (v: THREE.Vector3, out: { x: number; y: number }) => {
      const w = -v.z;
      out.x = 0.5 + (v.x / (w * tanHalf * camera.aspect)) * 0.5;
      out.y = 0.5 + (v.y / (w * tanHalf)) * 0.5;
    };
    const pa = { x: 0, y: 0 }, pb = { x: 0, y: 0 };
    toUv(_va, pa);
    toUv(_vb, pb);
    const ra = (r0 / (-_va.z * tanHalf)) * 0.5;
    const rb = (r1 / (-_vb.z * tanHalf)) * 0.5;
    if (Math.max(ra, rb) < 0.002) continue;
    u.seg.value[n].set(pa.x, pa.y, pb.x, pb.y);
    u.rad.value[n].set(ra, rb, strength, 0);
    n++;
  }
  u.count.value = n;
  return n;
}
