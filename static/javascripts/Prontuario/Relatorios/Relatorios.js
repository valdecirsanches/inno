
let alterado;

$(".save_relatorio").on("input", function() {
    alterado=true
 });

$(".save_relatorio").on("blur", function() {
    if ($('.classProntuarioRelatorio #id_titulo_relatorio').val() > '' ||
        $('.classProntuarioRelatorio #id_texto_relatorio').val() > '' ) 
    {
        if (alterado) {
            alterado=false; 
            UpdateRelatorio(false);
         }
    }
});

$('.save_relatorio').on('select2:close', event =>  UpdateRelatorio(false));





/* Table Functions */
var $tableRelatorios = $('#tabelaRelatorios');

$tableRelatorios.on('dbl-click-row.bs.table', function (e, row, $element) {
    ReadRelatorio(row.id);
});

$tableRelatorios.on('click-row.bs.table', function (e, row, $element) {
    ReadRelatorio(row.id);
});

window.EventsRelatorio = {
    'click .edit': function (e, value, row, index) {
        relatorio.index(row.id);
    },
    'click .remove': function (e, value, row, index) {
        DeleteRelatorio(row.id);
    },
    'click .clonar': function (e, value, row, index) {
        ClonarRelatorio(row.id);
    }
};


var $tableConfRelatorios = $('#tabelaConfRelatorios');

$tableConfRelatorios.on('dbl-click-row.bs.table', function (e, row) {
    UtilizaConfRelatorio(row.id);
});

window.EventsConfRelatorio = {
    'click .select': function (e, value, row, index) {
        UtilizaConfRelatorio(row.id);
    },
    'click .delete': function (e, value, row, index) {
        ExcluiConfRelatorio(row);
    }
};


function OptionsConfRelatorio(value, row, index) {
    return [
        '<div class=groub-buttons>',
        '<a class="select btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Selecionar">  ',
        '<i class="glyphicon glyphicon-ok"></i>',
        '</a>',
        '<a class="delete btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Excluir">  ',
        '<i class="glyphicon glyphicon-trash"></i>',
        '</a>',
        '</div>'
    ].join('');
}



function OptionsRelatorio(value, row, index) {
    return [
        '<div class=groub-buttons>',
        '<a class="edit btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Editar/Selecionar">',
        '<i class="glyphicon glyphicon-edit"></i>',
        '</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
        '</a>',
        '<a class="remove btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Remover">',
        '<i class="glyphicon glyphicon-trash"></i>',
        '</a>',
        '</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
        '<a class="clonar btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Clonar">',
        '<i class="fa fa-copy"></i>',
        '</a>',
        '</div>'
    ].join('');
}
/* Table Functions */

function CarregaRelatorios(){
    $tableRelatorios.bootstrapTable('refresh', {query: {id_prontuario: $('#id_fk_prontuario').val()}});
}

//
function CarregaRelatorio(id){
    ReadRelatorio(id);
}

function ClonarRelatorio(id) {
    var id_relatorio = $('#id_id_relatorio').val();
    if (id_relatorio === '0') {
        swal('Selecione um relatório', 'Erro ao clonar', 'error');
        return;
    }
    swal({
        title: "Deseja clonar este relatório?",
        text: "Criará um relatório idêntico, na data atual",
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, clonar",
        closeOnConfirm: true
    }).then(async function () {
        // const resp = await
        relatorio.object.id=0;
        await UpdateRelatorio();
        $tableRelatorios.bootstrapTable('checkBy', {field: 'id', values: [ relatorio.object.id]});
        await ReadRelatorio(relatorio.object.id);
        $('#relatorio_data_salvo').html($('#relatorio_data_salvo').html() + '     <span class="badge badge-danger">C l o n e</span>');
        relatorio_libera_edicao(true);
    });
}

async function ImprimeRelatorio(){
    // if (!$('#id_titulo_relatorio').val() > '') {
    //     swal('Preencha o titulo do relatório', 'Falta informação no relatório.', 'error');
    //     return;
    // }
    await UpdateRelatorio(true);
    //
    // if ($('#id_id_relatorio').val() === '0') {
    //     swal('Selecione um relatório', 'Erro ao imprimir', 'error');
    // } else {
    printPDF('ImprimeRelatorio?id_relatorio=' + $('#id_id_relatorio').val());
    // }
}


function AdicionaRelatorioPadrao(){
    swal({
        title: "Adicionar esse relatorio como padrão!",
        text: "Insira uma descrição para identificar esse padrão:",
        type: "warning",
        input: 'text',
        showCancelButton: true,
        closeOnConfirm: false,
        animation: "slide-from-top",
        inputPlaceholder: "Escreva a descrição aqui"
    }).then(function(inputValue){
        if (inputValue === false) return false;
        if (inputValue === "") {
            swal.showInputError("É necessario Adicionar uma descrição");
            return false;
        }
        $.ajax({
            url: '/configuracoes/relatorios/AdicionaConfRelatorio',
            data: {
                'descricao': inputValue,
                'relatorio': $('#id_id_relatorio').val()
            },
            method: 'GET',
        }).success(function Ret(data){
            if (data.success){
                swal("Ótimo!", "Relatório padrão '" + inputValue +"' adicionado", "success");
            } else {
                swal("Desculpe!", "Erro ao adicionar '" + inputValue +"' como relatório padrão ", "error");
            }
        });
    });
}

function SelecionaRelatorio() {
    $tableConfRelatorios.bootstrapTable('refresh');
    $('#modalConfRelatorios').modal('show');
}

function UtilizaConfRelatorio(conf){
    $.ajax({
        url: '/prontuario/Relatorios/UtilizaConfRelatorio',
        data: {
            'conf': conf,
            'prontuario': $('#id_fk_prontuario').val(),
            'consulta': $('#id_fk_consulta_atual').val(),
            'medico': $('#id_fk_medico_att').val()
        },
        method: 'GET',
    }).success(function Ret(data){
        relatorio.index(data.success);
        localStorage.setItem('appClinic_id_relatorio_selected', data.success);
        // CarregaRelatorio(data.success);
         CarregaRelatorios();
        $('#modalConfRelatorios').modal('hide');
    });
}

function ExcluiConfRelatorio(row) {
    swal({
        title: "Exclusão de relatório padrão: "+row.titulo,
        text: "Confirma a exclusão definitiva deste relatorio?",
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Desistir",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir",
        closeOnConfirm: true
    }).then(function () {
        $.ajax({
            url: '/prontuario/Relatorios/relatorios.json/',
            data: {
                'rel': row.id,
                'acao': 'EXCLUI_CONF'
            },
            method: 'DELETE',
        }).success(function Ret(data) {
            $tableConfRelatorios.bootstrapTable('refresh');
            toastr.info('Relatório padrão excluido com sucesso!', 'RELATÓRIO PADRÃO');

        });
    });
}

