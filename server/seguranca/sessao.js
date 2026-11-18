'use strict';
/**
 * Sessão (cookie assinado "inno_sessao", 2 semanas como o Django) e usuário
 * logado em req.user / res.locals.user, com os mesmos dados que os templates
 * liam do Django: login, nome, fk_clinica.nome, release, hostdb, database...
 */
const cookieSession = require('cookie-session');
const config = require('../config');
const db = require('../db');
const { hashDaSessao } = require('./senhas');

const sessao = cookieSession({
  name: 'inno_sessao',
  keys: [config.segredo || 'troque-o-SECRET_KEY-no-.env'],
  maxAge: 1209600 * 1000,
  sameSite: 'lax',
  httpOnly: true,
});

async function carregaUsuario(id) {
  const u = await db.busca('TbUsuario', { id });
  if (!u) return null;
  u.fk_clinica = u.fk_clinica_id ? await db.busca('TbClinica', { id: u.fk_clinica_id }) : null;
  u.fk_medico = u.fk_medico_id ? await db.busca('TbMedicos', { id: u.fk_medico_id }) : null;
  u.release = config.release;
  u.release_aviso = config.releaseAviso;
  u.hostdb = config.bancoExibido.host;
  u.database = config.bancoExibido.nome;
  u.is_authenticated = true;
  u.pk = u.id;
  return u;
}

const ANONIMO = Object.freeze({ is_authenticated: false, release: config.release, release_aviso: config.releaseAviso });

async function usuario(req, res, next) {
  try {
    req.user = ANONIMO;
    const s = req.session;
    if (s && s.uid) {
      const u = await carregaUsuario(s.uid);
      // senha trocada (ou usuário desativado): a sessão deixa de valer
      if (u && u.is_active && s.hash === hashDaSessao(u.password, config.segredo)) req.user = u;
      else req.session = null;
    }
    res.locals.user = req.user;
    next();
  } catch (e) { next(e); }
}

function entra(req, u) {
  req.session = { uid: u.id, hash: hashDaSessao(u.password, config.segredo) };
}

function sai(req) { req.session = null; }

module.exports = { sessao, usuario, entra, sai, carregaUsuario };
