// Scattered trees over every island: conifers on Samos' hills, umbrella pines
// and cypresses on Capri, sparse pines and broadleaves on Skye. Tree cells
// (1 km squares) are generated in the workers; the visible set is packed
// into a few instanced meshes around a floating origin.

import * as THREE from 'three';
import { applyTerrainLight } from '../render/terrainLight';
import { WorkerPool } from './workerPool';
import { TreeResult, TREE_STRIDE } from './terrainGen';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { srgbToLinear } from '../core/math';

const CELL = 1024;
const SPACING = 30;
const KINDS = 6;
const NEAR_CAP = 60000;
const FAR_CAP = 60000;
const FAR_FRACTION = 0.4;

interface Cell {
  i: number;
  j: number;
  cx: number;
  cz: number;
  state: 'pending' | 'ready';
  data: Float32Array | null;
  count: number;
  lastUsed: number;
  cancel: (() => void) | null;
}

function colorize(geo: THREE.BufferGeometry, r: number, g: number, b: number, vary = 0.08): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const cols = new Float32Array(n * 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const k = 1 + vary * Math.sin(i * 12.9898 + y * 0.7);
    cols[i * 3] = srgbToLinear(r * k);
    cols[i * 3 + 1] = srgbToLinear(g * k);
    cols[i * 3 + 2] = srgbToLinear(b * k);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

function nonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  return ng;
}

function trunk(h: number, r: number, seg: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r * 0.7, r, h, seg, 1, true);
  g.translate(0, h / 2, 0);
  return colorize(nonIndexed(g), 0.28, 0.2, 0.14, 0.05);
}

function cone(radius: number, height: number, y: number, seg: number, c: [number, number, number]): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(radius, height, seg, 1, false);
  g.translate(0, y + height / 2, 0);
  return colorize(nonIndexed(g), c[0], c[1], c[2]);
}

function blob(radius: number, y: number, sy: number, detail: number, c: [number, number, number]): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  g.scale(1, sy, 1);
  g.translate(0, y, 0);
  return colorize(nonIndexed(g), c[0], c[1], c[2], 0.12);
}

function buildTreeGeometry(kind: number, far: boolean): THREE.BufferGeometry {
  const seg = far ? 5 : 8;
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 0) {
    // conifer / Samian pine
    parts.push(trunk(5, 0.35, far ? 4 : 6));
    const g1: [number, number, number] = [0.12, 0.2, 0.1];
    const g2: [number, number, number] = [0.14, 0.23, 0.11];
    if (far) {
      parts.push(cone(3.4, 13, 3, seg, g1));
    } else {
      parts.push(cone(3.6, 7, 3, seg, g1));
      parts.push(cone(2.9, 6.5, 6.5, seg, g2));
      parts.push(cone(2.0, 6, 10.5, seg, g1));
    }
  } else if (kind === 1) {
    // umbrella / stone pine
    parts.push(trunk(8, 0.4, far ? 4 : 6));
    parts.push(blob(5.2, 9, 0.38, far ? 0 : 1, [0.16, 0.25, 0.12]));
  } else if (kind === 2) {
    // Mediterranean cypress
    parts.push(trunk(2, 0.3, 4));
    parts.push(cone(1.4, 15, 1, seg, [0.09, 0.17, 0.09]));
    if (!far) parts.push(blob(1.5, 4, 1.6, 0, [0.1, 0.18, 0.1]));
  } else if (kind === 4) {
    // coconut palm: a slender curved trunk leaning out, a crown of long drooping fronds
    const lean = 0.18;
    const segs = far ? 2 : 4;
    let px = 0, py = 0;
    for (let i = 0; i < segs; i++) {
      const h = 13 / segs;
      const g = new THREE.CylinderGeometry(0.2, 0.26, h, far ? 4 : 6, 1, true);
      g.rotateZ(-lean * (0.4 + i / segs));
      g.translate(px + Math.sin(lean * (0.4 + i / segs)) * h * 0.5, py + h * 0.5, 0);
      parts.push(colorize(nonIndexed(g), 0.42, 0.36, 0.27, 0.06));
      px += Math.sin(lean * (0.4 + i / segs)) * h;
      py += Math.cos(lean * (0.4 + i / segs)) * h;
    }
    const fronds = far ? 6 : 10;
    for (let i = 0; i < fronds; i++) {
      const a = (i / fronds) * Math.PI * 2 + (i % 2) * 0.2;
      const len = 5.2 + (i % 3) * 0.5;
      const f = new THREE.ConeGeometry(0.75, len, 3, 1, false);
      f.scale(1, 1, 0.12);
      f.translate(0, len / 2, 0);
      // out from the crown and drooping toward the tip
      f.rotateZ(-Math.PI / 2 + 0.55 + (i % 2) * 0.25);
      f.rotateY(a);
      f.translate(px, py, 0);
      parts.push(colorize(nonIndexed(f), i % 2 ? 0.2 : 0.24, i % 2 ? 0.38 : 0.42, 0.12, 0.1));
    }
    if (!far) parts.push(blob(0.55, py - 0.5, 0.9, 0, [0.36, 0.3, 0.14]));
  } else if (kind === 5) {
    // rainforest emergent: a tall straight trunk on buttress roots, a wide flat crown
    parts.push(cone(1.6, 3.2, 0, far ? 4 : 6, [0.33, 0.28, 0.2]));
    parts.push(trunk(19, 0.55, far ? 4 : 6));
    const g1: [number, number, number] = [0.1, 0.24, 0.08];
    const g2: [number, number, number] = [0.13, 0.28, 0.1];
    if (far) parts.push(blob(6.5, 20, 0.42, 0, g1));
    else {
      parts.push(blob(5.2, 20.5, 0.45, 1, g1));
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + 0.4;
        parts.push(blob(3.6, 19.5 + (i % 2), 0.5, 0, i % 2 ? g2 : g1).translate(Math.cos(a) * 3.8, 0, Math.sin(a) * 3.8));
      }
    }
  } else {
    // broadleaf (oak / plane)
    parts.push(trunk(4.5, 0.4, far ? 4 : 6));
    parts.push(blob(3.8, 7, 0.85, far ? 0 : 1, [0.2, 0.28, 0.12]));
    if (!far) parts.push(blob(2.6, 8.8, 0.8, 0, [0.22, 0.31, 0.13]));
  }
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

export class TreeSystem {
  private cells = new Map<string, Cell>();
  private near: THREE.InstancedMesh[] = [];
  private far: THREE.InstancedMesh[] = [];
  private nearR = 2600;
  private farR = 7000;
  private origin = new THREE.Vector3();
  private dirty = true;
  private lastBuildPos = new THREE.Vector3(1e12, 0, 0);
  private lastBuildTime = 0;
  private frame = 0;
  private pendingCount = 0;
  private readonly m = new THREE.Matrix4();
  enabled = true;

  constructor(
    private pool: WorkerPool,
    scene: THREE.Scene,
  ) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    applyTerrainLight(mat);
    for (let k = 0; k < KINDS; k++) {
      const n = new THREE.InstancedMesh(buildTreeGeometry(k, false), mat, NEAR_CAP);
      const f = new THREE.InstancedMesh(buildTreeGeometry(k, true), mat, FAR_CAP);
      for (const im of [n, f]) {
        im.count = 0;
        im.frustumCulled = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.receiveShadow = true;
        im.castShadow = false;
        im.name = 'trees';
        scene.add(im);
      }
      this.near.push(n);
      this.far.push(f);
    }
  }

  setRanges(near: number, far: number): void {
    this.nearR = near;
    this.farR = far;
    this.dirty = true;
  }

  isSettled(): boolean {
    return this.pendingCount === 0;
  }

  update(cam: THREE.Vector3): void {
    this.frame++;
    const high = cam.y > 12000;
    for (const im of [...this.near, ...this.far]) im.visible = this.enabled && !high;
    if (!this.enabled || high) return;

    // Horizontal range shrinks naturally with altitude in the far ring check below.
    const ci = Math.round(cam.x / CELL);
    const cj = Math.round(cam.z / CELL);
    const rc = Math.ceil(this.farR / CELL) + 1;
    for (let dj = -rc; dj <= rc; dj++) {
      for (let di = -rc; di <= rc; di++) {
        const i = ci + di, j = cj + dj;
        const cx = i * CELL, cz = j * CELL;
        const dx = Math.max(0, Math.abs(cam.x - cx) - CELL / 2);
        const dz = Math.max(0, Math.abs(cam.z - cz) - CELL / 2);
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > this.farR) continue;
        const key = i + ',' + j;
        let c = this.cells.get(key);
        if (!c) {
          c = { i, j, cx, cz, state: 'pending', data: null, count: 0, lastUsed: this.frame, cancel: null };
          this.cells.set(key, c);
          this.pendingCount++;
          const cell = c;
          const h = this.pool.submit({ type: 'trees', cx, cz, size: CELL, spacing: SPACING }, 50 + d / CELL, (res) => {
            const r = res as TreeResult;
            cell.data = r.data;
            cell.count = r.count;
            cell.state = 'ready';
            cell.cancel = null;
            this.pendingCount--;
            this.dirty = true;
          });
          c.cancel = h.cancel;
        }
        c.lastUsed = this.frame;
      }
    }

    // evict old cells
    if (this.frame % 120 === 0) {
      for (const [k, c] of this.cells) {
        if (this.frame - c.lastUsed > 300) {
          if (c.cancel) {
            c.cancel();
            this.pendingCount--;
          }
          this.cells.delete(k);
        }
      }
    }

    const moved = cam.distanceTo(this.lastBuildPos);
    const now = performance.now();
    if ((this.dirty && now - this.lastBuildTime > 250) || moved > 220) {
      this.rebuild(cam);
      this.lastBuildTime = now;
    }
  }

  private rebuild(cam: THREE.Vector3): void {
    this.dirty = false;
    this.lastBuildPos.copy(cam);
    this.origin.set(Math.round(cam.x / 256) * 256, 0, Math.round(cam.z / 256) * 256);
    const nCount = new Array(KINDS).fill(0);
    const fCount = new Array(KINDS).fill(0);
    const near2 = this.nearR * this.nearR;
    const far2 = this.farR * this.farR;
    const e = this.m.elements;
    for (const c of this.cells.values()) {
      if (c.state !== 'ready' || !c.data || c.count === 0) continue;
      const dx = Math.max(0, Math.abs(cam.x - c.cx) - CELL / 2);
      const dz = Math.max(0, Math.abs(cam.z - c.cz) - CELL / 2);
      if (dx * dx + dz * dz > far2) continue;
      const d = c.data;
      const ox = c.cx - this.origin.x;
      const oz = c.cz - this.origin.z;
      for (let t = 0; t < c.count; t++) {
        const b = t * TREE_STRIDE;
        const x = d[b] + c.cx, z = d[b + 2] + c.cz;
        const ddx = x - cam.x, ddz = z - cam.z;
        const dd = ddx * ddx + ddz * ddz;
        if (dd > far2) continue;
        const kind = d[b + 5] | 0;
        const isNear = dd < near2;
        if (!isNear && d[b + 6] > FAR_FRACTION) continue;
        const im = isNear ? this.near[kind] : this.far[kind];
        const counts = isNear ? nCount : fCount;
        const idx = counts[kind];
        if (idx >= (isNear ? NEAR_CAP : FAR_CAP)) continue;
        counts[kind]++;
        const s = d[b + 3] * (isNear ? 1 : 1.15);
        const rot = d[b + 4];
        const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
        e[0] = cs; e[1] = 0; e[2] = -sn; e[3] = 0;
        e[4] = 0; e[5] = s; e[6] = 0; e[7] = 0;
        e[8] = sn; e[9] = 0; e[10] = cs; e[11] = 0;
        e[12] = d[b] + ox; e[13] = d[b + 1]; e[14] = d[b + 2] + oz; e[15] = 1;
        im.instanceMatrix.array.set(e, idx * 16);
      }
    }
    for (let k = 0; k < KINDS; k++) {
      for (const [im, cnt] of [
        [this.near[k], nCount[k]],
        [this.far[k], fCount[k]],
      ] as [THREE.InstancedMesh, number][]) {
        im.count = cnt;
        im.position.copy(this.origin);
        im.updateMatrix();
        im.instanceMatrix.clearUpdateRanges();
        im.instanceMatrix.addUpdateRange(0, cnt * 16);
        im.instanceMatrix.needsUpdate = true;
      }
    }
  }

  get stats(): { cells: number; near: number; far: number } {
    return {
      cells: this.cells.size,
      near: this.near.reduce((a, m) => a + m.count, 0),
      far: this.far.reduce((a, m) => a + m.count, 0),
    };
  }
}
