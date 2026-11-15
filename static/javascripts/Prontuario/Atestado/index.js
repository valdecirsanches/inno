var silent;

function atestado_libera_edicao(action) {
    $('#div_atestado *').prop('disabled', !action);
    if (!action) {
        $('.btn-atestado').addClass('disabled');
    } else {
        $('.btn-atestado').removeClass('disabled');
    }
}

atestado_libera_edicao(false);

class Atestado extends MyObject {
    async store(data, cb) {
        if (data.cid) {
            data.cid = data.cid.join();
        }
        await super.store(data, cb);
    }

    async setObject(data){
        await super.setObject(data);
        await changeCID10(data.cid, this.form.find('[name=cid]'));
    }
}   

const atestado = new Atestado(
    'classAtestado',
    (typeof $tableAtestados !== 'undefined' ? $tableAtestados : null),
    'atestado/'
);

async function AddAtestado() {
    atestado.clear();
    $('.classAtestado #id_fk_medico').val($('.classAtendimento #id_fk_medico_att').val());
    const resp = await api.post(`atestado/get-consulta/`, {id_consulta: $('.classAtendimento #id_fk_consulta_atual').val()});
    if (resp.data.success) {
        changeMedico(resp.data.success.fk_medico,$('.classAtestado #id_fk_medico'));
        await atestado.setObject({
            ...atestado.object,
            fk_medico: resp.data.success.fk_medico.id,
            fk_consulta: resp.data.success.fk_consulta.id,
            fk_prontuario: resp.data.success.fk_paciente.id,
            fk_usuario: resp.data.success.fk_usuario.id,
            hora_chegada:resp.data.success.hora_chegada || resp.data.success.hora,
            hora_saida: agora().substring(11,16),
            dt_referencia: hoje(),
            para: 'C',
            volta: 'A',
            }
        );
        $('.classAtestado #id_cid10_atestado').empty().trigger('change');
    }
    atestado_libera_edicao(true);
    $('.classAtestado #id_requerente').focus();
}


async function ReadAtestado(id) {
    await atestado.index(id);
    changeMedico(atestado.object.fk_medico, $('.classAtestado #id_fk_medico'));
    changeCID10(atestado.object.cid, $('.classAtestado [name=cid]'));
    $('#id_emissor').html(atestado.object?.fk_usuario_nome || '');
    $('#id_data_salvo').html(atestado.object?.dataSalvo || '');

    atestado_libera_edicao(true);
}

async function UpdateAtestado(quiet) {
    silent=quiet || false;
    await atestado.submit();
    var id = atestado.object.id;
    if ($tableAtestados.bootstrapTable('getRowByUniqueId', id)) {
        $tableAtestados.bootstrapTable('updateByUniqueId', {id: id, row: atestado.object});
    } else {
        $tableAtestados.bootstrapTable('insertRow',{index: 0, row: atestado.object});
    }
    $tableAtestados.bootstrapTable('checkBy', {field: 'id', values: [atestado.object.id]});
    atestado_libera_edicao(true);
    $('#id_data_salvo').html(atestado.object?.dataSalvo || '');
}

function DeleteAtestado(id){
    swal({
        title: "Você tem certeza?",
        text: 'Está ação apagará este atestado do cadastro',
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#DD6B55",
        confirmButtonText: "Sim, remover!",
        cancelButtonText: "Não",
        // closeOnConfirm: true
    }).then(async function () {
        await atestado.delete(id);
        await atestado.clear(id);
        $tableAtestados.bootstrapTable('remove', {field: 'id', values: [id]});
        atestado_libera_edicao(false            );

    });
}