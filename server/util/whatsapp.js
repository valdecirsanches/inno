'use strict';
/**
 * WhatsAppService (WhatsApp/services.py do AppClinic): conversa com o
 * servidor WAHA da clínica (tb_clinicas.whatsapp_url / whatsappClient).
 */
const fs = require('fs');
const path = require('path');
const requests = require('./requests');
const { pyQuote } = require('./http');
const { pyStrValor, pyGet, pyBool } = require('./python');
const { erroPython } = require('./orm');

/** json.dumps(payload, ensure_ascii=False) de um dicionário simples */
function dumpsSemAscii(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(dumpsSemAscii).join(', ') + ']';
  return '{' + Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${dumpsSemAscii(x)}`).join(', ') + '}';
}

/** _FakeResponse: resposta montada nos erros (timeout, conexão, número sem WhatsApp) */
class RespostaFalsa {
  constructor(payload, status = 500) {
    this.status_code = status;
    this.ok = status >= 200 && status < 300;
    this.text = dumpsSemAscii(payload);
    this.content = Buffer.from(this.text, 'utf8');
  }
  json() { return JSON.parse(this.text); }
}

const API_KEY = 'eds.2013';
const soDig = (t) => String(t).replace(/\D/g, '');

class WhatsAppService {
  /**
   * user: o usuário (com fk_clinica carregada) ou null; clinica é lida de user.fk_clinica
   * quando host/session não vierem (erro do Python se não houver)
   */
  constructor(user, host = '', session = '', apiKey = API_KEY) {
    const clinica = (attr) => {
      if (!user) throw erroPython("'NoneType' object has no attribute 'fk_clinica'");
      if (!user.fk_clinica) throw erroPython(`'NoneType' object has no attribute '${attr}'`);
      return user.fk_clinica;
    };
    const h = host || clinica('whatsapp_url').whatsapp_url || '';
    this.host = String(h).trim().replace(/\/+$/, '');
    this.session = session || clinica('whatsappClient').whatsappClient;
    this.api_base = this.host ? `${this.host}/api` : '';
    this.headers = { 'x-api-key': apiKey, accept: 'application/json' };
  }

  async check_status() {
    if (!this.api_base) return { success: false, status: 'OFFLINE', message: 'Host nao configurado' };
    try {
      const r = await requests.get(`${this.api_base}/sessions/${pyStrValor(this.session)}`, { headers: this.headers, timeout: 5 });
      if (r.ok) {
        const data = r.json();
        return { success: true, status: pyGet(data, 'status'), host: this.host, session: this.session };
      }
      return { success: false, status: 'ERROR', message: `Erro API: ${r.status_code}` };
    } catch (e) {
      return { success: false, status: 'OFFLINE', message: e.message };
    }
  }

  /** O WhatsApp identifica parte dos contatos por um "LID": traduz para o telefone (só dígitos) ou '' */
  async pn_do_lid(lid) {
    if (!(this.api_base && this.session && lid)) return '';
    const numero = String(lid).split('@')[0];
    for (const chave of [`${numero}@lid`, numero]) {
      try {
        const r = await requests.get(`${this.api_base}/${pyStrValor(this.session)}/lids/${pyQuote(chave, '')}`, { headers: this.headers, timeout: 6 });
        if (r.ok) {
          let pn = pyGet(r.json() || {}, 'pn') || '';
          if (typeof pn !== 'string') throw new Error('split');
          pn = soDig(pn.split('@')[0]);
          if (pn) return pn;
        }
      } catch (e) { continue; }
    }
    return '';
  }

  /** Limpa e gera variações para o 9º dígito */
  static format_id(phone) {
    let num = soDig(pyStrValor(phone || ''));
    if (num.startsWith('00')) num = num.slice(2);
    if (!num.startsWith('55') && num !== '') num = '55' + num;
    const ids = [];
    if (num) {
      ids.push(`${num}@c.us`);
      if (num.length === 13) ids.push(`${num.slice(0, 4)}${num.slice(5)}@c.us`);
      else if (num.length === 12) ids.push(`${num.slice(0, 4)}9${num.slice(4)}@c.us`);
    }
    return ids;
  }

  /** (true, chatId) existe / (false, null) não existe / (null, null) não deu para checar */
  async _check_exists(phoneDigits) {
    if (!this.api_base) return [null, null];
    try {
      const r = await requests.get(`${this.api_base}/contacts/check-exists`, {
        params: { phone: phoneDigits, session: this.session }, headers: this.headers, timeout: 10,
      });
      if (r.ok) {
        const data = r.json();
        if (pyBool(pyGet(data, 'numberExists'))) return [true, pyGet(data, 'chatId') || `${phoneDigits}@c.us`];
        return [false, null];
      }
      return [null, null];
    } catch (e) { return [null, null]; }
  }

  /** [chatId, null] pode enviar / [null, mensagem] número sem WhatsApp */
  async resolver_chat_id(numero) {
    const ids = WhatsAppService.format_id(numero);
    if (!ids.length) return [`${pyStrValor(numero)}@c.us`, null];
    let indisponivel = false;
    for (const cid of ids) {
      const [encontrado, real] = await this._check_exists(cid.replace('@c.us', ''));
      if (encontrado === true && pyBool(real)) return [real, null];
      if (encontrado === null) indisponivel = true;
    }
    if (indisponivel) return [ids[0], null];
    return [null, `O numero ${pyStrValor(numero)} nao possui WhatsApp.`];
  }

  async _post(endpoint, body) {
    if (!this.api_base) return new RespostaFalsa({ error: 'Host do WhatsApp nao configurado' }, 500);
    try {
      return await requests.post(`${this.api_base}/${endpoint.replace(/^\/+/, '')}`, { json: body, headers: this.headers, timeout: 30 });
    } catch (e) {
      if (e instanceof requests.Timeout) return new RespostaFalsa({ error: 'Timeout ao contatar o WAHA.' }, 504);
      if (e instanceof requests.ConnectionError) return new RespostaFalsa({ error: `Falha de conexao com o WAHA: ${e.message}` }, 502);
      return new RespostaFalsa({ error: e.message }, 500);
    }
  }

  async get_photo(phone) {
    const host = `${this.host} ( ${pyStrValor(this.session)} )`;
    for (const cid of WhatsAppService.format_id(phone)) {
      for (const refresh of ['false', 'true']) {
        try {
          const r = await requests.get(`${this.api_base}/contacts/profile-picture`, {
            params: { contactId: cid, session: this.session, refresh }, headers: this.headers, timeout: 10,
          });
          if (!r.ok) continue;
          const ct = String(r.headers.get('content-type', '')).toLowerCase();
          if (ct.includes('application/json')) {
            const data = r.json();
            let url = null;
            for (const k of ['url', 'profilePictureURL', 'profilePicUrl', 'picture', 'imgUrl']) { url = pyGet(data, k); if (pyBool(url)) break; }
            if (pyBool(url)) return { success: true, url, chatId: cid, host };
          } else if (ct.includes('image')) {
            return { success: true, url: `data:${ct};base64,${r.content.toString('base64')}`, chatId: cid, host };
          } else {
            const texto = r.text.trim();
            if (texto.startsWith('http')) return { success: true, url: texto, chatId: cid, host };
          }
        } catch (e) { continue; }
      }
    }
    return { success: false, error: 'Foto nao encontrada', host };
  }

  async enviar_texto(numero, texto) {
    const [chatId, erro] = await this.resolver_chat_id(numero);
    if (erro) return new RespostaFalsa({ error: erro }, 422);
    return this._post('sendText', { chatId, reply_to: null, text: texto, linkPreview: true, session: this.session });
  }

  async enviar_imagem(numero, urlFoto, legenda) {
    const [chatId, erro] = await this.resolver_chat_id(numero);
    if (erro) return new RespostaFalsa({ error: erro }, 422);
    return this._post('sendImage', {
      chatId, file: { mimetype: 'image/jpeg', filename: 'perfil.jpg', url: urlFoto }, reply_to: null, caption: legenda, session: this.session,
    });
  }

  /**
   * Mensagem ao paciente numa mensagem só: a logo da clínica no topo e o texto
   * inteiro como legenda. A imagem vai embutida (base64), sem o WAHA precisar
   * baixá-la daqui. Só se o WAHA responder recusando a imagem o texto sai sozinho;
   * sem resposta (timeout/conexão) não reenvia, para não chegar em dobro.
   * Devolve [resposta, modo].
   */
  async enviar_texto_com_logo(numero, texto, caminhoLogo = null) {
    let dados = null;
    try {
      if (caminhoLogo && fs.existsSync(caminhoLogo) && fs.statSync(caminhoLogo).isFile()) dados = fs.readFileSync(caminhoLogo).toString('base64');
    } catch (e) { dados = null; }
    if (!dados) return [await this.enviar_texto(numero, texto), 'texto'];
    const [chatId, erro] = await this.resolver_chat_id(numero);
    if (erro) return [new RespostaFalsa({ error: erro }, 422), 'texto'];
    const tipo = String(caminhoLogo).toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const t = typeof texto === 'string' ? texto : pyStrValor(texto);
    const r = await this._post('sendImage', {
      chatId, file: { mimetype: tipo, filename: path.basename(caminhoLogo), data: dados }, reply_to: null, caption: t, session: this.session,
    });
    if ([200, 201].includes(r.status_code || 0)) return [r, 'imagem_com_texto'];
    if (r instanceof RespostaFalsa) return [r, 'sem resposta do WAHA'];
    return [await this.enviar_texto(numero, t), 'texto (imagem recusada)'];
  }
}

module.exports = { WhatsAppService, RespostaFalsa };
