// The space program's showcase behind its menu: a coastal launch site seen
// from the air on a clear morning. A tall lattice launch tower stands beside an
// empty launch mount (the rocket will stand here); a tank farm, a crawler
// crane, low sheds, a road with parked cars and a long black wall surround the
// pad; beyond lie sand flats, tidal channels, the dunes, the beach and the sea.
// The camera orbits the pad: drag, scroll, double-click to reset.

import * as THREE from 'three';

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 1.6;
const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}
function tex(c: HTMLCanvasElement, srgb = true, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Straight steel members, drawn as one instanced mesh. */
class Beams {
  private mats: THREE.Matrix4[] = [];
  add(a: THREE.Vector3, b: THREE.Vector3, w: number, d = w): void {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.mats.push(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(w, len, d)));
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, ry = 0): void {
    this.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz)));
  }
  build(mat: THREE.Material, shadow = true): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, this.mats.length);
    this.mats.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    return m;
  }
}

// layout (metres): the pad at the origin, the sea to the north (-z), the road to the south (+z)
const SHORE_Z = -330;
const GROUND = 3000;

export class LaunchSite {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 1, 12000);
  drawWith: ((scene: THREE.Scene, camera: THREE.Camera) => void) | null = null;
  active = false;
  private yaw = -0.35;
  private pitch = 0.2;
  private zoom = 1;
  private yawS = -0.35;
  private pitchS = 0.2;
  private zoomS = 1;
  private userView = false;
  private drag: { id: number; x: number; y: number } | null = null;
  private vYaw = 0;
  private vPitch = 0;
  private t = 0;
  private sea!: THREE.Mesh;
  private seaTex!: THREE.CanvasTexture;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.build();
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      const envScene = new THREE.Scene();
      envScene.add(this.makeSky());
      this.scene.environment = pmrem.fromScene(envScene, 0, 1, 20000).texture;
      this.scene.environmentIntensity = 0.35;
    } catch {
      /* the lights carry it */
    }
    pmrem.dispose();
    this.bindControls();
  }

  // the morning sun: low in the east, behind the camera's left shoulder
  private sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(140));

  /** A clear coastal sky: deep blue overhead, a pale haze band on the horizon, a soft glow round the sun. */
  private makeSky(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color('#2f6fc4') },
        mid: { value: new THREE.Color('#78aee6') },
        horizon: { value: new THREE.Color('#d7e6f2') },
        sun: { value: this.sunDir.clone() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 zenith; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sun;
        varying vec3 vDir;
        void main(){
          float y = clamp(vDir.y, -0.2, 1.0);
          float h = clamp(y, 0.0, 1.0);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.12, h));
          c = mix(c, zenith, smoothstep(0.12, 0.65, h));
          // a thin band of haze right on the horizon, and the ground below it
          c = mix(c, horizon * 1.04, exp(-abs(y) * 60.0) * 0.6);
          float mu = max(dot(normalize(vDir), normalize(sun)), 0.0);
          c += vec3(1.0, 0.92, 0.78) * (pow(mu, 8.0) * 0.18 + pow(mu, 300.0) * 2.5);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), mat);
    m.frustumCulled = false;
    return m;
  }

  private build(): void {
    const s = this.scene;
    s.add(this.makeSky());
    s.fog = new THREE.Fog(0xc2d6e8, 2200, 8500);

    // --- light
    s.add(new THREE.HemisphereLight(0xb8d4ff, 0x8a7458, 0.55));
    const sun = new THREE.DirectionalLight(0xffeedd, 2.4);
    sun.position.copy(this.sunDir).multiplyScalar(900);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const c = sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -420;
    c.right = 420;
    c.top = 420;
    c.bottom = -420;
    c.near = 100;
    c.far = 2000;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    s.add(sun, sun.target);

    this.buildGround();
    this.buildSea();
    this.buildPad();
    this.buildTower();
    this.buildTankFarm();
    this.buildCrane();
    this.buildRoadAndYard();
  }

  // --------------------------------------------------------------------------------------------
  // landscape
  // --------------------------------------------------------------------------------------------

  private buildGround(): void {
    const s = this.scene;
    const N = 2048;
    const W = GROUND;
    const px = (x: number) => ((x + W / 2) / W) * N;
    const pz = (z: number) => ((z + W / 2) / W) * N;
    const rnd = prng(17);
    const water = (g: CanvasRenderingContext2D, rough: boolean) => {
      // tidal channels and lagoons winding through the flats
      g.strokeStyle = rough ? '#141414' : '#7f99a0';
      g.fillStyle = rough ? '#141414' : '#86a2a8';
      g.lineCap = 'round';
      const chan = (pts: [number, number][], w: number) => {
        g.lineWidth = (w / W) * N;
        g.beginPath();
        pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
        g.stroke();
      };
      chan([[1500, -60], [900, -40], [620, -110], [420, -90], [300, -150], [150, -120]], 26);
      chan([[1500, 120], [1100, 90], [860, 160], [700, 120]], 18);
      chan([[-1500, 520], [-900, 480], [-600, 560], [-200, 520], [200, 600], [700, 540], [1500, 600]], 30);
      chan([[-700, 380], [-420, 420], [-160, 390], [60, 450]], 14);
      const blob = (x: number, z: number, rx: number, rz: number) => {
        g.beginPath();
        g.ellipse(px(x), pz(z), (rx / W) * N, (rz / W) * N, rnd() * 0.6, 0, Math.PI * 2);
        g.fill();
      };
      blob(260, 430, 120, 30);
      blob(-120, 470, 160, 26);
      blob(620, -170, 140, 40);
      blob(1000, -230, 220, 60);
      blob(-600, 300, 90, 30);
    };
    const color = canvas(N, N, (g) => {
      // sand and pale mud, with darker scrub
      g.fillStyle = '#b79c74';
      g.fillRect(0, 0, N, N);
      for (let i = 0; i < 1600; i++) {
        const x = rnd() * N, y = rnd() * N, r = 10 + rnd() * 90;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        const k = rnd();
        const col = k < 0.45 ? '110,100,72' : k < 0.75 ? '150,128,96' : '214,196,160';
        gr.addColorStop(0, `rgba(${col},${0.12 + rnd() * 0.25})`);
        gr.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // the low, scrubby dunes behind the beach
      const dunes = g.createLinearGradient(0, pz(SHORE_Z - 10), 0, pz(SHORE_Z + 160));
      dunes.addColorStop(0, 'rgba(226,210,176,1)');
      dunes.addColorStop(0.3, 'rgba(150,135,100,0.8)');
      dunes.addColorStop(1, 'rgba(150,135,100,0)');
      g.fillStyle = dunes;
      g.fillRect(0, pz(SHORE_Z - 10), N, pz(SHORE_Z + 160) - pz(SHORE_Z - 10));
      water(g, false);
      // wet sand along the channels
      g.globalAlpha = 0.25;
      g.lineWidth = 10;
      g.strokeStyle = '#8c7a5c';
      g.globalAlpha = 1;
      // the compacted pad and the yard: hard pale gravel
      g.fillStyle = '#cbb895';
      g.fillRect(px(-220), pz(-130), px(220) - px(-220), pz(150) - pz(-130));
      g.fillStyle = '#cbbd9f';
      g.fillRect(px(250), pz(-40), px(640) - px(250), pz(170) - pz(-40));
      // tyre tracks on the pad
      g.strokeStyle = 'rgba(150,130,100,0.35)';
      g.lineWidth = 2;
      for (let i = 0; i < 40; i++) {
        g.beginPath();
        const x0 = px(-200 + rnd() * 400), y0 = pz(-110 + rnd() * 240);
        g.moveTo(x0, y0);
        g.quadraticCurveTo(x0 + (rnd() - 0.5) * 120, y0 + (rnd() - 0.5) * 120, x0 + (rnd() - 0.5) * 200, y0 + (rnd() - 0.5) * 200);
        g.stroke();
      }
    });
    const rough = canvas(N / 2, N / 2, (g) => {
      g.fillStyle = '#e6e6e6';
      g.fillRect(0, 0, N / 2, N / 2);
      g.scale(0.5, 0.5);
      water(g, true);
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex(color), roughnessMap: tex(rough, false), roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, W), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    // scrub clumps scattered over the flats
    const clump = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshStandardMaterial({ color: '#6c6a46', roughness: 1 }), 900);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < 900; i++) {
      const x = (rnd() - 0.5) * 2400, z = SHORE_Z + 20 + rnd() * 1200;
      if (Math.abs(x) < 240 && z > -150 && z < 170) continue;
      if (x > 240 && x < 660 && z > -60 && z < 190) continue;
      const r = 2 + rnd() * 5;
      m.compose(new THREE.Vector3(x, r * 0.25, z), new THREE.Quaternion(), new THREE.Vector3(r, r * 0.45, r));
      clump.setMatrixAt(n++, m);
    }
    clump.count = n;
    clump.receiveShadow = true;
    s.add(clump);
  }

  private buildSea(): void {
    const s = this.scene;
    // the beach: pale sand dipping under the surf
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(GROUND * 3, 90), new THREE.MeshStandardMaterial({ color: '#e6d8bb', roughness: 0.9 }));
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, 0.05, SHORE_Z - 20);
    s.add(beach);
    // the sea: turquoise over the shallows, deep blue offshore, with a soft surf line and a slow swell
    this.seaTex = tex(
      canvas(1024, 1024, (g) => {
        const gr = g.createLinearGradient(0, 1024, 0, 0);
        gr.addColorStop(0, '#d9efe8');
        gr.addColorStop(0.015, '#8fd2cf');
        gr.addColorStop(0.08, '#4fb1bd');
        gr.addColorStop(0.3, '#2c84a8');
        gr.addColorStop(1, '#1d5f8c');
        g.fillStyle = gr;
        g.fillRect(0, 0, 1024, 1024);
        // surf lines
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        for (let k = 0; k < 4; k++) {
          g.lineWidth = 3 - k * 0.6;
          g.beginPath();
          for (let x = 0; x <= 1024; x += 16) g.lineTo(x, 1010 - k * 9 + Math.sin(x * 0.03 + k) * 2.5);
          g.stroke();
        }
      }),
    );
    const swell = tex(
      canvas(256, 256, (g) => {
        const r = prng(4);
        g.fillStyle = '#808080';
        g.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 500; i++) {
          g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.06)`;
          g.fillRect(r() * 256, r() * 256, 10 + r() * 30, 1 + r() * 2);
        }
      }),
      false,
      [60, 30],
    );
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND * 3, 6000),
      new THREE.MeshStandardMaterial({ map: this.seaTex, bumpMap: swell, bumpScale: 0.6, roughness: 0.12, metalness: 0.15, envMapIntensity: 1.2 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.2, SHORE_Z - 60 - 3000);
    s.add(sea);
    this.sea = sea;
  }

  // --------------------------------------------------------------------------------------------
  // the launch complex
  // --------------------------------------------------------------------------------------------

  private steel = new THREE.MeshStandardMaterial({ color: '#b9bfc6', roughness: 0.42, metalness: 0.75 });
  private darkSteel = new THREE.MeshStandardMaterial({ color: '#4a4f56', roughness: 0.5, metalness: 0.7 });
  private concrete = new THREE.MeshStandardMaterial({ color: '#cfcac0', roughness: 0.85 });

  private buildPad(): void {
    const s = this.scene;
    // a broad concrete apron under the mount and tower
    const apron = new THREE.Mesh(new THREE.BoxGeometry(120, 0.6, 110), this.concrete);
    apron.position.set(10, 0.3, -10);
    apron.receiveShadow = true;
    s.add(apron);
    // the launch mount: a ring table on six legs, its deck 20 m up, with the flame trench beneath
    const b = new Beams();
    const R = 7, deck = 20;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const fx = Math.cos(a) * 12, fz = Math.sin(a) * 12;
      const tx = Math.cos(a) * (R + 0.6), tz = Math.sin(a) * (R + 0.6);
      b.add(new THREE.Vector3(fx, 0.6, fz), new THREE.Vector3(tx, deck - 1, tz), 1.8, 1.8);
      // the bracing between the legs
      const a2 = ((i + 1) / 6) * Math.PI * 2;
      b.add(new THREE.Vector3(fx, 0.6, fz), new THREE.Vector3(Math.cos(a2) * (R + 2), deck * 0.55, Math.sin(a2) * (R + 2)), 0.5);
    }
    s.add(b.build(this.darkSteel));
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(R + 2.4, R + 1.6, 3.2, 40, 1, true), this.darkSteel);
    ring.position.y = deck;
    ring.castShadow = true;
    s.add(ring);
    const top = new THREE.Mesh(new THREE.RingGeometry(R - 0.4, R + 2.4, 40), this.steel);
    top.rotation.x = -Math.PI / 2;
    top.position.y = deck + 1.6;
    top.castShadow = true;
    s.add(top);
    // hold-down clamps around the ring
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const cl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 1.4), this.steel);
      cl.position.set(Math.cos(a) * R, deck + 2.2, Math.sin(a) * R);
      cl.rotation.y = -a;
      s.add(cl);
    }
    // the steel deflector plate under the mount
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 0.8, 32), this.steel);
    plate.position.y = 1;
    s.add(plate);
  }

  private buildTower(): void {
    const s = this.scene;
    // a square lattice tower, 145 m tall, 12 m on a side, beside the mount
    const cx = 26, cz = -4, half = 6, Ht = 145;
    const b = new Beams();
    const V = (x: number, y: number, z: number) => new THREE.Vector3(cx + x, y, cz + z);
    const corners: [number, number][] = [[-half, -half], [half, -half], [half, half], [-half, half]];
    for (const [x, z] of corners) b.add(V(x, 0, z), V(x, Ht, z), 1.6);
    const step = 7.5;
    for (let y = 0; y < Ht; y += step) {
      for (let k = 0; k < 4; k++) {
        const [x0, z0] = corners[k], [x1, z1] = corners[(k + 1) % 4];
        b.add(V(x0, y + step, z0), V(x1, y + step, z1), 0.7);
        // X bracing on every face
        b.add(V(x0, y, z0), V(x1, y + step, z1), 0.45);
        b.add(V(x1, y, z1), V(x0, y + step, z0), 0.45);
      }
    }
    // the crown and the two long swing arms reaching toward the mount
    b.box(cx, Ht + 2, cz, 15, 4, 15);
    for (const [y, len] of [[112, 26], [62, 20]] as [number, number][]) {
      for (const dz of [-3.5, 3.5]) {
        b.add(V(-half, y, dz), V(-half - len, y, dz * 0.6), 1.4, 2.2);
        b.add(V(-half, y + 5, dz), V(-half - len * 0.85, y, dz * 0.6), 0.6);
      }
      b.box(cx - half - len, y, cz, 2.5, 2.5, 6);
    }
    // the elevator shaft up one face
    b.box(cx + half + 1.4, Ht / 2, cz, 2.6, Ht, 2.6);
    s.add(b.build(this.steel));
    // aircraft warning light on top
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.2), toneMapped: false }));
    light.position.set(cx, Ht + 5, cz);
    s.add(light);
    // the tower's broad base block
    const base = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 18), this.concrete);
    base.position.set(cx, 3, cz);
    base.castShadow = base.receiveShadow = true;
    s.add(base);
  }

  private buildTankFarm(): void {
    const s = this.scene;
    const white = new THREE.MeshStandardMaterial({ color: '#eceae5', roughness: 0.45, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: '#3b3f45', roughness: 0.5, metalness: 0.5 });
    // a row of big vertical propellant tanks to the west of the pad
    for (let i = 0; i < 6; i++) {
      const r = 8.5, h = 46;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), white);
      t.position.set(-175 + i * 18.5, h / 2, -40 - (i % 2) * 2);
      t.castShadow = t.receiveShadow = true;
      s.add(t);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.18), white);
      cap.position.set(t.position.x, h - r * 0.95 + r * 0.95, t.position.z);
      cap.position.y = h + 0.01 - r * (1 - Math.cos(Math.PI * 0.18)) + r * (1 - Math.cos(Math.PI * 0.18));
      cap.scale.y = 0.6;
      s.add(cap);
    }
    // long horizontal tanks lying in front of them
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(4.2, 52, 8, 32), white);
      t.rotation.z = Math.PI / 2;
      t.position.set(-110 + i * 2, 4.6, 6 + i * 9.5);
      t.castShadow = t.receiveShadow = true;
      s.add(t);
      for (const dx of [-18, 0, 18]) {
        const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 7), this.concrete);
        saddle.position.set(t.position.x + dx, 1.2, t.position.z);
        s.add(saddle);
      }
    }
    // a second, darker tank cluster east of the yard
    for (let i = 0; i < 7; i++) {
      const r = 3.2, h = 22 + (i % 3) * 4;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), dark);
      t.position.set(470 + (i % 4) * 9, h / 2, 40 + Math.floor(i / 4) * 10);
      t.castShadow = true;
      s.add(t);
    }
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 30, 6, 24), white);
      t.rotation.z = Math.PI / 2;
      t.position.set(560, 3, 30 + i * 7);
      t.castShadow = true;
      s.add(t);
    }
    // pipe racks from the tank farm to the pad
    const pipes = new Beams();
    for (let x = -96; x <= 12; x += 12) pipes.box(x, 2.5, -24, 0.5, 5, 0.5);
    for (const dz of [-0.6, 0, 0.6]) pipes.add(new THREE.Vector3(-110, 5.2, -24 + dz), new THREE.Vector3(10, 5.2, -24 + dz), 0.45);
    s.add(pipes.build(this.steel));
  }

  private buildCrane(): void {
    const s = this.scene;
    // a big crawler crane on the pad, its lattice boom raised high
    const yellow = new THREE.MeshStandardMaterial({ color: '#d8a01a', roughness: 0.5, metalness: 0.3 });
    const g = new THREE.Group();
    for (const dz of [-4, 4]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(14, 2.4, 2.4), this.darkSteel);
      track.position.set(0, 1.2, dz);
      track.castShadow = true;
      g.add(track);
    }
    const house = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 6), yellow);
    house.position.set(-1, 4.8, 0);
    house.castShadow = true;
    g.add(house);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 7), this.darkSteel);
    counter.position.set(-6, 4.6, 0);
    g.add(counter);
    const boom = new Beams();
    const len = 120, ang = THREE.MathUtils.degToRad(72);
    const tip = new THREE.Vector3(3 + Math.cos(ang) * len, 6 + Math.sin(ang) * len, 0);
    for (const dz of [-1.4, 1.4]) {
      for (const dy of [-1.4, 1.4]) {
        boom.add(new THREE.Vector3(3, 6 + dy, dz), tip.clone().add(new THREE.Vector3(0, dy * 0.3, dz * 0.3)), 0.45);
      }
    }
    for (let k = 1; k < 30; k++) {
      const p0 = new THREE.Vector3(3, 6, 0).lerp(tip, (k - 1) / 30);
      const p1 = new THREE.Vector3(3, 6, 0).lerp(tip, k / 30);
      boom.add(p0.clone().add(new THREE.Vector3(0, 1.3, -1.3)), p1.clone().add(new THREE.Vector3(0, -1.3, 1.3)), 0.18);
      boom.add(p0.clone().add(new THREE.Vector3(0, -1.3, -1.3)), p1.clone().add(new THREE.Vector3(0, 1.3, 1.3)), 0.18);
    }
    // the pendant lines and the hook
    boom.add(new THREE.Vector3(-5, 9, 0), tip, 0.12);
    boom.add(tip, tip.clone().add(new THREE.Vector3(0, -38, 0)), 0.1);
    g.add(boom.build(this.steel));
    const hook = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.6), yellow);
    hook.position.copy(tip).add(new THREE.Vector3(0, -39, 0));
    g.add(hook);
    g.position.set(120, 0, 40);
    g.rotation.y = 2.5;
    s.add(g);
    // a smaller mobile crane and a couple of loaders on the pad
    const mob = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(10, 2.6, 3), yellow);
    cab.position.y = 2;
    mob.add(cab);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 22), yellow);
    arm.position.set(0, 9, -6);
    arm.rotation.x = 0.7;
    mob.add(arm);
    mob.position.set(-60, 0, 60);
    mob.rotation.y = 0.8;
    s.add(mob);
  }

  private buildRoadAndYard(): void {
    const s = this.scene;
    const rnd = prng(29);
    // the coast road along the south edge of the site
    const road = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, 16), new THREE.MeshStandardMaterial({ color: '#4c4c4e', roughness: 0.75 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.08, 205);
    road.receiveShadow = true;
    s.add(road);
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, 0.3), new THREE.MeshStandardMaterial({ color: '#e9dfa0', roughness: 0.6 }));
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.1, 205);
    s.add(dash);
    // the long black wall screening the pad from the road
    const wall = new THREE.Mesh(new THREE.BoxGeometry(520, 6, 1.2), new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.7 }));
    wall.position.set(140, 3, 185);
    wall.rotation.y = -0.04;
    wall.castShadow = wall.receiveShadow = true;
    s.add(wall);
    // fences
    const fence = new Beams();
    for (let x = -240; x <= 640; x += 6) fence.box(x, 1.2, 170, 0.12, 2.4, 0.12);
    fence.add(new THREE.Vector3(-240, 2.3, 170), new THREE.Vector3(640, 2.3, 170), 0.06);
    s.add(fence.build(this.steel, false));
    // site buildings: low offices, workshops and control buildings in the yard
    const shed = (x: number, z: number, w: number, d: number, h: number, col: string) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, metalness: 0.2 }));
      b.position.set(x, h / 2, z);
      b.castShadow = b.receiveShadow = true;
      s.add(b);
    };
    shed(330, 120, 70, 18, 7, '#3f4349');
    shed(420, 130, 30, 14, 6, '#c9ccd0');
    shed(300, 60, 24, 14, 9, '#d8d9d6');
    shed(380, 70, 40, 12, 5, '#9aa0a6');
    shed(-150, 100, 40, 14, 6, '#d7d4ce');
    shed(-40, 150, 30, 10, 4, '#2c2f34');
    // test stands: small lattice frames in the yard
    const stands = new Beams();
    for (const [x, z, h] of [[520, -10, 24], [590, 0, 20]] as [number, number, number][]) {
      for (const [dx, dz] of [[-4, -4], [4, -4], [4, 4], [-4, 4]]) stands.add(new THREE.Vector3(x + dx, 0, z + dz), new THREE.Vector3(x + dx * 0.7, h, z + dz * 0.7), 0.6);
      for (let y = 6; y < h; y += 6) stands.box(x, y, z, 7, 0.4, 7);
    }
    s.add(stands.build(this.darkSteel));
    // parked cars along the road and in the lot
    const carCols = ['#e8e8e8', '#2b2d31', '#a9b0b8', '#8c1d1d', '#e8e8e8', '#1f3a66', '#d9d9d9', '#555a60'];
    const carBody = new THREE.BoxGeometry(4.6, 1.4, 1.9);
    const carTop = new THREE.BoxGeometry(2.6, 0.9, 1.7);
    const glass = new THREE.MeshStandardMaterial({ color: '#1d242c', roughness: 0.1, metalness: 0.6 });
    const car = (x: number, z: number, ry: number) => {
      const col = new THREE.MeshStandardMaterial({ color: carCols[Math.floor(rnd() * carCols.length)], roughness: 0.3, metalness: 0.5 });
      const b = new THREE.Mesh(carBody, col);
      b.position.set(x, 0.8, z);
      b.rotation.y = ry;
      b.castShadow = true;
      s.add(b);
      const t = new THREE.Mesh(carTop, glass);
      t.position.set(x, 1.9, z);
      t.rotation.y = ry;
      s.add(t);
    };
    for (let i = 0; i < 46; i++) car(-230 + i * 6.5 + rnd() * 2, 192 + (i % 2) * 3, 0);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) if (rnd() < 0.75) car(80 + i * 3.2, 250 + r * 7, Math.PI / 2);
    for (let i = 0; i < 6; i++) car(-300 + i * 140 + rnd() * 30, 201 + (i % 2) * 7, 0);
    // a few palms by the lot
    const trunk = new THREE.MeshStandardMaterial({ color: '#7a6248', roughness: 0.9 });
    const leaves = new THREE.MeshStandardMaterial({ color: '#4c6a34', roughness: 0.9 });
    for (const [x, z] of [[60, 240], [122, 236], [70, 284]] as [number, number][]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 9, 8), trunk);
      t.position.set(x, 4.5, z);
      s.add(t);
      const l = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 6), leaves);
      l.scale.y = 0.35;
      l.position.set(x, 9.2, z);
      l.castShadow = true;
      s.add(l);
    }
  }

  // --------------------------------------------------------------------------------------------
  // camera
  // --------------------------------------------------------------------------------------------

  private onBackground(e: Event): boolean {
    if (!this.active) return false;
    const t = e.target as HTMLElement | null;
    if (!t || !t.closest) return true;
    return !t.closest('button, input, select, label, a, .mm-block, .modal-back, .modal, .mm-prog');
  }

  private bindControls(): void {
    window.addEventListener('pointerdown', (e) => {
      if (!this.onBackground(e)) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.userView = true;
      this.vYaw = this.vPitch = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.yaw += dx * 0.005;
      this.pitch = clampN(this.pitch + dy * 0.004, 0.02, 1.25);
      this.vYaw = dx * 0.15;
      this.vPitch = dy * 0.12;
    });
    const up = (e: PointerEvent) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
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
      this.userView = false;
      this.yaw = -0.35;
      this.pitch = 0.2;
      this.zoom = 1;
    });
  }

  render(dt: number, w: number, h: number): void {
    this.t += dt;
    if (!this.drag) {
      this.yaw += this.userView ? this.vYaw * dt : dt * 0.012;
      this.pitch = clampN(this.pitch + this.vPitch * dt, 0.02, 1.25);
      const k = Math.exp(-dt * 3);
      this.vYaw *= k;
      this.vPitch *= k;
    }
    const a = 1 - Math.exp(-dt * 5);
    this.yawS += (this.yaw - this.yawS) * a;
    this.pitchS += (this.pitch - this.pitchS) * a;
    this.zoomS += (this.zoom - this.zoomS) * a;
    const d = 470 * this.zoomS;
    // look between the tank farm and the empty mount, a third of the way up the tower
    const tx = -24, ty = 62, tz = -14;
    const cp = Math.cos(this.pitchS);
    this.camera.position.set(tx + Math.sin(this.yawS) * cp * d, Math.max(4, ty + Math.sin(this.pitchS) * d), tz + Math.cos(this.yawS) * cp * d);
    this.camera.lookAt(tx, ty, tz);
    this.camera.aspect = w / Math.max(1, h);
    // the menu's left panels cover the left of the screen: centre the picture in the open space
    this.camera.setViewOffset(w, h, w > 900 ? -w * 0.06 : 0, 0, w, h);
    this.camera.updateProjectionMatrix();
    // the sea's slow swell
    this.seaTex.offset.x = Math.sin(this.t * 0.05) * 0.002;
    if (this.drawWith) this.drawWith(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }
}
