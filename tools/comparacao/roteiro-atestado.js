// Roteiro do atestado no atendimento: abrir a lista, selecionar um atestado (o CID tem de vir),
// alterar e imprimir — como a tela faz (Prontuario/Atestado/index.js e Atestado.js).
module.exports = {
  prepara(sq) {
    sq.exec(`UPDATE tb_atestado SET cid = 'M54,A00', fk_consulta_id = 1, requerente = 'Empresa X', id_usuario = 1`);
    sq.exec(`INSERT INTO tb_atestado (id, fk_prontuario_id, fk_medico_id, fk_consulta_id, id_usuario, requerente, dt_referencia, hora_chegada, hora_saida, para, volta, afastado_por, cid, data_salvo)
             VALUES (2, 1, 1, 1, 1, '', '2026-11-12', '10:00:00', '10:40:00', 'C', 'A', NULL, 'M54', '2026-11-12 10:45:00')`);
  },
  passos: function* () {
    yield ['GET', '/login/'];
    yield ['POST', '/login/', { corpo: { username: 'u', password: 's', next: '/' } }];
    yield ['GET', '/atendimento/?consulta=1'];
    // CarregaAtestados
    yield ['GET', '/api/atestado/?id_prontuario=1&limit=10&offset=0'];
    yield ['POST', '/api/atestado/get-ultimo-atestado/', { json: true, corpo: { id_paciente: '1' } }];
    // ReadAtestado(id): atestado.index(id) + changeCID10(cid)
    for (const id of ['1', '2']) {
      yield ['GET', `/api/atestado/${id}/`];
      yield ['GET', '/api/medico/get-cid10/?cids=M54,A00'];
      yield ['GET', '/api/medico/get-cid10/?cids=M54'];
    }
    yield ['GET', '/api/medico/get-cid10/?cids='];
    yield ['GET', '/api/medico/get-cid10/?cids=undefined'];
    yield ['GET', '/api/medico/get-cid10/?cids=null'];
    // AddAtestado
    yield ['POST', '/api/atestado/get-consulta/', { json: true, corpo: { id_consulta: '1' } }];
    // UpdateAtestado: serializeObject do formulário, cid juntado com vírgula
    const form = { id: '1', fk_prontuario: '1', fk_medico: '1', fk_consulta: '1', fk_usuario: '1', requerente: 'Empresa Y',
      dt_referencia: '2026-11-10', hora_chegada: '08:00', hora_saida: '09:30', para: 'A', volta: 'C', afastado_por: '2',
      comparecer_em: '', comparecer_as: '', cid: 'M54,A00' };
    yield ['PUT', '/api/atestado/1/', { json: true, corpo: form }];
    yield ['GET', '/api/atestado/1/'];
    yield ['PUT', '/api/atestado/1/', { json: true, corpo: Object.assign({}, form, { cid: '' }) }];
    yield ['PUT', '/api/atestado/1/', { json: true, corpo: Object.assign({}, form, { cid: 'M54' }) }];
    yield ['POST', '/api/atestado/', { json: true, corpo: Object.assign({}, form, { id: '' }) }];
    // ImprimeAtestado (Atestado.js e listaAtendimento.js)
    for (const q of ['id_consulta=1&id_atestado=1', 'id_consulta=1&id_atestado=2', 'id_consulta=1', 'id_consulta=1&id_atestado=3', 'id_consulta=undefined&id_atestado=1']) {
      yield ['GET', `/atendimento/ImprimeAtestado?${q}`];
      yield ['GET', `/atendimento/ImprimeAtestado/?${q}`];
    }
  },
};
