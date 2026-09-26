// Eurofighter Typhoon: 15.96 m long, 10.95 m span, 5.28 m tall.
// Single seat, close-coupled canards, chin ("smiling") intake, 53-degree
// cranked delta wing with wingtip DASS pods, single fin.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { loft, surface, paintByNormal, paintSolid, cyl, airframeMaterials, mirrorX, Section, surfacePoint, paintBandY, SurfaceDef } from './builder';
import { buildGear, flipIdx } from './f15ex';

export function buildTyphoon(v: AirframeVisual): void {
  const mats = airframeMaterials();
  const spec = v.ac.spec;
  const top = new THREE.Color(spec.paint.top);
  const bot = new THREE.Color(spec.paint.bottom);
  const paint = (g: THREE.BufferGeometry) => paintByNormal(g, top, bot);

  const fus: Section[] = [
    { z: -8.05, w: 0.02, top: 0.02, bot: 0.02, y: 0.02, n: 2 },
    { z: -7.5, w: 0.24, top: 0.24, bot: 0.24, y: 0.02, n: 2 },
    { z: -6.6, w: 0.42, top: 0.44, bot: 0.42, y: 0.04, n: 2.1 },
    { z: -5.5, w: 0.52, top: 0.52, bot: 0.55, y: 0.05, n: 2.3 },
    { z: -4.3, w: 0.6, top: 0.54, bot: 0.66, y: 0.02, n: 2.5 },
    { z: -2.8, w: 0.7, top: 0.52, bot: 0.96, y: 0.0, n: 2.8, nBot: 3.6 },
    { z: -0.6, w: 0.86, top: 0.5, bot: 1.02, n: 3.2, nBot: 4 },
    { z: 2.2, w: 0.95, top: 0.48, bot: 0.9, n: 3.4, nBot: 4 },
    { z: 4.8, w: 0.96, top: 0.44, bot: 0.66, n: 3.2 },
    { z: 6.8, w: 0.9, top: 0.4, bot: 0.5, n: 2.8 },
    { z: 7.5, w: 0.86, top: 0.38, bot: 0.46, n: 2.6 },
  ];
  v.addMesh(paint(loft(fus, 32, 5)), mats.paint);

  // chin intake: a wide box under the forward fuselage
  const intake: Section[] = [
    { z: -3.95, w: 0.74, top: 0.2, bot: 0.4, y: -0.92, n: 6, nBot: 4 },
    { z: -2.8, w: 0.78, top: 0.28, bot: 0.44, y: -0.92, n: 5.5, nBot: 4 },
    { z: -0.5, w: 0.82, top: 0.3, bot: 0.4, y: -0.86, n: 5, nBot: 4 },
    { z: 2.2, w: 0.76, top: 0.28, bot: 0.3, y: -0.76, n: 4 },
    { z: 4.2, w: 0.3, top: 0.1, bot: 0.1, y: -0.55, n: 3 },
  ];
  v.addMesh(paint(loft(intake, 24, 4)), mats.paint);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.5), mats.dark);
  mouth.position.set(0, -1.04, -3.96);
  mouth.rotation.y = Math.PI;
  v.body.add(mouth);
  // variable lower lip
  const lip = new THREE.Mesh(paint(new THREE.BoxGeometry(1.5, 0.05, 0.4)), mats.paint);
  lip.position.set(0, -1.33, -4.05);
  v.body.add(lip);

  // canopy (single seat)
  const can: Section[] = [
    { z: -5.9, w: 0.03, top: 0.02, bot: 0.02, y: 0.52, n: 2 },
    { z: -5.4, w: 0.36, top: 0.3, bot: 0.03, y: 0.54, n: 2.2 },
    { z: -4.5, w: 0.44, top: 0.52, bot: 0.03, y: 0.56, n: 2.2 },
    { z: -3.5, w: 0.42, top: 0.44, bot: 0.03, y: 0.56, n: 2.2 },
    { z: -2.6, w: 0.28, top: 0.22, bot: 0.03, y: 0.55, n: 2.2 },
    { z: -2.1, w: 0.14, top: 0.06, bot: 0.03, y: 0.54, n: 2 },
  ];
  const canopy = v.addMesh(loft(can, 24, 4), mats.glass, v.body, false);
  canopy.renderOrder = 5;
  v.canopy = canopy;
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 20, Math.PI), mats.dark);
  bow.position.set(0, 0.56, -5.25);
  v.body.add(bow);
  v.hideInCockpit.push(bow);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.22), mats.dark);
  seat.position.set(0, 0.78, -3.8);
  v.body.add(seat);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshStandardMaterial({ color: 0x4f5550, roughness: 0.6 }));
  helm.position.set(0, 1.0, -4.1);
  v.body.add(helm);
  v.hideInCockpit.push(seat, helm);
  v.cockpitEye.set(0, 1.04, -4.45);

  // spine
  const spine: Section[] = [
    { z: -2.4, w: 0.26, top: 0.05, bot: 0.05, y: 0.52, n: 2 },
    { z: -1.6, w: 0.36, top: 0.2, bot: 0.1, y: 0.52, n: 2.4 },
    { z: 3.0, w: 0.44, top: 0.16, bot: 0.1, y: 0.48, n: 2.6 },
    { z: 6.2, w: 0.3, top: 0.06, bot: 0.1, y: 0.4, n: 2.4 },
  ];
  v.addMesh(paint(loft(spine, 16, 3)), mats.paint);

  // cranked delta wing (low-mid mounted)
  const wingR = surface({ root: [0.8, -0.3, -2.3], rootChord: 7.4, tipChord: 0.95, span: 4.68, sweep: 53, thickness: 0.045, dihedral: -1.5, cn: 12, sn: 5 });
  v.addMesh(paint(wingR), mats.paint);
  v.addMesh(mirrorX(paint(wingR.clone())), mats.paint);
  for (const side of [1, -1] as const) {
    // inboard + outboard flaperons
    const fin1 = paint(surface({ root: [1.0, -0.32, 4.45], rootChord: 0.75, tipChord: 0.7, span: 2.0, sweep: 0, thickness: 0.03, dihedral: -1.5, cn: 5, sn: 2 }));
    const fin2 = paint(surface({ root: [3.05, -0.36, 4.45], rootChord: 0.7, tipChord: 0.55, span: 1.8, sweep: 5, thickness: 0.03, dihedral: -1.5, cn: 5, sn: 2 }));
    const g1 = side < 0 ? flipIdx(fin1.scale(-1, 1, 1)) : fin1;
    const g2 = side < 0 ? flipIdx(fin2.scale(-1, 1, 1)) : fin2;
    v.addSurface(g1, mats.paint, new THREE.Vector3(1.0 * side, -0.32, 4.45), new THREE.Vector3(1, 0, 0), 'flap', side, 25);
    v.addSurface(g2, mats.paint, new THREE.Vector3(3.05 * side, -0.36, 4.45), new THREE.Vector3(1, 0, 0.05 * side), 'aileron', side, 25);
    // canards
    const can2 = paint(surface({ root: [0, 0, -0.8], rootChord: 1.75, tipChord: 0.55, span: 1.55, sweep: 50, thickness: 0.04, dihedral: 3, cn: 6, sn: 2 }));
    can2.translate(0.62, 0.12, -4.5);
    const cg = side < 0 ? flipIdx(can2.scale(-1, 1, 1)) : can2;
    v.addSurface(cg, mats.paint, new THREE.Vector3(0.9 * side, 0.12, -4.5), new THREE.Vector3(1, 0, 0), 'canard', side, 22);
    // wingtip DASS pods
    const pod = new THREE.Mesh(paint(cyl(0.1, 0.13, 1.8, 10)), mats.paint);
    pod.position.set(5.5 * side, -0.42, 3.9);
    v.body.add(pod);
  }

  // single fin with rudder
  const finDef: SurfaceDef = { root: [0, 0.38, 2.9], rootChord: 3.9, tipChord: 1.2, span: 3.0, sweep: 50, thickness: 0.045, vertical: true, cn: 8, sn: 6 };
  const teamCol = v.ac.team === 'blue' ? new THREE.Color('#2b4a8f') : new THREE.Color('#9b2320');
  const fin = paintBandY(paint(surface(finDef)), 2.6, 2.95, teamCol);
  v.addMesh(fin, mats.paint);
  const rud = paint(surface({ root: [0, 0.5, 6.1], rootChord: 0.8, tipChord: 0.55, span: 2.2, sweep: 30, thickness: 0.035, vertical: true, cn: 5, sn: 2 }));
  v.addSurface(rud, mats.paint, new THREE.Vector3(0, 0.5, 6.1), new THREE.Vector3(0, 1, 0.55), 'rudder', 0, 25);
  v.addNavLight(new THREE.Vector3(0, 3.35, 6.9), 'strobe');
  const tc = surfacePoint(finDef, 0.45, 0.5, 0.05);
  v.addTailCode(tc.pos, tc.normal, 1.2, 0.6, 'EF');
  v.addTailCode(new THREE.Vector3(-tc.pos.x, tc.pos.y, tc.pos.z), new THREE.Vector3(-1, 0, 0), 1.2, 0.6, 'EF');

  // engines (EJ200)
  for (const sx of [-1, 1]) {
    const nozzle = cyl(0.43, 0.48, 1.0, 20, true);
    nozzle.translate(0.5 * sx, -0.08, 7.9);
    v.addMesh(paintSolid(nozzle, new THREE.Color('#4b4642')), mats.metal);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), mats.dark);
    inner.position.set(0.5 * sx, -0.08, 8.2);
    v.body.add(inner);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const pet = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.4), mats.metal);
      pet.position.set(0.5 * sx + Math.cos(a) * 0.43, -0.08 + Math.sin(a) * 0.43, 8.4);
      pet.rotation.z = a + Math.PI / 2;
      v.body.add(pet);
    }
    v.nozzles.push({ pos: new THREE.Vector3(0.5 * sx, -0.08, 8.5), radius: 0.4 });
  }
  v.buildFlames(5.0);

  // dorsal airbrake
  const sbGeo = paint(new THREE.BoxGeometry(0.75, 0.04, 1.3));
  sbGeo.translate(0, 0.62, -0.5);
  const sb = v.addSurface(sbGeo, mats.paint, new THREE.Vector3(0, 0.62, -1.15), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(sb), 1);
  v.speedbrake = { pivot: sb.pivot, axis: new THREE.Vector3(1, 0, 0), maxDeg: 50 };

  buildGear(v, spec.gear, 0.28, 0.4, 0.18, 0.24);

  v.addNavLight(new THREE.Vector3(-5.5, -0.3, 3.0), 'red');
  v.addNavLight(new THREE.Vector3(5.5, -0.3, 3.0), 'green');
  v.addNavLight(new THREE.Vector3(0, -1.1, 1.5), 'strobe');
  v.addInsignia(new THREE.Vector3(3.3, -0.2, 2.6), new THREE.Vector3(0, 1, 0), 1.1);
  v.addInsignia(new THREE.Vector3(-3.3, -0.2, 2.6), new THREE.Vector3(0, 1, 0), 1.1);
  v.addInsignia(new THREE.Vector3(0.92, 0.1, 0.8), new THREE.Vector3(1, 0, 0), 0.55);
  v.addInsignia(new THREE.Vector3(-0.92, 0.1, 0.8), new THREE.Vector3(-1, 0, 0), 0.55);
}
