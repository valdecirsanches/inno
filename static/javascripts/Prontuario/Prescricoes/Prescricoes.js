
let prescricao_alterado;

// $(".save_prescricao").on("propertychange change keyup paste input", function() {
$(".save_prescricao").on("paste input", function() {
    $('#div_remedio').addClass('hide');
    $('#div_remedios').addClass('hide');
    prescricao_alterado=true
});


$(".save_prescricao").on("blur", function() {
    if (prescricao_alterado) {
        UpdatePrescricao(false);
    }
});



/* Table functions */
var $tablePrescricao = $('#tabelaPrescricao');


async function CarregaPrescricoes(){
    await $tablePrescricao.bootstrapTable('refresh', {query: {id_prontuario: $('#id_fk_prontuario').val()}});
}


$tablePrescricao.on('dbl-click-row.bs.table', function (e, row, $element) {
    ReadPrescricao(row.id);
});


$tablePrescricao.on('click-row.bs.table', function (e, row, $element) {
    ReadPrescricao(row.id);
});

window.PrescricaoEvents = {
    'click .edit': function (e, value, row, index) {
        ReadPrescricao(row.id);
    },
    'click .remove': function (e, value, row, index) {
        DeletePrescricao(row.id);

    },
    'click .clonar': function (e, value, row, index) {
        ClonarPrescricao(row.id);
    }
};

var $tableConfPrescricoes = $('#tabelaConfPrescricoes');

$tableConfPrescricoes.on('dbl-click-row.bs.table', function (e, row) {
    UtilizaConfPrescricao(row.id);
});

window.EventsConfPrescricao = {
    'click .select': function (e, value, row, index) {
        UtilizaConfPrescricao(row.id);
    },
    'click .delete': function (e, value, row, index) {
        ExcluiConfPrescricao(row);
    }
};


function OptionsConfPrescricao(value, row, index) {
    return [
        '<div>',
        '<a class="select btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Selecionar">  ',
        '<i class="glyphicon glyphicon-ok"></i>',
        '</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
        '<a class="delete btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Apagar">  ',
        '<i class="glyphicon glyphicon-trash"></i>',
        '</a>',
        '</div>'
    ].join('');
}


function PrescricaoOptions(value, row, index) {
    return [
        '<div class=groub-buttons>',
        '<a class="edit btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Editar">  ',
        '<i class="fa fa-edit"></i>',
        '</a>&nbsp;&nbsp;&nbsp;&nbsp;',
        '<a class="remove btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Remover">  ',
        '<i class="glyphicon glyphicon-trash"></i>',
        '</a>&nbsp;&nbsp;&nbsp;&nbsp;',
        '<a class="clonar btn btn-success btn-outline btn-sm"  href="javascript:void(0)" title="Clonar">  ',
        '<i class="fa fa-copy"></i>',
        '</a>',
        '</div>'
    ].join('');
}
/* Table Function */

function CarregaPrescricao(id){
    ReadPrescricao(id);
}


function ClonarPrescricao(id){
    UpdatePrescricao(true);
    swal({
        title: "Deseja clonar esta prescrição?",
        text: "Criará uma prescrição identica, na data atual",
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, clonar",
        closeOnConfirm: true
    }).then( async function(){
        const resp = await api.post(`prescricao/clone/`, {id_prescricao: id});
        await prescricao.index(resp.data.success);
        toastr.success('Prescrição clonado com sucesso.', 'Feito!');
        $tablePrescricao.bootstrapTable('insertRow',{index: 0, row: prescricao.object});
        $tablePrescricao.bootstrapTable('checkBy', {field: 'id', values: [ prescricao.object.id]});
        await ReadPrescricao(prescricao.object.id);

        $('#prescricao_data_salvo').html($('#prescricao_data_salvo').html() + '     <span class="badge badge-danger">C l o n e</span>');

    });
}

async function ImprimePrescricao(){
    await UpdatePrescricao(true);
    printPDF('ImprimePrescricao?id_prescricao=' + $('#id_id_prescricao').val());
}


function AdicionaPrescricaoPadrao(){
    swal({
        title: "Adicionar essa prescrição como padrão!",
        text: "Insira uma descrição para identificar esse padrão:",
        type: "warning",
        input: 'text',
        showCancelButton: true,
        closeOnConfirm: true,
        animation: "slide-from-top",
        inputPlaceholder: "Escreva a descrição aqui"
    }).then(async function(inputValue){
        if (inputValue === false) return false;
        if (inputValue === "") {
            swal("Padrão", "É necessário informar uma descrição para o padrão.", "warning");  // a função antiga de erro no campo não existe no sweetalert2 e travava
            return false;
        }
        // grava a prescrição antes: o padrão é copiado do registro salvo (logo depois de "Novo" o id
        // ainda era 0 e o padrão não era criado, sem nenhum aviso)
        // (só com o formulário aberto para edição: sem isso gravaria um registro vazio)
        if (!$('#id_prescricao').prop('disabled')) {
            try { await UpdatePrescricao(true); } catch (e) { /* o aviso de erro já sai do próprio salvar */ }
        }
        var id = (prescricao.object && prescricao.object.id) || $('#id_id_prescricao').val();
        if (!id || String(id) === '0') {
            swal("Padrão", "Preencha a prescrição antes de salvá-lo como padrão.", "warning");
            return false;
        }
        $.ajax({
            url: '/configuracoes/prescricoes/AdicionaConfPrescricaoPadrao',
            data: {
                'descricao': inputValue,
                'prescricao': id
            },
            method: 'GET',
        }).success(function Ret(data){
            if (data.success){
                swal("Ótimo!", "Prescrição padrão '" + inputValue + "' adicionada", "success");
                if (typeof $tableConfPrescricoes !== 'undefined') { $tableConfPrescricoes.bootstrapTable('refresh'); }
            } else if (data.error === 'medico') {
                swal("Desculpe!", "Seu usuário não tem um médico vinculado. Vincule um médico ao usuário em Cadastros auxiliares > Usuários (ou abra uma prescrição feita por um médico) para salvar o padrão.", "error");
            } else if (data.error === 'existe') {
                swal("Desculpe!", "Já existe um padrão chamado '" + inputValue + "'. Escolha outro nome.", "error");
            } else {
                swal("Desculpe!", "Erro ao adicionar '" + inputValue + "' como prescrição padrão", "error");
            }
        }).fail(function () {
            swal("Desculpe!", "Erro ao adicionar '" + inputValue + "' como prescrição padrão", "error");
        });
    });
}

function SelecionaPrescricao() {
    $tableConfPrescricoes.bootstrapTable('refresh');
    $('#modalConfPrescricoes').modal('show');
}

function UtilizaConfPrescricao(conf){
    conf = conf || null;
    var prontuario = $('#id_fk_prontuario').val(),
        consulta = $('#id_fk_consulta_atual').val(),
        medico = $('#id_fk_medico_att').val();

    $.ajax({
        url: '/prontuario/prescricoes/prescricao.json/',
        data: {
            'acao': 'UTILIZAR',
            'conf': conf,
            'prontuario': prontuario,
            'consulta': consulta,
            'medico': medico
        },
        method: 'PATCH',
    }).success(function Ret(data){
        CarregaPrescricao(data.success.id);
        CarregaPrescricoes();
        $('#modalConfPrescricoes').modal('hide');
    });
}

function ExcluiConfPrescricao(row) {
    swal({
        title: "Exclusão de prescrição padrão: "+row.nome,
        text: "Confirma a exclusão definitiva desta prescrição?",
        type: "warning",
        showCancelButton: true,
        cancelButtonText: "Desistir",
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, excluir",
        closeOnConfirm: true
    }).then(function () {
        $.ajax({
            url: '/prontuario/prescricoes/prescricao.json/',
            data: {
                'rec': row.id,
                'acao': 'EXCLUI_CONF'
            },
            method: 'DELETE',
        }).success(function Ret(data) {
            if (data.success) {
                $tableConfPrescricoes.bootstrapTable('removeByUniqueId', row.id);
                toastr.info('Prescrição padrão excluido com sucesso!', 'PRESCRIÇÃO PADRÃO');
            }
            else {
                toastr.error(`Prescrição padrão não excluido!<br><br>${data.error}`, 'PRESCRIÇÃO PADRÃO');
            }
        });
    });
}
