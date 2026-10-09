// Gamepad controls for a dive. They drive the boat the way the keys do: held
// controls as analog values (-1..1, added to the keys) and one-shot orders by
// the key they stand for, so the dive does not care where an order came from.
// A gamepad works whenever one is connected (standard layout).

export interface Analog {
  thrust: number;
  yaw: number;
  vertical: number;
  lateral: number;
  /** +1 floods the tanks (Z), -1 blows them (X) */
  ballast: number;
}

export const zeroAnalog = (): Analog => ({ thrust: 0, yaw: 0, vertical: 0, lateral: 0, ballast: 0 });

/** what the controls can ask of the dive */
export interface ControlTarget {
  /** a one-shot order, by the key code it stands for */
  command(code: string): void;
  /** turn the camera (pixels of drag) */
  look(dx: number, dy: number): void;
  /** zoom the chase camera by a factor (>1 further away) */
  zoom(k: number): void;
  readonly emergency: boolean;
}

/** what the touch buttons show as switched on */
export interface ControlState {
  quiet: boolean;
  lamps: boolean;
  floods: boolean;
  /** the manipulator is out: the stick and up / down work the arm */
  arm: boolean;
  /** the scanning sonar is turning */
  scan: boolean;
  holdDepth: boolean;
  holdPos: boolean;
  overlay: boolean;
  time: number;
  emergency: boolean;
}

/** seconds the emergency blow must be held, on the touch button or the D-pad */
export const EMERGENCY_HOLD_S = 2;

/** deadzone with the range rescaled, so small deflections still count once past it */
export function deadzone(v: number, dz = 0.15): number {
  const a = Math.abs(v);
  return a < dz ? 0 : (Math.sign(v) * (a - dz)) / (1 - dz);
}

// ---------------------------------------------------------------- gamepad
/** standard-layout buttons to the orders they give (pressed once) */
const PAD_PRESS: Record<number, string> = {
  2: 'KeyQ', // X: Quiet Survey
  8: 'KeyM', // View / Back: chart
  9: 'Escape', // Menu / Start: pause
  10: 'KeyC', // left stick press: camera
  11: 'KeyO', // right stick press: sonar overlay
  14: 'KeyT', // D-pad left: hold depth
  15: 'KeyG', // D-pad right: hold position
};

/** buttons with two orders: a tap, and a hold of PAD_HOLD_S */
const PAD_TAP_HOLD: Record<number, [string, string]> = {
  0: ['KeyE', 'KeyV'], // A: use (in the arm: grip) · hold: the arm out / stowed
  1: ['KeyP', 'KeyN'], // B: ping · hold: scanning sonar on / off
  3: ['KeyL', 'KeyK'], // Y: lamps · hold: floodlights
};
export const PAD_HOLD_S = 0.7;

export class DiveGamepad {
  readonly analog = zeroAnalog();
  connected = false;
  private prev: boolean[] = [];
  /** when D-pad up went down (wall clock, ms: a hold is timed in real seconds, whatever the frame rate) */
  private upSince = -1;
  private blew = false;
  /** when each tap-or-hold button went down (wall clock, ms), and whether its hold has fired */
  private downAt = new Map<number, number>();
  private heldFired = new Set<number>();

  /** read the first connected pad; `drive` false (paused, chart open) leaves only the orders */
  poll(dt: number, t: ControlTarget, drive: boolean): void {
    const a = this.analog;
    let pad: Gamepad | null = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected && (!pad || p.mapping === 'standard')) pad = p;
    } catch {
      pad = null;
    }
    this.connected = !!pad;
    if (!pad) {
      Object.assign(a, zeroAnalog());
      this.prev = [];
      return;
    }
    const pressed = pad.buttons.map((b) => b.pressed);
    // the orders, on the press
    for (const [i, code] of Object.entries(PAD_PRESS)) {
      const k = Number(i);
      if (pressed[k] && !this.prev[k]) t.command(code);
    }
    // tap or hold: the tap's order on release, the hold's once it has been held long enough
    const now = performance.now();
    for (const [i, [tap, hold]] of Object.entries(PAD_TAP_HOLD)) {
      const k = Number(i);
      if (pressed[k] && !this.prev[k]) {
        this.downAt.set(k, now);
        this.heldFired.delete(k);
      } else if (pressed[k] && this.downAt.has(k) && !this.heldFired.has(k) && now - this.downAt.get(k)! >= PAD_HOLD_S * 1000) {
        this.heldFired.add(k);
        t.command(hold);
      } else if (!pressed[k] && this.prev[k] && this.downAt.has(k)) {
        if (!this.heldFired.has(k)) t.command(tap);
        this.downAt.delete(k);
      }
    }
    this.prev = pressed;
    if (!drive) {
      Object.assign(a, zeroAnalog());
      this.upSince = -1;
      return;
    }
    const ax = (i: number) => deadzone(pad!.axes[i] ?? 0);
    const val = (i: number) => pad!.buttons[i]?.value ?? 0;
    // left stick: ahead / astern and turn; triggers: up and down; bumpers: side thrusters
    a.thrust = -ax(1);
    a.yaw = ax(0);
    a.vertical = val(7) - val(6);
    a.lateral = (pressed[5] ? 1 : 0) - (pressed[4] ? 1 : 0);
    // D-pad up blows the tanks, down floods them; up held 2 s is the emergency blow
    a.ballast = (pressed[13] ? 1 : 0) - (pressed[12] ? 1 : 0);
    if (pressed[12]) {
      const now = performance.now();
      if (this.upSince < 0) this.upSince = now;
      if (now - this.upSince >= EMERGENCY_HOLD_S * 1000 && !this.blew) {
        this.blew = true;
        if (!t.emergency) t.command('KeyB');
      }
    } else {
      this.upSince = -1;
      this.blew = false;
    }
    // right stick: the camera
    const lx = ax(2), ly = ax(3);
    if (lx || ly) t.look(lx * 700 * dt, ly * 480 * dt);
  }
}
