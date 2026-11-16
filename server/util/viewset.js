'use strict';
/**
 * ModelViewSet do Django REST Framework (3.15), para as rotas /api/ do AppClinic:
 * list / retrieve / create / update / partial_update / destroy e as @action,
 * com ModelSerializer (fields='__all__' ou lista), validação com as mesmas
 * mensagens em pt-BR, DjangoFilterBackend (filterset_fields), SearchFilter,
 * OrderingFilter e LimitOffsetPagination.
 */
const db = require('../db');
const modelo = require('./modelo');
const drf = require('./drf');
const { pyFloat } = require('./python');

const MSG = {
  required: 'Este campo é obrigatório.',
  null: 'Este campo não pode ser nulo.',
  blank: 'Este campo não pode ser em branco.',
  max_length: (n) => `Certifique-se de que este campo não tenha mais de ${n} caracteres.`,
  string: 'Not a valid string.',
  int: 'Um número inteiro válido é exigido.',
  num: 'Um número válido é necessário.',
  data: 'Formato inválido para data. Use um dos formatos a seguir: YYYY-MM-DD.',
  dataHora: 'Formato inválido para data e hora. Use um dos formatos a seguir: YYYY-MM-DDThh:mm[:ss[.uuuuuu]][+HH:MM|-HH:MM|Z].',
  hora: 'Formato inválido para Tempo. Use um dos formatos a seguir: hh:mm[:ss[.uuuuuu]].',
  bool: 'Must be a valid boolean.',
  escolha: (v) => `"${v}" não é um escolha válido.`,
  pkNaoExiste: (v) => `Pk inválido "${v}" - objeto não existe.`,
  pkTipo: (t) => `Tipo incorreto. Esperado valor pk, recebeu ${t}.`,
  email: 'Insira um endereço de email válido.',
  max_digits: (n) => `Certifique-se de que não haja mais de ${n} dígitos no total.`,
  max_decimal_places: (n) => `Certifique-se de que não haja mais de ${n} casas decimais.`,
  max_whole_digits: (n) => `Certifique-se de que não haja mais de ${n} dígitos antes do ponto decimal.`,
  naoEncontrado: 'Não encontrado.',
  metodo: (m) => `Método "${m}" não é permitido.`,
  malformado: 'Pedido malformado.',
  dict: (t) => `Dado inválido. Necessário um dicionário mas recebeu ${t}.`,
};

class Erro400 extends Error { constructor(erros) { super('validação'); this.erros = erros; } }
const VAZIO = Symbol('vazio');
const TRUE = new Set(['t', 'T', 'y', 'Y', 'yes', 'Yes', 'YES', 'true', 'True', 'TRUE', 'on', 'On', 'ON', '1', 1, true]);
const FALSE = new Set(['f', 'F', 'n', 'N', 'no', 'No', 'NO', 'false', 'False', 'FALSE', 'off', 'Off', 'OFF', '0', 0, 0.0, false]);
const NULOS = new Set(['null', 'Null', 'NULL', '', null]);
const TEXTO = ['CharField', 'TextField', 'EmailField', 'SlugField', 'URLField', 'GenericIPAddressField', 'FilePathField'];
const tipoPy = (v) => (v === null ? 'NoneType' : Array.isArray(v) ? 'list' : typeof v === 'object' ? 'dict'
  : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v === 'boolean' ? 'bool' : 'str');

// --------------------------------------------------------------- leitura
/** valor de um campo do modelo no ModelSerializer */
function representa(req, c, v) {
  if (c.tipo === 'ForeignKey' || c.tipo === 'OneToOneField') return v === null || v === undefined ? null : v;
  if (c.tipo === 'FileField' || c.tipo === 'ImageField') {
    if (!v) return null;
    const url = '/media/' + String(v).split('/').map(encodeURIComponent).join('/');
    return req ? `http://${req.get('host')}${url}` : url;
  }
  if (c.tipo === 'TimeField' && v) return String(v);
  return drf.representa(c, v);
}

/** nomes dos campos do serializer, na ordem do DRF */
function nomesDosCampos(m, opc) {
  const declarados = (opc.declarados || []).map(([n]) => n);
  let nomes;
  if (opc.campos) nomes = opc.campos.slice();
  else {
    const pk = m.campos.find((c) => c.pk);
    const simples = m.campos.filter((c) => !c.pk && !['ForeignKey', 'OneToOneField'].includes(c.tipo)).map((c) => c.nome);
    const rel = m.campos.filter((c) => ['ForeignKey', 'OneToOneField'].includes(c.tipo)).map((c) => c.nome);
    nomes = [];
    for (const n of [pk.nome, ...declarados, ...simples, ...rel]) if (!nomes.includes(n)) nomes.push(n);
  }
  if (opc.exclui) nomes = nomes.filter((n) => !opc.exclui.includes(n));
  return nomes;
}

function criaSerializer(nomeModelo, opc = {}) {
  const m = db.modelo(nomeModelo);
  const porNome = {};
  for (const c of m.campos) porNome[c.nome] = c;
  const declarados = new Map(opc.declarados || []);
  const nomes = nomesDosCampos(m, opc);
  const serializa = async (req, obj) => {
    const o = {};
    for (const n of nomes) {
      if (declarados.has(n)) { const v = await declarados.get(n)(obj, req); if (v !== VAZIO) o[n] = v; continue; }
      const c = porNome[n];
      if (!c) continue;   // ReadOnlyField de atributo que o modelo não tem: o DRF pula
      o[n] = representa(req, c, obj[c.atributo]);
    }
    if (opc.extras) Object.assign(o, await opc.extras(obj, req));   // ManyToMany (vêm depois das FKs)
    return o;
  };
  return { modelo: nomeModelo, nomes, porNome, declarados, serializa, opc };
}

// --------------------------------------------------------------- escrita
const reData = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const reDataHora = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d{1,6})\d{0,6})?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/;
const reHora = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d{1,6})\d{0,6})?)?/;
const p2 = (n) => String(n).padStart(2, '0');
const dataValida = (a, mm, d) => { const x = new Date(Date.UTC(a, mm - 1, d)); return a >= 1 && x.getUTCFullYear() === a && x.getUTCMonth() === mm - 1 && x.getUTCDate() === d; };

function leData(v) {
  const m = String(v).match(reData);
  if (!m || !dataValida(+m[1], +m[2], +m[3])) return undefined;
  return `${m[1]}-${p2(+m[2])}-${p2(+m[3])}`;
}
function leHora(v) {
  const m = String(v).match(reHora);
  if (!m) return undefined;
  const H = +m[1], i = +m[2], s = +(m[3] || 0);
  if (H > 23 || i > 59 || s > 59) return undefined;
  const us = m[4] ? m[4].padEnd(6, '0') : '';
  return `${p2(H)}:${p2(i)}:${p2(s)}${us && +us ? '.' + us : ''}`;
}
function leDataHora(v) {
  const m = String(v).match(reDataHora);
  if (!m || !dataValida(+m[1], +m[2], +m[3])) return undefined;
  const H = +m[4], i = +m[5], s = +(m[6] || 0);
  if (H > 23 || i > 59 || s > 59) return undefined;
  let d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], H, i, s));
  if (m[8]) {   // com fuso: o DRF converte para UTC sem fuso (USE_TZ = False)
    if (m[8] !== 'Z') {
      const sinal = m[8][0] === '-' ? -1 : 1;
      const [hh, mm] = [m[8].slice(1, 3), m[8].replace(':', '').slice(3, 5) || '0'];
      d = new Date(d.getTime() - sinal * (Number(hh) * 60 + Number(mm)) * 60000);
    }
  }
  const us = m[7] ? m[7].padEnd(6, '0') : '';
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}${us && +us ? '.' + us : ''}`;
}

/** dados da requisição: objeto JSON ou QueryDict (formulário) */
function ehHtml(dados) { return dados && typeof dados.getlist === 'function'; }

function obtemValor(dados, c, campoDrf, parcial) {
  if (ehHtml(dados)) {
    if (!dados.has(c.nome)) {
      if (parcial) return VAZIO;
      return campoDrf.tipo === 'BooleanField' ? false : VAZIO;
    }
    const v = dados.get(c.nome);
    if (v === '' && campoDrf.allowNull) return campoDrf.allowBlank ? '' : null;
    if (v === '' && !campoDrf.required) return campoDrf.allowBlank ? '' : VAZIO;
    return v;
  }
  if (!dados || !Object.prototype.hasOwnProperty.call(dados, c.nome)) return VAZIO;
  return dados[c.nome];
}

function campoDrf(c) {
  const fk = ['ForeignKey', 'OneToOneField'].includes(c.tipo);
  const temPadrao = c.padrao !== undefined;
  return {
    tipo: c.tipo,
    required: !(temPadrao || c.branco || c.nulo) && c.tipo !== 'BooleanField' ? true : (c.tipo === 'BooleanField' ? false : false),
    allowNull: !!c.nulo,
    allowBlank: TEXTO.includes(c.tipo) && !!c.branco,
    fk,
  };
}

async function converteValor(c, d, v) {
  if (c.opcoes && !['BooleanField'].includes(c.tipo)) {
    if (v === '' && d.allowBlank) return '';
    const mapa = new Map(c.opcoes.map((o) => [String(o), o]));
    const k = String(typeof v === 'boolean' ? (v ? 'True' : 'False') : v);
    if (!mapa.has(k)) throw MSG.escolha(k);
    return mapa.get(k);
  }
  if (d.fk) {
    if (typeof v === 'boolean') throw MSG.pkTipo('bool');
    if (v !== null && typeof v === 'object') throw MSG.pkTipo(tipoPy(v));
    const s = String(v).trim();
    if (!/^[-+]?\d+$/.test(s) && !(typeof v === 'number' && Number.isInteger(v))) throw MSG.pkTipo(tipoPy(v));
    const id = parseInt(s, 10);
    const existe = await db.tabela(c.ref).where(db.coluna(c.ref, db.modelo(c.ref).pk), id).first();
    if (!existe) throw MSG.pkNaoExiste(typeof v === 'string' ? v : String(v));
    return id;
  }
  switch (c.tipo) {
    case 'CharField': case 'TextField': case 'EmailField': case 'SlugField': case 'URLField': case 'GenericIPAddressField': {
      if (typeof v === 'boolean' || (v !== null && typeof v === 'object')) throw MSG.string;
      const s = (typeof v === 'number' ? pyFloat(v).replace(/\.0$/, Number.isInteger(v) ? '' : '.0') : String(v)).trim();
      if (s === '') { if (!d.allowBlank) throw MSG.blank; return ''; }
      if (c.max && [...s].length > c.max) throw MSG.max_length(c.max);
      if (c.tipo === 'EmailField' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) throw MSG.email;
      return s;
    }
    case 'IntegerField': case 'PositiveIntegerField': case 'SmallIntegerField': case 'BigIntegerField': case 'PositiveSmallIntegerField': {
      if (typeof v === 'boolean') return v ? 1 : 0;
      const s = String(v).replace(/\.0*\s*$/, '').trim();
      if (!/^[-+]?\d+$/.test(s)) throw MSG.int;
      return parseInt(s, 10);
    }
    case 'FloatField': {
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      if (String(v).trim() === '' || Number.isNaN(n)) throw MSG.num;
      return n;
    }
    case 'DecimalField': {
      const s = String(v).trim();
      if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) throw MSG.num;
      return Number(s).toFixed(c.casas || 0);
    }
    case 'BooleanField': case 'NullBooleanField':
      if (TRUE.has(v)) return true;
      if (FALSE.has(v)) return false;
      if (d.allowNull && NULOS.has(v)) return null;
      throw MSG.bool;
    case 'DateField': { const r = typeof v === 'string' ? leData(v) : undefined; if (r === undefined) throw MSG.data; return r; }
    case 'DateTimeField': { const r = typeof v === 'string' ? leDataHora(v) : undefined; if (r === undefined) throw MSG.dataHora; return r; }
    case 'TimeField': { const r = typeof v === 'string' ? leHora(v) : undefined; if (r === undefined) throw MSG.hora; return r; }
    case 'JSONField': return v;
    default: return v;
  }
}

/** serializer.is_valid(): {valores} ou lança Erro400 {campo: [msg]} */
async function valida(ser, dados, { instancia = null, parcial = false } = {}) {
  if (!ehHtml(dados) && (dados === null || typeof dados !== 'object' || Array.isArray(dados))) {
    throw new Erro400({ non_field_errors: [MSG.dict(tipoPy(dados))] });
  }
  const m = db.modelo(ser.modelo);
  const so = new Set(ser.opc.somenteLeitura || []);
  const erros = {};
  const valores = {};
  const gravaveis = ser.opc.gravaveis || {};
  for (const n of ser.nomes) {
    if (gravaveis[n] && !so.has(n)) {
      // campo declarado que aceita escrita (ex.: SerializerRelatedField)
      const c = ser.porNome[n];
      const v = ehHtml(dados) ? (dados.has(n) ? dados.get(n) : VAZIO) : (dados && Object.prototype.hasOwnProperty.call(dados, n) ? dados[n] : VAZIO);
      if (v === VAZIO) continue;
      if (ehHtml(dados) && v === '') continue;   // formulário: vazio e não obrigatório = não enviado
      if (v === null) { if (gravaveis[n].aceitaNulo) valores[gravaveis[n].aceitaNulo] = null; else erros[n] = [MSG.null]; continue; }
      try { Object.assign(valores, await gravaveis[n](v, c)); } catch (e) { if (typeof e === 'string') erros[n] = [e]; else throw e; }
      continue;
    }
    if (ser.declarados.has(n) || so.has(n)) continue;
    const c = ser.porNome[n];
    // pk AutoField é só leitura; pk IntegerField comum (ex.: TbWhatsApp) o DRF exige e confere se é única
    if (!c || (c.pk && ['AutoField', 'BigAutoField'].includes(c.tipo)) || !c.editavel || c.auto_now || c.auto_now_add) continue;
    if (c.tipo === 'FileField' || c.tipo === 'ImageField') continue;   // uploads: tratados pelas rotas que usam
    const d = campoDrf(c);
    let v = obtemValor(dados, c, d, parcial);
    if (v === VAZIO) {
      if (parcial) continue;
      if (d.required) { erros[n] = [MSG.required]; continue; }
      continue;   // sem padrão no serializer: fica o do modelo
    }
    if (v === null || v === undefined) {
      if (!d.allowNull) {
        // CharField com allow_blank troca None por '' (DRF 3.15 não troca: erro)
        erros[n] = [MSG.null]; continue;
      }
      valores[c.atributo] = null; continue;
    }
    try { valores[c.atributo] = await converteValor(c, d, v); } catch (e) {
      if (typeof e === 'string') erros[n] = [e]; else throw e;
    }
    if (!(n in erros) && (c.unico || c.pk) && valores[c.atributo] !== null) {
      const q = db.tabela(ser.modelo).where(db.coluna(ser.modelo, c.atributo), valores[c.atributo]);
      if (instancia) q.whereNot(db.coluna(ser.modelo, m.pk), instancia[m.pk]);
      if (await q.first()) erros[n] = [`${capitaliza(m.verbose || ser.modelo)} com este ${c.verbose || n} já existe.`];
    }
  }
  if (Object.keys(erros).length) throw new Erro400(erros);
  return valores;
}
const capitaliza = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ------------------------------------------------------------ o viewset
/**
 * registra(app, '/api/xxx', {
 *   modelo, serializer: criaSerializer(...) ou opções,
 *   consulta(req, detalhe) -> knex (get_queryset), filtros: {campo: ['exact','in',...]},
 *   busca: [...], ordenacao: {campos: [...]|'__all__'}, paginar: true,
 *   metodos: ['list','retrieve','create','update','partial_update','destroy'],
 *   permissao(req) -> bool, aoCriar(req, obj), aoAtualizar(req, obj), aoExcluir(req, obj),
 *   acoes: [{nome, url, detalhe, metodos: ['post'], fn: async (req, res, obj)}]
 * })
 */
function registra(app, base, opc) {
  const nomeModelo = opc.modelo;
  const m = db.modelo(nomeModelo);
  const ser = opc.serializer && opc.serializer.serializa ? opc.serializer : criaSerializer(nomeModelo, opc.serializer || {});
  const metodos = new Set(opc.metodos || ['list', 'retrieve', 'create', 'update', 'partial_update', 'destroy']);
  const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
    if (e instanceof Erro400) return drf.responde(res, e.erros, 400);
    next(e);
  });
  const t = m.tabela;
  // get_queryset: um builder do knex, ou uma Promise de {q} (um builder não pode ser
  // devolvido por função async: o await executaria a consulta)
  const consulta = async (req, detalhe) => {
    const r = opc.consulta ? opc.consulta(req, detalhe) : db.tabela(nomeModelo);
    if (r instanceof Promise) return await r;
    return { q: r };
  };
  const permitido = (req, res) => {
    if (opc.permissao && !opc.permissao(req)) { drf.responde(res, { detail: 'Você não tem permissão para executar essa ação.' }, 403); return false; }
    return true;
  };
  const pkCampo = m._porAtributo[m.pk];
  const pkInteira = ['AutoField', 'BigAutoField', 'IntegerField'].includes(pkCampo.tipo);
  const objeto = async (req, res) => {
    // get_object_or_404 do DRF: pk que não vira número (ValueError) é só "Não encontrado."
    if (pkInteira && !/^\s*[-+]?\d+\s*$/.test(req.params.pk)) { drf.naoEncontrado(res, null); return null; }
    const q = aplicaFiltros(req, (await consulta(req, true)).q);
    if (!q._statements.some((x) => x.grouping === 'columns')) q.select(`${t}.*`);
    const l = await q.clone().where(`${t}.${db.coluna(nomeModelo, m.pk)}`, req.params.pk).first();
    if (!l) { drf.naoEncontrado(res, opc.nome404 || nomeModelo); return null; }
    return db.linha(nomeModelo, l);
  };
  const aplicaFiltros = (req, q) => {
    for (const [campo, lookups] of Object.entries(opc.filtros || {})) {
      const c = m._porAtributo[campo] || m.campos.find((x) => x.nome === campo);
      const colSql = `${t}.${c.coluna}`;
      for (const lk of lookups) {
        const chave = lk === 'exact' ? campo : `${campo}__${lk}`;
        const v = req.GET.get(chave);
        if (v === null || v === undefined || v === '') continue;
        if (lk === 'exact') q.where(colSql, v);
        else if (lk === 'in') q.whereIn(colSql, String(v).split(','));
        else if (lk === 'icontains') db.like(q, colSql, `%${String(v).replace(/[\\%_]/g, (x) => '\\' + x)}%`);
        else if (lk === 'gte') q.where(colSql, '>=', v);
        else if (lk === 'lte') q.where(colSql, '<=', v);
        else if (lk === 'isnull') { if (['true', 'True', '1'].includes(v)) q.whereNull(colSql); else q.whereNotNull(colSql); }
      }
    }
    if (opc.busca && req.GET.get('search')) drf.aplicaBusca(q, nomeModelo, opc.busca, req.GET.get('search'));
    if (opc.ordenacao) {
      const ord = req.GET.get('ordering');
      const validos = opc.ordenacao.campos === '__all__' ? m.campos.map((c) => c.nome) : opc.ordenacao.campos;
      const termos = ord ? String(ord).split(',').map((x) => x.trim()).filter((x) => validos.includes(x.replace(/^-/, ''))) : [];
      const usar = termos.length ? termos : (opc.ordenacao.padrao || []);
      if (usar.length) { q.clearOrder(); for (const o of usar) q.orderBy(`${t}.${m.campos.find((c) => c.nome === o.replace(/^-/, '')).coluna}`, o.startsWith('-') ? 'desc' : 'asc'); }
    }
    return q;
  };
  const serializa = (req) => async (l) => ser.serializa(req, db.linha(nomeModelo, l));

  // lista e criação
  app.all(`${base}/`, a(async (req, res, next) => {
    const mt = req.method.toLowerCase();
    if (mt === 'get' && metodos.has('list')) {
      if (!permitido(req, res)) return;
      const q = aplicaFiltros(req, (await consulta(req, false)).q);
      if (!q._statements.some((x) => x.grouping === 'columns')) q.select(`${t}.*`);
      if (opc.paginar === false) {
        const linhas = await q;
        const out = [];
        for (const l of linhas) out.push(await serializa(req)(l));
        return drf.responde(res, out);
      }
      return drf.listaPaginada(req, res, q, serializa(req));
    }
    if (mt === 'post' && metodos.has('create')) {
      if (!permitido(req, res)) return;
      const valores = await valida(ser, req.data);
      const obj = Object.assign({}, valores);
      if (opc.antesDeCriar) await opc.antesDeCriar(req, obj);
      await modelo.salva(req, nomeModelo, obj);
      if (opc.aoCriar) await opc.aoCriar(req, obj);
      return drf.responde(res, await ser.serializa(req, obj), 201);
    }
    if (mt === 'options' || mt === 'head') return next();
    return drf.responde(res, { detail: MSG.metodo(req.method) }, 405);
  }));

  // ações de lista (detail=False) antes da rota de detalhe
  for (const ac of (opc.acoes || []).filter((x) => !x.detalhe)) {
    app.all(`${base}/${ac.url || ac.nome}/`, a(async (req, res) => {
      if (!ac.metodos.includes(req.method.toLowerCase())) return drf.responde(res, { detail: MSG.metodo(req.method) }, 405);
      if (!permitido(req, res)) return;
      await ac.fn(req, res);
    }));
  }

  app.all(`${base}/:pk/`, a(async (req, res, next) => {
    const mt = req.method.toLowerCase();
    const acao = { get: 'retrieve', put: 'update', patch: 'partial_update', delete: 'destroy' }[mt];
    if (!acao || !metodos.has(acao)) {
      if (mt === 'options' || mt === 'head') return next();
      return drf.responde(res, { detail: MSG.metodo(req.method) }, 405);
    }
    if (!permitido(req, res)) return;
    const obj = await objeto(req, res);
    if (!obj) return;
    if (acao === 'retrieve') return drf.responde(res, await ser.serializa(req, obj));
    if (acao === 'destroy') {
      if (opc.aoExcluir) await opc.aoExcluir(req, obj); else await modelo.exclui(req, nomeModelo, obj);
      return res.status(204).end();
    }
    const valores = await valida(ser, req.data, { instancia: obj, parcial: acao === 'partial_update' });
    Object.assign(obj, valores);
    if (opc.antesDeAtualizar) await opc.antesDeAtualizar(req, obj);
    await modelo.salva(req, nomeModelo, obj);
    return drf.responde(res, await ser.serializa(req, obj));
  }));

  for (const ac of (opc.acoes || []).filter((x) => x.detalhe)) {
    app.all(`${base}/:pk/${ac.url || ac.nome}/`, a(async (req, res) => {
      if (!ac.metodos.includes(req.method.toLowerCase())) return drf.responde(res, { detail: MSG.metodo(req.method) }, 405);
      if (!permitido(req, res)) return;
      if (ac.semObjeto) return ac.fn(req, res, null);   // a ação dá erro antes do get_object
      const obj = await objeto(req, res);
      if (!obj) return;
      await ac.fn(req, res, obj);
    }));
  }
  return { ser, objeto, aplicaFiltros };
}

module.exports = { registra, criaSerializer, valida, Erro400, VAZIO, MSG, representa };
