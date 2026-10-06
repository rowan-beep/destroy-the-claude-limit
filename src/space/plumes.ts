// Engine plumes, for every engine on the stack. Each is two additive layers: a
// tight, white-hot core and a wider envelope, both shaded with turbulence that
// streams down the flame, flickering, and shaped by the air: long and narrow at
// sea level with shock diamonds marching down the core, ballooning into a vast
// glowing cloud as the air thins. The F-1s burn kerosene: blinding yellow-white
// at the nozzle wrapped in the dark curtain of their turbine exhaust, deep
// orange and sooty further down. The J-2s burn hydrogen: a pale blue, nearly
// clear flame with crisp diamonds low down. The service module and the lunar
// module burn hypergolics: a faint, translucent orange-violet flame that is
// mostly glow in vacuum. The escape tower's solid motors are fierce and short.
// A hot glow and a lens-flare streak sit at each engine cluster.

import * as THREE from 'three';
import { ENGINES, FlightSim, StageId } from './flightSim';

export const PLUME_VERT = /* glsl */ `
uniform float r0;
uniform float r1;
uniform float spread;
varying float vT;
varying float vEdge;
varying float vAng;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  float t = -position.y;
  vT = t;
  vAng = atan(position.z, position.x);
  float r = mix(r0, r1, pow(t, spread));
  vec3 p = vec3(position.x * r, position.y, position.z * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * vec3(position.x, 0.0, position.z));
  vEdge = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
export const PLUME_FRAG = /* glsl */ `
uniform vec3 core;
uniform vec3 outer;
uniform vec3 smoke;
uniform float power;
uniform float time;
uniform float len;
uniform float diamonds;
uniform float curtain;
uniform float turb;
uniform float seed;
varying float vT;
varying float vEdge;
varying float vAng;
#include <common>
#include <logdepthbuf_pars_fragment>
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  #include <logdepthbuf_fragment>
  float t = clamp(vT, 0.0, 1.0);
  // turbulence streaming down the flame: coarse billows and fine flicker
  vec3 q = vec3(cos(vAng) * 2.2, sin(vAng) * 2.2, t * len * 0.09 - time * 9.0) + seed;
  float n = n3(q) * 0.6 + n3(q * 2.7 + vec3(0.0, 0.0, -time * 6.0)) * 0.3 + n3(q * 7.1) * 0.1;
  float billow = mix(1.0, 0.45 + 1.1 * n, turb);
  float along = pow(max(1.0 - t, 0.0), 1.35);
  float hot = exp(-t * 6.5);
  // shock diamonds: bright knots down the core in thick air
  float dpos = t * 9.0;
  float dia = diamonds * pow(0.5 + 0.5 * cos(dpos * 6.2832), 10.0) * exp(-t * 2.6) * pow(vEdge, 3.0);
  // the F-1's turbine exhaust: a dark, fuel-rich curtain hugging the plume for its first stretch
  float shade = 1.0 - curtain * smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.07, 0.2, t)) * (1.0 - pow(vEdge, 2.0)) * 0.85;
  vec3 c = mix(mix(smoke, outer, smoothstep(0.85, 0.35, t)), core, hot);
  c *= along * pow(vEdge, 1.2) * billow * shade;
  c += core * dia * 2.2;
  gl_FragColor = vec4(c * power, 1.0);
}`;

type Kind = 'F-1' | 'J-2' | 'SPS' | 'DPS' | 'LES';
interface Layer {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  core: boolean;
}
interface Plume {
  layers: Layer[];
  kind: Kind;
  stage: StageId | 'les';
  index: number;
}

export class Plumes {
  readonly group = new THREE.Group();
  private list: Plume[] = [];
  private glows = new Map<string, { glow: THREE.Sprite; flare: THREE.Sprite }>();
  private t = 0;
  /** how bright the F-1 fire is right now (0..1), for lighting the pad */
  fireLevel = 0;

  constructor() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 40, 24, true);
    geo.translate(0, -0.5, 0);
    const layer = (core: boolean): Layer => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          r0: { value: 1 },
          r1: { value: 2 },
          spread: { value: 0.7 },
          core: { value: new THREE.Color() },
          outer: { value: new THREE.Color() },
          smoke: { value: new THREE.Color() },
          power: { value: 0 },
          time: { value: 0 },
          len: { value: 50 },
          diamonds: { value: 0 },
          curtain: { value: 0 },
          turb: { value: 1 },
          seed: { value: Math.random() * 50 },
        },
        vertexShader: PLUME_VERT,
        fragmentShader: PLUME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = core ? 9 : 8;
      return { mesh, mat, core };
    };
    const make = (kind: Kind, stage: Plume['stage'], index: number, x: number, y: number, z: number, tilt?: THREE.Euler) => {
      const layers = [layer(false), layer(true)];
      for (const l of layers) {
        l.mesh.position.set(x, y, z);
        if (tilt) l.mesh.rotation.copy(tilt);
        this.group.add(l.mesh);
      }
      this.list.push({ layers, kind, stage, index });
    };
    for (const s of ['sic', 'sii', 'sivb', 'sm', 'lm'] as const) {
      const E = ENGINES[s];
      E.at.forEach(([x, z], i) => make(E.kind, s, i, x, E.yExit, z));
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      make('LES', 'les', k, Math.sin(a) * 0.32, 104.6, Math.cos(a) * 0.32, new THREE.Euler(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5));
    }
    const radial = (stops: [number, string][]) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    };
    const glowTex = radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,230,180,0.55)'], [1, 'rgba(255,160,80,0)']]);
    const flareTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 32;
      const g = c.getContext('2d')!;
      const gr = g.createLinearGradient(0, 0, 256, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      const v = g.createLinearGradient(0, 0, 0, 32);
      g.fillRect(0, 12, 256, 8);
      void v;
      return new THREE.CanvasTexture(c);
    })();
    for (const s of ['sic', 'sii', 'sivb', 'sm', 'lm', 'les']) {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(6, 4, 2), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color: new THREE.Color(3, 2.4, 1.6), toneMapped: false, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      glow.visible = flare.visible = false;
      glow.renderOrder = 10;
      flare.renderOrder = 11;
      this.group.add(glow, flare);
      this.glows.set(s, { glow, flare });
    }
  }

  update(sim: FlightSim, dt: number, pressure: number): void {
    this.t += dt;
    const pr = Math.min(1, pressure / 101325);
    const thin = 1 - pr;
    const lit = new Map<string, number>();
    let fire = 0;
    for (const p of this.list) {
      let level = 0;
      if (p.stage === 'les') level = sim.lesBurn > 0 && sim.attached.has('les') ? 1 : 0;
      else if (sim.stage === p.stage && sim.attached.has(ENGINES[p.stage].part)) level = sim.engines[p.index]?.level ?? 0;
      const on = level > 0.02;
      for (const l of p.layers) l.mesh.visible = on;
      if (!on) continue;
      lit.set(p.stage, (lit.get(p.stage) ?? 0) + level);
      const fl = 0.85 + 0.15 * Math.sin(this.t * 41 + p.index * 2.1) * Math.sin(this.t * 27 + p.index);
      for (const l of p.layers) {
        const u = l.mat.uniforms;
        u.time.value = this.t;
        const core = l.core;
        if (p.kind === 'F-1') {
          fire += core ? level / 5 : 0;
          const L = (80 + 120 * thin) * (0.6 + 0.4 * level) * (core ? 0.42 : 1);
          l.mesh.scale.set(1, L, 1);
          u.len.value = L;
          u.r0.value = core ? 1.1 : 1.9;
          u.r1.value = core ? 2.4 + 8 * thin * thin : 6.5 + 42 * Math.pow(thin, 2.2);
          u.spread.value = core ? 0.8 : 0.55;
          (u.core.value as THREE.Color).setRGB(10, 8, 4.5);
          (u.outer.value as THREE.Color).setRGB(3.2, 1.25, 0.3);
          (u.smoke.value as THREE.Color).setRGB(0.6, 0.18, 0.04);
          u.diamonds.value = core ? 0.8 * pr * pr : 0;
          u.curtain.value = core ? 0 : 0.9 * pr;
          u.turb.value = core ? 0.35 : 0.9;
          u.power.value = level * fl * (core ? 1.0 : 0.9 - 0.55 * Math.pow(thin, 1.5));
        } else if (p.kind === 'J-2') {
          const L = (20 + 46 * thin) * (0.6 + 0.4 * level) * (core ? 0.5 : 1);
          l.mesh.scale.set(1, L, 1);
          u.len.value = L;
          u.r0.value = core ? 0.65 : 1.0;
          u.r1.value = core ? 1.1 + 3 * thin : 1.7 + 10 * thin;
          u.spread.value = 0.6;
          (u.core.value as THREE.Color).setRGB(2.2, 2.0, 3.4);
          (u.outer.value as THREE.Color).setRGB(0.35, 0.45, 1.1);
          (u.smoke.value as THREE.Color).setRGB(0.1, 0.12, 0.35);
          u.diamonds.value = core ? 1.4 * pr : 0;
          u.curtain.value = 0;
          u.turb.value = 0.5;
          u.power.value = level * fl * (core ? 0.55 : 0.3);
        } else if (p.kind === 'SPS' || p.kind === 'DPS') {
          const big = p.kind === 'SPS';
          const L = (big ? 14 : 9) * (0.5 + 0.5 * level) * (core ? 0.45 : 1);
          l.mesh.scale.set(1, L, 1);
          u.len.value = L;
          u.r0.value = core ? (big ? 0.85 : 0.5) : big ? 1.15 : 0.66;
          u.r1.value = core ? (big ? 2.2 : 1.4) : big ? 7 : 4.5;
          u.spread.value = 0.5;
          (u.core.value as THREE.Color).setRGB(3.4, 2.4, 2.2);
          (u.outer.value as THREE.Color).setRGB(1.1, 0.45, 0.6);
          (u.smoke.value as THREE.Color).setRGB(0.25, 0.08, 0.2);
          u.diamonds.value = 0;
          u.curtain.value = 0;
          u.turb.value = 0.6;
          u.power.value = level * fl * (core ? 0.55 : 0.16);
        } else {
          const L = (9 + 12 * thin) * (core ? 0.5 : 1);
          l.mesh.scale.set(1, L, 1);
          u.len.value = L;
          u.r0.value = core ? 0.1 : 0.15;
          u.r1.value = core ? 0.5 + thin : 1.3 + 3 * thin;
          u.spread.value = 0.6;
          (u.core.value as THREE.Color).setRGB(12, 9, 5);
          (u.outer.value as THREE.Color).setRGB(3.5, 1.4, 0.4);
          (u.smoke.value as THREE.Color).setRGB(0.5, 0.2, 0.05);
          u.diamonds.value = core ? 0.6 * pr : 0;
          u.curtain.value = 0;
          u.turb.value = 0.8;
          u.power.value = fl;
        }
      }
    }
    this.fireLevel = fire;
    // the hot glow and the lens-flare streak at each lit engine cluster
    for (const [s, gf] of this.glows) {
      const lv = lit.get(s) ?? 0;
      gf.glow.visible = gf.flare.visible = lv > 0.02;
      if (!gf.glow.visible) continue;
      const pulse = 0.88 + 0.12 * Math.sin(this.t * 33) * Math.sin(this.t * 19);
      const gm = gf.glow.material as THREE.SpriteMaterial, fm = gf.flare.material as THREE.SpriteMaterial;
      if (s === 'sic') {
        const k = lv / 5;
        gf.glow.position.set(0, -6.5, 0);
        const sz = (26 + 34 * thin) * pulse;
        gf.glow.scale.set(sz, sz, 1);
        gm.color.setRGB(7 * k, 4.6 * k, 2 * k);
        gf.flare.position.copy(gf.glow.position);
        gf.flare.scale.set(90 * k, 3.5, 1);
        fm.color.setRGB(1.2 * k, 0.9 * k, 0.6 * k);
      } else if (s === 'les') {
        gf.glow.position.set(0, 104.2, 0);
        gf.glow.scale.set(14 * pulse, 14 * pulse, 1);
        gm.color.setRGB(7, 4.5, 2);
        gf.flare.visible = false;
      } else {
        const E = ENGINES[s as StageId];
        const k = Math.min(1, lv / E.at.length);
        const hyper = E.kind === 'SPS' || E.kind === 'DPS';
        gf.glow.position.set(0, E.yExit - (hyper ? 0.3 : 0.6), 0);
        const sz = (E.at.length > 1 ? 14 : hyper ? 2.6 : 7) * pulse;
        gf.glow.scale.set(sz, sz, 1);
        if (hyper) gm.color.setRGB(1.6 * k, 1.0 * k, 0.9 * k);
        else gm.color.setRGB(0.9 * k, 1.2 * k, 2.4 * k);
        // a thin streak for the J-2 clusters only
        gf.flare.visible = E.at.length > 1;
        gf.flare.position.copy(gf.glow.position);
        gf.flare.scale.set(36 * k, 1.6, 1);
        fm.color.setRGB(0.5 * k, 0.7 * k, 1.4 * k);
      }
    }
  }
}
