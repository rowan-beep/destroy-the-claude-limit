import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EchoAtlas, TrackRecorder, ATLAS_KEY, type Store } from '../../src/ocean/atlas/atlas';
import { CONTACTS } from '../../src/ocean/acoustics/acoustics';
import { bearing, SITES } from '../../src/ocean/world/geo';

const memStore = (): Store & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};

test('a contact goes from heard to bearing to located, and survives a reload', () => {
  const st = memStore();
  const a = new EchoAtlas(st);
  const k = CONTACTS[0];
  a.hear(k.id, k.unknownLabel, k.pattern, 'Unknown: a rhythmic knock');
  assert.equal(a.contact(k.id)!.status, 'heard');
  const src = SITES.recorder;
  a.observe({ contactId: k.id, x: 150, z: 430, depth: 20, bearing: bearing(150, 430, src.x, src.z), halfWidth: 6, snr: 12 });
  assert.equal(a.contact(k.id)!.status, 'bearing');
  const r = a.observe({ contactId: k.id, x: 520, z: 760, depth: 20, bearing: bearing(520, 760, src.x, src.z), halfWidth: 6, snr: 12 });
  assert.ok(r.fix);
  assert.equal(a.contact(k.id)!.status, 'located');
  a.confirm(k.id, { x: src.x, z: src.z, depth: 85 }, 'VOYAGE RECORDER PINGER', 'A damaged recorder pinger');
  // reload from the same store
  const b = new EchoAtlas(st);
  const c = b.contact(k.id)!;
  assert.equal(c.status, 'confirmed');
  assert.equal(c.interpretations.length, 2, 'the earlier interpretation is kept');
  assert.equal(b.data.observations.length, 2);
  assert.ok(b.evidenceFor(k.id).some((e) => e.kind === 'sound'));
});

test('a damaged save starts a fresh atlas instead of failing', () => {
  const st = memStore();
  st.set(ATLAS_KEY, '{not json');
  const a = new EchoAtlas(st);
  assert.equal(a.data.contacts.length, 0);
});

test('photographs are capped so the save stays small', () => {
  const a = new EchoAtlas(memStore());
  for (let i = 0; i < 30; i++) a.addEvidence({ contactId: null, kind: 'photo', title: `p${i}`, text: '', image: 'data:x' });
  a.addEvidence({ contactId: null, kind: 'note', title: 'kept', text: '' });
  assert.equal(a.data.evidence.filter((e) => e.kind === 'photo').length, 16);
  assert.ok(a.data.evidence.some((e) => e.title === 'kept'));
});

test('the route recorder keeps a point every spacing metres', () => {
  const t = new TrackRecorder(25);
  for (let i = 0; i <= 100; i++) t.add(i, 0, 5);
  assert.equal(t.points.length, 5);
  assert.ok(Math.abs(t.distance - 100) < 1e-9);
});
