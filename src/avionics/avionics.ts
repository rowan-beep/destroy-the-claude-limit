// The player's avionics: navigation, the moving-map data and every cockpit
// display. Each display is a canvas texture split into one or more portals;
// each portal shows a page and publishes its option select buttons, which
// can be pressed with the mouse (bezel buttons or touch screens) or cycled
// from the keyboard.

import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Aircraft } from '../aircraft/aircraft';
import type { AircraftType } from '../aircraft/specs';
import { NavSystem } from './nav';
import { Pen, C, OsbButton, drawOsbLabels, hitOsb } from './draw';
import { MfdPage, PageEnv, PageId, PageNames, PortalState } from './pages/page';
import { radarPage } from './pages/radarPage';
import { tsdPage } from './pages/tsdPage';
import { smsPage } from './pages/smsPage';
import { enginePage } from './pages/enginePage';
import { fuelPage } from './pages/fuelPage';
import { ewPage } from './pages/ewPage';
import { hsiPage } from './pages/hsiPage';
import { fcsPage } from './pages/fcsPage';
import { menuPage } from './pages/menuPage';
import { drawUfc, drawStandby, drawWarningPanel, drawEfd } from './special';
import { audio } from '../audio/audio';

export const PAGES: Record<PageId, MfdPage> = {
  MENU: menuPage,
  RDR: radarPage,
  TSD: tsdPage,
  SMS: smsPage,
  ENG: enginePage,
  FUEL: fuelPage,
  EW: ewPage,
  HSI: hsiPage,
  FCS: fcsPage,
};

const CYCLE: PageId[] = ['RDR', 'TSD', 'SMS', 'EW', 'HSI', 'FUEL', 'ENG', 'FCS'];

export const PAGE_NAMES: Record<AircraftType, PageNames> = {
  F15EX: { tsd: 'TSD', ew: 'EW', sms: 'SMS' },
  FA18EF: { tsd: 'SA', ew: 'EW', sms: 'STRS' },
  TYPHOON: { tsd: 'PA', ew: 'DASS', sms: 'WPN' },
  SU35: { tsd: 'TAC', ew: 'REB', sms: 'SUO' },
};

export type DisplayKind = 'mfd' | 'lad' | 'ufc' | 'standby' | 'dwp' | 'efd';

export interface PortalDef {
  x: number;
  y: number;
  w: number;
  h: number;
  page: PageId;
}

export interface DisplayDef {
  id: string;
  kind: DisplayKind;
  /** canvas resolution */
  w: number;
  h: number;
  portals?: PortalDef[];
  /** redraws per second */
  hz?: number;
  /** keyboard cycling slot (0 = left, 1 = centre, 2 = right), per portal */
  slots?: number[];
}

export class Portal {
  buttons: OsbButton[] = [];
  readonly st: PortalState;
  constructor(
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly h: number,
    page: PageId,
    readonly slot: number,
  ) {
    this.st = { page, opts: {} };
  }
}

export class MfdDisplay {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly pen: Pen;
  readonly portals: Portal[] = [];
  private timer = Math.random() * 0.1;

  constructor(readonly def: DisplayDef) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = def.w;
    this.canvas.height = def.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.pen = new Pen(this.ctx);
    (def.portals ?? []).forEach((pd, i) => this.portals.push(new Portal(pd.x, pd.y, pd.w, pd.h, pd.page, def.slots?.[i] ?? -1)));
    this.ctx.fillStyle = C.bg;
    this.ctx.fillRect(0, 0, def.w, def.h);
  }

  /** Redraw on the next frame (after a button press). */
  redrawSoon(): void {
    this.timer = 0;
  }

  due(dt: number): boolean {
    this.timer -= dt;
    if (this.timer > 0) return false;
    this.timer = 1 / (this.def.hz ?? 8);
    return true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export class Avionics {
  readonly nav: NavSystem;
  displays: MfdDisplay[] = [];
  peakG = 1;
  lastLockLoss: { reason: string; time: number } | null = null;
  readonly names: PageNames;
  private wall = 0;
  /** display power: dark until the first draw after a (re)bind */
  powered = true;

  constructor(
    readonly g: Game,
    readonly p: Aircraft,
  ) {
    this.nav = new NavSystem(p.team);
    this.nav.bingoLb = this.nav.defaultBingo(p);
    this.names = PAGE_NAMES[p.type];
  }

  /** Create (or re-use) the display surfaces a cockpit asks for. */
  bind(defs: DisplayDef[]): MfdDisplay[] {
    // keep page state when re-binding identical displays (camera toggles)
    const old = new Map(this.displays.map((d) => [d.def.id, d]));
    const out: MfdDisplay[] = [];
    for (const def of defs) {
      const prev = old.get(def.id);
      if (prev && prev.def.w === def.w && prev.def.h === def.h) out.push(prev);
      else out.push(new MfdDisplay(def));
    }
    for (const d of this.displays) if (!out.includes(d)) d.dispose();
    this.displays = out;
    return out;
  }

  update(dt: number, drawNow: boolean): void {
    this.wall += dt;
    const p = this.p;
    if (p.alive) this.peakG = Math.max(this.peakG, p.fm.nz);
    if (!drawNow) return;
    for (const d of this.displays) {
      if (!d.due(dt)) continue;
      this.drawDisplay(d);
      d.texture.needsUpdate = true;
    }
  }

  private env(d: MfdDisplay, portal: Portal): PageEnv {
    return {
      g: this.g,
      p: this.p,
      av: this,
      pen: d.pen,
      w: portal.w,
      h: portal.h,
      st: portal.st,
      blink: Math.floor(this.wall * 2.5) % 2 === 0,
      t: this.wall,
      names: this.names,
    };
  }

  private drawDisplay(d: MfdDisplay): void {
    const ctx = d.ctx;
    const p = this.p;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, d.def.w, d.def.h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // a dead jet's displays go dark; G-LOC doesn't affect the avionics
    if (!p.alive && p.fm.crashed) return;
    switch (d.def.kind) {
      case 'ufc':
        drawUfc(d.pen, d.def.w, d.def.h, this);
        return;
      case 'standby':
        drawStandby(d.pen, d.def.w, d.def.h, this);
        return;
      case 'dwp':
        drawWarningPanel(d.pen, d.def.w, d.def.h, this, Math.floor(this.wall * 2.5) % 2 === 0);
        return;
      case 'efd':
        drawEfd(d.pen, d.def.w, d.def.h, this);
        return;
    }
    for (const portal of d.portals) {
      ctx.save();
      ctx.translate(portal.x, portal.y);
      ctx.beginPath();
      ctx.rect(0, 0, portal.w, portal.h);
      ctx.clip();
      const e = this.env(d, portal);
      const page = PAGES[portal.st.page];
      try {
        page.draw(e);
        portal.buttons = page.buttons(e);
        drawOsbLabels(d.pen, portal.w, portal.h, portal.buttons, d.def.kind === 'lad' ? 18 : 19);
      } catch (err) {
        // a page must never take the sim down
        console.warn('MFD page error', portal.st.page, err);
        ctx.fillStyle = C.amber;
        ctx.fillText('PAGE FAULT', 20, 40);
      }
      ctx.restore();
      if (d.portals.length > 1) {
        ctx.strokeStyle = 'rgba(120,150,170,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(portal.x + 1, portal.y + 1, portal.w - 2, portal.h - 2);
      }
    }
  }

  /** Press OSB n of a portal. */
  press(display: MfdDisplay, portalIdx: number, osb: number): boolean {
    const portal = display.portals[portalIdx];
    if (!portal) return false;
    const b = portal.buttons.find((x) => x.osb === osb);
    if (!b?.act) return false;
    b.act();
    audio.click();
    display.redrawSoon();
    return true;
  }

  /** Click on a display surface at texture UV (0..1, v up). */
  clickUv(display: MfdDisplay, u: number, v: number): boolean {
    const x = u * display.def.w;
    const y = (1 - v) * display.def.h;
    for (let i = 0; i < display.portals.length; i++) {
      const p = display.portals[i];
      if (x < p.x || y < p.y || x > p.x + p.w || y > p.y + p.h) continue;
      const b = hitOsb(x - p.x, y - p.y, p.w, p.h, p.buttons);
      if (b) return this.press(display, i, b.osb);
    }
    return false;
  }

  /** Keyboard: step the page on the display portal in a slot. */
  cycle(slot: number): void {
    const portals: Portal[] = [];
    for (const d of this.displays) for (const p of d.portals) if (p.slot === slot) portals.push(p);
    const portal = portals[0];
    if (!portal) return;
    const i = CYCLE.indexOf(portal.st.page);
    portal.st.page = CYCLE[(i + 1) % CYCLE.length];
    audio.click();
    for (const d of this.displays) if (d.portals.includes(portal)) d.redrawSoon();
  }

  /** Page currently shown in a keyboard slot (for on-screen hints). */
  pageInSlot(slot: number): PageId | null {
    for (const d of this.displays) for (const p of d.portals) if (p.slot === slot) return p.st.page;
    return null;
  }

  dispose(): void {
    for (const d of this.displays) d.dispose();
    this.displays = [];
  }
}
