// The missile racks (src/aircraft/models/racks.ts), checked without WebGL: every loadout of every jet is
// built in Node and its racks and stores measured against the skin heights racks.ts keeps for each jet.
// (A scene check through the real airframe meshes is tools/checkRacks.js, run in the dev game's console.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT_TYPES, SPECS } from '../../src/aircraft/specs';
import { jetRacks, skinHeight } from '../../src/aircraft/models/racks';
import { storeCenterX, storeCenterY, storeRadius } from '../../src/aircraft/models/stores';

/** store bodies that are meant to sit in the skin: semi-recessed and conformal (CFT) stations */
const RECESSED = new Set(['semi-recessed', 'conformal']);

for (const type of AIRCRAFT_TYPES) {
  const spec = SPECS[type];
  for (const lo of spec.loadouts) {
    test(`${type} ${lo.id}: racks built, no NaN, every station drawn, stores clear of the skin`, () => {
      const loaded = spec.stations.flatMap((def) => (lo.stores[def.id] ? [{ def, store: lo.stores[def.id] }] : []));
      const rk = jetRacks(spec, loaded);
      if (rk.geo) {
        const a = rk.geo.attributes.position.array;
        for (let i = 0; i < a.length; i++) assert.ok(Number.isFinite(a[i]), `NaN in the rack mesh at ${i}`);
        for (const l of loaded) if (l.def.mount !== 'internal') assert.ok(rk.handled.has(l.def.id), `station ${l.def.id} (${l.def.label}) has no rack`);
      }
      for (const l of loaded) {
        if (l.def.mount === 'internal' || RECESSED.has(l.def.mount)) continue;
        const top = storeCenterY(l.def, l.store) + storeRadius(l.store);
        const skin = skinHeight(type, l.def.rack ?? l.def.pos[0], l.def.pos[2]);
        if (skin === null) continue;
        // (the measured skin under a twin rack is at the rack's centre line: allow the wing's slope out to the missile)
        assert.ok(top <= skin + 0.02, `station ${l.def.id} (${l.def.label}): store top ${top.toFixed(3)} above the skin ${skin.toFixed(3)}`);
        assert.ok(skin - top <= 0.75, `station ${l.def.id} (${l.def.label}): ${(skin - top).toFixed(2)} m of air above the store`);
        assert.ok(Number.isFinite(storeCenterX(l.def, l.store)), `station ${l.def.id}: x`);
      }
    });
  }
}

test('hang keeps its meaning: stations moved by the racks use attach / attachX, never a new hang', () => {
  // the station values racks v3 put back (racks v2 had changed hang on these): hang is the wing underside line again
  const back: [string, number, number][] = [
    ['FA18EF', 2, 0.11], ['FA18EF', 10, 0.11], ['FA18EF', 3, 0.16], ['FA18EF', 4, 0.16], ['FA18EF', 8, 0.16], ['FA18EF', 9, 0.16],
    ['F16C', 2, -0.04], ['F16C', 8, -0.04],
    ['SU57', 1, -0.32], ['SU57', 12, -0.32], ['SU57', 2, -0.36], ['SU57', 11, -0.36], ['SU57', 3, -0.4], ['SU57', 10, -0.4],
  ];
  for (const [t, id, hang] of back) {
    const d = SPECS[t as keyof typeof SPECS].stations.find((s) => s.id === id)!;
    assert.equal(d.hang, hang, `${t} station ${id} hang`);
    assert.ok(d.attach !== undefined, `${t} station ${id} has an attach line`);
  }
});
