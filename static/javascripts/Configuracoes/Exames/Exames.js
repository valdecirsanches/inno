/*
 * Configurações > Exames (padrões de exame do médico).
 * A tela chama AddExame(), UpdateExame() e os formatadores da tabela
 * (editFormatter/editExamesEvents, excludeFormatter/excludeExamesEvents); antes nenhum
 * deles existia e as chamadas iam para endereços que não existem, então nada funcionava.
 * Endereços: CarregaConfExames, CarregaConfExame, SalvaConfExame, ExcluiConfExame.
 */
var $tableExames = $('#tabelaExames');
var URL_CONF_EXAMES = '/configuracoes/exames/';

// campos do formulário pelo nome do campo do modelo
var CAMPOS_CONF_EXAME = {
    id_nome: '#formExames #id_nome',
    id_descricao: '#formExames #id_descricao',
    id_pedido: '#formExames #id_pedido_exames',
    id_motivo: '#formExames #id_motivo_exames',
    id_cid10: '#formExames #id_cid10_exames'
};

function editFormatter() {
    return '<a class="edit" href="javascript:void(0)" title="Editar"><i class="glyphicon glyphicon-edit"></i></a>';
}

function excludeFormatter() {
    return '<a class="remove" href="javascript:void(0)" title="Excluir"><i class="glyphicon glyphicon-trash"></i></a>';
}

window.editExamesEvents = {
    'click .edit': function (e, value, row) { CarregaExame(row.id); }
};

window.excludeExamesEvents = {
    'click .remove': function (e, value, row) { ExcluiExamePadrao(row); }
};

$tableExames.on('dbl-click-row.bs.table', function (e, row) { CarregaExame(row.id); });

function AddExame() {
    $('#formExames input[type=text], #formExames input:not([type]), #formExames textarea').val('');
    $('#id_id_exames').val('0');
    $('#data_exames').html('<span class="badge badge-primary">Novo</span>');
    $('#formExames #id_nome').focus();
}

function CarregaExame(id) {
    $.ajax({
        url: URL_CONF_EXAMES + 'CarregaConfExame/',
        data: {exames: id},
        method: 'GET'
    }).success(function (data) {
        if (!data.success) { return; }
        $('#id_id_exames').val(data.success.id);
        $.each(CAMPOS_CONF_EXAME, function (chave, seletor) {
            var v = data.success.fields[chave];
            $(seletor).val(v === undefined || v === 'None' ? '' : v);
        });
        $('#data_exames').html(data.success.dataSalvo);
    }).fail(function () {
        swal('Exame padrão', 'Não foi possível abrir este padrão.', 'error');
    });
}

function UpdateExame() {
    if (!$.trim($('#formExames #id_nome').val())) {
        swal('Exame padrão', 'Informe o tipo de exame (o nome do padrão).', 'warning');
        return;
    }
    $.ajax({
        url: URL_CONF_EXAMES + 'SalvaConfExame/',
        data: {
            exame: $('#id_id_exames').val() || '0',
            form: $('#formExames').serialize()
        },
        method: 'GET'
    }).success(function (data) {
        if (data.success) {
            $('#id_id_exames').val(data.success.id_exame);
            $tableExames.bootstrapTable('refresh');
            toastr.success('Padrão de exame salvo.', 'Salvo com sucesso!');
        } else {
            swal('Exame padrão', 'Erro ao salvar: ' + (data.error || ''), 'error');
        }
    }).fail(function () {
        swal('Exame padrão', 'Erro ao salvar. Confira os campos.', 'error');
    });
}

function ExcluiExamePadrao(row) {
    swal({
        title: 'Excluir o padrão de exame?',
        text: row.nome || row.descricao || '',
        type: 'warning',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#DD6B55',
        confirmButtonText: 'Sim, excluir'
    }).then(function () {
        $.ajax({
            url: URL_CONF_EXAMES + 'ExcluiConfExame/',
            data: {id: row.id},
            method: 'GET'
        }).success(function (data) {
            if (data.success) {
                $tableExames.bootstrapTable('refresh');
                if (String($('#id_id_exames').val()) === String(row.id)) { AddExame(); }
                toastr.success('Padrão de exame excluído.', 'Excluído');
            } else {
                swal('Exame padrão', 'Ocorreu um erro ao excluir.', 'error');
            }
        }).fail(function () {
            swal('Exame padrão', 'Ocorreu um erro ao excluir.', 'error');
        });
    }, function () { /* cancelado */ });
}
