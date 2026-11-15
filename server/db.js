'use strict';
/**
 * Acesso ao banco (o mesmo MySQL do AppClinic).
 *
 * As linhas são convertidas com a definição dos modelos do Django
 * (modelos.json): booleano vira true/false, decimal vira texto com as casas
 * do modelo, data vira 'AAAA-MM-DD' etc. Assim o JSON e as telas saem iguais
 * aos do Django. Datas são lidas como texto (dateStrings): sem fuso, como o
 * Django com USE_TZ = False.
 */
const knexLib = require('knex');
const config = require('./config');
const MODELOS = require('./modelos.json');

function criaConexao() {
  const b = config.banco;
  if (b.cliente === 'better-sqlite3') {
    return knexLib({ client: 'better-sqlite3', connection: { filename: b.arquivo }, useNullAsDefault: true });
  }
  return knexLib({
    client: 'mysql2',
    connection: {
      host: b.host, port: b.porta, user: b.usuario, password: b.senha, database: b.nome,
      dateStrings: true, charset: 'utf8mb4', supportBigNumbers: true, bigNumberStrings: false,
    },
    pool: { min: 1, max: 10 },
  });
}

const knex = criaConexao();

function modelo(nome) {
  const m = MODELOS[nome];
  if (!m) throw new Error(`Modelo desconhecido: ${nome}`);
  if (!m._porAtributo) {
    m._porAtributo = {};
    m._porColuna = {};
    for (const c of m.campos) { m._porAtributo[c.atributo] = c; m._porColuna[c.coluna] = c; m._porAtributo[c.nome] = m._porAtributo[c.nome] || c; }
  }
  return m;
}

// ----------------------------------------------------------------- tipos
const doisDig = (n) => String(n).padStart(2, '0');

function normalizaData(v) {
  if (v === null || v === undefined || v === '') return v === '' ? null : v;
  if (v instanceof Date) return `${v.getFullYear()}-${doisDig(v.getMonth() + 1)}-${doisDig(v.getDate())}`;
  return String(v).slice(0, 10);
}

function normalizaDataHora(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    return `${normalizaData(v)} ${doisDig(v.getHours())}:${doisDig(v.getMinutes())}:${doisDig(v.getSeconds())}`;
  }
  // como str(datetime) do Python: sem a fração quando ela é zero
  return String(v).replace('T', ' ').replace(/\.0+$/, '');
}

function normalizaHora(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v).replace(/\.0+$/, '');
}

/** Valor como o Django o teria em Python (null = None). */
function converte(campo, v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  switch (campo.tipo) {
    case 'BooleanField':
    case 'NullBooleanField':
      if (Buffer.isBuffer(v)) return v[0] === 1;                  // BIT(1)
      if (typeof v === 'string') return ['1', 't', 'true', 's', 'sim', 'y', 'yes'].includes(v.trim().toLowerCase());
      return v === true || v === 1;
    case 'IntegerField': case 'AutoField': case 'BigAutoField': case 'PositiveIntegerField':
    case 'SmallIntegerField': case 'BigIntegerField': case 'ForeignKey': case 'OneToOneField':
      return typeof v === 'number' ? v : (String(v).trim() === '' ? null : Number(v));
    case 'FloatField':
      return Number(v);
    case 'DecimalField':
      return Number(v).toFixed(campo.casas || 0);
    case 'DateField':
      return normalizaData(v);
    case 'DateTimeField':
      return normalizaDataHora(v);
    case 'TimeField':
      return normalizaHora(v);
    case 'JSONField':
      if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } }
      return v;
    default:
      return Buffer.isBuffer(v) ? v.toString('utf8') : v;
  }
}

/** Linha crua do banco (colunas) -> objeto com os atributos do Django (fk_x_id, ...). */
function linha(nomeModelo, cru) {
  if (!cru) return null;
  const m = modelo(nomeModelo);
  const obj = {};
  for (const c of m.campos) {
    if (Object.prototype.hasOwnProperty.call(cru, c.coluna)) obj[c.atributo] = converte(c, cru[c.coluna]);
  }
  return obj;
}

function linhas(nomeModelo, lista) { return (lista || []).map((r) => linha(nomeModelo, r)); }

/** Tabela do modelo, pronta para consulta (knex). */
function tabela(nomeModelo) { return knex(modelo(nomeModelo).tabela); }

/** Nome da coluna de um atributo (fk_clinica_id -> id_clinica). */
function coluna(nomeModelo, atributo) {
  const c = modelo(nomeModelo)._porAtributo[atributo];
  if (!c) throw new Error(`Campo ${atributo} não existe em ${nomeModelo}`);
  return c.coluna;
}

/** Objeto {atributo: valor} -> {coluna: valor}, para gravar. */
function paraColunas(nomeModelo, obj) {
  const m = modelo(nomeModelo);
  const saida = {};
  for (const [k, v] of Object.entries(obj)) {
    const c = m._porAtributo[k];
    if (!c) continue;
    let valor = v;
    // booleano como 1/0, igual ao driver do Django (mysqlclient)
    if (['BooleanField', 'NullBooleanField'].includes(c.tipo) && typeof v === 'boolean') valor = v ? 1 : 0;
    // texto num BooleanField (o Django converte 't'/'True'/'1' e 'f'/'False'/'0')
    if (['BooleanField', 'NullBooleanField'].includes(c.tipo) && typeof v === 'string' && ['t', 'True', '1', 'f', 'False', '0'].includes(v)) valor = ['t', 'True', '1'].includes(v) ? 1 : 0;
    // TimeField recebendo data e hora (como o Django aceita): grava só a hora
    if (c.tipo === 'TimeField' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[ T]/.test(v)) valor = v.slice(11);
    // DateField recebendo datetime: grava só a data
    if (c.tipo === 'DateField' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[ T]/.test(v)) valor = v.slice(0, 10);
    saida[c.coluna] = valor;
  }
  return saida;
}

async function busca(nomeModelo, filtroAtributos) {
  const q = tabela(nomeModelo);
  for (const [k, v] of Object.entries(filtroAtributos || {})) q.where(coluna(nomeModelo, k), v);
  return linha(nomeModelo, await q.first());
}

/** Data e hora local no formato do Django (USE_TZ = False). */
function agora() {
  // microssegundos, como o datetime.now() do Python
  const t = performance.timeOrigin + performance.now();
  const d = new Date(Math.floor(t));
  const us = String(Math.floor((t * 1000) % 1e6)).padStart(6, '0');
  return `${normalizaData(d)} ${doisDig(d.getHours())}:${doisDig(d.getMinutes())}:${doisDig(d.getSeconds())}.${us}`;
}

function hoje() { return normalizaData(new Date()); }

module.exports = { knex, modelo, linha, linhas, tabela, coluna, paraColunas, busca, converte, agora, hoje, MODELOS };

/**
 * Filtros de texto como o Django gera no MySQL:
 *   icontains / istartswith -> LIKE (sem diferenciar maiúsculas, pela collation)
 *   contains / startswith   -> LIKE BINARY (diferencia maiúsculas)
 * No SQLite (testes) o LIKE não diferencia maiúsculas nos dois casos, como no Django.
 */
function like(q, colunaSql, padrao, { binario = false, ou = false } = {}) {
  const sqlite = config.banco.cliente === 'better-sqlite3';
  const expr = sqlite ? `?? LIKE ? ESCAPE '\\'` : (binario ? '?? LIKE BINARY ?' : '?? LIKE ?');
  return ou ? q.orWhereRaw(expr, [colunaSql, padrao]) : q.whereRaw(expr, [colunaSql, padrao]);
}

/** CAST(coluna AS CHAR) LIKE ... (icontains em coluna numérica) */
function likeNumero(q, colunaSql, padrao) {
  const sqlite = config.banco.cliente === 'better-sqlite3';
  return q.whereRaw(sqlite ? `CAST(?? AS TEXT) LIKE ? ESCAPE '\\'` : 'CAST(?? AS CHAR) LIKE ?', [colunaSql, padrao]);
}

module.exports.like = like;
module.exports.likeNumero = likeNumero;
