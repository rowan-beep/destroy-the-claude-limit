// Mars on screen, from far out in space down to the ground the ship stands on.
//
// The globe is the full-size planet, its vertices lifted by the global height
// map and shaded from the albedo and relief maps, with the haze of the dusty
// air toward the limb and a soft terminator. A thin glowing shell paints the
// atmosphere on the limb from space, bluish where the Sun is low. Inside the
// air a sky dome draws the Martian sky: butterscotch by day, darker toward
// the zenith, with the blue glow round the Sun that makes Martian sunsets blue,
// fading to black (and the stars) as the ship climbs. Close to the surface a
// ground mesh is built round the point below the ship from exactly the terrain
// the simulation lands on, scattered with boulders, coloured from the albedo
// map and fogged with dust toward the horizon. Everything is drawn round the
// ship (a floating origin).

import * as THREE from 'three';
import { MAP_W, MAP_H, buildMarsMaps, marsMaps, marsHeight, marsHeightParts, mapAlbedo, groundTint, setMarsPhoto, marsPhotoScale, hasMarsPhoto } from './marsGlobe';
import marsPhotoUrl from './assets/mars_viking_mdim21.jpg';
import type { Vec } from './marsPhysics';
import { MARS } from './marsPhysics';
import { boulderGeometry, groundMaterial } from './marsSurface';
import { LandingDust } from './marsFx';

const R = MARS.R;
/** the Sun's light at Mars (renderer units, as the other scenes' suns) */
const SUN_I = 3.4;
const D2R = Math.PI / 180;
const RECIP_PI = 1 / Math.PI;

const GLOBE_VERT = /* glsl */ `
uniform sampler2D heightTex;
uniform float lift;
varying vec3 vP;
varying vec3 vW;
#include <common>
#include <logdepthbuf_pars_vertex>
vec2 llUV(vec3 d) {
  float lat = asin(clamp(d.z, -1.0, 1.0));
  float lon = atan(d.y, d.x);
  return vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
}
void main() {
  vec3 d = normalize(position);
  float h = texture2D(heightTex, llUV(d)).r * 1000.0 * lift;
  vec3 p = d * (${R.toFixed(1)} + h);
  vP = d;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

const GLOBE_FRAG = /* glsl */ `
uniform sampler2D albedoTex;
uniform sampler2D photoTex;
uniform float photo;
uniform sampler2D heightTex;
uniform vec3 sunF;
uniform vec3 camW;
uniform float ready;
uniform float sunI;
uniform vec3 hazeCol;
uniform vec3 ctrW;
varying vec3 vP;
varying vec3 vW;
#include <common>
#include <logdepthbuf_pars_fragment>
vec2 llUV(vec3 d) {
  float lat = asin(clamp(d.z, -1.0, 1.0));
  float lon = atan(d.y, d.x);
  return vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
}
// (no sin(): it loses precision far from the origin, and the lattice here reaches the tens of thousands)
float h3(vec3 p) {
  p = mod(p, 4096.0);
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm5(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s / 0.94;
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vn(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s / 0.875;
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vP);
  vec2 uv = llUV(d);
  float camDist = length(camW - vW);
  vec3 alb = ready > 0.5 ? texture2D(albedoTex, uv).rgb : vec3(0.45, 0.26, 0.15);
  // the rich butterscotch of the orbital photographs: deeper and more saturated than the raw map
  float al = dot(alb, vec3(0.3, 0.55, 0.15));
  alb = max(vec3(0.0), mix(vec3(al), alb, 1.45)) * vec3(0.95, 0.82, 0.74);
  // Mars reflects about a quarter of the light: dark regions darker, bright dust brighter
  alb = pow(alb / 0.42, vec3(1.5)) * 0.3;
  // the Viking orbiters' real colours, once loaded (the texture's own mip filtering handles the distance)
  if (photo > 0.0) {
    // (graded as gradeMars() does for the ground)
    vec3 c = texture2D(photoTex, uv).rgb;
    float l = dot(c, vec3(0.3, 0.55, 0.15));
    c = max(vec3(0.0), mix(vec3(l), c, 1.5)) * pow(max(1e-4, l) / 0.25, 0.25);
    alb = c * vec3(1.12, 0.9, 0.68) * photo;
  }
  // the map is 20 km a pixel: below that, mottling, dark sand and bright dust at every scale,
  // fading in as the camera comes close enough to see it
  float near1 = 1.0 - smoothstep(4.0e6, 1.2e7, camDist);
  float near2 = 1.0 - smoothstep(4.0e5, 2.0e6, camDist);
  // (fbm clusters round 0.5: stretch it to the full range)
  // (each layer is only computed where it can be seen: this shader covers the whole screen)
  if (near1 > 0.002) {
    float m1 = smoothstep(0.32, 0.68, fbm5(d * 140.0));
    alb *= mix(1.0, 0.62 + 0.75 * m1, near1);
  }
  if (near2 > 0.002) {
    float m2 = smoothstep(0.3, 0.7, fbm5(d * 1100.0));
    alb *= mix(1.0, 0.72 + 0.56 * m2, near2);
    alb *= 0.9 + 0.2 * vn(d * 6000.0);
  }
  // relief from the height map: east and north slopes
  vec3 E = normalize(vec3(-d.y, d.x, 0.0) + 1e-6);
  vec3 N = cross(d, E);
  float du = 1.0 / ${MAP_W.toFixed(1)}, dv = 1.0 / ${MAP_H.toFixed(1)};
  float hE = texture2D(heightTex, uv + vec2(du, 0.0)).r - texture2D(heightTex, uv - vec2(du, 0.0)).r;
  float hN = texture2D(heightTex, uv - vec2(0.0, dv)).r - texture2D(heightTex, uv + vec2(0.0, dv)).r;
  float cl = max(0.05, sqrt(1.0 - d.z * d.z));
  float kmE = 2.0 * du * 2.0 * PI * ${(R / 1000).toFixed(1)} * cl, kmN = 2.0 * dv * PI * ${(R / 1000).toFixed(1)};
  vec3 nrm = normalize(d - E * (hE / kmE) * 8.0 - N * (hN / kmN) * 8.0);
  // hills, ridges and crater walls too small for the map: relief from noise, lit by the Sun
  if (near2 > 0.002) {
    float bs = 2.2e-4;
    float b0 = fbm3(d * 2200.0);
    float bE = fbm3((d + E * bs) * 2200.0), bN = fbm3((d + N * bs) * 2200.0);
    nrm = normalize(nrm - (E * (bE - b0) + N * (bN - b0)) / bs * 0.006 * near2);
  }
  float mu0 = dot(nrm, sunF);
  float muG = dot(d, sunF);
  float lit = max(mu0, 0.0) * smoothstep(-0.08, 0.06, muG);
  // the same light as the ground close up: Lambert under the Sun, plus the dusty sky's glow
  float day = smoothstep(-0.1, 0.15, muG);
  vec3 col = alb * (lit * sunI * RECIPROCAL_PI + vec3(0.34, 0.24, 0.17) * 0.35 * day);
  // dusty air: haze toward the limb, lit by the Sun
  // (in world space: d is Mars-fixed, the camera is not)
  vec3 nW = normalize(vW - ctrW);
  float muV = max(0.02, dot(nW, normalize(camW - vW)));
  float haze = (1.0 - exp(-0.07 / muV)) * smoothstep(-0.25, 0.2, muG);
  col = mix(col, hazeCol * max(0.0, muG + 0.15), clamp(haze, 0.0, 0.7));
  // a little skylight on the night side near the terminator
  col += alb * vec3(0.06, 0.07, 0.1) * smoothstep(-0.25, 0.0, muG) * (1.0 - smoothstep(0.0, 0.1, muG));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 sunF;
uniform vec3 camW;
uniform vec3 ctr;
varying vec3 vP;
varying vec3 vW;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vP);
  vec3 v = normalize(vW - camW);
  float rim = 1.0 - abs(dot(n, v));
  float s = dot(n, sunF);
  float day = smoothstep(-0.25, 0.25, s);
  // only the air seen past the edge of the planet glows: where the line of sight
  // meets the ground, the globe's own haze does the work
  vec3 oc = camW - ctr;
  float b = dot(oc, v);
  float disc = b * b - (dot(oc, oc) - ${(R * R).toExponential(6)});
  float hitsGround = disc > 0.0 && -b - sqrt(disc) > 0.0 ? 1.0 : 0.0;
  float k = pow(rim, 5.0) * day * (1.0 - 0.92 * hitsGround);
  // the limb: dusty pink in daylight, blue where the light comes in low
  vec3 c = mix(vec3(0.35, 0.5, 0.95), vec3(0.95, 0.62, 0.42), smoothstep(-0.1, 0.45, s));
  gl_FragColor = vec4(c * k * 0.75, 1.0);
}`;

const SIMPLE_VERT = /* glsl */ `
varying vec3 vP;
varying vec3 vW;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vP = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 sunW;
uniform vec3 upW;
uniform float thick;
varying vec3 vP;
#include <common>
void main() {
  vec3 v = normalize(vP);
  float e = dot(v, upW);
  float se = dot(sunW, upW);
  float cs = dot(v, sunW);
  float day = smoothstep(-0.2, 0.1, se);
  // the dust lights the whole sky: butterscotch at the horizon, a deeper brownish
  // tan overhead (as the rovers photograph it), brighter on the Sun's side
  vec3 hor = vec3(0.62, 0.40, 0.25);
  vec3 zen = vec3(0.30, 0.18, 0.11);
  float ee = clamp(e, 0.0, 1.0);
  vec3 c = mix(hor, zen, pow(ee, 0.6));
  c *= 0.85 + 0.35 * pow(max(cs, 0.0), 3.0);
  // below the horizon line: the hazy far ground
  c = mix(c, hor * 0.82, smoothstep(0.01, -0.12, e));
  // the bluish-white aureole round the Sun (fine dust scatters blue forward):
  // a soft glow by day, a wide blue halo at sunrise and sunset
  float low = 1.0 - smoothstep(0.05, 0.5, se);
  float aure = exp(-(1.0 - cs) * mix(60.0, 12.0, low));
  c = mix(c, vec3(0.52, 0.6, 0.78), clamp(aure * (0.45 + 0.5 * low), 0.0, 0.9));
  c += vec3(1.0, 0.97, 0.92) * exp(-(1.0 - cs) * 900.0) * 6.0;
  // twilight: the sky dims as the Sun goes down, holding a blue glow in the west
  c *= day * (0.45 + 0.55 * smoothstep(0.0, 0.35, se));
  c += vec3(0.05, 0.07, 0.13) * aure * (1.0 - day) * smoothstep(-0.35, -0.05, se);
  gl_FragColor = vec4(c * thick, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface MarsViewState {
  /** ship position in the Mars frame (the floating origin) */
  origin: Vec;
  /** camera position relative to the origin, its up and look-at point */
  cam: Vec;
  camUp: Vec;
  look: Vec;
  /** Mars's rotation angle (about +Z) */
  angle: number;
  /** the Sun's direction (Mars frame) */
  sun: Vec;
  /** fraction of engine power on, for the dust */
  dust: number;
  /** the ship's axis (to find where the engines are), and the height of the engines over the ground */
  axis?: Vec;
  engineAgl?: number;
}

export class MarsView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.5, 2e9);
  readonly local = new THREE.Group();
  private globe: THREE.Mesh;
  private globeMat: THREE.ShaderMaterial;
  private atmo: THREE.Mesh;
  private atmoMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private sunSprite: THREE.Sprite;
  readonly sunLight: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private patch: THREE.Mesh | null = null;
  private patchMat: THREE.MeshStandardMaterial;
  private patchAt: { c: Vec; outer: number } | null = null;
  private rocks: THREE.InstancedMesh[] = [];
  private rocksAt: Vec | null = null;
  private fog = new THREE.FogExp2(0xc08a60, 0);
  private texReady = false;
  /** the renderer, for capturing the sky as the light that fills every shadow */
  renderer: THREE.WebGLRenderer | null = null;
  private envTex: THREE.Texture | null = null;
  private envScene: THREE.Scene | null = null;
  private envSkyMat: THREE.ShaderMaterial | null = null;
  private envGround: THREE.Mesh | null = null;
  private envKey = '';
  private pmrem: THREE.PMREMGenerator | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envAt = 0;
  private dust = new LandingDust();
  private prevO: Vec | null = null;
  private prevAngle = 0;

  constructor() {
    const dummy = new THREE.DataTexture(new Uint8Array([110, 70, 40, 255]), 1, 1);
    dummy.needsUpdate = true;
    const dummyH = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
    dummyH.needsUpdate = true;
    this.globeMat = new THREE.ShaderMaterial({
      uniforms: { albedoTex: { value: dummy }, heightTex: { value: dummyH }, sunF: { value: new THREE.Vector3(1, 0, 0) }, camW: { value: new THREE.Vector3() }, ready: { value: 0 }, lift: { value: 1 }, photoTex: { value: dummy }, photo: { value: 0 }, sunI: { value: 3.2 }, ctrW: { value: new THREE.Vector3() }, hazeCol: { value: new THREE.Vector3(0.6, 0.38, 0.23) } },
      vertexShader: GLOBE_VERT,
      fragmentShader: GLOBE_FRAG,
    });
    const sg = new THREE.SphereGeometry(1, 512, 256);
    sg.rotateX(Math.PI / 2); // the pole along +Z
    // the Viking colour mosaic: the globe's colours and, close up, the ground's
    const img = new Image();
    img.onload = () => {
      try {
        setMarsPhoto(img);
        const t = new THREE.Texture(img);
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.needsUpdate = true;
        this.globeMat.uniforms.photoTex.value = t;
        this.globeMat.uniforms.photo.value = marsPhotoScale();
        // rebuild the ground in its new colours
        this.patchAt = null;
        this.rocksAt = null;
      } catch {
        /* the generated map stays */
      }
    };
    img.src = marsPhotoUrl;
    this.globe = new THREE.Mesh(sg, this.globeMat);
    this.globe.frustumCulled = false;
    this.scene.add(this.globe);
    this.atmoMat = new THREE.ShaderMaterial({
      uniforms: { sunF: { value: new THREE.Vector3(1, 0, 0) }, camW: { value: new THREE.Vector3() }, ctr: { value: new THREE.Vector3() } },
      vertexShader: SIMPLE_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(R + 70_000, 384, 192), this.atmoMat);
    this.atmo.frustumCulled = false;
    this.atmo.renderOrder = 2;
    this.scene.add(this.atmo);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { sunW: { value: new THREE.Vector3(1, 0, 0) }, upW: { value: new THREE.Vector3(0, 0, 1) }, thick: { value: 0 } },
      vertexShader: SIMPLE_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    // stars
    const N = 6000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    let s = 99;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < N; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
      pos.set([q * Math.cos(th) * 900, q * Math.sin(th) * 900, u * 900], i * 3);
      const b = Math.pow(r(), 6) * 2 + 0.15;
      const t = r();
      col.set(t < 0.2 ? [0.75 * b, 0.82 * b, b] : t < 0.8 ? [b, b, 0.95 * b] : [b, 0.85 * b, 0.65 * b], i * 3);
    }
    const stg = new THREE.BufferGeometry();
    stg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    stg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: false, depthWrite: false, depthTest: true, fog: false, blending: THREE.AdditiveBlending });
    this.stars = new THREE.Points(stg, this.starMat);
    this.stars.renderOrder = -9;
    // out near the far plane, so the planet hides them
    this.stars.scale.setScalar(1.6e6);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
    // the Sun (a smaller disc than from Earth: Mars is half again as far)
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, 'rgba(255,248,236,0.95)');
    gr.addColorStop(0.3, 'rgba(255,225,190,0.25)');
    gr.addColorStop(1, 'rgba(255,210,170,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: new THREE.Color(14, 13, 12), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.sunSprite.renderOrder = -8;
    this.scene.add(this.sunSprite);
    // light: sunlight at Mars is 43% of Earth's
    this.sunLight = new THREE.DirectionalLight(0xfff0e0, 2.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    const sc = this.sunLight.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -60;
    sc.right = sc.top = 60;
    sc.near = 1;
    sc.far = 500;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight, this.sunLight.target);
    this.hemi = new THREE.HemisphereLight(0xd9a77a, 0x7a4a30, 0.4);
    this.scene.add(this.hemi);
    this.scene.add(this.local);
    this.patchMat = groundMaterial();
    this.scene.fog = this.fog;
    this.scene.add(this.dust.group);
  }

  /** feed the textures once the global maps are built (call each frame: cheap when done) */
  prepare(budgetMs = 6): boolean {
    if (this.texReady) return true;
    if (!buildMarsMaps(budgetMs)) return false;
    const m = marsMaps();
    const n = MAP_W * MAP_H;
    const a8 = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      a8[i * 4] = Math.round(Math.min(1, m.albedo[i * 3]) * 255);
      a8[i * 4 + 1] = Math.round(Math.min(1, m.albedo[i * 3 + 1]) * 255);
      a8[i * 4 + 2] = Math.round(Math.min(1, m.albedo[i * 3 + 2]) * 255);
      a8[i * 4 + 3] = 255;
    }
    const at = new THREE.DataTexture(a8, MAP_W, MAP_H, THREE.RGBAFormat);
    at.wrapS = THREE.RepeatWrapping;
    at.magFilter = THREE.LinearFilter;
    at.minFilter = THREE.LinearMipmapLinearFilter;
    at.generateMipmaps = true;
    at.anisotropy = 8;
    at.needsUpdate = true;
    // half floats filter linearly everywhere: smooth relief instead of 20 km steps
    const hh = new Uint16Array(n);
    for (let i = 0; i < n; i++) hh[i] = THREE.DataUtils.toHalfFloat(m.height[i]);
    const ht = new THREE.DataTexture(hh, MAP_W, MAP_H, THREE.RedFormat, THREE.HalfFloatType);
    ht.wrapS = THREE.RepeatWrapping;
    ht.magFilter = THREE.LinearFilter;
    ht.minFilter = THREE.LinearFilter;
    ht.needsUpdate = true;
    this.globeMat.uniforms.albedoTex.value = at;
    this.globeMat.uniforms.heightTex.value = ht;
    this.globeMat.uniforms.ready.value = 1;
    this.texReady = true;
    return true;
  }

  update(v: MarsViewState, w: number, h: number, dt: number): void {
    const o = v.origin;
    const rotM = new THREE.Matrix4().makeRotationZ(v.angle);
    // the globe and its shell, round the floating origin
    this.globe.position.set(-o[0], -o[1], -o[2]);
    this.globe.quaternion.setFromRotationMatrix(rotM);
    this.atmo.position.copy(this.globe.position);
    const cam = this.camera;
    cam.position.set(...v.cam);
    cam.up.set(...v.camUp);
    cam.lookAt(new THREE.Vector3(...v.look));
    cam.aspect = w / Math.max(1, h);
    const camR = Math.hypot(o[0] + v.cam[0], o[1] + v.cam[1], o[2] + v.cam[2]);
    const camAlt = camR - R;
    // (the renderer's depth buffer is logarithmic: a near plane this close costs nothing far out)
    cam.near = 0.5;
    cam.far = 2e9;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const sun = new THREE.Vector3(...v.sun).normalize();
    const sunF = sun.clone().applyMatrix4(new THREE.Matrix4().makeRotationZ(-v.angle));
    (this.globeMat.uniforms.sunF.value as THREE.Vector3).copy(sunF);
    (this.globeMat.uniforms.camW.value as THREE.Vector3).copy(cam.position);
    (this.globeMat.uniforms.ctrW.value as THREE.Vector3).copy(this.globe.position);
    (this.atmoMat.uniforms.sunF.value as THREE.Vector3).copy(sun);
    (this.atmoMat.uniforms.camW.value as THREE.Vector3).copy(cam.position);
    (this.atmoMat.uniforms.ctr.value as THREE.Vector3).copy(this.globe.position);
    // the sky dome follows the camera
    const upW = new THREE.Vector3(o[0] + v.cam[0], o[1] + v.cam[1], o[2] + v.cam[2]).normalize();
    this.sky.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    (this.skyMat.uniforms.sunW.value as THREE.Vector3).copy(sun);
    (this.skyMat.uniforms.upW.value as THREE.Vector3).copy(upW);
    const thick = Math.exp(-Math.max(0, camAlt) / 11_100);
    const sunUp = upW.dot(sun);
    const dayAir = Math.min(1, thick * 3) * THREE.MathUtils.smoothstep(sunUp, -0.18, 0.12);
    this.skyMat.uniforms.thick.value = Math.min(1, thick * 3);
    this.sky.visible = camAlt < 90_000;
    this.starMat.color.setScalar(Math.max(0, 1 - dayAir * 1.6));
    // (far out, so the planet hides the Sun when it is behind it)
    this.sunSprite.position.copy(cam.position).addScaledVector(sun, 1.4e9);
    this.sunSprite.scale.setScalar(1.4e9 * 0.04);
    // lights
    this.sunLight.position.copy(sun).multiplyScalar(250);
    this.sunLight.target.position.set(0, 0, 0);
    const shadowed = (() => {
      const along = o[0] * sun.x + o[1] * sun.y + o[2] * sun.z;
      if (along > 0) return false;
      const px = o[0] - sun.x * along, py = o[1] - sun.y * along, pz = o[2] - sun.z * along;
      return Math.hypot(px, py, pz) < R;
    })();
    // the Sun through the dusty air reddens and dims near the horizon
    const oUp = new THREE.Vector3(...o).normalize();
    const elev = oUp.dot(sun);
    const air = Math.exp(-Math.max(0, Math.hypot(...o) - R) / 11_100);
    const ext = air > 0.01 ? THREE.MathUtils.smoothstep(elev, -0.05, 0.3) : 1;
    // sunlight at Mars: 43% of Earth's, a little warmer and dimmer through the dust when low
    const sunI = SUN_I * (0.2 + 0.8 * ext);
    this.sunLight.intensity = shadowed ? 0 : sunI;
    this.sunLight.color.setRGB(1, 0.9 + 0.08 * ext, 0.78 + 0.18 * ext);
    this.globeMat.uniforms.sunI.value = SUN_I;
    // the sky and the sunlit ground light everything else (image-based: see updateEnv)
    this.hemi.position.copy(oUp);
    this.hemi.intensity = this.envTex ? 0 : 0.12 + 1.1 * air * Math.max(0.15, elev + 0.25);
    // the dust haze over the ground, the colour of the sky at the horizon
    const near = camAlt < 40_000;
    const hz = THREE.MathUtils.smoothstep(sunUp, -0.2, 0.1) * (0.45 + 0.55 * THREE.MathUtils.smoothstep(sunUp, 0, 0.35));
    this.fog.density = near ? (1 / 38_000) * Math.min(1, thick * 2.5) : 0;
    this.fog.color.setRGB(0.5 * hz + 0.01, 0.3 * hz + 0.012, 0.18 * hz + 0.02);
    (this.globeMat.uniforms.hazeCol.value as THREE.Vector3).set(0.62, 0.4, 0.25);
    this.updateEnv(sun, upW, Math.min(1, thick * 3), Math.max(0, elev), shadowed ? 0 : sunI);
    // the ground mesh while low
    const shipAlt = Math.hypot(...o) - R;
    if (shipAlt < 60_000) {
      const fixedNow = new THREE.Vector3(...o).applyMatrix4(new THREE.Matrix4().makeRotationZ(-v.angle)).normalize();
      const c: Vec = [fixedNow.x, fixedNow.y, fixedNow.z];
      const outer = Math.max(30_000, Math.min(400_000, shipAlt * 12 + 25_000));
      const p = this.patchAt;
      const moved = p ? Math.hypot(c[0] - p.c[0], c[1] - p.c[1], c[2] - p.c[2]) * R : Infinity;
      if (!p || moved > Math.max(120, Math.min(shipAlt * 0.8, outer * 0.08)) || outer > p.outer * 1.9 || outer < p.outer * 0.45) this.buildPatch(c, outer);
      const P0 = new THREE.Vector3(...this.patchAt!.c).multiplyScalar(R).applyMatrix4(rotM);
      this.patch!.position.set(P0.x - o[0], P0.y - o[1], P0.z - o[2]);
      this.patch!.quaternion.setFromRotationMatrix(rotM);
      this.patch!.visible = true;
      // the globe drops a little below the detailed ground
      this.globeMat.uniforms.lift.value = 1;
      this.globe.scale.setScalar((R - 1500) / R);
      // boulders round the landing point
      if (shipAlt < 4000) {
        if (!this.rocksAt || Math.hypot(c[0] - this.rocksAt[0], c[1] - this.rocksAt[1], c[2] - this.rocksAt[2]) * R > 300) this.buildRocks(c);
        for (const rk of this.rocks) {
          rk.position.copy(this.patch!.position);
          rk.quaternion.copy(this.patch!.quaternion);
          rk.visible = true;
        }
      } else for (const rk of this.rocks) rk.visible = false;
    } else {
      if (this.patch) this.patch.visible = false;
      for (const rk of this.rocks) rk.visible = false;
      this.globe.scale.setScalar(1);
    }
    this.stepDust(v, dt, h, sunI, sun, thick);
  }

  /**
   * Image-based light: the sky dome (as it looks from here) over the sunlit
   * ground, rendered into an environment map, so the steel reflects the real
   * sky and every shadow is filled by the dusty sky's light and the warm glow
   * off the ground. Recaptured when the Sun or the height changes.
   */
  private updateEnv(sun: THREE.Vector3, upW: THREE.Vector3, thick: number, sunUp: number, sunI: number): void {
    const r = this.renderer;
    if (!r) return;
    const key = `${sun.x.toFixed(2)},${sun.y.toFixed(2)},${sun.z.toFixed(2)}|${upW.x.toFixed(2)},${upW.y.toFixed(2)},${upW.z.toFixed(2)}|${thick.toFixed(2)}|${(sunI * sunUp).toFixed(2)}`;
    const now = performance.now();
    if (key === this.envKey || (this.envTex && now - this.envAt < 2500)) return;
    this.envKey = key;
    this.envAt = now;
    if (!this.envScene) {
      this.envScene = new THREE.Scene();
      this.envSkyMat = new THREE.ShaderMaterial({
        uniforms: { sunW: { value: new THREE.Vector3() }, upW: { value: new THREE.Vector3() }, thick: { value: 1 } },
        vertexShader: SIMPLE_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
      });
      const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), this.envSkyMat);
      sky.renderOrder = -1;
      this.envScene.add(sky);
      // the ground: a lower hemisphere a little inside the sky
      this.envGround = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 12, 0, Math.PI * 2, Math.PI / 2 + 0.01, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }));
      this.envScene.add(this.envGround);
    }
    const u = this.envSkyMat!.uniforms;
    (u.sunW.value as THREE.Vector3).copy(sun);
    (u.upW.value as THREE.Vector3).copy(upW);
    u.thick.value = thick;
    this.envGround!.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upW);
    // what the ground sends back up: its albedo under the Sun and the sky
    const gl = sunI * sunUp * RECIP_PI + 0.12 * thick + 0.012;
    (this.envGround!.material as THREE.MeshBasicMaterial).color.setRGB(0.42 * gl, 0.26 * gl, 0.16 * gl);
    try {
      this.pmrem ??= new THREE.PMREMGenerator(r);
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 500);
      this.envRT?.dispose();
      this.envRT = rt;
      this.envTex = rt.texture;
      this.scene.environment = this.envTex;
      this.scene.environmentIntensity = 1;
    } catch {
      /* the hemisphere light carries it */
    }
  }

  /** the ground mesh: rings from under the ship out to `outer` metres (Mars-fixed, about c) */
  private buildPatch(c: Vec, outer: number): void {
    const RINGS = 120, SEG = 150;
    const cx = new THREE.Vector3(...c);
    const t1 = new THREE.Vector3().crossVectors(Math.abs(c[2]) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), cx).normalize();
    const t2 = new THREE.Vector3().crossVectors(cx, t1);
    const rho0 = 0.8;
    const k = Math.pow(outer / rho0, 1 / (RINGS - 1));
    const nV = 1 + RINGS * SEG;
    const pos = new Float32Array(nV * 3);
    const col = new Float32Array(nV * 3);
    const uv = new Float32Array(nV * 2);
    const P0 = cx.clone().multiplyScalar(R);
    const alb = [0, 0, 0];
    const put = (i: number, d: THREE.Vector3, rho: number, th: number) => {
      const lat = Math.asin(Math.max(-1, Math.min(1, d.z))) / D2R;
      const lon = Math.atan2(d.y, d.x) / D2R;
      const hp = marsHeightParts(lat, lon);
      const hgt = hp.base + hp.detail;
      const p = d.clone().multiplyScalar(R + hgt).sub(P0);
      pos.set([p.x, p.y, p.z], i * 3);
      mapAlbedo(lat, lon, alb);
      groundTint(hp.px, hp.py, hp.pz, hp.detail, alb);
      // a little local variation in the dust
      const vv = 1;
      // (the same richer colour as the globe's, so the two meet without a seam)
      const al = alb[0] * 0.3 + alb[1] * 0.55 + alb[2] * 0.15;
      if (hasMarsPhoto()) col.set([alb[0] * vv, alb[1] * vv, alb[2] * vv], i * 3);
      else {
        const g3 = [Math.max(0, al + (alb[0] - al) * 1.45) * 0.95, Math.max(0, al + (alb[1] - al) * 1.45) * 0.82, Math.max(0, al + (alb[2] - al) * 1.45) * 0.74];
        col.set([Math.pow(g3[0] / 0.42, 1.5) * 0.3 * vv, Math.pow(g3[1] / 0.42, 1.5) * 0.3 * vv, Math.pow(g3[2] / 0.42, 1.5) * 0.3 * vv], i * 3);
      }
      uv.set([(rho * Math.cos(th)) / 9, (rho * Math.sin(th)) / 9], i * 2);
    };
    put(0, cx.clone(), 0, 0);
    for (let r = 0; r < RINGS; r++) {
      const rho = rho0 * Math.pow(k, r);
      const a = rho / R;
      for (let s = 0; s < SEG; s++) {
        const th = (s / SEG) * Math.PI * 2;
        const d = cx.clone().multiplyScalar(Math.cos(a)).addScaledVector(t1, Math.sin(a) * Math.cos(th)).addScaledVector(t2, Math.sin(a) * Math.sin(th)).normalize();
        put(1 + r * SEG + s, d, rho, th);
      }
    }
    const idx: number[] = [];
    for (let s = 0; s < SEG; s++) idx.push(0, 1 + s, 1 + ((s + 1) % SEG));
    for (let r = 0; r < RINGS - 1; r++)
      for (let s = 0; s < SEG; s++) {
        const a = 1 + r * SEG + s, b = 1 + r * SEG + ((s + 1) % SEG), cc = a + SEG, dd = b + SEG;
        idx.push(a, cc, b, b, cc, dd);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // steep ground sheds its dust: slopes show darker, greyer bedrock
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    const up = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < nV; i++) {
      up.set(pos[i * 3] + P0.x, pos[i * 3 + 1] + P0.y, pos[i * 3 + 2] + P0.z).normalize();
      nn.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      const steep = THREE.MathUtils.smoothstep(1 - up.dot(nn), 0.04, 0.22);
      if (steep > 0) {
        const cr = col[i * 3], cg = col[i * 3 + 1], cb = col[i * 3 + 2];
        const grey = (cr + cg + cb) / 3 * 0.55;
        col[i * 3] = cr + (grey * 1.15 - cr) * steep;
        col[i * 3 + 1] = cg + (grey * 0.95 - cg) * steep;
        col[i * 3 + 2] = cb + (grey * 0.85 - cb) * steep;
      }
    }
    if (this.patch) {
      this.patch.geometry.dispose();
      this.patch.geometry = g;
    } else {
      this.patch = new THREE.Mesh(g, this.patchMat);
      this.patch.receiveShadow = true;
      this.patch.frustumCulled = false;
      this.scene.add(this.patch);
    }
    this.patchAt = { c, outer };
  }

  /** boulders strewn round the landing point (Mars-fixed, in the patch's frame): many small, a few big, half sunk */
  private buildRocks(c: Vec): void {
    const PER = 700;
    if (!this.rocks.length) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0 });
      for (let k = 0; k < 4; k++) {
        const rk = new THREE.InstancedMesh(boulderGeometry(11 + k * 7), mat, PER);
        rk.castShadow = true;
        rk.receiveShadow = true;
        rk.frustumCulled = false;
        this.rocks.push(rk);
        this.scene.add(rk);
      }
    }
    const cx = new THREE.Vector3(...c);
    const t1 = new THREE.Vector3().crossVectors(Math.abs(c[2]) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), cx).normalize();
    const t2 = new THREE.Vector3().crossVectors(cx, t1);
    const P0 = new THREE.Vector3(...this.patchAt!.c).multiplyScalar(R);
    let s = Math.floor((c[0] + c[1] * 7 + c[2] * 13) * 1e6) >>> 0;
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    const alb = [0, 0, 0];
    // rocks tinted from dark basalt to rusty, all dusted with the local soil's colour
    const tones: [number, number, number][] = [[0.13, 0.11, 0.1], [0.17, 0.13, 0.11], [0.26, 0.16, 0.11], [0.32, 0.21, 0.14], [0.38, 0.3, 0.24]];
    for (const rk of this.rocks)
      for (let i = 0; i < PER; i++) {
        // denser close to the ship (where the camera is), thinning out to 700 m
        const rho = 6 + Math.pow(r(), 1.6) * 700, th = r() * Math.PI * 2;
        const a = rho / R;
        const d = cx.clone().multiplyScalar(Math.cos(a)).addScaledVector(t1, Math.sin(a) * Math.cos(th)).addScaledVector(t2, Math.sin(a) * Math.sin(th)).normalize();
        const lat = Math.asin(d.z) / D2R, lon = Math.atan2(d.y, d.x) / D2R;
        const size = 0.12 + Math.pow(r(), 5) * 2.4;
        const sink = 0.15 + r() * 0.35;
        const p = d.clone().multiplyScalar(R + marsHeight(lat, lon) - size * 0.62 * sink).sub(P0);
        // sitting on the ground, turned at random and tipped a little
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28))
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (r() - 0.5) * 0.5));
        m.compose(p, q, new THREE.Vector3(size * (0.8 + r() * 0.5), size, size * (0.8 + r() * 0.5)));
        rk.setMatrixAt(i, m);
        const t = tones[Math.floor(r() * tones.length)];
        mapAlbedo(lat, lon, alb);
        const dust = 0.25 + r() * 0.35;
        col.setRGB(t[0] * (1 - dust) + alb[0] * 0.75 * dust, t[1] * (1 - dust) + alb[1] * 0.75 * dust, t[2] * (1 - dust) + alb[2] * 0.75 * dust);
        rk.setColorAt(i, col);
      }
    for (const rk of this.rocks) {
      rk.instanceMatrix.needsUpdate = true;
      if (rk.instanceColor) rk.instanceColor.needsUpdate = true;
    }
    this.rocksAt = c;
  }

  /** the dust storm under the engines: placed on the ground below, carried round with Mars */
  private stepDust(v: MarsViewState, dt: number, h: number, sunI: number, sun: THREE.Vector3, thick: number): void {
    const o = v.origin;
    const up = new THREE.Vector3(...o).normalize();
    const rz = new THREE.Matrix4().makeRotationZ(-v.angle);
    const f = new THREE.Vector3(...o).applyMatrix4(rz).normalize();
    const lat = Math.asin(f.z) / D2R, lon = Math.atan2(f.y, f.x) / D2R;
    const ground = R + marsHeight(lat, lon);
    const agl = Math.hypot(...o) - ground;
    const groundPt = up.clone().multiplyScalar(-agl);
    // where the scene's particles were last frame, relative to the ship now: the ground turns with Mars
    const shift = new THREE.Vector3();
    if (this.prevO) {
      const pa = new THREE.Vector3(...this.prevO).applyAxisAngle(new THREE.Vector3(0, 0, 1), v.angle - this.prevAngle);
      shift.set(pa.x - o[0], pa.y - o[1], pa.z - o[2]);
      if (shift.length() > 500) shift.set(0, 0, 0);
    }
    this.prevO = [o[0], o[1], o[2]];
    this.prevAngle = v.angle;
    const eAgl = v.engineAgl ?? agl;
    const power = v.dust * THREE.MathUtils.smoothstep(-eAgl, -170, -20);
    const alb = [0, 0, 0];
    mapAlbedo(lat, lon, alb);
    const soil = new THREE.Color(alb[0] * 0.95, alb[1] * 0.9, alb[2] * 0.85);
    const el = Math.max(0, up.dot(sun));
    const li = (sunI * el) / Math.PI + 0.3 * thick;
    const light = new THREE.Vector3(li, li * 0.92, li * 0.84);
    const glow = v.dust * THREE.MathUtils.smoothstep(-eAgl, -120, -5) * 0.35;
    const floor = (p: THREE.Vector3) => {
      const d = (p.x - groundPt.x) * up.x + (p.y - groundPt.y) * up.y + (p.z - groundPt.z) * up.z;
      return d < 0 ? -d : null;
    };
    this.dust.update(dt, h, groundPt, up, power, shift, soil, light, glow, floor);
  }
}
