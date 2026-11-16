// Teste da tela no navegador (Chromium sem janela): AppClinic x Inno, cada um com sua cópia do
// mesmo banco MySQL. Faz os cliques de um roteiro de tela e mostra, lado a lado, o que a tela
// exibiu, os erros de JavaScript e as chamadas que falharam.
// Uso: NAVEGADOR=<pasta com puppeteer-core e @sparticuz/chromium> \
//      node tools/comparacao/navegador.js <pasta do appclinic> <python do venv> <roteiro-tela.js>
// (MariaDB rodando; ver LEIAME.md)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const R = path.join(__dirname, '..', '..');
const APPCLINIC = path.resolve(process.argv[2] || path.join(R, '..', 'appclinic'));
const PY = process.argv[3] || 'python3';
const ROTEIRO = require(path.resolve(process.argv[4] || path.join(__dirname, 'tela-atestado.js')));
const NAV = process.env.NAVEGADOR || path.join(R, '..', 'navegador');
const puppeteer = require(path.join(NAV, 'node_modules', 'puppeteer-core'));
const chromium = require(path.join(NAV, 'node_modules', '@sparticuz', 'chromium'));
const my = require('./mysql');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'navegador-'));
Object.assign(process.env, { DB_CLIENT: 'mysql2', DB_HOST: my.CFG.host, DB_USER: my.CFG.user, DB_PASSWORD: my.CFG.password, DB_NAME: 'cmp_inno', SECRET_KEY: 'x'.repeat(40), DEBUG: '', MEDIA_ROOT: path.join(tmp, 'media-inno') });
const porta = () => new Promise((ok) => { const s = require('net').createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });

async function percorre(browser, base) {
  const pg = await browser.newPage();
  await pg.setViewport({ width: 1400, height: 1000 });
  const log = { erros: [], falhas: [], janelas: [] };
  // bibliotecas que a tela busca em CDN: servidas das mesmas versões do npm (o ambiente de
  // teste pode não ter internet); fontes e ícones da internet são ignorados
  const CDN = [
    [/axios\/0\.19\.0\/axios\.js/, 'axios/dist/axios.js'],
    [/jquery\.mask\/1\.14\.10\/jquery\.mask\.js/, 'jquery-mask-plugin/dist/jquery.mask.js'],
    [/bootstrap3-editable\/js\/bootstrap-editable\.min\.js/, 'x-editable/dist/bootstrap3-editable/js/bootstrap-editable.min.js'],
  ];
  await pg.setRequestInterception(true);
  pg.on('request', (rq) => {
    const u = rq.url();
    if (u.startsWith(base)) return rq.continue();
    const local = CDN.find(([re]) => re.test(u));
    if (local) return rq.respond({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(NAV, 'node_modules', local[1])) });
    return rq.respond({ status: 200, contentType: /\.css|css\?/.test(u) ? 'text/css' : 'application/javascript', body: '' });
  });
  pg.on('pageerror', (e) => log.erros.push('JS: ' + e.message.split('\n')[0]));
  pg.on('console', (m) => { if (m.type() === 'error') log.erros.push('console: ' + m.text().slice(0, 200)); });
  pg.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(base)) log.falhas.push(`${r.status()} ${r.request().method()} ${r.url().replace(base, '')}`); });
  pg.on('requestfailed', (r) => log.falhas.push(`falhou ${r.url().replace(base, '')}`));
  // janelas abertas pela tela (window.open da impressão): a cadeia de respostas de cada uma
  pg.on('popup', async (p2) => {
    const cadeia = [];
    p2.on('response', (r) => { if (r.request().isNavigationRequest()) cadeia.push(`${r.status()} ${r.url().replace(base, '')} ${r.headers()['content-type'] || ''}`); });
    await new Promise((r) => setTimeout(r, 5000));
    let texto = '';
    try { texto = (await p2.evaluate(() => document.body && document.body.innerText) || '').slice(0, 160).replace(/\s+/g, ' '); } catch (e) { /* PDF */ }
    log.janelas.push(`${cadeia.join(' => ')}${texto ? ' | texto: ' + texto : ''}`);
  });
  await pg.goto(base + '/login/');
  await pg.type('[name=username]', 'u');
  await pg.type('[name=password]', 's');
  await Promise.all([pg.waitForNavigation(), pg.click('[type=submit]')]);
  const saida = await ROTEIRO.executa(pg, base, (ms) => new Promise((r) => setTimeout(r, ms)));
  await new Promise((r) => setTimeout(r, 2500));
  await pg.close();
  return Object.assign(log, { saida });
}

(async () => {
  await my.cria(['cmp_django', 'cmp_inno'], ROTEIRO.prepara);
  const [pDj, pIn] = [await porta(), await porta()];
  const dj = spawn(PY, ['manage.py', 'runserver', `127.0.0.1:${pDj}`, '--noreload', '--insecure'], {
    cwd: APPCLINIC,
    env: Object.assign({}, process.env, { DJ_DB: '/dev/null', DJ_MYSQL: 'cmp_django', DJ_MEDIA: path.join(tmp, 'media-dj'), DJANGO_SETTINGS_MODULE: 'teste_settings', PYTHONPATH: `${__dirname}:${APPCLINIC}`, PYTHONIOENCODING: 'utf-8', LANG: 'pt_BR.UTF-8' }),
    stdio: ['ignore', 'ignore', fs.openSync(path.join(tmp, 'django.log'), 'w')],
  });
  const app = require(R + '/server/index.js');
  const srv = await new Promise((ok) => { const s = app.listen(pIn, () => ok(s)); });
  for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${pDj}/login/`); break; } catch (e) { await new Promise((r) => setTimeout(r, 300)); } }
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  const res = {};
  for (const [nome, base] of [['AppClinic', `http://127.0.0.1:${pDj}`], ['Inno', `http://127.0.0.1:${pIn}`]]) {
    try { res[nome] = await percorre(browser, base); } catch (e) { res[nome] = { erros: ['ROTEIRO: ' + e.message], falhas: [], janelas: [], saida: {} }; }
  }
  for (const [nome, r] of Object.entries(res)) {
    console.log(`\n===== ${nome}`);
    for (const [k, v] of Object.entries(r.saida || {})) console.log(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    console.log('  erros de JavaScript:', r.erros.length ? '\n    ' + r.erros.join('\n    ') : 'nenhum');
    console.log('  chamadas com falha:', r.falhas.length ? '\n    ' + r.falhas.join('\n    ') : 'nenhuma');
    console.log('  janelas abertas:', r.janelas.length ? '\n    ' + r.janelas.join('\n    ') : 'nenhuma');
  }
  console.log(`\n(log do Django: ${path.join(tmp, 'django.log')})`);
  await browser.close(); dj.kill(); srv.close();
  setTimeout(() => process.exit(0), 200);
})();
