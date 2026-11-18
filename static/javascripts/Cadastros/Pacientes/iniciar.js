$(window).load(function() {
    ChangeIdPaciente();
    CarregaPaciente('');
    ChangeIdRecibo();
});


/* Paciente */

var timer_select;
var request_select;
var $selecionaPesquisa = $('#pesquisa_str_iniciar').selectize({
    valueField: 'id',
    labelField: 'paciente',
    searchField: ['paciente', 'codigo', 'cpf', 'nasc'],
    options: [],
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                '<div class="col-sm-2">' + escape(item.codigo) + '</div>' +
                '<div class="col-sm-5">' + escape(item.cpf) + ' - ' + '<strong class="media-heading">' + escape(item.paciente) + '</strong></div>' +
                '<div class="col-sm-3">' + escape(item.nasc) + '</div>' +
                '<div class="col-sm-2">' + escape(item.clinica) + '</div>' +
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
                    url: 'LocalizaPaciente',
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
        }, 500);
    },
    onChange: function (value){
        CarregaPaciente(value);
    }
});


var $selecionaMedico = $('.classPaciente #id_fk_medico').selectize({
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



function EtiquetaProntuario(){
    var id = $(this).attr('id');
    $.ajax({
        type: 'get',
        url:'etiqueta_prontuario/',
        data: {'id_agenda': id}
    }).done(function(data){
        $("#msg_info").attr("data-growl-title", "Pronto.").attr("data-growl-message","Impressão de etiqueta prontuário em andamento.").click();
    });
}


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


function ChangeIdPaciente(id){
    $('.form-group').removeClass('has-error').removeClass('has-success');
    if (typeof id === 'undefined'){
        LimpaCamposPaciente();
        DesabilitaCamposPaciente();
        DesabilitaBotoesPaciente();
    } else {
        HabilitaCamposPaciente();
        HabilitaBotoesPaciente();
        $tablePacienteConsulta.bootstrapTable('refresh', {query: {paciente: id}});
        if (id === 0){
            LimpaCamposPaciente();
            $('#imprimePaciente').addClass('disabled');
        }
    }
}

function CadastroProntuario(value){
    if (value){
        $.ajax({
            url: '/cadastros/paciente/CarregaPaciente',
            data: {'paciente': value},
            method: 'GET',
        });
        // AjaxX.Cadastros.Pacientes.CarregaPaciente(AjaxX.process //duvida, {'paciente': value});
    } else {
        $.ajax({
            url: '/cadastros/paciente/NovoProntuario',
            data: {'paciente': value},
            method: 'GET',
            // success: Ret, #duvida
        });
        // AjaxX.Cadastros.Pacientes.NovoProntuario(AjaxX.process); #duvida
        $('.classPaciente #nome_id').focus();
    }
    $('#modal_cadastrar').modal('toggle');
}

function NovoProntuario(){
    ChangeIdPaciente(0);
    $.ajax({
        url: '/cadastros/paciente/NovoProntuario',
        data: {'id': 0 },
        method: 'GET',
    }).success(function Ret(data){
        $('.classPaciente #id_codigo').val(data.success.codigo);
        $('.classPaciente #id_paciente').focus();
    });
}


function CarregaPaciente(value){
    $.ajax({
        url: 'CarregaPaciente',
        data: {paciente: value},
        method: 'GET',
    }).success(function Ret(data){
        if(data.erro){
            swal('Erro', "Impossivel Carregar Prontuário", 'error');
        } else {
            if (!data.success || !data.success.fields) { return; }  // nenhum paciente aberto ainda
            $('.classPaciente #id_id').val(data.success.id);
            ChangeIdPaciente(data.success.id);
            for (var key in data.success.fields) {
                if (data.success.fields.hasOwnProperty(key)) {
                    if (data.success.fields[key]==='None') { $('.classPaciente #'+key).val('');}
                    else { $('.classPaciente #'+key).val(data.success.fields[key]);}
                }
            }
            selecionaConvenio.addOption({'id': data.success.fields['id_fk_convenio'], 'descricao': data.success.convenio});
            selecionaConvenio.setValue(data.success.fields['id_fk_convenio']);
            selecionaPlano.addOption({'id': data.success.fields['id_fk_plano'], 'descricao': data.success.plano});
            selecionaPlano.setValue(data.success.fields['id_fk_plano']);
            selecionaMedico.setValue(data.success.fields['id_fk_medico']);
            calculaIdade($('.classPaciente #id_data_nasc').val(), $('.classPaciente #id_idade'));
            $('.classPaciente #id_data_cad').val(data.success.data_cad);
            $('#PesquisaPaciente').modal('hide');
        }
    });
}


function Homonimos(paciente){

    if ($('.classPaciente #id_id').val()==='0' || $('.classPaciente #id_id').val()===''){
        $.ajax({
            url: 'LocalizaHomonimos',
            data:{'paciente' : paciente},
            method: 'GET',
        }).success(function Ret(data){
            if (data.success){
                box = bootbox.dialog({
                    message: function(){
                        var msg = '<table class="table table-condensed table-hover"><thead><tr><th>Código</th><th>Nome</th><th>Idade</th><th>Nascimento</th></tr></thead><tbody>';
                        for (var i=0; i < data.success.length; i++){
                            msg += "<tr ondblclick='CarregaPaciente("+ data.success[i].id +")'>" +
                                "<td>" + data.success[i].codigo   + "</td>" +
                                "<td>" + data.success[i].paciente + "</td>" +
                                "<td>" + data.success[i].idade    + "</td>" +
                                "<td>" + data.success[i].nasc     + "</td>" +
                                "</tr>" ;
                        }
                        msg += '</tbody></table>';
                        return msg;
                    },
                    title: "Encontrado(s) Prontuário(s) Homonimo(s) em nossa base de dados",
                    buttons: {
                        success: {
                            label: "Prosseguir cadastro",
                            className: "btn-default",
                            callback: function(){
                                $('.classPaciente #profissao_id').focus();
                            }
                        }
                    }
                });
            }
        });
    }
}

$('#formDadosPaciente').on('submit', function(e){
    e.preventDefault();
    return false;
});

$('#formComplementosPaciente').on('submit', function(e){
    e.preventDefault();
    return false;
});

$('#salvaFicha').on('click', function(e){

    e.preventDefault();
    e.stopPropagation();

    SalvaProntuario();

    return false;
});

// Trava contra cliques repetidos no "Salvar".
// O botão #salvaFicha é um <a>, e links não têm a propriedade "disabled":
// o $btn.prop('disabled', true) abaixo não impede um segundo clique. Sem esta
// trava, dois cliques rápidos enviavam dois POSTs com id 0 e o servidor
// criava o mesmo paciente duas vezes.
var salvandoProntuario = false;

function SalvaProntuario() {

    if (salvandoProntuario) {
        return;
    }
    salvandoProntuario = true;

    const $btn = $('#salvaFicha');

    // 🔒 Desativa botão e coloca spinner
    $btn.prop('disabled', true)
        .html('<i class="fa fa-spinner fa-spin"></i> Salvando...');

    $.ajax({
        url: '/cadastros/paciente/SalvaPaciente/',

        data: {
            form: $('#formDadosPaciente').serialize() + '&' + $('#formComplementosPaciente').serialize(),
            paciente: $('.classPaciente #id_id').val()
        },
        method: 'POST',
    })
    .done(function (data) {

        if (data.erro === true) {
            $('.form-group').removeClass('has-error');

            for (var i = 0; i < data.erro.length; i++) {
                $('#id_' + data.erro[i] + '_div').addClass('has-error');
            }

            toastr.error(
                'Erro na validação dos dados, verifique os campos em vermelho!',
                'Dados não salvos!'
            );

        } else if (data.success) {

            let pac = data.success;

            $('.form-group')
                .removeClass('has-error')
                .addClass('has-success');

            $('.classPaciente #id_id').val(pac.id);
            $('.classPaciente #id').val(pac.id);
            $('.classPaciente #id_disable').val(pac.id);

            ChangeIdPaciente(pac.id);

            toastr.success(
                'Dados salvos com sucesso!',
                'Prontuário atualizado.'
            );
        }
    })
    .fail(function () {
        toastr.error(
            'Erro ao comunicar com o servidor.',
            'Falha inesperada!'
        );
    })
    .always(function () {
        // 🔓 Reativa botão e remove spinner
        salvandoProntuario = false;
        $btn.prop('disabled', false)
            .html('<i class="fa fa-save"></i> Salvar');
    });

}

function ImprimeFicha(){
    var id = $('.classPaciente #id_id').val();
    printPDF('ImprimeFicha?id='+id);
}


/* Inicio BootstrapTable Consulta */

var $tablePacienteConsulta = $('#tabelaConsultasPaciente');

function rowStyleConsultaPaciente(row, index) {
    return {
        classes: row.status
    };
}

function FormatoStatus(value, row, index){
    return [
        '<a class="status ml10" title="Status">',
        '<i class="fa fa-clock-o"></i>',
        '</a>'
    ].join('');
}

function FormatoChegada(value, row, index){
    if (!row.paciente>0) {
        return []
    }
    return [
        `
        <a class="hr_chegada"
           title="Chegada do paciente (ordem de Horário)">
        <i class="fa fa-car"></i>
        <span class="text-lg text-white">${value}</span>
        </a>    
        `
    ].join('');
}

window.EventoStatus = {
    'click .status': function (e, value, row) {
        $.ajax({
            url: '/agemda/consultas/StatusConsulta',
            data: {
                'consulta': row.id,
                status: ''
            },
            method: 'GET',
        }).success(function Ret(data) {
            if (data.success) {
                var linha = $tablePacienteConsulta.bootstrapTable('getRowByUniqueId', row.id);
                linha.stt = data.success.stt;
                linha.status = data.success.status;
                $tablePacienteConsulta.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
            }
        });
    },
    'click .hr_chegada': function (e, value, row) {
        if (row.status !== 'AGENDADO' && row.status !== 'FALTOU' ){

            if (row.status === 'AGUARDANDO'){
                toastr.warning('Paciente já está aguardando!','Hora da chegada:');
                swal({
                    title: "O paciente ainda não chegou!",
                    type: "warning",
                    showCancelButton: true,
                    confirmButtonColor: "#DD6B55",
                    confirmButtonText: "Sim, cancelar chegada!",
                    cancelButtonText: "Não faça nada!",
                    focusCancel: true,
                    showLoaderOnConfirm: true,
                    preConfirm: function (result) {
                        return new Promise(function (resolve) {
                            resolve();
                            $.ajax({
                                url: '/agenda/consultas/GravaChegada',
                                data: {
                                    id_consulta: row.id,
                                    acao: 'RESTAURA',
                                },
                                method: 'GET',
                                success: Ret,
                            });

                            function Ret(data) {
                                if (data.success) {
                                    $tablePacienteConsulta.bootstrapTable('refresh', {query: {paciente: row.paciente}});
                                    toastr.success('Procedimento executado com sucesso!','OK');
                                }
                            }

                        });
                    }
                });
            }

            if (row.status === 'ATENDIMENTO'){
                toastr.info('paciente já está com o médico!','Hora da chegada:');
            }

            if (row.status === 'ATENDIDO'){
                toastr.success('paciente já foi atendido!','Hora da chegada:');
            }
        }
        else {
            $.ajax({
                url: '/agenda/consultas/GravaChegada',
                data: {
                    id_consulta: row.id
                },
                method: 'GET',
                success: Ret,
            });
            function Ret(data){
                if(data.success){
                    var linha = $tablePacienteConsulta.bootstrapTable('getRowByUniqueId', row.id);
                    linha.hr_chegada = data.success.hr_chegada;
                    linha.status = 'AGUARDANDO'
                    $tablePacienteConsulta.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
                    toastr.success('Hora de chegada gravado com sucesso!','Hora da chegada:');
                }
            }
        }
    }

};

window.EventoProntuario = {
    'click .agendado': function (e, value, row) {
        $.ajax({
            url: '/agemda/consultas/EtiquetaProntuario',
            data: {
                'consulta': row.id_age
            },
            method: 'GET',
        }).success(function Ret(data){
            if(data.success){
                toastr.success('Etiqueta de consulta enviado para impressão!','Ok!');
            }
        });
    }
};

window.EventoConsulta = {
    'click .consulta': function (e, value, row) {
        $.ajax({
            url: '/agemda/consultas/EtiquetaConsulta',
            data: {
                'consulta': row.id_age
            },
            method: 'GET',
        }).success(function Ret(data){
            if(data.success){
                toastr.success('Etiqueta de prontuário enviado para impressão!','Ok!');
            }
        });
    }
};

$tablePacienteConsulta.on('dbl-click-row.bs.table', function (e, row) {
    get('/agenda/consultas/', {'id_medico': row.id_med, 'data': row.dt},'get');
});
/* Fim BootstrapTable Consulta */


var camposPaciente = '#formDadosPaciente input, #formDadosPaciente select, ' +
    '#formComplementosPaciente input, #formComplementosPaciente select, ' +
    '#formComplementosPaciente textarea';

function HabilitaBotoesPaciente(){
    $('#reciboConsulta').removeClass('disabled');
    $('#imprimeFicha').removeClass('disabled');
    $('#salvaFicha').removeClass('disabled');
}

function DesabilitaBotoesPaciente(){
    $('#reciboConsulta').addClass('disabled');
    $('#imprimeFicha').addClass('disabled');
    $('#salvaFicha').addClass('disabled');
}

function DesabilitaCamposPaciente(){
    $(camposPaciente).prop('disabled', true);
    selecionaMedico.disable();
    selecionaConvenio.disable();
    selecionaPlano.disable();
}


function LimpaCamposPaciente(){
    $(camposPaciente).val('');
    selecionaMedico.clear();
    selecionaConvenio.clear();
    selecionaPlano.clear();
    $('.classPaciente #id_id').val('0');
    $('.classPaciente #id_data_cad').val(date);
}

function HabilitaCamposPaciente(){
    $(camposPaciente).prop('disabled', false);
    selecionaMedico.enable();
    selecionaConvenio.enable();
    selecionaPlano.enable();
}

/* Paciente*/




/* Recibo */

