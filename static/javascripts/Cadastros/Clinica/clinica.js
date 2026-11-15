function FechaClinica(){
    $('#id_TelaClinica').addClass('hidden');
}

var $tableClinica = $('#tabelaClinica');

function rowStyle(row, index) {
    return {
        classes: 'ATENDIDO'
    }
}

$tableClinica.on('dbl-click-row.bs.table', function (e, row) {
    ReadClinica(row);
});


function OpcoesClinica(value, row, index) {
    return [
        '<div class="">',
        '<a class="edit btn btn-primary btn-xs m-r-xs" href="javascript:void(0)" title="Altera dados da clínica">',
        '<i class="fa fa-edit"> </i>',
        '</a>',
        '<a class="del btn btn-danger btn-xs m-r-xs" href="javascript:void(0)" title="Excluir clínica">',
        '<i class="fa fa-trash"> </i>',
        '</a>',
        '</div>'
    ].join('');
}

window.EventsClinica = {
    'click .edit': function (e, value, row) {
        ReadClinica(row);
    },
    'click .add': function (e, value, row) {
        AddClinica(row.id);
    },
    'click .access': function (e, value, row) {
        // {#Permissao(row.id);#}
    },
    'click .del': function (e, value, row) {
        DelClinica(row.id);
    }
};

function AddClinica(){
    $('.classClinica input').val('');
    $('.classClinica textarea').val('');
    $('#id_TelaClinica').removeClass('hidden');
    $('.classClinica #id_nome').focus();
}



function ReadClinica(row) {
    $('#id_TelaClinica').removeClass('hidden');
    for (const [key, value] of Object.entries(row)) {
        if ((value === 'None') || (value === null)) {$('.classClinica #id_' + key).val('');}
        else if (value.toString() === 'true') {$('.classClinica #id_'+key).prop('checked', true)}
        else if (value.toString() === 'false') {$('.classClinica #id_' + key).prop('checked', false)}
        else {$('.classClinica #id_' + key).val(value)}
    }
    $('.classClinica #id_nome').focus();
}

// Evita que cliques repetidos em "Salvar" criem a mesma clínica duas vezes.
var salvandoClinica = false;

function SalvaClinica() {
    if (salvandoClinica) {
        return;
    }
    salvandoClinica = true;
    $('#btnSalvaPlano').prop('disabled', true);

    var id = $('.classClinica #id_id').val() || 0;
    var nova = !(parseInt(id, 10) > 0);
    $.ajax({
        url: 'clinica.json',
        data: {
            form: $('.classClinica').serialize(true),
            id: $('.classClinica #id_id').val() || '0'
        },
        type: 'POST',
    }).success(function Ret(data) {
        if (data.success) {
            var row=data.success;
            if (nova) {
                // $tableClinica.bootstrapTable('insertRow', {id: row.id, row: row});
                $tableClinica.bootstrapTable('refresh');
            } else {
                $tableClinica.bootstrapTable('updateByUniqueId', {id: row.id, row: row});
            }
            // A clínica continua aberta após salvar. Guarda o id devolvido pelo
            // servidor para que o próximo "Salvar" atualize esta mesma clínica
            // (sem isso, uma clínica recém-criada seria criada de novo).
            $('.classClinica #id_id').val(row.id);
            toastr.success('Dados salvos com sucesso!', 'Gravando dados do Clinica.');
        }
        else {
            swal('Salvando dados de Clinica', data.error, 'error');
        }
    }).always(function () {
        salvandoClinica = false;
        $('#btnSalvaPlano').prop('disabled', false);
    });
}

function DelClinica(id) {
    swal({
        title: $('.classClinica #id_nome').val(),
        text: "Todos os dados cadastrais da Clinica serão excluídos!",
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir!",
        cancelButtonText: "Não",
    }).then( function () {
        $.ajax({
            url: 'clinica.json',
            data: {id: id},
            type: 'DELETE',
        }).success(function Ret(data) {
            if (data.success) {
                $tableClinica.bootstrapTable('removeByUniqueId', id);
                toastr.success('Excluido com sucesso', 'Exclusão de Clinica.');
            } else {
                toastr.error('Erro ao excluir o Clinica', 'Exclusão de Clinica. Nada feito!');
            }
        });
    });
}


