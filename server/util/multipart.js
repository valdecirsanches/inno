'use strict';
/**
 * multipart/form-data (envio de arquivos), como request.POST / request.FILES
 * do Django. Os arquivos ficam em memória: {campo: [{nome, tipo, dados}]}.
 */
const Busboy = require('busboy');
const QueryDict = require('./querydict');

module.exports = function multipart(req, res, next) {
  if (!/^multipart\/form-data/i.test(req.headers['content-type'] || '')) return next();
  let bb;
  try { bb = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 }, defParamCharset: 'utf8' }); } catch (e) { return next(); }
  const pares = [];
  const arquivos = {};
  bb.on('field', (nome, valor) => pares.push([nome, valor]));
  bb.on('file', (nome, stream, info) => {
    const partes = [];
    stream.on('data', (d) => partes.push(d));
    stream.on('end', () => {
      (arquivos[nome] = arquivos[nome] || []).push({ nome: info.filename, tipo: info.mimeType, dados: Buffer.concat(partes) });
    });
  });
  bb.on('close', () => {
    req.multipart = { campos: QueryDict.dePares ? QueryDict.dePares(pares) : new QueryDict(new URLSearchParams(pares).toString()), arquivos };
    next();
  });
  bb.on('error', next);
  req.pipe(bb);
};
