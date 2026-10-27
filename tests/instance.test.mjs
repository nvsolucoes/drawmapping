import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, utimes } from 'node:fs/promises';
import path from 'node:path';
import { acquireInstance, readInstance, InstanceRunningError, resolveDataDirectory } from '../scripts/instance.mjs';

test('um único processo é dono da biblioteca, inclusive durante abertura simultânea', async (t) => {
  const directory = await mkdtemp(path.join(process.cwd(), 'tests', '.tmp-instance-lock-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const owner = await acquireInstance(directory);
  const second = acquireInstance(directory);
  await owner.publish(4587);
  await assert.rejects(second, InstanceRunningError);
  assert.equal((await readInstance(directory)).instanceId, owner.info.instanceId);
  await owner.release();
  assert.equal(await readInstance(directory), null);
});

test('recupera um lock de processo morto sem encerrar outros processos', async (t) => {
  const directory = await mkdtemp(path.join(process.cwd(), 'tests', '.tmp-instance-stale-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, '.drawmapping.lock'), JSON.stringify({ pid: 2_147_483_647, instanceId: 'stale', startedAt: '2020-01-01' }));
  const owner = await acquireInstance(directory);
  assert.equal(owner.info.pid, process.pid);
  await owner.release();
});

test('release não remove o lock de uma instância diferente', async (t) => {
  const directory = await mkdtemp(path.join(process.cwd(), 'tests', '.tmp-instance-owner-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const owner = await acquireInstance(directory);
  const filename = path.join(directory, '.drawmapping.lock');
  await writeFile(filename, JSON.stringify({ pid: process.pid, instanceId: 'different' }));
  await owner.release();
  assert.equal(JSON.parse(await readFile(filename, 'utf8')).instanceId, 'different');
});

test('diretório explícito é resolvido sem depender da pasta do projeto', () => {
  assert.equal(resolveDataDirectory('dados de teste'), path.resolve('dados de teste'));
});

test('recupera lock truncado antigo e publica endereço sem truncar o registro ativo', async (t) => {
  const directory = await mkdtemp(path.join(process.cwd(), 'tests', '.tmp-instance-truncated-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, '.drawmapping.lock');
  await writeFile(filename, '{"pid":');
  const old = new Date(Date.now() - 30_000); await utimes(filename, old, old);
  const owner = await acquireInstance(directory);
  await owner.publish(4587);
  const published = await readInstance(directory);
  assert.equal(published.url, 'http://127.0.0.1:4587');
  assert.equal(published.instanceId, owner.info.instanceId);
  await owner.release();
});
