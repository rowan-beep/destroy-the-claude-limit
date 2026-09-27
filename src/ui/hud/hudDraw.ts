// Canvas HUD symbology. Everything is computed from true 3D directions
// projected through the live camera, so the HUD is conformal (collimated)
// in the cockpit at any FOV and remains correct while looking around.

import { MISSILES, weaponCode } from '../../weapons/weaponSpecs';
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { Aircraft } from '../../aircraft/aircraft';
import { DEG, NM, FT, KT } from '../../core/constants';
import { clamp, dirFromHeadingPitch, wrap360, bearingXZ } from '../../core/math';
import { gunSolution, gunLine } from '../../weapons/gunnery';
import { AIRFIELDS, toRunwayLocal } from '../../world/islands';
import { ONSPEED_AOA, fmtTtg } from '../../avionics/nav';
import { hostile, RULES } from '../../game/rules';

const GREEN = '#6cff9a';
const GREEN_DIM = 'rgba(108,255,154,0.55)';
const RED = '#ff5a48';
const AMBER = '#ffc94a';
const WHITE = '#f0f6ff';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export interface ScreenPt {
  x: number;
  y: number;
  front: boolean;
  on: boolean;
}

export class HudPainter {
  w = 1;
  h = 1;
  private losCache = new Map<number, { t: number; ok: boolean }>();

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly ctx: CanvasRenderingContext2D,
  ) {}

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
    }
    this.w = w;
    this.h = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  project(cam: THREE.PerspectiveCamera, p: THREE.Vector3): ScreenPt {
    _v.copy(p).project(cam);
    // points behind the camera have z > 1 after projection
    _v2.copy(p).applyMatrix4(cam.matrixWorldInverse);
    const front = _v2.z < 0;
    const x = (_v.x * 0.5 + 0.5) * this.w;
    const y = (-_v.y * 0.5 + 0.5) * this.h;
    return { x, y, front, on: front && x >= 0 && x <= this.w && y >= 0 && y <= this.h };
  }

  projectDir(cam: THREE.PerspectiveCamera, dir: THREE.Vector3): ScreenPt {
    const p = _v2.copy(cam.position).addScaledVector(dir, 10000);
    return this.project(cam, p.clone());
  }

  pxPerRad(cam: THREE.PerspectiveCamera): number {
    return this.h / 2 / Math.tan((cam.fov * DEG) / 2);
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  // -------------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------------

  private text(s: string, x: number, y: number, color = GREEN, size = 13, align: CanvasTextAlign = 'left', bold = false): void {
    const c = this.ctx;
    c.font = `${bold ? 'bold ' : ''}${size}px 'Share Tech Mono', Consolas, monospace`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.fillStyle = color;
    c.fillText(s, x, y);
  }

  private line(x1: number, y1: number, x2: number, y2: number): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  private circle(x: number, y: number, r: number): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
  }

  private fpm(x: number, y: number, r = 7): void {
    this.circle(x, y, r);
    this.line(x - r - 9, y, x - r, y);
    this.line(x + r, y, x + r + 9, y);
    this.line(x, y - r, x, y - r - 6);
  }

  private diamond(x: number, y: number, r: number): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
    c.closePath();
    c.stroke();
  }

  /** Arrow at the screen edge pointing toward an off-screen point. */
  private edgeArrow(cx: number, cy: number, pt: ScreenPt, color: string, label: string, radius: number): void {
    let dx = pt.x - cx, dy = pt.y - cy;
    if (!pt.front) {
      dx = -dx;
      dy = -dy;
    }
    const a = Math.atan2(dy, dx);
    const x = cx + Math.cos(a) * radius, y = cy + Math.sin(a) * radius;
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(12, 0);
    c.lineTo(-6, -7);
    c.lineTo(-6, 7);
    c.closePath();
    c.fill();
    c.restore();
    if (label) this.text(label, x - Math.cos(a) * 22, y - Math.sin(a) * 16, color, 11, 'center');
  }

  // -------------------------------------------------------------------------
  // Cockpit HUD
  // -------------------------------------------------------------------------

  drawCockpit(g: Game): void {
    const p = g.player!;
    const cam = g.renderer.camera;
    const c = this.ctx;
    const fm = p.fm;
    const pxr = this.pxPerRad(cam);
    const bore = this.projectDir(cam, fm.fwd);
    if (!bore.front) return;
    const halfW = pxr * Math.tan(11.5 * DEG);
    const top = bore.y - pxr * Math.tan(6.5 * DEG);
    const bot = bore.y + pxr * Math.tan(14 * DEG);
    const left = bore.x - halfW, right = bore.x + halfW;
    c.save();
    c.strokeStyle = GREEN;
    c.fillStyle = GREEN;
    c.lineWidth = 1.5;
    c.shadowColor = 'rgba(80,255,140,0.7)';
    c.shadowBlur = 4;
    // combiner glass hint
    // clip to the combiner glass of the 3D cockpit (projected corners), so the
    // symbology lives exactly on the glass whatever the head position
    const glass = this.glassOutline(g, cam);
    c.beginPath();
    if (glass) {
      c.moveTo(glass[0], glass[1]);
      for (let i = 2; i < glass.length; i += 2) c.lineTo(glass[i], glass[i + 1]);
      c.closePath();
    } else c.rect(left - 10, top - 26, right - left + 20, bot - top + 36);
    c.clip();

    // waterline (boresight "W")
    const bx = bore.x, by = bore.y;
    c.beginPath();
    c.moveTo(bx - 18, by);
    c.lineTo(bx - 9, by);
    c.lineTo(bx - 4.5, by + 6);
    c.lineTo(bx, by);
    c.lineTo(bx + 4.5, by + 6);
    c.lineTo(bx + 9, by);
    c.lineTo(bx + 18, by);
    c.stroke();

    // flight path marker
    const V = fm.vel.length();
    const vdir = V > 5 ? fm.vel.clone().divideScalar(V) : fm.fwd.clone();
    const fp = this.projectDir(cam, vdir);
    const fpx = clamp(fp.x, left, right), fpy = clamp(fp.y, top, bot);
    this.fpm(fpx, fpy);

    // pitch ladder
    const vHdg = Math.atan2(vdir.x, -vdir.z) / DEG;
    const pitchNow = fm.pitchAngle;
    const k0 = Math.ceil((pitchNow - 30) / 5) * 5;
    for (let k = k0; k <= pitchNow + 30 && k <= 90; k += 5) {
      if (k < -90) continue;
      const d = dirFromHeadingPitch(vHdg, k);
      const pt = this.projectDir(cam, d);
      if (!pt.front) continue;
      const pa = this.projectDir(cam, dirFromHeadingPitch(vHdg - 2, k));
      const pb = this.projectDir(cam, dirFromHeadingPitch(vHdg + 2, k));
      const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      c.save();
      c.translate(pt.x, pt.y);
      c.rotate(ang);
      if (k === 0) {
        c.setLineDash([]);
        this.line(-halfW * 1.2, 0, -26, 0);
        this.line(26, 0, halfW * 1.2, 0);
      } else {
        const len = 44, gap = 22;
        c.setLineDash(k < 0 ? [6, 4] : []);
        const tick = k > 0 ? 7 : -7;
        this.line(-gap - len, 0, -gap, 0);
        this.line(gap, 0, gap + len, 0);
        c.setLineDash([]);
        this.line(-gap - len, 0, -gap - len, tick);
        this.line(gap + len, 0, gap + len, tick);
        this.text(String(Math.abs(k)), -gap - len - 16, 0, GREEN, 11, 'center');
        this.text(String(Math.abs(k)), gap + len + 16, 0, GREEN, 11, 'center');
      }
      c.restore();
    }
    c.setLineDash([]);

    // heading tape
    const hdg = fm.heading;
    const tapeY = top - 12;
    const span = 30;
    for (let d = Math.floor((hdg - span) / 5) * 5; d <= hdg + span; d += 5) {
      const x = bx + ((d - hdg) / span) * halfW;
      const h5 = wrap360(d);
      const major = Math.round(h5) % 10 === 0;
      this.line(x, tapeY, x, tapeY + (major ? 7 : 4));
      if (major) this.text(String(Math.round(h5 / 10) % 36).padStart(2, '0'), x, tapeY - 8, GREEN, 11, 'center');
    }
    this.line(bx, tapeY + 9, bx - 4, tapeY + 15);
    this.line(bx, tapeY + 9, bx + 4, tapeY + 15);
    // steerpoint bearing caret on the tape
    const nav = g.avionics?.nav;
    if (nav) {
      let d = nav.bearingTo(fm.pos.x, fm.pos.z) - hdg;
      d = ((d + 540) % 360) - 180;
      const x = bx + (clamp(d, -span, span) / span) * halfW;
      c.beginPath();
      c.moveTo(x, tapeY - 1);
      c.lineTo(x - 4, tapeY - 7);
      c.lineTo(x + 4, tapeY - 7);
      c.closePath();
      if (Math.abs(d) <= span) c.fill();
      else c.stroke();
    }

    // speed & altitude boxes
    const midY = by + 10;
    const cas = Math.round(fm.cas / KT);
    c.strokeRect(left - 2, midY - 10, 52, 20);
    this.text(String(cas), left + 46, midY, GREEN, 15, 'right', true);
    this.text(`M ${fm.mach.toFixed(2)}`, left, midY + 22, GREEN, 12);
    this.text(`G ${fm.nz.toFixed(1)}`, left, midY + 38, fm.nz > p.spec.gLimit - 0.3 ? AMBER : GREEN, 12);
    this.text(`α ${(fm.alpha / DEG).toFixed(1)}`, left, midY + 54, GREEN, 12);
    if (g.gOverride) this.text(p.spec.tvcDeg > 0 ? 'SMV · TVC' : 'G LIM OVRD', left, midY + 70, AMBER, 11);
    const alt = Math.round(fm.pos.y / FT);
    const altS = alt >= 1000 ? `${Math.floor(alt / 1000)},${String(alt % 1000).padStart(3, '0')}` : String(alt);
    c.strokeRect(right - 62, midY - 10, 64, 20);
    this.text(altS, right, midY, GREEN, 15, 'right', true);
    if (fm.agl < 5000 * FT) this.text(`R ${Math.round(fm.agl / FT)}`, right, midY + 22, fm.agl < 150 ? AMBER : GREEN, 12, 'right');
    this.text(`${Math.round(fm.vs / FT * 60 / 100) * 100}`, right, midY + 38, GREEN_DIM, 11, 'right');

    // weapon & target block
    this.weaponBlock(g, p, left, bot - 34, right, bot - 34, bx, by, cam, fpx, fpy);

    // ground collision "break X"
    const tti = fm.vel.y < -5 ? fm.agl / -fm.vel.y : Infinity;
    if (!fm.onGround && fm.gearPos < 0.5 && tti < 4.5 && fm.agl < 1200) {
      c.lineWidth = 3;
      c.strokeStyle = GREEN;
      this.line(bx - 60, by - 60, bx + 60, by + 60);
      this.line(bx + 60, by - 60, bx - 60, by + 60);
      c.lineWidth = 1.5;
    }

    // steerpoint: conformal diamond and distance / time-to-go
    if (nav) {
      const sp = nav.current;
      _v2.set(sp.x, sp.elev, sp.z);
      const spt = this.project(cam, _v2.clone());
      if (spt.front) this.diamond(spt.x, spt.y, 7);
      const dist = nav.rangeTo(fm.pos.x, fm.pos.z) / NM;
      const plan = nav.fuelPlan(p);
      this.text(`${sp.num} ${sp.short}`, right, midY + 58, GREEN, 11, 'right');
      this.text(`${dist.toFixed(1)} ${fmtTtg(plan.ttgSec)}`, right, midY + 72, GREEN, 11, 'right');
      if (plan.belowBingo) this.text('BINGO', bx, top + 18, Math.floor(performance.now() / 400) % 2 ? AMBER : GREEN, 14, 'center', true);
    }

    // landing aids: ILS needles and the AoA bracket
    if (fm.gearPos > 0.5 && !fm.onGround) this.approachCues(g, p, bx, by, fpx, fpy, halfW, top);
    c.restore();
  }

  private approachCues(g: Game, p: Aircraft, bx: number, by: number, fpx: number, fpy: number, halfW: number, top: number): void {
    const c = this.ctx;
    const nav = g.avionics?.nav;
    const ils = nav ? nav.ils(p) : null;
    if (ils) {
      const r = halfW * 0.45;
      const dot = r / 2;
      c.save();
      c.strokeStyle = GREEN;
      // scales
      for (const k of [-2, -1, 1, 2]) {
        this.circle(bx + k * dot, by + r + 10, 2.5);
        this.circle(bx + r + 10, by + k * dot, 2.5);
      }
      // localizer needle: + dots = runway to the right
      c.lineWidth = 2;
      c.setLineDash([7, 4]);
      const lx = bx + clamp(ils.locDots, -2.2, 2.2) * dot;
      this.line(lx, by - r, lx, by + r);
      // glideslope needle: above the slope -> needle below centre
      const gy = by + clamp(ils.gsDots, -2.2, 2.2) * dot;
      this.line(bx - r, gy, bx + r, gy);
      c.setLineDash([]);
      c.restore();
      this.text(`ILS ${ils.field.icao} ${ils.runway}  ${(ils.distThr / NM).toFixed(1)}`, bx, top + 34, ils.captured ? GREEN : GREEN_DIM, 11, 'center');
    }
    // AoA bracket beside the flight path marker: centred on the FPM when on speed
    const on = ONSPEED_AOA[p.type] ?? 8.5;
    const alpha = p.fm.alpha / DEG;
    const dev = clamp(alpha - on, -4, 4);
    const k = 7;
    const ex = fpx - 26;
    const ey = fpy + dev * k;
    c.save();
    c.strokeStyle = GREEN;
    c.lineWidth = 2;
    this.line(ex, ey - 14, ex, ey + 14);
    this.line(ex, ey - 14, ex + 6, ey - 14);
    this.line(ex, ey + 14, ex + 6, ey + 14);
    this.line(ex, ey, ex + 5, ey);
    c.restore();
    const state = dev > 1.2 ? 'SLOW' : dev < -1.2 ? 'FAST' : 'ON SPEED';
    this.text(state, ex - 6, ey - 20, state === 'ON SPEED' ? GREEN : AMBER, 10, 'right');
  }

  /**
   * Helmet-mounted display (JHMCS / Striker II): symbology fixed to the
   * pilot's view while looking off-boresight. Blanked over the HUD.
   */
  drawHmd(g: Game): void {
    const p = g.player;
    if (!p || !p.headLos) return;
    const cam = g.renderer.camera;
    const offDeg = Math.acos(clamp(p.headLos.dot(p.fm.fwd), -1, 1)) / DEG;
    if (offDeg < 12) return;
    const c = this.ctx;
    const cx = this.w / 2, cy = this.h / 2;
    const fm = p.fm;
    const col = '#7dff9a';
    c.save();
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = 1.5;
    c.shadowColor = 'rgba(80,255,140,0.6)';
    c.shadowBlur = 3;
    // aiming reticle
    this.circle(cx, cy, 16);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) this.line(cx + dx * 20, cy + dy * 20, cx + dx * 28, cy + dy * 28);
    // AIM-9X seeker field around the line of sight
    if (p.selectedWeapon === p.irMissile) {
      const r9 = this.pxPerRad(cam) * Math.tan(9 * DEG);
      c.setLineDash([6, 6]);
      this.circle(cx, cy, r9);
      c.setLineDash([]);
      this.text(p.seekerTarget ? 'SEEKER LOCK' : 'SEEKER SEARCH', cx, cy + r9 + 14, p.seekerTarget ? col : GREEN_DIM, 12, 'center', true);
    }
    // data around the reticle
    const hdgLos = (Math.atan2(p.headLos.x, -p.headLos.z) / DEG + 360) % 360;
    const elLos = Math.asin(clamp(p.headLos.y, -1, 1)) / DEG;
    this.text(String(Math.round(hdgLos) % 360).padStart(3, '0'), cx, cy + 118, col, 15, 'center', true);
    this.text(`${elLos >= 0 ? '+' : ''}${elLos.toFixed(0)}°`, cx, cy + 136, GREEN_DIM, 12, 'center');
    this.text(String(Math.round(fm.cas / KT)), cx - 120, cy, col, 15, 'right', true);
    this.text(`${Math.round(fm.pos.y / FT / 100) * 100}`, cx + 120, cy, col, 15, 'left', true);
    this.text(`${fm.nz.toFixed(1)}G`, cx - 120, cy + 20, fm.nz > p.spec.gLimit - 0.3 ? AMBER : GREEN_DIM, 12, 'right');
    const w = p.selectedWeapon;
    this.text(w === 'GUN' ? `GUN ${p.gunAmmo}` : `${weaponCode(w)} ${p.countOf(w)}`, cx + 120, cy + 20, GREEN_DIM, 12, 'left');
    const name = p.type === 'TYPHOON' ? 'STRIKER II' : p.type === 'F15EX' ? 'JHMCS II' : p.type === 'SU35' ? 'NSTs-T' : p.type === 'RAFALE' ? 'SCORPION' : 'JHMCS';
    this.text(name, cx, cy - 118, GREEN_DIM, 11, 'center');
    // nose cue: where the jet is pointing
    const nose = this.projectDir(cam, fm.fwd);
    let ax = nose.x - cx, ay = nose.y - cy;
    if (!nose.front) {
      ax = -ax;
      ay = -ay;
    }
    const a = Math.atan2(ay, ax);
    const rr = 78;
    c.save();
    c.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    c.rotate(a);
    c.beginPath();
    c.moveTo(10, 0);
    c.lineTo(-4, -6);
    c.lineTo(-4, 6);
    c.closePath();
    c.stroke();
    c.restore();
    this.text(`NOSE ${Math.round(offDeg)}°`, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr - 14, GREEN_DIM, 11, 'center');
    // helmet cue: the target look-and-lock would take
    if (!p.lockedTarget) {
      const t = p.helmetTarget(g.sim, p.headLos);
      if (t) {
        const tp = this.project(cam, t.fm.pos);
        if (tp.front) {
          c.setLineDash([3, 3]);
          c.strokeRect(tp.x - 12, tp.y - 12, 24, 24);
          c.setLineDash([]);
          this.text('R: LOCK', tp.x, tp.y + 24, GREEN_DIM, 11, 'center');
        }
      }
    }
    c.restore();
  }

  /** Screen outline of the HUD combiner glass, or null outside the cockpit. */
  private glassOutline(g: Game, cam: THREE.PerspectiveCamera): number[] | null {
    const ck = g.cockpitView.active;
    const p = g.player;
    const eye = g.eyeWorld();
    if (!ck || !p || !eye) return null;
    const h = ck.layout.hud;
    const pts: number[] = [];
    const corners: [number, number][] = [
      [-h.halfW, h.top],
      [h.halfW, h.top],
      [h.halfW, h.bottom + 0.035],
      [-h.halfW, h.bottom + 0.035],
    ];
    for (const [x, y] of corners) {
      _v.set(x, y, -h.dist).applyQuaternion(p.fm.quat).add(eye);
      const sp = this.project(cam, _v.clone());
      if (!sp.front) return null;
      pts.push(sp.x, sp.y);
    }
    return pts;
  }

  private weaponBlock(g: Game, p: Aircraft, lx: number, ly: number, rx: number, ry: number, bx: number, by: number, cam: THREE.PerspectiveCamera, fpx: number, fpy: number): void {
    const w = p.selectedWeapon;
    const sim = g.sim;
    const c = this.ctx;
    const count = w === 'GUN' ? p.gunAmmo : p.countOf(w);
    const wname = w === 'GUN' ? `GUN ${p.spec.gun.caliberMm}` : MISSILES[w].short;
    this.text(`${wname} ${count}`, lx, ly, GREEN, 12);
    this.text(`${p.radar.mode}${p.radar.lock ? ' STT' : ''}${p.irst?.lock ? ' IRST' : ''}`, lx, ly + 15, GREEN, 11);
    this.text(`ARM`, lx, ly + 30, GREEN, 11);

    const t = p.lockedTarget ?? (w === p.irMissile ? p.seekerTarget : null);
    if (t) {
      const range = p.distanceTo(t);
      const tp = this.project(cam, t.fm.pos);
      const closure = -t.fm.vel.clone().sub(p.fm.vel).dot(t.fm.pos.clone().sub(p.fm.pos).normalize());
      this.text(`${(range / NM).toFixed(1)} NM`, rx, ry, GREEN, 12, 'right');
      this.text(`${Math.round(closure / KT)}C`, rx, ry + 15, GREEN, 11, 'right');
      this.text(t.spec.shortName.toUpperCase(), rx, ry + 30, GREEN, 11, 'right');
      if (tp.front && Math.abs(tp.x - bx) < 400 && Math.abs(tp.y - by) < 300) {
        // target designator box
        c.strokeRect(tp.x - 11, tp.y - 11, 22, 22);
      } else {
        // locator line from the boresight
        const a = Math.atan2(tp.y - by, tp.x - bx) + (tp.front ? 0 : Math.PI);
        this.line(bx, by, bx + Math.cos(a) * 60, by + Math.sin(a) * 60);
        const off = Math.round(Math.acos(clamp(t.fm.pos.clone().sub(p.fm.pos).normalize().dot(p.fm.fwd), -1, 1)) / DEG);
        this.text(`${off}°`, bx + Math.cos(a) * 74, by + Math.sin(a) * 74, GREEN, 11, 'center');
      }
      // launch zone scale
      if (w !== 'GUN') {
        const lz = p.launchZoneFor(w, t);
        const sx = rx - 8, sTop = by - 40, sBot = by + 90;
        const maxR = lz.rmax * 1.3;
        const yOf = (r: number) => sBot - (clamp(r, 0, maxR) / maxR) * (sBot - sTop);
        this.line(sx, yOf(lz.rmax), sx, yOf(lz.rmin));
        this.line(sx - 6, yOf(lz.rmax), sx, yOf(lz.rmax));
        this.line(sx - 6, yOf(lz.rne), sx, yOf(lz.rne));
        this.line(sx - 6, yOf(lz.rmin), sx, yOf(lz.rmin));
        const ry2 = yOf(range);
        c.beginPath();
        c.moveTo(sx + 2, ry2);
        c.lineTo(sx + 9, ry2 - 5);
        c.lineTo(sx + 9, ry2 + 5);
        c.closePath();
        c.stroke();
        const inRange = range < lz.rmax && range > lz.rmin && (w !== p.irMissile || p.seekerTarget === t);
        if (inRange && Math.floor(performance.now() / 300) % 2 === 0) this.text('SHOOT', bx, by + 70, GREEN, 15, 'center', true);
        else if (range < lz.rmin) this.text('MIN RNG', bx, by + 70, AMBER, 13, 'center');
      }
    }

    // AIM-9X seeker
    if (w === p.irMissile) {
      if (p.seekerTarget) {
        const sp = this.project(cam, p.seekerTarget.fm.pos);
        if (sp.front) this.circle(sp.x, sp.y, 14);
      } else {
        c.setLineDash([3, 3]);
        this.circle(bx, by, 16);
        c.setLineDash([]);
      }
    }

    // gun: lead-computing sight
    if (w === 'GUN') {
      const gl = this.projectDir(cam, gunLine(p));
      this.line(gl.x - 8, gl.y, gl.x + 8, gl.y);
      this.line(gl.x, gl.y - 8, gl.x, gl.y + 8);
      const gt = p.lockedTarget ?? p.seekerTarget;
      if (gt) {
        const aim = new THREE.Vector3();
        const sol = gunSolution(p, gt, aim);
        // pipper = where the gun line must point; show it relative to the gun cross
        const ap = this.project(cam, aim);
        const tp = this.project(cam, gt.fm.pos);
        if (ap.front && tp.front) {
          const px = gl.x + (tp.x - ap.x), py = gl.y + (tp.y - ap.y);
          this.circle(px, py, 18);
          const frac = clamp(1 - sol.range / 2400, 0, 1);
          c.beginPath();
          c.arc(px, py, 22, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          c.stroke();
          this.text('•', px, py, GREEN, 10, 'center');
          if (sol.range < 1300) this.text('IN RNG', bx, by + 88, GREEN, 12, 'center', true);
        }
      }
    }
    void sim;
    void fpx;
    void fpy;
  }

  // -------------------------------------------------------------------------
  // External-view overlay
  // -------------------------------------------------------------------------

  drawExternal(g: Game): void {
    const p = g.player!;
    const cam = g.renderer.camera;
    const c = this.ctx;
    const fm = p.fm;
    c.save();
    c.lineWidth = 1.5;
    c.shadowColor = 'rgba(0,0,0,0.8)';
    c.shadowBlur = 3;
    c.strokeStyle = 'rgba(235,245,255,0.85)';
    // gun cross & flight path marker far ahead
    const gl = this.projectDir(cam, gunLine(p));
    if (gl.front) {
      this.circle(gl.x, gl.y, 9);
      this.line(gl.x - 3, gl.y, gl.x + 3, gl.y);
    }
    const V = fm.vel.length();
    if (V > 20) {
      const fp = this.projectDir(cam, fm.vel.clone().divideScalar(V));
      if (fp.front) {
        c.strokeStyle = GREEN;
        this.fpm(fp.x, fp.y, 5);
      }
    }
    this.contactMarkers(g, p, cam);
    // steerpoint marker
    const nav = g.avionics?.nav;
    if (nav) {
      const sp = nav.current;
      const spt = this.project(cam, new THREE.Vector3(sp.x, sp.elev, sp.z));
      const dist = nav.rangeTo(fm.pos.x, fm.pos.z) / NM;
      c.strokeStyle = 'rgba(230,240,255,0.8)';
      if (spt.on) {
        this.diamond(spt.x, spt.y, 7);
        this.text(`${sp.short} ${dist.toFixed(1)}`, spt.x, spt.y + 16, 'rgba(230,240,255,0.85)', 11, 'center');
      }
    }
    // gun pipper
    if (p.selectedWeapon === 'GUN') {
      const gt = p.lockedTarget ?? p.seekerTarget;
      if (gt && gl.front) {
        const aim = new THREE.Vector3();
        const sol = gunSolution(p, gt, aim);
        const ap = this.project(cam, aim);
        const tp = this.project(cam, gt.fm.pos);
        if (ap.front && tp.front) {
          c.strokeStyle = GREEN;
          const px = gl.x + (tp.x - ap.x), py = gl.y + (tp.y - ap.y);
          this.circle(px, py, 14);
          if (sol.range < 1300) this.text('IN RNG', px, py + 26, GREEN, 11, 'center', true);
        }
      }
    }
    c.restore();
  }

  /** Radar / IRST / visual contact boxes, lock diamond and seeker circle. */
  contactMarkers(g: Game, p: Aircraft, cam: THREE.PerspectiveCamera): void {
    const c = this.ctx;
    const now = g.sim.time;
    const lock = p.lockedTarget;
    const drawn = new Set<number>();
    const cx = this.w / 2, cy = this.h / 2;
    const contacts = [...p.radar.contacts.values(), ...(p.irst ? [...p.irst.contacts.values()] : [])];
    for (const ct of contacts) {
      if (drawn.has(ct.target.id) || !ct.target.alive || now - ct.lastSeen > 6) continue;
      drawn.add(ct.target.id);
      const sp = this.project(cam, ct.pos);
      const col = ct.hostile ? RED : GREEN;
      c.strokeStyle = col;
      if (ct.target === lock) continue;
      if (!sp.on) continue;
      const stale = now - ct.lastSeen > 2;
      c.globalAlpha = stale ? 0.45 : 0.9;
      c.strokeRect(sp.x - 7, sp.y - 7, 14, 14);
      c.globalAlpha = 1;
    }
    if (lock) {
      const sp = this.project(cam, lock.fm.pos);
      const range = p.distanceTo(lock);
      if (sp.on) {
        c.strokeStyle = RED;
        c.lineWidth = 2;
        this.diamond(sp.x, sp.y, 13);
        c.strokeRect(sp.x - 18, sp.y - 18, 36, 36);
        c.lineWidth = 1.5;
        this.text(`${(range / NM).toFixed(1)} NM`, sp.x, sp.y + 30, RED, 12, 'center', true);
        this.text(lock.spec.shortName.toUpperCase(), sp.x, sp.y - 30, RED, 11, 'center');
      } else {
        this.edgeArrow(cx, cy, sp, RED, `${(range / NM).toFixed(1)}`, Math.min(this.w, this.h) * 0.38);
      }
    }
    if (p.selectedWeapon === p.irMissile) {
      c.strokeStyle = p.seekerTarget ? AMBER : 'rgba(255,201,74,0.5)';
      if (p.seekerTarget) {
        const sp = this.project(cam, p.seekerTarget.fm.pos);
        if (sp.front) this.circle(sp.x, sp.y, 20);
      } else {
        const b = this.projectDir(cam, p.fm.fwd);
        c.setLineDash([4, 4]);
        if (b.front) this.circle(b.x, b.y, 26);
        c.setLineDash([]);
      }
    }
    // incoming missiles: arrows around the centre
    for (const mw of p.rwr.missiles) {
      const mp = this.project(cam, mw.missile.pos);
      if (mp.on) {
        c.strokeStyle = RED;
        this.circle(mp.x, mp.y, 10);
        this.text('M', mp.x, mp.y, RED, 11, 'center', true);
      } else this.edgeArrow(cx, cy, mp, RED, `M ${mw.tti.toFixed(0)}s`, Math.min(this.w, this.h) * 0.3);
    }
  }

  /** DCS-style labels / dots for spotting distant aircraft. */
  drawLabels(g: Game): void {
    const mode = g.settings.gameplay.labels;
    if (mode === 'off') return;
    const p = g.player;
    if (!p) return;
    const cam = g.renderer.camera;
    const c = this.ctx;
    const now = g.sim.time;
    for (const a of g.sim.aircraft) {
      if (a === p || a.fm.crashed) continue;
      const d = a.fm.pos.distanceTo(cam.position);
      if (d < 400 || d > 40000) continue;
      const lc = this.losCache.get(a.id);
      let ok: boolean;
      if (lc && now - lc.t < 0.6) ok = lc.ok;
      else {
        ok = g.sim.lineOfSight(cam.position, a.fm.pos);
        this.losCache.set(a.id, { t: now, ok });
      }
      if (!ok) continue;
      const sp = this.project(cam, a.fm.pos);
      if (!sp.on) continue;
      if (mode === 'dots' || d > 25000) {
        const r = clamp(2.6 - d / 12000, 1.2, 2.6);
        c.fillStyle = 'rgba(20,24,28,0.85)';
        c.beginPath();
        c.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        c.fill();
      }
      if (mode === 'full') {
        const col = !hostile(a, p) ? '#7dffb0' : '#ff8a7a';
        this.text(`${a.spec.shortName.toUpperCase()} ${(d / NM).toFixed(1)}`, sp.x + 8, sp.y - 10, col, 11);
        if (!a.alive) this.text('DEAD', sp.x + 8, sp.y + 2, '#999', 10);
      }
    }
    this.drawBounty(g);
  }

  /** Free-for-all: the bounty holder is revealed to everyone, at any range. */
  private drawBounty(g: Game): void {
    const p = g.player;
    if (!RULES.ffa || RULES.bountyId < 0 || !p) return;
    const b = g.sim.aircraft.find((a) => a.id === RULES.bountyId);
    if (!b || !b.alive || b === p) return;
    const cam = g.renderer.camera;
    const sp = this.project(cam, b.fm.pos);
    if (!sp.on) return;
    const c = this.ctx;
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 180);
    c.save();
    c.strokeStyle = `rgba(255,211,90,${pulse})`;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(sp.x, sp.y - 14);
    c.lineTo(sp.x + 14, sp.y);
    c.lineTo(sp.x, sp.y + 14);
    c.lineTo(sp.x - 14, sp.y);
    c.closePath();
    c.stroke();
    c.restore();
    const d = b.fm.pos.distanceTo(cam.position);
    this.text(`★ BOUNTY ${b.callsign} ${(d / NM).toFixed(1)} NM`, sp.x + 18, sp.y - 16, '#ffd35a', 12);
  }

  drawMouseAim(g: Game): void {
    const p = g.player;
    if (!p || !p.alive) return;
    const cam = g.renderer.camera;
    const c = this.ctx;
    const aim = this.projectDir(cam, g.aimDir);
    const nose = this.projectDir(cam, p.fm.fwd);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.8)';
    c.shadowBlur = 3;
    c.strokeStyle = WHITE;
    c.lineWidth = 1.5;
    if (aim.front) {
      this.circle(aim.x, aim.y, 12);
      this.line(aim.x - 20, aim.y, aim.x - 14, aim.y);
      this.line(aim.x + 14, aim.y, aim.x + 20, aim.y);
    }
    if (nose.front) {
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      this.line(nose.x - 7, nose.y, nose.x + 7, nose.y);
      this.line(nose.x, nose.y - 7, nose.x, nose.y + 7);
    }
    c.restore();
  }

  /** Bearing to the nearest friendly airfield (nav cue). */
  navCue(g: Game): { name: string; bearing: number; dist: number } | null {
    const p = g.player;
    if (!p) return null;
    let best = null as null | { name: string; bearing: number; dist: number };
    for (const f of AIRFIELDS) {
      if (f.team !== p.team) continue;
      const d = Math.hypot(f.x - p.fm.pos.x, f.z - p.fm.pos.z);
      if (!best || d < best.dist) best = { name: f.name, bearing: bearingXZ(p.fm.pos.x, p.fm.pos.z, f.x, f.z), dist: d };
    }
    return best;
  }
}
