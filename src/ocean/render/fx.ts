// What hangs in the water and what the light does in it:
//  - marine snow: the drifting specks of organic matter that fill real sea
//    water. Dim in daylight; the vehicle's lamps light the ones in their
//    beams (the backscatter every ROV pilot knows);
//  - bubbles from the ballast vents and from thrusters at the surface;
//  - sun shafts below the surface, fading with depth;
//  - the glow of the lamp beams themselves;
//  - the sonar overlay: the returns of the last ping, drawn where they came
//    from and fading as the picture goes stale;
//  - the waterline: where the camera's near plane cuts the surface, the
//    meniscus line between the air and the sea.
// Every effect has a count or an on/off from the preset.

import * as THREE from 'three';
import { OCEAN_FX } from './oceanMaterial';
import { wavesGlsl } from '../world/waves';

const SNOW_BOX = 26;

/** a soft round dot (for the snow and the bubbles' highlights) */
function dotTexture(ring: boolean): THREE.DataTexture {
  const N = 64;
  const d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N - 0.5, y = (j + 0.5) / N - 0.5;
      const r = Math.hypot(x, y) * 2;
      let a: number;
      if (ring) a = Math.max(0, 1 - Math.abs(r - 0.82) * 7) + Math.max(0, 0.25 - r) * 2 + Math.max(0, 1 - r) * 0.12;
      else a = Math.max(0, 1 - r) ** 2;
      const o = (j * N + i) * 4;
      d[o] = d[o + 1] = d[o + 2] = 255;
      d[o + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** the lamps as the snow and the beams see them (world space, updated each frame) */
export const LAMPS = {
  uLampP0: { value: new THREE.Vector3() },
  uLampD0: { value: new THREE.Vector3(0, 0, -1) },
  uLampP1: { value: new THREE.Vector3() },
  uLampD1: { value: new THREE.Vector3(0, 0, -1) },
  /** 0 off .. 1 full */
  uLampOn: { value: 0 },
};

const SNOW_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCamP;
uniform vec3 uDrift;
uniform float uPx;
uniform vec3 uLampP0, uLampD0, uLampP1, uLampD1;
uniform float uLampOn;
uniform vec3 uKd;
uniform vec3 uSigma;
uniform float uWaterY;
attribute float aSize;
varying vec3 vCol;
varying float vA;
float beam( vec3 p, vec3 lp, vec3 ld ) {
  vec3 v = p - lp;
  float d = length( v );
  float c = dot( v / max( d, 1e-3 ), ld );
  return smoothstep( 0.78, 0.9, c ) / ( 1.0 + d * d * 0.35 );
}
void main() {
  // each speck lives in a box that wraps round the camera, sinking slowly and drifting with the current
  vec3 b = position + uDrift * uTime + vec3( sin( uTime * 0.21 + position.y ) * 0.15, 0.0, cos( uTime * 0.17 + position.x ) * 0.15 );
  vec3 p = mod( b - uCamP + ${(SNOW_BOX / 2).toFixed(1)}, ${SNOW_BOX.toFixed(1)} ) - ${(SNOW_BOX / 2).toFixed(1)} + uCamP;
  float d = length( p - uCamP );
  // daylight on it, and the lamps' beams
  vec3 day = exp( -uKd * max( -p.y, 0.0 ) ) * 0.05;
  float lit = ( beam( p, uLampP0, uLampD0 ) + beam( p, uLampP1, uLampD1 ) ) * uLampOn;
  vec3 lamp = vec3( 1.0, 0.95, 0.88 ) * lit * 1.6 * exp( -uSigma * length( p - uLampP0 ) );
  vCol = ( day + lamp ) * exp( -uSigma * d );
  // not above the water, not right at the lens, fading at the edge of the box
  vA = step( p.y, uWaterY - 0.2 ) * smoothstep( 0.25, 1.0, d ) * ( 1.0 - smoothstep( ${(SNOW_BOX * 0.36).toFixed(1)}, ${(SNOW_BOX * 0.5).toFixed(1)}, d ) );
  vec4 mv = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp( aSize * uPx / max( -mv.z, 0.1 ), 1.0, 24.0 );
}
`;
const SNOW_FRAG = /* glsl */ `
uniform sampler2D uDot;
varying vec3 vCol;
varying float vA;
void main() {
  float a = texture2D( uDot, gl_PointCoord ).a * vA;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vCol * a, 0.0 );
}
`;

const BEAM_VERT = /* glsl */ `
varying vec3 vL;
varying vec3 vW;
void main() {
  vL = position;
  vec4 w = modelMatrix * vec4( position, 1.0 );
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const BEAM_FRAG = /* glsl */ `
uniform float uLen;
uniform float uRad;
uniform float uLampOn;
uniform vec3 uSigma;
uniform float uWaterY;
varying vec3 vL;
varying vec3 vW;
void main() {
  // along the cone (0 at the lamp) and across it (0 on the axis)
  float t = clamp( -vL.z / uLen, 0.0, 1.0 );
  float across = length( vL.xy ) / max( uRad * t, 1e-3 );
  vec3 fall = exp( -uSigma * t * uLen );
  float a = ( 1.0 - smoothstep( 0.3, 1.0, across ) ) * ( 1.0 - t ) * smoothstep( 0.0, 0.05, t );
  // seen end-on the cone is a smear: keep it faint
  vec3 v = normalize( cameraPosition - vW );
  a *= 0.35 + 0.65 * ( 1.0 - abs( dot( v, normalize( vec3( 0.0 ) - vL ) ) ) );
  if ( vW.y > uWaterY ) a = 0.0;
  gl_FragColor = vec4( vec3( 1.0, 0.95, 0.86 ) * fall * a * 0.012 * uLampOn, 0.0 );
}
`;

const SHAFT_VERT = /* glsl */ `
attribute vec4 aShaft;
uniform vec3 uCamP;
uniform vec3 uRay;
uniform float uTime;
varying vec2 vUv;
varying float vDepth;
varying float vSeed;
varying float vCamD;
void main() {
  // each shaft: a long ribbon down the refracted sun direction, turned round its axis to face the camera
  vec3 top = vec3( uCamP.x + aShaft.x, 0.0, uCamP.z + aShaft.y );
  vec3 along = uRay;
  vec3 toCam = normalize( uCamP - top );
  vec3 side = normalize( cross( along, toCam ) );
  float len = 70.0;
  vec3 p = top + along * ( uv.y * len ) + side * ( ( uv.x - 0.5 ) * aShaft.z );
  vUv = uv;
  vDepth = max( -p.y, 0.0 );
  vSeed = aShaft.w;
  vCamD = length( p - uCamP );
  gl_Position = projectionMatrix * viewMatrix * vec4( p, 1.0 );
}
`;
const SHAFT_FRAG = /* glsl */ `
uniform float uTime;
uniform float uShaft;
uniform vec3 uKd;
uniform vec3 uSigma;
uniform vec3 uSunCol;
varying vec2 vUv;
varying float vDepth;
varying float vSeed;
varying float vCamD;
void main() {
  float edge = 1.0 - abs( vUv.x - 0.5 ) * 2.0;
  edge = edge * edge;
  // the shafts wander and flicker as the waves above refocus the light
  float flick = 0.55 + 0.45 * sin( uTime * ( 0.6 + vSeed * 0.5 ) + vSeed * 17.0 ) * sin( uTime * 0.37 + vSeed * 5.0 );
  vec3 day = exp( -uKd * vDepth );
  float a = edge * flick * ( 1.0 - vUv.y ) * smoothstep( 1.5, 6.0, vCamD );
  vec3 c = uSunCol * day * exp( -uSigma * vCamD * 0.6 ) * a * 0.035 * uShaft;
  gl_FragColor = vec4( c, 0.0 );
}
`;

const SONAR_VERT = /* glsl */ `
attribute float aBorn;
attribute float aKind;
uniform float uNow;
uniform float uPx;
varying float vA;
varying float vKind;
void main() {
  float age = uNow - aBorn;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  // drawn as the wavefront passes, then fading over 25 s; kept out of the camera's face
  vA = step( 0.0, age ) * ( 1.0 - smoothstep( 4.0, 25.0, age ) ) * smoothstep( 2.0, 7.0, -mv.z );
  vKind = aKind;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp( ( aKind > 0.5 ? 0.22 : 0.13 ) * uPx / max( -mv.z, 0.1 ), 1.5, aKind > 0.5 ? 6.0 : 4.0 );
}
`;
const SONAR_FRAG = /* glsl */ `
uniform sampler2D uDot;
uniform float uExpInv;
varying float vA;
varying float vKind;
void main() {
  float a = texture2D( uDot, gl_PointCoord ).a * vA;
  if ( a < 0.01 ) discard;
  // (a display overlay: the same brightness whatever the camera's exposure)
  vec3 c = vKind > 0.5 ? vec3( 1.0, 0.72, 0.3 ) : vec3( 0.2, 0.75, 0.95 );
  gl_FragColor = vec4( c * a * 0.55 * uExpInv, 0.0 );
}
`;

const LINE_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;
const LINE_FRAG = /* glsl */ `
uniform mat4 uInvVP;
uniform float time;
uniform float waveAmp;
uniform vec3 uScatter;
uniform float uPxWorld;
varying vec2 vNdc;
${wavesGlsl()}
void main() {
  // the point on the near plane under this pixel, and how far above the water it is
  vec4 w = uInvVP * vec4( vNdc, -1.0, 1.0 );
  vec3 p = w.xyz / w.w;
  float h = p.y - oceanWaves( p.xz, time, 0.0 ).x;
  float px = uPxWorld;
  // the meniscus: a thin dark line with a bright edge on the air side
  float line = 1.0 - smoothstep( 0.0, px * 2.5, abs( h ) );
  float glint = ( 1.0 - smoothstep( 0.0, px * 1.5, abs( h - px * 2.5 ) ) ) * 0.5;
  // water right on the lens: a faint veil of the sea's colour
  float veil = h < 0.0 ? 0.18 : 0.0;
  vec3 c = mix( vec3( 0.0 ), uScatter, 0.5 ) * line + vec3( 0.9 ) * glint * 0.08;
  float a = max( line * 0.8, veil );
  gl_FragColor = vec4( c + uScatter * veil, a );
}
`;

export interface FxCounts {
  snow: number;
  bubbles: number;
  shafts: boolean;
}

export class OceanFx {
  readonly group = new THREE.Group();
  private snow: THREE.Points | null = null;
  private snowMat: THREE.ShaderMaterial;
  private dot = dotTexture(false);
  private ring = dotTexture(true);
  // bubbles (CPU-driven)
  private bub: THREE.Points;
  private bubPos: Float32Array;
  private bubVel: Float32Array;
  private bubAge: Float32Array;
  private bubMax = 0;
  private bubNext = 0;
  // shafts
  private shafts: THREE.Mesh;
  private shaftMat: THREE.ShaderMaterial;
  // lamp beams
  readonly beams: THREE.Mesh[] = [];
  private beamMat: THREE.ShaderMaterial;
  // sonar overlay
  private sonar: THREE.Points;
  private sonarMat: THREE.ShaderMaterial;
  private sonarHead = 0;
  readonly SONAR_MAX = 2400;
  // waterline
  readonly waterline: THREE.Mesh;
  private lineMat: THREE.ShaderMaterial;
  private invVP = new THREE.Matrix4();

  constructor(counts: FxCounts) {
    this.group.name = 'fx';
    this.snowMat = new THREE.ShaderMaterial({
      vertexShader: SNOW_VERT,
      fragmentShader: SNOW_FRAG,
      uniforms: {
        uTime: OCEAN_FX.uTime,
        uCamP: { value: new THREE.Vector3() },
        uDrift: { value: new THREE.Vector3(0.03, -0.012, 0.02) },
        uPx: { value: 600 },
        uDot: { value: this.dot },
        uKd: OCEAN_FX.uKd,
        uSigma: OCEAN_FX.uSigma,
        uWaterY: OCEAN_FX.uWaterY,
        ...LAMPS,
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.setSnow(counts.snow);

    // bubbles
    const NB = 400;
    this.bubPos = new Float32Array(NB * 3);
    this.bubVel = new Float32Array(NB * 3);
    this.bubAge = new Float32Array(NB).fill(1e9);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.bubPos, 3));
    bg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(NB), 1));
    this.bub = new THREE.Points(
      bg,
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
attribute float aSize;
uniform float uPx;
uniform vec3 uKd;
uniform vec3 uSigma;
uniform float uWaterY;
varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  float d = length( mv.xyz );
  vCol = ( exp( -uKd * max( -position.y, 0.0 ) ) * 0.5 + 0.04 ) * exp( -uSigma * d ) * step( position.y, uWaterY + 0.05 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize <= 0.0 ? 0.0 : clamp( aSize * uPx / max( -mv.z, 0.1 ), 1.0, 40.0 );
}`,
        fragmentShader: /* glsl */ `
uniform sampler2D uRing;
varying vec3 vCol;
void main() {
  float a = texture2D( uRing, gl_PointCoord ).a;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( vCol * a, 0.0 );
}`,
        uniforms: { uPx: this.snowMat.uniforms.uPx, uRing: { value: this.ring }, uKd: OCEAN_FX.uKd, uSigma: OCEAN_FX.uSigma, uWaterY: OCEAN_FX.uWaterY },
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
      }),
    );
    this.bub.frustumCulled = false;
    this.bubMax = Math.min(NB, counts.bubbles);
    this.group.add(this.bub);

    // shafts: 28 ribbons
    const NS = 28;
    const sg = new THREE.BufferGeometry();
    const sp: number[] = [], su: number[] = [], sa: number[] = [], si: number[] = [];
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < NS; i++) {
      const a = rnd() * Math.PI * 2, r = 4 + rnd() * 34;
      const sh = [Math.cos(a) * r, Math.sin(a) * r, 0.8 + rnd() * 3.5, rnd()];
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        sp.push(0, 0, 0);
        su.push(u, v);
        sa.push(...sh);
      }
      const b = i * 4;
      si.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    sg.setAttribute('aShaft', new THREE.Float32BufferAttribute(sa, 4));
    sg.setIndex(si);
    this.shaftMat = new THREE.ShaderMaterial({
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      uniforms: {
        uCamP: this.snowMat.uniforms.uCamP,
        uRay: { value: new THREE.Vector3(0, -1, 0) },
        uTime: OCEAN_FX.uTime,
        uShaft: { value: 1 },
        uKd: OCEAN_FX.uKd,
        uSigma: OCEAN_FX.uSigma,
        uSunCol: OCEAN_FX.uSunCol,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.shafts = new THREE.Mesh(sg, this.shaftMat);
    this.shafts.frustumCulled = false;
    this.shafts.visible = counts.shafts;
    this.group.add(this.shafts);

    // lamp beams: a cone per main lamp (attached to the lamp by the world each frame)
    this.beamMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { uLen: { value: 16 }, uRad: { value: 9 }, uLampOn: LAMPS.uLampOn, uSigma: OCEAN_FX.uSigma, uWaterY: OCEAN_FX.uWaterY },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    for (let i = 0; i < 2; i++) {
      const g = new THREE.ConeGeometry(9, 16, 24, 1, true);
      // apex at the lamp, opening along -z
      g.translate(0, -8, 0);
      g.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(g, this.beamMat);
      m.frustumCulled = false;
      m.renderOrder = 6;
      this.beams.push(m);
    }

    // sonar overlay
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.SONAR_MAX * 3), 3));
    og.setAttribute('aBorn', new THREE.BufferAttribute(new Float32Array(this.SONAR_MAX).fill(-1e9), 1));
    og.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(this.SONAR_MAX), 1));
    this.sonarMat = new THREE.ShaderMaterial({
      vertexShader: SONAR_VERT,
      fragmentShader: SONAR_FRAG,
      uniforms: { uNow: { value: 0 }, uPx: this.snowMat.uniforms.uPx, uDot: { value: this.dot }, uExpInv: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.sonar = new THREE.Points(og, this.sonarMat);
    this.sonar.frustumCulled = false;
    this.sonar.renderOrder = 20;
    this.group.add(this.sonar);

    // the waterline (a full-screen quad, drawn last)
    this.lineMat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      uniforms: { uInvVP: { value: this.invVP }, time: OCEAN_FX.uTime, waveAmp: { value: 1 }, uScatter: OCEAN_FX.uScatter, uPxWorld: { value: 0.001 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.waterline = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lineMat);
    this.waterline.frustumCulled = false;
    this.waterline.renderOrder = 1000;
    this.waterline.visible = false;
    this.group.add(this.waterline);
  }

  /** rebuild the snow for a new count */
  setSnow(n: number): void {
    if (this.snow) {
      this.group.remove(this.snow);
      this.snow.geometry.dispose();
      this.snow = null;
    }
    if (n <= 0) return;
    const pos = new Float32Array(n * 3), size = new Float32Array(n);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rnd() * SNOW_BOX;
      pos[i * 3 + 1] = rnd() * SNOW_BOX;
      pos[i * 3 + 2] = rnd() * SNOW_BOX;
      // mostly fine specks, a few larger flocs
      size[i] = 0.012 + Math.pow(rnd(), 6) * 0.05;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.snow = new THREE.Points(g, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 7;
    this.group.add(this.snow);
  }

  setCounts(c: FxCounts): void {
    this.setSnow(c.snow);
    this.bubMax = Math.min(this.bubAge.length, c.bubbles);
    this.shafts.visible = c.shafts;
  }

  /** release bubbles at a point (world), with a spread and an initial velocity */
  emitBubbles(x: number, y: number, z: number, n: number, spread = 0.3, up = 0.4): void {
    if (this.bubMax <= 0) return;
    const size = this.bub.geometry.attributes.aSize.array as Float32Array;
    for (let k = 0; k < n; k++) {
      const i = this.bubNext;
      this.bubNext = (this.bubNext + 1) % this.bubMax;
      this.bubPos[i * 3] = x + (Math.random() - 0.5) * spread;
      this.bubPos[i * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.bubPos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.bubVel[i * 3] = (Math.random() - 0.5) * 0.3;
      this.bubVel[i * 3 + 1] = up * (0.5 + Math.random());
      this.bubVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      this.bubAge[i] = 0;
      // 2-12 mm bubbles; the big ones rise faster (about 0.25 m/s terminal)
      size[i] = 0.004 + Math.pow(Math.random(), 2) * 0.012;
    }
  }

  /** add the returns of a ping (world points; kind 1 = a hard object, 0 = the bottom) */
  addSonar(points: { x: number; y: number; z: number; kind: number; at: number }[]): void {
    const g = this.sonar.geometry;
    const pos = g.attributes.position.array as Float32Array;
    const born = g.attributes.aBorn.array as Float32Array;
    const kind = g.attributes.aKind.array as Float32Array;
    for (const p of points) {
      const i = this.sonarHead;
      this.sonarHead = (this.sonarHead + 1) % this.SONAR_MAX;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      born[i] = p.at;
      kind[i] = p.kind;
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.aBorn.needsUpdate = true;
    g.attributes.aKind.needsUpdate = true;
  }

  /** the camera's exposure (the overlay keeps its brightness under it) */
  setExposure(e: number): void {
    this.sonarMat.uniforms.uExpInv.value = 1 / Math.max(1, e);
  }

  clearSonar(): void {
    const born = this.sonar.geometry.attributes.aBorn.array as Float32Array;
    born.fill(-1e9);
    this.sonar.geometry.attributes.aBorn.needsUpdate = true;
  }

  update(dt: number, cam: THREE.PerspectiveCamera, viewH: number, under: boolean, opts: { now: number; sunRay: THREE.Vector3; waveAmp: number; surfaceAtCam: number; overlay: boolean }): void {
    const u = this.snowMat.uniforms;
    (u.uCamP.value as THREE.Vector3).copy(cam.position);
    // pixels per metre at 1 m: the point sprites keep their size in the world
    const px = viewH / (2 * Math.tan(((cam.fov * Math.PI) / 180) / 2));
    u.uPx.value = px;
    if (this.snow) this.snow.visible = under;
    this.shafts.visible = this.shafts.visible && under;
    (this.shaftMat.uniforms.uRay.value as THREE.Vector3).copy(opts.sunRay);
    this.sonarMat.uniforms.uNow.value = opts.now;
    this.sonar.visible = opts.overlay;
    for (const b of this.beams) b.visible = under && LAMPS.uLampOn.value > 0;
    // bubbles rise, wobble, and burst at the surface
    const size = this.bub.geometry.attributes.aSize.array as Float32Array;
    let live = 0;
    for (let i = 0; i < this.bubMax; i++) {
      if (size[i] <= 0) continue;
      this.bubAge[i] += dt;
      const vy = this.bubVel[i * 3 + 1];
      this.bubVel[i * 3 + 1] += (0.24 + size[i] * 6 - vy) * Math.min(1, dt * 2);
      this.bubVel[i * 3] *= 1 - dt;
      this.bubVel[i * 3 + 2] *= 1 - dt;
      const w = Math.sin(this.bubAge[i] * 9 + i) * 0.08;
      this.bubPos[i * 3] += (this.bubVel[i * 3] + w) * dt;
      this.bubPos[i * 3 + 1] += this.bubVel[i * 3 + 1] * dt;
      this.bubPos[i * 3 + 2] += this.bubVel[i * 3 + 2] * dt;
      if (this.bubPos[i * 3 + 1] > 0.1 || this.bubAge[i] > 40) size[i] = 0;
      else live++;
    }
    this.bub.visible = live > 0;
    if (live > 0 || this.bub.visible) {
      this.bub.geometry.attributes.position.needsUpdate = true;
      this.bub.geometry.attributes.aSize.needsUpdate = true;
    }
    // the waterline, only when the near plane is close to the surface
    const near = Math.abs(cam.position.y - opts.surfaceAtCam) < 0.6;
    this.waterline.visible = near;
    if (near) {
      cam.updateMatrixWorld();
      this.invVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
      this.lineMat.uniforms.waveAmp.value = opts.waveAmp;
      // a pixel's height on the near plane (m)
      this.lineMat.uniforms.uPxWorld.value = (2 * cam.near * Math.tan(((cam.fov * Math.PI) / 180) / 2)) / Math.max(1, viewH);
    }
  }

  /** how many bubbles are alive (for the benchmark's counters) */
  get bubbleCount(): number {
    const size = this.bub.geometry.attributes.aSize.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.bubMax; i++) if (size[i] > 0) n++;
    return n;
  }

  dispose(): void {
    this.snow?.geometry.dispose();
    this.snowMat.dispose();
    this.bub.geometry.dispose();
    (this.bub.material as THREE.Material).dispose();
    this.shafts.geometry.dispose();
    this.shaftMat.dispose();
    for (const b of this.beams) b.geometry.dispose();
    this.beamMat.dispose();
    this.sonar.geometry.dispose();
    this.sonarMat.dispose();
    this.waterline.geometry.dispose();
    this.lineMat.dispose();
    this.dot.dispose();
    this.ring.dispose();
  }
}
