# Prints the outline of a reference drawing next to the game model's, in metres, station by station.
#   python outline.py <config.json> <model view dir> [step]
# side: top and bottom edge height at each distance from the nose; top: half-width (upper half of the drawing, or
# "half": "lower" in the view's config). Same config as compare.py.
import sys, json, os
import numpy as np
from PIL import Image

cfg = json.load(open(sys.argv[1])); mdir = sys.argv[2]; step = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
meta = json.load(open(os.path.join(mdir, 'meta.json')))
ppm = meta['ppm']; m = meta['margin']; bmin = meta['box']['min']; bmax = meta['box']['max']
cz = (bmin[2] + bmax[2]) / 2; cy = (bmin[1] + bmax[1]) / 2
L = bmax[2] - bmin[2] + 2 * m; Hh = bmax[1] - bmin[1] + 2 * m
Wd = 2 * max(abs(bmin[0]), abs(bmax[0])) + 2 * m
ref = np.array(Image.open(cfg['image']).convert('L')) < int(cfg.get('dark', 200))

def col(mask, x):
    x = int(round(x))
    if x < 0 or x >= mask.shape[1]: return None
    ys = np.where(mask[:, x])[0]
    return (ys.min(), ys.max()) if len(ys) else None

for name, v in cfg['views'].items():
    if name not in ('side', 'top'): continue
    sil = np.array(Image.open(os.path.join(mdir, name + '_sil.png')).convert('L')) < 128
    x0, y0, x1, y1 = v['crop']
    nx, ny = v['nose']; tx, ty = v['tail']
    rppm = abs(tx - nx) / v['length']
    mnx = (bmin[2] - (cz - L / 2)) * ppm
    mny = (cy + Hh / 2 - v.get('modelNoseY', 0.0)) * ppm if name == 'side' else (Wd / 2) * ppm
    noseY = v.get('modelNoseY', 0.0) if name == 'side' else 0.0
    r = ref[y0:y1, x0:x1]
    print(f'--- {name}: d = metres from the nose (z = d + {bmin[2]:.2f})')
    print('    d      z   | ref_top mod_top  diff | ref_bot mod_bot  diff' if name == 'side' else '    d      z   | ref_half mod_half  diff')
    d = 0.0
    while d <= v['length'] + 1.0:
        rc = None
        # median over a few columns to dodge single stray lines
        px = nx - x0 + d * rppm
        if name == 'side':
            rc = col(r, px)
        else:
            lim = v.get('halfLimit', 8.0) * rppm; c = int(round(ny - y0))
            xi = int(round(px))
            if 0 <= xi < r.shape[1]:
                if v.get('half', 'upper') == 'upper':
                    seg = r[max(0, int(c - lim)):c, xi]; ys = np.where(seg)[0]
                    rc = (c - (ys.min() + max(0, int(c - lim))),) if len(ys) else None
                else:
                    seg = r[c:int(c + lim), xi]; ys = np.where(seg)[0]
                    rc = (ys.max(),) if len(ys) else None
        mc = col(sil, mnx + d * ppm)
        z = d + bmin[2]
        if name == 'side':
            rt = noseY + (ny - y0 - rc[0]) / rppm if rc else None; rb = noseY + (ny - y0 - rc[1]) / rppm if rc else None
            mt = noseY + (mny - mc[0]) / ppm if mc else None; mb = noseY + (mny - mc[1]) / ppm if mc else None
            f = lambda a: '   -  ' if a is None else f'{a:6.2f}'
            g = lambda a, b: '   -  ' if a is None or b is None else f'{b - a:+6.2f}'
            print(f'{d:6.2f} {z:6.2f} | {f(rt)}  {f(mt)} {g(rt, mt)} | {f(rb)}  {f(mb)} {g(rb, mb)}')
        else:
            rh = rc[0] / rppm if rc else None
            mh = (mc[1] - mc[0]) / 2 / ppm if mc else None
            f = lambda a: '   -  ' if a is None else f'{a:6.2f}'
            g = lambda a, b: '   -  ' if a is None or b is None else f'{b - a:+6.2f}'
            print(f'{d:6.2f} {z:6.2f} | {f(rh)}   {f(mh)} {g(rh, mh)}')
        d += step
