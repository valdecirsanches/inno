class Medico extends MyObject {
    clear() {
        super.clear();
        const today = (new Date()).toISOString().split('T')[0];
        this.setObject({
            ...this.object,
            admissao: today,
            status: 'ATIVO',
        });
        if ($tableHorario) {
            $tableHorario.bootstrapTable('removeAll');
        }
    }

    // async memedDoctorPerfilRead() {
    //     const response = await axios.get(
    //         `${MEMED_URL_API_BASE}v1/opcoes-receituario?token=${this.object.memed_token}`,
    //         {
    //             headers: {
    //                 'Accept': 'application/json'
    //             }
    //         }
    //     );
    //     let x = '';
    //     for (var name in response.data.data[0].attributes) {
    //         x += name + '=' + response.data.data[0].attributes[name] + '\n';
    //     }
    //     $('#id_memed_config_atual').val(x);
    // }


    // async memedDoctorPerfilUpdate() {
    //     let txt = $('#id_memed_config_atual').val();
    //     if (txt){

    //         txt = txt.split('\n').reduce((result, line) => {
    //             if (line) {
    //                 const [key, value] = line.split('=');
    //                 result[key] = value;
    //             }
    //             return result;
    //         },{});

    //         const ret = await api.post(`${this.uri(this.object.id)}dados_para_memed/`);

    //         const dados=ret.data;

    //         const response = await axios.post(
    //             `${MEMED_URL_API_BASE}v1/opcoes-receituario?token=${this.object.memed_token}`,
    //             {
    //                 data: {
    //                     type: "configuracoes-prescricao",
    //                     attributes: txt

    //                 },
    //                 headers: {
    //                     'Accept': 'application/json'
    //                 }
    //             }
    //         );
    //         this.template_receita_memed();
    //         swal('Configuração atualizada!');
    //     } else {
    //         swal('Nada feito!','Impossível gravar algo sem contexto');
    //     }

    // }

    // async memedDoctorDatalUpdate() {
    //     let txt = $('#id_memed_config_atual').val();
    //     if (txt){

    //         txt = txt.split('\n').reduce((result, line) => {
    //             if (line) {
    //                 const [key, value] = line.split('=');
    //                 result[key] = value;
    //             }
    //             return result;
    //         },{});

    //         const ret = await api.post(`${this.uri(this.object.id)}dados_para_memed/`);

    //         const dados=ret.data;

    //         const response = await axios.post(
    //             `${MEMED_URL_API_BASE}v1/opcoes-usuarios?token=${this.object.memed_token}`,
    //             {
    //                 data: {
    //                     type: "usuarios",
    //                     attributes: txt

    //                 },
    //                 headers: {
    //                     'Accept': 'application/json'
    //                 }
    //             }
    //         );
    //         this.template_receita_memed();
    //         swal('Configuração atualizada!');
    //     } else {
    //         swal('Nada feito!','Impossível gravar algo sem contexto');
    //     }

    // }

}

var dias_semanas = [
    {'id': 1, 'descricao': 'Segunda'},
    {'id': 2, 'descricao': 'Terça'},
    {'id': 3, 'descricao': 'Quarta'},
    {'id': 4, 'descricao': 'Quinta'},
    {'id': 5, 'descricao': 'Sexta'},
    {'id': 6, 'descricao': 'Sábado'},
    {'id': 7, 'descricao': 'Domingo'}
];

const medico = new Medico(
    'classMedico',
    (typeof $tableMedico !== 'undefined' ? $tableMedico : null),
    'medico/'
);

function AddMedico() {
    medico.clear();
    $('.classMedico #id_HabilitaUsuario').addClass('disabled');
    $('a[href=#cadastro]').tab('show');
    $('#btnUpdateMedico').removeClass('hidden');

    // $('#btnHabilitaUsuario').addClass('hide');
    // $('#btnEspecialidade').addClass('hidden');

    memedPainel();
    $('.classMedico [name=codigo]').focus();
}

async function ReadMedico(id) {
    await medico.index(id);
    // $('a[href=#cadastro]').tab('show');$('a[href=#cadastro]').tab('show');
    var dia = $(".dia_semana:checked").val();
    $tableHorario.bootstrapTable('refresh', {query: {
        fk_medico: id,
        dia_semana: dia
    }});

    $('#btnUpdateMedico').removeClass('hidden');

    // $('#btnHabilitaUsuario').removeClass('hide');
    // // $('#btnEspecialidade').removeClass('hidden');

    memedPainel();

    $('.classMedico [name=codigo]').focus();
}

async function UpdateMedico() {
    await medico.submit();
    memedPainel();
}

/* Memed: ver bloco no fim do arquivo */

$('.classMedico #id_funcao').on('change', function (e) {
    $('.medico').hide();
    $('.hideme').hide();
    if (e.target.value === 'MEDICO') {
        $('.medico').show();
    }
    else {
        $('.profissional').addClass('disabled');
    }
})



function DeleteMedico(id){
    swal({
        title: "Você tem certeza?",
        text: 'Está ação apagará este medico do cadastro',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
        // closeOnConfirm: true
    }).then(function () {
        medico.delete(id);
    });
}

$(window).load(function () {
    // ChamaPesquisaMedico();
});

$(".dial").knob();


/* ======================================================================
 * Memed — aba "Prescrições Memed"
 * A situação (habilitado? o que falta?) vem de /api/memed/<id>/situacao/.
 * Habilitar e "Enviar dados atualizados" salvam o cadastro antes, para
 * a Memed receber o que está na tela.
 * ==================================================================== */

const MEMED_CAMPOS = {
    nome: '[name=medico]',
    cpf: '[name=cpf]',
    data_nascimento: '[name=data_nascimento]',
    genero: '[name=genero]',
    crm: '[name=crm]',
    email: '[name=email]',
    celular: '[name=celular]',
    cidade: '[name=empresa_cidade]',
    especialidade: '[name=fk_especialidade]',
};

function memedEsc(txt) {
    return $('<div>').text(txt == null ? '' : String(txt)).html();
}

function memedIdMedico() {
    const id = parseInt((medico.object && medico.object.id) || $('.classMedico #id_id').val(), 10);
    return id > 0 ? id : 0;
}

function memedRetorno(tipo, html) {
    const $r = $('#memedRetorno');
    if (!tipo) { $r.addClass('hidden').empty(); return; }
    $r.removeClass('hidden is-ok is-bad').addClass(tipo === 'ok' ? 'is-ok' : (tipo === 'erro' ? 'is-bad' : '')).html(html);
}

function memedOcupado($btn, texto) {
    if (!texto) {
        $btn.prop('disabled', false).html($btn.data('original'));
        return;
    }
    $btn.data('original', $btn.html()).prop('disabled', true)
        .html('<i class="fa fa-spinner fa-spin"></i>' + memedEsc(texto));
}

function memedErro(e) {
    const d = e && e.response && e.response.data;
    if (d && d.situacao) { memedDesenha(d.situacao); }
    if (d && d.erro) { return d.erro; }
    if (e && e.response && e.response.status === 401) { return 'Sessão expirada.'; }
    return 'Não foi possível concluir agora. Tente de novo em instantes.';
}

function memedDesenha(sit) {
    const $car = $('#memedCarimbo');
    const $chip = $('#memedChip');
    const $txt = $('#memedExplica');
    const $lista = $('#memedChecklist').empty();

    if (!sit) {
        $car.attr('class', 'memed-carimbo is-vazio')
            .html('<span class="memed-carimbo-nome">Médico novo</span><span class="memed-carimbo-crm">CRM</span>');
        $chip.attr('class', 'memed-chip').text('Ainda não salvo');
        $txt.text('Salve o cadastro do médico para depois habilitá-lo na Memed.');
        $('#btnHabilitaMemed, #btnUpdateMemed, #btnRecoveryMemed').addClass('hidden');
        return;
    }

    const crm = sit.crm ? ('CRM ' + sit.crm + (sit.crm_uf ? '-' + sit.crm_uf : '')) : 'CRM não informado';
    $car.attr('class', 'memed-carimbo' + (sit.habilitado ? '' : ' is-apagado')).html(
        '<span class="memed-carimbo-nome">' + memedEsc(sit.nome || 'Sem nome') + '</span>' +
        '<span class="memed-carimbo-crm">' + memedEsc(crm) + '</span>' +
        (sit.especialidade ? '<span class="memed-carimbo-esp">' + memedEsc(sit.especialidade) + '</span>' : '')
    );

    const faltam = sit.checklist.filter(function (i) { return !i.ok; }).length;
    if (sit.habilitado) {
        $chip.attr('class', 'memed-chip is-ok').text('Habilitado para prescrever');
        $txt.text(faltam
            ? 'Já prescreve pela Memed. Há dados incompletos no cadastro: complete-os antes de enviar atualizações.'
            : 'Já prescreve pela Memed no atendimento. Se mudar algum dado do cadastro, envie os dados atualizados.');
    } else if (!faltam) {
        $chip.attr('class', 'memed-chip is-warn').text('Pronto para habilitar');
        $txt.text('O cadastro tem tudo o que a Memed pede. Enquanto não for habilitado, as receitas saem pelo acesso reserva da clínica.');
    } else {
        $chip.attr('class', 'memed-chip is-bad').text(faltam === 1 ? 'Falta 1 dado' : 'Faltam ' + faltam + ' dados');
        $txt.text('Complete os dados marcados abaixo e salve. Enquanto isso, as receitas saem pelo acesso reserva da clínica.');
    }

    $('#btnHabilitaMemed').toggleClass('hidden', !!sit.habilitado);
    $('#btnUpdateMemed').toggleClass('hidden', !sit.habilitado);
    $('#btnRecoveryMemed').removeClass('hidden');

    sit.checklist.forEach(function (i) {
        $lista.append(
            '<li class="' + (i.ok ? 'is-ok' : 'is-falta') + '">' +
                '<i class="fa ' + (i.ok ? 'fa-check-circle' : 'fa-exclamation-circle') + '" aria-hidden="true"></i>' +
                '<span>' + memedEsc(i.rotulo) + '</span>' +
                (i.ok ? '' : '<a data-campo="' + memedEsc(i.campo) + '">preencher</a>') +
            '</li>'
        );
    });
}

async function memedPainel() {
    memedRetorno(null);
    const id = memedIdMedico();
    if (!id) { memedDesenha(null); return; }
    try {
        const r = await api.get('/memed/' + id + '/situacao/');
        memedDesenha(r.data.situacao);
    } catch (e) {
        memedRetorno('erro', memedEsc(memedErro(e)));
    }
}

// "preencher": abre a aba onde o campo está e coloca o cursor nele
$(document).on('click', '#memedChecklist a[data-campo]', function () {
    const $campo = $('.classMedico ' + (MEMED_CAMPOS[$(this).data('campo')] || '')).first();
    if (!$campo.length) { return; }
    $($campo.parents('.tab-pane').get().reverse()).each(function () {
        $('a[data-toggle=tab][href="#' + this.id + '"]').tab('show');
    });
    setTimeout(function () {
        const $alvo = $campo.is('select.selectized') ? $campo.next('.selectize-control').find('input') : $campo;
        $alvo.focus();
        $campo.closest('.form-group, [class*=col-]').addClass('has-error');
    }, 200);
});

async function memedSalvaCadastro() {
    try {
        await medico.submit(null, true);
        return true;
    } catch (e) {
        memedRetorno('erro', 'O cadastro não foi salvo. Confira os campos em vermelho nas outras abas.');
        return false;
    }
}

async function memedDoctorHabilita() {
    const id = memedIdMedico();
    if (!id) { memedDesenha(null); return; }
    const $btn = $('#btnHabilitaMemed');
    memedRetorno(null);
    memedOcupado($btn, 'Habilitando...');
    try {
        if (!(await memedSalvaCadastro())) { return; }
        const r = await api.get('/memed/' + id + '/doctor-add/');
        medico.object.habilitado_memed = true;
        memedDesenha(r.data.situacao);
        memedRetorno('ok', '<strong>' + memedEsc(r.data.success) + '</strong>');
    } catch (e) {
        memedRetorno('erro', memedEsc(memedErro(e)));
    } finally {
        memedOcupado($btn);
    }
}

async function memedDoctorDataRead() {
    const id = memedIdMedico();
    if (!id) { return; }
    const $btn = $('#btnRecoveryMemed');
    memedRetorno(null);
    memedOcupado($btn, 'Consultando...');
    try {
        const r = await api.post('/memed/doctor-data-read/', {doc: id});
        const m = r.data.memed || {};
        memedDesenha(r.data.situacao);
        const tipo = m.status === 'Ativo' ? 'is-ok' : (m.status === 'Em análise' ? 'is-warn' : 'is-bad');
        const linhas = [
            ['Nome', m.nome_completo],
            ['CRM', (m.crm || '') + (m.uf ? '-' + m.uf : '')],
            ['Especialidade', m.especialidade],
            ['CPF', m.cpf],
            ['Nascimento', m.data_nascimento],
            ['Celular', m.telefone],
            ['E-mail', m.email],
        ].filter(function (l) { return l[1]; });
        memedRetorno('ok',
            'Na Memed: <span class="memed-chip ' + tipo + '">' + memedEsc(m.status || 'sem situação') + '</span>' +
            (m.user_type ? ' <span class="text-muted">' + memedEsc(m.user_type) + '</span>' : '') +
            '<dl>' + linhas.map(function (l) {
                return '<dt>' + l[0] + '</dt><dd>' + memedEsc(l[1]) + '</dd>';
            }).join('') + '</dl>'
        );
    } catch (e) {
        memedRetorno('erro', memedEsc(memedErro(e)));
    } finally {
        memedOcupado($btn);
    }
}

async function memedDoctorDataUpdate() {
    const id = memedIdMedico();
    if (!id) { return; }
    const $btn = $('#btnUpdateMemed');
    memedRetorno(null);
    memedOcupado($btn, 'Enviando...');
    try {
        if (!(await memedSalvaCadastro())) { return; }
        const r = await api.post('/memed/doctor-data-syncronize/', {doc: id});
        memedDesenha(r.data.situacao);
        memedRetorno('ok', '<strong>' + memedEsc(r.data.success) + '</strong>');
    } catch (e) {
        memedRetorno('erro', memedEsc(memedErro(e)));
    } finally {
        memedOcupado($btn);
    }
}

async function SyncronizeEspecialidade() {
    const $btn = $('#btnEspecialidade');
    memedOcupado($btn, 'Atualizando...');
    try {
        await api.get('/memed/especialidades-syncronize/');
        toastr.success('Lista de especialidades atualizada com a Memed.', 'Especialidades');
    } catch (e) {
        toastr.error('Não foi possível falar com a Memed agora.', 'Especialidades');
    } finally {
        memedOcupado($btn);
    }
}

// ao abrir a aba, a checagem é refeita (pega o que foi salvo em outra aba)
$(document).on('shown.bs.tab', 'a[data-toggle=tab][href="#memed"]', memedPainel);
