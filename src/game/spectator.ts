// Spectator: after the player is shot down in a team battle, watch any jet
// on either team (orbit it with the mouse, zoom with the wheel) or fly a free
// camera anywhere in the theater.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import type { Input } from '../core/input';
import { clamp } from '../core/math';
import { surfaceHeight } from '../world/terrain';

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class Spectator {
  active = false;
  target: Aircraft | null = null;
  free = false;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  /** seconds the watched jet has been dead (auto-switch after a while) */
  private deadFor = 0;

  start(roster: Aircraft[], preferTeam: string): void {
    this.active = true;
    this.free = false;
    this.deadFor = 0;
    this.target = roster.find((a) => a.alive && a.team === preferTeam && !a.isPlayer) ?? roster.find((a) => a.alive) ?? null;
  }

  stop(): void {
    this.active = false;
    this.free = false;
    this.target = null;
  }

  watch(a: Aircraft): void {
    this.target = a;
    this.free = false;
    this.deadFor = 0;
  }

  /** Step to the next / previous living jet in the roster. */
  cycle(roster: Aircraft[], dir: 1 | -1): void {
    const live = roster.filter((a) => a.alive);
    if (live.length === 0) return;
    const i = this.target ? live.indexOf(this.target) : -1;
    this.watch(live[(i + dir + live.length) % live.length]);
  }

  /** Switch to the free camera, starting where the view camera is now. */
  enterFree(cam: THREE.Camera): void {
    this.free = true;
    this.pos.copy(cam.position);
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.yaw = Math.atan2(-_f.x, -_f.z);
    this.pitch = Math.asin(clamp(_f.y, -1, 1));
  }

  /** Keep following something alive: a dead jet is watched a few seconds, then the next one. */
  maintain(dt: number, roster: Aircraft[]): void {
    if (this.free || !this.target) return;
    if (this.target.alive) {
      this.deadFor = 0;
      return;
    }
    this.deadFor += dt;
    if (this.deadFor > 4) {
      const team = this.target.team;
      const next = roster.find((a) => a.alive && a.team === team) ?? roster.find((a) => a.alive);
      if (next) this.watch(next);
    }
  }

  /** Free camera: WASD to move, Q/E down/up, Shift faster, mouse (drag or locked) to look. */
  updateFree(dt: number, inp: Input, cam: THREE.PerspectiveCamera, lookDX: number, lookDY: number): void {
    this.yaw -= lookDX * 0.0025;
    this.pitch = clamp(this.pitch - lookDY * 0.0025, -1.5, 1.5);
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.quaternion.setFromEuler(_e);
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const fast = inp.codeHeld('ShiftLeft') || inp.codeHeld('ShiftRight');
    const speed = (fast ? 900 : 160) * dt;
    const k = (c: string) => (inp.codeHeld(c) ? 1 : 0);
    this.pos.addScaledVector(_f, (k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown')) * speed);
    this.pos.addScaledVector(_r, (k('KeyD') - k('KeyA')) * speed);
    this.pos.y += (k('KeyE') + k('Space') - k('KeyQ') - k('KeyC')) * speed;
    const floor = Math.max(0, surfaceHeight(this.pos.x, this.pos.z)) + 3;
    if (this.pos.y < floor) this.pos.y = floor;
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
  }
}
