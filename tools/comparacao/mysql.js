// Modo MySQL do comparador (MYSQL=1): os dois sistemas sobre MySQL/MariaDB, como no servidor.
// Cria dois bancos (cmp_django e cmp_inno) com as tabelas do modelos.json e os dados de teste.
const path = require('path');
const R = path.join(__dirname, '..', '..');
const mysql = require(R + '/node_modules/mysql2/promise');
const M = require(R + '/server/modelos.json');
const D = require(R + '/tools/impressos/dados.json');

const CFG = { host: process.env.MYSQL_HOST || '127.0.0.1', user: process.env.MYSQL_USER || 'teste', password: process.env.MYSQL_PASSWORD || 'teste', multipleStatements: true, dateStrings: true };

function tipo(c) {
  switch (c.tipo) {
    case 'AutoField': case 'BigAutoField': return 'INT AUTO_INCREMENT';
    case 'IntegerField': case 'PositiveIntegerField': case 'PositiveSmallIntegerField': case 'ForeignKey': return c.pk ? 'INT AUTO_INCREMENT' : 'INT';
    case 'CharField': case 'GenericIPAddressField': return `VARCHAR(${c.max || 255})`;
    case 'FileField': return `VARCHAR(${c.max || 100})`;
    case 'TextField': return 'LONGTEXT';
    case 'DateField': return 'DATE';
    case 'TimeField': return 'TIME(6)';
    case 'DateTimeField': return 'DATETIME(6)';
    case 'DecimalField': return `DECIMAL(${c.max || 10},${c.casas === undefined ? 2 : c.casas})`;
    case 'FloatField': return 'DOUBLE';
    case 'BooleanField': return 'TINYINT(1)';
    case 'JSONField': return 'JSON';
    default: return 'LONGTEXT';
  }
}

async function cria(nomes, prepara) {
  const cx = await mysql.createConnection(CFG);
  for (const n of nomes) await cx.query(`DROP DATABASE IF EXISTS ${n}; CREATE DATABASE ${n} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`);
  const [principal, ...copias] = nomes;
  await cx.query(`USE ${principal}`);
  for (const m of Object.values(M)) {
    const cols = m.campos.map((c) => `\`${c.coluna}\` ${tipo(c)}${c.pk ? ' PRIMARY KEY' : ''}`);
    await cx.query(`CREATE TABLE IF NOT EXISTS \`${m.tabela}\` (${cols.join(', ')})`);
  }
  await cx.query(`CREATE TABLE auth_group (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150));
    CREATE TABLE auth_permission (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), content_type_id INT, codename VARCHAR(100));
    CREATE TABLE auth_group_permissions (id INT AUTO_INCREMENT PRIMARY KEY, group_id INT, permission_id INT);
    CREATE TABLE django_content_type (id INT AUTO_INCREMENT PRIMARY KEY, app_label VARCHAR(100), model VARCHAR(100));`);
  const { codifica } = require(R + '/server/seguranca/senhas');
  for (const [n, linhas] of Object.entries(D)) {
    const m = M[n];
    for (const o0 of linhas) {
      const o = Object.assign({}, o0);
      if (n === 'TbUsuario') Object.assign(o, { password: codifica('s'), email: '', last_name: '', is_staff: false, is_superuser: false, date_joined: '2020-01-01 00:00:00' });
      const k = Object.keys(o); const cs = k.map((a) => m.campos.find((c) => c.atributo === a).coluna);
      await cx.query(`INSERT INTO \`${m.tabela}\` (${cs.map((c) => `\`${c}\``).join(',')}) VALUES (${k.map(() => '?').join(',')})`, k.map((x) => o[x]));
    }
  }
  if (prepara) {
    // o prepara dos roteiros fala como o better-sqlite3 (exec / prepare().run): enfileira
    const fila = [];
    prepara({ exec: (s) => fila.push([s, []]), prepare: (s) => ({ run: (...a) => fila.push([s, a]) }) });
    for (const [s, a] of fila) await cx.query(s.replace(/"(\w+)"/g, '`$1`'), a);
  }
  const [tabs] = await cx.query('SHOW TABLES');
  const tabelas = tabs.map((t) => Object.values(t)[0]);
  for (const c of copias) {
    for (const t of tabelas) await cx.query(`CREATE TABLE ${c}.\`${t}\` LIKE ${principal}.\`${t}\`; INSERT INTO ${c}.\`${t}\` SELECT * FROM ${principal}.\`${t}\`;`);
  }
  await cx.end();
  return tabelas;
}

/** leitor de tabela para a conferência passo a passo */
async function leitor(banco) {
  const cx = await mysql.createConnection(Object.assign({}, CFG, { database: banco }));
  return {
    linhas: async (t) => (await cx.query(`SELECT * FROM \`${t}\` ORDER BY 1`))[0],
    fecha: () => cx.end(),
  };
}

module.exports = { cria, leitor, CFG };
