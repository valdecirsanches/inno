'use strict';
// Imagens e anexos (só na nuvem). Por padrão, contra uma nuvem falsa do tipo
// "simples" (as rotas do ~/apps/nuvem/main.js: POST /upload, GET /download/:id).
//   node tools/testes/nuvem.js
// Contra uma nuvem de verdade (ex.: uma cópia do main.js rodando local):
//   NUVEM_REAL_URL=http://127.0.0.1:5190 node tools/testes/nuvem.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const arquivos = new Map();   // id -> {name, type, dados}
let seq = 0;

/** nuvem falsa com as rotas do main.js */
function nuvemFalsa() {
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'POST' && u.pathname === '/upload') {
      const r = new Request('http://x/upload', { method: 'POST', headers: req.headers, body: req, duplex: 'half' });
      const f = (await r.formData()).get('file');
      if (!(f instanceof File)) { res.writeHead(400); return res.end('Sem arquivo'); }
      const id = `${Date.now()}-${(++seq).toString(36)}`;
      arquivos.set(id, { name: f.name, type: f.type, dados: Buffer.from(await f.arrayBuffer()) });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, id, view: `/view/${id}`, download: `/download/${id}` }));
    }
    const m = u.pathname.match(/^\/(view|download)\/([^/]+)$/);
    if (req.method === 'GET' && m) {
      const a = arquivos.get(decodeURIComponent(m[2]));
      if (!a) { res.writeHead(404); return res.end('Não existe'); }
      res.writeHead(200, { 'content-type': a.type || 'image/jpeg' });
      return res.end(a.dados);
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(`<pre>Cannot ${req.method} ${u.pathname}</pre>`);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

(async () => {
  const real = process.env.NUVEM_REAL_URL;
  const nv = real ? null : await nuvemFalsa();
  const URLN = real || `http://127.0.0.1:${nv.address().port}`;
  const media = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));
  // arquivos antigos na pasta local, para a migração
  fs.mkdirSync(path.join(media, 'extras/1/2024/05/10'), { recursive: true });
  fs.writeFileSync(path.join(media, 'extras/1/2024/05/10/antiga.png'), Buffer.from('png antigo'));
  fs.writeFileSync(path.join(media, 'extras/1/2024/05/10/raio_x.jpg'), Buffer.from('jpg antigo'));
  const env = { NUVEM_URL: URLN, NUVEM_TIPO: 'simples', MEDIA_ROOT: media };
  const t = await require('./base')({ env });
  const indice = () => t.sq.prepare('select caminho, nuvem_id from inno_nuvem order by caminho').all();
  const e2 = () => Object.assign({}, process.env, env, { DB_FILE: process.env.DB_FILE });
  // assíncrono: a nuvem falsa roda neste mesmo processo
  const roda = (script, ...a) => new Promise((ok, erro) => execFile(process.execPath, [script, ...a], { env: e2(), encoding: 'utf8' }, (e, out, err) => (e ? erro(new Error(out + err)) : ok(out))));
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
    await t.confere('envio vai para a nuvem; o banco guarda o caminho de sempre', async () => {
      const r = await envia('foto teste.png');
      assert.strictEqual(r.status, 200);
      const j = await r.json();
      assert.match(j.success, /^extras\/1\/\d{4}\/\d{2}\/\d{2}\/foto_teste\.png$/);
      caminho = j.success;
      assert.strictEqual(t.sq.prepare('select file from tb_extra order by id desc limit 1').get().file, caminho);
      const l = indice().find((x) => x.caminho === caminho);
      assert.ok(l && l.nuvem_id, 'caminho ligado ao id da nuvem em inno_nuvem');
      assert.ok(!fs.existsSync(path.join(media, caminho)), 'nada gravado na pasta local');
      if (!real) assert.strictEqual(arquivos.get(l.nuvem_id).name, caminho.replace(/\//g, '~'));
    });
    await t.confere('mesmo nome de novo ganha sufixo, como o Django', async () => {
      const j = await (await envia('foto teste.png')).json();
      assert.match(j.success, /\/foto_teste_[A-Za-z0-9]{7}\.png$/);
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
      assert.match(await roda('tools/nuvem/migra-media.js', '--simular'), /2 a enviar/);
      assert.match(await roda('tools/nuvem/migra-media.js'), /2 enviados/);
      assert.match(await roda('tools/nuvem/migra-media.js'), /0 a enviar/);
      assert.ok(indice().some((x) => x.caminho === 'extras/1/2024/05/10/raio_x.jpg'));
      const migrada = await t.vai('/media/extras/1/2024/05/10/raio_x.jpg');
      assert.strictEqual(Buffer.from(await migrada.arrayBuffer()).toString(), 'jpg antigo');
    });
    await t.confere('imagem enviada pelo AppClinic (só na pasta) aparece no Inno e vai para a nuvem', async () => {
      const rel = 'extras/1/2026/11/17/pelo_appclinic.jpg';
      fs.mkdirSync(path.dirname(path.join(media, rel)), { recursive: true });
      fs.writeFileSync(path.join(media, rel), Buffer.from('jpg do appclinic'));
      t.sq.prepare('insert into tb_extra (fk_prontuario_id, fk_consulta_id, fk_medico_id, file, data_salvo) values (1, 42, 1, ?, ?)').run(rel, '2026-11-17 11:00:00');
      const lista = await (await t.vai('/prontuario/Extras/CarregaExtras/?prontuario=1')).json();
      const item = lista.success.find((x) => x.nome === 'pelo_appclinic.jpg');
      assert.ok(item, 'aparece na lista do Inno');
      assert.ok(!indice().some((x) => x.caminho === rel), 'ainda não está na nuvem');
      const r = await t.vai(item.url);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(Buffer.from(await r.arrayBuffer()).toString(), 'jpg do appclinic');
      assert.ok(indice().some((x) => x.caminho === rel), 'copiada para a nuvem ao abrir');
      assert.strictEqual(fs.readFileSync(path.join(media, rel)).toString(), 'jpg do appclinic', 'a pasta não é mexida');
      const m = await t.vai('/media/' + rel);
      assert.strictEqual(Buffer.from(await m.arrayBuffer()).toString(), 'jpg do appclinic');
    });
    await t.confere('rastrear acha na nuvem as imagens sem registro', async () => {
      const antes = t.sq.prepare('select count(*) n from tb_extra').get().n;
      const r = await t.vai('/api/extras/rastrear/', { method: 'POST', body: t.corpo({ id_paciente: 1 }) });
      assert.deepStrictEqual(await r.json(), { success: 'OK' });
      assert.strictEqual(t.sq.prepare('select count(*) n from tb_extra').get().n, antes + 2);
      const rec = await (await t.vai('/api/extras/recuperar_imagens/', { method: 'POST', body: t.corpo({ id_paciente: 1 }) })).json();
      assert.strictEqual(rec.success, 'OK');
      assert.strictEqual(rec.imagens.length, antes + 2);
    });
    await t.confere('testa.js passa', async () => {
      assert.match(await roda('tools/nuvem/testa.js'), /A nuvem está funcionando/);
    });
    await t.confere('sem a nuvem configurada: erro, e nada vai para o disco nem para o banco', async () => {
      const cfg = require('../../server/config');
      cfg.nuvem.url = '';
      const antes = t.sq.prepare('select count(*) n from tb_extra').get().n;
      assert.strictEqual((await envia('sem nuvem.png')).status, 500);
      assert.strictEqual(t.sq.prepare('select count(*) n from tb_extra').get().n, antes);
      const noDisco = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((i) => (i.isDirectory() ? noDisco(path.join(d, i.name)) : [i.name]));
      assert.deepStrictEqual(noDisco(media).sort(), ['antiga.png', 'pelo_appclinic.jpg', 'raio_x.jpg'], 'só os arquivos do AppClinic na pasta media');
      cfg.nuvem.url = URLN;
    });
    await t.confere('nuvem fora do ar: erro, e nada vai para o banco', async () => {
      const cfg = require('../../server/config');
      cfg.nuvem.url = 'http://127.0.0.1:9';
      const antes = t.sq.prepare('select count(*) n from tb_extra').get().n;
      assert.strictEqual((await envia('fora.png')).status, 500);
      assert.strictEqual(t.sq.prepare('select count(*) n from tb_extra').get().n, antes);
      cfg.nuvem.url = URLN;
    });
    await t.fim();
  } catch (e) { await t.fim(e); }
  if (nv) nv.close();
})();
