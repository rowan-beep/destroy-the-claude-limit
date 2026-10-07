// The airshow's grounds on the crowd side of the runway: the crowd barrier along the
// display line, the spectators behind it (a few hundred, standing, sitting, kids on
// shoulders...), the marquees and the commentary stand, and a short fence with a
// handful of spotters at each of the other photo spots. Everything is instanced: a
// few draw calls for the whole crowd.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AirfieldDef } from '../world/islands';
import { surfaceHeight } from '../world/terrain';
import { CROWD_Z } from './airshow';

/** where the crowd barrier runs (runway-local, metres across from the centreline) */
export const BARRIER_Z = CROWD_Z + 4;

/** a spot to shoot from, beyond the crowd line: its own little fence and spotters */
export interface SpotFence {
  along: number;
  across: number;
  /** the way the fence faces (runway-local heading, rad: 0 = +along) */
  face: number;
  len: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function colorGeo(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** one standing person (about 1.75 m): the shirt (takes the shirt colour) and the rest (takes the skin colour) */
function personGeos(): { shirt: THREE.BufferGeometry; rest: THREE.BufferGeometry } {
  const parts = (list: THREE.BufferGeometry[]) => list.map((g) => g.toNonIndexed());
  // a tapered, slightly flattened torso and two arms hanging a little out from it
  const torso = new THREE.CylinderGeometry(0.2, 0.165, 0.6, 6).scale(1, 1, 0.62).translate(0, 1.2, 0);
  const armL = new THREE.CylinderGeometry(0.055, 0.045, 0.62, 5, 1, true).rotateZ(0.08).translate(-0.25, 1.17, 0);
  const armR = new THREE.CylinderGeometry(0.055, 0.045, 0.62, 5, 1, true).rotateZ(-0.08).translate(0.25, 1.17, 0);
  const shirt = mergeGeometries(parts([torso, armL, armR]))!;
  const white = new THREE.Color(1, 1, 1);
  const jeans = new THREE.Color(0.3, 0.33, 0.42);
  const hair = new THREE.Color(0.32, 0.22, 0.16);
  const legs = [-0.095, 0.095].map((x) => colorGeo(new THREE.CylinderGeometry(0.08, 0.065, 0.9, 5, 1, true).translate(x, 0.45, 0).toNonIndexed(), jeans));
  const hips = colorGeo(new THREE.CylinderGeometry(0.17, 0.16, 0.14, 6).scale(1, 1, 0.65).translate(0, 0.88, 0).toNonIndexed(), jeans);
  const head = colorGeo(new THREE.SphereGeometry(0.105, 7, 5).scale(0.92, 1.1, 1).translate(0, 1.66, 0).toNonIndexed(), white);
  const cap = colorGeo(new THREE.SphereGeometry(0.112, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.45).scale(0.95, 1.1, 1.02).translate(0, 1.67, -0.01).toNonIndexed(), hair);
  const neck = colorGeo(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 5, 1, true).translate(0, 1.53, 0).toNonIndexed(), white);
  const hands = [-0.27, 0.27].map((x) => colorGeo(new THREE.BoxGeometry(0.07, 0.09, 0.07).translate(x, 0.84, 0).toNonIndexed(), white));
  const rest = mergeGeometries([...legs, hips, head, cap, neck, ...hands])!;
  for (const g of [shirt, rest]) {
    g.deleteAttribute('uv');
    g.computeVertexNormals();
  }
  colorGeo(shirt, white);
  return { shirt, rest };
}

/** a person far off: three boxes */
function farPersonGeos(): { shirt: THREE.BufferGeometry; rest: THREE.BufferGeometry } {
  const shirt = colorGeo(new THREE.BoxGeometry(0.46, 0.62, 0.26).translate(0, 1.2, 0).toNonIndexed(), new THREE.Color(1, 1, 1));
  const legs = colorGeo(new THREE.BoxGeometry(0.34, 0.9, 0.2).translate(0, 0.45, 0).toNonIndexed(), new THREE.Color(0.3, 0.33, 0.42));
  const head = colorGeo(new THREE.BoxGeometry(0.2, 0.24, 0.2).translate(0, 1.66, 0).toNonIndexed(), new THREE.Color(1, 1, 1));
  const rest = mergeGeometries([legs, head])!;
  for (const g of [shirt, rest]) g.deleteAttribute('uv');
  return { shirt, rest };
}

const SHIRTS = [0xc8302c, 0x2b5fb3, 0xe7e2d6, 0x1f2328, 0x3f7a3a, 0xe0a52a, 0x7b4a9a, 0x2d8fa8, 0xd86a2b, 0x8a8f96, 0xf0f0ee, 0x2a3f6b, 0xb8324f, 0x6c7a3c];
const SKINS = [0xf1c8a8, 0xd9a47e, 0xa8714a, 0x6e4529, 0xe8b894, 0xc68a5e];

export class AirshowScene {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private steelMat: THREE.MeshLambertMaterial | null = null;
  private meshMat: THREE.MeshLambertMaterial | null = null;

  constructor(
    readonly f: AirfieldDef,
    /** where along the runway the crowd stands (the show centre) */
    centre: number,
    /** the camera's spot on the crowd line, kept clear of heads */
    eyeAlong: number,
    fences: SpotFence[],
    /** the photo spots (runway-local along, across): people near them get the detailed figure */
    private spotsAt: [number, number][] = [],
  ) {
    const g = this.group;
    g.name = 'airshow-grounds';
    g.position.set(f.x, 0, f.z);
    g.rotation.y = (-f.heading * Math.PI) / 180;
    const people: { a: number; c: number; s: number; rot: number }[] = [];
    // ---- the crowd barrier: 2.5 m sections of steel fence
    const from = centre - 1100, to = centre + 800;
    this.barrier(from, to, BARRIER_Z, 0);
    // ---- the crowd: thick at show centre, thinning toward the ends
    for (let i = 0; i < 1150; i++) {
      const a = centre + (Math.random() < 0.65 ? rand(-380, 380) : rand(from - centre + 20, to - centre - 20));
      // (packed at the barrier, thinning out behind; nobody right in front of the camera)
      const back = Math.pow(Math.random(), 2.6) * 30;
      const c = BARRIER_Z - 1.6 - back;
      if (Math.abs(a - eyeAlong) < 4 && c > CROWD_Z - 3) continue;
      const kid = Math.random() < 0.12;
      people.push({ a, c, s: kid ? rand(0.6, 0.75) : rand(0.93, 1.08), rot: rand(-0.6, 0.6) });
    }
    // ---- the marquees, the commentary stand, the food vans: behind the crowd
    const tents: [number, number, number, number][] = [];
    for (const da of [-760, -610, -470, 330, 470, 610]) tents.push([centre + da, BARRIER_Z - 58, rand(14, 22), rand(9, 12)]);
    this.tents(tents);
    this.stand(centre + 160, BARRIER_Z - 44);
    // ---- the other spots: a short fence each, and the regulars who stand there
    for (const s of fences) {
      const n = Math.max(1, Math.round(s.len / 2.5));
      const ca = Math.cos(s.face), sa = Math.sin(s.face);
      // (the fence runs square to the way it faces)
      const ra = -sa, rc = ca;
      this.barrierLine(s.along - (ra * s.len) / 2, s.across - (rc * s.len) / 2, ra, rc, n);
      for (let i = 0; i < 14; i++) {
        const u = rand(-s.len / 2, s.len / 2);
        const back = rand(1.5, 6);
        const a = s.along + ra * u - ca * back;
        const c = s.across + rc * u - sa * back;
        if (Math.abs(u) < 4) continue;
        people.push({ a, c, s: rand(0.95, 1.06), rot: s.face - Math.PI / 2 + rand(-0.5, 0.5) });
      }
    }
    this.crowd(people);
  }

  /** more people (the static park's visitors): runway-local positions, facing `rot` (0 = toward the runway) */
  addPeople(list: { a: number; c: number; rot: number }[]): void {
    this.crowd(list.map((o) => ({ ...o, s: Math.random() < 0.1 ? rand(0.6, 0.75) : rand(0.93, 1.08) })));
  }

  private y(along: number, across: number): number {
    const f = this.f;
    return surfaceHeight(f.x + f.ax * along + f.rxv * across, f.z + f.az * along + f.rzv * across);
  }

  /** a fence along the runway at `across`, from `a0` to `a1` */
  private barrier(a0: number, a1: number, across: number, _face: number): void {
    // (in 200 m runs, so the ones out of view are skipped)
    for (let a = a0; a < a1 - 1; a += 200) this.barrierLine(a, across, 1, 0, Math.round((Math.min(a1, a + 200) - a) / 2.5));
  }

  /** `n` fence sections from (along, across) stepping (da, dc) per metre */
  private barrierLine(a0: number, c0: number, da: number, dc: number, n: number): void {
    // one section: two posts, two rails, a mesh panel
    const post = new THREE.BoxGeometry(0.06, 1.1, 0.06);
    const p1 = post.clone().translate(-1.22, 0.55, 0);
    const p2 = post.clone().translate(1.22, 0.55, 0);
    const r1 = new THREE.BoxGeometry(2.5, 0.05, 0.05).translate(0, 1.08, 0);
    const r2 = new THREE.BoxGeometry(2.5, 0.05, 0.05).translate(0, 0.12, 0);
    const panel = new THREE.BoxGeometry(2.44, 0.92, 0.012).translate(0, 0.6, 0);
    const steel = mergeGeometries([p1, p2, r1, r2])!;
    const steelMat = (this.steelMat ??= new THREE.MeshLambertMaterial({ color: 0x9aa2aa }));
    const meshMat = (this.meshMat ??= new THREE.MeshLambertMaterial({ color: 0xb8bec4, transparent: true, opacity: 0.35, depthWrite: false }));
    const im = new THREE.InstancedMesh(steel, steelMat, n);
    const ip = new THREE.InstancedMesh(panel, meshMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    // (group frame: x = across, z = -along)
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(da, dc));
    for (let i = 0; i < n; i++) {
      const a = a0 + da * (i + 0.5) * 2.5, c = c0 + dc * (i + 0.5) * 2.5;
      p.set(c, this.y(a, c), -a);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
      ip.setMatrixAt(i, m);
    }
    for (const x of [im, ip]) {
      x.computeBoundingSphere();
      x.castShadow = false;
      x.receiveShadow = true;
      this.group.add(x);
    }
    this.disposables.push(steel, panel, post, p1, p2, r1, r2);
  }

  /** people near a photo spot get the detailed figure, the rest three boxes */
  private crowd(list: { a: number; c: number; s: number; rot: number }[]): void {
    // (in 200 m blocks along the runway, so the ones out of view are skipped)
    const geos = [farPersonGeos(), personGeos()];
    const blocks = new Map<string, { list: typeof list; lod: number }>();
    for (const o of list) {
      const lod = this.nearSpot(o.a, o.c) ? 1 : 0;
      const k = `${Math.floor(o.a / 200)}:${lod}`;
      let b = blocks.get(k);
      if (!b) blocks.set(k, (b = { list: [], lod }));
      b.list.push(o);
    }
    for (const b of blocks.values()) this.crowdMesh(b.list, geos[b.lod]);
    for (const g of geos) this.disposables.push(g.shirt, g.rest);
  }

  /** within sight of a spot the camera stands at */
  private nearSpot(a: number, c: number): boolean {
    for (const [sa, sc] of this.spotsAt) if (Math.hypot(a - sa, c - sc) < 110) return true;
    return false;
  }

  private crowdMesh(list: { a: number; c: number; s: number; rot: number }[], geos: { shirt: THREE.BufferGeometry; rest: THREE.BufferGeometry }): void {
    const { shirt, rest } = geos;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const bodies = new THREE.InstancedMesh(shirt, mat, list.length);
    const others = new THREE.InstancedMesh(rest, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    list.forEach((o, i) => {
      // (facing the runway, +x in the group frame, give or take)
      q.setFromAxisAngle(up, -Math.PI / 2 + o.rot);
      s.set(o.s, o.s * rand(0.97, 1.05), o.s);
      p.set(o.c, this.y(o.a, o.c), -o.a);
      m.compose(p, q, s);
      bodies.setMatrixAt(i, m);
      others.setMatrixAt(i, m);
      bodies.setColorAt(i, col.setHex(SHIRTS[Math.floor(Math.random() * SHIRTS.length)]).multiplyScalar(rand(0.8, 1.1)));
      others.setColorAt(i, col.setHex(SKINS[Math.floor(Math.random() * SKINS.length)]));
    });
    for (const x of [bodies, others]) {
      if (x.instanceColor) x.instanceColor.needsUpdate = true;
      x.computeBoundingSphere();
      x.castShadow = false;
      x.receiveShadow = true;
      this.group.add(x);
    }
    this.disposables.push(mat);
  }

  private tents(list: [number, number, number, number][]): void {
    const walls: THREE.BufferGeometry[] = [];
    const roofs: THREE.BufferGeometry[] = [];
    for (const [a, c, w, d] of list) {
      const y = this.y(a, c);
      walls.push(new THREE.BoxGeometry(d, 2.6, w).translate(c, y + 1.3, -a).toNonIndexed());
      // a peaked roof: a four-sided pyramid stretched over the walls
      const r = new THREE.ConeGeometry(1, 1, 4, 1, false);
      r.rotateY(Math.PI / 4);
      r.scale(d * 0.72, 2.4, w * 0.72);
      r.translate(c, y + 2.6 + 1.2, -a);
      roofs.push(r.toNonIndexed());
    }
    const wg = mergeGeometries(walls.map((g) => (g.deleteAttribute('uv'), g)))!;
    const rg = mergeGeometries(roofs.map((g) => (g.deleteAttribute('uv'), g)))!;
    const wm = new THREE.MeshLambertMaterial({ color: 0xf2f1ec });
    const rm = new THREE.MeshLambertMaterial({ color: 0xfafaf7 });
    const wmesh = new THREE.Mesh(wg, wm);
    const rmesh = new THREE.Mesh(rg, rm);
    for (const x of [wmesh, rmesh]) {
      x.castShadow = true;
      x.receiveShadow = true;
      this.group.add(x);
    }
    this.disposables.push(wg, rg, wm, rm);
  }

  /** the commentary stand: a scaffold box with a roof and a banner */
  private stand(a: number, c: number): void {
    const y = this.y(a, c);
    const base = new THREE.BoxGeometry(5, 4, 10).translate(c, y + 2, -a);
    const cab = new THREE.BoxGeometry(4.6, 2.4, 9.4).translate(c, y + 5.2, -a);
    const roof = new THREE.BoxGeometry(5.6, 0.25, 10.6).translate(c, y + 6.5, -a);
    const g = mergeGeometries([base, cab, roof])!;
    const mat = new THREE.MeshLambertMaterial({ color: 0x31363d });
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    this.group.add(mesh);
    const banner = new THREE.PlaneGeometry(9.4, 1.2);
    banner.rotateY(Math.PI / 2);
    banner.translate(c + 2.62, y + 3.6, -a);
    const bmat = new THREE.MeshLambertMaterial({ color: 0xe0a52a, side: THREE.DoubleSide });
    this.group.add(new THREE.Mesh(banner, bmat));
    this.disposables.push(g, mat, banner, bmat);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.steelMat?.dispose();
    this.meshMat?.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
