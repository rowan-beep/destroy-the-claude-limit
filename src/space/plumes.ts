// Engine plumes. F-1s burn kerosene: a blinding yellow-orange core that trails
// off into dark, sooty orange, long and narrow at sea level and ballooning
// into a vast glowing cloud as the air thins. J-2s burn hydrogen: an almost
// invisible pale blue flame. The plumes are additive cones whose shape follows
// the ambient pressure, plus a glow at each nozzle cluster.

import * as THREE from 'three';
import { ENGINES, FlightSim } from './flightSim';

const PLUME_VERT = /* glsl */ `
uniform float r0;
uniform float r1;
uniform float spread;
varying float vT;
varying float vEdge;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  float t = -position.y;
  vT = t;
  float r = mix(r0, r1, pow(t, spread));
  vec3 p = vec3(position.x * r, position.y, position.z * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 n = normalize(normalMatrix * vec3(position.x, 0.0, position.z));
  vEdge = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const PLUME_FRAG = /* glsl */ `
uniform vec3 core;
uniform vec3 outer;
uniform float power;
uniform float flicker;
varying float vT;
varying float vEdge;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float along = pow(max(1.0 - vT, 0.0), 1.6);
  float hot = exp(-vT * 7.0);
  vec3 c = mix(outer, core, hot) * along * pow(vEdge, 1.4) * power * (0.9 + 0.1 * flicker);
  gl_FragColor = vec4(c, 1.0);
}`;

interface Plume {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  kind: 'F-1' | 'J-2' | 'LES';
  stage: 'sic' | 'sii' | 'sivb' | 'les';
  index: number;
}

export class Plumes {
  readonly group = new THREE.Group();
  private list: Plume[] = [];
  private glow: THREE.Sprite;
  private t = 0;

  constructor() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 28, 16, true);
    geo.translate(0, -0.5, 0);
    const make = (kind: Plume['kind'], stage: Plume['stage'], index: number, x: number, y: number, z: number, tilt?: THREE.Euler) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          r0: { value: 1 },
          r1: { value: 2 },
          spread: { value: 0.7 },
          core: { value: new THREE.Color() },
          outer: { value: new THREE.Color() },
          power: { value: 0 },
          flicker: { value: 1 },
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
      mesh.position.set(x, y, z);
      if (tilt) mesh.rotation.copy(tilt);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this.list.push({ mesh, mat, kind, stage, index });
    };
    for (const s of ['sic', 'sii', 'sivb'] as const) {
      const E = ENGINES[s];
      E.at.forEach(([x, z], i) => make(E.kind, s, i, x, E.yExit, z));
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      make('LES', 'les', k, Math.sin(a) * 0.32, 104.6, Math.cos(a) * 0.32, new THREE.Euler(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5));
    }
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,220,160,0.5)');
      gr.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(6, 4, 2), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.visible = false;
    this.glow.renderOrder = 9;
    this.group.add(this.glow);
  }

  /** how bright the F-1 fire is right now (0..1), for lighting the pad */
  fireLevel = 0;

  update(sim: FlightSim, dt: number, pressure: number): void {
    this.t += dt;
    const pr = Math.min(1, pressure / 101325);
    const thin = 1 - pr;
    let fire = 0;
    for (const p of this.list) {
      let level = 0;
      if (p.stage === 'les') level = sim.lesBurn > 0 && sim.attached.has('les') ? 1 : 0;
      else if (sim.stage === p.stage && sim.attached.has(p.stage)) level = sim.engines[p.index]?.level ?? 0;
      p.mesh.visible = level > 0.02;
      if (!p.mesh.visible) continue;
      const u = p.mat.uniforms;
      const fl = 0.8 + 0.2 * Math.sin(this.t * 37 + p.index * 2.1) * Math.sin(this.t * 23 + p.index);
      u.flicker.value = fl;
      if (p.kind === 'F-1') {
        fire += level / 5;
        const L = 80 + 110 * thin;
        p.mesh.scale.set(1, L * (0.6 + 0.4 * level), 1);
        u.r0.value = 1.9;
        u.r1.value = 6.5 + 40 * Math.pow(thin, 2.2);
        u.spread.value = 0.55;
        (u.core.value as THREE.Color).setRGB(9, 6.2, 2.6);
        (u.outer.value as THREE.Color).setRGB(2.6, 0.9, 0.22);
        u.power.value = level * (0.9 - 0.55 * Math.pow(thin, 1.5));
      } else if (p.kind === 'J-2') {
        const L = 18 + 40 * thin;
        p.mesh.scale.set(1, L * (0.6 + 0.4 * level), 1);
        u.r0.value = 1.0;
        u.r1.value = 1.6 + 9 * thin;
        u.spread.value = 0.6;
        (u.core.value as THREE.Color).setRGB(1.2, 1.4, 2.6);
        (u.outer.value as THREE.Color).setRGB(0.25, 0.35, 0.9);
        u.power.value = level * 0.32;
      } else {
        p.mesh.scale.set(1, 9 + 10 * thin, 1);
        u.r0.value = 0.14;
        u.r1.value = 1.2 + 3 * thin;
        u.spread.value = 0.6;
        (u.core.value as THREE.Color).setRGB(10, 7, 3);
        (u.outer.value as THREE.Color).setRGB(3, 1.1, 0.3);
        u.power.value = 1;
      }
    }
    this.fireLevel = fire;
    this.glow.visible = fire > 0.02 || (sim.stage === 'sii' && sim.engines.some((e) => e.level > 0.05));
    if (fire > 0.02) {
      this.glow.position.set(0, -6.5, 0);
      const s = (24 + 30 * thin) * (0.85 + 0.15 * Math.sin(this.t * 31));
      this.glow.scale.set(s, s, 1);
      (this.glow.material as THREE.SpriteMaterial).color.setRGB(7 * fire, 4.4 * fire, 1.8 * fire);
    } else if (this.glow.visible) {
      this.glow.position.set(0, 43.5, 0);
      this.glow.scale.set(10, 10, 1);
      (this.glow.material as THREE.SpriteMaterial).color.setRGB(0.5, 0.7, 1.6);
    }
  }
}
