'use strict';
/**
 * Testa a ligação do Inno com a nuvem (cloud-storage), com o mesmo .env do Inno:
 * configuração, alcance do servidor, chave, envio, leitura e exclusão de um
 * arquivo de teste. Mostra em português onde parou.
 *
 * Uso (na raiz do inno, no servidor): node tools/nuvem/testa.js
 */
const path = require('path');
process.chdir(path.join(__dirname, '..', '..'));
const config = require('../../server/config');

const ok = (m) => console.log(`  ok  ${m}`);
const falha = (m, dica) => { console.log(`  ERRO ${m}`); if (dica) console.log(`       ${dica}`); process.exit(1); };

(async () => {
  console.log('Teste da nuvem do Inno\n');
  const url = String(config.nuvem.url || '').replace(/\/+$/, '');
  const chave = config.nuvem.apiKey || '';
  if (!url) falha('NUVEM_URL vazia', 'Preencha NUVEM_URL=https://cloud.x-star.com.br no .env (na pasta do Inno).');
  if (!chave) falha('NUVEM_API_KEY vazia', 'Preencha NUVEM_API_KEY no .env (a chave do Inno no config/clients.json do cloud-storage).');
  if (/\s/.test(chave) || /^["']|["']$/.test(chave)) falha('NUVEM_API_KEY tem espaço ou aspas', 'Deixe só a chave, sem aspas e sem espaços.');
  ok(`configuração: ${url} (chave de ${chave.length} caracteres${chave.length >= 16 ? `, termina em ...${chave.slice(-4)}` : ""})`);

  const chama = async (metodo, rota, o = {}) => {
    try {
      return await fetch(url + rota, Object.assign({ method: metodo, signal: AbortSignal.timeout(30000) }, o));
    } catch (e) {
      const causa = (e.cause && (e.cause.code || e.cause.message)) || e.message;
      falha(`não foi possível falar com ${url}${rota}: ${causa}`,
        'Confira o endereço, o DNS e se o servidor do Inno acessa a internet (curl ' + url + '/api/health).');
    }
  };
  const texto = async (r) => { const t = await r.text(); return t.length > 300 ? t.slice(0, 300) + '...' : t; };

  let r = await chama('GET', '/api/health');
  if (!r.ok) falha(`/api/health respondeu ${r.status}: ${await texto(r)}`, 'O endereço responde, mas não parece o cloud-storage (ou o Cloudflare bloqueou).');
  ok('servidor da nuvem responde (/api/health)');

  const H = { 'x-api-key': chave };
  r = await chama('GET', '/api/files', { headers: H });
  if (r.status === 401) falha('a nuvem recusou a chave (401 Não autorizado)', 'A chave do .env tem de ser igual a uma "key" do config/clients.json do cloud-storage.');
  if (r.status === 429) falha('a nuvem bloqueou por excesso de tentativas (429)', 'Espere alguns minutos e tente de novo.');
  if (!r.ok) falha(`listar arquivos respondeu ${r.status}: ${await texto(r)}`);
  const lista = await r.json();
  ok(`chave aceita: ${(lista.files || []).length} arquivo(s) deste cliente na nuvem`);

  const nome = `teste-inno/${Date.now()}.txt`;
  const fd = new FormData();
  fd.append('file', new Blob([`teste do Inno ${new Date().toISOString()}`], { type: 'text/plain' }), nome);
  r = await chama('POST', '/api/upload', { headers: H, body: fd });
  if (r.status === 413) falha('a nuvem recusou o tamanho do arquivo (413)', 'Aumente MAX_FILE_MB no .env do cloud-storage (o Cloudflare gratuito aceita até 100 MB).');
  const env = await r.json().catch(() => ({}));
  if (!r.ok || !env.id) falha(`envio respondeu ${r.status}: ${JSON.stringify(env)}`, 'Veja os logs do cloud-storage (docker compose logs). Pasta data sem permissão (chown 1001:1001 data) é causa comum.');
  if (env.file && env.file.name !== nome) falha(`a nuvem trocou o nome do arquivo: "${env.file.name}" em vez de "${nome}"`, 'O Inno precisa que o nome com "/" seja mantido.');
  ok(`envio: arquivo de teste gravado (id ${env.id})`);

  r = await chama('GET', `/api/files/${encodeURIComponent(env.id)}?download=1`, { headers: H });
  if (!r.ok) falha(`leitura respondeu ${r.status}: ${await texto(r)}`, 'Erro 500 na leitura costuma ser ENCRYPTION_KEY trocada no cloud-storage.');
  ok('leitura: arquivo de teste aberto');

  r = await chama('DELETE', `/api/files/${encodeURIComponent(env.id)}`, { headers: H });
  if (!r.ok) falha(`exclusão respondeu ${r.status}: ${await texto(r)}`);
  ok('exclusão: arquivo de teste apagado');

  console.log('\nA nuvem está funcionando com este .env. Se o envio na tela ainda falhar,');
  console.log('reinicie o Inno (pm2 restart inno) e veja o erro em logs/erros.log.');
})();
