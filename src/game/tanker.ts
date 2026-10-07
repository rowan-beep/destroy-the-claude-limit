// Air-to-air refuelling: a Boeing KC-46A Pegasus flying a racetrack near the
// base, and the business of taking fuel from it.
//
// Jets with a boom receptacle (F-15EX, F-16, F-22, SR-71, F-35A) are served by
// the flying boom under the tail: hold position in the boom's reach, below and
// behind the tanker, and the boom operator plugs in; up to 55 kg of fuel a
// second. Probe-and-drogue jets (Super Hornet, Typhoon, Su-35S, Rafale,
// MiG-31, Su-57, Gripen) fly their probe into the basket trailing from the
// centreline hose: under 1.5 m from its middle, closing at walking pace, and
// the hose takes up the slack; about 25 kg a second. Fly out of the envelope
// (or too fast into the basket) and you disconnect.
//
// The tanker's frame: +X right wing, +Y up, nose toward -Z (like the jets').

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Aircraft } from '../aircraft/aircraft';
import type { AircraftType } from '../aircraft/specs';
import { FT, KT, NM } from '../core/constants';

const G = 9.81;
/** jets that take fuel from the boom (the rest carry a probe; the X-15 neither) */
const BOOM_JETS: AircraftType[] = ['F15EX', 'F16C', 'F22', 'SR71', 'F35A'];
const NO_AAR: AircraftType[] = ['X15'];

export type AarKind = 'boom' | 'probe' | 'none';
export function aarKind(t: AircraftType): AarKind {
  return NO_AAR.includes(t) ? 'none' : BOOM_JETS.includes(t) ? 'boom' : 'probe';
}

/** the receptacle (boom jets) or the probe's tip (probe jets) in the jet's own frame */
export function receiverPoint(p: Aircraft, kind: AarKind): THREE.Vector3 {
  const s = p.spec;
  if (kind === 'boom') {
    // on the spine a third of the way back (the F-15's is in the left wing root)
    const x = s.type === 'F15EX' ? -1.3 : 0;
    return new THREE.Vector3(x, s.height * 0.32, -s.length / 2 + s.length * 0.3);
  }
  // the probe: by the right side of the windscreen, its tip ahead of the nose's base
  return new THREE.Vector3(0.62, s.height * 0.26, -s.length / 2 + 1.2);
}

// ---------------------------------------------------------------- the KC-46 model
function mesh(geos: THREE.BufferGeometry[], mat: THREE.Material): THREE.Mesh {
  const list = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  const m = new THREE.Mesh(mergeGeometries(list, false)!, mat);
  m.castShadow = true;
  return m;
}

/** a wing-like surface in the X-Z plane: root chord at x0, swept, tapering to the tip */
function surface(span: number, root: number, tip: number, sweep: number, thick: number, side: number, x0 = 0): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const sw = Math.tan(sweep);
  sh.moveTo(x0, 0);
  sh.lineTo(x0 + span, span * sw);
  sh.lineTo(x0 + span, span * sw + tip);
  sh.lineTo(x0, root);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.4, bevelSegments: 2 });
  // shape X -> span, shape Y -> chord (aft, +Z); extrude -> thickness (Y)
  g.rotateX(Math.PI / 2);
  g.translate(0, thick / 2, 0);
  if (side < 0) g.scale(-1, 1, 1);
  return g;
}

interface TankerModel {
  group: THREE.Group;
  /** the boom: pivots at its hinge; `tube` slides out of it */
  boom: THREE.Group;
  tube: THREE.Mesh;
  /** the centreline hose and its basket */
  hose: THREE.Mesh;
  basket: THREE.Group;
  lights: THREE.Mesh[];
}

const BOOM_HINGE = new THREE.Vector3(0, -2.3, 20.5);
const BOOM_LEN = 16.8;
const HOSE_ROOT = new THREE.Vector3(0, -2.7, 16.5);
/** where the basket trails, untouched */
const BASKET_REST = new THREE.Vector3(0, -9.5, 43);

function buildKC46(): TankerModel {
  const grey = new THREE.MeshStandardMaterial({ color: '#aeb4b9', roughness: 0.6, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2d3135', roughness: 0.6, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: '#0d1218', roughness: 0.1, metalness: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ color: '#b6babd', roughness: 0.3, metalness: 0.9 });
  const g = new THREE.Group();
  // the fuselage: 47.5 m of 5 m tube with the 767's rounded nose and upswept tail cone
  const prof: [number, number][] = [];
  const L = 48.5;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const z = -L / 2 + t * L;
    let r = 2.5;
    if (t < 0.12) r = 2.5 * Math.sqrt(1 - Math.pow((0.12 - t) / 0.12, 2) * 0.96);
    if (t > 0.72) r = 2.5 * (1 - Math.pow((t - 0.72) / 0.28, 1.4) * 0.84);
    prof.push([Math.max(0.08, r), z]);
  }
  const body = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), 40);
  body.rotateX(Math.PI / 2);
  // (the tail cone lifts as it narrows)
  const pos = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z > L * 0.22) pos.setY(i, pos.getY(i) + Math.pow((z - L * 0.22) / (L * 0.28), 2) * 1.6);
  }
  body.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [body];
  // wings: 48 m span, 31.5 degree sweep, a low wing with dihedral
  for (const s of [-1, 1]) {
    const w = surface(21.5, 8.2, 2.2, (31.5 * Math.PI) / 180, 0.55, s, 2.3);
    w.rotateZ(s * 0.1);
    w.translate(0, -1.4, -4.5);
    parts.push(w);
    // tailplane
    const hs = surface(7.6, 4.6, 1.6, (37 * Math.PI) / 180, 0.3, s, 0.6);
    hs.rotateZ(s * 0.12);
    hs.translate(0, 0.9, 17.5);
    parts.push(hs);
  }
  // the fin
  const fin = surface(9.2, 7.4, 2.4, (42 * Math.PI) / 180, 0.35, 1, 0);
  fin.rotateZ(Math.PI / 2);
  fin.translate(0.17, 1.6, 15.2);
  parts.push(fin);
  // wing-body fairing and the belly
  parts.push(new THREE.BoxGeometry(5.4, 1.4, 11).translate(0, -2.2, -1.5));
  g.add(mesh(parts, grey));
  // the engines: two PW4062s in long nacelles under the wings, on pylons
  const eng: THREE.BufferGeometry[] = [];
  const intake: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const x = s * 8.4;
    const n = new THREE.CylinderGeometry(1.45, 1.25, 6.2, 32, 1, true);
    n.rotateX(Math.PI / 2);
    n.translate(x, -3.0, -6.6);
    eng.push(n);
    const lip = new THREE.TorusGeometry(1.42, 0.12, 8, 32);
    lip.translate(x, -3.0, -9.7);
    eng.push(lip);
    const fan = new THREE.CircleGeometry(1.35, 32);
    fan.rotateY(Math.PI);
    fan.translate(x, -3.0, -9.3);
    intake.push(fan);
    eng.push(new THREE.CylinderGeometry(0.75, 0.5, 2.0, 24).rotateX(Math.PI / 2).translate(x, -3.0, -2.6));
    eng.push(new THREE.BoxGeometry(0.5, 1.4, 5.2).translate(x, -1.9, -5.4));
    // the wing refuelling pods out near the tips
    eng.push(new THREE.CylinderGeometry(0.45, 0.35, 3.6, 16).rotateX(Math.PI / 2).translate(s * 16.5, -2.0, 4.2));
  }
  g.add(mesh(eng, grey), mesh(intake, dark));
  // the cockpit windows
  const win: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.PlaneGeometry(0.62, 0.5);
    const a = (i - 2.5) * 0.28;
    p.rotateX(-0.6);
    p.rotateY(a);
    p.translate(Math.sin(a) * 1.9, 1.15, -L / 2 + 3.1 + Math.abs(i - 2.5) * 0.2);
    win.push(p);
  }
  g.add(mesh(win, glass));
  // the boom: a 17 m tube hinged under the tail, its V-shaped ruddevators near the end, the nozzle sliding out
  const boom = new THREE.Group();
  boom.position.copy(BOOM_HINGE);
  const bp: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.34, 0.42, BOOM_LEN, 20).rotateX(Math.PI / 2).translate(0, 0, BOOM_LEN / 2)];
  for (const s of [-1, 1]) {
    const rv = surface(2.4, 1.6, 0.8, 0.5, 0.12, s, 0.3);
    rv.rotateZ(s * 0.65);
    rv.translate(0, 0, BOOM_LEN - 5.5);
    bp.push(rv);
  }
  boom.add(mesh(bp, grey));
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 7, 16).rotateX(Math.PI / 2).translate(0, 0, 3.5), metal);
  tube.position.z = BOOM_LEN - 3.5;
  boom.add(tube);
  g.add(boom);
  // the centreline drogue: its fairing, the hose and the basket
  g.add(mesh([new THREE.BoxGeometry(1.4, 0.9, 4.2).translate(HOSE_ROOT.x, HOSE_ROOT.y + 0.2, HOSE_ROOT.z - 1)], dark));
  const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 8, 1, true).translate(0, 0.5, 0), dark);
  g.add(hose);
  const basket = new THREE.Group();
  const cone = new THREE.CylinderGeometry(0.62, 0.18, 1.1, 24, 1, true).rotateX(-Math.PI / 2);
  basket.add(new THREE.Mesh(cone, new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.7, side: THREE.DoubleSide })));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 24), dark);
  ring.position.z = 0.55;
  basket.add(ring);
  g.add(basket);
  // the pilot director lights on the belly and the beacons
  const lights: THREE.Mesh[] = [];
  const lm = (c: string) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  for (const [x, y, z, c] of [[-24.2, -1.4 + 2.2, 12.4, '#ff2a2a'], [24.2, -1.4 + 2.2, 12.4, '#2aff5a'], [0, 2.6, 0, '#ff2a2a'], [0, -2.9, 3, '#ff2a2a']] as [number, number, number, string][]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lm(c));
    b.position.set(x, y, z);
    g.add(b);
    lights.push(b);
  }
  return { group: g, boom, tube, hose, basket, lights };
}

/** where the receiver's point goes for contact, in the tanker's frame */
export function contactTarget(kind: AarKind): THREE.Vector3 {
  return kind === 'boom' ? BOOM_HINGE.clone().add(new THREE.Vector3(0, -Math.sin(0.52), Math.cos(0.52)).multiplyScalar(BOOM_LEN + 3)) : BASKET_REST.clone();
}

// ---------------------------------------------------------------- the tanker in flight
export type AarState = 'off' | 'join' | 'precontact' | 'contact' | 'full';

export class Tanker {
  readonly model = buildKC46();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** the racetrack: its middle, the direction of the first leg, leg length and turn radius */
  private centre: THREE.Vector3;
  private u: THREE.Vector3;
  private w: THREE.Vector3;
  private legL = 40_000;
  private turnR: number;
  readonly speed: number;
  readonly alt: number;
  private s = 0;
  private bank = 0;
  private quat = new THREE.Quaternion();
  private inv = new THREE.Matrix4();
  // the receiver
  state: AarState = 'off';
  kind: AarKind = 'none';
  private steady = 0;
  private lastSay = '';
  /** fuel passed this sortie, kg */
  given = 0;
  /** what to tell the receiver pilot, every frame */
  cue = '';
  private t = 0;
  private basketPos = BASKET_REST.clone();

  constructor(centre: THREE.Vector3, headingDeg: number, altFt = 22_000, kts = 320) {
    this.alt = altFt * FT;
    this.speed = kts * KT;
    this.centre = centre.clone().setY(this.alt);
    const h = (headingDeg * Math.PI) / 180;
    this.u = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
    this.w = new THREE.Vector3(-this.u.z, 0, this.u.x);
    // turns at about 20 degrees of bank, as real tankers fly the track
    this.turnR = (this.speed * this.speed) / (G * Math.tan((20 * Math.PI) / 180));
    this.place(0);
  }

  get length(): number {
    return 2 * this.legL + 2 * Math.PI * this.turnR;
  }

  /** the track position at path distance s (and the bank there) */
  private at(s: number, out: THREE.Vector3): number {
    const L = this.legL, R = this.turnR;
    s = ((s % this.length) + this.length) % this.length;
    let a: number, b: number, bank = 0;
    if (s < L) {
      a = -L / 2 + s;
      b = -R;
    } else if (s < L + Math.PI * R) {
      const th = -Math.PI / 2 + (s - L) / R;
      a = L / 2 + Math.cos(th) * R;
      b = Math.sin(th) * R;
      bank = 1;
    } else if (s < 2 * L + Math.PI * R) {
      a = L / 2 - (s - L - Math.PI * R);
      b = R;
    } else {
      const th = Math.PI / 2 + (s - 2 * L - Math.PI * R) / R;
      a = -L / 2 + Math.cos(th) * R;
      b = Math.sin(th) * R;
      bank = 1;
    }
    out.copy(this.centre).addScaledVector(this.u, a).addScaledVector(this.w, b);
    return bank;
  }

  private place(dt: number): void {
    this.s += this.speed * dt;
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    const turning = this.at(this.s, p);
    this.at(this.s + 2, q);
    this.vel.copy(q).sub(p).multiplyScalar(this.speed / 2);
    this.pos.copy(p);
    // which way the turn goes, for the bank
    const d = q.clone().sub(p).normalize();
    // (the track turns right at both ends: a right bank is a negative roll about the tail-pointing Z)
    const bankTarget = turning ? -Math.atan((this.speed * this.speed) / (G * this.turnR)) : 0;
    this.bank += (bankTarget - this.bank) * Math.min(1, dt * 0.6);
    const yaw = Math.atan2(-d.x, -d.z);
    this.quat.setFromEuler(new THREE.Euler(0.035, yaw, this.bank, 'YXZ'));
    const g = this.model.group;
    g.position.copy(this.pos);
    g.quaternion.copy(this.quat);
    g.updateMatrixWorld(true);
    this.inv.copy(g.matrixWorld).invert();
  }

  /** a world point in the tanker's frame */
  private toLocal(v: THREE.Vector3): THREE.Vector3 {
    return v.clone().applyMatrix4(this.inv);
  }

  update(dt: number, p: Aircraft | null, say: (t: string, kind?: 'info' | 'good' | 'warn') => void): void {
    this.t += dt;
    this.place(dt);
    const m = this.model;
    // beacons blink
    m.lights[2].visible = m.lights[3].visible = Math.sin(this.t * 6.3) > 0.6;
    this.cue = '';
    if (!p || !p.alive) {
      this.state = 'off';
      this.stow(dt);
      return;
    }
    this.kind = aarKind(p.spec.type);
    // the boom comes down for boom jets, the hose trails for probe jets
    const boomOut = this.kind === 'boom';
    const hoseOut = this.kind === 'probe';
    const rp = receiverPoint(p, this.kind).applyQuaternion(p.fm.quat).add(p.fm.pos);
    const local = this.toLocal(rp);
    const rel = p.fm.vel.clone().sub(this.vel);
    const relLocal = rel.clone().applyQuaternion(this.quat.clone().invert());
    const dist = p.fm.pos.distanceTo(this.pos);
    const full = p.fm.fuelInternal >= p.spec.internalFuel - 1 && p.fm.fuelExternal >= p.fm.fuelExternalCap - 1;
    const tell = (text: string, kind: 'info' | 'good' | 'warn' = 'info') => {
      if (text === this.lastSay) return;
      this.lastSay = text;
      say(text, kind);
    };
    if (this.kind === 'none') {
      this.state = 'off';
      if (dist < 2000) this.cue = 'THE X-15 CANNOT REFUEL IN THE AIR';
      this.stow(dt);
      return;
    }
    // the place to fly to: the boom's nozzle or the basket
    const target = boomOut ? contactTarget('boom') : this.basketPos.clone();
    const d = target.clone().sub(local);
    const fmt = (v: number, pos: string, neg: string) => (Math.abs(v) < 0.6 ? '' : `${v > 0 ? pos : neg} ${Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))} M`);
    if (this.state === 'contact') {
      // hooked up: stay in the envelope, take fuel
      let inside: boolean;
      if (boomOut) {
        const v = local.clone().sub(BOOM_HINGE);
        const len = v.length();
        const elev = Math.asin(-v.y / len);
        const az = Math.atan2(v.x, v.z);
        inside = len > BOOM_LEN + 0.4 && len < BOOM_LEN + 6.4 && elev > 0.3 && elev < 0.75 && Math.abs(az) < 0.26;
        this.aimBoom(v, dt);
      } else {
        const off = local.clone().sub(BASKET_REST);
        inside = off.z > -8 && off.z < 2.5 && Math.abs(off.x) < 4 && Math.abs(off.y) < 3;
        this.basketPos.copy(local);
      }
      const fast = rel.length() > 5;
      if (!inside || fast) {
        this.state = 'precontact';
        this.steady = 0;
        tell(fast ? 'BREAKAWAY! Too fast: disconnected.' : 'DISCONNECT. You flew out of the envelope.', 'warn');
      } else {
        const rate = (boomOut ? 55 : 25) * dt;
        const before = p.fm.fuelTotal;
        const toInt = Math.min(Math.max(0, p.spec.internalFuel - p.fm.fuelInternal), rate);
        p.fm.fuelInternal += toInt;
        if (rate > toInt) p.fm.fuelExternal = Math.min(p.fm.fuelExternalCap, p.fm.fuelExternal + rate - toInt);
        this.given += p.fm.fuelTotal - before;
        this.cue = `CONTACT · TAKING FUEL · ${Math.round(p.fm.fuelTotal / 0.4536).toLocaleString('en-US')} LB · HOLD STEADY`;
        if (full) {
          this.state = 'full';
          tell(`Topped off: ${Math.round(this.given / 0.4536).toLocaleString('en-US')} lb passed. Disconnect, clear to the right. Thanks for the business!`, 'good');
        }
      }
    } else if (this.state === 'full') {
      this.stow(dt);
      this.cue = 'TOPPED OFF · CLEAR THE TANKER';
      if (!full || dist > 1500) this.state = dist > 1500 ? 'off' : 'join';
    } else {
      // joining up and the pre-contact position
      this.state = dist < 3000 ? 'precontact' : dist < 40 * NM ? 'join' : 'off';
      if (boomOut) this.boomTo(new THREE.Vector3(0, -Math.sin(0.52), Math.cos(0.52)), 3, dt);
      else this.basketPos.lerp(BASKET_REST.clone().add(new THREE.Vector3(Math.sin(this.t * 0.9) * 0.25, Math.sin(this.t * 1.3) * 0.18, 0)), Math.min(1, dt * 2));
      if (this.state === 'precontact') {
        const closing = -relLocal.z;
        if (full) this.cue = 'TANKS FULL · NO FUEL NEEDED';
        else if (d.length() < (boomOut ? 3.2 : 1.5) && Math.abs(closing) < (boomOut ? 2.5 : 4) && (boomOut || closing > 0.3)) {
          this.steady += dt;
          this.cue = boomOut ? 'STABILISED · STAND BY FOR THE BOOM…' : 'IN THE BASKET…';
          if (this.steady > (boomOut ? 1.2 : 0.15)) {
            this.state = 'contact';
            tell(boomOut ? 'Contact! The boom operator has plugged in: fuel is flowing.' : 'Contact! Probe in the basket: fuel is flowing.', 'good');
          }
        } else if (!boomOut && d.length() < 3 && closing < 0.3) {
          this.steady = 0;
          this.cue = 'DROGUE · LINED UP · PUSH IN AT 1 TO 2 M/S';
        } else {
          this.steady = 0;
          const parts = [fmt(d.z, 'BACK', 'FORWARD'), fmt(d.y, 'UP', 'DOWN'), fmt(d.x, 'RIGHT', 'LEFT')].filter(Boolean);
          const speedCue = d.length() < 60 && closing > 3 ? ' · THROTTLE BACK' : d.length() < 60 && closing < -2 ? ' · MORE POWER' : '';
          this.cue = `${boomOut ? 'BOOM' : 'DROGUE'} · ${parts.length ? parts.join(' · ') : 'HOLD'} · CLOSURE ${(-relLocal.z).toFixed(1)} M/S${speedCue}`;
        }
      }
    }
    // station-keeping assist: close to the contact point and nearly matched, the jet is eased into place
    // (and held there while hooked up); big stick or throttle inputs still fly it out
    if (this.state === 'precontact' || this.state === 'contact') {
      // (probe jets: held just behind the basket while lining up, then eased forward into it)
      const aligned = Math.hypot(d.x, d.y) < 1.2;
      const goal = this.state === 'contact' ? (boomOut ? contactTarget('boom') : BASKET_REST.clone().add(new THREE.Vector3(0, 0, -3))) : boomOut ? target : target.clone().add(new THREE.Vector3(0, 0, aligned ? -4 : 2.5));
      const dl = goal.sub(local);
      if (this.state === 'contact' || (dl.length() < 25 && rel.length() < 6 && !full)) {
        const acc = dl.applyQuaternion(this.quat).multiplyScalar(0.22).addScaledVector(rel, -0.85);
        const lim = this.state === 'contact' ? 2.5 : 1.4;
        if (acc.length() > lim) acc.setLength(lim);
        p.fm.vel.addScaledVector(acc, dt);
        if (this.state === 'precontact' && !this.cue.startsWith('STAB')) this.cue = `${this.cue} · ASSIST`;
      }
    }
    // draw the boom and the hose
    m.boom.visible = true;
    m.hose.visible = m.basket.visible = hoseOut || this.state === 'off';
    if (!boomOut) this.boomTo(new THREE.Vector3(0, -0.12, 1).normalize(), 0, dt);
    this.drawHose();
  }

  /** the boom stowed up under the tail, the basket trailing */
  private stow(dt: number): void {
    this.boomTo(new THREE.Vector3(0, -0.12, 1).normalize(), 0, dt);
    this.basketPos.lerp(BASKET_REST, Math.min(1, dt * 2));
    this.drawHose();
  }

  private boomDir = new THREE.Vector3(0, -0.12, 1).normalize();
  private boomExt = 0;
  private boomTo(dir: THREE.Vector3, ext: number, dt: number): void {
    this.boomDir.lerp(dir, Math.min(1, dt * 1.5)).normalize();
    this.boomExt += (ext - this.boomExt) * Math.min(1, dt * 2);
    this.setBoom();
  }
  private aimBoom(v: THREE.Vector3, dt: number): void {
    // in contact the nozzle rides on the receptacle
    this.boomDir.lerp(v.clone().normalize(), Math.min(1, dt * 8)).normalize();
    this.boomExt = Math.max(0, Math.min(6.5, v.length() - BOOM_LEN));
    this.setBoom();
  }
  private setBoom(): void {
    const b = this.model.boom;
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.boomDir);
    this.model.tube.position.z = BOOM_LEN - 3.5 + this.boomExt;
  }
  private drawHose(): void {
    const m = this.model;
    const a = HOSE_ROOT, b = this.basketPos;
    const v = b.clone().sub(a);
    m.hose.position.copy(a);
    m.hose.scale.set(1, v.length(), 1);
    m.hose.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    m.basket.position.copy(b);
    m.basket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().normalize());
  }
}
