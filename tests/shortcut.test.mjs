import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('atalho Windows é criado no destino e não substitui atalho de terceiros', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(join(process.cwd(), 'tests', '.tmp-shortcut-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  const env = { ...process.env, DRAWMAPPING_DESKTOP_DIR: directory };
  const cli = () => spawnSync(process.execPath, ['scripts/cli.mjs', 'atalho'], { cwd: process.cwd(), env, encoding: 'utf8' });
  assert.equal(cli().status, 0);
  const inspect = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $env:DRAWMAPPING_DESKTOP_DIR "DrawMapping.lnk")); @{target=$s.TargetPath;arguments=$s.Arguments;description=$s.Description;windowStyle=$s.WindowStyle} | ConvertTo-Json -Compress'], { env, encoding: 'utf8', windowsHide: true });
  assert.equal(inspect.status, 0);
  const shortcut = JSON.parse(inspect.stdout);
  assert.equal(shortcut.target.toLowerCase(), process.execPath.toLowerCase());
  assert.match(shortcut.arguments, /scripts[\\/]launch\.mjs/);
  assert.equal(shortcut.description, 'DrawMapping - servidor local');
  assert.equal(shortcut.windowStyle, 7);
  assert.equal(cli().status, 0);
  const change = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $env:DRAWMAPPING_DESKTOP_DIR "DrawMapping.lnk")); $s.Description="Outro aplicativo"; $s.Save()'], { env, encoding: 'utf8', windowsHide: true });
  assert.equal(change.status, 0);
  assert.notEqual(cli().status, 0);
});
