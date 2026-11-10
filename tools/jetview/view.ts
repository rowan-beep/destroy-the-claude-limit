// A bench for looking at one jet model on its own (no game): orthographic top / side / front / rear
// views at a known scale (pixels per metre), as shaded pictures and as black silhouettes, plus
// perspective pictures. Driven by tools/jetview/view.cjs.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Aircraft } from '../../src/aircraft/aircraft';
import { createAirframe } from '../../src/aircraft/models';
import type { AircraftType } from '../../src/aircraft/specs';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

interface Opt {
  type: AircraftType;
  ppm: number;
  hero?: boolean;
  gear?: boolean;
  stores?: boolean;
}

const black = new THREE.MeshBasicMaterial({ color: 0x000000 });

function build(o: Opt) {
  const ac = new Aircraft(o.type, 'blue', 'VIEW');
  if (!o.stores) ac.setStores({});
  ac.fm.pos.set(0, 0, 0);
  ac.fm.gearPos = o.gear ? 1 : 0;
  ac.fm.rpm.fill(0.3);
  const vis = createAirframe(ac, !!o.hero);
  vis.update(0.016);
  vis.root.position.set(0, 0, 0);
  vis.root.quaternion.identity();
  const sc = new THREE.Scene();
  sc.environment = env;
  sc.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight(0xfff4e6, 3.0);
  key.position.set(-6, 10, -8);
  sc.add(key);
  const rim = new THREE.DirectionalLight(0xbcd8ff, 1.4);
  rim.position.set(8, 3, 10);
  sc.add(rim);
  sc.add(new THREE.HemisphereLight(0xdfe8f0, 0x596068, 0.9));
  sc.add(vis.root);
  const box = new THREE.Box3().setFromObject(vis.root);
  return { ac, vis, sc, box };
}

function shot(sc: THREE.Scene, cam: THREE.Camera, w: number, h: number, sil: boolean): string {
  renderer.setSize(w, h, false);
  sc.background = new THREE.Color(sil ? 0xffffff : 0xdfe6ee);
  sc.overrideMaterial = sil ? black : null;
  renderer.render(sc, cam);
  return renderer.domElement.toDataURL('image/png');
}

/** the orthographic views: nose to the left in side and top */
(window as unknown as { jetview: unknown }).jetview = (o: Opt) => {
  const { sc, box, ac } = build(o);
  const out: Record<string, unknown> = {};
  const ppm = o.ppm;
  const m = 1.0; // margin (m)
  const cz = (box.min.z + box.max.z) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  const L = box.max.z - box.min.z + 2 * m;
  const Hh = box.max.y - box.min.y + 2 * m;
  const Wd = 2 * Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) + 2 * m;
  const ortho = (w: number, h: number) => new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 400);
  const views: [string, number, number, (c: THREE.OrthographicCamera) => void][] = [
    ['side', L, Hh, (c) => { c.position.set(-100, cy, cz); c.up.set(0, 1, 0); c.lookAt(0, cy, cz); }],
    ['top', L, Wd, (c) => { c.position.set(0, 100, cz); c.up.set(1, 0, 0); c.lookAt(0, 0, cz); }],
    ['bottom', L, Wd, (c) => { c.position.set(0, -100, cz); c.up.set(-1, 0, 0); c.lookAt(0, 0, cz); }],
    ['front', Wd, Hh, (c) => { c.position.set(0, cy, -100); c.up.set(0, 1, 0); c.lookAt(0, cy, 0); }],
    ['rear', Wd, Hh, (c) => { c.position.set(0, cy, 100); c.up.set(0, 1, 0); c.lookAt(0, cy, 0); }],
  ];
  for (const [name, w, h, place] of views) {
    const c = ortho(w, h);
    place(c);
    const pw = Math.round(w * ppm), ph = Math.round(h * ppm);
    out[name] = shot(sc, c, pw, ph, false);
    out[name + '_sil'] = shot(sc, c, pw, ph, true);
  }
  out.meta = { ppm, margin: m, box: { min: box.min.toArray(), max: box.max.toArray() }, length: ac.spec.length, span: ac.spec.span, height: ac.spec.height };
  return out;
};

/** perspective pictures: [name, from (x,y,z in jet lengths), look-at (m)] */
(window as unknown as { jetpersp: unknown }).jetpersp = (o: Opt & { w: number; h: number; shots: [string, number[], number[], number][] }) => {
  const { sc, ac } = build(o);
  const len = ac.spec.length;
  const out: Record<string, string> = {};
  for (const [name, from, at, fov] of o.shots) {
    const cam = new THREE.PerspectiveCamera(fov || 24, o.w / o.h, 0.1, 800);
    cam.position.set(from[0] * len, from[1] * len, from[2] * len);
    cam.lookAt(at[0], at[1], at[2]);
    out[name] = shot(sc, cam, o.w, o.h, false);
  }
  return out;
};
(window as unknown as { jetviewReady: boolean }).jetviewReady = true;
