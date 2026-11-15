// Base dos testes de rotas: SQLite com as tabelas do modelos.json e os dados de
// tools/impressos/dados.json, o Inno numa porta livre e um cliente com cookies/CSRF.
//   const t = await require('./base')({ env: {...} });
//   await t.entra();                       // login como 'u' / 's'
//   const r = await t.vai('/rota/', { method: 'POST', body: t.corpo({...}) });
//   t.sq                                   // o banco (better-sqlite3) para conferir
//   t.confere('nome', () => assert...)     // conta e mostra o que passou
//   await t.fim()
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = path.join(__dirname, '..', '..');

module.exports = async function base({ env = {}, antesDoServidor = null } = {}) {
  const arq = path.join(os.tmpdir(), `inno-teste-${process.pid}-${Date.now()}.sqlite3`);
  Object.assign(process.env, { DB_CLIENT: 'better-sqlite3', DB_FILE: arq, SECRET_KEY: 'x'.repeat(40), DEBUG: '', DB_NAME: 'teste' }, env);
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
    for (const o0 of linhas) {
      const o = Object.assign({}, o0);
      if (n === 'TbUsuario') Object.assign(o, { password: codifica('s'), email: '', last_name: '', is_staff: false, is_superuser: false, date_joined: '2020-01-01 00:00:00' });
      const k = Object.keys(o); const cs = k.map((a) => m.campos.find((c) => c.atributo === a).coluna);
      sq.prepare(`INSERT INTO "${m.tabela}" (${cs.map((c) => `"${c}"`).join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...k.map((x) => (typeof o[x] === 'boolean' ? +o[x] : o[x])));
    }
  }
  if (antesDoServidor) await antesDoServidor(sq);
  const app = require(R + '/server/index.js');
  const srv = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
  const B = `http://127.0.0.1:${srv.address().port}`;
  const ck = {};
  const cookies = () => Object.entries(ck).map(([k, v]) => `${k}=${v}`).join('; ');
  const guarda = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); ck[kv.slice(0, i)] = kv.slice(i + 1); } return r; };
  const vai = (u, o = {}) => fetch(B + u, Object.assign({ redirect: 'manual' }, o, {
    headers: Object.assign({ cookie: cookies(), 'x-csrftoken': ck.csrftoken || '', referer: B + '/', 'x-requested-with': 'XMLHttpRequest' },
      o.body && typeof o.body === 'string' && !o.json ? { 'content-type': 'application/x-www-form-urlencoded' } : {},
      o.json ? { 'content-type': 'application/json' } : {}, o.headers || {}),
  })).then(guarda);
  let ok = 0;
  const t = {
    sq, B, vai,
    corpo: (o) => new URLSearchParams(o).toString(),
    entra: async () => {
      await vai('/login/');
      const r = await vai('/login/', { method: 'POST', body: 'username=u&password=s', headers: { 'x-requested-with': '' } });
      if (r.status !== 302) throw new Error('login falhou');
    },
    confere: async (nome, f) => { await f(); ok++; console.log('ok -', nome); },
    fim: async (erro) => {
      if (erro) { console.error('FALHOU:', erro.message); process.exitCode = 1; } else console.log(`\n${ok} conferências ok`);
      srv.close();
      try { fs.unlinkSync(arq); } catch (e) { /* */ }
      setTimeout(() => process.exit(), 50);
    },
  };
  return t;
};
