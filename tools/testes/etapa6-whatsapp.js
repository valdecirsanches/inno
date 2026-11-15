// Testes do WhatsApp (/api/whatsapp/, /whatsapp/..., /webhook/resposta/), com um WAHA falso local.
// Uso (na raiz do inno, com as dependências de desenvolvimento): node tools/testes/etapa6-whatsapp.js
const http = require('http');
const assert = require('assert/strict');

const pedidos = [];
let statusSessao = 'STOPPED';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const waha = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const u = new URL('http://x' + req.url);
    pedidos.push({ metodo: req.method, caminho: u.pathname, busca: Object.fromEntries(u.searchParams), corpo: corpo ? JSON.parse(corpo) : null, headers: req.headers });
    const envia = (st, txt, tipo = 'application/json') => { res.writeHead(st, { 'content-type': tipo }); res.end(txt); };
    const p = u.pathname;
    if (p === '/api/sessions/default' && req.method === 'GET') return envia(200, JSON.stringify({ status: statusSessao }));
    if (/^\/api\/sessions\/default\/(start|restart)$/.test(p)) return envia(201, '{"ok": true}');
    if (p === '/api/default/auth/qr') return envia(200, PNG, 'image/png');
    if (p === '/api/contacts/check-exists') {
      const tel = u.searchParams.get('phone');
      return envia(200, JSON.stringify(tel === '5511999990000' ? { numberExists: true, chatId: '5511999990000@c.us' } : tel.startsWith('5511988887777') ? { numberExists: true } : { numberExists: false }));
    }
    if (p === '/api/sendText') return envia(201, '{"id": {"id": "MSG1", "remote": "5511999990000@c.us"}}');
    if (p === '/api/sendImage') return envia(201, '{}');
    if (p === '/api/contacts/profile-picture') return envia(200, '{"profilePictureURL": "https://foto/x.jpg"}');
    if (p === '/api/default/lids/123%40lid' || p === '/api/default/lids/123@lid') return envia(200, '{"lid": "123@lid", "pn": "5511988887777@c.us"}');
    envia(404, '{"error": "nao"}');
  });
});

waha.listen(0, async () => {
  const URL_WAHA = `http://127.0.0.1:${waha.address().port}`;
  const t = await require('./base')({
    antesDoServidor: (sq) => {
      sq.prepare(`UPDATE tb_clinicas SET whatsapp_url = ?, whatsappClient = 'default', whatsapp_texto = 'Até breve!', whatsapp_confirma = 'Confirmado.', whatsapp_cancela = 'Cancelado.', fone = '(11) 3605-5366'`).run(URL_WAHA + '/');
      sq.exec(`UPDATE tb_agendas SET confirmacao = NULL WHERE id IN (1, 2)`);
      sq.exec(`UPDATE paciente SET celular = '(11) 99999-0000' WHERE id = 1`);
    },
  });
  const { sq, vai, confere, corpo } = t;
  const hook = (o) => vai('/webhook/resposta/', { method: 'POST', json: true, body: typeof o === 'string' ? o : JSON.stringify(o) });
  try {
    // ------------------------------------------------- sem login
    let r = await vai('/webhook/resposta/'); let x = await r.text();
    await confere('webhook GET: 405 vazio', () => { assert.equal(r.status, 405); assert.equal(x, ''); assert.equal(r.headers.get('allow'), 'POST'); });
    r = await hook('{nao e json'); x = await r.text();
    await confere('webhook com JSON inválido: 400', () => { assert.equal(r.status, 400); assert.equal(x, '{"success": false, "error": "Payload inv\\u00e1lido"}'); });
    r = await hook({ event: 'session.status', payload: {} }); x = await r.text();
    await confere('webhook ignora outros eventos', () => assert.equal(x, '{"success": true, "info": "Evento session.status ignorado"}'));
    r = await hook({ event: 'message', payload: { from: '5511999990000@c.us', body: 'oi' } }); x = await r.text();
    await confere('webhook ignora resposta que não é 1/2', () => assert.equal(x, '{"success": true, "message": "Op\\u00e7\\u00e3o inv\\u00e1lida ignorada"}'));
    r = await hook({ event: 'message', payload: { from: '5511999990000@c.us', body: '1' } }); x = JSON.parse(await r.text());
    await confere('webhook sem envio pendente', () => assert.deepEqual(x, { success: false, error: 'Contexto não encontrado', remetente: '5511999990000@c.us', telefones: ['5511999990000'] }));

    await t.entra();
    // ------------------------------------------------- agenda_texto e envio
    r = await vai('/api/whatsapp/agenda_texto/?id_consulta=1'); x = JSON.parse(await r.text());
    await confere('agenda_texto', () => {
      assert.equal(r.status, 200);
      assert.equal(x.success, 'INNO - INSTITUTO NEUROCIRURGIA E NEUROLOGIA DE OSASCO\nOlá *Ana Paula de Souza*\nConsulta médica com *João da Silva*\nDia *02/01/2026 às 09:10*\n\nResponda:\n\n *1* para confirmar presença ✅\n *2* para cancelar consulta ❌\n\nAté breve!');
      assert.equal(x.celular, '(11) 99999-0000');
      assert.deepEqual(x.whatsapp_status, { success: true, status: 'STOPPED', host: URL_WAHA, session: 'default' });
      assert.equal(x.host_ident, `${URL_WAHA}/ ( default )`);
      assert.match(x.logo, /^http:\/\/127\.0\.0\.1:\d+\/static\/img\/neuro100\.png$/);
    });
    r = await vai('/api/whatsapp/agenda_texto/?id_consulta=abc'); x = await r.text();
    await confere('agenda_texto com id inválido: 400', () => { assert.equal(r.status, 400); assert.equal(x, '{"success": false, "error": "Field \'id\' expected a number but got \'abc\'."}'); });

    r = await vai('/api/whatsapp/EnviaWhatsApp/', { method: 'POST', body: corpo({ id_consulta: '1', celular: '(11) 99999-0000' }) }); x = await r.text();
    await confere('EnviaWhatsApp envia texto e logo e grava o envio', () => {
      assert.equal(x, '{"success": true, "message": "WhatsApp enviado com sucesso!"}');
      const txt = pedidos.find((p) => p.caminho === '/api/sendText');
      assert.equal(txt.corpo.chatId, '5511999990000@c.us'); assert.equal(txt.corpo.session, 'default'); assert.equal(txt.corpo.linkPreview, true);
      assert.equal(txt.headers['x-api-key'], 'eds.2013');
      assert.ok(pedidos.some((p) => p.caminho === '/api/sendImage'));
      const w = sq.prepare('SELECT * FROM tb_whatsapp').all();
      assert.equal(w.length, 1);
      assert.deepEqual([w[0].id, w[0].id_whatsapp, w[0].origem, w[0].destino, w[0].status, w[0].sistema, w[0].session_id], [1, 'MSG1', '5511999990000@c.us', '5511999990000', 'pendente', 'APPCLINIC', 'default']);
      assert.equal(sq.prepare('SELECT fone_whatsapp FROM tb_agendas WHERE id = 1').get().fone_whatsapp, '11999990000');
    });
    r = await vai('/api/whatsapp/EnviaWhatsApp/', { method: 'POST', body: corpo({ id_consulta: '1', celular: '(21) 3333-0000' }) }); x = await r.text();
    await confere('EnviaWhatsApp para número sem WhatsApp', () => assert.equal(x, '{"success": false, "error": "API Error: O numero 552133330000 nao possui WhatsApp."}'));
    r = await vai('/api/whatsapp/EnviaWhatsApp/', { method: 'POST', body: corpo({ id_consulta: '999', celular: '1' }) });
    await confere('EnviaWhatsApp de consulta que não existe: 404', () => assert.equal(r.status, 404));
    r = await vai('/api/whatsapp/envia/', { method: 'POST', body: corpo({ id_consulta: '999' }) });
    await confere('envia: 500 como no AppClinic', () => assert.equal(r.status, 500));

    // ------------------------------------------------- resposta do paciente
    const n0 = sq.prepare('SELECT COUNT(*) n FROM tbWhatsappLog').get().n;
    r = await hook({ event: 'message', session: 'default', payload: { id: { _serialized: 'false_1' }, from: '5511999990000@c.us', body: '*1* ✅' } }); x = JSON.parse(await r.text());
    await confere('webhook confirma a consulta e responde ao paciente', () => {
      assert.equal(x.success, true); assert.equal(x.acao, 'CONFIRMAÇÃO'); assert.equal(x.consulta, 1); assert.equal(x.retorno_enviado, true);
      assert.equal(x.retorno.texto.http, 201);
      assert.equal(sq.prepare('SELECT confirmacao FROM tb_agendas WHERE id = 1').get().confirmacao, 1);
      assert.equal(sq.prepare('SELECT status FROM tb_whatsapp WHERE id = 1').get().status, 'fechado');
      const ult = pedidos.filter((p) => p.caminho === '/api/sendText').at(-1);
      assert.equal(ult.corpo.text, 'Olá Ana Paula de Souza,\nSua consulta em 02 de janeiro às 09:10 \nConfirmado.');
      assert.equal(sq.prepare('SELECT COUNT(*) n FROM tbWhatsappLog').get().n, n0 + 2);   // evento recebido + detalhes do retorno
      assert.equal(sq.prepare('SELECT COUNT(*) n FROM WhatsApp_mensagemprocessada').get().n, 1);
    });
    // envio pendente de outra consulta, respondido por um contato @lid
    sq.prepare(`INSERT INTO tb_whatsapp (id, id_consulta, destino, origem, telefone_limpo, status, dh, session_id) VALUES (2, 2, '5511988887777', 'outro', '5511988887777', 'pendente', '2026-11-01 10:00:00', 'default')`).run();
    r = await hook({ event: 'message', session: 'default', payload: { id: 'm2', from: '123@lid', body: 'Não' } }); x = JSON.parse(await r.text());
    await confere('webhook com @lid: traduz o telefone e cancela', () => {
      assert.equal(x.acao, 'CANCELAMENTO');
      assert.equal(sq.prepare('SELECT confirmacao FROM tb_agendas WHERE id = 2').get().confirmacao, 2);
      assert.equal(x.retorno.telefone, '5511988887777');
    });
    sq.prepare(`UPDATE tb_whatsapp SET status = 'pendente' WHERE id = 2`).run();
    r = await hook({ event: 'message', session: 'default', payload: { id: 'm2', from: '123@lid', body: '2' } }); x = await r.text();
    await confere('webhook com mensagem repetida', () => assert.equal(x, '{"success": true, "info": "Mensagem j\\u00e1 processada"}'));

    // ------------------------------------------------- sessão e QR code
    r = await vai(`/api/whatsapp/read_qrcode/?host=${encodeURIComponent(URL_WAHA + '/')}&sessionId=default`); x = await r.text();
    await confere('read_qrcode com sessão parada: inicia e devolve o QR', () => {
      assert.equal(x, '{"status":"SCAN_QR_CODE","connected":false,"qr":"data:image/png;base64,iVBORw=="}');
      assert.ok(pedidos.some((p) => p.caminho === '/api/sessions/default/start'));
    });
    statusSessao = 'WORKING';
    r = await vai('/api/whatsapp/read_qrcode/', { method: 'POST', json: true, body: JSON.stringify({ host: URL_WAHA, sessionId: 'default' }) }); x = await r.text();
    await confere('read_qrcode conectado', () => assert.equal(x, '{"status":"WORKING","connected":true,"qr":null,"message":"WhatsApp conectado."}'));
    r = await vai('/api/whatsapp/read_qrcode/'); x = await r.text();
    await confere('read_qrcode sem parâmetros: 400', () => { assert.equal(r.status, 400); assert.equal(x, '{"error":"Parametros ausentes"}'); });
    r = await vai('/api/whatsapp/restart_session/', { method: 'POST', json: true, body: JSON.stringify({ host: URL_WAHA, sessionId: 'default' }) }); x = JSON.parse(await r.text());
    await confere('restart_session', () => assert.deepEqual(x, { success: true, message: 'Solicitacao de reinicio enviada ao servidor WhatsApp.', host: URL_WAHA, sessionId: 'default', status_before: 'WORKING', status_error: null, status_code: 201, api_response: { ok: true } }));
    r = await vai('/api/whatsapp/restart_session/');
    await confere('restart_session só aceita POST', () => assert.equal(r.status, 405));
    r = await vai('/api/whatsapp/restart_session/', { method: 'POST', json: true, body: JSON.stringify({ host: 'http://127.0.0.1:1', sessionId: 'x' }) }); x = JSON.parse(await r.text());
    await confere('restart_session sem conexão: 502', () => { assert.equal(r.status, 502); assert.match(x.error, /^Falha de comunicacao com a API do WhatsApp: /); assert.match(x.status_error, /^Erro ao consultar status: /); });
    r = await vai(`/api/whatsapp/iniciar_sessao/?host=${encodeURIComponent(URL_WAHA)}&sessionId=default`); x = await r.text();
    await confere('iniciar_sessao', () => assert.equal(x, '{"success":true,"status_code":201,"api_response":{"ok":true}}'));
    r = await vai('/api/whatsapp/info/', { method: 'POST', body: corpo({ celular: '11999990000' }) }); x = JSON.parse(await r.text());
    await confere('info (foto do contato)', () => assert.deepEqual(x, { success: true, url: 'https://foto/x.jpg', chatId: '5511999990000@c.us', host: `${URL_WAHA} ( default )` }));

    // ------------------------------------------------- CRUD e /whatsapp/
    r = await vai('/api/whatsapp/'); x = JSON.parse(await r.text());
    await confere('lista de tb_whatsapp (paginada)', () => { assert.equal(x.count, 2); assert.equal(x.results[0].id, 1); });
    r = await vai('/api/whatsapp/', { method: 'POST', json: true, body: JSON.stringify({ mensagem: 'x' }) }); x = await r.text();
    await confere('criar sem id: o DRF exige o id (IntegerField)', () => { assert.equal(r.status, 400); assert.equal(x, '{"id":["Este campo é obrigatório."]}'); });
    r = await vai('/whatsapp/VerificaPresenca/');
    await confere('/whatsapp/VerificaPresenca/: 500 como no AppClinic', () => assert.equal(r.status, 500));
    r = await vai('/whatsapp/ConfirmaPresenca/?id_consulta=1&paciente=1'); x = await r.text();
    await confere('/whatsapp/ConfirmaPresenca/', () => assert.match(x, /j\\u00e1 foi \*c o n f i r m a d a !\*/));
    await t.fim();
  } catch (e) {
    await t.fim(e);
  } finally {
    waha.close();
  }
});
