import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSubState, stepSub, SURVEY_SUB, NO_INPUT, FixedStepper, NEUTRAL_BALLAST, speedOf, type SubInput } from '../../src/ocean/sub/subPhysics';
import { buildColliders, seabedHeight } from '../../src/ocean/world/geo';

const env = { waveAmp: 0.5, colliders: buildColliders(), relaxed: false };
const run = (s: ReturnType<typeof newSubState>, input: SubInput, seconds: number) => {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) stepSub(s, SURVEY_SUB, input, env, dt);
};

test('surfaced with empty tanks, the hull floats at the waterline', () => {
  const s = newSubState(-500, 500, 180);
  run(s, NO_INPUT, 20);
  assert.ok(Math.abs(s.y) < 1.6, `floating y ${s.y}`);
});

test('flooding the tanks dives; blowing them surfaces', () => {
  const s = newSubState(-500, 500, 180);
  run(s, { ...NO_INPUT, ballast: 1 }, 25);
  assert.ok(s.y < -4, `dived to ${s.y}`);
  run(s, { ...NO_INPUT, emergencyBlow: true }, 30);
  assert.ok(s.y > -1.5, `surfaced to ${s.y}`);
});

test('full thrust tops out near 5 knots and coasting stops the boat', () => {
  const s = newSubState(-500, 500, 180);
  s.ballast = NEUTRAL_BALLAST;
  s.y = -15;
  run(s, { ...NO_INPUT, thrust: 1 }, 40);
  const v = Math.hypot(s.vx, s.vz);
  assert.ok(v > 2.3 && v < 2.9, `top speed ${v}`);
  // coasting settles under the listening speed in well under half a minute
  run(s, NO_INPUT, 22);
  assert.ok(Math.hypot(s.vx, s.vz) < 1.2, `coasted to ${Math.hypot(s.vx, s.vz)}`);
  // and reverse thrust stops the boat quickly
  run(s, { ...NO_INPUT, thrust: 1 }, 30);
  let t = 0;
  while (s.vx * Math.sin(Math.PI) - s.vz * Math.cos(Math.PI) > 0.1 && t < 30) {
    stepSub(s, SURVEY_SUB, { ...NO_INPUT, thrust: -1 }, env, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(t < 12, `stopped in ${t.toFixed(1)} s`);
});

test('hold depth keeps the depth within half a metre', () => {
  const s = newSubState(-500, 500, 180);
  s.y = -20;
  s.ballast = 1; // heavy: the assist must work for it
  s.holdDepth = 20;
  run(s, { ...NO_INPUT, thrust: 0.5 }, 40);
  assert.ok(Math.abs(-s.y - 20) < 0.5, `held at ${-s.y}`);
});

test('hold position stays put in the slope current', () => {
  const s = newSubState(0, 1300, 90);
  s.y = -60;
  s.ballast = NEUTRAL_BALLAST;
  s.holdDepth = 60;
  s.holdPos = { x: 0, z: 1300, heading: 90 };
  run(s, NO_INPUT, 60);
  assert.ok(Math.hypot(s.x - 0, s.z - 1300) < 2, `drifted ${Math.hypot(s.x, s.z - 1300)}`);
});

test('the hull never passes through the seabed or the wreck', () => {
  const s = newSubState(-500, 500, 180);
  s.ballast = 1;
  run(s, { ...NO_INPUT, ballast: 1, vertical: -1, thrust: 1 }, 90);
  const g = seabedHeight(s.x, s.z);
  assert.ok(s.y - g > SURVEY_SUB.radius * 0.7, `clearance ${s.y - g}`);
});

test('the fixed stepper runs whole steps and drops a backlog after a stall', () => {
  const st = new FixedStepper(6);
  const s = newSubState(0, 0, 0);
  let n = 0;
  st.advance(0.05, s, () => n++);
  assert.equal(n, 3);
  n = 0;
  st.advance(2, s, () => n++);
  assert.equal(n, 6, 'catch-up is capped');
  assert.equal(st.clipped, 1);
});

test('battery drains with use and not in relaxed mode', () => {
  const a = newSubState(-500, 500, 180), b = newSubState(-500, 500, 180);
  for (let i = 0; i < 600; i++) {
    stepSub(a, SURVEY_SUB, { ...NO_INPUT, thrust: 1 }, env, 1 / 60);
    stepSub(b, SURVEY_SUB, { ...NO_INPUT, thrust: 1 }, { ...env, relaxed: true }, 1 / 60);
  }
  assert.ok(a.battery < 1 && a.battery > 0.98, `battery ${a.battery}`);
  assert.equal(b.battery, 1);
  assert.ok(speedOf(a) > 1);
});

test('the battery lasts well over an hour at full thrust and hours when idle', () => {
  const s = newSubState(-500, 500, 180);
  s.ballast = NEUTRAL_BALLAST;
  s.y = -15;
  let t = 0;
  while (s.battery > 0 && t < 30000) {
    stepSub(s, SURVEY_SUB, { ...NO_INPUT, thrust: 1 }, env, 0.1);
    t += 0.1;
  }
  assert.ok(t > 60 * 70 && t < 60 * 110, `full thrust ${Math.round(t / 60)} min`);
  const idle = newSubState(-500, 500, 180);
  idle.lights = false;
  idle.ballast = NEUTRAL_BALLAST;
  idle.y = -15;
  for (let i = 0; i < 3 * 3600 * 10; i++) stepSub(idle, SURVEY_SUB, NO_INPUT, env, 0.1);
  assert.ok(idle.battery > 0.3, `after three idle hours ${idle.battery}`);
});
