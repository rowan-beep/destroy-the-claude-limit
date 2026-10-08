// SV-1 PETREL, the survey submersible: a one-pilot boat about 6.4 m long. A
// yellow pressure hull under a white foam fairing, an acrylic bow dome with
// the pilot inside, two stern thrusters and two vertical ones on outriggers,
// a bar of LED lamps over the dome, floodlights round the hull, skids, a
// scanning sonar head on top, and a five-function manipulator arm folded
// beside a sample basket.
//
// The model is built in its own frame: forward is -z, up is +y, right is +x.

import * as THREE from 'three';
import { patchOceanMaterial } from './oceanMaterial';

/** each main lamp's strength (candela in the scene's light units, where full sun is about 3) */
const LAMP_CD = 20;
/** the floodlights together, as one light shining all round from the middle of the boat */
const FLOOD_CD = 14;

const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function tint(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]): THREE.BufferGeometry {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = fn(p.getX(i), p.getY(i), p.getZ(i));
    col[i * 3] = srgb(r);
    col[i * 3 + 1] = srgb(gg);
    col[i * 3 + 2] = srgb(b);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const solid = (r: number, g: number, b: number) => () => [r, g, b] as [number, number, number];

function cylZ(r0: number, r1: number, len: number, seg: number, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg, 1, open);
  g.rotateX(Math.PI / 2);
  return g;
}

function nameTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = '#1b2430';
  g.font = 'bold 74px Arial, Helvetica, sans-serif';
  g.textAlign = 'center';
  g.fillText('PETREL', 256, 82);
  g.font = 'bold 24px Arial, Helvetica, sans-serif';
  g.fillText('SV-1   KESTREL HARBOR SURVEY', 256, 118);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** one lamp: its housing, its lit lens and (for the two main lamps) a real light */
interface Lamp {
  lens: THREE.Mesh;
  light: THREE.SpotLight | null;
}

export class SubModel {
  readonly root = new THREE.Group();
  /** the boat's frame inside the root (pitch and roll) */
  private body = new THREE.Group();
  /** the pilot (hidden when the camera is in the dome) */
  private pilot = new THREE.Group();
  /** where the pilot's eyes are, in the boat's frame */
  readonly eye = new THREE.Vector3(0, 0.36, -1.86);
  private hullMat: THREE.MeshStandardMaterial;
  private metalMat: THREE.MeshStandardMaterial;
  private darkMat: THREE.MeshStandardMaterial;
  private domeMat: THREE.MeshStandardMaterial;
  private lensOn: THREE.MeshBasicMaterial;
  private lensOff: THREE.MeshBasicMaterial;
  private nameMat: THREE.MeshStandardMaterial;
  private lamps: Lamp[] = [];
  /** the two working lights (the rest are the lenses only) */
  readonly lights: THREE.SpotLight[] = [];
  /** the floodlights' lenses, and the one light that stands for all of them */
  private floodLenses: THREE.Mesh[] = [];
  readonly floodLight: THREE.PointLight;
  /** the scanning sonar's head (it turns with the sweep) */
  private sonarHead: THREE.Group;
  private props: THREE.Object3D[] = [];
  private vprops: THREE.Object3D[] = [];
  private propSpin = 0;
  private vSpin = 0;
  private strobe: THREE.Mesh;
  // the arm
  private shoulder = new THREE.Group();
  private upper = new THREE.Group();
  private elbow = new THREE.Group();
  private wrist = new THREE.Group();
  private jawL = new THREE.Group();
  private jawR = new THREE.Group();
  /** where the arm hangs from, in the boat's frame */
  readonly shoulderAt = new THREE.Vector3(0.78, -0.82, -2.05);
  readonly basketAt = new THREE.Vector3(-0.15, -1.05, -2.55);
  readonly basket = new THREE.Group();
  /** what the jaw is holding (re-parented here while carried) */
  readonly grip = new THREE.Group();
  private readonly L1 = 0.95;
  private readonly L2 = 0.85;
  private readonly L3 = 0.38;
  /** the arm's present pose: 0 stowed .. 1 at the target */
  private armK = 0;
  private armTarget = new THREE.Vector3(0, -1.6, -3.6);
  private jaw = 0.6;

  constructor(lampShadows = false) {
    this.root.name = 'sub';
    this.root.add(this.body);
    const std = (o: THREE.MeshStandardMaterialParameters, key: string) => patchOceanMaterial(new THREE.MeshStandardMaterial(o), key);
    this.hullMat = std({ vertexColors: true, roughness: 0.42, metalness: 0 }, 'sub-hull');
    this.metalMat = std({ color: 0x9aa3ab, roughness: 0.35, metalness: 0.7 }, 'sub-metal');
    this.darkMat = std({ color: 0x23272b, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }, 'sub-dark');
    this.domeMat = std({ color: 0xdfeef5, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false }, 'sub-dome');
    this.nameMat = std({ map: nameTexture(), transparent: true, roughness: 0.5 }, 'sub-name');
    this.lensOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 2.1), toneMapped: false });
    this.lensOff = new THREE.MeshBasicMaterial({ color: 0x40464c });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = this.body) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // --- hull: a lathe from just behind the dome to the tail cone
    const prof: THREE.Vector2[] = [];
    const pts: [number, number][] = [[-2.3, 1.02], [-2.2, 1.12], [-2.0, 1.2], [-1.6, 1.24], [1.0, 1.24], [1.6, 1.18], [2.2, 0.98], [2.75, 0.66], [3.1, 0.34], [3.22, 0.12], [3.24, 0]];
    for (const [y, r] of pts) prof.push(new THREE.Vector2(r, y));
    const hull = new THREE.LatheGeometry(prof, 40);
    hull.rotateX(Math.PI / 2);
    hull.scale(1, 0.93, 1);
    tint(hull, (x, y) => {
      // white foam fairing on top, signal yellow hull, a black boot stripe and grey belly
      if (y > 0.32) return [0.9, 0.91, 0.9];
      if (y > 0.24) return [0.08, 0.09, 0.1];
      if (y > -0.85) return [0.96, 0.7, 0.08];
      return [0.36, 0.38, 0.4];
    });
    add(hull, this.hullMat);
    // the flat deck on top of the fairing, with a grey walkway
    const deck = new THREE.BoxGeometry(1.1, 0.14, 3.4);
    deck.translate(0, 1.14, -0.1);
    tint(deck, solid(0.55, 0.57, 0.58));
    add(deck, this.hullMat);
    // the hatch, the lifting eye, the sonar head, the antenna and the strobe
    add(new THREE.CylinderGeometry(0.34, 0.36, 0.12, 24).translate(0, 1.26, 0.35), this.metalMat);
    add(new THREE.TorusGeometry(0.16, 0.035, 8, 16).translate(0, 1.42, -0.4), this.metalMat);
    // the scanning sonar: a pedestal and a head that turns (its transducer face looks out to one side)
    add(new THREE.CylinderGeometry(0.07, 0.09, 0.16, 12).translate(0, 1.27, -1.45), this.metalMat);
    const sonar = new THREE.Group();
    sonar.position.set(0, 1.42, -1.45);
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 18), this.darkMat, sonar);
    add(new THREE.BoxGeometry(0.06, 0.14, 0.16).translate(0, 0, -0.13), this.metalMat, sonar);
    this.body.add(sonar);
    this.sonarHead = sonar;
    add(new THREE.CylinderGeometry(0.018, 0.025, 1.3, 6).translate(0.35, 1.85, 1.35), this.darkMat);
    add(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 10).translate(-0.35, 1.3, 1.35), this.metalMat);
    this.strobe = add(new THREE.SphereGeometry(0.055, 10, 8).translate(-0.35, 1.4, 1.35), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 7), toneMapped: false }));
    this.strobe.castShadow = false;
    this.strobe.visible = false;
    // the name on both sides of the fairing
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(1.9, 0.48);
      g.rotateY((s * Math.PI) / 2);
      g.translate(s * 1.205, 0.62, 0.25);
      const m = add(g, this.nameMat);
      m.castShadow = false;
    }

    // --- the bow dome, its flange, and the pilot inside
    const dome = new THREE.SphereGeometry(0.98, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.rotateX(-Math.PI / 2);
    dome.translate(0, 0.02, -2.28);
    const dm = add(dome, this.domeMat);
    dm.castShadow = false;
    dm.renderOrder = 5;
    add(new THREE.TorusGeometry(1.0, 0.07, 10, 40).translate(0, 0.02, -2.28), this.metalMat);
    // inside: the seat, the console, the pilot
    add(new THREE.BoxGeometry(0.7, 0.12, 0.7).translate(0, -0.55, -1.75), this.darkMat);
    add(new THREE.BoxGeometry(0.7, 0.75, 0.12).translate(0, -0.15, -1.38).rotateX(-0.25), this.darkMat);
    add(new THREE.BoxGeometry(1.1, 0.32, 0.25).translate(0, -0.48, -2.6), this.darkMat);
    const screens = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.9, 1.1), toneMapped: false }));
    screens.position.set(0, -0.3, -2.47);
    screens.rotation.x = -0.6;
    this.body.add(screens);
    const suit = std({ color: 0x2b4f7a, roughness: 0.8 }, 'sub-suit');
    this.body.add(this.pilot);
    add(new THREE.CapsuleGeometry(0.2, 0.42, 6, 12).translate(0, -0.12, -1.72), suit, this.pilot);
    add(new THREE.SphereGeometry(0.13, 16, 12).translate(0, 0.34, -1.8), std({ color: 0xc89a7a, roughness: 0.7 }, 'sub-skin'), this.pilot);
    add(new THREE.TorusGeometry(0.135, 0.022, 6, 16, Math.PI).translate(0, 0.36, -1.8), this.darkMat, this.pilot);

    // --- tail fins and the two stern thrusters
    for (const [w, h, x, y] of [[0.06, 0.7, 0, 0.62], [0.06, 0.6, 0, -0.58], [0.7, 0.06, 0.58, 0], [0.7, 0.06, -0.58, 0]] as const) {
      const g = new THREE.BoxGeometry(w, h, 0.9);
      g.translate(x, y, 2.75);
      tint(g, solid(0.9, 0.91, 0.9));
      add(g, this.hullMat);
    }
    for (const s of [-1, 1]) {
      const pod = new THREE.Group();
      pod.position.set(s * 1.2, -0.05, 2.35);
      this.body.add(pod);
      // outrigger
      add(new THREE.BoxGeometry(0.5, 0.1, 0.32).translate(-s * 0.22, 0, 0), this.metalMat, pod);
      // duct (Kort nozzle) and motor can
      add(cylZ(0.33, 0.3, 0.46, 24, true), this.darkMat, pod);
      add(new THREE.TorusGeometry(0.33, 0.03, 8, 24).translate(0, 0, -0.23), this.darkMat, pod);
      add(cylZ(0.1, 0.12, 0.55, 14).translate(0, 0, -0.05), this.metalMat, pod);
      const prop = new THREE.Group();
      prop.position.z = 0.12;
      for (let k = 0; k < 4; k++) {
        const b = new THREE.BoxGeometry(0.06, 0.26, 0.02);
        b.translate(0, 0.15, 0);
        b.rotateY(0.5);
        b.rotateZ((k * Math.PI) / 2);
        add(b, this.metalMat, prop);
      }
      pod.add(prop);
      this.props.push(prop);
    }
    // the vertical thrusters, on outriggers amidships
    for (const s of [-1, 1]) {
      const pod = new THREE.Group();
      pod.position.set(s * 1.42, 0.25, 0.2);
      this.body.add(pod);
      add(new THREE.BoxGeometry(0.4, 0.08, 0.26).translate(-s * 0.2, -0.1, 0), this.metalMat, pod);
      add(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 20, 1, true), this.darkMat, pod);
      const prop = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const b = new THREE.BoxGeometry(0.2, 0.015, 0.05);
        b.translate(0.11, 0, 0);
        b.rotateX(0.45);
        b.rotateY((k * Math.PI * 2) / 3);
        add(b, this.metalMat, prop);
      }
      pod.add(prop);
      this.vprops.push(prop);
    }
    // the bow tunnel thruster (a dark opening each side)
    for (const s of [-1, 1]) {
      const m = add(new THREE.CircleGeometry(0.16, 16).rotateY((s * Math.PI) / 2).translate(s * 1.14, -0.5, -1.55), this.darkMat);
      m.castShadow = false;
    }

    // --- skids
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.12, 0.1, 4.9);
      g.translate(s * 0.72, -1.38, 0);
      add(g, this.metalMat);
      const tip = new THREE.BoxGeometry(0.12, 0.1, 0.5);
      tip.rotateX(-0.6);
      tip.translate(s * 0.72, -1.25, -2.6);
      add(tip, this.metalMat);
      for (const z of [-1.6, 0.2, 1.9]) add(new THREE.BoxGeometry(0.08, 0.32, 0.08).translate(s * 0.68, -1.2, z), this.metalMat);
    }

    // --- the lamp bar over the dome and the two low lamps
    add(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8).rotateZ(Math.PI / 2).translate(0, 1.02, -2.05), this.metalMat);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.16, 0.5).translate(s * 1.1, 0.96, -1.85), this.metalMat);
    const lampAt: [number, number, number, boolean][] = [[-0.95, 1.02, -2.1, true], [0.95, 1.02, -2.1, true], [-0.4, 1.02, -2.1, false], [0.4, 1.02, -2.1, false], [-0.72, -1.0, -2.55, false], [0.72, -1.0, -2.55, false]];
    for (const [x, y, z, main] of lampAt) {
      const h = new THREE.Group();
      h.position.set(x, y, z);
      h.rotation.x = -0.18;
      add(cylZ(0.085, 0.1, 0.2, 14), this.darkMat, h);
      // (a circle faces +z: turned to face forward)
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14), this.lensOn);
      lens.rotation.y = Math.PI;
      lens.position.z = -0.101;
      h.add(lens);
      this.body.add(h);
      let light: THREE.SpotLight | null = null;
      if (main) {
        // a 10,000-lumen class LED lamp, about 70° of beam
        light = new THREE.SpotLight(0xfff4e6, LAMP_CD, 70, 0.72, 0.6, 2);
        light.position.set(0, 0, -0.12);
        const tgt = new THREE.Object3D();
        // (angled down about 20°, toeing out a little: what a pilot sets for working near the bottom)
        tgt.position.set(x * 2.2, y - 4.4, -12);
        h.add(light);
        this.body.add(tgt);
        light.target = tgt;
        light.castShadow = lampShadows && x > 0;
        if (light.castShadow) {
          light.shadow.mapSize.set(1024, 1024);
          light.shadow.camera.near = 0.3;
          light.shadow.camera.far = 60;
          light.shadow.bias = -0.0005;
        }
        this.lights.push(light);
      }
      this.lamps.push({ lens, light });
    }

    // --- floodlights: wide LED floods along the sides, under the belly and at the stern
    const floods: [number, number, number, number, number, number][] = [
      [-1.22, -0.5, -0.9, -1, -0.55, -0.1], [1.22, -0.5, -0.9, 1, -0.55, -0.1],
      [-1.12, -0.6, 1.3, -1, -0.6, 0.35], [1.12, -0.6, 1.3, 1, -0.6, 0.35],
      [-0.4, -1.13, -0.3, -0.2, -1, 0], [0.4, -1.13, 0.6, 0.2, -1, 0],
      [0, -0.45, 3.1, 0, -0.35, 1],
    ];
    for (const [x, y, z, dx, dy, dz] of floods) {
      const h = new THREE.Group();
      h.position.set(x, y, z);
      // (the body is still at the origin: its own frame is the world's)
      h.lookAt(x + dx, y + dy, z + dz);
      add(cylZ(0.08, 0.095, 0.12, 14), this.darkMat, h);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 14), this.lensOff);
      lens.position.z = 0.061;
      h.add(lens);
      this.body.add(h);
      this.floodLenses.push(lens);
    }
    // (in the scene from the start at no strength: adding a light later would recompile every material)
    this.floodLight = new THREE.PointLight(0xfff2e0, 0, 60, 2);
    this.floodLight.position.set(0, -0.7, 0.3);
    this.body.add(this.floodLight);

    // --- the sample basket and the manipulator
    const bk = this.basket;
    bk.position.copy(this.basketAt);
    for (const [w, h, d, x, y, z] of [[1.1, 0.04, 0.6, 0, -0.16, 0], [1.1, 0.3, 0.04, 0, 0, -0.3], [1.1, 0.3, 0.04, 0, 0, 0.3], [0.04, 0.3, 0.6, -0.55, 0, 0], [0.04, 0.3, 0.6, 0.55, 0, 0]] as const) add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), this.metalMat, bk);
    this.body.add(bk);
    this.shoulder.position.copy(this.shoulderAt);
    this.body.add(this.shoulder);
    add(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 14), this.darkMat, this.shoulder);
    this.shoulder.add(this.upper);
    add(new THREE.BoxGeometry(0.11, 0.11, this.L1).translate(0, 0, -this.L1 / 2), this.metalMat, this.upper);
    add(new THREE.CylinderGeometry(0.03, 0.03, this.L1 * 0.8, 6).rotateX(Math.PI / 2).translate(0.08, 0.02, -this.L1 / 2), this.darkMat, this.upper);
    this.elbow.position.z = -this.L1;
    this.upper.add(this.elbow);
    add(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12).rotateZ(Math.PI / 2), this.darkMat, this.elbow);
    add(new THREE.BoxGeometry(0.09, 0.09, this.L2).translate(0, 0, -this.L2 / 2), this.metalMat, this.elbow);
    this.wrist.position.z = -this.L2;
    this.elbow.add(this.wrist);
    add(cylZ(0.06, 0.07, 0.16, 12).translate(0, 0, -0.08), this.darkMat, this.wrist);
    for (const [j, s] of [[this.jawL, -1], [this.jawR, 1]] as const) {
      j.position.set(s * 0.04, 0, -0.16);
      add(new THREE.BoxGeometry(0.025, 0.06, 0.22).translate(0, 0, -0.11), this.metalMat, j);
      this.wrist.add(j);
    }
    this.grip.position.set(0, 0, -this.L3);
    this.wrist.add(this.grip);
    this.poseArm(0);
  }

  /** where the boat is and how it sits */
  place(x: number, y: number, z: number, headingDeg: number, pitchDeg: number, rollDeg: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, (-headingDeg * Math.PI) / 180, 0);
    this.body.rotation.set((pitchDeg * Math.PI) / 180, 0, (-rollDeg * Math.PI) / 180, 'XYZ');
  }

  private lampOn = true;
  private lampLevel = 1;

  /** (the lights stay in the scene when off, at zero: adding or removing a light would recompile every material) */
  setLights(on: boolean): void {
    this.lampOn = on;
    for (const l of this.lamps) l.lens.material = on ? this.lensOn : this.lensOff;
    this.setLampLevel(this.lampLevel);
  }

  /** the lamps' strength (1 = full) */
  setLampLevel(k: number): void {
    this.lampLevel = k;
    for (const l of this.lights) l.intensity = this.lampOn ? LAMP_CD * k : 0;
    this.floodLight.intensity = this.floodOn ? FLOOD_CD * k : 0;
  }

  private floodOn = false;

  /** the floodlights on or off */
  setFloods(on: boolean): void {
    this.floodOn = on;
    for (const l of this.floodLenses) l.material = on ? this.lensOn : this.lensOff;
    this.setLampLevel(this.lampLevel);
  }

  /** where the floodlights shine from, in the world */
  floodWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.floodLight.getWorldPosition(out);
  }

  /** turn the sonar head to a bearing relative to the bow (radians, clockwise) */
  setSonarHead(rel: number): void {
    this.sonarHead.rotation.y = -rel;
  }

  /** the thrusters turn with their demand; the strobe blinks at the surface */
  animate(dt: number, out: { thrust: number; vertical: number }, t: number, surfaced: boolean): void {
    this.propSpin += out.thrust * dt * 40;
    this.vSpin += out.vertical * dt * 40;
    for (const p of this.props) p.rotation.z = this.propSpin;
    for (const p of this.vprops) p.rotation.y = this.vSpin;
    this.strobe.visible = surfaced && t % 2 < 0.08;
  }

  /** the arm's target in the boat's frame (in front of and below the bow) */
  setArmTarget(p: THREE.Vector3): void {
    this.armTarget.copy(p);
  }

  /** move the arm: k 0 = stowed, 1 = at the target; jaw 0 = closed, 1 = open */
  poseArm(k: number, jaw = this.jaw): void {
    this.armK = k;
    this.jaw = jaw;
    // stowed: the upper arm along the hull pointing forward and down, the forearm folded back
    const stowYaw = 0, stowPitch = -0.35, stowElbow = 2.5, stowWrist = -0.6;
    // reaching: solve a two-link chain to the target from the shoulder
    const rel = this.armTarget.clone().sub(this.shoulderAt);
    const yaw = Math.atan2(-rel.x, -rel.z);
    const horiz = Math.hypot(rel.x, rel.z);
    const reach = Math.max(0.2, Math.min(this.L1 + this.L2 + this.L3 - 0.05, Math.hypot(horiz, rel.y)));
    // treat the wrist and jaw as part of the forearm
    const a = this.L1, b = this.L2 + this.L3;
    const cosE = (a * a + b * b - reach * reach) / (2 * a * b);
    const elbow = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosE)));
    const cosS = (a * a + reach * reach - b * b) / (2 * a * reach);
    const base = Math.atan2(rel.y, horiz);
    const pitch = base + Math.acos(Math.max(-1, Math.min(1, cosS)));
    const e = k * k * (3 - 2 * k);
    this.shoulder.rotation.set(0, stowYaw + (yaw - stowYaw) * e, 0);
    this.upper.rotation.set(stowPitch + (pitch - stowPitch) * e, 0, 0);
    this.elbow.rotation.set(-(stowElbow + (elbow - stowElbow) * e), 0, 0);
    this.wrist.rotation.set(stowWrist * (1 - e), 0, 0);
    this.jawL.rotation.y = -0.45 * jaw;
    this.jawR.rotation.y = 0.45 * jaw;
  }

  /** a world point in the boat's own frame (for the arm) */
  toBody(p: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.body.worldToLocal(p);
  }

  /** a point of the boat's frame in the world */
  toWorld(p: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.body.localToWorld(p);
  }

  /** the camera is in the dome: hide the pilot */
  setInterior(v: boolean): void {
    this.pilot.visible = !v;
  }

  get armPose(): number {
    return this.armK;
  }

  /** the lamps' positions and aim, in world space (for the beam glow and the snow) */
  lampWorld(i: number, pos: THREE.Vector3, dir: THREE.Vector3): void {
    const l = this.lights[i];
    l.getWorldPosition(pos);
    l.target.getWorldPosition(dir);
    dir.sub(pos).normalize();
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const m of [this.hullMat, this.metalMat, this.darkMat, this.domeMat, this.lensOn, this.lensOff, this.nameMat]) m.dispose();
    this.nameMat.map?.dispose();
    for (const l of this.lights) l.shadow.map?.dispose();
  }
}
