/* Inicio BootstrapTable Pesquisa */
var $tableMedico = $('#tabelaMedico');


$tableMedico.on('dbl-click-row.bs.table', function (e, row) {
    ReadMedico(row.id);
});

function rowStyleMed(row, index) {
    return {
        classes: 'ATENDIDO'
    };
}

function ButtonsMedico(value, row, index){
    return [
        '<div class="">',
        '<a class="edit btn btn-primary btn-xs m-r-xs" href="javascript:void(0)" title="Altera dados do médico">',
        '<i class="fa fa-edit"> </i>',
        '</a>',
        '<a class="del btn btn-danger btn-xs m-r-xs" href="javascript:void(0)" title="Excluir médico">',
        '<i class="fa fa-trash"> </i>',
        '</a>',
        '</div>'
    ].join('');
}



window.EventsMedico = {
    'click .edit': function (e, value, row) {
       ReadMedico(row.id);
    },
    'click .del': function (e, value, row) {
       DeleteMedico(row.id);
    }
};