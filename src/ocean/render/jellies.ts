// Jellyfish in the open water round the camera: moon jellies (translucent
// bells a hand or two across, four pink gonad rings, a short fringe of
// tentacles) drifting in loose aggregations over the shelf, and in the dark
// water of the basin helmet jellies, deep red (black at any distance, since the
// water takes the red away first). The bells pulse in the vertex shader, a quick
// contraction and a slow relaxation, and the tentacles trail and sway after
// them. Placed by a hash of 32 m cells, the same in every dive; instanced.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seabedHeight } from '../world/geo';
import { patchOceanMaterial } from './oceanMaterial';
import { rng } from './seabedLife';

const CELL = 32;
// (past this a bell is a few pixels, and the water has taken most of it anyway)
const RANGE = 50;

/** the bell (a dome, open below) and its fringe; aPart: 0 bell, 1 tentacle (with how far down it is), 2 gonads */
function jellyGeometry(tentacles: number, tentLen: number, gonads: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bell = new THREE.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
  bell.scale(1, 0.55, 1);
  parts.push(tag(bell.toNonIndexed(), 0));
  if (gonads) {
    // four horseshoes seen through the bell
    for (let i = 0; i < 4; i++) {
      const t = new THREE.TorusGeometry(0.075, 0.018, 3, 6, Math.PI * 1.6);
      t.rotateX(Math.PI / 2);
      t.rotateY((i * Math.PI) / 2);
      t.translate(Math.cos((i * Math.PI) / 2) * 0.13, 0.12, Math.sin((i * Math.PI) / 2) * 0.13);
      parts.push(tag(t.toNonIndexed(), 2));
    }
  }
  for (let i = 0; i < tentacles; i++) {
    const a = (i / tentacles) * Math.PI * 2;
    const p = new THREE.PlaneGeometry(0.012, tentLen, 1, 4);
    p.translate(0, -tentLen / 2, 0);
    p.rotateY(-a);
    p.translate(Math.cos(a) * 0.46, 0.2, Math.sin(a) * 0.46);
    const g = p.toNonIndexed();
    // (how far down each vertex is, for the trailing sway)
    const pos = g.attributes.position;
    const down = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) down[k] = Math.max(0, (0.2 - pos.getY(k)) / tentLen);
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(pos.count).fill(1), 1));
    g.setAttribute('aDown', new THREE.BufferAttribute(down, 1));
    g.deleteAttribute('uv');
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

function tag(g: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  g.setAttribute('aDown', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.deleteAttribute('uv');
  return g;
}

const VERT_PARS = /* glsl */ `
attribute float aPart;
attribute float aDown;
uniform float uJT;
uniform vec3 uJCam;
varying float vPart;
`;
const VERT_MOVE = /* glsl */ `
{
  vPart = aPart;
  vec3 lc = ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xyz;
  float ph = lc.x * 0.37 + lc.z * 0.29;
  // the stroke: a quick contraction, a slow relaxation (about one a second)
  float c = fract( uJT * 0.85 + ph );
  float stroke = c < 0.3 ? smoothstep( 0.0, 0.3, c ) : 1.0 - smoothstep( 0.3, 1.0, c );
  if ( aPart < 0.5 || aPart > 1.5 ) {
    // the bell narrows and deepens as it contracts
    float rim = clamp( 1.0 - transformed.y / 0.28, 0.0, 1.0 );
    transformed.xz *= 1.0 - 0.2 * stroke * rim;
    transformed.y += 0.05 * stroke * rim;
  } else {
    // tentacles trail the stroke and sway, more toward their ends
    float lag = sin( uJT * 5.3 - aDown * 3.0 + ph ) * 0.06 + stroke * 0.05;
    transformed.x += lag * aDown * ( 0.5 + 0.5 * sin( ph * 3.1 ) );
    transformed.z += sin( uJT * 1.7 + aDown * 2.0 + ph ) * 0.08 * aDown;
    transformed.xz *= 1.0 - 0.15 * stroke * ( 1.0 - aDown );
  }
  // a slow bob
  transformed.y += sin( uJT * 0.4 + ph ) * 0.3 / max( length( instanceMatrix[ 0 ].xyz ), 1e-3 );
  transformed *= 1.0 - smoothstep( ${(RANGE * 0.7).toFixed(1)}, ${RANGE.toFixed(1)}, length( lc - uJCam ) );
}
`;

interface Species {
  name: string;
  geo: THREE.BufferGeometry;
  /** jellies in a 32 m cell at this depth over this bottom (aggregations from `swarm`) */
  per: (depth: number, bottom: number, swarm: number) => number;
  size: [number, number];
  /** colours: bell, tentacles, gonads (linear) */
  bell: [number, number, number];
  tent: [number, number, number];
  gonad: [number, number, number];
  opacity: number;
  cap: number;
}

export class Jellies {
  readonly group = new THREE.Group();
  private species: Species[];
  private meshes: THREE.InstancedMesh[] = [];
  private mats: THREE.MeshLambertMaterial[] = [];
  private cells = new Map<string, { ci: number; cj: number; m: Float32Array[]; n: number[] }>();
  private camCell = '';
  private dirty = true;
  private density = 1;
  private time = { value: 0 };
  private cam = { value: new THREE.Vector3() };

  constructor(density: number) {
    this.group.name = 'jellies';
    this.species = [
      {
        name: 'moon',
        geo: jellyGeometry(18, 0.18, true),
        // in the upper water over the shelf, in drifting aggregations (thick in their cores, a few strays round them)
        per: (d, b, swarm) => (b < 80 && d > 1.5 && d < Math.min(30, b - 2) ? 40 * swarm * swarm : 0),
        size: [0.22, 0.4],
        bell: [0.85, 0.88, 0.95],
        tent: [0.9, 0.9, 0.95],
        gonad: [0.95, 0.55, 0.75],
        opacity: 0.42,
        cap: 520,
      },
      {
        name: 'helmet',
        geo: (() => {
          // a tall, deep-red dome with stiff tentacles held out
          const g = jellyGeometry(12, 0.28, false);
          g.scale(1, 1.6, 1);
          return g;
        })(),
        per: (d, b) => (b > 150 && d > 120 && d < b - 4 ? 1.6 : 0),
        size: [0.14, 0.22],
        bell: [0.5, 0.06, 0.1],
        tent: [0.45, 0.08, 0.12],
        gonad: [0.5, 0.06, 0.1],
        opacity: 0.8,
        cap: 90,
      },
    ];
    for (const s of this.species) {
      const m = patchOceanMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: s.opacity, depthWrite: false, side: THREE.DoubleSide }), 'jelly-' + s.name);
      const base = m.onBeforeCompile;
      const cols = { bell: new THREE.Vector3(...s.bell), tent: new THREE.Vector3(...s.tent), gonad: new THREE.Vector3(...s.gonad) };
      m.onBeforeCompile = (sh, r) => {
        base(sh, r);
        sh.uniforms.uJT = this.time;
        sh.uniforms.uJCam = this.cam;
        sh.uniforms.uJBell = { value: cols.bell };
        sh.uniforms.uJTent = { value: cols.tent };
        sh.uniforms.uJGonad = { value: cols.gonad };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MOVE);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vPart;\nuniform vec3 uJBell, uJTent, uJGonad;')
          // the bell is clearest at its middle and shows its edge (seen edge-on, there is more of it to look through)
          // the tissue scatters the daylight coming down through it: seen from below, a bell glows against the water
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif ( vPart < 1.5 ) totalEmissiveRadiance += diffuseColor.rgb * uSunCol * ocDaylight() * ( 0.05 + 0.3 * smoothstep( -0.2, 0.8, normalize( vOcWorld - cameraPosition ).y ) );')
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vPart < 0.5 ? uJBell : vPart < 1.5 ? uJTent : uJGonad;\nif ( vPart < 0.5 ) diffuseColor.a *= 0.55 + 0.45 * ( 1.0 - abs( dot( normalize( vViewPosition ), vNormal ) ) );\nif ( vPart > 1.5 ) diffuseColor.a = min( 1.0, diffuseColor.a * 1.8 );');
      };
      m.customProgramCacheKey = () => 'ocean-jelly-1-' + s.name;
      const mesh = new THREE.InstancedMesh(s.geo, m, s.cap);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      mesh.name = 'jelly-' + s.name;
      this.mats.push(m);
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.density = density;
  }

  setDensity(d: number): void {
    if (d === this.density) return;
    this.density = d;
    this.cells.clear();
    this.dirty = true;
  }

  update(x: number, y: number, z: number, t: number): void {
    this.time.value = t;
    this.cam.value.set(x, y, z);
    this.group.visible = y < 1 && this.density > 0;
    if (!this.group.visible) return;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    const n = Math.ceil(RANGE / CELL);
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const k = `${ci + i}:${cj + j}`;
      if (!this.cells.has(k) && Math.hypot(i, j) * CELL <= RANGE + CELL) {
        this.cells.set(k, this.buildCell(ci + i, cj + j));
        this.dirty = true;
      }
    }
    for (const [k, c] of this.cells) if (Math.hypot(c.ci - ci, c.cj - cj) * CELL > RANGE + CELL * 2) {
      this.cells.delete(k);
      this.dirty = true;
    }
    const key = `${ci}:${cj}`;
    if (key !== this.camCell) {
      this.camCell = key;
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const cells = [...this.cells.values()].sort((a, b) => Math.hypot(a.ci - ci, a.cj - cj) - Math.hypot(b.ci - ci, b.cj - cj));
    this.species.forEach((s, si) => {
      const mesh = this.meshes[si];
      const arr = mesh.instanceMatrix.array as Float32Array;
      // (the nearest first, up to what the preset allows)
      const cap = Math.floor(s.cap * Math.max(0.3, this.density));
      let cnt = 0;
      for (const c of cells) {
        if (cnt >= cap) break;
        const take = Math.min(c.n[si], cap - cnt);
        if (take <= 0) continue;
        arr.set(c.m[si].subarray(0, take * 16), cnt * 16);
        cnt += take;
      }
      mesh.count = cnt;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  private buildCell(i: number, j: number): { ci: number; cj: number; m: Float32Array[]; n: number[] } {
    const r = rng(i * 92821 + j * 68917 + 3);
    const x0 = i * CELL, z0 = j * CELL;
    const bottom = -seabedHeight(x0 + CELL / 2, z0 + CELL / 2);
    // moon jellies gather where the currents bring them: patches a few hundred metres across
    const swarm = Math.max(0, Math.sin(x0 * 0.007 + 0.4) * Math.sin(z0 * 0.006 + 1.1) * 1.6 - 0.3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p = new THREE.Vector3();
    const m: Float32Array[] = [], n: number[] = [];
    for (const sp of this.species) {
      // (sampled at a few depths through the water column)
      let want = 0;
      for (const d of [5, 15, 25, 60, 150, 250, 320]) want += sp.per(d, bottom, swarm) / 7;
      want *= this.density;
      const cnt = Math.floor(want) + (r() < want - Math.floor(want) ? 1 : 0);
      const arr = new Float32Array(cnt * 16);
      let w = 0;
      for (let k = 0; k < cnt; k++) {
        const x = x0 + r() * CELL, z = z0 + r() * CELL;
        const b = -seabedHeight(x, z);
        // a depth this species lives at, over this bottom
        let d = 0;
        for (let tries = 0; tries < 6; tries++) {
          const c = 1 + r() * Math.max(1, b - 2);
          if (sp.per(c, b, 1) > 0) {
            d = c;
            break;
          }
        }
        if (!d) continue;
        const sz = sp.size[0] + r() * (sp.size[1] - sp.size[0]);
        e.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5);
        q.setFromEuler(e);
        p.set(x, -d, z);
        s3.set(sz, sz, sz);
        m4.compose(p, q, s3);
        m4.toArray(arr, w * 16);
        w++;
      }
      m.push(arr);
      n.push(w);
    }
    return { ci: i, cj: j, m, n };
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    for (const m of this.mats) m.dispose();
  }
}
