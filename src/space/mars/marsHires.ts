// The 8192 x 4096 Viking colour mosaic of Mars (2.6 km a pixel): eight times the
// detail of the built-in map. It is too big to inline into the single-file
// build, so it is fetched at run time from next to the page; where it can't be
// fetched, or the graphics card can't take a texture that size, the built-in
// map stays.

import * as THREE from 'three';

let maxTex = -1;
/** the biggest texture this browser's WebGL takes */
function maxTextureSize(): number {
  if (maxTex >= 0) return maxTex;
  maxTex = 0;
  try {
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
    if (gl) {
      maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    maxTex = 0;
  }
  return maxTex;
}

let pending: Promise<HTMLImageElement | null> | null = null;

/** the big mosaic, once it has loaded (null where it can't be had) */
export function marsHires(): Promise<HTMLImageElement | null> {
  if (!pending) {
    pending = new Promise((resolve) => {
      if (maxTextureSize() < 8192) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img.naturalWidth >= 8192 ? img : null);
      img.onerror = () => resolve(null);
      img.src = `${import.meta.env.BASE_URL}hires/mars_8k.jpg`;
    });
  }
  return pending;
}

/** swap a texture's image for the big mosaic when it arrives */
export function upgradeToHires(t: THREE.Texture, then?: () => void): void {
  void marsHires().then((img) => {
    if (!img) return;
    t.image = img;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    then?.();
  });
}
