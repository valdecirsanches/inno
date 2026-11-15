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
  if (!qd.has(chave)) { const e = new Error(`MultiValueDictKeyError: '${chave}'`); e.python = true; throw e; }
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
