// Condensation on a jet pulling hard, as the real thing looks:
//  - vapour on the lifting surfaces: where a wing, tailplane or canard works hard the
//    air over it falls below its dew point and a cloud forms ON the metal. It is a thin
//    VOLUME, not a sheet: dense and clean-edged just behind the leading edge (and over
//    the strake roots), thinning and tearing into curling wisps toward and past the
//    trailing edge, lit by the sun and sky (silver where thin, grey where it is deep) and
//    seen through, so the paint and the panel lines show under a veil of it. Each
//    surface gets a prism of that volume fitted to the real mesh (probed from the jet's
//    own geometry) and ray-marched in the shader through a small 3-D noise;
//  - vortex ropes (vaporRopes.ts): thin threads spun off the tips, strakes and
//    tailplane tips that stay in the air behind the jet;
//  - the transonic cone: near Mach 1 in damp low air a bell of cloud around the fuselage.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { AirframeVisual } from '../aircraft/models/visual';
import { vaporNoiseTexture, vaporNoiseReady, startVaporNoise } from './vaporNoise';
import { VortexRopes, type Rope, type RopeStyle } from './vaporRopes';
import { newVaporLight, type VaporLight } from './vaporLight';

// ============================================================================
// the lifting-surface volume
// ============================================================================

const HULL_VERT = /* glsl */ `
attribute vec2 hiA;
attribute vec3 upN;
attribute float chordA;
varying vec3 vObj;
varying vec3 vUp;
varying vec2 vUv;
varying vec2 vHi;
varying float vChord;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vObj = position;
  vUp = upN;
  vUv = uv;
  vHi = hiA;
  vChord = chordA;
  vec4 mvPosition = curveView( modelViewMatrix * vec4( position, 1.0 ) );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

// s = 0 at the root .. 1 at the tip, c = 0 at the leading edge .. 1 at the trailing edge
// (negative ahead of it, over a strake; above 1 behind it). This must match thickShape()
// in the TypeScript below: it is the top of the cloud, and the hull is built to it.
const HULL_FRAG = /* glsl */ `
uniform sampler3D noiseMap;
uniform float time;
uniform vec3 uCam;
uniform vec3 uSun;
uniform float uLift;
uniform float uTrans;
uniform float uThick;
uniform float uT0;
uniform float uSigma;
uniform float uScale;
uniform float uAdv;
uniform float uSeed;
uniform int uSteps;
uniform vec3 uSunCol;
uniform vec3 uAmbCol;
varying vec3 vObj;
varying vec3 vUp;
varying vec2 vUv;
varying vec2 vHi;
varying float vChord;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>

float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
float hg( float c, float g ) { float g2 = g * g; return ( 1.0 - g2 ) / pow( 1.0 + g2 - 2.0 * g * c, 1.5 ); }

float thickShape( float s, float c ) {
  float fwd = smoothstep( -0.2, 0.22, c );
  float aft = 1.0 - 0.92 * smoothstep( 0.7, 1.5, c );
  float sp = 1.0 - 0.8 * smoothstep( 0.05, 1.0, s );
  return 0.07 + 0.93 * fwd * aft * sp;
}

// how much of the volume at (s, c) is condensing: the boundary roughened by noise.
// (loose > 1 widens the reach (the thin haze that runs on past the dense vapour))
float coverage( float s, float c, float ns, float loose ) {
  float rough = ( ns - 0.5 ) * 0.2;
  // lift: just behind the leading edge (and ahead of it over the strake at the root),
  // inboard first, growing aft and outboard as the load rises
  float reachC = mix( 0.55, 1.2, uLift ) * loose;
  float reachS = mix( 0.4, 1.25, uLift ) * loose;
  float front = smoothstep( -0.16 * ( 1.0 - s ), 0.035, c + rough * 0.5 );
  float aftF = 1.0 - smoothstep( reachC * 0.45, reachC * 1.05, c + rough * 1.6 );
  float spanF = 1.0 - smoothstep( reachS * 0.3, reachS, s + rough );
  // the volume's own walls taper off, so no cut edge shows where the prism ends
  float wall = smoothstep( 0.0, 0.1, s ) * ( 1.0 - smoothstep( 0.93, 1.0, s ) ) * smoothstep( -0.2, -0.1, c ) * ( 1.0 - smoothstep( 1.38, 1.5, c ) );
  float lift = uLift * front * aftF * spanF * wall;
  // transonic: behind the shock, the whole span
  float shockC = mix( 0.55, 0.28, uTrans );
  float tr = smoothstep( shockC - 0.04, shockC + 0.16, c + rough ) * ( 1.0 - smoothstep( 1.0, 1.55, c ) ) * ( 1.0 - 0.5 * s );
  return max( lift, uTrans * tr * 0.85 * wall );
}

float density( vec3 P, vec2 uvq, float h, float lod, bool full ) {
  float s = uvq.x, c = uvq.y;
  float Ht = uT0 * uThick * thickShape( s, c );
  if ( h < 0.0 || h >= Ht * 1.5 ) return 0.0;
  // noise space: stretched along the flow, drifting aft over the surface
  vec3 pp = vec3( P.x, P.y * 1.25, ( P.z - uAdv * time ) * 0.24 ) * uScale;
  // a slow warp bends the edges into the rolled-up curls real vapour has
  vec4 w = textureLod( noiseMap, pp * 0.31 + vec3( uSeed, 0.0, 0.0 ), lod + 1.0 );
  vec3 q = pp + ( w.rgb - 0.5 ) * 0.6;
  vec4 a = textureLod( noiseMap, q, lod );
  float cov = coverage( s, c, a.g, 1.0 );
  float covH = coverage( s, c, a.g, 1.3 );
  if ( covH < 0.004 ) return 0.0;
  // the top of the cloud is a row of billows, not a plane
  float hTop = Ht * ( 0.5 + 0.95 * a.r );
  if ( h >= hTop ) return 0.0;
  float hn = h / hTop;
  float prof = 1.0 - smoothstep( 0.3, 1.0, hn );
  float d = a.r * 0.6 + a.g * 0.28 + a.b * 0.12;
  float comb = 0.5;
  if ( full ) {
    // finer and finer strands, all stretched along the flow so the edges are fibrous, not blobby
    // (each octave is sampled at the mip its own pixel footprint calls for, so none of it shimmers)
    vec4 b = textureLod( noiseMap, vec3( q.x * 3.4, q.y * 3.1, q.z * 0.8 ) + 0.37, lod + 1.77 );
    vec4 c3 = textureLod( noiseMap, vec3( q.x * 7.3, q.y * 6.0, q.z * 1.6 ) + 0.71, lod + 2.87 );
    comb = textureLod( noiseMap, vec3( q.x * 12.0, q.y * 3.0, q.z * 0.1 ) + 0.19, lod + 3.58 ).b;
    d = d * 0.62 + ( b.g * 0.5 + b.b * 0.5 ) * 0.24 + c3.b * 0.14;
  }
  // coverage is a threshold on the noise: more cover, more of it stands above the line
  float band = smoothstep( -0.05, 0.12, c ) * ( 1.0 - smoothstep( 0.28, 0.6, c ) );
  float thr = 1.0 - cov * prof * ( 1.0 + 0.3 * band );
  float dens = clamp( ( d - thr ) / 0.62, 0.0, 1.0 );
  // aft of the front band it combs out into streaks that run with the flow
  dens *= mix( 1.0, 0.35 + 1.25 * comb, smoothstep( 0.22, 0.9, c ) * 0.85 );
  // and a thin haze beyond it: the same noise, much fainter, over a wider reach
  float haze = covH * prof * smoothstep( 0.3, 0.75, d ) * 0.26;
  return clamp( max( dens, haze ), 0.0, 1.0 ) * smoothstep( 1.0, 0.8, hn );
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize( vUp );
  vec3 D = normalize( vObj - uCam );
  float tf = length( vObj - uCam );
  // how the surface coordinates change along the view ray and along the sun ray
  vec3 dp1 = dFdx( vObj ), dp2 = dFdy( vObj );
  vec2 du1 = dFdx( vUv ), du2 = dFdy( vUv );
  float pxM = length( dp1 ) + length( dp2 );
  vec3 dp2p = cross( dp2, N ), dp1p = cross( N, dp1 );
  float det = dot( dp1, dp2p );
  vec3 gu = vec3( 0.0 ), gv = vec3( 0.0 );
  if ( abs( det ) > 1e-12 ) {
    gu = ( dp2p * du1.x + dp1p * du2.x ) / det;
    gv = ( dp2p * du1.y + dp1p * du2.y ) / det;
  }
  vec2 duvD = vec2( dot( gu, D ), dot( gv, D ) );
  vec2 duvS = vec2( dot( gu, uSun ), dot( gv, uSun ) );
  float dn = dot( D, N );
  float sn = dot( uSun, N );
  float h0 = vHi.x;
  float Hmax = uT0 * uThick * 1.5;
  float Lmax = clamp( vChord * 0.9, 1.0, 5.0 );
  float tEnd;
  if ( dn < -1e-3 ) tEnd = tf + h0 / ( -dn );
  else if ( dn > 1e-3 ) tEnd = tf + max( Hmax - h0, 0.0 ) / dn;
  else tEnd = tf + Lmax;
  float seg = min( tEnd - tf, Lmax );
  if ( seg < 0.004 || Hmax < 0.01 ) discard;

  float lodBase = max( 0.0, log2( max( pxM, 1e-4 ) * uScale * 64.0 ) );
  float cosT = dot( D, uSun );
  // droplets scatter mostly forward (the glow when the sun is behind the cloud) and a
  // good deal back (bright when it is behind you), little to the side
  float phase = min( 0.7 * hg( cosT, -0.12 ) + 0.3 * hg( cosT, 0.62 ), 1.9 );
  float phaseN = phase / 1.9;
  // the wing shades the cloud when the sun is below its plane
  float sunVis = smoothstep( -0.04, 0.16, sn );
  float stepL = seg / float( uSteps );
  float jit = ign( gl_FragCoord.xy );
  float T = 1.0;
  vec3 L = vec3( 0.0 );
  float dl1 = 0.07 * Hmax + 0.02, dl2 = 0.22 * Hmax + 0.06, dl3 = 0.55 * Hmax + 0.12;
  float dA1 = 0.18 * Hmax + 0.03, dA2 = 0.5 * Hmax + 0.08;
  for ( int i = 0; i < 40; i++ ) {
    if ( i >= uSteps ) break;
    float t = ( float( i ) + jit ) * stepL;
    vec3 P = vObj + D * t;
    vec2 uvq = vUv + duvD * t;
    float h = h0 + dn * t;
    float d = density( P, uvq, h, lodBase, true );
    if ( d > 0.003 ) {
      float d1 = density( P + uSun * dl1, uvq + duvS * dl1, h + sn * dl1, lodBase + 1.0, false );
      float d2 = density( P + uSun * dl2, uvq + duvS * dl2, h + sn * dl2, lodBase + 1.5, false );
      float d3 = density( P + uSun * dl3, uvq + duvS * dl3, h + sn * dl3, lodBase + 2.0, false );
      float tau = uSigma * ( d1 * dl1 + d2 * ( dl2 - dl1 ) + d3 * ( dl3 - dl2 ) );
      float sunT = exp( -tau * 1.15 ) * 0.78 + exp( -tau * 0.3 ) * 0.22;
      // the cloud shades itself from above: how much of it stands over this point
      float o1 = density( P + N * dA1, uvq, h + dA1, lodBase + 1.0, false );
      float o2 = density( P + N * dA2, uvq, h + dA2, lodBase + 1.5, false );
      float ao = mix( 0.34, 1.0, exp( -uSigma * ( o1 * dA1 + o2 * ( dA2 - dA1 ) ) * 0.85 ) );
      float hn = clamp( h / max( Hmax, 1e-3 ), 0.0, 1.0 );
      // the sky fills it from above; low in the cloud the metal blocks the light from below
      vec3 amb = uAmbCol * ao * mix( 0.55, 1.0, smoothstep( 0.0, 0.4, hn ) );
      // and the sunlit paint glows up into the foot of it
      vec3 bounce = uSunCol * 0.14 * max( sn, 0.0 ) * ( 1.0 - smoothstep( 0.0, 0.4, hn ) ) * ao;
      // thin edges seen against the dark side are a little darker than the body of the cloud ("powder")
      float powder = mix( 0.62, 1.0, 1.0 - exp( -3.5 * d ) );
      vec3 Ls = ( uSunCol * ( 0.5 + 0.5 * phaseN ) * 0.92 * sunT * sunVis + amb + bounce ) * powder;
      // a shoulder, so the brightest tops reach white without burning out
      vec3 over = max( Ls - 0.72, vec3( 0.0 ) );
      Ls = min( Ls, vec3( 0.72 ) ) + 0.28 * ( vec3( 1.0 ) - exp( -over / 0.28 ) );
      float a = 1.0 - exp( -uSigma * d * stepL );
      L += T * a * Ls;
      T *= 1.0 - a;
      if ( T < 0.015 ) break;
    }
  }
  float alpha = 1.0 - T;
  if ( alpha < 0.003 ) discard;
  // the game's own aerial-perspective fog (it fades toward the haze, which lights up toward the sun):
  // it works on plain colour, so take the cloud's colour out of its alpha and put it back after
  gl_FragColor = vec4( L / max( alpha, 1e-4 ), alpha );
  #include <fog_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
  #ifdef BENCH
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  #endif
}
`;

/** the top of the cloud over (s, c): the same curve as thickShape() in the shader */
function thickShape(s: number, c: number): number {
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const fwd = sm(-0.2, 0.22, c);
  const aft = 1 - 0.92 * sm(0.7, 1.5, c);
  const sp = 1 - 0.8 * sm(0.05, 1.0, s);
  return 0.07 + 0.93 * fwd * aft * sp;
}

/** the jet bench (tools/jetview) draws straight to the screen, so the vapour must tone-map itself there; the game does it in its final pass */
export const vaporBench = { toneMap: false, wire: false };

/** the height of the jet's upper surface at a point of its plan (jet frame), or null off the airframe */
export type SurfaceProbe = (x: number, z: number) => number | null;

/** A probe that drops rays through the given geometries (in the jet's frame). */
export function probeFromParts(parts: { geo: THREE.BufferGeometry }[]): SurfaceProbe {
  const meshes = parts.map((p) => {
    const m = new THREE.Mesh(p.geo, new THREE.MeshBasicMaterial());
    m.matrixAutoUpdate = false;
    m.matrixWorld.identity();
    return m;
  });
  const rc = new THREE.Raycaster();
  const o = new THREE.Vector3(), d = new THREE.Vector3(0, -1, 0);
  return (x, z) => {
    o.set(x, 8, z);
    rc.set(o, d);
    let best: number | null = null;
    for (const m of meshes) {
      const hits = rc.intersectObject(m, false);
      for (const h of hits) if (best === null || h.point.y > best) best = h.point.y;
    }
    return best;
  };
}

interface Station {
  x: number;
  le: number;
  te: number;
  /** upper-surface height along the chord (5 samples, leading edge to trailing edge) */
  y: number[];
}

/** a rough wing planform from the spec (the probe refines it where it can) */
function planform(ac: Aircraft): { root: number; tip: number; semi: number; inner: number; zLe: number; sweep: number } {
  const s = ac.spec;
  const delta = ac.type === 'TYPHOON' || ac.type === 'RAFALE' || ac.type === 'GRIPEN';
  const lam = delta ? 0.16 : ac.type === 'SR71' ? 0.1 : 0.3;
  const sweep = (delta ? 52 : ac.type === 'SR71' ? 60 : 40) * (Math.PI / 180);
  const b = s.span, A = s.wingArea;
  const semi = b / 2;
  const root = Math.min(s.length * 0.62, (2 * A) / (b * (1 + lam)));
  const tip = root * lam;
  // the mean chord's quarter point a little behind the centre of gravity
  const yMac = (b / 6) * ((1 + 2 * lam) / (1 + lam));
  const mac = (2 / 3) * root * ((1 + lam + lam * lam) / (1 + lam));
  const zLe = s.length * 0.03 - yMac * Math.tan(sweep) - mac * 0.25;
  return { root, tip, semi, inner: Math.max(0.55, b * 0.08), zLe, sweep };
}

/** jets whose strakes and chines throw strong vortices over the wing roots */
const STRAKES = new Set(['F16C', 'FA18EF', 'SU35', 'SU57', 'MIG31', 'F22']);

/** The wing's span stations: where its leading and trailing edges and upper surface really are. */
function wingStations(p: ReturnType<typeof planform>, side: number, probe: SurfaceProbe | null): Station[] {
  const out: Station[] = [];
  const NS = 9;
  const outer = p.semi * 0.985;
  const chordAt = (x: number) => p.root * (1 - (1 - p.tip / p.root) * (x / p.semi));
  for (let i = 0; i <= NS; i++) {
    const x = p.inner + (outer - p.inner) * (i / NS);
    const cEst = chordAt(x);
    const leEst = p.zLe + x * Math.tan(p.sweep);
    let le = leEst, te = leEst + cEst;
    let ys: number[] | null = null;
    if (probe) {
      // scan the chord line for the metal: the run of hits round the estimated mid-chord is the wing
      const step = 0.25;
      const zA = leEst - Math.max(1.5, cEst * 0.5), zB = leEst + cEst * 1.6 + 1;
      const zMid = leEst + cEst * 0.45;
      const runs: [number, number][] = [];
      let runStart: number | null = null;
      for (let z = zA; z <= zB + 1e-6; z += step) {
        const hit = probe(x * side, z) !== null;
        if (hit && runStart === null) runStart = z;
        if (!hit && runStart !== null) {
          runs.push([runStart, z - step]);
          runStart = null;
        }
      }
      if (runStart !== null) runs.push([runStart, zB]);
      if (runs.length) {
        let best = runs[0];
        let bestD = Infinity;
        for (const r of runs) {
          const d = zMid < r[0] ? r[0] - zMid : zMid > r[1] ? zMid - r[1] : 0;
          if (d < bestD) {
            bestD = d;
            best = r;
          }
        }
        if (bestD < cEst * 0.6) {
          // (over the fuselage the run is the whole body: keep a wing's worth of it)
          le = Math.max(best[0], zMid - cEst * 0.75);
          te = Math.min(best[1], zMid + cEst * 0.9);
          if (te - le < 0.6) {
            le = best[0];
            te = best[1];
          }
          ys = [];
          for (let k = 0; k < 5; k++) {
            const z = le + 0.08 + (te - le - 0.16) * (k / 4);
            ys.push(probe(x * side, z) ?? NaN);
          }
          // fill the odd miss from its neighbours
          for (let k = 0; k < 5; k++) {
            if (!Number.isNaN(ys[k])) continue;
            let v = NaN;
            for (let r = 1; r < 5 && Number.isNaN(v); r++) v = !Number.isNaN(ys[k - r] ?? NaN) ? ys[k - r] : !Number.isNaN(ys[k + r] ?? NaN) ? ys[k + r] : NaN;
            ys[k] = v;
          }
          if (ys.some((v) => Number.isNaN(v))) ys = null;
        }
      }
    }
    if (!ys) {
      // nothing under the ray here (past the real tip, or no mesh to probe): past the
      // tip the wing is over; otherwise carry the last station's height
      if (probe && out.length) break;
      const prev = out[out.length - 1];
      ys = prev ? prev.y.slice() : [0.05, 0.05, 0.05, 0.05, 0.05];
    }
    out.push({ x: x * side, le, te, y: ys });
  }
  return out;
}

/** a control surface's stations, read straight off its own mesh (in the mesh's own frame) */
function surfaceStations(geo: THREE.BufferGeometry, pivotX: number, ns = 7): Station[] {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const probe = probeFromParts([{ geo }]);
  // the root end is the one nearer the centre line
  const rootMin = Math.abs(pivotX + bb.min.x) < Math.abs(pivotX + bb.max.x);
  const xRoot = rootMin ? bb.min.x : bb.max.x, xTip = rootMin ? bb.max.x : bb.min.x;
  const out: Station[] = [];
  for (let i = 0; i < ns; i++) {
    const x = xRoot + (xTip - xRoot) * Math.min(0.985, i / (ns - 1) + 0.012);
    const runs: [number, number][] = [];
    let runStart: number | null = null;
    const step = 0.1;
    for (let z = bb.min.z - 0.1; z <= bb.max.z + 0.1; z += step) {
      const hit = probe(x, z) !== null;
      if (hit && runStart === null) runStart = z;
      if (!hit && runStart !== null) {
        runs.push([runStart, z - step]);
        runStart = null;
      }
    }
    if (runStart !== null) runs.push([runStart, bb.max.z + 0.1]);
    if (!runs.length) break;
    let best = runs[0];
    for (const r of runs) if (r[1] - r[0] > best[1] - best[0]) best = r;
    const le = best[0], te = best[1];
    if (te - le < 0.15) break;
    const y: number[] = [];
    for (let k = 0; k < 5; k++) y.push(probe(x, le + 0.05 + (te - le - 0.1) * (k / 4)) ?? out[out.length - 1]?.y[k] ?? 0);
    out.push({ x, le, te, y });
  }
  return out;
}

function skinAt(st: Station, c: number): number {
  const cc = Math.min(1, Math.max(0, c));
  const k = cc * 4;
  const k0 = Math.min(3, Math.floor(k));
  return st.y[k0] + (st.y[k0 + 1] - st.y[k0]) * (k - k0);
}

const HULL_C0 = -0.2, HULL_C1 = 1.5, HULL_NC = 17;

/**
 * The prism the vapour fills over one lifting surface: its floor lies on the metal,
 * its roof is the cloud's greatest extent (T0 high at the thickest). Closed, so it can
 * be drawn from any side; the shader works out the ray through it.
 */
function buildHull(st: Station[], T0: number): THREE.BufferGeometry {
  const ns = st.length, nc = HULL_NC;
  const skin: THREE.Vector3[][] = [];
  const up: THREE.Vector3[][] = [];
  const Hh: number[][] = [];
  const chordA: number[][] = [];
  for (let i = 0; i < ns; i++) {
    const row: THREE.Vector3[] = [];
    const hr: number[] = [];
    const cr: number[] = [];
    const s = ns > 1 ? i / (ns - 1) : 0;
    for (let j = 0; j < nc; j++) {
      const c = HULL_C0 + (HULL_C1 - HULL_C0) * (j / (nc - 1));
      const chord = Math.max(0.3, st[i].te - st[i].le);
      row.push(new THREE.Vector3(st[i].x, skinAt(st[i], c), st[i].le + c * chord));
      hr.push(T0 * thickShape(s, c));
      cr.push(chord);
    }
    skin.push(row);
    Hh.push(hr);
    chordA.push(cr);
  }
  // the slab's "up": the skin's own normal
  for (let i = 0; i < ns; i++) {
    const row: THREE.Vector3[] = [];
    for (let j = 0; j < nc; j++) {
      const a = skin[Math.max(0, i - 1)][j], b = skin[Math.min(ns - 1, i + 1)][j];
      const c = skin[i][Math.max(0, j - 1)], d = skin[i][Math.min(nc - 1, j + 1)];
      const n = new THREE.Vector3().crossVectors(b.clone().sub(a), d.clone().sub(c));
      if (n.lengthSq() < 1e-12) n.set(0, 1, 0);
      n.normalize();
      if (n.y < 0) n.negate();
      // (a thin vertical sliver is no slab: keep it near the vertical)
      if (n.y < 0.35) n.set(n.x, 0.35, n.z).normalize();
      row.push(n);
    }
    up.push(row);
  }
  const pos: number[] = [], uvA: number[] = [], hi: number[] = [], upA: number[] = [], chA: number[] = [];
  const push = (p: THREE.Vector3, s: number, c: number, h: number, hTop: number, u: THREE.Vector3, ch: number) => {
    pos.push(p.x, p.y, p.z);
    uvA.push(s, c);
    hi.push(h, hTop);
    upA.push(u.x, u.y, u.z);
    chA.push(ch);
  };
  for (let i = 0; i < ns; i++)
    for (let j = 0; j < nc; j++) {
      const c = HULL_C0 + (HULL_C1 - HULL_C0) * (j / (nc - 1));
      push(skin[i][j].clone().addScaledVector(up[i][j], Hh[i][j]), ns > 1 ? i / (ns - 1) : 0, c, Hh[i][j], Hh[i][j], up[i][j], chordA[i][j]);
    }
  for (let i = 0; i < ns; i++)
    for (let j = 0; j < nc; j++) {
      const c = HULL_C0 + (HULL_C1 - HULL_C0) * (j / (nc - 1));
      push(skin[i][j].clone().addScaledVector(up[i][j], 0.012), ns > 1 ? i / (ns - 1) : 0, c, 0, Hh[i][j], up[i][j], chordA[i][j]);
    }
  const T = (i: number, j: number) => i * nc + j;
  const B = (i: number, j: number) => ns * nc + i * nc + j;
  const idx: number[] = [];
  const P = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const tri = (a: number, b: number, c: number, want: THREE.Vector3) => {
    const pa = P(a), pb = P(b), pc = P(c);
    const n = new THREE.Vector3().crossVectors(pb.sub(pa), pc.sub(pa));
    if (n.dot(want) < 0) idx.push(a, c, b);
    else idx.push(a, b, c);
  };
  for (let i = 0; i < ns - 1; i++)
    for (let j = 0; j < nc - 1; j++) {
      const wu = up[i][j];
      const wd = wu.clone().negate();
      tri(T(i, j), T(i + 1, j), T(i, j + 1), wu);
      tri(T(i + 1, j), T(i + 1, j + 1), T(i, j + 1), wu);
      tri(B(i, j), B(i + 1, j), B(i, j + 1), wd);
      tri(B(i + 1, j), B(i + 1, j + 1), B(i, j + 1), wd);
    }
  // the four walls, facing out
  const wall = (t0: number, t1: number, b0: number, b1: number, out: THREE.Vector3) => {
    tri(t0, b0, t1, out);
    tri(t1, b0, b1, out);
  };
  for (let i = 0; i < ns - 1; i++) {
    const f = skin[i][0].clone().sub(skin[i][1]);
    wall(T(i, 0), T(i + 1, 0), B(i, 0), B(i + 1, 0), f);
    const a = skin[i][nc - 1].clone().sub(skin[i][nc - 2]);
    wall(T(i, nc - 1), T(i + 1, nc - 1), B(i, nc - 1), B(i + 1, nc - 1), a);
  }
  for (let j = 0; j < nc - 1; j++) {
    const r = skin[0][j].clone().sub(skin[Math.min(1, ns - 1)][j]);
    wall(T(0, j), T(0, j + 1), B(0, j), B(0, j + 1), r);
    const t = skin[ns - 1][j].clone().sub(skin[Math.max(0, ns - 2)][j]);
    wall(T(ns - 1, j), T(ns - 1, j + 1), B(ns - 1, j), B(ns - 1, j + 1), t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
  g.setAttribute('hiA', new THREE.Float32BufferAttribute(hi, 2));
  g.setAttribute('upN', new THREE.Float32BufferAttribute(upA, 3));
  g.setAttribute('chordA', new THREE.Float32BufferAttribute(chA, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

interface HullPart {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  kind: 'wing' | 'tail';
  T0: number;
}

// ============================================================================
// the transonic cone
// ============================================================================

const CONE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  vV = -mvPosition.xyz;
  vN = normalize( normalMatrix * normal );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const NOISE = /* glsl */ `
float hash3( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float vnoise( vec3 p ) {
  vec3 i = floor( p ); vec3 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( hash3( i ), hash3( i + vec3( 1, 0, 0 ) ), f.x ), mix( hash3( i + vec3( 0, 1, 0 ) ), hash3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( hash3( i + vec3( 0, 0, 1 ) ), hash3( i + vec3( 1, 0, 1 ) ), f.x ), mix( hash3( i + vec3( 0, 1, 1 ) ), hash3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float fbm( vec3 p ) { return 0.5 * vnoise( p ) + 0.3 * vnoise( p * 2.07 ) + 0.2 * vnoise( p * 4.3 ); }
`;

// the cone: uv.x round the body, uv.y from the shock (0) to the frayed back (1)
const CONE_FRAG = /* glsl */ `
uniform float intensity;
uniform float time;
uniform vec3 cLit;
uniform vec3 cShade;
uniform vec3 sunView;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE}
void main() {
  #include <logdepthbuf_fragment>
  float ang = vUv.x * 6.2831853;
  vec2 cs = vec2( cos( ang ), sin( ang ) );
  float v = vUv.y;
  float streak = fbm( vec3( cs * 9.0, v * 2.2 - time * 9.0 ) );
  float boil = fbm( vec3( cs * 2.2, v * 1.3 - time * 2.5 ) );
  float front = smoothstep( 0.0, 0.05 + 0.04 * boil, v );
  float back = 1.0 - smoothstep( 0.18, 0.9, v + ( streak - 0.5 ) * 0.6 );
  vec3 n = normalize( vN );
  vec3 e = normalize( vV );
  float rim = pow( 1.0 - abs( dot( n, e ) ), 1.2 );
  float clump = smoothstep( 0.3, 0.75, fbm( vec3( cs * 4.0, v * 3.5 - time * 5.0 ) ) );
  float a = intensity * front * back * ( 0.4 + 0.22 * rim ) * ( 0.35 + 0.75 * streak ) * ( 0.45 + 0.8 * clump );
  float lit = 0.55 + 0.45 * max( 0.0, dot( n, sunView ) * sign( dot( n, e ) ) + 0.3 );
  vec3 col = mix( cShade, cLit, clamp( lit, 0.0, 1.0 ) );
  gl_FragColor = vec4( col, clamp( a, 0.0, 0.8 ) );
}
`;

// ============================================================================
// the effect on one jet
// ============================================================================

interface Emitter {
  rope: Rope | null;
  style: RopeStyle;
  /** where the vortex leaves the surface, in the frame of `pivot` (the airframe's body when null) */
  at: THREE.Vector3;
  pivot: THREE.Object3D | null;
  /** the stretch lying on the airframe, leading to the apex */
  head: THREE.Vector3[];
  /** how strongly this emitter works: 0..1 weights per drive */
  drive: 'tip' | 'lex' | 'tail';
  gain: number;
}

const TIP_STYLE: RopeStyle = { w0: 0.15, w1: 1.0, life: 3.6, alpha: 0.55, wander: 1.5 };
const LEX_STYLE: RopeStyle = { w0: 0.14, w1: 0.8, life: 2.8, alpha: 0.45, wander: 1.0 };
const TAIL_STYLE: RopeStyle = { w0: 0.1, w1: 0.6, life: 2.2, alpha: 0.36, wander: 0.7 };

/** the shader material that ray-marches the vapour in one lifting surface's prism */
function makeHullMaterial(T0: number, seed: number, steps: number): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        noiseMap: { value: null as THREE.Data3DTexture | null },
        time: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uSun: { value: new THREE.Vector3(0, 1, 0) },
        uLift: { value: 0 },
        uTrans: { value: 0 },
        uThick: { value: 1 },
        uT0: { value: T0 },
        uSigma: { value: 7 },
        uScale: { value: Math.min(1.5, Math.max(0.45, 0.3 / T0)) },
        uAdv: { value: 16 },
        uSeed: { value: seed },
        uSteps: { value: steps },
        uSunCol: { value: new THREE.Color(1, 1, 1) },
        uAmbCol: { value: new THREE.Color(0.4, 0.45, 0.55) },
      },
    ]),
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    side: THREE.FrontSide,
    fog: true,
    defines: vaporBench.toneMap ? { BENCH: '' } : {},
  });
  mat.uniforms.noiseMap.value = vaporNoiseTexture();
  return mat;
}

/** the transonic cone's material */
function makeConeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: CONE_VERT,
    fragmentShader: CONE_FRAG,
    uniforms: {
      intensity: { value: 0 },
      time: { value: 0 },
      cLit: { value: new THREE.Color(0xf4f7fb) },
      cShade: { value: new THREE.Color(0xaab4c2) },
      sunView: { value: new THREE.Vector3(0, 1, 0) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Tiny stand-ins for the vapour (a lifting-surface prism, a vortex thread, the cone). The
 * loading screen draws them once, so the three shaders are compiled before the first hard
 * pull instead of freezing the picture for a moment in the middle of a dogfight.
 */
export function vaporSamples(): THREE.Object3D[] {
  startVaporNoise();
  const st: Station[] = [0, 1, 2].map((i) => ({ x: i * 0.4, le: 0, te: 1, y: [0, 0, 0, 0, 0] }));
  const hull = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(buildHull(st, 0.2), makeHullMaterial(0.2, 1, 18));
  hull.frustumCulled = false;
  hull.renderOrder = 15;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 8), makeConeMaterial());
  cone.frustumCulled = false;
  cone.renderOrder = 15;
  const ropes = new VortexRopes(24);
  const r = ropes.create(TIP_STYLE);
  for (let i = 0; i < 4; i++) r.add(new THREE.Vector3(i * 3, 0, -3), 0, 1, 1);
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  cam.updateMatrixWorld(true);
  ropes.update(0, cam, newVaporLight(), 720);
  ropes.mesh.frustumCulled = false;
  const g = new THREE.Group();
  g.add(hull, cone, ropes.mesh);
  return [g];
}

export class VaporFx {
  /** the cone (in the scene); the surface vapour lives on the airframe itself */
  readonly group = new THREE.Group();
  private coneMat: THREE.ShaderMaterial;
  private cone: THREE.Mesh;
  private hulls: HullPart[] = [];
  private emitters: Emitter[] = [];
  private t = Math.random() * 50;
  /** smoothed strengths 0..1 */
  coneK = 0;
  liftK = 0;
  transK = 0;
  tailK = 0;
  ropeK = 0;
  lexK = 0;
  private hidden = false;
  private sunWorld = new THREE.Vector3(0, 1, 0);
  private sunView = new THREE.Vector3();
  private steps = 18;
  private light: VaporLight | null = null;

  constructor(
    readonly ac: Aircraft,
    private v: AirframeVisual,
    private ropes: VortexRopes | null,
    probe: SurfaceProbe | null = null,
    quality: 'low' | 'medium' | 'high' = 'high',
  ) {
    this.steps = quality === 'low' ? 10 : quality === 'medium' ? 14 : 18;
    startVaporNoise();
    const s = ac.spec;
    const L = s.length, b = s.span;
    // ---- the cone: a bell from about the canopy to past the wingtips
    const z0 = -L * 0.14, z1 = L * 0.3;
    const r0 = Math.max(1.15, b * 0.14), r1 = b * 0.42;
    const pts: THREE.Vector2[] = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(u, 0.5), z0 + (z1 - z0) * u));
    }
    const lathe = new THREE.LatheGeometry(pts, 48);
    // (lathe builds round +Y with y from the profile: turn it onto the body axis, nose at -Z)
    lathe.rotateX(Math.PI / 2);
    this.coneMat = makeConeMaterial();
    this.cone = new THREE.Mesh(lathe, this.coneMat);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 15;
    this.group.add(this.cone);

    // ---- the lifting surfaces
    const p = planform(ac);
    const strakes = STRAKES.has(ac.type);
    for (const side of [-1, 1] as const) {
      const st = wingStations(p, side, probe);
      if (st.length < 2) continue;
      const root = st[0], tip = st[st.length - 1];
      const rootChord = Math.max(1, root.te - root.le);
      const T0 = Math.min(0.62, Math.max(0.16, 0.058 * rootChord));
      this.addHull(v.body, st, T0, 'wing', side * 3.1);
      // the tip vortex leaves near the trailing edge of the tip
      this.emitters.push({
        rope: null,
        style: TIP_STYLE,
        at: new THREE.Vector3(tip.x, skinAt(tip, 0.7) + 0.05, tip.le + 0.78 * (tip.te - tip.le)),
        pivot: null,
        head: [],
        drive: 'tip',
        gain: 1,
      });
      // the strake vortex: from the apex ahead of the root, back over the wing, off the trailing edge
      const lexLen = strakes ? Math.min(4.5, Math.max(1.5, 0.2 * L)) : 0.7;
      const apex = new THREE.Vector3(root.x * 0.6, skinAt(root, 0) + 0.2, root.le - lexLen);
      const off = new THREE.Vector3(root.x + 0.2 * (tip.x - root.x), skinAt(root, 0.9) + 0.55, root.te + 0.3);
      const head: THREE.Vector3[] = [];
      for (let k = 0; k <= 4; k++) {
        const f = k / 4;
        head.push(new THREE.Vector3().lerpVectors(off, apex, f).add(new THREE.Vector3(0, 0.12 * Math.sin(f * Math.PI), 0)));
      }
      this.emitters.push({ rope: null, style: LEX_STYLE, at: off.clone(), pivot: null, head: head.slice(1), drive: 'lex', gain: strakes ? 0.85 : 0.4 });
    }
    // tailplanes and canards, each on its own pivot so the vapour moves with it
    for (const surf of v.surfaces) {
      if (surf.kind !== 'stab' && surf.kind !== 'canard') continue;
      const mesh = surf.pivot.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
      if (!mesh) continue;
      const st = surfaceStations(mesh.geometry, surf.pivot.position.x);
      if (st.length < 3) continue;
      const root = st[0], tip = st[st.length - 1];
      const T0 = Math.min(0.32, Math.max(0.09, 0.05 * Math.max(0.8, root.te - root.le)));
      this.addHull(surf.pivot, st, T0, 'tail', surf.pivot.position.x * 1.7 + 0.3);
      if (surf.kind === 'stab') {
        this.emitters.push({
          rope: null,
          style: TAIL_STYLE,
          at: new THREE.Vector3(tip.x, skinAt(tip, 0.6) + 0.03, tip.le + 0.8 * (tip.te - tip.le)),
          pivot: surf.pivot,
          head: [],
          drive: 'tail',
          gain: 1,
        });
      }
    }
    for (const h of this.hulls) h.mesh.visible = false;
    this.group.visible = false;
  }

  private addHull(parent: THREE.Object3D, st: Station[], T0: number, kind: 'wing' | 'tail', seed: number): void {
    const geo = buildHull(st, T0);
    const mat = makeHullMaterial(T0, seed, this.steps);
    mat.uniforms.noiseMap.value = vaporNoiseTexture();
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(geo, mat);
    mesh.renderOrder = 15;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = 'vapor-hull';
    const inv = new THREE.Matrix4();
    const cp = new THREE.Vector3();
    mesh.onBeforeRender = (_r, _s, camera) => {
      mesh.updateWorldMatrix(true, false);
      inv.copy(mesh.matrixWorld).invert();
      cp.setFromMatrixPosition(camera.matrixWorld);
      (mat.uniforms.uCam.value as THREE.Vector3).copy(cp).applyMatrix4(inv);
      (mat.uniforms.uSun.value as THREE.Vector3).copy(this.sunWorld).transformDirection(inv);
      mat.uniformsNeedUpdate = true;
    };
    if (vaporBench.wire) mesh.material = new THREE.MeshBasicMaterial({ color: kind === 'wing' ? 0xff2a9a : 0x2a9aff, wireframe: true, depthTest: true });
    parent.add(mesh);
    this.hulls.push({ mesh, mat, kind, T0 });
  }

  /** hide the effect (a wreck, a jet that is not drawn) */
  setHidden(h: boolean): void {
    this.hidden = h;
    if (h) {
      this.group.visible = false;
      for (const p of this.hulls) p.mesh.visible = false;
    }
  }

  /** follow the jet; `cam` is the camera, `now` a steady clock (s) */
  update(dt: number, cam: THREE.Camera, light: VaporLight, now: number): void {
    const fm = this.ac.fm;
    this.t += dt;
    this.light = light;
    this.sunWorld.copy(light.sunDir);
    const alt = fm.pos.y;
    const hum = light.humidity;
    // damp low air makes vapour; high up there is too little water in it
    const damp = (1 - smoothstep(3500, 7500, alt)) * hum;
    const m = fm.mach;
    const flying = !fm.onGround && this.ac.alive && !this.hidden;
    const g = fm.nz;
    const alpha = fm.alpha * (180 / Math.PI);
    const fast = smoothstep(95, 150, fm.tas);
    // lift: a veil from about 4 G, a heavy shroud by 9; a high angle of attack does it too
    const pull = smoothstep(3.8, 9.0, g) * fast;
    const hiA = smoothstep(13, 26, alpha) * smoothstep(55, 90, fm.tas) * (1 - smoothstep(48, 62, alpha));
    const liftWant = !flying ? 0 : Math.min(1, Math.max(pull, 0.85 * hiA) * damp);
    const transWant = !flying ? 0 : smoothstep(0.86, 0.95, m) * (1 - smoothstep(1.04, 1.14, m)) * Math.min(1.2, damp);
    const coneWant = !flying ? 0 : smoothstep(0.93, 0.975, m) * (1 - smoothstep(1.02, 1.08, m)) * Math.min(1, damp);
    // the tailplane carries the load too, more the harder it is deflected
    const tailWant = liftWant * (0.5 + 0.5 * Math.min(1, Math.abs(fm.defl.e) * 1.4));
    const ropeWant = !flying ? 0 : Math.min(1, Math.max(smoothstep(3.8, 6.8, g) * fast, 0.8 * smoothstep(12, 22, alpha) * smoothstep(60, 110, fm.tas)) * damp);
    const lexWant = !flying ? 0 : Math.min(1, Math.max(smoothstep(4.2, 8.0, g) * fast, 0.9 * smoothstep(11, 20, alpha) * smoothstep(60, 100, fm.tas)) * damp);
    // vapour forms and clears quickly, with a flicker as conditions wander
    const k = 1 - Math.exp(-dt * 8);
    this.coneK += (coneWant - this.coneK) * k;
    this.liftK += (liftWant - this.liftK) * k;
    this.transK += (transWant - this.transK) * k;
    this.tailK += (tailWant - this.tailK) * k;
    const k2 = 1 - Math.exp(-dt * 6);
    this.ropeK += (ropeWant - this.ropeK) * k2;
    this.lexK += (lexWant - this.lexK) * k2;

    // ---- the surface vapour
    const surfaceOn = (this.liftK > 0.012 || this.transK > 0.012 || this.tailK > 0.012) && vaporNoiseReady() && !this.hidden;
    const flick = 0.94 + 0.06 * Math.sin(this.t * 17.0) * Math.sin(this.t * 5.3 + 1.0);
    for (const p of this.hulls) {
      const u = p.mat.uniforms;
      const lift = p.kind === 'tail' ? this.tailK : this.liftK;
      p.mesh.visible = surfaceOn && (lift > 0.012 || this.transK > 0.012);
      if (!p.mesh.visible) continue;
      u.time.value = now;
      u.uLift.value = Math.min(1, lift * flick);
      u.uTrans.value = Math.min(1, this.transK * (p.kind === 'tail' ? 0.8 : 1));
      // a light veil is thin; a heavy shroud stands high off the metal
      u.uThick.value = 0.45 + 0.55 * Math.min(1, Math.max(lift, this.transK * 0.7));
      // a light veil is sheer, a heavy shroud is opaque
      u.uSigma.value = 2.4 + 4.6 * Math.min(1, Math.max(lift, this.transK * 0.8));
      u.uSteps.value = this.steps;
      (u.uSunCol.value as THREE.Color).copy(light.sunCol);
      (u.uAmbCol.value as THREE.Color).copy(light.ambCol);
    }

    // ---- the cone
    const coneOn = this.coneK > 0.01 && !this.hidden;
    this.group.visible = coneOn;
    if (coneOn) {
      this.group.position.copy(fm.pos);
      this.group.quaternion.copy(fm.quat);
      this.coneMat.uniforms.intensity.value = this.coneK * (0.82 + 0.18 * Math.sin(this.t * 23.0) * Math.sin(this.t * 7.3 + 1.0));
      this.coneMat.uniforms.time.value = this.t;
      this.sunView.copy(light.sunDir).transformDirection(cam.matrixWorldInverse);
      (this.coneMat.uniforms.sunView.value as THREE.Vector3).copy(this.sunView);
      (this.coneMat.uniforms.cLit.value as THREE.Color).copy(light.sunCol).multiplyScalar(0.62).add(light.ambCol.clone().multiplyScalar(0.7));
      (this.coneMat.uniforms.cShade.value as THREE.Color).copy(light.ambCol).multiplyScalar(1.5).addScalar(0.1);
    }

    // ---- the vortex ropes
    if (this.ropes) {
      const spacing = Math.max(3, fm.tas * 0.035);
      for (const e of this.emitters) {
        const drive = e.drive === 'tip' ? this.ropeK : e.drive === 'lex' ? this.lexK : this.ropeK * 0.6;
        const str = Math.min(1, drive * e.gain);
        if (str < 0.03 || this.hidden) {
          if (e.rope) {
            e.rope.emitting = false;
            e.rope = null;
          }
          continue;
        }
        if (!e.rope) e.rope = this.ropes.create(e.style);
        e.rope.add(this.toWorld(e.at, e.pivot), now, str, spacing);
        e.rope.head = e.head.map((h) => this.toWorld(h, e.pivot));
        e.rope.headStrength = str;
      }
    }
  }

  /** a point in a surface's frame (the body's when `pivot` is null) in the world */
  private toWorld(p: THREE.Vector3, pivot: THREE.Object3D | null): THREE.Vector3 {
    const fm = this.ac.fm;
    const q = p.clone();
    if (pivot) q.applyQuaternion(pivot.quaternion).add(pivot.position);
    return q.applyQuaternion(fm.quat).add(fm.pos);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.cone.geometry.dispose();
    this.coneMat.dispose();
    for (const p of this.hulls) {
      p.mesh.removeFromParent();
      p.mesh.geometry.dispose();
      p.mat.dispose();
    }
    this.hulls.length = 0;
    for (const e of this.emitters) if (e.rope) e.rope.emitting = false;
    this.emitters.length = 0;
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
