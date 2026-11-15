class classRemedio extends MyObject {

    // async store(data, cb) {
    //     data.fk_prescricao = prescricao.object.id;
    //     await super.store(data, cb);
    //     // $('#id_remedio').val("");
    //     // await CarregaPrescricoes();
    // }
}



const remedio = new classRemedio(
    'classPrescricaoRemedio',
    (typeof $tablePrescricaoRemedios !== 'undefined' ? $tablePrescricaoRemedios : null),
    'prescricao/remedio/'
);


async function AddRemedio() {
    await remedio.clear();
    remedio.setObject({
        ...remedio.object,
        fk_prescricao: prescricao.object.id,
    });
    $('.pnl-remedio').removeClass('hide');
    $('.classPrescricaoRemedio #id_nome').focus();
}


async function ReadRemedio(id) {
    await remedio.index(id);
    $('.pnl-remedio').removeClass('hide');
    $('#data_salvo').html(remedio.object.dataSalvo);
    $('.classPrescricaoRemedio #id_nome').focus();
}

async function UpdateRemedio(quiet) {
    silent=quiet || false;
    var id = remedio.object.id;
    await remedio.submit();
    if ($tablePrescricaoRemedios.bootstrapTable('getRowByUniqueId', id)) {
        $tablePrescricaoRemedios.bootstrapTable('updateByUniqueId', {id: id, row: remedio.object});
    } else {
        $tablePrescricaoRemedios.bootstrapTable('insertRow',{index: 0, row: remedio.object});
    }
    // $('.pnl-remedio').addClass('hide');
}


async function CancelaRemedio() {
    if (remedio.object.id > 0){
        ReadRemedio(remedio.object.id);
    } else {
        await remedio.clear();
        $('.classProntuarioRemedio #id_cid10_remedio').empty().trigger('change');
    }
}

function DeleteRemedio(id){
    swal({
        title: "Você tem certeza?",
        text: 'Está ação removerá esta prescrição do cadastro',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
    }).then(async function () {
        // await api.post(`remedio/del-remedios/`, {id_remedio: id});
        await remedio.delete(id);
        remedio.clear();
        $tablePrescricaoRemedios.bootstrapTable('remove', {field: 'id', values: [id]});
    });
}
