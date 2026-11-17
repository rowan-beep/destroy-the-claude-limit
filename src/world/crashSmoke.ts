// Dune Sea: the crash sites still smoulder. A few small fires flicker in the
// wreckage (the fuel and the magnesium of the airframe burn for a long time),
// and a thin column of smoke rises from each: near black and oily low down,
// thinning to a dusty grey-brown as it climbs, widening and bending away with
// the desert wind. Built from the game's own particle systems (the same ones
// the burning wrecks of a battle use), only near the camera.

import * as THREE from 'three';
import { ParticleSystem } from '../render/particles';
import { getSmokeTexture, getSoftDotTexture } from '../render/textures';
import { NIGHT } from '../render/night';
import { srgb } from '../core/math';
import { mulberry32 } from '../core/rng';
import { WIND_X, WIND_Z } from './desert';

const FIRE_WHITE = srgb(1.0, 0.92, 0.7);
const FIRE_HOT = srgb(1.0, 0.7, 0.32);
const FIRE_ORANGE = srgb(1.0, 0.4, 0.08);
const FIRE_RED = srgb(0.42, 0.06, 0.01);
const EMBER = srgb(1.0, 0.55, 0.15);
/** oily fuel smoke at the base, dusty grey-brown higher up (lit by the desert sun) */
const SMOKE_BLACK = srgb(0.13, 0.12, 0.11);
const SMOKE_DARK = srgb(0.25, 0.23, 0.21);
const SMOKE_HIGH = srgb(0.64, 0.6, 0.55);

/** one burning spot in a wreck */
interface Emitter {
  x: number;
  y: number;
  z: number;
  /** 0.3 (a few flames, a wisp) .. 1 (a small fire, a proper column) */
  heat: number;
  /** some spots only smoulder: smoke, no flames */
  flames: boolean;
  acc: { fire: number; smoke: number; ember: number };
  /** the fire waxes and wanes */
  phase: number;
}

/** flames are a few pixels beyond this (m) */
const FLAME_RANGE = 3500;
/** the smoke columns show from this far (m) */
const SMOKE_RANGE = 14000;

const _c = new THREE.Color();

export class CrashFires {
  private smoke = new ParticleSystem(4000, getSmokeTexture(), false, 14);
  private fire = new ParticleSystem(2500, getSoftDotTexture(), true, 16);
  private emitters: Emitter[] = [];
  private time = 0;
  private warmed = new Set<Emitter>();

  private rnd = mulberry32(0xf1e5);

  constructor(scene: THREE.Scene) {
    scene.add(this.smoke.mesh, this.fire.mesh);
  }

  /** Burning spots: world positions, with their heat (0.3..1). */
  add(spots: { x: number; y: number; z: number; heat: number }[]): void {
    for (const s of spots) {
      this.emitters.push({ ...s, flames: s.heat >= 0.55 || this.rnd() < 0.7, acc: { fire: 0, smoke: this.rnd(), ember: 0 }, phase: this.rnd() * 100 });
    }
  }

  update(dt: number, cam: THREE.Vector3): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const night = NIGHT.dark ? 0.1 : 1;
    for (const e of this.emitters) {
      const dx = e.x - cam.x, dy = e.y - cam.y, dz = e.z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > SMOKE_RANGE * SMOKE_RANGE) {
        this.warmed.delete(e);
        continue;
      }
      // coming into range: the column is already standing (run its first half-minute at once)
      if (!this.warmed.has(e)) {
        this.warmed.add(e);
        for (let t = 0; t < 30; t += 0.5) this.emitSmoke(e, 0.5, night, 30 - t);
      }
      // the fire breathes: slow swells and quick flickers
      const breathe = 0.75 + 0.25 * Math.sin(this.time * 0.37 + e.phase) * Math.sin(this.time * 0.11 + e.phase * 1.7);
      this.emitSmoke(e, dt * breathe, night, 0);
      if (e.flames && d2 < FLAME_RANGE * FLAME_RANGE) this.emitFire(e, dt * breathe, d2 < 900 * 900);
    }
    this.smoke.update(dt, cam);
    this.fire.update(dt, cam);
  }

  /**
   * The smoke: puffs rise off the fire, slow, spread and drift downwind; `age` pre-ages a
   * puff (to stand a column up at once).
   */
  private emitSmoke(e: Emitter, dt: number, night: number, age: number): void {
    e.acc.smoke += dt * (1.6 + 2.0 * e.heat);
    while (e.acc.smoke >= 1) {
      e.acc.smoke -= 1;
      const life = 16 + Math.random() * 10;
      if (age >= life) continue;
      // the hotter the fire, the faster the smoke leaves it
      const up = (1.8 + 2.0 * e.heat) * (0.8 + Math.random() * 0.4);
      const wind = 2.6 + Math.random() * 1.6;
      // a dark core and lighter, thinner edges
      const core = Math.random() < 0.55;
      const c0 = core ? SMOKE_BLACK : SMOKE_DARK;
      _c.copy(SMOKE_HIGH).multiplyScalar(0.85 + Math.random() * 0.3);
      const k = Math.exp(-0.07 * age);
      const vx = WIND_X * wind + (Math.random() - 0.5) * 0.6, vz = WIND_Z * wind + (Math.random() - 0.5) * 0.6;
      // pre-aged puffs start where they would have drifted to by now
      const tAge = (1 - k) / 0.07;
      const lift = up * tAge + 0.09 * age * age * 0.5;
      this.smoke.spawn({
        x: e.x + (Math.random() - 0.5) * 1.6 + vx * tAge,
        y: e.y + 0.6 + lift,
        z: e.z + (Math.random() - 0.5) * 1.6 + vz * tAge,
        vx: vx * k,
        vy: up * k + 0.09 * age,
        vz: vz * k,
        life: life - age,
        size0: (0.8 + 1.2 * e.heat) * (1 + age * 0.6),
        size1: 10 + 12 * e.heat + Math.random() * 5,
        c0: (age > 6 ? SMOKE_DARK : c0).clone().multiplyScalar(night),
        c1: _c.clone().multiplyScalar(night),
        a0: (0.13 + 0.1 * e.heat) * (core ? 1 : 0.65) * Math.exp(-age / 26),
        a1: 0,
        // slows as it cools, a little buoyancy keeps it climbing
        drag: 0.07,
        gravity: 0.09,
        rot: Math.random() * 6.28,
        spin: (Math.random() - 0.5) * 0.12,
      });
    }
  }

  /** The flames: small licking tongues of fire close to the wreck, and now and then a spark. */
  private emitFire(e: Emitter, dt: number, close: boolean): void {
    e.acc.fire += dt * (10 + 22 * e.heat);
    while (e.acc.fire >= 1) {
      e.acc.fire -= 1;
      const r = 0.6 + 1.2 * e.heat;
      const hot = Math.random();
      this.fire.spawn({
        x: e.x + (Math.random() - 0.5) * r * 2,
        y: e.y + 0.2 + Math.random() * 0.4,
        z: e.z + (Math.random() - 0.5) * r * 2,
        vx: WIND_X * 0.6 + (Math.random() - 0.5) * 0.5,
        vy: 1.4 + Math.random() * 2.2 * (0.6 + e.heat),
        vz: WIND_Z * 0.6 + (Math.random() - 0.5) * 0.5,
        life: 0.35 + Math.random() * 0.5,
        size0: (0.9 + Math.random() * 1.1) * (0.6 + e.heat),
        size1: 0.25,
        c0: hot < 0.15 ? FIRE_WHITE : hot < 0.6 ? FIRE_HOT : FIRE_ORANGE,
        c1: FIRE_RED,
        a0: 0.75 + Math.random() * 0.2,
        a1: 0,
        drag: 1.2,
        gravity: 2.5,
        spin: (Math.random() - 0.5) * 3,
      });
    }
    if (!close) return;
    e.acc.ember += dt * (0.8 + 2 * e.heat);
    while (e.acc.ember >= 1) {
      e.acc.ember -= 1;
      this.fire.spawn({
        x: e.x + (Math.random() - 0.5) * 1.5,
        y: e.y + 0.8,
        z: e.z + (Math.random() - 0.5) * 1.5,
        vx: WIND_X * 2 + (Math.random() - 0.5) * 2,
        vy: 3 + Math.random() * 4,
        vz: WIND_Z * 2 + (Math.random() - 0.5) * 2,
        life: 1.2 + Math.random() * 1.6,
        size0: 0.14,
        size1: 0.06,
        c0: EMBER,
        c1: FIRE_RED,
        a0: 1,
        a1: 0,
        drag: 0.6,
        gravity: -1.5,
      });
    }
  }
}
