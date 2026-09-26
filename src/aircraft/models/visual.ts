// Visual representation of an aircraft: the procedural airframe plus
// everything that moves -- control surfaces driven by the pilot's inputs,
// landing gear retraction, speedbrake, afterburner flames with shock
// diamonds, navigation / strobe lights and the stores on each station.

import * as THREE from 'three';
import type { Aircraft } from '../aircraft';
import { airframeMaterials, Section } from './builder';
import { storeGeometry, pylonGeometry } from './stores';
import { DEG } from '../../core/constants';
import { clamp } from '../../core/math';
import { makeInsignia } from './decals';
import { Cockpit } from './cockpit';

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
}

const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
varying float vRad;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vRad = length( position.xy );
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float intensity;
uniform float dry;
uniform float time;
varying vec2 vUv;
varying float vRad;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float along = vUv.y;               // 0 at nozzle, 1 at the tip
  float edge = 1.0 - abs( vUv.x - 0.5 ) * 2.0;  // around the cone
  float flick = 0.85 + 0.15 * sin( time * 70.0 + along * 30.0 ) * sin( time * 43.0 );
  // shock diamonds
  float diamonds = 0.55 + 0.45 * pow( abs( sin( along * 18.0 - time * 2.0 ) ), 6.0 ) * ( 1.0 - along );
  vec3 core = mix( vec3( 1.0, 0.95, 0.85 ), vec3( 1.0, 0.55, 0.18 ), smoothstep( 0.0, 0.55, along ) );
  core = mix( core, vec3( 0.35, 0.45, 1.0 ), smoothstep( 0.55, 1.0, along ) * 0.6 );
  float a = ( 1.0 - smoothstep( 0.2, 1.0, along ) ) * intensity * diamonds * flick;
  // dry-power heat shimmer: short, dim, orange
  vec3 dryCol = vec3( 1.0, 0.4, 0.1 );
  float da = dry * ( 1.0 - smoothstep( 0.0, 0.25, along ) ) * 0.35;
  vec3 col = core * a * 2.2 + dryCol * da;
  gl_FragColor = vec4( col, 1.0 );
}
`;

export class AirframeVisual {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  surfaces: ControlSurface[] = [];
  gear: GearLeg[] = [];
  speedbrake: { pivot: THREE.Object3D; axis: THREE.Vector3; maxDeg: number } | null = null;
  nozzles: Nozzle[] = [];
  readonly cockpitEye = new THREE.Vector3();
  readonly stationMeshes = new Map<number, THREE.Object3D>();
  private flames: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; glow: THREE.Mesh }[] = [];
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

  /** Afterburner flames at each nozzle. */
  buildFlames(length: number): void {
    for (const n of this.nozzles) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        uniforms: { intensity: { value: 0 }, dry: { value: 0 }, time: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const geo = new THREE.CylinderGeometry(n.radius * 0.35, n.radius * 0.85, length, 18, 8, true);
      // uv.y: 0 at nozzle (+Z end is the tip)
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, length / 2);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(n.pos);
      mesh.frustumCulled = false;
      mesh.renderOrder = 20;
      this.body.add(mesh);
      // hot nozzle glow disc
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(n.radius * 0.8, 20),
        new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.position.copy(n.pos).add(new THREE.Vector3(0, 0, -0.05));
      this.body.add(glow);
      this.flames.push({ mesh, mat, glow });
    }
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
      g.position.set(p[0], p[1], p[2]);
      const store = new THREE.Mesh(storeGeometry(st.store), mats.white);
      store.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
      store.castShadow = true;
      g.add(store);
      const drop = st.def.mount === 'pylon' ? 0.55 : 0.1;
      const py = new THREE.Mesh(pylonGeometry(st.def.mount, st.store, drop), mats.paint);
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
    const pitch = alive ? c.pitch : 0.2;
    const roll = alive ? c.roll : 0.6;
    const yaw = alive ? c.yaw : 0;
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

    // flames
    const ab = alive ? fm.afterburner : 0;
    let rpm = 0;
    for (const r of fm.rpm) rpm += r;
    rpm /= fm.rpm.length;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const eng = fm.engineOut[Math.min(i, fm.engineOut.length - 1)] ? 0 : 1;
      const abI = fm.ab[Math.min(i, fm.ab.length - 1)] * eng;
      f.mat.uniforms.intensity.value = abI;
      f.mat.uniforms.dry.value = clamp((rpm - 0.6) / 0.4, 0, 1) * eng;
      f.mat.uniforms.time.value = this.t + i * 1.3;
      f.mesh.scale.set(1, 1, 0.55 + 0.45 * abI + 0.1 * Math.sin(this.t * 40 + i));
      f.mesh.visible = abI > 0.01 || rpm > 0.6;
      (f.glow.material as THREE.MeshBasicMaterial).opacity = clamp(abI * 0.9 + (rpm - 0.7) * 0.4, 0, 0.9);
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
    this.cockpit?.dispose();
    this.cockpit = null;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material instanceof THREE.ShaderMaterial) m.material.dispose();
    });
  }
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
