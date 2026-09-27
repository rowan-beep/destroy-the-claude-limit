// Clouds for the current weather: cumulus built from overlapping billboard
// puffs scattered over the whole theater (deterministic per 14 km cell), a
// solid cloud deck for overcast, rain and snow, towering storm cells, and a
// thin cirrus deck high above. Puffs are depth-sorted back-to-front a few
// times per second.

import * as THREE from 'three';
import { hash2f, Rng, hash2i } from '../core/rng';

function smoothstepN(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
import { getCloudPuffTexture, tileableNoiseData } from '../render/textures';
import { Environment } from '../render/environment';
import { MAP_HALF } from '../core/constants';
import { TERRAIN_LIGHT } from '../render/terrainLight';
import { Weather, WEATHER_PRESETS, CloudDeck, deckFor } from './weather';

const CELL = 14000;
const RANGE = 75000;
const MAX_PUFFS = 20000;
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
  float mu = max( dot( vWDir / max( length( vWDir ), 1e-3 ), sunDir ), 0.0 );
  float thin = 1.0 - t.a;
  col += sunColor * scatter * ( pow( mu, 6.0 ) * ( 0.12 + 0.6 * thin ) + pow( mu, 40.0 ) * 0.5 * thin );
  gl_FragColor = vec4( col, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const DECK_VERT = /* glsl */ `
varying vec2 vXZ;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vXZ = wp.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

const DECK_FRAG = /* glsl */ `
uniform sampler2D noiseMap;
uniform float cover;
uniform float opacity;
uniform vec3 litColor;
uniform vec3 darkColor;
uniform vec2 scroll;
varying vec2 vXZ;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float n = texture2D( noiseMap, vXZ / 14000.0 + scroll ).r * 0.62
          + texture2D( noiseMap, vXZ / 3100.0 - scroll * 1.7 ).r * 0.38;
  float c = cover * 1.15;
  float a = smoothstep( 1.0 - c - 0.06, 1.0 - c + 0.24, n ) * opacity;
  if ( a < 0.01 ) discard;
  // thicker cloud is brighter on top and darker underneath
  vec3 col = mix( darkColor, litColor, clamp( 0.35 + ( n - 0.5 ) * 1.4, 0.0, 1.0 ) );
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
  private weather: Weather = { ...WEATHER_PRESETS.cloudy };
  /** the cloud layer for the current weather (read by the environment) */
  deck: CloudDeck = deckFor(this.weather);
  private deckTop: THREE.Mesh;
  private deckBot: THREE.Mesh;
  private deckTopMat: THREE.ShaderMaterial;
  private deckBotMat: THREE.ShaderMaterial;
  /** darkness of the cloud (rain and storm clouds are grey) 0..1 */
  private gloom = 0;
  /** lightning flash 0..1 */
  flash = 0;
  private camBelowDeck = true;
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

    // cloud deck: a lit top surface and a dark base, one noise field
    const nd = tileableNoiseData(256, 911, 5, 3);
    const px = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < nd.length; i++) {
      const v = Math.max(0, Math.min(255, (nd[i] * 0.5 + 0.5) * 255));
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
      px[i * 4 + 3] = 255;
    }
    const noiseTex = new THREE.DataTexture(px, 256, 256, THREE.RGBAFormat);
    noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
    noiseTex.magFilter = THREE.LinearFilter;
    noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
    noiseTex.generateMipmaps = true;
    noiseTex.needsUpdate = true;
    const deckMat = () =>
      new THREE.ShaderMaterial({
        vertexShader: DECK_VERT,
        fragmentShader: DECK_FRAG,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            noiseMap: { value: null },
            cover: { value: 1 },
            opacity: { value: 0 },
            litColor: { value: new THREE.Color(1, 1, 1) },
            darkColor: { value: new THREE.Color(0.5, 0.5, 0.55) },
            scroll: { value: new THREE.Vector2() },
          },
        ]),
        transparent: true,
        depthWrite: false,
        fog: true,
        side: THREE.DoubleSide,
      });
    this.deckTopMat = deckMat();
    this.deckBotMat = deckMat();
    this.deckTopMat.uniforms.noiseMap.value = noiseTex;
    this.deckBotMat.uniforms.noiseMap.value = noiseTex;
    const plane = new THREE.PlaneGeometry(400000, 400000, 1, 1);
    plane.rotateX(-Math.PI / 2);
    this.deckTop = new THREE.Mesh(plane, this.deckTopMat);
    this.deckBot = new THREE.Mesh(plane, this.deckBotMat);
    for (const m of [this.deckTop, this.deckBot]) {
      m.frustumCulled = false;
      m.renderOrder = 8;
      m.visible = false;
      scene.add(m);
    }
    this.deckTop.name = 'cloud-deck-top';
    this.deckBot.name = 'cloud-deck-base';

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
    this.setWeather({ ...this.weather, cover: c });
  }

  /** Rebuild the clouds for a weather. */
  setWeather(w: Weather): void {
    this.weather = { ...w };
    this.coverage = w.cover;
    this.deck = deckFor(w);
    this.gloom = w.kind === 'storm' ? 0.75 : w.kind === 'rain' ? 0.5 + 0.2 * w.precip : w.kind === 'snow' ? 0.3 : w.kind === 'overcast' ? 0.3 : 0;
    this.cellCache.clear();
    this.clusterCache.clear();
    this.lastCell = '';
    const cm = this.cirrus.material as THREE.MeshBasicMaterial;
    cm.opacity = w.kind === 'clear' ? 0.45 : w.cover > 0.9 ? 0.75 : 0.55;
    this.cirrus.visible = this.deck.solid < 0.95;
  }

  private cellPuffs(i: number, j: number): Puff[] {
    const key = i + ',' + j;
    let p = this.cellCache.get(key);
    if (p) return p;
    p = [];
    const cl: Cluster[] = [];
    const cx = i * CELL, cz = j * CELL;
    const w = this.weather;
    const deck = this.deck;
    if (Math.abs(cx) < MAP_HALF + 120000 && Math.abs(cz) < MAP_HALF + 120000) {
      const cover = w.cover;
      // cumulus: more and bigger clouds as the cover grows; over a solid deck
      // they are the bumps on its top
      const onDeck = deck.solid > 0.5;
      const expect = onDeck ? 1.5 : 0.5 + cover * 6.5;
      const count = Math.floor(expect + hash2f(i, j, 7));
      for (let c = 0; c < count; c++) {
        const rng = new Rng(hash2i(i, j, 100 + c));
        const px = cx + rng.range(-0.5, 0.5) * CELL;
        const pz = cz + rng.range(-0.5, 0.5) * CELL;
        // mostly modest clouds, a few big ones
        const big = Math.pow(rng.float(), 2.2);
        const rx = 900 + (900 + 3800 * cover) * big + rng.range(0, 700);
        const rz = rx * rng.range(0.55, 1.0);
        const base = onDeck ? deck.top - 350 : rng.range(1700, 2300) + (w.kind === 'clear' ? 400 : 0);
        const height = rx * rng.range(0.45, 0.85) * (onDeck ? 0.6 : 1);
        this.addCumulus(p, cl, rng, px, pz, rx, rz, base, height);
      }
      // storm: towering cumulonimbus with anvils
      if (w.kind === 'storm' && hash2f(i, j, 31) < 0.45) {
        const rng = new Rng(hash2i(i, j, 300));
        this.addTower(p, cl, rng, cx + rng.range(-0.35, 0.35) * CELL, cz + rng.range(-0.35, 0.35) * CELL, deck.base);
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

  /** One cumulus: overlapping puffs filling a flat-based dome. */
  private addCumulus(p: Puff[], cl: Cluster[], rng: Rng, px: number, pz: number, rx: number, rz: number, base: number, height: number): void {
    cl.push({ x: px, z: pz, rx, rz, base, height });
    const n = Math.floor(Math.min(90, 16 + (rx * rz) / 180000) * this.density);
    const dark = this.gloom;
    for (let k = 0; k < n; k++) {
      // sample a flat-based dome, denser toward the core
      const a = rng.range(0, Math.PI * 2);
      const rr = Math.pow(rng.float(), 0.65);
      const hy = Math.pow(rng.float(), 1.3) * height * (1 - rr * rr * 0.75);
      // big overlapping puffs so the cloud reads as one mass, not a pile of balls
      const size = Math.max(420, Math.min(rx, rz) * rng.range(0.42, 0.72)) * (1 - (hy / Math.max(1, height)) * 0.3);
      const hf = hy / Math.max(1, height);
      p.push({
        x: px + Math.cos(a) * rr * rx * 0.85,
        y: base + hy + size * 0.3,
        z: pz + Math.sin(a) * rr * rz * 0.85,
        size,
        shade: (0.58 + 0.6 * hf + 0.1 * (1 - rr)) * (1 - 0.45 * dark * (1 - hf)),
        rot: rng.range(0, Math.PI * 2),
      });
    }
  }

  /** A cumulonimbus: a column of cloud to ~9 km spreading into an anvil. */
  private addTower(p: Puff[], cl: Cluster[], rng: Rng, px: number, pz: number, base: number): void {
    const r0 = rng.range(2600, 4200);
    const top = rng.range(8000, 10500);
    cl.push({ x: px, z: pz, rx: r0 * 1.6, rz: r0 * 1.6, base, height: top - base });
    const n = Math.floor(170 * this.density);
    const lean = rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const t = rng.float();
      const y = base + t * (top - base);
      // column narrows a little with height, then the anvil spreads downwind
      const anvil = smoothstepN(0.72, 0.95, t);
      const r = r0 * (1 - 0.25 * t) * (1 + 1.9 * anvil);
      const a = rng.range(0, Math.PI * 2);
      const rr = Math.pow(rng.float(), 0.6) * r;
      const drift = anvil * r0 * 1.2;
      const size = r0 * rng.range(0.45, 0.8) * (1 - anvil * 0.35);
      p.push({
        x: px + Math.cos(a) * rr + Math.cos(lean) * drift,
        y,
        z: pz + Math.sin(a) * rr * (1 - anvil * 0.4) + Math.sin(lean) * drift,
        size,
        shade: (0.45 + 0.75 * t) * (1 - 0.3 * this.gloom * (1 - t)),
        rot: rng.range(0, Math.PI * 2),
      });
    }
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
      // nearest cells first, so the puff budget drops the farthest clouds
      const cells: [number, number][] = [];
      for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) if (di * di + dj * dj <= rc * rc + 1) cells.push([di, dj]);
      cells.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
      for (const [di, dj] of cells) {
        for (const p of this.cellPuffs(ci + di, cj + dj)) {
          if (this.visible.length < MAX_PUFFS) this.visible.push(p);
        }
        const cl = this.clusterCache.get(ci + di + ',' + (cj + dj));
        if (cl) this.visibleClusters.push(...cl);
      }
      this.sortTimer = 0;
      this.shadowCentre.set(ci * CELL, cj * CELL);
      this.drawShadows();
    } else if (this.shadowSun.distanceToSquared(this.env.sunDir) > 1e-6) this.drawShadows();
    TERRAIN_LIGHT.csArea.value.w = this.visibleClusters.length ? this.shadowStrength : 0;
    const below = cam.y < this.deck.base;
    if (below !== this.camBelowDeck) {
      this.camBelowDeck = below;
      this.sortTimer = 0;
    }
    this.sortTimer -= dt;
    if (this.sortTimer <= 0) {
      this.sortTimer = 0.2;
      this.sortAndUpload(cam);
    }
    const u = this.mat.uniforms;
    const e = this.env.uniformsForWater;
    const gloom = this.gloom;
    const lit = 1.05 * (1 - 0.45 * gloom) + this.flash * 1.5;
    (u.sunColor.value as THREE.Color).copy(e.sunColor).multiplyScalar(lit);
    (u.shadowColor.value as THREE.Color).copy(e.horizon).multiplyScalar(0.72 * (1 - 0.5 * gloom) + this.flash);
    this.updateDeck(cam, e, gloom);
    (u.sunDir.value as THREE.Vector3).copy(e.sunDir);
    this.cirrus.position.x = Math.round(cam.x / 20000) * 20000;
    this.cirrus.position.z = Math.round(cam.z / 20000) * 20000;
    const mat = this.cirrus.material as THREE.MeshBasicMaterial;
    if (mat.map) mat.map.offset.set(this.cirrus.position.x / 20000 / 60, -this.cirrus.position.z / 20000 / 60);
  }

  private deckScroll = new THREE.Vector2();

  private updateDeck(cam: THREE.Vector3, e: { horizon: THREE.Color; sunColor: THREE.Color }, gloom: number): void {
    const d = this.deck;
    const on = d.solid > 0.01;
    this.deckTop.visible = this.deckBot.visible = on;
    if (!on) return;
    const sx = Math.round(cam.x / 10000) * 10000, sz = Math.round(cam.z / 10000) * 10000;
    this.deckTop.position.set(sx, d.top, sz);
    this.deckBot.position.set(sx, d.base, sz);
    // the deck drifts slowly with the wind
    this.deckScroll.x += 0.0000025;
    this.deckScroll.y += 0.0000012;
    const flash = this.flash;
    const cover = this.weather.cover;
    for (const [m, top] of [[this.deckTopMat, true], [this.deckBotMat, false]] as const) {
      const u = m.uniforms;
      u.cover.value = cover;
      u.opacity.value = d.solid;
      (u.scroll.value as THREE.Vector2).copy(this.deckScroll);
      const lit = u.litColor.value as THREE.Color;
      const dark = u.darkColor.value as THREE.Color;
      if (top) {
        // the sunlit top of the deck, seen from above
        lit.copy(e.sunColor).multiplyScalar(1.02 + flash);
        dark.copy(e.horizon).multiplyScalar(0.82 + flash);
      } else {
        // the grey base, darker in rain and storms
        lit.copy(e.horizon).multiplyScalar((0.78 - 0.4 * gloom) + flash * 1.4);
        dark.copy(e.horizon).multiplyScalar((0.5 - 0.3 * gloom) + flash);
      }
    }
  }

  private sortAndUpload(cam: THREE.Vector3): void {
    this.origin.set(Math.round(cam.x / 1000) * 1000, 0, Math.round(cam.z / 1000) * 1000);
    const arr = this.visible;
    const hideAbove = this.deck.solid > 0.8 && cam.y < this.deck.base;
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
      // below a solid deck the clouds on top of it can't be seen
      if (hideAbove && p.y - p.size * 0.3 > this.deck.base + 200) continue;
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
