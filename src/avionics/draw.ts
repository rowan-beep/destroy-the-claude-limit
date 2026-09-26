// Drawing kit for the multi-function displays: colours, a small "pen" API
// over Canvas 2D, option-select-button (OSB) labels around the display edge,
// and the standard tactical symbols (HAFU track symbols, own-ship, compass
// rose, bars and dials) shared by every page.

export const C = {
  bg: '#010604',
  green: '#3dff72',
  greenDim: 'rgba(61,255,114,0.45)',
  greenFaint: 'rgba(61,255,114,0.16)',
  white: '#eaf4ff',
  cyan: '#43dcff',
  yellow: '#ffe24a',
  amber: '#ffae1a',
  red: '#ff3b2f',
  magenta: '#ff63f2',
  grey: '#7f8e9c',
  blueFriend: '#48b4ff',
  sea: '#06141f',
};

export const MFD_FONT = "'Share Tech Mono', 'Consolas', 'Menlo', monospace";

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  bold?: boolean;
  /** draw a rectangle around the text */
  box?: boolean;
  /** inverse video (filled box, dark text) */
  inverse?: boolean;
}

export class Pen {
  constructor(public ctx: CanvasRenderingContext2D) {}

  set color(c: string) {
    this.ctx.strokeStyle = c;
    this.ctx.fillStyle = c;
  }

  width(w: number): this {
    this.ctx.lineWidth = w;
    return this;
  }

  text(s: string, x: number, y: number, o: TextOpts = {}): number {
    const c = this.ctx;
    const size = o.size ?? 22;
    c.font = `${o.bold ? 'bold ' : ''}${size}px ${MFD_FONT}`;
    c.textAlign = o.align ?? 'left';
    c.textBaseline = o.base ?? 'middle';
    const col = o.color ?? C.green;
    const w = c.measureText(s).width;
    if (o.box || o.inverse) {
      let bx = x;
      if (c.textAlign === 'center') bx = x - w / 2;
      else if (c.textAlign === 'right' || c.textAlign === 'end') bx = x - w;
      const by = y - size * 0.62;
      c.lineWidth = 2;
      if (o.inverse) {
        c.fillStyle = col;
        c.fillRect(bx - 4, by, w + 8, size * 1.24);
        c.fillStyle = C.bg;
        c.fillText(s, x, y);
        return w;
      }
      c.strokeStyle = col;
      c.strokeRect(bx - 4, by, w + 8, size * 1.24);
    }
    c.fillStyle = col;
    c.fillText(s, x, y);
    return w;
  }

  line(x1: number, y1: number, x2: number, y2: number): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  poly(pts: number[], close = true, fill = false): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    if (close) c.closePath();
    if (fill) c.fill();
    else c.stroke();
  }

  circle(x: number, y: number, r: number, fill = false): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
    if (fill) c.fill();
    else c.stroke();
  }

  arc(x: number, y: number, r: number, a0: number, a1: number): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0.5, r), a0, a1);
    c.stroke();
  }

  rect(x: number, y: number, w: number, h: number, fill = false): void {
    if (fill) this.ctx.fillRect(x, y, w, h);
    else this.ctx.strokeRect(x, y, w, h);
  }

  dash(d: number[] = []): void {
    this.ctx.setLineDash(d);
  }

  save(): void {
    this.ctx.save();
  }

  restore(): void {
    this.ctx.restore();
  }

  clip(x: number, y: number, w: number, h: number): void {
    const c = this.ctx;
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
  }

  clipCircle(x: number, y: number, r: number): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.clip();
  }

  // ---------------------------------------------------------------------
  // Symbols
  // ---------------------------------------------------------------------

  /** Own-ship symbol (aircraft planform) pointing up. */
  ownship(x: number, y: number, s = 1): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x, y - 14 * s);
    c.lineTo(x, y + 12 * s);
    c.moveTo(x - 12 * s, y - 1 * s);
    c.lineTo(x + 12 * s, y - 1 * s);
    c.moveTo(x - 5 * s, y + 11 * s);
    c.lineTo(x + 5 * s, y + 11 * s);
    c.stroke();
  }

  /**
   * HAFU-style track symbol: hostile = red chevron (half diamond, top),
   * friendly = green semicircle, unknown = yellow half-square.
   */
  track(x: number, y: number, kind: 'hostile' | 'friendly' | 'unknown', r = 11, filled = false): void {
    const c = this.ctx;
    c.beginPath();
    if (kind === 'hostile') {
      c.moveTo(x - r, y + r * 0.35);
      c.lineTo(x, y - r);
      c.lineTo(x + r, y + r * 0.35);
      if (filled) c.closePath();
    } else if (kind === 'friendly') {
      c.arc(x, y + r * 0.3, r, Math.PI, 0);
      if (filled) c.closePath();
    } else {
      c.moveTo(x - r, y + r * 0.35);
      c.lineTo(x - r, y - r * 0.8);
      c.lineTo(x + r, y - r * 0.8);
      c.lineTo(x + r, y + r * 0.35);
      if (filled) c.closePath();
    }
    if (filled) c.fill();
    else c.stroke();
  }

  /** Velocity leader from a symbol: angle in screen radians (0 = up), length px. */
  leader(x: number, y: number, ang: number, len: number): void {
    this.line(x, y, x + Math.sin(ang) * len, y - Math.cos(ang) * len);
  }

  diamond(x: number, y: number, r: number, fill = false): void {
    this.poly([x, y - r, x + r, y, x, y + r, x - r, y], true, fill);
  }

  triangle(x: number, y: number, r: number, ang = 0, fill = false): void {
    const pts: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = ang + (k * Math.PI * 2) / 3;
      pts.push(x + Math.sin(a) * r, y - Math.cos(a) * r);
    }
    this.poly(pts, true, fill);
  }

  /** Airfield symbol: circle with a runway bar at the runway heading (screen radians). */
  airfield(x: number, y: number, rwyAng: number, r = 9): void {
    this.circle(x, y, r);
    const dx = Math.sin(rwyAng) * r * 1.7, dy = -Math.cos(rwyAng) * r * 1.7;
    this.ctx.lineWidth += 1.5;
    this.line(x - dx, y - dy, x + dx, y + dy);
    this.ctx.lineWidth -= 1.5;
  }

  /** Bullseye symbol: concentric rings with a north tick. */
  bullseye(x: number, y: number, rot = 0): void {
    this.circle(x, y, 12);
    this.circle(x, y, 7);
    this.circle(x, y, 2, true);
    this.line(x + Math.sin(rot) * 12, y - Math.cos(rot) * 12, x + Math.sin(rot) * 20, y - Math.cos(rot) * 20);
  }

  /** Compass rose with 5/10 deg ticks and 30 deg labels, heading-up. */
  compassRose(x: number, y: number, r: number, heading: number, color = C.green, labels = true, size = 18): void {
    const c = this.ctx;
    this.color = color;
    for (let d = 0; d < 360; d += 5) {
      const a = ((d - heading) * Math.PI) / 180;
      const len = d % 30 === 0 ? 16 : d % 10 === 0 ? 11 : 6;
      const sx = Math.sin(a), sy = -Math.cos(a);
      this.line(x + sx * r, y + sy * r, x + sx * (r - len), y + sy * (r - len));
      if (labels && d % 30 === 0) {
        const lbl = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10);
        c.save();
        c.translate(x + sx * (r - len - size * 0.9), y + sy * (r - len - size * 0.9));
        c.rotate(a);
        this.text(lbl, 0, 0, { size, color, align: 'center' });
        c.restore();
      }
    }
  }

  /** Vertical bar gauge filled bottom-up (0..1). */
  vbar(x: number, y: number, w: number, h: number, frac: number, color: string, marks: number[] = []): void {
    this.color = C.greenDim;
    this.rect(x, y, w, h);
    const f = Math.max(0, Math.min(1, frac));
    this.color = color;
    this.rect(x + 2, y + h - (h - 4) * f - 2, w - 4, (h - 4) * f, true);
    this.color = C.white;
    for (const m of marks) {
      const my = y + h - h * m;
      this.line(x - 5, my, x + w + 5, my);
    }
  }

  /** Round dial (e.g. engine RPM): arc from a0..a1 (radians, 0 = up, clockwise), value 0..1. */
  dial(x: number, y: number, r: number, frac: number, color: string, label: string, value: string, redline = 1.0): void {
    const a0 = -Math.PI * 0.75;
    const a1 = Math.PI * 0.75;
    const toCanvas = (a: number) => a - Math.PI / 2;
    this.color = C.greenDim;
    this.width(3);
    this.arc(x, y, r, toCanvas(a0), toCanvas(a1));
    // redline segment
    if (redline < 1) {
      this.color = C.red;
      this.arc(x, y, r, toCanvas(a0 + (a1 - a0) * redline), toCanvas(a1));
    }
    const f = Math.max(0, Math.min(1.05, frac));
    this.color = color;
    this.width(6);
    this.arc(x, y, r, toCanvas(a0), toCanvas(a0 + (a1 - a0) * Math.min(1, f)));
    // needle
    this.width(3);
    const an = a0 + (a1 - a0) * f;
    this.line(x, y, x + Math.sin(an) * (r - 4), y - Math.cos(an) * (r - 4));
    this.width(2);
    this.text(value, x, y + r * 0.55, { size: 22, color: C.white, align: 'center', bold: true });
    this.text(label, x, y + r + 16, { size: 17, color: C.greenDim, align: 'center' });
  }
}

// -------------------------------------------------------------------------
// Option select buttons
// -------------------------------------------------------------------------

/**
 * 20 OSBs per display portal, numbered clockwise from the top-left:
 *   top    0..4  (left -> right)
 *   right  5..9  (top -> bottom)
 *   bottom 10..14 (right -> left)
 *   left   15..19 (bottom -> top)
 */
export function osbPosition(osb: number, w: number, h: number): { x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left' } {
  const t = [0.14, 0.32, 0.5, 0.68, 0.86];
  if (osb < 5) return { x: w * t[osb], y: 0, side: 'top' };
  if (osb < 10) return { x: w, y: h * t[osb - 5], side: 'right' };
  if (osb < 15) return { x: w * t[4 - (osb - 10)], y: h, side: 'bottom' };
  return { x: 0, y: h * t[4 - (osb - 15)], side: 'left' };
}

export interface OsbButton {
  osb: number;
  label: string;
  /** highlighted (boxed) */
  sel?: boolean;
  color?: string;
  act?: () => void;
}

/** Draw OSB legends just inside the display edge. Multi-line labels use \n. */
export function drawOsbLabels(pen: Pen, w: number, h: number, buttons: OsbButton[], size = 19): void {
  for (const b of buttons) {
    if (!b.label) continue;
    const pos = osbPosition(b.osb, w, h);
    const lines = b.label.split('\n');
    const col = b.color ?? C.green;
    const lh = size * 1.1;
    let x = pos.x, y = pos.y;
    let align: CanvasTextAlign = 'center';
    if (pos.side === 'top') y = 18 + (lh * (lines.length - 1)) / 2;
    else if (pos.side === 'bottom') y = h - 18 - (lh * (lines.length - 1)) / 2;
    else if (pos.side === 'left') {
      x = 10;
      align = 'left';
    } else {
      x = w - 10;
      align = 'right';
    }
    const y0 = y - (lh * (lines.length - 1)) / 2;
    lines.forEach((ln, i) => {
      pen.text(ln, x, y0 + i * lh, { size, color: col, align, box: b.sel && i === 0 && lines.length === 1, inverse: false });
    });
    if (b.sel && lines.length > 1) {
      pen.color = col;
      pen.width(2);
      const wMax = Math.max(...lines.map((l) => pen.ctx.measureText(l).width));
      let bx = x - wMax / 2;
      if (align === 'left') bx = x;
      else if (align === 'right') bx = x - wMax;
      pen.rect(bx - 4, y0 - size * 0.62, wMax + 8, lh * lines.length + 2);
    }
  }
}

/** Find the OSB nearest to a point (portal-local px) if it's close to an edge. */
export function hitOsb(x: number, y: number, w: number, h: number, buttons: OsbButton[]): OsbButton | null {
  const edge = Math.min(w, h) * 0.14;
  const nearEdge = x < edge || y < edge || x > w - edge || y > h - edge;
  if (!nearEdge) return null;
  let best: OsbButton | null = null;
  let bd = Infinity;
  for (const b of buttons) {
    if (!b.act) continue;
    const p = osbPosition(b.osb, w, h);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return bd < Math.min(w, h) * 0.2 ? best : null;
}

export function fmtK(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
