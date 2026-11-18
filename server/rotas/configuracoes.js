'use strict';
/**
 * Configuracoes/*: modelos de exames, prescrições e relatórios do médico.
 */
const config = require('../config');
const db = require('../db');
const { render } = require('../templates');
const { json } = require('../util/http');
const modelo = require('../util/modelo');
const { obtem, erroPython } = require('../util/orm');
const { exige } = require('../util/python');
const { formata } = require('../util/formato-data');
const { numero, formulario, listaErros, cidsDe } = require('./prontuario');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const col = (m, at) => db.coluna(m, at);
const dataSalvo = (o) => { if (!o.data_salvo) throw erroPython("'NoneType' object has no attribute 'strftime'"); return formata(o.data_salvo, 'd/m/Y'); };
const doMedico = (q, m, coluna, id) => (id === null || id === undefined ? q.whereNull(col(m, coluna)) : q.where(col(m, coluna), id));
// HttpResponse(..., mimetype=...) não existe no Django 3: erro
// "salvar como padrão": nome repetido só conta na lista do mesmo médico (a que ele vê) e volta
// como {"error": "existe"}; registro de origem inexistente (ainda não salvo) volta {"error": "salve"}.
// Antes: erro 500 ("mimetype") ou "matching query does not exist", e a tela não avisava nada.
const doMesmoMedico = (q, M, medicoId) => (medicoId === null || medicoId === undefined
  ? q.whereNull(col(M, 'fk_medico_id')) : q.where(col(M, 'fk_medico_id'), medicoId));
const buscaOrigem = async (M, id) => (/^\d+$/.test(String(id)) ? db.busca(M, { id: parseInt(id, 10) }) : null);
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
    const ex = await buscaOrigem('TbExames', exame);
    if (!ex) return json(res, { error: 'salve' });
    // o padrão vai para a lista do médico do usuário; sem médico, a do exame
    const medicoId = req.user.fk_medico_id || ex.fk_medico_id;
    if (await doMesmoMedico(db.tabela(CE).where(col(CE, 'nome'), desc), CE, medicoId).first()) return json(res, { error: 'existe' });
    await modelo.salva(req, CE, { fk_medico_id: medicoId, nome: desc, descricao: ex.descricao, pedido: ex.pedido, motivo: ex.motivo, cid10: ex.cid10 });
    json(res, { success: ex.id });
  }));
  app.get(`${C}/exames/CarregaConfExame/`, a(async (req, res) => {
    const e = await obtem(CE, { id: numero(exige(req.GET, 'exames')) });
    // sem CID gravado: antes dava erro ao abrir (str.split em None)
    json(res, { success: { id: e.id, dataSalvo: dataSalvo(e), fields: modelo.inicialEmTexto(CE, e), cid: await cidsDe(e.cid10 || '') } });
  }));
  app.get(`${C}/exames/CarregaConfExames/`, a(async (req, res) => {
    // usuário sem médico vinculado vê os padrões de todos os médicos (antes só os sem médico)
    const q = req.user.fk_medico_id ? doMedico(db.tabela(CE), CE, 'fk_medico_id', req.user.fk_medico_id) : db.tabela(CE);
    const l = db.linhas(CE, await q.orderBy(col(CE, 'nome')));
    json(res, l.map((i) => ({ id: i.id, nome: i.nome, descricao: i.descricao, data_salvo: dataSalvo(i) })));
  }));
  app.get(`${C}/exames/SalvaConfExame/`, a(async (req, res) => {
    const form = exige(req.GET, 'form'), exame = exige(req.GET, 'exame');
    const inst = String(exame) > '0' ? await obtem(CE, { id: numero(exame) }) : null;
    const { f, obj } = await formulario(CE, form, inst);
    if (!f.valido) dictErro();
    // usuário sem médico vinculado: mantém o médico do padrão
    obj.fk_medico_id = req.user.fk_medico_id || obj.fk_medico_id || null;
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
    const p = await buscaOrigem('TbPrescricoes', presc);
    if (!p) return json(res, { error: 'salve' });
    // o padrão de prescrição precisa de um médico (a coluna não aceita vazio): o do usuário;
    // usuário sem médico vinculado: o da prescrição (antes dava erro 500 e a tela só dizia "Erro")
    const medicoId = req.user.fk_medico_id || p.fk_medico_id;
    if (!medicoId) return json(res, { error: 'medico' });
    if (await doMesmoMedico(db.tabela(CP).where(col(CP, 'nome'), desc), CP, medicoId).first()) return json(res, { error: 'existe' });
    const c = { fk_medico_id: medicoId, nome: desc, cont_esp: !!p.cont_esp, prescricao: p.prescricao };
    await modelo.salva(req, CP, c);
    const RM = 'TbPrescricaoRemedios';
    for (const r of db.linhas(RM, await db.tabela(RM).where(col(RM, 'fk_prescricao_id'), p.id))) {
      await modelo.salva(req, CR, { fk_prescricao_id: c.id, nome: r.nome, qtdade: r.qtdade, unidade: r.unidade, tipo: r.tipo, descricao: r.descricao });
    }
    json(res, { success: p.id });
  }));
  app.get(`${C}/prescricoes/CarregaConfPrescricoes/`, a(async (req, res) => {
    // usuário sem médico vinculado vê os padrões de todos os médicos (antes não via nenhum)
    const q = req.user.fk_medico_id ? doMedico(db.tabela(CP), CP, 'fk_medico_id', req.user.fk_medico_id) : db.tabela(CP);
    const l = db.linhas(CP, await q.orderBy(col(CP, 'nome')));
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
    // usuário sem médico vinculado: mantém o médico do padrão (a coluna não aceita vazio)
    obj.fk_medico_id = req.user.fk_medico_id || obj.fk_medico_id;
    if (!obj.fk_medico_id) return json(res, { error: 'medico' });
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
    const r = await buscaOrigem('TbRelatorios', rel);
    if (!r) return json(res, { error: 'salve' });
    // o padrão vai para a lista do médico do usuário (é a que ele vê); sem médico, a do relatório
    const medicoId = req.user.fk_medico_id || r.fk_medico_id;
    if (await doMesmoMedico(db.tabela(CL).where(col(CL, 'nome'), desc), CL, medicoId).first()) return json(res, { error: 'existe' });
    await modelo.salva(req, CL, { fk_medico_id: medicoId, nome: desc, titulo: r.titulo, texto: r.texto, cid10: r.cid10 });
    json(res, { success: r.id });
  }));
  app.get(`${C}/relatorios/CarregaConfRelatorio/`, a(async (req, res) => {
    const r = await obtem(CL, { id: numero(exige(req.GET, 'relatorio')) });
    // sem CID gravado: antes dava erro ao abrir (str.split em None)
    json(res, { success: { id: r.id, dataSalvo: dataSalvo(r), fields: modelo.inicialEmTexto(CL, r), cid: await cidsDe(r.cid10 || '') } });
  }));
  app.get(`${C}/relatorios/CarregaConfRelatorios/`, a(async (req, res) => {
    // usuário sem médico vinculado vê os padrões de todos os médicos (antes não via os que
    // salvava: o padrão fica com o médico do relatório)
    const q = req.user.fk_medico_id ? doMedico(db.tabela(CL), CL, 'fk_medico_id', req.user.fk_medico_id) : db.tabela(CL);
    const l = db.linhas(CL, await q.orderBy(col(CL, 'nome')));
    json(res, l.map((i) => ({ id: i.id, nome: i.nome, titulo: i.titulo, data_salvo: dataSalvo(i) })));
  }));
  app.get(`${C}/relatorios/SalvaConfRelatorio/`, a(async (req, res) => {
    const form = exige(req.GET, 'form'), rel = exige(req.GET, 'relatorio');
    const inst = String(rel) > '0' ? await obtem(CL, { id: numero(rel) }) : null;
    const { f, obj } = await formulario(CL, form, inst);
    if (!f.valido) return json(res, { error: listaErros(f) });
    // usuário sem médico vinculado: mantém o médico do padrão
    obj.fk_medico_id = req.user.fk_medico_id || obj.fk_medico_id || null;
    await modelo.salva(req, CL, obj);
    json(res, { success: { id_exame: obj.id } });
  }));
  app.get(`${C}/relatorios/ExcluiConfRelatorio/`, a(async (req, res) => {
    await modelo.exclui(req, CL, await obtem(CL, { id: numero(exige(req.GET, 'id')) }));
    json(res, { success: 'OK' });
  }));
};
