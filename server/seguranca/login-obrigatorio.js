'use strict';
const { pyQuote, redireciona } = require('../util/http');
/**
 * Login obrigatório em todo o sistema (o mesmo que o AppClinic faz em
 * appClinic/login_obrigatorio.py). Ficam livres só os endereços que precisam
 * funcionar sem login.
 */
const ENDERECOS_LIVRES = [
  '/login', '/logout', '/static/', '/favicon.ico',
  '/webhook/',                      // robô do WhatsApp (respostas 1 / 2)
  '/opcoesPresenca/',               // página que o paciente abre
  '/confirmar-presenca-efetivo/',
  '/cancelar-presenca-efetivo/',
];

function ehAjax(req) {
  if (req.path.startsWith('/api/')) return true;
  if (req.get('x-requested-with') === 'XMLHttpRequest') return true;
  return !(req.get('accept') || '').includes('text/html');
}

module.exports = function loginObrigatorio(req, res, next) {
  if (req.user.is_authenticated || ENDERECOS_LIVRES.some((p) => req.path.startsWith(p))) return next();
  if (ehAjax(req)) {
    return res.status(401).json({ detail: 'Sessão expirada. Faça login novamente.', login: true });
  }
  // igual ao redirect_to_login do Django (LOGIN_URL = '/login')
  return redireciona(res, `/login?next=${pyQuote(req.originalUrl)}`);
};
module.exports.ENDERECOS_LIVRES = ENDERECOS_LIVRES;
