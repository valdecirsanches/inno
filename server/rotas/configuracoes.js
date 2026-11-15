'use strict';
/**
 * Configuracoes/*: modelos de exames, prescrições e relatórios do médico.
 */
const config = require('../config');
const db = require('../db');
const { render } = require('../templates');
const { json } = require('../util/http');
const modelo = require('../util/modelo');
const { obtem, relacionado, erroPython } = require('../util/orm');
const { exige } = require('../util/python');
const { formata } = require('../util/formato-data');
const { numero, formulario, listaErros, cidsDe } = require('./prontuario');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const col = (m, at) => db.coluna(m, at);
const dataSalvo = (o) => { if (!o.data_salvo) throw erroPython("'NoneType' object has no attribute 'strftime'"); return formata(o.data_salvo, 'd/m/Y'); };
const doMedico = (q, m, coluna, id) => (id === null || id === undefined ? q.whereNull(col(m, coluna)) : q.where(col(m, coluna), id));
// HttpResponse(..., mimetype=...) não existe no Django 3: erro
const nomeRepetido = () => { throw erroPython("__init__() got an unexpected keyword argument 'mimetype'"); };
const dictErro = () => { throw erroPython('dictionary update sequence element #0 has length 1; 2 is required'); };

module.exports = function (app) {
  const C = '/configuracoes';
  const tela = (tpl) => a(async (req, res) => {
    await render(res, tpl, { host: config.bancoExibido.host, db: config.bancoExibido.nome, usuario: req.user, data: formata(db.hoje(), 'j \\d\\e F \\d\\e Y') });
  });
  app.get(`${C}/exames/`, tela('Configuracoes/Exames/ConfExames.html'));
  app.get(`${C}/prescricoes/`, tela('Configuracoes/Prescricoes/index.html'));
  app.get(`${C}/relatorios/`, tela('Configuracoes/Relatorios/ConfRelatorios.html'));

  // ------------------------------------------------------------ exames
  const CE = 'TbConfExames';
  app.get(`${C}/exames/AdicionaConfExamePadrao/`, a(async (req, res) => {
    const desc = exige(req.GET, 'descricao'), exame = exige(req.GET, 'exame');
    if (!(desc && exame)) return json(res, { error: 'erro' });
    if (await db.tabela(CE).where(col(CE, 'nome'), desc).first()) nomeRepetido();
    const ex = await obtem('TbExames', { id: numero(exame) });
    await modelo.salva(req, CE, { fk_medico_id: req.user.fk_medico_id, nome: desc, descricao: ex.descricao, pedido: ex.pedido, motivo: ex.motivo, cid10: ex.cid10 });
    json(res, { success: ex.id });
  }));
  app.get(`${C}/exames/CarregaConfExame/`, a(async (req, res) => {
    const e = await obtem(CE, { id: numero(exige(req.GET, 'exames')) });
    if (e.cid10 === null || e.cid10 === undefined) throw erroPython("'NoneType' object has no attribute 'split'");
    json(res, { success: { id: e.id, dataSalvo: dataSalvo(e), fields: modelo.inicialEmTexto(CE, e), cid: await cidsDe(e.cid10) } });
  }));
  app.get(`${C}/exames/CarregaConfExames/`, a(async (req, res) => {
    const l = db.linhas(CE, await doMedico(db.tabela(CE), CE, 'fk_medico_id', req.user.fk_medico_id).orderBy(col(CE, 'nome')));
    json(res, l.map((i) => ({ id: i.id, nome: i.nome, descricao: i.descricao, data_salvo: dataSalvo(i) })));
  }));
  app.get(`${C}/exames/SalvaConfExame/`, a(async (req, res) => {
    const form = exige(req.GET, 'form'), exame = exige(req.GET, 'exame');
    const inst = String(exame) > '0' ? await obtem(CE, { id: numero(exame) }) : null;
    const { f, obj } = await formulario(CE, form, inst);
    if (!f.valido) dictErro();
    obj.fk_medico_id = req.user.fk_medico_id;
    await modelo.salva(req, CE, obj);
    json(res, { success: { id_exame: obj.id } });
  }));
  app.get(`${C}/exames/ExcluiConfExame/`, a(async (req, res) => {
    await modelo.exclui(req, CE, await obtem(CE, { id: numero(exige(req.GET, 'id')) }));
    json(res, { success: 'OK' });
  }));

  // ------------------------------------------------------- prescrições
  const CP = 'TbConfPrescricoes', CR = 'TbConfPrescricaoRemedios';
  app.get(`${C}/prescricoes/AdicionaConfPrescricaoPadrao/`, a(async (req, res) => {
    const desc = exige(req.GET, 'descricao'), presc = exige(req.GET, 'prescricao');
    if (!(desc && presc)) return json(res, { error: 'erro' });
    if (await db.tabela(CP).where(col(CP, 'nome'), desc).first()) nomeRepetido();
    const p = await obtem('TbPrescricoes', { id: numero(presc) });
    const c = { fk_medico_id: req.user.fk_medico_id, nome: desc, cont_esp: p.cont_esp, prescricao: p.prescricao };
    await modelo.salva(req, CP, c);
    const RM = 'TbPrescricaoRemedios';
    for (const r of db.linhas(RM, await db.tabela(RM).where(col(RM, 'fk_prescricao_id'), p.id))) {
      await modelo.salva(req, CR, { fk_prescricao_id: c.id, nome: r.nome, qtdade: r.qtdade, unidade: r.unidade, tipo: r.tipo, descricao: r.descricao });
    }
    json(res, { success: p.id });
  }));
  app.get(`${C}/prescricoes/CarregaConfPrescricoes/`, a(async (req, res) => {
    const l = db.linhas(CP, await doMedico(db.tabela(CP), CP, 'fk_medico_id', req.user.fk_medico_id).orderBy(col(CP, 'nome')));
    json(res, l.map((i) => ({ id: i.id, fk_medico_id: i.fk_medico_id, nome: i.nome })));
  }));
  app.get(`${C}/prescricoes/CarregaConfPrescricao/`, a(async (req, res) => {
    const p = await obtem(CP, { id: numero(exige(req.GET, 'prescricao')) });
    json(res, { success: { id: p.id, dataSalvo: dataSalvo(p), fields: modelo.inicialEmTexto(CP, p, { exclui: ['fk_medico'] }) } });
  }));
  app.get(`${C}/prescricoes/SalvaConfPrescricao/`, a(async (req, res) => {
    const form = exige(req.GET, 'form'), presc = exige(req.GET, 'prescricao');
    const inst = presc > '0' ? await obtem(CP, { id: numero(presc) }) : null;
    const f = await modelo.validaForm(CP, new (require('../util/querydict'))(String(form)), { instancia: inst, exclui: ['fk_medico'] });
    if (!f.valido) dictErro();
    const obj = Object.assign(inst ? Object.assign({}, inst) : {}, f.valores);
    obj.fk_medico_id = req.user.fk_medico_id;
    await modelo.salva(req, CP, obj);
    json(res, { success: { id: obj.id, dataSalvo: dataSalvo(obj) } });
  }));
  app.get(`${C}/prescricoes/ExcluiConfPrescricao/`, a(async (req, res) => {
    await modelo.exclui(req, CP, await obtem(CP, { id: numero(exige(req.GET, 'id')) }));
    json(res, { success: 'OK' });
  }));
  app.get(`${C}/prescricoes/SalvaConfPrescricaoRemedio/`, a(async (req, res) => {
    const form = exige(req.GET, 'form'), rem = exige(req.GET, 'remedio'), presc = exige(req.GET, 'prescricao');
    const inst = String(rem) > '0' ? await obtem(CR, { id: numero(rem) }) : null;
    const { f, obj } = await formulario(CR, form, inst);
    if (!f.valido) dictErro();
    // pr.fk_prescricao_id = prescricao (texto): '' grava NULL, não-número dá erro,
    // e a resposta devolve o texto recebido (o Django não relê o objeto)
    obj.fk_prescricao_id = presc === '' ? null : numero(presc);
    await modelo.salva(req, CR, obj);
    json(res, { success: { id_prescricao: presc } });
  }));
  app.get(`${C}/prescricoes/CarregarConfPrescricaoRemedios`, a(async (req, res) => {
    const id = req.GET.get('id_prescricao');
    const q = db.tabela(CR);
    if (id === null) q.whereNull(col(CR, 'fk_prescricao_id')); else q.where(col(CR, 'fk_prescricao_id'), numero(id));
    json(res, { success: db.linhas(CR, await q).map((r) => ({ id: r.id, fk_prescricao_id: r.fk_prescricao_id, nome: r.nome, tipo: r.tipo, qtdade: r.qtdade, unidade: r.unidade, descricao: r.descricao })) });
  }));
  app.get(`${C}/prescricoes/ExcluirConfPrescricaoRemedio`, a(async (req, res) => {
    await modelo.exclui(req, CR, await obtem(CR, { id: numero(exige(req.GET, 'id')) }));
    json(res, { success: 'OK' });
  }));

  // -------------------------------------------------------- relatórios
  const CL = 'TbConfRelatorios';
  app.get(`${C}/relatorios/AdicionaConfRelatorio/`, a(async (req, res) => {
    const desc = exige(req.GET, 'descricao'), rel = exige(req.GET, 'relatorio');
    if (!(desc && rel)) return json(res, { error: 'erro' });
    if (await db.tabela(CL).where(col(CL, 'nome'), desc).first()) nomeRepetido();
    const r = await obtem('TbRelatorios', { id: numero(rel) });
    if (r.fk_medico_id) await relacionado('TbMedicos', r.fk_medico_id);
    await modelo.salva(req, CL, { fk_medico_id: r.fk_medico_id, nome: desc, titulo: r.titulo, texto: r.texto, cid10: r.cid10 });
    json(res, { success: r.id });
  }));
  app.get(`${C}/relatorios/CarregaConfRelatorio/`, a(async (req, res) => {
    const r = await obtem(CL, { id: numero(exige(req.GET, 'relatorio')) });
    if (r.cid10 === null || r.cid10 === undefined) throw erroPython("'NoneType' object has no attribute 'split'");
    json(res, { success: { id: r.id, dataSalvo: dataSalvo(r), fields: modelo.inicialEmTexto(CL, r), cid: await cidsDe(r.cid10) } });
  }));
  app.get(`${C}/relatorios/CarregaConfRelatorios/`, a(async (req, res) => {
    const l = db.linhas(CL, await doMedico(db.tabela(CL), CL, 'fk_medico_id', req.user.fk_medico_id));
    json(res, l.map((i) => ({ id: i.id, nome: i.nome, titulo: i.titulo, data_salvo: dataSalvo(i) })));
  }));
  app.get(`${C}/relatorios/SalvaConfRelatorio/`, a(async (req, res) => {
    const form = exige(req.GET, 'form'), rel = exige(req.GET, 'relatorio');
    const inst = String(rel) > '0' ? await obtem(CL, { id: numero(rel) }) : null;
    const { f, obj } = await formulario(CL, form, inst);
    if (!f.valido) return json(res, { error: listaErros(f) });
    obj.fk_medico_id = req.user.fk_medico_id;
    await modelo.salva(req, CL, obj);
    json(res, { success: { id_exame: obj.id } });
  }));
  app.get(`${C}/relatorios/ExcluiConfRelatorio/`, a(async (req, res) => {
    await modelo.exclui(req, CL, await obtem(CL, { id: numero(exige(req.GET, 'id')) }));
    json(res, { success: 'OK' });
  }));
};
