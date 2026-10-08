// The built and living things of the first region: Kestrel Harbor, the
// training buoy, the reef and a kelp stand, and the wreck of the coaster ORIEL
// BAY. Each set reports how far it is from the camera; the wreck builds its
// detailed model only when the vehicle is near it, keeps a cheap silhouette in
// the middle distance, and disposes of the detailed geometry when left behind.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HARBOR, SITES, seabedHeight, wreckLocal, buildColliders } from '../world/geo';
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
  readonly plate: THREE.Mesh;
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
    this.beacon = this.recorder.getObjectByName('beacon') as THREE.Mesh;
    this.group.add(this.recorder);
    // the stern plate (always present: it is scanned)
    this.plate = this.buildPlate();
    this.group.add(this.plate);
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
    const kinds: { geo: THREE.BufferGeometry; n: number; scale: [number, number]; col: [number, number, number][] }[] = [
      { geo: new THREE.IcosahedronGeometry(1, 1), n: 220, scale: [0.6, 1.8], col: [[0.72, 0.62, 0.42], [0.6, 0.52, 0.48], [0.78, 0.7, 0.5]] }, // brain and boulder corals
      { geo: new THREE.ConeGeometry(0.4, 1.8, 6), n: 360, scale: [0.6, 1.6], col: [[0.86, 0.48, 0.42], [0.6, 0.42, 0.7], [0.9, 0.62, 0.32]] }, // branching corals
      { geo: new THREE.CylinderGeometry(1.4, 0.25, 0.35, 10), n: 120, scale: [0.6, 1.8], col: [[0.64, 0.66, 0.5], [0.58, 0.5, 0.62]] }, // table corals
      { geo: new THREE.DodecahedronGeometry(1, 0), n: 260, scale: [0.8, 3.2], col: [[0.42, 0.4, 0.37], [0.5, 0.47, 0.42]] }, // rocks
    ];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const c = new THREE.Color();
    let count = 0;
    for (const k of kinds) {
      const n = Math.round(k.n * decor);
      if (!n) continue;
      const im = new THREE.InstancedMesh(k.geo, this.mats.painted, n);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (SITES.reef.r - 10);
        const x = SITES.reef.x + Math.cos(a) * r, z = SITES.reef.z + Math.sin(a) * r;
        const h = seabedHeight(x, z);
        if (h < -34) {
          i--;
          continue;
        }
        const sc = k.scale[0] + rnd() * (k.scale[1] - k.scale[0]);
        p.set(x, h + sc * 0.3, z);
        e.set((rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4);
        q.setFromEuler(e);
        s.set(sc, sc * (0.7 + rnd() * 0.6), sc);
        m.compose(p, q, s);
        im.setMatrixAt(i, m);
        const cc = k.col[Math.floor(rnd() * k.col.length)];
        c.setRGB(srgb(cc[0]), srgb(cc[1]), srgb(cc[2]));
        im.setColorAt(i, c);
      }
      // (vertex colours: the instance colour multiplies a white base)
      paint(k.geo, 1, 1, 1, 0.08);
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      this.reef.add(im);
      count += n;
    }
    // the kelp stand west of the harbor mouth: tall fronds that sway
    const nk = Math.round(420 * decor);
    if (nk) {
      if (!this.kelpMat) {
        this.kelpMat = patchOceanMaterial(new THREE.MeshLambertMaterial({ color: 0x6b6a2a, side: THREE.DoubleSide }), 'kelp');
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
      const blade = new THREE.PlaneGeometry(0.7, 14, 1, 8);
      blade.translate(0, 7, 0);
      const im = new THREE.InstancedMesh(blade, this.kelpMat, nk);
      for (let i = 0; i < nk; i++) {
        const x = -560 + (rnd() - 0.5) * 380, z = 330 + (rnd() - 0.5) * 300;
        const h = seabedHeight(x, z);
        const sc = 0.7 + rnd() * 0.6;
        p.set(x, h, z);
        e.set(0, rnd() * 6.28, 0);
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
    this.kelpTime.value = t;
    for (const l of this.lights) l.mesh.visible = (t + l.phase) % l.period < 0.6;
    void dt;
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
    const pm = this.plate.material as THREE.MeshStandardMaterial;
    pm.map?.dispose();
    pm.dispose();
  }
}
