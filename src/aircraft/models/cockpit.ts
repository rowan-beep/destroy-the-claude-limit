// The 3D cockpit shown in the first-person view, built per aircraft from
// its layout (cockpitLayouts.ts) and the real canopy / fuselage loft
// sections so the frames line up with the glass seen from outside.
//
// It is rendered in its own pass (render/cockpitView.ts) with a tight
// near plane and its own sun shadow map, so the canopy bows throw crisp
// shadows across the panel as the jet manoeuvres.
//
// Moving parts: stick, twin throttles, rudder pedals, gear handle; lit
// annunciators: LOCK / SHOOT, MASTER CAUTION, engine FIRE, gear lights.
// Display screens get their canvas textures from the avionics.

import { AIRFIELDS, activeMap } from '../../world/islands';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AirframeVisual } from './visual';
import { COCKPIT_LAYOUTS, CockpitLayout, DisplayMount } from './cockpitLayouts';
import { Section, sectionAt, sectionArch, sectionHalfWidthAt, sectionPoint, loft } from './builder';
import { consoleTexture, panelTexture, keypadTexture, stripeTexture, legendTexture, cushionTexture, canopyScratchTexture, PanelControl } from './cockpitTextures';
import { osbPosition } from '../../avionics/draw';
import { clamp, lerp } from '../../core/math';

export interface CockpitSlot {
  mount: DisplayMount;
  index: number;
  screen: THREE.Mesh;
  osb: THREE.InstancedMesh | null;
}

export interface CockpitState {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
  gearPos: number;
  gearHandleDown: boolean;
  lock: boolean;
  shoot: boolean;
  masterCaution: boolean;
  fireL: boolean;
  fireR: boolean;
  blink: boolean;
}

interface Lamp {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function std(color: number, rough = 0.85, metal = 0.15, map: THREE.Texture | null = null): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, map });
}

/**
 * The canopy acrylic seen from inside: nearly clear, a fresnel sheen of the
 * sky, and when you look toward the sun its scratches, wipe swirls and dust
 * light up around the sun's position with a soft veiling haze.
 */
function canopyGlassMaterial(scratch: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: 0xdfe8f0,
    transparent: true,
    opacity: 0.04,
    roughness: 0.03,
    metalness: 0.5,
    depthWrite: false,
    side: THREE.BackSide,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.scratchMap = { value: scratch };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGlassUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvGlassUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGlassUv;\nuniform sampler2D scratchMap;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 Vd = normalize( -vViewPosition );
          float al = max( dot( Vd, directionalLights[ 0 ].direction ), 0.0 );
          float halo = pow( al, 9.0 );
          float core = pow( al, 70.0 );
          float sc = texture2D( scratchMap, vGlassUv * vec2( 7.0, 5.0 ) ).r;
          vec3 glint = directionalLights[ 0 ].color * ( sc * ( halo * 0.3 + core * 1.4 ) + halo * 0.01 + core * 0.05 );
          float ga = clamp( dot( glint, vec3( 0.33 ) ), 0.0, 1.0 );
          float na = clamp( gl_FragColor.a + ga, 0.0, 1.0 );
          gl_FragColor.rgb = ( gl_FragColor.rgb * gl_FragColor.a + glint ) / max( na, 1e-4 );
          gl_FragColor.a = na;
        }
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'canopy-glass-v2';
  return m;
}

/** Rounded rectangle shape centred on the origin. */
function roundRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Capsule between two points. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 10);
  _v.subVectors(b, a).normalize();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v);
  g.applyQuaternion(_q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/**
 * Prism from a closed side profile (z, y) swept across x, with a half-width
 * that may vary with z (tapered glare shields, consoles).
 */
function prism(prof: [number, number][], halfWidth: (z: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const n = prof.length;
  const P = (i: number, side: number): [number, number, number] => {
    const [z, y] = prof[(i + n) % n];
    return [side * halfWidth(z), y, z];
  };
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  // side walls
  for (let i = 0; i < n; i++) {
    const a = P(i, -1), b = P(i + 1, -1), c = P(i + 1, 1), d = P(i, 1);
    tri(a, b, c);
    tri(a, c, d);
  }
  // end caps (fan)
  for (const side of [-1, 1]) {
    const c0 = P(0, side);
    for (let i = 1; i < n - 1; i++) {
      if (side < 0) tri(c0, P(i + 1, side), P(i, side));
      else tri(c0, P(i, side), P(i + 1, side));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export class Cockpit {
  readonly root = new THREE.Group();
  readonly slots: CockpitSlot[] = [];
  readonly clickables: THREE.Object3D[] = [];
  readonly layout: CockpitLayout;
  readonly eye: THREE.Vector3;
  private stick = new THREE.Group();
  private throttles: THREE.Group[] = [];
  private pedals: THREE.Group[] = [];
  private gearLever = new THREE.Group();
  private lamps: Record<string, Lamp> = {};
  private gearGreens: Lamp[] = [];
  private gearRed: Lamp | null = null;
  private statics = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  /** panel frame */
  private panelTop = new THREE.Vector3();
  private panelQuat = new THREE.Quaternion();
  private dDown = new THREE.Vector3();
  private nOut = new THREE.Vector3();
  private sillY = 0;
  private floorY = 0;
  private consoleY = 0;
  /** the switches, knobs and buttons set into the instrument panel between the displays */
  private controls: PanelControl[] = [];

  constructor(readonly v: AirframeVisual) {
    this.root.name = 'cockpit';
    const L = (this.layout = COCKPIT_LAYOUTS[v.ac.type]);
    this.eye = v.cockpitEye.clone();
    const eye = this.eye;
    const t = L.panelTilt;
    this.panelTop.set(0, eye.y - L.panelDrop, eye.z - L.panelDist);
    this.dDown.set(0, -Math.cos(t), Math.sin(t));
    this.nOut.set(0, Math.sin(t), Math.cos(t));
    _m.makeBasis(new THREE.Vector3(1, 0, 0), this.dDown.clone().negate(), this.nOut);
    this.panelQuat.setFromRotationMatrix(_m);
    const can = v.canopySections;
    this.sillY = can.length ? sectionAt(can, eye.z).y ?? eye.y - 0.37 : eye.y - 0.37;
    this.floorY = eye.y - 1.05;
    this.consoleY = eye.y - L.consoleDrop;

    this.controls = this.planControls();
    const M = this.makeMaterials();
    this.buildTub(M);
    this.buildPanel(M);
    this.buildControls(M);
    this.buildGlareShield(M);
    this.buildHud(M);
    this.buildDisplays(M);
    this.buildAnnunciators(M);
    this.buildGear(M);
    this.buildConsoles(M);
    this.buildThrottles(M);
    this.buildStick(M);
    this.buildPedals(M);
    this.buildSeat(M);
    this.buildPilot(M);
    this.buildCanopyFrame(M);
    this.flushStatics();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = !(m.material as THREE.Material).transparent;
        m.receiveShadow = true;
      }
    });
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private addStatic(geo: THREE.BufferGeometry, mat: THREE.Material): void {
    // normalise attributes so geometries merge
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    let list = this.statics.get(mat);
    if (!list) this.statics.set(mat, (list = []));
    list.push(g);
  }

  private flushStatics(): void {
    for (const [mat, list] of this.statics) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      this.root.add(mesh);
    }
    this.statics.clear();
  }

  /** Position on the panel plane. */
  panelPoint(px: number, py: number, off = 0): THREE.Vector3 {
    return this.panelTop.clone().addScaledVector(new THREE.Vector3(1, 0, 0), px).addScaledVector(this.dDown, py).addScaledVector(this.nOut, off);
  }

  /** Geometry authored facing +Z (toward the pilot), moved onto the panel. */
  private toPanel(g: THREE.BufferGeometry, px: number, py: number, off: number, yaw = 0): THREE.BufferGeometry {
    if (yaw) g.applyQuaternion(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    g.applyQuaternion(this.panelQuat);
    const p = this.panelPoint(px, py, off);
    g.translate(p.x, p.y, p.z);
    return g;
  }

  /** The glare-shield frame: x across, y down from its top at the lip, facing the pilot tilted back. */
  private glareFrame(): { q: THREE.Quaternion; o: THREE.Vector3; down: THREE.Vector3; out: THREE.Vector3 } {
    const L = this.layout, eye = this.eye;
    const tilt = 0.22;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tilt);
    const o = new THREE.Vector3(0, eye.y - L.glareDrop + 0.07, eye.z - L.panelDist + L.glareLip - 0.02);
    return { q, o, down: new THREE.Vector3(0, -1, 0).applyQuaternion(q), out: new THREE.Vector3(0, 0, 1).applyQuaternion(q) };
  }

  private toGlare(g: THREE.BufferGeometry, px: number, py: number, off: number, yaw = 0): THREE.BufferGeometry {
    const F = this.glareFrame();
    if (yaw) g.applyQuaternion(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    g.applyQuaternion(F.q);
    const p = F.o.clone().addScaledVector(new THREE.Vector3(1, 0, 0), px).addScaledVector(F.down, py).addScaledVector(F.out, off);
    g.translate(p.x, p.y, p.z);
    return g;
  }

  private placeOnGlare(o: THREE.Object3D, px: number, py: number, off: number, yaw = 0): void {
    const F = this.glareFrame();
    o.quaternion.copy(F.q);
    if (yaw) o.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    o.position.copy(F.o).addScaledVector(new THREE.Vector3(1, 0, 0), px).addScaledVector(F.down, py).addScaledVector(F.out, off);
  }

  private placeOnPanel(o: THREE.Object3D, px: number, py: number, off: number, yaw = 0): void {
    o.quaternion.copy(this.panelQuat);
    if (yaw) o.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    o.position.copy(this.panelPoint(px, py, off));
  }

  private makeMaterials() {
    const L = this.layout;
    const tex = <T extends THREE.Texture>(t: T): T => {
      this.textures.push(t);
      return t;
    };
    const stripes = tex(stripeTexture());
    stripes.repeat.set(3, 1);
    const stripesRu = tex(stripeTexture('#e8e4dc', '#b3221a'));
    stripesRu.repeat.set(3, 1);
    return {
      tub: this.mat(std(L.tub, 0.92, 0.05)),
      panel: this.mat(std(0xffffff, 0.86, 0.08, tex(panelTexture(L.panel, L.label, this.panelFace())))),
      panelPlain: this.mat(std(L.panel, 0.85, 0.1)),
      console: this.mat(std(0xffffff, 0.8, 0.1, tex(consoleTexture(L.console, 11, L.lang === 'ru')))),
      consoleR: this.mat(std(0xffffff, 0.8, 0.1, tex(consoleTexture(L.console, 29, L.lang === 'ru')))),
      consolePlain: this.mat(std(L.console, 0.85, 0.1)),
      frame: this.mat(std(L.frame, 0.55, 0.35)),
      bezel: this.mat(std(L.bezel ?? 0x17191b, 0.6, 0.2)),
      glare: this.mat(std(L.glare ?? 0x0d0e0f, 0.95, 0.0)),
      grip: this.mat(std(L.gripColor ?? 0x121416, 0.75, 0.1)),
      stripeRu: this.mat(std(0xffffff, 0.6, 0.1, stripesRu)),
      button: this.mat(std(0x2e3135, 0.55, 0.25)),
      dark: this.mat(std(0x121416, 0.85, 0.1)),
      metal: this.mat(std(0x8c9298, 0.35, 0.8)),
      seat: this.mat(std(L.seat, 0.85, 0.1)),
      cushion: this.mat(std(0xffffff, 0.95, 0.0, tex(cushionTexture(0x39452f)))),
      suit: this.mat(std(0x444c3b, 0.95, 0.0)),
      boot: this.mat(std(0x1a1a1a, 0.7, 0.05)),
      glove: this.mat(std(0x3a3226, 0.9, 0.0)),
      stripe: this.mat(std(0xffffff, 0.6, 0.1, stripes)),
      keypad: this.mat(std(0xffffff, 0.7, 0.1, tex(keypadTexture(L.panel)))),
      rubber: this.mat(std(0x0d0e0f, 0.95, 0.0)),
      white: this.mat(std(0xd8d8d0, 0.6, 0.1)),
      mirror: this.mat(new THREE.MeshStandardMaterial({ color: 0x6d757c, roughness: 0.08, metalness: 1.0 })),
      // the combiner is almost clear: a faint green-gold coating that shows mostly as reflections
      hudGlass: this.mat(
        new THREE.MeshStandardMaterial({
          color: 0xd6f5e0,
          transparent: true,
          opacity: 0.035,
          roughness: 0.02,
          metalness: 0.6,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ),
      canopyGlass: this.mat(canopyGlassMaterial(tex(canopyScratchTexture()))),
      screenGlass: this.mat(
        new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.12, metalness: 0.0, envMapIntensity: 0.9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      ),
    };
  }

  // -------------------------------------------------------------------------
  // structure
  // -------------------------------------------------------------------------

  /** the canopy sill's height at z (the top of the tub's side walls) */
  private tubSill(z: number): number {
    const can = this.v.canopySections;
    return can.length ? (sectionAt(can, clamp(z, can[0].z, can[can.length - 1].z)).y ?? this.sillY) : this.sillY;
  }

  /** the tub's inner half width at z (its side walls) */
  private tubHalfWidth(z: number): number {
    const fus = this.v.fuselageSections;
    const fs = fus.length ? sectionAt(fus, z) : ({ z, w: 0.6, top: 0.6, bot: 0.6 } as Section);
    // (never narrower than the instrument panel: its edges must not poke through the side walls)
    return Math.max(0.36, sectionHalfWidthAt(fs, this.tubSill(z)) * 0.93, this.layout.panelHalfWidth + 0.03);
  }

  private buildTub(M: ReturnType<Cockpit['makeMaterials']>): void {
    const v = this.v;
    const eye = this.eye;
    const L = this.layout;
    const zFront = eye.z - L.panelDist - 0.12;
    const zBack = eye.z + 0.8;
    const fus = v.fuselageSections;
    const can = v.canopySections;
    const N = 12;
    void fus;
    const profile = (z: number): [number, number][] => {
      const sill = this.tubSill(z);
      const hw = this.tubHalfWidth(z);
      const fy = this.floorY;
      return [
        [-hw, sill + 0.01],
        [-hw * 0.99, sill - 0.2],
        [-hw * 0.9, fy + 0.18],
        [-hw * 0.55, fy],
        [hw * 0.55, fy],
        [hw * 0.9, fy + 0.18],
        [hw * 0.99, sill - 0.2],
        [hw, sill + 0.01],
      ];
    };
    const pos: number[] = [];
    const idx: number[] = [];
    const P = 8;
    for (let i = 0; i <= N; i++) {
      const z = lerp(zFront, zBack, i / N);
      for (const [x, y] of profile(z)) pos.push(x, y, z);
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < P - 1; j++) {
        const a = i * P + j, b = a + 1, c = a + P, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const tubMat = M.tub.clone();
    tubMat.side = THREE.DoubleSide;
    this.materials.push(tubMat);
    this.addStatic(g, tubMat);
    // front and aft bulkheads
    for (const [z, sgn] of [
      [zFront, 1],
      [zBack, -1],
    ] as const) {
      const pr = profile(z);
      const shape = new THREE.Shape();
      shape.moveTo(pr[0][0], pr[0][1]);
      for (let k = 1; k < pr.length; k++) shape.lineTo(pr[k][0], pr[k][1]);
      shape.closePath();
      const sg = new THREE.ShapeGeometry(shape);
      sg.translate(0, 0, z);
      void sgn;
      this.addStatic(sg, tubMat);
    }
    // aft bulkhead rises behind the seat up to the canopy (headrest fairing)
    const aft = new THREE.BoxGeometry(0.62, 0.36, 0.06);
    aft.translate(0, this.sillY + 0.14, zBack - 0.02);
    this.addStatic(aft, M.tub);
    // canopy sills (rails) along both sides
    for (const sx of [-1, 1]) {
      const zs = this.v.windscreenArchZ || eye.z - 0.55;
      const len = zBack - zs;
      const rail = new THREE.BoxGeometry(0.07, 0.045, len);
      const hw = can.length ? sectionHalfWidthAt(sectionAt(can, eye.z), this.sillY + 0.02) : 0.45;
      rail.translate(sx * (hw - 0.02), this.sillY + 0.005, zs + len / 2);
      this.addStatic(rail, M.frame);
    }
  }

  private buildPanel(M: ReturnType<Cockpit['makeMaterials']>): void {
    const L = this.layout;
    const W = L.panelHalfWidth, H = L.panelHeight;
    const s = new THREE.Shape();
    const notchW = 0.12, notchH = this.kneeNotch();
    if (L.panelShape === 'arch') {
      // a D-shaped panel: straight sides, the top a round arch peaking over the middle
      s.moveTo(-W, -H * 0.42);
      s.bezierCurveTo(-W, -H * 0.06, -W * 0.56, 0, 0, 0);
      s.bezierCurveTo(W * 0.56, 0, W, -H * 0.06, W, -H * 0.42);
    } else {
      s.moveTo(-W, 0);
      s.lineTo(W, 0);
    }
    s.lineTo(W, -H + 0.05);
    s.lineTo(W - 0.05, -H);
    if (notchH > 0) {
      s.lineTo(notchW, -H);
      s.lineTo(notchW - 0.03, -H + notchH);
      s.lineTo(-notchW + 0.03, -H + notchH);
      s.lineTo(-notchW, -H);
    }
    s.lineTo(-W + 0.05, -H);
    s.lineTo(-W, -H + 0.05);
    if (L.panelShape === 'arch') s.lineTo(-W, -H * 0.42);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
    // UVs from the face outline
    const pos = g.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) + W) / (2 * W);
      uv[i * 2 + 1] = (pos.getY(i) + H) / H;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.translate(0, 0, -0.056);
    // shape y runs up the panel: map (x, y, z) -> right, up-along-panel, normal
    this.addStatic(this.toPanel(g, 0, 0, 0), M.panel);
    // lower sub-panel / knee well box closes the gap under the panel
    const kw = new THREE.BoxGeometry(2 * W, 0.3, 0.3);
    const p = this.panelPoint(0, H, -0.18);
    kw.translate(p.x, p.y - 0.15, p.z);
    this.addStatic(kw, M.panelPlain);
  }

  /**
   * How deep the knee notch in the panel's lower edge can be: 9 cm, less where a display reaches down
   * over it (a display must never hang over the cut-out), none when there is no room for one.
   */
  private kneeNotch(): number {
    const H = this.layout.panelHeight;
    let low = 0;
    for (const k of this.panelKeep()) if (Math.abs(k.px) - k.w / 2 < 0.12) low = Math.max(low, k.py + k.h / 2);
    const d = Math.min(0.09, H - low - 0.006);
    return d >= 0.025 ? d : 0;
  }

  /** The panel's displays (on the panel itself) as rectangles, with their bezels. */
  private panelKeep(): { px: number; py: number; w: number; h: number }[] {
    return this.layout.displays
      .filter((d) => !d.onGlare)
      .map((d) => {
        const m = d.bezel === 'osb' ? 0.03 : d.bezel === 'touch' ? 0.014 : d.bezel === 'hood' ? 0.016 : 0.008;
        return { px: d.px, py: d.py, w: d.sw + 2 * m, h: d.sh + 2 * m };
      });
  }

  private panelFace() {
    const L = this.layout;
    return { hw: L.panelHalfWidth, h: L.panelHeight, keep: this.panelKeep(), controls: this.controls, ru: L.lang === 'ru' };
  }

  /**
   * Where the panel's switches, knobs and buttons go: every free spot between the displays (not
   * under the glare-shield lip, not in the knee notch, not on the gear handle's plate), on a grid, a
   * deterministic mix of kinds with their legends in the jet's language.
   */
  private planControls(): PanelControl[] {
    const L = this.layout;
    const W = L.panelHalfWidth, H = L.panelHeight;
    const keep = this.panelKeep();
    const ru = L.lang === 'ru';
    const labels = ru
      ? ['ОСВ', 'ЯРК', 'ПИТ', 'КОНТР', 'РЕЖ', 'ТОПЛ', 'СВЕТ', 'СВЯЗЬ', 'АВАР', 'ОТКАЗ', 'ПРОВ', 'ПРФ', 'ИЗД', 'ГЕН', 'ВЫКЛ']
      : ['BRT', 'MODE', 'TEST', 'PWR', 'CMPTR', 'FUEL', 'LIGHTS', 'COMM', 'EMER', 'RESET', 'HUD', 'IFF', 'NAV', 'GEN', 'ANTI-SKID', 'PROBE', 'ALT FLAPS', 'HOOK'];
    const kinds: PanelControl['kind'][] = ['knob', 'toggle', 'toggle', 'button', 'knob', 'guard'];
    const notch = this.kneeNotch();
    const out: PanelControl[] = [];
    const clear = (x: number, y: number) =>
      keep.every((k) => Math.abs(x - k.px) > k.w / 2 + 0.03 || Math.abs(y - k.py) > k.h / 2 + 0.03);
    let n = 0;
    for (let y = 0.05; y < H - 0.03; y += 0.05) {
      for (let x = -W + 0.035; x < W - 0.03; x += 0.044) {
        n++;
        const h = Math.abs(Math.sin(n * 12.9898 + L.label.length * 78.233) * 43758.5453) % 1;
        if (h < 0.35) continue;
        if (!clear(x, y)) continue;
        if (notch > 0 && Math.abs(x) < 0.15 && y > H - notch - 0.02) continue; // the knee notch
        if (x < -W + 0.12 && y > H - 0.17) continue; // the gear handle
        if (L.panelShape === 'arch' && y < 0.42 * H * Math.pow(Math.abs(x) / W, 2.2) + 0.03) continue;
        out.push({ px: x, py: y, kind: kinds[Math.floor(h * 997) % kinds.length], label: labels[Math.floor(h * 7919) % labels.length] });
      }
    }
    return out;
  }

  /** The panel's switches, knobs and buttons in 3D, on their drawn sub-panels. */
  private buildControls(M: ReturnType<Cockpit['makeMaterials']>): void {
    const red = this.mat(std(0x8c1a14, 0.5, 0.1));
    const lens = this.mat(new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.3, metalness: 0.0, emissive: 0x8a7a3a, emissiveIntensity: 0.12 }));
    for (const c of this.controls) {
      const y = c.py + 0.003;
      if (c.kind === 'knob') {
        // a fluted knob on a skirt, its pointer line on top
        const skirt = new THREE.CylinderGeometry(0.0105, 0.0115, 0.004, 16);
        skirt.rotateX(Math.PI / 2);
        skirt.translate(0, 0, 0.002);
        this.addStatic(this.toPanel(skirt, c.px, y, 0), M.dark);
        const knob = new THREE.CylinderGeometry(0.0075, 0.0085, 0.012, 12);
        knob.rotateX(Math.PI / 2);
        knob.translate(0, 0, 0.01);
        this.addStatic(this.toPanel(knob, c.px, y, 0), M.dark);
        const ptr = new THREE.BoxGeometry(0.0015, 0.007, 0.001);
        ptr.translate(0, 0.003, 0.0165);
        ptr.rotateZ((c.px * 37) % 2);
        this.addStatic(this.toPanel(ptr, c.px, y, 0), M.white);
      } else if (c.kind === 'toggle') {
        // a hex nut and a bat handle thrown up or down
        const nut = new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 6);
        nut.rotateX(Math.PI / 2);
        nut.translate(0, 0, 0.002);
        this.addStatic(this.toPanel(nut, c.px, y, 0), M.metal);
        const up = ((c.px * 91 + c.py * 53) | 0) % 2 === 0 ? 1 : -1;
        this.addStatic(this.toPanel(limb(new THREE.Vector3(0, 0, 0.003), new THREE.Vector3(0, up * 0.008, 0.017), 0.0018), c.px, y, 0), M.metal);
      } else if (c.kind === 'button') {
        // a square push-button with a dimly lit legend lens
        const bt = new THREE.BoxGeometry(0.016, 0.013, 0.006);
        bt.translate(0, 0, 0.003);
        this.addStatic(this.toPanel(bt, c.px, y, 0), M.dark);
        const ln = new THREE.PlaneGeometry(0.013, 0.01);
        ln.translate(0, 0, 0.0062);
        this.addStatic(this.toPanel(ln, c.px, y, 0), lens);
      } else {
        // a guarded switch: the switch under a red flip guard
        const g = new THREE.BoxGeometry(0.014, 0.022, 0.01);
        g.translate(0, 0.002, 0.005);
        this.addStatic(this.toPanel(g, c.px, y, 0), red);
      }
    }
  }

  private buildGlareShield(M: ReturnType<Cockpit['makeMaterials']>): void {
    const L = this.layout;
    const eye = this.eye;
    const gy = eye.y - L.glareDrop;
    const zl = eye.z - L.panelDist + L.glareLip;
    const zf = eye.z - L.panelDist - 0.3;
    // side profile (z, y): rounded lip toward the pilot, top sloping down
    // toward the windscreen so it hides as little of the view as possible
    const prof: [number, number][] = [
      [zl - 0.03, gy - 0.085],
      [zl, gy - 0.07],
      [zl + 0.006, gy - 0.04],
      [zl, gy - 0.012],
      [zl - 0.02, gy],
      [zf + 0.05, gy - 0.05],
      [zf, gy - 0.075],
      [zf, gy - 0.13],
    ];
    const hwBack = L.panelHalfWidth - 0.04;
    const hwFront = L.panelHalfWidth - 0.14;
    this.addStatic(prism(prof, (z) => lerp(hwFront, hwBack, clamp((z - zf) / (zl - zf), 0, 1))), M.glare);
    // the Typhoon's glare-shield key panels: a block of square lit keys either side of the HUD
    if (L.glareKeys) {
      for (const sx of [-1, 1]) {
        const w = 0.15, d = 0.075;
        const box = new THREE.BoxGeometry(w, 0.03, d);
        box.rotateX(0.5);
        box.translate(sx * (L.hud.halfW + 0.04 + w / 2), gy + 0.008, zl - 0.06);
        this.addStatic(box, M.dark);
        const face = new THREE.PlaneGeometry(w - 0.012, d - 0.01);
        face.rotateX(-Math.PI / 2 + 0.5);
        face.translate(sx * (L.hud.halfW + 0.04 + w / 2), gy + 0.024 + 0.004, zl - 0.06 + 0.008);
        this.addStatic(face, M.keypad);
      }
    }
  }

  private buildHud(M: ReturnType<Cockpit['makeMaterials']>): void {
    const L = this.layout;
    const eye = this.eye;
    const h = L.hud;
    // (no glass for a helmet-display jet: the symbology is on the visor)
    if (h.style === 'none' || h.style === 'hmd') return;
    const gy = eye.y - L.glareDrop;
    const z = eye.z - h.dist;
    const look = L.hudLook ?? 'std';
    const heavy = look === 'heavy';
    // projector housing on the glare shield (the low-profile HUD's is slim; a Russian one a big box)
    const bw = h.halfW * (look === 'lphud' ? 1.0 : heavy ? 1.5 : 1.25);
    const bh = look === 'lphud' ? 0.035 : heavy ? 0.075 : 0.05;
    const box = new THREE.BoxGeometry(bw, bh, heavy ? 0.2 : 0.16);
    box.translate(0, gy + bh / 2 - 0.005, z + 0.02);
    this.addStatic(box, M.dark);
    const lens = new THREE.BoxGeometry(bw * 0.84, 0.004, 0.1);
    lens.translate(0, gy + bh - 0.003, z + 0.02);
    this.addStatic(lens, M.mirror);
    const yb = eye.y + h.bottom, yt = eye.y + h.top;
    const postH = yt - yb;
    const glass = (geo: THREE.BufferGeometry, y: number, dz: number) => {
      const gl = new THREE.Mesh(geo, M.hudGlass);
      gl.position.set(0, y, z + dz);
      gl.rotation.x = -0.12;
      gl.renderOrder = 10;
      this.root.add(gl);
    };
    if (look === 'round') {
      // the Typhoon's wide-angle HUD: a big round combiner held in a thin ring, on an arm each side
      const r = postH / 2;
      const yc = yb + r;
      const ring = new THREE.TorusGeometry(r, 0.006, 6, 48);
      ring.rotateX(-0.12);
      ring.translate(0, yc, z);
      this.addStatic(ring, M.frame);
      for (const sx of [-1, 1]) {
        const arm = limb(new THREE.Vector3(sx * h.halfW * 0.7, gy + bh, z + 0.03), new THREE.Vector3(sx * r * 0.98, yc - r * 0.15, z), 0.008);
        this.addStatic(arm, M.frame);
      }
      glass(new THREE.CircleGeometry(r, 48), yc, 0);
      return;
    }
    if (look === 'lphud') {
      // a low-profile HUD: a tall combiner between two slim posts that lean in toward the top
      for (const sx of [-1, 1]) {
        const post = limb(new THREE.Vector3(sx * h.halfW * 0.92, gy + bh, z + 0.01), new THREE.Vector3(sx * h.halfW * 0.72, yt + 0.01, z - 0.012), 0.006);
        this.addStatic(post, M.frame);
      }
      const sh = new THREE.Shape();
      sh.moveTo(-h.halfW * 0.88, -postH / 2);
      sh.lineTo(h.halfW * 0.88, -postH / 2);
      sh.lineTo(h.halfW * 0.72, postH / 2 - 0.02);
      sh.quadraticCurveTo(0, postH / 2 + 0.012, -h.halfW * 0.72, postH / 2 - 0.02);
      sh.closePath();
      glass(new THREE.ShapeGeometry(sh, 8), yb + postH / 2, 0);
      return;
    }
    // frame posts and top bar (thick and dark on a Russian HUD)
    const pw = heavy ? 0.026 : 0.012, pd = heavy ? 0.03 : 0.014;
    for (const sx of [-1, 1]) {
      const post = new THREE.BoxGeometry(pw, postH + 0.02, pd);
      post.translate(sx * (h.halfW + pw * 0.6), yb + postH / 2, z);
      this.addStatic(post, heavy ? M.dark : M.frame);
    }
    const top = new THREE.BoxGeometry(2 * h.halfW + 2 * pw + 0.006, heavy ? 0.022 : 0.01, pd);
    top.translate(0, yt + (heavy ? 0.011 : 0.005), z);
    this.addStatic(top, heavy ? M.dark : M.frame);
    // combiner glass (two plates on a dual-combiner HUD)
    const plates = h.style === 'dual' ? [0, 0.035] : [0];
    for (const dz of plates) glass(new THREE.PlaneGeometry(2 * h.halfW, postH), yb + postH / 2, dz);
  }

  private buildDisplays(M: ReturnType<Cockpit['makeMaterials']>): void {
    this.layout.displays.forEach((mount, index) => {
      const margin = mount.bezel === 'osb' ? 0.03 : mount.bezel === 'touch' ? 0.014 : mount.bezel === 'hood' ? 0.016 : 0.008;
      const bw = mount.sw + 2 * margin, bh = mount.sh + 2 * margin;
      const yaw = mount.yaw ?? 0;
      // a display on the glare shield (an up-front controller standing under the HUD) or on the panel
      const xf = (g: THREE.BufferGeometry, px: number, py: number, off: number, yw = 0) => (mount.onGlare ? this.toGlare(g, px, py, off, yw) : this.toPanel(g, px, py, off, yw));
      const pl = (o: THREE.Object3D, px: number, py: number, off: number, yw = 0) => (mount.onGlare ? this.placeOnGlare(o, px, py, off, yw) : this.placeOnPanel(o, px, py, off, yw));
      if (mount.onGlare) {
        // the box it lives in, standing on the glare shield
        // (the keypads either side only on a UFC centred under the HUD: one beside it, like the Su-35's
        // PUI, is a small box of its own and must stay on the glare shield, clear of the HUD's posts)
        const extra = mount.def.kind === 'ufc' && mount.px === 0 ? 0.2 : 0.03;
        const house = new THREE.BoxGeometry(bw + extra, bh + 0.08, 0.09);
        house.translate(0, -0.03, -0.045);
        this.addStatic(xf(house, mount.px, mount.py, 0, yaw), M.dark);
      }
      // bezel
      // (a round instrument sits in a round bezel, its case set into the panel)
      const round = mount.def.kind === 'gauge' && mount.def.gauge !== 'tdi';
      const bz = new THREE.ExtrudeGeometry(roundRect(bw, bh, round ? Math.min(bw, bh) / 2 - 0.0005 : 0.012), { depth: 0.02, bevelEnabled: false, curveSegments: round ? 10 : 4 });
      this.addStatic(xf(bz, mount.px, mount.py, 0.0, yaw), M.bezel);
      // screen (texture assigned by the avionics)
      const scrMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      this.materials.push(scrMat);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(mount.sw, mount.sh), scrMat);
      pl(screen, mount.px, mount.py, 0.021, yaw);
      screen.userData = { slot: index, kind: 'screen' };
      this.root.add(screen);
      // the screen's cover glass: black, so it only adds what it reflects (the sky, the canopy bows)
      const cover = new THREE.Mesh(new THREE.PlaneGeometry(mount.sw, mount.sh), M.screenGlass);
      pl(cover, mount.px, mount.py, 0.0235, yaw);
      cover.renderOrder = 5;
      this.root.add(cover);
      this.clickables.push(screen);
      // screen glass sheen
      let osb: THREE.InstancedMesh | null = null;
      if (mount.bezel === 'osb') {
        osb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, 0.012, 0.008), M.button, 20);
        const o = new THREE.Object3D();
        for (let i = 0; i < 20; i++) {
          const p = osbPosition(i, mount.sw, mount.sh);
          let x = p.x - mount.sw / 2;
          let y = mount.sh / 2 - p.y;
          if (p.side === 'top') y += margin / 2;
          else if (p.side === 'bottom') y -= margin / 2;
          else if (p.side === 'left') x -= margin / 2;
          else x += margin / 2;
          o.position.set(x, y, 0.024);
          o.rotation.set(0, 0, p.side === 'left' || p.side === 'right' ? Math.PI / 2 : 0);
          o.updateMatrix();
          osb.setMatrixAt(i, o.matrix);
        }
        pl(osb, mount.px, mount.py, 0, yaw);
        osb.userData = { slot: index, kind: 'osb' };
        this.root.add(osb);
        this.clickables.push(osb);
        // corner rocker switches
        for (const [cx, cy] of [
          [-1, 1],
          [1, 1],
          [-1, -1],
          [1, -1],
        ]) {
          const rk = new THREE.BoxGeometry(0.02, 0.009, 0.007);
          rk.rotateZ(cx * cy > 0 ? -0.78 : 0.78);
          rk.translate(cx * (bw / 2 - 0.013), cy * (bh / 2 - 0.013), 0.024);
          this.addStatic(xf(rk, mount.px, mount.py, 0, yaw), M.button);
        }
      }
      if (mount.bezel === 'hood') {
        // a deep box standing out round the screen, the picture well inside it
        const depth = 0.1, t = 0.012;
        for (const [w, hgt, x, y] of [
          [bw, t, 0, bh / 2 - t / 2],
          [bw, t, 0, -bh / 2 + t / 2],
          [t, bh, -bw / 2 + t / 2, 0],
          [t, bh, bw / 2 - t / 2, 0],
        ] as const) {
          const wall = new THREE.BoxGeometry(w, hgt, depth);
          wall.translate(x, y, depth / 2);
          this.addStatic(xf(wall, mount.px, mount.py, 0.0, yaw), M.bezel);
        }
      }
      if (mount.def.kind === 'ufc' && !(mount.onGlare && mount.px !== 0)) {
        // keypad plate beside the scratchpad
        const kp = new THREE.PlaneGeometry(0.075, mount.sh + 0.03);
        kp.translate(mount.sw / 2 + margin + 0.04, 0, 0.0215);
        const kg = new THREE.BoxGeometry(0.08, mount.sh + 0.035, 0.02);
        kg.translate(mount.sw / 2 + margin + 0.04, 0, 0.01);
        this.addStatic(xf(kg, mount.px, mount.py, 0, yaw), M.bezel);
        this.addStatic(xf(kp, mount.px, mount.py, 0, yaw), M.keypad);
        const kp2 = new THREE.PlaneGeometry(0.075, mount.sh + 0.03);
        kp2.translate(-(mount.sw / 2 + margin + 0.04), 0, 0.0215);
        const kg2 = new THREE.BoxGeometry(0.08, mount.sh + 0.035, 0.02);
        kg2.translate(-(mount.sw / 2 + margin + 0.04), 0, 0.01);
        this.addStatic(xf(kg2, mount.px, mount.py, 0, yaw), M.bezel);
        this.addStatic(xf(kp2, mount.px, mount.py, 0, yaw), M.keypad);
      }
      this.slots.push({ mount, index, screen, osb });
    });
  }

  /** An annunciator on the glare-shield lip (the face toward the pilot). */
  private lamp(name: string, text: string, color: string, x: number, w: number, h: number): Lamp {
    const L = this.layout;
    const eye = this.eye;
    const t = legendTexture(text, color);
    this.textures.push(t);
    const mat = new THREE.MeshStandardMaterial({ color: 0x333333, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0, roughness: 0.4, metalness: 0 });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), mat);
    const gy = eye.y - L.glareDrop;
    mesh.position.set(x, gy - 0.042, eye.z - L.panelDist + L.glareLip + 0.017);
    this.root.add(mesh);
    const l = { mesh, mat };
    this.lamps[name] = l;
    return l;
  }

  private buildAnnunciators(M: ReturnType<Cockpit['makeMaterials']>): void {
    const L = this.layout;
    const eye = this.eye;
    if (L.lockShoot) {
      // LOCK / SHOOT lights beside the HUD
      const z = eye.z - L.hud.dist + 0.012;
      const x = -L.hud.halfW - 0.036;
      for (const [name, text, color, dy] of [
        ['lock', 'LOCK', '#35ff7a', 0.02],
        ['shoot', 'SHOOT', '#35ff7a', -0.02],
      ] as const) {
        const t = legendTexture(text, color);
        this.textures.push(t);
        const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0, roughness: 0.5 });
        this.materials.push(mat);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.024, 0.01), mat);
        mesh.position.set(x, eye.y - L.glareDrop + 0.075 + dy, z);
        this.root.add(mesh);
        this.lamps[name] = { mesh, mat };
      }
      const hous = new THREE.BoxGeometry(0.055, 0.07, 0.02);
      hous.translate(x, eye.y - L.glareDrop + 0.075, z - 0.012);
      this.addStatic(hous, M.dark);
    }
    const ru = L.lang === 'ru';
    this.lamp('caution', ru ? 'ВНИМАНИЕ' : 'MASTER\nCAUTION', '#ffb21a', -L.panelHalfWidth + 0.1, 0.052, 0.03);
    const twin = this.v.ac.spec.engines > 1;
    this.lamp('fireL', ru ? (twin ? 'ПОЖАР\nЛЕВ' : 'ПОЖАР') : twin ? 'L\nFIRE' : 'FIRE', '#ff3322', -L.hud.halfW - 0.06, 0.04, 0.028);
    if (twin) this.lamp('fireR', ru ? 'ПОЖАР\nПРАВ' : 'R\nFIRE', '#ff3322', L.hud.halfW + 0.06, 0.04, 0.028);
  }

  private buildGear(M: ReturnType<Cockpit['makeMaterials']>): void {
    const L = this.layout;
    const px = -L.panelHalfWidth + 0.06, py = L.panelHeight - 0.1;
    // lever pivots on the panel; the handle wheel sits at its end
    const lever = this.gearLever;
    this.placeOnPanel(lever, px, py, 0.01);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.07), M.metal);
    arm.position.set(0, 0, 0.035);
    lever.add(arm);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.014, 18), M.white);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, 0, 0.075);
    lever.add(wheel);
    // red "in transit" light inside the handle
    const redMat = new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2211, emissiveIntensity: 0 });
    this.materials.push(redMat);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), redMat);
    red.position.set(0, 0, 0.084);
    lever.add(red);
    this.gearRed = { mesh: red, mat: redMat };
    this.root.add(lever);
    const plate = new THREE.BoxGeometry(0.06, 0.1, 0.008);
    this.addStatic(this.toPanel(plate, px, py, 0.002), M.dark);
    // three greens
    for (let i = 0; i < 3; i++) {
      const gm = new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x22ff44, emissiveIntensity: 0 });
      this.materials.push(gm);
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 10), gm);
      g.rotation.x = Math.PI / 2;
      const pp = [
        [0.045, -0.03],
        [0.035, -0.045],
        [0.055, -0.045],
      ][i];
      this.placeOnPanel(g, px + pp[0], py - pp[1] - 0.04, 0.01);
      g.rotateX(Math.PI / 2);
      this.root.add(g);
      this.gearGreens.push({ mesh: g, mat: gm });
    }
  }

  private buildConsoles(M: ReturnType<Cockpit['makeMaterials']>): void {
    const eye = this.eye;
    const can = this.v.canopySections;
    const hwSill = can.length ? sectionHalfWidthAt(sectionAt(can, eye.z), this.sillY + 0.02) : 0.45;
    const inner = 0.19;
    // (inside the tub's side walls all along its length, so the walls never cover its outer edge)
    // (the front ends stop short of the panel's line of sight: no instrument low on the panel hides behind them)
    const z0 = eye.z - 0.38, z1 = eye.z + 0.45;
    let wall = Infinity;
    for (let k = 0; k <= 8; k++) wall = Math.min(wall, this.tubHalfWidth(lerp(z0, z1, k / 8)) * 0.97);
    const outer = Math.min(hwSill - 0.03, wall - 0.01);
    const top = this.consoleY;
    const bottom = this.floorY + 0.15;
    for (const sx of [-1, 1]) {
      const w = outer - inner;
      const box = new THREE.BoxGeometry(w, top - bottom, z1 - z0);
      box.translate(sx * (inner + w / 2), (top + bottom) / 2, (z0 + z1) / 2);
      // only the top face gets the switch-panel texture
      const topFace = new THREE.PlaneGeometry(w - 0.01, z1 - z0 - 0.01);
      topFace.rotateX(-Math.PI / 2);
      topFace.translate(sx * (inner + w / 2), top + 0.001, (z0 + z1) / 2);
      this.addStatic(box, M.consolePlain);
      this.addStatic(topFace, sx < 0 ? M.console : M.consoleR);
      // a few real knobs and toggles for depth
      for (let k = 0; k < 7; k++) {
        const kz = lerp(z0 + 0.06, z1 - 0.06, (k + 0.5) / 7);
        const kx = sx * (inner + w * (0.3 + 0.4 * ((k * 37) % 7) / 7));
        if (sx < 0 && kz < eye.z + 0.08 && kz > eye.z - 0.4 && Math.abs(kx) < inner + w * 0.55) continue; // throttle quadrant
        if (sx > 0 && this.layout.stick === 'side' && kz < eye.z + 0.1 && kz > eye.z - 0.4 && Math.abs(kx) < inner + w * 0.6) continue; // side-stick
        if (k % 2 === 0) {
          const knob = new THREE.CylinderGeometry(0.012, 0.014, 0.018, 12);
          knob.translate(kx, top + 0.009, kz);
          this.addStatic(knob, M.dark);
        } else {
          const tg = new THREE.CylinderGeometry(0.003, 0.003, 0.028, 6);
          tg.rotateX(0.35);
          tg.translate(kx, top + 0.014, kz);
          this.addStatic(tg, M.metal);
        }
      }
      // armrest pad on the outboard edge
      const pad = new THREE.BoxGeometry(0.05, 0.03, 0.3);
      pad.translate(sx * (outer - 0.03), top + 0.015, eye.z + 0.2);
      this.addStatic(pad, M.rubber);
    }
  }

  private buildThrottles(M: ReturnType<Cockpit['makeMaterials']>): void {
    const eye = this.eye;
    const top = this.consoleY;
    const qx = -0.3;
    // quadrant plate with slots and an afterburner detent
    const plate = new THREE.BoxGeometry(0.11, 0.02, 0.36);
    plate.translate(qx, top + 0.01, eye.z - 0.17);
    this.addStatic(plate, M.dark);
    const det = new THREE.BoxGeometry(0.11, 0.012, 0.012);
    det.translate(qx, top + 0.026, eye.z - 0.27);
    this.addStatic(det, M.metal);
    const n = this.v.ac.spec.engines;
    const pivotZ = eye.z - 0.1;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const x = qx + (n === 1 ? 0 : (i === 0 ? -1 : 1) * 0.022);
      g.position.set(x, top - 0.05, pivotZ);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.18, 0.016), M.metal);
      lever.position.y = 0.09;
      g.add(lever);
      this.root.add(g);
      this.throttles.push(g);
    }
    // grip on top of the (inboard) lever, carries the HOTAS switches
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.1), M.grip);
    grip.position.set(n === 1 ? 0 : 0.022, 0.2, -0.01);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.01, 8), M.metal);
    hat.position.set(0.02, 0.04, -0.02);
    grip.add(hat);
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.01, 0.014), M.button);
    btn.position.set(-0.02, 0.037, 0.02);
    grip.add(btn);
    this.throttles[0].add(grip);
    // glove on the throttle
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), M.glove);
    glove.scale.set(0.9, 0.75, 1.2);
    glove.position.set(n === 1 ? 0 : 0.012, 0.225, 0.015);
    this.throttles[0].add(glove);
  }

  private buildStick(M: ReturnType<Cockpit['makeMaterials']>): void {
    if (this.layout.stick === 'side') {
      this.buildSideStick(M);
      return;
    }
    const eye = this.eye;
    const s = this.stick;
    const grip = this.layout.grip ?? 'us';
    s.position.set(0, this.floorY + 0.12, eye.z - 0.36);
    const boot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 16, 1, true), M.rubber);
    boot.position.y = 0.03;
    this.root.add(boot);
    boot.position.copy(s.position).add(new THREE.Vector3(0, 0.03, 0));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.34, 10), M.metal);
    shaft.position.y = 0.17;
    s.add(shaft);
    const gr = new THREE.Mesh(new THREE.CapsuleGeometry(grip === 'classic' ? 0.03 : 0.026, 0.1, 4, 12), M.grip);
    gr.position.set(0, 0.39, -0.01);
    gr.rotation.x = -0.2;
    s.add(gr);
    if (grip === 'ru') {
      // the Russian RUS grip: a head that bends forward over the hand, a big trigger guard under it
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.07), M.grip);
      head.position.set(0, 0.465, -0.03);
      head.rotation.x = 0.35;
      s.add(head);
      const guard = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 6, 12, Math.PI), M.metal);
      guard.rotation.set(0, Math.PI / 2, Math.PI);
      guard.position.set(0, 0.38, -0.045);
      s.add(guard);
    } else if (grip === 'classic') {
      // a 1960s grip: a rounded knob-topped handle
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 10), M.grip);
      knob.position.set(0, 0.47, -0.02);
      s.add(knob);
    }
    const trig = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.012), M.metal);
    trig.position.set(0, 0.38, -0.04);
    s.add(trig);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), M.metal);
    hat.position.set(0, 0.46, -0.02);
    s.add(hat);
    const pickle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8), new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.5 }));
    pickle.position.set(0.015, 0.455, 0.0);
    s.add(pickle);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), M.glove);
    glove.scale.set(0.95, 1.2, 0.9);
    glove.position.set(0.012, 0.39, 0.012);
    s.add(glove);
    this.root.add(s);
  }

  /** A side-stick on the right console, the forearm on its armrest (F-16, F-22, Rafale). */
  private buildSideStick(M: ReturnType<Cockpit['makeMaterials']>): void {
    const eye = this.eye;
    const s = this.stick;
    const x = 0.3, top = this.consoleY;
    s.position.set(x, top + 0.02, eye.z - 0.12);
    // the base on the console and a short boot
    const base = new THREE.BoxGeometry(0.09, 0.03, 0.11);
    base.translate(x, top + 0.015, eye.z - 0.12);
    this.addStatic(base, M.dark);
    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.04, 12), M.rubber);
    boot.position.set(x, top + 0.04, eye.z - 0.12);
    this.root.add(boot);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 10), M.metal);
    shaft.position.y = 0.04;
    s.add(shaft);
    // the grip, angled forward and a little inboard to fit the hand
    const gr = new THREE.Group();
    gr.position.y = 0.06;
    gr.rotation.set(-0.3, 0, 0.12);
    s.add(gr);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.08, 4, 12), M.grip);
    body.position.y = 0.05;
    gr.add(body);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), M.metal);
    hat.position.set(0, 0.12, 0.0);
    gr.add(hat);
    const trig = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.028, 0.012), M.metal);
    trig.position.set(0, 0.06, -0.035);
    gr.add(trig);
    // the gloved hand round the grip: knuckles over the top, the fingers wrapped round the front
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.05, 4, 10), M.glove);
    hand.scale.set(1.1, 1, 0.8);
    hand.position.set(0.01, 0.045, 0.018);
    gr.add(hand);
    this.root.add(s);
    // the forearm along the armrest
    this.addStatic(limb(new THREE.Vector3(x + 0.02, top + 0.09, eye.z - 0.06), new THREE.Vector3(x + 0.05, top + 0.08, eye.z + 0.22), 0.04), M.suit);
  }

  private buildPedals(M: ReturnType<Cockpit['makeMaterials']>): void {
    const eye = this.eye;
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * 0.14, this.floorY + 0.14, eye.z - 0.72);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.025), M.dark);
      pedal.rotation.x = -0.5;
      g.add(pedal);
      this.root.add(g);
      this.pedals.push(g);
    }
  }

  private buildSeat(M: ReturnType<Cockpit['makeMaterials']>): void {
    const eye = this.eye;
    const L = this.layout;
    const panY = eye.y - 0.8;
    const pan = new THREE.BoxGeometry(0.46, 0.08, 0.46);
    pan.translate(0, panY - 0.04, eye.z + 0.28);
    this.addStatic(pan, M.seat);
    const cush = new THREE.BoxGeometry(0.4, 0.05, 0.4);
    cush.translate(0, panY + 0.02, eye.z + 0.26);
    this.addStatic(cush, M.cushion);
    // backrest, reclined (the F-16's 30 degrees)
    const recline = L.seatRecline ?? 0.14;
    const back = new THREE.BoxGeometry(0.46, 0.84, 0.1);
    back.translate(0, 0.42, 0.05);
    back.rotateX(recline);
    back.translate(0, panY, eye.z + 0.34);
    this.addStatic(back, M.seat);
    const backC = new THREE.BoxGeometry(0.38, 0.62, 0.05);
    backC.translate(0, 0.34, -0.02);
    backC.rotateX(recline);
    backC.translate(0, panY, eye.z + 0.34);
    this.addStatic(backC, M.cushion);
    // headbox right behind the helmet
    const head = new THREE.BoxGeometry(0.34, 0.22, 0.2);
    head.translate(0, eye.y + 0.16, eye.z + 0.36);
    this.addStatic(head, M.seat);
    const warn = new THREE.BoxGeometry(0.12, 0.05, 0.005);
    warn.translate(0, eye.y + 0.2, eye.z + 0.258);
    this.addStatic(warn, M.stripe);
    // catapult rails
    for (const sx of [-1, 1]) {
      const rail = new THREE.CylinderGeometry(0.018, 0.018, 1.0, 8);
      rail.translate(0, 0.5, 0.1);
      rail.rotateX(recline);
      rail.translate(sx * 0.21, panY, eye.z + 0.34);
      this.addStatic(rail, M.metal);
    }
    // firing handle(s)
    if (L.seatKind === 'aces') {
      // ACES II: a yellow and black handle on each side of the seat bucket
      for (const sx of [-1, 1]) {
        const h = new THREE.BoxGeometry(0.035, 0.03, 0.14);
        h.translate(sx * 0.25, panY + 0.02, eye.z + 0.2);
        this.addStatic(h, M.stripe);
      }
    } else if (L.seatKind === 'x15') {
      // the X-15's seat: arm rests with handgrips each side (squeezed to eject), no loop
      for (const sx of [-1, 1]) {
        const rest = new THREE.BoxGeometry(0.06, 0.04, 0.32);
        rest.translate(sx * 0.27, panY + 0.17, eye.z + 0.12);
        this.addStatic(rest, M.seat);
        const hg = new THREE.CylinderGeometry(0.016, 0.016, 0.09, 10);
        hg.translate(sx * 0.27, panY + 0.22, eye.z - 0.02);
        this.addStatic(hg, M.stripe);
      }
    } else {
      // a loop between the knees: the Martin-Baker and SJU-17 yellow-black one, the K-36's broad
      // two-handed red-white one, the SR-1's D-ring
      const k36 = L.seatKind === 'k36';
      const r = k36 ? 0.065 : L.seatKind === 'sr1' ? 0.04 : 0.045;
      const loop = new THREE.TorusGeometry(r, k36 ? 0.012 : 0.011, 8, 20, Math.PI);
      loop.rotateX(-Math.PI / 2 + 0.4);
      loop.translate(0, panY + 0.03, eye.z + 0.05);
      this.addStatic(loop, k36 ? M.stripeRu : M.stripe);
    }
  }

  private buildPilot(M: ReturnType<Cockpit['makeMaterials']>): void {
    const eye = this.eye;
    const panY = eye.y - 0.8;
    for (const sx of [-1, 1]) {
      const hip = new THREE.Vector3(sx * 0.11, panY + 0.09, eye.z + 0.24);
      const knee = new THREE.Vector3(sx * 0.14, eye.y - 0.64, eye.z - 0.22);
      const ankle = new THREE.Vector3(sx * 0.14, this.floorY + 0.18, eye.z - 0.62);
      this.addStatic(limb(hip, knee, 0.075), M.suit);
      this.addStatic(limb(knee, ankle, 0.056), M.suit);
      const boot = new THREE.BoxGeometry(0.1, 0.1, 0.24);
      boot.translate(ankle.x, ankle.y - 0.03, ankle.z - 0.08);
      this.addStatic(boot, M.boot);
      // G-suit bladder bulge on the thigh
      const bl = limb(hip.clone().lerp(knee, 0.2), hip.clone().lerp(knee, 0.8), 0.08);
      bl.translate(sx * 0.012, 0.004, 0);
      this.addStatic(bl, M.suit);
    }
    // kneeboard on the right thigh with the theater card
    const kbTex = this.kneeboardTexture();
    const kbMat = new THREE.MeshStandardMaterial({ map: kbTex, roughness: 0.8 });
    this.materials.push(kbMat);
    const kb = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.21), kbMat);
    const hipR = new THREE.Vector3(0.11, panY + 0.09, eye.z + 0.24);
    const kneeR = new THREE.Vector3(0.14, eye.y - 0.64, eye.z - 0.22);
    const mid = hipR.clone().lerp(kneeR, 0.62);
    kb.position.set(mid.x + 0.01, mid.y + 0.085, mid.z);
    kb.lookAt(eye);
    kb.rotateZ(0.08);
    this.root.add(kb);
  }

  private kneeboardTexture(): THREE.CanvasTexture {
    const fieldRows = (team: string) =>
      AIRFIELDS.filter((f) => f.team === team).map((f) => {
        const a = Math.round(f.heading / 10) % 36 || 36;
        const b = ((a + 17) % 36) + 1;
        const nm = f.name.replace(/ AB$/, '').replace('HVITØY ', 'HVIT ').slice(0, 12).padEnd(12);
        return `${nm} ${f.icao} ${f.tacan} ${String(a).padStart(2, '0')}/${String(b).padStart(2, '0')} ${Math.round(f.elev / 0.3048)}`;
      });
    const c = document.createElement('canvas');
    c.width = 360;
    c.height = 504;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f2efe4';
    g.fillRect(0, 0, 360, 504);
    g.fillStyle = '#111';
    g.font = 'bold 22px Arial, sans-serif';
    g.fillText('THEATER CARD', 20, 34);
    g.font = '15px monospace';
    const ac = this.v.ac;
    const rows = [
      `A/C  ${ac.spec.shortName}  ${ac.callsign}`,
      `LIM  ${ac.spec.gLimit}G / ${ac.spec.gOverride}G OVRD`,
      `APP  ${ac.spec.approachKts} KT  ROT ${ac.spec.rotateKts} KT`,
      '',
      'FIELD        ICAO TCN RWY  ELEV',
      ...fieldRows('blue'),
      '--- HOSTILE ---',
      ...fieldRows('red'),
      '',
      'BULLSEYE: THEATER CENTRE',
      `THEATER: ${activeMap.name}`,
      'GCI: OVERLORD (ALL BLUE FIELDS)',
      '',
      'G: +4 GREY  +8 TUNNEL  +10.5 LOC',
      '   -2 RED 50%   -5 RED 100%',
    ];
    rows.forEach((r, i) => g.fillText(r, 16, 64 + i * 22));
    g.strokeStyle = '#555';
    g.strokeRect(6, 6, 348, 492);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    this.textures.push(t);
    return t;
  }

  private buildCanopyFrame(M: ReturnType<Cockpit['makeMaterials']>): void {
    const v = this.v;
    const can = v.canopySections;
    if (!can.length) return;
    const eye = this.eye;
    const archZ = v.windscreenArchZ || eye.z - 0.5;
    // windscreen arch: a wide flat frame, two tubes deep
    for (const dz of [0, 0.035]) {
      this.addStatic(sectionArch(sectionAt(can, archZ + dz), 0.022, 0.028), M.frame);
    }
    for (const z of v.canopyBows) this.addStatic(sectionArch(sectionAt(can, z), 0.026, 0.03), M.frame);
    // lower canopy frame along each side
    const zEnd = can[can.length - 1].z - 0.3;
    for (const sx of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const z = lerp(archZ, zEnd, i / 10);
        const s = sectionAt(can, z);
        const [x, y] = sectionPoint(sx > 0 ? 0.08 : Math.PI - 0.08, s);
        pts.push(new THREE.Vector3(x - sx * 0.02, y, z));
      }
      this.addStatic(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.018, 6, false), M.frame);
    }
    // rear-view mirrors on the arch
    const sec = sectionAt(can, archZ + 0.05);
    for (const th of [Math.PI / 2, Math.PI / 2 - 0.62, Math.PI / 2 + 0.62]) {
      const [x, y] = sectionPoint(th, sec);
      const cy = sec.y ?? 0;
      const dx = x, dy = y - cy;
      const l = Math.hypot(dx, dy) || 1;
      const pos = new THREE.Vector3(x - (dx / l) * 0.06, y - (dy / l) * 0.06, archZ + 0.06);
      const mir = new THREE.Mesh(new THREE.PlaneGeometry(th === Math.PI / 2 ? 0.1 : 0.07, 0.032), M.mirror);
      mir.position.copy(pos);
      mir.lookAt(eye.x, eye.y + 0.2, eye.z + 0.6);
      this.root.add(mir);
      const back = new THREE.Mesh(new THREE.BoxGeometry(th === Math.PI / 2 ? 0.108 : 0.078, 0.04, 0.012), M.dark);
      back.position.copy(pos);
      back.quaternion.copy(mir.quaternion);
      back.translateZ(-0.008);
      this.root.add(back);
    }
    // faint inner canopy glass for glare and reflections
    const glass = new THREE.Mesh(loft(can, 32, 6), M.canopyGlass);
    glass.renderOrder = 20;
    this.root.add(glass);
  }

  // -------------------------------------------------------------------------
  // per frame
  // -------------------------------------------------------------------------

  update(st: CockpitState): void {
    // (a side-stick barely moves: the F-16's senses force, the others travel a few degrees)
    const travel = this.layout.stick === 'side' ? 0.09 : 0.3;
    this.stick.rotation.set(clamp(st.pitch, -1, 1) * travel, 0, -clamp(st.roll, -1, 1) * travel);
    const thr = clamp(st.throttle, 0, 1.1);
    const ang = thr <= 1 ? lerp(0.5, -0.32, thr) : lerp(-0.32, -0.62, (thr - 1) / 0.1);
    for (const t of this.throttles) t.rotation.x = ang;
    this.pedals.forEach((p, i) => (p.position.z = this.eye.z - 0.72 + (i === 0 ? -1 : 1) * clamp(st.yaw, -1, 1) * 0.035));
    const baseQ = this.panelQuat.clone().multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), st.gearHandleDown ? 0.45 : -0.45));
    this.gearLever.quaternion.copy(baseQ);
    const transit = st.gearPos > 0.02 && st.gearPos < 0.98;
    if (this.gearRed) this.gearRed.mat.emissiveIntensity = transit ? 2.5 : 0;
    for (const gl of this.gearGreens) gl.mat.emissiveIntensity = st.gearPos > 0.98 ? 2.2 : 0;
    const set = (name: string, on: boolean, level = 1.6) => {
      const l = this.lamps[name];
      if (l) l.mat.emissiveIntensity = on ? level : 0;
    };
    set('lock', st.lock);
    set('shoot', st.shoot && st.blink);
    set('caution', st.masterCaution);
    set('fireL', st.fireL && st.blink, 2.2);
    set('fireR', st.fireR && st.blink, 2.2);
  }

  /** Give each display screen its avionics texture. */
  setScreenTextures(textures: (THREE.Texture | null)[]): void {
    this.slots.forEach((s, i) => {
      const mat = s.screen.material as THREE.MeshBasicMaterial;
      mat.map = textures[i] ?? null;
      mat.color.set(textures[i] ? 0xffffff : 0x050505);
      mat.needsUpdate = true;
    });
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
