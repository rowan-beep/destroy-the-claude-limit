// A few schools of small fish where fish gather: over the reef, in the kelp,
// round the wreck and the harbor piles. Each fish circles its school's centre
// on its own radius, depth and speed, its body flexing as it swims; all of it
// is worked out in the vertex shader from per-fish numbers, so the schools cost
// nothing on the CPU from frame to frame. Fish far from the camera shrink away.

import * as THREE from 'three';
import { SITES, HARBOR, seabedHeight } from '../world/geo';
import { patchOceanMaterial, OCEAN_FX } from './oceanMaterial';

interface Habitat {
  x: number;
  z: number;
  /** height above the bottom (m) */
  above: number;
  spread: number;
  tint: [number, number, number];
}

const HABITATS: Habitat[] = [
  { x: SITES.reef.x - 40, z: SITES.reef.z - 30, above: 3, spread: 60, tint: [0.85, 0.8, 0.45] },
  { x: SITES.reef.x + 60, z: SITES.reef.z + 40, above: 4, spread: 70, tint: [0.7, 0.78, 0.86] },
  { x: SITES.reef.x - 90, z: SITES.reef.z + 110, above: 2.5, spread: 60, tint: [0.92, 0.6, 0.35] },
  { x: SITES.reef.x + 120, z: SITES.reef.z - 120, above: 5, spread: 60, tint: [0.75, 0.8, 0.85] },
  { x: -560, z: 330, above: 6, spread: 120, tint: [0.72, 0.72, 0.6] },
  { x: SITES.wreck.x, z: SITES.wreck.z, above: 9, spread: 40, tint: [0.78, 0.8, 0.82] },
  { x: HARBOR.berth.x + 30, z: HARBOR.berth.z + 20, above: 2, spread: 50, tint: [0.7, 0.74, 0.7] },
  { x: SITES.buoy.x, z: SITES.buoy.z, above: 10, spread: 30, tint: [0.78, 0.82, 0.86] },
];

const FISH_VERT = /* glsl */ `
attribute vec4 aSwim;   // radius, angular speed, phase, bob
uniform float uFishT;
uniform vec3 uFishCam;
`;
const FISH_MOVE = /* glsl */ `
{
  float a = uFishT * aSwim.y + aSwim.z;
  // the body flexes more toward the tail (+x is the tail)
  float flex = sin( uFishT * 9.0 + aSwim.z * 3.0 - transformed.x * 6.0 ) * 0.12 * smoothstep( -0.2, 0.6, transformed.x );
  transformed.z += flex;
  // face along the circle: the head (-x) points the way it swims
  float yaw = -a + ( aSwim.y > 0.0 ? 3.14159 : 0.0 );
  float c = cos( yaw ), s = sin( yaw );
  transformed = vec3( c * transformed.x + s * transformed.z, transformed.y, -s * transformed.x + c * transformed.z );
  // round the school's centre (in the instance's own units: the matrix scales by the fish's size)
  float sc = length( instanceMatrix[ 0 ].xyz );
  vec3 off = vec3( cos( a ) * aSwim.x, sin( uFishT * 0.4 + aSwim.z ) * aSwim.w, sin( a ) * aSwim.x ) / max( sc, 1e-3 );
  transformed += off;
  // fish beyond a hundred metres are too far to see: shrink them away
  vec3 centre = ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xyz;
  transformed *= 1.0 - smoothstep( 90.0, 130.0, length( centre - uFishCam ) );
}
`;

export class FishSchools {
  readonly mesh: THREE.InstancedMesh;
  private mat: THREE.MeshLambertMaterial;
  private time = { value: 0 };
  private cam = { value: new THREE.Vector3() };

  constructor(perSchool: number) {
    // a small fish: a tapered body and a forked tail, about 25 cm long
    const body = new THREE.SphereGeometry(0.5, 10, 6);
    body.scale(1, 0.32, 0.16);
    const tail = new THREE.BufferGeometry();
    tail.setAttribute('position', new THREE.Float32BufferAttribute([0.45, 0, 0, 0.8, 0.22, 0, 0.8, -0.22, 0, 0.45, 0, 0, 0.8, -0.22, 0, 0.8, 0.22, 0], 3));
    tail.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
    tail.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    const bodyN = body.toNonIndexed();
    const g = new THREE.BufferGeometry();
    const merge = (a: THREE.BufferGeometry, b: THREE.BufferGeometry, name: string, n: number) => {
      const x = a.attributes[name].array as Float32Array, y = b.attributes[name].array as Float32Array;
      const out = new Float32Array(x.length + y.length);
      out.set(x);
      out.set(y, x.length);
      g.setAttribute(name, new THREE.BufferAttribute(out, n));
    };
    merge(bodyN, tail, 'position', 3);
    merge(bodyN, tail, 'normal', 3);
    // countershading: dark back, silver belly
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const k = y > 0.04 ? 0.35 : y > -0.04 ? 0.75 : 1;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mat = patchOceanMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'fish');
    const base = this.mat.onBeforeCompile;
    this.mat.onBeforeCompile = (sh, r) => {
      base(sh, r);
      sh.uniforms.uFishT = this.time;
      sh.uniforms.uFishCam = this.cam;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + FISH_VERT).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + FISH_MOVE);
    };
    this.mat.customProgramCacheKey = () => 'ocean-fish-1';
    const n = HABITATS.length * perSchool;
    this.mesh = new THREE.InstancedMesh(g, this.mat, Math.max(1, n));
    this.mesh.count = n;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fish';
    const swim = new Float32Array(Math.max(1, n) * 4);
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    let k = 0;
    for (const h of HABITATS) {
      // each school mills round its own centre within the habitat
      const sx = h.x + (rnd() - 0.5) * h.spread, sz = h.z + (rnd() - 0.5) * h.spread;
      const sy = Math.min(-2, seabedHeight(sx, sz) + h.above);
      const dir = rnd() < 0.5 ? 1 : -1;
      for (let i = 0; i < perSchool; i++, k++) {
        const size = 0.18 + rnd() * 0.12;
        m.makeScale(size, size, size);
        m.setPosition(sx + (rnd() - 0.5) * 2, sy + (rnd() - 0.5) * 1.5, sz + (rnd() - 0.5) * 2);
        this.mesh.setMatrixAt(k, m);
        c.setRGB(h.tint[0] * (0.85 + rnd() * 0.3), h.tint[1] * (0.85 + rnd() * 0.3), h.tint[2] * (0.85 + rnd() * 0.3));
        this.mesh.setColorAt(k, c);
        swim[k * 4] = 1.5 + rnd() * 3.5;
        swim[k * 4 + 1] = dir * (0.25 + rnd() * 0.12);
        swim[k * 4 + 2] = rnd() * 0.9;
        swim[k * 4 + 3] = 0.3 + rnd() * 0.8;
      }
    }
    g.setAttribute('aSwim', new THREE.InstancedBufferAttribute(swim, 4));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(cam: THREE.Vector3): void {
    this.time.value = OCEAN_FX.uTime.value;
    this.cam.value.copy(cam);
    this.mesh.visible = this.mesh.count > 0 && cam.y < 2;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
