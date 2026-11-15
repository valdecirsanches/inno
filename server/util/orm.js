'use strict';
/** Auxiliares no estilo do ORM do Django: .get(), .last(), erros iguais. */
const db = require('../db');

function naoExiste(nome) { const e = new Error(`${nome} matching query does not exist.`); e.python = true; return e; }
function erroPython(msg) { const e = new Error(msg); e.python = true; return e; }

/** Model.objects.get(**filtro): erro se não houver exatamente 1 */
async function obtem(nomeModelo, filtro) {
  const q = db.tabela(nomeModelo);
  for (const [k, v] of Object.entries(filtro)) q.where(db.coluna(nomeModelo, k), v);
  const l = await q.limit(2);
  if (l.length !== 1) throw l.length ? erroPython(`get() returned more than one ${nomeModelo}`) : naoExiste(nomeModelo);
  return db.linha(nomeModelo, l[0]);
}

/** objeto relacionado (obj.fk_x): None se o id é nulo; erro se a linha sumiu */
async function relacionado(nomeModelo, id) {
  if (id === null || id === undefined) return null;
  return obtem(nomeModelo, { id });
}

/** .last(): o de maior id */
async function ultimo(nomeModelo, filtro = {}) {
  const q = db.tabela(nomeModelo);
  for (const [k, v] of Object.entries(filtro)) q.where(db.coluna(nomeModelo, k), v);
  return db.linha(nomeModelo, await q.orderBy(db.coluna(nomeModelo, db.modelo(nomeModelo).pk), 'desc').first());
}

/** int() do Python */
function int(v) {
  const s = String(v === null || v === undefined ? '' : v).trim();
  if (!/^[-+]?\d+$/.test(s)) throw erroPython(`invalid literal for int() with base 10: '${v}'`);
  return parseInt(s, 10);
}

/** datetime.strptime(texto, '%Y-%m-%d') — aceita dígitos sem zero à esquerda */
function strptimeData(t) {
  const m = String(t).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const ok = m && (() => { const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]; })();
  if (!ok) throw erroPython(`time data '${t}' does not match format '%Y-%m-%d'`);
  return { a: +m[1], m: +m[2], d: +m[3], iso: `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` };
}

/** isoweekday(): 1 = segunda ... 7 = domingo */
function isoweekday(a, m, d) { const w = new Date(a, m - 1, d).getDay(); return w === 0 ? 7 : w; }

function nomeDoUsuario(u) {
  if (!u) return '';
  return String(u.first_name || u.nome || u.login || u.username || '').trim();
}

module.exports = { naoExiste, erroPython, obtem, relacionado, ultimo, int, strptimeData, isoweekday, nomeDoUsuario };
