// Tela: atendimento > aba Atestado > clicar no atestado da lista > conferir o CID > Imprimir.
module.exports = {
  prepara(sq) {
    sq.exec(`UPDATE tb_atestado SET cid = 'M54,A00', fk_consulta_id = 1, id_usuario = 1, requerente = 'Empresa X'`);
    sq.exec(`INSERT INTO tb_atestado (id, fk_prontuario_id, fk_medico_id, fk_consulta_id, id_usuario, requerente, dt_referencia, hora_chegada, hora_saida, para, volta, afastado_por, cid, data_salvo)
             VALUES (2, 1, 1, 1, 1, '', '2026-11-12', '10:00:00', '10:40:00', 'C', 'A', NULL, 'M54', '2026-11-12 10:45:00')`);
  },
  async executa(pg, base, espera) {
    const out = {};
    await pg.goto(base + '/atendimento/?consulta=1', { waitUntil: 'networkidle0' });
    await espera(1500);
    await pg.click('#li_atestado a');
    await espera(1500);
    const cid = () => pg.evaluate(() => ({
      valor: $('.classAtestado [name=cid]').val(),
      tela: $('.classAtestado [name=cid]').next('.select2').find('.select2-selection__rendered').text().replace(/\s+/g, ' ').trim(),
      objeto_cid: (typeof atestado !== 'undefined' && atestado.object) ? atestado.object.cid : null,
      linhas: $('#tabelaAtestados tbody tr').length,
    }));
    out['ao abrir a aba'] = await cid();
    for (const n of [1, 2]) {
      const linhas = await pg.$$('#tabelaAtestados tbody tr');
      if (linhas[n - 1]) {
        await linhas[n - 1].click();
        await espera(2000);
        out[`depois de clicar na linha ${n}`] = await cid();
      }
    }
    const linhas = await pg.$$('#tabelaAtestados tbody tr');
    if (linhas[0]) { await linhas[0].click(); await espera(2000); }
    // o window.open depois do salvamento (await) é bloqueado como pop-up no navegador de
    // teste: registra o endereço e busca com a mesma sessão
    await pg.evaluate(() => { window.__abertas = []; window.open = (u) => { window.__abertas.push(u); return null; }; });
    await pg.click('#ImprimeAtestado').catch((e) => { out.imprimir = 'não deu para clicar: ' + e.message; });
    await espera(4000);
    const abertas = await pg.evaluate(() => window.__abertas.map((u) => new URL(u, location.href).href));
    out['impressão abriria'] = abertas.map((u) => u.replace(base, ''));
    for (const u of abertas) {
      out['resposta da impressão'] = await pg.evaluate(async (x) => {
        const r = await fetch(x);
        const t = r.headers.get('content-type') || '';
        return `${r.status} ${t} ${/pdf/.test(t) ? '(PDF)' : (await r.text()).slice(0, 200)}`;
      }, u);
    }
    out['depois de imprimir'] = await cid();
    return out;
  },
};
