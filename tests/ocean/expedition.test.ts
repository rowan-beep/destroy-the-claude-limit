import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Expedition, STAGES, secondListeningPoint, toolReady, parseCheckpoint, parseCareer, MISSION_ID, type MissionCtx } from '../../src/ocean/mission/expedition';
import { EchoAtlas, type Store } from '../../src/ocean/atlas/atlas';
import { CONTACTS, crossingAngle } from '../../src/ocean/acoustics/acoustics';
import { HARBOR, SITES, bearing } from '../../src/ocean/world/geo';

const mem = (): Store => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};

test('the expedition runs from the berth to the dock, one task at a time', () => {
  const atlas = new EchoAtlas(mem());
  const e = new Expedition();
  const k = CONTACTS[0];
  const ctx: MissionCtx = { x: HARBOR.berth.x, z: HARBOR.berth.z, depth: 0, speed: 0, heading: 180, knock: undefined, bearings: 0, sincePing: Infinity, pingAt: null, plateScanned: false, recorderTaken: false, docked: false };
  const step = (patch: Partial<MissionCtx>) => {
    Object.assign(ctx, patch);
    ctx.knock = atlas.contact(k.id);
    return e.update(ctx);
  };
  assert.equal(e.id, 'depart');
  assert.equal(step({}), false, 'nothing done yet');
  assert.ok(step({ x: 0, z: HARBOR.gate.z + 30 }));
  assert.ok(step({ x: SITES.buoy.x, z: SITES.buoy.z, depth: 20 }));
  assert.equal(e.view(ctx).guide.kind, 'none', 'no marker for the mystery');
  // first bearing
  atlas.hear(k.id, k.unknownLabel, k.pattern, 'unknown');
  const b1 = bearing(ctx.x, ctx.z, SITES.recorder.x, SITES.recorder.z);
  atlas.observe({ contactId: k.id, x: ctx.x, z: ctx.z, depth: 20, bearing: b1, halfWidth: 6, snr: 12 });
  assert.ok(step({ bearings: 1 }));
  assert.ok(e.second, 'a second listening point is suggested');
  // the suggested point really gives a good crossing
  const p = e.second!;
  const b2 = bearing(p.x, p.z, SITES.recorder.x, SITES.recorder.z);
  assert.ok(crossingAngle(b1, b2) > 20, `crossing ${crossingAngle(b1, b2)}`);
  atlas.observe({ contactId: k.id, x: p.x, z: p.z, depth: 20, bearing: b2, halfWidth: 6, snr: 12 });
  assert.ok(step({ x: p.x, z: p.z, bearings: 2 }));
  assert.equal(e.view(ctx).guide.kind, 'area', 'a search area, not a point');
  const fix = atlas.contact(k.id)!.estimate!;
  assert.ok(step({ sincePing: 0.2, pingAt: { x: fix.x + 100, z: fix.z } }));
  assert.ok(step({ x: SITES.wreck.x + 20, z: SITES.wreck.z, depth: 80 }));
  assert.ok(step({ plateScanned: true }));
  assert.ok(step({ recorderTaken: true }));
  assert.ok(step({ x: 0, z: 0, depth: 0 }));
  assert.ok(step({ docked: true }));
  assert.ok(e.done);
  assert.equal(STAGES.length, 10);
});

test('the second listening point stays in open shelf water for bearings from round the buoy', () => {
  for (const [x, z] of [[150, 430], [60, 380], [260, 520]]) {
    const b = bearing(x, z, SITES.recorder.x, SITES.recorder.z);
    const p = secondListeningPoint(x, z, b);
    assert.ok(p.z > 260 && p.z < 950, `z ${p.z}`);
    assert.ok(crossingAngle(b, bearing(p.x, p.z, SITES.recorder.x, SITES.recorder.z)) > 15);
  }
});

test('tools need the vehicle close, slow and facing the object', () => {
  assert.equal(toolReady(0, 0, 0, 0, 0, -20, 10).ok, false);
  assert.match(toolReady(0, 0, 0, 2, 0, -5, 10).why, /SLOW/);
  assert.match(toolReady(0, 0, 180, 0, 0, -5, 10).why, /FACE/);
  assert.ok(toolReady(0, 0, 0, 0.2, 0, -5, 10).ok);
});

test('saved progress is read back, and junk is ignored', () => {
  const cp = { mission: MISSION_ID, stage: 4, sub: { x: 1, y: -20, z: 2, heading: 90, ballast: 0.9, battery: 0.8 }, elapsed: 300, distance: 1200, maxDepth: 30, battery0: 1, plateScanned: false, recorderTaken: false, second: null, track: [], t: 1 };
  assert.equal(parseCheckpoint(JSON.stringify(cp))!.stage, 4);
  assert.equal(parseCheckpoint('{"mission":"other"}'), null);
  assert.equal(parseCheckpoint('nope'), null);
  assert.deepEqual(parseCareer(null), { completed: [], unlocked: [] });
});
