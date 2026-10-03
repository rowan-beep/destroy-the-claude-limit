// Ejection sequence and airframe debris.
//
// Ejection: the canopy is blown off and tumbles away, the seat rockets the
// pilot clear, the seat separates, the parachute blossoms and the pilot
// swings down to the surface under it, drifting with the wind. The chute
// collapses after landing.
//
// Debris: an airframe destroyed in the air sheds burning, smoking pieces
// that tumble down and puff dust (or spray) where they land.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { ParticleSystem } from './particles';
import type { TrailRenderer, Trail } from './trails';
import { rand, randGauss } from '../core/rng';
import { srgb } from '../core/math';
import { surfaceHeight } from '../world/terrain';

const G = 9.81;
const WIND = new THREE.Vector3(3.5, 0, -1.5);

const FIRE_HOT = srgb(1.0, 0.85, 0.55);
const FIRE_ORANGE = srgb(1.0, 0.45, 0.1);
const SMOKE = srgb(0.5, 0.5, 0.52);
const DARK = srgb(0.12, 0.12, 0.13);
const DUST = srgb(0.55, 0.45, 0.38);
const SPRAY = srgb(0.92, 0.93, 0.95);

function chuteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  const gores = 16;
  for (let i = 0; i < gores; i++) {
    g.fillStyle = i % 2 === 0 ? '#e8742a' : '#f2efe6';
    g.fillRect((i * 256) / gores, 0, 256 / gores + 1, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(0, 56, 256, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

let _chuteTex: THREE.CanvasTexture | null = null;

interface Body {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
  life: number;
  drag: number;
  landed: boolean;
}

interface Chute {
  group: THREE.Group;
  canopy: THREE.Mesh;
  lines: THREE.LineSegments;
  pilot: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  deployAt: number;
  landedAt: number;
  swing: number;
  isPlayer: boolean;
  trail: Trail | null;
}

interface Piece extends Body {
  trail: Trail | null;
  burning: number;
}

export class EjectionEffects {
  private bodies: Body[] = [];
  private chutes: Chute[] = [];
  private pieces: Piece[] = [];
  private suit = new THREE.MeshStandardMaterial({ color: 0x4a5340, roughness: 0.95 });
  private helmet = new THREE.MeshStandardMaterial({ color: 0x5b6150, roughness: 0.5 });
  private seatMat = new THREE.MeshStandardMaterial({ color: 0x2d3033, roughness: 0.8 });
  private glass = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.45 });
  private lineMat = new THREE.LineBasicMaterial({ color: 0x2a2a2a });
  /** materials every parachute / seat shares: never freed with one of them */
  private shared = new Set<THREE.Material>([this.suit, this.helmet, this.seatMat, this.glass, this.lineMat]);
  /** latest player parachute position (the death camera follows it) */
  playerChute: THREE.Vector3 | null = null;

  constructor(
    private scene: THREE.Scene,
    private smoke: ParticleSystem,
    private fire: ParticleSystem,
    private trails: TrailRenderer,
  ) {}

  eject(a: Aircraft, canopyGeo: THREE.BufferGeometry | null): void {
    const fm = a.fm;
    const q = fm.quat;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const seats = a.spec.crew;
    // canopy jettison
    if (canopyGeo) {
      const m = new THREE.Mesh(canopyGeo, this.glass);
      // the canopy geometry belongs to the jet's model: not ours to free
      m.userData.keepGeo = true;
      m.quaternion.copy(q);
      m.position.copy(fm.pos);
      this.scene.add(m);
      this.bodies.push({
        obj: m,
        pos: fm.pos.clone(),
        vel: fm.vel.clone().addScaledVector(up, 25),
        spin: new THREE.Vector3(randGauss() * 3, randGauss() * 3, randGauss() * 3),
        age: 0,
        life: 40,
        drag: 0.05,
        landed: false,
      });
    }
    for (let s = 0; s < seats; s++) {
      const eyeZ = -5.4 + s * 1.45;
      const p = new THREE.Vector3(0, 1.2, eyeZ).applyQuaternion(q).add(fm.pos);
      const vel = fm.vel.clone().multiplyScalar(0.92).addScaledVector(up, 42 - s * 4);
      // rocket plume at the moment of firing
      for (let i = 0; i < 8; i++) {
        this.fire.spawn({ x: p.x, y: p.y, z: p.z, vx: -up.x * 20 + randGauss() * 4, vy: -up.y * 20 + randGauss() * 4, vz: -up.z * 20 + randGauss() * 4, life: rand(0.2, 0.45), size0: 1.6, size1: 0.6, c0: FIRE_HOT, c1: FIRE_ORANGE, a0: 1, a1: 0 });
      }
      this.spawnChute(p, vel, a.isPlayer && s === 0, 1.3 + s * 0.35);
    }
  }

  private spawnChute(pos: THREE.Vector3, vel: THREE.Vector3, isPlayer: boolean, deployAt: number): void {
    if (!_chuteTex) _chuteTex = chuteTexture();
    const group = new THREE.Group();
    // pilot hanging below the harness point (origin = harness)
    const pilot = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 4, 8), this.suit);
    body.position.y = -1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), this.helmet);
    head.position.y = -0.35;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.35), this.seatMat);
    seat.position.set(0, -1.0, 0.25);
    seat.name = 'seat';
    pilot.add(body, head, seat);
    group.add(pilot);
    // canopy: a shallow dome, gores textured
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      prof.push(new THREE.Vector2(0.05 + 3.8 * Math.sin((t * Math.PI) / 2), 2.2 * Math.cos((t * Math.PI) / 2) - 0.3 * t));
    }
    const canopyGeo = new THREE.LatheGeometry(prof, 16);
    const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({ map: _chuteTex, side: THREE.DoubleSide, roughness: 0.9, transparent: true, opacity: 1 }));
    canopy.position.y = 7.0;
    canopy.scale.setScalar(0.05);
    canopy.visible = false;
    group.add(canopy);
    // suspension lines from the skirt to the harness
    const lp: number[] = [];
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      lp.push(0, 0, 0, Math.cos(ang) * 3.8, 7.0 - 0.3, Math.sin(ang) * 3.8);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lines = new THREE.LineSegments(lg, this.lineMat);
    lines.visible = false;
    group.add(lines);
    group.position.copy(pos);
    group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.scene.add(group);
    const trail = this.trails.create({ width0: 0.5, width1: 3, life: 3, color: SMOKE, alpha: 0.5, spacing: 3 });
    this.chutes.push({ group, canopy, lines, pilot, pos: pos.clone(), vel: vel.clone(), age: 0, deployAt, landedAt: -1, swing: rand(0, 6), isPlayer, trail });
  }

  /** Burning, smoking pieces of an airframe destroyed in the air. */
  debris(a: Aircraft, paint: THREE.Color): void {
    const fm = a.fm;
    const n = 7 + Math.floor(Math.random() * 4);
    const mat = new THREE.MeshStandardMaterial({ color: paint.clone().multiplyScalar(0.55), roughness: 0.8, metalness: 0.2, flatShading: true });
    for (let i = 0; i < n; i++) {
      const big = i < 3;
      const s = big ? rand(1.2, 2.6) : rand(0.35, 1.0);
      const geo = new THREE.TetrahedronGeometry(s, 0);
      geo.scale(1, rand(0.15, 0.4), rand(0.6, 1.4));
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.position.copy(fm.pos);
      this.scene.add(m);
      const vel = fm.vel.clone().multiplyScalar(rand(0.55, 0.9)).add(new THREE.Vector3(randGauss() * 30, randGauss() * 25 + 8, randGauss() * 30));
      const trail = big || Math.random() < 0.4 ? this.trails.create({ width0: big ? 1.2 : 0.6, width1: big ? 9 : 4, life: big ? 7 : 4, color: big ? DARK : SMOKE, alpha: 0.55, spacing: 8 }) : null;
      this.pieces.push({
        obj: m,
        pos: fm.pos.clone(),
        vel,
        spin: new THREE.Vector3(randGauss() * 4, randGauss() * 4, randGauss() * 4),
        age: 0,
        life: 60,
        drag: big ? 0.012 : 0.03,
        landed: false,
        trail,
        burning: big ? rand(4, 12) : rand(0, 3),
      });
    }
  }

  /** Free the GPU side of a finished body or parachute (its own geometry and materials). */
  private free(o: THREE.Object3D): void {
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.geometry) return;
      if (!m.userData.keepGeo) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) if (mt && !this.shared.has(mt)) mt.dispose();
    });
  }

  update(dt: number, time: number): void {
    // free bodies (canopies)
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.age += dt;
      if (!b.landed) this.integrate(b, dt);
      if (b.age > b.life) {
        this.scene.remove(b.obj);
        this.free(b.obj);
        this.bodies.splice(i, 1);
      }
    }
    // debris
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.age += dt;
      if (!p.landed) {
        this.integrate(p, dt);
        p.trail?.add(p.pos, time);
        if (p.burning > 0) {
          p.burning -= dt;
          if (Math.random() < 0.7) this.fire.spawn({ x: p.pos.x, y: p.pos.y, z: p.pos.z, vx: p.vel.x * 0.4, vy: p.vel.y * 0.4, vz: p.vel.z * 0.4, life: rand(0.2, 0.4), size0: 2.5, size1: 4, c0: FIRE_HOT, c1: FIRE_ORANGE, a0: 1, a1: 0, drag: 3 });
        }
        if (p.landed) {
          if (p.trail) p.trail.emitting = false;
          const water = p.pos.y <= 0.6;
          for (let k = 0; k < 5; k++) this.smoke.spawn({ x: p.pos.x, y: p.pos.y + 0.5, z: p.pos.z, vx: randGauss() * 3, vy: rand(3, water ? 14 : 6), vz: randGauss() * 3, life: rand(1.5, 3), size0: 2, size1: 9, c0: water ? SPRAY : DUST, a0: 0.6, a1: 0, gravity: water ? -9.8 : 0 });
        }
      }
      if (p.age > p.life) {
        this.scene.remove(p.obj);
        this.pieces.splice(i, 1);
        // the pieces of one airframe share a material: free it with the last of them
        const mat = (p.obj as THREE.Mesh).material as THREE.Material;
        (p.obj as THREE.Mesh).geometry.dispose();
        if (!this.pieces.some((q) => (q.obj as THREE.Mesh).material === mat)) mat.dispose();
      }
    }
    // parachutes
    this.playerChute = null;
    for (let i = this.chutes.length - 1; i >= 0; i--) {
      const c = this.chutes[i];
      c.age += dt;
      const deployed = c.age >= c.deployAt;
      const ground = surfaceHeight(c.pos.x, c.pos.z);
      if (c.landedAt < 0) {
        if (!deployed) {
          // seat + pilot ballistic, drag slows them quickly
          c.vel.y -= G * dt;
          c.vel.multiplyScalar(Math.exp(-dt * 0.9));
          c.trail?.add(c.pos, time);
        } else {
          if (c.trail) {
            c.trail.emitting = false;
            c.trail = null;
            // seat separation
            const seat = c.pilot.getObjectByName('seat');
            if (seat) {
              c.pilot.remove(seat);
              seat.position.copy(c.pos).add(new THREE.Vector3(0, -1, 0));
              this.scene.add(seat);
              this.bodies.push({ obj: seat, pos: seat.position.clone(), vel: c.vel.clone(), spin: new THREE.Vector3(2, 1, 3), age: 0, life: 30, drag: 0.02, landed: false });
            }
          }
          // canopy inflates over ~1.2 s, then steady descent ~6 m/s with drift
          const k = Math.min(1, (c.age - c.deployAt) / 1.2);
          c.canopy.visible = true;
          c.lines.visible = k > 0.3;
          c.canopy.scale.set(0.2 + 0.8 * k, 0.5 + 0.5 * k, 0.2 + 0.8 * k);
          const target = new THREE.Vector3(WIND.x, -6.2, WIND.z);
          c.vel.lerp(target, 1 - Math.exp(-dt * (0.6 + 2.5 * k)));
          c.swing += dt;
        }
        c.pos.addScaledVector(c.vel, dt);
        if (c.pos.y - 1.9 <= ground) {
          c.pos.y = ground + 1.9;
          c.landedAt = c.age;
          c.vel.set(0, 0, 0);
          const water = ground <= 0.5;
          for (let k = 0; k < 6; k++) this.smoke.spawn({ x: c.pos.x, y: ground + 0.3, z: c.pos.z, vx: randGauss() * 2, vy: rand(1, water ? 6 : 3), vz: randGauss() * 2, life: rand(1, 2.5), size0: 1, size1: 4, c0: water ? SPRAY : DUST, a0: 0.5, a1: 0 });
        }
      } else {
        // collapse the canopy and fade out
        const t = c.age - c.landedAt;
        c.canopy.scale.y = Math.max(0.05, 1 - t * 0.6);
        c.canopy.position.y = Math.max(1.0, 7 - t * 3);
        const mat = c.canopy.material as THREE.MeshStandardMaterial;
        mat.opacity = Math.max(0, 1 - Math.max(0, t - 20) / 5);
        c.lines.visible = t < 2;
        if (t > 25) {
          this.scene.remove(c.group);
          this.free(c.group);
          this.chutes.splice(i, 1);
          continue;
        }
      }
      c.group.position.copy(c.pos);
      // pendulum swing under the canopy
      const sw = deployed && c.landedAt < 0 ? Math.sin(c.swing * 1.6) * 0.12 : 0;
      c.group.rotation.set(sw, 0, sw * 0.6);
      if (c.isPlayer) this.playerChute = c.pos;
    }
  }

  private integrate(b: Body, dt: number): void {
    b.vel.y -= G * dt;
    const sp = b.vel.length();
    b.vel.multiplyScalar(Math.max(0, 1 - b.drag * sp * dt * 0.02));
    b.pos.addScaledVector(b.vel, dt);
    b.obj.position.copy(b.pos);
    b.obj.rotation.x += b.spin.x * dt;
    b.obj.rotation.y += b.spin.y * dt;
    b.obj.rotation.z += b.spin.z * dt;
    const gh = surfaceHeight(b.pos.x, b.pos.z);
    if (b.pos.y <= gh + 0.3) {
      b.pos.y = gh + 0.3;
      b.obj.position.copy(b.pos);
      b.landed = true;
    }
  }

  setVisible(v: boolean): void {
    for (const b of this.bodies) b.obj.visible = v;
    for (const p of this.pieces) p.obj.visible = v;
    for (const c of this.chutes) c.group.visible = v;
  }

  clear(): void {
    for (const b of this.bodies) this.scene.remove(b.obj);
    for (const p of this.pieces) this.scene.remove(p.obj);
    for (const c of this.chutes) this.scene.remove(c.group);
    this.bodies.length = 0;
    this.pieces.length = 0;
    this.chutes.length = 0;
    this.playerChute = null;
  }
}
