$(window).load(function() {
    $('#titData').html(strzero(d.getDate(),2)+'/'+(d.getMonth()+1)+'/'+d.getFullYear());
    AtualizaTabela();
    // antes: a lista inteira era recarregada a cada 10 s, mudando ou não
    setInterval(VerificaMudancasAtendimento, 8000);
});

/* ---------------------------------------------------------------------
 * Atualização automática: só quando a agenda do médico mudar (em outro
 * terminal, na recepção ou pelo robô do WhatsApp). A cada 8 s a tela
 * pergunta só a "assinatura" do dia (consulta leve); se for igual à da
 * lista na tela, nada é recarregado.
 * ------------------------------------------------------------------- */
var atdVersao = null,
    atdXhr = null,
    atdSeq = 0;

function VerificaMudancasAtendimento(forcar) {
    if (atdXhr || atdVersao === null) { return; }
    if (document.hidden && !forcar) { return; }   // aba em segundo plano: não consulta
    $.ajax({
        url: '/atendimento/VersaoAtendimento/',
        method: 'GET',
    }).done(function (r) {
        if (r && r.versao !== undefined && r.versao !== atdVersao) {
            AtualizaTabela();
        }
    });
}

document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { VerificaMudancasAtendimento(true); }
});

var ctx = document.getElementById("lineChart").getContext("2d");
var myNewChart;
$.ajax({
    url: `/agenda/consultas/Graficos.Agendamentos`,
    type: 'GET'
}).success(function (data) {
    // usuário que não é médico recebe {erro: ...}: sem gráfico, sem erro na tela
    if (!data || !data.success) { return; }
    myNewChart = new Chart(ctx).Line(data.success.dados, lineOptions);
    $('#total_agendamentos').html(data.success.total);
});

var ctxP = document.getElementById("lineChartPaciente").getContext("2d");
var myNewChart;
$.ajax({
    url: `/agenda/consultas/Graficos.Pacientes`,
    type: 'GET'
}).success(function (data) {
    if (!data || !data.success) { return; }
    myNewChart = new Chart(ctxP).Bar(data.success.dados, lineOptions);
});

function AtualizaTabela(){
    var tipo = $('#id_stt').serialize();
    TabelaMedico(tipo);
}

/* funções que montam a tabela Principal*/

/* Inicio BootstrapTable Consulta */

var $tableConsultas = $('#tabelaConsultas');

function rowStyle(row, index) {
    return {
        classes: row.stt
    }
}

function FormatoPaciente(value, row, index){
    return [
        '<a class="pac ml10" title="Prontuario">',
            '<i class="fa fa-user"></i>  '+value,
        '</a>'
    ].join('');
}

function FormatoAtendimento(value, row, index){
    var btn;
    if(row.stt == 'AGUARDANDO'){
        btn = '<a class="btn_atendimento btn btn-warning ml10">Iniciar Atendimento</a>';
    } else if(row.stt == 'ATENDIMENTO') {
        btn = '<a class="btn_atendimento btn btn-success ml10 disable">Continuar</a>';
        btn += '<a class="encerrar_atendimento btn btn-danger ml10 disable">Encerrar</a>';
    }
    return [
        btn,
    ].join('');
}


$tableConsultas.on('dbl-click-row.bs.table', function (e, row) {
    CarregaAgendamento(row.id);
});

window.EventoPaciente= {
    'click .pac': function (e, value, row) {
        $('#id_consulta_queixa').val(row.id);
        Atendimento(row.id, row.id_pac);
    }
};

window.EventoAtendimento= {
    'click .btn_atendimento': function (e, value, row) {
        get('', {'consulta' : row.id},'get');
    },
    'click .encerrar_atendimento': function (e, value, row) {
        // Ajax.Agenda.Consultas.StatusConsulta(Ret, {'consulta': row.id, 'status': 'ATENDIDO'});
        $.ajax({
            url: '/agenda/consultas/StatusConsulta',
            data: {
                consulta: row.id,
                status: 'ATENDIDO'
            },
            method: 'GET',
        }).success(function Ret(data){
            if (data.success){
                var linha = $tableConsultas.bootstrapTable('getRowByUniqueId', row.id);
                linha.stt = data.success.stt;
                linha.status = data.success.status;
                $tableConsultas.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
            }
        });
    }
};


function TabelaMedico(tipo){
    if (atdXhr) { atdXhr.abort(); }
    var seq = ++atdSeq;
    atdXhr = $.ajax({
        // com a barra final: sem ela cada atualização passava por um redirecionamento
        url: '/atendimento/AtendimentoMedico/',
        data: {
            tipo: tipo
        },
        method: 'GET',
    }).always(function () {
        if (seq === atdSeq) { atdXhr = null; }
    }).success(function Ret(data){
        if (seq !== atdSeq) { return; }   // resposta de um pedido já substituído
        atdVersao = data.versao === undefined ? '' : data.versao;
        var i,
            Agenda = data.Agenda,
            consultas = $tableConsultas.bootstrapTable('getData');
        $('#id_aguardando').html(data.aguardando);
        $('#id_atendidos').html(data.atendidos);
        $('#id_faltas').html(data.faltas);
        $('#titAgendados').html(data.total);
        $('#id_agendados').html(data.agendados);
        $('#id_encaixes').html(data.encaixes);
        $('#id_balcao').html(data.balcao);
        if(Agenda?.length <= 0){
            $tableConsultas.bootstrapTable('removeAll');
        } else {
            if(!_.isEqual(Agenda, consultas)){
                if (!(JSON.stringify(Agenda) === JSON.stringify(consultas))){
                    if (Agenda?.length > 0) {
                        $.ajax({
                            url: '/agenda/consultas/Graficos.Agendamentos',
                            method: 'GET',
                            success: (function (data) {
                                if (!data || !data.success) { return; }
                                myNewChart = new Chart(ctx).Line(data.success.dados, lineOptions);
                                $('#total_agendamentos').html(data.success.total);
                                if (data.success.atraso.length > 0) {
                                    $('#idAtrasoMedico').removeClass('hidden');
                                    $('#titAtraso').html(data.success.atraso);
                                } else {
                                    $('#idAtrasoMedico').addClass('hidden');
                                }
                            })
                        });
                    }

                    $tableConsultas.bootstrapTable('removeAll');
                    for (i=0; i<Agenda?.length; i++){
                        if (!(JSON.stringify(Agenda[i]) === JSON.stringify(consultas[i]))){
                            $tableConsultas.bootstrapTable('insertRow', {index: Agenda[i].id, row: Agenda[i]});
                        }
                    }
                } else {
                    for (i=0; i<Agenda?.length; i++){
                        if (!(JSON.stringify(Agenda[i]) === JSON.stringify(consultas[i]))){
                            $tableConsultas.bootstrapTable('updateByUniqueId', {id: id, row: Agenda[i]});
                        }
                    }
                }
            }
        }
    });
}

/* Fim BootstrapTable Consulta */

function ImprimeAtestado(){
    var id_consulta = $('#_id_consulta').val();
    if (!formChanged($('.classAtestado'))){
        SalvaAtestado()
    }
    printPDF('/atendimento/ImprimeAtestado?id_consulta='+id_consulta);
}

/* Definição da Switchery */
var elem_Age = document.querySelector('#id_Age');
var switchery_Age = new Switchery(elem_Age, { color: '#BFBFBF', size: 'small' });

var elem_Agu = document.querySelector('#id_Agu');
var switchery_Agu = new Switchery(elem_Agu, { color: '#FCEC98', size: 'small' });

var elem_Att = document.querySelector('#id_Att');
var switchery_Att = new Switchery(elem_Att, { color: '#AEF291', size: 'small' });

var elem_Atd = document.querySelector('#id_Atd');
var switchery_Atd = new Switchery(elem_Atd, { color: '#90D5F8', size: 'small' });

var elem_Flt = document.querySelector('#id_Flt');
var switchery_Flt = new Switchery(elem_Flt, { color: '#F49797', size: 'small' });
/* Definição da Switchery */

$('input[type=checkbox]').change(function(){
    AtualizaTabela()
});

var lineOptions = {
    scaleShowGridLines: true,
    scaleGridLineColor: "rgba(0,0,0,.05)",
    scaleGridLineWidth: 1,
    bezierCurve: true,
    bezierCurveTension: 0.4,
    pointDot: true,
    pointDotRadius: 4,
    pointDotStrokeWidth: 1,
    pointHitDetectionRadius: 20,
    datasetStroke: true,
    datasetStrokeWidth: 2,
    datasetFill: true,
    responsive: true
};
