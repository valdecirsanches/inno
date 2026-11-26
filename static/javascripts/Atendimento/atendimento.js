
// Valdecir Donizeti Sanches

$('li.my-anamnese').click(function(e) {
    // $('.classAnamnese #id_queixa_principal').focus();
    $('#btnAddAnamnese').trigger('click');
});

$('li.my-evolucao').click(function(e) {
    $('.classEvolucao #id_evolucao').focus();
});


$('li.my-exame-fisico').click(function(e) {
    $('.classExameFisico #id_altura').focus();
});

$('li.my-exame').click(function(e) {
    if ($('.classExame #id_descricao_exames').val()==='' ) {
        $('#btnAddExame').trigger('click');
    }
});

$('li.my-prescricao').click(function(e) {
    if ($('.classPrescricao #id_prescricao').val()==='' ) {
        $('#btnAddPrescricao').trigger('click');
    }
});


$('li.my-relatorio').click(function(e) {
    if ($('.classProntuarioRelatorio #id_titulo_relatorio').val()==='' ) {
        $('#btnAddRelatorio').trigger('click');
    }
});


$('li.my-atestado').click(function(e) {
    if ($('.classAtestado #id_requerente').val()==='' ) {
        $('#btnAddAtestado').trigger('click');
    }
});


var $selecionaConvenio = $('#id_fk_convenio').selectize({
    valueField: 'id',
    labelField: 'descricao',
    searchField: 'descricao',
    options: [],
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                        '<div class="col-sm-2">' + escape(item.id) + '</div>' +
                        '<div class="col-sm-10"><strong class="media-heading">' + escape(item.descricao) + '</strong></div>' +
                    '</div>';
        }
    },
    onChange: function (value){
        PlanosConvenio(value);
    }
});

var selecionaConvenio = $selecionaConvenio[0].selectize;
selecionaConvenio.load(function(callback) {
    $.ajax({
        url: '/cadastros/convenio/SelecionaConvenio',
        method: 'GET',
    }).success(function Ret(data){
        callback(data);
    });
});

var $selecionaPlano = $('#id_fk_plano').selectize({
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

var selecionaPlano = $selecionaPlano[0].selectize;
function PlanosConvenio(conv, plan){
    selecionaPlano.clearOptions();
    selecionaPlano.load(function(callback) {
        $.ajax({
            url: '/cadastros/convenio/PlanosConvenio',
            data: {'conv': conv},
            method: 'GET',
        }).success(function Ret(data){
            callback(data);
        });
    });
}

var $selecionaMedico = $('#id_fk_medico').selectize({
    valueField: 'id',
    labelField: 'descricao',
    searchField: 'descricao',
    options: [],
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                        '<div class="col-sm-2">' + escape(item.id) + '</div>' +
                        '<div class="col-sm-10"><strong class="media-heading">' + escape(item.descricao) + '</strong></div>' +
                    '</div>';
        }
    }
});

var selecionaMedico = $selecionaMedico[0].selectize;
selecionaMedico.load(function(callback) {
    $.ajax({
        url: '/cadastros/medicos/SelecionaMedico',
        method: 'GET',
    }).success(function Ret(data){
        callback(data);
    });
});

/* Definições dos campos */


/* Prontuario Dados do paciente */
function CadastroProntuario(idProntuario) {
    $.ajax({
            url: '/cadastros/paciente/CarregaPaciente',
            data: {'paciente': idProntuario},
            method: 'GET',
    }).success(function RetCarrega(data) {
        if (data.erro) {
            swal(data.erro, 'Erro!', 'error')
        }
        else {
            $('#id_id').val(data.success.id);
            for (var key in data.success.fields) {
                if (data.success.fields.hasOwnProperty(key)) {
                    if (data.success.fields[key] === 'None') {
                        $('#' + key).val('');
                    }
                    else {
                        $('#' + key).val(data.success.fields[key]);
                    }
                }
            }
            selecionaConvenio.setValue(data.success.fields['id_fk_convenio']);
            selecionaPlano.addOption({'id': data.success.fields['id_fk_plano'], 'descricao': data.success.plano});
            selecionaPlano.setValue(data.success.fields['id_fk_plano']);
            selecionaMedico.setValue(data.success.fields['id_fk_medico']);
            calculaIdade($('#id_data_nasc').val(), $('#id_idade'));
            $('#id_data_cad').val(data.success.data_cad);
            $('#nome_cab').html(data.success.fields['id_paciente']);
            $('#idade_cab').html($('#id_idade').val());
            $('#id_pront_fisico').attr('checked', data.success.fields['id_prontuario_fisico']=="True");
            switchery_pront_fisico = new Switchery(elem_pront_fisico, { color: '#26D3FF', size: 'large' });
        }
    });
}


function SalvaProntuario(){

    $.ajax({
        url: '/cadastros/paciente/SalvaPaciente/',
        
        data: {'form':
                $('#formCadastrar').serialize(true),
            'paciente': $('#id_id').val()
        },
        method: 'POST',
    }).success(function Ret(data){
        if (data.erro && data.mensagem){
            swal('Dados não salvos', data.mensagem, 'error');
        } else if (data.erro){
            $('.form-group').removeClass('has-error');
            for (var i=0; i<data.erro.length; i++){
                $('#id_'+data.erro[i]+'_div').addClass('has-error');
            }
            swal('Erro na validação dos dados, verifique os campos assinalados em vermelho!  ('+data.erro+')','Dados nao salvos!', 'error');
        } else if(data.success){
            $('.form-group').removeClass('has-error').addClass('has-success');
            $('#id_id').val(data.success.id);
            if (data.success.codigo !== undefined && data.success.codigo !== null) $('#formCadastrar #id_codigo').val(data.success.codigo);
            // selecionaPaciente.addOption(data.success); #duvida
            // selecionaPaciente.setValue(data.success.id); #duvida
            $('#modalCadastrar').modal('hide');
            toastr.success('Dados salvos com sucesso!','Gravando dados do prontuário.');
        }
    });
}
/* Prontuario Dados do Paciente */

$('.summernote').summernote({
    lang:'pt-BR',
    height: 200
});

$('.i-checks').iCheck({
    checkboxClass: 'icheckbox_square-green',
    radioClass: 'iradio_square-green'
});

$(window).load(function() {
    $('#titData').html(strzero(d.getDate(),2)+'/'+(d.getMonth()+1)+'/'+d.getFullYear());

    var consulta = getUrlParameter('consulta');

    if (consulta){
        IniciaAtendamento(consulta);
    }
});

function Cadastro(){
    $('#modalCadastrar').modal('show');
}

function IniciaAtendamento(consulta){
    $('[name=fk_consulta]').val(consulta);
    $('#id_fk_consulta_extras').val(consulta);
    $.ajax({
        url: '/atendimento/IniciaAtendimento',
        data: {'consulta': consulta},
        method: 'GET',
    }).success(function Ret(data){
        if(data.success) {
            CadastroProntuario(data.success.pac);
            $('[name=fk_prontuario]').val(data.success.pac);
            // $('#id_fk_prontuario_extras').val(data.success.pac);
            $('#id_fk_medico_att').val(data.success.med);
            $('#id_fk_medico_extras').val(data.success.med);
            $('#tipo_cas').html(data.success.acao);
            $('#convenio').html(data.success.convenio);
            $('#profissao').html(data.success.profissao);
            $('#onde_mora').html('morador de ' + data.success.mora);
            $('#id_hora_chegada').val(data.success.hora_chegada);
            CarregaResumo(consulta);

            if (data.success.formConsulta.success) {
                var formConsulta = data.success.formConsulta.success;
                // $('#dataResumo').html(formConsulta.data);

                // if (formConsulta.anamnese) {
                CarregaAnamnese(data.success.pac);
                // }

                if (formConsulta.exameFisico) {
                    CarregaExameFisico(formConsulta.exameFisico.id);
                }

                if (formConsulta.exames) {
                    CarregaExames();

                    //CarregaExame(formConsulta.exames.id);
                }

                if (formConsulta.hipoteseDiagnostica) {
                    CarregaHipoteseDiagnostica(data.success.pac);
                }

                //if (formConsulta.evolucao) {
                CarregaEvolucoes(data.success.pac);
                //
                //}

                if (formConsulta.prescricao) {
                    CarregaPrescricoes();
                    //alert(formConsulta.prescricao.id);
                    //CarregaPrescricao(formConsulta.prescricao.id);
                }

                if (formConsulta.relatorios) {
                    CarregaRelatorios();
                    // ReadRelatorio(formConsulta.relatorios.id)
                    //CarregaRelatorio(formConsulta.relatorios.id);
                }

                CarregaExtras(data.success.pac);
                CarregaAtestados(data.success.pac);

                $('#time-container').html(formConsulta.atdm_c);
                $('#EncerraAtendimento').addClass(formConsulta.atdm);
                if(formConsulta.atdm_cn==='True') {
                    iniciaCronometro();
                }
            }
        }
    });
}


function EncerraAtendimento(){
       $.ajax({
        url: '/agenda/consultas/StatusConsulta',
        data: {
            'consulta': $('#id_fk_consulta_atual').val(),
            'status': 'ATENDIDO'
        },
        method: 'GET',
    }).success(function Ret(data){
        if (data.success){
            window.location = window.location.pathname;
        }
    });
}

function ImprimeProntuario() {
      printPDF('ImprimeProntuario?id_prontuario=' + 45405 + '&id_medico=' + 6)
}

function excludeFormatter(value, row, index) {
    return [
        '<a class="remove" href="javascript:void(0)" title="Remover">',
        '<i class="glyphicon glyphicon-remove"></i>',
        '</a>'
    ].join('');
}


function detailFormatter(index, row) {
    var html =
        '<div id="id_ramal_div" class="form-group col-md-11">' +
        '    <label for="id_descricao">Descrição</label>' +
        '    <textarea id="id_descricao_'+row.id+'" name="descricao" class="form-control" rows="2">'+row.descricao+'</textarea>' +
        '</div>' +
        '<div class="col-md-1">' +
        '    <button id="SalvarDescricaoRemedio" class="btn btn-default m-t-md m-l-n-sm" ' +
        'onclick="SalvaAlteracaoRemedio(\''+row.id+'\', $(\'#id_descricao_'+row.id+'\').val())"><i class="fa fa-check"></i></button>' +
        '</div>';
    return html;
}


/* Definição da Switchery */
var elem_pront_fisico = document.querySelector('#id_pront_fisico');
var switchery_pront_fisico;
/* Definição da Switchery */
elem_pront_fisico.onchange = function () {
    $.ajax({
        url: '/prontuario/atendimento/ProntuarioFisico',
        data: {'opcao' : elem_pront_fisico.checked, 'prontuario' : $('#id_fk_prontuario').val()},
        method: 'GET',
    }).success(function Ret(data){
        if (data.success){
            toastr.success('Protuário físico identificado!', 'identificação de prontuário físico')
        }
    });
};


function iniciaCronometro() {
    var timer = $('#time-container').html().split(":");
    var min = timer[0];
    var sec = timer[1];
    var AppStopwatch = (function () {
        var counter = sec,
            $stopwatch = {
                el: document.getElementById('stopwatch'),
                container: document.getElementById('time-container')
            };

        var runClock;

        function displayTime() {
            $stopwatch.container.innerHTML = moment().minute(min).second(counter++).format('mm:ss');
        }

        function startWatch() {
            runClock = setInterval(displayTime, 1000);
        }

        function stopWatch() {
            clearInterval(runClock);
        }

        return {
            startClock: startWatch,
            stopClock: stopWatch
        };
    })();
    AppStopwatch.startClock();
}

function RastrearImagens(){
    $.ajax({
        url: '/api/extras/rastrear/',
        data: {
            id_paciente: $('#id_id').val()
        },
        method: 'POST'
    }).success(function (data){
        if (data.success) {
            swal('Arquivos encontrados!');
        } else {
            swal('Nada encontrado, nada feito!');
        }
    });
}