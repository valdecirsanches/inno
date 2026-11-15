/* =========================================================================
 * Aba Memed do atendimento
 *
 * 1. Pergunta ao servidor quem prescreve e com qual token
 *    (/api/memed/acesso/): o do médico ou, se ele ainda não estiver
 *    habilitado, o acesso reserva da clínica.
 * 2. Confere o cadastro do paciente (/api/agenda/<consulta>/dados_para_memed/):
 *    nome, CPF e celular são obrigatórios; o resto vira aviso.
 * 3. Carrega o módulo da Memed uma vez só, com esse token, e abre a receita
 *    já com o paciente da consulta.
 * ======================================================================= */
const MemedAcesso = (function () {

    // opções do receituário (as mesmas da versão anterior)
    const OPCOES = {
        deletePatient: false,
        removePatient: false,
        editPatient: false,
        historyPrescription: true,
        newPrescription: true,
        optionsPrescription: true,
        removePrescription: true,
        setPatientAllergy: false,
        autocompleteIndustrialized: true,
        autocompleteManipulated: true,
        autocompleteCompositions: true,
        autocompletePeripherals: true,
        copyMedicalRecords: true,
        buttonClose: true,
        newFormula: true,
        allowShareModal: true,
        guidesOnboarding: true,
        conclusionModalEdit: false,
        dropdownSync: true,
        showProtocol: true,
        showHelpMenu: true,
    };

    let modulo = null;          // Promise: módulo da Memed pronto
    let tokenCarregado = null;  // token com que o módulo foi aberto
    let abrindo = false;

    const esc = function (t) { return $('<div>').text(t == null ? '' : String(t)).html(); };

    function consultaAtual() {
        const id = parseInt($('#id_fk_consulta_atual').val(), 10);
        return id > 0 ? id : 0;
    }

    function estado(tipo, texto, botao) {
        const $e = $('#memedAtdEstado');
        if (!tipo) { $e.addClass('hidden').empty(); return; }
        const icone = {
            carregando: 'fa-spinner fa-spin',
            vazio: 'fa-user-o',
            erro: 'fa-exclamation-triangle',
            bloqueado: 'fa-id-card-o',
        }[tipo] || 'fa-info-circle';
        $e.removeClass('hidden').html(
            '<i class="fa ' + icone + '" aria-hidden="true"></i>' + esc(texto) +
            (botao ? '<br><button type="button" class="btn btn-white btn-sm">' + esc(botao.texto) + '</button>' : '')
        );
        if (botao) { $e.find('button').on('click', botao.acao); }
    }

    function desenhaPrescritor(acesso) {
        const p = acesso.prescritor;
        const $car = $('#memedAtdCarimbo');
        if (p) {
            const crm = p.crm ? 'CRM ' + p.crm + (p.crm_uf ? '-' + p.crm_uf : '') : 'CRM não informado';
            $car.attr('class', 'memed-carimbo' + (acesso.origem === 'medico' ? '' : ' is-apagado')).html(
                '<span class="memed-carimbo-nome">' + esc(p.nome || 'Sem nome') + '</span>' +
                '<span class="memed-carimbo-crm">' + esc(crm) + '</span>' +
                (p.especialidade ? '<span class="memed-carimbo-esp">' + esc(p.especialidade) + '</span>' : '')
            );
        } else {
            $car.attr('class', 'memed-carimbo is-vazio')
                .html('<span class="memed-carimbo-nome">Sem médico vinculado</span><span class="memed-carimbo-crm">Usuário sem cadastro de médico</span>');
        }

        const $chip = $('#memedAtdChip');
        const $txt = $('#memedAtdExplica');
        if (acesso.origem === 'medico') {
            $chip.attr('class', 'memed-chip is-ok').text('Acesso próprio do médico');
            $txt.text('A receita sai em nome deste médico.');
        } else if (acesso.origem === 'reserva') {
            $chip.attr('class', 'memed-chip is-warn').text('Acesso reserva da clínica');
            $txt.html(p
                ? 'Este médico ainda não está habilitado na Memed, então a receita sai pelo acesso reserva da clínica. ' +
                  'Para habilitar: <strong>Cadastros &gt; Médicos &gt; Prescrições Memed</strong>.'
                : 'Seu usuário não está ligado a um médico, então a receita sai pelo acesso reserva da clínica.');
        } else {
            $chip.attr('class', 'memed-chip is-bad').text('Sem acesso à Memed');
            $txt.html('Nem o médico nem a clínica têm acesso configurado. Habilite o médico em ' +
                '<strong>Cadastros &gt; Médicos &gt; Prescrições Memed</strong>.');
        }
    }

    function desenhaPendencias(dados) {
        const $a = $('#memedAtdAviso');
        const faltas = dados.pendencias || [];
        if (!faltas.length) { $a.addClass('hidden').empty(); return; }
        const obrig = faltas.filter(function (f) { return f.obrigatorio; });
        const lista = function (fs) {
            return '<span class="memed-faltas">' + fs.map(function (f) { return '<span>' + esc(f.rotulo) + '</span>'; }).join('') + '</span>';
        };
        const outros = faltas.filter(function (f) { return !f.obrigatorio; });
        let html = '<i class="fa ' + (obrig.length ? 'fa-ban' : 'fa-exclamation-circle') + '" aria-hidden="true"></i><div>';
        if (obrig.length) {
            html += '<p>Faltam no cadastro do paciente ' + lista(obrig) + ' Sem esses dados a Memed não abre a receita.</p>';
        }
        if (outros.length) {
            html += '<p>' + (obrig.length ? 'Também está incompleto: ' : 'Cadastro do paciente incompleto: ') + lista(outros) +
                ' A receita comum sai assim mesmo; receitas especiais podem exigir esses dados.</p>';
        }
        html += '</div>';
        $a.toggleClass('is-bad', obrig.length > 0).removeClass('hidden').html(html);
    }

    function carregaModulo(token, script) {
        if (modulo) { return modulo; }
        modulo = new Promise(function (resolve, reject) {
            const limite = setTimeout(function () {
                reject(new Error('A Memed não respondeu. Verifique a internet e tente de novo.'));
            }, 30000);
            const s = document.createElement('script');
            s.src = script;
            s.setAttribute('data-token', token);
            s.setAttribute('data-container', 'prescricao-memed');
            s.onerror = function () {
                clearTimeout(limite);
                reject(new Error('Não foi possível carregar a Memed. Verifique a internet e tente de novo.'));
            };
            s.onload = function () {
                MdSinapsePrescricao.event.add('core:moduleInit', function (mod) {
                    if (mod.name !== 'plataforma.prescricao') { return; }
                    clearTimeout(limite);
                    // receita impressa: guarda junto da prescrição da consulta (como antes)
                    MdHub.event.add('prescricaoImpressa', function (prescriptionData) {
                        if (typeof prescricao === 'undefined') { return; }
                        const obj = prescricao.getObject();
                        obj['prescricao_memed'] = prescriptionData;
                        prescricao.store(obj);
                    });
                    MdHub.command.send('plataforma.prescricao', 'setFeatureToggle', OPCOES);
                    resolve();
                });
            };
            tokenCarregado = token;
            document.body.appendChild(s);
        });
        // se falhar, a próxima tentativa carrega de novo
        modulo.catch(function () {
            modulo = null;
            tokenCarregado = null;
            $('script[src*="sinapse-prescricao"]').remove();
        });
        return modulo;
    }

    async function abrir() {
        if (abrindo) { return; }
        abrindo = true;
        const $bt = $('#memedAtdAtualiza').prop('disabled', true);
        try {
            estado('carregando', 'Conferindo o acesso à Memed...');
            const consulta = consultaAtual();
            const acesso = (await api.get('/memed/acesso/', {params: {consulta: consulta || ''}})).data;
            desenhaPrescritor(acesso);

            if (acesso.origem === 'indisponivel') {
                estado('erro', 'A receita pela Memed não está disponível para este usuário.');
                return;
            }
            if (!consulta) {
                $('#memedAtdAviso').addClass('hidden');
                estado('vazio', 'Escolha um paciente na lista de atendimento para abrir a receita.');
                return;
            }

            estado('carregando', 'Buscando os dados do paciente...');
            if (typeof objagenda !== 'undefined') { await objagenda.index(consulta); }
            const dados = (await api.post('/agenda/' + consulta + '/dados_para_memed/')).data;
            desenhaPendencias(dados);
            if (dados.bloqueado) {
                estado('bloqueado', 'Complete o cadastro do paciente e clique em "Tentar de novo".',
                    {texto: 'Tentar de novo', acao: abrir});
                return;
            }

            if (tokenCarregado && tokenCarregado !== acesso.token) {
                estado('erro', 'O prescritor mudou desde que a Memed foi aberta. Recarregue a página para trocar o acesso.',
                    {texto: 'Recarregar a página', acao: function () { location.reload(); }});
                return;
            }

            estado('carregando', 'Abrindo a Memed...');
            await carregaModulo(acesso.token, acesso.script);
            await MdHub.command.send('plataforma.prescricao', 'setPaciente', {
                idExterno: dados.paciente_cpf_hash,
                nome: dados.paciente_nome,
                data_nascimento: dados.paciente_nascimento,
                cpf: dados.paciente_cpf,
                endereco: dados.paciente_endereco + ', ' + dados.paciente_numero + ' - ' + dados.paciente_bairro,
                cep: dados.paciente_cep,
                cidade: dados.paciente_cidade,
                uf: dados.paciente_uf,
                telefone: dados.paciente_celular,
                nome_mae: dados.paciente_mae,
                dificuldade_locomocao: dados.paciente_dificuldade_locomocao,
            });
            MdHub.module.show('plataforma.prescricao');
            estado(null);
        } catch (e) {
            const msg = (e && e.response && e.response.data && (e.response.data.erro || e.response.data.detail)) ||
                (e && e.message) || 'Não foi possível abrir a Memed.';
            estado('erro', msg, {texto: 'Tentar de novo', acao: abrir});
        } finally {
            abrindo = false;
            $bt.prop('disabled', false);
        }
    }

    // abrir a aba Memed já prepara tudo (antes era preciso clicar e esperar sem retorno)
    $(document).on('shown.bs.tab', '#botaoShowPrescricao', abrir);

    return {abrir: abrir};
})();
