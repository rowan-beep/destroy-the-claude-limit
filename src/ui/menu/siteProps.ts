// Props for the launch site: cars and trucks with real body shapes, a lattice-
// boom crawler crane and a truck crane, tracking dishes, containers, barriers,
// light poles, a gatehouse, sand fences and the like. Repeated things are drawn
// as instanced meshes so a few hundred of them cost little.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface PropMats {
  steel: THREE.Material;
  darkSteel: THREE.Material;
  paint: THREE.Material;
  concrete: THREE.Material;
}

/** a side profile (x forward, y up) extruded across the width with soft, rounded edges */
function profile(pts: [number, number][], width: number, bevel: number, smoothTop = true): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  if (smoothTop) sh.splineThru(pts.slice(1).map(([x, y]) => new THREE.Vector2(x, y)));
  else pts.slice(1).forEach(([x, y]) => sh.lineTo(x, y));
  sh.closePath();
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(sh, {
    depth: Math.max(0.01, width - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.7,
    bevelSegments: 3,
    curveSegments: 10,
  });
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const c = g.clone();
  c.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  return c;
}
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  return mergeGeometries(clean, false)!;
}

type Part = 'paint' | 'glass' | 'tire' | 'hub' | 'head' | 'tail' | 'trim';
type Variant = 'sedan' | 'hatch' | 'suv' | 'pickup' | 'van';

function wheels(xs: number[], halfTrack: number, r: number, w: number): { tire: THREE.BufferGeometry; hub: THREE.BufferGeometry } {
  const tire = new THREE.CylinderGeometry(r, r, w, 18);
  tire.rotateX(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(r * 0.58, r * 0.58, 0.04, 14);
  hub.rotateX(Math.PI / 2);
  const t: THREE.BufferGeometry[] = [], h: THREE.BufferGeometry[] = [];
  for (const x of xs) {
    for (const s of [-1, 1]) {
      t.push(place(tire, x, r, s * halfTrack));
      h.push(place(hub, x, r, s * (halfTrack + w / 2 + 0.005)));
    }
  }
  return { tire: merge(t), hub: merge(h) };
}
function lights(front: number, back: number, y: number, half: number): { head: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  const l = new THREE.BoxGeometry(0.08, 0.13, 0.36);
  const r = new THREE.BoxGeometry(0.06, 0.14, 0.42);
  return {
    head: merge([place(l, front, y, half - 0.28), place(l, front, y, -half + 0.28)]),
    tail: merge([place(r, back, y + 0.08, half - 0.26), place(r, back, y + 0.08, -half + 0.26)]),
  };
}

function variantParts(v: Variant): Partial<Record<Part, THREE.BufferGeometry>> {
  if (v === 'sedan') {
    const body = profile([[-2.3, 0.3], [-2.4, 0.56], [-2.33, 0.82], [-1.95, 0.95], [-1.4, 0.98], [1.0, 0.93], [1.85, 0.84], [2.3, 0.68], [2.38, 0.46], [2.28, 0.3]], 1.82, 0.14);
    const glass = profile([[-1.55, 0.9], [-1.2, 1.28], [-0.6, 1.4], [0.3, 1.39], [0.65, 1.28], [1.15, 0.9]], 1.62, 0.12);
    const roof = profile([[-0.95, 1.33], [-0.55, 1.425], [0.25, 1.42], [0.5, 1.34]], 1.52, 0.05);
    return { paint: merge([body, roof]), glass, ...wheels([-1.42, 1.38], 0.8, 0.32, 0.22), ...lights(2.36, -2.37, 0.66, 0.91), trim: merge([place(new THREE.BoxGeometry(4.5, 0.12, 1.86), 0, 0.36, 0)]) };
  }
  if (v === 'hatch') {
    const body = profile([[-1.95, 0.3], [-2.0, 0.6], [-1.95, 0.92], [-1.6, 1.0], [0.85, 0.94], [1.6, 0.84], [1.95, 0.66], [2.0, 0.46], [1.9, 0.3]], 1.74, 0.13);
    const glass = profile([[-1.9, 0.92], [-1.75, 1.32], [-1.1, 1.45], [0.25, 1.43], [0.6, 1.3], [1.0, 0.92]], 1.56, 0.12);
    const roof = profile([[-1.65, 1.37], [-1.1, 1.475], [0.2, 1.46], [0.45, 1.38]], 1.46, 0.05);
    return { paint: merge([body, roof]), glass, ...wheels([-1.25, 1.25], 0.76, 0.31, 0.21), ...lights(1.98, -1.98, 0.68, 0.87) };
  }
  if (v === 'suv') {
    const body = profile([[-2.4, 0.42], [-2.48, 0.7], [-2.44, 1.08], [-2.1, 1.14], [1.05, 1.12], [2.05, 1.02], [2.42, 0.86], [2.45, 0.55], [2.35, 0.42]], 1.92, 0.15);
    const glass = profile([[-2.42, 1.06], [-2.35, 1.68], [-1.9, 1.78], [0.45, 1.77], [0.8, 1.64], [1.25, 1.08]], 1.74, 0.12);
    const roof = profile([[-2.2, 1.72], [-1.9, 1.82], [0.4, 1.81], [0.62, 1.73]], 1.66, 0.05);
    const rails = merge([place(new THREE.BoxGeometry(2.6, 0.06, 0.06), -0.8, 1.86, 0.7), place(new THREE.BoxGeometry(2.6, 0.06, 0.06), -0.8, 1.86, -0.7)]);
    return { paint: merge([body, roof]), glass, trim: merge([rails, place(new THREE.BoxGeometry(4.8, 0.22, 1.98), 0, 0.5, 0)]), ...wheels([-1.5, 1.48], 0.86, 0.38, 0.26), ...lights(2.44, -2.47, 0.92, 0.96) };
  }
  if (v === 'pickup') {
    const cab = profile([[-0.6, 0.45], [-0.62, 1.1], [1.1, 1.12], [2.2, 1.02], [2.62, 0.86], [2.64, 0.56], [2.55, 0.45]], 1.96, 0.14);
    const bed = profile([[-2.85, 0.45], [-2.88, 1.08], [-0.66, 1.08], [-0.66, 0.45]], 1.96, 0.1, false);
    const glass = profile([[-0.6, 1.08], [-0.58, 1.72], [0.55, 1.76], [0.85, 1.62], [1.3, 1.1]], 1.78, 0.12);
    const roof = profile([[-0.5, 1.7], [0.5, 1.8], [0.7, 1.7]], 1.66, 0.05);
    const liner = place(new THREE.BoxGeometry(2.1, 0.06, 1.7), -1.78, 1.08, 0);
    return { paint: merge([cab, bed, roof]), glass, trim: merge([liner, place(new THREE.BoxGeometry(0.12, 0.3, 1.9), 2.66, 0.62, 0)]), ...wheels([-1.85, 1.65], 0.86, 0.39, 0.27), ...lights(2.63, -2.88, 0.9, 0.98) };
  }
  // a panel van
  const body = profile([[-2.75, 0.38], [-2.8, 1.9], [-2.65, 2.25], [0.7, 2.28], [1.45, 1.6], [2.25, 1.15], [2.45, 0.85], [2.42, 0.5], [2.3, 0.38]], 1.96, 0.15);
  const glass = profile([[0.6, 2.05], [1.35, 1.58], [1.75, 1.32], [0.7, 1.3], [0.55, 2.0]], 2.0, 0.08, false);
  return { paint: body, glass, ...wheels([-1.8, 1.6], 0.86, 0.36, 0.25), ...lights(2.43, -2.82, 0.95, 0.97) };
}

/** Parked and moving road vehicles, one instanced mesh per variant and part. */
export class Fleet {
  private items: { v: Variant; m: THREE.Matrix4; c: THREE.Color; lit: boolean }[] = [];
  private meshes: { v: Variant; part: Part; mesh: THREE.InstancedMesh; index: number[] }[] = [];
  static readonly COLOURS = ['#e9e9e7', '#1c1e22', '#a5abb2', '#7d1416', '#e2e1dd', '#1b3561', '#5a5f66', '#c8c6c0', '#2e4a3a', '#8a8f96', '#f2f1ee', '#3a3d42'];

  add(v: Variant, x: number, y: number, z: number, ry: number, colour: string | THREE.Color, lit = false): number {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    this.items.push({ v, m, c: new THREE.Color(colour), lit });
    return this.items.length - 1;
  }

  build(scene: THREE.Scene, shadows = true): void {
    const paint = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.08 });
    const mats: Record<Part, THREE.Material> = {
      paint,
      glass: new THREE.MeshStandardMaterial({ color: '#0d1217', roughness: 0.04, metalness: 0.9 }),
      tire: new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.92 }),
      hub: new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.3, metalness: 0.95 }),
      head: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.25, 1.1), toneMapped: false }),
      tail: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.03, 0.02) }),
      trim: new THREE.MeshStandardMaterial({ color: '#202225', roughness: 0.7 }),
    };
    const litHead = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.4, 7), toneMapped: false });
    const litTail = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.15, 0.08), toneMapped: false });
    for (const v of ['sedan', 'hatch', 'suv', 'pickup', 'van'] as Variant[]) {
      const mine = this.items.map((it, i) => ({ it, i })).filter((e) => e.it.v === v);
      if (!mine.length) continue;
      const parts = variantParts(v);
      for (const [part, geo] of Object.entries(parts) as [Part, THREE.BufferGeometry][]) {
        for (const lit of [false, true]) {
          const sel = mine.filter((e) => (part === 'head' || part === 'tail' ? e.it.lit === lit : !lit));
          if (!sel.length) continue;
          const mat = lit ? (part === 'head' ? litHead : litTail) : mats[part];
          const mesh = new THREE.InstancedMesh(geo, mat, sel.length);
          sel.forEach((e, k) => {
            mesh.setMatrixAt(k, e.it.m);
            if (part === 'paint') mesh.setColorAt(k, e.it.c);
          });
          mesh.castShadow = shadows && (part === 'paint' || part === 'glass');
          mesh.receiveShadow = part === 'paint';
          scene.add(mesh);
          this.meshes.push({ v, part, mesh, index: sel.map((e) => e.i) });
        }
      }
    }
  }

  /** move vehicle `i` (for traffic on the road) */
  setMatrix(i: number, m: THREE.Matrix4): void {
    for (const e of this.meshes) {
      const k = e.index.indexOf(i);
      if (k < 0) continue;
      e.mesh.setMatrixAt(k, m);
      e.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

/** a cab-over-engine semi with a tanker or box trailer */
export function semiTruck(m: PropMats, cabColour: string, tanker: boolean): THREE.Group {
  const g = new THREE.Group();
  const cabMat = new THREE.MeshPhysicalMaterial({ color: cabColour, roughness: 0.35, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1 });
  const glass = new THREE.MeshStandardMaterial({ color: '#0d1217', roughness: 0.04, metalness: 0.9 });
  const tire = new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.92 });
  const cab = new THREE.Mesh(profile([[3.6, 1.1], [3.65, 2.1], [3.45, 3.3], [3.2, 3.55], [1.4, 3.6], [1.35, 1.1]], 2.5, 0.18), cabMat);
  g.add(cab);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.95), glass);
  ws.position.set(3.58, 2.75, 0);
  ws.rotation.set(0, Math.PI / 2, 0.08);
  g.add(ws);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.8), glass);
    side.position.set(3.0, 2.75, s * 1.26);
    if (s < 0) side.rotation.y = Math.PI;
    g.add(side);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.35, 1.1), m.darkSteel);
  frame.position.set(-3.4, 0.95, 0);
  g.add(frame);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 16), m.steel);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(1.8, 0.9, 1.0);
  g.add(tank);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 10), m.steel);
  stack.position.set(1.25, 3.4, 1.0);
  g.add(stack);
  const wg = new THREE.CylinderGeometry(0.52, 0.52, 0.32, 18);
  wg.rotateX(Math.PI / 2);
  for (const x of [2.8, -0.2, -1.5, -8.0, -9.3]) for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wg, tire);
    w.position.set(x, 0.52, s * 1.08);
    g.add(w);
  }
  if (tanker) {
    const shell = new THREE.Mesh(new THREE.CapsuleGeometry(1.15, 9.2, 8, 28), new THREE.MeshStandardMaterial({ color: '#d7dade', roughness: 0.22, metalness: 0.9 }));
    shell.rotation.z = Math.PI / 2;
    shell.position.set(-5.1, 2.35, 0);
    shell.castShadow = true;
    g.add(shell);
    for (const x of [-8, -5.1, -2.2]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.12, 28), m.darkSteel);
      band.rotation.z = Math.PI / 2;
      band.position.set(x, 2.35, 0);
      g.add(band);
    }
    const walk = new THREE.Mesh(new THREE.BoxGeometry(8, 0.08, 0.6), m.darkSteel);
    walk.position.set(-5.1, 3.55, 0);
    g.add(walk);
  } else {
    const box = new THREE.Mesh(new RoundedBoxGeometry(11, 2.9, 2.5, 2, 0.08), m.paint);
    box.position.set(-4.9, 2.6, 0);
    box.castShadow = true;
    g.add(box);
  }
  cab.castShadow = true;
  return g;
}

/** a lattice-boom crawler crane; returns the group and the boom tip in the group's frame */
export function crawlerCrane(m: PropMats, yellow: THREE.Material): { group: THREE.Group; tip: THREE.Vector3 } {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: '#1f2124', roughness: 0.75, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: '#0d1217', roughness: 0.05, metalness: 0.9 });
  // tracks: long frames with rounded idler ends and a row of shoe ribs
  const ribs: THREE.BufferGeometry[] = [];
  for (const dz of [-3.9, 3.9]) {
    const frame = new THREE.Mesh(new RoundedBoxGeometry(11.5, 1.6, 1.5, 4, 0.78), black);
    frame.position.set(0, 0.8, dz);
    frame.castShadow = frame.receiveShadow = true;
    g.add(frame);
    for (let x = -5.2; x <= 5.2; x += 0.42) ribs.push(place(new THREE.BoxGeometry(0.12, 0.08, 1.52), x, 1.62, dz));
    for (let x = -5.2; x <= 5.2; x += 0.42) ribs.push(place(new THREE.BoxGeometry(0.12, 0.08, 1.52), x, -0.0, dz));
  }
  const ribMesh = new THREE.Mesh(merge(ribs), black);
  g.add(ribMesh);
  const carbody = new THREE.Mesh(new RoundedBoxGeometry(4.2, 1.2, 6.4, 2, 0.2), m.darkSteel);
  carbody.position.y = 1.6;
  g.add(carbody);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.5, 32), m.darkSteel);
  ring.position.y = 2.45;
  g.add(ring);
  // the upper works: deck, machinery house, operator's cab, counterweight stack
  const deck = new THREE.Mesh(new RoundedBoxGeometry(8.6, 0.7, 4.6, 2, 0.15), yellow);
  deck.position.set(-1.2, 3.0, 0);
  deck.castShadow = true;
  g.add(deck);
  const house = new THREE.Mesh(new RoundedBoxGeometry(5.4, 2.6, 3.6, 3, 0.25), yellow);
  house.position.set(-1.8, 4.6, -0.3);
  house.castShadow = true;
  g.add(house);
  const louvres: THREE.BufferGeometry[] = [];
  for (let y = 3.9; y < 5.6; y += 0.22) louvres.push(place(new THREE.BoxGeometry(2.4, 0.06, 0.04), -2.6, y, 1.52));
  g.add(new THREE.Mesh(merge(louvres), black));
  const cab = new THREE.Mesh(new RoundedBoxGeometry(2.0, 2.3, 1.3, 3, 0.18), yellow);
  cab.position.set(1.9, 4.5, 1.7);
  cab.castShadow = true;
  g.add(cab);
  for (const [w, h, x, y, z, ry] of [[1.2, 1.3, 2.91, 4.75, 1.7, Math.PI / 2], [1.4, 1.2, 1.9, 4.75, 2.36, 0]] as number[][]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass);
    pane.position.set(x, y, z);
    pane.rotation.y = ry;
    g.add(pane);
  }
  for (let i = 0; i < 5; i++) {
    const slab = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.75, 4.4, 2, 0.08), m.darkSteel);
    slab.position.set(-5.9, 3.7 + i * 0.78, 0);
    slab.castShadow = true;
    g.add(slab);
  }
  // the gantry (A-frame) behind the house
  const gb: THREE.BufferGeometry[] = [];
  const strut = (a: THREE.Vector3, b: THREE.Vector3, w: number) => {
    const len = a.distanceTo(b);
    const bx = new THREE.BoxGeometry(w, len, w);
    bx.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()), new THREE.Vector3(1, 1, 1)));
    gb.push(bx);
  };
  const apex = new THREE.Vector3(-3.6, 11.5, 0);
  for (const s of [-1, 1]) {
    strut(new THREE.Vector3(-1.2, 3.3, s * 1.9), apex.clone().add(new THREE.Vector3(0, 0, s * 1.2)), 0.32);
    strut(new THREE.Vector3(-5.2, 3.3, s * 1.9), apex.clone().add(new THREE.Vector3(0, 0, s * 1.2)), 0.32);
  }
  strut(apex.clone().add(new THREE.Vector3(0, 0, -1.3)), apex.clone().add(new THREE.Vector3(0, 0, 1.3)), 0.4);
  // the boom: four chords tapering at both ends, laced on every face
  const len = 118, ang = THREE.MathUtils.degToRad(72);
  const foot = new THREE.Vector3(2.4, 3.6, 0);
  const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
  const nrm = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0);
  const side = new THREE.Vector3(0, 0, 1);
  const half = (t: number) => 0.45 + 0.95 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) * (t > 0.85 ? 1 - (t - 0.85) / 0.15 * 0.55 : 1);
  const at = (t: number, a: number, b: number) => foot.clone().addScaledVector(dir, t * len).addScaledVector(nrm, a * half(t)).addScaledVector(side, b * half(t));
  const corners: [number, number][] = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const bays = 40;
  for (const [a, b] of corners) for (let k = 0; k < bays; k++) strut(at(k / bays, a, b), at((k + 1) / bays, a, b), 0.22);
  for (let k = 0; k < bays; k++) {
    const t0 = k / bays, t1 = (k + 1) / bays;
    for (let f = 0; f < 4; f++) {
      const [a0, b0] = corners[f], [a1, b1] = corners[(f + 1) % 4];
      if (k % 2 === 0) strut(at(t0, a0, b0), at(t1, a1, b1), 0.08);
      else strut(at(t0, a1, b1), at(t1, a0, b0), 0.08);
    }
    if (k % 4 === 0) for (let f = 0; f < 4; f++) strut(at(t0, ...corners[f]), at(t0, ...corners[(f + 1) % 4]), 0.08);
  }
  g.add(new THREE.Mesh(merge(gb), yellow));
  const tip = foot.clone().addScaledVector(dir, len);
  const head = new THREE.Mesh(new RoundedBoxGeometry(2.0, 1.4, 1.6, 2, 0.2), yellow);
  head.position.copy(tip);
  head.rotation.z = ang - Math.PI / 2;
  g.add(head);
  const sheave = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.0, 20), m.darkSteel);
  sheave.rotation.x = Math.PI / 2;
  sheave.position.copy(tip).add(new THREE.Vector3(0.6, 0.2, 0));
  g.add(sheave);
  // pendants from the tip back to the gantry, hoist ropes down to the hook block
  const rope = new THREE.LineBasicMaterial({ color: '#1a1a1c' });
  const line = (pts: THREE.Vector3[]) => g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), rope));
  for (const s of [-0.9, 0.9]) line([tip.clone().add(new THREE.Vector3(-0.4, 0.4, s)), apex.clone().add(new THREE.Vector3(0, 0, s))]);
  const hookY = tip.y - 46;
  const tipOut = tip.clone().add(new THREE.Vector3(1.2, 0, 0));
  for (const s of [-0.25, 0.25]) line([tipOut.clone().add(new THREE.Vector3(0, 0, s)), new THREE.Vector3(tipOut.x, hookY + 1.4, s)]);
  const block = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.8, 0.9, 2, 0.15), yellow);
  block.position.set(tipOut.x, hookY + 0.5, 0);
  g.add(block);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 8, 16, Math.PI * 1.5), m.darkSteel);
  hook.position.set(tipOut.x, hookY - 0.75, 0);
  g.add(hook);
  return { group: g, tip };
}

/** an all-terrain truck crane with its boom raised and outriggers down */
export function truckCrane(m: PropMats, yellow: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const tire = new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.92 });
  const glass = new THREE.MeshStandardMaterial({ color: '#0d1217', roughness: 0.05, metalness: 0.9 });
  const carrier = new THREE.Mesh(new RoundedBoxGeometry(13.5, 1.5, 2.7, 2, 0.2), yellow);
  carrier.position.y = 1.75;
  carrier.castShadow = true;
  g.add(carrier);
  const cab = new THREE.Mesh(profile([[5.4, 2.4], [6.75, 2.4], [6.8, 3.3], [6.5, 3.9], [5.4, 3.95]], 1.1, 0.12), yellow);
  cab.position.z = 0.65;
  g.add(cab);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.9), glass);
  ws.position.set(6.78, 3.35, 0.65);
  ws.rotation.y = Math.PI / 2;
  g.add(ws);
  const wg = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 18);
  wg.rotateX(Math.PI / 2);
  for (const x of [4.6, 2.9, -1.6, -3.3, -5.0]) for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wg, tire);
    w.position.set(x, 0.62, s * 1.22);
    g.add(w);
  }
  for (const x of [3.8, -4.4]) for (const s of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 3.0), yellow);
    beam.position.set(x, 1.4, s * 2.4);
    g.add(beam);
    const jack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.3, 10), m.steel);
    jack.position.set(x, 0.75, s * 3.8);
    g.add(jack);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 16), m.darkSteel);
    pad.position.set(x, 0.05, s * 3.8);
    g.add(pad);
  }
  const turret = new THREE.Mesh(new RoundedBoxGeometry(4.5, 1.6, 2.6, 2, 0.2), yellow);
  turret.position.set(-2.2, 3.3, 0);
  g.add(turret);
  const cw = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.6, 2.6, 2, 0.15), m.darkSteel);
  cw.position.set(-4.9, 3.4, 0);
  g.add(cw);
  // telescopic boom: nested box sections, each a little slimmer
  const boomAng = 0.62;
  const secs = [[12, 1.3, 1.1], [11, 1.1, 0.92], [10, 0.92, 0.76], [9, 0.76, 0.62]];
  let reach = 0;
  const base = new THREE.Vector3(-1.5, 4.1, 0);
  for (const [l, h, w] of secs) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), yellow);
    const mid = reach + l / 2;
    b.position.set(base.x + Math.cos(boomAng) * mid, base.y + Math.sin(boomAng) * mid, 0);
    b.rotation.z = boomAng;
    b.castShadow = true;
    g.add(b);
    reach += l - 1.4;
  }
  const lift = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6, 10), m.steel);
  lift.position.set(0.8, 4.6, 0);
  lift.rotation.z = -0.25;
  g.add(lift);
  return g;
}

/** a tracking antenna: parabolic dish on a yoke and pedestal, pointed at (az, el) */
export function trackingDish(m: PropMats, r: number, az: number, el: number): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#e7e6e2', roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.32, r * 0.9, 24), white);
  ped.position.y = r * 0.45;
  ped.castShadow = true;
  g.add(ped);
  const yoke = new THREE.Group();
  yoke.position.y = r * 1.0;
  yoke.rotation.y = az;
  g.add(yoke);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(r * 0.1, r * 0.45, r * 0.12), white);
    arm.position.set(0, r * 0.12, s * r * 0.36);
    yoke.add(arm);
  }
  const tilt = new THREE.Group();
  tilt.position.y = r * 0.3;
  tilt.rotation.z = el;
  yoke.add(tilt);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const x = (i / 16) * r;
    pts.push(new THREE.Vector2(x, (x * x) / (4 * r * 0.45)));
  }
  const dish = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), white);
  dish.rotation.z = -Math.PI / 2;
  dish.castShadow = true;
  tilt.add(dish);
  const feedLen = r * 0.45;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.012, r * 0.012, Math.hypot(feedLen, r * 0.8), 6), white);
    const rim = new THREE.Vector3(r * 0.55, Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
    const focus = new THREE.Vector3(feedLen, 0, 0);
    s.position.copy(rim).add(focus).multiplyScalar(0.5);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), focus.clone().sub(rim).normalize());
    tilt.add(s);
  }
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.07, r * 0.18, 12), m.darkSteel);
  feed.rotation.z = Math.PI / 2;
  feed.position.x = feedLen;
  tilt.add(feed);
  return g;
}

/** a corrugated shipping-container texture */
export function containerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 6) {
    const gr = g.createLinearGradient(x, 0, x + 6, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.0)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0.0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 6, 128);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, 256, 5);
  g.fillRect(0, 123, 256, 5);
  g.fillRect(0, 0, 4, 128);
  g.fillRect(252, 0, 4, 128);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(110,60,30,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 256, 90 + Math.random() * 38, 3 + Math.random() * 20, 2 + Math.random() * 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** a facade with rows of windows over corrugated cladding; a few windows lit */
export function facadeTexture(base: string, cols: number, rows: number, seed: number): THREE.CanvasTexture {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 5) {
    g.fillStyle = x % 10 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    g.fillRect(x, 0, 2.5, H);
  }
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ww = W / cols, rh = H / (rows + 0.8);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * ww + ww * 0.18, y = rh * 0.45 + j * rh, w = ww * 0.64, h = rh * 0.5;
      g.fillStyle = 'rgba(60,62,66,0.9)';
      g.fillRect(x - 2, y - 2, w + 4, h + 4);
      const lit = r() < 0.18;
      const gr = g.createLinearGradient(x, y, x + w, y + h);
      gr.addColorStop(0, lit ? '#f3c983' : '#1b232c');
      gr.addColorStop(1, lit ? '#d9a35a' : '#2f3a46');
      g.fillStyle = gr;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(200,205,210,0.5)';
      g.fillRect(x + w / 2 - 1, y, 2, h);
    }
  }
  const dirt = g.createLinearGradient(0, H * 0.75, 0, H);
  dirt.addColorStop(0, 'rgba(90,70,50,0)');
  dirt.addColorStop(1, 'rgba(90,70,50,0.3)');
  g.fillStyle = dirt;
  g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
