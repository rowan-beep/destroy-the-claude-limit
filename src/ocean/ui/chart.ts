// The chart: the survey area as a dark nautical chart (shaded depths, 20 m
// contours, the coast and the harbor), with everything the Echo Atlas holds
// drawn on it: past routes, the bearings taken from each listening position as
// wedges, the search areas where they cross, confirmed sites, markers. The same
// drawing serves the menu's CHART page, the full chart in a dive and the
// minimap.

import { WORLD, HARBOR, REGIONS, seabedHeight } from '../world/geo';
import type { AtlasData } from '../atlas/atlas';

export interface ChartView {
  /** centre of the view (world m) */
  cx: number;
  cz: number;
  /** pixels per metre */
  k: number;
}

export interface ChartOverlay {
  sub?: { x: number; z: number; heading: number } | null;
  /** the route of the dive under way */
  route?: [number, number, number][];
  /** the current task's point or area (when guidance shows it) */
  guide?: { kind: 'point' | 'area'; x: number; z: number; r?: number; label: string } | null;
  /** the bearing being taken right now (an unfinished wedge) */
  live?: { x: number; z: number; bearing: number; halfWidth: number } | null;
  /** fade older routes */
  pastRoutes?: boolean;
  /** draw labels (off on the minimap) */
  labels?: boolean;
}

const CELL = 12;
let base: HTMLCanvasElement | null = null;

/** the shaded depth chart of the whole area, made once (about 100k depth samples) */
export function chartBase(): HTMLCanvasElement {
  if (base) return base;
  const w = Math.round((WORLD.maxX - WORLD.minX) / CELL), h = Math.round((WORLD.maxZ - WORLD.minZ) / CELL);
  const hs = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) hs[j * w + i] = seabedHeight(WORLD.minX + (i + 0.5) * CELL, WORLD.minZ + (j + 0.5) * CELL);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const ramp: [number, [number, number, number]][] = [
    [0, [52, 120, 132]],
    [-10, [34, 96, 118]],
    [-30, [24, 72, 104]],
    [-80, [16, 50, 84]],
    [-160, [11, 34, 64]],
    [-400, [7, 20, 42]],
  ];
  const at = (i: number, j: number) => hs[Math.max(0, Math.min(h - 1, j)) * w + Math.max(0, Math.min(w - 1, i))];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const z = at(i, j);
      let r: number, gg: number, b: number;
      if (z > 0.3) {
        // land: dark olive, lighter with height
        const k = Math.min(1, z / 40);
        r = 58 + 30 * k;
        gg = 62 + 26 * k;
        b = 44 + 14 * k;
      } else {
        let a = ramp[ramp.length - 1][1], bb = a, t = 0;
        for (let q = 0; q < ramp.length - 1; q++) {
          if (z <= ramp[q][0] && z > ramp[q + 1][0]) {
            a = ramp[q][1];
            bb = ramp[q + 1][1];
            t = (ramp[q][0] - z) / (ramp[q][0] - ramp[q + 1][0]);
            break;
          }
        }
        r = a[0] + (bb[0] - a[0]) * t;
        gg = a[1] + (bb[1] - a[1]) * t;
        b = a[2] + (bb[2] - a[2]) * t;
      }
      // hillshade from the north-west
      const dx = at(i + 1, j) - at(i - 1, j), dz = at(i, j + 1) - at(i, j - 1);
      const sh = Math.max(-0.35, Math.min(0.35, (-dx - dz) * 0.02));
      r *= 1 + sh;
      gg *= 1 + sh;
      b *= 1 + sh;
      // contours every 20 m (and the coastline)
      const band = (v: number) => Math.floor(v / 20);
      const cl = z < 0.3 && (band(at(i + 1, j)) !== band(z) || band(at(i, j + 1)) !== band(z));
      const coast = (z > 0.3) !== (at(i + 1, j) > 0.3) || (z > 0.3) !== (at(i, j + 1) > 0.3);
      if (coast) {
        r = 200;
        gg = 190;
        b = 150;
      } else if (cl) {
        r = r * 0.7 + 90 * 0.3;
        gg = gg * 0.7 + 150 * 0.3;
        b = b * 0.7 + 170 * 0.3;
      }
      const o = (j * w + i) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  base = c;
  return c;
}

/** the view that fits a box of the world into a canvas */
export function fitView(w: number, h: number, minX: number, maxX: number, minZ: number, maxZ: number): ChartView {
  const k = Math.min(w / (maxX - minX), h / (maxZ - minZ));
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, k };
}

const STATUS_COL: Record<string, string> = { heard: '#ffbf5e', bearing: '#ffbf5e', located: '#ff9f5a', confirmed: '#6fe3d0' };

/** draw the chart into a canvas (CSS pixels; the canvas is sized for the device) */
export function drawChart(cv: HTMLCanvasElement, view: ChartView, atlas: AtlasData, o: ChartOverlay = {}): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || cv.width, H = cv.clientHeight || cv.height;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#06101c';
  g.fillRect(0, 0, W, H);
  const px = (x: number) => W / 2 + (x - view.cx) * view.k;
  const pz = (z: number) => H / 2 + (z - view.cz) * view.k;
  const labels = o.labels !== false;
  // the shaded depths
  const b = chartBase();
  g.imageSmoothingEnabled = true;
  g.drawImage(b, px(WORLD.minX), pz(WORLD.minZ), (WORLD.maxX - WORLD.minX) * view.k, (WORLD.maxZ - WORLD.minZ) * view.k);
  // a 500 m grid
  g.strokeStyle = 'rgba(160,210,230,0.08)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = Math.ceil(WORLD.minX / 500) * 500; x <= WORLD.maxX; x += 500) {
    g.moveTo(px(x), pz(WORLD.minZ));
    g.lineTo(px(x), pz(WORLD.maxZ));
  }
  for (let z = Math.ceil(WORLD.minZ / 500) * 500; z <= WORLD.maxZ; z += 500) {
    g.moveTo(px(WORLD.minX), pz(z));
    g.lineTo(px(WORLD.maxX), pz(z));
  }
  g.stroke();
  // the harbor: basin, gate and berth
  const hb = HARBOR.basin;
  g.strokeStyle = 'rgba(230,220,180,0.55)';
  g.setLineDash([4, 3]);
  g.strokeRect(px(hb.minX), pz(hb.minZ), (hb.maxX - hb.minX) * view.k, (hb.maxZ - hb.minZ) * view.k);
  g.setLineDash([]);
  g.fillStyle = '#e8dcae';
  g.fillRect(px(HARBOR.berth.x) - 2, pz(HARBOR.berth.z) - 2, 4, 4);
  g.strokeStyle = '#ff6b6b';
  g.beginPath();
  g.moveTo(px(HARBOR.gate.x - HARBOR.gate.halfWidth), pz(HARBOR.gate.z));
  g.lineTo(px(HARBOR.gate.x - HARBOR.gate.halfWidth + 6), pz(HARBOR.gate.z));
  g.stroke();
  g.strokeStyle = '#6bff9b';
  g.beginPath();
  g.moveTo(px(HARBOR.gate.x + HARBOR.gate.halfWidth), pz(HARBOR.gate.z));
  g.lineTo(px(HARBOR.gate.x + HARBOR.gate.halfWidth - 6), pz(HARBOR.gate.z));
  g.stroke();
  g.font = '600 10.5px Inter, "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  if (labels) {
    // regions: named once visited (the harbor always)
    for (const r of REGIONS) {
      if (r.id !== 'harbor' && !atlas.visited.includes(r.id)) continue;
      g.fillStyle = 'rgba(200,230,240,0.55)';
      g.fillText(r.name, px(r.x), pz(r.z) - 8);
      g.fillStyle = 'rgba(200,230,240,0.35)';
      g.fillText(r.band, px(r.x), pz(r.z) + 4);
    }
  }
  // past routes
  if (o.pastRoutes !== false) {
    g.strokeStyle = 'rgba(180,220,255,0.22)';
    g.lineWidth = 1;
    for (const t of atlas.tracks) {
      g.beginPath();
      t.points.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
      g.stroke();
    }
  }
  // bearings: a wedge from each listening position
  const wedge = (x: number, z: number, br: number, hw: number, fill: string, line: string) => {
    const L = 1600;
    const a0 = ((br - hw) * Math.PI) / 180, a1 = ((br + hw) * Math.PI) / 180, am = (br * Math.PI) / 180;
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(px(x), pz(z));
    g.lineTo(px(x + Math.sin(a0) * L), pz(z - Math.cos(a0) * L));
    g.lineTo(px(x + Math.sin(a1) * L), pz(z - Math.cos(a1) * L));
    g.closePath();
    g.fill();
    g.strokeStyle = line;
    g.setLineDash([5, 4]);
    g.beginPath();
    g.moveTo(px(x), pz(z));
    g.lineTo(px(x + Math.sin(am) * L), pz(z - Math.cos(am) * L));
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = line;
    g.beginPath();
    g.arc(px(x), pz(z), 3, 0, Math.PI * 2);
    g.fill();
  };
  for (const ob of atlas.observations) wedge(ob.x, ob.z, ob.bearing, ob.halfWidth, 'rgba(255,210,122,0.10)', 'rgba(255,210,122,0.75)');
  if (o.live) wedge(o.live.x, o.live.z, o.live.bearing, o.live.halfWidth, 'rgba(124,240,200,0.12)', 'rgba(124,240,200,0.8)');
  // contacts: search areas and confirmed sites
  for (const c of atlas.contacts) {
    const col = STATUS_COL[c.status] ?? '#fff';
    if (c.site) {
      const x = px(c.site.x), z = pz(c.site.z);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x, z - 6);
      g.lineTo(x + 6, z);
      g.lineTo(x, z + 6);
      g.lineTo(x - 6, z);
      g.closePath();
      g.fill();
      if (labels) {
        g.fillStyle = '#dff';
        g.fillText(c.label, x, z - 10);
        g.fillStyle = 'rgba(220,255,250,0.6)';
        g.fillText(`${Math.round(c.site.depth)} M`, x, z + 16);
      }
    } else if (c.estimate) {
      const e = c.estimate;
      g.strokeStyle = col;
      g.setLineDash([6, 4]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(px(e.x), pz(e.z), Math.max(4, e.r * view.k), 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 1;
      if (labels) {
        g.fillStyle = col;
        g.fillText(`SEARCH AREA · ${c.label}`, px(e.x), pz(e.z) - e.r * view.k - 6);
      }
    }
  }
  // markers
  for (const m of atlas.markers) {
    g.strokeStyle = '#cfe';
    g.strokeRect(px(m.x) - 3, pz(m.z) - 3, 6, 6);
    if (labels) {
      g.fillStyle = '#cfe';
      g.fillText(m.text, px(m.x), pz(m.z) - 8);
    }
  }
  // the guide
  if (o.guide) {
    const gd = o.guide;
    g.strokeStyle = '#6fe3d0';
    g.fillStyle = '#6fe3d0';
    if (gd.kind === 'area' && gd.r) {
      g.globalAlpha = 0.6;
      g.beginPath();
      g.arc(px(gd.x), pz(gd.z), gd.r * view.k, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    } else {
      g.beginPath();
      g.arc(px(gd.x), pz(gd.z), 5, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(px(gd.x), pz(gd.z), 1.5, 0, Math.PI * 2);
      g.fill();
    }
    if (labels) g.fillText(gd.label, px(gd.x), pz(gd.z) + 16);
  }
  // this dive's route and the boat
  if (o.route && o.route.length > 1) {
    g.strokeStyle = 'rgba(124,240,200,0.75)';
    g.lineWidth = 1.5;
    g.beginPath();
    o.route.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
    if (o.sub) g.lineTo(px(o.sub.x), pz(o.sub.z));
    g.stroke();
    g.lineWidth = 1;
  }
  if (o.sub) {
    const s = o.sub;
    const a = (s.heading * Math.PI) / 180;
    g.save();
    g.translate(px(s.x), pz(s.z));
    g.rotate(a);
    g.fillStyle = '#ffe17a';
    g.strokeStyle = '#000';
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 7);
    g.lineTo(0, 3);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
  // north arrow and the scale bar
  g.fillStyle = 'rgba(220,240,255,0.8)';
  g.strokeStyle = 'rgba(220,240,255,0.8)';
  g.textAlign = 'left';
  g.fillText('N ↑', 10, 16);
  const steps = [50, 100, 200, 500, 1000, 2000];
  const want = W * 0.18;
  let s = steps[0];
  for (const v of steps) if (v * view.k <= want) s = v;
  g.beginPath();
  g.moveTo(10, H - 12);
  g.lineTo(10 + s * view.k, H - 12);
  g.moveTo(10, H - 16);
  g.lineTo(10, H - 8);
  g.moveTo(10 + s * view.k, H - 16);
  g.lineTo(10 + s * view.k, H - 8);
  g.stroke();
  g.fillText(s >= 1000 ? `${s / 1000} KM` : `${s} M`, 14 + s * view.k, H - 8);
}

/** screen → world on a chart (for clicks) */
export function chartToWorld(view: ChartView, w: number, h: number, sx: number, sy: number): { x: number; z: number } {
  return { x: view.cx + (sx - w / 2) / view.k, z: view.cz + (sy - h / 2) / view.k };
}
