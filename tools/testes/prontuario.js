// Prontuário: correções da revisão de 2.4.4 (pesquisa de paciente sem clínica, padrões, anamnese)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', '..');
(async () => {
  const t = await require('./base')({ antesDoServidor: (sq) => sq.exec('UPDATE paciente SET id_clinica = NULL WHERE id = 1') });
  try {
    await t.entra();
    let r = await t.vai('/cadastros/paciente/LocalizaPaciente/?pac=Ana');
    const l = await r.json();
    await t.confere('pesquisa de paciente sem clínica não dá erro', () => { assert.equal(r.status, 200); assert.ok(l.length >= 1); assert.equal(l[0].clinica, ''); });
    const js = (f) => fs.readFileSync(path.join(R, 'static/javascripts/Prontuario', f), 'utf8');
    await t.confere('padrões sem showInputError (sweetalert antigo)', () => {
      for (const f of ['Exames/Exames.js', 'Prescricoes/Prescricoes.js', 'Relatorios/Relatorios.js']) assert.ok(!/showInputError/.test(js(f)), f);
    });
    await t.confere('anamnese não recarrega com o paciente que a resposta não traz', () => assert.ok(!/CarregaAnamnese\(data\.success\.paciente\)/.test(js('Anamnese/Anamnese.js'))));
    // salvar como padrão: nome repetido e registro inexistente respondem com erro (antes: 500 mudo)
    for (const [url, par] of [['/configuracoes/exames/AdicionaConfExamePadrao/', 'exame'], ['/configuracoes/prescricoes/AdicionaConfPrescricaoPadrao/', 'prescricao'], ['/configuracoes/relatorios/AdicionaConfRelatorio/', 'relatorio']]) {
      const vai = async (o) => { const x = await t.vai(url + '?' + t.corpo(o)); return [x.status, await x.text()]; };
      const a = await vai({ descricao: 'teste1', [par]: '1' });
      const b = await vai({ descricao: 'teste1', [par]: '1' });
      const c = await vai({ descricao: 'teste9', [par]: '0' });
      await t.confere(`${par}: padrão novo, repetido e sem registro`, () => {
        assert.deepEqual(a, [200, '{"success": 1}']);
        assert.deepEqual(b, [200, '{"error": "existe"}']);
        assert.deepEqual(c, [200, '{"error": "salve"}']);
      });
    }
    // usuário sem médico vinculado e prescrição com "controle especial" vazio (antes: erro 500)
    t.sq.exec('UPDATE tb_usuarios SET id_medico = NULL WHERE id = 1');
    t.sq.exec('UPDATE tb_prescricoes SET cont_esp = NULL, fk_medico_id = 1 WHERE id = 1');
    let x = await t.vai('/configuracoes/prescricoes/AdicionaConfPrescricaoPadrao/?' + t.corpo({ descricao: 'sem medico', prescricao: '1' }));
    const xs = [x.status, await x.text()];
    const cp = t.sq.prepare("SELECT * FROM tb_conf_prescricoes WHERE nome = 'sem medico'").get();
    x = await t.vai('/configuracoes/prescricoes/CarregaConfPrescricoes/');
    const lista = (await x.json()).map((i) => i.nome);
    t.sq.exec('UPDATE tb_prescricoes SET fk_medico_id = NULL WHERE id = 1');
    x = await t.vai('/configuracoes/prescricoes/AdicionaConfPrescricaoPadrao/?' + t.corpo({ descricao: 'sem medico 2', prescricao: '1' }));
    const xs2 = await x.text();
    await t.confere('prescrição padrão de usuário sem médico: usa o médico da prescrição', () => {
      assert.deepEqual(xs, [200, '{"success": 1}']);
      assert.equal(cp.fk_medico_id, 1); assert.equal(cp.cont_esp, 0);
      assert.ok(lista.includes('sem medico'), 'aparece na lista');
      assert.equal(xs2, '{"error": "medico"}');
    });
    // usuário sem médico: o padrão de relatório/exame aparece na lista; exame/padrão sem CID abre
    {
      let y = await t.vai('/configuracoes/relatorios/AdicionaConfRelatorio/?' + t.corpo({ descricao: 'rel sem medico', relatorio: '1' }));
      const r1 = await y.text();
      y = await t.vai('/configuracoes/relatorios/CarregaConfRelatorios/');
      const lr = (await y.json()).map((i) => i.nome);
      y = await t.vai('/configuracoes/exames/CarregaConfExames/');
      const le = (await y.json()).map((i) => i.nome);
      t.sq.exec('UPDATE tb_exames SET cid10 = NULL WHERE id = 1');
      y = await t.vai('/prontuario/Exames/CarregaExame/?exames=1');
      const e1 = y.status;
      t.sq.exec("UPDATE tb_conf_exames SET cid10 = NULL WHERE nome = 'teste1'");
      const ce = t.sq.prepare("SELECT id FROM tb_conf_exames WHERE nome = 'teste1'").get().id;
      y = await t.vai('/configuracoes/exames/CarregaConfExame/?exames=' + ce);
      const e2 = y.status;
      await t.confere('usuário sem médico vê os padrões; exame e padrão sem CID abrem', () => {
        assert.equal(r1, '{"success": 1}');
        assert.ok(lr.includes('rel sem medico') && lr.includes('teste1'), JSON.stringify(lr));
        assert.ok(le.includes('teste1'), JSON.stringify(le));
        assert.equal(e1, 200); assert.equal(e2, 200);
      });
    }
    // exclusões com filhos (no MySQL davam "Cannot delete or update a parent row")
    {
      const n = (sql) => t.sq.prepare(sql).get().n;
      t.sq.exec("INSERT INTO tb_conf_prescricao_remedios (fk_prescricao_id, nome) SELECT id, 'R1' FROM tb_conf_prescricoes WHERE nome = 'sem medico'");
      const cid = t.sq.prepare("SELECT id FROM tb_conf_prescricoes WHERE nome = 'sem medico'").get().id;
      let y = await t.vai('/configuracoes/prescricoes/ExcluiConfPrescricao/?id=' + cid);
      const y1 = await y.text();
      t.sq.exec("INSERT INTO tb_prescricao_remedios (fk_prescricao_id, nome) VALUES (1, 'R2')");
      y = await t.vai('/api/prescricao/1/', { method: 'DELETE' });
      const y2 = y.status;
      t.sq.exec('UPDATE tb_extra SET fk_exames_id = 1 WHERE id = (SELECT min(id) FROM tb_extra)');
      const extras = n('SELECT count(*) n FROM tb_extra');
      y = await t.vai('/api/exames/1/', { method: 'DELETE' });
      const y3 = y.status;
      await t.confere('excluir padrão/prescrição apaga os remédios; excluir exame mantém o anexo', () => {
        assert.equal(y1, '{"success": "OK"}');
        assert.equal(n(`SELECT count(*) n FROM tb_conf_prescricao_remedios WHERE fk_prescricao_id = ${cid}`), 0);
        assert.equal(y2, 204); assert.equal(n('SELECT count(*) n FROM tb_prescricao_remedios WHERE fk_prescricao_id = 1'), 0);
        assert.equal(y3, 204); assert.equal(n('SELECT count(*) n FROM tb_extra'), extras);
        assert.equal(n('SELECT count(*) n FROM tb_extra WHERE fk_exames_id = 1'), 0);
      });
    }
    // excluir anexo: antes o log falhava ("FieldFile is not JSON serializable") e nada era apagado
    {
      t.sq.exec("INSERT INTO tb_extra (id, fk_prontuario_id, file, data_salvo) VALUES (777, 1, 'extras/1/x.png', '2026-11-18 08:00:00')");
      const y = await t.vai('/prontuario/Extras/uploadFile.json', { method: 'DELETE', body: t.corpo({ doc: '777' }) });
      const ty = await y.text();
      const log = t.sq.prepare("SELECT data FROM tb_usuarios_log WHERE model_name = 'TbExtra' ORDER BY id DESC").get();
      await t.confere('excluir anexo apaga o registro (e registra no log com o caminho)', () => {
        assert.equal(ty, '{"success": 1}');
        assert.equal(t.sq.prepare('SELECT count(*) n FROM tb_extra WHERE id = 777').get().n, 0);
        assert.ok(log && /extras\/1\/x.png/.test(log.data), JSON.stringify(log));
      });
    }
    // convênio mudado no cadastro: consultas em aberto passam para o novo; atendidas não
    {
      const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
      t.sq.prepare("UPDATE tb_agendas SET data = ?, status = 'AGENDADO', id_paciente = 1, id_convenio = 1 WHERE id = 3").run(hoje);
      t.sq.prepare("UPDATE tb_agendas SET data = '2026-01-02', status = 'ATENDIDO', id_paciente = 1, id_convenio = 1 WHERE id = 1").run();
      t.sq.exec('UPDATE paciente SET id_convenio = 1 WHERE id = 1');
      let r = await t.vai('/cadastros/paciente/CarregaPaciente/?paciente=1');
      const campos = {};
      for (const [k, v] of Object.entries((await r.json()).success.fields)) campos[k.replace(/^id_/, '')] = v === 'None' ? '' : v;
      campos.fk_convenio = '2';
      r = await t.vai('/cadastros/paciente/SalvaPaciente/', { method: 'POST', body: t.corpo({ paciente: '1', form: t.corpo(campos) }) });
      await r.text();
      const c = (id) => t.sq.prepare('SELECT id_convenio c FROM tb_agendas WHERE id = ?').get(id).c;
      await t.confere('convênio mudado no cadastro vai para as consultas em aberto', () => { assert.equal(c(3), 2); assert.equal(c(1), 1); });
      // consulta marcada antes com outro convênio: ao abrir o atendimento, passa para o do cadastro
      t.sq.exec('UPDATE tb_agendas SET id_convenio = 1 WHERE id = 3');
      r = await t.vai('/atendimento/IniciaAtendimento/?consulta=3');
      const ini = await r.json();
      const nome2 = t.sq.prepare('SELECT convenio FROM convenio WHERE id = 2').get().convenio;
      await t.confere('abrir o atendimento mostra (e grava) o convênio do cadastro', () => { assert.equal(ini.success.convenio, nome2); assert.equal(c(3), 2); assert.equal(c(1), 1); });
    }
    // imprimir prescrição/exame/relatório sem médico gravado, por usuário sem médico: usa o da consulta
    {
      t.sq.exec('UPDATE tb_usuarios SET id_medico = NULL WHERE id = 1');
      const out = [];
      for (const [tb, url, par] of [['tb_prescricoes', 'ImprimePrescricao', 'id_prescricao'], ['tb_relatorios', 'ImprimeRelatorio', 'id_relatorio']]) {
        const id = t.sq.prepare(`SELECT id FROM ${tb} ORDER BY id LIMIT 1`).get().id;
        t.sq.prepare(`UPDATE ${tb} SET fk_medico_id = NULL, fk_consulta_id = 3 WHERE id = ?`).run(id);
        const r = await t.vai(`/atendimento/${url}/?${par}=${id}`);
        out.push([url, r.status, r.headers.get('content-type')]);
      }
      for (const [url, tb] of [['/prontuario/prescricoes/UtilizaConfPrescricao/', 'tb_prescricoes'], ['/prontuario/Relatorios/UtilizaConfRelatorio/', 'tb_relatorios']]) {
        const conf = t.sq.prepare(`SELECT id FROM ${tb.replace('tb_', 'tb_conf_')} ORDER BY id LIMIT 1`).get();
        if (!conf) continue;
        const r = await t.vai(url + '?' + t.corpo({ conf: String(conf.id), prontuario: '1', consulta: '3' }));
        const id = (await r.json()).success;
        out.push([url, r.status, 'pdf', t.sq.prepare(`SELECT fk_medico_id m FROM ${tb} WHERE id = ?`).get(id).m]);
      }
      await t.confere('padrão aplicado por usuário sem médico fica com o médico da consulta', () => {
        for (const [u, , , m] of out.filter((x) => x.length === 4)) assert.ok(m, u);
      });
      await t.confere('impressão sem médico gravado usa o médico da consulta', () => {
        for (const [u, st, ct] of out) { assert.equal(st, 200, u); assert.match(ct, /pdf/, u); }
      });
    }
    await t.fim();
  } catch (e) { await t.fim(e); }
})();
