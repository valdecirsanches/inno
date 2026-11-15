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
const { pyJsonLoads: jsonLoads, pyReprJson: repr, pyBool: verdadeiro, pyStrValor: str } = require('../util/python');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
/** valor do JSONField como o Django lê do banco (texto inválido continua texto) */
function valorJson(cru) {
  if (cru === null || cru === undefined) return null;
  if (typeof cru !== 'string') return cru;          // driver que já devolveu o objeto
  try { return jsonLoads(cru); } catch (e) { return cru; }
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
