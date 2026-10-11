// Assembly helpers shared by the three airframes: splitting wings into fixed
// panels and hinged control surfaces, fins with rudders, the canopy with its
// frame, and complete landing-gear sets.

import * as THREE from 'three';
import type { AirframeVisual, ControlSurface } from './visual';
import { loft, Section, sectionArch, sectionAt } from './builder';
import { wing, WingStation, WingSpec, join, P2, strip, roundBox, rod, lathe } from './kit';
import { partMaterials, canopyGlass, strutLeg, wheel } from './parts';

function stationAt(secs: WingStation[], x: number): WingStation {
  if (x <= secs[0].x) return { ...secs[0], x };
  for (let i = 0; i < secs.length - 1; i++) {
    const a = secs[i];
    const b = secs[i + 1];
    if (x <= b.x) {
      const f = (x - a.x) / Math.max(1e-9, b.x - a.x);
      return { x, le: a.le + (b.le - a.le) * f, te: a.te + (b.te - a.te) * f, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * f, t: a.t + (b.t - a.t) * f };
    }
  }
  return { ...secs[secs.length - 1], x };
}

function clip(secs: WingStation[], a: number, b: number): WingStation[] {
  const out = [stationAt(secs, a)];
  for (const s of secs) if (s.x > a + 1e-4 && s.x < b - 1e-4) out.push(s);
  out.push(stationAt(secs, b));
  return out;
}

export interface CutDef {
  x0: number;
  x1: number;
  /** hinge line z as a function of span x */
  hinge: (x: number) => number;
  kind: ControlSurface['kind'];
  maxDeg: number;
  /** cut from the leading edge instead (leading-edge flaps) */
  leading?: boolean;
}

export interface MovingPart {
  geo: THREE.BufferGeometry;
  hinge: THREE.Vector3;
  axis: THREE.Vector3;
  kind: ControlSurface['kind'];
  maxDeg: number;
}

/** Split a right wing into fixed panels and hinged control surfaces (right side only). */
export function wingPanels(secs: WingStation[], cuts: CutDef[], opt: Partial<WingSpec> = {}): { fixed: THREE.BufferGeometry; moving: MovingPart[] } {
  const xs = new Set<number>([secs[0].x, secs[secs.length - 1].x]);
  for (const c of cuts) {
    xs.add(c.x0);
    xs.add(c.x1);
  }
  const bps = [...xs].sort((a, b) => a - b);
  const fixed: THREE.BufferGeometry[] = [];
  const moving: MovingPart[] = [];
  for (let i = 0; i < bps.length - 1; i++) {
    const a = bps[i];
    const b = bps[i + 1];
    if (b - a < 1e-3) continue;
    const mid = (a + b) / 2;
    const here = cuts.filter((c) => mid > c.x0 && mid < c.x1);
    const trail = here.find((c) => !c.leading);
    const lead = here.find((c) => c.leading);
    const s = clip(secs, a, b);
    const last = i === bps.length - 2;
    fixed.push(
      wing({
        ...opt,
        sections: s,
        back: trail ? trail.hinge : undefined,
        front: lead ? lead.hinge : undefined,
        // (opt.tip: how the outermost fixed panel ends, round unless the caller closes it flat
        // against a separate tip piece)
        tip: last ? opt.tip ?? 'round' : 'flat',
        root: 'flat',
      }),
    );
    for (const c of [trail, lead]) {
      if (!c) continue;
      const geo = wing({
        ...opt,
        sections: s,
        front: c.leading ? undefined : c.hinge,
        back: c.leading ? c.hinge : undefined,
        tip: 'flat',
        root: 'flat',
        spanSub: opt.spanSub ?? 5,
      });
      const s0 = stationAt(secs, a);
      const s1 = stationAt(secs, b);
      const h0 = new THREE.Vector3(a, s0.y ?? 0, c.hinge(a));
      const h1 = new THREE.Vector3(b, s1.y ?? 0, c.hinge(b));
      moving.push({ geo, hinge: h0, axis: h1.sub(h0).normalize(), kind: c.kind, maxDeg: c.maxDeg });
    }
  }
  return { fixed: join(fixed), moving };
}

/** A fin (built with x = height) split around its rudder, transformed into place. */
export function finPanels(
  secs: WingStation[],
  rud: { h0: number; h1: number; hinge: (h: number) => number },
  m: THREE.Matrix4,
  opt: Partial<WingSpec> & { sink?: number } = {},
): { fixed: THREE.BufferGeometry; rudder: MovingPart } {
  // the root is carried on down into the body (`sink` metres along the fin's own
  // axis): the spine slopes and curves under a straight root chord, and a canted
  // fin's root sits off the skin, so without it the fin floats on a sliver of sky
  const { sink = 0.5, ...wopt } = opt;
  const sunk = sink > 0 ? [{ ...secs[0], x: secs[0].x - sink }, ...secs] : secs;
  const p = wingPanels(sunk, [{ x0: rud.h0, x1: rud.h1, hinge: rud.hinge, kind: 'rudder', maxDeg: 25 }], wopt);
  p.fixed.applyMatrix4(m);
  if (m.determinant() < 0) flipIdx(p.fixed);
  const r = p.moving[0];
  r.geo.applyMatrix4(m);
  if (m.determinant() < 0) flipIdx(r.geo);
  const h0 = r.hinge.clone().applyMatrix4(m);
  const h1 = r.hinge.clone().addScaledVector(r.axis, 1).applyMatrix4(m);
  return { fixed: p.fixed, rudder: { ...r, hinge: h0, axis: h1.sub(h0).normalize() } };
}

function flipIdx(g: THREE.BufferGeometry): void {
  const idx = g.index;
  if (!idx) return;
  const arr = idx.array as Uint32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const t = arr[i + 1];
    arr[i + 1] = arr[i + 2];
    arr[i + 2] = t;
  }
  idx.needsUpdate = true;
  g.computeVertexNormals();
}

/** Approximate superellipse sections of a profiled body (the cockpit builder sizes its tub from these). */
export function sectionsFromProfile(profile: (z: number) => P2[], z0: number, z1: number, n: number): Section[] {
  const out: Section[] = [];
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    const pts = profile(z);
    let w = 0, ymin = Infinity, ymax = -Infinity;
    for (const [x, y] of pts) {
      w = Math.max(w, x);
      ymin = Math.min(ymin, y);
      ymax = Math.max(ymax, y);
    }
    const yc = (ymin + ymax) / 2;
    out.push({ z, w, top: ymax - yc, bot: yc - ymin, y: yc, n: 2.6 });
  }
  return out;
}

/** Bubble canopy (glass), windscreen arch, bows and sill rails. */
export function buildCanopy(v: AirframeVisual, can: Section[], archZ: number, bows: number[], frameMat?: THREE.Material, taperTail = 0, fadeTail?: [number, number], archFrame = true): void {
  const pm = partMaterials();
  // (a glass tail lying flush on the spine fades into the skin instead of ending in a hard bright point)
  const [glassMat, glassBack] = fadeTail ? canopyGlass(fadeTail) : [pm.glass, pm.glassBack];
  const glass = v.addMesh(loft(can, 64, 10), glassMat, v.body, false);
  // after the water (1) and every cloud layer (world/clouds.ts: 8-10): transparent things draw in
  // renderOrder, and the clouds write no depth, so a canopy drawn before them vanished behind any
  // cloud it was silhouetted against (the cloud painted over the glass where only sky was behind it)
  glass.renderOrder = 11;
  // the far wall, seen through the near one (its own back-face mesh, drawn first; the cockpit view,
  // inside the bubble, hides it)
  const far = new THREE.Mesh(glass.geometry, glassBack);
  far.renderOrder = 10.99;
  glass.add(far);
  v.hideInCockpit.push(far);
  v.canopy = glass;
  v.canopySections = can;
  v.windscreenArchZ = archZ;
  v.canopyBows = bows;
  const frame: THREE.BufferGeometry[] = [];
  // (a one-piece frameless transparency has no arch: `archFrame` false)
  for (const z of [...(archFrame ? [archZ] : []), ...bows]) frame.push(strip(sectionArch(sectionAt(can, z), 0.022, -0.006, 0.02, Math.PI - 0.02, 36)));
  // sill rails along both sides
  for (const sx of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    const z0 = can[1].z;
    const z1 = can[can.length - 2].z;
    for (let i = 0; i <= 16; i++) {
      const z = z0 + ((z1 - z0) * i) / 16;
      const s = sectionAt(can, z);
      pts.push(new THREE.Vector3(sx * s.w * 0.99, (s.y ?? 0) + 0.015, z));
    }
    const c = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(c, 40, 0.028, 6, false);
    if (taperTail > 0) {
      // the rails thin away to nothing over the last `taperTail` of their length, fading into the
      // glass's tail instead of stopping there as two blunt dark sticks
      const pos = tube.getAttribute('position') as THREE.BufferAttribute;
      const ctr = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        const t = Math.floor(i / 7) / 40;
        const u = Math.min(1, Math.max(0, (t - (1 - taperTail)) / taperTail));
        const k = 1 - u * u * (3 - 2 * u) * 0.97;
        c.getPointAt(t, ctr);
        pos.setXYZ(i, ctr.x + (pos.getX(i) - ctr.x) * k, ctr.y + (pos.getY(i) - ctr.y) * k, ctr.z + (pos.getZ(i) - ctr.z) * k);
      }
      tube.computeVertexNormals();
    }
    frame.push(strip(tube));
  }
  const fm = v.addMesh(join(frame), frameMat ?? pm.frame);
  v.hideInCockpit.push(fm);
}

// (the landing gear lives in gear.ts)
export { buildGearSet } from './gear';
export type { GearSpec } from './gear';

export { join };
