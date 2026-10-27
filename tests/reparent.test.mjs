import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap } from '../shared/model.ts';
import { layoutMap } from '../src/lib/layout.ts';
import { findDropParent, placeNearParent } from '../src/lib/reparent.ts';

test('arraste encontra somente destinos próximos e impede ciclos', () => {
  const map = createMap('blank');
  const root = map.nodes[0].id;
  map.nodes.push({ id: 'a', parentId: root, text: 'A' }, { id: 'b', parentId: root, text: 'B' }, { id: 'child', parentId: 'a', text: 'Filho' });
  const nodes = layoutMap(map).nodes;
  const a = nodes.find(node => node.id === 'a');
  const b = nodes.find(node => node.id === 'b');
  const child = nodes.find(node => node.id === 'child');
  const centeredOn = target => ({ x: target.x + target.width / 2 - a.width / 2, y: target.y + target.height / 2 - a.height / 2 });
  assert.equal(findDropParent(map, nodes, 'a', centeredOn(b))?.id, 'b');
  assert.notEqual(findDropParent(map, nodes, 'a', centeredOn(child))?.id, 'child');
  assert.equal(findDropParent(map, nodes, 'a', { x: 100000, y: 100000 }), null);
  assert.equal(findDropParent(map, nodes, root, centeredOn(b)), null);
  const placed = placeNearParent(map, nodes, a, b, centeredOn(b));
  assert.ok(placed.x + a.width <= b.x || placed.x >= b.x + b.width);
});
