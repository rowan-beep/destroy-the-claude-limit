// The spectacle of coming down on Mars.
//
// Entry: a sheath of glowing plasma hugs the windward belly, flickering, with a
// long pink-orange wake streaming behind the ship and embers torn off the flap
// edges. The landing burn: the Raptors blast the ground into a ring of dust that
// races outward and billows up, flinging grit and pebbles, all lit orange from
// below by the engines. After touchdown the cloud drifts and settles.

import * as THREE from 'three';
import { PLUME_FRAG, PLUME_VERT } from '../plumes';

// ------------------------------------------------------------------ particles with their own size, colour and fade
const PART_VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aCol;
uniform float pxScale;
varying vec4 vCol;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * pxScale / max(0.5, -mv.z), 1.5, 900.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const PART_FRAG = /* glsl */ `
uniform float soft;
uniform vec3 light;
uniform vec3 glowCol;
varying vec4 vCol;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  // soft billows (lit a little more on top) or hard grains
  float a = soft > 0.5 ? pow(1.0 - r2, 1.6) : 1.0 - smoothstep(0.6, 1.0, r2);
  float shade = soft > 0.5 ? 0.8 + 0.35 * (-q.y) : 1.0;
  vec3 c = vCol.rgb * light * shade + glowCol * vCol.a;
  gl_FragColor = vec4(c, a * vCol.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Particles {
  readonly points: THREE.Points;
  readonly mat: THREE.ShaderMaterial;
  pos: Float32Array;
  vel: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size0: Float32Array;
  grow: Float32Array;
  base: Float32Array;
  private sizeA: Float32Array;
  private colA: Float32Array;
  next = 0;
  constructor(readonly n: number, soft: boolean, additive = false) {
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(1e9);
    this.life = new Float32Array(n).fill(1);
    this.size0 = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.base = new Float32Array(n * 4);
    this.sizeA = new Float32Array(n);
    this.colA = new Float32Array(n * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sizeA, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.colA, 4));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { pxScale: { value: 600 }, soft: { value: soft ? 1 : 0 }, light: { value: new THREE.Vector3(1, 1, 1) }, glowCol: { value: new THREE.Vector3() } },
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, grow: number, r: number, g: number, b: number, a: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.size0[i] = size;
    this.grow[i] = grow;
    this.base.set([r, g, b, a], i * 4);
  }
  /** move everything by `shift` (the floating origin moved) and step: drag, gravity along -up, and the fade */
  step(dt: number, shift: THREE.Vector3, drag: number, gravity: number, up: THREE.Vector3, floor: (p: THREE.Vector3) => number | null, fadeIn = 0.15): void {
    const tmp = new THREE.Vector3();
    const k = Math.exp(-drag * dt);
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i];
      if (a > this.life[i]) {
        this.colA[i * 4 + 3] = 0;
        this.sizeA[i] = 0;
        continue;
      }
      this.age[i] = a + dt;
      const o = i * 3;
      for (let c = 0; c < 3; c++) this.vel[o + c] *= k;
      this.vel[o] -= up.x * gravity * dt;
      this.vel[o + 1] -= up.y * gravity * dt;
      this.vel[o + 2] -= up.z * gravity * dt;
      for (let c = 0; c < 3; c++) this.pos[o + c] += this.vel[o + c] * dt + (c === 0 ? shift.x : c === 1 ? shift.y : shift.z);
      // stopped by the ground
      tmp.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
      const below = floor(tmp);
      if (below !== null && below > 0) {
        this.pos[o] += up.x * below;
        this.pos[o + 1] += up.y * below;
        this.pos[o + 2] += up.z * below;
        const vn = this.vel[o] * up.x + this.vel[o + 1] * up.y + this.vel[o + 2] * up.z;
        if (vn < 0) {
          // a pebble: a small bounce, then it skids to a stop
          this.vel[o] = (this.vel[o] - up.x * vn * 1.35) * 0.5;
          this.vel[o + 1] = (this.vel[o + 1] - up.y * vn * 1.35) * 0.5;
          this.vel[o + 2] = (this.vel[o + 2] - up.z * vn * 1.35) * 0.5;
        }
      }
      const t = this.age[i] / this.life[i];
      this.sizeA[i] = this.size0[i] + this.grow[i] * this.age[i];
      const fade = Math.min(1, t / fadeIn) * (1 - t) * (1 - t);
      this.colA.set([this.base[i * 4], this.base[i * 4 + 1], this.base[i * 4 + 2], this.base[i * 4 + 3] * fade], i * 4);
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aCol as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** the dust storm the landing burn raises, and the grit it throws */
export class LandingDust {
  readonly group = new THREE.Group();
  private billow = new Particles(1400, true);
  private grit = new Particles(700, false);
  private haze = new Particles(160, true);
  private acc = 0;
  private gAcc = 0;
  constructor() {
    this.group.add(this.haze.points, this.billow.points, this.grit.points);
  }
  /**
   * @param ground  the point on the ground under the engines (scene coords)
   * @param up      local vertical
   * @param power   engine power reaching the ground (0..1, falls off with height)
   * @param shift   how far the scene moved under the particles this frame
   * @param soil    the local soil colour (linear)
   * @param light   the light on the dust (sun and sky)
   * @param glow    the engines' orange light on the dust (0..1)
   */
  update(dt: number, h: number, ground: THREE.Vector3, up: THREE.Vector3, power: number, shift: THREE.Vector3, soil: THREE.Color, light: THREE.Vector3, glow: number, groundBelow: (p: THREE.Vector3) => number | null): void {
    const side = new THREE.Vector3(), b2 = new THREE.Vector3();
    const t1 = new THREE.Vector3().crossVectors(up, Math.abs(up.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(up, t1);
    const ring = (sp: number) => {
      const a = Math.random() * Math.PI * 2;
      side.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
      return side.clone().multiplyScalar(sp);
    };
    if (power > 0.02) {
      // the blast: a racing ring of dust, faster and denser the closer the engines
      this.acc += dt * 240 * power;
      while (this.acc > 1) {
        this.acc -= 1;
        const sp = 35 + Math.random() * 110 * (0.5 + power);
        const v = ring(sp).addScaledVector(up, 2 + Math.random() * 14);
        const p = ground.clone().addScaledVector(v, 0.02 + Math.random() * 0.08).addScaledVector(up, 1 + Math.random() * 3);
        const tone = 0.8 + Math.random() * 0.35;
        this.billow.spawn(p, v, 6 + Math.random() * 9, 4 + Math.random() * 6, 2.5 + Math.random() * 4, soil.r * tone, soil.g * tone, soil.b * tone, 0.2 + Math.random() * 0.2);
      }
      // grit and pebbles flung out low and fast
      this.gAcc += dt * 260 * power;
      while (this.gAcc > 1) {
        this.gAcc -= 1;
        const v = ring(40 + Math.random() * 90).addScaledVector(up, 6 + Math.random() * 35);
        const p = ground.clone().addScaledVector(up, 0.5);
        const d = 0.25 + Math.random() * 0.25;
        this.grit.spawn(p, v, 3 + Math.random() * 4, 0.3 + Math.random() * 0.9, 0, d * 0.9, d * 0.6, d * 0.45, 1);
      }
      // a slow pall of fine dust that hangs in the air round the ship
      if (Math.random() < dt * 18 * power) {
        b2.copy(ring(8 + Math.random() * 14)).addScaledVector(up, 2 + Math.random() * 5);
        this.haze.spawn(ground.clone().addScaledVector(up, 4 + Math.random() * 10), b2, 18 + Math.random() * 14, 30 + Math.random() * 30, 4 + Math.random() * 4, soil.r * 1.05, soil.g * 1.05, soil.b * 1.05, 0.1);
      }
    }
    const scale = h / (2 * Math.tan((55 * Math.PI) / 360));
    for (const pp of [this.billow, this.grit, this.haze]) pp.mat.uniforms.pxScale.value = scale;
    for (const pp of [this.billow, this.haze]) {
      (pp.mat.uniforms.light.value as THREE.Vector3).copy(light);
      (pp.mat.uniforms.glowCol.value as THREE.Vector3).set(1.6 * glow, 0.62 * glow, 0.2 * glow);
    }
    (this.grit.mat.uniforms.light.value as THREE.Vector3).copy(light);
    const none = () => null;
    this.billow.step(dt, shift, 0.55, -0.4, up, none);
    this.haze.step(dt, shift, 0.25, -0.15, up, none, 0.3);
    this.grit.step(dt, shift, 0.05, 3.71, up, groundBelow, 0.01);
  }
}

// ------------------------------------------------------------------ entry: the plasma
const SHEATH_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const SHEATH_FRAG = /* glsl */ `
uniform float k;
uniform float time;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
#include <common>
#include <logdepthbuf_pars_fragment>
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  #include <logdepthbuf_fragment>
  float fr = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  // the shock layer is thickest on the windward side (+x), streaming back over the flanks
  float wind = smoothstep(-0.6, 0.9, vP.x);
  float n = n3(vec3(vP.x * 3.0, vP.y * 1.2 - time * 7.0, vP.z * 3.0)) * 0.6 + n3(vec3(vP.x * 9.0, vP.y * 4.0 - time * 19.0, vP.z * 9.0)) * 0.4;
  float a = (0.08 + pow(fr, 2.0) * 1.5) * wind * (0.6 + 0.8 * n);
  vec3 c = mix(vec3(1.0, 0.36, 0.2), vec3(1.0, 0.78, 0.62), pow(fr, 3.0));
  c = mix(c, vec3(0.85, 0.45, 1.0), 0.18 * n);
  gl_FragColor = vec4(c * a * k * 1.0, 1.0);
}`;

export class EntryFx {
  /** around the ship (child of the ship model, ship frame: +Y along the hull, +X the belly) */
  readonly sheath: THREE.Mesh;
  /** in the scene, streaming downwind */
  readonly wake: THREE.Mesh;
  readonly embers = new Particles(500, false, true);
  private sheathMat: THREE.ShaderMaterial;
  private wakeMat: THREE.ShaderMaterial;
  private t = 0;
  private acc = 0;
  constructor() {
    this.sheathMat = new THREE.ShaderMaterial({ uniforms: { k: { value: 0 }, time: { value: 0 } }, vertexShader: SHEATH_VERT, fragmentShader: SHEATH_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.sheath = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.sheathMat);
    this.sheath.scale.set(7.2, 29, 6.4);
    this.sheath.position.set(1.8, 25, 0);
    this.sheath.renderOrder = 12;
    this.sheath.frustumCulled = false;
    this.sheath.visible = false;
    this.wakeMat = new THREE.ShaderMaterial({
      uniforms: {
        r0: { value: 9 }, r1: { value: 26 }, spread: { value: 0.6 },
        core: { value: new THREE.Color(2.6, 1.3, 1.1) }, outer: { value: new THREE.Color(1.3, 0.42, 0.42) }, smoke: { value: new THREE.Color(0.4, 0.12, 0.25) },
        power: { value: 0 }, time: { value: 0 }, len: { value: 300 }, diamonds: { value: 0 }, curtain: { value: 0 }, turb: { value: 1 }, seed: { value: 3.3 },
      },
      vertexShader: PLUME_VERT,
      fragmentShader: PLUME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const g = new THREE.CylinderGeometry(1, 1, 1, 40, 24, true);
    g.translate(0, -0.5, 0);
    this.wake = new THREE.Mesh(g, this.wakeMat);
    this.wake.frustumCulled = false;
    this.wake.renderOrder = 11;
    this.wake.visible = false;
  }

  /**
   * @param k        heating, 0..1
   * @param mid      the ship's middle (scene)
   * @param down     the direction the air streams past the ship (scene, unit)
   * @param shipM    the ship model's world matrix (for where the embers come off)
   * @param shift    floating-origin shift this frame
   */
  update(dt: number, h: number, k: number, mid: THREE.Vector3, down: THREE.Vector3, shipM: THREE.Matrix4, shift: THREE.Vector3): void {
    this.t += dt;
    const on = k > 0.02;
    this.sheath.visible = this.wake.visible = on;
    this.sheathMat.uniforms.k.value = k * (0.9 + 0.1 * Math.sin(this.t * 37));
    this.sheathMat.uniforms.time.value = this.t;
    if (on) {
      this.wake.position.copy(mid).addScaledVector(down, 10);
      this.wake.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), down);
      const L = 140 + 380 * k;
      this.wake.scale.set(1, L, 1);
      const u = this.wakeMat.uniforms;
      u.len.value = L;
      u.time.value = this.t;
      u.r0.value = 7 + 3 * k;
      u.r1.value = 18 + 24 * k;
      u.power.value = 0.55 * k * (0.9 + 0.1 * Math.sin(this.t * 23));
      // embers torn off the flap tips and the belly's edges
      this.acc += dt * 160 * k;
      const p = new THREE.Vector3(), v = new THREE.Vector3();
      while (this.acc > 1) {
        this.acc -= 1;
        const y = Math.random() < 0.5 ? 5 + Math.random() * 8 : 38 + Math.random() * 8;
        p.set(2 + Math.random() * 3, y, (Math.random() < 0.5 ? -1 : 1) * (4.5 + Math.random() * 3)).applyMatrix4(shipM);
        v.copy(down).multiplyScalar(60 + Math.random() * 220).add(new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20));
        const w = 0.7 + Math.random() * 0.6;
        this.embers.spawn(p, v, 0.6 + Math.random() * 1.2, 0.5 + Math.random() * 0.9, 0, 3.2 * w, 1.4 * w, 0.6 * w, 1);
      }
    }
    this.embers.mat.uniforms.pxScale.value = h / (2 * Math.tan((55 * Math.PI) / 360));
    (this.embers.mat.uniforms.light.value as THREE.Vector3).set(1, 1, 1);
    this.embers.step(dt, shift, 0.4, 0, new THREE.Vector3(0, 0, 1), () => null, 0.01);
  }
}
