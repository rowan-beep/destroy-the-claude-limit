// Airbase scenery: runway with full ICAO markings, taxiways, apron,
// hardened aircraft shelters, tower, hangars, fuel farm, radar dome,
// edge/approach lighting and working PAPI glide-slope lights.
// Static structures only -- there are no ground vehicles in this theater.

import * as THREE from 'three';
import { keepLightsVisible } from '../render/night';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AIRFIELDS, AirfieldDef } from './islands';
import { makePavementTexture, makeTextTexture, getSoftDotTexture } from '../render/textures';

import { RUNWAY_Y } from './airfieldMeshes.consts';
export { RUNWAY_Y };
const TAXI_ACROSS = 185;

type Geo = THREE.BufferGeometry;

/** Flat quad on the ground in airfield-local coords (across = x, along = -z). */
function groundQuad(across: number, along: number, w: number, l: number, y: number, rot = 0): Geo {
  const g = new THREE.PlaneGeometry(w, l);
  g.rotateX(-Math.PI / 2);
  if (rot) g.rotateY(rot);
  g.translate(across, y, -along);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): Geo {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

function paint(g: Geo, c: THREE.Color): Geo {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const lin = new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = lin.r;
    arr[i * 3 + 1] = lin.g;
    arr[i * 3 + 2] = lin.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

function runwayNumber(heading: number): string {
  let n = Math.round(heading / 10) % 36;
  if (n === 0) n = 36;
  return n < 10 ? '0' + n : String(n);
}

let sharedMats: {
  asphalt: THREE.MeshLambertMaterial;
  shoulder: THREE.MeshLambertMaterial;
  concrete: THREE.MeshLambertMaterial;
  white: THREE.MeshLambertMaterial;
  yellow: THREE.MeshLambertMaterial;
  struct: THREE.MeshLambertMaterial;
  glass: THREE.MeshStandardMaterial;
} | null = null;

function mats() {
  if (sharedMats) return sharedMats;
  const asphaltTex = makePavementTexture(21, [62, 63, 66], 0.18);
  asphaltTex.repeat.set(1, 1);
  const concreteTex = makePavementTexture(33, [150, 147, 140], 0.12);
  const shoulderTex = makePavementTexture(45, [112, 108, 100], 0.2);
  sharedMats = {
    asphalt: new THREE.MeshLambertMaterial({ map: asphaltTex }),
    shoulder: new THREE.MeshLambertMaterial({ map: shoulderTex }),
    concrete: new THREE.MeshLambertMaterial({ map: concreteTex }),
    white: new THREE.MeshLambertMaterial({ color: 0xe8e8e4 }),
    yellow: new THREE.MeshLambertMaterial({ color: 0xd8b21c }),
    struct: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.6, roughness: 0.15 }),
  };
  return sharedMats;
}

/** Plane geometry with UVs scaled to world metres / tile. */
function texturedStrip(across: number, along: number, w: number, l: number, y: number, tile: number): Geo {
  const g = new THREE.PlaneGeometry(w, l);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * l) / tile);
  g.rotateX(-Math.PI / 2);
  g.translate(across, y, -along);
  return g;
}

interface PapiLight {
  mesh: THREE.Mesh;
  angle: number;
  world: THREE.Vector3;
}

export class AirfieldView {
  readonly group = new THREE.Group();
  private papi: PapiLight[] = [];
  private lights: THREE.Points;
  private beacon: THREE.Mesh;
  private t = Math.random() * 10;

  constructor(readonly f: AirfieldDef) {
    const m = mats();
    const g = this.group;
    g.name = 'airfield-' + f.id;
    g.position.set(f.x, f.elev, f.z);
    g.rotation.y = (-f.heading * Math.PI) / 180;
    const L = f.length;
    const W = f.width;

    // --- pavement -------------------------------------------------------
    const pave: Geo[] = [];
    pave.push(texturedStrip(0, 0, W, L, RUNWAY_Y, 40));
    // blast pads / overruns
    pave.push(texturedStrip(0, -L / 2 - 60, W, 120, RUNWAY_Y - 0.02, 40));
    pave.push(texturedStrip(0, L / 2 + 60, W, 120, RUNWAY_Y - 0.02, 40));
    // taxiway + connectors
    pave.push(texturedStrip(TAXI_ACROSS, 0, 23, L - 160, RUNWAY_Y - 0.03, 40));
    for (const a of [-L / 2 + 70, -L / 4, 0, L / 4, L / 2 - 70]) {
      pave.push(texturedStrip(TAXI_ACROSS / 2, a, TAXI_ACROSS, 23, RUNWAY_Y - 0.04, 40));
    }
    const asphalt = new THREE.Mesh(mergeGeometries(pave)!, m.asphalt);
    asphalt.receiveShadow = true;
    g.add(asphalt);

    const shoulders: Geo[] = [
      texturedStrip(-W / 2 - 7.5, 0, 15, L, RUNWAY_Y - 0.06, 30),
      texturedStrip(W / 2 + 7.5, 0, 15, L, RUNWAY_Y - 0.06, 30),
    ];
    const sh = new THREE.Mesh(mergeGeometries(shoulders)!, m.shoulder);
    sh.receiveShadow = true;
    g.add(sh);

    // apron and shelter taxi links
    const apronGeo: Geo[] = [texturedStrip(315, 0, 220, 1400, RUNWAY_Y - 0.05, 30)];
    for (let i = 0; i < 8; i++) {
      const a = -560 + i * 160;
      apronGeo.push(texturedStrip(450, a, 60, 34, RUNWAY_Y - 0.05, 30));
    }
    apronGeo.push(texturedStrip(560, -850, 120, 260, RUNWAY_Y - 0.05, 30)); // fuel farm pad
    apronGeo.push(texturedStrip(560, 830, 160, 220, RUNWAY_Y - 0.05, 30)); // hangar pad
    const apron = new THREE.Mesh(mergeGeometries(apronGeo)!, m.concrete);
    apron.receiveShadow = true;
    g.add(apron);

    // --- markings -------------------------------------------------------
    const white: Geo[] = [];
    const my = RUNWAY_Y + 0.04;
    // edge lines
    white.push(groundQuad(-W / 2 + 1.2, 0, 0.9, L, my));
    white.push(groundQuad(W / 2 - 1.2, 0, 0.9, L, my));
    for (const end of [-1, 1]) {
      const th = end * (L / 2); // threshold position along
      const inward = -end; // direction into the runway from this end
      // piano keys
      for (let i = 0; i < 8; i++) {
        const off = 2.2 + i * 2.9;
        white.push(groundQuad(off, th + inward * 30, 1.8, 45, my));
        white.push(groundQuad(-off, th + inward * 30, 1.8, 45, my));
      }
      // threshold bar
      white.push(groundQuad(0, th + inward * 3, W - 3, 1.8, my));
      // aiming point
      white.push(groundQuad(13, th + inward * 400, 9, 60, my));
      white.push(groundQuad(-13, th + inward * 400, 9, 60, my));
      // touchdown zone
      const tdz: [number, number][] = [
        [150, 3],
        [300, 3],
        [600, 2],
        [750, 2],
        [900, 1],
      ];
      for (const [dist, n] of tdz) {
        for (let k = 0; k < n; k++) {
          const off = 8 + k * 3.2;
          white.push(groundQuad(off, th + inward * dist, 1.8, 22.5, my));
          white.push(groundQuad(-off, th + inward * dist, 1.8, 22.5, my));
        }
      }
    }
    // centerline dashes
    for (let a = -L / 2 + 150; a < L / 2 - 150; a += 60) white.push(groundQuad(0, a, 0.9, 36, my));
    const whiteMesh = new THREE.Mesh(mergeGeometries(white)!, m.white);
    whiteMesh.receiveShadow = true;
    g.add(whiteMesh);

    // taxiway yellow lines
    const yellow: Geo[] = [groundQuad(TAXI_ACROSS, 0, 0.35, L - 170, RUNWAY_Y + 0.01)];
    for (const a of [-L / 2 + 70, -L / 4, 0, L / 4, L / 2 - 70]) {
      yellow.push(groundQuad(TAXI_ACROSS / 2 + 12, a, TAXI_ACROSS - 24, 0.35, RUNWAY_Y + 0.0));
      // hold-short bars
      yellow.push(groundQuad(W / 2 + 40, a, 0.5, 20, RUNWAY_Y + 0.01));
      yellow.push(groundQuad(W / 2 + 42, a, 0.5, 20, RUNWAY_Y + 0.01));
    }
    for (let i = 0; i < 8; i++) yellow.push(groundQuad(440, -560 + i * 160, 60, 0.35, RUNWAY_Y + 0.0));
    const yMesh = new THREE.Mesh(mergeGeometries(yellow)!, m.yellow);
    g.add(yMesh);

    // runway numbers (read from the approach direction)
    const nearNum = runwayNumber(f.heading);
    const farNum = runwayNumber(f.heading + 180);
    for (const [txt, along, rot] of [
      [nearNum, -L / 2 + 80, 0],
      [farNum, L / 2 - 80, Math.PI],
    ] as [string, number, number][]) {
      const tex = makeTextTexture(txt, 256, 512, { font: 'bold 400px Arial', color: '#ecece8' });
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(16, 32), mat);
      q.rotation.x = -Math.PI / 2;
      q.rotation.z = rot;
      q.position.set(0, my + 0.01, -along);
      g.add(q);
    }

    // --- structures -------------------------------------------------------
    const struct: Geo[] = [];
    const concrete = new THREE.Color(0.62, 0.6, 0.55);
    const camoA = new THREE.Color(0.45, 0.43, 0.36);
    const beige = new THREE.Color(0.78, 0.72, 0.6);
    const grey = new THREE.Color(0.55, 0.56, 0.58);
    const darkGrey = new THREE.Color(0.3, 0.31, 0.33);
    const whiteC = new THREE.Color(0.92, 0.92, 0.9);
    const team = f.team === 'blue' ? new THREE.Color(0.15, 0.3, 0.75) : new THREE.Color(0.75, 0.15, 0.12);

    // Hardened aircraft shelters
    for (let i = 0; i < 8; i++) {
      const a = -560 + i * 160;
      // half-cylinder arch: axis runs across (x), opening faces the apron (-x)
      const shelter = new THREE.CylinderGeometry(12, 12, 36, 20, 1, false, -Math.PI / 2, Math.PI);
      shelter.rotateX(-Math.PI / 2);
      shelter.rotateY(Math.PI / 2);
      shelter.scale(1, 0.8, 1);
      shelter.translate(502, 0, a);
      struct.push(paint(shelter, i % 2 ? camoA : concrete));
      // earth berm hugging the sides and back
      const berm = new THREE.CylinderGeometry(15, 15, 30, 16, 1, false, -Math.PI / 2, Math.PI);
      berm.rotateX(-Math.PI / 2);
      berm.rotateY(Math.PI / 2);
      berm.scale(1, 0.55, 1);
      berm.translate(509, 0, a);
      struct.push(paint(berm, new THREE.Color(0.42, 0.44, 0.33)));
      // sliding blast doors (half open) on their rail beam, and the rear exhaust deflector
      struct.push(paint(box(1.4, 8.6, 11.5, 483.5, 0, a - 11), darkGrey));
      struct.push(paint(box(1.4, 8.6, 11.5, 483.5, 0, a + 11), darkGrey));
      struct.push(paint(box(2.2, 1.2, 34, 483.5, 8.6, a), grey));
      struct.push(paint(box(2.5, 5, 9, 521.5, 0, a), darkGrey));
      // a parked friendly jet silhouette-free apron marking: lead-in line
      struct.push(paint(box(30, 0.05, 0.4, 460, RUNWAY_Y + 0.02, a), new THREE.Color(0.85, 0.7, 0.15)));
    }

    // control tower
    struct.push(paint(box(9, 24, 9, 540, 0, 760), beige));
    struct.push(paint(box(13, 1.2, 13, 540, 24, 760), grey));
    struct.push(paint(box(14, 1.2, 14, 540, 30.2, 760), grey));
    // two-storey operations building at the foot of the tower
    struct.push(paint(box(30, 8, 16, 560, 0, 745), beige));
    struct.push(paint(box(30.6, 0.6, 16.6, 560, 8, 745), darkGrey));
    struct.push(paint(box(1.5, 4, 1.5, 540, 31.4, 760), darkGrey));
    struct.push(paint(box(3, 1, 3, 540, 35.4, 760), team));

    // maintenance hangars
    for (const a of [-760, -900]) {
      struct.push(paint(box(46, 16, 60, 570, 0, a), grey));
      const roof = paint(new THREE.CylinderGeometry(33, 33, 60, 16, 1, false, -Math.PI / 4.5, (Math.PI * 2) / 4.5), grey);
      roof.rotateX(-Math.PI / 2);
      roof.scale(1, 0.4, 1);
      roof.translate(570, 16 - 33 * 0.4 * Math.cos(Math.PI / 4.5) - 0.3, a);
      struct.push(roof);
      struct.push(paint(box(46.5, 3, 60.5, 570, 12.5, a), team)); // team stripe
      for (let k = 0; k < 6; k++) struct.push(paint(box(0.4, 12, 9.6, 546.8, 0, a - 25 + k * 10), k % 2 ? darkGrey : grey)); // door leaves
      struct.push(paint(box(0.6, 1.2, 60, 546.5, 12, a), darkGrey)); // door header
    }

    // fuel farm (white tanks, like the reference screenshots)
    for (let i = 0; i < 4; i++) {
      const tank = paint(new THREE.CylinderGeometry(11, 11, 15, 20), whiteC);
      tank.translate(540 + (i % 2) * 34, 7.5, 780 + Math.floor(i / 2) * 34 + 10);
      struct.push(tank);
      const top = paint(new THREE.CylinderGeometry(9, 11, 2.5, 20), new THREE.Color(0.85, 0.85, 0.83));
      top.translate(540 + (i % 2) * 34, 16.2, 780 + Math.floor(i / 2) * 34 + 10);
      struct.push(top);
    }

    // fuel farm containment bund
    for (const [x, z, w, l] of [[557, 772, 70, 1.2], [557, 862, 70, 1.2], [522, 817, 1.2, 90], [592, 817, 1.2, 90]] as const) struct.push(paint(box(w, 1.6, l, x, 0, z), darkGrey));

    // apron floodlight masts (25 m) along the back of the apron
    for (let k = -3; k <= 3; k++) {
      struct.push(paint(box(0.6, 25, 0.6, 428, 0, k * 200), grey));
      struct.push(paint(box(3, 1.2, 1.6, 427, 25, k * 200), darkGrey));
    }
    // ground support vehicles on the apron: fuel bowsers (10 m) and tugs
    const rngV = mulberry(f.id.length * 17 + 5);
    for (let k = 0; k < 6; k++) {
      const z = -520 + k * 190 + rngV() * 30;
      const x = 440 + rngV() * 20;
      struct.push(paint(box(2.5, 3, 10, x, 0, z), k % 2 ? new THREE.Color(0.85, 0.85, 0.8) : new THREE.Color(0.35, 0.4, 0.3)));
      struct.push(paint(box(2.2, 1.6, 3.5, x + 6, 0, z + 2), new THREE.Color(0.8, 0.65, 0.1)));
    }
    // perimeter fence behind the base
    for (let z = -1000; z < 1000; z += 4) struct.push(paint(box(0.08, 2.4, 0.08, 830, 0, z), grey));
    struct.push(paint(box(0.05, 0.08, 2000, 830, 2.3, 0), grey));
    struct.push(paint(box(0.05, 0.08, 2000, 830, 1.2, 0), grey));
    // windsock by the runway
    struct.push(paint(box(0.25, 7, 0.25, -60, 0, -L / 2 + 350), grey));
    const sock = new THREE.CylinderGeometry(0.25, 0.6, 3.6, 8, 1, true);
    sock.rotateZ(Math.PI / 2);
    sock.translate(-58, 6.8, -L / 2 + 350);
    struct.push(paint(sock, new THREE.Color(0.95, 0.45, 0.1)));

    // admin / barracks blocks
    const rngB = mulberry(f.id.length * 31 + f.heading);
    for (let i = 0; i < 14; i++) {
      const bw = 14 + rngB() * 22, bd = 12 + rngB() * 30, bh = 5 + rngB() * 9;
      const x = 640 + rngB() * 150;
      const z = -420 + i * 64 + rngB() * 20;
      struct.push(paint(box(bw, bh, bd, x, 0, z), rngB() < 0.5 ? beige : concrete));
      struct.push(paint(box(bw + 0.6, 0.6, bd + 0.6, x, bh, z), darkGrey));
    }

    // radar dome on a lattice tower (static site radar feeding the GCI)
    struct.push(paint(box(6, 18, 6, 700, 0, 300), grey));
    const dome = paint(new THREE.SphereGeometry(7.5, 20, 14), whiteC);
    dome.translate(700, 25, 300);
    struct.push(dome);

    // apron team roundel
    const roundel = paint(new THREE.CircleGeometry(20, 32), team);
    roundel.rotateX(-Math.PI / 2);
    roundel.translate(330, RUNWAY_Y + 0.02, 0);
    struct.push(roundel);
    const roundelIn = paint(new THREE.CircleGeometry(9, 32), whiteC);
    roundelIn.rotateX(-Math.PI / 2);
    roundelIn.translate(330, RUNWAY_Y + 0.04, 0);
    struct.push(roundelIn);

    const structMesh = new THREE.Mesh(mergeGeometries(struct)!, m.struct);
    structMesh.castShadow = true;
    structMesh.receiveShadow = true;
    g.add(structMesh);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 12), m.glass);
    cab.position.set(540, 27.7, 760);
    g.add(cab);

    // rotating beacon on the tower
    this.beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 8, 6),
      new THREE.MeshBasicMaterial({ color: f.team === 'blue' ? 0x66aaff : 0xff5544 }),
    );
    this.beacon.position.set(540, 37, 760);
    g.add(this.beacon);

    // --- lighting ---------------------------------------------------------
    const pts: number[] = [];
    const cols: number[] = [];
    const push = (x: number, y: number, z: number, c: [number, number, number]) => {
      pts.push(x, y, z);
      cols.push(...c);
    };
    for (let a = -L / 2; a <= L / 2; a += 60) {
      push(-W / 2 - 1.5, RUNWAY_Y + 0.4, -a, [1, 0.95, 0.8]);
      push(W / 2 + 1.5, RUNWAY_Y + 0.4, -a, [1, 0.95, 0.8]);
    }
    for (let x = -W / 2; x <= W / 2; x += 3) {
      push(x, RUNWAY_Y + 0.4, L / 2 + 2, [0.2, 1, 0.3]); // threshold green (near end)
      push(x, RUNWAY_Y + 0.4, -L / 2 - 2, [1, 0.2, 0.15]); // runway end red (far end)
    }
    // approach lighting (ALSF style) before the near threshold
    for (let d = 30; d <= 900; d += 30) {
      push(0, RUNWAY_Y + 1, L / 2 + d, [1, 1, 0.9]);
      if (d % 150 === 0) for (let x = -15; x <= 15; x += 3) push(x, RUNWAY_Y + 1, L / 2 + d, [1, 1, 0.9]);
    }
    for (let d = 30; d <= 600; d += 30) push(0, RUNWAY_Y + 1, -L / 2 - d, [1, 1, 0.9]);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.lights = new THREE.Points(
      lg,
      keepLightsVisible(
        new THREE.PointsMaterial({
          size: 2.2,
          sizeAttenuation: true,
          vertexColors: true,
          map: getSoftDotTexture(),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.9,
          toneMapped: false,
        }),
      ),
    );
    g.add(this.lights);

    // PAPI: 4 boxes left of the near threshold, 300 m in
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const across = -W / 2 - 15 - i * 9;
      const along = -L / 2 + 300;
      mesh.position.set(across, RUNWAY_Y + 0.6, -along);
      g.add(mesh);
      this.papi.push({ mesh, angle: [3.5, 3.17, 2.83, 2.5][i], world: new THREE.Vector3() });
    }
    g.updateMatrixWorld(true);
    for (const p of this.papi) p.mesh.getWorldPosition(p.world);
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.t += dt;
    const on = Math.sin(this.t * 4) > 0.3;
    this.beacon.visible = on;
    for (const p of this.papi) {
      const dx = cam.x - p.world.x, dz = cam.z - p.world.z;
      const hd = Math.sqrt(dx * dx + dz * dz);
      const ang = (Math.atan2(cam.y - p.world.y, hd) * 180) / Math.PI;
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(ang > p.angle ? 0xffffff : 0xff2010);
    }
  }
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class AirfieldRenderer {
  readonly views: AirfieldView[] = [];
  private lastT = performance.now();

  constructor(scene: THREE.Scene) {
    for (const f of AIRFIELDS) {
      // carriers are drawn by the carrier renderer
      if (f.carrier) continue;
      const v = new AirfieldView(f);
      scene.add(v.group);
      this.views.push(v);
    }
  }

  update(cam: THREE.Vector3): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    for (const v of this.views) {
      const dx = cam.x - v.f.x, dz = cam.z - v.f.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      v.group.visible = d < 90000;
      if (v.group.visible) v.update(dt, cam);
    }
  }
}
