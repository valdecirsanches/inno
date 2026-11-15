
function exame_libera_edicao(action) {
    $('#div_exame *').prop('disabled', !action);
    if (!action) {
        $('.btn-exame').addClass('disabled');
    } else {
        $('.btn-exame').removeClass('disabled');
    }
}
exame_libera_edicao(false);
// $('#div_exame *').prop('disabled',true);

class myExame extends MyObject {
    async store(data, cb, silent) {
        if (data.cid10) {
            data.cid10 = data.cid10.join();
        }
        await super.store(data, cb, silent);
    }

    async setObject(data){
        await super.setObject(data);
        await changeCID10(data.cid10, this.form.find('[name=cid10]'));
    }
}

const exame = new myExame(
    'classExame',
    (typeof $tableExames !== 'undefined' ? $tableExames : null),
    'exames/'
);

async function AddExame() {
    await exame.clear();
    const resp = await api.post(`exames/get-consulta/`, {id_consulta: $('.classAtendimento #id_fk_consulta_atual').val()});
    if (resp.data.success) {
        changeMedico(resp.data.success.fk_medico,$('.classExame #id_fk_medico'));
        exame.setObject({
            ...exame.object,
            fk_medico: resp.data.success.fk_medico,
            fk_consulta: resp.data.success.fk_consulta.id,
            fk_prontuario: resp.data.success.fk_paciente.id,
        });
    }
    $('.classExame #id_cid10_exames').empty().trigger('change');
    exame_libera_edicao(true);
    $('#exame_data_salvo').html('     <span class="badge badge-primary">    N o v o    </span>');
    $('.classExame #id_descricao_exames').focus();
}


async function ReadExame(id) {
    await exame.index(id);
    exame_libera_edicao(true);
    $('#exame_data_salvo').html(exame.object.dataSalvo);
}

async function UpdateExame(silent=false) {
    await exame.submit(silent=silent);
    if ($tableExames.bootstrapTable('getRowByUniqueId', exame.object.id)) {
        $tableExames.bootstrapTable('updateByUniqueId', {id: exame.object.id, row: exame.object});
    } else {
        $tableExames.bootstrapTable('insertRow',{index: 0, row: exame.object});
    }
    $tableExames.bootstrapTable('checkBy', {field: 'id', values: [exame.object.id]});
}

async function CancelaExame() {
    if (exame.object.id > 0){
        ReadExame(exame.object.id);
    } else {
        await exame.clear();
        $('.classExame #id_cid10_exames').empty().trigger('change');
    }
}

function DeleteExame(id){
    swal({
        title: "Você tem certeza?",
        text: 'Está ação apagará este exame do cadastro',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
    }).then(async function () {
        await exame.delete(id);
        exame.clear();
        $tableExames.bootstrapTable('remove', {field: 'id', values: [id]});
        // $('#id_fk_medico_div *').prop('disabled',false);
        exame_libera_edicao(false);
    });

}


