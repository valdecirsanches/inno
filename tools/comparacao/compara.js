// Comparação lado a lado: AppClinic (Django) x Inno, cada um com uma cópia do mesmo banco SQLite.
// As mesmas requisições, na mesma ordem, nos dois; mostra onde as respostas diferem e,
// no fim, as tabelas que ficaram diferentes.
// Uso: node tools/comparacao/compara.js <pasta do appclinic> <python do venv com Django 3.2> [roteiro.js]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const R = path.join(__dirname, '..', '..');
const APPCLINIC = path.resolve(process.argv[2] || path.join(R, '..', 'appclinic'));
const PY = process.argv[3] || 'python3';
const ROTEIRO = require(path.resolve(process.argv[4] || path.join(__dirname, 'roteiro.js')));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compara-'));
const dbInno = path.join(tmp, 'inno.sqlite3');
const dbDj = path.join(tmp, 'django.sqlite3');
Object.assign(process.env, { DB_CLIENT: 'better-sqlite3', DB_FILE: dbInno, SECRET_KEY: 'x'.repeat(40), DEBUG: '', DB_NAME: 'inno', DB_HOST_EXIBIDO: 'localhost', MEDIA_ROOT: path.join(tmp, 'media-inno') });
const { montaBanco } = require(R + '/tools/testes/base.js');
const sq = montaBanco(dbInno);
// tabelas do próprio Django (auth/contenttypes) que o AppClinic consulta
sq.exec(`CREATE TABLE IF NOT EXISTS auth_group (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE IF NOT EXISTS auth_permission (id INTEGER PRIMARY KEY, name TEXT, content_type_id INTEGER, codename TEXT);
  CREATE TABLE IF NOT EXISTS auth_group_permissions (id INTEGER PRIMARY KEY, group_id INTEGER, permission_id INTEGER);
  CREATE TABLE IF NOT EXISTS django_content_type (id INTEGER PRIMARY KEY, app_label TEXT, model TEXT);`);
if (ROTEIRO.prepara) ROTEIRO.prepara(sq);
sq.close();
fs.copyFileSync(dbInno, dbDj);

const porta = () => new Promise((ok) => { const s = require('net').createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

function cliente(base) {
  const ck = {};
  const cookies = () => Object.entries(ck).map(([k, v]) => `${k}=${v}`).join('; ');
  return async (metodo, url, { corpo = null, json = false, headers = {} } = {}) => {
    const h = Object.assign({ cookie: cookies(), 'x-csrftoken': ck.csrftoken || '', referer: base + '/', accept: 'text/html,application/json' }, headers);
    if (corpo !== null) h['content-type'] = json ? 'application/json' : 'application/x-www-form-urlencoded';
    const r = await fetch(base + url, { method: metodo, headers: h, body: corpo === null ? undefined : (json ? JSON.stringify(corpo) : new URLSearchParams(corpo).toString()), redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const v = kv.slice(i + 1); if (v === '""' || v === '') delete ck[kv.slice(0, i)]; else ck[kv.slice(0, i)] = v; }
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, tipo: (r.headers.get('content-type') || '').split(';')[0], local: r.headers.get('location'), corpo: buf };
  };
}

/** tira o que muda a cada execução (tokens, portas, horário de agora) */
function normaliza(t, portas) {
  let s = t;
  for (const p of portas) s = s.split(`127.0.0.1:${p}`).join('HOST').split(`localhost:${p}`).join('HOST');
  s = s.replace(/name="csrfmiddlewaretoken" value="[^"]*"/g, 'name="csrfmiddlewaretoken" value="X"');
  s = s.replace(/csrf_?[Tt]oken["']?\s*[:=]\s*["'][^"']*["']/g, 'csrftoken="X"');
  const hoje = new Date();
  const d2 = (n) => String(n).padStart(2, '0');
  const iso = `${hoje.getFullYear()}-${d2(hoje.getMonth() + 1)}-${d2(hoje.getDate())}`;
  s = s.replace(new RegExp(`${iso}[T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?`, 'g'), 'AGORA');
  s = s.replace(new RegExp(`${d2(hoje.getDate())}/${d2(hoje.getMonth() + 1)}/${hoje.getFullYear()} \\d{2}:\\d{2}(:\\d{2})?`, 'g'), 'AGORA');
  s = s.replace(/\d{2}:\d{2}:\d{2}\.\d{6}/g, 'HH:MM:SS.US');
  return s;
}

/** primeira diferença entre dois textos, com contexto */
function difere(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return null;
  const ctx = (s) => JSON.stringify(s.slice(Math.max(0, i - 80), i + 120));
  return `posição ${i}\n      django: ${ctx(a)}\n      inno:   ${ctx(b)}`;
}

(async () => {
  const [pDj, pIn] = [await porta(), await porta()];
  const dj = spawn(PY, ['manage.py', 'runserver', `127.0.0.1:${pDj}`, '--noreload', '--nothreading'], {
    cwd: APPCLINIC,
    env: Object.assign({}, process.env, { DJ_DB: dbDj, DJ_MEDIA: path.join(tmp, 'media-dj'), DJANGO_SETTINGS_MODULE: 'teste_settings', PYTHONPATH: `${__dirname}:${APPCLINIC}`, PYTHONIOENCODING: 'utf-8', LANG: 'pt_BR.UTF-8' }),
    stdio: ['ignore', 'ignore', fs.openSync(path.join(tmp, 'django.log'), 'w')],
  });
  const app = require(R + '/server/index.js');
  const srv = await new Promise((ok) => { const s = app.listen(pIn, () => ok(s)); });
  for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${pDj}/login/`); break; } catch (e) { await new Promise((r) => setTimeout(r, 300)); } }

  const D = cliente(`http://127.0.0.1:${pDj}`);
  const I = cliente(`http://127.0.0.1:${pIn}`);
  const portas = [pDj, pIn];
  let iguais = 0;
  const difs = [];
  // banco conferido a cada passo: mostra o primeiro passo em que cada tabela diverge
  const Database = require(R + '/node_modules/better-sqlite3');
  const [x, y] = [new Database(dbDj, { readonly: true }), new Database(dbInno, { readonly: true })];
  const tabelas = x.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  const IGNORA = new Set(['tb_usuarios_log', 'tbWhatsappLog', 'tb_usuarios_opcoes']);
  const linhasDe = (db, t) => {
    const cols = x.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
    return db.prepare(`SELECT * FROM "${t}" ORDER BY 1`).all().map((l) => normaliza(JSON.stringify(cols.map((c) => (typeof l[c] === 'number' ? l[c] : l[c] === null ? null : String(l[c]).replace(/\.0+$/, '')))), []));
  };
  const jaDivergiu = new Set();
  const divergencias = [];
  for (const passo of ROTEIRO.passos()) {
    const [metodo, url, opc] = passo;
    let a, b;
    try { a = await D(metodo, url, opc); } catch (e) { a = { status: 'ERRO ' + e.message, corpo: Buffer.from('') }; }
    try { b = await I(metodo, url, opc); } catch (e) { b = { status: 'ERRO ' + e.message, corpo: Buffer.from('') }; }
    const binario = (x) => /pdf|image|octet/.test(x.tipo || '');
    const ta = binario(a) ? `<${a.tipo} ${a.corpo.length} bytes>` : normaliza(a.corpo.toString('utf8'), portas);
    const tb = binario(b) ? `<${b.tipo} ${b.corpo.length} bytes>` : normaliza(b.corpo.toString('utf8'), portas);
    const problemas = [];
    if (a.status !== b.status) problemas.push(`status ${a.status} x ${b.status}`);
    if (a.status < 500 && b.status < 500) {   // nas páginas de erro só o status importa
      if ((a.local || '') !== (b.local || '')) problemas.push(`redireciona ${a.local} x ${b.local}`);
      if (!binario(a) || !binario(b)) { const d = difere(ta, tb); if (d) problemas.push('corpo ' + d); }
      else if (a.tipo !== b.tipo) problemas.push(`tipo ${a.tipo} x ${b.tipo}`);
    }
    if (problemas.length) difs.push(`${metodo} ${url}\n    ${problemas.join('\n    ')}`); else iguais++;
    for (const t of tabelas) {
      if (jaDivergiu.has(t) || IGNORA.has(t)) continue;
      const [la, lb] = [linhasDe(x, t), linhasDe(y, t)];
      if (JSON.stringify(la) !== JSON.stringify(lb)) {
        jaDivergiu.add(t);
        const so = (p, q) => p.filter((l) => !q.includes(l));
        divergencias.push(`${t} diverge depois de ${metodo} ${url.slice(0, 160)}\n      só no django: ${so(la, lb).slice(0, 2).join('\n                    ').slice(0, 600)}\n      só no inno:   ${so(lb, la).slice(0, 2).join('\n                    ').slice(0, 600)}`);
      }
    }
  }
  console.log(`\n${iguais} respostas iguais, ${difs.length} diferentes\n`);
  for (const d of difs) console.log('✗ ' + d + '\n');
  console.log(divergencias.length ? `Tabelas que divergiram:\n  ${divergencias.join('\n  ')}` : 'Banco igual em todos os passos (fora logs e preferências).');
  console.log(`\n(log do Django: ${path.join(tmp, 'django.log')})`);
  dj.kill(); srv.close();
  setTimeout(() => process.exit(0), 100);
})();
