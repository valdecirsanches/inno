
var $tableEspecialidade = $('#tabelaEspecialidade');


$tableEspecialidade.on('dbl-click-row.bs.table', function (e, row) {
    CarregaEspecialidade(row);
});

function rowStyle(row, index) {
    return {
        classes: 'ATENDIDO'
    }
}

function addEspecialidade(){
    $('.classEspecialidade #id_id').val(0);
    $('.classEspecialidade #id_descricao').val('');
    $('.classEspecialidade #id_anotacoes').val('');
    $('.classaEspecialidade #id_descricao').focus();

}

function SalvaEspecialidade() {
    swal({
        title: $('.classEspecialidade #id_descricao').val(),
        text: 'Deseja salvar a especialidade?',
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Desistir",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, salvar",
        closeOnConfirm: false
    }).then(function(isConfirm){
        if (isConfirm){
            $.ajax({
                url: '/cadastros/especialidades/SalvaEspecialidade',
                data: {
                    'id': $('#id_id').val(),
                    form: $('#formDadosEspecialidade').serialize(true),
                },
                type: 'GET',
            }).success(function Ret(data) {
                if (data.success) {
                    $tableEspecialidade.bootstrapTable('refresh');
                    toastr.success('Especialidade salvo com sucesso!', 'Especialidade');
                }
                else if (data.error) {
                    swal('Especialidade', 'Erro ao salvar '+data.error, 'error');
                }
            });
        }
    });
}

function ExcluirEspecialidade(row){
    swal({
        title: row.descricao,
        text: 'Tem certeza que deseja excluir a Especialidade?',
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Desistir",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir",
        closeOnConfirm: false
    }).then(function(isConfirm){
        if (isConfirm){
            $.ajax({
                url: '/cadastros/especialidades/ExcluiEspecialidade',
                data:  {id: row.id },
                method: 'GET',
            }).success(function Ret(data){
                if (data.success){
                    swal('Especialidade', '"'+row.descricao+'" Excluído com sucesso', 'success');
                    $tableEspecialidade.bootstrapTable('removeByUniqueId', row.id);
                }
            });
        }
    });
}
function CarregaEspecialidade(row){
    $.ajax({
        url: '/cadastros/especialidades/CarregaEspecialidade',
        data: {
            id: row.id,
        },
        method: 'GET',
    }).success(function Ret(data){
        if (data.success){
            $('.classEspecialidade #id_id').val(data.success.id);
            for (var key in data.success.fields) {
                if (data.success.fields.hasOwnProperty(key)) {
                    if (data.success.fields[key] === 'None') {
                        $('.classEspecialidade #' + key).val('');
                    }
                    else {
                        $('.classEspecialidade #' + key).val(data.success.fields[key]);
                    }
                }
            }
            $('.classEspecialidade #id_descricao').focus();
        }
    });
}

function FormatoEspecialidade(value, row, index){
    return [
        '<div class="">',
        '<a class="edit btn btn-primary btn-xs m-r-xs" href="javascript:void(0)" title="Altera dados da Especialidade">',
        '<i class="fa fa-edit"> </i>',
        '</a>',
        '<a class="del btn btn-danger btn-xs m-r-xs" href="javascript:void(0)" title="Excluir Especialidade">',
        '<i class="fa fa-trash"> </i>',
        '</a>',
        '</div>'
    ].join('');
}


window.EventoEspecialidade = {
    'click .edit': function (e, value, row) {
       CarregaEspecialidade(row);
    },
    'click .del': function (e, value, row) {
       ExcluirEspecialidade(row);
    }
};



