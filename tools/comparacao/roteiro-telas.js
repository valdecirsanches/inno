// Roteiro de gravação: o que as telas enviam ao salvar, alterar e excluir
// (paciente, recibo, agenda, prontuário, cadastros, configurações, usuários).
// Os formulários são montados com todos os campos do modelo, como o
// $(form).serialize() das telas, com valores realistas.
const path = require('path');
const M = require(path.join(__dirname, '..', '..', 'server', 'modelos.json'));

const VALOR = {
  CharField: 'Teste', TextField: 'Texto de teste', EmailField: 'a@b.com', IntegerField: '1', SmallIntegerField: '1',
  PositiveIntegerField: '1', BigIntegerField: '1', FloatField: '1.5', DecimalField: '10.50', DateField: '10/11/2026',
  TimeField: '09:30', DateTimeField: '10/11/2026 09:30', BooleanField: 'on', ForeignKey: '1',
};
/** campos do formulário do modelo, com valores (sobrescreva com "o") */
function campos(modelo, o = {}, { sem = [] } = {}) {
  const r = {};
  for (const c of M[modelo].campos) {
    if (!c.editavel || c.pk || c.auto_now || c.auto_now_add || sem.includes(c.nome)) continue;
    if (['FileField', 'ImageField', 'JSONField'].includes(c.tipo)) continue;
    let v = VALOR[c.tipo] === undefined ? 'x' : VALOR[c.tipo];
    if (c.max && typeof v === 'string' && v.length > c.max) v = v.slice(0, c.max);
    if (c.opcoes && c.opcoes.length) v = String(c.opcoes[0]);
    r[c.nome] = v;
  }
  return Object.assign(r, o);
}
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== null)).toString();
/** formAtendimento das abas do prontuário */
const ATEND = { fk_prontuario: '1', fk_consulta: '42', fk_medico: '1', fk_consulta_atual: '42' };
const form = (modelo, o = {}, opc) => qs(Object.assign({}, ATEND, campos(modelo, o, opc)));
/** objeto JSON para o DRF: datas em ISO, booleanos e números de verdade */
function json(modelo, o = {}, opc) {
  const r = campos(modelo, {}, opc);
  for (const c of M[modelo].campos) {
    if (!(c.nome in r)) continue;
    if (c.tipo === 'DateField') r[c.nome] = '2026-11-10';
    else if (c.tipo === 'DateTimeField') r[c.nome] = '2026-11-10T09:30:00';
    else if (c.tipo === 'BooleanField') r[c.nome] = true;
    else if (['IntegerField', 'ForeignKey', 'SmallIntegerField', 'PositiveIntegerField'].includes(c.tipo)) r[c.nome] = 1;
    else if (c.tipo === 'CharField' && c.opcoes && c.opcoes.length) r[c.nome] = c.opcoes[0];
  }
  return Object.assign(r, o);
}

module.exports = {
  prepara(sq) {
    sq.exec(`UPDATE tb_agendas SET confirmacao = NULL, agenda_periodo = 'AM'`);
    sq.exec(`INSERT INTO tb_usuarios_opcoes (id, id_usuario, iniciar_pesquisa, login_atualizacao, ultimo_pac) VALUES (1, 1, '', 0, 1)`);
  },
  passos: function* () {
    yield ['GET', '/login/'];
    yield ['POST', '/login/', { corpo: { username: 'u', password: 's', next: '/' } }];

    // ------------------------------------------------------------ paciente
    yield ['GET', '/cadastros/paciente/?paciente=1'];
    const pac = campos('TbPacientes', { paciente: 'Carlos Teste', data_nasc: '05/06/1970', cpf: '111.222.333-44', sexo: 'M', fk_convenio: '1', fk_plano: '', fk_clinica: '', fk_medico: '1', fk_usuario: '1', codigo: '5001' });
    yield ['POST', '/cadastros/paciente/SalvaPaciente/', { corpo: { form: qs(pac), paciente: '0' } }];
    yield ['POST', '/cadastros/paciente/SalvaPaciente/', { corpo: { form: qs(Object.assign({}, pac, { paciente: 'Ana Paula de Souza', celular: '(11) 98888-7777', codigo: '1001' })), paciente: '1' } }];
    yield ['POST', '/cadastros/paciente/SalvaPaciente/', { corpo: { form: qs(Object.assign({}, pac, { paciente: '', data_nasc: '31/02/2020' })), paciente: '1' } }];
    yield ['GET', '/cadastros/paciente/NovoRecibo/?paciente=1'];
    const rec = campos('TbRecibos', { data_recibo: '10/11/2026', emissao: '10/11/2026', referencia: 'Consulta', fk_medico: '1' }, { sem: ['fk_paciente', 'fk_usuario', 'codigo', 'valor_extenso', 'valor', 'usuario'] });
    yield ['POST', '/cadastros/paciente/SalvaRecibo/', { corpo: { form: qs(rec), recibo: '0', paciente: '1', valor: '150,50' } }];
    yield ['POST', '/cadastros/paciente/SalvaRecibo/', { corpo: { form: qs(Object.assign({}, rec, { referencia: 'Retorno' })), recibo: '1', paciente: '1', valor: '99,90' } }];
    yield ['GET', '/cadastros/paciente/CarregaRecibos/?paciente=1'];
    yield ['GET', '/cadastros/paciente/CarregaPaciente/?paciente=1'];

    // -------------------------------------------------------------- agenda
    yield ['POST', '/agenda/consultas/', { corpo: { data: '2026-11-10', id_medico: '1' } }];
    yield ['POST', '/agenda/consultas/CarregaConsultas/', { corpo: { data: '2026-11-10', id_medico: '1', Livre: 'true', All: 'true' } }];
    const ag = qs(campos('TbAgendaCons', { fk_especialidade: '1', fk_procedimento: '1', fk_convenio: '1', fk_plano: '', guia: 'G9', obs: 'Primeira vez' }));
    const ag2 = qs(Object.assign(campos('TbAgendaCons', { fk_especialidade: '1', fk_procedimento: '1', fk_convenio: '1', fk_plano: '', guia: 'G9', obs: 'Primeira vez' }), { hora: '10:00', agenda_periodo: 'AM' }));
    yield ['GET', `/agenda/consultas/SalvaAgendamento/?${qs({ form: ag2, data: '2026-12-01', medico: '1', consulta: '0', id_paciente: '1' })}`];
    yield ['GET', `/agenda/consultas/SalvaAgendamento/?${qs({ form: ag, data: '2026-11-10', medico: '1', consulta: '0', id_paciente: '1' })}`];
    yield ['GET', `/agenda/consultas/SalvaAgendamento/?${qs({ form: ag2, data: '2026-12-01', medico: '1', consulta: '3', id_paciente: '2' })}`];
    yield ['GET', '/agenda/consultas/StatusConsulta/?consulta=3&status=ATENDIDO'];
    yield ['GET', '/agenda/consultas/GravaChegada/?id_consulta=4&acao=GRAVAR'];
    yield ['POST', '/api/agenda/5/grava_status/'];
    yield ['POST', '/api/agenda/6/grava_chegada/?acao=GRAVAR'];
    yield ['POST', '/api/agenda/6/grava_chegada/?acao=RESTAURA'];
    yield ['POST', '/agenda/consultas/RestauraAgendamento/', { corpo: { id_consulta: '7', acao: 'confirmar' } }];
    yield ['POST', '/agenda/consultas/TransfereDia', { corpo: { id: '8', dt: '2026-11-12T10:30' } }];
    yield ['POST', '/agenda/consultas/hr_clone/', { corpo: { id: '9', tp: 'BM' } }];
    yield ['POST', '/api/agenda/', { json: true, corpo: json('TbAgendaCons', { data: '2026-11-11', hora: '14:00', fk_paciente: 1, fk_medico: 1, fk_clinica: 1, status: 'AGENDADO' }) }];
    yield ['GET', '/api/agenda/?data=2026-11-10&fk_medico=1'];

    // ---------------------------------------------- prontuário (telas .json)
    yield ['GET', '/atendimento/?consulta=42'];
    for (const [url, chave, modelo] of [
      ['/prontuario/Anamnese/anamnese.json/', 'anamnese', 'TbAnamnese'],
      ['/prontuario/ExameFisico/exame_fisico.json/', 'exameFisico', 'TbExameFisico'],
      ['/prontuario/HipoteseDiagnostica/hipotese_diagnostica.json/', 'hipoteseDiagnostica', 'TbHipoteseDiagnostica'],
      ['/prontuario/Evolucao/evolucao.json/', 'evolucao', 'TbEvolucao'],
    ]) {
      yield ['PUT', url, { corpo: { [chave]: '0', form: form(modelo) } }];
      yield ['PUT', url, { corpo: { [chave]: '1', form: form(modelo, { fk_consulta: '42' }) } }];
      yield ['GET', `${url}?paciente=1&id_prontuario=1`];
    }
    for (const [url, chave, modelo] of [
      ['/prontuario/Exames/exames.json/', 'exame', 'TbExames'],
      ['/prontuario/Relatorios/relatorios.json/', 'relatorio', 'TbRelatorios'],
      ['/prontuario/prescricoes/prescricao.json/', 'prescricao', 'TbPrescricoes'],
      ['/prontuario/Atestado/atestado.json/', 'id_atestado', 'TbAtestado'],
    ]) {
      yield ['PUT', url, { corpo: { [chave]: '0', form: form(modelo) } }];
      yield ['PUT', url, { corpo: { [chave]: '1', form: form(modelo) } }];
      yield ['GET', `${url}?id_prontuario=1&paciente=1`];
      yield ['PATCH', url, { corpo: { [chave]: '1', exame: '1', relatorio: '1', rec: '1', prescricao: '1', consulta: '42', acao: '' } }];
    }
    yield ['GET', '/prontuario/Exames/UtilizaConfExame/?conf=1&prontuario=1&consulta=42&medico=1'];
    yield ['GET', '/prontuario/Relatorios/UtilizaConfRelatorio/?conf=1&prontuario=1&consulta=42&medico=1'];

    // ------------------------------------------------- prontuário (API)
    for (const [base, modelo] of [['evolucao', 'TbEvolucao'], ['exames', 'TbExames'], ['hipoteseDiagnostica', 'TbHipoteseDiagnostica'],
      ['relatorio', 'TbRelatorios'], ['prescricao', 'TbPrescricoes'], ['atestado', 'TbAtestado']]) {
      yield ['POST', `/api/${base}/`, { json: true, corpo: json(modelo, { fk_prontuario: 1, fk_consulta: 42, fk_medico: 1 }) }];
      yield ['PUT', `/api/${base}/1/`, { json: true, corpo: json(modelo, { fk_prontuario: 1, fk_consulta: 42, fk_medico: 1 }) }];
      yield ['PATCH', `/api/${base}/1/`, { json: true, corpo: { fk_consulta: 42 } }];
      yield ['POST', `/api/${base}/get-consulta/`, { json: true, corpo: { id_consulta: '42' } }];
      yield ['GET', `/api/${base}/?id_prontuario=1`];
    }
    yield ['POST', '/api/evolucao/ultimas-evolucoes/', { json: true, corpo: { paciente: '1' } }];
    yield ['POST', '/api/exames/1/clone/'];
    yield ['POST', '/api/prescricao/clone/', { json: true, corpo: { id_prescricao: 1 } }];
    yield ['POST', '/api/atestado/get-ultimo-atestado/', { json: true, corpo: { id_prontuario: 1 } }];
    yield ['POST', '/api/hipoteseDiagnostica/get-ultima-hipotese-diagnostica/?id_prontuario=1'];
    yield ['POST', '/api/prescricao/remedio/', { json: true, corpo: json('TbPrescricaoRemedios', { fk_prescricao: 1, fk_remedios: null }) }];
    yield ['PUT', '/api/prescricao/remedio/1/', { json: true, corpo: json('TbPrescricaoRemedios', { fk_prescricao: 1, fk_remedios: null, nome: 'Amoxicilina' }) }];

    // ----------------------------------------------------------- cadastros
    yield ['GET', `/cadastros/especialidades/SalvaEspecialidade/?${qs({ id: '0', form: qs(campos('TbEspecialidades')) })}`];
    yield ['GET', `/cadastros/especialidades/SalvaEspecialidade/?${qs({ id: '1', form: qs(campos('TbEspecialidades', { descricao: 'NEUROLOGIA' })) })}`];
    yield ['GET', `/cadastros/planos/SalvaPlanoSaude/?${qs({ id: '0', form: qs(campos('TbPlanos')) })}`];
    yield ['GET', `/cadastros/medicos/SalvaMedico/?${qs({ id: '1', form: qs(campos('TbMedicos', { medico: 'João da Silva', ativo: 'True' })) })}`];
    yield ['GET', `/cadastros/medicos/SalvaMedico/?${qs({ id: '0', form: qs(campos('TbMedicos', { medico: 'Pedro Novo' })) })}`];
    yield ['POST', '/cadastros/convenio/convenio.json', { corpo: { id: '0', form: qs(campos('TbConvenio', { convenio: 'BRADESCO' })) } }];
    yield ['POST', '/cadastros/convenio/convenio.json', { corpo: { id: '1', form: qs(campos('TbConvenio', { convenio: 'UNIMED SP' })) } }];
    yield ['POST', '/cadastros/clinica/clinica.json', { corpo: { id: '1', form: qs(campos('TbClinica', { nome: 'Clinica Nova' })) } }];
    yield ['POST', '/api/medico/horario/cria-horarios/', { corpo: { medico: '1', form: qs({ dia_matutino: '1,2', hora_inicio_matutino: '08:00', hora_fim_matutino: '09:00', duracao_consulta: '30', intervalo_encaixes: '', intervalo_balcao: '', dia_receita: '30' }) } }];
    yield ['GET', '/api/medico/horario/?fk_medico=1&dia_semana=1&periodo=M'];

    // ------------------------------------------------------ configurações
    yield ['GET', `/configuracoes/exames/SalvaConfExame/?${qs({ exame: '0', form: qs(campos('TbConfExames', { fk_medico: '1' })) })}`];
    yield ['GET', `/configuracoes/prescricoes/SalvaConfPrescricao/?${qs({ prescricao: '0', form: qs(campos('TbConfPrescricoes', { fk_medico: '1' })) })}`];
    yield ['GET', `/configuracoes/relatorios/SalvaConfRelatorio/?${qs({ relatorio: '0', form: qs(campos('TbConfRelatorios', { fk_medico: '1' })) })}`];
    yield ['GET', '/configuracoes/exames/CarregaConfExames/?medico=1'];
    yield ['GET', '/prontuario/Exames/UtilizaConfExame/?conf=1&prontuario=1&consulta=42&medico=1'];
    yield ['GET', '/prontuario/Relatorios/UtilizaConfRelatorio/?conf=1&prontuario=1&consulta=42&medico=1'];
    yield ['GET', '/agenda/consultas/GerarAgendasPeriodo/?dts=2026-12-07,2026-12-08&medico=1'];

    // ------------------------------------------------------------ usuários
    const us = { first_name: 'Novo', email: 'novo@x.com', is_active: 'on', fk_clinica: '1', fk_medico: '', login: 'novo', nome: 'Novo Usuário', cpf: '', codigo: '', administrador: '' };
    yield ['POST', '/seguranca/usuario.json/', { corpo: { id: '0', form: qs(us) } }];
    yield ['POST', '/seguranca/usuario.json/', { corpo: { id: '1', form: qs(Object.assign({}, us, { login: 'u', first_name: 'Maria 2' })) } }];

    // ------------------------------------------- exclusões (por último)
    yield ['DELETE', '/prontuario/Exames/exames.json/', { corpo: { id: '1' } }];
    yield ['DELETE', '/prontuario/Relatorios/relatorios.json/', { corpo: { id: '1' } }];
    yield ['DELETE', '/prontuario/prescricoes/prescricao.json/', { corpo: { id: '2', rec: '2' } }];
    yield ['POST', '/api/prescricao/del-remedios/', { json: true, corpo: { id_prescricao: 1 } }];
    yield ['DELETE', '/api/evolucao/1/'];
    yield ['DELETE', '/api/atestado/1/'];
    yield ['POST', '/agenda/consultas/hr_exclui/', { corpo: { id: '10' } }];
    yield ['POST', '/agenda/consultas/hrs_exclui/', { corpo: { id__in: '11,12' } }];
    yield ['GET', '/cadastros/especialidades/ExcluiEspecialidade/?id=2'];
    yield ['GET', '/cadastros/planos/ExcluiPlanoSaude/?id=1'];
    yield ['DELETE', '/cadastros/convenio/convenio.json', { corpo: { id: '2' } }];
    yield ['POST', '/api/medico/horario/limpa-horarios/', { corpo: { medico: '1', dia_semana: '1' } }];
    yield ['DELETE', '/seguranca/usuario.json/', { corpo: { id: '2' } }];
  },
};
