// Turns the simulation into pictures: airframes, missiles and their smoke,
// tracers, flares and chaff, explosions, burning wrecks, contrails, wingtip
// vortices and condensation vapour.

import * as THREE from 'three';
import type { Sim } from '../game/sim';
import type { Aircraft } from '../aircraft/aircraft';
import type { Missile } from '../weapons/missile';
import type { Decoy } from '../weapons/countermeasures';
import { createAirframe, AirframeVisual, paintAirframe } from '../aircraft/models';
import { loadPaint } from '../aircraft/models/paint';
import { storeGeometry } from '../aircraft/models/stores';
import { cloneMaterial } from '../aircraft/models/kit';
import { ParticleSystem } from './particles';
import { TrailRenderer, Trail, TrailStyle } from './trails';
import { getSmokeTexture, getSoftDotTexture } from './textures';
import { rand, randGauss } from '../core/rng';
import { srgb } from '../core/math';
import { terrainHeight } from '../world/terrain';
import { EjectionEffects } from './ejection';

const TRACER_VERT = /* glsl */ `
attribute vec3 iStart;
attribute vec3 iEnd;
attribute vec3 iColor;
varying vec3 vColor;
varying float vV;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vColor = iColor;
  vV = position.y;
  vec4 a = modelViewMatrix * vec4( iStart, 1.0 );
  vec4 b = modelViewMatrix * vec4( iEnd, 1.0 );
  vec3 dir = b.xyz - a.xyz;
  vec3 side = normalize( cross( dir, vec3( 0.0, 0.0, 1.0 ) ) + 1e-6 );
  float dist = length( mix( a.xyz, b.xyz, position.x ) );
  float w = max( 0.22, dist * 0.0016 );
  vec4 p = mix( a, b, position.x );
  p.xyz += side * position.y * w;
  gl_Position = projectionMatrix * p;
  #include <logdepthbuf_vertex>
}
`;

const TRACER_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vV;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float e = 1.0 - abs( vV );
  gl_FragColor = vec4( vColor * e * 2.5, 1.0 );
}
`;

interface MissileVis {
  mesh: THREE.Mesh;
  trail: Trail;
  lastPuff: number;
}

interface DecoyVis {
  trail: Trail | null;
}

interface Burn {
  pos: THREE.Vector3;
  t: number;
  life: number;
  size: number;
}

const WHITE_SMOKE = srgb(0.92, 0.92, 0.94);
const GREY_SMOKE = srgb(0.55, 0.55, 0.57);
const DARK_SMOKE = srgb(0.12, 0.12, 0.13);
const FIRE_HOT = srgb(1.0, 0.85, 0.55);
const FIRE_ORANGE = srgb(1.0, 0.45, 0.1);
const FIRE_RED = srgb(0.5, 0.08, 0.02);
const FLARE_COL = srgb(1.0, 0.95, 0.8);
const DUST = srgb(0.55, 0.45, 0.38);

export class CombatRenderer {
  readonly aircraftVis = new Map<Aircraft, AirframeVisual>();
  private missileVis = new Map<Missile, MissileVis>();
  private decoyVis = new Map<Decoy, DecoyVis>();
  readonly smoke: ParticleSystem;
  readonly fire: ParticleSystem;
  readonly trails = new TrailRenderer();
  readonly eject: EjectionEffects;
  private tracerMesh: THREE.Mesh;
  private tracerGeo: THREE.InstancedBufferGeometry;
  private tracerStart: Float32Array;
  private tracerEnd: Float32Array;
  private tracerCol: Float32Array;
  private burns: Burn[] = [];
  private contrails = new Map<Aircraft, Trail[]>();
  private vortices = new Map<Aircraft, Trail[]>();
  private flash: THREE.PointLight;
  private flashT = 0;
  private time = 0;
  private origin = new THREE.Vector3();
  private missileMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
  private unsub: (() => void)[] = [];
  /** called when something big blows up near the camera (camera shake) */
  onExplosion: ((pos: THREE.Vector3, size: number) => void) | null = null;
  playerAircraft: Aircraft | null = null;

  constructor(
    private scene: THREE.Scene,
    private sim: Sim,
  ) {
    this.smoke = new ParticleSystem(9000, getSmokeTexture(), false, 14);
    this.fire = new ParticleSystem(6000, getSoftDotTexture(), true, 16);
    scene.add(this.smoke.mesh, this.fire.mesh, this.trails.mesh);
    this.eject = new EjectionEffects(scene, this.smoke, this.fire, this.trails);

    const MAXT = 3000;
    const quad = new THREE.PlaneGeometry(1, 2, 1, 1);
    quad.translate(0.5, 0, 0);
    this.tracerGeo = new THREE.InstancedBufferGeometry();
    this.tracerGeo.index = quad.index;
    this.tracerGeo.setAttribute('position', quad.attributes.position);
    this.tracerStart = new Float32Array(MAXT * 3);
    this.tracerEnd = new Float32Array(MAXT * 3);
    this.tracerCol = new Float32Array(MAXT * 3);
    this.tracerGeo.setAttribute('iStart', new THREE.InstancedBufferAttribute(this.tracerStart, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo.setAttribute('iEnd', new THREE.InstancedBufferAttribute(this.tracerEnd, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeo.setAttribute('iColor', new THREE.InstancedBufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerMesh = new THREE.Mesh(
      this.tracerGeo,
      new THREE.ShaderMaterial({
        vertexShader: TRACER_VERT,
        fragmentShader: TRACER_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.renderOrder = 17;
    scene.add(this.tracerMesh);

    this.flash = new THREE.PointLight(0xffaa55, 0, 1500, 1.6);
    scene.add(this.flash);

    const ev = sim.events;
    this.unsub.push(
      ev.on('aircraftAdded', (a) => this.addAircraft(a)),
      ev.on('aircraftRemoved', (a) => this.removeAircraft(a)),
      ev.on('launch', (e) => this.onLaunch(e.missile, e.station)),
      ev.on('detonate', (e) => this.explode(e.pos, e.hit ? 1.0 : 0.6, e.kind === 'water' ? 'water' : e.kind === 'ground' ? 'ground' : 'air')),
      ev.on('destroyed', (e) => this.onDestroyed(e.victim)),
      ev.on('crash', (e) => this.onCrash(e.aircraft, e.pos, e.water)),
      ev.on('hit', (e) => this.onHit(e.pos, e.weapon)),
      ev.on('decoy', (d) => this.onDecoy(d)),
      ev.on('bulletImpact', (e) => this.onBulletImpact(e.pos, e.water)),
      ev.on('storeDropped', (e) => this.aircraftVis.get(e.aircraft)?.removeStation(e.station)),
      ev.on('eject', (e) => this.onEject(e.aircraft)),
    );
    for (const a of sim.aircraft) this.addAircraft(a);
  }

  dispose(): void {
    for (const u of this.unsub) u();
    for (const a of [...this.aircraftVis.keys()]) this.removeAircraft(a);
    for (const m of [...this.missileVis.keys()]) this.removeMissile(m);
    this.eject.clear();
    this.scene.remove(this.smoke.mesh, this.fire.mesh, this.trails.mesh, this.tracerMesh, this.flash);
  }

  /** Show or hide everything this renderer draws (the replay borrows the scene). */
  setVisible(v: boolean): void {
    for (const vis of this.aircraftVis.values()) vis.root.visible = v && !vis.wreck;
    for (const mv of this.missileVis.values()) mv.mesh.visible = v;
    this.smoke.mesh.visible = v;
    this.fire.mesh.visible = v;
    this.trails.mesh.visible = v;
    this.tracerMesh.visible = v;
    this.eject.setVisible(v);
  }

  clearEffects(): void {
    this.smoke.clear();
    this.fire.clear();
    this.trails.clear();
    this.burns.length = 0;
    this.contrails.clear();
    this.vortices.clear();
    for (const m of [...this.missileVis.keys()]) this.removeMissile(m);
    this.decoyVis.clear();
    this.eject.clear();
  }

  private addAircraft(a: Aircraft): void {
    if (this.aircraftVis.has(a)) return;
    const v = createAirframe(a);
    if (a.isPlayer) paintAirframe(v, loadPaint(a.type));
    this.aircraftVis.set(a, v);
    this.scene.add(v.root);
  }

  private removeAircraft(a: Aircraft): void {
    const v = this.aircraftVis.get(a);
    if (!v) return;
    this.scene.remove(v.root);
    v.dispose();
    this.aircraftVis.delete(a);
    this.contrails.delete(a);
    this.vortices.delete(a);
  }

  /** Rebuild stores after a rearm. */
  refreshStores(a: Aircraft): void {
    this.aircraftVis.get(a)?.buildStores();
  }

  private onLaunch(m: Missile, station: number): void {
    const shooterVis = this.aircraftVis.get(m.shooter);
    shooterVis?.removeStation(station);
    const mesh = new THREE.Mesh(storeGeometry(m.spec.type), this.missileMat);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const style: TrailStyle =
      m.spec.type === 'AIM120D'
        ? { width0: 0.8, width1: 7, life: 16, color: WHITE_SMOKE, alpha: 0.55, spacing: 18 }
        : { width0: 0.6, width1: 5, life: 11, color: WHITE_SMOKE, alpha: 0.6, spacing: 14 };
    const trail = this.trails.create(style);
    trail.emitting = false; // starts at motor ignition
    this.missileVis.set(m, { mesh, trail, lastPuff: 0 });
    // rail launch flash
    this.fire.spawn({ x: m.pos.x, y: m.pos.y, z: m.pos.z, life: 0.25, size0: 3, size1: 8, c0: FIRE_HOT, c1: FIRE_ORANGE, a0: 1, a1: 0 });
  }

  private removeMissile(m: Missile): void {
    const v = this.missileVis.get(m);
    if (!v) return;
    this.scene.remove(v.mesh);
    v.trail.emitting = false;
    this.missileVis.delete(m);
  }

  private onDecoy(d: Decoy): void {
    if (d.kind === 'flare') {
      const trail = this.trails.create({ width0: 0.4, width1: 3.5, life: 5, color: WHITE_SMOKE, alpha: 0.5, spacing: 5 });
      this.decoyVis.set(d, { trail });
    } else {
      // chaff: a glittering cloud
      for (let i = 0; i < 24; i++) {
        this.smoke.spawn({
          x: d.pos.x,
          y: d.pos.y,
          z: d.pos.z,
          vx: d.vel.x * 0.3 + randGauss() * 8,
          vy: d.vel.y * 0.3 + randGauss() * 8,
          vz: d.vel.z * 0.3 + randGauss() * 8,
          life: rand(3, 5),
          size0: 0.8,
          size1: 4,
          c0: srgb(0.85, 0.86, 0.9),
          a0: 0.35,
          a1: 0,
          drag: 3,
          gravity: -0.5,
        });
      }
      this.decoyVis.set(d, { trail: null });
    }
  }

  private onHit(pos: THREE.Vector3, weapon: string): void {
    const n = weapon.startsWith('AIM') ? 0 : 4;
    for (let i = 0; i < n; i++) {
      this.fire.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: randGauss() * 25, vy: randGauss() * 25, vz: randGauss() * 25, life: rand(0.2, 0.5), size0: 0.8, size1: 0.3, c0: FIRE_HOT, c1: FIRE_ORANGE, a0: 1, a1: 0, drag: 2 });
    }
    if (n) this.smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 1.5, size0: 1.5, size1: 5, c0: GREY_SMOKE, a0: 0.5, a1: 0 });
  }

  private onBulletImpact(pos: THREE.Vector3, water: boolean): void {
    if (Math.random() < 0.6) return;
    if (water) {
      for (let i = 0; i < 3; i++) this.smoke.spawn({ x: pos.x, y: 0.5, z: pos.z, vx: randGauss() * 2, vy: rand(8, 16), vz: randGauss() * 2, life: 1.4, size0: 1, size1: 4, c0: WHITE_SMOKE, a0: 0.7, a1: 0, gravity: -9.8, drag: 0.5 });
    } else {
      this.smoke.spawn({ x: pos.x, y: pos.y + 0.5, z: pos.z, vy: 3, life: 2.5, size0: 2, size1: 7, c0: DUST, a0: 0.6, a1: 0 });
    }
  }

  private onEject(a: Aircraft): void {
    const v = this.aircraftVis.get(a);
    this.eject.eject(a, v?.canopy ? v.canopy.geometry : null);
    if (v?.canopy) v.canopy.visible = false;
    for (const o of v?.hideInCockpit ?? []) o.visible = false;
  }

  explode(pos: THREE.Vector3, scale: number, kind: 'air' | 'ground' | 'water'): void {
    const s = scale;
    this.fire.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.22, size0: 40 * s, size1: 70 * s, c0: FIRE_HOT, a0: 1, a1: 0 });
    for (let i = 0; i < 18 * s + 4; i++) {
      this.fire.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: randGauss() * 30 * s, vy: randGauss() * 30 * s + (kind === 'air' ? 0 : 15), vz: randGauss() * 30 * s,
        life: rand(0.6, 1.5), size0: rand(6, 12) * s, size1: rand(14, 28) * s,
        c0: FIRE_HOT, c1: FIRE_RED, a0: 0.95, a1: 0, drag: 2.5, gravity: 2,
      });
    }
    for (let i = 0; i < 14 * s + 3; i++) {
      this.smoke.spawn({
        x: pos.x + randGauss() * 5, y: pos.y + randGauss() * 5, z: pos.z + randGauss() * 5,
        vx: randGauss() * 12, vy: randGauss() * 8 + 4, vz: randGauss() * 12,
        life: rand(6, 12), size0: rand(8, 14) * s, size1: rand(35, 70) * s,
        c0: kind === 'water' ? WHITE_SMOKE : DARK_SMOKE, c1: GREY_SMOKE, a0: 0.75, a1: 0, drag: 1, gravity: 1.5,
      });
    }
    for (let i = 0; i < 16 * s; i++) {
      this.fire.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: randGauss() * 90, vy: randGauss() * 90 + 20, vz: randGauss() * 90,
        life: rand(0.8, 2.2), size0: 1.4, size1: 0.6, c0: FIRE_HOT, c1: FIRE_ORANGE, a0: 1, a1: 0, drag: 0.6, gravity: -9.8,
      });
    }
    if (kind === 'water') {
      for (let i = 0; i < 20; i++) {
        this.smoke.spawn({ x: pos.x + randGauss() * 6, y: 1, z: pos.z + randGauss() * 6, vx: randGauss() * 10, vy: rand(20, 60), vz: randGauss() * 10, life: rand(2, 4), size0: 4, size1: 16, c0: WHITE_SMOKE, a0: 0.8, a1: 0, gravity: -9.8, drag: 0.4 });
      }
    }
    this.flash.position.copy(pos);
    this.flash.intensity = 4e6 * s;
    this.flashT = 0.25;
    this.onExplosion?.(pos, s);
  }

  private onDestroyed(a: Aircraft): void {
    const p = a.fm.pos;
    if (a.fm.crashed) return; // crash handler does the fireball
    if (a.ejected) return; // the jet flies on unmanned until it hits something
    this.explode(p, 1.3, 'air');
    this.eject.debris(a, new THREE.Color(a.spec.paint.top));
    const v = this.aircraftVis.get(a);
    if (v) darkenAirframe(v);
    // most crews get out of a stricken jet: a chute (or two) blossoms
    if (!a.isPlayer && !a.damage.pilotKilled && Math.random() < 0.65) {
      this.eject.eject(a, v?.canopy ? v.canopy.geometry : null);
      if (v?.canopy) v.canopy.visible = false;
    }
  }

  private onCrash(a: Aircraft, pos: THREE.Vector3, water: boolean): void {
    const g = Math.max(0, terrainHeight(pos.x, pos.z));
    const p = new THREE.Vector3(pos.x, Math.max(pos.y, g + 1), pos.z);
    this.explode(p, 1.6, water ? 'water' : 'ground');
    if (!water) this.burns.push({ pos: p.clone(), t: 0, life: rand(50, 90), size: 1 });
    const v = this.aircraftVis.get(a);
    if (v) {
      v.root.visible = false;
      v.wreck = true;
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    const cam = camera.position;
    this.origin.set(Math.round(cam.x / 500) * 500, Math.round(cam.y / 500) * 500, Math.round(cam.z / 500) * 500);

    // aircraft visuals & per-aircraft effects
    for (const [a, v] of this.aircraftVis) {
      v.update(dt);
      v.setDetail(v.root.position.distanceToSquared(cam) < 900 * 900);
      if (a.fm.crashed) continue;
      this.aircraftEffects(a, v, dt);
    }

    // missiles
    for (const m of this.sim.missiles) {
      const mv = this.missileVis.get(m);
      if (!mv) continue;
      mv.mesh.position.copy(m.pos);
      const vl = m.vel.length();
      if (vl > 1) mv.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), m.vel.clone().divideScalar(vl));
      if (m.motorOn) {
        mv.trail.emitting = true;
        mv.trail.add(m.pos, this.time);
        // motor plume
        const back = m.vel.clone().normalize().multiplyScalar(-m.spec.length * 0.55);
        this.fire.spawn({ x: m.pos.x + back.x, y: m.pos.y + back.y, z: m.pos.z + back.z, life: 0.06, size0: 2.2, size1: 1.2, c0: FIRE_HOT, c1: FIRE_ORANGE, a0: 1, a1: 0.3 });
        if (this.time - mv.lastPuff > 0.05) {
          mv.lastPuff = this.time;
          this.smoke.spawn({ x: m.pos.x + back.x, y: m.pos.y + back.y, z: m.pos.z + back.z, vx: randGauss() * 2, vy: randGauss() * 2, vz: randGauss() * 2, life: rand(4, 7), size0: 1.2, size1: 8, c0: WHITE_SMOKE, c1: GREY_SMOKE, a0: 0.45, a1: 0, drag: 1 });
        }
      } else if (mv.trail.emitting && mv.trail.xs.length > 0) {
        mv.trail.emitting = false;
      }
    }
    for (const [m] of this.missileVis) if (!m.alive) this.removeMissile(m);

    // decoys
    for (const d of this.sim.cms.decoys) {
      const dv = this.decoyVis.get(d);
      if (d.kind === 'flare') {
        const k = Math.max(0, 1 - d.age / d.life);
        this.fire.spawn({ x: d.pos.x, y: d.pos.y, z: d.pos.z, life: 0.06, size0: 4 * k + 1, size1: 3 * k + 1, c0: FLARE_COL, c1: FIRE_ORANGE, a0: 1, a1: 0.5 });
        dv?.trail?.add(d.pos, this.time);
      }
    }
    for (const [d, dv] of this.decoyVis) {
      if (d.age >= d.life || !this.sim.cms.decoys.includes(d)) {
        if (dv.trail) dv.trail.emitting = false;
        this.decoyVis.delete(d);
      }
    }

    // burning wrecks
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.t += dt;
      if (b.t > b.life) {
        this.burns.splice(i, 1);
        continue;
      }
      const k = 1 - b.t / b.life;
      if (Math.random() < 0.6) this.fire.spawn({ x: b.pos.x + randGauss() * 3, y: b.pos.y, z: b.pos.z + randGauss() * 3, vy: rand(3, 8), life: rand(0.5, 1.2), size0: 5 * k + 1, size1: 3, c0: FIRE_HOT, c1: FIRE_RED, a0: 0.9 * k, a1: 0 });
      if (Math.random() < 0.35) this.smoke.spawn({ x: b.pos.x + randGauss() * 3, y: b.pos.y + 3, z: b.pos.z + randGauss() * 3, vx: 2, vy: rand(6, 12), vz: 1, life: rand(10, 18), size0: 6, size1: 45, c0: DARK_SMOKE, c1: GREY_SMOKE, a0: 0.6 * k + 0.1, a1: 0, drag: 0.2 });
    }

    this.eject.update(dt, this.time);
    this.updateTracers();
    this.smoke.update(dt, cam);
    this.fire.update(dt, cam);
    this.trails.update(this.time, cam);

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.intensity *= Math.exp(-dt * 14);
      if (this.flashT <= 0) this.flash.intensity = 0;
    }
  }

  private aircraftEffects(a: Aircraft, v: AirframeVisual, dt: number): void {
    const fm = a.fm;
    const alt = fm.pos.y;
    const q = fm.quat;
    const tmp = new THREE.Vector3();
    // contrails at altitude
    const wantContrail = alt > 8200 && !fm.onGround;
    let cts = this.contrails.get(a);
    if (wantContrail) {
      if (!cts) {
        cts = v.nozzles.map(() => this.trails.create({ width0: 1.2, width1: 22, life: 40, color: WHITE_SMOKE, alpha: 0.5 * Math.min(1, (alt - 8200) / 1500), spacing: 30 }));
        this.contrails.set(a, cts);
      }
      v.nozzles.forEach((n, i) => {
        tmp.copy(n.pos).setZ(n.pos.z + 18).applyQuaternion(q).add(fm.pos);
        cts![i].add(tmp, this.time);
      });
    } else if (cts) {
      for (const t of cts) t.emitting = false;
      this.contrails.delete(a);
    }

    // wingtip vortices when pulling G low down
    const wantVortex = a.alive && fm.nz > 4.2 && alt < 7000 && fm.tas > 110;
    let vts = this.vortices.get(a);
    if (wantVortex) {
      if (!vts) {
        vts = [-1, 1].map(() => this.trails.create({ width0: 0.25, width1: 1.4, life: 1.6, color: WHITE_SMOKE, alpha: 0.55, spacing: 6 }));
        this.vortices.set(a, vts);
      }
      const hs = a.spec.span / 2 - 0.2;
      [-1, 1].forEach((sx, i) => {
        tmp.set(sx * hs, 0, 2.5).applyQuaternion(q).add(fm.pos);
        vts![i].add(tmp, this.time);
      });
      // wing vapour at very high G
      if (fm.nz > 6.5 && Math.random() < 0.8) {
        for (const sx of [-1, 1]) {
          tmp.set(sx * rand(1.5, a.spec.span * 0.35), 0.6, rand(-1, 2.5)).applyQuaternion(q).add(fm.pos);
          this.smoke.spawn({ x: tmp.x, y: tmp.y, z: tmp.z, vx: fm.vel.x * 0.9, vy: fm.vel.y * 0.9, vz: fm.vel.z * 0.9, life: 0.25, size0: 2, size1: 4, c0: WHITE_SMOKE, a0: 0.35, a1: 0, drag: 3 });
        }
      }
    } else if (vts) {
      for (const t of vts) t.emitting = false;
      this.vortices.delete(a);
    }

    // transonic vapour cone
    if (fm.mach > 0.96 && fm.mach < 1.05 && alt < 6000 && Math.random() < 0.9) {
      for (let k = 0; k < 5; k++) {
        const ang = Math.random() * Math.PI * 2;
        tmp.set(Math.cos(ang) * 2.4, Math.sin(ang) * 2.0, rand(-1.5, 0.5)).applyQuaternion(q).add(fm.pos);
        this.smoke.spawn({ x: tmp.x, y: tmp.y, z: tmp.z, vx: fm.vel.x * 0.95, vy: fm.vel.y * 0.95, vz: fm.vel.z * 0.95, life: 0.12, size0: 2.5, size1: 3.5, c0: WHITE_SMOKE, a0: 0.45, a1: 0 });
      }
    }

    // damage smoke / fire
    const burning = a.damage.fire > 0 || !a.alive;
    const hurt = a.damage.frac('engineL') < 0.6 || a.damage.frac('engineR') < 0.6 || a.damage.integrity < 0.55;
    if (burning || hurt) {
      tmp.set(0, 0, a.spec.length * 0.45).applyQuaternion(q).add(fm.pos);
      if (burning && Math.random() < 0.9) {
        this.fire.spawn({ x: tmp.x, y: tmp.y, z: tmp.z, vx: fm.vel.x * 0.3, vy: fm.vel.y * 0.3, vz: fm.vel.z * 0.3, life: rand(0.25, 0.5), size0: 4, size1: 7, c0: FIRE_HOT, c1: FIRE_RED, a0: 1, a1: 0, drag: 3 });
      }
      if (Math.random() < 0.7) {
        this.smoke.spawn({ x: tmp.x, y: tmp.y, z: tmp.z, vx: fm.vel.x * 0.1, vy: fm.vel.y * 0.1, vz: fm.vel.z * 0.1, life: rand(5, 9), size0: 4, size1: 22, c0: burning ? DARK_SMOKE : GREY_SMOKE, c1: GREY_SMOKE, a0: 0.55, a1: 0, drag: 1 });
      }
    }

    // gun: muzzle flash
    if (a.gunFiring) {
      const g = a.spec.gun.port;
      tmp.set(g[0], g[1], g[2] - 0.5).applyQuaternion(q).add(fm.pos);
      this.fire.spawn({ x: tmp.x, y: tmp.y, z: tmp.z, vx: fm.vel.x, vy: fm.vel.y, vz: fm.vel.z, life: 0.04, size0: 1.6, size1: 0.8, c0: FIRE_HOT, a0: 1, a1: 0 });
    }
    void dt;
  }

  private updateTracers(): void {
    const b = this.sim.bullets;
    let n = 0;
    const max = this.tracerStart.length / 3;
    for (let i = 0; i < b.count && n < max; i++) {
      if (!b.tracer[i]) continue;
      const x = b.px[i] - this.origin.x, y = b.py[i] - this.origin.y, z = b.pz[i] - this.origin.z;
      const len = 0.035;
      this.tracerEnd[n * 3] = x;
      this.tracerEnd[n * 3 + 1] = y;
      this.tracerEnd[n * 3 + 2] = z;
      this.tracerStart[n * 3] = x - b.vx[i] * len;
      this.tracerStart[n * 3 + 1] = y - b.vy[i] * len;
      this.tracerStart[n * 3 + 2] = z - b.vz[i] * len;
      const blue = b.owner[i]?.team === 'blue';
      this.tracerCol[n * 3] = blue ? 1.0 : 1.0;
      this.tracerCol[n * 3 + 1] = blue ? 0.75 : 0.45;
      this.tracerCol[n * 3 + 2] = blue ? 0.35 : 0.2;
      n++;
    }
    this.tracerGeo.instanceCount = n;
    this.tracerMesh.position.copy(this.origin);
    const at = this.tracerGeo.attributes;
    (at.iStart as THREE.InstancedBufferAttribute).needsUpdate = true;
    (at.iEnd as THREE.InstancedBufferAttribute).needsUpdate = true;
    (at.iColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}

function darkenAirframe(v: AirframeVisual): void {
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material instanceof THREE.MeshStandardMaterial) {
      const mat = cloneMaterial(m.material);
      mat.color.multiplyScalar(0.35);
      m.material = mat;
    }
  });
}
