'use strict';
/**
 * Painel (Tarefas/Painel) e logs de auditoria (logs/views.py do AppClinic).
 *   /painel/          tela do painel de senhas (PainelView)
 *   /logs/painel/     lista de tb_usuarios_log (logs_dashboard)
 *   /logs/gerenciar/  gerenciar_logs: no AppClinic a view pede o template
 *                     "logs_dashboard.html", que não existe (o arquivo está em
 *                     logs/), e a página sempre dá erro 500. O Inno faz igual.
 */
const config = require('../config');
const db = require('../db');
const { render } = require('../templates');
const { erroPython } = require('../util/orm');
const { formata } = require('../util/formato-data');
const { pyFloat, pyReprTexto } = require('../util/python');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** json.loads do Python, guardando quais números eram float (1.0 continua 1.0) */
function jsonLoads(texto) {
  return JSON.parse(texto, (k, v, ctx) => (typeof v === 'number' && ctx && /[.eE]/.test(ctx.source) ? { __float__: v } : v));
}

/** valor do JSONField como o Django lê do banco (texto inválido continua texto) */
function valorJson(cru) {
  if (cru === null || cru === undefined) return null;
  if (typeof cru !== 'string') return cru;          // driver que já devolveu o objeto
  try { return jsonLoads(cru); } catch (e) { return cru; }
}

const ehFloat = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && '__float__' in v;

/** repr() do Python para o que sai do json.loads */
function repr(v) {
  if (v === null || v === undefined) return 'None';
  if (ehFloat(v)) return pyFloat(v.__float__);
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : pyFloat(v);
  if (typeof v === 'string') return pyReprTexto(v);
  if (Array.isArray(v)) return '[' + v.map(repr).join(', ') + ']';
  return '{' + Object.entries(v).map(([k, x]) => `${pyReprTexto(k)}: ${repr(x)}`).join(', ') + '}';
}

/** bool() do Python */
function verdadeiro(v) {
  if (v === null || v === undefined || v === false || v === '' || v === 0) return false;
  if (ehFloat(v)) return v.__float__ !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** str() do Python (o que o {{ }} do Django imprime) */
function str(v) {
  if (typeof v === 'string') return v;
  return repr(v);
}

module.exports = function (app) {
  app.get('/painel/', a(async (req, res) => {
    await render(res, 'Tarefas/Painel.html', {
      host: config.bancoExibido.host, db: config.bancoExibido.nome, usuario: req.user,
      data: formata(db.hoje(), 'j \\d\\e F \\d\\e Y'),
    });
  }));

  app.get('/logs/painel/', a(async (req, res) => {
    const L = db.modelo('UserLog');
    const col = (at) => db.coluna('UserLog', at);
    const crus = await db.tabela('UserLog').orderBy(col('created_at'), 'desc');
    // str(log.user) = login (USERNAME_FIELD); usuário que sumiu: o Django engole o DoesNotExist e imprime ''
    const logins = new Map(db.linhas('TbUsuario', await db.tabela('TbUsuario').select(db.coluna('TbUsuario', 'id'), db.coluna('TbUsuario', 'login')))
      .map((u) => [u.id, u.login]));
    const logs = crus.map((cru) => {
      const l = db.linha('UserLog', Object.assign({}, cru, { [L._porAtributo.data.coluna]: null }));
      const dado = valorJson(cru[L._porAtributo.data.coluna]);
      l.data = verdadeiro(dado) ? str(dado) : '';
      l.user = l.user_id === null || l.user_id === undefined ? null : (logins.has(l.user_id) ? logins.get(l.user_id) : '');
      return l;
    });
    await render(res, 'logs/logs_dashboard.html', { logs });
  }));

  app.get('/logs/gerenciar/', a(async () => {
    throw erroPython('TemplateDoesNotExist: logs_dashboard.html');
  }));
};
