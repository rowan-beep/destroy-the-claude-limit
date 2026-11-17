// Developer harness for the Dune Sea models: ?test=desert&obj=...
//   obj=camel            one camel (n=5: a row of five, each at its own gait phase)
//   obj=ruin:<kind>      one ruin; obj=ruins: every kind in a row
//   obj=jet              a crash site
//   view: az (deg, 0 = from -z), el (deg), dist (m), tgt=x,y,z, fov
//   t=seconds            the camels' gait time (walk=0: standing still); live=1 keeps animating
//   seed=n               the random seed for the model
import * as THREE from 'three';
import { mulberry32 } from './core/rng';
import { buildCamel, camelMaterial } from './world/camel';
import { buildRuin, ruinRadius, RUIN_KINDS, RuinKind, buildCrashedJet, CRASH_RADIUS } from './world/desertRuins';

export function runDesertTest(container: HTMLElement): void {
  const q = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9cc0e4);
  scene.fog = new THREE.Fog(0xd9c8a8, 300, 1500);
  scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x9a7a52, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.8);
  sun.position.set(-60, 90, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.far = 400;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  // sand: a gently rippled plane in the terrain's sand colour
  const pg = new THREE.PlaneGeometry(1200, 1200, 200, 200);
  pg.rotateX(-Math.PI / 2);
  const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), z = pp.getZ(i);
    const r = Math.hypot(x, z);
    pp.setY(i, r < 70 ? 0 : 0.6 * Math.sin(x * 0.35 + z * 0.08) * Math.min(1, (r - 70) / 40));
  }
  pg.computeVertexNormals();
  const ground = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.86, 0.71, 0.48, THREE.SRGBColorSpace) }));
  ground.receiveShadow = true;
  scene.add(ground);

  const obj = q.get('obj') ?? 'camel';
  const seed = +(q.get('seed') ?? 1);
  let camelMat: ReturnType<typeof camelMaterial> | null = null;
  let size = 6;
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const place = (g: THREE.BufferGeometry, x: number) => {
    const m = new THREE.Mesh(g, lambert);
    m.position.x = x;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const stats = { tris: 0, verts: 0 };
  const count = (g: THREE.BufferGeometry) => {
    stats.verts += g.attributes.position.count;
    stats.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  };
  if (obj === 'camel') {
    const n = +(q.get('n') ?? 1);
    const far = q.get('far') === '1';
    const g = buildCamel(far);
    count(g);
    camelMat = camelMaterial();
    const im = new THREE.InstancedMesh(g, camelMat, n);
    const phase = new Float32Array(n), walk = new Float32Array(n);
    const m4 = new THREE.Matrix4();
    const rnd = mulberry32(seed);
    for (let i = 0; i < n; i++) {
      m4.makeTranslation((i - (n - 1) / 2) * 4.5, 0, (rnd() - 0.5) * 2);
      im.setMatrixAt(i, m4);
      phase[i] = i * 1.7;
      walk[i] = q.get('walk') === '0' ? 0 : 1;
      im.setColorAt?.(i, new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rnd() * 0.3));
    }
    im.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    im.geometry.setAttribute('aWalk', new THREE.InstancedBufferAttribute(walk, 1));
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
    size = Math.max(5, n * 4.5);
  } else if (obj === 'jet') {
    const g = buildCrashedJet(mulberry32(seed));
    count(g);
    place(g, 0);
    size = CRASH_RADIUS * 2;
  } else {
    const kinds: RuinKind[] = obj === 'ruins' ? RUIN_KINDS : [obj.split(':')[1] as RuinKind];
    const widths = kinds.map((k) => ruinRadius(k) * 2 + 6);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = -total / 2;
    kinds.forEach((k, i) => {
      const g = buildRuin(k, mulberry32(seed + i));
      count(g);
      place(g, x + widths[i] / 2);
      x += widths[i];
    });
    size = total;
  }

  const cam = new THREE.PerspectiveCamera(+(q.get('fov') ?? 35), window.innerWidth / window.innerHeight, 0.1, 3000);
  const az = (+(q.get('az') ?? 35) * Math.PI) / 180;
  const el = (+(q.get('el') ?? 18) * Math.PI) / 180;
  const d = +(q.get('dist') ?? size * 1.4);
  const t = (q.get('tgt') ?? `0,${Math.min(3, size * 0.12)},0`).split(',').map(Number);
  cam.position.set(t[0] + Math.sin(az) * Math.cos(el) * d, t[1] + Math.sin(el) * d, t[2] - Math.cos(az) * Math.cos(el) * d);
  cam.lookAt(t[0], t[1], t[2]);

  const t0 = +(q.get('t') ?? 0);
  const start = performance.now();
  let frames = 0;
  const loop = () => {
    const time = q.get('live') ? t0 + (performance.now() - start) / 1000 : t0;
    camelMat?.setTime(time);
    renderer.render(scene, cam);
    frames++;
    if (frames < 4 || q.get('live')) requestAnimationFrame(loop);
    if (frames === 3) (window as unknown as { __ready: unknown }).__ready = { ...stats, calls: renderer.info.render.calls };
  };
  loop();
}
