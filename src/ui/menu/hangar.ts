// 3D hangar showcase behind the main menu: the selected jet on a turntable.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Aircraft } from '../../aircraft/aircraft';
import { createAirframe, AirframeVisual } from '../../aircraft/models';
import { AircraftType } from '../../aircraft/specs';

export class Hangar {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.5, 600);
  private jets = new Map<AircraftType, { vis: AirframeVisual; ac: Aircraft }>();
  private current: AircraftType = 'F15EX';
  private angle = 0.6;
  private t = 0;
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
  }

  private ensure(type: AircraftType): { vis: AirframeVisual; ac: Aircraft } {
    let j = this.jets.get(type);
    if (!j) {
      const ac = new Aircraft(type, 'blue', 'DEMO');
      ac.fm.pos.set(0, ac.spec.gear.height + 0.12, 0);
      ac.fm.gearPos = 1;
      ac.fm.rpm.fill(0.25);
      const vis = createAirframe(ac);
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
    this.angle += dt * 0.18;
    this.turntable.rotation.y = this.angle;
    const j = this.ensure(this.current);
    j.vis.update(dt);
    // the airframe visual positions itself from the flight model; keep it on the turntable
    j.vis.root.position.set(0, j.ac.spec.gear.height + 0.12, 0);
    j.vis.root.quaternion.identity();
    const len = j.ac.spec.length;
    const d = len * 1.9 + 6;
    this.camera.position.set(Math.sin(0.75) * d, 9 + Math.sin(this.t * 0.2) * 0.6, -Math.cos(0.75) * d);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // frame the jet slightly right of centre so the UI columns don't cover it
    this.camera.lookAt(-2, 1.8, 0);
    this.renderer.setRenderTarget(null);
    const tm = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.render(this.scene, this.camera);
    this.renderer.toneMapping = tm;
  }
}
