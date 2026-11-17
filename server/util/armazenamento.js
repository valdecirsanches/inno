'use strict';
/**
 * Onde ficam os arquivos enviados (imagens e anexos do prontuário): só na nuvem.
 * O Inno não grava arquivo nenhum no disco; sem NUVEM_URL, o envio dá erro.
 *
 * Dois tipos de nuvem (NUVEM_TIPO no .env):
 *  - simples (padrão): o servidor "nuvem" do dono (~/apps/nuvem/main.js):
 *      POST /upload (campo "file") -> {ok, id, view, download}
 *      GET  /download/:id  e  GET /view/:id
 *    Não tem chave, nem lista, nem exclusão.
 *  - cloud-storage: o valdecirsanches/cloud-storage (x-api-key):
 *      POST /api/upload, GET /api/files/:id?download=1, DELETE /api/files/:id
 *
 * O banco continua guardando o mesmo caminho de sempre (ex.:
 * "extras/12/2026/11/17/foto.png") nas tabelas do AppClinic. A ligação
 * "caminho -> id na nuvem" fica numa tabela só do Inno, inno_nuvem, criada
 * sozinha no primeiro uso (o AppClinic não a conhece nem precisa dela).
 *
 * A pasta MEDIA_ROOT (a media/ do AppClinic) nunca é escrita, só lida: pelo
 * tools/nuvem/migra-media.js e quando o Inno procura um arquivo que ainda não
 * está na nuvem (enviado pelo AppClinic, por exemplo). Nesse caso o arquivo é
 * entregue e copiado para a nuvem na mesma hora, então a nuvem vai se completando
 * sozinha e as imagens do AppClinic aparecem no Inno.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db');

const TABELA = 'inno_nuvem';

// ------------------------------------- pasta antiga (só leitura, para a migração)
const origem = {
  abs: (rel) => path.join(config.mediaRoot, rel),
  async le(rel) { try { return fs.readFileSync(origem.abs(rel)); } catch (e) { return null; } },
  existe(rel) { try { return fs.statSync(origem.abs(rel)).isFile(); } catch (e) { return false; } },
  /** caminhos (relativos à raiz) dos arquivos abaixo de "prefixo" */
  async lista(prefixo) {
    const out = [];
    const anda = (rel) => {
      let itens;
      try { itens = fs.readdirSync(origem.abs(rel), { withFileTypes: true }); } catch (e) { return; }
      for (const i of itens) {
        const r = rel ? `${rel}/${i.name}` : i.name;
        if (i.isDirectory()) anda(r); else if (i.isFile()) out.push(r);
      }
    };
    anda(String(prefixo || '').replace(/\/+$/, ''));
    return out;
  },
};

// --------------------------------------------- índice caminho -> id (no banco)
let tabelaPronta = null;
function garanteTabela() {
  if (!tabelaPronta) {
    tabelaPronta = (async () => {
      if (await db.knex.schema.hasTable(TABELA)) return;
      await db.knex.schema.createTable(TABELA, (t) => {
        t.string('caminho', 255).primary();
        t.string('nuvem_id', 100).notNullable();
        t.bigInteger('tamanho');
        t.string('tipo', 100);
        t.dateTime('criado_em');
      });
    })().catch((e) => {
      tabelaPronta = null;
      throw new Error(`não foi possível criar a tabela ${TABELA} no banco (o usuário do MySQL precisa de permissão CREATE): ${e.message}`);
    });
  }
  return tabelaPronta;
}
async function idDe(rel) {
  await garanteTabela();
  const l = await db.knex(TABELA).where('caminho', String(rel)).first();
  return l ? l.nuvem_id : null;
}
async function registra(rel, id, dados, tipo) {
  await garanteTabela();
  const linha = { caminho: String(rel), nuvem_id: id, tamanho: dados.length, tipo: tipo || null, criado_em: db.agora() };
  const ja = await db.knex(TABELA).where('caminho', linha.caminho).first();
  if (ja) await db.knex(TABELA).where('caminho', linha.caminho).update(linha);
  else await db.knex(TABELA).insert(linha);
}
/** caminhos registrados abaixo de "prefixo" (ordem alfabética) */
async function caminhos(prefixo) {
  await garanteTabela();
  const p = String(prefixo || '').replace(/\/+$/, '');
  const q = db.knex(TABELA).select('caminho').orderBy('caminho');
  if (p) q.where('caminho', 'like', `${p.replace(/[\\%_]/g, (c) => '\\' + c)}/%`);
  return (await q).map((l) => l.caminho);
}

// ------------------------------------------------------------------ a nuvem
const cfg = () => ({
  url: String(config.nuvem.url || '').replace(/\/+$/, ''),
  chave: config.nuvem.apiKey || '',
  tipo: String(config.nuvem.tipo || 'simples').toLowerCase(),
});
async function chama(metodo, rota, { corpo, timeout = 60000 } = {}) {
  const { url, chave } = cfg();
  if (!url) throw new Error('Armazenamento na nuvem sem NUVEM_URL no .env');
  const headers = chave ? { 'x-api-key': chave } : {};
  return fetch(url + rota, { method: metodo, body: corpo, headers, signal: AbortSignal.timeout(timeout) });
}
const rotas = () => (cfg().tipo === 'cloud-storage'
  ? { envio: '/api/upload', baixa: (id) => `/api/files/${encodeURIComponent(id)}?download=1`, apaga: (id) => `/api/files/${encodeURIComponent(id)}` }
  : { envio: '/upload', baixa: (id) => `/download/${encodeURIComponent(id)}`, apaga: null });

/** nome do arquivo enviado à nuvem: o caminho com "~" no lugar de "/" (fica legível nos metadados de lá) */
const paraNuvem = (rel) => String(rel).replace(/\//g, '~');

const naNuvem = {
  async existe(rel) { return (await idDe(rel)) !== null; },
  async le(rel) {
    const id = await idDe(rel);
    if (!id) return null;
    const r = await chama('GET', rotas().baixa(id));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`nuvem respondeu ${r.status} ao ler ${rel}`);
    return Buffer.from(await r.arrayBuffer());
  },
  async grava(rel, dados, tipoMime) {
    const fd = new FormData();
    fd.append('file', new Blob([dados], { type: tipoMime || 'application/octet-stream' }), paraNuvem(rel));
    const r = await chama('POST', rotas().envio, { corpo: fd, timeout: 300000 });
    const texto = await r.text();
    let j = {};
    try { j = JSON.parse(texto); } catch (e) { /* resposta não é JSON */ }
    const id = j.id || (j.file && j.file.id);
    if (!r.ok || !id) throw new Error(`nuvem recusou ${rel}: ${r.status} ${j.error || texto.slice(0, 200)}`.trim());
    await registra(rel, String(id), dados, tipoMime);
  },
  lista: caminhos,
};

/** pasta e nuvem juntas, sem repetir, em ordem alfabética */
async function listaTudo(prefixo) {
  const s = new Set(await caminhos(prefixo));
  for (const r of await origem.lista(prefixo)) s.add(r);
  return [...s].sort();
}

const nuvem = {
  /** está na nuvem, ou ainda só na pasta do AppClinic */
  async existe(rel) { return (await naNuvem.existe(rel)) || origem.existe(rel); },
  async existePasta(rel) { return (await caminhos(rel)).length > 0 || (await origem.lista(rel)).length > 0; },
  /** da nuvem; se ainda não estiver lá, da pasta do AppClinic, já copiando para a nuvem */
  async le(rel) {
    const daNuvem = await naNuvem.le(rel);
    if (daNuvem) return daNuvem;
    const local = await origem.le(rel);
    if (!local) return null;
    try { await naNuvem.grava(rel, local, require('./mime').tipo(rel)); } catch (e) {
      console.error(`[nuvem] não consegui copiar ${rel} para a nuvem agora: ${e.message}`);
    }
    return local;
  },
  grava: (rel, dados, tipo) => naNuvem.grava(rel, dados, tipo),
  async exclui(rel) {
    const id = await idDe(rel);
    if (!id) return false;
    const rota = rotas().apaga;
    if (rota) { const r = await chama('DELETE', rota(id)); if (!r.ok && r.status !== 404) return false; }
    await db.knex(TABELA).where('caminho', String(rel)).del();
    return true;
  },
  lista: listaTudo,
};

/** nome livre na pasta, como o get_available_name do Django (sufixo aleatório de 7) */
async function nomeLivre(dir, nome) {
  let n = nome;
  while (await nuvem.existe(`${dir}/${n}`)) {
    const ext = path.extname(nome);
    n = `${path.basename(nome, ext)}_${Math.random().toString(36).slice(2, 9).padEnd(7, '0')}${ext}`;
  }
  return n;
}

/** /media/<caminho>: entrega o arquivo da nuvem */
function rotaMedia() {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let rel;
    try { rel = decodeURIComponent(req.path).replace(/^\/+/, ''); } catch (e) { return next(); }
    if (!rel || rel.split('/').includes('..')) return next();
    nuvem.le(rel).then((dados) => {
      if (!dados) return next();
      const t = require('./mime').tipo(rel);
      if (t) res.type(t);
      res.set('Cache-Control', 'private, max-age=3600');
      res.send(dados);
    }).catch(next);
  };
}

module.exports = {
  nomeLivre, rotaMedia, nuvem, naNuvem, origem, paraNuvem, TABELA,
  existe: (rel) => nuvem.existe(rel),
  existePasta: (rel) => nuvem.existePasta(rel),
  le: (rel) => nuvem.le(rel),
  grava: (rel, dados, tipo) => nuvem.grava(rel, dados, tipo),
  exclui: (rel) => nuvem.exclui(rel),
  lista: (prefixo) => nuvem.lista(prefixo),
};
