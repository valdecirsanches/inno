'use strict';
/**
 * Recupera imagens e anexos espalhados em pastas antigas e coloca cada um no
 * prontuário do paciente: o arquivo vai para a nuvem e ganha um registro em
 * tb_extra (Imagens e anexos), que aparece no AppClinic e no Inno.
 *
 * Cada pasta informada deve ter uma subpasta por paciente, com o id do paciente
 * no nome (ex.: .../media/extra/123/...). Dentro dela os arquivos podem estar em
 * qualquer nível (ano/mês/dia, ou direto).
 *
 * Uso (na raiz do inno, com o mesmo .env do Inno):
 *   node tools/nuvem/recupera-imagens.js --simular <pasta> [<pasta> ...]   mostra o que faria
 *   node tools/nuvem/recupera-imagens.js <pasta> [<pasta> ...]             recupera
 *
 * - O arquivo mantém a mesma estrutura de pastas e o mesmo nome da origem, como no
 *   AppClinic: .../extras/123/2024/05/10/foto.png fica extras/123/2024/05/10/foto.png
 *   no banco e na nuvem (fácil de achar e de restaurar). Só se esse caminho já estiver
 *   ocupado por outro arquivo (conteúdo diferente) o nome ganha um sufixo, como no Django.
 * - A data do registro vem das pastas (ano/mês/dia) ou, sem elas, da data do arquivo.
 * - O registro aponta para a última consulta do paciente (e o médico dela), como o
 *   "rastrear" do AppClinic; paciente sem consulta fica sem consulta/médico.
 * - Arquivo que já tem registro em Imagens e anexos com o mesmo caminho (a pasta é
 *   uma media/extras do AppClinic: extras/<paciente>/<ano>/<mês>/<dia>/<nome>) não
 *   ganha registro novo: só é copiado para a nuvem com esse caminho, se ainda não estiver.
 * - Pode rodar de novo: arquivo igual (mesmo conteúdo) já recuperado para o mesmo
 *   paciente é pulado. Nada é apagado nem alterado nas pastas de origem.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
process.chdir(path.join(__dirname, '..', '..'));
const config = require('../../server/config');
const db = require('../../server/db');
const arm = require('../../server/util/armazenamento');
const { tipo: tipoMime } = require('../../server/util/mime');

const args = process.argv.slice(2);
const simular = args.includes('--simular');
const pastas = args.filter((a) => !a.startsWith('--'));
const IGNORA = new Set(['thumbs.db', 'desktop.ini', '.ds_store']);
const col = (m, a) => db.coluna(m, a);

const p2 = (n) => String(n).padStart(2, '0');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** todos os arquivos abaixo de dir (caminho absoluto) */
function arquivosDe(dir) {
  const out = [];
  const anda = (d) => {
    let itens;
    try { itens = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { console.log(`  aviso: não consegui ler ${d}: ${e.code || e.message}`); return; }
    for (const i of itens) {
      const p = path.join(d, i.name);
      if (i.isDirectory()) anda(p);
      else if (i.isFile() && !i.name.startsWith('.') && !IGNORA.has(i.name.toLowerCase())) out.push(p);
    }
  };
  anda(dir);
  return out;
}

/** data do arquivo: pelas pastas .../AAAA/MM/DD/arquivo, ou pela data de modificação */
function dataDe(abs, relNoPaciente) {
  const partes = relNoPaciente.split('/').slice(0, -1);
  for (let i = 0; i + 2 < partes.length; i++) {
    const [a, m, d] = partes.slice(i, i + 3).map(Number);
    if (/^\d{4}$/.test(partes[i]) && a >= 1990 && a <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return { a, m, d, hora: '00:00:00' };
  }
  const t = fs.statSync(abs).mtime;
  return { a: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), hora: `${p2(t.getHours())}:${p2(t.getMinutes())}:${p2(t.getSeconds())}` };
}

(async () => {
  if (!pastas.length) { console.log('Informe ao menos uma pasta. Ex.: node tools/nuvem/recupera-imagens.js --simular /home/sanches/apps/pyton/appclinic/media/extra'); process.exit(1); }
  if (!config.nuvem.url) { console.error('Preencha NUVEM_URL no .env.'); process.exit(1); }
  console.log(`${simular ? 'SIMULAÇÃO (nada é gravado)' : 'Recuperação'} -> nuvem ${config.nuvem.url}\n`);

  // o que já está na nuvem, por paciente, para não duplicar: compara o conteúdo (sha256),
  // baixando da nuvem só os arquivos com o mesmo tamanho (o tamanho fica em inno_nuvem)
  const vistosNaRodada = new Map();   // pac -> Set(sha) do que esta rodada já tratou
  const hashDaNuvem = new Map();      // caminho -> sha
  const jaEsta = async (pac, dados, h) => {
    if (!vistosNaRodada.has(pac)) vistosNaRodada.set(pac, new Set());
    if (vistosNaRodada.get(pac).has(h)) return true;
    const mesmos = await db.knex(arm.TABELA).select('caminho').where('tamanho', dados.length)
      .andWhere('caminho', 'like', `extras/${pac}/%`).catch(() => []);
    for (const { caminho } of mesmos) {
      if (!hashDaNuvem.has(caminho)) {
        const d = await arm.naNuvem.le(caminho).catch(() => null);
        hashDaNuvem.set(caminho, d ? sha(d) : null);
      }
      if (hashDaNuvem.get(caminho) === h) return true;
    }
    return false;
  };

  const P = 'TbPacientes', AG = 'TbAgendaCons', EX = 'TbExtra';
  const resumo = { arquivos: 0, recuperados: 0, repetidos: 0, comRegistro: 0, semPaciente: 0, foraDePadrao: 0, erros: 0, bytes: 0 };
  const pacientesSemCadastro = new Set();
  for (const base of pastas) {
    const raiz = path.resolve(base);
    if (!fs.existsSync(raiz)) { console.log(`Pasta não existe: ${raiz}`); continue; }
    console.log(`Pasta ${raiz}`);
    for (const abs of arquivosDe(raiz)) {
      resumo.arquivos++;
      const rel = path.relative(raiz, abs).split(path.sep).join('/');
      const [pasta1, ...resto] = rel.split('/');
      const pac = /^\d+$/.test(pasta1) ? parseInt(pasta1, 10) : null;
      if (!pac || !resto.length) { resumo.foraDePadrao++; console.log(`  pulado (fora de uma pasta de paciente): ${rel}`); continue; }
      const p = await db.tabela(P).where(col(P, 'id'), pac).first();
      if (!p) { resumo.semPaciente++; pacientesSemCadastro.add(pac); continue; }
      try {
        const dados = fs.readFileSync(abs);
        const h = sha(dados);
        // já registrado com este mesmo caminho (pasta media/extras do AppClinic): só garante a nuvem
        const original = `extras/${pac}/${resto.join('/')}`;
        if (await db.tabela(EX).where(col(EX, 'file'), original).first()) {
          const naNuvemJa = await arm.naNuvem.existe(original).catch(() => false);
          let igual = false;
          if (naNuvemJa) {
            const d = await arm.naNuvem.le(original).catch(() => null);
            igual = !!d && sha(d) === h;
          }
          if (!naNuvemJa || igual) {
            if (!naNuvemJa) {
              // o registro existe, mas o arquivo ainda não está na nuvem: vai com o mesmo caminho
              if (!simular) await arm.naNuvem.grava(original, dados, tipoMime(original));
              resumo.comRegistro++; resumo.bytes += dados.length;
            } else resumo.repetidos++;
            if (!vistosNaRodada.has(pac)) vistosNaRodada.set(pac, new Set());
            vistosNaRodada.get(pac).add(h);
            continue;
          }
          // mesmo caminho, conteúdo diferente: segue abaixo e é recuperado com sufixo no nome
        }
        if (await jaEsta(pac, dados, h)) { resumo.repetidos++; continue; }
        const dt = dataDe(abs, resto.join('/'));
        // mesma estrutura e mesmo nome da origem (o caminho original já foi conferido acima)
        const dir = path.posix.dirname(original);
        const nomeOrig = path.posix.basename(original);
        const ocupado = await arm.naNuvem.existe(original).catch(() => false)
          || !!(await db.tabela(EX).where(col(EX, 'file'), original).first());
        const nome = !ocupado ? nomeOrig : (simular ? `${nomeOrig} (com sufixo)` : await arm.nomeLivre(dir, nomeOrig));
        const destino = `${dir}/${nome}`;
        if (destino.length > 100) throw new Error(`caminho com ${destino.length} caracteres: o campo do anexo (tb_extra.file) aceita até 100`);
        if (!simular) {
          await arm.naNuvem.grava(destino, dados, tipoMime(nome));
          const ag = db.linha(AG, await db.tabela(AG).where(col(AG, 'fk_paciente_id'), pac).orderBy(col(AG, 'id'), 'desc').first());
          await db.tabela(EX).insert({
            [col(EX, 'fk_prontuario_id')]: pac,
            [col(EX, 'fk_consulta_id')]: ag ? ag.id : null,
            [col(EX, 'fk_medico_id')]: ag ? ag.fk_medico_id : null,
            [col(EX, 'file')]: destino,
            [col(EX, 'ativo')]: 1,
            [col(EX, 'data_salvo')]: `${dt.a}-${p2(dt.m)}-${p2(dt.d)} ${dt.hora}`,
          });
        }
        vistosNaRodada.get(pac).add(h);
        resumo.recuperados++; resumo.bytes += dados.length;
        if (resumo.recuperados <= 20 || resumo.recuperados % 100 === 0) console.log(`  ${simular ? 'iria para' : 'ok'} paciente ${pac}: ${rel} -> ${destino}`);
      } catch (e) {
        resumo.erros++; console.log(`  ERRO ${rel}: ${e.message}`);
      }
    }
  }
  console.log(`\n${resumo.arquivos} arquivos lidos`);
  console.log(`  ${resumo.recuperados} ${simular ? 'seriam recuperados' : 'recuperados'} (${(resumo.bytes / 1048576).toFixed(1)} MB)`);
  if (resumo.comRegistro) console.log(`  ${resumo.comRegistro} já tinham registro no prontuário: ${simular ? 'seriam copiados' : 'copiados'} para a nuvem com o mesmo caminho`);
  console.log(`  ${resumo.repetidos} já estavam no prontuário e na nuvem: pulados`);
  if (resumo.semPaciente) console.log(`  ${resumo.semPaciente} de pacientes que não existem no cadastro (ids: ${[...pacientesSemCadastro].slice(0, 30).join(', ')}${pacientesSemCadastro.size > 30 ? '...' : ''}): pulados`);
  if (resumo.foraDePadrao) console.log(`  ${resumo.foraDePadrao} fora de uma pasta com o id do paciente: pulados`);
  if (resumo.erros) console.log(`  ${resumo.erros} com erro (rode de novo para tentar outra vez)`);
  if (simular) console.log('\nNada foi gravado. Para recuperar, rode o mesmo comando sem --simular.');
  await db.knex.destroy();
  if (resumo.erros) process.exit(2);
})().catch(async (e) => { console.error(e.message); try { await db.knex.destroy(); } catch (x) { /* */ } process.exit(1); });
