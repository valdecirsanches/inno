
let exame_alterado

$(".save_exame").on("paste input", function() {
    exame_alterado=true
});

$(".save_exame").blur( function() {
    if(exame_alterado) {
        exame_alterado=false;
        UpdateExame();
    }
});
$('.save_exame').on('select2:close', event =>  UpdateExame());


/* Table Functions */
var $tableExames= $('#tabelaExames');


$tableExames.on('click-row.bs.table', function (e, row, $element) {
    ReadExame(row.id);

});

async function ImprimeExame(){
    await UpdateExame(true);
    printPDF('ImprimeExame?id_exame=' + exame.object.id);
}

window.EventsExame = {
    'click .edit': function (e, value, row, index) {
        ReadExame(row.id);
    },
    'click .remove': function (e, value, row, index) {
        DeleteExame(row.id);
    },
    'click .clonar': function (e, value, row, index) {
        Clone(row.id);
    }
};

var $tableConfExames = $('#tabelaConfExames');

$tableConfExames.on('dbl-click-row.bs.table', function (e, row) {
    UtilizaConfExame(row.id);
});


function OptionConfExame(value, row, index) {
    return [
        '<div>',
        '<a class="select btn btn-success btn-outline" href="javascript:void(0)" title="Selecionar">',
        '<i class="glyphicon glyphicon-ok"></i>',
        '</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
        '<a class="delete btn btn-success btn-outline" href="javascript:void(0)" title="Apagar">',
        '<i class="glyphicon glyphicon-trash"></i>',
        '</a>',
        '</div>'
    ].join('');
}
window.EventsConfExame = {
    'click .select': function (e, value, row, index) {
        UtilizaConfExame(row.id);
    },
    'click .delete': function (e, value, row, index) {
        ExcluiConfExame(row);
    }
};

function OptionsExame(value, row, index) {
    return [
        '<div>',
        '<a class="edit btn btn-success btn-outline" href="javascript:void(0)" title="Editar">',
        '<i class="glyphicon glyphicon-edit"></i>',
        '</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
        '<a class="remove btn btn-success btn-outline" href="javascript:void(0)" title="Apagar">',
        '<i class="glyphicon glyphicon-trash"></i>',
        '</a>',
        '</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
        '<a class="clonar btn btn-success btn-outline" href="javascript:void(0)" title="Clonar">',
        '<i class="fa fa-copy"></i>',
        '</a>',
        '</div>'
    ].join('');
}

async function CarregaExames(){
    await $tableExames.bootstrapTable('refresh', {query: {id_prontuario: $('#id_fk_prontuario').val()}});
}

function Clone(id){
    swal({
        title: "Clone de exame",
        text: "Criará um exame idêntico, na data atual",
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, clonar",
        closeOnConfirm: true,
    }).then(async function(isConfirm) {
        const resp = await api.post(`exames/${exame.object.id}/clone/`);
        await ReadExame(resp.data.success);
        toastr.success('Exame clonado com sucesso.', 'Feito!');
        $tableExames.bootstrapTable('insertRow',{index: 0, row: exame.object});
        $tableExames.bootstrapTable('checkBy', {field: 'id', values: [exame.object.id]});
        $('#exame_data_salvo').html($('#exame_data_salvo').html() + '     <span class="badge badge-danger">C l o n e</span>');
    });
}

function AdicionaExamePadrao(){
    swal({
        title: "Adicionar esse exame como padrão!",
        text: "Insira uma descrição para identificar esse padrão:",
        type: "warning",
        input: 'text',
        showCancelButton: true,
        animation: "slide-from-top",
        inputPlaceholder: "Escreva a descrição aqui"
    }).then( function(inputValue) {
        if (inputValue === false) return false;
        if (inputValue === "") {
            swal.showInputError("É necessario Adicionar uma descrição");
            return false;
        }
        $.ajax({
            url: '/configuracoes/exames/AdicionaConfExamePadrao',
            data: {
                'descricao': inputValue,
                'exame': $('#id_id_exames').val()
            },
            method: 'GET',
        }).success(function Ret(data) {
            if (data.success) {
                // CarregaExame(data.success);
                swal("Ótimo!", "Exame padrão '" + inputValue + "' adicionado", "success");
            } else {
                swal("Desculpe!", "Erro ao adicionar '" + inputValue + "' como exame padrão ", "error");
            }
        });
    });
}

function SelecionaExame() {
    $tableConfExames.bootstrapTable('refresh');
    $('#modalConfExames').modal('show');
}

async function UtilizaConfExame(conf){
    const resp = await api.post(`exames/get-consulta/`, {id_consulta: $('.classAtendimento #id_fk_consulta_atual').val()});
    $.ajax({
        url: '/prontuario/Exames/UtilizaConfExame',
        data: {
            'conf': conf,
            'prontuario': resp.data.success.fk_paciente.id,
            'consulta': resp.data.success.fk_consulta.id,
            'medico': resp.data.success.fk_medico.id
        },
        method: 'GET',
    }).success(function Ret(data){
        // localStorage.setItem('appClinic_id_exame_selected',data.success);
        ReadExame(data.success);
        CarregaExames();

        $('#modalConfExames').modal('hide');
    });
}


function ExcluiConfExame(row) {
    swal({
            title: "Exclusão de exame padrão: "+row.descricao,
            text: "Confirma a exclusão definitiva deste exame?",
            type: "warning",
            showCancelButton: true,
            cancelButtonText: "Desistir",
            confirmButtonColor: "#DD6B55",
            confirmButtonText: "Sim, excluir",
            closeOnConfirm: true
    }).then(function () {
        $.ajax({
            url: '/prontuario/Exames/exames.json/',
            data: {
                'exame': row.id,
                'acao': 'EXCLUI_CONF'
            },
            method: 'DELETE',
        }).success(function Ret(data) {
            if (data.success) {
                $tableConfExames.bootstrapTable('removeByUniqueId', row.id);
                toastr.info('Exame padrão excluido com sucesso!', 'EXAME PADRÃO');
            }
            else {
                toastr.error('Exame padrão não excluido!', 'EXAME PADRÃO');
            }
        });
    });
}
