
let remedio_alterado;

$(".save_prescricao_remedio").on("input", function() {
    remedio_alterado=true
 });

$(".save_prescricao_remedio").on("blur", function() {
    // if ($('.classPrescricaoRemedio #id_tipo').val() > '' ||
    //     $('.classPrescricaoRemedio #id_nome').val() > '' ||
    //     $('.classPrescricaoRemedio #id_qtdade').val() > '' ||
    //     $('.classPrescricaoRemedio #id_unidade').val() > '' ||
    //     $('.classPrescricaoRemedio #id_descricao').val() > '') 
    // {
        if (remedio_alterado) {
            remedio_alterado=false; 
            UpdateRemedio(true);
         }
    // }
});


var $tablePrescricaoRemedios = $('#tabelaPrescricaoRemedios');

async function CarregaPrescricaoRemedios(id){
    await $tablePrescricaoRemedios.bootstrapTable('refresh', {query: {id_prescricao: id}});
}


// $tablePrescricaoRemedios.bootstrapTable().on('editable-save.bs.table', function($el, field, row, oldValue){
//     UpdateRemedio(row.id);
// });

// $tablePrescricaoRemedios.bootstrapTable().on('dbl-click-row.bs.table', function (e, row, $element) {
//     ReadRemedio(row.id);
// });

$tablePrescricaoRemedios.bootstrapTable().on('click-row.bs.table', function (e, row, $element) {
    ReadRemedio(row.id);;
});


function RemedioOptions(value, row, index) {
    return [

        '<a class="edit btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Alterar">  ',
        '<i class="fa fa-edit"></i>',
        '</a>',
        '<a class="remove btn btn-success btn-outline btn-sm" href="javascript:void(0)" title="Remover">  ',
        '<i class="glyphicon glyphicon-trash"></i>',
        '</a>',


    ].join('');
}
/* Table Function */

window.RemedioEvents = {
    'click .edit': function (e, value, row, index) {
        ReadRemedio(row.id);
        // CarregaRemedio(row);
    },
    'click .add': function (e, value, row, index) {
        AddRemedio();
    },
    'click .remove': function (e, value, row, index) {
        DeleteRemedio(row.id);
    }
};

function detailFormatter(index, row) {
    var html =
        '<form action="" method="post" role="form"  id="formPrescricaoRemedio">'+
        '<div id="id_nome_div" class="form-group col-md-4">' +
        '    <label for="id_nome">Remédio</label>' +
        '    <input id="id_nome_'+row.id+'" name="nome" class="form-control" value="'+row.nome+'"</input>' +
        '</div>'+
        '<div id="id_tipo_div" class="form-group col-md-4">' +
        '    <label for="id_tipo">Dosagem</label>' +
        '    <input id="id_tipo_'+row.id+'" name="tipo" class="form-control" value="'+row.tipo+'"</input>' +
        '</div>'+
        '<div id="id_qtde_div" class="form-group col-md-4">' +
        '    <label for="id_qtdade">Qtde</label>' +
        '    <input id="id_qtdade'+row.id+'" name="qtdade" class="form-control" value="'+row.qtdade+'"</input>' +
        '</div>'+
        '<div id="id_unidade_div" class="form-group col-md-4">' +
        '    <label for="id_unidade">Unidade</label>' +
        '    <input id="id_unidade'+row.id+'" name="unidade" class="form-control" value="'+row.unidade+'"</input>' +
        '</div>'+
        '<div id="id_descricao_div" class="form-group col-md-11">' +
        '    <label for="id_descricao">Descrição</label>' +
        '    <textarea id="id_descricao_'+row.id+'" name="descricao" class="form-control" rows="2">'+row.descricao+'</textarea>' +
        '</div>' +

        '<div class="col-md-1">' +
        '    <button id="SalvarPrescricaoRemedio" class="btn btn-default m-t-md m-l-n-sm" ' +
        // 'onclick="SalvaPrescricaoRemedio(\''+row.id+'\', $(\'#id_descricao_'+row.id+'\').val())"><i class="fa fa-check"></i></button>' +
        'onclick="UpdateRemedio()"><i class="fa fa-check"></i></button>' +
        '</div>'+
        '</form>';
    return html;
}