'use strict';
/**
 * Home/urls.py: tela inicial, login, logout e troca de senha.
 */
const config = require('../config');
const db = require('../db');
const { render, SafeString } = require('../templates');
const senhas = require('../seguranca/senhas');
const { entra, sai } = require('../seguranca/sessao');
const { redireciona } = require('../util/http');

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ano = () => String(new Date().getFullYear());

// mensagem do AuthenticationForm do Django em pt-BR (dois espaços, como lá)
const MSG_LOGIN = 'Por favor, entre com um login  e senha corretos. Note que ambos os campos diferenciam maiúsculas e minúsculas.';
const MSG_INATIVO = 'Esta conta está inativa.';

// ErrorList do Django: "errorlist nonfield" para erros gerais, "errorlist" por campo
function erros(lista, porCampo = false) {
  return new SafeString(`<ul class="errorlist${porCampo ? '' : ' nonfield'}">` + lista.map((m) => `<li>${m}</li>`).join('') + '</ul>');
}

function telaLogin(res, extra) {
  return render(res, 'Seguranca/Usuario/sign_in.html', Object.assign({
    host: config.bancoExibido.host, db: config.bancoExibido.nome, nmsistema: config.nomeSistema, ano: ano(),
  }, extra));
}

module.exports = function (app) {
  app.get('/', a(async (req, res) => {
    await render(res, 'Home/index.html', {
      host: config.bancoExibido.host, db: config.bancoExibido.nome, usuario: req.user,
      nmsistema: config.nomeSistema, ano: ano(),
    });
  }));

  app.get('/login/', a(async (req, res) => {
    if (req.user.is_authenticated) return redireciona(res, '/');
    await telaLogin(res, { form: { errors: null }, next_url: req.GET.get('next') });
  }));

  app.post('/login/', a(async (req, res) => {
    const login = req.POST.get('username', '');
    const senha = req.POST.get('password', '');
    const u = login ? await db.busca('TbUsuario', { login }) : null;
    let msg = null;
    if (!u || !senhas.confere(senha, u.password)) msg = MSG_LOGIN;
    else if (!u.is_active) msg = MSG_INATIVO;
    if (msg) {
      return telaLogin(res, { form: { errors: { __all__: erros([msg]) } } });
    }
    entra(req, u);
    await db.tabela('TbUsuario').where(db.coluna('TbUsuario', 'id'), u.id)
      .update({ [db.coluna('TbUsuario', 'last_login')]: db.agora() });
    // como o Django: vai para o "next" do formulário (vazio = "None" -> raiz)
    const destino = req.POST.get('next');
    redireciona(res, destino && destino !== 'None' && destino.startsWith('/') ? destino : '/');
  }));

  app.get('/logout/', (req, res) => { sai(req); redireciona(res, '/'); });

  app.get('/mudar_senha/', a(async (req, res) => {
    await render(res, 'Seguranca/Usuario/trocasenha.html', { form: formSenha({}) });
  }));

  // PasswordChangeView: PUT faz o mesmo que POST (ProcessFormView.put)
  app.all('/mudar_senha/', (req, res, next) => (req.method === 'PUT' ? (req.method = 'POST', next()) : next()));
  app.post('/mudar_senha/', a(async (req, res) => {
    const antiga = req.POST.get('old_password', '');
    const nova1 = req.POST.get('new_password1', '');
    const nova2 = req.POST.get('new_password2', '');
    // PasswordChangeForm: primeiro o "obrigatório" de cada campo; a senha antiga só é
    // conferida se veio; "não correspondem" só com as duas novas preenchidas
    const e = {};
    const OBRIG = 'Este campo é obrigatório.';
    if (!antiga) e.old_password = OBRIG;
    else if (!senhas.confere(antiga, req.user.password)) e.old_password = 'A senha antiga foi digitada incorretamente. Por favor, informe-a novamente.';
    if (!nova1) e.new_password1 = OBRIG;
    if (!nova2) e.new_password2 = OBRIG;
    else if (nova1 && nova1 !== nova2) e.new_password2 = 'Os dois campos de senha não correspondem.';
    if (Object.keys(e).length) return render(res, 'Seguranca/Usuario/trocasenha.html', { form: formSenha(e) });
    const codificada = senhas.codifica(nova1);
    await db.tabela('TbUsuario').where(db.coluna('TbUsuario', 'id'), req.user.id)
      .update({ [db.coluna('TbUsuario', 'password')]: codificada });
    entra(req, Object.assign({}, req.user, { password: codificada }));   // continua logado
    redireciona(res, 'concluido/');   // igual ao success_url do Django
  }));

  app.get('/mudar_senha/concluido/', a(async (req, res) => {
    await render(res, 'Seguranca/Usuario/trocaconcluida.html', {});
  }));
};

function formSenha(e) {
  const campo = (nome) => ({ errors: e[nome] ? erros([e[nome]], true) : null });
  const lista = {};
  for (const [k, v] of Object.entries(e)) lista[k] = erros([v], true);
  return { errors: Object.keys(e).length ? lista : null, old_password: campo('old_password'),
    new_password1: campo('new_password1'), new_password2: campo('new_password2') };
}
