import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seabedHeight, buildColliders, colliderDistance, bearing, angleDiff, HARBOR, SITES, regionAt, coastZ } from '../../src/ocean/world/geo';

test('the harbor basin is dredged water and the land lies north of the quay', () => {
  const b = HARBOR.berth;
  assert.ok(Math.abs(seabedHeight(b.x, b.z) + HARBOR.depth) < 1.5, `berth depth ${seabedHeight(b.x, b.z)}`);
  assert.ok(seabedHeight(0, HARBOR.basin.minZ - 40) > 0, 'land behind the quay');
  assert.ok(seabedHeight(HARBOR.gate.x, HARBOR.gate.z) < -6, 'the gate is open water');
  assert.ok(coastZ(0) < HARBOR.basin.minZ, 'the shore is north of the basin');
});

test('the seabed deepens offshore: shelf, slope, basin', () => {
  const shelf = seabedHeight(-500, 500), slope = seabedHeight(200, 1500), basin = seabedHeight(0, 3000);
  assert.ok(shelf < -10 && shelf > -60, `shelf ${shelf}`);
  assert.ok(slope < shelf, `slope ${slope}`);
  assert.ok(basin < -250, `basin ${basin}`);
});

test('the wreck rests near 85 m and is solid', () => {
  const g = seabedHeight(SITES.wreck.x, SITES.wreck.z);
  assert.ok(g < -70 && g > -100, `wreck seabed ${g}`);
  const hull = buildColliders().find((c) => c.tag === 'wreck-hull')!;
  assert.ok(hull);
  const inside = colliderDistance(hull, (hull as { x: number }).x, (hull as { y: number }).y, (hull as { z: number }).z);
  assert.ok(inside.d < 0, 'the hull centre is inside the hull');
});

test('bearings are clockwise from north', () => {
  assert.equal(Math.round(bearing(0, 0, 0, -10)), 0);
  assert.equal(Math.round(bearing(0, 0, 10, 0)), 90);
  assert.equal(Math.round(bearing(0, 0, 0, 10)), 180);
  assert.equal(Math.round(bearing(0, 0, -10, 0)), 270);
  assert.equal(angleDiff(10, 350), 20);
  assert.equal(angleDiff(350, 10), -20);
});

test('regions are found where they are drawn', () => {
  assert.equal(regionAt(0, -100).id, 'harbor');
  assert.equal(regionAt(SITES.wreck.x, SITES.wreck.z).id, 'wreck');
  assert.equal(regionAt(SITES.reef.x, SITES.reef.z).id, 'reef');
  assert.equal(regionAt(0, 2800).id, 'basin');
});

test('box colliders report distance and an outward normal', () => {
  const c = { kind: 'box' as const, x: 0, y: 0, z: 0, hx: 2, hy: 1, hz: 4, yaw: 90, tag: 't' };
  // yawed 90°: the long side runs east-west
  const east = colliderDistance(c, 6, 0, 0);
  assert.ok(Math.abs(east.d - 2) < 1e-6, `east ${east.d}`);
  assert.ok(east.nx > 0.99);
  const south = colliderDistance(c, 0, 0, 5);
  assert.ok(Math.abs(south.d - 3) < 1e-6, `south ${south.d}`);
});
