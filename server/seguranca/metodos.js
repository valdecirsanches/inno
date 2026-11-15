'use strict';
/**
 * Métodos HTTP como no Django, para os endereços que não são do DRF
 * (server/metodos-django.json, gerado do próprio AppClinic):
 *  - view em classe (View.as_view()): método que a classe não tem -> 405 vazio
 *    com o cabeçalho Allow;
 *  - view em função: aceita qualquer método. Se o Inno só registrou outro método
 *    para o endereço, a requisição é atendida pelo mesmo código (o que a view lê
 *    de request.GET/request.POST continua igual).
 */
const ROTAS = require('../metodos-django.json');

/** padrão do Django (path() ou re_path()) -> RegExp */
function regex(padrao) {
  let r = '';
  const partes = padrao.replace(/\(\?P</g, '(?<').split(/((?<!\?)<[^>]+>)/);
  for (const p of partes) {
    const conv = p.match(/^<(?:(\w+):)?\w+>$/);
    if (conv) { r += conv[1] === 'path' ? '(.+)' : '([^/]+)'; continue; }
    if (/[\\^$(]/.test(p)) r += p.replace(/\^/g, '').replace(/\$/g, '');   // trecho de re_path
    else r += p.replace(/[.*+?{}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`);
}

// o admin e os arquivos têm tratamento próprio
const TABELA = ROTAS.filter(([p]) => !/^\/(admin|static|media)\//.test(p)).map(([padrao, tipo, metodos]) => ({ re: regex(padrao), tipo, metodos }));
const ORDEM = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];

/** middleware depois de todas as rotas: o que chegou aqui não casou com nenhuma */
function metodos(app) {
  return (req, res, next) => {
    const r = TABELA.find((x) => x.re.test(req.path));
    if (!r || req.method === 'OPTIONS') return next();
    if (r.tipo === 'classe' && !r.metodos.includes(req.method)) {
      const permitidos = ORDEM.filter((m) => r.metodos.includes(m) || m === 'OPTIONS');
      return res.status(405).set('Allow', permitidos.join(', ')).type('html').send('');
    }
    if (req.redespachado) return next();
    // atende pelo handler registrado com outro método (GET primeiro, depois POST)
    const original = req.method;
    const tenta = (lista) => {
      if (!lista.length) { req.method = original; return next(); }
      req.redespachado = true;
      req.method = lista[0];
      app.handle(req, res, (err) => { if (err) { req.method = original; return next(err); } tenta(lista.slice(1)); });
    };
    tenta(['GET', 'POST', 'PUT', 'DELETE'].filter((m) => m !== original));
  };
}

module.exports = metodos;
