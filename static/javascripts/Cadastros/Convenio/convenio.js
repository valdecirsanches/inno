function FechaConvenio(){
    $('#id_TelaConvenio').addClass('hidden');
}

var $tableConvenio = $('#tabelaConvenio');

function rowStyle(row, index) {
    return {
        classes: 'ATENDIDO'
    }
}

$tableConvenio.on('dbl-click-row.bs.table', function (e, row) {
    ReadConvenio(row);
});

function OpcoesConvenio(value, row, index) {
    return [
        '<div class="">',
        '<a class="edit btn btn-priediamary btn-xs m-r-xs" href="javascript:void(0)" title="Altera dados do convênio">',
        '<i class="fa fa-edit"> </i>',
        '</a>',
        '<a class="del btn btn-danger btn-xs m-r-xs" href="javascript:void(0)" title="Excluir convênio">',
        '<i class="fa fa-trash"> </i>',
        '</a>',
        // '<a class="access btn btn-primary btn-xs" href="javascript:void(0)" title="Permissões">',
        // '<i class="fa fa-key"> </i>',
        '</a>',
        '</div>'
    ].join('');
}

window.EventsConvenio = {
    'click .edit': function (e, value, row) {
        ReadConvenio(row);
    },
    'click .add': function (e, value, row) {
        AddConvenio();
    },
    'click .access': function (e, value, row) {
        // {#Permissao(row.id);#}
    },
    'click .del': function (e, value, row) {
        DelConvenio(row);
    }
};

function AddConvenio(){
    $('.classConvenio input').val('');
    $('.classConvenio textarea').val('');
    $('#id_TelaConvenio').removeClass('hidden');
    $('.classConvenio #id_codigo').focus();
}
function ReadConvenio(row) {
    $('#id_TelaConvenio').removeClass('hidden');
    for (const [key, value] of Object.entries(row)) {
        if ((value === 'None') || (value === null)) {$('.classConvenio #id_' + key).val('');}
        else if (value.toString() === 'true') {$('.classConvenio #id_'+key).prop('checked', true)}
        else if (value.toString() === 'false') {$('.classConvenio #id_' + key).prop('checked', false)}
        else {$('.classConvenio #id_' + key).val(value)}
    }
    $('.classConvenio #id_nome').focus();
}

function SalvaConvenio() {
    var id = $('.classConvenio #id_id').val() || 0;
    $.ajax({
        url: 'convenio.json',
        data: {
            form: $('.classConvenio').serialize(true),
            id: $('.classConvenio #id_id').val() || '0'
        },
        type: 'POST',
    }).success(function Ret(data) {
        if (data.success) {
            $tableConvenio.bootstrapTable('refresh', {silent: true});
            toastr.success('Dados salvos com sucesso!', 'Gravando dados do Convenio.');
            FechaConvenio();
        }
        else {
            swal('Salvando dados de Convenio', data.error, 'error');
        }
    });
}

function DelConvenio(row) {
    swal({
        title: row.convenio,
        text: "Todos os dados cadastrais do Convenio serão excluídos!",
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir!",
        cancelButtonText: "Não",
    }).then( function () {
        $.ajax({
            url: 'convenio.json',
            data: {id: row.id},
            type: 'DELETE',
        }).success(function Ret(data) {
            if (data.success) {
                $('.classConvenio input').val('');
                $('.classConvenio textarea').val('');
                $tableConvenio.bootstrapTable('refresh', {silent: true});
                toastr.success('Excluido com sucesso', 'Exclusão de Convenio.');
            } else {
                toastr.error('Erro ao excluir o Convenio', 'Exclusão de Convenio. Nada feito!');
            }
        });
    });
}


