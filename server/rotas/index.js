'use strict';
/**
 * Registro das rotas. Cada módulo do AppClinic vira um arquivo aqui, com os
 * mesmos endereços.
 */
const MODULOS = [
  require('./home'),
  require('./pacientes'),
  require('./listas'),
  require('./agenda'),
  require('./historico'),
  require('./atendimento'),
  require('./prontuario'),
  require('./configuracoes'),
];

// rotas que no Django tinham @csrf_exempt
const ISENTOS = [/^\/webhook\//, /^\/confirmar-presenca-efetivo\//, /^\/cancelar-presenca-efetivo\//];

function registra(app) { for (const m of MODULOS) m(app); }

function isentoCsrf(req) {
  // DRF: chamadas da API sem sessão não passam por CSRF (como o SessionAuthentication)
  return ISENTOS.some((r) => r.test(req.path)) || MODULOS.some((m) => m.isentos && m.isentos(req));
}

/** Embrulha rotas async: erro vai para o tratador 500. */
const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { registra, isentoCsrf, a };
