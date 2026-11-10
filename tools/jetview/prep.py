# Helpers for setting up a reference drawing.
#   python prep.py extent <image> x0 y0 x1 y1          -> extents of the dark pixels inside a box
#   python prep.py plan <image> noseX noseY tailX tailY out.png [scale] [x0 y0 x1 y1]
#       rotates a plan view drawn at an angle so its nose points left and its axis is level, refines the angle
#       and the centre line by mirror symmetry, and prints the nose and centre row in the new image
import sys, math
import numpy as np
from PIL import Image

cmd = sys.argv[1]
if cmd == 'extent':
    a = np.array(Image.open(sys.argv[2]).convert('L')) < 200
    x0, y0, x1, y1 = map(int, sys.argv[3:7])
    c = a[y0:y1, x0:x1]
    cols = np.where(c.any(axis=0))[0]; rows = np.where(c.any(axis=1))[0]
    xl, xr = cols.min(), cols.max()
    print('x', xl + x0, xr + x0, 'y', rows.min() + y0, rows.max() + y0)
    print('leftmost col rows', np.where(c[:, xl])[0].mean() + y0, 'rightmost col rows', np.where(c[:, xr])[0].mean() + y0)
    print('topmost row cols', np.where(c[rows.min()])[0].mean() + x0, 'bottom row cols', np.where(c[rows.max()])[0].mean() + x0)
elif cmd == 'plan':
    im0 = Image.open(sys.argv[2]).convert('L')
    nx, ny, tx, ty = map(float, sys.argv[3:7]); out = sys.argv[7]
    sc = float(sys.argv[8]) if len(sys.argv) > 8 else 2.0
    if len(sys.argv) > 12:
        x0, y0, x1, y1 = map(int, sys.argv[9:13])
        a = np.array(im0); m = np.full_like(a, 255); m[y0:y1, x0:x1] = a[y0:y1, x0:x1]; im0 = Image.fromarray(m)
    base = math.atan2(ty - ny, tx - nx)  # image angle of nose->tail (y down)
    L = math.hypot(tx - nx, ty - ny)

    def warp(theta, s, nxx, nyy):
        # output (u, v): the nose at (mg, H/2), the axis along +u; s output pixels per input pixel
        mg = int(0.08 * L * s); W = int(L * 1.3 * s) + 2 * mg; H = int(L * 1.25 * s)
        c, sn = math.cos(theta) / s, math.sin(theta) / s
        # x = nx + c*(u-mg) - sn*(v-H/2);  y = ny + sn*(u-mg) + c*(v-H/2)
        coef = (c, -sn, nxx - c * mg + sn * H / 2, sn, c, nyy - sn * mg - c * H / 2)
        return im0.transform((W, H), Image.AFFINE, coef, resample=Image.BICUBIC, fillcolor=255), mg, H // 2

    best = None
    for da in np.arange(-3, 3.01, 0.1):
        r, mg, c0 = warp(base + math.radians(da), 1.0, nx, ny)
        a = np.array(r) < 170
        for dc in range(-10, 11):
            c = c0 + dc
            h = min(c, a.shape[0] - c - 1)
            up = a[c - h:c][::-1]; dn = a[c + 1:c + 1 + h]
            sco = (up & dn).sum()
            if best is None or sco > best[0]: best = (sco, da, dc)
    _, da, dc = best
    th = base + math.radians(da)
    # shift the nose point sideways so the symmetry line is the centre row
    nx2 = nx - math.sin(th) * dc; ny2 = ny + math.cos(th) * dc
    r, mg, c0 = warp(th, sc, nx2, ny2)
    r.save(out)
    a = np.array(r) < 190
    xs = np.where(a[c0 - 4:c0 + 5].any(axis=0))[0]
    print('angle fix', round(da, 2), 'centre shift', dc, '| centre row', c0, 'axis extent', xs.min(), xs.max(), 'size', r.size, 'scale', sc)
