// Ground targets, guided bombs in flight, bomb craters and the wrecks left
// behind. Every model is built to its real size (metres), so a Shilka next
// to a parked F-15EX looks as small as it really is and a hardened shelter
// swallows the jet whole.
//
// Structures collapse into charred rubble when destroyed; vehicles burn out.
// Turrets, launchers and radar antennas follow what the simulation says the
// air defences are aiming at.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Sim } from '../game/sim';
import type { GroundUnit, GroundKind } from '../game/ground';
import type { Bomb } from '../weapons/bomb';
import type { CombatRenderer } from './combatRenderer';
import { Aircraft } from '../aircraft/aircraft';
import { createAirframe, releaseAirframe, AirframeVisual } from '../aircraft/models';
import { storeGeometry } from '../aircraft/models/stores';
import { getSoftDotTexture } from './textures';
import { terrainHeight } from '../world/terrain';

type G = THREE.BufferGeometry;

// --- geometry helpers --------------------------------------------------------

const _c = new THREE.Color();

function paint(g: G, hex: string): G {
  if (g.index) g = g.toNonIndexed();
  if (g.attributes.uv) g.deleteAttribute('uv');
  _c.set(hex).convertSRGBToLinear();
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = _c.r;
    a[i * 3 + 1] = _c.g;
    a[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Box: width (x), height (y), length (z); (x, y, z) is the bottom centre. */
function bx(w: number, h: number, l: number, x: number, y: number, z: number, hex: string, rotY = 0): G {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(0, h / 2, 0);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return paint(g, hex);
}

/** Cylinder standing up (axis y), bottom at y. */
function cy(r0: number, r1: number, h: number, x: number, y: number, z: number, hex: string, seg = 16): G {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg);
  g.translate(x, y + h / 2, z);
  return paint(g, hex);
}

/** Cylinder lying along x (wheels) or z (barrels). */
function cyl(r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'z', hex: string, seg = 12): G {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, hex);
}

/** Half-cylinder arch along z (shelters, bunkers): radius, length, squash in y. */
function arch(r: number, len: number, squash: number, hex: string, seg = 16): G {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false, -Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  g.rotateZ(Math.PI / 2);
  g.scale(1, squash, 1);
  return paint(g, hex);
}

/** Gable roof prism along z. */
function gable(w: number, h: number, l: number, y: number, hex: string): G {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false });
  g.translate(0, y, -l / 2);
  return paint(g, hex);
}

function merge(list: G[]): G {
  return mergeGeometries(list, false)!;
}

// --- palette ---------------------------------------------------------------------

const OLIVE = '#6b7a52';
const OLIVE_D = '#56633f';
const SAND = '#b9aa84';
const CONCRETE = '#a6a298';
const CONCRETE_D = '#858177';
const EARTH = '#7f7456';
const GRASS = '#6f7f4a';
const TANKWHITE = '#dcddd5';
const CANVAS = '#86835f';
const METAL = '#44484b';
const RUBBER = '#262627';
const RADAR = '#949b95';
const MISSILE = '#d6d6cf';
const GLASS = '#1d2a33';
const ROOF = '#55595c';
const RUST = '#7a3b22';

// --- vehicles ------------------------------------------------------------------------

/** Tracked hull: hull box, track runs with road wheels, front glacis. */
function trackedHull(w: number, l: number, h: number, hex: string): G[] {
  const tw = 0.55;
  const parts: G[] = [bx(w - 2 * tw + 0.1, h * 0.7, l * 0.96, 0, 0.45, 0, hex)];
  for (const sx of [-1, 1]) {
    parts.push(bx(tw, 0.85, l, sx * (w / 2 - tw / 2), 0.05, 0, RUBBER));
    for (let k = 0; k < 6; k++) parts.push(cyl(0.33, tw + 0.04, sx * (w / 2 - tw / 2), 0.4, -l / 2 + 0.7 + (k * (l - 1.4)) / 5, 'x', METAL, 10));
    // fender
    parts.push(bx(tw + 0.1, 0.06, l * 0.98, sx * (w / 2 - tw / 2), 0.92, 0, hex));
  }
  return parts;
}

/** Wheeled chassis: frame, n axles of wheels. */
function wheels(w: number, l: number, axles: number[], r = 0.55): G[] {
  const parts: G[] = [];
  for (const z of axles) for (const sx of [-1, 1]) parts.push(cyl(r, 0.38, sx * (w / 2 - 0.2), r, z, 'x', RUBBER, 12));
  return parts;
}

interface Built {
  base: G;
  /** rotating turret / antenna mount and what sits on it */
  turret?: { geo: G; at: THREE.Vector3 };
  /** elevating part on the turret (guns, launcher rails, dish) */
  gun?: { geo: G; at: THREE.Vector3; spin?: boolean };
  /** muzzle positions on the gun part (for flashes) */
  muzzles?: THREE.Vector3[];
}

function buildKind(kind: GroundKind): Built {
  switch (kind) {
    case 'ammo': {
      // earth-covered steel-arch magazine ("igloo") with a concrete headwall
      const shell = arch(5.2, 26, 1.05, GRASS, 18);
      const head = bx(11.5, 6.2, 0.9, 0, 0, -13.2, CONCRETE);
      const door = bx(4.2, 3.6, 0.2, 0, 0, -13.75, METAL);
      const wings = [-1, 1].map((s) => bx(0.8, 3.5, 4, s * 6.2, 0, -11.5, CONCRETE_D));
      const berm = bx(12.5, 0.8, 27, 0, 0, 0, EARTH);
      return { base: merge([berm, shell, head, door, ...wings]) };
    }
    case 'fuel': {
      const parts: G[] = [cy(8, 8, 10.5, 0, 0, 0, TANKWHITE, 28), cy(8, 1.2, 1.4, 0, 10.5, 0, '#bfc0b8', 28)];
      // containment bund around the tank
      for (const [x, z, w, l] of [[0, -11, 23, 1], [0, 11, 23, 1], [-11, 0, 1, 23], [11, 0, 1, 23]] as const) parts.push(bx(w, 1.4, l, x, 0, z, CONCRETE_D));
      // stair and a band of rust
      parts.push(bx(0.8, 10.5, 0.8, 8.2, 0, 0, METAL));
      parts.push(cy(8.05, 8.05, 0.6, 0, 0.2, 0, RUST, 28));
      return { base: merge(parts) };
    }
    case 'bunker': {
      // reinforced concrete command bunker under an earth mound
      const mound = new THREE.CylinderGeometry(9.5, 13.5, 4.5, 8, 1);
      mound.scale(1, 1, 1.35);
      mound.translate(0, 2.25, 0);
      const parts: G[] = [paint(mound, EARTH), bx(4, 3.2, 6, 0, 0, -14, CONCRETE), bx(2.4, 2.4, 0.2, 0, 0, -17.05, METAL)];
      parts.push(cy(0.1, 0.1, 8, 3, 4.5, 3, METAL, 6), cy(0.1, 0.1, 6, -3, 4.5, 4, METAL, 6), bx(1.4, 1.4, 1.4, 0, 4.4, 5, CONCRETE_D));
      return { base: merge(parts) };
    }
    case 'hq': {
      const parts: G[] = [bx(16, 8.5, 34, 0, 0, 0, SAND), bx(16.6, 0.5, 34.6, 0, 8.5, 0, ROOF)];
      for (const fl of [1.4, 5.2]) for (const s of [-1, 1]) parts.push(bx(0.1, 1.6, 30, s * 8.02, fl, 0, GLASS));
      parts.push(bx(4, 3.2, 3, 0, 0, -18, SAND), cy(0.08, 0.08, 12, 6, 9, 14, METAL, 6), bx(3, 2.2, 3, -4, 9, 10, CONCRETE_D));
      return { base: merge(parts) };
    }
    case 'barracks': {
      const parts: G[] = [bx(12, 4.2, 42, 0, 0, 0, '#9a916f'), gable(13, 2.6, 43, 4.2, ROOF)];
      for (const s of [-1, 1]) for (let k = 0; k < 8; k++) parts.push(bx(0.1, 1.2, 1.8, s * 6.02, 1.6, -18 + k * 5.2, GLASS));
      return { base: merge(parts) };
    }
    case 'hangar': {
      const parts: G[] = [bx(42, 11, 50, 0, 0, 0, '#7c8178')];
      const roof = arch(21.5, 50.5, 0.3, ROOF, 20);
      roof.translate(0, 11, 0);
      parts.push(roof, bx(34, 9.5, 0.3, 0, 0, -25.1, '#5f645e'));
      for (let k = 0; k < 6; k++) parts.push(bx(0.2, 9.5, 0.4, -15 + k * 6, 0, -25.3, METAL));
      return { base: merge(parts) };
    }
    case 'has': {
      // third-generation hardened aircraft shelter: concrete arch, blast doors, exhaust port at the back
      const shell = arch(12, 36, 0.78, '#8c8878', 22);
      const doors = bx(22, 8.8, 1.4, 0, 0, -18.5, '#6f7065');
      const rails = bx(26, 0.3, 3, 0, 0, -19.5, METAL);
      const back = bx(8, 5, 2, 0, 0, 18.5, CONCRETE_D);
      const apron = bx(26, 0.25, 12, 0, 0, -25, CONCRETE);
      return { base: merge([shell, doors, rails, back, apron]) };
    }
    case 'ewr': {
      // P-18 style truck-mounted early-warning radar: van, mast, big Yagi array
      const base = merge([...wheels(2.5, 9, [-3.4, -1.6, 2.6]), bx(2.5, 1.2, 9, 0, 0.9, 0, OLIVE), bx(2.4, 2.2, 2.2, 0, 1.3, -3.6, OLIVE_D), bx(2.5, 2.4, 5.8, 0, 2.1, 1.2, OLIVE)]);
      const mast = cy(0.25, 0.2, 5.5, 0, 0, 0, METAL, 8);
      const array: G[] = [bx(9, 0.2, 0.2, 0, 0, 0, METAL), bx(9, 0.2, 0.2, 0, 2.6, 0, METAL)];
      for (let k = 0; k < 8; k++) array.push(bx(0.08, 2.8, 0.08, -4 + k * 1.14, 0, 0, METAL), cyl(0.03, 2.4, -4 + k * 1.14, 1.3, -1.2, 'z', RADAR, 5));
      return { base: merge([base, mast]), turret: { geo: merge(array), at: new THREE.Vector3(0, 9.9, 1.2) }, gun: undefined };
    }
    case 'samRadar': {
      // tracked fire-control radar vehicle with a big square-ish dish
      const base = merge([...trackedHull(3.3, 9.5, 1.9, OLIVE), bx(2.3, 1.8, 3.5, 0, 1.8, 1.8, OLIVE_D)]);
      const turret = merge([bx(2.4, 1.4, 2.6, 0, 0, 0, OLIVE), cy(0.35, 0.35, 1.2, 0, 1.4, 0, METAL, 10)]);
      const dish = merge([bx(3.8, 3.0, 0.35, 0, -1.5, 0, RADAR), bx(0.4, 0.4, 1.2, 0, 0, -0.6, METAL)]);
      return { base, turret: { geo: turret, at: new THREE.Vector3(0, 1.8, -1.6) }, gun: { geo: dish, at: new THREE.Vector3(0, 3.8, 0) } };
    }
    case 'sam': {
      // tracked TELAR: turntable with four missiles on rails
      const base = merge([...trackedHull(3.3, 9.3, 1.9, OLIVE), bx(2.3, 1.2, 2.2, 0, 1.8, -3.2, OLIVE_D)]);
      const turret = merge([cy(1.25, 1.25, 0.7, 0, 0, 0, OLIVE, 14), bx(1.2, 1.1, 1.2, 0, 0.7, 0.6, OLIVE_D)]);
      const rails: G[] = [];
      for (const x of [-0.75, -0.25, 0.25, 0.75]) {
        rails.push(cyl(0.2, 5.6, x, 0.3, -1.6, 'z', MISSILE, 10));
        const nose = new THREE.ConeGeometry(0.2, 0.6, 10);
        nose.rotateX(-Math.PI / 2);
        nose.translate(x, 0.3, -4.7);
        rails.push(paint(nose, MISSILE));
      }
      rails.push(bx(2.1, 0.12, 5.4, 0, 0, -1.6, METAL));
      return { base, turret: { geo: turret, at: new THREE.Vector3(0, 1.8, 0.8) }, gun: { geo: merge(rails), at: new THREE.Vector3(0, 1.3, 0.8) } };
    }
    case 'aaa': {
      // ZSU-23-4 Shilka: low tracked hull, flat turret, four 23 mm barrels, radar dish at the back
      const base = merge(trackedHull(3.1, 6.5, 1.6, OLIVE));
      const turret = merge([bx(2.9, 1.0, 3.0, 0, 0, 0.2, OLIVE), bx(2.4, 0.2, 2.4, 0, 1.0, 0.2, OLIVE_D), cy(0.1, 0.1, 0.7, 0, 1.0, 1.4, METAL, 6)]);
      const guns: G[] = [];
      const muzzles: THREE.Vector3[] = [];
      for (const x of [-0.95, -0.6, 0.6, 0.95]) {
        guns.push(cyl(0.05, 2.6, x, 0, -1.5, 'z', METAL, 6));
        muzzles.push(new THREE.Vector3(x, 0, -2.85));
      }
      guns.push(bx(0.6, 0.45, 1.0, -0.78, -0.22, -0.2, OLIVE_D), bx(0.6, 0.45, 1.0, 0.78, -0.22, -0.2, OLIVE_D));
      // search / tracking dish on its mast
      const dish = new THREE.CylinderGeometry(0.75, 0.75, 0.12, 14);
      dish.rotateX(Math.PI / 2);
      dish.translate(0, 1.7, 1.35);
      guns.push(paint(dish, RADAR));
      return { base, turret: { geo: turret, at: new THREE.Vector3(0, 1.45, -0.2) }, gun: { geo: merge(guns), at: new THREE.Vector3(0, 0.75, -0.3) }, muzzles };
    }
    case 'ciws': {
      // Type 1130 close-in weapon system: pedestal on the sponson, a boxy
      // mount with a radome, eleven 30 mm barrels in a rotating cluster
      const NAVY = '#8d949a', NAVY_D = '#6c7379';
      const base = merge([cy(1.5, 1.7, 1.2, 0, 0, 0, NAVY_D, 16), bx(3.4, 0.25, 3.4, 0, 0, 0, '#5b6166')]);
      const turret = merge([bx(2.2, 1.6, 2.6, 0, 0, 0.3, NAVY), cy(0.95, 0.95, 0.9, 0, 1.6, 0.6, '#d9dcdc', 16), bx(1.4, 0.6, 1.0, 0, 0.5, 1.9, NAVY_D)]);
      const guns: G[] = [];
      const muzzles: THREE.Vector3[] = [];
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * Math.PI * 2;
        guns.push(cyl(0.045, 2.9, Math.cos(a) * 0.28, Math.sin(a) * 0.28, -1.75, 'z', METAL, 5));
        if (k % 3 === 0) muzzles.push(new THREE.Vector3(Math.cos(a) * 0.28, Math.sin(a) * 0.28, -3.2));
      }
      guns.push(cyl(0.4, 0.9, 0, 0, -0.1, 'z', NAVY_D, 12), cyl(0.36, 0.12, 0, 0, -3.0, 'z', METAL, 12));
      return { base, turret: { geo: turret, at: new THREE.Vector3(0, 1.2, 0) }, gun: { geo: merge(guns), at: new THREE.Vector3(0, 2.0, -0.6) }, muzzles };
    }
    case 'truck': {
      // Ural-4320 with a canvas-covered cargo bed
      return { base: merge([...wheels(2.5, 7.4, [-2.6, 1.3, 2.7], 0.55), bx(2.4, 0.4, 7.2, 0, 0.9, 0, METAL), bx(2.4, 1.6, 1.9, 0, 1.2, -2.6, OLIVE), bx(2.3, 0.9, 1.4, 0, 1.2, -3.6, OLIVE_D), bx(2.45, 1.6, 4.5, 0, 1.3, 1.25, CANVAS)]) };
    }
    case 'tank': {
      const turret = merge([cy(1.55, 1.35, 0.8, 0, 0, 0.2, OLIVE, 16), bx(0.8, 0.35, 0.8, 0.5, 0.8, 0.6, OLIVE_D)]);
      const gun = merge([cyl(0.09, 5.8, 0, 0, -3.1, 'z', OLIVE_D, 8), cyl(0.16, 0.9, 0, 0, -3.8, 'z', OLIVE_D, 8)]);
      return { base: merge(trackedHull(3.6, 7.0, 1.3, OLIVE)), turret: { geo: turret, at: new THREE.Vector3(0, 1.4, 0.4) }, gun: { geo: gun, at: new THREE.Vector3(0, 1.85, -0.8) } };
    }
    case 'apc': {
      const hull = new THREE.CylinderGeometry(1.2, 1.45, 7.4, 6);
      hull.rotateX(Math.PI / 2);
      hull.scale(1, 0.75, 1);
      hull.translate(0, 1.5, 0);
      const turret = merge([cy(0.55, 0.5, 0.55, 0, 0, 0, OLIVE, 10)]);
      const gun = cyl(0.05, 2.0, 0, 0, -1.0, 'z', METAL, 6);
      return { base: merge([paint(hull, OLIVE), ...wheels(2.9, 7.6, [-2.6, -1.2, 1.2, 2.6], 0.55)]), turret: { geo: turret, at: new THREE.Vector3(0, 2.3, -0.8) }, gun: { geo: gun, at: new THREE.Vector3(0, 2.6, -0.8) } };
    }
    case 'tent': {
      return { base: merge([gable(6, 3.2, 10, 0, CANVAS), bx(6.1, 0.05, 10.1, 0, 0, 0, EARTH)]) };
    }
    case 'mast': {
      // guyed lattice communications mast with dish antennas
      const parts: G[] = [bx(5, 0.8, 5, 0, 0, 0, CONCRETE)];
      const H = 45;
      for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]] as const) parts.push(bx(0.14, H, 0.14, x, 0.8, z, '#b7372b'));
      for (let y = 3; y < H; y += 4) parts.push(bx(1.7, 0.1, 0.1, 0, y, -0.8, '#d9d9d9'), bx(1.7, 0.1, 0.1, 0, y, 0.8, '#d9d9d9'));
      for (const y of [30, 38]) {
        const d = new THREE.CylinderGeometry(1.1, 0.9, 0.5, 14);
        d.rotateX(Math.PI / 2);
        d.translate(0, y, -1.3);
        parts.push(paint(d, '#e2e2dc'));
      }
      return { base: merge(parts) };
    }
    case 'jet':
      return { base: merge([bx(1, 0.1, 1, 0, 0, 0, CONCRETE)]) };
  }
}

// --- materials -------------------------------------------------------------------------

let MATS: { unit: THREE.MeshStandardMaterial; char: THREE.MeshStandardMaterial; bomb: THREE.MeshStandardMaterial; crater: THREE.MeshBasicMaterial; pad: THREE.MeshStandardMaterial } | null = null;
function mats() {
  if (!MATS) {
    MATS = {
      unit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, envMapIntensity: 1.2 }),
      char: new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 0.95, metalness: 0 }),
      bomb: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }),
      crater: new THREE.MeshBasicMaterial({ map: getSoftDotTexture(), color: 0x18130d, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
      pad: new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 0.95 }),
    };
  }
  return MATS;
}

const cache = new Map<GroundKind, Built>();
function built(kind: GroundKind): Built {
  let b = cache.get(kind);
  if (!b) cache.set(kind, (b = buildKind(kind)));
  return b;
}

interface UnitVis {
  group: THREE.Group;
  base: THREE.Mesh;
  turret: THREE.Object3D | null;
  gun: THREE.Object3D | null;
  muzzles: THREE.Vector3[];
  jet: AirframeVisual | null;
  wrecked: boolean;
  spin: number;
}

const _m = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3(0, 0, -1);

export class GroundRenderer {
  private units = new Map<GroundUnit, UnitVis>();
  private bombs = new Map<Bomb, THREE.Mesh>();
  private craters: THREE.Mesh[] = [];
  private unsub: (() => void)[] = [];
  private flashT = 0;
  private gen = -1;
  private cookoffs: { t: number; pos: THREE.Vector3 }[] = [];
  private compounds: THREE.Mesh[] = [];

  constructor(
    private scene: THREE.Scene,
    private sim: Sim,
    private combat: CombatRenderer,
  ) {
    const ev = sim.events;
    this.unsub.push(
      ev.on('bombRelease', (e) => this.onRelease(e.bomb, e.shooter, e.station)),
      ev.on('bombImpact', (e) => this.onImpact(e.bomb, e.pos)),
      ev.on('groundDestroyed', (e) => this.onDestroyed(e.unit)),
    );
  }

  private addUnit(u: GroundUnit): void {
    const b = built(u.kind);
    const m = mats();
    const group = new THREE.Group();
    group.position.copy(u.pos);
    group.rotation.y = -u.heading;
    const base = new THREE.Mesh(b.base, m.unit);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    // a foundation under structures on sloping ground
    if (u.def.structure && u.kind !== 'tent' && u.kind !== 'mast') {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(u.def.w + 3, 5, u.def.l + 3), m.pad);
      pad.position.y = -2.45;
      pad.receiveShadow = true;
      group.add(pad);
    }
    let turret: THREE.Object3D | null = null;
    let gun: THREE.Object3D | null = null;
    if (b.turret) {
      turret = new THREE.Group();
      turret.position.copy(b.turret.at);
      const tm = new THREE.Mesh(b.turret.geo, m.unit);
      tm.castShadow = true;
      turret.add(tm);
      group.add(turret);
    }
    if (b.gun) {
      gun = new THREE.Group();
      const gm = new THREE.Mesh(b.gun.geo, m.unit);
      gm.castShadow = true;
      gun.add(gm);
      if (turret) {
        gun.position.copy(b.gun.at).sub(b.turret!.at);
        turret.add(gun);
      } else {
        gun.position.copy(b.gun.at);
        group.add(gun);
      }
    }
    let jet: AirframeVisual | null = null;
    if (u.kind === 'jet' && u.jetType) {
      const ac = new Aircraft(u.jetType, 'red', 'PARKED');
      ac.fm.setOnGround(u.pos.clone(), (u.heading * 180) / Math.PI);
      ac.fm.gearPos = 1;
      jet = createAirframe(ac);
      jet.update(0);
      base.visible = false;
      this.scene.add(jet.root);
    }
    this.scene.add(group);
    this.units.set(u, { group, base, turret, gun, muzzles: b.muzzles ?? [], jet, wrecked: false, spin: Math.random() * 6 });
  }

  private onRelease(b: Bomb, shooter: Aircraft, station: number): void {
    this.combat.aircraftVis.get(shooter)?.removeStation(station);
    const mesh = new THREE.Mesh(storeGeometry(b.spec.type), mats().bomb);
    mesh.castShadow = true;
    mesh.position.copy(b.pos);
    this.scene.add(mesh);
    this.bombs.set(b, mesh);
  }

  private onImpact(b: Bomb, pos: THREE.Vector3): void {
    const mesh = this.bombs.get(b);
    if (mesh) {
      this.scene.remove(mesh);
      this.bombs.delete(b);
    }
    const water = terrainHeight(pos.x, pos.z) <= 0.5;
    const size = Math.sqrt(b.spec.warhead / 200) * 1.25;
    this.combat.explode(pos.clone().setY(pos.y + 2), size, water ? 'water' : 'ground');
    if (water) return;
    this.combat.dustRing(pos, b.spec.blastRadius);
    // crater: a scorched pit about a third of the blast radius across
    const r = Math.max(3, b.spec.blastRadius * 0.32);
    const cr = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mats().crater);
    cr.rotation.x = -Math.PI / 2;
    cr.position.set(pos.x, terrainHeight(pos.x, pos.z) + 0.25, pos.z);
    cr.renderOrder = 2;
    this.scene.add(cr);
    this.craters.push(cr);
    if (this.craters.length > 60) this.scene.remove(this.craters.shift()!);
  }

  private onDestroyed(u: GroundUnit): void {
    const v = this.units.get(u);
    if (!v || v.wrecked) return;
    v.wrecked = true;
    const m = mats();
    const top = u.pos.clone().setY(u.pos.y + u.def.h * 0.5);
    if (v.jet) {
      v.jet.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = m.char;
      });
      v.jet.root.rotation.z += 0.08;
      v.jet.root.position.y -= 0.8;
    }
    v.base.material = m.char;
    if (u.def.structure) {
      // collapse: the structure sags to a heap of rubble
      v.base.scale.set(1.05, u.kind === 'mast' ? 0.12 : 0.38, 1.05);
    } else {
      v.group.rotation.z = (Math.random() - 0.5) * 0.15;
      v.group.rotation.x = (Math.random() - 0.5) * 0.1;
    }
    for (const part of [v.turret, v.gun]) {
      part?.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = m.char;
      });
    }
    // blown-off turret
    if (v.turret && !u.def.structure) {
      v.turret.position.x += (Math.random() - 0.5) * 2.5;
      v.turret.rotation.z = (Math.random() - 0.5) * 0.8;
    }
    // fire: fuel burns big and long, ammunition cooks off
    const fireSize = u.kind === 'fuel' ? 4 : u.kind === 'ammo' ? 2.4 : u.def.structure ? 1.8 : 1;
    const life = u.kind === 'fuel' ? 240 : u.def.structure ? 120 : 70;
    this.combat.addFire(top, fireSize, life);
    if (u.kind === 'fuel') this.combat.explode(top, 2.6, 'ground');
    if (u.kind === 'ammo') {
      // the stored ammunition cooks off over the next seconds (sim time: pauses with the game)
      for (let k = 1; k <= 4; k++) this.cookoffs.push({ t: 0.35 * k + Math.random() * 0.4, pos: top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 3, (Math.random() - 0.5) * 20)) });
    }
    if (u.kind === 'jet' || u.kind === 'sam') this.combat.explode(top, 1.1, 'ground');
  }

  update(dt: number, cam: THREE.Camera): void {
    // the ground forces were rebuilt (a new airstrike): start over
    if (this.gen !== this.sim.groundGen) {
      this.gen = this.sim.groundGen;
      this.clearUnits();
    }
    // cleared, trampled ground under each compound (vehicle tracks, gravel)
    if (this.compounds.length !== this.sim.groundSites.length) {
      for (const c of this.compounds) this.scene.remove(c);
      this.compounds = this.sim.groundSites.map((s) => this.compound(s.x, s.z, s.r));
    }
    // new units (the mode builds them before the first frame)
    if (this.units.size !== this.sim.ground.length) for (const u of this.sim.ground) if (!this.units.has(u)) this.addUnit(u);
    this.flashT += dt;
    for (let i = this.cookoffs.length - 1; i >= 0; i--) {
      const c = this.cookoffs[i];
      c.t -= dt;
      if (c.t <= 0) {
        this.combat.explode(c.pos, 1.2 + Math.random(), 'ground');
        this.cookoffs.splice(i, 1);
      }
    }
    const cp = cam.position;
    const pc = cam as THREE.PerspectiveCamera;
    const tanHalf = Math.tan(((pc.fov ?? 70) * Math.PI) / 360) / Math.max(0.01, pc.zoom ?? 1);
    for (const [u, v] of this.units) {
      // guns on a ship sail with it
      if (u.mounted) {
        v.group.position.copy(u.pos);
        v.group.rotation.y = -u.heading;
      }
      const d = cp.distanceTo(u.pos);
      const far = u.def.structure ? 45000 : 16000;
      v.group.visible = d < far;
      if (v.jet) {
        v.jet.root.visible = d < 20000;
        if (v.jet.root.visible) v.jet.updateLod(d, tanHalf);
      }
      if (!v.group.visible || v.wrecked) continue;
      if (u.kind === 'ewr' && v.turret) v.turret.rotation.y += dt * 1.2;
      else if (v.turret) {
        v.turret.rotation.y = -u.aimYaw;
        if (u.kind === 'samRadar' && !u.defense?.target) v.turret.rotation.y = (v.spin += dt * 0.6);
      }
      if (v.gun) v.gun.rotation.x = Math.max(0, Math.min(1.4, u.aimPitch));
      // muzzle flashes while the guns fire
      if (u.firing && v.gun && v.muzzles.length && d < 12000) {
        v.gun.updateWorldMatrix(true, false);
        for (let i = 0; i < v.muzzles.length; i++) {
          if (Math.random() < 0.55) {
            _m.copy(v.muzzles[i]).applyMatrix4(v.gun.matrixWorld);
            this.combat.muzzleFlash(_m, 1);
          }
        }
      }
    }
    // bombs in flight: nose along the velocity
    for (const [b, mesh] of this.bombs) {
      if (!b.alive) {
        this.scene.remove(mesh);
        this.bombs.delete(b);
        continue;
      }
      mesh.position.copy(b.pos);
      const v = b.vel;
      if (v.lengthSq() > 1) {
        _q.setFromUnitVectors(_fwd, _m.copy(v).normalize());
        mesh.quaternion.copy(_q);
      }
    }
  }

  /** A terrain-hugging patch of bare earth and gravel, soft-edged. */
  private compound(x: number, z: number, r: number): THREE.Mesh {
    const n = 28;
    const g = new THREE.PlaneGeometry(r * 2.4, r * 2.4, n, n);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i) + x, pz = pos.getZ(i) + z;
      pos.setXYZ(i, px, Math.max(0, terrainHeight(px, pz)) + 0.35, pz);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(
      g,
      new THREE.MeshLambertMaterial({ map: getSoftDotTexture(), color: 0x75694f, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.renderOrder = 1;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  private clearUnits(): void {
    for (const c of this.compounds) this.scene.remove(c);
    this.compounds = [];
    for (const m of this.bombs.values()) this.scene.remove(m);
    this.bombs.clear();
    this.cookoffs.length = 0;
    for (const v of this.units.values()) {
      this.scene.remove(v.group);
      if (v.jet) {
        this.scene.remove(v.jet.root);
        releaseAirframe(v.jet);
      }
    }
    this.units.clear();
    for (const c of this.craters) this.scene.remove(c);
    this.craters = [];
  }

  dispose(): void {
    for (const f of this.unsub) f();
    this.unsub = [];
    for (const v of this.units.values()) {
      this.scene.remove(v.group);
      if (v.jet) {
        this.scene.remove(v.jet.root);
        releaseAirframe(v.jet);
      }
    }
    this.units.clear();
    for (const m of this.bombs.values()) this.scene.remove(m);
    this.bombs.clear();
    for (const c of this.craters) this.scene.remove(c);
    this.craters = [];
  }
}
