// Raptor plumes for Super Heavy's 33 engines and the ship's six. Methane and
// oxygen burn clean: at sea level a tight, bright yellow-white core stacked
// with shock diamonds inside an orange envelope; as the air thins each plume
// balloons and fades to a faint violet-pink glow, and in vacuum (or the thin
// Martian air) it is a wide, nearly transparent bloom. The shared plume shader
// from the Saturn V does the shading.

import * as THREE from 'three';
import { PLUME_FRAG, PLUME_VERT } from '../plumes';

interface Layer {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  core: boolean;
}
interface Plume {
  layers: Layer[];
  vac: boolean;
  booster: boolean;
}

const GEO = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 32, 20, true);
  g.translate(0, -0.5, 0);
  return g;
})();

function glowTex(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,225,180,0.5)');
  gr.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class StarshipFire {
  private ship: Plume[] = [];
  private booster: Plume[] = [];
  private shipGlow: THREE.Sprite;
  private boosterGlow: THREE.Sprite;
  private t = 0;
  /** how much fire there is near the ground (for lighting and smoke) */
  fireLevel = 0;

  constructor(shipGroup: THREE.Object3D, shipEngines: { pos: THREE.Vector3; vac: boolean }[], boosterGroup: THREE.Object3D, boosterEngines: THREE.Vector3[]) {
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
      const mesh = new THREE.Mesh(GEO, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = core ? 9 : 8;
      return { mesh, mat, core };
    };
    const make = (parent: THREE.Object3D, pos: THREE.Vector3, vac: boolean, booster: boolean): Plume => {
      const layers = [layer(false), layer(true)];
      for (const l of layers) {
        l.mesh.position.copy(pos);
        parent.add(l.mesh);
      }
      return { layers, vac, booster };
    };
    for (const e of shipEngines) this.ship.push(make(shipGroup, e.pos, e.vac, false));
    for (const p of boosterEngines) this.booster.push(make(boosterGroup, p, false, true));
    const tex = glowTex();
    const glow = () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(6, 4, 2), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      s.renderOrder = 10;
      return s;
    };
    this.shipGlow = glow();
    this.shipGlow.position.set(0, -2.5, 0);
    shipGroup.add(this.shipGlow);
    this.boosterGlow = glow();
    this.boosterGlow.position.set(0, -4, 0);
    boosterGroup.add(this.boosterGlow);
  }

  /**
   * Light the engines: the first `bN` of the booster's (centre ring first),
   * `sN` sea-level and `vN` vacuum Raptors on the ship, each at `throttle`.
   * `pressure` in Pa round the vehicle.
   */
  update(dt: number, bN: number, sN: number, vN: number, throttle: number, bThrottle: number, pressure: number): void {
    this.t += dt;
    const pr = Math.min(1, pressure / 101325);
    const thin = 1 - pr;
    let fire = 0;
    let si = 0, vi = 0;
    for (const p of this.ship) {
      const on = p.vac ? vi++ < vN : si++ < sN;
      this.shade(p, on ? throttle : 0, pr, thin);
      if (on) fire += throttle;
    }
    this.booster.forEach((p, i) => {
      const on = i < bN;
      this.shade(p, on ? bThrottle : 0, pr, thin);
      if (on) fire += bThrottle;
    });
    this.fireLevel = Math.min(1, fire / 20);
    const pulse = 0.88 + 0.12 * Math.sin(this.t * 33) * Math.sin(this.t * 19);
    const sLit = Math.min(sN + vN, 6) * throttle;
    this.shipGlow.visible = sLit > 0.05;
    if (this.shipGlow.visible) {
      // a hot spot at the nozzles: strong in air, faint in vacuum where there is little to light up
      const sz = (6 + 4 * thin) * pulse * Math.sqrt(sLit / 3);
      this.shipGlow.scale.set(sz, sz, 1);
      const k = 1 - 0.7 * thin;
      (this.shipGlow.material as THREE.SpriteMaterial).color.setRGB(2.2 * k, 1.6 * k, 1.2 * k + 0.3 * thin);
    }
    const bLit = bN * bThrottle;
    this.boosterGlow.visible = bLit > 0.05;
    if (this.boosterGlow.visible) {
      const sz = (22 + 10 * thin) * pulse * Math.sqrt(bLit / 33);
      this.boosterGlow.scale.set(sz, sz, 1);
      (this.boosterGlow.material as THREE.SpriteMaterial).color.setRGB(5, 3.5, 2);
    }
  }

  private shade(p: Plume, level: number, pr: number, thin: number): void {
    const on = level > 0.02;
    for (const l of p.layers) l.mesh.visible = on;
    if (!on) return;
    const fl = 0.86 + 0.14 * Math.sin(this.t * 43 + p.layers[0].mat.uniforms.seed.value) * Math.sin(this.t * 29);
    const many = p.booster ? 0.55 : 1;
    for (const l of p.layers) {
      const u = l.mat.uniforms;
      const core = l.core;
      u.time.value = this.t;
      const nozzle = p.vac ? 1.15 : 0.65;
      // (in vacuum a methalox plume is nearly invisible: a faint, short, wide bloom)
      const L = (p.vac ? 30 + 18 * thin : 38 + 60 * thin) * (0.55 + 0.45 * level) * (core ? 0.45 : 1) * (p.booster ? 1.15 : 1);
      l.mesh.scale.set(1, L, 1);
      u.len.value = L;
      u.r0.value = core ? nozzle * 0.85 : nozzle * 1.1;
      u.r1.value = core ? nozzle * (1.4 + 2.5 * thin * thin) : nozzle * (2.6 + 9 * Math.pow(thin, 2.2));
      u.spread.value = core ? 0.8 : 0.55;
      // a hot yellow-white core; an orange envelope at sea level fading to violet-pink in thin air
      (u.core.value as THREE.Color).setRGB(8.5, 6.6, 4.8 + 1.5 * thin);
      (u.outer.value as THREE.Color).setRGB(2.4 - 1.3 * thin, 1.05 - 0.5 * thin, 0.5 + 0.45 * thin);
      (u.smoke.value as THREE.Color).setRGB(0.32, 0.12, 0.12 + 0.1 * thin);
      u.diamonds.value = core ? 1.3 * pr : 0;
      u.curtain.value = 0;
      u.turb.value = core ? 0.35 : 0.8;
      u.power.value = level * fl * many * (core ? 0.9 - 0.62 * Math.pow(thin, 1.5) : 0.75 - 0.68 * Math.pow(thin, 1.4));
    }
  }
}
