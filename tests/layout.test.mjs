import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap } from '../shared/model.ts';
import { layoutMap, descendants, wrapText, orderNodesByVisualPosition } from '../src/lib/layout.ts';

function teachingMap(count) {
  const map = createMap('blank', 'Aprender, conectar e transformar');
  const root = map.nodes[0].id;
  for (let index = 1; index < count; index++) {
    const parentId = index < 9 ? root : `topic-${Math.floor((index - 9) / 5) + 1}`;
    map.nodes.push({ id: `topic-${index}`, parentId, text: index % 7 === 0 ? 'Uma explicação mais longa, com acentos e exemplos de aplicação' : `Assunto ${index}`, ...(index <= 10 ? { image: `${'a'.repeat(64)}.png` } : {}) });
  }
  return map;
}

for (const count of [100, 500, 1000]) {
  test(`layout automático de ${count} tópicos é finito e não sobrepõe cards`, () => {
    const map = teachingMap(count);
    const started = performance.now();
    const layout = layoutMap(map);
    assert.equal(layout.nodes.length, count);
    assert.ok(performance.now() - started < 2000, 'O layout ultrapassou dois segundos.');
    for (const node of layout.nodes) assert.ok([node.x, node.y, node.width, node.height].every(Number.isFinite));
    for (let first = 0; first < layout.nodes.length; first++) {
      const a = layout.nodes[first];
      for (let second = first + 1; second < layout.nodes.length; second++) {
        const b = layout.nodes[second];
        const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        assert.equal(overlap, false, `Sobreposição entre ${a.id} e ${b.id}`);
      }
    }
  });
}

test('recolher ramo preserva domínio e expandAll revela todos os tópicos', () => {
  const map = createMap('course');
  const branch = map.nodes[1];
  const subtree = descendants(map.nodes, branch.id);
  branch.collapsed = true;
  assert.equal(layoutMap(map).nodes.length, map.nodes.length - subtree.size + 1);
  assert.equal(layoutMap(map, { expandAll: true }).nodes.length, map.nodes.length);
  assert.ok(subtree.has(branch.id));
});

test('textos longos, quebras de linha e palavras compridas são preservados', () => {
  const text = 'Ação e compreensão\nSupercalifragilisticamenteSemEspaços';
  const lines = wrapText(text, 12);
  assert.ok(lines.every(line => line.length <= 12));
  assert.equal(lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
});

test('blocos longos crescem e letras largas são quebradas sem perda', () => {
  const map = createMap('blank');
  const text = 'O conhecimento ganha vida quando é aplicado. WWWWWWWWWWWWWW e outros exemplos';
  map.nodes.push({ id: 'texto-longo', parentId: map.nodes[0].id, text });
  const item = layoutMap(map).nodes.find(node => node.id === 'texto-longo');
  assert.equal(item.lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert.ok(item.lines.some(line => line.includes('WWWW')));
  assert.ok(item.lines.every(line => !line.includes('WWWWWWWWWWWWWW')));
  assert.ok(item.height >= item.lines.length * 23 + 38);
});

test('orientação à direita posiciona cada ramo e subtópico à direita do pai', () => {
  const map = teachingMap(100);
  map.orientation = 'right';
  const layout = layoutMap(map);
  for (const edge of layout.edges) {
    assert.equal(edge.target.side, 'right');
    assert.ok(edge.target.x >= edge.source.x + edge.source.width);
  }
  const legacy = teachingMap(20); delete legacy.orientation;
  const branches = layoutMap(legacy).nodes.filter(node => node.depth === 1);
  assert.ok(branches.some(node => node.side === 'left') && branches.some(node => node.side === 'right'));
});

test('organizar preserva a ordem vertical que o usuário definiu para irmãos', () => {
  const map = createMap('blank');
  const root = map.nodes[0].id;
  map.nodes.push({ id: 'parent', parentId: root, text: 'Ramo' }, { id: 'a', parentId: 'parent', text: 'Instruções' }, { id: 'b', parentId: 'parent', text: 'Base' }, { id: 'c', parentId: 'parent', text: 'Anexos' }, { id: 'last', parentId: 'parent', text: 'Tudo', position: { x: 700, y: -1000 } });
  const order = orderNodesByVisualPosition(map);
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  map.nodes = order.map(id => byId.get(id));
  map.nodes.forEach(node => delete node.position);
  assert.deepEqual(map.nodes.filter(node => node.parentId === 'parent').map(node => node.id), ['last', 'a', 'b', 'c']);
  const layout = layoutMap(map);
  const siblings = layout.nodes.filter(node => node.node.parentId === 'parent');
  assert.deepEqual(siblings.map(node => node.id), ['last', 'a', 'b', 'c']);
  assert.ok(siblings.every((node, index) => !index || node.y > siblings[index - 1].y));
});

test('organizar mantém os lados da raiz e não reordena ramos ocultos', () => {
  const map = createMap('blank'); const root = map.nodes[0].id;
  map.nodes.push({ id: 'r1', parentId: root, text: 'R1' }, { id: 'l1', parentId: root, text: 'L1', collapsed: true }, { id: 'r2', parentId: root, text: 'R2', position: { x: 400, y: -1000 } }, { id: 'l2', parentId: root, text: 'L2' }, { id: 'hidden1', parentId: 'l1', text: 'A', position: { x: -500, y: 500 } }, { id: 'hidden2', parentId: 'l1', text: 'B', position: { x: -500, y: -500 } });
  const ids = orderNodesByVisualPosition(map);
  assert.deepEqual(ids.filter(id => ['r1','r2','l1','l2'].includes(id)), ['r2','l1','r1','l2']);
  assert.ok(ids.indexOf('hidden1') < ids.indexOf('hidden2'));
});

test('apresentação dimensiona apenas ramos visíveis e ignora posições manuais', () => {
  const map = createMap('blank'); const root = map.nodes[0].id;
  map.orientation = 'right'; map.nodes[0].position = { x: 4000, y: 4000 };
  map.nodes.push({ id: 'parent', parentId: root, text: 'Ramo' }, { id: 'a', parentId: 'parent', text: 'A', position: { x: 9000, y: -9000 } }, { id: 'b', parentId: 'parent', text: 'B' });
  for (let i = 0; i < 30; i++) map.nodes.push({ id: `hidden-${i}`, parentId: 'a', text: `Oculto ${i}` });
  const visible = new Set([root, 'parent', 'a', 'b']);
  const layout = layoutMap(map, { expandAll: true, ignoreManual: true, visibleIds: visible });
  assert.equal(layout.nodes.length, 4);
  const a = layout.nodes.find(node => node.id === 'a'), b = layout.nodes.find(node => node.id === 'b');
  assert.equal(b.y - (a.y + a.height), 24);
  assert.equal(layout.nodes.find(node => node.id === root).x, 0);
  assert.ok(a.x < 9000);
  const expanded = layoutMap(map, { expandAll: true, ignoreManual: true, visibleIds: new Set([...visible, ...map.nodes.filter(node => node.parentId === 'a').map(node => node.id)]) });
  assert.ok(expanded.nodes.find(node => node.id === 'b').y > b.y);
});

test('apresentação preserva lado e cor dos ramos mesmo quando irmãos estão ocultos', () => {
  const map = createMap('blank'); const root = map.nodes[0].id;
  map.nodes.push({ id: 'one', parentId: root, text: 'A' }, { id: 'two', parentId: root, text: 'B' }, { id: 'three', parentId: root, text: 'C' });
  const full = layoutMap(map, { expandAll: true, ignoreManual: true });
  const partial = layoutMap(map, { expandAll: true, ignoreManual: true, visibleIds: new Set([root, 'two']) });
  assert.equal(partial.nodes.find(node => node.id === 'two').side, full.nodes.find(node => node.id === 'two').side);
  assert.equal(partial.nodes.find(node => node.id === 'two').color, full.nodes.find(node => node.id === 'two').color);
});
