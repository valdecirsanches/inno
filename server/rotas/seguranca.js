'use strict';
/**
 * Segurança: cadastro de usuários (Seguranca/views.py do AppClinic).
 *   /seguranca/              tela (UsuarioView)
 *   /seguranca/usuario.json/ lista (GET), grava (POST) e exclui (DELETE) (UsuarioJson)
 */
const net = require('net');
const url = require('url');
const config = require('../config');
const db = require('../db');
const { render } = require('../templates');
const { json } = require('../util/http');
const modelo = require('../util/modelo');
const { obtem, relacionado, int, erroPython } = require('../util/orm');
const { exige, pyStrValor } = require('../util/python');
const QueryDict = require('../util/querydict');
const senhas = require('../seguranca/senhas');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const U = 'TbUsuario';

// TbUsuarioForm: fields='__all__' menos o exclude ('is_taff' está errado no
// original, então is_staff continua no formulário)
const EXCLUI = ['id', 'password', 'last_login', 'is_superuser', 'date_joined', 'username', 'last_name'];

// ------------------------------------------------- EmailValidator do Django 3.2
const USUARIO_EMAIL = new RegExp(
  "^[-!#$%&'*+/=?^_`{}|~0-9A-Z]+(\\.[-!#$%&'*+/=?^_`{}|~0-9A-Z]+)*$" +
  '|^"([\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f!#-\\[\\]-\\x7f]|\\\\[\\x01-\\x09\\x0b\\x0c\\x0e-\\x7f])*"$', 'i');
const DOMINIO = /^((?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+)(?:[A-Z0-9-]{2,63}(?<!-))$/i;
const LITERAL = /^\[([A-f0-9:.]+)\]$/i;

function dominioValido(d) {
  if (DOMINIO.test(d)) return true;
  const m = d.match(LITERAL);
  return !!m && net.isIP(m[1]) !== 0;
}

function emailValido(v) {
  if (!v || !v.includes('@')) return false;
  const i = v.lastIndexOf('@');
  const usuario = v.slice(0, i), dominio = v.slice(i + 1);
  if (!USUARIO_EMAIL.test(usuario)) return false;
  if (dominio === 'localhost' || dominioValido(dominio)) return true;
  // domínio internacional: tenta em punycode (o Django usa o codec idna)
  const ascii = url.domainToASCII(dominio);
  return !!ascii && dominioValido(ascii);
}

// --------------------------------------------------------------- formulário
/** ordem do form.fields (creation_counter): as M2M groups/user_permissions vêm antes de first_name */
const CAMPOS = () => modelo.camposDoForm(U, { exclui: EXCLUI });

/**
 * TbUsuarioForm(dados, instance).is_valid() + form.save(commit=False).
 * Devolve { erros: [[campo, [mensagens]]...] } ou { obj }.
 */
async function validaUsuario(dados, inst) {
  const f = await modelo.validaForm(U, dados, { instancia: inst, exclui: EXCLUI });
  const campos = CAMPOS();
  const m = db.modelo(U);
  const porCampo = {};
  const unicos = {};
  for (const [k, msg] of Object.entries(f.erros)) {
    if (/ já existe\.$/.test(msg)) unicos[k] = [msg]; else porCampo[k] = [msg];
  }
  // email: EmailField (o modelos.json diz CharField); validate_email vem antes do tamanho
  const e = String(dados.get('email') === null ? '' : dados.get('email')).trim();
  if (e !== '' && !emailValido(e)) porCampo.email = ['Informe um endereço de email válido.'].concat(porCampo.email || []);
  // AbstractUser.clean(): login em NFKC e domínio do email em minúsculas,
  // antes do validate_unique (que então confere o login já normalizado)
  const v = f.valores;
  if (!porCampo.login && typeof v.login === 'string') {
    const n = v.login.normalize('NFKC');
    if (n !== v.login) {
      v.login = n;
      delete unicos.login;
      const q = db.tabela(U).where(db.coluna(U, 'login'), n);
      if (inst) q.whereNot(db.coluna(U, 'id'), inst.id);
      if (await q.first()) unicos.login = [`${modelo.capitaliza(m.verbose)} com este Login já existe.`];
    }
  }
  if (!porCampo.email && typeof v.email === 'string' && v.email.includes('@')) {
    const i = v.email.lastIndexOf('@');
    v.email = v.email.slice(0, i) + '@' + v.email.slice(i + 1).toLowerCase();
  }
  // form.errors: primeiro os erros dos campos (na ordem do formulário), depois os de campo único
  const erros = [];
  for (const c of campos) if (porCampo[c.nome]) erros.push([c.nome, porCampo[c.nome]]);
  for (const c of campos) if (unicos[c.nome] && !porCampo[c.nome]) erros.push([c.nome, unicos[c.nome]]);
  if (erros.length) return { erros };
  return { obj: Object.assign(inst ? Object.assign({}, inst) : {}, v) };
}

/** str(ErrorList) do Django 3.2 */
const errorList = (msgs) => '<ul class="errorlist">' + msgs.map((x) => `<li>${x}</li>`).join('') + '</ul>';

/** quantas linhas o usuário tem nas tabelas das ManyToMany (groups, user_permissions) */
async function m2m(id) {
  const conta = async (M) => (id === null || id === undefined ? 0
    : Number((await db.tabela(M).where(db.coluna(M, 'tbusuario_id'), id).count({ n: '*' }).first()).n));
  return { groups: await conta('TbUsuario_groups'), user_permissions: await conta('TbUsuario_user_permissions') };
}

/**
 * row(u): {'id': u.id, campo: form.initial[campo]...}. As ManyToMany entram
 * como lista de objetos Group/Permission, que o JsonResponse não serializa:
 * vazias saem [], com algum item dão erro (500), como no AppClinic.
 */
async function row(u) {
  const r = { id: u.id === undefined ? null : u.id };
  const n = await m2m(u.id);
  if (n.groups) throw erroPython('Object of type Group is not JSON serializable');
  if (n.user_permissions) throw erroPython('Object of type Permission is not JSON serializable');
  r.groups = [];
  r.user_permissions = [];
  for (const c of CAMPOS()) r[c.nome] = u[c.atributo] === undefined ? null : u[c.atributo];
  return r;
}

const contexto = (req, extra) => Object.assign({ host: config.bancoExibido.host, db: config.bancoExibido.nome, usuario: req.user }, extra);

module.exports = function (app) {
  app.get('/seguranca/', a(async (req, res) => {
    const medicos = db.linhas('TbMedicos', await db.tabela('TbMedicos'));
    await render(res, 'Seguranca/Usuario/index.html', contexto(req, { medicos }));
  }));

  const ROTA = '/seguranca/usuario.json/';

  app.get(ROTA, a(async (req, res) => {
    const us = db.linhas(U, await db.tabela(U));
    const clinicas = new Map();
    const ret = [];
    for (const u of us) {
      if (!clinicas.has(u.fk_clinica_id)) clinicas.set(u.fk_clinica_id, await relacionado('TbClinica', u.fk_clinica_id));
      const cl = clinicas.get(u.fk_clinica_id);
      if (!cl) throw erroPython("'NoneType' object has no attribute 'nome'");
      ret.push({
        id: u.id, clinica: cl.nome, fk_clinica: u.fk_clinica_id, fk_medico: u.fk_medico_id, email: u.email,
        login: u.login, username: u.username, first_name: u.first_name, last_name: u.last_name,
      });
    }
    json(res, ret);
  }));

  app.post(ROTA, a(async (req, res) => {
    const id = int(exige(req.POST, 'id'));
    const texto = exige(req.POST, 'form');
    const inst = id > 0 ? await obtem(U, { id }) : null;
    const r = await validaUsuario(new QueryDict(String(texto)), inst);
    if (r.erros) {
      return json(res, { error: r.erros.map(([k, msgs]) => `Favor corrigir: ${k} ==> ${errorList(msgs)}\n`).join('') });
    }
    const u = r.obj;
    if (!inst) {
      // padrões do AbstractUser que não estão no formulário (date_joined = timezone.now)
      u.date_joined = db.agora();
      await modelo.salva(req, U, u, { pkNaoVolta: true, extrasLog: { groups: [], user_permissions: [] } });
    } else {
      await modelo.salva(req, U, u);
    }
    json(res, { success: await row(u) });
  }));

  // Seguranca/views.py UsuarioSenha: redefine a senha (botão da tela de Usuários)
  app.post('/seguranca/usuario/senha/', a(async (req, res) => {
    const eu = req.user;
    if (!(eu.is_superuser || pyStrValor(eu.administrador) === 'True')) {
      return json(res, { success: false, error: 'Só um administrador pode redefinir senhas.' });
    }
    const idTexto = String(req.POST.get('id') || 0);
    const id = /^\s*[+-]?\d+\s*$/.test(idTexto) ? parseInt(idTexto, 10) : 0; // int() com ValueError => 0
    const senha = req.POST.get('senha') || '';
    if (senha.trim().length < 4) return json(res, { success: false, error: 'A senha nova precisa ter pelo menos 4 caracteres.' });
    const u = await db.busca(U, { id });
    if (!u) return json(res, { success: false, error: 'Usuário não encontrado.' });
    u.password = senhas.codifica(senha);
    await modelo.salva(req, U, u, { somenteCampos: ['password'] });
    // a própria senha: continua conectado (update_session_auth_hash)
    if (u.id === eu.id) require('../seguranca/sessao').entra(req, u);
    json(res, { success: true, message: `Senha de ${u.first_name || u.login} redefinida.` });
  }));

  app.delete(ROTA, a(async (req, res) => {
    const id = int(exige(req.corpo, 'id'));
    const u = await obtem(U, { id });
    // u.delete(): o Collector apaga antes, na mesma transação, o histórico do
    // admin (LogEntry, CASCADE) e as linhas das ManyToMany; o post_delete
    // registra o log de cada LogEntry e do usuário (as M2M não têm sinal)
    const L = 'LogEntry';
    const trx = await db.knex.transaction();
    let entradas;
    try {
      entradas = db.linhas(L, await trx(db.modelo(L).tabela).where(db.coluna(L, 'user_id'), id))
        .sort((x, y) => y.id - x.id);
      for (const M of ['TbUsuario_groups', 'TbUsuario_user_permissions']) {
        await trx(db.modelo(M).tabela).where(db.coluna(M, 'tbusuario_id'), id).del();
      }
      if (entradas.length) await trx(db.modelo(L).tabela).whereIn('id', entradas.map((e) => e.id)).del();
      await trx(db.modelo(U).tabela).where(db.coluna(U, 'id'), id).del();
    } catch (e) {
      await trx.rollback();
      throw e;
    }
    // um log que falha no banco (ex.: o usuário excluiu a si mesmo) desfaz a
    // exclusão inteira, e a resposta continua 'Sucesso' (o atomic do Django)
    let falhou = false;
    const loga = async (M, obj, extras) => {
      if (falhou) return;
      try {
        await modelo.registraLog(req, 'Exclusão de registro', M, obj.id, modelo.antesDaExclusao(M, obj, extras), {}, trx);
      } catch (e) {
        falhou = true;
        console.error(`[LOG ERRO] Falha ao registrar exclusão para ${M}: ${e.message}`);
      }
    };
    for (const e of entradas) await loga(L, e);
    await loga(U, u, { groups: [], user_permissions: [] });
    if (falhou) await trx.rollback(); else await trx.commit();
    json(res, { success: 'Sucesso' });
  }));
};
