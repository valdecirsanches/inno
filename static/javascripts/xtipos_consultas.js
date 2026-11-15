

var $tableTiposConsulta = $('#tabelaTiposConsulta');




function NovoTipoConsulta(){
    $('#id_id').val(0);
    $('#codigo_id').val('');
    $('#descricao_id').val('');
    $('#modal_tipo_consulta').modal('toggle');
    $('#codigo_id').focus();
}

function SalvaTipoConsulta() {
    var id=$('#id_id').val();
    swal({
        title: 'Deseja salvar o tipo de consulta?',
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
                url: '/cadastros/SalvaTipoConsulta',
                data: {
                    'id': $('#id_id').val(),
                    'descricao_id': $('#descricao_id').val(),
                    'codigo_id': $('#codigo_id').val()
                },
                type: 'GET',
                success: Ret
            });
            function Ret(data) {
                if (data.success) {
                    $tableTiposConsulta.bootstrapTable('updateByUniqueId', { id: id, row: data.row});
                    toastr.success(data.success, 'Tipos de consultas:');
                    $('#modal_tipo_consulta').modal('hide');
                }
            }
        }
    });
}

function ExcluirTipoConsulta(row){
    swal({
        title: 'Tem certeza que deseja excluir o Tipo de Consulta?',
        text: 'Excluir '+row.descricao,
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Desistir",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir",
        closeOnConfirm: false
    }).then(function(isConfirm){
        if (isConfirm){
            $.ajax({
                url: '/cadastros/ExcluirTipoConsulta',
                data:  {id: row.id },
                method: 'GET',
                success: Ret,
            });
            function Ret(data){
                if (data.success){
                    swal('Tipo de consulta', '"'+row.descricao+'" Excluído com sucesso', 'success');
                    $tableTiposConsulta.bootstrapTable('removeByUniqueId', row.id);
                }
            }
        }
    });
}
function CarregaTipoConsulta(id){
    $.ajax({
        url: '/cadastros/CarregaTipoConsulta',
        data: {id: id},
        method: 'GET',
        success: Ret
    });
    function Ret(data){
        if (data){
            $('#id_id').val(data.id);
            $('#codigo_id').val(data.codigo);
            $('#descricao_id').val(data.descricao);
            $('#modal_tipo_consulta').modal('toggle');
        }
    }
}

function FormatoEdit(value, row, index){
    return [
        '<a class="edit ml10" ' +
        'title="Altera o tipo de consulta">',
        '<i class="fa fa-edit"></i>',
        '</a>'
    ].join('');
}

function FormatoDel(value, row, index){
    return [
        '<a class="del ml10" ' +
        'title="Exclui o tipo de consulta">',
        '<i class="fa fa-trash"></i>',
        '</a>'
    ].join('');
}

window.EventoEdit = {
    'click .edit': function (e, value, row) {
       CarregaTipoConsulta(row.id)
    }
};


window.EventoDel = {
    'click .del': function (e, value, row) {
       ExcluirTipoConsulta(row)
    }
};