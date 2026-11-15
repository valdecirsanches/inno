'use strict';
/**
 * O papel do Django REST Framework no Inno (as rotas /api/ do AppClinic):
 *  - serialização de modelo (ModelSerializer fields='__all__'), com os
 *    formatos do DRF: datas ISO, decimal como texto, FK como id;
 *  - JSON compacto e com acentos (JSONRenderer padrão do DRF);
 *  - paginação LimitOffsetPagination (count/next/previous/results, 10 por página);
 *  - SearchFilter (?search=) e filtros simples (?campo=, ?campo__in=).
 */
const db = require('../db');
const { pyFloat } = require('./python');

const PAGE_SIZE = 10;

/** json.dumps(..., separators=(',', ':'), ensure_ascii=False) do DRF */
function drfJson(v) {
  if (v === null || v === undefined) return 'null';
  if (v && typeof v === 'object' && '__float__' in v) return pyFloat(v.__float__);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : pyFloat(v);
  if (typeof v === 'string') {
    return JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }
  if (Array.isArray(v)) return '[' + v.map(drfJson).join(',') + ']';
  return '{' + Object.entries(v).map(([k, x]) => JSON.stringify(String(k)) + ':' + drfJson(x)).join(',') + '}';
}

function responde(res, dados, status = 200) {
  res.status(status).type('application/json').send(drfJson(dados));
}

/** valor de um campo do modelo como o DRF o representa */
function representa(campo, v) {
  if (v === null || v === undefined) return null;
  switch (campo.tipo) {
    case 'DateTimeField': return String(v).replace(' ', 'T');
    case 'DateField': return String(v).slice(0, 10);
    case 'TimeField': return String(v);
    case 'DecimalField': return Number(v).toFixed(campo.casas || 0);
    case 'FloatField': return { __float__: Number(v) };
    case 'BooleanField': case 'NullBooleanField': return !!v;
    default: return v;
  }
}

/** ModelSerializer com fields='__all__': chaves pelo nome do campo, na ordem do modelo */
function serializaModelo(nomeModelo, obj, extra = {}) {
  const m = db.modelo(nomeModelo);
  const o = {};
  for (const c of m.campos) {
    if (Object.prototype.hasOwnProperty.call(extra, c.nome)) { o[c.nome] = extra[c.nome]; continue; }
    o[c.nome] = representa(c, obj[c.atributo]);
  }
  for (const [k, v] of Object.entries(extra)) if (!(k in o)) o[k] = v;
  return o;
}

// ----------------------------------------------------------- busca
/** termos do SearchFilter: vírgulas viram espaço, separa por espaço */
function termos(texto) {
  return String(texto || '').replace(/\0/g, '').replace(/,/g, ' ').split(/\s+/).filter(Boolean);
}

function aplicaBusca(q, nomeModelo, campos, texto) {
  const ts = termos(texto);
  // search_fields com uma chave estrangeira (ex.: 'fk_medico'): o Django recusa
  // fk_medico__icontains e a busca dá erro 500 (AgendaViewSet, HorariosViewSet)
  const m = db.modelo(nomeModelo);
  if (ts.length && campos.some((n) => ['ForeignKey', 'OneToOneField'].includes((m._porAtributo[n] || {}).tipo))) {
    const e = new Error('Related Field got invalid lookup: icontains'); e.python = true; throw e;
  }
  for (const t of ts) {
    q.where((w) => {
      campos.forEach((nome, i) => {
        const col = `${db.modelo(nomeModelo).tabela}.${db.coluna(nomeModelo, nome)}`;
        db.like(w, col, `%${String(t).replace(/[\\%_]/g, (c) => '\\' + c)}%`, { ou: i > 0 });
      });
    });
  }
  return q;
}

// ------------------------------------------------------- paginação
/** urlencode(sorted(...)) do Python com quote_plus */
function quotePlus(s) {
  return Array.from(Buffer.from(String(s), 'utf8')).map((b) => {
    const c = String.fromCharCode(b);
    if (/[A-Za-z0-9_.\-~]/.test(c)) return c;
    if (c === ' ') return '+';
    return '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }).join('');
}

function trocaParametro(url, chave, valor, remove = false) {
  const [base, query = ''] = url.split('?');
  const mapa = new Map();
  for (const parte of query.split('&').filter(Boolean)) {
    const [k, v = ''] = parte.split('=');
    const kd = decodeURIComponent(k.replace(/\+/g, ' '));
    const vd = decodeURIComponent(v.replace(/\+/g, ' '));
    if (!mapa.has(kd)) mapa.set(kd, []);
    mapa.get(kd).push(vd);
  }
  if (remove) mapa.delete(chave); else mapa.set(chave, [String(valor)]);
  const pares = [];
  for (const k of [...mapa.keys()].sort()) for (const v of mapa.get(k)) pares.push(`${quotePlus(k)}=${quotePlus(v)}`);
  return pares.length ? `${base}?${pares.join('&')}` : base;
}

function inteiroPositivo(v, padrao, zeroOk = false) {
  const n = parseInt(v, 10);
  if (v === null || v === undefined || Number.isNaN(n) || !/^\s*[-+]?\d+\s*$/.test(String(v))) return padrao;
  if (n < 0 || (n === 0 && !zeroOk)) return padrao;
  return n;
}

/**
 * Lista paginada (LimitOffsetPagination). consulta: knex builder sem limit.
 * serializa: async (linhaCrua) => objeto.
 */
async function listaPaginada(req, res, consulta, serializa) {
  const limite = inteiroPositivo(req.GET.get('limit'), PAGE_SIZE);
  const offset = inteiroPositivo(req.GET.get('offset'), 0, true);
  const total = Number((await consulta.clone().clearSelect().clearOrder().count({ n: '*' }).first()).n);
  const linhas = await consulta.clone().limit(limite).offset(offset);
  const url = `http://${req.get('host')}${req.originalUrl}`;
  let proximo = null;
  let anterior = null;
  if (offset + limite < total) proximo = trocaParametro(trocaParametro(url, 'limit', limite), 'offset', offset + limite);
  if (offset > 0) {
    const u = trocaParametro(url, 'limit', limite);
    anterior = offset - limite <= 0 ? trocaParametro(u, 'offset', null, true) : trocaParametro(u, 'offset', offset - limite);
  }
  const results = [];
  for (const l of linhas) results.push(await serializa(l));
  responde(res, { count: total, next: proximo, previous: anterior, results });
}

/** Http404 do get_object_or_404 dentro do DRF (a mensagem vem do Django, em inglês) */
function naoEncontrado(res, nomeModelo) {
  responde(res, { detail: nomeModelo ? `No ${nomeModelo} matches the given query.` : 'Não encontrado.' }, 404);
}

module.exports = { drfJson, responde, representa, serializaModelo, aplicaBusca, listaPaginada, naoEncontrado, termos };
