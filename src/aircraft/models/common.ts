// Assembly helpers shared by the three airframes: splitting wings into fixed
// panels and hinged control surfaces, fins with rudders, the canopy with its
// frame, and complete landing-gear sets.

import * as THREE from 'three';
import type { AirframeVisual, ControlSurface } from './visual';
import { loft, Section, sectionArch, sectionAt } from './builder';
import { wing, WingStation, WingSpec, join, P2, strip, roundBox, rod, lathe } from './kit';
import { partMaterials, strutLeg, wheel } from './parts';

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
        tip: last ? 'round' : 'flat',
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
export function buildCanopy(v: AirframeVisual, can: Section[], archZ: number, bows: number[], frameMat?: THREE.Material): void {
  const pm = partMaterials();
  const glass = v.addMesh(loft(can, 64, 10), pm.glass, v.body, false);
  // after the water (1) and every cloud layer (world/clouds.ts: 8-10): transparent things draw in
  // renderOrder, and the clouds write no depth, so a canopy drawn before them vanished behind any
  // cloud it was silhouetted against (the cloud painted over the glass where only sky was behind it)
  glass.renderOrder = 11;
  v.canopy = glass;
  v.canopySections = can;
  v.windscreenArchZ = archZ;
  v.canopyBows = bows;
  const frame: THREE.BufferGeometry[] = [];
  for (const z of [archZ, ...bows]) frame.push(strip(sectionArch(sectionAt(can, z), 0.022, -0.006, 0.02, Math.PI - 0.02, 36)));
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
    frame.push(strip(new THREE.TubeGeometry(c, 40, 0.028, 6, false)));
  }
  const fm = v.addMesh(join(frame), frameMat ?? pm.frame);
  v.hideInCockpit.push(fm);
}

export interface GearSpec {
  nose: { top: THREE.Vector3; axle: THREE.Vector3; r: number; w: number; twin: boolean; retract: 'forward' | 'aft'; launchBar?: boolean; /** false: no doors on the leg (they stay on the bay) */ doors?: boolean };
  mains: { top: THREE.Vector3; axle: THREE.Vector3; r: number; w: number; retract: 'forward' | 'aft' | 'inward'; outboard: number; trailing?: boolean };
  doorColor: string;
}

/** Detailed tricycle gear with retraction pivots, doors, lights. */
export function buildGearSet(v: AirframeVisual, g: GearSpec): void {
  const pm = partMaterials();
  const doorMat = new THREE.MeshStandardMaterial({ color: g.doorColor, roughness: 0.6, metalness: 0.2 });
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  };
  // --- nose
  {
    const n = g.nose;
    const parts: THREE.Mesh[] = [];
    const strut = strutLeg(n.top, n.axle.clone().add(new THREE.Vector3(0, n.r * 0.2, 0)), 0.07, null);
    parts.push(mesh(join(strut), pm.strut));
    const wheels = n.twin ? [-1, 1] : [0];
    for (const s of wheels) {
      const wg = wheel(n.r, n.w);
      const off = s * (n.w / 2 + 0.05);
      wg.tire.translate(n.axle.x + off, n.axle.y, n.axle.z);
      wg.hub.translate(n.axle.x + off, n.axle.y, n.axle.z);
      parts.push(mesh(wg.tire, pm.tire), mesh(wg.hub, pm.hub));
    }
    // fork / axle beam
    const fork = n.twin
      ? rod(n.axle.clone().setX(n.axle.x - n.w - 0.06), n.axle.clone().setX(n.axle.x + n.w + 0.06), 0.035, 0.035, 8)
      : join([
          rod(n.axle.clone().add(new THREE.Vector3(-n.w / 2 - 0.04, n.r * 0.9, 0)), n.axle.clone().add(new THREE.Vector3(-n.w / 2 - 0.04, 0, 0)), 0.03, 0.03, 6),
          rod(n.axle.clone().add(new THREE.Vector3(n.w / 2 + 0.04, n.r * 0.9, 0)), n.axle.clone().add(new THREE.Vector3(n.w / 2 + 0.04, 0, 0)), 0.03, 0.03, 6),
          rod(n.axle.clone().add(new THREE.Vector3(-n.w / 2 - 0.04, n.r * 0.9, 0)), n.axle.clone().add(new THREE.Vector3(n.w / 2 + 0.04, n.r * 0.9, 0)), 0.035, 0.035, 6),
        ]);
    parts.push(mesh(fork, pm.strut));
    if (n.launchBar) parts.push(mesh(rod(n.axle.clone().add(new THREE.Vector3(0, n.r * 1.3, -0.12)), n.axle.clone().add(new THREE.Vector3(0, n.r * 1.5, -0.8)), 0.03, 0.025, 6), pm.strut));
    // landing / taxi lights on the strut
    const lamp = lathe([[0.001, -0.02], [0.05, 0], [0.055, 0.06]], 12);
    lamp.translate(0, 0, 0);
    const lampPos = n.top.clone().lerp(n.axle, 0.45).add(new THREE.Vector3(0, 0, -0.12));
    lamp.translate(lampPos.x, lampPos.y, lampPos.z);
    parts.push(mesh(lamp, pm.lens));
    // doors along the bay
    if (n.doors !== false) for (const sx of [-1, 1]) {
      const d = roundBox(0.014, 0.34, 0.9, 0.006);
      d.translate(sx * 0.19, n.top.y - 0.16, n.top.z - 0.15);
      parts.push(mesh(d, doorMat));
    }
    v.addGearLeg(parts, n.top, new THREE.Vector3(1, 0, 0), n.retract === 'forward' ? 95 : -95);
  }
  // --- mains
  for (const sx of [-1, 1]) {
    const m = g.mains;
    const top = m.top.clone().setX(m.top.x * sx);
    const axle = m.axle.clone().setX(m.axle.x * sx);
    const parts: THREE.Mesh[] = [];
    const brace = top.clone().add(new THREE.Vector3(0, 0.05, m.retract === 'forward' ? 0.55 : -0.55));
    const legGeo = m.trailing
      ? [rod(top, axle.clone().add(new THREE.Vector3(0, 0.3, -0.25)), 0.09, 0.08, 14), rod(axle.clone().add(new THREE.Vector3(0, 0.3, -0.25)), axle, 0.07, 0.06, 12), rod(top.clone().lerp(axle, 0.3), axle.clone().add(new THREE.Vector3(0, 0.35, 0.1)), 0.05, 0.05, 8)]
      : strutLeg(top, axle.clone().add(new THREE.Vector3(-sx * m.outboard, m.r * 0.15, 0)), 0.085, brace, sx);
    parts.push(mesh(join(legGeo), pm.strut));
    const wg = wheel(m.r, m.w);
    wg.tire.translate(axle.x, axle.y, axle.z);
    wg.hub.translate(axle.x, axle.y, axle.z);
    parts.push(mesh(wg.tire, pm.tire), mesh(wg.hub, pm.hub));
    // outer door on the leg
    const d = roundBox(0.016, 0.62, 0.8, 0.008);
    d.translate(top.x + sx * 0.16, top.y - 0.36, (top.z + axle.z) / 2 - 0.05);
    parts.push(mesh(d, doorMat));
    const axis = m.retract === 'inward' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const deg = m.retract === 'inward' ? -95 * sx : m.retract === 'forward' ? 95 : -95;
    v.addGearLeg(parts, top, axis, deg);
    // bay door that stays open next to the bay (hidden when the gear is up)
    const bay = roundBox(0.016, 0.42, 1.1, 0.008);
    bay.translate(0, 0, 0);
    const bm = mesh(bay, doorMat);
    bm.position.set(top.x - sx * 0.4, top.y - 0.21, top.z + 0.1);
    v.addGearLeg([bm], new THREE.Vector3(top.x - sx * 0.35, top.y, top.z + 0.1), new THREE.Vector3(0, 0, 1), 88 * sx, [], false);
  }
}

export { join };
