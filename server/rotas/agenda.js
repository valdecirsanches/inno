'use strict';
/**
 * Agenda/Consultas (urls.py, ajax.py e views.py do AppClinic): tela da
 * agenda, agendamento, status, chegada, horários e abertura de agenda.
 * Mesmos endereços, parâmetros e respostas. Onde o Django dava erro 500,
 * o Inno também dá.
 */
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const QueryDict = require('../util/querydict');
const { render } = require('../templates');
const { json } = require('../util/http');
const modelo = require('../util/modelo');
const { obtem, relacionado, ultimo, int, strptimeData, isoweekday, erroPython, naoExiste } = require('../util/orm');
const { pyStr, pyRepr, djJson, exige, idade, dmy, anoDe } = require('../util/python');
const { formata } = require('../util/formato-data');
const drf = require('../util/drf');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const BASE = '/agenda/consultas';
const A = 'TbAgendaCons';
const C = (atrib) => db.coluna(A, atrib);
const CAMPO = (atrib) => db.modelo(A)._porAtributo[atrib];

const EXCLUI_FORM = ['data', 'hora', 'hora_chegada', 'fk_medico', 'fk_convenio', 'fk_usuario', 'codigo', 'tipo_consulta',
  'usuario', 'data_processado', 'hora_processado', 'prontuario', 'start', 'end', 'className', 'agenda_periodo', 'status'];

/** data/hora local agora, como datetime.datetime.now() */
const agora = () => db.agora();
const horaAgora = () => db.agora().slice(11);
const hhmm = (h) => (h ? String(h).slice(0, 5) : '');

/** TbAgendaCons.save(request): marca quem alterou e quando */
async function salvaAgenda(req, ag, comRequest = true) {
  if (comRequest && req && req.user && req.user.pk) {
    ag.id_usuario_alteracao = req.user.pk;
    ag.dh_alteracao = agora();
  }
  return modelo.salva(req, A, ag);
}

// ------------------------------------------------------- assinatura do dia
const CAMPOS_PAC_VERSAO = [['paciente', 'paciente'], ['celular', 'celular'], ['codigo', 'codigo'], ['necesp', 'necesp'], ['fk_convenio_id', 'fk_convenio_id']];

async function versaoAgenda(filtro) {
  const m = db.modelo(A);
  const P = db.modelo('TbPacientes');
  const q = db.knex(m.tabela).leftJoin(P.tabela, `${m.tabela}.${C('fk_paciente_id')}`, `${P.tabela}.${db.coluna('TbPacientes', 'id')}`);
  q.select(m.campos.map((c) => `${m.tabela}.${c.coluna} as a__${c.coluna}`));
  q.select(CAMPOS_PAC_VERSAO.map(([at]) => `${P.tabela}.${db.coluna('TbPacientes', at)} as p__${at}`));
  filtro(q, m.tabela);
  q.orderBy(`${m.tabela}.${C('id')}`);
  const h = crypto.createHash('md5');
  let n = 0;
  for (const l of await q) {
    const partes = m.campos.map((c) => pyRepr(c, db.converte(c, l[`a__${c.coluna}`])));
    for (const [at] of CAMPOS_PAC_VERSAO) {
      const c = db.modelo('TbPacientes')._porAtributo[at];
      partes.push(pyRepr(c, db.converte(c, l[`p__${at}`])));
    }
    h.update(Buffer.from(`(${partes.join(', ')})`, 'utf8'));
    n++;
  }
  return `${n}-${h.digest('hex')}`;
}

/** agenda_do_dia(): mesma seleção da CarregaConsultas */
function filtroDoDia(usuario, dt, idMedico) {
  if (!(dt && idMedico)) return null;
  const t = db.modelo(A).tabela;
  if (usuario.fk_medico_id) return (q) => q.where(`${t}.${C('fk_medico_id')}`, usuario.fk_medico_id).where(`${t}.${C('data')}`, dt);
  if (int(idMedico)) return (q) => q.where(`${t}.${C('fk_medico_id')}`, int(idMedico)).where(`${t}.${C('data')}`, dt);
  return (q) => q.where(`${t}.${C('fk_clinica_id')}`, usuario.fk_clinica_id).where(`${t}.${C('data')}`, dt);
}

// ------------------------------------------------------- objetos auxiliares
async function pacienteDaAgenda(ag) { return relacionado('TbPacientes', ag.fk_paciente_id); }

function nascIdade(p) {
  return p.data_nasc && anoDe(p.data_nasc) >= 1900 ? [dmy(p.data_nasc), idade(p.data_nasc)] : ['', ''];
}

/** timedelta do Python como texto (str(timedelta)) */
function strTimedelta(seg) {
  const dias = Math.floor(seg / 86400);
  const r = seg - dias * 86400;
  const h = Math.floor(r / 3600), mi = Math.floor((r % 3600) / 60), s = r % 60;
  const t = `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return dias ? `${dias} day${Math.abs(dias) !== 1 ? 's' : ''}, ${t}` : t;
}

module.exports = function (app) {
  // ---------------------------------------------------------------- telas
  const contexto = (req, data) => ({ host: config.bancoExibido.host, db: config.bancoExibido.nome, usuario: req.user, data });
  // {{ data }} de um date: o Django imprime no formato longo do pt-BR
  const dataLonga = () => formata(db.hoje(), 'j \\d\\e F \\d\\e Y');

  app.get(`${BASE}/`, a(async (req, res) => {
    await render(res, 'Agenda/Consultas/Consultas.html', contexto(req, dataLonga()));
  }));

  app.post(`${BASE}/`, a(async (req, res) => {
    const usuario = req.user;
    const data = req.POST.get('data');
    const opcoes = await db.tabela('TbOpcoes').where(db.coluna('TbOpcoes', 'fk_usuario_id'), usuario.id);
    if (!opcoes.length) await modelo.salva(req, 'TbOpcoes', { fk_usuario_id: usuario.id, iniciar_pesquisa: '', login_atualizacao: false, ultimo_pac: 0 });
    await obtem('TbOpcoes', { fk_usuario_id: usuario.id });
    let med;
    if (usuario.fk_medico_id) med = usuario.fk_medico_id;
    else { med = req.POST.get('id_medico'); await obtem('TbMedicos', { id: med }); }
    strptimeData(data);
    int(med);
    await render(res, 'Agenda/Consultas/Consultas.html', contexto(req, data));
  }));

  const gerarAgendas = a(async (req, res) => {
    await render(res, 'Tarefas/GerarAgendas.html', contexto(req, dataLonga()));
  });
  app.get(`${BASE}/GerarAgendasView/`, gerarAgendas);
  app.post(`${BASE}/GerarAgendasView/`, gerarAgendas);

  // ---------------------------------------------------- assinatura do dia
  app.get(`${BASE}/VersaoAgenda/`, a(async (req, res) => {
    const f = filtroDoDia(req.user, req.GET.get('data'), req.GET.get('id_medico') || 0);
    json(res, { versao: f ? await versaoAgenda(f) : '' });
  }));

  // ----------------------------------------------------- lista do dia
  const carregaConsultas = a(async (req, res) => {
    const usuario = req.user;
    const post = req.method === 'POST';
    let dt, idMedico, Livre, All;
    if (post) {
      dt = exige(req.POST, 'data'); idMedico = exige(req.POST, 'id_medico') || 0;
      Livre = exige(req.POST, 'Livre'); All = exige(req.POST, 'All');
    } else {
      dt = req.GET.get('data'); idMedico = req.GET.get('id_medico') || 0;
      Livre = req.GET.get('Livre'); All = req.GET.get('All');
    }
    // a tela às vezes pede antes do calendário ter data ('NaN-NaN-NaN'); o Django
    // dava erro 500 nessa chamada. Aqui ela só volta vazia, e a seguinte carrega.
    if (dt === 'NaN-NaN-NaN') dt = '';
    let medico = 0;
    if (usuario.fk_medico_id) medico = usuario.fk_medico_id;
    else if (int(idMedico)) medico = (await obtem('TbMedicos', { id: idMedico })).id;

    const Agenda = [];
    let faltas = 0, atendidos = 0, aguardando = 0, total = 0, agendados = 0, encaixes = 0, balcao = 0, versao = '';
    if (dt && idMedico) {
      strptimeData(dt);
      const t = db.modelo(A).tabela;
      const filtro = medico
        ? (q) => q.where(`${t}.${C('data')}`, dt).where(`${t}.${C('fk_medico_id')}`, medico)
        : (q) => q.where(`${t}.${C('data')}`, dt).where(`${t}.${C('fk_clinica_id')}`, usuario.fk_clinica_id);
      versao = await versaoAgenda(filtro);
      const conta = async (extra) => { const q = db.knex(t); filtro(q); extra(q); return Number((await q.count({ n: '*' }).first()).n); };
      faltas = await conta((q) => q.where(C('status'), 'FALTOU'));
      atendidos = await conta((q) => q.where(C('status'), 'ATENDIDO'));
      aguardando = await conta((q) => q.where(C('status'), 'AGUARDANDO'));
      const naoLivre = (q) => q.where((w) => w.whereNot(C('status'), 'LIVRE').orWhereNull(C('status')));
      total = await conta(naoLivre);
      const periodo = (letra) => async () => conta((q) => { naoLivre(q); db.like(q, C('agenda_periodo'), `${letra}%`, { binario: true }); });
      agendados = await periodo('A')(); encaixes = await periodo('B')(); balcao = await periodo('C')();

      // mesma consulta do Django (mesmas junções e ordem: empates por hora saem iguais)
      const P = db.modelo('TbPacientes').tabela, CV = db.modelo('TbConvenio').tabela;
      const M = db.modelo('TbMedicos').tabela, PR = db.modelo('TbProcedimentos').tabela;
      const q = db.knex(t);
      if (medico) q.innerJoin(M, `${t}.${C('fk_medico_id')}`, `${M}.id`); else q.leftJoin(M, `${t}.${C('fk_medico_id')}`, `${M}.id`);
      q.leftJoin(P, `${t}.${C('fk_paciente_id')}`, `${P}.id`)
        .leftJoin(CV, `${P}.${db.coluna('TbPacientes', 'fk_convenio_id')}`, `${CV}.id`)
        .leftJoin(PR, `${t}.${C('fk_procedimento_id')}`, `${PR}.id`);
      filtro(q);
      if (String(Livre).toLowerCase() === 'false') q.where((w) => w.whereNot(`${t}.${C('status')}`, 'LIVRE').orWhereNull(`${t}.${C('status')}`));
      if (String(All).toLowerCase() === 'false') q.where(`${t}.${C('status')}`, 'LIVRE');
      q.select(`${t}.*`).select({
        p__id: `${P}.id`, p__paciente: `${P}.paciente`, p__celular: `${P}.celular`, p__codigo: `${P}.codigo`,
        p__necesp: `${P}.necesp`, p__conv: `${P}.${db.coluna('TbPacientes', 'fk_convenio_id')}`,
        cv__id: `${CV}.id`, cv__convenio: `${CV}.convenio`,
        m__id: `${M}.id`, m__medico: `${M}.medico`, m__esp: `${M}.${db.coluna('TbMedicos', 'fk_especialidade_id')}`,
        pr__id: `${PR}.id`, pr__descricao: `${PR}.descricao`,
      }).orderBy(`${t}.${C('hora')}`, 'asc');
      const linhas = await q;
      const ids = [...new Set(linhas.map((l) => l[C('id_usuario_alteracao')]).filter(Boolean))];
      const logins = {};
      if (ids.length) {
        for (const u of await db.tabela('TbUsuario').whereIn(db.coluna('TbUsuario', 'id'), ids)) logins[u[db.coluna('TbUsuario', 'id')]] = u[db.coluna('TbUsuario', 'login')];
      }
      const PAC = (at) => db.modelo('TbPacientes')._porAtributo[at];
      for (const l of linhas) {
        const ag = db.linha(A, l);
        const temPac = l.p__id !== null && l.p__id !== undefined;
        let cel = '', idPac = '', codPac = '', necesp = '', pac = '', conv = '';
        if (temPac) {
          cel = pyStr(PAC('celular'), l.p__celular);
          idPac = String(l.p__id);
          codPac = pyStr(PAC('codigo'), db.converte(PAC('codigo'), l.p__codigo));
          necesp = l.p__necesp || '';
          pac = pyStr(PAC('paciente'), l.p__paciente);
          if (l.p__conv && Number(l.p__conv) !== 0) {
            if (l.cv__id === null || l.cv__id === undefined) throw erroPython("'NoneType' object has no attribute 'convenio'");
            conv = l.cv__convenio;
          }
        }
        if (ag.fk_procedimento_id && (l.pr__id === null || l.pr__id === undefined)) throw erroPython("'NoneType' object has no attribute 'descricao'");
        let idEsp;
        if (!ag.fk_especialidade_id) {
          if (l.m__id === null || l.m__id === undefined) throw erroPython("'NoneType' object has no attribute 'fk_especialidade_id'");
          idEsp = pyStr(null, l.m__esp);
        } else {
          await relacionado('TbEspecialidades', ag.fk_especialidade_id);
          idEsp = String(ag.fk_especialidade_id);
        }
        if (ag.agenda_periodo === null) throw erroPython("'NoneType' object is not subscriptable");
        if (ag.agenda_periodo === '') throw erroPython('string index out of range');
        let ua = '';
        if (ag.id_usuario_alteracao && logins[ag.id_usuario_alteracao] !== undefined) {
          ua = `${logins[ag.id_usuario_alteracao]} - ${formata(ag.dh_alteracao, 'd/m \\à\\s H:i')}`;
        }
        Agenda.push({
          id: String(ag.id),
          periodo: ag.agenda_periodo[0],
          hr: pyStr(CAMPO('hora'), ag.hora),
          hr_format: hhmm(ag.hora),
          cel, id_pac: idPac, cod_pac: codPac, pac, conv,
          med: pyStr(null, ag.fk_medico_id),
          nome_med: ag.fk_medico_id ? String(l.m__medico).split(' ') : '',
          status: pyStr(null, ag.status),
          id_procedimento: pyStr(null, ag.fk_procedimento_id),
          proced: ag.fk_procedimento_id ? l.pr__descricao : '',
          id_especialidade: idEsp,
          especialidade: idEsp,
          necesp,
          guia: ag.guia,
          hr_chegada: hhmm(ag.hora_chegada),
          confirmacao: ag.confirmacao,
          agenda_periodo: ag.agenda_periodo,
          dt: ag.data,
          confirmacao_dh: ag.confirmacao_dh ? formata(ag.confirmacao_dh, 'd/m H:i') : null,
          ultimaAlteracao: ua,
          whatsapp_motivo: ag.whatsapp_motivo,
          cor: ag.cor,
        });
      }
    }
    if (post) json(res, { Agenda, faltas, atendidos, aguardando, total, agendados, encaixes, balcao, versao });
    else json(res, Agenda);
  });
  app.get(`${BASE}/CarregaConsultas/`, carregaConsultas);
  app.post(`${BASE}/CarregaConsultas/`, carregaConsultas);

  // ------------------------------------------------------- agendamento
  app.get(`${BASE}/SalvaAgendamento/`, a(async (req, res) => {
    const usuario = req.user;
    const form = exige(req.GET, 'form');
    const data = exige(req.GET, 'data');
    const medico = int(exige(req.GET, 'medico'));
    const consulta = int(exige(req.GET, 'consulta'));
    const idPaciente = int(exige(req.GET, 'id_paciente'));
    let ag;
    if (consulta) ag = await obtem(A, { id: consulta });
    else ag = { fk_clinica_id: usuario.fk_clinica_id, data, fk_medico_id: medico, agenda_periodo: 'R' };
    if (ag.fk_paciente_id && ag.fk_paciente_id !== idPaciente) {
      const p = await relacionado('TbPacientes', ag.fk_paciente_id);
      throw erroPython(`Horario agendado para: <br> ${p.paciente}`);
    }
    const f = await modelo.validaForm(A, new QueryDict(form), { instancia: consulta ? ag : null, exclui: EXCLUI_FORM });
    if (!f.valido) {
      // o Django montava dict('nome_do_campo') e dava erro 500
      throw erroPython('dictionary update sequence element #0 has length 1; 2 is required');
    }
    Object.assign(ag, f.valores);
    ag.fk_clinica_id = usuario.fk_clinica_id;
    if (ag.status === 'LIVRE') ag.status = 'AGENDADO';   // registro novo: o padrão do modelo já é AGENDADO
    if (!ag.fk_procedimento_id && !ag.hora) ag.fk_procedimento_id = 5;
    ag.fk_usuario_id = usuario.id;
    const p = await pacienteDaAgenda(ag);
    if (!p) throw erroPython("'NoneType' object has no attribute 'fk_convenio_id'");
    ag.fk_convenio_id = p.fk_convenio_id;
    await salvaAgenda(req, ag);
    json(res, { success: 'Agendamento salvo com sucesso...' });
  }));

  app.get(`${BASE}/CarregaAgendamento/`, a(async (req, res) => {
    const usuario = req.user;
    const opcoes = await obtem('TbOpcoes', { fk_usuario_id: usuario.id });
    const consulta = exige(req.GET, 'consulta');
    const c = await obtem(A, { id: consulta });
    let idEsp;
    if (c.fk_especialidade_id) { await relacionado('TbEspecialidades', c.fk_especialidade_id); idEsp = String(c.fk_especialidade_id); }
    else {
      const m = await relacionado('TbMedicos', c.fk_medico_id);
      if (!m) throw erroPython("'NoneType' object has no attribute 'fk_especialidade_id'");
      idEsp = pyStr(null, m.fk_especialidade_id);
    }
    let p = '';
    if (c.fk_paciente_id) p = await relacionado('TbPacientes', c.fk_paciente_id);
    else if (opcoes.ultimo_pac) p = await obtem('TbPacientes', { id: opcoes.ultimo_pac });
    let pd;
    if (p) {
      const [nasc, id] = nascIdade(p);
      pd = { id: p.id, paciente: p.paciente, codigo: p.codigo, nasc, idade: id, fk_especialidade: idEsp };
    } else {
      pd = { id: 0, paciente: '', codigo: '', nasc: '', idade: '', fk_especialidade: '' };
    }
    const fields = modelo.inicialEmTexto(A, c, { exclui: EXCLUI_FORM });
    let usu = '';
    try { const u = await relacionado('TbUsuario', c.fk_usuario_id); usu = u ? u.nome : (() => { throw new Error(); })(); } catch (e) { usu = ''; }
    const med = await relacionado('TbMedicos', c.fk_medico_id);
    if (!med) throw erroPython("'NoneType' object has no attribute 'medico'");
    json(res, { success: {
      paciente: pd, fields, data: dmy(c.data), hora: !c.hora ? 'None' : hhmm(c.hora), med: med.medico, usu,
      dt_age: c.data_agendamento ? dmy(c.data_agendamento) : '',
    } });
  }));

  // ------------------------------------------------- status e chegada
  app.get(`${BASE}/StatusConsulta/`, a(async (req, res) => {
    const consulta = exige(req.GET, 'consulta');
    const status = exige(req.GET, 'status');
    const c = await obtem(A, { id: consulta });
    if (status === '') {
      const prox = { AGENDADO: 'FALTOU', FALTOU: 'AGUARDANDO', AGUARDANDO: 'ATENDIMENTO', ATENDIMENTO: 'ATENDIDO', ATENDIDO: 'AGENDADO' };
      const antes = c.status;
      c.status = prox[antes] || 'AGENDADO';
      if (antes === 'ATENDIMENTO' && c.hora_ini_atend && !c.hora_fim_atend) c.hora_fim_atend = horaAgora();
    } else {
      c.status = status;
      if (c.hora_ini_atend && !c.hora_fim_atend) c.hora_fim_atend = horaAgora();
    }
    await salvaAgenda(req, c);
    const p = await pacienteDaAgenda(c);
    if (!p) throw erroPython("'NoneType' object has no attribute 'paciente'");
    json(res, { success: { paciente: p.paciente, status: c.status } });
  }));

  app.get(`${BASE}/GravaChegada/`, a(async (req, res) => {
    const id = exige(req.GET, 'id_consulta');
    const c = await obtem(A, { id });
    let ret = [];
    if (req.GET.has('acao') && req.GET.get('acao') === 'RESTAURA') {
      c.status = 'AGENDADO'; c.hora_chegada = null;
      await salvaAgenda(req, c);
      ret = { success: 'OK' };
    } else if (c.status === 'AGENDADO') {
      const dh = agora();
      c.status = 'AGUARDANDO'; c.hora_chegada = dh;   // datetime em memória (o log do Django mostra data e hora)
      await salvaAgenda(req, c);
      const p = await pacienteDaAgenda(c);
      if (!p) throw erroPython("'NoneType' object has no attribute 'paciente'");
      ret = { success: { paciente: p.paciente, hr_chegada: dh.slice(11, 16) } };
    }
    json(res, ret);
  }));

  // o Django usa usuario.usuario, que não existe: sempre erro 500
  for (const nome of ['EtiquetaProntuario', 'EtiquetaConsulta']) {
    app.get(`${BASE}/${nome}/`, a(async (req) => {
      exige(req.GET, 'consulta');
      throw erroPython("'TbUsuario' object has no attribute 'usuario'");
    }));
  }

  // ------------------------------------------------------------- SMS
  const SMS_URL = 'http://chat.edssolution.com.br/chat/envia_sms/';
  const enviaSms = (dados) => fetch(SMS_URL, { method: 'POST', body: new URLSearchParams(dados) });

  app.get(`${BASE}/EnviaSMS/`, a(async (req, res) => {
    const u = req.user;
    const ag = await obtem(A, { id: exige(req.GET, 'id_agenda') });
    let ret;
    try {
      const dados = { id_usuario: u.id, usuario: pyStr(null, u.nome), id_unidade: 1, id_customer: 2, remetente: 'SENEUCLIM',
        id_destinatario: 0, destinatario: '', msg: exige(req.GET, 'mensagem'), telefone: `55${exige(req.GET, 'celular')}` };
      const r = await enviaSms(dados);
      const texto = await r.text();
      let msg;
      if (r.status !== 200) msg = `Erro ao enviar msg "${texto}"`;
      else {
        const p = await pacienteDaAgenda(ag);
        msg = `Mensagem enviada a ${p ? p.paciente : 'None'} <br>Fone: ${req.GET.get('celular')} <br> Mensagem "${req.GET.get('mensagem')}"`;
      }
      ret = { success: msg };
    } catch (e) {
      if (e.python) ret = { erro: e.args || [e.message] };   // dict(erro=e.args)
      else throw e;   // erro de rede: o Django não conseguia serializar a exceção (500)
    }
    json(res, ret);
  }));

  app.get(`${BASE}/EnviaSMSaTodos/`, a(async (req, res) => {
    const u = req.user;
    const ids = String(exige(req.GET, 'ids')).split(',');
    const msg = String(exige(req.GET, 'msg'));
    const ags = db.linhas(A, await db.tabela(A).whereIn(C('id'), ids));
    const ret = [];
    for (const ag of ags) {
      const m = await relacionado('TbMedicos', ag.fk_medico_id);
      const p = await pacienteDaAgenda(ag);
      let texto = msg;
      if (!msg) {
        if (!m) throw erroPython("'NoneType' object has no attribute 'sexo'");
        const dr = m.sexo === 'F' ? 'Dra.' : 'Dr.';
        texto = `O Inst. Neurologia informa que sua consulta esta agendada para ${formata(ag.data, 'd/m')} as ${hhmm(ag.hora)}hs com ${dr} ${String(m.medico).split(' ')[0]}. \nSeja pontual, tolerancia 15min \nTel: 11 2284-3334`;
      }
      if (!p) throw erroPython("'NoneType' object has no attribute 'celular'");
      const r = await enviaSms({ id_usuario: u.id, usuario: pyStr(null, u.nome), id_unidade: 1, id_customer: 2, remetente: 'SENEUCLIM',
        id_destinatario: 0, destinatario: '', msg: texto, telefone: `55${pyStr(null, p.celular)}` });
      if (r.status === 200) ret.push({ enviado: `${p.paciente} - ${pyStr(null, p.celular)}` });
    }
    json(res, ret);
  }));

  // ------------------------------------------------- horários e agenda
  // get_object_or_404(TbUsuario, fk_user_id=...): campo inexistente, sempre erro 500
  app.get(`${BASE}/NovoReceita/`, a(async () => { throw erroPython("Cannot resolve keyword 'fk_user_id' into field."); }));

  const excluirReceita = a(async (req, res) => {
    let p = {};
    const argv = req.POST.get('argv', '');
    if (argv !== 'undefined') { try { p = JSON.parse(argv); } catch (e) { p = {}; } }
    if (p === null || typeof p !== 'object' || !('rec' in p)) throw erroPython("KeyError: 'rec'");
    const rec = await obtem(A, { id: p.rec });
    const pac = await pacienteDaAgenda(rec);
    if (!pac) throw erroPython("'NoneType' object has no attribute 'paciente'");
    const ret = { receita: rec.id, data: dmy(rec.data), paciente: pac.paciente };
    await modelo.exclui(req, A, rec);
    json(res, { success: ret });
  });
  app.get(`${BASE}/ExcluirReceita/`, excluirReceita);
  app.post(`${BASE}/ExcluirReceita/`, excluirReceita);

  app.get(`${BASE}/DesativarAgenda/`, a(async (req, res) => {
    const idMedico = exige(req.GET, 'id_medico') || 0;
    const dt = exige(req.GET, 'data');
    const ags = db.linhas(A, await db.tabela(A).where(C('fk_medico_id'), idMedico).where(C('data'), dt));
    if (ags.some((x) => x.fk_paciente_id)) return json(res, { error: 'Consta agendamento nesta data' });
    for (const x of ags) await modelo.exclui(req, A, x);
    json(res, { success: 'OK' });
  }));

  app.get(`${BASE}/HorarioLivre/`, a(async (req, res) => {
    const id = req.GET.get('id');
    const ag = await obtem(A, { id });
    Object.assign(ag, { fk_paciente_id: null, status: 'LIVRE', fk_procedimento_id: null, fk_especialidade_id: null, hora_chegada: null });
    await salvaAgenda(req, ag);
    if (!ag.hora) throw erroPython("'NoneType' object has no attribute 'strftime'");
    json(res, { success: { consulta: id, data: dmy(ag.data), hora: hhmm(ag.hora), paciente: '' } });
  }));

  // ------------------------------------------------ calendário (DDHLivres)
  app.get(`${BASE}/DDHLivres/`, a(async (req, res) => {
    const usuario = req.user;
    const dtTxt = exige(req.GET, 'dt');
    let med = int(exige(req.GET, 'med'));
    const meses = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let medico = null;
    if (usuario.fk_medico_id) medico = await relacionado('TbMedicos', usuario.fk_medico_id);
    else medico = med ? await obtem('TbMedicos', { id: med }) : null;
    let dt;
    if (dtTxt === 'NaN-NaN-NaN') { const h = new Date(); dt = { a: h.getFullYear(), m: h.getMonth() + 1 }; }
    else dt = strptimeData(dtTxt);
    const vis = [];
    for (const i of [-1, 0, 1]) {
      if (i === -1 && dt.m === 1) vis.push([dt.a - 1, 12]);
      else if (i === 1 && dt.m === 12) vis.push([dt.a + 1, 1]);
      else vis.push([dt.a, dt.m + i]);
    }
    const p2 = (n) => String(n).padStart(2, '0');
    const inicio = `${vis[0][0]}-${p2(vis[0][1])}-01`;
    const [af, mf] = vis[2];
    const fim = `${af}-${p2(mf)}-${p2(new Date(af, mf, 0).getDate())}`;
    const q = db.tabela(A).whereBetween(C('data'), [inicio, fim]).where(C('status'), 'LIVRE');
    if (!usuario.fk_medico_id) q.where(C('fk_clinica_id'), usuario.fk_clinica_id);
    if (medico) q.where(C('fk_medico_id'), medico.id);
    const livres = {};
    for (const l of await q.orderBy([{ column: C('data') }, { column: C('agenda_periodo') }]).select(C('data'), C('agenda_periodo'))) {
      const d = db.converte(CAMPO('data'), l[C('data')]);
      const k = d.slice(0, 7);
      (livres[k] = livres[k] || []).push([d, l[C('agenda_periodo')]]);
    }
    const dhl = {};
    for (const [y, m] of vis) {
      if (medico) {
        for (let j = 1; j <= meses[m]; j++) if (isoweekday(y, m, j) === medico.dia_receita) dhl[`${y}-${m - 1}-${j}`] = '';
      }
      let yy = 0, mm = 0, dd = 0;
      for (const [d, periodo] of livres[`${y}-${p2(m)}`] || []) {
        const [ya, ma, da] = d.split('-').map(Number);
        if (yy !== ya || mm !== ma || dd !== da) {
          yy = ya; mm = ma; dd = da;
          // horário sem período gravado: o dia fica livre sem a marca de período
          // (antes a agenda inteira dava erro e o calendário não mostrava os dias livres)
          dhl[`${yy}-${mm - 1}-${dd}`] = periodo ? periodo[0] : '';
        }
      }
    }
    json(res, { dhl });
  }));

  // ---------------------------------------------------- abrir / gerar
  async function criaHorarios(req, m, dia) {
    const usuario = req.user;
    const H = 'TbHorarios';
    const w = isoweekday(dia.a, dia.m, dia.d);
    let hrs = db.linhas(H, await db.tabela(H).where(db.coluna(H, 'fk_medico_id'), m.id).where(db.coluna(H, 'dia_semana'), w));
    return hrs;
  }

  // o Django grava data = datetime.strptime(...) (datetime à meia-noite) e,
  // no AbrirAgenda, fk_medico_id = texto do GET: o log de auditoria mostra assim
  async function criaSeNaoExiste(req, m, dia, h, idMedico = m.id) {
    const usuario = req.user;
    const existe = await db.tabela(A).where(C('fk_clinica_id'), usuario.fk_clinica_id).where(C('fk_medico_id'), m.id)
      .where(C('data'), dia.iso).where(C('hora'), h.hora).count({ n: '*' }).first();
    if (Number(existe.n) === 0) {
      await salvaAgenda(req, { fk_clinica_id: usuario.fk_clinica_id, fk_medico_id: idMedico, data: `${dia.iso} 00:00:00`, hora: h.hora,
        agenda_periodo: h.agenda_periodo, status: 'LIVRE', fk_especialidade_id: m.fk_especialidade_id });
    }
  }

  app.get(`${BASE}/GerarAgendasPeriodo/`, a(async (req, res) => {
    const dts = String(req.GET.get('dts', '')).split(',').map((d) => d.trim()).filter(Boolean);
    const medicos = String(exige(req.GET, 'medico')).split(',');
    const meds = db.linhas('TbMedicos', await db.tabela('TbMedicos').whereIn('id', medicos));
    for (const m of meds) {
      for (const d of dts) {
        const dia = strptimeData(d.slice(0, 10));
        for (const h of await criaHorarios(req, m, dia)) await criaSeNaoExiste(req, m, dia, h);
      }
    }
    json(res, { success: 'sucesso' });
  }));

  app.get(`${BASE}/AbrirAgenda/`, a(async (req, res) => {
    const idMedico = exige(req.GET, 'id_medico');
    const dia = strptimeData(exige(req.GET, 'data'));
    const m = await obtem('TbMedicos', { id: idMedico });
    const H = 'TbHorarios';
    let hrs = await criaHorarios(req, m, dia);
    if (!hrs.length) {
      for (let w = 1; w <= 7; w++) {
        hrs = db.linhas(H, await db.tabela(H).where(db.coluna(H, 'fk_medico_id'), m.id).where(db.coluna(H, 'dia_semana'), w));
        if (hrs.length) break;
      }
    }
    if (!hrs.length) return json(res, { erro: 'HorarioInvalido' });
    for (const h of hrs) await criaSeNaoExiste(req, m, dia, h, idMedico);
    json(res, { success: 'Sucesso!' });
  }));

  // ---------------------------------------------------------- gráficos
  const graficoAgendamentos = async (req, res) => {
    const medico = req.user.fk_medico_id;
    if (!medico) return json(res, { erro: 'Usuário não é médico!' });
    const hoje = new Date();
    const ano = hoje.getFullYear(), mes = hoje.getMonth() + 1, dia = hoje.getDate();
    const p2 = (n) => String(n).padStart(2, '0');
    const doMes = () => db.tabela(A).where(C('fk_medico_id'), medico)
      .whereBetween(C('data'), [`${ano}-${p2(mes)}-01`, `${ano}-${p2(mes)}-${p2(new Date(ano, mes, 0).getDate())}`]);
    const ret = { labels: [], datasets: [] };
    const dias = { Faltas: [], Aguardando: [], Atendidos: [], Agendados: [] };
    const cor = { Faltas: '244,151,151', Aguardando: '252,236,152', Atendidos: '144,213,248', Agendados: '240,240,240' };
    const conta = async (q) => Number((await q.count({ n: '*' }).first()).n);
    for (let i = 1; i <= dia; i++) {
      const doDia = () => doMes().where(C('data'), `${ano}-${p2(mes)}-${p2(i)}`);
      if (await conta(doDia())) {
        ret.labels.push(`Dia ${i}`);
        dias.Agendados.push(await conta(doDia().where((w) => w.whereNot(C('status'), 'LIVRE').orWhereNull(C('status')))));
        dias.Atendidos.push(await conta(doDia().where(C('status'), 'ATENDIDO')));
        dias.Faltas.push(await conta(doDia().where(C('status'), 'FALTOU')));
      }
    }
    for (const tipo of Object.keys(dias)) {
      ret.datasets.push({ label: tipo, fillColor: `rgba(${cor[tipo]},0.5)`, strokeColor: `rgba(${cor[tipo]},0.7)`,
        pointColor: `rgba(${cor[tipo]},1)`, pointStrokeColor: '#fff', pointHighlightFill: '#fff',
        pointHighlightStroke: `rgba(${cor[tipo]},1)`, data: dias[tipo] });
    }
    let atraso = '';
    const agoraTxt = db.agora();
    const primeiro = db.linha(A, await db.tabela(A).where(C('data'), db.hoje()).where(C('status'), 'AGUARDANDO')
      .where(C('hora'), '<=', agoraTxt.slice(11)).orderBy(C('hora')).first());
    if (primeiro) {
      const [ph, pm] = String(primeiro.hora).split(':').map(Number);
      const seg = (hoje.getHours() * 60 + hoje.getMinutes() - (ph * 60 + pm)) * 60;
      if (seg > 0) {
        const s = strTimedelta(seg);
        atraso = seg / 60 > 60 ? `${s[0]} horas e ${s.slice(2, 4)} minutos` : `${s.slice(2, 4)} minutos`;
      } else if (seg === 0) atraso = 'P0DT00H00M00S';
      else atraso = strTimedelta(seg);
    }
    const total = await conta(doMes().where(C('status'), 'ATENDIDO'));
    json(res, { success: { atraso, dados: ret, total } });
  };
  app.get(`${BASE}/Graficos.Agendamentos`, a(graficoAgendamentos));
  module.exports.graficoAgendamentos = graficoAgendamentos;


  app.get(`${BASE}/Graficos.Pacientes`, a(async (req, res) => {
    const medico = req.user.fk_medico_id;
    const base = () => {
      const q = db.tabela(A).where(C('data'), db.hoje());
      return medico ? q.where(C('fk_medico_id'), medico) : q.whereNull(C('fk_medico_id'));
    };
    const conta = async (proc) => Number((await base().where(C('fk_procedimento_id'), proc).count({ n: '*' }).first()).n);
    const dias = { 'Consulta 1º vez': await conta(4), 'Retorno inferior a 30 dias': await conta(3), 'Retorno superior a 30 dias': await conta(1) };
    const labels = Object.keys(dias), values = Object.values(dias);
    const c = '200,240,152';
    json(res, { success: { dados: { labels, datasets: [{ label: labels, fillColor: `rgba(${c},0.5)`, strokeColor: `rgba(${c},0.7)`,
      pointColor: `rgba(${c},1)`, pointStrokeColor: '#fff', pointHighlightFill: '#fff', pointHighlightStroke: `rgba(${c},1)`, data: values }] } } });
  }));

  // ------------------------------------------- confirmação e horários
  app.all(`${BASE}/RestauraAgendamento/`, a(async (req, res) => {
    const acao = exige(req.POST, 'acao');
    const id = int(exige(req.POST, 'id_consulta'));
    const ag = await obtem(A, { id });
    ag.confirmacao_dh = agora();
    ag.fk_usuario_id = req.user.id;
    if (acao === 'confirmado') ag.confirmacao = 1;
    else if (acao === 'cancelado') ag.confirmacao = 2;
    else { ag.confirmacao_dh = null; ag.confirmacao = 0; }
    await salvaAgenda(req, ag);
    const p = await pacienteDaAgenda(ag);
    if (!p) throw erroPython("'NoneType' object has no attribute 'paciente'");
    json(res, { success: p.paciente });
  }));

  app.all(`${BASE}/hr_exclui/`, a(async (req, res) => {
    const id = int(exige(req.POST, 'id'));
    await modelo.exclui(req, A, await obtem(A, { id }));
    json(res, { success: id });
  }));

  app.all(`${BASE}/hrs_exclui/`, a(async (req, res) => {
    const ids = String(exige(req.POST, 'id__in')).split(',');
    for (const x of db.linhas(A, await db.tabela(A).whereIn(C('id'), ids))) await modelo.exclui(req, A, x);
    json(res, { success: ids });
  }));

  app.all(`${BASE}/hr_clone/`, a(async (req, res) => {
    const id = int(exige(req.POST, 'id'));
    const tp = exige(req.POST, 'tp');
    const ag = await obtem(A, { id });
    ag.agenda_periodo = tp;
    delete ag.id;
    await salvaAgenda(req, ag);
    // a.row
    if (!ag.data) throw erroPython("'NoneType' object has no attribute 'year'");
    if (!ag.hora) throw erroPython("'NoneType' object has no attribute 'strftime'");
    let idMed = '', med = '';
    if (ag.fk_medico_id) { idMed = String(ag.fk_medico_id); med = (await relacionado('TbMedicos', ag.fk_medico_id)).medico; }
    let idProc = '', proc = '';
    if (ag.fk_procedimento_id) { idProc = String(ag.fk_procedimento_id); proc = (await relacionado('TbProcedimentos', ag.fk_procedimento_id)).descricao; }
    json(res, { success: { id: String(ag.id), dt: String(ag.data), dte: anoDe(ag.data) >= 1900 ? dmy(ag.data) : '', hr: hhmm(ag.hora),
      id_med: idMed, med, id_procedimento: idProc, procedimento: proc, status: ag.status } });
  }));

  app.all(`${BASE}/TransfereDia`, a(async (req, res) => {
    const id = exige(req.POST, 'id');
    const dt = exige(req.POST, 'dt');
    if (dt) {
      const ag = await obtem(A, { id });
      ag.data = dt.slice(0, 10);
      ag.hora = `${dt.slice(11, 16)}:00`;
      await salvaAgenda(req, ag);
    }
    json(res, { success: 'ok' });
  }));

};

module.exports.salvaAgenda = salvaAgenda;
module.exports.versaoAgenda = versaoAgenda;
