'use strict';
/**
 * Copia a pasta MEDIA_ROOT inteira para a nuvem (cloud-storage), mantendo os
 * caminhos: "extras/12/2026/11/17/foto.png" vira o nome do arquivo na nuvem.
 * Pode rodar de novo: o que já está na nuvem é pulado. Não apaga nada da pasta.
 *
 * Uso (na raiz do inno, com NUVEM_URL e NUVEM_API_KEY no .env):
 *   node tools/nuvem/migra-media.js            copia
 *   node tools/nuvem/migra-media.js --simular  só mostra o que copiaria
 *   node tools/nuvem/migra-media.js --pasta extras   só uma subpasta
 */
const path = require('path');
process.chdir(path.join(__dirname, '..', '..'));
const config = require('../../server/config');
const arm = require('../../server/util/armazenamento');
const { tipo } = require('../../server/util/mime');

const args = process.argv.slice(2);
const simular = args.includes('--simular');
const iPasta = args.indexOf('--pasta');
const pasta = iPasta >= 0 ? args[iPasta + 1] : '';
const PARALELO = 4;

(async () => {
  if (!config.nuvem.url || !config.nuvem.apiKey) { console.error('Preencha NUVEM_URL e NUVEM_API_KEY no .env.'); process.exit(1); }
  console.log(`Pasta local: ${config.mediaRoot}${pasta ? '/' + pasta : ''}`);
  console.log(`Nuvem:       ${config.nuvem.url}`);
  const locais = await arm.origem.lista(pasta);
  const naNuvem = new Set(await arm.nuvem.lista(''));
  const faltam = locais.filter((r) => !naNuvem.has(r));
  console.log(`${locais.length} arquivos na pasta, ${locais.length - faltam.length} já na nuvem, ${faltam.length} a enviar.`);
  if (simular) { for (const r of faltam.slice(0, 50)) console.log('  ' + r); if (faltam.length > 50) console.log(`  ... e mais ${faltam.length - 50}`); return; }
  let ok = 0, erro = 0, bytes = 0, i = 0;
  const t0 = Date.now();
  const trabalha = async () => {
    while (i < faltam.length) {
      const rel = faltam[i++];
      try {
        const dados = await arm.origem.le(rel);
        await arm.nuvem.grava(rel, dados, tipo(rel));
        ok++; bytes += dados.length;
      } catch (e) { erro++; console.error(`  ERRO ${rel}: ${e.message}`); }
      if ((ok + erro) % 50 === 0) console.log(`  ${ok + erro}/${faltam.length} (${(bytes / 1048576).toFixed(1)} MB)`);
    }
  };
  await Promise.all(Array.from({ length: PARALELO }, trabalha));
  console.log(`Pronto em ${((Date.now() - t0) / 1000).toFixed(0)} s: ${ok} enviados (${(bytes / 1048576).toFixed(1)} MB), ${erro} com erro.`);
  if (erro) { console.log('Rode de novo para tentar os que deram erro.'); process.exit(2); }
})().catch((e) => { console.error(e.message); process.exit(1); });
