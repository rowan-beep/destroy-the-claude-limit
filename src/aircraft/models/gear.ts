// Landing gear: tricycle legs built like the real thing and moved like it.
//
// Each leg: a trunnion it swings on, the shock strut's painted outer cylinder
// with its gland nut, the polished chrome oleo sliding in it, the torque links
// (scissors) that keep the oleo from turning, the axle and wheels -- treaded
// tyres, spoked hubs, brake stacks -- a folding drag brace and a retraction
// jack running to the airframe, brake lines down the leg, a door on the leg,
// and on the nose leg the steering collar and the landing and taxi lights.
//
// Moving parts, every frame (see updateGear):
// - retraction in sequence: the bay doors open, the legs swing (eased like
//   hydraulics, not at a constant rate), the doors close behind them; down,
//   the other way round
// - the drag brace folds at its knee and the jack telescopes as the leg swings
// - on the ground the oleos compress under the jet's weight and stroke over
//   bumps; off the ground they extend (the wheels drop a few centimetres)
// - the torque links open and close with the oleo
// - the wheels roll with the ground speed, keep spinning after lift-off and
//   are braked to a stop as the gear comes up
// - the nose wheel steers with the rudder pedals at taxi speeds

import * as THREE from 'three';
import type { AirframeVisual, GearLeg } from './visual';
import { join, strip, roundBox, rod, tube, lathe, P2 } from './kit';
import { partMaterials } from './parts';

export interface GearSpec {
  nose: {
    top: THREE.Vector3; axle: THREE.Vector3; r: number; w: number; twin: boolean; retract: 'forward' | 'aft'; launchBar?: boolean; /** false: no bay doors */ doors?: boolean;
    /** a wide panel down the front of the strut (w across, h down the leg) carrying the landing light with the taxi light under it (F-15) */
    panel?: { w: number; h: number };
    /** 'half': one curved arm down the side of a single wheel from a collar at the oleo's foot (F-15) */
    fork?: 'half';
  };
  mains: {
    top: THREE.Vector3; axle: THREE.Vector3; r: number; w: number; retract: 'forward' | 'aft' | 'inward'; outboard: number; trailing?: boolean;
    /** a heavier leg: the yoke at the top, a side brace to the airframe inboard, the axle knuckle down beside the wheel (F-15) */
    heavy?: boolean;
  };
  doorColor: string;
  /** the legs' paint (default: bare light metal) */
  strutColor?: string;
  /** the doors' inner faces (white on most jets, the F-15's nose doors carry the jet's number) */
  inner?: { noseDoor?: THREE.Material; mainDoor?: THREE.Material; legDoor?: THREE.Material };
}

/** The moving parts of one leg (all in the leg pivot's frame unless said). */
export interface LegRig {
  /** the oleo's sliding part: slides along `dir` (top to axle, unit) */
  lower: THREE.Object3D;
  dir: THREE.Vector3;
  /** how far the oleo extends off the ground (m) */
  extend: number;
  /** current extension (eased) */
  ext: number;
  /** steering group round the leg's line (nose) */
  steer: THREE.Object3D | null;
  wheels: THREE.Object3D[];
  wheelR: number;
  /** torque links: from `a` (on the cylinder) to `b` (on the oleo, in `lower`'s frame), knee toward `pole` */
  links: { upper: THREE.Object3D; lower: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; l1: number; l2: number; pole: THREE.Vector3 } | null;
  /** how far the leg tucks up into its bay over the end of its travel (m), and the hinge it starts from */
  stow: number;
  hinge: THREE.Vector3;
  /** braces to the airframe: `p` fixed in the body, `q` on the leg (pivot frame) */
  braces: { kind: 'fold' | 'jack'; m1: THREE.Object3D; m2: THREE.Object3D; p: THREE.Vector3; q: THREE.Vector3; l1: number; l2: number; pole: THREE.Vector3 }[];
}

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------

interface GearMats {
  strut: THREE.Material;
  chrome: THREE.Material;
  tire: THREE.Material;
  hub: THREE.Material;
  dark: THREE.Material;
  hose: THREE.Material;
  well: THREE.Material;
  lens: THREE.Material;
}
let GM: GearMats | null = null;
function gearMats(): GearMats {
  if (GM) return GM;
  const pm = partMaterials();
  GM = {
    strut: pm.strut,
    chrome: new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.1, metalness: 1.0 }),
    tire: pm.tire,
    hub: pm.hub,
    dark: new THREE.MeshStandardMaterial({ color: 0x2d3033, roughness: 0.55, metalness: 0.6 }),
    hose: new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.7, metalness: 0.1 }),
    // the wheel well seen past the open doors: dark, primer-green-grey structure in shadow
    well: new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    lens: pm.lens,
  };
  return GM;
}

// ---------------------------------------------------------------------------
// parts
// ---------------------------------------------------------------------------

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/**
 * A wheel at the origin, axle along x: the tyre with its tread grooves and
 * rounded shoulders, the hub with its spokes and bolt circle, the brake stack
 * inside it (dark), on `side` (+1/-1: the side the brake faces the leg).
 */
function gearWheel(r: number, w: number, side: number): { tire: THREE.BufferGeometry; hub: THREE.BufferGeometry; brake: THREE.BufferGeometry } {
  const hw = w / 2;
  const rim = r * 0.6;
  // tyre section (radius, x): bead on the rim, the bulging sidewall, the shoulder and the crown with
  // three circumferential grooves
  const prof: P2[] = [[rim, -hw * 0.82], [rim + (r - rim) * 0.35, -hw * 1.0], [r - hw * 0.28, -hw * 0.98], [r - hw * 0.06, -hw * 0.8]];
  const grooves = [-0.42, 0, 0.42];
  for (let k = 0; k <= 16; k++) {
    const x = -hw * 0.72 + (k / 16) * hw * 1.44;
    const g = grooves.some((gx) => Math.abs(x / hw - gx) < 0.05) ? 0.012 : 0;
    prof.push([r - g, x]);
  }
  prof.push([r - hw * 0.06, hw * 0.8], [r - hw * 0.28, hw * 0.98], [rim + (r - rim) * 0.35, hw * 1.0], [rim, hw * 0.82]);
  const tire = lathe(prof, 48);
  tire.rotateY(Math.PI / 2);
  // hub: a dished wheel, its outer face recessed, a centre boss
  const hubProf: P2[] = [
    [0.001, -hw * 0.9],
    [r * 0.12, -hw * 0.9],
    [r * 0.15, -hw * 0.7],
    [rim * 0.97, -hw * 0.6],
    [rim * 1.0, -hw * 0.82],
    [rim * 1.0, hw * 0.82],
    [rim * 0.97, hw * 0.6],
    [r * 0.15, hw * 0.7],
    [r * 0.12, hw * 0.9],
    [0.001, hw * 0.9],
  ];
  const hubParts: THREE.BufferGeometry[] = [strip(lathe(hubProf, 32))];
  hubParts[0].rotateY(Math.PI / 2);
  // spokes on the outer face, the bolt circle between the two halves
  const out = -side;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const s = new THREE.BoxGeometry(0.012, rim * 0.78, rim * 0.16);
    s.translate(0, rim * 0.52, 0);
    s.rotateX(a);
    s.translate(out * hw * 0.62, 0, 0);
    hubParts.push(strip(s));
  }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const b = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6);
    b.rotateZ(Math.PI / 2);
    b.translate(out * hw * 0.66, Math.cos(a) * r * 0.24, Math.sin(a) * r * 0.24);
    hubParts.push(strip(b));
  }
  // the brake: a stack of discs in a housing on the leg side, its caliper torque arm
  const brake = rod(V(side * hw * 0.85, 0, 0), V(side * hw * 0.1, 0, 0), rim * 0.82, rim * 0.82, 20);
  const fins: THREE.BufferGeometry[] = [brake];
  for (let k = 0; k < 4; k++) fins.push(rod(V(side * hw * (0.25 + k * 0.15), 0, 0), V(side * hw * (0.3 + k * 0.15), 0, 0), rim * 0.88, rim * 0.88, 20));
  fins.push(strip(roundBox(0.05, rim * 0.5, 0.06, 0.01).translate(side * hw * 0.9, rim * 0.55, 0)));
  return { tire, hub: join(hubParts), brake: join(fins) };
}

/** A unit-length cylinder from the origin up +y (placed between two points each frame). */
function unitRod(r: number, segs = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, 1, segs);
  g.translate(0, 0.5, 0);
  return strip(g);
}

/** A flat link plate along +y, unit length, with round bosses at both ends. */
function unitLink(w: number, t: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(t, 1, w);
  g.translate(0, 0.5, 0);
  return strip(g);
}

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
/** Knee of a two-bar linkage from a to b (lengths l1, l2), bending toward `pole`. */
function knee(a: THREE.Vector3, b: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const dir = _d.subVectors(b, a);
  let d = dir.length();
  dir.divideScalar(Math.max(d, 1e-6));
  d = Math.min(d, l1 + l2 - 1e-5);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pl = _p.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (pl.lengthSq() < 1e-8) pl.set(0, 1, 0).addScaledVector(dir, -dir.y);
  pl.normalize();
  return out.copy(a).addScaledVector(dir, x).addScaledVector(pl, h);
}
/** Lay a unit +y object from a to b. */
function span(o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  _d.subVectors(b, a);
  const len = _d.length();
  o.position.copy(a);
  o.quaternion.copy(_q.setFromUnitVectors(UP, _d.divideScalar(Math.max(len, 1e-6))));
  o.scale.set(1, Math.max(len, 1e-4), 1);
}

// ---------------------------------------------------------------------------
// building
// ---------------------------------------------------------------------------

interface LegOptions {
  top: THREE.Vector3;
  axle: THREE.Vector3;
  r: number;
  w: number;
  /** wheel centres' x offsets from the axle point */
  wheelX: number[];
  /** strut bottom's x offset from the axle point (a main leg's axle stub runs out to the wheel) */
  strutX: number;
  rO: number;
  axis: THREE.Vector3;
  deg: number;
  /** where the brace and jack go to on the airframe (unit, body frame) */
  braceDir: THREE.Vector3;
  nose: boolean;
  /** +1 / -1: the side of the jet (mains), 0 the nose */
  side: number;
  lights: boolean;
  launchBar: boolean;
  door: { color: THREE.Material; inner?: THREE.Material } | null;
  trailing: boolean;
  /** the legs' paint */
  paint: THREE.Material;
  panel: { w: number; h: number } | null;
  halfFork: boolean;
  heavy: boolean;
}

function buildLeg(v: AirframeVisual, o: LegOptions): void {
  const M = gearMats();
  const top = o.top;
  const pivot = new THREE.Group();
  pivot.position.copy(top);
  v.body.add(pivot);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D) => {
    const x = new THREE.Mesh(g, m);
    x.castShadow = true;
    x.receiveShadow = true;
    parent.add(x);
    return x;
  };
  const P = o.paint;
  const A = o.axle.clone().sub(top);
  // the strut's bottom: just above the axle line (inboard of the wheel on a main leg); with a half
  // fork, the collar just above the tyre
  const S = A.clone().add(V(o.strutX, o.r * (o.halfFork ? 1.25 : 0.22), 0));
  const L = S.length();
  const dir = S.clone().normalize();
  const fwd = V(0, 0, -1).addScaledVector(dir, dir.z).normalize();
  const C = dir.clone().multiplyScalar(L * 0.56);
  const rO = o.rO;

  // --- fixed on the leg: trunnion, outer cylinder, gland nut, bands, brake line, lights, door
  const fixed: THREE.BufferGeometry[] = [];
  const ax = o.axis.clone().normalize();
  fixed.push(rod(ax.clone().multiplyScalar(-0.2), ax.clone().multiplyScalar(0.2), rO * 0.75, rO * 0.75, 12));
  fixed.push(rod(dir.clone().multiplyScalar(-0.04), C, rO, rO, 16));
  fixed.push(rod(C.clone().addScaledVector(dir, -0.05), C.clone().addScaledVector(dir, 0.02), rO * 1.22, rO * 1.22, 16));
  for (const t of [0.18, 0.34]) fixed.push(rod(dir.clone().multiplyScalar(L * t), dir.clone().multiplyScalar(L * t + 0.025), rO * 1.08, rO * 1.08, 16));
  // the brace and jack lugs on the cylinder
  const qBrace = dir.clone().multiplyScalar(L * 0.42).addScaledVector(o.braceDir, rO * 0.9);
  const qJack = dir.clone().multiplyScalar(L * 0.2).addScaledVector(o.braceDir, rO * 0.9).add(V(o.side ? -o.side * 0.1 : 0.1, 0, 0));
  for (const q of [qBrace, qJack]) fixed.push(strip(roundBox(0.06, 0.08, 0.06, 0.012).translate(q.x, q.y, q.z)));
  if (o.nose) {
    // the steering collar: a deeper ring with the steering actuators each side (behind the leg when a
    // panel covers its front)
    fixed.push(rod(C.clone().addScaledVector(dir, -0.16), C.clone().addScaledVector(dir, -0.06), rO * 1.35, rO * 1.35, 16));
    const az = o.panel ? 0.18 : -0.18;
    for (const sx of [-1, 1]) fixed.push(rod(C.clone().addScaledVector(dir, -0.11).add(V(sx * rO * 1.3, 0, 0)), C.clone().addScaledVector(dir, -0.11).add(V(sx * rO * 1.3, 0, az)), rO * 0.3, rO * 0.3, 8));
  }
  if (o.heavy) {
    // the yoke the leg hangs from: wider than the cylinder, its side-brace lug inboard
    const y = dir.clone().multiplyScalar(L * 0.12);
    fixed.push(strip(roundBox(rO * 2.7, L * 0.24, rO * 2.3, rO * 0.35).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir)).translate(y.x, y.y, y.z)));
    const q = dir.clone().multiplyScalar(L * 0.5).add(V(-o.side * rO * 1.05, 0, 0));
    fixed.push(strip(roundBox(0.07, 0.09, 0.07, 0.014).translate(q.x, q.y, q.z)));
  }
  mesh(join(fixed), P, pivot);
  // brake (or, on the nose, the light wiring) line down the back of the cylinder
  {
    const back = V(0, 0, 1).addScaledVector(dir, -dir.z).normalize().multiplyScalar(rO * 1.08);
    const pts = [dir.clone().multiplyScalar(0.02), dir.clone().multiplyScalar(L * 0.2), dir.clone().multiplyScalar(L * 0.4), C.clone().addScaledVector(dir, -0.02)].map((p) => p.add(back));
    pts[0].addScaledVector(back, 0.6);
    mesh(strip(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.009, 6, false)), M.hose, pivot);
  }
  if (o.panel) {
    // the panel down the front of the strut (F-15): built facing forward with the leg's line down -y,
    // then stood along the leg; two slots in its upper half, the round landing light below them and
    // the taxi light at its foot, tipped down
    const { w, h } = o.panel;
    const qLeg = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dir);
    const c = dir.clone().multiplyScalar(0.03 + h / 2).addScaledVector(fwd, rO + 0.05);
    const put = (g: THREE.BufferGeometry) => g.applyQuaternion(qLeg).translate(c.x, c.y, c.z);
    const t = 0.024;
    mesh(put(strip(roundBox(w, h, t, 0.008))), P, pivot);
    const dark: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) dark.push(strip(roundBox(0.04, h * 0.32, 0.01, 0.004).translate(sx * w * 0.2, h * 0.14, -t / 2)));
    const lamps: THREE.BufferGeometry[] = [];
    const ring: THREE.BufferGeometry[] = [];
    const lamp = (y: number, r: number, tilt: number) => {
      const a = V(0, y, -t / 2);
      const n = V(0, -Math.sin(tilt), -Math.cos(tilt));
      // the can, its bezel and the glass
      dark.push(rod(a.clone().addScaledVector(n, -0.005), a.clone().addScaledVector(n, 0.05), r * 1.08, r * 1.08, 20));
      ring.push(rod(a.clone().addScaledVector(n, 0.045), a.clone().addScaledVector(n, 0.062), r * 1.2, r * 1.2, 20, false));
      const b = a.clone().addScaledVector(n, 0.062);
      ring.push(strip(new THREE.TorusGeometry(r * 1.1, 0.011, 6, 24).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n)).translate(b.x, b.y, b.z)));
      // the glass: a shallow dome
      const glass = new THREE.SphereGeometry(r * 2.2, 20, 4, 0, Math.PI * 2, 0, Math.asin(1 / 2.2));
      glass.translate(0, -Math.sqrt(4.84 - 1) * r, 0);
      glass.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, n));
      const g = a.clone().addScaledVector(n, 0.05);
      lamps.push(strip(glass.translate(g.x, g.y, g.z)));
    };
    lamp(-h * 0.18, Math.min(0.075, w * 0.2), 0);
    lamp(-h * 0.5 - 0.005, Math.min(0.055, w * 0.15), 0.5);
    mesh(put(join(dark)), M.dark, pivot);
    mesh(put(join(ring)), P, pivot);
    mesh(put(join(lamps)), M.lens, pivot);
  } else if (o.lights) {
    // the landing and taxi lights, side by side on a bracket on the front of the strut
    const at = C.clone().addScaledVector(dir, -0.24).addScaledVector(fwd, rO * 1.4);
    const housing: THREE.BufferGeometry[] = [strip(roundBox(0.2, 0.09, 0.08, 0.02).translate(at.x, at.y, at.z + 0.01))];
    mesh(join(housing), M.dark, pivot);
    for (const sx of [-1, 1]) {
      const lamp = lathe([[0.001, -0.005], [0.036, 0], [0.04, 0.035]], 14);
      lamp.rotateX(Math.PI / 2);
      lamp.translate(at.x + sx * 0.05, at.y, at.z - 0.03);
      mesh(lamp, M.lens, pivot);
    }
  }
  if (o.door) {
    // the door on the leg: a curved panel on the outboard (or, for the nose, front) side
    const n = o.nose ? fwd.clone() : V(o.side, 0, 0);
    const len = L * 0.82, wid = o.nose ? 0.26 : Math.max(0.4, o.r * 1.15);
    const d = strip(roundBox(0.016, len, wid, 0.01));
    // its inside, facing the strut
    const inSide = o.nose ? -1 : -o.side;
    const f = o.door.inner ? new THREE.PlaneGeometry(wid * 0.92, len * 0.94).rotateY((inSide * Math.PI) / 2).translate(inSide * 0.0085, 0, 0) : null;
    const place = (g: THREE.BufferGeometry) => {
      if (o.nose) g.rotateY(Math.PI / 2);
      // stand it along the leg
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dir));
      const c = dir.clone().multiplyScalar(len * 0.5).addScaledVector(n, rO + (o.nose ? 0.05 : 0.07));
      g.translate(c.x, c.y, c.z);
      return g;
    };
    mesh(place(d), o.door.color, pivot);
    if (f && o.door.inner) mesh(place(f), o.door.inner, pivot);
  }

  // --- the oleo and below: slides along the leg
  const lower = new THREE.Group();
  pivot.add(lower);
  const steer = o.nose ? new THREE.Group() : null;
  if (steer) lower.add(steer);
  const low = steer ?? lower;
  mesh(rod(C.clone().addScaledVector(dir, -0.12), S.clone().addScaledVector(dir, -0.02), rO * 0.7, rO * 0.7, 16), M.chrome, low);
  // the axle fitting at the bottom of the oleo, the fork or axle stubs out to the wheels
  const fit: THREE.BufferGeometry[] = [];
  if (!o.halfFork) fit.push(strip(roundBox(rO * 2.2, rO * 1.6, rO * 2.0, rO * 0.4).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir)).translate(S.x, S.y, S.z)));
  const wheelC = o.wheelX.map((x) => A.clone().add(V(x, 0, 0)));
  if (o.halfFork) {
    // a half fork (F-15): a collar at the oleo's foot, one arm out and down round the tyre's shoulder
    // on the jet's left (-x), the axle held from its end only
    const ex = -(o.w / 2 + 0.045);
    const sg = Math.sign(ex);
    fit.push(rod(S.clone().addScaledVector(dir, -0.05), S.clone().addScaledVector(dir, 0.035), rO * 1.3, rO * 1.3, 16));
    fit.push(tube([S.clone().add(V(sg * rO * 0.8, -0.01, 0)), S.clone().add(V(ex * 0.9, -0.035, 0)), A.clone().add(V(ex + sg * 0.03, o.r * 0.7, 0)), A.clone().add(V(ex + sg * 0.02, o.r * 0.3, 0)), A.clone().add(V(ex, 0, 0))], 0.03, 8, 20));
    fit.push(rod(A.clone().add(V(ex + sg * 0.035, 0, 0)), A.clone().add(V(ex - sg * 0.03, 0, 0)), 0.048, 0.048, 14));
    fit.push(rod(A.clone().add(V(ex, 0, 0)), A.clone().add(V(-sg * (o.w / 2 - 0.03), 0, 0)), 0.026, 0.026, 10));
  } else if (o.nose && o.wheelX.length === 1) {
    // a single nose wheel in a fork: two arms either side of it from the fitting
    for (const sx of [-1, 1]) {
      const arm = V(sx * (o.w / 2 + 0.035), 0, 0);
      fit.push(rod(S.clone().add(V(sx * rO, 0, 0)), A.clone().add(arm).add(V(0, o.r * 0.55, 0)), 0.03, 0.03, 8));
      fit.push(rod(A.clone().add(arm).add(V(0, o.r * 0.55, 0)), A.clone().add(arm), 0.03, 0.028, 8));
    }
    fit.push(rod(A.clone().add(V(-o.w / 2 - 0.05, 0, 0)), A.clone().add(V(o.w / 2 + 0.05, 0, 0)), 0.025, 0.025, 8));
  } else if (o.trailing) {
    // a trailing-arm main (F/A-18): the arm runs back from the oleo to the axle
    fit.push(rod(S, A.clone().add(V(o.strutX * 0.5, 0, 0)), rO * 0.75, rO * 0.6, 12));
    fit.push(rod(A.clone().add(V(o.strutX, 0, 0)), A.clone().add(V(o.wheelX[0] * 0.6, 0, 0)), rO * 0.55, rO * 0.55, 10));
  } else {
    // the axle through the fitting out to the wheel(s)
    const xs = [...o.wheelX, o.strutX];
    fit.push(rod(A.clone().add(V(Math.min(...xs) - 0.02, 0, 0)), A.clone().add(V(Math.max(...xs) + 0.02, 0, 0)), 0.045, 0.045, 10));
    fit.push(rod(S, A.clone().add(V(o.strutX, 0, 0)), rO * 0.6, rO * 0.6, 10));
    if (o.heavy) {
      // the axle knuckle: the leg's foot carried on down beside the wheel past the axle
      const k = A.clone().add(V(o.strutX, 0, 0));
      fit.push(strip(roundBox(rO * 1.25, S.y - k.y + o.r * 0.3, rO * 1.6, rO * 0.4).translate(k.x, (S.y + k.y - o.r * 0.3) / 2, k.z)));
    }
  }
  if (o.launchBar) fit.push(rod(A.clone().add(V(0, o.r * 1.3, -0.12)), A.clone().add(V(0, o.r * 1.45, -0.8)), 0.03, 0.025, 6));
  mesh(join(fit), P, low);
  const wheels: THREE.Object3D[] = [];
  wheelC.forEach((c, i) => {
    // the brake faces the leg: inboard for a main wheel outside its leg, inward for twin nose wheels
    const side = o.wheelX.length === 2 ? (i === 0 ? 1 : -1) : o.side ? -o.side : o.halfFork ? -1 : 1;
    const wg = gearWheel(o.r, o.w, side);
    const g = new THREE.Group();
    g.position.copy(c);
    low.add(g);
    mesh(wg.tire, M.tire, g);
    mesh(wg.hub, M.hub, g);
    // (the brake stack doesn't turn: it sits on the axle, not in the spinning group)
    const b = mesh(wg.brake, M.dark, low);
    b.position.copy(c);
    wheels.push(g);
  });

  // --- torque links on the front of the strut (the back, behind a panel), from the gland nut to the
  // axle fitting
  const lf = o.panel ? fwd.clone().negate() : fwd;
  const la = C.clone().addScaledVector(dir, -0.03).addScaledVector(lf, rO * 1.15);
  const lb = S.clone().addScaledVector(dir, -rO * 0.6).addScaledVector(lf, rO * 1.15);
  const half = la.distanceTo(lb) / 2;
  const lu = mesh(unitLink(rO * 0.9, 0.025), P, pivot);
  const ll = mesh(unitLink(rO * 0.9, 0.025), P, pivot);
  const links = { upper: lu, lower: ll, a: la, b: lb, l1: half * 1.12, l2: half * 1.12, pole: lf.clone() };

  // --- the drag brace and the retraction jack: from the airframe to the leg
  const braces: LegRig['braces'] = [];
  const pB = top.clone().addScaledVector(o.braceDir, Math.max(0.5, L * 0.42)).add(V(0, 0.03, 0));
  const pJ = top.clone().addScaledVector(o.braceDir, Math.max(0.3, L * 0.26)).add(V(o.side ? -o.side * 0.1 : 0.1, 0.06, 0));
  {
    const qb = qBrace.clone().add(top);
    const d0 = pB.distanceTo(qb);
    const m1 = mesh(unitRod(rO * 0.42, 10), P, v.body);
    const m2 = mesh(unitRod(rO * 0.42, 10), P, v.body);
    // (dead straight with the gear down: the brace locks over centre; it folds up into the bay)
    braces.push({ kind: 'fold', m1, m2, p: pB, q: qBrace, l1: d0 * 0.5, l2: d0 * 0.5 + 0.002, pole: V(0, 1, 0).addScaledVector(o.braceDir, -0.3).normalize() });
  }
  if (o.heavy) {
    // the side brace: from the airframe inboard of the trunnion, on the hinge line (so it swings with
    // the leg without folding much), to the lug half way down the leg
    const q = dir.clone().multiplyScalar(L * 0.5).add(V(-o.side * rO * 1.05, 0, 0));
    const p = top.clone().add(V(-o.side * Math.max(0.4, L * 0.38), 0.02, 0));
    const d0 = p.distanceTo(q.clone().add(top));
    const m1 = mesh(unitRod(rO * 0.4, 10), P, v.body);
    const m2 = mesh(unitRod(rO * 0.4, 10), P, v.body);
    braces.push({ kind: 'fold', m1, m2, p, q, l1: d0 * 0.5, l2: d0 * 0.5 + 0.002, pole: V(0, 1, 0) });
  }
  {
    const qj = qJack.clone().add(top);
    const d0 = pJ.distanceTo(qj);
    const m1 = mesh(unitRod(rO * 0.48, 10), M.dark, v.body);
    const m2 = mesh(unitRod(rO * 0.28, 10), M.chrome, v.body);
    braces.push({ kind: 'jack', m1, m2, p: pJ, q: qJack, l1: d0 * 0.62, l2: d0 * 0.62, pole: V(0, 1, 0) });
  }

  // stowed: the wheels go up inside the fuselage (the trunnion sits up in the bay, above the skin
  // line the hinge is given at): how far the leg must tuck up for the wheels' lowest point to clear it
  let lowest = Infinity;
  const qs = new THREE.Quaternion().setFromAxisAngle(ax, (o.deg * Math.PI) / 180);
  for (const c of wheelC) lowest = Math.min(lowest, c.clone().applyQuaternion(qs).y - o.r);
  const rig: LegRig = {
    stow: Math.max(0, -lowest + 0.03),
    hinge: top.clone(),
    lower,
    dir,
    extend: Math.min(0.12, L * 0.09),
    ext: 0,
    steer,
    wheels,
    wheelR: o.r,
    links,
    braces,
  };
  const leg: GearLeg = { pivot, axis: ax, retractDeg: o.deg, hideWhenUp: braces.flatMap((b) => [b.m1, b.m2]), rig };
  v.gear.push(leg);
}

/** A bay door (sequenced: open before the leg moves, shut after it) and the dark well behind it. */
function buildDoor(v: AirframeVisual, mat: THREE.Material, hinge: THREE.Vector3, axis: THREE.Vector3, deg: number, size: [number, number], centre: THREE.Vector3, along: 'x' | 'z', inner?: { mat: THREE.Material; facing: number }): void {
  const M = gearMats();
  const pivot = new THREE.Group();
  pivot.position.copy(hinge);
  v.body.add(pivot);
  // built open: hanging straight down from its hinge
  const [len, wid] = size;
  const d = strip(along === 'z' ? roundBox(0.016, wid, len, 0.008) : roundBox(len, wid, 0.016, 0.008));
  const toCentre = centre.clone().sub(hinge);
  d.translate(along === 'z' ? 0 : toCentre.x, -wid / 2, along === 'z' ? toCentre.z : 0);
  const m = new THREE.Mesh(d, mat);
  m.castShadow = true;
  pivot.add(m);
  if (inner) {
    // its inside: a panel just off the plate on the side that faces the bay when shut
    const f = new THREE.PlaneGeometry(len * 0.96, wid * 0.92);
    if (along === 'z') f.rotateY((inner.facing * Math.PI) / 2).translate(inner.facing * 0.0085, -wid / 2, toCentre.z);
    else f.rotateY(inner.facing > 0 ? 0 : Math.PI).translate(toCentre.x, -wid / 2, inner.facing * 0.0085);
    pivot.add(new THREE.Mesh(f, inner.mat));
  }
  // the well: the open bay seen past the door
  const well = new THREE.Mesh(new THREE.PlaneGeometry(along === 'z' ? wid * 1.9 : len, along === 'z' ? len : wid * 1.9), M.well);
  well.rotation.x = Math.PI / 2;
  well.position.set(centre.x, hinge.y + 0.012, centre.z);
  v.body.add(well);
  v.gear.push({ pivot, axis: axis.clone().normalize(), retractDeg: deg, hideWhenUp: [well], door: true });
}

/**
 * How far a leg swings to stow: from its own rake (a leg leaning back from its trunnion has less far to
 * go to lie forward, more to lie back) to 8 deg past level, so the wheel ends up in the fuselage.
 */
function swing(top: THREE.Vector3, axle: THREE.Vector3, dir: 'forward' | 'aft' | 'inward', sx: number): number {
  const A = axle.clone().sub(top);
  const R = 180 / Math.PI;
  if (dir === 'inward') {
    const lean = Math.atan2(A.x * sx, -A.y) * R;
    return -sx * (90 + lean + 8);
  }
  const lean = Math.atan2(A.z, -A.y) * R;
  return dir === 'forward' ? 90 + lean + 8 : -(90 - lean + 8);
}

/** Detailed tricycle gear: legs, wheels, braces, doors and wells, sequenced (see updateGear). */
export function buildGearSet(v: AirframeVisual, g: GearSpec): void {
  const doorMat = new THREE.MeshStandardMaterial({ color: g.doorColor, roughness: 0.6, metalness: 0.2 });
  const paint = g.strutColor ? new THREE.MeshStandardMaterial({ color: g.strutColor, roughness: 0.5, metalness: 0.3 }) : gearMats().strut;
  // --- nose
  {
    const n = g.nose;
    const twin = n.twin;
    const off = n.w / 2 + 0.05;
    const fwdRet = n.retract === 'forward';
    buildLeg(v, {
      top: n.top,
      axle: n.axle,
      r: n.r,
      w: n.w,
      wheelX: twin ? [-off, off] : [0],
      strutX: 0,
      rO: Math.max(0.055, n.r * 0.24),
      axis: V(1, 0, 0),
      deg: swing(n.top, n.axle, fwdRet ? 'forward' : 'aft', 0),
      braceDir: V(0, 0, fwdRet ? -1 : 1),
      nose: true,
      side: 0,
      lights: true,
      launchBar: !!n.launchBar,
      // (the bay doors close the nose bay: no door on the strut itself)
      door: null,
      trailing: false,
      paint,
      panel: n.panel ?? null,
      halfFork: n.fork === 'half' && !twin,
      heavy: false,
    });
    if (n.doors !== false) {
      // two long doors either side of the bay, along the leg's path, hinged at the bay's edges
      const L = n.top.distanceTo(n.axle) + n.r;
      const hw = Math.max(0.17, (twin ? n.w * 2 + 0.12 : n.w) / 2 + 0.06);
      const zc = n.top.z + (fwdRet ? -1 : 1) * L * 0.45;
      for (const sx of [-1, 1]) {
        const hinge = V(sx * hw, n.top.y + 0.01, zc);
        // open: hanging down a little outward; shut: swung up flat across half the bay
        buildDoor(v, doorMat, hinge, V(0, 0, 1), sx * -84, [L * 0.95, hw * 0.98], V(sx * hw, n.top.y, zc), 'z', g.inner?.noseDoor ? { mat: g.inner.noseDoor, facing: -sx } : undefined);
      }
    }
  }
  // --- mains
  for (const sx of [-1, 1]) {
    const m = g.mains;
    const top = m.top.clone().setX(m.top.x * sx);
    const axle = m.axle.clone().setX(m.axle.x * sx);
    const inward = m.retract === 'inward';
    const axis = inward ? V(0, 0, 1) : V(1, 0, 0);
    const deg = swing(top, axle, m.retract, sx);
    const braceDir = inward ? V(-sx, 0, 0) : V(0, 0, m.retract === 'forward' ? -1 : 1);
    buildLeg(v, {
      top,
      axle,
      r: m.r,
      w: m.w,
      wheelX: [0],
      strutX: -sx * (m.outboard + m.w / 2 + 0.04),
      rO: Math.max(0.065, m.r * 0.2),
      axis,
      deg,
      braceDir,
      nose: false,
      side: sx,
      lights: false,
      launchBar: false,
      door: { color: doorMat, inner: g.inner?.legDoor },
      trailing: !!m.trailing,
      paint,
      panel: null,
      halfFork: false,
      heavy: !!m.heavy && !m.trailing,
    });
    // the bay door, beside the bay along the leg's path, and the well under it
    const L = top.distanceTo(axle) + m.r;
    if (inward) {
      const xc = top.x - sx * L * 0.5;
      const zEdge = top.z - m.r * 1.0;
      const hinge = V(xc, top.y + 0.01, zEdge);
      buildDoor(v, doorMat, hinge, V(1, 0, 0), 84, [L * 0.95, m.r * 1.9], V(xc, top.y, zEdge + m.r * 0.95), 'x', g.inner?.mainDoor ? { mat: g.inner.mainDoor, facing: 1 } : undefined);
    } else {
      const zc = top.z + (m.retract === 'forward' ? -1 : 1) * L * 0.45;
      const hinge = V(top.x - sx * (m.w / 2 + 0.25), top.y + 0.01, zc);
      buildDoor(v, doorMat, hinge, V(0, 0, 1), 84 * sx, [L * 0.95, m.r * 1.05], V(top.x - sx * 0.05, top.y, zc), 'z', g.inner?.mainDoor ? { mat: g.inner.mainDoor, facing: sx } : undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// per frame
// ---------------------------------------------------------------------------

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _k = new THREE.Vector3();
const _qb = new THREE.Quaternion();

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export interface GearState {
  gearPos: number;
  onGround: boolean;
  /** ground speed (m/s) */
  gs: number;
  /** rudder pedals -1..1 */
  yaw: number;
  /** the jet's squat on its struts (m, + = body down onto the gear) and its pitch / roll on them (sines) */
  squat: number;
  sp: number;
  sr: number;
  dt: number;
  /** move the small parts (links, braces): off for distant jets */
  detail: boolean;
}

/** wheel roll distance (m) and steering angle, kept per visual */
export interface GearMotion {
  roll: number;
  rate: number;
  steer: number;
}

export function updateGear(gear: GearLeg[], st: GearState, mo: GearMotion): void {
  const u = 1 - st.gearPos;
  // the sequence: doors open (or stay open) while the legs travel, shut once they are home
  const legK = smooth(0, 0.82, u);
  const doorK = smooth(0.8, 1, u);
  // wheels: rolling on the ground; spinning down in the air, braked hard once the gear starts up
  if (st.onGround && st.gearPos > 0.98) mo.rate = st.gs;
  else mo.rate *= Math.exp(-st.dt * (u > 0.01 ? 4 : 0.35));
  mo.roll += mo.rate * st.dt;
  const steerT = st.onGround ? -st.yaw * 0.55 * (1 - smooth(8, 30, st.gs)) : 0;
  mo.steer += (steerT - mo.steer) * Math.min(1, st.dt * 5);
  const vis = st.gearPos > 0.02;
  for (const g of gear) {
    g.pivot.visible = vis;
    for (const h of g.hideWhenUp) h.visible = vis;
    if (!vis) continue;
    g.pivot.quaternion.setFromAxisAngle(g.axis, (g.door ? doorK : legK) * g.retractDeg * (Math.PI / 180));
    const r = g.rig;
    if (!r) continue;
    // over the last part of its swing the leg rises into its bay
    g.pivot.position.copy(r.hinge);
    g.pivot.position.y += r.stow * smooth(0.55, 1, legK);
    // the oleo: compressed on the ground by the jet's weight (and its squat, pitch and roll on the
    // struts), extended off it
    const base = g.pivot.position;
    const ground = st.onGround && st.gearPos > 0.98;
    const target = ground ? -(st.squat + base.z * st.sp + base.x * st.sr) : r.extend;
    r.ext += (target - r.ext) * Math.min(1, st.dt * (ground ? 30 : 4));
    r.lower.position.copy(r.dir).multiplyScalar(r.ext);
    if (r.steer) r.steer.quaternion.setFromAxisAngle(r.dir, mo.steer);
    for (const w of r.wheels) w.rotation.x = -mo.roll / r.wheelR;
    if (!st.detail) continue;
    // torque links: from the cylinder to the oleo, the knee out front
    if (r.links) {
      const L = r.links;
      _b.copy(L.b).add(r.lower.position);
      knee(L.a, _b, L.l1, L.l2, L.pole, _k);
      span(L.upper, L.a, _k);
      span(L.lower, _k, _b);
    }
    // braces: the leg's end of each, in the body frame, as the leg swings
    for (const b of r.braces) {
      _a.copy(b.q).applyQuaternion(g.pivot.quaternion).add(base);
      if (b.kind === 'fold') {
        knee(b.p, _a, b.l1, b.l2, b.pole, _k);
        span(b.m1, b.p, _k);
        span(b.m2, _k, _a);
      } else {
        // the jack: its barrel from the airframe toward the leg, the chrome ram from the leg back into it
        _k.subVectors(_a, b.p);
        const d = _k.length();
        _k.divideScalar(Math.max(d, 1e-6));
        _b.copy(b.p).addScaledVector(_k, Math.min(b.l1, d));
        span(b.m1, b.p, _b);
        _b.copy(_a).addScaledVector(_k, -Math.min(b.l2, d));
        span(b.m2, _a, _b);
      }
    }
  }
  void _qb;
}
