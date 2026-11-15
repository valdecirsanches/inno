var dias_semanas = [
    {'id': 1, 'descricao': 'Segunda'},
    {'id': 2, 'descricao': 'Terça'},
    {'id': 3, 'descricao': 'Quarta'},
    {'id': 4, 'descricao': 'Quinta'},
    {'id': 5, 'descricao': 'Sexta'},
    {'id': 6, 'descricao': 'Sábado'},
    {'id': 7, 'descricao': 'Domingo'}
];
/* Definição da dias Matutino */
var $selecionaDiasMatutino = $('#id_dia_matutino').selectize({
    valueField: 'id',
    labelField: 'descricao',
    searchField: 'descricao',
    options: [],
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                        '<div class="row">' +
                            '<div class="col-sm-2">' + escape(item.id) + '</div>' +
                            '<div class="col-sm-10"><strong class="media-heading">' + escape(item.descricao) + '</strong></div>' +
                        '</div>' +
                    '</div>';
        }
    }
});

var selecionaDiasMatutino = $selecionaDiasMatutino[0].selectize;
selecionaDiasMatutino.load(function(callback) {
    callback(dias_semanas);
});
/* Definição da dias Matutino */

/* Definição da dias Vespertino */
var $selecionaDiasVespertino = $('#id_dia_vespertino').selectize({
    valueField: 'id',
    labelField: 'descricao',
    searchField: 'descricao',
    options: [],
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                        '<div class="row">' +
                            '<div class="col-sm-2">' + escape(item.id) + '</div>' +
                            '<div class="col-sm-10"><strong class="media-heading">' + escape(item.descricao) + '</strong></div>' +
                        '</div>' +
                    '</div>';
        }
    }
});

var selecionaDiasVespertino = $selecionaDiasVespertino[0].selectize;
selecionaDiasVespertino.load(function(callback) {
    callback(dias_semanas);
});
/* Definição da dias Vespertino */

/* Definição da dia Receita */
var $selecionaDiaReceita = $('#id_dia_receita').selectize({
    valueField: 'id',
    labelField: 'descricao',
    searchField: 'descricao',
    options: [],
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                        '<div class="row">' +
                            '<div class="col-sm-2">' + escape(item.id) + '</div>' +
                            '<div class="col-sm-10"><strong class="media-heading">' + escape(item.descricao) + '</strong></div>' +
                        '</div>' +
                    '</div>';
        }
    }
});

var selecionaDiaReceita = $selecionaDiaReceita[0].selectize;
selecionaDiaReceita.load(function(callback) {
    callback(dias_semanas);
});
/* Definição da dias Vespertino */

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
       ReadMedico(row);
    },
    'click .del': function (e, value, row) {
       DeleteMedico(row);
    }
};
//
// function AddMedico(){
//     $('.classMedico input').val('');
//     $('.classMedico textarea').val('');
//     $('.classMedico #id_medico').focus();
// }


// function ReadMedico(row){
//     $.ajax({
//         url: '/cadastros/medicos/CarregarMedico',
//         data: {
//            'id': row.id,
//         },
//         method: 'GET',
//     }).success(function Ret(data){
//         if(data.success){
//             var Medico = data.success;
//             $('.classMedico #id_id').val(Medico.id);
//             // ChangeIdMedico(Medico.id);
//             DiaSemana($("input[name='dia_semana']:checked").val(), Medico.id);
//             for (var key in Medico.fields) {
//                 if (Medico.fields.hasOwnProperty(key)) {
//                     if (Medico.fields[key]==='None') { $('.classMedico #'+key).val('');}
//                     else { $('.classMedico #'+key).val(Medico.fields[key]);}
//                 }
//             }
//             $('.classMedico #id_medico').focus();
//         } else {
//             toastr.error('Erro', "Impossivel Carregar Médico");
//         }
//     });
// }

//
// function SaveMedico(){
//     $.ajax({
//         url: '/cadastros/medicos/SalvaMedico',
//         data: {
//             'form':
//                 $('.classMedico').serialize(true),
//             'id': $('.classMedico #id_id').val()
//         },
//         method: 'GET',
//     }).success(function Ret(data){
//         if(data.success){
//             $('.form-group').removeClass('has-error').addClass('has-success');
//             $('#id_id').val(data.success.id);
//             // ChangeIdMedico(data.success.id);
//             $tableMedico.bootstrapTable('refresh', {silent: true});
//             toastr.success('Dados salvos com sucesso!','Gravando dados do prontuário.');
//         } else {
//             if (data.error) {
//                 $('.form-group').removeClass('has-error');
//                 for (var key in data.error) {
//                     if (data.error.hasOwnProperty(key)) {
//                         $('#id_' + data.error[key] + '_div').addClass('has-error');
//                     }
//                 }
//                 toastr.error('Erro na validação dos dados, verifique os campos assinalados em vermelho!  (' + data.error + ')', 'Dados nao salvos!');
//             } else {
//                 toastr.error('Erro Inesperado!', 'Dados nao salvos!');
//             }
//         }
//     });
//
// }

//
//
// function DeleteMedico(row){
//     swal({
//         title: row.nome,
//         text: 'Tem certeza que deseja excluir o médico?',
//         type: "warning",
//         showCancelButton: true,
//         cancelButtonText: "Desistir",
//         confirmButtonColor: "#DD6B55",
//         confirmButtonText: "Sim, excluir",
//         closeOnConfirm: false
//     }).then(function(isConfirm){
//         if (isConfirm){
//             $.ajax({
//                 url: '/cadastros/medicos/ExcluiMedico',
//                 data:  {id: row.id },
//                 method: 'GET',
//             }).success(function Ret(data){
//                 if (data.success){
//                     $tableMedico.bootstrapTable('refresh', {silent: true});
//                     swal('Médico', '"'+row.nome+'" Excluído com sucesso', 'success');
//                 }
//             });
//         }
//     });
// }


