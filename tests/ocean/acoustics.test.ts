import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACTS, listen, selfNoise, ambientNoise, addDb, triangulate, wedgeOverlap, bearingHalfWidth, pingMask, ListenGauge, PING_MASK_S, sonarRays, measureBearing, thorpDbPerKm, transmissionLoss } from '../../src/ocean/acoustics/acoustics';
import { SITES, bearing, buildColliders, seabedHeight } from '../../src/ocean/world/geo';

const quiet = { thrust: 0, lateral: 0, vertical: 0, pumping: false };
const loud = { thrust: 1, lateral: 0, vertical: 0, pumping: false };

test('the knock is heard from the training buoy when quiet, and drowned by full thrust', () => {
  const b = SITES.buoy;
  const nQuiet = (f: number) => addDb(ambientNoise(20, 0.25, f), selfNoise(quiet, 0.2));
  const nLoud = (f: number) => addDb(ambientNoise(20, 0.25, f), selfNoise(loud, 2.6));
  const q = listen(b.x, -20, b.z, nQuiet).find((c) => c.id === 'knock')!;
  const l = listen(b.x, -20, b.z, nLoud).find((c) => c.id === 'knock')!;
  assert.ok(q.snr > 9, `quiet snr ${q.snr}`);
  assert.ok(l.snr < 0, `loud snr ${l.snr}`);
  // and it is out of reach from far up the coast
  const far = listen(-1700, -20, -100, nQuiet).find((c) => c.id === 'knock')!;
  assert.ok(far.snr < 6, `far snr ${far.snr}`);
});

test('Thorp absorption: about 1 dB/km at 10 kHz, about 12 at 37.5 kHz', () => {
  assert.ok(Math.abs(thorpDbPerKm(10) - 1.2) < 0.3, `${thorpDbPerKm(10)}`);
  assert.ok(Math.abs(thorpDbPerKm(37.5) - 11.7) < 1, `${thorpDbPerKm(37.5)}`);
  // spreading: 60 dB at a kilometre, plus the absorption
  assert.ok(Math.abs(transmissionLoss(1000, 1) - 60.07) < 0.1);
});

test('a ping masks faint contacts for its ringing time only', () => {
  assert.ok(pingMask(0) > 30);
  assert.ok(pingMask(PING_MASK_S / 2) > 10);
  assert.equal(pingMask(PING_MASK_S), 0);
  assert.equal(pingMask(-1), 0);
});

test('a cleaner signal gives a narrower bearing wedge', () => {
  assert.ok(bearingHalfWidth(20) < bearingHalfWidth(5));
  assert.ok(bearingHalfWidth(100) >= 3 && bearingHalfWidth(-10) <= 22);
});

test('two crossing bearings find the source; parallel ones do not', () => {
  const src = { x: SITES.recorder.x, z: SITES.recorder.z };
  const a = { x: 150, z: 430 }, b = { x: 550, z: 700 };
  const la = { ...a, bearing: bearing(a.x, a.z, src.x, src.z), halfWidth: 5 };
  const lb = { ...b, bearing: bearing(b.x, b.z, src.x, src.z), halfWidth: 5 };
  const fix = triangulate([la, lb])!;
  assert.ok(fix, 'a fix');
  assert.ok(Math.hypot(fix.x - src.x, fix.z - src.z) < 1, 'exact bearings meet at the source');
  assert.ok(fix.r > 20 && fix.r < 400, `search radius ${fix.r}`);
  const quad = wedgeOverlap(la, lb)!;
  assert.equal(quad.length, 4);
  // noisy bearings still land near it
  const na = { ...la, bearing: measureBearing(la.bearing, 5, 1) }, nb = { ...lb, bearing: measureBearing(lb.bearing, 5, 2) };
  const nf = triangulate([na, nb])!;
  assert.ok(Math.hypot(nf.x - src.x, nf.z - src.z) < nf.r * 1.5, 'the noisy fix covers the source');
  // the same direction twice: no crossing
  assert.equal(triangulate([la, { ...la, x: la.x + 5 }]), null);
});

test('the listening gauge fills only when steady and heard', () => {
  const g = new ListenGauge();
  for (let i = 0; i < 60; i++) g.update(0.1, 12, 2, 0, false);
  assert.equal(g.progress, 0);
  assert.match(g.blocker, /TOO FAST/);
  let done = false;
  for (let i = 0; i < 60 && !done; i++) done = g.update(0.1, 12, 0.3, 0, false);
  assert.ok(done, 'a bearing after steady listening');
  g.reset();
  g.update(0.1, 12, 0.3, 0, true);
  assert.match(g.blocker, /PING/);
});

test('a ping near the wreck returns the hull as a hard object', () => {
  const w = SITES.wreck;
  const y = seabedHeight(w.x, w.z) + 6;
  const rays = sonarRays(w.x + 120, y, w.z, buildColliders(), 72, 0, 72);
  assert.equal(rays.length, 72);
  assert.ok(rays.some((r) => r.kind === 'object' && r.tag.startsWith('wreck')), 'the hull answers');
});

test('contacts are defined in the water, above the seabed', () => {
  for (const c of CONTACTS) assert.ok(c.y > seabedHeight(c.x, c.z) - 0.5, `${c.id} at ${c.y} vs seabed ${seabedHeight(c.x, c.z)}`);
});
