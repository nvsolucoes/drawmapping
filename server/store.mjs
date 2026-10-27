import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, renameSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createMap, validateMap } from '../shared/model.mjs';

export function problem(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

export class MapStore {
  constructor(directory, { seed = true } = {}) {
    this.directory = directory;
    this.assetsDirectory = join(directory, 'assets');
    this.backupsDirectory = join(directory, 'backups');
    mkdirSync(this.assetsDirectory, { recursive: true });
    mkdirSync(this.backupsDirectory, { recursive: true });
    this.db = new DatabaseSync(join(directory, 'library.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS maps (id TEXT PRIMARY KEY, document TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS revisions (id TEXT PRIMARY KEY, map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE, document TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS revisions_map ON revisions(map_id, created_at);
      CREATE TABLE IF NOT EXISTS folders (name TEXT PRIMARY KEY);`);
    if (seed && !this.db.prepare('SELECT id FROM maps LIMIT 1').get()) this.insert(createMap('demo'));
  }

  close() { this.db.close(); }
  folders() { return this.db.prepare('SELECT name FROM folders ORDER BY name COLLATE NOCASE').all().map(row => row.name); }
  createFolder(name) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || Array.from(name).some(char => char.charCodeAt(0) < 32)) throw problem(400, 'Informe um nome de pasta válido com até 80 caracteres.');
    const clean = name.trim();
    if (this.folders().some(existing => existing.toLocaleLowerCase('pt-BR') === clean.toLocaleLowerCase('pt-BR')) || this.list().some(map => map.folder?.toLocaleLowerCase('pt-BR') === clean.toLocaleLowerCase('pt-BR'))) throw problem(409, 'Já existe uma pasta com esse nome.');
    this.db.prepare('INSERT INTO folders(name) VALUES(?)').run(clean);
    return { name: clean };
  }
  list(deleted = false) { return this.db.prepare('SELECT document FROM maps WHERE deleted = ? ORDER BY json_extract(document, \'$.updatedAt\') DESC').all(Number(deleted)).map(row => JSON.parse(row.document)); }
  get(id, includeDeleted = false) {
    const row = this.db.prepare('SELECT document, deleted FROM maps WHERE id = ?').get(id);
    if (!row || (row.deleted && !includeDeleted)) throw problem(404, 'Mapa não encontrado.');
    return JSON.parse(row.document);
  }
  insert(document, deleted = false) {
    const clean = validateMap(document);
    this.checkAssets(clean);
    this.db.prepare('INSERT INTO maps(id,document,deleted) VALUES(?,?,?)').run(clean.id, JSON.stringify(clean), Number(deleted));
    return clean;
  }
  checkAssets(document, available) {
    for (const node of document.nodes) {
      if (node.image && !(available ? available.has(node.image) : existsSync(join(this.assetsDirectory, node.image)))) throw problem(400, 'O mapa referencia uma imagem ausente.');
    }
  }
  checkpoint(document, force = false) {
    const last = this.db.prepare('SELECT created_at FROM revisions WHERE map_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(document.id);
    if (!force && last && Date.now() - Date.parse(last.created_at) < 300000) return;
    this.db.prepare('INSERT INTO revisions(id,map_id,document,created_at) VALUES(?,?,?,?)').run(randomUUID(), document.id, JSON.stringify(document), new Date().toISOString());
    this.db.prepare('DELETE FROM revisions WHERE map_id=? AND id NOT IN (SELECT id FROM revisions WHERE map_id=? ORDER BY created_at DESC, rowid DESC LIMIT 20)').run(document.id, document.id);
  }
  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  save(id, candidate) {
    let document;
    try { document = validateMap(candidate); } catch (error) { throw problem(400, error.message); }
    if (document.id !== id) throw problem(400, 'Identificador do mapa não corresponde à URL.');
    this.checkAssets(document);
    return this.transaction(() => {
      const previous = this.get(id);
      if (document.revision !== previous.revision) throw problem(409, 'Este mapa foi alterado em outra aba. Reabra a versão atual ou exporte suas alterações antes de continuar.');
      this.checkpoint(previous);
      const updated = { ...document, createdAt: previous.createdAt, updatedAt: new Date().toISOString(), revision: previous.revision + 1 };
      this.db.prepare('UPDATE maps SET document=? WHERE id=?').run(JSON.stringify(updated), id);
      return updated;
    });
  }
  duplicate(id) {
    const original = this.get(id);
    const now = new Date().toISOString();
    return this.insert({ ...original, id: randomUUID(), title: `${original.title} — cópia`.slice(0, 300), revision: 0, createdAt: now, updatedAt: now, favorite: false });
  }
  trash(id) {
    return this.transaction(() => {
      const document = this.get(id);
      this.checkpoint(document, true);
      this.db.prepare('UPDATE maps SET deleted=1 WHERE id=?').run(id);
      return { ok: true };
    });
  }
  restore(id) {
    const document = this.get(id, true);
    const updated = { ...document, revision: document.revision + 1, updatedAt: new Date().toISOString() };
    this.db.prepare('UPDATE maps SET deleted=0,document=? WHERE id=?').run(JSON.stringify(updated), id);
    return updated;
  }
  revisions(id) {
    this.get(id, true);
    return this.db.prepare('SELECT id, created_at, document FROM revisions WHERE map_id=? ORDER BY created_at DESC, rowid DESC').all(id).map(row => ({ id: row.id, createdAt: row.created_at, title: JSON.parse(row.document).title }));
  }
  restoreRevision(id, revisionId) {
    const previous = this.get(id);
    const row = this.db.prepare('SELECT document FROM revisions WHERE id=? AND map_id=?').get(revisionId, id);
    if (!row) throw problem(404, 'Versão não encontrada.');
    const candidate = { ...JSON.parse(row.document), revision: previous.revision };
    return this.transaction(() => {
      this.checkpoint(previous, true);
      return this.saveWithoutTransaction(id, candidate, previous);
    });
  }
  saveWithoutTransaction(id, candidate, previous) {
    this.checkAssets(candidate);
    const updated = { ...candidate, revision: previous.revision + 1, updatedAt: new Date().toISOString(), createdAt: previous.createdAt };
    this.db.prepare('UPDATE maps SET document=? WHERE id=?').run(JSON.stringify(updated), id);
    return updated;
  }
  snapshot() {
    return { folders: this.folders(), maps: this.db.prepare('SELECT document,deleted FROM maps').all().map(row => ({ document: JSON.parse(row.document), deleted: Boolean(row.deleted) })), revisions: this.db.prepare('SELECT id,map_id,document,created_at FROM revisions').all().map(row => ({ id: row.id, mapId: row.map_id, document: JSON.parse(row.document), createdAt: row.created_at })) };
  }
  replaceSnapshot(snapshot) {
    this.transaction(() => {
      const previousRevisions = new Map(this.db.prepare('SELECT id,document FROM maps').all().map(row => [row.id, JSON.parse(row.document).revision]));
      const now = new Date().toISOString();
      this.db.exec('DELETE FROM revisions; DELETE FROM maps; DELETE FROM folders;');
      for (const name of snapshot.folders ?? []) this.db.prepare('INSERT INTO folders(name) VALUES(?)').run(name);
      snapshot.maps.forEach(({ document, deleted }) => this.insert({ ...document, revision: Math.max(document.revision, previousRevisions.get(document.id) ?? -1) + 1, updatedAt: now }, deleted));
      const insert = this.db.prepare('INSERT INTO revisions(id,map_id,document,created_at) VALUES(?,?,?,?)');
      snapshot.revisions.forEach(row => insert.run(row.id, row.mapId, JSON.stringify(row.document), row.createdAt));
    });
  }
  putAsset(id, data) {
    const path = join(this.assetsDirectory, id);
    if (!existsSync(path)) {
      const temporary = join(this.assetsDirectory, `${id}.${randomUUID()}.tmp`);
      writeFileSync(temporary, data, { flag: 'wx' });
      renameSync(temporary, path);
    } else {
      const now = new Date();
      utimesSync(path, now, now);
    }
  }
  asset(id) {
    if (!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(id)) throw problem(404, 'Imagem não encontrada.');
    try { return readFileSync(join(this.assetsDirectory, id)); }
    catch { throw problem(404, 'Imagem não encontrada.'); }
  }
  backups() {
    return readdirSync(this.backupsDirectory).filter(name => /^(backup|automatic|before-restore)-[a-zA-Z0-9-]+\.zip$/.test(name)).map(name => { const stat = statSync(join(this.backupsDirectory, name)); return { name, createdAt: stat.mtime.toISOString(), size: stat.size }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
