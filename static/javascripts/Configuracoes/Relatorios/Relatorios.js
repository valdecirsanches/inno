/* Selectize Functions */
var $selecionaCIDRelatorio = $('#id_cid10_relatorio').selectize({
    valueField: 'codigo',
    searchField: ['codigo','descricao'],
    sortField: 'codigo',
    options: [],
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                        '<div class="col-sm-2">' + escape(item.codigo) + '</div>' +
                        '<div class="col-sm-10"><strong class="media-heading">' + escape(item.descricao) + '</strong></div>' +
                    '</div>';
        },
        item: function(data, escape) {
            return '<div class="item">' + escape(data.codigo) + ' - ' + escape(data.descricao) + '</a></div>';
        }
    },
    load: function(query, callback) {
         if (query.length >= 3) {
            $.ajax({
                url: '/cadastros/LocalizaCID',
                data: {
                    'cid': query
                },
                method: 'GET',
            }).success(function Ret(data){
                if (!data.success.length){
                    toastr.error('Não foi encontrado o prontuário em nossa base de dados','Prontuário não encontrado!');
                    callback();
                } else {
                    callback(data.success);
                }
            });
            return callback();
        }
    }
});
var selecionaCIDRelatorio = $selecionaCIDRelatorio[0].selectize;
/* Selectize Functions */

/* Table Functions */
// var $tableRelatorios = $('#tabelaRelatorios');

// $tableRelatorios.on('dbl-click-row.bs.table', function (e, row) {
//     CarregaRelatorio(row.id);
// });

window.excludeRelatorioEvents = {
    'click .remove': function (e, value, row, index) {
    //     var msg = "Excluir o padrão de relatório " + row['nome'] + ":";
    //     swal({
    //         title: 'Deseja realmente excluir o relatório dos padrões?',
    //         text: msg,
    //         type: "warning",
    //         showCancelButton: true,
    //         cancelButtonText: "Cancelar",
    //         confirmButtonColor: "#DD6B55",
    //         confirmButtonText: "Sim, excluir",
    //         closeOnConfirm: false
    //     }).then(function () {
    //
    //         AjaxX.Configuracoes.Relatorios.Excluir(
    //             function (data) {
    //                 if (data.success) {
    //                     toastr.success('Padrão de relatório ' + row['nome'] + '... Excluido com sucesso!', 'Exclusão de padrão de relatório.');
    //                     swal({title: "Excluido!", text: "O padrão de relatório foi excluido.", type: "success", timer: 3000});
    //                     $tableRelatorios.bootstrapTable('refresh');
    //                 } else {
    //                     swal({title: "Não excluido!", text: "Ocorreu um erro ao excluir.", type: "error"});
    //                 }
    //             }, {
    //                 'id': row['id']
    //             }
    //         );
    //     });
    }
};

function excludeFormatter(value, row, index) {
    return [
        '<a class="edit" href="javascript:void(0)" title="Editar">',
        '   <i class="glyphicon glyphicon-edit"></i>',
        '</a>&nbsp;&nbsp;&nbsp;&nbsp;',
        '<a class="remove" href="javascript:void(0)" title="Remover">',
        '   <i class="glyphicon glyphicon-remove"></i>',
        '</a>'
    ].join('');
}
//
// /* Table Functions */
// function NovoRelatorio() {
//     $('#formRelatorio input, #formRelatorio textarea').val('');
//     selecionaCIDRelatorio.clear();
//     $('#id_id_relatorio').val('0');
// }
//
// function CarregaRelatorio(id){
//     $.ajax({
//         url: '/prontuario/relatorios/relatorios.json',
//         data: {'relatorio': id},
//         method: 'GET',
//     }).success(function Ret(data) {
//         if (data.success) {
//             $('#id_id_relatorio').val(data.success.id);
//             for (var key in data.success.fields) {
//                 if (data.success.fields.hasOwnProperty(key)) {
//                     if (data.success.fields[key] == 'None') {
//                         $('#' + key).val('');
//                     } else {
//                         $('#' + key).val(data.success.fields[key]);
//                     }
//                 }
//             }
//             if (data.success.cid.length > 0) {
//                 var cid = data.success.fields['id_cid10'].split(",");
//                 selecionaCIDRelatorio.addOption(data.success.cid);
//                 selecionaCIDRelatorio.clear();
//
//                 for (var i in cid) {
//                     if (cid.hasOwnProperty(i)) {
//                         selecionaCIDRelatorio.addItem(cid[i]);
//                     }
//                 }
//             }
//             $tableRelatorios.bootstrapTable('refresh', {query: {id_prontuario: $('#id_fk_prontuario').val()}});
//             $('#data_relatorio').html(data.success.dataSalvo);
//         }
//     });
// }
//
// function SalvaRelatorio(){
//     $.ajax({
//         url: 'relatorio.json',
//         relatorio: $('#id_id_relatorio').val(),
//         form: $('#formRelatorio').serialize(),
//         method: 'PUT'
//     }).success(function Ret(data) {
//         if (data.success) {
//             $tableRelatorios.bootstrapTable('refresh');
//             $('#id_id_relatorio').val(data.success.id);
//             $('#data_relatorio').html(data.success.dataSalvo);
//             toastr.success('Dados Corretamente guardados no prontuario', 'Salvo com sucesso!');
//         } else {
//             toastr.error(data.error, 'Problemas ao salvar!')
//         }
//     });
// }