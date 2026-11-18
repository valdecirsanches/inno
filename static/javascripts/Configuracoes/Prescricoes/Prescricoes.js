/*
 * Configurações > Prescrições (padrões de prescrição do médico, com os remédios).
 * A tela chama NovaPrescricao(), SalvaPrescricao(), SalvaPrescricao('remedio') e os
 * formatadores das tabelas; antes os botões não faziam nada (as funções não existiam)
 * e a lista de remédios não aparecia.
 * Os dois formulários têm campos com o mesmo id (#id_nome, #id_descricao): por isso todo
 * seletor aqui começa pelo formulário.
 */
var $tablePrescricao = $('#tabelaPrescricao');
var $tablePrescricaoRemedios = $('#tabelaPrescricaoRemedios');
var URL_CONF_PRESCRICOES = '/configuracoes/prescricoes/';
var remedioConfAtual = 0;

function rowStyle() {
    return {classes: 'ATENDIDO'};
}

function ButtonPrescricao() {
    return [
        '<div class="">',
        '<a class="edit btn btn-primary btn-xs m-r-xs" href="javascript:void(0)" title="Altera dados da prescrição">',
        '<i class="fa fa-edit"> </i>',
        '</a>',
        '<a class="del btn btn-danger btn-xs m-r-xs" href="javascript:void(0)" title="Excluir prescrição">',
        '<i class="fa fa-trash"> </i>',
        '</a>',
        '</div>'
    ].join('');
}

window.EventPrescricao = {
    'click .edit': function (e, value, row) { ReadPrescricao(row); },
    'click .del': function (e, value, row) { ExcluiPrescricaoPadrao(row); }
};

$tablePrescricao.on('dbl-click-row.bs.table', function (e, row) { ReadPrescricao(row); });

// a lista de remédios vem como {"success": [...]} e é a do padrão aberto
// (data-response-handler / data-query-params da tabela)
function respostaRemediosPadrao(res) { return (res && res.success) || []; }
function paramsRemediosPadrao(p) { p.id_prescricao = $('#id_id_prescricao').val() || '0'; return p; }

function detailFormatter(index, row) {
    return '<p>' + $('<span>').text(row.descricao || '').html() + '</p>';
}

function excludeFormatter() {
    return '<a class="edit-remedio" href="javascript:void(0)" title="Editar"><i class="glyphicon glyphicon-edit"></i></a>&nbsp;&nbsp;' +
        '<a class="remove" href="javascript:void(0)" title="Excluir"><i class="glyphicon glyphicon-trash"></i></a>';
}

window.excludeRemedioEvents = {
    'click .edit-remedio': function (e, value, row) {
        remedioConfAtual = row.id;
        $.each(['nome', 'tipo', 'qtdade', 'unidade', 'descricao'], function (i, k) {
            $('#formPrescricaoRemedio [name=' + k + ']').val(row[k] === null || row[k] === undefined ? '' : row[k]);
        });
        $('#formPrescricaoRemedio [name=nome]').focus();
    },
    'click .remove': function (e, value, row) {
        swal({
            title: 'Excluir o remédio do padrão?',
            text: row.nome || '',
            type: 'warning',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#DD6B55',
            confirmButtonText: 'Sim, excluir'
        }).then(function () {
            $.ajax({url: URL_CONF_PRESCRICOES + 'ExcluirConfPrescricaoRemedio', data: {id: row.id}, method: 'GET'})
                .success(function () { $tablePrescricaoRemedios.bootstrapTable('refresh'); })
                .fail(function () { swal('Prescrição padrão', 'Ocorreu um erro ao excluir o remédio.', 'error'); });
        }, function () { /* cancelado */ });
    }
};

function limpaRemedio() {
    remedioConfAtual = 0;
    $('#formPrescricaoRemedio input, #formPrescricaoRemedio textarea').val('');
}

function NovaPrescricao() {
    $('#formPrescricao input[type=text], #formPrescricao input:not([type]), #formPrescricao textarea').val('');
    $('#formPrescricao #id_cont_esp').prop('checked', false);
    $('#id_id_prescricao').val('0');
    $('#data_prescricao').html('<span class="badge badge-primary">Nova</span>');
    limpaRemedio();
    $tablePrescricaoRemedios.bootstrapTable('removeAll');
    $('#formPrescricao #id_nome').focus();
}

function ReadPrescricao(row) {
    var id = row && row.id !== undefined ? row.id : row;
    $.ajax({
        url: URL_CONF_PRESCRICOES + 'CarregaConfPrescricao/',
        data: {prescricao: id},
        method: 'GET'
    }).success(function (data) {
        if (!data.success) { return; }
        var f = data.success.fields || {};
        $('#id_id_prescricao').val(data.success.id);
        $('#formPrescricao #id_nome').val(f.id_nome === undefined || f.id_nome === 'None' ? '' : f.id_nome);
        $('#formPrescricao #id_prescricao').val(f.id_prescricao === undefined || f.id_prescricao === 'None' ? '' : f.id_prescricao);
        $('#formPrescricao #id_cont_esp').prop('checked', f.id_cont_esp === 'True' || f.id_cont_esp === '1');
        $('#data_prescricao').html(data.success.dataSalvo);
        limpaRemedio();
        $tablePrescricaoRemedios.bootstrapTable('refresh');
    }).fail(function () {
        swal('Prescrição padrão', 'Não foi possível abrir este padrão.', 'error');
    });
}

function SalvaPrescricao(qual) {
    if (window.event && window.event.preventDefault) { window.event.preventDefault(); }   // o botão do remédio fica dentro de um <form>
    if (qual === 'remedio') { return SalvaRemedioPadrao(); }
    if (!$.trim($('#formPrescricao #id_nome').val())) {
        swal('Prescrição padrão', 'Informe o tipo de receita (o nome do padrão).', 'warning');
        return false;
    }
    $.ajax({
        url: URL_CONF_PRESCRICOES + 'SalvaConfPrescricao/',
        data: {
            prescricao: $('#id_id_prescricao').val() || '0',
            form: $('#formPrescricao').serialize()
        },
        method: 'GET'
    }).success(function (data) {
        if (data.success) {
            $('#id_id_prescricao').val(data.success.id);
            $('#data_prescricao').html(data.success.dataSalvo);
            $tablePrescricao.bootstrapTable('refresh');
            toastr.success('Padrão de prescrição salvo.', 'Salvo com sucesso!');
        } else {
            swal('Prescrição padrão', data.error === 'medico' ? 'Seu usuário não tem um médico vinculado. Vincule um médico ao usuário em Cadastros auxiliares > Usuários para salvar o padrão.' : 'Erro ao salvar: ' + (data.error || ''), 'error');
        }
    }).fail(function () {
        swal('Prescrição padrão', 'Erro ao salvar. Confira os campos.', 'error');
    });
    return false;
}

function SalvaRemedioPadrao() {
    var presc = $('#id_id_prescricao').val();
    if (!presc || presc === '0') {
        swal('Prescrição padrão', 'Salve a prescrição antes de acrescentar remédios.', 'warning');
        return false;
    }
    if (!$.trim($('#formPrescricaoRemedio [name=nome]').val())) {
        swal('Prescrição padrão', 'Informe o nome do remédio.', 'warning');
        return false;
    }
    $.ajax({
        url: URL_CONF_PRESCRICOES + 'SalvaConfPrescricaoRemedio/',
        data: {
            remedio: remedioConfAtual || '0',
            prescricao: presc,
            form: $('#formPrescricaoRemedio').serialize()
        },
        method: 'GET'
    }).success(function (data) {
        if (data.success) {
            limpaRemedio();
            $tablePrescricaoRemedios.bootstrapTable('refresh');
            toastr.success('Remédio salvo no padrão.', 'Salvo com sucesso!');
        } else {
            swal('Prescrição padrão', 'Erro ao salvar o remédio.', 'error');
        }
    }).fail(function () {
        swal('Prescrição padrão', 'Erro ao salvar o remédio. Confira os campos.', 'error');
    });
    return false;
}

function ExcluiPrescricaoPadrao(row) {
    swal({
        title: 'Excluir o padrão de prescrição?',
        text: row.nome || '',
        type: 'warning',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#DD6B55',
        confirmButtonText: 'Sim, excluir'
    }).then(function () {
        $.ajax({
            url: URL_CONF_PRESCRICOES + 'ExcluiConfPrescricao/',
            data: {id: row.id},
            method: 'GET'
        }).success(function (data) {
            if (data.success) {
                $tablePrescricao.bootstrapTable('refresh');
                if (String($('#id_id_prescricao').val()) === String(row.id)) { NovaPrescricao(); }
                toastr.success('Padrão de prescrição excluído.', 'Excluído');
            } else {
                swal('Prescrição padrão', 'Ocorreu um erro ao excluir.', 'error');
            }
        }).fail(function () {
            swal('Prescrição padrão', 'Ocorreu um erro ao excluir.', 'error');
        });
    }, function () { /* cancelado */ });
}
