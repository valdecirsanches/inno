// Evolution API no AppClinic e no Inno, com uma Evolution falsa (falsa.js, porta 8790).
//   node tools/testes/evolution/falsa.js 8790 &
//   suba o sistema com EVOLUTION_URL=http://127.0.0.1:8790 EVOLUTION_API_KEY=chave-evo
//     EVOLUTION_WEBHOOK_URL=https://teste.local/webhook/resposta/ (e NO_PROXY=127.0.0.1)
//     num banco SQLite de teste com os dados de tools/comparacao (usuário 1 = diego/teste123,
//     usuário 2 = medico/teste123, consultas 2 e 8 do paciente 2)
//   node tools/testes/evolution/teste.js http://127.0.0.1:PORTA caminho/do/banco.sqlite3
// O mesmo roteiro passa no AppClinic (Django) e no Inno.
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
const base = process.argv[2], arq = process.argv[3];
const EVO = 'http://127.0.0.1:8790';
let falhas = 0;
const ok = (cond, txt, extra) => { console.log(`${cond ? 'OK  ' : 'FALHOU'} ${txt}${cond ? '' : ' -> ' + JSON.stringify(extra).slice(0, 400)}`); if (!cond) falhas++; };
const J = (r) => { try { return JSON.parse(r.texto); } catch (e) { return { _texto: r.texto.slice(0, 300), _status: r.status }; } };
(async () => {
  const db = new D(arq);
  db.prepare("update tb_clinicas set whatsappClient='clin1', whatsapp_url='http://127.0.0.1:9/waha-desligado', whatsapp_texto='Confirme', whatsapp_confirma='Confirmada!', whatsapp_cancela='Cancelada!' where id=1").run();
  db.prepare("update tb_usuarios set is_superuser=0, administrador='False' where id=2").run();
  db.prepare("update tb_usuarios set is_superuser=1 where id=1").run();
  await fetch(EVO + '/__zera');
  const evoLog = async () => (await (await fetch(EVO + '/__log')).json());
  const n = new Navegador(base); await n.entra();
  let r = J(await n.pede('GET', '/api/whatsapp/provedor/?id_clinica=1', { ajax: true }));
  ok(r.provedor === 'waha' && r.podeTrocar === true && r.evolutionDisponivel === true, 'padrão é WAHA; super pode trocar', r);

  const m = new Navegador(base); await m.entra('medico', 'teste123');
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
  ok(lg.some((x) => x.p === '/instance/create' && x.corpo.instanceName === 'clin1') && lg.some((x) => x.p === '/webhook/set/clin1' && x.corpo.webhook.url === 'https://teste.local/webhook/resposta/'),
    'instância criada com o webhook das respostas', lg.map((x) => x.p));
  ok(lg.every((x) => x.p.startsWith('/__') || x.apikey === 'chave-evo'), 'chave da Evolution enviada', lg.map((x) => x.apikey));

  await fetch(EVO + '/__abre?i=clin1');
  r = J(await n.pede('GET', '/api/whatsapp/read_qrcode/?host=-&sessionId=clin1', { ajax: true }));
  ok(r.status === 'WORKING' && r.connected === true, 'conectado aparece como WORKING', r);

  r = J(await n.pede('POST', '/api/whatsapp/restart_session/', { json: { host: '-', sessionId: 'clin1' }, ajax: true }));
  ok(r.success === true && r.status_before === 'WORKING', 'reiniciar sessão na Evolution', r);

  r = J(await n.pede('POST', '/api/whatsapp/info/', { corpo: { celular: '11988887777' }, ajax: true }));
  ok(r.success === true && r.url === 'https://pps.whatsapp.net/foto.jpg', 'foto do contato pela Evolution', r);

  r = J(await n.pede('POST', '/api/whatsapp/EnviaWhatsApp/', { corpo: { id_consulta: '2', celular: '(11) 98888-7777' }, ajax: true }));
  ok(r.success === true, 'confirmação de consulta enviada', r);
  lg = await evoLog();
  const env = lg.filter((x) => x.p === '/message/sendMedia/clin1').pop();
  ok(env && env.corpo.number === '5511988887777' && env.corpo.mediatype === 'image' && env.corpo.caption.length > 5 && env.corpo.media.length > 100,
    'mensagem com a logo e o texto como legenda', env && { ...env.corpo, media: env.corpo.media.slice(0, 20) });
  const reg = db.prepare("select * from tb_whatsapp order by id desc limit 1").get();
  ok(reg && reg.id_consulta === 2 && reg.status === 'pendente' && /^EVO/.test(reg.id_whatsapp) && reg.origem === '5511988887777@s.whatsapp.net', 'envio registrado (pendente)', reg);

  r = J(await n.pede('POST', '/api/whatsapp/EnviaWhatsApp/', { corpo: { id_consulta: '2', celular: '11900000000' }, ajax: true }));
  ok(r.success === false && /nao possui WhatsApp/.test(r.error), 'número sem WhatsApp não envia', r);

  // resposta do paciente pelo webhook da Evolution
  const evento = (texto, id, jid = '5511988887777@s.whatsapp.net', extra = {}) => ({
    event: 'messages.upsert', instance: 'clin1', server_url: EVO, apikey: 'chave-evo', date_time: '2026-11-23T18:30:00.000Z',
    data: { key: { remoteJid: jid, fromMe: false, id, ...extra }, pushName: 'Paciente', message: { conversation: texto }, messageType: 'conversation', messageTimestamp: 1795000000 },
  });
  const anon = new Navegador(base);
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: evento('1', 'RESP1') }));
  ok(r.success === true && r.acao === 'CONFIRMAÇÃO' && r.consulta === 2 && r.retorno_enviado === true, 'resposta "1" confirma a consulta', r);
  const ag = db.prepare('select confirmacao from tb_agendas where id=2').get();
  ok(Number(ag.confirmacao) === 1, 'consulta confirmada na agenda', ag);
  lg = await evoLog();
  const ret = lg.filter((x) => x.p === '/message/sendMedia/clin1').pop();
  ok(ret && ret.corpo.number === '5511988887777' && /c o n f i r m a d a/.test(ret.corpo.caption), 'retorno ao paciente pela Evolution', ret && ret.corpo.caption);
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: evento('1', 'RESP1') }));
  ok(!r.acao, 'evento repetido não confirma de novo', r);

  // @lid com o telefone em remoteJidAlt
  await n.pede('POST', '/api/whatsapp/EnviaWhatsApp/', { corpo: { id_consulta: '8', celular: '11988887777' }, ajax: true });
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: evento('2 não vou', 'RESP2', '123456789012345@lid', { remoteJidAlt: '5511988887777@s.whatsapp.net' }) }));
  ok(r.success === true && r.acao === 'CANCELAMENTO' && r.consulta === 8, 'resposta "2" de um @lid cancela', r);
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: { ...evento('oi', 'RESP3'), data: { key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: true, id: 'X' }, message: { conversation: '1' } } } }));
  ok(r.success === true && /ignorada/.test(r.info || ''), 'mensagem da própria clínica ignorada', r);
  r = J(await anon.pede('POST', '/webhook/resposta/', { json: { event: 'connection.update', instance: 'clin1', data: { state: 'open' } } }));
  ok(r.success === true && /ignorado/.test(r.info || ''), 'outros eventos ignorados', r);

  // volta para o WAHA
  r = J(await n.pede('POST', '/api/whatsapp/provedor/', { corpo: { id_clinica: '1', provedor: 'waha' }, ajax: true }));
  ok(r.provedor === 'waha', 'volta para o WAHA', r);
  const antes = (await evoLog()).length;
  r = J(await n.pede('GET', '/api/whatsapp/read_qrcode/?host=http://127.0.0.1:9&sessionId=clin1', { ajax: true }));
  ok((await evoLog()).length === antes, 'no WAHA a Evolution não é chamada', r);
  console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
