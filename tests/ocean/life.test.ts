import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeabedLife, rng } from '../../src/ocean/render/seabedLife';
import { Jellies } from '../../src/ocean/render/jellies';
import { Bioluminescence } from '../../src/ocean/render/biolum';
import { K3 } from '../../src/ocean/world/geo';
import * as THREE from 'three';

interface CellLike {
  n?: number[];
  items?: { n: number }[];
  cx?: number;
  cz?: number;
}
const counts = (o: { group: THREE.Group }) => o.group.children.map((m) => (m as THREE.InstancedMesh).count);

test('cell randoms: neighbouring cells do not get related numbers', () => {
  // (a bare Lehmer generator's first draw is linear in the seed: rows of cells came out alike)
  for (const [a, b, c] of [[92821, 68917, 3], [73856093, 19349663, 7]]) {
    const firsts: number[] = [], seconds: number[] = [];
    for (let i = 0; i < 400; i++) {
      const r = rng(i * a + 89 * b + c);
      firsts.push(r());
      seconds.push(r());
    }
    for (const xs of [firsts, seconds]) {
      // spread over [0, 1) like uniform draws: every tenth holds some, none holds most
      const bins = new Array(10).fill(0);
      for (const x of xs) bins[Math.min(9, Math.floor(x * 10))]++;
      assert.ok(Math.min(...bins) > 15 && Math.max(...bins) < 70, `bins ${bins}`);
      // and one cell's draw says nothing about the next one's: about a tenth of neighbours land within 0.05
      // (the old draws stepped by a fixed amount from cell to cell, so none or all of them did)
      let same = 0;
      for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - xs[i - 1]) < 0.05) same++;
      assert.ok(same > 15 && same < 70, `${same} near-equal neighbours`);
    }
  }
});

test('jellies: helmet jellies in the deep basin, moon jellies in the shelf swarms, none out of place', () => {
  const j = new Jellies(1);
  j.update(K3.x, -250, K3.z, 0);
  const [moonDeep, helmetDeep] = counts(j);
  assert.equal(moonDeep, 0);
  assert.ok(helmetDeep > 5, `${helmetDeep} helmet jellies round K3`);
  // (a swarm core over the shelf, 30 m deep)
  j.update(-284, -12, 612, 0);
  const [moonShelf, helmetShelf] = counts(j);
  assert.ok(moonShelf > 50, `${moonShelf} moon jellies in the swarm`);
  assert.equal(helmetShelf, 0);
  // every one in the water, between the surface and the bottom
  const m = j.group.children[0] as THREE.InstancedMesh;
  const a = m.instanceMatrix.array;
  for (let i = 0; i < m.count; i++) assert.ok(a[i * 16 + 13] < -1 && a[i * 16 + 13] > -31, `y ${a[i * 16 + 13]}`);
  j.dispose();
});

test('jellies and sea-floor life: an empty nearby cell does not hide the cells beyond it', () => {
  // (the instance lists are filled nearest cell first; one with none of a kind used to end the list)
  const j = new Jellies(1);
  j.update(K3.x, -250, K3.z, 0);
  const jc = [...(j as unknown as { cells: Map<string, CellLike> }).cells.values()];
  const helmets = jc.reduce((s, c) => s + c.n![1], 0);
  assert.ok(jc.some((c) => c.n![1] === 0), 'some cells have no helmet jellies');
  assert.equal(counts(j)[1], Math.min(helmets, 90));
  j.dispose();

  const life = new SeabedLife(1);
  life.fill(-60, 260);
  const cells = [...(life as unknown as { cells: Map<string, CellLike> }).cells.values()];
  const shown = counts(life);
  const meshes = life.group.children as THREE.InstancedMesh[];
  const ci = Math.floor(-60 / 16), cj = Math.floor(260 / 16);
  let checked = 0;
  shown.forEach((n, k) => {
    // (each kind out to where its shader has shrunk it away, plus a cell's diagonal)
    const reach = ((meshes[k].geometry.attributes.aFar as THREE.BufferAttribute).getX(0) + 16 * 1.42) / 16;
    const near = cells.filter((c) => Math.hypot(c.cx! - ci, c.cz! - cj) <= reach);
    const total = near.reduce((s, c) => s + c.items![k].n, 0);
    assert.equal(n, Math.min(total, meshes[k].instanceMatrix.count), `kind ${k}`);
    if (total > 0 && near.some((c) => c.items![k].n === 0)) checked++;
  });
  assert.ok(checked > 0, 'at least one kind is missing from some cells');
});

test('bioluminescence: sparks go into a ring, the oldest replaced first', () => {
  const b = new Bioluminescence(4, new THREE.Texture());
  for (let i = 0; i < 6; i++) b.spark(i, 0, 0, i, 1);
  const pos = b.points.geometry.attributes.position.array as Float32Array;
  // six sparks in a ring of four: the first two were overwritten by the last two
  assert.deepEqual([pos[0], pos[3], pos[6], pos[9]], [4, 5, 2, 3]);
  b.update(6, 600, true);
  assert.equal(b.points.visible, true);
  b.dispose();
});
