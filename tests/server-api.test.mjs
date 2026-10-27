import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import { startServer } from '../server/index.mjs';
import { createMap, validateMap } from '../shared/model.ts';
import { inspectImage } from '../server/assets.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6QmcAAAAASUVORK5CYII=', 'base64');
async function localFetch(server, path, options = {}) {
  const response = await server.app.inject({ method: options.method || 'GET', url: path, headers: { host: `127.0.0.1:${server.port}`, ...options.headers }, payload: options.body });
  return new Response(response.rawPayload, { status: response.statusCode, headers: response.headers });
}
async function fixture(t, seed = false) {
  const directory = await mkdtemp(join(process.cwd(), 'tests', '.tmp-api-'));
  const server = await startServer({ dataDirectory: directory, port: 0, seed });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const session = await localFetch(server, '/api/session').then(response => response.json());
  const request = async (method, path, body, extra = {}) => {
    const response = await localFetch(server, path, { method, headers: { 'X-DrawMapping-Token': session.token, ...(body !== undefined ? { 'Content-Type': Buffer.isBuffer(body) ? 'application/zip' : 'application/json' } : {}), ...extra }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    return response;
  };
  return { directory, server, request, session };
}

test('domain rejects cycles, duplicate IDs, invalid scenes and executable asset references', () => {
  const map = createMap('course');
  assert.ok(validateMap(map).nodes.length > 10);
  assert.throws(() => validateMap({ ...map, orientation: 'diagonal' }), /Orientação/);
  assert.throws(() => validateMap({ ...map, nodes: [...map.nodes, map.nodes[0]] }), /inválido/);
  const cycle = structuredClone(map);
  cycle.nodes[1].parentId = cycle.nodes[2].id;
  assert.throws(() => validateMap(cycle), /ciclos/);
  assert.throws(() => validateMap({ ...map, scenes: [{ id: 'scene', nodeId: 'missing', title: 'Cena' }] }), /Cena/);
  map.nodes[0].image = 'javascript:alert(1)';
  assert.throws(() => validateMap(map), /Imagem/);
});

test('orientação é preservada ao salvar, exportar e importar', async t => {
  const { request } = await fixture(t);
  const original = await request('POST', '/api/maps', { template: 'course' }).then(r => r.json());
  const saved = await request('PUT', `/api/maps/${original.id}`, { ...original, orientation: 'right' }).then(r => r.json());
  assert.equal(saved.orientation, 'right');
  assert.equal((await request('GET', `/api/maps/${original.id}`).then(r => r.json())).orientation, 'right');
  const zip = Buffer.from(await request('GET', `/api/maps/${original.id}/export`).then(r => r.arrayBuffer()));
  assert.equal((await request('POST', '/api/import', zip).then(r => r.json())).orientation, 'right');
});

test('API persists documents, rejects stale edits, checkpoints, trashes and restores', async t => {
  const { request, directory } = await fixture(t);
  let response = await request('POST', '/api/maps', { template: 'course', title: 'Aula íntegra' });
  assert.equal(response.status, 201);
  const original = await response.json();
  const changed = { ...original, title: 'Novo título', nodes: original.nodes.map((node, index) => index === 0 ? { ...node, text: 'Raiz atualizada', notes: '<script>texto inerte</script>' } : node) };
  response = await request('PUT', `/api/maps/${original.id}`, changed);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.revision, 1);
  assert.equal(saved.nodes[0].notes, '<script>texto inerte</script>');
  assert.equal((await request('PUT', `/api/maps/${original.id}`, changed)).status, 409);
  const revisions = await request('GET', `/api/maps/${original.id}/revisions`).then(r => r.json());
  assert.equal(revisions.length, 1);
  response = await request('POST', `/api/maps/${original.id}/revisions/${revisions[0].id}/restore`);
  assert.equal((await response.json()).title, 'Aula íntegra');
  assert.equal((await request('DELETE', `/api/maps/${original.id}`)).status, 200);
  assert.equal((await request('GET', '/api/maps').then(r => r.json())).length, 0);
  assert.equal((await request('GET', '/api/trash').then(r => r.json())).length, 1);
  assert.equal((await request('POST', `/api/maps/${original.id}/restore`)).status, 200);
  assert.ok((await readFile(join(directory, 'library.sqlite'))).length > 0);
});

test('local session refuses missing token, hostile origin/Host and cross-site session read', async t => {
  const { server } = await fixture(t);
  assert.equal((await localFetch(server, '/api/maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await localFetch(server, '/api/session', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await localFetch(server, '/api/session', { headers: { host: 'attacker.example' } })).status, 403);
  assert.equal((await localFetch(server, '/api/session', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await localFetch(server, '/api/maps', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await localFetch(server, '/api/shutdown', { method: 'POST' })).status, 403);
});

test('pastas vazias persistem e são restauradas pelo backup', async t => {
  const { request, directory } = await fixture(t);
  assert.equal((await request('POST', '/api/folders', { name: 'Aulas' })).status, 201);
  assert.equal((await request('POST', '/api/folders', { name: 'aulas' })).status, 409);
  assert.equal((await request('POST', '/api/folders', { name: '  ' })).status, 400);
  assert.deepEqual(await request('GET', '/api/folders').then(r => r.json()), ['Aulas']);
  const saved = await request('POST', '/api/backups').then(r => r.json());
  const files = unzipSync(new Uint8Array(await readFile(join(directory, 'backups', saved.name))));
  const legacy = JSON.parse(strFromU8(files['snapshot.json'])); delete legacy.folders;
  files['snapshot.json'] = strToU8(JSON.stringify(legacy));
  await writeFile(join(directory, 'backups', 'backup-legacy.zip'), zipSync(files));
  assert.equal((await request('POST', '/api/folders', { name: 'Outra' })).status, 201);
  assert.equal((await request('POST', `/api/backups/${saved.name}/restore`)).status, 200);
  assert.deepEqual(await request('GET', '/api/folders').then(r => r.json()), ['Aulas']);
  const map = await request('POST', '/api/maps', { template: 'blank', folder: 'Aulas' }).then(r => r.json());
  assert.equal(map.folder, 'Aulas');
  assert.equal((await request('POST', '/api/maps', { template: 'blank', folder: 'Não existe' })).status, 400);
  assert.equal((await request('POST', '/api/backups/backup-legacy.zip/restore')).status, 200);
  assert.deepEqual(await request('GET', '/api/folders').then(r => r.json()), []);
});

test('managed image and portable ZIP roundtrip retain content and reject active/path content', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('POST', '/api/assets', { data: 'data:image/svg+xml;base64,PHN2Zy8+' })).status, 400);
  const image = await request('POST', '/api/assets', { data: `data:image/png;base64,${png.toString('base64')}` }).then(r => r.json());
  assert.match(image.id, /^[a-f0-9]{64}\.png$/);
  const map = await request('POST', '/api/maps', { template: 'blank' }).then(r => r.json());
  map.nodes[0].image = image.id;
  assert.equal((await request('PUT', `/api/maps/${map.id}`, map)).status, 200);
  const portable = Buffer.from(await request('GET', `/api/maps/${map.id}/export`).then(r => r.arrayBuffer()));
  const imported = await request('POST', '/api/import', portable).then(r => r.json());
  assert.notEqual(imported.id, map.id);
  assert.deepEqual(imported.nodes, map.nodes);
  const received = await request('GET', `/api/assets/${image.id}`);
  assert.equal(received.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await received.arrayBuffer()), png);
  const malicious = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'drawmapping', schemaVersion: 1 })), 'document.json': strToU8(JSON.stringify(map)), '../escape.txt': strToU8('no') }));
  assert.equal((await request('POST', '/api/import', malicious)).status, 400);
  const missingImage = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'drawmapping', schemaVersion: 1 })), 'document.json': strToU8(JSON.stringify(map)) }));
  assert.equal((await request('POST', '/api/import', missingImage)).status, 400);
  assert.throws(() => inspectImage(Buffer.from('<svg onload="alert(1)"></svg>')), /Use PNG/);
});

test('consistent backup restores maps/assets and preserves the pre-restore library', async t => {
  const { request, directory } = await fixture(t);
  const map = await request('POST', '/api/maps', { template: 'workshop' }).then(r => r.json());
  const { name } = await request('POST', '/api/backups').then(r => r.json());
  const stale = await request('PUT', `/api/maps/${map.id}`, { ...map, title: 'Depois do backup' }).then(r => r.json());
  await request('POST', '/api/maps', { template: 'blank' });
  assert.equal((await request('POST', `/api/backups/${name}/restore`)).status, 200);
  const maps = await request('GET', '/api/maps').then(r => r.json());
  assert.equal(maps.length, 1);
  assert.equal(maps[0].title, map.title);
  assert.ok(maps[0].revision > stale.revision);
  assert.equal((await request('PUT', `/api/maps/${map.id}`, stale)).status, 409);
  const backups = await request('GET', '/api/backups').then(r => r.json());
  assert.ok(backups.some(item => item.name.startsWith('before-restore-')));
  const snapshot = unzipSync(Buffer.from(await request('GET', `/api/backups/${name}`).then(r => r.arrayBuffer())));
  assert.equal(JSON.parse(strFromU8(snapshot['snapshot.json'])).maps.length, 1);
  // Corrupt archive validation must precede replacement of current documents.
  await writeFile(join(directory, 'backups', name), Buffer.from('corrupt backup'));
  assert.equal((await request('POST', `/api/backups/${name}/restore`)).status, 413);
  assert.equal((await request('GET', '/api/maps').then(r => r.json())).length, 1);
  assert.ok((await readdir(join(directory, 'backups'))).length >= 2);
});

test('reopening the database recovers saved revisions and images; demo seeds once', async t => {
  const directory = await mkdtemp(join(process.cwd(), 'tests', '.tmp-reopen-'));
  let server = await startServer({ dataDirectory: directory, port: 0 });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });
  const session = await localFetch(server, '/api/session').then(r => r.json());
  const maps = await localFetch(server, '/api/maps').then(r => r.json());
  assert.equal(maps.length, 1);
  assert.ok(maps[0].nodes.length >= 30);
  await localFetch(server, `/api/maps/${maps[0].id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-DrawMapping-Token': session.token }, body: JSON.stringify({ ...maps[0], title: 'Persistiu' }) });
  await server.close();
  server = await startServer({ dataDirectory: directory, port: 0 });
  const reopened = await localFetch(server, '/api/maps').then(r => r.json());
  assert.equal(reopened.length, 1);
  assert.equal(reopened[0].title, 'Persistiu');
  assert.equal(reopened[0].revision, 1);
});
