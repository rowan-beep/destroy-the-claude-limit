// F-15EX Eagle II: 19.45 m long, 13.05 m span, 5.65 m tall.
// Two-seat cockpit, big rectangular intakes with conformal fuel tanks,
// 45-degree cropped delta wing, twin vertical tails, all-moving stabilators.

import * as THREE from 'three';
import { AirframeVisual } from './visual';
import { loft, surface, merge, paintByNormal, paintSolid, cyl, airframeMaterials, mirrorX, Section, surfacePoint, paintBandY, SurfaceDef } from './builder';

export function buildF15EX(v: AirframeVisual): void {
  const mats = airframeMaterials();
  const spec = v.ac.spec;
  const top = new THREE.Color(spec.paint.top);
  const bot = new THREE.Color(spec.paint.bottom);
  const acc = new THREE.Color(spec.paint.accent);
  const paint = (g: THREE.BufferGeometry) => paintByNormal(g, top, bot);

  // --- fuselage ---------------------------------------------------------
  const fus: Section[] = [
    { z: -9.85, w: 0.02, top: 0.02, bot: 0.02, y: -0.08, n: 2 },
    { z: -9.35, w: 0.26, top: 0.26, bot: 0.26, y: -0.07, n: 2 },
    { z: -8.5, w: 0.45, top: 0.45, bot: 0.43, y: -0.04, n: 2.05 },
    { z: -7.5, w: 0.58, top: 0.56, bot: 0.55, y: -0.01, n: 2.2 },
    { z: -6.4, w: 0.66, top: 0.6, bot: 0.64, y: 0.0, n: 2.4, nBot: 2.8 },
    { z: -5.2, w: 0.72, top: 0.62, bot: 0.7, y: 0.0, n: 2.6, nBot: 3.2 },
    { z: -3.8, w: 0.84, top: 0.62, bot: 0.72, n: 2.9, nBot: 3.6 },
    { z: -2.0, w: 1.12, top: 0.62, bot: 0.74, n: 3.4, nBot: 4 },
    { z: 0.5, w: 1.4, top: 0.56, bot: 0.72, n: 3.8, nBot: 4 },
    { z: 3.0, w: 1.46, top: 0.5, bot: 0.62, n: 3.8, nBot: 4 },
    { z: 5.6, w: 1.4, top: 0.46, bot: 0.55, n: 3.4 },
    { z: 7.4, w: 1.26, top: 0.42, bot: 0.5, n: 3.0 },
    { z: 8.3, w: 1.16, top: 0.38, bot: 0.45, n: 2.8 },
  ];
  v.addMesh(paint(loft(fus, 32, 5)), mats.paint);

  // intake trunks with conformal fuel tanks along the sides
  const intake: Section[] = [
    { z: -4.55, w: 0.5, top: 0.36, bot: 0.66, y: -0.26, n: 7, nBot: 7 },
    { z: -3.4, w: 0.56, top: 0.42, bot: 0.68, y: -0.24, n: 6, nBot: 6 },
    { z: -1.0, w: 0.6, top: 0.46, bot: 0.66, y: -0.22, n: 5, nBot: 5 },
    { z: 1.8, w: 0.56, top: 0.44, bot: 0.6, y: -0.2, n: 4.5 },
    { z: 4.2, w: 0.42, top: 0.34, bot: 0.46, y: -0.16, n: 3.5 },
    { z: 5.6, w: 0.2, top: 0.18, bot: 0.2, y: -0.12, n: 3 },
  ];
  const inR = loft(intake, 24, 4);
  inR.translate(1.3, 0, 0);
  const cft: Section[] = [
    { z: -2.6, w: 0.05, top: 0.05, bot: 0.05, y: -0.36, n: 2.5 },
    { z: -1.6, w: 0.3, top: 0.3, bot: 0.36, y: -0.36, n: 2.6 },
    { z: 2.4, w: 0.34, top: 0.32, bot: 0.38, y: -0.36, n: 2.6 },
    { z: 4.2, w: 0.1, top: 0.1, bot: 0.1, y: -0.34, n: 2.5 },
  ];
  const cftR = loft(cft, 18, 3);
  cftR.translate(1.72, 0, 0);
  const sideR = merge([paint(inR), paint(cftR)]);
  v.addMesh(sideR, mats.paint);
  v.addMesh(mirrorX(sideR), mats.paint);
  // intake mouths
  for (const sx of [-1, 1]) {
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.94), mats.dark);
    mouth.position.set(1.3 * sx, -0.39, -4.56);
    mouth.rotation.y = Math.PI;
    v.body.add(mouth);
    // variable ramp lip (raked top)
    const lip = new THREE.Mesh(paint(new THREE.BoxGeometry(1.02, 0.06, 0.55)), mats.paint);
    lip.position.set(1.3 * sx, 0.11, -4.62);
    lip.rotation.x = -0.12;
    v.body.add(lip);
  }

  // dorsal spine behind the canopy
  const spine: Section[] = [
    { z: -3.2, w: 0.3, top: 0.05, bot: 0.05, y: 0.58, n: 2 },
    { z: -2.4, w: 0.42, top: 0.2, bot: 0.1, y: 0.58, n: 2.4 },
    { z: 1.5, w: 0.5, top: 0.16, bot: 0.1, y: 0.54, n: 2.6 },
    { z: 5.0, w: 0.4, top: 0.08, bot: 0.1, y: 0.48, n: 2.4 },
  ];
  v.addMesh(paint(loft(spine, 18, 3)), mats.paint);

  // canopy (tandem two-seat bubble)
  const can: Section[] = [
    { z: -7.0, w: 0.03, top: 0.02, bot: 0.02, y: 0.56, n: 2 },
    { z: -6.5, w: 0.4, top: 0.32, bot: 0.03, y: 0.58, n: 2.2 },
    { z: -5.6, w: 0.5, top: 0.54, bot: 0.03, y: 0.58, n: 2.2 },
    { z: -4.2, w: 0.5, top: 0.56, bot: 0.03, y: 0.6, n: 2.2 },
    { z: -3.1, w: 0.42, top: 0.36, bot: 0.03, y: 0.6, n: 2.2 },
    { z: -2.5, w: 0.2, top: 0.1, bot: 0.03, y: 0.6, n: 2 },
  ];
  const canopy = v.addMesh(loft(can, 24, 4), mats.glass, v.body, false);
  canopy.renderOrder = 5;
  v.canopy = canopy;
  // canopy frame bows
  for (const z of [-6.35, -4.75]) {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 6, 20, Math.PI), mats.dark);
    bow.position.set(0, 0.6, z);
    bow.scale.set(1, 1.05, 1);
    v.body.add(bow);
    v.hideInCockpit.push(bow);
  }
  // ejection seats / helmets visible through the glass
  for (const z of [-5.55, -4.1]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.22), mats.dark);
    seat.position.set(0, 0.8, z + 0.38);
    v.body.add(seat);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshStandardMaterial({ color: 0x5b6150, roughness: 0.6 }));
    helm.position.set(0, 1.02, z + 0.1);
    v.body.add(helm);
    v.hideInCockpit.push(seat, helm);
  }
  v.cockpitEye.set(0, 1.08, -5.55);

  // --- wings ------------------------------------------------------------
  const wingR = surface({ root: [1.45, 0.16, -1.9], rootChord: 6.4, tipChord: 1.6, span: 5.07, sweep: 45, thickness: 0.05, dihedral: -1, cn: 12, sn: 5 });
  v.addMesh(paint(wingR), mats.paint);
  v.addMesh(mirrorX(paint(wingR.clone())), mats.paint);
  // ailerons (outboard trailing edge) and flaps
  for (const side of [1, -1] as const) {
    const ail = paint(surface({ root: [4.2, 0.12, 3.97], rootChord: 0.85, tipChord: 0.7, span: 1.9, sweep: 8, thickness: 0.035, dihedral: -1, cn: 6, sn: 2 }));
    const flap = paint(surface({ root: [1.9, 0.14, 3.77], rootChord: 0.9, tipChord: 0.85, span: 2.3, sweep: 4, thickness: 0.035, dihedral: -1, cn: 6, sn: 2 }));
    if (side < 0) {
      ail.scale(-1, 1, 1);
      flap.scale(-1, 1, 1);
    }
    const g1 = side < 0 ? flipIdx(ail) : ail;
    const g2 = side < 0 ? flipIdx(flap) : flap;
    v.addSurface(g1, mats.paint, new THREE.Vector3(4.2 * side, 0.12, 3.97), new THREE.Vector3(1, 0, 0.14 * side), 'aileron', side, 18);
    v.addSurface(g2, mats.paint, new THREE.Vector3(1.9 * side, 0.14, 3.77), new THREE.Vector3(1, 0, 0.07 * side), 'flap', side, 30);
  }

  // --- tails -----------------------------------------------------------------
  for (const side of [1, -1] as const) {
    const stab = paint(surface({ root: [0, -0.02, -1.25], rootChord: 3.2, tipChord: 1.25, span: 2.7, sweep: 50, thickness: 0.045, cn: 8, sn: 3 }));
    stab.translate(1.62, 0, 7.4);
    const g = side < 0 ? flipIdx(stab.scale(-1, 1, 1)) : stab;
    v.addSurface(g, mats.paint, new THREE.Vector3(1.9 * side, -0.02, 7.4), new THREE.Vector3(1, 0, 0), 'stab', side, 22);
  }
  const finDef: SurfaceDef = { root: [1.45, 0.42, 4.95], rootChord: 3.55, tipChord: 1.2, span: 3.2, sweep: 38, thickness: 0.045, vertical: true, dihedral: 2, cn: 8, sn: 6 };
  const teamCol = v.ac.team === 'blue' ? new THREE.Color('#2b4a8f') : new THREE.Color('#9b2320');
  const fin = paintBandY(paint(surface(finDef)), 2.9, 3.25, teamCol);
  v.addMesh(fin, mats.paint);
  v.addMesh(mirrorX(fin.clone()), mats.paint);
  for (const side of [1, -1] as const) {
    const rud = paint(surface({ root: [1.45 * side, 0.55, 7.9], rootChord: 0.75, tipChord: 0.6, span: 1.9, sweep: 22, thickness: 0.035, vertical: true, dihedral: 2 * side, cn: 5, sn: 2 }));
    v.addSurface(rud, mats.paint, new THREE.Vector3(1.45 * side, 0.55, 7.9), new THREE.Vector3(0, 1, 0.2), 'rudder', side, 25);
    const tip = surfacePoint(finDef, 1, 0.7, 0.04);
    v.addNavLight(new THREE.Vector3(tip.pos.x * side, tip.pos.y, tip.pos.z), 'formation');
  }
  const tc = surfacePoint(finDef, 0.5, 0.52, 0.045);
  v.addTailCode(tc.pos, tc.normal, 1.3, 0.65, 'EX');
  v.addTailCode(new THREE.Vector3(-tc.pos.x, tc.pos.y, tc.pos.z), new THREE.Vector3(-tc.normal.x, tc.normal.y, 0), 1.3, 0.65, 'EX');

  // --- engines ------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const nozzle = cyl(0.5, 0.56, 1.3, 20, true);
    nozzle.translate(0.64 * sx, -0.06, 8.85);
    v.addMesh(paintSolid(nozzle, new THREE.Color('#4b4642')), mats.metal);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.47, 20), mats.dark);
    inner.position.set(0.64 * sx, -0.06, 9.2);
    v.body.add(inner);
    // turkey feathers
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const pet = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.55), mats.metal);
      pet.position.set(0.64 * sx + Math.cos(a) * 0.5, -0.06 + Math.sin(a) * 0.5, 9.45);
      pet.rotation.z = a + Math.PI / 2;
      pet.rotation.x = 0.08;
      v.body.add(pet);
    }
    v.nozzles.push({ pos: new THREE.Vector3(0.64 * sx, -0.06, 9.55), radius: 0.46 });
  }
  v.buildFlames(6.2);

  // --- speedbrake (dorsal) ------------------------------------------------
  const sbGeo = paint(new THREE.BoxGeometry(1.1, 0.05, 2.3));
  sbGeo.translate(0, 0.72, -0.9);
  const sb = v.addSurface(sbGeo, mats.paint, new THREE.Vector3(0, 0.72, -2.05), new THREE.Vector3(1, 0, 0), 'rudder', 0, 0);
  v.surfaces.splice(v.surfaces.indexOf(sb), 1);
  v.speedbrake = { pivot: sb.pivot, axis: new THREE.Vector3(1, 0, 0), maxDeg: 45 };

  // --- landing gear ----------------------------------------------------------
  buildGear(v, spec.gear, 0.33, 0.42, 0.18, 0.26);

  // --- details ---------------------------------------------------------------
  const pitot = new THREE.Mesh(cyl(0.012, 0.02, 0.9, 6), mats.metal);
  pitot.position.set(0, -0.08, -10.2);
  v.body.add(pitot);
  v.addNavLight(new THREE.Vector3(-6.5, 0.12, 3.5), 'red');
  v.addNavLight(new THREE.Vector3(6.5, 0.12, 3.5), 'green');
  v.addNavLight(new THREE.Vector3(0, 0.75, 2.5), 'strobe');
  v.addNavLight(new THREE.Vector3(0, -0.78, 1.0), 'strobe');
  v.addInsignia(new THREE.Vector3(4.2, 0.21, 2.2), new THREE.Vector3(0, 1, 0), 1.3);
  v.addInsignia(new THREE.Vector3(-4.2, 0.21, 2.2), new THREE.Vector3(0, 1, 0), 1.3);
  v.addInsignia(new THREE.Vector3(1.93, -0.3, -0.5), new THREE.Vector3(1, 0, 0), 0.7);
  v.addInsignia(new THREE.Vector3(-1.93, -0.3, -0.5), new THREE.Vector3(-1, 0, 0), 0.7);
  void acc;
}

export function flipIdx(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = g.index;
  if (index) {
    const arr = index.array as Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
    index.needsUpdate = true;
  }
  g.computeVertexNormals();
  // re-paint after the normals flipped orientation
  return g;
}

/** Tricycle landing gear with retraction pivots. */
export function buildGear(
  v: AirframeVisual,
  gear: { nose: number; main: number; track: number; height: number },
  noseR: number,
  mainR: number,
  noseW: number,
  mainW: number,
): void {
  const mats = airframeMaterials();
  const strutMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.4, metalness: 0.6 });
  const gh = gear.height;
  // nose leg
  {
    const topY = -0.55;
    const wheelY = -gh + noseR;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, topY - wheelY, 8), strutMat);
    strut.position.set(0, (topY + wheelY) / 2, gear.nose);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(noseR, noseR, noseW, 16), mats.tire);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, wheelY, gear.nose);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(noseR * 0.55, noseR * 0.55, noseW + 0.02, 12), strutMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(wheel.position);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    light.position.set(0, wheelY + 0.55, gear.nose - 0.12);
    for (const m of [strut, wheel, hub]) m.castShadow = true;
    v.addGearLeg([strut, wheel, hub, light], new THREE.Vector3(0, topY, gear.nose), new THREE.Vector3(1, 0, 0), 95);
  }
  // main legs
  for (const sx of [-1, 1]) {
    const x = gear.track * sx;
    const topY = -0.5;
    const wheelY = -gh + mainR;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, topY - wheelY, 8), strutMat);
    strut.position.set(x, (topY + wheelY) / 2, gear.main);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(mainR, mainR, mainW, 18), mats.tire);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x + 0.12 * sx, wheelY, gear.main);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(mainR * 0.55, mainR * 0.55, mainW + 0.02, 12), strutMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(wheel.position);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 1.1), mats.paint);
    door.material = new THREE.MeshStandardMaterial({ color: v.ac.spec.paint.bottom, roughness: 0.6, metalness: 0.2 });
    door.position.set(x - 0.25 * sx, topY - 0.45, gear.main);
    for (const m of [strut, wheel, hub, door]) m.castShadow = true;
    v.addGearLeg([strut, wheel, hub, door], new THREE.Vector3(x, topY, gear.main), new THREE.Vector3(0, 0, 1), -95 * sx);
  }
}
