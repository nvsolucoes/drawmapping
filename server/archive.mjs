import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateMap } from '../shared/model.mjs';
import { inspectImage } from './assets.mjs';
import { problem } from './store.mjs';

const archiveLimits = {
  map: { compressed: 64 * 1024 * 1024, expanded: 128 * 1024 * 1024, entries: 6000 },
  backup: { compressed: 256 * 1024 * 1024, expanded: 256 * 1024 * 1024, entries: 60000 },
};
const MAX_BACKUP_TOPICS = 2_000_000;
const assetName = /^[a-f0-9]{64}\.(png|jpg|webp)$/;
const themeTokens = {
  studio: { background: '#F7F8F5', text: '#172026', surface: '#FFFFFF', accent: '#16634F' },
  midnight: { background: '#121A21', text: '#F3F6F7', surface: '#1B2832', accent: '#79D4B8' },
  didactic: { background: '#FFFDF6', text: '#192A3D', surface: '#FFFFFF', accent: '#356AD8' },
};

function unpack(input, kind) {
  const limits = archiveLimits[kind];
  if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array)) throw problem(400, 'Arquivo ZIP inválido.');
  if (input.length > limits.compressed || input.length < 22) throw problem(413, `Arquivo acima do limite de ${limits.compressed / 1024 / 1024} MB ou inválido.`);
  let total = 0, count = 0;
  let archive;
  try {
    archive = unzipSync(new Uint8Array(input), { filter: file => {
      count++;
      total += file.originalSize;
      if (count > limits.entries || total > limits.expanded || file.originalSize > limits.expanded || file.name.includes('..') || file.name.includes('\\') || file.name.startsWith('/') || /^[A-Za-z]:/.test(file.name)) throw new Error('ZIP contém caminhos ou tamanhos inválidos.');
      const safe = ['manifest.json', kind === 'map' ? 'document.json' : 'snapshot.json'].includes(file.name) || /^assets\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(file.name) || file.name === 'assets/';
      if (!safe) throw new Error('ZIP contém arquivos não suportados.');
      if (file.name.startsWith('assets/') && file.originalSize > 8 * 1024 * 1024) throw new Error('Imagem acima de 8 MB.');
      return file.name !== 'assets/';
    } });
  } catch (error) { throw problem(400, `Não foi possível abrir o arquivo: ${error.message}`); }
  let manifest;
  try { manifest = JSON.parse(strFromU8(archive['manifest.json'])); } catch { throw problem(400, 'Manifesto do arquivo ausente ou inválido.'); }
  if (manifest?.format !== (kind === 'map' ? 'drawmapping' : 'drawmapping-backup') || manifest.schemaVersion !== 1) throw problem(400, 'Formato ou versão de arquivo não suportados.');
  const assets = new Map();
  for (const [name, value] of Object.entries(archive)) {
    if (!name.startsWith('assets/')) continue;
    const image = inspectImage(value);
    const storedName = name.slice(7);
    if (storedName !== image.id) throw problem(400, 'A imagem não corresponde ao identificador do arquivo.');
    assets.set(image.id, image.data);
  }
  return { archive, manifest, assets };
}

function parseFile(archive, name) {
  try { return JSON.parse(strFromU8(archive[name])); }
  catch { throw problem(400, `Conteúdo inválido em ${name}.`); }
}

function getImages(documents) { return new Set(documents.flatMap(document => document.nodes.flatMap(node => node.image ? [node.image] : []))); }

function capacityError(kind) {
  return problem(413, kind === 'backup' ? 'A biblioteca excede o limite de backup (256 MB ou 2 milhões de tópicos incluindo histórico). Exporte os mapas separadamente; nenhuma cópia incompleta foi criada.' : 'Este mapa excede o limite portátil (64 MB compactados ou 128 MB expandidos). Reduza imagens ou divida o conteúdo.');
}

function addAssets(store, files, documents, kind) {
  const limits = archiveLimits[kind];
  let total = Object.values(files).reduce((sum, file) => sum + file.byteLength, 0);
  let count = Object.keys(files).length;
  if (total > limits.expanded) throw capacityError(kind);
  for (const image of getImages(documents)) {
    const bytes = store.asset(image); total += bytes.length; count++;
    if (total > limits.expanded || count > limits.entries) throw capacityError(kind);
    files[`assets/${image}`] = bytes;
  }
}

function pack(files, kind) {
  const output = Buffer.from(zipSync(files, { level: 6 }));
  if (output.length > archiveLimits[kind].compressed) throw capacityError(kind);
  return output;
}

export function exportMap(store, mapId) {
  const document = store.get(mapId);
  const files = { 'manifest.json': strToU8(JSON.stringify({ format: 'drawmapping', schemaVersion: 1, themeTokens: themeTokens[document.theme] })), 'document.json': strToU8(JSON.stringify(document)) };
  addAssets(store, files, [document], 'map');
  return pack(files, 'map');
}

export function importMap(store, bytes) {
  const { archive, assets } = unpack(bytes, 'map');
  let document;
  try { document = validateMap(parseFile(archive, 'document.json')); } catch (error) { throw problem(400, error.message); }
  store.checkAssets(document, new Set(assets.keys()));
  const now = new Date().toISOString();
  const imported = { ...document, id: randomUUID(), revision: 0, createdAt: now, updatedAt: now, favorite: false };
  for (const [id, data] of assets) store.putAsset(id, data);
  return store.insert(imported);
}

export function createBackup(store, prefix = 'backup') {
  // Snapshot and asset reads are synchronous: no writer can interleave on this process.
  const snapshot = store.snapshot();
  const documents = [...snapshot.maps.map(row => row.document), ...snapshot.revisions.map(row => row.document)];
  if (snapshot.maps.length > 10000 || snapshot.revisions.length > 200000 || documents.reduce((sum, document) => sum + document.nodes.length, 0) > MAX_BACKUP_TOPICS) throw capacityError('backup');
  const files = { 'manifest.json': strToU8(JSON.stringify({ format: 'drawmapping-backup', schemaVersion: 1, createdAt: new Date().toISOString() })), 'snapshot.json': strToU8(JSON.stringify(snapshot)) };
  addAssets(store, files, documents, 'backup');
  const output = pack(files, 'backup');
  const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.zip`;
  const temporary = join(store.backupsDirectory, `${name}.tmp`);
  writeFileSync(temporary, output, { flag: 'wx' });
  renameSync(temporary, join(store.backupsDirectory, name));
  return { name };
}

export function backupBytes(store, name) {
  if (!store.backups().some(item => item.name === name)) throw problem(404, 'Backup não encontrado.');
  return readFileSync(join(store.backupsDirectory, name));
}

export function restoreBackup(store, name) {
  const { archive, assets } = unpack(backupBytes(store, name), 'backup');
  const candidate = parseFile(archive, 'snapshot.json');
  if (!candidate || !Array.isArray(candidate.maps) || !Array.isArray(candidate.revisions) || candidate.maps.length > 10000 || candidate.revisions.length > 200000) throw problem(400, 'Biblioteca de backup inválida.');
  const mapIds = new Set(), revisionIds = new Set();
  let nodes = 0;
  const available = new Set(assets.keys());
  let snapshot;
  try {
    snapshot = {
      folders: (() => {
        if (candidate.folders === undefined) return [];
        if (!Array.isArray(candidate.folders) || candidate.folders.length > 10000) throw new Error('Pastas do backup inválidas.');
        const unique = new Set();
        return candidate.folders.map(name => {
          if (typeof name !== 'string' || !name.trim() || name !== name.trim() || name.length > 80 || Array.from(name).some(char => char.charCodeAt(0) < 32) || unique.has(name.toLocaleLowerCase('pt-BR'))) throw new Error('Pastas do backup inválidas.');
          unique.add(name.toLocaleLowerCase('pt-BR')); return name;
        });
      })(),
      maps: candidate.maps.map(row => {
        const document = validateMap(row?.document);
        if (mapIds.has(document.id) || typeof row.deleted !== 'boolean') throw new Error('Mapas duplicados ou inválidos.');
        mapIds.add(document.id); nodes += document.nodes.length;
        store.checkAssets(document, available);
        return { document, deleted: row.deleted };
      }),
      revisions: candidate.revisions.map(row => {
        const document = validateMap(row?.document);
        if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(row.id) || revisionIds.has(row.id) || row.mapId !== document.id || !mapIds.has(row.mapId) || !Number.isFinite(Date.parse(row.createdAt))) throw new Error('Histórico de backup inválido.');
        revisionIds.add(row.id); nodes += document.nodes.length;
        store.checkAssets(document, available);
        return { id: row.id, mapId: row.mapId, document, createdAt: row.createdAt };
      }),
    };
    if (nodes > MAX_BACKUP_TOPICS) throw capacityError('backup');
  } catch (error) { throw problem(400, error.message); }
  // Full validation precedes any changes. Restore is one SQLite transaction; old bytes remain recoverable.
  createBackup(store, 'before-restore');
  for (const [id, data] of assets) store.putAsset(id, data);
  store.replaceSnapshot(snapshot);
  return { ok: true };
}

export function maintainBackups(store) {
  const existing = store.backups().filter(item => item.name.startsWith('automatic-'));
  const today = new Date().toISOString().slice(0, 10);
  if (!existing.some(item => item.name.startsWith(`automatic-${today}`))) createBackup(store, 'automatic');
  const automatic = store.backups().filter(item => item.name.startsWith('automatic-'));
  const keep = new Set(automatic.slice(0, 7).map(item => item.name));
  const weeks = new Set();
  for (const item of automatic) {
    const week = Math.floor(Date.parse(item.createdAt) / (7 * 86400000));
    if (!weeks.has(week) && weeks.size < 4) { weeks.add(week); keep.add(item.name); }
  }
  for (const item of automatic) if (!keep.has(item.name)) unlinkSync(join(store.backupsDirectory, item.name));
}

export function collectUnusedAssets(store) {
  const snapshot = store.snapshot();
  const used = getImages([...snapshot.maps.map(row => row.document), ...snapshot.revisions.map(row => row.document)]);
  // A retained backup pins every image it contains. Corrupt backup => retain all assets defensively.
  try {
    for (const item of store.backups()) {
      const { assets } = unpack(backupBytes(store, item.name), 'backup');
      for (const name of assets.keys()) used.add(name);
    }
  } catch { return; }
  // Upload and autosave are separate requests. Keep fresh uploads while an editor may still reference them.
  const gracePeriod = 24 * 60 * 60 * 1000;
  for (const name of readdirSync(store.assetsDirectory)) {
    const filename = join(store.assetsDirectory, name);
    if (assetName.test(name) && !used.has(name) && Date.now() - statSync(filename).mtimeMs > gracePeriod) unlinkSync(filename);
  }
}
