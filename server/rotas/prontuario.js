'use strict';
/**
 * Prontuario/*: Anamnese, ExameFisico, Evolucao, HipoteseDiagnostica, Exames,
 * Relatorios, Atestado, Prescricoes e Extras (ajax.py, views.py e as APIs
 * /api/exames, /api/evolucao, /api/hipoteseDiagnostica, /api/relatorio,
 * /api/atestado, /api/prescricao, /api/extras, /api/prontuario/extras).
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db');
const QueryDict = require('../util/querydict');
const { json } = require('../util/http');
const modelo = require('../util/modelo');
const drf = require('../util/drf');
const viewset = require('../util/viewset');
const S = require('../util/serializers');
const { obtem, relacionado, erroPython, naoExiste } = require('../util/orm');
const { pyStr, exige, splitlines, djJson, idadeF } = require('../util/python');
const { formata } = require('../util/formato-data');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const s = (v) => pyStr(null, v);
const col = (m, at) => db.coluna(m, at);
const hoje = () => db.hoje();

/** valor usado num filtro de campo inteiro (o Django dá erro se não for número) */
function numero(v, campo = 'id') {
  const t = String(v === null || v === undefined ? '' : v).trim();
  if (!/^[-+]?\d+$/.test(t)) throw erroPython(`Field '${campo}' expected a number but got '${v}'.`);
  return parseInt(t, 10);
}
/** filter(fk=valor): None vira IS NULL */
function filtraFk(q, coluna, v) { if (v === null || v === undefined) q.whereNull(coluna); else q.where(coluna, numero(v)); return q; }

const dataSalvo = (o, fmt = 'd/m/Y') => {
  if (!o.data_salvo) throw erroPython("'NoneType' object has no attribute 'strftime'");
  return formata(o.data_salvo, fmt);
};
const campos = (M, obj) => modelo.inicialEmTexto(M, obj);
/** deserialize_form(texto): erro se não veio */
function formDe(texto) {
  if (texto === null || texto === undefined) throw erroPython("'NoneType' object has no attribute 'encode'");
  return new QueryDict(String(texto));
}
/** ModelForm(dados, instance=...).is_valid() e form.save(commit=False) */
async function formulario(M, texto, instancia = null) {
  const f = await modelo.validaForm(M, formDe(texto), { instancia });
  const obj = f.valido ? Object.assign(instancia ? Object.assign({}, instancia) : {}, f.valores) : null;
  return { f, obj, nomesErros: Object.keys(f.erros) };
}
/** form.errors.get_json_data() */
function errosJson(f) {
  const codigo = (m) => (m === modelo.MSG.obrigatorio ? 'required' : /escolha/.test(m) ? 'invalid_choice'
    : /no máximo/.test(m) ? 'max_length' : /já existe/.test(m) ? 'unique' : 'invalid');
  const o = {};
  for (const [k, m] of Object.entries(f.erros)) o[k] = [{ message: m, code: codigo(m) }];
  return o;
}
/** a lista "ret += {error}" (nomes dos campos com erro) */
const listaErros = (f) => Object.keys(f.erros);

/** linhas de uma tabela filtradas e ordenadas, já convertidas */
async function lista(M, filtro, ordem) {
  const q = db.tabela(M);
  filtro(q);
  if (ordem) for (const o of ordem) q.orderBy(col(M, o.replace(/^-/, '')), o.startsWith('-') ? 'desc' : 'asc');
  return db.linhas(M, await q);
}
const corpo = (req) => req.corpo;   // QueryDict(request.body)

/** model_to_dict de CID10 dos códigos (filter(codigo__in=...)) */
async function cidsDe(texto) {
  const cods = String(texto).split(',');
  const l = await db.tabela('CID10').whereIn(col('CID10', 'codigo'), cods);
  return db.linhas('CID10', l).map((c) => ({ id: c.id, codigo: c.codigo, descricao: c.descricao }));
}

/** a ação get-consulta das APIs do prontuário */
async function getConsulta(req, res, extras = () => ({}), { variante = 'get' } = {}) {
  let ag;
  if (variante === 'last') {
    const id = (dadoDe(req, 'id_consulta', '0') || '0');
    const l = await db.tabela('TbAgendaCons').where(col('TbAgendaCons', 'id'), numero(id)).orderBy('id', 'desc').first();
    ag = db.linha('TbAgendaCons', l);
  } else {
    ag = await obtem('TbAgendaCons', { id: numero(dadoDe(req, 'id_consulta', '0')) });
  }
  let med;
  if (req.user.fk_medico_id) { const m = await relacionado('TbMedicos', req.user.fk_medico_id); med = { id: m.id, medico: m.medico }; } else {
    if (!ag) throw erroPython("'NoneType' object has no attribute 'fk_medico'");
    const m = await relacionado('TbMedicos', ag.fk_medico_id);
    if (!m) throw erroPython("'NoneType' object has no attribute 'id'");
    med = { id: m.id, medico: m.medico };
  }
  if (!ag) return json(res, { success: 'Sucesso!' });
  const A = db.modelo('TbAgendaCons')._porAtributo;
  const p = await relacionado('TbPacientes', ag.fk_paciente_id);
  const base = { hora: djJson(A.hora, ag.hora), data: ag.data };
  const resto = await extras(ag, A);
  if (!p) throw erroPython("'NoneType' object has no attribute 'id'");
  json(res, { success: Object.assign(base, resto.antes || {}, { fk_medico: med, fk_consulta: { id: ag.id }, fk_paciente: { id: p.id } }, resto.depois || {}) });
}

/** request.data.get(chave, padrao) para JSON ou formulário */
function dadoDe(req, chave, padrao) {
  const d = req.data;
  if (d && typeof d.getlist === 'function') return d.has(chave) ? d.get(chave) : padrao;
  if (d && typeof d === 'object' && Object.prototype.hasOwnProperty.call(d, chave)) return d[chave];
  return padrao;
}
/** request.data[chave] (KeyError se não veio) */
function dadoObrigatorio(req, chave) {
  const d = req.data;
  if (d && typeof d.getlist === 'function') return exige(d, chave);
  if (d && typeof d === 'object' && Object.prototype.hasOwnProperty.call(d, chave)) return d[chave];
  throw erroPython(`KeyError: '${chave}'`);
}

/** int(query_params.get('id_prontuario', '0')) > 0 -> filtra; senão vazio */
function porProntuario(M, chave = 'id_prontuario', campo = 'fk_prontuario_id', { emParams = false } = {}) {
  return (req, detalhe) => {
    const q = db.tabela(M);
    if (detalhe) return q;
    if (emParams) {
      if (!req.GET.has(chave)) return q.whereRaw('1 = 0');
      const id = req.GET.get(chave, '0') || '';
      if (numero(id === '' ? 'x' : id) > 0) return q.where(col(M, campo), id);
      return q.whereRaw('1 = 0');
    }
    const id = parseIntPy(req.GET.get(chave, '0'));
    if (id > 0) return q.where(col(M, campo), id);
    return q.whereRaw('1 = 0');
  };
}
function parseIntPy(v) {
  const t = String(v).trim();
  if (!/^[-+]?\d+$/.test(t)) throw erroPython(`invalid literal for int() with base 10: '${v}'`);
  return parseInt(t, 10);
}

/** ações comuns: medico, grava-medico, clonar/clone */
function acoesComuns(M, { clonar = 'clonar', relatorioQuebrado = false } = {}) {
  const acoes = [
    { nome: 'medico', detalhe: true, metodos: ['post'], fn: async (req, res, o) => {
      if (!o.fk_medico_id) return json(res, { id: o.fk_medico_id === undefined ? null : o.fk_medico_id, idd: req.user.fk_medico_id });
      json(res, { id: o.fk_medico_id });
    } },
    { nome: 'grava_medico', url: 'grava-medico', detalhe: true, metodos: ['post'], fn: async (req, res, o) => {
      o.fk_medico_id = dadoObrigatorio(req, 'id_medico');
      await modelo.salva(req, M, o);
      json(res, { success: 'Sucesso!' });
    } },
  ];
  if (clonar) {
    acoes.push({ nome: clonar, detalhe: true, metodos: ['post'], fn: async (req, res, o) => {
      // Relatorios importa datetime de django.utils.datetime_safe: datetime.datetime não existe
      if (relatorioQuebrado) throw erroPython("type object 'datetime' has no attribute 'datetime'");
      delete o.id;
      o.data_salvo = db.agora();
      await modelo.salva(req, M, o);
      json(res, { success: o.id });
    } });
  }
  return acoes;
}

/** serializer padrão das seções: fk_medico aninhado + dataSalvo */
function serSecao(M, extra = []) {
  return {
    declarados: [
      ['fk_medico', S.relacionadoSerializado('TbMedicos', S.medico, 'fk_medico_id')],
      ['dataSalvo', async (o) => (o.data_salvo ? formata(o.data_salvo, 'd/m/Y H:i') : '')],
      ...extra,
    ],
    // registros antigos sem médico: aceitar o null quando o modelo deixa a chave vazia
    gravaveis: { fk_medico: S.relacionadoGravavel('TbMedicos', 'fk_medico_id', { aceitaNulo: !!(db.modelo(M)._porAtributo.fk_medico || {}).nulo }) },
  };
}

/** HTML do último diagnóstico (CarregaHipoteseDiagnostica e afins) */
async function descreveCids(texto) {
  let t = '';
  for (const i of String(texto).split(',')) {
    const l = await db.tabela('CID10').where(col('CID10', 'codigo'), i).first();
    t += `${l ? l[col('CID10', 'descricao')] : i}; `;
  }
  return t;
}

/** ModelForm(instance=x).save(commit=False) com id = None: cópia só dos campos do form */
function copiaPeloForm(M, o) {
  const n = {};
  for (const c of modelo.camposDoForm(M)) n[c.atributo] = o[c.atributo];
  for (const c of db.modelo(M).campos) if (!(c.atributo in n) && !c.pk) n[c.atributo] = o[c.atributo];
  return n;
}

module.exports = function (app) {
  const P = '/prontuario';

  // =============================================================== ANAMNESE
  const anamneseUltima = (an, fmt) => {
    let historia = '';
    if (an.queixa_historia === null || an.queixa_historia === undefined) throw erroPython("'NoneType' object has no attribute 'splitlines'");
    for (const line of splitlines(an.queixa_historia)) historia += `${line} <br>`;
    return { historia, data: formata(an.data_salvo, fmt) };
  };
  app.get(`${P}/Anamnese/CarregaAnamnese/`, a(async (req, res) => {
    const pac = exige(req.GET, 'paciente');
    const M = 'TbAnamnese';
    const lst = await lista(M, (q) => filtraFk(q, col(M, 'fk_prontuario_id'), pac), ['-data_salvo']);
    const af = lst[0] || null;
    let ret = {};
    let an;
    if (af && af.data_salvo.slice(0, 10) >= hoje()) {
      ret = { id: af.id, dataSalvo: dataSalvo(af), fields: campos(M, af) };
      an = lst.length > 1 ? lst[1] : lst[lst.length - 1];
    } else an = af;
    if (!an) throw erroPython("'NoneType' object has no attribute 'queixa_historia'");
    const { historia } = anamneseUltima(an, 'd/m/Y');
    ret.ultima = `
    <h3>Ultima Anamnese : ${dataSalvo(an)} <h3>
    <h4>Queixa Principal:<br></h4>
    <h2 class="m-b-n-sm">
        ${s(an.queixa_principal)}
    </h2><br>
    <h4>Historia:<br></h4>
    <p>
        ${historia}
    </p>
    `;
    json(res, { success: ret });
  }));

  async function salvaSimples(req, res, M, texto) {
    const { f, obj } = await formulario(M, texto);
    if (f.valido) {
      await modelo.salva(req, M, obj);
      return json(res, { success: { id: obj.id, dataSalvo: dataSalvo(obj) } });
    }
    json(res, { error: listaErros(f) });
  }
  app.get(`${P}/Anamnese/SalvaAnamnese/`, a(async (req, res) => salvaSimples(req, res, 'TbAnamnese', exige(req.GET, 'form'))));

  app.get(`${P}/Anamnese/anamnese.json/`, a(async (req, res) => {
    const pac = exige(req.GET, 'paciente');
    const M = 'TbAnamnese';
    const lst = await lista(M, (q) => filtraFk(q, col(M, 'fk_prontuario_id'), pac), ['-data_salvo']);
    const af = lst[0] || null;
    if (!af) throw erroPython("'NoneType' object has no attribute 'data_salvo'");
    let ret = {};
    let an;
    if (af.data_salvo.slice(0, 10) >= hoje()) {
      ret = { id: af.id, dataSalvo: dataSalvo(af, 'd/m/Y H:i:s'), fields: campos(M, af) };
      an = lst.length > 1 ? lst[1] : lst[lst.length - 1];
    } else an = af;
    const { historia } = anamneseUltima(an, 'd/m/Y H:i:s');
    ret.ultima = `
           <h3>Ultima Anamnese : ${dataSalvo(an, 'd/m/Y H:i:s')} <h3>
           <h4>Queixa Principal:<br></h4>
           <h2 class="m-b-n-sm">
               ${s(an.queixa_principal)}
           </h2><br>
           <h4>Historia:<br></h4>
           <p>
               ${historia}
           </p>
           `;
    const pr = await relacionado('TbPacientes', an.fk_prontuario_id);
    if (!pr) throw erroPython("'NoneType' object has no attribute 'id'");
    ret.paciente = pr.id;
    json(res, { success: ret });
  }));
  app.post(`${P}/Anamnese/anamnese.json/`, a(async (req, res) => json(res, {})));
  app.put(`${P}/Anamnese/anamnese.json/`, a(async (req, res) => salvaSimples(req, res, 'TbAnamnese', corpo(req).get('form'))));

  // =========================================================== EXAME FÍSICO
  app.get(`${P}/ExameFisico/CarregaExameFisico/`, a(async (req, res) => {
    const M = 'TbExameFisico';
    const ef = await obtem(M, { id: numero(exige(req.GET, 'exameFisico')) });
    json(res, { success: { id: ef.id, dataSalvo: dataSalvo(ef), fields: campos(M, ef) } });
  }));
  app.get(`${P}/ExameFisico/SalvaExameFisico/`, a(async (req, res) => salvaSimples(req, res, 'TbExameFisico', exige(req.GET, 'form'))));
  app.get(`${P}/ExameFisico/exame_fisico.json/`, a(async (req, res) => json(res, [])));
  app.post(`${P}/ExameFisico/exame_fisico.json/`, a(async (req, res) => json(res, {})));
  app.put(`${P}/ExameFisico/exame_fisico.json/`, a(async (req, res) => salvaSimples(req, res, 'TbExameFisico', corpo(req).get('form'))));

  // =============================================================== EVOLUÇÃO
  async function ultimasEvolucoes(lst, recuo) {
    const pad = ' '.repeat(recuo);
    let u = `
${pad}<h3>Ultima Evolucao : ${dataSalvo(lst[0])} <h3><br>
${pad}<h4>Evolucao:<br></h4>
${pad}<p>
${pad}`;
    const ids = [...new Set(lst.map((e) => e.fk_consulta_id))];
    if (ids.some((x) => x === null)) throw erroPython("int() argument must be a string, a bytes-like object or a number, not 'NoneType'");
    ids.sort((x, y) => y - x);
    for (const et of ids) {
      const e = lst.find((x) => x.fk_consulta_id === et);
      let ev = '';
      if (e.evolucao === null || e.evolucao === undefined) throw erroPython("'NoneType' object has no attribute 'splitlines'");
      for (const line of splitlines(e.evolucao)) ev += `${line} <br>`;
      const p2 = ' '.repeat(recuo + 4);
      u += `
${p2}${dataSalvo(e)}<br>
${p2}${ev}<br>
${p2}`;
    }
    u += '</p>';
    return u;
  }
  app.get(`${P}/Evolucao/CarregaEvolucao/`, a(async (req, res) => {
    const M = 'TbEvolucao';
    const pac = exige(req.GET, 'paciente');
    const lst = await lista(M, (q) => filtraFk(q, col(M, 'fk_prontuario_id'), pac), ['-data_salvo']);
    const ef = lst[0];
    if (!ef) throw erroPython("'NoneType' object has no attribute 'data_salvo'");
    let ret = {};
    if (dataSalvo(ef, 'Y-m-d') >= hoje()) ret = { id: ef.id, dataSalvo: dataSalvo(ef), fields: campos(M, ef) };
    ret.ultima = await ultimasEvolucoes(lst, 4);
    json(res, { success: ret });
  }));
  app.get(`${P}/Evolucao/SalvaEvolucao/`, a(async (req, res) => salvaSimples(req, res, 'TbEvolucao', exige(req.GET, 'form'))));
  app.get(`${P}/Evolucao/evolucao.json/`, a(async (req, res) => json(res, [])));
  app.post(`${P}/Evolucao/evolucao.json/`, a(async (req, res) => json(res, {})));
  app.put(`${P}/Evolucao/evolucao.json/`, a(async (req, res) => {
    const M = 'TbEvolucao';
    const put = corpo(req);
    const ev = parseIntPy(`0${put.get('evolucao', '0')}`);
    const inst = ev > 0 ? await obtem(M, { id: ev }) : null;
    const { f, obj } = await formulario(M, put.get('form'), inst);
    if (!f.valido) return res.status(500).type('application/json').send(require('../util/python').pyJson(errosJson(f)));
    await modelo.salva(req, M, obj);
    json(res, { success: { id_evolucao: obj.id, id_prontuario: obj.fk_prontuario_id } });
  }));

  viewset.registra(app, '/api/evolucao', {
    modelo: 'TbEvolucao', serializer: serSecao('TbEvolucao'), paginar: false,
    filtros: { id: ['in'], fk_prontuario_id: ['exact'] }, busca: ['evolucao'],
    ordenacao: { campos: '__all__', padrao: ['id'] },
    consulta: porProntuario('TbEvolucao'),
    acoes: [
      { nome: 'get_consulta', url: 'get-consulta', detalhe: false, metodos: ['post'], fn: (req, res) => getConsulta(req, res) },
      { nome: 'ultimas_evolucoes', url: 'ultimas-evolucoes', detalhe: false, metodos: ['post'], fn: async (req, res) => {
        const M = 'TbEvolucao';
        const pac = dadoObrigatorio(req, 'paciente');
        let ret = {};
        if (pac) {
          let lst = await lista(M, (q) => filtraFk(q, col(M, 'fk_prontuario_id'), pac), ['-data_salvo']);
          for (const e of lst) {
            if (!e.fk_medico_id) {
              const c = await relacionado('TbAgendaCons', e.fk_consulta_id);
              if (!c) throw erroPython("'NoneType' object has no attribute 'fk_medico'");
              e.fk_medico_id = c.fk_medico_id;
              await modelo.salva(req, M, e);
            }
          }
          lst = await lista(M, (q) => filtraFk(q, col(M, 'fk_prontuario_id'), pac), ['-data_salvo']);
          const ef = lst[0];
          if (ef && dataSalvo(ef, 'Y-m-d') >= hoje()) {
            ret = { id: ef.id, dataSalvo: dataSalvo(ef), fields: campos(M, ef), hoje: dataSalvo(ef) === formata(hoje(), 'd/m/Y') };
          }
          if (ef) ret.ultima = await ultimasEvolucoes(lst, 20);
          ret = { success: ret };
        }
        json(res, ret);
      } },
      ...acoesComuns('TbEvolucao', { clonar: null }),
    ].filter((x) => !['medico', 'grava_medico'].includes(x.nome)),
  });

  // =================================================== HIPÓTESE DIAGNÓSTICA
  async function htmlHipotese(hd, { acentos = false, recuo = 4 } = {}) {
    if (!hd) throw erroPython("'NoneType' object has no attribute 'diagnostico'");
    const diag = hd.diagnostico ? await descreveCids(hd.diagnostico) : '';
    const outros = hd.outros_diagnosticos ? await descreveCids(hd.outros_diagnosticos) : '';
    let obs = '';
    return { diag, outros, obs };
  }
  function montaHipotese(hd, diag, outros, obs, { acentos, recuo }) {
    const pad = ' '.repeat(recuo);
    const D = acentos ? 'Diagnóstico' : 'Diagnostico';
    const O = acentos ? 'Outros diagnósticos' : 'Outros diagnosticos';
    return `
${pad}<h3>Ultimo ${D}: ${dataSalvo(hd)} <h3>
${pad}${hd.diagnostico ? `<h3>${D}: ${diag} <h3>` : ''}${hd.outros_diagnosticos ? `<h3>${O}: ${outros}</h3>` : ''}${obs ? `<h4>Obs:<br></h4><p>${obs}</p>` : ''} `;
  }
  const obsHipotese = (hd, tolerante) => {
    let obs = '';
    if (hd.obs_diagnostico === null || hd.obs_diagnostico === undefined) {
      if (tolerante) return '';
      throw erroPython("'NoneType' object has no attribute 'splitlines'");
    }
    for (const line of splitlines(hd.obs_diagnostico)) obs += `${line} <br>`;
    return obs;
  };
  async function ultimaHipotese(pac) {
    const M = 'TbHipoteseDiagnostica';
    const q = filtraFk(db.tabela(M), col(M, 'fk_prontuario_id'), pac).orderBy('id', 'desc');
    return db.linha(M, await q.first());
  }
  app.get(`${P}/HipoteseDiagnostica/CarregaHipoteseDiagnostica/`, a(async (req, res) => {
    const hd = await ultimaHipotese(exige(req.GET, 'paciente'));
    const { diag, outros } = await htmlHipotese(hd);
    const obs = obsHipotese(hd, false);
    json(res, { success: montaHipotese(hd, diag, outros, obs, { acentos: false, recuo: 4 }) });
  }));
  async function salvaHipotese(req, res, texto, hipotese) {
    const M = 'TbHipoteseDiagnostica';
    if (hipotese === null || hipotese === undefined) throw erroPython("'<' not supported between instances of 'NoneType' and 'str'");
    // "if hipoteseDiagnostica < '0'": compara texto; só altera com número negativo
    const inst = hipotese < '0' ? await obtem(M, { id: numero(hipotese) }) : null;
    const { f, obj } = await formulario(M, texto, inst);
    if (f.valido) { await modelo.salva(req, M, obj); return json(res, { success: { id: obj.id, dataSalvo: dataSalvo(obj) } }); }
    json(res, { error: listaErros(f) });
  }
  app.get(`${P}/HipoteseDiagnostica/SalvaHipoteseDiagnostica/`, a(async (req, res) => {
    const form = exige(req.GET, 'form');
    return salvaHipotese(req, res, form, exige(req.GET, 'hipoteseDiagnostica'));
  }));
  app.get(`${P}/HipoteseDiagnostica/hipotese_diagnostica.json/`, a(async (req, res) => {
    const hd = await ultimaHipotese(exige(req.GET, 'paciente'));
    const { diag, outros } = await htmlHipotese(hd);
    const obs = obsHipotese(hd, false);
    json(res, { success: montaHipotese(hd, diag, outros, obs, { acentos: true, recuo: 12 }) });
  }));
  app.post(`${P}/HipoteseDiagnostica/hipotese_diagnostica.json/`, a(async (req, res) => json(res, {})));
  app.put(`${P}/HipoteseDiagnostica/hipotese_diagnostica.json/`, a(async (req, res) => {
    const put = corpo(req);
    return salvaHipotese(req, res, put.get('form'), put.get('hipoteseDiagnostica'));
  }));

  viewset.registra(app, '/api/hipoteseDiagnostica', {
    modelo: 'TbHipoteseDiagnostica', serializer: serSecao('TbHipoteseDiagnostica'), paginar: false,
    filtros: { id: ['in'], fk_prontuario_id: ['exact'] }, busca: ['descricao'],
    ordenacao: { campos: '__all__', padrao: ['-id'] },
    consulta: porProntuario('TbHipoteseDiagnostica'),
    acoes: [
      ...acoesComuns('TbHipoteseDiagnostica'),
      { nome: 'get_consulta', url: 'get-consulta', detalhe: false, metodos: ['post'], fn: (req, res) => getConsulta(req, res, undefined, { variante: 'last' }) },
      { nome: 'get_ultima_hipotese', url: 'get-ultima-hipotese-diagnostica', detalhe: false, metodos: ['post'], fn: async (req, res) => {
        const pac = parseIntPy(req.GET.get('id_prontuario', '0'));
        const hd = await ultimaHipotese(pac);
        const { diag, outros } = await htmlHipotese(hd);
        const obs = obsHipotese(hd, true);
        json(res, { success: { ret: montaHipotese(hd, diag, outros, obs, { acentos: false, recuo: 12 }), id: hd.id } });
      } },
    ],
  });

  // ================================================================= EXAMES
  async function rowExame(id) {
    const M = 'TbExames';
    const e = await obtem(M, { id });
    const fields = campos(M, e);
    const row = {};
    for (const [k, v] of Object.entries(fields)) row[k.slice(3)] = v;
    fields.id = e.id; row.id = e.id;
    fields.id_data_salvo = dataSalvo(e, 'd/m/Y H:i:s');
    row.data_salvo = dataSalvo(e, 'd/m/Y H:i:s');
    if (e.cid10 === null || e.cid10 === undefined) throw erroPython("'NoneType' object has no attribute 'split'");
    const cid = await cidsDe(e.cid10);
    return { success: { id: e.id, dataSalvo: dataSalvo(e, 'd/m/Y H:i:s'), fields, row, cid } };
  }
  app.get(`${P}/Exames/CarregaExame/`, a(async (req, res) => {
    const M = 'TbExames';
    const e = await obtem(M, { id: numero(exige(req.GET, 'exames')) });
    const fields = campos(M, e);
    if (e.cid10 === null || e.cid10 === undefined) throw erroPython("'NoneType' object has no attribute 'split'");
    const cid = await cidsDe(e.cid10);
    json(res, { success: { id: e.id, dataSalvo: dataSalvo(e), fields, cid } });
  }));
  app.get(`${P}/Exames/CarregaExames/`, a(async (req, res) => {
    const M = 'TbExames';
    const pr = req.GET.get('id_prontuario');
    const l = await lista(M, (q) => filtraFk(q, col(M, 'fk_prontuario_id'), pr), ['-id']);
    json(res, l.map((i) => ({ id: i.id, descricao: i.descricao, pedido: i.pedido, data_salvo: dataSalvo(i) })));
  }));
  app.get(`${P}/Exames/SalvaExame/`, a(async (req, res) => {
    const M = 'TbExames';
    const form = exige(req.GET, 'form');
    const exame = exige(req.GET, 'exame');
    const inst = String(exame) > '0' ? await obtem(M, { id: numero(exame) }) : null;
    const { f, obj } = await formulario(M, form, inst);
    if (f.valido) { await modelo.salva(req, M, obj); return json(res, { success: { id_exame: obj.id, id_prontuario: obj.fk_prontuario_id } }); }
    // "ret += dict(error)": dict('nome_do_campo') dá erro
    throw erroPython('dictionary update sequence element #0 has length 1; 2 is required');
  }));
  app.get(`${P}/Exames/DuplicaExame/`, a(async (req, res) => {
    const M = 'TbExames';
    const e = await obtem(M, { id: numero(exige(req.GET, 'exame')) });
    const n = copiaPeloForm(M, e);
    await modelo.salva(req, M, n);
    json(res, { success: { id: n.id, dataSalvo: dataSalvo(n) } });
  }));
  app.get(`${P}/Exames/ExcluiExame/`, a(async (req, res) => {
    const M = 'TbExames';
    await modelo.exclui(req, M, await obtem(M, { id: numero(exige(req.GET, 'id')) }));
    json(res, { success: 'OK' });
  }));
  app.get(`${P}/Exames/UtilizaConfExame/`, a(async (req, res) => {
    const conf = exige(req.GET, 'conf'), pr = exige(req.GET, 'prontuario'), cons = exige(req.GET, 'consulta'), med = exige(req.GET, 'medico');
    const c = await obtem('TbConfExames', { id: numero(conf) });
    const e = { fk_prontuario_id: pr, fk_consulta_id: cons, fk_medico_id: med, descricao: c.descricao, pedido: c.pedido, motivo: c.motivo, cid10: c.cid10 };
    await modelo.salva(req, 'TbExames', e);
    json(res, { success: e.id });
  }));
  app.get(`${P}/Exames/exames.json/`, a(async (req, res) => {
    const M = 'TbExames';
    const pr = req.GET.get('id_prontuario', '0');
    if (pr > '0') {
      const l = await lista(M, (q) => q.where(col(M, 'fk_prontuario_id'), numero(pr)), ['-id']);
      const out = [];
      for (const i of l) {
        const m = await relacionado('TbMedicos', i.fk_medico_id);
        if (!m) throw erroPython("'NoneType' object has no attribute 'medico'");
        out.push({ id: i.id, descricao: i.descricao, pedido: i.pedido, medico: m.medico, data_salvo: dataSalvo(i, 'd/m/Y H:i:s') });
      }
      return json(res, out);
    }
    json(res, { error: 'Erro' }, 500);
  }));
  app.post(`${P}/Exames/exames.json/`, a(async (req, res) => json(res, await rowExame(numero(exige(corpo(req), 'exames'))))));
  app.put(`${P}/Exames/exames.json/`, a(async (req, res) => {
    const M = 'TbExames';
    const put = corpo(req);
    const exame = put.get('exame');
    const inst = s(exame) > '0' ? await obtem(M, { id: numero(exame) }) : null;
    const { f, obj } = await formulario(M, put.get('form'), inst);
    if (!f.valido) return res.status(500).type('application/json').send(require('../util/python').pyJson(errosJson(f)));
    await modelo.salva(req, M, obj);
    json(res, await rowExame(obj.id));
  }));
  app.patch(`${P}/Exames/exames.json/`, a(async (req, res) => {
    const M = 'TbExames';
    const p = corpo(req);
    const e = await obtem(M, { id: numero(exige(p, 'exame')) });
    const consulta = parseIntPy(exige(p, 'consulta') || 0);
    const n = copiaPeloForm(M, e);
    if (consulta > 0) await obtem('TbAgendaCons', { id: consulta });
    n.data_salvo = db.agora();
    await modelo.salva(req, M, n);
    json(res, await rowExame(n.id));
  }));
  app.delete(`${P}/Exames/exames.json/`, a(async (req, res) => {
    const p = corpo(req);
    if (p.has('acao') && p.get('acao')) {
      const ex = exige(p, 'exame');
      let ret;
      try { const c = await obtem('TbConfExames', { id: numero(ex) }); await modelo.exclui(req, 'TbConfExames', c); ret = { success: 'OK' }; } catch (e) { ret = { error: 'e.args' }; }
      return json(res, ret);
    }
    const M = 'TbExames';
    await modelo.exclui(req, M, await obtem(M, { id: numero(exige(p, 'id')) }));
    json(res, { success: 'OK' });
  }));

  viewset.registra(app, '/api/exames', {
    modelo: 'TbExames', serializer: serSecao('TbExames'), paginar: false,
    filtros: { id: ['in'], fk_prontuario_id: ['exact'] }, busca: ['descricao'],
    ordenacao: { campos: '__all__', padrao: ['-id'] },
    consulta: porProntuario('TbExames'),
    acoes: [...acoesComuns('TbExames', { clonar: 'clone' }),
      { nome: 'get_consulta', url: 'get-consulta', detalhe: false, metodos: ['post'], fn: (req, res) => getConsulta(req, res) }],
  });

  // ============================================================= RELATÓRIOS
  async function carregaRelatorio(r, fmt) {
    const M = 'TbRelatorios';
    const fields = campos(M, r);
    const cid = r.cid10 ? await cidsDe(r.cid10) : [];
    return { success: { id: r.id, dataSalvo: dataSalvo(r, fmt), fields, cid } };
  }
  app.get(`${P}/Relatorios/`, a(async (req, res) => {
    const r = await obtem('TbRelatorios', { id: numero(exige(req.GET, 'relatorio')) });
    json(res, await carregaRelatorio(r, 'd/m/Y'));
  }));
  app.get(`${P}/Relatorios/CarregaRelatorios/`, a(async (req, res) => {
    const M = 'TbRelatorios';
    const l = await lista(M, (q) => filtraFk(q, col(M, 'fk_prontuario_id'), req.GET.get('id_prontuario')), ['-id']);
    json(res, l.map((i) => ({ id: i.id, titulo: i.titulo, data_salvo: dataSalvo(i) })));
  }));
  app.get(`${P}/Relatorios/SalvaRelatorio/`, a(async (req, res) => {
    const M = 'TbRelatorios';
    const form = exige(req.GET, 'form');
    const rel = exige(req.GET, 'relatorio');
    const inst = rel > '0' ? await obtem(M, { id: numero(rel) }) : null;
    const { f, obj } = await formulario(M, form, inst);
    if (f.valido) { await modelo.salva(req, M, obj); return json(res, { success: { id: obj.id, dataSalvo: dataSalvo(obj), id_prontuario: obj.fk_prontuario_id } }); }
    json(res, { error: listaErros(f) });
  }));
  app.get(`${P}/Relatorios/DuplicaRelatorio/`, a(async (req, res) => {
    const M = 'TbRelatorios';
    const r = await obtem(M, { id: numero(exige(req.GET, 'relatorio')) });
    const n = copiaPeloForm(M, r);
    await modelo.salva(req, M, n);
    json(res, { success: { id: n.id, dataSalvo: dataSalvo(n) } });
  }));
  app.get(`${P}/Relatorios/ExcluiRelatorio/`, a(async (req, res) => {
    await modelo.exclui(req, 'TbRelatorios', await obtem('TbRelatorios', { id: numero(exige(req.GET, 'id')) }));
    json(res, { success: 'OK' });
  }));
  app.get(`${P}/Relatorios/UtilizaConfRelatorio/`, a(async (req, res) => {
    const conf = exige(req.GET, 'conf'), pr = exige(req.GET, 'prontuario'), cons = exige(req.GET, 'consulta');
    const c = await obtem('TbConfRelatorios', { id: numero(conf) });
    const r = { fk_prontuario_id: pr, fk_consulta_id: cons, fk_medico_id: req.user.fk_medico_id, titulo: c.titulo, texto: c.texto, cid10: c.cid10 };
    await modelo.salva(req, 'TbRelatorios', r);
    json(res, { success: r.id });
  }));
  app.get(`${P}/Relatorios/relatorios.json/`, a(async (req, res) => {
    const M = 'TbRelatorios';
    const pr = req.GET.get('id_prontuario') || null;
    if (pr) {
      const l = await lista(M, (q) => q.where(col(M, 'fk_prontuario_id'), numero(pr)), ['-id']);
      return json(res, l.map((i) => ({ id: i.id, titulo: i.titulo, data_salvo: dataSalvo(i, 'd/m/Y H:i:s') })));
    }
    json(res, { error: 'vazio' });
  }));
  app.post(`${P}/Relatorios/relatorios.json/`, a(async (req, res) => {
    const r = await obtem('TbRelatorios', { id: numero(exige(corpo(req), 'relatorio')) });
    json(res, await carregaRelatorio(r, 'd/m/Y H:i:s'));
  }));
  app.put(`${P}/Relatorios/relatorios.json/`, a(async (req, res) => {
    const M = 'TbRelatorios';
    const p = corpo(req);
    const form = exige(p, 'form');
    const rel = parseIntPy(exige(p, 'relatorio') || 0);
    const inst = rel > 0 ? await obtem(M, { id: rel }) : null;
    const { f, obj } = await formulario(M, form, inst);
    if (!f.valido) return json(res, { error: listaErros(f) });
    await modelo.salva(req, M, obj);
    const dsCampo = db.modelo(M)._porAtributo.data_salvo;
    json(res, { success: { id: obj.id, dataSalvo: dataSalvo(obj, 'd/m/Y H:i:s'), id_prontuario: obj.fk_prontuario_id,
      row: { id: obj.id, texto: obj.texto, cid10: obj.cid10, titulo: obj.titulo, data_salvo: djJson(dsCampo, obj.data_salvo) } } });
  }));
  app.patch(`${P}/Relatorios/relatorios.json/`, a(async (req, res) => {
    const M = 'TbRelatorios';
    const p = corpo(req);
    const r = await obtem(M, { id: numero(exige(p, 'relatorio')) });
    const consulta = parseIntPy(exige(p, 'consulta') || 0);
    const n = copiaPeloForm(M, r);
    if (consulta > 0) await obtem('TbAgendaCons', { id: consulta });
    await modelo.salva(req, M, n);
    json(res, { success: { id: n.id, dataSalvo: dataSalvo(n) } });
  }));
  app.delete(`${P}/Relatorios/relatorios.json/`, a(async (req, res) => {
    const p = corpo(req);
    if (p.has('acao') && p.get('acao')) {
      const c = await obtem('TbConfRelatorios', { id: numero(exige(p, 'rel')) });
      await modelo.exclui(req, 'TbConfRelatorios', c);
      return json(res, { success: 'OK' });
    }
    await modelo.exclui(req, 'TbRelatorios', await obtem('TbRelatorios', { id: numero(exige(p, 'id')) }));
    json(res, { success: 'OK' });
  }));

  viewset.registra(app, '/api/relatorio', {
    modelo: 'TbRelatorios', serializer: serSecao('TbRelatorios', [['mycid10', async (o) => (o.cid10 ? o.cid10 : '')]]), paginar: false,
    filtros: { id: ['in'], fk_prontuario_id: ['exact'] }, busca: ['descricao'],
    ordenacao: { campos: '__all__', padrao: ['-id'] },
    consulta: porProntuario('TbRelatorios', 'id_prontuario', 'fk_prontuario_id', { emParams: true }),
    acoes: [...acoesComuns('TbRelatorios', { relatorioQuebrado: true }),
      { nome: 'get_consulta', url: 'get-consulta', detalhe: false, metodos: ['post'], fn: (req, res) => getConsulta(req, res) }],
  });

  // =============================================================== ATESTADO
  const camposCrus = (M, o) => {
    const f = {};
    for (const c of modelo.camposDoForm(M)) f[`id_${c.nome}`] = djJson(c, o[c.atributo] === undefined ? null : o[c.atributo]);
    return f;
  };
  app.get(`${P}/Atestado/atestado.json/`, a(async (req, res) => {
    const M = 'TbAtestado';
    const idAt = req.GET.get('id_atestado', null), idPr = req.GET.get('id_prontuario', null), idCons = req.GET.get('id_consulta', null);
    let ret = [];
    if (idAt) {
      const at = await obtem(M, { id: numero(idAt) });
      ret = { success: { id: at.id, fields: camposCrus(M, at), dataSalvo: dataSalvo(at, 'd/m/Y  \\à\\s H:i'), usuario: { first_name: req.user.first_name } } };
    } else if (idPr) {
      const A = db.modelo(M)._porAtributo;
      for (const x of await lista(M, (q) => q.where(col(M, 'fk_prontuario_id'), numero(idPr)), null)) {
        ret.push({ id: x.id, id_prontuario: x.fk_prontuario_id, cid: x.cid, dt_referencia: x.dt_referencia,
          data_salvo: dataSalvo(x, 'd/m/Y \\à\\s H:i:s'), solicitante: x.requerente, chegada: djJson(A.hora_chegada, x.hora_chegada),
          saida: djJson(A.hora_saida, x.hora_saida), dias: `${x.afastado_por || 0} dias.`, success: { data_salvo: dataSalvo(x, 'd/m/Y \\à\\s H:i:s') } });
      }
    } else if (idCons) {
      const ag = await obtem('TbAgendaCons', { id: numero(idCons) });
      const A = db.modelo('TbAgendaCons')._porAtributo;
      const p = await relacionado('TbPacientes', ag.fk_paciente_id);
      if (!p) throw erroPython("'NoneType' object has no attribute 'paciente'");
      ret = { success: { id: ag.id, hora_chegada: djJson(A.hora, ag.hora_chegada || ag.hora), hora: djJson(A.hora, ag.hora), paciente: p.paciente, id_medico: ag.fk_medico_id } };
    }
    json(res, ret);
  }));
  app.post(`${P}/Atestado/atestado.json/`, a(async (req, res) => {
    const id = req.POST.get('id');
    const acao = req.POST.get('acao');
    let ret = {};
    if (acao !== 'IMPRIME') {
      const at = await obtem('TbAtestado', { id: numero(id) });
      ret = { id, fields: camposCrus('TbAtestado', at) };
    }
    json(res, ret);
  }));
  app.put(`${P}/Atestado/atestado.json/`, a(async (req, res) => {
    const M = 'TbAtestado';
    const put = corpo(req);
    const idAt = put.get('id_atestado');
    if (idAt === null) throw erroPython("'>' not supported between instances of 'NoneType' and 'str'");
    const inst = idAt > '0' ? await obtem(M, { id: numero(idAt) }) : null;
    const { f, obj } = await formulario(M, put.get('form'), inst);
    if (!f.valido) return json(res, { error: listaErros(f) });
    obj.fk_usuario_id = req.user.id;
    obj.fk_prontuario_id = put.get('id_paciente');
    obj.fk_consulta_id = put.get('id_consulta');
    await modelo.salva(req, M, obj);
    json(res, { success: { id: obj.id, dataSalvo: dataSalvo(obj) } });
  }));
  app.delete(`${P}/Atestado/atestado.json/`, a(async (req, res) => {
    await modelo.exclui(req, 'TbAtestado', await obtem('TbAtestado', { id: numero(exige(corpo(req), 'id')) }));
    json(res, { success: 'OK' });
  }));

  viewset.registra(app, '/api/atestado', {
    modelo: 'TbAtestado',
    serializer: {
      declarados: [
        ['fk_medico', S.relacionadoSerializado('TbMedicos', S.medico, 'fk_medico_id')],
        ['fk_usuario', S.relacionadoSerializado('TbUsuario', S.usuario, 'fk_usuario_id')],
        ['fk_usuario_nome', async (o) => { if (!o.fk_usuario_id) return ''; const u = await relacionado('TbUsuario', o.fk_usuario_id); return u.first_name; }],
        ['dataSalvo', async (o) => (o.data_salvo ? formata(o.data_salvo, 'd/m/Y H:i') : '')],
        ['mycid10', async (o) => (o.cid ? o.cid : '')],
      ],
      // atestados antigos sem médico/usuário: aceitar o null (no AppClinic a gravação era recusada)
      gravaveis: { fk_medico: S.relacionadoGravavel('TbMedicos', 'fk_medico_id', { aceitaNulo: true }), fk_usuario: S.relacionadoGravavel('TbUsuario', 'fk_usuario_id', { aceitaNulo: true }) },
    },
    paginar: false,
    consulta: porProntuario('TbAtestado'),
    acoes: [...acoesComuns('TbAtestado', { clonar: null }),
      { nome: 'get_consulta', url: 'get-consulta', detalhe: false, metodos: ['post'], fn: (req, res) => getConsulta(req, res, (ag, A) => ({
        antes: { hora_chegada: djJson(A.hora_chegada, ag.hora_chegada) }, depois: { fk_usuario: { id: req.user.id } } })) },
      { nome: 'get_ultimo_atestado', url: 'get-ultimo-atestado', detalhe: false, metodos: ['post'], fn: async (req, res) => {
        const id = parseIntPy(dadoDe(req, 'id_paciente', '0'));
        const l = await db.tabela('TbAtestado').where(col('TbAtestado', 'fk_prontuario_id'), id).orderBy('id', 'desc').first();
        if (l) return json(res, { success: db.linha('TbAtestado', l).id });
        json(res, { erro: 'Nada' });
      } }],
  });

  // ============================================================ PRESCRIÇÕES
  const PR = 'TbPrescricoes', RM = 'TbPrescricaoRemedios';
  app.get(`${P}/prescricoes/CarregaPrescricao/`, a(async (req, res) => {
    const p = await obtem(PR, { id: numero(exige(req.GET, 'prescricao')) });
    json(res, { success: { id: p.id, dataSalvo: dataSalvo(p), fields: campos(PR, p) } });
  }));
  app.get(`${P}/prescricoes/CarregaPrescricoes/`, a(async (req, res) => {
    const l = await lista(PR, (q) => filtraFk(q, col(PR, 'fk_prontuario_id'), req.GET.get('id_prontuario')), ['-id']);
    json(res, l.map((i) => ({ id: i.id, prescricao: i.prescricao, data_salvo: dataSalvo(i) })));
  }));
  async function completaProntuario(obj) {
    if (!obj.fk_prontuario_id) {
      const c = await relacionado('TbAgendaCons', obj.fk_consulta_id);
      if (!c) throw erroPython("'NoneType' object has no attribute 'fk_paciente'");
      obj.fk_prontuario_id = c.fk_paciente_id;
    }
  }
  app.get(`${P}/prescricoes/SalvaPrescricao/`, a(async (req, res) => {
    const form = exige(req.GET, 'form');
    const presc = exige(req.GET, 'prescricao');
    const inst = presc > '0' ? await obtem(PR, { id: numero(presc) }) : null;
    const { f, obj } = await formulario(PR, form, inst);
    if (!f.valido) return json(res, { error: listaErros(f) });
    await completaProntuario(obj);
    await modelo.salva(req, PR, obj);
    // o Django monta {..., row: row} com o dicionário como chave: erro depois de salvar
    throw erroPython("unhashable type: 'dict'");
  }));
  async function copiaPrescricao(req, p, comMedicoDe = null) {
    const n = copiaPeloForm(PR, p);
    if (comMedicoDe) n.fk_medico_id = comMedicoDe.fk_medico_id;
    await modelo.salva(req, PR, n);
    for (const r of await lista(RM, (q) => q.where(col(RM, 'fk_prescricao_id'), p.id), null)) {
      const c = copiaPeloForm(RM, r);
      c.fk_prescricao_id = n.id;
      await modelo.salva(req, RM, c);
    }
    return n;
  }
  app.get(`${P}/prescricoes/DuplicaPrescricao/`, a(async (req, res) => {
    const p = await obtem(PR, { id: numero(exige(req.GET, 'prescricao')) });
    const n = await copiaPrescricao(req, p);
    json(res, { success: { id: n.id, dataSalvo: dataSalvo(n) } });
  }));
  app.get(`${P}/prescricoes/ExcluiPrescricao/`, a(async (req, res) => {
    const id = numero(exige(req.GET, 'id'));
    await modelo.excluiLista(req, RM, await lista(RM, (q) => q.where(col(RM, 'fk_prescricao_id'), id), null));
    await modelo.exclui(req, PR, await obtem(PR, { id }));
    json(res, { success: 'OK' });
  }));
  const remedioDict = (r) => ({ id: r.id, fk_prescricao_id: r.fk_prescricao_id, nome: r.nome, tipo: r.tipo, qtdade: r.qtdade, unidade: r.unidade, descricao: r.descricao });
  app.get(`${P}/prescricoes/CarregaPrescricaoRemedios/`, a(async (req, res) => {
    const l = await lista(RM, (q) => filtraFk(q, col(RM, 'fk_prescricao_id'), req.GET.get('id_prescricao')), null);
    json(res, l.map(remedioDict));
  }));
  app.get(`${P}/prescricoes/CarregaPrescricaoRemedio/`, a(async (req, res) => {
    const r = await obtem(RM, { id: numero(req.GET.get('remedio')) });
    json(res, { success: remedioDict(r) });
  }));
  app.get(`${P}/prescricoes/SalvaPrescricaoRemedio/`, a(async (req, res) => {
    const form = exige(req.GET, 'form');
    const presc = parseIntPy(exige(req.GET, 'prescricao'));
    const id = parseIntPy(exige(req.GET, 'id_remedio') || 0);
    const inst = id > 0 ? await obtem(RM, { id }) : null;
    const { f, obj } = await formulario(RM, form, inst);
    if (!f.valido) return json(res, { error: listaErros(f) });
    obj.fk_prescricao_id = presc;
    await modelo.salva(req, RM, obj);
    json(res, { success: { id: obj.id, id_prescricao: obj.fk_prescricao_id,
      row: { id: obj.id, nome: obj.nome, qtdade: obj.qtdade, unidade: obj.unidade, tipo: obj.tipo, descricao: obj.descricao } } });
  }));
  app.get(`${P}/prescricoes/ExcluiPrescricaoRemedio/`, a(async (req, res) => {
    const id = exige(req.GET, 'id');
    await modelo.exclui(req, RM, await obtem(RM, { id: numero(id) }));
    json(res, { success: { id } });
  }));
  async function utilizaConfPrescricao(req, conf, pront, cons) {
    const c = await obtem('TbConfPrescricoes', { id: numero(conf) });
    const p = { fk_prontuario_id: pront, fk_consulta_id: cons, fk_medico_id: req.user.fk_medico_id, data_prescricao: hoje(), cont_esp: c.cont_esp, prescricao: c.prescricao };
    await modelo.salva(req, PR, p);
    for (const cr of await lista('TbConfPrescricaoRemedios', (q) => q.where(col('TbConfPrescricaoRemedios', 'fk_prescricao_id'), c.id), null)) {
      await modelo.salva(req, RM, { fk_prescricao_id: p.id, nome: cr.nome, qtdade: cr.qtdade, unidade: cr.unidade, tipo: cr.tipo, descricao: cr.descricao });
    }
    return p;
  }
  app.get(`${P}/prescricoes/UtilizaConfPrescricao/`, a(async (req, res) => {
    const conf = exige(req.GET, 'conf'), pr = exige(req.GET, 'prontuario'), cons = exige(req.GET, 'consulta');
    const p = await utilizaConfPrescricao(req, conf, pr, cons);
    json(res, { success: p.id });
  }));
  app.get(`${P}/prescricoes/prescricao.json/`, a(async (req, res) => {
    const l = await lista(PR, (q) => filtraFk(q, col(PR, 'fk_prontuario_id'), req.GET.get('id_prontuario')), ['-id']);
    const out = [];
    for (const i of l) {
      const m = await relacionado('TbMedicos', i.fk_medico_id);
      if (!m) throw erroPython("'NoneType' object has no attribute 'medico'");
      out.push({ id: i.id, prescricao: i.prescricao, medico: m.medico, data_salvo: dataSalvo(i, 'd/m/Y H:i:s') });
    }
    json(res, out);
  }));
  app.post(`${P}/prescricoes/prescricao.json/`, a(async (req, res) => {
    const pr = parseIntPy(exige(corpo(req), 'prescricao') || 0);
    let ret = [];
    if (pr > 0) {
      const p = await obtem(PR, { id: pr });
      ret = { success: { id: p.id, dataSalvo: dataSalvo(p, 'd/m/Y H:i:s'), fields: campos(PR, p) } };
    }
    json(res, ret);
  }));
  app.put(`${P}/prescricoes/prescricao.json/`, a(async (req, res) => {
    const put = corpo(req);
    const presc = put.get('prescricao');
    if (presc === null) throw erroPython("'>' not supported between instances of 'NoneType' and 'str'");
    const inst = presc > '0' ? await obtem(PR, { id: numero(presc) }) : null;
    const { f, obj } = await formulario(PR, put.get('form'), inst);
    if (!f.valido) return json(res, { error: listaErros(f) });
    await completaProntuario(obj);
    await modelo.salva(req, PR, obj);
    const m = await relacionado('TbMedicos', obj.fk_medico_id);
    if (!m) throw erroPython("'NoneType' object has no attribute 'medico'");
    const ds = dataSalvo(obj, 'd/m/Y H:i:s');
    json(res, { success: { id: obj.id, dataSalvo: ds, row: { id: obj.id, data_salvo: ds, prescricao: obj.prescricao, medico: m.medico } } });
  }));
  app.patch(`${P}/prescricoes/prescricao.json/`, a(async (req, res) => {
    const p = corpo(req);
    if (p.has('acao') && p.get('acao')) {
      const n = await utilizaConfPrescricao(req, exige(p, 'conf'), exige(p, 'prontuario'), exige(p, 'consulta'));
      return json(res, { success: { id: n.id } });
    }
    const presc = parseIntPy(exige(p, 'prescricao') || 0);
    const consulta = parseIntPy(exige(p, 'consulta') || 0);
    const orig = await obtem(PR, { id: presc });
    const c = consulta > 0 ? await obtem('TbAgendaCons', { id: consulta }) : null;
    const n = await copiaPrescricao(req, orig, c);
    json(res, { success: { id: n.id, dataSalvo: dataSalvo(n, 'd/m/Y H:i:s') } });
  }));
  app.delete(`${P}/prescricoes/prescricao.json/`, a(async (req, res) => {
    const p = corpo(req);
    if (p.has('acao') && p.get('acao')) {
      const rec = exige(p, 'rec');
      let ret;
      try {
        const c = await obtem('TbConfPrescricoes', { id: numero(rec) });
        await modelo.excluiLista(req, RM, await lista(RM, (q) => q.where(col(RM, 'fk_prescricao_id'), c.id), null));
        await modelo.exclui(req, 'TbConfPrescricoes', c);
        ret = { success: 'OK' };
      } catch (e) { ret = { error: [e.message] }; }
      return json(res, ret);
    }
    await modelo.exclui(req, PR, await obtem(PR, { id: numero(exige(p, 'id')) }));
    json(res, { success: 'OK' });
  }));

  // o roteador registra "remedio" antes da prescrição
  // Prontuario/Prescricoes/urls_api.py inclui o router duas vezes: em '' e em 'remedio'
  // (sem barra). A segunda gera endereços colados: 'remedio' + rota do router
  // (/api/prescricao/remedio = lista de prescrições, /api/prescricao/remedioremedio/ =
  // remédios, /api/prescricao/remedio<pk>/ = detalhe de prescrição...). Com barra
  // depois de 'remedio', vale o include normal.
  app.use((req, res, next) => {
    const m = req.path.match(/^\/api\/prescricao\/remedio(?!\/)(.*)$/);
    if (m) {
      const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      req.url = `/api/prescricao/${m[1]}${q}`;
    }
    next();
  });
  viewset.registra(app, '/api/prescricao/remedio', {
    modelo: RM, serializer: {}, paginar: false,
    filtros: { id: ['in'], fk_prescricao_id: ['exact'] },
    ordenacao: { campos: '__all__', padrao: [] },
    consulta: porProntuario(RM, 'id_prescricao', 'fk_prescricao_id', { emParams: true }),
  });
  viewset.registra(app, '/api/prescricao', {
    modelo: PR, serializer: serSecao(PR), paginar: false,
    filtros: { id: ['in'], fk_prontuario_id: ['exact'] }, busca: ['prescricao'],
    ordenacao: { campos: '__all__', padrao: ['-data_salvo'] },
    consulta: porProntuario(PR, 'id_prontuario', 'fk_prontuario_id', { emParams: true }),
    acoes: [...acoesComuns(PR),
      { nome: 'get_consulta', url: 'get-consulta', detalhe: false, metodos: ['post'], fn: (req, res) => getConsulta(req, res, () => ({
        depois: { data_salvo: djJson({ tipo: 'DateTimeField' }, db.agora()) } })) },
      { nome: 'clone', detalhe: false, metodos: ['post'], fn: async (req, res) => {
        const id = dadoDe(req, 'id_prescricao', '0');
        const pre = await obtem(PR, { id: numero(id) });
        const origId = pre.id;
        delete pre.id;
        await modelo.salva(req, PR, pre);
        for (const r of await lista(RM, (q) => q.where(col(RM, 'fk_prescricao_id'), origId), null)) {
          delete r.id; r.fk_prescricao_id = pre.id;
          await modelo.salva(req, RM, r);
        }
        json(res, { success: pre.id });
      } },
      { nome: 'del_remedios', url: 'del-remedios', detalhe: false, metodos: ['post'], fn: async (req, res) => {
        const id = dadoDe(req, 'id_prescricao', '0');
        await modelo.excluiLista(req, RM, await lista(RM, (q) => q.where(col(RM, 'fk_prescricao_id'), numero(id)), null));
        json(res, { success: 'sucesso' });
      } }],
  });

  // ================================================================= EXTRAS
  const EX = 'TbExtra';
  const arm = require('../util/armazenamento');
  const existe = async (rel) => { try { return await arm.existe(rel); } catch (e) { return false; } };
  app.get(`${P}/Extras/CarregaExtras/`, a(async (req, res) => {
    const l = await lista(EX, (q) => filtraFk(q, col(EX, 'fk_prontuario_id'), exige(req.GET, 'prontuario')), null);
    const ret = [];
    for (const e of l) {
      if (await existe(String(e.file))) {
        ret.push({ id: e.id, nome: String(e.file).split('/').pop(), data: dataSalvo(e), url: `/prontuario/Extras/downloadFile.json?extra=${e.id}` });
      }
    }
    json(res, { success: ret });
  }));

  async function baixa(res, nome) {
    const dados = await arm.le(nome);
    if (!dados) return res.status(404).type('text/html; charset=utf-8').send('The requested pdf was not found in our server.');
    const tipo = require('../util/mime').tipo(nome);
    res.status(200);
    if (tipo) res.type(tipo); else res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Disposition', `filename="${nome.split('/').pop()}"`);
    res.send(dados);
  }

  const download = a(async (req, res) => {
    const id = req.GET.get('extra');
    // get_object_or_404(TbExtra, id=None): o filtro vira "id IS NULL" e dá 404
    if (id === null) return require('../util/http').pagina404(res);
    const l = await db.tabela(EX).where(col(EX, 'id'), numero(id)).first();
    if (!l) return require('../util/http').pagina404(res);
    await baixa(res, String(db.linha(EX, l).file));
  });
  app.get(`${P}/Extras/downloadFile.json`, download);

  app.get(`${P}/Extras/uploadFile.json`, a(async (req, res) => {
    const id = parseIntPy(req.GET.get('id_paciente') || 0);
    // o Django filtrava TbPacientes por campos que não existem (fk_paciente, pasta): erro
    if (id > 0) throw erroPython("Cannot resolve keyword 'fk_paciente' into field.");
    json(res, { OK: 'OK' });
  }));
  app.post(`${P}/Extras/uploadFile.json`, a(async (req, res) => {
    const dados = req.POST;
    const arq = (req.FILES.file || [])[0];
    const erros = {};
    // ModelForm de TbExtra: fk_* opcionais, file obrigatório, ativo booleano
    const f = await modelo.validaForm(EX, dados, {});
    Object.assign(erros, Object.fromEntries(Object.entries(f.erros).map(([k, m]) => [k, [m]])));
    if (!arq || !arq.nome) erros.file = ['Este campo é obrigatório.'];
    else if (!arq.dados.length) erros.file = ['O arquivo submetido está vazio.'];
    if (Object.keys(erros).length) {
      // form.errors.get_json_errors() não existe no Django: erro 500
      throw erroPython("'ErrorDict' object has no attribute 'get_json_errors'");
    }
    const obj = Object.assign({}, f.valores);
    obj.file = await salvaArquivoExtra(obj, arq);
    await modelo.salva(req, EX, obj);
    const pr = await relacionado('TbPacientes', obj.fk_prontuario_id);
    if (!pr) throw erroPython("'NoneType' object has no attribute 'id'");
    json(res, { success: obj.file, fk_prontuario: pr.id });
  }));
  app.delete(`${P}/Extras/uploadFile.json`, a(async (req, res) => {
    const doc = await obtem(EX, { id: numero(exige(corpo(req), 'doc')) });
    const pr = await relacionado('TbPacientes', doc.fk_prontuario_id);
    if (!pr) throw erroPython("'NoneType' object has no attribute 'id'");
    await modelo.exclui(req, EX, doc);
    json(res, { success: pr.id });
  }));
  app.get(`${P}/Extras/downloadFile.json`, download);

  // o mesmo ExtrasViewSet está em /api/extras/ e em /api/prontuario/extras/ (Prontuario/urls_api.py)
  const opcExtras = {
    modelo: EX, serializer: {}, paginar: true, nome404: EX,
    acoes: [
      { nome: 'rastrear', detalhe: false, metodos: ['post'], fn: async (req, res) => {
        const pac = parseIntPy(req.POST.get('id_paciente'));
        // percorre extras/<pac>/<ano>/<mês>/<dia>/<arquivo> (na pasta local ou na nuvem);
        // como no AppClinic, imgs fica com os arquivos do último dia percorrido
        let imgs = null;
        const porDia = new Map();
        for (const rel of await arm.lista(`extras/${pac}`)) {
          const partes = rel.split('/');
          if (partes.length !== 6) continue;
          const dia = partes.slice(0, 5).join('/');
          if (!porDia.has(dia)) porDia.set(dia, []);
          porDia.get(dia).push(rel);
        }
        for (const arquivos of porDia.values()) {
          imgs = arquivos;
          for (const fname of arquivos) {
            const ja = await db.tabela(EX).where(col(EX, 'file'), fname).first();
            if (!ja) {
              const ag = db.linha('TbAgendaCons', await db.tabela('TbAgendaCons').where(col('TbAgendaCons', 'fk_paciente_id'), pac).orderBy('id', 'desc').first());
              if (ag) await modelo.salva(req, EX, { fk_prontuario_id: pac, fk_consulta_id: ag.id, fk_medico_id: ag.fk_medico_id, file: fname });
            }
          }
        }
        drf.responde(res, imgs && imgs.length ? { success: 'OK' } : { erro: 'Nada feito!' });
      } },
      { nome: 'recuperar_imagens', detalhe: false, metodos: ['post'], fn: async (req, res) => {
        const pac = req.POST.get('id_paciente');
        const l = await lista(EX, (q) => filtraFk(q, col(EX, 'fk_prontuario_id'), pac), null);
        if (await arm.existePasta(`extras/${pac}`)) return drf.responde(res, { success: 'OK', imagens: l.map((o) => o.file) });
        drf.responde(res, { erro: 'Nada feito!' });
      } },
      { nome: 'uploadDoc', detalhe: false, metodos: ['get'], fn: async (req, res) => {
        exige(req.GET, 'paciente');
        json(res, { success: 'Sucesso!' });
      } },
      // envia todos os arquivos de media/extras ao servidor de documentos da EDS
      // (sem a pasta, o os.listdir dá erro 500; uma falha de envio também)
      { nome: 'uploadAllDocs', detalhe: false, metodos: ['get'], fn: async (req, res) => {
        exige(req.GET, 'paciente');
        const requests = require('../util/requests');
        const raiz = path.join(config.mediaRoot, 'extras');
        if (!(await arm.existePasta('extras'))) throw erroPython(`[Errno 2] No such file or directory: '${raiz}'`);
        for (const rel of await arm.lista('extras')) {
          if (rel.split('/').length < 3) continue;   // só o que está dentro da pasta de um paciente
          await requests.post('http://docs.edssolution.com.br/upload', {
            files: { file: { nome: rel.split('/').pop(), dados: await arm.le(rel) } },
            params: { sistema: 'appclinic', id_paciente: req.data, path: path.join(config.mediaRoot, path.dirname(rel)) },
          });
        }
        json(res, { success: 'Sucesso!' });
      } },
      { nome: 'downloadFile', detalhe: false, metodos: ['post'], fn: async () => { throw erroPython("request() got an unexpected keyword argument 'file_name'"); } },
    ],
  };
  viewset.registra(app, '/api/extras', opcExtras);
  viewset.registra(app, '/api/prontuario/extras', opcExtras);

  /** upload_to=prontuario_directory_file: extras/<paciente>/<ano>/<mês>/<dia>/<nome> */
  async function salvaArquivoExtra(obj, arq) {
    const h = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const dir = `extras/${obj.fk_prontuario_id}/${h.getFullYear()}/${p2(h.getMonth() + 1)}/${p2(h.getDate())}`;
    const limpo = String(arq.nome).trim().replace(/ /g, '_').replace(/[^-\w.]/g, '');
    const nome = await arm.nomeLivre(dir, limpo);
    await arm.grava(`${dir}/${nome}`, arq.dados, arq.tipo || require('../util/mime').tipo(nome));
    return `${dir}/${nome}`;
  }
};

module.exports.numero = numero;
module.exports.formulario = formulario;
module.exports.listaErros = listaErros;
module.exports.errosJson = errosJson;
module.exports.dadoDe = dadoDe;
module.exports.dadoObrigatorio = dadoObrigatorio;
module.exports.parseIntPy = parseIntPy;
module.exports.cidsDe = cidsDe;
module.exports.copiaPeloForm = copiaPeloForm;
