#!/usr/bin/env node
'use strict';
/**
 * Usuários desativados (is_active = 0). Até a versão 2.4.3, salvar um usuário pela tela de
 * Usuários desativava a conta sem querer; esta ferramenta lista quem está inativo e reativa
 * só os que você escolher.
 *
 *   node tools/manutencao/usuarios-inativos.js               lista (não muda nada)
 *   node tools/manutencao/usuarios-inativos.js --reativa 3,7  reativa os ids 3 e 7
 *
 * Usa o banco do .env do Inno (o mesmo do AppClinic).
 */
const path = require('path');
process.chdir(path.join(__dirname, '..', '..'));
const db = require('../../server/db');

(async () => {
  const U = 'TbUsuario';
  const col = (c) => db.coluna(U, c);
  const i = process.argv.indexOf('--reativa');
  if (i > 0) {
    const ids = String(process.argv[i + 1] || '').split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0);
    if (!ids.length) throw new Error('informe os ids: --reativa 3,7');
    const n = await db.tabela(U).whereIn(col('id'), ids).update({ [col('is_active')]: 1 });
    console.log(`${n} usuário(s) reativado(s): ${ids.join(', ')}`);
  } else {
    const l = db.linhas(U, await db.tabela(U).where(col('is_active'), 0).orderBy(col('id')));
    if (!l.length) console.log('Nenhum usuário inativo.');
    for (const u of l) {
      console.log(`id ${String(u.id).padEnd(5)} login ${String(u.login).padEnd(16)} ${String(u.first_name || u.nome || '').padEnd(30)} último acesso: ${u.last_login ? new Date(u.last_login).toLocaleString('pt-BR') : 'nunca'}`);
    }
    if (l.length) console.log('\nPara reativar: node tools/manutencao/usuarios-inativos.js --reativa <ids separados por vírgula>');
  }
  await db.knex.destroy();
})().catch(async (e) => { console.error('Erro:', e.message); try { await db.knex.destroy(); } catch (x) { /* */ } process.exit(1); });
