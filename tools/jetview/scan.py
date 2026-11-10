# Reads a straightened plan view and a side view numerically.
#   python scan.py plan <png> <px/m> <noseX> <centreRow> <length m> [maxHalf m]
#   python scan.py side <image> <px/m> <noseX> <noseRow> <length m> <cropTop> <cropBottom> <model y of the nose row>
import sys
import numpy as np
from PIL import Image
cmd = sys.argv[1]
a = np.array(Image.open(sys.argv[2]).convert('L')) < 195
ppm = float(sys.argv[3]); nx = float(sys.argv[4])
if cmd == 'plan':
    cy = int(float(sys.argv[5])); L = float(sys.argv[6]); mh = float(sys.argv[7]) if len(sys.argv) > 7 else 8.0
    X = lambda d: int(round(nx + d * ppm)); D = lambda x: (x - nx) / ppm
    for name, sgn in (('upper', -1), ('lower', 1)):
        print(f'--- {name} half: outline half-width by distance from the nose')
        out = []
        d = 0.25
        while d <= L + 0.5:
            x = X(d)
            if 0 <= x < a.shape[1]:
                lim = int(mh * ppm)
                seg = a[max(0, cy - lim):cy, x][::-1] if sgn < 0 else a[cy + 1:cy + 1 + lim, x]
                ys = np.where(seg)[0]
                out.append(f'{d:.2f}:{(ys.max() + 1) / ppm:.2f}' if len(ys) else f'{d:.2f}:-')
            d += 0.25
        print(' '.join(out))
        print(f'--- {name} half: first and last line along each span station (m from the nose)')
        s = 0.2
        while s <= mh:
            r = cy + sgn * int(round(s * ppm))
            if 0 <= r < a.shape[0]:
                xs = np.where(a[r, max(0, X(-0.5)):X(L + 1.5)])[0] + max(0, X(-0.5))
                if len(xs):
                    starts = xs[np.r_[True, np.diff(xs) > 5]]
                    print(f'  s={s:.1f}: first {D(xs.min()):.2f} last {D(xs.max()):.2f}  lines ' + ' '.join(f'{D(x):.2f}' for x in starts[:14]))
            s += 0.2
else:
    ny = float(sys.argv[5]); L = float(sys.argv[6]); y0 = int(sys.argv[7]); y1 = int(sys.argv[8]); my = float(sys.argv[9])
    d = 0.0
    while d <= L + 0.5:
        x = int(round(nx + d * ppm))
        if 0 <= x < a.shape[1]:
            ys = np.where(a[y0:y1, x])[0]
            runs = []
            for y in ys:
                if runs and y - runs[-1][1] <= 1: runs[-1][1] = y
                else: runs.append([y, y])
            print(f'{d:5.2f}', ' '.join(f'{my + (ny - y0 - (r[0] + r[1]) / 2) / ppm:.2f}' for r in runs))
        d += 0.5
