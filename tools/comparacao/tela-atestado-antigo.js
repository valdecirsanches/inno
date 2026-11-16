// Tela: atestado antigo (como o do usuário em 15/11/2026): CID que não está na tabela de CID
// ("G43", "10") e gravado sem usuário. Deve mostrar o CID, salvar e imprimir.
const base = require('./tela-atestado.js');
module.exports = {
  prepara(sq) {
    // como na tela do usuário: atestados antigos com CID que não está na tabela de CID
    sq.exec(`UPDATE tb_atestado SET cid = 'G43', fk_consulta_id = 1, id_usuario = NULL, requerente = 'PAI', afastado_por = 15`);
    sq.exec(`INSERT INTO tb_atestado (id, fk_prontuario_id, fk_medico_id, fk_consulta_id, id_usuario, requerente, dt_referencia, hora_chegada, hora_saida, para, volta, afastado_por, cid, data_salvo)
             VALUES (2, 1, 1, 1, 1, '', '2024-01-22', '10:00:00', '11:00:00', 'C', 'A', NULL, '10', '2016-06-01 12:45:00')`);
  },
  executa: base.executa,
};
