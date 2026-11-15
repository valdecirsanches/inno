
var $tablePlanosSaude = $('#tabelaPlanosSaude');


$tablePlanosSaude.on('dbl-click-row.bs.table', function (e, row) {
    ReadPlano(row);
});

function rowStyle(row, index) {
    return {
        classes: 'ATENDIDO'
    };
}
$tablePlanosSaude.on('dbl-click-row.bs.table', function (e, row) {
    ReadPlano(row);
});

function addPlano(){
    $('.classPlanoSaude input').val('');
    $('.classPlanoSaude textarea').val('');
    $('.classPlanoSaude #id_descricao').focus();

}

function SavePlano() {
    swal({
        title: $('.classPlanoSaude #id_descricao').val(),
        text: 'Deseja salvar o Plano de saude?',
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Desistir",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, salvar",
        closeOnConfirm: false
    }).then(function(isConfirm){
        if (isConfirm){
            $.ajax({
                url: '/cadastros/planos/SalvaPlanoSaude',
                data: {
                    id: $('#id_id').val(),
                    form: $('#formDadosPlanoSaude').serialize(true),
                },
                type: 'GET',
            }).success(function Ret(data) {
                if (data.success) {
                    $tablePlanosSaude.bootstrapTable('refresh', {silent: true});
                    toastr.success('Plano de saúde salvo com sucesso!', 'Plano de Saude');
                }
                else if (data.error) {
                    swal('Planos de Saude', data.error, 'error');
                }
            });
        }
    });
}

function DeletePlano(row){
    swal({
        title: row.descricao,
        text: 'Tem certeza que deseja excluir o Plano de Saude?',
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Desistir",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir",
        closeOnConfirm: false
    }).then(function(isConfirm){
        if (isConfirm){
            $.ajax({
                url: '/cadastros/planos/ExcluiPlanoSaude',
                data:  {id: row.id },
                method: 'GET',
            }).success(function Ret(data){
                if (data.success){
                    $tablePlanosSaude.bootstrapTable('refresh', {silent: true});
                    swal('Plano de Saude', '"'+row.descricao+'" Excluído com sucesso', 'success');
                } else if (data.error) {
                    swal('Planos de Saude', data.error, 'error');
                }
            });
        }
    });
}

function ReadPlano(row){
    $.ajax({
        url: '/cadastros/planos/CarregaPlanoSaude',
        data: {
            id: row.id,
        },
        method: 'GET',
    }).success(function Ret(data){
        if (data.success){
            // $('#modalPlano').modal('toggle');
            $('.classPlanoSaude #id_id').val(data.success.id);
            for (var key in data.success.fields) {
                if (data.success.fields.hasOwnProperty(key)) {
                    if (data.success.fields[key] === 'None') {
                        $('.classPlanoSaude #' + key).val('');
                    }
                    else {
                        $('.classPlanoSaude #' + key).val(data.success.fields[key]);
                    }
                }
            }
            $('.classPlanoSaude #id_descricao').focus();
        }
    });
}

function FormatoPlano(value, row, index){
    return [
        '<div class="">',
        '<a class="edit btn btn-primary btn-xs m-r-xs" href="javascript:void(0)" title="Altera dados do plano">',
        '<i class="fa fa-edit"> </i>',
        '</a>',
        '<a class="del btn btn-danger btn-xs m-r-xs" href="javascript:void(0)" title="Excluir plano">',
        '<i class="fa fa-trash"> </i>',
        '</a>',
        '</div>'
    ].join('');
}


window.EventoPlano = {
    'click .edit': function (e, value, row) {
       ReadPlano(row);
    },
    'click .del': function (e, value, row) {
       DeletePlano(row);
    }
};



