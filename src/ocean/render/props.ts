// The built and living things of the first region: Kestrel Harbor, the
// training buoy, the reef and a kelp stand, and the wreck of the coaster ORIEL
// BAY. Each set reports how far it is from the camera; the wreck builds its
// detailed model only when the vehicle is near it, keeps a cheap silhouette in
// the middle distance, and disposes of the detailed geometry when left behind.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HARBOR, SITES, K3, seabedHeight, wreckLocal, buildColliders } from '../world/geo';
import { patchOceanMaterial } from './oceanMaterial';

const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** paint a geometry's vertices with a colour (linear), with a little variation */
function paint(g: THREE.BufferGeometry, r: number, gg: number, b: number, vary = 0.06): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    const k = 1 + vary * Math.sin(p.getX(i) * 1.7 + p.getZ(i) * 2.3 + p.getY(i) * 0.9);
    col[i * 3] = srgb(Math.min(1, r * k));
    col[i * 3 + 1] = srgb(Math.min(1, gg * k));
    col[i * 3 + 2] = srgb(Math.min(1, b * k));
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** rust, streaks and settled silt on a wreck part, by facing and height */
function weather(g: THREE.BufferGeometry, base: [number, number, number]): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  const n = ng.attributes.position.count;
  const col = new Float32Array(n * 3);
  const p = ng.attributes.position, nr = ng.attributes.normal;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const up = nr.getY(i);
    const rust = 0.5 + 0.5 * Math.sin(x * 0.7 + Math.sin(z * 0.45) * 2 + y * 1.3);
    const streak = 0.5 + 0.5 * Math.sin(x * 3.1 + z * 2.7);
    let r = base[0], gg = base[1], b = base[2];
    // rust blooms and runs down the sides
    const rk = 0.35 * rust + 0.25 * streak * (1 - Math.abs(up));
    r = r * (1 - rk) + 0.42 * rk;
    gg = gg * (1 - rk) + 0.2 * rk;
    b = b * (1 - rk) + 0.1 * rk;
    // silt settles on everything that faces up
    const silt = Math.max(0, up - 0.35) * 0.9;
    r = r * (1 - silt) + 0.52 * silt;
    gg = gg * (1 - silt) + 0.5 * silt;
    b = b * (1 - silt) + 0.42 * silt;
    col[i * 3] = srgb(r);
    col[i * 3 + 1] = srgb(gg);
    col[i * 3 + 2] = srgb(b);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx);
  g.rotateZ(rz);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
};
const cyl = (rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, rx = 0, rz = 0) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.rotateX(rx);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};

/** a text decal on a canvas */
function textTexture(lines: [string, number][], w: number, h: number, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center';
  let y = 0;
  const total = lines.reduce((s, [, sz]) => s + sz * 1.25, 0);
  y = (h - total) / 2;
  for (const [t, sz] of lines) {
    g.font = `bold ${sz}px Arial, Helvetica, sans-serif`;
    y += sz;
    g.fillText(t, w / 2, y);
    y += sz * 0.25;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface PropStats {
  wreckDetail: boolean;
  wreckBuilds: number;
  wreckDisposals: number;
  decorInstances: number;
}

export class OceanProps {
  readonly group = new THREE.Group();
  readonly stats: PropStats = { wreckDetail: false, wreckBuilds: 0, wreckDisposals: 0, decorInstances: 0 };
  /** materials shared by everything here */
  readonly mats: { painted: THREE.MeshLambertMaterial; metal: THREE.MeshStandardMaterial; wreck: THREE.MeshStandardMaterial };
  private harbor: THREE.Group;
  private buoy: THREE.Group;
  private reef: THREE.Group | null = null;
  private kelp: THREE.InstancedMesh | null = null;
  private wreckFar: THREE.Mesh;
  private wreckNear: THREE.Group | null = null;
  /** the recorder's beacon light (blinks with its pulses) */
  readonly beacon: THREE.Mesh;
  readonly recorder: THREE.Group;
  private recorderHome: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  readonly plate: THREE.Mesh;
  /** the lab's mooring K3 in the deep basin, and the recorder the arm takes off its line */
  private k3: THREE.Group;
  readonly k3Hydrophone: THREE.Group;
  private k3HydrophoneHome: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  private k3TagMat: THREE.MeshStandardMaterial;
  /** false once the recorder is ashore (the follow-up done): it is no longer on the line */
  k3HydrophoneShown = true;
  private beaconMat: THREE.MeshBasicMaterial;
  private lights: { mesh: THREE.Mesh; period: number; phase: number }[] = [];
  private kelpMat: THREE.MeshLambertMaterial | null = null;
  private kelpTime = { value: 0 };

  constructor(decor: number) {
    this.group.name = 'props';
    this.mats = {
      painted: patchOceanMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), 'painted'),
      metal: patchOceanMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 }), 'metal'),
      wreck: patchOceanMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.15 }), 'wreck'),
    };
    this.harbor = this.buildHarbor();
    this.buoy = this.buildBuoy();
    this.group.add(this.harbor, this.buoy);
    this.setDecor(decor);
    this.wreckFar = this.buildWreckFar();
    this.group.add(this.wreckFar);
    // the recorder capsule and its beacon (always present: it is the mission's object)
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
    this.recorder = this.buildRecorder();
    this.recorderHome = { position: this.recorder.position.clone(), quaternion: this.recorder.quaternion.clone() };
    this.beacon = this.recorder.getObjectByName('beacon') as THREE.Mesh;
    // (a locator beacon is heard, not seen: no light)
    this.beacon.visible = false;
    this.group.add(this.recorder);
    // the stern plate (always present: it is scanned)
    this.plate = this.buildPlate();
    this.group.add(this.plate);
    // the mooring K3 (small: built once, shown near it)
    const tagTex = textTexture([['KESTREL MARINE LAB', 30], ['MOORING K3', 46], ['IF FOUND DO NOT CUT', 24]], 512, 256, '#e9e6dc', '#1d2a33');
    this.k3TagMat = patchOceanMaterial(new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.8, metalness: 0.05 }), 'k3tag');
    this.k3 = this.buildK3();
    this.group.add(this.k3);
    this.k3Hydrophone = this.buildK3Hydrophone();
    this.k3HydrophoneHome = { position: this.k3Hydrophone.position.clone(), quaternion: this.k3Hydrophone.quaternion.clone() };
    this.group.add(this.k3Hydrophone);
  }

  // ---------------------------------------------------------------- harbor
  private buildHarbor(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'harbor';
    const hb = HARBOR.basin;
    const parts: THREE.BufferGeometry[] = [];
    const conc: [number, number, number] = [0.62, 0.6, 0.56];
    // the quay wall along the north of the basin
    parts.push(paint(box(hb.maxX - hb.minX + 40, 14, 6, 0, -4.5, hb.minZ - 3), ...conc));
    parts.push(paint(box(hb.maxX - hb.minX + 40, 0.6, 40, 0, 2.6, hb.minZ - 26), 0.5, 0.49, 0.46));
    // the pier: deck on piles
    parts.push(paint(box(12, 1.2, 96, -26, 2.2, -150), ...conc));
    for (let i = 0; i < 16; i++) {
      const z = -196 + i * 6.2;
      for (const x of [-31, -21]) parts.push(paint(cyl(0.45, 0.5, 15, 8, x, -5.5, z), 0.34, 0.33, 0.3));
      if (i % 3 === 0) parts.push(paint(cyl(0.25, 0.3, 0.7, 8, -20.6, 3.1, z), 0.15, 0.15, 0.16));
    }
    // fenders along the berth side
    for (let i = 0; i < 8; i++) parts.push(paint(cyl(0.45, 0.45, 2.2, 10, -19.9, 0.8, -186 + i * 11, 0, 0), 0.08, 0.08, 0.08));
    // the berth marks: yellow lines on the pier edge, and a floating marker each end
    parts.push(paint(box(0.3, 0.05, 16, -20.3, 2.82, HARBOR.berth.z), 0.95, 0.78, 0.1));
    for (const dz of [-9, 9]) parts.push(paint(cyl(0.5, 0.5, 1.4, 12, HARBOR.berth.x + 3.5, 0.2, HARBOR.berth.z + dz), 0.95, 0.55, 0.1));
    // the breakwater: rubble mounds along two arms to the gate
    const rock = new THREE.DodecahedronGeometry(1, 0);
    const rub: THREE.BufferGeometry[] = [];
    const arm = (x0: number, z0: number, x1: number, z1: number, seed: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.floor(len / 3.2);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        for (let k = 0; k < 3; k++) {
          const s = 2.2 + ((i * 7 + k * 13 + seed) % 5) * 0.45;
          const off = (k - 1) * 4.2;
          const nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
          const x = x0 + (x1 - x0) * t + nx * off, z = z0 + (z1 - z0) * t + nz * off;
          const r = rock.clone();
          r.scale(s, s * 0.8, s);
          r.rotateY(i * 1.3 + k);
          r.translate(x, k === 1 ? 1.2 : -1.2, z);
          rub.push(r);
        }
      }
    };
    arm(-250, -190, -HARBOR.gate.halfWidth - 6, HARBOR.gate.z, 3);
    arm(250, -190, HARBOR.gate.halfWidth + 6, HARBOR.gate.z, 9);
    const rubble = paint(mergeGeometries(rub)!, 0.46, 0.45, 0.42, 0.12);
    // sheds and a crane on the quay, a lighthouse at each gate head
    parts.push(paint(box(30, 9, 18, -120, 7, hb.minZ - 34), 0.7, 0.66, 0.58));
    parts.push(paint(box(22, 7, 14, 90, 6, hb.minZ - 30), 0.48, 0.55, 0.62));
    parts.push(paint(box(16, 11, 12, 150, 8, hb.minZ - 44), 0.75, 0.73, 0.68));
    parts.push(paint(cyl(0.6, 0.8, 18, 8, 40, 11.5, hb.minZ - 14), 0.92, 0.6, 0.12));
    parts.push(paint(box(1.2, 1.2, 26, 40, 20.5, hb.minZ - 4, 0, 0.35), 0.92, 0.6, 0.12));
    for (const [x, c] of [[-HARBOR.gate.halfWidth - 8, [0.8, 0.12, 0.1]], [HARBOR.gate.halfWidth + 8, [0.12, 0.6, 0.2]]] as [number, [number, number, number]][]) {
      parts.push(paint(cyl(1.6, 2.2, 9, 12, x, 6, HARBOR.gate.z), 0.92, 0.92, 0.9));
      parts.push(paint(cyl(1.2, 1.2, 1.6, 12, x, 11.3, HARBOR.gate.z), ...c));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] * 1.5, c[1] * 1.5, c[2] * 1.5) }));
      lamp.position.set(x, 12.4, HARBOR.gate.z);
      g.add(lamp);
      this.lights.push({ mesh: lamp, period: x < 0 ? 4 : 3, phase: x < 0 ? 0 : 1.3 });
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, this.mats.painted);
    mesh.receiveShadow = true;
    g.add(mesh, new THREE.Mesh(rubble, this.mats.painted));
    // a support vessel moored at the end of the pier
    const ship = this.buildSupportVessel();
    ship.position.set(-46, 0, -120);
    g.add(ship);
    return g;
  }

  private buildSupportVessel(): THREE.Group {
    const g = new THREE.Group();
    const parts: THREE.BufferGeometry[] = [];
    // hull: a box with a raked bow
    const hull = new THREE.BoxGeometry(8, 4, 30, 1, 1, 6);
    const p = hull.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), y = p.getY(i);
      if (z < -10) p.setX(i, p.getX(i) * (1 - (-10 - z) / 6.5));
      if (y < 0) p.setX(i, p.getX(i) * 0.8);
    }
    hull.computeVertexNormals();
    hull.translate(0, 0.3, 0);
    parts.push(paint(hull, 0.12, 0.2, 0.32));
    parts.push(paint(box(7.4, 0.4, 26, 0, 2.5, 1), 0.7, 0.68, 0.62));
    parts.push(paint(box(6, 4, 7, 0, 4.6, -4), 0.94, 0.94, 0.92));
    parts.push(paint(box(5, 1.6, 5, 0, 7.4, -5), 0.94, 0.94, 0.92));
    parts.push(paint(box(5.2, 0.6, 1.2, 0, 7.6, -7.8), 0.12, 0.16, 0.2));
    // the A-frame that launches the submarine over the stern
    for (const x of [-2.6, 2.6]) parts.push(paint(cyl(0.22, 0.22, 7, 8, x, 5.8, 12.8, 0.4), 0.95, 0.55, 0.1));
    parts.push(paint(box(5.6, 0.4, 0.4, 0, 9, 11.5), 0.95, 0.55, 0.1));
    g.add(new THREE.Mesh(mergeGeometries(parts)!, this.mats.painted));
    return g;
  }

  // ---------------------------------------------------------------- the training buoy
  private buildBuoy(): THREE.Group {
    const g = new THREE.Group();
    const b = SITES.buoy;
    const floor = seabedHeight(b.x, b.z);
    const parts: THREE.BufferGeometry[] = [];
    parts.push(paint(cyl(1.4, 1.4, 1.6, 20, 0, 0.1, 0), 0.95, 0.75, 0.08));
    parts.push(paint(cyl(0.2, 0.9, 3.4, 12, 0, 2.5, 0), 0.95, 0.75, 0.08));
    parts.push(paint(box(1.6, 0.9, 0.12, 0, 3.4, 0), 0.95, 0.95, 0.9));
    // the mooring: a chain down to a concrete sinker
    const links: THREE.BufferGeometry[] = [];
    for (let y = -1; y > floor + 1; y -= 0.7) {
      const l = new THREE.TorusGeometry(0.22, 0.06, 4, 8);
      l.rotateY(((y * 10) | 0) % 2 ? Math.PI / 2 : 0);
      l.translate(Math.sin(y * 0.3) * 0.6, y, 0);
      links.push(l);
    }
    parts.push(paint(mergeGeometries(links)!, 0.35, 0.22, 0.14));
    parts.push(paint(box(2.4, 1.2, 2.4, 0, floor + 0.6, 0), 0.5, 0.5, 0.48));
    const m = new THREE.Mesh(mergeGeometries(parts)!, this.mats.painted);
    g.add(m);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
    lamp.position.y = 4.4;
    g.add(lamp);
    this.lights.push({ mesh: lamp, period: 5, phase: 0.5 });
    g.position.set(b.x, 0, b.z);
    g.name = 'buoy';
    return g;
  }

  // ---------------------------------------------------------------- reef and kelp
  /** (re)build the decorative reef and kelp at a density 0..1 */
  setDecor(decor: number): void {
    if (this.reef) {
      this.group.remove(this.reef);
      this.reef.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
      });
      this.reef = null;
    }
    if (this.kelp) {
      this.group.remove(this.kelp);
      this.kelp.geometry.dispose();
      this.kelp = null;
    }
    this.reef = new THREE.Group();
    this.reef.name = 'reef';
    let seed = 41;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // (each shape is built with a white base colour; every instance gets its own tint)
    const white = (g: THREE.BufferGeometry, k = 1) => paint(g, k, k, k, 0.08);
    const boulder = new THREE.IcosahedronGeometry(1, 2);
    boulder.scale(1, 0.62, 1);
    white(boulder);
    // staghorn: a few forking branches from a short trunk
    const stag: THREE.BufferGeometry[] = [];
    let bs = 77;
    const brnd = () => ((bs = (bs * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9; i++) {
      const len = 0.5 + brnd() * 0.55;
      const b = new THREE.CylinderGeometry(0.03, 0.055, len, 5);
      b.translate(0, len / 2, 0);
      b.rotateZ((brnd() - 0.5) * 1.3);
      b.rotateY(brnd() * Math.PI * 2);
      b.translate((brnd() - 0.5) * 0.3, 0, (brnd() - 0.5) * 0.3);
      stag.push(white(b));
      const tw = new THREE.CylinderGeometry(0.02, 0.035, len * 0.5, 4);
      tw.translate(0, len * 0.25, 0);
      tw.rotateZ((brnd() - 0.5) * 1.6);
      tw.rotateY(brnd() * Math.PI * 2);
      tw.translate((brnd() - 0.5) * 0.4, len * 0.6, (brnd() - 0.5) * 0.4);
      stag.push(white(tw));
    }
    const staghorn = mergeGeometries(stag.map((g) => (g.index ? g.toNonIndexed() : g)))!;
    // plate coral: a thin plate on a stalk
    const plateC = mergeGeometries([white(new THREE.CylinderGeometry(1.3, 1.1, 0.1, 18).translate(0, 0.5, 0)).toNonIndexed(), white(new THREE.CylinderGeometry(0.12, 0.2, 0.5, 8).translate(0, 0.25, 0), 0.85).toNonIndexed()])!;
    // sea fan: a half disc standing upright, both faces
    const fanF = new THREE.CircleGeometry(1, 18, 0, Math.PI);
    const fanB = fanF.clone().rotateY(Math.PI);
    const fan = mergeGeometries([white(fanF).toNonIndexed(), white(fanB).toNonIndexed(), white(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 4).translate(0, 0.1, 0), 0.7).toNonIndexed()])!;
    // barrel sponge: an open barrel with a dark hollow
    const barrel = new THREE.CylinderGeometry(0.45, 0.32, 1.1, 14, 1, true).translate(0, 0.55, 0);
    const hollow = new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2).translate(0, 0.95, 0);
    const sponge = mergeGeometries([white(barrel).toNonIndexed(), paint(hollow, 0.18, 0.15, 0.14, 0).toNonIndexed()])!;
    const rock = new THREE.DodecahedronGeometry(1, 1);
    rock.scale(1, 0.7, 1);
    white(rock);
    const kinds: { geo: THREE.BufferGeometry; n: number; scale: [number, number]; col: [number, number, number][]; tilt: number; sink: number; wide: number }[] = [
      { geo: boulder, n: 200, scale: [0.5, 1.7], col: [[0.72, 0.62, 0.42], [0.6, 0.52, 0.48], [0.78, 0.7, 0.5], [0.55, 0.6, 0.42]], tilt: 0.25, sink: 0.25, wide: 1 }, // brain and boulder corals
      { geo: staghorn, n: 320, scale: [0.7, 1.5], col: [[0.86, 0.6, 0.45], [0.75, 0.5, 0.62], [0.9, 0.72, 0.42], [0.62, 0.66, 0.5]], tilt: 0.3, sink: 0.05, wide: 1 }, // staghorn
      { geo: plateC, n: 110, scale: [0.6, 1.6], col: [[0.55, 0.48, 0.32], [0.48, 0.44, 0.3], [0.6, 0.52, 0.36]], tilt: 0.35, sink: 0.05, wide: 1 }, // plate corals
      { geo: fan, n: 140, scale: [0.5, 1.2], col: [[0.75, 0.3, 0.42], [0.62, 0.3, 0.6], [0.9, 0.55, 0.3]], tilt: 0.15, sink: 0, wide: 1 }, // sea fans
      { geo: sponge, n: 90, scale: [0.6, 1.5], col: [[0.62, 0.38, 0.3], [0.55, 0.45, 0.3], [0.5, 0.36, 0.42]], tilt: 0.2, sink: 0.1, wide: 1 }, // barrel sponges
      { geo: rock, n: 240, scale: [0.8, 3.0], col: [[0.42, 0.4, 0.37], [0.5, 0.47, 0.42]], tilt: 0.5, sink: 0.35, wide: 1.8 }, // rocks
    ];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const c = new THREE.Color();
    let count = 0;
    // a patch reef: dense coral heads on knolls, with sand channels between them
    const patches: { x: number; z: number; r: number }[] = [];
    for (let tries = 0; patches.length < 70 && tries < 4000; tries++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (SITES.reef.r - 20);
      const x = SITES.reef.x + Math.cos(a) * r, z = SITES.reef.z + Math.sin(a) * r;
      const h = seabedHeight(x, z);
      if (h < -30) continue;
      // (coral grows on the tops and shoulders of the knolls, not in the sand between)
      const around = (seabedHeight(x + 18, z) + seabedHeight(x - 18, z) + seabedHeight(x, z + 18) + seabedHeight(x, z - 18)) / 4;
      if (h - around < 0.4 && tries < 3000) continue;
      patches.push({ x, z, r: 5 + rnd() * 8 });
    }
    for (const k of kinds) {
      // (rocks are fewer; the coral crowds its patches)
      const n = Math.round(k.n * (k.wide > 1 ? 1.4 : 2.6) * decor);
      if (!n || !patches.length) continue;
      const im = new THREE.InstancedMesh(k.geo, this.mats.painted, n);
      for (let i = 0; i < n; i++) {
        const pt = patches[Math.floor(rnd() * patches.length)];
        // (rocks scatter wider than the living coral)
        const spread = pt.r * k.wide;
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * spread;
        const x = pt.x + Math.cos(a) * r, z = pt.z + Math.sin(a) * r;
        const h = seabedHeight(x, z);
        const sc = k.scale[0] + rnd() * (k.scale[1] - k.scale[0]);
        p.set(x, h - sc * k.sink, z);
        e.set((rnd() - 0.5) * k.tilt, rnd() * 6.28, (rnd() - 0.5) * k.tilt);
        q.setFromEuler(e);
        s.set(sc, sc * (0.7 + rnd() * 0.6), sc);
        m.compose(p, q, s);
        im.setMatrixAt(i, m);
        const cc = k.col[Math.floor(rnd() * k.col.length)];
        c.setRGB(srgb(cc[0]), srgb(cc[1]), srgb(cc[2]));
        im.setColorAt(i, c);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      this.reef.add(im);
      count += n;
    }
    // the kelp stand west of the harbor mouth: tall fronds that sway
    // (giant kelp grows in dense clumps from the rocks; a stand of them west of the harbor mouth)
    const nk = Math.round(1700 * decor);
    if (nk) {
      if (!this.kelpMat) {
        this.kelpMat = patchOceanMaterial(new THREE.MeshLambertMaterial({ color: 0x5d5422, side: THREE.DoubleSide }), 'kelp');
        const base = this.kelpMat.onBeforeCompile;
        this.kelpMat.onBeforeCompile = (sh, r) => {
          base(sh, r);
          sh.uniforms.uKelpT = this.kelpTime;
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uKelpT;')
            .replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\n{ float k = position.y / 14.0; float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11; transformed.x += sin( uKelpT * 0.7 + ph ) * k * k * 2.2; transformed.z += cos( uKelpT * 0.5 + ph ) * k * k * 1.4; }',
            );
        };
      }
      // a stipe with its fronds: two crossed strips, so it has body from every side
      const b1 = new THREE.PlaneGeometry(0.55, 14, 1, 8);
      const b2 = b1.clone().rotateY(Math.PI / 2);
      const blade = mergeGeometries([b1, b2])!;
      blade.translate(0, 7, 0);
      const im = new THREE.InstancedMesh(blade, this.kelpMat, nk);
      // (its own random sequence: the stand stands in the same place on every preset)
      let ks = 913;
      const krnd = () => ((ks = (ks * 16807) % 2147483647) / 2147483647);
      const clumps: { x: number; z: number; r: number }[] = [];
      for (let c = 0; c < 16; c++) clumps.push({ x: -560 + (krnd() - 0.5) * 300, z: 330 + (krnd() - 0.5) * 240, r: 6 + krnd() * 10 });
      for (let i = 0; i < nk; i++) {
        const cl = clumps[i % clumps.length];
        const a = krnd() * Math.PI * 2, rr = Math.sqrt(krnd()) * cl.r;
        const x = cl.x + Math.cos(a) * rr, z = cl.z + Math.sin(a) * rr;
        const h = seabedHeight(x, z);
        const sc = 0.7 + krnd() * 0.6;
        p.set(x, h, z);
        e.set(0, krnd() * 6.28, 0);
        q.setFromEuler(e);
        s.set(sc, Math.min(sc * 1.1, (-h - 1) / 14), sc);
        m.compose(p, q, s);
        im.setMatrixAt(i, m);
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.kelp = im;
      this.group.add(im);
      count += nk;
    }
    this.group.add(this.reef);
    this.stats.decorInstances = count;
  }

  // ---------------------------------------------------------------- the wreck
  /** a few boxes: what the wreck looks like from afar and on sonar */
  private buildWreckFar(): THREE.Mesh {
    const parts: THREE.BufferGeometry[] = [];
    for (const c of buildColliders()) {
      if (c.kind !== 'box' || !c.tag.startsWith('wreck')) continue;
      parts.push(box(c.hx * 2, c.hy * 2, c.hz * 2, c.x, c.y, c.z, (-c.yaw * Math.PI) / 180));
    }
    const g = weather(mergeGeometries(parts)!, [0.3, 0.27, 0.24]);
    const m = new THREE.Mesh(g, this.mats.wreck);
    m.name = 'wreck-far';
    return m;
  }

  /** the detailed coaster: hull, holds, accommodation and bridge, funnel, crane, the broken bow, cargo */
  private buildWreckNear(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'wreck-near';
    const w = SITES.wreck;
    const ground = seabedHeight(w.x, w.z);
    const hullCol: [number, number, number] = [0.22, 0.24, 0.27];
    const top: [number, number, number] = [0.5, 0.42, 0.33];
    const white: [number, number, number] = [0.66, 0.64, 0.6];
    const parts: THREE.BufferGeometry[] = [];
    // the stern section (in the wreck's own frame: z toward the stern), listing a few degrees
    const hull = new THREE.BoxGeometry(15, 11, 60, 4, 4, 12);
    const hp = hull.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      // a rounded bilge and a stern that curves in
      const bilge = y < -2 ? 1 - Math.pow((-2 - y) / 4, 2) * 0.35 : 1;
      const stern = z > 22 ? 1 - Math.pow((z - 22) / 8, 2) * 0.35 : 1;
      hp.setX(i, x * bilge * stern);
      // the torn forward end
      if (z < -29) hp.setY(i, y + Math.sin(x * 1.7) * 1.4);
    }
    hull.translate(0, 5.5, 24);
    parts.push(weather(hull, hullCol));
    // the boot-topping (red below the old waterline)
    parts.push(weather(box(15.1, 3, 58, 0, 1.2, 24), [0.42, 0.14, 0.1]));
    // deck and hatch covers over the holds
    parts.push(weather(box(14.6, 0.4, 44, 0, 11.1, 14), top));
    for (let i = 0; i < 3; i++) parts.push(weather(box(10, 1.2, 9, 0, 11.9, -2 + i * 11), [0.36, 0.3, 0.24]));
    // accommodation block, bridge and wings, funnel
    parts.push(weather(box(13, 7, 9, 0, 14.6, 42), white));
    parts.push(weather(box(11, 3, 6, 0, 19.6, 41), white));
    parts.push(weather(box(16.5, 0.4, 2.2, 0, 21.2, 38.8), white));
    for (let i = -4; i <= 4; i++) parts.push(weather(box(1.1, 1.1, 0.2, i * 1.2, 20, 37.95), [0.06, 0.08, 0.09]));
    parts.push(weather(cyl(1.6, 1.9, 6, 12, 0, 22.8, 46), [0.2, 0.2, 0.22]));
    // the crane: pedestal and a boom fallen across the deck
    parts.push(weather(cyl(1, 1.2, 6, 10, -2, 14, 2), [0.7, 0.52, 0.12]));
    parts.push(weather(box(0.9, 0.9, 22, -2, 17, -6, 0, -0.28, 0.12), [0.7, 0.52, 0.12]));
    // railings along both sides
    for (let z = -4; z < 50; z += 1.6) for (const x of [-7.2, 7.2]) parts.push(box(0.08, 1.1, 0.08, x, 11.8, z));
    parts.push(box(0.06, 0.06, 54, -7.2, 12.3, 23), box(0.06, 0.06, 54, 7.2, 12.3, 23));
    // a mast and its stays
    parts.push(weather(cyl(0.25, 0.3, 14, 8, 0, 24, 36), white));
    // the broken bow section, lying apart at an angle (as the colliders have it)
    const bow = new THREE.BoxGeometry(14, 10, 36, 4, 3, 8);
    const bp = bow.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), z = bp.getZ(i), y = bp.getY(i);
      // the bow narrows to a stem
      if (z < -6) bp.setX(i, x * Math.max(0.05, 1 - (-6 - z) / 13));
      if (z > 16) bp.setY(i, y + Math.sin(x * 2.1) * 1.2);
    }
    bow.rotateZ(0.26);
    bow.rotateY((-21 * Math.PI) / 180);
    bow.translate(9 - 0.3, 5, -32);
    parts.push(weather(bow, hullCol));
    // the hull's local frame into the world
    const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
      if (!p.attributes.color) paint(p, 0.4, 0.38, 0.36);
      if (!p.attributes.normal) p.computeVertexNormals();
      return p;
    }))!;
    merged.rotateY((-w.yaw * Math.PI) / 180);
    merged.translate(w.x, ground, w.z);
    const mesh = new THREE.Mesh(merged, this.mats.wreck);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    // the cargo trail downslope: containers and a spilled pallet or two
    const cont: THREE.BufferGeometry[] = [];
    for (const c of buildColliders()) {
      if (c.tag !== 'cargo' || c.kind !== 'box') continue;
      const b = weather(box(c.hx * 2, c.hy * 2, c.hz * 2, c.x, c.y, c.z, (-c.yaw * Math.PI) / 180), [[0.55, 0.16, 0.1], [0.16, 0.32, 0.45], [0.42, 0.44, 0.2]][Math.abs(Math.round(c.x)) % 3] as [number, number, number]);
      cont.push(b);
    }
    // the anchor chain trailing from the bow
    for (let i = 0; i < 40; i++) {
      const p = wreckLocal(4 + Math.sin(i * 0.4) * 3, -50 - i * 0.9);
      const l = new THREE.TorusGeometry(0.4, 0.12, 4, 8);
      l.rotateY(i % 2 ? Math.PI / 2 : 0);
      l.translate(p.x, seabedHeight(p.x, p.z) + 0.15, p.z);
      cont.push(weather(l, [0.3, 0.2, 0.14]));
    }
    g.add(new THREE.Mesh(mergeGeometries(cont.map((p) => (p.index ? p.toNonIndexed() : p)))!, this.mats.wreck));
    return g;
  }

  /** the voyage data recorder capsule: orange, with its locator beacon */
  private buildRecorder(): THREE.Group {
    const g = new THREE.Group();
    const r = SITES.recorder;
    const h = seabedHeight(r.x, r.z);
    const parts: THREE.BufferGeometry[] = [];
    parts.push(paint(cyl(0.32, 0.32, 0.9, 16, 0, 0.32, 0, 0, Math.PI / 2), 0.95, 0.42, 0.08));
    parts.push(paint(box(0.7, 0.12, 0.5, 0, 0.06, 0), 0.25, 0.25, 0.27));
    parts.push(paint(cyl(0.06, 0.06, 0.3, 8, 0.36, 0.55, 0, 0, 0), 0.2, 0.2, 0.2));
    // the locator beacon clipped to the side
    parts.push(paint(cyl(0.05, 0.05, 0.3, 10, -0.2, 0.62, 0.22, Math.PI / 2), 0.15, 0.15, 0.17));
    const m = new THREE.Mesh(mergeGeometries(parts)!, this.mats.metal);
    m.castShadow = true;
    g.add(m);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), this.beaconMat);
    b.name = 'beacon';
    b.position.set(-0.2, 0.62, 0.4);
    g.add(b);
    g.position.set(r.x, h + 0.05, r.z);
    g.rotation.set(0.2, 0.7, 0.15);
    g.name = 'recorder';
    return g;
  }

  /** the name and port of registry, painted on the stern transom */
  private buildPlate(): THREE.Mesh {
    const tex = textTexture([['ORIEL BAY', 92], ['KESTREL', 54]], 512, 256, '#3a3f45', '#e8e4da');
    const mat = patchOceanMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.1 }), 'plate');
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), mat);
    const p = SITES.plate;
    m.position.set(p.x, seabedHeight(SITES.wreck.x, SITES.wreck.z) + 7.5, p.z);
    m.rotation.y = (-SITES.wreck.yaw * Math.PI) / 180;
    m.name = 'plate';
    return m;
  }

  // ---------------------------------------------------------------- the mooring K3
  /** anchor, release, line, glass floats, top float with pinger and tag, and the container at the foot */
  private buildK3(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'k3';
    const { x, z, ground, floatY, floatR } = K3;
    const metal: THREE.BufferGeometry[] = [];
    const painted: THREE.BufferGeometry[] = [];
    // the anchor: three scrap railway wheels stacked on the mud, with a chain to the release
    for (let i = 0; i < 3; i++) {
      const y = ground + 0.07 + i * 0.14;
      metal.push(weather(cyl(0.46, 0.46, 0.12, 20, x, y, z), [0.3, 0.2, 0.14]));
      metal.push(weather(cyl(0.5, 0.5, 0.03, 20, x, y - 0.045, z), [0.28, 0.18, 0.12]));
    }
    for (let i = 0; i < 6; i++) {
      const l = new THREE.TorusGeometry(0.07, 0.018, 4, 8);
      l.rotateY(i % 2 ? Math.PI / 2 : 0);
      l.translate(x, ground + 0.5 + i * 0.12, z);
      metal.push(weather(l, [0.25, 0.18, 0.13]));
    }
    // the acoustic release: the lab sends it a coded ping and it lets go of the anchor
    painted.push(paint(cyl(0.09, 0.09, 0.95, 14, x, ground + 1.75, z), 0.92, 0.9, 0.86));
    painted.push(paint(cyl(0.1, 0.1, 0.12, 14, x, ground + 2.2, z), 0.95, 0.75, 0.1));
    // the line (jacketed wire, yellow), anchor to float
    const y0 = ground + 2.3, y1 = floatY - 0.95;
    painted.push(paint(cyl(0.012, 0.012, y1 - y0, 6, x, (y0 + y1) / 2, z), 0.85, 0.7, 0.15));
    // glass flotation spheres in yellow hard hats, strung in fours on the line
    for (const yc of [ground + 6, ground + 24, floatY - 14]) {
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.SphereGeometry(0.22, 14, 10);
        sp.translate(x + (k % 2 ? 0.24 : -0.24), yc + k * 0.5, z);
        painted.push(paint(sp, 0.96, 0.78, 0.08));
      }
    }
    // the top float (syntactic foam) with its steel band and a frame underneath
    const fl = new THREE.SphereGeometry(floatR, 24, 16);
    fl.translate(x, floatY, z);
    painted.push(paint(fl, 0.95, 0.5, 0.08, 0.04));
    const band = new THREE.TorusGeometry(floatR + 0.01, 0.035, 6, 28);
    band.rotateX(Math.PI / 2);
    band.translate(x, floatY, z);
    metal.push(paint(band, 0.55, 0.56, 0.58));
    for (const dx of [-0.42, 0.42]) metal.push(paint(box(0.05, 0.9, 0.05, x + dx, floatY - 0.7, z), 0.55, 0.56, 0.58));
    metal.push(paint(box(0.9, 0.05, 0.05, x, floatY - 1.15, z), 0.55, 0.56, 0.58));
    // the tag's backing plate on the frame
    metal.push(paint(box(0.56, 0.3, 0.02, K3.tag.x, K3.tag.y, K3.tag.z + 0.02), 0.55, 0.56, 0.58));
    // the relocation pinger hanging under the float
    metal.push(paint(cyl(0.055, 0.055, 0.38, 12, x - 0.2, K3.pingerY, z), 0.08, 0.08, 0.09));
    // the container across the line at the foot, settled into the mud and rusting at the corners
    const c = K3.container;
    const cg = new THREE.BoxGeometry(c.hx * 2, c.hy * 2, c.hz * 2, 2, 2, 12);
    const cp = cg.attributes.position;
    // corrugated sides
    for (let i = 0; i < cp.count; i++) if (Math.abs(Math.abs(cp.getX(i)) - c.hx) < 1e-3) cp.setX(i, cp.getX(i) + Math.sin(cp.getZ(i) * 9) * 0.03);
    cg.rotateZ(0.09);
    cg.rotateY((-c.yaw * Math.PI) / 180);
    cg.translate(c.x, c.y - 0.25, c.z);
    metal.push(weather(cg, [0.16, 0.3, 0.42]));
    const gm = new THREE.Mesh(mergeGeometries(metal.map((p) => (p.index ? p.toNonIndexed() : p)))!, this.mats.metal);
    gm.castShadow = true;
    const gp = new THREE.Mesh(mergeGeometries(painted.map((p) => (p.index ? p.toNonIndexed() : p)))!, this.mats.painted);
    gp.castShadow = true;
    g.add(gm, gp);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), this.k3TagMat);
    tag.position.set(K3.tag.x, K3.tag.y, K3.tag.z);
    // (a plane faces +z: turned to face south, toward -z)
    tag.rotation.y = Math.PI;
    tag.name = 'k3-tag';
    g.add(tag);
    return g;
  }

  /** the hydrophone recorder clamped to the line: a grey pressure housing, its hydrophone at the bottom */
  private buildK3Hydrophone(): THREE.Group {
    const g = new THREE.Group();
    const parts: THREE.BufferGeometry[] = [];
    parts.push(paint(cyl(0.085, 0.085, 0.62, 16, 0, 0, 0), 0.6, 0.62, 0.64));
    parts.push(paint(cyl(0.09, 0.09, 0.06, 16, 0, 0.33, 0), 0.15, 0.15, 0.17));
    const hp = new THREE.SphereGeometry(0.05, 10, 8);
    hp.translate(0, -0.36, 0);
    parts.push(paint(hp, 0.1, 0.1, 0.12));
    for (const y of [-0.18, 0.18]) {
      const cl = new THREE.TorusGeometry(0.095, 0.015, 4, 14);
      cl.rotateX(Math.PI / 2);
      cl.translate(0, y, 0);
      parts.push(paint(cl, 0.7, 0.7, 0.72));
    }
    const m = new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!, this.mats.metal);
    m.castShadow = true;
    g.add(m);
    g.position.set(K3.hydrophone.x, K3.hydrophone.y, K3.hydrophone.z);
    g.name = 'k3-hydrophone';
    return g;
  }

  /** where K3's tag is (for the scanner) */
  k3TagWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(K3.tag.x, K3.tag.y, K3.tag.z);
  }

  /** put the hydrophone recorder back on the line (a restarted follow-up) */
  resetK3Hydrophone(): void {
    if (this.k3Hydrophone.parent !== this.group) this.group.add(this.k3Hydrophone);
    this.k3Hydrophone.position.copy(this.k3HydrophoneHome.position);
    this.k3Hydrophone.quaternion.copy(this.k3HydrophoneHome.quaternion);
    this.k3Hydrophone.scale.set(1, 1, 1);
  }

  /** where the plate is (for the scanner and the camera) */
  plateWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.plate.position);
  }

  /** distance-driven work: the wreck's detail in and out, decor visibility, blinking lights */
  update(camX: number, camZ: number, t: number, dt: number): void {
    const dw = Math.hypot(camX - SITES.wreck.x, camZ - SITES.wreck.z);
    if (dw < 520 && !this.wreckNear) {
      this.wreckNear = this.buildWreckNear();
      this.group.add(this.wreckNear);
      this.stats.wreckBuilds++;
    } else if (dw > 760 && this.wreckNear) {
      this.group.remove(this.wreckNear);
      this.wreckNear.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
      });
      this.wreckNear = null;
      this.stats.wreckDisposals++;
    }
    this.stats.wreckDetail = !!this.wreckNear;
    this.wreckFar.visible = !this.wreckNear && dw < 2200;
    if (this.reef) this.reef.visible = Math.hypot(camX - SITES.reef.x, camZ - SITES.reef.z) < 1100;
    if (this.kelp) this.kelp.visible = Math.hypot(camX + 560, camZ - 330) < 900;
    this.k3.visible = Math.hypot(camX - K3.x, camZ - K3.z) < 900;
    if (this.k3Hydrophone.parent === this.group) this.k3Hydrophone.visible = this.k3.visible && this.k3HydrophoneShown;
    this.kelpTime.value = t;
    for (const l of this.lights) l.mesh.visible = (t + l.phase) % l.period < 0.6;
    void dt;
  }

  /** put the recorder back where it lies (a restarted expedition) */
  resetRecorder(): void {
    if (this.recorder.parent !== this.group) this.group.add(this.recorder);
    this.recorder.position.copy(this.recorderHome.position);
    this.recorder.quaternion.copy(this.recorderHome.quaternion);
    this.recorder.scale.set(1, 1, 1);
  }

  /** the beacon flashes with each pulse it sends */
  flashBeacon(on: boolean): void {
    this.beacon.visible = on;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const mat of Object.values(this.mats)) mat.dispose();
    this.kelpMat?.dispose();
    this.beaconMat.dispose();
    this.k3TagMat.map?.dispose();
    this.k3TagMat.dispose();
    const pm = this.plate.material as THREE.MeshStandardMaterial;
    pm.map?.dispose();
    pm.dispose();
  }
}
