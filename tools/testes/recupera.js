'use strict';
// tools/nuvem/recupera-imagens.js: pastas antigas -> nuvem + Imagens e anexos do paciente.
//   node tools/testes/recupera.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const arquivos = new Map();
let seq = 0;
function nuvemFalsa() {
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'POST' && u.pathname === '/upload') {
      const f = (await new Request('http://x/upload', { method: 'POST', headers: req.headers, body: req, duplex: 'half' }).formData()).get('file');
      const id = `${Date.now()}-${(++seq).toString(36)}`;
      arquivos.set(id, Buffer.from(await f.arrayBuffer()));
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, id }));
    }
    const m = u.pathname.match(/^\/download\/([^/]+)$/);
    if (m && arquivos.has(m[1])) { res.writeHead(200); return res.end(arquivos.get(m[1])); }
    res.writeHead(404); res.end('Não existe');
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

(async () => {
  const nv = await nuvemFalsa();
  const URLN = `http://127.0.0.1:${nv.address().port}`;
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'recupera-'));
  const escreve = (rel, txt, data) => {
    const f = path.join(raiz, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, txt);
    if (data) fs.utimesSync(f, data, data);
  };
  // pasta 1 (como .../media/extra): paciente 1 com ano/mês/dia e arquivo solto; paciente 999 não existe
  escreve('extra/1/2023/03/05/raio x.png', 'png do paciente 1');
  escreve('extra/1/laudo.pdf', 'pdf solto', new Date(2022, 6, 9, 14, 30, 0));
  escreve('extra/999/foto.jpg', 'paciente que não existe');
  escreve('extra/solto.txt', 'fora de pasta de paciente');
  // pasta 2: cópia do mesmo raio x (não pode duplicar) e uma nova do paciente 2
  escreve('outro/1/copia.png', 'png do paciente 1');
  escreve('outro/2/exame.jpg', 'jpg do paciente 2');
  // pasta 3: uma media/extras do AppClinic, com arquivo que já tem registro no banco
  escreve('extras/1/2024/01/02/ja_registrado.png', 'png já registrado');
  const env = { NUVEM_URL: URLN, NUVEM_TIPO: 'simples', MEDIA_ROOT: path.join(raiz, 'media-vazia') };
  const t = await require('./base')({ env });
  const roda = (...a) => new Promise((ok, erro) => execFile(process.execPath, ['tools/nuvem/recupera-imagens.js', ...a],
    { env: Object.assign({}, process.env, env), encoding: 'utf8' }, (e, out, err) => (e && e.code !== 2 ? erro(new Error(out + err)) : ok(out))));
  const extras = (pac) => t.sq.prepare('select file, fk_consulta_id, data_salvo from tb_extra where fk_prontuario_id = ? order by id').all(pac);
  const pastas = [path.join(raiz, 'extra'), path.join(raiz, 'outro'), path.join(raiz, 'extras')];
  try {
    await t.entra();
    t.sq.prepare("insert into tb_extra (fk_prontuario_id, fk_consulta_id, fk_medico_id, file, ativo, data_salvo) values (1, 42, 1, 'extras/1/2024/01/02/ja_registrado.png', 1, '2024-01-02 10:00:00')").run();
    const antes1 = extras(1).length;
    await t.confere('simulação mostra e não grava nada', async () => {
      const out = await roda('--simular', ...pastas);
      assert.match(out, /3 seriam recuperados/);
      assert.match(out, /1 já estavam no prontuário/);
      assert.match(out, /1 já tinham registro no prontuário: seriam copiados para a nuvem com o mesmo caminho/);
      assert.match(out, /pacientes que não existem no cadastro \(ids: 999\)/);
      assert.match(out, /1 fora de uma pasta com o id do paciente/);
      assert.strictEqual(arquivos.size, 0);
      assert.strictEqual(extras(1).length, antes1);
    });
    await t.confere('recupera para o prontuário de cada paciente, com a data das pastas ou do arquivo', async () => {
      const out = await roda(...pastas);
      assert.match(out, /3 recuperados/);
      const novos = extras(1).slice(antes1);
      // mesma estrutura e mesmo nome da origem
      assert.deepStrictEqual(novos.map((x) => x.file), ['extras/1/2023/03/05/raio x.png', 'extras/1/laudo.pdf']);
      assert.strictEqual(novos[0].data_salvo, '2023-03-05 00:00:00');
      assert.strictEqual(novos[1].data_salvo, '2022-07-09 14:30:00');
      assert.ok(novos[0].fk_consulta_id, 'ligado à última consulta do paciente');
      const doPac2 = extras(2).map((x) => x.file);
      assert.strictEqual(doPac2.length, 1);
      assert.strictEqual(doPac2[0], 'extras/2/exame.jpg');
      assert.strictEqual(arquivos.size, 4, '3 novos + o já registrado');
      assert.strictEqual(t.sq.prepare("select count(*) n from tb_extra where file = 'extras/1/2024/01/02/ja_registrado.png'").get().n, 1, 'sem registro duplicado');
      assert.strictEqual(t.sq.prepare("select count(*) n from inno_nuvem where caminho = 'extras/1/2024/01/02/ja_registrado.png'").get().n, 1, 'na nuvem com o mesmo caminho');
      assert.ok(fs.existsSync(path.join(raiz, 'extra/1/2023/03/05/raio x.png')), 'origem intacta');
    });
    await t.confere('aparece em Imagens e anexos e abre', async () => {
      const j = await (await t.vai('/prontuario/Extras/CarregaExtras/?prontuario=1')).json();
      const item = j.success.find((x) => x.nome === 'raio x.png');
      assert.ok(item);
      assert.strictEqual(item.data, '05/03/2023');
      const r = await t.vai(item.url);
      assert.strictEqual(Buffer.from(await r.arrayBuffer()).toString(), 'png do paciente 1');
    });
    await t.confere('caminho ocupado por outro arquivo: ganha sufixo, sem sobrescrever', async () => {
      escreve('terceira/1/2023/03/05/raio x.png', 'OUTRO conteúdo, mesmo nome');
      const out = await roda(path.join(raiz, 'terceira'));
      assert.match(out, /1 recuperados/);
      const ultimo = extras(1).pop().file;
      assert.match(ultimo, /^extras\/1\/2023\/03\/05\/raio x_[A-Za-z0-9]{7}\.png$/);
      const r = await t.vai('/media/extras/1/2023/03/05/raio%20x.png');
      assert.strictEqual(Buffer.from(await r.arrayBuffer()).toString(), 'png do paciente 1', 'o original continua intacto');
    });
    await t.confere('nome longo demais: encurtado para caber, mesma pasta e extensão', async () => {
      const longo = 'KELI CRISTINA VIEIRA DA SILVA PUGAS RM COLUNA LOMBOSSACRA 30 10 2020 CONT 001 E MAIS UM POUCO.jpg';
      escreve(`longos/1/2020/12/09/${longo}`, 'imagem de nome longo');
      const out = await roda(path.join(raiz, 'longos'));
      assert.match(out, /1 recuperados/);
      assert.match(out, /1 com o nome encurtado/);
      const f = extras(1).pop().file;
      assert.ok(f.length <= 100, `${f.length} caracteres`);
      assert.match(f, /^extras\/1\/2020\/12\/09\/KELI CRISTINA VIEIRA.*\.jpg$/);
      const r = await t.vai('/media/' + f.split('/').map(encodeURIComponent).join('/'));
      assert.strictEqual(Buffer.from(await r.arrayBuffer()).toString(), 'imagem de nome longo');
    });
    await t.confere('arquivo que ficou na nuvem sem registro (rodada que falhou): ganha o registro, sem reenviar', async () => {
      // simula a rodada antiga: arquivo enviado com um caminho longo, e o registro falhou
      const dados = Buffer.from('enviado na rodada que falhou');
      const fd = new FormData();
      fd.append('file', new Blob([dados]), 'x');
      const id = (await (await fetch(URLN + '/upload', { method: 'POST', body: fd })).json()).id;
      const velho = 'extras/1/2020/12/09/' + 'A'.repeat(110) + '.jpg';
      t.sq.prepare('insert into inno_nuvem (caminho, nuvem_id, tamanho, tipo, criado_em) values (?, ?, ?, ?, ?)').run(velho, id, dados.length, 'image/jpeg', '2026-11-17 12:00:00');
      escreve('falhou/1/2020/12/09/' + 'A'.repeat(110) + '.jpg', dados);
      const envios = arquivos.size;
      const out = await roda(path.join(raiz, 'falhou'));
      assert.match(out, /1 recuperados/);
      assert.match(out, /1 já estavam na nuvem sem registro/);
      assert.strictEqual(arquivos.size, envios, 'não enviou de novo');
      const f = extras(1).pop().file;
      assert.ok(f.length <= 100);
      const r = await t.vai('/media/' + f.split('/').map(encodeURIComponent).join('/'));
      assert.strictEqual(Buffer.from(await r.arrayBuffer()).toString(), 'enviado na rodada que falhou');
    });
    await t.confere('rodar de novo não duplica', async () => {
      const out = await roda(...pastas);
      assert.match(out, /0 recuperados/);
      assert.match(out, /5 já estavam no prontuário/);   // os 3 recuperados + a cópia + o já registrado
      assert.strictEqual(arquivos.size, 7);
    });
    await t.fim();
  } catch (e) { await t.fim(e); }
  nv.close();
})();
