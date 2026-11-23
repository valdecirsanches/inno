'use strict';
/**
 * Evolution API (v2) como alternativa ao WAHA: mesmo comportamento do
 * WhatsApp/evolution.py do AppClinic (fonte única: mudança num lado vai
 * para o outro).
 *
 * Cada clínica usa o WAHA (padrão) ou a Evolution API; o superusuário ou o
 * administrador escolhe na tela da clínica. A escolha fica na tabela
 * tb_clinica_whatsapp (a mesma do AppClinic, criada na primeira gravação).
 * O servidor vem do .env (o mesmo para todas as clínicas):
 *   EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_WEBHOOK_URL (opcional)
 * A instância na Evolution tem o nome do "ID da sessão" da clínica.
 */
const db = require('../db');
const requests = require('./requests');

const EVOLUTION = 'evolution';
const WAHA = 'waha';
const TABELA = 'tb_clinica_whatsapp';

const limpa = (v) => String(v || '').trim().replace(/^['"]|['"]$/g, '');

function servidor() {
  const url = limpa(process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL).replace(/\/+$/, '');
  const chave = limpa(process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_APIKEY);
  return [url, chave];
}
const disponivel = () => Boolean(servidor()[0]);

/** endereço do WAHA: o do .env (WAHA_URL); sem ele, o gravado na clínica */
const wahaUrl = (daClinica = '') => (limpa(process.env.WAHA_URL) || limpa(daClinica)).replace(/\/+$/, '');
const wahaChave = () => limpa(process.env.WAHA_API_KEY) || 'eds.2013';

async function garanteTabela() {
  if (await db.knex.schema.hasTable(TABELA)) return;
  await db.knex.schema.createTable(TABELA, (t) => {
    t.integer('id_clinica').notNullable().primary();
    t.string('provedor', 20).nullable();
    t.dateTime('atualizado_em').nullable();
    t.string('atualizado_por', 60).nullable();
  });
}

async function provedorDaClinica(idClinica) {
  if (!idClinica) return WAHA;
  try {
    const l = await db.knex(TABELA).where('id_clinica', Number(idClinica)).first();
    return l && String(l.provedor || '').toLowerCase() === EVOLUTION ? EVOLUTION : WAHA;
  } catch (e) {
    return WAHA;   // tabela ainda não existe
  }
}

async function gravaProvedor(idClinica, provedor, usuario = '') {
  await garanteTabela();
  const p = provedor === EVOLUTION ? EVOLUTION : WAHA;
  await db.knex(TABELA).where('id_clinica', Number(idClinica)).del();
  await db.knex(TABELA).insert({ id_clinica: Number(idClinica), provedor: p, atualizado_em: db.agora().slice(0, 19), atualizado_por: String(usuario || '').slice(0, 60) });
  return p;
}

const podeTrocar = (u) => Boolean(u && (u.is_superuser === true || u.is_superuser === 1 || String(u.administrador) === 'True'));

/** a clínica cujo "ID da sessão" é este; senão a do usuário */
async function clinicaDaSessao(sessao, usuario = null) {
  const C = 'TbClinica';
  let c = sessao ? db.linha(C, await db.tabela(C).where(db.coluna(C, 'whatsappClient'), sessao).orderBy(db.coluna(C, 'id')).first()) : null;
  if (!c && usuario && usuario.fk_clinica_id) c = await db.busca(C, { id: usuario.fk_clinica_id });
  return c || null;
}

function enderecoWebhook(req = null) {
  const url = limpa(process.env.EVOLUTION_WEBHOOK_URL || process.env.WHATSAPP_WEBHOOK_URL);
  if (url) return url;
  if (!req) return '';
  const proto = String(req.get('x-forwarded-proto') || (req.socket && req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
  return `${proto}://${req.get('host')}/webhook/resposta/`;
}

/** resposta no formato de requests.Response (status_code, ok, text, content, json()) */
class Resposta {
  constructor(payload, status) {
    this.status_code = status;
    this.ok = status >= 200 && status < 300;
    this.text = JSON.stringify(payload);
    this.content = Buffer.from(this.text, 'utf8');
    this.headers = { get: (k, p = null) => (String(k).toLowerCase() === 'content-type' ? 'application/json' : p) };
  }
  json() { return JSON.parse(this.text); }
}

const digitos = (chatId) => String(chatId || '').split('@')[0].replace(/\D/g, '');
const ehObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

class Evolution {
  constructor(sessao) {
    [this.url, this.chave] = servidor();
    this.sessao = String(sessao || '').trim();
  }

  get inst() { return encodeURIComponent(this.sessao); }

  /** [status, dados]; lança só em falha de rede */
  async chama(metodo, caminho, corpo = null, timeout = 15) {
    const r = await requests.request(metodo, `${this.url}${caminho}`, {
      headers: { Accept: 'application/json', apikey: this.chave }, json: corpo === null ? undefined : corpo, timeout,
    });
    let d;
    try { d = r.text ? JSON.parse(r.text) : {}; } catch (e) { d = { raw: r.text.slice(0, 500) }; }
    return [r.status_code, d];
  }

  async estado() {
    if (!(this.url && this.sessao)) return 'offline';
    let st, d;
    try { [st, d] = await this.chama('GET', `/instance/connectionState/${this.inst}`, null, 8); } catch (e) { return 'offline'; }
    if (st === 404) return 'inexistente';
    if (st === 401 || st === 403) return 'recusada';
    if (st >= 400) return 'offline';
    const inst = ehObj(d) && ehObj(d.instance) ? d.instance : {};
    return String(inst.state || (ehObj(d) && d.state) || inst.status || '').toLowerCase() || 'close';
  }

  /** o estado no vocabulário do WAHA */
  async statusWaha() {
    const e = await this.estado();
    const mapa = { open: 'WORKING', connecting: 'SCAN_QR_CODE', close: 'STOPPED', inexistente: 'STOPPED', recusada: 'ERROR', offline: null };
    return e in mapa ? mapa[e] : 'STOPPED';
  }

  async configuraWebhook(url) {
    if (!url) return false;
    try {
      let [st] = await this.chama('POST', `/webhook/set/${this.inst}`, { webhook: { enabled: true, url, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] } });
      if (st < 400) return true;
      [st] = await this.chama('POST', `/webhook/set/${this.inst}`, { url, enabled: true, webhook_by_events: false, events: ['MESSAGES_UPSERT'] });
      return st < 400;
    } catch (e) { return false; }
  }

  /** o webhook gravado na instância: {url, enabled, events} | {erro} */
  async webhookAtual() {
    let st, d;
    try { [st, d] = await this.chama('GET', `/webhook/find/${this.inst}`, null, 8); } catch (e) { return { erro: `Servidor da Evolution API inacessível: ${e.message}` }; }
    if (st === 404) return { erro: 'A instância ainda não existe na Evolution API (conecte pelo QR Code).' };
    if (st === 401 || st === 403) return { erro: 'A Evolution API recusou a chave (EVOLUTION_API_KEY).' };
    if (st >= 400) return { erro: `A Evolution API respondeu HTTP ${st}.` };
    if (!ehObj(d)) return { url: '', enabled: false, events: [] };
    const w = ehObj(d.webhook) ? d.webhook : d;
    return { url: w.url || '', enabled: Boolean(w.enabled), events: w.events || [], byEvents: Boolean(w.webhookByEvents || w.byEvents) };
  }

  async cria(webhook = '') {
    const [st, d] = await this.chama('POST', '/instance/create', { instanceName: this.sessao, qrcode: true, integration: 'WHATSAPP-BAILEYS' });
    if (st >= 400 && !/already|in use|exist/i.test(JSON.stringify(d))) return [false, d];
    await this.configuraWebhook(webhook);
    return [true, d];
  }

  async inicia(webhook = '') {
    const e = await this.estado();
    if (e === 'inexistente') {
      const [ok, d] = await this.cria(webhook);
      if (!ok) return [false, d];
    } else await this.configuraWebhook(webhook);
    if (e === 'open') return [true, { state: 'open' }];
    const [st, d] = await this.chama('GET', `/instance/connect/${this.inst}`);
    return [st < 400, d];
  }

  async qr(webhook = '') {
    const [ok, d] = await this.inicia(webhook);
    if (!ok || !ehObj(d)) return null;
    const b64 = d.base64 || (ehObj(d.qrcode) && d.qrcode.base64) || '';
    if (!b64) return null;
    return String(b64).startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  }

  async reinicia(webhook = '') {
    let [st, d] = await this.chama('POST', `/instance/restart/${this.inst}`, {});
    if (st === 404 || st === 405) [st, d] = await this.chama('PUT', `/instance/restart/${this.inst}`, {});
    if (st >= 400) {
      const [ok, d2] = await this.inicia(webhook);
      return [ok ? 200 : st, d2];
    }
    await this.configuraWebhook(webhook);
    return [st, d];
  }

  /** [true, jid] / [false, null] / [null, null] se não deu para checar */
  async numeroExiste(numero) {
    let st, d;
    try { [st, d] = await this.chama('POST', `/chat/whatsappNumbers/${this.inst}`, { numbers: [digitos(numero)] }, 10); } catch (e) { return [null, null]; }
    const lista = Array.isArray(d) ? d : (ehObj(d) ? d.data : null);
    if (st >= 400 || !Array.isArray(lista)) return [null, null];
    const x = lista[0] || {};
    if (x.exists) return [true, x.jid || `${digitos(numero)}@s.whatsapp.net`];
    return [false, null];
  }

  /** telefone (só dígitos) de um contato @lid, pelos contatos da instância; '' se não achar */
  async telefoneDoLid(lid) {
    let st, d;
    try { [st, d] = await this.chama('POST', `/chat/findContacts/${this.inst}`, { where: { remoteJid: lid } }, 8); } catch (e) { return ''; }
    if (st >= 400) return '';
    const achados = [];
    const procura = (o) => {
      if (Array.isArray(o)) o.forEach(procura);
      else if (ehObj(o)) {
        for (const [k, v] of Object.entries(o)) {
          if (typeof v === 'string' && /(pn|alt|phone|number)/i.test(k) && /^\d{10,15}(@s\.whatsapp\.net|@c\.us)?$/.test(v)) achados.push(digitos(v));
          else procura(v);
        }
      }
    };
    procura(d);
    return achados[0] || '';
  }

  async foto(numero) {
    let st, d;
    try { [st, d] = await this.chama('POST', `/chat/fetchProfilePictureUrl/${this.inst}`, { number: digitos(numero) }, 10); } catch (e) { return null; }
    if (st >= 400 || !ehObj(d)) return null;
    return d.profilePictureUrl || d.profilePicUrl || d.url || null;
  }

  /** o mesmo pedido que iria para o WAHA (sendText, sendImage, sendFile, sendVoice), na Evolution */
  async enviaComoWaha(endpoint, body) {
    const ep = String(endpoint).replace(/^\/+|\/+$/g, '');
    const numero = digitos(body.chatId);
    const arq = ehObj(body.file) ? body.file : {};
    let caminho, corpo;
    if (ep === 'sendText') {
      caminho = `/message/sendText/${this.inst}`; corpo = { number: numero, text: body.text || '' };
    } else if (ep === 'sendImage' || ep === 'sendFile') {
      const img = ep === 'sendImage';
      caminho = `/message/sendMedia/${this.inst}`;
      corpo = { number: numero, mediatype: img ? 'image' : 'document', mimetype: arq.mimetype || (img ? 'image/jpeg' : 'application/pdf'),
        media: arq.data || arq.url || '', fileName: arq.filename || (img ? 'imagem.jpg' : 'Documento.pdf'), caption: body.caption || '' };
    } else if (ep === 'sendVoice') {
      caminho = `/message/sendWhatsAppAudio/${this.inst}`; corpo = { number: numero, audio: arq.url || arq.data || '' };
    } else return new Resposta({ error: `Envio "${ep}" não existe na Evolution API.` }, 400);
    let [st, d] = await this.chama('POST', caminho, corpo, 60);
    if (!ehObj(d)) d = { resposta: d };
    const chave = ehObj(d.key) ? d.key : null;
    if (st < 400 && chave) d.id = { id: chave.id || '', remote: chave.remoteJid || `${numero}@s.whatsapp.net` };
    else if (st >= 400 && !('error' in d)) {
      const msg = ehObj(d.response) ? d.response.message : null;
      d.error = Array.isArray(msg) ? msg.map(String).join('; ') : (msg || d.message || `HTTP ${st}`);
    }
    return new Resposta(d, st);
  }
}

// ------------------------------- conferência do webhook (botão "Webhook" da clínica)
async function webhookWaha(urlWaha, sessao) {
  if (!urlWaha) return { erro: 'WAHA_URL não está no .env.' };
  let r;
  try {
    r = await requests.get(`${urlWaha}/api/sessions/${encodeURIComponent(sessao || '')}`, { headers: { 'X-Api-Key': wahaChave(), Accept: 'application/json' }, timeout: 8 });
  } catch (e) { return { erro: `Servidor do WAHA inacessível: ${e.message}` }; }
  if (r.status_code === 404) return { erro: 'A sessão não existe no WAHA (conecte pelo QR Code).' };
  if (r.status_code >= 400) return { erro: `O WAHA respondeu HTTP ${r.status_code}.` };
  let d;
  try { d = JSON.parse(r.text) || {}; } catch (e) { return { erro: 'Resposta inválida do WAHA.' }; }
  const ganchos = (ehObj(d.config) && Array.isArray(d.config.webhooks)) ? d.config.webhooks : [];
  return { status: d.status === undefined ? null : d.status, webhooks: ganchos.filter(ehObj).map((g) => ({ url: g.url || '', events: g.events || [] })) };
}

/** as últimas mensagens que chegaram no webhook e o que o sistema fez com cada uma */
async function respostasRecebidas(limite = 8) {
  const L = 'TbWhatsAppLog';
  let linhas;
  try { linhas = (await db.tabela(L).orderBy(db.coluna(L, 'id'), 'desc').limit(400)).reverse(); } catch (e) { return []; }
  const eventos = [];
  for (const l0 of linhas) {
    const l = db.linha(L, l0);
    let d = l.data_json;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { continue; } }
    if (!ehObj(d)) continue;
    if (d.tipo === 'resultado_webhook') {
      for (let i = eventos.length - 1; i >= 0; i--) if (eventos[i].resultado === null) { eventos[i].resultado = d.resposta; eventos[i].http = d.http; break; }
      continue;
    }
    if (!d.event || d.event === 'teste.webhook' || !('instance' in d || 'session' in d)) continue;
    // só mensagens (os avisos de conexão do servidor não entram na lista)
    if (!['messages.upsert', 'message', 'message.any', 'message.received'].includes(String(d.event).toLowerCase().replace(/_/g, '.'))) continue;
    let p, sessao, servidor;
    if ('instance' in d) { [, p, sessao] = eventoComoWaha(d); servidor = 'Evolution API'; } else { p = ehObj(d.payload) ? d.payload : {}; sessao = d.session || ''; servidor = 'WAHA'; }
    const dh = l.dh ? `${l.dh.slice(8, 10)}/${l.dh.slice(5, 7)}/${l.dh.slice(0, 4)} ${l.dh.slice(11, 19)}` : '';
    eventos.push({ dh, evento: String(d.event), servidor, sessao: String(sessao || ''), de: String(p.from || ''), texto: String(p.body || '').slice(0, 80), resultado: null, http: null });
  }
  return eventos.slice(-limite).reverse();
}

/** o último evento que chegou de um servidor de WhatsApp em /webhook/resposta/ */
async function ultimoRecebido() {
  try {
    const L = 'TbWhatsAppLog';
    const linhas = await db.tabela(L).orderBy(db.coluna(L, 'id'), 'desc').limit(200);
    for (const l0 of linhas) {
      const l = db.linha(L, l0);
      let d = l.data_json;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { continue; } }
      if (ehObj(d) && d.event && d.event !== 'teste.webhook' && ('instance' in d || 'session' in d)) {
        const dh = l.dh ? `${l.dh.slice(8, 10)}/${l.dh.slice(5, 7)}/${l.dh.slice(0, 4)} ${l.dh.slice(11, 19)}` : '';
        return { dh, evento: String(d.event), sessao: String(d.instance || d.session || ''), servidor: 'instance' in d ? 'Evolution API' : 'WAHA' };
      }
    }
  } catch (e) { /* sem log */ }
  return null;
}

// ------------------------------------------------- webhook: Evolution -> WAHA
function texto(m) {
  m = ehObj(m) ? m : {};
  // mensagens temporárias / visualização única vêm embrulhadas
  for (const capa of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage', 'editedMessage']) {
    if (ehObj(m[capa]) && ehObj(m[capa].message)) m = m[capa].message;
  }
  const g = (o, ...ks) => ks.reduce((x, k) => (ehObj(x) ? x[k] : undefined), o);
  return String(m.conversation || g(m, 'extendedTextMessage', 'text') || g(m, 'buttonsResponseMessage', 'selectedDisplayText')
    || g(m, 'buttonsResponseMessage', 'selectedButtonId') || g(m, 'templateButtonReplyMessage', 'selectedDisplayText')
    || g(m, 'listResponseMessage', 'singleSelectReply', 'selectedRowId') || g(m, 'listResponseMessage', 'title')
    || g(m, 'imageMessage', 'caption') || '').trim();
}

/** evento "messages.upsert" da Evolution -> [event, payload, session] como o WAHA */
function eventoComoWaha(corpo) {
  const evento = String(corpo.event || '');
  const sessao = String(corpo.instance || '');
  if (evento.toLowerCase().replace(/_/g, '.') !== 'messages.upsert') return [evento, {}, sessao];
  let d = corpo.data || {};
  if (Array.isArray(d)) d = d[0] || {};
  if (Array.isArray(d.messages) && d.messages.length) d = d.messages[0];
  const k = ehObj(d.key) ? d.key : {};
  return ['message', {
    id: k.id === undefined ? null : k.id, from: k.remoteJid || '', fromMe: Boolean(k.fromMe), body: texto(d.message),
    remoteJidAlt: k.remoteJidAlt || k.senderPn || '', senderPn: k.senderPn || d.senderPn || '', participant: k.participant || '',
    pushName: d.pushName || '', evolution: true,
    // o evento inteiro: o telefone real pode vir em outras chaves (senderPn, participantPn...)
    dados: d,
  }, sessao];
}

const ehEventoEvolution = (corpo) => ehObj(corpo) && 'instance' in corpo && 'data' in corpo && !('payload' in corpo);

module.exports = {
  EVOLUTION, WAHA, servidor, disponivel, wahaUrl, wahaChave, webhookWaha, ultimoRecebido, respostasRecebidas, provedorDaClinica, gravaProvedor, podeTrocar, clinicaDaSessao,
  enderecoWebhook, Evolution, Resposta, eventoComoWaha, ehEventoEvolution,
};
