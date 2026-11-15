'use strict';
/**
 * O papel do ModelForm e do Model.save() do Django, para o Inno gravar os
 * dados exatamente como o AppClinic gravava:
 *
 *  - campos do formulário: os editáveis do modelo, menos os excluídos;
 *  - limpeza por tipo (texto sem espaços nas pontas, inteiro, decimal, datas
 *    nos formatos brasileiros, booleano, chave estrangeira existente...);
 *  - obrigatórios (blank=False), tamanho máximo, opções e campos únicos;
 *  - campos que não vieram no envio: ficam vazios, exceto os que têm valor
 *    padrão no modelo (regra do construct_instance do Django);
 *  - auto_now / auto_now_add;
 *  - log de auditoria em tb_usuarios_log (logs/signals.py do AppClinic).
 */
const db = require('../db');
const { pyIso, pyJson, pyStr, pyStrJson } = require('./python');

const VAZIOS = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const IGNORAR_NO_LOG = new Set(['UserLog', 'TbOpcoes']);
const TEXTO = ['CharField', 'TextField', 'EmailField', 'SlugField', 'URLField', 'GenericIPAddressField'];

const MSG = {
  obrigatorio: 'Este campo é obrigatório.',
  inteiro: 'Informe um número inteiro.',
  numero: 'Informe um número.',
  data: 'Informe uma data válida.',
  hora: 'Informe uma hora válida.',
  dataHora: 'Informe uma data/hora válida.',
  escolha: 'Faça uma escolha válida. Esta opção não é uma das disponíveis.',
  escolhaValor: (v) => `Faça uma escolha válida. ${v} não é uma das escolhas disponíveis.`,
  tamanho: (lim, tem) => `Certifique-se de que o valor tenha no máximo ${lim} caracteres (ele possui ${tem}).`,
};

/** Campos do formulário (ModelForm com fields='__all__' e exclude) */
function camposDoForm(nomeModelo, { exclui = [], so = null } = {}) {
  const m = db.modelo(nomeModelo);
  return m.campos.filter((c) => c.editavel && !['AutoField', 'BigAutoField'].includes(c.tipo) &&
    !exclui.includes(c.nome) && (!so || so.includes(c.nome)) && c.tipo !== 'FileField');
}

/** model_to_dict: nome do campo -> valor (FK = id) */
function modelToDict(nomeModelo, obj, campos = null) {
  const m = db.modelo(nomeModelo);
  const lista = campos || m.campos.filter((c) => c.editavel);
  const d = {};
  for (const c of lista) d[c.nome] = obj[c.atributo] === undefined ? null : obj[c.atributo];
  return d;
}

/** {'id_campo': str(valor)} — o que CarregaPaciente/CarregaRecibo devolvem */
function inicialEmTexto(nomeModelo, obj, opcoes) {
  const fields = {};
  for (const c of camposDoForm(nomeModelo, opcoes)) fields[`id_${c.nome}`] = pyStr(c, obj[c.atributo]);
  return fields;
}

// ----------------------------------------------------------- datas (pt-BR)
function dataValida(a, m, d) {
  const dt = new Date(a, m - 1, d);
  return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d;
}
const d2 = (n) => String(n).padStart(2, '0');
const ano2 = (y) => { const n = parseInt(y, 10); return n >= 69 ? 1900 + n : 2000 + n; };   // %y do Python

function lerData(t) {
  t = String(t).trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) || t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  let a, mes, d;
  if (m) { d = +m[1]; mes = +m[2]; a = m[3].length === 2 ? ano2(m[3]) : +m[3]; }
  else if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { a = +m[1]; mes = +m[2]; d = +m[3]; }
  else return undefined;
  if (!dataValida(a, mes, d)) return undefined;
  return `${String(a).padStart(4, '0')}-${d2(mes)}-${d2(d)}`;
}

function lerHora(t) {
  const m = String(t).trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,6}))?)?$/);
  if (!m || +m[1] > 23 || +m[2] > 59 || +(m[3] || 0) > 59) return undefined;
  return `${d2(+m[1])}:${d2(+m[2])}:${d2(+(m[3] || 0))}${m[4] ? '.' + m[4].padEnd(6, '0') : ''}`;
}

function lerDataHora(t) {
  t = String(t).trim().replace('T', ' ');
  const [dp, hp] = t.split(/\s+/);
  const data = lerData(dp);
  if (data === undefined) return undefined;
  if (!hp) return `${data} 00:00:00`;
  const hora = lerHora(hp);
  return hora === undefined ? undefined : `${data} ${hora}`;
}

// ------------------------------------------------------- limpeza por tipo
async function limpaCampo(c, bruto, presente) {
  const tipo = c.tipo;
  if (tipo === 'BooleanField') {
    if (!presente) return { valor: false };
    return { valor: !(typeof bruto === 'string' && ['false', '0'].includes(bruto.toLowerCase())) && !!bruto };
  }
  if (tipo === 'NullBooleanField') {
    if (['True', 'true', '1'].includes(bruto)) return { valor: true };
    if (['False', 'false', '0'].includes(bruto)) return { valor: false };
    return { valor: null };
  }
  let v = bruto === undefined || bruto === null ? null : String(bruto);
  if (['CharField', 'TextField', 'EmailField', 'SlugField', 'URLField', 'GenericIPAddressField'].includes(tipo) && v !== null) v = v.trim();
  const vazio = VAZIOS(v);
  const obrigatorio = !c.branco;
  if (vazio) {
    if (obrigatorio) return { erro: MSG.obrigatorio };
    const textual = ['CharField', 'TextField', 'EmailField', 'SlugField', 'URLField'].includes(tipo);
    return { valor: textual && !c.nulo ? '' : null };
  }
  switch (tipo) {
    case 'CharField': case 'TextField': case 'EmailField': case 'SlugField': case 'URLField': case 'GenericIPAddressField':
      if (c.opcoes && !c.opcoes.map(String).includes(v)) return { erro: MSG.escolhaValor(v) };
      if (c.max && v.length > c.max) return { erro: MSG.tamanho(c.max, v.length) };
      return { valor: v };
    case 'IntegerField': case 'PositiveIntegerField': case 'SmallIntegerField': case 'BigIntegerField': {
      const s = v.trim().replace(/\.0*\s*$/, '');
      if (!/^[-+]?\d+$/.test(s)) return { erro: MSG.inteiro };
      const n = parseInt(s, 10);
      if (c.opcoes && !c.opcoes.includes(n)) return { erro: MSG.escolhaValor(n) };
      return { valor: n };
    }
    case 'FloatField': {
      const n = Number(v.trim());
      if (v.trim() === '' || Number.isNaN(n)) return { erro: MSG.numero };
      return { valor: n };
    }
    case 'DecimalField': {
      const s = v.trim();
      if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return { erro: MSG.numero };
      return { valor: Number(s).toFixed(c.casas || 0) };
    }
    case 'DateField': { const d = lerData(v); return d === undefined ? { erro: MSG.data } : { valor: d }; }
    case 'TimeField': { const h = lerHora(v); return h === undefined ? { erro: MSG.hora } : { valor: h }; }
    case 'DateTimeField': { const dh = lerDataHora(v); return dh === undefined ? { erro: MSG.dataHora } : { valor: dh }; }
    case 'ForeignKey': case 'OneToOneField': {
      const ref = db.modelo(c.ref);
      const alvo = await db.tabela(c.ref).where(db.coluna(c.ref, ref.pk), v).first();
      if (!alvo) return { erro: MSG.escolha };
      const pkCampo = ref._porAtributo[ref.pk];
      return { valor: db.converte(pkCampo, alvo[pkCampo.coluna]) };
    }
    default:
      return { valor: v };
  }
}

/**
 * form = TbXForm(dados, instance=instancia); form.is_valid()
 * dados: QueryDict. Devolve { valido, erros: {campo: msg}, valores: {atributo: valor} }.
 */
async function validaForm(nomeModelo, dados, { instancia = null, exclui = [], so = null } = {}) {
  const erros = {};
  const valores = {};
  for (const c of camposDoForm(nomeModelo, { exclui, so })) {
    const presente = dados.has(c.nome);
    const bruto = dados.get(c.nome);
    const r = await limpaCampo(c, bruto, presente);
    if (r.erro) { erros[c.nome] = r.erro; continue; }
    // campo ausente do envio e com padrão no modelo: mantém o padrão/valor atual
    if (!presente && c.padrao !== undefined && c.tipo !== 'BooleanField' && VAZIOS(r.valor)) {
      valores[c.atributo] = instancia ? instancia[c.atributo] : c.padrao;
      continue;
    }
    valores[c.atributo] = r.valor;
  }
  // campos únicos (validate_unique do Django)
  const m = db.modelo(nomeModelo);
  for (const c of camposDoForm(nomeModelo, { exclui, so })) {
    if (!c.unico || erros[c.nome] || VAZIOS(valores[c.atributo])) continue;
    const q = db.tabela(nomeModelo).where(c.coluna, valores[c.atributo]);
    if (instancia) q.whereNot(db.coluna(nomeModelo, m.pk), instancia[m.pk]);
    if (await q.first()) erros[c.nome] = `${capitaliza(m.verbose)} com este ${capitaliza(c.verbose)} já existe.`;
  }
  return { valido: Object.keys(erros).length === 0, erros, valores };
}

/** o valor novo é diferente do que está no banco? */
function mudou(c, velho, novo) {
  const nulo = (v) => v === null || v === undefined;
  if (nulo(velho) && nulo(novo)) return false;
  if (nulo(velho) !== nulo(novo)) return true;
  if (['BooleanField', 'NullBooleanField'].includes(c.tipo)) return Boolean(velho) !== Boolean(novo === 'False' ? false : novo);
  if (['IntegerField', 'AutoField', 'BigAutoField', 'PositiveIntegerField', 'SmallIntegerField', 'BigIntegerField',
    'ForeignKey', 'OneToOneField', 'FloatField', 'DecimalField'].includes(c.tipo)) {
    const a = Number(velho), b = Number(novo);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return a !== b;
  }
  if (['DateTimeField', 'TimeField'].includes(c.tipo)) {
    const n = (v) => String(v).replace('T', ' ').replace(/\.0+$/, '');
    return n(velho) !== n(novo);
  }
  return String(velho) !== String(novo);
}

const capitaliza = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ------------------------------------------------------------ gravação
function ipDe(req) {
  if (!req) return null;
  const ip = (req.socket && req.socket.remoteAddress) || null;
  return ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function jsonSeguro(nomeModelo, dict) {
  const m = db.modelo(nomeModelo);
  const o = {};
  for (const [k, v] of Object.entries(dict)) o[k] = pyIso(m._porAtributo[k], v);
  return o;
}

async function registraLog(req, acao, nomeModelo, pk, antes, depois) {
  const u = req && req.user;
  if (!u || !u.is_authenticated || IGNORAR_NO_LOG.has(nomeModelo)) return;
  let data = null;
  if (antes !== undefined || depois !== undefined) {
    data = pyJson({ antes: antes || {}, depois: depois || {} });
  }
  await db.tabela('UserLog').insert(db.paraColunas('UserLog', {
    user_id: u.id, action: acao, model_name: nomeModelo, object_id: pk === null ? null : String(pk),
    data, ip_address: ipDe(req), created_at: db.agora(),
  }));
}

async function insereComId(nomeModelo, colunas) {
  const m = db.modelo(nomeModelo);
  const pkCampo = m._porAtributo[m.pk];
  const res = await db.tabela(nomeModelo).insert(colunas);
  let id = Array.isArray(res) ? res[0] : res;
  if (id && typeof id === 'object') id = Object.values(id)[0];
  return colunas[pkCampo.coluna] !== undefined && colunas[pkCampo.coluna] !== null ? colunas[pkCampo.coluna] : id;
}

/**
 * Model.save(): grava (insere sem pk / atualiza com pk), aplica auto_now e
 * auto_now_add e registra o log como os signals do AppClinic.
 *   obj: {atributo: valor} completo (para atualizar, com a pk)
 *   somenteCampos: save(update_fields=[...])
 */
async function salva(req, nomeModelo, obj, { somenteCampos = null } = {}) {
  const m = db.modelo(nomeModelo);
  const pk = obj[m.pk];
  const agora = db.agora();
  const hoje = db.hoje();
  let antes = null;
  let existe = false;
  if (pk !== null && pk !== undefined) {
    antes = await db.busca(nomeModelo, { [m.pk]: pk });
    existe = !!antes;
  }
  for (const c of m.campos) {
    if (c.auto_now || (c.auto_now_add && !existe)) {
      if (somenteCampos && !somenteCampos.includes(c.nome) && !somenteCampos.includes(c.atributo) && !c.auto_now) continue;
      obj[c.atributo] = c.tipo === 'DateField' ? hoje : c.tipo === 'TimeField' ? agora.slice(11) : agora;
    }
  }
  if (existe) {
    let campos = m.campos.filter((c) => !c.pk);
    if (somenteCampos) campos = campos.filter((c) => somenteCampos.includes(c.nome) || somenteCampos.includes(c.atributo) || c.auto_now);
    // grava só o que mudou: o Django regravava todas as colunas com o valor
    // que leu, então o resultado no banco é o mesmo; e colunas de tipos
    // antigos (ex.: login_atualizacao) não são reconvertidas à toa
    const dados = {};
    for (const c of campos) {
      if (obj[c.atributo] === undefined) continue;
      if (!c.auto_now && !mudou(c, antes[c.atributo], obj[c.atributo])) continue;
      dados[c.atributo] = obj[c.atributo];
    }
    if (Object.keys(dados).length) {
      await db.tabela(nomeModelo).where(db.coluna(nomeModelo, m.pk), pk).update(db.paraColunas(nomeModelo, dados));
    }
  } else {
    const dados = {};
    for (const c of m.campos) {
      if (obj[c.atributo] !== undefined) dados[c.atributo] = obj[c.atributo];
      else if (c.pk) continue;
      // Field.get_default() do Django: o padrão do modelo; sem padrão, '' para
      // texto que não aceita nulo e None para o resto
      else if (c.padrao !== undefined) dados[c.atributo] = c.padrao;
      else dados[c.atributo] = !c.nulo && TEXTO.includes(c.tipo) ? '' : null;
      if (obj[c.atributo] === undefined) obj[c.atributo] = dados[c.atributo];
    }
    if (dados[m.pk] === null || dados[m.pk] === undefined) delete dados[m.pk];
    let id;
    try {
      id = await insereComId(nomeModelo, db.paraColunas(nomeModelo, dados));
    } catch (e) {
      // pk inteira sem auto-incremento (ex.: tb_usuarios_opcoes): calcula o id
      const pkC = m._porAtributo[m.pk];
      if (['AutoField', 'BigAutoField'].includes(pkC.tipo) || dados[m.pk] !== undefined) throw e;
      const max = await db.tabela(nomeModelo).max({ m: pkC.coluna }).first();
      dados[m.pk] = (Number(max && max.m) || 0) + 1;
      id = await insereComId(nomeModelo, db.paraColunas(nomeModelo, dados));
    }
    obj[m.pk] = Number(id);
  }
  // o log do Django usa os valores do objeto em memória (model_to_dict(instance))
  const memoria = Object.assign({}, obj);
  const depois = await db.busca(nomeModelo, { [m.pk]: obj[m.pk] });
  Object.assign(obj, depois);

  // log de auditoria (post_save)
  try {
    if (!existe) {
      await registraLog(req, 'Criação de registro', nomeModelo, obj[m.pk], {}, jsonSeguro(nomeModelo, modelToDictAtrib(nomeModelo, memoria)));
    } else {
      const a = jsonSeguro(nomeModelo, modelToDictAtrib(nomeModelo, antes));
      const d = jsonSeguro(nomeModelo, modelToDictAtrib(nomeModelo, memoria));
      const ra = {}, rd = {};
      for (const k of Object.keys(d)) {
        if (pyStrJson(a[k]) !== pyStrJson(d[k])) { ra[k] = a[k] === undefined ? null : a[k]; rd[k] = d[k]; }
      }
      if (Object.keys(rd).length) await registraLog(req, 'Alteração de registro', nomeModelo, obj[m.pk], ra, rd);
    }
  } catch (e) {
    console.error(`[LOG ERRO] Falha ao registrar log para ${nomeModelo}: ${e.message}`);
  }
  return obj;
}

/** model_to_dict com chaves pelo NOME do campo (fk_clinica), valores pelo atributo */
function modelToDictAtrib(nomeModelo, obj) {
  const m = db.modelo(nomeModelo);
  const d = {};
  for (const c of m.campos.filter((x) => x.editavel)) d[c.nome] = obj ? obj[c.atributo] : null;
  // chaves do log usam o nome do campo; o jsonSeguro precisa do tipo: mapeia nome -> campo
  for (const c of m.campos) if (!m._porAtributo[c.nome]) m._porAtributo[c.nome] = c;
  return d;
}

async function exclui(req, nomeModelo, obj) {
  const m = db.modelo(nomeModelo);
  await db.tabela(nomeModelo).where(db.coluna(nomeModelo, m.pk), obj[m.pk]).del();
  try {
    await registraLog(req, 'Exclusão de registro', nomeModelo, obj[m.pk], jsonSeguro(nomeModelo, modelToDictAtrib(nomeModelo, obj)), {});
  } catch (e) {
    console.error(`[LOG ERRO] Falha ao registrar exclusão para ${nomeModelo}: ${e.message}`);
  }
}

module.exports = { camposDoForm, modelToDict, inicialEmTexto, validaForm, salva, exclui, lerData, lerHora, lerDataHora, MSG };
