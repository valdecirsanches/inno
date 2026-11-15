var timer_select;
var request_select;
var $selecionaPesquisa = $('#pesquisa_str_iniciar').selectize({
    valueField: 'id',
    labelField: 'paciente',
    searchField: ['paciente', 'codigo'],
    options: [],
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                        '<div class="col-sm-2">' + escape(item.codigo) + '</div>' +
                        '<div class="col-sm-5"><strong class="media-heading">' + escape(item.paciente) + '</strong></div>' +
                        '<div class="col-sm-3">' + escape(item.nasc) + '</div>' +
                        '<div class="col-md-2">'+ escape(item.clinica) + '</div>' +
                    '</div>';
        }
    },
    load: function(query, callback) {
        timer_select && clearTimeout(timer_select)
        timer_select = setTimeout(function() {
            if (request_select) {
                request_select.abort()
            }

            if (query.length >= 3) {
                $.ajax({
                    url: '/cadastros/paciente/LocalizaPaciente',
                    data: {pac: query},
                    method: 'GET',
                }).success(function RetPaciente(data) {
                    if (!data.length) {
                        toastr.error('Não foi encontrado o prontuário em nossa base de dados', 'Prontuário não encontrado!');
                        callback();
                    } else {
                        callback(data);
                    }
                });
                return callback();
            } else {
                return callback();
            }
        },500);
    },
    onChange: function (value){
        $('#corpo_consultas').html('');
        $('#btnPrintProntuario').addClass('hidden');
        if (!value) { return; }   // campo limpo: nada a buscar
        AdicionaConsultas();
    }
});

var selecionaPesquisa = $selecionaPesquisa[0].selectize;


var $histDetalhes = $('#histDetalhes').selectize({
    persist: false,
    valueField: 'value',
    labelField: 'name',
    searchField: ['name', 'value'],
    options: [
        {value: 'anamnese', name: 'Anamnese'},
        {value: 'atestado', name: 'Atestado'},
        {value: 'evolucao', name: 'Evolução'},
        {value: 'exames', name: 'Exames'},
        {value: 'exameFisico', name: 'Exame Físico '},
        {value: 'hipoteseDiagnostica', name: 'Hipótese Diagnóstica'},
        {value: 'prescricoes', name: 'Prescrições'}
    ]
});
var histDetalhes = $histDetalhes[0].selectize;

function AdicionaConsultas(){
    var filtrado = !!(histDetalhes.getValue() || $('#histAno').val());
    // enquanto busca, a tela mostra que está trabalhando (antes ficava em branco)
    $('#corpo_consultas').html('<p class="text-center text-muted m-t-lg"><i class="fa fa-spinner fa-spin"></i> Carregando o histórico...</p>');
    $.ajax({
        url: '/prontuario/Historico/AdicionaConsultas',
        data: {pac: selecionaPesquisa.getValue(), d: histDetalhes.getValue(), ano: $('#histAno').val()},
        method: 'GET',
    }).success(function RetHistorico(data) {
        $('#corpo_consultas').html('');
        if (data.success) {
            $('#corpo_consultas').append(data.success);
            $('#btnPrintProntuario').removeClass('hidden')
        } else {
            $('#btnPrintProntuario').addClass('hidden')
            // paciente sem consultas: avisa em vez de deixar a tela vazia
            if (filtrado) {
                toastr.info('Nenhum registro encontrado para o ano ou os detalhes escolhidos.', 'Histórico vazio');
            } else {
                toastr.info('Este paciente ainda não tem consultas registradas.', 'Histórico vazio');
            }
        }
    }).fail(function () {
        $('#corpo_consultas').html('');
        toastr.error('Não foi possível carregar o histórico. Tente de novo.', 'Erro');
    });
}

function ImprimeProntuario() {
    printPDF('/atendimento/ImprimeProntuario?id_prontuario=' + $('#pesquisa_str_iniciar').val());
}
