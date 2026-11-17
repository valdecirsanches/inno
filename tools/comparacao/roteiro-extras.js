// Roteiro de "Imagens e anexos" (Prontuario/Extras) com a nuvem: o AppClinic
// (appClinic/nuvem.py) e o Inno (server/util/armazenamento.js) gravam e leem na
// mesma nuvem, ligando caminho -> id na tabela inno_nuvem.
// Precisa de uma nuvem rodando (ex.: a cópia do ~/apps/nuvem/main.js) e NUVEM_URL:
//   NUVEM_URL=http://127.0.0.1:5199 node tools/comparacao/compara.js ../appclinic ~/venv-dj/bin/python tools/comparacao/roteiro-extras.js
const fs = require('fs');
const path = require('path');

const ANTIGA = 'extras/1/2024/05/10/raio_x_antigo.jpg';

module.exports = {
  prepara(sq) {
    // uma imagem enviada antes da mudança: só na pasta media/ de cada lado, com o registro no banco
    const tmp = path.dirname(process.env.MEDIA_ROOT);
    for (const m of ['media-dj', 'media-inno']) {
      const f = path.join(tmp, m, ANTIGA);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, Buffer.from('jpg enviado pelo AppClinic antes da nuvem'));
    }
    sq.exec(`INSERT INTO tb_extra (id, fk_prontuario_id, fk_consulta_id, fk_medico_id, file, ativo, data_salvo)
             VALUES (50, 1, 1, 1, '${ANTIGA}', 1, '2024-05-10 09:00:00')`);
    // a tabela já existe dos dois lados, para o comparador conferir as linhas a cada passo
    sq.exec(`CREATE TABLE IF NOT EXISTS inno_nuvem (caminho VARCHAR(255) NOT NULL PRIMARY KEY, nuvem_id VARCHAR(100) NOT NULL,
             tamanho BIGINT NULL, tipo VARCHAR(100) NULL, criado_em DATETIME NULL)`);
  },
  passos: function* () {
    yield ['GET', '/login/'];
    yield ['POST', '/login/', { corpo: { username: 'u', password: 's', next: '/' } }];
    yield ['GET', '/atendimento/?consulta=1'];
    // a antiga (só na pasta) aparece e abre; ao abrir, vai para a nuvem
    yield ['GET', '/prontuario/Extras/CarregaExtras/?prontuario=1'];
    yield ['GET', '/prontuario/Extras/downloadFile.json?extra=50'];
    yield ['GET', `/media/${ANTIGA}`];
    // envio pela tela (dropzone)
    const img = { nome: 'foto teste.png', tipo: 'image/png', dados: Buffer.from('\x89PNG imagem enviada pela tela') };
    yield ['POST', '/prontuario/Extras/uploadFile.json', { corpo: { fk_prontuario: '1', fk_consulta: '1', fk_medico: '1' }, arquivos: { file: img } }];
    yield ['POST', '/prontuario/Extras/uploadFile.json', { corpo: { fk_prontuario: '1', fk_consulta: '1', fk_medico: '1' }, arquivos: { file: img } }];
    yield ['GET', '/prontuario/Extras/CarregaExtras/?prontuario=1'];
    yield ['GET', '/prontuario/Extras/downloadFile.json?extra=51'];
    yield ['GET', '/prontuario/Extras/downloadFile.json?extra=999'];
    yield ['GET', '/media/extras/1/nao-existe.png'];
    // API
    yield ['GET', '/api/extras/?fk_prontuario=1'];
    yield ['POST', '/api/extras/recuperar_imagens/', { corpo: { id_paciente: '1' } }];
    yield ['POST', '/api/extras/recuperar_imagens/', { corpo: { id_paciente: '2' } }];
    yield ['POST', '/api/extras/rastrear/', { corpo: { id_paciente: '1' } }];
    // imagem binária de verdade: o "recuperar imagens" do AppClinic dá erro 500 (não decodifica UTF-8)
    const binaria = { nome: 'exame.jpg', tipo: 'image/jpeg', dados: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x0a, 0xff, 0xd9]) };
    yield ['POST', '/prontuario/Extras/uploadFile.json', { corpo: { fk_prontuario: '2', fk_consulta: '1', fk_medico: '1' }, arquivos: { file: binaria } }];
    yield ['GET', '/prontuario/Extras/CarregaExtras/?prontuario=2'];
    yield ['GET', '/prontuario/Extras/downloadFile.json?extra=53'];
    yield ['POST', '/api/extras/recuperar_imagens/', { corpo: { id_paciente: '2' } }];
    // exclusão do anexo
    yield ['DELETE', '/prontuario/Extras/uploadFile.json', { corpo: { doc: '52' } }];
    yield ['GET', '/prontuario/Extras/CarregaExtras/?prontuario=1'];
  },
};
