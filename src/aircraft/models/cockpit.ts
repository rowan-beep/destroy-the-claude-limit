// Cockpit interior shown in the first-person view: instrument panel with
// three live multi-function displays, glare shield, HUD combiner glass,
// canopy frame, side consoles, stick and throttle.

import * as THREE from 'three';
import type { AirframeVisual } from './visual';

export interface CockpitDisplays {
  canvases: HTMLCanvasElement[];
  textures: THREE.CanvasTexture[];
  group: THREE.Group;
  stick: THREE.Object3D;
  throttle: THREE.Object3D;
}

export function buildCockpit(v: AirframeVisual): CockpitDisplays {
  const g = new THREE.Group();
  g.name = 'cockpit';
  const eye = v.cockpitEye;
  g.position.copy(eye);
  v.body.add(g);
  const dark = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.85, metalness: 0.2 });
  const darker = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.9, metalness: 0.1 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x2b3035, roughness: 0.6, metalness: 0.4 });

  // instrument panel: a flat face tilted back toward the pilot, top edge ~25 deg below the eye line
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.36, 0.04), dark);
  panel.position.set(0, -0.49, -0.7);
  panel.rotation.x = 0.35;
  g.add(panel);
  // glare shield (hood over the displays)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.3), darker);
  hood.position.set(0, -0.3, -0.64);
  g.add(hood);
  const hoodLip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.03), darker);
  hoodLip.position.set(0, -0.31, -0.49);
  g.add(hoodLip);

  // HUD combiner: glass plate on a frame above the glare shield
  const hudFrameL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.26, 0.008), frame);
  hudFrameL.position.set(-0.125, -0.16, -0.64);
  const hudFrameR = hudFrameL.clone();
  hudFrameR.position.x = 0.125;
  const hudTop = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.006, 0.006), frame);
  hudTop.position.set(0, -0.03, -0.64);
  g.add(hudFrameL, hudFrameR, hudTop);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.18),
    new THREE.MeshBasicMaterial({ color: 0x9fffd0, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }),
  );
  glass.position.set(0, -0.12, -0.64);
  glass.rotation.x = -0.2;
  g.add(glass);

  // three MFDs with live canvas textures
  const canvases: HTMLCanvasElement[] = [];
  const textures: THREE.CanvasTexture[] = [];
  const positions: [number, number, number][] = [
    [-0.29, -0.47, -0.665],
    [0, -0.5, -0.655],
    [0.29, -0.47, -0.665],
  ];
  for (let i = 0; i < 3; i++) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    canvases.push(c);
    textures.push(tex);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.02), darker);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.z = 0.011;
    const holder = new THREE.Group();
    holder.add(bezel, screen);
    // OSB buttons around the bezel
    for (let k = 0; k < 5; k++) {
      for (const [x, y, w, h] of [
        [-0.09, -0.06 + k * 0.03, 0.012, 0.018],
        [0.09, -0.06 + k * 0.03, 0.012, 0.018],
        [-0.06 + k * 0.03, 0.09, 0.018, 0.012],
      ]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), frame);
        b.position.set(x, y, 0.012);
        holder.add(b);
      }
    }
    holder.position.set(...positions[i]);
    holder.rotation.x = 0.35;
    holder.rotation.y = -positions[i][0] * 0.6;
    g.add(holder);
  }

  // up-front control panel under the HUD
  const ufc = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.04), darker);
  ufc.position.set(0, -0.36, -0.55);
  ufc.rotation.x = 0.35;
  g.add(ufc);

  // side consoles
  for (const sx of [-1, 1]) {
    const con = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.7), dark);
    con.position.set(sx * 0.36, -0.62, -0.05);
    g.add(con);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 1.4), frame);
    rail.position.set(sx * 0.48, -0.28, -0.1);
    g.add(rail);
  }
  // canopy frame: windscreen arch overhead + posts down to the rails
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.012, 6, 32, Math.PI), frame);
  arch.position.set(0, -0.32, -0.7);
  arch.rotation.x = 0.45;
  g.add(arch);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.022, 6, 28, Math.PI), frame);
  bow.position.set(0, -0.3, 0.25);
  g.add(bow);

  // stick & throttle (visible when looking down)
  const stick = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.32, 8), frame);
  shaft.position.y = 0.16;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.05), darker);
  grip.position.y = 0.36;
  stick.add(shaft, grip);
  stick.position.set(0, -0.95, -0.35);
  g.add(stick);
  const throttle = new THREE.Group();
  const th = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), darker);
  th.position.y = 0.06;
  throttle.add(th);
  throttle.position.set(-0.33, -0.66, -0.15);
  g.add(throttle);

  g.visible = false;
  return { canvases, textures, group: g, stick, throttle };
}
