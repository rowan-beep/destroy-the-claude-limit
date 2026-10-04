// The Saturn V at full scale (110.6 m), built from the stack up: the S-IC with
// five F-1 engines, four fins and engine fairings; the S-II on its interstage;
// the S-IVB above its conical adapter; the Instrument Unit ring; the Apollo
// spacecraft (lunar module adapter, service module, command module under its
// boost cover) and the launch escape tower. Paint follows the Apollo-era
// vehicles: white with the black-and-white roll pattern, "USA" down the first
// stage, "UNITED STATES" and the flag. The origin is the base of the first
// stage, on its centreline; +y is up and the painted side faces +z.

import * as THREE from 'three';

const R1 = 5.03; // S-IC and S-II radius
const R3 = 3.3; // S-IVB and Instrument Unit
const RSM = 1.96; // service and command module
const RED = '#c8102e';

/** where the painted letters and flag face, as a fraction round the body (0 = +z) */
export const SATURN_FRONT = 0.95;

interface Painter {
  g: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** pixels per metre up the section */
  pm: number;
  /** canvas row for a height (metres above the section's base) */
  yAt(m: number): number;
}

function skin(radius: number, height: number, draw: (p: Painter) => void, bumpDraw?: (p: Painter) => void): { map: THREE.CanvasTexture; bump?: THREE.CanvasTexture } {
  const W = 1024;
  const pm = W / (2 * Math.PI * Math.max(radius, 0.5));
  const H = Math.min(4096, Math.max(64, Math.round(height * pm)));
  const pmY = H / height;
  const make = (fn: (p: Painter) => void, bg: string) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    fn({ g, W, H, pm: pmY, yAt: (m) => H - m * pmY });
    return c;
  };
  const map = new THREE.CanvasTexture(make(draw, '#efede7'));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  let bump: THREE.CanvasTexture | undefined;
  if (bumpDraw) {
    bump = new THREE.CanvasTexture(make(bumpDraw, '#808080'));
    bump.anisotropy = 8;
  }
  return { map, bump };
}

/** alternating black and white panels round the body, a black one centred on `centre` */
function rollPattern(p: Painter, y0: number, y1: number, n = 8, centre = SATURN_FRONT, colour = '#141416'): void {
  p.g.fillStyle = colour;
  for (let k = 0; k < n; k += 2) {
    const u = centre + k / n - 0.5 / n;
    for (const w of [0, -1, 1]) {
      const x = (u + w) * p.W;
      p.g.fillRect(x, p.yAt(y1), p.W / n, p.yAt(y0) - p.yAt(y1));
    }
  }
}
/** a solid band all the way round */
function band(p: Painter, y0: number, y1: number, colour: string): void {
  p.g.fillStyle = colour;
  p.g.fillRect(0, p.yAt(y1), p.W, p.yAt(y0) - p.yAt(y1));
}
/** stringers or corrugations: fine vertical lines between two heights */
function stringers(p: Painter, y0: number, y1: number, spacing: number, light: string, dark: string): void {
  const step = Math.max(3, spacing * (p.W / 2048) * 4);
  for (let x = 0; x < p.W; x += step) {
    p.g.fillStyle = dark;
    p.g.fillRect(x, p.yAt(y1), step * 0.35, p.yAt(y0) - p.yAt(y1));
    p.g.fillStyle = light;
    p.g.fillRect(x + step * 0.45, p.yAt(y1), step * 0.25, p.yAt(y0) - p.yAt(y1));
  }
}
function ring(p: Painter, y: number, colour = 'rgba(0,0,0,0.18)', w = 2): void {
  p.g.fillStyle = colour;
  p.g.fillRect(0, p.yAt(y) - w / 2, p.W, w);
}
/** letters stacked one above another, reading top to bottom */
function vertical(p: Painter, text: string, u: number, yTop: number, letterH: number, colour = RED): void {
  const g = p.g;
  const px = letterH * p.pm;
  g.fillStyle = colour;
  g.font = `bold ${px}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  let y = p.yAt(yTop);
  for (const ch of text) {
    if (ch !== ' ') g.fillText(ch, u * p.W, y);
    y += px * 1.12;
  }
}
function flag(p: Painter, u: number, yC: number, w: number): void {
  const g = p.g;
  const W = w * p.pm, H = W * 0.53;
  const x0 = u * p.W - W / 2, y0 = p.yAt(yC) - H / 2;
  for (let i = 0; i < 13; i++) {
    g.fillStyle = i % 2 ? '#f4f3ef' : '#b22234';
    g.fillRect(x0, y0 + (i * H) / 13, W, H / 13 + 0.5);
  }
  g.fillStyle = '#3c3b6e';
  g.fillRect(x0, y0, W * 0.4, H * (7 / 13));
  g.fillStyle = '#f4f3ef';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < (r % 2 ? 5 : 6); c++) {
      const sx = x0 + (W * 0.4 * (c + (r % 2 ? 1 : 0.5))) / 6.2, sy = y0 + (H * (7 / 13) * (r + 0.7)) / 9.6;
      g.fillRect(sx - 1, sy - 1, 2.2, 2.2);
    }
  }
}
/** faint grime: soot and weathering streaks running down the white paint */
function weather(p: Painter, seed: number, amount = 1): void {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 160 * amount; i++) {
    p.g.fillStyle = `rgba(90,86,80,${r() * 0.05})`;
    p.g.fillRect(r() * p.W, r() * p.H, 1 + r() * 4, 20 + r() * 200);
  }
}

function section(group: THREE.Group, rBottom: number, rTop: number, y0: number, y1: number, tex: { map: THREE.CanvasTexture; bump?: THREE.CanvasTexture }, opts: { rough?: number; metal?: number; bumpScale?: number } = {}): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, y1 - y0, 160, 1, true);
  geo.translate(0, (y0 + y1) / 2, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: tex.map,
    bumpMap: tex.bump ?? null,
    bumpScale: opts.bumpScale ?? 0.6,
    roughness: opts.rough ?? 0.5,
    metalness: opts.metal ?? 0.12,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}

const around = (r: number, theta: number, y: number) => new THREE.Vector3(r * Math.sin(theta), y, r * Math.cos(theta));

function f1Engine(foil: THREE.Material, bell: THREE.Material, dark: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // thrust chamber in its silver insulation, then the nozzle extension
  const upper = new THREE.LatheGeometry([new THREE.Vector2(0.2, 0.2), new THREE.Vector2(0.62, 0.15), new THREE.Vector2(0.66, -0.55), new THREE.Vector2(0.5, -1.05), new THREE.Vector2(0.78, -1.7), new THREE.Vector2(1.18, -2.7), new THREE.Vector2(1.42, -3.45)], 40);
  const lower = new THREE.LatheGeometry([new THREE.Vector2(1.42, -3.45), new THREE.Vector2(1.62, -4.4), new THREE.Vector2(1.78, -5.2), new THREE.Vector2(1.88, -5.8), new THREE.Vector2(1.84, -5.82)], 40);
  const a = new THREE.Mesh(upper, foil);
  const b = new THREE.Mesh(lower, bell);
  for (const m of [a, b]) {
    m.castShadow = true;
    (m.material as THREE.Material).side = THREE.DoubleSide;
    g.add(m);
  }
  // turbine exhaust manifold round the bell, turbopump and gas generator on the side
  const manifold = new THREE.Mesh(new THREE.TorusGeometry(1.44, 0.16, 10, 40), dark);
  manifold.rotation.x = Math.PI / 2;
  manifold.position.y = -3.45;
  g.add(manifold);
  const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.6, 16), foil);
  pump.position.set(0.95, -0.7, 0);
  g.add(pump);
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 10), dark);
  duct.position.set(1.15, -2.2, 0);
  duct.rotation.z = 0.12;
  g.add(duct);
  return g;
}

export function buildSaturnV(): THREE.Group {
  const rocket = new THREE.Group();
  rocket.name = 'Saturn V';
  const C = SATURN_FRONT;
  const dark = new THREE.MeshStandardMaterial({ color: '#1d1e21', roughness: 0.6, metalness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: '#efede7', roughness: 0.5, metalness: 0.1 });
  const foil = new THREE.MeshStandardMaterial({ color: '#c9c6bd', roughness: 0.32, metalness: 0.9 });
  const bellMat = new THREE.MeshStandardMaterial({ color: '#2a2a2c', roughness: 0.45, metalness: 0.75 });
  const corr = (p: Painter, y0: number, y1: number) => stringers(p, y0, y1, 6, 'rgba(255,255,255,0.16)', 'rgba(0,0,0,0.12)');
  const corrB = (p: Painter, y0: number, y1: number) => stringers(p, y0, y1, 6, '#a0a0a0', '#5a5a5a');

  // ---- S-IC, 0 to 42 m
  section(
    rocket, R1, R1, 0, 21,
    skin(R1, 21, (p) => {
      weather(p, 11, 1.4);
      rollPattern(p, 0, 13);
      for (const off of [-1 / 8, 1 / 8]) vertical(p, 'USA', C + off, 12.2, 2.3);
      corr(p, 0, 6.2);
      ring(p, 6.2);
      for (let y = 7; y < 21; y += 2.2) ring(p, y, 'rgba(0,0,0,0.06)', 1);
    }, (p) => corrB(p, 0, 6.2)),
    { bumpScale: 0.8 },
  );
  section(rocket, R1, R1, 21, 25.5, skin(R1, 4.5, (p) => {
    rollPattern(p, 0, 4.5);
    corr(p, 0, 4.5);
    ring(p, 0.05, 'rgba(0,0,0,0.3)');
    ring(p, 4.45, 'rgba(0,0,0,0.3)');
  }, (p) => corrB(p, 0, 4.5)), { bumpScale: 1.2 });
  section(rocket, R1, R1, 25.5, 39.5, skin(R1, 14, (p) => {
    weather(p, 12);
    flag(p, C, 8.6, 3.0);
    for (let y = 1.5; y < 14; y += 2.3) ring(p, y, 'rgba(0,0,0,0.05)', 1);
  }));
  section(rocket, R1, R1, 39.5, 42, skin(R1, 2.5, (p) => {
    corr(p, 0, 2.5);
    ring(p, 0.05, 'rgba(0,0,0,0.3)');
  }, (p) => corrB(p, 0, 2.5)), { bumpScale: 1 });
  // base heat shield and the five F-1s
  const shield = new THREE.Mesh(new THREE.CircleGeometry(R1, 64), dark);
  shield.rotation.x = Math.PI / 2;
  shield.position.y = 0.02;
  rocket.add(shield);
  const engines: [number, number][] = [[0, 0], ...[0, 1, 2, 3].map((k) => [3.9, Math.PI / 4 + (k * Math.PI) / 2] as [number, number])];
  for (const [r, th] of engines) {
    const e = f1Engine(foil, bellMat, dark);
    e.position.copy(around(r, th, 0));
    e.rotation.y = th;
    rocket.add(e);
  }
  // engine fairings and fins on the four outboard engines
  const finShape = new THREE.Shape([new THREE.Vector2(R1 - 0.2, 7.2), new THREE.Vector2(R1 - 0.2, -0.7), new THREE.Vector2(9.0, -0.7), new THREE.Vector2(9.0, 1.3)]);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 });
  finGeo.translate(0, 0, -0.18);
  for (let k = 0; k < 4; k++) {
    const th = Math.PI / 4 + (k * Math.PI) / 2;
    const fairing = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 2.05, 9.4, 40, 1, false), white);
    fairing.position.copy(around(4.55, th, 3.9));
    fairing.castShadow = true;
    rocket.add(fairing);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.09, 8, 40), dark);
    lip.rotation.x = Math.PI / 2;
    lip.position.copy(around(4.55, th, -0.8));
    rocket.add(lip);
    const fin = new THREE.Mesh(finGeo, white);
    fin.rotation.y = th - Math.PI / 2;
    fin.castShadow = true;
    rocket.add(fin);
  }

  // ---- S-II on its interstage, 42 to 66.9 m
  section(rocket, R1, R1, 42, 47.6, skin(R1, 5.6, (p) => {
    rollPattern(p, 0, 5.6);
    corr(p, 0, 5.6);
    ring(p, 0.05, 'rgba(0,0,0,0.35)');
  }, (p) => corrB(p, 0, 5.6)), { bumpScale: 1 });
  for (let k = 0; k < 8; k++) {
    const th = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const ull = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 3.6, 12), white);
    ull.position.copy(around(R1 + 0.2, th, 44.6));
    rocket.add(ull);
  }
  section(rocket, R1, R1, 47.6, 65.6, skin(R1, 18, (p) => {
    weather(p, 21);
    vertical(p, 'UNITED STATES', C + 0.06, 16.6, 1.15);
    flag(p, C - 0.035, 15.2, 2.6);
    for (let y = 1.4; y < 18; y += 2.5) ring(p, y, 'rgba(0,0,0,0.05)', 1);
  }));
  section(rocket, R1, R1, 65.6, 66.9, skin(R1, 1.3, (p) => {
    rollPattern(p, 0, 1.3);
    corr(p, 0, 1.3);
  }, (p) => corrB(p, 0, 1.3)), { bumpScale: 1 });

  // ---- S-IVB: conical adapter, tank, forward skirt, 66.9 to 84.7 m
  section(rocket, R1, R3, 66.9, 72.0, skin((R1 + R3) / 2, 5.1, (p) => {
    rollPattern(p, 0, 2.4);
    corr(p, 0, 5.1);
    ring(p, 2.4, 'rgba(0,0,0,0.2)');
  }, (p) => corrB(p, 0, 5.1)), { bumpScale: 0.9 });
  section(rocket, R3, R3, 72.0, 83.6, skin(R3, 11.6, (p) => {
    weather(p, 31, 0.8);
    rollPattern(p, 0, 1.9, 8, C + 1 / 16);
    corr(p, 0, 1.9);
    ring(p, 1.9, 'rgba(0,0,0,0.25)');
    for (let y = 3.5; y < 11.6; y += 2.6) ring(p, y, 'rgba(0,0,0,0.05)', 1);
  }, (p) => corrB(p, 0, 1.9)));
  for (const th of [Math.PI / 2, -Math.PI / 2]) {
    const aps = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.9, 16, 1, false, 0, Math.PI), dark);
    aps.position.copy(around(R3 - 0.1, th, 73.1));
    aps.rotation.y = th - Math.PI / 2;
    rocket.add(aps);
  }
  section(rocket, R3, R3, 83.6, 84.7, skin(R3, 1.1, (p) => {
    band(p, 0, 1.1, '#151517');
    corr(p, 0, 1.1);
  }, (p) => corrB(p, 0, 1.1)), { bumpScale: 1 });
  // the Instrument Unit: a ribbed honeycomb ring
  section(rocket, R3, R3, 84.7, 85.6, skin(R3, 0.9, (p) => {
    band(p, 0, 0.9, '#d4d2cc');
    stringers(p, 0, 0.9, 10, 'rgba(255,255,255,0.25)', 'rgba(0,0,0,0.18)');
    ring(p, 0.06, 'rgba(0,0,0,0.4)');
    ring(p, 0.84, 'rgba(0,0,0,0.4)');
  }), { metal: 0.5, rough: 0.35 });

  // ---- the Apollo spacecraft
  section(rocket, R3, RSM, 85.6, 94.1, skin((R3 + RSM) / 2, 8.5, (p) => {
    band(p, 0, 8.5, '#e8e7e2');
    for (let k = 0; k < 4; k++) {
      p.g.fillStyle = 'rgba(0,0,0,0.3)';
      p.g.fillRect(((k / 4 + 1 / 8) % 1) * p.W - 1, 0, 3, p.H);
    }
    ring(p, 0.1, 'rgba(0,0,0,0.3)');
    ring(p, 4.2, 'rgba(0,0,0,0.12)');
    weather(p, 41, 0.5);
  }), { metal: 0.35, rough: 0.35 });
  section(rocket, RSM, RSM, 94.1, 98.3, skin(RSM, 4.2, (p) => {
    band(p, 0, 4.2, '#c9cbcd');
    for (let k = 0; k < 16; k++) {
      p.g.fillStyle = k % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.06)';
      p.g.fillRect((k / 16) * p.W, p.yAt(3.6), p.W / 32, p.yAt(0.6) - p.yAt(3.6));
    }
    ring(p, 0.08, 'rgba(0,0,0,0.35)');
    ring(p, 4.1, 'rgba(0,0,0,0.35)');
  }), { metal: 0.85, rough: 0.28 });
  for (let k = 0; k < 4; k++) {
    const th = Math.PI / 4 + (k * Math.PI) / 2;
    const quad = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.5), foil);
    quad.position.copy(around(RSM + 0.2, th, 96.6));
    quad.rotation.y = th;
    rocket.add(quad);
  }
  // the command module under its boost protective cover
  const cmGeo = new THREE.CylinderGeometry(0.36, RSM, 3.2, 96, 1, false);
  cmGeo.translate(0, 98.3 + 1.6, 0);
  const cm = new THREE.Mesh(cmGeo, new THREE.MeshStandardMaterial({ color: '#e9e6dd', roughness: 0.55, metalness: 0.05 }));
  cm.castShadow = true;
  rocket.add(cm);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), dark);
  win.position.copy(around(1.15, C * Math.PI * 2, 99.6));
  win.lookAt(around(5, C * Math.PI * 2, 99.6 + 1.8));
  rocket.add(win);
  // the launch escape tower: an orange truss, the escape motor, canards and the Q-ball
  const truss = new THREE.MeshStandardMaterial({ color: '#c4441c', roughness: 0.55, metalness: 0.4 });
  const legs: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++) legs.push(around(0.95, (k / 4) * Math.PI * 2 + Math.PI / 4, 101.3));
  const top: THREE.Vector3[] = legs.map((v) => new THREE.Vector3(v.x * 0.38, 104.6, v.z * 0.38));
  const strut = (a: THREE.Vector3, b: THREE.Vector3, w: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(w, w, a.distanceTo(b), 6), truss);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    rocket.add(m);
  };
  for (let k = 0; k < 4; k++) {
    strut(legs[k], top[k], 0.06);
    const mid = legs[(k + 1) % 4].clone().lerp(top[(k + 1) % 4], 0.5);
    strut(legs[k], mid, 0.035);
    strut(mid, top[k], 0.035);
  }
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 4.3, 32), white);
  motor.position.y = 104.6 + 2.15;
  motor.castShadow = true;
  rocket.add(motor);
  for (let k = 0; k < 4; k++) {
    const noz = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 10, 1, true), dark);
    noz.position.copy(around(0.3, (k / 4) * Math.PI * 2, 104.75));
    noz.rotation.z = Math.PI;
    rocket.add(noz);
  }
  const pitch = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.33, 1.0, 24), dark);
  pitch.position.y = 109.4;
  rocket.add(pitch);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 24), foil);
  tip.position.y = 110.25;
  rocket.add(tip);
  for (let k = 0; k < 2; k++) {
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.5), dark);
    can.position.copy(around(0.3, (k * Math.PI), 109.3));
    can.rotation.y = k * Math.PI;
    rocket.add(can);
  }
  // the J-2s, hidden inside the interstages until the stage below drops away
  const j2Bell = new THREE.LatheGeometry([new THREE.Vector2(0.18, 0.15), new THREE.Vector2(0.42, 0.1), new THREE.Vector2(0.45, -0.4), new THREE.Vector2(0.32, -0.75), new THREE.Vector2(0.62, -1.4), new THREE.Vector2(0.86, -2.4), new THREE.Vector2(1.0, -3.4), new THREE.Vector2(0.97, -3.42)], 32);
  const j2 = (y: number, x: number, z: number) => {
    const g = new THREE.Group();
    const bell = new THREE.Mesh(j2Bell, new THREE.MeshStandardMaterial({ color: '#3a3a3d', roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }));
    g.add(bell);
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 12), foil);
    pump.position.set(0.55, -0.4, 0);
    g.add(pump);
    g.position.set(x, y, z);
    rocket.add(g);
  };
  j2(47.6, 0, 0);
  for (let k = 0; k < 4; k++) {
    const th = Math.PI / 4 + (k * Math.PI) / 2;
    j2(47.6, 2.7 * Math.sin(th), 2.7 * Math.cos(th));
  }
  j2(72.0, 0, 0);
  const sIIBase = new THREE.Mesh(new THREE.CircleGeometry(R1, 64), dark);
  sIIBase.rotation.x = Math.PI / 2;
  sIIBase.position.y = 47.62;
  rocket.add(sIIBase);
  const sIVBBase = new THREE.Mesh(new THREE.CircleGeometry(R3, 48), dark);
  sIVBBase.rotation.x = Math.PI / 2;
  sIVBBase.position.y = 72.02;
  rocket.add(sIVBBase);

  // sort everything into the parts that separate in flight
  const parts: Record<SaturnPart, THREE.Group> = { sic: new THREE.Group(), siiInter: new THREE.Group(), sii: new THREE.Group(), sivb: new THREE.Group(), slaSm: new THREE.Group(), cm: new THREE.Group(), les: new THREE.Group() };
  const box = new THREE.Box3();
  for (const o of [...rocket.children]) {
    box.setFromObject(o);
    const y = (box.min.y + box.max.y) / 2;
    // the J-2 clusters hang below their stages' bases: place them by where they are mounted
    const part: SaturnPart =
      o.position.y === 72.0 ? 'sivb' : o.position.y === 47.6 ? 'sii' : y < 42 ? 'sic' : y < 47.6 ? 'siiInter' : y < 72 ? 'sii' : y < 85.6 ? 'sivb' : y < 98.3 ? 'slaSm' : y < 101.55 ? 'cm' : 'les';
    parts[part].add(o);
  }
  for (const [k, g] of Object.entries(parts)) {
    g.name = 'part:' + k;
    rocket.add(g);
  }
  rocket.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return rocket;
}

export type SaturnPart = 'sic' | 'siiInter' | 'sii' | 'sivb' | 'slaSm' | 'cm' | 'les';
/** the separable parts of a built Saturn V */
export function saturnParts(rocket: THREE.Object3D): Record<SaturnPart, THREE.Group> {
  const out = {} as Record<SaturnPart, THREE.Group>;
  for (const c of rocket.children) if (c.name.startsWith('part:')) out[c.name.slice(5) as SaturnPart] = c as THREE.Group;
  return out;
}

/** body radius at a height above the base of the first stage (for the tower's arms) */
export function saturnRadiusAt(y: number): number {
  if (y < 66.9) return R1;
  if (y < 72) return R1 + ((R3 - R1) * (y - 66.9)) / 5.1;
  if (y < 85.6) return R3;
  if (y < 94.1) return R3 + ((RSM - R3) * (y - 85.6)) / 8.5;
  if (y < 98.3) return RSM;
  if (y < 101.5) return RSM + ((0.36 - RSM) * (y - 98.3)) / 3.2;
  return 0.4;
}
