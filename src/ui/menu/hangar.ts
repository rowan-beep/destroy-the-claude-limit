// 3D hangar showcase behind the main menu: the selected jet on a turntable.
// The camera orbits freely: drag to look around the jet (above and below),
// scroll / pinch to zoom, double-click to reset. The turntable's slow spin
// stops as soon as you take the camera.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Aircraft } from '../../aircraft/aircraft';
import { createAirframe, releaseAirframe, AirframeVisual, paintAirframe } from '../../aircraft/models';
import { loadPaint, PaintConfig } from '../../aircraft/models/paint';
import { AircraftType } from '../../aircraft/specs';
import { VERSION } from '../../version';
import { buildHangarInterior, HangarInterior, HANGAR } from './hangarInterior';

export class Hangar {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.2, 30000);
  private jets = new Map<AircraftType, { vis: AirframeVisual; ac: Aircraft }>();
  private current: AircraftType = 'F15EX';
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
  private interior: HangarInterior;
  loadoutId: string | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {
    const s = this.scene;
    this.turntable = new THREE.Group();
    s.add(this.turntable);
    this.interior = buildHangarInterior(s);
    // the jet's reflections and ambient light come from the hangar itself:
    // capture it once (without the jet) from about cockpit height
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.interior.setSunDisc(false);
    try {
      this.envMap = pmrem.fromScene(s, 0.015, 0.2, 30000, { size: 256, position: new THREE.Vector3(0, 3, 0) }).texture;
    } catch {
      this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    }
    this.interior.setSunDisc(true);
    s.environment = this.envMap;
    s.environmentIntensity = 0.55;
    pmrem.dispose();
    this.camera.position.set(20, 6, -18);
    this.bindControls();
  }

  /** Is this press on empty background (not a menu panel, button or field)? */
  private onBackground(e: Event): boolean {
    if (performance.now() - this.lastRender > 300) return false;
    const t = e.target as HTMLElement | null;
    if (!t || !t.closest) return true;
    return !t.closest('.card, button, input, select, label, a, .jet-card, .mode-card, .cz-panel, .cz-top, .cz-foot, .hangar-caption, .fly-row, .menu-header, .modal-back, .modal, .scroll, .lib-top, .lib-shelf, .lib-panel, .lib-hero, .mm-block');
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
        // dragging up raises the view over the jet (vertical reversed); left / right unchanged
        const dpitch = dy * 0.005;
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
      const vis = createAirframe(ac, true);
      paintAirframe(vis, loadPaint(type));
      // in the hangar the full-detail airframe casts its own shadow (no silhouette stand-in)
      vis.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (m.name === 'shadow-proxy') m.visible = false;
        else if (!(m.material as THREE.Material).transparent) m.castShadow = true;
      });
      vis.root.visible = type === this.current;
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

  /** the jet whose shaders are still compiling (the old one stays on show meanwhile) */
  private pending: AircraftType | null = null;

  setJet(type: AircraftType, loadoutId?: string): void {
    const fresh = !this.jets.has(type);
    const j = this.ensure(type);
    if (loadoutId && (fresh || loadoutId !== this.loadoutId)) {
      const l = j.ac.spec.loadouts.find((x) => x.id === loadoutId);
      if (l) {
        j.ac.applyLoadout(l);
        j.vis.buildStores();
      }
      this.loadoutId = loadoutId;
    }
    // a newly built jet: compile its shaders off the main thread first, so the
    // menu keeps running smoothly instead of freezing on its first frame
    if (fresh && type !== this.current && this.compileWith && this.jets.has(this.current)) {
      this.pending = type;
      this.compileWith(j.vis.root, this.scene, this.camera)
        .catch(() => undefined)
        .then(() => {
          if (this.pending === type) this.showJet(type);
        });
      return;
    }
    this.showJet(type);
  }

  private showJet(type: AircraftType): void {
    this.pending = null;
    this.current = type;
    const j = this.ensure(type);
    // only the jet on the turntable stays built (hero airframes are heavy)
    for (const [t, v] of [...this.jets]) {
      if (t === type) continue;
      this.turntable.remove(v.vis.root);
      releaseAirframe(v.vis);
      this.jets.delete(t);
    }
    j.vis.root.visible = true;
    this.interior.placeJetProps(j.ac, j.vis);
  }

  render(dt: number, w: number, h: number): void {
    this.t += dt;
    this.lastRender = performance.now();
    // the jet stays parked, nose to the doors; idle, the camera walks slowly around it
    if (!this.userView) this.yaw += dt * 0.06;
    this.turntable.rotation.y = 0;
    this.interior.update(dt);
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
    const d = Math.max(len * 0.42, (len * 1.15 + 4) * this.zoomS);
    // frame the jet slightly right of centre so the UI columns don't cover it;
    // zooming in re-centres on the jet itself
    const close = clampN((this.zoomS - ZOOM_MIN) / (1 - ZOOM_MIN), 0, 1);
    const tx = -2 * close;
    const ty = 1.8 + (j.ac.spec.gear.height - 1.8) * (1 - close);
    const bob = this.userView ? 0 : Math.sin(this.t * 0.2) * 0.6;
    const cp = Math.cos(this.pitchS);
    this.camera.position.set(tx + Math.sin(this.yawS) * cp * d, Math.max(0.4, ty + Math.sin(this.pitchS) * d + bob), -Math.cos(this.yawS) * cp * d);
    // stay inside the building (the open doors let it step a little way out onto the apron)
    const cpn = this.camera.position;
    cpn.x = clampN(cpn.x, -HANGAR.W / 2 + 1.2, HANGAR.W / 2 - 1.2);
    cpn.z = clampN(cpn.z, -HANGAR.D / 2 - 6, HANGAR.D / 2 - 7.5);
    cpn.y = clampN(cpn.y, 0.4, HANGAR.H - 3.2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(tx, ty, 0);
    if (this.drawWith) {
      this.drawWith(this.scene, this.camera);
      return;
    }
    this.renderer.setRenderTarget(null);
    const tm = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.render(this.scene, this.camera);
    this.renderer.toneMapping = tm;
  }

  /**
   * A studio portrait of a jet (three-quarter front view, gear up, in its
   * current paint) as an image URL, for the JET LIBRARY cards. Drawn into a
   * corner of the main canvas and copied out in the same task.
   */
  private thumbCache = new Map<string, string>();
  thumbnail(type: AircraftType, w = 360, h = 200): string {
    const ck = `${type}:${w}x${h}:${JSON.stringify(loadPaint(type))}`;
    const hit = this.thumbCache.get(ck) ?? storedThumb(ck);
    if (hit) {
      this.thumbCache.set(ck, hit);
      return hit;
    }
    const url = this.drawThumbnail(type, w, h);
    if (url) {
      this.thumbCache.set(ck, url);
      storeThumb(ck, url);
    }
    return url;
  }

  private drawThumbnail(type: AircraftType, w: number, h: number): string {
    const r = this.renderer;
    const ac = new Aircraft(type, 'blue', 'THUMB');
    ac.fm.pos.set(0, 0, 0);
    ac.fm.gearPos = 0;
    ac.fm.rpm.fill(0.25);
    const vis = createAirframe(ac, false);
    paintAirframe(vis, loadPaint(type));
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x0d1620);
    sc.environment = this.envMap;
    sc.environmentIntensity = 0.9;
    const key = new THREE.DirectionalLight(0xfff1dd, 3.2);
    key.position.set(-6, 10, -8);
    sc.add(key);
    const rim = new THREE.DirectionalLight(0x9cc8ff, 1.6);
    rim.position.set(8, 3, 10);
    sc.add(rim);
    sc.add(new THREE.HemisphereLight(0xcfe0f0, 0x202830, 0.6));
    vis.update(0.016);
    vis.root.position.set(0, 0, 0);
    vis.root.quaternion.identity();
    vis.root.rotation.set(0, 0, -0.12);
    sc.add(vis.root);
    const len = ac.spec.length;
    const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 500);
    cam.position.set(len * 1.1, len * 0.44, -len * 1.06);
    cam.lookAt(0, -len * 0.02, -len * 0.04);
    let url = '';
    const size = r.getSize(new THREE.Vector2());
    const pr = r.getPixelRatio();
    const tw = Math.min(w, size.x), th = Math.min(h, size.y);
    const tm = r.toneMapping, exp = r.toneMappingExposure;
    try {
      r.setRenderTarget(null);
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1;
      r.setViewport(0, 0, tw, th);
      r.setScissor(0, 0, tw, th);
      r.setScissorTest(true);
      r.render(sc, cam);
      const c = document.createElement('canvas');
      c.width = Math.round(tw * pr);
      c.height = Math.round(th * pr);
      const g = c.getContext('2d');
      if (g) {
        const src = r.domElement;
        g.drawImage(src, 0, src.height - c.height, c.width, c.height, 0, 0, c.width, c.height);
        url = c.toDataURL('image/jpeg', 0.86);
      }
    } catch {
      url = '';
    } finally {
      r.setScissorTest(false);
      r.setViewport(0, 0, size.x, size.y);
      r.toneMapping = tm;
      r.toneMappingExposure = exp;
      sc.remove(vis.root);
      releaseAirframe(vis);
    }
    // repaint the hangar over the corner the portrait was drawn in
    this.render(0, size.x, size.y);
    return url;
  }

  /** draw through the game's post-processing pipeline when set */
  drawWith: ((scene: THREE.Scene, camera: THREE.Camera) => void) | null = null;
  /** compile an object's shaders for that pipeline without blocking (resolves when ready) */
  compileWith: ((obj: THREE.Object3D, scene: THREE.Scene, camera: THREE.Camera) => Promise<unknown>) | null = null;
}

// Portraits are kept between visits (building one means building the whole
// jet), keyed by game version so a model change redraws them.
const THUMB_PREFIX = 'triad.thumb.';
function storedThumb(key: string): string | null {
  try {
    return localStorage.getItem(THUMB_PREFIX + VERSION + ':' + key);
  } catch {
    return null;
  }
}
function storeThumb(key: string, url: string): void {
  try {
    // drop portraits from older versions first
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      // (and this jet's portrait in an older paint job)
      const jet = THUMB_PREFIX + VERSION + ':' + key.slice(0, key.indexOf(':', key.indexOf(':') + 1) + 1);
      if (k?.startsWith(THUMB_PREFIX) && (!k.startsWith(THUMB_PREFIX + VERSION + ':') || k.startsWith(jet))) localStorage.removeItem(k);
    }
    localStorage.setItem(THUMB_PREFIX + VERSION + ':' + key, url);
  } catch {
    /* storage full or blocked: they are simply redrawn next time */
  }
}

/** zoom factor limits: right up against the jet .. well back */
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 1.55;

function clampN(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
