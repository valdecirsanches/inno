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
    await t.fim();
  } catch (e) { await t.fim(e); }
})();
