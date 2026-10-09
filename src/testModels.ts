// Developer harness: ?test=models&view=side|top|front|three&type=F15EX
import * as THREE from 'three';
import { Aircraft } from './aircraft/aircraft';
import { createAirframe } from './aircraft/models';
import type { AircraftType } from './aircraft/specs';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildKC46 } from './game/tanker';

export function runModelTest(container: HTMLElement): void {
  const q = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb4d8);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x6b5a48, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-30, 60, -20);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40; sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x77736a }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const canopies = new Set<THREE.Object3D>();
  // type=TANKER: the KC-46 instead of a jet
  const tanker = q.get('type') === 'TANKER';
  if (tanker) {
    const tm = buildKC46();
    tm.group.position.set(0, 8, 0);
    scene.add(tm.group);
  }
  const types: AircraftType[] = tanker ? [] : q.get('type') ? [q.get('type') as AircraftType] : ['F15EX', 'FA18EF', 'F16C', 'TYPHOON', 'SU35', 'RAFALE', 'F22', 'MIG31', 'SR71', 'X15', 'F35A', 'SU57', 'GRIPEN'];
  const view = q.get('view') ?? 'three';
  const gearUp = q.get('gear') === 'up';
  // the last jet's pilot eye in world space (tgt=eye aims the orbit camera at it)
  const eye = { world: null as THREE.Vector3 | null };
  types.forEach((t, i) => {
    const ac = new Aircraft(t, i === 1 ? 'red' : 'blue', 'T' + i);
    ac.fm.pos.set((i - (types.length - 1) / 2) * 24, ac.spec.gear.height, 0);
    ac.fm.gearPos = gearUp ? 0 : 1;
    ac.fm.rpm.fill(q.get('rpm') ? +q.get('rpm')! : 1);
    ac.fm.ab.fill(q.get('ab') ? 1 : 0);
    if (gearUp) ac.fm.pos.y += 3;
    if (q.get('sb')) ac.fm.speedbrakePos = 1;
    // pose the thrust-vectoring nozzles (radians): tvc=pitch,yaw,roll
    if (q.get('tvc')) {
      const [np, ny, nr] = q.get('tvc')!.split(',').map(Number);
      ac.fm.nozzle.p = np || 0;
      ac.fm.nozzle.y = ny || 0;
      ac.fm.nozzle.roll = nr || 0;
    }
    // clean=1: no stores or pylons (the bare airframe, to compare with drawings)
    if (q.get('clean')) for (const st of ac.stations) st.store = null;
    const t0 = performance.now();
    const v = createAirframe(ac, q.get('hero') === '1');
    // (the canopy glass is part of the outline whatever its blending)
    if (v.canopy) canopies.add(v.canopy);
    (window as unknown as { __build: number[] }).__build = [...((window as unknown as { __build?: number[] }).__build ?? []), Math.round(performance.now() - t0)];
    v.update(0.016);
    for (let k = 0; k < 30; k++) v.update(0.05);
    if (q.get('far')) v.setFar(true);
    if (q.get('suit')) v.applySuit('#' + q.get('suit'));
    if (q.get('noao')) v.root.traverse((o) => { const u = ((o as THREE.Mesh).material as THREE.Material | undefined)?.userData?.skinUniforms; if (u?.aoOn) u.aoOn.value = 0; });
    scene.add(v.root);
    v.root.updateMatrixWorld(true);
    eye.world = v.cockpitEye.clone().applyMatrix4(v.body.matrixWorld);
  });
  const cam = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.05, 2000);
  const span = types.length * 24 * (types.length === 1 ? 0.75 : 1);
  if (view === 'side') { cam.position.set(span * 1.2, 3, 0); }
  else if (view === 'top') { cam.position.set(0, span * 1.6, 0.01); }
  else if (view === 'front') { cam.position.set(0, 3, -span * 1.3); }
  else if (view === 'rear') { cam.position.set(0, 5, span * 1.3); }
  else { cam.position.set(span * 0.7, span * 0.45, -span * 0.8); }
  cam.lookAt(0, 2, 0);
  if (q.get('az')) {
    // orbit: az (deg, 0 = from the nose), el (deg), dist (m), target x,y,z
    const az = (+q.get('az')! * Math.PI) / 180;
    const el = (+(q.get('el') ?? 15) * Math.PI) / 180;
    const d = +(q.get('dist') ?? 28);
    const ew = eye.world;
    const t = q.get('tgt') === 'eye' && ew ? [ew.x, ew.y, ew.z] : (q.get('tgt') ?? '0,2,0').split(',').map(Number);
    cam.position.set(t[0] + Math.sin(az) * Math.cos(el) * d, t[1] + Math.sin(el) * d, t[2] - Math.cos(az) * Math.cos(el) * d);
    cam.lookAt(t[0], t[1], t[2]);
    cam.fov = +(q.get('fov') ?? 35);
    cam.updateProjectionMatrix();
  }
  let shot: THREE.Camera = cam;
  if (q.get('ortho')) {
    // true-scale orthographic views to lay over three-view drawings: ortho=side|top|front, ppm = pixels per
    // metre, sil=1 draws the airframe as a flat black silhouette on white
    ground.visible = false;
    scene.background = new THREE.Color(0xffffff);
    ground.removeFromParent();
    // (no exhaust glow, heat haze or other additive effects: just the airframe)
    const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const box = new THREE.Box3();
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[];
      if (!canopies.has(m) && mats.some((x) => x.blending === THREE.AdditiveBlending)) {
        m.visible = false;
        return;
      }
      let vis = true;
      for (let p: THREE.Object3D | null = m; p; p = p.parent) if (!p.visible) vis = false;
      if (!vis) return;
      if (q.get('sil')) m.material = black;
      box.expandByObject(m);
    });
    const c = box.getCenter(new THREE.Vector3());
    const ppm = +(q.get('ppm') ?? 40);
    const hw = window.innerWidth / ppm / 2;
    const hh = window.innerHeight / ppm / 2;
    const oc = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 1000);
    const o = q.get('ortho');
    if (o === 'top') {
      oc.up.set(0, 0, -1);
      oc.position.set(c.x, c.y + 200, c.z);
    } else if (o === 'front') oc.position.set(c.x, c.y, c.z - 200);
    else oc.position.set(c.x + 200, c.y, c.z);
    oc.lookAt(c);
    oc.updateProjectionMatrix();
    shot = oc;
    (window as unknown as { __box: number[] }).__box = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
  }
  renderer.render(scene, shot);
  const breakdown: [string, number][] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const g = m.geometry;
    const t = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const mat = m.material as THREE.MeshStandardMaterial;
    breakdown.push([`${mat.type}:${mat.color ? mat.color.getHexString() : ''}:${m.parent?.name ?? ''}`, Math.round(t)]);
  });
  breakdown.sort((a, b) => b[1] - a[1]);
  (window as unknown as { __ready: unknown }).__ready = { ok: true, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, top: q.get("stats") ? breakdown.slice(0, 25) : undefined, build: (window as unknown as { __build?: number[] }).__build };
}
