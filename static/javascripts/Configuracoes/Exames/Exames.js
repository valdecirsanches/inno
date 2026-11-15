/* Table Functions */
var $tableExames= $('#tabelaExames');

$tableExames.on('dbl-click-row.bs.table', function (e, row) {
    CarregaExame(row.id);
});

window.EventsExame = {
    'click .edit': function (e, value, row, index) {
        CarregaExame(row.id);
    },
    'click .remove': function (e, value, row, index) {
        var msg = "Excluir o exame " + row['descricao'] + ":";
        swal({
            title: 'Deseja realmente excluir o exame dos padrões?',
            text: msg,
            type: "warning",
            showCancelButton: true,
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#DD6B55",
            confirmButtonText: "Sim, excluir",
            closeOnConfirm: false
        }).then(function () {
            $.ajax({
                url: '/configuracoes/exames/Exclui',
                data: {
                    'id': row['id']
                },
                method: 'GET',
            }).success(function Ret(data) {
                if (data.success) {
                    swal({
                        title: "Excluido!",
                        text: "O padrão de exame foi excluido.",
                        type: "success",
                        timer: 3000
                    });
                    $tableExames.bootstrapTable('refresh');
                } else {
                    swal({title: "Não excluido!", text: "Ocorreu um erro ao excluir.", type: "error"});
                }
            });
        });
    }
};


function OptionsExame(value, row, index) {
    return [
        '<a class="edit" href="javascript:void(0)" title="Editar">',
        '   <i class="glyphicon glyphicon-edit"></i>',
        '</a>',

        '<a class="remove" href="javascript:void(0)" title="Remover">',
        '   <i class="glyphicon glyphicon-remove"></i>',
        '</a>'
    ].join('');
}

function NovoExame() {
    $('#formExames input, #formExames textarea').val('');
    // selecionaCIDExames.clear();
    $('#id_id_exames').val('0');
}

function CarregaExame(id){
    $.ajax({
        url: '/configuracoes/exames/Carrega',
        data: {
            'exames': id
        },
        method: 'GET',
    }).success(function Ret(data) {
        if(data.success) {
            $('#id_id_exames').val(data.success.id);
            for (var key in data.success.fields) {
                if (data.success.fields.hasOwnProperty(key)) {
                    if (data.success.fields[key] == 'None') { $('#' + key).val(''); }
                    else { $('#' + key).val(data.success.fields[key]); }
                }
            }
            if (data.success.cid.length > 0){
                var cid = data.success.fields['id_cid10'].split(",");
                selecionaCIDExames.addOption(data.success.cid);
                selecionaCIDExames.clear();

                for(var i in cid){
                    if (cid.hasOwnProperty(i)){
                        selecionaCIDExames.addItem(cid[i]);
                    }
                }
            }
            $('#data_exames').html(data.success.dataSalvo);
        }
    });
}

function SalvaConfExame(silent){
    $.ajax({
        url: '/configuracoes/exames/Salva',
        data: {
            'exame': $('#id_id_exames').val(),
            'form': $('#formExames').serialize()
        },
        method: 'GET',
    }).success(function Ret(data){
        if (data.success && !silent){
            $tableExames.bootstrapTable('refresh');
            $('#id_id_exames').val(data.success.id);
            $('#data_exames').html(data.success.dataSalvo);
            toastr.success('Dados Corretamente guardados no prontuario', 'Salvo com sucesso!');
        } else if(!silent){
            toastr.error(data.error, 'Problemas ao salvar!')
        }
    });
}