// The wind on Mars, made visible.
//
// Dust layers: a stack of thin, ground-hugging sheets of suspended dust,
// streaked and billowing (a tileable noise texture, sampled at three scales)
// and drifting downwind, densest near the ground and thinning with height.
// They are anchored to the ground, so the streaks race past as the ship comes
// down, and they fade out near the camera and toward the horizon (the haze
// takes over there). Dust devils: tall, leaning columns of whirling dust that
// wander slowly across the plain a few kilometres away, as the rovers film
// them. Motes: fine grit blowing past the camera in the gusts.
//
// Everything here is in the "patch frame": Mars-fixed coordinates relative to
// a point on the ground (P0), the same frame the ground mesh and the boulders
// use, so it all turns with the planet.

import * as THREE from 'three';
import type { Vec } from './marsPhysics';

// ------------------------------------------------------------------ a tileable noise texture
let noiseTex: THREE.DataTexture | null = null;
function dustNoise(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const N = 256;
  const hash = (x: number, y: number, s: number) => {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x: number, y: number, p: number, s: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const w = (i: number) => ((i % p) + p) % p;
    const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (u: number, v: number, base: number, oct: number, s: number) => {
    let sum = 0, amp = 0.5, tot = 0, p = base;
    for (let o = 0; o < oct; o++) {
      sum += amp * vnoise(u * p, v * p, p, s + o * 31);
      tot += amp;
      amp *= 0.5;
      p *= 2;
    }
    return sum / tot;
  };
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      // r: billows, g: fine streaks (stretched along x, the wind), b: a ridged texture for the devils
      const r = fbm(u, v, 4, 5, 1);
      const g = fbm(u, v * 1, 16, 4, 7) * 0.5 + fbm(u, v, 8, 3, 9) * 0.5;
      const rid = 1 - Math.abs(fbm(u, v, 8, 4, 13) * 2 - 1);
      const i = (y * N + x) * 4;
      data[i] = Math.round(Math.min(1, Math.max(0, (r - 0.5) * 1.9 + 0.5)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, (g - 0.5) * 1.8 + 0.5)) * 255);
      data[i + 2] = Math.round(rid * rid * 255);
      data[i + 3] = 255;
    }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

// ------------------------------------------------------------------ dust layers
const LAYER_VERT = /* glsl */ `
uniform mat4 toFixed;
varying vec3 vFixed;
varying vec3 vView;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vFixed = (toFixed * vec4(position, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const LAYER_FRAG = /* glsl */ `
uniform sampler2D noise;
uniform vec3 E;
uniform vec3 N;
uniform vec2 wind;
uniform float time;
uniform float alpha;
uniform vec3 lit;
uniform vec3 camFixed;
uniform float seed;
varying vec3 vFixed;
varying vec3 vView;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vec2(dot(vFixed, E), dot(vFixed, N));
  // the streaks run downwind: sample along the wind, stretched
  vec2 wd = normalize(wind + 1e-6);
  mat2 rot = mat2(wd.x, -wd.y, wd.y, wd.x);
  vec2 q = rot * (p - wind * time);
  float b = texture2D(noise, q / vec2(2600.0, 1500.0) + seed).r;
  float s = texture2D(noise, q / vec2(900.0, 160.0) + seed * 1.7).g;
  float f = texture2D(noise, (rot * (p - wind * time * 1.6)) / vec2(260.0, 70.0) + seed * 2.3).g;
  float d = smoothstep(0.38, 0.95, b * 0.55 + s * 0.3 + f * 0.25);
  // out of the way close to the camera, gone toward the horizon (the haze takes over)
  float dist = length(vView);
  float fade = smoothstep(18.0, 140.0, dist) * (1.0 - smoothstep(4500.0, 9000.0, dist));
  float a = d * alpha * fade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(lit * (0.85 + 0.3 * f), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------ dust devils
const DEVIL_VERT = /* glsl */ `
uniform float time;
uniform float spin;
uniform float lean;
varying vec2 vUv;
varying float vRim;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vec3 p = position;
  // a column that widens with height, wobbles and leans downwind
  float h = uv.y;
  float wob = sin(h * 7.0 + time * 1.3) * 0.08 + sin(h * 13.0 - time * 2.1) * 0.04;
  p.x += (lean * h * h + wob) * 1.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * normalize(vec3(position.x, 0.0, position.z)));
  vRim = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const DEVIL_FRAG = /* glsl */ `
uniform sampler2D noise;
uniform float time;
uniform float spin;
uniform float alpha;
uniform vec3 lit;
uniform float seed;
varying vec2 vUv;
varying float vRim;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  // dust whirling round the column, streaming upward
  vec2 q = vec2(vUv.x * 2.0 + time * spin, vUv.y * 3.0 - time * 0.35);
  float n = texture2D(noise, q * 0.5 + seed).b * 0.65 + texture2D(noise, q * 1.7 + seed).r * 0.35;
  float body = pow(vRim, 0.7);
  float h = vUv.y;
  // thickest low down, a ragged top that fades out
  float a = alpha * n * body * smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.55, 1.0, h));
  if (a < 0.004) discard;
  gl_FragColor = vec4(lit * (0.8 + 0.4 * n), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface Devil {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  /** Mars-fixed tangent-plane position (east, north, metres) relative to the patch centre */
  e: number;
  n: number;
  height: number;
  radius: number;
  life: number;
  age: number;
}

export interface WindState {
  /** Mars-fixed unit vector of the patch centre (the frame's origin is c * R) */
  c: Vec;
  /** Mars-fixed point under the camera (unit vector) and the camera's height above that ground */
  camDir: Vec;
  camAgl: number;
  /** ground height at a Mars-fixed direction (m above the datum) */
  ground: (d: THREE.Vector3) => number;
  R: number;
  /** sunlight and skylight on the dust (linear), and the elapsed time */
  lit: THREE.Color;
  dt: number;
  /** strength of the wind and dust (0 calm .. 1 dusty) */
  dustiness: number;
}

export class MarsWind {
  /** goes in the patch frame (positioned and turned like the ground mesh) */
  readonly group = new THREE.Group();
  /** world-space grit round the camera (in the scene directly) */
  readonly motes: THREE.Points;
  private layers: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; h: number }[] = [];
  private devils: Devil[] = [];
  private devilGeo: THREE.CylinderGeometry;
  private t = 0;
  /** wind velocity in the tangent plane (east, north) m/s, and its gusts */
  private windDir = Math.random() * Math.PI * 2;
  private gust = 0;
  private moteP: Float32Array;
  private moteV: Float32Array;
  private moteN = 700;
  private c: Vec | null = null;

  constructor() {
    const noise = dustNoise();
    const disc = new THREE.CircleGeometry(9000, 72, 0, Math.PI * 2);
    // a stack of sheets, crowded near the ground
    const heights = [2, 6, 14, 28, 50, 85, 140, 230, 380, 620];
    heights.forEach((h, i) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          noise: { value: noise },
          toFixed: { value: new THREE.Matrix4() },
          E: { value: new THREE.Vector3(1, 0, 0) },
          N: { value: new THREE.Vector3(0, 1, 0) },
          wind: { value: new THREE.Vector2(8, 0) },
          time: { value: 0 },
          alpha: { value: 0 },
          lit: { value: new THREE.Color() },
          camFixed: { value: new THREE.Vector3() },
          seed: { value: i * 0.137 },
        },
        vertexShader: LAYER_VERT,
        fragmentShader: LAYER_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(disc, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      this.group.add(mesh);
      this.layers.push({ mesh, mat, h });
    });
    this.devilGeo = new THREE.CylinderGeometry(1, 0.32, 1, 28, 24, true);
    this.devilGeo.translate(0, 0.5, 0);
    for (let k = 0; k < 4; k++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { noise: { value: noise }, time: { value: 0 }, spin: { value: 0.6 }, lean: { value: 0.2 }, alpha: { value: 0 }, lit: { value: new THREE.Color() }, seed: { value: k * 0.31 } },
        vertexShader: DEVIL_VERT,
        fragmentShader: DEVIL_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.devilGeo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      mesh.visible = false;
      this.group.add(mesh);
      this.devils.push({ mesh, mat, e: 0, n: 0, height: 0, radius: 0, life: 0, age: 1e9 });
    }
    // grit
    this.moteP = new Float32Array(this.moteN * 3);
    this.moteV = new Float32Array(this.moteN * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.moteP, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const cg = c.getContext('2d')!;
    const gr = cg.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = gr;
    cg.fillRect(0, 0, 32, 32);
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 0.09, transparent: true, depthWrite: false, opacity: 0.7, color: 0xc89870 }));
    this.motes.frustumCulled = false;
    this.motes.visible = false;
  }

  /**
   * @param s the frame state
   * @param camW the camera's position in the scene (world), for the grit
   * @param upW local vertical in the scene, eastW / northW the tangent axes in the scene
   */
  update(s: WindState, camW: THREE.Vector3, upW: THREE.Vector3, eastW: THREE.Vector3, northW: THREE.Vector3): void {
    const dt = Math.min(0.1, s.dt);
    this.t += dt;
    if (!this.c || this.c[0] !== s.c[0] || this.c[1] !== s.c[1] || this.c[2] !== s.c[2]) this.c = s.c;
    // the wind: a steady breeze from one quarter, veering slowly, with gusts
    this.windDir += dt * 0.004 * Math.sin(this.t * 0.05);
    this.gust = 0.6 + 0.4 * Math.sin(this.t * 0.31) * Math.sin(this.t * 0.17 + 1.3) + 0.25 * Math.sin(this.t * 1.7) * Math.sin(this.t * 0.9);
    const speed = (6 + 14 * s.dustiness) * this.gust;
    const we = Math.cos(this.windDir) * speed, wn = Math.sin(this.windDir) * speed;
    // tangent axes at the patch centre (Mars-fixed)
    const C = new THREE.Vector3(...s.c);
    const E = new THREE.Vector3().crossVectors(Math.abs(C.z) < 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0), C).normalize();
    const N = new THREE.Vector3().crossVectors(C, E);
    const P0 = C.clone().multiplyScalar(s.R);
    const low = 1 - THREE.MathUtils.smoothstep(s.camAgl, 1500, 9000);
    // ---- the sheets: centred under the camera, at their heights above its ground
    const gC = new THREE.Vector3(...s.camDir);
    const gH = s.ground(gC);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), gC);
    for (const L of this.layers) {
      const pos = gC.clone().multiplyScalar(s.R + gH + L.h).sub(P0);
      L.mesh.position.copy(pos);
      L.mesh.quaternion.copy(q);
      L.mesh.updateMatrix();
      const u = L.mat.uniforms;
      (u.toFixed.value as THREE.Matrix4).copy(L.mesh.matrix);
      (u.E.value as THREE.Vector3).copy(E);
      (u.N.value as THREE.Vector3).copy(N);
      (u.wind.value as THREE.Vector2).set(we * (1 + L.h / 900), wn * (1 + L.h / 900));
      u.time.value = this.t;
      // dense near the ground, thinning with height (scale height ~ 300 m for the blown dust)
      // (each sheet is thin: seen edge-on from the ground they stack up, so keep each faint)
      u.alpha.value = s.dustiness * low * 0.055 * Math.exp(-L.h / 320) * (0.75 + 0.25 * this.gust);
      (u.lit.value as THREE.Color).copy(s.lit);
      L.mesh.visible = u.alpha.value > 0.002;
    }
    // ---- dust devils, wandering the plain a few kilometres off
    for (const d of this.devils) {
      d.age += dt;
      if (d.age > d.life) {
        // a new one, somewhere round the camera
        const a = Math.random() * Math.PI * 2, r = 1500 + Math.random() * 6000;
        const ce = gC.clone().sub(C).dot(E) * s.R, cn = gC.clone().sub(C).dot(N) * s.R;
        d.e = ce + Math.cos(a) * r;
        d.n = cn + Math.sin(a) * r;
        d.height = 250 + Math.random() * 900;
        d.radius = 18 + Math.random() * 60;
        d.life = 40 + Math.random() * 90;
        d.age = 0;
        d.mat.uniforms.spin.value = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5);
        d.mat.uniforms.seed.value = Math.random();
      }
      // carried along by the wind
      d.e += we * dt * 0.7;
      d.n += wn * dt * 0.7;
      const dir = C.clone().addScaledVector(E, d.e / s.R).addScaledVector(N, d.n / s.R).normalize();
      const base = dir.clone().multiplyScalar(s.R + s.ground(dir) - 3).sub(P0);
      d.mesh.position.copy(base);
      // up along the local vertical, the lean toward the wind
      d.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const yaw = Math.atan2(wn, we);
      d.mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw));
      d.mesh.scale.set(d.radius, d.height, d.radius);
      const life = Math.min(1, d.age / 8) * Math.min(1, (d.life - d.age) / 8);
      const u = d.mat.uniforms;
      u.time.value = this.t;
      u.lean.value = 0.6 * (speed / 15);
      u.alpha.value = 0.55 * life * s.dustiness * low;
      (u.lit.value as THREE.Color).copy(s.lit).multiplyScalar(1.05);
      d.mesh.visible = u.alpha.value > 0.01;
    }
    // ---- grit blowing past the camera (world space, round the camera)
    const near = s.camAgl < 120;
    this.motes.visible = near && s.dustiness > 0.05;
    if (this.motes.visible) {
      const windW = eastW.clone().multiplyScalar(we).addScaledVector(northW, wn);
      const B = 60;
      for (let i = 0; i < this.moteN; i++) {
        const o = i * 3;
        let x = this.moteP[o] - camW.x, y = this.moteP[o + 1] - camW.y, z = this.moteP[o + 2] - camW.z;
        const far = Math.abs(x) > B || Math.abs(y) > B || Math.abs(z) > B || (x === 0 && y === 0 && z === 0);
        if (far) {
          // respawn upwind of the camera, low down
          const ra = (Math.random() - 0.5) * 2 * B, rb = (Math.random() - 0.5) * 2 * B;
          const up = Math.random() * 12 - s.camAgl * 0.5;
          const v = eastW.clone().multiplyScalar(ra).addScaledVector(northW, rb).addScaledVector(upW, up).addScaledVector(windW.clone().normalize(), -B * 0.8);
          x = v.x;
          y = v.y;
          z = v.z;
          this.moteV[o] = windW.x * (0.8 + Math.random() * 0.6);
          this.moteV[o + 1] = windW.y * (0.8 + Math.random() * 0.6);
          this.moteV[o + 2] = windW.z * (0.8 + Math.random() * 0.6);
        }
        const tur = 2.5;
        this.moteV[o] += (Math.random() - 0.5) * tur * dt * 10;
        this.moteV[o + 1] += (Math.random() - 0.5) * tur * dt * 10;
        this.moteV[o + 2] += (Math.random() - 0.5) * tur * dt * 10;
        this.moteP[o] = camW.x + x + this.moteV[o] * dt;
        this.moteP[o + 1] = camW.y + y + this.moteV[o + 1] * dt;
        this.moteP[o + 2] = camW.z + z + this.moteV[o + 2] * dt;
      }
      (this.motes.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.motes.material as THREE.PointsMaterial).color.copy(s.lit).multiplyScalar(1.2);
      (this.motes.material as THREE.PointsMaterial).opacity = 0.75 * s.dustiness;
    }
  }
}
