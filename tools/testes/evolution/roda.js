// Roda o roteiro da Evolution API no AppClinic (Django) e no Inno, cada um com uma
// cópia do banco de teste, contra a Evolution falsa (e um WAHA falso) desta pasta.
//   node tools/testes/evolution/roda.js ../appclinic ~/venv-dj/bin/python
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const R = path.join(__dirname, '..', '..', '..');
const APPCLINIC = path.resolve(process.argv[2] || path.join(R, '..', 'appclinic'));
const PY = process.argv[3] || 'python3';
const { montaBanco } = require(R + '/tools/testes/base.js');
const { codifica } = require(R + '/server/seguranca/senhas');
const { roteiro } = require('./teste.js');

const PORTA_EVO = 8790;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evo-'));
const ENV = {
  EVOLUTION_URL: `http://127.0.0.1:${PORTA_EVO}`, EVOLUTION_API_KEY: 'chave-evo', EVOLUTION_WEBHOOK_URL: 'https://teste.local/webhook/resposta/',
  WAHA_URL: `http://127.0.0.1:${PORTA_EVO}`, WAHA_API_KEY: 'chave-waha', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
};

function banco(arq) {
  const sq = montaBanco(arq);
  // tabelas do próprio Django (auth/contenttypes) que o AppClinic consulta
  sq.exec(`CREATE TABLE IF NOT EXISTS auth_group (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS auth_permission (id INTEGER PRIMARY KEY, name TEXT, content_type_id INTEGER, codename TEXT);
    CREATE TABLE IF NOT EXISTS auth_group_permissions (id INTEGER PRIMARY KEY, group_id INTEGER, permission_id INTEGER);
    CREATE TABLE IF NOT EXISTS django_content_type (id INTEGER PRIMARY KEY, app_label TEXT, model TEXT);`);
  const u = sq.prepare('select * from tb_usuarios where id=1').get();
  const k = Object.keys(u);
  Object.assign(u, { id: 2, login: 'comum', username: 'comum', nome: 'Usuário comum', password: codifica('s') });
  sq.prepare(`insert into tb_usuarios (${k.map((x) => `"${x}"`).join(',')}) values (${k.map(() => '?').join(',')})`).run(...k.map((x) => u[x]));
  sq.prepare("update paciente set celular='11988887777' where id=1").run();
  sq.prepare("update tb_agendas set id_paciente=1, status='AGENDADO', data=date('now','+3 day') where id in (2,8)").run();
  sq.close();
}

const espera = async (url) => { for (let i = 0; i < 100; i++) { try { await fetch(url); return; } catch (e) { await new Promise((r) => setTimeout(r, 300)); } } throw new Error('não subiu: ' + url); };

const filhos = [];
process.on('exit', () => { for (const f of filhos) { try { f.kill(); } catch (e) { /* já saiu */ } } });

(async () => {
  Object.assign(process.env, ENV);
  const evo = spawn(process.execPath, [path.join(__dirname, 'falsa.js'), String(PORTA_EVO)], { stdio: 'ignore' });
  filhos.push(evo);
  const dbDj = path.join(tmp, 'django.sqlite3'), dbIn = path.join(tmp, 'inno.sqlite3');
  banco(dbDj); banco(dbIn);
  const pDj = 8791, pIn = 8792;
  const dj = spawn(PY, ['manage.py', 'runserver', `127.0.0.1:${pDj}`, '--noreload', '--nothreading'], {
    cwd: APPCLINIC, stdio: ['ignore', 'ignore', fs.openSync(path.join(tmp, 'django.log'), 'w')],
    env: Object.assign({}, process.env, { DJ_DB: dbDj, DJ_MEDIA: path.join(tmp, 'media-dj'), DJANGO_SETTINGS_MODULE: 'teste_settings',
      PYTHONPATH: `${R}/tools/comparacao:${APPCLINIC}`, PYTHONIOENCODING: 'utf-8', LANG: 'pt_BR.UTF-8' }),
  });
  Object.assign(process.env, { DB_CLIENT: 'better-sqlite3', DB_FILE: dbIn, SECRET_KEY: 'x'.repeat(40), DEBUG: '', DB_NAME: 'inno', MEDIA_ROOT: path.join(tmp, 'media-inno') });
  filhos.push(dj);
  const app = require(R + '/server/index.js');
  const srv = await new Promise((ok) => { const s = app.listen(pIn, () => ok(s)); });
  await espera(`http://127.0.0.1:${PORTA_EVO}/__log`);
  await espera(`http://127.0.0.1:${pDj}/login/`);
  let total = 0;
  for (const [nome, base, arq] of [['AppClinic', `http://127.0.0.1:${pDj}`, dbDj], ['Inno', `http://127.0.0.1:${pIn}`, dbIn]]) {
    console.log(`\n== ${nome}`);
    const f = await roteiro(base, arq, { admin: ['u', 's'], comum: ['comum', 's'], idAdmin: 1, idComum: 2, consultas: [2, 8] });
    console.log(f ? `${f} falha(s) no ${nome}` : `${nome}: tudo certo`);
    total += f;
  }
  if (process.env.SEGURA) await new Promise((r) => setTimeout(r, 600000));
  srv.close(); dj.kill(); evo.kill();
  if (total) console.log(`\n(log do Django: ${path.join(tmp, 'django.log')})`);
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
