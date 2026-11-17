'use strict';
// Imagens e anexos com ARMAZENAMENTO=nuvem, contra um cloud-storage falso
// (mesmas rotas e respostas de app/api/* do valdecirsanches/cloud-storage).
//   node tools/testes/nuvem.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const CHAVE = 'chave-teste';
const arquivos = new Map();   // id -> {meta, dados}
let seq = 0;

/** cloud-storage falso */
function nuvemFalsa() {
  const srv = http.createServer(async (req, res) => {
    const json = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/api/health') return json({ status: 'ok' });
    if (req.headers['x-api-key'] !== CHAVE) return json({ error: 'Não autorizado' }, 401);
    const u = new URL(req.url, 'http://x');
    if (req.method === 'POST' && u.pathname === '/api/upload') {
      const r = new Request('http://x' + req.url, { method: 'POST', headers: req.headers, body: req, duplex: 'half' });
      const f = (await r.formData()).get('file');
      if (!(f instanceof File)) return json({ error: "Nenhum arquivo enviado (campo 'file')" }, 400);
      const id = `${Date.now()}-${++seq}`;
      const meta = { id, clientId: 'inno', name: f.name, type: f.type, size: f.size, uploadedAt: new Date(Date.now() + seq).toISOString() };
      arquivos.set(id, { meta, dados: Buffer.from(await f.arrayBuffer()) });
      return json({ ok: true, id, file: meta, view: `/api/files/${id}`, download: `/api/files/${id}?download=1` }, 201);
    }
    if (req.method === 'GET' && u.pathname === '/api/files') return json({ files: [...arquivos.values()].map((a) => a.meta), maxUploadBytes: 1e8 });
    const m = u.pathname.match(/^\/api\/files\/([^/]+)$/);
    if (m) {
      const a = arquivos.get(decodeURIComponent(m[1]));
      if (!a) return json({ error: 'Arquivo não encontrado' }, 404);
      if (req.method === 'DELETE') { arquivos.delete(a.meta.id); return json({ ok: true }); }
      res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(a.dados);
    }
    json({ error: 'rota' }, 404);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

(async () => {
  const nv = await nuvemFalsa();
  const URLN = `http://127.0.0.1:${nv.address().port}`;
  const media = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));
  // arquivos antigos na pasta local, para a migração
  fs.mkdirSync(path.join(media, 'extras/1/2024/05/10'), { recursive: true });
  fs.writeFileSync(path.join(media, 'extras/1/2024/05/10/antiga.png'), Buffer.from('png antigo'));
  fs.writeFileSync(path.join(media, 'extras/1/2024/05/10/raio_x.jpg'), Buffer.from('jpg antigo'));
  const env = { ARMAZENAMENTO: 'nuvem', NUVEM_URL: URLN, NUVEM_API_KEY: CHAVE, MEDIA_ROOT: media };
  const t = await require('./base')({ env });
  try {
    await t.entra();
    const img = Buffer.from('\x89PNG imagem de teste');
    const envia = async (nome) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries({ fk_prontuario: '1', fk_consulta: '42', fk_medico: '1' })) fd.append(k, v);
      fd.append('file', new Blob([img], { type: 'image/png' }), nome);
      return t.vai('/prontuario/Extras/uploadFile.json', { method: 'POST', body: fd });
    };
    let caminho;
    await t.confere('envio vai para a nuvem com o caminho de sempre', async () => {
      const r = await envia('foto teste.png');
      assert.strictEqual(r.status, 200);
      const j = await r.json();
      assert.match(j.success, /^extras\/1\/\d{4}\/\d{2}\/\d{2}\/foto_teste\.png$/);
      caminho = j.success;
      assert.ok([...arquivos.values()].some((a) => a.meta.name === caminho), 'nome na nuvem = caminho');
      assert.ok(!fs.existsSync(path.join(media, caminho)), 'nada gravado na pasta local');
      const linha = t.sq.prepare('select file from tb_extra order by id desc limit 1').get();
      assert.strictEqual(linha.file, caminho);
    });
    await t.confere('mesmo nome de novo ganha sufixo, como o Django', async () => {
      const j = await (await envia('foto teste.png')).json();
      assert.match(j.success, /\/foto_teste_[a-z0-9]{7}\.png$/);
    });
    await t.confere('lista de anexos mostra os da nuvem', async () => {
      const j = await (await t.vai('/prontuario/Extras/CarregaExtras/?prontuario=1')).json();
      assert.strictEqual(j.success.length, 2);
      assert.strictEqual(j.success[0].nome, 'foto_teste.png');
    });
    await t.confere('download e /media/ trazem o arquivo da nuvem', async () => {
      const id = t.sq.prepare('select id from tb_extra order by id limit 1').get().id;
      const r = await t.vai(`/prontuario/Extras/downloadFile.json?extra=${id}`);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.headers.get('content-type'), 'image/png');
      assert.deepStrictEqual(Buffer.from(await r.arrayBuffer()), img);
      const m = await t.vai('/media/' + caminho.split('/').map(encodeURIComponent).join('/'));
      assert.strictEqual(m.status, 200);
      assert.deepStrictEqual(Buffer.from(await m.arrayBuffer()), img);
      assert.strictEqual((await t.vai('/media/extras/1/nao-existe.png')).status, 404);
      assert.strictEqual((await t.vai('/media/../.env')).status, 404);
    });
    await t.confere('migração copia a pasta media e pode rodar de novo', async () => {
      // assíncrono: a nuvem falsa roda neste mesmo processo
      const roda = (...a) => new Promise((ok, erro) => execFile(process.execPath, ['tools/nuvem/migra-media.js', ...a], { env: Object.assign({}, process.env, env), encoding: 'utf8' }, (e, out, err) => (e ? erro(new Error(err || e.message)) : ok(out))));
      assert.match(await roda('--simular'), /2 a enviar/);
      assert.match(await roda(), /2 enviados/);
      assert.match(await roda(), /0 a enviar/);
      assert.ok([...arquivos.values()].some((a) => a.meta.name === 'extras/1/2024/05/10/raio_x.jpg'));
    });
    await t.confere('rastrear acha na nuvem as imagens sem registro', async () => {
      require('../../server/util/armazenamento')._zeraIndice();
      const antes = t.sq.prepare('select count(*) n from tb_extra').get().n;
      const r = await t.vai('/api/extras/rastrear/', { method: 'POST', body: t.corpo({ id_paciente: 1 }) });
      assert.deepStrictEqual(await r.json(), { success: 'OK' });
      assert.strictEqual(t.sq.prepare('select count(*) n from tb_extra').get().n, antes + 2);
      const rec = await (await t.vai('/api/extras/recuperar_imagens/', { method: 'POST', body: t.corpo({ id_paciente: 1 }) })).json();
      assert.strictEqual(rec.success, 'OK');
      assert.strictEqual(rec.imagens.length, antes + 2);
    });
    await t.confere('sem a chave certa o envio falha (500) e nada é gravado', async () => {
      process.env.NUVEM_API_KEY = 'errada';
      require('../../server/config').nuvem.apiKey = 'errada';
      const antes = t.sq.prepare('select count(*) n from tb_extra').get().n;
      assert.strictEqual((await envia('x.png')).status, 500);
      assert.strictEqual(t.sq.prepare('select count(*) n from tb_extra').get().n, antes);
      require('../../server/config').nuvem.apiKey = CHAVE;
    });
    await t.fim();
  } catch (e) { await t.fim(e); }
  nv.close();
})();
