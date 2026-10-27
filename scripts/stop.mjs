import { readInstance, resolveDataDirectory, verifyInstance } from './instance.mjs';

async function stop() {
  const info = await readInstance(resolveDataDirectory());
  if (!info) { console.log('O DrawMapping não está aberto para esta biblioteca.'); return; }
  if (!await verifyInstance(info)) throw new Error('A instância registrada não respondeu como DrawMapping. Nenhum processo foi encerrado.');
  const session = await fetch(`${info.url}/api/session`, { signal: AbortSignal.timeout(3000) }).then(response => response.json());
  const response = await fetch(`${info.url}/api/shutdown`, { method: 'POST', headers: { 'X-DrawMapping-Token': session.token }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Não foi possível encerrar o servidor. Salve os mapas e use Ctrl+C na janela do servidor.');
  console.log('DrawMapping encerrando com segurança. Os mapas já gravados permanecem no computador.');
}
stop().catch(error => { console.error(error.message); process.exitCode = 1; });
