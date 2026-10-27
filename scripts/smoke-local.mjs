import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, cp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startServer } from '../server/index.mjs';
import { readInstance, verifyInstance } from './instance.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const report = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(check, label) {
  for (let index = 0; index < 120; index++) { const value = await check(); if (value) return value; await delay(100); }
  throw new Error(`Tempo esgotado: ${label}`);
}

const directory = await mkdtemp(path.join(artifacts, 'runtime-check-'));
const blocker = createServer();
await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(0, '127.0.0.1', resolve); });
let server;
try {
  const occupied = blocker.address().port;
  server = await startServer({ dataDirectory: path.join(directory, 'library'), port: occupied });
  assert.notEqual(server.port, occupied);
  const health = await fetch(`${server.url}/api/health`).then(response => response.json());
  assert.equal(health.app, 'drawmapping');
  const page = await fetch(server.url).then(response => response.text());
  assert.match(page, /<div id="root"><\/div>/);
  const session = await fetch(`${server.url}/api/session`).then(response => response.json());
  const response = await fetch(`${server.url}/api/maps`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DrawMapping-Token': session.token }, body: JSON.stringify({ template: 'course', title: 'Smoke HTTP local' }) });
  assert.equal(response.status, 201);
  report.push({ check: 'HTTP real, build servido, API e porta ocupada', result: 'PASS', port: server.port });
} finally {
  if (server) await server.close();
  await new Promise(resolve => blocker.close(resolve));
}

if (process.platform === 'win32') {
  const deployment = path.join(directory, 'Aplicativo com espaços');
  await mkdir(deployment);
  for (const name of ['server', 'shared', 'scripts', 'dist', 'Iniciar DrawMapping.bat', 'package.json']) await cp(path.join(root, name), path.join(deployment, name), { recursive: true });
  const dataDirectory = path.join(directory, 'Biblioteca com espaços');
  const launch = () => {
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${path.join(deployment, 'Iniciar DrawMapping.bat')}""`], { cwd: root, windowsVerbatimArguments: true, windowsHide: true, env: { ...process.env, DRAWMAPPING_DATA_DIR: dataDirectory, DRAWMAPPING_PORT: '0', DRAWMAPPING_NO_OPEN: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', bytes => { output += bytes.toString(); });
    child.stderr.on('data', bytes => { output += bytes.toString(); });
    child.on('error', error => { output += error.message; });
    return { child, output: () => output };
  };
  const first = launch();
  let owner;
  try {
    owner = await waitFor(async () => { const info = await readInstance(dataDirectory); return info && await verifyInstance(info) ? info : null; }, 'BAT iniciar servidor');
    const second = launch();
    await waitFor(() => second.child.exitCode !== null, 'segunda abertura finalizar');
    assert.equal(second.child.exitCode, 0, second.output());
    assert.match(second.output(), /já está aberto/);
    assert.equal((await readInstance(dataDirectory)).instanceId, owner.instanceId);
    assert.ok(!/npm install|npm ci/.test(first.output()));
    report.push({ check: 'BAT em caminho com espaços e reabertura da mesma instância sem npm', result: 'PASS' });
  } finally {
    if (owner && await verifyInstance(owner)) {
      const session = await fetch(`${owner.url}/api/session`).then(response => response.json());
      const response = await fetch(`${owner.url}/api/shutdown`, { method: 'POST', headers: { 'X-DrawMapping-Token': session.token } });
      assert.equal(response.status, 200); await response.json();
      await waitFor(async () => !await readInstance(dataDirectory), 'encerramento liberar biblioteca');
      await waitFor(() => first.child.exitCode !== null, 'BAT finalizar após encerramento');
      assert.equal(first.child.exitCode, 0, first.output());
      report.push({ check: 'encerramento autenticado, lock liberado e BAT sai normalmente', result: 'PASS' });
    } else {
      first.child.kill();
      console.error(first.output());
    }
  }
}

await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
await writeFile(path.join(artifacts, 'runtime-check.json'), JSON.stringify({ date: new Date().toISOString(), node: process.version, checks: report }, null, 2));
console.log(JSON.stringify(report, null, 2));
