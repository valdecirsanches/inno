// Roteiro da Evolution API (e do WAHA pelo .env): rode tudo com
//   node tools/testes/evolution/roda.js ../appclinic ~/venv-dj/bin/python
// que sobe a Evolution falsa (falsa.js), o AppClinic e o Inno e passa este roteiro nos dois.
class Navegador {
  constructor(base) { this.base = base; this.cookies = {}; }
  cookieHeader() { return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; '); }
  guarda(res) {
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i); const v = kv.slice(i + 1);
      if (/expires=Thu, 01 Jan 1970/i.test(c) || v === '""' || v === '') delete this.cookies[k]; else this.cookies[k] = v; }
  }
  async pede(m, u, { corpo, json, ajax } = {}) {
    const h = { cookie: this.cookieHeader(), accept: ajax ? 'application/json' : 'text/html' };
    if (ajax) h['x-requested-with'] = 'XMLHttpRequest';
    if (this.cookies.csrftoken) h['x-csrftoken'] = this.cookies.csrftoken;
    let body;
    if (json !== undefined) { h['content-type'] = 'application/json'; body = JSON.stringify(json); }
    else if (corpo !== undefined) { h['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; body = new URLSearchParams(corpo).toString(); }
    const res = await fetch(this.base + u, { method: m, headers: h, body, redirect: 'manual' });
    this.guarda(res);
    return { status: res.status, texto: await res.text() };
  }
  async entra(login = 'diego', senha = 'teste123') {
    await this.pede('GET', '/login/');
    return this.pede('POST', '/login/', { corpo: { csrfmiddlewaretoken: this.cookies.csrftoken, next: '/', username: login, password: senha } });
  }
}
const path = require('path');
const D = require(path.join(__dirname, '..', '..', '..', 'node_modules', 'better-sqlite3'));
const EVO = process.env.EVO_FALSA || 'http://127.0.0.1:8790';

/** o roteiro completo contra um sistema (AppClinic ou Inno); devolve o número de falhas */
async function roteiro(base, arq, { admin = ['diego', 'teste123'], comum = ['medico', 'teste123'], idAdmin = 1, idComum = 2, consultas = [2, 8] } = {}) {
  let falhas = 0;
  const ok = (cond, txt, extra) => { console.log(`${cond ? 'OK  ' : 'FALHOU'} ${txt}${cond ? '' : ' -> ' + String(JSON.stringify(extra)).slice(0, 400)}`); if (!cond) falhas++; };
  const J = (r) => { try { return JSON.parse(r.texto); } catch (e) { return { _texto: r.texto.slice(0, 300), _status: r.status }; } };

  const db = new D(arq);
  db.prepare("update tb_clinicas set whatsappClient='clin1', whatsapp_url='http://127.0.0.1:9/waha-desligado', whatsapp_texto='Confirme', whatsapp_confirma='Confirmada!', whatsapp_cancela='Cancelada!' where id=1").run();
  db.prepare("update tb_usuarios set is_superuser=0, administrador='False' where id=?").run(idComum);
  db.prepare("update tb_usuarios set is_superuser=1 where id=?").run(idAdmin);
  await fetch(EVO + '/__zera');
  const evoLog = async () => (await (await fetch(EVO + '/__log')).json());
  const n = new Navegador(base); await n.entra(...admin);
  let r = J(await n.pede('GET', '/api/whatsapp/provedor/?id_clinica=1', { ajax: true }));
  ok(r.provedor === 'waha' && r.podeTrocar === true && r.evolutionDisponivel === true, 'padrão é WAHA; super pode trocar', r);

  const m = new Navegador(base); await m.entra(...comum);
  r = await m.pede('POST', '/api/whatsapp/provedor/', { corpo: { id_clinica: '1', provedor: 'evolution' }, ajax: true });
  ok(r.status === 403, 'usuário comum não troca o servidor', [r.status, r.texto]);
  r = J(await m.pede('GET', '/api/whatsapp/provedor/?id_clinica=1', { ajax: true }));
  ok(r.provedor === 'waha' && r.podeTrocar === false, 'usuário comum vê WAHA, sem trocar', r);

  r = J(await n.pede('POST', '/api/whatsapp/provedor/', { corpo: { id_clinica: '1', provedor: 'evolution' }, ajax: true }));
  ok(r.success === true && r.provedor === 'evolution', 'super troca para Evolution', r);
  r = J(await n.pede('GET', '/api/whatsapp/provedor/?id_clinica=1', { ajax: true }));
  ok(r.provedor === 'evolution', 'escolha gravada', r);

  r = J(await n.pede('GET', '/api/whatsapp/read_qrcode/?host=-&sessionId=clin1', { ajax: true }));
  ok(r.status === 'SCAN_QR_CODE' && String(r.qr).startsWith('data:image/png;base64,'), 'QR Code vem da Evolution', r);
  let lg = await evoLog();
  ok(lg.some((x) => x.p === '/instance/create' && x.corpo.instanceName === 'clin1') && lg.some((x) => x.p === '/webhook/set/clin1' && x.corpo.webhook.url === 'https://teste.local/webhook/resposta/' && x.corpo.webhook.webhookByEvents === false),
    'instância criada com o webhook das respostas', lg.map((x) => x.p));
  ok(lg.every((x) => x.p.startsWith('/__') || x.apikey === 'chave-evo'), 'chave da Evolution enviada', lg.map((x) => x.apikey));

  await fetch(EVO + '/__abre?i=clin1');
  r = J(await n.pede('GET', '/api/whatsapp/read_qrcode/?host=-&sessionId=clin1', { ajax: true }));
  ok(r.status === 'WORKING' && r.connected === true, 'conectado aparece como WORKING', r);

  r = J(await n.pede('POST', '/api/whatsapp/restart_session/', { json: { host: '-', sessionId: 'clin1' }, ajax: true }));
  ok(r.success === true && r.status_before === 'WORKING', 'reiniciar sessão na Evolution', r);

  r = J(await n.pede('POST', '/api/whatsapp/info/', { corpo: { celular: '11988887777' }, ajax: true }));
  ok(r.success === true && r.url === 'https://pps.whatsapp.net/foto.jpg', 'foto do contato pela Evolution', r);

  r = J(await n.pede('POST', '/api/whatsapp/EnviaWhatsApp/', { corpo: { id_consulta: String(consultas[0]), celular: '(11) 98888-7777' }, ajax: true }));
  ok(r.success === true, 'confirmação de consulta enviada', r);
  lg = await evoLog();
  const env = lg.filter((x) => x.p === '/message/sendMedia/clin1').pop();
  ok(env && env.corpo.number === '5511988887777' && env.corpo.mediatype === 'image' && env.corpo.caption.length > 5 && env.corpo.media.length > 100,
    'mensagem com a logo e o texto como legenda', env && { ...env.corpo, media: env.corpo.media.slice(0, 20) });
  const reg = db.prepare("select * from tb_whatsapp order by id desc limit 1").get();
  ok(reg && reg.id_consulta === consultas[0] && reg.status === 'pendente' && /^EVO/.test(reg.id_whatsapp) && reg.origem === '5511988887777@s.whatsapp.net', 'envio registrado (pendente)', reg);

  r = J(await n.pede('POST', '/api/whatsapp/EnviaWhatsApp/', { corpo: { id_consulta: String(consultas[0]), celular: '11900000000' }, ajax: true }));
  ok(r.success === false && /nao possui WhatsApp/.test(r.error), 'número sem WhatsApp não envia', r);

  // resposta do paciente pelo webhook da Evolution
  const evento = (texto, id, jid = '5511988887777@s.whatsapp.net', extra = {}) => ({
    event: 'messages.upsert', instance: 'clin1', server_url: EVO, apikey: 'chave-evo', date_time: '2026-11-23T18:30:00.000Z',
    data: { key: { remoteJid: jid, fromMe: false, id, ...extra }, pushName: 'Paciente', message: { conversation: texto }, messageType: 'conversation', messageTimestamp: 1795000000 },
  });
  const anon = new Navegador(base);
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: evento('1', 'RESP1') }));
  ok(r.success === true && r.acao === 'CONFIRMAÇÃO' && r.consulta === consultas[0] && r.retorno_enviado === true, 'resposta "1" confirma a consulta', r);
  const ag = db.prepare('select confirmacao from tb_agendas where id=?').get(consultas[0]);
  ok(Number(ag.confirmacao) === 1, 'consulta confirmada na agenda', ag);
  lg = await evoLog();
  const ret = lg.filter((x) => x.p === '/message/sendMedia/clin1').pop();
  ok(ret && ret.corpo.number === '5511988887777' && /c o n f i r m a d a|onfirmad/i.test(ret.corpo.caption), 'retorno ao paciente pela Evolution', ret && ret.corpo.caption);
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: evento('1', 'RESP1') }));
  ok(!r.acao, 'evento repetido não confirma de novo', r);

  // @lid com o telefone em remoteJidAlt
  await n.pede('POST', '/api/whatsapp/EnviaWhatsApp/', { corpo: { id_consulta: String(consultas[1]), celular: '11988887777' }, ajax: true });
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: evento('2 não vou', 'RESP2', '123456789012345@lid', { remoteJidAlt: '5511988887777@s.whatsapp.net' }) }));
  ok(r.success === true && r.acao === 'CANCELAMENTO' && r.consulta === consultas[1], 'resposta "2" de um @lid cancela', r);
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: { ...evento('oi', 'RESP3'), data: { key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: true, id: 'X' }, message: { conversation: '1' } } } }));
  ok(r.success === true && /ignorada/.test(r.info || ''), 'mensagem da própria clínica ignorada', r);
  // "Webhook by Events" ligado na Evolution: o evento vem no fim do endereço
  r = J(await anon.pede('POST', '/webhook/resposta//messages-upsert', { json: { event: 'connection.update', instance: 'clin1', data: { state: 'open' } } }));
  ok(r.success === true && /ignorado/.test(r.info || ''), 'endereço com o evento no fim (//messages-upsert) é aceito', r);
  r = J(await anon.pede('POST', '/webhook/resposta/messages-upsert', { json: { event: 'connection.update', instance: 'clin1', data: { state: 'open' } } }));
  ok(r.success === true && /ignorado/.test(r.info || ''), 'endereço com o evento no fim (/messages-upsert) é aceito', r);
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: { event: 'connection.update', instance: 'clin1', data: { state: 'open' } } }));
  ok(r.success === true && /ignorado/.test(r.info || ''), 'outros eventos ignorados', r);

  // @lid sem o telefone no evento: a Evolution informa pelos contatos da instância
  await n.pede('POST', '/api/whatsapp/EnviaWhatsApp/', { corpo: { id_consulta: String(consultas[0]), celular: '11988887777' }, ajax: true });
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: evento('1', 'RESP4', '999888777666555@lid') }));
  ok(r.success === true && r.acao === 'CONFIRMAÇÃO' && r.consulta === consultas[0], '@lid sem telefone no evento: achado pelos contatos da Evolution', r);
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: evento('quero remarcar', 'RESP5', '5511977776666@s.whatsapp.net') }));

  // botão "Webhook": conferência, aplicar e testar
  r = J(await n.pede('GET', '/api/whatsapp/webhook/?id_clinica=1', { ajax: true }));
  ok(r.provedor === 'evolution' && r.webhook_esperado === 'https://teste.local/webhook/resposta/' && r.confere === true && r.estado === 'WORKING'
    && r.ultimo_recebido && r.ultimo_recebido.servidor === 'Evolution API', 'webhook conferido (gravado = esperado; última resposta)', r);
  const rec = r.recebidas || [];
  ok(rec.length >= 4 && rec[0].texto === 'quero remarcar' && rec[0].resultado && /Opção inválida/.test(rec[0].resultado.message)
    && rec[1].de === '999888777666555@lid' && rec[1].resultado && rec[1].resultado.acao === 'CONFIRMAÇÃO',
  'últimas mensagens recebidas com o que foi feito', rec.slice(0, 3));
  await fetch(EVO + '/__webhook?i=clin1&url=http://outro/');
  r = J(await n.pede('GET', '/api/whatsapp/webhook/?id_clinica=1', { ajax: true }));
  ok(r.confere === false && r.no_servidor.url === 'http://outro/', 'webhook errado no servidor é apontado', r);
  r = await m.pede('POST', '/api/whatsapp/webhook/', { corpo: { id_clinica: '1', acao: 'aplicar' }, ajax: true });
  ok(r.status === 403, 'usuário comum não aplica o webhook', [r.status, r.texto]);
  r = J(await n.pede('POST', '/api/whatsapp/webhook/', { corpo: { id_clinica: '1', acao: 'aplicar' }, ajax: true }));
  ok(r.success === true && r.confere === true, 'aplicar grava o webhook certo', r);
  await fetch(EVO + '/__webhook?i=clin1&url=');
  r = J(await n.pede('GET', '/api/whatsapp/read_qrcode/?host=-&sessionId=clin1', { ajax: true }));
  const w = J(await n.pede('GET', '/api/whatsapp/webhook/?id_clinica=1', { ajax: true }));
  ok(r.status === 'WORKING' && w.confere === true, 'instância já conectada recebe o webhook ao conferir a conexão', w);

  // volta para o WAHA
  r = J(await n.pede('POST', '/api/whatsapp/provedor/', { corpo: { id_clinica: '1', provedor: 'waha' }, ajax: true }));
  ok(r.provedor === 'waha', 'volta para o WAHA', r);
  const antes = (await evoLog()).length;
  r = J(await n.pede('GET', '/api/whatsapp/read_qrcode/?host=http://127.0.0.1:9&sessionId=clin1', { ajax: true }));
  ok((await evoLog()).length === antes, 'no WAHA a Evolution não é chamada', r);
  // o endereço do WAHA vem do .env (WAHA_URL), não da clínica
  const wahaLog = (await (await fetch(EVO + '/__waha')).json());
  ok(wahaLog.some((x) => x.p === '/api/sessions/clin1' && x.chave === 'chave-waha'), 'WAHA chamado no endereço e com a chave do .env', wahaLog.slice(-3));
  r = J(await n.pede('GET', '/api/whatsapp/webhook/?id_clinica=1', { ajax: true }));
  ok(r.provedor === 'waha' && r.confere === true && r.estado === 'WORKING', 'webhook do WAHA conferido', r);
  r = J(await n.pede('POST', '/api/whatsapp/webhook/', { corpo: { id_clinica: '1', acao: 'testar' }, ajax: true }));
  ok(r.http === 200 || r.error, 'testar o endereço responde', r);
  return falhas;
}

module.exports = { roteiro, Navegador };

if (require.main === module) {
  roteiro(process.argv[2], process.argv[3]).then((f) => process.exit(f ? 1 : 0)).catch((e) => { console.error(e); process.exit(2); });
}
