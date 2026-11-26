// Trava do SalvaPaciente: uma ficha nova (ou de outro paciente) nunca é gravada por cima
// do paciente cujo ID ficou na tela (resposta atrasada depois do "Novo prontuário").
const base = require('./base');
(async () => {
  const t = await base();
  try {
    await t.entra();
    const salva = async (id, campos) => (await t.vai('/cadastros/paciente/SalvaPaciente/', {
      method: 'POST', body: t.corpo({ form: t.corpo(campos), paciente: String(id) }),
    })).json();
    const nome = (id) => t.sq.prepare('select paciente from paciente where id=?').get(id).paciente;
    const base = { sexo: 'F', data_nasc: '1990-01-02' };
    const A = (await salva(0, Object.assign({ id: 0, codigo: '1001', paciente: 'PACIENTE A' }, base))).success;
    const B = (await salva(0, Object.assign({ id: 0, codigo: '1002', paciente: 'PACIENTE B' }, base))).success;
    if (!A || !B) throw new Error('não criou os pacientes de teste');
    const total = () => t.sq.prepare('select count(*) n from paciente').get().n;
    const antes = total();
    await t.confere('ID de A com o código de uma ficha nova: não grava nada (nem cria) e explica', async () => {
      const r = await salva(A.id, Object.assign({ id: A.id, codigo: '99999', paciente: 'FICHA NOVA' }, base));
      if (!r.mensagem || r.success) throw new Error(JSON.stringify(r));
      if (nome(A.id) !== 'PACIENTE A' || total() !== antes) throw new Error(`A virou ${nome(A.id)}`);
    });
    await t.confere('ID de A com o código de B: não grava nada e explica', async () => {
      const r = await salva(A.id, Object.assign({ id: A.id, codigo: String(B.codigo), paciente: 'OUTRO' }, base));
      if (!r.mensagem || r.success) throw new Error(JSON.stringify(r));
      if (nome(A.id) !== 'PACIENTE A' || nome(B.id) !== 'PACIENTE B') throw new Error('mudou');
    });
    await t.confere('edição normal (código do próprio paciente) continua gravando', async () => {
      const r = await salva(A.id, Object.assign({ id: A.id, codigo: String(A.codigo), paciente: 'A EDITADO' }, base));
      if (!r.success || r.success.id !== A.id || nome(A.id) !== 'A EDITADO') throw new Error(JSON.stringify(r));
    });
    await t.fim();
  } catch (e) { await t.fim(e); }
})();
