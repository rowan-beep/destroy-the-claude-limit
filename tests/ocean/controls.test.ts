import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiveGamepad, deadzone, EMERGENCY_HOLD_S, PAD_HOLD_S, type ControlTarget } from '../../src/ocean/dive/controls';

/** a standard-layout pad the test can move, and a clock it controls */
function rig() {
  const pad = { id: 'test', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), timestamp: 0 };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  let now = 1000;
  const realNow = performance.now.bind(performance);
  Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
  const orders: string[] = [];
  const looks: [number, number][] = [];
  let emergency = false;
  const t: ControlTarget = {
    command: (c) => {
      orders.push(c);
      if (c === 'KeyB') emergency = !emergency;
    },
    look: (dx, dy) => void looks.push([dx, dy]),
    zoom: () => {},
    get emergency() {
      return emergency;
    },
  };
  const press = (i: number, v: boolean) => {
    pad.buttons[i].pressed = v;
    pad.buttons[i].value = v ? 1 : 0;
  };
  const restore = () => Object.defineProperty(performance, 'now', { value: realNow, configurable: true });
  return { pad, t, orders, looks, press, advance: (ms: number) => (now += ms), restore, get emergency() {
    return emergency;
  } };
}

test('deadzone: nothing near the centre, the full range beyond it', () => {
  assert.equal(deadzone(0.1), 0);
  assert.equal(deadzone(-0.14), 0);
  assert.equal(deadzone(1), 1);
  assert.equal(deadzone(-1), -1);
  assert.ok(Math.abs(deadzone(0.575) - 0.5) < 1e-9);
});

test('the gamepad drives the boat: sticks, triggers, bumpers and D-pad', () => {
  const r = rig();
  const g = new DiveGamepad();
  r.pad.axes[1] = -1; // left stick forward
  r.pad.axes[0] = 0.5;
  r.pad.buttons[7].value = 0.8; // right trigger: up
  r.press(4, true); // left bumper: side thrust left
  r.press(13, true); // D-pad down: flood
  g.poll(1 / 60, r.t, true);
  assert.equal(g.connected, true);
  assert.equal(g.analog.thrust, 1);
  assert.ok(g.analog.yaw > 0.4 && g.analog.yaw < 0.45);
  assert.ok(Math.abs(g.analog.vertical - 0.8) < 1e-9);
  assert.equal(g.analog.lateral, -1);
  assert.equal(g.analog.ballast, 1);
  // paused (drive off): nothing held, the boat is not driven
  g.poll(1 / 60, r.t, false);
  assert.deepEqual(g.analog, { thrust: 0, yaw: 0, vertical: 0, lateral: 0, ballast: 0 });
  r.restore();
});

test('a button gives its order once per press, even while paused', () => {
  const r = rig();
  const g = new DiveGamepad();
  r.press(2, true); // X: Quiet Survey
  for (let i = 0; i < 5; i++) g.poll(1 / 60, r.t, true);
  r.press(2, false);
  g.poll(1 / 60, r.t, true);
  r.press(9, true); // Start: pause
  g.poll(1 / 60, r.t, false);
  assert.deepEqual(r.orders, ['KeyQ', 'Escape']);
  r.restore();
});

test('the emergency blow needs D-pad up held for two real seconds', () => {
  const r = rig();
  const g = new DiveGamepad();
  r.press(12, true);
  g.poll(1 / 60, r.t, true);
  assert.equal(g.analog.ballast, -1, 'a press blows the tanks');
  r.advance(EMERGENCY_HOLD_S * 1000 - 200);
  g.poll(1 / 60, r.t, true);
  assert.equal(r.emergency, false, 'not yet');
  r.press(12, false);
  g.poll(1 / 60, r.t, true);
  r.press(12, true);
  g.poll(1 / 60, r.t, true);
  r.advance(EMERGENCY_HOLD_S * 1000 + 50);
  g.poll(1 / 60, r.t, true);
  assert.equal(r.emergency, true, 'held two seconds: emergency blow');
  r.advance(3000);
  g.poll(1 / 60, r.t, true);
  assert.equal(r.orders.filter((o) => o === 'KeyB').length, 1, 'once per hold');
  r.restore();
});

test('the right stick turns the camera', () => {
  const r = rig();
  const g = new DiveGamepad();
  r.pad.axes[2] = 1;
  g.poll(0.1, r.t, true);
  assert.equal(r.looks.length, 1);
  assert.ok(r.looks[0][0] > 0 && r.looks[0][1] === 0);
  r.restore();
});

test('A, B and Y: a tap gives one order on release, a hold the other, once', () => {
  const r = rig();
  const g = new DiveGamepad();
  // Y tapped: lamps
  r.press(3, true);
  g.poll(1 / 60, r.t, true);
  assert.deepEqual(r.orders, [], 'nothing until it is let go');
  r.advance(150);
  r.press(3, false);
  g.poll(1 / 60, r.t, true);
  assert.deepEqual(r.orders, ['KeyL']);
  // Y held: floodlights, and nothing more on release
  r.press(3, true);
  g.poll(1 / 60, r.t, true);
  r.advance(PAD_HOLD_S * 1000 + 20);
  g.poll(1 / 60, r.t, true);
  r.advance(1000);
  g.poll(1 / 60, r.t, true);
  r.press(3, false);
  g.poll(1 / 60, r.t, true);
  assert.deepEqual(r.orders, ['KeyL', 'KeyK']);
  // A: use on a tap, the arm on a hold; B: ping on a tap, the scanning sonar on a hold
  for (const [b, ms] of [[0, 100], [0, 900], [1, 100], [1, 900]] as const) {
    r.press(b, true);
    g.poll(1 / 60, r.t, true);
    r.advance(ms);
    g.poll(1 / 60, r.t, true);
    r.press(b, false);
    g.poll(1 / 60, r.t, true);
  }
  assert.deepEqual(r.orders.slice(2), ['KeyE', 'KeyV', 'KeyP', 'KeyN']);
  r.restore();
});
