// 3D hangar showcase behind the main menu: the selected jet on a turntable.
// The camera orbits freely: drag to look around the jet (above and below),
// scroll / pinch to zoom, double-click to reset. The turntable's slow spin
// stops as soon as you take the camera.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Aircraft } from '../../aircraft/aircraft';
import { createAirframe, AirframeVisual, paintAirframe } from '../../aircraft/models';
import { loadPaint, PaintConfig } from '../../aircraft/models/paint';
import { AircraftType } from '../../aircraft/specs';

export class Hangar {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);
  private jets = new Map<AircraftType, { vis: AirframeVisual; ac: Aircraft }>();
  private current: AircraftType = 'F15EX';
  private angle = 0.6;
  private t = 0;
  // orbit camera (azimuth from the nose side, elevation, distance factor); targets and smoothed values
  private yaw = 0.75;
  private pitch = 0.2;
  private zoom = 1;
  private yawS = 0.75;
  private pitchS = 0.2;
  private zoomS = 1;
  /** true once the user has moved the camera: the turntable stops spinning */
  private userView = false;
  private lastRender = 0;
  private drag: { id: number; x: number; y: number } | null = null;
  private pinch: { ids: [number, number]; d0: number; z0: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  /** drag momentum (rad/s) so the view glides to a stop after you let go */
  private vYaw = 0;
  private vPitch = 0;
  private lastMove = 0;
  private turntable: THREE.Group;
  private envMap: THREE.Texture | null = null;
  loadoutId: string | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    const s = this.scene;
    s.background = new THREE.Color(0x0b1016);
    s.fog = new THREE.Fog(0x0b1016, 60, 160);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environment = this.envMap;
    s.environmentIntensity = 1.0;
    pmrem.dispose();

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(80, 64),
      new THREE.MeshStandardMaterial({ color: 0x1a2129, roughness: 0.35, metalness: 0.4 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // painted turntable ring
    this.turntable = new THREE.Group();
    s.add(this.turntable);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 0.12, 72), new THREE.MeshStandardMaterial({ color: 0x252e38, roughness: 0.45, metalness: 0.5 }));
    disc.position.y = 0.06;
    disc.receiveShadow = true;
    this.turntable.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(15, 0.08, 8, 96), new THREE.MeshBasicMaterial({ color: 0x47d18c }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.13;
    this.turntable.add(ring);
    // floor guide lines
    for (let i = -3; i <= 3; i++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 120), new THREE.MeshBasicMaterial({ color: 0x2c3a46 }));
      l.rotation.x = -Math.PI / 2;
      l.position.set(i * 12, 0.01, 0);
      s.add(l);
    }
    // hangar back wall with ribs
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 40, 48, 1, true, Math.PI * 0.6, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: 0x141b22, roughness: 0.9, side: THREE.BackSide }));
    wall.position.y = 20;
    s.add(wall);
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 0.6 + (i / 15) * Math.PI * 0.8;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.6, 40, 0.6), new THREE.MeshStandardMaterial({ color: 0x1c252e, roughness: 0.7 }));
      rib.position.set(Math.sin(a) * 69, 20, Math.cos(a) * 69);
      s.add(rib);
    }
    // lighting: key spots + rim + soft fill
    const hemi = new THREE.HemisphereLight(0xb8cde0, 0x2a2018, 1.4);
    s.add(hemi);
    const key = new THREE.SpotLight(0xfff2e0, 6000, 110, 0.55, 0.5, 1.5);
    key.position.set(-18, 32, -14);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0003;
    s.add(key);
    s.add(key.target);
    const rim = new THREE.SpotLight(0x88b8ff, 3500, 110, 0.6, 0.6, 1.5);
    rim.position.set(22, 18, 24);
    s.add(rim);
    s.add(rim.target);
    const fill = new THREE.PointLight(0x6080a0, 300, 60, 1.8);
    fill.position.set(0, 10, -30);
    s.add(fill);
    this.camera.position.set(26, 9, -24);
    this.bindControls();
  }

  /** Is this press on empty background (not a menu panel, button or field)? */
  private onBackground(e: Event): boolean {
    if (performance.now() - this.lastRender > 300) return false;
    const t = e.target as HTMLElement | null;
    if (!t || !t.closest) return true;
    return !t.closest('.card, button, input, select, label, a, .jet-card, .mode-card, .cz-panel, .cz-top, .cz-foot, .hangar-caption, .fly-row, .menu-header, .modal-back, .modal, .scroll');
  }

  private bindControls(): void {
    window.addEventListener('pointerdown', (e) => {
      if (!this.onBackground(e)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.entries()];
        this.pinch = { ids: [a[0], b[0]], d0: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y), z0: this.zoom };
        this.drag = null;
      } else {
        this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
      this.userView = true;
      this.vYaw = this.vPitch = 0;
      this.lastMove = performance.now();
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pinch) {
        const a = this.pointers.get(this.pinch.ids[0]);
        const b = this.pointers.get(this.pinch.ids[1]);
        if (a && b) {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          this.zoom = clampN(this.pinch.z0 * (this.pinch.d0 / Math.max(20, d)), ZOOM_MIN, ZOOM_MAX);
        }
        return;
      }
      if (this.drag && this.drag.id === e.pointerId) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        // the jet follows your hand: drag right to swing the camera left around it
        const dyaw = dx * 0.006;
        const dpitch = -dy * 0.005;
        this.yaw += dyaw;
        this.pitch = clampN(this.pitch + dpitch, -0.02, 1.45);
        const now = performance.now();
        const dtm = Math.max(0.008, (now - this.lastMove) / 1000);
        this.lastMove = now;
        this.vYaw = this.vYaw * 0.6 + (dyaw / dtm) * 0.4;
        this.vPitch = this.vPitch * 0.6 + (dpitch / dtm) * 0.4;
      }
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pinch && (e.pointerId === this.pinch.ids[0] || e.pointerId === this.pinch.ids[1])) this.pinch = null;
      if (this.drag?.id === e.pointerId) {
        this.drag = null;
        // no fling after holding still
        if (performance.now() - this.lastMove > 80) this.vYaw = this.vPitch = 0;
      }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.onBackground(e)) return;
        this.userView = true;
        this.zoom = clampN(this.zoom * Math.exp(clampN(e.deltaY, -120, 120) * 0.0015), ZOOM_MIN, ZOOM_MAX);
      },
      { passive: true },
    );
    window.addEventListener('dblclick', (e) => {
      if (!this.onBackground(e)) return;
      this.resetView();
    });
  }

  /** Back to the default three-quarter view (the turntable stays where it is). */
  resetView(): void {
    this.yaw = 0.75;
    this.pitch = 0.2;
    this.zoom = 1;
    this.vYaw = this.vPitch = 0;
  }

  private ensure(type: AircraftType): { vis: AirframeVisual; ac: Aircraft } {
    let j = this.jets.get(type);
    if (!j) {
      const ac = new Aircraft(type, 'blue', 'DEMO');
      ac.fm.pos.set(0, ac.spec.gear.height + 0.12, 0);
      ac.fm.gearPos = 1;
      ac.fm.rpm.fill(0.25);
      const vis = createAirframe(ac);
      paintAirframe(vis, loadPaint(type));
      vis.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
      this.turntable.add(vis.root);
      j = { vis, ac };
      this.jets.set(type, j);
    }
    return j;
  }

  /** Preview a paint job on the hangar jet (not saved). */
  previewPaint(type: AircraftType, cfg: PaintConfig | null): void {
    paintAirframe(this.ensure(type).vis, cfg);
  }

  setJet(type: AircraftType, loadoutId?: string): void {
    this.current = type;
    const j = this.ensure(type);
    if (loadoutId && loadoutId !== this.loadoutId) {
      const l = j.ac.spec.loadouts.find((x) => x.id === loadoutId);
      if (l) {
        j.ac.applyLoadout(l);
        j.vis.buildStores();
      }
      this.loadoutId = loadoutId;
    }
    for (const [t, v] of this.jets) v.vis.root.visible = t === type;
  }

  render(dt: number, w: number, h: number): void {
    this.t += dt;
    this.lastRender = performance.now();
    if (!this.userView) this.angle += dt * 0.18;
    this.turntable.rotation.y = this.angle;
    const j = this.ensure(this.current);
    j.vis.update(dt);
    // the airframe visual positions itself from the flight model; keep it on the turntable
    j.vis.root.position.set(0, j.ac.spec.gear.height + 0.12, 0);
    j.vis.root.quaternion.identity();
    const len = j.ac.spec.length;
    // momentum after a fling, fading out
    if (!this.drag && (Math.abs(this.vYaw) > 1e-3 || Math.abs(this.vPitch) > 1e-3)) {
      this.yaw += this.vYaw * dt;
      this.pitch = clampN(this.pitch + this.vPitch * dt, -0.02, 1.45);
      const f = Math.exp(-dt * 4);
      this.vYaw *= f;
      this.vPitch *= f;
    }
    // ease toward the requested view (soft, so drags and zooms glide)
    const k = 1 - Math.exp(-dt * 7);
    this.yawS += (this.yaw - this.yawS) * k;
    this.pitchS += (this.pitch - this.pitchS) * k;
    this.zoomS += (this.zoom - this.zoomS) * (1 - Math.exp(-dt * 6));
    // never inside the airframe: at least ~0.42 of its length from the centre
    const d = Math.max(len * 0.42, (len * 1.9 + 6) * this.zoomS);
    // frame the jet slightly right of centre so the UI columns don't cover it;
    // zooming in re-centres on the jet itself
    const close = clampN((this.zoomS - ZOOM_MIN) / (1 - ZOOM_MIN), 0, 1);
    const tx = -2 * close;
    const ty = 1.8 + (j.ac.spec.gear.height - 1.8) * (1 - close);
    const bob = this.userView ? 0 : Math.sin(this.t * 0.2) * 0.6;
    const cp = Math.cos(this.pitchS);
    this.camera.position.set(tx + Math.sin(this.yawS) * cp * d, Math.max(0.4, ty + Math.sin(this.pitchS) * d + bob), -Math.cos(this.yawS) * cp * d);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(tx, ty, 0);
    this.renderer.setRenderTarget(null);
    const tm = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.render(this.scene, this.camera);
    this.renderer.toneMapping = tm;
  }
}

/** zoom factor limits: right up against the jet .. well back */
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 2.2;

function clampN(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
