// Store meshes: AIM-120D AMRAAM, AIM-9X Sidewinder, external fuel tank,
// plus pylons / launch rails.

import * as THREE from 'three';
import { loft, surface, merge, paintSolid, cyl } from './builder';
import type { StoreType } from '../specs';

let cache: Partial<Record<string, THREE.BufferGeometry>> = {};

const WHITE = new THREE.Color('#e8e8e2');
const GREYM = new THREE.Color('#9aa0a4');
const BAND_Y = new THREE.Color('#d8b21c');
const BAND_BR = new THREE.Color('#8a5a2a');
const DOME = new THREE.Color('#3b3f44');

function missileBody(len: number, dia: number, noseFrac: number, dome: boolean): THREE.BufferGeometry {
  const r = dia / 2;
  const L = len;
  const secs = [
    { z: -L / 2, w: dome ? r * 0.55 : 0.004, top: dome ? r * 0.55 : 0.004, bot: dome ? r * 0.55 : 0.004, n: 2 },
    { z: -L / 2 + L * noseFrac * 0.35, w: r * 0.78, top: r * 0.78, bot: r * 0.78, n: 2 },
    { z: -L / 2 + L * noseFrac, w: r, top: r, bot: r, n: 2 },
    { z: L / 2 - 0.05, w: r, top: r, bot: r, n: 2 },
    { z: L / 2, w: r * 0.85, top: r * 0.85, bot: r * 0.85, n: 2 },
  ];
  return loft(secs, 14, 3, true);
}

function fins(z: number, rootChord: number, tipChord: number, span: number, sweep: number, r: number, rot = Math.PI / 4): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const f = surface({ root: [r * 0.9, 0, z], rootChord, tipChord, span, sweep, thickness: 0.06, cn: 4, sn: 1 });
    f.rotateZ(rot + (k * Math.PI) / 2);
    out.push(f);
  }
  return out;
}

export function storeGeometry(t: StoreType): THREE.BufferGeometry {
  const key = t;
  if (cache[key]) return cache[key]!;
  let g: THREE.BufferGeometry;
  if (t === 'AIM120D') {
    const L = 3.66, d = 0.178, r = d / 2;
    const body = paintSolid(missileBody(L, d, 0.16, false), WHITE);
    const nose = paintSolid(missileBody(0.6, d * 1.001, 0.9, false).translate(0, 0, -L / 2 + 0.3) as THREE.BufferGeometry, GREYM);
    void nose;
    const parts: THREE.BufferGeometry[] = [body];
    for (const f of fins(-0.25, 0.42, 0.32, 0.2, 35, r)) parts.push(paintSolid(f, WHITE)); // mid-body wings
    for (const f of fins(L / 2 - 0.36, 0.32, 0.22, 0.2, 40, r)) parts.push(paintSolid(f, WHITE)); // control fins
    const band1 = paintSolid(cyl(r * 1.01, r * 1.01, 0.06, 14, true).translate(0, 0, -L / 2 + 0.75), BAND_Y);
    const band2 = paintSolid(cyl(r * 1.01, r * 1.01, 0.06, 14, true).translate(0, 0, -0.9), BAND_BR);
    parts.push(band1, band2);
    g = merge(parts);
  } else if (t === 'AIM9X') {
    const L = 3.02, d = 0.127, r = d / 2;
    const body = paintSolid(missileBody(L, d, 0.1, true), WHITE);
    const dome = paintSolid(new THREE.SphereGeometry(r * 0.62, 10, 8).translate(0, 0, -L / 2 + 0.02), DOME);
    const parts: THREE.BufferGeometry[] = [body, dome];
    for (const f of fins(L / 2 - 0.3, 0.26, 0.2, 0.14, 30, r)) parts.push(paintSolid(f, WHITE)); // tail fins (TVC)
    for (const f of fins(-L / 2 + 0.55, 0.3, 0.3, 0.03, 0, r)) parts.push(paintSolid(f, WHITE)); // fixed forward strakes
    const band1 = paintSolid(cyl(r * 1.01, r * 1.01, 0.05, 12, true).translate(0, 0, -L / 2 + 0.45), BAND_Y);
    const band2 = paintSolid(cyl(r * 1.01, r * 1.01, 0.05, 12, true).translate(0, 0, -0.3), BAND_BR);
    parts.push(band1, band2);
    g = merge(parts);
  } else {
    // 480 gal external tank
    const L = 5.0, r = 0.38;
    const secs = [
      { z: -L / 2, w: 0.02, top: 0.02, bot: 0.02, n: 2 },
      { z: -L / 2 + 0.9, w: r * 0.85, top: r * 0.85, bot: r * 0.85, n: 2 },
      { z: -L / 2 + 1.8, w: r, top: r, bot: r, n: 2 },
      { z: L / 2 - 1.4, w: r, top: r, bot: r, n: 2 },
      { z: L / 2 - 0.2, w: r * 0.45, top: r * 0.45, bot: r * 0.45, n: 2 },
      { z: L / 2, w: 0.03, top: 0.03, bot: 0.03, n: 2 },
    ];
    const body = paintSolid(loft(secs, 18, 4, true), new THREE.Color('#7b8388'));
    const parts: THREE.BufferGeometry[] = [body];
    for (let k = 0; k < 3; k++) {
      const f = surface({ root: [r * 0.6, 0, L / 2 - 0.9], rootChord: 0.7, tipChord: 0.35, span: 0.28, sweep: 40, thickness: 0.05, cn: 4, sn: 1 });
      f.rotateZ(-Math.PI / 2 + (k - 1) * ((2 * Math.PI) / 3));
      parts.push(paintSolid(f, new THREE.Color('#7b8388')));
    }
    g = merge(parts);
  }
  cache[key] = g;
  return g;
}

/** Pylon / launcher between the airframe and the store. */
export function pylonGeometry(mount: string, store: StoreType, drop: number): THREE.BufferGeometry {
  const key = `pylon-${mount}-${store}-${drop.toFixed(2)}`;
  if (cache[key]) return cache[key]!;
  const col = new THREE.Color('#6d757a');
  let g: THREE.BufferGeometry;
  const r = store === 'TANK' ? 0.38 : store === 'AIM120D' ? 0.089 : 0.064;
  if (mount === 'rail') {
    g = paintSolid(new THREE.BoxGeometry(0.07, 0.06, 2.2).translate(0, r + 0.03, 0), col);
  } else if (mount === 'conformal' || mount === 'semi-recessed') {
    g = paintSolid(new THREE.BoxGeometry(0.06, 0.05, 1.6).translate(0, r + 0.02, 0), col);
  } else {
    const h = Math.max(0.12, drop - r);
    const shape = new THREE.Shape();
    shape.moveTo(-0.9, 0);
    shape.lineTo(0.9, 0);
    shape.lineTo(0.7, h);
    shape.lineTo(-1.1, h);
    shape.closePath();
    const ex = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: false });
    ex.rotateY(Math.PI / 2);
    ex.translate(-0.045, r, 0);
    g = paintSolid(ex, col);
    const rail = paintSolid(new THREE.BoxGeometry(0.07, 0.05, 1.6).translate(0, r + 0.02, 0), col);
    g = merge([g, rail]);
  }
  cache[key] = g;
  return g;
}

export function clearStoreCache(): void {
  cache = {};
}
