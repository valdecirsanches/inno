'use strict';
/**
 * Listas usadas pelos campos de seleção (selectize) de várias telas:
 * convênios, planos e médicos (Cadastros/Convenio e Cadastros/Medicos).
 */
const db = require('../db');
const { json } = require('../util/http');
const drf = require('../util/drf');
const { exige, escapaLike } = require('../util/python');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = function (app) {
  // Cadastros/ajax.LocalizaCID: código ou descrição contém o texto, por código
  app.get('/cadastros/LocalizaCID/', a(async (req, res) => {
    const cid = exige(req.GET, 'cid');
    const C = 'CID10', p = `%${escapaLike(cid)}%`;
    const q = db.tabela(C).where((w) => { db.like(w, db.coluna(C, 'codigo'), p); db.like(w, db.coluna(C, 'descricao'), p, { ou: true }); })
      .orderBy(db.coluna(C, 'codigo'));
    json(res, { success: db.linhas(C, await q).map((c) => ({ id: c.id, codigo: c.codigo, descricao: c.descricao })) });
  }));

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

  // Cadastros/Auxiliares: procedimentos e especialidades
  app.get('/cadastros/auxiliares/SelecionaProcedimento/', a(async (req, res) => {
    const P = 'TbProcedimentos';
    json(res, db.linhas(P, await db.tabela(P)).map((p) => ({ id: p.id, descricao: p.descricao })));
  }));

  app.get('/cadastros/auxiliares/SelecionaEspecialidade/', a(async (req, res) => {
    const E = 'TbEspecialidades';
    json(res, db.linhas(E, await db.tabela(E)).map((e) => ({ id: e.id, descricao: e.nome })));
  }));

  // API /api/especialidade/ (ModelViewSet: só leitura é usada pelas telas)
  const E = 'TbEspecialidades';
  const filtraEsp = (req) => {
    const q = db.tabela(E);
    const ids = req.GET.get('id__in');
    if (ids) q.whereIn(db.coluna(E, 'id'), ids.split(','));
    drf.aplicaBusca(q, E, ['nome', 'grupo'], req.GET.get('search'));
    return q;
  };
  app.get('/api/especialidade/', a(async (req, res) => {
    await drf.listaPaginada(req, res, filtraEsp(req), async (l) => drf.serializaModelo(E, db.linha(E, l)));
  }));
  app.get('/api/especialidade/:id/', a(async (req, res) => {
    const l = await filtraEsp(req).where(db.coluna(E, 'id'), req.params.id).first();
    if (!l) return drf.naoEncontrado(res, E);
    drf.responde(res, drf.serializaModelo(E, db.linha(E, l)));
  }));
};
