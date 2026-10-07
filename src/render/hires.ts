// Big planet maps (Mars's Viking mosaic, Earth's Blue Marble, its city lights
// and clouds) are too large to inline into the single-file build, so they are
// fetched at run time from public/hires next to the page. Where one can't be
// fetched, or the graphics card can't take a texture that size, the built-in
// (or painted) map stays.

import * as THREE from 'three';

let maxTex = -1;
/** the biggest texture this browser's WebGL takes */
export function maxTextureSize(): number {
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

const pending = new Map<string, Promise<HTMLImageElement | null>>();

/** one of the big maps (`hires/<file>`), once loaded; null where it can't be had (or is wider than the GPU takes) */
export function hiresImage(file: string, width: number): Promise<HTMLImageElement | null> {
  let p = pending.get(file);
  if (!p) {
    p = new Promise((resolve) => {
      if (maxTextureSize() < width) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img.naturalWidth >= width ? img : null);
      img.onerror = () => resolve(null);
      img.src = `${import.meta.env.BASE_URL}hires/${file}`;
    });
    pending.set(file, p);
  }
  return p;
}

/** the best of a list of maps (biggest first) that this machine can have */
export async function bestHires(files: [string, number][]): Promise<HTMLImageElement | null> {
  for (const [f, w] of files) {
    if (maxTextureSize() < w) continue;
    const img = await hiresImage(f, w);
    if (img) return img;
  }
  return null;
}

/** a texture for one of the big maps; `then` runs when its image is in */
export function hiresTexture(files: [string, number][], srgb: boolean, then?: (t: THREE.Texture) => void): THREE.Texture {
  const t = new THREE.Texture();
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  void bestHires(files).then((img) => {
    if (!img) return;
    swapImage(t, img);
    then?.(t);
  });
  return t;
}

/** put a new (bigger) image in a texture. The GPU copy was allocated at the old size and
 *  can't grow, so it is released first and made again at the next draw. */
export function swapImage(t: THREE.Texture, img: HTMLImageElement): void {
  t.dispose();
  t.image = img;
  t.needsUpdate = true;
}

/** Mars: swap a texture's image for the 8k Viking mosaic when it arrives */
export function upgradeToHires(t: THREE.Texture, then?: () => void): void {
  void hiresImage('mars_8k.jpg', 8192).then((img) => {
    if (!img) return;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    swapImage(t, img);
    then?.();
  });
}
