// Camera modes: cockpit (with head look), chase (full 360-degree orbit
// around the jet), mouse-aim chase, fly-by, padlock/target, missile cam and
// a death cam.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Missile } from '../weapons/missile';
import { DEG } from '../core/constants';
import { clamp, damp, smoothstep } from '../core/math';

/** seconds without camera input before the chase view recenters */
const LOOK_IDLE = 1.8;
import { surfaceHeight } from '../world/terrain';

export type CameraMode = 'cockpit' | 'chase' | 'flyby' | 'target' | 'weapon' | 'death';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();

export class CameraRig {
  mode: CameraMode = 'chase';
  prevMode: CameraMode = 'chase';
  /** head / orbit look angles (radians) */
  lookYaw = 0;
  lookPitch = 0;
  private lookYawSm = 0;
  private lookPitchSm = 0;
  /**
   * Chase auto-recenter: set for the frame by the player's flight update.
   * After LOOK_IDLE s with no look input (and the look button released) the
   * orbit eases smoothly back to the normal view behind the jet.
   */
  autoCenter = false;
  /** the look button (right mouse / touch drag) is being held */
  lookHeld = false;
  private lookIdle = 0;
  chaseDist = 1;
  fovBase = 70;
  zoom = 1;
  private flybyPos = new THREE.Vector3();
  private flybyTimer = 0;
  private chasePos = new THREE.Vector3();
  private chaseInit = false;
  weaponMissile: Missile | null = null;
  private weaponLinger = 0;
  shake = 0;
  private shakeT = 0;
  followRoll = false;
  /** mouse-aim direction (world) when in mouse-aim mode */
  aimDir: THREE.Vector3 | null = null;
  target: Aircraft | null = null;
  /** what the death camera orbits instead of the wreck (the pilot's parachute) */
  deathFocus: THREE.Vector3 | null = null;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  setMode(m: CameraMode): void {
    if (m === this.mode) return;
    if (this.mode !== 'weapon' && this.mode !== 'death') this.prevMode = this.mode;
    this.mode = m;
    this.chaseInit = false;
    if (m === 'flyby') this.flybyTimer = 0;
    if (m === 'cockpit' || m === 'chase') {
      this.lookYaw = 0;
      this.lookPitch = 0;
    }
  }

  toggleCockpit(): void {
    this.setMode(this.mode === 'cockpit' ? 'chase' : 'cockpit');
  }

  resetLook(): void {
    this.lookYaw = 0;
    this.lookPitch = 0;
  }

  addLook(dx: number, dy: number): void {
    if (dx !== 0 || dy !== 0) this.lookIdle = 0;
    this.lookYaw -= dx;
    this.lookPitch = clamp(this.lookPitch - dy, -80 * DEG, 85 * DEG);
    if (this.mode === 'cockpit') this.lookYaw = clamp(this.lookYaw, -165 * DEG, 165 * DEG);
  }

  private recenter(dt: number): void {
    if (this.lookHeld) {
      this.lookIdle = 0;
      return;
    }
    this.lookIdle += dt;
    if (this.lookYaw === 0 && this.lookPitch === 0) return;
    // take the short way round after a full orbit (shift both so nothing jumps)
    const wrap = Math.round(this.lookYaw / (2 * Math.PI)) * 2 * Math.PI;
    if (wrap !== 0) {
      this.lookYaw -= wrap;
      this.lookYawSm -= wrap;
    }
    // ease in over half a second, then glide home and settle softly
    const k = smoothstep(LOOK_IDLE, LOOK_IDLE + 0.6, this.lookIdle);
    if (k <= 0) return;
    this.lookYaw = damp(this.lookYaw, 0, 2.6 * k, dt);
    this.lookPitch = damp(this.lookPitch, 0, 2.6 * k, dt);
    if (Math.abs(this.lookYaw) < 1e-4 && Math.abs(this.lookPitch) < 1e-4) {
      this.lookYaw = 0;
      this.lookPitch = 0;
    }
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.5, this.shake + amount);
  }

  update(dt: number, ac: Aircraft, eye: THREE.Vector3 | null): void {
    const cam = this.camera;
    const fm = ac.fm;
    this.shakeT += dt;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.autoCenter && this.mode === 'chase') this.recenter(dt);
    this.autoCenter = false;
    this.lookYawSm = damp(this.lookYawSm, this.lookYaw, 14, dt);
    this.lookPitchSm = damp(this.lookPitchSm, this.lookPitch, 14, dt);
    let fov = this.fovBase / this.zoom;

    if (this.mode === 'weapon') {
      const m = this.weaponMissile;
      if (m && (m.alive || this.weaponLinger > 0)) {
        if (!m.alive) this.weaponLinger -= dt;
        else this.weaponLinger = 2.0;
        const vel = m.vel.lengthSq() > 1 ? _v.copy(m.vel).normalize() : _v.set(0, 0, -1);
        const back = _v2.copy(vel).multiplyScalar(-9).add(new THREE.Vector3(0, 2.2, 0));
        cam.position.copy(m.pos).add(back);
        if (m.target && m.target.alive) cam.lookAt(m.target.fm.pos);
        else cam.lookAt(_v2.copy(m.pos).addScaledVector(vel, 100));
        cam.fov = fov;
        cam.updateProjectionMatrix();
        return;
      }
      this.mode = this.prevMode;
    }

    if (this.mode === 'cockpit' && eye) {
      // head position with G sag and buffet
      cam.position.copy(eye);
      const g = fm.nz;
      _v.set(0, -clamp((g - 1) * 0.012, -0.05, 0.1), 0).applyQuaternion(fm.quat);
      cam.position.add(_v);
      _e.set(this.lookPitchSm, this.lookYawSm, 0, 'YXZ');
      _q.setFromEuler(_e);
      cam.quaternion.copy(fm.quat).multiply(_q);
      if (this.aimDir && this.lookYaw === 0 && this.lookPitch === 0) {
        // mouse-aim in cockpit: the head follows the aim point a little
      }
      this.applyShake(cam, ac);
      cam.fov = fov;
      cam.updateProjectionMatrix();
      return;
    }

    if (this.mode === 'flyby') {
      this.flybyTimer -= dt;
      if (this.flybyTimer <= 0 || this.flybyPos.distanceTo(fm.pos) > 1600) {
        const speed = Math.max(80, fm.vel.length());
        _v.copy(fm.vel).normalize();
        this.flybyPos.copy(fm.pos).addScaledVector(_v, speed * 3).add(new THREE.Vector3(fm.right.x * 25, 8, fm.right.z * 25));
        const gh = surfaceHeight(this.flybyPos.x, this.flybyPos.z);
        if (this.flybyPos.y < gh + 3) this.flybyPos.y = gh + 3;
        this.flybyTimer = 7;
      }
      cam.position.copy(this.flybyPos);
      cam.up.set(0, 1, 0);
      cam.lookAt(fm.pos);
      cam.fov = clamp(fov * 0.8, 20, 90);
      cam.updateProjectionMatrix();
      return;
    }

    if (this.mode === 'target' && this.target && this.target.alive) {
      const tp = this.target.fm.pos;
      _v.subVectors(fm.pos, tp).normalize(); // from target toward us
      const dist = 26 * this.chaseDist + ac.spec.length;
      cam.position.copy(fm.pos).addScaledVector(_v, dist).add(new THREE.Vector3(0, 5, 0));
      cam.up.set(0, 1, 0);
      cam.lookAt(_v2.lerpVectors(fm.pos, tp, 0.5).lerp(tp, 0.3));
      cam.fov = fov;
      cam.updateProjectionMatrix();
      this.keepAboveGround(cam);
      return;
    }

    if (this.mode === 'death') {
      this.lookYaw += dt * 0.15;
      const d = (this.deathFocus ? 22 : 60) * this.chaseDist;
      const p = this.deathFocus ?? fm.pos;
      cam.position.set(p.x + Math.sin(this.lookYaw) * d, p.y + 18, p.z + Math.cos(this.lookYaw) * d);
      this.keepAboveGround(cam);
      cam.up.set(0, 1, 0);
      cam.lookAt(p);
      cam.fov = fov;
      cam.updateProjectionMatrix();
      return;
    }

    // --- chase (orbit) ---
    const dist = (ac.spec.length * 1.25 + 8) * this.chaseDist;
    let desired: THREE.Vector3;
    if (this.aimDir) {
      // mouse-aim: sit behind the aim direction, free-look adds orbit
      _e.set(this.lookPitchSm, this.lookYawSm, 0, 'YXZ');
      _q.setFromEuler(_e);
      const dir = this.aimDir.clone().applyQuaternion(_q).normalize();
      desired = _v2.copy(fm.pos).addScaledVector(dir, -dist).add(new THREE.Vector3(0, dist * 0.18, 0));
      cam.position.copy(desired);
      cam.up.set(0, 1, 0);
      const lookTarget = fm.pos.clone().addScaledVector(dir, dist * 6);
      _m.lookAt(cam.position, lookTarget, cam.up);
      cam.quaternion.setFromRotationMatrix(_m);
    } else {
      // orbit around the aircraft, relative to its heading, horizon-stabilised
      const hdg = Math.atan2(fm.fwd.x, -fm.fwd.z);
      const pitchBase = this.followRoll ? Math.asin(clamp(fm.fwd.y, -1, 1)) : 0;
      const yaw = hdg + Math.PI + this.lookYawSm;
      const pitch = clamp(10 * DEG + this.lookPitchSm - pitchBase * 0.85, -85 * DEG, 85 * DEG);
      const offset = _v.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
      desired = _v2.copy(fm.pos).add(offset);
      if (!this.chaseInit) {
        this.chasePos.copy(desired);
        this.chaseInit = true;
      }
      // a touch of lag sells the speed; stiff enough at Mach 2
      const rel = _v.subVectors(desired, fm.pos);
      this.chasePos.lerp(desired, 1 - Math.exp(-dt * 10));
      const cur = _v2.subVectors(this.chasePos, fm.pos);
      cur.setLength(rel.length());
      cam.position.copy(fm.pos).add(cur);
      if (this.followRoll) cam.up.copy(fm.up);
      else cam.up.set(0, 1, 0);
      cam.lookAt(_v.copy(fm.pos).add(new THREE.Vector3(0, ac.spec.height * 0.25, 0)));
    }
    this.keepAboveGround(cam);
    this.applyShake(cam, ac);
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }

  private keepAboveGround(cam: THREE.PerspectiveCamera): void {
    const gh = surfaceHeight(cam.position.x, cam.position.z);
    if (cam.position.y < gh + 1.5) cam.position.y = gh + 1.5;
  }

  private applyShake(cam: THREE.PerspectiveCamera, ac: Aircraft): void {
    const fm = ac.fm;
    const buffet = clamp((Math.abs(fm.alpha) / DEG - 18) / 15, 0, 1) * 0.5 + (fm.onGround ? clamp(fm.gs / 80, 0, 1) * 0.15 : 0);
    const gunShake = ac.gunFiring ? 0.25 : 0;
    const ab = fm.afterburner * 0.06;
    const s = this.shake + buffet + gunShake + ab;
    if (s <= 0.001) return;
    const t = this.shakeT;
    const a = s * 0.004;
    _e.set(Math.sin(t * 53) * a + Math.sin(t * 91) * a * 0.5, Math.sin(t * 47) * a, Math.sin(t * 71) * a * 0.3, 'YXZ');
    _q.setFromEuler(_e);
    cam.quaternion.multiply(_q);
  }

  followMissile(m: Missile): void {
    this.weaponMissile = m;
    this.weaponLinger = 2;
    this.setMode('weapon');
  }
}
