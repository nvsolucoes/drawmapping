import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { MapStore } from '../server/store.mjs';
import { createBackup, restoreBackup } from '../server/archive.mjs';
import { createMap } from '../shared/model.ts';

test('backup gerado restaura biblioteca com 252 mil tópicos somando o histórico', async (t) => {
  const directory = await mkdtemp(join(process.cwd(), 'tests', '.tmp-backup-scale-'));
  const store = new MapStore(directory, { seed: false });
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  for (let mapIndex = 0; mapIndex < 3; mapIndex++) {
    const map = createMap('blank', `Curso ${mapIndex + 1}`);
    for (let index = 1; index < 4000; index++) map.nodes.push({ id: `topic-${index}`, parentId: map.nodes[0].id, text: `Conteúdo ${index}` });
    store.insert(map);
    for (let checkpoint = 0; checkpoint < 20; checkpoint++) store.checkpoint(map, true);
  }
  const { name } = createBackup(store);
  assert.deepEqual(restoreBackup(store, name), { ok: true });
  assert.equal(store.list().length, 3);
  assert.equal(store.list()[0].nodes.length, 4000);
  assert.equal(store.revisions(store.list()[0].id).length, 20);
});

test('não confirma backup que ultrapassa o mesmo orçamento aceito na restauração', () => {
  const store = { snapshot: () => ({ maps: [{ document: { nodes: { length: 2_000_001 } } }], revisions: [] }) };
  assert.throws(() => createBackup(store), { statusCode: 413 });
});
