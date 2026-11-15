'use strict';
/**
 * Prontuario/Historico (ajax.py e view.py): o resumo de cada consulta
 * (queixa, exame físico, hipótese, evolução, exames, prescrições,
 * relatórios), usado pelo Histórico, pelo Atendimento e pela API da agenda.
 * O HTML sai idêntico ao do AppClinic, espaço por espaço.
 */
const config = require('../config');
const db = require('../db');
const { render } = require('../templates');
const { json } = require('../util/http');
const { formata } = require('../util/formato-data');
const { pyStr, splitlines, pyLen } = require('../util/python');
const { erroPython } = require('../util/orm');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const L = (nome, l) => db.linha(nome, l);
const col = (m, at) => db.coluna(m, at);

const chaveCid = (codigo) => String(codigo || '').replace(/\s+$/, '').toUpperCase();
const quer = (d, secao) => !d || d.includes(secao);

async function carregaHistorico(ids, d = null, pacId = null) {
  const cache = { anamnese: {}, exameFisico: {}, hipotese: {}, evolucao: {}, exames: {}, prescricoes: {}, remedios: {}, relatorios: {}, cid: {} };
  if (!ids.length) return cache;
  const ultimoPorConsulta = async (m) => {
    const ret = {};
    for (const l of await db.tabela(m).whereIn(col(m, 'fk_consulta_id'), ids).orderBy(col(m, 'id'))) {
      const o = L(m, l); ret[o.fk_consulta_id] = o;
    }
    return ret;
  };
  const listaPorConsulta = (m, linhas) => {
    const ret = {};
    for (const l of linhas) { const o = L(m, l); (ret[o.fk_consulta_id] = ret[o.fk_consulta_id] || []).push(o); }
    return ret;
  };
  const doPaciente = (m, q) => (pacId === null || pacId === undefined || pacId === ''
    ? q.whereNull(col(m, 'fk_prontuario_id')) : q.where(col(m, 'fk_prontuario_id'), pacId));

  if (quer(d, 'anamnese')) cache.anamnese = await ultimoPorConsulta('TbAnamnese');
  if (quer(d, 'exameFisico')) cache.exameFisico = await ultimoPorConsulta('TbExameFisico');
  if (quer(d, 'hipoteseDiagnostica')) {
    cache.hipotese = await ultimoPorConsulta('TbHipoteseDiagnostica');
    const codigos = new Set();
    for (const h of Object.values(cache.hipotese)) {
      for (const campo of [h.diagnostico, h.outros_diagnosticos]) if (campo) for (const c of String(campo).split(',')) codigos.add(c);
    }
    if (codigos.size) {
      const C = 'CID10';
      for (const l of await db.tabela(C).whereIn(col(C, 'codigo'), [...codigos]).orderBy(col(C, 'id'))) {
        const k = chaveCid(l[col(C, 'codigo')]);
        if (!(k in cache.cid)) cache.cid[k] = l[col(C, 'descricao')];
      }
    }
  }
  if (quer(d, 'evolucao')) cache.evolucao = await ultimoPorConsulta('TbEvolucao');
  if (quer(d, 'exames')) {
    const m = 'TbExames';
    const q = doPaciente(m, db.tabela(m).whereIn(col(m, 'fk_consulta_id'), ids)).orderBy([{ column: col(m, 'data_salvo'), order: 'desc' }, { column: col(m, 'id') }]);
    cache.exames = listaPorConsulta(m, await q);
  }
  if (quer(d, 'prescricoes')) {
    const m = 'TbPrescricoes';
    cache.prescricoes = listaPorConsulta(m, await db.tabela(m).whereIn(col(m, 'fk_consulta_id'), ids).orderBy(col(m, 'id')));
    const idsP = Object.values(cache.prescricoes).flat().map((p) => p.id);
    if (idsP.length) {
      const R = 'TbPrescricaoRemedios';
      for (const l of await db.tabela(R).whereIn(col(R, 'fk_prescricao_id'), idsP).orderBy(col(R, 'id'))) {
        const r = L(R, l); (cache.remedios[r.fk_prescricao_id] = cache.remedios[r.fk_prescricao_id] || []).push(r);
      }
    }
  }
  if (quer(d, 'relatorios')) {
    const m = 'TbRelatorios';
    cache.relatorios = listaPorConsulta(m, await doPaciente(m, db.tabela(m).whereIn(col(m, 'fk_consulta_id'), ids)).orderBy(col(m, 'id')));
  }
  return cache;
}

const s = (v) => pyStr(null, v);
const ou = (v, alt) => (v ? v : alt);   // "v or alt" do Python (texto)

function historicoConsulta(c, d, cache) {
  let r = '';
  if (quer(d, 'anamnese')) {
    const an = cache.anamnese[c.id];
    if (an) {
      let historia = '';
      if (an.queixa_historia) for (const line of splitlines(an.queixa_historia)) historia += `<p class="m-b-n-xxs">${line}</p>`;
      else historia = 'Não Descrito';
      r += `
            <div class="panel panel-default m-t-n-sm">
                <div class="panel-heading" style="color: #00aa88">Queixa</div>
                <div class="panel-body  m-t-n-sm m-b-n-sm">
                    <h3>${an.queixa_principal ? an.queixa_principal : 'Não Descrito queixa principal'}</h3>
                    <p class="m-b-n-xxs"><label>História:</label><br>
                        ${historia}
                    </p>
                </div>
            </div>
            `;
    }
  }
  if (quer(d, 'exameFisico')) {
    const e = cache.exameFisico[c.id];
    if (e) {
      let obs = '';
      if (e.obs_exame_fisico) for (const i of splitlines(e.obs_exame_fisico)) obs += `<p class="m-b-n-xxs">${i}</p>`;
      const p1 = (e.altura || e.peso || e.imc) ? `<p class="m-b-n-xxs">${e.altura ? `<label>  Altura:</label> ${s(e.altura)} m ` : ''}${e.peso ? `<label class="m-l-md">  Peso:</label> ${s(e.peso)} kg ` : ''}${e.imc ? `<label class="m-l-md">IMC:</label> ${s(e.imc)}` : ''}</p>` : '';
      const p2 = `<p class="m-b-n-xxs">${e.pressao_art ? `<label>  Pressão arterial:</label>${s(e.pressao_art)} ` : ''}${e.pulso ? `<label class="m-l-md">Pulso:</label>${s(e.pulso)} ` : ''}</p>`;
      r += `
            <div class="panel panel-default m-t-n-sm">
                <div class="panel-heading" style="color: #00aa88">Exame Físico</div>
                <div class="panel-body m-t-n-sm m-b-n-sm">
                    ${p1}
                    ${p2}
                    ${obs ? `<p class="m-b-n-xs"><label>Obs:</label></p>${obs}` : ''}
                </div>
            </div>`;
    }
  }
  if (quer(d, 'hipoteseDiagnostica')) {
    const h = cache.hipotese[c.id];
    if (h) {
      const lista = (campo) => {
        let t = '';
        if (campo) for (const i of String(campo).split(',')) t += ` ${chaveCid(i) in cache.cid ? cache.cid[chaveCid(i)] : i};`;
        return t;
      };
      let obs = '';
      if (h.obs_diagnostico) for (const line of splitlines(h.obs_diagnostico)) obs += `<p class="m-b-n-xxs">${line}</p>`;
      r += `
            <div class="panel panel-default m-t-n-sm">
                <div class="panel-heading" style="color: #00aa88">Hipótese Diagnóstica</div>
                <div class="panel-body m-t-n-sm m-b-n-sm">
                    ${h.diagnostico ? `<p class="m-b-n-xxs"><label>Diagnóstico:</label>${lista(h.diagnostico)}</p>` : ''}
                    ${h.outros_diagnosticos ? `<p class="m-b-n-xxs"><label>Outros diagnósticos:</label>${lista(h.outros_diagnosticos)}</p>` : ''}
                    ${obs ? `<p class="m-b-n-xs"><label>Obs:</label></p>${obs}` : ''}
                </div>
            </div>
            `;
    }
  }
  if (quer(d, 'evolucao')) {
    const e = cache.evolucao[c.id];
    if (e) {
      let ev = '';
      if (e.evolucao) for (const line of splitlines(e.evolucao)) ev += `<p class="m-b-n-xxs">${line}</p>`;
      r += `
            <div class="panel panel-default m-t-n-sm">
                <div class="panel-heading" style="color: #00aa88">Evolução</div>
                <div class="panel-body m-t-n-sm m-b-n-sm">
                    ${ev}
                </div>
            </div>
            `;
    }
  }
  if (quer(d, 'exames')) {
    const exames = cache.exames[c.id] || [];
    if (exames.length) {
      let t = '';
      for (const ex of exames) {
        if (!ex.data_salvo) throw erroPython("'NoneType' object has no attribute 'strftime'");
        t += `<p class="m-b-n-xs"><label>${formata(ex.data_salvo, 'd/m/Y')}</label></p>`;
        const linhas = splitlines(ex.pedido ? String(ex.pedido) : '');
        for (const i of linhas) t += `<p ${i === linhas[linhas.length - 1] && !ex.cid10 ? '' : 'class="m-b-n-xxs"'}>${i}</p>`;
        t += ex.cid10 ? `<p>${ex.cid10}</p>` : '';
      }
      r += `
            <div class="panel panel-default m-t-n-sm">
                <div class="panel-heading" style="color: #00aa88">Exames</div>
                <div class="panel-body m-t-n-sm m-b-n-sm">
                    ${t}
                </div>
            </div>
            `;
    }
  }
  if (quer(d, 'prescricoes')) {
    const ps = cache.prescricoes[c.id] || [];
    let t = '';
    if (ps.length) {
      for (const p of ps) {
        if (!p.data_salvo) throw erroPython("'NoneType' object has no attribute 'strftime'");
        t += `<p class="m-b-n-xs"><label>${formata(p.data_salvo, 'd/m/Y')}</label></p>`;
        if (p.prescricao) for (const i of splitlines(p.prescricao)) t += `<p class="m-b-n-xxs">${i}</p>`;
        const rems = cache.remedios[p.id] || [];
        rems.forEach((i, idx) => {
          let rem = '--------------------------------------------------';
          let car;
          try {
            if (i.nome === null) throw new Error();
            car = (i.nome === i.nome.toUpperCase() ? pyLen(i.nome) * 2 : pyLen(i.nome))
              + pyLen(i.tipo || '0') + pyLen(s(i.qtdade || '0')) + pyLen(i.unidade || '0');
          } catch (e) { car = 0; }
          rem = [...rem].slice(car > 50 ? 49 : car).join('');
          const remedio = `${ou(i.nome, '')} ${ou(i.tipo, '')} ${ou(rem, '')} ${i.qtdade ? s(i.qtdade) : ''} ${ou(i.unidade, '')}`;
          let desc = '';
          if (i.descricao) {
            const ls = splitlines(i.descricao);
            for (const line of ls) desc += `<p class="${line === ls[ls.length - 1] ? '' : 'm-b-n-xxs '}m-l-md">${line}</p>`;
          }
          t += `<p class="${idx === rems.length - 1 && !desc ? '' : 'm-b-n-xxs '}m-l-sm">${remedio}</p>`;
          t += desc;
        });
      }
      r += `
            <div class="panel panel-default m-t-n-sm">
                <div class="panel-heading" style="color: #00aa88">Prescrições</div>
                <div class="panel-body m-t-n-sm m-b-n-sm">
                ${t}
                </div>
            </div>
            `;
    }
  }
  if (quer(d, 'relatorios')) {
    const rels = cache.relatorios[c.id] || [];
    if (rels.length) {
      let t = '';
      for (const x of rels) {
        if (!x.data_salvo) throw erroPython("'NoneType' object has no attribute 'strftime'");
        t += `<p class="m-b-n-xs"><label>${formata(x.data_salvo, 'd/m/Y')}</label> - ${s(x.titulo)}</p>`;
      }
      r += `
            <div class="panel panel-default m-t-n-sm">
                <div class="panel-heading">Relatórios</div>
                <div class="panel-body m-t-n-sm m-b-n-sm">
                ${t}
                </div>
            </div>
            `;
    }
  }
  return r;
}

const SEM_DADOS = '<p class="text_center">Não há dados desta consulta</p>';

/** consultas do paciente com médico e procedimento (select_related: LEFT JOIN, nulos viram None) */
async function consultasDoPaciente(pac, { ano = null, ordem = 'desc', ateHoje = true, comPaciente = false } = {}) {
  const A = 'TbAgendaCons';
  const t = db.modelo(A).tabela;
  const q = db.knex(t);
  if (pac === null || pac === undefined) q.whereNull(`${t}.${col(A, 'fk_paciente_id')}`); else q.where(`${t}.${col(A, 'fk_paciente_id')}`, pac);
  if (ateHoje) q.where(`${t}.${col(A, 'data')}`, '<=', db.hoje());
  if (ano) q.whereBetween(`${t}.${col(A, 'data')}`, [`${String(ano).padStart(4, '0')}-01-01`, `${String(ano).padStart(4, '0')}-12-31`]);
  const M = db.modelo('TbMedicos').tabela, P = db.modelo('TbProcedimentos').tabela;
  // select_related('fk_medico', 'fk_procedimento'): médico é obrigatório (INNER JOIN), procedimento não (LEFT JOIN)
  q.innerJoin(M, `${t}.${col(A, 'fk_medico_id')}`, `${M}.id`).leftJoin(P, `${t}.${col(A, 'fk_procedimento_id')}`, `${P}.id`)
    .select(`${t}.*`, { m__medico: `${M}.medico`, m__id: `${M}.id`, pr__descricao: `${P}.descricao`, pr__id: `${P}.id` });
  if (ordem) q.orderBy(`${t}.${col(A, 'data')}`, ordem); else q.orderBy(`${t}.${col(A, 'id')}`);
  return (await q).map((l) => Object.assign(L(A, l), { _medico: l.m__id === null ? null : l.m__medico, _proc: l.pr__id === null ? null : l.pr__descricao, _temMed: l.m__id !== null, _temProc: l.pr__id !== null }));
}

module.exports = function (app) {
  app.get('/historico/', a(async (req, res) => {
    await render(res, 'Prontuario/historico.html', { host: config.bancoExibido.host, db: config.bancoExibido.nome, usuario: req.user,
      data: formata(db.hoje(), 'j \\d\\e F \\d\\e Y') });
  }));

  app.get('/historico/AdicionaConsultas/', a(async (req, res) => {
    const ano = req.GET.get('ano');
    const dTxt = req.GET.get('d');
    const d = dTxt ? dTxt.split(',') : null;
    const pac = req.GET.get('pac');
    if (ano !== null && ano !== '' && !/^\s*[-+]?\d+\s*$/.test(ano)) throw erroPython(`invalid literal for int() with base 10: '${ano}'`);
    const consultas = await consultasDoPaciente(pac === null ? null : pac, { ano: ano ? parseInt(ano, 10) : null });
    const cache = await carregaHistorico(consultas.map((x) => x.id), d, pac);
    let html = '';
    for (const c of consultas) {
      const hc = historicoConsulta(c, d, cache);
      const md = c.fk_medico_id ? (c._temMed ? s(c._medico) : '') : '';
      html += `
            <div class="ibox float-e-margins row m-b-n-md">
                <div class="ibox-title">
                    <h5>${formata(c.data, 'd/m/Y')} ${c.hora ? `- ${formata(c.hora, 'H:i')}` : ''} ${c.fk_procedimento_id ? `<small class="m-l-sm">${procOuErro(c)}</small>` : ''}</h5>
                    <div class="ibox-tools">
                        <span>Dr. ${md}</span>
                        <a class="collapse-link" title="Minimizar Consulta"><i class="fa fa-chevron-up"></i></a>
                        <a href="/atendimento/?consulta=${c.id}" title="Acessar Consulta"><i class="fa fa-chevron-right"></i></a>
                    </div>
                </div>
                <div class="ibox-content">
                    ${hc.length > 0 ? hc : SEM_DADOS}
                </div>
            </div>`;
    }
    json(res, { success: html });
  }));
};

function procOuErro(c) {
  if (!c._temProc) throw erroPython("'NoneType' object has no attribute 'descricao'");
  return s(c._proc);
}

module.exports.carregaHistorico = carregaHistorico;
module.exports.historicoConsulta = historicoConsulta;
module.exports.consultasDoPaciente = consultasDoPaciente;
module.exports.procOuErro = procOuErro;
module.exports.SEM_DADOS = SEM_DADOS;
