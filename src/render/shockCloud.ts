// The sound barrier, as the air shows it: a true 3-D volume of condensing vapour.
//
// Near Mach 1 in damp air the pressure drops behind the shock, the water in the air
// condenses on it, and a cone of cloud springs out round the jet (the Prandtl-Glauert
// condensation cloud). As in the photographs it is a big, smooth, bright cone: a razor-sharp
// front edge where the shock stands, a thin denser skin on its surface, a calm interior, and
// a soft rear that combs out into long streaks along the flow. It SLIDES back along the
// fuselage as the jet speeds up.
//
// Its life follows the Mach number, and runs backwards when the jet slows down:
//   0.96        a small cone forms and creeps larger as Mach 1 nears;
//   1.0         it EXPLODES outward, overshooting, with violent ripples running aft along it
//               (paired with the boom: game.watchBarrier fires at the same moment);
//   1.015       it collapses back to its small shape (held at least ~0.7 s so the blast always reads);
//   1.1 - 1.3   and the small cone dissipates, fully gone by 1.3.
//
// Here it is ray-marched in the shader through the vapour noise volume (vaporNoise.ts),
// not painted on a shell: it has depth, it is lit by the sun, it shades itself (from astern:
// a bright disc with a darker rim), and the airframe shows through it.
//
//  - ShockVolume: one bounding cylinder, rendered from inside, marched analytically.
//  - ShockCloud : the volume that follows the jet.

import * as THREE from 'three';
import { vaporNoiseTexture } from './vaporNoise';
import type { VaporLight } from './vaporLight';

const VERT = /* glsl */ `
uniform vec3 uScl;
uniform vec3 uCen;
varying vec3 vObj;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  // the point in the volume's own frame (metres): the unit cylinder scaled to its bounds
  vObj = position * uScl + uCen;
  vec4 mvPosition = curveView( modelViewMatrix * vec4( position, 1.0 ) );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler3D noiseMap;
uniform float time;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uUp;
uniform vec3 uSunCol;
uniform vec3 uAmbCol;
uniform int uSteps;
uniform float uK;
uniform float uSeed;
uniform float uSigma;
uniform float uNS;
uniform float uLen;
// the cloud's shape: shockZ, length, radius
uniform vec4 uShape;
// the bounding cylinder's radius and its two ends (the volume's frame, metres)
uniform vec3 uBox;
// the airframe, to hide the far side of the cloud behind it: body radius and ends; wing half-span and root and tip z
uniform vec3 uBody;
uniform vec3 uWing;
// look: brightness, fill density, skin density
uniform vec3 uLook;
// the ripples of the explosion: strength (0 = calm), age in seconds
uniform vec2 uRip;
varying vec3 vObj;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>

float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
float hg( float c, float g ) { float g2 = g * g; return ( 1.0 - g2 ) / pow( 1.0 + g2 - 2.0 * g * c, 1.5 ); }

// where the ray o + t d crosses the capped cylinder round z (radius R, z0..z1): near and far t (far < near when it misses)
vec2 cylIntersect( vec3 o, vec3 d, float R, float z0, float z1 ) {
  float a = dot( d.xy, d.xy );
  float b = dot( o.xy, d.xy );
  float c = dot( o.xy, o.xy ) - R * R;
  float t0 = -1e9, t1 = 1e9;
  if ( a > 1e-8 ) {
    float h = b * b - a * c;
    if ( h < 0.0 ) return vec2( 1.0, 0.0 );
    h = sqrt( h );
    t0 = ( -b - h ) / a;
    t1 = ( -b + h ) / a;
  } else if ( c > 0.0 ) return vec2( 1.0, 0.0 );
  if ( abs( d.z ) > 1e-6 ) {
    float s0 = ( z0 - o.z ) / d.z, s1 = ( z1 - o.z ) / d.z;
    t0 = max( t0, min( s0, s1 ) );
    t1 = min( t1, max( s0, s1 ) );
  } else if ( o.z < z0 || o.z > z1 ) return vec2( 1.0, 0.0 );
  return vec2( t0, t1 );
}

// how much vapour is at p (0..1). full = the whole detail (the view ray); not full = the cheap
// lookup for the light rays (one fetch).
// The cloud is a hull of revolution round the jet's axis (z, nose at -z): its front edge is the shock
// (a razor edge at z = zs), it opens quickly to its full radius, then tapers aft. A thin, denser skin
// lies on its surface, the inside is calm, and the rear combs out into long streaks along the flow.
float density( vec3 p, float lod, bool full ) {
  float zs = uShape.x, T = uShape.y, R = uShape.z;
  float zz = p.z - zs;
  if ( zz < -0.02 * T || zz > 1.25 * T ) return 0.0;
  float rr = length( p.xy );
  if ( rr > R * 1.2 ) return 0.0;
  float u = zz / T;
  // the streaks: noise round the axis (the same at every z along the flow, only slowly changing)
  vec2 dir = p.xy / max( rr, 0.05 * R );
  vec3 q = vec3( dir * 2.2, ( p.z - 28.0 * time ) * uNS * 0.16 ) + vec3( uSeed, 0.0, 0.0 );
  vec4 a = textureLod( noiseMap, q, lod );
  // the radius at this z
  float Rp = R * ( 0.3 + 0.7 * pow( smoothstep( 0.0, 0.38, u ), 0.65 ) ) * ( 1.0 - 0.42 * smoothstep( 0.35, 1.1, u ) );
  // the explosion's ripples: waves running aft along the cone, bending its radius and shaking its edge
  float rip = uRip.x;
  float rw = 0.0;
  if ( rip > 0.002 ) {
    float w = u * 15.0 - uRip.y * 21.0;
    rw = 0.65 * sin( w ) + 0.35 * sin( w * 1.9 + dir.x * 2.6 - dir.y * 1.8 + uSeed * 6.0 );
    Rp *= 1.0 + rip * 0.32 * rw * smoothstep( 0.0, 0.1, u );
  }
  float edge = ( ( a.r - 0.5 ) * 0.1 + ( a.g - 0.5 ) * 0.05 ) * ( 1.0 + rip * 3.5 );
  float v = rr / Rp + edge;
  // the sharp front: the shock
  float front = smoothstep( -0.004 * T, 0.01 * T, zz );
  // the inside is calm; the outer skin is denser
  float fill = 1.0 - smoothstep( 0.6, 1.02, v );
  float skinR = ( v - 0.9 ) / 0.11;
  float skin = exp( -skinR * skinR );
  // a bright wall at the shock itself
  float sz = zz / ( 0.045 * T );
  float sheet = exp( -sz * sz ) * fill;
  // the rear tears into streaks along the flow
  float st = a.g * 0.6 + a.b * 0.4;
  float back = 1.0 - smoothstep( 0.5, 1.05, u + ( st - 0.5 ) * 0.75 );
  float rear = 1.0 - 0.45 * smoothstep( 0.2, 1.0, u );
  float dens = ( uLook.y * fill + uLook.z * skin ) * rear;
  if ( full ) {
    // finer fibres, stretched with the flow, only in the rear half
    vec4 b = textureLod( noiseMap, vec3( dir * 7.0, ( p.z - 28.0 * time ) * uNS * 0.5 ) + 0.37, lod + 1.0 );
    dens *= mix( 1.0, 0.55 + 0.9 * b.b, smoothstep( 0.25, 0.95, u ) * 0.7 );
  }
  dens *= 1.0 + rip * 0.9 * max( rw, 0.0 );
  dens = max( dens * back, sheet * 0.8 );
  return clamp( dens * front, 0.0, 1.0 ) * smoothstep( 0.0, 0.25, uK );
}

void main() {
  // (the screen-space derivatives first, before any discard)
  float pxM = length( dFdx( vObj ) ) + length( dFdy( vObj ) );
  #include <logdepthbuf_fragment>
  vec3 D = normalize( vObj - uCam );
  vec2 ci = cylIntersect( uCam, D, uBox.x, uBox.y, uBox.z );
  float tn = max( ci.x, 0.0 ), tf = ci.y;
  if ( tf <= tn + 0.005 ) discard;
  // the airframe hides the far side of the cloud: a ray that goes through the fuselage, or through a
  // wing's plan, can only see the cloud on this side of it
  float tca = -dot( uCam.xy, D.xy ) / max( dot( D.xy, D.xy ), 1e-6 );
  if ( tca > tn && tca < tf ) {
    vec3 pc = uCam + D * tca;
    float onBody = ( 1.0 - smoothstep( uBody.x * 0.85, uBody.x * 1.4, length( pc.xy ) ) )
      * smoothstep( uBody.y - 0.6, uBody.y + 0.6, pc.z ) * ( 1.0 - smoothstep( uBody.z - 0.6, uBody.z + 0.6, pc.z ) );
    tf = mix( tf, tca, onBody );
  }
  if ( abs( D.y ) > 1e-4 ) {
    float tw = -uCam.y / D.y;
    if ( tw > tn && tw < tf ) {
      vec3 pw = uCam + D * tw;
      float onWing = ( 1.0 - smoothstep( uWing.x * 0.9, uWing.x * 1.02, abs( pw.x ) ) )
        * smoothstep( uWing.y - 0.5, uWing.y + 0.5, pw.z ) * ( 1.0 - smoothstep( uWing.z - 0.5, uWing.z + 0.5, pw.z ) );
      tf = mix( tf, tw, onWing );
    }
  }
  float seg = tf - tn;
  if ( seg < 0.01 ) discard;

  float lodBase = max( 0.0, log2( max( pxM, 1e-4 ) * uNS * 64.0 ) );
  float cosT = dot( D, uSun );
  // droplets scatter mostly forward (the glow when the sun is behind the cloud) and a
  // good deal back (bright when it is behind you), little to the side
  float phase = min( 0.7 * hg( cosT, -0.12 ) + 0.3 * hg( cosT, 0.62 ), 1.9 );
  float phaseN = phase / 1.9;
  float stepL = seg / float( uSteps );
  float jit = ign( gl_FragCoord.xy );
  float T = 1.0;
  vec3 L = vec3( 0.0 );
  float dl1 = 0.10 * uLen + 0.05, dl2 = 0.32 * uLen + 0.15, dl3 = 0.8 * uLen + 0.4;
  float dA1 = 0.22 * uLen + 0.1, dA2 = 0.6 * uLen + 0.3;
  for ( int i = 0; i < 40; i++ ) {
    if ( i >= uSteps ) break;
    float t = tn + ( float( i ) + jit ) * stepL;
    vec3 P = uCam + D * t;
    float d = density( P, lodBase, true );
    if ( d > 0.003 ) {
      // the sun's light through the cloud between here and the sun
      float d1 = density( P + uSun * dl1, lodBase + 1.0, false );
      float d2 = density( P + uSun * dl2, lodBase + 1.5, false );
      float d3 = density( P + uSun * dl3, lodBase + 2.0, false );
      float tau = uSigma * ( d1 * dl1 + d2 * ( dl2 - dl1 ) + d3 * ( dl3 - dl2 ) );
      float sunT = exp( -tau * 1.15 ) * 0.78 + exp( -tau * 0.3 ) * 0.22;
      // the cloud shades itself from above: how much of it stands over this point
      float o1 = density( P + uUp * dA1, lodBase + 1.0, false );
      float o2 = density( P + uUp * dA2, lodBase + 1.5, false );
      float ao = mix( 0.55, 1.0, exp( -uSigma * ( o1 * dA1 + o2 * ( dA2 - dA1 ) ) * 0.85 ) );
      vec3 amb = uAmbCol * ao * 1.15;
      // thin edges seen against the dark side are a little darker than the body of the cloud ("powder")
      float powder = mix( 0.62, 1.0, 1.0 - exp( -3.5 * d ) );
      vec3 Ls = ( uSunCol * ( 0.55 + 0.6 * phaseN ) * 0.92 * sunT + amb ) * powder * uLook.x;
      // a shoulder, so the brightest sheet reaches white without burning out
      vec3 over = max( Ls - 0.72, vec3( 0.0 ) );
      Ls = min( Ls, vec3( 0.72 ) ) + 0.28 * ( vec3( 1.0 ) - exp( -over / 0.28 ) );
      float a = 1.0 - exp( -uSigma * d * stepL );
      L += T * a * Ls;
      T *= 1.0 - a;
      if ( T < 0.015 ) break;
    }
  }
  // (from inside the cloud it never whites the whole view out)
  float alpha = min( 1.0 - T, 0.93 );
  if ( alpha < 0.003 ) discard;
  // the game's own aerial-perspective fog works on plain colour: take the cloud's colour out of its alpha and put it back after
  gl_FragColor = vec4( L / max( alpha, 1e-4 ), alpha );
  #include <fog_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
  #ifdef BENCH
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  #endif
}
`;

/** the shock cloud's material */
export function makeShockMaterial(steps: number, bench = false): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (bench) defines.BENCH = '';
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        noiseMap: { value: null as THREE.Data3DTexture | null },
        time: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color(1, 1, 1) },
        uAmbCol: { value: new THREE.Color(0.4, 0.45, 0.55) },
        uSteps: { value: steps },
        uK: { value: 0 },
        uSeed: { value: Math.random() },
        uSigma: { value: 0.8 },
        uNS: { value: 0.07 },
        uLen: { value: 4 },
        uShape: { value: new THREE.Vector4(0, 10, 5, 1) },
        uBox: { value: new THREE.Vector3(1, -1, 1) },
        uBody: { value: new THREE.Vector3(1, -10, 10) },
        uWing: { value: new THREE.Vector3(6, -2, 5) },
        uLook: { value: new THREE.Vector3(1.35, 0.5, 0.75) },
        uRip: { value: new THREE.Vector2(0, 99) },
        uScl: { value: new THREE.Vector3(1, 1, 1) },
        uCen: { value: new THREE.Vector3(0, 0, 0) },
      },
    ]),
    defines,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    // (drawn from the inside: the ray is marched through the whole bounding cylinder, so the
    // cloud still draws when the camera is in it, as it is from the cockpit)
    side: THREE.BackSide,
    fog: true,
  });
  mat.uniforms.noiseMap.value = vaporNoiseTexture();
  return mat;
}

let UNIT: THREE.BufferGeometry | null = null;
/** the unit cylinder round z (radius 1, z from -1 to 1) every volume is scaled from */
function unitCylinder(): THREE.BufferGeometry {
  if (!UNIT) {
    UNIT = new THREE.CylinderGeometry(1, 1, 2, 20, 1, false);
    UNIT.rotateX(Math.PI / 2);
  }
  return UNIT;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** One ray-marched volume: a rigid frame (`root`) carrying a bounding cylinder drawn from the inside. */
export class ShockVolume {
  readonly root = new THREE.Group();
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly mat: THREE.ShaderMaterial;
  private inv = new THREE.Matrix4();
  private cp = new THREE.Vector3();
  readonly sunWorld = new THREE.Vector3(0, 1, 0);

  constructor(steps: number, bench = false) {
    this.mat = makeShockMaterial(steps, bench);
    this.mesh = new THREE.Mesh(unitCylinder(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.name = 'shock-cloud';
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (_r, _s, camera) => {
      this.root.updateWorldMatrix(true, false);
      this.inv.copy(this.root.matrixWorld).invert();
      this.cp.setFromMatrixPosition(camera.matrixWorld);
      const u = this.mat.uniforms;
      (u.uCam.value as THREE.Vector3).copy(this.cp).applyMatrix4(this.inv);
      (u.uSun.value as THREE.Vector3).copy(this.sunWorld).transformDirection(this.inv);
      (u.uUp.value as THREE.Vector3).set(0, 1, 0).transformDirection(this.inv);
      this.mat.uniformsNeedUpdate = true;
    };
    this.root.add(this.mesh);
  }

  /** the bounding cylinder in the root's frame: radius and the two ends along z */
  setBox(R: number, z0: number, z1: number): void {
    const hz = (z1 - z0) / 2, zc = (z0 + z1) / 2;
    // (a little bigger than the analytic cylinder, so the ray marched inside it is never cut by the polygon's flats)
    const s = 1.04;
    this.mesh.position.set(0, 0, zc);
    this.mesh.scale.set(R * s, R * s, hz * s);
    const u = this.mat.uniforms;
    (u.uScl.value as THREE.Vector3).set(R * s, R * s, hz * s);
    (u.uCen.value as THREE.Vector3).set(0, 0, zc);
    (u.uBox.value as THREE.Vector3).set(R, z0, z1);
  }

  setLight(light: VaporLight, now: number): void {
    const u = this.mat.uniforms;
    u.time.value = now;
    this.sunWorld.copy(light.sunDir);
    (u.uSunCol.value as THREE.Color).copy(light.sunCol);
    (u.uAmbCol.value as THREE.Color).copy(light.ambCol);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.mat.dispose();
  }
}

/** The condensation cloud on one jet. */
export class ShockCloud {
  readonly group = new THREE.Group();
  private main: ShockVolume;
  /** 0 = the small cone, 1 = the exploded cone */
  private expl = 0;
  private started = false;
  private burstAge = 99;
  private burstK = 1;

  constructor(
    private L: number,
    private b: number,
    steps: number,
    bench = false,
  ) {
    this.main = new ShockVolume(steps, bench);
    this.group.add(this.main.root);
    const u = this.main.mat.uniforms;
    (u.uBody.value as THREE.Vector3).set(Math.max(0.9, 0.075 * L), -0.5 * L, 0.5 * L);
    (u.uWing.value as THREE.Vector3).set(0.5 * b, -0.1 * L, 0.3 * L);
    u.uNS.value = 0.9 / b;
  }

  /**
   * where the shock stands along the body (z, metres) at this Mach: it sweeps aft as the jet speeds up,
   * but stays ON the jet (the cone wraps the rear fuselage and never drifts off behind the tail)
   */
  shockZ(mach: number): number {
    return clamp(this.L * (-0.34 + 5.2 * (mach - 0.93)), -0.42 * this.L, 0.12 * this.L);
  }

  /** the jet has just crossed Mach 1 (k 1 speeding up, less slowing down): the cone explodes (or collapses) with ripples */
  burst(k: number): void {
    this.burstAge = 0;
    this.burstK = k;
  }

  /**
   * follow the jet: K 0..1 is how strongly the cloud has formed (the Mach window, the air's wetness);
   * supersonic is whether the jet is past Mach 1 (with the same hysteresis as the boom)
   */
  update(dt: number, now: number, pos: THREE.Vector3, quat: THREE.Quaternion, mach: number, K: number, light: VaporLight, enabled: boolean, supersonic: boolean): void {
    const L = this.L;
    const on = enabled && K > 0.01;
    this.main.mesh.visible = on;
    if (!on) return;
    this.main.root.position.copy(pos);
    this.main.root.quaternion.copy(quat);
    const zs = this.shockZ(mach);
    // (as the photographs: the cone is big, well over the jet's own length across, and shortens a little as it thins)
    // the stage: small before Mach 1 (creeping larger as it nears), exploded at Mach 1, small again by about 1.015
    // (a jet that accelerates hard through it still gets the blast: it is held for a moment after the crossing)
    const hold = this.burstK > 0.9 ? 1 - smoothstep(0.7, 1.3, this.burstAge) : 0;
    const target = (supersonic ? 1 : 0) * Math.max(1 - smoothstep(1.008, 1.022, mach), hold);
    if (!this.started) {
      this.expl = target;
      this.started = true;
    }
    this.expl += (target - this.expl) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.11));
    this.burstAge += dt;
    const age = this.burstAge;
    // the ripples die away in about two seconds; the blast overshoots, then settles
    const rip = this.burstK * Math.exp(-age / 0.9) * (age < 4 ? 1 : 0);
    const over = this.burstK * 0.45 * smoothstep(0, 0.08, age) * Math.exp(-age / 0.45);
    const s0 = 0.36 + 0.14 * smoothstep(0.96, 0.995, mach);
    const sz = (s0 + (1 - s0) * this.expl) * (1 + over);
    const T = L * 0.95 * (0.45 + 0.55 * Math.min(sz, 1.25));
    const R = L * 0.52 * sz;
    const u = this.main.mat.uniforms;
    (u.uShape.value as THREE.Vector4).set(zs, T, R, 0);
    (u.uRip.value as THREE.Vector2).set(rip, age);
    u.uK.value = K;
    u.uLen.value = R;
    // (a small cone has a short path through it: a little thicker, so it still reads)
    u.uSigma.value = (0.18 + 0.14 * K) * (1 + 0.9 * (1 - Math.min(1, sz)));
    this.main.setBox(R * (1.15 + 0.45 * rip), zs - 0.03 * T, zs + 1.2 * T);
    this.main.setLight(light, now);
  }

  /** hide everything (a wreck, a jet that is not drawn) */
  setHidden(h: boolean): void {
    if (h) this.main.mesh.visible = false;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.main.dispose();
  }
}

/** a tiny stand-in for the shader, drawn once at loading so it compiles before the first barrier break */
export function shockSamples(): THREE.Object3D[] {
  const v = new ShockVolume(8);
  v.mesh.scale.setScalar(0.01);
  v.mesh.visible = true;
  return [v.root];
}
