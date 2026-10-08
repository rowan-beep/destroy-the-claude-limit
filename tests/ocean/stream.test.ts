import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeabedStreamer } from '../../src/ocean/render/seabed';
import { buildChunkArrays } from '../../src/ocean/render/seabedArrays';
import { frameStats } from '../../src/ocean/perf/benchmark';
import { shelterAt, surfaceHeight } from '../../src/ocean/world/waves';
import { HARBOR, WORLD } from '../../src/ocean/world/geo';
import { SURVEY_SUB, newSubState, stepSub, NO_INPUT, NEUTRAL_BALLAST } from '../../src/ocean/sub/subPhysics';
import { buildColliders } from '../../src/ocean/world/geo';

interface TileLike {
  x0: number;
  z0: number;
  size: number;
  segs: number;
}

/** how many loaded tiles cover a point */
function cover(tiles: TileLike[], x: number, z: number): number {
  let n = 0;
  for (const t of tiles) if (x >= t.x0 && x < t.x0 + t.size && z >= t.z0 && z < t.z0 + t.size) n++;
  return n;
}

function checkCoverage(s: SeabedStreamer, cx: number, cz: number, r: number): void {
  const tiles = [...(s as unknown as { tiles: Map<string, TileLike> }).tiles.values()];
  for (let z = cz - r; z <= cz + r; z += 37) {
    for (let x = cx - r; x <= cx + r; x += 37) {
      if (Math.hypot(x - cx, z - cz) > r) continue;
      // (the tiles cover the survey area and a 300 m margin round it)
      if (x < WORLD.minX - 300 || x > WORLD.maxX + 300 || z < WORLD.minZ - 300 || z > WORLD.maxZ + 300) continue;
      assert.equal(cover(tiles, x + 0.5, z + 0.5), 1, `point ${x},${z} covered by ${cover(tiles, x + 0.5, z + 0.5)} tiles`);
    }
  }
  // detail falls off with distance: the tile under the camera is the finest
  const under = tiles.find((t) => cx >= t.x0 && cx < t.x0 + t.size && cz >= t.z0 && cz < t.z0 + t.size)!;
  assert.equal(under.size, 160);
  assert.equal(under.segs, 48);
}

test('the sea bed quadtree covers every point once, and few draws do it', () => {
  const s = new SeabedStreamer();
  s.lod = [220, 520, 1100, 2400];
  s.fill(150, 430);
  checkCoverage(s, 150, 430, 2000);
  assert.ok(s.stats.loaded < 200, `${s.stats.loaded} tiles`);
  // move half a kilometre: the tiles change over and still cover everything once, nothing left behind
  s.fill(-260, 1180);
  checkCoverage(s, -260, 1180, 2000);
  assert.ok(s.stats.disposed > 0, 'old tiles released');
  assert.equal(s.stats.queued, 0);
  s.dispose();
});

test('streaming within a budget leaves no holes while it catches up', () => {
  const s = new SeabedStreamer();
  s.fill(0, 300);
  s.budgetMs = 0.01;
  // a jump: one tile a frame at most, but the ground stays covered (old tiles wait for their replacements)
  for (let i = 0; i < 6; i++) {
    s.update(400, 700, 400, 700);
    const tiles = [...(s as unknown as { tiles: Map<string, TileLike> }).tiles.values()];
    assert.ok(cover(tiles, 400.5, 700.5) >= 1, 'the ground under the camera is covered');
  }
  s.dispose();
});

test('the breakwater shelters the basin from the swell', () => {
  assert.equal(shelterAt(0, 500), 1);
  assert.ok(Math.abs(shelterAt(0, -50) - 0.2) < 1e-6, `${shelterAt(0, -50)}`);
  // and the waves inside are smaller
  let inMax = 0, outMax = 0;
  for (let t = 0; t < 30; t += 0.25) {
    inMax = Math.max(inMax, Math.abs(surfaceHeight(HARBOR.berth.x, HARBOR.berth.z, t, 1)));
    outMax = Math.max(outMax, Math.abs(surfaceHeight(150, 430, t, 1)));
  }
  assert.ok(inMax < outMax * 0.4, `inside ${inMax} outside ${outMax}`);
});

test('the vents flood the main tanks in seconds; the trim pump is slow', () => {
  const s = newSubState(-500, 500, 180);
  const env = { waveAmp: 0.5, colliders: buildColliders(), relaxed: true };
  let t = 0;
  while (s.ballast < SURVEY_SUB.ventTo - 1e-6 && t < 20) {
    stepSub(s, SURVEY_SUB, { ...NO_INPUT, ballast: 1 }, env, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(t > 3 && t < 5, `vented in ${t.toFixed(1)} s`);
  const t0 = t;
  while (s.ballast < NEUTRAL_BALLAST && t < 40) {
    stepSub(s, SURVEY_SUB, { ...NO_INPUT, ballast: 1 }, env, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(t - t0 > 1 && t - t0 < 2.5, `trimmed in ${(t - t0).toFixed(1)} s`);
});

test('benchmark statistics: percentiles, long frames, frame rate', () => {
  const iv = [...Array(98).fill(16), 60, 120];
  const st = frameStats(iv, iv.map(() => 4));
  assert.equal(st.frames, 100);
  assert.equal(st.medianMs, 16);
  assert.equal(st.over50, 2);
  assert.equal(st.maxMs, 120);
  assert.ok(st.p99Ms >= 60);
  assert.ok(Math.abs(st.avgFps - 100000 / (98 * 16 + 180)) < 1e-6);
  assert.equal(st.workMedianMs, 4);
});

test('tiles built on a worker: the answers come late, the ground stays covered, the detail arrives', () => {
  const s = new SeabedStreamer();
  // a worker that answers only when told to
  const asked: { key: string; x0: number; z0: number; size: number; segs: number }[] = [];
  const fake = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as unknown,
    postMessage(r: { key: string; x0: number; z0: number; size: number; segs: number }) {
      asked.push(r);
    },
    terminate() {},
  };
  s.attachWorker(fake as unknown as Worker);
  assert.equal(s.workerActive, true);
  s.fill(0, 300);
  const answer = (n: number) => {
    for (const r of asked.splice(0, n)) fake.onmessage!({ data: { key: r.key, ms: 1, ...buildChunkArrays(r.x0, r.z0, r.segs, r.size) } } as MessageEvent);
  };
  // jump half a kilometre: nothing is built on this thread, a few tiles are asked for at a time
  for (let i = 0; i < 400 && (s.pending() > 0 || i === 0); i++) {
    s.update(400, 700, 400, 700);
    assert.ok(asked.length <= s.maxInFlight, `${asked.length} requests in flight`);
    const tiles = [...(s as unknown as { tiles: Map<string, TileLike> }).tiles.values()];
    assert.ok(cover(tiles, 400.5, 700.5) >= 1, 'the ground under the camera is covered while waiting');
    answer(2);
  }
  s.update(400, 700, 400, 700);
  assert.equal(s.pending(), 0);
  checkCoverage(s, 400, 700, 2000);
  assert.ok(s.stats.workerBuilt > 0);
  s.dispose();
});
