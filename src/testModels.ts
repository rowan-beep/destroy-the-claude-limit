// Developer harness: ?test=models&view=side|top|front|three&type=F15EX
import * as THREE from 'three';
import { Aircraft } from './aircraft/aircraft';
import { createAirframe } from './aircraft/models';
import type { AircraftType } from './aircraft/specs';

export function runModelTest(container: HTMLElement): void {
  const q = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb4d8);
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x6b5a48, 1.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-30, 60, -20);
  sun.castShadow = true;
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40; sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x77736a }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const types: AircraftType[] = q.get('type') ? [q.get('type') as AircraftType] : ['F15EX', 'FA18EF', 'TYPHOON'];
  const view = q.get('view') ?? 'three';
  const gearUp = q.get('gear') === 'up';
  types.forEach((t, i) => {
    const ac = new Aircraft(t, i === 1 ? 'red' : 'blue', 'T' + i);
    ac.fm.pos.set((i - (types.length - 1) / 2) * 24, ac.spec.gear.height, 0);
    ac.fm.gearPos = gearUp ? 0 : 1;
    ac.fm.rpm.fill(1);
    ac.fm.ab.fill(q.get('ab') ? 1 : 0);
    if (gearUp) ac.fm.pos.y += 3;
    const v = createAirframe(ac);
    v.update(0.016);
    for (let k = 0; k < 30; k++) v.update(0.05);
    scene.add(v.root);
  });
  const cam = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.5, 2000);
  const span = types.length * 24 * (types.length === 1 ? 0.75 : 1);
  if (view === 'side') { cam.position.set(span * 1.2, 3, 0); }
  else if (view === 'top') { cam.position.set(0, span * 1.6, 0.01); }
  else if (view === 'front') { cam.position.set(0, 3, -span * 1.3); }
  else if (view === 'rear') { cam.position.set(0, 5, span * 1.3); }
  else { cam.position.set(span * 0.7, span * 0.45, -span * 0.8); }
  cam.lookAt(0, 2, 0);
  renderer.render(scene, cam);
  (window as unknown as { __ready: unknown }).__ready = { ok: true, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
}
