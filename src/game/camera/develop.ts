// Developing a picture: what the camera's processor does to the sensor's image to
// make the JPEG (white balance, the picture style, the colour space), and what the
// album's DEVELOP panel does to a RAW. The same arithmetic as the live view's shader
// (FinalPass), so the picture looks like the viewfinder did.

export interface DevelopParams {
  /** white balance gains (r, g, b) */
  wb: [number, number, number];
  /** exposure change (stops) */
  ev: number;
  contrast: number;
  saturation: number;
  lift: number;
  warm: number;
  mono: number;
  /** write Adobe RGB (with its profile) instead of sRGB */
  adobe: boolean;
}

export const NEUTRAL: DevelopParams = { wb: [1, 1, 1], ev: 0, contrast: 1, saturation: 1, lift: 0, warm: 0, mono: 0, adobe: false };

const toLin = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  toLin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const LUT = 4096;
const toSrgb = new Uint8ClampedArray(LUT + 1);
const toAdobe = new Uint8ClampedArray(LUT + 1);
for (let i = 0; i <= LUT; i++) {
  const l = i / LUT;
  toSrgb[i] = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055));
  toAdobe[i] = Math.round(255 * Math.pow(l, 1 / 2.19921875));
}

/** develop an sRGB image in place */
export function develop(img: ImageData, p: DevelopParams): void {
  const d = img.data;
  const evk = Math.pow(2, p.ev);
  const [wr, wg, wb] = p.wb;
  const rk = wr * (1 + p.warm), gk = wg, bk = wb * (1 - p.warm);
  const con = p.contrast, sat = p.saturation, lift = p.lift, mono = p.mono;
  const exposure = Math.abs(p.ev) > 1e-3;
  for (let i = 0; i < d.length; i += 4) {
    let r: number, g: number, b: number;
    if (exposure) {
      // exposure in linear light, back to the picture's own encoding
      r = toSrgb[Math.min(LUT, Math.round(toLin[d[i]] * evk * LUT))] / 255;
      g = toSrgb[Math.min(LUT, Math.round(toLin[d[i + 1]] * evk * LUT))] / 255;
      b = toSrgb[Math.min(LUT, Math.round(toLin[d[i + 2]] * evk * LUT))] / 255;
    } else {
      r = d[i] / 255;
      g = d[i + 1] / 255;
      b = d[i + 2] / 255;
    }
    // saturation, then the contrast curve
    let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    b = l + (b - l) * sat;
    r = r < 0 ? 0 : r > 1 ? 1 : r;
    g = g < 0 ? 0 : g > 1 ? 1 : g;
    b = b < 0 ? 0 : b > 1 ? 1 : b;
    if (con >= 1) {
      const k = (con - 1) * 1.6;
      r += (r * r * (3 - 2 * r) - r) * k;
      g += (g * g * (3 - 2 * g) - g) * k;
      b += (b * b * (3 - 2 * b) - b) * k;
    } else {
      const k = 0.5 + 0.5 * con;
      r = 0.5 + (r - 0.5) * k;
      g = 0.5 + (g - 0.5) * k;
      b = 0.5 + (b - 0.5) * k;
    }
    // white balance and warmth
    r *= rk;
    g *= gk;
    b *= bk;
    r = r < 0 ? 0 : r > 1 ? 1 : r;
    g = g < 0 ? 0 : g > 1 ? 1 : g;
    b = b < 0 ? 0 : b > 1 ? 1 : b;
    if (mono > 0) {
      l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r += (l - r) * mono;
      g += (l - g) * mono;
      b += (l - b) * mono;
    }
    if (lift > 0) {
      r = r * (1 - lift) + lift;
      g = g * (1 - lift) + lift;
      b = b * (1 - lift) + lift;
    }
    if (p.adobe) {
      // to linear sRGB, through the matrix to Adobe RGB (1998) primaries, its 2.2 curve
      const R = toLin[Math.round(r * 255)], G = toLin[Math.round(g * 255)], B = toLin[Math.round(b * 255)];
      const ar = 0.7152 * R + 0.2848 * G;
      const ag = G;
      const ab = 0.0412 * G + 0.9588 * B;
      d[i] = toAdobe[Math.min(LUT, Math.round(ar * LUT))];
      d[i + 1] = toAdobe[Math.min(LUT, Math.round(ag * LUT))];
      d[i + 2] = toAdobe[Math.min(LUT, Math.round(ab * LUT))];
    } else {
      d[i] = r * 255 + 0.5;
      d[i + 1] = g * 255 + 0.5;
      d[i + 2] = b * 255 + 0.5;
    }
  }
}

// ---- an ICC v2 display profile with the Adobe RGB (1998) primaries, so programs
//      that manage colour show the wide-gamut JPEG right

function iccProfile(): Uint8Array {
  const enc = new TextEncoder();
  const s15 = (v: number) => Math.round(v * 65536);
  const parts: { sig: string; data: Uint8Array }[] = [];
  const xyz = (x: number, y: number, z: number) => {
    const b = new DataView(new ArrayBuffer(20));
    b.setUint32(0, 0x58595a20); // 'XYZ '
    b.setInt32(8, s15(x));
    b.setInt32(12, s15(y));
    b.setInt32(16, s15(z));
    return new Uint8Array(b.buffer);
  };
  const desc = (text: string) => {
    const t = enc.encode(text + '\0');
    const b = new DataView(new ArrayBuffer(12 + t.length + 4 + 4 + 2 + 1 + 67));
    b.setUint32(0, 0x64657363); // 'desc'
    b.setUint32(8, t.length);
    new Uint8Array(b.buffer).set(t, 12);
    return new Uint8Array(b.buffer);
  };
  const text = (t: string) => {
    const a = enc.encode(t + '\0');
    const b = new Uint8Array(8 + a.length);
    new DataView(b.buffer).setUint32(0, 0x74657874); // 'text'
    b.set(a, 8);
    return b;
  };
  const curv = () => {
    const b = new DataView(new ArrayBuffer(14));
    b.setUint32(0, 0x63757276); // 'curv'
    b.setUint32(8, 1);
    b.setUint16(12, 0x0233); // gamma 563/256 = 2.19921875
    return new Uint8Array(b.buffer);
  };
  parts.push({ sig: 'desc', data: desc('TRIAD wide gamut (Adobe RGB (1998) compatible)') });
  parts.push({ sig: 'cprt', data: text('No copyright, use freely') });
  parts.push({ sig: 'wtpt', data: xyz(0.9642, 1, 0.8249) });
  parts.push({ sig: 'rXYZ', data: xyz(0.60974, 0.31111, 0.01947) });
  parts.push({ sig: 'gXYZ', data: xyz(0.20528, 0.62567, 0.06087) });
  parts.push({ sig: 'bXYZ', data: xyz(0.14919, 0.06322, 0.74457) });
  const trc = curv();
  const tags: [string, number][] = [];
  const pad4 = (n: number) => (n + 3) & ~3;
  let off = 128 + 4 + 12 * (parts.length + 3);
  const blobs: Uint8Array[] = [];
  const at = new Map<string, [number, number]>();
  for (const p of parts) {
    at.set(p.sig, [off, p.data.length]);
    blobs.push(p.data);
    off = pad4(off + p.data.length);
    tags.push([p.sig, 0]);
  }
  const trcAt: [number, number] = [off, trc.length];
  blobs.push(trc);
  off = pad4(off + trc.length);
  const size = off;
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  v.setUint32(0, size);
  v.setUint32(8, 0x02100000);
  out.set(enc.encode('mntrRGB XYZ '), 12);
  v.setUint16(24, 2026);
  v.setUint16(26, 1);
  v.setUint16(28, 1);
  out.set(enc.encode('acsp'), 36);
  v.setInt32(68, s15(0.9642));
  v.setInt32(72, s15(1));
  v.setInt32(76, s15(0.8249));
  const all: [string, [number, number]][] = [...at.entries(), ['rTRC', trcAt], ['gTRC', trcAt], ['bTRC', trcAt]];
  v.setUint32(128, all.length);
  all.forEach(([sig, [o, n]], i) => {
    out.set(enc.encode(sig), 132 + i * 12);
    v.setUint32(136 + i * 12, o);
    v.setUint32(140 + i * 12, n);
  });
  let w = 128 + 4 + 12 * all.length;
  for (const b of blobs) {
    out.set(b, w);
    w = pad4(w + b.length);
  }
  void tags;
  return out;
}

let icc: Uint8Array | null = null;
/** a JPEG's bytes with the wide-gamut profile written in (an APP2 segment after the start marker) */
export async function withProfile(jpeg: Blob): Promise<Blob> {
  icc ??= iccProfile();
  const head = new TextEncoder().encode('ICC_PROFILE\0');
  const seg = new Uint8Array(4 + head.length + 2 + icc.length);
  const len = seg.length - 2;
  seg[0] = 0xff;
  seg[1] = 0xe2;
  seg[2] = len >> 8;
  seg[3] = len & 255;
  seg.set(head, 4);
  seg[4 + head.length] = 1;
  seg[5 + head.length] = 1;
  seg.set(icc, 6 + head.length);
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  return new Blob([bytes.subarray(0, 2), seg, bytes.subarray(2)], { type: 'image/jpeg' });
}
