// Testes da API da Memed (/api/memed/), com uma Memed falsa local.
// Uso (na raiz do inno, com as dependências de desenvolvimento): node tools/testes/etapa6-memed.js
const http = require('http');
const assert = require('assert/strict');

const pedidos = [];
let respostaPatch = { status: 200, corpo: '{"data": {"attributes": {"status": "ativo", "nome_completo": "Jo\\u00e3o da Silva", "ambiente": "producao", "peso": 1.0}}}' };
const memed = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const u = new URL('http://x' + req.url);   // req.url pode começar com // (check-key)
    pedidos.push({ metodo: req.method, caminho: u.pathname, busca: Object.fromEntries(u.searchParams), corpo, headers: req.headers });
    const envia = (st, txt) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(txt); };
    if (u.pathname === '//v1/sinapse-prescricao/check-key') return envia(200, '{"status": "ok", "valor": 1.0, "lista": [1, 2]}');
    if (u.pathname === '/v1/especialidades') return envia(200, '{"data": [{"id": 1, "attributes": {"nome": "Neurologia", "grupo": null}}, {"id": 50, "attributes": {"nome": "Cardiologia", "grupo": "Clínica"}}]}');
    if (u.pathname === '/v1/cidades/') return envia(200, u.searchParams.get('filter[q]') === 'Osasco' ? '{"data": [{"id": 5213}]}' : '{"data": []}');
    if (u.pathname === '/v1/sinapse-prescricao/usuarios' && req.method === 'POST') return envia(201, '{"data": {"attributes": {"token": "TOKEN-NOVO"}}}');
    if (u.pathname.startsWith('/v1/sinapse-prescricao/usuarios/') && req.method === 'GET') {
      if (u.pathname.endsWith('/naoexiste')) return envia(404, '{"errors": [{"title": "Not found"}]}');
      return envia(200, '{"data": {"attributes": {"token": "TOKEN-LIDO", "status": "ativo", "crm": "123456", "uf": "SP"}}}');
    }
    if (req.method === 'PATCH') return envia(respostaPatch.status, respostaPatch.corpo);
    envia(500, 'erro');
  });
});

memed.listen(0, async () => {
  const URL_MEMED = `http://127.0.0.1:${memed.address().port}/`;
  const t = await require('./base')({
    env: { MEMED_URL_API_BASE: URL_MEMED, MEMED_API_KEY: 'chave', MEMED_SECRET_KEY: 'segredo', MEMED_DATA_TOKEN: 'RESERVA' },
    antesDoServidor: (sq) => {
      sq.exec(`UPDATE tb_especialidades SET nome = 'Neurocirurgia', codigo = 'N1' WHERE id = 1`);
      sq.exec(`UPDATE medicos SET cpf = '123.456.789-00', cpf_hash = 'hash1', data_nascimento = '1970-03-04', genero = 'M',
        crm_uf = 'SP', email = 'joao@x.com', celular = '(11) 99999-0000', id_especialidade = 1, habilitado_memed = 0, memed_token = NULL WHERE id = 1`);
      sq.exec(`INSERT INTO medicos (id, medico, crm, cpf_hash) VALUES (2, 'Fulano', '', 'naoexiste')`);
    },
  });
  const { sq, vai, confere } = t;
  try {
    await t.entra();
    let r = await vai('/api/memed/'); let x = await r.text();
    await confere('lista com médicos: 500 (Manager não fatia)', () => assert.equal(r.status, 500));
    r = await vai('/api/memed/?offset=50'); x = await r.text();
    await confere('lista com offset além do total: vazia', () => assert.match(x, /^\{"count":2,"next":null,"previous":".*","results":\[\]\}$/));
    r = await vai('/api/memed/1/'); x = JSON.parse(await r.text());
    await confere('detalhe = MedicoSerializer', () => { assert.equal(r.status, 200); assert.equal(x.id, 1); assert.equal(x.medico, 'João da Silva'); });

    r = await vai('/api/memed/check-validade-chave-acesso/'); x = await r.text();
    await confere('check-validade-chave-acesso (URL com // como no original)', () => {
      assert.equal(x, '{"status": "ok", "valor": 1.0, "lista": [1, 2]}');
      const p = pedidos.at(-1); assert.equal(p.busca['api-key'], 'chave'); assert.equal(p.busca['secret-key'], 'segredo');
    });

    r = await vai('/api/memed/especialidades-syncronize/'); x = await r.text();
    await confere('especialidades-syncronize grava como TbEspecialidades(...).save()', () => {
      assert.equal(x, '{"success": "ok"}');
      assert.deepEqual(sq.prepare('SELECT id, codigo, descricao, nome, grupo FROM tb_especialidades ORDER BY id').all(), [
        { id: 1, codigo: '', descricao: '', nome: 'Neurologia', grupo: null },
        { id: 50, codigo: '', descricao: '', nome: 'Cardiologia', grupo: 'Clínica' },
      ]);
    });

    r = await vai('/api/memed/1/situacao/'); x = JSON.parse(await r.text());
    await confere('situacao', () => {
      assert.equal(x.situacao.pronto, true); assert.equal(x.situacao.especialidade, 'Neurologia'); assert.equal(x.situacao.habilitado, false);
      assert.equal(x.situacao.checklist.length, 9);
    });
    r = await vai('/api/memed/2/situacao/'); x = JSON.parse(await r.text());
    await confere('situacao com pendências', () => {
      assert.equal(x.situacao.pronto, false);
      assert.deepEqual(x.situacao.checklist.filter((i) => !i.ok).map((i) => i.campo), ['nome', 'cpf', 'data_nascimento', 'genero', 'crm', 'email', 'celular', 'cidade', 'especialidade']);
    });
    r = await vai('/api/memed/2/doctor-add/'); x = JSON.parse(await r.text());
    await confere('doctor-add sem cadastro completo: 400', () => { assert.equal(r.status, 400); assert.match(x.erro, /^Complete o cadastro antes de habilitar: Nome e sobrenome, CPF/); });

    sq.exec(`UPDATE medicos SET empresa_cidade = 'Lugar Nenhum' WHERE id = 1`);
    r = await vai('/api/memed/1/doctor-add/'); x = JSON.parse(await r.text());
    await confere('doctor-add com cidade desconhecida: 400', () => { assert.equal(r.status, 400); assert.equal(x.erro, 'A cidade "Lugar Nenhum/SP" do consultório não foi encontrada na Memed. Confira a grafia.'); });
    sq.exec(`UPDATE medicos SET empresa_cidade = 'Osasco' WHERE id = 1`);
    r = await vai('/api/memed/1/doctor-add/'); x = JSON.parse(await r.text());
    await confere('doctor-add habilita e guarda o token', () => {
      assert.equal(r.status, 200); assert.equal(x.success, 'Médico habilitado na Memed. Ele já pode prescrever no atendimento.');
      const p = pedidos.at(-1);
      assert.equal(p.caminho, '/v1/sinapse-prescricao/usuarios');
      const c = JSON.parse(p.corpo);
      assert.deepEqual(c.data.attributes, { external_id: 'hash1', nome: 'João', sobrenome: 'da Silva', cpf: '12345678900', board: { board_code: 'CRM', board_number: '123456', board_state: 'SP' }, email: 'joao@x.com', telefone: '11999990000', sexo: 'M', data_nascimento: '04/03/1970' });
      assert.deepEqual(c.data.relationships, { cidade: { data: { type: 'cidades', id: 5213 } }, especialidade: { data: { type: 'especialidades', id: 1 } } });
      assert.ok(p.corpo.includes('"Jo\\u00e3o"'));   // json.dumps do requests (ensure_ascii)
      const m = sq.prepare('SELECT memed_token, habilitado_memed FROM medicos WHERE id = 1').get();
      assert.deepEqual(m, { memed_token: 'TOKEN-NOVO', habilitado_memed: 1 });
    });

    r = await vai('/api/memed/acesso/'); x = JSON.parse(await r.text());
    await confere('acesso pelo médico do usuário', () => {
      assert.equal(x.origem, 'medico'); assert.equal(x.token, 'TOKEN-NOVO');
      assert.equal(x.script, 'https://partners.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js');
      assert.equal(x.prescritor.tem_token, true);
    });
    sq.exec(`UPDATE tb_usuarios SET id_medico = NULL WHERE id = 1`);
    r = await vai('/api/memed/acesso/?consulta=99999'); x = JSON.parse(await r.text());
    await confere('acesso sem médico: token reserva', () => assert.deepEqual([x.origem, x.token, x.prescritor], ['reserva', 'RESERVA', null]));
    sq.exec(`UPDATE medicos SET memed_token = NULL WHERE id = 1`);
    r = await vai('/api/memed/acesso/?consulta=1'); x = JSON.parse(await r.text());
    await confere('acesso pela consulta: busca o token na Memed', () => {
      assert.deepEqual([x.origem, x.token], ['medico', 'TOKEN-LIDO']);
      assert.equal(sq.prepare('SELECT memed_token FROM medicos WHERE id = 1').get().memed_token, 'TOKEN-LIDO');
    });

    r = await vai('/api/memed/doctor-data-read/?doc=2'); x = JSON.parse(await r.text());
    await confere('doctor-data-read: médico que a Memed não conhece', () => { assert.equal(r.status, 404); assert.match(x.erro, /ainda não está cadastrado/); });
    r = await vai('/api/memed/doctor-data-read/', { method: 'POST', json: true, body: JSON.stringify({ doc: 1 }) }); x = JSON.parse(await r.text());
    await confere('doctor-data-read (POST JSON)', () => {
      assert.equal(r.status, 200);
      assert.deepEqual(x.memed, { status: 'ativo', user_type: '', nome_completo: '', crm: '123456', uf: 'SP', cpf: '', data_nascimento: '', telefone: '', especialidade: '', email: '' });
    });
    r = await vai('/api/memed/doctor-data-read/?doc=999'); x = await r.text();
    await confere('doctor-data-read de quem não existe', () => { assert.equal(r.status, 404); assert.equal(x, '{"erro": "M\\u00e9dico n\\u00e3o encontrado."}'); });
    r = await vai('/api/memed/doctor-data-read/?doc=abc');
    await confere('doctor-data-read com id inválido: 500', () => assert.equal(r.status, 500));

    r = await vai('/api/memed/doctor-data-syncronize/?doc=1'); x = await r.text();
    await confere('doctor-data-syncronize', () => {
      assert.equal(r.status, 200);
      assert.ok(x.startsWith('{"success": "Dados do m\\u00e9dico atualizados na Memed.", "memed": {"status": "ativo", "user_type": "", "nome_completo": "Jo\\u00e3o da Silva",'));
      assert.ok(x.includes('"ambiente": "producao"}'));
      assert.equal(pedidos.at(-1).metodo, 'PATCH');
    });
    respostaPatch = { status: 200, corpo: '{"errors": [{"title": "Inválido", "detail": "CRM"}]}' };
    r = await vai('/api/memed/doctor-data-syncronize/?doc=1'); x = JSON.parse(await r.text());
    await confere('doctor-data-syncronize com errors na resposta: 400', () => { assert.equal(r.status, 400); assert.equal(x.erro, 'A Memed recusou: Inválido - CRM'); });
    respostaPatch = { status: 422, corpo: '{"errors": [{"code": 7}]}' };
    r = await vai('/api/memed/doctor-data-syncronize/?doc=1'); x = JSON.parse(await r.text());
    await confere('erro da Memed sem title/detail: str(dict)', () => assert.equal(x.erro, "A Memed recusou: {'code': 7}"));

    process.env.MEMED_URL_API_BASE = 'http://127.0.0.1:1/';
    require('../../server/config').memed.apiBase = 'http://127.0.0.1:1/';
    r = await vai('/api/memed/doctor-data-read/?doc=1'); x = JSON.parse(await r.text());
    await confere('sem conexão: 502', () => { assert.equal(r.status, 502); assert.match(x.erro, /^Não foi possível falar com a Memed/); });
    await t.fim();
  } catch (e) {
    await t.fim(e);
  } finally {
    memed.close();
  }
});
