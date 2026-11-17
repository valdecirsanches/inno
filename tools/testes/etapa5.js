// Testes da etapa 5a: segurança (usuários), painel, logs e opções de presença.
// Sobe o Inno num SQLite (tabelas do modelos.json + dados de tools/impressos/dados.json)
// e confere as respostas com o que o Django devolveria.
// Uso (na raiz do inno, com as dependências de desenvolvimento): node tools/testes/etapa5.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const R = path.join(__dirname, '..', '..');
const arq = path.join(os.tmpdir(), `inno-etapa5-${process.pid}.sqlite3`);
Object.assign(process.env, { DB_CLIENT: 'better-sqlite3', DB_FILE: arq, SECRET_KEY: 'x'.repeat(40), DEBUG: '', DB_NAME: 'teste' });
const M = require(R + '/server/modelos.json');
const D = require(R + '/tools/impressos/dados.json');
const Database = require(R + '/node_modules/better-sqlite3');
const sq = new Database(arq);
const AFIN = { IntegerField: 'INTEGER', AutoField: 'INTEGER', ForeignKey: 'INTEGER', BooleanField: 'INTEGER', FloatField: 'REAL', DecimalField: 'NUMERIC' };
for (const [, m] of Object.entries(M)) {
  sq.exec(`CREATE TABLE IF NOT EXISTS "${m.tabela}" (${m.campos.map((c) => `"${c.coluna}" ${c.pk ? 'INTEGER PRIMARY KEY' : AFIN[c.tipo] || 'TEXT'}`).join(',')})`);
}
const { codifica } = require(R + '/server/seguranca/senhas');
for (const [n, linhas] of Object.entries(D)) {
  const m = M[n];
  for (const o of linhas) {
    if (n === 'TbUsuario') Object.assign(o, { password: codifica('s'), email: '', last_name: '', is_staff: false, is_superuser: false, date_joined: '2020-01-01 00:00:00' });
    const k = Object.keys(o); const cs = k.map((a) => m.campos.find((c) => c.atributo === a).coluna);
    sq.prepare(`INSERT INTO "${m.tabela}" (${cs.map((c) => `"${c}"`).join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...k.map((x) => (typeof o[x] === 'boolean' ? +o[x] : o[x])));
  }
}
sq.exec(`UPDATE tb_clinicas SET whatsapp_confirma = 'Obrigado! Até lá.', whatsapp_cancela = NULL`);
sq.exec(`UPDATE tb_agendas SET confirmacao = NULL WHERE id IN (1, 2)`);
sq.exec(`INSERT INTO django_admin_log (id, action_time, user_id, object_repr, action_flag, change_message) VALUES (7, '2025-01-01 10:00:00', 1, 'x', 1, '')`);

const app = require(R + '/server/index.js');
let ok = 0;
const confere = (nome, f) => { f(); ok++; console.log('ok -', nome); };

const srv = app.listen(0, async () => {
  const B = `http://127.0.0.1:${srv.address().port}`;
  const ck = {};
  const cookies = () => Object.entries(ck).map(([k, v]) => `${k}=${v}`).join('; ');
  const guarda = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); ck[kv.slice(0, i)] = kv.slice(i + 1); } return r; };
  const vai = (u, o = {}) => fetch(B + u, Object.assign({ redirect: 'manual' }, o, {
    headers: Object.assign({ cookie: cookies(), 'x-csrftoken': ck.csrftoken || '', referer: B + '/', 'x-requested-with': 'XMLHttpRequest' },
      o.body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}, o.headers || {}),
  })).then(guarda);
  const corpo = (o) => new URLSearchParams(o).toString();
  try {
    // ------------------------------------------------- presença (sem login)
    await vai('/login/');
    let r = await vai('/opcoesPresenca/?agenda=1-1', { headers: { 'x-requested-with': '' } });
    let t = await r.text();
    confere('opcoesPresenca mostra a consulta', () => {
      assert.equal(r.status, 200);
      assert.match(t, /Ana Paula de Souza/);
      assert.match(t, /Em 2 de Janeiro de 2026 às 09:10/);
      assert.match(t, /Com Dr\. João da Silva/);
      assert.match(t, /btnConfirmar/);
      assert.match(t, /paciente=1'/);
    });
    r = await vai('/opcoesPresenca/?agenda=1-2'); t = await r.text();
    confere('opcoesPresenca de outro paciente: não encontrado', () => { assert.equal(r.status, 200); assert.match(t, /não foi encontrado/); });
    r = await vai('/opcoesPresenca/?agenda=1');
    confere('opcoesPresenca sem paciente: 500 (IndexError)', () => assert.equal(r.status, 500));
    r = await vai('/opcoesPresenca/?agenda=x-1');
    confere('opcoesPresenca com id inválido: 500', () => assert.equal(r.status, 500));

    r = await vai('/confirmar-presenca-efetivo/?id_consulta=1&paciente=2');
    confere('confirmar com paciente errado: 404', async () => assert.equal(r.status, 404));
    assert.equal(await r.text(), '{"error": "Consulta n\\u00e3o encontrada"}');
    r = await vai('/confirmar-presenca-efetivo/?id_consulta=abc&paciente=1');
    confere('confirmar com id inválido: 404', () => assert.equal(r.status, 404));
    r = await vai('/confirmar-presenca-efetivo/?id_consulta=1&paciente=1', { method: 'POST', body: corpo({}) });
    t = await r.text();
    confere('confirmar: grava e devolve a mensagem da clínica', () => {
      assert.equal(r.status, 200);
      assert.equal(t, '{"success": "Ol\\u00e1 Ana Paula de Souza,\\nSua consulta em 02 de janeiro \\u00e0s 09:10 \\nObrigado! At\\u00e9 l\\u00e1."}');
      assert.equal(sq.prepare('SELECT confirmacao FROM tb_agendas WHERE id = 1').get().confirmacao, 1);
    });
    r = await vai('/cancelar-presenca-efetivo/?id_consulta=1&paciente=1'); t = await r.text();
    confere('cancelar depois de confirmada: já foi confirmada', () => assert.match(t, /j\\u00e1 foi \*c o n f i r m a d a !\*/));
    r = await vai('/cancelar-presenca-efetivo/?id_consulta=2&paciente=1'); t = await r.text();
    confere('cancelar: whatsapp_cancela vazio sai None', () => assert.match(t, /\\nNone"}$/));
    r = await vai('/opcoesPresenca/?agenda=1-1'); t = await r.text();
    confere('opcoesPresenca depois de confirmar', () => assert.match(t, /Presença confirmada!/));

    // ------------------------------------------------------------- login
    r = await vai('/login/', { method: 'POST', body: 'username=u&password=s', headers: { 'x-requested-with': '' } });
    assert.equal(r.status, 302);

    // ------------------------------------------------------------ usuários
    r = await vai('/seguranca/', { headers: { 'x-requested-with': '', accept: 'text/html' } }); t = await r.text();
    confere('tela de usuários', () => { assert.equal(r.status, 200); assert.match(t, /<h2>Usuários<\/h2>/); assert.match(t, /João da Silva/); });
    r = await vai('/seguranca/usuario.json/'); t = await r.text();
    confere('usuario.json lista', () => assert.equal(t, '[{"id": 1, "clinica": "Clinica", "fk_clinica": 1, "fk_medico": 1, "email": "", "login": "u", "username": "u", "first_name": "Maria", "last_name": ""}]'));

    const form = (o) => corpo(Object.assign({ first_name: 'Novo', email: 'Fulano@Exemplo.COM', is_active: 'on', fk_clinica: '1', fk_medico: '', login: 'novo', nome: 'Novo Usuário', cpf: '', codigo: '', administrador: '' }, o));
    r = await vai('/seguranca/usuario.json/', { method: 'POST', body: corpo({ id: '0', form: form({ login: '', email: 'x@' }) }) }); t = await r.text();
    confere('usuario.json POST com erros', () => assert.equal(t, '{"error": "Favor corrigir: email ==> <ul class=\\"errorlist\\"><li>Informe um endere\\u00e7o de email v\\u00e1lido.</li></ul>\\nFavor corrigir: login ==> <ul class=\\"errorlist\\"><li>Este campo \\u00e9 obrigat\\u00f3rio.</li></ul>\\n"}'));
    r = await vai('/seguranca/usuario.json/', { method: 'POST', body: corpo({ id: '0', form: form({ login: 'u' }) }) }); t = await r.text();
    confere('usuario.json POST login repetido', () => assert.match(t, /Tb usuario com este Login j\\u00e1 existe\./));
    r = await vai('/seguranca/usuario.json/', { method: 'POST', body: corpo({ id: '0', form: form({}) }) }); t = await r.text();
    confere('usuario.json POST cria (id None, email normalizado)', () => {
      assert.equal(t, '{"success": {"id": null, "groups": [], "user_permissions": [], "first_name": "Novo", "email": "Fulano@exemplo.com", "is_staff": false, "is_active": true, "fk_clinica": 1, "fk_medico": null, "login": "novo", "nome": "Novo Usu\\u00e1rio", "cpf": null, "codigo": null, "administrador": null}}');
      const u = sq.prepare("SELECT * FROM tb_usuarios WHERE login = 'novo'").get();
      assert.equal(u.password, ''); assert.equal(u.username, ''); assert.ok(u.date_joined);
      const log = sq.prepare("SELECT * FROM tb_usuarios_log WHERE model_name = 'TbUsuario' ORDER BY id DESC").get();
      assert.equal(log.object_id, null);
      assert.match(log.data, /"id": null, .*"groups": \[\], "user_permissions": \[\]}}$/);
    });
    const novo = sq.prepare("SELECT id FROM tb_usuarios WHERE login = 'novo'").get().id;
    r = await vai('/seguranca/usuario.json/', { method: 'POST', body: corpo({ id: String(novo), form: form({ first_name: 'Novo 2' }) }) }); t = await r.text();
    confere('usuario.json POST altera', () => {
      assert.match(t, new RegExp(`^\\{"success": \\{"id": ${novo}, "groups": \\[\\], "user_permissions": \\[\\], "first_name": "Novo 2"`));
      const log = sq.prepare("SELECT * FROM tb_usuarios_log WHERE model_name = 'TbUsuario' ORDER BY id DESC").get();
      assert.equal(log.action, 'Alteração de registro');
      assert.equal(log.data, '{"antes": {"first_name": "Novo"}, "depois": {"first_name": "Novo 2"}}');
    });
    sq.prepare('INSERT INTO tb_usuarios_groups (tbusuario_id, group_id) VALUES (?, 3)').run(novo);
    r = await vai('/seguranca/usuario.json/', { method: 'POST', body: corpo({ id: String(novo), form: form({}) }) });
    confere('usuario com grupo: row() dá 500 (Group não serializa)', () => assert.equal(r.status, 500));
    sq.prepare(`INSERT INTO django_admin_log (id, action_time, user_id, object_repr, action_flag, change_message) VALUES (8, '2025-01-02 10:00:00', ?, 'y', 2, 'm')`).run(novo);
    r = await vai('/seguranca/usuario.json/', { method: 'DELETE', body: corpo({ id: String(novo) }) }); t = await r.text();
    confere('usuario.json DELETE', () => {
      assert.equal(t, '{"success": "Sucesso"}');
      assert.equal(sq.prepare('SELECT COUNT(*) n FROM tb_usuarios WHERE id = ?').get(novo).n, 0);
      assert.equal(sq.prepare('SELECT COUNT(*) n FROM tb_usuarios_groups').get().n, 0);
      assert.equal(sq.prepare('SELECT COUNT(*) n FROM django_admin_log').get().n, 1);
      const logs = sq.prepare("SELECT model_name, object_id, data FROM tb_usuarios_log WHERE action = 'Exclusão de registro' ORDER BY id").all();
      assert.deepEqual(logs.map((l) => l.model_name), ['LogEntry', 'TbUsuario']);
      assert.equal(logs[0].data, `{"antes": {"id": 8, "user": ${novo}, "content_type": null, "object_id": null, "object_repr": "y", "action_flag": 2, "change_message": "m"}, "depois": {}}`);
      assert.match(logs[1].data, /"groups": \[\], "user_permissions": \[\]}, "depois": \{\}}$/);
    });
    r = await vai('/seguranca/usuario.json/', { method: 'DELETE', body: corpo({ id: '999' }) });
    confere('DELETE de quem não existe: 500', () => assert.equal(r.status, 500));

    // ---------------------------------------------------------- painel e logs
    r = await vai('/painel/', { headers: { 'x-requested-with': '', accept: 'text/html' } });
    confere('painel', () => assert.equal(r.status, 200));
    sq.prepare(`INSERT INTO tb_usuarios_log (id_usuario, action, model_name, object_id, data, created_at) VALUES (1, 'Teste', 'X', '5', '{"antes": {"peso": 70.0, "ok": true, "obs": "it''s"}, "depois": {}}', '2030-01-01 12:34:00')`).run();
    sq.prepare(`INSERT INTO tb_usuarios_log (id_usuario, action, model_name, object_id, data, created_at) VALUES (NULL, 'Vazio', NULL, NULL, NULL, '2029-01-01 00:00:00')`).run();
    r = await vai('/logs/painel/', { headers: { 'x-requested-with': '', accept: 'text/html' } }); t = await r.text();
    confere('logs/painel', () => {
      assert.equal(r.status, 200);
      // str(dict) do Python, escapado duas vezes (force_escape|force_escape)
      assert.ok(t.includes("{&amp;#x27;antes&amp;#x27;: {&amp;#x27;peso&amp;#x27;: 70.0, &amp;#x27;ok&amp;#x27;: True, &amp;#x27;obs&amp;#x27;: &amp;quot;it&amp;#x27;s&amp;quot;}, &amp;#x27;depois&amp;#x27;: {}}"));
      assert.match(t, /<td>u<\/td>/);
      assert.match(t, /01\/01\/2030 12:34/);
      assert.match(t, /<td>None<\/td>\s*<td>\s*<span class="badge badge-secondary">Vazio<\/span>/);
      assert.ok(t.indexOf('Teste') < t.indexOf('Vazio'));
    });
    r = await vai('/logs/gerenciar/');
    confere('logs/gerenciar: 500 como no AppClinic', () => assert.equal(r.status, 500));

    // ------------------------------------------------- redefinir senha (botão)
    const SENHA = '/seguranca/usuario/senha/';
    sq.exec(`UPDATE tb_usuarios SET administrador = 'False', is_superuser = 0 WHERE id = 1`);
    r = await vai(SENHA, { method: 'POST', body: corpo({ id: '1', senha: 'nova1234' }) }); t = await r.text();
    confere('redefinir senha: só administrador', () => assert.equal(t, '{"success": false, "error": "S\\u00f3 um administrador pode redefinir senhas."}'));
    sq.exec(`UPDATE tb_usuarios SET administrador = 'True' WHERE id = 1`);
    r = await vai(SENHA, { method: 'POST', body: corpo({ id: '1', senha: ' 12 ' }) }); t = await r.text();
    confere('redefinir senha: senha curta', () => assert.match(t, /pelo menos 4 caracteres/));
    r = await vai(SENHA, { method: 'POST', body: corpo({ id: 'x', senha: 'nova1234' }) }); t = await r.text();
    confere('redefinir senha: usuário inexistente', () => assert.equal(t, '{"success": false, "error": "Usu\\u00e1rio n\\u00e3o encontrado."}'));
    r = await vai(SENHA, { method: 'POST', body: corpo({ id: '1', senha: 'nova1234' }) }); t = await r.text();
    confere('redefinir senha: grava e a senha nova entra', async () => {
      assert.equal(t, '{"success": true, "message": "Senha de Maria redefinida."}');
      const { confere: confereSenha } = require(R + '/server/seguranca/senhas');
      const pw = sq.prepare('SELECT password FROM tb_usuarios WHERE id = 1').get().password;
      assert.ok(confereSenha('nova1234', pw) && !confereSenha('s', pw));
    });
    r = await vai('/seguranca/', { headers: { 'x-requested-with': '', accept: 'text/html' } }); t = await r.text();
    confere('tela de usuários mostra o botão ao administrador', () => assert.match(t, /id="btnRedefineSenha"/));
    console.log(`\n${ok} conferências ok`);
  } catch (e) {
    console.error('FALHOU:', e.message);
    process.exitCode = 1;
  } finally {
    srv.close();
    try { fs.unlinkSync(arq); } catch (e) { /* */ }
    setTimeout(() => process.exit(), 50);
  }
});
