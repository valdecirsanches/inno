/* Definições dos campos */

var $tablePrescricao = $('#tabelaPrescricao');
var $tablePrescricaoRemedios = $('#tabelaPrescricaoRemedios');


$tablePrescricao.on('dbl-click-row.bs.table', function (e, row) {
    ReadPrescricao(row);
});

function rowStyle(row, index) {
    return {
        classes: 'ATENDIDO'
    }
}

function ButtonPrescricao(value, row, index){
    return [
        '<div class="">',
        '<a class="edit btn btn-primary btn-xs m-r-xs" href="javascript:void(0)" title="Altera dados da prescrição">',
        '<i class="fa fa-edit"> </i>',
        '</a>',
        '<a class="del btn btn-danger btn-xs m-r-xs" href="javascript:void(0)" title="Excluir prescrição">',
        '<i class="fa fa-trash"> </i>',
        '</a>',
        '</div>'
    ].join('');
}

window.EventPrescricao = {
    'click .edit': function (e, value, row) {
       //ReadPrescricao(row.id);
    },
    'click .del': function (e, value, row) {
       //DeletePrescricao(row.id);
    }
};


function ReadPrescricao(row){
    $.ajax({
        url: '/configuracoes/prescricoes/CarregaConfPrescricao',
        data: {'prescricao': row.id},
    }).success(function Ret(data) {
        if(data.success) {
            $('#id_id').val(data.success.id);
            for (var key in data.success.fields) {
                if (data.success.fields.hasOwnProperty(key)) {
                    if (data.success.fields[key] === 'None') { $('.classConfPrescricao #' + key).val(''); }
                    else { $('.classConfPrescricao #' + key).val(data.success.fields[key]); }
                }
            }
        }
        $('#id_cont_esp').prop('checked', (data.success.fields['id_cont_esp'] === 'True')).val('on');
        $('#data_prescricao').html(data.success.dataSalvo);
        $tablePrescricaoRemedios.bootstrapTable('refresh', {query: {id_prescricao: data.success.id}});
    });
}

$tablePrescricao.on('dbl-click-row.bs.table', function (e, row) {
    ReadPrescricao(row.id);
});
