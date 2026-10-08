// The space program's showcase behind its menu: a coastal launch complex at
// sunrise. The sun is just clearing the sea horizon behind the pad, gold at its
// heart and fading through rose to a clear blue overhead; a deck of broken
// cloud catches the light and rays fan out through the gaps. The sea throws a
// glitter path back from the sun and breaks in surf on the beach. Inland, dunes
// give way to scrub flats, then hills and far mountains; across the bay a long
// hazy shore closes the horizon. The pad (a raised concrete hardstand with a
// flame trench, launch mount, 145 m service tower, lightning masts and water
// tower) stands among tank farms, cranes and sheds. The camera orbits the pad:
// drag, scroll, double-click to reset.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildSaturnV, saturnRadiusAt } from '../../space/saturnVModel';
import { PAD2, buildPad2, pad2Height, type Pad2 } from './starbasePad';
import { PAD3, buildPad3, pad3Height, type Pad3 } from './falconPad';
import { Fleet, containerTexture, crawlerCrane, facadeTexture, semiTruck, trackingDish, truckCrane, type PropMats } from './siteProps';

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 1.7;
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clampN((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}
function tex(c: HTMLCanvasElement, srgb = true, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** smooth 2D value noise in 0..1 */
function makeNoise(seed: number): (x: number, y: number) => number {
  const r = prng(seed);
  const P = 256;
  const v = new Float32Array(P * P).map(() => r());
  const at = (i: number, j: number) => v[(j & (P - 1)) * P + (i & (P - 1))];
  return (x: number, y: number) => {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}
/** a tileable noise image: each channel a different scale (grain, blotches, broad patches) */
function detailTexture(): THREE.DataTexture {
  const S = 512;
  const data = new Uint8Array(S * S * 4);
  const chan = (seed: number, cells: number[]) => {
    const out = new Float32Array(S * S);
    let amp = 1, total = 0;
    for (const c of cells) {
      const r = prng(seed + c);
      const lat = new Float32Array(c * c).map(() => r());
      const at = (i: number, j: number) => lat[((j + c) % c) * c + ((i + c) % c)];
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const fx = (x / S) * c, fy = (y / S) * c;
          const i = Math.floor(fx), j = Math.floor(fy);
          const u = fx - i, v = fy - j;
          const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
          const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su;
          const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
          out[y * S + x] += (a + (b - a) * sv) * amp;
        }
      }
      total += amp;
      amp *= 0.55;
    }
    return out.map((v) => v / total);
  };
  const r = chan(1, [64, 128, 256]);
  const g = chan(2, [8, 16, 32, 64]);
  const b = chan(3, [4, 8, 16]);
  const stretch = (v: number) => clampN((v - 0.5) * 2.2 + 0.5, 0, 1) * 255;
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = stretch(r[i]);
    data[i * 4 + 1] = stretch(g[i]);
    data[i * 4 + 2] = stretch(b[i]);
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** A square grid over +-FAR whose cells grow outward (fine near the site, kilometres wide at the horizon). */
function spreadGrid(N: number, height: (x: number, z: number) => number): THREE.BufferGeometry {
  const coord = (i: number) => {
    const u = (i / N) * 2 - 1;
    return Math.sign(u) * FAR * Math.pow(Math.abs(u), 2.2);
  };
  const verts = new Float32Array((N + 1) * (N + 1) * 3);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = coord(i), z = coord(j);
      verts.set([x, height(x, z), z], (j * (N + 1) + i) * 3);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setIndex(idx);
  return g;
}

/** Straight steel members, drawn as one instanced mesh. */
class Beams {
  private mats: THREE.Matrix4[] = [];
  add(a: THREE.Vector3, b: THREE.Vector3, w: number, d = w): void {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.mats.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(w, len, d)));
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, ry = 0): void {
    this.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz)));
  }
  build(mat: THREE.Material, shadow = true): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, this.mats.length);
    this.mats.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    return m;
  }
}

// layout (metres): the pad at the origin, the sea to the north (-z), the road to the south (+z)
const SHORE_Z = -380;
const NEAR = 6000; // the detailed ground round the site
const FAR = 90000; // the land and sea run out to here
const PAD_Y = 4; // the hardstand's deck
const SEA_Y = -2.5; // the sea sits a little below the flattened site
const ROCKET_Y = 24.5; // the base of the Saturn V's first stage, standing on the mount's hold-down arms
const HAZE = 3.4e-5; // aerial perspective (exp2 density)

// the coastline: straight past the site, wandering further out (shared by the ground and the sea shader)
const SHORE_GLSL = /* glsl */ `
float shoreZ(float x) {
  float f = clamp((abs(x) - 700.0) / 2500.0, 0.0, 1.0);
  return min(${SHORE_Z.toFixed(1)} + f * (55.0 * sin(x / 520.0 + 0.7) + 170.0 * sin(x / 2100.0 + 2.1) + 420.0 * sin(x / 7300.0 + 0.4)), 60.0);
}`;
function shoreZ(x: number): number {
  const f = clampN((Math.abs(x) - 700) / 2500, 0, 1);
  return Math.min(SHORE_Z + f * (55 * Math.sin(x / 520 + 0.7) + 170 * Math.sin(x / 2100 + 2.1) + 420 * Math.sin(x / 7300 + 0.4)), 60);
}

const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm4(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}`;

// the colour of the sky right at the horizon, by bearing from the sun: the land's
// haze, the sea's far edge and the sky all meet in it
const HORIZON_GLSL = /* glsl */ `
// three's ACES curve brightens by 1/0.6, so everything self-lit here is scaled down to match
#define SKYK 0.6
vec3 horizonCol(vec3 d, vec3 sd) {
  float toSun = dot(normalize(d.xz + vec2(1e-5)), normalize(sd.xz)) * 0.5 + 0.5;
  vec3 c = mix(vec3(0.42, 0.34, 0.5), vec3(1.05, 0.42, 0.22), smoothstep(0.05, 0.75, toSun));
  return mix(c, vec3(1.9, 0.72, 0.18), pow(toSun, 6.0));
}`;

const ATMOS_GLSL = /* glsl */ `
vec3 skyClear(vec3 d, vec3 sd) {
  float e = max(d.y, 0.0);
  float m = max(dot(d, sd), 0.0);
  float toSun = dot(normalize(d.xz + vec2(1e-5)), normalize(sd.xz)) * 0.5 + 0.5;
  vec3 mid = mix(vec3(0.16, 0.24, 0.55), vec3(0.85, 0.34, 0.2), pow(toSun, 3.0));
  vec3 zen = vec3(0.05, 0.11, 0.34);
  vec3 c = mix(horizonCol(d, sd), mid, smoothstep(0.0, 0.1, e));
  c = mix(c, zen, smoothstep(0.08, 0.5, e));
  // the belt of Venus: a rose band over the earth's shadow, opposite the sun
  c += vec3(0.34, 0.14, 0.17) * exp(-pow((e - 0.13) / 0.07, 2.0)) * pow(1.0 - toSun, 2.0);
  // the glow round the sun: forward scattering in the morning haze
  c += vec3(1.0, 0.42, 0.14) * (pow(m, 6.0) * 0.06 + pow(m, 40.0) * 0.22 + pow(m, 200.0) * 0.45) + vec3(1.0, 0.66, 0.32) * pow(m, 1200.0) * 1.6;
  return c;
}
// a deck of broken altocumulus, lit from below by the low sun: gold toward it,
// salmon and rose round the sides, lilac-grey opposite; toward the sun the
// clouds are backlit, dark in their cores with blazing edges
vec3 addClouds(vec3 d, vec3 col, vec3 sd, float detail) {
  float e = d.y;
  if (e < 0.002) return col;
  float m = max(dot(d, sd), 0.0);
  float toSun = dot(normalize(d.xz + vec2(1e-5)), normalize(sd.xz)) * 0.5 + 0.5;
  vec2 uv = d.xz / (e + 0.05) * 0.55 + vec2(time * 0.0025, time * 0.0009);
  float n = fbm4(uv * 0.8) * 0.74 + fbm4(uv * 3.1 + 4.7) * 0.34 * detail + 0.17 * (1.0 - detail);
  float cover = smoothstep(0.48, 0.64, n) * smoothstep(0.002, 0.035, e) * (1.0 - 0.55 * smoothstep(0.45, 1.0, e));
  float dens = smoothstep(0.52, 0.8, n);
  vec3 lit = mix(vec3(0.95, 0.3, 0.28), vec3(1.6, 0.52, 0.2), smoothstep(0.35, 1.0, toSun));
  vec3 shade = mix(vec3(0.1, 0.12, 0.24), vec3(0.24, 0.12, 0.14), smoothstep(0.4, 1.0, toSun));
  float back = pow(m, 3.0);
  vec3 cc = mix(lit, shade, clamp(dens * (0.75 + back * 0.25) + back * 0.3 + smoothstep(0.05, 0.4, e) * 0.25, 0.0, 1.0));
  cc += vec3(2.6, 1.0, 0.3) * pow(m, 14.0) * (1.0 - dens) * 1.4;
  // higher clouds catch the rose light
  cc = mix(cc, cc * vec3(1.05, 0.82, 0.95), smoothstep(0.06, 0.25, e) * (1.0 - back));
  cc = mix(cc, cc * vec3(0.78, 0.86, 1.05), smoothstep(0.3, 0.9, e));
  return mix(col, cc, cover);
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform float time;
uniform float darken;
varying vec3 vDir;
${NOISE_GLSL}
${HORIZON_GLSL}
${ATMOS_GLSL}
void main() {
  vec3 d = normalize(vDir);
  vec3 sd = normalize(sunDir);
  vec3 side = normalize(cross(sd, vec3(0.0, 1.0, 0.0)));
  vec3 upv = cross(side, sd);
  float dx = dot(d, side), dy = dot(d, upv), fwd = dot(d, sd);
  vec3 col;
  if (d.y < 0.0) {
    col = horizonCol(d, sd) * mix(1.0, 0.7, smoothstep(0.0, -0.12, d.y));
  } else {
    col = skyClear(d, sd);
    // rays fanning up from the sun through the gaps in the cloud
    float ang = atan(dy, dx) + time * 0.0015;
    float rays = noise(vec2(ang * 7.0, 1.3)) * 0.55 + noise(vec2(ang * 19.0, 7.1)) * 0.45;
    rays = smoothstep(0.35, 0.95, rays);
    col += vec3(1.0, 0.5, 0.2) * rays * pow(max(fwd, 0.0), 14.0) * smoothstep(0.0, 0.05, d.y) * 0.2;
    col = addClouds(d, col, sd, 1.0);
    // seen from high up, the sky overhead deepens toward the black of space
    col = mix(col, col * vec3(0.12, 0.16, 0.32), darken * smoothstep(0.0, 0.5, d.y));
  }
  col *= SKYK;
  // the sun, three-quarters risen, a touch flattened by refraction
  if (fwd > 0.0) {
    float r = length(vec2(dx, dy * 1.12));
    float R = 0.0072;
    float disc = 1.0 - smoothstep(R * 0.9, R, r);
    float limb = 1.0 - 0.4 * pow(clamp(r / R, 0.0, 1.0), 2.0);
    col = mix(col, vec3(8.0, 3.6, 0.95) * limb, disc * smoothstep(-0.0004, 0.0012, d.y));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const OCEAN_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
const OCEAN_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform float time;
uniform sampler2D nrm;
varying vec3 vW;
#include <common>
#include <logdepthbuf_pars_fragment>
${NOISE_GLSL}
${HORIZON_GLSL}
${ATMOS_GLSL}
${SHORE_GLSL}
void main() {
  #include <logdepthbuf_fragment>
  vec3 sd = normalize(sunDir);
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vW.xz;
  float t = time;
  // four octaves of swell and chop, each drifting its own way
  const mat2 r1 = mat2(0.8, -0.6, 0.6, 0.8), r2 = mat2(0.28, 0.96, -0.96, 0.28), r3 = mat2(-0.71, 0.71, -0.71, -0.71);
  vec2 s = (texture2D(nrm, p / 260.0 + t * vec2(0.0019, 0.0012)).xy * 2.0 - 1.0) * 0.55;
  s += r1 * (texture2D(nrm, r1 * p / 67.0 + t * vec2(-0.0043, 0.0029)).xy * 2.0 - 1.0) * 0.45;
  s += r2 * (texture2D(nrm, r2 * p / 19.3 + t * vec2(0.0105, -0.0077)).xy * 2.0 - 1.0) * 0.35;
  s += r3 * (texture2D(nrm, r3 * p / 5.9 + t * vec2(-0.019, -0.016)).xy * 2.0 - 1.0) * 0.22;
  float out_ = shoreZ(vW.x) - vW.z; // metres out from the waterline
  float calm = mix(0.7, 1.0, smoothstep(0.0, 120.0, out_));
  vec3 N = normalize(vec3(s.x * 0.55 * calm, 1.0, s.y * 0.55 * calm));
  float nv = max(dot(N, V), 0.02);
  float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.004;
  vec3 refl = addClouds(normalize(R), skyClear(normalize(R), sd), sd, 0.0) * 0.68;
  // the water itself: glass-clear over the sand at the edge, turquoise in the shallows, deep blue-green beyond
  float depth = clamp(out_ * 0.035, 0.0, 40.0);
  float T = exp(-depth * 1.15); // how much of the sea floor shows through
  vec3 deep = vec3(0.012, 0.045, 0.07);
  vec3 scatter = mix(deep, vec3(0.05, 0.19, 0.17), exp(-depth * 0.3));
  // the glitter path: the low sun on the moving facets, rougher with distance as the waves blur together
  vec3 H = normalize(sd + V);
  float nh = max(dot(N, H), 0.0);
  float a = mix(0.05, 0.2, smoothstep(150.0, 9000.0, dist));
  float a2 = a * a;
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dd * dd);
  vec3 glint = vec3(1.9, 1.0, 0.4) * D * F / (4.0 * nv) * 0.07 * smoothstep(-0.03, 0.02, dot(sd, N));
  vec3 col = scatter * (1.0 - T) * (1.0 - F) + refl * F + glint;
  float alpha = 1.0 - T * (1.0 - F);
  // surf: lines of breakers rolling in, a lace of foam behind each crest, and foam where the water thins on the sand
  float wob = fbm4(vec2(vW.x * 0.006, t * 0.02)) * 9.0;
  float fr = fract((out_ * 0.07 + t * 0.6 + wob) / 6.2832);
  float crest = smoothstep(0.0, 0.025, fr) * exp(-fr * 9.0);
  float zone = smoothstep(4.0, 16.0, out_) * (1.0 - smoothstep(55.0, 110.0, out_));
  float lace = smoothstep(0.4, 0.68, fbm4(p * 0.22 + vec2(t * 0.04, -t * 0.03)) + 0.25 * noise(p * 1.3 + t * 0.1));
  float drift = smoothstep(0.55, 0.78, fbm4(p * 0.09 + vec2(7.0, t * 0.01))) * exp(-max(out_, 0.0) / 45.0) * 0.6;
  float edge = 1.0 - smoothstep(0.0, 5.0 + wob * 0.4, out_);
  float foam = clamp(crest * zone * (0.5 + 0.9 * lace) + drift * lace + edge * (0.25 + 0.75 * lace), 0.0, 1.0);
  col = mix(col, vec3(0.95, 0.86, 0.8), foam * 0.92);
  alpha = mix(alpha, 1.0, foam * 0.92);
  // aerial perspective into the horizon
  float hz = 1.0 - exp(-pow(dist * ${HAZE.toExponential()}, 2.0));
  col = mix(col, horizonCol(-V, sd), hz) * SKYK;
  alpha = mix(alpha, 1.0, hz);
  gl_FragColor = vec4(col, alpha); // premultiplied: whatever lies beneath shows through
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Swap the scene fog's flat colour for the horizon colour along each pixel's
 * bearing, so far land fades into gold toward the sun and lilac away from it.
 */
function hazePatch(sh: THREE.WebGLProgramParametersWithUniforms, sun: THREE.Vector3): void {
  // the game's fog chunks (render/fog.ts) already carry the world-space ray from the camera in vFogRel
  sh.uniforms.hzSun = { value: sun };
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>\nuniform vec3 hzSun;\n${HORIZON_GLSL}`)
    .replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
        float hzD = length(vFogRel) * fogDensity;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, horizonCol(normalize(vFogRel), hzSun) * SKYK, 1.0 - exp(-hzD * hzD));
      #endif`,
    );
}

export class LaunchSite {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 1, 1, 130000);
  drawWith: ((scene: THREE.Scene, camera: THREE.Camera) => void) | null = null;
  active = false;
  private yaw = -0.3;
  private pitch = 0.06;
  private zoom = 1;
  private yawS = -0.3;
  private pitchS = 0.06;
  private zoomS = 1;
  private userView = false;
  private drag: { id: number; x: number; y: number } | null = null;
  private vYaw = 0;
  private vPitch = 0;
  private t = 0;
  private skyMat!: THREE.ShaderMaterial;
  private oceanMat!: THREE.ShaderMaterial;
  private blinkers: THREE.Mesh[] = [];
  private steam: THREE.Sprite[] = [];
  private vapour: THREE.Sprite[] = [];
  private arms: THREE.Group[] = [];
  /** the Saturn V standing on the pad (hidden while one is flying) */
  rocket: THREE.Object3D | null = null;
  private flying = false;
  private smoke: { sp: THREE.Sprite; v: THREE.Vector3; age: number; life: number; s0: number; grow: number; fire?: boolean; c?: [number, number, number] }[] = [];
  private smokeTex: THREE.Texture | null = null;
  private smokeAcc = 0;
  private birds!: THREE.InstancedMesh;
  private fleet = new Fleet();
  private traffic: { i: number; x: number; z: number; dir: number; v: number }[] = [];
  private groundTime = { value: 0 };
  private birdData: { cx: number; cz: number; r: number; h: number; sp: number; ph: number }[] = [];
  // the sun: just clearing the sea horizon to the north-north-east, behind the pad
  private sunDir = new THREE.Vector3(0.22, 0.0045, -1).normalize();
  // the light that falls on the site rides a little higher, so the land is lit in raking gold
  private lightDir = new THREE.Vector3(0.22, 0.15, -1).normalize();
  private n = makeNoise(41);
  private detail = detailTexture();
  private steel = new THREE.MeshStandardMaterial({ color: '#a3a9b1', roughness: 0.42, metalness: 0.85 });
  private darkSteel = new THREE.MeshStandardMaterial({ color: '#3d4148', roughness: 0.5, metalness: 0.7 });
  private concrete!: THREE.MeshStandardMaterial;
  private paint = new THREE.MeshStandardMaterial({ color: '#d9d5cd', roughness: 0.4, metalness: 0.08 });

  constructor(private renderer: THREE.WebGLRenderer) {
    this.concrete = new THREE.MeshStandardMaterial({ map: this.concreteTex(false), roughness: 0.88 });
    this.build();
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      const envScene = new THREE.Scene();
      envScene.add(this.makeSky(false));
      this.scene.environment = pmrem.fromScene(envScene, 0, 1, 100000).texture;
      this.scene.environmentIntensity = 0.45;
    } catch {
      /* the lights carry it */
    }
    pmrem.dispose();
    this.bindControls();
  }

  private makeSky(keep = true): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { sunDir: { value: this.sunDir.clone() }, time: { value: 0 }, darken: { value: 0 } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
    });
    if (keep) this.skyMat = mat;
    const m = new THREE.Mesh(new THREE.SphereGeometry(keep ? 100000 : 50000, 96, 48), mat);
    m.frustumCulled = false;
    m.renderOrder = -1;
    return m;
  }

  // ---------------------------------------------------------------- terrain
  /** the far side of the bay: a long hilly shore 25-40 km off to the north-west, and an island to the north-north-east */
  private farShore(x: number, z: number): number {
    let best = -60;
    const blob = (cx: number, cz: number, rx: number, rz: number, rot: number, peak: number) => {
      const c = Math.cos(rot), s = Math.sin(rot);
      const lx = ((x - cx) * c - (z - cz) * s) / rx, lz = ((x - cx) * s + (z - cz) * c) / rz;
      const r = Math.hypot(lx, lz) + (this.n(x / 2600 + 11, z / 2600) - 0.5) * 0.55;
      if (r < 1.3) {
        const hills = 0.55 + this.n(x / 1300 + 3, z / 1300 + 5) * 0.7 + (1 - Math.abs(this.n(x / 700, z / 700 - 9) * 2 - 1)) * 0.3;
        best = Math.max(best, (1 - r) * peak * hills);
      }
    };
    blob(-31000, -21000, 9000, 4500, 0.5, 420);
    blob(-19000, -27000, 9500, 4200, 0.25, 560);
    blob(-7500, -32500, 7000, 3200, 0.1, 380);
    blob(16000, -30000, 4200, 1900, -0.25, 300);
    return best;
  }

  /** ground height: beach, dunes and scrub flats near the coast, hills and mountains inland, flat round the site */
  private height(x: number, z: number): number {
    const n = this.n;
    const d = z - shoreZ(x);
    let h: number;
    if (d < 0) {
      h = SEA_Y + Math.max(-40, d * 0.035);
    } else {
      h = SEA_Y + Math.min(d * 0.07, 4.2);
      const dd = (d - 125) / 65;
      h += Math.exp(-dd * dd) * (2 + n(x / 70, 3.3) * 4.5 + n(x / 23, z / 23) * 1.5);
      h += (n(x / 180, z / 180) * 0.65 + n(x / 47 + 7, z / 47) * 0.35 - 0.45) * 4 * clampN(d / 160, 0, 1);
      const inland = smooth(2200, 15000, d);
      h += inland * (n(x / 2600, z / 2600) * 130 + n(x / 800 + 3, z / 800) * 35);
      const mtn = smooth(18000, 52000, d);
      if (mtn > 0) {
        const ridge = 1 - Math.abs(n(x / 7000, z / 7000) * 2 - 1);
        h += mtn * (ridge * ridge * 1300 + n(x / 2500 + 1, z / 2500) * 300);
      }
    }
    h = Math.max(h, this.farShore(x, z));
    const flat = (cx: number, cz: number, hw: number, hd: number, f: number) => {
      const ox = Math.max(0, Math.abs(x - cx) - hw), oz = Math.max(0, Math.abs(z - cz) - hd);
      const dd = Math.hypot(ox, oz);
      return dd >= f ? 1 : smooth(0, f, dd);
    };
    h *= Math.min(flat(-20, 20, 270, 170, 80), flat(450, 80, 230, 150, 70), flat(0, 205, 99999, 16, 40), flat(-1400, 720, 160, 140, 90), flat(110, 262, 70, 45, 50));
    // Pad 2, the Starship complex, and its Mega Bay across the road
    h *= Math.min(flat(PAD2.x, PAD2.z, 345, 190, 90), flat(PAD2.x - 180, PAD2.z + 330, 90, 55, 60));
    // Pad 3 (Falcon) and the two landing zones
    h *= Math.min(flat(PAD3.x, PAD3.z + 20, 80, 70, 60), flat(PAD3.lz[0].x, PAD3.lz[0].z, 60, 60, 60), flat(PAD3.lz[1].x, PAD3.lz[1].z, 60, 60, 60));
    return h;
  }

  private groundColor(x: number, z: number, h: number, slope: number, out: THREE.Color): void {
    const n = this.n;
    const d = z - shoreZ(x);
    const C = LaunchSite.GC;
    const n1 = n(x / 90 + 3, z / 90 - 2), n2 = n(x / 420 - 9, z / 420 + 4), n3 = n(x / 26, z / 26 + 8);
    if (d < 0 && h > 0) {
      // across the bay: scrub-covered hills
      out.copy(C.scrub).lerp(C.hill, n1);
    } else {
      out.copy(C.wet).lerp(C.sand, smooth(2, 22, d));
      out.lerp(C.dune, smooth(60, 160, d) * 0.6);
      const veg = smooth(70, 300, d) * clampN(n2 * 1.4 - 0.15 + n1 * 0.35, 0, 1);
      out.lerp(C.dry, smooth(110, 400, d) * 0.65);
      out.lerp(C.olive, veg * 0.85);
      out.lerp(C.scrub, veg * n1 * 0.7);
      out.lerp(C.hill, smooth(1800, 11000, d) * (0.6 + n2 * 0.4));
      out.lerp(C.mtn, smooth(20000, 50000, d) * 0.85);
    }
    out.lerp(C.rock, clampN((slope - 0.35) * 2.5, 0, 0.8));
    out.multiplyScalar(0.86 + n3 * 0.28);
  }
  private static GC = {
    wet: new THREE.Color('#5e5142'),
    sand: new THREE.Color('#d2b994'),
    dune: new THREE.Color('#c2a77f'),
    dry: new THREE.Color('#a8956a'),
    olive: new THREE.Color('#6f6d48'),
    scrub: new THREE.Color('#545a38'),
    hill: new THREE.Color('#4f5737'),
    rock: new THREE.Color('#7a6c5c'),
    mtn: new THREE.Color('#6b6660'),
  };

  private groundMaterial(bump: boolean): THREE.MeshStandardMaterial {
    const grain = tex(
      canvas(256, 256, (g) => {
        g.fillStyle = '#808080';
        g.fillRect(0, 0, 256, 256);
        const r = prng(8);
        for (let i = 0; i < 7000; i++) {
          const v = 96 + r() * 70;
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
        }
      }),
      false,
      [NEAR / 5, NEAR / 5],
    );
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, bumpMap: bump ? grain : null, bumpScale: 0.4 });
    const detail = this.detail;
    const sun = this.sunDir;
    const gTime = this.groundTime;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.gDetail = { value: detail };
      sh.uniforms.gTime = gTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGw;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGw;\nuniform sampler2D gDetail;\nuniform float gTime;').replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 g1 = texture2D(gDetail, vGw.xz / 7.0).rgb;
        vec3 g2 = texture2D(gDetail, vGw.xz / 61.0).rgb;
        vec3 g3 = texture2D(gDetail, vGw.xz / 530.0).rgb;
        float gFar = smoothstep(250.0, 2600.0, length(vGw - cameraPosition));
        diffuseColor.rgb *= mix(0.74 + 0.52 * g1.r, 1.0, gFar) * (0.8 + 0.4 * g2.g) * (0.84 + 0.32 * g3.b);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.95, 0.78), smoothstep(0.55, 0.8, g2.b) * 0.6);
        // the beach: damp dark sand above the waterline, and a sheet of water washing up and sliding back
        float hb = vGw.y - (${SEA_Y.toFixed(2)});
        float run = 0.3 + 0.24 * sin(gTime * 0.45 + vGw.x * 0.011) + 0.12 * sin(gTime * 1.07 + vGw.x * 0.037);
        float wetB = 1.0 - smoothstep(0.0, 1.2, hb);
        float film = 1.0 - smoothstep(run - 0.05, run, hb);
        float rim = film * smoothstep(run - 0.18, run - 0.02, hb);
        float fn = texture2D(gDetail, vGw.xz / 3.5 + gTime * 0.01).r;
        diffuseColor.rgb *= mix(1.0, 0.58, wetB);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.66, 0.78, 0.8), film * 0.75);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.9, 0.86), rim * smoothstep(0.3, 0.6, fn) * 0.95);
        float gWet = max(film * (1.0 - rim), wetB * 0.55);`,
      );
      sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.07, gWet);');
      hazePatch(sh, sun);
    };
    mat.customProgramCacheKey = () => 'launch-ground';
    return mat;
  }

  private buildTerrain(): void {
    const s = this.scene;
    const col = new THREE.Color();
    const colorize = (geo: THREE.BufferGeometry) => {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const cols = new Float32Array(pos.count * 3);
      const nrm = geo.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        this.groundColor(x, z, y, 1 - nrm.getY(i), col);
        cols.set([col.r, col.g, col.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    };
    // the near ground: 12.5 m cells over 6 km, its rim turned down as a skirt
    const SEG = 480;
    const geo = new THREE.PlaneGeometry(NEAR, NEAR, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const rim = Math.abs(x) >= NEAR / 2 - 1 || Math.abs(z) >= NEAR / 2 - 1;
      pos.setY(i, this.height(x, z) - (rim ? 6 : 0));
    }
    geo.computeVertexNormals();
    colorize(geo);
    const near = new THREE.Mesh(geo, this.groundMaterial(true));
    near.receiveShadow = true;
    s.add(near);

    // the far land: a grid that coarsens outward, tucked under the near ground where they overlap
    const fg = spreadGrid(300, (x, z) => this.height(x, z) - (Math.max(Math.abs(x), Math.abs(z)) < NEAR / 2 - 40 ? 5 : 0));
    fg.computeVertexNormals();
    colorize(fg);
    const far = new THREE.Mesh(fg, this.groundMaterial(false));
    far.receiveShadow = true;
    s.add(far);
  }

  // -------------------------------------------------------------------- sea
  private buildSea(): void {
    // a tileable normal map for the water, built from layered waves
    const S = 256;
    const height = new Float32Array(S * S);
    const r = prng(23);
    const waves: [number, number, number, number][] = [];
    for (let k = 0; k < 30; k++) waves.push([Math.round((r() - 0.5) * 18), Math.round((r() - 0.5) * 18), 0.4 + r(), r() * 6.28]);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let h = 0;
        for (const [fx, fy, a, ph] of waves) h += (a / Math.max(1, Math.hypot(fx, fy))) * Math.sin(((fx * x + fy * y) / S) * Math.PI * 2 + ph);
        height[y * S + x] = h;
      }
    }
    const nc = canvas(S, S, (g) => {
      const img = g.createImageData(S, S);
      const n = new THREE.Vector3();
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const hx = height[y * S + ((x + 1) % S)] - height[y * S + ((x - 1 + S) % S)];
          const hy = height[((y + 1) % S) * S + x] - height[((y - 1 + S) % S) * S + x];
          n.set(-hx * 1.6, -hy * 1.6, 1).normalize();
          const o = (y * S + x) * 4;
          img.data[o] = (n.x * 0.5 + 0.5) * 255;
          img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
          img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
          img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    });
    const normals = new THREE.CanvasTexture(nc);
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    normals.anisotropy = 8;
    this.oceanMat = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: this.sunDir.clone() }, time: { value: 0 }, nrm: { value: normals } },
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      fog: false,
      transparent: true,
      depthWrite: true,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    // a grid rather than one huge quad: depth interpolated across 180 km triangles is too coarse near the camera
    const sea = new THREE.Mesh(spreadGrid(120, () => SEA_Y), this.oceanMat);
    sea.frustumCulled = false;
    sea.receiveShadow = false;
    this.scene.add(sea);
  }

  // --------------------------------------------------------------- textures
  private concreteTex(top: boolean): THREE.CanvasTexture {
    const N = top ? 2048 : 512;
    const r = prng(top ? 5 : 6);
    return tex(
      canvas(N, N, (g) => {
        g.fillStyle = '#9f9a90';
        g.fillRect(0, 0, N, N);
        for (let i = 0; i < (top ? 3000 : 600); i++) {
          const x = r() * N, y = r() * N, rr = 4 + r() * (top ? 70 : 30);
          const gr = g.createRadialGradient(x, y, 0, x, y, rr);
          const c = r() < 0.55 ? '120,114,104' : '196,190,178';
          gr.addColorStop(0, `rgba(${c},${0.08 + r() * 0.16})`);
          gr.addColorStop(1, `rgba(${c},0)`);
          g.fillStyle = gr;
          g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
        if (top) {
          // the hardstand: 144 x 130 m, 7.5 m panels, the flame trench running north from the mount
          const px = (x: number) => ((x + 60) / 144) * N;
          const pz = (z: number) => ((z + 75) / 130) * N;
          for (let x = -60; x <= 84; x += 7.5) {
            for (let z = -75; z <= 55; z += 7.5) {
              g.fillStyle = `rgba(${r() < 0.5 ? '90,86,80' : '210,204,192'},${r() * 0.07})`;
              g.fillRect(px(x), pz(z), (7.5 / 144) * N, (7.5 / 130) * N);
            }
          }
          g.strokeStyle = 'rgba(70,66,60,0.55)';
          g.lineWidth = 2;
          for (let x = -60; x <= 84; x += 7.5) {
            g.beginPath();
            g.moveTo(px(x), 0);
            g.lineTo(px(x), N);
            g.stroke();
          }
          for (let z = -75; z <= 55; z += 7.5) {
            g.beginPath();
            g.moveTo(0, pz(z));
            g.lineTo(N, pz(z));
            g.stroke();
          }
          // soot from past launches, blown north along the trench
          const soot = g.createRadialGradient(px(0), pz(-4), 0, px(0), pz(-4), N * 0.26);
          soot.addColorStop(0, 'rgba(30,26,24,0.75)');
          soot.addColorStop(0.5, 'rgba(50,44,40,0.35)');
          soot.addColorStop(1, 'rgba(60,54,50,0)');
          g.fillStyle = soot;
          g.fillRect(0, 0, N, N);
          for (let i = 0; i < 220; i++) {
            const a = r() * Math.PI * 2, d0 = 30 + r() * 250;
            g.strokeStyle = `rgba(36,32,30,${0.05 + r() * 0.12})`;
            g.lineWidth = 2 + r() * 8;
            g.beginPath();
            g.moveTo(px(0) + Math.cos(a) * d0 * 0.4, pz(-4) + Math.sin(a) * d0 * 0.4);
            g.lineTo(px(0) + Math.cos(a) * d0 * 1.6, pz(-4) + Math.sin(a) * d0 * 1.6);
            g.stroke();
          }
          // rust weeping from the tower base, tyre marks on the access road
          const rust = g.createRadialGradient(px(26), pz(-4), 0, px(26), pz(-4), 90);
          rust.addColorStop(0, 'rgba(120,70,40,0.4)');
          rust.addColorStop(1, 'rgba(120,70,40,0)');
          g.fillStyle = rust;
          g.fillRect(0, 0, N, N);
          g.strokeStyle = 'rgba(40,38,36,0.18)';
          g.lineWidth = 5;
          for (const off of [-2.2, 2.2, -5, 5]) {
            g.beginPath();
            g.moveTo(px(12 + off), N);
            g.bezierCurveTo(px(12 + off), pz(30), px(-20 + off), pz(20), px(-40 + off), pz(10));
            g.stroke();
          }
          g.fillStyle = 'rgba(232,200,60,0.75)';
          for (let z = -70; z < 50; z += 3) g.fillRect(px(-8.5), pz(z), 6, (1.5 / 130) * N);
          for (let z = -70; z < 50; z += 3) g.fillRect(px(8.5) - 6, pz(z), 6, (1.5 / 130) * N);
          // the trench itself is cut out (alpha 0)
          g.clearRect(px(-6), pz(-75), px(6) - px(-6), pz(7) - pz(-75));
        }
      }),
    );
  }

  private corrugated(base: string, repeatX: number): THREE.CanvasTexture {
    return tex(
      canvas(256, 256, (g) => {
        g.fillStyle = base;
        g.fillRect(0, 0, 256, 256);
        for (let x = 0; x < 256; x += 8) {
          const gr = g.createLinearGradient(x, 0, x + 8, 0);
          gr.addColorStop(0, 'rgba(255,255,255,0.12)');
          gr.addColorStop(0.5, 'rgba(0,0,0,0.12)');
          gr.addColorStop(1, 'rgba(255,255,255,0.12)');
          g.fillStyle = gr;
          g.fillRect(x, 0, 8, 256);
        }
        const r = prng(base.length * 7 + repeatX);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(80,60,40,${r() * 0.12})`;
          g.fillRect(r() * 256, 120 + r() * 136, 2 + r() * 6, 30 + r() * 100);
        }
        const dirt = g.createLinearGradient(0, 180, 0, 256);
        dirt.addColorStop(0, 'rgba(90,70,50,0)');
        dirt.addColorStop(1, 'rgba(90,70,50,0.35)');
        g.fillStyle = dirt;
        g.fillRect(0, 0, 256, 256);
      }),
      true,
      [repeatX, 1],
    );
  }

  private lamp(x: number, y: number, z: number, color = new THREE.Color(5, 3.2, 1.4), size = 0.7, blink = false): void {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    m.position.set(x, y, z);
    this.scene.add(m);
    if (blink) this.blinkers.push(m);
  }

  // -------------------------------------------------------------------- build
  private build(): void {
    const s = this.scene;
    s.add(this.makeSky());
    s.fog = new THREE.FogExp2(0xc08a74, HAZE);
    s.add(new THREE.HemisphereLight(0x8d9ccc, 0x8a6a52, 0.6));
    const sun = new THREE.DirectionalLight(0xffb57a, 3.0);
    sun.position.copy(this.lightDir).multiplyScalar(1600);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const c = sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -1100;
    c.right = 1100;
    c.top = 240;
    c.bottom = -240;
    c.near = 300;
    c.far = 3600;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    s.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xa9b2ea, 0.15);
    fill.position.set(-300, 500, 900);
    s.add(fill);

    this.buildTerrain();
    this.buildSea();
    this.buildVegetation();
    this.buildPad();
    this.pad2 = buildPad2({ steel: this.steel, darkSteel: this.darkSteel, paint: this.paint, concrete: this.concrete, concreteTop: this.concreteTex(false) });
    s.add(this.pad2.group);
    this.blinkers.push(...this.pad2.lamps);
    this.pad3 = buildPad3({ steel: this.steel, darkSteel: this.darkSteel, paint: this.paint, concrete: this.concrete, concreteTop: this.concreteTex(false) });
    s.add(this.pad3.group);
    this.blinkers.push(...this.pad3.lamps);
    this.buildTower();
    this.buildTankFarm();
    this.buildCrane();
    this.buildRoadAndYard();
    this.buildExtras();
    this.buildVehicle();
    this.buildDistance();
    this.buildLife();

    // every lit or plain material fades into the bearing-coloured haze
    const sunV = this.sunDir;
    const done = new Set<THREE.Material>();
    s.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats || o instanceof THREE.Sprite) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        if (done.has(m) || m instanceof THREE.ShaderMaterial || m.customProgramCacheKey() === 'launch-ground') continue;
        done.add(m);
        m.onBeforeCompile = (sh) => hazePatch(sh, sunV);
        m.customProgramCacheKey = () => 'launch-haze';
      }
    });
  }

  private paved(x: number, z: number, margin = 0): boolean {
    const A = PAD2.apron;
    if (x > PAD2.x + A.x0 - margin && x < PAD2.x + A.x1 + margin && z > PAD2.z + A.z0 - margin && z < PAD2.z + A.z1 + margin) return true; // Pad 2
    if (Math.abs(x - (PAD2.x - 180)) < 80 + margin && Math.abs(z - (PAD2.z + 330)) < 50 + margin) return true; // the Mega Bay
    if (Math.abs(x - PAD3.x) < 72 + margin && z > PAD3.z - 42 - margin && z < PAD3.z + 82 + margin) return true; // Pad 3
    for (const lz of PAD3.lz) if (Math.hypot(x - lz.x, z - lz.z) < 58 + margin) return true; // the landing zones
    if (x > -60 - margin && x < 84 + margin && z > -75 - margin && z < 95 + margin) return true; // hardstand and ramp
    if (x > -200 - margin && x < -60 + margin && z > -60 - margin && z < 115 + margin) return true; // tank farm slab
    if (x > 230 - margin && x < 670 + margin && z > -60 - margin && z < 220 + margin) return true; // yard
    if (Math.abs(z - 205) < 14 + margin) return true; // road
    if (x > 60 && x < 160 && z > 228 && z < 300) return true; // car park and palms
    return false;
  }

  private buildVegetation(): void {
    const s = this.scene;
    const rnd = prng(91);
    // bushes: lumpy blobs in sage, olive and dry brown (a finer blob near the pad, a coarse one further out)
    const lumpy = (detail: number) => {
      let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      g = mergeVertices(g);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        v.multiplyScalar(0.75 + this.n(v.x * 2.3 + 5, v.z * 2.3 + v.y * 1.7) * 0.5);
        if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    };
    const bg = lumpy(1);
    const bgLow = lumpy(0);
    const bushMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    const tones = ['#5b6340', '#6c6f47', '#7c7a52', '#4d5535', '#857652', '#62684a'].map((c) => new THREE.Color(c));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const tmp = new THREE.Color();
    const scatter = (count: number, area: number, cast: boolean, big: number) => {
      const mesh = new THREE.InstancedMesh(cast ? bg : bgLow, bushMat, count);
      let k = 0;
      for (let i = 0; i < count * 6 && k < count; i++) {
        const x = (rnd() - 0.5) * area, z = (rnd() - 0.5) * area;
        const d = z - shoreZ(x);
        if (d < 55 || this.paved(x, z, 8)) continue;
        if (!cast && Math.abs(x) < 900 && z > -500 && z < 700) continue;
        const dens = smooth(55, 260, d) * clampN(this.n(x / 420 - 9, z / 420 + 4) * 1.5 - 0.2 + this.n(x / 90, z / 90) * 0.4, 0, 1);
        if (rnd() > dens) continue;
        const r = (0.7 + rnd() * 2.2) * (d > 600 && rnd() < big ? 2.4 : 1);
        e.set((rnd() - 0.5) * 0.3, rnd() * 6.3, (rnd() - 0.5) * 0.3);
        m.compose(new THREE.Vector3(x, this.height(x, z) + r * 0.15, z), q.setFromEuler(e), new THREE.Vector3(r * (1 + rnd() * 0.5), r * (0.45 + rnd() * 0.25), r * (1 + rnd() * 0.4)));
        mesh.setMatrixAt(k, m);
        tmp.copy(tones[Math.floor(rnd() * tones.length)]).multiplyScalar(0.85 + rnd() * 0.3);
        mesh.setColorAt(k++, tmp);
      }
      mesh.count = k;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      s.add(mesh);
    };
    scatter(5200, 1800, true, 0.1);
    scatter(9000, NEAR - 200, false, 0.35);

    // grass clumps between the bushes: low, golden-dry to olive
    const COUNT = 26000;
    const grass = new THREE.InstancedMesh(bgLow, bushMat, COUNT);
    const gTones = ['#a8975f', '#968b56', '#7f7d4a', '#b29f68', '#6f7244'].map((c) => new THREE.Color(c));
    let k = 0;
    for (let i = 0; i < COUNT * 4 && k < COUNT; i++) {
      const x = -1300 + rnd() * 2700, z = -330 + rnd() * 1000;
      const d = z - shoreZ(x);
      if (d < 35 || this.paved(x, z, 3)) continue;
      if (rnd() > 0.3 + this.n(x / 60 + 2, z / 60) * 0.7) continue;
      const r = 0.35 + rnd() * 0.7;
      e.set(0, rnd() * 6.3, 0);
      m.compose(new THREE.Vector3(x, this.height(x, z) + r * 0.05, z), q.setFromEuler(e), new THREE.Vector3(r * (1 + rnd()), r * 0.32, r * (1 + rnd() * 0.6)));
      grass.setMatrixAt(k, m);
      tmp.copy(gTones[Math.floor(rnd() * gTones.length)]).multiplyScalar(0.85 + rnd() * 0.3);
      grass.setColorAt(k++, tmp);
    }
    grass.count = k;
    grass.receiveShadow = true;
    s.add(grass);
  }

  // -------------------------------------------------------------------- pad
  private buildPad(): void {
    const s = this.scene;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(144, 130), new THREE.MeshStandardMaterial({ map: this.concreteTex(true), roughness: 0.86, alphaTest: 0.5 }));
    top.rotation.x = -Math.PI / 2;
    top.position.set(12, PAD_Y, -10);
    top.receiveShadow = true;
    s.add(top);
    // the hardstand body, in three blocks round the trench
    const body = (x0: number, x1: number, z0: number, z1: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, PAD_Y + 2, z1 - z0), this.concrete);
      b.position.set((x0 + x1) / 2, PAD_Y / 2 - 1.01, (z0 + z1) / 2);
      b.castShadow = b.receiveShadow = true;
      s.add(b);
    };
    body(-60, -6, -75, 55);
    body(6, 84, -75, 55);
    body(-6, 6, 7, 55);
    // the trench floor, sooted black, and a flame deflector under the mount
    const soot = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 82), soot);
    floor.position.set(0, 0.1, -34);
    floor.receiveShadow = true;
    s.add(floor);
    const defl = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.2, 16), this.darkSteel);
    defl.position.set(0, 2.2, -2);
    defl.rotation.x = 0.28;
    s.add(defl);
    // the access ramp up from the south
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 44), this.concrete);
    ramp.position.set(12, PAD_Y / 2 - 0.3, 76);
    ramp.rotation.x = Math.atan2(PAD_Y, 44);
    ramp.receiveShadow = true;
    s.add(ramp);
    // scorched sand where the trench vents
    const scorch = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 120),
      new THREE.MeshStandardMaterial({
        map: tex(
          canvas(256, 256, (g) => {
            const gr = g.createRadialGradient(128, 20, 0, 128, 60, 200);
            gr.addColorStop(0, 'rgba(26,22,20,0.85)');
            gr.addColorStop(0.5, 'rgba(50,42,36,0.4)');
            gr.addColorStop(1, 'rgba(60,50,40,0)');
            g.fillStyle = gr;
            g.fillRect(0, 0, 256, 256);
          }),
        ),
        transparent: true,
        depthWrite: false,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.rotation.z = Math.PI;
    scorch.position.set(0, 0.15, -132);
    scorch.receiveShadow = true;
    s.add(scorch);

    // the launch mount over the trench
    const b = new Beams();
    const R = 7, deck = PAD_Y + 18;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const fx = Math.cos(a) * 12.5, fz = Math.sin(a) * 12.5;
      const tx = Math.cos(a) * (R + 0.8), tz = Math.sin(a) * (R + 0.8);
      b.add(new THREE.Vector3(fx, PAD_Y, fz), new THREE.Vector3(tx, deck - 1, tz), 1.9, 1.9);
      const a2 = a + Math.PI / 3;
      b.add(new THREE.Vector3(fx, PAD_Y, fz), new THREE.Vector3(Math.cos(a2) * (R + 2.2), PAD_Y + 10, Math.sin(a2) * (R + 2.2)), 0.5);
      b.box(fx, PAD_Y + 0.6, fz, 3.4, 1.4, 3.4, -a);
    }
    s.add(b.build(this.darkSteel));
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(R + 2.4, R + 1.6, 3.2, 96, 1, true), this.darkSteel);
    ring.position.y = deck;
    ring.castShadow = true;
    s.add(ring);
    const rtop = new THREE.Mesh(new THREE.RingGeometry(R - 0.4, R + 2.4, 96), this.steel);
    rtop.rotation.x = -Math.PI / 2;
    rtop.position.y = deck + 1.6;
    rtop.castShadow = true;
    s.add(rtop);
    // four hold-down arms between the fins carry the vehicle
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const cl = new THREE.Mesh(new RoundedBoxGeometry(1.8, ROCKET_Y - deck - 1.6, 1.4, 2, 0.12), this.darkSteel);
      cl.position.set(Math.sin(a) * 6.0, (deck + 1.6 + ROCKET_Y) / 2, Math.cos(a) * 6.0);
      cl.rotation.y = a;
      cl.castShadow = true;
      s.add(cl);
    }
    // floodlight masts on the hardstand corners, their lamps still burning at dawn
    for (const [x, z] of [[-55, -70], [80, -70], [-55, 50], [80, 50]] as [number, number][]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 42, 12), this.steel);
      mast.position.set(x, PAD_Y + 21, z);
      mast.castShadow = true;
      s.add(mast);
      const head = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 1), this.darkSteel);
      head.position.set(x, PAD_Y + 42, z);
      head.lookAt(0, 30, 0);
      s.add(head);
      for (let k = -2; k <= 2; k++) this.lamp(x + k * 1.1, PAD_Y + 42, z + (z < 0 ? 0.7 : -0.7), new THREE.Color(7, 5.6, 3.8), 0.45);
    }
    // lightning masts taller than the tower, strung together with catenary wires
    const masts: THREE.Vector3[] = [new THREE.Vector3(-95, 0, -95), new THREE.Vector3(140, 0, -60)];
    const mb = new Beams();
    for (const p of masts) {
      const H = 180;
      for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) mb.add(new THREE.Vector3(p.x + dx, 0, p.z + dz), new THREE.Vector3(p.x + dx * 0.35, H, p.z + dz * 0.35), 0.35);
      for (let y = 6; y < H; y += 6) {
        const w = 3.2 * (1 - (y / H) * 0.65);
        mb.box(p.x, y, p.z, w, 0.18, w);
      }
      mb.add(new THREE.Vector3(p.x, H, p.z), new THREE.Vector3(p.x, H + 14, p.z), 0.25);
      this.lamp(p.x, H + 14.5, p.z, new THREE.Color(7, 0.4, 0.25), 0.8, true);
      this.lamp(p.x + 0.8, H * 0.5, p.z + 0.8, new THREE.Color(7, 0.4, 0.25), 0.6, true);
    }
    s.add(mb.build(this.steel));
    // the water tower that floods the pad at ignition
    const wt = new Beams();
    const wx = 150, wz = 20, wh = 72;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      wt.add(new THREE.Vector3(wx + Math.cos(a) * 11, 0, wz + Math.sin(a) * 11), new THREE.Vector3(wx + Math.cos(a) * 6, wh, wz + Math.sin(a) * 6), 0.9);
    }
    for (let y = 12; y < wh; y += 15) {
      const rr = 11 - (y / wh) * 5;
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
        wt.add(new THREE.Vector3(wx + Math.cos(a0) * rr, y, wz + Math.sin(a0) * rr), new THREE.Vector3(wx + Math.cos(a1) * rr, y, wz + Math.sin(a1) * rr), 0.4);
      }
    }
    wt.box(wx, wh / 2, wz, 1.6, wh, 1.6);
    s.add(wt.build(this.steel));
    const tank = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), this.paint);
    tank.scale.y = 0.8;
    tank.position.set(wx, wh + 7, wz);
    tank.castShadow = tank.receiveShadow = true;
    s.add(tank);
    this.lamp(wx, wh + 15.5, wz, new THREE.Color(7, 0.4, 0.25), 0.6, true);
  }

  private buildTower(): void {
    const s = this.scene;
    const cx = 26, cz = -4, half = 6, Ht = 145, y0 = PAD_Y;
    const b = new Beams();
    const V = (x: number, y: number, z: number) => new THREE.Vector3(cx + x, y0 + y, cz + z);
    const corners: [number, number][] = [[-half, -half], [half, -half], [half, half], [-half, half]];
    for (const [x, z] of corners) b.add(V(x, 0, z), V(x, Ht, z), 1.6);
    const step = 7.5;
    for (let y = 0; y < Ht; y += step) {
      for (let k = 0; k < 4; k++) {
        const [x0, z0] = corners[k], [x1, z1] = corners[(k + 1) % 4];
        b.add(V(x0, y + step, z0), V(x1, y + step, z1), 0.7);
        b.add(V(x0, y, z0), V(x1, y + step, z1), 0.42);
        b.add(V(x1, y, z1), V(x0, y + step, z0), 0.42);
      }
      if ((y / step) % 2 === 0) {
        b.box(cx, y0 + y + step, cz, half * 2, 0.25, half * 2);
        // a catwalk round the outside every other level
        b.box(cx - half - 1.1, y0 + y + step, cz, 2.2, 0.18, half * 2 + 4.4);
        b.box(cx - half - 2.2, y0 + y + step + 1.1, cz, 0.08, 0.08, half * 2 + 4.4);
      }
    }
    b.box(cx, y0 + Ht + 2, cz, 15, 4, 15);
    // swing arms reaching across to the vehicle's skin at each level; each hinges at the tower face
    const armMat = new THREE.MeshStandardMaterial({ color: '#c24a22', roughness: 0.55, metalness: 0.35 });
    const armLevels = [116, 98, 79, 62, 44, 26];
    for (const y of armLevels) {
      const r = saturnRadiusAt(y0 + y - ROCKET_Y);
      const len = cx - half - (r + 0.9);
      const a = new Beams();
      const L = (x: number, yy: number, z: number) => new THREE.Vector3(x, yy, z);
      for (const dz of [-2, 2]) {
        a.add(L(0, y0 + y, dz), L(-len, y0 + y, -cz + dz * 0.6), 1.0, 1.6);
        a.add(L(0, y0 + y + 4, dz), L(-len * 0.85, y0 + y, -cz * 0.85 + dz * 0.6), 0.45);
      }
      a.box(-len + 0.6, y0 + y, -cz, 1.6, 2.4, 4.2);
      const g = new THREE.Group();
      g.position.set(cx - half, 0, cz);
      g.add(a.build(armMat));
      s.add(g);
      this.arms.push(g);
    }
    b.box(cx + half + 1.4, y0 + Ht / 2, cz, 2.6, Ht, 2.6);
    b.add(V(0, Ht + 4, 0), V(0, Ht + 30, 0), 0.5);
    // the red-orange of the real umbilical towers
    s.add(b.build(new THREE.MeshStandardMaterial({ color: '#c24a22', roughness: 0.55, metalness: 0.35 })));
    // the crew access arm ends in the white room at the command module hatch
    const room = new THREE.Mesh(new RoundedBoxGeometry(3.2, 3.0, 3.4, 2, 0.15), this.paint);
    const hRoom = 99.6;
    const crewArm = new THREE.Group();
    crewArm.position.set(cx - half, 0, cz);
    room.position.set(saturnRadiusAt(hRoom) + 1.7 - (cx - half), ROCKET_Y + hRoom, -cz);
    room.castShadow = true;
    crewArm.add(room);
    const crew = new Beams();
    crew.add(new THREE.Vector3(0, ROCKET_Y + hRoom, 0), new THREE.Vector3(room.position.x + 1.6, ROCKET_Y + hRoom, -cz), 1.6, 2.4);
    crewArm.add(crew.build(armMat));
    s.add(crewArm);
    this.arms.push(crewArm);
    // a hammerhead crane on the roof
    const hh = new Beams();
    hh.box(cx, y0 + Ht + 9, cz, 1.6, 10, 1.6);
    hh.add(new THREE.Vector3(cx - 16, y0 + Ht + 14.5, cz), new THREE.Vector3(cx + 9, y0 + Ht + 14.5, cz), 1.4, 1.6);
    hh.add(new THREE.Vector3(cx, y0 + Ht + 20, cz), new THREE.Vector3(cx - 16, y0 + Ht + 15.2, cz), 0.25);
    hh.add(new THREE.Vector3(cx, y0 + Ht + 20, cz), new THREE.Vector3(cx + 9, y0 + Ht + 15.2, cz), 0.25);
    hh.add(new THREE.Vector3(cx, y0 + Ht + 14, cz), new THREE.Vector3(cx, y0 + Ht + 21, cz), 0.5);
    s.add(hh.build(new THREE.MeshStandardMaterial({ color: '#c24a22', roughness: 0.55, metalness: 0.35 })));
    const cwt = new THREE.Mesh(new RoundedBoxGeometry(4.2, 2.4, 2.4, 2, 0.3), new THREE.MeshStandardMaterial({ color: '#d8b026', roughness: 0.45, metalness: 0.3 }));
    cwt.position.set(cx + 7.5, y0 + Ht + 14.5, cz);
    cwt.castShadow = true;
    s.add(cwt);
    // the elevator cab partway up
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.4, 3), this.paint);
    cab.position.set(cx + half + 1.4, y0 + 74, cz + 2.8);
    s.add(cab);
    for (const y of [Ht + 31, 110, 75, 40]) this.lamp(cx + half + 0.5, y0 + y, cz + half + 0.5, new THREE.Color(7, 0.4, 0.25), 0.75, true);
    for (let y = 15; y < Ht; y += 15) this.lamp(cx - half - 2.3, y0 + y + 1.6, cz + half + 1.6, new THREE.Color(6, 4.8, 3.2), 0.35);
    const base = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 18), this.concrete);
    base.position.set(cx, y0 + 1.5, cz);
    base.castShadow = base.receiveShadow = true;
    s.add(base);
  }

  private buildTankFarm(): void {
    const s = this.scene;
    const grime = tex(
      canvas(256, 256, (g) => {
        g.fillStyle = '#d9d5cd';
        g.fillRect(0, 0, 256, 256);
        const r = prng(55);
        for (let i = 0; i < 90; i++) {
          g.fillStyle = `rgba(120,100,80,${r() * 0.1})`;
          g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 20 + r() * 120);
        }
        const gr = g.createLinearGradient(0, 200, 0, 256);
        gr.addColorStop(0, 'rgba(110,90,70,0)');
        gr.addColorStop(1, 'rgba(110,90,70,0.3)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 256);
      }),
      true,
      [3, 1],
    );
    const white = new THREE.MeshStandardMaterial({ map: grime, roughness: 0.42, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: '#363a40', roughness: 0.45, metalness: 0.55 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(140, 1, 175), this.concrete);
    slab.position.set(-130, 0.3, 27);
    slab.receiveShadow = true;
    s.add(slab);
    const rail = new Beams();
    for (let i = 0; i < 6; i++) {
      const r = 8.5, h = 46;
      const x = -175 + i * 18.5, z = -40 - (i % 2) * 2;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 72), white);
      t.position.set(x, h / 2, z);
      t.castShadow = t.receiveShadow = true;
      s.add(t);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 72, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.paint);
      dome.scale.y = 0.32;
      dome.position.set(x, h, z);
      dome.castShadow = true;
      s.add(dome);
      for (let k = 1; k < 6; k++) rail.box(x, (k * h) / 6, z, r * 2 + 0.05, 0.08, r * 2 + 0.05);
      rail.box(x + r * 0.7, h / 2, z + r * 0.72, 0.6, h, 0.6);
      rail.box(x, h + 3.8, z, 0.4, 2.5, 0.4);
    }
    rail.box(-129, 49.5, -41, 94, 0.4, 1.6);
    s.add(rail.build(this.darkSteel));
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(4.2, 52, 12, 48), white);
      t.rotation.z = Math.PI / 2;
      t.position.set(-110 + i * 2, 5.3, 6 + i * 9.5);
      t.castShadow = t.receiveShadow = true;
      s.add(t);
      for (const dx of [-18, 0, 18]) {
        const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 7), this.concrete);
        saddle.position.set(t.position.x + dx, 1.7, t.position.z);
        s.add(saddle);
      }
    }
    // the big propellant spheres on their legs
    const legs = new Beams();
    for (const [x, z, r] of [[-170, 62, 11], [-125, 88, 9.5]] as [number, number, number][]) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(r, 72, 36), white);
      sp.position.set(x, r + 7, z);
      sp.castShadow = sp.receiveShadow = true;
      s.add(sp);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        legs.add(new THREE.Vector3(x + Math.cos(a) * r * 0.95, 0.8, z + Math.sin(a) * r * 0.95), new THREE.Vector3(x + Math.cos(a) * r * 0.97, r + 7, z + Math.sin(a) * r * 0.97), 0.7);
        const a2 = ((i + 1) / 8) * Math.PI * 2;
        legs.add(new THREE.Vector3(x + Math.cos(a) * r * 0.95, 1, z + Math.sin(a) * r * 0.95), new THREE.Vector3(x + Math.cos(a2) * r * 0.95, r * 0.6 + 4, z + Math.sin(a2) * r * 0.95), 0.25);
      }
      legs.box(x + r + 1.2, (r * 2 + 7) / 2, z, 1.2, r * 2 + 7, 1.2);
    }
    s.add(legs.build(this.darkSteel));
    for (let i = 0; i < 7; i++) {
      const r = 3.2, h = 22 + (i % 3) * 4;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), dark);
      t.position.set(470 + (i % 4) * 9, h / 2, 40 + Math.floor(i / 4) * 10);
      t.castShadow = true;
      s.add(t);
    }
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 30, 8, 32), white);
      t.rotation.z = Math.PI / 2;
      t.position.set(560, 3, 30 + i * 7);
      t.castShadow = true;
      s.add(t);
    }
    const pipes = new Beams();
    for (let x = -96; x <= -6; x += 12) pipes.box(x, 2.5, -24, 0.5, 5, 0.5);
    for (const dz of [-0.6, 0, 0.6]) pipes.add(new THREE.Vector3(-110, 5.2, -24 + dz), new THREE.Vector3(-6, 5.2, -24 + dz), 0.45);
    for (const dz of [-0.6, 0.6]) pipes.add(new THREE.Vector3(-6, 5.2, -24 + dz), new THREE.Vector3(-6, PAD_Y + 1, -24 + dz), 0.45);
    s.add(pipes.build(this.steel));
    // vents breathing a little vapour off the cold tanks
    const puff = tex(
      canvas(128, 128, (g) => {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(255,244,236,0.55)');
        gr.addColorStop(1, 'rgba(255,244,236,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
      }),
    );
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.5, fog: true }));
      sp.userData = { x: -175 + (i % 6) * 18.5, phase: i / 18 };
      this.steam.push(sp);
      s.add(sp);
    }
  }

  private props(): PropMats {
    return { steel: this.steel, darkSteel: this.darkSteel, paint: this.paint, concrete: this.concrete };
  }

  private buildCrane(): void {
    const s = this.scene;
    const yellow = new THREE.MeshStandardMaterial({ color: '#e0a21e', roughness: 0.42, metalness: 0.3 });
    const { group, tip } = crawlerCrane(this.props(), yellow);
    group.position.set(110, PAD_Y, 40);
    group.rotation.y = 2.5;
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    s.add(group);
    const tipW = tip.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 2.5).add(group.position);
    this.lamp(tipW.x, tipW.y + 1.2, tipW.z, new THREE.Color(7, 0.4, 0.25), 0.6, true);
    const tc = truckCrane(this.props(), yellow);
    tc.position.set(-40, 0, 78);
    tc.rotation.y = 0.8;
    tc.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    s.add(tc);
  }

  private building(x: number, z: number, w: number, d: number, h: number, base: string, lit: boolean, ry = 0): void {
    const s = this.scene;
    const g = new THREE.Group();
    const floors = Math.max(1, Math.round(h / 4));
    const seed = Math.round(x * 13 + z);
    const front = new THREE.MeshStandardMaterial({ map: facadeTexture(base, Math.max(2, Math.round(w / 3.2)), floors, seed), roughness: 0.5, metalness: 0.3 });
    const end = new THREE.MeshStandardMaterial({ map: facadeTexture(base, Math.max(1, Math.round(d / 3.2)), floors, seed + 7), roughness: 0.5, metalness: 0.3 });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#5d5f62', roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [end, end, roofMat, roofMat, front, front]);
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    // parapet, coping and a plinth
    const trim = new THREE.MeshStandardMaterial({ color: '#4a4c50', roughness: 0.6, metalness: 0.4 });
    for (const [sx, sz, px, pz] of [[w + 0.4, 0.3, 0, d / 2], [w + 0.4, 0.3, 0, -d / 2], [0.3, d + 0.4, w / 2, 0], [0.3, d + 0.4, -w / 2, 0]]) {
      const par = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.9, sz), trim);
      par.position.set(px, h + 0.45, pz);
      par.castShadow = true;
      g.add(par);
    }
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3), this.concrete);
    plinth.position.y = 0.25;
    g.add(plinth);
    // rooftop plant: air handlers with fan grilles, vent stacks, a ladder hatch
    const r = prng(seed);
    const fan = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.6, metalness: 0.5 });
    for (let i = 0; i < Math.max(1, Math.round(w / 12)); i++) {
      const ux = (r() - 0.5) * (w - 5), uz = (r() - 0.5) * (d - 4);
      const u = new THREE.Mesh(new RoundedBoxGeometry(3.2, 1.5, 2.2, 2, 0.08), this.steel);
      u.position.set(ux, h + 0.75, uz);
      u.castShadow = true;
      g.add(u);
      for (const fx of [-0.75, 0.75]) {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 18), fan);
        f.position.set(ux + fx, h + 1.52, uz);
        g.add(f);
      }
    }
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 10), this.steel);
      v.position.set((r() - 0.5) * (w - 2), h + 0.8, (r() - 0.5) * (d - 2));
      g.add(v);
    }
    // doors: a roll-up bay door and a personnel door with a small canopy and a lamp
    const doorMat = new THREE.MeshStandardMaterial({ map: this.corrugated('#6d7177', 4), roughness: 0.5, metalness: 0.5 });
    const dw = Math.min(6, w * 0.3), dh = Math.min(h * 0.75, 5.5);
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), doorMat);
    bay.position.set(-w / 4, dh / 2, d / 2 + 0.03);
    g.add(bay);
    const pd = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.4, metalness: 0.6 }));
    pd.position.set(w / 4, 1.1, d / 2 + 0.03);
    g.add(pd);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 1.4), trim);
    canopy.position.set(w / 4, 2.7, d / 2 + 0.7);
    canopy.castShadow = true;
    g.add(canopy);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    s.add(g);
    const wl = new THREE.Vector3(w / 4, 2.55, d / 2 + 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    if (lit) this.lamp(x + wl.x, wl.y, z + wl.z, new THREE.Color(6, 4.6, 2.8), 0.16);
    // an exterior stair up the end wall
    if (h > 6) {
      const st = new Beams();
      const sx = w / 2 + 0.8;
      for (let k = 0; k < 14; k++) st.box(sx, (k / 14) * h, -d / 2 + 1 + (k / 14) * (d - 2), 1.2, 0.08, 0.35);
      st.add(new THREE.Vector3(sx + 0.6, 1, -d / 2 + 1), new THREE.Vector3(sx + 0.6, h + 1, d / 2 - 1), 0.06);
      const m = st.build(this.darkSteel);
      m.position.set(x, 0, z);
      m.rotation.y = ry;
      s.add(m);
    }
  }

  private buildRoadAndYard(): void {
    const s = this.scene;
    const rnd = prng(29);
    const asphaltTex = tex(
      canvas(512, 64, (g) => {
        g.fillStyle = '#45454a';
        g.fillRect(0, 0, 512, 64);
        const r = prng(4);
        for (let i = 0; i < 1500; i++) {
          const v = 50 + r() * 40;
          g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
          g.fillRect(r() * 512, r() * 64, 1 + r() * 2, 1);
        }
        g.fillStyle = 'rgba(30,30,32,0.35)';
        g.fillRect(0, 14, 512, 8);
        g.fillRect(0, 42, 512, 8);
        g.fillStyle = '#d8c070';
        for (let x = 0; x < 512; x += 64) g.fillRect(x, 31, 36, 2);
        g.fillStyle = '#d8d6cc';
        g.fillRect(0, 3, 512, 1.5);
        g.fillRect(0, 60, 512, 1.5);
      }),
      true,
      [FAR / 24, 1],
    );
    const road = new THREE.Mesh(new THREE.PlaneGeometry(FAR * 2, 16), new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.75 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.3, 205);
    road.receiveShadow = true;
    s.add(road);
    const yardTex = tex(
      canvas(512, 512, (g) => {
        g.fillStyle = '#7d7b77';
        g.fillRect(0, 0, 512, 512);
        const r = prng(9);
        for (let i = 0; i < 300; i++) {
          const x = r() * 512, y = r() * 512, rr = 5 + r() * 40;
          const gr = g.createRadialGradient(x, y, 0, x, y, rr);
          gr.addColorStop(0, `rgba(${r() < 0.5 ? '40,40,44' : '110,108,104'},0.2)`);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        }
        g.strokeStyle = 'rgba(220,214,200,0.55)';
        g.lineWidth = 1.5;
        for (let i = 0; i < 24; i++) {
          g.beginPath();
          g.moveTo(40 + i * 8, 420);
          g.lineTo(40 + i * 8, 445);
          g.stroke();
        }
      }),
    );
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(440, 280), new THREE.MeshStandardMaterial({ map: yardTex, roughness: 0.8 }));
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(450, 0.12, 80);
    yard.receiveShadow = true;
    s.add(yard);
    // power line poles along the road
    const poles = new Beams();
    for (let x = -3000; x <= 3000; x += 60) {
      poles.box(x, 6, 218, 0.35, 12, 0.35);
      poles.box(x, 11.4, 218, 3.2, 0.2, 0.2);
    }
    s.add(poles.build(new THREE.MeshStandardMaterial({ color: '#4c3d30', roughness: 0.9 }), true));
    const wireMat = new THREE.LineBasicMaterial({ color: '#26262a' });
    for (const dz of [-1.4, 0, 1.4]) {
      const pts: THREE.Vector3[] = [];
      for (let x = -3000; x <= 3000; x += 60) {
        for (let k = 0; k < 6; k++) {
          const t = k / 6;
          pts.push(new THREE.Vector3(x + t * 60, 11.5 - 4 * 1.2 * t * (1 - t), 218 + dz));
        }
      }
      s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    }
    const fence = new Beams();
    for (let x = -260; x <= 660; x += 6) fence.box(x, 1.2, 180, 0.12, 2.4, 0.12);
    fence.add(new THREE.Vector3(-260, 2.3, 180), new THREE.Vector3(660, 2.3, 180), 0.06);
    fence.add(new THREE.Vector3(-260, 1.2, 180), new THREE.Vector3(660, 1.2, 180), 0.04);
    s.add(fence.build(this.steel, false));
    this.building(330, 120, 70, 18, 7, '#4a4f56', true);
    this.building(420, 135, 30, 14, 6, '#c9ccd0', true);
    this.building(300, 50, 24, 16, 11, '#d5d6d3', false);
    this.building(390, 60, 44, 14, 6, '#9aa1a7', true);
    this.building(-150, 140, 40, 14, 6, '#d4d1cb', true);
    this.building(-40, 150, 30, 10, 4.5, '#33373d', true);
    this.building(530, 160, 28, 12, 5, '#bcc0c4', true);
    this.building(600, 100, 50, 30, 14, '#d9d8d4', false);
    const stands = new Beams();
    for (const [x, z, h] of [[520, -10, 24], [590, 0, 20]] as [number, number, number][]) {
      for (const [dx, dz] of [[-4, -4], [4, -4], [4, 4], [-4, 4]]) stands.add(new THREE.Vector3(x + dx, 0, z + dz), new THREE.Vector3(x + dx * 0.7, h, z + dz * 0.7), 0.6);
      for (let y = 6; y < h; y += 6) stands.box(x, y, z, 7, 0.4, 7);
    }
    s.add(stands.build(this.darkSteel));
    this.buildVehicles(rnd);
    const trunk = new THREE.MeshStandardMaterial({ color: '#6c5640', roughness: 0.9 });
    const leaves = new THREE.MeshStandardMaterial({ color: '#4a5e30', roughness: 0.85, side: THREE.DoubleSide });
    const frondGeo = new THREE.PlaneGeometry(1.1, 5.5, 1, 4);
    const fp = frondGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const y = fp.getY(i) + 2.75;
      fp.setX(i, fp.getX(i) * Math.sin((y / 5.5) * Math.PI) * 1.4);
      fp.setZ(i, -0.06 * y * y);
      fp.setY(i, y);
    }
    frondGeo.computeVertexNormals();
    for (const [x, z] of [[56, 240], [142, 232], [56, 284], [160, 282], [-20, 262], [-90, 250], [200, 245]] as [number, number][]) {
      const hgt = 8 + rnd() * 4;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.42, hgt, 10), trunk);
      t.position.set(x, hgt / 2, z);
      t.rotation.z = (rnd() - 0.5) * 0.1;
      t.castShadow = true;
      s.add(t);
      for (let k = 0; k < 9; k++) {
        const frond = new THREE.Mesh(frondGeo, leaves);
        frond.position.set(x, hgt, z);
        frond.rotation.set(0, (k / 9) * Math.PI * 2 + rnd() * 0.3, 0, 'YXZ');
        frond.rotateX(1.1 + rnd() * 0.5);
        frond.castShadow = true;
        s.add(frond);
      }
    }
  }

  private buildVehicles(rnd: () => number): void {
    const s = this.scene;
    const f = this.fleet;
    const pick = () => {
      const k = rnd();
      return k < 0.34 ? 'sedan' : k < 0.5 ? 'hatch' : k < 0.8 ? 'suv' : k < 0.92 ? 'pickup' : 'van';
    };
    const col = () => Fleet.COLOURS[Math.floor(rnd() * Fleet.COLOURS.length)];
    // painted lots: a strip along the road inside the fence, and the car park by the palms
    const lotTex = (w: number, h: number, stalls: number, rows: number) =>
      tex(
        canvas(1024, 512, (g) => {
          g.fillStyle = '#4a4a4e';
          g.fillRect(0, 0, 1024, 512);
          const r = prng(w * 7 + h);
          for (let i = 0; i < 2500; i++) {
            const v = 55 + r() * 40;
            g.fillStyle = `rgba(${v},${v},${v + 3},0.5)`;
            g.fillRect(r() * 1024, r() * 512, 1 + r() * 2, 1 + r() * 2);
          }
          for (let i = 0; i < 40; i++) {
            const x = r() * 1024, y = r() * 512, rr = 6 + r() * 30;
            const gr = g.createRadialGradient(x, y, 0, x, y, rr);
            gr.addColorStop(0, 'rgba(25,25,28,0.35)');
            gr.addColorStop(1, 'rgba(25,25,28,0)');
            g.fillStyle = gr;
            g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
          }
          g.strokeStyle = 'rgba(230,228,220,0.8)';
          g.lineWidth = 3;
          for (let row = 0; row < rows; row++) {
            const y0 = ((row + 0.5) / rows) * 512;
            for (let i = 0; i <= stalls; i++) {
              const x = (i / stalls) * 1024;
              g.beginPath();
              g.moveTo(x, y0 - 40);
              g.lineTo(x, y0 + 40);
              g.stroke();
            }
          }
        }),
      );
    const lot = (cx: number, cz: number, w: number, d: number, stalls: number, rows: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: lotTex(w, d, stalls, rows), roughness: 0.8 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, 0.1, cz);
      m.receiveShadow = true;
      s.add(m);
    };
    lot(-100, 189, 268, 13, 96, 1);
    lot(100, 263, 64, 56, 23, 4);
    for (let i = 0; i < 96; i++) {
      if (rnd() < 0.3) continue;
      const x = -234 + (i + 0.5) * (268 / 96);
      f.add(pick(), x, 0.1, 189, (rnd() < 0.5 ? 1 : -1) * Math.PI / 2 + (rnd() - 0.5) * 0.05, col());
    }
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 23; i++) {
        if (rnd() < 0.28) continue;
        const x = 68 + (i + 0.5) * (64 / 23);
        f.add(pick(), x, 0.1, 235 + (row + 0.5) * 14, (row % 2 ? 1 : -1) * Math.PI / 2 + (rnd() - 0.5) * 0.05, col());
      }
    }
    // work vehicles about the site
    for (const [x, z, ry, v] of [[60, 70, 0.4, 'pickup'], [-20, 70, 2.1, 'van'], [300, 85, 0, 'pickup'], [318, 85, 0, 'suv'], [445, 112, 1.57, 'van'], [452, 112, 1.57, 'van'], [520, 140, 0, 'pickup'], [-150, 120, 0.1, 'suv'], [-140, 121, 0.1, 'pickup'], [-35, 135, 3.1, 'sedan'], [95, 60, 1.2, 'pickup']] as [number, number, number, string][]) {
      const y = this.paved(x, z) && x > -60 && x < 84 && z > -75 && z < 55 ? PAD_Y : 0.12;
      f.add(v as 'pickup', x, y, z, ry, ['#f2f1ee', '#e9e9e7', '#c8c6c0', '#1b3561'][Math.floor(rnd() * 4)]);
    }
    // traffic on the coast road, headlights on in the dawn
    for (let i = 0; i < 16; i++) {
      const dir = i % 2 ? 1 : -1;
      const z = dir > 0 ? 201.2 : 208.8;
      const x = -2800 + rnd() * 5600;
      const idx = f.add(pick(), x, 0.3, z, dir > 0 ? 0 : Math.PI, col(), true);
      this.traffic.push({ i: idx, x, z, dir, v: 18 + rnd() * 10 });
    }
    f.build(s);
  }

  /** the Saturn V on the mount, lit by searchlights and breathing vapour from its vents */
  private buildVehicle(): void {
    const s = this.scene;
    const rocket = buildSaturnV();
    rocket.position.y = ROCKET_Y;
    s.add(rocket);
    this.rocket = rocket;
    for (const [x, z] of [[-70, 160], [110, 150]] as [number, number][]) {
      const sl = new THREE.SpotLight(0xfff1dc, 9000, 0, 0.36, 0.6, 2);
      sl.position.set(x, 18, z);
      sl.target.position.set(0, ROCKET_Y + 60, 0);
      s.add(sl, sl.target);
      const base = new THREE.Mesh(new RoundedBoxGeometry(2.4, 2.4, 2.4, 2, 0.2), this.darkSteel);
      base.position.set(x, 1.2, z);
      s.add(base);
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 20), this.darkSteel);
      can.position.set(x, 3.2, z);
      can.lookAt(0, ROCKET_Y + 60, 0);
      can.rotateX(Math.PI / 2);
      s.add(can);
      this.lamp(x * 0.985, 3.25, z * 0.985, new THREE.Color(14, 13, 11), 0.75);
      // a stand mast so the searchlight sits clear of the ground clutter
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 16, 10), this.steel);
      mast.position.set(x, 10, z);
      s.add(mast);
      sl.position.y = 18;
    }
    const puff = tex(
      canvas(128, 128, (g) => {
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(255,250,246,0.7)');
        gr.addColorStop(0.6, 'rgba(255,250,246,0.25)');
        gr.addColorStop(1, 'rgba(255,250,246,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
      }),
    );
    // LOX boiling off from the first and second stages and the third stage's vents
    const vents: [number, number, number][] = [[37, -1, 0.9], [37, 1, 0.9], [64, -1, 0.7], [82, 1, 0.5], [15, -1, 0.6]];
    for (const [h, side, k] of vents) {
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0, fog: true }));
        const r = saturnRadiusAt(h);
        sp.userData = { x: side * (r + 0.3), y: ROCKET_Y + h, phase: i / 5 + h * 0.013, side, k };
        this.vapour.push(sp);
        s.add(sp);
      }
    }
  }

  /** the clutter of a working site: trucks, dishes, containers, barriers, lights, a gatehouse, sand fences */
  private buildExtras(): void {
    const s = this.scene;
    const m = this.props();
    const rnd = prng(73);
    const shadow = (o: THREE.Object3D) => {
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) c.castShadow = c.receiveShadow = true;
      });
      s.add(o);
    };
    // tankers topping up the farm, a box truck in the yard
    for (const [x, z, ry, tanker, c] of [[-112, 128, 0.05, true, '#d6d8db'], [-70, 108, -0.25, true, '#8c1d1d'], [485, 30, 1.57, false, '#1b3561'], [560, 150, 0, false, '#e9e9e7']] as [number, number, number, boolean, string][]) {
      const t = semiTruck(m, c, tanker);
      t.position.set(x, 0.12, z);
      t.rotation.y = ry;
      shadow(t);
    }
    // a shuttle bus at the car park
    const bus = new THREE.Group();
    const busBody = new THREE.Mesh(new RoundedBoxGeometry(12, 3.1, 2.55, 3, 0.35), new THREE.MeshPhysicalMaterial({ color: '#eceae6', roughness: 0.35, metalness: 0.3, clearcoat: 1 }));
    busBody.position.y = 1.95;
    bus.add(busBody);
    const band = new THREE.Mesh(new THREE.BoxGeometry(11.4, 1.0, 2.6), new THREE.MeshStandardMaterial({ color: '#0d1217', roughness: 0.05, metalness: 0.9 }));
    band.position.y = 2.45;
    bus.add(band);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(11.9, 0.22, 2.58), new THREE.MeshStandardMaterial({ color: '#2a5ea8', roughness: 0.4 }));
    stripe.position.y = 1.55;
    bus.add(stripe);
    const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 18).rotateX(Math.PI / 2);
    for (const x of [-3.8, 3.6]) for (const sz of [-1.15, 1.15]) {
      const w = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.9 }));
      w.position.set(x, 0.5, sz);
      bus.add(w);
    }
    bus.position.set(150, 0.12, 250);
    bus.rotation.y = 1.5;
    shadow(bus);
    // tracking antennas and a radome at the far end of the yard
    for (const [x, z, r, az, el] of [[615, -30, 9, 2.7, 0.75], [650, 30, 6, 2.2, 0.5], [585, 30, 4.5, 3.1, 0.9]] as number[][]) {
      const d = trackingDish(m, r, az, el);
      d.position.set(x, 0.12, z);
      shadow(d);
    }
    const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 6, 32), this.concrete);
    domeBase.position.set(640, 3, 175);
    shadow(domeBase);
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(7.5, 3), new THREE.MeshStandardMaterial({ color: '#efeeea', roughness: 0.5, flatShading: true }));
    dome.position.set(640, 8.5, 175);
    shadow(dome);
    // stacked containers
    const ctex = containerTexture();
    const box = new THREE.BoxGeometry(12.2, 2.6, 2.44);
    const cMesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ map: ctex, roughness: 0.6, metalness: 0.3 }), 40);
    const cCols = ['#8a3b2c', '#2f5470', '#b8892c', '#5d6b3a', '#7c7f84', '#a8432a', '#23466b', '#d8d4cc'].map((c) => new THREE.Color(c));
    const mx = new THREE.Matrix4();
    let k = 0;
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 6; row++) {
        const hgt = 1 + Math.floor(rnd() * 3);
        for (let lv = 0; lv < hgt && k < 40; lv++) {
          mx.makeTranslation(560 + col * 13, 0.12 + 1.3 + lv * 2.6, 60 + row * 2.6);
          cMesh.setMatrixAt(k, mx);
          cMesh.setColorAt(k++, cCols[Math.floor(rnd() * cCols.length)]);
        }
      }
    }
    cMesh.count = k;
    cMesh.castShadow = cMesh.receiveShadow = true;
    s.add(cMesh);
    // concrete barriers lining the yard and the pad access road
    const jersey = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.3, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0.3, 0.08), new THREE.Vector2(0.12, 0.3), new THREE.Vector2(0.08, 0.81), new THREE.Vector2(-0.08, 0.81), new THREE.Vector2(-0.12, 0.3), new THREE.Vector2(-0.3, 0.08)]), { depth: 3.6, bevelEnabled: false });
    jersey.translate(0, 0, -1.8);
    const jPos: [number, number, number][] = [];
    for (let x = 236; x < 664; x += 3.7) jPos.push([x, -58, Math.PI / 2]);
    for (let z = 100; z < 176; z += 3.7) {
      jPos.push([5, z, 0]);
      jPos.push([19, z, 0]);
    }
    const jMesh = new THREE.InstancedMesh(jersey, this.concrete, jPos.length);
    jPos.forEach(([x, z, ry], i) => jMesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1))));
    jMesh.castShadow = jMesh.receiveShadow = true;
    s.add(jMesh);
    // the access road from the coast road up to the pad ramp, with a gatehouse and a boom barrier
    const acc = new THREE.Mesh(new THREE.PlaneGeometry(12, 100), new THREE.MeshStandardMaterial({ color: '#4c4c50', roughness: 0.8 }));
    acc.rotation.x = -Math.PI / 2;
    acc.position.set(12, 0.14, 148);
    acc.receiveShadow = true;
    s.add(acc);
    const booth = new THREE.Mesh(new RoundedBoxGeometry(3.2, 2.8, 2.6, 2, 0.12), this.paint);
    booth.position.set(23.5, 1.5, 184);
    shadow(booth);
    const bRoof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 3.6), this.darkSteel);
    bRoof.position.set(23.5, 3.05, 184);
    shadow(bRoof);
    const bWin = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 1.0), toneMapped: false }));
    bWin.position.set(21.88, 1.9, 184);
    bWin.rotation.y = -Math.PI / 2;
    s.add(bWin);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 11), new THREE.MeshStandardMaterial({ color: '#d93a2b', roughness: 0.5 }));
    arm.position.set(18.5, 1.1, 179.5);
    arm.rotation.y = Math.PI / 2;
    s.add(arm);
    // street lights along the coast road, still burning
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 10, 8);
    poleGeo.translate(0, 5, 0);
    const armGeo = new THREE.BoxGeometry(0.1, 0.1, 2.6);
    armGeo.translate(0, 10, 1.2);
    const headGeo = new THREE.BoxGeometry(0.4, 0.15, 0.8);
    headGeo.translate(0, 9.9, 2.4);
    const sl: [number, number, number][] = [];
    for (let x = -900; x <= 900; x += 48) sl.push([x, 196.6, 0]);
    for (let x = -880; x <= 900; x += 48) sl.push([x, 213.4, Math.PI]);
    for (const [cx, cz] of [[80, 248], [120, 248], [80, 278], [120, 278], [-200, 196], [-60, 196]]) sl.push([cx, cz, 0]);
    const slMat = new THREE.MeshStandardMaterial({ color: '#8a9096', roughness: 0.4, metalness: 0.8 });
    const glowGeo = new THREE.BoxGeometry(0.34, 0.06, 0.7);
    glowGeo.translate(0, 9.82, 2.4);
    for (const [geo, mat] of [[poleGeo, slMat], [armGeo, slMat], [headGeo, slMat], [glowGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.4, 2.2), toneMapped: false })]] as [THREE.BufferGeometry, THREE.Material][]) {
      const im = new THREE.InstancedMesh(geo, mat, sl.length);
      sl.forEach(([x, z, ry], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1))));
      im.castShadow = mat !== slMat ? false : true;
      s.add(im);
    }
    // mobile lighting towers and generator sets on the hardstand
    for (const [x, z, ry] of [[-40, 40, 0.6], [70, -55, 2.4]] as number[][]) {
      const g = new THREE.Group();
      const trailer = new THREE.Mesh(new RoundedBoxGeometry(3.4, 1.4, 1.6, 2, 0.15), this.paint);
      trailer.position.y = 1.2;
      g.add(trailer);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 9, 8), this.steel);
      mast.position.set(-1.2, 6.2, 0);
      g.add(mast);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2.2), this.darkSteel);
      bar.position.set(-1.2, 10.6, 0);
      g.add(bar);
      g.position.set(x, PAD_Y, z);
      g.rotation.y = ry;
      shadow(g);
      for (const dz of [-0.8, -0.27, 0.27, 0.8]) {
        const p = new THREE.Vector3(-1.2, 10.85, dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        this.lamp(x + p.x, PAD_Y + p.y, z + p.z, new THREE.Color(8, 7, 5.5), 0.22);
      }
    }
    // a windsock by the pad
    const wpole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 9, 8), this.steel);
    wpole.position.set(-56, 4.5, 60);
    s.add(wpole);
    const sockTex = tex(
      canvas(128, 32, (g) => {
        for (let i = 0; i < 5; i++) {
          g.fillStyle = i % 2 ? '#f2f2ef' : '#ec5a1c';
          g.fillRect((i / 5) * 128, 0, 128 / 5, 32);
        }
      }),
    );
    const sockGeo = new THREE.CylinderGeometry(0.22, 0.42, 3.2, 16, 1, true);
    sockGeo.rotateZ(Math.PI / 2);
    sockGeo.translate(-1.6, 0, 0);
    const sock = new THREE.Mesh(sockGeo, new THREE.MeshStandardMaterial({ map: sockTex, side: THREE.DoubleSide, roughness: 0.9 }));
    sock.position.set(-56, 8.8, 60);
    sock.rotation.set(0, 1.3, -0.2);
    s.add(sock);
    // the blockhouse: a low concrete dome, half buried
    const bh = new THREE.Mesh(new THREE.SphereGeometry(13, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.concrete);
    bh.scale.y = 0.42;
    bh.position.set(-150, 0, -100);
    shadow(bh);
    // sand fences along the dunes: slatted strips that follow the ground
    const slat = tex(
      canvas(128, 64, (g) => {
        for (let x = 0; x < 128; x += 16) {
          g.fillStyle = '#8a7356';
          g.fillRect(x + 2, 4, 9, 60);
        }
        g.fillStyle = '#6a5a48';
        g.fillRect(0, 14, 128, 2);
        g.fillRect(0, 48, 128, 2);
      }),
    );
    slat.wrapS = THREE.RepeatWrapping;
    const fencePos: number[] = [], fenceUv: number[] = [];
    for (const zOff of [70, 112]) {
      for (let x = -1200; x < 1200; x += 4) {
        if (rnd() < 0.06) {
          x += 12;
          continue;
        }
        const z0 = shoreZ(x) + zOff + Math.sin(x * 0.01) * 4, z1 = shoreZ(x + 4) + zOff + Math.sin((x + 4) * 0.01) * 4;
        const y0 = this.height(x, z0) - 0.1, y1 = this.height(x + 4, z1) - 0.1;
        fencePos.push(x, y0, z0, x + 4, y1, z1, x + 4, y1 + 1.2, z1, x, y0, z0, x + 4, y1 + 1.2, z1, x, y0 + 1.2, z0);
        fenceUv.push(0, 0, 0.5, 0, 0.5, 1, 0, 0, 0.5, 1, 0, 1);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fencePos, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(fenceUv, 2));
    fg.computeVertexNormals();
    const sandFence = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: slat, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
    sandFence.castShadow = sandFence.receiveShadow = true;
    s.add(sandFence);
    // a pipe rack carrying propellant lines from the farm to the pad
    const rack = new Beams();
    for (let x = -110; x <= -62; x += 8) {
      rack.box(x, 3, -12, 0.35, 6, 0.35);
      rack.box(x, 3, -16, 0.35, 6, 0.35);
      rack.box(x, 6, -14, 0.3, 0.3, 4.6);
    }
    s.add(rack.build(this.darkSteel));
    const pipeMat = new THREE.MeshStandardMaterial({ color: '#c9ccd0', roughness: 0.3, metalness: 0.8 });
    for (const [dz, r] of [[-13, 0.45], [-14.2, 0.32], [-15.2, 0.55]] as number[][]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 50, 16), pipeMat);
      p.rotation.z = Math.PI / 2;
      p.position.set(-86, 6.55 + r, dz);
      p.castShadow = true;
      s.add(p);
    }
  }

  /** far-off details that give the land its scale: other pads, a town, the assembly hall, ships */
  private buildDistance(): void {
    const s = this.scene;
    const dark = new THREE.MeshStandardMaterial({ color: '#3a3a40', roughness: 0.6, metalness: 0.4 });
    const b = new Beams();
    const tw = (x: number, z: number, h: number) => {
      for (const [dx, dz] of [[-4, -4], [4, -4], [4, 4], [-4, 4]]) b.add(new THREE.Vector3(x + dx, 0, z + dz), new THREE.Vector3(x + dx, h, z + dz), 1.2);
      for (let y = 8; y < h; y += 8) b.box(x, y, z, 9, 0.5, 9);
    };
    const pads: [number, number, number][] = [[-4200, 0, 110], [5200, 0, 90], [9800, 0, 120]];
    for (const p of pads) {
      p[1] = shoreZ(p[0]) + 260;
      tw(p[0], p[1], p[2]);
    }
    s.add(b.build(dark, false));
    for (const [x, z, h] of pads) this.lamp(x, h + 2, z, new THREE.Color(9, 0.5, 0.3), 3, true);
    // the vehicle assembly hall, 1.6 km inland
    const hall = new THREE.Group();
    const hallMat = new THREE.MeshStandardMaterial({ map: this.corrugated('#c9c8c4', 30), roughness: 0.6, metalness: 0.2 });
    const main = new THREE.Mesh(new THREE.BoxGeometry(160, 150, 130), hallMat);
    main.position.y = 75;
    main.castShadow = main.receiveShadow = true;
    hall.add(main);
    const low = new THREE.Mesh(new THREE.BoxGeometry(220, 60, 70), hallMat);
    low.position.set(-40, 30, 95);
    low.castShadow = true;
    hall.add(low);
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(30, 135), new THREE.MeshStandardMaterial({ color: '#4d5158', roughness: 0.5, metalness: 0.5 }));
      door.position.set(sx * 40, 67.5, -65.1);
      door.rotation.y = Math.PI;
      hall.add(door);
    }
    hall.position.set(-1400, 0, 720);
    s.add(hall);
    for (const [dx, dz] of [[-80, -65], [80, -65], [-80, 65], [80, 65]]) this.lamp(-1400 + dx, 151, 720 + dz, new THREE.Color(8, 0.5, 0.3), 1.2, true);
    // the crawlerway: a pale strip from the hall to the pad
    const cw = new THREE.Mesh(new THREE.PlaneGeometry(30, 1500), new THREE.MeshStandardMaterial({ color: '#b8ac94', roughness: 1 }));
    cw.rotation.x = -Math.PI / 2;
    cw.rotation.z = Math.atan2(1400, 640);
    cw.position.set(-700, 0.2, 400);
    cw.receiveShadow = true;
    s.add(cw);
    // a town inland, its lights still on
    const town = new Beams();
    const r = prng(3);
    for (let i = 0; i < 220; i++) {
      const x = -9000 + r() * 7000, z = 3500 + r() * 3200;
      const h = 4 + r() * 14;
      town.box(x, this.height(x, z) + h / 2, z, 12 + r() * 30, h, 10 + r() * 20, r() * 0.4);
    }
    s.add(town.build(new THREE.MeshStandardMaterial({ color: '#8f857e', roughness: 0.8 }), false));
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4, 2), toneMapped: false }), 320);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 320; i++) {
      const x = -9000 + r() * 7000, z = 3500 + r() * 3200;
      m.makeTranslation(x, this.height(x, z) + 3 + r() * 10, z);
      lights.setMatrixAt(i, m);
    }
    s.add(lights);
    const pier = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 900), this.concrete);
    pier.position.set(2600, 1.5, shoreZ(2600) - 430);
    s.add(pier);
    // ships on the horizon: a freighter and a fishing boat heading out
    const hull = new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.6, metalness: 0.3 });
    const ship = (x: number, z: number, len: number, ry: number, boxes: boolean) => {
      const g = new THREE.Group();
      const h = new THREE.Mesh(new RoundedBoxGeometry(len, len * 0.08, len * 0.14, 2, len * 0.03), hull);
      h.position.y = len * 0.03;
      g.add(h);
      const sup = new THREE.Mesh(new THREE.BoxGeometry(len * 0.1, len * 0.12, len * 0.12), this.paint);
      sup.position.set(-len * 0.4, len * 0.12, 0);
      g.add(sup);
      if (boxes) {
        const cols = ['#8a3b2c', '#2f5470', '#b8892c', '#5d6b3a', '#7c7f84'];
        for (let i = 0; i < 9; i++) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(len * 0.075, len * 0.05, len * 0.12), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.7 }));
          c.position.set(-len * 0.28 + i * len * 0.08, len * 0.095, 0);
          g.add(c);
        }
      }
      g.position.set(x, SEA_Y, z);
      g.rotation.y = ry;
      s.add(g);
      this.lamp(x - Math.cos(ry) * len * 0.4, len * 0.2, z + Math.sin(ry) * len * 0.4, new THREE.Color(7, 6.4, 5), len * 0.006);
    };
    ship(1500, -7800, 190, 0.08, true);
    ship(-700, -2300, 22, -0.6, false);
    ship(6200, -12500, 140, -0.05, true);
  }

  /** a few gulls wheeling over the pad */
  private buildLife(): void {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.15, 1, 0.05, 0.1, 0, 0, 0.25, 1, 0.05, 0.1, 0.45, 0.02, 0.32, 0, 0, 0.25]), 3));
    wing.computeVertexNormals();
    const N = 16;
    this.birds = new THREE.InstancedMesh(wing, new THREE.MeshStandardMaterial({ color: '#d9d7d2', roughness: 0.8, side: THREE.DoubleSide }), N * 2);
    this.birds.frustumCulled = false;
    const r = prng(61);
    for (let i = 0; i < N; i++) this.birdData.push({ cx: -80 + r() * 220, cz: -120 + r() * 260, r: 30 + r() * 70, h: 40 + r() * 70, sp: (0.1 + r() * 0.12) * (r() < 0.5 ? 1 : -1), ph: r() * 6.28 });
    this.scene.add(this.birds);
  }

  private onBackground(e: Event): boolean {
    if (!this.active) return false;
    const t = e.target as HTMLElement | null;
    if (!t || !t.closest) return true;
    return !t.closest('button, input, select, label, a, .sx2-block, .mm-block, .modal-back, .modal, .mm-prog');
  }

  private bindControls(): void {
    window.addEventListener('pointerdown', (e) => {
      if (!this.onBackground(e)) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.userView = true;
      this.vYaw = this.vPitch = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      // the view turns the way you drag: right looks right, up looks up
      this.yaw -= dx * 0.004;
      this.pitch = clampN(this.pitch + dy * 0.003, 0.0, 1.2);
      this.vYaw = -dx * 0.12;
      this.vPitch = dy * 0.09;
    });
    const up = (e: PointerEvent) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.onBackground(e)) return;
        this.userView = true;
        this.zoom = clampN(this.zoom * Math.exp(clampN(e.deltaY, -120, 120) * 0.0015), ZOOM_MIN, ZOOM_MAX);
      },
      { passive: true },
    );
    window.addEventListener('dblclick', (e) => {
      if (!this.onBackground(e)) return;
      this.userView = false;
      this.yaw = -0.3;
      this.pitch = 0.06;
      this.zoom = 1;
    });
  }

  private birdM = new THREE.Matrix4();
  private birdQ = new THREE.Quaternion();
  private birdQ2 = new THREE.Quaternion();
  private birdE = new THREE.Euler();

  render(dt: number, w: number, h: number): void {
    // a frame step can arrive negative or huge (clock resets, tab switches); the smoothing below must never see that
    dt = Number.isFinite(dt) ? clampN(dt, 0, 0.1) : 0;
    this.t += dt;
    if (!this.drag) {
      this.yaw += this.userView ? this.vYaw * dt : Math.sin(this.t * 0.03) * dt * 0.012;
      this.pitch = clampN(this.pitch + this.vPitch * dt, 0.0, 1.2);
      const k = Math.exp(-dt * 3);
      this.vYaw *= k;
      this.vPitch *= k;
    }
    const a = 1 - Math.exp(-dt * 5);
    this.yawS += (this.yaw - this.yawS) * a;
    this.pitchS += (this.pitch - this.pitchS) * a;
    this.zoomS += (this.zoom - this.zoomS) * a;
    const d = 400 * this.zoomS;
    const tx = -4, ty = 82, tz = -8;
    const cp = Math.cos(this.pitchS);
    const p = this.camera.position;
    p.set(tx + Math.sin(this.yawS) * cp * d, ty + Math.sin(this.pitchS) * d, tz + Math.cos(this.yawS) * cp * d);
    p.y = Math.max(p.y, this.height(p.x, p.z) + 6);
    this.camera.lookAt(tx, ty, tz);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.setViewOffset(w, h, w > 900 ? -w * 0.05 : 0, 0, w, h);
    this.camera.updateProjectionMatrix();
    this.animate(dt);
    if (this.drawWith) this.drawWith(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  /** ground height of the scene at a point (for cameras) */
  groundAt(x: number, z: number): number {
    return Math.max(this.height(x, z), pad2Height(x, z), pad3Height(x, z));
  }

  /** Pad 2 (the Starship complex) */
  pad2: Pad2 | null = null;
  /** Pad 3 (Falcon) and the landing zones */
  pad3: Pad3 | null = null;
  /** fly from one of the pads: moves the exhaust to its trench */
  usePad(which: 1 | 2 | 3): void {
    if (which === 3 && this.pad3) this.exhaust = { ...this.pad3.exhaust, trench: this.pad3.exhaust.trench.clone(), mount: this.pad3.exhaust.mount.clone(), width: 12 };
    else this.useStarshipPad(which === 2);
    if (this.pad3) this.pad3.te.rotation.x = 0;
  }
  /** Pad 3's strongback: tilts back (0..1) as the rocket lifts off */
  setTe(k: number): void {
    if (this.pad3) this.pad3.te.rotation.x = 0.035 * clampN(k, 0, 1);
  }
  /** where the launch exhaust goes: Pad 1's trench by default */
  private exhaust = { trench: new THREE.Vector3(0, 2, -78), dir: new THREE.Vector3(0, 0, -1), mount: new THREE.Vector3(0, PAD_Y + 4, 0), ring: 14, width: 10 };
  /** fly from Pad 2 (Starship) or Pad 1 (Saturn V): moves the exhaust to that pad's trench */
  useStarshipPad(on: boolean): void {
    if (on && this.pad2) this.exhaust = { ...this.pad2.exhaust, trench: this.pad2.exhaust.trench.clone(), mount: this.pad2.exhaust.mount.clone(), width: 18 };
    else this.exhaust = { trench: new THREE.Vector3(0, 2, -78), dir: new THREE.Vector3(0, 0, -1), mount: new THREE.Vector3(0, PAD_Y + 4, 0), ring: 14, width: 10 };
    this.setQd(0);
  }
  /** Pad 2's ship quick-disconnect arm: 0 = at the ship, 1 = swung clear */
  setQd(k: number): void {
    if (this.pad2) this.pad2.qdArm.rotation.y = -1.25 * clampN(k, 0, 1);
  }

  /** hand the scene over to a flight: hide the standing rocket, reset the arms and the smoke */
  setFlying(on: boolean): void {
    this.flying = on;
    if (this.rocket) this.rocket.visible = !on;
    for (const sp of this.vapour) sp.visible = !on;
    this.setArms(0);
    for (const p of this.smoke) this.scene.remove(p.sp);
    this.smoke = [];
    (this.skyMat.uniforms.darken.value as number) = 0;
    this.skyMat.uniforms.darken.value = 0;
  }

  /** swing the service arms clear of the vehicle (0 = connected, 1 = retracted) */
  setArms(k: number): void {
    const kk = clampN(k, 0, 1);
    this.arms.forEach((g, i) => {
      g.rotation.y = -1.35 * Math.min(1, Math.max(0, kk * 1.4 - i * 0.05));
    });
  }

  /** draw the scene from a flight camera; fire (0..1) feeds the exhaust clouds round the mount */
  renderFlight(dt: number, cam: THREE.PerspectiveCamera, fire: number, vehicleY: number, altitude: number): void {
    dt = Number.isFinite(dt) ? clampN(dt, 0, 0.25) : 0;
    this.t += dt;
    this.skyMat.uniforms.darken.value = clampN((altitude - 3000) / 22000, 0, 1);
    this.updateSmoke(dt, fire, vehicleY);
    this.animate(dt);
    if (this.drawWith) this.drawWith(this.scene, cam);
    else this.renderer.render(this.scene, cam);
  }

  private updateSmoke(dt: number, fire: number, vehicleY: number): void {
    if (!this.smokeTex) {
      this.smokeTex = tex(
        canvas(128, 128, (g) => {
          const r = prng(5);
          for (let i = 0; i < 26; i++) {
            const x = 30 + r() * 68, y = 30 + r() * 68, rr = 14 + r() * 30;
            const gr = g.createRadialGradient(x, y, 0, x, y, rr);
            gr.addColorStop(0, 'rgba(255,255,255,0.35)');
            gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr;
            g.fillRect(0, 0, 128, 128);
          }
        }),
      );
    }
    // the exhaust pours out of the flame trench and boils up round the mount. Pad 2's
    // Super Heavy (33 engines, twice a Saturn V's thrust) throws a far bigger cloud: a jet of
    // fire out of the trench mouth, steam and dust towering over the tower, and a ring of
    // dust that rolls out across the apron.
    const ex = this.exhaust;
    const big = ex.width > 12;
    const near = fire * clampN(1 - (vehicleY - ROCKET_Y) / (big ? 420 : 260), 0, 1);
    const cap = big ? 760 : 320;
    this.smokeAcc += dt * near * (big ? 120 : 45);
    while (this.smokeAcc > 1 && this.smoke.length < cap) {
      this.smokeAcc -= 1;
      const r = Math.random();
      const mat = new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0, fog: true, rotation: Math.random() * 6.28 });
      const sp = new THREE.Sprite(mat);
      let pos: THREE.Vector3, v: THREE.Vector3;
      let s0 = 10 + Math.random() * 10, grow = 6 + Math.random() * 6, life = 14 + Math.random() * 16, isFire = false;
      // what it is made of: grey smoke out of the trench, white steam off the deluge, brown dust off the ground
      let c: [number, number, number] = [0.78, 0.72, 0.68];
      const tone = 0.88 + Math.random() * 0.24;
      const side = new THREE.Vector3(-ex.dir.z, 0, ex.dir.x);
      if (big && r < 0.16) {
        // the fire itself, blasting out of the trench mouth
        isFire = true;
        mat.blending = THREE.AdditiveBlending;
        pos = ex.trench.clone().addScaledVector(side, (Math.random() - 0.5) * ex.width * 0.8).add(new THREE.Vector3(0, 2 + Math.random() * 6, 0));
        v = ex.dir.clone().multiplyScalar(140 + Math.random() * 90).addScaledVector(side, (Math.random() - 0.5) * 40).add(new THREE.Vector3(0, 8 + Math.random() * 14, 0));
        s0 = 14 + Math.random() * 10;
        grow = 26 + Math.random() * 14;
        life = 0.7 + Math.random() * 0.8;
      } else if (r < (big ? 0.6 : 0.55)) {
        // out of the trench mouth, rolling away toward the sea
        pos = ex.trench.clone().addScaledVector(side, (Math.random() - 0.5) * ex.width);
        const sp0 = big ? 90 + Math.random() * 80 : 45 + Math.random() * 40;
        v = ex.dir.clone().multiplyScalar(sp0).addScaledVector(side, (Math.random() - 0.5) * (big ? 60 : 18)).add(new THREE.Vector3(0, (big ? 10 : 6) + Math.random() * (big ? 22 : 10), 0));
        if (big) {
          s0 = 26 + Math.random() * 18;
          grow = 13 + Math.random() * 12;
          life = 22 + Math.random() * 22;
          c = [0.7 * tone, 0.66 * tone, 0.62 * tone];
        }
      } else if (big && r < 0.8) {
        // the shock of ignition throws dust off the apron in a ring that rolls outward
        const a = Math.random() * Math.PI * 2;
        const rr = 40 + Math.random() * 60;
        pos = new THREE.Vector3(ex.mount.x + Math.cos(a) * rr, 4, ex.mount.z + Math.sin(a) * rr);
        const out = 30 + Math.random() * 40;
        v = new THREE.Vector3(Math.cos(a) * out, 2 + Math.random() * 5, Math.sin(a) * out);
        s0 = 18 + Math.random() * 12;
        grow = 8 + Math.random() * 8;
        life = 16 + Math.random() * 16;
        c = [0.62 * tone, 0.52 * tone, 0.4 * tone];
      } else {
        // boiling up round the mount (and, on Pad 2, the deluge water flashing to steam)
        const a = Math.random() * Math.PI * 2;
        pos = new THREE.Vector3(ex.mount.x + Math.cos(a) * ex.ring, ex.mount.y, ex.mount.z + Math.sin(a) * ex.ring);
        const out = big ? 24 + Math.random() * 40 : 14 + Math.random() * 22;
        v = new THREE.Vector3(Math.cos(a) * out, (big ? 8 : 4) + Math.random() * (big ? 26 : 12), Math.sin(a) * out);
        if (big) {
          s0 = 24 + Math.random() * 16;
          grow = 12 + Math.random() * 10;
          life = 20 + Math.random() * 20;
          c = [0.86 * tone, 0.86 * tone, 0.85 * tone];
        }
      }
      sp.position.copy(pos);
      this.scene.add(sp);
      this.smoke.push({ sp, v, age: 0, life, s0, grow, fire: isFire, c });
    }
    const mount = new THREE.Vector3(ex.mount.x, vehicleY - 10, ex.mount.z);
    for (const p of this.smoke) {
      p.age += dt;
      const k = p.age / p.life;
      const m = p.sp.material as THREE.SpriteMaterial;
      if (p.fire) {
        p.v.multiplyScalar(Math.exp(-dt * 1.6));
        p.sp.position.addScaledVector(p.v, dt);
        const s = p.s0 + p.age * p.grow;
        p.sp.scale.set(s, s, 1);
        // white-hot at the mouth, cooling through orange to a dull red as it spreads
        m.opacity = Math.min(1, p.age * 12) * (1 - k) * (1 - k) * 0.9 * Math.min(1, fire * 1.5);
        m.color.setRGB(3.2 - k * 1.2, 1.9 - k * 1.3, 0.8 - k * 0.7);
        continue;
      }
      p.v.multiplyScalar(Math.exp(-dt * 0.45));
      p.v.y += dt * 2.2;
      p.sp.position.addScaledVector(p.v, dt);
      if (p.sp.position.y < 2) p.sp.position.y = 2;
      const s = p.s0 + p.age * p.grow;
      p.sp.scale.set(s, s, 1);
      m.opacity = Math.min(1, p.age * 2) * (1 - k) * 0.85;
      // lit orange by the fire while it burns close by, then plain sunlit white-grey
      const glow = fire * Math.exp(-p.sp.position.distanceTo(mount) / (big ? 160 : 90));
      const c = p.c ?? [0.78, 0.72, 0.68];
      m.color.setRGB(c[0] + glow * 3.2, c[1] + glow * 1.8, c[2] + glow * 0.6);
    }
    const dead = this.smoke.filter((p) => p.age > p.life);
    for (const p of dead) {
      this.scene.remove(p.sp);
      p.sp.material.dispose();
    }
    this.smoke = this.smoke.filter((p) => p.age <= p.life);
  }

  private animate(dt: number): void {
    this.skyMat.uniforms.time.value = this.t;
    this.oceanMat.uniforms.time.value = this.t;
    this.groundTime.value = this.t;
    for (const c of this.traffic) {
      c.x += c.dir * c.v * dt;
      if (c.x > 3000) c.x = -3000;
      if (c.x < -3000) c.x = 3000;
      this.birdM.compose(new THREE.Vector3(c.x, 0.3, c.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.dir > 0 ? 0 : Math.PI), new THREE.Vector3(1, 1, 1));
      this.fleet.setMatrix(c.i, this.birdM);
    }
    const on = Math.sin(this.t * 3.2) > 0.3;
    for (const b of this.blinkers) b.visible = on;
    for (const sp of this.steam) {
      const ph = (this.t * 0.06 + sp.userData.phase) % 1;
      sp.position.set(sp.userData.x + ph * 18, 52 + ph * 26, -40 + ph * 6);
      const sc = 5 + ph * 22;
      sp.scale.set(sc, sc, 1);
      (sp.material as THREE.SpriteMaterial).opacity = 0.22 * Math.sin(ph * Math.PI);
    }
    for (const sp of this.vapour) {
      if (this.flying) break;
      const u = sp.userData as { x: number; y: number; phase: number; side: number; k: number };
      const ph = (this.t * 0.11 + u.phase) % 1;
      sp.position.set(u.x + u.side * ph * 9, u.y - ph * 7, 1.5 + ph * 6);
      const sc = (2 + ph * 9) * u.k;
      sp.scale.set(sc, sc, 1);
      (sp.material as THREE.SpriteMaterial).opacity = 0.5 * Math.sin(ph * Math.PI) * u.k;
    }
    // gulls: long glides broken by a few wingbeats
    const bm = this.birdM, q = this.birdQ, q2 = this.birdQ2, e = this.birdE;
    const one = new THREE.Vector3(1.3, 1.3, 1.3), mirror = new THREE.Vector3(-1.3, 1.3, 1.3);
    this.birdData.forEach((b, i) => {
      const ang = b.ph + this.t * b.sp;
      const pos = new THREE.Vector3(b.cx + Math.cos(ang) * b.r, b.h + Math.sin(this.t * 0.3 + b.ph) * 5, b.cz + Math.sin(ang) * b.r);
      const sg = Math.sign(b.sp);
      const heading = Math.atan2(Math.sin(ang) * sg, -Math.cos(ang) * sg);
      const beat = Math.sin(this.t * 0.4 + b.ph * 3) > 0.4 ? Math.sin(this.t * 7 + b.ph) * 0.55 : 0.12;
      q.setFromEuler(e.set(0, heading, -0.25 * Math.sign(b.sp), 'YXZ'));
      q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), beat);
      bm.compose(pos, q.clone().multiply(q2), one);
      this.birds.setMatrixAt(i * 2, bm);
      q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -beat);
      bm.compose(pos, q.clone().multiply(q2), mirror);
      this.birds.setMatrixAt(i * 2 + 1, bm);
    });
    this.birds.instanceMatrix.needsUpdate = true;
  }
}
