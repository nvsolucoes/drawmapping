import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { MapStore } from '../server/store.mjs';
import { collectUnusedAssets, createBackup } from '../server/archive.mjs';
import { inspectImage } from '../server/assets.mjs';
import { createMap } from '../shared/model.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6QmcAAAAASUVORK5CYII=', 'base64');
async function fixture(t) {
  const directory = await mkdtemp(join(process.cwd(), 'tests', '.tmp-retention-'));
  const store = new MapStore(directory, { seed: false });
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  const image = inspectImage(png); store.putAsset(image.id, image.data);
  return { directory, store, image, filename: join(store.assetsDirectory, image.id) };
}

test('limpeza mantém uploads recentes e remove somente assets antigos sem referência', async (t) => {
  const { store, filename } = await fixture(t);
  collectUnusedAssets(store); assert.ok(existsSync(filename));
  const old = new Date(Date.now() - 48 * 3600_000); await utimes(filename, old, old);
  collectUnusedAssets(store); assert.equal(existsSync(filename), false);
});

test('imagens continuam preservadas por checkpoints e backups recuperáveis', async (t) => {
  const { store, image, filename } = await fixture(t);
  const document = createMap('blank'); document.nodes[0].image = image.id; store.insert(document);
  const changed = structuredClone(document); delete changed.nodes[0].image; store.save(document.id, changed);
  const old = new Date(Date.now() - 48 * 3600_000); await utimes(filename, old, old);
  collectUnusedAssets(store); assert.ok(existsSync(filename));
  createBackup(store);
  store.db.exec('DELETE FROM revisions; DELETE FROM maps;');
  collectUnusedAssets(store); assert.ok(existsSync(filename));
});

test('reenviar imagem deduplicada renova a proteção até o autosave', async (t) => {
  const { store, filename, image } = await fixture(t);
  const old = new Date(Date.now() - 48 * 3600_000); await utimes(filename, old, old);
  store.putAsset(image.id, image.data);
  collectUnusedAssets(store);
  assert.ok(existsSync(filename));
});

test('checkpoints são limitados a vinte sem alterar o documento atual', async (t) => {
  const { store } = await fixture(t);
  const document = store.insert(createMap('blank'));
  for (let index = 0; index < 25; index++) store.checkpoint({ ...document, title: `Checkpoint ${index}` }, true);
  assert.equal(store.revisions(document.id).length, 20);
  assert.equal(store.revisions(document.id)[0].title, 'Checkpoint 24');
  assert.equal(store.get(document.id).title, document.title);
});
