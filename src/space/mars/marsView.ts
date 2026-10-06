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
import { MAP_W, MAP_H, buildMarsMaps, marsMaps, marsHeight, mapAlbedo } from './marsGlobe';
import type { Vec } from './marsPhysics';
import { MARS } from './marsPhysics';

const R = MARS.R;
const D2R = Math.PI / 180;

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
uniform sampler2D heightTex;
uniform vec3 sunF;
uniform vec3 camW;
uniform float ready;
varying vec3 vP;
varying vec3 vW;
#include <common>
#include <logdepthbuf_pars_fragment>
vec2 llUV(vec3 d) {
  float lat = asin(clamp(d.z, -1.0, 1.0));
  float lon = atan(d.y, d.x);
  return vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
}
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vP);
  vec2 uv = llUV(d);
  vec3 alb = ready > 0.5 ? texture2D(albedoTex, uv).rgb : vec3(0.45, 0.26, 0.15);
  // fine streaks and mottling below the map's resolution
  float n = vn(d * 900.0) * 0.5 + vn(d * 3000.0) * 0.3 + vn(d * 9000.0) * 0.2;
  alb *= 0.86 + 0.28 * n;
  // relief from the height map: east and north slopes
  vec3 E = normalize(vec3(-d.y, d.x, 0.0) + 1e-6);
  vec3 N = cross(d, E);
  float du = 1.0 / ${MAP_W.toFixed(1)}, dv = 1.0 / ${MAP_H.toFixed(1)};
  float hE = texture2D(heightTex, uv + vec2(du, 0.0)).r - texture2D(heightTex, uv - vec2(du, 0.0)).r;
  float hN = texture2D(heightTex, uv - vec2(0.0, dv)).r - texture2D(heightTex, uv + vec2(0.0, dv)).r;
  float cl = max(0.05, sqrt(1.0 - d.z * d.z));
  float kmE = 2.0 * du * 2.0 * PI * ${(R / 1000).toFixed(1)} * cl, kmN = 2.0 * dv * PI * ${(R / 1000).toFixed(1)};
  vec3 nrm = normalize(d - E * (hE / kmE) * 6.0 - N * (hN / kmN) * 6.0);
  float mu0 = dot(nrm, sunF);
  float muG = dot(d, sunF);
  float lit = max(mu0, 0.0) * smoothstep(-0.08, 0.06, muG);
  vec3 col = alb * lit * 2.6;
  // dusty air: haze toward the limb, lit by the Sun
  vec3 toCam = normalize(camW - vW);
  float muV = max(0.02, dot(d, normalize(camW - vW + d * 0.0)));
  float haze = (1.0 - exp(-0.07 / muV)) * smoothstep(-0.25, 0.2, muG);
  col = mix(col, vec3(0.62, 0.42, 0.28) * 1.2 * max(0.0, muG + 0.15), clamp(haze, 0.0, 0.7));
  // a little skylight on the night side near the terminator
  col += alb * vec3(0.06, 0.07, 0.1) * smoothstep(-0.25, 0.0, muG) * (1.0 - smoothstep(0.0, 0.1, muG));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 sunF;
uniform vec3 camW;
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
  float k = pow(rim, 5.0) * day;
  // the limb: dusty pink in daylight, blue where the light comes in low
  vec3 c = mix(vec3(0.35, 0.5, 0.95), vec3(0.95, 0.62, 0.42), smoothstep(-0.1, 0.45, s));
  gl_FragColor = vec4(c * k * 1.4, 1.0);
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
  float day = smoothstep(-0.18, 0.12, se);
  // butterscotch near the horizon, a darker brownish-tan overhead
  vec3 hor = vec3(0.86, 0.6, 0.4);
  vec3 zen = vec3(0.45, 0.31, 0.22);
  vec3 c = mix(hor, zen, pow(clamp(e, 0.0, 1.0), 0.55));
  // below the horizon line the haze is thickest
  c = mix(c, hor * 0.9, smoothstep(0.02, -0.15, e));
  // the blue glow round the Sun (fine dust scatters blue forward): strongest at sunrise and sunset
  float halo = exp(-(1.0 - cs) * 14.0);
  float low = 1.0 - smoothstep(0.05, 0.6, se);
  c = mix(c, vec3(0.5, 0.66, 0.95), halo * (0.35 + 0.6 * low));
  c += vec3(1.0, 0.95, 0.85) * exp(-(1.0 - cs) * 400.0) * 3.0;
  // twilight: the sky dims and reddens as the Sun goes down
  c *= day * (0.55 + 0.45 * smoothstep(0.0, 0.4, se));
  c += vec3(0.08, 0.1, 0.18) * (1.0 - day) * 0.15;
  gl_FragColor = vec4(c * thick * 1.6, 1.0);
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
  /** fraction of engine power on and the exhaust's ground point, for the dust */
  dust: number;
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
  private rocks: THREE.InstancedMesh | null = null;
  private rocksAt: Vec | null = null;
  private fog = new THREE.FogExp2(0xc08a60, 0);
  private texReady = false;
  private dust: THREE.Points;
  private dustPos: Float32Array;
  private dustVel: Float32Array;
  private dustAge: Float32Array;
  private dustN = 400;
  private dustNext = 0;

  constructor() {
    const dummy = new THREE.DataTexture(new Uint8Array([110, 70, 40, 255]), 1, 1);
    dummy.needsUpdate = true;
    const dummyH = new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
    dummyH.needsUpdate = true;
    this.globeMat = new THREE.ShaderMaterial({
      uniforms: { albedoTex: { value: dummy }, heightTex: { value: dummyH }, sunF: { value: new THREE.Vector3(1, 0, 0) }, camW: { value: new THREE.Vector3() }, ready: { value: 0 }, lift: { value: 1 } },
      vertexShader: GLOBE_VERT,
      fragmentShader: GLOBE_FRAG,
    });
    const sg = new THREE.SphereGeometry(1, 512, 256);
    sg.rotateX(Math.PI / 2); // the pole along +Z
    this.globe = new THREE.Mesh(sg, this.globeMat);
    this.globe.frustumCulled = false;
    this.scene.add(this.globe);
    this.atmoMat = new THREE.ShaderMaterial({
      uniforms: { sunF: { value: new THREE.Vector3(1, 0, 0) }, camW: { value: new THREE.Vector3() } },
      vertexShader: SIMPLE_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(R + 70_000, 192, 96), this.atmoMat);
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
    this.starMat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending });
    this.stars = new THREE.Points(stg, this.starMat);
    this.stars.renderOrder = -9;
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
    // the ground's fine texture: pebbles, grains and small pits
    const reg = (() => {
      const N2 = 512;
      const cv = document.createElement('canvas');
      cv.width = cv.height = N2;
      const gg = cv.getContext('2d')!;
      const img = gg.createImageData(N2, N2);
      let s2 = 777;
      const rr = () => ((s2 = (s2 * 1664525 + 1013904223) >>> 0) / 4294967296);
      const h = new Float32Array(N2 * N2);
      for (let i = 0; i < N2 * N2; i++) h[i] = rr() * 0.3;
      for (let k = 0; k < 1400; k++) {
        const cx = rr() * N2, cy = rr() * N2, rad = 1.5 + Math.pow(rr(), 3) * 18, pebble = rr() < 0.7;
        for (let y = -rad - 2; y <= rad + 2; y++)
          for (let x = -rad - 2; x <= rad + 2; x++) {
            const dd = Math.hypot(x, y) / rad;
            if (dd > 1.3) continue;
            const xi = (Math.floor(cx + x) + N2) % N2, yi = (Math.floor(cy + y) + N2) % N2;
            h[yi * N2 + xi] += pebble ? Math.max(0, 1 - dd * dd) * 0.7 : dd < 1 ? -(1 - dd * dd) * 0.5 : 0;
          }
      }
      for (let i = 0; i < N2 * N2; i++) {
        const v = Math.max(0, Math.min(255, 140 + h[i] * 90));
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v * 0.97;
        img.data[i * 4 + 2] = v * 0.94;
        img.data[i * 4 + 3] = 255;
      }
      gg.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.patchMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: reg, bumpMap: reg, bumpScale: 1.6 });
    this.scene.fog = this.fog;
    // dust kicked up by the engines
    this.dustPos = new Float32Array(this.dustN * 3);
    this.dustVel = new Float32Array(this.dustN * 3);
    this.dustAge = new Float32Array(this.dustN).fill(99);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    const dc = document.createElement('canvas');
    dc.width = dc.height = 64;
    const dgc = dc.getContext('2d')!;
    const dgr = dgc.createRadialGradient(32, 32, 0, 32, 32, 32);
    dgr.addColorStop(0, 'rgba(190,130,90,0.55)');
    dgr.addColorStop(1, 'rgba(190,130,90,0)');
    dgc.fillStyle = dgr;
    dgc.fillRect(0, 0, 64, 64);
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dc), size: 26, transparent: true, depthWrite: false, color: 0xd6a072 }));
    this.dust.frustumCulled = false;
    this.local.add(this.dust);
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
    const ht = new THREE.DataTexture(m.height, MAP_W, MAP_H, THREE.RedFormat, THREE.FloatType);
    ht.wrapS = THREE.RepeatWrapping;
    ht.magFilter = THREE.NearestFilter;
    ht.minFilter = THREE.NearestFilter;
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
    (this.atmoMat.uniforms.sunF.value as THREE.Vector3).copy(sun);
    (this.atmoMat.uniforms.camW.value as THREE.Vector3).copy(cam.position);
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
    this.starMat.opacity = Math.max(0, 1 - dayAir * 1.6);
    this.sunSprite.position.copy(cam.position).addScaledVector(sun, 800);
    this.sunSprite.scale.setScalar(800 * 0.04);
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
    this.sunLight.intensity = shadowed ? 0 : 2.6 * (0.25 + 0.75 * ext);
    this.sunLight.color.setRGB(1, 0.92 + 0.06 * ext, 0.82 + 0.15 * ext);
    this.hemi.position.copy(oUp);
    this.hemi.intensity = 0.05 + 0.75 * air * Math.max(0, elev + 0.1);
    // the dust haze over the ground
    const near = camAlt < 40_000;
    this.fog.density = near ? 1 / 32_000 * Math.min(1, thick * 2.5) : 0;
    this.fog.color.setRGB(0.62 * dayAir + 0.02, 0.43 * dayAir + 0.02, 0.3 * dayAir + 0.03);
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
        this.rocks!.position.copy(this.patch!.position);
        this.rocks!.quaternion.copy(this.patch!.quaternion);
        this.rocks!.visible = true;
      } else if (this.rocks) this.rocks.visible = false;
    } else {
      if (this.patch) this.patch.visible = false;
      if (this.rocks) this.rocks.visible = false;
      this.globe.scale.setScalar(1);
    }
    this.stepDust(v, dt);
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
      const hgt = marsHeight(lat, lon);
      const p = d.clone().multiplyScalar(R + hgt).sub(P0);
      pos.set([p.x, p.y, p.z], i * 3);
      mapAlbedo(lat, lon, alb);
      // a little local variation in the dust
      const vv = 0.88 + 0.24 * Math.sin(lat * 1300 + lon * 900) * Math.sin(lat * 470 - lon * 610);
      col.set([alb[0] * vv * 1.15, alb[1] * vv * 1.1, alb[2] * vv * 1.05], i * 3);
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

  /** boulders strewn round the landing point (Mars-fixed, in the patch's frame) */
  private buildRocks(c: Vec): void {
    const N = 900;
    if (!this.rocks) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = 0.75 + 0.35 * Math.sin(x * 5.1 + y * 3.3) * Math.cos(z * 4.7 - x * 2.1);
        p.setXYZ(i, x * n * 1.2, y * n * 0.62, z * n);
      }
      g.computeVertexNormals();
      this.rocks = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x6a4030, roughness: 0.9, flatShading: true }), N);
      this.rocks.castShadow = true;
      this.rocks.receiveShadow = true;
      this.rocks.frustumCulled = false;
      this.scene.add(this.rocks);
    }
    const cx = new THREE.Vector3(...c);
    const t1 = new THREE.Vector3().crossVectors(Math.abs(c[2]) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), cx).normalize();
    const t2 = new THREE.Vector3().crossVectors(cx, t1);
    const P0 = new THREE.Vector3(...this.patchAt!.c).multiplyScalar(R);
    let s = Math.floor((c[0] + c[1] * 7 + c[2] * 13) * 1e6) >>> 0;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const rho = 14 + Math.pow(r(), 0.7) * 420, th = r() * Math.PI * 2;
      const a = rho / R;
      const d = cx.clone().multiplyScalar(Math.cos(a)).addScaledVector(t1, Math.sin(a) * Math.cos(th)).addScaledVector(t2, Math.sin(a) * Math.sin(th)).normalize();
      const lat = Math.asin(d.z) / D2R, lon = Math.atan2(d.y, d.x) / D2R;
      const size = 0.08 + Math.pow(r(), 4) * 1.6;
      const p = d.clone().multiplyScalar(R + marsHeight(lat, lon) + size * 0.25).sub(P0);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28));
      m.compose(p, q, new THREE.Vector3(size, size, size));
      this.rocks.setMatrixAt(i, m);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    this.rocksAt = c;
  }

  /** dust blown out from under the engines when they fire near the ground */
  private stepDust(v: MarsViewState, dt: number): void {
    const o = v.origin;
    const up = new THREE.Vector3(...o).normalize();
    const lat = Math.asin(Math.max(-1, Math.min(1, new THREE.Vector3(...o).applyMatrix4(new THREE.Matrix4().makeRotationZ(-v.angle)).normalize().z)));
    void lat;
    const ll = (() => {
      const f = new THREE.Vector3(...o).applyMatrix4(new THREE.Matrix4().makeRotationZ(-v.angle)).normalize();
      return { lat: Math.asin(f.z) / D2R, lon: Math.atan2(f.y, f.x) / D2R };
    })();
    const ground = R + marsHeight(ll.lat, ll.lon);
    const agl = Math.hypot(...o) - ground;
    const groundPt = up.clone().multiplyScalar(-agl);
    if (v.dust > 0.05 && agl < 120) {
      const n = Math.floor(dt * 160 * v.dust * (1 - agl / 120)) + 1;
      for (let k = 0; k < n; k++) {
        const i = this.dustNext;
        this.dustNext = (this.dustNext + 1) % this.dustN;
        const a = Math.random() * Math.PI * 2;
        const side = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
        side.addScaledVector(up, -side.dot(up)).normalize();
        const sp = 25 + Math.random() * 40;
        this.dustPos.set([groundPt.x, groundPt.y, groundPt.z], i * 3);
        const vel = side.multiplyScalar(sp).addScaledVector(up, 3 + Math.random() * 8);
        this.dustVel.set([vel.x, vel.y, vel.z], i * 3);
        this.dustAge[i] = 0;
      }
    }
    for (let i = 0; i < this.dustN; i++) {
      if (this.dustAge[i] > 6) {
        this.dustPos[i * 3 + 2] = 1e9;
        continue;
      }
      this.dustAge[i] += dt;
      const dmp = Math.exp(-dt * 0.9);
      for (let k = 0; k < 3; k++) {
        this.dustVel[i * 3 + k] *= dmp;
        this.dustPos[i * 3 + k] += this.dustVel[i * 3 + k] * dt;
      }
    }
    (this.dust.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
