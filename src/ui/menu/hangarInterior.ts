// The hangar behind the main menu: a modern maintenance hangar, built
// procedurally. A steel-framed shed with insulated cladding, clerestory
// windows and sliding doors half open onto a sunlit apron; the sun falls in
// through the doors and windows (real shadows, light shafts, dust in the
// beams). Inside: roof trusses, an overhead crane, ducts and LED high-bays; a
// two-storey office block with stairs at the back; workbenches, tool chests,
// racking, desks with computers, lockers and posters along the walls; and
// ground equipment around the jet (boarding ladder, chocks, power cart,
// extinguisher, work stands, cones).
//
// Everything static is merged into one mesh per material, so the whole
// building costs a few dozen draw calls.

import * as THREE from 'three';
import type { Aircraft } from '../../aircraft/aircraft';
import type { AirframeVisual } from '../../aircraft/models';
import { loadSettings } from '../../core/settings';

/** interior: x -W/2..W/2, z -D/2 (doors) .. D/2 (offices), floor 0 .. roof H */
export const HANGAR = { W: 46, D: 60, H: 15 };
const W2 = HANGAR.W / 2;
const D2 = HANGAR.D / 2;
const H = HANGAR.H;
const DOOR_W2 = 15;
const DOOR_H = 12.5;
/** clerestory windows on both side walls */
const WIN_Y0 = 8;
const WIN_Y1 = 11;

/** direction the sunlight travels (from the sun toward the ground) */
export const SUN_DIR = new THREE.Vector3(0.24, -0.2, 0.95).normalize();

import { Batch, at, box, cyl, bar, beam, V, worldUV, canvas, tex, rng } from './hangarKit';
import { buildOutside } from './hangarOutside';

/** Polished epoxy floor with its painted markings, joints and wear. Returns colour + roughness maps. */
function floorTextures(): { map: THREE.Texture; rough: THREE.Texture } {
  const PX = 34; // px per metre
  const w = HANGAR.W * PX, h = HANGAR.D * PX;
  const [c, g] = canvas(w, h);
  const [rc, rg] = canvas(w, h);
  const r = rng(7);
  // metres -> px (x right, z down: z = -D/2 (doors) at the top)
  const X = (x: number) => (x + W2) * PX;
  const Z = (z: number) => (z + D2) * PX;
  g.fillStyle = '#8f9599';
  g.fillRect(0, 0, w, h);
  rg.fillStyle = 'rgb(0,70,0)';
  rg.fillRect(0, 0, w, h);
  // trowel mottling and faint cloudy variation in the resin
  for (let i = 0; i < 2600; i++) {
    const x = r() * w, y = r() * h, rad = 20 + r() * 160;
    const dark = r() < 0.55;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, dark ? `rgba(60,64,66,${0.03 + r() * 0.04})` : `rgba(190,194,196,${0.03 + r() * 0.04})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    const rr = rg.createRadialGradient(x, y, 0, x, y, rad);
    rr.addColorStop(0, `rgba(0,${dark ? 95 : 55},0,0.25)`);
    rr.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = rr;
    rg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // slab joints every 6 m
  g.strokeStyle = 'rgba(40,42,44,0.55)';
  g.lineWidth = 2;
  for (let x = -W2 + 5; x < W2; x += 6) {
    g.beginPath();
    g.moveTo(X(x), 0);
    g.lineTo(X(x), h);
    g.stroke();
  }
  for (let z = -D2 + 6; z < D2; z += 6) {
    g.beginPath();
    g.moveTo(0, Z(z));
    g.lineTo(w, Z(z));
    g.stroke();
  }
  const paint = (col: string, rough = 150) => {
    g.fillStyle = col;
    rg.fillStyle = `rgb(0,${rough},0)`;
  };
  const rect = (x0: number, z0: number, x1: number, z1: number) => {
    g.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
    rg.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
  };
  // yellow lead-in line from the doors to the nose-wheel stop bar
  paint('#d9a514');
  rect(-0.08, -D2, 0.08, -7.2);
  rect(-2.2, -7.35, 2.2, -7.05);
  // parking box: dashed yellow outline around the jet
  for (let t = -20; t < 20; t += 1.6) {
    rect(-11.5, t, -11.35, t + 0.9);
    rect(11.35, t, 11.5, t + 0.9);
  }
  for (let t = -11.5; t < 11.5; t += 1.6) {
    rect(t, -20, t + 0.9, -19.85);
    rect(t, 19.85, t + 0.9, 20);
  }
  // pedestrian walkways along both side walls (green), with white edges
  paint('#2f7d4f', 140);
  rect(-W2 + 1.2, -D2 + 2, -W2 + 2.4, D2 - 7);
  rect(W2 - 2.4, -D2 + 2, W2 - 1.2, D2 - 7);
  paint('#e8e8e2');
  for (const x of [-W2 + 1.2, -W2 + 2.33, W2 - 2.4, W2 - 1.27]) rect(x, -D2 + 2, x + 0.07, D2 - 7);
  // hatched keep-clear boxes (doors' tracks, electrical panels, the stair foot)
  const hatch = (x0: number, z0: number, x1: number, z1: number, a: string, b: string) => {
    g.save();
    g.beginPath();
    g.rect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
    g.clip();
    g.fillStyle = a;
    g.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
    g.strokeStyle = b;
    g.lineWidth = 0.28 * PX;
    for (let k = -80; k < 80; k += 0.8) {
      g.beginPath();
      g.moveTo(X(x0 + k), Z(z0));
      g.lineTo(X(x0 + k + (z1 - z0)), Z(z1));
      g.stroke();
    }
    g.restore();
    rg.fillStyle = 'rgb(0,150,0)';
    rg.fillRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
  };
  hatch(-W2, -D2, -DOOR_W2 + 0.5, -D2 + 1.6, '#d9a514', '#1c1c1c');
  hatch(DOOR_W2 - 0.5, -D2, W2, -D2 + 1.6, '#d9a514', '#1c1c1c');
  hatch(14.6, 15.4, 17.6, 17.4, '#d9a514', '#1c1c1c');
  hatch(-W2 + 2.6, -2.5, -W2 + 4.2, 1.5, '#c9352b', '#e8e8e2');
  // drainage trench across the door opening
  g.fillStyle = '#2a2c2e';
  g.fillRect(X(-DOOR_W2), Z(-D2 + 2.2), X(DOOR_W2) - X(-DOOR_W2), 0.35 * PX);
  g.fillStyle = '#55595c';
  for (let x = -DOOR_W2; x < DOOR_W2; x += 0.12) g.fillRect(X(x), Z(-D2 + 2.23), 0.05 * PX, 0.29 * PX);
  // stencilled text on the floor
  g.save();
  g.fillStyle = 'rgba(232,232,226,0.9)';
  g.font = `bold ${Math.round(0.9 * PX)}px Arial`;
  g.textAlign = 'center';
  g.fillText('NO SMOKING', X(0), Z(-D2 + 5));
  g.fillText('FOD CHECK', X(-8), Z(-D2 + 5));
  g.fillText('BAY 2', X(8), Z(-D2 + 5));
  g.restore();
  // tie-down rings on a grid
  g.strokeStyle = 'rgba(70,74,76,0.9)';
  g.lineWidth = 3;
  for (let x = -16; x <= 16; x += 8)
    for (let z = -18; z <= 18; z += 9) {
      g.beginPath();
      g.arc(X(x), Z(z), 0.14 * PX, 0, Math.PI * 2);
      g.stroke();
    }
  // tyre marks along the lead-in line and fluid stains near the parking spot
  for (const off of [-1.4, 1.4, -0.05]) {
    for (let k = 0; k < 6; k++) {
      g.strokeStyle = `rgba(30,30,30,${0.05 + r() * 0.06})`;
      g.lineWidth = (0.15 + r() * 0.15) * PX;
      g.beginPath();
      const x0 = off + (r() - 0.5) * 0.4;
      g.moveTo(X(x0), Z(-D2 + r() * 3));
      g.bezierCurveTo(X(x0 + (r() - 0.5)), Z(-20), X(x0 + (r() - 0.5)), Z(-12), X(off * 0.6 + (r() - 0.5) * 0.3), Z(-2 - r() * 6));
      g.stroke();
    }
  }
  for (let i = 0; i < 16; i++) {
    const x = (r() - 0.5) * 14, z = -4 + r() * 14, rad = (0.15 + r() * 0.5) * PX;
    const gr = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), rad);
    gr.addColorStop(0, 'rgba(24,22,20,0.35)');
    gr.addColorStop(0.7, 'rgba(24,22,20,0.18)');
    gr.addColorStop(1, 'rgba(24,22,20,0)');
    g.fillStyle = gr;
    g.fillRect(X(x) - rad, Z(z) - rad, rad * 2, rad * 2);
    rg.fillStyle = 'rgba(0,30,0,0.6)';
    rg.beginPath();
    rg.arc(X(x), Z(z), rad * 0.6, 0, Math.PI * 2);
    rg.fill();
  }
  const map = tex(c);
  const rough = tex(rc, false);
  return { map, rough };
}

/** Trapezoidal-rib metal cladding: normal map tile (ribs run vertically). */
function claddingNormal(): THREE.Texture {
  const [c, g] = canvas(128, 8);
  for (let x = 0; x < 128; x++) {
    const u = x / 128;
    // rib profile: flat pan, sloped flank up, flat crown, flank down
    let nx = 0;
    if (u > 0.1 && u < 0.18) nx = -0.7;
    else if (u > 0.32 && u < 0.4) nx = 0.7;
    else if (u > 0.6 && u < 0.62) nx = -0.3;
    else if (u > 0.8 && u < 0.82) nx = 0.3;
    const r = Math.round((nx * 0.5 + 0.5) * 255);
    g.fillStyle = `rgb(${r},128,${Math.round(Math.sqrt(1 - nx * nx) * 127 + 128)})`;
    g.fillRect(x, 0, 1, 8);
  }
  const t = tex(c, false, true);
  return t;
}

/** Painted concrete blockwork (lower walls). */
function blockTexture(): THREE.Texture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#b4babd';
  g.fillRect(0, 0, 256, 256);
  const r = rng(3);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '90,95,98' : '220,224,226'},0.05)`;
    g.fillRect(r() * 256, r() * 256, 2 + r() * 10, 2 + r() * 10);
  }
  g.strokeStyle = 'rgba(95,100,104,0.8)';
  g.lineWidth = 2;
  // 0.4 x 0.2 m blocks: the tile is 0.8 x 0.8 m
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
    for (let k = 0; k < 3; k++) {
      const x = ((k * 128 + (row % 2) * 64) % 256) + 0.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 64);
      g.stroke();
    }
  }
  return tex(c, true, true);
}

function sign(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  return tex(c);
}

function textFit(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, font = 'Arial', weight = 'bold'): void {
  g.fillStyle = col;
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

/** Maintenance status board: a whiteboard grid of tail numbers and jobs. */
function whiteboard(): THREE.Texture {
  return sign(1024, 512, (g, w, h) => {
    g.fillStyle = '#f2f3f1';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a3440';
    g.lineWidth = 3;
    const cols = [0, 170, 420, 640, 820, w];
    const heads = ['TAIL', 'JOB CARD', 'STATUS', 'CREW', 'DUE'];
    for (let r = 0; r <= 9; r++) {
      g.beginPath();
      g.moveTo(0, 20 + r * 48);
      g.lineTo(w, 20 + r * 48);
      g.stroke();
    }
    for (const x of cols) {
      g.beginPath();
      g.moveTo(x, 20);
      g.lineTo(x, 20 + 9 * 48);
      g.stroke();
    }
    heads.forEach((s, i) => textFit(g, s, (cols[i] + cols[i + 1]) / 2, 44, 26, '#1c3d7a'));
    const r = rng(11);
    const jobs = ['PHASE INSP', 'ENG RUN', 'TIRE CHG', 'LOX SVC', 'FUEL LEAK', 'IFF CHK', 'NDI WING', 'BRAKES'];
    const st = [['#1f8a3a', 'FMC'], ['#d99a14', 'PMC'], ['#c0302a', 'NMC']];
    for (let i = 0; i < 8; i++) {
      const y = 92 + i * 48;
      textFit(g, `${86 + Math.floor(r() * 12)}-0${Math.floor(r() * 900) + 100}`, 85, y, 24, '#222', 'Courier New');
      textFit(g, jobs[i], 295, y, 24, '#222', 'Arial', 'normal');
      const s = st[Math.floor(r() * 3)];
      g.fillStyle = s[0];
      g.beginPath();
      g.arc(470, y, 12, 0, Math.PI * 2);
      g.fill();
      textFit(g, s[1], 560, y, 24, s[0]);
      textFit(g, ['A', 'B', 'C'][Math.floor(r() * 3)] + ' SHIFT', 730, y, 22, '#222', 'Arial', 'normal');
      textFit(g, `${Math.floor(r() * 28) + 1} OCT`, 920, y, 22, '#222', 'Arial', 'normal');
    }
  });
}

function squadronBanner(): THREE.Texture {
  return sign(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#16263d');
    gr.addColorStop(1, '#0e1828');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8a24a';
    g.lineWidth = 10;
    g.strokeRect(14, 14, w - 28, h - 28);
    // crest: a shield with three stars and a stylised arrowhead
    g.save();
    g.translate(w / 2, 220);
    g.fillStyle = '#c8a24a';
    g.beginPath();
    g.moveTo(-110, -150);
    g.lineTo(110, -150);
    g.lineTo(110, 10);
    g.quadraticCurveTo(110, 110, 0, 160);
    g.quadraticCurveTo(-110, 110, -110, 10);
    g.closePath();
    g.fill();
    g.fillStyle = '#1b3358';
    g.beginPath();
    g.moveTo(-94, -134);
    g.lineTo(94, -134);
    g.lineTo(94, 8);
    g.quadraticCurveTo(94, 96, 0, 140);
    g.quadraticCurveTo(-94, 96, -94, 8);
    g.closePath();
    g.fill();
    g.fillStyle = '#e9e6dc';
    g.beginPath();
    g.moveTo(0, -100);
    g.lineTo(52, 70);
    g.lineTo(0, 38);
    g.lineTo(-52, 70);
    g.closePath();
    g.fill();
    const star = (x: number, y: number, s: number) => {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? s * 0.45 : s;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    };
    g.fillStyle = '#c8a24a';
    star(-58, -100, 16);
    star(0, -118, 16);
    star(58, -100, 16);
    g.restore();
    textFit(g, '1ST TACTICAL FIGHTER SQUADRON', w / 2, 420, 40, '#e9e6dc');
    textFit(g, 'TRIAD  ·  AIR SUPERIORITY', w / 2, 468, 26, '#c8a24a');
  });
}

function poster(kind: 'fod' | 'smoke' | 'ear' | 'exit' | 'tools'): THREE.Texture {
  if (kind === 'exit')
    return sign(256, 128, (g, w, h) => {
      g.fillStyle = '#0f8a3c';
      g.fillRect(0, 0, w, h);
      textFit(g, 'EXIT', w / 2 + 20, h / 2 + 2, 64, '#f4fff6');
      g.fillStyle = '#f4fff6';
      g.fillRect(28, 44, 36, 40);
    });
  if (kind === 'tools')
    return sign(512, 256, (g, w, h) => {
      // pegboard with tool shadows painted on it
      g.fillStyle = '#d8d4c8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(90,86,78,0.55)';
      for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) g.fillRect(x, y, 3, 3);
      const r = rng(5);
      for (let i = 0; i < 26; i++) {
        const x = 20 + r() * (w - 40), y = 20 + r() * (h - 60), len = 40 + r() * 70;
        g.fillStyle = ['#30343a', '#b52a24', '#27466e', '#3a3a3a', '#c9a227'][Math.floor(r() * 5)];
        g.save();
        g.translate(x, y);
        g.rotate((r() - 0.5) * 0.3);
        g.fillRect(-4, 0, 8, len);
        g.fillRect(-10, len - 8, 20, 12);
        g.restore();
      }
    });
  return sign(384, 512, (g, w, h) => {
    const [bg, fg, title, body] =
      kind === 'fod'
        ? ['#c32b25', '#ffffff', 'F.O.D.', ['FOREIGN OBJECT', 'DAMAGE', 'CHECK IT', 'BAG IT', 'BIN IT']]
        : kind === 'smoke'
          ? ['#ffffff', '#c32b25', 'DANGER', ['NO SMOKING', 'NO OPEN FLAME', 'WITHIN 50 FT', 'OF AIRCRAFT']]
          : ['#1d5aa6', '#ffffff', 'NOTICE', ['HEARING', 'PROTECTION', 'REQUIRED', 'BEYOND THIS POINT']];
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.fillRect(16, 16, w - 32, 110);
    textFit(g, title, w / 2, 72, 72, bg);
    (body as string[]).forEach((s, i) => textFit(g, s, w / 2, 190 + i * 64, 40, fg));
  });
}

/** A lit monitor: dark UI with a map, charts and lists. */
function screenTexture(seed: number): THREE.Texture {
  return sign(256, 160, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = '#0d1a24';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d3a52';
    g.fillRect(0, 0, w, 16);
    g.fillStyle = '#16303f';
    g.fillRect(8, 24, 120, 126);
    g.strokeStyle = '#3fb4d8';
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(8, 30 + r() * 110);
      for (let x = 8; x < 128; x += 12) g.lineTo(x, 30 + r() * 110);
      g.stroke();
    }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = r() < 0.2 ? '#e0a33a' : '#7fb6cf';
      g.fillRect(140, 28 + i * 13, 40 + r() * 70, 6);
    }
  });
}

/** Warm office interior seen through the office windows. */
function officeTexture(): THREE.Texture {
  return sign(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#f3ead8');
    gr.addColorStop(1, '#8c7f6a');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const r = rng(21);
    // desks, chairs, shelves and people-shaped shadows
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `rgba(60,52,44,${0.35 + r() * 0.3})`;
      const x = r() * w;
      g.fillRect(x, h * 0.62, 40 + r() * 30, 6);
      g.fillRect(x + 4, h * 0.62, 4, h * 0.38);
      if (r() < 0.5) g.fillRect(x + 10, h * 0.25, 30, h * 0.3);
    }
    g.fillStyle = 'rgba(255,250,235,0.9)';
    for (let i = 0; i < 8; i++) g.fillRect((i + 0.5) * (w / 8) - 20, 2, 40, 5);
  });
}

// ---------------------------------------------------------------------------
// the building
// ---------------------------------------------------------------------------

export interface HangarInterior {
  sun: THREE.DirectionalLight;
  /** hide the sun's disc in the sky while the reflections are captured */
  setSunDisc(on: boolean): void;
  /** per-frame: dust drifting in the sunbeams */
  update(dt: number): void;
  /** ground equipment around the current jet */
  placeJetProps(ac: Aircraft, vis: AirframeVisual): void;
}

export function buildHangarInterior(scene: THREE.Scene): HangarInterior {
  const root = new THREE.Group();
  root.name = 'hangar';
  scene.add(root);
  const B = new Batch();
  let q = 'high';
  try {
    q = loadSettings().graphics.quality;
  } catch {
    /* defaults */
  }

  // --- materials ------------------------------------------------------------
  const fl = floorTextures();
  const floorMat = new THREE.MeshStandardMaterial({ map: fl.map, roughnessMap: fl.rough, roughness: 1, metalness: 0.0, envMapIntensity: 1.0 });
  const cladN = claddingNormal();
  const cladding = new THREE.MeshStandardMaterial({ color: 0xc9ced2, roughness: 0.55, metalness: 0.35, normalMap: cladN, normalScale: new THREE.Vector2(1, 1) });
  const cladDark = new THREE.MeshStandardMaterial({ color: 0x7e878e, roughness: 0.5, metalness: 0.4, normalMap: cladN });
  const block = new THREE.MeshStandardMaterial({ map: blockTexture(), roughness: 0.9, metalness: 0 });
  const kick = new THREE.MeshStandardMaterial({ color: 0x3b4146, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x55616b, roughness: 0.55, metalness: 0.6 });
  const steelLight = new THREE.MeshStandardMaterial({ color: 0x9aa3aa, roughness: 0.45, metalness: 0.7 });
  const ceiling = new THREE.MeshStandardMaterial({ color: 0xd9dcdc, roughness: 0.8, metalness: 0.1, normalMap: cladN });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe0ab12, roughness: 0.5, metalness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1b1c, roughness: 0.75, metalness: 0.1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.92 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa8171a, roughness: 0.32, metalness: 0.25 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc3c7ca, roughness: 0.32, metalness: 0.9 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1f4f8f, roughness: 0.5, metalness: 0.3 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xd9621c, roughness: 0.55 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x8c9296, roughness: 0.55, metalness: 0.3 });
  const locker = new THREE.MeshStandardMaterial({ color: 0x6e7c86, roughness: 0.45, metalness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7b58, roughness: 0.6 });
  const desk = new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.55 });
  const cardboard = new THREE.MeshStandardMaterial({ color: 0xa4835a, roughness: 0.85 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x3d5a3a, roughness: 0.7, metalness: 0.2 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb8c4, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.2 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.4, metalness: 0.7 });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.93).multiplyScalar(6) });
  const office = new THREE.MeshBasicMaterial({ map: officeTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(1.3) });
  const apron = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.9 });
  const grass = new THREE.MeshStandardMaterial({ color: 0x5d7240, roughness: 1 });
  const hills = new THREE.MeshStandardMaterial({ color: 0x55664a, roughness: 1 });
  const tarmac = new THREE.MeshStandardMaterial({ color: 0x4a4b4c, roughness: 0.95 });

  // --- floor ----------------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HANGAR.W, HANGAR.D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // --- walls -------------------------------------------------------------------------
  const clad = (g: THREE.BufferGeometry, m: THREE.Matrix4, mat = cladding) => B.add(mat, worldUV(g.applyMatrix4(m), 3.0));
  const wallT = 0.3;
  for (const sx of [-1, 1]) {
    const x = sx * (W2 + wallT / 2);
    // blockwork up to 3 m with a dark kick band, cladding above; a window band 8-11 m
    B.add(block, worldUV(box(wallT, 3, HANGAR.D).applyMatrix4(at(x, 1.5, 0)), 1 / 0.8));
    B.add(kick, box(wallT + 0.04, 0.3, HANGAR.D).applyMatrix4(at(x, 0.15, 0)));
    clad(box(wallT, WIN_Y0 - 3, HANGAR.D), at(x, (WIN_Y0 + 3) / 2, 0));
    clad(box(wallT, H - WIN_Y1, HANGAR.D), at(x, (H + WIN_Y1) / 2, 0));
    // piers between the windows
    const zs: number[] = [];
    for (let z = -D2; z <= D2 + 0.01; z += 6) zs.push(z);
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      const pw = i === 0 || i === zs.length - 1 ? 3 : 1.2;
      clad(box(wallT, WIN_Y1 - WIN_Y0, pw), at(x, (WIN_Y0 + WIN_Y1) / 2, z));
    }
    // glazing: frames, mullions, transom and sill in each bay
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i] + (i === 0 ? 1.5 : 0.6);
      const z1 = zs[i + 1] - (i === zs.length - 2 ? 1.5 : 0.6);
      const zc = (z0 + z1) / 2, wz = z1 - z0;
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(wz, WIN_Y1 - WIN_Y0), glass);
      gl.position.set(sx * W2 + sx * 0.05, (WIN_Y0 + WIN_Y1) / 2, zc);
      gl.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      gl.castShadow = false;
      root.add(gl);
      B.add(frame, box(0.12, 0.12, wz).applyMatrix4(at(sx * W2, WIN_Y0 + 0.06, zc)));
      B.add(frame, box(0.12, 0.1, wz).applyMatrix4(at(sx * W2, WIN_Y1 - 0.05, zc)));
      B.add(frame, box(0.1, 0.07, wz).applyMatrix4(at(sx * W2, WIN_Y0 + 1.9, zc)));
      B.add(steelLight, box(0.35, 0.05, wz + 0.1).applyMatrix4(at(sx * (W2 - 0.1), WIN_Y0 - 0.02, zc)));
      for (let k = 1; k < 3; k++) B.add(frame, box(0.1, WIN_Y1 - WIN_Y0, 0.07).applyMatrix4(at(sx * W2, (WIN_Y0 + WIN_Y1) / 2, z0 + (wz * k) / 3)));
    }
  }
  // back wall (offices in front of it)
  B.add(block, worldUV(box(HANGAR.W + 0.6, 3, wallT).applyMatrix4(at(0, 1.5, D2 + wallT / 2)), 1 / 0.8));
  clad(box(HANGAR.W + 0.6, H - 3, wallT), at(0, (H + 3) / 2, D2 + wallT / 2));
  // front wall above and beside the door opening
  clad(box(HANGAR.W + 0.6, H - DOOR_H, wallT), at(0, (H + DOOR_H) / 2, -D2 - wallT / 2));
  for (const sx of [-1, 1]) clad(box(W2 - DOOR_W2 + 0.3, DOOR_H, wallT), at(sx * (DOOR_W2 + (W2 - DOOR_W2 + 0.3) / 2), DOOR_H / 2, -D2 - wallT / 2));
  // door header beam
  B.add(steel, box(DOOR_W2 * 2 + 1, 0.9, 0.6).applyMatrix4(at(0, DOOR_H + 0.45, -D2 + 0.1)));
  // sliding door leaves, stacked open behind the side walls' ends (two tracks)
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const x = sx * (DOOR_W2 + 1.9 + k * 3.4);
      const z = -D2 - 0.55 - k * 0.45;
      clad(box(4.2, DOOR_H - 0.05, 0.22), at(x, DOOR_H / 2, z), cladDark);
      for (const y of [0.35, 4.2, 8.3, DOOR_H - 0.3]) B.add(steel, box(4.25, 0.14, 0.26).applyMatrix4(at(x, y, z)));
      B.add(rubber, box(0.15, DOOR_H, 0.3).applyMatrix4(at(x - sx * 2.1, DOOR_H / 2, z)));
    }
  }
  // door track in the floor and guides overhead
  B.add(steelLight, box(HANGAR.W, 0.03, 0.9).applyMatrix4(at(0, 0.015, -D2 - 0.8)));
  B.add(steel, box(HANGAR.W + 12, 0.35, 1.3).applyMatrix4(at(0, DOOR_H + 0.15, -D2 - 0.8)));

  // --- roof: deck, trusses, purlins, columns ------------------------------------------------
  const roof = box(HANGAR.W + 1, 0.3, HANGAR.D + 1.5).applyMatrix4(at(0, H + 0.15, -0.5));
  B.add(ceiling, worldUV(roof, 2.5));
  const bayZ: number[] = [];
  for (let z = -D2 + 3.75; z < D2; z += 7.5) bayZ.push(z);
  const chordLo = H - 2.4, chordHi = H - 0.25;
  for (const z of bayZ) {
    B.add(steel, beam(V(-W2, chordLo, z), V(W2, chordLo, z), 0.22));
    B.add(steel, beam(V(-W2, chordHi, z), V(W2, chordHi, z), 0.22));
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const x = -W2 + (HANGAR.W * i) / n;
      B.add(steel, beam(V(x, chordLo, z), V(x, chordHi, z), 0.1));
      if (i < n) {
        const x1 = -W2 + (HANGAR.W * (i + 1)) / n;
        B.add(steel, i % 2 ? beam(V(x, chordLo, z), V(x1, chordHi, z), 0.09) : beam(V(x, chordHi, z), V(x1, chordLo, z), 0.09));
      }
    }
    // I-section columns at both walls
    for (const sx of [-1, 1]) {
      const x = sx * (W2 - 0.25);
      B.add(steel, box(0.45, H, 0.04).applyMatrix4(at(x, H / 2, z - 0.2)));
      B.add(steel, box(0.45, H, 0.04).applyMatrix4(at(x, H / 2, z + 0.2)));
      B.add(steel, box(0.04, H, 0.4).applyMatrix4(at(x, H / 2, z)));
      B.add(steel, box(0.55, 0.3, 0.55).applyMatrix4(at(x, 0.15, z)));
      // crane runway bracket
      B.add(steel, box(0.9, 0.35, 0.4).applyMatrix4(at(x - sx * 0.6, 11.2, z)));
    }
  }
  for (let x = -W2 + 2; x < W2; x += 3) B.add(steel, box(0.12, 0.2, HANGAR.D).applyMatrix4(at(x, H - 0.12, 0)));
  // wall girts on the insides of the side walls
  for (const sx of [-1, 1]) for (const y of [4.5, 6.5, 12.5]) B.add(steelLight, box(0.08, 0.18, HANGAR.D).applyMatrix4(at(sx * (W2 - 0.08), y, 0)));

  // --- overhead bridge crane: runways along both walls, a yellow bridge girder with a hoist -----
  for (const sx of [-1, 1]) B.add(steel, box(0.35, 0.6, HANGAR.D).applyMatrix4(at(sx * (W2 - 1.1), 11.7, 0)));
  const cz = 9;
  B.add(yellow, box(HANGAR.W - 2.2, 0.9, 0.7).applyMatrix4(at(0, 12.45, cz)));
  B.add(yellow, box(HANGAR.W - 2.2, 0.08, 1.1).applyMatrix4(at(0, 12.95, cz)));
  for (const sx of [-1, 1]) B.add(yellow, box(0.8, 0.7, 2.6).applyMatrix4(at(sx * (W2 - 1.1), 12.25, cz)));
  B.add(yellow, box(1.3, 0.8, 1.5).applyMatrix4(at(-4, 11.65, cz)));
  B.add(black, bar(V(-4.15, 11.3, cz), V(-4.15, 7.2, cz), 0.025, 6));
  B.add(black, bar(V(-3.85, 11.3, cz), V(-3.85, 7.2, cz), 0.025, 6));
  B.add(yellow, box(0.5, 0.6, 0.35).applyMatrix4(at(-4, 6.9, cz)));
  B.add(steelLight, new THREE.TorusGeometry(0.16, 0.05, 8, 16, Math.PI * 1.4).applyMatrix4(at(-4, 6.45, cz, 0, 0, Math.PI * 0.8)));
  // pendant control on its cable
  B.add(black, bar(V(-3.4, 11.3, cz), V(-3.4, 1.6, cz), 0.01, 4));
  B.add(yellow, box(0.12, 0.35, 0.1).applyMatrix4(at(-3.4, 1.45, cz)));

  // --- ducts, cable trays, sprinklers ---------------------------------------------------------
  for (const x of [-9, 9]) {
    B.add(steelLight, worldUV(cyl(0.45, 0.45, HANGAR.D - 8, 20).applyMatrix4(at(x, H - 3.1, -2, 0, Math.PI / 2)), 1));
    for (let z = -D2 + 8; z < D2 - 8; z += 7.5) {
      B.add(steelLight, cyl(0.5, 0.5, 0.08, 20).applyMatrix4(at(x, H - 3.1, z, 0, Math.PI / 2)));
      B.add(frame, box(0.6, 0.25, 0.6).applyMatrix4(at(x, H - 3.65, z + 3.5)));
      B.add(black, bar(V(x, H - 2.65, z), V(x, H - 0.4, z), 0.02, 4));
    }
  }
  for (const sx of [-1, 1]) {
    B.add(steelLight, box(0.5, 0.08, HANGAR.D - 2).applyMatrix4(at(sx * (W2 - 0.4), 6.2, 0)));
    B.add(black, box(0.35, 0.1, HANGAR.D - 2).applyMatrix4(at(sx * (W2 - 0.4), 6.27, 0)));
  }
  for (let x = -W2 + 4; x < W2; x += 5)
    for (let z = -D2 + 5; z < D2; z += 5) B.add(red, bar(V(x, H - 0.3, z), V(x, H - 0.9, z), 0.025, 6));

  // --- LED high-bay lights on drop rods -------------------------------------------------------------
  const lampPos: THREE.Vector3[] = [];
  for (const x of [-15, -5, 5, 15])
    for (const z of [-20, -10, 0, 10, 20]) {
      const y = 11.4;
      lampPos.push(V(x, y, z));
      B.add(black, bar(V(x, y + 0.2, z), V(x, chordLo, z), 0.02, 4));
      B.add(frame, cyl(0.42, 0.5, 0.14, 24).applyMatrix4(at(x, y + 0.08, z)));
      B.add(frame, cyl(0.15, 0.15, 0.25, 12).applyMatrix4(at(x, y + 0.25, z)));
      const disc = new THREE.CircleGeometry(0.44, 24).applyMatrix4(at(x, y, z, 0, Math.PI / 2));
      B.add(lamp, disc);
    }

  // --- offices along the back wall: two storeys, glazed, with a stair and a railed walkway ---------
  const oz0 = D2 - 6.5, oz1 = D2;
  const ox = 13;
  // front faces: sill and header bands around a window strip on each storey
  B.add(block, worldUV(box(ox * 2, 1.0, 0.25).applyMatrix4(at(0, 0.5, oz0)), 1 / 0.8));
  B.add(block, worldUV(box(ox * 2, 0.7, 0.25).applyMatrix4(at(0, 2.95, oz0)), 1 / 0.8));
  for (const sx of [-1, 1]) B.add(block, worldUV(box(1.5, 1.6, 0.25).applyMatrix4(at(sx * (ox - 0.75), 1.8, oz0)), 1 / 0.8));
  B.add(desk, box(ox * 2 + 0.4, 0.3, oz1 - oz0 + 0.3).applyMatrix4(at(0, 3.45, (oz0 + oz1) / 2)));
  clad(box(ox * 2, 0.7, 0.2), at(0, 3.95, oz0));
  clad(box(ox * 2, 0.7, 0.2), at(0, 6.45, oz0));
  for (const sx of [-1, 1]) clad(box(1.5, 1.8, 0.2), at(sx * (ox - 0.75), 5.2, oz0));
  B.add(ceiling, box(ox * 2 + 0.4, 0.2, oz1 - oz0 + 0.3).applyMatrix4(at(0, 6.9, (oz0 + oz1) / 2)));
  for (const sx of [-1, 1]) {
    B.add(block, worldUV(box(0.25, 3.3, oz1 - oz0).applyMatrix4(at(sx * ox, 1.65, (oz0 + oz1) / 2)), 1 / 0.8));
    clad(box(0.2, 3.2, oz1 - oz0), at(sx * ox, 5.2, (oz0 + oz1) / 2));
  }
  // window strips: lit rooms behind glass, mullions every 1.5 m
  for (const [y0, y1] of [[1.0, 2.6], [4.3, 6.1]]) {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(ox * 2 - 3, y1 - y0), office);
    back.position.set(0, (y0 + y1) / 2, oz0 + 0.25);
    root.add(back);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(ox * 2 - 3, y1 - y0), glass);
    gl.position.set(0, (y0 + y1) / 2, oz0 - 0.14);
    gl.rotation.y = Math.PI;
    root.add(gl);
    for (let x = -ox + 1.5; x <= ox - 1.5 + 0.01; x += 1.5) B.add(frame, box(0.08, y1 - y0, 0.3).applyMatrix4(at(x, (y0 + y1) / 2, oz0 - 0.05)));
    B.add(frame, box(ox * 2 - 3, 0.08, 0.3).applyMatrix4(at(0, y0, oz0 - 0.05)));
    B.add(frame, box(ox * 2 - 3, 0.08, 0.3).applyMatrix4(at(0, y1, oz0 - 0.05)));
  }
  // doors into the ground floor offices
  for (const x of [-10.5, 10.5]) {
    B.add(frame, box(1.2, 2.2, 0.12).applyMatrix4(at(x, 1.1, oz0 - 0.1)));
    B.add(steelLight, box(0.05, 0.3, 0.06).applyMatrix4(at(x + 0.45, 1.05, oz0 - 0.2)));
  }
  // walkway railing along the office roof (it is the mezzanine floor)
  for (let x = -ox; x <= ox + 0.01; x += 1.6) B.add(yellow, bar(V(x, 3.6, oz0 - 0.1), V(x, 4.7, oz0 - 0.1), 0.025, 6));
  B.add(yellow, beam(V(-ox, 4.7, oz0 - 0.1), V(ox, 4.7, oz0 - 0.1), 0.05));
  B.add(yellow, beam(V(-ox, 4.15, oz0 - 0.1), V(ox, 4.15, oz0 - 0.1), 0.035));
  // steel stair up to the walkway (along +z, beside the offices)
  {
    const sx = 16.2, z0 = 16.2, z1 = oz0 - 0.2, n = 18;
    for (const side of [-0.55, 0.55]) B.add(steel, beam(V(sx + side, 0.1, z0), V(sx + side, 3.55, z1), 0.08));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      B.add(steelLight, box(1.0, 0.04, 0.28).applyMatrix4(at(sx, 0.1 + t * 3.45, z0 + t * (z1 - z0))));
    }
    for (const side of [-0.6, 0.6]) {
      B.add(yellow, beam(V(sx + side, 1.0, z0), V(sx + side, 4.45, z1), 0.04));
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const p = V(sx + side, 0.1 + t * 3.45, z0 + t * (z1 - z0));
        B.add(yellow, bar(p, p.clone().setY(p.y + 0.9), 0.02, 6));
      }
    }
    B.add(steelLight, box(2.6, 0.1, 2.2).applyMatrix4(at(sx - 0.9, 3.55, z1 + 0.9)));
  }
  // banner above the offices
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshStandardMaterial({ map: squadronBanner(), roughness: 0.85 }));
  banner.position.set(0, 10.2, D2 - 0.02);
  banner.rotation.y = Math.PI;
  banner.receiveShadow = true;
  root.add(banner);

  // --- signs and posters -------------------------------------------------------------------------------
  const plane = (t: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry: number, emissive = false) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      emissive ? new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1, 1, 1).multiplyScalar(2.2) }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = !emissive;
    root.add(m);
    return m;
  };
  const faceL = Math.PI / 2, faceR = -Math.PI / 2;
  plane(poster('fod'), 0.9, 1.2, -W2 + 0.02, 2.2, -16, faceL);
  plane(poster('smoke'), 0.9, 1.2, W2 - 0.02, 2.2, -16, faceR);
  plane(poster('ear'), 0.9, 1.2, W2 - 0.02, 2.2, 3, faceR);
  plane(poster('fod'), 0.9, 1.2, W2 - 0.02, 2.2, 24, faceR);
  plane(poster('exit'), 0.6, 0.3, -W2 + 0.03, 3.6, 26, faceL, true);
  plane(poster('exit'), 0.6, 0.3, W2 - 0.03, 3.6, 26, faceR, true);
  plane(poster('exit'), 0.6, 0.3, -10.5, 2.55, oz0 - 0.2, Math.PI, true);
  plane(whiteboard(), 3.6, 1.8, -W2 + 0.03, 2.1, -10, faceL);
  B.add(frame, box(0.06, 1.9, 3.7).applyMatrix4(at(-W2 + 0.02, 2.1, -10)));
  B.add(alu, box(0.12, 0.05, 3.4).applyMatrix4(at(-W2 + 0.08, 1.18, -10)));

  // --- right wall: workbenches with pegboards, tool chests, racking ----------------------------------
  const pegT = poster('tools');
  const bench = (z: number) => {
    const x = W2 - 0.55;
    B.add(wood, box(0.9, 0.06, 2.4).applyMatrix4(at(x, 0.92, z)));
    B.add(grey, box(0.85, 0.04, 2.3).applyMatrix4(at(x, 0.2, z)));
    for (const dz of [-1.1, 1.1]) for (const dx of [-0.38, 0.38]) B.add(grey, box(0.06, 0.9, 0.06).applyMatrix4(at(x + dx, 0.45, z + dz)));
    B.add(red, box(0.7, 0.55, 0.6).applyMatrix4(at(x, 0.62, z + 0.75)));
    // vise and a few things on the bench
    B.add(blue, box(0.2, 0.18, 0.3).applyMatrix4(at(x - 0.3, 1.04, z - 0.9)));
    B.add(steelLight, box(0.05, 0.05, 0.4).applyMatrix4(at(x - 0.42, 1.08, z - 0.9)));
    B.add(black, box(0.35, 0.12, 0.25).applyMatrix4(at(x, 1.01, z - 0.2)));
    B.add(orange, cyl(0.08, 0.08, 0.2, 10).applyMatrix4(at(x - 0.1, 1.05, z + 0.3)));
    plane(pegT, 2.4, 1.2, W2 - 0.03, 1.9, z, faceR);
    // strip light over the bench
    B.add(frame, box(0.18, 0.08, 1.8).applyMatrix4(at(W2 - 0.3, 2.75, z)));
    B.add(lamp, box(0.12, 0.02, 1.7).applyMatrix4(at(W2 - 0.3, 2.705, z)));
  };
  for (const z of [-21, -17.8, 11, 14.2]) bench(z);
  const toolChest = (x: number, z: number, ry = 0) => {
    const m = at(x, 0, z, ry);
    B.add(red, box(0.7, 1.0, 1.4).applyMatrix4(at(0, 0.62, 0)).applyMatrix4(m));
    B.add(red, box(0.66, 0.5, 1.3).applyMatrix4(at(0, 1.37, 0)).applyMatrix4(m));
    for (let k = 0; k < 7; k++) B.add(steelLight, box(0.02, 0.025, 1.1).applyMatrix4(at(-0.36, 0.25 + k * 0.16, 0)).applyMatrix4(m));
    B.add(steelLight, box(0.02, 0.025, 1.0).applyMatrix4(at(-0.34, 1.3, 0)).applyMatrix4(m));
    B.add(black, box(0.7, 0.03, 1.4).applyMatrix4(at(0, 1.635, 0)).applyMatrix4(m));
    for (const dz of [-0.6, 0.6]) for (const dx of [-0.28, 0.28]) B.add(rubber, cyl(0.06, 0.06, 0.05, 10).applyMatrix4(at(dx, 0.07, dz, 0, 0, Math.PI / 2)).applyMatrix4(m));
  };
  toolChest(W2 - 0.9, -15.1);
  toolChest(W2 - 0.9, 16.6);
  toolChest(W2 - 3.2, 8.2, 0.35);
  // pallet racking with bins and boxes
  {
    const x = W2 - 0.75, z0 = -8.5, z1 = 6.5;
    for (let z = z0; z <= z1 + 0.01; z += 2.5) for (const dx of [-0.45, 0.45]) B.add(blue, box(0.08, 4.6, 0.08).applyMatrix4(at(x + dx, 2.3, z)));
    for (const y of [0.15, 1.6, 3.05, 4.5]) for (const dx of [-0.45, 0.45]) B.add(orange, box(0.06, 0.12, z1 - z0).applyMatrix4(at(x + dx, y, (z0 + z1) / 2)));
    const r = rng(9);
    for (const y of [0.21, 1.66, 3.11])
      for (let z = z0 + 0.4; z < z1 - 0.3; z += 0.55 + r() * 0.3) {
        if (r() < 0.15) continue;
        const h = 0.3 + r() * 0.8, w = 0.4 + r() * 0.25;
        B.add(r() < 0.6 ? cardboard : r() < 0.5 ? blue : grey, box(0.8, h, w).applyMatrix4(at(x, y + h / 2, z)));
      }
  }
  // air compressor and a hose reel on the wall
  B.add(blue, cyl(0.35, 0.35, 1.2, 16).applyMatrix4(at(W2 - 0.8, 0.5, 9.2, 0, 0, Math.PI / 2)));
  B.add(black, box(0.5, 0.4, 0.5).applyMatrix4(at(W2 - 0.8, 1.1, 9.2)));
  B.add(red, cyl(0.35, 0.35, 0.18, 20).applyMatrix4(at(W2 - 0.15, 2.4, 1, 0, 0, Math.PI / 2)));

  // --- left wall: desks with computers, lockers, cabinets --------------------------------------------------
  const deskStation = (x: number, z: number, seed: number) => {
    B.add(desk, box(0.8, 0.04, 1.6).applyMatrix4(at(x, 0.74, z)));
    for (const dz of [-0.75, 0.75]) B.add(frame, box(0.7, 0.72, 0.04).applyMatrix4(at(x, 0.36, z + dz)));
    B.add(frame, box(0.04, 0.4, 1.5).applyMatrix4(at(x - 0.35, 0.5, z)));
    // two monitors on stands, keyboard, mouse, a mug
    for (const dz of [-0.33, 0.33]) {
      B.add(black, box(0.04, 0.33, 0.56).applyMatrix4(at(x - 0.22, 1.08, z + dz, dz > 0 ? 0.18 : -0.18)));
      B.add(black, box(0.05, 0.2, 0.05).applyMatrix4(at(x - 0.26, 0.86, z + dz)));
      B.add(black, box(0.18, 0.02, 0.2).applyMatrix4(at(x - 0.26, 0.77, z + dz)));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.29), new THREE.MeshBasicMaterial({ map: screenTexture(seed + (dz > 0 ? 1 : 0)), color: new THREE.Color(1, 1, 1).multiplyScalar(1.4) }));
      scr.position.set(x - 0.195, 1.08, z + dz);
      scr.rotation.y = Math.PI / 2 + (dz > 0 ? 0.18 : -0.18);
      root.add(scr);
    }
    B.add(black, box(0.16, 0.02, 0.45).applyMatrix4(at(x + 0.05, 0.77, z)));
    B.add(grey, box(0.08, 0.02, 0.05).applyMatrix4(at(x + 0.05, 0.77, z + 0.35)));
    B.add(desk, cyl(0.04, 0.035, 0.1, 10).applyMatrix4(at(x + 0.2, 0.81, z - 0.55)));
    // office chair
    const cx = x + 0.75, czz = z + 0.1;
    B.add(fabric, box(0.48, 0.08, 0.48).applyMatrix4(at(cx, 0.48, czz)));
    B.add(fabric, box(0.08, 0.55, 0.45).applyMatrix4(at(cx + 0.24, 0.82, czz, 0, 0, -0.12)));
    B.add(frame, cyl(0.03, 0.03, 0.36, 8).applyMatrix4(at(cx, 0.28, czz)));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      B.add(frame, beam(V(cx, 0.1, czz), V(cx + Math.cos(a) * 0.3, 0.06, czz + Math.sin(a) * 0.3), 0.03));
      B.add(rubber, cyl(0.03, 0.03, 0.03, 8).applyMatrix4(at(cx + Math.cos(a) * 0.3, 0.03, czz + Math.sin(a) * 0.3, 0, 0, Math.PI / 2)));
    }
    // filing cabinet
    B.add(locker, box(0.6, 1.3, 0.5).applyMatrix4(at(x - 0.05, 0.65, z + 1.2)));
    for (let k = 0; k < 4; k++) B.add(steelLight, box(0.02, 0.03, 0.18).applyMatrix4(at(x + 0.26, 0.25 + k * 0.3, z + 1.2)));
  };
  deskStation(-W2 + 0.75, -20.5, 31);
  deskStation(-W2 + 0.75, -16.6, 33);
  deskStation(-W2 + 0.75, -4.2, 35);
  // row of lockers
  for (let i = 0; i < 10; i++) {
    const z = 3.2 + i * 0.52;
    B.add(locker, box(0.55, 1.95, 0.5).applyMatrix4(at(-W2 + 0.35, 0.98, z)));
    B.add(frame, box(0.02, 1.8, 0.02).applyMatrix4(at(-W2 + 0.63, 0.98, z + 0.25)));
    for (let k = 0; k < 4; k++) B.add(frame, box(0.02, 0.02, 0.2).applyMatrix4(at(-W2 + 0.63, 1.6 + k * 0.06, z)));
    B.add(steelLight, box(0.03, 0.12, 0.03).applyMatrix4(at(-W2 + 0.64, 1.05, z - 0.15)));
  }
  B.add(wood, box(0.35, 0.05, 5.2).applyMatrix4(at(-W2 + 1.1, 0.45, 5.6)));
  for (const z of [3.4, 7.8]) B.add(frame, box(0.3, 0.45, 0.05).applyMatrix4(at(-W2 + 1.1, 0.22, z)));
  // water cooler, bin, electrical panels
  B.add(desk, box(0.35, 1.0, 0.35).applyMatrix4(at(-W2 + 0.4, 0.5, 9.4)));
  B.add(blue, cyl(0.15, 0.15, 0.45, 16).applyMatrix4(at(-W2 + 0.4, 1.23, 9.4)));
  B.add(greenMat, cyl(0.25, 0.22, 0.8, 16).applyMatrix4(at(-W2 + 0.5, 0.4, 10.3)));
  for (let k = 0; k < 3; k++) B.add(grey, box(0.3, 1.4, 0.9).applyMatrix4(at(-W2 + 0.18, 1.6, -1.8 + k * 1.1)));
  B.add(grey, box(0.2, 2.5, 0.2).applyMatrix4(at(-W2 + 0.15, 4.2, -0.7)));

  // --- fire safety: extinguisher cabinets on the columns, hose reels -------------------------------
  for (const z of bayZ.filter((_, i) => i % 2 === 0))
    for (const sx of [-1, 1]) {
      B.add(red, box(0.25, 0.7, 0.35).applyMatrix4(at(sx * (W2 - 0.62), 1.4, z + 0.45)));
      B.add(red, cyl(0.08, 0.08, 0.5, 12).applyMatrix4(at(sx * (W2 - 0.75), 0.4, z + 0.45)));
      B.add(black, cyl(0.035, 0.035, 0.1, 8).applyMatrix4(at(sx * (W2 - 0.75), 0.7, z + 0.45)));
    }

  // --- ground equipment on the hangar floor ----------------------------------------------------------------
  // tow tractor near the doors, facing in
  {
    const m = at(9.5, 0, -21, 0.4);
    B.add(yellow, box(1.6, 0.7, 2.8).applyMatrix4(at(0, 0.7, 0)).applyMatrix4(m));
    B.add(yellow, box(1.5, 0.35, 1.0).applyMatrix4(at(0, 1.2, 0.7)).applyMatrix4(m));
    B.add(black, box(0.6, 0.6, 0.12).applyMatrix4(at(0, 1.35, 0.2)).applyMatrix4(m));
    B.add(black, cyl(0.2, 0.2, 0.05, 12).applyMatrix4(at(0, 1.55, -0.1, 0, 0.9)).applyMatrix4(m));
    for (const dz of [-0.95, 0.95]) for (const dx of [-0.85, 0.85]) B.add(rubber, cyl(0.38, 0.38, 0.3, 18).applyMatrix4(at(dx, 0.38, dz, 0, 0, Math.PI / 2)).applyMatrix4(m));
    B.add(steel, box(0.3, 0.2, 0.6).applyMatrix4(at(0, 0.45, -1.6)).applyMatrix4(m));
    B.add(black, box(1.7, 0.18, 0.2).applyMatrix4(at(0, 0.5, 1.45)).applyMatrix4(m));
  }
  // munitions trolley with two missiles
  {
    const m = at(-13, 0, 9, -0.25);
    B.add(yellow, box(1.1, 0.12, 3.2).applyMatrix4(at(0, 0.55, 0)).applyMatrix4(m));
    for (const dz of [-1.2, 1.2]) for (const dx of [-0.5, 0.5]) B.add(rubber, cyl(0.2, 0.2, 0.12, 14).applyMatrix4(at(dx, 0.2, dz, 0, 0, Math.PI / 2)).applyMatrix4(m));
    for (const dz of [-1.2, 1.2]) B.add(yellow, box(0.9, 0.35, 0.1).applyMatrix4(at(0, 0.3, dz)).applyMatrix4(m));
    B.add(yellow, beam(V(0, 0.6, -1.6), V(0, 0.9, -2.6), 0.06).applyMatrix4(m));
    for (const dx of [-0.25, 0.25]) {
      B.add(grey, cyl(0.09, 0.09, 3.2, 14).applyMatrix4(at(dx, 0.78, 0, 0, Math.PI / 2)).applyMatrix4(m));
      B.add(grey, cyl(0.001, 0.09, 0.35, 14).applyMatrix4(at(dx, 0.78, -1.77, 0, -Math.PI / 2)).applyMatrix4(m));
      for (let k = 0; k < 4; k++) B.add(grey, box(0.01, 0.2, 0.3).applyMatrix4(at(dx, 0.78, 1.4, 0, 0, (k * Math.PI) / 4)).applyMatrix4(m));
      B.add(yellow, cyl(0.092, 0.092, 0.06, 14).applyMatrix4(at(dx, 0.78, -1.1, 0, Math.PI / 2)).applyMatrix4(m));
    }
  }
  // maintenance work stand (platform with stairs and handrails)
  const workStand = (x: number, z: number, ry: number, hgt: number) => {
    const m = at(x, 0, z, ry);
    B.add(yellow, box(1.6, 0.08, 1.4).applyMatrix4(at(0, hgt, 0)).applyMatrix4(m));
    for (const dx of [-0.75, 0.75]) for (const dz of [-0.65, 0.65]) B.add(yellow, box(0.07, hgt, 0.07).applyMatrix4(at(dx, hgt / 2, dz)).applyMatrix4(m));
    for (const dx of [-0.75, 0.75]) B.add(yellow, beam(V(dx, 0.3, -0.65), V(dx, hgt - 0.1, 0.65), 0.05).applyMatrix4(m));
    for (const dx of [-0.75, 0.75]) {
      B.add(yellow, beam(V(dx, hgt, -0.65), V(dx, hgt + 1.05, -0.65), 0.04).applyMatrix4(m));
      B.add(yellow, beam(V(dx, hgt, 0.65), V(dx, hgt + 1.05, 0.65), 0.04).applyMatrix4(m));
      B.add(yellow, beam(V(dx, hgt + 1.05, -0.65), V(dx, hgt + 1.05, 0.65), 0.04).applyMatrix4(m));
    }
    B.add(yellow, beam(V(-0.75, hgt + 1.05, 0.65), V(0.75, hgt + 1.05, 0.65), 0.04).applyMatrix4(m));
    // stairs down the back
    const n = Math.round(hgt / 0.25);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      B.add(steelLight, box(0.8, 0.04, 0.25).applyMatrix4(at(0, t * hgt, -0.7 - (1 - t) * hgt * 0.9)).applyMatrix4(m));
    }
    for (const dx of [-0.42, 0.42]) {
      B.add(yellow, beam(V(dx, 0.05, -0.7 - hgt * 0.9), V(dx, hgt, -0.7), 0.05).applyMatrix4(m));
      B.add(yellow, beam(V(dx, 0.95, -0.7 - hgt * 0.9), V(dx, hgt + 0.95, -0.7), 0.035).applyMatrix4(m));
    }
    for (const dx of [-0.7, 0.7]) for (const dz of [-0.6, 0.6]) B.add(rubber, cyl(0.08, 0.08, 0.06, 10).applyMatrix4(at(dx, 0.08, dz, 0, 0, Math.PI / 2)).applyMatrix4(m));
  };
  workStand(12.5, 11, -0.6, 2.2);
  workStand(-12.8, -6, 0.3, 1.5);
  // A-frame step ladders
  const stepLadder = (x: number, z: number, ry: number, hgt: number) => {
    const m = at(x, 0, z, ry);
    for (const dx of [-0.25, 0.25]) {
      B.add(alu, beam(V(dx, 0, -0.45), V(dx * 0.8, hgt, 0), 0.05).applyMatrix4(m));
      B.add(alu, beam(V(dx, 0, 0.45), V(dx * 0.8, hgt, 0), 0.05).applyMatrix4(m));
    }
    const n = Math.floor(hgt / 0.3);
    for (let i = 1; i <= n; i++) {
      const t = (i * 0.3) / hgt;
      B.add(alu, box(0.5 - 0.1 * t, 0.03, 0.1).applyMatrix4(at(0, t * hgt, -0.45 * (1 - t))).applyMatrix4(m));
    }
    B.add(orange, box(0.45, 0.06, 0.25).applyMatrix4(at(0, hgt + 0.03, 0)).applyMatrix4(m));
  };
  stepLadder(W2 - 2.2, -12, 0.3, 2.4);
  stepLadder(-6.5, 12.5, 1.1, 1.8);
  // floor jack, drip trays, a chained stanchion line near the stair foot
  B.add(yellow, box(0.5, 0.25, 1.2).applyMatrix4(at(-9.5, 0.2, 13.5, 0.5)));
  B.add(yellow, beam(V(-9.4, 0.3, 14.2), V(-9.1, 1.1, 15.0), 0.04));
  for (const [x, z] of [[-17.5, 18], [17.2, 21.5]]) B.add(black, box(1.2, 0.08, 0.8).applyMatrix4(at(x, 0.04, z)));
  for (let k = 0; k < 4; k++) {
    const x = -4 + k * 2.5;
    B.add(yellow, cyl(0.04, 0.04, 1.0, 10).applyMatrix4(at(x, 0.5, 21.5)));
    B.add(black, cyl(0.2, 0.22, 0.06, 16).applyMatrix4(at(x, 0.03, 21.5)));
  }
  // bollards at the door jambs
  for (const sx of [-1, 1]) for (const dz of [0.6, 1.6]) B.add(yellow, cyl(0.15, 0.15, 1.1, 14).applyMatrix4(at(sx * (DOOR_W2 - 0.4), 0.55, -D2 + dz)));
  // a pallet of boxes and spare wheels by the racking
  B.add(wood, box(1.2, 0.14, 1.0).applyMatrix4(at(W2 - 2.5, 0.07, -3.2)));
  B.add(cardboard, box(1.1, 0.8, 0.9).applyMatrix4(at(W2 - 2.5, 0.54, -3.2)));
  for (let k = 0; k < 3; k++) B.add(rubber, new THREE.TorusGeometry(0.34, 0.14, 10, 24).applyMatrix4(at(W2 - 2.6, 0.14 + k * 0.28, 1.5, 0, Math.PI / 2)));

  // --- more of a working hangar -------------------------------------------------------------------------------------
  const engineMetal = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.38, metalness: 0.85 });
  const burnt = new THREE.MeshStandardMaterial({ color: 0x5e5048, roughness: 0.42, metalness: 0.8 });
  const drumBlue = new THREE.MeshStandardMaterial({ color: 0x1d4a8a, roughness: 0.45, metalness: 0.4 });
  const bottle = new THREE.MeshStandardMaterial({ color: 0x2f5a36, roughness: 0.4, metalness: 0.3 });
  const beige = new THREE.MeshStandardMaterial({ color: 0xcfc7b2, roughness: 0.6, metalness: 0.15 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdadfe2, roughness: 0.15, metalness: 1 });
  const wheel = (mat: THREE.Material, x: number, y: number, z: number, r: number, w: number, ry = 0) =>
    B.add(mat, cyl(r, r, w, 18).applyMatrix4(at(0, 0, 0, 0, 0, Math.PI / 2)).applyMatrix4(at(x, y, z, ry)));

  // spare engine on its transport trailer (right side, by the racking)
  {
    const m = at(W2 - 5.2, 0, 1.2, 0);
    const P = (mat: THREE.Material, g: THREE.BufferGeometry) => B.add(mat, g.applyMatrix4(m));
    // trailer: yellow frame on four wheels with a tow bar
    P(yellow, box(1.5, 0.14, 5.4).applyMatrix4(at(0, 0.52, 0)));
    for (const x of [-0.7, 0.7]) P(yellow, box(0.12, 0.3, 5.4).applyMatrix4(at(x, 0.4, 0)));
    for (const z of [-2.1, 2.1]) for (const x of [-0.82, 0.82]) P(rubber, cyl(0.3, 0.3, 0.2, 18).applyMatrix4(at(x, 0.3, z, 0, 0, Math.PI / 2)));
    P(yellow, beam(V(0, 0.45, -2.7), V(0, 0.3, -4.1), 0.07));
    P(yellow, new THREE.TorusGeometry(0.1, 0.025, 6, 12).applyMatrix4(at(0, 0.3, -4.2, 0, Math.PI / 2)));
    // cradle rings
    for (const z of [-1.3, 1.4]) {
      P(yellow, new THREE.TorusGeometry(0.64, 0.05, 8, 28, Math.PI).applyMatrix4(at(0, 1.25, z, 0, 0, Math.PI)));
      for (const x of [-0.62, 0.62]) P(yellow, box(0.1, 0.7, 0.1).applyMatrix4(at(x, 0.9, z)));
    }
    // the engine: fan case, core, augmentor and nozzle (along z), with plumbing and a red intake cover
    P(engineMetal, cyl(0.6, 0.6, 1.1, 32).applyMatrix4(at(0, 1.3, -1.9, 0, Math.PI / 2)));
    P(engineMetal, cyl(0.52, 0.6, 0.4, 32).applyMatrix4(at(0, 1.3, -1.15, 0, Math.PI / 2)));
    P(steelLight, cyl(0.5, 0.52, 2.0, 32).applyMatrix4(at(0, 1.3, 0.05, 0, Math.PI / 2)));
    P(burnt, cyl(0.47, 0.5, 1.3, 32).applyMatrix4(at(0, 1.3, 1.7, 0, Math.PI / 2)));
    P(burnt, cyl(0.4, 0.47, 0.45, 20).applyMatrix4(at(0, 1.3, 2.55, 0, Math.PI / 2)));
    P(black, new THREE.CircleGeometry(0.4, 20).applyMatrix4(at(0, 1.3, 2.77)));
    P(red, cyl(0.62, 0.62, 0.08, 32).applyMatrix4(at(0, 1.3, -2.48, 0, Math.PI / 2)));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      P(k % 2 ? steel : alu, bar(V(Math.cos(a) * 0.54, 1.3 + Math.sin(a) * 0.54, -0.9), V(Math.cos(a + 0.4) * 0.53, 1.3 + Math.sin(a + 0.4) * 0.53, 1.0), 0.022, 6));
    }
    for (const z of [-0.6, 0.3, 0.9]) P(steel, new THREE.TorusGeometry(0.515, 0.025, 6, 32).applyMatrix4(at(0, 1.3, z)));
    P(black, box(0.25, 0.3, 0.5).applyMatrix4(at(0.52, 1.1, -0.2)));
  }

  // a big flag hanging from the roof trusses over the back of the bay
  {
    const [c, g] = canvas(1040, 548);
    const sw = 548 / 13;
    for (let i = 0; i < 13; i++) {
      g.fillStyle = i % 2 ? '#f4f2ee' : '#b22234';
      g.fillRect(0, i * sw, 1040, sw + 1);
    }
    g.fillStyle = '#3c3b6e';
    g.fillRect(0, 0, 416, sw * 7);
    g.fillStyle = '#f4f2ee';
    const star = (x: number, y: number, r: number) => {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.4 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
    };
    for (let row = 0; row < 9; row++) for (let col = 0; col < (row % 2 ? 5 : 6); col++) star(35 + col * 69 + (row % 2 ? 34 : 0), 22 + row * 31.5, 12);
    const flagT = tex(c);
    const fg = new THREE.PlaneGeometry(9.5, 5.0, 40, 1);
    const fp = fg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 1.6) * 0.12 + Math.sin(fp.getX(i) * 0.7 + 1) * 0.08);
    fg.computeVertexNormals();
    const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: flagT, roughness: 0.92, side: THREE.DoubleSide }));
    flag.position.set(0, chordLo - 2.75, 19.5);
    flag.rotation.y = Math.PI;
    flag.castShadow = true;
    flag.receiveShadow = true;
    root.add(flag);
    for (const x of [-4.6, 4.6]) B.add(black, bar(V(x, chordLo - 0.25, 19.5), V(x, chordLo, 19.5), 0.01, 4));
    B.add(steel, box(9.7, 0.06, 0.06).applyMatrix4(at(0, chordLo - 0.25, 19.5)));
  }

  // nitrogen / oxygen servicing cart: a rack of green bottles on a wheeled frame
  {
    const m = at(-17, 0, -12.5, 0.5);
    const P = (mat: THREE.Material, g: THREE.BufferGeometry) => B.add(mat, g.applyMatrix4(m));
    P(grey, box(1.2, 0.1, 2.2).applyMatrix4(at(0, 0.45, 0)));
    for (const z of [-1.0, 1.0]) for (const x of [-0.55, 0.55]) P(rubber, cyl(0.2, 0.2, 0.12, 14).applyMatrix4(at(x, 0.2, z, 0, 0, Math.PI / 2)));
    for (let k = 0; k < 6; k++) {
      const x = (k % 2 ? 0.25 : -0.25), z = -0.7 + Math.floor(k / 2) * 0.7;
      P(bottle, cyl(0.2, 0.2, 1.4, 16).applyMatrix4(at(x, 1.2, z)));
      P(bottle, new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).applyMatrix4(at(x, 1.9, z)));
      P(chrome, cyl(0.04, 0.04, 0.16, 8).applyMatrix4(at(x, 2.15, z)));
    }
    P(grey, box(1.25, 0.06, 2.2).applyMatrix4(at(0, 1.5, 0)));
    P(grey, beam(V(0, 0.5, -1.1), V(0, 1.0, -1.9), 0.05));
    P(black, box(0.3, 0.25, 0.2).applyMatrix4(at(0.55, 1.7, 1.0)));
  }

  // hydraulic test stand ("mule")
  {
    const m = at(15.8, 0, -4.5, -0.3);
    const P = (mat: THREE.Material, g: THREE.BufferGeometry) => B.add(mat, g.applyMatrix4(m));
    P(beige, box(1.3, 1.3, 2.4).applyMatrix4(at(0, 1.0, 0)));
    P(black, box(1.32, 0.12, 2.42).applyMatrix4(at(0, 1.7, 0)));
    for (let k = 0; k < 5; k++) P(frame, box(0.02, 0.9, 0.06).applyMatrix4(at(0.66, 1.0, -0.9 + k * 0.2)));
    P(black, box(0.03, 0.4, 0.6).applyMatrix4(at(0.66, 1.3, 0.6)));
    for (const z of [-0.9, 0.9]) for (const x of [-0.55, 0.55]) P(rubber, cyl(0.28, 0.28, 0.16, 16).applyMatrix4(at(x, 0.28, z, 0, 0, Math.PI / 2)));
    P(steel, beam(V(0, 0.4, -1.2), V(0, 0.3, -2.1), 0.05));
    for (const dx of [-0.2, 0.2]) {
      const hose = new THREE.CatmullRomCurve3([V(dx, 1.4, 1.2), V(dx + 0.3, 0.6, 1.8), V(dx + 0.8, 0.05, 2.0), V(dx + 1.4, 0.05, 1.4), V(dx + 1.1, 0.05, 0.8)]);
      P(black, new THREE.TubeGeometry(hose, 24, 0.03, 6, false));
    }
  }

  // portable LED floodlights on tripods, aimed at the jet
  const flood = (x: number, z: number, ry: number) => {
    const m = at(x, 0, z, ry);
    const P = (mat: THREE.Material, g: THREE.BufferGeometry) => B.add(mat, g.applyMatrix4(m));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      P(black, beam(V(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7), V(0, 1.4, 0), 0.035));
    }
    P(alu, cyl(0.03, 0.03, 1.6, 8).applyMatrix4(at(0, 2.2, 0)));
    P(black, box(0.9, 0.08, 0.08).applyMatrix4(at(0, 3.0, 0)));
    for (const dx of [-0.3, 0.3]) {
      P(black, box(0.5, 0.36, 0.14).applyMatrix4(at(dx, 3.2, 0.03, 0, -0.35)));
      P(lamp, box(0.44, 0.3, 0.02).applyMatrix4(at(dx, 3.19, 0.11, 0, -0.35)));
    }
  };
  flood(-8.8, -13.5, 0.55);
  flood(9.2, 13.8, Math.PI + 0.6);

  // industrial drum fans
  const fan = (x: number, z: number, ry: number) => {
    const m = at(x, 0, z, ry);
    const P = (mat: THREE.Material, g: THREE.BufferGeometry) => B.add(mat, g.applyMatrix4(m));
    P(black, cyl(0.62, 0.62, 0.42, 28, ).applyMatrix4(at(0, 0.85, 0, 0, Math.PI / 2)));
    for (const z2 of [-0.22, 0.22]) for (let k = 1; k <= 4; k++) P(steelLight, new THREE.TorusGeometry(0.15 * k, 0.008, 4, 28).applyMatrix4(at(0, 0.85, z2)));
    for (let k = 0; k < 5; k++) P(grey, box(0.18, 0.5, 0.02).applyMatrix4(at(0, 0.85, 0, 0, 0.25, (k / 5) * Math.PI * 2)).applyMatrix4(at(0, 0, 0)));
    for (const dx of [-0.66, 0.66]) P(black, box(0.05, 0.7, 0.05).applyMatrix4(at(dx, 0.5, 0)));
    P(black, box(1.4, 0.05, 0.5).applyMatrix4(at(0, 0.15, 0)));
    for (const dx of [-0.6, 0.6]) P(rubber, cyl(0.1, 0.1, 0.06, 10).applyMatrix4(at(dx, 0.1, 0.25, 0, 0, Math.PI / 2)));
  };
  fan(-19.5, -24.5, 0.7);
  fan(19.3, 19.5, -2.4);

  // oil drums on a spill pallet
  {
    const x0 = -20.2, z0 = 15.2;
    B.add(yellow, box(1.35, 0.15, 1.35).applyMatrix4(at(x0, 0.08, z0)));
    B.add(black, box(1.25, 0.02, 1.25).applyMatrix4(at(x0, 0.17, z0)));
    for (const [dx, dz, mat] of [
      [-0.32, -0.32, drumBlue],
      [0.32, -0.32, drumBlue],
      [-0.32, 0.32, black],
      [0.32, 0.32, drumBlue],
    ] as [number, number, THREE.Material][]) {
      B.add(mat, cyl(0.29, 0.29, 0.88, 22).applyMatrix4(at(x0 + dx, 0.6, z0 + dz)));
      for (const y of [0.45, 0.75]) B.add(mat, new THREE.TorusGeometry(0.29, 0.015, 4, 22).applyMatrix4(at(x0 + dx, y, z0 + dz, 0, Math.PI / 2)));
      B.add(steelLight, cyl(0.04, 0.04, 0.02, 8).applyMatrix4(at(x0 + dx + 0.12, 1.05, z0 + dz)));
    }
  }

  // FOD cans (yellow bins with lids and a FOD stencil)
  {
    const [c, g] = canvas(256, 128);
    g.fillStyle = '#e2ae14';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#111';
    g.font = 'bold 84px Arial';
    g.textAlign = 'center';
    g.fillText('FOD', 128, 96);
    const fodM = new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.55, metalness: 0.2 });
    for (const [x, z] of [
      [-12.2, -26.2],
      [12.8, -27.4],
      [-2.8, 20.6],
    ]) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.25, 0.8, 20), fodM);
      can.position.set(x, 0.4, z);
      can.rotation.y = -Math.PI / 2;
      can.castShadow = can.receiveShadow = true;
      root.add(can);
      B.add(black, cyl(0.3, 0.3, 0.06, 20).applyMatrix4(at(x, 0.83, z)));
    }
  }

  // tyre and wheel rack by the back wall
  {
    const x0 = W2 - 1.1, z0 = 21.5;
    for (const dz of [-1.3, 1.3]) for (const dx of [-0.35, 0.35]) B.add(blue, box(0.06, 1.9, 0.06).applyMatrix4(at(x0 + dx, 0.95, z0 + dz)));
    for (const y of [0.1, 1.0, 1.88]) B.add(blue, box(0.76, 0.06, 2.66).applyMatrix4(at(x0, y, z0)));
    for (const y of [0.52, 1.42]) for (let k = 0; k < 4; k++) {
      B.add(rubber, new THREE.TorusGeometry(0.32, 0.12, 10, 24).applyMatrix4(at(x0, y + 0.02, z0 - 0.95 + k * 0.63, Math.PI / 2)));
      B.add(steelLight, cyl(0.2, 0.2, 0.18, 16).applyMatrix4(at(x0, y + 0.02, z0 - 0.95 + k * 0.63, 0, 0, Math.PI / 2)));
    }
  }

  // scissor lift, platform half raised
  {
    const m = at(-17.2, 0, 21.8, 0.15);
    const P = (mat: THREE.Material, g: THREE.BufferGeometry) => B.add(mat, g.applyMatrix4(m));
    const hgt = 2.4;
    P(orange, box(1.2, 0.45, 2.4).applyMatrix4(at(0, 0.35, 0)));
    for (const z of [-0.9, 0.9]) for (const x of [-0.55, 0.55]) P(rubber, cyl(0.16, 0.16, 0.12, 14).applyMatrix4(at(x, 0.16, z, 0, 0, Math.PI / 2)));
    for (const x of [-0.5, 0.5])
      for (let k = 0; k < 3; k++) {
        const y0 = 0.6 + (k * (hgt - 0.6)) / 3, y1 = 0.6 + ((k + 1) * (hgt - 0.6)) / 3;
        P(yellow, beam(V(x, y0, -1.0), V(x, y1, 1.0), 0.07));
        P(yellow, beam(V(x, y0, 1.0), V(x, y1, -1.0), 0.07));
      }
    P(orange, box(1.25, 0.1, 2.5).applyMatrix4(at(0, hgt + 0.05, 0)));
    for (const x of [-0.6, 0.6]) {
      P(yellow, beam(V(x, hgt, -1.2), V(x, hgt + 1.05, -1.2), 0.04));
      P(yellow, beam(V(x, hgt, 1.2), V(x, hgt + 1.05, 1.2), 0.04));
      P(yellow, beam(V(x, hgt + 1.05, -1.2), V(x, hgt + 1.05, 1.2), 0.04));
    }
    for (const z of [-1.2, 1.2]) P(yellow, beam(V(-0.6, hgt + 1.05, z), V(0.6, hgt + 1.05, z), 0.04));
    P(black, box(0.3, 0.25, 0.15).applyMatrix4(at(0.4, hgt + 1.0, -1.15)));
  }

  // forklift by the racking
  {
    const m = at(W2 - 4.6, 0, -4.8, -Math.PI / 2 + 0.25);
    const P = (mat: THREE.Material, g: THREE.BufferGeometry) => B.add(mat, g.applyMatrix4(m));
    P(yellow, box(1.1, 0.8, 2.0).applyMatrix4(at(0, 0.7, 0)));
    P(black, box(1.12, 0.55, 0.6).applyMatrix4(at(0, 0.7, 0.85)));
    P(black, box(0.5, 0.12, 0.45).applyMatrix4(at(0, 1.2, 0.1)));
    P(black, box(0.5, 0.5, 0.1).applyMatrix4(at(0, 1.45, 0.35)));
    for (const [x, z] of [
      [-0.5, -0.8],
      [0.5, -0.8],
      [-0.5, 0.7],
      [0.5, 0.7],
    ]) {
      P(yellow, box(0.06, 1.2, 0.06).applyMatrix4(at(x, 1.7, z * 0.9)));
      P(rubber, cyl(0.3, 0.3, 0.22, 16).applyMatrix4(at(x * 1.05, 0.3, z, 0, 0, Math.PI / 2)));
    }
    P(yellow, box(1.1, 0.06, 1.8).applyMatrix4(at(0, 2.32, -0.05)));
    for (const x of [-0.35, 0.35]) P(steel, box(0.1, 2.4, 0.12).applyMatrix4(at(x, 1.2, -1.15)));
    P(steel, box(0.9, 0.12, 0.1).applyMatrix4(at(0, 2.35, -1.15)));
    for (const x of [-0.3, 0.3]) {
      P(steel, box(0.12, 0.05, 1.1).applyMatrix4(at(x, 0.12, -1.75)));
      P(steel, box(0.12, 0.6, 0.05).applyMatrix4(at(x, 0.4, -1.22)));
    }
    P(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.05).multiplyScalar(3) }), cyl(0.06, 0.06, 0.12, 10).applyMatrix4(at(0.4, 2.42, 0.6)));
  }

  // rolling tool carts beside the jet
  const toolCart = (x: number, z: number, ry: number) => {
    const m = at(x, 0, z, ry);
    const P = (mat: THREE.Material, g: THREE.BufferGeometry) => B.add(mat, g.applyMatrix4(m));
    for (const y of [0.25, 0.55, 0.85]) {
      P(red, box(0.5, 0.03, 0.8).applyMatrix4(at(0, y, 0)));
      P(red, box(0.52, 0.06, 0.02).applyMatrix4(at(0, y + 0.03, 0.4)));
      P(red, box(0.52, 0.06, 0.02).applyMatrix4(at(0, y + 0.03, -0.4)));
    }
    for (const dx of [-0.24, 0.24]) for (const dz of [-0.38, 0.38]) P(red, box(0.03, 0.8, 0.03).applyMatrix4(at(dx, 0.5, dz)));
    P(steelLight, box(0.04, 0.04, 0.5).applyMatrix4(at(0, 0.95, 0.45)));
    for (const dx of [-0.2, 0.2]) for (const dz of [-0.34, 0.34]) P(rubber, cyl(0.05, 0.05, 0.04, 8).applyMatrix4(at(dx, 0.05, dz, 0, 0, Math.PI / 2)));
    // tools on the top tray
    P(chrome, box(0.04, 0.02, 0.25).applyMatrix4(at(-0.1, 0.88, -0.1, 0.3)));
    P(chrome, box(0.03, 0.02, 0.3).applyMatrix4(at(0.05, 0.88, 0.1, -0.5)));
    P(blue, box(0.1, 0.08, 0.18).applyMatrix4(at(0.12, 0.9, -0.22)));
    P(black, cyl(0.03, 0.03, 0.18, 8).applyMatrix4(at(-0.12, 0.9, 0.25, 0, 0, Math.PI / 2)));
  };
  toolCart(3.4, -7.2, 0.3);
  toolCart(-4.3, 7.8, -0.4);

  // wall screens with the flight schedule, and a digital clock
  {
    const [c, g] = canvas(768, 432);
    g.fillStyle = '#0b1320';
    g.fillRect(0, 0, 768, 432);
    g.fillStyle = '#2d8cff';
    g.fillRect(0, 0, 768, 56);
    g.fillStyle = '#fff';
    g.font = 'bold 30px Arial';
    g.fillText('FLYING SCHEDULE  ·  TODAY', 20, 38);
    const rows = [
      ['1500', 'VIPER 11', 'F-15EX', 'BFM', 'LANDED'],
      ['1530', 'VIPER 21', 'F-15EX', 'DCA', 'LANDED'],
      ['1645', 'RAPTOR 31', 'F-22A', 'OCA', 'AIRBORNE'],
      ['1730', 'VIPER 41', 'F-15EX', 'FCF', 'READY'],
      ['1815', 'NIGHT 11', 'F-15EX', 'NVG', 'BRIEF'],
      ['1900', 'NIGHT 21', 'F-15EX', 'NVG', 'BRIEF'],
    ];
    g.font = '24px monospace';
    rows.forEach((r, i) => {
      const y = 100 + i * 52;
      g.fillStyle = i % 2 ? '#101c2c' : '#0d1726';
      g.fillRect(10, y - 32, 748, 46);
      g.fillStyle = '#cfe0f5';
      r.forEach((t, k) => {
        if (k === 4) g.fillStyle = t === 'AIRBORNE' ? '#5fe08a' : t === 'READY' ? '#ffd24a' : t === 'LANDED' ? '#8aa0b8' : '#cfe0f5';
        g.fillText(t, 20 + [0, 100, 270, 420, 560][k], y);
      });
    });
    const scr = new THREE.MeshBasicMaterial({ map: tex(c), color: new THREE.Color(1, 1, 1).multiplyScalar(1.3) });
    for (const z of [-14.3, -12.2]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.07), scr);
      m.position.set(-W2 + 0.09, 2.75, z);
      m.rotation.y = Math.PI / 2;
      root.add(m);
      B.add(black, box(0.06, 1.15, 2.0).applyMatrix4(at(-W2 + 0.05, 2.75, z)));
    }
    const [cc, cg] = canvas(512, 160);
    cg.fillStyle = '#120404';
    cg.fillRect(0, 0, 512, 160);
    cg.fillStyle = '#ff3b1f';
    cg.font = 'bold 120px monospace';
    cg.textAlign = 'center';
    cg.fillText('18:42', 256, 125);
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.44), new THREE.MeshBasicMaterial({ map: tex(cc), color: new THREE.Color(1, 1, 1).multiplyScalar(2) }));
    clock.position.set(-W2 + 0.09, 4.3, -13.25);
    clock.rotation.y = Math.PI / 2;
    root.add(clock);
    B.add(black, box(0.06, 0.5, 1.5).applyMatrix4(at(-W2 + 0.05, 4.3, -13.25)));
  }

  // vending machine and a coffee counter in front of the offices
  {
    const [c, g] = canvas(256, 480);
    const gr = g.createLinearGradient(0, 0, 0, 480);
    gr.addColorStop(0, '#1b3d74');
    gr.addColorStop(1, '#0b1a36');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 480);
    for (let row = 0; row < 6; row++)
      for (let k = 0; k < 5; k++) {
        g.fillStyle = ['#e33', '#fc3', '#3c6', '#39f', '#f80'][(row + k) % 5];
        g.fillRect(18 + k * 36, 30 + row * 62, 26, 44);
      }
    g.fillStyle = '#000';
    g.fillRect(24, 410, 180, 44);
    const vm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), new THREE.MeshBasicMaterial({ map: tex(c), color: new THREE.Color(1, 1, 1).multiplyScalar(1.4) }));
    vm.position.set(6.2, 0.95, oz0 - 0.86);
    vm.rotation.y = Math.PI;
    root.add(vm);
    B.add(black, box(1.0, 1.9, 0.8).applyMatrix4(at(6.2, 0.95, oz0 - 0.45)));
    B.add(desk, box(1.8, 0.9, 0.6).applyMatrix4(at(8.2, 0.45, oz0 - 0.35)));
    B.add(black, box(0.35, 0.45, 0.35).applyMatrix4(at(7.8, 1.12, oz0 - 0.35)));
    B.add(desk, cyl(0.05, 0.045, 0.1, 10).applyMatrix4(at(8.3, 0.95, oz0 - 0.4)));
    B.add(desk, cyl(0.05, 0.045, 0.1, 10).applyMatrix4(at(8.5, 0.95, oz0 - 0.3)));
  }

  // wire shelving with parts bins on the left wall
  {
    const x0 = -W2 + 0.4, z0 = 12.8;
    for (const dz of [-0.9, 0.9]) for (const dx of [-0.28, 0.28]) B.add(chrome, cyl(0.015, 0.015, 2.0, 6).applyMatrix4(at(x0 + dx, 1.0, z0 + dz)));
    const r = rng(23);
    for (let k = 0; k < 5; k++) {
      const y = 0.15 + k * 0.45;
      B.add(chrome, box(0.58, 0.02, 1.82).applyMatrix4(at(x0, y, z0)));
      for (let b = 0; b < 5; b++) {
        if (r() < 0.2) continue;
        const col = [blue, red, yellow, grey][Math.floor(r() * 4)];
        B.add(col, box(0.45, 0.22, 0.3).applyMatrix4(at(x0, y + 0.12, z0 - 0.7 + b * 0.35)));
      }
    }
  }

  // a bicycle leaning on the wall by the door (every flight line has one)
  {
    const m = at(W2 - 0.45, 0, -25.3, 0);
    const P = (mat: THREE.Material, g: THREE.BufferGeometry) => B.add(mat, g.applyMatrix4(m));
    for (const z of [-0.52, 0.52]) {
      P(rubber, new THREE.TorusGeometry(0.33, 0.025, 6, 28).applyMatrix4(at(0, 0.34, z, Math.PI / 2)));
      P(chrome, cyl(0.03, 0.03, 0.08, 8).applyMatrix4(at(0, 0.34, z, 0, 0, Math.PI / 2)));
    }
    P(red, beam(V(0, 0.34, -0.52), V(0, 0.78, -0.2), 0.035));
    P(red, beam(V(0, 0.78, -0.2), V(0, 0.8, 0.38), 0.035));
    P(red, beam(V(0, 0.34, 0.52), V(0, 0.8, 0.38), 0.035));
    P(red, beam(V(0, 0.34, 0.52), V(0, 0.4, 0), 0.03));
    P(red, beam(V(0, 0.4, 0), V(0, 0.78, -0.2), 0.03));
    P(black, box(0.12, 0.05, 0.25).applyMatrix4(at(0, 0.88, 0.4)));
    P(chrome, beam(V(0, 0.78, -0.2), V(0, 1.0, -0.3), 0.025));
    P(black, box(0.5, 0.03, 0.03).applyMatrix4(at(0, 1.02, -0.32)));
  }

  // eyewash station and coiled air hoses
  {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#0d8a3c';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fff';
    g.font = 'bold 44px Arial';
    g.textAlign = 'center';
    g.fillText('EYE WASH', 128, 90);
    g.fillText('STATION', 128, 150);
    const sgn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.6 }));
    sgn.position.set(W2 - 0.03, 2.3, -6.4);
    sgn.rotation.y = -Math.PI / 2;
    root.add(sgn);
    B.add(yellow, box(0.25, 0.5, 0.4).applyMatrix4(at(W2 - 0.15, 1.4, -6.4)));
    for (let k = 0; k < 4; k++) B.add(yellow, new THREE.TorusGeometry(0.34 - k * 0.015, 0.018, 6, 28).applyMatrix4(at(W2 - 1.9, 0.02 + k * 0.035, 9.9, 0, Math.PI / 2)));
  }

  // --- outside: the airfield, its buildings, trees, mountains and the golden-hour sky ------------------------------
  const sunTo = SUN_DIR.clone().negate();
  const outside = buildOutside(root, scene, sunTo, D2, q);

  B.build(root);

  // --- lights ---------------------------------------------------------------------------------------------------
  // golden hour: a low orange sun straight in through the doors and the left windows
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.46, 0.18), 4.8);
  sun.position.copy(sunTo).multiplyScalar(170);
  sun.target.position.set(0, 0, -20);
  const sunMap = q === 'low' ? 1024 : q === 'medium' ? 2048 : 4096;
  sun.castShadow = true;
  sun.shadow.mapSize.set(sunMap, sunMap);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -80;
  sc.right = 80;
  sc.top = 80;
  sc.bottom = -80;
  sc.near = 30;
  sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.08;
  // nothing in here moves: the shadow maps are drawn once, and again only when the jet changes
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun);
  scene.add(sun.target);
  // the dusk sky (cool) from above and the warm ground bounce
  // (the ground colour carries the warm bounce off the sunlit floor)
  const hemi = new THREE.HemisphereLight(0x8ea4cc, 0x8a6040, 0.34);
  scene.add(hemi);
  // cool LED high-bays: a key over the jet (casting its shadow) and two softer ones fore and aft
  const key = new THREE.SpotLight(0xf1f4ff, 260, 40, 0.75, 0.9, 1.6);
  key.position.set(1.5, 12.8, 1);
  key.target.position.set(0, 0, 0);
  key.castShadow = q !== 'low';
  key.shadow.mapSize.set(q === 'medium' ? 1024 : 2048, q === 'medium' ? 1024 : 2048);
  key.shadow.bias = -0.0002;
  key.shadow.radius = 4;
  key.shadow.autoUpdate = false;
  key.shadow.needsUpdate = true;
  scene.add(key);
  scene.add(key.target);
  for (const z of [-11, 12]) {
    const s2 = new THREE.SpotLight(0xf1f4ff, 130, 36, 0.85, 1, 1.6);
    s2.position.set(0, 12.8, z);
    s2.target.position.set(0, 0, z * 0.6);
    scene.add(s2);
    scene.add(s2.target);
  }

  // --- sunbeams through the door and the left windows, with dust --------------------------------------------------
  const beams = new THREE.Group();
  root.add(beams);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(1.0, 0.66, 0.36).multiplyScalar(0.03) }, hbox: { value: new THREE.Vector2(W2, D2) } },
    vertexShader: /* glsl */ `
      attribute vec2 bt;
      varying vec2 vB;
      varying float vDist;
      varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vB = bt;
        vW = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 col;
      uniform vec2 hbox;
      varying vec2 vB;
      varying float vDist;
      varying vec3 vW;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        // only inside the building (low sun: the shafts would run on through the walls)
        if ( abs( vW.x ) > hbox.x - 0.2 || vW.z > hbox.y - 6.6 || vW.z < -hbox.y ) discard;
        // soft across the beam, fading toward the floor, and near the camera
        float across = smoothstep( 0.0, 0.45, vB.x ) * smoothstep( 1.0, 0.55, vB.x );
        float along = ( 1.0 - vB.y * 0.6 ) * smoothstep( 0.0, 0.08, vB.y );
        float near = smoothstep( 2.0, 9.0, vDist );
        // fade out well above the floor so no beam ever reads as a stripe on the ground
        float high = smoothstep( 1.5, 4.5, vW.y );
        gl_FragColor = vec4( col * across * along * near * high, 1.0 );
      }`,
  });
  /** a light shaft from a wall opening (4 corners, in order) down along the sun to the floor */
  const shaft = (c: THREE.Vector3[]) => {
    const ends = c.map((p) => p.clone().addScaledVector(SUN_DIR, p.y / -SUN_DIR.y));
    const pos: number[] = [];
    const bt: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4], a2 = ends[i], b2 = ends[(i + 1) % 4];
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z, a.x, a.y, a.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
      bt.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('bt', new THREE.Float32BufferAttribute(bt, 2));
    const m = new THREE.Mesh(g, beamMat);
    m.renderOrder = 5;
    beams.add(m);
  };
  // left-wall windows (the sun is on the left)
  for (let z = -D2; z < D2 - 0.1; z += 6) {
    const z0 = z + (z === -D2 ? 1.5 : 0.6), z1 = z + 6 - (z + 6 >= D2 - 0.1 ? 1.5 : 0.6);
    const x = -W2;
    shaft([V(x, WIN_Y0, z0), V(x, WIN_Y0, z1), V(x, WIN_Y1, z1), V(x, WIN_Y1, z0)]);
  }
  // (no shaft for the door opening: it is far too wide to read as a beam, and a flat
  // sheet of glow sloping down through the whole bay looked like a band on the floor)

  // dust motes drifting in the light
  const N = 900;
  const dustPos = new Float32Array(N * 3);
  const r = rng(99);
  const seedDust = (i: number) => {
    // a random point inside one of the window shafts, or the big one from the doors
    let p: THREE.Vector3;
    if (i % 2) {
      const z = -D2 + 2 + r() * (HANGAR.D - 4);
      const y0 = WIN_Y0 + r() * (WIN_Y1 - WIN_Y0);
      const t = r() * (y0 / -SUN_DIR.y) * 0.5;
      p = V(-W2, y0, z).addScaledVector(SUN_DIR, t);
    } else {
      const y0 = r() * DOOR_H;
      const t = r() * 26;
      p = V(-DOOR_W2 + r() * DOOR_W2 * 2, y0, -D2).addScaledVector(SUN_DIR, t);
      if (p.y < 0.2) p.y = 0.2 + r() * 3;
    }
    dustPos[i * 3] = p.x;
    dustPos[i * 3 + 1] = p.y;
    dustPos[i * 3 + 2] = p.z;
  };
  for (let i = 0; i < N; i++) seedDust(i);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: new THREE.Color(1, 0.78, 0.5).multiplyScalar(0.9), size: 0.012, sizeAttenuation: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  dust.frustumCulled = false;
  root.add(dust);
  let tDust = 0;

  // --- ground equipment tied to the jet: rebuilt when the jet changes ------------------------------------------------
  const jetProps = new THREE.Group();
  root.add(jetProps);
  const yellowDuct = new THREE.MeshStandardMaterial({ color: 0xd8b21c, roughness: 0.75, metalness: 0.05 });
  const placeJetProps = (ac: Aircraft, vis: AirframeVisual) => {
    for (const c of [...jetProps.children]) {
      jetProps.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const P = new Batch();
    const s = ac.spec;
    const beige = new THREE.MeshStandardMaterial({ color: 0xcfc7b2, roughness: 0.6, metalness: 0.15 });
    const rootY = s.gear.height + 0.12;
    // wheel chocks at the nose and main wheels
    const chock = (x: number, z: number) => {
      for (const dz of [-0.55, 0.55]) P.add(yellow, box(0.3, 0.2, 0.28).applyMatrix4(at(x, 0.1, z + dz)));
      P.add(black, beam(V(x, 0.1, z - 0.45), V(x, 0.1, z + 0.45), 0.02));
    };
    chock(0, s.gear.nose);
    for (const sx of [-1, 1]) chock(sx * s.gear.track, s.gear.main);
    // boarding ladder hooked over the left cockpit sill
    const e = vis.cockpitEye;
    const top = V(-0.72, rootY + e.y - 0.35, e.z + 0.25);
    const foot = V(-2.35, 0, e.z + 0.25);
    for (const dz of [-0.24, 0.24]) {
      P.add(yellow, beam(foot.clone().setZ(foot.z + dz), top.clone().setZ(top.z + dz), 0.05));
      P.add(yellow, beam(top.clone().setZ(top.z + dz), top.clone().setZ(top.z + dz).add(V(0.25, 0.12, 0)), 0.04));
      P.add(rubber, box(0.14, 0.05, 0.12).applyMatrix4(at(foot.x, 0.025, foot.z + dz)));
    }
    const len = foot.distanceTo(top);
    for (let d = 0.3; d < len - 0.1; d += 0.3) {
      const p = foot.clone().lerp(top, d / len);
      P.add(steelLight, box(0.12, 0.03, 0.46).applyMatrix4(at(p.x, p.y, p.z)));
    }
    P.add(yellow, box(0.3, 0.04, 0.5).applyMatrix4(at(top.x + 0.15, top.y + 0.05, top.z)));
    // cones with reflective bands off each wingtip and the nose
    const cone = (x: number, z: number) => {
      P.add(orange, cyl(0.03, 0.2, 0.7, 16).applyMatrix4(at(x, 0.38, z)));
      P.add(desk, cyl(0.1, 0.14, 0.12, 16).applyMatrix4(at(x, 0.4, z)));
      P.add(black, box(0.46, 0.04, 0.46).applyMatrix4(at(x, 0.02, z)));
    };
    for (const sx of [-1, 1]) cone(sx * (s.span / 2 + 0.8), 1.5);
    cone(-1.2, -s.length / 2 - 1.5);
    // ground power cart with its cable to the jet
    {
      const gx = -6.8, gz = -3;
      P.add(desk, box(1.2, 1.1, 2.0).applyMatrix4(at(gx, 0.85, gz, 0.2)));
      P.add(frame, box(1.25, 0.08, 2.05).applyMatrix4(at(gx, 1.44, gz, 0.2)));
      for (const dz of [-0.7, 0.7]) for (const dx of [-0.55, 0.55]) P.add(rubber, cyl(0.25, 0.25, 0.14, 14).applyMatrix4(at(gx + dx, 0.25, gz + dz, 0.2, 0, Math.PI / 2)));
      P.add(steel, beam(V(gx - 0.3, 0.35, gz - 1.0), V(gx - 0.5, 0.2, gz - 1.9), 0.05));
      const cable = new THREE.CatmullRomCurve3([V(gx + 0.5, 0.7, gz + 0.4), V(gx + 1.5, 0.05, gz + 0.9), V(-2.5, 0.04, 0.5), V(-1.2, 0.05, 1.2), V(-0.6, rootY - 0.6, 1.4)]);
      P.add(rubber, new THREE.TubeGeometry(cable, 40, 0.035, 6, false));
      // flight-line extinguisher on its wheels
      const fx = 5.8, fz = -9.5;
      P.add(red, cyl(0.28, 0.28, 1.1, 18).applyMatrix4(at(fx, 0.95, fz)));
      P.add(red, cyl(0.28, 0.18, 0.2, 18).applyMatrix4(at(fx, 1.6, fz)));
      P.add(black, cyl(0.04, 0.04, 0.2, 8).applyMatrix4(at(fx, 1.78, fz)));
      P.add(steel, beam(V(fx - 0.35, 0.35, fz), V(fx - 0.35, 1.5, fz - 0.4), 0.04));
      P.add(steel, beam(V(fx + 0.35, 0.35, fz), V(fx + 0.35, 1.5, fz - 0.4), 0.04));
      P.add(steel, beam(V(fx - 0.35, 1.5, fz - 0.4), V(fx + 0.35, 1.5, fz - 0.4), 0.04));
      for (const dx of [-0.42, 0.42]) P.add(rubber, cyl(0.32, 0.32, 0.1, 18).applyMatrix4(at(fx + dx, 0.32, fz, 0, 0, Math.PI / 2)));
      P.add(black, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(fx + 0.1, 1.7, fz), V(fx + 0.5, 1.2, fz + 0.3), V(fx + 0.4, 0.8, fz + 0.25)]), 12, 0.02, 5, false));
    }
    // tow bar lying at the nose wheel
    P.add(yellow, beam(V(0.1, 0.35, s.gear.nose - 0.5), V(0.9, 0.18, s.gear.nose - 4.4), 0.07));
    for (const dx of [-0.25, 0.25]) P.add(rubber, cyl(0.15, 0.15, 0.08, 12).applyMatrix4(at(0.9 + dx, 0.15, s.gear.nose - 4.3, 0, 0, Math.PI / 2)));
    P.add(yellow, new THREE.TorusGeometry(0.12, 0.03, 6, 12).applyMatrix4(at(0.95, 0.18, s.gear.nose - 4.7, 0, Math.PI / 2)));
    // air-conditioning cart with its flexible duct up into the avionics bay
    {
      const ax = 8.4, az = s.gear.nose + 2.5;
      P.add(beige, box(1.5, 1.5, 2.6).applyMatrix4(at(ax, 1.05, az, 0.1)));
      P.add(black, box(1.52, 0.12, 2.62).applyMatrix4(at(ax, 1.84, az, 0.1)));
      for (let k = 0; k < 6; k++) P.add(frame, box(0.02, 1.0, 0.05).applyMatrix4(at(ax - 0.76, 1.0, az - 0.8 + k * 0.3, 0.1)));
      for (const dz of [-1.0, 1.0]) for (const dx of [-0.62, 0.62]) P.add(rubber, cyl(0.28, 0.28, 0.16, 16).applyMatrix4(at(ax + dx, 0.28, az + dz, 0.1, 0, Math.PI / 2)));
      const duct = new THREE.CatmullRomCurve3([V(ax - 0.75, 1.2, az + 0.5), V(ax - 2.5, 0.25, az + 0.8), V(3.2, 0.2, az), V(1.2, 0.5, az - 1.0), V(0.35, rootY - 0.45, s.gear.nose + 1.6)]);
      P.add(yellowDuct, new THREE.TubeGeometry(duct, 48, 0.14, 10, false));
    }
    // tool box and a drip tray under the engines
    P.add(red, box(0.55, 0.3, 0.3).applyMatrix4(at(1.8, 0.15, -s.length / 2 + 2.5, 0.4)));
    P.add(black, box(2.2, 0.06, 1.3).applyMatrix4(at(0, 0.03, s.length / 2 - 3.2)));
    P.build(jetProps);
    sun.shadow.needsUpdate = true;
    key.shadow.needsUpdate = true;
  };

  return {
    sun,
    setSunDisc: (on: boolean) => outside.setSunDisc(on),
    update(dt: number) {
      outside.update(dt);
      tDust += dt;
      // slow Brownian drift; motes that leave their beam start again inside it
      const a = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        dustPos[k] += Math.sin(tDust * 0.3 + i) * 0.004 + 0.002;
        dustPos[k + 1] += Math.sin(tDust * 0.23 + i * 1.7) * 0.003 - 0.0015;
        dustPos[k + 2] += Math.cos(tDust * 0.27 + i * 0.7) * 0.004;
        if (dustPos[k + 1] < 0.2 || dustPos[k] > W2 - 1 || dustPos[k + 2] > D2 - 7 || (i + Math.floor(tDust * 10)) % 3000 === 0) seedDust(i);
      }
      a.needsUpdate = true;
    },
    placeJetProps,
  };
}
