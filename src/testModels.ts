// Developer harness: ?test=models&view=side|top|front|three&type=F15EX
import * as THREE from 'three';
import { Aircraft } from './aircraft/aircraft';
import { createAirframe } from './aircraft/models';
import type { AircraftType } from './aircraft/specs';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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
  const types: AircraftType[] = q.get('type') ? [q.get('type') as AircraftType] : ['F15EX', 'FA18EF', 'TYPHOON', 'SU35', 'RAFALE'];
  const view = q.get('view') ?? 'three';
  const gearUp = q.get('gear') === 'up';
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
    const t0 = performance.now();
    const v = createAirframe(ac, q.get('hero') === '1');
    (window as unknown as { __build: number[] }).__build = [...((window as unknown as { __build?: number[] }).__build ?? []), Math.round(performance.now() - t0)];
    v.update(0.016);
    for (let k = 0; k < 30; k++) v.update(0.05);
    scene.add(v.root);
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
    const t = (q.get('tgt') ?? '0,2,0').split(',').map(Number);
    cam.position.set(t[0] + Math.sin(az) * Math.cos(el) * d, t[1] + Math.sin(el) * d, t[2] - Math.cos(az) * Math.cos(el) * d);
    cam.lookAt(t[0], t[1], t[2]);
    cam.fov = +(q.get('fov') ?? 35);
    cam.updateProjectionMatrix();
  }
  renderer.render(scene, cam);
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
