// The camera's processor, off the main thread: a captured frame in, the RAW (a
// lossless PNG of the sensor's picture), the developed JPEG and the album's
// thumbnail out.

import { develop, DevelopParams, withProfile } from './develop';

export interface DevelopJob {
  id: number;
  bmp: ImageBitmap;
  w: number;
  h: number;
  params: DevelopParams;
  /** a caption along the bottom of the JPEG */
  caption: string | null;
  jpeg: boolean;
  raw: boolean;
  quality: number;
  thumbW: number;
}

export interface DevelopResult {
  id: number;
  jpeg: Blob | null;
  raw: Blob | null;
  thumb: Blob | null;
  error?: string;
}

const ctx = self as unknown as { postMessage(m: DevelopResult): void; onmessage: ((e: MessageEvent<DevelopJob>) => void) | null };

ctx.onmessage = async (e) => {
  const j = e.data;
  try {
    const c = new OffscreenCanvas(j.w, j.h);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(j.bmp, 0, 0, j.w, j.h);
    j.bmp.close();
    const raw = j.raw ? await c.convertToBlob({ type: 'image/png' }) : null;
    let jpeg: Blob | null = null, thumb: Blob | null = null;
    const img = g.getImageData(0, 0, j.w, j.h);
    develop(img, j.params);
    g.putImageData(img, 0, 0);
    if (j.caption) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, j.h - Math.round(j.h / 34), j.w, Math.round(j.h / 34));
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.font = `600 ${Math.round(j.h / 45)}px Rajdhani, system-ui, sans-serif`;
      g.fillText(j.caption, Math.round(j.h / 80), j.h - Math.round(j.h / 110));
    }
    if (j.jpeg || !raw) {
      jpeg = await c.convertToBlob({ type: 'image/jpeg', quality: j.quality });
      if (j.params.adobe) jpeg = await withProfile(jpeg);
    }
    const th = Math.round((j.thumbW * j.h) / j.w);
    const t = new OffscreenCanvas(j.thumbW, th);
    const tg = t.getContext('2d')!;
    tg.imageSmoothingQuality = 'high';
    tg.drawImage(c, 0, 0, j.thumbW, th);
    thumb = await t.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    ctx.postMessage({ id: j.id, jpeg, raw, thumb });
  } catch (err) {
    ctx.postMessage({ id: j.id, jpeg: null, raw: null, thumb: null, error: String(err) });
  }
};
