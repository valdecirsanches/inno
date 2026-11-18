/*
 * Configurações > Relatórios (padrões de relatório do médico).
 * A tela chama NovoRelatorio(), SalvaRelatorio() e os formatadores da tabela
 * (editFormatter/editRelatorioEvents, excludeFormatter/excludeRelatorioEvents); antes
 * quase tudo estava comentado e nada funcionava.
 * Endereços: CarregaConfRelatorios, CarregaConfRelatorio, SalvaConfRelatorio, ExcluiConfRelatorio.
 */
var $tableRelatorios = $('#tabelaRelatorios');
var URL_CONF_RELATORIOS = '/configuracoes/relatorios/';

var CAMPOS_CONF_RELATORIO = {
    id_nome: '#formRelatorio #id_nome',
    id_titulo: '#formRelatorio #id_titulo',
    id_texto: '#formRelatorio #id_texto',
    id_cid10: '#formRelatorio #id_cid10_relatorio'
};

function editFormatter() {
    return '<a class="edit" href="javascript:void(0)" title="Editar"><i class="glyphicon glyphicon-edit"></i></a>';
}

function excludeFormatter() {
    return '<a class="remove" href="javascript:void(0)" title="Excluir"><i class="glyphicon glyphicon-trash"></i></a>';
}

window.editRelatorioEvents = {
    'click .edit': function (e, value, row) { CarregaRelatorio(row.id); }
};

window.excludeRelatorioEvents = {
    'click .remove': function (e, value, row) { ExcluiRelatorioPadrao(row); }
};

$tableRelatorios.on('dbl-click-row.bs.table', function (e, row) { CarregaRelatorio(row.id); });

function NovoRelatorio() {
    $('#formRelatorio input[type=text], #formRelatorio input:not([type]), #formRelatorio textarea').val('');
    $('#id_id_relatorio').val('0');
    $('#data_exames').html('<span class="badge badge-primary">Novo</span>');
    $('#formRelatorio #id_nome').focus();
}

function CarregaRelatorio(id) {
    $.ajax({
        url: URL_CONF_RELATORIOS + 'CarregaConfRelatorio/',
        data: {relatorio: id},
        method: 'GET'
    }).success(function (data) {
        if (!data.success) { return; }
        $('#id_id_relatorio').val(data.success.id);
        $.each(CAMPOS_CONF_RELATORIO, function (chave, seletor) {
            var v = data.success.fields[chave];
            $(seletor).val(v === undefined || v === 'None' ? '' : v);
        });
        $('#data_exames').html(data.success.dataSalvo);
    }).fail(function () {
        swal('Relatório padrão', 'Não foi possível abrir este padrão.', 'error');
    });
}

function SalvaRelatorio() {
    if (!$.trim($('#formRelatorio #id_nome').val())) {
        swal('Relatório padrão', 'Informe o tipo de relatório (o nome do padrão).', 'warning');
        return;
    }
    $.ajax({
        url: URL_CONF_RELATORIOS + 'SalvaConfRelatorio/',
        data: {
            relatorio: $('#id_id_relatorio').val() || '0',
            form: $('#formRelatorio').serialize()
        },
        method: 'GET'
    }).success(function (data) {
        if (data.success) {
            $('#id_id_relatorio').val(data.success.id_exame);
            $tableRelatorios.bootstrapTable('refresh');
            toastr.success('Padrão de relatório salvo.', 'Salvo com sucesso!');
        } else {
            swal('Relatório padrão', 'Erro ao salvar: ' + (data.error || ''), 'error');
        }
    }).fail(function () {
        swal('Relatório padrão', 'Erro ao salvar. Confira os campos.', 'error');
    });
}

function ExcluiRelatorioPadrao(row) {
    swal({
        title: 'Excluir o padrão de relatório?',
        text: row.nome || row.titulo || '',
        type: 'warning',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#DD6B55',
        confirmButtonText: 'Sim, excluir'
    }).then(function () {
        $.ajax({
            url: URL_CONF_RELATORIOS + 'ExcluiConfRelatorio/',
            data: {id: row.id},
            method: 'GET'
        }).success(function (data) {
            if (data.success) {
                $tableRelatorios.bootstrapTable('refresh');
                if (String($('#id_id_relatorio').val()) === String(row.id)) { NovoRelatorio(); }
                toastr.success('Padrão de relatório excluído.', 'Excluído');
            } else {
                swal('Relatório padrão', 'Ocorreu um erro ao excluir.', 'error');
            }
        }).fail(function () {
            swal('Relatório padrão', 'Ocorreu um erro ao excluir.', 'error');
        });
    }, function () { /* cancelado */ });
}
