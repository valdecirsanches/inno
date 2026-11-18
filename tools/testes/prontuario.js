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
    await t.fim();
  } catch (e) { await t.fim(e); }
})();
