// Rank emblems for the RANKED ladder, painted on a canvas: a bevelled dark shield
// framing a field of cut crystal in the tier's colour -- facets, light streaks and
// sparkle -- with a dark chevron across it, a gem at the crown and at the point,
// and the division in the middle: a white star for the first division of a tier
// (and for Champion, under its crown), a heavy numeral (V .. II) for the rest.
// Our own art; the look follows Siege's Ranked emblems, which are Ubisoft's.
//
// Each emblem is painted once per tier and division at 384 px and handed out as
// an <img>, so the menu scales the same picture everywhere it shows a rank.

import { DIVISIONS, type Rank, type TierId } from '../game/ranked';

interface Palette {
  /** the crystal's light, mid and deep tones, the frame tint, the glow */
  hi: string;
  mid: string;
  lo: string;
  deep: string;
  frame: string;
  glow: string;
}

// highly saturated, like the real thing
const PALETTES: Record<TierId | 'UNRANKED', Palette> = {
  COPPER: { hi: '#ffb27a', mid: '#e8642a', lo: '#8e2f0c', deep: '#431303', frame: '#1c0d08', glow: '#ff7a3a' },
  BRONZE: { hi: '#ffd59a', mid: '#d98a3c', lo: '#8a4a12', deep: '#3e1f06', frame: '#1a1006', glow: '#ffae4a' },
  SILVER: { hi: '#ffffff', mid: '#c7d3e0', lo: '#6f7f92', deep: '#2b333d', frame: '#121619', glow: '#dbe6f2' },
  GOLD: { hi: '#fff3b0', mid: '#f5c42e', lo: '#a9760a', deep: '#4e3302', frame: '#1c1404', glow: '#ffd54a' },
  PLATINUM: { hi: '#c6fff9', mid: '#2fd6cc', lo: '#0f7f7a', deep: '#053634', frame: '#061917', glow: '#4af0e6' },
  EMERALD: { hi: '#c8ffd9', mid: '#2fd468', lo: '#0f7a35', deep: '#053816', frame: '#061a0c', glow: '#4cf584' },
  DIAMOND: { hi: '#e8d6ff', mid: '#8a4df5', lo: '#4a1fa8', deep: '#1f0a52', frame: '#120826', glow: '#b28cff' },
  CHAMPION: { hi: '#ffd0e4', mid: '#ff2e7a', lo: '#b00a46', deep: '#4d0320', frame: '#210512', glow: '#ff5c9e' },
  UNRANKED: { hi: '#c9d2dc', mid: '#6b7684', lo: '#39424c', deep: '#1a2027', frame: '#0f1317', glow: '#8a96a3' },
};

const PX = 384;
const cache = new Map<string, string>();

/** a small deterministic random stream (the same emblem every time) */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
const SHIELD: Pt[] = [[20, 13], [36, 9], [46, 4], [50, 6], [54, 4], [64, 9], [80, 13], [80, 56], [50, 96], [20, 56]];
/** the field inside the frame */
const INNER: Pt[] = [[27, 19], [38, 16], [47, 12], [50, 13.5], [53, 12], [62, 16], [73, 19], [73, 54], [50, 85], [27, 54]];

function poly(g: CanvasRenderingContext2D, pts: Pt[], s: number): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)));
  g.closePath();
}

function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number, k = 0.42): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * k : r;
    const x = (cx + Math.cos(a) * rr) * s, y = (cy + Math.sin(a) * rr) * s;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
}

function gem(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, s: number, p: Palette): void {
  const pts: Pt[] = [[cx, cy - h / 2], [cx + w / 2, cy - h * 0.1], [cx, cy + h / 2], [cx - w / 2, cy - h * 0.1]];
  poly(g, pts, s);
  const gr = g.createLinearGradient(cx * s, (cy - h / 2) * s, cx * s, (cy + h / 2) * s);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.45, p.hi);
  gr.addColorStop(1, p.mid);
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 0.9 * s;
  g.stroke();
  // the table facet
  poly(g, [[cx, cy - h / 2], [cx + w / 2, cy - h * 0.1], [cx - w / 2, cy - h * 0.1]], s);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fill();
}

/** a heavy block numeral (I, II, III, IV, V) built from bars and chevrons: no font needed */
function numeral(g: CanvasRenderingContext2D, label: string, cx: number, cy: number, s: number): void {
  const H = 28, T = 7.5;
  const glyphs: { w: number; draw: (x: number) => void }[] = [];
  const bar = (x: number) => poly(g, [[x, cy - H / 2], [x + T, cy - H / 2], [x + T, cy + H / 2], [x, cy + H / 2]], s);
  const vee = (x: number) => {
    const w = 22;
    poly(g, [[x, cy - H / 2], [x + T * 1.05, cy - H / 2], [x + w / 2, cy + H / 2 - 9], [x + w - T * 1.05, cy - H / 2], [x + w, cy - H / 2], [x + w / 2 + T * 0.55, cy + H / 2], [x + w / 2 - T * 0.55, cy + H / 2]], s);
  };
  for (const ch of label) glyphs.push(ch === 'V' ? { w: 22, draw: vee } : { w: T, draw: bar });
  const gap = 4;
  const total = glyphs.reduce((a, q) => a + q.w, 0) + gap * (glyphs.length - 1);
  let x = cx - total / 2;
  const paint = (pass: 'shadow' | 'fill') => {
    let xx = x;
    for (const q of glyphs) {
      q.draw(xx);
      if (pass === 'shadow') {
        g.strokeStyle = 'rgba(0,0,0,0.75)';
        g.lineWidth = 3.2 * s;
        g.lineJoin = 'round';
        g.stroke();
      } else {
        g.fillStyle = '#ffffff';
        g.fill();
      }
      xx += q.w + gap;
    }
  };
  paint('shadow');
  paint('fill');
  void x;
}

function crown(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, p: Palette): void {
  const pts: Pt[] = [[cx - 9, cy + 4], [cx - 9.5, cy - 5], [cx - 4.5, cy - 0.5], [cx, cy - 7], [cx + 4.5, cy - 0.5], [cx + 9.5, cy - 5], [cx + 9, cy + 4]];
  poly(g, pts, s);
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 2.2 * s;
  g.lineJoin = 'round';
  g.stroke();
  const gr = g.createLinearGradient(0, (cy - 7) * s, 0, (cy + 4) * s);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(1, p.hi);
  g.fillStyle = gr;
  g.fill();
}

function paint(tier: TierId | 'UNRANKED', label: string, starGlyph: boolean, glow: boolean): string {
  const c = document.createElement('canvas');
  c.width = PX;
  c.height = PX;
  const g = c.getContext('2d')!;
  const s = PX / 100;
  const p = PALETTES[tier];
  const rnd = prng(tier.length * 977 + label.length * 131 + (starGlyph ? 7 : 0));

  // --- the glow and the floating shards behind it
  if (glow) {
    const gr = g.createRadialGradient(50 * s, 50 * s, 10 * s, 50 * s, 50 * s, 52 * s);
    gr.addColorStop(0, p.glow + 'aa');
    gr.addColorStop(0.6, p.glow + '44');
    gr.addColorStop(1, p.glow + '00');
    g.fillStyle = gr;
    g.fillRect(0, 0, PX, PX);
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = 44 + rnd() * 8, r = 1.2 + rnd() * 2.2;
    const x = 50 + Math.cos(a) * d, y = 50 + Math.sin(a) * d * 0.95;
    poly(g, [[x, y - r], [x + r * 0.8, y + r * 0.6], [x - r * 0.9, y + r * 0.3]], s);
    g.fillStyle = (rnd() < 0.5 ? p.hi : p.mid) + '99';
    g.fill();
  }

  // --- the frame: a dark bevelled shield
  poly(g, SHIELD, s);
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = 6 * s;
  g.shadowOffsetY = 2 * s;
  g.fillStyle = p.frame;
  g.fill();
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;
  // metal sheen on the frame: light from the top left
  poly(g, SHIELD, s);
  const sheen = g.createLinearGradient(20 * s, 5 * s, 80 * s, 95 * s);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0.03)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = sheen;
  g.fill();
  // outer edge: a hairline of the tier colour, as if the metal were anodised
  poly(g, SHIELD, s);
  g.strokeStyle = p.mid + 'cc';
  g.lineWidth = 1.1 * s;
  g.lineJoin = 'round';
  g.stroke();

  // --- the crystal field
  g.save();
  poly(g, INNER, s);
  g.clip();
  const base = g.createLinearGradient(27 * s, 12 * s, 73 * s, 85 * s);
  base.addColorStop(0, p.hi);
  base.addColorStop(0.35, p.mid);
  base.addColorStop(0.8, p.lo);
  base.addColorStop(1, p.deep);
  g.fillStyle = base;
  g.fillRect(0, 0, PX, PX);
  // facets: a jittered mesh of triangles, each catching the light its own way
  const cols = 7, rows = 10;
  const grid: Pt[][] = [];
  for (let j = 0; j <= rows; j++) {
    const row: Pt[] = [];
    for (let i = 0; i <= cols; i++) row.push([24 + (i / cols) * 52 + (i && i < cols ? (rnd() - 0.5) * 7 : 0), 10 + (j / rows) * 78 + (j && j < rows ? (rnd() - 0.5) * 6 : 0)]);
    grid.push(row);
  }
  const facet = (a: Pt, b: Pt, d: Pt) => {
    poly(g, [a, b, d], s);
    const t = rnd();
    const light = t < 0.18 ? 0.55 + rnd() * 0.3 : t < 0.5 ? 0.12 + rnd() * 0.2 : -0.1 - rnd() * 0.35;
    g.fillStyle = light >= 0 ? `rgba(255,255,255,${light.toFixed(3)})` : `rgba(0,0,0,${(-light).toFixed(3)})`;
    g.fill();
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = grid[j][i], b = grid[j][i + 1], cc = grid[j + 1][i + 1], d = grid[j + 1][i];
      if (rnd() < 0.5) {
        facet(a, b, cc);
        facet(a, cc, d);
      } else {
        facet(a, b, d);
        facet(b, cc, d);
      }
    }
  }
  // the colour comes back through the facets, saturated
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = p.mid;
  g.globalAlpha = 0.55;
  g.fillRect(0, 0, PX, PX);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  // the two lighter panels down the sides
  for (const x0 of [27, 66]) {
    const gr = g.createLinearGradient(x0 * s, 0, (x0 + 7) * s, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    gr.addColorStop(1, 'rgba(255,255,255,0.0)');
    g.fillStyle = gr;
    g.fillRect(x0 * s, 0, 7 * s, PX);
  }
  // light streaks across the crystal
  for (let i = 0; i < 5; i++) {
    const x = 20 + rnd() * 60, w = 1 + rnd() * 3;
    poly(g, [[x, 0], [x + w, 0], [x + w - 40, 100], [x - 40, 100]], s);
    g.fillStyle = `rgba(255,255,255,${(0.08 + rnd() * 0.14).toFixed(3)})`;
    g.fill();
  }
  // sparkle
  for (let i = 0; i < 14; i++) {
    const x = (28 + rnd() * 44) * s, y = (14 + rnd() * 68) * s, r = (0.6 + rnd() * 1.6) * s;
    g.fillStyle = `rgba(255,255,255,${(0.5 + rnd() * 0.5).toFixed(2)})`;
    g.beginPath();
    g.moveTo(x, y - r * 2.2);
    g.quadraticCurveTo(x, y, x + r * 2.2, y);
    g.quadraticCurveTo(x, y, x, y + r * 2.2);
    g.quadraticCurveTo(x, y, x - r * 2.2, y);
    g.quadraticCurveTo(x, y, x, y - r * 2.2);
    g.fill();
  }
  // depth: darker toward the point
  const vig = g.createLinearGradient(0, 40 * s, 0, 86 * s);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vig;
  g.fillRect(0, 0, PX, PX);
  g.restore();

  // the inner bevel of the frame round the field
  poly(g, INNER, s);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1.2 * s;
  g.stroke();
  poly(g, INNER, s);
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2.6 * s;
  g.globalAlpha = 0.5;
  g.stroke();
  g.globalAlpha = 1;

  // --- the dark chevron across the lower field
  const chev = (dy: number, w: number, col: string) => {
    g.beginPath();
    g.moveTo(27 * s, (52 + dy) * s);
    g.lineTo(50 * s, (70 + dy) * s);
    g.lineTo(73 * s, (52 + dy) * s);
    g.strokeStyle = col;
    g.lineWidth = w * s;
    g.lineJoin = 'miter';
    g.lineCap = 'butt';
    g.stroke();
  };
  chev(0, 9, p.frame);
  chev(-4.2, 1.1, 'rgba(255,255,255,0.3)');
  chev(4.2, 1.0, 'rgba(0,0,0,0.6)');

  // --- gems at the crown and the point
  gem(g, 50, 16.5, 7, 7.5, s, p);
  gem(g, 50, 72.5, 5.5, 6, s, p);

  // --- the division
  if (tier === 'CHAMPION') crown(g, 50, 28, s, p);
  if (starGlyph) {
    const cy = tier === 'CHAMPION' ? 48 : 44;
    star(g, 50, cy, 17, s);
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 3 * s;
    g.shadowOffsetY = 1.5 * s;
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.lineWidth = 3 * s;
    g.lineJoin = 'round';
    g.stroke();
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
    const sg = g.createLinearGradient(0, (cy - 17) * s, 0, (cy + 17) * s);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(1, '#e9e9f2');
    g.fillStyle = sg;
    g.fill();
  } else if (label) {
    numeral(g, label, 50, tier === 'CHAMPION' ? 48 : 44, s);
  }

  // --- a last gloss over everything
  poly(g, SHIELD, s);
  const gloss = g.createLinearGradient(20 * s, 4 * s, 60 * s, 60 * s);
  gloss.addColorStop(0, 'rgba(255,255,255,0.18)');
  gloss.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  g.fillStyle = gloss;
  g.fill();
  return c.toDataURL('image/png');
}

/** The emblem for a rank (null = unranked, still placing), as an <img> tag. */
export function rankEmblemSvg(rank: Rank | null, size = 96, opts: { glow?: boolean } = {}): string {
  const tier: TierId | 'UNRANKED' = rank ? rank.tier : 'UNRANKED';
  // division I (and Champion) wear the star; the others their numeral
  const starGlyph = !rank ? false : rank.tier === 'CHAMPION' || rank.division === 1;
  const label = rank ? (starGlyph ? '' : DIVISIONS[5 - rank.division]) : '';
  const glow = !!opts.glow;
  const key = `${tier}:${label}:${starGlyph ? 's' : ''}:${glow ? 'g' : ''}`;
  let url = cache.get(key);
  if (!url) {
    url = paint(tier, label, starGlyph, glow);
    cache.set(key, url);
  }
  const name = rank ? rank.name : 'UNRANKED';
  return `<img src="${url}" width="${size}" height="${size}" alt="${name}" title="${name}" draggable="false" style="display:block;width:${size}px;height:${size}px">`;
}

/** the tier's colour (for text, bars and borders) */
export function rankColor(rank: Rank | null): string {
  return rank ? PALETTES[rank.tier].mid : '#8a96a3';
}
