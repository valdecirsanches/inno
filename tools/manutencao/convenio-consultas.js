#!/usr/bin/env node
'use strict';
/**
 * Consultas em aberto (de hoje em diante: AGENDADO, AGUARDANDO, ATENDIMENTO) com um convênio
 * diferente do que está hoje no cadastro do paciente. A consulta guarda o convênio do dia em que
 * foi marcada; até a versão 2.4.10, mudar o convênio no cadastro não atualizava as consultas já
 * marcadas, e o médico via o convênio antigo no atendimento.
 *
 *   node tools/manutencao/convenio-consultas.js            lista (não muda nada)
 *   node tools/manutencao/convenio-consultas.js --corrige  passa essas consultas para o convênio do cadastro
 *
 * Usa o banco do .env do Inno (o mesmo do AppClinic).
 */
const path = require('path');
process.chdir(path.join(__dirname, '..', '..'));
const db = require('../../server/db');

(async () => {
  const A = db.modelo('TbAgendaCons').tabela, P = db.modelo('TbPacientes').tabela, CV = db.modelo('TbConvenio').tabela;
  const ca = (x) => `${A}.${db.coluna('TbAgendaCons', x)}`;
  const cp = (x) => `${P}.${db.coluna('TbPacientes', x)}`;
  const l = await db.knex(A).innerJoin(P, ca('fk_paciente_id'), `${P}.id`)
    .leftJoin(`${CV} as cva`, ca('fk_convenio_id'), 'cva.id').leftJoin(`${CV} as cvp`, cp('fk_convenio_id'), 'cvp.id')
    .where(ca('data'), '>=', db.hoje()).whereIn(ca('status'), ['AGENDADO', 'AGUARDANDO', 'ATENDIMENTO'])
    .whereRaw(`coalesce(${ca('fk_convenio_id')}, 0) <> coalesce(${cp('fk_convenio_id')}, 0)`)
    .select({ id: `${A}.id`, data: ca('data'), status: ca('status'), pac: cp('paciente'), conv_consulta: 'cva.convenio', conv_cadastro: 'cvp.convenio', novo: cp('fk_convenio_id') })
    .orderBy(ca('data'));
  if (!l.length) console.log('Nenhuma consulta em aberto com convênio diferente do cadastro.');
  for (const x of l) {
    const d = x.data instanceof Date ? x.data.toISOString().slice(0, 10) : String(x.data).slice(0, 10);
    console.log(`consulta ${String(x.id).padEnd(8)} ${d} ${String(x.status).padEnd(11)} ${String(x.pac).slice(0, 34).padEnd(34)} ${x.conv_consulta || '-'} -> ${x.conv_cadastro || '-'}`);
  }
  if (l.length && process.argv.includes('--corrige')) {
    for (const x of l) await db.knex(A).where(`${A}.id`, x.id).update({ [db.coluna('TbAgendaCons', 'fk_convenio_id')]: x.novo || null });
    console.log(`\n${l.length} consulta(s) corrigida(s).`);
  } else if (l.length) console.log('\nPara corrigir: node tools/manutencao/convenio-consultas.js --corrige');
  await db.knex.destroy();
})().catch(async (e) => { console.error('Erro:', e.message); try { await db.knex.destroy(); } catch (x) { /* */ } process.exit(1); });
