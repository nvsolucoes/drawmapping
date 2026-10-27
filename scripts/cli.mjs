#!/usr/bin/env node
import { createWindowsShortcut } from './shortcut.mjs';

const command = process.argv[2] ?? 'iniciar';
if (command === 'iniciar' || command === 'start') {
  await import('./launch.mjs');
} else if (command === 'parar' || command === 'stop') {
  await import('./stop.mjs');
} else if (command === 'atalho' || command === 'shortcut') {
  try {
    const result = createWindowsShortcut();
    console.log(result.skipped ? result.message : `Atalho criado: ${result.path}`);
  } catch (error) { console.error(`Não foi possível criar o atalho: ${error.message}`); process.exitCode = 1; }
} else if (command === '--help' || command === '-h' || command === 'ajuda') {
  console.log('DrawMapping — mapas mentais locais\n\n  drawmapping          Inicia o servidor e abre o navegador\n  drawmapping parar    Encerra a instância da biblioteca\n  drawmapping atalho   Cria o atalho na área de trabalho do Windows');
} else {
  console.error('Comando desconhecido. Use drawmapping --help.'); process.exitCode = 1;
}
