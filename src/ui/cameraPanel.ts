// The airshow camera's menu (C): every setting of the body in one panel, grouped
// the way a real camera's menu is — exposure, focus, drive, colour, image, aids —
// with a line explaining whichever setting the pointer is over.

import { el, clearEl } from './dom';
import type { ProCamera } from '../game/camera/proCamera';
import {
  APERTURES, SHUTTERS, ISOS, MODE_NAMES, STYLE_NAMES, CameraSettings, Mode, Style, nearest, fmtShutter, fmtAperture, fmtEv, maxAperture,
} from '../game/camera/cameraBody';

const CSS = `
.cp{position:fixed;right:16px;top:50%;transform:translateY(-50%);width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 140px);overflow-y:auto;z-index:40;background:#0b0f15f2;border:1px solid #ffffff22;border-radius:14px;padding:14px 16px 12px;color:#eef2f7;font-family:'Rajdhani','Segoe UI',system-ui,sans-serif;pointer-events:auto;box-shadow:0 20px 60px #000a;display:none}
.cp.show{display:block}
.cp h2{margin:0 0 4px;font-size:18px;letter-spacing:.22em;display:flex;justify-content:space-between;align-items:center}
.cp h2 button{background:#ffffff12;border:1px solid #ffffff26;color:#fff;border-radius:7px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer}
.cp-sum{font-size:13px;letter-spacing:.14em;color:#ffd38a;margin-bottom:8px;font-variant-numeric:tabular-nums}
.cp-sec{margin-top:10px;font-size:11px;letter-spacing:.3em;color:#8a98ab;border-bottom:1px solid #ffffff12;padding-bottom:3px}
.cp-row{display:grid;grid-template-columns:118px 1fr;align-items:center;gap:8px;padding:5px 0}
.cp-row.off{opacity:.38}
.cp-l{font-size:12px;letter-spacing:.14em;color:#c6d0dc}
.cp-opts{display:flex;flex-wrap:wrap;gap:4px}
.cp-o{background:#ffffff0b;border:1px solid #ffffff1c;color:#d9e1ea;border-radius:6px;padding:4px 8px;font:inherit;font-size:12px;font-weight:600;letter-spacing:.06em;cursor:pointer}
.cp-o:hover{background:#ffffff1a}
.cp-o.on{background:#ffb14a;border-color:#ffb14a;color:#1a1206}
.cp-step{display:flex;align-items:center;gap:6px}
.cp-step b{min-width:86px;text-align:center;font-size:16px;font-variant-numeric:tabular-nums}
.cp-help{margin-top:10px;min-height:3.2em;font-size:12px;line-height:1.45;color:#aab6c6;border-top:1px solid #ffffff12;padding-top:8px}
.cp-keys{margin-top:6px;font-size:11px;letter-spacing:.08em;color:#7d8a9c}
`;

const HELP: Record<string, string> = {
  mode: 'AUTO and P choose everything (P lets you set ISO and compensation). A: you set the aperture, the camera the shutter. S: you set the shutter, the camera the aperture. M: you set all three; the meter shows how far off you are. Scenes are presets: SPORTS freezes action, PORTRAIT blurs the background, LANDSCAPE keeps it all sharp, NIGHT gathers light.',
  shutter: 'How long the sensor sees the scene. 1/2000 freezes a fast jet; 1/250 or slower, swung with the jet, blurs the ground behind it into streaks while the jet stays sharp: the panning shot.',
  aperture: 'The lens opening. A low f-number (f/2.8) lets in more light and blurs what is in front of and behind the focus; a high one (f/11) keeps more of the scene sharp.',
  iso: 'The sensor\'s sensitivity. ISO 100 is clean; each step up brightens the picture and adds grain. AUTO raises it only when the light needs it.',
  ev: 'Exposure compensation: brighten (+) or darken (−) what the camera chooses. A dark jet against a bright sky usually wants +1 or so.',
  metering: 'How the camera reads the light. MATRIX weighs the whole frame (mostly sky), CENTRE favours the middle, SPOT reads just the jet under the focus point.',
  af: 'AF-S focuses once and then fires (best for parked jets). AF-C keeps focusing as the jet moves (for the flying display). AF-A picks for you. MF: you set the distance.',
  area: 'Where the camera looks for focus: one POINT in the middle, a ZONE around it, or the WIDE area with aircraft detection that finds the jet anywhere in the frame.',
  mf: 'The distance the lens is focused at, in manual focus.',
  drive: 'SINGLE: a picture per press. CONTINUOUS L/H: hold for 4 or 10 frames a second. The self-timer waits 2 or 10 seconds. INTERVAL takes a picture every few seconds until you press again.',
  interval: 'The time between pictures on the interval timer.',
  wb: 'White balance: what counts as white. AUTO corrects for the light (and takes some of a sunset\'s warmth out); DAYLIGHT keeps the light as it is; CLOUDY and SHADE warm the picture; TUNGSTEN and FLUORESCENT cool it; KELVIN sets the temperature exactly.',
  kelvin: 'The colour temperature the picture is balanced for: lower is cooler (bluer), higher warmer.',
  style: 'The camera\'s look: contrast, colour and tone. VIVID and VELVIA are punchy, NEUTRAL flat for editing, MONOCHROME and ACROS black and white, CLASSIC CHROME a muted film look.',
  space: 'sRGB is right for screens and the web. ADOBE RGB holds more saturated colour and writes its profile into the file, for wide-gamut screens and print.',
  format: 'JPEG: developed in the camera, ready to share. RAW: the neutral picture, lossless (PNG), to develop yourself in the album. RAW + JPEG keeps both.',
  is: 'Image stabilisation cancels the hands\' shake on a long lens. SPORT steadies the view while still letting you pan with a jet.',
  lens: 'Lens corrections fix the corner darkening (vignetting) and the colour fringes a lens shows wide open.',
};

export class CameraPanel {
  readonly root: HTMLDivElement;
  private sum: HTMLElement;
  private body: HTMLElement;
  private help: HTMLElement;
  private key = '';

  constructor(parent: HTMLElement, private pro: ProCamera, private focal: () => number) {
    if (!document.getElementById('cp-style')) {
      const st = el('style', '', document.head);
      st.id = 'cp-style';
      st.textContent = CSS;
    }
    this.root = el('div', 'cp', parent);
    const h = el('h2', '', this.root, 'CAMERA');
    const x = el('button', '', h, 'CLOSE  C') as HTMLButtonElement;
    x.addEventListener('click', () => this.show(false));
    this.sum = el('div', 'cp-sum', this.root);
    this.body = el('div', '', this.root);
    this.help = el('div', 'cp-help', this.root, 'Point at a setting to see what it does.');
    el('div', 'cp-keys', this.root, 'KEYS  [ ] shutter · ; \' aperture · , . ISO · 9 0 exposure compensation · Q focus now · C this menu');
    // (the panel's clicks don't take pictures or look round)
    for (const ev of ['pointerdown', 'pointerup', 'wheel']) this.root.addEventListener(ev, (e) => e.stopPropagation());
  }

  get open(): boolean {
    return this.root.classList.contains('show');
  }

  show(on: boolean): void {
    this.root.classList.toggle('show', on);
    if (on) this.build();
  }

  toggle(): void {
    this.show(!this.open);
  }

  /** the live readout at the top, every frame while open */
  update(): void {
    if (!this.open) return;
    const e = this.pro.expo;
    const s = this.pro.s;
    this.sum.textContent = `${s.mode.length === 1 ? s.mode : s.mode.toUpperCase()}   ${fmtShutter(e.shutter)}   ${fmtAperture(e.aperture)}   ISO ${e.iso}${s.iso ? '' : ' (AUTO)'}   ${fmtEv(s.mode === 'M' ? e.bias : s.ev)} EV   FOCUS ${Math.round(this.pro.focusM)} M`;
    const k = JSON.stringify(s) + Math.round(this.focal());
    if (k !== this.key) this.build();
  }

  private set<K extends keyof CameraSettings>(k: K, v: CameraSettings[K]): void {
    this.pro.s[k] = v;
    this.pro.save();
    this.build();
  }

  private build(): void {
    const s = this.pro.s;
    this.key = JSON.stringify(s) + Math.round(this.focal());
    const b = this.body;
    clearEl(b);
    const sec = (t: string) => el('div', 'cp-sec', b, t);
    const row = (label: string, help: string, off = false) => {
      const r = el('div', 'cp-row' + (off ? ' off' : ''), b);
      el('div', 'cp-l', r, label);
      r.addEventListener('pointerenter', () => (this.help.textContent = HELP[help] ?? ''));
      return el('div', 'cp-opts', r);
    };
    const opts = <K extends keyof CameraSettings>(parent: HTMLElement, k: K, list: [CameraSettings[K], string][]) => {
      for (const [v, t] of list) {
        const o = el('button', 'cp-o' + (s[k] === v ? ' on' : ''), parent, t) as HTMLButtonElement;
        o.addEventListener('click', () => this.set(k, v));
      }
    };
    const stepper = (parent: HTMLElement, text: string, dec: () => void, inc: () => void) => {
      const st = el('div', 'cp-step', parent);
      const m = el('button', 'cp-o', st, '−') as HTMLButtonElement;
      el('b', '', st, text);
      const p = el('button', 'cp-o', st, '+') as HTMLButtonElement;
      m.addEventListener('click', () => {
        dec();
        this.pro.save();
        this.build();
      });
      p.addEventListener('click', () => {
        inc();
        this.pro.save();
        this.build();
      });
    };
    const idx = (list: number[], v: number) => list.indexOf(nearest(list, v));
    const mv = (list: number[], v: number, d: number) => list[Math.max(0, Math.min(list.length - 1, idx(list, v) + d))];

    sec('EXPOSURE');
    const modes = row('MODE', 'mode');
    opts(modes, 'mode', (['auto', 'P', 'A', 'S', 'M'] as Mode[]).map((m) => [m, m === 'auto' ? 'AUTO' : m]));
    opts(modes, 'mode', (['sports', 'portrait', 'landscape', 'night'] as Mode[]).map((m) => [m, MODE_NAMES[m].replace('SCENE · ', '')]));
    const userShutter = s.mode === 'S' || s.mode === 'M';
    const userAperture = s.mode === 'A' || s.mode === 'M';
    stepper(row('SHUTTER', 'shutter', !userShutter), fmtShutter(userShutter ? s.shutter : this.pro.expo.shutter), () => (s.shutter = mv(SHUTTERS, s.shutter, 1)), () => (s.shutter = mv(SHUTTERS, s.shutter, -1)));
    const amax = maxAperture(this.focal());
    const aps = APERTURES.filter((a) => a >= amax);
    stepper(row('APERTURE', 'aperture', !userAperture), fmtAperture(userAperture ? Math.max(amax, s.aperture) : this.pro.expo.aperture), () => (s.aperture = mv(aps, s.aperture, -1)), () => (s.aperture = mv(aps, s.aperture, 1)));
    stepper(row('ISO', 'iso', s.mode === 'auto' || s.mode === 'sports' || s.mode === 'night'), s.iso ? String(s.iso) : 'AUTO', () => (s.iso = s.iso === 100 ? 0 : s.iso ? mv(ISOS, s.iso, -1) : 0), () => (s.iso = s.iso ? mv(ISOS, s.iso, 1) : 100));
    stepper(row('EXPOSURE ±', 'ev', s.mode === 'M'), fmtEv(s.ev), () => (s.ev = Math.max(-3, Math.round((s.ev - 1 / 3) * 3) / 3)), () => (s.ev = Math.min(3, Math.round((s.ev + 1 / 3) * 3) / 3)));
    opts(row('METERING', 'metering'), 'metering', [['matrix', 'MATRIX'], ['centre', 'CENTRE-WEIGHTED'], ['spot', 'SPOT']]);

    sec('FOCUS');
    opts(row('AF MODE', 'af'), 'af', [['AF-S', 'AF-S'], ['AF-C', 'AF-C'], ['AF-A', 'AF-A'], ['MF', 'MANUAL']]);
    opts(row('FOCUS AREA', 'area', s.af === 'MF'), 'area', [['point', 'POINT'], ['zone', 'ZONE'], ['wide', 'WIDE · AIRCRAFT DETECT']]);
    const dists = [5, 10, 15, 20, 30, 40, 60, 80, 100, 150, 200, 300, 400, 600, 800, 1200, 2000, 5000, 100000];
    stepper(row('MF DISTANCE', 'mf', s.af !== 'MF'), s.mfDist >= 100000 ? '∞' : `${s.mfDist} M`, () => (s.mfDist = mv(dists, s.mfDist, -1)), () => (s.mfDist = mv(dists, s.mfDist, 1)));

    sec('DRIVE');
    opts(row('DRIVE', 'drive'), 'drive', [['single', 'SINGLE'], ['low', 'CONT L · 4/S'], ['high', 'CONT H · 10/S'], ['timer2', 'TIMER 2 S'], ['timer10', 'TIMER 10 S'], ['interval', 'INTERVAL']]);
    const ivs = [1, 2, 3, 5, 10, 15, 30, 60];
    stepper(row('INTERVAL', 'interval', s.drive !== 'interval'), `${s.interval} S`, () => (s.interval = mv(ivs, s.interval, -1)), () => (s.interval = mv(ivs, s.interval, 1)));

    sec('COLOUR');
    opts(row('WHITE BALANCE', 'wb'), 'wb', [['auto', 'AUTO'], ['daylight', 'DAYLIGHT'], ['cloudy', 'CLOUDY'], ['shade', 'SHADE'], ['tungsten', 'TUNGSTEN'], ['fluorescent', 'FLUORESCENT'], ['kelvin', 'KELVIN']]);
    const ks = [2500, 2800, 3200, 3600, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8500, 10000];
    stepper(row('KELVIN', 'kelvin', s.wb !== 'kelvin'), `${s.kelvin} K`, () => (s.kelvin = mv(ks, s.kelvin, -1)), () => (s.kelvin = mv(ks, s.kelvin, 1)));
    opts(row('PICTURE STYLE', 'style'), 'style', (Object.keys(STYLE_NAMES) as Style[]).map((k) => [k, STYLE_NAMES[k]]));
    opts(row('COLOUR SPACE', 'space'), 'space', [['srgb', 'sRGB'], ['adobe', 'ADOBE RGB']]);

    sec('IMAGE');
    opts(row('FILE', 'format'), 'format', [['jpeg', 'JPEG'], ['raw', 'RAW'], ['raw+jpeg', 'RAW + JPEG']]);

    sec('AIDS');
    opts(row('STABILISATION', 'is'), 'is', [['off', 'OFF'], ['on', 'ON'], ['sport', 'SPORT']]);
    opts(row('LENS CORRECTIONS', 'lens'), 'lensCorr', [[true, 'ON'], [false, 'OFF']]);
    this.update();
  }
}
