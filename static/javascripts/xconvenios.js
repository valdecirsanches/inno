
var $tableConvenio = $('#tabelaConvenio');

function NovoConvenio(){
    $('#id_id').val(0);
    // $('#codigo_id').val('');
    // $('#descricao_id').val('');
    $('#modal_convenio').modal('show');
    $('#codigo_id').focus();

}

function SalvaConvenio() {
    var id=$('#id_id').val();
    swal({
        title: 'Deseja salvar o Convenio?',
        text: 'Confirme',
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Desistir",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, salvar",
        closeOnConfirm: false
    }).then(function(isConfirm){
        if (isConfirm){
            $.ajax({
                url: '/cadastros/SalvaConvenio',
                data: {
                    'id': id,
                    form: $('#formDadosConvenio').serialize(true),
                },
                type: 'GET',
                success: Ret
            });
            function Ret(data) {
                if (data.success) {
                    $tableConvenio.bootstrapTable('updateByUniqueId', { id: id, row: data.row});
                    toastr.success('Convênio salvo com sucesso!', 'Convênios');
                    $('#modal_convenio').modal('hide');
                }
                else if (data.error) {
                    swal('Convênios', 'Erro ao salvar '+data.error, 'error');
                }
            }
        }
    });
}

function ExcluirConvenio(row){
    swal({
        title: 'Tem certeza que deseja excluir o Convenio?',
        text: 'Excluir '+row.convenio,

        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Desistir",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir",
        closeOnConfirm: false
    }).then(function(isConfirm){
        if (isConfirm){
            $.ajax({
                url: '/cadastros/ExcluirConvenio',
                data:  {id: row.id },
                method: 'GET',
                success: Ret,
            });
            function Ret(data){
                if (data.success){
                    swal('Convênios', '"'+row.convenio+'" Excluído com sucesso', 'success');
                    $tableConvenio.bootstrapTable('removeByUniqueId', row.id);
                }
            }
        }
    });
}
function CarregaConvenio(id){
    $.ajax({
        url: '/cadastros/CarregaConvenio',
        data: {
            id: id,
            form: $('#formDadosConvenio').serialize(true)
        },
        method: 'GET',
        success: Ret
    });
    function Ret(data){
        if (data.success){
            // $('#modal_convenio').modal('toggle');
            $('#id_id').val(data.success.id);
            for (var key in data.success.fields) {
                if (data.success.fields.hasOwnProperty(key)) {
                    if (data.success.fields[key] === 'None') { $('#' + key).val(''); }
                    else { $('#' + key).val(data.success.fields[key]); }
                }
            }
        }
    }
}

function FormatoEdit(value, row, index){
    return [
        '<a class="edit ml10" ' +
        'title="Altera o convênio">',
        '<i class="fa fa-edit"></i>',
        '</a>'
    ].join('');
}

function FormatoDel(value, row, index){
    return [
        '<a class="del ml10" ' +
        'title="Exclui o Convenio">',
        '<i class="fa fa-trash"></i>',
        '</a>'
    ].join('');
}

window.EventoEdit = {
    'click .edit': function (e, value, row) {
       CarregaConvenio(row.id);
    }
};


window.EventoDel = {
    'click .del': function (e, value, row) {
       ExcluirConvenio(row);
    }
};

$('#datepicker.input-daterange').datepicker({
    format: "dd/mm/yyyy",
    todayBtn: "linked",
    clearBtn: true,
    language: "pt-BR"
});

