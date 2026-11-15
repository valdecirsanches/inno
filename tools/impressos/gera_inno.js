// Gera os PDFs do Inno com os dados de dados.json (SQLite) e grava em out/<nome>.inno.pdf
// Uso (na raiz do inno, com as dependências de desenvolvimento): node tools/impressos/gera_inno.js [nomes...]
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const arq = path.join(OUT, 'teste.sqlite3'); try { fs.unlinkSync(arq); } catch (e) {}
Object.assign(process.env, { DB_CLIENT: 'better-sqlite3', DB_FILE: arq, SECRET_KEY: 'x'.repeat(40), DEBUG: '1', DB_NAME: 'teste' });
const M = require(R + '/server/modelos.json');
const D = require('./dados.json');
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
    if (n === 'TbUsuario') o.password = codifica('s');
    const k = Object.keys(o); const cs = k.map((a) => m.campos.find((c) => c.atributo === a).coluna);
    sq.prepare(`INSERT INTO "${m.tabela}" (${cs.map((c) => `"${c}"`).join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...k.map((x) => (typeof o[x] === 'boolean' ? +o[x] : o[x])));
  }
}
const app = require(R + '/server/index.js');
const srv = app.listen(0, async () => {
  const B = `http://127.0.0.1:${srv.address().port}`;
  const ck = {};
  const cookies = () => Object.entries(ck).map(([k, v]) => `${k}=${v}`).join('; ');
  const guarda = (r) => { for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); ck[kv.slice(0, i)] = kv.slice(i + 1); } };
  await fetch(B + '/login/').then(guarda);
  const r = await fetch(B + '/login/', { method: 'POST', redirect: 'manual', headers: { cookie: cookies(), 'content-type': 'application/x-www-form-urlencoded', 'x-csrftoken': ck.csrftoken, referer: B + '/login/' }, body: 'username=u&password=s' });
  guarda(r);
  const alvos = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(URLS);
  for (const n of alvos) {
    const t0 = Date.now();
    const x = await fetch(B + URLS[n], { headers: { cookie: cookies() } });
    const b = Buffer.from(await x.arrayBuffer());
    if (x.headers.get('content-type') === 'application/pdf') fs.writeFileSync(path.join(OUT, `${n}.inno.pdf`), b);
    console.log(n, x.status, x.headers.get('content-type'), x.headers.get('content-disposition'), b.length, `${Date.now() - t0}ms`, x.status !== 200 ? b.toString().slice(0, 400) : '');
  }
  srv.close(); process.exit(0);
});
const URLS = {
  ficha: '/cadastros/paciente/ImprimeFicha/?id=1', recibo: '/cadastros/paciente/ImprimeRecibo/?id=1',
  agenda: '/agenda/consultas/ImprimeAgenda/?medico=0&dt=2026-11-10', convenio: '/cadastros/convenio/ImprimirAtendimentos?dt=2026-11-10&md=1',
  atestado: '/atendimento/ImprimeAtestado/?id_atestado=1', exame: '/atendimento/ImprimeExame/?id_exame=1',
  relatorio: '/atendimento/ImprimeRelatorio/?id_relatorio=1', prescricao: '/atendimento/ImprimePrescricao/?id_prescricao=1',
  prescricao2: '/atendimento/ImprimePrescricao/?id_prescricao=2', prontuario: '/atendimento/ImprimeProntuario/?id_prontuario=1', agenda1: '/agenda/consultas/ImprimeAgenda/?medico=1&dt=2026-11-10', agendaVazia: '/agenda/consultas/ImprimeAgenda/?medico=0&dt=2020-01-01', atestadoX: '/atendimento/ImprimeAtestado/?id_atestado=99', fichaX: '/cadastros/paciente/ImprimeFicha/?id=abc', ficha2: '/cadastros/paciente/ImprimeFicha/?id=2', prontuario2: '/atendimento/ImprimeProntuario/?id_prontuario=2',
};
