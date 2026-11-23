// Evolution API falsa: guarda os pedidos e responde como a v2
const http = require('http');
const porta = Number(process.argv[2] || 8790);
const CHAVE = 'chave-evo';
const estado = {}; // instancia -> 'close' | 'connecting' | 'open'
const log = [];
http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (d) => { corpo += d; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    let j = null; try { j = corpo ? JSON.parse(corpo) : null; } catch (e) { j = corpo; }
    if (!u.pathname.startsWith('/__')) log.push({ m: req.method, p: u.pathname, apikey: req.headers.apikey, corpo: j });
    const resp = (st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/__log') return resp(200, log);
    if (u.pathname === '/__zera') { log.length = 0; for (const k of Object.keys(estado)) delete estado[k]; return resp(200, {}); }
    if (u.pathname === '/__abre') { estado[u.searchParams.get('i')] = 'open'; return resp(200, {}); }
    if (req.headers.apikey !== CHAVE) return resp(401, { status: 401, error: 'Unauthorized', response: { message: 'Unauthorized' } });
    const m = u.pathname.match(/^\/([a-zA-Z]+)\/([a-zA-Z]+)\/?(.*)$/);
    const [, grupo, acao, inst] = m || [];
    const i = decodeURIComponent(inst || '');
    if (grupo === 'instance' && acao === 'create') { estado[j.instanceName] = 'close'; return resp(201, { instance: { instanceName: j.instanceName, status: 'created' } }); }
    if (grupo === 'instance' && acao === 'connectionState') {
      if (!(i in estado)) return resp(404, { status: 404, error: 'Not Found', response: { message: [`The "${i}" instance does not exist`] } });
      return resp(200, { instance: { instanceName: i, state: estado[i] } });
    }
    if (grupo === 'instance' && acao === 'connect') { estado[i] = 'connecting'; return resp(200, { pairingCode: null, code: '2@abc', base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', count: 1 }); }
    if (grupo === 'instance' && acao === 'restart') return resp(200, { instance: { instanceName: i, state: 'connecting' } });
    if (grupo === 'webhook' && acao === 'set') return resp(201, { webhook: { instanceName: i, webhook: j.webhook } });
    if (grupo === 'chat' && acao === 'whatsappNumbers') return resp(200, j.numbers.map((n) => ({ exists: !n.endsWith('0000'), jid: `${n}@s.whatsapp.net`, number: n })));
    if (grupo === 'chat' && acao === 'fetchProfilePictureUrl') return resp(200, { wuid: `${j.number}@s.whatsapp.net`, profilePictureUrl: 'https://pps.whatsapp.net/foto.jpg' });
    if (grupo === 'message') return resp(201, { key: { remoteJid: `${j.number}@s.whatsapp.net`, fromMe: true, id: `EVO${log.length}` }, status: 'PENDING', message: {} });
    resp(404, { error: 'rota desconhecida' });
  });
}).listen(porta, '127.0.0.1', () => console.log('evolution falsa em', porta));
