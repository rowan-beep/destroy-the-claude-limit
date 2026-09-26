// Visual representation of an aircraft: the procedural airframe plus
// everything that moves -- control surfaces driven by the pilot's inputs,
// landing gear retraction, speedbrake, afterburner flames with shock
// diamonds, navigation / strobe lights and the stores on each station.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft';
import { airframeMaterials, Section } from './builder';
import { storeGeometry, pylonGeometry, shoulderGeometry, storeCenterY, storeCenterX, onShoulder, PYLON_DROP } from './stores';
import { DEG } from '../../core/constants';
import { clamp } from '../../core/math';
import { makeInsignia } from './decals';
import { Cockpit } from './cockpit';
import { customSkinMaterial, Livery } from './kit';
import { PaintConfig, WRAPS, wrapMask } from './paint';

export interface ControlSurface {
  pivot: THREE.Object3D;
  axis: THREE.Vector3;
  kind: 'stab' | 'rudder' | 'aileron' | 'flap' | 'canard' | 'lef';
  side: -1 | 0 | 1;
  maxDeg: number;
  current: number;
}

export interface GearLeg {
  pivot: THREE.Object3D;
  axis: THREE.Vector3;
  retractDeg: number;
  hideWhenUp: THREE.Object3D[];
}

export interface Nozzle {
  pos: THREE.Vector3;
  radius: number;
  /** gimbal the nozzle (and its flame) is mounted on; pos is relative to it */
  parent?: THREE.Object3D;
}

// Afterburner plume: three nested, shaped layers per engine (a white-hot
// core, the main plume with shock diamonds, a faint outer heat layer), all
// additive, with flowing fractal-noise turbulence. Each layer fades at its
// silhouette (view-angle falloff), so the plume reads as glowing gas rather
// than a solid cone.
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
uniform vec3 cHot;
uniform vec3 cMid;
uniform vec3 cTail;
uniform vec3 cDry;
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
float fbm( vec3 p ) { return 0.55 * vnoise( p ) + 0.3 * vnoise( p * 2.1 ) + 0.15 * vnoise( p * 4.3 ); }
void main() {
  #include <logdepthbuf_fragment>
  float along = vUv.y;                                   // 0 at the nozzle, 1 at the tip
  float ang = vUv.x * 6.2831853;
  float facing = abs( dot( normalize( vN ), normalize( vV ) ) );
  float soft = pow( facing, 1.4 );                       // thin, fading edges
  // turbulence flowing downstream
  float n = fbm( vec3( cos( ang ) * 1.6, sin( ang ) * 1.6, along * 6.0 - time * 11.0 ) );
  float flick = 0.8 + 0.4 * n;
  vec3 col;
  float a;
  if ( layer < 0.5 ) {
    // white-hot core just behind the flame holders
    float t = smoothstep( 0.0, 0.85, along + ( n - 0.5 ) * 0.3 );
    col = mix( cHot, cMid, t );
    a = ( 1.0 - t ) * intensity * 0.55 * ( 0.9 + 0.2 * n );
  } else if ( layer < 1.5 ) {
    // main plume: shock diamonds (bright discs) fading downstream
    float ph = fract( along * 7.0 - 0.1 );
    float diamond = exp( -pow( ( ph - 0.5 ) * 9.0, 2.0 ) ) * ( 1.0 - smoothstep( 0.04, 0.62, along ) );
    float body = 1.0 - smoothstep( 0.12, 1.0, along + ( n - 0.5 ) * 0.45 );
    col = mix( cMid, cTail, smoothstep( 0.1, 0.9, along ) );
    col = mix( col, cHot, diamond * 0.7 );
    a = ( body * body * 0.3 + diamond * 0.95 ) * intensity * flick;
  } else {
    // outer heat layer: faint at dry power, a soft halo in reheat
    float body = 1.0 - smoothstep( 0.0, 1.0, along + ( n - 0.5 ) * 0.5 );
    col = mix( cDry, cTail, along );
    a = body * ( dry * 0.05 + intensity * 0.07 ) * ( 0.6 + 0.8 * n );
  }
  // no hard spike where a layer closes to its tip
  a *= soft * ( 1.0 - smoothstep( 0.72, 1.0, along ) );
  gl_FragColor = vec4( col * a, 1.0 );
}
`;

// Hot nozzle glow: white-hot centre, glowing rim.
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
  vec3 col = mix( cHot, cMid, smoothstep( 0.0, 0.85, r ) );
  float a = ( 1.0 - smoothstep( 0.3, 1.0, r ) ) * intensity * 0.75;
  gl_FragColor = vec4( col * a, 1.0 );
}
`;

/** Plume layer shapes: [radius factor, position along the layer] from nozzle to tip. */
const LAYERS: { len: number; rad: number; prof: [number, number][] }[] = [
  { len: 0.32, rad: 0.8, prof: [[0.95, 0], [1.0, 0.1], [0.82, 0.45], [0.55, 0.8], [0.3, 1]] },
  { len: 1.0, rad: 1.0, prof: [[0.9, 0], [1.0, 0.08], [0.96, 0.3], [0.72, 0.6], [0.36, 0.88], [0.04, 1]] },
  { len: 1.3, rad: 1.3, prof: [[0.85, 0], [1.0, 0.15], [0.9, 0.5], [0.55, 0.85], [0.05, 1]] },
];

export class AirframeVisual {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  surfaces: ControlSurface[] = [];
  gear: GearLeg[] = [];
  speedbrake: { pivot: THREE.Object3D; axis: THREE.Vector3; maxDeg: number } | null = null;
  nozzles: Nozzle[] = [];
  /** thrust-vectoring nozzle gimbals (Su-35S) */
  vectoring: { pivot: THREE.Object3D; side: -1 | 1 }[] = [];
  readonly cockpitEye = new THREE.Vector3();
  readonly stationMeshes = new Map<number, THREE.Object3D>();
  private flames: { layers: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[]; glow: THREE.Mesh }[] = [];
  private navLights: { mesh: THREE.Object3D; kind: 'red' | 'green' | 'strobe' | 'formation' }[] = [];
  private strobeT = Math.random() * 2;
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
  wreck = false;

  constructor(readonly ac: Aircraft) {
    this.root.add(this.body);
    this.root.name = 'aircraft-' + ac.callsign;
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

  addGearLeg(parts: THREE.Object3D[], hinge: THREE.Vector3, axis: THREE.Vector3, retractDeg: number, hideWhenUp: THREE.Object3D[] = []): GearLeg {
    const pivot = new THREE.Group();
    pivot.position.copy(hinge);
    this.body.add(pivot);
    for (const p of parts) {
      p.position.sub(hinge);
      pivot.add(p);
    }
    const leg: GearLeg = { pivot, axis: axis.clone().normalize(), retractDeg, hideWhenUp };
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
      cHot: blue ? col(0.7, 0.85, 1.0) : col(1.0, 0.82, 0.5),
      cMid: blue ? col(0.18, 0.36, 1.0) : col(1.0, 0.45, 0.1),
      cTail: blue ? col(0.4, 0.2, 0.9) : col(0.75, 0.3, 0.55),
      cDry: blue ? col(0.3, 0.38, 1.0) : col(1.0, 0.38, 0.1),
    });
    for (const n of this.nozzles) {
      const parent = n.parent ?? this.body;
      const layers: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[] = [];
      LAYERS.forEach((L, k) => {
        const mat = new THREE.ShaderMaterial({
          vertexShader: FLAME_VERT,
          fragmentShader: FLAME_FRAG,
          uniforms: { intensity: { value: 0 }, dry: { value: 0 }, time: { value: 0 }, layer: { value: k }, ...colors() },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        });
        const len = length * L.len;
        const pts = L.prof.map(([r, u]) => new THREE.Vector2(Math.max(0.002, r * n.radius * L.rad), u * len));
        const geo = new THREE.LatheGeometry(pts, 28);
        // lathe runs along +y (uv.y 0 at the first point): lay it along +z, aft
        geo.rotateX(Math.PI / 2);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(n.pos);
        mesh.frustumCulled = false;
        mesh.renderOrder = 20 + k;
        parent.add(mesh);
        layers.push({ mesh, mat });
      });
      // hot nozzle glow
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
      glow.position.copy(n.pos).add(new THREE.Vector3(0, 0, -0.05));
      glow.renderOrder = 19;
      parent.add(glow);
      this.flames.push({ layers, glow });
    }
  }

  /**
   * Apply a paint job (null / factory at full brightness = the stock scheme).
   * `plain` is the markings-only livery to use under a custom colour.
   */
  applyPaint(cfg: PaintConfig | null, plain: Livery | null): void {
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
  }

  /** Show / hide the small parts (pilots, ducts, burner cans, probes...). */
  setDetail(on: boolean): void {
    if (on === this.detailOn) return;
    this.detailOn = on;
    for (const o of this.detail) o.visible = on;
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
    v.speedbrake = this.speedbrake ? { ...this.speedbrake, pivot: M(this.speedbrake.pivot) } : null;
    v.nozzles = this.nozzles.map((n) => ({ pos: n.pos.clone(), radius: n.radius, parent: n.parent ? M(n.parent) : undefined }));
    v.vectoring = this.vectoring.map((g) => ({ pivot: M(g.pivot), side: g.side }));
    v.cockpitEye.copy(this.cockpitEye);
    v.canopy = this.canopy ? M(this.canopy) : null;
    v.canopySections = this.canopySections;
    v.fuselageSections = this.fuselageSections;
    v.windscreenArchZ = this.windscreenArchZ;
    v.canopyBows = this.canopyBows;
    v.hideInCockpit = this.hideInCockpit.map(M);
    v.detail = this.detail.map(M);
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
      return { layers, glow };
    });
    return v;
  }

  /** Put store meshes (and pylons) on the stations. */
  buildStores(): void {
    const mats = airframeMaterials();
    for (const [, obj] of this.stationMeshes) this.body.remove(obj);
    this.stationMeshes.clear();
    for (const st of this.ac.stations) {
      if (!st.store) continue;
      const g = new THREE.Group();
      const p = st.def.pos;
      const cx = storeCenterX(st.def, st.store);
      const cy = storeCenterY(st.def, st.store);
      g.position.set(cx, cy, p[2]);
      const store = new THREE.Mesh(storeGeometry(st.store), storeMaterial());
      store.castShadow = true;
      g.add(store);
      const drop = st.def.mount === 'pylon' ? (st.def.hang !== undefined ? PYLON_DROP : 0.55) : 0.1;
      const py = new THREE.Mesh(
        onShoulder(st.def, st.store) ? shoulderGeometry(st.store, st.def.rack! - cx, st.def.hang! - cy) : pylonGeometry(st.def.mount, st.store, drop),
        storeMaterial(),
      );
      py.castShadow = true;
      g.add(py);
      this.body.add(g);
      this.stationMeshes.set(st.def.id, g);
    }
  }

  removeStation(id: number): void {
    const m = this.stationMeshes.get(id);
    if (m) {
      // keep the pylon, drop the store
      if (m.children[0]) m.children[0].visible = false;
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
          target = yaw;
          break;
        case 'aileron':
          target = roll * s.side;
          break;
        case 'flap':
          target = fm.gearPos > 0.5 ? 0.9 : clamp(aoa / 25, 0, 0.5) + roll * 0.3 * s.side;
          break;
        case 'lef':
          target = clamp(aoa / 20, 0, 1) + (fm.gearPos > 0.5 ? 0.5 : 0);
          break;
      }
      target = clamp(target, -1, 1) * s.maxDeg * DEG;
      s.current += (target - s.current) * Math.min(1, dt * 12);
      s.pivot.quaternion.setFromAxisAngle(s.axis, s.current);
    }

    // landing gear
    const gp = fm.gearPos;
    for (const g of this.gear) {
      g.pivot.quaternion.setFromAxisAngle(g.axis, (1 - gp) * g.retractDeg * DEG);
      const vis = gp > 0.02;
      g.pivot.visible = vis;
    }
    if (this.speedbrake) {
      this.speedbrake.pivot.quaternion.setFromAxisAngle(this.speedbrake.axis, fm.speedbrakePos * this.speedbrake.maxDeg * DEG);
    }

    // thrust-vectoring nozzles: the exhaust swings opposite to the push it
    // makes (nose up = exits tilt up), and differentially to roll
    for (const g of this.vectoring) {
      const nzl = fm.nozzle;
      g.pivot.rotation.set(alive && air ? -nzl.p - nzl.roll * g.side : 0, alive && air ? nzl.y : 0, 0);
    }

    // flames
    const ab = alive ? fm.afterburner : 0;
    let rpm = 0;
    for (const r of fm.rpm) rpm += r;
    rpm /= fm.rpm.length;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const eng = fm.engineOut[Math.min(i, fm.engineOut.length - 1)] ? 0 : 1;
      const abI = fm.ab[Math.min(i, fm.ab.length - 1)] * eng;
      const dry = clamp((rpm - 0.6) / 0.4, 0, 1) * eng;
      // the plume grows with the burner stage and stretches in thin air
      const thin = 1 + 0.35 * clamp(fm.pos.y / 12000, 0, 1);
      const pulse = 1 + 0.04 * Math.sin(this.t * 37 + i * 2.1) + 0.03 * Math.sin(this.t * 23.3 + i);
      f.layers.forEach((l, k) => {
        const u = l.mat.uniforms;
        u.intensity.value = abI;
        u.dry.value = dry;
        u.time.value = this.t + i * 1.7;
        const grow = k === 2 ? 0.45 + 0.55 * Math.max(abI, dry * 0.5) : 0.4 + 0.6 * abI;
        l.mesh.scale.set(1, 1, grow * thin * pulse);
        l.mesh.visible = k === 2 ? abI > 0.01 || dry > 0.05 : abI > 0.01;
      });
      (f.glow.material as THREE.ShaderMaterial).uniforms.intensity.value = clamp(abI * 1.1 + dry * 0.35, 0, 1.2);
    }
    void ab;

    // lights
    this.strobeT += dt;
    const strobeOn = this.strobeT % 1.4 < 0.07;
    for (const l of this.navLights) {
      if (l.kind === 'strobe') l.mesh.visible = strobeOn && alive;
      else l.mesh.visible = alive;
    }
  }

  dispose(): void {
    this.customMat?.dispose();
    this.customMat = null;
    this.cockpit?.dispose();
    this.cockpit = null;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material instanceof THREE.ShaderMaterial) m.material.dispose();
    });
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
