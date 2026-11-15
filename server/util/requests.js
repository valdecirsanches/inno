'use strict';
/**
 * O papel da biblioteca requests do Python nas integrações (Memed, WhatsApp):
 *   const r = await requests.get(url, { params, headers, timeout })
 *   r.status_code, r.ok (status < 400), r.text, r.content (Buffer), r.headers.get(), r.json()
 * Erros de rede viram exceções com a mesma hierarquia:
 *   RequestException > ConnectionError / Timeout / InvalidURL
 * As mensagens imitam as do requests/urllib3 (não são idênticas byte a byte).
 */
const { pyJson, pyJsonLoads } = require('./python');

class RequestException extends Error {}
class ConnectionError extends RequestException {}
class Timeout extends RequestException {}
class InvalidURL extends RequestException {}

class Resposta {
  constructor(status, headers, conteudo) {
    this.status_code = status;
    this.ok = status < 400;
    this.headers = { get: (k, padrao = null) => (headers.has(k) ? headers.get(k) : padrao) };
    this.content = conteudo;
    this.text = conteudo.toString('utf8');
  }
  /** response.json(): ValueError (JSONDecodeError) se não for JSON */
  json() {
    try { return pyJsonLoads(this.text); } catch (e) {
      const err = new Error('Expecting value: line 1 column 1 (char 0)');
      err.python = true; err.valueError = true;
      throw err;
    }
  }
}

function hostPorta(u) {
  return `host='${u.hostname}', port=${u.port || (u.protocol === 'https:' ? 443 : 80)}`;
}

/**
 * requests.request(metodo, url, params=..., headers=..., json=..., data=..., timeout=...)
 * json: objeto (serializado como o json.dumps do requests); data: texto já pronto.
 */
async function request(metodo, url, { params = null, headers = {}, json = undefined, data = null, files = null, timeout = null } = {}) {
  let u;
  try {
    u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error('esquema');
  } catch (e) {
    throw new InvalidURL(`Invalid URL '${url}': No scheme supplied. Perhaps you meant https://${url}?`);
  }
  for (const [k, v] of Object.entries(params || {})) {
    if (v === null || v === undefined) continue;   // o requests omite parâmetros None
    // valor iterável (lista, dict, QueryDict): um parâmetro por item, como o requests
    const itens = Array.isArray(v) ? v : (v && typeof v === 'object' ? (typeof v.keys === 'function' && !(v instanceof Map) ? v.keys() : Object.keys(v)) : [v]);
    for (const x of itens) u.searchParams.append(k, typeof x === 'boolean' ? (x ? 'True' : 'False') : String(x));
  }
  const opc = { method: metodo, headers: Object.assign({}, headers), redirect: 'follow' };
  const temTipo = () => Object.keys(opc.headers).some((h) => h.toLowerCase() === 'content-type');
  if (json !== undefined) {
    opc.body = pyJson(json);
    if (!temTipo()) opc.headers['Content-Type'] = 'application/json';
  } else if (files) {
    // files={'campo': (nome, conteúdo)}: multipart/form-data
    const fd = new FormData();
    for (const [campo, arq] of Object.entries(files)) fd.append(campo, new Blob([arq.dados]), arq.nome);
    opc.body = fd;
  } else if (data !== null) {
    opc.body = data;
  }
  if (timeout) opc.signal = AbortSignal.timeout(timeout * 1000);
  try {
    const r = await fetch(u, opc);
    const buf = Buffer.from(await r.arrayBuffer());
    return new Resposta(r.status, r.headers, buf);
  } catch (e) {
    const pool = `${u.protocol === 'https:' ? 'HTTPS' : 'HTTP'}ConnectionPool(${hostPorta(u)})`;
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new Timeout(`${pool}: Read timed out. (read timeout=${timeout})`);
    }
    const causa = (e && e.cause && (e.cause.code || e.cause.message)) || (e && e.message) || 'erro';
    throw new ConnectionError(`${pool}: Max retries exceeded with url: ${u.pathname}${u.search} (Caused by NewConnectionError('<urllib3.connection.HTTPConnection object>: Failed to establish a new connection: ${causa}'))`);
  }
}

const get = (url, opc) => request('GET', url, opc);
const post = (url, opc) => request('POST', url, opc);
const patch = (url, opc) => request('PATCH', url, opc);

module.exports = { request, get, post, patch, Resposta, RequestException, ConnectionError, Timeout, InvalidURL };
