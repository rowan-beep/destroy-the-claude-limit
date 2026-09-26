// Coalition insignia. BLUE: blue roundel with a white four-point star.
// RED: red roundel with a white triangle. (Fictional coalition markings.)

import * as THREE from 'three';
import type { Team } from '../../core/constants';

const texCache = new Map<string, THREE.Texture>();

function insigniaTexture(team: Team): THREE.Texture {
  const key = team;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  g.globalAlpha = 0.85;
  g.fillStyle = team === 'blue' ? '#2b4a8f' : '#9b2320';
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e9e9e4';
  g.beginPath();
  if (team === 'blue') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 50 : 16;
      const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
  } else {
    g.moveTo(64, 18);
    g.lineTo(106, 92);
    g.lineTo(22, 92);
  }
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

export function makeInsignia(team: Team, size: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      map: insigniaTexture(team),
      transparent: true,
      roughness: 0.6,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      depthWrite: false,
    }),
  );
  return m;
}
