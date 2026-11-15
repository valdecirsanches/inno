var $tableConsultas = $('#tabelaConsultas');

// Função para gerar os botões de cor
function FormatoBotaoCor(value, row, index) {
  const cor = row.cor || "";
  return `
    <div class="color-buttons" style="display: flex; justify-content: flex-end; gap: 5px;">
      <button class="color-btn color-btn-small" style="background-color: #FF0000;" data-id="${row.id}" data-cor="#FF0000"></button>
      <button class="color-btn color-btn-small" style="background-color: #00FF00;" data-id="${row.id}" data-cor="#00FF00"></button>
      <button class="color-btn color-btn-small" style="background-color: #0000FF;" data-id="${row.id}" data-cor="#0000FF"></button>
      <button class="color-btn color-btn-small" style="background-color: #FFFF00;" data-id="${row.id}" data-cor="#FFFF00"></button>
      <button class="color-btn color-btn-small" style="background-color: #FF00FF;" data-id="${row.id}" data-cor="#FF00FF"></button>
      <button class="color-btn color-btn-small" style="background-color: #FFFFFF;" data-id="${row.id}" data-cor="" title="Devolve a cor padrão">
        <i class="fas fa-eraser"></i> <!-- Ícone de borracha -->
      </button>
    </div>
  `;
}

// Atualiza a cor da linha ao clicar nos botões
$(document).on('click', '.color-btn', function () {
  const id = $(this).data('id');
  const cor = $(this).data('cor');

  const $tr = $('#tabelaConsultas tbody tr[data-uniqueid="'+id+'"]');
  if ($tr.length) {
    if (cor === 'default') {
      // Limpa a cor e define a cor padrão (sem fundo colorido)
      $tr.find('td').each(function () {
        this.style.removeProperty('background-color');
        this.style.removeProperty('color');
      });
    } else {
      // Aplica a cor ao fundo da linha
      $tr.find('td').each(function () {
        this.style.setProperty('background-color', cor, 'important');
        this.style.setProperty('color', '#000', 'important');
      });
    }
  }

  // Atualiza a tabela com a nova cor
  $('#tableConsultas').bootstrapTable('updateByUniqueId', {
    id: id,
    row: { cor: cor === 'default' ? '' : cor }
  });
});

// Salva quando o usuário clica em um botão de cor
$(document).on('click', '.color-btn', async function () {
  const id = $(this).data('id');
  const cor = $(this).data('cor');

  try {
    const resp = await api.post('agenda/' + id + '/grava_cor/', { cor: cor === 'default' ? '' : cor });
    if (resp.data?.success) {
      toastr.success("Cor salva com sucesso!");
    } else {
      toastr.error("Erro ao salvar cor!");
    }
  } catch (err) {
    console.error(err);
    toastr.error("Erro ao salvar cor!");
  }
});



function rowStyle(row, index) {
    let style = { classes: row.periodo || '' };

    if (row.cor) {
        style.css = { 
            'background-color': row.cor,
            'transition': 'background-color 0.5s ease' // animação suave
        };
    }

    if (!$('#id_' + row.periodo).is(':checked')) {
        style.classes += ' hide';
    }

    return style;
    
}









/* Definição da Pesquisa */
var timer_select;
var request_select;
var $selecionaPaciente = $("#id_fk_paciente").selectize({
    valueField: 'id',
    labelField: 'paciente',
    searchField: ['paciente', 'codigo', 'cpf', ],
    options: [],
    create: false,
    render: {
        option: function(item, escape) {
            return  '<div class="media-body">' +
                '<div class="col-md-2">' + escape(item.codigo) + '</div>' +
                '<div class="col-md-2">' + escape(item.cpf) + '</div>' +
                '<div class="col-md-4"><strong class="media-heading">' + escape(item.paciente) + '</strong></div>' +
                '<div class="col-md-2">'+ escape(item.nasc) + '</div>' +
                '<div class="col-md-2">'+ escape(item.clinica) + '</div>' +
                '</div>';
        }  // Ta na conta   dele? sim
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
                    success: RetPaciente,
                });

                function RetPaciente(res) {
                    if (!res.length) {
                        toastr.error('Não foi encontrado o prontuário em nossa base de dados', 'Prontuário não encontrado!');
                        callback();
                    } else {
                        callback(res);
                    }
                }

                return callback();
            } else {
                return callback();
            }
        },500);
    },
    onChange: function (value){
        $('#paciente_id').val(value);
        ChangeIdProntuario(value);
        $tableAgendaPaciente.bootstrapTable('refresh', {query: {paciente: value}});
    }
});
var selecionaPaciente = $selecionaPaciente[0].selectize;
/* Definição da Pesquisa */

/* Definição da Ação */
var $selecionaPrecedimento = $("#id_fk_procedimento").selectize({
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
    }
});
var selecionaProcedimento = $selecionaPrecedimento[0].selectize;
selecionaProcedimento.load(function(callback){
    $.ajax({
        url: '/cadastros/auxiliares/SelecionaProcedimento/',
        method: 'GET',
        success: Ret,
    });

    function Ret(res){
        callback(res);
    }
});
/* Definição da Ação */

/* Definição da Tipo */
var $selecionaEspecialidade = $("#id_fk_especialidade").selectize({
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
    }
});
var selecionaEspecialidade = $selecionaEspecialidade[0].selectize;
selecionaEspecialidade.load(function(callback){
    $.ajax({
        url: '/cadastros/auxiliares/SelecionaEspecialidade/',
        method: 'GET',
        success: Ret,
    });

    function Ret(res){
        callback(res);
    }
});
/* Definição da Tipo */

/* Definição da Medico */
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

// a lista de médicos é a mesma no formulário e no filtro da agenda:
// um pedido só ao servidor, usado pelos dois
var listaMedicos = null;
function CarregaListaMedicos() {
    if (!listaMedicos) {
        listaMedicos = $.ajax({url: '/cadastros/medicos/SelecionaMedico/', method: 'GET'});
        listaMedicos.fail(function () { listaMedicos = null; });
    }
    return listaMedicos;
}

var selecionaMedico = $selecionaMedico[0].selectize;
selecionaMedico.load(function(callback) {
    CarregaListaMedicos().done(function (res) { callback($.extend(true, [], res)); });
});
/* Definição da Medico */

/* Definição da Convenio */
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
        url: '/cadastros/convenio/SelecionaConvenio/',
        method: 'GET',
        success: Ret,
    });
    function Ret(res){
        callback(res);
    }
});
/* Definição da Convenio */

/* Definição da Plano */
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
function PlanosConvenio(conv){
    selecionaPlano.clearOptions();
    selecionaPlano.load(function(callback) {
        $.ajax({
            url: '/cadastros/convenio/PlanosConvenio',
            data: {conv: conv},
            method: 'GET',
            success: Ret,
        });
        function Ret(res){
            callback(res);
        }
    });
}
/* Definição da Plano */

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
        var dateData = $dataAgenda.datepicker('getDate');
        $('#titMedico').html(Medico.getItem(value).html());
        $('#titData').html(strzero(dateData.getDate(),2)+'/'+(dateData.getMonth()+1)+'/'+dateData.getFullYear());
        AutoAgenda(dateData, value);
        DDHLivres(dateData);
        AtualizaTabela();
    }
});

var Medico = $Medico[0].selectize;
Medico.addOption({'id': 0, 'descricao': 'Todos os medicos'});
Medico.load(function(callback){
    CarregaListaMedicos().done(function (res) { Ret($.extend(true, [], res)); });
    function Ret(res){
        callback(res);
        if(getUrlParameter('id_medico')){
            Medico.setValue(getUrlParameter('id_medico'));
        } else {
            Medico.setValue(0);
        }
    }
});
/* Definição da Medico */

/* Definição da Datepicker */

var dhl =[];
var $dataAgenda = $('#datepicker_agenda').datepicker({
    todayBtn: "linked",
    language: "pt-BR",
    format: "yyyy-mm-dd",
    beforeShowDay: function(date) {
        var dateFormat = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
        if (dhl[dateFormat]) {
            return {
                classes: 'HL'+dhl[dateFormat]
            };
        }
    }
}).on('changeDate', function(myDate){
    var id = Medico.getValue();
    var dateData = new Date(myDate.date);
    $('#titData').html(strzero(dateData.getDate(),2)+'/'+(dateData.getMonth()+1)+'/'+dateData.getFullYear());
    DDHLivres(dateData);
    AutoAgenda(dateData, id);
    AtualizaTabela();

}).on("changeYear changeMonth", function(event){
    DDHLivres(new Date(event.date));
    AtualizaTabela();
});

// várias telas/eventos pedem o calendário ao mesmo tempo (abrir a página,
// carregar médicos, trocar data): junta tudo em um pedido só
var ddhTimer = null;
function DDHLivres(dt){
    clearTimeout(ddhTimer);
    ddhTimer = setTimeout(function () { _DDHLivres(dt); }, 40);
}

function _DDHLivres(dt){
    if ($dataAgenda.datepicker){
        var myDate = dt.getFullYear()+'-'+(dt.getMonth()+1)+'-'+dt.getDate(),
            med = Medico.getValue() || 0;
        $.ajax({
            url: '/agenda/consultas/DDHLivres',
            data: {dt: myDate, med: med},
            method: 'GET',
            success: Ret,
        });
        function Ret(data){
            if (data.erro){

            } else {
                dhl = data.dhl;
                $dataAgenda.datepicker('update',myDate);
            }
        }
    }
}
/* Definição da Datepicker */

/* Definição da Switchery */
var elem_Livre = document.querySelector('#id_Livre');
var switchery_Livre = new Switchery(elem_Livre, { color: '#FFFF5A', size: 'small'});

var elem_All = document.querySelector('#id_All');
var switchery_All = new Switchery(elem_All, { color: '#A6A6A6', size: 'small'});

var elem_A = document.querySelector('#id_A');
var switchery_A = new Switchery(elem_A, { color: '#A1D5FF', size: 'small'});

var elem_B = document.querySelector('#id_B');
var switchery_B = new Switchery(elem_B, { color: '#73FFE4', size: 'small'});

var elem_C = document.querySelector('#id_C');
var switchery_C = new Switchery(elem_C, { color: '#FF9A9A', size: 'small'});
/* Definição da Switchery */

$('input[type=checkbox]').change(function(){
    AtualizarAgenda();
    AtualizaTabela();
});

function AtualizarAgenda(){
    var dateData = $dataAgenda.datepicker('getDate'),
        id = Medico.getValue();
    AutoAgenda(dateData, id);
}

$(window).load(function() {
    if (getUrlParameter('data')){
        $dataAgenda.datepicker('update', getUrlParameter('data'));
    } else {
        $dataAgenda.datepicker('update', date);
    }
    // a primeira carga é feita quando a lista de médicos termina de carregar
    // (Medico.onChange); antes a agenda era buscada 3 vezes ao abrir a página
    if (Medico.getValue() !== '') {
        DDHLivres(d);
        AtualizaTabela();
    }
    IAA();
});

/* ---------------------------------------------------------------------
 * Atualização automática: só quando a agenda mudar em outro terminal.
 * A cada 8 s a tela pergunta ao servidor a "assinatura" da agenda do dia
 * (consulta leve). Se for igual à que está na tela, nada é recarregado.
 * Antes a agenda inteira era recarregada a cada 60 s, mudando ou não.
 * ------------------------------------------------------------------- */
var agendaPoll = null,
    agendaPendente = false;

function VerificaMudancasAgenda(forcar){
    if (!agendaChave || agendaXhr) { return; }
    if (document.hidden && !forcar) { return; }   // aba em segundo plano: não consulta
    var partes = agendaChave.split('|');
    $.ajax({
        url: '/agenda/consultas/VersaoAgenda/',
        data: {data: partes[0], id_medico: partes[1]},
        method: 'GET',
    }).done(function (r) {
        if (!r || r.versao === undefined || r.versao === agendaVersao) { return; }
        if ($tableConsultas.bootstrapTable('getSelections').length) {
            // há linhas marcadas: recarregar desmarcaria; aplica ao desmarcar
            agendaPendente = true;
            return;
        }
        AtualizaTabela();
        DDHLivres($dataAgenda.datepicker('getDate'));
    });
}

// mantido com o mesmo nome: as marcações de linha chamam IAA(temSelecao).
// Antes, marcar criava um segundo timer e desmarcar parava a atualização de vez.
function IAA(temSelecao) {
    if (!agendaPoll) {
        agendaPoll = setInterval(VerificaMudancasAgenda, 8000);
    }
    if (!temSelecao && agendaPendente) {
        agendaPendente = false;
        AtualizaTabela();
        DDHLivres($dataAgenda.datepicker('getDate'));
    }
}

// ao voltar para a aba, confere na hora
document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { VerificaMudancasAgenda(true); }
});

function AutoAgenda(dateData, id){
    var myDate = dateData.getFullYear()+'-'+(dateData.getMonth()+1)+'-'+dateData.getDate();
    TabelaMedico(myDate, id);
}


$(".agenda_buttons").on(
    "propertychange change keyup paste input", function() {

        var dateData = $dataAgenda.datepicker('getDate');
        $('#id_title1').html('Agenda de Consultas '+
            strzero(dateData.getDate(),2)+'/'+
            strzero(dateData.getMonth()+1,2)+'/'+
            strzero(dateData.getFullYear(),4));
        AtualizaTabela();

        if ($('#id_A').is(':checked')) {
            $('.A').removeClass('hide');
        } else {
            $('.A').addClass('hide');
        }

        if ($('#id_B').is(':checked')) {
            $('.B').removeClass('hide');
        } else {
            $('.B').addClass('hide');
        }

        if ($('#id_C').is(':checked')) {
            $('.C').removeClass('hide');
        } else {
            $('.C').addClass('hide');
        }

    });

function ChangeIdProntuario(id){
    if (id > 0){
        $('#btnNovoProntuario').addClass('hidden');
        $('#btnAlteraProntuario').removeClass('hidden');
    } else {
        $('#btnNovoProntuario').removeClass('hidden');
        $('#btnAlteraProntuario').addClass('hidden');
    }
}


function ChangeIdAgendamento(idProntuarioAgenda, idProntuarioTela, hora){
    idProntuarioAgenda = idProntuarioAgenda || 0;
    idProntuarioTela = idProntuarioTela || 0;
    ChangeIdProntuario(idProntuarioTela);
    if(idProntuarioAgenda > 0){
        if (hora != 'None'){
            $('#btnHorarioLivre').removeClass('hidden');
        } else {
            $('#btnExcluirReceita').removeClass('hidden');
            selecionaProcedimento.setValue(5);
            selecionaProcedimento.disable();
        }
        $('#btnAlteraProntuario').removeClass('hidden');
    } else {
        $('#btnHorarioLivre').addClass('hidden');
        $('#btnExcluirReceita').addClass('hidden');
        $('#btnAlteraProntuario').addClass('hidden');
    }
}


function NovoReceita(){
    var dt = $dataAgenda.datepicker('getDate'),
        a=dt.getFullYear()+"-"+strzero(dt.getMonth()+1,2)+"-"+strzero(dt.getDate(),2);

    $.ajax({
        url: '/agenda/consultas/NovoReceita',
        data: {data: a},
        method: 'GET',
        success: Ret,
    });
    function Ret(data){
        $("#id_ag_id").val('0');
        selecionaPaciente.clearOptions();
        selecionaPaciente.addOption(data);
        selecionaPaciente.setValue(data.id);
        ChangeIdAgendamento(0, data.id);
        $('#id_data').val(a);
        $('#id_hora').val('');
        selecionaProcedimento.setValue(5);
        selecionaProcedimento.disable();
        selecionaEspecialidade.clear();
        $('#id_guia').val('');
        $("#modalAgendar").modal("show");
    }
}


function CarregaAgendamento(id_agenda){
    $.ajax({
        url: 'CarregaAgendamento',
        data: {consulta: id_agenda},
        method: 'GET',
        success: RetPaciente,
    });
    function RetPaciente(data){
        if (data.success) {
            data=data.success;
            var title = data.fields.id_fk_paciente == 'None' ? 'Agendar' : 'Alterar';
            var hora = '';
            if (data.hora != 'None') {
                hora = ' às ' + data.hora;
                selecionaProcedimento.enable();
            } else {
                selecionaProcedimento.disable();
            }
            $('#id_title_agendar').html(
                title + ' consulta médica' +
                ' de ' + data.data + hora +
                '<br> com Dr(a) ' + data.med
            );
            $("#id_ag_id").val(id_agenda);
            selecionaPaciente.clearOptions();

            if (data.paciente.id) {
                selecionaPaciente.addOption(data.paciente);
                selecionaPaciente.setValue(data.paciente.id);
            }
            var dadosAgendamento = '';
            if (data.dt_age) {
                dadosAgendamento = [data.dt_age, data.usu].join(' - ');
            } else {
                dadosAgendamento = data.usu;
            }
            $('#dadosAgendamento').html(dadosAgendamento);
            ChangeIdAgendamento(data.fields.id_fk_paciente, data.paciente.id, data.hora);
            $('#id_data').val(data.data);
            $('.classAgendar #id_hora').val(data.hora);
            $('#id_hora_chegada').val(data.fields.id_hora_chegada);
            selecionaProcedimento.setValue(data.fields.id_fk_procedimento);
            selecionaEspecialidade.setValue(data.paciente.fk_especialidade);
            $('#id_guia').val(data.fields.id_guia);
            $("#modalAgendar").modal("show");
        }
        else {
            toastr.error('Erro ao carregar agendamento', 'Carregando agendamento')

        }
    }
}


function SalvaAgendamento(){
    var dt = $dataAgenda.datepicker('getDate'),
        a=dt.getFullYear()+"-"+(dt.getMonth()+1)+"-"+dt.getDate(),
        medico = Medico.getValue();
    $.ajax({
        url: 'SalvaAgendamento',
        data: {
            form: $('#formAgendar').serialize(true),
            data: a,
            medico: medico,
            consulta: $('#id_ag_id').val() || 0,
            id_paciente: $('#id_fk_paciente').val(),
            hora_chegada: $('#id_hora_chegada').val()
        },
        method: 'GET',
        success: Ret,
    });

    function Ret(data) {
        if (data.success){
            toastr.success(data.success, 'Sucesso!');
            var dateData = $dataAgenda.datepicker("getDate");
            AutoAgenda(dateData, Medico.getValue());
            $("#modalAgendar").modal("hide");
        } else if (data.erro.fields) {
            $('.form-group').removeClass('has-error');
            for (var i=0; i<data.erro.fields.length; i++){
                $('#id_'+data.erro.fields[i]+'_div').addClass('has-error');
            }
            if(data.erro.fields.fk_medico){
                $('#id_ag_fk_medico_div').addClass('has-error');
            }
            swal('Erro na validação dos dados, verifique os campos assinalados em vermelho!  ('+data.erro.fields+')','Dados nao salvos!','error');
        } else {
            swal(data.erro, 'Erro!','error');
        }
    }
}


function ExcluirReceita(){
    bootbox.dialog({
        message: "Tem certeza que deseja excluir a receita?",
        title: "Excluir Receita",
        buttons: {
            danger: {
                label: "Sim",
                className: "btn-danger",
                callback: function() {
                    $.ajax({
                        url: 'ExcluirReceita',
                        data: {
                            rec: $('#id_ag_id').val()
                        },
                        method: 'GET',
                        success: Ret,
                    });

                    function Ret(data){
                        if(data.success){
                            $tableConsultas.bootstrapTable('removeByUniqueId', data.success.receita);
                            $('#modalAgendar').modal('hide');
                            toastr.error(
                                'Receita do dia '+data.success.data+' excluido',
                                data.success.paciente
                            );
                        }
                    }
                }
            },
            success: {
                label: "Não",
                className: "btn-default"
            }
        }
    });
}




function CadastroProntuario(idProntuario){
    var id = idProntuario || 0;
    if(idProntuario > 0){
        $.ajax({
            url: '/cadastros/paciente/CarregaPaciente',
            data: {
                paciente: id
            },
            method: 'GET',
            success: RetCarrega,
        });

        function RetCarrega(data){
            if(data.erro){
                swal(data.erro, 'Erro!', 'error');
            }
            else{
                data=data.success;
                $('#id_id').val(data.id);
                for (var key in data.fields) {
                    if (data.fields.hasOwnProperty(key)) {
                        if (data.fields[key]=='None') { $('#'+key).val('');}
                        else { $('#'+key).val(data.fields[key]);}
                    }
                }
                selecionaConvenio.setValue(data.fields['id_fk_convenio']);
                selecionaPlano.addOption({'id': data.fields['id_fk_plano'], 'descricao': data.plano});
                selecionaPlano.setValue(data.fields['id_fk_plano']);
                selecionaMedico.setValue(data.fields['id_fk_medico']);
                calculaIdade($('#id_data_nasc').val(), $('#id_idade'));
                $('#id_data_cad').val(data.data_cad);

                $('#modalCadastrar').modal('show');
            }
        }
    } else {
        $.ajax({
            url: '/cadastros/paciente/NovoProntuario',
            method: 'GET',
            success: RetNovo,
        });
        function RetNovo(data){
            if(data.erro){
                toastr.error(data.erro, 'Erro!');
            } else {
                data=data.success;
                LimpaCamposPaciente();
                $('#id_codigo').val(data.codigo).focus();
                $('#modalCadastrar').modal('show');
            }
        }
    }
}



function SalvaProntuario(){
    $.ajax({
        url: '/cadastros/paciente/SalvaPaciente/',
        
        data: {
            form: $('#formCadastrar').serialize(true),
            paciente: $('#id_id').val()
        },
        method: 'POST',
        success: Ret,
    });
    function Ret(data){
        if (data.erro){
            $('.form-group').removeClass('has-error');
            for (var i=0; i<data.erro.length; i++){
                $('#id_'+data.erro[i]+'_div').addClass('has-error');
            }
            swal('Erro na validação dos dados, verifique os campos assinalados em vermelho!  ('+data.erro+')','Dados nao salvos!', 'error');
        } else if(data.success){
            data=data.success;
            $('.form-group').removeClass('has-error').addClass('has-success');
            $('#id_id').val(data.id);
            selecionaPaciente.addOption(data);
            selecionaPaciente.setValue(data.id);
            $('#modalCadastrar').modal('hide');
            toastr.success('Dados salvos com sucesso!','Gravando dados do prontuário.');
        }
    }
}

//SMS
function ModalSMS(row){
    var dt = $dataAgenda.datepicker('getDate');
    $('#dia_semana').val(dt.getDay());

    var w1 = dt.getDay();
    var d1 = dt.getDate();
    var m1 = dt.getMonth();

    var m = ["Jan", "Fev", "Mar","Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    var w = ["no Domingo", "na Segunda", "na Terça","na Quarta", "na Quinta", "na Sexta", "no Sabado"];

    $('#mensagem_sms_id').val(
        'O Inst. Neurologia informa sua consulta esta agendada para '+d1.toString()+'/'+strzero((m1+1),2)+
        ' ' +row.hr_format.split(':').join('h')+' com Dr ' + row.nome_med.slice(' ')[0] +
        '\nFavor chegar no horario agendado, tolerancia 15min\nTel: 11 2284-3334'
    );
    $('#agenda_sms_id').val(row.id);
    $('#celular_id').val(row.cel);
    $('#destinatario_id').val(row.pac.split(' <i')[0]);
    $('#ModalSMS').modal('toggle');

}





//WhatsApp
function FormatoWhatsApp(value, row, index){
    if (!row.id_pac>0) {
        return []
    }
    dh = ''
    if (row.confirmacao === 1) {
        dh = `<small style="font-size: 10px; color: blue " 
                     title="Data/Hora em que o paciente confirmou">${row.confirmacao_dh}</small>`
    } else if (row.confirmacao === 2){
        dh = `<small style="font-size: 10px; color: red" 
                     title="Data/Hora em que o paciente cancelou">${row.confirmacao_dh}</small>`
    }
    icon=''
    if (row.confirmacao === 1) {
        icon = '<i class="fa fa-check" style="color:blue"></i>'

    } else if (row.confirmacao === 2) {
        icon = '<i class="fa fa-close" style="color: red"></i>'
    } else {
        icon = '<iconify-icon icon="bi:whatsapp" style="color:#167216"></iconify-icon>'
    }

    return [
        `<a class="whatsapp" title="Enviar lembrete via WhatsApp">
        ${icon}
        </a>,
        <br>`,
        dh
    ].join('');
}

window.EventoWhatsApp = {
    'click .whatsapp': function (e, value, row) {
        if (row.confirmacao === 1 || row.confirmacao === 2) {
            Restaura(row)
        } else {
            EnviaWhatsApp(row)
        }

    },
};




function AtualizaTabela(){
    var dateData = $dataAgenda.datepicker('getDate'),
        data = dateData.getFullYear()+'-'+(dateData.getMonth()+1)+'-'+dateData.getDate(),
        id_medico = $('#medico').val();
    TabelaMedico(data, id_medico);
}


function ConsultaSalvaProntuario(){
    SalvaProntuario();
    $('#pesquisa_str_disable_div').removeClass('hidden');
    $('#pesquisa_str_disable').val($('#nome_id').val());
    $('#pesquisa_str_div').addClass('hidden');
    $('#paciente_id').val($('#id_disable').val());
    selecionaPaciente.focus();
    CadastraAltera();
    $('#modalCadastrar').modal('hide');
}



function cellStyle(value, row, index) {
    return {
        classes: row.status
    }
}

function FormatoHora(value, row, index){
    return [
        `<a class="hora" 
            title="Click para alterar dados da consulta">
        <i class="fa fa-pencil"></i>
         <span class="text-lg">${value}</span>
        </a>
       
        `
    ].join('');
}

function FormatoChegada(value, row, index){
    if (!row.id_pac>0) {
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

function FormatoStatus(value, row, index){
    if (!row.id_pac>0) {
        return []
    }
    return [`
        <a class="status"
           title="Status">
        <i class="fa fa-clock-o"></i>
        </a>
        `
    ].join('');
}


function FormatoConsulta(value, row, index){
    if (!row.id_pac>0) {
        return []
    }
    return [
        '<a class="consulta ml10" title="Etiqueta de Consulta" >',
        '<i class="fa fa-tag"></i>',
        '</a>'
    ].join('');
}


function FormatoHrOpcoes(value, row, index){
    return [
        `
    <div class="">
      <a class="hr_exclui"
        title="Excluir horário"
        >
        <i class="fa fa-trash-o"></i>
        </a>&nbsp;&nbsp;&nbsp;
<!--      <a class="transfere" -->
<!--        title="Transferir para outro dia"-->
<!--        >-->
<!--        <i class="fa fa-share"></i>-->
<!--        </a>&nbsp;&nbsp;&nbsp;-->
<!--      <a class="hr_clone" -->
<!--        title="Clonar horário"-->
<!--        >-->
<!--        <i class="fa fa-copy"></i>-->
<!--        </a>-->
        </div>
        `
    ].join('');
}
window.EventoHrOpcoes = {
    'click .hr_exclui': function (e, value, row) {
        HrExclui(row);
    },
    'click .hr_clone': function (e, value, row) {
        HrClone(row);
    },
    'click .transfere': function (e, value, row) {
        Transfere(row);
    }
};





$tableConsultas.on('dbl-click-row.bs.table', function (e, row) {
    CarregaAgendamento(row.id);
});


$tableConsultas.on('check-some.table', function (e, row) {
    IAA($tableConsultas.bootstrapTable('getSelections').length > 0);
});

$tableConsultas.on('check.bs.table', function (e, row) {
    IAA($tableConsultas.bootstrapTable('getSelections').length > 0);
}).on('uncheck.bs.table', function (e, row) {
    IAA($tableConsultas.bootstrapTable('getSelections').length > 0);
}).on('check-all.bs.table', function (e, row) {
    IAA($tableConsultas.bootstrapTable('getSelections').length > 0);
}).on('uncheck-all.bs.table', function (e, row) {
    IAA($tableConsultas.bootstrapTable('getSelections').length > 0);
});

// $tableConsultas.bootstrapTable().blur(function() { alert('it works');


window.EventoHora = {
    'click .hora': function (e, value, row) {
        CarregaAgendamento(row.id);
    }
};

window.EventoStatus = {
    'click .status': function (e, value, row) {
        $.ajax({
            url: '/agenda/consultas/StatusConsulta',
            data: {
                consulta: row.id,
                status: '' //row.status
            },
            method: 'GET',
            success: Ret,
        });
        function Ret(data){
            if (data.success){
                var linha = $tableConsultas.bootstrapTable('getRowByUniqueId', row.id);
                linha.stt = data.success.stt;
                linha.status = data.success.status;
                $tableConsultas.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
            }
        }
    }
};

window.EventoConsulta = {
    'click .consulta': function (e, value, row) {
        $.ajax({
            url: '/agenda/consultas/EtiquetaConsulta',
            data: {
                consulta: row.id
            },
            method: 'GET',
            success: Ret,
        });
        function Ret(data){
            if(data){
                toastr.success('Etiqueta de prontuário enviado para impressão!','Ok!');
            }
        }
    }
};

function FormatoProntuario(value, row, index) {
    if (!row.id_pac > 0) {
        return []
    }
    var s = `
        <a class="prontuario" 
           title="Cadastro do paciente (Click para acessar)">
           <i class="fa fa-ticket">${row.cod_pac}</i>
        </a>
        `
    return [s].join('');
}

window.EventoProntuario = {
    'click .prontuario': function (e, value, row) {
        CadastroProntuario(row.id_pac);
    }
};

window.EventoSms = {
    'click .sms': function (e, value, row) {
        ModalSMS(row)
    }
};

window.EventoChegada = {
    'click .hr_chegada': function (e, value, row) {
        if (row.status != 'AGENDADO' && row.status != 'FALTOU' ){

            if (row.status == 'AGUARDANDO'){
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
                                    AtualizarAgenda();
                                    toastr.success('Procedimento executado com sucesso!','OK');
                                }
                            }

                        });
                    }
                });
            }

            if (row.status == 'ATENDIMENTO'){
                toastr.info('paciente já está com o médico!','Hora da chegada:');
            }

            if (row.status == 'ATENDIDO'){
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
                    var linha = $tableConsultas.bootstrapTable('getRowByUniqueId', row.id);
                    linha.hr_chegada = data.success.hr_chegada;
                    linha.status = 'AGUARDANDO'
                    $tableConsultas.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
                    toastr.success('Hora de chegada gravado com sucesso!','Hora da chegada:');
                }
            }
        }
    }
};



// Carga da agenda: pedidos repetidos em sequência viram um só, e se a data
// ou o médico mudar no meio, o pedido anterior é cancelado (antes uma
// resposta atrasada podia mostrar a agenda de outro dia).
var agendaXhr = null,
    agendaSeq = 0,
    agendaTimer = null,
    agendaVersao = null,
    agendaChave = null;

function TabelaMedico(data, id_medico){
    clearTimeout(agendaTimer);
    agendaTimer = setTimeout(function () { _TabelaMedico(data, id_medico); }, 40);
}

function _TabelaMedico(data, id_medico){
    if (agendaXhr) { agendaXhr.abort(); }
    var seq = ++agendaSeq,
        chave = data + '|' + id_medico;
    agendaXhr = $.ajax({
        url: '/agenda/consultas/CarregaConsultas/',
        data: {
            data: data,
            id_medico: id_medico,
            Livre: $('#id_Livre').is(':checked'),
            All: true,
        },
        method: 'POST',
        success: Ret,
    }).always(function () {
        if (seq === agendaSeq) { agendaXhr = null; }
    });
    function Ret(data){
        if (seq !== agendaSeq) { return; }   // resposta de um pedido já substituído
        agendaChave = chave;
        agendaVersao = data.versao;
        agendaPendente = false;
        var i,
            Agenda = data.Agenda,
            consultas = $tableConsultas.bootstrapTable('getData'),
            Livre = $('#id_Livre').is(':checked'),
            All = $('#id_All').is(':checked'),
            A = $('#id_A').is(':checked'),
            B = $('#id_B').is(':checked'),
            C = $('#id_C').is(':checked');

        $('#id_aguardando').html(data.aguardando);
        $('#id_atendidos').html(data.atendidos);
        $('#id_faltas').html(data.faltas);
        $('#titAgendados').html(data.total);
        $('#id_agendados').html(data.agendados);
        $('#id_encaixes').html(data.encaixes);
        $('#id_balcao').html(data.balcao);

        if (data.receita) {
            $('#btnNovoReceita').removeClass('hidden');
        } else {
            $('#btnNovoReceita').addClass('hidden');
        }

        $('#id_msgAgenda').html('');

        $('#btnDesativaAgenda').addClass('hidden');
        if ($('#medico').val() > '0'){
            $('#btnDesativaAgenda').removeClass('hidden');
        }
        if(Agenda?.length <= 0){
            if ((A || B || C) && (All || Livre) && !data.receita){
                $('#id_msgAgenda').html('Agenda não aberta para esta data');
                // $('#btnAbrirAgenda').removeClass('hidden');
            } else {
                // $('#btnAbrirAgenda').addClass('hidden');
            }
            $tableConsultas.bootstrapTable('removeAll');
        } else {
            // $('#btnAbrirAgenda').addClass('hidden');
            // if(!_.isEqual(Agenda, consultas)){
            if (!(JSON.stringify(Agenda) === JSON.stringify(consultas))) {
                $tableConsultas.bootstrapTable('removeAll')
                $tableConsultas.bootstrapTable('load',Agenda)
            }
        }
    }
}


/* Fim BootstrapTable Consulta */

/* Inicio BootstrapTable Agenda Paciente */

var $tableAgendaPaciente = $('#tabelaAgendaPaciente');

$tableAgendaPaciente.on('dbl-click-row.bs.table', function (e, row) {
    TabelaMedico(row.dt, row.id_med);
    Medico.setValue(row.id_med);
    $dataAgenda.datepicker('setDate', row.dt);
    $("#modalAgendar").modal("hide");
});

/* Fim BootstrapTable Agenda Paciente */

function ImprimeAgenda(){
    var dateData = $dataAgenda.datepicker('getDate'),
        myDate = dateData.getFullYear()+'-'+(dateData.getMonth()+1)+'-'+dateData.getDate(),
        medico = $('#medico').val();
    printPDF('ImprimeAgenda?dt='+myDate+'&medico='+medico)
}

var campos = '#formCadastrar input, #formCadastrar select, #formCadastrar textarea';

function LimpaCamposPaciente(){
    $(campos).val('');
    selecionaMedico.clear();
    selecionaConvenio.clear();
    selecionaPlano.clear();
    $('#id_id').val('0');
    $('#id_datacad').val(date);
    $('#id_datainic').val(date);
}

function AbrirAgenda(){
    var id_medico = Medico.getValue(),
        dateData = $dataAgenda.datepicker('getDate'),
        myDate = dateData.getFullYear() + '-' +
            strzero((dateData.getMonth() + 1),2) + '-' +
            strzero(dateData.getDate(), 2),
        myDate_format = strzero(dateData.getDate(), 2)+'/'+(strzero((dateData.getMonth() + 1),2))+'/'+dateData.getFullYear();

    if (id_medico == 0){
        toastr.error('Selecione um médico por favor! ','Abrindo agenda!');
    }
    else {

        var txt =
            '<div class="col-lg-12">'+
            '<form>'+
            '<div class="col-lg-12">'+
            '<div>' +
            '<label>Confirme ou altere a data:  </label>'+
            '<input id="id_datax" type="date" value="'+myDate_format+'">'+
            '</div>'+
            '</div>'+
            '</form>'+
            '</div>';
        swal({
            title: "Abertura de nova agenda de consultas",
            html: txt,
            type: "info",
            showCancelButton: true,
            confirmButtonColor: "#DD6B55",
            confirmButtonText: "Execute",
            cancelButtonText: "Desistir!",
            // closeOnConfirm: true,
            showLoaderOnConfirm: true,
            onOpen: function () {
                $('#id_datax').val(myDate)
            },
            preConfirm: function (result) {

                return new Promise(function (resolve) {
                    resolve()
                    $.ajax({
                        url: '/agenda/consultas/AbrirAgenda',
                        data: {
                            id_medico: id_medico,
                            data: $('#id_datax').val()
                        },
                        method: 'GET',
                        success: Ret,
                    });

                    function Ret(data) {
                        if (data) {
                            AtualizarAgenda();
                            toastr.success('Dados salvos com sucesso!', 'Gravando dados do prontuário.');
                        } else {
                            if (data.erro) {
                                if (data.erro == 'HorarioInvalido')
                                    toastr.error('Medico Não possui horários Cadastrados para esse dia da semana', 'Agenda não aberta!');
                            } else {
                                toastr.error('Erro ao Abrir Agenda!', 'Agenda não aberta!');
                            }
                        }
                    }
                });
            }
        });
    }
}


function AbrirAgenda1(){
    var id_medico = Medico.getValue(),
        dateData = $dataAgenda.datepicker('getDate'),
        myDate = dateData.getFullYear() + '-' + (dateData.getMonth() + 1) + '-' + dateData.getDate(),
        myDate_format = strzero(dateData.getDate(), 2)+'/'+(strzero((dateData.getMonth() + 1),2))+'/'+dateData.getFullYear();

    if (id_medico == 0){
        toastr.error('Selecione um médico por favor! ','Abrindo agenda!');
    }
    else {
        bootbox.dialog({
            message: "Deseja abrir agenda para o dia "+myDate_format+"?",
            title: "Abrir Agenda",
            buttons: {
                danger: {
                    label: "Sim",
                    className: "btn-primary",
                    callback: function() {
                        $.ajax({
                            url: '/agenda/consultas/AbrirAgenda',
                            data: {
                                id_medico: id_medico,
                                data: myDate
                            },
                            method: 'GET',
                            success: Ret,
                        });

                        function Ret (data){
                            if(data){
                                AtualizarAgenda();
                                toastr.success('Dados salvos com sucesso!','Gravando dados do prontuário.');
                            } else {
                                if (data.erro){
                                    if (data.erro == 'HorarioInvalido')
                                        toastr.error('Medico Não possui horários Cadastrados para esse dia da semana','Agenda não aberta!');
                                } else {
                                    toastr.error('Erro ao Abrir Agenda!','Agenda não aberta!');
                                }
                            }
                        }
                    }
                },
                success: {
                    label: "Não",
                    className: "btn-default"
                }
            }
        });
    }
}


function DesativarAgenda(){
    var id_medico = Medico.getValue(),
        dateData = $dataAgenda.datepicker('getDate'),
        myDate = dateData.getFullYear() + '-' + (dateData.getMonth() + 1) + '-' + dateData.getDate(),
        myDate_format = strzero(dateData.getDate(), 2)+'/'+(strzero((dateData.getMonth() + 1),2))+'/'+dateData.getFullYear();
    let txt = "<span style='color: #bd2130; font-size: large'>DESATIVAR</span> a agenda de <span style='color: #bd2130'>"+$('.item').html()+"</span> do dia <span style='color: blue; font-size: large' >"+myDate_format+"</span> ?"

    swal({
        title: "Desativar agenda",
        html: txt,
        type: "info",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Desativar",
        cancelButtonText: "Desistir!",
        closeOnConfirm: true
    }).then(function (isConfirm) {
        if (isConfirm) {
            $.ajax({
                url: '/agenda/consultas/DesativarAgenda',
                data: {
                    id_medico: id_medico,
                    data: myDate
                },
                method: 'GET',
                success: Ret,
            });
            function Ret(data){
                if(data.success){
                    AtualizarAgenda();
                    toastr.success('Agenda desativada com sucesso!','Comando executado!');
                } else {
                    swal("Erro ao desativar da agenda",
                        '<span style="color: red; font-size: 24px">'+data.error+'</span><br/><br/>'+
                        ' - Desative os agendamentos um a um para permitir o procedimento.', 'error')
                }
            }
        }
    });

}


function HorarioLivre(){
    swal({
        title: "Desmarcar consulta",
        text: 'Deseja tornar este horário LIVRE (Desmarcar) ?',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, desmarcar!",
        cancelButtonText: "Não",
        // closeOnConfirm: true,
        showLoaderOnConfirm: true,
        preConfirm: function (result) {
            return new Promise(function (resolve) {
                resolve()
                $.ajax({
                    url: '/agenda/consultas/HorarioLivre',
                    data: {
                        'id': $('#id_ag_id').val()
                    },
                    method: 'GET',
                    success: Ret
                });
                function Ret(data){
                    if (data.success){
                        AtualizarAgenda();
                        $("#modalAgendar").modal("hide");
                    }
                }

            });
        }
    });
}

function FormatoFin(value, row, index){
    // if ((!row.id_pac>0) || !(row.necesp)) {
    //     return []
    // }
    var f = '../../static/img/appclinic';
    b1 =''
    if (row.proced === 'RETORNO CIRURGIA'){
        b1 = `<img src="${f}/cirurgia.png" style="width: 16px" />`
    } else if (row.proced === 'CONSULTA 1° VEZ') {
        b1 = `<img src="${f}/consulta32.png" style="width: 16px" />`
    } else if (row.proced === 'RETORNO SUPERIOR A 30 DIAS') {
        b1 = `<img src="${f}/retorno.png" style="width: 16px" />`
    }

    return [b1]
}

function FormatoEspecial(value, row, index){
    var f = '../../static/img/appclinic';
    var b = ''
    if (row.necesp ==='CRIANÇA') {
        b = `<img src="${f}/criancas.png" style="width: 32px"/>`
    } else if (row.necesp ==='IDOSO') {
        b = `<img src="${f}/idoso.png" style="width: 32px" />`
    } else if (row.necesp ==='NECESSIDADE ESPECIAL') {
        b = `<img src="${f}/necessidades.png" style="width: 32px"/>`
    } else if (row.necesp ==='CADEIRANTE') {
        b = `<img src="${f}/cadeirante.png" style="width: 32px"/>`
    } else if (row.necesp ==='DEFICIENTE VISUAL') {
       b = `<img src="${f}/visual.png" style="width: 32px"/>`
    } else if (row.necesp ==='DEFICIENTE AUDITIVO') {
        b = `<img src="${f}/auditivo.png" style="width: 32px"/>`
    } else if (row.necesp ==='RETORNO CIRURGIA') {
        b = `<img src="${f}/cirurgia.png" style="width: 32px" />`
    }
    b = b+`<span style="font-size: 6px;">${row.necesp}</span>`
    return [b]
}

function FormatoPaciente(value, row, index){
    if (!row.id_pac>0) {
        return []
    }

    const bc = `<a class="btn btn-danger" onclick="swal('${row.whatsapp_motivo}')" title="Justificativa de ausência">
                <i class="fa fa-comment"></i>
                </a>`

    var s = `
        <a class="pac" 
           title="Prontuario (Click para acessar)">
           ${value}
        </a>&nbsp;&nbsp;&nbsp;${row.whatsapp_motivo ? bc : ''}
        `
    return [s].join('');
}

window.EventoPaciente= {
    'click .pac': function (e, value, row) {
        get('/atendimento/', {'consulta': row.id}, 'get');
    }
};

function FormatoFone(value, row, index){
    return [
        `<span style="font-size: 10px">${row.cel}</span>`
    ].join('');
}

function FormatoConvenio(value, row, index){

    b = ''; //FormatoFin(value, row, index)


    return [
        `
        <div>
            <div class="inline">
                <span style="font-size: 9px">${row.conv.substring(0, 25)}</span><br/>
                <span style="font-size: 8px">${row.proced.substring(0, 25)}</span>
            </div> &nbsp;&nbsp;&nbsp;
            <div class="inline">
                ${b}
            </div>
        </div>
        `
    ].join('');
}
