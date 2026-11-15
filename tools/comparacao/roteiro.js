// Roteiro padrão: login e um GET em cada endereço do AppClinic (lista gerada por
// tools/testes/rotas_django.py, no arquivo da variável ROTAS), com um conjunto fixo
// de parâmetros que as views costumam ler.
const fs = require('fs');
const PARAMS = new URLSearchParams({
  id: '1', paciente: '1', id_prontuario: '1', consulta: '1', id_consulta: '1', data: '2026-11-10', id_medico: '1', medico: '1',
  prescricao: '1', relatorio: '1', id_prescricao: '1', id_paciente: '1', dt: '2026-11-10', fk_medico: '1', exame: '1',
  dia_semana: '1', prontuario: '1', periodo: 'M', md: '1', id_atestado: '1', doc: '1', id_agenda: '1', ano: '2026',
  cids: 'A00', search: 'an', q: 'an', pesquisa: 'an', pesquisa_str: 'an', agenda: '1-1', id_exame: '1', id_relatorio: '1',
  id_remedio: '1', recibo: '1', rec: '1', rel: '1', pac: '1', idProntuario: '1', ids: '1', tipo: '1',
}).toString();

module.exports = {
  passos: function* () {
    yield ['GET', '/login/'];
    yield ['POST', '/login/', { corpo: { username: 'u', password: 's' } }];
    const rotas = fs.readFileSync(process.env.ROTAS || '/tmp/django.txt', 'utf8').trim().split('\n')
      .map((l) => l.split('  [')[0].replace(/<[^>]+>/g, '1').replace(/\^|\$/g, ''))
      .filter((p) => !/^\/(admin|static|media)\//.test(p) && !/^\/(login|logout)/.test(p));
    // as que apagam ou desativam vão por último, para não mudar o banco das outras
    const destroi = (p) => /exclu|desativ|limpa|del|remove|restaura|transfere|salva|duplica|clone|grava|novo|gerar|envia|sync|add/i.test(p);
    const unicas = [...new Set(rotas)];
    for (const p of unicas.filter((x) => !destroi(x)).concat(unicas.filter(destroi))) yield ['GET', `${p}?${PARAMS}`];
  },
};
