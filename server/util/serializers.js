'use strict';
/**
 * Serializers do DRF usados em várias APIs:
 *  - EspecialidadeSerializer, MedicoSerializer (Cadastros/Medicos/serializers.py)
 *  - UsuarioSerializer (Seguranca/serializers.py)
 *  - SerializerRelatedField (core/serializers.py): FK mostrada como objeto
 */
const config = require('../config');
const db = require('../db');
const modelo = require('./modelo');
const { criaSerializer, VAZIO } = require('./viewset');
const { relacionado, erroPython } = require('./orm');

const pula = async () => VAZIO;   // ReadOnlyField de atributo inexistente / HiddenField

const especialidade = criaSerializer('TbEspecialidades', { declarados: [['deleted', pula], ['deleted_at', pula]] });

/** obj.memed_user_info: GET na Memed pelo hash do CPF; {} sem internet ou sem resposta válida */
async function memedUserInfo(m) {
  if (!m.cpf_hash) return {};
  try {
    const u = new URL(`${config.memed.apiBase}v1/sinapse-prescricao/usuarios/${m.cpf_hash}`);
    u.searchParams.set('api-key', config.memed.apiKey);
    u.searchParams.set('secret-key', config.memed.secretKey);
    const r = await fetch(u, { headers: { Accept: 'application/vnd.api+json' }, signal: AbortSignal.timeout(20000) });
    return JSON.parse(await r.text());
  } catch (e) { return {}; }
}

const medico = criaSerializer('TbMedicos', {
  declarados: [
    ['deleted', pula], ['deleted_at', pula],
    ['cpf_hash', pula],   // HiddenField: não aparece na resposta
    ['memed_token', async (m, req) => {
      if (!m.memed_token && m.habilitado_memed) {
        const info = await memedUserInfo(m);
        const pega = (o, k) => (o && typeof o === 'object' && !Array.isArray(o) && k in o ? o[k] : undefined);
        const dados = pega(info, 'data');
        const attrs = pega(dados === undefined ? {} : dados, 'attributes');
        let tok = pega(attrs === undefined ? {} : attrs, 'token');
        if (tok === undefined) tok = null;
        m.memed_token = tok;
        await modelo.salva(req, 'TbMedicos', m);
      }
      return m.memed_token === undefined ? null : m.memed_token;
    }],
    ['memed_especialidade', async (m) => {
      try { const e = await relacionado('TbEspecialidades', m.fk_especialidade_id); if (!e) return ''; return e.nome; } catch (e) { return ''; }
    }],
    ['fk_especialidade', async (m, req) => {
      if (m.fk_especialidade_id === null || m.fk_especialidade_id === undefined) return null;
      const e = await relacionado('TbEspecialidades', m.fk_especialidade_id);
      return especialidade.serializa(req, e);
    }],
  ],
});

const usuario = criaSerializer('TbUsuario', {
  exclui: ['password', 'username'],
  declarados: [
    ['fk_operadora', pula],
    ['regiao', pula],
    ['grupo', pula],
    ['clinica', async (u) => {
      if (u.fk_clinica_id === null || u.fk_clinica_id === undefined) return VAZIO;
      const c = await relacionado('TbClinica', u.fk_clinica_id);
      return c.nome;
    }],
  ],
  // ManyToMany do AbstractUser
  extras: async (u) => {
    const g = await db.knex('tb_usuarios_groups').where('tbusuario_id', u.id).orderBy('id').select('group_id');
    const p = await db.knex('tb_usuarios_user_permissions').where('tbusuario_id', u.id).orderBy('id').select('permission_id');
    return { groups: g.map((x) => x.group_id), user_permissions: p.map((x) => x.permission_id) };
  },
});

/** SerializerRelatedField(serializer_class=X): objeto relacionado serializado, ou None */
function relacionadoSerializado(nomeModelo, ser, atributo) {
  return async (obj, req) => {
    const id = obj[atributo];
    if (id === null || id === undefined) return null;
    const o = await relacionado(nomeModelo, id);
    return ser.serializa(req, o);
  };
}

/** SerializerRelatedField.to_internal_value: int(data) e get(id=data); 0 passa adiante */
function relacionadoGravavel(nomeModelo, atributo, { aceitaNulo = false } = {}) {
  const fn = async (v) => {
    const s = String(v).trim();
    if (typeof v === 'boolean') return { [atributo]: v ? 1 : 0 };
    if (!/^[-+]?\d+$/.test(s)) throw erroPython(`invalid literal for int() with base 10: '${v}'`);
    const id = parseInt(s, 10);
    if (!id) throw erroPython(`Cannot assign "${v}": must be a "${nomeModelo}" instance.`);
    await relacionado(nomeModelo, id);
    return { [atributo]: id };
  };
  // aceitaNulo: o SerializerRelatedField do AppClinic recusa null ("Este campo não pode ser
  // nulo."), mas registros antigos têm a chave vazia e a tela reenvia null ao salvar.
  // Com aceitaNulo (só em chaves que o modelo deixa vazias), o null é gravado como null.
  if (aceitaNulo) fn.aceitaNulo = atributo;
  return fn;
}

module.exports = { especialidade, medico, usuario, relacionadoSerializado, relacionadoGravavel, memedUserInfo, pula };
