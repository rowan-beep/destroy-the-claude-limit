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
  float calm = mix(0.55, 1.0, smoothstep(0.0, 120.0, out_));
  vec3 N = normalize(vec3(s.x * 0.55 * calm, 1.0, s.y * 0.55 * calm));
  float nv = max(dot(N, V), 0.02);
  float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.004;
  vec3 refl = addClouds(normalize(R), skyClear(normalize(R), sd), sd, 0.0) * 0.68;
  // the water itself: deep blue-green, sandy and clear in the shallows
  vec3 body = vec3(0.012, 0.045, 0.07);
  float shallow = exp(-max(out_, 0.0) / 26.0);
  body = mix(body, vec3(0.2, 0.24, 0.18), shallow * 0.85);
  vec3 col = mix(body, refl, F);
  // the glitter path: the low sun on the moving facets, rougher with distance as the waves blur together
  vec3 H = normalize(sd + V);
  float nh = max(dot(N, H), 0.0);
  float a = mix(0.05, 0.2, smoothstep(150.0, 9000.0, dist));
  float a2 = a * a;
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dd * dd);
  col += vec3(1.9, 1.0, 0.4) * D * F / (4.0 * nv) * 0.07 * smoothstep(-0.03, 0.02, dot(sd, N));
  // surf breaking on the beach, in lines rolling in
  float wob = noise(vec2(vW.x * 0.012, t * 0.05)) * 6.0;
  float lines = smoothstep(0.82, 1.0, sin(out_ * 0.09 + t * 0.85 + wob)) * exp(-max(out_, 0.0) / 70.0);
  float swash = 1.0 - smoothstep(0.0, 9.0 + wob, out_);
  float foam = clamp((lines * 0.9 + swash) * (0.55 + 0.6 * noise(p * 0.35 + t * 0.2)), 0.0, 1.0);
  col = mix(col, vec3(0.95, 0.82, 0.74), foam * 0.85);
  // aerial perspective into the horizon
  float hz = 1.0 - exp(-pow(dist * ${HAZE.toExponential()}, 2.0));
  col = mix(col, horizonCol(-V, sd), hz) * SKYK;
  gl_FragColor = vec4(col, 1.0);
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
  private birds!: THREE.InstancedMesh;
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
      uniforms: { sunDir: { value: this.sunDir.clone() }, time: { value: 0 } },
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
    h *= Math.min(flat(-20, 20, 270, 170, 80), flat(450, 80, 230, 150, 70), flat(0, 205, 99999, 16, 40), flat(-1400, 720, 160, 140, 90));
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
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.gDetail = { value: detail };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGw;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGw;\nuniform sampler2D gDetail;').replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 g1 = texture2D(gDetail, vGw.xz / 7.0).rgb;
        vec3 g2 = texture2D(gDetail, vGw.xz / 61.0).rgb;
        vec3 g3 = texture2D(gDetail, vGw.xz / 530.0).rgb;
        float gFar = smoothstep(250.0, 2600.0, length(vGw - cameraPosition));
        diffuseColor.rgb *= mix(0.74 + 0.52 * g1.r, 1.0, gFar) * (0.8 + 0.4 * g2.g) * (0.84 + 0.32 * g3.b);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.95, 0.78), smoothstep(0.55, 0.8, g2.b) * 0.6);`,
      );
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
    this.buildTower();
    this.buildTankFarm();
    this.buildCrane();
    this.buildRoadAndYard();
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
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const cl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 1.4), this.steel);
      cl.position.set(Math.cos(a) * R, deck + 2.2, Math.sin(a) * R);
      cl.rotation.y = -a;
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
    // swing arms reaching to where the vehicle will stand
    for (const [y, len] of [[118, 22], [96, 22], [62, 20], [30, 18]] as [number, number][]) {
      for (const dz of [-2, 2]) {
        b.add(V(-half, y, dz), V(-half - len, y, dz * 0.6), 1.2, 1.8);
        b.add(V(-half, y + 4, dz), V(-half - len * 0.85, y, dz * 0.6), 0.5);
      }
      b.box(cx - half - len, y0 + y, cz, 2.5, 2.6, 5);
    }
    b.box(cx + half + 1.4, y0 + Ht / 2, cz, 2.6, Ht, 2.6);
    b.add(V(0, Ht + 4, 0), V(0, Ht + 30, 0), 0.5);
    s.add(b.build(this.steel));
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

  private buildCrane(): void {
    const s = this.scene;
    const yellow = new THREE.MeshStandardMaterial({ color: '#d39a1c', roughness: 0.45, metalness: 0.35 });
    const g = new THREE.Group();
    for (const dz of [-4, 4]) {
      const track = new THREE.Mesh(new RoundedBoxGeometry(14, 2.4, 2.4, 2, 0.5), this.darkSteel);
      track.position.set(0, 1.2, dz);
      track.castShadow = true;
      g.add(track);
    }
    const house = new THREE.Mesh(new RoundedBoxGeometry(9, 4.5, 6, 2, 0.3), yellow);
    house.position.set(-1, 4.8, 0);
    house.castShadow = true;
    g.add(house);
    const counter = new THREE.Mesh(new RoundedBoxGeometry(3, 4, 7, 2, 0.3), this.darkSteel);
    counter.position.set(-6, 4.6, 0);
    g.add(counter);
    const boom = new Beams();
    const len = 120, ang = THREE.MathUtils.degToRad(72);
    const tip = new THREE.Vector3(3 + Math.cos(ang) * len, 6 + Math.sin(ang) * len, 0);
    for (const dz of [-1.4, 1.4]) for (const dy of [-1.4, 1.4]) boom.add(new THREE.Vector3(3, 6 + dy, dz), tip.clone().add(new THREE.Vector3(0, dy * 0.3, dz * 0.3)), 0.45);
    for (let k = 1; k < 30; k++) {
      const p0 = new THREE.Vector3(3, 6, 0).lerp(tip, (k - 1) / 30);
      const p1 = new THREE.Vector3(3, 6, 0).lerp(tip, k / 30);
      boom.add(p0.clone().add(new THREE.Vector3(0, 1.3, -1.3)), p1.clone().add(new THREE.Vector3(0, -1.3, 1.3)), 0.18);
      boom.add(p0.clone().add(new THREE.Vector3(0, -1.3, -1.3)), p1.clone().add(new THREE.Vector3(0, 1.3, 1.3)), 0.18);
    }
    boom.add(new THREE.Vector3(-5, 9, 0), tip, 0.12);
    boom.add(tip, tip.clone().add(new THREE.Vector3(0, -38, 0)), 0.1);
    g.add(boom.build(yellow));
    const hook = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.6), yellow);
    hook.position.copy(tip).add(new THREE.Vector3(0, -39, 0));
    g.add(hook);
    g.position.set(110, PAD_Y, 40);
    g.rotation.y = 2.5;
    s.add(g);
    const tipW = tip.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 2.5).add(g.position);
    this.lamp(tipW.x, tipW.y + 1, tipW.z, new THREE.Color(7, 0.4, 0.25), 0.6, true);
    const mob = new THREE.Group();
    const cab = new THREE.Mesh(new RoundedBoxGeometry(10, 2.6, 3, 2, 0.4), yellow);
    cab.position.y = 2;
    cab.castShadow = true;
    mob.add(cab);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 22), yellow);
    arm.position.set(0, 9, -6);
    arm.rotation.x = 0.7;
    arm.castShadow = true;
    mob.add(arm);
    mob.position.set(-40, 0, 75);
    mob.rotation.y = 0.8;
    s.add(mob);
  }

  private building(x: number, z: number, w: number, d: number, h: number, base: string, lit: boolean, ry = 0): void {
    const s = this.scene;
    const g = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ map: this.corrugated(base, Math.max(1, Math.round(w / 6))), roughness: 0.55, metalness: 0.35 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.25), wall);
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.5, d + 0.8), this.darkSteel);
    roof.position.y = h + 0.25;
    roof.castShadow = true;
    g.add(roof);
    const r = prng(Math.round(x * 13 + z));
    for (let i = 0; i < Math.max(1, Math.round(w / 14)); i++) {
      const u = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 2), this.steel);
      u.position.set((r() - 0.5) * (w - 4), h + 1.1, (r() - 0.5) * (d - 3));
      u.castShadow = true;
      g.add(u);
    }
    const doorMat = new THREE.MeshStandardMaterial({ color: '#2c2f34', roughness: 0.6, metalness: 0.4 });
    const nd = Math.max(1, Math.floor(w / 18));
    for (let i = 0; i < nd; i++) {
      const dw = Math.min(6, w * 0.3), dh = Math.min(h * 0.7, 5.5);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), doorMat);
      door.position.set(-w / 2 + ((i + 0.5) * w) / nd, dh / 2, d / 2 + 0.03);
      g.add(door);
    }
    if (lit) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 1.0), toneMapped: false }));
      win.position.set(0, h * 0.72, d / 2 + 0.04);
      g.add(win);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    s.add(g);
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
    const carCols = ['#e8e8e8', '#2b2d31', '#a9b0b8', '#8c1d1d', '#e8e8e8', '#1f3a66', '#d9d9d9', '#555a60'];
    const carBody = new RoundedBoxGeometry(4.6, 1.2, 1.9, 2, 0.35);
    const carTop = new RoundedBoxGeometry(2.6, 0.8, 1.7, 2, 0.3);
    const glass = new THREE.MeshStandardMaterial({ color: '#1d242c', roughness: 0.05, metalness: 0.7 });
    const paints = carCols.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.6 }));
    const car = (x: number, z: number, ry: number, lights = false) => {
      const b = new THREE.Mesh(carBody, paints[Math.floor(rnd() * paints.length)]);
      b.position.set(x, 0.85, z);
      b.rotation.y = ry;
      b.castShadow = true;
      s.add(b);
      const t = new THREE.Mesh(carTop, glass);
      t.position.set(x, 1.8, z);
      t.rotation.y = ry;
      s.add(t);
      if (lights) {
        this.lamp(x + 2.35, 0.9, z - 0.6, new THREE.Color(5, 4.6, 3.6), 0.18);
        this.lamp(x + 2.35, 0.9, z + 0.6, new THREE.Color(5, 4.6, 3.6), 0.18);
      }
    };
    for (let i = 0; i < 40; i++) car(-230 + i * 6.5 + rnd() * 2, 188 + (i % 2) * 3, 0);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) if (rnd() < 0.75) car(80 + i * 3.2, 250 + r * 7, Math.PI / 2);
    for (let i = 0; i < 8; i++) car(-420 + i * 130 + rnd() * 30, 201 + (i % 2) * 7, 0, true);
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
    for (const [x, z] of [[60, 240], [122, 236], [70, 284], [150, 270], [-20, 262], [-90, 250], [200, 245]] as [number, number][]) {
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
      this.yaw += dx * 0.004;
      this.pitch = clampN(this.pitch + dy * 0.003, 0.0, 1.2);
      this.vYaw = dx * 0.12;
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
    const d = 520 * this.zoomS;
    const tx = -10, ty = 95, tz = -14;
    const cp = Math.cos(this.pitchS);
    const p = this.camera.position;
    p.set(tx + Math.sin(this.yawS) * cp * d, ty + Math.sin(this.pitchS) * d, tz + Math.cos(this.yawS) * cp * d);
    p.y = Math.max(p.y, this.height(p.x, p.z) + 6);
    this.camera.lookAt(tx, ty, tz);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.setViewOffset(w, h, w > 900 ? -w * 0.05 : 0, 0, w, h);
    this.camera.updateProjectionMatrix();
    this.skyMat.uniforms.time.value = this.t;
    this.oceanMat.uniforms.time.value = this.t;
    const on = Math.sin(this.t * 3.2) > 0.3;
    for (const b of this.blinkers) b.visible = on;
    for (const sp of this.steam) {
      const ph = (this.t * 0.06 + sp.userData.phase) % 1;
      sp.position.set(sp.userData.x + ph * 18, 52 + ph * 26, -40 + ph * 6);
      const sc = 5 + ph * 22;
      sp.scale.set(sc, sc, 1);
      (sp.material as THREE.SpriteMaterial).opacity = 0.22 * Math.sin(ph * Math.PI);
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
    if (this.drawWith) this.drawWith(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }
}
