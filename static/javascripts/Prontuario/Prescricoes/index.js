class classPrescricao extends MyObject {

}

const prescricao = new classPrescricao(
    'classPrescricao',
    (typeof $tablePrescricao !== 'undefined' ? $tablePrescricao : null),
    'prescricao/'
);


function libera_edicao(action) {
    $('#div_prescricao *').prop('disabled', !action);
    if (!action) {
        $('.btn-remedio').addClass('disabled');
        $('.btn-prescricao').addClass('disabled');
    } else {
        $('.btn-remedio').removeClass('disabled');
        $('.btn-prescricao').removeClass('disabled');
    }
}

libera_edicao(false);

async function AddPrescricao() {
    //remedio.clear();
    CarregaPrescricaoRemedios(0);
    await prescricao.clear();
    const resp = await api.post(`prescricao/get-consulta/`, {id_consulta: $('.classAtendimento #id_fk_consulta_atual').val()});
    if (resp.data.success) {
        changeMedico(resp.data.success.fk_medico,$('.classProntuarioPrescricao #id_fk_medico'));
        prescricao.setObject({
            ...prescricao.object,
            fk_medico: resp.data.success.fk_medico,
            fk_consulta: resp.data.success.fk_consulta.id,
            fk_prontuario: resp.data.success.fk_paciente.id,
            data_salvo: resp.data.success.data_salvo,
            data_prescricao: resp.data.success.data,
        });
    }
    $('#div_remedios').removeClass('hide');
    libera_edicao(true);
    $('#prescricao_data_salvo').html('     <span class="badge badge-primary">    N o v o   </span> (Clique em quelquer área da tela para remédios)');
    $('.classPrescricao #id_prescricao').focus();
}


async function ReadPrescricao(id) {
    await prescricao.index(id);
    $('#prescricao_data_salvo').html(prescricao.object.dataSalvo);
    libera_edicao(true);
    $('#div_remedio').addClass('hide');
    $('#div_remedios').removeClass('hide');
    $('.classPrescricao #id_prescricao').focus(); //prop('focus',true);
    CarregaPrescricaoRemedios(prescricao.object.id);
}

async function UpdatePrescricao(quiet) {
    silent=quiet || false;
    var id = prescricao.object.id;
    await prescricao.submit();
    if ($tablePrescricao.bootstrapTable('getRowByUniqueId', id)) {
        $tablePrescricao.bootstrapTable('updateByUniqueId', {id: id, row: prescricao.object});
    } else {
        $tablePrescricao.bootstrapTable('insertRow',{index: 0, row: prescricao.object});
    }
    $tablePrescricao.bootstrapTable('checkBy', {field: 'id', values: [prescricao.object.id]});
    $('#div_remedios').removeClass('hide');

}


function DeletePrescricao(id){
    swal({
        title: "Você tem certeza?",
        text: 'Está ação removerá esta prescrição do cadastro',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
    }).then(async function () {
        await api.post(`prescricao/del-remedios/`, {id_prescricao: id});
        await prescricao.delete(id);
        prescricao.clear();
        $tablePrescricao.bootstrapTable('remove', {field: 'id', values: [id]});
        // $('#div_remedios').addClass('hide');
        CarregaPrescricaoRemedios(0);
        $('#div_remedio').addClass('hide');
        libera_edicao(false)
    });
}
