'use strict';
/**
 * Listas usadas pelos campos de seleção (selectize) de várias telas:
 * convênios, planos e médicos (Cadastros/Convenio e Cadastros/Medicos).
 */
const db = require('../db');
const { json } = require('../util/http');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = function (app) {
  app.get('/cadastros/convenio/SelecionaConvenio/', a(async (req, res) => {
    const C = 'TbConvenio';
    const l = db.linhas(C, await db.tabela(C).orderBy(db.coluna(C, 'razao')));
    json(res, l.map((c) => ({ id: c.id, descricao: c.convenio })));
  }));

  app.get('/cadastros/convenio/PlanosConvenio/', a(async (req, res) => {
    const conv = req.GET.get('conv', '');
    let pls = [];
    // paciente sem convênio: a tela manda "None", "null" ou vazio
    if (conv && /^\d+$/.test(conv)) {
      const P = 'TbPlanos';
      const l = db.linhas(P, await db.tabela(P).where(db.coluna(P, 'fk_convenio_id'), conv).orderBy(db.coluna(P, 'descricao')));
      pls = l.map((p) => ({ id: p.id, descricao: p.descricao }));
    }
    json(res, pls);
  }));

  app.get('/cadastros/medicos/SelecionaMedico/', a(async (req, res) => {
    const M = 'TbMedicos';
    const clinica = req.user.fk_clinica_id === null ? 'None' : String(req.user.fk_clinica_id);
    const q = db.tabela(M);
    db.like(q, db.coluna(M, 'clinicas_que_atende'), `%${clinica.replace(/[\\%_]/g, (c) => '\\' + c)}%`, { binario: true });
    q.where(db.coluna(M, 'ativo'), 'True').orderBy(db.coluna(M, 'medico'));
    json(res, db.linhas(M, await q).map((m) => ({ id: m.id, descricao: m.medico })));
  }));
};
