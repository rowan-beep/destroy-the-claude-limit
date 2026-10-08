import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PulseMission, PULSE_STAGES, PULSE_ID, secondPulsePoint, multibeamSees, FLOAT_FOUND_M, type PulseCtx } from '../../src/ocean/mission/followup';
import { parseCheckpoint, MISSION_ID } from '../../src/ocean/mission/expedition';
import { EchoAtlas, type Store } from '../../src/ocean/atlas/atlas';
import { CONTACTS, crossingAngle, listen, ambientNoise, selfNoise, addDb, HEAR_SNR, sonarRays } from '../../src/ocean/acoustics/acoustics';
import { HARBOR, K3, WORLD, DEPTH_BANDS, seabedHeight, bearing, buildColliders, colliderDistance } from '../../src/ocean/world/geo';

const mem = (): Store => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};

test('K3: the top float is inside the boat\'s rating, the foot is not, and the pulse comes from the float', () => {
  assert.ok(-K3.floatY < DEPTH_BANDS.comfortable, `float at ${-K3.floatY} m`);
  assert.ok(-K3.ground > DEPTH_BANDS.caution, `anchor at ${-K3.ground} m`);
  assert.ok(Math.abs(K3.ground - seabedHeight(K3.x, K3.z)) < 1e-9);
  const dp = CONTACTS.find((c) => c.id === 'deep-pulse')!;
  assert.equal(dp.y, K3.pingerY);
  assert.equal(dp.freqKhz, 12);
  // a deep mooring stands up from its anchor: the line runs the whole way
  const line = buildColliders().find((c) => c.tag === 'k3-line')!;
  assert.ok(line.kind === 'cyl' && line.y0 <= K3.ground + 0.01 && line.y1 >= K3.floatY - 1);
  // the hydrophone recorder is on the line, below the float
  assert.ok(K3.hydrophone.y < K3.floatY - K3.floatR && Math.hypot(K3.hydrophone.x - K3.x, K3.hydrophone.z - K3.z) < 0.3);
  // the container rests on the bottom, across the foot of the line
  const box = buildColliders().find((c) => c.tag === 'container')!;
  assert.ok(colliderDistance(box, K3.x, K3.ground + 1, K3.z).d < 3, 'the container lies at the anchor');
});

test('the slow pulse is heard from just outside the harbor by a quiet boat', () => {
  const quiet = selfNoise({ thrust: 0, lateral: 0, vertical: 0, pumping: false }, 0);
  const at = { x: 0, y: -12, z: HARBOR.gate.z + 120 };
  const heard = listen(at.x, at.y, at.z, (f) => addDb(ambientNoise(-at.y, 0.5, f), quiet), CONTACTS, (id) => id === 'deep-pulse');
  assert.equal(heard.length, 1);
  assert.ok(heard[0].snr >= HEAR_SNR + 3, `snr ${heard[0].snr.toFixed(1)} dB`);
  assert.ok(Math.abs(heard[0].bearing - bearing(at.x, at.z, K3.x, K3.z)) < 1e-9);
});

test('the second listening point gives a real crossing, in deep enough water', () => {
  for (const [x, z] of [[0, HARBOR.gate.z + 60], [150, 430], [-400, 700], [600, 1500]]) {
    const p = secondPulsePoint(x, z);
    const cross = crossingAngle(bearing(x, z, K3.x, K3.z), bearing(p.x, p.z, K3.x, K3.z));
    assert.ok(cross >= 25, `from ${x},${z}: crossing ${cross.toFixed(1)}°`);
    assert.ok(seabedHeight(p.x, p.z) < -25, `from ${x},${z}: water at the point ${seabedHeight(p.x, p.z).toFixed(1)} m`);
    assert.ok(p.x > WORLD.minX && p.x < WORLD.maxX && p.z > WORLD.minZ && p.z < WORLD.maxZ);
  }
});

test('the multibeam sees the container from the float, not from far above or far off', () => {
  const c = K3.container;
  assert.ok(multibeamSees(K3.x + 3, K3.floatY + 2, K3.z, c.x, c.y, c.z), 'from beside the float');
  assert.ok(!multibeamSees(K3.x, -20, K3.z, c.x, c.y, c.z), 'from near the surface: too deep below');
  assert.ok(!multibeamSees(K3.x + 400, K3.floatY, K3.z, c.x, c.y, c.z), 'from 400 m off');
  assert.ok(!multibeamSees(c.x, c.y - 5, c.z, c.x, c.y, c.z), 'not above the boat');
});

test('the follow-up runs from the berth to the dock, one task at a time, with no marker before the source is found', () => {
  const atlas = new EchoAtlas(mem());
  const m = new PulseMission();
  const dp = CONTACTS.find((c) => c.id === 'deep-pulse')!;
  const ctx: PulseCtx = {
    x: HARBOR.berth.x, z: HARBOR.berth.z, depth: 0, speed: 0, heading: 180, knock: undefined, bearings: 0, sincePing: Infinity, pingAt: null, plateScanned: false, recorderTaken: false, docked: false,
    pulse: undefined, pulseBearings: 0, lamps: true, tagScanned: false, hydrophoneTaken: false, footPinged: false,
  };
  const step = (patch: Partial<PulseCtx>) => {
    Object.assign(ctx, patch);
    ctx.pulse = atlas.contact(dp.id);
    return m.update(ctx);
  };
  assert.equal(m.stageCount, PULSE_STAGES.length);
  assert.equal(m.id, 'depart');
  assert.equal(step({}), false);
  assert.ok(step({ x: 0, z: HARBOR.gate.z + 40 }));
  assert.equal(m.view(ctx).guide.kind, 'none', 'no marker for the mystery');
  // two bearings, the second from the suggested point
  atlas.hear(dp.id, dp.unknownLabel, dp.pattern, 'unknown');
  const b1 = bearing(ctx.x, ctx.z, K3.x, K3.z);
  atlas.observe({ contactId: dp.id, x: ctx.x, z: ctx.z, depth: 15, bearing: b1, halfWidth: 4, snr: 14 });
  assert.ok(step({ pulseBearings: 1 }));
  const p = m.second!;
  assert.ok(p);
  atlas.observe({ contactId: dp.id, x: p.x, z: p.z, depth: 15, bearing: bearing(p.x, p.z, K3.x, K3.z), halfWidth: 4, snr: 14 });
  assert.ok(step({ x: p.x, z: p.z, pulseBearings: 2 }), 'the bearings cross');
  const fix = atlas.contact(dp.id)!.estimate!;
  assert.ok(Math.hypot(fix.x - K3.x, fix.z - K3.z) < fix.r, 'the search area holds the mooring');
  assert.equal(m.view(ctx).guide.kind, 'area');
  // over the mooring but near the surface: not found yet; down by the float in the lamps: found
  assert.equal(step({ x: K3.x + 5, z: K3.z, depth: 30 }), false);
  assert.equal(step({ depth: -K3.floatY, lamps: false }), false, 'in the dark it is not seen');
  assert.ok(step({ x: K3.x + FLOAT_FOUND_M * 0.8, depth: -K3.floatY + 2, lamps: true }));
  assert.equal(m.id, 'scan');
  assert.ok(step({ tagScanned: true }));
  assert.ok(step({ hydrophoneTaken: true }));
  assert.equal(m.id, 'ping');
  assert.ok(step({ footPinged: true }));
  assert.ok(step({ x: 0, z: HARBOR.gate.z - 30 }));
  assert.ok(step({ docked: true }));
  assert.ok(m.done);
});

test('the follow-up\'s saves are its own: the first expedition\'s are not taken for them', () => {
  const save = JSON.stringify({ mission: PULSE_ID, stage: 4, sub: { x: 1, y: -280, z: 2, heading: 0, ballast: 0.9, battery: 0.6 }, elapsed: 1, distance: 2, maxDepth: 280, battery0: 1, plateScanned: false, recorderTaken: false, tagScanned: true, second: null, track: [], t: 0 });
  assert.equal(parseCheckpoint(save), null, 'not a first-expedition save');
  const c = parseCheckpoint(save, PULSE_ID)!;
  assert.equal(c.stage, 4);
  assert.equal(c.tagScanned, true);
  assert.equal(parseCheckpoint(JSON.stringify({ ...JSON.parse(save), mission: MISSION_ID }), PULSE_ID), null);
});

test('a ping 50-60 m above the basin floor finds the mooring from any side out to 200 m', () => {
  const cols = buildColliders();
  for (const d of [40, 120, 200]) {
    for (let a = 0; a < 360; a += 30) {
      const x = K3.x + Math.sin((a * Math.PI) / 180) * d, z = K3.z - Math.cos((a * Math.PI) / 180) * d;
      const rays = sonarRays(x, K3.floatY - 6, z, cols, 90, 0, 90, 5);
      const hit = rays.filter((r) => r.kind === 'object' && r.tag.startsWith('k3'));
      assert.ok(hit.length, `from ${d} m at ${a}°`);
      const b = bearing(x, z, K3.x, K3.z);
      assert.ok(hit.some((r) => Math.abs(((r.b - b + 540) % 360) - 180) < 6), `the return points at the mooring from ${d} m at ${a}°`);
    }
  }
});
