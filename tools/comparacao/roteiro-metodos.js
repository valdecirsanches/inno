// Roteiro de métodos HTTP: cada endereço que não é do DRF com GET, POST, PUT, PATCH e
// DELETE. Views em classe do Django respondem 405 ao método que não têm; views em
// função aceitam qualquer um. metodos-django.json é gerado pelo Django (ver LEIAME.md).
const path = require('path');
const ROTAS = require(path.join(__dirname, '..', '..', 'server', 'metodos-django.json'));
const P = 'id=1&paciente=1&consulta=1&id_consulta=1&data=2026-11-10&medico=1&id_medico=1&prontuario=1&id_prontuario=1&dt=2026-11-10';
module.exports = {
  passos: function* () {
    yield ['GET', '/login/'];
    yield ['POST', '/login/', { corpo: { username: 'u', password: 's', next: '/' } }];
    const destroi = (p) => /exclu|desativ|limpa|del|remove|restaura|transfere|salva|duplica|clone|grava|novo|gerar|envia|add/i.test(p);
    const lista = ROTAS.map(([r, tipo]) => [r.replace(/<[^>]+>/g, '1').replace(/\^|\$/g, ''), tipo])
      .filter(([r]) => !/^\/(admin|static|media|login|logout|webhook)/.test(r));
    for (const [r] of lista.filter(([x]) => !destroi(x)).concat(lista.filter(([x]) => destroi(x)))) {
      for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        yield [m, `${r}?${P}`, m === 'GET' ? {} : { corpo: { id: '1' } }];
      }
    }
  },
};
