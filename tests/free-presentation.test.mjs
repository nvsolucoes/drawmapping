import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap } from '../shared/model.ts';
import { freePresentationVisible } from '../src/lib/freePresentation.ts';

test('apresentação livre revela somente ramos abertos sem alterar o mapa', () => {
  const map = createMap('blank');
  const root = map.nodes[0].id;
  map.nodes.push({ id: 'a', parentId: root, text: 'A', collapsed: true }, { id: 'b', parentId: root, text: 'B' }, { id: 'child', parentId: 'a', text: 'Filho' });
  const before = JSON.stringify(map);
  assert.deepEqual([...freePresentationVisible(map, new Set())], [root]);
  assert.deepEqual(freePresentationVisible(map, new Set([root])), new Set([root, 'a', 'b']));
  assert.deepEqual(freePresentationVisible(map, new Set([root, 'a'])), new Set([root, 'a', 'b', 'child']));
  assert.equal(JSON.stringify(map), before);
});
