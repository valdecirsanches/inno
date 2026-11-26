'use strict';
/**
 * Cadastros/Pacientes (urls.py, views.py, ajax.py do AppClinic).
 * Mesmos endereços, mesmos parâmetros e mesmas respostas.
 * Onde o Django dava erro 500 (registro inexistente, parâmetro faltando),
 * o Inno também dá: as telas foram feitas contando com esse comportamento.
 */
const config = require('../config');
const db = require('../db');
const QueryDict = require('../util/querydict');
const { render } = require('../templates');
const { json } = require('../util/http');
const modelo = require('../util/modelo');
const { pyStr, pyStrValor, djJson, exige, escapaLike, idade, dmy, anoDe } = require('../util/python');
const { extenso, strFloat } = require('../util/extenso');
const { erroPython } = require('../util/orm');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const BASE = '/cadastros/paciente';

const EXCLUI_PACIENTE = ['ultima_alt', 'titular', 'responsavel', 'hora_cadastro', 'data_cadastro', 'usuario', 'telefone_salvo'];
const EXCLUI_RECIBO = ['fk_paciente', 'fk_usuario', 'codigo', 'valor_extenso', 'valor', 'usuario'];

/** o código do prontuário da tela é o do paciente? ("00123" e 123 contam como iguais) */
function mesmoCodigo(daTela, doBanco) {
  const t = String(daTela).trim();
  const b = String(doBanco === null || doBanco === undefined ? '' : doBanco).trim();
  if (t === b) return true;
  return /^\d+$/.test(t) && /^\d+$/.test(b) && Number(t) === Number(b);
}

function naoExiste(nome) { const e = new Error(`${nome} matching query does not exist.`); e.python = true; return e; }

async function obtem(nomeModelo, filtro) {
  const o = await db.busca(nomeModelo, filtro);
  if (!o) throw naoExiste(nomeModelo);
  return o;
}

/**
 * TbOpcoes.objects.get(fk_usuario=usuario). No Django, usuário sem preferências (o
 * recém-criado) ou com mais de uma recebia erro ao salvar ou abrir as consultas do paciente.
 * Exceção a favor do usuário: cria as preferências padrão / usa a última.
 */
async function opcoesGet(usuario, req) {
  const T = 'TbOpcoes';
  let l = await db.tabela(T).where(db.coluna(T, 'fk_usuario_id'), usuario.id).orderBy(db.coluna(T, 'id'), 'desc');
  if (!l.length) {
    await modelo.salva(req, T, { fk_usuario_id: usuario.id, iniciar_pesquisa: '', login_atualizacao: false, ultimo_pac: 0 });
    l = await db.tabela(T).where(db.coluna(T, 'fk_usuario_id'), usuario.id).orderBy(db.coluna(T, 'id'), 'desc');
  }
  return db.linha(T, l[0]);
}

async function opcoesLast(usuario) {
  return db.linha('TbOpcoes', await db.tabela('TbOpcoes')
    .where(db.coluna('TbOpcoes', 'fk_usuario_id'), usuario.id).orderBy(db.coluna('TbOpcoes', 'id'), 'desc').first());
}

/** nome_do_usuario: primeiro preenchido entre first_name, nome, login, username */
function nomeDoUsuario(u) {
  if (!u) return '';
  return String(u.first_name || u.nome || u.login || u.username || '').trim();
}

const nascEIdade = (data) => (data && anoDe(data) >= 1900 ? [dmy(data), idade(data)] : ['', '']);

async function proximoRecibo() {
  const ultimo = db.linha('TbRecibos', await db.tabela('TbRecibos').orderBy(db.coluna('TbRecibos', 'id'), 'desc').first());
  if (!ultimo) return 1;
  return parseInt(ultimo.codigo || ultimo.id, 10) + 1;
}

async function ultimoCodigo() {
  const u = db.linha('TbPacientes', await db.tabela('TbPacientes').orderBy(db.coluna('TbPacientes', 'id'), 'desc').first());
  if (!u) throw new Error("'NoneType' object has no attribute 'codigo'");
  return parseInt(u.codigo || 0, 10) + 1;
}

module.exports = function (app) {
  // IniciarView
  app.get(`${BASE}/`, a(async (req, res) => {
    await render(res, 'Cadastros/Pacientes/Iniciar.html', {
      host: config.bancoExibido.host, db: config.bancoExibido.nome, usuario: req.user, hoje: db.hoje(),
    });
  }));

  app.get(`${BASE}/LocalizaPaciente/`, a(async (req, res) => {
    const pac = exige(req.GET, 'pac');
    const P = 'TbPacientes';
    const q = db.tabela(P).select(`${db.modelo(P).tabela}.*`);
    if (/^\d+$/.test(pac)) {
      db.likeNumero(q, db.coluna(P, 'codigo'), `%${escapaLike(pac)}%`);
      q.orderBy(db.coluna(P, 'codigo'));
    } else {
      q.where((w) => {
        db.like(w, db.coluna(P, 'paciente'), `%${escapaLike(pac)}%`);
        db.like(w, db.coluna(P, 'cpf'), `${escapaLike(pac)}%`, { ou: true });
      });
      q.orderBy(db.coluna(P, 'paciente'));
    }
    const lista = db.linhas(P, await q.limit(500));
    const clinicas = {};
    const pacs = [];
    for (const p of lista) {
      if (!(p.fk_clinica_id in clinicas)) clinicas[p.fk_clinica_id] = await db.busca('TbClinica', { id: p.fk_clinica_id });
      const cl = clinicas[p.fk_clinica_id];
      // paciente sem clínica (ou com clínica apagada): a pesquisa inteira dava erro
      const [nasc, id] = nascEIdade(p.data_nasc);
      pacs.push({ id: p.id, paciente: p.paciente, codigo: p.codigo, nasc, idade: id, clinica: cl ? cl.nome : '', cpf: p.cpf });
    }
    json(res, pacs);
  }));

  app.get(`${BASE}/NovoProntuario/`, a(async (req, res) => {
    json(res, { success: { codigo: await ultimoCodigo() } });
  }));

  app.get(`${BASE}/CarregaPaciente/`, a(async (req, res) => {
    const usuario = req.user;
    let paciente = req.GET.has('paciente') ? req.GET.get('paciente') : 0;
    if (!(await opcoesLast(usuario))) {
      // o Django tentava gravar sem login_atualizacao/ultimo_pac e dava erro: aqui grava com os padrões
      await modelo.salva(req, 'TbOpcoes', { fk_usuario_id: usuario.id, iniciar_pesquisa: '', login_atualizacao: false, ultimo_pac: 0 });
    }
    const opcoes = await opcoesLast(usuario);
    let ret = {};
    if (paciente || (opcoes && opcoes.ultimo_pac)) {
      if (paciente) {
        opcoes.ultimo_pac = parseInt(paciente, 10);
        if (Number.isNaN(opcoes.ultimo_pac)) throw new Error(`Field 'ultimo_pac' expected a number but got '${paciente}'.`);
        await modelo.salva(req, 'TbOpcoes', opcoes);
      } else if (opcoes.ultimo_pac) {
        paciente = opcoes.ultimo_pac;
      }
      const p = await obtem('TbPacientes', { id: paciente });
      const fields = modelo.inicialEmTexto('TbPacientes', p, { exclui: EXCLUI_PACIENTE });
      const plano = p.fk_plano_id ? await db.busca('TbPlanos', { id: p.fk_plano_id }) : null;
      const conv = p.fk_convenio_id ? await db.busca('TbConvenio', { id: p.fk_convenio_id }) : null;
      ret = {
        id: paciente, fields, data_cad: pyStr({ tipo: 'DateField' }, p.data_cad),
        plano: plano ? plano.descricao : '',
        convenio: conv ? conv.convenio : '',
      };
    }
    json(res, { success: ret });
  }));

  app.get(`${BASE}/CarregaProntuarioConsulta/`, a(async (req, res) => {
    const idConsulta = exige(req.GET, 'id_consulta');
    let qret = [];
    let aret = [];
    try {
      const l = await db.tabela('TbAnamnese').where(db.coluna('TbAnamnese', 'fk_consulta_id'), idConsulta);
      if (l.length === 1) qret = [{ queixa: db.linha('TbAnamnese', l[0]).queixa }];
    } catch (e) { /* como o except: pass */ }
    try {
      const l = await db.tabela('TbAtestado').where(db.coluna('TbAtestado', 'fk_consulta_id'), idConsulta);
      if (l.length === 1) {
        const x = db.linha('TbAtestado', l[0]);
        const hm = (h) => { if (!h) throw new Error('hora vazia'); return String(h).slice(0, 5); };
        aret = [{
          requerente: x.requerente, hora_chegada: hm(x.hora_chegada), hora_saida: hm(x.hora_saida),
          para_consulta: x.para_consulta, para_acompanhar_familia: x.para_acompanhar_familia,
          para_fazer_exame: x.para_fazer_exame, para_outra_finalidade: x.para_outra_finalidade,
          voltar_ao_trabalho: x.voltar_ao_trabalho, afastado_hoje: x.afastado_hoje, afastado_por: x.afastado_por,
          acidente_ser_encaminhado_ao_inss: x.acidente_ser_encaminhado_ao_inss,
          acidente_voltar_com_guias: x.acidente_voltar_com_guias,
          afastado_ser_encaminhado_ao_inss: x.afastado_ser_encaminhado_ao_inss,
          afastado_comparecer_com_impresso_inss: x.afastado_comparecer_com_impresso_inss,
          afastado_comparecer_em: '', afastado_comparecer_as: '', cid: x.cid, atestado_data: '',
        }];
      }
    } catch (e) { /* except: pass */ }
    json(res, { success: { queixas: qret, atestado: aret, erros: [] } });
  }));

  app.get(`${BASE}/LocalizaHomonimos/`, a(async (req, res) => {
    const paciente = exige(req.GET, 'paciente');
    let ret = { error: 'nao existe homonimos' };
    if (paciente) {
      const l = db.linhas('TbPacientes', await db.tabela('TbPacientes').where(db.coluna('TbPacientes', 'paciente'), paciente));
      if (l.length) {
        ret = { success: l.map((p) => { const [nasc, id] = nascEIdade(p.data_nasc); return { id: p.id, paciente: p.paciente, codigo: p.codigo, nasc, idade: id }; }) };
      }
    }
    json(res, ret);
  }));

  // /cadastros/paciente/salvar/ (Cadastros/views.py SalvaPaciente): versão antiga, que nenhuma
  // tela chama. Sempre termina em erro 500, como no AppClinic: no GET não devolve resposta;
  // no POST com id grava as alterações e depois o reverse('iniciar_pac') não existe;
  // sem id, o TbPacientes(...) recebe campos que o modelo não tem, antes de gravar.
  app.all(`${BASE}/salvar/`, a(async (req) => {
    if (req.method !== 'POST') {
      throw erroPython("The view Cadastros.views.SalvaPaciente didn't return an HttpResponse object. It returned None instead.");
    }
    const P = req.POST;
    const v = (k) => P.get(k);
    const id = v('id');
    const up = (k) => { const x = v(k); if (x === null) throw erroPython("'NoneType' object has no attribute 'upper'"); return x.toUpperCase(); };
    if (id) {
      if (!/^\s*[-+]?\d+\s*$/.test(id)) throw erroPython(`Field 'id' expected a number but got '${id}'.`);
      const pac = await obtem('TbPacientes', { id: parseInt(id, 10) });
      const se = (k, campo, f = (x) => x) => { if (v(k)) pac[campo] = f(v(k)); };
      const U = (x) => x.toUpperCase();
      se('nome', 'paciente', U); se('profissao', 'profissao', U); se('rg', 'rg');
      pac.cpf = v('cpf');
      se('nascimento', 'data_nasc'); se('sexo', 'sexo'); se('cep', 'cep'); se('rua', 'endereco', U);
      se('numero', 'endereco_numero'); se('complemento', 'complento', U); se('bairro', 'bairro', U);
      se('cidade', 'cidade', U); se('uf', 'estado', U); se('ibge', 'cidade_ibge', U); se('telefone', 'telefone');
      se('celular', 'celular'); se('email', 'email'); se('plano', 'fk_plano_id'); se('convenio', 'fk_convenio_id');
      se('medico', 'fk_medico_id'); se('detalhe', 'reg_conv'); se('empresa', 'empresa', U); se('ident', 'carteirinha');
      se('obs', 'obs');
      await modelo.salva(req, 'TbPacientes', pac);
      throw erroPython("Reverse for 'iniciar_pac' not found. 'iniciar_pac' is not a valid view function or pattern name.");
    }
    // ultimo_codigo() e os .upper() são avaliados antes do TbPacientes(...)
    const ult = db.linha('TbPacientes', await db.tabela('TbPacientes').orderBy(db.coluna('TbPacientes', 'codigo'), 'desc').first());
    if (!ult) throw erroPython("'NoneType' object has no attribute 'codigo'");
    for (const k of ['nome', 'profissao', 'rua', 'complemento', 'bairro', 'cidade', 'uf', 'empresa']) up(k);
    throw erroPython("TbPacientes() got an unexpected keyword argument 'soment_eletro'");
  }));

  app.all(`${BASE}/SalvaPaciente/`, a(async (req, res) => {
    const usuario = req.user;
    const formSerializado = exige(req.POST, 'form');
    const pid = req.POST.get('paciente') || '0';
    if (!/^\s*[-+]?\d+\s*$/.test(pid)) throw new Error(`invalid literal for int() with base 10: '${pid}'`);
    const pacienteId = parseInt(pid, 10);
    const instancia = pacienteId > 0 ? await obtem('TbPacientes', { id: pacienteId }) : null;
    const dadosForm = new QueryDict(formSerializado);
    const form = await modelo.validaForm('TbPacientes', dadosForm, { instancia, exclui: EXCLUI_PACIENTE });
    if (!form.valido) return json(res, { erro: Object.keys(form.erros) });
    // Trava contra gravar uma ficha por cima de outro paciente: o código do prontuário
    // (só leitura na tela) tem de ser o do paciente do ID. Se não for, a tela ficou com
    // o ID de um paciente aberto antes (ex.: resposta atrasada depois do "Novo
    // prontuário") e os dados digitados iriam para ele: não grava nada e explica.
    const codForm = String(dadosForm.get('codigo') || '').trim();
    if (instancia && codForm && !mesmoCodigo(codForm, instancia.codigo)) {
      console.log(`[SalvaPaciente] recusado: ID ${pacienteId} (código ${instancia.codigo}) com a ficha do código ${codForm}`);
      return json(res, { erro: ['codigo'], mensagem: `A ficha na tela (prontuário ${codForm}) ia ser gravada por cima do prontuário ${pyStrValor(instancia.codigo)} - ${instancia.paciente || ''}. Nada foi gravado. Se é um paciente novo, clique em "Novo prontuário" e digite de novo; se é uma alteração, abra o paciente de novo pela pesquisa.` });
    }
    const p = Object.assign(instancia ? Object.assign({}, instancia) : {}, form.valores);
    p.fk_clinica_id = usuario.fk_clinica_id;
    await modelo.salva(req, 'TbPacientes', p);
    // A consulta guarda o convênio do paciente no dia em que foi marcada. Mudou o convênio no
    // cadastro: as consultas ainda em aberto (de hoje em diante) passam a usar o novo, senão o
    // médico via o convênio antigo no atendimento. Consultas atendidas ficam como estavam.
    if (instancia && (instancia.fk_convenio_id || null) !== (p.fk_convenio_id || null)) {
      const A = 'TbAgendaCons';
      await db.tabela(A).where(db.coluna(A, 'fk_paciente_id'), p.id).where(db.coluna(A, 'data'), '>=', db.hoje())
        .whereIn(db.coluna(A, 'status'), ['AGENDADO', 'AGUARDANDO', 'ATENDIMENTO'])
        .update({ [db.coluna(A, 'fk_convenio_id')]: p.fk_convenio_id || null });
    }
    const opcoes = await opcoesGet(usuario, req);
    opcoes.ultimo_pac = p.id;
    await modelo.salva(req, 'TbOpcoes', opcoes);
    json(res, { success: { id: p.id, paciente: p.paciente, codigo: p.codigo, nasc: p.data_nasc ? dmy(p.data_nasc) : '' } });
  }));

  // CarregaConsultas (consultas do paciente)
  app.get(`${BASE}/CarregaConsultasPaciente/`, a(async (req, res) => {
    const opcoes = await opcoesGet(req.user, req);
    const paciente = req.GET.get('paciente');
    const consulta = [];
    if (paciente) {
      opcoes.ultimo_pac = parseInt(paciente, 10);
      if (Number.isNaN(opcoes.ultimo_pac)) throw new Error(`Field 'ultimo_pac' expected a number but got '${paciente}'.`);
      await modelo.salva(req, 'TbOpcoes', opcoes);
      const A = 'TbAgendaCons';
      const cons = db.linhas(A, await db.tabela(A).where(db.coluna(A, 'fk_paciente_id'), paciente).orderBy(db.coluna(A, 'data'), 'desc'));
      const campoChegada = db.modelo(A)._porAtributo.hora_chegada;
      for (const c of cons) {
        let idMed, med;
        const m = c.fk_medico_id ? await db.busca('TbMedicos', { id: c.fk_medico_id }) : null;
        if (m) { idMed = String(c.fk_medico_id); med = m.medico; } else { idMed = ''; med = `Falha... Médico não localizado! ${pyStr(null, c.fk_medico_id)}`; }
        let idProc = '', proc = '';
        if (c.fk_procedimento_id) {
          const pr = await db.busca('TbProcedimentos', { id: c.fk_procedimento_id });
          if (!pr) throw naoExiste('TbProcedimentos');
          idProc = String(c.fk_procedimento_id); proc = pr.descricao;
        }
        consulta.push({
          id: c.id, paciente: c.fk_paciente_id, status: c.status, id_age: String(c.id),
          dt: pyStr({ tipo: 'DateField' }, c.data), dte: c.data && anoDe(c.data) >= 1900 ? dmy(c.data) : '',
          hr: c.hora ? String(c.hora).slice(0, 5) : '', hr_chegada: c.hora_chegada ? djJson(campoChegada, c.hora_chegada) : '',
          id_med: idMed, med, id_procedimento: idProc, procedimento: proc,
        });
      }
    }
    json(res, consulta);
  }));

  // ------------------------------------------------------------- recibos
  app.get(`${BASE}/CarregaRecibos/`, a(async (req, res) => {
    const paciente = req.GET.get('paciente');
    const recibos = [];
    if (paciente) {
      const R = 'TbRecibos';
      const recs = db.linhas(R, await db.tabela(R).where(db.coluna(R, 'fk_paciente_id'), paciente).orderBy(db.coluna(R, 'data_recibo'), 'desc'));
      for (const r of recs) {
        if (!r.data_recibo) throw new Error("'NoneType' object has no attribute 'strftime'");
        let usu;
        try {
          usu = r.usuario || (r.fk_usuario_id ? nomeDoUsuario(await obtem('TbUsuario', { id: r.fk_usuario_id })) : '');
        } catch (e) { usu = ''; }
        const med = r.fk_medico_id ? (await obtem('TbMedicos', { id: r.fk_medico_id })).medico : '';
        recibos.push({ id: String(r.id), dt: `${dmy(r.data_recibo)} 00:00`, usu, med, vr: `R$ ${pyStr(null, r.valor)}` });
      }
    }
    json(res, recibos);
  }));

  app.get(`${BASE}/NovoRecibo/`, a(async (req, res) => {
    const u = req.user;
    json(res, { success: { codigo: await proximoRecibo(), fk_usuario: u.id, usuario: nomeDoUsuario(u).slice(0, 20), fk_paciente: req.GET.get('paciente') } });
  }));

  app.get(`${BASE}/CarregaRecibo/`, a(async (req, res) => {
    const recibo = exige(req.GET, 'recibo');
    const r = await obtem('TbRecibos', { id: recibo });
    const fu = r.fk_usuario_id ? await obtem('TbUsuario', { id: r.fk_usuario_id }) : null;
    const fields = modelo.inicialEmTexto('TbRecibos', r, { exclui: EXCLUI_RECIBO });
    fields.id_usuario = r.usuario || nomeDoUsuario(fu);
    if (!r.fk_paciente_id) throw new Error("'NoneType' object has no attribute 'paciente'");
    const pac = await obtem('TbPacientes', { id: r.fk_paciente_id });
    json(res, { success: { id: recibo, valor: pyStr(null, r.valor).replace('.', ','), valor_extenso: r.valor_extenso, fields, pac: pac.paciente } });
  }));

  app.get(`${BASE}/SupraValor/`, a(async (req, res) => {
    const valor = exige(req.GET, 'valor');
    json(res, { success: { extenso: extenso(String(valor)).toUpperCase() } });
  }));

  app.all(`${BASE}/SalvaRecibo/`, a(async (req, res) => {
    const usuario = req.user;
    const formTexto = exige(req.POST, 'form');
    const reciboTxt = exige(req.POST, 'recibo') || '0';
    if (!/^\s*[-+]?\d+\s*$/.test(reciboTxt)) throw new Error(`invalid literal for int() with base 10: '${reciboTxt}'`);
    const recibo = parseInt(reciboTxt, 10);
    const instancia = recibo > 0 ? await obtem('TbRecibos', { id: recibo }) : null;
    const form = await modelo.validaForm('TbRecibos', new QueryDict(formTexto), { instancia, exclui: EXCLUI_RECIBO });
    if (!form.valido) return json(res, { error: Object.keys(form.erros) });

    const vTxt = exige(req.POST, 'valor').replace(',', '.').trim();
    const v = Number(vTxt);
    if (vTxt === '' || Number.isNaN(v)) throw new Error(`could not convert string to float: '${vTxt}'`);
    const r = Object.assign(instancia ? Object.assign({}, instancia) : {}, form.valores);
    r.fk_usuario_id = usuario.id;
    r.usuario = nomeDoUsuario(usuario).slice(0, 20);
    r.fk_paciente_id = exige(req.POST, 'paciente');
    r.valor = v;
    r.valor_extenso = extenso(strFloat(v));
    r.impresso = 'True';
    r.cancelado = 'false';
    await modelo.salva(req, 'TbRecibos', r);
    if (!r.codigo) {
      r.codigo = r.id;
      await modelo.salva(req, 'TbRecibos', r, { somenteCampos: ['codigo'] });
    }
    // como no Django, depois de gravar: sem data ou sem médico, a resposta é erro 500
    if (!r.data_recibo) throw new Error("'NoneType' object has no attribute 'strftime'");
    const med = r.fk_medico_id ? await obtem('TbMedicos', { id: r.fk_medico_id }) : null;
    if (!med) throw new Error("'NoneType' object has no attribute 'medico'");
    json(res, { success: {
      id: String(r.id), dt: `${dmy(r.data_recibo)} 00:00`, usu: r.usuario, med: med.medico,
      vr: `R$ ${strFloat(v).replace('.', ',')}`, extenso: r.valor_extenso,
    } });
  }));
};
