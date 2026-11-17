'use strict';
/**
 * Onde ficam os arquivos enviados (imagens e anexos do prontuário): só na nuvem,
 * no servidor cloud-storage (NUVEM_URL + NUVEM_API_KEY). O Inno não grava
 * arquivo nenhum no disco; sem a nuvem configurada, o envio dá erro.
 *
 * O banco continua guardando o mesmo caminho de sempre (ex.:
 * "extras/12/2026/11/17/foto.png"). Na nuvem, esse caminho é o nome do
 * arquivo; o id que a nuvem dá a cada arquivo é encontrado pela lista dos
 * arquivos do cliente, que fica em memória e é relida quando falta um nome.
 *
 * A pasta MEDIA_ROOT (a media/ do AppClinic) só é lida, pelo
 * tools/nuvem/migra-media.js, para copiar os arquivos antigos para a nuvem.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

// ------------------------------------- pasta antiga (só leitura, para a migração)
const origem = {
  abs: (rel) => path.join(config.mediaRoot, rel),
  async le(rel) { try { return fs.readFileSync(origem.abs(rel)); } catch (e) { return null; } },
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

// ------------------------------------------------------------------ nuvem
const nuvemCfg = () => ({ url: String(config.nuvem.url || '').replace(/\/+$/, ''), chave: config.nuvem.apiKey });
let indice = null;          // Map nome -> id
let lidoEm = 0;
let lendo = null;
const RELER_MS = 15000;     // no máximo uma releitura da lista a cada 15 s por falta de nome

async function chama(metodo, rota, { corpo, timeout = 60000 } = {}) {
  const { url, chave } = nuvemCfg();
  if (!url || !chave) throw new Error('Armazenamento na nuvem sem NUVEM_URL ou NUVEM_API_KEY no .env');
  const r = await fetch(url + rota, { method: metodo, body: corpo, headers: { 'x-api-key': chave }, signal: AbortSignal.timeout(timeout) });
  return r;
}

async function carregaIndice(forca = false) {
  if (indice && !forca) return indice;
  if (lendo) return lendo;
  lendo = (async () => {
    try {
      const r = await chama('GET', '/api/files');
      if (!r.ok) throw new Error(`nuvem respondeu ${r.status} ao listar os arquivos`);
      const j = await r.json();
      const m = new Map();
      // se houver dois com o mesmo nome, vale o mais novo
      const l = (j.files || []).slice().sort((x, y) => String(x.uploadedAt).localeCompare(String(y.uploadedAt)));
      for (const f of l) m.set(f.name, f.id);
      indice = m;
      lidoEm = Date.now();
      return m;
    } finally { lendo = null; }
  })();
  return lendo;
}
async function idDe(rel) {
  const m = await carregaIndice();
  if (m.has(rel)) return m.get(rel);
  if (Date.now() - lidoEm > RELER_MS) { const n = await carregaIndice(true); return n.get(rel) || null; }
  return null;
}

const nuvem = {
  tipo: 'nuvem',
  async existe(rel) { return (await idDe(rel)) !== null; },
  async existePasta(rel) {
    const p = String(rel).replace(/\/+$/, '') + '/';
    for (const n of (await carregaIndice()).keys()) if (n.startsWith(p)) return true;
    return false;
  },
  async le(rel) {
    const id = await idDe(rel);
    if (!id) return null;
    const r = await chama('GET', `/api/files/${encodeURIComponent(id)}?download=1`);
    if (r.status === 404) { indice && indice.delete(rel); return null; }
    if (!r.ok) throw new Error(`nuvem respondeu ${r.status} ao ler ${rel}`);
    return Buffer.from(await r.arrayBuffer());
  },
  async grava(rel, dados, tipoMime) {
    const fd = new FormData();
    fd.append('file', new Blob([dados], { type: tipoMime || 'application/octet-stream' }), rel);
    const r = await chama('POST', '/api/upload', { corpo: fd, timeout: 300000 });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error(`nuvem recusou ${rel}: ${r.status} ${j.error || ''}`.trim());
    (await carregaIndice()).set(rel, j.id);
  },
  async exclui(rel) {
    const id = await idDe(rel);
    if (!id) return false;
    const r = await chama('DELETE', `/api/files/${encodeURIComponent(id)}`);
    if (r.ok) indice.delete(rel);
    return r.ok;
  },
  async lista(prefixo) {
    const p = String(prefixo || '').replace(/\/+$/, '');
    const pre = p ? `${p}/` : '';
    return [...(await carregaIndice(true)).keys()].filter((n) => n.startsWith(pre)).sort();
  },
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
  nomeLivre, rotaMedia, nuvem, origem,
  existe: (rel) => nuvem.existe(rel),
  existePasta: (rel) => nuvem.existePasta(rel),
  le: (rel) => nuvem.le(rel),
  grava: (rel, dados, tipo) => nuvem.grava(rel, dados, tipo),
  exclui: (rel) => nuvem.exclui(rel),
  lista: (prefixo) => nuvem.lista(prefixo),
  _zeraIndice: () => { indice = null; lidoEm = 0; },
};
