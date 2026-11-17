'use strict';
/**
 * Testa a ligação do Inno com a nuvem, com o mesmo .env e o mesmo código do Inno:
 * configuração, alcance do servidor, tabela inno_nuvem no banco, envio e leitura
 * de um arquivo de teste. Mostra em português onde parou.
 *
 * Uso (na raiz do inno, no servidor): node tools/nuvem/testa.js
 */
const path = require('path');
process.chdir(path.join(__dirname, '..', '..'));
const config = require('../../server/config');

const ok = (m) => console.log(`  ok  ${m}`);
const falha = async (m, dica) => {
  console.log(`  ERRO ${m}`);
  if (dica) console.log(`       ${dica}`);
  try { await require('../../server/db').knex.destroy(); } catch (e) { /* */ }
  process.exit(1);
};

(async () => {
  console.log('Teste da nuvem do Inno\n');
  const url = String(config.nuvem.url || '').replace(/\/+$/, '');
  const tipo = String(config.nuvem.tipo || 'simples').toLowerCase();
  if (!url) await falha('NUVEM_URL vazia', 'Preencha NUVEM_URL no .env (na pasta do Inno), ex.: NUVEM_URL=http://127.0.0.1:5190');
  if (!['simples', 'cloud-storage'].includes(tipo)) await falha(`NUVEM_TIPO="${tipo}" desconhecido`, 'Use NUVEM_TIPO=simples (a nuvem de ~/apps/nuvem) ou NUVEM_TIPO=cloud-storage.');
  ok(`configuração: ${url} (tipo ${tipo})`);

  // o servidor responde?
  try {
    const r = await fetch(url + (tipo === 'simples' ? '/upload' : '/api/health'), { method: 'GET', signal: AbortSignal.timeout(15000) });
    ok(`servidor responde (HTTP ${r.status})`);
  } catch (e) {
    await falha(`não foi possível falar com ${url}: ${(e.cause && (e.cause.code || e.cause.message)) || e.message}`, 'Confira o endereço e a porta, e se a nuvem está rodando (ex.: pm2 ls, ss -ltnp).');
  }

  const db = require('../../server/db');
  const arm = require('../../server/util/armazenamento');
  try { await arm.lista('teste-inno'); ok(`tabela ${arm.TABELA} pronta no banco`); } catch (e) { await falha(e.message); }

  const rel = `teste-inno/${Date.now()}.txt`;
  const conteudo = Buffer.from(`teste do Inno ${new Date().toISOString()}`);
  try { await arm.grava(rel, conteudo, 'text/plain'); } catch (e) { await falha(`envio: ${e.message}`, 'Veja o log da nuvem (pm2 logs ou o terminal dela).'); }
  ok('envio: arquivo de teste gravado na nuvem');

  let volta;
  try { volta = await arm.le(rel); } catch (e) { await falha(`leitura: ${e.message}`); }
  if (!volta || !volta.equals(conteudo)) await falha('leitura: o arquivo voltou diferente do enviado', 'A nuvem pode estar com outra chave de criptografia.');
  ok('leitura: o arquivo voltou igual ao enviado');

  await arm.exclui(rel);
  ok(tipo === 'simples' ? 'registro de teste apagado (essa nuvem não apaga arquivos: um .txt pequeno fica lá)' : 'arquivo de teste apagado');

  console.log('\nA nuvem está funcionando com este .env. Agora:');
  console.log('  node tools/nuvem/migra-media.js   (copia as imagens antigas)');
  console.log('  pm2 restart inno');
  await db.knex.destroy();
})();
