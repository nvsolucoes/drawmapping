import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMap } from '../shared/model.mjs';
import { acquireInstance, resolveDataDirectory } from '../scripts/instance.mjs';
import { MapStore, problem } from './store.mjs';
import { decodeImageDataUrl } from './assets.mjs';
import { exportMap, importMap, createBackup, backupBytes, restoreBackup, maintainBackups, collectUnusedAssets } from './archive.mjs';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentTypes = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const zipName = title => [...title.replace(/[<>:"/\\|?*]/g, '')].filter(character => character.charCodeAt(0) > 31).join('').slice(0, 90) || 'mapa';

export async function startServer(options = {}) {
  const dataDirectory = resolveDataDirectory(options.dataDirectory);
  const instance = await acquireInstance(dataDirectory);
  const token = randomBytes(32).toString('hex');
  let port = Number(options.port ?? process.env.DRAWMAPPING_PORT ?? 4587);
  if (!Number.isInteger(port) || port < 0 || port > 65535) { await instance.release(); throw new Error('Porta inválida.'); }
  let store;
  let app;
  try {
    store = new MapStore(dataDirectory, { seed: options.seed !== false });
    app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024, trustProxy: false });
    app.addContentTypeParser('application/zip', { parseAs: 'buffer', bodyLimit: 64 * 1024 * 1024 }, (_request, body, done) => done(null, body));
    app.setErrorHandler((error, _request, reply) => {
      const status = Number(error.statusCode) || 500;
      if (status >= 500) console.error('[DrawMapping]', error.message);
      const message = status >= 500 ? 'Não foi possível concluir a operação. Confira espaço e permissões na pasta de dados e tente novamente.' : error.message;
      reply.code(status).send({ error: message });
    });
    app.addHook('onRequest', async (request, reply) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Referrer-Policy', 'no-referrer');
      reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host || '')) throw problem(403, 'Acesso permitido apenas pelo endereço local da aplicação.');
      const origin = request.headers.origin;
      if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)) throw problem(403, 'Origem não autorizada.');
      if (request.url.startsWith('/api/') && request.url !== '/api/health') {
        reply.header('Cache-Control', 'no-store');
        if (request.headers['sec-fetch-site'] === 'cross-site') throw problem(403, 'Origem não autorizada.');
        if (!['GET', 'HEAD'].includes(request.method) && request.headers['x-drawmapping-token'] !== token) throw problem(403, 'Sessão local expirada. Recarregue a página antes de continuar.');
      }
    });

    app.get('/api/health', async () => ({ app: 'drawmapping', version: '1.0.0', pid: process.pid, port, instanceId: instance.info.instanceId }));
    app.get('/api/session', async () => ({ token, dataDirectory, storageWarning: store.backups().reduce((sum, item) => sum + item.size, 0) > 2 * 1024 ** 3 ? 'Os backups ultrapassaram 2 GB. Revise as cópias manuais na pasta de dados.' : null }));
    app.post('/api/shutdown', async (_request, reply) => {
      reply.send({ ok: true });
      setTimeout(() => { void close().catch(error => console.error('[DrawMapping] Falha ao encerrar:', error.message)); }, 100);
    });
    app.get('/api/maps', async () => store.list());
    app.get('/api/folders', async () => store.folders());
    app.post('/api/folders', async (request, reply) => reply.code(201).send(store.createFolder(request.body?.name)));
    app.get('/api/trash', async () => store.list(true));
    app.get('/api/maps/:id', async request => store.get(request.params.id));
    app.post('/api/maps', async (request, reply) => {
      const { template = 'blank', title, folder = '' } = request.body || {};
      if (!['blank', 'course', 'workshop', 'demo'].includes(template) || (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 300))) throw problem(400, 'Modelo ou título inválido.');
      if (typeof folder !== 'string' || folder.length > 80 || (folder && !store.folders().includes(folder) && !store.list().some(map => map.folder === folder))) throw problem(400, 'Pasta não encontrada.');
      const document = store.insert({ ...createMap(template, title), folder });
      return reply.code(201).send(document);
    });
    app.put('/api/maps/:id', async request => store.save(request.params.id, request.body));
    app.post('/api/maps/:id/duplicate', async request => store.duplicate(request.params.id));
    app.delete('/api/maps/:id', async request => store.trash(request.params.id));
    app.post('/api/maps/:id/restore', async request => store.restore(request.params.id));
    app.get('/api/maps/:id/revisions', async request => store.revisions(request.params.id));
    app.post('/api/maps/:id/revisions/:revisionId/restore', async request => store.restoreRevision(request.params.id, request.params.revisionId));
    app.post('/api/assets', async request => {
      const image = decodeImageDataUrl(request.body?.data);
      store.putAsset(image.id, image.data);
      return { id: image.id };
    });
    app.get('/api/assets/:id', async (request, reply) => {
      const bytes = store.asset(request.params.id);
      return reply.type(contentTypes[request.params.id.split('.').at(-1)]).header('Cache-Control', 'private, max-age=31536000, immutable').send(bytes);
    });
    app.get('/api/maps/:id/export', async (request, reply) => {
      const document = store.get(request.params.id);
      return reply.type('application/zip').header('Content-Disposition', `attachment; filename="mapa.drawmap"; filename*=UTF-8''${encodeURIComponent(zipName(document.title))}.drawmap`).send(exportMap(store, document.id));
    });
    app.post('/api/import', async (request, reply) => reply.code(201).send(importMap(store, request.body)));
    app.get('/api/backups', async () => store.backups());
    app.post('/api/backups', async () => createBackup(store));
    app.get('/api/backups/:name', async (request, reply) => reply.type('application/zip').header('Content-Disposition', `attachment; filename="${request.params.name.replace(/[^a-zA-Z0-9.-]/g, '')}"`).send(backupBytes(store, request.params.name)));
    app.post('/api/backups/:name/restore', async request => restoreBackup(store, request.params.name));

    const dist = resolve(rootDirectory, 'dist');
    if (existsSync(resolve(dist, 'index.html'))) {
      await app.register(fastifyStatic, { root: dist, index: 'index.html', dotfiles: 'deny' });
      app.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Recurso não encontrado.' });
        if (!request.headers.accept?.includes('text/html')) return reply.code(404).send({ error: 'Arquivo não encontrado.' });
        return reply.sendFile('index.html');
      });
    } else {
      app.get('/', async (_request, reply) => reply.type('text/plain; charset=utf-8').send('DrawMapping: interface ainda não preparada. Execute npm run build uma vez.'));
    }

    const requestedPort = port;
    let listening = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await app.listen({ host: '127.0.0.1', port });
        port = app.server.address().port;
        listening = true;
        break;
      } catch (error) {
        if (error.code !== 'EADDRINUSE' || requestedPort === 0 || port === 65535) throw error;
        port++;
      }
    }
    if (!listening) throw new Error('Não foi possível encontrar uma porta local disponível.');
    await instance.publish(port);
    let closed = false;
    const maintenance = () => { try { maintainBackups(store); collectUnusedAssets(store); } catch (error) { console.warn('[DrawMapping] Manutenção não concluída:', error.message); } };
    const maintenanceTimer = setInterval(maintenance, 6 * 60 * 60 * 1000);
    maintenanceTimer.unref();
    const close = async () => {
      if (closed) return;
      closed = true;
      clearInterval(maintenanceTimer);
      try { await app.close(); }
      finally { try { store.close(); } finally { await instance.release(); } }
    };
    // Automatic backup is best effort: a backup error must not hide a usable library.
    maintenance();
    return { app, port, url: `http://127.0.0.1:${port}`, close };
  } catch (error) {
    try { if (app) await app.close(); } finally { try { if (store) store.close(); } finally { await instance.release(); } }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = key => { const index = process.argv.indexOf(key); return index < 0 ? undefined : process.argv[index + 1]; };
  startServer({ port: arg('--port'), dataDirectory: arg('--data-dir') }).then(server => {
    console.log(`\nDrawMapping pronto: ${server.url}\nUse Ctrl+C para encerrar este servidor.\n`);
    const stop = () => { server.close().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); }); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch(error => { console.error(`DrawMapping: ${error.message}`); process.exitCode = 1; });
}
