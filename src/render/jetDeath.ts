// The death of a jet: what a fighter full of fuel and ordnance does when it
// comes apart in the air or goes into the ground.
//
// In the air: a white-hot flash, the main fireball carried on along the
// jet's flight path, the fuel cells going up one after another a fraction of
// a second apart, a shock shell racing out, and a spray of burning fragments
// arcing away on smoke trails, leaving a drifting black pall.
//
// Into the ground: the flash, a fireball that boils up into a rising column
// and a mushroom of black smoke, dirt and rock thrown out and falling back,
// a shock ring racing across the ground, fuel burning in a long smear along
// the impact path, and burning wreckage tumbling on ahead.
//
// Into the sea: a towering white plume and curtain of spray, a ring of
// churned water, steam, and burning fuel on the surface.
//
// Everything is built from the shared particle pools plus a few shells, so a
// big furball costs little more than the old explosions did.

import * as THREE from 'three';
import type { ParticleSystem } from './particles';
import { rand, randGauss } from '../core/rng';
import { srgb } from '../core/math';

const WHITE_HOT = srgb(1.0, 0.97, 0.9);
const FIRE_HOT = srgb(1.0, 0.82, 0.5);
const FIRE_ORANGE = srgb(1.0, 0.42, 0.08);
const FIRE_RED = srgb(0.45, 0.07, 0.02);
const DARK_SMOKE = srgb(0.08, 0.08, 0.085);
const BROWN_SMOKE = srgb(0.2, 0.16, 0.13);
const GREY_SMOKE = srgb(0.42, 0.42, 0.44);
const DIRT = srgb(0.3, 0.24, 0.18);
const DUST = srgb(0.55, 0.47, 0.4);
const SPRAY = srgb(0.93, 0.95, 0.97);
const STEAM = srgb(0.8, 0.82, 0.85);

interface Pending {
  at: number;
  run: () => void;
}

/** A burning fragment: a point on a ballistic arc leaving fire and smoke. */
interface Ember {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  smokeAcc: number;
  floor: number;
}

interface Shell {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  r1: number;
  a0: number;
  flat: boolean;
}

export class JetDeathFx {
  private time = 0;
  private pending: Pending[] = [];
  private embers: Ember[] = [];
  private shells: Shell[] = [];
  private sphere = new THREE.SphereGeometry(1, 28, 16);
  private ring = new THREE.RingGeometry(0.82, 1, 64, 1);

  constructor(
    private scene: THREE.Scene,
    private fire: ParticleSystem,
    private smoke: ParticleSystem,
    /** a fire left burning on the ground (wreck, fuel) */
    private addBurn: (pos: THREE.Vector3, size: number, life: number) => void,
    /** a light flash at the blast */
    private flash: (pos: THREE.Vector3, intensity: number, dur: number) => void,
    /** ground height under a point */
    private ground: (x: number, z: number) => number,
  ) {
    this.ring.rotateX(-Math.PI / 2);
  }

  private later(dt: number, run: () => void): void {
    this.pending.push({ at: this.time + dt, run });
  }

  /** One rolling ball of fire, drifting with `drift`. */
  private fireball(p: THREE.Vector3, drift: THREE.Vector3, r: number, rise = 0): void {
    // the white-hot core
    this.fire.spawn({ x: p.x, y: p.y, z: p.z, vx: drift.x, vy: drift.y, vz: drift.z, life: 0.16, size0: r * 1.6, size1: r * 2.6, c0: WHITE_HOT, a0: 1, a1: 0, drag: 3 });
    const n = Math.round(10 + r * 0.9);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(randGauss(), randGauss(), randGauss()).normalize().multiplyScalar(rand(0.3, 1) * r * 1.6);
      this.fire.spawn({
        x: p.x + d.x * 0.25, y: p.y + d.y * 0.25, z: p.z + d.z * 0.25,
        vx: drift.x + d.x * 1.4, vy: drift.y + d.y * 1.4 + rise, vz: drift.z + d.z * 1.4,
        life: rand(0.7, 1.6), size0: rand(0.35, 0.6) * r, size1: rand(0.8, 1.3) * r,
        c0: Math.random() < 0.5 ? FIRE_HOT : FIRE_ORANGE, c1: FIRE_RED, a0: 0.95, a1: 0, drag: 2.2, gravity: 3 + rise * 0.2,
        rot: rand(0, 6.3), spin: randGauss() * 1.5,
      });
    }
    // the fireball's own smoke, rolling up out of it as it cools
    for (let i = 0; i < Math.round(6 + r * 0.4); i++) {
      this.smoke.spawn({
        x: p.x + randGauss() * r * 0.4, y: p.y + randGauss() * r * 0.4, z: p.z + randGauss() * r * 0.4,
        vx: drift.x * 0.6 + randGauss() * r * 0.3, vy: drift.y * 0.6 + rand(2, 6) + rise * 0.5, vz: drift.z * 0.6 + randGauss() * r * 0.3,
        life: rand(9, 16), size0: r * 0.5, size1: r * rand(2.2, 3.4),
        c0: DARK_SMOKE, c1: GREY_SMOKE, a0: 0.85, a1: 0, drag: 0.9, gravity: 1.2, rot: rand(0, 6.3), spin: randGauss() * 0.2,
      });
    }
  }

  /** A shock shell (sphere) or ring (flat, along the ground) racing out. */
  private shock(p: THREE.Vector3, r1: number, life: number, flat: boolean, a0: number): void {
    if (this.shells.length > 8) return;
    const mat = new THREE.MeshBasicMaterial({ color: flat ? 0xd8c8b0 : 0xfff2dd, transparent: true, opacity: a0, depthWrite: false, blending: flat ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(flat ? this.ring : this.sphere, mat);
    mesh.position.copy(p);
    if (flat) mesh.position.y += 1.5;
    mesh.scale.setScalar(1);
    mesh.renderOrder = 16;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.shells.push({ mesh, age: 0, life, r1, a0, flat });
  }

  private ember(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number): void {
    if (this.embers.length > 90) return;
    this.embers.push({ p: p.clone(), v, age: 0, life, size, smokeAcc: 0, floor: this.ground(p.x, p.z) });
  }

  /** A jet blown apart in the air. `vel` is the jet's velocity. */
  airKill(pos: THREE.Vector3, vel: THREE.Vector3): void {
    const drift = vel.clone().multiplyScalar(0.55);
    this.flash(pos, 1.2e7, 0.6);
    this.fireball(pos, drift, 40);
    this.shock(pos, 220, 0.45, false, 0.18);
    // the fuel cells and stores going up, one after another, strung out along the flight path
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const dt = 0.07 + i * rand(0.09, 0.22);
      const off = new THREE.Vector3(randGauss() * 9, randGauss() * 6, randGauss() * 9);
      this.later(dt, () => {
        const q = pos.clone().addScaledVector(vel, dt * 0.7).add(off);
        this.fireball(q, drift.clone().multiplyScalar(0.7), rand(18, 30));
        this.flash(q, 5e6, 0.3);
      });
    }
    // burning fragments flung out, arcing down on smoke trails
    const m = 12 + Math.floor(Math.random() * 6);
    for (let i = 0; i < m; i++) {
      const dir = new THREE.Vector3(randGauss(), randGauss() * 0.7 + 0.25, randGauss()).normalize();
      const v = vel.clone().multiplyScalar(rand(0.35, 0.8)).addScaledVector(dir, rand(35, 110));
      this.ember(pos, v, rand(2.5, 6), rand(2.4, 5));
    }
    // a shower of sparks
    for (let i = 0; i < 70; i++) {
      this.fire.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: drift.x + randGauss() * 120, vy: drift.y + randGauss() * 120, vz: drift.z + randGauss() * 120,
        life: rand(0.6, 2), size0: 1.6, size1: 0.4, c0: WHITE_HOT, c1: FIRE_ORANGE, a0: 1, a1: 0, drag: 1.2, gravity: -9.8,
      });
    }
    // the black pall left hanging where the jet was
    this.later(0.35, () => {
      for (let i = 0; i < 18; i++) {
        this.smoke.spawn({
          x: pos.x + randGauss() * 18 + vel.x * 0.2, y: pos.y + randGauss() * 12 + vel.y * 0.2, z: pos.z + randGauss() * 18 + vel.z * 0.2,
          vx: vel.x * 0.12 + randGauss() * 6, vy: vel.y * 0.12 + rand(1, 4), vz: vel.z * 0.12 + randGauss() * 6,
          life: rand(16, 26), size0: rand(14, 22), size1: rand(70, 110),
          c0: DARK_SMOKE, c1: GREY_SMOKE, a0: 0.7, a1: 0, drag: 0.5, gravity: 0.8, rot: rand(0, 6.3), spin: randGauss() * 0.1,
        });
      }
    });
  }

  /** A jet going into the ground (or the sea). `vel` is its velocity at impact. */
  impact(pos: THREE.Vector3, vel: THREE.Vector3, water: boolean): void {
    const hv = new THREE.Vector3(vel.x, 0, vel.z);
    const speed = hv.length();
    const fwd = speed > 1 ? hv.clone().divideScalar(speed) : new THREE.Vector3(1, 0, 0);
    const p = pos.clone();
    this.flash(p, 1.6e7, 0.8);
    this.shock(p, 260, 0.9, true, water ? 0.5 : 0.42);
    this.shock(p.clone().setY(p.y + 4), 180, 0.4, false, 0.14);
    if (water) {
      this.splash(p, fwd, speed);
      return;
    }
    // the fireball, thrown forward along the impact path and boiling upward
    const fwdDrift = fwd.clone().multiplyScalar(Math.min(60, speed * 0.25));
    this.fireball(p.clone().setY(p.y + 10), fwdDrift, 55, 22);
    this.later(0.12, () => this.fireball(p.clone().addScaledVector(fwd, 25 + speed * 0.12).setY(p.y + 8), fwdDrift.clone().multiplyScalar(0.6), 40, 18));
    this.later(0.3, () => this.fireball(p.clone().addScaledVector(fwd, 50 + speed * 0.25).setY(p.y + 6), fwdDrift.clone().multiplyScalar(0.4), 34, 14));
    // the rising column, and the mushroom spreading at its head
    for (let i = 0; i < 26; i++) {
      const h = i / 26;
      this.later(h * 1.4, () => {
        this.fire.spawn({
          x: p.x + randGauss() * 5, y: p.y + 5, z: p.z + randGauss() * 5,
          vx: randGauss() * 5, vy: rand(60, 90), vz: randGauss() * 5,
          life: rand(1.3, 2.2), size0: rand(18, 28), size1: rand(35, 50), c0: FIRE_HOT, c1: FIRE_RED, a0: 0.9, a1: 0, drag: 1.1, gravity: 4,
        });
        this.smoke.spawn({
          x: p.x + randGauss() * 6, y: p.y + 10, z: p.z + randGauss() * 6,
          vx: randGauss() * 4, vy: rand(55, 80), vz: randGauss() * 4,
          life: rand(18, 28), size0: rand(25, 35), size1: rand(110, 160), c0: DARK_SMOKE, c1: GREY_SMOKE, a0: 0.85, a1: 0, drag: 0.55, gravity: 1.5, rot: rand(0, 6.3),
        });
      });
    }
    this.later(1.6, () => {
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const top = p.y + rand(200, 260);
        this.smoke.spawn({
          x: p.x + Math.cos(a) * 20, y: top, z: p.z + Math.sin(a) * 20,
          vx: Math.cos(a) * rand(14, 24), vy: rand(2, 6), vz: Math.sin(a) * rand(14, 24),
          life: rand(20, 30), size0: rand(50, 70), size1: rand(160, 220), c0: DARK_SMOKE, c1: GREY_SMOKE, a0: 0.75, a1: 0, drag: 0.45, gravity: 0.4, rot: rand(0, 6.3), spin: randGauss() * 0.08,
        });
      }
    });
    // dirt and rock thrown out in a crater-shaped spray, falling back
    for (let i = 0; i < 46; i++) {
      const a = rand(0, Math.PI * 2);
      const out = rand(20, 70);
      const up = rand(35, 95);
      this.smoke.spawn({
        x: p.x, y: p.y + 2, z: p.z,
        vx: Math.cos(a) * out + fwd.x * speed * 0.15, vy: up, vz: Math.sin(a) * out + fwd.z * speed * 0.15,
        life: rand(2.5, 4.5), size0: rand(5, 9), size1: rand(18, 32), c0: DIRT, c1: BROWN_SMOKE, a0: 0.9, a1: 0, drag: 0.35, gravity: -9.8, rot: rand(0, 6.3),
      });
    }
    // the dust skirt racing out across the ground
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const v = rand(45, 80);
      this.smoke.spawn({
        x: p.x, y: p.y + 2, z: p.z, vx: Math.cos(a) * v, vy: rand(1, 6), vz: Math.sin(a) * v,
        life: rand(6, 11), size0: 8, size1: rand(40, 60), c0: DUST, c1: GREY_SMOKE, a0: 0.6, a1: 0, drag: 1.3, gravity: 0.4,
      });
    }
    // fuel burning in a long smear along the impact path
    const smear = Math.min(260, 40 + speed * 0.9);
    const k = 7;
    for (let i = 0; i < k; i++) {
      const d = (i / (k - 1)) * smear;
      const q = p.clone().addScaledVector(fwd, d).add(new THREE.Vector3(randGauss() * 6, 0, randGauss() * 6));
      q.y = Math.max(this.ground(q.x, q.z), 0) + 1;
      this.later(d / Math.max(80, speed * 0.6), () => this.addBurn(q, rand(0.55, 1.1) * (1 - 0.45 * (i / k)), rand(25, 70)));
    }
    // wreckage tumbling on ahead, burning
    for (let i = 0; i < 12; i++) {
      const v = fwd.clone().multiplyScalar(speed * rand(0.25, 0.6)).add(new THREE.Vector3(randGauss() * 30, rand(15, 55), randGauss() * 30));
      this.ember(p.clone().setY(p.y + 3), v, rand(2, 4.5), rand(2.2, 4.5));
    }
  }

  private splash(p: THREE.Vector3, fwd: THREE.Vector3, speed: number): void {
    const s = p.clone().setY(0.5);
    // the plume: a tall white column, then the curtain of spray
    for (let i = 0; i < 60; i++) {
      const up = rand(50, 120);
      this.smoke.spawn({
        x: s.x + randGauss() * 7, y: s.y, z: s.z + randGauss() * 7,
        vx: randGauss() * 9 + fwd.x * speed * 0.08, vy: up, vz: randGauss() * 9 + fwd.z * speed * 0.08,
        life: rand(3, 5.5), size0: rand(5, 9), size1: rand(22, 40), c0: SPRAY, c1: STEAM, a0: 0.9, a1: 0, drag: 0.25, gravity: -9.8, rot: rand(0, 6.3),
      });
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const v = rand(25, 45);
      this.smoke.spawn({
        x: s.x, y: s.y, z: s.z, vx: Math.cos(a) * v, vy: rand(25, 45), vz: Math.sin(a) * v,
        life: rand(2.5, 4), size0: 5, size1: rand(18, 28), c0: SPRAY, c1: STEAM, a0: 0.85, a1: 0, drag: 0.6, gravity: -9.8,
      });
    }
    // the fireball flashing off the surface and a skin of burning fuel
    this.fireball(s.clone().setY(8), fwd.clone().multiplyScalar(Math.min(40, speed * 0.15)), 22, 6);
    for (let i = 0; i < 4; i++) {
      const q = s.clone().addScaledVector(fwd, 20 + i * 30 + randGauss() * 8);
      q.y = 0.5;
      this.later(0.2 + i * 0.15, () => this.addBurn(q, rand(0.4, 0.75), rand(15, 35)));
    }
    // steam lingering over the churned water
    this.later(1.2, () => {
      for (let i = 0; i < 16; i++) {
        this.smoke.spawn({
          x: s.x + randGauss() * 25, y: 4, z: s.z + randGauss() * 25, vx: randGauss() * 2, vy: rand(2, 5), vz: randGauss() * 2,
          life: rand(10, 16), size0: 18, size1: rand(50, 80), c0: STEAM, c1: GREY_SMOKE, a0: 0.45, a1: 0, drag: 0.4, gravity: 0.6,
        });
      }
    });
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at <= this.time) {
        const p = this.pending[i];
        this.pending.splice(i, 1);
        p.run();
      }
    }
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.age += dt;
      e.v.multiplyScalar(Math.exp(-dt * 0.35));
      e.v.y -= 9.8 * dt;
      e.p.addScaledVector(e.v, dt);
      const k = 1 - e.age / e.life;
      if (k <= 0 || e.p.y < e.floor) {
        // it lands: a small fire where it falls
        if (e.p.y < e.floor + 2 && e.size > 3.6 && e.floor > 0) this.addBurn(new THREE.Vector3(e.p.x, e.floor + 0.5, e.p.z), 0.3, rand(10, 25));
        this.embers.splice(i, 1);
        continue;
      }
      this.fire.spawn({ x: e.p.x, y: e.p.y, z: e.p.z, vx: e.v.x * 0.1, vy: e.v.y * 0.1, vz: e.v.z * 0.1, life: rand(0.25, 0.5), size0: e.size * (0.6 + 0.6 * k), size1: e.size * 1.5, c0: FIRE_HOT, c1: FIRE_ORANGE, a0: 0.95 * k + 0.05, a1: 0, drag: 2 });
      e.smokeAcc += dt;
      if (e.smokeAcc > 0.05) {
        e.smokeAcc = 0;
        this.smoke.spawn({ x: e.p.x, y: e.p.y, z: e.p.z, vx: randGauss(), vy: rand(0.5, 2), vz: randGauss(), life: rand(3, 6), size0: e.size * 0.8, size1: e.size * rand(6, 9), c0: DARK_SMOKE, c1: GREY_SMOKE, a0: 0.6 * k + 0.15, a1: 0, drag: 0.6, gravity: 0.6 });
      }
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.age += dt;
      const u = s.age / s.life;
      const mat = s.mesh.material as THREE.MeshBasicMaterial;
      if (u >= 1) {
        this.scene.remove(s.mesh);
        mat.dispose();
        this.shells.splice(i, 1);
        continue;
      }
      // fast out, slowing: like a real shock front
      const r = s.r1 * (1 - Math.pow(1 - u, 2.4));
      s.mesh.scale.setScalar(Math.max(0.5, r));
      mat.opacity = s.a0 * Math.pow(1 - u, s.flat ? 1.4 : 2);
    }
  }

  clear(): void {
    this.pending.length = 0;
    this.embers.length = 0;
    for (const s of this.shells) {
      this.scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    }
    this.shells.length = 0;
  }
}
