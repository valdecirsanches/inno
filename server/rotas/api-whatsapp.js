'use strict';
/**
 * /api/whatsapp/: WhatsappViewSet (WhatsApp/views.py do AppClinic).
 * CRUD de tb_whatsapp (WhatsappSerializer) e as ações que falam com o
 * servidor WAHA da clínica: envia, read_qrcode, restart_session,
 * iniciar_sessao, info, agenda_texto, EnviaWhatsApp.
 *
 * Duas formas de resposta, como no original: Response do DRF (JSON compacto,
 * com acentos) e JsonResponse do Django (", " e ": ", acentos como á).
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db');
const viewset = require('../util/viewset');
const drf = require('../util/drf');
const modelo = require('../util/modelo');
const requests = require('../util/requests');
const { json } = require('../util/http');
const { erroPython } = require('../util/orm');
const { WhatsAppService } = require('../util/whatsapp');
const evolution = require('../util/evolution');
const { pyStrValor, pyGet, pyBool, ehDict, pyJsonLoads } = require('../util/python');
const { formata } = require('../util/formato-data');

const A = 'TbAgendaCons';
const W = 'TbWhatsApp';
const API_KEY = 'eds.2013';
const LOGO = path.join(config.raiz, 'static', 'img', 'neuro100.png');

/** Response do DRF */
const responde = (res, dados, status = 200) => drf.responde(res, dados, status);
/** fatia de texto como o Python (por caractere) */
const fatia = (t, n) => Array.from(String(t)).slice(0, n).join('');
/** request.is_secure() / build_absolute_uri().split('://')[0] (sem cabeçalho de proxy configurado no Django) */
const esquema = (req) => (req.socket && req.socket.encrypted ? 'https' : 'http');
const hostDe = (req) => req.get('host');

/** x == y do Python para os valores do JSON */
function igual(x, y) {
  const n = (v) => (v && typeof v === 'object' && '__float__' in v ? v.__float__ : v);
  x = n(x);
  if (typeof x === 'boolean') x = x ? 1 : 0;
  return typeof x === typeof y && x === y;
}

/** o objeto "prm": request.query_params or request.data (ou ao contrário) */
function prmDe(req, primeiroQuery) {
  const vazio = (d) => !d || (typeof d.getlist === 'function' ? d.tamanho === 0 : Object.keys(d).length === 0);
  const fonte = primeiroQuery ? (vazio(req.GET) ? req.data : req.GET) : (vazio(req.data) ? req.GET : req.data);
  const qd = fonte && typeof fonte.getlist === 'function';
  return { get: (k) => (qd ? fonte.get(k) : (fonte && Object.prototype.hasOwnProperty.call(fonte, k) ? fonte[k] : null)) };
}

/** usuário com a clínica carregada (o que o WhatsAppService(user) lê) */
async function usuarioComClinica(id) {
  if (id === null || id === undefined) return null;
  const u = await db.busca('TbUsuario', { id });
  if (!u) throw erroPython('TbUsuario matching query does not exist.');
  u.fk_clinica = u.fk_clinica_id ? await db.busca('TbClinica', { id: u.fk_clinica_id }) : null;
  return u;
}

/** TbAgendaCons.objects.get(id=...) com os erros do Django */
async function consulta(id) {
  if (id === null || id === undefined) throw erroPython('TbAgendaCons matching query does not exist.');
  const t = String(id).trim();
  if (!/^[-+]?\d+$/.test(t)) throw erroPython(`Field 'id' expected a number but got '${id}'.`);
  const ag = await db.busca(A, { id: parseInt(t, 10) });
  if (!ag) { const e = erroPython('TbAgendaCons matching query does not exist.'); e.naoExiste = true; throw e; }
  return ag;
}

const rel = async (M, id, attr) => {
  if (id === null || id === undefined) throw erroPython(`'NoneType' object has no attribute '${attr}'`);
  const o = await db.busca(M, { id });
  if (!o) throw erroPython(`${M} matching query does not exist.`);
  return o;
};

/** MsgWhatsapp(request, ag) do Agenda/Consultas/views.py: '' se faltar algo */
async function msgWhatsapp(ag) {
  try {
    const pac = await rel('TbPacientes', ag.fk_paciente_id, 'paciente');
    const med = await rel('TbMedicos', ag.fk_medico_id, 'medico');
    if (!ag.hora) throw new Error('hora');
    const cl = await rel('TbClinica', ag.fk_clinica_id, 'whatsapp_texto');
    return 'INNO - INSTITUTO NEUROCIRURGIA E NEUROLOGIA DE OSASCO\n' +
      `Olá *${pyStrValor(pac.paciente)}*\n` +
      `Consulta médica com *${pyStrValor(med.medico)}*\n` +
      `Dia *${formata(ag.data, 'd/m/Y')} às ${String(ag.hora).slice(0, 5)}*\n\n` +
      'Responda:\n\n' +
      ' *1* para confirmar presença ✅\n' +
      ' *2* para cancelar consulta ❌\n\n' +
      pyStrValor(cl.whatsapp_texto);
  } catch (e) {
    return '';
  }
}

/** grava_envio (WhatsApp/registro.py): id calculado, até 5 tentativas */
async function gravaEnvio(req, campos) {
  for (let i = 0; i < 5; i++) {
    try {
      const max = await db.tabela(W).max({ m: db.coluna(W, 'id') }).first();
      const obj = Object.assign({ id: (Number(max && max.m) || 0) + 1 }, campos);
      if (await db.busca(W, { id: obj.id })) continue;
      await modelo.salva(req, W, obj);
      return obj;
    } catch (e) {
      if (/duplicate|unique|constraint/i.test(e.message)) continue;
      throw e;
    }
  }
  throw erroPython('Não foi possível gravar o registro do WhatsApp');
}

const soDig = (t) => String(t === null || t === undefined ? '' : t).replace(/\D/g, '');

/** variantes_telefone: com e sem 55, com e sem o nono dígito, com e sem @c.us / @s.whatsapp.net */
function variantesTelefone(numero) {
  let num = soDig(String(numero || '').split('@')[0]);
  if (!num) return new Set();
  if (num.startsWith('00')) num = num.slice(2);
  if (!num.startsWith('55') && [10, 11].includes(num.length)) num = '55' + num;
  const bases = new Set([num]);
  if (num.startsWith('55')) {
    if (num.length === 13) bases.add(num.slice(0, 4) + num.slice(5));
    else if (num.length === 12) bases.add(num.slice(0, 4) + '9' + num.slice(4));
  }
  const formas = new Set();
  for (const b of bases) for (const f of [b, b.startsWith('55') ? b.slice(2) : b, `${b}@c.us`, `${b}@s.whatsapp.net`]) formas.add(f);
  return formas;
}

// ------------------------------------------- servidor do WhatsApp da clínica
/** GET/POST /api/whatsapp/provedor/: WAHA ou Evolution API (só super/admin troca) */
async function provedor(req, res) {
  const post = req.method === 'POST';
  const prm = post ? prmDe(req, false) : { get: (k) => req.GET.get(k) };
  let idClinica = parseInt(prm.get('id_clinica') || (req.user && req.user.fk_clinica_id) || 0, 10);
  if (!Number.isFinite(idClinica)) idClinica = 0;
  const pode = evolution.podeTrocar(req.user);
  if (post) {
    if (!pode) return responde(res, { success: false, error: 'Só o superusuário ou o administrador troca o servidor do WhatsApp.' }, 403);
    if (!idClinica || !(await db.busca('TbClinica', { id: idClinica }))) {
      return responde(res, { success: false, error: 'Salve a clínica antes de escolher o servidor do WhatsApp.' }, 400);
    }
    const escolha = String(prm.get('provedor') || '').toLowerCase();
    if (escolha === evolution.EVOLUTION && !evolution.disponivel()) {
      return responde(res, { success: false, error: 'A Evolution API não está configurada no servidor (EVOLUTION_URL).' }, 400);
    }
    const novo = await evolution.gravaProvedor(idClinica, escolha, req.user && req.user.login);
    console.log(`[WhatsApp] Clínica ${idClinica}: servidor -> ${novo} (por ${req.user && req.user.login})`);
    return responde(res, { success: true, provedor: novo });
  }
  return responde(res, { provedor: await evolution.provedorDaClinica(idClinica), podeTrocar: pode, evolutionDisponivel: evolution.disponivel() });
}

/**
 * Botão "Webhook" da clínica.
 * GET  /api/whatsapp/webhook/?id_clinica=N   o que está configurado
 * POST /api/whatsapp/webhook/ {id_clinica, acao: aplicar|testar}
 */
async function webhook(req, res) {
  const post = req.method === 'POST';
  const prm = post ? prmDe(req, false) : { get: (k) => req.GET.get(k) };
  const id = parseInt(prm.get('id_clinica') || (req.user && req.user.fk_clinica_id) || 0, 10);
  const clinica = Number.isFinite(id) && id ? await db.busca('TbClinica', { id }) : null;
  if (!clinica) return responde(res, { success: false, error: 'Salve a clínica antes de conferir o webhook.' }, 400);
  const provedor = await evolution.provedorDaClinica(clinica.id);
  const sessao = String(clinica.whatsappClient || '').trim();
  const esperado = evolution.enderecoWebhook(req);
  const acao = post ? String(prm.get('acao') || '') : '';

  if (acao === 'testar') {
    // o próprio servidor chama o endereço do webhook (confere se ele responde)
    try {
      const r = await requests.post(esperado, { json: { event: 'teste.webhook', instance: sessao, data: {} }, timeout: 10 });
      let corpo;
      try { corpo = JSON.parse(r.text); } catch (e) { corpo = r.text.slice(0, 300); }
      const ok = r.status_code === 200 && corpo && typeof corpo === 'object' && corpo.success === true;
      return responde(res, { success: ok, url: esperado, http: r.status_code, resposta: corpo });
    } catch (e) {
      return responde(res, { success: false, url: esperado, error: `O endereço não respondeu: ${e.message}` });
    }
  }
  if (acao === 'aplicar') {
    if (!evolution.podeTrocar(req.user)) return responde(res, { success: false, error: 'Só o superusuário ou o administrador aplica o webhook.' }, 403);
    if (provedor !== evolution.EVOLUTION) return responde(res, { success: false, error: 'No WAHA o webhook é configurado no próprio servidor do WAHA (WHATSAPP_HOOK_URL).' }, 400);
    if (!evolution.disponivel() || !sessao) return responde(res, { success: false, error: 'Falta EVOLUTION_URL no .env ou o ID da sessão da clínica.' }, 400);
    if (!(await new evolution.Evolution(sessao).configuraWebhook(esperado))) {
      return responde(res, { success: false, error: 'A Evolution API não aceitou o webhook (a instância existe? conecte pelo QR Code).' }, 502);
    }
  }
  const ret = { provedor, sessao, webhook_esperado: esperado,
    podeAplicar: evolution.podeTrocar(req.user) && provedor === evolution.EVOLUTION, ultimo_recebido: await evolution.ultimoRecebido(),
    recebidas: await evolution.respostasRecebidas() };
  if (provedor === evolution.EVOLUTION) {
    const evo = new evolution.Evolution(sessao);
    ret.servidor = evo.url || '(EVOLUTION_URL não está no .env)';
    ret.estado = evo.url ? await evo.statusWaha() : null;
    const atual = evo.url ? await evo.webhookAtual() : { erro: 'EVOLUTION_URL não está no .env.' };
    ret.no_servidor = atual;
    ret.confere = Boolean(atual.url && atual.url === esperado && atual.enabled && (atual.events || []).some((e) => String(e).toUpperCase() === 'MESSAGES_UPSERT'));
  } else {
    const url = evolution.wahaUrl(clinica.whatsapp_url || '');
    ret.servidor = url || '(WAHA_URL não está no .env)';
    const atual = await evolution.webhookWaha(url, sessao);
    ret.estado = atual.status === undefined ? null : atual.status;
    ret.no_servidor = atual;
    ret.confere = (atual.webhooks || []).some((g) => g.url === esperado);
  }
  if (acao === 'aplicar') ret.success = true;
  return responde(res, ret);
}

/** a instância da Evolution, se a clínica desta sessão usa a Evolution */
async function evolutionDaSessao(req, sessionId) {
  try {
    const cl = await evolution.clinicaDaSessao(sessionId, req.user);
    if (cl && evolution.disponivel() && await evolution.provedorDaClinica(cl.id) === evolution.EVOLUTION) {
      return new evolution.Evolution(sessionId || cl.whatsappClient);
    }
  } catch (e) { console.log(`[WhatsApp] Erro ao ler o servidor da clínica: ${e.message}`); }
  return null;
}

async function qrEvolution(req, res, evo) {
  try {
    const st = await evo.statusWaha();
    if (st === 'WORKING') {
      await evo.configuraWebhook(evolution.enderecoWebhook(req));
      return responde(res, { status: 'WORKING', connected: true, qr: null, message: 'WhatsApp conectado.' });
    }
    if (st === null) return responde(res, { status: 'OFFLINE', connected: false, qr: null, message: 'Servidor da Evolution API inacessível, tentando de novo...' });
    if (st === 'ERROR') return responde(res, { status: 'ERROR', connected: false, qr: null, message: 'A Evolution API recusou a chave (EVOLUTION_API_KEY).' });
    const qr = await evo.qr(evolution.enderecoWebhook(req));
    if (qr) return responde(res, { status: 'SCAN_QR_CODE', connected: false, qr });
    return responde(res, { status: 'STARTING', connected: false, qr: null, message: 'QR ainda nao disponivel, aguarde...' });
  } catch (e) {
    if (e instanceof requests.Timeout) return responde(res, { status: 'TIMEOUT', connected: false, qr: null, message: 'Servidor demorou a responder, tentando de novo...' });
    return responde(res, { error: e.message, connected: false });
  }
}

// ------------------------------------------------------------------ ações
async function read_qrcode(req, res) {
  const prm = prmDe(req, true);
  let host = prm.get('host');
  let sessionId = prm.get('sessionId');
  if (pyBool(sessionId) && typeof sessionId === 'string') {
    const evo = await evolutionDaSessao(req, sessionId.trim());
    if (evo) return qrEvolution(req, res, evo);
  }
  host = evolution.wahaUrl(pyBool(host) ? host : '') || host;
  if (!pyBool(host) || !pyBool(sessionId)) return responde(res, { error: 'Parametros ausentes' }, 400);
  if (typeof host !== 'string') throw erroPython(`'${typeof host === 'number' ? 'int' : typeof host}' object has no attribute 'strip'`);
  if (typeof sessionId !== 'string') throw erroPython(`'${typeof sessionId === 'number' ? 'int' : typeof sessionId}' object has no attribute 'strip'`);
  host = host.trim().replace(/\/+$/, '');
  sessionId = sessionId.trim();
  const headers = { 'X-Api-Key': evolution.wahaChave(), Accept: 'application/json' };
  const urlStatus = `${host}/api/sessions/${sessionId}`;
  const urlQr = `${host}/api/${sessionId}/auth/qr`;
  const urlStart = `${host}/api/sessions/${sessionId}/start`;
  const urlRestart = `${host}/api/sessions/${sessionId}/restart`;

  const status = async () => {
    try {
      const r = await requests.get(urlStatus, { headers, timeout: 6 });
      if (r.ok) return pyGet(r.json() || {}, 'status');
      console.log(`[WhatsApp] Erro consultando status: HTTP ${r.status_code}`);
    } catch (e) { console.log(`[WhatsApp] Erro status: ${e.message}`); }
    return null;
  };
  const dispara = async (url) => {
    try { await requests.post(url, { headers, timeout: 6 }); } catch (e) { console.log(`[WhatsApp] Requisição ignorada para ${url}: ${e.message}`); }
  };
  const respostaQr = (resp) => {
    const ct = String(resp.headers.get('content-type', '')).toLowerCase();
    if (ct.includes('image') && resp.content.length) {
      return { status: 'SCAN_QR_CODE', connected: false, qr: `data:${ct};base64,${resp.content.toString('base64')}` };
    }
    let data;
    try { data = resp.json(); } catch (e) { return null; }
    let valor = pyGet(data, 'value');
    if (!pyBool(valor)) valor = pyGet(data, 'qr');
    if (!pyBool(valor)) valor = pyGet(data, 'base64');
    if (pyBool(valor)) {
      if (!pyStrValor(valor).startsWith('data:')) valor = `data:image/png;base64,${pyStrValor(valor)}`;
      return { status: 'SCAN_QR_CODE', connected: false, qr: valor };
    }
    return null;
  };
  const pedeQr = () => requests.get(urlQr, {
    params: { format: 'image', _ts: Date.now() },
    headers: Object.assign({}, headers, { Accept: 'image/png', 'Cache-Control': 'no-cache' }), timeout: 6,
  });

  try {
    const st = await status();
    console.log(`[WhatsApp] read_qrcode status = ${st === null ? 'None' : pyStrValor(st)}`);
    if (st === 'WORKING') return responde(res, { status: 'WORKING', connected: true, qr: null, message: 'WhatsApp conectado.' });
    if (st === 'FAILED') {
      await dispara(urlRestart);
      return responde(res, { status: 'FAILED', connected: false, qr: null, message: 'Reiniciando sessao, aguarde...' });
    }
    if (st === 'STOPPED' || st === null) {
      await dispara(urlStart);
      const resp = await pedeQr();
      if (resp.ok) { const out = respostaQr(resp); if (out !== null) return responde(res, out); }
      return responde(res, { status: st || 'STARTING', connected: false, qr: null, message: 'Iniciando sessao, aguarde...' });
    }
    const resp = await pedeQr();
    if (resp.ok) { const out = respostaQr(resp); if (out !== null) return responde(res, out); }
    return responde(res, { status: pyBool(st) ? st : 'UNAVAILABLE', connected: false, qr: null, message: 'QR ainda nao disponivel, aguarde...', status_code: resp.status_code });
  } catch (e) {
    if (e instanceof requests.Timeout) {
      return responde(res, { status: 'TIMEOUT', connected: false, qr: null, message: 'Servidor demorou a responder, tentando de novo...' });
    }
    return responde(res, { error: e.message, connected: false });
  }
}

async function restart_session(req, res) {
  const prm = prmDe(req, false);
  let host = prm.get('host');
  let sessionId = prm.get('sessionId');
  const evo = pyBool(sessionId) ? await evolutionDaSessao(req, pyStrValor(sessionId).trim()) : null;
  if (evo) {
    const antes = await evo.statusWaha();
    let st, dados;
    try { [st, dados] = await evo.reinicia(evolution.enderecoWebhook(req)); } catch (e) {
      if (e instanceof requests.Timeout) return responde(res, { success: false, error: 'A Evolution API demorou demais para responder ao reinicio.', sessionId: evo.sessao, status_before: antes }, 504);
      return responde(res, { success: false, error: `Falha de comunicacao com a Evolution API: ${e.message}`, sessionId: evo.sessao, status_before: antes }, 502);
    }
    if (st >= 400) {
      return responde(res, { success: false, error: 'A Evolution API recusou o pedido de reinicio.', sessionId: evo.sessao, status_before: antes, status_code: st, api_response: dados }, 502);
    }
    return responde(res, { success: true, message: 'Solicitacao de reinicio enviada ao servidor WhatsApp.', host: evo.url, sessionId: evo.sessao,
      status_before: antes, status_error: null, status_code: st, api_response: dados, provedor: 'evolution' });
  }
  if (!pyBool(host) || !pyBool(sessionId)) {
    return responde(res, { success: false, error: 'Informe os parametros host e sessionId.' }, 400);
  }
  host = evolution.wahaUrl(pyStrValor(host));
  sessionId = pyStrValor(sessionId).trim();
  if (!host || !sessionId) return responde(res, { success: false, error: 'Host ou sessionId invalido.' }, 400);
  const headers = { 'X-Api-Key': evolution.wahaChave(), Accept: 'application/json' };
  let statusAntes = null;
  let statusErro = null;
  try {
    const r = await requests.get(`${host}/api/sessions/${sessionId}`, { headers, timeout: 8 });
    if (r.ok) {
      try { statusAntes = pyGet(r.json() || {}, 'status'); } catch (e) { statusErro = 'Nao foi possivel interpretar o status atual da sessao.'; }
    } else {
      statusErro = `Nao foi possivel consultar o status atual. HTTP ${r.status_code}`;
    }
  } catch (e) {
    if (e instanceof requests.Timeout) statusErro = 'Tempo esgotado ao consultar o status atual.';
    else if (e instanceof requests.RequestException) statusErro = `Erro ao consultar status: ${e.message}`;
    else throw e;
  }
  try {
    const r = await requests.post(`${host}/api/sessions/${sessionId}/restart`, { headers, timeout: 15 });
    let api;
    try { api = r.json(); } catch (e) { api = { message: fatia(r.text, 1000) }; }
    if (!r.ok) {
      return responde(res, {
        success: false, error: 'A API do WhatsApp recusou o pedido de reinicio.', sessionId,
        status_before: statusAntes, status_error: statusErro, status_code: r.status_code, api_response: api,
      }, 502);
    }
    return responde(res, {
      success: true, message: 'Solicitacao de reinicio enviada ao servidor WhatsApp.', host, sessionId,
      status_before: statusAntes, status_error: statusErro, status_code: r.status_code, api_response: api,
    });
  } catch (e) {
    if (e instanceof requests.Timeout) {
      return responde(res, { success: false, error: 'A API do WhatsApp demorou demais para responder ao reinicio.', sessionId, status_before: statusAntes, status_error: statusErro }, 504);
    }
    if (e instanceof requests.RequestException) {
      return responde(res, { success: false, error: `Falha de comunicacao com a API do WhatsApp: ${e.message}`, sessionId, status_before: statusAntes, status_error: statusErro }, 502);
    }
    throw e;
  }
}

async function iniciar_sessao(req, res) {
  const prm = prmDe(req, true);
  let host = prm.get('host');
  let sessionId = prm.get('sessionId');
  const evo = pyBool(sessionId) ? await evolutionDaSessao(req, pyStrValor(sessionId).trim()) : null;
  if (evo) {
    try {
      const [ok, dados] = await evo.inicia(evolution.enderecoWebhook(req));
      return responde(res, { success: ok, status_code: ok ? 200 : 502, api_response: dados, provedor: 'evolution' });
    } catch (e) { return responde(res, { success: false, error: e.message }); }
  }
  if (!pyBool(host) || !pyBool(sessionId)) return responde(res, { success: false, error: 'Parametros ausentes' }, 400);
  host = evolution.wahaUrl(pyStrValor(host));
  sessionId = pyStrValor(sessionId).trim();
  try {
    const r = await requests.post(`${host}/api/sessions/${sessionId}/start`, { headers: { 'X-Api-Key': evolution.wahaChave(), Accept: 'application/json' }, timeout: 8 });
    let api;
    try { api = r.json(); } catch (e) { api = { message: fatia(r.text, 1000) }; }
    return responde(res, { success: r.ok, status_code: r.status_code, api_response: api });
  } catch (e) {
    return responde(res, { success: false, error: e.message });
  }
}

async function info(req, res) {
  try {
    const celular = req.POST.get('celular');
    const ws = new WhatsAppService(req.user && req.user.is_authenticated ? req.user : null);
    json(res, await ws.get_photo(celular));
  } catch (e) {
    json(res, { success: false, error: e.message }, 500);
  }
}

async function agenda_texto(req, res) {
  try {
    const ag = await consulta(req.GET.get('id_consulta'));
    const logo = `${esquema(req)}://${hostDe(req)}/static/img/neuro100.png`;
    // a situação da conexão é a da sessão por onde o envio sai: a da clínica de quem está usando
    // (EnviaWhatsApp usa req.user); antes era a de quem marcou a consulta, e a tela pedia o QR
    // Code de outra sessão
    const quem = req.user && req.user.is_authenticated && req.user.fk_clinica_id ? await usuarioComClinica(req.user.id) : await usuarioComClinica(ag.fk_usuario_id);
    const ws = new WhatsAppService(quem);
    const statusWa = await ws.check_status();
    const success = await msgWhatsapp(ag);
    const pac = await rel('TbPacientes', ag.fk_paciente_id, 'paciente');
    const cl = await rel('TbClinica', ag.fk_clinica_id, 'whatsapp_url');
    json(res, {
      success, name: pac.paciente, celular: pac.celular, logo,
      host: evolution.wahaUrl() || cl.whatsapp_url, session: cl.whatsappClient, whatsapp_status: statusWa,
      // o servidor e a sessão por onde o envio sai de verdade (antes mostrava sempre o do WAHA e a
      // sessão da clínica da consulta, mesmo com a Evolution API)
      host_ident: ws.evo ? `Evolution API ${ws.host} ( ${pyStrValor(ws.session)} )` : `${evolution.wahaUrl() || pyStrValor(cl.whatsapp_url)} ( ${pyStrValor(cl.whatsappClient)} )`,
    });
  } catch (e) {
    json(res, { success: false, error: e.message }, 400);
  }
}

/** EnviaWhatsApp: devolve [dados, status] do JsonResponse */
async function enviaWhatsApp(req) {
  try {
    const p = req.POST;
    const service = new WhatsAppService(req.user && req.user.is_authenticated ? req.user : null);
    let ag;
    try {
      ag = await consulta(p.get('id_consulta', 0));
    } catch (e) {
      if (e.naoExiste) return [{ success: false, error: 'Agendamento nao encontrado.' }, 404];
      throw e;
    }
    let celular = String(p.get('celular', '')).replace(/ /g, '').replace(/-/g, '').replace(/\(/g, '').replace(/\)/g, '');
    if (!celular) return [{ success: false, error: 'Celular nao informado.' }, 200];
    // ag.save(request)
    ag.fone_whatsapp = celular;
    if (req.user && req.user.pk) { ag.id_usuario_alteracao = req.user.pk; ag.dh_alteracao = db.agora(); }
    await modelo.salva(req, A, ag);
    if (Array.from(celular).length <= 11) celular = '55' + celular;
    const msg = await msgWhatsapp(ag);
    // a logo da clínica no topo, com o texto junto
    const [resApi] = await service.enviar_texto_com_logo(celular, msg, LOGO);
    const statusHttp = resApi.status_code || 0;
    let r;
    try { r = pyJsonLoads(resApi.content.toString('utf8')); } catch (e) { r = {}; }
    let statusApi = pyGet(r, 'statusCode');
    if (!pyBool(statusApi)) statusApi = pyGet(r, 'status');
    const sucesso = [200, 201].includes(statusHttp) || igual(statusApi, 200) || igual(statusApi, 201) || igual(statusApi, 'success');
    if (!sucesso) {
      let erro = pyGet(r, 'error');
      if (!pyBool(erro)) erro = pyGet(r, 'message');
      if (!pyBool(erro)) erro = `HTTP ${statusHttp}`;
      return [{ success: false, error: `API Error: ${pyStrValor(erro)}` }, 200];
    }
    // registro do envio; uma falha aqui não invalida o envio
    try {
      const dados = pyGet(r, '_data', {}) || {};
      let idInfo = pyGet(dados, 'id', {});
      if (!pyBool(idInfo)) idInfo = pyGet(r, 'id', {});
      let idWa, origem;
      if (ehDict(idInfo)) {
        idWa = idInfo.id; if (!pyBool(idWa)) idWa = '';
        origem = idInfo.remote; if (!pyBool(origem)) origem = celular;
      } else { idWa = pyStrValor(idInfo); origem = celular; }
      const cl = await rel('TbClinica', ag.fk_clinica_id, 'whatsappClient');
      await gravaEnvio(req, {
        sistema: 'APPCLINIC', id_whatsapp: fatia(pyStrValor(idWa), 40), id_consulta: ag.id, destino: celular,
        origem: fatia(pyStrValor(origem), 40), mensagem: msg, dh: db.agora(), session_id: cl.whatsappClient || '',
        telefone_limpo: celular, status: 'pendente',
      });
    } catch (e) { console.log(`[WhatsApp] Falha ao salvar log (envio OK): ${e.message}`); }
    return [{ success: true, message: 'WhatsApp enviado com sucesso!' }, 200];
  } catch (e) {
    return [{ success: false, error: `Erro interno: ${e.message}` }, 500];
  }
}

module.exports = function (app) {
  viewset.registra(app, '/api/whatsapp', {
    modelo: W,
    serializer: {},
    acoes: [
      // envia: JsonResponse(self.EnviaWhatsApp(request)): o envio acontece e a
      // resposta (um JsonResponse dentro de outro) dá erro 500, como no AppClinic
      { nome: 'envia', detalhe: false, metodos: ['post', 'get'], fn: async (req) => {
        await enviaWhatsApp(req);
        throw erroPython('Object of type JsonResponse is not JSON serializable');
      } },
      { nome: 'provedor', detalhe: false, metodos: ['post', 'get'], fn: provedor },
      { nome: 'webhook', detalhe: false, metodos: ['post', 'get'], fn: webhook },
      { nome: 'read_qrcode', detalhe: false, metodos: ['post', 'get'], fn: read_qrcode },
      { nome: 'restart_session', detalhe: false, metodos: ['post'], fn: restart_session },
      { nome: 'iniciar_sessao', detalhe: false, metodos: ['post', 'get'], fn: iniciar_sessao },
      { nome: 'info', detalhe: false, metodos: ['post', 'get'], fn: info },
      { nome: 'agenda_texto', detalhe: false, metodos: ['post', 'get'], fn: agenda_texto },
      { nome: 'EnviaWhatsApp', detalhe: false, metodos: ['post', 'get'], fn: async (req, res) => {
        const [dados, status] = await enviaWhatsApp(req);
        json(res, dados, status);
      } },
    ],
  });
};

module.exports.variantesTelefone = variantesTelefone;
