
var $tablePacienteConsulta = $('#tabelaPacienteConsulta');

function rowStylePacienteConsulta(row, index) {
    return {
        classes: row.status
    };
}

function FormatoPacienteConsultaStatus(value, row, index){
    return [
        `
        <a class="status ml10" title="Status">
        <span>${row.status}</span>
        </a>
        `
    ].join('');
}

function FormatoPacienteConsultaChegada(value, row, index){
    if (!row.fk_paciente) {
        return [];
    }
    var s = row.hora_chegada ? row.hora_chegada : '';
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

window.PacienteConsultaEvents = {
    'click .status': async function (e, value, row) {
        await objagenda.index(row.id);
        const response = await api.post(`${objagenda.uri()}grava_status/`);
        if (response.data.success) {
            var linha = $tablePacienteConsulta.bootstrapTable('getRowByUniqueId', row.id);
            linha.stt = response.data.success.stt;
            linha.status = response.data.success.status;
            $tablePacienteConsulta.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
        }
    },
    'click .hora_chegada': async function (e, value, row) {
        if (row.status !== 'AGENDADO' && row.status != 'FALTOU' ){

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
                        return new Promise(async function (resolve) {
                            resolve();
                            await objagenda.index(row.id);
                            const response = await api.post(`${objagenda.uri()}grava_chegada/`);
                            if (response.data.success) {
                                $tablePacienteConsulta.bootstrapTable('refresh', {query: {paciente: row.paciente}});
                                toastr.success('Procedimento executado com sucesso!','OK');
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
            await objagenda.index(row.id);
            const response = await api.post(`${objagenda.uri()}grava_chegada/`);

            if(response.data.success){
                var linha = $tablePacienteConsulta.bootstrapTable('getRowByUniqueId', row.id);
                linha.hr_chegada = response.data.success.hr_chegada;
                linha.status = 'AGUARDANDO'
                $tablePacienteConsulta.bootstrapTable('updateByUniqueId', {id: linha.id, row: linha});
                toastr.success('Hora de chegada gravado com sucesso!','Hora da chegada:');
            }
        }
    }
};


$tablePacienteConsulta.on('dbl-click-row.bs.table', function (e, row) {
    get('/agenda/consultas/', {'id_medico': row.id_med, 'data': row.dt}, 'get');
});
/* Fim BootstrapTable Consulta */
