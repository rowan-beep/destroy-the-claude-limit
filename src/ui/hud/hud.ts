// In-flight HUD: DOM instrument panels + canvas symbology + vision overlay.

import { emptyVision } from '../../render/vision';
import { MISSILES, weaponCode, weaponShort, isBomb } from '../../weapons/weaponSpecs';
import type { Game } from '../../game/game';
import type { MsgKind } from '../../game/modes/mode';
import { el, setText, setClass, clearEl } from '../dom';
import { HudPainter } from './hudDraw';
import { drawRadarScope, drawRwr, drawMinimap, drawCompass } from './scopes';
import { FT, KT, LB, NM } from '../../core/constants';
import { fmtTime, clamp } from '../../core/math';
import { ACTION_LABELS, Action } from '../../core/input';

interface Msg {
  el: HTMLElement;
  until: number;
}

function keyName(code: string): string {
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('ShiftLeft', 'SHIFT')
    .replace('ShiftRight', 'R-SHIFT')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('Space', 'SPACE')
    .replace('Backquote', '`')
    .replace('BracketLeft', '[')
    .replace('BracketRight', ']')
    .replace('Semicolon', ';')
    .replace('Comma', ',')
    .replace('Period', '.')
    .replace('Backslash', '\\')
    .replace('Slash', '/')
    .replace('Quote', "'")
    .replace('Escape', 'ESC')
    .toUpperCase();
}

const NO_VISION = emptyVision();

export class Hud {
  private lastFilter = '';
  readonly root: HTMLDivElement;
  private painter: HudPainter;
  private flight: HTMLElement;
  private engine: HTMLElement;
  private stores: HTMLElement;
  private radarStatus: HTMLElement;
  private radarCanvas: HTMLCanvasElement;
  private rwrCanvas: HTMLCanvasElement;
  private minimap: HTMLCanvasElement;
  private compass: HTMLCanvasElement;
  private scoreTitle: HTMLElement;
  private scoreBlue: HTMLElement;
  private scoreTimer: HTMLElement;
  private scoreRed: HTMLElement;
  private objective: HTMLElement;
  private orderBox: HTMLElement;
  private orderTitle: HTMLElement;
  private orderBody: HTMLElement;
  private orderUntil = 0;
  private msgList: HTMLElement;
  private msgs: Msg[] = [];
  private killfeed: HTMLElement;
  private feedItems: Msg[] = [];
  private centerWarn: HTMLElement;
  /** purple storm vignette while outside the free-for-all zone */
  private stormEl: HTMLElement;
  /** centre warning supplied by the game mode (free-for-all storm) */
  private modeWarning = '';
  private shotdownEl: HTMLElement;
  private weaponSlots: Record<string, HTMLElement> = {};
  private cmSlot: HTMLElement;
  private weaponBar: HTMLElement;
  private help: HTMLElement;
  private info: HTMLElement;
  private vision: HTMLElement;
  private glocText: HTMLElement;
  private fpsEl: HTMLElement;
  private rearmEl: HTMLElement;
  private rearmFill: HTMLElement;
  private panelTimer = 0;
  private scopeTimer = 0;
  private sweep = 0;
  private hitMarkerT = 0;
  private damageT = 0;
  private hidden = false;
  private now = 0;
  showFps = true;

  constructor(parent: HTMLElement) {
    this.root = el('div', '', parent);
    this.root.id = 'hud';
    const canvas = el('canvas', 'hud-canvas', this.root);
    this.painter = new HudPainter(canvas, canvas.getContext('2d')!);

    // top: score bar, compass, objective, orders, messages
    const sb = el('div', 'scorebar', this.root);
    this.scoreTitle = el('span', 'sb-title', sb, 'FREE FLIGHT');
    this.scoreBlue = el('span', 'sb-blue', sb, 'FRIENDLY 1');
    this.scoreTimer = el('span', 'sb-timer', sb, '00:00');
    this.scoreRed = el('span', 'sb-red', sb, 'ENEMY 0');
    const cw = el('div', 'compass', this.root);
    this.compass = el('canvas', 'compass-canvas', cw);
    this.objective = el('div', 'objective', this.root, '');
    this.orderBox = el('div', 'order-box hidden', this.root);
    this.orderTitle = el('div', 'order-title', this.orderBox);
    this.orderBody = el('div', 'order-body', this.orderBox);
    this.msgList = el('div', 'msg-list', this.root);
    this.stormEl = el('div', 'storm-overlay', this.root);
    this.centerWarn = el('div', 'center-warning', this.root);
    this.shotdownEl = el('div', 'shotdown hidden', this.root);

    // top right
    const tr = el('div', 'hud-topright', this.root);
    this.minimap = el('canvas', 'minimap', tr);
    this.killfeed = el('div', 'killfeed', tr);

    // left panels
    const left = el('div', 'hud-left', this.root);
    const fp = el('div', 'panel', left);
    el('div', 'ptitle', fp, '-- FLIGHT ----------------------');
    this.flight = el('div', 'pgrid', fp);
    const ep = el('div', 'panel', left);
    el('div', 'ptitle', ep, '-- ENGINE ----------------------');
    this.engine = el('div', '', ep);
    const sp = el('div', 'panel', left);
    el('div', 'ptitle', sp, '-- STORES ----------------------');
    this.stores = el('div', '', sp);
    const rp = el('div', 'panel radar-panel', left);
    this.radarStatus = el('div', 'radar-status', rp, 'RADAR');
    const rr = el('div', 'radar-row', rp);
    this.radarCanvas = el('canvas', 'radar-scope', rr);
    this.rwrCanvas = el('canvas', 'rwr-scope', rr);

    // bottom centre weapon bar
    const wb = el('div', 'weapon-bar', this.root);
    for (const [id, key, name] of [
      ['GUN', '1', 'GUN'],
      ['IR', '2', 'AIM-9X'],
      ['RDR', '3', 'AIM-120D'],
    ] as const) {
      const s = el('div', 'wslot', wb);
      el('span', 'wkey', s, key);
      el('div', 'wname', s, name);
      el('div', 'wcount', s, '0');
      this.weaponSlots[id] = s;
    }
    this.cmSlot = el('div', 'wslot cm-slot', wb);
    this.weaponBar = wb;

    // right: help + info
    const right = el('div', 'hud-right', this.root);
    this.info = el('div', 'panel info-card hidden', right);
    this.help = el('div', 'panel help-panel', right);

    this.rearmEl = el('div', 'rearm-bar hidden', this.root);
    el('div', '', this.rearmEl, 'GROUND CREW: REARM & REFUEL');
    this.rearmFill = el('div', 'fill', this.rearmEl);

    this.vision = el('div', 'vision-overlay', this.root);
    this.glocText = el('div', 'gloc-text hidden', this.vision, 'G-LOC');
    this.fpsEl = el('div', 'fps', this.root);
  }

  reset(g: Game): void {
    clearEl(this.msgList);
    this.msgs = [];
    clearEl(this.killfeed);
    this.feedItems = [];
    this.shotdownEl.classList.add('hidden');
    this.orderBox.classList.add('hidden');
    this.buildHelp(g);
    // an unarmed jet (the SR-71) has no weapons to show
    setClass(this.weaponBar, 'hidden', !!g.player && g.player.spec.stations.length === 0);
    this.root.classList.remove('hidden');
    setClass(this.help, 'hidden', !g.settings.gameplay.showHelp);
  }

  private buildHelp(g: Game): void {
    clearEl(this.help);
    el('div', 'ptitle', this.help, 'CONTROLS / KEYBOARD      [F9]');
    const b = g.settings.input.bindings;
    const rows: [string, Action[]][] = [
      ['PITCH / ROLL', ['pitchDown', 'pitchUp', 'rollLeft', 'rollRight']],
      ['RUDDER', ['yawLeft', 'yawRight']],
      ['THROTTLE +/-', ['throttleUp', 'throttleDown']],
      ['AFTERBURNER', ['afterburner']],
      ['FIRE', ['fire']],
      ['GUN / IR / RADAR MSL', ['weaponGun', 'weapon9x', 'weapon120']],
      ['LOCK / UNLOCK', ['lock', 'unlock']],
      ['RADAR MODE', ['radarMode']],
      ['FLARE / CHAFF', ['flare', 'chaff']],
      ['GEAR / SPDBRK', ['gear', 'speedbrake']],
      ['WHEEL BRAKE', ['wheelBrake']],
      ['G-LIM OVERRIDE', ['gOverride']],
      ['CAMERA 1ST/3RD', ['camera']],
      ['MFD L / C / R', ['mfdLeft', 'mfdCenter', 'mfdRight']],
      ['COCKPIT CURSOR', ['cockpitCursor']],
      ['STPT / RTB', ['stptNext', 'navRtb']],
      ['MAP', ['map']],
      ['AUTO-FLY', ['autopilot']],
      ['REARM (PARKED)', ['rearm']],
      ['EJECT (HOLD)', ['eject']],
      ['PAUSE', ['pause']],
    ];
    for (const [label, acts] of rows) {
      const r = el('div', 'row', this.help);
      el('span', 'key', r, acts.map((a) => keyName(b[a][0] ?? '?')).join(' '));
      el('span', 'act', r, label);
    }
    const mm = g.settings.input.mouseMode;
    el('div', 'ptitle', this.help, mm === 'mouseaim' ? 'MOUSE: AIM · LMB FIRE · RMB LOOK' : mm === 'joystick' ? 'MOUSE: STICK · LMB FIRE · RMB LOOK' : 'MOUSE: RMB DRAG TO LOOK · WHEEL ZOOM');
    void ACTION_LABELS;
  }

  toggleHelp(): void {
    this.help.classList.toggle('hidden');
  }

  /** Spectating: hide the (dead) player's own instruments, keep the score, messages and labels. */
  setSpectating(on: boolean): void {
    setClass(this.root, 'spectating', on);
    if (on) this.shotdownEl.classList.add('hidden');
  }

  toggleHidden(): void {
    this.hidden = !this.hidden;
    setClass(this.root, 'hud-hidden', this.hidden);
  }

  setVisible(v: boolean): void {
    setClass(this.root, 'hidden', !v);
  }

  message(text: string, kind: MsgKind = 'info', seconds = 5): void {
    const e = el('div', `msg ${kind}`, this.msgList, text);
    this.msgs.push({ el: e, until: this.now + seconds });
    while (this.msgs.length > 5) {
      const m = this.msgs.shift()!;
      m.el.remove();
    }
  }

  order(title: string, body: string, seconds = 10): void {
    setText(this.orderTitle, title);
    setText(this.orderBody, body);
    this.orderBox.classList.remove('hidden');
    this.orderUntil = this.now + seconds;
  }

  feed(text: string, side: 'blue' | 'red'): void {
    const e = el('div', `kf ${side}`, this.killfeed, text);
    this.feedItems.push({ el: e, until: this.now + 14 });
    while (this.feedItems.length > 6) this.feedItems.shift()!.el.remove();
  }

  shotDown(by: string | null, cause: string): void {
    clearEl(this.shotdownEl);
    this.shotdownEl.append(by ? `SHOT DOWN BY ${by}` : 'AIRCRAFT LOST');
    const s = el('small', '', this.shotdownEl, cause);
    void s;
    this.shotdownEl.classList.remove('hidden');
  }

  hitMarker(): void {
    this.hitMarkerT = 0.25;
  }

  damageFlash(): void {
    this.damageT = 0.6;
  }

  update(dt: number, g: Game): void {
    // cockpit view: a clean, realistic picture (flight data lives on the 3D HUD and displays)
    setClass(this.root, 'cockpit-clean', g.cam.mode === 'cockpit' && !g.settings.gameplay.cockpitPanels);
    this.now += dt;
    const p = g.player;
    if (!p) return;
    const fm = p.fm;
    this.painter.resize();
    this.painter.clear();

    // pilot vision affects the whole HUD too (not once the jet has crashed:
    // the death camera shows the wreck, as the 3D view does)
    const v = p.alive || !p.fm.crashed ? p.pilot.vision : NO_VISION;
    const blackout = v.blackout;
    const red = v.redout;
    let bg = 'transparent';
    if (blackout > 0.01) {
      // the HUD goes dark with the view; the heartbeat throbs red at the edges
      const h = Math.min(1, v.heart);
      bg = h > 0.01 ? `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,${blackout}) 28%, rgba(${Math.round(85 * h)},0,3,${blackout}) 100%)` : `rgba(0,0,0,${blackout})`;
    }
    else if (red >= 1) bg = 'rgba(140,0,0,1)';
    else if (red > 0) bg = 'rgba(140,0,0,0.5)';
    this.vision.style.background = bg;
    setClass(this.glocText, 'hidden', blackout < 0.99);
    if (blackout >= 0.99) this.glocText.style.opacity = (0.35 + 0.65 * Math.min(1, v.heart)).toFixed(2);
    let filt = v.mono > 0 ? 'grayscale(1) brightness(0.8)' : v.greyout > 0 ? `grayscale(${v.greyout.toFixed(2)}) brightness(${(1 - v.greyout * 0.25).toFixed(2)})` : '';
    if (v.blur > 0.05) filt += ` blur(${(v.blur * 2.5).toFixed(1)}px)`;
    // (compare with what we last set: the browser normalises the string it hands back)
    if (this.lastFilter !== filt) {
      this.lastFilter = filt;
      this.root.style.filter = filt;
    }

    // canvas symbology
    const alive = p.alive && !p.pilot.unconscious;
    if (alive && !this.hidden) {
      if (g.cam.mode === 'cockpit') {
        this.painter.drawCockpit(g);
        this.painter.drawHmd(g);
        this.painter.contactMarkers(g, p, g.renderer.camera);
        this.painter.leadMarker(g, p, g.renderer.camera, p.selectedWeapon !== 'GUN');
      } else if (g.cam.mode !== 'death') {
        this.painter.drawExternal(g);
        if (g.cam.mode !== 'weapon') this.painter.leadMarker(g, p, g.renderer.camera, false);
      }
      if (g.settings.input.mouseMode === 'mouseaim' && g.cam.mode !== 'weapon') this.painter.drawMouseAim(g);
      if (g.cam.mode !== 'death') this.painter.strikeCues(g, p, g.renderer.camera);
      if (g.cam.mode !== 'death' && g.cam.mode !== 'weapon') this.painter.objectiveGuide(g, p, g.renderer.camera);
    }
    if (!this.hidden) this.painter.drawLabels(g);
    if (this.hitMarkerT > 0) {
      this.hitMarkerT -= dt;
      const c = this.painter.ctx;
      const cx = this.painter.w / 2, cy = this.painter.h / 2;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        c.beginPath();
        c.moveTo(cx + sx * 8, cy + sy * 8);
        c.lineTo(cx + sx * 16, cy + sy * 16);
        c.stroke();
      }
    }
    if (this.damageT > 0) this.damageT -= dt;

    // messages expiry
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      if (this.now > this.msgs[i].until) {
        this.msgs[i].el.remove();
        this.msgs.splice(i, 1);
      }
    }
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      if (this.now > this.feedItems[i].until) {
        this.feedItems[i].el.remove();
        this.feedItems.splice(i, 1);
      }
    }
    if (this.now > this.orderUntil) this.orderBox.classList.add('hidden');
    setClass(this.msgList, 'below', !this.orderBox.classList.contains('hidden'));

    // centre warnings
    this.updateWarnings(g);

    // scopes at ~20 Hz
    this.sweep += dt * 2.2;
    this.scopeTimer -= dt;
    if (this.scopeTimer <= 0) {
      this.scopeTimer = 0.05;
      // the radar and RWR scopes sit in the side panels, which the clean cockpit view hides
      if (!this.root.classList.contains('cockpit-clean')) {
        drawRadarScope(this.radarCanvas, g, this.sweep);
        drawRwr(this.rwrCanvas, g, Math.floor(this.now * 4) % 2 === 0);
      }
      drawMinimap(this.minimap, g);
      drawCompass(this.compass, g);
    }

    // text panels at ~12 Hz
    this.panelTimer -= dt;
    if (this.panelTimer > 0) return;
    this.panelTimer = 0.08;
    const st = g.mode?.status();
    if (st) {
      setText(this.scoreTitle, st.title);
      setText(this.scoreBlue, st.blueText ?? `FRIENDLY ${st.blue}`);
      setText(this.scoreTimer, fmtTime(st.timer));
      setText(this.scoreRed, st.redText ?? `ENEMY ${st.red}`);
      this.modeWarning = st.warning ?? '';
      setClass(this.stormEl, 'on', this.modeWarning.startsWith('OUTSIDE'));
      setText(this.objective, st.objective);
    }
    const metric = g.settings.gameplay.units === 'metric';
    const cas = metric ? `${Math.round(fm.cas * 3.6)} km/h` : `${Math.round(fm.cas / KT)} kt`;
    const alt = metric ? `${Math.round(fm.pos.y)} m` : `${Math.round(fm.pos.y / FT)} ft`;
    const ralt = metric ? `${Math.round(fm.agl)} m` : `${Math.round(fm.agl / FT)} ft`;
    const gs = `${Math.round(Math.hypot(fm.vel.x, fm.vel.z) * 3.6)}`;
    this.grid(this.flight, [
      ['IAS', cas, 'MACH', fm.mach.toFixed(2)],
      ['ALT', alt, 'KM/H', gs],
      ['AOA', `${(fm.alpha * 57.3).toFixed(1)} deg`, 'G', fm.nz.toFixed(1)],
      ['RALT', ralt, 'BETA', (fm.beta * 57.3).toFixed(1)],
      ['HDG', `${String(Math.round(fm.heading) % 360).padStart(3, '0')}`, 'VS', `${Math.round((fm.vs / FT) * 60)}`],
    ], {
      G: fm.nz > p.spec.gLimit ? 'bad-text' : fm.nz > 7 ? 'warn-text' : '',
      RALT: fm.agl < 150 && !fm.onGround ? 'bad-text' : '',
      AOA: fm.stallWarning ? 'warn-text' : '',
    });
    let rpm = 0;
    for (const r of fm.rpm) rpm += r;
    rpm /= fm.rpm.length;
    const thrPct = Math.round(Math.min(fm.throttleLever, 1) * 100);
    const abOn = fm.afterburner > 0.05;
    const fuelTot = fm.fuelTotal;
    const fuelPct = (fm.fuelInternal / p.spec.internalFuel) * 100;
    const mins = fm.fuelFlow > 0.01 ? fuelTot / fm.fuelFlow / 60 : 999;
    const fuelLow = fuelPct < 20;
    clearEl(this.engine);
    const l1 = el('div', 'pline', this.engine);
    l1.innerHTML = `THR <b>${thrPct} %</b>${abOn ? ' <span class="warn-text">AB ' + Math.round(fm.afterburner * 5) + '</span>' : ''} &nbsp; RPM ${Math.round(rpm * 100)} %`;
    el('div', 'pline', this.engine, `FN ${Math.round(fm.thrust / 4.448).toLocaleString('en-US')} lb   T/W ${fm.thrustToWeight.toFixed(2)}`);
    const tb = el('div', 'thr-bar', this.engine);
    const tf = el('div', 'fill' + (abOn ? ' ab' : ''), tb);
    tf.style.width = `${clamp(fm.throttleLever / 1.1, 0, 1) * 100}%`;
    el('div', 'mil', tb);
    const gearTxt = fm.gearPos > 0.95 ? 'DOWN' : fm.gearPos < 0.05 ? 'UP' : 'TRANSIT';
    el('div', 'pline', this.engine, `[GEAR ${gearTxt}]${fm.speedbrakePos > 0.1 ? ' [SPDBRK]' : ''}${g.gOverride ? ' [G-OVRD]' : ''}${g.autopilot && g.player ? ' [' + g.autoFly.label(g.player) + ']' : ''}`);
    const fl = el('div', 'pline' + (fuelLow ? ' bad-text' : ''), this.engine, `FUEL MAIN ${fuelPct.toFixed(1)} %  | DROP ${fm.fuelExternal > 0 ? Math.round(fm.fuelExternal / LB) + ' lb' : 'NONE'}`);
    void fl;
    el('div', 'pline' + (abOn ? ' warn-text' : ''), this.engine, `TOTAL ${Math.round(fuelTot / LB).toLocaleString('en-US')} lb  FF ${Math.round((fm.fuelFlow / LB) * 3600).toLocaleString('en-US')} pph  ~${mins > 600 ? '--' : mins.toFixed(1)} min`);
    const fb = el('div', 'fuel-bar', this.engine);
    const ff = el('div', 'fill' + (fuelLow ? ' low' : ''), fb);
    ff.style.width = `${clamp(fuelPct, 0, 100)}%`;

    // stores
    clearEl(this.stores);
    const sel = p.selectedWeapon;
    if (p.spec.stations.length === 0) el('div', 'pline', this.stores, 'UNARMED: CAMERAS · IR · ASARS · ELINT');
    else {
      const selName = sel === 'GUN' ? p.spec.gun.name.split(' ').slice(0, 2).join(' ') : weaponShort(sel);
      const lockTxt = isBomb(sel) ? (p.groundTarget ? `TGT ${p.groundTarget.label}` : 'NO TGT: [R]') : p.lockedTarget ? `LOCK ${p.lockedTarget.spec.shortName.toUpperCase()} ${(p.distanceTo(p.lockedTarget) / NM).toFixed(1)}NM`   : sel === p.irMissile ? (p.seekerTarget ? 'SEEKER LOCK' : 'SEEKER SEARCH') : 'NO LOCK: [R]';
      const s1 = el('div', 'pline', this.stores);
      s1.innerHTML = `${selName} x${sel === 'GUN' ? p.gunAmmo : p.countOf(sel)} &nbsp; <span class="${p.lockedTarget || p.seekerTarget ? 'good-text' : ''}">${lockTxt}</span>`;
      el('div', 'pline', this.stores, `FLR ${p.flares}  CHF ${p.chaff}  ${weaponCode(p.radarMissile)} ${p.countOf(p.radarMissile)}  ${weaponCode(p.irMissile)} ${p.countOf(p.irMissile)}${p.spec.missiles.radar === 'AIM120D' ? `  TNK ${p.countOf('TANK')}` : ''}`);
    }
    const integ = Math.round(p.damage.integrity * 100);
    const dmg = el('div', 'pline' + (integ < 60 ? ' bad-text' : integ < 90 ? ' warn-text' : ''), this.stores, `AIRFRAME ${integ}%${p.damage.fire > 0 ? '  ENGINE FIRE!' : ''}${p.damage.leak > 0 ? '  FUEL LEAK' : ''}${fm.engineOut.some((e) => e) ? '  ENGINE OUT' : ''}`);
    void dmg;

    // radar status
    const lt = p.lockedTarget;
    setText(this.radarStatus, `${p.spec.radar.name.split(' ')[0]} ${p.radar.mode} ${p.radar.scopeRange}NM${lt ? ' · STT' : ''}${p.irst ? (p.irst.lock ? ' · IRST TRK' : ' · IRST') : ''}  RWR`);

    // weapon slots
    for (const [id, slot] of Object.entries(this.weaponSlots)) {
      const w = id === 'GUN' ? 'GUN' : id === 'IR' ? p.irMissile : p.radarMissile;
      const n = w === 'GUN' ? p.gunAmmo : p.countOf(w);
      setText(slot.querySelector('.wname') as HTMLElement, w === 'GUN' ? 'GUN' : MISSILES[w].short);
      setText(slot.querySelector('.wcount') as HTMLElement, String(n));
      setClass(slot, 'sel', p.selectedWeapon === w);
      setClass(slot, 'empty', n === 0);
    }
    setText(this.cmSlot, `FLR ${p.flares} · CHF ${p.chaff}${g.sim.autoCm && p.spec.ew.autoDispense ? ' · AUTO' : ''}`);

    // info card when a target is locked
    if (lt) {
      this.info.classList.remove('hidden');
      clearEl(this.info);
      el('div', 'ptitle', this.info, `-- TARGET ${lt.callsign} --`);
      el('div', 'pline', this.info, `${lt.spec.name}`);
      el('div', 'pline', this.info, `RNG ${(p.distanceTo(lt) / NM).toFixed(1)} NM  ALT ${Math.round(lt.fm.pos.y / FT / 100) * 100} ft`);
      const lz = sel !== 'GUN' ? p.launchZoneFor(sel, lt) : null;
      if (lz) el('div', 'pline', this.info, `DLZ Rmax ${(lz.rmax / NM).toFixed(1)}  Rne ${(lz.rne / NM).toFixed(1)} NM`);
      el('div', 'pline', this.info, `SPD ${Math.round(lt.fm.tas / KT)} kt  M${lt.fm.mach.toFixed(2)}`);
    } else this.info.classList.add('hidden');

    // rearm progress
    if (g.rearmTimer >= 0) {
      this.rearmEl.classList.remove('hidden');
      this.rearmFill.style.width = `${(1 - g.rearmTimer / 15) * 100}%`;
    } else this.rearmEl.classList.add('hidden');

    setText(this.fpsEl, this.showFps ? `${Math.round(g.fps)} FPS` : '');
  }

  private grid(host: HTMLElement, rows: string[][], cls: Record<string, string>): void {
    if (host.childElementCount !== rows.length * 4) {
      clearEl(host);
      for (const r of rows) for (let i = 0; i < 4; i++) el('span', i % 2 === 0 ? 'k' : 'v', host);
    }
    let i = 0;
    for (const r of rows) {
      for (let k = 0; k < 4; k++) {
        const e = host.children[i++] as HTMLElement;
        setText(e, r[k]);
        if (k % 2 === 1) {
          const key = r[k - 1];
          const want = 'v ' + (cls[key] ?? '');
          if (e.className !== want.trim()) e.className = want.trim();
        }
      }
    }
  }

  private updateWarnings(g: Game): void {
    const p = g.player!;
    const fm = p.fm;
    let text = '';
    let amber = false;
    if (!p.alive) text = '';
    else if (p.pilot.unconscious) text = '';
    else {
      const mw = p.rwr.primaryMissile;
      if (mw) text = mw.kind === 'ir' ? `IR MISSILE ${mw.tti.toFixed(0)}s — FLARES [C] AND BREAK` : `RADAR MISSILE ${mw.tti.toFixed(0)}s — CHAFF [V] AND BREAK`;
      else if (p.rwr.level === 'lock') {
        text = 'RADAR LOCK — BEAM, NOTCH OR TERRAIN MASK';
        amber = true;
      } else if (!fm.onGround && fm.gearPos < 0.5 && fm.vel.y < -5 && fm.agl / -fm.vel.y < 5 && fm.agl < 1500) text = 'PULL UP! PULL UP!';
      else if (this.modeWarning) text = this.modeWarning;
      else if (fm.stallWarning) {
        text = 'ANGLE OF ATTACK LIMIT — UNLOAD';
        amber = true;
      } else if (p.pilot.gSmooth > 8 && p.pilot.gSmooth < 10.5) {
        text = 'G-LOC IMMINENT — EASE THE PULL';
        amber = true;
      } else if (fm.fuelTotal <= 0 || (g.avionics && g.avionics.nav.fuelPlan(p).belowBingo)) {
        text = fm.fuelTotal <= 0 ? 'FUEL EXHAUSTED' : 'BINGO FUEL — RTB [END] FOR NEAREST FIELD';
        amber = true;
      } else if (fm.gearPos > 0.5 && fm.cas / KT > 300 && !fm.onGround) {
        text = 'GEAR OVERSPEED';
        amber = true;
      } else if (fm.cat && fm.cat.phase === 'hold') {
        text = fm.cat.t > 0 ? 'SALUTE · HOLD FULL POWER · CATAPULT FIRING' : 'ON THE CATAPULT · FULL THROTTLE (SHIFT) TO LAUNCH';
        amber = true;
      } else if (fm.onGround && fm.gs < 1 && g.config.mode !== 'duel' && fm.throttleLever < 0.3 && g.sim.time < 12) {
        text = 'SHIFT: THROTTLE UP · TAB: AFTERBURNER · PULL AT 150 KT';
        amber = true;
      }
    }
    setText(this.centerWarn, text);
    setClass(this.centerWarn, 'amber', amber);
    setClass(this.centerWarn, 'blink', !amber && text !== '');
  }
}
