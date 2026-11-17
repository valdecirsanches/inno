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

  // versão atual (Next.js): /api/health; versão antiga (server/, Express): /health.
  // Só informativo: a prova é listar os arquivos com a chave, logo abaixo.
  const saude = [];
  for (const rota of ['/api/health', '/health']) {
    const r0 = await chama('GET', rota);
    const t0 = (await texto(r0)).replace(/\s+/g, ' ');
    saude.push(`${rota} -> ${r0.status} ${t0.slice(0, 120)}`);
    if (r0.ok && /"status"\s*:\s*"ok"/.test(t0)) { ok(`servidor da nuvem responde em ${rota} (versão ${rota === '/health' ? 'antiga, server/ em Express' : 'atual, Next.js'} do cloud-storage)`); saude.length = 0; break; }
  }
  if (saude.length) { console.log('  aviso: nenhuma verificação de saúde do cloud-storage respondeu:'); for (const l of saude) console.log(`         ${l}`); }

  const H = { 'x-api-key': chave };
  let r = await chama('GET', '/api/files', { headers: H });
  if (r.status === 404) falha(`${url}/api/files não existe (404): ${await texto(r)}`, 'O programa que responde neste endereço não é o cloud-storage. Confira no túnel do Cloudflare para qual porta o domínio aponta e se o cloud-storage está rodando nela.');
  if (r.status === 401) falha('a nuvem recusou a chave (401 Não autorizado)', 'A chave do .env tem de ser igual a uma "key" do config/clients.json do cloud-storage.');
  if (r.status === 429) falha('a nuvem bloqueou por excesso de tentativas (429)', 'Espere alguns minutos e tente de novo.');
  if (!r.ok) falha(`listar arquivos respondeu ${r.status}: ${await texto(r)}`);
  const lista = await r.json();
  ok(`chave aceita: ${(lista.files || []).length} arquivo(s) deste cliente na nuvem`);

  const arm = require('../../server/util/armazenamento');
  const nome = arm.paraNuvem(`teste-inno/${Date.now()}.txt`);
  const fd = new FormData();
  fd.append('file', new Blob([`teste do Inno ${new Date().toISOString()}`], { type: 'text/plain' }), nome);
  r = await chama('POST', '/api/upload', { headers: H, body: fd });
  if (r.status === 413) falha('a nuvem recusou o tamanho do arquivo (413)', 'Aumente MAX_FILE_MB no .env do cloud-storage (o Cloudflare gratuito aceita até 100 MB).');
  const env = await r.json().catch(() => ({}));
  const id = env.id || (env.file && env.file.id);
  if (!r.ok || !id) falha(`envio respondeu ${r.status}: ${JSON.stringify(env)}`, 'Veja os logs do cloud-storage (docker compose logs). Pasta data sem permissão (chown 1001:1001 data) é causa comum.');
  const nomeVolta = env.file && (env.file.name !== undefined ? env.file.name : env.file.originalName);
  if (nomeVolta !== undefined && nomeVolta !== nome) falha(`a nuvem trocou o nome do arquivo: "${nomeVolta}" em vez de "${nome}"`, 'O Inno precisa que o nome seja mantido.');
  ok(`envio: arquivo de teste gravado (id ${id})`);

  r = await chama('GET', `/api/files/${encodeURIComponent(id)}?download=1`, { headers: H });
  if (!r.ok) falha(`leitura respondeu ${r.status}: ${await texto(r)}`, 'Erro 500 na leitura costuma ser ENCRYPTION_KEY trocada no cloud-storage.');
  ok('leitura: arquivo de teste aberto');

  r = await chama('DELETE', `/api/files/${encodeURIComponent(id)}`, { headers: H });
  if (!r.ok) falha(`exclusão respondeu ${r.status}: ${await texto(r)}`);
  ok('exclusão: arquivo de teste apagado');

  console.log('\nA nuvem está funcionando com este .env. Se o envio na tela ainda falhar,');
  console.log('reinicie o Inno (pm2 restart inno) e veja o erro em logs/erros.log.');
})();
