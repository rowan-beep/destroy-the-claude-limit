// F/A-18E/F Super Hornet: 18.38 m long, 13.62 m span, 4.88 m tall.
// Two-seat F model: long LEX strakes, caret intakes beneath them,
// trapezoidal wing with wingtip Sidewinder rails, 20-degree canted twin tails.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { loft, surface, paintByNormal, paintSolid, cyl, airframeMaterials, mirrorX, Section, surfacePoint, paintBandY, SurfaceDef } from './builder';
import { buildGear, flipIdx } from './f15ex';

export function buildFA18(v: AirframeVisual): void {
  const mats = airframeMaterials();
  const spec = v.ac.spec;
  const top = new THREE.Color(spec.paint.top);
  const bot = new THREE.Color(spec.paint.bottom);
  const paint = (g: THREE.BufferGeometry) => paintByNormal(g, top, bot);

  const fus: Section[] = [
    { z: -9.3, w: 0.02, top: 0.02, bot: 0.02, y: -0.02, n: 2 },
    { z: -8.7, w: 0.24, top: 0.24, bot: 0.24, y: -0.02, n: 2 },
    { z: -7.8, w: 0.42, top: 0.42, bot: 0.42, y: 0.0, n: 2.1 },
    { z: -6.8, w: 0.54, top: 0.5, bot: 0.55, y: 0.02, n: 2.3 },
    { z: -5.6, w: 0.62, top: 0.55, bot: 0.62, y: 0.02, n: 2.6, nBot: 3 },
    { z: -4.2, w: 0.72, top: 0.55, bot: 0.66, n: 2.8, nBot: 3.3 },
    { z: -2.2, w: 0.92, top: 0.55, bot: 0.72, n: 3.2, nBot: 3.8 },
    { z: 0.5, w: 1.12, top: 0.52, bot: 0.72, n: 3.5, nBot: 4 },
    { z: 3.5, w: 1.18, top: 0.46, bot: 0.62, n: 3.5 },
    { z: 6.2, w: 1.12, top: 0.4, bot: 0.52, n: 3.2 },
    { z: 8.1, w: 1.02, top: 0.36, bot: 0.46, n: 2.8 },
  ];
  v.addMesh(paint(loft(fus, 32, 5)), mats.paint);

  // intakes under the LEX (D / caret shaped)
  const intake: Section[] = [
    { z: -3.9, w: 0.34, top: 0.28, bot: 0.46, y: -0.44, n: 5, nBot: 3 },
    { z: -2.6, w: 0.38, top: 0.32, bot: 0.5, y: -0.42, n: 4.5, nBot: 3 },
    { z: 0.0, w: 0.4, top: 0.34, bot: 0.5, y: -0.38, n: 4 },
    { z: 3.0, w: 0.32, top: 0.28, bot: 0.4, y: -0.3, n: 3.5 },
    { z: 4.6, w: 0.12, top: 0.12, bot: 0.12, y: -0.26, n: 3 },
  ];
  const inR = loft(intake, 22, 4);
  inR.translate(1.0, 0, 0);
  v.addMesh(paint(inR), mats.paint);
  v.addMesh(mirrorX(paint(inR.clone())), mats.paint);
  for (const sx of [-1, 1]) {
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.66), mats.dark);
    mouth.position.set(1.0 * sx, -0.52, -3.91);
    mouth.rotation.y = Math.PI;
    v.body.add(mouth);
  }

  // LEX: long thin strakes from the cockpit to the wing root
  const lexR = paint(
    surface({ root: [0.55, 0.12, -6.4], rootChord: 7.8, tipChord: 2.4, span: 1.05, sweep: 72, thickness: 0.035, cn: 10, sn: 3 }),
  );
  v.addMesh(lexR, mats.paint);
  v.addMesh(mirrorX(paint(lexR.clone())), mats.paint);

  // canopy (F model two-seat)
  const can: Section[] = [
    { z: -6.9, w: 0.03, top: 0.02, bot: 0.02, y: 0.5, n: 2 },
    { z: -6.4, w: 0.36, top: 0.3, bot: 0.03, y: 0.52, n: 2.2 },
    { z: -5.4, w: 0.46, top: 0.5, bot: 0.03, y: 0.54, n: 2.2 },
    { z: -3.9, w: 0.46, top: 0.52, bot: 0.03, y: 0.55, n: 2.2 },
    { z: -2.9, w: 0.36, top: 0.3, bot: 0.03, y: 0.55, n: 2.2 },
    { z: -2.3, w: 0.18, top: 0.08, bot: 0.03, y: 0.55, n: 2 },
  ];
  const canopy = v.addMesh(loft(can, 24, 4), mats.glass, v.body, false);
  canopy.renderOrder = 5;
  v.canopy = canopy;
  for (const z of [-6.25, -4.6]) {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.03, 6, 20, Math.PI), mats.dark);
    bow.position.set(0, 0.55, z);
    v.body.add(bow);
    v.hideInCockpit.push(bow);
  }
  for (const z of [-5.4, -3.95]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.22), mats.dark);
    seat.position.set(0, 0.76, z + 0.38);
    v.body.add(seat);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshStandardMaterial({ color: 0x55594e, roughness: 0.6 }));
    helm.position.set(0, 0.98, z + 0.1);
    v.body.add(helm);
    v.hideInCockpit.push(seat, helm);
  }
  v.cockpitEye.set(0, 1.02, -5.4);

  // spine
  const spine: Section[] = [
    { z: -3.0, w: 0.28, top: 0.05, bot: 0.05, y: 0.52, n: 2 },
    { z: -2.2, w: 0.36, top: 0.18, bot: 0.1, y: 0.52, n: 2.4 },
    { z: 2.5, w: 0.42, top: 0.14, bot: 0.1, y: 0.48, n: 2.6 },
    { z: 6.0, w: 0.3, top: 0.06, bot: 0.1, y: 0.4, n: 2.4 },
  ];
  v.addMesh(paint(loft(spine, 16, 3)), mats.paint);

  // wings: trapezoidal, mid-mounted
  const wingR = surface({ root: [1.05, 0.02, -1.2], rootChord: 4.4, tipChord: 1.55, span: 5.76, sweep: 27, thickness: 0.05, cn: 12, sn: 5 });
  v.addMesh(paint(wingR), mats.paint);
  v.addMesh(mirrorX(paint(wingR.clone())), mats.paint);
  for (const side of [1, -1] as const) {
    // leading edge flaps
    const lef = paint(surface({ root: [1.3, 0.02, -1.35], rootChord: 0.6, tipChord: 0.35, span: 5.4, sweep: 27, thickness: 0.03, cn: 4, sn: 3 }));
    const lefG = side < 0 ? flipIdx(lef.scale(-1, 1, 1)) : lef;
    v.addSurface(lefG, mats.paint, new THREE.Vector3(1.3 * side, 0.02, -0.75), new THREE.Vector3(1, 0, -0.5 * side), 'lef', side, 12);
    const ail = paint(surface({ root: [4.2, 0.0, 2.55], rootChord: 0.7, tipChord: 0.55, span: 2.3, sweep: 10, thickness: 0.03, cn: 5, sn: 2 }));
    const ailG = side < 0 ? flipIdx(ail.scale(-1, 1, 1)) : ail;
    v.addSurface(ailG, mats.paint, new THREE.Vector3(4.2 * side, 0, 2.55), new THREE.Vector3(1, 0, 0.18 * side), 'aileron', side, 22);
    const flap = paint(surface({ root: [1.4, 0.0, 2.45], rootChord: 0.95, tipChord: 0.8, span: 2.75, sweep: 3, thickness: 0.035, cn: 5, sn: 2 }));
    const flapG = side < 0 ? flipIdx(flap.scale(-1, 1, 1)) : flap;
    v.addSurface(flapG, mats.paint, new THREE.Vector3(1.4 * side, 0, 2.45), new THREE.Vector3(1, 0, 0.05 * side), 'flap', side, 35);
    // wingtip launch rail
    const rail = new THREE.Mesh(paint(new THREE.BoxGeometry(0.1, 0.12, 2.6)), mats.paint);
    rail.position.set(6.78 * side, 0.0, 1.1);
    v.body.add(rail);
  }

  // stabilators
  for (const side of [1, -1] as const) {
    const stab = paint(surface({ root: [0, -0.05, -1.0], rootChord: 2.7, tipChord: 1.05, span: 2.0, sweep: 42, thickness: 0.045, dihedral: -2, cn: 8, sn: 3 }));
    stab.translate(1.35, 0, 6.8);
    const g = side < 0 ? flipIdx(stab.scale(-1, 1, 1)) : stab;
    v.addSurface(g, mats.paint, new THREE.Vector3(1.6 * side, -0.05, 6.8), new THREE.Vector3(1, 0, 0), 'stab', side, 24);
  }
  // twin tails canted outboard 20 degrees
  const finDef: SurfaceDef = { root: [0.95, 0.4, 3.9], rootChord: 3.4, tipChord: 1.2, span: 2.75, sweep: 36, thickness: 0.045, vertical: true, dihedral: 20, cn: 8, sn: 6 };
  const teamCol = v.ac.team === 'blue' ? new THREE.Color('#2b4a8f') : new THREE.Color('#9b2320');
  const fin = paintBandY(paint(surface(finDef)), 2.25, 2.55, teamCol);
  v.addMesh(fin, mats.paint);
  v.addMesh(mirrorX(fin.clone()), mats.paint);
  for (const side of [1, -1] as const) {
    const rud = paint(surface({ root: [(0.95 + 0.25) * side, 0.5, 6.5], rootChord: 0.75, tipChord: 0.6, span: 1.7, sweep: 25, thickness: 0.035, vertical: true, dihedral: 20 * side, cn: 5, sn: 2 }));
    const axis = new THREE.Vector3(Math.sin(20 * (Math.PI / 180)) * side, Math.cos(20 * (Math.PI / 180)), 0.25);
    v.addSurface(rud, mats.paint, new THREE.Vector3((0.95 + 0.25) * side, 0.5, 6.5), axis, 'rudder', side, 28);
    const tip = surfacePoint(finDef, 1, 0.7, 0.04);
    v.addNavLight(new THREE.Vector3(tip.pos.x * side, tip.pos.y, tip.pos.z), 'formation');
  }
  const tc = surfacePoint(finDef, 0.45, 0.5, 0.045);
  v.addTailCode(tc.pos, tc.normal, 1.1, 0.55, 'AJ');
  v.addTailCode(new THREE.Vector3(-tc.pos.x, tc.pos.y, tc.pos.z), new THREE.Vector3(-tc.normal.x, tc.normal.y, 0), 1.1, 0.55, 'AJ');

  // engines
  for (const sx of [-1, 1]) {
    const nozzle = cyl(0.45, 0.5, 1.1, 20, true);
    nozzle.translate(0.6 * sx, -0.05, 8.6);
    v.addMesh(paintSolid(nozzle, new THREE.Color('#4b4642')), mats.metal);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), mats.dark);
    inner.position.set(0.6 * sx, -0.05, 8.95);
    v.body.add(inner);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const pet = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.45), mats.metal);
      pet.position.set(0.6 * sx + Math.cos(a) * 0.45, -0.05 + Math.sin(a) * 0.45, 9.15);
      pet.rotation.z = a + Math.PI / 2;
      v.body.add(pet);
    }
    v.nozzles.push({ pos: new THREE.Vector3(0.6 * sx, -0.05, 9.25), radius: 0.42 });
  }
  v.buildFlames(5.4);

  // speedbrake: the Hornet uses its rudders + spoilers; model a small dorsal panel
  const sbGeo = paint(new THREE.BoxGeometry(0.8, 0.04, 1.2));
  sbGeo.translate(0, 0.62, 1.4);
  const sb = v.addSurface(sbGeo, mats.paint, new THREE.Vector3(0, 0.62, 0.8), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(sb), 1);
  v.speedbrake = { pivot: sb.pivot, axis: new THREE.Vector3(1, 0, 0), maxDeg: 50 };

  buildGear(v, spec.gear, 0.28, 0.44, 0.2, 0.28);

  // details
  v.addNavLight(new THREE.Vector3(-6.8, 0.1, 0.4), 'red');
  v.addNavLight(new THREE.Vector3(6.8, 0.1, 0.4), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.66, 3.0), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -0.8, 0.8), 'strobe');
  v.addInsignia(new THREE.Vector3(4.6, 0.09, 1.2), new THREE.Vector3(0, 1, 0), 1.2);
  v.addInsignia(new THREE.Vector3(-4.6, 0.09, 1.2), new THREE.Vector3(0, 1, 0), 1.2);
  v.addInsignia(new THREE.Vector3(1.16, 0.0, 2.8), new THREE.Vector3(1, 0, 0), 0.6);
  v.addInsignia(new THREE.Vector3(-1.16, 0.0, 2.8), new THREE.Vector3(-1, 0, 0), 0.6);
}
