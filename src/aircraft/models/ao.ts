// Ambient occlusion volume for an airframe: the (low density) surface is
// rasterised into a 3D grid in body coordinates and blurred. The paint shader
// marches a few steps out along the surface normal through it; wherever other
// parts of the jet are close by (wing roots, the tunnel between the engines,
// intake lips, under the fuselage, tails over the booms) the sky and
// reflections are dimmed, the way they are on the real aircraft.

import * as THREE from 'three';

export interface AoVolume {
  tex: THREE.Data3DTexture;
  min: THREE.Vector3;
  size: THREE.Vector3;
}

const MAX_CELLS = 120;

export function buildAoVolume(geo: THREE.BufferGeometry): AoVolume {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!.clone().expandByScalar(1.2);
  const size = bb.getSize(new THREE.Vector3());
  const cs = Math.max(size.x, size.y, size.z) / MAX_CELLS;
  const nx = Math.max(2, Math.ceil(size.x / cs));
  const ny = Math.max(2, Math.ceil(size.y / cs));
  const nz = Math.max(2, Math.ceil(size.z / cs));
  size.set(nx * cs, ny * cs, nz * cs);
  const grid = new Float32Array(nx * ny * nz);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const idx = geo.index;
  const tri = idx ? idx.count / 3 : pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  const mark = (v: THREE.Vector3) => {
    const x = Math.floor((v.x - bb.min.x) / cs), y = Math.floor((v.y - bb.min.y) / cs), z = Math.floor((v.z - bb.min.z) / cs);
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return;
    grid[x + nx * (y + ny * z)] = 1;
  };
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    const e = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const n = Math.max(1, Math.ceil(e / (cs * 0.5)));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n;
        p.copy(a).multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
        mark(p);
      }
    }
  }
  // two separable box blurs: a soft density field around the skin
  let src = grid, dst = new Float32Array(grid.length);
  const blur = (dx: number, dy: number, dz: number) => {
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          let s = 0, w = 0;
          for (let k = -2; k <= 2; k++) {
            const X = x + dx * k, Y = y + dy * k, Z = z + dz * k;
            if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
            const f = 3 - Math.abs(k);
            s += src[X + nx * (Y + ny * Z)] * f;
            w += f;
          }
          dst[x + nx * (y + ny * z)] = s / 9;
          void w;
        }
    [src, dst] = [dst, src];
  };
  blur(1, 0, 0);
  blur(0, 1, 0);
  blur(0, 0, 1);
  const data = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) data[i] = Math.min(255, Math.round(src[i] * 255 * 2.2));
  const tex = new THREE.Data3DTexture(data, nx, ny, nz);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return { tex, min: bb.min.clone(), size };
}

let blank: THREE.Data3DTexture | null = null;
export function blankAo(): THREE.Data3DTexture {
  if (!blank) {
    blank = new THREE.Data3DTexture(new Uint8Array([0]), 1, 1, 1);
    blank.format = THREE.RedFormat;
    blank.unpackAlignment = 1;
    blank.needsUpdate = true;
  }
  return blank;
}
