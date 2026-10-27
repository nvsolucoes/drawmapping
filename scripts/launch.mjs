import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { InstanceRunningError, resolveDataDirectory, verifyInstance } from './instance.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const noOpen = process.argv.includes('--no-open') || process.env.DRAWMAPPING_NO_OPEN === '1';

function openBrowser(url) {
  if (noOpen) return;
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.log(`Abra este endereço no navegador: ${url}`));
  child.unref();
}

async function main() {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && (minor < 11 || (minor === 11 && patch < 1)))) {
    throw new Error('O DrawMapping precisa do Node.js 24.11.1 ou superior. Instale a versão LTS em https://nodejs.org e abra novamente.');
  }
  await access(path.join(root, 'dist', 'index.html')).catch(() => {
    throw new Error('A interface ainda não foi preparada. Execute "Preparar DrawMapping.bat" uma vez e tente novamente.');
  });
  process.chdir(root);
  const { startServer } = await import('../server/index.mjs');
  const dataDirectory = resolveDataDirectory();
  let server;
  try {
    server = await startServer({ dataDirectory, port: Number(process.env.DRAWMAPPING_PORT || 4587) });
  } catch (error) {
    if (!(error instanceof InstanceRunningError)) throw error;
    if (!await verifyInstance(error.info)) {
      throw new Error('Há uma instância registrada, mas ela ainda não respondeu como DrawMapping. Aguarde e tente novamente. Nenhum processo foi encerrado.', { cause: error });
    }
    console.log(`DrawMapping já está aberto: ${error.info.url}`);
    openBrowser(error.info.url);
    return;
  }
  console.log('\n  DrawMapping · seu estúdio de ideias\n');
  console.log(`  Abra no navegador: ${server.url}`);
  console.log(`  Seus mapas: ${dataDirectory}`);
  console.log('\n  Mantenha esta janela aberta durante o uso.');
  console.log('  Para encerrar com segurança, pressione Ctrl+C.\n');
  openBrowser(server.url);
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    console.log('\nEncerrando o DrawMapping...');
    try { await server.close(); process.exitCode = 0; }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

main().catch((error) => {
  console.error('\nNão foi possível abrir o DrawMapping.');
  console.error(error.code === 'ERR_MODULE_NOT_FOUND' ? 'Dependências ausentes. Execute "Preparar DrawMapping.bat" uma vez.' : error.message);
  process.exitCode = 1;
});
