/* Definição da Medico */
var $Medico = $("#medico").selectize({
    valueField: 'id',
    labelField: 'descricao',
    searchField: 'descricao',
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                        '<div class="col-md-12">' + escape(item.descricao) + '</div>' +
                    '</div>';
        }
    },
    onChange: function(value){
        // trecho copiado da tela da Agenda: nesta tela não existe o calendário
        // $dataAgenda e escolher um médico gerava erro no navegador
        if (typeof $dataAgenda === 'undefined' || typeof AutoAgenda !== 'function') { return; }
        var dateData = $dataAgenda.datepicker('getDate');
        $('#titMedico').html(Medico.getItem(value).html());
        $('#titData').html(strzero(dateData.getDate(),2)+'/'+(dateData.getMonth()+1)+'/'+dateData.getFullYear());
        AutoAgenda(dateData, value);
    }
});

var Medico = $Medico[0].selectize;
Medico.addOption({'id': 0, 'descricao': 'Todos os medicos'});
Medico.load(function(callback){
    $.ajax({
        url: '/cadastros/medicos/SelecionaMedico',
        method: 'GET',
    }).success(function Ret(data){
        callback(data);
        if(getUrlParameter('id_medico')){
            Medico.setValue(getUrlParameter('id_medico'));
        } else {
            Medico.setValue(0);
        }
    });
});
/* Definição da Medico */

var dates = $("#id_periodo" ).datepicker({
    defaultDate: "+1w",
    changeMonth: true,
    numberOfMonths: 2,
    multidate: true,
    daysOfWeekDisabled: "0,6",
    todayHighlight: true,
    todayBtn: "linked",
    language: "pt-BR",
    format: "yyyy-mm-dd"
});

function GerarAgendas(){
    bootbox.dialog({
        message: "Tem certeza que deseja gerar agenda para o per�odo selecionado?",
        title: "Gerar agendas para o período",
        buttons: {
            success: {
                label: "Sim",
                className: "btn-danger",
                callback: function() {
                    $.ajax({
                        url: '/agenda/consultas/GerarAgendasPeriodo',
                        data: {
                            // datas no formato aaaa-mm-dd separadas por vírgula
                            // (antes ia uma lista de objetos Date com outro nome
                            // de parâmetro e o servidor não recebia nada)
                            'dts': $.map(a, function (d) {
                                return d.getFullYear() + '-' +
                                    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
                                    ('0' + d.getDate()).slice(-2);
                            }).join(','),
                            'medico': Medico.getValue()
                        },
                        method: 'GET',
                    }).success(function Ret(result){
                        if(result.success){
                            toastr.success('Ok! agendas geradas... confira!!!','Gerando Agendas');
                        }
                    });
                }
            },
            danger: {
                label: "Não",
                className: "btn-default"
            }
        }
    });
    var a = $('#id_periodo').datepicker('getDates');
}