'use strict';
/**
 * Atendimento (urls.py, views.py, ajax.py) e a API /api/agenda/
 * (AgendaViewSet do Agenda/Consultas/views.py).
 */
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const { render } = require('../templates');
const { json } = require('../util/http');
const modelo = require('../util/modelo');
const drf = require('../util/drf');
const viewset = require('../util/viewset');
const { obtem, relacionado, ultimo, int, strptimeData, isoweekday, erroPython } = require('../util/orm');
const { pyStr, pyRepr, exige, dmy, idadeF, pyReprValor } = require('../util/python');
const { formata } = require('../util/formato-data');
const { salvaAgenda, versaoAgenda } = require('./agenda');
const hist = require('./historico');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const A = 'TbAgendaCons';
const C = (at) => db.coluna(A, at);
const s = (v) => pyStr(null, v);
const hhmm = (h) => String(h).slice(0, 5);
const soDigitos = (t) => String(t || '').replace(/[^0-9]/g, '');

function filtroMedicoHoje(idMedico) {
  const t = db.modelo(A).tabela;
  return (q) => {
    if (idMedico === null || idMedico === undefined) q.whereNull(`${t}.${C('fk_medico_id')}`); else q.where(`${t}.${C('fk_medico_id')}`, idMedico);
    q.where(`${t}.${C('data')}`, db.hoje());
  };
}
const versaoAtendimento = (idMedico) => versaoAgenda(filtroMedicoHoje(idMedico));

/** segundos de um TimeField 'HH:MM:SS' */
const segundos = (h) => { const [H, M, S] = String(h).split(':'); return (+H) * 3600 + (+M) * 60 + Math.floor(+(S || 0)); };
/** '%02d:%02d' % (timer.seconds/60, timer.seconds % 60) */
function cronometro(dif) {
  const sec = ((dif % 86400) + 86400) % 86400;
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function md5(t) { return crypto.createHash('md5').update(t).digest('hex'); }

module.exports = function (app) {
  // ------------------------------------------------------------- tela
  app.get('/atendimento/', a(async (req, res) => {
    const layout = req.GET.get('consulta') ? 'Atendimento/Atendimento.html' : 'Atendimento/ListaAtendimento.html';
    await render(res, layout, { host: config.bancoExibido.host, db: config.bancoExibido.nome, usuario: req.user,
      data: formata(db.hoje(), 'j \\d\\e F \\d\\e Y') });
  }));

  // ------------------------------------------------- lista do médico
  const atendimentoMedico = a(async (req, res) => {
    const idMedico = req.user.fk_medico_id;
    if (req.method === 'POST') exige(req.GET, 'tipo');
    const Agenda = [];
    const t = db.modelo(A).tabela;
    const hoje = db.hoje();
    const f = filtroMedicoHoje(idMedico);
    const conta = async (extra) => { const q = db.knex(t); f(q); extra(q); return Number((await q.count({ n: '*' }).first()).n); };
    const qMes = db.knex(t).whereBetween(C('data'), [`${hoje.slice(0, 7)}-01`, `${hoje.slice(0, 7)}-31`]).where(C('status'), 'ATENDIDO');
    if (idMedico === null || idMedico === undefined) qMes.whereNull(C('fk_medico_id')); else qMes.where(C('fk_medico_id'), idMedico);
    const total = Number((await qMes.count({ n: '*' }).first()).n);
    const faltas = await conta((q) => q.where(C('status'), 'FALTOU'));
    const atendidos = await conta((q) => q.where(C('status'), 'ATENDIDO'));
    const aguardando = await conta((q) => q.where(C('status'), 'AGUARDANDO'));
    const naoLivre = (q) => q.where((w) => w.whereNot(C('status'), 'LIVRE').orWhereNull(C('status')));
    const per = (l) => conta((q) => { naoLivre(q); db.like(q, C('agenda_periodo'), `${l}%`, { binario: true }); });
    const agendados = await per('A'), encaixes = await per('B'), balcao = await per('C');

    const P = db.modelo('TbPacientes').tabela, CV = db.modelo('TbConvenio').tabela;
    const M = db.modelo('TbMedicos').tabela, PR = db.modelo('TbProcedimentos').tabela;
    const q = db.knex(t).innerJoin(M, `${t}.${C('fk_medico_id')}`, `${M}.id`)
      .leftJoin(P, `${t}.${C('fk_paciente_id')}`, `${P}.id`)
      .leftJoin(CV, `${P}.${db.coluna('TbPacientes', 'fk_convenio_id')}`, `${CV}.id`)
      .leftJoin(PR, `${t}.${C('fk_procedimento_id')}`, `${PR}.id`);
    f(q);
    q.whereIn(`${t}.${C('status')}`, ['AGUARDANDO', 'ATENDIMENTO'])
      .select(`${t}.*`, { p__id: `${P}.id`, p__paciente: `${P}.paciente`, p__celular: `${P}.celular`, p__codigo: `${P}.codigo`,
        p__necesp: `${P}.necesp`, p__conv: `${P}.${db.coluna('TbPacientes', 'fk_convenio_id')}`, cv__id: `${CV}.id`, cv__convenio: `${CV}.convenio`,
        m__medico: `${M}.medico`, pr__id: `${PR}.id`, pr__descricao: `${PR}.descricao` })
      .orderBy([{ column: `${t}.${C('hora')}` }, { column: `${t}.${C('hora_chegada')}` }]);
    const PAC = (at) => db.modelo('TbPacientes')._porAtributo[at];
    for (const l of await q) {
      const ag = db.linha(A, l);
      if (!ag.hora) throw erroPython("'NoneType' object has no attribute 'strftime'");
      let cel = '', idPac = '', codPac = '', pac = '', conv = '', necesp = '';
      if (l.p__id !== null && l.p__id !== undefined) {
        cel = pyStr(PAC('celular'), l.p__celular); idPac = String(l.p__id);
        necesp = l.p__necesp || ''; codPac = pyStr(PAC('codigo'), db.converte(PAC('codigo'), l.p__codigo)); pac = l.p__paciente;
        if (l.p__conv && Number(l.p__conv) !== 0) {
          if (l.cv__id === null || l.cv__id === undefined) throw erroPython("'NoneType' object has no attribute 'convenio'");
          conv = l.cv__convenio;
        }
      }
      let procedimento = '';
      if (ag.fk_procedimento_id) {
        if (l.pr__id === null || l.pr__id === undefined) throw erroPython("'NoneType' object has no attribute 'descricao'");
        procedimento = l.pr__descricao;
      }
      Agenda.push({
        id: ag.id, hr: pyStr(db.modelo(A)._porAtributo.hora, ag.hora), hr_format: hhmm(ag.hora), cel, id_pac: idPac, cod_pac: codPac, pac, conv,
        med: ag.fk_medico_id, medico: l.m__medico, stt: ag.status, id_procedimento: ag.fk_procedimento_id, procedimento,
        id_especialidade: s(ag.fk_especialidade_id), necesp, guia: ag.guia, hora_chegada: ag.hora_chegada ? hhmm(ag.hora_chegada) : '',
        data: formata(ag.data, 'd/m/y'),
      });
    }
    json(res, { Agenda, faltas, atendidos, aguardando, total, agendados, encaixes, balcao, versao: await versaoAtendimento(idMedico) });
  });
  app.get('/atendimento/AtendimentoMedico/', atendimentoMedico);
  app.post('/atendimento/AtendimentoMedico/', atendimentoMedico);

  app.get('/atendimento/VersaoAtendimento/', a(async (req, res) => {
    json(res, { versao: await versaoAtendimento(req.user.fk_medico_id) });
  }));

  // ------------------------------------------------- inicia atendimento
  app.get('/atendimento/IniciaAtendimento/', a(async (req, res) => {
    const c = await obtem(A, { id: exige(req.GET, 'consulta') });
    let atdm, atdmC, atdmCn;
    const agoraTxt = db.agora();
    if (c.data === db.hoje()) {
      c.status = 'ATENDIMENTO';
      atdm = '';
      if (c.hora_ini_atend) {
        const hi = segundos(c.hora_ini_atend);
        let hf;
        if (c.hora_fim_atend) { atdmCn = 'False'; hf = segundos(c.hora_fim_atend); } else { atdmCn = 'True'; hf = segundos(agoraTxt.slice(11)); }
        atdmC = cronometro(hf - hi);
      } else {
        atdmC = '00:00'; atdmCn = 'True';
        c.hora_ini_atend = agoraTxt.slice(11);
      }
      await salvaAgenda(req, c);
    } else {
      atdm = 'hidden'; atdmCn = 'False';
      atdmC = c.hora_ini_atend && c.hora_fim_atend ? cronometro(segundos(c.hora_fim_atend) - segundos(c.hora_ini_atend)) : '00:00';
    }
    const qPac = db.tabela(A);
    if (c.fk_paciente_id === null) qPac.whereNull(C('fk_paciente_id')); else qPac.where(C('fk_paciente_id'), c.fk_paciente_id);
    let formConsulta;
    if (Number((await qPac.count({ n: '*' }).first()).n)) {
      formConsulta = { data: formata(c.data, 'd/m/y') };
      const ult = async (m) => {
        const q = db.tabela(m);
        if (c.fk_paciente_id === null) q.whereNull(db.coluna(m, 'fk_prontuario_id')); else q.where(db.coluna(m, 'fk_prontuario_id'), c.fk_paciente_id);
        const l = await q.orderBy(db.coluna(m, 'id'), 'desc').first();
        return l ? { id: db.linha(m, l).id } : '';
      };
      formConsulta.anamnese = await ult('TbAnamnese');
      formConsulta.evolucao = await ult('TbEvolucao');
      formConsulta.exames = await ult('TbExames');
      formConsulta.exameFisico = await ult('TbExameFisico');
      formConsulta.extras = await ult('TbExtra');
      formConsulta.hipoteseDiagnostica = await ult('TbHipoteseDiagnostica');
      formConsulta.prescricao = await ult('TbPrescricoes');
      formConsulta.relatorios = await ult('TbRelatorios');
      Object.assign(formConsulta, { atdm, atdm_c: atdmC, atdm_cn: atdmCn });
      formConsulta = { success: formConsulta };
    } else formConsulta = { error: 'error' };
    const conv = await relacionado('TbConvenio', c.fk_convenio_id);
    const p = await relacionado('TbPacientes', c.fk_paciente_id);
    if (!p) throw erroPython("'NoneType' object has no attribute 'profissao'");
    const proc = await relacionado('TbProcedimentos', c.fk_procedimento_id);
    json(res, { success: {
      pac: c.fk_paciente_id, med: c.fk_medico_id, convenio: conv ? conv.convenio : 'Particular', profissao: p.profissao, mora: p.cidade,
      acao: proc ? proc.descricao : '', hora: c.hora ? hhmm(c.hora) : '00:00', hora_chegada: c.hora_chegada ? hhmm(c.hora_chegada) : '',
      formConsulta,
    } });
  }));

  // ------------------------------------------------------- resumo
  app.get('/atendimento/CarregaResumo/', a(async (req, res) => {
    const c0 = await obtem(A, { id: exige(req.GET, 'consulta') });
    if (c0.data === db.hoje()) { c0.status = 'ATENDIMENTO'; await salvaAgenda(req, c0); }
    const pac = c0.fk_paciente_id;
    await relacionado('TbPacientes', pac);
    const consultas = await hist.consultasDoPaciente(pac);
    const cache = await hist.carregaHistorico(consultas.map((x) => x.id), null, pac);
    let html = '';
    for (const c of consultas) {
      const hc = hist.historicoConsulta(c, null, cache);
      if (c.fk_medico_id && !c._temMed) throw erroPython("'NoneType' object has no attribute 'medico'");
      html += `
        <div class="ibox float-e-margins row m-b-n-md">
            <div class="ibox-title">
                <h5>${formata(c.data, 'd/m/Y')} - ${c.hora ? formata(c.hora, 'H:i') : ''}<small class="m-l-sm">${c.fk_procedimento_id ? hist.procOuErro(c) : ''}</small></h5>
                <div class="ibox-tools">
                    <span>Dr. ${c.fk_medico_id ? s(c._medico) : ''}</span>
                    <a class="collapse-link" title="Minimizar Consulta"><i class="fa fa-chevron-up"></i></a>
                </div>
            </div>
            <div class="ibox-content">
                ${hc.length > 0 ? hc : hist.SEM_DADOS}
            </div>
        </div>`;
    }
    json(res, { success: html });
  }));

  app.get('/atendimento/ProntuarioFisico/', a(async (req, res) => {
    const id = exige(req.GET, 'prontuario');
    const opcao = exige(req.GET, 'opcao');
    const p = await obtem('TbPacientes', { id });
    if (!['t', 'True', '1', 'f', 'False', '0'].includes(opcao)) throw erroPython(`['“${opcao}” value must be either True or False.']`);
    p.prontuario_fisico = opcao;   // texto em memória (o log mostra assim); no banco vira booleano
    await modelo.salva(req, 'TbPacientes', p);
    json(res, { success: 'OK' });
  }));

  // ---------------------------------------------------- /api/agenda/
  const declarados = [
    ['deleted', async () => viewset.VAZIO],
    ['deleted_at', async () => viewset.VAZIO],
    ['fk_titular', async (o) => {
      const p = await pacienteDe(o);
      if (!p) return null;
      return { nome: p.paciente || 'N/I', endereco: p.endereco || 'N/I', numero: p.endereco_numero || 'N/I', bairro: p.bairro || 'N/I',
        cidade: p.cidade || 'N/I', uf: p.estado || 'N/I', cep: p.cep || 'N/I', cpf_hash: p.cpf_hash, cpf: soDigitos(p.cpf),
        celular: soDigitos(p.celular), dificuldade_locomocao: p.necesp || '...' };
    }],
    ['fk_convenio', async (o) => {
      try { const x = await relacionado('TbConvenio', o.fk_convenio_id); if (!x) throw new Error(); return { id: x.id, nome: x.convenio }; } catch (e) { return { id: null, nome: '...' }; }
    }],
    ['fk_procedimento', async (o) => {
      try { const x = await relacionado('TbProcedimentos', o.fk_procedimento_id); if (!x) throw new Error(); return { id: x.id, nome: x.descricao }; } catch (e) { return { id: null, nome: '...' }; }
    }],
    ['periodo', async (o) => {
      if (o.agenda_periodo === null) throw erroPython("'NoneType' object is not subscriptable");
      if (o.agenda_periodo === '') throw erroPython('string index out of range');
      return o.agenda_periodo[0];
    }],
    ['fk_paciente', async (o) => {
      const p = await pacienteDe(o);
      if (!p) return '';
      return { id: p.id, nome: p.paciente, paciente: p.paciente, nasc: p.data_nasc ? dmy(p.data_nasc) : '', necesp: `${p.necesp || ''}`,
        codigo: `${p.codigo ? s(p.codigo) : ''}`, idade: `${idadeF(p.data_nasc)}`, cpf_hash: p.cpf_hash, cpf: soDigitos(p.cpf), celular: soDigitos(p.celular) };
    }],
    ['fk_medico', async (o) => {
      if (!o.fk_medico_id) return '';
      let m; try { m = await relacionado('TbMedicos', o.fk_medico_id); } catch (e) { throw e; }
      return { id: m.id, nome: m.medico, crm: m.crm || '' };
    }],
    ['confirmacao_dh', async (o) => (!o.confirmacao_dh ? '' : formata(o.confirmacao_dh, 'd/m H:i'))],
    ['data_formatada', async (o) => formata(o.data, 'd/m/Y')],
    ['hora_formatada', async (o) => s(o.hora).slice(0, 5)],
  ];
  async function pacienteDe(o) { return relacionado('TbPacientes', o.fk_paciente_id); }

  viewset.registra(app, '/api/agenda', {
    modelo: A,
    serializer: { declarados },
    paginar: false,
    filtros: { id: ['exact'], data: ['exact'] },
    busca: ['fk_medico', 'data'],
    consulta: (req, detalhe) => {
      const q = db.tabela(A);
      if (detalhe) return q;
      const prm = req.GET;
      const fm = prm.has('fk_medico') ? prm.get('fk_medico') : false;
      if (int(fm === false ? 0 : fm)) q.where(C('fk_medico_id'), int(fm));
      if (prm.get('dt')) q.where(C('data'), prm.get('dt'));
      if (prm.get('fk_paciente')) q.where(C('fk_paciente_id'), prm.get('fk_paciente'));
      if (prm.get('paciente')) q.where(C('fk_paciente_id'), prm.get('paciente'));
      return (async () => {
        const n = Number((await q.clone().count({ n: '*' }).first()).n);
        return { q: n > 200 ? db.tabela(A).whereRaw('1 = 0') : q };
      })();
    },
    nome404: A,
    antesDeCriar: async () => {},
    acoes: [
      { nome: 'grava_cor', detalhe: true, metodos: ['post'], fn: async (req, res, o) => {
        o.cor = req.data && typeof req.data.get === 'function' ? req.data.get('cor', '') : (req.data && req.data.cor !== undefined ? req.data.cor : '');
        await salvaAgenda(req, o);
        json(res, { success: 'ok' });
      } },
      { nome: 'grava_status', detalhe: true, metodos: ['post'], fn: async (req, res, o) => {
        const prox = { AGENDADO: 'FALTOU', FALTOU: 'AGUARDANDO', AGUARDANDO: 'ATENDIMENTO', ATENDIMENTO: 'ATENDIDO', ATENDIDO: 'AGENDADO' };
        const antes = o.status;
        o.status = prox[antes] || 'AGENDADO';
        if (antes === 'ATENDIMENTO' && o.hora_ini_atend && !o.hora_fim_atend) o.hora_fim_atend = db.agora().slice(11);
        await salvaAgenda(req, o);
        const p = await pacienteDe(o);
        if (!p) throw erroPython("'NoneType' object has no attribute 'paciente'");
        json(res, { success: { paciente: p.paciente, status: o.status } });
      } },
      { nome: 'grava_chegada', detalhe: true, metodos: ['post'], fn: async (req, res, o) => {
        let ret;
        if (req.GET.get('acao', '') === 'RESTAURA') {
          o.status = 'AGENDADO'; o.hora_chegada = null; await salvaAgenda(req, o); ret = { success: o.status };
        } else if (o.status === 'AGENDADO') {
          const dh = db.agora();
          o.status = 'AGUARDANDO'; o.hora_chegada = dh; await salvaAgenda(req, o);
          const p = await pacienteDe(o);
          if (!p) throw erroPython("'NoneType' object has no attribute 'paciente'");
          ret = { success: { paciente: p.paciente, hora_chegada: dh.slice(11, 16), status: o.status } };
        } else throw erroPython("local variable 'ret' referenced before assignment");
        json(res, ret);
      } },
      { nome: 'dados_para_memed', detalhe: true, metodos: ['post'], fn: async (req, res, o) => {
        const pac = await pacienteDe(o);
        let clns = [];
        if (o.fk_medico_id) { const m = await relacionado('TbMedicos', o.fk_medico_id); clns = String(m.clinicas_que_atende || '').split(','); }
        const ids = clns.filter((c) => /^\d+$/.test(c.trim())).map((c) => parseInt(c, 10));
        let clinica = null;
        if (ids.length) { const l = await db.tabela('TbClinica').whereIn('id', ids).orderBy('id').first(); clinica = db.linha('TbClinica', l); }
        if (!clinica) clinica = await relacionado('TbClinica', o.fk_clinica_id);
        if (!pac) throw erroPython("'NoneType' object has no attribute 'cpf'");
        const pend = pendenciasDoPaciente(pac);
        const g = (k) => (clinica && clinica[k]) || '';
        const hash = pac.cpf_hash ? pac.cpf_hash : (soDigitos(pac.cpf) ? md5(soDigitos(pac.cpf)) : '');
        json(res, {
          pendencias: pend, bloqueado: pend.some((i) => i.obrigatorio), id_paciente: pac.id,
          clinica_nome: g('nome'), clinica_bairro: g('bairro'), clinica_cidade: g('cidade'), clinica_endereco: g('endereco'),
          clinica_endereco_numero: g('numero'), clinica_telefone: soDigitos(clinica ? clinica.fone : ''),
          paciente_cpf_hash: hash, paciente_nome: pac.paciente || '', paciente_mae: pac.mae || '', paciente_endereco: pac.endereco || '',
          paciente_numero: pac.endereco_numero || '', paciente_bairro: pac.bairro || '', paciente_cidade: pac.cidade || '',
          paciente_uf: pac.estado || '', paciente_cep: soDigitos(pac.cep), paciente_cpf: soDigitos(pac.cpf), paciente_celular: soDigitos(pac.celular),
          paciente_nascimento: pac.data_nasc, paciente_dificuldade_locomocao: pac.necesp || '...',
        });
      } },
      { nome: 'grafico_agenda', url: 'grafico-agenda', detalhe: false, metodos: ['post'], fn: async (req, res) => {
        return graficoAgendamentos(req, res);
      } },
      { nome: 'grafico_paciente', url: 'grafico-paciente', detalhe: false, metodos: ['post'], fn: async (req, res) => graficoPacientes(req, res) },
      { nome: 'dhlivres', detalhe: false, metodos: ['get'], fn: async (req, res) => dhlivres(req, res) },
      { nome: 'historico', detalhe: false, metodos: ['post'], fn: async (req, res) => historicoApi(req, res) },
    ],
  });

  function pendenciasDoPaciente(p) {
    const itens = [
      ['paciente', 'Nome', !!String(p.paciente || '').trim(), true],
      ['cpf', 'CPF', soDigitos(p.cpf).length === 11, true],
      ['celular', 'Celular com DDD', soDigitos(p.celular).length >= 10, true],
      ['endereco', 'Endereço', !!p.endereco, false],
      ['endereco_numero', 'Número', !!p.endereco_numero, false],
      ['bairro', 'Bairro', !!p.bairro, false],
      ['cidade', 'Cidade', !!p.cidade, false],
      ['estado', 'UF', !!p.estado, false],
      ['mae', 'Nome da mãe', !!p.mae, false],
      ['sexo', 'Gênero', !!p.sexo, false],
    ];
    return itens.filter((i) => !i[2]).map(([campo, rotulo, , obrigatorio]) => ({ campo, rotulo, obrigatorio }));
  }

  // as versões da API dos gráficos e do calendário: mesma lógica das rotas da agenda,
  // com as diferenças do AgendaViewSet (médico do usuário; dt opcional; 'R' nos dias de receita)
  async function graficoAgendamentos(req, res) {
    const medico = req.user.fk_medico_id;
    if (!medico) return json(res, { erro: 'Usuário não é médico!' });
    return require('./agenda').graficoAgendamentos(req, res);
  }
  async function graficoPacientes(req, res) {
    const medico = req.user.fk_medico_id;
    const q = () => { const x = db.tabela(A).where(C('data'), db.hoje()); return medico ? x.where(C('fk_medico_id'), medico) : x.whereNull(C('fk_medico_id')); };
    const conta = async (p) => Number((await q().where(C('fk_procedimento_id'), p).count({ n: '*' }).first()).n);
    const dias = { 'Consulta 1º vez': await conta(4), 'Retorno inferior a 30 dias': await conta(3), 'Retorno superior a 30 dias': await conta(1) };
    const labels = Object.keys(dias), values = Object.values(dias), c = '200,240,152';
    json(res, { success: { dados: { labels, datasets: [{ label: labels, fillColor: `rgba(${c},0.5)`, strokeColor: `rgba(${c},0.7)`,
      pointColor: `rgba(${c},1)`, pointStrokeColor: '#fff', pointHighlightFill: '#fff', pointHighlightStroke: `rgba(${c},1)`, data: values }] } } });
  }
  async function dhlivres(req, res) {
    const usuario = req.user;
    const dtTxt = req.GET.has('dt') ? req.GET.get('dt') : null;
    let med = int(req.GET.get('fk_medico', 0));
    const meses = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (usuario.fk_medico_id) med = await relacionado('TbMedicos', usuario.fk_medico_id);
    else med = med ? await obtem('TbMedicos', { id: med }) : 0;
    let dt;
    if (dtTxt === null) throw erroPython('strptime() argument 1 must be str, not datetime.datetime');
    if (dtTxt === 'NaN-NaN-NaN') { const h = new Date(); dt = { a: h.getFullYear(), m: h.getMonth() + 1 }; } else dt = strptimeData(dtTxt);
    const dhl = {};
    const p2 = (n) => String(n).padStart(2, '0');
    for (const i of [-1, 0, 1]) {
      let mes, ano;
      if (i === -1 && dt.m === 1) { mes = 12; ano = dt.a - 1; } else if (i === 1 && dt.m === 12) { mes = 1; ano = dt.a + 1; } else { mes = dt.m + i; ano = dt.a; }
      const q = db.tabela(A).whereBetween(C('data'), [`${ano}-${p2(mes)}-01`, `${ano}-${p2(mes)}-31`]).where(C('status'), 'LIVRE');
      if (!usuario.fk_medico_id) q.where(C('fk_clinica_id'), usuario.fk_clinica_id);
      q.orderBy([{ column: C('data') }, { column: C('agenda_periodo') }]);
      if (med) {
        q.where(C('fk_medico_id'), med.id);
        for (let j = 1; j <= meses[mes]; j++) if (isoweekday(ano, mes, j) === med.dia_receita) dhl[`${ano}-${mes - 1}-${j}`] = 'R';
      }
      let y = 0, m = 0, d = 0;
      for (const l of await q) {
        const ag = db.linha(A, l);
        const [ya, ma, da] = ag.data.split('-').map(Number);
        if (y !== ya || m !== ma || d !== da) {
          y = ya; m = ma; d = da;
          if (ag.agenda_periodo === null) throw erroPython("'NoneType' object is not subscriptable");
          if (ag.agenda_periodo === '') throw erroPython('string index out of range');
          dhl[`${y}-${m - 1}-${d}`] = ag.agenda_periodo[0];
        }
      }
    }
    json(res, { dhl });
  }
  async function historicoApi(req, res) {
    const pac = req.data && typeof req.data.get === 'function' ? req.data.get('paciente') : (req.data ? req.data.paciente : undefined);
    const consultas = await hist.consultasDoPaciente(pac === undefined ? null : pac, { ateHoje: false, ordem: null, comPaciente: true });
    const cache = await hist.carregaHistorico(consultas.map((x) => x.id), null, pac === undefined ? null : pac);
    let html = '';
    for (const c of consultas) {
      const hc = hist.historicoConsulta(c, null, cache);
      const md = c.fk_medico_id ? (c._temMed ? s(c._medico) : '') : '';
      const p = await relacionado('TbPacientes', c.fk_paciente_id);
      const dados = { id_consulta: c.id, paciente: p.paciente, pac: c.fk_paciente_id, id_paciente: c.fk_paciente_id, med: c.fk_medico_id,
        convenio: 'Convênio não informado.', profissao: p.profissao || '', onde_mora: `Morador de: ${s(p.cidade)}`,
        acao: !c._temProc ? '' : c._proc, hora: c.hora ? hhmm(c.hora) : '00:00', hora_chegada: c.hora_chegada ? hhmm(c.hora_chegada) : '',
        idade: idadeF(p.data_nasc) };
      if (!c.hora) throw erroPython("'NoneType' object has no attribute 'strftime'");
      if (!c._temProc) throw erroPython("'NoneType' object has no attribute 'descricao'");
      html += `
                <div class="ibox float-e-margins row m-b-n-md">
                    <div class="ibox-title">
                        <h5>${formata(c.data, 'd/m/Y')} ${formata(c.hora, 'H:i') || ''} ${c._proc || ''}</h5>
                        <div class="ibox-tools">
                            <span>Dr.${md}</span>
                            <a class="collapse-link" title="Minimizar Consulta"><i class="fa fa-chevron-up"></i></a>
                            <a href="/api/atendimento/${c.id}/prontuario/?${pyReprValor(dados)}" title="Acessar Consulta"><i class="fa fa-chevron-right"></i></a>
                        </div>
                    </div>
                    <div class="ibox-content">
                        ${hc.length > 0 ? hc : hist.SEM_DADOS}
                    </div>
                </div>`;
    }
    json(res, { success: html });
  }
};
