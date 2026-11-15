

function AtualizaTabela(){
    var dateData = $dataAgenda.datepicker('getDate'),
        data = dateData.getFullYear()+'-'+(dateData.getMonth()+1)+'-'+dateData.getDate(),
        id_medico = $('#medico').val();
    TabelaMedico(data, id_medico);
}

/* Inicio BootstrapTable Consulta */
var $tableConsultas = $('#tabelaConsultas');


function rowStyle(row, index) {
    var c = '';
    if (row.status === 'LIVRE') {c = c + ' Livre ';}

    if (!$('#id_'+row.periodo).is(':checked')) {
        return { classes: row.periodo + c + ' hide ' ,  };
    } else {
        return {classes: row.periodo + c,};
    }
    if (row.cor) {
        return { css: { "background-color": row.cor } };
    }
    return {};
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
         <span class="text-lg">${value.substring(0, 5)}</span>
        </a>
       
        `
    ].join('');
}


window.EventoHora = {
    'click .hora': function (e, value, row) {
        ShowAgenda(row.id);
        // CarregaAgendamento(row.id);
    }

};

function FormatoHoraChegada(value, row, index){
    if (!row.fk_paciente.id > 0) {
        return [];
    }
    var s = '';
    if(value) {s = value.substring(0, 5)};
    return [
        `
        <a class="hora_chegada"
           title="Chegada do paciente (ordem de Horário)">
        <i class="fa fa-car"></i>
        <span class="text-lg text-white">${s}</span>
        </a>    
        `
    ].join('');
}

window.EventoHoraChegada = {
    'click .hora_chegada': async function (e, value, row) {
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
                    preConfirm:  function (result) {
                        return new Promise(async function (resolve) {
                            resolve();
                            const response = await api.post(`${objagenda.uri(row.id)}grava_chegada/?acao=RESTAURA`);
                            if ($tableConsultas) {
                                var linha = $tableConsultas.bootstrapTable('getRowByUniqueId', row.id);
                                linha.hora_chegada = '';
                                linha.status = response.data.success;
                                $tableConsultas.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
                            }
                            if ($tablePacienteConsulta) {
                                var linha = $tablePacienteConsulta.bootstrapTable('getRowByUniqueId', row.id);
                                linha.hora_chegada = '';
                                linha.status = response.data.success;
                                $tablePacienteConsulta.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
                            }
                            toastr.success('Procedimento executado com sucesso!','OK');
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
            // await objagenda.index(row.id);
            var linha = '';
            const response = await api.post(`${objagenda.uri(row.id)}grava_chegada/?acao=GRAVAR`);
            if ($tableConsultas) {
                linha = $tableConsultas.bootstrapTable('getRowByUniqueId', row.id);
                linha.hora_chegada = response.data.success.hora_chegada;
                linha.status = response.data.success.status
                $tableConsultas.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
            }
            if ($tablePacienteConsulta){
                linha = $tablePacienteConsulta.bootstrapTable('getRowByUniqueId', row.id);
                linha.hora_chegada = response.data.success.hora_chegada;
                linha.status = response.data.success.status
                $tablePacienteConsulta.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
            }
            toastr.success('Hora de chegada gravado com sucesso!','Hora da chegada:');
        }
    }
};

function FormatoStatus(value, row, index){
    if (!row.fk_paciente.id > 0) {
        return [];
    }
    return [`
        <a class="status"
           title="Status">
        <i class="fa fa-clock-o"></i>
        </a>
        `
    ].join('');
}



window.EventoStatus = {
    'click .status': async function (e, value, row) {
        const response = await api.post(`agenda/${row.id}/grava_status/`);
        if (response.data.success){
            var linha= '';
            if ($tableConsultas) {
                linha = $tableConsultas.bootstrapTable('getRowByUniqueId', row.id);
                linha.stt = response.data.success.stt;
                linha.status = response.data.success.status;
                $tableConsultas.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
            }
            if ($tablePacienteConsulta) {
                linha = $tablePacienteConsulta.bootstrapTable('getRowByUniqueId', row.id);
                linha.stt = response.data.success.stt;
                linha.status = response.data.success.status;
                $tablePacienteConsulta.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
            }
        }
    }
};



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




function FormatoEspecial(value, row, index){
    if ((!row.fk_paciente.id > 0) || !(row.necesp)) {
        return [];
    }
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




function FormatoFone(value, row, index){
    return [
        `<span style="font-size: 10px">${row.fk_paciente.celular || ''}</span>`
    ].join('');
}

function FormatoConvenio(value, row, index){
    b = ''; //FormatoFin(value, row, index)
    return [
        `
        <div>
            <div class="inline">
                <span style="font-size: 9px">${row.fk_convenio.nome.substring(0, 25)}</span><br/>
                <span style="font-size: 8px">${row.fk_procedimento.nome.substring(0, 25)}</span>
            </div> &nbsp;&nbsp;&nbsp;
            <div class="inline">
                ${b}
            </div>
        </div>
        `
    ].join('');
}




$tableConsultas.on('dbl-click-row.bs.table', function (e, row) {
    ShowAgenda(row.id);
    // CarregaAgendamento(row.id);
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

function FormatoPaciente(value, row, index) {
    if (!row.fk_paciente.id > 0) {
        return [];
    }
    var s = `
        <a class="paciente" 
           title="Cadastro do paciente (Click para acessar)">
           <i class="fa fa-ticket">${row.fk_paciente.codigo}</i>
        </a>
        `
    return [s].join('');
}

window.EventoPaciente = {
    'click .paciente': async function (e, value, row) {
        await ShowPaciente(row.fk_paciente.id);
        $tablePacienteConsulta.bootstrapTable('refresh',{query: {paciente: paciente.object.id}});
    }
};



function FormatoProntuario(value, row, index){

    const bc = `<a class="btn btn-default" onclick="swal('${row.whatsapp_motivo}')" title="Justificativa de ausência">
                <i class="fa fa-comments"></i>
                </a>`

    if (!row.fk_paciente.id > 0) {
        return []
    }
    var m = '';
    if (!medico.object.medico){
        m = `<br/><span style="color: red; font-size: 8px">${row.fk_medico.nome}</span>`;
    }
    var s = `
        <a class="prontuario" 
           title="Prontuario (Click para acessar)">
           ${row.fk_paciente.nome} ${m}
           
           
        </a> &nbsp;&nbsp;&nbsp; ${row.whatsapp_motivo ? bc : ''}
        `
    return [s].join('');
}

window.EventoProntuario= {
    'click .prontuario': function (e, value, row) {
        get('/atendimento/', {consulta: row.id, id_paciente: row.fk_paciente.id}, 'get');
    }
};

window.EventoChegada = {
    'click .hr_chegada': async function (e, value, row) {
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
                    preConfirm: async function (result) {
                        return new Promise(async function (resolve) {
                            resolve();
                            await objagenda.index(row.id);
                            const response = await api.post(`${objagenda.uri()}grava_chegada/`);
                            if (response.data.success) {
                                AtualizarAgenda();
                                toastr.success('Procedimento executado com sucesso!','OK');
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
            await objagenda.index(row.id);
            const response = await api.post(`${objagenda.uri()}grava_chegada/`);

            if(response.data.success){
                var linha = $tableConsultas.bootstrapTable('getRowByUniqueId', row.id);
                linha.hr_chegada = response.data.success.hr_chegada;
                linha.status = 'AGUARDANDO'
                $tableConsultas.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
                toastr.success('Hora de chegada gravado com sucesso!','Hora da chegada:');
            }
        }
    }
};

//
//
// function TabelaMedico(data, id_medico){
//     $.ajax({
//         url: '/agenda/consultas/CarregaConsultas/',
//         data: {
//             data: data,
//             id_medico: id_medico,
//             Livre: $('#id_Livre').is(':checked'),
//             All: true,
//         },
//         method: 'POST',
//         success: Ret,
//     });
//     function Ret(data){
//         var i,
//             Agenda = data.Agenda,
//             consultas = $tableConsultas.bootstrapTable('getData'),
//             Livre = $('#id_Livre').is(':checked'),
//             All = $('#id_All').is(':checked'),
//             A = $('#id_A').is(':checked'),
//             B = $('#id_B').is(':checked'),
//             C = $('#id_C').is(':checked');
//
//         $('#id_aguardando').html(data.aguardando);
//         $('#id_atendidos').html(data.atendidos);
//         $('#id_faltas').html(data.faltas);
//         $('#titAgendados').html(data.total);
//         $('#id_agendados').html(data.agendados);
//         $('#id_encaixes').html(data.encaixes);
//         $('#id_balcao').html(data.balcao);
//
//         if (data.receita) {
//             $('#btnNovoReceita').removeClass('hidden');
//         } else {
//             $('#btnNovoReceita').addClass('hidden');
//         }
//
//         $('#id_msgAgenda').html('');
//
//         $('#btnDesativaAgenda').addClass('hidden');
//         if ($('#medico').val() > '0'){
//             $('#btnDesativaAgenda').removeClass('hidden');
//         }
//         if(Agenda.length <= 0){
//             if ((A || B || C) && (All || Livre) && !data.receita){
//                 $('#id_msgAgenda').html('Agenda não aberta para esta data');
//                 // $('#btnAbrirAgenda').removeClass('hidden');
//             } else {
//                 // $('#btnAbrirAgenda').addClass('hidden');
//             }
//             $tableConsultas.bootstrapTable('removeAll');
//         } else {
//             // $('#btnAbrirAgenda').addClass('hidden');
//             // if(!_.isEqual(Agenda, consultas)){
//             if (!(JSON.stringify(Agenda) === JSON.stringify(consultas))) {
//                 $tableConsultas.bootstrapTable('removeAll')
//                 $tableConsultas.bootstrapTable('load',Agenda)
//             }
//         }
//     }
// }


/* Fim BootstrapTable Consulta */

/* Inicio BootstrapTable Agenda Paciente */
//
// var $tableAgendaPaciente = $('#tabelaAgendaPaciente');
//
// $tableAgendaPaciente.on('dbl-click-row.bs.table', function (e, row) {
//     TabelaMedico(row.dt, row.fk_medico.id);
//     Medico.setValue(row.fk_medico.id);
//     $dataAgenda.datepicker('setDate', row.data);
//     $("#modalConsulta").modal("hide");
// });

/* Fim BootstrapTable Agenda Paciente */

function ImprimeAgenda(){
    var dateData = $dataAgenda.datepicker('getDate'),
        myDate = dateData.getFullYear()+'-'+(dateData.getMonth()+1)+'-'+dateData.getDate(),
        medico = $('#medico').val();
    printPDF('ImprimeAgenda?dt='+myDate+'&medico='+medico)
}

var campos = '#formCadastrar input, #formCadastrar select, #formCadastrar textarea';

function AbrirAgenda(){
    var id_medico = Medico.getValue(),
        dateData = $dataAgenda.datepicker('getDate'),
        myDate = dateData.getFullYear() + '-' +
            strzero((dateData.getMonth() + 1),2) + '-' +
            strzero(dateData.getDate(), 2),
        myDate_format = strzero(dateData.getDate(), 2)+'/'+(strzero((dateData.getMonth() + 1),2))+'/'+dateData.getFullYear();

    if (id_medico === 0){
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
    var necesp = row.fk_paciente?.necesp || ''
    if (necesp ==='CRIANÇA') {
        b = `<img src="${f}/criancas.png" style="width: 32px"/>`
    } else if (necesp ==='IDOSO') {
        b = `<img src="${f}/idoso.png" style="width: 32px" />`
    } else if (necesp ==='NECESSIDADE ESPECIAL') {
        b = `<img src="${f}/necessidades.png" style="width: 32px"/>`
    } else if (necesp ==='CADEIRANTE') {
        b = `<img src="${f}/cadeirante.png" style="width: 32px"/>`
    } else if (necesp ==='DEFICIENTE VISUAL') {
       b = `<img src="${f}/visual.png" style="width: 32px"/>`
    } else if (necesp ==='DEFICIENTE AUDITIVO') {
        b = `<img src="${f}/auditivo.png" style="width: 32px"/>`
    } else if (necesp ==='RETORNO CIRURGIA') {
        b = `<img src="${f}/cirurgia.png" style="width: 32px" />`
    }
    b = b+`<span style="font-size: 6px;">${necesp}</span>`
    return [b]
}

