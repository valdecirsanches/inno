'use strict';
/**
 * Controle de versões: versoes.json (na raiz) tem o histórico, a primeira é a
 * atual. O mesmo arquivo existe no AppClinic (appClinic/versoes.py): fonte única,
 * mudança num lado tem de ir para o outro (tools/versao/nova.js faz os dois).
 */
const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '..', '..', 'versoes.json');

function carrega() {
  try { return JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')).versoes || []; } catch (e) { return []; }
}

function atual(padrao = '2.0.17') {
  const v = carrega();
  return v.length ? v[0].versao : padrao;
}

/** a versão que o aviso "Sistema atualizado" anuncia: a última que não é silenciosa */
function aviso(padrao = '2.0.17') {
  const v = carrega().find((x) => !x.silenciosa);
  return v ? v.versao : padrao;
}

module.exports = { ARQUIVO, carrega, atual, aviso };
