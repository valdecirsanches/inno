'use strict';
/** Respostas no mesmo formato do Django. */
const { pyJson } = require('./python');

/** urllib.parse.quote do Python (safe='/'): o que o Django usa no ?next= */
function pyQuote(s, safe = '/') {
  return Array.from(Buffer.from(String(s), 'utf8')).map((b) => {
    const c = String.fromCharCode(b);
    if (/[A-Za-z0-9_.\-~]/.test(c) || safe.includes(c)) return c;
    return '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }).join('');
}

/** HttpResponseRedirect: 302, corpo vazio */
function redireciona(res, url, status = 302) {
  res.status(status).set('Location', url).type('html').end();
}

/** JsonResponse do Django: json.dumps (", " e ": ", ensure_ascii) */
function json(res, dados, status = 200) {
  res.status(status).type('application/json').send(pyJson(dados));
}

/** página 404 do Django (DEBUG desligado) */
function pagina404(res) {
  res.status(404).type('html').send('\n<!doctype html>\n<html lang="en">\n<head>\n  <title>Not Found</title>\n</head>\n<body>\n  <h1>Not Found</h1><p>The requested resource was not found on this server.</p>\n</body>\n</html>\n');
}

module.exports = { pyQuote, redireciona, json, pagina404 };
