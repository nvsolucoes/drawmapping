import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function createWindowsShortcut() {
  if (process.platform !== 'win32') return { skipped: true, message: 'O atalho automático está disponível no Windows.' };
  const script = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$desktop = if ($env:DRAWMAPPING_DESKTOP_DIR) { $env:DRAWMAPPING_DESKTOP_DIR } else { [Environment]::GetFolderPath('DesktopDirectory') }
if (-not $desktop -or -not (Test-Path -LiteralPath $desktop -PathType Container)) { throw 'Área de trabalho não encontrada.' }
$path = Join-Path $desktop 'DrawMapping.lnk'
$shell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $path) {
  $existing = $shell.CreateShortcut($path)
  if ($existing.Description -ne 'DrawMapping - servidor local') { throw 'Já existe um atalho DrawMapping.lnk não criado pelo aplicativo; ele não foi alterado.' }
}
$shortcut = $shell.CreateShortcut($path)
$shortcut.TargetPath = $env:DRAWMAPPING_SHORTCUT_NODE
$shortcut.Arguments = '"' + $env:DRAWMAPPING_SHORTCUT_LAUNCH + '"'
$shortcut.WorkingDirectory = $env:DRAWMAPPING_SHORTCUT_ROOT
$shortcut.IconLocation = $env:DRAWMAPPING_SHORTCUT_ICON + ',0'
$shortcut.WindowStyle = 7
$shortcut.Description = 'DrawMapping - servidor local'
$shortcut.Save()
Write-Output $path
`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, DRAWMAPPING_SHORTCUT_NODE: process.execPath, DRAWMAPPING_SHORTCUT_LAUNCH: resolve(root, 'scripts/launch.mjs'), DRAWMAPPING_SHORTCUT_ROOT: root, DRAWMAPPING_SHORTCUT_ICON: resolve(root, 'public/drawmapping.ico') },
  });
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.error?.message || 'Não foi possível criar o atalho.').trim());
  return { skipped: false, path: result.stdout.trim() };
}
