// Taking a core, the way the rover really does it, start to finish:
//  1. the final approach: the rover turns and creeps up until the rock is in the
//     arm's reach (sped up: the real thing takes the best part of a sol);
//  2. the arm unstows, joint by joint, and swings the turret out over the rock;
//  3. it lowers the coring drill straight down onto the rock's own surface (found
//     where the rock really is, not at a fixed pose) until the stabilizers bite;
//  4. the bit spins and hammers its way 6 cm in, the arm following it down,
//     cuttings spilling round the hole;
//  5. it pulls the bit back out, carrying the core in its sample tube, and leaves
//     a hole in the rock;
//  6. it swings round to the bit carousel at the front of the rover and pushes
//     the bit in; the carousel turns and takes the tube inside to be sealed
//     (Curiosity's drill grinds the rock to powder instead: CHIMRA on its turret
//     shakes it through sieves and drops it into the laboratories inside);
//  7. the arm folds back across the front.
// Every pose is solved for the point the drill must reach (inverse kinematics).

import * as THREE from 'three';
import { RoverRig, armIK, setArm, ARM_STOW } from './roverModel';
import type { RoverDrive } from './roverDrive';
import { audio } from '../../audio/audio';

type Phase = 'turn1' | 'drive' | 'turn2' | 'unstow' | 'lower' | 'drill' | 'retract' | 'dock' | 'sieve' | 'stow' | 'done';

/** what the mission needs from it each frame */
export interface DrillFrame {
  /** where cuttings fly (site coordinates), and how many */
  dust: THREE.Vector3 | null;
  dustN: number;
  /** the camera: wide on the rover, close on the bit, or on the carousel */
  view: 'approach' | 'wide' | 'close' | 'dock';
  /** the point the camera watches (site coordinates) */
  focus: THREE.Vector3;
  /** how deep the bit is (m) */
  depth: number;
  phase: Phase;
  /** a line for the log, when a phase begins */
  say: string | null;
}

const ease = (k: number) => {
  const x = Math.max(0, Math.min(1, k));
  return x * x * (3 - 2 * x);
};
/** each joint moves in its own part of the move: the arm unfolds joint by joint */
const stage = (k: number, a: number, b: number) => ease((k - a) / (b - a));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** depth of the core, m (Perseverance's cores are about 6 cm long) */
export const CORE_DEPTH = 0.06;
/** how far short of the rock's centre the rover parks to drill */
const STANDOFF = 2.35;
/** how high above the rock the bit hovers before it goes down */
const HOVER = 0.3;
/** the bit's place in the drill: run out (as built), and drawn in level with the stabilizer prongs */
const BIT_OUT = -0.4;
const BIT_IN = -0.36;
/** cuttings grains */
const CUT_N = 320;

export class DrillOp {
  phase: Phase = 'turn1';
  private t = 0;
  private said = new Set<Phase>();
  /** the drilling point on the rock (site coordinates) and the rock's up there */
  readonly spot = new THREE.Vector3();
  depth = 0;
  // the approach
  private from = { e: 0, n: 0, h: 0 };
  private to = { e: 0, n: 0, h: 0 };
  private driveHeading = 0;
  // arm poses
  private poseA: number[] = ARM_STOW.slice();
  private poseB: number[] = ARM_STOW.slice();
  private joints: number[] = ARM_STOW.slice();
  private knockT = 0;
  private carousel0 = 0;
  private hole: THREE.Group | null = null;
  /** the cuttings: fine grains thrown up round the bit, settling in a little pile round the hole (on the rock) */
  private cut: THREE.Points | null = null;
  private cutVel = new Float32Array(CUT_N * 3);
  private cutState = new Uint8Array(CUT_N);
  private cutNext = 0;
  private cutFloor = 0;
  private servo2 = false;

  constructor(
    private rig: RoverRig,
    private drive: RoverDrive,
    private site: THREE.Object3D,
    /** the outcrop at the target (its meshes are what the drill lands on) */
    private rock: THREE.Object3D,
    /** the site's ground height at east/north */
    private ground: (e: number, n: number) => number,
    /** the target's centre (east, north) */
    centreE: number,
    centreN: number,
  ) {
    const d = drive;
    // the drilling point: on the near side of the main slab, toward the rover
    const ue = centreE - d.e, un = centreN - d.n;
    const ul = Math.hypot(ue, un) || 1;
    const fe = ue / ul, fn = un / ul;
    // (the top of the rock: the highest of a few points on its near half)
    let best = -1e9;
    for (const [back, side] of [[0, 0], [0.08, 0], [0.16, 0], [0.08, 0.07], [0.08, -0.07], [0.24, 0]]) {
      const pe = centreE - fe * back + fn * side, pn = centreN - fn * back - fe * side;
      const y = this.surfaceAt(pe, pn);
      if (y > best + 0.005) {
        best = y;
        this.spot.set(pe, y, -pn);
      }
    }
    // where the rover stops: square on to the rock, its middle 2.35 m short of the outcrop
    // (the front wheels a metre and a half from it, the rock well inside the arm's reach)
    const h = Math.atan2(fe, fn);
    this.to = { e: centreE - fe * STANDOFF, n: centreN - fn * STANDOFF, h };
    this.from = { e: d.e, n: d.n, h: d.heading };
    const de = this.to.e - d.e, dn = this.to.n - d.n;
    const dist = Math.hypot(de, dn);
    // (already there and facing it: straight to the arm)
    this.driveHeading = dist > 0.08 ? Math.atan2(de, dn) : h;
    // (backing up to it rather than turning round, if it is behind)
    if (dist > 0.08 && Math.abs(wrap(this.driveHeading - d.heading)) > Math.PI / 2) this.driveHeading = wrap(this.driveHeading + Math.PI);
    this.phase = dist > 0.08 || Math.abs(wrap(h - d.heading)) > 0.03 ? 'turn1' : 'unstow';
    this.carousel0 = rig.carousel.rotation.y;
  }

  /** the rock's top at a point (where a ray straight down first meets the outcrop), or the ground */
  private surfaceAt(e: number, n: number): number {
    const g = this.ground(e, n);
    this.site.updateMatrixWorld(true);
    const from = this.site.localToWorld(new THREE.Vector3(e, g + 3, -n));
    const to = this.site.localToWorld(new THREE.Vector3(e, g - 1, -n));
    const ray = new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, 5);
    const hit = ray.intersectObject(this.rock, true).find((x) => (x.object as THREE.Mesh).isMesh && x.object.name !== 'beam' && x.object.name !== 'ring');
    if (!hit) return g;
    return this.site.worldToLocal(hit.point.clone()).y;
  }

  /** a site point in the rover body's frame */
  private toBody(p: THREE.Vector3): THREE.Vector3 {
    this.rig.group.updateMatrixWorld(true);
    return this.rig.body.worldToLocal(this.site.localToWorld(p.clone()));
  }

  /** the body's up, in site coordinates */
  private bodyUp(): THREE.Vector3 {
    const q = new THREE.Quaternion();
    this.rig.body.getWorldQuaternion(q);
    const sq = new THREE.Quaternion();
    this.site.getWorldQuaternion(sq);
    return new THREE.Vector3(0, 1, 0).applyQuaternion(q).applyQuaternion(sq.invert());
  }

  /** the arm with its bit at a site point */
  private reach(p: THREE.Vector3, mode: 'down' | 'back' = 'down'): number[] {
    return armIK(this.rig, this.toBody(p), mode);
  }

  /** the carousel's dock: where the bit goes in (body frame), and a point 10 cm out from it */
  private dockPoints(): { inB: THREE.Vector3; outB: THREE.Vector3 } {
    const c = this.rig.carousel;
    const S = this.rig.arm[0].position;
    const dir = new THREE.Vector3(c.position.x - S.x, 0, c.position.z - S.z).normalize();
    const rim = c.position.clone().addScaledVector(dir, 0.17);
    return { inB: rim.clone().addScaledVector(dir, -0.035), outB: rim.clone().addScaledVector(dir, 0.1) };
  }

  private enter(p: Phase): void {
    this.phase = p;
    this.t = 0;
  }

  update(dt: number): DrillFrame {
    const r = this.rig;
    const d = this.drive;
    this.t += dt;
    const out: DrillFrame = { dust: null, dustN: 0, view: 'wide', focus: this.spot.clone(), depth: this.depth, phase: this.phase, say: null };
    const first = !this.said.has(this.phase);
    if (first) this.said.add(this.phase);
    const T = this.t;
    this.stepCuttings(dt);
    switch (this.phase) {
      // ---- the final approach (sped up)
      case 'turn1':
      case 'turn2': {
        const h0 = this.phase === 'turn1' ? this.from.h : this.driveHeading;
        const h1 = this.phase === 'turn1' ? this.driveHeading : this.to.h;
        const dh = wrap(h1 - h0);
        const dur = Math.max(0.6, Math.abs(dh) / 0.45);
        if (first && this.phase === 'turn1') out.say = 'Final approach: the rover turns on the spot and lines up on the rock (sped up).';
        const k = ease(T / dur);
        // the corner wheels swing to a diamond, and it turns on the spot
        d.spot = Math.min(1, T / 0.4) * (T < dur ? 1 : Math.max(0, 1 - (T - dur) / 0.4));
        d.steer = Math.sign(dh);
        const prev = d.heading;
        d.heading = wrap(h0 + dh * k);
        d.roll += (Math.abs(wrap(d.heading - prev)) * 1.3) / 0.2625;
        d.pose();
        out.view = 'approach';
        if (T > dur + 0.4) {
          d.spot = 0;
          d.steer = 0;
          if (this.phase === 'turn1') this.enter(Math.hypot(this.to.e - this.from.e, this.to.n - this.from.n) > 0.08 ? 'drive' : 'turn2');
          else this.enter('unstow');
        }
        break;
      }
      case 'drive': {
        const de = this.to.e - this.from.e, dn = this.to.n - this.from.n;
        const dist = Math.hypot(de, dn);
        const dur = Math.max(1, dist / 0.55);
        const k = ease(T / dur);
        const pe = d.e, pn = d.n;
        d.e = this.from.e + de * k;
        d.n = this.from.n + dn * k;
        const step = Math.hypot(d.e - pe, d.n - pn);
        // (forward or backing up)
        const fwd = Math.sin(d.heading) * (d.e - pe) + Math.cos(d.heading) * (d.n - pn) >= 0 ? 1 : -1;
        d.roll += (fwd * step) / 0.2625;
        d.speed = 0;
        d.pose();
        out.view = 'approach';
        if (T > dur) this.enter('turn2');
        break;
      }
      // ---- the arm comes out, joint by joint, to hover over the rock
      case 'unstow': {
        if (first) {
          out.say = 'The arm unstows: shoulder, elbow, wrist, and the turret swings out over the rock.';
          this.poseA = this.joints.slice();
          this.poseB = this.reach(this.spot.clone().add(this.bodyUp().multiplyScalar(HOVER)));
          // (the azimuth the short way round)
          this.poseB[0] = this.poseA[0] + wrap(this.poseB[0] - this.poseA[0]);
          audio.servo(1.4, 1);
        }
        const dur = 4.2;
        const k = T / dur;
        const A = this.poseA, B = this.poseB;
        const w = [stage(k, 0.3, 0.95), stage(k, 0, 0.55), stage(k, 0.1, 0.75), stage(k, 0.35, 1), stage(k, 0, 1)];
        this.joints = A.map((a, i) => a + (B[i] - a) * w[i]);
        // (the shoulder lifts the arm clear of the deck on the way out)
        this.joints[1] += 0.28 * Math.sin(Math.PI * Math.min(1, k * 1.1));
        if (k > 0.45 && !this.servo2) {
          this.servo2 = true;
          audio.servo(1.2, 1.15);
        }
        setArm(r, this.joints);
        out.view = 'wide';
        if (k >= 1) this.enter('lower');
        break;
      }
      // ---- straight down onto the rock, until the stabilizer prongs touch it
      case 'lower': {
        if (first) {
          out.say = 'The drill comes down onto the rock; its two stabilizer prongs press against it and hold the turret steady.';
          audio.servo(1.6, 0.8);
        }
        const dur = 2.2;
        const k = ease(T / dur);
        const up = this.bodyUp();
        // (the bit draws back into the drill as it comes down, level with the prongs)
        r.drill.position.y = BIT_OUT + (BIT_IN - BIT_OUT) * ease(T / 0.6);
        const p = this.spot.clone().addScaledVector(up, HOVER * (1 - k) - (BIT_IN - BIT_OUT) * k);
        this.joints = this.reach(p);
        setArm(r, this.joints);
        r.drill.rotation.y += dt * 3;
        out.view = 'close';
        if (T > dur + 0.3) this.enter('drill');
        break;
      }
      // ---- coring: the arm holds still, pressed on; the bit spins and hammers its way 6 cm in
      case 'drill': {
        if (first) {
          out.say = r.curiosity ? 'Drilling: the bit hammers its way 6 cm into the rock, grinding it to powder that rises up the bit\'s flutes.' : 'Coring: the bit turns and hammers its way into the rock, 6 cm down.';
          this.makeHole();
        }
        const dur = 9;
        const k = Math.min(1, T / dur);
        this.depth = CORE_DEPTH * ease(k);
        const up = this.bodyUp();
        // the feed: the bit runs down out of the drill body; the percussion, a few millimetres of hammering
        const hammer = k < 1 ? Math.sin(T * 2 * Math.PI * 18) * 0.0025 : 0;
        r.drill.position.y = BIT_IN - this.depth + hammer;
        r.drill.rotation.y += dt * 42 * (k < 1 ? 1 : 0.2);
        // (the whole arm trembles with it)
        const j = this.joints.slice();
        if (k < 1) j[3] += Math.sin(T * 2 * Math.PI * 18 + 1) * 0.0015;
        setArm(r, j);
        this.knockT -= dt;
        if (this.knockT <= 0 && k < 1) {
          this.knockT = 0.11;
          audio.drillKnock(this.depth);
        }
        // cuttings spilling out of the hole
        if (k < 1) for (let n = 0; n < 2; n++) if (Math.random() < dt * 30) this.spawnCutting();
        if (this.hole) this.hole.scale.setScalar(0.3 + 0.7 * ease(k * 3));
        out.view = 'close';
        if (T > dur + 0.5) this.enter('retract');
        break;
      }
      // ---- the bit comes back out with the core in its tube, and the arm lifts away
      case 'retract': {
        if (first) {
          out.say = r.curiosity ? 'The bit draws back out of the hole, full of rock powder.' : 'The bit draws back out of the hole with the core inside its sample tube.';
          audio.servo(1.8, 0.85);
        }
        const tPull = 1.4, tLift = 2.2;
        const up = this.bodyUp();
        if (T < tPull) {
          const k = ease(T / tPull);
          this.depth = CORE_DEPTH * (1 - k);
          r.drill.position.y = BIT_IN - this.depth;
          r.drill.rotation.y += dt * 6 * (1 - k);
        } else {
          const k = ease((T - tPull) / tLift);
          this.depth = 0;
          r.drill.position.y = BIT_IN + (BIT_OUT - BIT_IN) * k;
          const p = this.spot.clone().addScaledVector(up, -(BIT_IN - BIT_OUT) * (1 - k) + (HOVER + 0.05) * k);
          this.joints = this.reach(p);
          setArm(r, this.joints);
        }
        out.view = 'close';
        if (T > tPull + tLift) this.enter(r.curiosity ? 'sieve' : 'dock');
        break;
      }
      // ---- Curiosity: CHIMRA shakes the powder through its sieves and drops it into the instruments
      case 'sieve': {
        if (first) {
          out.say = 'CHIMRA, on the turret, shakes the powder through its sieves and drops a pinch into CheMin and SAM, the laboratories inside the rover.';
          this.poseA = this.joints.slice();
        }
        const dur = 3.2;
        const shake = T < dur - 0.4 ? Math.sin(T * 2 * Math.PI * 14) * 0.035 : 0;
        const j = this.poseA.slice();
        j[4] += shake;
        j[3] += shake * 0.3;
        setArm(r, j);
        this.knockT -= dt;
        if (shake && this.knockT <= 0) {
          this.knockT = 0.16;
          audio.drillKnock(0.12);
        }
        out.view = 'close';
        if (T > dur) this.enter('stow');
        break;
      }
      // ---- the bit carousel takes the tube
      case 'dock': {
        const { inB, outB } = this.dockPoints();
        if (first) {
          out.say = 'The arm swings round to the bit carousel at the front of the rover and hands it the bit; the carousel turns and carries the tube inside to be sealed.';
          this.poseA = this.joints.slice();
          this.poseB = armIK(r, outB, 'back');
          this.poseB[0] = this.poseA[0] + wrap(this.poseB[0] - this.poseA[0]);
          audio.servo(2, 1.05);
        }
        const tSwing = 3.2, tIn = 0.9, tTurn = 1.6, tOut = 0.9;
        if (T < tSwing) {
          const k = T / tSwing;
          const A = this.poseA, B = this.poseB;
          const w = [stage(k, 0.05, 0.85), stage(k, 0, 0.7), stage(k, 0.1, 0.9), stage(k, 0.2, 1), stage(k, 0, 1)];
          this.joints = A.map((a, i) => a + (B[i] - a) * w[i]);
          this.joints[1] += 0.18 * Math.sin(Math.PI * k);
        } else if (T < tSwing + tIn) {
          const k = ease((T - tSwing) / tIn);
          this.joints = armIK(r, outB.clone().lerp(inB, k), 'back');
        } else if (T < tSwing + tIn + tTurn) {
          const k = ease((T - tSwing - tIn) / tTurn);
          r.carousel.rotation.y = this.carousel0 + k * ((Math.PI * 2) / 9);
          if (T - dt < tSwing + tIn) audio.servo(1.4, 1.4);
        } else {
          const k = ease((T - tSwing - tIn - tTurn) / tOut);
          this.joints = armIK(r, inB.clone().lerp(outB, k), 'back');
        }
        setArm(r, this.joints);
        // (the camera on the hand-off)
        r.body.updateMatrixWorld(true);
        out.focus = this.site.worldToLocal(r.body.localToWorld(inB.clone()));
        out.view = 'dock';
        if (T > tSwing + tIn + tTurn + tOut) this.enter('stow');
        break;
      }
      // ---- folded away again
      case 'stow': {
        if (first) {
          out.say = 'The arm folds back across the front of the rover.';
          this.poseA = this.joints.slice();
          this.poseB = ARM_STOW.slice();
          this.poseB[0] = this.poseA[0] + wrap(this.poseB[0] - this.poseA[0]);
          audio.servo(1.6, 0.9);
        }
        const dur = 3.6;
        const k = T / dur;
        const A = this.poseA, B = this.poseB;
        const w = [stage(k, 0.05, 0.7), stage(k, 0.4, 1), stage(k, 0.2, 0.9), stage(k, 0, 0.6), stage(k, 0, 1)];
        this.joints = A.map((a, i) => a + (B[i] - a) * w[i]);
        this.joints[1] += 0.2 * Math.sin(Math.PI * k);
        setArm(r, this.joints);
        out.view = 'wide';
        if (k >= 1) {
          setArm(r, ARM_STOW);
          this.enter('done');
        }
        break;
      }
      case 'done':
        break;
    }
    out.phase = this.phase;
    out.depth = this.depth;
    return out;
  }

  /** one grain thrown up from the hole */
  private spawnCutting(): void {
    if (!this.cut) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(CUT_N * 3).fill(0);
      for (let i = 0; i < CUT_N; i++) pos[i * 3 + 1] = -1e4;
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color: new THREE.Color(0.55, 0.38, 0.27), size: 0.009, sizeAttenuation: true, depthWrite: true });
      this.cut = new THREE.Points(g, m);
      this.cut.frustumCulled = false;
      this.cut.name = 'cuttings';
      this.rock.add(this.cut);
      const local = this.spot.clone();
      this.rock.worldToLocal(this.site.localToWorld(local));
      this.cutFloor = local.y;
    }
    const i = this.cutNext;
    this.cutNext = (this.cutNext + 1) % CUT_N;
    const pos = this.cut.geometry.attributes.position as THREE.BufferAttribute;
    const at = this.spot.clone();
    this.rock.worldToLocal(this.site.localToWorld(at));
    const a = Math.random() * Math.PI * 2, sp = 0.04 + Math.random() * 0.12;
    pos.setXYZ(i, at.x + Math.cos(a) * 0.016, at.y + 0.005, at.z + Math.sin(a) * 0.016);
    this.cutVel.set([Math.cos(a) * sp, 0.1 + Math.random() * 0.25, Math.sin(a) * sp], i * 3);
    this.cutState[i] = 1;
  }

  private stepCuttings(dt: number): void {
    if (!this.cut || dt <= 0) return;
    const pos = this.cut.geometry.attributes.position as THREE.BufferAttribute;
    let moved = false;
    for (let i = 0; i < CUT_N; i++) {
      if (this.cutState[i] !== 1) continue;
      const v = this.cutVel;
      v[i * 3 + 1] -= 3.71 * dt;
      let y = pos.getY(i) + v[i * 3 + 1] * dt;
      // (they land on the rock round the hole and stay: the pile grows)
      const floor = this.cutFloor + 0.002 + (i % 7) * 0.0008;
      if (y <= floor && v[i * 3 + 1] < 0) {
        y = floor;
        this.cutState[i] = 2;
      }
      pos.setXYZ(i, pos.getX(i) + v[i * 3] * dt, y, pos.getZ(i) + v[i * 3 + 2] * dt);
      moved = true;
    }
    if (moved) pos.needsUpdate = true;
  }

  /** the hole the bit leaves, with the cuttings round it, lying on the rock */
  private makeHole(): void {
    const up = this.bodyUp();
    const g = new THREE.Group();
    // (Perseverance's coring bit leaves a hole 2.7 cm across; Curiosity's powder drill, 1.6 cm)
    const hr = this.rig.curiosity ? 0.008 : 0.0135;
    const dark = new THREE.Mesh(new THREE.CircleGeometry(hr, 20), new THREE.MeshBasicMaterial({ color: 0x120a06 }));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(hr, hr + 0.021, 28),
      new THREE.MeshStandardMaterial({ color: 0x9c7656, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    (dark.material as THREE.MeshBasicMaterial).polygonOffset = true;
    (dark.material as THREE.MeshBasicMaterial).polygonOffsetFactor = -4;
    g.add(ring, dark);
    // (lying flat on the rock: its normal along the rover's up)
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    const local = this.spot.clone().addScaledVector(up, 0.004);
    this.rock.worldToLocal(this.site.localToWorld(local));
    g.position.copy(local);
    g.scale.setScalar(0.3);
    g.name = 'core-hole';
    this.rock.add(g);
    this.hole = g;
  }
}
