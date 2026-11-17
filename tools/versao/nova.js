#!/usr/bin/env node
'use strict';
/**
 * Controle de versões: registra uma versão nova em versoes.json, no Inno e no
 * AppClinic ao mesmo tempo (os dois mostram a mesma versão e as mesmas novidades).
 *
 *   node tools/versao/nova.js 2.4.1 "Título da versão" novo:"..." melhoria:"..." correcao:"..."
 *   node tools/versao/nova.js --confere          os dois arquivos estão iguais?
 *   node tools/versao/nova.js --lista            versões registradas
 *
 * O AppClinic é procurado em ../appclinic (ou na variável APPCLINIC).
 * Data = hoje. A versão tem de ser maior que a atual.
 * Depois: commit nos dois repositórios e reinício dos dois servidores
 * (o número novo também faz o navegador baixar CSS e JS atualizados).
 */
const fs = require('fs');
const path = require('path');

const INNO = path.join(__dirname, '..', '..', 'versoes.json');
const APP = path.join(process.env.APPCLINIC || path.join(__dirname, '..', '..', '..', 'appclinic'), 'versoes.json');
const TIPOS = ['novo', 'melhoria', 'correcao'];

const le = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const grava = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
const partes = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
function maior(a, b) {
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
function sai(msg) { console.error(msg); process.exit(1); }

const args = process.argv.slice(2);
const temApp = fs.existsSync(APP);

if (args[0] === '--lista') {
  for (const v of le(INNO).versoes) console.log(`${v.versao.padEnd(8)} ${v.data}  ${v.titulo}`);
  process.exit(0);
}
if (args[0] === '--confere') {
  if (!temApp) sai(`AppClinic não encontrado em ${APP}`);
  const iguais = JSON.stringify(le(INNO)) === JSON.stringify(le(APP));
  console.log(iguais ? 'versoes.json igual no Inno e no AppClinic' : 'versoes.json DIFERENTE no Inno e no AppClinic');
  process.exit(iguais ? 0 : 1);
}

const [versao, titulo, ...itensArg] = args;
if (!versao || !titulo || !itensArg.length) sai('uso: node tools/versao/nova.js <versão> "<título>" novo:"..." melhoria:"..." correcao:"..."');
if (!/^\d+\.\d+\.\d+$/.test(versao)) sai(`versão inválida: ${versao} (use 2.4.1)`);
const itens = itensArg.map((x) => {
  const i = x.indexOf(':');
  const tipo = x.slice(0, i);
  if (i < 0 || !TIPOS.includes(tipo)) sai(`item inválido: ${x} (comece com ${TIPOS.join(': / ')}:)`);
  return { tipo, texto: x.slice(i + 1).trim() };
});

const dados = le(INNO);
if (temApp && JSON.stringify(dados) !== JSON.stringify(le(APP))) sai('versoes.json está diferente no Inno e no AppClinic; acerte antes (--confere).');
const atual = dados.versoes[0].versao;
if (!maior(versao, atual)) sai(`a versão nova (${versao}) tem de ser maior que a atual (${atual})`);
const hoje = new Date();
const d2 = (n) => String(n).padStart(2, '0');
dados.versoes.unshift({ versao, data: `${d2(hoje.getDate())}/${d2(hoje.getMonth() + 1)}/${hoje.getFullYear()}`, titulo, itens });
grava(INNO, dados);
console.log(`Inno: versão ${versao} registrada (${INNO})`);
if (temApp) { grava(APP, dados); console.log(`AppClinic: versão ${versao} registrada (${APP})`); } else console.log(`AppClinic não encontrado em ${APP}: copie o versoes.json para lá.`);
