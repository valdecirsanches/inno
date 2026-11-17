// Envio com a logo no topo (WhatsAppService.enviar_texto_com_logo), contra um WAHA falso local:
// uma mensagem só (imagem + legenda); imagem recusada => texto sozinho;
// texto longo => logo e depois o texto; sem logo => só o texto.
const http = require('http');
const path = require('path');
const assert = require('assert');
const R = path.join(__dirname, '..', '..');
const { WhatsAppService } = require(R + '/server/util/whatsapp.js');
const LOGO = path.join(R, 'static', 'img', 'neuro100.png');

let recusaImagem = false;
const pedidos = [];
const srv = http.createServer((req, res) => {
  let c = '';
  req.on('data', (d) => { c += d; });
  req.on('end', () => {
    const p = new URL(req.url, 'http://x').pathname;
    pedidos.push({ caminho: p, corpo: c ? JSON.parse(c) : null });
    const envia = (s, b) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(b); };
    if (p === '/api/contacts/check-exists') return envia(200, '{"numberExists": true, "chatId": "5511999990000@c.us"}');
    if (p === '/api/sendImage') return recusaImagem ? envia(422, '{"error": "imagem"}') : envia(201, '{"id": "IMG"}');
    if (p === '/api/sendText') return envia(201, '{"id": "TXT"}');
    envia(404, '{}');
  });
});
srv.listen(0, async () => {
  const s = new WhatsAppService(null, `http://127.0.0.1:${srv.address().port}`, 'default');
  let ok = 0;
  const confere = async (n, f) => { await f(); ok++; console.log('ok -', n); };
  try {
    let r, modo;
    [r, modo] = await s.enviar_texto_com_logo('5511999990000', 'Olá, sua consulta é amanhã.', LOGO);
    await confere('logo no topo com o texto como legenda', () => {
      assert.equal(modo, 'imagem_com_texto'); assert.equal(r.status_code, 201);
      const env = pedidos.filter((p) => p.caminho.startsWith('/api/send'));
      assert.deepEqual(env.map((p) => p.caminho), ['/api/sendImage']);
      assert.equal(env[0].corpo.caption, 'Olá, sua consulta é amanhã.');
      assert.equal(env[0].corpo.file.mimetype, 'image/png'); assert.equal(env[0].corpo.file.filename, 'neuro100.png');
      assert.ok(Buffer.from(env[0].corpo.file.data, 'base64').equals(require('fs').readFileSync(LOGO)));
    });
    pedidos.length = 0; recusaImagem = true;
    [r, modo] = await s.enviar_texto_com_logo('5511999990000', 'Texto', LOGO);
    await confere('imagem recusada: o texto sai sozinho', () => {
      assert.equal(modo, 'texto (imagem recusada)'); assert.equal(r.status_code, 201);
      assert.deepEqual(pedidos.filter((p) => p.caminho.startsWith('/api/send')).map((p) => p.caminho), ['/api/sendImage', '/api/sendText']);
      assert.equal(pedidos.at(-1).corpo.text, 'Texto');
    });
    pedidos.length = 0; recusaImagem = false;
    const longo = 'x'.repeat(1001);
    [r, modo] = await s.enviar_texto_com_logo('5511999990000', longo, LOGO);
    await confere('texto longo: logo primeiro, texto logo abaixo', () => {
      assert.equal(modo, 'imagem_e_texto');
      const env = pedidos.filter((p) => p.caminho.startsWith('/api/send'));
      assert.deepEqual(env.map((p) => p.caminho), ['/api/sendImage', '/api/sendText']);
      assert.equal(env[0].corpo.caption, ''); assert.equal(env[1].corpo.text, longo);
    });
    pedidos.length = 0;
    [r, modo] = await s.enviar_texto_com_logo('5511999990000', 'Sem logo', '/nao/existe.png');
    await confere('sem a logo: só o texto', () => {
      assert.equal(modo, 'texto');
      assert.deepEqual(pedidos.filter((p) => p.caminho.startsWith('/api/send')).map((p) => p.caminho), ['/api/sendText']);
    });
    console.log(`\n${ok} conferências ok`);
  } catch (e) { console.error('FALHOU:', e.message); process.exitCode = 1; }
  srv.close();
});
