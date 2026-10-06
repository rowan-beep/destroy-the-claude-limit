// Starship and Super Heavy, at full scale (metres, +Y along the vehicle, the
// engine exits at y = 0 of each stage).
//
// Ship (52.1 m, 9 m across): a stainless-steel barrel welded from 1.8 m
// rings, the ogive nose, and the black hexagonal heat-shield tiles over the
// windward half with their jagged edge; two forward and two aft flaps on
// their hinge aerocovers (tiled on the windward face), the leeward raceway,
// three sea-level and three vacuum Raptors under the skirt, and the six legs
// of the Mars ship. Super Heavy (72.3 m): the barrel, the vented hot-staging
// ring, three grid fins, four chines, the raceways and 33 Raptors in rings of
// 3, 10 and 20.

import * as THREE from 'three';

const R = 4.5;
const RING = 1.83;

// ------------------------------------------------------------------ textures
function rnd(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** brushed stainless: ring welds, panel seams, streaks, a little heat tint low down */
function steelTextures(height: number, seed: number): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const W = 1024, H = Math.min(4096, Math.round((height / (2 * Math.PI * R)) * 1024));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const r = document.createElement('canvas');
  r.width = W;
  r.height = H;
  const gr = r.getContext('2d')!;
  const rand = rnd(seed);
  const pxPerM = H / height;
  // each ring a slightly different sheet
  for (let y = 0; y < height; y += RING) {
    const t = 200 + Math.floor(rand() * 26);
    g.fillStyle = `rgb(${t},${t + 2},${t + 5})`;
    const y0 = H - (y + RING) * pxPerM;
    g.fillRect(0, y0, W, RING * pxPerM + 1);
    const rr = 70 + Math.floor(rand() * 40);
    gr.fillStyle = `rgb(${rr},${rr},${rr})`;
    gr.fillRect(0, y0, W, RING * pxPerM + 1);
    // vertical seams where the sheets of a ring meet
    for (let k = 0; k < 3; k++) {
      const x = rand() * W;
      g.fillStyle = 'rgba(90,92,96,0.35)';
      g.fillRect(x, y0, 1.5, RING * pxPerM);
    }
  }
  // brushing: long faint vertical streaks
  for (let i = 0; i < 2400; i++) {
    const x = rand() * W, y = rand() * H, l = 20 + rand() * 160;
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(60,60,64,0.05)';
    g.fillRect(x, y, 1, l);
  }
  // weld beads between rings: a dark line with a bright edge
  for (let y = RING; y < height; y += RING) {
    const py = H - y * pxPerM;
    g.fillStyle = 'rgba(70,64,58,0.8)';
    g.fillRect(0, py - 1, W, 2);
    g.fillStyle = 'rgba(255,250,240,0.35)';
    g.fillRect(0, py + 1, W, 1);
    gr.fillStyle = 'rgb(160,160,160)';
    gr.fillRect(0, py - 1, W, 3);
  }
  // grime and heat tint toward the bottom
  const grad = g.createLinearGradient(0, H, 0, H - 10 * pxPerM);
  grad.addColorStop(0, 'rgba(70,52,40,0.45)');
  grad.addColorStop(1, 'rgba(70,52,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, H - 10 * pxPerM, W, 10 * pxPerM);
  // small hardware: ports, bolts
  for (let i = 0; i < 160; i++) {
    const x = rand() * W, y = rand() * H;
    g.fillStyle = 'rgba(40,40,44,0.6)';
    g.fillRect(x, y, 3 + rand() * 6, 2 + rand() * 4);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const rough = new THREE.CanvasTexture(r);
  return { map, rough };
}

/**
 * The heat-shield tiles: hexagons over the windward half (around angle 0 =
 * +X), up to `top` metres; elsewhere transparent so the steel shows. The edge
 * follows whole tiles, so it is jagged like the real thing.
 */
function tileTexture(height: number, top: number, cover: number, seed: number): THREE.CanvasTexture {
  const W = 2048, H = Math.min(4096, Math.round((height / (2 * Math.PI * R)) * 2048));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const rand = rnd(seed);
  const circ = 2 * Math.PI * R;
  const tile = 0.32; // m across
  const sx = (W / circ) * tile, sy = (H / height) * tile * 0.866;
  const rows = Math.ceil(H / sy) + 2, cols = Math.ceil(W / sx) + 2;
  for (let j = 0; j < rows; j++) {
    const ym = height - (j * sy * height) / H;
    if (ym > top) continue;
    for (let i = 0; i < cols; i++) {
      const x = i * sx + (j % 2 ? sx / 2 : 0);
      const ang = (x / W) * 360; // 0..360 round the hull, 0 = +X
      const d = Math.abs(((ang + 180) % 360) - 180);
      // the edge wanders a little from tile to tile
      if (d > cover + (rand() - 0.5) * 6 && ym < top - 3) continue;
      const shade = 28 + Math.floor(rand() * 14);
      const odd = rand() < 0.004;
      g.fillStyle = odd ? 'rgb(170,168,160)' : `rgb(${shade},${shade},${shade + 2})`;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        g.lineTo(x + Math.cos(a) * sx * 0.565, j * sy + Math.sin(a) * sy * 0.655);
      }
      g.closePath();
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function gridFinTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(150,152,156)';
  g.fillRect(0, 0, 256, 256);
  g.clearRect(0, 0, 0, 0);
  // a lattice: the cells are holes
  g.globalCompositeOperation = 'destination-out';
  const n = 10;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      g.save();
      g.translate((i + 0.5) * (256 / n), (j + 0.5) * (256 / n));
      g.rotate(Math.PI / 4);
      g.fillRect(-8, -8, 16, 16);
      g.restore();
    }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgb(110,112,116)';
  g.lineWidth = 6;
  g.strokeRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------ shared parts
let mats: {
  steel: (h: number, seed: number) => THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  bell: THREE.MeshStandardMaterial;
  bellIn: THREE.MeshStandardMaterial;
  tileSolid: THREE.MeshStandardMaterial;
  grid: THREE.MeshStandardMaterial;
} | null = null;
function materials() {
  if (mats) return mats;
  const grid = new THREE.MeshStandardMaterial({ map: gridFinTexture(), color: 0xffffff, metalness: 0.9, roughness: 0.4, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide });
  mats = {
    steel: (h, seed) => {
      const t = steelTextures(h, seed);
      return new THREE.MeshStandardMaterial({ color: 0xffffff, map: t.map, roughnessMap: t.rough, metalness: 0.92, roughness: 0.42, envMapIntensity: 1.2 });
    },
    dark: new THREE.MeshStandardMaterial({ color: 0x232426, metalness: 0.3, roughness: 0.75 }),
    bell: new THREE.MeshStandardMaterial({ color: 0x6f6a66, metalness: 0.85, roughness: 0.4, side: THREE.DoubleSide }),
    bellIn: new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: 0.6, roughness: 0.6, side: THREE.BackSide }),
    tileSolid: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.1, roughness: 0.85 }),
    grid,
  };
  return mats;
}

/** a hull of revolution from [radius, y] points, with cylindrical UVs */
function hull(profile: [number, number][], segs = 96): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs);
  // u round the hull from +X, v by height
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  let ymin = Infinity, ymax = -Infinity;
  for (const [, y] of profile) {
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let a = Math.atan2(-z, x) / (2 * Math.PI);
    if (a < 0) a += 1;
    uv.setXY(i, a, (y - ymin) / (ymax - ymin));
  }
  return g;
}

/** a Raptor: bell (and a short powerhead) with its exit at y = 0, pointing down */
function raptor(exitR: number, len: number): THREE.Group {
  const m = materials();
  const g = new THREE.Group();
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = 0.28 * exitR + (exitR - 0.28 * exitR) * Math.pow(t, 0.6);
    prof.push(new THREE.Vector2(r, len * (1 - t)));
  }
  const bellG = new THREE.LatheGeometry(prof, 28);
  g.add(new THREE.Mesh(bellG, m.bell));
  const inner = new THREE.Mesh(bellG, m.bellIn);
  inner.scale.setScalar(0.985);
  g.add(inner);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(exitR * 0.33, exitR * 0.42, len * 0.5, 14), m.dark);
  head.position.y = len * 1.2;
  g.add(head);
  return g;
}

export interface FlapRig {
  pivot: THREE.Object3D;
  /** rotation axis in the pivot's parent frame */
  axis: THREE.Vector3;
  /** angle folded flat (rad) and swept out for the belly-flop */
  rest: number;
  out: number;
}

export interface ShipRig {
  group: THREE.Group;
  flaps: FlapRig[];
  legs: { pivot: THREE.Object3D; out: number }[];
  /** engine exits (stage frame) for the plumes: sea-level then vacuum */
  engines: { pos: THREE.Vector3; vac: boolean }[];
}

/** a flap built as a plate: root hinge line along the hull, plate extending away from it */
function buildFlap(hingeA: THREE.Vector3, hingeB: THREE.Vector3, outward: THREE.Vector3, rootLen: number, tipLen: number, span: number, belly: THREE.Vector3, steel: THREE.Material): { pivot: THREE.Group; axis: THREE.Vector3 } {
  const m = materials();
  const pivot = new THREE.Group();
  pivot.position.copy(hingeA);
  const along = hingeB.clone().sub(hingeA).normalize();
  // the plate in local coordinates: u along the hinge, w outward
  const geo = new THREE.BufferGeometry();
  const L = hingeB.distanceTo(hingeA);
  const u0 = 0, u1 = Math.min(L, rootLen);
  const t0 = (rootLen - tipLen) * 0.7, t1 = t0 + tipLen;
  const quad = [
    [u0, 0], [u1, 0], [t1, span], [t0, span],
  ];
  const th = 0.22;
  const verts: number[] = [];
  const P = (u: number, w: number, s: number) => {
    const v = along.clone().multiplyScalar(u).addScaledVector(outward, w).addScaledVector(belly, s);
    verts.push(v.x, v.y, v.z);
  };
  // two faces and the edges, as triangles
  const face = (s: number, flipF: boolean) => {
    const idx = flipF ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const k of idx) P(quad[k][0], quad[k][1], s);
  };
  face(th / 2, false);
  face(-th / 2, true);
  for (let k = 0; k < 4; k++) {
    const a = quad[k], b = quad[(k + 1) % 4];
    P(a[0], a[1], th / 2);
    P(b[0], b[1], -th / 2);
    P(b[0], b[1], th / 2);
    P(a[0], a[1], th / 2);
    P(a[0], a[1], -th / 2);
    P(b[0], b[1], -th / 2);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const steelMesh = new THREE.Mesh(geo, steel);
  steelMesh.castShadow = true;
  pivot.add(steelMesh);
  // tiles on the windward face
  const tg = new THREE.BufferGeometry();
  const tv: number[] = [];
  for (const k of [0, 1, 2, 0, 2, 3]) {
    const v = along.clone().multiplyScalar(quad[k][0]).addScaledVector(outward, quad[k][1]).addScaledVector(belly, th / 2 + 0.03);
    tv.push(v.x, v.y, v.z);
  }
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tv, 3));
  tg.computeVertexNormals();
  pivot.add(new THREE.Mesh(tg, m.tileSolid));
  return { pivot, axis: along };
}

/** the ship; the belly (heat shield) faces +X */
export function buildShip(withLegs = true): ShipRig {
  const m = materials();
  const H = 52.1;
  const group = new THREE.Group();
  const steel = m.steel(H, 7);
  // hull: barrel to y = 33, ogive nose to the tip
  // open at the bottom: the engines are seen from below
  const prof: [number, number][] = [[R, 0]];
  for (let y = 0.5; y <= 33; y += 0.5) prof.push([R, y]);
  const nose = 52.1 - 33;
  for (let i = 1; i <= 40; i++) {
    const t = i / 40;
    // tangent ogive with a rounded tip
    const r = R * Math.sqrt(Math.max(0, 1 - Math.pow(t, 1.9))) ;
    prof.push([Math.max(0.12, r * (1 - 0.06 * t)), 33 + nose * t]);
  }
  prof.push([0.001, H]);
  const hullGeo = hull(prof);
  const hullMesh = new THREE.Mesh(hullGeo, steel);
  hullMesh.castShadow = hullMesh.receiveShadow = true;
  group.add(hullMesh);
  // tiles: a shell just outside the hull, windward half and the whole nose tip
  const tileProf = prof.map(([r, y]) => [r + 0.035, y] as [number, number]);
  const tiles = new THREE.Mesh(hull(tileProf), new THREE.MeshStandardMaterial({ map: tileTexture(H, 52, 98, 3), transparent: true, alphaTest: 0.5, metalness: 0.05, roughness: 0.85 }));
  tiles.receiveShadow = true;
  group.add(tiles);
  // the nose tip is fully tiled
  const tipProf = prof.filter(([, y]) => y > 48.5).map(([r, y]) => [r + 0.04, y] as [number, number]);
  tipProf.unshift([0, 48.5]);
  group.add(new THREE.Mesh(hull(tipProf, 48), m.tileSolid));
  // the aft heat shield under the skirt
  const shield = new THREE.Mesh(new THREE.CircleGeometry(R - 0.05, 48), m.dark);
  shield.rotation.x = Math.PI / 2;
  shield.position.y = 2.2;
  group.add(shield);
  // engines: three sea-level Raptors inside, three vacuum bells outside them
  const engines: ShipRig['engines'] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const e = raptor(0.65, 2.0);
    e.position.set(Math.cos(a) * 1.05, 0.15, Math.sin(a) * 1.05);
    group.add(e);
    engines.push({ pos: new THREE.Vector3(e.position.x, 0.15, e.position.z), vac: false });
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 3;
    const e = raptor(1.15, 3.0);
    e.position.set(Math.cos(a) * 3.0, 0.05, Math.sin(a) * 3.0);
    group.add(e);
    engines.push({ pos: new THREE.Vector3(e.position.x, 0.05, e.position.z), vac: true });
  }
  // the leeward raceway and its conduit
  const race = new THREE.Mesh(new THREE.BoxGeometry(0.4, 30, 0.7), steel);
  race.position.set(-R - 0.18, 18, 0);
  group.add(race);
  // flaps: forward pair on the nose, aft pair low on the barrel, at the sides (+-Z)
  const belly = new THREE.Vector3(1, 0, 0);
  const flaps: FlapRig[] = [];
  const nr = (y: number) => {
    // hull radius at a height (for the hinge lines on the nose)
    if (y <= 33) return R;
    const t = (y - 33) / nose;
    return R * Math.sqrt(Math.max(0, 1 - Math.pow(t, 1.9))) * (1 - 0.06 * t);
  };
  for (const side of [1, -1]) {
    const out = new THREE.Vector3(0, 0, side);
    // aft flap: hinge 1.5..13.5 m, 5.5 m span
    {
      const a = new THREE.Vector3(0, 1.5, side * (R + 0.05)), b = new THREE.Vector3(0, 13.5, side * (R + 0.05));
      const f = buildFlap(a, b, out, 12, 8, 4.9, belly, steel);
      group.add(f.pivot);
      flaps.push({ pivot: f.pivot, axis: f.axis.clone().multiplyScalar(side), rest: 0, out: 0 });
      // the hinge aerocover
      const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 12.5, 12, 1, false, 0, Math.PI), steel);
      cover.position.set(0, 7.5, side * R);
      cover.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      group.add(cover);
    }
    // forward flap: hinge along the nose from y 38 to 46.5
    {
      const a = new THREE.Vector3(0, 38, side * (nr(38) + 0.02)), b = new THREE.Vector3(0, 46.5, side * (nr(46.5) + 0.02));
      const dir = b.clone().sub(a).normalize();
      const o = new THREE.Vector3(0, -dir.z * side, dir.y * side).normalize();
      if (o.z * side < 0) o.multiplyScalar(-1);
      const f = buildFlap(a, b, o, 8.5, 5.0, 3.6, belly, steel);
      group.add(f.pivot);
      flaps.push({ pivot: f.pivot, axis: f.axis.clone().multiplyScalar(side), rest: 0, out: 0 });
    }
  }
  // the Mars legs: six struts that swing out of the skirt
  const legs: ShipRig['legs'] = [];
  if (withLegs) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const piv = new THREE.Group();
      piv.position.set(Math.cos(a) * (R - 0.2), 8.5, Math.sin(a) * (R - 0.2));
      piv.rotation.y = -a;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9.2, 0.5), m.dark);
      leg.position.set(0, -4.6, 0);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.25, 12), m.dark);
      foot.position.set(0, -9.2, 0);
      piv.add(leg, foot);
      group.add(piv);
      legs.push({ pivot: piv, out: 0 });
    }
  }
  return { group, flaps, legs, engines };
}

export interface BoosterRig {
  group: THREE.Group;
  engines: THREE.Vector3[];
  fins: THREE.Object3D[];
}

export function buildBooster(): BoosterRig {
  const m = materials();
  const H = 72.3;
  const group = new THREE.Group();
  const steel = m.steel(H, 11);
  const prof: [number, number][] = [[R, 0]];
  for (let y = 0.5; y <= 69.6; y += 0.5) prof.push([R, y]);
  prof.push([R, 69.6], [0.001, 69.6]);
  const body = new THREE.Mesh(hull(prof), steel);
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  // the vented hot-staging ring on top
  const ring = new THREE.Group();
  const ringC = document.createElement('canvas');
  ringC.width = 1024;
  ringC.height = 128;
  const rg = ringC.getContext('2d')!;
  rg.fillStyle = 'rgb(196,198,202)';
  rg.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 48; i++) {
    rg.fillStyle = 'rgb(28,28,30)';
    rg.fillRect(i * (1024 / 48) + 4, 26, 1024 / 48 - 8, 76);
  }
  const ringTex = new THREE.CanvasTexture(ringC);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  const ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 2.7, 96, 1, true), new THREE.MeshStandardMaterial({ map: ringTex, metalness: 0.85, roughness: 0.45, side: THREE.DoubleSide }));
  ringMesh.position.y = 69.6 + 1.35;
  ring.add(ringMesh);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.98, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  dome.scale.y = 0.35;
  dome.position.y = 69.6;
  ring.add(dome);
  group.add(ring);
  // three grid fins high on the barrel, folded out
  const fins: THREE.Object3D[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    const f = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 4.2), m.grid);
    const piv = new THREE.Group();
    piv.position.set(Math.cos(a) * R, 65.8, Math.sin(a) * R);
    piv.rotation.y = -a;
    f.position.set(2.7, 0, 0);
    piv.add(f);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 1.4), steel);
    arm.position.set(0.3, 0, 0);
    piv.add(arm);
    group.add(piv);
    fins.push(piv);
  }
  // chines low on the barrel
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 14, 0.25), steel);
    ch.position.set(Math.cos(a) * (R + 0.3), 13, Math.sin(a) * (R + 0.3));
    ch.rotation.y = -a;
    group.add(ch);
  }
  // raceways
  for (const a of [Math.PI * 0.95, Math.PI * 1.05]) {
    const rw = new THREE.Mesh(new THREE.BoxGeometry(0.45, 60, 0.6), steel);
    rw.position.set(Math.cos(a) * (R + 0.2), 36, Math.sin(a) * (R + 0.2));
    rw.rotation.y = -a;
    group.add(rw);
  }
  // the engine section: a dark aft skirt and 33 Raptors (3 + 10 + 20)
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 4, 96, 1, true), m.dark);
  skirt.position.y = 2.5;
  group.add(skirt);
  const plate = new THREE.Mesh(new THREE.CircleGeometry(R, 64), m.dark);
  plate.rotation.x = Math.PI / 2;
  plate.position.y = 2.6;
  group.add(plate);
  const engines: THREE.Vector3[] = [];
  const ringOf = (n: number, rr: number, off: number) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + off;
      const e = raptor(0.62, 2.2);
      e.position.set(Math.cos(a) * rr, 0.2, Math.sin(a) * rr);
      group.add(e);
      engines.push(new THREE.Vector3(e.position.x, 0.2, e.position.z));
    }
  };
  ringOf(3, 0.95, 0);
  ringOf(10, 2.55, 0.1);
  ringOf(20, 3.85, 0);
  return { group, engines, fins };
}

/** update the ship's flaps (0 folded .. 1 out) and legs (0 stowed .. 1 down) */
export function poseShip(rig: ShipRig, flaps: number, legs: number): void {
  for (const f of rig.flaps) f.pivot.quaternion.setFromAxisAngle(f.axis, (f.rest + (0.55 - 0.35 * flaps)) * -0.6);
  for (const l of rig.legs) l.pivot.rotation.z = -legs * 0.42;
}

/** the orbital launch mount and the tower beside it (ground frame, +Y up) */
export function buildPad(): THREE.Group {
  const g = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.95 });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x55585c, metalness: 0.6, roughness: 0.55 });
  const steelLight = new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.7, roughness: 0.45 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: 0x6e7454, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  g.add(ground);
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(70, 75, 1.2, 64), concrete);
  slab.position.y = 0.3;
  g.add(slab);
  // the launch mount: a steel table on six legs with the deluge plate
  const table = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 3, 40, 1, true), steelDark);
  table.position.y = 20;
  g.add(table);
  const ringTop = new THREE.Mesh(new THREE.TorusGeometry(7.5, 1.0, 10, 40), steelDark);
  ringTop.rotation.x = Math.PI / 2;
  ringTop.position.y = 21.5;
  g.add(ringTop);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 20, 2.2), concrete);
    leg.position.set(Math.cos(a) * 10, 10, Math.sin(a) * 10);
    g.add(leg);
  }
  // the tower: a square lattice 145 m tall with the catch arms
  const tower = new THREE.Group();
  const T = 145, S = 12;
  for (const [x, z] of [[-S / 2, -S / 2], [S / 2, -S / 2], [S / 2, S / 2], [-S / 2, S / 2]]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.4, T, 1.4), steelLight);
    col.position.set(x, T / 2, z);
    tower.add(col);
  }
  for (let y = 8; y < T; y += 8) {
    for (const [ax, az, w, d] of [[0, -S / 2, S, 0.6], [0, S / 2, S, 0.6], [-S / 2, 0, 0.6, S], [S / 2, 0, 0.6, S]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), steelLight);
      b.position.set(ax, y, az);
      tower.add(b);
    }
    // diagonals
    const dg = new THREE.Mesh(new THREE.BoxGeometry(0.4, Math.hypot(8, S), 0.4), steelLight);
    dg.position.set(-S / 2, y - 4, 0);
    dg.rotation.x = Math.atan2(S, 8);
    tower.add(dg);
  }
  // the chopsticks
  for (const sz of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 34), steelDark);
    arm.position.set(10, 118, sz * 8);
    arm.rotation.y = sz * 0.35;
    tower.add(arm);
  }
  // the ship quick-disconnect arm
  const qd = new THREE.Mesh(new THREE.BoxGeometry(14, 2.4, 2.4), steelDark);
  qd.position.set(7, 98, 0);
  tower.add(qd);
  tower.position.set(-24, 0, 0);
  g.add(tower);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
