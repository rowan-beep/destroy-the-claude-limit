import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySave, entryHashes, isSaveKey, mergeSaves, onlySave, planSync, saveHash, snapshot, summarize, type SaveData } from '../../src/net/cloudSave';

/** a tiny in-memory localStorage */
function store(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

test('the save is every triad entry except caches and sync bookkeeping', () => {
  assert.ok(isSaveKey('triad.ranked.v2'));
  assert.ok(isSaveKey('triad-air-combat-settings-v1'));
  assert.ok(isSaveKey('triad-daily-done'));
  assert.ok(!isSaveKey('triad.thumb.v3:F15EX'));
  assert.ok(!isSaveKey('triad.cloud.v1'));
  assert.ok(!isSaveKey('sb-abc-auth-token'));
  assert.ok(!isSaveKey('other.thing'));
  const s = store({ 'triad.logbook.v1': '{}', 'triad.thumb.x': 'data:', 'triad.cloud.v1': '{}', 'sb-x-auth-token': 't' });
  assert.deepEqual(snapshot(s), { 'triad.logbook.v1': '{}' });
});

test('the fingerprint ignores entry order and changes with any value', () => {
  const a: SaveData = { 'triad.a': '1', 'triad.b': '2' };
  const b: SaveData = { 'triad.b': '2', 'triad.a': '1' };
  assert.equal(saveHash(a), saveHash(b));
  assert.notEqual(saveHash(a), saveHash({ ...a, 'triad.b': '3' }));
  assert.match(saveHash(a), /^[0-9a-f]{16}$/);
});

const local: SaveData = { 'triad.ranked.v2': '{"matches":4}' };
const other: SaveData = { 'triad.ranked.v2': '{"matches":9}' };

test('first sign-in copies the device save to an empty account (the migration)', () => {
  assert.deepEqual(planSync(local, null, null), { do: 'upload', reason: 'first' });
  // a brand-new device with nothing saved has nothing to copy
  assert.deepEqual(planSync({}, null, null), { do: 'none' });
});

test('a fresh device gets the account save', () => {
  assert.deepEqual(planSync({}, saveHash(other), null), { do: 'download' });
});

test('identical saves need nothing', () => {
  assert.deepEqual(planSync(local, saveHash(local), null), { do: 'none' });
});

test('one side moved on since they last agreed: it wins', () => {
  // the account still holds what we agreed on, this device played on
  assert.deepEqual(planSync(local, saveHash(other), saveHash(other)), { do: 'upload', reason: 'newer' });
  // this device has not changed, another device played on
  assert.deepEqual(planSync(local, saveHash(other), saveHash(local)), { do: 'download' });
});

test('both moved on, or a device with progress meets an account with progress: the player chooses', () => {
  assert.deepEqual(planSync(local, saveHash(other), null), { do: 'ask' });
  assert.deepEqual(planSync(local, saveHash(other), 'something-else'), { do: 'ask' });
});

test('putting a save on the device replaces save entries and keeps caches and other sites', () => {
  const s = store({ 'triad.old': 'x', 'triad.ranked.v2': 'a', 'triad.thumb.k': 'img', 'sb-x-auth-token': 't', 'triad.cloud.v1': 'b' });
  applySave(s, { 'triad.ranked.v2': 'new', 'triad.campaign.v1': 'c' });
  assert.deepEqual(snapshot(s), { 'triad.ranked.v2': 'new', 'triad.campaign.v1': 'c' });
  assert.equal(s.getItem('triad.thumb.k'), 'img');
  assert.equal(s.getItem('sb-x-auth-token'), 't');
  assert.equal(s.getItem('triad.cloud.v1'), 'b');
});

test('summaries read the logbook and ranked entries, and survive junk', () => {
  const d: SaveData = {
    'triad.logbook.v1': JSON.stringify({ totals: { sorties: 12 } }),
    'triad.ranked.v2': JSON.stringify({ matches: 7, rp: 2650 }),
    'triad.paint.v1': 'not json',
  };
  assert.deepEqual(summarize(d), { items: 3, flights: 12, rankedMatches: 7, rp: 2650 });
  assert.deepEqual(summarize({ 'triad.logbook.v1': '{' }), { items: 1, flights: 0, rankedMatches: 0, rp: null });
});

test('what only matters to one device is not part of the save', () => {
  for (const k of ['triad.seenVersion', 'triad.space.seenVersion', 'triad.ocean.seenVersion', 'triad.program', 'triad.album.view']) assert.ok(!isSaveKey(k), k);
  assert.deepEqual(onlySave({ 'triad.seenVersion': '7.10.1', 'triad.ranked.v2': 'r', 'triad.cloud.v1': 'b' }), { 'triad.ranked.v2': 'r' });
});

test('an update on two devices no longer looks like two different saves', () => {
  // both devices showed the new release notes: their saves are still the same
  const a = snapshot(store({ 'triad.ranked.v2': 'r', 'triad.seenVersion': '7.10.1' }));
  const b = snapshot(store({ 'triad.ranked.v2': 'r', 'triad.seenVersion': '7.10.0' }));
  assert.equal(saveHash(a), saveHash(b));
});

test('both moved on in different entries: merged, nothing lost, nobody asked', () => {
  const base: SaveData = { 'triad.ranked.v2': 'r1', 'triad.logbook.v1': 'l1', 'triad.camera.v1': 'c1' };
  // this device flew a sortie, the other changed a setting and played ranked
  const local: SaveData = { ...base, 'triad.logbook.v1': 'l2' };
  const cloud: SaveData = { ...base, 'triad.ranked.v2': 'r2', 'triad.camera.v1': 'c2', 'triad.ocean.progress.v1': 'o' };
  const m = mergeSaves(local, cloud, entryHashes(base));
  assert.deepEqual(m.clash, []);
  assert.deepEqual(m.data, { 'triad.ranked.v2': 'r2', 'triad.logbook.v1': 'l2', 'triad.camera.v1': 'c2', 'triad.ocean.progress.v1': 'o' });
});

test('a setting both changed follows this device; progress both changed is the player\'s call', () => {
  const base: SaveData = { 'triad.camera.v1': 'c1', 'triad.ranked.v2': 'r1' };
  const local: SaveData = { 'triad.camera.v1': 'c2', 'triad.ranked.v2': 'r2' };
  const cloud: SaveData = { 'triad.camera.v1': 'c3', 'triad.ranked.v2': 'r3' };
  const m = mergeSaves(local, cloud, entryHashes(base));
  assert.equal(m.data['triad.camera.v1'], 'c2');
  assert.deepEqual(m.clash, ['triad.ranked.v2']);
});

test('a deletion on one side carries over; without a known base nothing is ever dropped', () => {
  const base: SaveData = { 'triad.a': '1', 'triad.ranked.v2': 'r' };
  assert.deepEqual(mergeSaves({ 'triad.ranked.v2': 'r' }, base, entryHashes(base)).data, { 'triad.ranked.v2': 'r' });
  const m = mergeSaves({ 'triad.a': '1' }, { 'triad.b': '2', 'triad.camera.v1': 'x' }, null);
  assert.deepEqual(m.data, { 'triad.a': '1', 'triad.b': '2', 'triad.camera.v1': 'x' });
  assert.deepEqual(m.clash, []);
  assert.deepEqual(mergeSaves({ 'triad.logbook.v1': 'a' }, { 'triad.logbook.v1': 'b' }, null).clash, ['triad.logbook.v1']);
});
