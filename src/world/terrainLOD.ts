// Streaming quadtree terrain. The whole 740 km theater is a single quadtree;
// nodes near the camera split down to ~720 m tiles (22 m vertex spacing)
// while the distant islands render as a handful of coarse tiles. Tiles are
// generated in background workers and swapped in without holes: a parent
// stays visible until all of its children are ready.

import * as THREE from 'three';
import { activeMap } from './islands';
import { TERRAIN_LIGHT, TERRAIN_LIGHT_GLSL } from '../render/terrainLight';
import { MAP_SIZE } from '../core/constants';
import { WorkerPool } from './workerPool';
import { buildChunkIndices, ChunkResult } from './terrainGen';
import { HeightGrid } from './heightGrid';
import { getTerrainDetailTexture } from '../render/textures';
import { loadSettings } from '../core/settings';

const RES = 32;
const EMPTY_BELOW = -95; // tiles entirely deeper than this are hidden under the abyss plane

type NodeState = 'none' | 'pending' | 'ready' | 'empty';

class TNode {
  children: TNode[] | null = null;
  mesh: THREE.Mesh | null = null;
  state: NodeState = 'none';
  cancel: (() => void) | null = null;
  job: unknown = null;
  maxH: number;
  minH = -100;
  lastSeen = 0;
  visible = false;
  constructor(
    public level: number,
    public cx: number,
    public cz: number,
    public size: number,
  ) {
    this.maxH = 6000;
  }
}

export interface TerrainQuality {
  splitK: number;
  maxLevel: number;
}

export class TerrainLOD {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshLambertMaterial;
  private root: TNode;
  private index: THREE.BufferAttribute;
  private frame = 0;
  private meshCount = 0;
  private quality: TerrainQuality = { splitK: 2.3, maxLevel: 10 };
  private camX = 0;
  private camY = 0;
  private camZ = 0;

  constructor(
    private pool: WorkerPool,
    private grid: HeightGrid,
  ) {
    this.group.name = 'terrain';
    this.index = new THREE.BufferAttribute(buildChunkIndices(RES), 1);
    this.material = createTerrainMaterial();
    this.root = new TNode(0, 0, 0, MAP_SIZE);
    this.initBounds(this.root);
  }

  setQuality(q: TerrainQuality): void {
    this.quality = q;
  }

  get stats(): { meshes: number; pending: number } {
    return { meshes: this.meshCount, pending: this.pool.pending };
  }

  private initBounds(n: TNode): void {
    const h = n.size / 2;
    n.maxH = this.grid.maxInRect(n.cx - h, n.cz - h, n.cx + h, n.cz + h) + 40;
    if (n.maxH < EMPTY_BELOW) n.state = 'empty';
  }

  private distTo(n: TNode): number {
    const h = n.size / 2;
    const dx = Math.max(0, Math.abs(this.camX - n.cx) - h);
    const dz = Math.max(0, Math.abs(this.camZ - n.cz) - h);
    let dy = 0;
    if (this.camY > n.maxH) dy = this.camY - n.maxH;
    else if (this.camY < n.minH) dy = n.minH - this.camY;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  update(camPos: THREE.Vector3): void {
    this.frame++;
    this.camX = camPos.x;
    this.camY = camPos.y;
    this.camZ = camPos.z;
    this.visit(this.root);
    if (this.frame % 60 === 0) this.prune(this.root);
  }

  /** Returns true if the node's area is fully covered by visible meshes (or is empty ocean). */
  private visit(n: TNode): boolean {
    n.lastSeen = this.frame;
    if (n.state === 'empty') {
      this.setVisible(n, false);
      if (n.children) for (const c of n.children) this.hideSubtree(c);
      return true;
    }
    const d = this.distTo(n);
    const wantSplit = n.level < this.quality.maxLevel && d < this.quality.splitK * n.size;
    if (wantSplit) {
      if (!n.children) this.makeChildren(n);
      let covered = true;
      for (const c of n.children!) if (!this.visit(c)) covered = false;
      if (covered) {
        this.setVisible(n, false);
        return true;
      }
      this.request(n, d);
      if (n.state === 'ready') {
        this.setVisible(n, true);
        for (const c of n.children!) this.hideSubtree(c);
        return true;
      }
      return false;
    }
    this.request(n, d);
    if (n.children) for (const c of n.children) this.hideSubtree(c);
    if (n.state === 'ready') {
      this.setVisible(n, true);
      return true;
    }
    return false;
  }

  private makeChildren(n: TNode): void {
    const q = n.size / 4;
    const s = n.size / 2;
    n.children = [
      new TNode(n.level + 1, n.cx - q, n.cz - q, s),
      new TNode(n.level + 1, n.cx + q, n.cz - q, s),
      new TNode(n.level + 1, n.cx - q, n.cz + q, s),
      new TNode(n.level + 1, n.cx + q, n.cz + q, s),
    ];
    for (const c of n.children) this.initBounds(c);
  }

  private request(n: TNode, dist: number): void {
    if (n.state !== 'none') {
      if (n.state === 'pending' && n.job) this.pool.setPriority(n.job as never, dist / n.size);
      return;
    }
    n.state = 'pending';
    const skirt = Math.max(15, (n.size / RES) * 1.5);
    const h = this.pool.submit(
      { type: 'chunk', cx: n.cx, cz: n.cz, size: n.size, res: RES, skirt },
      dist / n.size,
      (res) => this.onChunk(n, res as ChunkResult),
    );
    n.cancel = h.cancel;
    n.job = h.job;
  }

  private onChunk(n: TNode, res: ChunkResult): void {
    n.cancel = null;
    n.job = null;
    n.minH = res.minH;
    n.maxH = res.maxH;
    if (res.maxH < EMPTY_BELOW) {
      n.state = 'empty';
      return;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(res.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(res.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(res.colors, 3, true));
    geo.setIndex(this.index);
    const half = n.size / 2;
    const midY = (res.minH + res.maxH) / 2;
    const rY = (res.maxH - res.minH) / 2 + 60;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, midY, 0), Math.sqrt(half * half * 2 + rY * rY));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-half, res.minH - 60, -half), new THREE.Vector3(half, res.maxH, half));
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(n.cx, 0, n.cz);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.visible = false;
    n.mesh = mesh;
    n.state = 'ready';
    this.meshCount++;
    this.group.add(mesh);
  }

  private setVisible(n: TNode, v: boolean): void {
    n.visible = v;
    if (n.mesh) n.mesh.visible = v;
  }

  private hideSubtree(n: TNode): void {
    this.setVisible(n, false);
    if (n.children) for (const c of n.children) this.hideSubtree(c);
  }

  /** Free tiles not seen for a while. */
  private prune(n: TNode): void {
    if (!n.children) return;
    for (const c of n.children) this.prune(c);
    const stale = this.frame - n.children[0].lastSeen > 240;
    if (stale && n.children.every((c) => !c.children)) {
      for (const c of n.children) this.freeNode(c);
      n.children = null;
    }
  }

  private freeNode(n: TNode): void {
    if (n.cancel) n.cancel();
    if (n.mesh) {
      this.group.remove(n.mesh);
      n.mesh.geometry.dispose();
      n.mesh = null;
      this.meshCount--;
    }
    n.state = n.state === 'empty' ? 'empty' : 'none';
  }

  /** True when nothing near the camera is still waiting for generation. */
  isSettled(): boolean {
    return this.pool.pending === 0;
  }
}

/** Triplanar sampling: the texture projected along each world axis, blended by the surface normal. */
const TRIPLANAR_GLSL = /* glsl */ `
vec3 triWeights( vec3 n ) {
  vec3 w = pow( abs( n ), vec3( 4.0 ) );
  return w / ( w.x + w.y + w.z + 1e-5 );
}
#ifdef TERRAIN_SIMPLE
// low / medium graphics: one planar sample instead of three
vec4 triSample( sampler2D t, vec3 p, vec3 w, float s ) {
  return texture2D( t, p.xz / s );
}
#else
vec4 triSample( sampler2D t, vec3 p, vec3 w, float s ) {
  return texture2D( t, p.xz / s ) * w.y + texture2D( t, p.zy / s ) * w.x + texture2D( t, p.xy / s ) * w.z;
}
#endif
`;

export function createTerrainMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const detail = getTerrainDetailTexture();
  // the Frostfall theater: a world of snow and ice
  const defs: Record<string, string> = {};
  if (activeMap.id === 'frost') defs.SNOW_WORLD = '';
  let q = 'high';
  try {
    q = loadSettings().graphics.quality;
  } catch {
    /* defaults */
  }
  const simple = q === 'low' || q === 'medium';
  if (simple) defs.TERRAIN_SIMPLE = '';
  mat.defines = defs;
  mat.customProgramCacheKey = () => 'terrain-v3-' + activeMap.id + (simple ? '-s' : '');
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detail };
    Object.assign(shader.uniforms, TERRAIN_LIGHT);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDetailXZ;\nvarying float vHeight;\nvarying vec3 vWNormal;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n{ vec4 dwp = modelMatrix * vec4( transformed, 1.0 ); vDetailXZ = dwp.xz; vHeight = dwp.y; vWNormal = normal; }',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D detailMap;\nvarying vec2 vDetailXZ;\nvarying float vHeight;\nvarying vec3 vWNormal;\n' + TRIPLANAR_GLSL + TERRAIN_LIGHT_GLSL,
      )
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `#include <lights_fragment_end>
        {
          // baked mountain shadows + sky visibility, and drifting cloud shadows
          vec2 tl = terrainLight( vDetailXZ, vHeight );
          float cs = cloudShadow( vDetailXZ, vHeight );
          reflectedLight.directDiffuse *= tl.r * ( 1.0 - 0.62 * cs );
          reflectedLight.indirectDiffuse *= ( 0.45 + 0.55 * tl.g ) * ( 1.0 - 0.18 * cs );
          // shadowed snow and rock pick up the blue sky
          reflectedLight.indirectDiffuse *= mix( vec3( 1.0 ), vec3( 0.92, 0.98, 1.12 ), ( 1.0 - tl.r ) * tlGrid.w );
          // snow in shadow is lit by the whole blue sky: bright and blue, never black
          reflectedLight.indirectDiffuse *= 1.0 + tSnow * vec3( 0.55, 0.7, 0.95 );
          #if NUM_DIR_LIGHTS > 0
          if ( tSnow > 0.01 ) {
            // snow's forward-scattering sheen, and ice crystals glinting in the sun up close
            vec3 L = directionalLights[ 0 ].direction;
            vec3 V = normalize( vViewPosition );
            vec3 H = normalize( L + V );
            float nh = max( dot( normal, H ), 0.0 );
            float lit = tl.r * ( 1.0 - 0.62 * cs ) * max( dot( normal, L ), 0.0 );
            vec2 cell = floor( vDetailXZ * 5.0 );
            float hsh = fract( sin( dot( cell + floor( V.xy * 60.0 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
            float glint = step( 0.992, hsh ) * pow( nh, 24.0 ) * tClose;
            reflectedLight.directDiffuse += directionalLights[ 0 ].color * tSnow * lit * ( 0.07 * pow( nh, 10.0 ) + 1.6 * glint );
          }
          #endif
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        // (with anti-aliasing an edge pixel's colour is extrapolated past the triangle and a
        // near-black seabed channel dips below zero: pow() of that is NaN, dotting the coasts)
        diffuseColor.rgb *= pow( max( vColor.rgb, vec3( 0.0 ) ), vec3( 2.2 ) );
        // surface relief (metres) for the lighting, and how much of this is snow
        float tBump = 0.0;
        float tSnow = 0.0;
        float tClose = 0.0;
        {
          float camDist = length( vViewPosition );
          // projected from above on flat ground and from the side on slopes, so
          // nothing stretches into smears on the mountainsides
          vec3 wp = vec3( vDetailXZ.x, vHeight, vDetailXZ.y );
          vec3 tw = triWeights( normalize( vWNormal ) );
          vec4 t1 = triSample( detailMap, wp, tw, 48.0 );
          vec4 t4 = triSample( detailMap, wp, tw, 9.0 );
          float d1 = t1.r;
          float d2 = triSample( detailMap, wp, tw, 410.0 ).r;
          float d3 = texture2D( detailMap, vDetailXZ / 3700.0 ).r;
          float d4 = t4.r;
          // rock: blocks and fractures at two scales, fine grain
          vec4 tr = triSample( detailMap, wp, tw, 26.0 );
          float rockTex = ( 0.5 + 0.5 * smoothstep( 0.02, 0.2, tr.g ) ) * ( 0.75 + 0.5 * t4.b ) * ( 0.85 + 0.3 * smoothstep( 0.05, 0.3, triSample( detailMap, wp, tw, 7.0 ).g ) );
          float nearF = 1.0 - smoothstep( 1500.0, 9000.0, camDist );
          float closeF = 1.0 - smoothstep( 80.0, 600.0, camDist );
          tClose = closeF;
          float g = mix( 1.0, 0.72 + 0.56 * d1, nearF * 0.9 );
          g *= 0.84 + 0.32 * d2;
          g *= 0.88 + 0.24 * d3;
          g *= mix( 1.0, 0.8 + 0.4 * d4, closeF );
          float steep = 1.0 - clamp( vWNormal.y, 0.0, 1.0 );
          // snow: bright and low-saturation vertex colour
          float mn = min( vColor.r, min( vColor.g, vColor.b ) );
          float sat = max( vColor.r, max( vColor.g, vColor.b ) ) - mn;
          tSnow = smoothstep( 0.72, 0.84, mn ) * ( 1.0 - smoothstep( 0.08, 0.16, sat ) );
          // real snow is an even white: its texture comes from the light on its surface, not from grey blotches
          g = mix( g, ( 1.0 - 0.16 * ( 1.0 - g ) ) * mix( 1.0, 0.94 + 0.12 * t4.b, closeF ), tSnow );
          // rock faces: fractured blocks and strata instead of a smooth smear
          float strata = 0.5 + 0.5 * sin( vHeight * 0.09 + d2 * 6.0 );
          float cliff = smoothstep( 0.35, 0.7, steep ) * nearF * ( 1.0 - tSnow );
          g *= mix( 1.0, ( 0.86 + 0.22 * strata ) * mix( 1.0, rockTex, 0.8 ), cliff );
          diffuseColor.rgb *= g;
          #ifdef SNOW_WORLD
          {
            // crisp rock breaking through on steep faces and ridges, snow lodged in its cracks and ledges
            float edge = steep + ( d2 - 0.5 ) * 0.05;
            float rockF = smoothstep( 0.74, 0.8, edge ) * ( 1.0 - 0.45 * smoothstep( 0.62, 0.74, d4 ) * closeF );
            rockF *= smoothstep( 150.0, 500.0, vHeight );
            vec3 rock = vec3( 0.052, 0.052, 0.058 ) * rockTex * ( 0.85 + 0.3 * d1 ) * ( 0.9 + 0.2 * sin( vHeight * 0.11 + d2 * 5.0 ) );
            diffuseColor.rgb = mix( diffuseColor.rgb, rock, rockF );
            tSnow *= 1.0 - rockF;
            tBump += rockF * ( ( tr.g - 0.5 ) * 1.2 + ( d1 - 0.5 ) * 1.5 );
          }
          #endif
          // relief: wind-built drifts and sastrugi ridges on snow, rough grain elsewhere
          float sast = texture2D( detailMap, vec2( vDetailXZ.x * 0.8 + vDetailXZ.y * 0.6, -vDetailXZ.x * 0.6 + vDetailXZ.y * 0.8 ) * vec2( 1.0 / 70.0, 1.0 / 11.0 ) ).r;
          float snowH = ( d1 - 0.5 ) * 0.45 + ( sast - 0.5 ) * 0.3 + ( d4 - 0.5 ) * 0.04;
          float grndH = ( d1 - 0.5 ) * 0.6 + ( d4 - 0.5 ) * 0.14 + cliff * ( tr.g - 0.5 ) * 1.0;
          tBump += mix( grndH, snowH, tSnow ) * ( 1.0 - smoothstep( 600.0, 4000.0, camDist ) );
          // wet dark sand at the waterline
          diffuseColor.rgb *= mix( 0.72, 1.0, smoothstep( 0.0, 2.5, vHeight ) );
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          // bump the shading normal from the relief (screen-space derivatives)
          vec2 dh = vec2( dFdx( tBump ), dFdy( tBump ) );
          vec3 sx = dFdx( -vViewPosition );
          vec3 sy = dFdy( -vViewPosition );
          vec3 r1 = cross( sy, normal );
          vec3 r2 = cross( normal, sx );
          float det = dot( sx, r1 ) * faceDirection;
          vec3 grad = sign( det ) * ( dh.x * r1 + dh.y * r2 );
          vec3 bumped = normalize( abs( det ) * normal - grad );
          normal = normalize( mix( normal, bumped, step( 1e-12, abs( det ) ) ) );
        }`,
      );
  };
  return mat;
}
