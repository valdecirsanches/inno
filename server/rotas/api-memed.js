'use strict';
/**
 * /api/memed/: MemedViewSet (memed/views.py e memed/acesso.py do AppClinic).
 *
 * O CRUD é o mesmo do /api/medico/ (MedicoSerializer). A diferença está na
 * lista: o queryset é TbMedicos.objects (o Manager, sem .all()) e, sem
 * filterset nem search_fields, chega assim à paginação, que tenta fatiar o
 * Manager e dá erro 500 sempre que há algum médico. O Inno faz igual.
 *
 * As ações falam com a Memed (api.memed.com.br), com as chaves do .env.
 */
const config = require('../config');
const db = require('../db');
const viewset = require('../util/viewset');
const drf = require('../util/drf');
const modelo = require('../util/modelo');
const { json } = require('../util/http');
const { erroPython } = require('../util/orm');
const { pyJson, pyJsonLoads, pyBool, pyGet, pyStrValor, ehDict } = require('../util/python');
const apiMedico = require('./api-medico');

const M = 'TbMedicos';
const col = (m, at) => db.coluna(m, at);
const SEM_CONEXAO = 'Não foi possível falar com a Memed agora. Verifique a internet e tente de novo.';

// ------------------------------------------------------------ requests
/** erro do requests (sem conexão, tempo esgotado...): requests.RequestException */
class ErroRequisicao extends Error {}

/**
 * requests.<metodo>(url, params=..., headers=..., json=/data=, timeout=...)
 * Devolve { status, texto }.
 */
async function requisicao(metodo, url, { params = null, headers = {}, corpo = null, timeout = null } = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.append(k, v === null || v === undefined ? '' : String(v));
  const opc = { method: metodo, headers: Object.assign({}, headers), redirect: 'follow' };
  if (corpo !== null) {
    opc.body = corpo;
    if (!Object.keys(opc.headers).some((h) => h.toLowerCase() === 'content-type')) opc.headers['Content-Type'] = 'application/json';
  }
  if (timeout) opc.signal = AbortSignal.timeout(timeout * 1000);
  let r;
  try {
    r = await fetch(u, opc);
    return { status: r.status, texto: await r.text() };
  } catch (e) {
    throw new ErroRequisicao(e.message);
  }
}

const chaves = () => ({ 'api-key': config.memed.apiKey, 'secret-key': config.memed.secretKey });
const BASE = () => config.memed.apiBase;

/** _json(response): response.json() or {} (texto que não é JSON: {}) */
function _json(r) {
  try {
    const v = pyJsonLoads(r.texto);
    return pyBool(v) ? v : {};
  } catch (e) { return {}; }
}

/** json.loads(response.text) sem proteção: texto inválido dá 500 */
function loads(texto) {
  try { return pyJsonLoads(texto); } catch (e) { throw erroPython(`Expecting value: line 1 column 1 (char 0)`); }
}

/** x[k] do Python (KeyError / TypeError) */
function item(v, k) {
  if (Array.isArray(v) && typeof k === 'number') {
    if (k >= v.length) throw erroPython('list index out of range');
    return v[k];
  }
  if (!ehDict(v)) throw erroPython(`'${v === null ? 'NoneType' : typeof v}' object is not subscriptable`);
  if (!Object.prototype.hasOwnProperty.call(v, k)) throw erroPython(`'${k}'`);
  return v[k];
}

/** (dados.get('data') or {}).get('attributes', {}) */
const atributos = (dados) => pyGet(pyGet(dados, 'data') || {}, 'attributes', {});

function _erroMemed(r) {
  const dados = _json(r);
  const erros = ehDict(dados) ? pyGet(dados, 'errors') : null;
  if (pyBool(erros)) {
    const e = Array.isArray(erros) ? erros[0] : erros;
    if (ehDict(e)) {
      const partes = ['title', 'detail'].filter((k) => pyBool(pyGet(e, k))).map((k) => pyStrValor(e[k]));
      if (partes.length) return 'A Memed recusou: ' + partes.join(' - ');
    }
    return 'A Memed recusou: ' + pyStrValor(e);
  }
  return `A Memed respondeu com erro (${r.status}).`;
}

async function _memedGetUsuario(cpfHash) {
  const r = await requisicao('GET', `${BASE()}v1/sinapse-prescricao/usuarios/${cpfHash}`, {
    headers: { Accept: 'application/vnd.api+json' }, params: chaves(), timeout: 20,
  });
  return _json(r);
}

async function _codigoCidade(cidade, uf) {
  const r = await requisicao('GET', `${BASE()}v1/cidades/`, {
    params: { 'filter[uf]': pyStrValor(uf), 'filter[q]': pyStrValor(cidade) },
    headers: { Accept: 'application/vnd.api+json' }, timeout: 20,
  });
  const lista = pyGet(_json(r), 'data') || [];
  if (!pyBool(lista)) {
    const e = new Error(`A cidade "${pyStrValor(cidade)}/${pyStrValor(uf)}" do consultório não foi encontrada na Memed. Confira a grafia.`);
    e.valueError = true;
    throw e;
  }
  return item(item(lista, 0), 'id');
}

// ---------------------------------------------------------- acesso.py
const soDigitos = (t) => String(t || '').replace(/[^0-9]/g, '');
const strip = (t) => String(t || '').trim();

async function especialidadeDe(m) {
  try {
    if (!m.fk_especialidade_id) return '';
    const e = await db.busca('TbEspecialidades', { id: m.fk_especialidade_id });
    if (!e) return '';
    return e.nome || '';
  } catch (e) { return ''; }
}

async function checklist(m) {
  const nome = strip(m.medico).split(/\s+/).filter(Boolean);
  const esp = await especialidadeDe(m);
  const itens = [
    ['nome', 'Nome e sobrenome', nome.length >= 2],
    ['cpf', 'CPF', soDigitos(m.cpf).length === 11],
    ['data_nascimento', 'Data de nascimento', !!m.data_nascimento],
    ['genero', 'Gênero', !!m.genero],
    ['crm', 'CRM e UF do CRM', !!strip(m.crm) && !!m.crm_uf],
    ['email', 'E-mail', !!strip(m.email)],
    ['celular', 'Celular com DDD', soDigitos(m.celular).length >= 10],
    ['cidade', 'Cidade e UF do consultório', !!m.empresa_cidade && !!m.empresa_uf],
    ['especialidade', 'Especialidade', !!esp],
  ];
  return itens.map(([campo, rotulo, ok]) => ({ campo, rotulo, ok }));
}

async function situacao(m) {
  const lista = await checklist(m);
  const esp = await especialidadeDe(m);
  return {
    id: m.id,
    nome: strip(m.medico),
    crm: strip(m.crm),
    crm_uf: m.crm_uf || '',
    especialidade: esp || (m.especialidade || ''),
    habilitado: !!(m.habilitado_memed || m.memed_token),
    tem_token: !!m.memed_token,
    checklist: lista,
    pronto: lista.every((i) => i.ok),
  };
}

const scriptMemed = () => `${config.memed.scriptBase.replace(/\/+$/, '')}/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js`;

function escolheAcesso(medico) {
  if (medico && medico.memed_token) return ['medico', medico.memed_token];
  const reserva = config.memed.dataToken || '';
  if (reserva) return ['reserva', reserva];
  return ['indisponivel', ''];
}

/** _corpo_usuario_memed(doctor) */
async function corpoUsuario(d) {
  const nomeTodo = strip(d.medico);
  const i = nomeTodo.indexOf(' ');
  const nome = i < 0 ? nomeTodo : nomeTodo.slice(0, i);
  const sobrenome = i < 0 ? '' : nomeTodo.slice(i + 1);
  if (!d.data_nascimento) throw erroPython("'NoneType' object has no attribute 'strftime'");
  const [a, mes, dia] = String(d.data_nascimento).slice(0, 10).split('-');
  const attributes = {
    external_id: d.cpf_hash,
    nome,
    sobrenome: sobrenome.trim(),
    cpf: soDigitos(d.cpf),
    board: { board_code: 'CRM', board_number: d.crm, board_state: d.crm_uf },
    email: d.email,
    telefone: soDigitos(d.celular),
    sexo: d.genero,
    data_nascimento: `${dia}/${mes}/${a}`,
  };
  const cidade = await _codigoCidade(d.empresa_cidade, d.empresa_uf);
  return {
    data: {
      type: 'usuarios',
      attributes,
      relationships: {
        cidade: { data: { type: 'cidades', id: cidade } },
        especialidade: { data: { type: 'especialidades', id: d.fk_especialidade_id } },
      },
    },
  };
}

/** request.data or request.query_params */
function prmDe(req) {
  const d = req.data;
  const vazio = !d || (typeof d.get === 'function' ? d.tamanho === 0 : Object.keys(d).length === 0);
  const fonte = vazio ? req.GET : d;
  const qd = typeof fonte.getlist === 'function';
  return { get: (k) => (qd ? fonte.get(k) : (Object.prototype.hasOwnProperty.call(fonte, k) ? fonte[k] : null)) };
}

/** TbMedicos.objects.filter(id=prm.get('doc') or 0).first() */
async function medicoDoc(prm) {
  let id = prm.get('doc');
  if (!pyBool(id)) id = 0;
  if (typeof id === 'boolean') id = Number(id);
  if (!/^[-+]?\d+$/.test(String(id).trim())) throw erroPython(`Field 'id' expected a number but got ${typeof id === 'string' ? `'${id}'` : pyStrValor(id)}.`);
  return db.linha(M, await db.tabela(M).where(col(M, 'id'), parseInt(String(id).trim(), 10)).orderBy(col(M, 'id')).first());
}

const CAMPOS_MEMED = ['status', 'user_type', 'nome_completo', 'crm', 'uf', 'cpf', 'data_nascimento', 'telefone', 'especialidade', 'email'];
const memedDe = (attrs, campos) => Object.fromEntries(campos.map((k) => [k, pyGet(attrs, k, '')]));

/** JsonResponse com status */
const resp = (res, dados, status = 200) => json(res, dados, status);

// ------------------------------------------------------------- ações
async function checkKey(req, res) {
  const r = await requisicao('GET', `${BASE()}/v1/sinapse-prescricao/check-key`, {
    headers: { Accept: 'application/json' }, params: chaves(),
  });
  const ret = loads(r.texto);
  if (!ehDict(ret)) throw erroPython('In order to allow non-dict objects to be serialized set the safe parameter to False.');
  resp(res, ret, r.status);
}

async function especialidadesSync(req, res) {
  const r = await requisicao('GET', `${BASE()}v1/especialidades`, {
    headers: { Accept: 'application/vnd.api+json', 'Cache-Control': 'no-cache', 'Content-Type': 'application/json' },
  });
  const ret = pyGet(loads(r.texto), 'data');
  if (ret === null) throw erroPython("'NoneType' object is not iterable");
  const lista = Array.isArray(ret) ? ret : ehDict(ret) ? Object.keys(ret) : null;
  if (lista === null) throw erroPython(`'${typeof ret}' object is not iterable`);
  const E = 'TbEspecialidades';
  for (const i of lista) {
    const id = item(i, 'id'), at = item(i, 'attributes');
    const nome = item(at, 'nome'), grupo = item(at, 'grupo');
    const t = String(id).trim();
    if (!/^[-+]?\d+$/.test(t)) throw erroPython(`Field 'id' expected a number but got ${pyStrValor(id)}.`);
    const q = db.tabela(E).where(col(E, 'id'), parseInt(t, 10));
    for (const [k, v] of [['nome', nome], ['grupo', grupo]]) { if (v === null) q.whereNull(col(E, k)); else q.where(col(E, k), pyStrValor(v)); }
    if (await q.first()) continue;
    // TbEspecialidades(id=..., nome=..., grupo=...).save(): os outros campos vão com o padrão ('')
    await modelo.salva(req, E, { id: parseInt(t, 10), codigo: '', descricao: '', nome, grupo });
  }
  resp(res, { success: 'ok' }, r.status);
}

async function acesso(req, res) {
  let medico = req.user && req.user.fk_medico ? Object.assign({}, req.user.fk_medico) : null;
  const consulta = req.GET.get('consulta');
  if (medico === null && consulta && /^\d+$/.test(consulta)) {
    const A = 'TbAgendaCons', ta = db.modelo(A).tabela, tm = db.modelo(M).tabela;
    const l = await db.knex(ta).join(tm, `${tm}.${col(M, 'id')}`, `${ta}.${col(A, 'fk_medico_id')}`)
      .where(`${ta}.${col(A, 'id')}`, consulta).orderBy(`${ta}.${col(A, 'id')}`).select(`${tm}.*`).first();
    medico = l ? db.linha(M, l) : null;
  }
  if (medico !== null && !medico.memed_token && medico.habilitado_memed && medico.cpf_hash) {
    // habilitado mas sem token salvo: busca uma vez na Memed
    try {
      const token = pyGet(atributos(await _memedGetUsuario(medico.cpf_hash)), 'token');
      if (pyBool(token)) {
        medico.memed_token = token;
        await modelo.salva(req, M, medico);
      }
    } catch (e) { /* except Exception: pass */ }
  }
  const [origem, token] = escolheAcesso(medico);
  resp(res, { origem, token, script: scriptMemed(), prescritor: medico !== null ? await situacao(medico) : null });
}

async function doctorAdd(req, res, doctor) {
  const sit = await situacao(doctor);
  if (!sit.pronto) {
    const faltam = sit.checklist.filter((i) => !i.ok).map((i) => i.rotulo);
    return resp(res, { erro: 'Complete o cadastro antes de habilitar: ' + faltam.join(', ') + '.', pendencias: faltam, situacao: sit }, 400);
  }
  let corpo;
  try {
    corpo = await corpoUsuario(doctor);
  } catch (e) {
    if (e.valueError) return resp(res, { erro: e.message, situacao: sit }, 400);
    if (e instanceof ErroRequisicao) return resp(res, { erro: SEM_CONEXAO, situacao: sit }, 502);
    throw e;
  }
  let r;
  try {
    r = await requisicao('POST', `${BASE()}v1/sinapse-prescricao/usuarios`, {
      headers: { Accept: 'application/vnd.api+json' }, corpo: pyJson(corpo), params: chaves(), timeout: 30,
    });
  } catch (e) {
    if (e instanceof ErroRequisicao) return resp(res, { erro: SEM_CONEXAO, situacao: sit }, 502);
    throw e;
  }
  const texto = r.texto || '';
  if (r.status === 200 || r.status === 201) {
    const attrs = atributos(_json(r));
    doctor.memed_token = pyGet(attrs, 'token') || doctor.memed_token;
    doctor.habilitado_memed = true;
    await modelo.salva(req, M, doctor);
    return resp(res, { success: 'Médico habilitado na Memed. Ele já pode prescrever no atendimento.', situacao: await situacao(doctor) });
  }
  if (texto.includes('ja cadastrado') || texto.includes('Dr(a) com o CRM/CRO')) {
    // já existia na Memed: marca como habilitado e traz o token
    doctor.habilitado_memed = true;
    try {
      const token = pyGet(atributos(await _memedGetUsuario(doctor.cpf_hash)), 'token');
      if (pyBool(token)) doctor.memed_token = token;
    } catch (e) { /* except Exception: pass */ }
    await modelo.salva(req, M, doctor);
    return resp(res, { success: 'Este médico já estava cadastrado na Memed. O acesso foi vinculado.', situacao: await situacao(doctor) });
  }
  return resp(res, { erro: _erroMemed(r), situacao: sit }, 400);
}

async function doctorDataRead(req, res) {
  const doctor = await medicoDoc(prmDe(req));
  if (!doctor) return resp(res, { erro: 'Médico não encontrado.' }, 404);
  if (!doctor.cpf_hash) {
    return resp(res, { erro: 'Salve o cadastro com o CPF do médico antes de consultar a Memed.', situacao: await situacao(doctor) }, 400);
  }
  let r;
  try {
    r = await requisicao('GET', `${BASE()}v1/sinapse-prescricao/usuarios/${doctor.cpf_hash}`, {
      headers: { Accept: 'application/vnd.api+json' }, params: chaves(), timeout: 30,
    });
  } catch (e) {
    if (e instanceof ErroRequisicao) return resp(res, { erro: SEM_CONEXAO, situacao: await situacao(doctor) }, 502);
    throw e;
  }
  if (r.status === 404) {
    return resp(res, { erro: 'Este médico ainda não está cadastrado na Memed. Use "Habilitar na Memed".', situacao: await situacao(doctor) }, 404);
  }
  if (r.status !== 200) return resp(res, { erro: _erroMemed(r), situacao: await situacao(doctor) }, 400);
  const attrs = atributos(_json(r));
  if (pyBool(pyGet(attrs, 'token'))) {
    doctor.memed_token = attrs.token;
    doctor.habilitado_memed = true;
    await modelo.salva(req, M, doctor);
  }
  resp(res, { success: 'Situação consultada na Memed.', memed: memedDe(attrs, CAMPOS_MEMED), situacao: await situacao(doctor) });
}

async function doctorDataSync(req, res) {
  const doctor = await medicoDoc(prmDe(req));
  if (!doctor) return resp(res, { erro: 'Médico não encontrado.' }, 404);
  const sit = await situacao(doctor);
  if (!sit.pronto) {
    const faltam = sit.checklist.filter((i) => !i.ok).map((i) => i.rotulo);
    return resp(res, { erro: 'Complete o cadastro antes de enviar: ' + faltam.join(', ') + '.', pendencias: faltam, situacao: sit }, 400);
  }
  let r;
  try {
    const corpo = await corpoUsuario(doctor);
    r = await requisicao('PATCH', `${BASE()}v1/sinapse-prescricao/usuarios/${doctor.cpf_hash}`, {
      headers: { Accept: 'application/vnd.api+json', 'Cache-Control': 'no-cache', 'Content-Type': 'application/json' },
      params: chaves(), corpo: pyJson(corpo), timeout: 30,
    });
  } catch (e) {
    if (e.valueError) return resp(res, { erro: e.message, situacao: sit }, 400);
    if (e instanceof ErroRequisicao) return resp(res, { erro: SEM_CONEXAO, situacao: sit }, 502);
    throw e;
  }
  if (r.status !== 200 || (r.texto || '').includes('errors')) return resp(res, { erro: _erroMemed(r), situacao: sit }, 400);
  const attrs = atributos(_json(r));
  resp(res, { success: 'Dados do médico atualizados na Memed.', memed: memedDe(attrs, CAMPOS_MEMED.concat(['ambiente'])), situacao: sit });
}

module.exports = function (app) {
  const base = '/api/memed';
  // lista: paginação do Manager (ver o comentário no topo)
  app.get(`${base}/`, (req, res, next) => Promise.resolve((async () => {
    const total = Number((await db.tabela(M).count({ n: '*' }).first()).n);
    const off = req.GET.get('offset');
    const offset = off !== null && /^\s*[-+]?\d+\s*$/.test(off) && parseInt(off, 10) >= 0 ? parseInt(off, 10) : 0;
    if (total === 0 || offset > total) return drf.listaPaginada(req, res, db.tabela(M), async () => null);
    throw erroPython("'Manager' object is not subscriptable");
  })()).catch(next));

  viewset.registra(app, base, {
    modelo: M,
    serializer: apiMedico.serializerMedico(),
    metodos: ['create', 'retrieve', 'update', 'partial_update', 'destroy'],
    antesDeCriar: apiMedico.hashDoCpf, antesDeAtualizar: apiMedico.hashDoCpf,
    acoes: [
      { nome: 'check_validade_chave_acesso', url: 'check-validade-chave-acesso', detalhe: false, metodos: ['get'], fn: checkKey },
      { nome: 'especialidades_syncronize', url: 'especialidades-syncronize', detalhe: false, metodos: ['get', 'post'], fn: especialidadesSync },
      { nome: 'acesso', detalhe: false, metodos: ['get'], fn: acesso },
      { nome: 'doctor_data_read', url: 'doctor-data-read', detalhe: false, metodos: ['post', 'get'], fn: doctorDataRead },
      { nome: 'doctor_data_syncronize', url: 'doctor-data-syncronize', detalhe: false, metodos: ['post', 'get'], fn: doctorDataSync },
      { nome: 'situacao', detalhe: true, metodos: ['get'], fn: async (req, res, o) => resp(res, { situacao: await situacao(o) }) },
      { nome: 'doctor_add', url: 'doctor-add', detalhe: true, metodos: ['get'], fn: doctorAdd },
    ],
  });
};

module.exports.situacao = situacao;
