'use strict';
/**
 * Motor de telas: Nunjucks configurado para imprimir exatamente como o
 * Django imprimia (None, True/False, aspas como &#x27;, vírgula decimal).
 */
const path = require('path');
const nunjucks = require('nunjucks');
const lib = require('nunjucks/src/lib');
const runtime = require('nunjucks/src/runtime');
const config = require('./config');
const { formata } = require('./util/formato-data');
const ROTAS = require('./rotas-nomeadas.json');

// escape igual ao django.utils.html.escape
const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
lib.escape = (v) => (v instanceof runtime.SafeString ? v : String(v).replace(/[&<>"']/g, (c) => MAPA[c]));

// o Django imprime None/True/False; valor inexistente sai vazio
const suppressOriginal = runtime.suppressValue;
runtime.suppressValue = function (val, autoescape) {
  if (val === null) val = 'None';
  else if (val === true) val = 'True';
  else if (val === false) val = 'False';
  return suppressOriginal(val, autoescape);
};

const env = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(path.join(config.raiz, 'templates'), { noCache: config.debug }),
  { autoescape: true, throwOnUndefined: false }
);

const vazio = (v) => v === null || v === undefined || v === '' || v === false || v === 0 ||
  (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !(v instanceof Date) && Object.keys(v).length === 0);

env.addFilter('date', (v, f) => formata(v, f));
env.addFilter('default', (v, alt) => (vazio(v) ? alt : v));
env.addFilter('stringformat', (v, f) => (f === 's' ? String(v === null ? 'None' : v) : String(v)));
env.addFilter('force_escape', (v) => new runtime.SafeString(lib.escape(String(v === null ? 'None' : v))));
env.addFilter('floatformat', (v, casas) => {
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  const k = casas === undefined ? -1 : parseInt(casas, 10);
  if (k < 0) {                       // -1: até 1 casa, sem zero à direita
    const r = Math.round(n * 10) / 10;
    return (Number.isInteger(r) ? String(r) : r.toFixed(Math.abs(k))).replace('.', ',');
  }
  return n.toFixed(k).replace('.', ',');
});

// {% url 'nome' arg %} com argumentos
env.addGlobal('url', (nome, ...args) => {
  let caminho = ROTAS[nome] || '#';
  for (const a of args) caminho = caminho.replace(/<[^>]+>|\(\?P<\w+>[^)]*\)/, String(a));
  return caminho.replace(/\^|\$/g, '');
});

function render(res, template, contexto = {}) {
  const ctx = Object.assign({}, res.locals, contexto);
  return new Promise((ok, erro) => {
    env.render(template, ctx, (e, html) => {
      if (e) return erro(e);
      res.type('html').send(html);
      ok();
    });
  });
}

module.exports = { env, render, SafeString: runtime.SafeString };
