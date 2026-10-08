// The universe on screen: Earth at full scale with procedural continents,
// oceans that catch the Sun, ice caps, city lights on the night side and a
// drifting cloud deck; a physically based atmosphere (Rayleigh and Mie single
// scattering) that paints the blue limb, the sky from the ground and sunsets
// at the terminator; the Sun; and a sky of thousands of stars with the band of
// the Milky Way. Everything is drawn around the vehicle (a floating origin),
// so the 6,371 km planet and a 110 m rocket share one scene without jitter.

import * as THREE from 'three';
import { MoonView } from './moonView';
import { StarSky } from './solar/sky';
import { hiresTexture } from '../render/hires';
import { MOON, moonPos, EARTH, Body, V3, CONTINENT_GLSL, ecefDir, enu, PAD, orbitPoint, Orbit, descendingAnomaly, len, sub } from './universe';

const RP_KM = EARTH.R / 1000;
const RA_KM = RP_KM + 100;

const SCATTER_GLSL = /* glsl */ `
const float RP = ${RP_KM.toFixed(1)}, RA = ${RA_KM.toFixed(1)};
const vec3 KR = vec3(5.5e-3, 13.0e-3, 22.4e-3);
const float KM = 9e-3, HR = 8.0, HM = 1.2, GMIE = 0.76;
vec2 rsi(vec3 r0, vec3 rd, float sr) {
  float b = dot(rd, r0);
  float c = dot(r0, r0) - sr * sr;
  float d = b * b - c;
  if (d < 0.0) return vec2(1e9, -1e9);
  float s = sqrt(d);
  return vec2(-b - s, -b + s);
}
// optical depth from p toward the sun (Rayleigh, Mie); large if the planet is in the way
vec2 sunDepth(vec3 p, vec3 sd) {
  vec2 ls = rsi(p, sd, RA);
  float dl = max(ls.y, 0.0) / 6.0;
  vec2 od = vec2(0.0);
  for (int j = 0; j < 6; j++) {
    // the height along the sunward ray, floored so a ray grazing the planet piles up depth smoothly
    float hq = max(length(p + sd * ((float(j) + 0.5) * dl)) - RP, -1.5);
    od += vec2(exp(-hq / HR), exp(-hq / HM)) * dl;
  }
  // the planet's own shadow, with a soft edge rather than a hard step
  float along = dot(p, sd);
  float perp = length(p - sd * along);
  float shade = along > 0.0 ? 1.0 : smoothstep(RP - 25.0, RP + 8.0, perp);
  return od + vec2(400.0, 400.0) * (1.0 - shade);
}
vec3 sunTrans(vec3 p, vec3 sd) {
  vec2 od = sunDepth(p, sd);
  return exp(-(KR * od.x + KM * 1.1 * od.y));
}
// single scattering along ro + rd * t, t in [ta, tb] (km); T is the transmittance
vec3 scatter(vec3 ro, vec3 rd, float ta, float tb, vec3 sd, out vec3 T) {
  const int IS = 16;
  float ds = max(tb - ta, 0.0) / float(IS);
  // a different offset for every pixel, so the samples' steps dissolve instead of banding
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 tR = vec3(0.0), tM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  float mu = dot(rd, sd);
  float mumu = mu * mu;
  float gg = GMIE * GMIE;
  float pR = 3.0 / (16.0 * PI) * (1.0 + mumu);
  float pM = 3.0 / (8.0 * PI) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * GMIE, 1.5) * (2.0 + gg));
  for (int i = 0; i < IS; i++) {
    vec3 p = ro + rd * (ta + (float(i) + jit) * ds);
    float h = max(length(p) - RP, 0.0);
    float dR = exp(-h / HR) * ds, dM = exp(-h / HM) * ds;
    odR += dR;
    odM += dM;
    vec2 l = sunDepth(p, sd);
    vec3 att = exp(-(KR * (odR + l.x) + KM * 1.1 * (odM + l.y)));
    tR += dR * att;
    tM += dM * att;
  }
  T = exp(-(KR * odR + KM * 1.1 * odM));
  return 9.0 * (pR * KR * tR + pM * KM * tM);
}
`;

const EARTH_VERT = /* glsl */ `
varying vec3 vP;
varying vec3 vWN;
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vP = normalize(position);
  vWN = normalize(mat3(modelMatrix) * vP);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

const EARTH_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 camKm;
uniform vec3 padDir;
uniform vec3 padE;
uniform float camAlt;
uniform sampler2D dayTex;
uniform sampler2D nightTex;
uniform float dayK;
uniform float nightK;
varying vec3 vP;
varying vec3 vWN;
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_fragment>
${CONTINENT_GLSL}
${SCATTER_GLSL}
// the real maps: equirectangular from 180 W (Earth-fixed d: lat = asin(y), lon = atan2(-z, x))
vec2 uvEarth(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(-d.z, d.x);
  return vec2(lon / (2.0 * PI) + 0.5, 0.5 + lat / PI);
}
// (sampled with the wrap at 180 degrees taken out of the derivatives: no seam)
vec4 texEarth(sampler2D t, vec2 uv) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  return textureGrad(t, uv, dx, dy);
}
float continentH(vec3 d) {
  float s = 0.0, a = 0.5, f = 1.6;
  for (int k = 0; k < 9; k++) { s += a * vnoise3(d * f + vec3(11.3, 4.1, -7.7)); f *= 2.07; a *= 0.5; }
  float h = (s - 0.535) * 2.4;
  float tw = length(d - (padDir - padE * 0.022));
  float te = length(d - (padDir + padE * 0.075));
  float tc = length(d - (padDir + padE * 0.012));
  h += 0.7 * exp(-pow(tw / 0.024, 2.0)) - 1.3 * exp(-pow(te / 0.07, 2.0)) - 0.6 * exp(-pow(tc / 0.011, 2.0));
  return h;
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vP);
  vec3 N = normalize(vWN);
  vec3 sd = normalize(sunDir);
  float h = continentH(d);
  float alat = abs(asin(clamp(d.y, -1.0, 1.0))) * 57.2958;
  // fine texture, faded with distance so it never shimmers
  float fade = 1.0 - smoothstep(30000.0, 900000.0, camAlt);
  float det = vnoise3(d * 1500.0) * 0.5 + vnoise3(d * 5200.0) * 0.3 * fade + vnoise3(d * 17000.0) * 0.2 * fade;
  float hum = vnoise3(d * 6.0 + 3.0) * 0.6 + vnoise3(d * 23.0) * 0.4;
  vec3 albedo;
  float water = step(h, 0.0);
  if (h > 0.0) {
    vec3 forest = vec3(0.03, 0.06, 0.025), grass = vec3(0.1, 0.12, 0.05), desert = vec3(0.42, 0.32, 0.2);
    vec3 tundra = vec3(0.3, 0.27, 0.22), rock = vec3(0.32, 0.29, 0.26), snow = vec3(0.85, 0.88, 0.92);
    float desertBand = exp(-pow((alat - 24.0) / 9.0, 2.0));
    albedo = mix(forest, grass, smoothstep(0.45, 0.8, hum));
    albedo = mix(albedo, vec3(0.13, 0.1, 0.06), smoothstep(0.55, 0.75, vnoise3(d * 40.0 + 2.0)) * 0.6);
    albedo = mix(albedo, desert, clamp(desertBand * 1.9 * (1.0 - hum) - 0.25, 0.0, 1.0));
    albedo = mix(albedo, tundra, smoothstep(52.0, 66.0, alat));
    albedo = mix(albedo, rock, smoothstep(0.38, 0.62, h));
    albedo = mix(albedo, snow, max(smoothstep(0.66, 0.8, h), smoothstep(66.0, 74.0, alat + hum * 8.0)));
    albedo = mix(albedo, albedo * vec3(1.15, 1.1, 0.9), smoothstep(0.0, 0.03, h) * (1.0 - smoothstep(0.03, 0.08, h)) * 0.6);
    albedo *= 0.72 + 0.56 * det;
  } else {
    albedo = mix(vec3(0.006, 0.022, 0.055), vec3(0.02, 0.1, 0.12), smoothstep(-0.09, 0.0, h));
    albedo = mix(albedo, vec3(0.8, 0.85, 0.9), smoothstep(73.0, 78.0, alat + hum * 5.0));
  }
  // NASA's Blue Marble, once loaded: the real Earth (the painted one stays as the fallback)
  vec2 uvE = uvEarth(d);
  if (dayK > 0.5) {
    vec3 tc = texEarth(dayTex, uvE).rgb;
    float lum = dot(tc, vec3(0.3, 0.55, 0.15));
    // the sea: blue well above red and green (and not ice)
    float wq = tc.b / (max(tc.r, tc.g) + 0.003);
    water = smoothstep(1.2, 1.7, wq) * (1.0 - smoothstep(0.3, 0.45, lum));
    h = water > 0.5 ? -0.1 : 0.1;
    // a little deeper, as from orbit through the haze (the map is graded for the page)
    albedo = tc * mix(vec3(0.92, 0.95, 1.0), vec3(0.55, 0.75, 1.0), water);
    albedo *= mix(1.0, 0.8 + 0.4 * det, fade * (1.0 - water));
  }
  vec3 pKm = d * RP;
  vec3 sunC = sunTrans(pKm + N * 0.05, sd);
  float ndl = dot(N, sd);
  vec3 col = albedo * sunC * max(ndl, 0.0) * 2.4;
  // a little skylight in the shade near the terminator
  col += albedo * vec3(0.15, 0.25, 0.45) * smoothstep(-0.15, 0.25, ndl) * 0.25;
  // the sun on the sea
  vec3 V = normalize(cameraPosition - vWorld);
  if (water > 0.5 && ndl > 0.0) {
    vec3 H = normalize(V + sd);
    float nh = max(dot(N, H), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    col += sunC * (pow(nh, 900.0) * 6.0 + pow(nh, 90.0) * 0.6) * (0.3 + fres) * smoothstep(0.0, 0.1, ndl);
    col += vec3(0.05, 0.12, 0.2) * fres * sunC * 0.6;
  }
  // city lights on the night side: NASA's Black Marble where loaded
  if (nightK > 0.5) {
    float night = 1.0 - smoothstep(-0.12, 0.04, ndl);
    float L = texEarth(nightTex, uvE).r;
    col += vec3(1.0, 0.7, 0.36) * pow(L, 1.8) * 1.6 * night;
  } else if (h > 0.0) {
    float night = 1.0 - smoothstep(-0.12, 0.04, ndl);
    float towns = smoothstep(0.78, 0.92, vnoise3(d * 620.0)) * smoothstep(0.5, 0.78, vnoise3(d * 37.0 + 9.0)) * (1.0 - smoothstep(55.0, 62.0, alat));
    float coast = 1.0 - smoothstep(0.0, 0.12, h);
    col += vec3(1.0, 0.68, 0.32) * towns * (0.4 + coast) * night * 0.9;
  }
  // the view through the air
  vec3 rd = normalize(pKm - camKm);
  float tb = length(pKm - camKm);
  vec2 at = rsi(camKm, rd, RA);
  float ta = max(at.x, 0.0);
  vec3 T;
  vec3 ins = scatter(camKm, rd, ta, min(tb, max(at.y, ta)), sd, T);
  col = col * T + ins;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 camKm;
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_fragment>
${SCATTER_GLSL}
void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vWorld - cameraPosition);
  vec2 at = rsi(camKm, rd, RA);
  if (at.y < 0.0) discard;
  float ta = max(at.x, 0.0);
  float tb = at.y;
  vec2 pl = rsi(camKm, rd, RP);
  if (pl.x > 0.0) tb = min(tb, pl.x);
  vec3 T;
  vec3 ins = scatter(camKm, rd, ta, tb, normalize(sunDir), T);
  gl_FragColor = vec4(ins, (T.r + T.g + T.b) / 3.0);
}`;

const CLOUD_FRAG = /* glsl */ `
uniform vec3 sunDir;
uniform float time;
uniform float camAlt;
uniform sampler2D cloudTex;
uniform float cloudK;
varying vec3 vP;
varying vec3 vWN;
varying vec3 vWorld;
#include <common>
#include <logdepthbuf_pars_fragment>
${CONTINENT_GLSL}
${SCATTER_GLSL}
// the real maps: equirectangular from 180 W (Earth-fixed d: lat = asin(y), lon = atan2(-z, x))
vec2 uvEarth(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(-d.z, d.x);
  return vec2(lon / (2.0 * PI) + 0.5, 0.5 + lat / PI);
}
// (sampled with the wrap at 180 degrees taken out of the derivatives: no seam)
vec4 texEarth(sampler2D t, vec2 uv) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  return textureGrad(t, uv, dx, dy);
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vP);
  vec3 q = d * 3.2 + vec3(time * 0.0004, 0.0, -time * 0.0002);
  float n = 0.0, a = 0.5;
  for (int k = 0; k < 7; k++) { n += a * vnoise3(q); q = q * 2.13 + vec3(3.1, 1.7, 5.2); a *= 0.5; }
  float lat = asin(clamp(d.y, -1.0, 1.0));
  // the trade-wind belts are clearer, the storm tracks cloudier
  float belt = 0.08 * cos(lat * 6.0) - 0.04;
  float cov = smoothstep(0.55 + belt, 0.76 + belt, n);
  // the real cloud cover, once loaded, with the painted noise for texture close up
  if (cloudK > 0.5) {
    float c = texEarth(cloudTex, uvEarth(d)).r;
    float near = 1.0 - smoothstep(4.0e5, 3.0e6, camAlt);
    cov = smoothstep(0.12, 0.7, c) * mix(1.0, 0.65 + 0.7 * n, near * 0.8);
  }
  if (cov < 0.01) discard;
  vec3 N = normalize(vWN);
  vec3 sd = normalize(sunDir);
  float ndl = dot(N, sd);
  vec3 sunC = sunTrans(d * (RP + 7.0), sd);
  vec3 col = vec3(1.0) * sunC * (max(ndl, 0.0) * 1.9 + smoothstep(-0.1, 0.2, ndl) * 0.1) * (0.75 + 0.25 * n);
  // seen edge-on from orbit, clouds fade into the haze of the limb
  vec3 V = normalize(cameraPosition - vWorld);
  float edge = smoothstep(0.0, 0.25, dot(N, V));
  gl_FragColor = vec4(col, cov * 0.92 * mix(0.35, 1.0, edge));
}`;

const STAR_VERT = /* glsl */ `
attribute float size;
attribute vec3 color;
varying vec3 vC;
void main() {
  vC = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  #ifdef USE_REVERSED_DEPTH_BUFFER
  gl_Position.z = 0.0;
  #else
  gl_Position.z = gl_Position.w * 0.999999;
  #endif
  gl_PointSize = size;
}`;
const STAR_FRAG = /* glsl */ `
uniform float bright;
varying vec3 vC;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  gl_FragColor = vec4(vC * exp(-r * 3.5) * bright, 1.0);
}`;
const MILKY_FRAG = /* glsl */ `
uniform vec3 gPole;
uniform float bright;
varying vec3 vDir;
${CONTINENT_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float b = dot(d, gPole);
  float band = exp(-pow(b / 0.16, 2.0));
  float n = vnoise3(d * 6.0) * 0.5 + vnoise3(d * 15.0) * 0.3 + vnoise3(d * 40.0) * 0.2;
  float dust = smoothstep(0.45, 0.7, vnoise3(d * 9.0 + 4.0)) * exp(-pow(b / 0.04, 2.0));
  vec3 c = vec3(0.6, 0.62, 0.75) * band * (0.4 + n) * (1.0 - dust * 0.7) * 0.045;
  gl_FragColor = vec4(c * bright, 1.0);
}`;

export interface ViewState {
  /** vehicle centre of mass, ECI (the scene's origin) */
  origin: V3;
  /** camera position relative to the origin, ECI */
  cam: V3;
  camUp: V3;
  look: V3;
  earthAngle: number;
  time: number;
}

export class SpaceScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.5, 6e9);
  private moon: MoonView;
  readonly earth: THREE.Mesh;
  private clouds: THREE.Mesh;
  private sky: THREE.Mesh;
  private skyGroup = new THREE.Group();
  private sun: THREE.Sprite;
  private sunGlow: THREE.Sprite;
  readonly sunLight: THREE.DirectionalLight;
  private earthshine: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;
  private earthMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private skyMat: THREE.ShaderMaterial;
  private starMat: THREE.ShaderMaterial;
  /** the real stars, turned from the ecliptic into this scene's axes (Y = Earth's north pole) */
  readonly realSky = new StarSky();
  private skyQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (23.43928 * Math.PI) / 180 - Math.PI / 2);
  private milkyMat: THREE.ShaderMaterial;
  /** a group positioned at the origin, for the vehicle and nearby things */
  readonly local = new THREE.Group();

  constructor(private sunDirEci: V3) {
    const sunV = new THREE.Vector3(...sunDirEci);
    const pad = new THREE.Vector3(...ecefDir(PAD.lat, PAD.lon));
    const padE = new THREE.Vector3(...enu(PAD.lat, PAD.lon).E);
    // ---- Earth
    this.earthMat = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: sunV }, camKm: { value: new THREE.Vector3() }, padDir: { value: pad }, padE: { value: padE }, camAlt: { value: 0 },
        dayTex: { value: hiresTexture([['earth_8k.jpg', 8192], ['earth_4k.jpg', 4096]], true, () => (this.earthMat.uniforms.dayK.value = 1)) },
        nightTex: { value: hiresTexture([['earth_night_4k.jpg', 4096]], false, () => (this.earthMat.uniforms.nightK.value = 1)) },
        dayK: { value: 0 },
        nightK: { value: 0 },
      },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH.R, 512, 256), this.earthMat);
    this.earth.frustumCulled = false;
    this.scene.add(this.earth);
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: sunV }, time: { value: 0 }, camAlt: { value: 0 },
        cloudTex: { value: hiresTexture([['earth_clouds_4k.jpg', 4096]], false, () => (this.cloudMat.uniforms.cloudK.value = 1)) },
        cloudK: { value: 0 },
      },
      vertexShader: EARTH_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH.R + 7000, 256, 128), this.cloudMat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = 1;
    this.scene.add(this.clouds);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunV }, camKm: { value: new THREE.Vector3() } },
      vertexShader: EARTH_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.SrcAlphaFactor,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(RA_KM * 1000, 128, 64), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = 2;
    this.scene.add(this.sky);

    // ---- stars and the Milky Way (they follow the camera: infinitely far)
    const gPole = new THREE.Vector3(...ecefDir(27.13, 192.86 - 180)).normalize();
    this.milkyMat = new THREE.ShaderMaterial({
        uniforms: { gPole: { value: gPole }, bright: { value: 1 } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p;\n#ifdef USE_REVERSED_DEPTH_BUFFER\ngl_Position.z = 0.0;\n#else\ngl_Position.z = p.w * 0.999999;\n#endif\n}`,
        fragmentShader: MILKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
      });
    const milky = new THREE.Mesh(new THREE.SphereGeometry(1e8, 64, 32), this.milkyMat);
    // drawn after the opaque planet, depth-tested against it, so it never shows through the night side
    milky.renderOrder = 1;
    milky.frustumCulled = false;
    this.skyGroup.add(milky);
    const N = 7000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    let k = 0, guard = 0;
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    while (k < N && guard++ < N * 20) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const dir = new THREE.Vector3(r * Math.cos(th), u, r * Math.sin(th));
      const b = dir.dot(gPole);
      if (rnd() > 0.3 + 0.7 * Math.exp(-((b / 0.22) ** 2))) continue;
      const mag = 6.5 - Math.pow(rnd(), 0.28) * 7.8;
      const bright = Math.pow(2.512, -mag) * 30;
      const t = rnd();
      const c = t < 0.15 ? [0.75, 0.82, 1.0] : t < 0.6 ? [1.0, 0.98, 0.95] : t < 0.85 ? [1.0, 0.9, 0.75] : [1.0, 0.75, 0.55];
      dir.multiplyScalar(5e7);
      pos.set([dir.x, dir.y, dir.z], k * 3);
      const lum = Math.min(3, 0.12 + bright * 0.7);
      col.set([c[0] * lum, c[1] * lum, c[2] * lum], k * 3);
      size[k] = Math.min(4.2, 1.1 + Math.max(0, 1.9 - mag * 0.38));
      k++;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, k * 3), 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col.slice(0, k * 3), 3));
    sg.setAttribute('size', new THREE.BufferAttribute(size.slice(0, k), 1));
    this.starMat = new THREE.ShaderMaterial({ uniforms: { bright: { value: 1 } }, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, depthWrite: false, blending: THREE.AdditiveBlending });
    const stars = new THREE.Points(sg, this.starMat);
    stars.renderOrder = 1.5;
    stars.frustumCulled = false;
    this.skyGroup.add(stars);
    this.scene.add(this.skyGroup);
    // the real sky (the Tycho catalogue's stars and the Milky Way) replaces the generated one
    milky.visible = false;
    stars.visible = false;
    this.scene.add(this.realSky.group);

    // ---- the Sun
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.08, 'rgba(255,250,235,0.9)');
      gr.addColorStop(0.25, 'rgba(255,220,170,0.25)');
      gr.addColorStop(1, 'rgba(255,200,150,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    })();
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(40, 38, 34), toneMapped: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, fog: false }));
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.7, 0.62, 0.5), toneMapped: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, fog: false }));
    this.sun.renderOrder = 3;
    this.sunGlow.renderOrder = 3;
    this.scene.add(this.sun, this.sunGlow);
    this.sunLight = new THREE.DirectionalLight(0xfff6ec, 3.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(4096, 4096);
    const sc = this.sunLight.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 1;
    sc.far = 600;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.05;
    this.scene.add(this.sunLight, this.sunLight.target);
    this.earthshine = new THREE.DirectionalLight(0x6f8fc8, 0.0);
    this.scene.add(this.earthshine, this.earthshine.target);
    this.ambient = new THREE.HemisphereLight(0x9ab8e8, 0x2a2622, 0.1);
    this.scene.add(this.ambient);
    this.scene.add(this.local);
    this.moon = new MoonView(sunDirEci);
    this.scene.add(this.moon.group);

  }

  /** place the planet, sky and camera around the vehicle */
  update(v: ViewState, w: number, h: number, mapMode: boolean): void {
    const o = v.origin;
    const earthPos = new THREE.Vector3(-o[0], -o[1], -o[2]);
    this.earth.position.copy(earthPos);
    this.earth.rotation.set(0, v.earthAngle, 0);
    this.clouds.position.copy(earthPos);
    this.clouds.rotation.set(0, v.earthAngle + v.time * 2e-6, 0);
    this.sky.position.copy(earthPos);
    // the camera
    const cam = this.camera;
    cam.position.set(...v.cam);
    cam.up.set(...v.camUp);
    cam.lookAt(new THREE.Vector3(...v.look));
    cam.aspect = w / Math.max(1, h);
    const camDist = len(v.cam);
    cam.near = mapMode ? Math.max(10, camDist * 0.001) : 0.5;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.skyGroup.position.copy(cam.position);
    const camEci: V3 = [o[0] + v.cam[0], o[1] + v.cam[1], o[2] + v.cam[2]];
    const camKm = new THREE.Vector3(camEci[0] / 1000, camEci[1] / 1000, camEci[2] / 1000);
    const camAlt = len(camEci) - EARTH.R;
    this.earthMat.uniforms.camKm.value.copy(camKm);
    this.earthMat.uniforms.camAlt.value = camAlt;
    this.skyMat.uniforms.camKm.value.copy(camKm);
    this.cloudMat.uniforms.time.value = v.time;
    this.cloudMat.uniforms.camAlt.value = camAlt;
    // the Moon, and the ground under the lander
    const mp = moonPos(v.time);
    const relM = sub(o, mp);
    const nearMoon = len(relM) < MOON.soi;
    this.moon.update(o, v.time, nearMoon ? relM : null);
    // the Sun, far beyond everything
    const sd = new THREE.Vector3(...this.sunDirEci);
    this.sun.position.copy(cam.position).addScaledVector(sd, 1e8);
    this.sun.scale.setScalar(1e8 * 0.03);
    this.sunGlow.position.copy(this.sun.position);
    this.sunGlow.scale.setScalar(1e8 * 0.2);
    // lights: sunlight (shadowed round the vehicle), light thrown back by the Earth, and skylight in the air
    this.sunLight.position.copy(sd).multiplyScalar(300);
    this.sunLight.target.position.set(0, 0, 0);
    const up = new THREE.Vector3(o[0], o[1], o[2]).normalize();
    const alt = len(o) - EARTH.R;
    const dayside = Math.max(0, up.dot(sd));
    // in Earth's shadow the sunlight goes out
    const shadowed = this.inShadow(o) || this.inMoonShadow(o, mp);
    this.sunLight.intensity = shadowed ? 0 : 3.4 * Math.min(1, 0.25 + Math.max(0, up.dot(sd) + 0.15) * 3);
    this.earthshine.position.copy(up).multiplyScalar(-300);
    this.earthshine.intensity = 0.9 * dayside * Math.min(1, EARTH.R / (EARTH.R + alt));
    const inAir = Math.exp(-Math.max(0, alt) / 9000);
    const camUpN = new THREE.Vector3(camEci[0], camEci[1], camEci[2]).normalize();
    const daySky = Math.max(0, Math.min(1, (camUpN.dot(sd) + 0.1) * 4)) * Math.exp(-Math.max(0, camAlt) / 25000);
    const starB = (shadowed ? 1 : 0.45) * (1 - daySky);
    this.starMat.uniforms.bright.value = starB;
    this.milkyMat.uniforms.bright.value = starB;
    this.realSky.brightness = Math.min(1, starB * 1.6);
    this.realSky.update(this.camera, this.skyQ);
    this.ambient.intensity = 0.06 + 0.9 * inAir * Math.max(0.1, dayside);
    if (nearMoon) {
      // no air: hard sunlight, inky shadows, and a little blue earthshine
      this.sunLight.intensity = shadowed ? 0 : 3.4;
      const toEarth = new THREE.Vector3(-o[0], -o[1], -o[2]).normalize();
      this.earthshine.position.copy(toEarth).multiplyScalar(300);
      this.earthshine.intensity = 0.08;
      this.ambient.intensity = 0.02;
      // on the surface the sunlit dust throws light back up into every shadow
      if (len(relM) < MOON.R + 30000) {
        const up = new THREE.Vector3(relM[0], relM[1], relM[2]).normalize();
        const sunUp = Math.max(0, up.dot(sd));
        this.ambient.position.copy(up);
        this.ambient.color.set(0x05070c);
        this.ambient.groundColor.set(0xb0a690);
        this.ambient.intensity = shadowed ? 0.03 : 0.25 + 1.1 * sunUp;
      }
    } else {
      this.ambient.position.set(0, 1, 0);
      this.ambient.color.set(0x9ab8e8);
      this.ambient.groundColor.set(0x2a2622);
    }
  }

  /** is a point (ECI) in the Moon's shadow? */
  private inMoonShadow(p: V3, mp: V3): boolean {
    const s = this.sunDirEci;
    const d = sub(p, mp);
    const along = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
    if (along > 0) return false;
    return len(sub(d, [s[0] * along, s[1] * along, s[2] * along])) < MOON.R;
  }

  /** is a point (ECI) in Earth's shadow? */
  inShadow(p: V3): boolean {
    const s = this.sunDirEci;
    const along = p[0] * s[0] + p[1] * s[1] + p[2] * s[2];
    if (along > 0) return false;
    const perp = len(sub(p, [s[0] * along, s[1] * along, s[2] * along]));
    return perp < EARTH.R;
  }
}

/** a point on the predicted track for the map view, coloured by what it means */
export interface TrackPoint {
  p: V3;
  /** 'air' inside the atmosphere, 'escape' on a hyperbola, 'stable' if the orbit clears the air, 'decay' if it dips into it */
  kind: 'air' | 'escape' | 'stable' | 'decay';
}

/** the predicted path from now: round the orbit, or down to where it meets the ground, or out on an escape */
export function orbitTrack(o: Orbit, n = 360, body: Body = EARTH): { pts: TrackPoint[]; impact: boolean } {
  const R = body.R;
  const atm = R + body.atmosphereTop;
  const raw: V3[] = [];
  let impact = false;
  if (o.e < 1) {
    let end = o.nu + 2 * Math.PI;
    if (o.rp < R) {
      const ni = descendingAnomaly(o, R);
      if (Number.isFinite(ni)) {
        end = ni;
        while (end < o.nu) end += 2 * Math.PI;
        impact = true;
      }
    }
    for (let i = 0; i <= n; i++) raw.push(orbitPoint(o, o.nu + ((end - o.nu) * i) / n));
  } else {
    const lim = Math.acos(-1 / o.e) * 0.985;
    let start = o.nu > Math.PI ? o.nu - 2 * Math.PI : o.nu;
    start = Math.max(-lim, start);
    for (let i = 0; i <= n; i++) raw.push(orbitPoint(o, start + ((lim - start) * i) / n));
  }
  const pts = raw.map((p): TrackPoint => {
    const r = len(p);
    return { p, kind: r < atm ? 'air' : o.e >= 1 ? 'escape' : o.rp > atm + (body === EARTH ? 0 : 3000) ? 'stable' : 'decay' };
  });
  return { pts, impact };
}
