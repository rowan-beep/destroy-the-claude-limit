// Visual representation of an aircraft: the procedural airframe plus
// everything that moves -- control surfaces driven by the pilot's inputs,
// landing gear retraction, speedbrake, afterburner flames with shock
// diamonds, navigation / strobe lights and the stores on each station.

import * as THREE from 'three';
import { NIGHT, keepLightsVisible } from '../../render/night';
import { getSoftDotTexture } from '../../render/textures';
import type { Aircraft } from '../aircraft';
import type { WeaponBay } from '../specs';
import { airframeMaterials, Section } from './builder';
import { storeGeometry, pylonGeometry, shoulderGeometry, storeCenterY, storeCenterX, onShoulder, PYLON_DROP } from './stores';
import { DEG } from '../../core/constants';
import { clamp, smoothstep } from '../../core/math';
import { makeInsignia } from './decals';
import { Cockpit } from './cockpit';
import { customSkinMaterial, Livery } from './kit';
import { burnerMaterial, partMaterials } from './parts';
import { PilotRig, updatePilot } from './pilot';
import { PaintConfig, WRAPS, wrapMask } from './paint';
import type { AoVolume } from './ao';
import type { HazeSource } from '../../render/heatHaze';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Distance level of detail shared by every clone of a template: the airframe
 * rebuilt at low density and merged into one mesh per material (a handful of
 * draw calls instead of ~60), plus a single-draw silhouette that casts the
 * jet's shadow in place of the full-detail meshes.
 */
export interface FarLod {
  parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[];
  shadow: THREE.BufferGeometry;
  /** the low template's paint material (stands for the clone's own paint) */
  paint: THREE.Material | null;
  /** ambient occlusion volume baked from the merged airframe */
  ao?: AoVolume;
  /** the whole airframe as one mesh in the paint material, for jets a few pixels across */
  speck: THREE.BufferGeometry;
}

// Draws nothing in the colour pass (every fragment fails the depth test) but
// renders normally into the shadow map, which uses its own depth material.
let _shadowOnly: THREE.MeshBasicMaterial | null = null;

/** >1 swaps to the light distance model sooner (low-end graphics). */
let lodScale = 1;
export function setLodScale(s: number): void {
  lodScale = s;
}
function shadowOnlyMaterial(): THREE.MeshBasicMaterial {
  if (!_shadowOnly) _shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthFunc: THREE.NeverDepth });
  return _shadowOnly;
}

function f32(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size = a.itemSize): THREE.BufferAttribute {
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) out[i * size + k] = k < a.itemSize ? a.getComponent(i, k) : 1;
  return new THREE.BufferAttribute(out, size);
}

function filled(count: number, size: number, v: number): THREE.BufferAttribute {
  return new THREE.BufferAttribute(new Float32Array(count * size).fill(v), size);
}


export interface ControlSurface {
  pivot: THREE.Object3D;
  axis: THREE.Vector3;
  kind: 'stab' | 'rudder' | 'aileron' | 'flap' | 'flaperon' | 'canard' | 'lef';
  side: -1 | 0 | 1;
  maxDeg: number;
  current: number;
}

export interface GearLeg {
  pivot: THREE.Object3D;
  axis: THREE.Vector3;
  retractDeg: number;
  hideWhenUp: THREE.Object3D[];
  /** where the leg hangs from (body frame), for legs that stroke on their oleos */
  base?: THREE.Vector3;
}

export interface Nozzle {
  pos: THREE.Vector3;
  radius: number;
  /** gimbal the nozzle (and its flame) is mounted on; pos is relative to it */
  parent?: THREE.Object3D;
  /** how deep the burner can runs ahead of the exit (m) */
  depth?: number;
  /** width / height of a flat (2D) nozzle's exhaust */
  aspect?: number;
  /** exit size fully closed and fully open, relative to `radius` (a variable nozzle) */
  area?: [number, number];
}

// Afterburner plume: three nested, shaped layers per engine, all additive and
// in HDR (so the brightest parts bloom), with fractal-noise turbulence that
// flows downstream. Each layer fades at its silhouette (view-angle falloff) so
// the plume reads as glowing gas rather than a solid cone:
//  0  the flame itself: white-yellow at the nozzle, streaky, licking, going
//     orange within a couple of nozzle diameters
//  1  the jet: a train of shock diamonds (bright, pale peach-pink) in a
//     translucent orange-to-violet column, longer and clearer at altitude
//  2  the outer mixing layer: ragged orange tongues in reheat, a faint heat
//     tint at dry power
const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  vV = -mvPosition.xyz;
  vN = normalize( normalMatrix * normal );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float intensity;
uniform float dry;
uniform float time;
uniform float layer;
uniform float thin;
uniform vec3 cHot;
uniform vec3 cMid;
uniform vec3 cTail;
uniform vec3 cDry;
uniform vec3 cDiamond;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <logdepthbuf_pars_fragment>
float hash3( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float vnoise( vec3 p ) {
  vec3 i = floor( p ); vec3 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( hash3( i ), hash3( i + vec3( 1, 0, 0 ) ), f.x ), mix( hash3( i + vec3( 0, 1, 0 ) ), hash3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( hash3( i + vec3( 0, 0, 1 ) ), hash3( i + vec3( 1, 0, 1 ) ), f.x ), mix( hash3( i + vec3( 0, 1, 1 ) ), hash3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float fbm( vec3 p ) { return 0.5 * vnoise( p ) + 0.3 * vnoise( p * 2.07 ) + 0.2 * vnoise( p * 4.3 ); }
void main() {
  #include <logdepthbuf_fragment>
  float along = vUv.y;                                   // 0 at the nozzle, 1 at the tip
  float ang = vUv.x * 6.2831853;
  vec2 cs = vec2( cos( ang ), sin( ang ) );
  float facing = abs( dot( normalize( vN ), normalize( vV ) ) );
  float soft = pow( facing, 1.3 );                       // thin, fading edges
  vec3 e = vec3( 0.0 );
  if ( layer < 0.5 ) {
    // the flame: turbulent, streaky, white-hot at the nozzle
    float n = fbm( vec3( cs * 2.3, along * 5.0 - time * 13.0 ) );
    float streak = fbm( vec3( cs * 7.0, along * 1.6 - time * 7.0 ) );
    float t = along + ( n - 0.5 ) * 0.38;
    vec3 col = mix( cHot * 1.5, cMid * 1.0, smoothstep( 0.0, 0.62, t ) );
    col = mix( col, cTail * 0.5, smoothstep( 0.55, 1.0, t ) );
    float a = ( 1.0 - smoothstep( 0.08, 1.0, t ) ) * ( 0.25 + 0.45 * streak );
    e = col * a * intensity;
  } else if ( layer < 1.5 ) {
    // the jet column and its shock diamonds
    float n = fbm( vec3( cs * 1.7, along * 6.0 - time * 11.0 ) );
    float cells = 6.5 - thin * 1.5;
    float ph = fract( along * cells - 0.2 );
    float decay = 1.0 - smoothstep( 0.04, 0.72 + thin * 0.2, along );
    float dia = exp( -pow( ( ph - 0.5 ) * 6.5, 2.0 ) ) * decay;
    float body = 1.0 - smoothstep( 0.06, 1.0, along + ( n - 0.5 ) * 0.45 );
    vec3 col = mix( cMid * 1.2, cTail, smoothstep( 0.04, 0.6, along ) );
    vec3 dcol = mix( cHot * 1.6, cDiamond, smoothstep( 0.05, 0.5, along ) );
    e = ( col * body * body * ( 0.1 + 0.1 * thin ) * ( 0.75 + 0.5 * n ) + dcol * dia * ( 0.38 + 0.3 * thin ) ) * intensity;
  } else {
    // outer mixing layer: ragged orange tongues, a faint heat tint at dry power
    float n = fbm( vec3( cs * 3.1, along * 4.2 - time * 8.5 ) );
    float lick = smoothstep( 0.5, 0.85, n );
    float body = 1.0 - smoothstep( 0.0, 1.0, along + ( n - 0.5 ) * 0.6 );
    vec3 col = mix( cMid, cTail, along );
    e = col * body * ( intensity * ( 0.02 + 0.22 * lick * ( 1.0 - along ) ) ) + mix( cDry, cTail, along ) * body * dry * 0.03 * ( 0.6 + 0.8 * n );
  }
  // no hard spike where a layer closes to its tip
  e *= soft * ( 1.0 - smoothstep( 0.72, 1.0, along ) );
  gl_FragColor = vec4( e, 1.0 );
}
`;

// Nozzle exit glow for distant jets (the lit burner can is a detail part,
// hidden far away): white-hot centre, glowing rim.
const GLOW_FRAG = /* glsl */ `
uniform float intensity;
uniform vec3 cHot;
uniform vec3 cMid;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float r = length( vUv - 0.5 ) * 2.0;
  vec3 col = mix( cHot * 2.0, cMid, smoothstep( 0.0, 0.85, r ) );
  float a = ( 1.0 - smoothstep( 0.3, 1.0, r ) ) * intensity;
  gl_FragColor = vec4( col * a, 1.0 );
}
`;

/** Plume layer shapes: [radius factor, position along the layer] from nozzle to tip. */
const LAYERS: { len: number; rad: number; prof: [number, number][] }[] = [
  { len: 0.36, rad: 0.92, prof: [[0.93, 0], [1.02, 0.1], [0.97, 0.3], [0.78, 0.55], [0.45, 0.82], [0.12, 1]] },
  { len: 1.0, rad: 0.9, prof: [[0.95, 0], [1.0, 0.06], [0.9, 0.2], [0.84, 0.4], [0.66, 0.65], [0.34, 0.88], [0.04, 1]] },
  { len: 1.15, rad: 1.35, prof: [[0.8, 0], [1.0, 0.12], [0.95, 0.4], [0.62, 0.75], [0.08, 1]] },
];

export class AirframeVisual {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  surfaces: ControlSurface[] = [];
  gear: GearLeg[] = [];
  /** `more`: further petals of a split speedbrake, each on its own hinge, opening with the first */
  speedbrake: { pivot: THREE.Object3D; axis: THREE.Vector3; maxDeg: number; more?: { pivot: THREE.Object3D; axis: THREE.Vector3 }[] } | null = null;
  /** airframes that brake by splaying both rudders outward (Su-35S): how far, 0..1 */
  rudderBrake = 0;
  nozzles: Nozzle[] = [];
  /** meshes whose morph target opens a nozzle, and which nozzle */
  nozzleMorphs: { mesh: THREE.Mesh; i: number }[] = [];
  /** nozzle position per nozzle, 0 closed .. 1 open (-1: not set yet) */
  private nozzleOpen: number[] = [];
  /** weapons-bay doors (F-22): hinged panels that follow the aircraft's bay door positions */
  bayDoors: { pivot: THREE.Object3D; axis: THREE.Vector3; bay: WeaponBay; maxDeg: number }[] = [];
  /** the dark bay interiors, shown only while their doors are open */
  bayCavities: { mesh: THREE.Object3D; bay: WeaponBay }[] = [];
  /** stores in the bays: hidden when shut, lowered on their launchers as the doors open */
  private bayStores: { id: number; g: THREE.Object3D; bay: WeaponBay; from: THREE.Vector3; to: THREE.Vector3 }[] = [];
  private firedStations = new Set<number>();
  /** thrust-vectoring nozzle gimbals (Su-35S) */
  vectoring: { pivot: THREE.Object3D; side: -1 | 1 }[] = [];
  readonly cockpitEye = new THREE.Vector3();
  readonly stationMeshes = new Map<number, THREE.Object3D>();
  private flames: { layers: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[]; glow: THREE.Mesh; aspect: number; len: number; ab: number; dry: number; heat: number }[] = [];
  /** this jet's own lit nozzle-interior materials, and the engine each one belongs to */
  private burners: THREE.MeshStandardMaterial[] = [];
  private burnerOf = new Map<THREE.Material, number>();
  private navLights: { mesh: THREE.Object3D; kind: 'red' | 'green' | 'strobe' | 'formation' }[] = [];
  private strobeT = Math.random() * 2;
  /** pitch black: the nav lights and strobes as glowing points that carry for miles */
  private navGlow: THREE.Points | null = null;
  private strobeGlow: THREE.Points | null = null;
  private t = 0;
  canopy: THREE.Mesh | null = null;
  /** loft sections, so the cockpit interior can follow the real canopy / fuselage shape */
  canopySections: Section[] = [];
  fuselageSections: Section[] = [];
  /** body z of the windscreen frame arch and of any canopy bows */
  windscreenArchZ = 0;
  canopyBows: number[] = [];
  /** parts hidden in cockpit view (so the camera can sit inside) */
  hideInCockpit: THREE.Object3D[] = [];
  private insignia: THREE.Object3D[] = [];
  /** the airframe's livery paint material (shared with every jet of its type) */
  paintMat: THREE.MeshStandardMaterial | null = null;
  /** this jet's own paint job, when customised */
  private customMat: THREE.MeshStandardMaterial | null = null;
  /** small parts hidden on distant aircraft */
  detail: THREE.Object3D[] = [];
  private detailOn = true;
  /** seated aircrew whose stick and right arm follow the controls */
  pilots: PilotRig[] = [];
  /** full-detail meshes the far LOD stands in for */
  lodMeshes: THREE.Mesh[] = [];
  farLod: FarLod | null = null;
  private farGroup: THREE.Group | null = null;
  private shadowProxy: THREE.Mesh | null = null;
  private far = false;
  /** single-draw stand-in shown instead of the whole body when the jet is a speck */
  private speck: THREE.Mesh | null = null;
  private speckOn = false;
  wreck = false;

  constructor(readonly ac: Aircraft) {
    this.root.add(this.body);
    this.root.name = 'aircraft-' + ac.callsign;
  }

  /**
   * Register meshes built with a nozzle-open morph target for the nozzle about
   * to be pushed onto `nozzles`. They start open, as on a parked jet.
   */
  morphNozzle(...meshes: THREE.Mesh[]): void {
    for (const m of meshes) {
      if (!m.morphTargetInfluences?.length) continue;
      m.morphTargetInfluences[0] = 1;
      this.nozzleMorphs.push({ mesh: m, i: this.nozzles.length });
    }
  }

  addMesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D = this.body, cast = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** A hinged control surface: geometry built in body frame, hinge line given. */
  addSurface(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    hinge: THREE.Vector3,
    axis: THREE.Vector3,
    kind: ControlSurface['kind'],
    side: -1 | 0 | 1,
    maxDeg: number,
  ): ControlSurface {
    const pivot = new THREE.Group();
    pivot.position.copy(hinge);
    this.body.add(pivot);
    geo.translate(-hinge.x, -hinge.y, -hinge.z);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    pivot.add(m);
    const s: ControlSurface = { pivot, axis: axis.clone().normalize(), kind, side, maxDeg, current: 0 };
    this.surfaces.push(s);
    return s;
  }

  /** A weapons-bay door: geometry built in body frame (shut), hinge line given. */
  addBayDoor(geo: THREE.BufferGeometry, mat: THREE.Material, hinge: THREE.Vector3, axis: THREE.Vector3, bay: WeaponBay, maxDeg: number): void {
    const pivot = new THREE.Group();
    pivot.position.copy(hinge);
    this.body.add(pivot);
    geo.translate(-hinge.x, -hinge.y, -hinge.z);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    pivot.add(m);
    this.bayDoors.push({ pivot, axis: axis.clone().normalize(), bay, maxDeg });
  }

  /** A weapons bay's interior (drawn over the skin, only while the bay is open). */
  addBayCavity(geo: THREE.BufferGeometry, mat: THREE.Material, bay: WeaponBay): void {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = true;
    m.visible = false;
    this.body.add(m);
    this.bayCavities.push({ mesh: m, bay });
  }

  addGearLeg(parts: THREE.Object3D[], hinge: THREE.Vector3, axis: THREE.Vector3, retractDeg: number, hideWhenUp: THREE.Object3D[] = [], stroke = true): GearLeg {
    const pivot = new THREE.Group();
    pivot.position.copy(hinge);
    this.body.add(pivot);
    for (const p of parts) {
      p.position.sub(hinge);
      pivot.add(p);
    }
    const leg: GearLeg = { pivot, axis: axis.clone().normalize(), retractDeg, hideWhenUp, base: stroke ? hinge.clone() : undefined };
    this.gear.push(leg);
    return leg;
  }

  addNavLight(pos: THREE.Vector3, kind: 'red' | 'green' | 'strobe' | 'formation'): void {
    const mats = airframeMaterials();
    const mat = kind === 'red' ? mats.navRed : kind === 'green' ? mats.navGreen : kind === 'strobe' ? mats.strobe : mats.formation;
    const m = new THREE.Mesh(new THREE.SphereGeometry(kind === 'formation' ? 0.05 : 0.08, 8, 6), mat);
    m.position.copy(pos);
    this.body.add(m);
    this.navLights.push({ mesh: m, kind });
  }

  addInsignia(pos: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    const m = makeInsignia(this.ac.team, size);
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    this.body.add(m);
    this.insignia.push(m);
  }

  addTailCode(pos: THREE.Vector3, normal: THREE.Vector3, w: number, h: number, text: string): void {
    const m = makeTailCode(this.ac.team, text, w, h);
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    this.body.add(m);
  }

  /** Afterburner plumes at each nozzle. */
  buildFlames(length: number, style: 'std' | 'blue' = 'std'): void {
    // the AL-41F1S burns with a blue-violet plume; the western engines yellow-orange
    const blue = style === 'blue';
    const col = (r: number, g: number, b: number) => ({ value: new THREE.Color(r, g, b) });
    const colors = () => ({
      cHot: blue ? col(0.78, 0.88, 1.0) : col(1.0, 0.76, 0.4),
      cMid: blue ? col(0.22, 0.38, 1.0) : col(1.0, 0.42, 0.07),
      cTail: blue ? col(0.42, 0.22, 0.95) : col(0.85, 0.3, 0.42),
      cDry: blue ? col(0.3, 0.38, 1.0) : col(1.0, 0.38, 0.1),
      cDiamond: blue ? col(0.75, 0.7, 1.0) : col(1.0, 0.8, 0.86),
    });
    for (const n of this.nozzles) {
      const parent = n.parent ?? this.body;
      const layers: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[] = [];
      LAYERS.forEach((L, k) => {
        const mat = new THREE.ShaderMaterial({
          vertexShader: FLAME_VERT,
          fragmentShader: FLAME_FRAG,
          uniforms: { intensity: { value: 0 }, dry: { value: 0 }, time: { value: 0 }, layer: { value: k }, thin: { value: 0 }, ...colors() },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
        const len = length * L.len;
        // smooth the profile (Catmull-Rom) so the plume's silhouette has no facets
        const ctrl = L.prof.map(([r, u]) => new THREE.Vector3(Math.max(0.002, r * n.radius * L.rad), u * len, 0));
        const pts = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal').getPoints(28).map((p) => new THREE.Vector2(Math.max(0.002, p.x), p.y));
        const geo = new THREE.LatheGeometry(pts, 40);
        // lathe runs along +y (uv.y 0 at the first point): lay it along +z, aft
        geo.rotateX(Math.PI / 2);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(n.pos);
        mesh.frustumCulled = false;
        mesh.renderOrder = 20 + k;
        parent.add(mesh);
        layers.push({ mesh, mat });
      });
      // exit glow for distant jets
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(n.radius * 0.95, 28),
        new THREE.ShaderMaterial({
          vertexShader: FLAME_VERT,
          fragmentShader: GLOW_FRAG,
          uniforms: { intensity: { value: 0 }, ...colors() },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      glow.position.copy(n.pos).add(new THREE.Vector3(0, 0, -0.3));
      if (n.aspect) glow.scale.set(n.aspect, 1 / n.aspect, 1);
      glow.renderOrder = 19;
      parent.add(glow);
      this.flames.push({ layers, glow, aspect: n.aspect ?? 1, len: length, ab: 0, dry: 0, heat: 0 });
    }
  }

  /**
   * Apply a paint job (null / factory at full brightness = the stock scheme).
   * `plain` is the markings-only livery to use under a custom colour.
   */
  applyPaint(cfg: PaintConfig | null, plain: Livery | null): void {
    this.applySuit(cfg?.suit ?? '');
    const base = this.paintMat;
    if (!base) return;
    const stock = !cfg || (cfg.mode === 'factory' && Math.abs(cfg.brightness - 1) < 0.01 && cfg.finish === 'satin');
    let target: THREE.Material = base;
    if (!stock) {
      if (!this.customMat) this.customMat = customSkinMaterial(base, cfg!.mode === 'factory' ? null : plain);
      const m = this.customMat;
      const u = m.userData.skinUniforms as Record<string, THREE.IUniform>;
      // factory mode keeps the stock markings (and the F-15's camouflage)
      if (cfg!.mode === 'factory' || !plain) {
        const bu = base.userData.skinUniforms as Record<string, THREE.IUniform>;
        for (const k of ['skinTop', 'skinBot', 'skinSide', 'skinSideR']) u[k].value = bu[k].value;
      } else {
        const t = plain.cachedTextures();
        u.skinTop.value = t.top;
        u.skinBot.value = t.bot;
        u.skinSide.value = t.side;
        u.skinSideR.value = t.sideR;
      }
      const c = cfg!;
      u.customMode.value = c.mode === 'solid' ? 1 : c.mode === 'wrap' ? WRAPS.find((x) => x.id === c.wrap)?.full ?? 2 : 0;
      (u.customA.value as THREE.Color).set(c.color);
      (u.customB.value as THREE.Color).set(c.color2);
      const w = WRAPS.find((x) => x.id === c.wrap) ?? WRAPS[0];
      u.customTex.value = wrapMask(w.id);
      u.customScale.value = w.tileM;
      u.brightness.value = c.brightness;
      const f = { matte: [0.85, 0.05], satin: [base.roughness, base.metalness], gloss: [0.22, 0.25], metallic: [0.28, 0.85] }[c.finish];
      m.roughness = f[0];
      m.metalness = f[1];
      target = m;
    }
    const prev = target === base ? this.customMat : base;
    this.body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (mesh.material === prev || mesh.material === base || mesh.material === this.customMat)) mesh.material = target;
    });
    if (this.speck) this.speck.material = target;
  }

  private suitOrig = new Map<THREE.Mesh, THREE.Material>();
  private suitMat: THREE.MeshStandardMaterial | null = null;

  /** The pilots' flight suit colour ('' = the standard issue for this jet). */
  applySuit(hex: string): void {
    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.pilotPart !== 'suit') return;
      if (!this.suitOrig.has(m)) this.suitOrig.set(m, m.material as THREE.Material);
      const orig = this.suitOrig.get(m)!;
      if (!hex) {
        m.material = orig;
        return;
      }
      if (!this.suitMat) this.suitMat = (orig as THREE.MeshStandardMaterial).clone();
      this.suitMat.color.set(hex);
      m.material = this.suitMat;
    });
  }

  /** Show / hide the small parts (pilots, ducts, burner cans, probes...). */
  setDetail(on: boolean): void {
    if (on === this.detailOn) return;
    this.detailOn = on;
    for (const o of this.detail) o.visible = on;
  }

  /**
   * Static, opaque airframe meshes: what the far LOD merges and replaces.
   * Gear (retracts), stores (per jet), transparent glass, decals, lights and
   * the small detail parts stay live.
   */
  lodSources(): THREE.Mesh[] {
    const skip = new Set<THREE.Object3D>([...this.detail, ...this.insignia, ...this.navLights.map((l) => l.mesh)]);
    for (const g of this.gear) {
      skip.add(g.pivot);
      g.hideWhenUp.forEach((o) => skip.add(o));
    }
    if (this.canopy) skip.add(this.canopy);
    for (const c of this.bayCavities) skip.add(c.mesh);
    const out: THREE.Mesh[] = [];
    const walk = (o: THREE.Object3D) => {
      if (!o.visible || skip.has(o)) return;
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = m.material as THREE.Material;
        if (!Array.isArray(m.material) && mat instanceof THREE.MeshStandardMaterial && !mat.transparent && m.geometry.attributes.position) out.push(m);
      }
      o.children.forEach(walk);
    };
    this.body.children.forEach(walk);
    return out;
  }

  /**
   * Fold every static, opaque part of the close-up airframe into one mesh per
   * material (small detail parts into their own set, so they still hide with
   * distance). The moving parts -- control surfaces, gear, speedbrake, nozzles,
   * pilots, canopy -- and anything the cockpit view hides stay separate. A
   * jet goes from well over a hundred draw calls to a few dozen.
   */
  mergeStatic(): void {
    this.root.updateMatrixWorld(true);
    // rigid frames: everything fixed inside one of these moves together
    const rigid = new Set<THREE.Object3D>([this.body]);
    for (const s of this.surfaces) rigid.add(s.pivot);
    for (const g of this.gear) rigid.add(g.pivot);
    if (this.speedbrake) {
      rigid.add(this.speedbrake.pivot);
      for (const p of this.speedbrake.more ?? []) rigid.add(p.pivot);
    }
    for (const g of this.vectoring) rigid.add(g.pivot);
    for (const d of this.bayDoors) rigid.add(d.pivot);
    for (const n of this.nozzles) if (n.parent) rigid.add(n.parent);
    // parts with a life of their own stay separate meshes
    const keep = new Set<THREE.Object3D>([...this.insignia, ...this.navLights.map((l) => l.mesh)]);
    for (const g of this.gear) g.hideWhenUp.forEach((o) => keep.add(o));
    for (const r of this.pilots) [r.stick, r.upper, r.fore].forEach((o) => rigid.add(o));
    for (const n of this.nozzleMorphs) keep.add(n.mesh);
    for (const c of this.bayCavities) keep.add(c.mesh);
    if (this.canopy) keep.add(this.canopy);
    const nozzleIn = partMaterials().nozzleIn;
    const detailSet = new Set(this.detail);
    const hideSet = new Set(this.hideInCockpit);
    type Bucket = { root: THREE.Object3D; mat: THREE.Material; detail: boolean; hide: boolean; meshes: THREE.Mesh[] };
    const groups = new Map<string, Bucket>();
    const walk = (o: THREE.Object3D, root: THREE.Object3D, hide: boolean) => {
      if (!o.visible || keep.has(o)) return;
      if (o !== root && rigid.has(o)) return;
      hide ||= hideSet.has(o);
      const m = o as THREE.Mesh;
      if (m.isMesh && m.children.length === 0) {
        const mat = m.material as THREE.Material;
        const ok =
          !Array.isArray(m.material) &&
          mat instanceof THREE.MeshStandardMaterial &&
          !mat.transparent &&
          mat !== nozzleIn &&
          !m.morphTargetInfluences?.length &&
          m.renderOrder === 0 &&
          m.frustumCulled &&
          !!m.geometry.attributes.position &&
          m.geometry.groups.length <= 1;
        if (ok) {
          const detail = detailSet.has(m);
          const key = `${root.uuid}:${mat.uuid}:${detail ? 'd' : ''}:${hide ? 'h' : ''}:${m.userData.pilot ? 'p' : ''}:${m.userData.pilotPart ?? ''}`;
          let g = groups.get(key);
          if (!g) groups.set(key, (g = { root, mat, detail, hide, meshes: [] }));
          g.meshes.push(m);
        }
        return;
      }
      if (m.isMesh) return;
      o.children.forEach((c) => walk(c, root, hide));
    };
    for (const r of rigid) walk(r, r, false);
    const removed = new Set<THREE.Object3D>();
    for (const { root, mat, detail, hide, meshes } of groups.values()) {
      if (meshes.length < 2) continue;
      const inv = root.matrixWorld.clone().invert();
      // every part must carry the same attributes: fill in what one lacks
      const names = new Set<string>();
      for (const m of meshes) for (const k in m.geometry.attributes) names.add(k);
      const list: THREE.BufferGeometry[] = [];
      for (const m of meshes) {
        const src = m.geometry;
        const n = src.attributes.position.count;
        const mtx = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', f32(src.attributes.position, 3));
        if (src.attributes.normal) g.setAttribute('normal', f32(src.attributes.normal, 3));
        let index: ArrayLike<number>;
        if (src.index) index = Uint32Array.from(src.index.array as ArrayLike<number>);
        else index = Uint32Array.from({ length: n }, (_, i) => i);
        const idx = index as Uint32Array;
        if (mtx.determinant() < 0) for (let i = 0; i + 2 < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        if (!g.attributes.normal) g.computeVertexNormals();
        // the livery projects from the body-frame position: keep it untransformed
        const skin = src.attributes.skin ? f32(src.attributes.skin, 3) : null;
        g.applyMatrix4(mtx);
        for (const k of names) {
          if (k === 'position' || k === 'normal') continue;
          const a = src.attributes[k];
          if (k === 'skin') g.setAttribute('skin', skin ?? (g.attributes.position as THREE.BufferAttribute).clone());
          else if (a) g.setAttribute(k, f32(a));
          else {
            const size = meshes.map((x) => x.geometry.attributes[k]).find(Boolean)!.itemSize;
            g.setAttribute(k, filled(n, size, k === 'color' ? 1 : 0));
          }
        }
        list.push(g);
      }
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const merged = new THREE.Mesh(geo, mat);
      merged.name = 'merged';
      // the crew's suit colour still finds its parts
      merged.userData = { ...meshes[0].userData };
      merged.castShadow = meshes.some((m) => m.castShadow);
      merged.receiveShadow = true;
      root.add(merged);
      if (detail) this.detail.push(merged);
      if (hide) this.hideInCockpit.push(merged);
      for (const m of meshes) {
        m.parent?.remove(m);
        removed.add(m);
      }
    }
    if (!removed.size) return;
    this.detail = this.detail.filter((o) => !removed.has(o));
    this.hideInCockpit = this.hideInCockpit.filter((o) => !removed.has(o));
    // free the source geometry no remaining mesh uses
    const used = new Set<THREE.BufferGeometry>();
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) used.add((o as THREE.Mesh).geometry);
    });
    for (const m of removed) {
      const g = (m as THREE.Mesh).geometry;
      if (!used.has(g)) g.dispose();
    }
  }

  /** Merge this (low density) template into far-LOD geometry. */
  buildFarLod(): FarLod {
    this.root.updateMatrixWorld(true);
    const inv = this.body.matrixWorld.clone().invert();
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const shadows: THREE.BufferGeometry[] = [];
    const specks: THREE.BufferGeometry[] = [];
    for (const m of this.lodSources()) {
      const src = m.geometry;
      const mat = m.material as THREE.MeshStandardMaterial;
      const mtx = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      const pos = src.attributes.position;
      const n = pos.count;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', f32(pos, 3));
      if (src.attributes.normal) g.setAttribute('normal', f32(src.attributes.normal, 3));
      let index: number[] | null = null;
      if (src.index) index = Array.from(src.index.array as ArrayLike<number>);
      else {
        index = [];
        for (let i = 0; i < n; i++) index.push(i);
      }
      if (mtx.determinant() < 0) for (let i = 0; i + 2 < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
      if (!g.attributes.normal) g.computeVertexNormals();
      const paint = mat === this.paintMat;
      const skin = src.attributes.skin;
      if (paint && skin) g.setAttribute('skin', f32(skin, 3));
      g.applyMatrix4(mtx);
      if (paint && !skin) g.setAttribute('skin', (g.attributes.position as THREE.BufferAttribute).clone());
      if (mat.vertexColors) g.setAttribute('color', src.attributes.color ? f32(src.attributes.color, 3) : filled(n, 3, 1));
      if (mat.map || mat.normalMap || mat.roughnessMap || mat.metalnessMap || mat.aoMap) g.setAttribute('uv', src.attributes.uv ? f32(src.attributes.uv, 2) : filled(n, 2, 0));
      let list = groups.get(mat);
      if (!list) groups.set(mat, (list = []));
      list.push(g);
      const sh = new THREE.BufferGeometry();
      sh.setAttribute('position', g.attributes.position);
      sh.setIndex(g.index);
      shadows.push(sh);
      // the speck paints every part with the livery: at a few pixels nobody can tell
      const sk = new THREE.BufferGeometry();
      sk.setAttribute('position', g.attributes.position);
      sk.setAttribute('normal', g.attributes.normal);
      sk.setAttribute('skin', g.attributes.skin ?? (g.attributes.position as THREE.BufferAttribute).clone());
      sk.setIndex(g.index);
      specks.push(sk);
    }
    const parts: FarLod['parts'] = [];
    for (const [mat, list] of groups) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      parts.push({ geo, mat });
    }
    const shadow = mergeGeometries(shadows, false) ?? new THREE.BufferGeometry();
    shadow.computeBoundingSphere();
    const speck = mergeGeometries(specks, false) ?? new THREE.BufferGeometry();
    speck.computeBoundingSphere();
    return { parts, shadow, paint: this.paintMat, speck };
  }

  /** Near / far switch from the camera distance (with hysteresis), scaled by the zoom. */
  updateLod(dist: number, tanHalfFov: number): void {
    if (!this.farGroup) {
      this.setDetail(dist < 900);
      return;
    }
    const d = dist * tanHalfFov * lodScale;
    const far = this.far ? d > 150 : d > 175;
    if (far !== this.far) this.setFar(far);
    this.setDetail(!far && dist < 900);
    // a jet only a few pixels across: one draw call instead of 30-40 (airframe
    // parts, canopy, stores, lights, flames)
    const speck = far && !this.insideView && (this.speckOn ? d > 1400 : d > 1600);
    if (speck !== this.speckOn) this.setSpeck(speck);
  }

  private setSpeck(on: boolean): void {
    if (!this.speck) return;
    this.speckOn = on;
    this.speck.visible = on;
    this.body.visible = !on;
  }

  setFar(far: boolean): void {
    if (!this.farGroup || far === this.far) return;
    this.far = far;
    this.farGroup.visible = far;
    if (this.shadowProxy) this.shadowProxy.visible = !far;
    const hidden = this.insideView ? new Set(this.hideInCockpit) : null;
    for (const m of this.lodMeshes) m.visible = !far && !hidden?.has(m);
  }

  get isFar(): boolean {
    return this.far;
  }

  /** Classify small parts after building: they stop casting shadows and cull with distance. */
  finishTemplate(detailMats: Set<THREE.Material>): void {
    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.userData.detail || detailMats.has(m.material as THREE.Material)) {
        m.castShadow = false;
        if (!this.hideInCockpit.includes(m) && !this.gear.some((g) => g.pivot === m.parent)) this.detail.push(m);
      }
    });
  }

  /** A new visual for `ac` sharing this template's geometry and materials. */
  cloneFor(ac: Aircraft): AirframeVisual {
    const v = new AirframeVisual(ac);
    const dst = this.body.clone(true);
    const map = new Map<THREE.Object3D, THREE.Object3D>();
    const walk = (a: THREE.Object3D, b: THREE.Object3D) => {
      map.set(a, b);
      a.children.forEach((c, i) => walk(c, b.children[i]));
    };
    walk(this.body, dst);
    for (const c of [...dst.children]) v.body.add(c);
    map.set(this.body, v.body);
    const M = <T extends THREE.Object3D>(o: T): T => (map.get(o) as T) ?? o;
    v.surfaces = this.surfaces.map((s) => ({ ...s, pivot: M(s.pivot), axis: s.axis.clone(), current: 0 }));
    v.gear = this.gear.map((g) => ({ ...g, pivot: M(g.pivot), axis: g.axis.clone(), hideWhenUp: g.hideWhenUp.map(M) }));
    v.speedbrake = this.speedbrake ? { ...this.speedbrake, pivot: M(this.speedbrake.pivot), more: this.speedbrake.more?.map((p) => ({ pivot: M(p.pivot), axis: p.axis.clone() })) } : null;
    v.rudderBrake = this.rudderBrake;
    v.nozzles = this.nozzles.map((n) => ({ ...n, pos: n.pos.clone(), parent: n.parent ? M(n.parent) : undefined }));
    v.nozzleMorphs = this.nozzleMorphs.map((n) => ({ mesh: M(n.mesh), i: n.i }));
    v.nozzleOpen = this.nozzles.map(() => -1);
    v.vectoring = this.vectoring.map((g) => ({ pivot: M(g.pivot), side: g.side }));
    v.bayDoors = this.bayDoors.map((d) => ({ ...d, pivot: M(d.pivot), axis: d.axis.clone() }));
    v.bayCavities = this.bayCavities.map((c) => ({ mesh: M(c.mesh), bay: c.bay }));
    v.cockpitEye.copy(this.cockpitEye);
    v.canopy = this.canopy ? M(this.canopy) : null;
    v.canopySections = this.canopySections;
    v.fuselageSections = this.fuselageSections;
    v.windscreenArchZ = this.windscreenArchZ;
    v.canopyBows = this.canopyBows;
    v.hideInCockpit = this.hideInCockpit.map(M);
    v.detail = this.detail.map(M);
    v.lodMeshes = this.lodMeshes.map(M);
    v.pilots = this.pilots.map((r) => ({ ...r, stick: M(r.stick), upper: M(r.upper), fore: M(r.fore), p: 0, r: 0 }));
    v.farLod = this.farLod;
    if (this.farLod) {
      const L = this.farLod;
      const fg = new THREE.Group();
      fg.name = 'far-lod';
      for (const p of L.parts) {
        const m = new THREE.Mesh(p.geo, p.mat === L.paint ? this.paintMat! : p.mat);
        m.castShadow = true;
        m.receiveShadow = true;
        fg.add(m);
      }
      fg.visible = false;
      v.body.add(fg);
      v.farGroup = fg;
      const sp = new THREE.Mesh(L.shadow, shadowOnlyMaterial());
      sp.castShadow = true;
      sp.receiveShadow = false;
      sp.name = 'shadow-proxy';
      v.body.add(sp);
      v.shadowProxy = sp;
      const sk = new THREE.Mesh(L.speck, this.paintMat!);
      sk.name = 'speck';
      sk.castShadow = false;
      sk.visible = false;
      v.root.add(sk);
      v.speck = sk;
    }
    v.paintMat = this.paintMat;
    v.navLights = this.navLights.map((l) => ({ mesh: M(l.mesh), kind: l.kind }));
    v.insignia = this.insignia.map(M);
    v.flames = this.flames.map((f) => {
      const layers = f.layers.map((l) => {
        const mesh = M(l.mesh);
        const mat = l.mat.clone();
        mesh.material = mat;
        return { mesh, mat };
      });
      const glow = M(f.glow);
      glow.material = (f.glow.material as THREE.Material).clone();
      return { layers, glow, aspect: f.aspect, len: f.len, ab: 0, dry: 0, heat: 0 };
    });
    // this jet's own lit nozzle interiors: one material per engine, so each
    // can follows its own burner and knows where its axis is
    const shared = partMaterials().nozzleIn;
    const mats = v.nozzles.map((n) => {
      const bm = burnerMaterial();
      const bu = bm.userData.burner as Record<string, THREE.IUniform>;
      bu.zExit.value = n.pos.z;
      bu.zDeep.value = n.pos.z - (n.depth ?? n.radius * 1.5);
      (bu.axisR.value as THREE.Vector3).set(n.pos.x, n.pos.y, n.radius * 1.05);
      return bm;
    });
    if (mats.length) {
      const c = new THREE.Vector3();
      v.body.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.material !== shared) return;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        c.copy(m.geometry.boundingSphere!.center).add(m.position);
        // the nozzle on the same parent whose axis is nearest this mesh
        let best = 0, bd = Infinity;
        v.nozzles.forEach((n, i) => {
          const same = (n.parent ?? v.body) === m.parent;
          const d = (same ? 0 : 1e6) + Math.hypot(c.x - n.pos.x, c.y - n.pos.y);
          if (d < bd) (bd = d), (best = i);
        });
        const bm = mats[best];
        // a mesh placed inside its parent (the F-22's flat nozzle face): axis in its own frame
        if (m.position.lengthSq() > 0) {
          const own = burnerMaterial();
          const ou = own.userData.burner as Record<string, THREE.IUniform>;
          const bu = bm.userData.burner as Record<string, THREE.IUniform>;
          ou.zExit.value = (bu.zExit.value as number) - m.position.z;
          ou.zDeep.value = (bu.zDeep.value as number) - m.position.z;
          (ou.axisR.value as THREE.Vector3).copy(bu.axisR.value as THREE.Vector3).sub(new THREE.Vector3(m.position.x, m.position.y, 0));
          m.material = own;
          mats.push(own);
          v.burnerOf.set(own, best);
        } else m.material = bm;
      });
      mats.forEach((bm, i) => {
        if (!v.burnerOf.has(bm)) v.burnerOf.set(bm, i);
      });
      v.burners = mats;
    }
    return v;
  }

  /** Put store meshes (and pylons) on the stations. */
  buildStores(): void {
    for (const [, obj] of this.stationMeshes) this.body.remove(obj);
    this.stationMeshes.clear();
    this.bayStores = [];
    this.firedStations.clear();
    for (const py of this.pylons) {
      this.body.remove(py);
      py.geometry.dispose();
    }
    this.pylons = [];
    // the pylons never leave: all of them are one mesh (one draw call)
    const pylons: THREE.BufferGeometry[] = [];
    for (const st of this.ac.stations) {
      if (!st.store) continue;
      // bay stores: hidden behind the shut doors, lowered into view as they open
      if (st.def.mount === 'internal') {
        const o = st.def.bayOut;
        if (!st.def.bay || !o) continue;
        const g = new THREE.Group();
        const store = new THREE.Mesh(storeGeometry(st.store), storeMaterial());
        store.castShadow = true;
        g.add(store);
        g.visible = false;
        const p = st.def.pos;
        this.bayStores.push({ id: st.def.id, g, bay: st.def.bay, from: new THREE.Vector3(p[0], p[1], p[2]), to: new THREE.Vector3(o[0], o[1], o[2]) });
        g.position.set(p[0], p[1], p[2]);
        this.body.add(g);
        this.stationMeshes.set(st.def.id, g);
        continue;
      }
      const g = new THREE.Group();
      const p = st.def.pos;
      const cx = storeCenterX(st.def, st.store);
      const cy = storeCenterY(st.def, st.store);
      g.position.set(cx, cy, p[2]);
      const store = new THREE.Mesh(storeGeometry(st.store, this.ac.type), storeMaterial());
      store.castShadow = true;
      g.add(store);
      const drop = st.def.mount === 'pylon' ? (st.def.hang !== undefined ? PYLON_DROP : 0.55) : 0.1;
      const pg = onShoulder(st.def, st.store) ? shoulderGeometry(st.store, st.def.rack! - cx, st.def.hang! - cy) : pylonGeometry(st.def.mount, st.store, drop);
      pylons.push(pg.clone().translate(cx, cy, p[2]));
      this.body.add(g);
      this.stationMeshes.set(st.def.id, g);
    }
    const same = pylons.every((g) => Object.keys(g.attributes).sort().join() === Object.keys(pylons[0].attributes).sort().join() && !!g.index === !!pylons[0].index);
    const geo = pylons.length && same ? mergeGeometries(pylons, false) : null;
    if (!geo)
      for (const g of pylons) {
        const py = new THREE.Mesh(g, storeMaterial());
        py.castShadow = true;
        this.body.add(py);
        this.pylons.push(py);
      }
    else pylons.forEach((g) => g.dispose());
    if (geo) {
      const py = new THREE.Mesh(geo, storeMaterial());
      py.castShadow = true;
      py.receiveShadow = true;
      this.body.add(py);
      this.pylons.push(py);
    }
  }
  private pylons: THREE.Mesh[] = [];

  removeStation(id: number): void {
    const m = this.stationMeshes.get(id);
    if (m) {
      // the pylon stays (it is part of the merged pylon mesh), the store drops
      m.visible = false;
      this.firedStations.add(id);
    }
  }

  cockpit: Cockpit | null = null;
  private insideView = false;

  /** Hide the parts of the exterior model the first-person camera sits inside. */
  setCockpitView(inside: boolean): void {
    if (inside === this.insideView) return;
    this.insideView = inside;
    for (const o of this.hideInCockpit) o.visible = !inside;
  }

  /** The 3D cockpit, built on first use. */
  getCockpit(): Cockpit {
    if (!this.cockpit) this.cockpit = new Cockpit(this);
    return this.cockpit;
  }

  update(dt: number): void {
    const ac = this.ac;
    const fm = ac.fm;
    this.t += dt;
    this.root.position.copy(fm.pos);
    this.root.quaternion.copy(fm.quat);
    const c = ac.controls;
    const alive = ac.alive;

    // control surfaces
    // in the air the surfaces show what the flight-control computers command
    // (trim, damping, coordination), on the ground the raw stick and pedals
    const air = !fm.onGround;
    const pitch = alive ? (air ? fm.defl.e : c.pitch) : 0.2;
    const roll = alive ? (air ? fm.defl.a : c.roll) : 0.6;
    const yaw = alive ? (air ? fm.defl.r : c.yaw) : 0;
    const aoa = fm.alpha / DEG;
    for (const s of this.surfaces) {
      let target = 0;
      switch (s.kind) {
        case 'stab':
          target = -pitch * 0.8 + roll * 0.35 * s.side;
          break;
        case 'canard':
          target = pitch * 0.9;
          break;
        case 'rudder':
          target = yaw + this.rudderBrake * fm.speedbrakePos * s.side;
          break;
        case 'aileron':
          target = roll * s.side;
          break;
        case 'flap':
          target = fm.gearPos > 0.5 ? 0.9 : clamp(aoa / 25, 0, 0.5) + roll * 0.3 * s.side;
          break;
        case 'flaperon':
          // roll like an aileron, drooped together as flaps with the gear down
          target = roll * s.side * 0.85 + (fm.gearPos > 0.5 ? 0.85 : 0);
          break;
        case 'lef':
          target = clamp(aoa / 20, 0, 1) + (fm.gearPos > 0.5 ? 0.5 : 0);
          break;
      }
      target = clamp(target, -1, 1) * s.maxDeg * DEG;
      s.current += (target - s.current) * Math.min(1, dt * 12);
      s.pivot.quaternion.setFromAxisAngle(s.axis, s.current);
    }

    // the pilots' hands on the stick (only worth it when they can be seen)
    if (this.detailOn && !this.far && !this.insideView) for (const r of this.pilots) updatePilot(r, ac, dt);

    // landing gear
    const gp = fm.gearPos;
    // on the ground the oleos stroke: the wheels stay on the runway while the jet
    // squats, dips and leans on its struts
    const su = fm.onGround && gp > 0.98 ? fm.sus : null;
    const sp = su ? Math.sin(su.p * DEG) : 0, sr = su ? Math.sin(su.r * DEG) : 0;
    for (const g of this.gear) {
      g.pivot.quaternion.setFromAxisAngle(g.axis, (1 - gp) * g.retractDeg * DEG);
      const vis = gp > 0.02;
      g.pivot.visible = vis;
      if (g.base) g.pivot.position.set(g.base.x, g.base.y + (su ? su.h + g.base.z * sp + g.base.x * sr : 0), g.base.z);
    }
    if (this.speedbrake) {
      this.speedbrake.pivot.quaternion.setFromAxisAngle(this.speedbrake.axis, fm.speedbrakePos * this.speedbrake.maxDeg * DEG);
      for (const p of this.speedbrake.more ?? []) p.pivot.quaternion.setFromAxisAngle(p.axis, fm.speedbrakePos * this.speedbrake.maxDeg * DEG);
    }
    // weapons bays: doors swing on their hinges, the interior shows, and the
    // stores come down on their launchers (eased like the hydraulics)
    if (this.bayDoors.length) {
      const bd = ac.bayDoor;
      for (const d of this.bayDoors) d.pivot.quaternion.setFromAxisAngle(d.axis, smoothstep(0, 1, bd[d.bay]) * d.maxDeg * DEG);
      for (const c of this.bayCavities) c.mesh.visible = bd[c.bay] > 0.01;
      for (const b of this.bayStores) {
        const k = bd[b.bay];
        b.g.visible = k > 0.02 && !this.firedStations.has(b.id);
        if (b.g.visible) b.g.position.lerpVectors(b.from, b.to, smoothstep(0.35, 1, k));
      }
    }

    // thrust-vectoring nozzles: the exhaust swings opposite to the push it
    // makes (nose up = exits tilt up), and differentially to roll
    // (each nozzle stays inside its real travel: pitch, roll and yaw share it)
    const lim = ac.spec.tvcDeg * DEG;
    for (const g of this.vectoring) {
      const nzl = fm.nozzle;
      let px = alive && air ? -nzl.p - nzl.roll * g.side : 0;
      let py = alive && air ? nzl.y : 0;
      const m = Math.hypot(px, py);
      if (lim > 0 && m > lim) {
        px *= lim / m;
        py *= lim / m;
      }
      g.pivot.rotation.set(px, py, 0);
    }

    // flames
    let rpm = 0;
    for (const r of fm.rpm) rpm += r;
    rpm /= fm.rpm.length;
    const thin = clamp(fm.pos.y / 12000, 0, 1);
    let burnSum = 0;
    let drySum = 0;
    this.updateNozzles(dt, alive);
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const eng = alive && !fm.engineOut[Math.min(i, fm.engineOut.length - 1)] ? 1 : 0;
      const abI = fm.ab[Math.min(i, fm.ab.length - 1)] * eng;
      const dry = clamp((rpm - 0.6) / 0.4, 0, 1) * eng;
      burnSum += abI;
      drySum += dry;
      f.ab = abI;
      f.dry = dry;
      f.heat = Math.min(1, abI + dry * 0.45);
      // the plume grows with the burner stage and stretches in thin air; a rocket's
      // exhaust balloons out wide instead as the air pressure around it falls away
      const rocket = this.ac.spec.rocket ? 1 : 0;
      const stretch = 1 + (rocket ? 0.15 : 0.45) * thin;
      const widen = 1 + rocket * (0.25 + 1.1 * thin);
      const pulse = 1 + 0.035 * Math.sin(this.t * 37 + i * 2.1) + 0.025 * Math.sin(this.t * 23.3 + i) + 0.02 * Math.sin(this.t * 61 + i * 5);
      f.layers.forEach((l, k) => {
        const u = l.mat.uniforms;
        u.intensity.value = abI;
        u.dry.value = dry;
        u.time.value = this.t + i * 1.7;
        u.thin.value = thin;
        const grow = k === 2 ? 0.45 + 0.55 * Math.max(abI, dry * 0.5) : 0.35 + 0.65 * abI;
        // a flat (2D) nozzle's jet starts as a wide, flat ribbon; the jet is as wide as the nozzle exit
        const ex = this.nozzleExit(i);
        l.mesh.scale.set(f.aspect * ex * widen, (ex / f.aspect) * widen, grow * stretch * pulse);
        l.mesh.visible = k === 2 ? abI > 0.01 || dry > 0.05 : abI > 0.01;
      });
      // distant jets: the lit burner can is hidden with the other small parts
      // on a pitch black night the hot nozzle glows at any power (all you can see of a jet)
      const nightGlow = NIGHT.dark ? eng * (0.35 + 0.65 * dry) : 0;
      (f.glow.material as THREE.ShaderMaterial).uniforms.intensity.value = Math.max(nightGlow, this.detailOn ? 0 : clamp(abI * 1.4 + dry * 0.1, 0, 1.6));
    }
    for (const bm of this.burners) {
      const f = this.flames[this.burnerOf.get(bm) ?? 0];
      const bu = bm.userData.burner as Record<string, THREE.IUniform>;
      bu.burn.value = f ? f.ab : burnSum / Math.max(1, this.flames.length);
      bu.dry.value = f ? f.dry : drySum / Math.max(1, this.flames.length);
      bu.burnTime.value = this.t;
    }

    // lights
    this.strobeT += dt;
    const strobeOn = this.strobeT % 1.4 < 0.07;
    for (const l of this.navLights) {
      if (l.kind === 'strobe') l.mesh.visible = strobeOn && alive;
      else l.mesh.visible = alive;
    }
    if (NIGHT.dark && !this.navGlow && this.navLights.length) this.buildNavGlow();
    if (this.navGlow) {
      const show = NIGHT.dark && alive && !this.insideView;
      this.navGlow.visible = show;
      this.strobeGlow!.visible = show && strobeOn;
    }
  }

  private buildNavGlow(): void {
    this.root.updateMatrixWorld(true);
    const inv = this.root.matrixWorld.clone().invert();
    const v = new THREE.Vector3();
    const mk = (kinds: string[], size: number): THREE.Points => {
      const pos: number[] = [];
      const col: number[] = [];
      for (const l of this.navLights) {
        if (!kinds.includes(l.kind)) continue;
        v.setFromMatrixPosition(l.mesh.matrixWorld).applyMatrix4(inv);
        pos.push(v.x, v.y, v.z);
        const c = l.kind === 'red' ? [1, 0.12, 0.06] : l.kind === 'green' ? [0.1, 1, 0.3] : l.kind === 'formation' ? [0.35, 0.6, 0.25] : [1, 1, 1];
        col.push(...c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const pts = new THREE.Points(
        g,
        keepLightsVisible(
          new THREE.PointsMaterial({ size, sizeAttenuation: true, vertexColors: true, map: getSoftDotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        ),
      );
      pts.frustumCulled = false;
      pts.visible = false;
      this.root.add(pts);
      return pts;
    };
    this.navGlow = mk(['red', 'green', 'formation'], 1.6);
    this.strobeGlow = mk(['strobe'], 4);
  }

  /**
   * Variable exhaust nozzles. The engine control sets the nozzle area from the
   * engine state and hydraulic actuators drive the petals there at a limited
   * rate, so the nozzle visibly lags the throttle:
   *  - idle: open (idle area reset: less thrust on the ground and in the flare)
   *  - advancing to military power: it closes down to its smallest throat
   *  - afterburner: it opens with the burner stage, leading the light-off
   *    slightly (so the fan never sees the pressure spike), fully open at max
   *  - engine stopped, no fuel or jet destroyed: no hydraulic pressure, the
   *    petals hang open, as on a parked jet
   */
  private updateNozzles(dt: number, alive: boolean): void {
    if (!this.nozzles.length) return;
    const fm = this.ac.fm;
    const lever = fm.throttleLever;
    for (let i = 0; i < this.nozzles.length; i++) {
      const e = Math.min(i, fm.rpm.length - 1);
      let target = 1;
      if (alive && !fm.engineOut[e] && fm.fuelTotal > 0) {
        const rpm = fm.rpm[e];
        const dry = 0.85 * (1 - smoothstep(0.08, 0.8, rpm));
        const selected = lever > 1.001 && rpm > 0.9 ? clamp((lever - 1) / 0.1, 0.2, 1) : 0;
        const ab = Math.max(fm.ab[e], selected * 0.6);
        target = Math.max(dry, ab > 0.001 ? 0.28 + 0.72 * Math.min(1, ab) : 0);
      }
      let o = this.nozzleOpen[i] ?? -1;
      if (o < 0) o = target;
      // hydraulic actuators: quick to start, rate-limited (about a second end to end)
      o += clamp((target - o) * 4.5, -1.1, 1.1) * Math.min(dt, 0.1);
      this.nozzleOpen[i] = o;
    }
    // in the burner the control loop hunts a little around its setting
    for (const n of this.nozzleMorphs) {
      const e = Math.min(n.i, fm.ab.length - 1);
      const hunt = fm.ab[e] > 0.05 ? 0.012 * Math.sin(this.t * 9.3 + n.i * 1.7) * fm.ab[e] : 0;
      n.mesh.morphTargetInfluences![0] = clamp(this.nozzleOpen[n.i] + hunt, 0, 1);
    }
  }

  /** Current exit size of nozzle i relative to its design radius (1 for a fixed nozzle). */
  private nozzleExit(i: number): number {
    const n = this.nozzles[i];
    if (!n?.area) return 1;
    const o = Math.max(0, this.nozzleOpen[i] ?? 1);
    return n.area[0] + (n.area[1] - n.area[0]) * o;
  }

  /** Hot exhaust columns behind the nozzles, for the heat haze (world space). */
  hazeSources(out: HazeSource[]): void {
    const fm = this.ac.fm;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const n = this.nozzles[i];
      if (!n || f.heat < 0.02) continue;
      const local = n.parent && n.parent !== this.body ? n.parent.position.clone().add(n.pos) : n.pos.clone();
      const a = local.applyQuaternion(fm.quat).add(fm.pos);
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(fm.quat);
      const b = a.clone().addScaledVector(dir, f.len * (0.55 + 0.75 * f.ab));
      out.push({ a, b, r0: n.radius * 1.05 * Math.sqrt(f.aspect), r1: n.radius * (2.0 + 1.2 * f.ab), strength: f.heat });
    }
  }

  dispose(): void {
    // The per-jet materials (suit, burner cans, custom paint, flames) hold no
    // GPU memory of their own and are simply let go: disposing them would drop
    // their compiled shader programs, and the next jet would stall for a
    // second or more recompiling exactly the same shaders.
    this.suitMat = null;
    this.burners = [];
    this.customMat = null;
    this.cockpit?.dispose();
    this.cockpit = null;
  }
}

let _storeMat: THREE.MeshStandardMaterial | null = null;
function storeMaterial(): THREE.MeshStandardMaterial {
  if (!_storeMat) _storeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });
  return _storeMat;
}

function makeTailCode(team: string, text: string, w: number, h: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = team === 'blue' ? 'rgba(40,70,150,0.9)' : 'rgba(160,30,25,0.9)';
  g.fillRect(0, 0, 256, 26);
  g.fillStyle = 'rgba(30,32,36,0.85)';
  g.font = 'bold 64px Arial';
  g.textAlign = 'center';
  g.fillText(text, 128, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }),
  );
  return m;
}
