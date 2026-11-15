'use strict';
/**
 * CSRF no mesmo esquema do Django 3.2: cookie "csrftoken" (token mascarado de
 * 64 caracteres) e o envio do token no cabeçalho X-CSRFToken ou no campo
 * csrfmiddlewaretoken. As telas (baseService.js) continuam iguais.
 */
const crypto = require('crypto');

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const TAM = 32;

function aleatorio(n) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += CHARS[b[i] % CHARS.length];
  return s;
}

function mascara(segredo) {
  const masc = aleatorio(TAM);
  let cifra = '';
  for (let i = 0; i < TAM; i++) cifra += CHARS[(CHARS.indexOf(segredo[i]) + CHARS.indexOf(masc[i])) % CHARS.length];
  return masc + cifra;
}

function desmascara(token) {
  const masc = token.slice(0, TAM);
  const cifra = token.slice(TAM);
  let s = '';
  for (let i = 0; i < TAM; i++) {
    s += CHARS[(CHARS.indexOf(cifra[i]) - CHARS.indexOf(masc[i]) + CHARS.length) % CHARS.length];
  }
  return s;
}

function segredoDe(token) {
  if (!token || !/^[a-zA-Z0-9]+$/.test(token)) return null;
  if (token.length === TAM * 2) return desmascara(token);
  if (token.length === TAM) return token;
  return null;
}

const SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

function lerCookie(req, nome) {
  const c = req.headers.cookie || '';
  for (const parte of c.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** isento(req) -> true para rotas que o Django marcava com @csrf_exempt */
function middleware(isento) {
  return (req, res, next) => {
    let cookie = lerCookie(req, 'csrftoken');
    let segredo = segredoDe(cookie);
    if (!segredo) {
      segredo = aleatorio(TAM);
      cookie = mascara(segredo);
      // um ano, como o CSRF_COOKIE_AGE do Django
      res.cookie('csrftoken', cookie, { maxAge: 31449600 * 1000, sameSite: 'lax', path: '/' });
    }
    res.locals.csrf_token = mascara(segredo);
    req.csrfSegredo = segredo;
    if (SEGUROS.has(req.method) || isento(req)) return next();
    const enviado = req.get('X-CSRFToken') || (req.POST && req.POST.get('csrfmiddlewaretoken')) || '';
    if (segredoDe(enviado) !== segredo) {
      res.status(403).type('html').send('<h1>Proibido <span>(403)</span></h1><p>Verificação CSRF falhou. Pedido cancelado.</p>');
      return;
    }
    next();
  };
}

module.exports = { middleware, mascara, lerCookie };
