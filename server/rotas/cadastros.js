'use strict';
/**
 * Cadastros auxiliares: especialidades e planos de saúde
 * (Cadastros/Especialidades e Cadastros/Planos do AppClinic).
 */
const config = require('../config');
const db = require('../db');
const { render } = require('../templates');
const { json } = require('../util/http');
const modelo = require('../util/modelo');
const { obtem, relacionado, int, erroPython } = require('../util/orm');
const { exige, pyStr } = require('../util/python');
const QueryDict = require('../util/querydict');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const col = (m, at) => db.coluna(m, at);

/** filtro id=valor (o Django dá erro se não for número) */
function idFiltro(v) {
  const t = String(v === null || v === undefined ? '' : v).trim();
  if (!/^[-+]?\d+$/.test(t)) throw erroPython(`Field 'id' expected a number but got '${v}'.`);
  return parseInt(t, 10);
}
/** deserialize_form(texto) */
function formDe(t) {
  if (t === null || t === undefined) throw erroPython("'NoneType' object has no attribute 'encode'");
  return new QueryDict(String(t));
}
/** {campo: str(form.initial[campo])} (com ou sem o prefixo id_) */
function iniciais(M, obj, prefixo = '') {
  const f = {};
  for (const c of modelo.camposDoForm(M)) f[prefixo + c.nome] = pyStr(c, obj[c.atributo]);
  return f;
}
/** ModelForm(dados, instance).is_valid() + save() */
async function salvaForm(req, M, texto, inst) {
  const f = await modelo.validaForm(M, formDe(texto), { instancia: inst });
  if (!f.valido) return { erro: Object.keys(f.erros) };
  const obj = Object.assign(inst ? Object.assign({}, inst) : {}, f.valores);
  await modelo.salva(req, M, obj);
  return { obj };
}
/** Model.objects.filter(id=x).delete() dentro de try/except */
async function excluiPorId(req, M, id, ok, falha) {
  try {
    const l = db.linhas(M, await db.tabela(M).where(col(M, 'id'), idFiltro(id)));
    await modelo.excluiLista(req, M, l);
    return { success: ok };
  } catch (e) {
    return { error: falha };
  }
}
const contexto = (req, extra) => Object.assign({ host: config.bancoExibido.host, db: config.bancoExibido.nome, usuario: req.user }, extra);

module.exports = function (app) {
  // ----------------------------------------------------- especialidades
  const E = 'TbEspecialidades';
  app.get('/cadastros/especialidades/', a(async (req, res) => {
    const esp = db.linhas(E, await db.tabela(E));
    await render(res, 'Cadastros/Especialidades/index.html', contexto(req, { Especialidades: esp }));
  }));
  app.get('/cadastros/especialidades/CarregaEspecialidades/', a(async (req, res) => {
    const l = db.linhas(E, await db.tabela(E));
    json(res, l.map((e) => Object.assign({ id: e.id }, iniciais(E, e))));
  }));
  app.get('/cadastros/especialidades/CarregaEspecialidade/', a(async (req, res) => {
    const id = exige(req.GET, 'id');
    const e = await obtem(E, { id: idFiltro(id) });
    json(res, { success: { fields: Object.assign(iniciais(E, e, 'id_'), { id: e.id }), id } });
  }));
  app.get('/cadastros/especialidades/SalvaEspecialidade/', a(async (req, res) => {
    const id = exige(req.GET, 'id'), form = exige(req.GET, 'form');
    const inst = int(id) > 0 ? await obtem(E, { id: idFiltro(id) }) : null;
    const r = await salvaForm(req, E, form, inst);
    if (r.erro) return json(res, { error: r.erro });
    json(res, { success: { id: r.obj.id, row: iniciais(E, r.obj) } });
  }));
  app.get('/cadastros/especialidades/ExcluiEspecialidade/', a(async (req, res) => {
    json(res, await excluiPorId(req, E, exige(req.GET, 'id'), 'Especialidade  excluído da base de dados...', 'Impossivel Excluir Especialidade!'));
  }));

  // -------------------------------------------------- planos de saúde
  const P = 'TbPlanos', C = 'TbConvenio';
  const nomeConvenio = async (p) => (!p.fk_convenio_id ? '' : (await relacionado(C, p.fk_convenio_id)).convenio);
  app.get('/cadastros/planos/', a(async (req, res) => {
    const planos = db.linhas(P, await db.tabela(P));
    const cv = db.linhas(C, await db.tabela(C).orderBy(col(C, 'convenio')));
    await render(res, 'Cadastros/Plano/index.html', contexto(req, { planos, lista_convenios: cv }));
  }));
  app.get('/cadastros/planos/CarregaPlanosSaude/', a(async (req, res) => {
    const ret = [];
    for (const p of db.linhas(P, await db.tabela(P))) {
      const f = { id: p.id };
      for (const c of modelo.camposDoForm(P)) {
        if (c.nome === 'fk_convenio') f.convenio = await nomeConvenio(p);
        else f[c.nome] = pyStr(c, p[c.atributo]);
      }
      ret.push(f);
    }
    json(res, ret);
  }));
  app.get('/cadastros/planos/CarregaPlanoSaude/', a(async (req, res) => {
    const p = await obtem(P, { id: idFiltro(exige(req.GET, 'id')) });
    const f = { id: p.id, id_convenio: await nomeConvenio(p) };
    Object.assign(f, iniciais(P, p, 'id_'));
    json(res, { success: { fields: f, id: p.id } });
  }));
  app.get('/cadastros/planos/SalvaPlanoSaude/', a(async (req, res) => {
    const id = int(exige(req.GET, 'id') || 0), form = exige(req.GET, 'form');
    const inst = id > 0 ? await obtem(P, { id }) : null;
    const r = await salvaForm(req, P, form, inst);
    if (r.erro) return json(res, { error: r.erro });
    const f = iniciais(P, r.obj);
    f.id = r.obj.id;
    f.id_convenio = await nomeConvenio(r.obj);
    json(res, { success: { id: r.obj.id, row: f } });
  }));
  app.get('/cadastros/planos/ExcluiPlanoSaude/', a(async (req, res) => {
    json(res, await excluiPorId(req, P, exige(req.GET, 'id'), 'Plano de saúde excluído da base de dados...', 'Impossivel Excluir plano!'));
  }));
};

// ----------------------------------------------------------- médicos
function medicos(app) {
  const M = 'TbMedicos', H = 'TbHorarios';
  app.get('/cadastros/medicos/', a(async (req, res) => {
    await render(res, 'Cadastros/Medicos/index.html', { settings: { MEMED_URL_API_BASE: config.memed.apiBase, MEMED_URL_SCRIPT_BASE: config.memed.scriptBase } });
  }));
  app.get('/cadastros/medicos/PesquisarDentistas', a(async (req, res) => {
    const l = db.linhas(M, await db.tabela(M));
    json(res, l.map((m) => ({ id: m.id, codigo: m.codigo === null ? null : { __float__: m.codigo }, nome: m.medico })));
  }));
  app.get('/cadastros/medicos/CarregarMedico/', a(async (req, res) => {
    const id = exige(req.GET, 'id');
    const m = await obtem(M, { id: idFiltro(id) });
    json(res, { success: { id, fields: iniciais(M, m, 'id_') } });
  }));
  app.get('/cadastros/medicos/CarregarHorarios/', a(async (req, res) => {
    const periodo = req.GET.get('periodo'), idMed = req.GET.get('medico'), dia = req.GET.get('dia_semana');
    let hrs = [];
    if (periodo && int(idMed)) {
      const q = db.tabela(H);
      db.like(q, col(H, 'agenda_periodo'), `%${String(periodo).replace(/[\\%_]/g, (c) => '\\' + c)}%`);
      q.where(col(H, 'fk_medico_id'), idFiltro(idMed));
      if (dia === null) q.whereNull(col(H, 'dia_semana')); else q.where(col(H, 'dia_semana'), idFiltro(dia));
      hrs = db.linhas(H, await q.orderBy(col(H, 'hora'))).map((h) => ({ id: h.id, periodo: h.agenda_periodo, hr: String(h.hora).slice(0, 5) }));
    }
    json(res, hrs);
  }));
  app.get('/cadastros/medicos/SalvaMedico/', a(async (req, res) => {
    const form = exige(req.GET, 'form');
    const id = exige(req.GET, 'id') || 0;
    const inst = int(id) > 0 ? await obtem(M, { id: idFiltro(id) }) : null;
    const r = await salvaForm(req, M, form, inst);
    if (r.erro) return json(res, { error: r.erro });
    json(res, { success: { id: r.obj.id } });
  }));
  app.get('/cadastros/medicos/ExcluiMedico/', a(async (req, res) => {
    json(res, await excluiPorId(req, M, exige(req.GET, 'id'), 'Médico excluído da base de dados...', 'Impossivel Excluir médico!'));
  }));
}
// ------------------------------------------ convênios e clínicas (JSON)
/** row(): {id, campo: form.initial[campo]} com os valores crus (JsonResponse) */
function linhaJson(M, obj, exclui) {
  const r = { id: obj.id };
  for (const c of modelo.camposDoForm(M, { exclui })) {
    const v = obj[c.atributo];
    r[c.nome] = v !== null && c.tipo === 'FloatField' ? { __float__: v } : v;
  }
  return r;
}
/** form.errors como texto: "Favor corrigir: campo ==> <ul class="errorlist">...</ul>" */
const errosTexto = (f) => Object.entries(f.erros).map(([k, m]) => `Favor corrigir: ${k} ==> <ul class="errorlist"><li>${m}</li></ul>\n`).join('');

function cadastroJson(app, base, M, exclui, { postIdOpcional }) {
  app.get(base, a(async (req, res) => {
    const q = req.corpo;
    const id = q.has('id') ? int(q.get('id') || 0) : 0;
    if (id > 0) return json(res, { success: db.linhas(M, await db.tabela(M).where(col(M, 'id'), id)).map((o) => linhaJson(M, o, exclui)) });
    json(res, db.linhas(M, await db.tabela(M)).map((o) => linhaJson(M, o, exclui)));
  }));
  app.post(base, a(async (req, res) => {
    const idTxt = exige(req.POST, 'id');
    const id = int(postIdOpcional ? idTxt || 0 : idTxt);
    const form = exige(req.POST, 'form');
    const inst = id > 0 ? await obtem(M, { id }) : null;
    const f = await modelo.validaForm(M, formDe(form), { instancia: inst, exclui });
    if (!f.valido) return json(res, { error: errosTexto(f) });
    const obj = Object.assign(inst ? Object.assign({}, inst) : {}, f.valores);
    await modelo.salva(req, M, obj);
    json(res, { success: linhaJson(M, obj, exclui) });
  }));
  app.delete(base, a(async (req, res) => {
    const id = int(exige(req.corpo, 'id'));
    await modelo.exclui(req, M, await obtem(M, { id }));
    json(res, { success: 'Sucesso' });
  }));
}

function convenioClinica(app) {
  const tela = (tpl, comUsuario) => a(async (req, res) => {
    const ctx = { host: config.bancoExibido.host, db: config.bancoExibido.nome };
    if (comUsuario) ctx.usuario = req.user;
    await render(res, tpl, ctx);
  });
  app.get('/cadastros/convenio/', tela('Cadastros/Convenio/index.html', false));
  cadastroJson(app, '/cadastros/convenio/convenio.json', 'TbConvenio', ['id'], { postIdOpcional: true });
  for (const b of ['/cadastros/consultorio/', '/cadastros/clinica/']) {
    app.get(b, tela('Cadastros/Clinica/index.html', true));
    cadastroJson(app, `${b}clinica.json`, 'TbClinica', [], { postIdOpcional: false });
  }

  // Cadastros/Convenio/ajax.FiltrarAtendimentos
  app.get('/cadastros/convenio/FiltrarAtendimentos', a(async (req, res) => {
    const ags = [];
    const dt = req.GET.get('dt');
    if (dt) {
      const md = req.GET.get('md');
      if (md === null) throw erroPython('TbMedicos matching query does not exist.');
      const m = await obtem('TbMedicos', { id: idFiltro(md) });
      const AG = 'TbAgendaCons';
      const { strptimeData } = require('../util/orm');
      const { formata } = require('../util/formato-data');
      const l = db.linhas(AG, await db.tabela(AG).where(col(AG, 'data'), strptimeData(dt).iso).where(col(AG, 'status'), 'ATENDIDO').where(col(AG, 'fk_medico_id'), m.id));
      for (const ag of l) {
        let usu = '';
        try { usu = (await relacionado('TbUsuario', ag.fk_usuario_id)).first_name; } catch (e) { /* except: pass */ }
        const conv = await relacionado('TbConvenio', ag.fk_convenio_id);
        if (!conv) throw erroPython("'NoneType' object has no attribute 'convenio'");
        const pac = await relacionado('TbPacientes', ag.fk_paciente_id);
        if (!pac) throw erroPython("'NoneType' object has no attribute 'paciente'");
        ags.push({ id: ag.id, conv: conv.convenio, paci: pac.paciente, data: formata(ag.data, 'd/m/Y'), guia: ag.guia, user: usu, stat: ag.status });
      }
    }
    json(res, ags);
  }));
}
// Cadastros/views.ResumoAtendimentoView (a tela não usa a lista: só valida)
function resumoAtendimento(app) {
  const ctx = () => ({ host: config.bancoExibido.host, db: config.bancoExibido.nome });
  app.get('/cadastros/ResumoAtendimento/', a(async (req, res) => { await render(res, 'Tarefas/resumo_atendimento.html', ctx()); }));
  app.post('/cadastros/ResumoAtendimento/', a(async (req, res) => {
    const d1 = req.POST.get('data'), md = req.POST.get('fk_medico');
    if (md === null) throw erroPython('TbMedicos matching query does not exist.');
    const m = await obtem('TbMedicos', { id: idFiltro(md) });
    if (d1 !== null && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(d1)) throw erroPython(`["'${d1}' value has an invalid date format. It must be in YYYY-MM-DD format."]`);
    await render(res, 'Tarefas/resumo_atendimento.html', Object.assign(ctx(), { usuario: req.user, lista: [], medico: m, d1 }));
  }));
}
const exportado = module.exports;
module.exports = function (app) { exportado(app); medicos(app); convenioClinica(app); resumoAtendimento(app); };
module.exports.idFiltro = idFiltro;
module.exports.iniciais = iniciais;
module.exports.salvaForm = salvaForm;
module.exports.contexto = contexto;
