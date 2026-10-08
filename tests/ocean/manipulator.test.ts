import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARM_REACH, ARM_MIN, ARM_READY, ARM_SPEED, armCanReach, clampArmTarget, moveArmTarget } from '../../src/ocean/dive/manipulator';

// (the shoulder as the boat model places it)
const SHOULDER = new THREE.Vector3(0.78, -0.82, -2.05);

test('the arm comes out to a point it can reach', () => {
  const p = clampArmTarget(ARM_READY.clone(), SHOULDER);
  assert.ok(p.distanceTo(ARM_READY) < 1e-9, 'the ready point is already within the limits');
  const d = p.distanceTo(SHOULDER);
  assert.ok(d > ARM_MIN && d < ARM_REACH);
});

test('the jaw moves with the controls at the arm speed', () => {
  const p = ARM_READY.clone();
  moveArmTarget(p, SHOULDER, { reach: 0, side: 1, up: 0 }, 0.5);
  assert.ok(Math.abs(p.x - (ARM_READY.x + ARM_SPEED * 0.5)) < 1e-9, 'to starboard');
  moveArmTarget(p, SHOULDER, { reach: 0, side: 0, up: -1 }, 0.4);
  assert.ok(Math.abs(p.y - (ARM_READY.y - ARM_SPEED * 0.4)) < 1e-9, 'down');
});

test('the jaw stays within reach, ahead of the shoulder and out of the hull', () => {
  const p = ARM_READY.clone();
  // a long push ahead and down: it stops at full stretch
  for (let i = 0; i < 300; i++) moveArmTarget(p, SHOULDER, { reach: 1, side: 0, up: -1 }, 1 / 60);
  assert.ok(p.distanceTo(SHOULDER) <= ARM_REACH + 1e-9);
  // pulled all the way back and up: it does not go behind the shoulder or into the hull and skids
  for (let i = 0; i < 600; i++) {
    moveArmTarget(p, SHOULDER, { reach: -1, side: -1, up: 1 }, 1 / 60);
    assert.ok(p.z <= SHOULDER.z - 0.3 + 1e-9, 'ahead of the shoulder');
    assert.ok(!(p.z > -3.35 && p.y > -1.5 + 1e-9), `not in the hull (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
    const d = p.distanceTo(SHOULDER);
    assert.ok(d <= ARM_REACH + 1e-9 && d >= ARM_MIN - 1e-9, `within reach (${d.toFixed(3)})`);
  }
});

test('a jaw pushed out of reach (by the bottom) is brought back', () => {
  for (const q of [new THREE.Vector3(0.5, -1.2, -2.6), new THREE.Vector3(3, -3, -5), new THREE.Vector3(0.78, -0.5, -1.5)]) {
    clampArmTarget(q, SHOULDER);
    assert.ok(armCanReach(q, SHOULDER), `${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}`);
  }
});
