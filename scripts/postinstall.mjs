import { createWindowsShortcut } from './shortcut.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const globalRoot = process.env.npm_config_prefix && resolve(process.env.npm_config_prefix, 'node_modules', 'drawmapping');
const isDirectWindowsInstall = process.platform === 'win32' && globalRoot && root.toLowerCase() === globalRoot.toLowerCase();
const isDirectSourceInstall = process.platform === 'win32' && process.argv.includes('--after-build') && process.env.npm_command === 'install' && process.env.npm_config_global !== 'true' && !process.env.CI && process.env.INIT_CWD && resolve(process.env.INIT_CWD).toLowerCase() === root.toLowerCase();
if (((process.env.npm_config_global === 'true' && isDirectWindowsInstall) || isDirectSourceInstall) && process.env.DRAWMAPPING_NO_SHORTCUT !== '1') {
  try {
    const result = createWindowsShortcut();
    if (!result.skipped) console.log(`Atalho criado: ${result.path}`);
  } catch (error) {
    console.warn(`DrawMapping foi instalado, mas o atalho não pôde ser criado: ${error.message}\nExecute drawmapping atalho para tentar novamente.`);
  }
}
