// The airshow camera in use: its settings (cameraBody.ts) turned into what happens
// frame by frame — the exposure the meter settles on, where the lens is focused,
// the photographer's hands shaking a long lens (less with stabilisation on), and
// when the shutter actually fires (bursts, the self-timer, the interval timer,
// AF-S focusing before it lets the shutter go).

import type { TimeOfDay } from '../../render/environment';
import type { CameraLook } from '../../render/renderer';
import type { Exif } from '../spotterBook';
import {
  CameraSettings, Exposure, STYLE_LOOK, loadSettings, saveSettings, sceneLight, solveExposure, sceneKelvin, wbGains, maxAperture,
} from './cameraBody';
import type { DevelopParams } from './develop';

export interface Light {
  tod: TimeOfDay;
  gloom: number;
  /** the angle between where the camera points and the sun (rad) */
  sunAngle: number;
  dark: boolean;
}

/** what the camera sees of the jet this frame */
export interface Subject {
  /** in the frame at all, and where (-1..1 both ways, y up) */
  inFrame: boolean;
  x: number;
  y: number;
  /** how much of the frame's width it fills */
  fill: number;
  /** distance (m) */
  dist: number;
  /** moving (a jet flying its display) or parked */
  moving: boolean;
}

export class ProCamera {
  s: CameraSettings = loadSettings();
  expo: Exposure = { aperture: 5.6, shutter: 1 / 1000, iso: 100, metered: 14, bias: 0, gain: 1 };
  /** the light the meter saw, for scoring */
  light = { sky: 14, subject: 12.5, ref: 14, backlit: 0 };
  /** where the lens is focused (dioptres: 1 / metres) */
  focusD = 1 / 600;
  /** the focus is on the jet (the AF box turns green) */
  inFocus = false;
  /** the jet is inside the focus area */
  subjectInArea = false;
  /** the hands' shake: the view's offset (rad) and how fast it moves (rad/s) */
  shakeYaw = 0;
  shakePitch = 0;
  shakeRate = 0;
  private shakeT = Math.random() * 100;
  private gainSm = 1;
  private noiseSm = 0;
  // the shutter
  private holdT = 0;
  private timerT = -1;
  intervalOn = false;
  private intervalT = 0;
  private afsT = -1;
  /** seconds left on the self-timer (or -1), for the viewfinder */
  get timerLeft(): number {
    return this.timerT;
  }
  /** AF-S is focusing before the shutter goes */
  get focusing(): boolean {
    return this.afsT >= 0;
  }
  /** a quiet beep for the self-timer's count */
  onBeep: ((fast: boolean) => void) | null = null;

  save(): void {
    saveSettings(this.s);
  }

  /** dioptre the lens is at, as metres */
  get focusM(): number {
    return 1 / Math.max(1e-5, this.focusD);
  }

  private afMode(subject: Subject): 'C' | 'S' | 'M' {
    const af = this.s.af;
    if (af === 'MF') return 'M';
    if (af === 'AF-C') return 'C';
    if (af === 'AF-S') return 'S';
    return subject.moving ? 'C' : 'S';
  }

  /** is the subject inside the focus area? */
  private inArea(sub: Subject, aspect: number): boolean {
    if (!sub.inFrame) return false;
    const a = this.s.area;
    // (sizes in screen heights; a big jet overlapping the area counts too)
    const dx = Math.abs(sub.x) * aspect, dy = Math.abs(sub.y);
    const r = sub.fill * aspect * 0.5;
    if (a === 'point') return dx < 0.06 + r && dy < 0.06 + r * 0.4;
    if (a === 'zone') return dx < 0.32 + r && dy < 0.3 + r * 0.4;
    return true;
  }

  /** a frame: meter, focus and the hands */
  update(dt: number, focal: number, viewPitch: number, light: Light, sub: Subject, aspect: number): void {
    const s = this.s;
    this.lightTod = light.tod;
    this.lightGloom = light.gloom;
    // ---- the meter: the sky and the jet, weighted by where the metering looks
    this.light = sceneLight(light.tod, light.gloom, viewPitch, light.sunAngle, light.dark);
    let w = 0;
    if (sub.inFrame) {
      const off = Math.hypot(sub.x * aspect, sub.y);
      const area = Math.min(1, sub.fill * sub.fill * 2.2);
      if (s.metering === 'spot') w = off < 0.08 + sub.fill * 0.5 ? 1 : 0;
      else if (s.metering === 'centre') w = Math.min(1, area * 2.5 + 0.25) * Math.max(0, 1 - off / 0.9);
      else w = Math.min(1, area * 1.5 + 0.05);
    }
    this.expo = solveExposure(s, this.light, w, focal);
    // (the viewfinder's brightness settles like a real one's)
    const k = 1 - Math.exp(-dt / 0.18);
    this.gainSm += (this.expo.gain - this.gainSm) * k;
    // ---- focus
    this.subjectInArea = this.inArea(sub, aspect);
    const mode = this.afMode(sub);
    const target = this.subjectInArea ? 1 / Math.max(1, sub.dist) : this.focusD;
    if (mode === 'M') this.focusD = 1 / Math.max(1, s.mfDist);
    else if (mode === 'C') {
      // the lens motor: a long lens is slower to drive
      const tau = 0.05 + focal / 5000;
      this.focusD += (target - this.focusD) * (1 - Math.exp(-dt / tau));
    }
    if (this.afsT >= 0) {
      this.afsT -= dt;
      if (this.afsT < 0) this.focusD = target;
    }
    this.inFocus = sub.inFrame && Math.abs(1 / Math.max(1, sub.dist) - this.focusD) < this.dofDioptres(focal) * 0.5;
    // ---- the hands: a slow sway and a faster tremor, smaller with stabilisation
    this.shakeT += dt;
    const isK = s.is === 'off' ? 1 : s.is === 'on' ? 0.12 : 0.2;
    const amp = 0.00042 * (focal / 600) * isK;
    const t = this.shakeT;
    const ny = Math.sin(t * 1.7) * 0.6 + Math.sin(t * 4.3 + 1.3) * 0.3 + Math.sin(t * 9.1 + 2.1) * 0.15;
    const np = Math.sin(t * 1.3 + 0.7) * 0.6 + Math.sin(t * 5.1 + 0.2) * 0.3 + Math.sin(t * 8.3 + 1.1) * 0.15;
    const py = this.shakeYaw, pp = this.shakePitch;
    this.shakeYaw = ny * amp;
    this.shakePitch = np * amp;
    this.shakeRate = dt > 0 ? Math.hypot(this.shakeYaw - py, this.shakePitch - pp) / dt : 0;
    // ---- the sensor's noise in the viewfinder (ISO)
    const iso = this.expo.iso;
    const noise = iso <= 400 ? 0 : 0.012 * Math.log2(iso / 400) + (iso > 6400 ? 0.02 * Math.log2(iso / 6400) : 0);
    this.noiseSm += (noise - this.noiseSm) * k;
  }

  /** how deep (dioptres) the sharp zone is at this focal length and aperture */
  dofDioptres(focal: number): number {
    // circle of confusion 0.03 mm (full frame): depth of field ≈ 2·N·c / f²
    return (2 * this.expo.aperture * 0.03) / ((focal * focal) / 1000);
  }

  /** the blur (px on a 1080-line picture) of something at `dist` metres */
  cocPx(focal: number, dist: number): number {
    const d = Math.abs(1 / Math.max(1, dist) - this.focusD);
    return ((focal * focal) / (this.expo.aperture * 1000 * 24)) * 1080 * d;
  }

  /** the viewfinder's look: the exposure, white balance, picture style, noise and the lens */
  look(neutral = false): CameraLook {
    const s = this.s;
    const st = STYLE_LOOK[neutral ? 'standard' : s.style];
    const wb = neutral ? ([1, 1, 1] as [number, number, number]) : wbGains(s, sceneKelvin(this.lightTod, this.lightGloom));
    // a fast lens wide open darkens its corners and fringes a little (lens corrections off)
    const wide = Math.max(0, 1 - (this.expo.aperture - 2.8) / 5);
    return {
      exposure: this.gainSm,
      wb,
      contrast: neutral ? 1 : st.con,
      saturation: neutral ? 1 : st.sat,
      lift: neutral ? 0 : st.lift,
      warm: neutral ? 0 : st.warm,
      mono: neutral ? 0 : st.mono,
      noise: this.noiseSm + (neutral ? 0 : st.grain),
      vignette: s.lensCorr ? 0.06 : 0.3 + 0.25 * wide,
      aberration: s.lensCorr ? 0 : 0.0028,
    };
  }

  /** the developer's settings for the JPEG (the RAW is the neutral frame) */
  developParams(): DevelopParams {
    const s = this.s;
    const st = STYLE_LOOK[s.style];
    return {
      wb: wbGains(s, sceneKelvin(this.lightTod, this.lightGloom)),
      ev: 0,
      contrast: st.con,
      saturation: st.sat,
      lift: st.lift,
      warm: st.warm,
      mono: st.mono,
      adobe: s.space === 'adobe',
    };
  }

  /** set with the light each frame (for white balance) */
  lightTod: TimeOfDay = 'noon';
  lightGloom = 0;

  exif(): Exif {
    const s = this.s;
    return {
      mode: s.mode,
      shutter: this.expo.shutter,
      aperture: this.expo.aperture,
      iso: this.expo.iso,
      ev: s.ev,
      metering: s.metering,
      af: `${s.af} ${s.area.toUpperCase()}`,
      wb: s.wb === 'kelvin' ? `${s.kelvin} K` : s.wb.toUpperCase(),
      style: s.style,
      space: s.space,
      format: s.format,
      is: s.is,
    };
  }

  // ---------------------------------------------------------------- the shutter

  /**
   * The shutter button pressed (`down`) or held this frame; returns true when a
   * picture is to be taken now.
   */
  shutter(dt: number, pressed: boolean, held: boolean, sub: Subject, focal: number): boolean {
    const d = this.s.drive;
    let fire = false;
    // the self-timer and the interval timer run on their own
    if (this.timerT >= 0) {
      const before = this.timerT;
      this.timerT -= dt;
      if (Math.floor(before * (before < 2 ? 4 : 1)) !== Math.floor(this.timerT * (this.timerT < 2 ? 4 : 1))) this.onBeep?.(this.timerT < 2);
      if (this.timerT < 0) {
        this.timerT = -1;
        fire = true;
      }
    }
    if (this.intervalOn) {
      this.intervalT -= dt;
      if (this.intervalT <= 0) {
        this.intervalT += this.s.interval;
        fire = true;
      }
    }
    if (pressed) {
      if (d === 'timer2' || d === 'timer10') {
        this.timerT = this.timerT >= 0 ? -1 : d === 'timer2' ? 2 : 10;
      } else if (d === 'interval') {
        this.intervalOn = !this.intervalOn;
        this.intervalT = 0;
      } else if (this.afMode(sub) === 'S' && this.subjectInArea && Math.abs(1 / Math.max(1, sub.dist) - this.focusD) > this.dofDioptres(focal) * 0.3) {
        // AF-S: focus first, then the shutter goes (the further the lens has to travel, the longer)
        const travel = Math.abs(1 / Math.max(1, sub.dist) - this.focusD);
        this.afsT = Math.min(0.45, 0.07 + travel * 60 + focal / 6000);
        this.pendingAfs = true;
      } else fire = true;
      this.holdT = 0;
    } else if (held && (d === 'low' || d === 'high')) {
      this.holdT += dt;
      const gap = d === 'high' ? 0.1 : 0.25;
      // (the first frame went on the press; the burst starts after a beat)
      if (this.holdT >= gap) {
        this.holdT -= gap;
        fire = true;
      }
    }
    if (this.pendingAfs && this.afsT < 0) {
      this.pendingAfs = false;
      fire = true;
    }
    return fire;
  }
  private pendingAfs = false;

  /** AF-ON: focus now (AF-S locks here until the next press) */
  focusNow(sub: Subject): void {
    if (this.subjectInArea) this.focusD = 1 / Math.max(1, sub.dist);
  }

  /** the slowest the shutter can go for this lens without a tripod, for hints */
  static handheldLimit(focal: number, is: string): number {
    return 1 / Math.max(30, focal * (is === 'off' ? 1 : 0.25));
  }

  static maxAperture = maxAperture;
}
