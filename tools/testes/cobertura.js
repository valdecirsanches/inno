// Confere se o Inno responde a todos os endereços do AppClinic.
// Uso (na raiz do inno): python3 tools/testes/rotas_django.py ../appclinic > /tmp/django.txt
//                        node tools/testes/cobertura.js /tmp/django.txt
// Mostra os endereços que caem na página "não encontrado" do Inno.
// Falsos positivos conhecidos: as ações *_memed do appClinic/views.py (classe que nenhuma URL usa)
// e /api/prescricao/remedioremedio/ (o script junta o prefixo do router duas vezes).
const fs = require('fs');
(async () => {
  const t = await require('./base')({});
  await t.entra();
  const linhas = fs.readFileSync(process.argv[2] || '/tmp/django.txt', 'utf8').trim().split('\n');
  const falta = [];
  for (const l of linhas) {
    const p = l.split('  [')[0].replace(/<[^>]+>/g, '1').replace(/\^|\$/g, '');
    if (p.startsWith('/admin/') || p.startsWith('/static/') || p.startsWith('/media/')) continue;
    const r = await t.vai(p, { headers: { accept: 'text/html' } });
    const x = await r.text();
    if (r.status === 404 && x.includes('The requested resource was not found')) falta.push(l);
  }
  console.log(`${linhas.length} endereços no AppClinic; sem resposta no Inno: ${falta.length}`);
  for (const f of falta) console.log('  ' + f);
  await t.fim();
})();
