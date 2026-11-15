'use strict';
/**
 * Como o Python/Django transformam valores em texto, para o Inno gerar
 * exatamente os mesmos textos e JSON (str(), json.dumps, isoformat...).
 * Os valores vêm com o tipo do campo do modelo (modelos.json), porque em
 * JavaScript 70 e 70.0 são o mesmo número e no Python não.
 */

function pyFloat(n) {
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : n < 0 ? '-inf' : 'nan';
  if (Number.isInteger(n) && Math.abs(n) < 1e16) return n.toFixed(1);
  const s = String(n);
  return s.includes('e') ? s.replace('e+', 'e+').replace(/e(-?)(\d)$/, 'e$10$2') : s;
}

/** str(valor) do Python para um campo do modelo */
function pyStr(campo, v) {
  if (v === null || v === undefined) return 'None';
  const tipo = campo ? campo.tipo : null;
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (tipo === 'FloatField' && typeof v === 'number') return pyFloat(v);
  if (tipo === 'DateTimeField') return String(v).replace('T', ' ');
  return String(v);
}

/** valor JSON-safe do convert_json_safe do log (isoformat / float) */
function pyIso(campo, v) {
  if (v === null || v === undefined) return null;
  const tipo = campo ? campo.tipo : null;
  if (tipo === 'DateTimeField') return String(v).replace(' ', 'T');
  if (tipo === 'DecimalField') return { __float__: Number(v) };
  if (tipo === 'FloatField') return { __float__: Number(v) };
  // datetime em memória num campo de data ou hora (ex.: strptime, now()): isoformat com 'T'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v)) return v.replace(' ', 'T');
  return v;
}

/** json.dumps(valor) do Python (ensure_ascii, separadores ", " e ": ") */
function pyJson(v) {
  if (v === null || v === undefined) return 'null';
  if (v && typeof v === 'object' && '__float__' in v) return pyFloat(v.__float__);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : pyFloat(v);
  if (typeof v === 'string') {
    return '"' + v.replace(/[\\"\u0000-\u001f\u007f-￿]/g, (c) => {
      const m = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' }[c];
      return m || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
    }) + '"';
  }
  if (Array.isArray(v)) return '[' + v.map(pyJson).join(', ') + ']';
  return '{' + Object.entries(v).map(([k, x]) => pyJson(String(k)) + ': ' + pyJson(x)).join(', ') + '}';
}

/** valor "simples" (sem marcador de float) para comparar/serializar fora do log */
function semMarcas(v) {
  if (v && typeof v === 'object' && '__float__' in v) return v.__float__;
  if (Array.isArray(v)) return v.map(semMarcas);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = semMarcas(x); return o; }
  return v;
}

/** str() de um valor já JSON-safe (para a comparação antes/depois do log) */
function pyStrJson(v) {
  if (v === null || v === undefined) return 'None';
  if (v && typeof v === 'object' && '__float__' in v) return pyFloat(v.__float__);
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return String(v);
}

/** calcular_idade / calcula_idade do AppClinic */
function idade(nasc, hoje = new Date()) {
  const [a, m, d] = String(nasc).slice(0, 10).split('-').map(Number);
  const ha = hoje.getFullYear(), hm = hoje.getMonth() + 1, hd = hoje.getDate();
  let am = m, ad = d;
  if (m === 2 && d === 29 && !((ha % 4 === 0 && ha % 100 !== 0) || ha % 400 === 0)) { am = 3; ad = 1; }
  const depois = am > hm || (am === hm && ad > hd);
  return depois ? ha - a - 1 : ha - a;
}

/** strftime('%d/%m/%Y') de 'AAAA-MM-DD' */
function dmy(data) {
  if (!data) return '';
  const [a, m, d] = String(data).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function anoDe(data) { return data ? parseInt(String(data).slice(0, 4), 10) : null; }

module.exports = { pyFloat, pyStr, pyIso, pyJson, pyStrJson, semMarcas, idade, dmy, anoDe };

/** Como o DjangoJSONEncoder escreve datas/horas no JSON (milissegundos, 'T') */
function djJson(campo, v) {
  if (v === null || v === undefined) return v === undefined ? null : v;
  const tipo = campo ? campo.tipo : null;
  const ms = (s) => s.replace(/\.(\d{3})\d*$/, '.$1');
  if (tipo === 'DateTimeField') return ms(String(v).replace(' ', 'T'));
  if (tipo === 'TimeField') return ms(String(v));
  return v;
}

/** KeyError do Python: parâmetro obrigatório da requisição */
function exige(qd, chave) {
  if (!qd.has(chave)) { const e = new Error(`MultiValueDictKeyError: '${chave}'`); e.python = true; e.args = [chave]; throw e; }
  return qd.get(chave);
}

/** like/icontains do Django: escapa % e _ do texto digitado */
function escapaLike(s) { return String(s).replace(/[\\%_]/g, (c) => '\\' + c); }

module.exports.djJson = djJson;
module.exports.exige = exige;
module.exports.escapaLike = escapaLike;

/** repr() de texto do Python 3 */
function pyReprTexto(s) {
  const temSimples = s.includes("'"), temDupla = s.includes('"');
  const aspa = temSimples && !temDupla ? '"' : "'";
  let r = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === '\\') r += '\\\\';
    else if (ch === aspa) r += '\\' + aspa;
    else if (ch === '\n') r += '\\n';
    else if (ch === '\r') r += '\\r';
    else if (ch === '\t') r += '\\t';
    else if (cp < 0x20 || (cp >= 0x7f && cp <= 0xa0) || cp === 0xad) r += '\\x' + cp.toString(16).padStart(2, '0');
    else if ([0x2028, 0x2029, 0x200b, 0x200e, 0x200f, 0xfeff].includes(cp) || (cp >= 0x2000 && cp <= 0x200a) || cp === 0x3000) {
      r += '\\u' + cp.toString(16).padStart(4, '0');
    } else r += ch;
  }
  return aspa + r + aspa;
}

/** repr() do valor de um campo, como sai de values_list() no Django */
function pyRepr(campo, v) {
  if (v === null || v === undefined) return 'None';
  const tipo = campo ? campo.tipo : null;
  const n = (x) => String(parseInt(x, 10));
  const hora = (t) => {
    const m = String(t).match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?/);
    const us = m[4] ? parseInt(m[4].padEnd(6, '0'), 10) : 0;
    const s = m[3] ? parseInt(m[3], 10) : 0;
    const partes = [n(m[1]), n(m[2])];
    if (us) partes.push(String(s), String(us)); else if (s) partes.push(String(s));
    return partes;
  };
  switch (tipo) {
    case 'DateField': { const [a, m, d] = String(v).slice(0, 10).split('-'); return `datetime.date(${n(a)}, ${n(m)}, ${n(d)})`; }
    case 'TimeField': return `datetime.time(${hora(v).join(', ')})`;
    case 'DateTimeField': {
      const [d, t] = String(v).replace('T', ' ').split(' ');
      const [a, m, dia] = d.split('-');
      return `datetime.datetime(${[n(a), n(m), n(dia), ...hora(t || '00:00')].join(', ')})`;
    }
    case 'FloatField': return pyFloat(Number(v));
    case 'DecimalField': return `Decimal('${Number(v).toFixed(campo.casas || 0)}')`;
    case 'BooleanField': case 'NullBooleanField': return v ? 'True' : 'False';
    default:
      if (typeof v === 'number') return String(v);
      if (typeof v === 'boolean') return v ? 'True' : 'False';
      return pyReprTexto(String(v));
  }
}

module.exports.pyReprTexto = pyReprTexto;
module.exports.pyRepr = pyRepr;

/** str.splitlines() do Python */
function splitlines(s) {
  if (s === null || s === undefined) return [];
  const partes = String(s).split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
  if (partes.length && partes[partes.length - 1] === '') partes.pop();
  return partes;
}

/** len() de texto (conta caracteres, não unidades UTF-16) */
function pyLen(s) { return [...String(s)].length; }

/** funcoes.idade do AppClinic: '...' sem data */
function idadeF(nasc, hoje = new Date()) {
  if (!nasc) return '...';
  const [a, m, d] = String(nasc).slice(0, 10).split('-').map(Number);
  let y = hoje.getFullYear() - a;
  const hm = hoje.getMonth() + 1, hd = hoje.getDate();
  if (hm < m || (hm === m && hd < d)) y -= 1;
  return y;
}

/** repr() de um valor JS simples (dict/list/str/int/None/bool) */
function pyReprValor(v) {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : pyFloat(v);
  if (typeof v === 'string') return pyReprTexto(v);
  if (Array.isArray(v)) return '[' + v.map(pyReprValor).join(', ') + ']';
  return '{' + Object.entries(v).map(([k, x]) => `${pyReprTexto(k)}: ${pyReprValor(x)}`).join(', ') + '}';
}

module.exports.splitlines = splitlines;
module.exports.pyLen = pyLen;
module.exports.idadeF = idadeF;
module.exports.pyReprValor = pyReprValor;

// ------------------------------------------- valores vindos do json.loads
/** json.loads do Python, guardando quais números eram float (1.0 continua 1.0) */
function pyJsonLoads(texto) {
  return JSON.parse(texto, (k, v, ctx) => (typeof v === 'number' && ctx && /[.eE]/.test(ctx.source) ? { __float__: v } : v));
}

const ehFloat = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && '__float__' in v;
const ehDict = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !ehFloat(v);

/** repr() do Python para o que sai do json.loads */
function pyReprJson(v) {
  if (v === null || v === undefined) return 'None';
  if (ehFloat(v)) return pyFloat(v.__float__);
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : pyFloat(v);
  if (typeof v === 'string') return pyReprTexto(v);
  if (Array.isArray(v)) return '[' + v.map(pyReprJson).join(', ') + ']';
  return '{' + Object.entries(v).map(([k, x]) => `${pyReprTexto(k)}: ${pyReprJson(x)}`).join(', ') + '}';
}

/** str() do Python para o que sai do json.loads */
function pyStrValor(v) { return typeof v === 'string' ? v : pyReprJson(v); }

/** bool() do Python */
function pyBool(v) {
  if (v === null || v === undefined || v === false || v === '' || v === 0) return false;
  if (ehFloat(v)) return v.__float__ !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/** nome do tipo no Python (para as mensagens de erro) */
function pyTipo(v) {
  if (v === null || v === undefined) return 'NoneType';
  if (ehFloat(v)) return 'float';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return 'int';
  if (typeof v === 'string') return 'str';
  return Array.isArray(v) ? 'list' : 'dict';
}

/** dict.get(k, padrao), com o AttributeError de quem não é dict */
function pyGet(v, k, padrao = null) {
  if (!ehDict(v)) { const e = new Error(`'${pyTipo(v)}' object has no attribute 'get'`); e.python = true; throw e; }
  return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : padrao;
}

module.exports.pyJsonLoads = pyJsonLoads;
module.exports.pyReprJson = pyReprJson;
module.exports.pyStrValor = pyStrValor;
module.exports.pyBool = pyBool;
module.exports.pyTipo = pyTipo;
module.exports.pyGet = pyGet;
module.exports.ehDict = ehDict;
