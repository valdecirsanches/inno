'use strict';
/**
 * Inno — servidor Node do AppClinic.
 * Mesmas telas, mesmos endereços e o mesmo banco MySQL do sistema em Django.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const config = require('./config');
const QueryDict = require('./util/querydict');
const multipart = require('./util/multipart');
const csrf = require('./seguranca/csrf');
const { sessao, usuario } = require('./seguranca/sessao');
const loginObrigatorio = require('./seguranca/login-obrigatorio');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// arquivos estáticos (CSS, JS, imagens): os mesmos do AppClinic
app.use('/static', express.static(path.join(config.raiz, 'static'), { maxAge: '1h' }));

// corpo da requisição como no Django: request.GET / request.POST (QueryDict)
// e request.data (JSON das chamadas axios / API)
// o robô do WhatsApp (/webhook/) lê o corpo cru (json.loads(request.body))
app.use('/webhook', express.raw({ type: () => true, limit: '20mb' }));
app.use(express.text({ type: 'application/x-www-form-urlencoded', limit: '20mb' }));
app.use(express.json({ limit: '20mb' }));
app.use(multipart);
app.use((req, res, next) => {
  const i = req.originalUrl.indexOf('?');
  req.GET = new QueryDict(i >= 0 ? req.originalUrl.slice(i + 1) : '');
  // req.corpo: QueryDict(request.body) (usado pelos PUT/DELETE das telas)
  if (req.multipart) req.corpo = req.multipart.campos;
  else req.corpo = new QueryDict(typeof req.body === 'string' ? req.body : '');
  req.FILES = req.multipart ? req.multipart.arquivos : {};
  // request.POST só existe no POST (como no Django)
  req.POST = req.method === 'POST' ? req.corpo : new QueryDict('');
  // request.data do DRF: JSON ou o formulário (QueryDict)
  if (typeof req.body === 'string' || req.multipart) req.data = req.corpo;
  else req.data = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {};
  next();
});

app.use(sessao);
app.use(usuario);
app.use(csrf.middleware((req) => require('./rotas').isentoCsrf(req)));
app.use(loginObrigatorio);

// documentos dos pacientes (a mesma pasta media/ do AppClinic), só com login
app.use('/media', express.static(config.mediaRoot));

require('./rotas').registra(app);

// 404 e 500 como o Django com DEBUG desligado
app.use((req, res) => {
  res.status(404).type('html').send('\n<!doctype html>\n<html lang="en">\n<head>\n  <title>Not Found</title>\n</head>\n<body>\n  <h1>Not Found</h1><p>The requested resource was not found on this server.</p>\n</body>\n</html>\n');
});
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(new Date().toISOString(), req.method, req.originalUrl, err);
  // cada erro também vai para logs/erros.log, com a explicação completa
  try {
    fs.mkdirSync(path.join(config.raiz, 'logs'), { recursive: true });
    fs.appendFileSync(path.join(config.raiz, 'logs', 'erros.log'),
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} usuário=${req.user && req.user.login}\n${err.stack || err}\n\n`);
  } catch (e) { /* sem permissão de escrita: fica só no terminal */ }
  if (res.headersSent) return;
  if (config.debug) return res.status(500).type('text').send(err.stack || String(err));
  res.status(500).type('html').send('\n<!doctype html>\n<html lang="en">\n<head>\n  <title>Server Error (500)</title>\n</head>\n<body>\n  <h1>Server Error (500)</h1><p></p>\n</body>\n</html>\n');
});

if (require.main === module) {
  if (!config.segredo) console.warn('ATENÇÃO: defina SECRET_KEY no .env');
  app.listen(config.porta, () => console.log(`Inno ${config.release} em http://0.0.0.0:${config.porta}`));
}

module.exports = app;
