// Keyboard / mouse / gamepad input with rebindable actions.

export type Action =
  | 'pitchDown'
  | 'pitchUp'
  | 'rollLeft'
  | 'rollRight'
  | 'yawLeft'
  | 'yawRight'
  | 'throttleUp'
  | 'throttleDown'
  | 'afterburner'
  | 'fire'
  | 'weaponGun'
  | 'weapon9x'
  | 'weapon120'
  | 'cycleWeapon'
  | 'lock'
  | 'unlock'
  | 'radarMode'
  | 'irst'
  | 'flare'
  | 'chaff'
  | 'gear'
  | 'speedbrake'
  | 'wheelBrake'
  | 'gOverride'
  | 'map'
  | 'pause'
  | 'camera'
  | 'camCockpit'
  | 'camChase'
  | 'camFlyby'
  | 'camTarget'
  | 'camWeapon'
  | 'eject'
  | 'rearm'
  | 'dropTanks'
  | 'labels'
  | 'help'
  | 'hud'
  | 'zoomIn'
  | 'zoomOut'
  | 'lookReset'
  | 'autopilot'
  | 'scopeRange'
  | 'mfdLeft'
  | 'mfdCenter'
  | 'mfdRight'
  | 'cockpitCursor'
  | 'stptNext'
  | 'navRtb';

export const ACTION_LABELS: Record<Action, string> = {
  pitchDown: 'Pitch down (nose down)',
  pitchUp: 'Pitch up (pull)',
  rollLeft: 'Roll left',
  rollRight: 'Roll right',
  yawLeft: 'Rudder left',
  yawRight: 'Rudder right',
  throttleUp: 'Throttle up (hold at 100% for afterburner)',
  throttleDown: 'Throttle down',
  afterburner: 'Afterburner on / off',
  fire: 'Fire weapon',
  weaponGun: 'Select gun',
  weapon9x: 'Select AIM-9X',
  weapon120: 'Select AIM-120D',
  cycleWeapon: 'Cycle weapon',
  lock: 'Radar lock / next target',
  unlock: 'Break lock',
  radarMode: 'Radar mode (TWS/RWS/ACM/OFF)',
  irst: 'IRST lock (Typhoon PIRATE)',
  flare: 'Flares',
  chaff: 'Chaff',
  gear: 'Landing gear',
  speedbrake: 'Speedbrake',
  wheelBrake: 'Wheel brakes (hold)',
  gOverride: 'G-limiter override (paddle)',
  map: 'Theater map',
  pause: 'Pause / menu',
  camera: 'Toggle cockpit / chase camera',
  camCockpit: 'Cockpit view',
  camChase: 'Chase view',
  camFlyby: 'Fly-by view',
  camTarget: 'Target / padlock view',
  camWeapon: 'Weapon (missile) camera',
  eject: 'Eject (hold)',
  rearm: 'Rearm & refuel (parked on friendly base)',
  dropTanks: 'Jettison fuel tanks',
  labels: 'Toggle aircraft labels',
  help: 'Toggle controls panel',
  hud: 'Toggle HUD / panels',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  lookReset: 'Reset view',
  autopilot: 'Autopilot: level off',
  scopeRange: 'Radar scope range',
  mfdLeft: 'Left display: next page',
  mfdCenter: 'Centre display: next page',
  mfdRight: 'Right display: next page',
  cockpitCursor: 'Cockpit cursor (click displays & buttons)',
  stptNext: 'Next steerpoint',
  navRtb: 'Steer to nearest friendly field',
};

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  pitchDown: ['KeyW', 'ArrowUp'],
  pitchUp: ['KeyS', 'ArrowDown'],
  rollLeft: ['KeyA', 'ArrowLeft'],
  rollRight: ['KeyD', 'ArrowRight'],
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  throttleUp: ['ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd'],
  throttleDown: ['KeyZ', 'Minus', 'NumpadSubtract'],
  afterburner: ['Tab'],
  fire: ['Space'],
  weaponGun: ['Digit1'],
  weapon9x: ['Digit2'],
  weapon120: ['Digit3'],
  cycleWeapon: ['Backquote'],
  lock: ['KeyR'],
  unlock: ['KeyT'],
  radarMode: ['KeyY'],
  irst: ['KeyI'],
  flare: ['KeyC'],
  chaff: ['KeyV'],
  gear: ['KeyG'],
  speedbrake: ['KeyB'],
  wheelBrake: ['KeyN'],
  gOverride: ['KeyL'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
  camera: ['KeyF'],
  camCockpit: ['F1'],
  camChase: ['F2'],
  camFlyby: ['F3'],
  camTarget: ['F4'],
  camWeapon: ['F6'],
  eject: ['KeyJ'],
  rearm: ['KeyH'],
  dropTanks: ['KeyK'],
  labels: ['KeyO'],
  help: ['F9'],
  hud: ['F10'],
  zoomIn: ['BracketRight'],
  zoomOut: ['BracketLeft'],
  lookReset: ['Home', 'KeyX'],
  autopilot: ['KeyU'],
  scopeRange: ['Semicolon'],
  mfdLeft: ['Comma'],
  mfdCenter: ['Slash'],
  mfdRight: ['Period'],
  cockpitCursor: ['Backslash', 'Insert'],
  stptNext: ['Quote'],
  navRtb: ['End'],
};

export type MouseMode = 'keyboard' | 'joystick' | 'mouseaim';

export interface InputSettings {
  bindings: Record<Action, string[]>;
  mouseMode: MouseMode;
  invertPitch: boolean;
  sensitivity: number;
  keyboardRate: number;
  joystickReturn: number;
}

export function defaultInputSettings(): InputSettings {
  return {
    bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
    mouseMode: 'mouseaim',
    invertPitch: false,
    sensitivity: 1,
    keyboardRate: 4,
    joystickReturn: 0.8,
  };
}

export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();
  private codeToActions = new Map<string, Action[]>();
  mouseDX = 0;
  mouseDY = 0;
  /** cursor position in client pixels */
  mouseX = 0;
  mouseY = 0;
  wheel = 0;
  mouseButtons = 0;
  private mousePressed = new Set<number>();
  pointerLocked = false;
  /** smoothed keyboard axes */
  kbPitch = 0;
  kbRoll = 0;
  kbYaw = 0;
  /** virtual joystick for mouse mode */
  joyX = 0;
  joyY = 0;
  enabled = true;
  onKey: ((code: string) => void) | null = null;
  gamepadIndex: number | null = null;
  private gpPrev: boolean[] = [];
  gp = { pitch: 0, roll: 0, yaw: 0, throttle: -1, lookX: 0, lookY: 0, active: false };
  /** on-screen touch controls */
  touch = { active: false, pitch: 0, roll: 0, yaw: 0, throttle: null as number | null, lookX: 0, lookY: 0 };
  private virtualDown = new Set<Action>();
  private virtualPressed = new Set<Action>();

  constructor(
    private target: HTMLElement,
    public settings: InputSettings,
  ) {
    this.rebuildMap();
    window.addEventListener('keydown', (e) => this.onKeyDown(e), { capture: true });
    window.addEventListener('keyup', (e) => this.onKeyUp(e), { capture: true });
    window.addEventListener('blur', () => this.down.clear());
    target.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (!this.enabled) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    target.addEventListener('mousedown', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (!this.enabled) return;
      this.mouseButtons |= 1 << e.button;
      this.mousePressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseButtons &= ~(1 << e.button);
    });
    target.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === target;
    });
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = (e as GamepadEvent).gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = null;
      this.gp.active = false;
    });
  }

  rebuildMap(): void {
    this.codeToActions.clear();
    for (const [a, codes] of Object.entries(this.settings.bindings) as [Action, string[]][]) {
      for (const c of codes) {
        const list = this.codeToActions.get(c) ?? [];
        list.push(a);
        this.codeToActions.set(c, list);
      }
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.onKey) {
      e.preventDefault();
      this.onKey(e.code);
      return;
    }
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.tagName === 'TEXTAREA')) return;
    if (!this.enabled) return;
    const mapped = this.codeToActions.has(e.code);
    // keep the browser from stealing our keys (F-keys, Tab, Space scrolling...)
    if (mapped || e.code.startsWith('F') || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!this.down.has(e.code)) this.pressedThisFrame.add(e.code);
    this.down.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.down.delete(e.code);
    this.releasedThisFrame.add(e.code);
  }

  /** Is an action currently held? */
  held(a: Action): boolean {
    if (this.virtualDown.has(a)) return true;
    const codes = this.settings.bindings[a];
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** On-screen button pressed / released (touch controls). */
  virtual(a: Action, down: boolean): void {
    if (down) {
      if (!this.virtualDown.has(a)) this.virtualPressed.add(a);
      this.virtualDown.add(a);
    } else this.virtualDown.delete(a);
  }

  /** Was an action pressed since the last endFrame()? */
  pressed(a: Action): boolean {
    if (this.virtualPressed.has(a)) return true;
    const codes = this.settings.bindings[a];
    for (const c of codes) if (this.pressedThisFrame.has(c)) return true;
    return false;
  }

  released(a: Action): boolean {
    const codes = this.settings.bindings[a];
    for (const c of codes) if (this.releasedThisFrame.has(c)) return true;
    return false;
  }

  mouseClicked(button: number): boolean {
    return this.mousePressed.has(button);
  }

  /** Swallow a click so nothing else acts on it this frame. */
  consumeClick(button: number): void {
    this.mousePressed.delete(button);
    this.mouseButtons &= ~(1 << button);
  }

  mouseHeld(button: number): boolean {
    return (this.mouseButtons & (1 << button)) !== 0;
  }

  /** Update smoothed axes (call once per frame before reading). */
  update(dt: number): void {
    const rate = this.settings.keyboardRate;
    const axis = (neg: Action, pos: Action, cur: number): number => {
      const t = (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0);
      if (t === 0) return cur - Math.sign(cur) * Math.min(Math.abs(cur), rate * 1.8 * dt);
      return Math.max(-1, Math.min(1, cur + t * rate * dt * (Math.sign(t) !== Math.sign(cur) && cur !== 0 ? 2 : 1)));
    };
    this.kbPitch = axis('pitchDown', 'pitchUp', this.kbPitch);
    this.kbRoll = axis('rollLeft', 'rollRight', this.kbRoll);
    this.kbYaw = axis('yawLeft', 'yawRight', this.kbYaw);
    this.pollGamepad();
  }

  private pollGamepad(): void {
    if (this.gamepadIndex === null || !navigator.getGamepads) return;
    const pad = navigator.getGamepads()[this.gamepadIndex];
    if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
    this.gp.roll = dz(pad.axes[0] ?? 0);
    this.gp.pitch = dz(pad.axes[1] ?? 0);
    this.gp.lookX = dz(pad.axes[2] ?? 0);
    this.gp.lookY = dz(pad.axes[3] ?? 0);
    const lt = pad.buttons[6]?.value ?? 0;
    const rt = pad.buttons[7]?.value ?? 0;
    this.gp.throttle = rt - lt;
    this.gp.yaw = (pad.buttons[5]?.pressed ? 1 : 0) - (pad.buttons[4]?.pressed ? 1 : 0);
    const any = Math.abs(this.gp.roll) + Math.abs(this.gp.pitch) + lt + rt > 0.05;
    if (any) this.gp.active = true;
    // buttons -> synthetic key presses
    const map: [number, string][] = [
      [0, 'GP_A'],
      [1, 'GP_B'],
      [2, 'GP_X'],
      [3, 'GP_Y'],
      [8, 'GP_BACK'],
      [9, 'GP_START'],
      [12, 'GP_UP'],
      [13, 'GP_DOWN'],
      [14, 'GP_LEFT'],
      [15, 'GP_RIGHT'],
      [10, 'GP_LS'],
      [11, 'GP_RS'],
    ];
    for (const [i, code] of map) {
      const p = !!pad.buttons[i]?.pressed;
      if (p && !this.gpPrev[i]) {
        this.pressedThisFrame.add(code);
        this.down.add(code);
      } else if (!p && this.gpPrev[i]) {
        this.down.delete(code);
        this.releasedThisFrame.add(code);
      }
      this.gpPrev[i] = p;
    }
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
    this.virtualPressed.clear();
    this.touch.lookX = 0;
    this.touch.lookY = 0;
    this.releasedThisFrame.clear();
    this.mousePressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  requestPointerLock(): void {
    if (!this.pointerLocked) {
      const r = this.target.requestPointerLock?.() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  clearAll(): void {
    this.down.clear();
    this.pressedThisFrame.clear();
    this.kbPitch = this.kbRoll = this.kbYaw = 0;
    this.joyX = this.joyY = 0;
  }
}

/** Gamepad button codes appended to the default bindings. */
export const GAMEPAD_BINDINGS: Partial<Record<Action, string[]>> = {
  fire: ['GP_A'],
  flare: ['GP_B'],
  lock: ['GP_X'],
  cycleWeapon: ['GP_Y'],
  camera: ['GP_RS'],
  pause: ['GP_START'],
  map: ['GP_BACK'],
  chaff: ['GP_DOWN'],
  radarMode: ['GP_UP'],
  gear: ['GP_LEFT'],
  speedbrake: ['GP_RIGHT'],
  lookReset: ['GP_LS'],
};

export function withGamepad(b: Record<Action, string[]>): Record<Action, string[]> {
  const out = JSON.parse(JSON.stringify(b)) as Record<Action, string[]>;
  for (const [a, codes] of Object.entries(GAMEPAD_BINDINGS) as [Action, string[]][]) {
    for (const c of codes) if (!out[a].includes(c)) out[a].push(c);
  }
  return out;
}
