// Evolution: "Connection Closed" com a instância "open" => reinicia a instância e tenta de novo uma vez
const http = require('http');
const assert = require('assert');
const path = require('path');
let falhas = 1;
const pedidos = [];
const srv = http.createServer((req, res) => {
  let c = ''; req.on('data', (d) => { c += d; });
  req.on('end', () => {
    pedidos.push(`${req.method} ${req.url.split('?')[0]}`);
    const envia = (s, b) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    if (/\/instance\/connectionState\//.test(req.url)) return envia(200, { instance: { state: 'open' } });
    if (/\/instance\/restart\//.test(req.url)) return envia(200, { instance: { state: 'connecting' } });
    if (/\/message\/send/.test(req.url)) {
      if (falhas-- > 0) return envia(500, { status: 500, error: 'Internal Server Error', response: { message: ['Error: Connection Closed'] } });
      return envia(201, { key: { id: 'OK1', remoteJid: '5511999990000@s.whatsapp.net' } });
    }
    envia(404, {});
  });
});
srv.listen(0, '127.0.0.1', async () => {
  process.env.EVOLUTION_URL = `http://127.0.0.1:${srv.address().port}`;
  process.env.EVOLUTION_API_KEY = 'x';
  const { Evolution } = require(path.join(__dirname, '..', '..', 'server', 'util', 'evolution.js'));
  const e = new Evolution('appclinic');
  try {
    let r = await e.enviaComoWaha('sendText', { chatId: '5511999990000@c.us', text: 'oi' });
    assert.equal(r.status_code, 201); assert.ok(pedidos.some((p) => /restart/.test(p)));
    console.log('ok - "Connection Closed": reinicia a instância e o envio sai na segunda tentativa');
    falhas = 5; pedidos.length = 0;
    r = await e.enviaComoWaha('sendText', { chatId: '5511999990000@c.us', text: 'oi' });
    assert.equal(r.status_code, 500); assert.equal(JSON.parse(r.text).error, 'Error: Connection Closed');
    assert.equal(pedidos.filter((p) => /send/.test(p)).length, 2);
    console.log('ok - continua fechada: tenta só mais uma vez e mostra o motivo');
    console.log('\n2 conferências ok');
  } catch (x) { console.error('FALHOU:', x.message); process.exitCode = 1; }
  srv.close();
});
