import { mkdir, open, readFile, stat, unlink, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const LOCK_NAME = '.drawmapping.lock';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function resolveDataDirectory(provided) {
  return path.resolve(provided || process.env.DRAWMAPPING_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'DrawMapping'));
}

export class InstanceRunningError extends Error {
  constructor(info) {
    super('O DrawMapping já está em execução para esta biblioteca.');
    this.name = 'InstanceRunningError';
    this.info = info;
  }
}

export async function readInstance(dataDirectory) {
  try {
    const info = JSON.parse(await readFile(path.join(dataDirectory, LOCK_NAME), 'utf8'));
    if (!info || !Number.isSafeInteger(info.pid) || info.pid < 1 || typeof info.instanceId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(info.instanceId)) return null;
    return info;
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

export async function acquireInstance(dataDirectory) {
  await mkdir(dataDirectory, { recursive: true });
  const lockPath = path.join(dataDirectory, LOCK_NAME);
  const info = { pid: process.pid, instanceId: randomUUID(), startedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(info)); }
      finally { await handle.close(); }
      if ((await readInstance(dataDirectory))?.instanceId !== info.instanceId) throw new Error('A inicialização perdeu a posse da biblioteca. Tente abrir novamente.');
      return {
        info,
        async publish(port) {
          info.port = port;
          info.url = `http://127.0.0.1:${port}`;
          const temporary = `${lockPath}.${info.instanceId}.tmp`;
          await writeFile(temporary, JSON.stringify(info), { flag: 'wx', mode: 0o600 });
          try { await rename(temporary, lockPath); }
          finally { await unlink(temporary).catch(() => {}); }
        },
        async release() {
          const current = await readInstance(dataDirectory);
          if (current?.instanceId === info.instanceId) {
            await unlink(lockPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
          }
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readInstance(dataDirectory);
      if (existing && !isProcessAlive(existing.pid)) {
        const recoveryPath = `${lockPath}.${existing.instanceId}.recover`;
        let recovery;
        try {
          recovery = await open(recoveryPath, 'wx', 0o600);
          const again = await readInstance(dataDirectory);
          if (again?.instanceId === existing.instanceId) await unlink(lockPath).catch(() => {});
        } catch (recoveryError) {
          if (recoveryError.code !== 'EEXIST') throw recoveryError;
          await delay(120);
        } finally {
          if (recovery) {
            await recovery.close();
            await unlink(recoveryPath).catch(() => {});
          }
        }
        continue;
      }
      if (existing?.url) throw new InstanceRunningError(existing);
      const metadata = await stat(lockPath).catch(() => null);
      if (!existing && metadata && Date.now() - metadata.mtimeMs > 15_000) {
        const recoveryPath = `${lockPath}.incomplete.recover`;
        let recovery;
        try {
          recovery = await open(recoveryPath, 'wx', 0o600);
          const currentMetadata = await stat(lockPath).catch(() => null);
          if (!await readInstance(dataDirectory) && currentMetadata?.ino === metadata.ino && currentMetadata?.mtimeMs === metadata.mtimeMs) await unlink(lockPath).catch(() => {});
        } catch (recoveryError) {
          if (recoveryError.code !== 'EEXIST') throw recoveryError;
        } finally {
          if (recovery) { await recovery.close(); await unlink(recoveryPath).catch(() => {}); }
        }
        continue;
      }
      await delay(120);
    }
  }
  throw new Error('O DrawMapping já está iniciando. Aguarde alguns segundos e abra novamente.');
}

export async function verifyInstance(info) {
  if (!info?.port || info.url !== `http://127.0.0.1:${info.port}` || !isProcessAlive(info.pid)) return false;
  try {
    const response = await fetch(`${info.url}/api/health`, { signal: AbortSignal.timeout(2500), redirect: 'error' });
    if (!response.ok) return false;
    const health = await response.json();
    return health.app === 'drawmapping' && health.pid === info.pid && health.instanceId === info.instanceId;
  } catch { return false; }
}
