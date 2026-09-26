// Fair-weather cumulus: clusters of billboard puffs scattered over the whole
// theater (deterministic per 14 km cell) plus a thin cirrus deck high above.
// Puffs are depth-sorted back-to-front a few times per second.

import * as THREE from 'three';
import { hash2f, Rng, hash2i } from '../core/rng';
import { getCloudPuffTexture, tileableNoiseData } from '../render/textures';
import { Environment } from '../render/environment';
import { MAP_HALF } from '../core/constants';
import { TERRAIN_LIGHT } from '../render/terrainLight';

const CELL = 14000;
const RANGE = 75000;
const MAX_PUFFS = 6000;
/** cloud-shadow map: texels per side over the whole visible cloud field */
const SHADOW_RES = 256;

interface Cluster {
  x: number;
  z: number;
  rx: number;
  rz: number;
  base: number;
  height: number;
}

interface Puff {
  x: number;
  y: number;
  z: number;
  size: number;
  shade: number;
  rot: number;
}

const VERT = /* glsl */ `
attribute vec3 iOffset;
attribute vec3 iParams; // size, shade, rotation
varying vec2 vUv;
varying float vShade;
varying float vFade;
varying float vHeightF;
varying vec3 vWDir;
uniform float camInside;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vShade = iParams.y;
  vec4 mvPosition = modelViewMatrix * vec4( iOffset, 1.0 );
  float dist = length( mvPosition.xyz );
  float size = iParams.x;
  // fade puffs that the camera is flying through
  vFade = smoothstep( size * 0.25, size * 0.9, dist );
  vHeightF = position.y + 0.5;
  vWDir = ( modelMatrix * vec4( iOffset, 1.0 ) ).xyz - cameraPosition;
  float c = cos( iParams.z ), s = sin( iParams.z );
  vec2 corner = vec2( position.x * c - position.y * s, position.x * s + position.y * c );
  mvPosition.xy += corner * size;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 sunColor;
uniform vec3 shadowColor;
uniform float opacity;
uniform vec3 sunDir;
uniform float scatter;
varying vec3 vWDir;
varying vec2 vUv;
varying float vShade;
varying float vFade;
varying float vHeightF;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D( map, vUv );
  float a = t.a * opacity * vFade;
  if ( a < 0.01 ) discard;
  float light = clamp( t.r * vShade, 0.0, 1.2 );
  vec3 col = mix( shadowColor, sunColor, light );
  // forward scattering: thin edges glow silver when the sun is behind the cloud
  float mu = max( dot( normalize( vWDir ), sunDir ), 0.0 );
  float thin = 1.0 - t.a;
  col += sunColor * scatter * ( pow( mu, 6.0 ) * ( 0.12 + 0.6 * thin ) + pow( mu, 40.0 ) * 0.5 * thin );
  gl_FragColor = vec4( col, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class CloudSystem {
  private mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private offsets: Float32Array;
  private params: Float32Array;
  private mat: THREE.ShaderMaterial;
  private cellCache = new Map<string, Puff[]>();
  private visible: Puff[] = [];
  private lastCell = '';
  private sortTimer = 0;
  private origin = new THREE.Vector3();
  private density = 1;
  private cirrus: THREE.Mesh;
  coverage = 0.55;
  private clusterCache = new Map<string, Cluster[]>();
  private visibleClusters: Cluster[] = [];
  private shadowCanvas: HTMLCanvasElement;
  private shadowTex: THREE.CanvasTexture;
  private shadowCentre = new THREE.Vector2();
  private shadowSun = new THREE.Vector3();
  /** cloud shadows on the ground (0 = off) */
  shadowStrength = 1;

  constructor(
    scene: THREE.Scene,
    private env: Environment,
  ) {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    this.offsets = new Float32Array(MAX_PUFFS * 3);
    this.params = new Float32Array(MAX_PUFFS * 3);
    const oa = new THREE.InstancedBufferAttribute(this.offsets, 3);
    const pa = new THREE.InstancedBufferAttribute(this.params, 3);
    oa.setUsage(THREE.DynamicDrawUsage);
    pa.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iOffset', oa);
    this.geo.setAttribute('iParams', pa);
    this.geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          map: { value: null },
          sunColor: { value: new THREE.Color(1, 1, 1) },
          shadowColor: { value: new THREE.Color(0.55, 0.6, 0.7) },
          opacity: { value: 0.92 },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          scatter: { value: 1 },
          camInside: { value: 0 },
        },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.mat.uniforms.map.value = getCloudPuffTexture();
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'clouds';
    scene.add(this.mesh);

    // Cirrus deck
    const size = 256;
    const d = tileableNoiseData(size, 404, 5, 4);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = Math.max(0, d[i] * 1.6 - 0.15);
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.min(255, v * 200);
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(60, 60);
    const cirrusMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.55, fog: true, side: THREE.DoubleSide });
    this.cirrus = new THREE.Mesh(new THREE.PlaneGeometry(1200000, 1200000), cirrusMat);
    this.cirrus.rotation.x = -Math.PI / 2;
    this.cirrus.position.y = 10500;
    this.cirrus.renderOrder = 9;
    this.cirrus.frustumCulled = false;
    this.cirrus.name = 'cirrus';
    scene.add(this.cirrus);

    this.shadowCanvas = document.createElement('canvas');
    this.shadowCanvas.width = this.shadowCanvas.height = SHADOW_RES;
    this.shadowTex = new THREE.CanvasTexture(this.shadowCanvas);
    this.shadowTex.colorSpace = THREE.NoColorSpace;
    this.shadowTex.flipY = false;
    this.shadowTex.wrapS = this.shadowTex.wrapT = THREE.ClampToEdgeWrapping;
    TERRAIN_LIGHT.csMap.value = this.shadowTex;
  }

  /** Light scattering on/off (silver linings). */
  setScattering(on: boolean): void {
    this.mat.uniforms.scatter.value = on ? 1 : 0;
  }

  /** Paint the ground shadows of the clouds around the camera. */
  private drawShadows(): void {
    const g = this.shadowCanvas.getContext('2d');
    if (!g) return;
    const size = 2 * (RANGE + CELL);
    const res = SHADOW_RES;
    const k = res / size;
    g.fillStyle = '#000';
    g.fillRect(0, 0, res, res);
    const sd = this.env.sunDir;
    const up = Math.max(0.08, sd.y);
    for (const c of this.visibleClusters) {
      // where the cloud's shadow falls on the ground
      const lift = c.base + c.height * 0.45;
      const sx = c.x - (sd.x / up) * lift;
      const sz = c.z - (sd.z / up) * lift;
      const px = (sx - this.shadowCentre.x) * k + res / 2;
      const pz = (sz - this.shadowCentre.y) * k + res / 2;
      const r = Math.max(c.rx, c.rz) * 1.05 * k;
      if (px < -r || pz < -r || px > res + r || pz > res + r) continue;
      g.save();
      g.translate(px, pz);
      g.scale(1, c.rz / c.rx);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.75)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    this.shadowTex.needsUpdate = true;
    TERRAIN_LIGHT.csArea.value.set(this.shadowCentre.x, this.shadowCentre.y, size, this.visibleClusters.length ? this.shadowStrength : 0);
    this.shadowSun.copy(sd);
  }

  setDensity(d: number): void {
    this.density = d;
    this.cellCache.clear();
    this.clusterCache.clear();
    this.lastCell = '';
  }

  setCoverage(c: number): void {
    this.coverage = c;
    this.cellCache.clear();
    this.clusterCache.clear();
    this.lastCell = '';
    (this.cirrus.material as THREE.MeshBasicMaterial).opacity = c > 0.9 ? 0.8 : 0.55;
  }

  private cellPuffs(i: number, j: number): Puff[] {
    const key = i + ',' + j;
    let p = this.cellCache.get(key);
    if (p) return p;
    p = [];
    const cl: Cluster[] = [];
    const cx = i * CELL, cz = j * CELL;
    if (Math.abs(cx) < MAP_HALF + 120000 && Math.abs(cz) < MAP_HALF + 120000) {
      const clusters = hash2f(i, j, 7) < this.coverage ? 1 + (hash2f(i, j, 9) < 0.35 ? 1 : 0) : 0;
      for (let c = 0; c < clusters; c++) {
        const rng = new Rng(hash2i(i, j, 100 + c));
        const px = cx + rng.range(-0.42, 0.42) * CELL;
        const pz = cz + rng.range(-0.42, 0.42) * CELL;
        const base = rng.range(1800, 2600);
        const rx = rng.range(1400, 3600);
        const rz = rx * rng.range(0.6, 1.0);
        const height = rng.range(700, 1700) * (rx / 2500);
        cl.push({ x: px, z: pz, rx, rz, base, height });
        const n = Math.floor(rng.range(26, 48) * this.density);
        for (let k = 0; k < n; k++) {
          // sample the upper half of an ellipsoid, denser toward the core
          const a = rng.range(0, Math.PI * 2);
          const rr = Math.pow(rng.float(), 0.7);
          const hy = Math.pow(rng.float(), 1.6) * height * (1 - rr * rr * 0.7);
          const size = rng.range(520, 1050) * (1 - (hy / height) * 0.35) * (0.75 + 0.35 * (1 - rr));
          const ox = Math.cos(a) * rr * rx;
          const oz = Math.sin(a) * rr * rz;
          const hf = hy / Math.max(1, height);
          p.push({
            x: px + ox,
            y: base + hy + size * 0.28,
            z: pz + oz,
            size,
            shade: 0.62 + 0.55 * hf + 0.1 * (1 - rr),
            rot: rng.range(0, Math.PI * 2),
          });
        }
      }
    }
    this.cellCache.set(key, p);
    this.clusterCache.set(key, cl);
    if (this.cellCache.size > 800) {
      const first = this.cellCache.keys().next().value;
      if (first !== undefined) {
        this.cellCache.delete(first);
        this.clusterCache.delete(first);
      }
    }
    return p;
  }

  update(dt: number, camera: THREE.Camera): void {
    const cam = camera.position;
    const ci = Math.round(cam.x / CELL), cj = Math.round(cam.z / CELL);
    const key = ci + ',' + cj;
    if (key !== this.lastCell) {
      this.lastCell = key;
      this.visible = [];
      this.visibleClusters = [];
      const rc = Math.ceil(RANGE / CELL);
      for (let dj = -rc; dj <= rc; dj++) {
        for (let di = -rc; di <= rc; di++) {
          if (di * di + dj * dj > rc * rc + 1) continue;
          for (const p of this.cellPuffs(ci + di, cj + dj)) {
            if (this.visible.length < MAX_PUFFS) this.visible.push(p);
          }
          const cl = this.clusterCache.get(ci + di + ',' + (cj + dj));
          if (cl) this.visibleClusters.push(...cl);
        }
      }
      this.sortTimer = 0;
      this.shadowCentre.set(ci * CELL, cj * CELL);
      this.drawShadows();
    } else if (this.shadowSun.distanceToSquared(this.env.sunDir) > 1e-6) this.drawShadows();
    TERRAIN_LIGHT.csArea.value.w = this.visibleClusters.length ? this.shadowStrength : 0;
    this.sortTimer -= dt;
    if (this.sortTimer <= 0) {
      this.sortTimer = 0.2;
      this.sortAndUpload(cam);
    }
    const u = this.mat.uniforms;
    const e = this.env.uniformsForWater;
    (u.sunColor.value as THREE.Color).copy(e.sunColor).multiplyScalar(1.05);
    (u.shadowColor.value as THREE.Color).copy(e.horizon).multiplyScalar(0.72);
    (u.sunDir.value as THREE.Vector3).copy(e.sunDir);
    this.cirrus.position.x = Math.round(cam.x / 20000) * 20000;
    this.cirrus.position.z = Math.round(cam.z / 20000) * 20000;
    const mat = this.cirrus.material as THREE.MeshBasicMaterial;
    if (mat.map) mat.map.offset.set(this.cirrus.position.x / 20000 / 60, -this.cirrus.position.z / 20000 / 60);
  }

  private sortAndUpload(cam: THREE.Vector3): void {
    this.origin.set(Math.round(cam.x / 1000) * 1000, 0, Math.round(cam.z / 1000) * 1000);
    const arr = this.visible;
    const dist = new Float32Array(arr.length);
    const idx = new Array<number>(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
      dist[i] = dx * dx + dy * dy + dz * dz;
      idx[i] = i;
    }
    idx.sort((a, b) => dist[b] - dist[a]);
    let n = 0;
    for (const i of idx) {
      const p = arr[i];
      if (dist[i] > RANGE * RANGE * 1.3) continue;
      this.offsets[n * 3] = p.x - this.origin.x;
      this.offsets[n * 3 + 1] = p.y;
      this.offsets[n * 3 + 2] = p.z - this.origin.z;
      this.params[n * 3] = p.size;
      this.params[n * 3 + 1] = p.shade;
      this.params[n * 3 + 2] = p.rot;
      n++;
    }
    this.geo.instanceCount = n;
    this.mesh.position.copy(this.origin);
    (this.geo.attributes.iOffset as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geo.attributes.iParams as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}
