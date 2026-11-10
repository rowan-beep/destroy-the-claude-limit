# Lays the game model's silhouette over a reference drawing at the same scale.
#   python compare.py <config.json> <model view dir> <out dir>
# config: { "image": path, "views": { "side": { "crop": [x0,y0,x1,y1], "nose": [x,y], "tail": [x,y], "length": metres,
#           "flip": false }, "top": {...}, "front": { "crop":..., "centre": [x,y], "span": metres, "tipL": [x,y], "tipR": [x,y] } } }
# All reference coordinates are pixels of the full image. "nose"/"tail" give the scale (their distance is `length` metres)
# and the alignment; in the model the nose is at meta.box.min.z.
import sys, json, os
import numpy as np
from PIL import Image, ImageDraw

cfg = json.load(open(sys.argv[1])); mdir = sys.argv[2]; out = sys.argv[3]
os.makedirs(out, exist_ok=True)
meta = json.load(open(os.path.join(mdir, 'meta.json')))
ppm = meta['ppm']; m = meta['margin']; bmin = meta['box']['min']; bmax = meta['box']['max']
cz = (bmin[2] + bmax[2]) / 2; cy = (bmin[1] + bmax[1]) / 2
L = bmax[2] - bmin[2] + 2 * m; Hh = bmax[1] - bmin[1] + 2 * m
Wd = 2 * max(abs(bmin[0]), abs(bmax[0])) + 2 * m
ref = Image.open(cfg['image']).convert('L')
NOSE_Z = cfg.get('modelNoseZ', bmin[2])

def edges(mask):
    e = np.zeros_like(mask)
    e[1:-1, 1:-1] = mask[1:-1, 1:-1] & ~(mask[:-2, 1:-1] & mask[2:, 1:-1] & mask[1:-1, :-2] & mask[1:-1, 2:])
    return e

for name, v in cfg['views'].items():
    sil = np.array(Image.open(os.path.join(mdir, name + '_sil.png')).convert('L')) < 128
    x0, y0, x1, y1 = v['crop']
    c = ref.crop((x0, y0, x1, y1))
    if name in ('side', 'top', 'bottom'):
        nx, ny = v['nose']; tx, ty = v['tail']
        rppm = abs(tx - nx) / v['length']
        s = ppm / rppm
        c = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.LANCZOS)
        # reference nose in the scaled crop
        rnx = (nx - x0) * s; rny = (ny - y0) * s
        # model nose pixel
        mnx = (NOSE_Z - (cz - L / 2)) * ppm
        mny = (cy + Hh / 2 - v.get('modelNoseY', 0.0)) * ppm if name == 'side' else (Wd / 2) * ppm
    else:
        (lx, ly), (rx, ry) = v['tipL'], v['tipR']
        rppm = abs(rx - lx) / v['span']
        s = ppm / rppm
        c = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.LANCZOS)
        ccx, ccy = v['centre']
        rnx = (ccx - x0) * s; rny = (ccy - y0) * s
        mnx = (Wd / 2) * ppm
        mny = (cy + Hh / 2 - v.get('modelCentreY', 0.0)) * ppm
    W = max(c.width, sil.shape[1]) + 200; H = max(c.height, sil.shape[0]) + 200
    ox, oy = 100, 100
    canvas = np.full((H, W, 3), 255, np.uint8)
    # reference lines in dark blue, placed so its nose is at (ox + mnx, oy + mny)
    rx0 = int(round(ox + mnx - rnx)); ry0 = int(round(oy + mny - rny))
    ra = np.array(c)
    ys = slice(max(0, ry0), min(H, ry0 + ra.shape[0])); xs = slice(max(0, rx0), min(W, rx0 + ra.shape[1]))
    sub = ra[ys.start - ry0: ys.stop - ry0, xs.start - rx0: xs.stop - rx0]
    dark = sub < 150
    reg = canvas[ys, xs]
    reg[dark] = (20, 40, 110)
    # model: light red fill, red edge
    my = slice(oy, oy + sil.shape[0]); mx = slice(ox, ox + sil.shape[1])
    reg = canvas[my, mx]
    fill = sil & ~np.all(reg == (20, 40, 110), axis=2)
    reg[fill] = (reg[fill] * 0.55 + np.array([255, 90, 90]) * 0.45).astype(np.uint8)
    e = edges(sil)
    reg[e] = (230, 0, 0)
    im = Image.fromarray(canvas)
    d = ImageDraw.Draw(im)
    d.text((10, 10), f"{name}: blue = real drawing, red = game model   ({ppm} px/m)", fill=(0, 0, 0))
    # a metre grid along the bottom for reading off positions (z from the nose)
    if name in ('side', 'top', 'bottom'):
        for k in range(0, 21):
            x = ox + mnx + k * ppm
            d.line([(x, H - 40), (x, H - 30)], fill=(0, 0, 0)); d.text((x - 4, H - 28), str(k), fill=(0, 0, 0))
    im.save(os.path.join(out, name + '.png'))
    print(name, im.size, 'ref px/m', round(rppm, 1))
